#!/usr/bin/env node
// probe_magehand_reach.js — measurement only. Serves git HEAD snapshot of .html/.js/.css; runs S2 autoplay N times.
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = 'C:/Users/PC_User/Desktop/ダンジョンファイターズ';
const ROOTR = path.resolve(ROOT);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const RUNS = +arg('runs', 5), SPEED = +arg('speed', 15), MAXS = +arg('max', 240), PORT = +arg('port', 10600);
const HEROES = (arg('heroes', 'warrior,dwarf,rogue,cleric,elf')).split(',');
const XP = +arg('xp', 21000);
const OUT = arg('out', null);
const pptr = (() => { try { return require('puppeteer-core'); } catch (e) {} return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); })();
const BROWSER = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(f => fs.existsSync(f));
const HEAD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
const cache = new Map();
function headBlob(rel) {
  if (cache.has(rel)) return cache.get(rel);
  let b = null; try { b = execFileSync('git', ['show', 'HEAD:' + rel], { cwd: ROOT, maxBuffer: 1 << 28 }); } catch (e) { b = null; }
  cache.set(rel, b); return b;
}
const srv = http.createServer((req, res) => {
  try {
    let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
    const ext = path.extname(u).toLowerCase(); const rel = u.replace(/^\//, '');
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    if (['.html', '.js', '.css', '.json'].includes(ext)) { const b = headBlob(rel); if (b) { res.end(b); return; } }
    const fp = path.join(ROOTR, u);
    if (!fp.startsWith(ROOTR) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
    fs.createReadStream(fp).pipe(res);
  } catch (e) { res.statusCode = 500; res.end('500'); }
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function BOOT(cfg) {
  try {
    if (!sessionStorage.getItem('__mhPurged')) {
      [localStorage, sessionStorage].forEach(s => Object.keys(s).forEach(k => { if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k); }));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.xp', String(cfg.xp));
      localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ mage: ['mage-hand'] }));
      sessionStorage.setItem('__mhPurged', '1');
    }
  } catch (e) {}
}
const KICK = (hero) => {
  window.__intel = (window.__INTEL_ARG !== false);
  const out = { err: '' };
  try {
    const sc = scenarios.find(s => s.id === 'bandits-forest');
    prepScenario = sc;
    selection.partyComposition = [hero];
    let tries = 0;
    for (; tries < 500; tries++) {
      regeneratePartyMembers();
      const npc = selection.partyMembers.filter(m => !m.isHero);
      if (selection.partyMembers.length === 4 && npc.filter(m => m.classKey === 'mage').length === 1) break;
    }
    out.tries = tries;
    out.party = selection.partyMembers.map(m => (m.isHero ? '*' : '') + m.classKey);
    if (window.__intel) prepIntelSuccess = true;
    out.intel = prepIntelSuccess;
    departToScenario();
  } catch (e) { out.err = String(e && e.message || e); }
  return out;
};
// installed in index page: high-rate sampler + wrappers
const INSTALL = () => {
  const W = window.__mh = { t0: performance.now(), samples: 0, calm: null, combat: null, rounds: [], offers: { calm: 0, combat: 0, eye: 0 },
    dialogs: [], firstCombat: null, within: { 12: null, 20: null, 30: null }, mageWithin: { 12: null, 20: null, 30: null },
    calmLos12: null, mageDeath: null, mageSeen: false, cageInfo: null, err: [], minCalmLos: null };
  const T = () => +((performance.now() - W.t0) / 1000).toFixed(1);
  const tileOf = (x, y) => [Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)];
  function cageCenter() {
    const c = cages.find(c => c.beastIdx >= 0) || cages[0];
    if (!c) return null;
    if (!W.cageInfo) W.cageInfo = { tx: c.tx, ty: c.ty, node: (typeof currentNodeId !== 'undefined' ? currentNodeId : null) };
    return { c, x: c.tx * TILE_SIZE + TILE_SIZE / 2, y: c.ty * TILE_SIZE + TILE_SIZE / 2 };
  }
  function mageState() {
    for (const a of allies) {
      if (!a || a.classKey !== 'mage') continue;
      const s = (a.def && a.def.displaySize) || TILE_SIZE;
      return { a, alive: !!a.alive, cx: a.x + s / 2, cy: a.y + s / 2 };
    }
    return null;
  }
  function measure(kind) {
    const cc = cageCenter(); const m = mageState();
    if (!cc || !m || !m.alive) return null;
    const d = Math.hypot(m.cx - cc.x, m.cy - cc.y) / TILE_SIZE;
    const los = hasLineOfSight(m.cx, m.cy, cc.x, cc.y);
    return { t: T(), d: +d.toFixed(2), los, mageTile: tileOf(m.cx, m.cy), hero: tileOf(playerX + 48, playerY + 58), opened: !!cc.c.opened };
  }
  const origCombat = window.tryMageHandInCombat;
  window.tryMageHandInCombat = async function () {
    try { const r = measure('combat'); if (r) { W.rounds.push(r); if (!W.combat || r.d < W.combat.d) W.combat = r; } } catch (e) { W.err.push('c:' + e.message); }
    return origCombat.apply(this, arguments);
  };
  const origOffer = window.offerMageHand;
  window.offerMageHand = function (gate) { W.offers[gate] = (W.offers[gate] || 0) + 1; return origOffer.apply(this, arguments); };
  const origSCC = window.showCharChoice;
  window.showCharChoice = function (msg) { if (/レバー|宝箱を叩/.test(String(msg))) { const r = measure('dlg'); W.dialogs.push({ t: T(), msg: String(msg).slice(0, 20), at: r, inCombat: !!(encounterActive || encounterRunning) }); } return origSCC.apply(this, arguments); };
  setInterval(() => {
    try {
      if (!gameStarted) return;
      W.samples++;
      const inC = !!(encounterActive || encounterRunning);
      if (inC && !W.firstCombat) W.firstCombat = { t: T(), hero: tileOf(playerX + 48, playerY + 58) };
      const m = mageState();
      if (m) { W.mageSeen = true; if (!m.alive && !W.mageDeath) W.mageDeath = { t: T(), inCombat: inC }; }
      const cc = cageCenter(); if (!cc) return;
      // party (hero + allies alive) min dist
      const pts = [[playerX + 48, playerY + 58]];
      for (const a of allies) if (a && a.alive) { const s = (a.def && a.def.displaySize) || TILE_SIZE; pts.push([a.x + s / 2, a.y + s / 2]); }
      const pd = Math.min(...pts.map(p => Math.hypot(p[0] - cc.x, p[1] - cc.y) / TILE_SIZE));
      for (const k of [12, 20, 30]) if (W.within[k] == null && pd <= k) W.within[k] = { t: T(), inCombat: inC };
      const r = measure('calm'); if (!r) return;
      for (const k of [12, 20, 30]) if (W.mageWithin[k] == null && r.d <= k) W.mageWithin[k] = { t: T(), inCombat: inC, los: r.los };
      if (!inC) {
        if (!W.calm || r.d < W.calm.d) W.calm = r;
        if (r.los && (!W.minCalmLos || r.d < W.minCalmLos.d)) W.minCalmLos = r;
        if (r.d <= 12 && r.los && !W.calmLos12) W.calmLos12 = r;
      } else {
        if (!W.inCombatAny || r.d < W.inCombatAny.d) W.inCombatAny = r;
      }
    } catch (e) { if (W.err.length < 5) W.err.push(e.message); }
  }, 30);
  return { ok: typeof origCombat === 'function' && typeof origOffer === 'function', known: isSpellKnown('mage', 'mage-hand'),
    caster: !!mageHandCaster(), hero: leaderClassKey, allies: allies.map(a => a.classKey + ':L' + a.level), lv: getLevelFromXP(currentTotalXp || 0),
    scen: scenarioId, node: currentNodeId };
};
const READ = () => ({ dbg: { nc: cages.length, cg: cages.map(c => [c.tx, c.ty, c.beastIdx, !!c.opened]), nE: enemies.length, alive: enemies.filter(e=>e.alive).length, enc: !!(encounterActive||encounterRunning), allies: allies.map(a=>[a.classKey,a.alive,Math.floor(a.x/TILE_SIZE),Math.floor(a.y/TILE_SIZE)]) }, mh: window.__mh, over: !!gameOver, cleared: !!dungeonCleared, hp, node: currentNodeId,
  hero: [Math.floor((playerX + 48) / TILE_SIZE), Math.floor((playerY + 58) / TILE_SIZE)] });

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const results = [];
  const one = async (i) => {
    const hero = HEROES[i % HEROES.length];
    const browser = await pptr.launch({ executablePath: BROWSER, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.evaluateOnNewDocument(BOOT, { xp: XP });
    await page.goto(`http://localhost:${PORT}/tavern.html?autoplay=${SPEED}&recruittalk=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction("typeof scenarios!=='undefined'&&typeof departToScenario==='function'&&typeof selection!=='undefined'", { timeout: 30000 });
    await page.evaluate((v) => { window.__INTEL_ARG = v; }, arg('intel', '1') !== '0');
    const kick = await page.evaluate(KICK, hero);
    await page.waitForFunction("typeof mapData!=='undefined'&&typeof heroAI==='function'&&typeof offerMageHand==='function'&&typeof gameStarted!=='undefined'", { timeout: 60000 });
    await page.waitForFunction("gameStarted && allies.length>0", { timeout: 60000 });
    const inst = await page.evaluate(INSTALL);
    const t0 = Date.now(); let last = null;
    while ((Date.now() - t0) / 1000 < MAXS) {
      await sleep(1000);
      try { last = await page.evaluate(READ); } catch (e) { break; }
      if (last.over || last.cleared) break;
    }
    const el = Math.round((Date.now() - t0) / 1000);
    const rec = { i, hero, kick, inst, elapsedS: el, outcome: last && last.cleared ? 'clear' : last && last.over ? 'defeat' : 'timeout', last, errs: errs.slice(0, 3) };
    results.push(rec);
    console.log(JSON.stringify(rec));
    await browser.close();
  };
  const W = +arg('workers', 5);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(W, RUNS) }, async () => { while (next < RUNS) { const k = next++; try { await one(k); } catch (e) { console.log('RUN ' + k + ' ERR ' + e.message); } } }));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ head: HEAD, results }, null, 1));
  srv.close();
})().catch(e => { console.error(e); process.exit(2); });
