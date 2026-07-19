#!/usr/bin/env node
/*
 * driver_field_step2.js — 「地平線ビュー STEP2 = 壁の低背化 + 天井潰しの解除 + 松明」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 計画書: dev-meetings/2026-07-19_隊商護衛の地平線ビュー.md  §4 STEP 2 / §3
 *
 * ■ なぜ「描画コマンドを覗く」のか (ピクセル SHA では足りない理由)
 *   STEP2 が消すのは「空を塞いでいた3つの層」であって、色ではない。ピクセル比較だと
 *   ① wallPattern が null のフォールバック経路へ落ちて 192px 壁が復活しても
 *   ② フォールバック同士で一致していれば PASS に化ける。よって ctx.fillRect / ctx.drawImage を
 *   **両方**フックし、引数そのものを見る。
 *
 * ■ 検証する assert
 *   A1  屋外 1 フレームに「高さ引数 192」が 0 件         (第2要因 = 192px 不透明壁の除去)
 *   A2  屋外 1 フレームに y < HORIZON_Y を塗る矩形/画像が 0 件
 *       ⚠️ drawFieldSky は**スタブして**測る。空自身は当然 y<HORIZON を塗るので、
 *          スタブしないと assert が恒偽になり何も検証しない。
 *   A3  屋外 1 フレームに torch の drawImage が 0 件       (松明が空中に浮く事故)
 *   A4  (陽性対照) 路肩 = worldY===HORIZON_Y かつ h===VERGE_H の矩形が存在する
 *   A5  (陽性対照) 帯より南に床の矩形が存在する = 前景エプロンが塗られている
 *   A6  (陽性対照) 天井 (SPR_CEILING) の drawImage が row12 以外に 1 件も無い
 *   B   **改修前 (--baseline-rev) で A1/A2/A3 が必ず FAIL する** = 空振り assert でないことの実証
 *   C   CLOUDS 14個 × 3ビューポートで可視帯到達 14/14
 *       可視帯は実プレイのカメラ実測 (__camTrace) から出す。地平線 clip も込みで判定する。
 *   D   既存6シナリオ: mapCanvas.toDataURL() SHA-256 一致 **に加えて**
 *       fillRect/drawImage の引数列を順序込みで baseline と完全一致
 *   E   撤退スイッチ: ?field=0 / ?fieldgeo=0 で 192px 壁が戻る (取り違え検出)
 *
 * 使い方:
 *   node tools/driver_field_step2.js [--headful] [--browser <path>] [--port N]
 *                                    [--baseline-rev 609c9d7] [--shots <dir>]
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
const PORT = parseInt(arg('port', '8831'), 10);
const BASELINE_PORT = PORT + 1;
const BASELINE_REV = arg('baseline-rev', '609c9d7');
const BASELINE_DIR = arg('baseline-dir', path.join(os.tmpdir(), 'df_step2_baseline'));
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
  'd59476b7-452d-4dab-a2e8-62026a9fc308', 'scratchpad', 'step2'));

// ── 幾何定数 (index.html の FIELD_* と一致させること) ────────────────────────
const TILE_SIZE = 96;
const BAND_TOP_ROW = 13, BAND_BOTTOM_ROW = 15;
const BAND_H = 3 * TILE_SIZE;
const VERGE_H = 96;
const SKY_MIN = 56, SKY_RATIO = 0.32;
const HORIZON_Y = BAND_TOP_ROW * TILE_SIZE - VERGE_H;   // 1152
const HORIZON_ROW = HORIZON_Y / TILE_SIZE;              // 12
const CLOUD_TILE_PX = 256;
// 「可視帯に到達した」の判定バー: 影の**芯** (焼き込みタイルの α≥0.22 相当 = 半径 0.22×size)
// が可視矩形と交わること。外縁 (α≈0) が掠るだけの雲を「見えている」と数えないための厳しめの定義。
const CLOUD_CORE_R = (s) => 0.22 * CLOUD_TILE_PX * s;

function skyPxOf(usableH) {
  return Math.max(0, Math.min(Math.max(SKY_MIN, SKY_RATIO * usableH), usableH - VERGE_H - BAND_H));
}
function camYOf(usableH) { return HORIZON_Y - skyPxOf(usableH); }

const LEGACY_SCENARIOS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const SHIP_VIEWPORTS = [
  { name: 'iphone_port', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
// assert C 用の 3 ビューポート。iphone_land は幾何フォールバック側 (clip 無し・カメラ自由) だが、
// 雲は FIELD_MODE 側の描画なので出続ける = y 帯を変えた影響を必ず受ける。だから測る。
const CLOUD_VIEWPORTS = [
  { name: 'iphone_port', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'iphone_land', width: 844, height: 390 },
];
const HASH_VIEWPORT = { width: 1440, height: 900 };

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
function mark(msg) { console.log('\n[drv] ' + (++step) + '. ' + msg); }
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const T_BASE_MS = 1700000000000;

// ── プレリュード ────────────────────────────────────────────────────────────
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

// ── in-page プローブ (描画コマンドのスパイ本体) ─────────────────────────────
async function installProbe(page) {
  await page.evaluate(() => {
    const P = {};
    P.freeze = function () { window.requestAnimationFrame = function () { return 0; }; };
    P.setCam = function (x, y) { camX = x; camY = y; return { camX: camX, camY: camY }; };
    P.cam = function () { return { camX: camX, camY: camY }; };
    P.patternsReady = function () {
      let w = null, f = null;
      try { w = wallPattern; } catch (e) { w = '<unreadable>'; }
      try { f = floorPattern; } catch (e) { f = '<unreadable>'; }
      return { wall: w !== null && w !== undefined && w !== '<unreadable>',
               floor: f !== null && f !== undefined && f !== '<unreadable>' };
    };
    P.geo = function () {
      const g = {};
      try { g.isFieldTheme = IS_FIELD_THEME; } catch (e) { g.isFieldTheme = '<none>'; }
      try { g.fieldMode = FIELD_MODE; } catch (e) { g.fieldMode = '<none>'; }
      try { g.fieldGeoActive = FIELD_GEO_ACTIVE; } catch (e) { g.fieldGeoActive = '<none>'; }
      try { g.hasSkyFn = typeof drawFieldSky === 'function'; } catch (e) { g.hasSkyFn = false; }
      try { g.usableH = window.innerHeight - cameraBottomHud(); } catch (e) { g.usableH = null; }
      try { g.canvasW = mapCanvas.width; g.canvasH = mapCanvas.height; } catch (e) {}
      try { g.torchLoaded = torchWallImgLoaded; } catch (e) { g.torchLoaded = '<none>'; }
      try { g.nTorchDeco = decorations.filter(function (d) { return d.kind === 'torch'; }).length; }
      catch (e) { g.nTorchDeco = '<none>'; }
      return g;
    };
    // 松明の assert が「画面内に松明が1本も無かっただけ」で空振りしないようにする。
    // ⚠️ Pass1.5/2.5 は d.tx が [startTX-1, endTX+1] の外なら描かない。既定カメラ (camX=0) では
    //    西端に松明が無く、baseline でも torch=0 になって**対照実験そのものが無効**になる。
    P.torches = function () {
      try { return decorations.filter(function (d) { return d.kind === 'torch'; })
        .map(function (d) { return { tx: d.tx, ty: d.ty }; }); } catch (e) { return []; }
    };
    P.rowsWalkable = function () {
      const out = [];
      try { for (let r = 0; r < MAP_H; r++) {
        let n = 0; for (let c = 0; c < MAP_W; c++) if (mapData[r][c] !== 2) n++;
        if (n > 0) out.push(r);
      } } catch (e) {}
      return out;
    };
    P.clouds = function () {
      try {
        return { n: CLOUDS.length, tile: CLOUD_TILE_PX,
                 list: CLOUDS.map(function (c) { return { x: c.x, y: c.y, s: c.s, v: c.v }; }) };
      } catch (e) { return { n: 0, list: [] }; }
    };

    // ── 描画コマンドのスパイ ────────────────────────────────────────────────
    // ⚠️ 座標系が2つある。Pass1a/Pass2.5 は**スクリーン座標**で呼び、Pass1b/Pass2 は
    //    ctx.translate(-camX,-camY) 済みの**ワールド座標**で呼ぶ。素の引数だけ集めると
    //    両者が混ざって「地平線より上か」の判定が静かに壊れる。よって translate/save/restore を
    //    追跡して全部スクリーン座標へ正規化し、そこから camX/camY を足してワールドへ戻す。
    //    setTransform/scale/rotate/transform が来たら追跡不能なので記録して FAIL させる。
    P.spy = function (opts) {
      opts = opts || {};
      const c = ctx;
      const O = {};
      ['fillRect', 'drawImage', 'save', 'restore', 'translate', 'setTransform',
       'scale', 'rotate', 'transform', 'beginPath', 'rect', 'clip'].forEach(function (k) { O[k] = c[k]; });
      const rec = { fillRect: [], drawImage: [], badTransform: [] };
      let dx = 0, dy = 0;
      // ⚠️ clip を数えないと「呼んだけれど画素は出ていない」描画を violation に数えてしまう
      //    (雲の影は drawCloudShadows が地平線 clip を張った中で drawImage する。呼び出しの y
      //    だけ見ると空へ描いたように見えるが、実際には 1 画素も出ていない)。
      //    本体の clip 利用は全て beginPath → rect(1回) → clip の形なので、その形だけ追えばよい。
      let clipY0 = -1e9, clipY1 = 1e9;
      let pendRect = null;
      const stack = [];
      const nm = function (im) {
        try {
          if (im && im.src) { const s = String(im.src); return s.slice(s.lastIndexOf('/') + 1).split('?')[0]; }
          if (im && im.tagName === 'CANVAS') return '<canvas' + im.width + 'x' + im.height + '>';
        } catch (e) {}
        return '<?>';
      };
      c.save = function () { stack.push([dx, dy, clipY0, clipY1]); return O.save.apply(c, arguments); };
      c.restore = function () {
        const s = stack.pop();
        if (s) { dx = s[0]; dy = s[1]; clipY0 = s[2]; clipY1 = s[3]; }
        return O.restore.apply(c, arguments);
      };
      c.beginPath = function () { pendRect = null; return O.beginPath.apply(c, arguments); };
      c.rect = function (x, y, w, h) { pendRect = [y + dy, y + dy + h]; return O.rect.apply(c, arguments); };
      c.clip = function () {
        if (pendRect) { clipY0 = Math.max(clipY0, pendRect[0]); clipY1 = Math.min(clipY1, pendRect[1]); }
        else rec.badTransform.push('clip-without-rect');
        return O.clip.apply(c, arguments);
      };
      c.translate = function (x, y) { dx += x; dy += y; return O.translate.apply(c, arguments); };
      c.setTransform = function () { rec.badTransform.push('setTransform'); dx = 0; dy = 0; return O.setTransform.apply(c, arguments); };
      c.scale = function () { rec.badTransform.push('scale'); return O.scale.apply(c, arguments); };
      c.rotate = function () { rec.badTransform.push('rotate'); return O.rotate.apply(c, arguments); };
      c.transform = function () { rec.badTransform.push('transform'); return O.transform.apply(c, arguments); };
      c.fillRect = function (x, y, w, h) {
        rec.fillRect.push({ x: x, y: y, w: w, h: h, dx: dx, dy: dy, c0: clipY0, c1: clipY1 });
        return O.fillRect.apply(c, arguments);
      };
      c.drawImage = function () {
        const a = arguments, n = a.length;
        let e;
        if (n === 3)      e = { dX: a[1], dY: a[2], dW: null, dH: null, sX: null, sY: null, sW: null, sH: null };
        else if (n === 5) e = { dX: a[1], dY: a[2], dW: a[3], dH: a[4], sX: null, sY: null, sW: null, sH: null };
        else              e = { dX: a[5], dY: a[6], dW: a[7], dH: a[8], sX: a[1], sY: a[2], sW: a[3], sH: a[4] };
        e.img = nm(a[0]); e.argc = n; e.dx = dx; e.dy = dy; e.c0 = clipY0; e.c1 = clipY1;
        // 引数省略形は自然サイズが実効サイズ
        if (e.dW === null) { try { e.dW = a[0].naturalWidth || a[0].width; e.dH = a[0].naturalHeight || a[0].height; } catch (er) {} }
        rec.drawImage.push(e);
        return O.drawImage.apply(c, arguments);
      };

      const stubSky = opts.stubSky && typeof window.drawFieldSky === 'function';
      const realSky = window.drawFieldSky;
      if (stubSky) window.drawFieldSky = function () {};
      try { renderMap(); } finally {
        if (stubSky) window.drawFieldSky = realSky;
        Object.keys(O).forEach(function (k) { c[k] = O[k]; });
      }

      // ワールド座標へ正規化して持ち帰る
      const CX = camX, CY = camY;
      const fr = rec.fillRect.map(function (r) {
        return { wx: r.x + r.dx + CX, wy: r.y + r.dy + CY, w: r.w, h: r.h, c0: r.c0, c1: r.c1 };
      });
      const di = rec.drawImage.map(function (r) {
        return { img: r.img, argc: r.argc, sX: r.sX, sY: r.sY, sW: r.sW, sH: r.sH,
                 wx: r.dX + r.dx + CX, wy: r.dY + r.dy + CY, w: r.dW, h: r.dH, c0: r.c0, c1: r.c1 };
      });
      return { camX: CX, camY: CY, canvasW: mapCanvas.width, canvasH: mapCanvas.height,
               badTransform: rec.badTransform, fillRect: fr, drawImage: di };
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
    try { return typeof renderMap === 'function' && !!mapData && !!mapCanvas; } catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await waitImages(page, url);
  await installProbe(page);
  return { page, pageErrors };
}

// ── 実プレイのカメラを録る (STEP0 のシーム __camTrace) ───────────────────────
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
  const geo = await page.evaluate(() => {
    const g = {};
    try { g.fieldGeoActive = FIELD_GEO_ACTIVE; } catch (e) { g.fieldGeoActive = '<none>'; }
    try { g.usableH = window.innerHeight - cameraBottomHud(); } catch (e) { g.usableH = null; }
    try { g.canvasH = mapCanvas.height; g.canvasW = mapCanvas.width; } catch (e) {}
    return g;
  });
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await new Promise(r => setTimeout(r, ms));
  const trace = await page.evaluate(() => {
    const t = (window.__camTrace || []);
    if (!t.length) return { n: 0, samples: [] };
    const camX = t.map(s => s.camX), camY = t.map(s => s.camY);
    const idx = [];
    for (let i = 0; i < t.length; i += Math.max(1, Math.floor(t.length / 8))) idx.push(i);
    idx.push(t.length - 1);
    const uniq = Array.from(new Set(idx)).filter(i => i >= 0 && i < t.length);
    return {
      n: t.length,
      camYmin: Math.min.apply(null, camY), camYmax: Math.max.apply(null, camY),
      camXmin: Math.min.apply(null, camX), camXmax: Math.max.apply(null, camX),
      phases: t.reduce((a, s) => { a[s.phase] = (a[s.phase] || 0) + 1; return a; }, {}),
      samples: uniq.map(i => ({ camX: t[i].camX, camY: t[i].camY, phase: t[i].phase })),
    };
  });
  await page.close();
  return { geo, trace, errs };
}

// ── スパイ結果の解析 ────────────────────────────────────────────────────────
// 天井スプライト SPR_CEILING は tileset の (128,0,16,16)。松明は torch_wall.png、
// フォールバックは tileset の (160..208, 256)。
function analyze(spy) {
  let rects = spy.fillRect;
  const imgs = spy.drawImage;
  const isTorch = (d) => (d.img.indexOf('torch_wall') >= 0)
    || (d.sY === 256 && [160, 176, 192, 208].indexOf(d.sX) >= 0);
  // ⚠️ renderMap 冒頭の全面クリア (#0a0a0a を canvas 全域に塗る) は「空を塞ぐ層」ではないので除く。
  //    これを数えると A2 は絶対に 0 件にならず、assert が恒偽になって何も検証しなくなる。
  //    ただし**先頭の1件が全面矩形であること**は毎回確かめる (静かに別物を除外しないため)。
  let clearedBg = false;
  if (rects.length && rects[0].wx === spy.camX && rects[0].wy === spy.camY
      && rects[0].w === spy.canvasW && rects[0].h === spy.canvasH) {
    rects = rects.slice(1); clearedBg = true;
  }
  // ⚠️ 判定は**スクリーン座標**で行う。Pass1a/Pass2.5 は Math.round(world - cam) で描くので、
  //    ワールドへ戻すと丸め分 (最大 0.5px) だけ地平線を跨いだように見え、実際には画面上で
  //    1px も食い込んでいないものまで FAIL になる。基準線は drawFieldSky が使う丸めと同じ
  //    Math.round(HORIZON_Y - camY) にそろえる = 「空の下端と1px も重ならないか」を測る。
  // ⚠️ さらに 1px の許容を置く。境界ちょうどの描画は**むしろ必須**であり、丸めの向きが
  //    パス毎に違う (Pass1a は Math.round したスクリーン座標 / Pass2 は translate 済みの
  //    ワールド座標をそのまま) ため、0 許容にすると「地平線に 1px の黒い筋を作らないための
  //    正しい重なり」まで FAIL になる。baseline の違反は 96〜192px なので 1px でも検出力は落ちない。
  const HSY = Math.round(HORIZON_Y - spy.camY);
  const LIMIT = HSY - 1;
  // clip を考慮した実効上端。clip の外は 1 画素も出ないので violation ではない。
  const top = (o) => Math.max(o.wy - spy.camY, (o.c0 === undefined ? -1e9 : o.c0));
  const bot = (o) => Math.min(o.wy - spy.camY + (o.h || 0), (o.c1 === undefined ? 1e9 : o.c1));
  const violates = (o) => top(o) < LIMIT - 1e-6 && bot(o) > top(o);
  const aboveRect = rects.filter(r => r.h > 0 && r.w > 0 && violates(r));
  const aboveImg = imgs.filter(d => (d.h || 0) > 0 && violates(d));
  const h192Rect = rects.filter(r => Math.abs(r.h - 192) < 1e-6);
  const h192Img = imgs.filter(d => Math.abs((d.h || 0) - 192) < 1e-6);
  const torches = imgs.filter(isTorch);
  // 陽性対照
  const verge = rects.filter(r => Math.abs(r.wy - HORIZON_Y) < 1e-6 && Math.abs(r.h - VERGE_H) < 1e-6);
  const apron = rects.filter(r => r.wy >= (BAND_BOTTOM_ROW + 1) * TILE_SIZE - 1);
  // ⚠️ SPR_CEILING = [160,16,16,16]。ここを間違えるとフィルタが何にも当たらず A6 が
  //    「ceilRows=[] なので every() は true」で**恒真の空振り assert**に化ける (1回やった)。
  //    だから件数 > 0 も同時に要求する。
  const ceilings = imgs.filter(d => d.sX === 160 && d.sY === 16 && d.sW === 16 && d.sH === 16);
  const ceilRows = Array.from(new Set(ceilings.map(d => Math.round((d.wy) / TILE_SIZE)))).sort((a, b) => a - b);
  const hist = {};
  for (const d of imgs) { const k = d.img + ' s=' + d.sX + ',' + d.sY + ',' + d.sW + ',' + d.sH; hist[k] = (hist[k] || 0) + 1; }
  return {
    clearedBg: clearedBg, hist: hist,
    nRect: rects.length, nImg: imgs.length,
    aboveRect: aboveRect.length, aboveImg: aboveImg.length,
    aboveSample: aboveRect.slice(0, 3).map(r => 'rect y=' + r.wy + ' h=' + r.h)
      .concat(aboveImg.slice(0, 3).map(d => 'img ' + d.img + ' y=' + d.wy + ' h=' + d.h)),
    h192: h192Rect.length + h192Img.length,
    h192Sample: h192Rect.slice(0, 2).map(r => 'rect y=' + r.wy).concat(h192Img.slice(0, 2).map(d => 'img ' + d.img + ' y=' + d.wy)),
    torches: torches.length,
    verge: verge.length, apron: apron.length,
    ceilings: ceilings.length, ceilRows: ceilRows,
    badTransform: spy.badTransform.length,
  };
}
// D 用: 引数列を順序込みで畳んだ指紋
function fingerprint(spy) {
  const f = spy.fillRect.map(r => 'F|' + r.wx + '|' + r.wy + '|' + r.w + '|' + r.h).join('\n');
  const d = spy.drawImage.map(r => 'D|' + r.img + '|' + r.argc + '|' + r.sX + '|' + r.sY
    + '|' + r.wx + '|' + r.wy + '|' + r.w + '|' + r.h).join('\n');
  return { hash: sha256(f + '\n##\n' + d), nF: spy.fillRect.length, nD: spy.drawImage.length };
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  prepareBaseline();
  const puppeteer = loadPuppeteer();
  const srvHead = await startServer(PORT, ROOT);
  const srvBase = await startServer(BASELINE_PORT, BASELINE_DIR);
  const BASE_HEAD = 'http://127.0.0.1:' + PORT;
  const BASE_OLD = 'http://127.0.0.1:' + BASELINE_PORT;
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1',
           '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files'],
  });

  const fieldPre = { mode: 'field', payload: CARAVAN_PAYLOAD, freeze: true, t0: T_BASE_MS };

  try {
    // ══ A: 屋外 1 フレームの描画コマンド ══════════════════════════════════
    mark('A: 屋外 1 フレームの描画コマンドを検査 (HEAD)');
    for (const vp of SHIP_VIEWPORTS) {
      const { page, pageErrors } = await bootPage(browser, BASE_HEAD + '/index.html?intel=0', vp, fieldPre);
      await page.evaluate(() => window.__probe.freeze());
      const geo = await page.evaluate(() => window.__probe.geo());
      const pat = await page.evaluate(() => window.__probe.patternsReady());
      check('A0-' + vp.name + ' 屋外の器が有効 (fieldMode/geoActive/skyFn)',
        geo.fieldMode === true && geo.fieldGeoActive === true && geo.hasSkyFn === true, JSON.stringify(geo));
      check('A0b-' + vp.name + ' wallPattern/floorPattern が非 null (フォールバック経路で測っていない)',
        pat.wall === true && pat.floor === true, JSON.stringify(pat));

      // ⚠️ 松明が画面に入るカメラへ寄せてから測る (そうしないと A3/B3 が空振りする)
      const torches = await page.evaluate(() => window.__probe.torches());
      check('A-cam-' + vp.name + ' 松明が存在し、それを映すカメラへ寄せられる',
        torches.length > 0, 'torch deco=' + torches.length);
      if (torches.length) {
        await page.evaluate((tx) => { const c = window.__probe.cam();
          window.__probe.setCam(Math.max(0, tx * 96 + 48 - mapCanvas.width / 2), c.camY); }, torches[0].tx);
      }
      const spy = await page.evaluate(() => window.__probe.spy({ stubSky: true }));
      const a = analyze(spy);
      check('A-tr-' + vp.name + ' 追跡不能な変換 (setTransform/scale/rotate) が無い',
        a.badTransform === 0, 'badTransform=' + a.badTransform);
      check('A-bg-' + vp.name + ' 先頭の全面クリア矩形を正しく識別できた',
        a.clearedBg === true, 'clearedBg=' + a.clearedBg);
      if (flag('hist')) console.log('       drawImage 内訳: ' + JSON.stringify(a.hist));
      check('A1-' + vp.name + ' 高さ引数 192 が 0 件',
        a.h192 === 0, 'h192=' + a.h192 + (a.h192 ? ' ex: ' + a.h192Sample.join(' / ') : ''));
      check('A2-' + vp.name + ' y < HORIZON_Y(' + HORIZON_Y + ') を塗る矩形/画像が 0 件 (空スタブ下)',
        a.aboveRect === 0 && a.aboveImg === 0,
        'rect=' + a.aboveRect + ' img=' + a.aboveImg + (a.aboveSample.length ? ' ex: ' + a.aboveSample.join(' / ') : ''));
      check('A3-' + vp.name + ' torch の描画が 0 件',
        a.torches === 0, 'torch=' + a.torches + ' (装飾 torch は ' + geo.nTorchDeco + ' 個存在する)');
      check('A4-' + vp.name + ' 陽性対照: 路肩 (wy=' + HORIZON_Y + ', h=' + VERGE_H + ') の矩形が存在',
        a.verge > 0, 'verge=' + a.verge);
      check('A5-' + vp.name + ' 陽性対照: 帯より南に前景エプロンの矩形が存在',
        a.apron > 0, 'apron=' + a.apron);
      check('A6-' + vp.name + ' 陽性対照: 天井スプライトは路肩行(' + HORIZON_ROW + ')のみ (件数>0 も要求)',
        a.ceilings > 0 && a.ceilRows.every(r => r === HORIZON_ROW),
        'ceil rows=[' + a.ceilRows.join(',') + '] n=' + a.ceilings);
      check('A7-' + vp.name + ' ページエラー 0', pageErrors.length === 0, pageErrors.join(' | '));

      // 空ありの本番フレームでスクショ (見た目の確認用)
      await page.evaluate(() => renderMap());
      const shot = path.join(SHOT_DIR, 'step2_' + vp.name + '.png');
      await page.screenshot({ path: shot, type: 'png', captureBeyondViewport: false });
      console.log('       shot: ' + shot);
      await page.close();
    }

    // ══ B: baseline で A1/A2/A3 が必ず FAIL する (空振り assert でないことの実証) ══
    mark('B: baseline (' + BASELINE_REV + ') で同じ assert が FAIL することを確認');
    for (const vp of SHIP_VIEWPORTS) {
      const { page } = await bootPage(browser, BASE_OLD + '/index.html?intel=0', vp, fieldPre);
      await page.evaluate(() => window.__probe.freeze());
      // HEAD と**同じ寄せ方**でカメラを置く。ここを揃えないと A と B が別カメラの比較になる。
      const torches = await page.evaluate(() => window.__probe.torches());
      if (torches.length) {
        await page.evaluate((tx) => { const c = window.__probe.cam();
          window.__probe.setCam(Math.max(0, tx * 96 + 48 - mapCanvas.width / 2), c.camY); }, torches[0].tx);
      }
      const spy = await page.evaluate(() => window.__probe.spy({ stubSky: true }));
      const a = analyze(spy);
      check('B1-' + vp.name + ' baseline は 192px 壁を描く (A1 が baseline で FAIL する)',
        a.h192 > 0, 'h192=' + a.h192);
      check('B2-' + vp.name + ' baseline は地平線より上を塗る (A2 が baseline で FAIL する)',
        (a.aboveRect + a.aboveImg) > 0, 'rect=' + a.aboveRect + ' img=' + a.aboveImg);
      check('B3-' + vp.name + ' baseline は torch を描く (A3 が baseline で FAIL する)',
        a.torches > 0, 'torch=' + a.torches);
      const shot = path.join(SHOT_DIR, 'baseline_' + vp.name + '.png');
      await page.evaluate(() => renderMap());
      await page.screenshot({ path: shot, type: 'png', captureBeyondViewport: false });
      console.log('       shot: ' + shot);
      await page.close();
    }

    // ══ E: 撤退スイッチ ═══════════════════════════════════════════════════
    // ⚠️ 2つのスイッチは**別の層**を切る。「どちらでも屋外が消える」ではないので、
    //    「192px 壁が戻るか」だけで区別しようとすると取り違えを検出できない (実際 1 回失敗した)。
    //      ?field=0    … 描画のみ従来へ。幾何(帯マスク+カメラ固定)は**残る** → 歩行行は 3 行のまま
    //      ?fieldgeo=0 … 幾何のみ無効。帯マスクが無くなる         → 歩行行は元の 12 行以上へ戻る
    mark('E: 撤退スイッチ ?field=0 / ?fieldgeo=0 が別々の層を切る');
    for (const q of ['field=0', 'fieldgeo=0']) {
      const vp = SHIP_VIEWPORTS[1];
      const { page } = await bootPage(browser, BASE_HEAD + '/index.html?intel=0&' + q, vp, fieldPre);
      await page.evaluate(() => window.__probe.freeze());
      const geo = await page.evaluate(() => window.__probe.geo());
      const rows = await page.evaluate(() => window.__probe.rowsWalkable());
      const spy = await page.evaluate(() => window.__probe.spy({ stubSky: true }));
      const a = analyze(spy);
      if (q === 'field=0') {
        check('E-field=0 描画だけ従来へ戻る (幾何は残る: 歩行3行 + 路肩0 + 192px壁が復活)',
          geo.fieldMode === false && geo.fieldGeoActive === true
          && rows.length === 3 && a.verge === 0 && a.h192 > 0,
          'mode=' + geo.fieldMode + ' geo=' + geo.fieldGeoActive + ' rows=' + rows.length
          + ' verge=' + a.verge + ' h192=' + a.h192);
      } else {
        check('E-fieldgeo=0 幾何だけ無効 (帯マスクが消え歩行行が元へ戻る / 路肩も空も出ない)',
          geo.fieldMode === true && geo.fieldGeoActive === false
          && rows.length > 3 && a.verge === 0,
          'mode=' + geo.fieldMode + ' geo=' + geo.fieldGeoActive + ' rows=' + rows.length
          + ' verge=' + a.verge + ' h192=' + a.h192);
      }
      await page.close();
    }

    // ══ C: CLOUDS 14個 × 3ビューポートで可視帯到達 ════════════════════════
    mark('C: CLOUDS の可視帯到達 (実プレイのカメラ実測ベース)');
    for (const vp of CLOUD_VIEWPORTS) {
      const live = await recordLiveCamera(browser, BASE_HEAD, vp, 6000);
      const { page } = await bootPage(browser, BASE_HEAD + '/index.html?intel=0', vp, fieldPre);
      const clouds = await page.evaluate(() => window.__probe.clouds());
      const geo = await page.evaluate(() => window.__probe.geo());
      await page.close();

      const camYmin = live.trace.n ? live.trace.camYmin : camYOf(geo.usableH);
      const camYmax = live.trace.n ? live.trace.camYmax : camYOf(geo.usableH);
      const canvasH = live.geo.canvasH || geo.canvasH;
      // 影が落ちうる領域 = [可視上端, 可視下端]。屋外の器が有効なら地平線 clip が上端を押し下げる。
      const clipped = live.geo.fieldGeoActive === true;
      const top = clipped ? Math.max(HORIZON_Y, camYmin) : camYmin;
      const bot = camYmax + canvasH;
      check('C0-' + vp.name + ' 実プレイのカメラを採取できた (母集団健全性)',
        live.trace.n > 30, 'n=' + live.trace.n + ' camY=' + camYmin.toFixed(1) + '..' + camYmax.toFixed(1)
        + ' phases=' + JSON.stringify(live.trace.phases) + ' clipped=' + clipped);
      let reach = 0; const miss = [];
      for (let i = 0; i < clouds.list.length; i++) {
        const c = clouds.list[i], r = CLOUD_CORE_R(c.s);
        const ok = (c.y + r) > top && (c.y - r) < bot;
        if (ok) reach++; else miss.push('#' + i + ' y=' + c.y + ' r=' + Math.round(r));
      }
      check('C-' + vp.name + ' CLOUDS 可視帯到達 ' + reach + '/' + clouds.list.length
        + ' (帯 y=' + Math.round(top) + '..' + Math.round(bot) + ')',
        reach === clouds.list.length && clouds.list.length === 14, miss.join(' , '));
    }

    // ══ D: 既存6シナリオの非退行 ══════════════════════════════════════════
    mark('D: 既存6シナリオ — ピクセル SHA + 描画コマンド引数列の完全一致');
    for (const scen of LEGACY_SCENARIOS) {
      const pre = { mode: 'legacy', scen, freeze: true, t0: T_BASE_MS };
      const A = await bootPage(browser, BASE_HEAD + '/index.html?intel=0', HASH_VIEWPORT, pre);
      const B = await bootPage(browser, BASE_OLD + '/index.html?intel=0', HASH_VIEWPORT, pre);
      for (const P of [A, B]) await P.page.evaluate(() => window.__probe.freeze());
      const patA = await A.page.evaluate(() => window.__probe.patternsReady());
      const patB = await B.page.evaluate(() => window.__probe.patternsReady());
      check('D0-' + scen + ' 両側とも wall/floor pattern が非 null',
        patA.wall && patA.floor && patB.wall && patB.floor,
        'head=' + JSON.stringify(patA) + ' base=' + JSON.stringify(patB));
      const spyA = await A.page.evaluate(() => window.__probe.spy({ stubSky: false }));
      const spyB = await B.page.evaluate(() => window.__probe.spy({ stubSky: false }));
      const fA = fingerprint(spyA), fB = fingerprint(spyB);
      check('D1-' + scen + ' 描画コマンドの引数列が順序込みで完全一致',
        fA.hash === fB.hash && fA.nF === fB.nF && fA.nD === fB.nD,
        'head F' + fA.nF + '/D' + fA.nD + ' ' + fA.hash.slice(0, 12)
        + ' vs base F' + fB.nF + '/D' + fB.nD + ' ' + fB.hash.slice(0, 12));
      const shaA = await A.page.evaluate(() => mapCanvas.toDataURL());
      const shaB = await B.page.evaluate(() => mapCanvas.toDataURL());
      check('D2-' + scen + ' mapCanvas SHA-256 一致',
        sha256(shaA) === sha256(shaB), sha256(shaA).slice(0, 16) + ' vs ' + sha256(shaB).slice(0, 16));
      check('D3-' + scen + ' ページエラー 0', A.pageErrors.length === 0 && B.pageErrors.length === 0,
        A.pageErrors.concat(B.pageErrors).join(' | '));
      await A.page.close(); await B.page.close();
    }

  } catch (e) {
    console.error('[drv] 例外: ' + (e && e.stack || e));
    check('DRIVER 例外なし', false, String(e && e.message || e));
  } finally {
    await browser.close();
    srvHead.close(); srvBase.close();
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  RESULT: ' + pass + '/' + results.length + (pass === results.length ? '  ALL PASS' : '  ** FAIL **'));
  for (const r of results) if (!r.ok) console.log('   FAIL  ' + r.name + '  — ' + r.detail);
  console.log('  shots: ' + SHOT_DIR);
  console.log('════════════════════════════════════════════════════════');
  process.exit(pass === results.length ? 0 : 1);
})();
