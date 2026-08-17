#!/usr/bin/env node
/*
 * driver_paint_grid.js — 卓上グリッド P1 の検証ドライバ (2026-08-17)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 塞ぐ穴
 *   Pass 1.2 の床グリッドは v7.7 以降 isPaintedAndLoaded のセルを無条件に飛ばしており、
 *   山場・ボス・ノードの 1 枚絵だけ「マス目の無い部屋」になっていた。P1 でこの抑制を
 *   外したが、既存ドライバはどれもこれを測れない:
 *     ・golden 系は「前回と同じ絵か」しか見ない = **最初から間違った絵**は永久に緑
 *     ・driver_wall_props / driver_wall_face は壁の素材しか見ない
 *     ・driver_mapeditor_painting は「1 枚絵が乗るか」だけで線を 1 つも測らない
 *   さらに Pass 1.2 は全屋内テーマの描画ループなので、**屋外へ漏れていない**ことを
 *   測らないと地平線ビューに 96px 格子が乗る退化を取りこぼす。
 *
 * ■ 測り方の方針
 *   ・**同一ページロード内の A/B 差分**で測る (window.__setPaintGrid)。2 回ロードして
 *     比べるとカメラ位置・敵の湧き・フォグが別物になり、「グリッドで変わった画素」と
 *     「そもそも別の絵」を切り分けられない (driver_wall_props と同じ理由)。
 *   ・1 枚絵の矩形は **window.__paintRects() から借りる**。tileBounds をここへ写経すると
 *     実装と同じ間違いを共有して両方緑になる。
 *   ・⭐ 「フラグが流れたか」ではなく **「線が見えるか」** を別 assert で持つ (§2)。
 *     実装とドライバの規則が一致するかだけの assert は、両方が同じ誤りだと永久に緑。
 *   ・セルごとに T×T で切り出すので、グリッド線はセル内ローカル座標の x=0 / y=0 /
 *     x=T-1 / y=T-1 に落ちる。「変化画素がセル境界上か」がそのまま測れる (§3b)。
 *   ・§4 は**負のコントロール**: 素の床セル (1 枚絵でない) は元からグリッドが出ているので
 *     A/B で 1 画素も動かないはず。壁 (mapData===2) も同じ。
 *   ・§7 も**負のコントロール**: 屋外は !FIELD_MODE ゲートで原理的に不変のはず。
 *
 * 使い方: node tools/driver_paint_grid.js [--headful] [--browser <path>] [--port N] [--shots DIR]
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
const PORT = parseInt(arg('port', '8879'), 10);
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'claude', 'df_paint_grid_shots'));

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; fails.push(name + (detail ? '  — ' + detail : '')); }
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
const mark = (m) => console.log('\n[drv] ' + (++step) + ' ' + m);

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

/* ── 隊商護衛ペイロード (屋外 = FIELD_MODE の負のコントロール用) ─────────────
 * driver_field_step6.js と同一。⚠ 敵キーは ENEMY_TYPES 実在のもののみ。 */
const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
  waves: [{ count: 3, pool: ['goblin', 'goblinArcher'] }],
  wagonSpawns: [{ tx: 9, ty: 14 }],
};

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ内測定: グリッド ON / OFF を同一ロード内で切り替え、セルを 3 群に分けて比べる。
 * ⚠ 群の定義に実装の述語 (isPaintedAndLoaded) を**呼ばない**。呼ぶと述語自体の
 *   バグを検出できない。1 枚絵の矩形だけ __paintRects() から借り、床/壁は mapData から導く。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MEASURE = function () {
  const mc = document.getElementById('mapCanvas');
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  const cam = window.__graphRun.cam();
  const T = cam.tile;
  const md = window.__graphRun.board().mapDataText.split('\n').map(r => r.split('').map(Number));
  const H = md.length, W = md[0].length;
  const rects = window.__paintRects().filter(r => r.loaded);

  /* ⚠⚠ 矩形の**外周 1 タイルは母集団から外す**。1 枚絵は外周が alpha フェザーで下の床と
   *   混ざる帯になっており、そこは塗りマスクに入らないので**元からグリッドが引かれている**。
   *   外さないと OFF 側にも線が残り、残差が alpha と同じ比で動く (0.22→1.92 / 0.34→2.98 を実測)。
   *   これは期待値ではなく**測定点**の修正 — 縁は「絵の内側」でも「素の床」でもない第 3 の状態。 */
  const M = 1;
  const inPaint = (tx, ty) => rects.some(r =>
    tx >= r.tx + M && tx < r.tx + r.tw - M && ty >= r.ty + M && ty < r.ty + r.th - M);
  const onFeather = (tx, ty) => !inPaint(tx, ty) && rects.some(r =>
    tx >= r.tx && tx < r.tx + r.tw && ty >= r.ty && ty < r.ty + r.th);
  const isFloor = (tx, ty) => (tx >= 0 && ty >= 0 && tx < W && ty < H && md[ty][tx] !== 2);

  const groups = { paint: [], plain: [], wall: [] };
  const tx0 = Math.max(0, Math.floor(cam.camX / T)), tx1 = Math.min(W - 1, Math.ceil((cam.camX + mc.width) / T));
  const ty0 = Math.max(0, Math.floor(cam.camY / T)), ty1 = Math.min(H - 1, Math.ceil((cam.camY + mc.height) / T));
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const sx = Math.round(tx * T - cam.camX), sy = Math.round(ty * T - cam.camY);
      if (sx < 0 || sy < 0 || sx + T > mc.width || sy + T > mc.height) continue;
      if (onFeather(tx, ty)) continue;                // 縁の帯はどの群にも入れない
      const key = !isFloor(tx, ty) ? 'wall' : (inPaint(tx, ty) ? 'paint' : 'plain');
      groups[key].push([sx, sy]);
    }
  }

  const snap = (g) => g.map(r => mctx.getImageData(r[0], r[1], T, T).data);
  const shot = () => ({ paint: snap(groups.paint), plain: snap(groups.plain), wall: snap(groups.wall) });

  /* ⚠⚠ 時間を止めてから A/B を採る。壁掛け松明も雲の影も Date.now() で揺れるので、
   *   止めないと「グリッドで変わった画素」と「1 フレーム分アニメが進んだ画素」を
   *   切り分けられない (屋外の §7 で実際にフレークとして出た)。 */
  const _now = Date.now, _perf = performance.now.bind(performance);
  const _t0 = _now.call(Date), _p0 = _perf();
  Date.now = function () { return _t0; };
  performance.now = function () { return _p0; };
  let ON, OFF, ON2;
  try {
    window.__setPaintGrid(true);  ON = shot();
    window.__setPaintGrid(false); OFF = shot();
    window.__setPaintGrid(true);  ON2 = shot();      // 後片付け兼、時間が止まっている証拠
  } finally {
    Date.now = _now; performance.now = _perf;
  }

  /* 変化画素と、それが**セル境界の上か**。cell は T×T で切り出しているので
   * グリッド線はローカル x=0 / y=0 / x=T-1 / y=T-1 に落ちる。 */
  const diff = (k, X, Y) => {
    X = X || ON; Y = Y || OFF;
    let changed = 0, total = 0, onLine = 0;
    for (let i = 0; i < X[k].length; i++) {
      const a = X[k][i], b = Y[k][i];
      for (let o = 0, p = 0; o < a.length; o += 4, p++) {
        total++;
        if (Math.abs(a[o] - b[o]) > 3 || Math.abs(a[o + 1] - b[o + 1]) > 3 || Math.abs(a[o + 2] - b[o + 2]) > 3) {
          changed++;
          const lx = p % T, ly = (p / T) | 0;
          if (lx <= 1 || ly <= 1 || lx >= T - 1 || ly >= T - 1) onLine++;
        }
      }
    }
    return { changed: changed, total: total, onLine: onLine,
             pct: total ? (100 * changed / total) : 0,
             onLinePct: changed ? (100 * onLine / changed) : 0 };
  };

  /* ⭐ 目的側の assert: 「線が実際に見えるか」。セル上端の行 (y=0) と、その少し内側
   * (y=2,3) の平均輝度を比べる。すぐ隣の行と比べるので、絵の内容差ではなく線そのものを測る。 */
  const lum = (d, o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
  const edgeVsInner = (SET, k) => {
    let e = 0, en = 0, n = 0, nn = 0;
    for (const cell of SET[k]) {
      for (let x = 0; x < T; x++) {
        e += lum(cell, (0 * T + x) * 4); en++;
        n += lum(cell, (2 * T + x) * 4) + lum(cell, (3 * T + x) * 4); nn += 2;
      }
    }
    return { edge: en ? e / en : 0, inner: nn ? n / nn : 0, drop: (nn && en) ? (n / nn - e / en) : 0 };
  };

  return {
    tile: T,
    rects: rects.length,
    cells: { paint: groups.paint.length, plain: groups.plain.length, wall: groups.wall.length },
    paint: diff('paint'), plain: diff('plain'), wall: diff('wall'),
    // 装置: 時間を止めた上で ON を 2 回描いた差 = 0 でなければ、下の差分に
    // アニメが混ざっている (= 測定器が壊れている) ことになる。
    noise: diff('paint', ON, ON2),
    visOn: edgeVsInner(ON, 'paint'), visOff: edgeVsInner(OFF, 'paint'),
    visPlainOn: edgeVsInner(ON, 'plain'),
  };
};

/* 起動直後の姿だけを測る (?paintgrid=0 の撤退経路の確認用)。__setPaintGrid は叩かない。 */
const MEASURE_INIT = function () {
  const mc = document.getElementById('mapCanvas');
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  const cam = window.__graphRun.cam();
  const T = cam.tile;
  const rects = window.__paintRects().filter(r => r.loaded);
  const cells = [];
  const M = 1;   // ⚠ 外周 1 タイルの帯は除く (MEASURE の inPaint と同じ理由 = 元から線が在る)
  for (const r of rects) {
    for (let ty = r.ty + M; ty < r.ty + r.th - M; ty++) {
      for (let tx = r.tx + M; tx < r.tx + r.tw - M; tx++) {
        const sx = Math.round(tx * T - cam.camX), sy = Math.round(ty * T - cam.camY);
        if (sx < 0 || sy < 0 || sx + T > mc.width || sy + T > mc.height) continue;
        cells.push(mctx.getImageData(sx, sy, T, T).data);
      }
    }
  }
  const lum = (d, o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
  let e = 0, en = 0, n = 0, nn = 0;
  for (const cell of cells) {
    for (let x = 0; x < T; x++) {
      e += lum(cell, (0 * T + x) * 4); en++;
      n += lum(cell, (2 * T + x) * 4) + lum(cell, (3 * T + x) * 4); nn += 2;
    }
  }
  return { cells: cells.length, edge: en ? e / en : 0, inner: nn ? n / nn : 0,
           drop: (nn && en) ? (n / nn - e / en) : 0 };
};

/* 屋外の負のコントロール: mapCanvas 全面で ON/OFF 差分を採る。
 * ⚠⚠ 屋外は**雲の影が Date.now() で動く**ので、時間を止めずに renderMap を 2 回呼ぶと
 *   それだけで 0.4% の画素が変わる (2 回目の実測で 4269/1024000 px の偽の赤を出した)。
 *   時間を止めた上で ON→OFF→ON を採り、ON 同士の差 (noise) を装置 assert に使う。 */
const MEASURE_FIELD = function () {
  const mc = document.getElementById('mapCanvas');
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  const grab = () => { renderMap(); return mctx.getImageData(0, 0, mc.width, mc.height).data; };
  const _now = Date.now, _perf = performance.now.bind(performance);
  const _t0 = _now.call(Date), _p0 = _perf();
  Date.now = function () { return _t0; };
  performance.now = function () { return _p0; };
  let a, b, c;
  try {
    window.__setPaintGrid(true);  a = grab();
    window.__setPaintGrid(false); b = grab();
    window.__setPaintGrid(true);  c = grab();
  } finally {
    Date.now = _now; performance.now = _perf;
  }
  const cmp = (X, Y) => {
    let changed = 0, total = 0;
    for (let o = 0; o < X.length; o += 4) {
      total++;
      if (Math.abs(X[o] - Y[o]) > 3 || Math.abs(X[o + 1] - Y[o + 1]) > 3 || Math.abs(X[o + 2] - Y[o + 2]) > 3) changed++;
    }
    return { changed: changed, total: total };
  };
  const d = cmp(a, b), n = cmp(a, c);
  return { changed: d.changed, total: d.total, noise: n.changed,
           field: (typeof FIELD_MODE !== 'undefined') ? FIELD_MODE : null };
};

/* renderMap を 2 回叩いて絵が変わらないこと。
 * ⚠ 時間を止めてから測る。壁掛け松明は Date.now() で揺れるので、止めないと
 *   737,280 px 中 10 px が毎回変わる (実測)。これは renderMap 本来の性質であって
 *   非決定性ではない — ここで測りたいのは「同じ時刻なら同じ絵か」。 */
const DETERMINISM = function () {
  const mc = document.getElementById('mapCanvas');
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  const cam = window.__graphRun.cam();
  const T = cam.tile;
  const rects = window.__paintRects().filter(r => r.loaded);
  const spots = [];
  for (const r of rects) {
    for (let ty = r.ty; ty < r.ty + r.th; ty++) {
      for (let tx = r.tx; tx < r.tx + r.tw; tx++) {
        const sx = Math.round(tx * T - cam.camX), sy = Math.round(ty * T - cam.camY);
        if (sx < 0 || sy < 0 || sx + T > mc.width || sy + T > mc.height) continue;
        spots.push([sx, sy]);
      }
    }
  }
  const snap = () => { renderMap(); return spots.map(s => mctx.getImageData(s[0], s[1], T, T).data); };
  const _now = Date.now, _perf = performance.now.bind(performance);
  const _t0 = _now.call(Date), _p0 = _perf();
  Date.now = function () { return _t0; };
  performance.now = function () { return _p0; };
  let a, b;
  try { a = snap(); b = snap(); } finally { Date.now = _now; performance.now = _perf; }
  let diff = 0, total = 0;
  for (let i = 0; i < a.length; i++) {
    for (let o = 0; o < a[i].length; o += 4) {
      total++;
      if (a[i][o] !== b[i][o] || a[i][o + 1] !== b[i][o + 1] || a[i][o + 2] !== b[i][o + 2]) diff++;
    }
  }
  return { spots: spots.length, diff: diff, total: total };
};

async function boot(browser, url, cfg, vw, vh, net) {
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  page.on('pageerror', e => net.errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) net.errs.push('CONSOLE ' + m.text());
  });
  /* ⚠ /favicon.ico はブラウザが勝手に取りに行くもので、ゲームの素材ではない。
   *   ここを数えると全ドライバが恒久的に赤くなり、本物の 404 が埋もれる。 */
  page.on('response', r => {
    const p = new URL(r.url()).pathname;
    if (r.status() >= 400 && p !== '/favicon.ico') net.bad.push(r.status() + ' ' + p);
  });
  await page.evaluateOnNewDocument((c) => {
    try {
      if (c.payload) {
        sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(c.payload));
        sessionStorage.removeItem('dragonfighters.currentScenario');
      } else {
        sessionStorage.removeItem('dragonfighters.generatedScenario');
        sessionStorage.setItem('dragonfighters.currentScenario', c.scen);
      }
      localStorage.setItem('dragonfighters.xp', '45000');
    } catch (e) {}
  }, cfg);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof renderMap === 'function' && !!window.__graphRun && !!window.__paintRects",
    { timeout: 25000 });
  // 1 枚絵は非同期ロード。出るまでポーリングする (固定時間窓はフレークの温床)。
  await page.waitForFunction(
    "window.__paintRects().filter(r => r.loaded).length > 0 || (typeof FIELD_MODE !== 'undefined' && FIELD_MODE)",
    { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { computeCameraTarget(); camX = camTargetX; camY = camTargetY; });
  await page.evaluate(() => { computeVisibleTiles(); renderMap(); });
  return page;
}

/* カメラを **2 枚の 1 枚絵の間の通路**へ置く。
 * ⚠⚠ 絵の中心に置くと 20x16 タイルの絵が 1280x800 の画面を覆い尽くし、比較対象の
 *   「素の床」が 1 セルも映らない。すると §4 の「1 画素も変化しない」は
 *   **母集団 0 で自明に真**になり、assert が永久に空回りする (初回実測で実際に発生)。
 * ⚠⚠ 絵の**左**へ寄せるのも駄目だった: 現行の既定ダンジョンは 2 部屋 (r0=山場 / r1=ボス) で
 *   山場の左は全部 void なので、壁ばかりで素の床が出ない (2 回目の実測で確認)。
 *   → **素の床は 2 部屋を繋ぐ通路にしか無い**。そこを画面中央に入れると
 *      paint (両側の絵) / plain (通路) / wall (通路の上下の void) が 1 画面に揃う。
 * ⚠ computeCameraTarget() は呼ばない。クランプで狙った場所から外れることがある。 */
async function lookAtPainting(page) {
  return await page.evaluate(() => {
    const rs = window.__paintRects().filter(r => r.loaded).sort((a, b) => a.tx - b.tx);
    if (!rs.length) return null;
    const c = window.__graphRun.cam();
    const cx = (rs.length >= 2)
      ? (((rs[0].tx + rs[0].tw) + rs[1].tx) / 2) * c.tile    // 2 枚の間 = 通路
      : (rs[0].tx + rs[0].tw / 2) * c.tile;
    const cy = (rs[0].ty + rs[0].th / 2) * c.tile;
    camX = cx - window.innerWidth / 2;
    camY = cy - (window.innerHeight - c.hud) / 2;
    computeVisibleTiles(); renderMap();
    return { rects: rs.length, tx: rs[0].tx, ty: rs[0].ty, tw: rs[0].tw, th: rs[0].th,
             camX: camX, camY: camY };
  });
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
  const profile = require('./_pptr_profile')('df_paintgrid_');
  const srv = await startServer(PORT);
  console.log('[drv] serving ' + ROOT + ' :' + PORT);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });
  const BASE = 'http://localhost:' + PORT + '/index.html?diag=1&graphtest=1&graph=0';

  try {
    // ══ §1 装置 ═══════════════════════════════════════════════════════════════
    mark('廃坑 (旧経路固定 ?graph=0 / 1280x800) を起動し、1 枚絵へカメラを寄せる');
    const net = { errs: [], bad: [] };
    const page = await boot(browser, BASE, { scen: 'goblin-mine' }, 1280, 800, net);
    const look = await lookAtPainting(page);
    console.log('[drv] painting rect ' + JSON.stringify(look));
    check('(1a) 1 枚絵がロードされ、その矩形が取れる', !!look, JSON.stringify(look));

    const seams = await page.evaluate(() => ({
      setter: typeof window.__setPaintGrid, rects: typeof window.__paintRects,
    }));
    check('(1b) 検証シーム __setPaintGrid / __paintRects が在る',
      seams.setter === 'function' && seams.rects === 'function', JSON.stringify(seams));

    const M = await page.evaluate(MEASURE);
    await dumpCanvas(page, path.join(SHOT_DIR, 'mine_painting_grid_on.png'));
    console.log('[drv] cells ' + JSON.stringify(M.cells));
    console.log('[drv] paint ' + JSON.stringify(M.paint));
    console.log('[drv] plain ' + JSON.stringify(M.plain));
    console.log('[drv] wall  ' + JSON.stringify(M.wall));
    console.log('[drv] visOn ' + JSON.stringify(M.visOn) + '  visOff ' + JSON.stringify(M.visOff));

    /* ⚠ 母集団ガード: 対象セルが 0 なら以下の「変化 0」系は自明に真になり、assert が空回りする。 */
    check('(1c) 測定対象の 1 枚絵セルが画面に十分ある', M.cells.paint >= 20, 'paint cells=' + M.cells.paint);
    check('(1d) 素の床セルも画面にある (負のコントロールの母集団)', M.cells.plain >= 4, 'plain cells=' + M.cells.plain);
    check('(1d2) 壁/天井セルも画面にある (負のコントロールの母集団)', M.cells.wall >= 4, 'wall cells=' + M.cells.wall);
    check('(1e) ページエラー 0 件', net.errs.length === 0, net.errs.slice(0, 3).join(' | '));
    check('(1f) 404 が 0 件', net.bad.length === 0, net.bad.slice(0, 3).join(' | '));
    /* 装置 assert: 時間を止めた上で ON を 2 回描いた差は 0 のはず。ここが 0 でなければ
     * 下の A/B 差分にアニメ (松明の揺れ等) が混ざっており、測定器の方が壊れている。 */
    check('(1g) 装置: 時間が止まっている (ON を 2 回描いて差 0)',
      M.noise.changed === 0 && M.noise.total > 0, 'noise ' + M.noise.changed + '/' + M.noise.total + ' px');

    // ══ §2 目的側 — 線が「見えるか」 ═══════════════════════════════════════════
    mark('1 枚絵の上で、セル境界の行が内側より暗いこと (= 線が見えている)');
    /* rgba(0,0,0,0.22) の 1px 線なので、境界行は内側より十分暗くなるはず。
     * ⭐ これは「フラグが流れたか」ではなく「絵としてどうか」を測る唯一の assert。 */
    check('(2a) ★グリッド ON: 境界行が内側より暗い', M.visOn.drop >= 8.0,
      'drop=' + M.visOn.drop.toFixed(2) + ' (edge ' + M.visOn.edge.toFixed(1) + ' / inner ' + M.visOn.inner.toFixed(1) + ')');
    /* ⚠ OFF 側の残差は 0 ぴったりにはならない。境界行と内側の行では**絵の内容が違う**ため、
     *   カメラの置き方しだいで -0.96 〜 +1.09 の範囲で揺れるのを実測した (線ではなく中身)。
     *   平均輝度 66 に対し 1.1 は 1.6% = 目には見えない。閾値は「線が立たない」側で置く。 */
    check('(2b) ★グリッド OFF: その暗さが消える (旧挙動)', Math.abs(M.visOff.drop) < 3.0,
      'drop=' + M.visOff.drop.toFixed(2));
    check('(2c) 素の床でも線は見えている (従来どおり)', M.visPlainOn.drop >= 3.0,
      'drop=' + M.visPlainOn.drop.toFixed(2));

    // ══ §3 A/B 差分 — 変わったのはグリッド線だけか ═══════════════════════════
    mark('1 枚絵セルの A/B 差分と、その画素がセル境界上にあるか');
    check('(3a) 1 枚絵セルの画素が有意に変化した', M.paint.pct >= 1.0,
      'paint 変化 ' + M.paint.pct.toFixed(2) + '% (' + M.paint.changed + '/' + M.paint.total + ')');
    /* 96px セルの外周 (幅 2px) は面積比 8.2%。線しか描いていないなら変化画素はほぼ全部そこに入る。 */
    check('(3b) ★変化画素はセル境界上に限られる (面塗りでなく線)', M.paint.onLinePct >= 97.0,
      '境界上 ' + M.paint.onLinePct.toFixed(2) + '% (' + M.paint.onLine + '/' + M.paint.changed + ')');

    // ══ §4 負のコントロール — 触ってはいけない領域 ═══════════════════════════
    mark('素の床と壁が 1 画素も変わらないこと');
    check('(4a) ★素の床セルは 1 画素も変化しない (元からグリッドが出ている)',
      M.plain.changed === 0 && M.plain.total > 0,
      'plain 変化 ' + M.plain.changed + '/' + M.plain.total + ' px');
    check('(4b) ★壁/天井セルは 1 画素も変化しない (mapData===2 には引かない)',
      M.wall.changed === 0 && M.wall.total > 0,
      'wall 変化 ' + M.wall.changed + '/' + M.wall.total + ' px');

    // ══ §5 決定論 ════════════════════════════════════════════════════════════
    mark('renderMap 2 回で絵が変わらないこと');
    const D = await page.evaluate(DETERMINISM);
    check('(5a) renderMap は決定論的', D.diff === 0 && D.total > 0,
      'diff ' + D.diff + '/' + D.total + ' px (spots=' + D.spots + ')');
    await page.close();

    // ══ §6 撤退スイッチ ?paintgrid=0 ═════════════════════════════════════════
    mark('?paintgrid=0 で起動すると 1 枚絵の上に線が出ないこと');
    const net2 = { errs: [], bad: [] };
    const page2 = await boot(browser, BASE + '&paintgrid=0', { scen: 'goblin-mine' }, 1280, 800, net2);
    await lookAtPainting(page2);
    const I = await page2.evaluate(MEASURE_INIT);
    await dumpCanvas(page2, path.join(SHOT_DIR, 'mine_painting_grid_off.png'));
    console.log('[drv] init(paintgrid=0) ' + JSON.stringify(I));
    check('(6a) 母集団: 1 枚絵セルが取れている', I.cells >= 20, 'cells=' + I.cells);
    check('(6b) ★?paintgrid=0 では境界行が暗くならない', Math.abs(I.drop) < 3.0, 'drop=' + I.drop.toFixed(2));
    await page2.close();

    // ══ §7 負のコントロール — 屋外へ漏れていないか ═══════════════════════════
    mark('屋外 (隊商護衛 / 地平線ビュー) では ON/OFF で 1 画素も変わらないこと');
    const net3 = { errs: [], bad: [] };
    const page3 = await boot(browser, 'http://localhost:' + PORT + '/index.html?diag=1&graphtest=1',
      { payload: CARAVAN_PAYLOAD }, 1280, 800, net3);
    const F = await page3.evaluate(MEASURE_FIELD);
    await dumpCanvas(page3, path.join(SHOT_DIR, 'field.png'));
    console.log('[drv] field ' + JSON.stringify({ changed: F.changed, noise: F.noise, total: F.total, FIELD_MODE: F.field }));
    check('(7a) 装置: 屋外テーマで FIELD_MODE が立っている', F.field === true, 'FIELD_MODE=' + F.field);
    /* 装置 assert: 屋外は雲の影が Date.now() で動くので、時間を止められていることを
     * 先に確かめる。ここが 0 でなければ (7c) の差分はアニメを見ているだけになる。 */
    check('(7b) 装置: 屋外でも時間が止まっている (ON を 2 回描いて差 0)',
      F.noise === 0 && F.total > 0, 'noise ' + F.noise + '/' + F.total + ' px');
    check('(7c) ★屋外は ON/OFF で 1 画素も変わらない (格子が遠近と衝突しない)',
      F.changed === 0 && F.total > 0, 'field 変化 ' + F.changed + '/' + F.total + ' px');
    await page3.close();

  } catch (e) {
    console.error('[drv] 例外: ' + (e && e.stack || e));
    fail++; fails.push('例外: ' + (e && e.message || e));
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }

  console.log('\n════════════════════════════════════════');
  console.log('  PASS ' + pass + ' / FAIL ' + fail + '  (shots: ' + SHOT_DIR + ')');
  if (fails.length) { console.log('  --- FAIL 一覧 ---'); fails.forEach(f => console.log('   ・' + f)); }
  console.log('════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})();
