#!/usr/bin/env node
/*
 * driver_wall_props.js — 壁リングの樹木プロップ (Pass 2.4) の検証ドライバ (2026-08-13)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 塞ぐ穴
 *   「沼地なのに規則正しい石積みが延々続く」への解として、壁リングへ上から見た樹冠を
 *   散らした。既存ドライバはどれもこれを測れない:
 *     ・golden 系は「前回と同じ絵か」しか見ない = **最初から間違った絵**は永久に緑
 *     ・driver_wall_face は廃坑の立面/天面素材しか見ない
 *   さらに Pass 2.4 は全屋内テーマの描画ループへ入るので、**wallProps を持たない
 *   5 テーマへ漏れていない**ことを測らないと、廃坑の絵に樹が生える退化を取りこぼす。
 *
 * ■ 測り方の方針
 *   ・**同一ページロード内の A/B 差分**で測る (window.__setWallProps)。2 回ロードして
 *     比べるとカメラ位置・敵の湧き・フォグが別物になり、「樹のせいで変わった画素」と
 *     「そもそも別の絵」を切り分けられない。
 *   ・どのセルに生えるかの抽選式は**ドライバへ写経しない**。写経すると実装と同じ
 *     間違いを共有して両方緑になる。幾何は mapData と __graphRun.cam() から借りる。
 *   ・領域は「リング / 北壁の帯 / 床」の 3 つに分け、**変化した画素の割合**で見る。
 *     リングだけが変わり、北壁と床は 1 画素も変わらない、が満たすべき不変条件。
 *   ・§5 は**負のコントロール**: wallProps を持たない廃坑では A/B が完全一致するはず。
 *     ここが差分ゼロでなければ Pass 2.4 が全テーマへ漏れている。
 *
 * 使い方: node tools/driver_wall_props.js [--headful] [--browser <path>] [--port N] [--shots DIR]
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
const PORT = parseInt(arg('port', '8871'), 10);
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'claude', 'df_wall_props_shots'));

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; fails.push(name + (detail ? '  — ' + detail : '')); }
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
const mark = (m) => console.log('[drv] ' + (++step) + ' ' + m);

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

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const f = path.join(ROOT, u.replace(/^\/+/, ''));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); res.end('nf'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

/* ページ内で走る A/B 差分測定。
 * 樹あり / 樹なし で mapCanvas を 2 回描き、領域ごとに「変化した画素の割合」を返す。
 * ⚠ 幾何は mapData と cam() から借りる。96 や 192 をここへ書くと二重定義になる。
 * ⚠ 領域の定義は実装の述語 (isNorthWall 等) を**呼ばず**、mapData から素朴に導く。
 *   実装の述語をそのまま使うと述語自体のバグを検出できない。 */
const DIFF = function () {
  const mc = document.getElementById('mapCanvas');
  const mctx = mc.getContext('2d');
  const g = window.__graphRun;
  const cam = g.cam();
  const T = cam.tile;
  const md = g.board().mapDataText.split('\n').map(r => r.split('').map(Number));
  const H = md.length, W = md[0].length;

  const isWall = (tx, ty) => (tx >= 0 && ty >= 0 && tx < W && ty < H && md[ty][tx] === 2);
  const isNorth = (tx, ty) => isWall(tx, ty) && ty + 1 < H && md[ty + 1][tx] !== 2;

  /* 画面内を 3 領域に分ける。矩形は [x, y, w, h]。
   * ⚠⚠ 北壁は**セル丸ごとでは 1 枚も画面に入らない**。カメラは MAP_USED の内側しか映さない
   *   ので立面は床線の上 27〜85px しか見えず、96px の矩形は必ず `sy < 0` で捨てられる。
   *   セル単位で数えると対象 0 個 = assert が空回りして永久に緑になる (実際に一度そうなった)。
   *   → 北壁だけは「床線の上に実際に映っている帯」を測る。 */
  const ring = [], north = [], floor = [];
  const tx0 = Math.max(0, Math.floor(cam.camX / T)), tx1 = Math.min(W - 1, Math.ceil((cam.camX + mc.width) / T));
  const ty0 = Math.max(0, Math.floor(cam.camY / T)), ty1 = Math.min(H - 1, Math.ceil((cam.camY + mc.height) / T));
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const sx = Math.round(tx * T - cam.camX), sy = Math.round(ty * T - cam.camY);
      if (sx < 0 || sx + T > mc.width) continue;
      if (isWall(tx, ty) && isNorth(tx, ty)) {
        // 立面の見えている帯 = 床線 (この壁の 1 つ下の行の上端) より上の部分
        const fy = Math.round((ty + 1) * T - cam.camY);
        const bandH = Math.min(T, Math.max(0, fy));
        if (bandH >= 8 && fy - bandH >= 0 && fy <= mc.height) north.push([sx, fy - bandH, T, bandH]);
        continue;
      }
      if (sy < 0 || sy + T > mc.height) continue;
      if (!isWall(tx, ty)) { floor.push([sx, sy, T, T]); continue; }
      if (isNorth(tx, ty + 1)) { north.push([sx, sy, T, T]); continue; }   // 立面が覆うリング外周
      ring.push([sx, sy, T, T]);
    }
  }

  const src = { ring: ring, north: north, floor: floor };
  const grab = () => {
    const out = {};
    for (const k of ['ring', 'north', 'floor']) {
      out[k] = [];
      for (const r of src[k]) out[k].push(mctx.getImageData(r[0], r[1], r[2], r[3]).data);
    }
    return out;
  };

  /* 3 状態を 1 ページロード内で採る。C を足したのは [樹の色調 2026-08-14] のため:
   * 色調整は**変化画素の枚数を増やさない** (同じ場所の色が変わるだけ) ので、A/B の枚数だけ
   * 見ていると「効いていない」と「効いている」が同じ数字になる。C との差で、焼いた源が
   * 実際に描画へ使われていることを見る。 */
  window.__setWallProps(true);
  window.__setPropTone(true);
  const A = grab();              // 樹あり・色調整あり (= 出荷状態)
  window.__setPropTone(false);
  const C = grab();              // 樹あり・素材のまま
  window.__setWallProps(false);
  const B = grab();              // 樹なし
  window.__setWallProps(true);
  window.__setPropTone(true);    // 後片付け: 本来の状態へ戻す

  const ratio = (X, Y, k) => {
    let changed = 0, total = 0;
    for (let i = 0; i < X[k].length; i++) {
      const a = X[k][i], b = Y[k][i];
      for (let o = 0; o < a.length; o += 4) {
        total++;
        if (Math.abs(a[o] - b[o]) > 4 || Math.abs(a[o + 1] - b[o + 1]) > 4 || Math.abs(a[o + 2] - b[o + 2]) > 4) changed++;
      }
    }
    return { changed: changed, total: total, pct: total ? (100 * changed / total) : 0 };
  };
  /* 「壁からどれだけ浮いたか」= 樹なしの絵との色距離。
   * ・all     … リング全画素の平均。密度と色差の両方が混ざる量。
   * ・covered … **樹が乗った画素だけ**の平均 = 「その石の上で樹がどれだけ違う色か」。
   *   密度が変わっても動かないので、識別できるかを絶対値で言える (下の (8f) が使う)。 */
  const mag = (X, Y, k) => {
    let sum = 0, total = 0, csum = 0, cn = 0;
    for (let i = 0; i < X[k].length; i++) {
      const a = X[k][i], b = Y[k][i];
      for (let o = 0; o < a.length; o += 4) {
        const dr = a[o] - b[o], dg = a[o + 1] - b[o + 1], db = a[o + 2] - b[o + 2];
        const d = Math.sqrt(dr * dr + dg * dg + db * db);
        sum += d; total++;
        if (d > 8) { csum += d; cn++; }
      }
    }
    return { all: total ? sum / total : 0, covered: cn ? csum / cn : 0, n: cn };
  };

  return {
    tile: T,
    cells: { ring: ring.length, north: north.length, floor: floor.length },
    ring: ratio(A, B, 'ring'), north: ratio(A, B, 'north'), floor: ratio(A, B, 'floor'),
    toneRing: ratio(A, C, 'ring'),          // 色調整あり vs 素材のまま
    magTone: mag(A, B, 'ring'), magRaw: mag(C, B, 'ring'),
    propW: window.__wallPropImg ? window.__wallPropImg.naturalWidth : null,
    propH: window.__wallPropImg ? window.__wallPropImg.naturalHeight : null,
  };
};

/* ★[樹の色調 2026-08-14] 焼いた素材そのものの統計。画面ではなく**素材**を測るのは、
 * 画面には壁の色・陰影・松明が混ざり「葉がどれだけ黄緑へ寄ったか」を分離できないため。
 * ⚠ 葉/気根の分類は **raw 側の画素**で行い、同じ画素集合で raw と baked を比べる。
 *   baked 側で分類すると、彩度を上げた結果として気根が葉に化けて自己言及になる。 */
const TONE_SHEET = function () {
  const raw = window.__wallPropRaw, src = window.__wallPropSrc;
  if (!raw) return null;
  const W = raw.naturalWidth, H = raw.naturalHeight;
  const read = (img) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, W, H).data;
  };
  const A = read(raw), B = read(src || raw);
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  const acc = () => ({ n: 0, r: 0, g: 0, b: 0, s: 0, l: 0, lmax: 0 });
  const add = (o, r, g, b) => {
    o.n++; o.r += r; o.g += g; o.b += b; o.s += sat(r, g, b);
    const L = lum(r, g, b); o.l += L; if (L > o.lmax) o.lmax = L;
  };
  const fin = (o) => o.n ? { n: o.n, r: o.r / o.n, g: o.g / o.n, b: o.b / o.n,
                             sat: o.s / o.n, lum: o.l / o.n, lmax: o.lmax } : null;
  const leafA = acc(), leafB = acc(), rootA = acc(), rootB = acc();
  let alphaDiff = 0;
  for (let i = 0; i < A.length; i += 4) {
    if (A[i + 3] !== B[i + 3]) alphaDiff++;
    if (A[i + 3] <= 32) continue;
    const s = sat(A[i], A[i + 1], A[i + 2]), L = lum(A[i], A[i + 1], A[i + 2]);
    if (s >= 0.25) { add(leafA, A[i], A[i + 1], A[i + 2]); add(leafB, B[i], B[i + 1], B[i + 2]); }
    else if (L > 110) { add(rootA, A[i], A[i + 1], A[i + 2]); add(rootB, B[i], B[i + 1], B[i + 2]); }
  }
  return { leafRaw: fin(leafA), leafOut: fin(leafB), rootRaw: fin(rootA), rootOut: fin(rootB),
           alphaDiff: alphaDiff, toneOk: window.__wallPropToneOk, srcIsRaw: (src || raw) === raw };
};

/* ?proptone=0 の初期状態が「素材のまま」であることの確認 (撤退経路)。
 * ⚠ 全画面で比べない。北壁の松明は Date.now() で揺れるので、リングのセルだけを見る。 */
const TONE_INIT = function () {
  const mc = document.getElementById('mapCanvas');
  const mctx = mc.getContext('2d');
  const g = window.__graphRun;
  const cam = g.cam();
  const T = cam.tile;
  const md = g.board().mapDataText.split('\n').map(r => r.split('').map(Number));
  const H = md.length, W = md[0].length;
  const isWall = (tx, ty) => (tx >= 0 && ty >= 0 && tx < W && ty < H && md[ty][tx] === 2);
  const isNorth = (tx, ty) => isWall(tx, ty) && ty + 1 < H && md[ty + 1][tx] !== 2;
  const rects = [];
  const tx0 = Math.max(0, Math.floor(cam.camX / T)), tx1 = Math.min(W - 1, Math.ceil((cam.camX + mc.width) / T));
  const ty0 = Math.max(0, Math.floor(cam.camY / T)), ty1 = Math.min(H - 1, Math.ceil((cam.camY + mc.height) / T));
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!isWall(tx, ty) || isNorth(tx, ty) || isNorth(tx, ty + 1)) continue;
      const sx = Math.round(tx * T - cam.camX), sy = Math.round(ty * T - cam.camY);
      if (sx < 0 || sy < 0 || sx + T > mc.width || sy + T > mc.height) continue;
      rects.push([sx, sy]);
    }
  }
  const snap = () => rects.map(r => mctx.getImageData(r[0], r[1], T, T).data);
  const a = snap();
  window.__setPropTone(false); const b = snap();
  window.__setPropTone(true);  const c = snap();
  window.__setPropTone(false);   // 後片付け: ?proptone=0 の本来の状態へ戻す
  const diff = (x, y) => {
    let n = 0;
    for (let i = 0; i < x.length; i++)
      for (let o = 0; o < x[i].length; o += 4)
        if (Math.abs(x[i][o] - y[i][o]) > 4 || Math.abs(x[i][o + 1] - y[i][o + 1]) > 4
            || Math.abs(x[i][o + 2] - y[i][o + 2]) > 4) n++;
    return n;
  };
  return { rects: rects.length, vsRaw: diff(a, b), vsTone: diff(a, c) };
};

/* 決定論の確認: renderMap を 2 回走らせて mapCanvas が 1 画素も動かないこと。
 * Math.random で抽選すると毎フレーム生え変わるので、ここが落ちる。
 * ⚠ 松明の炎ブルームは Date.now() で揺れるため、**北壁を含まない矩形**で比べる。 */
const DETERMINISM = function () {
  const mc = document.getElementById('mapCanvas');
  const mctx = mc.getContext('2d');
  const g = window.__graphRun;
  const cam = g.cam();
  const T = cam.tile;
  const md = g.board().mapDataText.split('\n').map(r => r.split('').map(Number));
  const H = md.length, W = md[0].length;
  const isWall = (tx, ty) => (tx >= 0 && ty >= 0 && tx < W && ty < H && md[ty][tx] === 2);
  const isNorth = (tx, ty) => isWall(tx, ty) && ty + 1 < H && md[ty + 1][tx] !== 2;

  const rects = [];
  const tx0 = Math.max(0, Math.floor(cam.camX / T)), tx1 = Math.min(W - 1, Math.ceil((cam.camX + mc.width) / T));
  const ty0 = Math.max(0, Math.floor(cam.camY / T)), ty1 = Math.min(H - 1, Math.ceil((cam.camY + mc.height) / T));
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!isWall(tx, ty) || isNorth(tx, ty) || isNorth(tx, ty + 1)) continue;
      const sx = Math.round(tx * T - cam.camX), sy = Math.round(ty * T - cam.camY);
      if (sx < 0 || sy < 0 || sx + T > mc.width || sy + T > mc.height) continue;
      rects.push([sx, sy]);
    }
  }
  const snap = () => { renderMap(); return rects.map(r => mctx.getImageData(r[0], r[1], T, T).data); };
  const a = snap(), b = snap();
  let diff = 0, total = 0;
  for (let i = 0; i < a.length; i++) {
    for (let o = 0; o < a[i].length; o += 4) {
      total++;
      if (a[i][o] !== b[i][o] || a[i][o + 1] !== b[i][o + 1] || a[i][o + 2] !== b[i][o + 2]) diff++;
    }
  }
  return { rects: rects.length, diff: diff, total: total };
};

const PERF = function (n) {
  const t = [];
  for (let i = 0; i < n; i++) { const a = performance.now(); renderMap(); t.push(performance.now() - a); }
  t.sort((x, y) => x - y);
  return { p50: t[Math.floor(n * 0.5)], p90: t[Math.floor(n * 0.9)], max: t[n - 1] };
};

async function boot(browser, url, scen, vw, vh, net) {
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh });
  page.on('pageerror', e => net.errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) net.errs.push('CONSOLE ' + m.text());
  });
  page.on('response', r => { if (r.status() >= 400) net.bad.push(r.status() + ' ' + new URL(r.url()).pathname); });
  await page.evaluateOnNewDocument((s) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', s); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof renderMap === 'function' && !!window.__graphRun",
    { timeout: 25000 });
  // プロップ素材のロードと最初の描画を待つ (onload で renderMap を呼ぶ)
  await new Promise(r => setTimeout(r, 2200));
  await page.evaluate(() => { computeCameraTarget(); camX = camTargetX; camY = camTargetY; });
  await page.evaluate(() => { computeVisibleTiles(); renderMap(); renderLighting(); });
  await new Promise(r => setTimeout(r, 300));
  return page;
}

async function dumpCanvas(page, file) {
  const uri = await page.evaluate(() => {
    const c = document.getElementById('mapCanvas');
    return c ? c.toDataURL('image/png') : null;
  });
  if (!uri) return false;
  fs.writeFileSync(file, Buffer.from(uri.split(',')[1], 'base64'));
  return true;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_wallprops_');
  const srv = await startServer(PORT);
  console.log('[drv] serving ' + ROOT + ' :' + PORT);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });
  const URL_Q = 'http://localhost:' + PORT + '/index.html?diag=1&graphtest=1';

  try {
    // ══ §1 素材の配線 (沼地) ════════════════════════════════════════════════════
    mark('沼地 (デスクトップ 1280x800) を起動');
    const net = { errs: [], bad: [] };
    const page = await boot(browser, URL_Q, 'lizard-swamp', 1280, 800, net);
    const D = await page.evaluate(DIFF);
    await dumpCanvas(page, path.join(SHOT_DIR, 'swamp_map.png'));
    console.log('[drv] cells ' + JSON.stringify(D.cells));
    console.log('[drv] ring ' + JSON.stringify(D.ring) + '\n[drv] north ' + JSON.stringify(D.north)
      + '\n[drv] floor ' + JSON.stringify(D.floor));

    check('(1a) プロップ素材が読めている', D.propW > 0 && D.propH > 0, 'sheet=' + D.propW + 'x' + D.propH);
    /* ★ シートは「正方セルの横並び」でなければならない。幅が高さの整数倍でないと
     *   実装の Math.floor(naturalWidth / cols) が端数を捨て、切り出しが右へずれて
     *   隣のコマの葉が混ざる。ここは**指定したその形**と比べる (在庫のどれかに当たるか、ではない)。 */
    check('(1b) ★シートが正方セルの横並び (幅 === 高さ × 整数)',
      D.propW % D.propH === 0 && D.propW / D.propH >= 2,
      'w/h=' + (D.propW / D.propH));
    const badAsset = net.bad.filter(b => /^\/assets\/wall_prop_/.test(b.split(' ')[1] || ''));
    check('(1c) プロップ素材の 404 が 0 件', badAsset.length === 0, badAsset.join(','));
    check('(1d) ページエラー 0 件', net.errs.length === 0, net.errs.slice(0, 3).join(' | '));

    // ══ §2 樹が実際にリングへ描かれているか (A/B 差分) ══════════════════════════
    mark('沼地: 樹あり / 樹なし の画素差分');
    check('(2a) 測定対象のリングセルが画面に十分ある', D.cells.ring >= 8, 'ring cells=' + D.cells.ring);
    /* 生やす割合 rate=46% / scale=1.5 なので、リングの画素のうち樹に覆われるのは
     * ざっくり 46% * (1.5^2 の円相当) 程度。閾値は下限ガードとして 12% に置く。 */
    check('(2b) ★リングの画素が有意に変化した (樹が描かれている)', D.ring.pct >= 12,
      'ring 変化 ' + D.ring.pct.toFixed(1) + '% (' + D.ring.changed + '/' + D.ring.total + ')');

    // ══ §3 置いてはいけない領域を汚していないか ════════════════════════════════
    mark('沼地: 北壁と床が 1 画素も変わらないこと');
    /* ⚠ 対象が 0 画素だと「変化 0」は自明に真になり assert が空回りする。北壁は
     *   セル丸ごとでは画面に入らないので、**測れる画素があること**を条件に含める。 */
    check('(3a) ★北壁の帯は 1 画素も変化しない (立面へ樹が貼り付いていない)',
      D.north.changed === 0 && D.north.total > 0,
      'north 変化 ' + D.north.changed + '/' + D.north.total + ' px (' + D.north.pct.toFixed(3) + '%)');
    check('(3b) ★床は 1 画素も変化しない (歩ける床へ樹がはみ出していない)', D.floor.changed === 0,
      'floor 変化 ' + D.floor.changed + '/' + D.floor.total + ' px (' + D.floor.pct.toFixed(3) + '%)');

    // ══ §4 決定論 ══════════════════════════════════════════════════════════════
    mark('沼地: renderMap 2 回で絵が変わらないこと');
    const DT = await page.evaluate(DETERMINISM);
    check('(4a) ★リングが毎フレーム生え変わらない (抽選が決定論)', DT.diff === 0,
      '差分 ' + DT.diff + '/' + DT.total + ' px / 対象 ' + DT.rects + ' セル');
    const P = await page.evaluate(PERF, 40);
    console.log('[drv] renderMap ' + JSON.stringify(P));
    check('(4b) renderMap にスパイクが出ていない', P.max < 400, 'max=' + P.max.toFixed(1) + 'ms');

    // ══ §8 樹の色調 (tone) — 壁から浮いたか / 気根が発光していないか ══════════════
    mark('沼地: 色調整 (tone) が素材と画面へ効いていること');
    const TS = await page.evaluate(TONE_SHEET);
    const f1 = (x) => x.toFixed(1);
    console.log('[drv] 葉  raw=(' + [TS.leafRaw.r, TS.leafRaw.g, TS.leafRaw.b].map(f1).join(',') + ') sat='
      + TS.leafRaw.sat.toFixed(2) + '  →  out=(' + [TS.leafOut.r, TS.leafOut.g, TS.leafOut.b].map(f1).join(',')
      + ') sat=' + TS.leafOut.sat.toFixed(2));
    console.log('[drv] 気根 raw L=' + f1(TS.rootRaw.lum) + ' Lmax=' + f1(TS.rootRaw.lmax)
      + '  →  out L=' + f1(TS.rootOut.lum) + ' Lmax=' + f1(TS.rootOut.lmax));
    console.log('[drv] mag 色調整あり ' + JSON.stringify(D.magTone)
      + '\n[drv] mag 素材のまま   ' + JSON.stringify(D.magRaw));

    check('(8a) tone が黙って素通しになっていない', TS.toneOk === true && TS.srcIsRaw === false,
      'toneOk=' + TS.toneOk + ' srcIsRaw=' + TS.srcIsRaw);
    /* ★ 森が壁から浮いている理由は明るさではなく**青の量**だった (森の樹 b=31 / 壁 b=97)。
     *   沼も同じ方向 = 彩度を上げて青を削る、で効いているかを見る。数値を「上がった」ではなく
     *   **どちらの向きへどれだけ**で縛らないと、明るくしただけでも緑になる。 */
    check('(8b) ★葉の彩度が上がり青が削れた (壁と同系色から抜けた)',
      TS.leafOut.sat - TS.leafRaw.sat >= 0.15 && TS.leafRaw.b - TS.leafOut.b >= 15,
      'sat ' + TS.leafRaw.sat.toFixed(2) + '→' + TS.leafOut.sat.toFixed(2)
      + ' / b ' + f1(TS.leafRaw.b) + '→' + f1(TS.leafOut.b));
    /* ★ 気根は葉と**逆向き**へ動かす。一律に鮮やかにすると低彩度・高輝度のここだけが白く光る
     *   (「気根が白っぽい」という既知の指摘そのもの)。平均輝度が下がり、最大輝度が上がらないこと。 */
    check('(8c) ★気根が発光していない (平均輝度が下がり、最大輝度が上がっていない)',
      TS.rootRaw.lum - TS.rootOut.lum >= 15 && TS.rootOut.lmax <= TS.rootRaw.lmax + 1,
      'L ' + f1(TS.rootRaw.lum) + '→' + f1(TS.rootOut.lum)
      + ' / Lmax ' + f1(TS.rootRaw.lmax) + '→' + f1(TS.rootOut.lmax));
    check('(8d) ★アルファが 1 画素も変わっていない (輪郭が太っていない)', TS.alphaDiff === 0,
      'alpha 差 ' + TS.alphaDiff + ' px');
    /* ★ 焼いた canvas が**実際に描画へ使われている**こと。素材だけ焼けて描画は raw のまま、
     *   という配線ミスは (8a)〜(8d) を全部緑にしたまま通る。 */
    check('(8e) ★焼いた源が画面に出ている (色調整あり/なしでリングが変わる)',
      D.toneRing.pct >= 5, 'ring 変化 ' + D.toneRing.pct.toFixed(1) + '%');
    /* ★ 樹が石から識別できること。
     * ⚠⚠ ここは元々「色調整が壁との距離を**増やす**」という**相対**条件だった (2026-08-14 朝)。
     *   その日のうちに壁本体を白い幕付きの平面から苔むした石へ差し替えたので、比較対象の壁が
     *   消えて条件が空回りした (実測 ×1.14 → ×1.01)。**閾値を 1.05 → 1.00 へ下げるのは
     *   期待値の書き換え**なので採らず、不変条件そのものを言い直す:
     *     「色調整で改善したか」ではなく「**樹に覆われた画素が石とどれだけ違うか**」。
     * ⚠⚠ **これは「見やすさ」の測定ではない**。実測は色調整あり 76.0 / なし 75.9 でほぼ同じだが、
     *   目視では色調整ありの方が明確に樹として読める (2026-08-14 に苔石の壁で A/B を撮って確認)。
     *   石の上に不透明な樹を乗せる以上、色が近くても画素の距離は大きく出るため、この量では
     *   両者を区別できない。**下限 40 は「樹が石へ溶けて消えたら落ちる」ガード**として置く。
     *   色調整が効いているかは素材側の (8b)/(8c) と、実際に描画へ乗っているかの (8e) が受け持つ。
     * ⚠ 密度 (何%のセルに生えるか) は (2b) が別に測る。ここは 1 本あたりの見え方だけを見る。 */
    check('(8f) ★樹が石から識別できる (樹が乗った画素の色距離)', D.magTone.covered >= 40,
      '覆われた画素での色距離 ' + D.magTone.covered.toFixed(1)
      + ' (色調整なしなら ' + D.magRaw.covered.toFixed(1) + ')');
    check('(8g) ★色調整が識別性を下げていない', D.magTone.covered >= D.magRaw.covered * 0.95,
      '色調整あり ' + D.magTone.covered.toFixed(1) + ' / なし ' + D.magRaw.covered.toFixed(1));
    await page.close();

    // ══ §5 負のコントロール: wallProps を持たない廃坑へ漏れていないか ══════════
    mark('廃坑 (wallProps なし) で A/B が完全一致すること');
    const net2 = { errs: [], bad: [] };
    const page2 = await boot(browser, URL_Q, 'goblin-mine', 1280, 800, net2);
    const D2 = await page2.evaluate(DIFF);
    await dumpCanvas(page2, path.join(SHOT_DIR, 'mine_map.png'));
    console.log('[drv] mine ring ' + JSON.stringify(D2.ring));
    check('(5a) 廃坑には素材が読み込まれていない', D2.propW === null || D2.propW === undefined,
      'propW=' + D2.propW);
    check('(5b) ★廃坑のリングは A/B で 1 画素も変わらない (全テーマへ漏れていない)',
      D2.ring.changed === 0 && D2.cells.ring >= 8,
      'ring 変化 ' + D2.ring.changed + '/' + D2.ring.total + ' px / セル ' + D2.cells.ring);
    check('(5c) 廃坑でページエラー 0 件', net2.errs.length === 0, net2.errs.slice(0, 3).join(' | '));
    await page2.close();

    // ══ §6 森でも樹が出るか (適用範囲が 2 テーマであること) ═════════════════════
    mark('森 (bandits-forest) で樹が描かれること');
    const net3 = { errs: [], bad: [] };
    const page3 = await boot(browser, URL_Q, 'bandits-forest', 1280, 800, net3);
    const D3 = await page3.evaluate(DIFF);
    await dumpCanvas(page3, path.join(SHOT_DIR, 'forest_map.png'));
    console.log('[drv] forest ring ' + JSON.stringify(D3.ring));
    check('(6a) 森の素材が読めている', D3.propW > 0, 'sheet=' + D3.propW + 'x' + D3.propH);
    check('(6b) ★森のリングも有意に変化した', D3.ring.pct >= 12,
      'ring 変化 ' + D3.ring.pct.toFixed(1) + '%');
    check('(6c) 森でも北壁と床は無傷',
      D3.north.changed === 0 && D3.floor.changed === 0 && D3.north.total > 0 && D3.floor.total > 0,
      'north=' + D3.north.changed + '/' + D3.north.total + ' floor=' + D3.floor.changed + '/' + D3.floor.total);
    check('(6d) 森でページエラー 0 件', net3.errs.length === 0, net3.errs.slice(0, 3).join(' | '));
    /* ★ 負のコントロール: tone を設定していない森は 1 画素も焼かれないこと。焼き込みが
     *   テーマ設定を無視して全 wallProps へ掛かると、森の樹まで勝手に色が変わる。 */
    const TS3 = await page3.evaluate(TONE_SHEET);
    check('(6e) ★森は色調整の対象外 (tone 未設定のテーマへ漏れていない)',
      TS3.toneOk === null && TS3.srcIsRaw === true && D3.toneRing.changed === 0,
      'toneOk=' + TS3.toneOk + ' srcIsRaw=' + TS3.srcIsRaw + ' ring 変化=' + D3.toneRing.changed);
    await page3.close();

    // ══ §7 撤退スイッチ (?wallprops=0) が効くこと ══════════════════════════════
    mark('?wallprops=0 で素材ごと読まれないこと');
    const net4 = { errs: [], bad: [] };
    const page4 = await boot(browser, URL_Q + '&wallprops=0', 'lizard-swamp', 1280, 800, net4);
    const D4 = await page4.evaluate(() => ({
      propW: window.__wallPropImg ? window.__wallPropImg.naturalWidth : null,
    }));
    check('(7a) ★?wallprops=0 では素材を 1 枚も読まない (撤退経路)',
      D4.propW === null || D4.propW === undefined, 'propW=' + D4.propW);
    await page4.close();

    // ══ §9 色調整だけの撤退スイッチ (?proptone=0) ══════════════════════════════
    /* 樹は残したいが色が派手、というときの戻り先。?wallprops=0 しかないと判断が全か無かになる。 */
    mark('?proptone=0 で樹は出るが色は素材のままになること');
    const net5 = { errs: [], bad: [] };
    const page5 = await boot(browser, URL_Q + '&proptone=0', 'lizard-swamp', 1280, 800, net5);
    const TI = await page5.evaluate(TONE_INIT);
    console.log('[drv] proptone=0 ' + JSON.stringify(TI));
    check('(9a) ★?proptone=0 の初期状態が素材のまま (色調整が掛かっていない)',
      TI.vsRaw === 0 && TI.rects >= 8, '素材との差 ' + TI.vsRaw + ' px / セル ' + TI.rects);
    /* ⚠ 上だけだと「樹が 1 本も出ていない」でも緑になる (どちらの源でも真っ黒なら差 0)。
     *   色調整を入れれば変わる = 樹が実在することを同時に測る。 */
    check('(9b) ★樹自体は出ている (色調整を入れると絵が変わる)', TI.vsTone > 0,
      '色調整との差 ' + TI.vsTone + ' px');
    check('(9c) ?proptone=0 でページエラー 0 件', net5.errs.length === 0, net5.errs.slice(0, 3).join(' | '));
    await page5.close();

  } catch (e) {
    check('(fatal) 例外なく完走', false, String(e && e.message));
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }

  console.log('\n[drv] shots: ' + SHOT_DIR);
  console.log('[drv] ' + pass + '/' + (pass + fail) + ' PASS');
  if (fails.length) { console.log('[drv] FAILED:'); for (const f of fails) console.log('  - ' + f); }
  process.exit(fail ? 1 : 0);
})();
