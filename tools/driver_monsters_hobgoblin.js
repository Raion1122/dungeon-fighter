#!/usr/bin/env node
/*
 * driver_monsters_hobgoblin.js — 6.27版 新規モンスター 項目2「ホブゴブリン」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ENEMY_TYPES.hobgoblin (goblin シート流用, disciplined + packTactics) と、新規共有
 * ヘルパー nearbyAlliedEnemies / effectiveEnemyAc の disciplined 拡張、攻撃ツイン2箇所
 * (leader/ally) に加えた pack(+2) / disciplined(+1) 命中ボーナスを検証する。
 *
 * ENEMY_TYPES/戦闘関数は IIFE 内 const で window 非公開のため、フルの index.html を
 * ロードして観測する。命中ボーナスの内訳は本番挙動を変えない dev プローブ
 * window.__traitProbe(seed 時のみ push・既定 undefined で no-op)で読む。
 *
 * 検証項目:
 *   (a) ?scen=goblin-mine で pageerror ゼロ + .enemy-hobgoblin DOM 生成 (>=1)
 *   (b) backgroundImage=goblin_anim.png?v= / 幾何健全: displaySize=74 →
 *       width≈74, backgroundSize=round(480*74/96)=370 ×370 (単一フレーム幅より大)
 *   (c) __diag: critical / js-error ゼロ
 *   (d) 密集配置 (2x2 の hobgoblin 4体) で pack=+2 かつ disc=+1 が内訳に出る
 *   (e) 孤立配置 (単体 hobgoblin, 遠方に非隣接の1体) で pack/disc が常に 0
 *   (f) 回帰: index.html?autoplay=15 スモークで pageerror ゼロ
 *
 * 使い方:  node tools/driver_monsters_hobgoblin.js [--headful] [--browser <path>] [--port N]
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
const PORT = parseInt(arg('port', '8796'), 10);

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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// __traitProbe(命中内訳) を集計 (ホブゴブリン分のみ)
async function aggProbe(page) {
  return page.evaluate(() => {
    const p = (window.__traitProbe || []).filter(e => e && e.name === 'ホブゴブリン');
    let maxPack = 0, maxDisc = 0, allZero = true;
    for (const e of p) {
      if (e.pack > maxPack) maxPack = e.pack;
      if (e.disc > maxDisc) maxDisc = e.disc;
      if (e.pack !== 0 || e.disc !== 0) allZero = false;
    }
    return { n: p.length, maxPack, maxDisc, allZero };
  });
}

// __acProbe(実効AC) を集計 (ホブゴブリン分のみ)。パーティが敵を攻撃する度に記録され、
// 敵が撃破される前=ラウンド1から確実に発火するため、命中プローブより堅牢。
async function aggAc(page) {
  return page.evaluate(() => {
    const p = (window.__acProbe || []).filter(e => e && e.name === 'ホブゴブリン');
    let maxAc = 0, minAc = 999;
    for (const e of p) { if (e.ac > maxAc) maxAc = e.ac; if (e.ac < minAc) minAc = e.ac; }
    return { n: p.length, maxAc, minAc: p.length ? minAc : 0 };
  });
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_hob_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + profile],
  });
  const pageErrors = [];

  // ── (a)-(c) goblin-mine (spawns に hobgoblin) をロード ──
  const page1 = await browser.newPage();
  page1.on('pageerror', e => pageErrors.push('[render] ' + e.message));
  const rErrBefore = pageErrors.length;
  await page1.goto('http://localhost:' + PORT + '/index.html?scen=goblin-mine&autoplay=15&autodebug=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  let hobSeen = false;
  try { await page1.waitForSelector('.enemy-hobgoblin', { timeout: 15000 }); hobSeen = true; } catch (e) {}
  const rNewErrs = pageErrors.slice(rErrBefore);
  check('(a) goblin-mine ロードで pageerror ゼロ', rNewErrs.length === 0, rNewErrs.join(' | '));

  const geo = await page1.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.enemy-hobgoblin'));
    if (!els.length) return { count: 0 };
    const el = els[0];
    const bgImg = el.style.backgroundImage || '';
    const bgSize = el.style.backgroundSize || '';
    const w = parseFloat(el.style.width) || 0;
    const h = parseFloat(el.style.height) || 0;
    const m = bgSize.match(/([\d.]+)px\s+([\d.]+)px/);
    return { count: els.length, bgImg, bgSize, w, h, bgW: m ? parseFloat(m[1]) : 0, bgH: m ? parseFloat(m[2]) : 0 };
  });
  check('(a) .enemy-hobgoblin 要素が生成される (>=1)', geo.count >= 1, 'count=' + geo.count);
  check('(b) backgroundImage が goblin_anim.png (?v=付き・借用)',
    /goblin_anim\.png\?v=/.test(geo.bgImg), 'bgImg=' + geo.bgImg);
  const wOk = Math.abs(geo.w - 74) <= 2 && Math.abs(geo.h - 74) <= 2;
  check('(b) 表示寸法 ≈74px (displaySize=74)', wOk, 'w=' + geo.w + ' h=' + geo.h);
  const bgOk = Math.abs(geo.bgW - 370) <= 2 && Math.abs(geo.bgH - 370) <= 2 && geo.bgW > geo.w;
  check('(b) backgroundSize ≈370×370 (借用元幾何に一致・破綻なし)', bgOk,
    'bgSize=' + geo.bgSize + ' (単一フレーム幅 ' + geo.w + 'px より大)');

  const diag = await page1.evaluate(() => {
    if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
    const r = window.__diag.getReport();
    const viol = (r.current || {}).violations || {};
    return { criticals: (r.totals && r.totals.criticals) || 0, jsErr: !!viol['js-error'], jsRej: !!viol['js-rejection'], violIds: Object.keys(viol) };
  });
  check('(c) __diag: critical ゼロ + js-error なし',
    !diag.noDiag && diag.criticals === 0 && !diag.jsErr && !diag.jsRej,
    diag.noDiag ? 'no __diag' : ('criticals=' + diag.criticals + ' viol=[' + diag.violIds.join(',') + ']'));
  await page1.close();

  // ── (d) 密集配置: 2x2 の hobgoblin 4体 → pack=+2 かつ disc=+1 が出るか ──
  const CLUSTER = [['hobgoblin', 7, 13], ['hobgoblin', 8, 13], ['hobgoblin', 7, 14], ['hobgoblin', 8, 14]];
  const page2 = await browser.newPage();
  page2.on('pageerror', e => pageErrors.push('[cluster] ' + e.message));
  await page2.evaluateOnNewDocument((spawns) => {
    try { sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'trait probe cluster', flavor: '', spawns })); } catch (e) {}
    window.__traitProbe = [];
    window.__acProbe = [];
  }, CLUSTER);
  await page2.goto('http://localhost:' + PORT + '/index.html?autoplay=20', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let cAgg = { n: 0, maxPack: 0, maxDisc: 0, allZero: true };
  let cAc = { n: 0, maxAc: 0, minAc: 0 };
  for (let i = 0; i < 240; i++) {   // 最大 ~72s
    cAgg = await aggProbe(page2);
    cAc = await aggAc(page2);
    if (cAgg.maxPack === 2 && cAgg.maxDisc === 1 && cAc.maxAc === 17) break;
    await sleep(300);
  }
  check('(d) 密集配置で hobgoblin が攻撃/被攻撃した (probe 記録あり)', cAgg.n >= 1 || cAc.n >= 1,
    'atk=' + cAgg.n + ' ac=' + cAc.n);
  check('(d) 密集配置で pack ボーナス +2 が命中内訳に出る', cAgg.maxPack === 2, 'maxPack=' + cAgg.maxPack);
  check('(d) 密集配置で disciplined +1命中 が命中内訳に出る', cAgg.maxDisc === 1, 'maxDisc=' + cAgg.maxDisc);
  check('(d) 密集配置で disciplined +1AC が実効ACに出る (16→17)', cAc.maxAc === 17,
    'maxAc=' + cAc.maxAc + ' (base 16 +1)');
  await page2.close();

  // ── (e) 孤立配置: 単体 hobgoblin → 味方の敵が皆無なので pack/disc は常に 0、実効AC=16 ──
  //     パーティが敵を攻撃する度に __acProbe が発火 (撃破前=ラウンド1から確実) するため、
  //     敵が反撃前に倒れても負のケースを確定的に観測できる。
  const ISOLATED = [['hobgoblin', 9, 13]];
  const page3 = await browser.newPage();
  page3.on('pageerror', e => pageErrors.push('[isolated] ' + e.message));
  await page3.evaluateOnNewDocument((spawns) => {
    try { sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'trait probe isolated', flavor: '', spawns })); } catch (e) {}
    window.__traitProbe = [];
    window.__acProbe = [];
  }, ISOLATED);
  await page3.goto('http://localhost:' + PORT + '/index.html?autoplay=20', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let iAc = { n: 0, maxAc: 0, minAc: 0 };
  let iAgg = { n: 0, maxPack: 0, maxDisc: 0, allZero: true };
  for (let i = 0; i < 160; i++) {   // 最大 ~48s
    iAc = await aggAc(page3);
    iAgg = await aggProbe(page3);
    if (iAc.n >= 3) break;
    await sleep(300);
  }
  check('(e) 孤立配置でパーティが hobgoblin を攻撃した (acProbe 記録あり)', iAc.n >= 1, 'entries=' + iAc.n);
  check('(e) 孤立配置では実効AC=16 のみ (disciplined +1AC が出ない)',
    iAc.n >= 1 && iAc.minAc === 16 && iAc.maxAc === 16, 'minAc=' + iAc.minAc + ' maxAc=' + iAc.maxAc);
  check('(e) 孤立配置で hobgoblin が反撃したなら pack/disc は常に 0',
    iAgg.allZero, 'atkN=' + iAgg.n + ' maxPack=' + iAgg.maxPack + ' maxDisc=' + iAgg.maxDisc);
  await page3.close();

  // ── (f) 回帰: 素の index.html?autoplay=15 スモーク ──
  const page4 = await browser.newPage();
  page4.on('pageerror', e => pageErrors.push('[smoke] ' + e.message));
  const sErrBefore = pageErrors.length;
  await page4.goto('http://localhost:' + PORT + '/index.html?autoplay=15&autodebug=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  const sNewErrs = pageErrors.slice(sErrBefore);
  check('(f) index.html?autoplay スモーク pageerror ゼロ (回帰)', sNewErrs.length === 0, sNewErrs.join(' | '));
  await page4.close();

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  if (!hobSeen) console.log('[driver] note: .enemy-hobgoblin の待機がタイムアウト');
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
