#!/usr/bin/env node
/*
 * probe_arcane_balance.js — 「崩れた魔術師の塔」の **推奨 Lv7 パーティ**でのクリア率を測る調査台 (依頼の問題3)。
 * verify_arcane_tower.js は Lv10 の best-of-3 しか測らない。本台は任意の Lv (既定 Lv7 = 累積xp 21000) で
 * autoplay を N 回回し、clear / defeat / timeout の内訳と最終 HP を吐く。数値は一切変えない (計測のみ)。
 * 使い方: node tools/probe_arcane_balance.js [--xp 21000] [--tries 8] [--speed 30] [--max 200]
 *   Lv の累積xp = 500*Lv*(Lv-1) : Lv7=21000 / Lv8=28000 / Lv9=36000 / Lv10=45000
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
const XP = parseInt(arg('xp', '21000'), 10);     // 既定 Lv7
const TRIES = parseInt(arg('tries', '8'), 10);
const SPEED = parseInt(arg('speed', '30'), 10);
const MAXS = parseInt(arg('max', '200'), 10);
const PORT = parseInt(arg('port', '10944'), 10);

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

const CLEARED = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort'];
function SEED(cfg) {
  try {
    if (sessionStorage.getItem('__dfArcanePurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfArcanePurged', '1');
  } catch (e) {}
}
const TICK = () => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  return {
    node: g(() => currentNodeId, null),
    over: g(() => !!gameOver, false),
    cleared: g(() => !!dungeonCleared, false),
    hp: g(() => (typeof hp === 'number' ? hp : null), null),
    // ⚠ 主人公の Lv は currentTotalXp (= persistent.xp = セーブの累積xp) から引く。
    //   inventory.xp は別物 (ラン中カウンタ) なので Lv1 と誤読する。
    lvl: g(() => (typeof getLevelFromXP === 'function' && typeof currentTotalXp !== 'undefined' ? getLevelFromXP(currentTotalXp) : null), null),
  };
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  const lvl = Math.round((1 + Math.sqrt(1 + 4 * XP / 500)) / 2);   // 500*Lv*(Lv-1)=XP の逆算 (概算)
  console.log('[drv] 塔バランス計測  xp=' + XP + ' (≈Lv' + lvl + ')  tries=' + TRIES + '  speed=' + SPEED + '  max=' + MAXS + 's');

  const profile = makeProfile('df_arcane_bal_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.log('  [pageerror] ' + e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  await page.evaluateOnNewDocument(SEED, { cleared: CLEARED, xp: XP });

  const TAVURL = '/tavern.html?autoplay=' + SPEED + '&dev=1&forcequest=arcane-tower&recruittalk=0';
  const outcomes = [];
  let reportedLvl = null;
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    await page.goto('http://localhost:' + PORT + TAVURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
    await sleep(200);
    const kick = await page.evaluate(() => {
      try {
        const sc = scenarios.find(s => s.id === 'arcane-tower');
        prepScenario = sc; regeneratePartyMembers(); departToScenario();
        return { ok: true, lvl: (typeof getLevelFromXP === 'function' ? getLevelFromXP(inventory.xp) : null) };
      } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
    });
    if (reportedLvl == null && kick.lvl != null) reportedLvl = kick.lvl;
    try { await page.waitForFunction("typeof mapData !== 'undefined' && typeof heroAI === 'function'", { timeout: 60000 }); }
    catch (e) {}
    const t0 = Date.now();
    let last = null;
    while ((Date.now() - t0) / 1000 < MAXS) {
      await sleep(1000);
      let t; try { t = await page.evaluate(TICK); } catch (e) { continue; }
      last = t;
      if (t.over || t.cleared) break;
    }
    const el = Math.round((Date.now() - t0) / 1000);
    const outcome = last && last.cleared ? 'clear' : (last && last.over ? 'defeat' : 'timeout');
    outcomes.push(outcome);
    console.log('  [' + attempt + '/' + TRIES + '] ' + outcome + '  (Lv' + (last ? last.lvl : '?') + ', HP' + (last ? last.hp : '?') + ', ' + el + 's, node=' + (last ? last.node : '?') + ')');
  }
  const clears = outcomes.filter(o => o === 'clear').length;
  console.log('\n══ 結果 ══ 想定Lv' + (reportedLvl || lvl) + '  クリア ' + clears + '/' + TRIES
    + '  (' + Math.round(100 * clears / TRIES) + '%)  内訳=' + outcomes.join(','));

  try { await browser.close(); } catch (e) {}
  srv.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(3); });
