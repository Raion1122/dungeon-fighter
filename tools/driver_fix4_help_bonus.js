#!/usr/bin/env node
/*
 * driver_fix4_help_bonus.js — 6.27版修正指示書 項目4「代表者＋Help方式」の回帰ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * js/skill-check.js に追加した Help（手伝い）ボーナスを検証する。検証手順はメモリ
 * 「ゲーム変更のヘッドレス検証手順」準拠: about:blank に addScriptTag でエンジン単体を注入。
 *
 * 検証項目:
 *   (1) selectHelper: rep を除く最良メンバー1名を返す ([dwarf,mage,rogue]知覚 → 補助=mage)
 *   (2) selectHelper: 1人パーティでは null（Help なし）
 *   (3) checkScoreBreakdown(rep,cd,0,2).help===2 かつ total===checkScore(rep)+2
 *   (4) 後方互換: 3引数 checkScoreBreakdown(m,cd,0).total === checkScore(m,cd) (help=0)
 *   (5) Help 算入: 2人パーティ total − 1人パーティ total === ちょうど +2
 *   (6) クランプ: 4人パーティ total === 2人パーティ total（人数が増えても Help は1名分=+2のみ）
 *   (7) パネルUI: 補助役行に .scRow.helper + 🤝、meta に「補助」、代表行 mod に「助+2」
 *   (8) tavern.html スモーク: SkillCheck 健全 + pageerror なし（共有パネル非破壊）
 *
 * 使い方:  node tools/driver_fix4_help_bonus.js [--headful] [--browser <path>]
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
const PORT = parseInt(arg('port', '8793'), 10);

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

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_fix4_'));
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
  const hasEngine = await page.evaluate(() =>
    !!(window.SkillCheck && SkillCheck.resolveSkillCheck && SkillCheck.selectHelper
       && SkillCheck.HELP_BONUS === 2));
  check('engine loaded + selectHelper/HELP_BONUS 公開 (=2)', hasEngine, 'HELP_BONUS=' +
    (await page.evaluate(() => window.SkillCheck && SkillCheck.HELP_BONUS)));

  // (1)(2) selectHelper
  const sh = await page.evaluate(() => {
    const cd = SkillCheck.CHECKS.perception;
    const mk = (c, n) => ({ classKey: c, name: n });
    const p3 = [mk('dwarf', 'グリム'), mk('mage', 'アル'), mk('rogue', 'リーザ')];
    const rep = SkillCheck.selectRepresentative(p3, cd);
    const helper = SkillCheck.selectHelper(p3, cd, rep);
    const dwarf = mk('dwarf', 'グリム');
    const solo = SkillCheck.selectHelper([dwarf], cd, dwarf);
    return { repName: rep && rep.name, helperName: helper && helper.name, soloNull: solo === null };
  });
  check('(1) 代表=グリム(dwarf), 補助=アル(mage) [rep除く最良]',
    sh.repName === 'グリム' && sh.helperName === 'アル',
    'rep=' + sh.repName + ' helper=' + sh.helperName);
  check('(2) 1人パーティで selectHelper===null', sh.soloNull === true);

  // (3)(4) checkScoreBreakdown
  const bd = await page.evaluate(() => {
    const cd = SkillCheck.CHECKS.perception;
    const dwarf = { classKey: 'dwarf', name: 'グリム' };
    const score = SkillCheck.checkScore(dwarf, cd);
    const b4 = SkillCheck.checkScoreBreakdown(dwarf, cd, 0, 2);
    const b3 = SkillCheck.checkScoreBreakdown(dwarf, cd, 0);
    return { score, help: b4.help, total4: b4.total, total3: b3.total };
  });
  check('(3) breakdown.help===2 かつ total===checkScore+2',
    bd.help === 2 && bd.total4 === bd.score + 2,
    'score=' + bd.score + ' help=' + bd.help + ' total4=' + bd.total4);
  check('(4) 後方互換: 3引数 breakdown.total===checkScore (help=0)',
    bd.total3 === bd.score, 'total3=' + bd.total3 + ' score=' + bd.score);

  // (5)(6) Help 算入 + クランプ（autoplay で d20 を固定）
  const num = await page.evaluate(async () => {
    const cd = SkillCheck.CHECKS.perception;
    const mk = (c, n) => ({ classKey: c, name: n });
    const dwarf = mk('dwarf', 'グリム');
    const orig = Math.random;
    Math.random = () => 0.5;   // d20 = 1 + floor(0.5*20) = 11 固定
    const run = (party) => SkillCheck.resolveSkillCheck('perception', 14, party, { auto: true });
    const o1 = await run([dwarf]);
    const o2 = await run([dwarf, mk('mage', 'アル')]);
    const o4 = await run([dwarf, mk('mage', 'アル'), mk('rogue', 'リーザ'), mk('warrior', 'ロウ')]);
    Math.random = orig;
    const repScore = SkillCheck.checkScore(dwarf, cd);
    return {
      roll: o1.roll, repScore,
      t1: o1.total, t2: o2.total, t4: o4.total,
      h1: o1.helper ? o1.helper.name : null,
      h2: o2.helper ? o2.helper.name : null,
      h4: o4.helper ? o4.helper.name : null,
    };
  });
  check('(5) Help 算入: 2人total − 1人total === +2',
    (num.t2 - num.t1) === 2, 't1=' + num.t1 + ' t2=' + num.t2 + ' (roll=' + num.roll + ' repScore=' + num.repScore + ')');
  check('(6) クランプ: 4人total === 2人total (人数増でも Help は1名分=+2)',
    num.t4 === num.t2 && (num.t4 - num.roll - num.repScore) === 2,
    't2=' + num.t2 + ' t4=' + num.t4 + ' help分=' + (num.t4 - num.roll - num.repScore));
  check('(6) outcome.helper: 1人=null / 2人=アル / 4人=アル',
    num.h1 === null && num.h2 === 'アル' && num.h4 === 'アル',
    'h1=' + num.h1 + ' h2=' + num.h2 + ' h4=' + num.h4);

  // (7) パネルUI: 補助役行 + meta + 代表行 mod
  const ui = await page.evaluate(async () => {
    const mk = (c, n) => ({ classKey: c, name: n });
    const party = [mk('dwarf', 'グリム'), mk('mage', 'アル'), mk('rogue', 'リーザ')];
    const p = SkillCheck.resolveSkillCheck('perception', 14, party, {});  // 非auto → パネル表示
    await new Promise(r => setTimeout(r, 90));
    const BADGE = '🤝';  // 握手バッジ
    const helperRow = document.querySelector('#skillCheckOverlay .scRow.helper');
    const helperName = helperRow ? (helperRow.querySelector('.scName').textContent || '') : '';
    const metaTxt = (document.querySelector('#skillCheckOverlay .scMeta') || {}).textContent || '';
    const repMod = (document.querySelector('#skillCheckOverlay .scRow.rep .scMod') || {}).textContent || '';
    // 閉じる: ロール → アニメ・結果 → クリックで promise 解決
    const btn = document.getElementById('scRollBtn'); if (btn) btn.click();
    await new Promise(r => setTimeout(r, 2000));
    const ov = document.getElementById('skillCheckOverlay'); if (ov) ov.click();
    await p;
    return {
      hasHelperRow: !!helperRow,
      badge: helperName.indexOf(BADGE) >= 0,
      metaHasHojo: metaTxt.indexOf('補助') >= 0,
      repModHasHelp: repMod.indexOf('助+2') >= 0,
      helperName, metaTxt, repMod,
    };
  });
  check('(7) 補助役行に .scRow.helper + 🤝', ui.hasHelperRow && ui.badge, 'name=' + JSON.stringify(ui.helperName));
  check('(7) meta に「補助」表示', ui.metaHasHojo, 'meta=' + JSON.stringify(ui.metaTxt));
  check('(7) 代表行 mod に「助+2」', ui.repModHasHelp, 'repMod=' + JSON.stringify(ui.repMod));

  // (8) tavern.html スモーク: SkillCheck 健全 + pageerror なし
  const tavernErrBefore = pageErrors.length;
  await page.goto('http://localhost:' + PORT + '/tavern.html?autoplay=15', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  const tavernEngine = await page.evaluate(() =>
    !!(window.SkillCheck && typeof SkillCheck.selectHelper === 'function'
       && typeof SkillCheck.resolveSkillCheck === 'function'));
  const tavernNewErrs = pageErrors.slice(tavernErrBefore);
  check('(8) tavern.html で SkillCheck.selectHelper 健全', tavernEngine);
  check('(8) tavern.html 読込で pageerror なし', tavernNewErrs.length === 0,
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
