#!/usr/bin/env node
/*
 * driver_field_step1_geo.js — 「地平線ビュー STEP1 = 幾何マスク + カメラ地平線ロック」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 計画書: dev-meetings/2026-07-19_隊商護衛の地平線ビュー.md  §4 STEP 1
 *
 * ⚠️ driver_field_step1.js とは別物。あちらは 1849dd6/f8a89ec の**描画パス**(雲の影・96px シーム)
 *    を検証する。こちらは STEP1 の**幾何とカメラ**を検証する。名前の "step1" が衝突しているのは
 *    あちらが地平線ビュー計画より前のコミットで付いた番号だから。両方とも回帰確認に使う。
 *
 * ■ 検証する 7 本 (計画書 §4 STEP1 の assert 1-7)
 *   1  可視性 (リプレイ方式)   … STEP0 のレコーダで実プレイの (camX,camY) を録り、その値を
 *                                setCam に流して再描画 → **page.screenshot() の合成画素**でも判定。
 *                                mapCanvas 単体では z2-z10 の DOM/HUD 被覆を検出できない。
 *                                空判定は色の絶対値ではなく **window.drawFieldSky をスタブした
 *                                参照フレームとの差分** (driver_field_step1.js が drawCloudShadows で
 *                                実証済みの手法)。合格バーは全サンプル 100%。「67列」概念は捨てる。
 *   2  assert 自体の有効性     … 同じ判定を f8a89ec (git worktree) で走らせて**必ず FAIL** する
 *   3  camY 恒等               … 全フレームで variance === 0 かつ camY === fieldCamY(usableH)
 *   4  非退行 (既存6シナリオ)  … mapCanvas.toDataURL() の SHA-256 が f8a89ec と一致。
 *                                加えてスナップ直前に wallPattern/floorPattern が非 null であることを
 *                                assert (null 同士だとフォールバック経路の一致を見ているだけになる)
 *   5  カメラ非退行            … 既存6シナリオで playerX/Y/camFocus を固定して computeCameraTarget() を
 *                                直接呼び、camTargetX/Y が baseline と **bit 一致** (SHA では見えない層)
 *   6  cameraBottomHud() 集約  … 5 箇所が同値。driver_field_step0.js の (6b-*) FINDING が CLEAN になる
 *   7  横持ちフォールバック    … 844x390 で幾何マスクもカメラ固定も適用されず f8a89ec 相当の絵になる
 *
 * ■ baseline は必ず git worktree に展開する
 *   「HEAD 固定」は屋外実装がコミットされた瞬間に「現在 vs 現在」へ化けて何も検証しなくなる
 *   (実際に 1849dd6 でこれが起きた)。driver_field_step5.js の --baseline-rev 方式を流用する。
 *
 * 使い方:
 *   node tools/driver_field_step1_geo.js [--headful] [--browser <path>] [--port N]
 *                                        [--baseline-rev f8a89ec] [--shots <dir>]
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8811'), 10);
const BASELINE_PORT = PORT + 1;
const BASELINE_REV = arg('baseline-rev', 'f8a89ec');
const BASELINE_DIR = arg('baseline-dir', path.join(os.tmpdir(), 'df_step1geo_baseline'));
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
  'd59476b7-452d-4dab-a2e8-62026a9fc308', 'scratchpad'));

// ── 幾何定数 (index.html の FIELD_* と一致させること) ────────────────────────
const TILE_SIZE = 96;
const BAND_TOP_ROW = 13, BAND_ROWS = 3, BAND_BOTTOM_ROW = 15;
const BAND_H = BAND_ROWS * TILE_SIZE;              // 288
const VERGE_H = 96;                                 // ⚠️ 縦持ち/desktop は 96 (横持ちの 16 とは別値)
const SKY_MIN = 56, SKY_RATIO = 0.32;
const HORIZON_Y = BAND_TOP_ROW * TILE_SIZE - VERGE_H;   // 1152

function skyPxOf(usableH) {
  return Math.max(0, Math.min(Math.max(SKY_MIN, SKY_RATIO * usableH), usableH - VERGE_H - BAND_H));
}
function camYOf(usableH) { return HORIZON_Y - skyPxOf(usableH); }
function hasSkyRoom(usableH) { return usableH >= BAND_H + VERGE_H + SKY_MIN; }

const LEGACY_SCENARIOS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const SHIP_VIEWPORTS = [
  { name: 'iphone_port', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
const LAND_VIEWPORT = { name: 'iphone_land', width: 844, height: 390 };
const HASH_VIEWPORT = { width: 1440, height: 900 };

// ── 隊商護衛ペイロード (driver_field_step0.js / step5 と同形) ────────────────
// ⚠️ wagonSpawns は tavern.html と同じ ty:14 (帯3行に 3x3 フットプリントを収めるため)。
const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
  waves: [
    { count: 3, pool: ['goblin', 'goblinArcher'] },
    { count: 3, pool: ['goblin', 'hobgoblin'] },
    { count: 3, pool: ['hobgoblin', 'goblinRider'] },
  ],
  wagonSpawns: [{ tx: 9, ty: 14 }],
};

// ── puppeteer / Chrome ──────────────────────────────────────────────────────
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

// ── baseline worktree ───────────────────────────────────────────────────────
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

// ── 静的サーバ ──────────────────────────────────────────────────────────────
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
        if (!fs.existsSync(fp) && root !== ROOT) fp = path.join(ROOT, u);   // 未コミット素材は本体から借りる
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
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const T_BASE_MS = 1700000000000;

// ── プレリュード ────────────────────────────────────────────────────────────
// mode:'legacy' … sessionStorage に既存シナリオ ID を積む (非退行ハッシュ用)
// mode:'field'  … 隊商護衛の生成ペイロードを積む
function prelude(cfg) {
  try {
    if (cfg.mode === 'field') {
      sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
      sessionStorage.removeItem('dragonfighters.currentScenario');
      sessionStorage.removeItem('dragonfighters.questFlags');
    } else {
      sessionStorage.setItem('dragonfighters.currentScenario', cfg.scen);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    }
  } catch (e) {}

  if (cfg.trace) { window.__camTrace = []; window.__camTraceErr = 0; }

  if (cfg.freeze) {
    const T0 = cfg.t0;
    const OrigDate = Date;
    window.Date = function (a) { return arguments.length ? new OrigDate(a) : new OrigDate(T0); };
    window.Date.now = function () { return T0; };
    window.Date.prototype = OrigDate.prototype;
  }
  // Math.random は常に固定シード (マップ生成/情景配置を決定論にする)
  let _s = (cfg.seed || 20260719) >>> 0;
  Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };

  const NativeImage = window.Image;
  window.__imgs = [];
  function TrackedImage(w, h) {
    const i = (w === undefined) ? new NativeImage() : new NativeImage(w, h);
    window.__imgs.push(i);
    return i;
  }
  TrackedImage.prototype = NativeImage.prototype;
  window.Image = TrackedImage;
}

async function waitImages(page, label) {
  const snapshot = () => page.evaluate(() => {
    const a = (window.__imgs || []).concat(Array.prototype.slice.call(document.images || []));
    let done = 0;
    for (const i of a) { if (!i.src || i.complete) done++; }
    return { total: a.length, done };
  });
  const t0 = Date.now();
  let prev = { total: -1, done: -1 }, stable = 0;
  while (Date.now() - t0 < 40000) {
    const s = await snapshot();
    if (s.total > 0 && s.done === s.total && s.total === prev.total) { stable++; if (stable >= 3) return s; }
    else stable = 0;
    prev = s;
    await new Promise(r => setTimeout(r, 250));
  }
  console.warn('[drv] 画像ロード待ちがタイムアウト: ' + label);
  return prev;
}

// ── in-page プローブ ────────────────────────────────────────────────────────
// page.evaluate はグローバルスコープでコンパイルされるので index.html の top-level
// let/const (camX / mapData / UI_LOG_HEIGHT …) へ bare 名で到達できる。
async function installProbe(page) {
  await page.evaluate(() => {
    const P = {};
    P.freeze = function () { window.requestAnimationFrame = function () { return 0; }; };
    P.quiesce = function () {
      P.freeze();
      try { window.renderWorldWithShake = function () {}; } catch (e) {}
      try { window.renderWorld = function () {}; } catch (e) {}
      try { window.cameraFollowTick = function () {}; } catch (e) {}
    };
    P.setCam = function (x, y) { camX = x; camY = y; return { camX: camX, camY: camY }; };
    // 空描画をスタブして再描画 (差分法の参照フレーム)。baseline には drawFieldSky が無いので no-op。
    P.origSky = (typeof window.drawFieldSky === 'function') ? window.drawFieldSky : null;
    P.render = function (noSky) {
      if (noSky && P.origSky) window.drawFieldSky = function () {};
      renderMap();
      if (P.origSky) window.drawFieldSky = P.origSky;
    };
    P.hasSky = function () { return typeof window.drawFieldSky === 'function'; };
    P.patternsReady = function () {
      // ⚠️ null だとフォールバック経路同士の一致を見ているだけになる
      let w = null, f = null;
      try { w = wallPattern; } catch (e) { w = '<unreadable>'; }
      try { f = floorPattern; } catch (e) { f = '<unreadable>'; }
      return { wall: w !== null && w !== undefined && w !== '<unreadable>',
               floor: f !== null && f !== undefined && f !== '<unreadable>' };
    };
    P.hudSites = function () {
      const bh = (typeof cameraBottomHud === 'function') ? cameraBottomHud() : null;
      return {
        UI_LOG_HEIGHT: UI_LOG_HEIGHT, UI_MINIBAR_H: UI_MINIBAR_H, UI_MENU_WIDTH: UI_MENU_WIDTH,
        hasHelper: typeof cameraBottomHud === 'function',
        helper: bh,
        expected: UI_LOG_HEIGHT + UI_MINIBAR_H,
        innerH: window.innerHeight, innerW: window.innerWidth,
        usableH: window.innerHeight - (UI_LOG_HEIGHT + UI_MINIBAR_H),
      };
    };
    P.geo = function () {
      const g = {};
      try { g.isFieldTheme = IS_FIELD_THEME; } catch (e) { g.isFieldTheme = '<none>'; }
      try { g.fieldMode = FIELD_MODE; } catch (e) { g.fieldMode = '<none>'; }
      try { g.fieldGeo = FIELD_GEO; } catch (e) { g.fieldGeo = '<none>'; }
      try { g.fieldGeoActive = FIELD_GEO_ACTIVE; } catch (e) { g.fieldGeoActive = '<none>'; }
      try { g.horizonY = FIELD_HORIZON_Y; } catch (e) { g.horizonY = '<none>'; }
      try { g.bandTop = FIELD_BAND_TOP_ROW; g.bandBottom = FIELD_BAND_BOTTOM_ROW; } catch (e) {}
      try { g.camYPredicted = fieldCamY(window.innerHeight - cameraBottomHud()); } catch (e) { g.camYPredicted = '<none>'; }
      return g;
    };
    // 帯マスクの形を数値で持ち帰る
    P.bandShape = function () {
      const rowsWalkable = [];
      for (let r = 0; r < MAP_H; r++) {
        let n = 0;
        for (let c = 0; c < MAP_W; c++) if (mapData[r][c] !== 2) n++;
        rowsWalkable.push(n);
      }
      let contiguous = true, firstBreak = null;
      for (let r = 13; r <= 15; r++) {
        for (let c = 2; c <= 68; c++) {
          if (mapData[r][c] === 2) { contiguous = false; if (!firstBreak) firstBreak = [c, r]; }
        }
      }
      const sceneryInBand = [];
      for (let r = 13; r <= 15; r++) {
        for (let c = 0; c < MAP_W; c++) {
          if (obstacleTileMask[r * MAP_W + c] === 1) sceneryInBand.push([c, r]);
        }
      }
      return { rowsWalkable, contiguous, firstBreak, sceneryInBand,
               mapW: MAP_W, mapH: MAP_H,
               playerStart: [Math.floor(playerX / TILE_SIZE), Math.floor(playerY / TILE_SIZE)] };
    };
    P.wagon = function () {
      try {
        for (const i of wagonIndices) {
          const w = enemies[i];
          if (!w) continue;
          const s = (w.def && w.def.displaySize) || 96;
          return { x: w.x, y: w.y, size: s,
                   centerTile: [Math.floor((w.x + s / 2) / TILE_SIZE), Math.floor((w.y + s / 2) / TILE_SIZE)],
                   ty0: Math.floor(w.y / TILE_SIZE), ty1: Math.floor((w.y + s - 1) / TILE_SIZE) };
        }
      } catch (e) {}
      return null;
    };
    // assert 5: カメラ層の bit 一致。PT 座標 / camFocus / tight を固定して直接呼ぶ。
    P.camProbe = function (cases) {
      const out = [];
      const sx = playerX, sy = playerY, sf = camFocus, st = cameraTightFocus;
      for (const c of cases) {
        playerX = c[0]; playerY = c[1];
        camFocus = c[2] ? { x: c[2][0], y: c[2][1] } : null;
        cameraTightFocus = !!c[3];
        computeCameraTarget();
        out.push([camTargetX, camTargetY]);
      }
      playerX = sx; playerY = sy; camFocus = sf; cameraTightFocus = st;
      computeCameraTarget();
      return out;
    };
    window.__probe = P;
    return true;
  });
}

async function bootPage(browser, url, viewport, pre) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, pre);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof renderMap === 'function' && !!mapData && !!mapCanvas && typeof computeCameraTarget === 'function'; }
    catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await waitImages(page, url);
  await installProbe(page);
  return { page, pageErrors };
}

// ── 合成画素 (page.screenshot) ──────────────────────────────────────────────
// ⚠️ mapCanvas.toDataURL では z2-z10 の DOM スプライト / HUD の被覆を検出できない。
async function shotBuffer(page) {
  const b = await page.screenshot({ type: 'png', captureBeyondViewport: false });
  return Buffer.from(b);
}

// ページ内で 2 枚の PNG dataURL を画素比較し、指定矩形の差分率を返す
async function diffRect(page, urlA, urlB, rect) {
  return page.evaluate(async (a, b, R) => {
    const load = (u) => new Promise((res, rej) => { const i = new window.Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: true, a: [ia.width, ia.height], b: [ib.width, ib.height] };
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    const x0 = Math.max(0, R.x0), x1 = Math.min(c.width - 1, R.x1);
    const y0 = Math.max(0, R.y0), y1 = Math.min(c.height - 1, R.y1);
    let diff = 0, total = 0; const rowsAllSame = [], rowsAllDiff = [];
    for (let y = y0; y <= y1; y++) {
      let rowDiff = 0, rowTot = 0;
      for (let xx = x0; xx <= x1; xx++) {
        const i = (y * c.width + xx) * 4;
        total++; rowTot++;
        if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) { diff++; rowDiff++; }
      }
      if (rowTot > 0 && rowDiff === 0) rowsAllSame.push(y);
      // 横一列まるごと空 = 途切れない空の帯が見えている証拠 (合成画素の本判定)
      if (rowTot > 0 && rowDiff === rowTot) rowsAllDiff.push(y);
    }
    return { diff, total, pct: total ? diff / total * 100 : 0,
             rowsAllSame: rowsAllSame.slice(0, 12), rowsAllSameCount: rowsAllSame.length,
             rowsAllDiffCount: rowsAllDiff.length,
             rowsAllDiffSpan: rowsAllDiff.length ? [rowsAllDiff[0], rowsAllDiff[rowsAllDiff.length - 1]] : null,
             rectY: [y0, y1], rectX: [x0, x1],
             w: c.width, h: c.height };
  }, urlA, urlB, rect);
}

// ── 実プレイのカメラを録る (STEP0 のシーム __camTrace をそのまま使う) ─────────
async function recordLiveCamera(browser, base, vp, ms) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: false, trace: true });
  await page.goto(base + '/index.html?intel=0', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => { try { return typeof startGame === 'function' && !!mapData; } catch (e) { return false; } },
    { timeout: 30000, polling: 100 });
  await waitImages(page, 'live-' + vp.name);
  // ⚠️ シーム (__camTrace) は renderWorld 内にあり、renderWorldWithShake が camX/camY へ
  //    shake を**一時加算した後**に呼ばれる [index.html renderWorldWithShake]。よって記録される
  //    camY は「shake 込みの実描画値」であり、素で分散 0 になることはない (crit で ±5px 揺れる)。
  //    カメラ固定の恒等式が成り立つのは shake を引いた値。shakeX/shakeY は top-level let なので
  //    window 越しには見えない → renderWorld を包んで各サンプルへ焼き付ける (本体は 1 バイトも変えない)。
  await page.evaluate(() => {
    const _rw = window.renderWorld;
    window.renderWorld = function () {
      const i0 = window.__camTrace ? window.__camTrace.length : -1;
      const r = _rw.apply(this, arguments);
      if (i0 >= 0 && window.__camTrace.length > i0) {
        try { window.__camTrace[i0].shakeY = shakeY; window.__camTrace[i0].shakeX = shakeX; } catch (e) {}
      }
      return r;
    };
  });
  const geo = await page.evaluate(() => {
    const g = {};
    try { g.fieldGeoActive = FIELD_GEO_ACTIVE; } catch (e) { g.fieldGeoActive = '<none>'; }
    try { g.usableH = window.innerHeight - cameraBottomHud(); } catch (e) { g.usableH = window.innerHeight - (UI_LOG_HEIGHT + UI_MINIBAR_H); }
    try {
      g.bandRow13Walkable = mapData[13].filter(v => v !== 2).length;
      g.row5Walkable = mapData[5].filter(v => v !== 2).length;
    } catch (e) {}
    return g;
  });
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await new Promise(r => setTimeout(r, ms));
  const trace = await page.evaluate(() => {
    const t = (window.__camTrace || []);
    if (!t.length) return { n: 0, err: window.__camTraceErr || 0, samples: [] };
    const camX = t.map(s => s.camX);
    // shake を引いた「カメラ本体の値」= 固定の恒等式が成り立つべき量
    const base = t.map(s => s.camY - (s.shakeY || 0));
    const camY = t.map(s => s.camY);
    const idx = [];
    for (let i = 0; i < t.length; i += Math.max(1, Math.floor(t.length / 12))) idx.push(i);
    let iMax = 0, iMin = 0;
    for (let i = 1; i < t.length; i++) { if (camY[i] > camY[iMax]) iMax = i; if (camY[i] < camY[iMin]) iMin = i; }
    idx.push(iMax, iMin, t.length - 1);
    const uniq = Array.from(new Set(idx)).filter(i => i >= 0 && i < t.length);
    const set = new Set(base.map(v => +v.toFixed(6)));
    return {
      n: t.length, err: window.__camTraceErr || 0,
      camYmin: Math.min.apply(null, camY), camYmax: Math.max.apply(null, camY),
      baseMin: Math.min.apply(null, base), baseMax: Math.max.apply(null, base),
      camXmin: Math.min.apply(null, camX), camXmax: Math.max.apply(null, camX),
      distinctCamY: Array.from(set).slice(0, 8), distinctCamYCount: set.size,
      nShake: t.filter(s => s.shakeY).length,
      nFocus: t.filter(s => s.focus).length, nTight: t.filter(s => s.tight).length,
      phases: t.reduce((a, s) => { a[s.phase] = (a[s.phase] || 0) + 1; return a; }, {}),
      samples: uniq.map(i => ({ camX: t[i].camX, camY: t[i].camY, phase: t[i].phase,
                                focus: !!t[i].focus, tight: !!t[i].tight })),
    };
  });
  await page.close();
  return { geo, trace, errs };
}

// ── assert 1/2: リプレイ可視性 (合成画素・空スタブ差分) ─────────────────────
// 与えられた (camX,camY) を setCam で据えて 2 枚描く: A = 空あり / B = 空スタブ。
// 空矩形の**全行**が違っていれば空が実際に見えている。
// baseline (f8a89ec) には drawFieldSky が無い → A と B が完全一致 → 必ず FAIL する (assert 2)。
async function replayVisibility(browser, base, vp, samples, label) {
  const p = await bootPage(browser, base + '/index.html?intel=0', vp,
    { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS });
  const hasSky = await p.page.evaluate(() => window.__probe.hasSky());
  const hud = await p.page.evaluate(() => window.__probe.hudSites());
  const usableH = hud.usableH;
  const sky = skyPxOf(usableH);
  await p.page.evaluate(() => { try { startGame(); } catch (e) {} });
  await new Promise(r => setTimeout(r, 1500));
  await p.page.evaluate(() => window.__probe.quiesce());

  // ⚠️ 空矩形の下端は「そのフレームで実際に使った camY」から出す。名目 camY (shake 抜き) で
  //    切ると、shake 中のサンプルで 1-2 行はみ出して false FAIL する。
  // ⚠️ x0 は UI_MENU_WIDTH。desktop (非compact) では左 280px を常設ステータスパネルが覆うので、
  //    そこを含めると「横一列まるごと空」の走査線が構造的に 0 本になり false FAIL する。
  const rectFor = (camY) => ({ x0: hud.UI_MENU_WIDTH, x1: vp.width - 1, y0: 0,
                               y1: Math.max(0, Math.round(HORIZON_Y - camY) - 1) });
  const rows = [];
  for (const s of samples) {
    const r = await p.page.evaluate((cx, cy) => {
      const P = window.__probe;
      P.setCam(cx, cy); P.render(false); const on = mapCanvas.toDataURL('image/png');
      P.setCam(cx, cy); P.render(true);  const off = mapCanvas.toDataURL('image/png');
      P.setCam(cx, cy); P.render(false);
      return { on, off };
    }, s.camX, s.camY);
    const d = await diffRect(p.page, r.on, r.off, rectFor(s.camY));
    rows.push({ camX: s.camX, camY: s.camY, phase: s.phase, d });
  }

  // ── 合成画素 (page.screenshot) ────────────────────────────────────────────
  // ⚠️ mapCanvas 単体では z2-z10 の DOM/HUD 被覆が見えないので、可視性の**本判定**はこちら。
  // ⚠️ 判定は「空矩形の 100% が空」ではない。画面上部にはフェーズ表示バー (🔍探索フェーズ) が
  //    常駐しており、これは STEP1 以前から在る恒久 HUD で空矩形の約 24% を覆う。帯 row13 の
  //    キャラの頭と名前札も地平線の少し上へ出る。よって計画書の合格バー「全サンプル 100%」は
  //    **画素の 100%** ではなく **サンプルの 100%** = 「どのカメラでも空が実際に見えている」。
  //    それを「空矩形の中に、横一列まるごと空である走査線が 1 本以上ある」で定義する
  //    (細切れの隙間ではなく、途切れない空の帯が見えていることの証明)。
  const composites = [];
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    await p.page.evaluate((cx, cy) => {
      const P = window.__probe; P.setCam(cx, cy);
      try { updatePositions(); } catch (e) {}
      P.setCam(cx, cy); P.render(false);
    }, s.camX, s.camY);
    const bufOn = await shotBuffer(p.page);
    await p.page.evaluate((cx, cy) => { const P = window.__probe; P.setCam(cx, cy); P.render(true); }, s.camX, s.camY);
    const bufOff = await shotBuffer(p.page);
    await p.page.evaluate((cx, cy) => { const P = window.__probe; P.setCam(cx, cy); P.render(false); }, s.camX, s.camY);
    const d = await diffRect(p.page,
      'data:image/png;base64,' + bufOn.toString('base64'),
      'data:image/png;base64,' + bufOff.toString('base64'),
      rectFor(s.camY));
    composites.push({ camY: s.camY, phase: s.phase, d });
    if (i === 0) {
      try { fs.writeFileSync(path.join(SHOT_DIR, 'step1geo_' + label + '_' + vp.name + '.png'), bufOn); } catch (e) {}
    }
  }
  const errs = p.pageErrors.slice();
  await p.page.close();
  return { hasSky, usableH, sky, rows, composites, errs };
}

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  prepareBaseline();

  let srv = null, srvBase = null, browser = null;
  try {
    srv = await startServer(PORT, ROOT);
    srvBase = await startServer(BASELINE_PORT, BASELINE_DIR);
    const BASE = 'http://127.0.0.1:' + PORT;
    const BBASE = 'http://127.0.0.1:' + BASELINE_PORT;
    console.log('[drv] cur =' + BASE + '  (' + ROOT + ')');
    console.log('[drv] base=' + BBASE + '  (' + BASELINE_DIR + ' @ ' + BASELINE_REV + ')');

    const profile = path.join(os.tmpdir(), 'df_pptr_profile_step1geo');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + profile],
    });

    // ── 0. baseline の素性 ──────────────────────────────────────────────────
    mark('baseline が「STEP1 前」であることを確認 (assert が空振りしない前提)');
    {
      const src = fs.readFileSync(path.join(BASELINE_DIR, 'index.html'), 'utf8');
      check('(0a) baseline に FIELD_GEO_ACTIVE / drawFieldSky が無い',
        src.indexOf('FIELD_GEO_ACTIVE') < 0 && src.indexOf('drawFieldSky') < 0, 'rev=' + BASELINE_REV);
      const cur = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      check('(0b) 現行に STEP1 の実装がある',
        cur.indexOf('FIELD_GEO_ACTIVE') > 0 && cur.indexOf('drawFieldSky') > 0, '');
    }

    // ── 6. cameraBottomHud() 集約 ───────────────────────────────────────────
    mark('assert 6: cameraBottomHud() への集約 (5箇所・漏れゼロ)');
    {
      const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split(/\r?\n/);
      const leaks = [], calls = [];
      src.forEach((line, i) => {
        if (/function cameraBottomHud/.test(line)) return;
        if (/cameraBottomHud\(\)/.test(line)) calls.push(i + 1);
        if (/UI_LOG_HEIGHT\s*\+\s*UI_MINIBAR_H/.test(line)) leaks.push({ line: i + 1, text: line.trim() });
        if (/vh\s*-\s*UI_LOG_HEIGHT\b/.test(line)) leaks.push({ line: i + 1, text: line.trim() });
      });
      check('(6a) 生の "UI_LOG_HEIGHT + UI_MINIBAR_H" / "vh - UI_LOG_HEIGHT" が1つも残っていない',
        leaks.length === 0, leaks.length ? leaks.map(l => 'L' + l.line + ' ' + l.text.slice(0, 70)).join(' | ') : 'clean');
      check('(6b) cameraBottomHud() の呼び出しが 5 箇所以上',
        calls.length >= 5, 'calls=' + calls.length + ' @ L' + calls.join(',L'));
      const p = await bootPage(browser, BASE + '/index.html?intel=0', { width: 390, height: 844 },
        { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS });
      const H = await p.page.evaluate(() => window.__probe.hudSites());
      check('(6c) compact 実行時に cameraBottomHud() === UI_LOG_HEIGHT + UI_MINIBAR_H',
        H.hasHelper && H.helper === H.expected,
        'cameraBottomHud()=' + H.helper + ' expected=' + H.expected);
      check('(6d) UI_LOG_HEIGHT / UI_MINIBAR_H の値そのものは不変 (compact: 96..120 / 64)',
        H.UI_LOG_HEIGHT >= 96 && H.UI_LOG_HEIGHT <= 120 && H.UI_MINIBAR_H === 64,
        'UI_LOG_HEIGHT=' + H.UI_LOG_HEIGHT + ' UI_MINIBAR_H=' + H.UI_MINIBAR_H);
      await p.page.close();
    }

    // ── 幾何マスクの形 ──────────────────────────────────────────────────────
    mark('帯マスクの形 (row 13-15 のみ walkable / 列 2-68 連続 / 倒木ゼロ / 馬車 3行)');
    {
      const p = await bootPage(browser, BASE + '/index.html?intel=0', { width: 390, height: 844 },
        { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS });
      await p.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1200));
      const b = await p.page.evaluate(() => window.__probe.bandShape());
      const w = await p.page.evaluate(() => window.__probe.wagon());
      const outsideBand = b.rowsWalkable.filter((n, r) => (r < 13 || r > 15) && n > 0);
      check('(G1) 帯外の行に walkable タイルが 1 枚も無い', outsideBand.length === 0,
        'rowsWalkable=' + JSON.stringify(b.rowsWalkable));
      check('(G2) 帯 row13-15 の列 2-68 が連続して非壁', b.contiguous,
        b.contiguous ? '67列 x 3行 = 201 タイル' : '断絶 @ ' + JSON.stringify(b.firstBreak));
      check('(G3) 帯行にブロッキング情景 (倒木等) が 1 つも無い', b.sceneryInBand.length === 0,
        b.sceneryInBand.length ? JSON.stringify(b.sceneryInBand) : 'clean');
      check('(G4) プレイヤー起点が帯内', b.playerStart[1] >= 13 && b.playerStart[1] <= 15,
        'playerStart=(' + b.playerStart + ')');
      check('(G5) 馬車のフットプリント 3 行が帯 13..15 に収まる',
        !!w && w.ty0 >= 13 && w.ty1 <= 15,
        w ? 'centerTile=(' + w.centerTile + ') ty=' + w.ty0 + '..' + w.ty1 + ' size=' + w.size : '馬車が見つからない');
      check('(G6) MAP_W / MAP_H の定数は不変 (黒帯が出ない前提)', b.mapH === 28 && b.mapW === 72,
        'MAP_W=' + b.mapW + ' MAP_H=' + b.mapH);
      await p.page.close();
    }

    // ── 3. camY 恒等 (実プレイ) ─────────────────────────────────────────────
    mark('assert 3: camY 恒等 (実プレイ・分散 0)');
    const live = {};
    for (const vp of SHIP_VIEWPORTS) {
      const r = await recordLiveCamera(browser, BASE, vp, 22000);
      live[vp.name] = r;
      const expected = camYOf(r.geo.usableH);
      check('(3a-' + vp.name + ') 実描画カメラを記録できた + シーム例外 0',
        r.trace.n > 0 && r.trace.err === 0, 'trace=' + r.trace.n + ' err=' + r.trace.err);
      // ⚠️ 分散 0 を主張できるのは **shake を引いた camY**。シームは renderWorldWithShake が
      //    camY へ shake を加算した後の renderWorld 内にあるため、生の camY は crit 等で ±5px 揺れる。
      //    これは仕様どおりの演出であって、カメラ固定が破れているのではない。
      check('(3b-' + vp.name + ') camY(shake除去) の分散が 0 (全フレーム同値)',
        r.trace.distinctCamYCount === 1,
        'distinct=' + r.trace.distinctCamYCount + ' 値=' + JSON.stringify(r.trace.distinctCamY) +
        ' / 生camY range=' + (r.trace.camYmin || 0).toFixed(3) + '..' + (r.trace.camYmax || 0).toFixed(3) +
        ' (shakeフレーム=' + r.trace.nShake + ')');
      check('(3c-' + vp.name + ') camY(shake除去) === fieldCamY(usableH)',
        Math.abs(r.trace.baseMax - expected) < 1e-6 && Math.abs(r.trace.baseMin - expected) < 1e-6,
        'camY=' + r.trace.baseMax + ' 期待=' + expected + ' (usableH=' + r.geo.usableH +
        ' skyPx=' + skyPxOf(r.geo.usableH).toFixed(1) + ' = ' +
        (skyPxOf(r.geo.usableH) / r.geo.usableH * 100).toFixed(1) + '%)');
      check('(3d-' + vp.name + ') 母集団が健全 (combat と camFocus が発生している)',
        r.trace.nFocus > 0 && (r.trace.phases['combat'] || 0) > 0,
        'focus=' + r.trace.nFocus + ' tight=' + r.trace.nTight + ' phases=' + JSON.stringify(r.trace.phases));
      check('(3e-' + vp.name + ') camX は固定していない (横は従来どおり追従する契約)',
        r.trace.camXmax - r.trace.camXmin > 0,
        'camX ' + r.trace.camXmin.toFixed(1) + '..' + r.trace.camXmax.toFixed(1));
      check('(3f-' + vp.name + ') 帯マスクが効いている (row5 walkable=0 / row13 walkable>0)',
        r.geo.row5Walkable === 0 && r.geo.bandRow13Walkable > 0,
        'row5=' + r.geo.row5Walkable + ' row13=' + r.geo.bandRow13Walkable);
    }

    // ── 1. リプレイ可視性 ───────────────────────────────────────────────────
    mark('assert 1: 可視性 (リプレイ・空スタブ差分・合成画素)');
    for (const vp of SHIP_VIEWPORTS) {
      const samples = live[vp.name].trace.samples || [];
      const R = await replayVisibility(browser, BASE, vp, samples, 'cur');
      check('(1a-' + vp.name + ') drawFieldSky が存在する (スタブ差分法が成立)', R.hasSky, '');
      check('(1b-' + vp.name + ') 空の高さが 0 ではない', R.sky > 0,
        'usableH=' + R.usableH + ' skyPx=' + R.sky.toFixed(1) + ' (' + (R.sky / R.usableH * 100).toFixed(1) + '%)');
      const bad = R.rows.filter(r => !r.d || r.d.sizeMismatch || r.d.pct < 100);
      check('(1c-' + vp.name + ') mapCanvas: 全 ' + R.rows.length + ' サンプルで空矩形が画素 100% 空',
        R.rows.length > 0 && bad.length === 0,
        bad.length ? '不合格 ' + bad.length + '件 例:' + JSON.stringify(bad[0].d) :
          '全サンプル 100% (最小 ' + Math.min.apply(null, R.rows.map(r => +r.d.pct.toFixed(3))) + '%)');
      // ★本判定: 合成画素で「横一列まるごと空」の走査線が全サンプルで 1 本以上
      const cbad = R.composites.filter(c => !c.d || c.d.sizeMismatch || c.d.rowsAllDiffCount < 1);
      const minRows = R.composites.length ? Math.min.apply(null, R.composites.map(c => c.d.rowsAllDiffCount || 0)) : -1;
      check('(1d-' + vp.name + ') 合成画素: 全 ' + R.composites.length + ' サンプルで途切れない空の走査線がある',
        R.composites.length > 0 && cbad.length === 0,
        cbad.length ? '不合格 ' + cbad.length + '件 例:' + JSON.stringify(cbad[0].d) :
          '全サンプル OK (最少でも ' + minRows + ' 行が横一列まるごと空 / 例 span=' +
          JSON.stringify(R.composites[0].d.rowsAllDiffSpan) + ' rect=' + JSON.stringify(R.composites[0].d.rectY) +
          ' 上部HUD被覆込みの空矩形差分=' + R.composites[0].d.pct.toFixed(1) + '%)');
      check('(1e-' + vp.name + ') pageerror 0', R.errs.length === 0, R.errs.slice(0, 3).join(' | ') || 'none');
    }

    // ── 2. assert 自体の有効性 ──────────────────────────────────────────────
    mark('assert 2: 同じ判定を baseline (' + BASELINE_REV + ') で走らせて **必ず FAIL** する');
    for (const vp of SHIP_VIEWPORTS) {
      const samples = live[vp.name].trace.samples || [];
      const R = await replayVisibility(browser, BBASE, vp, samples, 'base');
      const bad = R.rows.filter(r => !r.d || r.d.sizeMismatch || r.d.pct < 100);
      const cbad = R.composites.filter(c => !c.d || c.d.sizeMismatch || c.d.rowsAllDiffCount < 1);
      check('(2-' + vp.name + ') baseline では (1c)(1d) が **全サンプル** 落ちる (空振りでない証拠)',
        !R.hasSky && R.rows.length > 0 && bad.length === R.rows.length
        && R.composites.length > 0 && cbad.length === R.composites.length,
        'hasSky=' + R.hasSky + ' mapCanvas不合格=' + bad.length + '/' + R.rows.length +
        ' 合成画素不合格=' + cbad.length + '/' + R.composites.length +
        (R.rows.length ? ' 例:diff=' + (R.rows[0].d.pct || 0).toFixed(2) + '%' : ''));
    }

    // ── 4 & 5. 既存6シナリオの非退行 ─────────────────────────────────────────
    mark('assert 4/5: 既存6シナリオの非退行 (SHA-256 + カメラ bit 一致)');
    const CAM_CASES = [
      [576, 1248, null, false], [1920, 1248, null, false], [4800, 1000, null, false],
      [576, 1248, [2400, 1400], false], [3000, 900, [3200, 1100], true], [96, 96, null, false],
    ];
    for (const scen of LEGACY_SCENARIOS) {
      const cur = await bootPage(browser, BASE + '/index.html', HASH_VIEWPORT,
        { mode: 'legacy', scen, freeze: true, t0: T_BASE_MS });
      const base = await bootPage(browser, BBASE + '/index.html', HASH_VIEWPORT,
        { mode: 'legacy', scen, freeze: true, t0: T_BASE_MS });

      const pc = await cur.page.evaluate(() => window.__probe.patternsReady());
      const pb = await base.page.evaluate(() => window.__probe.patternsReady());
      check('(4a) ' + scen + ': wallPattern / floorPattern が両側とも非 null',
        pc.wall && pc.floor && pb.wall && pb.floor,
        'cur=' + JSON.stringify(pc) + ' base=' + JSON.stringify(pb));

      const snap = (pg) => pg.evaluate(() => {
        window.requestAnimationFrame = function () { return 0; };
        computeCameraTarget(); camX = camTargetX; camY = camTargetY;
        renderMap();
        return { url: mapCanvas.toDataURL('image/png'), camX, camY, w: mapCanvas.width, h: mapCanvas.height,
                 fieldMode: (function () { try { return FIELD_MODE; } catch (e) { return '<none>'; } })() };
      });
      const sc = await snap(cur.page), sb = await snap(base.page);
      check('(4b) ' + scen + ': FIELD_MODE === false (屋外ゲートの外)', sc.fieldMode === false, 'FIELD_MODE=' + sc.fieldMode);
      const hc = sha256(sc.url), hb = sha256(sb.url);
      let det = 'sha=' + hc.slice(0, 16) + ' cam=(' + sc.camX + ',' + sc.camY + ')';
      if (hc !== hb) {
        const d = await diffRect(cur.page, sc.url, sb.url, { x0: 0, x1: sc.w - 1, y0: 0, y1: sc.h - 1 });
        det = 'cur=' + hc.slice(0, 16) + ' base=' + hb.slice(0, 16) + ' diff=' + JSON.stringify(d);
      }
      check('(4c) ' + scen + ': mapCanvas 描画が baseline と SHA-256 一致', hc === hb, det);

      const cc = await cur.page.evaluate((c) => window.__probe.camProbe(c), CAM_CASES);
      const cb = await base.page.evaluate((c) => window.__probe.camProbe(c), CAM_CASES);
      const bit = JSON.stringify(cc) === JSON.stringify(cb);
      check('(5) ' + scen + ': computeCameraTarget() が baseline と bit 一致 (' + CAM_CASES.length + 'ケース)',
        bit, bit ? 'cases=' + CAM_CASES.length : 'cur=' + JSON.stringify(cc) + ' base=' + JSON.stringify(cb));

      await cur.page.close(); await base.page.close();
    }

    // ── 7. 横持ちフォールバック ─────────────────────────────────────────────
    mark('assert 7: 横持ち (844x390) は幾何もカメラも適用せず従来描画へフォールバック');
    {
      const cur = await bootPage(browser, BASE + '/index.html?intel=0', LAND_VIEWPORT,
        { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS });
      const base = await bootPage(browser, BBASE + '/index.html?intel=0', LAND_VIEWPORT,
        { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS });
      const g = await cur.page.evaluate(() => window.__probe.geo());
      const H = await cur.page.evaluate(() => window.__probe.hudSites());
      check('(7a) FIELD_GEO_ACTIVE === false (usableH=' + H.usableH + ' < ' + (BAND_H + VERGE_H + SKY_MIN) + ')',
        g.fieldGeoActive === false, JSON.stringify(g));
      check('(7b) 判定が理論値と一致 (fieldHasSkyRoom(usableH) === false)', hasSkyRoom(H.usableH) === false,
        'usableH=' + H.usableH + ' 必要=' + (BAND_H + VERGE_H + SKY_MIN));
      const bs = await cur.page.evaluate(() => window.__probe.bandShape());
      const outside = bs.rowsWalkable.filter((n, r) => (r < 13 || r > 15) && n > 0).length;
      check('(7c) 帯マスクが掛かっていない (帯外にも walkable 行がある)', outside > 0,
        'walkable な帯外行=' + outside);
      const snap = (pg) => pg.evaluate(() => {
        window.requestAnimationFrame = function () { return 0; };
        computeCameraTarget(); camX = camTargetX; camY = camTargetY;
        renderMap();
        return { url: mapCanvas.toDataURL('image/png'), camX, camY };
      });
      const sc = await snap(cur.page), sb = await snap(base.page);
      check('(7d) 横持ちのカメラが baseline と bit 一致 (カメラ固定が適用されていない)',
        sc.camX === sb.camX && sc.camY === sb.camY,
        'cur=(' + sc.camX + ',' + sc.camY + ') base=(' + sb.camX + ',' + sb.camY + ')');
      const hc = sha256(sc.url), hb = sha256(sb.url);
      let det = 'sha=' + hc.slice(0, 16);
      if (hc !== hb) {
        const d = await diffRect(cur.page, sc.url, sb.url, { x0: 0, x1: LAND_VIEWPORT.width - 1, y0: 0, y1: LAND_VIEWPORT.height - 1 });
        det = 'cur=' + hc.slice(0, 16) + ' base=' + hb.slice(0, 16) + ' diff=' + JSON.stringify(d);
      }
      check('(7e) 横持ちの描画が baseline (' + BASELINE_REV + ') と SHA-256 一致 = 従来の絵', hc === hb, det);
      await cur.page.close(); await base.page.close();
    }

    // ── 撤退スイッチ ────────────────────────────────────────────────────────
    mark('撤退スイッチ ?fieldgeo=0 (幾何のみ) / ?field=0 (描画のみ) の独立性');
    {
      const g0 = await bootPage(browser, BASE + '/index.html?intel=0&fieldgeo=0', { width: 390, height: 844 },
        { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS });
      const f0 = await bootPage(browser, BASE + '/index.html?intel=0&field=0', { width: 390, height: 844 },
        { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS });
      const gg = await g0.page.evaluate(() => window.__probe.geo());
      const gf = await f0.page.evaluate(() => window.__probe.geo());
      check('(S1) ?fieldgeo=0 は幾何のみ無効 (FIELD_MODE は true のまま)',
        gg.fieldGeoActive === false && gg.fieldMode === true, JSON.stringify(gg));
      check('(S2) ?field=0 は描画のみ無効 (FIELD_GEO_ACTIVE は true のまま)',
        gf.fieldMode === false && gf.fieldGeoActive === true, JSON.stringify(gf));
      const bs = await g0.page.evaluate(() => window.__probe.bandShape());
      check('(S3) ?fieldgeo=0 で帯マスクが掛からない',
        bs.rowsWalkable.filter((n, r) => (r < 13 || r > 15) && n > 0).length > 0, '');
      await g0.page.close(); await f0.page.close();
    }

  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
    if (srvBase) { try { srvBase.close(); } catch (e) {} }
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n=== ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('--- FAILED ---'); failed.forEach(f => console.log('  ' + f.name + ' — ' + f.detail)); }
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('[driver] 例外: ' + (e && e.stack || e));
  process.exit(3);
});
