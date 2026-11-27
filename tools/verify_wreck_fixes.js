#!/usr/bin/env node
/*
 * verify_wreck_fixes.js — 近海の難破船 (sea-wreck) 検証2026-11-28 の表示修正を実機で確かめる。
 *   #2 forceCloseChoiceDialog の DOM 後始末 (本人 dismiss が無くても残骸 .show を畳む)
 *   #3 判定パネルの代表者名が切れない (左上 260px の corner パネルで長い名前がクリップしない / 旧 CSS では切れる = 負のコントロール)
 *   #4 依頼ダイアログの説明文の重複解消 (#dialogPlace が「近海の難破船 — 近海の難破船」でなく「— 海蝕洞の鱗の群れ」)
 *   (#1 は「別判定 (A2 知覚 + 部屋探索) が別の d20 を振るだけ = バグではない」ので probe_wreck_realplay.js で観測・ここでは扱わない)
 *
 * 使い方: node tools/verify_wreck_fixes.js [--headful] [--port 10764]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const has = (n) => argv.indexOf('--' + n) >= 0;
function arg(name, def) { const i = argv.indexOf('--' + name); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : def; }
const HEADFUL = has('headful');
const PORT = parseInt(arg('port', '10764'), 10);

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  if (process.env.PPTR_DIR) { try { return require(path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core')); } catch (e) {} }
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] ブラウザが見つかりません'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}

function SEED(cfg) {
  try {
    if (sessionStorage.getItem('__dfWreckVPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfWreckVPurged', '1');
  } catch (e) {}
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT);

  const profile = makeProfile('df_wreckv_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  const pageerr = [];
  page.on('pageerror', (e) => { if (pageerr.length < 12) pageerr.push(e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  await page.evaluateOnNewDocument(SEED, { cleared: ['goblin-mine', 'bandits-forest', 'lizard-swamp'], xp: 12000 });

  try {
    // ───────── #4 依頼ダイアログの重複解消 (tavern.html) ─────────
    await page.goto('http://localhost:' + PORT + '/tavern.html?dev=1&forcequest=sea-wreck&recruittalk=0', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof scenarios !== 'undefined' && typeof openDialog === 'function'", { timeout: 30000 });
    await sleep(200);
    const d4 = await page.evaluate(() => {
      const sc = scenarios.find(s => s.id === 'sea-wreck');
      openDialog(sc, true);
      const place = (document.getElementById('dialogPlace') || {}).textContent || '';
      return { place, title: sc.title, placeField: sc.place };
    });
    check('(#4a) sea-wreck の place と title が別語 (重複の根を断つ)', d4.placeField === '近海の難破船' && d4.title && d4.title !== d4.placeField, 'place=' + d4.placeField + ' title=' + d4.title);
    check('(#4b) 依頼ダイアログの説明が重複しない', d4.place.indexOf('近海の難破船 — 近海の難破船') < 0, 'dialogPlace=' + JSON.stringify(d4.place));
    check('(#4c) 依頼ダイアログの説明が「近海の難破船 — 海蝕洞の鱗の群れ」', /近海の難破船\s*—\s*海蝕洞の鱗の群れ/.test(d4.place), 'dialogPlace=' + JSON.stringify(d4.place));

    // ───────── #2 forceCloseChoiceDialog の DOM 後始末 + #3 名前クリップ (index.html) ─────────
    await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof forceCloseChoiceDialog === 'function' && typeof showChoice === 'function' && window.SkillCheck", { timeout: 30000 });
    await sleep(200);

    const d2 = await page.evaluate(() => {
      window.__autoplay = false;
      showChoice('見つけた罠を解除しますか?', '解除する', '迂回する');
      const before = (() => { const d = document.getElementById('choiceDialog'); return { show: !!(d && d.classList.contains('show')), btns: d ? d.querySelectorAll('.choiceButtons button').length : -1 }; })();
      // 本人の dismiss を握りつぶして「残骸だけ残った」状態を模す
      try { activeChoiceDismiss = null; } catch (e) {}
      forceCloseChoiceDialog();
      const after = (() => { const d = document.getElementById('choiceDialog'); return { show: !!(d && d.classList.contains('show')), choiceOpen: document.body.classList.contains('choice-open') }; })();
      return { before, after };
    });
    check('(#2a) 残骸ダイアログが出ていた (前提)', d2.before.show === true && d2.before.btns === 2, 'before=' + JSON.stringify(d2.before));
    check('(#2b) forceCloseChoiceDialog が残骸 .show を畳む (dismiss 無しでも)', d2.after.show === false && d2.after.choiceOpen === false, 'after=' + JSON.stringify(d2.after));

    const LONG = 'ファランドール・ロンガー';   // 旧レイアウトで必ず溢れる長さ
    async function measure(forceOldGrid) {
      return await page.evaluate(async (longName, oldGrid) => {
        window.__autoplay = false;
        document.documentElement.classList.add('dfCornerCheck');
        let st = document.getElementById('__oldGridTest');
        if (oldGrid) {
          if (!st) { st = document.createElement('style'); st.id = '__oldGridTest'; document.head.appendChild(st); }
          st.textContent = 'html.dfCornerCheck #skillCheckCard .scRow{grid-template-columns:1fr auto 20px 26px !important}'
            + '#skillCheckCard .scName{white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;overflow-wrap:normal !important;word-break:normal !important}';
        } else if (st) { st.remove(); }
        const party = [{ classKey: 'dwarf', name: longName }, { classKey: 'mage', name: 'アル' }];
        const p = window.SkillCheck.resolveSkillCheck('perception', 14, party, {});
        for (let i = 0; i < 40; i++) {
          const sk = document.getElementById('skillCheckOverlay');
          if (sk && sk.classList.contains('show') && sk.querySelector('.scRow.rep .scName')) break;
          await new Promise(r => setTimeout(r, 50));
        }
        const nameEl = document.querySelector('#skillCheckOverlay .scRow.rep .scName');
        const out = nameEl ? {
          text: nameEl.textContent, scrollW: nameEl.scrollWidth, clientW: nameEl.clientWidth,
          offsetH: nameEl.offsetHeight,
          clipped: nameEl.scrollWidth > nameEl.clientWidth + 1,
        } : null;
        const ov = document.getElementById('skillCheckOverlay');
        if (ov) ov.click();
        try { await p; } catch (e) {}
        return out;
      }, LONG, forceOldGrid);
    }
    const mNew = await measure(false);
    const mOld = await measure(true);
    console.log('  [#3 new] ' + JSON.stringify(mNew));
    console.log('  [#3 old] ' + JSON.stringify(mOld));
    check('(#3a) 新レイアウト: 代表者名がクリップしない (折り返し含め横切れ無し)', !!(mNew && mNew.clipped === false), 'new=' + JSON.stringify(mNew));
    check('(#3b) 代表者名の全文が表示される (省略の … で欠けない)', !!(mNew && mNew.text && mNew.text.indexOf(LONG) >= 0), 'text=' + (mNew ? JSON.stringify(mNew.text) : 'null'));
    check('(#3-neg) 負のコントロール: 旧 1fr auto レイアウトでは同じ名前が切れる', !!(mOld && mOld.clipped === true), 'old=' + JSON.stringify(mOld));

    check('(Z) pageerror 0', pageerr.length === 0, pageerr.length ? JSON.stringify(pageerr) : 'none');
  } catch (e) {
    check('(FATAL) 例外なく通し', false, String((e && e.message) || e));
  } finally {
    await browser.close(); srv.close();
  }

  const pass = results.filter(r => r.ok).length, total = results.length;
  console.log('\n  ' + pass + '/' + total + (pass === total ? '  PASSED   FAILED 0' : '  FAILED ' + (total - pass)));
  process.exit(pass === total ? 0 : 1);
})();
