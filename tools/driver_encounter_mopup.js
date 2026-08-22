#!/usr/bin/env node
/*
 * driver_encounter_mopup.js — 「手前の 1 体を倒しただけで休憩フェーズに入る」の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 #13 (2026-08-23_encounter-mopup-before-rest.md) の受入条件 1。
 *
 * ■ 直す欠陥
 *   runEncounter のラウンドループは
 *     ・while 条件が `encounterEnemyIndices.some(alive)` = **その戦闘の参加者**しか見ない
 *     ・増援を見る点が `if (round > 1)` の**ラウンド先頭 1 点だけ**
 *   なので、**1 ラウンドで参加者が全滅した戦闘では増援判定が 0 回**走る。結果、
 *   本番の detectReinforcements() が「この敵は合流すべき」と答えているのに
 *   VICTORY → setPhase("rest") へ落ちる (2026-08-23 実プレイ + probe_rest_premature.js で実測)。
 *
 * ■ 決定論の作り方 (実プレイの偶然に頼らない)
 *   廃坑 n1 へ __graphRun.enter で入り、**生存敵を 2 体だけ**にする。
 *     A … リーダーから engagePx の**内側**             → 初期交戦に入る (参加者)
 *     B … engagePx の**外**かつ engagePx+160 の**内側** → 初期交戦に入らないが
 *                                                        detectReinforcements() は返す
 *   さらに **A の HP を 1** にして「ラウンド 1 で参加者が全滅する」を作る。
 *   ⭐ これで依頼書の「戦闘中に敵を寄せる」手順は要らなくなる。寄せる方式は
 *     「寄せた瞬間」と「ラウンド 2 の先頭」の競争になり、ラウンド 2 が来ると
 *     **既存コードでも合流してしまい偽の緑**になる。静置なら競争が原理的に無い。
 *
 * ■ 3 本の腕 (同一 run)
 *   (素)                  | §1 修正後の姿      … B が合流し、rest 時に増援 0
 *   ?mopup=0              | §2 負のコントロール … B は合流せず rest。**修正前はここが素の姿**
 *   ?mopup=0&mopupsight=0 | §3 両方 OFF で §2 と恒等 (スイッチが互いを汚さない)
 *
 * ⚠ §0 の装置 assert は 3 腕すべてで通ること。ここが崩れたら「緑」は空振り。
 *
 * 使い方:
 *   node tools/driver_encounter_mopup.js
 *   node tools/driver_encounter_mopup.js --headful --port 9440
 *   node tools/driver_encounter_mopup.js --only off        (腕を 1 本だけ)
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 *
 * ■ §4 実プレイ不変条件 (受入条件 2)
 *   ?autoplay=15 で廃坑を 1 周し、setPhase("rest") が走った**全ての瞬間**で
 *   detectReinforcements() が 0 であること。⚠ 母集団ガード = 休憩 3 回以上。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

/* ⚠⚠ path.resolve 必須。'/' 区切りのままだと startsWith が必ず false で全 404 になる。 */
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const HEADFUL = argv.includes('--headful');
const PORT = parseInt(arg('port', '9440'), 10);
const ONLY = arg('only', null);          // 腕を 1 本だけ回す (on/off/both/play)
const PLAY_SCEN = arg('scen', 'goblin-mine');   // §4 実プレイ 1 周のシナリオ
const PLAY_SECS = parseInt(arg('playsecs', '300'), 10);

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません'); process.exit(2);
}
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

const results = [];
function check(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}

// ══════════════════════════════════════════════════════════════════════════════
// ページ内: 装置を組む (本番の関数だけを使う。距離式も engagePx も再実装しない)
// ══════════════════════════════════════════════════════════════════════════════
/* A/B を置ける (tx,ty) の組を**本番の判定式そのもの**で探す。
 * ⚠ 距離は detectEnemiesEngagedByRange と同じ「リーダー中心 (playerX+48, playerY+58) ←→
 *   敵中心」で測る。ここを写し間違えると装置だけ緑で本体を測れない。 */
const RIG = () => {
  const pCX = playerX + 48, pCY = playerY + 58;
  const pTX = Math.floor(pCX / TILE_SIZE), pTY = Math.floor(pCY / TILE_SIZE);
  // 近接 (engagePx=400) の生存敵だけを候補にする。中/遠距離は engagePx が広すぎて
  // 「engagePx の外・engagePx+160 の内」の帯 (400〜560px) が作れない。
  const melee = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || !e.alive || e.inactive) continue;
    if (e.def && e.def.isObjective) continue;
    if (e.def && e.def.isBoss) continue;                       // ボスは恐怖オーラ等で尺が変わる
    if (getRange((e.def && e.def.range) || 'melee').engagePx !== 400) continue;
    melee.push(i);
  }
  if (melee.length < 2) return { err: '近接の生存敵が 2 体未満 (' + melee.length + ')' };
  const aIdx = melee[0], bIdx = melee[1];
  const eng = getRange('melee').engagePx;                      // 400
  const REINF = 160;                                           // REINFORCE_MARGIN_PX
  const dist = (tx, ty) => Math.hypot(pCX - (tx * TILE_SIZE + 48), pCY - (ty * TILE_SIZE + 48));

  // 候補タイルを距離帯で仕分ける。壁でない + リーダーから視線が通る、が最低条件。
  const near = [], band = [];
  for (let ty = Math.max(1, pTY - 8); ty <= Math.min(MAP_H - 2, pTY + 8); ty++) {
    for (let tx = Math.max(1, pTX - 8); tx <= Math.min(MAP_W - 2, pTX + 8); tx++) {
      if (tx === pTX && ty === pTY) continue;
      if (isTileWall(tx, ty)) continue;
      const cx = tx * TILE_SIZE + 48, cy = ty * TILE_SIZE + 48;
      if (!hasLineOfSight(pCX, pCY, cx, cy)) continue;
      const d = dist(tx, ty);
      if (d > 120 && d < eng - 60) near.push({ tx: tx, ty: ty, d: d });
      else if (d > eng + 30 && d < eng + REINF - 40) band.push({ tx: tx, ty: ty, d: d });
    }
  }
  if (!near.length) return { err: 'A を置ける近接帯のタイルが無い' };
  if (!band.length) return { err: 'B を置ける増援帯 (430〜520px) のタイルが無い' };
  /* ⚠ B は「A と同じ側」へ置く。戦闘中リーダーは playerAdvanceOneTile で A へ 1 タイル
   *   詰めるので、反対側に置くと B が増援帯から押し出されて**測っていないのに緑**になる。 */
  near.sort((p, q) => q.d - p.d);                              // A はなるべく遠く (3 タイル前後)
  const A = near[0];
  const aAng = Math.atan2(A.ty - pTY, A.tx - pTX);
  const angDiff = (t) => {
    let d = Math.abs(Math.atan2(t.ty - pTY, t.tx - pTX) - aAng);
    if (d > Math.PI) d = Math.abs(2 * Math.PI - d);
    return d;
  };
  band.sort((p, q) => angDiff(p) - angDiff(q));
  const B = band[0];

  // 残りは全部 alive=false (依頼書の指定どおり)。参加者を 1 体に固定するための装置。
  for (let i = 0; i < enemies.length; i++) {
    if (i === aIdx || i === bIdx) continue;
    if (enemies[i]) enemies[i].alive = false;
  }
  snapEnemyToTile(enemies[aIdx], A.tx, A.ty);
  snapEnemyToTile(enemies[bIdx], B.tx, B.ty);
  enemies[aIdx].hp = 1;                    // ★ ラウンド 1 で参加者が全滅する を作る
  enemies[aIdx].everSeen = true;
  enemies[bIdx].everSeen = true;
  return { err: null, aIdx: aIdx, bIdx: bIdx,
           aName: enemies[aIdx].def.name, bName: enemies[bIdx].def.name,
           aTile: A.tx + ',' + A.ty, bTile: B.tx + ',' + B.ty,
           pTile: pTX + ',' + pTY,
           aD: Math.round(A.d), bD: Math.round(B.d), eng: eng, reinf: REINF };
};

/* 装置が「本番の目で見て」意図どおりかを、本番の関数で読み直す。 */
const RIGCHECK = (a, b) => {
  const pCX = playerX + 48, pCY = playerY + 58;
  const one = (i) => {
    const e = enemies[i];
    const ex = e.x + e.def.displaySize / 2, ey = e.y + e.def.displaySize / 2;
    return { alive: !!e.alive, hp: e.hp,
             d: Math.round(Math.hypot(pCX - ex, pCY - ey)),
             eng: getRange(e.def.range || 'melee').engagePx,
             los: !!hasLineOfSight(pCX, pCY, ex, ey),
             vis: !!isEnemyVisibleToParty(e) };
  };
  let aliveCount = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e && e.alive && !e.inactive && !(e.def && e.def.isObjective)) aliveCount++;
  }
  return { A: one(a), B: one(b), aliveCount: aliveCount,
           engaged: detectEngaged().slice(), reinf: detectReinforcements().slice() };
};

/* ★ ページ内 50ms 監視。setPhase("rest") が走った**瞬間**を掴む。
 * ⚠ 1 秒サンプルの 1 点読みでは休憩の瞬間の周囲を取り違える (probe_rest_premature と同じ理由)。 */
const WATCH = (bIdx) => {
  window.__mp = { bJoined: false, rest: null, maxRound: 0, encSeen: false };
  window.__mpTimer = setInterval(() => {
    try {
      if (encounterActive) window.__mp.encSeen = true;
      if (typeof encounterRound === 'number' && encounterRound > window.__mp.maxRound) {
        window.__mp.maxRound = encounterRound;
      }
      if (encounterEnemyIndices.indexOf(bIdx) >= 0) window.__mp.bJoined = true;
      if (currentPhase === 'rest' && !window.__mp.rest) {
        const e = enemies[bIdx];
        const pCX = playerX + 48, pCY = playerY + 58;
        const ex = e.x + e.def.displaySize / 2, ey = e.y + e.def.displaySize / 2;
        const rf = detectReinforcements();
        window.__mp.rest = {
          round: encounterRound,
          reinf: rf.length,
          reinfNames: rf.map(i => enemies[i].def.name),
          bAlive: !!e.alive,
          bTiles: Math.round(Math.hypot(pCX - ex, pCY - ey) / TILE_SIZE * 10) / 10,
          participants: encounterEnemyIndices.length,
        };
      }
    } catch (err) {}
  }, 50);
};

/* §5 STEP 3 (増援の視線をパーティ基準へ) を**それ単体で**測る。
 * ⚠⚠ §3 の恒等 assert は「スイッチが mopup を汚さない」しか見ていない。それだけだと
 *   STEP 3 が丸ごと死んでいても全緑になる (= 空振り)。ここでは非対称そのものを作る:
 *     ・リーダーからは視線が通らない (hasLineOfSight = false)
 *     ・仲間の誰かからは視線が通る
 *     ・パーティ視界には入っている (visibleTiles = 1 → isEnemyVisibleToParty = true)
 *     ・リーダーからの距離は engagePx + 160 の内側
 *   この 4 つを満たすタイルへ敵を 1 体置き、detectEnemiesEngagedByRange の
 *   partySight を true / false で呼び分けて**戻り値が変わる**ことを見る。
 * ⚠ パーティは動き続けるので条件が揃うタイルも動く。1 回の探索は同期で行い、
 *   見つかるまで数秒リトライする (見つからなければ母集団ガードで FAIL)。 */
const SIGHT_PROBE = () => {
  const living = allies.filter(a => a && a.alive);
  if (!living.length) return { found: false, why: '生存している仲間がいない' };
  // 動かす敵を 1 体借りる (生存敵。位置は後で戻す)
  let idx = -1;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || !e.alive || e.inactive) continue;
    if (e.def && (e.def.isObjective || e.def.isBoss)) continue;
    if (getRange((e.def && e.def.range) || 'melee').engagePx !== 400) continue;
    idx = i; break;
  }
  if (idx < 0) return { found: false, why: '借りられる近接の生存敵がいない' };
  const e = enemies[idx];
  const keepE = { x: e.x, y: e.y };
  const keepP = { x: playerX, y: playerY };
  const restore = () => { e.x = keepE.x; e.y = keepE.y; playerX = keepP.x; playerY = keepP.y; };

  /* ① 敵を置ける E 候補 = 「**仲間の目**で見えているタイル」。
   *   ⚠ 判定は computeVisibleTiles (:16140) と**同じ 2 条件**で書く — 円形の視界半径
   *     (dr²+dc² <= R²) と hasLineOfSight。片方だけにすると、リーダーを動かして
   *     再計算が走った瞬間に見えなくなる「作れない状態」を測ってしまう。 */
  const eCands = [];
  const p0TX = Math.floor((keepP.x + 48) / TILE_SIZE), p0TY = Math.floor((keepP.y + 58) / TILE_SIZE);
  for (const a of living) {
    const s = (a.def && a.def.displaySize) || 96;
    const aCX = a.x + s / 2, aCY = a.y + s / 2;
    const aTX = Math.floor(aCX / TILE_SIZE), aTY = Math.floor(aCY / TILE_SIZE);
    const R = getSight(a.classKey).tiles;
    for (let dr = -R; dr <= R; dr++) {
      const ty = aTY + dr; if (ty < 1 || ty >= MAP_H - 1) continue;
      for (let dc = -R; dc <= R; dc++) {
        const tx = aTX + dc; if (tx < 1 || tx >= MAP_W - 1) continue;
        if (dr * dr + dc * dc > R * R) continue;
        if (isTileWall(tx, ty)) continue;
        if (!hasLineOfSight(aCX, aCY, tx * TILE_SIZE + 48, ty * TILE_SIZE + 48)) continue;
        eCands.push({ tx: tx, ty: ty,
                      d0: Math.abs(tx - p0TX) + Math.abs(ty - p0TY) });
      }
    }
  }
  if (!eCands.length) return { found: false, why: '仲間から見えている床タイルが 1 つも無い' };
  eCands.sort((p, q) => p.d0 - q.d0);      // 現在地に近い順 = なるべく自然な配置から試す

  /* ② リーダーの立ち位置 L = 「E から 400〜560px・**視線が通らない**床タイル」。
   *   ⚠⚠ これは実プレイの隊列を再現したものではない。**測っているのは
   *     detectEnemiesEngagedByRange の視線分岐ただ 1 つ**であって、
   *     「この形が自然に起きるか」ではない (自然発生は森 n7 で実測済み・依頼書参照)。
   *   ⚠ 距離は snapPlayerToTile した**後の実座標**で測る。SNAP_*_OFFSET を写すと
   *     実装とドライバが同じ間違いを共有して両方緑になる。 */
  for (let n = 0; n < Math.min(eCands.length, 400); n++) {
    const E = eCands[n];
    const ex = E.tx * TILE_SIZE + 48, ey = E.ty * TILE_SIZE + 48;
    for (let dr = -6; dr <= 6; dr++) {
      const ly = E.ty + dr; if (ly < 1 || ly >= MAP_H - 1) continue;
      for (let dc = -6; dc <= 6; dc++) {
        const lx = E.tx + dc; if (lx < 1 || lx >= MAP_W - 1) continue;
        if (isTileWall(lx, ly)) continue;
        snapPlayerToTile(lx, ly);
        const pCX = playerX + 48, pCY = playerY + 58;
        const d = Math.hypot(pCX - ex, pCY - ey);
        if (!(d > 400 && d < 400 + 160)) continue;      // 増援帯の内側 (初期交戦の外)
        if (hasLineOfSight(pCX, pCY, ex, ey)) continue; // ★ リーダーからは通らない
        snapEnemyToTile(e, E.tx, E.ty);
        e.everSeen = true;
        const excl = new Set();
        const withParty  = detectEnemiesEngagedByRange(excl, 160, true).indexOf(idx) >= 0;
        const leaderOnly = detectEnemiesEngagedByRange(excl, 160, false).indexOf(idx) >= 0;
        const vis = !!isEnemyVisibleToParty(e);
        const out = { found: true, tile: E.tx + ',' + E.ty, leaderTile: lx + ',' + ly,
                      d: Math.round(d), idx: idx, vis: vis,
                      withParty: withParty, leaderOnly: leaderOnly };
        restore();                                       // 位置は必ず戻す (以降の計測を汚さない)
        return out;
      }
    }
  }
  restore();
  return { found: false, why: '条件を満たす (敵タイル, リーダータイル) の組が無い' };
};

/* §4 実プレイ (?autoplay) 用の監視。setPhase("rest") が走った**全ての瞬間**を溜める。
 * ⚠ ここが本チケットの「目的そのもの」の不変条件 = 休憩は周りに敵が居なくなった時だけ。 */
const WATCH_PLAY = () => {
  window.__mpp = { rests: [], lastPhase: null, waves: -1, nodes: {} };
  window.__mppTimer = setInterval(() => {
    try {
      try { window.__mpp.waves = escortWaveList().length; } catch (e) {}
      const ph = currentPhase;
      const prev = window.__mpp.lastPhase;
      window.__mpp.lastPhase = ph;
      let node = null;
      try { node = window.__graphRun ? window.__graphRun.nodeId() : null; } catch (e) {}
      if (node) window.__mpp.nodes[node] = 1;
      if (ph === 'rest' && prev !== 'rest') {
        const rf = detectReinforcements();
        window.__mpp.rests.push({
          node: node, round: (typeof encounterRound === 'number') ? encounterRound : null,
          reinf: rf.length, names: rf.map(i => enemies[i].def.name),
        });
      }
    } catch (e) {}
  }, 50);
};

/* 受入条件 2 — 実プレイ 1 周。休憩に入った瞬間に必ず detectReinforcements() が 0。
 * ⚠ 母集団ガード必須。休憩が 0 回でも「全部 0」は真になるので、測っていないのに緑になる。 */
async function runPlaythrough(browser, scen, secs) {
  console.log('\n══════ §4 実プレイ不変条件 (?autoplay=15, ' + scen + ', 上限 ' + secs + '秒) ══════');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.evaluateOnNewDocument((sid) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', sid);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '10000'); } catch (e) {}
  }, scen);
  await page.goto('http://localhost:' + PORT + '/index.html?autoplay=15&diag=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof currentPhase !== 'undefined' && typeof detectReinforcements === 'function' && typeof enemies !== 'undefined'",
    { timeout: 25000 });
  await page.evaluate(WATCH_PLAY);

  const t0 = Date.now();
  let lastN = 0;
  for (;;) {
    await sleep(1000);   /* ⭐ 1 秒間隔。短い evaluate はゲームを実測で遅くする */
    let k = null;
    try {
      k = await page.evaluate(() => ({
        n: window.__mpp ? window.__mpp.rests.length : 0,
        over: (typeof gameOver !== 'undefined' && gameOver) ||
              (typeof dungeonCleared !== 'undefined' && dungeonCleared),
      }));
    } catch (e) { break; }
    if (!k) continue;
    if (k.n !== lastN) {
      lastN = k.n;
      console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's] 休憩 ' + k.n + ' 回目');
    }
    if (k.over) { console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's] ラン終了'); break; }
    if ((Date.now() - t0) / 1000 > secs) break;
  }
  let mpp = null;
  try { mpp = await page.evaluate(() => window.__mpp); } catch (e) {}
  await page.close();
  if (errs.length) console.log('  ⚠ page errors: ' + JSON.stringify(errs.slice(0, 3)));
  return mpp;
}

// ══════════════════════════════════════════════════════════════════════════════
async function runArm(browser, label, qs, sec) {
  console.log('\n══════ ' + label + '  (' + (qs || '素') + ') ══════');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  });
  let url = 'http://localhost:' + PORT + '/index.html?diag=1&intel=0';
  if (qs) url += '&' + qs;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof detectReinforcements === 'function' && typeof snapEnemyToTile === 'function' && typeof enemies !== 'undefined'",
    { timeout: 25000 });
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await sleep(400);

  // ── n1 (坑道の奥) へ入る ──
  await page.evaluate(() => { window.__graphRun.enter('n1', 'right'); });
  {
    const t0 = Date.now();
    for (;;) {
      if (await page.evaluate(() => window.__graphRun.nodeId() === 'n1')) break;
      if (Date.now() - t0 > 20000) { await page.close(); return { fatal: 'n1 へ入れなかった' }; }
      await sleep(150);
    }
  }
  check(sec + 'a) 装置: 廃坑 n1 へ入れた', true, 'node=n1');
  await sleep(900);
  // 到着直後の知覚判定 / 選択ダイアログを閉じる (開いたままだと heroAI ごと止まる)
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) break;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
      if (btns.length) btns[btns.length - 1].click();
      const ov = document.getElementById('skillCheckOverlay');
      if (ov && ov.classList.contains('show')) {
        const rb = document.getElementById('scRollBtn'); if (rb) rb.click();
        ov.click();
      }
      document.body.click();
    });
    await sleep(300);
  }
  /* §5 STEP 3 の単体計測。⚠ rig の**前**に回す (rig は敵を 2 体へ減らすので借りられなくなる)。
   *   パーティは動き続けるので条件が揃うまで数秒リトライする。 */
  let sight = { found: false, why: '(未試行)' };
  for (let i = 0; i < 14; i++) {
    sight = await page.evaluate(SIGHT_PROBE);
    if (sight.found) break;
    await sleep(400);
  }
  console.log('  [sight] ' + JSON.stringify(sight));

  // パーティが自分から交戦してしまう前に装置を組む
  const rig = await page.evaluate(RIG);
  if (rig.err) { await page.close(); return { fatal: '装置を組めなかった: ' + rig.err }; }
  console.log('  [rig] A=' + rig.aName + ' @' + rig.aTile + ' (' + rig.aD + 'px)  ' +
              'B=' + rig.bName + ' @' + rig.bTile + ' (' + rig.bD + 'px)  PT@' + rig.pTile +
              '  engagePx=' + rig.eng + ' +margin=' + rig.reinf);
  await sleep(300);   // visibleTiles の更新を数フレーム待つ

  const rc = await page.evaluate(RIGCHECK, rig.aIdx, rig.bIdx);
  check(sec + 'b) 装置: 生存敵は A/B の 2 体だけ', rc.aliveCount === 2, 'alive=' + rc.aliveCount);
  check(sec + 'c) 装置: A は交戦距離の内側で視線も視界も通る (HP=1)',
    rc.A.alive && rc.A.d < rc.A.eng && rc.A.los && rc.A.vis && rc.A.hp === 1,
    JSON.stringify(rc.A));
  check(sec + 'd) 装置: B は交戦距離の外・増援帯の内側で視線も視界も通る',
    rc.B.alive && rc.B.d > rc.B.eng && rc.B.d < rc.B.eng + 160 && rc.B.los && rc.B.vis,
    JSON.stringify(rc.B));
  check(sec + 'e) 装置: 初期交戦の候補は A ただ 1 体 (detectEngaged)',
    rc.engaged.length === 1 && rc.engaged[0] === rig.aIdx,
    'engaged=' + JSON.stringify(rc.engaged) + ' aIdx=' + rig.aIdx);

  await page.evaluate(WATCH, rig.bIdx);
  await page.evaluate(() => { tryStartEncounter(); });
  {
    const t0 = Date.now();
    for (;;) {
      if (await page.evaluate(() => !!encounterActive)) break;
      if (Date.now() - t0 > 15000) { await page.close(); return { fatal: '戦闘が始まらなかった' }; }
      await sleep(120);
    }
  }
  const at0 = await page.evaluate(() => ({
    participants: encounterEnemyIndices.slice(),
    reinf: detectReinforcements().slice(),
  }));
  check(sec + 'f) 装置: 戦闘の参加者は A ただ 1 体',
    at0.participants.length === 1 && at0.participants[0] === rig.aIdx,
    'participants=' + JSON.stringify(at0.participants));
  /* ★★★ ここが本チケットの核。**本番の増援判定そのもの**が「B は合流すべき」と
   *   答えている状態を作れた、という証拠。これが偽なら以下の緑は全部空振り。 */
  check(sec + 'g) 装置: 本番 detectReinforcements() が B を「合流すべき」と答えている',
    at0.reinf.length === 1 && at0.reinf[0] === rig.bIdx,
    'reinf=' + JSON.stringify(at0.reinf) + ' bIdx=' + rig.bIdx);

  // ── 休憩フェーズ (または決着) を待つ ──
  let st = null;
  {
    const t0 = Date.now();
    for (;;) {
      st = await page.evaluate(() => ({
        mp: window.__mp, phase: currentPhase, enc: !!encounterActive,
        over: (typeof gameOver !== 'undefined' && gameOver) || hp <= 0,
      }));
      if (st.mp && st.mp.rest) break;
      if (st.over) break;
      if (Date.now() - t0 > 70000) break;
      await sleep(200);
    }
  }
  await page.close();
  if (!st || !st.mp || !st.mp.rest) {
    return { fatal: '休憩フェーズを観測できなかった (over=' + (st && st.over) + ')' };
  }
  console.log('  [rest] ' + JSON.stringify(st.mp.rest) + '  bJoined=' + st.mp.bJoined);
  if (errs.length) console.log('  ⚠ page errors: ' + JSON.stringify(errs.slice(0, 3)));
  return { rest: st.mp.rest, bJoined: st.mp.bJoined, maxRound: st.mp.maxRound, sight: sight };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_mopup_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

  const arms = [
    { key: 'on',   label: '§1 修正後の姿 (素)',               qs: '',                     sec: '(1' },
    { key: 'off',  label: '§2 負のコントロール ?mopup=0',      qs: 'mopup=0',              sec: '(2' },
    { key: 'both', label: '§3 両方 OFF ?mopup=0&mopupsight=0', qs: 'mopup=0&mopupsight=0', sec: '(3' },
  ];
  const out = {};
  for (const a of arms) {
    if (ONLY && ONLY !== a.key) continue;
    const r = await runArm(browser, a.label, a.qs, a.sec);
    if (r.fatal) {
      console.error('\n[drv] 測定不能 (' + a.label + '): ' + r.fatal);
      await browser.close(); srv.close(); process.exit(3);
    }
    out[a.key] = r;
  }
  let play = null;
  if (!ONLY || ONLY === 'play') {
    play = await runPlaythrough(browser, PLAY_SCEN, PLAY_SECS);
    if (!play) { console.error('\n[drv] 測定不能: 実プレイの監視結果を取れなかった'); await browser.close(); srv.close(); process.exit(3); }
  }
  await browser.close(); srv.close();

  console.log('\n══════ 判定 ══════');
  if (out.on) {
    check('(1h) 素: B が増援として合流した', out.on.bJoined === true, 'bJoined=' + out.on.bJoined);
    check('(1i) 素: 休憩に入った瞬間 detectReinforcements() が 0',
      out.on.rest.reinf === 0, 'reinf=' + out.on.rest.reinf + ' ' + JSON.stringify(out.on.rest.reinfNames));
    check('(1j) 素: B は倒されている (目の前に立ったまま休憩しない)',
      out.on.rest.bAlive === false, 'bAlive=' + out.on.rest.bAlive + ' bTiles=' + out.on.rest.bTiles);
  }
  if (out.off) {
    check('(2h) ?mopup=0: B は合流しない (撤退スイッチが効いている)',
      out.off.bJoined === false, 'bJoined=' + out.off.bJoined);
    check('(2i) ?mopup=0: 休憩の瞬間に detectReinforcements() が非ゼロ = 旧挙動',
      out.off.rest.reinf > 0, 'reinf=' + out.off.rest.reinf + ' ' + JSON.stringify(out.off.rest.reinfNames));
    check('(2j) ?mopup=0: B は生きたまま目の前に立っている',
      out.off.rest.bAlive === true && out.off.rest.bTiles < 6,
      'bAlive=' + out.off.rest.bAlive + ' bTiles=' + out.off.rest.bTiles);
  }
  if (out.off && out.both) {
    check('(3h) 両方 OFF は ?mopup=0 と恒等 (合流しない)',
      out.both.bJoined === out.off.bJoined, JSON.stringify([out.both.bJoined, out.off.bJoined]));
    check('(3i) 両方 OFF は ?mopup=0 と恒等 (休憩時の増援判定が非ゼロ・B 生存)',
      out.both.rest.reinf > 0 && out.both.rest.bAlive === true,
      'reinf=' + out.both.rest.reinf + ' bAlive=' + out.both.rest.bAlive);
  }

  /* ── §5 STEP 3 (増援の視線をパーティ基準へ) の単体計測 ────────────────────────
   * ⚠⚠ §3 の恒等 assert だけだと STEP 3 が丸ごと死んでいても全緑になる。ここが
   *   「非対称を直したこと」を測る唯一の点。 */
  if (out.on) {
    check('(5a) 母集団ガード: 「リーダーからは見えないがパーティには見えている」配置を作れた',
      out.on.sight.found === true, JSON.stringify(out.on.sight));
    if (out.on.sight.found) {
      check('(5b) 素: その敵をリーダー基準では拾わないが、パーティ基準では拾う',
        out.on.sight.leaderOnly === false && out.on.sight.withParty === true && out.on.sight.vis === true,
        'tile=' + out.on.sight.tile + ' d=' + out.on.sight.d + 'px vis=' + out.on.sight.vis +
        ' leaderOnly=' + out.on.sight.leaderOnly + ' withParty=' + out.on.sight.withParty);
    }
  }
  if (out.both) {
    check('(5c) 母集団ガード: ?mopupsight=0 の腕でも同じ配置を作れた',
      out.both.sight.found === true, JSON.stringify(out.both.sight));
    if (out.both.sight.found) {
      check('(5d) ?mopupsight=0: パーティ基準を渡してもリーダー基準と同じ = スイッチが効く',
        out.both.sight.withParty === false && out.both.sight.leaderOnly === false,
        'tile=' + out.both.sight.tile + ' withParty=' + out.both.sight.withParty +
        ' leaderOnly=' + out.both.sight.leaderOnly);
    }
  }

  if (play) {
    const bads = play.rests.filter(r => r.reinf > 0);
    /* ⚠⚠ 母集団ガード。休憩が 0 回なら「全部 0」は測っていないから 0。 */
    check('(4a) 母集団ガード: 実プレイで休憩を 3 回以上観測した',
      play.rests.length >= 3, '休憩=' + play.rests.length + ' 回 / 訪れたノード=' + Object.keys(play.nodes).join(','));
    /* ⚠ 依頼書の除外条件。ウェーブ防衛は wavesRemaining() が while を持たせているので対象外。
     *   廃坑は波を持たないシナリオ = ここが 0 であること自体が「対象内」の証拠。 */
    check('(4b) 装置: ウェーブ防衛シナリオではない (掃討合流が素通しされない)',
      play.waves === 0, 'escortWaveList().length=' + play.waves);
    check('(4c) 実プレイ: 休憩に入った全ての瞬間で detectReinforcements() が 0',
      bads.length === 0,
      bads.length ? JSON.stringify(bads) : (play.rests.length + ' 回すべて 0'));
  }

  const bad = results.filter(r => !r.ok);
  console.log('\n[drv] ' + (results.length - bad.length) + '/' + results.length + ' PASS');
  if (bad.length) for (const b of bad) console.log('  FAIL ' + b.name + '  — ' + b.detail);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('[drv] ' + ((e && e.stack) || e)); process.exit(3); });
