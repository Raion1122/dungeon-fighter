#!/usr/bin/env node
/*
 * driver_wall_face.js — 「部屋の壁が石壁として読めているか」の検証ドライバ (2026-08-09)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 塞ぐ穴
 *   2026-08-08 の石壁実装は driver_mapdef_step1 (8シナリオの描画 golden) と
 *   driver_field_step1_geo (幾何 golden) を**全数緑のまま通過**したが、実機で見ると
 *   ユーザー評価は「石壁というよりか、ただの白い幕」だった。既存ドライバは
 *     ・壁が床より明るいか
 *     ・立面に水平のエッジ (石積みのコース) があるか
 *     ・リングがフォグで黒く潰れていないか
 *   のどれも測っていない。golden は「前回と同じ絵か」しか見ないので、**最初から間違った絵**は
 *   永久に緑になる。本ドライバはその 3 点を数値で押さえる。
 *
 * ■ 測り方の方針
 *   ・**mapCanvas と lightingCanvas を分けて測る**。前者は「絵そのもの」、後者は「フォグの α」。
 *     合成後の 1 枚で測ると絵の欠陥とフォグの欠陥が混ざって切り分けられない
 *     (2026-08-08 はまさにこれで「壁を描いたのに 1px も見えない」を取りこぼした)。
 *   ・幾何は実装から借りる (window.__graphRun.cam() / mapData)。ドライバが 96 や 192 を写すと
 *     実装とドライバが同じ間違いを共有して両方緑になる。
 *   ・§6 は他5シナリオの非退行。専用素材を持たないシナリオでは従来の wallTint 経路が
 *     生きていること = 今回の変更が廃坑だけに閉じていることを測る。
 *
 * 使い方: node tools/driver_wall_face.js [--headful] [--browser <path>] [--port N] [--shots DIR]
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
const PORT = parseInt(arg('port', '8867'), 10);
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'claude', 'df_wall_face_shots'));

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

/* ページ内で走る測定関数。
 * ⚠ 幾何は必ず実装から取る (cam() / mapData)。ここで 96 や 192 を書くと二重定義になる。
 * ⚠ mapCanvas は DPR スケールを持たない (resizeCanvas が width = innerWidth の素置き) ので
 *   CSS px と backing px が 1:1。lightingCanvas は lightScale が掛かるので変換が要る。 */
const MEASURE = function () {
  const mc = document.getElementById('mapCanvas');
  const lc = document.getElementById('lightingCanvas');
  const g = window.__graphRun;
  const cam = g.cam();
  const T = cam.tile;
  const md = g.board().mapDataText.split('\n').map(r => r.split('').map(Number));
  const H = md.length, W = md[0].length;

  // 北壁の列を 1 本選ぶ: 壁セルの真下が床で、その列が画面内にあるもの
  let pick = null;
  for (let ty = 0; ty < H - 1 && !pick; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (md[ty][tx] !== 2 || md[ty + 1][tx] === 2) continue;
      const sx = tx * T - cam.camX, sy = (ty + 1) * T - cam.camY;
      if (sx < 0 || sx + T > mc.width || sy < 24 || sy + T > mc.height) continue;
      pick = { tx: tx, ty: ty, sx: sx, sy: sy };
      break;
    }
  }
  if (!pick) return { err: 'no north wall on screen' };

  // 西壁 (リング d1): pick の部屋の床行で、左隣が壁になっているセル
  let west = null;
  const fy = pick.ty + 2;
  if (fy < H) {
    for (let tx = 2; tx < W; tx++) {
      if (md[fy][tx] === 2 || md[fy][tx - 1] !== 2) continue;
      const sx = (tx - 1) * T - cam.camX, sy = fy * T - cam.camY;
      if (sx < 0 || sx + T > mc.width || sy < 0 || sy + T > mc.height) continue;
      west = { tx: tx - 1, ty: fy, sx: sx, sy: sy };
      break;
    }
  }

  /* 南壁 (リング d1/d2)。★[2026-08-09] リングを縦横で分けた (RX=1 / RY=2) ので、
   *   「2 枚目まで石が敷かれている」ことを測れるのは**南北だけ**になった。
   * ⚠ 南のセルは mapCanvas では画面外だが **lightingCanvas は画面いっぱいにある**
   *   (カメラのクランプは HUD を除いた usable 矩形が基準で、canvas 自体は HUD の下まで
   *   伸びている) ので α は読める。 */
  let south = null;
  {
    let ty = pick.ty + 1;
    while (ty + 1 < H && md[ty + 1][pick.tx] !== 2) ty++;   // ty = この列の最下の床行
    if (ty + 2 < H && md[ty + 1][pick.tx] === 2 && md[ty + 2][pick.tx] === 2) {
      south = { tx: pick.tx, d1: ty + 1, d2: ty + 2 };
    }
  }

  const mctx = mc.getContext('2d');
  const stat = function (x, y, w, h) {
    const iw = Math.round(w), ih = Math.round(h);
    const d = mctx.getImageData(Math.round(x), Math.round(y), iw, ih).data;
    let L = 0, S = 0, n = 0;
    const rows = [];
    for (let j = 0; j < ih; j++) {
      let rl = 0;
      for (let i = 0; i < iw; i++) {
        const o = (j * iw + i) * 4, r = d[o], gg = d[o + 1], b = d[o + 2];
        const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        L += l; rl += l; S += Math.max(r, gg, b) - Math.min(r, gg, b); n++;
      }
      rows.push(rl / iw);
    }
    // 行平均輝度の隣接差の最大 = 「水平のエッジ (石積みのコース) の強さ」
    let edge = 0;
    for (let j = 1; j < rows.length; j++) edge = Math.max(edge, Math.abs(rows[j] - rows[j - 1]));
    return { L: L / n, S: S / n, edge: edge, rows: ih };
  };

  // 壁帯 = 床上端のすぐ上。画面に入っている高さだけを測る (これが実機で見える全て)
  const bandH = Math.min(T, Math.max(0, Math.floor(pick.sy)));
  const wall = bandH >= 8 ? stat(pick.sx, pick.sy - bandH, T, bandH) : null;
  const floorH = Math.min(T - 6, bandH >= 8 ? bandH : 40);
  const floor = stat(pick.sx, pick.sy + 6, T, floorH);

  // フォグの α (lightingCanvas)。255=暗黒 / 178=記憶のみ / 小さいほど明るい
  const ls = lc.width / (window.innerWidth || 1);
  const lctx = lc.getContext('2d');
  const alphaAt = function (wtx, wty) {
    const x = Math.round((wtx * T + T / 2 - cam.camX) * ls);
    const y = Math.round((wty * T + T / 2 - cam.camY) * ls);
    if (x < 0 || y < 0 || x >= lc.width || y >= lc.height) return null;
    return lctx.getImageData(x, y, 1, 1).data[3];
  };

  /* ★[通路の口 2026-08-09] 北向きの出口がある列は、壁帯が**抜けている** (石を敷かない) はず。
   *   同じ帯の高さで「口の列」と「2 つ隣の列」を比べる = 素材の明るさではなく
   *   **敷いた / 敷いていない**だけを見る。列は実装 (__graphRun.exits) から借りるので、
   *   ドライバが midC の式 (floor((c1+c2)/2)) を写経しない。 */
  let open = null;
  try {
    const ups = (g.exits ? g.exits() : []).filter(e => e.dir === 'up' && e.at);
    if (ups.length && bandH >= 8) {
      const gx = ups[0].at.tx;
      const sxO = gx * T - cam.camX, sxW = (gx + 2) * T - cam.camX;
      const yb = pick.sy - bandH;
      if (sxO >= 0 && sxO + T <= mc.width && sxW >= 0 && sxW + T <= mc.width && yb >= 0) {
        open = { gx: gx, hole: stat(sxO, yb, T, bandH), stone: stat(sxW, yb, T, bandH) };
      }
    }
  } catch (e) { open = { err: String(e && e.message) }; }

  return {
    tile: T, pick: pick, west: west, bandH: bandH, wall: wall, floor: floor, open: open,
    faceW: window.__wallFaceImg ? window.__wallFaceImg.naturalWidth : null,
    faceH: window.__wallFaceImg ? window.__wallFaceImg.naturalHeight : null,
    topW: window.__wallTopImg ? window.__wallTopImg.naturalWidth : null,
    topH: window.__wallTopImg ? window.__wallTopImg.naturalHeight : null,
    aWallD1: west ? alphaAt(west.tx, west.ty) : null,
    aWallD2: west ? alphaAt(west.tx - 1, west.ty) : null,
    aSouthD1: south ? alphaAt(south.tx, south.d1) : null,
    aSouthD2: south ? alphaAt(south.tx, south.d2) : null,
    aFloor: alphaAt(pick.tx, pick.ty + 2),
  };
};

/* renderMap の周期スパイク測定。★2026-08-08 に「createPattern の源を canvas にすると
 * 約57回に1回だけ 7.5 秒かかる」罠を踏んだ実績があるので、p50 ではなく **max** を見る。 */
const PERF = function (n) {
  const t = [];
  for (let i = 0; i < n; i++) { const a = performance.now(); renderMap(); t.push(performance.now() - a); }
  t.sort(function (x, y) { return x - y; });
  return { p50: t[Math.floor(n * 0.5)], p90: t[Math.floor(n * 0.9)], max: t[n - 1],
           mean: t.reduce(function (a, b) { return a + b; }, 0) / n };
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
  // 素材のロードと最初の描画を待つ (立面/天面は onload で renderMap を呼ぶ)
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => { computeCameraTarget(); camX = camTargetX; camY = camTargetY; });
  await page.evaluate(() => { computeVisibleTiles(); renderMap(); renderLighting(); });
  await new Promise(r => setTimeout(r, 300));
  return page;
}

/* mapCanvas だけを吸い出す。DM の語りダイアログや左メニューが**北壁の帯を覆ってしまう**ため、
 * page.screenshot では絵を目視できない (語りは画面上部に出る仕様で、そこが立面の位置)。
 * ⚠ フォグ (lightingCanvas) は乗らない = 「素材と Pass 2 の絵」だけが見える。フォグ込みの
 *   見え方は α の実測 (§3) 側で担保する。両方を 1 枚で見ようとすると切り分けができない。 */
async function dumpCanvas(page, file, id) {
  const uri = await page.evaluate((cid) => {
    const c = document.getElementById(cid);
    return c ? c.toDataURL('image/png') : null;
  }, id || 'mapCanvas');
  if (!uri) return false;
  fs.writeFileSync(file, Buffer.from(uri.split(',')[1], 'base64'));
  return true;
}

/* 語りダイアログを閉じて実プレイ状態のスクショを撮る。
 * ⚠ 数値の assert は必ず**この前**に採ること。ここから先は敵が動くので再現しない。
 *   目視用の証拠を残すためだけの補助であり、PASS/FAIL には一切使わない。 */
async function playShot(page, file) {
  const vp = page.viewport();
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(Math.round(vp.width * 0.55), Math.round(vp.height * 0.45)).catch(() => {});
    await wait(500);
  }
  await page.keyboard.press('Space').catch(() => {});
  await wait(2200);
  await page.screenshot({ path: file });
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_wallface_');
  const srv = await startServer(PORT);
  console.log('[drv] serving ' + ROOT + ' :' + PORT);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });
  const URL_Q = 'http://localhost:' + PORT + '/index.html?diag=1&graphtest=1';

  try {
    // ══ §1 素材の配線 ═══════════════════════════════════════════════════════════
    mark('廃坑 (デスクトップ 1280x800) を起動');
    const net = { errs: [], bad: [] };
    const page = await boot(browser, URL_Q, 'goblin-mine', 1280, 800, net);
    const M = await page.evaluate(MEASURE);
    await page.screenshot({ path: path.join(SHOT_DIR, 'desktop.png') });
    await dumpCanvas(page, path.join(SHOT_DIR, 'desktop_map.png'));
    if (M.err) { check('(0) 北壁が画面に入っている', false, M.err); throw new Error(M.err); }
    console.log('[drv] wall ' + JSON.stringify(M.wall) + '\n[drv] floor ' + JSON.stringify(M.floor));
    console.log('[drv] α wallD1=' + M.aWallD1 + ' wallD2=' + M.aWallD2
      + ' southD1=' + M.aSouthD1 + ' southD2=' + M.aSouthD2 + ' floor=' + M.aFloor
      + ' / 帯の高さ=' + M.bandH + 'px / pick=' + JSON.stringify(M.pick));
    console.log('[drv] open ' + JSON.stringify(M.open));

    check('(1a) 立面素材が読めている / 幅は tile の整数倍', M.faceW > 0 && M.faceW % M.tile === 0,
      'faceW=' + M.faceW + ' tile=' + M.tile);
    check('(1b) ★立面の高さ === 壁矩形の高さ (縦に伸縮していない)', M.faceH === M.tile * 2,
      'faceH=' + M.faceH + ' 期待=' + (M.tile * 2));
    check('(1c) 天面素材が読めている / 正方形で tile の整数倍',
      M.topW > 0 && M.topW === M.topH && M.topW % M.tile === 0, 'top=' + M.topW + 'x' + M.topH);
    const badAsset = net.bad.filter(b => /wall_face|wall_top/.test(b));
    check('(1d) 壁素材の 404 が 0 件', badAsset.length === 0, badAsset.join(','));
    check('(1e) ページエラー 0 件', net.errs.length === 0, net.errs.slice(0, 3).join(' | '));

    // ══ §2 絵として石壁に見えるか (mapCanvas の実測) ════════════════════════════
    mark('立面の絵を実測 (幕でないことの数値化)');
    /* ⚠⚠⚠ **明るさ (2a) は「石壁に見えるか」の判別に使えない**。負のコントロール実測 (cd0223e =
     *   ユーザーが「ただの白い幕」と評した版) では 2.44 倍で、直した後 (2.07 倍) より**明るかった**。
     *   つまり 2026-08-08 の実装は壁を明るくすることには成功していて、失敗したのは構造の方だった。
     *   → (2a) は「床に溶けていない」ことの下限ガードとしてだけ残す。**閾値を上げても意味は増えない**。
     *   直しの方向を「もっと白くする」に取らないこと。それは既に一度失敗した道。 */
    check('(2a) 壁帯が床より明るい (下限ガード。判別力は無い / 負の対照も 2.44 倍で通る)',
      M.wall.L >= M.floor.L * 1.30,
      '壁 L=' + M.wall.L.toFixed(1) + ' / 床 L=' + M.floor.L.toFixed(1)
      + ' = ' + (M.wall.L / M.floor.L).toFixed(2) + '倍');
    check('(2b) 壁が床より無彩色 (色相でも分離している)', M.wall.S <= M.floor.S * 0.80,
      '壁 S=' + M.wall.S.toFixed(1) + ' / 床 S=' + M.floor.S.toFixed(1));
    /* ★★ これが「白い幕」を機械的に捕まえる**唯一の**assert。マテリアル見本 + 一様な白では
     *   行方向の輝度差が小さい (岩のノイズしか無い)。石積みのコースがあると横目地で段差が立つ。
     *   同じ帯の高さで床側と比べるので、素材のノイズ量ではなく**構造**を見ている。
     *   負のコントロール実測 (cd0223e): 壁 edge=2.59 / 床 3.66 = **0.71 倍** → 落ちる。
     *   直した後: 48.57 / 3.66 = **13.28 倍** → 通る。桁が違うので閾値は 1.8 で十分。 */
    check('(2c) ★立面に水平のエッジ (石積みのコース) がある', M.wall.edge >= M.floor.edge * 1.8,
      '壁 edge=' + M.wall.edge.toFixed(2) + ' / 床 edge=' + M.floor.edge.toFixed(2)
      + ' = ' + (M.wall.edge / Math.max(0.01, M.floor.edge)).toFixed(2) + '倍');

    // ══ §3 リングがフォグで黒く潰れていないか (lightingCanvas の α) ═════════════
    mark('リングのフォグを実測');
    /* ⚠ (3a) の d1 は**パーティ編成に依存する**ので判別には使えない。d1 は放射光源の届く距離に
     *   あり、削り量が getSight(leaderClassKey) と仲間の職業 (?graphtest では毎回変わる) で動く。
     *   負のコントロールでも 116 で通ってしまった。ここは「暗黒に落ちていない」下限ガードだけ。 */
    check('(3a) 西壁 d1 が暗黒に落ちていない (下限ガード / 編成依存なので判別力は弱い)',
      M.aWallD1 != null && M.aWallD1 < 170, 'α=' + M.aWallD1);
    /* ★★ リングの判別はこちら。**削りが乗っていない側は 178 に張り付く**のが効く:
     *   記憶レイヤーだけなら 0.70*255 = 178 ちょうどで、放射光源はここまで届かないので
     *   編成が変わっても動かない (負のコントロール実測もぴたり 178 だった)。
     *   壁専用の削りが乗ると 0.70*(1-0.32)*255 = 121 が上限で、実測は 104〜121 に散る
     *   (仲間の職業で光の半径が変わり d2 にも僅かに届くため。**片側だけが散る**のがミソ)。
     *   → 閾値 170 は「壁専用の削りが本当に走っているか」を 1 ビットで測っている。
     * ⚠⚠ [2026-08-09] 測る場所を**西 d2 → 南 d2** へ移した。リングを縦横で分けた
     *   (RX=1 / RY=2) 結果、西の d2 はもう石を敷く範囲の外なので、ここを西で測ると
     *   「左右を薄くした」という正しい変更が永久に赤くなる。南は RY=2 のまま = 2 枚目まで
     *   石があるので、この assert の判別力 (178 に張り付くか否か) はそのまま生きる。 */
    check('(3b) ★南壁 d2 に壁専用の追い削りが乗っている (記憶のみの 178 ではない)',
      M.aSouthD2 != null && M.aSouthD2 < 170, 'α=' + M.aSouthD2 + ' (記憶のみなら 178)');
    check('(3c) それでも床より暗い (壁が光源になっていない)',
      M.aWallD1 != null && M.aFloor != null && M.aWallD1 > M.aFloor,
      'wall=' + M.aWallD1 + ' floor=' + M.aFloor);
    /* ★[2026-08-09] ユーザー要望「左右の石壁は特に幅を薄く」の非退行。
     *   西 d1 は石 (3a で下限を見ている) / 西 d2 は**石を敷く範囲の外**であることを測る。
     *   ⚠ ROOM_WALL_RING_X を 2 へ戻すと d2 が 121 前後まで持ち上がってここが赤くなる =
     *     「左右がまた分厚くなった」を 1 ビットで捕まえられる。南 (3b) と対になっている。 */
    check('(3d) ★左右のリングが 1 タイルで終わっている (西 d2 は石の範囲外)',
      M.aWallD2 != null && M.aWallD2 > 170,
      'westD2 α=' + M.aWallD2 + ' / southD2 α=' + M.aSouthD2 + ' (石なら 104〜121)');

    // ══ §3.5 通路の口が壁に抜けているか ════════════════════════════════════════
    mark('出口の列で壁帯が抜けているか (通路の口)');
    /* ★ユーザー指摘「行先の選択肢方向の通路が石壁でふさがれている」の非退行。
     * ⚠ **明るさの絶対値では測らない**。素材を差し替えるたびに閾値が腐る。同じ帯・同じ高さで
     *   「口の列」と「2 つ隣の列」を比べ、口の方が**桁で暗い**ことだけを見る
     *   (口には Pass 1a の暗い天井しか残らない = 石を 1px も敷いていない状態)。 */
    check('(3e) 出口の列を測れている (__graphRun.exits から借りた列が画面内)',
      !!(M.open && M.open.hole && M.open.stone), JSON.stringify(M.open));
    if (M.open && M.open.hole && M.open.stone) {
      check('(3f) ★通路の口には石が敷かれていない (隣の壁より暗い)',
        M.open.hole.L <= M.open.stone.L * 0.5,
        '口 L=' + M.open.hole.L.toFixed(1) + ' / 壁 L=' + M.open.stone.L.toFixed(1)
        + ' = ' + (M.open.hole.L / Math.max(0.01, M.open.stone.L)).toFixed(2) + '倍');
    }

    // ══ §4 性能: 周期スパイクが出ていないか ════════════════════════════════════
    mark('renderMap の周期スパイク (N=400)');
    const P = await page.evaluate(PERF, 400);
    console.log('[drv] perf ' + JSON.stringify(P));
    check('(4a) ★7.5 秒級の周期スパイクが無い (max < 400ms)', P.max < 400, 'max=' + P.max.toFixed(1) + 'ms');
    check('(4b) 通常フレームが劣化していない (p50 < 3ms)', P.p50 < 3, 'p50=' + P.p50.toFixed(2) + 'ms');
    await playShot(page, path.join(SHOT_DIR, 'desktop_play.png'));
    await page.close();

    // ══ §5 iPhone 相当の狭い縦持ち ════════════════════════════════════════════
    mark('iPhone 相当 (430x880) で帯が成立するか');
    const net2 = { errs: [], bad: [] };
    const ip = await boot(browser, URL_Q, 'goblin-mine', 430, 880, net2);
    const M2 = await ip.evaluate(MEASURE);
    await ip.screenshot({ path: path.join(SHOT_DIR, 'iphone.png') });
    await dumpCanvas(ip, path.join(SHOT_DIR, 'iphone_map.png'));
    if (M2.err) {
      check('(5a) iPhone でも北壁が画面に入っている', false, M2.err);
    } else {
      console.log('[drv] iPhone 帯=' + M2.bandH + 'px 壁 L=' + M2.wall.L.toFixed(1)
        + ' 床 L=' + M2.floor.L.toFixed(1) + ' edge=' + M2.wall.edge.toFixed(2)
        + ' / 床 edge=' + M2.floor.edge.toFixed(2));
      check('(5a) iPhone でも壁帯が床より明るい', M2.wall.L >= M2.floor.L * 1.20,
        (M2.wall.L / M2.floor.L).toFixed(2) + '倍 / 帯=' + M2.bandH + 'px');
      /* ⚠ 閾値 4.0 は負のコントロールから逆算した値。cd0223e の狭い帯は 8.51/4.66 = **1.83 倍**で、
       *   1.5 のままだと**旧実装も通ってしまう**(実測で確認)。直した後は 10.3 倍あるので 4.0 で
       *   両者を確実に分けられる。⚠ ここを緩めると iPhone だけ幕に戻った状態を見逃す。 */
      check('(5b) ★狭い帯でも水平のエッジが残る (負の対照 1.83 倍 / 現行 10.3 倍)',
        M2.wall.edge >= M2.floor.edge * 4.0,
        '壁 ' + M2.wall.edge.toFixed(2) + ' / 床 ' + M2.floor.edge.toFixed(2)
        + ' = ' + (M2.wall.edge / Math.max(0.01, M2.floor.edge)).toFixed(2) + '倍');
    }
    await playShot(ip, path.join(SHOT_DIR, 'iphone_play.png'));
    await ip.close();

    // ══ §6 他5シナリオの非退行 (専用素材を持たない側) ══════════════════════════
    mark('森 (bandits-forest) — 従来経路が生きているか');
    const net3 = { errs: [], bad: [] };
    const fo = await boot(browser, URL_Q, 'bandits-forest', 1280, 800, net3);
    const M3 = await fo.evaluate(MEASURE);
    console.log('[drv] forest ' + JSON.stringify({ faceW: M3.faceW, topW: M3.topW,
      wall: M3.wall ? +M3.wall.L.toFixed(1) : null, floor: M3.floor ? +M3.floor.L.toFixed(1) : null }));
    check('(6a) 専用素材を持たない = 変更が廃坑と沼地の 2 つに閉じている',
      M3.faceW === null && M3.topW === null,
      'faceW=' + M3.faceW + ' topW=' + M3.topW);
    if (!M3.err) {
      check('(6b) それでも壁は床より明るい (従来の wallTint が生きている)',
        M3.wall.L >= M3.floor.L * 1.15, (M3.wall.L / M3.floor.L).toFixed(2) + '倍');
    }
    check('(6c) 森でページエラー 0 件', net3.errs.length === 0, net3.errs.slice(0, 3).join(' | '));
    await fo.close();

    // ══ §7 沼地 — 2 テーマ目の専用素材 (2026-08-14) ═════════════════════════════
    /* ユーザー指摘「壁がまだ不自然。白いスクリーンが掛かっているようにみえるだけ」への対応で、
     * 沼地も廃坑と同じ 2 枚構成 (立面 + 天面) へ移した。白い幕 (wallTint) は wallTop が効いた
     * セルには乗らないので、ここが通れば幕は外れている。
     * ⚠ (2b)「壁が床より無彩色」は**流用しない**。あれは廃坑の寒色花崗岩の前提で、沼地の壁は
     *   苔むした緑 = 彩度が高い。テーマの画作りごと変わる assert を写経すると、正しい絵で赤くなる。 */
    mark('沼地 (lizard-swamp) — 2 テーマ目の専用素材');
    const net4 = { errs: [], bad: [] };
    const sw = await boot(browser, URL_Q, 'lizard-swamp', 1280, 800, net4);
    const M4 = await sw.evaluate(MEASURE);
    await dumpCanvas(sw, path.join(SHOT_DIR, 'swamp_map.png'));
    console.log('[drv] swamp ' + JSON.stringify({ faceW: M4.faceW, faceH: M4.faceH, topW: M4.topW,
      wall: M4.wall ? +M4.wall.L.toFixed(1) : null, floor: M4.floor ? +M4.floor.L.toFixed(1) : null,
      edge: M4.wall ? +M4.wall.edge.toFixed(2) : null }));
    check('(7a) 沼地の立面素材が読めている / 幅は tile の整数倍・高さ === 壁矩形',
      M4.faceW > 0 && M4.faceW % M4.tile === 0 && M4.faceH === M4.tile * 2,
      'face=' + M4.faceW + 'x' + M4.faceH + ' tile=' + M4.tile);
    check('(7b) 沼地の天面素材が読めている / 正方形で tile の整数倍',
      M4.topW > 0 && M4.topW === M4.topH && M4.topW % M4.tile === 0, 'top=' + M4.topW + 'x' + M4.topH);
    const badAsset4 = net4.bad.filter(b => /wall_face|wall_top/.test(b));
    check('(7c) 沼地で壁素材の 404 が 0 件', badAsset4.length === 0, badAsset4.join(','));
    if (!M4.err) {
      /* ★ 白い幕を機械的に捕まえる唯一の assert (廃坑の (2c) と同じ物差し)。幕は明るさを上げる
       *   代わりに構造を潰すので、行方向の輝度差で落ちる。実測 (2026-08-14): 幕を被せていた頃の
       *   壁テクスチャはコントラスト SD 10.1、専用素材は SD 26.5〜29.8。 */
      check('(7d) ★沼地の立面に水平のエッジ (石の層) がある = 幕ではない',
        M4.wall.edge >= M4.floor.edge * 1.8,
        '壁 edge=' + M4.wall.edge.toFixed(2) + ' / 床 edge=' + M4.floor.edge.toFixed(2)
        + ' = ' + (M4.wall.edge / Math.max(0.01, M4.floor.edge)).toFixed(2) + '倍');
      check('(7e) 沼地の壁帯が床に溶けていない (下限ガード)', M4.wall.L >= M4.floor.L * 1.15,
        '壁 L=' + M4.wall.L.toFixed(1) + ' / 床 L=' + M4.floor.L.toFixed(1)
        + ' = ' + (M4.wall.L / M4.floor.L).toFixed(2) + '倍');
    }
    check('(7f) 沼地でページエラー 0 件', net4.errs.length === 0, net4.errs.slice(0, 3).join(' | '));
    await sw.close();
  } catch (e) {
    check('(fatal) ドライバが完走した', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }

  console.log('\n[drv] ' + pass + '/' + (pass + fail) + ' PASS');
  if (fail) { console.log('[drv] FAILED:'); fails.forEach(f => console.log('   - ' + f)); }
  console.log('[drv] shots: ' + SHOT_DIR);
  process.exit(fail ? 1 : 0);
})();
