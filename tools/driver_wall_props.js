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

  window.__setWallProps(true);
  const A = grab();
  window.__setWallProps(false);
  const B = grab();
  window.__setWallProps(true);   // 後片付け: 本来の状態へ戻す

  const ratio = (k) => {
    let changed = 0, total = 0;
    for (let i = 0; i < A[k].length; i++) {
      const a = A[k][i], b = B[k][i];
      for (let o = 0; o < a.length; o += 4) {
        total++;
        if (Math.abs(a[o] - b[o]) > 4 || Math.abs(a[o + 1] - b[o + 1]) > 4 || Math.abs(a[o + 2] - b[o + 2]) > 4) changed++;
      }
    }
    return { changed: changed, total: total, pct: total ? (100 * changed / total) : 0 };
  };

  return {
    tile: T,
    cells: { ring: ring.length, north: north.length, floor: floor.length },
    ring: ratio('ring'), north: ratio('north'), floor: ratio('floor'),
    propW: window.__wallPropImg ? window.__wallPropImg.naturalWidth : null,
    propH: window.__wallPropImg ? window.__wallPropImg.naturalHeight : null,
  };
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
