#!/usr/bin/env node
/*
 * driver_field_step6_png.js — 「遠景 PNG 2 枚を描画へ配線した」ことの検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ 名前が似た別ドライバに **driver_field_step6.js (移動デッドロック救済)** がある。別物。
 *
 * driver_field_step3.js が測るのは**視差と性能**であって、「PNG が本当に使われているか」は
 * 測っていない。手続き版フォールバックが出ていても丘と並木は 2 速で流れるので step3 は
 * 全 PASS してしまう = **空振りする**。本ドライバはその穴だけを塞ぐ。
 *
 * ■ 検証する 4 本
 *   A  PNG が実際に使われている … 404 が 0 件 / naturalWidth×Height が実寸 / _fieldFarImg・
 *                                 _fieldMidImg が非 null / ?v=1 が付いている
 *   B  タイルが PNG 由来である   … 焼けた空タイル・並木タイルの画素が **手続き版では
 *                                 出せない色**であること。手続き版の丘は 2 色の線形グラデ
 *                                 (#6c7674→#55605e) しか持たないので、行あたりの色数で判別する。
 *   C  onerror フォールバック    … 遠景 PNG だけ 404 にした状態でページを開き、
 *                                 (1) クラッシュしない (2) 空は依然として描かれる
 *                                 (3) _fieldFarImg / _fieldMidImg が null のまま
 *   D  空の末尾停止が露出しない  … 丘 PNG の下端が空タイル下端を全列で覆っており、
 *                                 FIELD_SKY_STOPS の末尾 2 停止 (暖色) が地平線際へ出ていないこと
 *
 * 使い方: node tools/driver_field_step6_png.js [--headful] [--browser <path>] [--port N]
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8841'), 10);
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
  '279ebe0a-1ba8-42b8-b4d8-84a7b01ea2bf', 'scratchpad', 'step6_png_shots'));

const FAR_SRC = '/assets/field_far_hills.png';
const MID_SRC = '/assets/field_mid_trees.png';
const FAR_W = 1536, FAR_H = 128, MID_W = 1024, MID_H = 72;
// 「1 行が線形グラデ由来か絵由来か」の境界。グラデはディザで数色出るが、絵は数百色出る。
const GRAD_MAX = 4;

const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
  waves: [{ count: 3, pool: ['goblin', 'goblinArcher'] }],
  wagonSpawns: [{ tx: 9, ty: 14 }],
};

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) {}
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
// break404: この配列に載っているパスだけ 404 を返す (C の onerror 経路を実際に踏むため)
let break404 = [];
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      if (break404.indexOf(u) >= 0) { res.statusCode = 404; res.end('404'); return; }
      const fp = path.join(ROOT, u);
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
      res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(fp).pipe(res);
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
function mark(m) { console.log('[drv] ' + (++step) + ' ' + m); }

function prelude(payload) {
  try {
    sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(payload));
    sessionStorage.removeItem('dragonfighters.currentScenario');
    sessionStorage.removeItem('dragonfighters.questFlags');
  } catch (e) {}
}

async function boot(browser, url, vp, net) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('response', r => { if (r.status() === 404) net.push(r.url()); });
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, CARAVAN_PAYLOAD);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof renderMap === 'function' && !!mapData && !!mapCanvas; } catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
  return { page, pageErrors };
}

// 焼けたタイルの中身を返す。手続き版と PNG 版を「行あたりの色数」で見分ける。
function probeTiles() {
  const P = {};
  P.state = function () {
    const o = {};
    try { o.farImg = !!_fieldFarImg; } catch (e) { o.farImg = '<none>'; }
    try { o.midImg = !!_fieldMidImg; } catch (e) { o.midImg = '<none>'; }
    try { o.farW = _fieldFarImg ? _fieldFarImg.naturalWidth : 0; } catch (e) { o.farW = -1; }
    try { o.farH = _fieldFarImg ? _fieldFarImg.naturalHeight : 0; } catch (e) { o.farH = -1; }
    try { o.midW = _fieldMidImg ? _fieldMidImg.naturalWidth : 0; } catch (e) { o.midW = -1; }
    try { o.midH = _fieldMidImg ? _fieldMidImg.naturalHeight : 0; } catch (e) { o.midH = -1; }
    try { o.farSrc = _fieldFarImg ? _fieldFarImg.getAttribute('src') : ''; } catch (e) { o.farSrc = ''; }
    try { o.midSrc = _fieldMidImg ? _fieldMidImg.getAttribute('src') : ''; } catch (e) { o.midSrc = ''; }
    try { o.skyOn = FIELD_SKY_ON; o.fieldMode = FIELD_MODE; o.geo = FIELD_GEO_ACTIVE; } catch (e) {}
    try { o.horizonPx = Math.round(FIELD_HORIZON_Y - camY); } catch (e) {}
    return o;
  };
  P.tileRowColors = function () {
    const out = {};
    const count = (cv, y) => {
      const cc = cv.getContext('2d', { willReadFrequently: true });
      const d = cc.getImageData(0, y, cv.width, 1).data;
      const s = {};
      for (let x = 0; x < cv.width; x++) s[d[x * 4] + ',' + d[x * 4 + 1] + ',' + d[x * 4 + 2] + ',' + d[x * 4 + 3]] = 1;
      return Object.keys(s).length;
    };
    const sky = getFieldSkyTile(Math.round(FIELD_HORIZON_Y - camY));
    const mid = getFieldMidTile();
    out.skyH = sky.height;
    out.skyRowNearBottom = count(sky, sky.height - 8);      // 丘の内部
    out.skyRowTop = count(sky, 2);                          // 純粋な空 (横一様なので必ず 1)
    out.midRowMid = count(mid, Math.floor(mid.height / 2));
    // 空タイル下端 62px に空グラデの末尾停止 (#928976 / #766e5a = R>G>B の暖色) が
    // 残っていないこと。丘・並木は G≥R なので暖色は空にしか出ない。
    const cc = sky.getContext('2d', { willReadFrequently: true });
    const y0 = Math.max(0, sky.height - 62);
    const d = cc.getImageData(0, y0, sky.width, sky.height - y0).data;
    let warm = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > d[i + 1] + 2) warm++;
    out.warmPxInBottom62 = warm;
    out.totalPxInBottom62 = d.length / 4;
    return out;
  };
  // 空矩形が一色でない = 何かが描かれている (フォールバック時の生存確認に使う)
  P.skyDistinct = function () {
    const H = Math.max(0, Math.min(Math.round(FIELD_HORIZON_Y - camY), mapCanvas.height));
    if (H <= 0) return { H: 0, colors: 0 };
    const c = document.createElement('canvas');
    c.width = mapCanvas.width; c.height = H;
    const cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(mapCanvas, 0, 0, c.width, H, 0, 0, c.width, H);
    const d = cc.getImageData(0, 0, c.width, H).data;
    const s = {};
    for (let i = 0; i < d.length; i += 4) s[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
    return { H: H, colors: Object.keys(s).length };
  };
  window.__probe = P;
  return true;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  let srv = null, browser = null;
  try {
    srv = await startServer(PORT);
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] ' + BASE + '  (' + ROOT + ')');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + path.join(os.tmpdir(), 'df_pptr_profile_step6png')],
    });
    const VP = { width: 1440, height: 900 };

    // ══ A / B / D: 正常系 ═════════════════════════════════════════════════════
    mark('A: PNG が実際に load され、描画に使われていること');
    {
      const net404 = [];
      const p = await boot(browser, BASE + '/index.html?intel=0', VP, net404);
      await p.page.evaluate(probeTiles);
      const st = await p.page.evaluate(() => window.__probe.state());
      check('(A1) 遠景 2 枚とも Image が非 null (load 済み)', st.farImg === true && st.midImg === true, JSON.stringify(st));
      check('(A2) 丘 PNG の実寸が ' + FAR_W + '×' + FAR_H, st.farW === FAR_W && st.farH === FAR_H,
        st.farW + '×' + st.farH);
      check('(A3) 並木 PNG の実寸が ' + MID_W + '×' + MID_H, st.midW === MID_W && st.midH === MID_H,
        st.midW + '×' + st.midH);
      check('(A4) src に ?v=1 が付いている (差替時のブラウザキャッシュ事故の防止)',
        /\?v=1$/.test(st.farSrc || '') && /\?v=1$/.test(st.midSrc || ''),
        st.farSrc + ' / ' + st.midSrc);
      check('(A5) 遠景アセットの 404 が 0 件', net404.filter(u => /field_(far|mid)_/.test(u)).length === 0,
        JSON.stringify(net404.slice(0, 5)));
      check('(A6) pageerror 0', p.pageErrors.length === 0, p.pageErrors.join(' | ') || 'none');

      mark('B: 焼けたタイルの中身が PNG 由来 (手続き版では出せない色数)');
      const t = await p.page.evaluate(() => window.__probe.tileRowColors());
      // ⚠️ 「単色」= 1 色ではない。Chrome は createLinearGradient をバンディング回避のため
      //    **横方向にディザ**するので、横一様なはずの空グラデでも 1 行に 2 色出る (実測)。
      //    絵 (PNG) との差は 2 色 vs 数百色と桁違いなので、境界は GRAD_MAX=4 で十分に安全。
      check('(B1) 空タイル上部の 1 行がほぼ単色 (空グラデは横一様 = 対照)',
        t.skyRowTop <= GRAD_MAX, 'colors=' + t.skyRowTop + ' (グラデのディザで最大 ' + GRAD_MAX + ')');
      check('(B2) 空タイル下部 (丘の内部) の 1 行が多色 = 線形グラデではない絵が焼かれている',
        t.skyRowNearBottom > 50, 'colors=' + t.skyRowNearBottom + '/1536 (手続き版なら 1)');
      check('(B3) 並木タイル中央の 1 行が多色 = PNG が焼かれている',
        t.midRowMid > 50, 'colors=' + t.midRowMid + '/1024');

      mark('D: 空グラデの末尾 2 停止 (暖色) が地平線際へ露出していないこと');
      check('(D1) 空タイル下端 62px に暖色 (R>G+2) の画素が 0 = 丘が全列を覆っている',
        t.warmPxInBottom62 === 0,
        '暖色 ' + t.warmPxInBottom62 + ' / ' + t.totalPxInBottom62 + 'px (skyH=' + t.skyH + ')');
      await p.page.screenshot({ path: path.join(SHOT_DIR, 'png_ok_desktop.png'), type: 'png' });
      await p.page.close();
    }

    // ══ C: onerror フォールバック ════════════════════════════════════════════
    mark('C: 遠景 PNG を 404 にして onerror 経路を実際に踏む');
    {
      break404 = [FAR_SRC, MID_SRC];
      const net404 = [];
      const p = await boot(browser, BASE + '/index.html?intel=0', VP, net404);
      await p.page.evaluate(probeTiles);
      const st = await p.page.evaluate(() => window.__probe.state());
      check('(C1) 遠景 PNG が実際に 404 になっている (この検査自体が空振りでない証拠)',
        net404.filter(u => /field_(far|mid)_/.test(u)).length === 2,
        JSON.stringify(net404.filter(u => /field_/.test(u))));
      check('(C2) _fieldFarImg / _fieldMidImg は null のまま (手続き版フォールバック)',
        st.farImg === false && st.midImg === false, JSON.stringify(st));
      check('(C3) pageerror 0 = onerror でクラッシュしない', p.pageErrors.length === 0,
        p.pageErrors.join(' | ') || 'none');
      const sd = await p.page.evaluate(() => window.__probe.skyDistinct());
      check('(C4) 空は依然として描かれている (空矩形が 20 色以上・背景一色ではない)',
        sd.H > 0 && sd.colors > 20, 'skyPx=' + sd.H + ' colors=' + sd.colors);
      const t = await p.page.evaluate(() => window.__probe.tileRowColors());
      check('(C5) 手続き版に落ちている (空タイル下部の 1 行がほぼ単色の線形グラデ)',
        t.skyRowNearBottom <= GRAD_MAX, 'colors=' + t.skyRowNearBottom + ' (PNG 版なら数百)');
      await p.page.screenshot({ path: path.join(SHOT_DIR, 'png_fallback_desktop.png'), type: 'png' });
      await p.page.close();
      break404 = [];
    }

    // ══ E: 性能アブレーション (PNG 版 vs 手続き版・**同一コード**) ═══════════════
    mark('E: フレーム時間 — PNG 版 vs 手続き版フォールバック (同一 index.html での A/B)');
    // ⚠️ driver_field_step3 の E は baseline を **STEP3 以前の rev** に置くので、測っているのは
    //    「空そのものの導入コスト」であって「PNG 化の増分」ではない。本 STEP が守るべきは
    //    index.html の「丘を別 α レイヤにすると 2.4 → 5.4ms へ倍増する」という警告なので、
    //    **同じコードで PNG の有無だけを入れ替えた**この A/B が正しい測り方になる。
    // ⚠️ **1 ページずつ測る。** 2 ページを同時に開くと、先に測った側がもう一方の setInterval を
    //    被って +2.8ms の偽値が出る (camera-perf / step3 E の恒久教訓)。
    {
      const perfOnce = async () => {
        const net = [];
        const p = await boot(browser, BASE + '/index.html?intel=0', VP, net);
        const r = await p.page.evaluate(() => {
          const t = [], tf = [];
          for (let i = 0; i < 6; i++) renderMap();
          for (let i = 0; i < 140; i++) {
            camX += 1;
            const a = performance.now(); renderMap(); const b = performance.now();
            ctx.getImageData(0, 0, 1, 1);
            const c2 = performance.now();
            t.push(b - a); tf.push(c2 - a);
          }
          const med = (x) => { const s = x.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
          return { jsMed: med(t), flushMed: med(tf) };
        });
        await p.page.close();
        return r;
      };
      // 順序バイアスを打ち消すため png→proc と proc→png の 2 巡を回して各々の最小中央値を採る
      break404 = [];              const png1 = await perfOnce();
      break404 = [FAR_SRC, MID_SRC]; const proc1 = await perfOnce();
      break404 = [FAR_SRC, MID_SRC]; const proc2 = await perfOnce();
      break404 = [];              const png2 = await perfOnce();
      break404 = [];
      const pick = (x, y) => ({ jsMed: Math.min(x.jsMed, y.jsMed), flushMed: Math.min(x.flushMed, y.flushMed) });
      const png = pick(png1, png2), proc = pick(proc1, proc2);
      const dFl = png.flushMed - proc.flushMed, dJs = png.jsMed - proc.jsMed;
      console.log('    flush 込み 中央値  手続き=' + proc.flushMed.toFixed(3) + 'ms  PNG=' + png.flushMed.toFixed(3)
        + 'ms  Δ=' + (dFl >= 0 ? '+' : '') + dFl.toFixed(3) + 'ms');
      check('(E1) PNG 化による flush 込みフレーム時間の悪化が 0.5ms 未満',
        dFl < 0.5, '手続き=' + proc.flushMed.toFixed(3) + 'ms PNG=' + png.flushMed.toFixed(3)
        + 'ms Δ=' + dFl.toFixed(3) + 'ms (JS Δ=' + dJs.toFixed(3) + 'ms, n=140×2巡)');
    }
  } catch (e) {
    console.error('[drv] 例外: ' + (e && e.stack || e));
    check('DRIVER 例外なし', false, String(e && e.message || e));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }
  const pass = results.filter(r => r.ok).length;
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  RESULT: ' + pass + '/' + results.length + (pass === results.length ? '  ALL PASS' : '  ** FAIL **'));
  for (const r of results) if (!r.ok) console.log('   FAIL  ' + r.name + '  — ' + r.detail);
  console.log('  shots: ' + SHOT_DIR);
  console.log('════════════════════════════════════════════════════════');
  process.exit(pass === results.length ? 0 : 1);
})();
