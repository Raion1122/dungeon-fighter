#!/usr/bin/env node
/*
 * driver_a4_retreat_revival.js — A4「撤退判断と死亡の重み」(縮小版) 回帰ドライバ
 * ═══════════════════════════════════════════════════════════════════════════════
 * 2026-11-23 開発会議トリアージ (dev-meetings/2026-11-23_dnd-flavor-gimmicks.md) の
 * A4 =「🟡 縮小版で実施 (ロストは見送り)」。① 撤退ライン (出発前に HP%) + ② 全滅時の蘇生費 (金貨)。
 *
 * 【測ること — index.html (自動撤退)】
 *   §F 既定       : AUTO_RETREAT_ON===true / getRetreatLinePct() が URL と localStorage を読む
 *   §A 発動       : line=50 で HP<50% → 手動撤退と同じ #retreatBtn.click() が呼ばれ autoRetreatFiring=true
 *   §B 非発動(高HP): HP が十分なら click されない
 *   §C 非発動(0)  : line=0「設定しない」(既定) では click されない
 *   §D 決定論     : window.__autoplay 中は HP が低くても click されない (headless 休眠)
 *   §0 撤退       : ?autoretreat=0 で HP が低くても click されない (機能ごと無効)
 *
 * 【測ること — tavern.html (蘇生費 + 設定 UI)】
 *   §R 既定       : 全滅 (defeated) で戻ると Lv×20 を [20,200] で丸めた額が金貨から引かれ、帯に「蘇生」が出る
 *   §Rret 撤退無料: retreated=true では 1 枚も引かれない
 *   §R0 撤退      : ?revivalcost=0 で引かれない (従来=無料)
 *   §U 設定 UI    : #pmRetreatRow に 3 ボタン / localStorage の値で .on が点く / クリックで localStorage が変わる
 *   §E pageerror 0
 *
 * 使い方: node tools/driver_a4_retreat_revival.js [--headful] [--browser <path>]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');
const PORT = 10784;
const argv = process.argv.slice(2);
const HEADFUL = argv.indexOf('--headful') >= 0;
function arg(name, def) { const i = argv.indexOf('--' + name); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : def; }

function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
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

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── index.html: 自動撤退のテスト本体 ──────────────────────────────────────────
// HP を下げ、全ガードを外し、DOM の #retreatBtn.click を差し替えて「呼ばれたか」を観測する。
// (監視 setInterval は retreatBtnEl === document.getElementById('retreatBtn') を click する)
async function armLowHp(page) {
  await page.evaluate(() => {
    const b = document.getElementById('retreatBtn');
    if (b) { b.click = function () { window.__arClicked = true; }; b.disabled = false; }
    window.__arClicked = false;
    gameStarted = true; gameOver = false;
    try { dungeonCleared = false; } catch (e) {}
    encounterActive = false; encounterRunning = false;
    retreatInProgress = false; autoRetreatFiring = false;
    hp = 1; maxHp = 30;
    for (let i = 0; i < allies.length; i++) { if (allies[i]) allies[i].hp = 1; }
  });
}
async function armHighHp(page) {
  await page.evaluate(() => {
    const b = document.getElementById('retreatBtn');
    if (b) { b.click = function () { window.__arClicked = true; }; b.disabled = false; }
    window.__arClicked = false;
    gameStarted = true; gameOver = false;
    try { dungeonCleared = false; } catch (e) {}
    encounterActive = false; encounterRunning = false;
    retreatInProgress = false; autoRetreatFiring = false;
    hp = maxHp = 30;
    for (let i = 0; i < allies.length; i++) { if (allies[i]) allies[i].hp = allies[i].maxHp || 30; }
  });
}
async function clicked(page) { return page.evaluate(() => !!window.__arClicked); }
async function firingFlag(page) { return page.evaluate(() => { try { return !!autoRetreatFiring; } catch (e) { return null; } }); }

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer(PORT);
  console.log('[drv] serving ' + ROOT + ' @ :' + PORT);

  const profile = makeProfile('df_a4_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });

  const errs = [];
  // index.html を「素」で (diag なし = __diagEnabled false) 開き、A4 の関数が出来るまで待つ。
  async function bootIndex(query, seed) {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push('[index' + query + '] ' + e.message));
    await page.evaluateOnNewDocument((s) => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
        sessionStorage.removeItem('dragonfighters.generatedScenario');
        if (s && s.retreatLine != null) localStorage.setItem('dragonfighters.retreatLine', String(s.retreatLine));
        else localStorage.removeItem('dragonfighters.retreatLine');
      } catch (e) {}
    }, seed || {});
    await page.goto('http://localhost:' + PORT + '/index.html' + query, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      try { return typeof getRetreatLinePct === 'function' && typeof partyHpRatio === 'function'
                    && !!document.getElementById('retreatBtn'); } catch (e) { return false; }
    }, { timeout: 20000 });
    await page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
    return page;
  }

  // ── §F 既定 + line=50 ページで §A / §B / §D ──
  {
    console.log('\n[drv] ===== index ?retreatline=50 =====');
    const page = await bootIndex('?retreatline=50');
    const f = await page.evaluate(() => ({ on: AUTO_RETREAT_ON, line: getRetreatLinePct(),
      ratioLow: (function () { hp = 1; maxHp = 30; for (let i = 0; i < allies.length; i++) if (allies[i]) allies[i].hp = 1; return partyHpRatio(); })() }));
    check('(F) AUTO_RETREAT_ON 既定 true', f.on === true, 'on=' + f.on);
    check('(F) getRetreatLinePct() が ?retreatline=50 を読む', f.line === 50, 'line=' + f.line);
    check('(F) partyHpRatio() が低HPで 0.5 未満', f.ratioLow < 0.5, 'ratio=' + f.ratioLow);

    // §A 発動
    await armLowHp(page);
    await sleep(750);
    check('(A) HP<50% + line50 で #retreatBtn.click() が発火', await clicked(page), 'clicked=' + (await clicked(page)));
    check('(A) autoRetreatFiring=true に立つ', (await firingFlag(page)) === true, 'firing=' + (await firingFlag(page)));

    // §B 非発動 (高HP)
    await armHighHp(page);
    await sleep(750);
    check('(B) HP 十分なら click されない', (await clicked(page)) === false, 'clicked=' + (await clicked(page)));

    // §D 決定論 (autoplay 中は休眠)
    await page.evaluate(() => { window.__autoplay = 1; });
    await armLowHp(page);
    await sleep(750);
    check('(D) window.__autoplay 中は低HPでも click されない', (await clicked(page)) === false, 'clicked=' + (await clicked(page)));
    await page.evaluate(() => { window.__autoplay = 0; });
    await page.close();
  }

  // ── §C line=0 (既定「設定しない」) では発動しない ──
  {
    console.log('\n[drv] ===== index ?retreatline=0 =====');
    const page = await bootIndex('?retreatline=0');
    check('(C) getRetreatLinePct()===0', await page.evaluate(() => getRetreatLinePct()) === 0, '');
    await armLowHp(page);
    await sleep(750);
    check('(C) line=0 では低HPでも click されない', (await clicked(page)) === false, 'clicked=' + (await clicked(page)));
    await page.close();
  }

  // ── §F2 localStorage 経路 (URL 上書きなし) ──
  {
    console.log('\n[drv] ===== index 既定(URLなし) + localStorage=25 =====');
    const page = await bootIndex('', { retreatLine: 25 });
    check('(F2) getRetreatLinePct() が localStorage の 25 を読む', await page.evaluate(() => getRetreatLinePct()) === 25, '');
    await page.close();
  }

  // ── §0 ?autoretreat=0 で機能ごと無効 ──
  {
    console.log('\n[drv] ===== index ?autoretreat=0&retreatline=50 =====');
    const page = await bootIndex('?autoretreat=0&retreatline=50');
    check('(0) AUTO_RETREAT_ON===false', await page.evaluate(() => AUTO_RETREAT_ON) === false, '');
    await armLowHp(page);
    await sleep(750);
    check('(0) ?autoretreat=0 では低HPでも click されない', (await clicked(page)) === false, 'clicked=' + (await clicked(page)));
    await page.close();
  }

  // ── tavern.html: 蘇生費 + 設定 UI ──────────────────────────────────────────
  async function bootTavern(query, seed) {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push('[tavern' + query + '] ' + e.message));
    await page.evaluateOnNewDocument((s) => {
      try {
        if (s.gold != null) localStorage.setItem('dragonfighters.gold', String(s.gold));
        if (s.xp != null) localStorage.setItem('dragonfighters.xp', String(s.xp));
        if (s.retreatLine != null) localStorage.setItem('dragonfighters.retreatLine', String(s.retreatLine));
        else localStorage.removeItem('dragonfighters.retreatLine');
        if (s.lastResult) sessionStorage.setItem('dragonfighters.lastResult', JSON.stringify(s.lastResult));
      } catch (e) {}
    }, seed || {});
    await page.goto('http://localhost:' + PORT + '/tavern.html' + query, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      try { return typeof getRetreatLineTV === 'function' && !!document.getElementById('pmRetreatRow'); }
      catch (e) { return false; }
    }, { timeout: 20000 });
    return page;
  }
  const DEFEAT = (over) => Object.assign({ scenarioId: 'goblin-mine', scenarioTitle: 'テスト依頼',
    cleared: false, defeated: true }, over || {});

  // §R 既定: Lv1 (xp=0) → cost=20, gold 500→480, 帯に「蘇生」
  {
    console.log('\n[drv] ===== tavern 蘇生費 (既定 ON) =====');
    const page = await bootTavern('', { gold: 500, xp: 0, lastResult: DEFEAT() });
    await sleep(400);
    const gold = await page.evaluate(() => localStorage.getItem('dragonfighters.gold'));
    const body = await page.evaluate(() => document.body.innerText);
    check('(R) 全滅で金貨が 500→480 に減る (Lv1×20)', gold === '480', 'gold=' + gold);
    check('(R) 帰還の帯に「蘇生」と「金貨 20」が出る', /蘇生/.test(body) && /金貨\s*20/.test(body), body.slice(0, 160));
    await page.close();
  }

  // §Rret 撤退 (retreated) は無料
  {
    console.log('\n[drv] ===== tavern 撤退は無料 =====');
    const page = await bootTavern('', { gold: 500, xp: 0, lastResult: { scenarioId: 'goblin-mine', scenarioTitle: 'テスト', cleared: false, defeated: false, retreated: true } });
    await sleep(400);
    const gold = await page.evaluate(() => localStorage.getItem('dragonfighters.gold'));
    check('(Rret) 撤退では金貨が減らない (500 のまま)', gold === '500', 'gold=' + gold);
    await page.close();
  }

  // §R0 ?revivalcost=0 で無料
  {
    console.log('\n[drv] ===== tavern ?revivalcost=0 =====');
    const page = await bootTavern('?revivalcost=0', { gold: 500, xp: 0, lastResult: DEFEAT() });
    await sleep(400);
    const gold = await page.evaluate(() => localStorage.getItem('dragonfighters.gold'));
    const body = await page.evaluate(() => document.body.innerText);
    check('(R0) ?revivalcost=0 では金貨が減らない', gold === '500', 'gold=' + gold);
    check('(R0) 帯に「蘇生」が出ない', !/蘇生/.test(body), '');
    await page.close();
  }

  // §U 設定 UI
  {
    console.log('\n[drv] ===== tavern 撤退ライン設定 UI =====');
    const page = await bootTavern('', {});   // lastResult なし (帯を出さない)
    const btnCount = await page.evaluate(() => document.querySelectorAll('#pmRetreatRow button[data-line]').length);
    check('(U) #pmRetreatRow に 3 ボタン (0/25/50)', btnCount === 3, 'n=' + btnCount);
    const def = await page.evaluate(() => getRetreatLineTV());
    check('(U) 既定は 0 (設定しない)', def === 0, 'def=' + def);
    // localStorage=25 を反映
    const on25 = await page.evaluate(() => {
      localStorage.setItem('dragonfighters.retreatLine', '25'); renderRetreatLinePanel();
      const b = document.querySelector('#pmRetreatRow button[data-line="25"]');
      return b && b.classList.contains('on');
    });
    check('(U) localStorage=25 で HP25% ボタンが点灯', on25 === true, 'on25=' + on25);
    // クリックで 50 へ
    const after = await page.evaluate(() => {
      const b = document.querySelector('#pmRetreatRow button[data-line="50"]'); b.click();
      return { saved: localStorage.getItem('dragonfighters.retreatLine'),
               on: b.classList.contains('on') };
    });
    check('(U) HP50% をクリックすると localStorage が 50 に・点灯が移る', after.saved === '50' && after.on === true, JSON.stringify(after));
    await page.close();
  }

  // §E pageerror 0
  check('(E) pageerror 0', errs.length === 0, errs.slice(0, 6).join(' | '));

  await browser.close();
  srv.close();

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('\n────────────────────────────────────────');
  console.log('[drv] RESULT: PASSED ' + passed + ' / FAILED ' + failed + ' / TOTAL ' + results.length);
  if (failed) { results.filter(r => !r.ok).forEach(r => console.log('  FAIL ' + r.name + '  — ' + r.detail)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(1); });
