#!/usr/bin/env node
/*
 * smoke_sea_wreck.js — 新しい行き先「近海の難破船」(sea-wreck) の着地スモーク。
 * smoke_raider_camp.js の §A〜§Z を写したもの。forcequest で卓へ載せ → 出発 → index 着地で
 * RUN が 2 ノード組み上がり / ボス = lizardChieftain / A2 = perception DC14 / 罠 = pit,miasma /
 * 全表解決 (SCENARIO_TEX・ENEMY_TYPES の鱗の魔物) / pageerror 0 を確かめる。
 * 使い方: node tools/smoke_sea_wreck.js [--headful] [--port 10722]
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
const PORT = parseInt(arg('port', '10722'), 10);

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

/* lizard-swamp クリア済みのセーブ (= sea-wreck が解放済み)。questBoard は置かない。 */
function SEED(cfg) {
  try {
    if (sessionStorage.getItem('__dfWreckPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfWreckPurged', '1');
  } catch (e) {}
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT);

  const profile = makeProfile('df_wreck_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  const pageerr = [];
  page.on('pageerror', (e) => { if (pageerr.length < 10) pageerr.push(e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  const seed = { cleared: ['goblin-mine', 'bandits-forest', 'lizard-swamp'], xp: 12000 };
  await page.evaluateOnNewDocument(SEED, seed);

  try {
    const TAVURL = '?autoplay=30&dev=1&forcequest=sea-wreck&recruittalk=0';
    await page.goto('http://localhost:' + PORT + '/tavern.html' + TAVURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
    await sleep(300);

    const gA = await page.evaluate(() => {
      const sign = document.querySelector('[data-scenario="sea-wreck"]');
      const sc = (typeof scenarios !== 'undefined') ? scenarios.find(s => s.id === 'sea-wreck') : null;
      return {
        hasSign: !!sign,
        signName: sign ? (sign.textContent || '').trim().slice(0, 24) : null,
        unlocked: sc ? (typeof isUnlocked === 'function' ? isUnlocked(sc) : null) : null,
        place: sc ? sc.place : null,
        side: sc ? sc.side : null,
        enemiesBoss: sc ? (sc.enemies || []).filter(e => e.boss).length : -1,
      };
    });
    check('(A1) sea-wreck が解放済みセーブ (沼地クリア) で isUnlocked', gA.unlocked === true, 'unlocked=' + gA.unlocked);
    check('(A2) 卓に「近海の難破船」の札が forcequest で出る', gA.hasSign === true, 'sign=' + JSON.stringify(gA.signName));
    check('(A3) side:true / place=近海の難破船 / ボス 1 体', gA.side === true && gA.place === '近海の難破船' && gA.enemiesBoss === 1, 'side=' + gA.side + ' place=' + gA.place + ' boss=' + gA.enemiesBoss);

    // 出発 → index へ
    const kick = await page.evaluate(() => {
      const out = { err: null };
      try {
        const sc = scenarios.find(s => s.id === 'sea-wreck');
        prepScenario = sc;
        regeneratePartyMembers();
        out.party = (selection.partyMembers || []).length;
        departToScenario();
        out.kicked = true;
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    check('(E0) 難破船へ出発できた (departToScenario)', kick.kicked === true && !kick.err, 'err=' + kick.err + ' party=' + kick.party);

    let landed = null;
    try { await page.waitForFunction("typeof mapData !== 'undefined' && typeof heroAI === 'function'", { timeout: 60000 }); landed = page.url(); }
    catch (e) { landed = 'TIMEOUT url=' + page.url(); }
    await sleep(1200);

    const gE = await page.evaluate(() => {
      const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
      const a2 = (typeof A2_EVENTS !== 'undefined') ? A2_EVENTS['sea-wreck'] : null;
      let bossKind = null, nodeCount = -1, entry = null, bossNodeId = null;
      try {
        entry = RUN ? RUN.graph.entry : null;
        bossNodeId = RUN ? RUN.bossNodeId : null;
        nodeCount = RUN ? Object.keys(RUN.byId).length : -1;
        const bn = RUN.byId[RUN.bossNodeId];
        const md = bn && bn.mapDef;
        const bs = md && (md.bossSlot || (md.rooms && md.rooms.map(r => r.bossSlot).find(Boolean)));
        bossKind = bs ? (bs.kind || bs[2] || null) : null;
      } catch (e) {}
      return {
        scen: g(() => scenarioId, null),
        title: g(() => (currentScenario ? currentScenario.title : null), null),
        entry: entry, bossNodeId: bossNodeId, nodeCount: nodeCount, bossKind: bossKind,
        a2: a2 ? { key: a2.key, check: a2.check, dc: a2.dc, classes: String(a2.classes) } : null,
        trapN0: g(() => (currentScenario && currentScenario.trapTypeByNode ? currentScenario.trapTypeByNode.n0 : null), null),
        trapN1: g(() => (currentScenario && currentScenario.trapTypeByNode ? currentScenario.trapTypeByNode.n1 : null), null),
        tex: g(() => (typeof SCENARIO_TEX !== 'undefined' && SCENARIO_TEX['sea-wreck']) ? true : false, false),
        enemyTypesOk: g(() => (typeof ENEMY_TYPES !== 'undefined' && !!ENEMY_TYPES.lizardWarrior && !!ENEMY_TYPES.plagueFrog && !!ENEMY_TYPES.lizardChieftain), false),
      };
    });
    check('(E1) index 着地 & scenarioId = sea-wreck', /\/index\.html/.test(String(landed)) && gE.scen === 'sea-wreck', 'landed=' + landed + ' scen=' + gE.scen);
    check('(E2) RUN.entry = n0 / 2 ノード', gE.entry === 'n0' && gE.nodeCount === 2, 'entry=' + gE.entry + ' nodes=' + gE.nodeCount);
    check('(E3) ボスノードのボスキーが lizardChieftain', gE.bossKind === 'lizardChieftain', 'bossKind=' + gE.bossKind + ' bossNode=' + gE.bossNodeId);
    check('(E4) A2 判定が perception / DC14 / rogue,elf', gE.a2 && gE.a2.check === 'perception' && gE.a2.dc === 14 && gE.a2.classes === 'rogue,elf', 'a2=' + JSON.stringify(gE.a2));
    check('(E5) 罠 n0 = pit / n1 = miasma (既存の種類を流用)', gE.trapN0 === 'pit' && gE.trapN1 === 'miasma', 'n0=' + gE.trapN0 + ' n1=' + gE.trapN1);
    check('(E6) SCENARIO_TEX / ENEMY_TYPES(鱗の魔物) が解決', gE.tex === true && gE.enemyTypesOk === true, 'tex=' + gE.tex + ' types=' + gE.enemyTypesOk);
    check('(E7) タイトルが解決 (SCENARIOS)', typeof gE.title === 'string' && gE.title.indexOf('近海の難破船') === 0, 'title=' + gE.title);

    await sleep(2500);   // 数秒まわして交戦系の落ちを拾う
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
