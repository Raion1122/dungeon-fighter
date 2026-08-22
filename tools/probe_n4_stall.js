#!/usr/bin/env node
/*
 * probe_n4_stall.js — 「シナリオ2 n4 のタイル (38,14) でパーティが停止する」件の調査プローブ
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ これは**調査の道具**であって検出器ではない (受入条件を持たない)。
 *   既存ドライバに調査用の枝を足さないための別ファイル。
 *
 * やること: 実プレイ (autoplay) を走らせ、**同じタイルに N 秒居座った瞬間**に
 *   heroAI の入力を丸ごと 1 回読み出す。stall の detail が持っていたのは
 *   hero.pathLen だけ = 「経路が引けていない」までしか分からないので、
 *   ①目標が居ない ②目標へ aStar が引けない ③早期 return で歩き出さない
 *   のどれかを**その場の生の値**で切り分ける。
 *
 * ⚠ heroAI の分岐は**再実装しない**。生の値を全部出したうえで「どの return に
 *   落ちたはず」かを最後に添えるだけ (道具の解釈であって契約ではない)。
 *
 * 使い方:
 *   node tools/probe_n4_stall.js                          # bandits-forest を 1 回
 *   node tools/probe_n4_stall.js --tries 3                # 停滞を捉えるまで最大 3 回リロード
 *   node tools/probe_n4_stall.js --qs "banditmap=0"       # 負のコントロール (#11 前の姿)
 *   node tools/probe_n4_stall.js --scen orc-fort --speed 15
 * オプション: --scen --speed --port --tries --hold <秒> --max <秒> --qs --headful --browser
 * exit 0=停滞を捉えた / 1=捉えられなかった / 2=環境不足
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');   /* ⚠ path.resolve 必須 (でないと全 404) */
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i + 1] : dflt;
}
const HEADFUL = process.argv.includes('--headful');
const PORT  = parseInt(arg('port', '9330'), 10);
const SCEN  = arg('scen', 'bandits-forest');
const SPEED = parseInt(arg('speed', '15'), 10);
const TRIES = parseInt(arg('tries', '1'), 10);
const HOLD  = parseInt(arg('hold', '8'), 10);     /* 何秒同じタイルなら「停滞」とみなすか */
const MAXS  = parseInt(arg('max', '300'), 10);    /* 1 回あたりの観測上限 (秒) */
const QS    = arg('qs', '');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[probe] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[probe] ブラウザが見つかりません'); process.exit(2);
}
/* ⚠ MIME を落とすと try/catch に飲まれて全 500 = 白紙になる */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── ページ側: 軽い位置だけの観測 (1 秒ごと。⚠ 重い evaluate を高頻度で回すと
 *    測定対象そのものが遅くなる = P9 の教訓) ──────────────────────────────── */
const TICK = () => {
  const g = (f, d) => { try { return f(); } catch (e) { return d; } };
  const T = g(() => TILE_SIZE, 96);
  return {
    px: g(() => Math.round(playerX), null), py: g(() => Math.round(playerY), null),
    tx: g(() => Math.floor((playerX + 48) / T), null),
    ty: g(() => Math.floor((playerY + 58) / T), null),
    node: g(() => currentNodeId, null),
    scen: g(() => scenarioId, null),
    enc:  g(() => !!encounterActive, false),
    halted: g(() => !!(dialogPaused || narrationHold || narrationPlaying || resultShown), false),
    over: g(() => !!(gameOver || dungeonCleared), false),
    alive: g(() => enemies.filter(e => e.alive).length, -1),
  };
};

/* ── ページ側: 停滞した瞬間の**全部入り** 1 回読み ───────────────────────────
 * ⚠ heroAI の分岐条件は写経しない。**heroAI が読む物そのもの**を読む。 */
const SNAP = () => {
  const g = (f, d) => { try { return f(); } catch (e) { return { __threw: String(e) } === null ? d : d; } };
  const gv = (f) => { try { const v = f(); return (v === undefined ? null : v); } catch (e) { return 'THREW:' + e.message; } };
  const T = gv(() => TILE_SIZE);
  const pCX = gv(() => playerX + 48), pCY = gv(() => playerY + 58);
  const pTX = Math.floor(pCX / T), pTY = Math.floor(pCY / T);
  const o = { T, pCX, pCY, pTX, pTY };

  o.flags = {
    gameStarted: gv(() => !!gameStarted), gameOver: gv(() => !!gameOver),
    dungeonCleared: gv(() => !!dungeonCleared), encounterActive: gv(() => !!encounterActive),
    encounterRunning: gv(() => !!encounterRunning), dialogPaused: gv(() => !!dialogPaused),
    narrationHold: gv(() => !!narrationHold), narrationPlaying: gv(() => !!narrationPlaying),
    heroSliding: gv(() => !!heroSliding), attackActive: gv(() => !!attackActive),
    counterActive: gv(() => !!counterActive), playerHitStun: gv(() => playerHitStun),
    exploreAllyTurnRunning: gv(() => !!exploreAllyTurnRunning),
    exploreEnemyTurnRunning: gv(() => !!exploreEnemyTurnRunning),
    nodeBusy: gv(() => !!nodeBusy),
  };
  /* ★候補① heroAI 冒頭の backline 待機 (ここは heroStuckTicks より**前**に return する
   *   ので、詰まるとワープ救済も脱出ウィグルも一切走らない) */
  o.backline = {
    inPosition: gv(() => !!isBacklineInPosition()),
    waitStartAt: gv(() => heroWaitForBacklineStartAt),
    waitedMs: gv(() => heroWaitForBacklineStartAt ? (Date.now() - heroWaitForBacklineStartAt) : 0),
    warpedThisWait: gv(() => !!heroBacklineWarpedThisWait),
  };
  o.stuck = {
    heroStuckTicks: gv(() => heroStuckTicks), heroWiggleUntil: gv(() => heroWiggleUntil),
    heroTurnPause: gv(() => heroTurnPause), heroDetourWaitTicks: gv(() => heroDetourWaitTicks),
    DETOUR_WAIT_LIMIT: gv(() => DETOUR_WAIT_LIMIT),
  };
  o.path = { len: gv(() => heroPath.length), goal: gv(() => heroPathGoal), ttl: gv(() => heroPathTTL) };
  o.graph = {
    node: gv(() => currentNodeId), forcedGoal: gv(() => heroForcedGoal),
    gateReached: gv(() => nodeGateReached), pendingExit: gv(() => nodePendingExit),
    settled: gv(() => !!isNodeSettled()),
  };
  /* ★heroAI の目標決定と**同じ順**に、同じ関数を呼ぶ (①敵 → ②ドロップ → ③出口 → ④未訪問部屋) */
  o.targets = {};
  o.targets.enemy = gv(() => { const e = findNearestAliveEnemy(); if (!e) return null;
    const s = e.def.displaySize;
    return { type: e.type, tx: Math.floor((e.x + s / 2) / T), ty: Math.floor((e.y + s / 2) / T),
             px: Math.hypot(pCX - (e.x + s / 2), pCY - (e.y + s / 2)).toFixed(0),
             los: !!hasLineOfSight(pCX, pCY, e.x + s / 2, e.y + s / 2) }; });
  o.targets.drop = gv(() => { const d = findNearestDrop(); if (!d) return null;
    return { tx: Math.floor(d.x / T), ty: Math.floor(d.y / T), kind: d.kind || d.type || null }; });
  o.targets.roomIdx = gv(() => findNextRoomGoal());
  o.targets.roomTile = gv(() => { const i = findNextRoomGoal();
    return i >= 0 ? nearestFloorTileIn(ROOMS[i]) : null; });
  o.unreachable = gv(() => [...unreachableDropTiles]);
  o.allies = gv(() => allies.map(a => ({ cls: a.classKey, alive: a.alive, hp: a.hp,
    tx: Math.floor((a.x + 48) / T), ty: Math.floor((a.y + 58) / T) })));
  o.enemiesAlive = gv(() => enemies.filter(e => e.alive).map(e => ({ type: e.type,
    tx: Math.floor((e.x + e.def.displaySize / 2) / T), ty: Math.floor((e.y + e.def.displaySize / 2) / T),
    hp: e.hp, inactive: !!e.inactive, passive: !!e.passiveNpc })));
  return o;
};

/* ── ページ側: 候補ごとに「本番の aStar」で歩数を測る ────────────────────────
 * ⚠ 到達可能性を自前 BFS で書かない (近傍の取り方が違うと永久に緑を返す)。
 *   仲間回避あり/なしの 2 本を測るのは heroAI が両方計算しているから。 */
const PATHS = (cands) => {
  const gv = (f) => { try { const v = f(); return (v === undefined ? null : v); } catch (e) { return 'THREW:' + e.message; } };
  const T = gv(() => TILE_SIZE);
  const pTX = Math.floor((playerX + 48) / T), pTY = Math.floor((playerY + 58) / T);
  const allyAvoid = gv(() => getUnitOccupiedTiles('player'));
  const pen = gv(() => heroRecentPenaltyMap());
  return cands.filter(c => c && c.tx != null).map(c => ({
    name: c.name, tx: c.tx, ty: c.ty,
    wall: gv(() => isTileWall(c.tx, c.ty)),
    ignoreAllies: gv(() => { const p = aStar(pTX, pTY, c.tx, c.ty, null, pen); return p ? p.length : 0; }),
    avoidAllies: gv(() => { const p = aStar(pTX, pTY, c.tx, c.ty, allyAvoid, pen); return p ? p.length : 0; }),
    /* 仲間もペナルティも外した「素の壁だけ」= 本当に地形として届くのか */
    bare: gv(() => { const p = aStar(pTX, pTY, c.tx, c.ty); return p ? p.length : 0; }),
  }));
};

/* ── ページ側: 盤面を目盛り付きで出す (⭐ 目盛りが無いとユーザーが「ここ」と指せない) ── */
const GRID = (pad) => {
  const gv = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  const T = gv(() => TILE_SIZE, 96);
  const pTX = Math.floor((playerX + 48) / T), pTY = Math.floor((playerY + 58) / T);
  const W = gv(() => MAP_W, 0), H = gv(() => MAP_H, 0);
  const c0 = Math.max(0, pTX - pad), c1 = Math.min(W - 1, pTX + pad);
  const r0 = Math.max(0, pTY - pad), r1 = Math.min(H - 1, pTY + pad);
  const occ = {};
  gv(() => { allies.forEach((a, i) => { if (a.alive)
    occ[Math.floor((a.x + 48) / T) + ',' + Math.floor((a.y + 58) / T)] = String(i + 1); }); }, null);
  gv(() => { enemies.forEach(e => { if (e.alive)
    occ[Math.floor((e.x + e.def.displaySize / 2) / T) + ',' + Math.floor((e.y + e.def.displaySize / 2) / T)] = 'E'; }); }, null);
  const fg = gv(() => heroForcedGoal, null);
  if (fg) occ[fg.tx + ',' + fg.ty] = 'G';
  occ[pTX + ',' + pTY] = '@';
  const rows = [];
  for (let r = r0; r <= r1; r++) {
    let line = '';
    for (let c = c0; c <= c1; c++) {
      const k = c + ',' + r;
      line += occ[k] ? occ[k] : (gv(() => isTileWall(c, r), true) ? '#' : '.');
    }
    rows.push({ r, line });
  }
  return { c0, c1, r0, r1, rows, pTX, pTY, W, H,
           rect: gv(() => (ROOMS && ROOMS[0]) ? ROOMS.map(x => x.rect || x) : null, null) };
};

function fmtGrid(g) {
  const out = [];
  const tens = [], ones = [];
  for (let c = g.c0; c <= g.c1; c++) { tens.push(String(Math.floor(c / 10) % 10)); ones.push(String(c % 10)); }
  out.push('      ' + tens.join(''));
  out.push('      ' + ones.join(''));
  for (const row of g.rows) out.push('  ' + String(row.r).padStart(3) + ' ' + row.line);
  out.push('  凡例: @=主人公 1..5=仲間 E=敵 G=出口ゴール #=壁 .=床');
  return out.join('\n');
}

/* ── ページ側: 「歩けない理由」を**分けて**出す + 敵スポーンの棚卸し ──────────
 * ⭐⭐⭐ 歩けない理由が複数あるのに「壁」と一語でまとめると必ず誤読を生む。
 *   isTileWall は (mapData===2) OR (閉じた扉) OR (情景プロップ) の 3 本の論理和なので、
 *   3 本を**別々に**返す。 */
const AUDIT = () => {
  const out = [];
  /* ⚠ 装置 assert: ノード一覧が取れない = 0 件が「欠陥なし」ではなく**空振り**。
   *   ノードの出所は RUN.graph.nodes (RUN.nodes ではない)。 */
  const nodes = (typeof RUN !== 'undefined' && RUN && RUN.graph && RUN.graph.nodes) ? RUN.graph.nodes : null;
  if (!nodes || !nodes.length) { out.push({ node: '(なし)', err: 'RUN.graph.nodes が空 = 空振り' }); return out; }
  for (const nd of nodes) {
    let rec = { node: nd.id, err: null };
    try {
      resetNodeState();
      currentNodeId = nd.id;
      buildNode(resolveNodeMapDef(nd.id), nd.id);
      const md = RUN.byId[nd.id].mapDef;
      rec.name = md.name;
      rec.doors = (typeof doorsForRender === 'function' ? doorsForRender() : [])
        .map(d => ({ tx: d.tx, ty: d.ty, dir: d.dir, state: d.state, to: d.to || null,
                     blocks: (window.DFMapDef ? !!DFMapDef.doorBlocks(d.state) : null) }));
      /* ★著者が書いた slots ではなく**本番が実際に湧かせる一覧** (ENEMY_SPAWNS) を見る。
       *   隠し要素の追加スポーンもここに入る。 */
      const sp = (typeof ENEMY_SPAWNS !== 'undefined' && ENEMY_SPAWNS) ? ENEMY_SPAWNS : [];
      rec.spawnCount = sp.length;
      rec.blocked = [];
      for (const s of sp) {
        const type = s[0], tx = s[1], ty = s[2];
        const wall = isTileWall(tx, ty);
        if (!wall) continue;
        rec.blocked.push({ type, tx, ty,
          mapData: (mapData[ty] ? mapData[ty][tx] : null),
          door: isDoorBlocking(tx, ty),
          scenery: (typeof obstacleTileMask !== 'undefined' &&
                    obstacleTileMask[ty * MAP_W + tx] === 1) });
      }
      /* 出口ゲートのタイルも一緒に出す (敵と重なっているかを人が読めるように) */
      rec.gates = [];
      for (const o of (nd.exits || [])) {
        if (!o || !o.at) continue;
        rec.gates.push({ to: o.to, dir: o.dir, tx: o.at[0], ty: o.at[1],
                         wall: isTileWall(o.at[0], o.at[1]) });
      }
    } catch (e) { rec.err = String(e && e.message || e); }
    out.push(rec);
  }
  return out;
};

async function runAudit(puppeteer, browserPath, profile) {
  const SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
  const only = arg('scen-only', null);
  const list = only ? [only] : SCENS;
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });
  let url = 'http://localhost:' + PORT + '/index.html';
  if (QS) url += '?' + QS.replace(/^[?&]+/, '');
  let bad = 0;
  for (const sid of list) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument((s) => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', s); } catch (e) {}
    }, sid);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
    const res = await page.evaluate(AUDIT);
    console.log('\n══ ' + sid + ' ══');
    for (const r of res) {
      if (r.err) { console.log('  ' + r.node + ': THREW ' + r.err); continue; }
      const gate = (r.gates || []).map(g => g.to + '→(' + g.tx + ',' + g.ty + ')' + (g.wall ? ' ⛔' : '')).join(' ');
      const dr = (r.doors || []).map(d => '(' + d.tx + ',' + d.ty + ')' + d.state + (d.blocks ? '塞' : '通')).join(' ');
      console.log('  ' + String(r.node).padEnd(3) + ' ' + String(r.name || '').padEnd(12) +
                  ' 湧き' + String(r.spawnCount).padStart(2) + '体  出口:' + (gate || '(なし)') +
                  '  扉:' + (dr || '(なし)'));
      for (const b of r.blocked) {
        bad++;
        const why = [b.door ? '閉じた扉' : null, b.scenery ? '情景プロップ' : null,
                     b.mapData === 2 ? 'mapData=2(岩)' : null].filter(Boolean).join(' + ') || '(不明)';
        console.log('      ⛔ ' + b.type + ' @(' + b.tx + ',' + b.ty + ') が歩けないマスに湧く → ' + why);
      }
    }
    await page.close();
  }
  await browser.close(); srv.close();
  console.log('\n[probe] 歩けないマスに湧く敵: 合計 ' + bad + ' 体');
  process.exit(bad > 0 ? 1 : 0);
}

function verdict(s) {
  /* ⚠ ここは**道具の解釈**。契約ではない。上に出した生の値が唯一の根拠。 */
  const f = s.flags, b = s.backline;
  if (f.encounterActive) return 'heroAI 冒頭 `if (encounterActive) return;` = 戦闘中 (探索停滞ではない)';
  if (f.heroSliding) return 'heroSliding = スライド中 (ハングしているのは slide 側)';
  if (f.exploreAllyTurnRunning || f.exploreEnemyTurnRunning) return '仲間/敵の探索ターンが回りっぱなし';
  if (f.attackActive || f.counterActive || f.playerHitStun > 0) return '攻撃/カウンター/ヒットストップ中';
  if (b.inPosition === false) return '★backline 待機 (isBacklineInPosition()=false)。ここは heroStuckTicks より前に return するのでワープ脱出が走らない';
  if (s.stuck.heroTurnPause > 0) return 'heroTurnPause 消化中 (通常は数 tick で抜ける)';
  const t = s.targets;
  if (!t.enemy && !t.drop && !s.graph.forcedGoal && (t.roomIdx == null || t.roomIdx < 0))
    return '★目標が 1 つも無い = heroAI の ④ で targetX=null して return (行き先そのものが無い)';
  if (s.graph.forcedGoal && !t.enemy && !t.drop)
    return '★出口 heroForcedGoal へ向かう分岐。aStar の歩数表を見よ (0 なら到達不能 → unreachable 登録して毎 tick return)';
  return '(上の生の値から判断してください)';
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_n4stall_');
  /* ★棚卸しモード: 実プレイを待たずに「歩けないマスに湧く敵」を 6 シナリオ全ノードで数える */
  if (process.argv.includes('--audit')) return runAudit(puppeteer, browserPath, profile);
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });
  let url = 'http://localhost:' + PORT + '/index.html?autoplay=' + SPEED + '&diag=1';
  if (QS) url += '&' + QS.replace(/^[?&]+/, '');
  console.log('[probe] ' + url + '   scen=' + SCEN + '  停滞判定=' + HOLD + '秒  上限=' + MAXS + '秒');

  let caught = false;
  for (let attempt = 1; attempt <= TRIES && !caught; attempt++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    /* ⚠ scen は autodebug の時しか効かない → 実プレイでは sessionStorage で指定する */
    await page.evaluateOnNewDocument((sid) => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    }, SCEN);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof mapData !== 'undefined' && typeof heroAI === 'function'", { timeout: 25000 });
    console.log('\n[probe] === 試行 ' + attempt + '/' + TRIES + ' 開始 ===');

    let lastKey = null, same = 0, t0 = Date.now(), lastNode = null;
    while ((Date.now() - t0) / 1000 < MAXS) {
      await sleep(1000);   /* ⭐ 1 秒間隔。150ms の evaluate はゲームを実測で遅くする */
      let k = null;
      try { k = await page.evaluate(TICK); } catch (e) { break; }
      if (!k || k.px == null) continue;
      if (k.node !== lastNode) { console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's] node=' +
        k.node + ' tile=(' + k.tx + ',' + k.ty + ') 生存敵=' + k.alive); lastNode = k.node; }
      if (k.over) { console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's] ラン終了 (gameOver/clear)'); break; }
      const key = k.tx + ',' + k.ty;
      const idle = !k.enc && !k.halted;
      if (idle && key === lastKey) same++; else { same = 0; lastKey = key; }
      if (idle && same >= HOLD) {
        console.log('\n★ 停滞を捕捉: node=' + k.node + ' tile=(' + k.tx + ',' + k.ty + ') px=(' +
                    k.px + ',' + k.py + ')  同一タイル ' + same + ' 秒  経過 ' +
                    Math.round((Date.now() - t0) / 1000) + 's');
        const s = await page.evaluate(SNAP);
        console.log('\n── フラグ ──\n' + JSON.stringify(s.flags));
        console.log('── backline ──\n' + JSON.stringify(s.backline));
        console.log('── スタック検知/休止 ──\n' + JSON.stringify(s.stuck));
        console.log('── heroPath ──\n' + JSON.stringify(s.path));
        console.log('── グラフ (ノード/出口) ──\n' + JSON.stringify(s.graph));
        console.log('── 目標候補 (heroAI と同じ関数・同じ順) ──\n' + JSON.stringify(s.targets));
        console.log('── 到達不能に登録済みのタイル ──\n' + JSON.stringify(s.unreachable));
        console.log('── 仲間 ──\n' + JSON.stringify(s.allies));
        console.log('── 生存敵 ──\n' + JSON.stringify(s.enemiesAlive));
        const cands = [];
        if (s.targets.enemy) cands.push({ name: '①敵', tx: s.targets.enemy.tx, ty: s.targets.enemy.ty });
        if (s.targets.drop) cands.push({ name: '②ドロップ', tx: s.targets.drop.tx, ty: s.targets.drop.ty });
        if (s.graph.forcedGoal) cands.push({ name: '③出口', tx: s.graph.forcedGoal.tx, ty: s.graph.forcedGoal.ty });
        if (s.targets.roomTile) cands.push({ name: '④未訪問部屋', tx: s.targets.roomTile.tx, ty: s.targets.roomTile.ty });
        if (s.path.goal) cands.push({ name: '(現 heroPathGoal)', tx: s.path.goal.tx, ty: s.path.goal.ty });
        const rows = await page.evaluate(PATHS, cands);
        console.log('\n── 本番 aStar の歩数 (0 = 到達不能) ──');
        console.log('  候補              tx  ty  isTileWall  素   仲間回避  仲間無視');
        for (const r of rows) console.log('  ' + String(r.name).padEnd(16) + String(r.tx).padStart(4) +
          String(r.ty).padStart(4) + '  ' + String(r.wall).padEnd(10) + '  ' + String(r.bare).padStart(3) +
          '  ' + String(r.avoidAllies).padStart(7) + '  ' + String(r.ignoreAllies).padStart(7));
        const g = await page.evaluate(GRID, 9);
        console.log('\n── 盤面 (グローバルなタイル座標の目盛り付き) ──');
        console.log(fmtGrid(g));
        console.log('\n── 道具の解釈 (契約ではない) ──\n  ' + verdict(s));
        if (errs.length) console.log('\n[probe] ⚠ page errors: ' + JSON.stringify(errs.slice(0, 5)));
        caught = true;
        break;
      }
    }
    if (!caught) console.log('[probe] 試行 ' + attempt + ': 停滞は観測されませんでした');
    await page.close();
  }
  await browser.close(); srv.close();
  process.exit(caught ? 0 : 1);
})().catch(e => { console.error('PROBE FAIL: ' + (e.stack || e.message)); process.exit(2); });
