#!/usr/bin/env node
/*
 * driver_field_step3.js — 「地平線ビュー STEP3 = 空と遠景の描画」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 計画書: dev-meetings/2026-07-19_隊商護衛の地平線ビュー.md  §4 STEP 3
 *
 * ⚠️ 名前が似た別ドライバが 5 本ある。目的が全部違うので取り違えないこと:
 *      driver_field_step0.js      … 受動カメラレコーダ (実プレイのカメラ実測)
 *      driver_field_step05_hud.js … HUD 可読性モック (横持ちの可否)
 *      driver_field_step1.js      … 1849dd6/f8a89ec の描画パス (雲の影・96px シーム)。**幾何 OFF** で開く
 *      driver_field_step1_geo.js  … STEP1 の幾何とカメラ。**幾何 ON**
 *      driver_field_step2.js      … STEP2 の壁低背化・天井潰し解除・松明。**幾何 ON**
 *    本ドライバは **幾何 ON** (?fieldgeo は付けない)。空は幾何が成立していないと 1px も出ない。
 *
 * ■ 検証する 6 本
 *   A  決定論        … ① 同じフレームを 2 回描いて mapCanvas が**完全一致**
 *                      ② drawFieldSky 実行中の Math.random 呼び出しが **0 回** (RNG ストリーム非汚染)
 *                      ③ Date.now 呼び出しも 0 回 (パララックスは camX の関数であって時間の関数ではない)
 *                      ④ **別ページロード**で同じ camX/camY を据えた空矩形の SHA-256 が一致
 *                         (①だけだと「同一プロセス内でキャッシュが効いている」しか言えない)
 *   B  ?sky=0        … 空矩形が背景色一色になる。かつ**幾何とカメラは残る** (FIELD_GEO_ACTIVE / camY 不変)
 *   C  パララックス2速 … camX を D だけ動かし、遠景 2 層の横ずれを**画素の相互相関**で実測。
 *                      far ≒ D×0.15 / mid ≒ D×0.35 かつ両者が有意に違う速度であること。
 *                      ⚠️ 層の分離は色相で行う (far = 灰緑 G≈B / mid = 緑 G≫B / 空 = 青〜暖色 R≥G)。
 *                         行の高さで切ると木の樹冠が far 帯へ食い込んでいて混ざる。
 *   D  非退行        … 既存6シナリオの mapCanvas SHA-256 が baseline と一致。
 *                      陽性対照として caravan-road は**必ず変わる** (変わらなければ何も描いていない)
 *   E  フレーム時間  … baseline と現行で renderMap の所要時間を比較。
 *                      ⚠️ JS 時間だけでは足りない。ラスタは非同期にキューされるので、
 *                         getImageData で**パイプラインを流して**から測った値も併記する。
 *   F  スクショ      … 3 ビューポート × 3 地点 = 9 枚 (+ 横持ちフォールバック確認 1 枚)。
 *                      ⚠️ assets/ には置かない (既に 142MB)。一時領域へ出す。
 *
 * 使い方:
 *   node tools/driver_field_step3.js [--headful] [--browser <path>] [--port N]
 *                                    [--baseline-rev 543245a] [--shots <dir>]
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
const PORT = parseInt(arg('port', '8821'), 10);
const BASELINE_PORT = PORT + 1;
// ⚠️ baseline は **STEP3 の直前 HEAD**。f8a89ec (地平線ビュー以前) にすると「幾何ごと違う絵」を
//    比べることになり、E のフレーム時間が「空のコスト」ではなく「帯幾何のコスト」を測ってしまう。
const BASELINE_REV = arg('baseline-rev', '543245a');
const BASELINE_DIR = arg('baseline-dir', path.join(os.tmpdir(), 'df_step3_baseline'));
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
  'd59476b7-452d-4dab-a2e8-62026a9fc308', 'scratchpad', 'step3_shots'));

// ── 幾何定数 (index.html の FIELD_* と一致させること) ────────────────────────
const TILE_SIZE = 96;
const MAP_W = 72;
const BAND_TOP_ROW = 13, BAND_ROWS = 3;
const BAND_H = BAND_ROWS * TILE_SIZE;              // 288
const VERGE_H = 96;
const SKY_MIN = 56, SKY_RATIO = 0.32;
const HORIZON_Y = BAND_TOP_ROW * TILE_SIZE - VERGE_H;   // 1152
const FAR_PARALLAX = 0.15, MID_PARALLAX = 0.35;

function skyPxOf(usableH) {
  return Math.max(0, Math.min(Math.max(SKY_MIN, SKY_RATIO * usableH), usableH - VERGE_H - BAND_H));
}
function camYOf(usableH) { return HORIZON_Y - skyPxOf(usableH); }

const LEGACY_SCENARIOS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
// ⚠️ 「3 ビューポート」から**横持ちは外す**。STEP0.5 で横持ちは丸ごと従来描画へフォールバックする
//    と決まっており、空は 1px も出ない。代わりに desktop の別解像度を 3 本目に採る。
const SHOT_VIEWPORTS = [
  { name: 'iphone_port', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'desktop_small', width: 1280, height: 720 },
];
const LAND_VIEWPORT = { name: 'iphone_land', width: 844, height: 390 };
const HASH_VIEWPORT = { width: 1440, height: 900 };
const PARALLAX_VIEWPORT = { name: 'parallax', width: 1440, height: 900 };
// 3 地点 = 街道の西端 / 中央 / 東端。camX は setCam で据える (実プレイの追従は STEP1 で検証済み)。
const SHOT_SPOTS = [
  { name: 'west', camX: 0 },
  { name: 'mid', camX: 2400 },
  { name: 'east', camX: 5000 },
];

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

function prepareBaseline() {
  const marker = path.join(BASELINE_DIR, 'index.html');
  if (fs.existsSync(marker)) {
    let head = '';
    try { head = execFileSync('git', ['-C', BASELINE_DIR, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) {}
    if (head && (BASELINE_REV.indexOf(head) === 0 || head.indexOf(BASELINE_REV) === 0)) {
      console.log('[drv] baseline worktree 再利用: ' + BASELINE_DIR + ' @ ' + head);
      return;
    }
    try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', BASELINE_DIR], { encoding: 'utf8' }); } catch (e) {}
  }
  console.log('[drv] baseline worktree を作成: ' + BASELINE_DIR + ' @ ' + BASELINE_REV);
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', BASELINE_DIR, BASELINE_REV],
               { encoding: 'utf8', stdio: 'pipe' });
}

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

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const T_BASE_MS = 1700000000000;

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
  if (cfg.freeze) {
    const T0 = cfg.t0;
    const OrigDate = Date;
    window.Date = function (a) { return arguments.length ? new OrigDate(a) : new OrigDate(T0); };
    window.Date.now = function () { return T0; };
    window.Date.prototype = OrigDate.prototype;
  }
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
    P.render = function () { renderMap(); };
    P.geo = function () {
      const g = {};
      try { g.fieldMode = FIELD_MODE; } catch (e) { g.fieldMode = '<none>'; }
      try { g.fieldGeoActive = FIELD_GEO_ACTIVE; } catch (e) { g.fieldGeoActive = '<none>'; }
      try { g.skyOn = FIELD_SKY_ON; } catch (e) { g.skyOn = '<none>'; }
      try { g.hasSkyFn = typeof drawFieldSky === 'function'; } catch (e) { g.hasSkyFn = false; }
      try { g.daylight = __daylight; } catch (e) { g.daylight = '<none>'; }
      try { g.usableH = window.innerHeight - cameraBottomHud(); } catch (e) { g.usableH = '<none>'; }
      try { g.camY = camY; g.camX = camX; } catch (e) {}
      g.canvasW = mapCanvas.width; g.canvasH = mapCanvas.height;
      return g;
    };
    P.patternsReady = function () {
      let w = null, f = null;
      try { w = wallPattern; } catch (e) { w = '<unreadable>'; }
      try { f = floorPattern; } catch (e) { f = '<unreadable>'; }
      return { wall: w !== null && w !== undefined && w !== '<unreadable>',
               floor: f !== null && f !== undefined && f !== '<unreadable>' };
    };
    // ── A②③: drawFieldSky が Math.random / Date.now を引かないことの直接証明 ──
    // ⚠️ renderMap 全体で測ってはいけない。drawCloudShadows は仕様として Date.now を引くので
    //    「空が時間依存」と誤検出する。空だけを単独で呼んで測る。
    P.skyPurity = function () {
      if (typeof drawFieldSky !== 'function') return { missing: true };
      const oR = Math.random, oN = Date.now;
      let nR = 0, nN = 0;
      const meas = (fn) => {
        nR = 0; nN = 0;
        Math.random = function () { nR++; return oR.apply(Math, arguments); };
        Date.now = function () { nN++; return oN.apply(Date, arguments); };
        try { fn(); } finally { Math.random = oR; Date.now = oN; }
        return { rand: nR, now: nN };
      };
      // cold = タイル焼き込みを含む初回 / warm = キャッシュ後
      let cold;
      try {
        _fieldSkyTile = null; _fieldFarTile = null; _fieldMidTile = null; _fieldHazeTile = null;
        _fieldSkyKey = ''; _fieldRidgeKey = ''; _fieldHazeKey = '';
        cold = meas(() => drawFieldSky());
      } catch (e) { cold = { err: String(e) }; }
      const warm = meas(() => { drawFieldSky(); drawFieldSky(); });
      return { cold, warm };
    };
    // 空矩形だけを PNG で切り出す (地平線より上・HUD の DOM は含まない)
    P.skyRect = function () {
      const h = Math.max(0, Math.min(Math.round(FIELD_HORIZON_Y - camY), mapCanvas.height));
      if (h <= 0) return null;
      const c = document.createElement('canvas');
      c.width = mapCanvas.width; c.height = h;
      c.getContext('2d').drawImage(mapCanvas, 0, 0, c.width, h, 0, 0, c.width, h);
      return { url: c.toDataURL('image/png'), w: c.width, h: h };
    };
    // ── C: 遠景 2 層の列プロファイル ────────────────────────────────────────
    // 層の分離は**色相**で行う:
    //   far (灰緑グラデ #6c7674→#55605e) … G-R ≥ 8 かつ G-B が **+1..+8** (わずかに緑>青)
    //   mid (緑グラデ   #47533f→#35402f) … G-R ≥ 6 かつ G-B ≥ 12 (はっきり緑)
    //   空 (#39485c…#8e8a7c)             … 上半分は B>G (G-B が負)、下半分は R>G (G-R が負)
    // ⚠️ **G-B の下限 (+1) を外すと far の判定が壊れる。** 空の停止 0.55(#6a747c) → 0.76(#87857b)
    //    の補間の途中に「G-R≈5, G-B≈0」の帯が現れ、そこが far に誤分類される。空は動かないので
    //    相関のピークが 0 側へ引っ張られ、視差の実測値が -120px ではなく -65px に化ける
    //    (r も 0.67 まで落ちる)。実際に一度この誤分類で FAIL した。
    // ⚠️ 地平線際 16px は霞タイルが色を潰すので走査から外す。
    // ⚠️ **プロファイルは「列ごとの画素数」ではなく「列ごとの稜線の高さ」= 最上段の該当画素**。
    //    画素数で採ると far が壊れる: 並木 (0.35) が丘 (0.15) の下側を隠すので far の画素数が
    //    0.35 で変調され、相関のピークが 2 速の中間の偽値へ落ちる (実測 -65px で FAIL した)。
    //    稜線の高さなら、far の base(62) > mid の最大(≒53) である限り並木に隠されないので純粋な
    //    0.15 の信号になる。この不等式は index.html の FIELD_FAR_OPTS 側でも保証してある。
    P.layerProfiles = function () {
      const H = Math.max(0, Math.min(Math.round(FIELD_HORIZON_Y - camY), mapCanvas.height));
      const y1 = Math.max(0, H - 16);
      const W = mapCanvas.width;
      if (y1 <= 0) return null;
      const c = document.createElement('canvas');
      c.width = W; c.height = y1;
      const cc = c.getContext('2d', { willReadFrequently: true });
      cc.drawImage(mapCanvas, 0, 0, W, y1, 0, 0, W, y1);
      const d = cc.getImageData(0, 0, W, y1).data;
      const far = new Array(W).fill(0), mid = new Array(W).fill(0);
      let farPx = 0, midPx = 0;
      for (let y = 0; y < y1; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
          const gr = g - r, gb = g - b;
          if (gr >= 6 && gb >= 12) { midPx++; if (mid[x] === 0) mid[x] = y1 - y; }
          else if (gr >= 8 && gb >= 1 && gb <= 8 && g >= 85 && g <= 125) { farPx++; if (far[x] === 0) far[x] = y1 - y; }
        }
      }
      return { far, mid, W, H, farPx, midPx };
    };
    // ── E: フレーム時間 ────────────────────────────────────────────────────
    // ⚠️ ラスタは非同期にキューされるので renderMap の JS 時間だけでは真のコストが見えない
    //    (camera-perf STEP7 の恒久教訓)。getImageData でパイプラインを流した値も測る。
    P.perf = function (n) {
      const t = [], tf = [];
      for (let i = 0; i < 6; i++) renderMap();                 // ウォームアップ
      for (let i = 0; i < n; i++) {
        camX += 1;                                             // 毎回違う位置 = キャッシュ効きすぎ防止
        const a = performance.now(); renderMap(); const b = performance.now();
        ctx.getImageData(0, 0, 1, 1);                          // フラッシュ
        const c2 = performance.now();
        t.push(b - a); tf.push(c2 - a);
      }
      const med = (arr) => { const s = arr.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
      const mean = (arr) => arr.reduce((p, q) => p + q, 0) / arr.length;
      return { n: n, jsMed: med(t), jsMean: mean(t), flushMed: med(tf), flushMean: mean(tf) };
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
    try { return typeof renderMap === 'function' && !!mapData && !!mapCanvas; }
    catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await waitImages(page, url);
  await installProbe(page);
  return { page, pageErrors };
}

// 相互相関で 2 本の列プロファイルの横ずれを求める。
// ⚠️ 単純な「重心の差」では効かない。カメラを動かすと画面の端から新しい山が入り
//    端から出ていくので、重心は視差と無関係に動く。重なりの一致度で測ること。
function bestShift(a, b, maxShift) {
  const n = Math.min(a.length, b.length);
  const mean = (arr, s, e) => { let t = 0; for (let i = s; i < e; i++) t += arr[i]; return t / (e - s); };
  let best = null;
  for (let s = -maxShift; s <= maxShift; s++) {
    // b を s だけずらして a と比べる (重なる区間のみ)
    const lo = Math.max(0, -s), hi = Math.min(n, n - s);
    if (hi - lo < n * 0.35) continue;              // 重なりが少なすぎる shift は信用しない
    const ma = mean(a, lo, hi);
    let mb = 0; for (let i = lo; i < hi; i++) mb += b[i + s]; mb /= (hi - lo);
    let num = 0, da = 0, db = 0;
    for (let i = lo; i < hi; i++) {
      const va = a[i] - ma, vb = b[i + s] - mb;
      num += va * vb; da += va * va; db += vb * vb;
    }
    const r = (da > 0 && db > 0) ? num / Math.sqrt(da * db) : -2;
    if (!best || r > best.r) best = { s, r };
  }
  return best || { s: 0, r: -2 };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  prepareBaseline();
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  let srv = null, srvBase = null, browser = null;
  try {
    srv = await startServer(PORT, ROOT);
    srvBase = await startServer(BASELINE_PORT, BASELINE_DIR);
    const BASE = 'http://127.0.0.1:' + PORT;
    const BBASE = 'http://127.0.0.1:' + BASELINE_PORT;
    console.log('[drv] cur =' + BASE + '  (' + ROOT + ')');
    console.log('[drv] base=' + BBASE + '  (' + BASELINE_DIR + ' @ ' + BASELINE_REV + ')');

    const profile = path.join(os.tmpdir(), 'df_pptr_profile_step3');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + profile],
    });
    const fieldPre = { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS };

    // ══ 0: 素性 ══════════════════════════════════════════════════════════════
    mark('0: baseline が「STEP3 前」であること + 現行に STEP3 の実装があること');
    {
      const src = fs.readFileSync(path.join(BASELINE_DIR, 'index.html'), 'utf8');
      const cur = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      check('(0a) baseline は単色プレースホルダ (FIELD_SKY_PLACEHOLDER があり FIELD_SKY_ON が無い)',
        src.indexOf('FIELD_SKY_PLACEHOLDER') > 0 && src.indexOf('FIELD_SKY_ON') < 0, 'rev=' + BASELINE_REV);
      check('(0b) 現行に STEP3 の実装がある (FIELD_SKY_ON / paintFieldRidge / fieldHash)',
        cur.indexOf('FIELD_SKY_ON') > 0 && cur.indexOf('paintFieldRidge') > 0 && cur.indexOf('fieldHash') > 0, '');
      // ★ 静的にも「空の実装が Math.random を呼んでいない」ことを見る (A② の裏取り)
      // ⚠️ ブロックの終端は `function renderMap` ではなく**雲の影の直前**。雲の影は仕様として
      //    Date.now を引くので、そこまで含めると恒久的に FAIL する (一度これで落ちた)。
      const blockStart = cur.indexOf('const FIELD_SKY_FADE_H');
      const blockEnd = cur.indexOf('// ── [屋外] 雲の影');
      const block = (blockStart > 0 && blockEnd > blockStart) ? cur.slice(blockStart, blockEnd) : '';
      check('(0c) 空/遠景の実装ブロックに Math.random / Date.now のリテラルが 1 つも無い',
        block.length > 0 && block.indexOf('Math.random') < 0 && block.indexOf('Date.now') < 0,
        'block=' + block.length + 'B');
    }

    // ══ A: 決定論 ════════════════════════════════════════════════════════════
    mark('A: 決定論 (同一フレーム2回一致 / Math.random 0回 / Date.now 0回 / 別ロード間 SHA 一致)');
    const CROSS = {};
    for (const vp of SHOT_VIEWPORTS) {
      const p = await bootPage(browser, BASE + '/index.html?intel=0', vp, fieldPre);
      await p.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1200));
      await p.page.evaluate(() => window.__probe.quiesce());
      const g = await p.page.evaluate(() => window.__probe.geo());
      check('(A0-' + vp.name + ') 屋外の器が有効 (FIELD_GEO_ACTIVE && FIELD_MODE && drawFieldSky)',
        g.fieldGeoActive === true && g.fieldMode === true && g.hasSkyFn === true && g.skyOn === true,
        JSON.stringify(g));

      // ① 同じフレームを 2 回
      const two = await p.page.evaluate(() => {
        const P = window.__probe;
        P.setCam(2400, camY); P.render(); const a = mapCanvas.toDataURL('image/png');
        P.setCam(2400, camY); P.render(); const b = mapCanvas.toDataURL('image/png');
        return { a: a, b: b, camY: camY };
      });
      check('(A1-' + vp.name + ') 同じ camX/camY で 2 回描いた mapCanvas が完全一致',
        two.a === two.b, 'sha=' + sha256(two.a).slice(0, 16));

      // ②③ RNG / 時計の非依存
      const pur = await p.page.evaluate(() => window.__probe.skyPurity());
      check('(A2-' + vp.name + ') drawFieldSky が Math.random を 1 度も引かない (cold/warm とも)',
        !pur.missing && pur.cold && pur.cold.rand === 0 && pur.warm.rand === 0,
        JSON.stringify(pur));
      check('(A3-' + vp.name + ') drawFieldSky が Date.now を 1 度も引かない (時間非依存)',
        !pur.missing && pur.cold && pur.cold.now === 0 && pur.warm.now === 0,
        JSON.stringify(pur));

      // ④ 別ロード間で空矩形の SHA が一致
      const sky = await p.page.evaluate(() => { window.__probe.setCam(2400, camY); window.__probe.render(); return window.__probe.skyRect(); });
      CROSS[vp.name] = { sha: sha256(sky.url), h: sky.h, w: sky.w, camY: two.camY };
      await p.page.close();
    }
    for (const vp of SHOT_VIEWPORTS) {
      const p = await bootPage(browser, BASE + '/index.html?intel=0', vp, fieldPre);
      await p.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1200));
      await p.page.evaluate(() => window.__probe.quiesce());
      const sky = await p.page.evaluate(() => { window.__probe.setCam(2400, camY); window.__probe.render(); return window.__probe.skyRect(); });
      const a = CROSS[vp.name];
      check('(A4-' + vp.name + ') 別ページロードでも空矩形の SHA-256 が一致 (hash が実行に非依存)',
        !!sky && sha256(sky.url) === a.sha && sky.h === a.h,
        'sha=' + sha256(sky.url).slice(0, 16) + ' vs ' + a.sha.slice(0, 16) + ' skyPx=' + (sky ? sky.h : '-'));
      await p.page.close();
    }

    // ══ B: ?sky=0 ════════════════════════════════════════════════════════════
    mark('B: ?sky=0 は空描画だけを落とし、幾何とカメラは残す');
    {
      const on = await bootPage(browser, BASE + '/index.html?intel=0', HASH_VIEWPORT, fieldPre);
      const off = await bootPage(browser, BASE + '/index.html?intel=0&sky=0', HASH_VIEWPORT, fieldPre);
      for (const P of [on, off]) await P.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1200));
      for (const P of [on, off]) await P.page.evaluate(() => window.__probe.quiesce());
      const gOn = await on.page.evaluate(() => window.__probe.geo());
      const gOff = await off.page.evaluate(() => window.__probe.geo());
      check('(B1) ?sky=0 で FIELD_SKY_ON === false / 未指定では true',
        gOn.skyOn === true && gOff.skyOn === false, 'on=' + gOn.skyOn + ' off=' + gOff.skyOn);
      check('(B2) ?sky=0 でも幾何は残る (FIELD_GEO_ACTIVE === true)',
        gOff.fieldGeoActive === true, JSON.stringify(gOff));
      check('(B3) ?sky=0 でも FIELD_MODE は true のまま (?field=0 とは別物)',
        gOff.fieldMode === true, 'fieldMode=' + gOff.fieldMode);
      check('(B4) ?sky=0 でもカメラ固定は残る (camY が理論値と一致)',
        Math.abs(gOff.camY - camYOf(gOff.usableH)) < 1e-6,
        'camY=' + gOff.camY + ' 期待=' + camYOf(gOff.usableH) + ' usableH=' + gOff.usableH);
      // ⚠️ 最下 1 行は**空ではない**。camY は 918.4 のような小数なので、路肩 (worldY=1152) を塗る
      //    fillRect のスクリーン y も 233.6 のような小数になり、その行が 40% だけ生垣色で
      //    アンチエイリアスされる。Math.round(1152-camY)=234 で切った矩形はこの半端な行を含む。
      //    これは路肩の上端が滑らかに繋がっている**正しい**挙動で、空の描き漏れではない。
      //    よって純度は「最下 2 行を除いた空矩形」で測り、除いた行は情報として持ち帰る。
      const uni = await off.page.evaluate(() => {
        const P = window.__probe; P.setCam(2400, camY); P.render();
        const H = Math.max(0, Math.round(FIELD_HORIZON_Y - camY));
        const W = mapCanvas.width;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const cc = c.getContext('2d', { willReadFrequently: true });
        cc.drawImage(mapCanvas, 0, 0, W, H, 0, 0, W, H);
        const d = cc.getImageData(0, 0, W, H).data;
        const set = {}, impureRows = [];
        for (let y = 0; y < H; y++) {
          let bad = 0;
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (d[i] !== 10 || d[i + 1] !== 10 || d[i + 2] !== 10) {
              bad++;
              if (y < H - 2) set[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
            }
          }
          if (bad) impureRows.push(y);
        }
        return { colors: Object.keys(set), H: H, impureRows: impureRows,
                 impureAboveCut: impureRows.filter(y => y < H - 2) };
      });
      check('(B5) ?sky=0 の空矩形 (最下2行を除く) が背景色 #0a0a0a 一色 = 空が 1px も描かれていない',
        uni.impureAboveCut.length === 0 && uni.colors.length === 0,
        'H=' + uni.H + ' 非背景行=' + JSON.stringify(uni.impureRows) +
        ' (最下2行=路肩上端のアンチエイリアス) 残色=' + JSON.stringify(uni.colors.slice(0, 5)));
      const skyOnRect = await on.page.evaluate(() => { window.__probe.setCam(2400, camY); window.__probe.render(); return window.__probe.skyRect(); });
      const skyOffRect = await off.page.evaluate(() => { window.__probe.setCam(2400, camY); window.__probe.render(); return window.__probe.skyRect(); });
      check('(B6) 陽性対照: 空 ON と OFF で空矩形が異なる (assert が空振りでない証拠)',
        sha256(skyOnRect.url) !== sha256(skyOffRect.url),
        sha256(skyOnRect.url).slice(0, 12) + ' vs ' + sha256(skyOffRect.url).slice(0, 12));
      await on.page.close(); await off.page.close();
    }

    // ══ C: パララックス 2 速 ═════════════════════════════════════════════════
    mark('C: パララックス 2 速 (far 0.15 / mid 0.35) を画素の相互相関で実測');
    {
      const p = await bootPage(browser, BASE + '/index.html?intel=0', PARALLAX_VIEWPORT, fieldPre);
      await p.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1200));
      await p.page.evaluate(() => window.__probe.quiesce());
      const X0 = 1200, D = 800;
      const prof = async (cx) => p.page.evaluate((x) => {
        const P = window.__probe; P.setCam(x, camY); P.render(); return P.layerProfiles();
      }, cx);
      const p0 = await prof(X0), p1 = await prof(X0 + D);
      // 稜線が全列で検出できていること = far が並木に隠し切られていないことの確認でもある
      const cols = (a) => a.filter(v => v > 0).length;
      check('(C0) 両層の稜線が**全列**で検出できている (far が並木に隠されていない)',
        !!p0 && cols(p0.far) === p0.W && cols(p0.mid) === p0.W,
        p0 ? 'far稜線列=' + cols(p0.far) + '/' + p0.W + ' mid稜線列=' + cols(p0.mid) + '/' + p0.W
             + ' farPx=' + p0.farPx + ' midPx=' + p0.midPx + ' skyPx=' + p0.H : 'null');
      const expFar = -Math.round(D * FAR_PARALLAX);   // 内容は camX と逆方向へ動く
      const expMid = -Math.round(D * MID_PARALLAX);
      const sFar = bestShift(p0.far, p1.far, 420);
      const sMid = bestShift(p0.mid, p1.mid, 420);
      check('(C1) far 層のずれが D×0.15 = ' + expFar + 'px (実測 ' + sFar.s + 'px, r=' + sFar.r.toFixed(3) + ')',
        Math.abs(sFar.s - expFar) <= 3 && sFar.r > 0.9, 'D=' + D);
      check('(C2) mid 層のずれが D×0.35 = ' + expMid + 'px (実測 ' + sMid.s + 'px, r=' + sMid.r.toFixed(3) + ')',
        Math.abs(sMid.s - expMid) <= 3 && sMid.r > 0.9, 'D=' + D);
      check('(C3) 2 層が**別々の速度**で動いている (同一だと視差にならない)',
        Math.abs(sFar.s - sMid.s) >= 100,
        'far=' + sFar.s + ' mid=' + sMid.s + ' 差=' + Math.abs(sFar.s - sMid.s) + 'px');
      const p0b = await prof(X0);
      const sZero = bestShift(p0.far, p0b.far, 60);
      check('(C4) 陰性対照: camX を動かさなければずれ 0 (相関 1.0)',
        sZero.s === 0 && sZero.r > 0.999, 'shift=' + sZero.s + ' r=' + sZero.r.toFixed(5));
      await p.page.close();
    }

    // ══ D: 非退行 ════════════════════════════════════════════════════════════
    mark('D: 既存6シナリオの非退行 (SHA-256) + caravan-road は必ず変わる (陽性対照)');
    for (const scen of LEGACY_SCENARIOS) {
      const pre = { mode: 'legacy', scen, freeze: true, t0: T_BASE_MS };
      const A = await bootPage(browser, BASE + '/index.html?intel=0', HASH_VIEWPORT, pre);
      const B = await bootPage(browser, BBASE + '/index.html?intel=0', HASH_VIEWPORT, pre);
      const patA = await A.page.evaluate(() => window.__probe.patternsReady());
      const patB = await B.page.evaluate(() => window.__probe.patternsReady());
      check('(D0-' + scen + ') 両側とも wall/floor pattern が非 null',
        patA.wall && patA.floor && patB.wall && patB.floor,
        'cur=' + JSON.stringify(patA) + ' base=' + JSON.stringify(patB));
      const snap = (pg) => pg.evaluate(() => {
        window.requestAnimationFrame = function () { return 0; };
        computeCameraTarget(); camX = camTargetX; camY = camTargetY;
        renderMap();
        return { url: mapCanvas.toDataURL('image/png'),
                 fieldMode: (function () { try { return FIELD_MODE; } catch (e) { return '<none>'; } })() };
      });
      const sa = await snap(A.page), sb = await snap(B.page);
      check('(D1-' + scen + ') FIELD_MODE === false (屋外ゲートの外)', sa.fieldMode === false, 'FIELD_MODE=' + sa.fieldMode);
      check('(D2-' + scen + ') mapCanvas SHA-256 が baseline と一致',
        sha256(sa.url) === sha256(sb.url),
        sha256(sa.url).slice(0, 16) + ' vs ' + sha256(sb.url).slice(0, 16));
      check('(D3-' + scen + ') ページエラー 0', A.pageErrors.length === 0 && B.pageErrors.length === 0,
        A.pageErrors.concat(B.pageErrors).join(' | ') || 'none');
      await A.page.close(); await B.page.close();
    }
    {
      const A = await bootPage(browser, BASE + '/index.html?intel=0', HASH_VIEWPORT, fieldPre);
      const B = await bootPage(browser, BBASE + '/index.html?intel=0', HASH_VIEWPORT, fieldPre);
      for (const P of [A, B]) await P.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1200));
      for (const P of [A, B]) await P.page.evaluate(() => window.__probe.quiesce());
      const g = (pg) => pg.evaluate(() => { const P = window.__probe; P.setCam(2400, camY); P.render(); return P.skyRect(); });
      const sa = await g(A.page), sb = await g(B.page);
      check('(D4) 陽性対照: caravan-road の空矩形は baseline と**異なる** (単色→グラデ+遠景)',
        !!sa && !!sb && sha256(sa.url) !== sha256(sb.url),
        'cur=' + sha256(sa.url).slice(0, 12) + ' base=' + sha256(sb.url).slice(0, 12) + ' skyPx=' + sa.h);
      check('(D5) 屋外の pageerror 0', A.pageErrors.length === 0 && B.pageErrors.length === 0,
        A.pageErrors.concat(B.pageErrors).join(' | ') || 'none');
      await A.page.close(); await B.page.close();
    }

    // ══ E: フレーム時間 ══════════════════════════════════════════════════════
    mark('E: フレーム時間 (baseline=単色 vs 現行=グラデ+遠景)。JS 時間と flush 込みの両方');
    // ⚠️ **2 ページを同時に開いたまま順番に測ってはいけない。** 最初そうしたところ desktop で
    //    「cur が base より +2.8ms 遅い」という値が出たが、アブレーション (空を no-op に挿げ替えて
    //    同一ページ内で比較) では**差が 0** だった。真因は測定順で、先に測った側が生きている
    //    もう一方のページ (setInterval(moveEnemies,30) とパーティクル) の負荷を丸ごと被っていた。
    //    よって 1 ページずつ開いて測り、閉じてから次を開く。さらに順序バイアスを打ち消すため
    //    cur→base と base→cur の 2 巡を回して各々の中央値を採る。
    var perfRows = [];
    const measureOne = async (url, vp) => {
      const P = await bootPage(browser, url, vp, fieldPre);
      await P.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1500));
      await P.page.evaluate(() => window.__probe.quiesce());
      const r = await P.page.evaluate(() => window.__probe.perf(140));
      await P.page.close();
      return r;
    };
    for (const vp of [SHOT_VIEWPORTS[0], SHOT_VIEWPORTS[1]]) {
      const a1 = await measureOne(BASE + '/index.html?intel=0', vp);
      const b1 = await measureOne(BBASE + '/index.html?intel=0', vp);
      const b2 = await measureOne(BBASE + '/index.html?intel=0', vp);
      const a2 = await measureOne(BASE + '/index.html?intel=0', vp);
      const pick = (x, y) => ({ n: x.n,
        jsMed: Math.min(x.jsMed, y.jsMed), flushMed: Math.min(x.flushMed, y.flushMed),
        jsMean: (x.jsMean + y.jsMean) / 2, flushMean: (x.flushMean + y.flushMean) / 2 });
      const pa = pick(a1, a2), pb = pick(b1, b2);
      perfRows.push({ vp: vp.name, cur: pa, base: pb });
      const dJs = pa.jsMed - pb.jsMed, dFl = pa.flushMed - pb.flushMed;
      console.log('    [' + vp.name + '] renderMap JS 中央値  base=' + pb.jsMed.toFixed(3)
        + 'ms  cur=' + pa.jsMed.toFixed(3) + 'ms  Δ=' + (dJs >= 0 ? '+' : '') + dJs.toFixed(3) + 'ms');
      console.log('    [' + vp.name + '] flush 込み 中央値     base=' + pb.flushMed.toFixed(3)
        + 'ms  cur=' + pa.flushMed.toFixed(3) + 'ms  Δ=' + (dFl >= 0 ? '+' : '') + dFl.toFixed(3) + 'ms');
      // ⚠️ 合格バーは「悪化ゼロ」ではなく「実測ノイズと同オーダー」。空は元々 fillRect 1 枚で
      //    塗っていた領域なので、置き換えの純増分は小さいはず。
      check('(E-' + vp.name + ') flush 込みフレーム時間の悪化が 0.5ms 未満',
        dFl < 0.5, 'base=' + pb.flushMed.toFixed(3) + 'ms cur=' + pa.flushMed.toFixed(3)
        + 'ms Δ=' + dFl.toFixed(3) + 'ms (JS Δ=' + dJs.toFixed(3) + 'ms, n=' + pa.n + '×2巡)');
    }

    // ══ F: スクショ 3 ビューポート × 3 地点 = 9 枚 ═════════════════════════════
    mark('F: スクショ 3 ビューポート × 3 地点 = 9 枚 (+ 横持ちフォールバック 1 枚)');
    let shots = 0;
    for (const vp of SHOT_VIEWPORTS) {
      const p = await bootPage(browser, BASE + '/index.html?intel=0', vp, fieldPre);
      await p.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 2500));
      await p.page.evaluate(() => window.__probe.quiesce());
      const g = await p.page.evaluate(() => window.__probe.geo());
      const maxCamX = MAP_W * TILE_SIZE - g.canvasW;
      for (const spot of SHOT_SPOTS) {
        const cx = Math.max(0, Math.min(spot.camX, maxCamX));
        await p.page.evaluate((x) => {
          const P = window.__probe;
          P.setCam(x, camY);
          try { updatePositions(); } catch (e) {}
          P.setCam(x, camY); P.render();
        }, cx);
        await p.page.screenshot({ path: path.join(SHOT_DIR, 'step3_' + vp.name + '_' + spot.name + '.png'),
                                  type: 'png', captureBeyondViewport: false });
        shots++;
      }
      check('(F-' + vp.name + ') 3 地点のスクショを保存 (skyPx=' + skyPxOf(g.usableH).toFixed(0)
        + ' = ' + (skyPxOf(g.usableH) / g.usableH * 100).toFixed(1) + '%)',
        true, 'usableH=' + g.usableH + ' camY=' + g.camY);
      await p.page.close();
    }
    {
      const p = await bootPage(browser, BASE + '/index.html?intel=0', LAND_VIEWPORT, fieldPre);
      await p.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 2500));
      const g = await p.page.evaluate(() => window.__probe.geo());
      await p.page.screenshot({ path: path.join(SHOT_DIR, 'step3_iphone_land_fallback.png'), type: 'png' });
      shots++;
      check('(F-land) 横持ちは従来描画へフォールバック (FIELD_GEO_ACTIVE === false) — 確認用に 1 枚',
        g.fieldGeoActive === false, 'usableH=' + g.usableH + ' fieldGeoActive=' + g.fieldGeoActive);
      await p.page.close();
    }
    check('(F0) スクショが 9 枚 + フォールバック 1 枚 = 10 枚', shots === 10, 'shots=' + shots + ' dir=' + SHOT_DIR);

    console.log('\n--- フレーム時間まとめ ---');
    for (const r of perfRows) {
      console.log('  ' + r.vp + ': JS ' + r.base.jsMed.toFixed(3) + ' → ' + r.cur.jsMed.toFixed(3)
        + ' ms  /  flush込み ' + r.base.flushMed.toFixed(3) + ' → ' + r.cur.flushMed.toFixed(3) + ' ms');
    }

  } catch (e) {
    console.error('[drv] 例外: ' + (e && e.stack || e));
    check('DRIVER 例外なし', false, String(e && e.message || e));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
    if (srvBase) { try { srvBase.close(); } catch (e) {} }
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  RESULT: ' + pass + '/' + results.length + (pass === results.length ? '  ALL PASS' : '  ** FAIL **'));
  for (const r of results) if (!r.ok) console.log('   FAIL  ' + r.name + '  — ' + r.detail);
  console.log('  shots: ' + SHOT_DIR);
  console.log('════════════════════════════════════════════════════════');
  process.exit(pass === results.length ? 0 : 1);
})();
