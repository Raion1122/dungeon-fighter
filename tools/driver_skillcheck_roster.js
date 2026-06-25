#!/usr/bin/env node
/*
 * driver_skillcheck_roster.js — 技能判定パネル「パーティ全員ロール」UX強化の回帰ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * js/skill-check.js の改修を検証する。検証手順はメモリ「ゲーム変更のヘッドレス検証手順」準拠:
 *   - エンジン単体: about:blank に addScriptTag で js/skill-check.js を注入 (ゲーム本体不要)。
 *   - 統合スモーク: http サーバ経由で tavern.html を読み、SkillCheck 健全性を確認。
 *   - 実 Chrome/Edge を puppeteer-core でヘッドレス駆動 (--no-sandbox + 毎回新規プロファイル)。
 *
 * 検証項目:
 *   (a) N人パーティ → .scRoster .scRow が N 行
 *   (b) 代表行が .scRow.rep + ★ でマークされる
 *   (c) バランス不変: Math.random をスタブし rep=2 / 非rep=20 を強制 →
 *       outcome.success===false かつ outcome.roll===2 (非rep の高出目は成否に無関与)
 *   (d) __autoplay 時はパネルが一切出ない (overlay に show が付かない) + 即時解決
 *   (e) tavern.html?autoplay 読込で SkillCheck が健全・pageerror なし (共有パネル非破壊)
 *   追加 (f) checkScoreBreakdown.total === checkScore (全 CHECKS × 全クラス)
 *   追加 (g) 代表行の表示合計 === outcome.total (表示と判定の一致)
 *
 * 使い方:  node tools/driver_skillcheck_roster.js [--headful] [--browser <path>]
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
const PORT = parseInt(arg('port', '8791'), 10);

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

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_sc_roster_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + profile],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  // ── エンジン単体: about:blank に注入 ──
  await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(ROOT, 'js', 'skill-check.js') });
  const hasEngine = await page.evaluate(() => !!(window.SkillCheck && SkillCheck.resolveSkillCheck));
  check('engine loaded on about:blank', hasEngine);

  // (f) checkScoreBreakdown.total === checkScore (全組合せ)
  const fRes = await page.evaluate(() => {
    const checks = Object.keys(SkillCheck.CHECKS);
    const classes = Object.keys(SkillCheck.CLASS_ABILITIES);
    for (const ck of checks) for (const cls of classes) {
      const m = { classKey: cls, name: cls };
      const cd = SkillCheck.CHECKS[ck];
      const score = SkillCheck.checkScore(m, cd);
      const total = SkillCheck.checkScoreBreakdown(m, cd, 0).total;
      if (total !== score) return { ok: false, ck, cls, score, total };
    }
    return { ok: true };
  });
  check('(f) breakdown.total === checkScore (全CHECKS×全クラス)', fRes.ok,
    fRes.ok ? '' : JSON.stringify(fRes));

  // (a)(b)(c)(g) パネル: rep=2(低) / 非rep=20(高) を強制し、成否は rep のみで決まることを確認
  const panel = await page.evaluate(async () => {
    let i = 0; const seq = [0.05, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999];
    Math.random = () => seq[Math.min(i++, seq.length - 1)];   // 1st→d20=2, 以降→d20=20
    const party = [
      { classKey: 'dwarf', name: 'グリム' },   // 知覚最強 → 代表想定
      { classKey: 'mage',  name: 'アル' },
      { classKey: 'rogue', name: 'リーザ' },
    ];
    const p = SkillCheck.resolveSkillCheck('perception', 14, party, {});
    await new Promise(r => setTimeout(r, 60));
    const rowCount = document.querySelectorAll('#skillCheckOverlay .scRow').length;
    const repNameEl = document.querySelector('#skillCheckOverlay .scRow.rep .scName');
    const repName = repNameEl ? repNameEl.textContent : null;
    const repStar = !!repName && repName.indexOf('★') >= 0;
    // ロール実行
    const btn = document.getElementById('scRollBtn');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 2000));   // アニメ(~1.4s)+結果表示を待つ
    const repTotalTxt = (document.querySelector('#skillCheckOverlay .scRow.rep .scTotal') || {}).textContent || '';
    const refTotals = [].slice.call(document.querySelectorAll('#skillCheckOverlay .scRow.ref .scTotal')).map(e => e.textContent);
    const resultTxt = (document.querySelector('#skillCheckOverlay .scResult') || {}).textContent || '';
    // 閉じて promise を解決
    const ov = document.getElementById('skillCheckOverlay');
    if (ov) ov.click();
    const outcome = await p;
    return { rowCount, repName, repStar, repTotalTxt, refTotals, resultTxt, outcome };
  });
  check('(a) ロスター行数 === パーティ人数(3)', panel.rowCount === 3, 'rows=' + panel.rowCount);
  check('(b) 代表行が .scRow.rep + ★', panel.repStar, 'repName=' + JSON.stringify(panel.repName));
  check('(c) バランス不変: rep の roll のみで成否 (success=false)',
    panel.outcome && panel.outcome.success === false, 'outcome=' + JSON.stringify(panel.outcome));
  check('(c) outcome.roll === 2 (代表の出目)', panel.outcome && panel.outcome.roll === 2,
    'roll=' + (panel.outcome && panel.outcome.roll));
  check('(c) 非rep の参考合計に 20+ が含まれる (高出目でも無関与)',
    panel.refTotals.some(t => parseInt(t, 10) >= 20), 'refTotals=' + JSON.stringify(panel.refTotals));
  check('(g) 代表行の表示合計 === outcome.total',
    panel.outcome && String(panel.outcome.total) === String(panel.repTotalTxt),
    'repTotal=' + panel.repTotalTxt + ' outcome.total=' + (panel.outcome && panel.outcome.total));

  // (d) autoplay: パネルを出さず即時解決
  const auto = await page.evaluate(async () => {
    window.__autoplay = 15;
    const party = [{ classKey: 'dwarf', name: 'グリム' }, { classKey: 'mage', name: 'アル' }];
    const o = await SkillCheck.resolveSkillCheck('perception', 14, party, {});
    const ov = document.getElementById('skillCheckOverlay');
    const shown = !!(ov && ov.classList.contains('show'));
    window.__autoplay = 0;
    return { resolved: !!o, hasRep: !!(o && o.rep), shown };
  });
  check('(d) autoplay 時は即時解決 (outcome 返る)', auto.resolved && auto.hasRep);
  check('(d) autoplay 時はパネル非表示 (show 無し)', auto.shown === false);

  // (e) tavern.html スモーク: SkillCheck 健全 + pageerror なし
  const tavernErrBefore = pageErrors.length;
  await page.goto('http://localhost:' + PORT + '/tavern.html?autoplay=15', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  const tavernEngine = await page.evaluate(() =>
    !!(window.SkillCheck && typeof SkillCheck.resolveSkillCheck === 'function'
       && typeof SkillCheck.checkScoreBreakdown === 'function'));
  const tavernNewErrs = pageErrors.slice(tavernErrBefore);
  check('(e) tavern.html で SkillCheck 健全', tavernEngine);
  check('(e) tavern.html 読込で pageerror なし', tavernNewErrs.length === 0,
    tavernNewErrs.length ? tavernNewErrs.join(' | ') : '');

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
