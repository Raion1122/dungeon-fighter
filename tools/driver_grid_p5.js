#!/usr/bin/env node
/*
 * driver_grid_p5.js — 卓上グリッド P5 (D&D 準拠の移動) + P6 (射程) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 設計書 = ~/.claude/plans/tabletop-grid-p5-move-p6-range.md
 *
 * ■ STEP 0 (現段階) — 「実装を 1 行も変えない状態」で現状値を実測して記録する段。
 *   ⭐ ここで測るのは**目的**であって定数ではない。「getMoveLimit が 6 を返すか」ではなく
 *     「1 手番を回したとき、そのユニットが**実際に何タイル動いたか**」を測る。
 *     定数を読むだけの assert は、実装とドライバが同じ誤りを共有したとき永久に緑になる。
 *
 * ■ ⭐⭐⭐ このドライバの主役 = §2 (2d) 「3 経路が同じ距離だけ動く」
 *   実測で判明した穴: **`enemyAdvanceOneTile` は steps ループを持たず、常に 1 タイルしか動かない**
 *   (`getMoveLimit(enemy) <= 0` を「動けるか否か」の門にしか使っていない。index.html:17807)。
 *   一方 `playerAdvanceOneTile` / `allyAdvanceTowardPoint` は steps ループ済み。
 *   → base を 1 → 6 にすると **PT だけ 6 マス / 敵は 1 マス** になり、カイティングで崩壊する。
 *   (2d) は今 (1/1/1) も実装後 (6/6/6) も緑で、**敵のループを入れ忘れた瞬間だけ赤くなる**。
 *
 * ■ 測り方の芯 — 歩数は `window.__pathRescue.calls` で数える
 *   `firstTileStep()` は 1 歩につきちょうど 1 回呼ばれ、`window.__pathRescue` が
 *   在れば `calls` を増やす **既存の dev シーム**。ドライバ側で歩数の規則を写経しない。
 *   ⚠ タイル差分 (Manhattan) とも突き合わせる。経路が迂回すると 2 つはズレるので、
 *     一致しない測定は「レーンが汚れている」として (2z) が申告する。
 *
 * ■ 舞台 = 廃坑 n0 (33x22 の卓上大部屋)
 *   ⚠⚠ 7x6 の小部屋 (MID = 他 5 シナリオの全ノード + 廃坑 n4/n5) では対角が 9.2 タイルしかなく、
 *     6 タイル移動も 12 タイル射程も**部屋に収まらない = 測っても意味が無い**。
 *     §1 が「舞台が大部屋であること」を先に測る (母集団ガード)。
 *
 * ■ 計測中の凍結
 *   `encounterActive = true` を立てて探索 AI と敵 AI を止める。ダイス戦闘は `runEncounter`
 *   を呼ばない限り走らないので、盤面は完全に静止する。
 *   ⚠ 「止まっているはず」を信用せず、(0c) が **600ms 放置して主人公のタイルが動かないこと**
 *     を実測する (凍結が効いていない状態で測ると歩数が丸ごと嘘になる)。
 *
 * 使い方:
 *   node tools/driver_grid_p5.js
 *   node tools/driver_grid_p5.js --headful
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8991'), 10);

const STAGE = 'goblin-mine';
const VIEWPORT = { width: 390, height: 844 };   // compact (iPhone 390x844)
const TILE = 96;                                 // 実装の TILE_SIZE。ドライバ側の独立入力
const N0_CELLS = [33, 22];                       // 起点 n0 の卓上マップのマス数 (make_grid_map.py の台帳)

/* ★★ STEP が進むたびに**ここだけ**書き換える期待値 ★★
 *   STEP 0 (旧仕様): 1
 *   STEP 2 (移動)  : 6   ← 今ここ
 * ⚠ 書き換え忘れを防ぐため、(2a)(2b)(2c) は必ずこの定数と突き合わせる。 */
const WANT_MOVE_TILES = 6;
/* ドワーフだけ D&D の Speed 20ft = 4 マス。⚠ パーティ編成は実行ごとにランダムなので、
 *   「3 経路が同じ歩数」で測ると**仲間がドワーフに当たった回だけ赤くなる**フレークになる
 *   (STEP 0 の実測で 1 回目=戦士 / 2 回目=ドワーフ を踏んだ)。職業ごとの期待値で測る。
 *   STEP 0 では両方 1 なので、この枝は STEP 2 まで一切効かない。 */
const WANT_MOVE_TILES_DWARF = 4;
const wantTiles = (ck) => (ck === 'dwarf' ? WANT_MOVE_TILES_DWARF : WANT_MOVE_TILES);
/* 1 歩あたりの実測所要 (slideAnim 380ms + sleepMs 120ms)。テンポ報告用の目安。 */
const WANT_MS_PER_TILE = 500;
const MS_TOL = 260;   // requestAnimationFrame の粒度 + ヘッドレスの揺れ
/* 計測に要る直線レーンの最低長。期待歩数より長いこと。 */
const MIN_LANE = Math.max(3, WANT_MOVE_TILES + 2);

/* ★★ STEP 3 で書き換える射程の台帳 ★★ */
const WANT_RANGE = { melee: 1, spellBuff: 6, medium: 8, spellSingle: 10, spellAoE: 10, bow: 12, long: 12 };
/* ★★ STEP 4 で書き換える視界の台帳 ★★ */
const WANT_SIGHT = { mage: 8, warrior: 8, cleric: 8, rogue: 8, elf: 10, dwarf: 12 };
/* ★★ STEP 5 で書き換える交戦開始距離 (px) の台帳 ★★
 *   ⚠ melee / spellBuff は**据え置く**のが設計 (廃坑 n0 の開幕 3 択 EV-2 と n7 の護衛配置を守る)。 */
const WANT_ENGAGE = { melee: 400, spellBuff: 288, medium: 768, spellSingle: 960, spellAoE: 960, bow: 1152, long: 1152 };
/* 光半径 (inner, outer)。⚠ 一次式ではなく **視界半径への比例** で決めた
 *   (outer ≒ 0.859 x tiles x 96 / inner ≒ 0.455 x outer)。理由は index.html の CLASS_SIGHT 注記。 */
const WANT_LIGHT = { mage: [300, 660], warrior: [300, 660], cleric: [300, 660],
                     rogue: [300, 660], elf: [375, 825], dwarf: [450, 990] };
/* ?dndrange=0 で戻るべき旧値 */
const OLD_RANGE  = { melee: 1, spellBuff: 3, medium: 3, spellSingle: 5, spellAoE: 5, bow: 6, long: 6 };
const OLD_SIGHT  = { mage: 3, warrior: 4, cleric: 4, rogue: 4, elf: 5, dwarf: 6 };
const OLD_ENGAGE = { melee: 400, spellBuff: 288, medium: 520, spellSingle: 480, spellAoE: 480, bow: 576, long: 576 };
/* ★★ 光半径の一次式 (STEP 4 で視界を伸ばすときはこれをそのまま延長する) ★★
 *   実測 6 職 (t=3..6) が誤差ゼロで乗る。⚠ 比例ではなく一次式。 */

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール) — STEP 0 では対象が無い。STEP 2 以降で足す。
// ══════════════════════════════════════════════════════════════════════════════
/* ⚠ #39 で職業別視界の表が js/class-sight.js へ移設された。nosightwiden の
 *   アンカーはその新しい住所を掴むので、配信対象にも足しておくこと。
 *   ⭐ 機構 (mutatedSources / startServer) は元から複数ファイル対応。 */
const MUTATE_TARGETS = ['index.html', 'js/class-sight.js'];
const MUTATIONS = {
  /* ★★★ 主役の負のコントロール。敵の steps ループを潰し、旧実装の
   *   「敵は常に 1 タイル」へ戻す。(2c)(2cy)(2d) が赤くなるはず。 */
  noenemyloop: [
    ['      const steps = (opts.steps != null) ? opts.steps : getMoveLimit(enemy);',
     '      const steps = 1;   /* ★変異noenemyloop */'],
  ],
  /* 既定 Speed を 1 へ戻す。⚠ ドワーフ枝は生きているので、ドワーフの仲間が居る回は
   *   その (2b) だけ緑のまま。**敵は必ず既定を通る**ので (2c) が決定論的に赤くなる。 */
  nomovebase: [
    ['    const MOVE_TILES_DEFAULT = 6;   // 30 ft',
     '    const MOVE_TILES_DEFAULT = 1;   /* ★変異nomovebase */'],
  ],
  /* ドワーフの 20ft 枝を潰す。⚠ 編成はランダムなので実プレイ側で測ると空振りする。
   *   §6 の合成ユニット probe (党の編成に依存しない) が決定論的に赤くなる。 */
  nodwarfspeed: [
    ['        return unit.classKey === "dwarf" ? MOVE_TILES_DWARF : MOVE_TILES_DEFAULT;',
     '        return MOVE_TILES_DEFAULT;   /* ★変異nodwarfspeed */'],
  ],
  /* 退避スイッチ ?dndmove=0 を効かなくする。§6 が赤くなる = §6 が load-bearing だと実測できる。 */
  nolegacyswitch: [
    ['      try { return new URLSearchParams(location.search).get("dndmove") === "0"; }',
     '      try { return false; }   /* ★変異nolegacyswitch */'],
  ],
  /* 射程の梯子の最上段を旧値へ戻す。(3a:bow) が赤くなる。 */
  norangeladder: [
    ['      bow:         { tiles: 12, label: "弓",     engagePx: 1152 },  // 60ft = D&D 3.5 短弓の射程単位',
     '      bow:         { tiles: 6, label: "弓", engagePx: 1152 },   /* ★変異norangeladder */'],
  ],
  /* ドワーフの視界だけ旧値へ戻す。(3b:dwarf)(3d:dwarf) が赤くなる。 */
  nosightwiden: [
    /* ⚠ #39: 表は js/class-sight.js へ移設済み。インデントが 4 になり term が付く。 */
    ['    dwarf:   { tiles: 12, inner: 450, outer: 990, term: "暗視" },',
     '    dwarf:   { tiles: 6, inner: 210, outer: 470, term: "暗視" },   /* ★変異nosightwiden */'],
  ],
  /* ★★★ 近接の engagePx を「据え置かず」一律に伸ばしてしまった版。
   *   廃坑 n0 の見張りは起点から 750px にしか居ないので、768px にすると
   *   入場した瞬間に戦闘が始まり冒頭の 3 択 (EV-2) が消える。(3x) が赤くなる。 */
  noengageguard: [
    ['      melee:  { tiles: 1,  label: "近距離", engagePx: 400 },   // 5ft。engagePx は据え置き',
     '      melee:  { tiles: 1, label: "近距離", engagePx: 768 },   /* ★変異noengageguard = 一律に伸ばした版 */'],
  ],
  /* 退避スイッチ ?dndrange=0 を効かなくする。§6b が赤くなる。 */
  nolegacyrange: [
    ['      try { return new URLSearchParams(location.search).get("dndrange") === "0"; }',
     '      try { return false; }   /* ★変異nolegacyrange */'],
  ],
};
const MUT_ORDER = ['noenemyloop', 'nomovebase', 'nodwarfspeed', 'nolegacyswitch',
                   'norangeladder', 'nosightwiden', 'noengageguard', 'nolegacyrange'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of MUTATIONS[key]) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    if (from.length === to.length) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → 誤報する');
      process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
  }
  _mutCache[key] = { files: out };
  return _mutCache[key];
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}
/* ⚠ MIME はモジュール直下に置くこと。helper へ切り出して取り込み漏れると
 *   try/catch に飲まれて**全 500** になり、症状は「シームが undefined」に見える。 */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey).files[rel]); return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; fails.push(name + (detail ? '  — ' + detail : '')); }
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
/* 記録だけして合否を出さない行 (STEP 0 のベースライン台帳)。 */
function note(name, detail) { console.log('  NOTE ' + name + '  — ' + detail); }
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// ページ起動
// ══════════════════════════════════════════════════════════════════════════════
async function bootPage(browser, port, query, errs) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  page.on('pageerror', e => errs.push('[:' + port + '] PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('[:' + port + '] CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((scen) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', scen);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, STAGE);
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function' && " +
    "typeof getMoveLimit === 'function' && typeof firstTileStep === 'function'",
    { timeout: 25000 });
  /* ⚠⚠ startGame() を通さないと gameStarted が false のまま = 探索も戦闘も一切走らない。
   *   開始画面をタップするのと同じ経路 (driver_graph_sce1 / driver_grid_p7 の作法をそのまま写す)。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  /* 出口選択 UI を止める (到着猶予を未来へ押し続ける)。 */
  await page.evaluate(() => {
    window.__p5freeze = setInterval(() => { nodeChoiceCooldownUntil = Date.now() + 60000; }, 150);
    nodeChoiceCooldownUntil = Date.now() + 60000;
  });
  await sleep(700);
  return page;
}

// ══════════════════════════════════════════════════════════════════════════════
// 計測本体 (ページ内で走る)
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 歩数は `window.__pathRescue.calls` (既存の dev シーム) で数える。
 *   `firstTileStep()` は 1 歩につきちょうど 1 回呼ばれるので、差分がそのまま歩数になる。
 *   ドライバ側に「何歩動くはずか」の規則を写経しない。 */
const MEASURE = async function (MIN_LANE) {
  const T = TILE_SIZE;
  const R = { err: null };
  R.leaderClass = (typeof leaderClassKey !== 'undefined') ? leaderClassKey : null;

  // ── 盤面を凍結 (探索 AI / 敵 AI を止める。ダイス戦闘は runEncounter を呼ばない限り走らない) ──
  encounterActive = true;

  const pTile = () => [Math.floor((playerX + 48) / T), Math.floor((playerY + 58) / T)];
  const cTile = (u) => [Math.floor((u.x + u.def.displaySize / 2) / T),
                        Math.floor((u.y + u.def.displaySize / 2) / T)];

  /* ── 凍結の待ち合わせ ─────────────────────────────────────────────────
   * ⚠⚠ `encounterActive = true` を立てても、**その瞬間すでに走っている探索ターン**は
   *   途中の await から再開して `allyAdvanceTowardPoint` を 1 回だけ呼びきる
   *   (ループ先頭の `if (encounterActive) break;` は次の周回でしか効かない)。
   *   これが混ざると firstTileStep の呼び出しが 1 回多く数えられ、
   *   「実装が 7 歩動いた」ように見える赤を出す (実際に 2 回踏んだ)。
   * ⭐ フラグを列挙して待つのではなく、**計測に使うカウンタそのもので静止を測る**。
   *   400ms 間 firstTileStep が 1 度も呼ばれなければ静止とみなす。 */
  async function waitQuiet(winMs, tries) {
    for (let i = 0; i < tries; i++) {
      window.__pathRescue = { calls: 0, n: 0, hardFail: 0 };
      await new Promise(r => setTimeout(r, winMs));
      const c = window.__pathRescue.calls;
      window.__pathRescue = undefined;
      const busy = (typeof exploreAllyTurnRunning !== 'undefined' && exploreAllyTurnRunning) ||
                   (typeof exploreEnemyTurnRunning !== 'undefined' && exploreEnemyTurnRunning);
      if (c === 0 && !busy) return { quiet: true, waitedMs: (i + 1) * winMs, lastCalls: c };
    }
    return { quiet: false, waitedMs: winMs * tries, lastCalls: -1 };
  }

  // ── (0c) 凍結が効いているかを実測 ──
  const frozenA = pTile();
  R.quiet = await waitQuiet(400, 12);
  const frozenB = pTile();
  R.frozen = { a: frozenA, b: frozenB, still: frozenA[0] === frozenB[0] && frozenA[1] === frozenB[1] };

  // ── 部屋の幾何 ──
  const best = MAPDEF.rooms.reduce((b, r) => {
    const a = (r.rect[2] - r.rect[0] + 1) * (r.rect[3] - r.rect[1] + 1);
    return (!b || a > b.a) ? { a: a, r: r } : b;
  }, null);
  const rc = best.r.rect;                              // [r0, c0, r1, c1]
  R.room = { w: rc[3] - rc[1] + 1, h: rc[2] - rc[0] + 1, rect: rc,
             painting: best.r.painting ? best.r.painting.key : null,
             mapId: MAPDEF.id, isCustom: !!MAPDEF.isCustom };
  R.room.diag = Math.round(Math.hypot(R.room.w, R.room.h) * 10) / 10;

  /* ⭐ 入場即戦闘の防止を測るための素材。
   * ⚠ 主人公の**現在位置**は使わない — bootPage の待ち時間中に探索 AI が歩き出しており、
   *   起点ではなくなっている。データ側の MAPDEF.start (ノードの入場タイル) を使う。 */
  R.spawnGaps = [];
  if (MAPDEF && MAPDEF.start) {
    const sx = MAPDEF.start.tx * T + T / 2, sy = MAPDEF.start.ty * T + T / 2;
    R.startTile = [MAPDEF.start.tx, MAPDEF.start.ty];
    for (const e of (enemies || [])) {
      if (!e || !e.alive || e.inactive || (e.def && e.def.isObjective)) continue;
      const ex = e.x + e.def.displaySize / 2, ey = e.y + e.def.displaySize / 2;
      const d = Math.hypot(sx - ex, sy - ey);
      const rk = e.def.range || 'melee';
      R.spawnGaps.push({ name: e.def.name, range: rk, engagePx: getRange(rk).engagePx,
                         distPx: d, distTiles: d / T });
    }
  }

  // ── 台帳 (定数の読み出し。合否ではなく記録用) ──
  R.range = {}; for (const k of Object.keys(RANGE)) R.range[k] = { tiles: RANGE[k].tiles, engagePx: RANGE[k].engagePx };
  R.sight = {}; for (const k of Object.keys(CLASS_SIGHT)) R.sight[k] = Object.assign({}, CLASS_SIGHT[k]);

  /* ⭐ 部屋の中で一番長い「直線に歩ける行」を 1 本選ぶ。
   *   ⚠ ユニットが立っているところに居合わせた行を使うと、1 枚絵の障害物マスクしだいで
   *     レーンが 7 タイルしか取れず (実測)、6 歩の計測が原理的に成立しない。
   *   ⚠ 他ユニットが乗っているタイルも除く (firstTileStep が avoidTiles で避けるため、
   *     混ざっていると経路が迂回して「実装のせい」に見える赤が出る)。 */
  function occupiedTiles() {
    const occ = new Set();
    const add = (tx, ty) => occ.add(tx + ',' + ty);
    add.apply(null, pTile());
    if (typeof allies !== 'undefined' && allies) for (const a of allies) if (a && a.alive) add.apply(null, cTile(a));
    if (typeof enemies !== 'undefined' && enemies) for (const e of enemies) if (e && e.alive) add.apply(null, cTile(e));
    return occ;
  }
  function bestLane(occ) {
    let best = null;
    for (let ty = rc[0]; ty <= rc[2]; ty++) {
      let run = 0;
      for (let tx = rc[1]; tx <= rc[3]; tx++) {
        const free = !isTileWall(tx, ty) && !occ.has(tx + ',' + ty);
        if (free) { run++; if (!best || run > best.run) best = { run: run, ty: ty, xEnd: tx }; }
        else run = 0;
      }
    }
    return best ? { ty: best.ty, x0: best.xEnd - best.run + 1, x1: best.xEnd, len: best.run } : null;
  }
  R.lane = bestLane(occupiedTiles());

  /* 1 手番ぶんの前進を走らせ、歩数 (pathCalls) / タイル差分 / 所要 ms / getMoveLimit を採る。
   * ⭐ 毎回**同じレーンの西端へ置いてから**測り、終わったら元の位置へ戻す。
   *   こうすると 3 経路の計測が互いに干渉せず、部屋のどこに立っていたかにも依存しない。 */
  async function measure(label, unit, tileOf, place, run, save, restore) {
    const L = R.lane;
    if (!L || L.len < MIN_LANE) {
      return { label: label, err: '直線レーンが短すぎる (len=' + (L ? L.len : 0) + ' < ' + MIN_LANE + ')' };
    }
    const snap = save();
    place(L.x0, L.ty);
    const t0 = tileOf();
    const limit = getMoveLimit(unit);
    const goalWX = L.x1 * T + T / 2, goalWY = L.ty * T + T / 2;
    window.__pathRescue = { calls: 0, n: 0, hardFail: 0 };
    const ms0 = performance.now();
    let err = null;
    try { await run(goalWX, goalWY); } catch (e) { err = String((e && e.message) || e); }
    const ms = Math.round(performance.now() - ms0);
    const t1 = tileOf();
    const pr = window.__pathRescue;
    window.__pathRescue = undefined;
    restore(snap);
    return { label: label, err: err, from: t0, to: t1, limit: limit,
             laneTy: L.ty, laneX0: L.x0, laneX1: L.x1, laneLen: L.len, laneDir: 1,
             steps: pr.calls, hardFail: pr.hardFail, rescued: pr.n,
             dtile: Math.abs(t1[0] - t0[0]) + Math.abs(t1[1] - t0[1]), ms: ms };
  }
  const placeUnit = (u) => (tx, ty) => snapEnemyToTile(u, tx, ty);

  // ── (1) 主人公 ──
  R.player = await measure('player', 'player', pTile,
    (tx, ty) => snapPlayerToTile(tx, ty),
    (gx, gy) => playerAdvanceOneTile(gx, gy),
    () => [playerX, playerY], (v) => { playerX = v[0]; playerY = v[1]; });

  // ── (2) 仲間 (生存者を**全員**測る。編成はランダムなので 1 人だけだと職業が実行ごとに割れる) ──
  const alive = (typeof allies !== 'undefined' && allies) ? allies.filter(a => a && a.alive) : [];
  R.allies = [];
  for (const a of alive) {
    const m = await measure('ally:' + (a.classKey || '?'), a, () => cTile(a), placeUnit(a),
      (gx, gy) => allyAdvanceTowardPoint(a, gx, gy),
      () => [a.x, a.y], (v) => { a.x = v[0]; a.y = v[1]; });
    m.classKey = a.classKey || null;
    m.name = (a.def && a.def.name) || null;
    R.allies.push(m);
  }

  // ── (3) 敵 ──
  /* ⚠ enemyAdvanceOneTile は「目標タイルの隣接 4 方向」を goal にするので、
   *   レーンの東端そのものではなくその 1 つ外側を狙わせる形になる = 端まで歩ける。 */
  const ei = enemies.findIndex(e => e && e.alive && !e.inactive && !(e.def && e.def.isObjective));
  R.enemyName = ei >= 0 ? enemies[ei].def.name : null;
  R.enemy = ei >= 0
    ? await measure('enemy', enemies[ei], () => cTile(enemies[ei]), placeUnit(enemies[ei]),
        (gx, gy) => enemyAdvanceOneTile(ei, gx, gy),
        () => [enemies[ei].x, enemies[ei].y], (v) => { enemies[ei].x = v[0]; enemies[ei].y = v[1]; })
    : { label: 'enemy', err: '生存している敵が居ない' };

  /* ── (4) 探索フェーズ相当 — opts.steps=1 が効くこと ──────────────────────
   * ⚠⚠ 探索は戦闘手番ではないので D&D の Speed を適用しない。
   *   実装では enemyAdvanceOneTile と allyAdvanceTowardPoint の**両方**が opts.steps を見る。
   *   片方だけ直したとき (敵は 1 / 仲間は 6) 探索が停滞するのを driver_graph_sce1 の
   *   DIAG stall が実測した — あちらが「呼び出し側が steps:1 を渡しているか」の検出器で、
   *   ここは「受け取り側が steps を尊重するか」の検出器。2 つで対になる。 */
  R.explore = {};
  if (alive.length) {
    const a0 = alive[0];
    R.explore.ally = await measure('explore:ally', a0, () => cTile(a0), placeUnit(a0),
      (gx, gy) => allyAdvanceTowardPoint(a0, gx, gy, { steps: 1, silent: true }),
      () => [a0.x, a0.y], (v) => { a0.x = v[0]; a0.y = v[1]; });
  }
  if (ei >= 0) {
    R.explore.enemy = await measure('explore:enemy', enemies[ei], () => cTile(enemies[ei]), placeUnit(enemies[ei]),
      (gx, gy) => enemyAdvanceOneTile(ei, gx, gy, { steps: 1, silent: true }),
      () => [enemies[ei].x, enemies[ei].y], (v) => { enemies[ei].x = v[0]; enemies[ei].y = v[1]; });
  }

  return R;
};

/* ⭐ 合成ユニットで getMoveLimit の表を直に引く。
 * ⚠ これは「実装とドライバの規則が一致するか」型の assert なので、**単独では弱い**
 *   (両方が同じ誤りを共有していると永久に緑)。§2 の実プレイ計測と §7 の変異と
 *   組み合わせて初めて意味を持つ。ここに置く理由は、党の編成がランダムでも
 *   ドワーフ / ヘイスト / 鈍足 / 転倒 の枝を**決定論的に**踏めること。 */
const PROBE = function () {
  const g = (u) => getMoveLimit(u);
  return {
    legacy: (typeof MOVE_LEGACY !== 'undefined') ? !!MOVE_LEGACY : null,
    warrior:   g({ classKey: 'warrior' }),
    dwarf:     g({ classKey: 'dwarf' }),
    enemyDef:  g({ def: {} }),
    enemyFast: g({ def: { speedTiles: 8 } }),
    haste:     g({ classKey: 'warrior', buffs: { hastedRemaining: 2 } }),
    bless:     g({ classKey: 'warrior', buffs: { blessMoveRemaining: 2 } }),
    slowed:    g({ classKey: 'warrior', __moveBlockedThisTurn: true }),
    prone:     g({ classKey: 'warrior', statusEffects: [{ id: 'prone' }] }),
    dwarfSlow: g({ classKey: 'dwarf', __moveBlockedThisTurn: true }),
  };
};

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + (MUT_ORDER.length ? '   mutate ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / ') : '   (変異なし)'));
  const profile = require('./_pptr_profile')('df_gridp5_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });
  const errs = [];
  const base = MUTATE ? PORT_OF[MUTATE] : PORT;

  try {
    async function observe(port, query) {
      const page = await bootPage(browser, port, query, errs);
      const probe = await page.evaluate(PROBE);       // ⚠ MEASURE より先に (盤面を動かす前に)
      const meas = await page.evaluate(MEASURE, MIN_LANE);
      await page.close();
      meas.probe = probe;
      return meas;
    }

    mark('§0 装置 — 起動と凍結');
    const M = await observe(base, '?intel=0');

    check('(0a) 舞台が読めた (mapDef / 部屋の矩形)', !!M.room && M.room.w > 0 && M.room.h > 0,
      'id=' + (M.room && M.room.mapId) + ' room=' + (M.room && (M.room.w + 'x' + M.room.h)));
    check('(0b) 射程・視界の台帳が読めた',
      !!M.range && Object.keys(M.range).length >= 7 && !!M.sight && Object.keys(M.sight).length >= 6,
      'range=' + Object.keys(M.range || {}).length + ' sight=' + Object.keys(M.sight || {}).length);
    /* ⭐ 凍結を信用せず実測する。ここが緑でないと §2 の歩数は丸ごと嘘になる。 */
    check('(0c) ★encounterActive=true で盤面が凍る (放置して主人公のタイルが動かない)',
      !!M.frozen && M.frozen.still,
      'a=' + JSON.stringify(M.frozen && M.frozen.a) + ' b=' + JSON.stringify(M.frozen && M.frozen.b));
    /* ⭐ 歩数を数えるカウンタそのもので静止を測る。ここが赤いまま §2 を読むと、
     *   走り残った探索ターンの 1 歩が「実装が 7 歩動いた」ように見える。 */
    check('(0d) ★計測前に盤面が静止した (400ms 間 firstTileStep が 1 度も呼ばれない)',
      !!M.quiet && M.quiet.quiet, 'waited=' + (M.quiet && M.quiet.waitedMs) + 'ms');

    // ══ §1 母集団ガード ════════════════════════════════════════════════════
    mark('§1 母集団ガード — 舞台が卓上大部屋であること');
    /* ⚠⚠ 7x6 の小部屋 (MID) では対角 9.2 タイルしかなく、6 タイル移動も 12 タイル射程も
     *   部屋に収まらない。ここが赤いまま §2/§3 を読んでも意味が無い。 */
    check('(1a) 舞台は廃坑 n0 の卓上大部屋 (33x22)',
      !!M.room && M.room.w === N0_CELLS[0] && M.room.h === N0_CELLS[1],
      'got=' + (M.room && (M.room.w + 'x' + M.room.h)) + ' want=' + N0_CELLS.join('x'));
    check('(1b) 1 枚絵が貼られたカスタム幾何である (小部屋の自動生成ではない)',
      !!M.room && M.room.isCustom && M.room.painting === 'n0',
      'isCustom=' + (M.room && M.room.isCustom) + ' painting=' + (M.room && M.room.painting));
    /* ⭐ 「射程の梯子が原理的に効きうる舞台か」= 部屋の対角が最大射程より長いこと。
     *   7x6 (対角 9.2) では弓 12 が部屋全体に届き、梯子の assert が永久に緑になる。 */
    {
      const maxR = Math.max.apply(null, Object.keys(M.range).map(k => M.range[k].tiles));
      check('(1c) ★部屋の対角 > 最大射程 (梯子が原理的に効きうる舞台)',
        !!M.room && M.room.diag > maxR, 'diag=' + (M.room && M.room.diag) + ' maxRange=' + maxR);
    }

    // ══ §2 移動の実測 (目的側) ═════════════════════════════════════════════
    mark('§2 移動 — 1 手番で実際に何タイル動いたか');
    /* ⚠ パーティ編成は実行ごとにランダム。期待値は wantTiles(classKey) で職業ごとに引く
     *   (ドワーフだけ D&D の Speed 20ft = 4 マス)。 */
    const legs = [];
    legs.push({ tag: '(2a)', name: 'player(' + (M.leaderClass || '?') + ')', L: M.player,
                want: wantTiles(M.leaderClass) });
    (M.allies || []).forEach((L, i) => {
      legs.push({ tag: '(2b' + (i + 1) + ')', name: L.label, L: L, want: wantTiles(L.classKey) });
    });
    legs.push({ tag: '(2c)', name: 'enemy(' + (M.enemyName || '?') + ')', L: M.enemy,
                want: WANT_MOVE_TILES });

    for (const g of legs) {
      const L = g.L;
      if (!L || L.err) { check(g.tag + ' ' + g.name + ' の計測が成立した', false, (L && L.err) || 'no data'); continue; }
      note(g.tag + ' ' + g.name + ' 実測',
        'from=' + JSON.stringify(L.from) + ' → to=' + JSON.stringify(L.to) +
        '  steps=' + L.steps + ' dtile=' + L.dtile + ' limit=' + L.limit + ' ms=' + L.ms +
        ' (lane row' + L.laneTy + ' ' + L.laneX0 + '→' + L.laneX1 + ' len=' + L.laneLen + ')');
      check(g.tag + ' ' + g.name + ' は 1 手番で ' + g.want + ' タイル動く',
        L.steps === g.want && L.dtile === g.want,
        'steps=' + L.steps + ' dtile=' + L.dtile + ' want=' + g.want);
      /* ⚠ 歩数 (pathCalls) とタイル差分 (Manhattan) が食い違う = 経路が迂回した
       *   = レーンが汚れている。測定そのものが信用できないので申告する。 */
      check(g.tag.replace(')', 'z)') + ' ' + g.name + ' の経路が直線 (歩数 = タイル差分)',
        L.steps === L.dtile && L.hardFail === 0,
        'steps=' + L.steps + ' dtile=' + L.dtile + ' hardFail=' + L.hardFail + ' rescued=' + L.rescued);
      /* ⚠ 実際に踏んだ歩数と getMoveLimit の戻り値が食い違ったら、
       *   「歩数を数える計測器」か「歩数を決める実装」のどちらかが壊れている。 */
      check(g.tag.replace(')', 'y)') + ' ' + g.name + ' の実歩数 = getMoveLimit の戻り値',
        L.steps === L.limit, 'steps=' + L.steps + ' limit=' + L.limit);
      if (L.steps > 0) {
        const per = Math.round(L.ms / L.steps);
        note(g.tag.replace(')', 't)') + ' ' + g.name + ' のテンポ',
          per + ' ms/タイル (合計 ' + L.ms + ' ms / ' + L.steps + ' 歩)');
        check(g.tag.replace(')', 't)') + ' ' + g.name + ' は約 ' + WANT_MS_PER_TILE + ' ms/タイル',
          Math.abs(per - WANT_MS_PER_TILE) <= MS_TOL, per + ' ms/タイル');
      }
    }

    /* ⭐⭐⭐ 本ドライバの主役 = 穴 (b) の検出器。
     *   `enemyAdvanceOneTile` は steps ループを持たない (index.html:17807 は getMoveLimit を
     *   「0 か否か」の門にしか使っていない) ので、base を 1→6 にすると
     *   **PT だけ 6 タイル・敵は 1 タイル**になり、カイティングでゲームが崩壊する。
     *   今 (1 vs 1) も実装後 (6 vs 6) も緑で、**敵のループを入れ忘れた瞬間だけ赤くなる**。
     *   ⚠ 「同じ歩数」ではなく「敵が PT より遅くない」で測る。リーダーがドワーフ (4) の回に
     *     等号で測ると、正しい実装でも赤くなってしまう。 */
    {
      const ok = M.player && !M.player.err && M.enemy && !M.enemy.err;
      check('(2d) ★★★ 敵は主人公より遅くない (敵だけ 1 タイルに取り残されていない)',
        ok && M.enemy.steps >= M.player.steps,
        'player=' + (M.player && M.player.steps) + ' enemy=' + (M.enemy && M.enemy.steps));
    }
    /* ⭐ 探索フェーズは 1 タイルのまま (opts.steps が受け取り側で効いている)。 */
    for (const k of ['ally', 'enemy']) {
      const L = M.explore && M.explore[k];
      check('(2f:' + k + ') ★探索フェーズ相当 (opts.steps=1) は 1 タイルで止まる',
        !!L && !L.err && L.steps === 1 && L.dtile === 1,
        L ? ((L.err || ('steps=' + L.steps + ' dtile=' + L.dtile))) : 'no data');
    }
    /* ⚠ 装置 assert: 戦闘側が 1 タイルだと (2f) は何も測っていない。 */
    check('(2g) ★戦闘の歩数と探索の歩数が別の値である ((2f) が空振りしていない)',
      WANT_MOVE_TILES !== 1, 'combat=' + WANT_MOVE_TILES + ' explore=1');

    /* ⚠ 母集団ガード: 仲間を 1 人も測れていないと (2b*) が丸ごと空振りする。 */
    check('(2e) ★仲間を 1 人以上測れた (2b* が空振りしていない)',
      (M.allies || []).length >= 1, 'n=' + (M.allies || []).length +
      ' [' + (M.allies || []).map(a => a.classKey).join(',') + ']');

    // ══ §3 射程 / 視界 / 交戦距離の台帳 ═══════════════════════════════════════
    mark('§3 台帳 — RANGE / CLASS_SIGHT / engagePx');
    for (const k of Object.keys(WANT_RANGE)) {
      const got = M.range[k];
      check('(3a:' + k + ') 射程 ' + WANT_RANGE[k] + ' タイル',
        !!got && got.tiles === WANT_RANGE[k], 'got=' + (got && got.tiles) + ' want=' + WANT_RANGE[k]);
    }
    for (const k of Object.keys(WANT_SIGHT)) {
      const got = M.sight[k];
      check('(3b:' + k + ') 視界 ' + WANT_SIGHT[k] + ' タイル',
        !!got && got.tiles === WANT_SIGHT[k], 'got=' + (got && got.tiles) + ' want=' + WANT_SIGHT[k]);
    }
    for (const k of Object.keys(WANT_ENGAGE)) {
      const got = M.range[k];
      check('(3c:' + k + ') 交戦開始 ' + WANT_ENGAGE[k] + ' px',
        !!got && got.engagePx === WANT_ENGAGE[k], 'got=' + (got && got.engagePx) + ' want=' + WANT_ENGAGE[k]);
    }
    /* ⭐⭐ 光半径 (px)。
     *   ⚠⚠ STEP 0 で「outer/(tiles*TILE) が一定 (約 0.86)」と書いたのは戦士 1 職からの
     *     一般化で誤り。実測 6 職は 0.903/0.859/0.859/0.859/0.833/0.816 と下がる。
     *     旧値は一次式 outer = 70*tiles + 50 に誤差ゼロで乗るが、t=12 まで外挿すると
     *     「描かれる光」と「霧が晴れる範囲」の差が 1.4 → 2.7 タイルへ開くので、
     *     新値は**比例**で決めた (index.html の CLASS_SIGHT 注記と対)。
     *   ⭐ 法則そのものを assert すると仕様変更のたびに書き換えになるので、
     *     ① 職ごとの台帳と ② **旧値でも新値でも成り立つ不変条件** の 2 段で測る。 */
    {
      const ks = Object.keys(M.sight);
      note('(3d) 光半径の実測', ks.map(k =>
        k + '(t' + M.sight[k].tiles + ')=' + M.sight[k].inner + '/' + M.sight[k].outer).join(' '));
      for (const k of Object.keys(WANT_LIGHT)) {
        const g = M.sight[k];
        check('(3d:' + k + ') 光半径 ' + WANT_LIGHT[k].join('/'),
          !!g && g.inner === WANT_LIGHT[k][0] && g.outer === WANT_LIGHT[k][1],
          'got=' + (g && (g.inner + '/' + g.outer)));
      }
      /* 不変条件① 描かれる光は霧の晴れる範囲より内側 (逆だと真っ暗な場所の霧だけ晴れる)。 */
      const badIn = ks.filter(k => !(M.sight[k].outer < M.sight[k].tiles * TILE));
      check('(3e) ★outer < tiles*TILE が全職で成立 (光は視界より内側)', badIn.length === 0,
        badIn.join(',') || 'all ok');
      /* 不変条件② 視界が広い職ほど光も大きい (単調)。 */
      const sorted = ks.slice().sort((a, b) => M.sight[a].tiles - M.sight[b].tiles);
      let mono = true;
      for (let i = 1; i < sorted.length; i++) {
        if (M.sight[sorted[i]].outer < M.sight[sorted[i - 1]].outer) mono = false;
      }
      check('(3f) ★視界が広い職ほど outer も大きい (単調)', mono,
        sorted.map(k => k + ':' + M.sight[k].outer).join(' '));
      /* ⚠ 装置 assert: 視界が 1 種類しか無いと (3e)(3f) は何も測っていない。 */
      const distinct = new Set(ks.map(k => M.sight[k].tiles)).size;
      check('(3g) ★視界の値が 2 種類以上ある ((3f) が空振りしていない)', distinct >= 2,
        'distinct=' + distinct);
    }

    // ══ §3x 入場地点と敵の距離 (廃坑 n0 の開幕 3 択 EV-2 を守る不変条件) ═══════
    /* ⭐⭐⭐ engagePx を一律に伸ばすと壊れるものを、**目的の側**で測る。
     *   「起点タイルから敵までの距離 > その敵の engagePx」= 入場した瞬間に戦闘が始まらない。
     *   index.html:32849 が「起点から 7.8 / 9.2 タイル離すこと」と明記している前提そのもの。
     *   ⚠ 手段 (melee の engagePx が 400 のままか) ではなく目的で測る。 */
    mark('§3x 入場即戦闘の防止 — 起点から敵までの距離 > engagePx');
    {
      const gaps = M.spawnGaps || [];
      check('(3x0) ★起点に対する敵の距離を 1 体以上測れた (母集団が空でない)',
        gaps.length >= 1, 'n=' + gaps.length);
      for (const g of gaps) {
        note('(3x:' + g.name + ')', g.distTiles.toFixed(1) + ' タイル (' + Math.round(g.distPx) +
          'px) vs engagePx ' + g.engagePx + ' (' + g.range + ')');
        check('(3x:' + g.name + ') 起点から engagePx より遠い (入場即戦闘にならない)',
          g.distPx > g.engagePx,
          Math.round(g.distPx) + 'px vs ' + g.engagePx + 'px');
      }
    }

    // ══ §4 ベースライン台帳の書き出し (STEP 2 以降の比較用) ═══════════════════
    mark('§4 ベースライン記録');
    note('(4z) 計測レーン', M.lane ? ('row' + M.lane.ty + '  col' + M.lane.x0 + '→' + M.lane.x1 + '  len=' + M.lane.len) : '(なし)');
    note('(4a) 部屋', M.room.w + 'x' + M.room.h + ' 対角 ' + M.room.diag + ' タイル  id=' + M.room.mapId);
    note('(4b) 編成', 'leader=' + (M.leaderClass || '?') + '  仲間=' +
      ((M.allies || []).map(a => (a.name || '?') + '(' + a.classKey + ')').join(' ') || '(なし)'));
    note('(4c) 敵', M.enemyName || '(なし)');
    note('(4d) 射程', Object.keys(M.range).map(k => k + '=' + M.range[k].tiles).join(' '));
    note('(4e) 視界', Object.keys(M.sight).map(k => k + '=' + M.sight[k].tiles).join(' '));
    note('(4f) 交戦', Object.keys(M.range).map(k => k + '=' + M.range[k].engagePx).join(' '));
    /* 接近ラウンド数の見積り: 交戦開始距離から隣接 (1 タイル) まで詰めるのに要る手番数。
     * ⭐ 「移動 6 マスで接近ラウンドが 5〜6 → 1〜2 に減る」という設計書の主張を数字で追える。 */
    {
      const mv = M.player && !M.player.err ? M.player.steps : 0;
      const rows = Object.keys(M.range).map(k => {
        const startT = M.range[k].engagePx / TILE;
        const rounds = mv > 0 ? Math.ceil(Math.max(0, startT - 1) / mv) : Infinity;
        return k + ': 開始' + startT.toFixed(1) + 'タイル → 接敵まで' + rounds + 'ラウンド';
      });
      note('(4g) 接近ラウンド数の見積り (移動 ' + mv + ' タイル/手番)', rows.join(' / '));
    }

    // ══ §5 Speed の表 (合成ユニット probe) ═══════════════════════════════════
    mark('§5 Speed の表 — ドワーフ / ヘイスト / 鈍足 / 転倒');
    {
      const P = M.probe;
      const want = {
        warrior:   WANT_MOVE_TILES,
        dwarf:     WANT_MOVE_TILES_DWARF,
        enemyDef:  WANT_MOVE_TILES,
        enemyFast: 8,                              // def.speedTiles による個別上書き
        haste:     WANT_MOVE_TILES + 6,            // Haste = 速度 +30ft (実質 2 倍)
        bless:     WANT_MOVE_TILES + 2,
        slowed:    Math.floor(WANT_MOVE_TILES / 2),      // Slow = 速度半減
        prone:     0,
        dwarfSlow: Math.floor(WANT_MOVE_TILES_DWARF / 2),
      };
      note('(5*) probe 実測', Object.keys(P).map(k => k + '=' + P[k]).join(' '));
      for (const k of Object.keys(want)) {
        check('(5:' + k + ') getMoveLimit = ' + want[k], P[k] === want[k],
          'got=' + P[k] + ' want=' + want[k]);
      }
      /* ⚠ 装置 assert: ドワーフと既定が同じ値だと (5:dwarf) は何も測っていない。 */
      check('(5z) ★ドワーフと既定が別の値である (dwarf 枝の assert が空振りしていない)',
        WANT_MOVE_TILES_DWARF !== WANT_MOVE_TILES,
        'dwarf=' + WANT_MOVE_TILES_DWARF + ' default=' + WANT_MOVE_TILES);
    }

    // ══ §6 退避スイッチ ?dndmove=0 ═══════════════════════════════════════════
    mark('§6 退避スイッチ — ?dndmove=0 で旧仕様へ戻る');
    {
      const G = await observe(base, '?intel=0&dndmove=0');
      check('(6a) ★MOVE_LEGACY が立っている (スイッチが読めている)', G.probe.legacy === true,
        'legacy=' + G.probe.legacy);
      const oldWant = { warrior: 1, dwarf: 1, enemyDef: 1, enemyFast: 1,
                        haste: 2, bless: 2, slowed: 0, prone: 0, dwarfSlow: 0 };
      note('(6*) legacy probe 実測', Object.keys(G.probe).map(k => k + '=' + G.probe[k]).join(' '));
      for (const k of Object.keys(oldWant)) {
        check('(6:' + k + ') 旧仕様の getMoveLimit = ' + oldWant[k], G.probe[k] === oldWant[k],
          'got=' + G.probe[k] + ' want=' + oldWant[k]);
      }
      const legs2 = [G.player].concat(G.allies || []).concat([G.enemy]).filter(L => L && !L.err);
      check('(6b) ★実プレイでも 3 経路すべてが 1 タイルに戻る',
        legs2.length >= 3 && legs2.every(L => L.steps === 1 && L.dtile === 1),
        legs2.map(L => L.label + '=' + L.steps).join(' '));
    }

    // ══ §6b 退避スイッチ ?dndrange=0 ════════════════════════════════════════
    mark('§6b 退避スイッチ — ?dndrange=0 で射程・視界・交戦距離が旧仕様へ戻る');
    {
      const G = await observe(base, '?intel=0&dndrange=0');
      let bad = [];
      for (const k of Object.keys(OLD_RANGE)) if (!G.range[k] || G.range[k].tiles !== OLD_RANGE[k]) bad.push('range.' + k);
      for (const k of Object.keys(OLD_ENGAGE)) if (!G.range[k] || G.range[k].engagePx !== OLD_ENGAGE[k]) bad.push('engage.' + k);
      for (const k of Object.keys(OLD_SIGHT)) if (!G.sight[k] || G.sight[k].tiles !== OLD_SIGHT[k]) bad.push('sight.' + k);
      check('(6c) ★?dndrange=0 で射程・交戦距離・視界がすべて旧値へ戻る', bad.length === 0,
        bad.join(' ') || 'all ok');
      /* ⚠ 装置 assert: 新値と旧値が同じキーがあると (6c) はそこを何も測っていない。 */
      const same = Object.keys(OLD_RANGE).filter(k => OLD_RANGE[k] === WANT_RANGE[k]);
      check('(6d) ★旧値と新値が違うキーが 5 つ以上ある ((6c) が空振りしていない)',
        Object.keys(OLD_RANGE).length - same.length >= 5,
        '同値のまま: ' + (same.join(',') || 'なし'));
      /* ⭐ 移動は ?dndrange=0 では戻らない (スイッチが 2 本に分かれている証明)。 */
      check('(6e) ★?dndrange=0 では移動は D&D のまま (2 本のスイッチが独立している)',
        !!G.player && !G.player.err && G.player.steps === WANT_MOVE_TILES,
        'player=' + (G.player && (G.player.err || G.player.steps)));
    }

    // ══ §7 負のコントロール ══════════════════════════════════════════════════
    mark('§7 負のコントロール');
    if (!MUTATE) {
      {
        const X = await observe(PORT_OF.noenemyloop, '?intel=0');
        check('(7a) ★★★ noenemyloop → 敵だけ 1 タイルに戻り (2c)(2d) が赤くなる',
          !!X.enemy && !X.enemy.err && X.enemy.steps === 1,
          'enemy=' + (X.enemy && (X.enemy.err || X.enemy.steps)));
        check('(7a2) ★そのとき PT は 6 タイルのまま = 外科的に敵だけ壊れている',
          !!X.player && !X.player.err && X.player.steps === WANT_MOVE_TILES,
          'player=' + (X.player && (X.player.err || X.player.steps)));
      }
      {
        const X = await observe(PORT_OF.nomovebase, '?intel=0');
        /* ⚠ ドワーフ枝は生きているので仲間側は編成しだい。**敵は必ず既定を通る**ので
         *   ここを見るのが決定論的。 */
        check('(7b) ★nomovebase → 既定 Speed が 1 に戻り (2c) が赤くなる',
          !!X.enemy && !X.enemy.err && X.enemy.steps === 1,
          'enemy=' + (X.enemy && (X.enemy.err || X.enemy.steps)));
        check('(7b2) ★そのときドワーフ枝は生きたまま = 外科的に既定だけ壊れている',
          X.probe.dwarf === WANT_MOVE_TILES_DWARF, 'dwarf=' + X.probe.dwarf);
      }
      {
        const X = await observe(PORT_OF.nodwarfspeed, '?intel=0');
        check('(7c) ★nodwarfspeed → ドワーフが既定と同じ速さになり (5:dwarf) が赤くなる',
          X.probe.dwarf !== WANT_MOVE_TILES_DWARF && X.probe.dwarf === WANT_MOVE_TILES,
          'dwarf=' + X.probe.dwarf);
        check('(7c2) ★そのとき既定は無傷 = 外科的にドワーフ枝だけ壊れている',
          X.probe.warrior === WANT_MOVE_TILES && X.probe.enemyDef === WANT_MOVE_TILES,
          'warrior=' + X.probe.warrior + ' enemyDef=' + X.probe.enemyDef);
      }
      {
        const X = await observe(PORT_OF.nolegacyswitch, '?intel=0&dndmove=0');
        check('(7d) ★nolegacyswitch → ?dndmove=0 が効かなくなり §6 が赤くなる',
          X.probe.legacy === false && X.probe.warrior === WANT_MOVE_TILES,
          'legacy=' + X.probe.legacy + ' warrior=' + X.probe.warrior);
      }
      {
        const X = await observe(PORT_OF.norangeladder, '?intel=0');
        check('(7e) ★norangeladder → 弓の射程が旧値に戻り (3a:bow) が赤くなる',
          X.range.bow.tiles === 6, 'bow=' + X.range.bow.tiles);
        check('(7e2) ★そのとき術単は無傷 = 外科的に弓だけ壊れている',
          X.range.spellSingle.tiles === WANT_RANGE.spellSingle, 'spellSingle=' + X.range.spellSingle.tiles);
      }
      {
        const X = await observe(PORT_OF.nosightwiden, '?intel=0');
        check('(7f) ★nosightwiden → ドワーフの視界が旧値に戻り (3b:dwarf) が赤くなる',
          X.sight.dwarf.tiles === 6 && X.sight.dwarf.outer === 470,
          'dwarf=' + X.sight.dwarf.tiles + ' outer=' + X.sight.dwarf.outer);
        check('(7f2) ★そのとき戦士は無傷 = 外科的にドワーフだけ壊れている',
          X.sight.warrior.tiles === WANT_SIGHT.warrior, 'warrior=' + X.sight.warrior.tiles);
      }
      {
        const X = await observe(PORT_OF.noengageguard, '?intel=0');
        const broke = (X.spawnGaps || []).filter(g => !(g.distPx > g.engagePx));
        check('(7g) ★★★ noengageguard → 近接の engagePx を伸ばすと起点の見張りが射程内に入り (3x) が赤くなる',
          broke.length >= 1,
          (X.spawnGaps || []).map(g => Math.round(g.distPx) + '/' + g.engagePx).join(' '));
        check('(7g2) ★壊れるのは近い方の 1 体だけ = 「750px < 768px < 885px」を実測している',
          broke.length === 1, 'broke=' + broke.length + ' / ' + (X.spawnGaps || []).length);
      }
      {
        const X = await observe(PORT_OF.nolegacyrange, '?intel=0&dndrange=0');
        check('(7h) ★nolegacyrange → ?dndrange=0 が効かなくなり §6b が赤くなる',
          X.range.bow.tiles === WANT_RANGE.bow && X.sight.dwarf.tiles === WANT_SIGHT.dwarf,
          'bow=' + X.range.bow.tiles + ' dwarfSight=' + X.sight.dwarf.tiles);
      }
    } else {
      console.log('  (--mutate ' + MUTATE + ' が指定されたので §7 は省略)');
    }

    // ══ §E 例外 ══════════════════════════════════════════════════════════════
    mark('§E ページ例外 / console.error');
    check('(E1) 全ページ・全操作で pageerror / console.error が 0',
      errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');

  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  PASS ' + pass + ' / FAIL ' + fail + (MUTATE ? '   (--mutate ' + MUTATE + ')' : ''));
  console.log('════════════════════════════════════════');
  if (fail) { console.log('[drv] FAILED:'); for (const f of fails) console.log('   - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
