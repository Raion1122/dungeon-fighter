#!/usr/bin/env node
/*
 * verify_arcane_pmdebug.js — ブリッジ再検証(3回目)の問題1 の修正台。
 * ═══════════════════════════════════════════════════════════════════════════════
 * 問題1 = 「?dev=1 でも出発準備画面にデバッグ行 (🐞 自動デバッグ巡回) が出ない」。
 *   真因 = #55 (?prepskip) 以降、本物の出発は **マッチング画面 #pmBrief** から行われ、
 *          #prep は ?prepskip=0 専用に退いた。デバッグ行 (#debugAutoplayRow) は #prep の中に
 *          しか無いので、既定フロー(=公開ビルド)では一度も現れない。
 *          旧 verify_arcane_tower の C3 は #prep を一度も開かずに getComputedStyle(row).display を
 *          読むだけ = 「#prep が hidden でも row 自身の display は flex」を測っており偽陽性だった。
 *   修正 = マッチング画面側に dev 専用の #pmDebugRow を足し、#pmDepart と同じ猶予明けに出す。
 *
 * ■ 測ること (実フロー = playPartyMatchCinematic を本物の関数で回す)
 *   §1 dev ON  : 猶予明けに #pmDebugRow が **実際に可視** (offsetParent≠null / 高さ>0 / display:flex) で、
 *                4 ボタン (x10 / x30 / 自動デバッグ巡回 / 開発モード終了) がすべて可視
 *   §2 配線    : ⚡x10 を click すると index.html?autoplay=10 へ遷移する (= #prep 側と同じ departToScenario)
 *   §3 開示中  : 猶予明け前 (reveal 中) は hidden = 可視でない (「確定を見ずに飛ばす」を作らない不変条件)
 *   §4 dev OFF : body.dev-mode が無いと、猶予明けでも #pmDebugRow は不可視 (素の配布物でチートにならない)
 *
 * exit 0=全 assert 期待どおり / 1=崩れた / 2=環境不足 / 3=例外
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
const PORT = parseInt(arg('port', '10945'), 10);

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  if (process.env.PPTR_DIR) { try { return require(path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core')); } catch (e) {} }
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
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

const CLEARED = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort'];
function SEED(cfg) {
  try {
    if (sessionStorage.getItem('__dfArcanePmPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfArcanePmPurged', '1');
  } catch (e) {}
}

async function openTavern(browser, qs, seedCfg) {
  const page = await browser.newPage();
  page.__pageerr = [];
  page.on('pageerror', (e) => { if (page.__pageerr.length < 5) page.__pageerr.push(e.message); });
  await page.setViewport({ width: 1280, height: 900 });
  if (seedCfg) await page.evaluateOnNewDocument(SEED, seedCfg);
  await page.goto('http://localhost:' + PORT + '/tavern.html' + qs, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof scenarios !== 'undefined' && typeof regeneratePartyMembers === 'function' && window.__pmTest", { timeout: 30000 });
  await sleep(300);
  return page;
}

// マッチング画面を本物の関数で開き、#pmDepart が可視になる (= 猶予明け) まで待つ。
async function playMatchAndWaitGate(page, scenarioId) {
  await page.evaluate((sid) => {
    const sc = scenarios.find(s => s.id === sid) || scenarios[0];
    prepScenario = sc;                 // 配線テスト (departToScenario) が prepScenario を要求する
    window.__pmTest.ensureParty();     // selection.partyMembers を用意
    window.__pmTest.play(sc);          // = playPartyMatchCinematic(sc) 本物
  }, scenarioId);
  // #pmDepart が hidden から外れる (猶予明け) まで最大 20s ポーリング
  let gateOpen = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    gateOpen = await page.evaluate(() => {
      const d = document.getElementById('pmDepart');
      return !!(d && !d.hidden && d.offsetParent !== null);
    });
    if (gateOpen) break;
  }
  return gateOpen;
}

function visState() {
  const vis = (id) => {
    const el = document.getElementById(id);
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { exists: true, hiddenAttr: el.hidden, offsetParent: el.offsetParent !== null,
             display: cs.display, h: Math.round(r.height), w: Math.round(r.width) };
  };
  return {
    devClass: document.body.classList.contains('dev-mode'),
    row: vis('pmDebugRow'),
    bAuto: vis('pmBtnDepartAutoplay'),
    bFast: vis('pmBtnDepartAutoplayFast'),
    bDebug: vis('pmBtnDepartAutoDebug'),
    bExit: vis('pmBtnExitDevMode'),
    depart: vis('pmDepart'),
  };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT);

  const profile = makeProfile('df_arcane_pm_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  try {
    // ─────────── §1 / §3 dev ON: マッチング画面の実フロー ───────────
    console.log('\n── §1/§3: ?dev=1 のマッチング画面に #pmDebugRow が出る ──');
    const seed = { cleared: CLEARED, xp: 21000 };   // Lv7 相当
    const pOn = await openTavern(browser, '?dev=1&forcequest=arcane-tower&recruittalk=0', seed);

    // 猶予明け前 (reveal 直後) を一度捕まえる (§3 用)
    await pOn.evaluate(() => {
      const sc = scenarios.find(s => s.id === 'arcane-tower') || scenarios[0];
      prepScenario = sc; window.__pmTest.ensureParty(); window.__pmTest.play(sc);
    });
    await sleep(400);
    const early = await pOn.evaluate(visState);
    check('(§3) 猶予明け前は #pmDebugRow は不可視 (確定を見ずに飛ばさない)',
      early.row.exists && early.row.offsetParent === false, 'row=' + JSON.stringify(early.row));

    // 猶予が明けて #pmDepart が可視になるまで待つ
    let gate = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      gate = await pOn.evaluate(() => { const d = document.getElementById('pmDepart'); return !!(d && !d.hidden && d.offsetParent !== null); });
      if (gate) break;
    }
    check('(§1-0) 猶予が明けて #pmDepart が可視になった (前提)', gate === true, 'gate=' + gate);
    const on = await pOn.evaluate(visState);
    check('(§1-1) dev ON で body.dev-mode が付く', on.devClass === true, 'devClass=' + on.devClass);
    check('(§1-2) #pmDebugRow が実際に可視 (offsetParent≠null / 高さ>0 / display:flex)',
      on.row.exists && on.row.offsetParent === true && on.row.h > 0 && on.row.display === 'flex',
      'row=' + JSON.stringify(on.row));
    check('(§1-3) ⚡x10 ボタンが可視', on.bAuto.offsetParent === true && on.bAuto.h > 0, 'bAuto=' + JSON.stringify(on.bAuto));
    check('(§1-4) ⚡⚡x30 ボタンが可視', on.bFast.offsetParent === true && on.bFast.h > 0, 'bFast=' + JSON.stringify(on.bFast));
    check('(§1-5) 🐞 自動デバッグ巡回 ボタンが可視', on.bDebug.offsetParent === true && on.bDebug.h > 0, 'bDebug=' + JSON.stringify(on.bDebug));
    check('(§1-6) 🚪 開発モード終了 ボタンが可視', on.bExit.offsetParent === true && on.bExit.h > 0, 'bExit=' + JSON.stringify(on.bExit));

    // ─────────── §2 配線: ⚡x10 click → index.html?autoplay=10 ───────────
    console.log('\n── §2: ⚡x10 を押すと #prep 側と同じ departToScenario(10) が走る ──');
    const navP = pOn.waitForNavigation({ timeout: 15000 }).catch(() => null);
    await pOn.evaluate(() => { const b = document.getElementById('pmBtnDepartAutoplay'); if (b) b.click(); });
    await navP;
    await sleep(400);
    const url = pOn.url();
    check('(§2-1) ⚡x10 で index.html へ遷移し autoplay=10 が付く', /\/index\.html\?.*autoplay=10/.test(url), 'url=' + url);
    const curScen = await pOn.evaluate(() => { try { return sessionStorage.getItem('dragonfighters.currentScenario'); } catch (e) { return null; } });
    check('(§2-2) 遷移先 sessionStorage の currentScenario = arcane-tower', curScen === 'arcane-tower', 'currentScenario=' + curScen);
    check('(§1/§2) dev ON タブで pageerror 0', !(pOn.__pageerr && pOn.__pageerr.length), 'pageerr=' + JSON.stringify(pOn.__pageerr));
    await pOn.close();

    // ─────────── §4 dev OFF: body.dev-mode が無いと出ない ───────────
    console.log('\n── §4: dev OFF では猶予明けでも #pmDebugRow は不可視 ──');
    // forcequest は dev ゲートなので dev OFF では塔を載せられない。ここは #pmDebugRow の
    // 可視性だけを測るので、解放済みの通常シナリオ (goblin-mine) でマッチング画面を開けば十分。
    const pOff = await openTavern(browser, '?recruittalk=0', { cleared: CLEARED, xp: 21000 });
    const gateOff = await playMatchAndWaitGate(pOff, 'goblin-mine');
    check('(§4-0) dev OFF でも #pmDepart は猶予明けに可視になる (マッチング自体は正常)', gateOff === true, 'gate=' + gateOff);
    const off = await pOff.evaluate(visState);
    check('(§4-1) dev OFF では body.dev-mode が付かない', off.devClass === false, 'devClass=' + off.devClass);
    check('(§4-2) dev OFF では #pmDebugRow は DOM にあるが不可視 (display:none / offsetParent=null)',
      off.row.exists && off.row.offsetParent === false && off.row.display === 'none',
      'row=' + JSON.stringify(off.row));
    check('(§4-3) dev OFF では 🐞 ボタンも不可視', off.bDebug.exists && off.bDebug.offsetParent === false, 'bDebug=' + JSON.stringify(off.bDebug));
    check('(§4) dev OFF タブで pageerror 0', !(pOff.__pageerr && pOff.__pageerr.length), 'pageerr=' + JSON.stringify(pOff.__pageerr));
    await pOff.close();
  } catch (e) {
    console.error('[drv] 例外: ' + ((e && e.stack) || e));
    try { await browser.close(); } catch (_) {}
    srv.close();
    process.exit(3);
  }
  try { await browser.close(); } catch (e) {}
  srv.close();

  const fail = results.filter(r => !r.ok);
  console.log('\n══════════ 結果: ' + (results.length - fail.length) + '/' + results.length + ' PASS ══════════');
  if (fail.length) { console.log('FAILED: ' + fail.map(r => r.name).join(', ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(3); });
