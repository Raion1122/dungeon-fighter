#!/usr/bin/env node
/*
 * probe_choice_reset.js — showChoice(2ボタン) が showCharChoice(多択) の残骸ボタンを引き継がないことを実測する回帰台。
 *   (ブリッジ依頼 問題2(a): 罠ダイアログに入口の「封印の術式を読み解く(魔法学)」が紛れ込む不具合の修正検証)
 *
 * 併せて index.html / tavern.html の pageerror を拾い、今回の修正でページが壊れていないかを見る。
 * 使い方: node tools/probe_choice_reset.js [--port 10951]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
function arg(name, def) { const i = argv.indexOf('--' + name); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : def; }
const PORT = parseInt(arg('port', '10951'), 10);

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
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

(async () => {
  const puppeteer = loadPuppeteer();
  let srv;
  try { srv = await startServer(PORT); } catch (e) { console.error('[drv] ポート失敗: ' + e.message); process.exit(2); }
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio', '--user-data-dir=' + makeProfile('df_choice_')] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  await page.setViewport({ width: 1280, height: 860 });

  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  [PASS] ' + name); } else { fail++; console.log('  [FAIL] ' + name + (extra ? '  ' + extra : '')); } };

  // ── index.html を素で開く (pageerror チェック) ──
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForFunction("typeof showChoice==='function' && typeof showCharChoice==='function'", { timeout: 30000 }); } catch (e) {}
  await sleep(300);

  // 2(a) の再現: showCharChoice で多択ボタンを積む → showChoice を呼ぶ → 残骸が消えているか
  const res = await page.evaluate(() => {
    const out = {};
    try {
      // autoplay を切って本当に DOM を作らせる
      window.__autoplay = false;
      // 入口の技能判定を模す (候補 2 + キャンセル = 3 ボタン、"封印…" を含む)
      showCharChoice("入口", [{ label: "術式に触れず先へ進む" }, { label: "封印の術式を読み解く(魔法学)" }], "立ち去る (Esc)");
      const dlg1 = document.getElementById("choiceDialog");
      out.afterCharChoice = dlg1 ? dlg1.querySelectorAll(".choiceButtons button").length : -1;
      // ダイアログを閉じる口 (本人の cleanup) を踏んで畳む = 罠解除前の showChoice 再利用を模す
      if (typeof forceCloseChoiceDialog === "function") forceCloseChoiceDialog();
      // 罠解除の showChoice (2 ボタン)
      showChoice("見つけた罠を解除しますか?", "解除する", "迂回する");
      const dlg2 = document.getElementById("choiceDialog");
      const btns = dlg2 ? Array.prototype.slice.call(dlg2.querySelectorAll(".choiceButtons button")) : [];
      out.afterChoiceCount = btns.length;
      out.afterChoiceTexts = btns.map(b => b.textContent);
      out.leaksSeal = btns.some(b => b.textContent.indexOf("封印") >= 0);
    } catch (e) { out.err = String((e && e.message) || e); }
    return out;
  });

  console.log('\n═══ 問題2(a): showChoice のボタン作り直し ═══');
  if (res.err) console.log('  [ERR] ' + res.err);
  console.log('  showCharChoice 後のボタン数 = ' + res.afterCharChoice + ' (期待 3)');
  console.log('  showChoice 後のボタン = ' + JSON.stringify(res.afterChoiceTexts));
  ok('showChoice は 2 ボタンに作り直す', res.afterChoiceCount === 2, 'actual=' + res.afterChoiceCount);
  ok('入口の「封印…」ボタンが罠ダイアログに残らない', res.leaksSeal === false);

  // ── tavern.html も素で開いて pageerror チェック ──
  await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(500);

  console.log('\n═══ pageerror ═══');
  ok('index.html / tavern.html に pageerror が無い', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n══ 結果 ══ PASS ' + pass + ' / FAIL ' + fail);
  try { await browser.close(); } catch (e) {}
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(3); });
