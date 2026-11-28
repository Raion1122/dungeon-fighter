#!/usr/bin/env node
/*
 * probe_wreck_choice_stuck.js — 近海の難破船 (sea-wreck) の「戦闘後に入口ノードの選択肢ボタンが
 *   押せなくなる」不具合 (ブリッジ #1) の再現と、修正後の検証を実機で行う。
 *
 *   手口: 入口 A2 を Esc で一旦見送り (declined 化) → 1 戦交える → 戦闘後に #choiceDialog を精査。
 *     旧: ボタン DOM が .show 無し (opacity:0 / pe:none) で亡霊として残り、A2 は半径内に留まるため
 *         二度と再提示されない = 戦闘ログの裏で「押せない選択肢」。
 *     新: (a) 戦闘開始の forceCloseChoiceDialog が亡霊ボタンを無条件で空へ戻す
 *         (b) 戦闘終了で今ノードの declined を戻し、戦闘直後に A2 を再提示 → 実クリックで解決できる。
 *
 * 使い方: node tools/probe_wreck_choice_stuck.js [--headful] [--port 10783]
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
const PORT = parseInt(arg('port', '10783'), 10);

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
    if (sessionStorage.getItem('__dfWreckStuckPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfWreckStuckPurged', '1');
  } catch (e) {}
}

function INSPECT() {
  const g = (f, dv) => { try { const v = f(); return v === undefined ? dv : v; } catch (e) { return dv; } };
  const d = document.getElementById('choiceDialog');
  const show = !!(d && d.classList.contains('show'));
  const out = {
    show, enc: g(() => !!(encounterActive || encounterRunning), false),
    coOpen: document.body ? document.body.classList.contains('choice-open') : null,
    msg: '', btnCount: 0, btns: [], a2: null, badButtons: [],
  };
  out.a2 = g(() => {
    const ev = (typeof NODE_EVENTS !== 'undefined') ? NODE_EVENTS.find(e => e.key === 'a2_wreck_scout') : null;
    if (!ev) return null;
    const st = (typeof nodeState !== 'undefined' && currentNodeId) ? nodeState[currentNodeId] : null;
    const fired = !!(st && st.eventsFired && st.eventsFired.has && st.eventsFired.has('a2_wreck_scout'));
    return { declined: !!ev.declined, fired };
  }, null);
  if (!d) return out;
  const cs = getComputedStyle(d);
  out.dlgStyle = { opacity: cs.opacity, pe: cs.pointerEvents, zIndex: cs.zIndex };
  out.msg = (d.querySelector('.choiceMessage') || {}).textContent || '';
  const btns = Array.from(d.querySelectorAll('.choiceButtons button'));
  out.btnCount = btns.length; out.btns = btns.map(b => b.textContent);
  btns.forEach((b, i) => {
    const br = b.getBoundingClientRect();
    const cx = Math.round(br.x + br.width / 2), cy = Math.round(br.y + br.height / 2);
    const topEl = document.elementFromPoint(cx, cy);
    const reachable = !!(topEl && (topEl === b || b.contains(topEl) || topEl.contains(b)));
    if (!reachable) out.badButtons.push({ i, coveredBy: topEl ? (topEl.id || (topEl.className && topEl.className.toString().slice(0, 24)) || topEl.tagName) : '(null)' });
  });
  return out;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT);

  const profile = makeProfile('df_wreckstuck_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  const pageerr = [];
  page.on('pageerror', (e) => { if (pageerr.length < 20) pageerr.push(e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  await page.evaluateOnNewDocument(SEED, { cleared: ['goblin-mine', 'bandits-forest', 'lizard-swamp'], xp: 12000 });

  try {
    const TAVURL = '?dev=1&forcequest=sea-wreck&recruittalk=0';
    await page.goto('http://localhost:' + PORT + '/tavern.html' + TAVURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
    await sleep(300);
    await page.evaluate(() => { const sc = scenarios.find(s => s.id === 'sea-wreck'); prepScenario = sc; regeneratePartyMembers(); departToScenario(); });
    await page.waitForFunction("typeof runA2Event === 'function' && window.SkillCheck && typeof A2_EVENTS !== 'undefined'", { timeout: 60000 });
    console.log('[drv] index 着地。');

    for (let i = 0; i < 60; i++) {
      const gs = await page.evaluate(() => {
        const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
        const started = g(() => gameStarted, false);
        const d = document.getElementById('choiceDialog');
        const open = !!(d && d.classList.contains('show'));
        const sk = document.getElementById('skillCheckOverlay');
        if (!started && !open && !(sk && sk.classList.contains('show'))) document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return started;
      });
      if (gs) break;
      await sleep(200);
    }

    // 1) 入口 A2 を Esc で見送る (declined 化)
    let escDone = false;
    for (let i = 0; i < 40 && !escDone; i++) {
      const m = await page.evaluate(() => { const d = document.getElementById('choiceDialog'); return (d && d.classList.contains('show')) ? ((d.querySelector('.choiceMessage') || {}).textContent || '') : ''; });
      if (/傾いだ甲板|昇降口|潮の跡|鱗の痕跡/.test(m)) { await page.keyboard.press('Escape'); escDone = true; console.log('  [A2] Esc で見送り (declined 化)'); }
      await sleep(150);
    }
    check('(0) 入口 A2 を見送れた', escDone);

    // 見送り直後に declined=true になっていることを確認 (前提)
    const beforeCombat = await page.evaluate(() => { const ev = NODE_EVENTS.find(e => e.key === 'a2_wreck_scout'); return ev ? ev.declined : null; });
    check('(1) 見送った A2 は declined=true になった', beforeCombat === true, 'declined=' + beforeCombat);

    // 2) 自然な流れで戦闘を一巡させる。戦闘中ずっと #choiceDialog に亡霊ボタンが無いこと (forceClose の空化) を確認。
    //    その後プレイヤーを入口 (A2 判定点) 付近に居させ続け、割り込む判定パネルはロールして片付ける。
    let sawCombat = false, ghostDuringCombat = 0, reShown = null;
    for (let i = 0; i < 320; i++) {
      // 判定パネル (room search / 罠解除ロール) が出ていたらロールを押して進める
      await page.evaluate(() => { const sk = document.getElementById('skillCheckOverlay'); if (sk && sk.classList.contains('show')) { const b = sk.querySelector('#scRollBtn'); if (b) b.click(); } });
      // 罠「解除しますか?」は「解除する」で進める (A2 とは別の選択)
      await page.evaluate(() => {
        const d = document.getElementById('choiceDialog');
        if (d && d.classList.contains('show')) {
          const msg = (d.querySelector('.choiceMessage') || {}).textContent || '';
          if (/解除しますか/.test(msg)) { const btns = Array.from(d.querySelectorAll('.choiceButtons button')); const yes = btns.find(b => /解除する/.test(b.textContent) && !/メイジ/.test(b.textContent)) || btns[0]; if (yes) yes.click(); }
        }
      });
      const s = await page.evaluate(INSPECT);
      if (s.enc) { sawCombat = true; ghostDuringCombat = Math.max(ghostDuringCombat, s.btnCount); }
      // 戦闘が無いときは入口付近に留め (ユーザーの状況) ながら A2 の再提示を待つ
      if (!s.enc) await page.evaluate(() => { try { const ev = NODE_EVENTS.find(e => e.key === 'a2_wreck_scout'); const sp = ev.spot(ev); playerX = sp.tx * TILE_SIZE + TILE_SIZE / 2 - 48; playerY = sp.ty * TILE_SIZE + TILE_SIZE / 2 - 58; } catch (e) {} });
      if (sawCombat && !s.enc && s.show && /傾いだ甲板|昇降口|潮の跡|鱗の痕跡/.test(s.msg)) { reShown = s; break; }
      if (i % 20 === 0) console.log('    [poll ' + i + '] enc=' + s.enc + ' show=' + s.show + ' btn=' + s.btnCount + ' a2=' + JSON.stringify(s.a2));
      await sleep(200);
    }
    check('(2) 戦闘が一巡した', sawCombat);
    check('(3) 戦闘中ずっと #choiceDialog に亡霊ボタンが無い (forceClose が空化)', ghostDuringCombat === 0, 'max btnCount(戦闘中)=' + ghostDuringCombat);
    check('(4) 戦闘後、入口付近で A2 が再提示された (show=true)', !!reShown, reShown ? ('coOpen=' + reShown.coOpen + ' btns=' + reShown.btnCount) : '再提示されず');
    if (reShown) {
      await sleep(350);   // 0.2s フェードインが落ち着くのを待ってから最終状態を見る
      const settled = await page.evaluate(INSPECT);
      check('(5) 再提示 A2 のボタンが全て押せる (elementFromPoint 到達・opacity=1・pe=auto)',
        settled.badButtons.length === 0 && settled.dlgStyle.opacity === '1' && settled.dlgStyle.pe === 'auto',
        'bad=' + JSON.stringify(settled.badButtons) + ' style=' + JSON.stringify(settled.dlgStyle));
      check('(6) 再提示中は choice-open=true で戦闘ログを伏せている', reShown.coOpen === true, 'coOpen=' + reShown.coOpen);
      const clickRes = await page.evaluate(() => { const d = document.getElementById('choiceDialog'); const btns = Array.from(d.querySelectorAll('.choiceButtons button')); const act = btns.find(b => /読み解く|知覚/.test(b.textContent)) || btns[0]; if (!act) return { err: 'no btn' }; act.click(); return { after: d.classList.contains('show') }; });
      await sleep(300);
      check('(7) 実クリックで A2 が解決して閉じた', clickRes && clickRes.after === false, JSON.stringify(clickRes));
    }

    check('(Z) pageerror 0', pageerr.length === 0, pageerr.length ? JSON.stringify(pageerr) : 'none');
  } catch (e) {
    check('(FATAL) 例外なく通し', false, String((e && e.message) || e));
  } finally {
    await browser.close(); srv.close();
  }

  const pass = results.filter(r => r.ok).length, total = results.length;
  console.log('\n  ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})();
