#!/usr/bin/env node
/*
 * driver_mine_wall.js — 廃坑の「壁抜け」と ゴブリン戦車の「壁埋まり」の検証ドライバ (2026-08-20)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 直したもの (ユーザー要望 2 件)
 *   ① 廃坑内で壁を貫通して歩ける場所があった → 迂回するようにする
 *   ② ボス部屋のゴブリン戦車が洞窟にとどまれず、壁に埋まって岩の中を動いていた
 *
 * ■ 真因 (2026-08-20 に本番コードを headless で走らせて実測)
 *   ① 1 枚絵の作法① 「blocked マスクの外周 1 タイルは塞がない」の帯が、絵では岩・崖・樹林
 *      なのに歩けたまま残っていた (n0=106 / n1=120 マス)。**本番の aStar が実際にそこを
 *      近道として通っていた** (寄り道 s1→s2 の最短 7 歩のうち 5 歩が部屋の最上行)。
 *      → 絵側の宣言 sealRing で外周を塞ぐ。⚠ 塞いでよいのは blocked マスクを持つ絵だけ。
 *   ② 戦車の体は画面上 216x173px = 2.25x1.8 タイルを覆うのに、位置判定は**中心 1 マスの
 *      isTileWall だけ**だった。乱入位置 (55,21) は体の 9 マス中 6 マスが岩。
 *      → 体を 176px へ縮め (覆うタイルが 3x3 → 3x2)、湧き位置と突進を footprint 判定へ。
 *
 * ■ ⚠⚠ 縮小と不動はセット (これを外すと今より悪くなる)
 *   戦車は isBoss を持たないので、不動 (押し出されない) の根拠は displaySize >= 200 だけだった。
 *   176 へ落とすと質量が 1e6 → r² に落ち、**毎フレーム最大 6px ずつ仲間に押し出されて岩へ
 *   めり込む**。→ def.heavyOverlap === true の口を isHeavyOverlapUnit へ足して補償する。
 *   §2f は述語を、**§2g は挙動そのもの** (60 フレーム回して 1px も動かないこと) を測る。
 *
 * ■ 測り方の方針
 *   ⭐ 到達可能性は **本番の aStar をそのまま呼ぶ**。自前 BFS を書くと 4 方向/8 方向の違いで
 *     「実際には歩けない道」を繋がっていると報告する (P8 で実測済み)。
 *   ⭐ 「変わっていないこと」(§1d/§3) は数値の直書きではなく **?paintring=0 との A/B** で測る。
 *     撤退スイッチは STEP1 の追加分をまるごと旧挙動へ戻すので、素と 1 対 1 で比較できる。
 *   ⭐ 外周は「1 マスも歩けない」とは**言えない**。出口タイル (nodeGateTile) は門番が必ず
 *     通すので、n0 は 3 マス・n1 は 2 マス歩けたまま残る (塞ぐと部屋から出られなくなる)。
 *     → 測るのは「歩ける外周は出口タイルだけ」+「**歩ける外周どうしが隣り合わない**」
 *       (= 帯として通り抜けられない) という不変条件。件数の直書きではない。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate     | 注入する欠陥                                          | 赤くなるべき節
 *   PORT   | (素)       | —                                                     | —
 *   PORT+1 | noring     | sealRing を無視する                                   | §1a §1c
 *   PORT+2 | ringall    | blocked を持たない絵にも外周封鎖を効かせる            | §3b
 *   PORT+3 | centeronly | isBodyClear を中心 1 マス判定へ戻す                   | §2a §2c
 *   PORT+4 | nofallback | 合法タイルを探さず旧起点 (部屋の東端 = 外周) を返す   | §2a §2b
 *   PORT+5 | nomass     | heavyOverlap の口を殺す (= 176 のまま軽くなる)        | §2f §2g
 *
 * 使い方:
 *   node tools/driver_mine_wall.js
 *   node tools/driver_mine_wall.js --no-full   (§4 の autoplay 1 周を飛ばす)
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NO_FULL = flag('no-full');
/* ⚠ ポートは既存ドライバと 5 以上空ける。本ドライバは PORT..PORT+5 の **6 本**を掴む。
 *   9080-9085 が未使用であることは既存ドライバの --port 既定値一覧で実測 (2026-08-20。
 *   9070 は driver_diag_watchdog / 9060 は driver_grid_p9)。 */
const PORT = parseInt(arg('port', '9080'), 10);
/* ⚠ §4 は廃坑を 1 周する。P8 実測の直行 184s に戦車戦が乗るので上限は余裕を持たせる。
 *   短くすると「詰んだ」ではなく「まだ歩いている」で赤くなる = 別の理由で色が決まる。 */
const FULL_TIMEOUT_MS = parseInt(arg('fulltimeout', '600000'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
// ⚠ 置換後の長さを 1 文字以上ずらすこと ((0b) がバイト長で「同じ物を 2 回測っていない」を見る)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  noring: [
    '        const sealing = !!(p.sealRing && !PAINT_RING_OFF);',
    '        const sealing = false;   /* mut-noring */'],
  ringall: [
    '        const sealing = !!(p.sealRing && !PAINT_RING_OFF);',
    '        const sealing = !PAINT_RING_OFF;   /* mut-ringall */'],
  centeronly: [
    '      for (const t of unitBodyTiles(def, tx, ty)) if (isTileWall(t.tx, t.ty)) return false;',
    '      if (isTileWall(tx, ty)) return false;   /* mut-centeronly */'],
  /* 「合法タイル 0 のときの取り消しを殺す」の実効版。健全な盤面では合法タイルが 0 にならず
   * `return null` へ到達しないので、そこを差し替えても**空振りする**。代わりに旧実装の起点
   * (部屋の東端 = 外周 = 封鎖後は岩) をそのまま返させ、「岩盤へ湧かせる」欠陥を再現する。 */
  nofallback: [
    '      const per = (def.trampleTiles || 4);',
    '      const per = 4; return { tx: chariotSpawnBaseTx(), ty: kingTY };   /* mut-nofallback */'],
  nomass: [
    '      return !!(def && (def.isBoss || def.heavyOverlap === true || def.displaySize >= OVERLAP_BOSS_SIZE));',
    '      return !!(def && (def.isBoss || def.displaySize >= OVERLAP_BOSS_SIZE));   /* mut-nomass */'],
};
const MUT_ORDER = ['noring', 'ringall', 'centeronly', 'nofallback', 'nomass'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const SRC_INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MUT_SRC = {};
for (const k of MUT_ORDER) {
  const from = MUTATIONS[k][0], to = MUTATIONS[k][1];
  if (from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  const n = SRC_INDEX.split(from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + n + ' 箇所 → 負のコントロールが空振りする: '
      + JSON.stringify(from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = SRC_INDEX.split(from).join(to);
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置くこと。helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて **全 500** になり、症状は「シームが undefined」に見える。 */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (mutKey && u === '/index.html') {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey]); return;
        }
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

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function bootPage(browser, port, query, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: opts.vw || 1280, height: opts.vh || 900 });
  page.on('pageerror', e => errs.push('[:' + port + query + '] PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('[:' + port + query + '] CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((scen) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', scen);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    // 戦車の観測シーム (実装は window に載っていれば push する)
    window.__chariotProbe = [];
    window.__trampleProbe = [];
  }, opts.scen || 'goblin-mine');
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof isTileWall === 'function' && typeof aStar === 'function'",
    { timeout: 25000 });
  /* ⚠⚠ **startGame() を通さないと検出器が丸ごと沈黙する** (P7 で誤読しかけた)。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await sleep(300);
  return page;
}
/* 開いているダイアログ / 判定パネルを閉じる。
 * ⚠ 通さないと dialogPaused で heroAI ごと止まり、到達検出が永久に走らない。 */
async function closeDialogs(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) return true;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
      if (btns.length) btns[btns.length - 1].click();   // 末尾 = キャンセル (Esc と同じ経路)
      const ov = document.getElementById('skillCheckOverlay');
      if (ov && ov.classList.contains('show')) {
        const rb = document.getElementById('scRollBtn');
        if (rb) rb.click();
        ov.click();
      }
      document.body.click();
    });
    await sleep(320);
  }
  return await page.evaluate(() => !skillCheckActive && !dialogPaused);
}
async function gotoNode(page, id, viaDir, ms) {
  await page.evaluate((to, dir) => { window.__mwEnter = window.__graphRun.enter(to, dir); }, id, viaDir);
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate((n) => window.__graphRun.nodeId() === n, id)) { await closeDialogs(page); return true; }
    if (Date.now() - t0 >= ms) return false;
    await sleep(120);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ページ内で走らせる測定 (実装の関数だけを呼び、規則を写経しない)
// ══════════════════════════════════════════════════════════════════════════════
/* 外周の状態。★歩ける外周が「出口タイルだけ」で「互いに隣り合わない」ことを測る。 */
function RING_MEASURE() {
  const room = MAPDEF.rooms[0];
  const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
  const ring = [];
  for (let x = c1; x <= c2; x++) { ring.push([x, r1]); if (r2 !== r1) ring.push([x, r2]); }
  for (let y = r1 + 1; y <= r2 - 1; y++) { ring.push([c1, y]); if (c2 !== c1) ring.push([c2, y]); }
  const walk = ring.filter(t => !isTileWall(t[0], t[1]));
  // 出口タイル = 実装の nodeGateTile 1 本から導く (辺の中点の式をドライバへ写さない)
  const gates = [];
  for (const dir of ['up', 'down', 'left', 'right']) {
    try { const g = nodeGateTile(MAPDEF, dir); if (g) gates.push([g.tx, g.ty]); } catch (e) {}
  }
  const gk = new Set(gates.map(g => g[0] + ',' + g[1]));
  const walkKeys = new Set(walk.map(t => t[0] + ',' + t[1]));
  let adjacent = 0;
  for (const t of walk) {
    for (const d of [[1, 0], [0, 1]]) {
      if (walkKeys.has((t[0] + d[0]) + ',' + (t[1] + d[1]))) adjacent++;
    }
  }
  const pb = window.__paintBlockProbe();
  let floors = 0;
  for (let y = r1; y <= r2; y++) for (let x = c1; x <= c2; x++) if (!isTileWall(x, y)) floors++;
  return { rect: room.rect, ringAll: ring.length, walk: walk, gates: gates,
           walkNonGate: walk.filter(t => !gk.has(t[0] + ',' + t[1])), adjacent: adjacent,
           floors: floors, node: window.__graphRun ? window.__graphRun.nodeId() : null,
           probe: { ring: pb.ring, ringOff: pb.ringOff, skipGate: pb.skipGate, applied: pb.applied,
                    entries: pb.entries, onWall: pb.onWall, skipStart: pb.skipStart,
                    skipDoor: pb.skipDoor, skipSpawn: pb.skipSpawn, skipCorridor: pb.skipCorridor } };
}
/* n1 の主要区間を **本番の aStar** で測る。 */
function LEG_MEASURE() {
  const d = (window.__graphRun && window.__graphRun.detour) ? window.__graphRun.detour() : null;
  const boss = enemies.find(e => e.def && e.def.isBoss);
  const pt = (o) => ({ tx: o.tx, ty: o.ty });
  const pts = { start: { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) } };
  if (boss) pts.boss = { tx: Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE),
                         ty: Math.floor((boss.y + boss.def.displaySize / 2) / TILE_SIZE) };
  if (d) { for (const s of d.spots) pts[s.key] = pt(s); if (d.advance) pts.advance = pt(d.advance); }
  for (const e of window.__graphRun.exits()) pts['exit:' + e.dir + (e.back ? '(back)' : '')] = pt(e.at);
  const pairs = [['start', 'boss'], ['start', 's1'], ['s1', 's2'], ['s2', 's3'], ['s3', 's4'],
                 ['s4', 'advance'], ['start', 'exit:left(back)'], ['start', 'advance']];
  const out = {};
  for (const p of pairs) {
    const A = pts[p[0]], B = pts[p[1]];
    if (!A || !B) continue;
    const q = aStar(A.tx, A.ty, B.tx, B.ty, null, null);
    out[p[0] + '->' + p[1]] = q ? q.length : null;
  }
  // 装置: aStar が何でも通すわけではない (絵の岩の中へは届かない)
  const rock = aStar(pts.start.tx, pts.start.ty, 47, 4, null, null);
  return { pts: pts, legs: out, rockWall: isTileWall(47, 4), rockLeg: rock ? rock.length : null };
}
/* 起点から各敵スポーンまでの歩数 (順序つき)。§1d の A/B に使う。 */
function SPAWN_LEGS() {
  const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
  const out = [];
  for (const e of enemies) {
    if (!e.alive) continue;
    const tx = Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE);
    const ty = Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE);
    const p = aStar(start.tx, start.ty, tx, ty, null, null);
    out.push({ type: e.type, tx: tx, ty: ty, steps: p ? p.length : null });
  }
  out.sort((a, b) => (a.tx - b.tx) || (a.ty - b.ty));
  return { start: start, legs: out };
}
/* 盤面全体の歩けるマス数 (§3 の A/B に使う。**グローバルな件数ではなく同条件どうしの差分**)。 */
function WALKABLE_TOTAL() {
  let n = 0;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!isTileWall(x, y)) n++;
  const pb = window.__paintBlockProbe();
  return { walkable: n, mapW: MAP_W, mapH: MAP_H, entries: pb.entries, ring: pb.ring,
           applied: pb.applied, ringOff: pb.ringOff, paintings: roomPaintings.length,
           sealed: pb.perEntry.filter(e => e.sealRing).length,
           node: window.__graphRun ? window.__graphRun.nodeId() : null };
}
/* 戦車の湧き位置と突進 30 ターンの模擬 (実装の関数をそのまま呼ぶ)。 */
function CHARIOT_MEASURE() {
  const def = ENEMY_TYPES.goblinChariot;
  const room = MAPDEF.rooms[0];
  const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
  const boss = enemies.find(e => e.def && e.def.isBoss);
  if (!boss) return { err: 'no boss' };
  const bTX = Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE);
  const bTY = Math.floor((boss.y + boss.def.displaySize / 2) / TILE_SIZE);
  const spot = findChariotSpawnTile(bTX, bTY);
  const wallsAt = (tx, ty) => unitBodyTiles(def, tx, ty).filter(t => isTileWall(t.tx, t.ty)).length;
  if (!spot) {
    return { def: { size: def.displaySize, rx: def.bodyRatioX, ry: def.bodyRatioY, oy: def.bodyOffY },
             spot: null, cancelled: true, boss: { tx: bTX, ty: bTY }, rect: room.rect };
  }
  /* ⚠ 突進の目標は**ボスのタイル**にする。実プレイでパーティが居るのは玉座の前なので、
   *   測定時の playerX/playerY (入場地点) を目標にすると本番と違う向きを測ることになる。 */
  const target = { tx: bTX, ty: bTY };
  let cur = { tx: spot.tx, ty: spot.ty }, blockedRun = 0, advanced = 0, blocked = 0;
  const rounds = [];
  for (let i = 0; i < 30; i++) {
    const p = chariotChargePath(def, cur.tx, cur.ty, target.tx, target.ty, def.trampleTiles || 4);
    if (p.length === 0) {
      blocked++; blockedRun++;
      if (blockedRun >= 2) {
        const s = chariotTurnStep(def, cur.tx, cur.ty, target.tx, target.ty);
        blockedRun = 0;
        if (s) { cur = s; advanced++; rounds.push({ turn: true, tiles: 1, walls: wallsAt(s.tx, s.ty) }); continue; }
      }
      rounds.push({ blocked: true, tiles: 0, walls: 0 });
      continue;
    }
    blockedRun = 0; advanced++;
    rounds.push({ tiles: p.length, walls: p.reduce((n, t) => n + (wallsAt(t.tx, t.ty) > 0 ? 1 : 0), 0),
                  end: { tx: p[p.length - 1].tx, ty: p[p.length - 1].ty } });
    cur = p[p.length - 1];
  }
  const onRing = spot.tx === c1 || spot.tx === c2 || spot.ty === r1 || spot.ty === r2;
  const toBoss = aStar(spot.tx, spot.ty, bTX, bTY, null, null);
  return { def: { size: def.displaySize, rx: def.bodyRatioX, ry: def.bodyRatioY, oy: def.bodyOffY,
                  heavy: isHeavyOverlapUnit(def) },
           spot: spot, cancelled: false, boss: { tx: bTX, ty: bTY }, rect: room.rect,
           bodyN: unitBodyTiles(def, spot.tx, spot.ty).length, bodyWalls: wallsAt(spot.tx, spot.ty),
           onRing: onRing, toBoss: toBoss ? toBoss.length : null,
           rounds: rounds, advanced: advanced, blocked: blocked };
}
/* 不動の**挙動**。周囲へ仲間/敵を寄せて resolveUnitOverlaps を 60 フレーム回す。 */
function HEAVY_BEHAVIOR() {
  const def = ENEMY_TYPES.goblinChariot;
  const boss = enemies.find(e => e.def && e.def.isBoss);
  if (!boss) return { err: 'no boss' };
  const bTX = Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE);
  const bTY = Math.floor((boss.y + boss.def.displaySize / 2) / TILE_SIZE);
  /* ⚠⚠ 乱入位置を**そのまま使わない**。狭い場所だと「質量が重いから動かない」のか
   *   「壁に挟まって動けない」のか区別できず、測りたいもの (mass) と別の理由で緑になる
   *   (2026-08-20 に実際に踏んだ: 3x2 の窪みでは軽くしても 0px しか動かなかった)。
   *   → **周囲 8 方向すべてに体が収まる余地のあるタイル**を選ぶ。 */
  const room = MAPDEF.rooms[0];
  let spot = null;
  for (let y = room.rect[0]; y <= room.rect[2] && !spot; y++) {
    for (let x = room.rect[1]; x <= room.rect[3]; x++) {
      if (!isBodyClear(ENEMY_TYPES.goblinChariot, x, y)) continue;
      let ok = true;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!isBodyClear(ENEMY_TYPES.goblinChariot, x + d[0], y + d[1])) { ok = false; break; }
      }
      if (ok) { spot = { tx: x, ty: y }; break; }
    }
  }
  if (!spot) return { err: 'no open spot' };
  /* ⚠ 素の object を enemies へ push しない (parallel array が 10 本あり描画ループが落ちる)。
   *   本番の factory (createEnemy + createEnemyDom) を通す。 */
  const cart = createEnemy('goblinChariot', spot.tx, spot.ty);
  cart.everSeen = true; cart.inactive = false; cart.state = 'chase'; cart.hitStun = 0;
  enemies.push(cart);
  const idx = enemies.length - 1;
  createEnemyDom(idx, cart.def, cart.type);
  snapEnemyToTile(cart, spot.tx, spot.ty);
  // 周囲へ押し手を寄せる (仲間 + 非ボスの敵)。休止半径 = size*0.40 の内側へ食い込ませる
  const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
  let k = 0;
  const push = (o, size) => {
    if (k >= around.length) return;
    const d = around[k++];
    o.x = cart.x + (cart.def.displaySize - size) / 2 + d[0] * 30;
    o.y = cart.y + (cart.def.displaySize - size) / 2 + d[1] * 30;
    o.slideTargetTile = null; o.hitStun = 0;
  };
  for (const a of allies) { if (a.alive) push(a, a.def.displaySize); }
  for (const e of enemies) { if (e.alive && e !== cart && !e.def.isBoss) push(e, e.def.displaySize); }
  const pushers = k;
  const x0 = cart.x, y0 = cart.y;
  for (let i = 0; i < 60; i++) resolveUnitOverlaps();
  return { heavy: isHeavyOverlapUnit(def), pushers: pushers,
           moved: Math.max(Math.abs(cart.x - x0), Math.abs(cart.y - y0)),
           x0: x0, y0: y0, x1: cart.x, y1: cart.y };
}
/* 大型ユニットの heavy 判定 (§2h)。
 * ⚠⚠ 母集団を「displaySize >= 192」だけで採ると、**戦車が 176 へ縮んだ瞬間に母集団から
 *   消えて (2f) が空振りする** (2026-08-20 に実際に踏んだ)。仕様変更で母集団ごと消える
 *   検出器の典型なので、**印 (heavyOverlap) を持つ個体も母集団に足す**。 */
function HEAVY_TABLE() {
  const out = [];
  for (const k of Object.keys(ENEMY_TYPES)) {
    const d = ENEMY_TYPES[k];
    if (!d || !(d.displaySize >= 192 || d.heavyOverlap === true)) continue;
    out.push({ key: k, size: d.displaySize, isBoss: !!d.isBoss, mark: d.heavyOverlap === true,
               heavy: isHeavyOverlapUnit(d) });
  }
  out.sort((a, b) => (a.key < b.key ? -1 : 1));
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_minewall_');
  const browserPath = findBrowser();
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const errs = [];
  /* ★ autoplay の実プレイページ専用の受け皿。測定用ページは長く開きっぱなしにするので
   *   ゲーム内蔵の自動デバッグ [DIAG] が必ず鳴る。それはドライバ側の事情なので混ぜない。 */
  const playErrs = [];

  try {
    // ══ §0 装置 ═══════════════════════════════════════════════════════════════
    mark('§0 変異が素の配信に無く、変異ポートにだけ載っていること');
    {
      const get = (port) => new Promise((res, rej) => {
        http.get('http://localhost:' + port + '/index.html', r => {
          let b = ''; r.setEncoding('utf8');
          r.on('data', c => b += c); r.on('end', () => res(b));
        }).on('error', rej);
      });
      const pure = await get(PORT);
      for (const k of MUT_ORDER) {
        const body = await get(PORT_OF[k]);
        check('(0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
          pure.split(MUTATIONS[k][1]).length - 1 === 0 && body.split(MUTATIONS[k][1]).length - 1 === 1, '');
        check('(0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
          pure.length !== body.length, '素=' + pure.length + 'B / 変異=' + body.length + 'B');
      }
    }

    // ══ §1 外周 ═══════════════════════════════════════════════════════════════
    mark('§1 廃坑 n0/n1 の外周 1 タイルが塞がり、迂回するようになった');
    const page = await bootPage(browser, PORT, '?diag=1&intel=0', errs);
    await closeDialogs(page);
    const R0 = await page.evaluate(RING_MEASURE);
    check('(1z) 装置: __paintBlockProbe が ring / skipGate を数値で返す (検出器が空振りしていない)',
      typeof R0.probe.ring === 'number' && typeof R0.probe.skipGate === 'number' && R0.probe.ring > 0,
      JSON.stringify(R0.probe));
    check('(1a-n0) n0 の外周のうち歩けるのは**出口タイルだけ**',
      R0.walkNonGate.length === 0,
      'ring=' + R0.ringAll + ' 歩ける=' + R0.walk.length + ' 出口以外=' + JSON.stringify(R0.walkNonGate) +
      ' gates=' + JSON.stringify(R0.gates));
    check('(1a2-n0) 歩ける外周どうしが隣り合わない (帯として通り抜けられない)',
      R0.adjacent === 0, 'adjacent=' + R0.adjacent + ' walk=' + JSON.stringify(R0.walk));
    const S0 = await page.evaluate(SPAWN_LEGS);

    check('(1z2) 装置: n1 へ入れた', await gotoNode(page, 'n1', 'right', 20000), '');
    const R1 = await page.evaluate(RING_MEASURE);
    const L1 = await page.evaluate(LEG_MEASURE);
    check('(1a-n1) n1 の外周のうち歩けるのは**出口タイルだけ**',
      R1.node === 'n1' && R1.walkNonGate.length === 0,
      'node=' + R1.node + ' ring=' + R1.ringAll + ' 歩ける=' + R1.walk.length +
      ' 出口以外=' + JSON.stringify(R1.walkNonGate) + ' gates=' + JSON.stringify(R1.gates));
    check('(1a2-n1) 歩ける外周どうしが隣り合わない',
      R1.adjacent === 0, 'adjacent=' + R1.adjacent + ' walk=' + JSON.stringify(R1.walk));
    check('(1b) ★★外周を塞いでも n1 の主要区間が全部 **本番の aStar** で届く',
      Object.keys(L1.legs).length >= 7 && Object.values(L1.legs).every(v => v !== null),
      JSON.stringify(L1.legs));
    check('(1z3) 装置: aStar が何でも通すわけではない (絵の岩 (47,4) は壁で届かない)',
      L1.rockWall === true && L1.rockLeg === null, 'wall=' + L1.rockWall + ' leg=' + L1.rockLeg);
    /* ⭐ ここが「迂回するようになった」の直接の証拠。素の 7 歩は 5 歩が部屋の最上行だった。 */
    check('(1c) ★★s1→s2 が 7 歩 → 15 歩へ増えた (上段の足場を大回りするようになった)',
      L1.legs['s1->s2'] === 15, 's1->s2=' + L1.legs['s1->s2']);

    // ── §1d/§3a: 撤退スイッチとの A/B ────────────────────────────────────────
    mark('§1d/§3a ?paintring=0 との A/B (期待値の直書きではなく同条件どうしの差分)');
    const pageOff = await bootPage(browser, PORT, '?diag=1&intel=0&paintring=0', errs);
    await closeDialogs(pageOff);
    const R0off = await pageOff.evaluate(RING_MEASURE);
    const S0off = await pageOff.evaluate(SPAWN_LEGS);
    check('(3a) ?paintring=0 で n0 の外周が元どおり全部歩ける (撤退スイッチが効く)',
      R0off.probe.ringOff === true && R0off.walk.length === R0off.ringAll && R0off.probe.ring === 0,
      'ringOff=' + R0off.probe.ringOff + ' 歩ける=' + R0off.walk.length + '/' + R0off.ringAll +
      ' ring=' + R0off.probe.ring);
    check('(1d) ★n0 の内部経路 (起点 → 各敵) が 1 歩も変わらない',
      JSON.stringify(S0.legs) === JSON.stringify(S0off.legs),
      '素=' + JSON.stringify(S0.legs.map(l => l.steps)) + ' off=' + JSON.stringify(S0off.legs.map(l => l.steps)));
    check('(1z4) 装置: 起点が同じ (別の盤面どうしを比べていない)',
      JSON.stringify(S0.start) === JSON.stringify(S0off.start), JSON.stringify(S0.start));
    check('(1z5) 装置: 素では n0 の外周が実際に減っている (A/B の差が実在する)',
      R0.walk.length < R0off.walk.length,
      '素=' + R0.walk.length + ' / off=' + R0off.walk.length);
    await pageOff.evaluate(() => { window.__mwEnter = window.__graphRun.enter('n1', 'right'); });
    for (let i = 0; i < 160; i++) { if (await pageOff.evaluate(() => window.__graphRun.nodeId() === 'n1')) break; await sleep(120); }
    await closeDialogs(pageOff);
    const L1off = await pageOff.evaluate(LEG_MEASURE);
    check('(1c2) 装置: ?paintring=0 では s1→s2 が **7 歩** (= 外周を近道していた元の状態)',
      L1off.legs['s1->s2'] === 7, 's1->s2(off)=' + L1off.legs['s1->s2']);
    const sameLegs = ['start->boss', 'start->s1', 's2->s3', 's3->s4', 's4->advance', 'start->exit:left(back)'];
    check('(1e) ★s1→s2 以外の区間は 1 歩も変わらない (到達性を壊していない)',
      sameLegs.every(k => L1.legs[k] === L1off.legs[k]),
      sameLegs.map(k => k + ':' + L1.legs[k] + '/' + L1off.legs[k]).join(' '));
    await pageOff.close();

    // ══ §2 戦車 ═══════════════════════════════════════════════════════════════
    mark('§2 ゴブリン戦車が洞窟にとどまる (体で判定する)');
    const C1 = await page.evaluate(CHARIOT_MEASURE);
    check('(2z) 装置: 戦車の def が 176px + 実測比 3 値を持つ',
      C1.def && C1.def.size === 176 && C1.def.rx > 0.8 && C1.def.ry > 0.6 && C1.def.oy > 0.2,
      JSON.stringify(C1.def));
    check('(2a) ★★乱入位置で体が壁を **0 マス** 含む',
      !!C1.spot && C1.bodyWalls === 0 && C1.bodyN >= 4,
      'spot=' + JSON.stringify(C1.spot) + ' body=' + C1.bodyN + ' walls=' + C1.bodyWalls);
    check('(2b) 乱入位置が外周でなく、ボスまで本番の aStar で届く',
      !!C1.spot && C1.onRing === false && C1.toBoss !== null,
      'onRing=' + C1.onRing + ' toBoss=' + C1.toBoss + ' boss=' + JSON.stringify(C1.boss));
    /* ⚠ ここは**道のり (aStar の歩数)** で測る。直線距離で測ると、玉座の間へ細い口 1 本で
     *   しか繋がっていない n1 では 16 マス先を選んだのに道のり 28 歩 (7 ターン) になった。 */
    check('(2b2) 猶予がおおむね 2〜5 ターン (旧幾何の「床端から約 3 ターン」を保つ)',
      C1.toBoss !== null && C1.toBoss >= 8 && C1.toBoss <= 20,
      'toBoss=' + C1.toBoss + ' 歩 (突進 4 マス/ターン → ' + Math.ceil(C1.toBoss / 4) + ' ターン)');
    const first3 = (C1.rounds || []).slice(0, 3);
    check('(2c) ★★突進 1〜3 回目の**すべてのステップ**で体が壁を 0 マス含む',
      first3.length === 3 && first3.every(r => (r.walls || 0) === 0),
      JSON.stringify(first3));
    check('(2d) 乱入後 30 ターン以内に 1 度は前進する (無限 BLOCKED でない)',
      (C1.advanced || 0) >= 1, 'advanced=' + C1.advanced + ' blocked=' + C1.blocked);
    check('(2d2) BLOCKED が 3 ターン以上連続しない (回頭ターンが効いている)',
      (() => { let run = 0, mx = 0;
               for (const r of (C1.rounds || [])) { if (r.blocked) { run++; mx = Math.max(mx, run); } else run = 0; }
               return mx <= 2; })(),
      'rounds=' + JSON.stringify((C1.rounds || []).map(r => r.blocked ? 'X' : (r.turn ? 'T' : r.tiles)).join('')));

    // ══ §2b 縮小の補償 ════════════════════════════════════════════════════════
    mark('§2b 176px でも「押し出されない」ことの補償 (F4b)');
    const HT = await page.evaluate(HEAVY_TABLE);
    check('(2f) isHeavyOverlapUnit(戦車の def) === true',
      (HT.find(r => r.key === 'goblinChariot') || {}).heavy === true,
      JSON.stringify(HT.find(r => r.key === 'goblinChariot')));
    check('(2h) ★他の大型ユニットの heavy 判定が 1 体も変わらない (印は戦車だけ)',
      HT.filter(r => r.key !== 'goblinChariot').every(r => r.mark === false &&
        r.heavy === (r.isBoss || r.size >= 200)),
      HT.map(r => r.key + ':' + r.size + (r.heavy ? '=H' : '=-') + (r.mark ? '*' : '')).join(' '));
    check('(2h2) 装置: 大型ユニットを 10 体以上見ている (母集団が空でない)',
      HT.length >= 10, 'n=' + HT.length);
    const HB = await page.evaluate(HEAVY_BEHAVIOR);
    check('(2g) ★★挙動で測る: 押し手に囲まれて 60 フレーム回しても戦車が 1px も動かない',
      !HB.err && HB.pushers >= 2 && HB.moved < 1,
      JSON.stringify(HB));

    // ══ §3 恒等 ═══════════════════════════════════════════════════════════════
    mark('§3 副作用ゼロ (他シナリオ / 旧経路 / 撤退スイッチ)');
    {
      const cases = [
        { name: 'bandits-forest', scen: 'bandits-forest', q: '?diag=1&intel=0' },
        { name: 'lizard-swamp',   scen: 'lizard-swamp',   q: '?diag=1&intel=0' },
        { name: 'orc-fort',       scen: 'orc-fort',       q: '?diag=1&intel=0' },
        { name: 'undead-temple',  scen: 'undead-temple',  q: '?diag=1&intel=0' },
        { name: 'dragon-lair',    scen: 'dragon-lair',    q: '?diag=1&intel=0' },
        { name: 'graph0(単一マップ)', scen: 'goblin-mine', q: '?diag=1&intel=0&graph=0' },
        { name: 'minefold0(旧5ノード)', scen: 'goblin-mine', q: '?diag=1&intel=0&minefold=0' },
      ];
      for (const c of cases) {
        const a = await bootPage(browser, PORT, c.q, errs, { scen: c.scen });
        const A = await a.evaluate(WALKABLE_TOTAL);
        await a.close();
        const b = await bootPage(browser, PORT, c.q + '&paintring=0', errs, { scen: c.scen });
        const B = await b.evaluate(WALKABLE_TOTAL);
        await b.close();
        if (c.name.indexOf('minefold0') === 0) {
          /* ⚠ 旧 5 ノード構成の n1 も同じ絵 (paint:"n1") を使うので、**そちらにも効くのが正しい**
           *   (外周の岩を歩ける欠陥は旧構成でも同じ)。ここだけは「変わること」を測る。 */
          check('(3d) ' + c.name + ': 外周封鎖が効く (同じ絵なので旧構成でも直る)',
            A.walkable < B.walkable && A.ring > 0,
            '素=' + A.walkable + ' / off=' + B.walkable + ' ring=' + A.ring);
        } else {
          check('(3b) ' + c.name + ': 歩けるマス数が ?paintring=0 と 1 マスも変わらない',
            A.walkable === B.walkable && A.ring === 0,
            '素=' + A.walkable + ' / off=' + B.walkable + ' ring=' + A.ring + ' entries=' + A.entries);
        }
      }
    }
    /* ★★マスクを持たない絵が母集団に居るケースを 1 つ必ず測る。
     * ⚠⚠ 上の 5 シナリオは**開始ノードに絵が 1 枚も無い** (entries=0 / paintings=0) ので、
     *   そこだけでは「sealRing がマスクの無い絵へ漏れていないか」を**一度も測っていない**。
     *   goblin-mine の n4 (7x6 の掘削場・blocked を持たない床だけの絵) が唯一の実在の母集団。 */
    const hopN4 = async (port, q) => {
      const p = await bootPage(browser, port, q, errs);
      await closeDialogs(p);
      await gotoNode(p, 'n1', 'right', 25000);
      const ok = await gotoNode(p, 'n4', 'right', 25000);
      const w = await p.evaluate(WALKABLE_TOTAL);
      await p.close();
      return Object.assign({ ok: ok }, w);
    };
    const N4a = await hopN4(PORT, '?diag=1&intel=0&minefold=0');
    {
      const N4b = await hopN4(PORT, '?diag=1&intel=0&minefold=0&paintring=0');
      check('(3z) 装置: マスク無しの絵を持つノード n4 に到達し、絵が 1 枚以上ある (母集団が空でない)',
        N4a.ok && N4a.node === 'n4' && N4a.paintings >= 1,
        'node=' + N4a.node + ' paintings=' + N4a.paintings + ' entries=' + N4a.entries);
      check('(3b-n4) ★マスクを持たない絵には外周封鎖が効かない (歩けるマス数が不変)',
        N4a.walkable === N4b.walkable && N4a.sealed === 0 && N4a.ring === 0,
        '素=' + N4a.walkable + ' / off=' + N4b.walkable + ' sealed=' + N4a.sealed + ' ring=' + N4a.ring);
    }
    {
      const cb = await bootPage(browser, PORT, '?diag=1&intel=0&chariotbody=0', errs);
      await closeDialogs(cb);
      await gotoNode(cb, 'n1', 'right', 20000);
      const C0 = await cb.evaluate(CHARIOT_MEASURE);
      await cb.close();
      /* 旧挙動 = 中心 1 マス判定 + 東端から手前へ探す。**素とは違う位置になる**ことが
       * 「スイッチが効いている」証拠 (素は footprint と猶予距離で選ぶので必ず別の位置)。 */
      check('(3c) ?chariotbody=0 で戦車が旧挙動 (中心 1 マス判定) に戻る',
        !!C0.spot && JSON.stringify(C0.spot) !== JSON.stringify(C1.spot),
        'off=' + JSON.stringify(C0.spot) + ' / 素=' + JSON.stringify(C1.spot));
      check('(3c2) 装置: 撤退時は unitBodyTiles が中心 1 マスへ落ちている',
        C0.bodyN === 1, 'off の体のマス数=' + C0.bodyN + ' / 素=' + C1.bodyN);
    }
    await page.close();

    // ══ §4 目的そのもの: 戦車入りのボス戦が完走する ══════════════════════════
    if (!NO_FULL) {
      mark('§4 目的そのもの: 戦車が乱入するボス戦で潜行がクリアに到達する (autoplay 1 周)');
      const play = await bootPage(browser, PORT, '?autoplay=30&intel=1', playErrs);
      const t0 = Date.now();
      let cleared = false, saw = null;
      for (;;) {
        /* ⚠⚠ dungeonCleared は classic script 直下の変数。**window.dungeonCleared は常に
         *   undefined = 偽の赤**。裸の識別子で読むこと。 */
        const st = await play.evaluate(() => ({
          cleared: (typeof dungeonCleared !== 'undefined') ? !!dungeonCleared : false,
          chariot: (window.__chariotProbe || []).length,
        }));
        if (st.chariot && !saw) saw = Math.round((Date.now() - t0) / 1000);
        if (st.cleared) { cleared = true; break; }
        if (Date.now() - t0 >= FULL_TIMEOUT_MS) break;
        await sleep(1000);        // ⚠ 短いポーリングは測定対象そのものを遅くする (150ms で実測済み)
      }
      const fin = await play.evaluate(() => ({
        chariot: (window.__chariotProbe || []).slice(),
        tramples: (window.__trampleProbe || []).slice(),
      }));
      check('(4z) 装置: 戦車が実際に乱入した (でなければ (2e) は空振りで緑になる)',
        fin.chariot.length > 0 && fin.chariot.some(r => r.cancelled === false),
        JSON.stringify(fin.chariot).slice(0, 400) + ' sawAt=' + (saw !== null ? saw + 's' : '-'));
      check('(4z2) 装置: 乱入位置の体が壁を 0 マス含む (実プレイ経路で測る)',
        (() => { const r = fin.chariot.find(x => x.cancelled === false);
                 return !!r && (r.body || []).length > 0 && (r.body || []).every(b => !b.wall); })(),
        JSON.stringify((fin.chariot.find(x => x.cancelled === false) || {}).body || []));
      check('(2e) ★★戦車を含むボス戦が dungeonCleared に到達する (手段でなく目的)',
        cleared, (cleared ? '' : '未クリア ') + Math.round((Date.now() - t0) / 1000) + 's / 突進記録=' +
        fin.tramples.length + ' 件 ' + JSON.stringify(fin.tramples.slice(0, 6)));
      check('(2e2) 突進が BLOCKED だけで終わっていない (1 度は轢くか走り抜けている)',
        fin.tramples.length === 0 || fin.tramples.some(t => !t.blocked),
        JSON.stringify(fin.tramples.slice(0, 8)));
      await play.close();
    } else {
      console.log('[drv] --no-full: §4 (autoplay 1 周) を飛ばしました');
    }

    // ══ §5 負のコントロール ═══════════════════════════════════════════════════
    mark('§5 負のコントロール (変異を注入して assert が本当に赤くなるか)');
    async function neg(key, fn) {
      const p = await bootPage(browser, PORT_OF[key], '?diag=1&intel=0', errs);
      await closeDialogs(p);
      await fn(p);
      await p.close();
    }
    await neg('noring', async (p) => {
      const a = await p.evaluate(RING_MEASURE);
      await gotoNode(p, 'n1', 'right', 20000);
      const b = await p.evaluate(RING_MEASURE);
      const l = await p.evaluate(LEG_MEASURE);
      check('(5-noring) sealRing を無視すると §1a/§1c が赤くなる',
        a.walkNonGate.length > 0 && b.walkNonGate.length > 0 && l.legs['s1->s2'] === 7,
        'n0 非出口の歩ける外周=' + a.walkNonGate.length + ' n1=' + b.walkNonGate.length +
        ' s1->s2=' + l.legs['s1->s2']);
    });
    {
      /* ⚠⚠ 母集団は **マスクを持たない絵が実在する場所**でなければ空振りする。
       *   最初 orc-fort の開始ノードで測ったが、そこは絵が 0 枚で変異が見えなかった
       *   (2026-08-20 に実際に空振りさせた)。→ (3b-n4) と同じ n4 で測る。 */
      const A = await hopN4(PORT_OF['ringall'], '?diag=1&intel=0&minefold=0');
      check('(5-ringall) マスク無しの絵にも外周封鎖を効かせると (3b-n4) が赤くなる',
        A.paintings >= 1 && (A.walkable !== N4a.walkable || A.sealed > 0),
        '変異=' + A.walkable + '(sealed=' + A.sealed + ' ring=' + A.ring + ')' +
        ' / 素=' + N4a.walkable + '(sealed=' + N4a.sealed + ')');
    }
    await neg('centeronly', async (p) => {
      await gotoNode(p, 'n1', 'right', 20000);
      const c = await p.evaluate(CHARIOT_MEASURE);
      const f3 = (c.rounds || []).slice(0, 3);
      check('(5-centeronly) 中心 1 マス判定へ戻すと §2a か §2c が赤くなる',
        (!!c.spot && c.bodyWalls > 0) || f3.some(r => (r.walls || 0) > 0),
        'spot=' + JSON.stringify(c.spot) + ' 体の壁=' + c.bodyWalls + ' 突進3回=' + JSON.stringify(f3));
    });
    await neg('nofallback', async (p) => {
      await gotoNode(p, 'n1', 'right', 20000);
      const c = await p.evaluate(CHARIOT_MEASURE);
      check('(5-nofallback) 旧起点 (部屋の東端 = 外周) を返させると §2a/§2b が赤くなる',
        !!c.spot && (c.bodyWalls > 0 || c.onRing === true || c.toBoss === null),
        'spot=' + JSON.stringify(c.spot) + ' 体の壁=' + c.bodyWalls + ' onRing=' + c.onRing +
        ' toBoss=' + c.toBoss);
    });
    await neg('nomass', async (p) => {
      await gotoNode(p, 'n1', 'right', 20000);
      const t = await p.evaluate(HEAVY_TABLE);
      const b = await p.evaluate(HEAVY_BEHAVIOR);
      check('(5-nomass) heavyOverlap の口を殺すと §2f/§2g が赤くなる (176 のまま軽くなる)',
        (t.find(r => r.key === 'goblinChariot') || {}).heavy === false && (!b.err && b.moved >= 1),
        'heavy=' + JSON.stringify(t.find(r => r.key === 'goblinChariot')) + ' 挙動=' + JSON.stringify(b));
    });

    // ══ §6 ページエラー ═══════════════════════════════════════════════════════
    mark('§6 ページエラーが出ていないこと');
    check('(6a) 測定ページで pageerror / console.error が出ていない',
      errs.length === 0, errs.slice(0, 6).join(' | '));
    if (!NO_FULL) {
      const fatal = playErrs.filter(e => !/\[DIAG\]/.test(e));
      check('(6b) 実プレイページで [DIAG] 以外のエラーが出ていない',
        fatal.length === 0, fatal.slice(0, 6).join(' | '));
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const bad = results.filter(r => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + (results.length - bad.length) + '/' + results.length + ' PASS');
  if (bad.length) {
    console.log('  FAIL:');
    for (const b of bad) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(bad.length ? 1 : 0);
})();
