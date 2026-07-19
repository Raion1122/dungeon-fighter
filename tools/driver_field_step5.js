#!/usr/bin/env node
/*
 * driver_field_step5.js — 「地平線ビュー STEP5 = 既存潜在バグの単独修正」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 計画書: dev-meetings/2026-07-19_隊商護衛の地平線ビュー.md  §4 STEP 5 / §6 是正一覧
 *
 * ■ 検証対象 (3件)
 *   P0  spawnWagon         … wagonSpawns の tx/ty を **displaySize フットプリント全体**で検査する
 *   P3  findSovereignAddWaveTile … フォールバックに isTileWall 検査 (防御的)
 *   P3  spawnWave          … by クランプ (防御的)
 *
 * ■ このドライバの中核: 「非退行」は baseline との**実測比較**でしか主張しない
 *   修正前コミット (既定 68b7ec9) を git worktree に展開し、同じペイロード・同じ乱数シードで
 *   両方をロードして値を突き合わせる。HEAD 同士の比較 (= 現在 vs 現在) は無意味な PASS に
 *   化けるため禁止 (計画書 STEP1 の検証 assert 4 と同じ戒め)。
 *
 * ■ 判定の骨子
 *   (A) 正常系 wagonSpawns [{tx:9,ty:13}] で馬車の world 座標が baseline と**ビット一致**
 *   (B) 異常系 (壁内 / 場外 / フットプリントだけが壁に掛かる座標) で
 *       ・baseline は壁にめり込む (= assert 自体が有効であることの証明)
 *       ・修正版はフットプリント全体が非壁の位置へ着地する
 *   (C) 非数値座標は無言で通さず reject する
 *   (D) findSovereignAddWaveTile: 全格子点で「baseline が非壁を返した点は完全一致」かつ
 *       「修正版は決して壁を返さない」
 *   (E) spawnWave の by クランプが正常系で no-op (馬車/主人公の行が 1..MAP_H-2 の内側)
 *   (F) RNG 非汚染: 修正コードが Math.random を 1 度も引かない (呼び出し回数を baseline と比較)
 *
 * 使い方:
 *   node tools/driver_field_step5.js [--headful] [--browser <path>] [--port N]
 *                                    [--baseline-rev 68b7ec9] [--baseline-dir <path>]
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8801'), 10);
const BASELINE_PORT = PORT + 1;
const BASELINE_REV = arg('baseline-rev', '68b7ec9');
const BASELINE_DIR = arg('baseline-dir', path.join(os.tmpdir(), 'df_step5_baseline'));

const TILE_SIZE = 96;
const WAGON_DS = 240;          // ENEMY_TYPES.caravanWagon.displaySize (index.html:5781)

// ── 隊商護衛の生成クエストペイロード (driver_field_step0.js と同形) ──────────
// ⚠️ themeId:"caravan-road" が FIELD_THEMES 唯一の屋外キー。ここを外すと別シナリオを測ることになる。
// ⚠️ 敵キーは ENEMY_TYPES 実在のもののみ (未知キーは無言消去され goblin-mine へフォールバックする)。
function payload(wagonSpawns) {
  return {
    title: '隊商の街道 — 積荷の護衛',
    flavor: '隊商の馬車を街道の果てまで守り抜け。',
    spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
    clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
    themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
    waves: [{ count: 3, pool: ['goblin', 'goblinArcher'] }],
    wagonSpawns: wagonSpawns,
  };
}

// ── puppeteer / Chrome の解決 (driver_field_step0.js と同じ作法) ─────────────
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

// ── baseline を git worktree に展開 (「現在 vs 現在」の空 PASS を防ぐ) ────────
function prepareBaseline() {
  const marker = path.join(BASELINE_DIR, 'index.html');
  if (fs.existsSync(marker)) {
    let head = '';
    try { head = execFileSync('git', ['-C', BASELINE_DIR, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) {}
    if (head && (BASELINE_REV.indexOf(head) === 0 || head.indexOf(BASELINE_REV) === 0)) {
      console.log('[drv] baseline worktree 再利用: ' + BASELINE_DIR + ' @ ' + head);
      return;
    }
    console.log('[drv] baseline worktree が別リビジョン (' + head + ') なので作り直す');
    try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', BASELINE_DIR], { encoding: 'utf8' }); } catch (e) {}
  }
  console.log('[drv] baseline worktree を作成: ' + BASELINE_DIR + ' @ ' + BASELINE_REV);
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', BASELINE_DIR, BASELINE_REV],
               { encoding: 'utf8', stdio: 'pipe' });
}

// ── 静的サーバ (file:// は音声等が壊れるので http 必須) ──────────────────────
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, root) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        let fp = path.join(root, u);
        // baseline worktree に無いアセット (未コミットの png 等) は本体側から借りる
        if (!fs.existsSync(fp) && root !== ROOT) fp = path.join(ROOT, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

// ── 判定 ────────────────────────────────────────────────────────────────────
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

// ── プレリュード: ペイロード注入 + Math.random 固定シード + 呼び出し回数計数 ──
// ⚠️ startGame() は呼ばない。spawnWagon はセットアップ末尾 [L24511 相当] で既に走っており、
//    馬車の座標決定はロード時点で完了している。実プレイ進行は不要 (RNG も動かさない)。
function prelude(cfg) {
  try {
    sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
    sessionStorage.removeItem('dragonfighters.currentScenario');
    sessionStorage.removeItem('dragonfighters.questFlags');
  } catch (e) {}
  window.__wagonProbe = [];
  window.__warns = [];
  const _w = console.warn;
  console.warn = function () { try { window.__warns.push(Array.prototype.join.call(arguments, ' ')); } catch (e) {} return _w.apply(console, arguments); };

  // 固定シード + 呼び出し回数計数 (RNG 消費順の非退行を「回数」で機械判定する)
  let _s = 20260719 >>> 0;
  window.__rngCalls = 0;
  Math.random = function () { window.__rngCalls++; _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
}

// ── in-page プローブ ────────────────────────────────────────────────────────
// page.evaluate はグローバルスコープでコンパイルされるので index.html script top-level の
// let/const (mapData / enemies / wagonIndices / MAP_W …) に bare 名で到達できる
// (driver_field_step0.js / step1.js が実証済みの作法)。
async function probe(page, C) {
  return page.evaluate((C) => {
    const TILE = C.TILE_SIZE, DS = C.WAGON_DS;
    // ドライバ側で独立に再実装したフットプリント判定 (本体の実装を信用しない)
    const fpOf = (tx, ty) => {
      const px = tx * TILE + TILE / 2 - DS / 2, py = ty * TILE + TILE / 2 - DS / 2;
      return { tx0: Math.floor(px / TILE), tx1: Math.floor((px + DS - 1) / TILE),
               ty0: Math.floor(py / TILE), ty1: Math.floor((py + DS - 1) / TILE) };
    };
    // ⚠️ 2つの述語を厳密に区別する。混ぜると STEP5 の合否が seed 依存になる。
    //   structWallAt … 構造壁 (mapData===2) と場外。**馬車クランプの対象**。決定論。
    //   wallAt       … structWallAt + 情景スプライト (obstacleTileMask の倒木/大型葦)。
    //                  index.html の isTileWall と同義。findSovereignAddWaveTile はこちらを使う。
    //                  倒木の配置は buildMap の乱数依存なので、馬車の移設判定には使わない
    //                  (倒木と馬車の重なりは計画書 §6 P1 = STEP1 の担当)。
    const structWallAt = (x, y) => {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
      return mapData[y][x] === 2;
    };
    const wallAt = (x, y) => {
      if (structWallAt(x, y)) return true;
      return obstacleTileMask[y * MAP_W + x] === 1;
    };
    const fpClear = (tx, ty) => {
      const f = fpOf(tx, ty);
      for (let y = f.ty0; y <= f.ty1; y++) for (let x = f.tx0; x <= f.tx1; x++) if (structWallAt(x, y)) return false;
      return true;
    };

    // ── 馬車の実測 ──
    const wagons = [];
    for (const i of (typeof wagonIndices !== 'undefined' ? wagonIndices : [])) {
      const w = enemies[i];
      if (!w) continue;
      const cx = w.x + DS / 2, cy = w.y + DS / 2;
      const ctx = Math.floor(cx / TILE), cty = Math.floor(cy / TILE);
      const f = { tx0: Math.floor(w.x / TILE), tx1: Math.floor((w.x + DS - 1) / TILE),
                  ty0: Math.floor(w.y / TILE), ty1: Math.floor((w.y + DS - 1) / TILE) };
      const wallTiles = [], sceneryTiles = [];
      for (let y = f.ty0; y <= f.ty1; y++) for (let x = f.tx0; x <= f.tx1; x++) {
        if (structWallAt(x, y)) wallTiles.push([x, y]);
        else if (obstacleTileMask[y * MAP_W + x] === 1) sceneryTiles.push([x, y]);
      }
      wagons.push({ idx: i, x: w.x, y: w.y, centerTile: [ctx, cty],
                    centerIsWall: structWallAt(ctx, cty), footprint: f,
                    footprintWallTiles: wallTiles, footprintClear: wallTiles.length === 0,
                    footprintSceneryTiles: sceneryTiles,
                    alive: !!w.alive, displaySize: (w.def && w.def.displaySize) || null });
    }

    // ── findSovereignAddWaveTile の格子スイープ ──
    // 全格子は重いので 3 タイル刻み + row13 帯を密に。
    const sweep = [];
    const pts = [];
    for (let y = 0; y < MAP_H; y += 3) for (let x = 0; x < MAP_W; x += 3) pts.push([x, y]);
    for (let x = 0; x < MAP_W; x += 2) pts.push([x, 13]);
    for (const p of pts) {
      const r = findSovereignAddWaveTile(p[0], p[1]);
      sweep.push({ in: p, out: [r.tx, r.ty], wall: wallAt(r.tx, r.ty), inWall: wallAt(p[0], p[1]) });
    }

    // ── spawnWave の by が正常系でクランプに掛からないことの確認 ──
    //    (bx/by の算出式は spawnWave 内のインラインコード。ここで同式を再現して観測する)
    let byRaw = null;
    const liveW = (typeof wagonIndices !== 'undefined' ? wagonIndices : []).filter(i => enemies[i] && enemies[i].alive);
    if (liveW.length) {
      const w = enemies[liveW[0]];
      byRaw = Math.floor((w.y + w.def.displaySize / 2) / TILE);
    } else {
      byRaw = Math.floor((playerY + 58) / TILE);
    }

    // ── 中心は非壁だがフットプリントだけが構造壁に掛かる座標 (異常系ケースDの自動発見) ──
    let fpOnlyBad = null;
    for (let y = 0; y < MAP_H && !fpOnlyBad; y++) for (let x = 0; x < MAP_W && !fpOnlyBad; x++) {
      if (!structWallAt(x, y) && !fpClear(x, y)) fpOnlyBad = [x, y];
    }
    // 中心が構造壁の座標 (異常系ケースB)
    let centerBad = null;
    for (let y = 0; y < MAP_H && !centerBad; y++) for (let x = 0; x < MAP_W && !centerBad; x++) {
      if (structWallAt(x, y)) centerBad = [x, y];
    }

    return {
      wagons, sweep, byRaw, fpOnlyBad, centerBad,
      mapW: MAP_W, mapH: MAP_H, enemiesLen: enemies.length,
      rngCalls: window.__rngCalls || 0,
      warns: (window.__warns || []).slice(),
      wagonProbe: (window.__wagonProbe || []).slice(),
      isFieldTheme: (function () { try { return IS_FIELD_THEME; } catch (e) { return '<unreadable>'; } })(),
      hasWagonSpawns: !!(currentScenario && currentScenario.wagonSpawns),
      scenarioTitle: currentScenario && currentScenario.title,
      playerRow: Math.floor((playerY + 58) / TILE),
    };
  }, C);
}

async function loadCase(browser, base, spawns) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, { payload: payload(spawns) });
  // ⚠️ ?intel=0 : 隠し中ボスの fail-open を封じて母集団を隊商護衛だけに保つ
  // ── [地平線ビュー STEP1] ?fieldgeo=0 で「従来の幾何」に固定する ──────────────
  // 本ドライバの検証対象は spawnWagon / findSovereignAddWaveTile / spawnWave の**座標安全化**で
  // あり、baseline は 68b7ec9 (帯幾何が入る前)。STEP1 の帯マスク (row 13-15 以外を tile=2) を
  // 効かせたまま比べると、比較しているのは座標クランプではなく「マップの形が違うこと」になり
  // 全面 FAIL する (実測 48/48 → 35/48)。内訳はすべてマップ由来:
  //   ・(9,13) の 3x3 フットプリントが row12 (帯外=壁) を踏むので "asis" が "footprint" に化ける
  //   ・帯行の情景予約で tryPlace の再試行回数が変わり Math.random 消費数が 499 → 149 になる
  //   ・findSovereignAddWaveTile / spawnWave の候補が帯の 3 行しか無くなる
  // ⚠️ ?fieldgeo=0 (幾何のみ無効) と ?field=0 (描画のみ無効) は独立。取り違え厳禁。
  // ⚠️ 帯幾何を有効にした状態での馬車配置は driver_field_step1_geo.js の (G5) が見ている
  //    (中心 (9,14) → ty13..15 が帯に収まる = 出荷ペイロード tavern.html は ty:14)。
  await page.goto(base + '/index.html?intel=0&fieldgeo=0', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return !!mapData && typeof findSovereignAddWaveTile === 'function' && typeof wagonIndices !== 'undefined'; }
    catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  const p = await probe(page, { TILE_SIZE, WAGON_DS });
  await page.close();
  p.pageErrors = pageErrors;
  return p;
}

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv = null, bsrv = null, browser = null;

  try {
    prepareBaseline();
    srv = await startServer(PORT, ROOT);
    bsrv = await startServer(BASELINE_PORT, BASELINE_DIR);
    const FIX = 'http://127.0.0.1:' + PORT;
    const BASE = 'http://127.0.0.1:' + BASELINE_PORT;
    console.log('[drv] 修正版 : ' + FIX + '  (root=' + ROOT + ')');
    console.log('[drv] baseline: ' + BASE + '  (root=' + BASELINE_DIR + ' @ ' + BASELINE_REV + ')');

    const profile = path.join(os.tmpdir(), 'df_pptr_profile_step5');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + profile],
    });

    // ══════════════════════════════════════════════════════════════════════
    mark('(A) 正常系 wagonSpawns [{tx:9,ty:13}] — baseline と完全一致すること');
    // ══════════════════════════════════════════════════════════════════════
    const NORMAL = [{ tx: 9, ty: 13 }];
    const fixN = await loadCase(browser, FIX, NORMAL);
    const basN = await loadCase(browser, BASE, NORMAL);

    check('(A0) 隊商護衛がロードされている (IS_FIELD_THEME / wagonSpawns)',
      fixN.isFieldTheme === true && fixN.hasWagonSpawns === true,
      'IS_FIELD_THEME=' + fixN.isFieldTheme + ' wagonSpawns=' + fixN.hasWagonSpawns + ' title="' + fixN.scenarioTitle + '"');
    check('(A0b) pageerror 0 (修正版)', fixN.pageErrors.length === 0,
      fixN.pageErrors.slice(0, 3).join(' | ') || 'none');
    check('(A0c) baseline も同じシナリオをロードしている', basN.isFieldTheme === true && basN.hasWagonSpawns === true,
      'IS_FIELD_THEME=' + basN.isFieldTheme + ' wagonSpawns=' + basN.hasWagonSpawns);
    check('(A1) 馬車が 1 台配置された (修正版)', fixN.wagons.length === 1, 'wagons=' + fixN.wagons.length);
    check('(A1b) 馬車が 1 台配置された (baseline)', basN.wagons.length === 1, 'wagons=' + basN.wagons.length);

    const fw = fixN.wagons[0] || {}, bw = basN.wagons[0] || {};
    check('(A2) ★非退行: 馬車の world 座標が baseline とビット一致',
      fw.x === bw.x && fw.y === bw.y,
      'fix=(' + fw.x + ',' + fw.y + ')  baseline=(' + bw.x + ',' + bw.y + ')');
    check('(A3) 非退行: 馬車の enemies[] 添字が baseline と一致 (DOM 並列を崩していない)',
      fw.idx === bw.idx, 'fix.idx=' + fw.idx + ' baseline.idx=' + bw.idx);
    check('(A4) 非退行: enemies.length が baseline と一致', fixN.enemiesLen === basN.enemiesLen,
      'fix=' + fixN.enemiesLen + ' baseline=' + basN.enemiesLen);
    check('(A5) ★RNG 非汚染: Math.random の呼び出し回数が baseline と一致',
      fixN.rngCalls === basN.rngCalls, 'fix=' + fixN.rngCalls + ' baseline=' + basN.rngCalls);
    check('(A6) 正常系ではフットプリント全体が非壁 (= 移設が起きる余地がない)',
      fw.footprintClear === true, 'wallTiles=' + JSON.stringify(fw.footprintWallTiles || []));
    check('(A7) 正常系では warn を出さない (黙って動く)',
      !fixN.warns.some(w => w.indexOf('[spawnWagon]') >= 0),
      'warns=' + JSON.stringify(fixN.warns.filter(w => w.indexOf('[spawnWagon]') >= 0)));
    check('(A8) __wagonProbe の outcome が "asis"',
      (fixN.wagonProbe[0] || {}).outcome === 'asis', JSON.stringify(fixN.wagonProbe[0] || null));
    check('(A9) STEP0 実測の再確認: 馬車のフットプリントは 3列x3行 (中心 (9,13) → tx8..10 / ty12..14)',
      fw.footprint && fw.footprint.tx0 === 8 && fw.footprint.tx1 === 10 &&
      fw.footprint.ty0 === 12 && fw.footprint.ty1 === 14, JSON.stringify(fw.footprint));
    // ★ 情景 (倒木) の重なりは「移設しないが観測する」契約。倒木の配置は乱数依存なので
    //   これを移設対象にすると馬車位置が seed 依存になる (= 出荷中クエストの非決定な移動)。
    //   重なりの解消は計画書 §6 P1 = STEP1 の担当。ここでは記録だけを assert する。
    check('(A10) 情景スプライトとの重なりは移設理由にしない (馬車は動かない)',
      fw.x === bw.x && fw.y === bw.y,
      '倒木の重なり=' + JSON.stringify(fw.footprintSceneryTiles || []) + ' → 移設なし');
    check('(A11) 情景との重なりは __wagonProbe.sceneryOverlap に記録され黙殺されない',
      Array.isArray((fixN.wagonProbe[0] || {}).sceneryOverlap) &&
      JSON.stringify((fixN.wagonProbe[0] || {}).sceneryOverlap) === JSON.stringify(fw.footprintSceneryTiles || []),
      'probe=' + JSON.stringify((fixN.wagonProbe[0] || {}).sceneryOverlap) +
      ' 実測=' + JSON.stringify(fw.footprintSceneryTiles || []));

    // ══════════════════════════════════════════════════════════════════════
    mark('(B) 異常系: 中心タイルが壁の座標');
    // ══════════════════════════════════════════════════════════════════════
    const cb = fixN.centerBad;
    check('(B0) 壁タイルがマップ上に存在する (ケースが成立する)', !!cb, 'centerBad=' + JSON.stringify(cb));
    if (cb) {
      const WALL = [{ tx: cb[0], ty: cb[1] }];
      const fixB = await loadCase(browser, FIX, WALL);
      const basB = await loadCase(browser, BASE, WALL);
      const fb = fixB.wagons[0] || {}, bb = basB.wagons[0] || {};
      check('(B1) ★assert 有効性: baseline は壁の中に馬車を置く (直っていないことの証明)',
        bb.centerIsWall === true,
        'baseline 中心タイル=' + JSON.stringify(bb.centerTile) + ' centerIsWall=' + bb.centerIsWall);
      check('(B2) 修正版は中心が非壁の位置へ着地する', fb.centerIsWall === false,
        'fix 中心タイル=' + JSON.stringify(fb.centerTile));
      check('(B3) 修正版はフットプリント全体が非壁', fb.footprintClear === true,
        'wallTiles=' + JSON.stringify(fb.footprintWallTiles || []));
      check('(B4) 移設を warn で観測できる (黙って失敗させない)',
        fixB.warns.some(w => w.indexOf('[spawnWagon]') >= 0),
        (fixB.warns.find(w => w.indexOf('[spawnWagon]') >= 0) || '(なし)').slice(0, 130));
      check('(B5) __wagonProbe の outcome が "footprint"',
        (fixB.wagonProbe[0] || {}).outcome === 'footprint', JSON.stringify(fixB.wagonProbe[0] || null));
      check('(B6) 異常系でも RNG 消費は増えない', fixB.rngCalls === basB.rngCalls,
        'fix=' + fixB.rngCalls + ' baseline=' + basB.rngCalls);
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('(C) 異常系: 場外座標 (負値 / MAP 範囲外)');
    // ══════════════════════════════════════════════════════════════════════
    const OOB = [['負値(-5,-5)', { tx: -5, ty: -5 }],
                 ['範囲外(999,999)', { tx: 999, ty: 999 }],
                 ['縦だけ範囲外(9,999)', { tx: 9, ty: 999 }]];
    for (const pair of OOB) {
      const label = pair[0], sp = pair[1];
      const fixC = await loadCase(browser, FIX, [sp]);
      const basC = await loadCase(browser, BASE, [sp]);
      const fc = fixC.wagons[0] || {}, bc = basC.wagons[0] || {};
      check('(C1-' + label + ') baseline は場外に置く (assert 有効性)',
        !!bc.centerTile && (bc.centerTile[0] < 0 || bc.centerTile[1] < 0 ||
                            bc.centerTile[0] >= basC.mapW || bc.centerTile[1] >= basC.mapH),
        'baseline 中心タイル=' + JSON.stringify(bc.centerTile));
      check('(C2-' + label + ') 修正版は盤内かつフットプリント全体が非壁',
        !!fc.centerTile && fc.centerTile[0] >= 0 && fc.centerTile[1] >= 0 &&
        fc.centerTile[0] < fixC.mapW && fc.centerTile[1] < fixC.mapH && fc.footprintClear === true,
        '中心タイル=' + JSON.stringify(fc.centerTile) + ' footprintClear=' + fc.footprintClear);
      check('(C3-' + label + ') RNG 消費が baseline と一致', fixC.rngCalls === basC.rngCalls,
        'fix=' + fixC.rngCalls + ' baseline=' + basC.rngCalls);
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('(D) ★本命: 中心は walkable だがフットプリントだけが壁に掛かる座標');
    // ══════════════════════════════════════════════════════════════════════
    // 「中心タイルが walkable か」だけを見るクランプでは救えないケース。
    // STEP1 で row13-15 にマスクすると ty12 が壁になり、まさにこの形になる。
    const fb2 = fixN.fpOnlyBad;
    check('(D0) そうした座標がマップ上に存在する (ケースが成立する)', !!fb2,
      'fpOnlyBad=' + JSON.stringify(fb2));
    if (fb2) {
      const EDGE = [{ tx: fb2[0], ty: fb2[1] }];
      const fixD = await loadCase(browser, FIX, EDGE);
      const basD = await loadCase(browser, BASE, EDGE);
      const fd = fixD.wagons[0] || {}, bd = basD.wagons[0] || {};
      check('(D1) ★assert 有効性: baseline は中心こそ非壁だがフットプリントが壁へめり込む',
        bd.centerIsWall === false && bd.footprintClear === false,
        'baseline centerIsWall=' + bd.centerIsWall + ' 壁に掛かるタイル=' + JSON.stringify(bd.footprintWallTiles));
      check('(D2) 修正版はフットプリント全体が非壁の位置へ移設する', fd.footprintClear === true,
        '(' + fb2 + ') → 中心タイル ' + JSON.stringify(fd.centerTile) +
        ' wallTiles=' + JSON.stringify(fd.footprintWallTiles || []));
      check('(D3) 移設は最寄り (Chebyshev 距離 <= 3) に収まっている',
        !!fd.centerTile && Math.max(Math.abs(fd.centerTile[0] - fb2[0]), Math.abs(fd.centerTile[1] - fb2[1])) <= 3,
        'r=' + (fd.centerTile ? Math.max(Math.abs(fd.centerTile[0] - fb2[0]), Math.abs(fd.centerTile[1] - fb2[1])) : '?'));
      check('(D4) RNG 消費が baseline と一致', fixD.rngCalls === basD.rngCalls,
        'fix=' + fixD.rngCalls + ' baseline=' + basD.rngCalls);
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('(E) 異常系: 非数値 / 欠損座標は無言で通さない');
    // ══════════════════════════════════════════════════════════════════════
    const BADPAIR = [{ tx: 'x', ty: null }, { tx: 9, ty: 13 }];
    const fixE = await loadCase(browser, FIX, BADPAIR);
    const basE = await loadCase(browser, BASE, BADPAIR);
    check('(E1) ★assert 有効性: baseline は NaN 座標の馬車を生成してしまう',
      basE.wagons.length === 2 &&
      basE.wagons.some(w => !Number.isFinite(w.x) || !Number.isFinite(w.y)),
      'baseline wagons=' + JSON.stringify(basE.wagons.map(w => [w.x, w.y])));
    check('(E2) 修正版は不正座標を reject し、正常な 1 台だけを配置する',
      fixE.wagons.length === 1 && Number.isFinite(fixE.wagons[0].x) && Number.isFinite(fixE.wagons[0].y),
      'fix wagons=' + JSON.stringify(fixE.wagons.map(w => [w.x, w.y])));
    check('(E3) reject を warn で観測できる',
      fixE.warns.some(w => w.indexOf('数値でない') >= 0),
      (fixE.warns.find(w => w.indexOf('[spawnWagon]') >= 0) || '(なし)').slice(0, 130));
    // ⚠️ sp 自体が null のケース。Number(null) は 0 なので、素朴な `sp && sp.tx` 実装だと
    //    NaN ではなく (0,0) に化けて左上隅 (構造壁) へ馬車が湧く = 検疫をすり抜ける。
    const NULLPAIR = [null, { tx: 9, ty: 13 }];
    const fixE2 = await loadCase(browser, FIX, NULLPAIR);
    check('(E5) sp === null も reject される ((0,0) に化けない)',
      fixE2.wagons.length === 1 && fixE2.wagons[0].x === fw.x && fixE2.wagons[0].y === fw.y,
      'wagons=' + JSON.stringify(fixE2.wagons.map(w => [w.x, w.y])) +
      ' probe=' + JSON.stringify(fixE2.wagonProbe));
    check('(E4) 後続の正常な馬車は正常系と同じ座標に着地する (1台目の失敗に巻き込まれない)',
      !!fixE.wagons[0] && fixE.wagons[0].x === fw.x && fixE.wagons[0].y === fw.y,
      '(' + (fixE.wagons[0] || {}).x + ',' + (fixE.wagons[0] || {}).y + ') vs 正常系 (' + fw.x + ',' + fw.y + ')');

    // ══════════════════════════════════════════════════════════════════════
    mark('(F) findSovereignAddWaveTile — 非退行 + 壁を返さない');
    // ══════════════════════════════════════════════════════════════════════
    const fsw = fixN.sweep, bsw = basN.sweep;
    check('(F0) スイープ点数が一致 (比較が成立する)', fsw.length === bsw.length && fsw.length > 0,
      'fix=' + fsw.length + ' baseline=' + bsw.length);
    const mismatch = [], fixWall = [], baseWall = [];
    for (let i = 0; i < Math.min(fsw.length, bsw.length); i++) {
      const a = fsw[i], b = bsw[i];
      if (!b.wall && (a.out[0] !== b.out[0] || a.out[1] !== b.out[1])) mismatch.push({ in: a.in, fix: a.out, base: b.out });
      if (a.wall) fixWall.push(a);
      if (b.wall) baseWall.push(b);
    }
    check('(F1) ★非退行: baseline が非壁を返した全点 (' + (bsw.length - baseWall.length) + '点) で修正版が完全一致',
      mismatch.length === 0, mismatch.length ? JSON.stringify(mismatch.slice(0, 5)) : '差分なし');
    check('(F2) 修正版は壁タイルを一度も返さない', fixWall.length === 0,
      fixWall.length ? JSON.stringify(fixWall.slice(0, 5)) : '0/' + fsw.length + ' 件');
    check('(F3) ★assert 有効性: baseline は壁タイルを返す点が存在する (フォールバック未検査の実証)',
      baseWall.length > 0, 'baseline が壁を返した点=' + baseWall.length + '/' + bsw.length +
      (baseWall.length ? '  例: in=' + JSON.stringify(baseWall[0].in) + ' out=' + JSON.stringify(baseWall[0].out) : ''));

    // ══════════════════════════════════════════════════════════════════════
    mark('(G) spawnWave の by クランプ — 正常系で no-op');
    // ══════════════════════════════════════════════════════════════════════
    const byRaw = fixN.byRaw, H = fixN.mapH;
    check('(G1) 正常系の by は 1..MAP_H-2 の内側 = クランプが値を変えない',
      byRaw >= 1 && byRaw <= H - 2, 'by=' + byRaw + ' (許容 1..' + (H - 2) + ')');
    check('(G2) baseline と by の算出結果が一致', fixN.byRaw === basN.byRaw,
      'fix=' + fixN.byRaw + ' baseline=' + basN.byRaw);
    check('(G3) 馬車不在時のフォールバック元 (主人公の行) も 1..MAP_H-2 の内側',
      fixN.playerRow >= 1 && fixN.playerRow <= H - 2, 'playerRow=' + fixN.playerRow);

  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
    if (bsrv) { try { bsrv.close(); } catch (e) {} }
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n=== driver_field_step5  ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('--- FAILED ---'); failed.forEach(f => console.log('  ' + f.name + ' — ' + f.detail)); }
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('[driver] 例外: ' + (e && e.stack || e));
  process.exit(3);
});
