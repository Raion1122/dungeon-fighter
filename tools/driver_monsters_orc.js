#!/usr/bin/env node
/*
 * driver_monsters_orc.js — 6.27版 新規モンスター 項目1「オーク刷新」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ENEMY_TYPES.orc の幾何を旧 32px/10col → 現行 96px/6col (orcGrunt_anim.png 流用,
 * 576×480) へ差し替えた変更が、描画破綻・pageerror を起こさないことを確認する。
 * ENEMY_TYPES/戦闘関数は IIFE 内 const で window 非公開のため、フルの index.html を
 * ?scen=dragon-lair (spawns に orc 複数) でロードし、生成済み .enemy-orc の DOM から
 * 観測する (createEnemyDom がインラインで width/backgroundSize を確定させる)。
 *
 * 検証項目:
 *   (a) dragon-lair ロードで pageerror ゼロ
 *   (b) .enemy-orc 要素が生成される (>=1)
 *   (c) orc の backgroundImage が orcGrunt_anim.png を指す (?v= 付き)
 *   (d) 幾何が破綻していない: displaySize=82 → width/height≈82px,
 *       backgroundSize = round(576*82/96)×round(480*82/96) = 492×410 (単一フレーム幅より大)
 *   (e) __diag.getReport(): critical / js-error ゼロ
 *   (f) index.html?scen=goblin-mine スモーク (orc 不在の別シナリオも健全・回帰) pageerror ゼロ
 *
 * 使い方:  node tools/driver_monsters_orc.js [--headful] [--browser <path>] [--port N]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8795'), 10);

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
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(PORT, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✅' : '  ❌') + ' ' + name + (detail ? '  — ' + detail : ''));
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_orc_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + profile],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  // ── (a)-(e) dragon-lair (spawns に orc 複数) をロード ──
  const drErrBefore = pageErrors.length;
  await page.goto('http://localhost:' + PORT + '/index.html?scen=dragon-lair&autoplay=15&autodebug=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  // enemies.forEach(createEnemyDom) は IIFE 初期化時に走る → 早めに .enemy-orc を掴む
  let orcSeen = false;
  try { await page.waitForSelector('.enemy-orc', { timeout: 15000 }); orcSeen = true; } catch (e) {}
  const drNewErrs = pageErrors.slice(drErrBefore);
  check('(a) dragon-lair ロードで pageerror ゼロ', drNewErrs.length === 0,
    drNewErrs.length ? drNewErrs.join(' | ') : '');

  const geo = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.enemy-orc'));
    if (!els.length) return { count: 0 };
    const el = els[0];
    // createEnemyDom がインラインで確定 (アニメは backgroundPosition のみ変更、寸法は不変)
    const bgImg = el.style.backgroundImage || '';
    const bgSize = el.style.backgroundSize || '';
    const w = parseFloat(el.style.width) || 0;
    const h = parseFloat(el.style.height) || 0;
    const m = bgSize.match(/([\d.]+)px\s+([\d.]+)px/);
    return {
      count: els.length,
      bgImg, bgSize, w, h,
      bgW: m ? parseFloat(m[1]) : 0,
      bgH: m ? parseFloat(m[2]) : 0,
    };
  });
  check('(b) .enemy-orc 要素が生成される (>=1)', geo.count >= 1, 'count=' + geo.count);
  check('(c) backgroundImage が orcGrunt_anim.png (?v=付き)',
    /orcGrunt_anim\.png\?v=/.test(geo.bgImg), 'bgImg=' + geo.bgImg);
  // 期待幾何: scale=82/96 → width≈82, backgroundSize=492×410 (シート全体 = 単一フレーム幅の6倍相当)
  const wOk = Math.abs(geo.w - 82) <= 2 && Math.abs(geo.h - 82) <= 2;
  check('(d) 表示寸法 ≈82px (displaySize=82)', wOk, 'w=' + geo.w + ' h=' + geo.h);
  const bgOk = Math.abs(geo.bgW - 492) <= 2 && Math.abs(geo.bgH - 410) <= 2 && geo.bgW > geo.w;
  check('(d) backgroundSize ≈492×410 (シート全体・破綻なし)', bgOk,
    'bgSize=' + geo.bgSize + ' (単一フレーム幅 ' + geo.w + 'px より大)');

  const diag = await page.evaluate(() => {
    if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
    const r = window.__diag.getReport();
    const cur = r.current || {};
    const viol = cur.violations || {};
    return {
      criticals: (r.totals && r.totals.criticals) || 0,
      jsErr: !!viol['js-error'],
      jsRej: !!viol['js-rejection'],
      violIds: Object.keys(viol),
    };
  });
  check('(e) __diag: critical ゼロ + js-error なし',
    !diag.noDiag && diag.criticals === 0 && !diag.jsErr && !diag.jsRej,
    diag.noDiag ? 'no __diag' : ('criticals=' + diag.criticals + ' viol=[' + diag.violIds.join(',') + ']'));

  // ── (f) 別シナリオ (orc 不在) スモーク: goblin-mine を清潔にロードできるか (回帰) ──
  const gmErrBefore = pageErrors.length;
  await page.goto('http://localhost:' + PORT + '/index.html?scen=goblin-mine&autoplay=15&autodebug=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const gmNewErrs = pageErrors.slice(gmErrBefore);
  check('(f) goblin-mine スモーク pageerror ゼロ (回帰)', gmNewErrs.length === 0,
    gmNewErrs.length ? gmNewErrs.join(' | ') : '');

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  if (!orcSeen) console.log('[driver] note: .enemy-orc の待機がタイムアウト (要調査)');
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
