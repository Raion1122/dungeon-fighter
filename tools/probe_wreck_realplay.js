#!/usr/bin/env node
/*
 * probe_wreck_realplay.js — 近海の難破船 (sea-wreck) を ?autoplay 無しの実機プレイで通し、
 *   ブリッジ報告の表示所見 4 件を現地で観測する。
 *     #1 判定パネルの数値 と 戦闘ログ(updateInfo)の数値 の食い違い (= 別判定か同一判定か)
 *     #2 「見つけた罠を解除しますか?」の選択ダイアログが戦闘開始で畳まれるか (残骸ボタン)
 *     #3 判定パネルの代表者名の省略表示 (.scName の ellipsis / はみ出し)
 *   手口は probe_raider_a2_realplay.js を踏襲 (入場ナレを合成 mousedown で進め、
 *   接近発火した A2 の選択ダイアログを実ボタンで操作、本物のパネルを読む)。
 *
 * 使い方: node tools/probe_wreck_realplay.js [--headful] [--port 10762]
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
const PORT = parseInt(arg('port', '10762'), 10);

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
  console.log((cond ? '  PASS' : '  NOTE') + ' ' + name + (detail ? '  — ' + detail : ''));
}

function SEED(cfg) {
  try {
    if (sessionStorage.getItem('__dfWreckRPPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfWreckRPPurged', '1');
  } catch (e) {}
}

function INSTALL_HOOKS() {
  try {
    window.__logLines = [];
    if (typeof updateInfo === 'function' && !updateInfo.__wrapped) {
      const orig = updateInfo;
      window.updateInfo = function (msg) { try { window.__logLines.push(String(msg)); } catch (e) {} return orig.apply(this, arguments); };
      window.updateInfo.__wrapped = true;
    }
  } catch (e) {}
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT);

  const profile = makeProfile('df_wreckrp_');
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

  const panels = [];

  try {
    const TAVURL = '?dev=1&forcequest=sea-wreck&recruittalk=0';
    await page.goto('http://localhost:' + PORT + '/tavern.html' + TAVURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
    await sleep(300);

    const kick = await page.evaluate(() => {
      try {
        const sc = scenarios.find(s => s.id === 'sea-wreck');
        prepScenario = sc; regeneratePartyMembers();
        departToScenario();   // 引数なし = autoplay なし
        return { kicked: true, party: (selection.partyMembers || []).length };
      } catch (e) { return { err: String((e && e.message) || e) }; }
    });
    check('(0) sea-wreck へ autoplay 無しで出発', kick.kicked === true, 'err=' + (kick.err || 'none') + ' party=' + kick.party);

    let landed = null;
    try { await page.waitForFunction("typeof mapData !== 'undefined' && typeof runA2Event === 'function' && window.SkillCheck && typeof A2_EVENTS !== 'undefined'", { timeout: 60000 }); landed = page.url(); }
    catch (e) { landed = 'TIMEOUT url=' + page.url(); }
    check('(1) index 着地 (autoplay 無)', /\/index\.html/.test(String(landed)) && !/autoplay/.test(String(landed)), 'landed=' + landed);

    await page.evaluate(INSTALL_HOOKS);
    const partyDump = await page.evaluate(() => {
      try {
        return { leader: (typeof leaderClassKey !== 'undefined') ? leaderClassKey : null,
                 leaderName: (typeof getLeaderName === 'function') ? getLeaderName() : null,
                 allies: allies.map(a => ({ c: a.classKey, n: a.npcName })) };
      } catch (e) { return { err: String(e) }; }
    });
    console.log('  [party] leader=' + partyDump.leader + ' name=' + JSON.stringify(partyDump.leaderName) + ' allies=' + JSON.stringify(partyDump.allies));

    let startedAt = -1;
    for (let i = 0; i < 80 && startedAt < 0; i++) {
      const st = await page.evaluate(() => {
        try {
          const gs = (typeof gameStarted !== 'undefined') ? gameStarted : false;
          const d = document.getElementById('choiceDialog');
          const choiceOpen = !!(d && d.classList.contains('show'));
          const sk = document.getElementById('skillCheckOverlay');
          const skOpen = !!(sk && sk.classList.contains('show'));
          if (!gs && !choiceOpen && !skOpen) document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          return { gs, choiceOpen, skOpen };
        } catch (e) { return { err: String(e) }; }
      });
      if (st && st.gs) startedAt = i;
      await sleep(250);
    }
    check('(2) gameStarted に到達', startedAt >= 0, 'startedAt(tick)=' + startedAt);

    let a2Handled = false;
    let seenPanelTitles = new Set();
    let trapChoiceSeen = false;
    let trapChoiceAfterCombat = null;
    let combatStarted = false;
    const loopTrace = [];
    for (let i = 0; i < 220; i++) {
      if (!a2Handled) {
        const a2 = await page.evaluate(() => {
          const d = document.getElementById('choiceDialog');
          if (!d || !d.classList.contains('show')) return null;
          const msg = (d.querySelector('.choiceMessage') || {}).textContent || '';
          if (msg.indexOf('傾いだ甲板') < 0 && msg.indexOf('昇降口') < 0 && msg.indexOf('潮') < 0) return { msg, other: true };
          const btns = Array.from(d.querySelectorAll('.choiceButtons button'));
          const act = btns.find(b => /読み解く|知覚/.test(b.textContent));
          if (act) { act.click(); return { msg, clicked: act.textContent, labels: btns.map(b => b.textContent) }; }
          return { msg, labels: btns.map(b => b.textContent) };
        });
        if (a2 && a2.clicked) { a2Handled = true; console.log('  [A2] clicked: ' + a2.clicked); }
      }

      const snap = await page.evaluate(() => {
        const sk = document.getElementById('skillCheckOverlay');
        if (!sk || !sk.classList.contains('show')) return null;
        const card = sk.querySelector('#skillCheckCard');
        if (!card) return null;
        const meta = (card.querySelector('.scMeta') || {}).textContent || '';
        const title = (card.querySelector('.scTitle') || {}).textContent || '';
        const result = (card.querySelector('.scResult') || {}).textContent || '';
        const repRow = card.querySelector('.scRow.rep');
        let repName = null, repNameClipped = null, repScrollW = null, repClientW = null, repMod = null;
        if (repRow) {
          const nameEl = repRow.querySelector('.scName');
          repName = nameEl ? nameEl.textContent : null;
          repMod = (repRow.querySelector('.scMod') || {}).textContent || null;
          if (nameEl) { repScrollW = nameEl.scrollWidth; repClientW = nameEl.clientWidth; repNameClipped = nameEl.scrollWidth > nameEl.clientWidth + 1; }
        }
        return { title, meta, result, repName, repMod, repNameClipped, repScrollW, repClientW };
      });
      if (snap && snap.title) {
        const key = snap.title + '|' + snap.meta;
        if (!seenPanelTitles.has(key)) {
          seenPanelTitles.add(key);
          panels.push(Object.assign({ when: i }, snap));
          console.log('  [panel#' + panels.length + '] title=' + JSON.stringify(snap.title)
            + ' repName=' + JSON.stringify(snap.repName) + ' clipped=' + snap.repNameClipped
            + ' (scroll=' + snap.repScrollW + '/client=' + snap.repClientW + ')');
        } else if (snap.result && /vs DC/.test(snap.result)) {
          const p = panels.find(p => (p.title + '|' + p.meta) === key);
          if (p && !p.result) { p.result = snap.result; }
        }
      }

      const dstate = await page.evaluate(() => {
        const g = (f, dv) => { try { const v = f(); return v === undefined ? dv : v; } catch (e) { return dv; } };
        const d = document.getElementById('choiceDialog');
        const show = !!(d && d.classList.contains('show'));
        const msg = show ? ((d.querySelector('.choiceMessage') || {}).textContent || '') : '';
        const btns = show ? Array.from(d.querySelectorAll('.choiceButtons button')).map(b => b.textContent) : [];
        const cs = d ? getComputedStyle(d) : null;
        return {
          show, msg, btns,
          disp: cs ? cs.display : null, vis: cs ? cs.visibility : null,
          enc: g(() => encounterActive || encounterRunning, false),
          node: g(() => currentNodeId, null),
          over: g(() => gameOver, false),
          cleared: g(() => (typeof dungeonCleared !== 'undefined') ? dungeonCleared : false, false),
        };
      });
      if (dstate.enc) combatStarted = true;
      if (dstate.show && /解除しますか/.test(dstate.msg)) {
        trapChoiceSeen = true;
        if (dstate.enc && !trapChoiceAfterCombat) {
          trapChoiceAfterCombat = { msg: dstate.msg, btns: dstate.btns, disp: dstate.disp, vis: dstate.vis };
          console.log('  [trap+combat] 解除ダイアログと戦闘が同時: btns=' + JSON.stringify(dstate.btns) + ' disp=' + dstate.disp + ' vis=' + dstate.vis);
        }
      }
      if (i % 10 === 0) loopTrace.push(i + ':' + JSON.stringify({ n: dstate.node, enc: dstate.enc, choice: dstate.show, over: dstate.over }));
      if (dstate.over || dstate.cleared) break;
      if (dstate.show && /解除しますか/.test(dstate.msg) && !dstate.enc) {
        await page.evaluate(() => {
          const d = document.getElementById('choiceDialog');
          const btns = Array.from(d.querySelectorAll('.choiceButtons button'));
          const yes = btns.find(b => /解除する/.test(b.textContent) && !/メイジ/.test(b.textContent)) || btns[0];
          if (yes) yes.click();
        });
      }
      await sleep(400);
    }
    console.log('  [loop] ' + loopTrace.join('  '));

    const logLines = await page.evaluate(() => (window.__logLines || []).slice());
    console.log('  [logLines] (' + logLines.length + ')');
    logLines.forEach((l, k) => console.log('    ' + k + ': ' + l));

    console.log('\n  ── 観測 ──');
    panels.forEach((p, k) => console.log('  panel#' + (k + 1) + ' title=' + JSON.stringify(p.title)
      + '\n      meta=' + JSON.stringify(p.meta)
      + '\n      result=' + JSON.stringify(p.result)
      + '\n      repName=' + JSON.stringify(p.repName) + ' clipped=' + p.repNameClipped + ' repMod=' + JSON.stringify(p.repMod)));

    check('(P) パネルが 1 枚以上観測できた', panels.length >= 1, 'count=' + panels.length);
    const clippedPanel = panels.find(p => p.repNameClipped);
    check('(#3) 代表者名が省略(クリップ)されたパネルの有無', true, clippedPanel ? ('clipped repName=' + JSON.stringify(clippedPanel.repName)) : 'クリップ無し');
    check('(#2) 戦闘と解除ダイアログの同時表示', true, trapChoiceAfterCombat ? JSON.stringify(trapChoiceAfterCombat) : 'trapChoiceSeen=' + trapChoiceSeen + ' combatStarted=' + combatStarted);
    check('(Z) pageerror 0', pageerr.length === 0, pageerr.length ? JSON.stringify(pageerr) : 'none');
  } catch (e) {
    check('(FATAL) 例外なく通し', false, String((e && e.message) || e));
  } finally {
    await browser.close(); srv.close();
  }

  const pass = results.filter(r => r.ok).length, total = results.length;
  console.log('\n  ' + pass + '/' + total);
  process.exit(0);
})();
