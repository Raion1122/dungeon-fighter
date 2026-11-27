#!/usr/bin/env node
/*
 * probe_arcane_realplay.js — 「崩れた魔術師の塔」の魔力の暴発ナレを **実プレイ速度 (autoplay なし)** で観測する調査台。
 * verify_arcane_tower.js は autoplay 専用 = showDMMessage が narrationHold を立てない経路しか測れない。
 * 本台は autoplay を**付けず**、プレイヤーの代わりに定期クリックで語りを送って、
 * ボスノード (n1) で #dmMessage / narrationHold / narrationPlaying / surge の時系列を吐く。
 * 使い方: node tools/probe_arcane_realplay.js [--headful] [--max 300]
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
const MAXS = parseInt(arg('max', '320'), 10);
const PORT = parseInt(arg('port', '10942'), 10);

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
  const dm = document.getElementById('dmMessage');
  const dlg = document.getElementById('choiceDialog');
  const cc = document.querySelector('.charChoice, #charChoice, .choiceDialog');
  return {
    node: g(() => currentNodeId, null),
    bossNodeId: g(() => (RUN ? RUN.bossNodeId : null), null),
    started: g(() => !!gameStarted, false),
    over: g(() => !!gameOver, false),
    cleared: g(() => !!dungeonCleared, false),
    surge: g(() => (window.__arcaneSurgeProbe ? window.__arcaneSurgeProbe.length : -1), -1),
    dmShow: !!(dm && dm.classList.contains('show')),
    dmText: dm ? (dm.textContent || '').slice(0, 16) : null,
    nHold: g(() => !!narrationHold, false),
    nPlay: g(() => !!narrationPlaying, false),
    nodeBusy: g(() => !!nodeBusy, false),
    skillChk: g(() => !!skillCheckActive, false),
    dlgPaused: g(() => !!dialogPaused, false),
    sliding: g(() => !!heroSliding, false),
    encActive: g(() => !!encounterActive, false),
    hp: g(() => (typeof hp === 'number' ? hp : null), null),
    pTile: g(() => [Math.floor((playerX + 48) / TILE_SIZE), Math.floor((playerY + 58) / TILE_SIZE)], null),
    aliveEn: g(() => enemies.filter(e => e.alive).length, -1),
    bossAlive: g(() => enemies.filter(e => e.def && e.def.isBoss && e.alive).length, -1),
    choiceOpen: !!((dlg && dlg.classList.contains('show')) || (cc && cc.offsetParent !== null) || document.body.classList.contains('choice-open')),
    skillUi: g(() => { const s = document.querySelector('#skillCheckOverlay, .skillCheckBox, #skillCheck'); return !!(s && s.offsetParent !== null); }, false),
  };
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT + '  max=' + MAXS + 's  (autoplay なし = 実プレイ速度)');

  const profile = makeProfile('df_arcane_rp_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.log('  [pageerror] ' + e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  await page.evaluateOnNewDocument(SEED, { cleared: CLEARED, xp: 45000 });

  // 酒場を autoplay なしで開く → 塔へ出発 (departToScenario は tavern URL の autoplay を継ぐので付けない)
  await page.goto('http://localhost:' + PORT + '/tavern.html?dev=1&forcequest=arcane-tower&recruittalk=0', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
  await sleep(300);
  const kick = await page.evaluate(() => {
    try {
      const sc = scenarios.find(s => s.id === 'arcane-tower');
      prepScenario = sc; regeneratePartyMembers(); departToScenario();
      return { ok: true, party: (selection.partyMembers || []).length };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  });
  console.log('[drv] 出発: ' + JSON.stringify(kick));

  await page.waitForFunction("typeof mapData !== 'undefined' && typeof heroAI === 'function'", { timeout: 60000 });
  console.log('[drv] index 着地: ' + page.url());

  // 開幕の導入ナレ (playNarration = narrationPlaying) が**完全に終わって**、ゲームが n0 で動き出すまで待つ。
  // ⚠ gameStarted だけでは足りない (導入ナレ中も true になり得る)。narrationPlaying が落ち、
  //    #dmNarration オーバーレイが畳まれ、currentNodeId=entry に居るところまで待って初めて実プレイ相当。
  try {
    await page.waitForFunction(() => {
      try {
        const overlay = document.getElementById('dmNarration');
        const overlayHidden = !overlay || overlay.style.display === 'none' || overlay.offsetParent === null;
        return (typeof gameStarted !== 'undefined' && gameStarted === true)
            && (typeof narrationPlaying === 'undefined' || narrationPlaying === false)
            && overlayHidden
            && (typeof currentNodeId !== 'undefined' && RUN && currentNodeId === RUN.graph.entry);
      } catch (e) { return false; }
    }, { timeout: 90000 });
  } catch (e) { console.log('[drv] 開幕待ち timeout'); }
  await sleep(1500);
  // ⚡ n0 の低速戦闘を省くため **ボスノード (n1) へ直接遷移**して、ボス部屋到達の実プレイ挙動
  //   (到着ナレ→ボス部屋の囁き→魔力の暴発) を忠実に再現する。enterNode は実プレイの遷移口そのもの。
  const jump = await page.evaluate(() => {
    try {
      if (typeof enterNode === 'function' && RUN && RUN.bossNodeId) { enterNode(RUN.bossNodeId); return { ok: true, to: RUN.bossNodeId }; }
      return { ok: false, err: 'enterNode/RUN 不在' };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  });
  console.log('[drv] ボスノードへ直接遷移: ' + JSON.stringify(jump));

  // プレイヤー代わりのクリック: Begin-gate 解除 + 開幕の語り送り。
  // ⚠ gameStarted になったら**クリックを止める** (gameStarted が一瞬 false の隙に click が startGame を
  //    再呼び出しして n0 へ戻り続ける無限ループを避ける)。開幕後の語り (ボス部屋の囁き等) は
  //    waitForNarrationAdvance が 2500ms で自動送りするのでクリック不要。
  let stopClicks = false;
  (async () => {
    while (!stopClicks) {
      // 常にクリック (Begin-gate 解除 + 開幕/道中の語り送り)。gameStarted が true になった後は
      // click ハンドラの startGame 枝 (!gameStarted 必須) に入らないので再入しない。
      try { await page.mouse.click(6, 6); } catch (e) {}
      // 選択/技能判定ダイアログが開いていたら、その中のボタンを実際に押す (隅クリックでは閉じないため)
      try {
        await page.evaluate(() => {
          const sel = ['#choiceDialog .choiceYes', '#choiceDialog button', '.charChoice button',
                       '#skillCheckOverlay button', '.skillCheckBox button', '.choiceBtn', '.choiceOption',
                       '.exitArrow'];
          for (const s of sel) { const b = document.querySelector(s); if (b && b.offsetParent !== null) { b.click(); return; } }
        });
      } catch (e) {}
      await sleep(900);
    }
  })();

  const t0 = Date.now();
  let reachedBoss = false, surgeAt = null, lastNode = null, lastHeartbeat = 0;
  let bossLog = 0;
  while ((Date.now() - t0) / 1000 < MAXS) {
    await sleep(500);
    let t; try { t = await page.evaluate(TICK); } catch (e) { continue; }
    const el = Math.round((Date.now() - t0) / 1000);
    if (t.node !== lastNode) { console.log('[' + el + 's] → ノード ' + t.node + ' (boss=' + t.bossNodeId + ')'); lastNode = t.node; }
    if (el - lastHeartbeat >= 6) {
      lastHeartbeat = el;
      console.log('  . [' + el + 's] node=' + t.node + ' started=' + t.started + ' nHold=' + t.nHold
        + ' nPlay=' + t.nPlay + ' busy=' + t.nodeBusy + ' slide=' + t.sliding + ' skill=' + t.skillChk
        + ' dlgP=' + t.dlgPaused + ' choice=' + t.choiceOpen + ' skillUi=' + t.skillUi
        + ' enc=' + t.encActive + ' hp=' + t.hp + ' pTile=' + JSON.stringify(t.pTile)
        + ' aliveEn=' + t.aliveEn + ' surge=' + t.surge);
    }
    if (t.node && t.bossNodeId && t.node === t.bossNodeId) {
      if (!reachedBoss) { reachedBoss = true; console.log('[' + el + 's] ★ ボスノード到達 — 以後 毎 tick を記録'); }
      // ボスノードでは毎 tick を出す (surge 発火まで)
      if (bossLog < 120 && surgeAt == null) {
        console.log('  [' + el + 's] dmShow=' + t.dmShow + ' dm="' + t.dmText + '" nHold=' + t.nHold
          + ' nPlay=' + t.nPlay + ' busy=' + t.nodeBusy + ' skill=' + t.skillChk
          + ' enc=' + t.encActive + ' surge=' + t.surge + ' hp=' + t.hp + ' bossAlive=' + t.bossAlive);
        bossLog++;
      }
    }
    if (t.surge >= 1 && surgeAt == null) { surgeAt = el; console.log('[' + el + 's] ✅✅ 魔力の暴発ナレ発火 (surge=' + t.surge + ')'); }
    if (t.over || t.cleared) { console.log('[' + el + 's] 決着: ' + (t.cleared ? 'clear' : 'defeat') + ' hp=' + t.hp + ' surge=' + t.surge); break; }
  }
  stopClicks = true;
  console.log('\n══ 結論 ══');
  console.log('ボスノード到達: ' + reachedBoss);
  console.log('魔力の暴発ナレ発火: ' + (surgeAt != null ? ('はい (' + surgeAt + 's)') : 'いいえ (実プレイ速度で一度も出なかった)'));

  try { await browser.close(); } catch (e) {}
  srv.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(3); });
