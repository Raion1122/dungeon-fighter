#!/usr/bin/env node
/*
 * probe_wreck_longname.js — ブリッジ確認依頼 (#3): 長い名前の仲間が代表になった時、左上 260px の
 *   corner 判定パネル (html.dfCornerCheck) で名前が切れずに表示されるかを **実機の本物のパネル** で確認する。
 *   手口: sea-wreck へ出発 → index 着地後、全仲間 (と主人公) の表示名を長い名前へ差し替え →
 *         入口 A2 の知覚判定を実際に走らせ、本物の corner パネルに出た代表者名の横幅/折返しを測る。
 *   ⚠ 既存バランス値は触らない。表示名 (npcName / leaderName) だけを差し替える表示検証。
 * 使い方: node tools/probe_wreck_longname.js [--headful] [--port 10795]
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
const PORT = parseInt(arg('port', '10795'), 10);

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
function check(name, cond, detail) { results.push({ name, ok: !!cond }); console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : '')); }

function SEED(cfg) {
  try {
    if (sessionStorage.getItem('__dfWreckLNPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) { if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k); });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfWreckLNPurged', '1');
  } catch (e) {}
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); } catch (e) { console.error('[drv] ポート失敗: ' + e.message); process.exit(2); }
  console.log('[drv] serving :' + PORT);
  const profile = makeProfile('df_wreckln_');
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  const pageerr = [];
  page.on('pageerror', (e) => { if (pageerr.length < 12) pageerr.push(e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  await page.evaluateOnNewDocument(SEED, { cleared: ['goblin-mine', 'bandits-forest', 'lizard-swamp'], xp: 12000 });

  const LONG = 'ファランドール・ロンガー';   // 実在 NPC 名 (最長~6字) より長い worst-case (11字)

  try {
    await page.goto('http://localhost:' + PORT + '/tavern.html?dev=1&forcequest=sea-wreck&recruittalk=0', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
    await sleep(300);
    const dep = await page.evaluate((LN) => {
      try {
        const sc = scenarios.find(s => s.id === 'sea-wreck'); prepScenario = sc; regeneratePartyMembers();
        const pm = selection.partyMembers || [];
        pm.forEach((m, i) => { if (i > 0 && m) m.npcName = LN; });   // 主人公以外=仲間を長名に
        departToScenario();
        return { party: pm.length };
      } catch (e) { return { err: String(e) }; }
    }, LONG);
    check('(0) sea-wreck へ出発 (仲間を長名化)', !dep.err, 'party=' + dep.party + ' err=' + (dep.err || 'none'));
    await page.waitForFunction("typeof runA2Event === 'function' && window.SkillCheck && typeof allies !== 'undefined'", { timeout: 60000 });

    // index 側でも全 ally と主人公の表示名を長名へ (buildPerceptionParty が誰を選んでも長名になる)
    await page.evaluate((LN) => {
      try { allies.forEach(a => { a.npcName = LN; if (a.def) a.def.name = LN; }); } catch (e) {}
      try { if (typeof playerName !== 'undefined') playerName = LN; } catch (e) {}
    }, LONG);

    for (let i = 0; i < 60; i++) {
      const gs = await page.evaluate(() => {
        const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
        const started = g(() => gameStarted, false);
        const d = document.getElementById('choiceDialog'); const open = !!(d && d.classList.contains('show'));
        const sk = document.getElementById('skillCheckOverlay');
        if (!started && !open && !(sk && sk.classList.contains('show'))) document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return started;
      });
      if (gs) break;
      await sleep(200);
    }

    // A2 を「読み解く」で走らせ、本物の corner パネルを測る
    let panel = null;
    for (let i = 0; i < 90; i++) {
      await page.evaluate(() => {
        const d = document.getElementById('choiceDialog');
        if (d && d.classList.contains('show')) {
          const msg = (d.querySelector('.choiceMessage') || {}).textContent || '';
          if (/傾いだ甲板|昇降口|潮の跡|鱗の痕跡/.test(msg)) { const act = Array.from(d.querySelectorAll('.choiceButtons button')).find(b => /読み解く|知覚/.test(b.textContent)); if (act) act.click(); }
        }
      });
      const p = await page.evaluate(() => {
        const sk = document.getElementById('skillCheckOverlay');
        if (!sk || !sk.classList.contains('show')) return null;
        const card = sk.querySelector('#skillCheckCard'); if (!card) return null;
        const row = card.querySelector('.scRow.rep'); if (!row) return null;
        const nameEl = row.querySelector('.scName'); if (!nameEl) return null;
        const cardRect = card.getBoundingClientRect();
        const nmRect = nameEl.getBoundingClientRect();
        return {
          corner: document.documentElement.classList.contains('dfCornerCheck'),
          cardWidth: Math.round(cardRect.width),
          text: nameEl.textContent,
          scrollW: nameEl.scrollWidth, clientW: nameEl.clientWidth,
          clipped: nameEl.scrollWidth > nameEl.clientWidth + 1,
          nameRight: Math.round(nmRect.right), cardRight: Math.round(cardRect.right),
          overflowRight: nmRect.right > cardRect.right + 1,
        };
      });
      if (p) { panel = p; break; }
      await sleep(250);
    }

    if (!panel) { check('(1) 判定パネルを観測', false, 'パネルが出なかった'); }
    else {
      console.log('  [panel] ' + JSON.stringify(panel));
      check('(1) 左上 corner パネル (html.dfCornerCheck) で判定が出た', panel.corner === true, 'corner=' + panel.corner + ' cardWidth=' + panel.cardWidth);
      check('(2) 代表者名に長名の全文が入っている (… で欠けない)', panel.text && panel.text.indexOf(LONG) >= 0, 'text=' + JSON.stringify(panel.text));
      check('(3) 名前が横に切れていない (scrollW ≤ clientW)', panel.clipped === false, 'scroll=' + panel.scrollW + '/client=' + panel.clientW);
      check('(4) 名前がカード (260px) の右端をはみ出していない', panel.overflowRight === false, 'nameRight=' + panel.nameRight + ' cardRight=' + panel.cardRight);
    }
    check('(Z) pageerror 0', pageerr.length === 0, pageerr.length ? JSON.stringify(pageerr) : 'none');
  } catch (e) {
    check('(FATAL)', false, String((e && e.message) || e));
  } finally { await browser.close(); srv.close(); }

  const pass = results.filter(r => r.ok).length, total = results.length;
  console.log('\n  ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})();
