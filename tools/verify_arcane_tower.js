#!/usr/bin/env node
/*
 * verify_arcane_tower.js — 「崩れた魔術師の塔」(arcane-tower) の検証台 (2026-11-27 ブリッジ依頼)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 依頼: b1c6474 で足した塔を「実機プレイでの開始からクリアまで」確かめる。公開ビルドで
 *       塔を開始できるテスト手段が無かった (卓の抽選が運任せ) ので、dev 専用の
 *       ?forcequest=<id> を足した。本台はその手段と、塔の n0→n1→lich→クリアを測る。
 *
 * ■ 測ること
 *   §A 盤面     : 砦クリア済みセーブ + ?dev=1&forcequest=arcane-tower で、卓に塔の札が出る
 *   §B 非永続   : テストスイッチ中は localStorage['dragonfighters.questBoard'] を書かない
 *   §C dev 行   : ?dev=1 で body.dev-mode が付き #debugAutoplayRow が flex (依頼の問題1)
 *   §D ゲート   : dev 無しの ?forcequest は無視され、通常どおり questBoard が保存される (非チート)
 *   §E 構造     : 着地した index で RUN.entry=n0 / boss=lich / A2(arcana,DC13) 登録 / 罠 n1=manaRune /
 *                 魔力の暴発ナレ関数が在る
 *   §F プレイ   : ?autoplay で n0→n1→lich を巡り、魔力の暴発ナレが発火し、決着 (clear/defeat/timeout)
 *
 * 使い方: node tools/verify_arcane_tower.js [--headful] [--browser <path>] [--speed 20] [--max 300]
 * exit 0=装置 assert が全部期待どおり / 1=崩れた / 2=環境不足 / 3=例外
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
const SPEED = parseInt(arg('speed', '20'), 10);
const MAXS = parseInt(arg('max', '300'), 10);
const PORT = parseInt(arg('port', '10941'), 10);

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
  console.error('[drv] ブラウザが見つかりません。--browser <path> で指定してください'); process.exit(2);
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

/* 砦クリア済みのテスト用セーブを localStorage へ焼く (orc-fort クリア = 塔が解放済み)。
   ⚠ dragonfighters.* を purge → prologueSeen / cleared / xp を置く。questBoard は置かない。 */
const CLEARED = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort'];
function SEED(cfg) {
  try {
    // ⚠⚠ 一度だけ purge する。index.html への遷移で再実行されると departToScenario() が
    //    sessionStorage へ置いた currentScenario を消してしまい、既定の廃坑へ落ちる
    //    (probe_s2_clear.js の __dfProbePurged と同じ番兵。接頭辞は dragonfighters./df. の外)。
    if (sessionStorage.getItem('__dfArcanePurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));   // Lv10 相当で autoplay に勝ち目を与える
    sessionStorage.setItem('__dfArcanePurged', '1');
  } catch (e) {}
}

async function openTavern(browser, qs, seedCfg) {
  const page = await browser.newPage();
  page.__warns = [];
  page.on('console', (m) => { try { page.__warns.push(m.text()); } catch (e) {} });
  page.on('pageerror', (e) => { page.__pageerr = (page.__pageerr || []); if (page.__pageerr.length < 5) page.__pageerr.push(e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  if (seedCfg) await page.evaluateOnNewDocument(SEED, seedCfg);
  await page.goto('http://localhost:' + PORT + '/tavern.html' + qs, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function' && typeof regeneratePartyMembers === 'function'", { timeout: 30000 });
  // buildSigns は初期化で走るが、念のため refresh を一度促す
  await page.evaluate(() => { try { if (typeof window.__tavernRefreshSigns === 'function') window.__tavernRefreshSigns(); } catch (e) {} });
  await sleep(300);
  return page;
}

const TICK = () => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  const encIdx = g(() => encounterEnemyIndices.slice(), []);
  return {
    scen: g(() => scenarioId, null),
    node: g(() => currentNodeId, null),
    over: g(() => !!gameOver, false),
    cleared: g(() => !!dungeonCleared, false),
    bossNodeId: g(() => (RUN ? RUN.bossNodeId : null), null),
    surge: g(() => (window.__arcaneSurgeProbe ? window.__arcaneSurgeProbe.length : -1), -1),
    encNames: g(() => encIdx.map(i => { const e = enemies[i]; return e ? ((e.def && e.def.name) || e.name || '?') : '?'; }), []),
    bossAlive: g(() => enemies.filter(e => e.def && e.def.isBoss && e.alive).length, -1),
    bossTotal: g(() => enemies.filter(e => e.def && e.def.isBoss).length, -1),
    hp: g(() => (typeof hp === 'number' ? hp : null), null),
  };
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT + '  speed=' + SPEED + '  max=' + MAXS + 's');

  const profile = makeProfile('df_arcane_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  try {
    // ─────────── §A〜§C: dev + forcequest (砦クリア済みセーブ) ───────────
    console.log('\n── §A/§B/§C: ?dev=1&forcequest=arcane-tower (砦クリア済みセーブ) ──');
    const seed = { cleared: CLEARED, xp: 45000 };
    // ⚠ recruittalk=0: 誰も誘っていない headless では #54 のソロ化を外し、通常の 4 人編成で出発させる
    //   (塔の実機プレイ検証は「ちゃんと組んだパーティ」で行う。dev/forcequest の判定には無関係)。
    const pf = await openTavern(browser, '?autoplay=' + SPEED + '&dev=1&forcequest=arcane-tower&recruittalk=0', seed);
    const gA = await pf.evaluate(() => {
      const sign = document.querySelector('[data-scenario="arcane-tower"]');
      const arow = document.getElementById('debugAutoplayRow');
      let qb = null; try { qb = localStorage.getItem('dragonfighters.questBoard'); } catch (e) {}
      const sc = (typeof scenarios !== 'undefined') ? scenarios.find(s => s.id === 'arcane-tower') : null;
      return {
        hasTowerSign: !!sign,
        signName: sign ? (sign.textContent || '').trim().slice(0, 24) : null,
        unlocked: sc ? (typeof isUnlocked === 'function' ? isUnlocked(sc) : null) : null,
        devClass: document.body.classList.contains('dev-mode'),
        devMode: window.__dfDevMode === true,
        lsDev: (function () { try { return localStorage.getItem('df.devMode'); } catch (e) { return '(err)'; } })(),
        autoRowDisplay: arow ? getComputedStyle(arow).display : null,
        questBoardLS: qb,
      };
    });
    check('(A1) 塔が解放済みセーブ (orc-fort クリア) で isUnlocked', gA.unlocked === true, 'unlocked=' + gA.unlocked);
    check('(A2) 卓に「崩れた魔術師の塔」の札が出る (forcequest で決定論)', gA.hasTowerSign === true, 'sign=' + JSON.stringify(gA.signName));
    check('(B1) テストスイッチ中は questBoard を localStorage へ書かない', gA.questBoardLS === null, 'questBoard=' + gA.questBoardLS);
    check('(C1) ?dev=1 で body.dev-mode が付く (依頼の問題1)', gA.devClass === true && gA.devMode === true, 'devClass=' + gA.devClass + ' devMode=' + gA.devMode);
    check('(C2) ?dev=1 で df.devMode が localStorage に焼かれる', gA.lsDev === '1', 'lsDev=' + gA.lsDev);
    check('(C3) #debugAutoplayRow が flex (デバッグ行が出る)', gA.autoRowDisplay === 'flex', 'display=' + gA.autoRowDisplay);
    check('(C4) §A〜§C で pageerror 0', !(pf.__pageerr && pf.__pageerr.length), 'pageerr=' + JSON.stringify(pf.__pageerr || []));

    // ─────────── §D: dev 無しの ?forcequest は無視される (非チート) ───────────
    console.log('\n── §D: dev 無し ?forcequest は無視され通常どおり保存される ──');
    const pd = await openTavern(browser, '?forcequest=arcane-tower', { cleared: CLEARED, xp: 45000 });
    await sleep(400);
    const gD = await pd.evaluate(() => {
      let qb = null; try { qb = localStorage.getItem('dragonfighters.questBoard'); } catch (e) {}
      return { devMode: window.__dfDevMode === true, questBoardLS: qb };
    });
    check('(D1) dev 無しでは dev-mode が付かない', gD.devMode === false, 'devMode=' + gD.devMode);
    check('(D2) dev 無しでは通常どおり questBoard が保存される (スイッチがゲートされている)', typeof gD.questBoardLS === 'string' && gD.questBoardLS.indexOf('seats') >= 0, 'questBoard=' + String(gD.questBoardLS).slice(0, 60));
    const warnGate = (pd.__warns || []).some(t => t.indexOf('forcequest') >= 0 && t.indexOf('無視') >= 0);
    check('(D3) 無視時に console.warn が出る (静かな失敗にしない)', warnGate, (pd.__warns || []).filter(t => t.indexOf('forcequest') >= 0).slice(0, 1).join(' | ') || '(warn なし)');
    await pd.close();

    // ─────────── §E/§F: 塔へ出発して index で構造 + プレイを測る ───────────
    console.log('\n── §E/§F: 塔へ出発 → index 着地 → n0→n1→lich→クリア ──');
    const TAVURL = '?autoplay=' + SPEED + '&dev=1&forcequest=arcane-tower&recruittalk=0';
    /* ⚠ 決着 (clear) は Lv10 4 人 vs リッチの戦闘 RNG に左右される (推奨 Lv7・バランス値は「出発点」で
       今回は変えない方針)。構造 (§E) と到達・ボス対峙・ナレ発火 (F1〜F3) は毎回決定論なので、
       「塔は最後までクリアできる」= 最大 PLAY_TRIES 回のうち 1 回でもクリアすれば満たすとみなす。 */
    const PLAY_TRIES = 3;
    let gE = null;
    const agg = { visited: new Set(), surgePeak: 0, bossSeen: false, lichSeen: false, clears: 0, outcomes: [] };
    for (let attempt = 1; attempt <= PLAY_TRIES; attempt++) {
      if (attempt > 1) {
        // タブを酒場へ戻して再出発 (sessionStorage の番兵が purge を抑えるので cleared/xp は保たれる)
        await pf.goto('http://localhost:' + PORT + '/tavern.html' + TAVURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await pf.waitForFunction("typeof scenarios !== 'undefined' && typeof departToScenario === 'function'", { timeout: 30000 });
        await sleep(200);
      }
      const kick = await pf.evaluate(() => {
        const out = { err: null };
        try {
          const sc = scenarios.find(s => s.id === 'arcane-tower');
          if (!sc) { out.err = 'scenario not found'; return out; }
          out.unlocked = (typeof isUnlocked === 'function') ? isUnlocked(sc) : null;
          prepScenario = sc;
          regeneratePartyMembers();
          out.party = (selection.partyMembers || []).length;
          departToScenario();   // autoplay は tavern の URL (=SPEED) から引き継ぐ
          out.kicked = true;
        } catch (e) { out.err = String((e && e.message) || e); }
        return out;
      });
      if (attempt === 1) check('(E0) 塔へ出発できた (departToScenario)', kick.kicked === true && !kick.err, 'err=' + kick.err + ' party=' + kick.party);

      let landed = null;
      try { await pf.waitForFunction("typeof mapData !== 'undefined' && typeof heroAI === 'function'", { timeout: 60000 }); landed = pf.url(); }
      catch (e) { landed = 'TIMEOUT url=' + pf.url(); }
      await sleep(800);

      if (attempt === 1) {
        gE = await pf.evaluate(() => {
          const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
          let events = [];
          try { events = window.__graphRun ? window.__graphRun.events().map(e => ({ key: e.key, nodeId: e.nodeId })) : []; } catch (e) {}
          const a2 = (typeof A2_EVENTS !== 'undefined') ? A2_EVENTS['arcane-tower'] : null;
          let bossKind = null;
          try {
            const bn = RUN.byId[RUN.bossNodeId];
            const md = bn && bn.mapDef;
            const bs = md && (md.bossSlot || (md.rooms && md.rooms.map(r => r.bossSlot).find(Boolean)));
            bossKind = bs ? (bs.kind || bs[2] || null) : null;
          } catch (e) {}
          return {
            scen: g(() => scenarioId, null),
            entry: g(() => (RUN ? RUN.graph.entry : null), null),
            bossNodeId: g(() => (RUN ? RUN.bossNodeId : null), null),
            a2: a2 ? { key: a2.key, check: a2.check, dc: a2.dc, classes: a2.classes } : null,
            a2RegisteredOnEntry: events.some(e => e.key === 'a2_tower_arcana' && e.nodeId === (RUN ? RUN.graph.entry : null)),
            a2On: g(() => A2_SKILL_EVENTS_ON, null),
            trapN1: g(() => (currentScenario && currentScenario.trapTypeByNode ? currentScenario.trapTypeByNode.n1 : null), null),
            trapN0: g(() => (currentScenario && currentScenario.trapTypeByNode ? currentScenario.trapTypeByNode.n0 : null), null),
            surgeFnExists: g(() => (typeof tryArcaneSurgeNarration === 'function'), false),
            surgeProbe: g(() => Array.isArray(window.__arcaneSurgeProbe), false),
            bossKind: bossKind,
          };
        });
        check('(E1) index 着地 & scenarioId = arcane-tower', /\/index\.html/.test(String(landed)) && gE.scen === 'arcane-tower', 'landed=' + landed + ' scen=' + gE.scen);
        check('(E2) RUN.entry = n0', gE.entry === 'n0', 'entry=' + gE.entry);
        check('(E3) ボスノードのボスキーが lich', gE.bossKind === 'lich', 'bossKind=' + gE.bossKind + ' bossNode=' + gE.bossNodeId);
        check('(E4) A2 判定が arcana / DC13 / mage,elf', gE.a2 && gE.a2.check === 'arcana' && gE.a2.dc === 13 && String(gE.a2.classes) === 'mage,elf', 'a2=' + JSON.stringify(gE.a2));
        check('(E5) A2 イベントが n0 に登録されている', gE.a2On ? gE.a2RegisteredOnEntry === true : true, 'a2On=' + gE.a2On + ' reg=' + gE.a2RegisteredOnEntry);
        check('(E6) 罠 n1 = manaRune / n0 = glyph', gE.trapN1 === 'manaRune' && gE.trapN0 === 'glyph', 'n0=' + gE.trapN0 + ' n1=' + gE.trapN1);
        check('(E7) 魔力の暴発ナレ関数と probe が在る', gE.surgeFnExists === true && gE.surgeProbe === true, 'fn=' + gE.surgeFnExists + ' probe=' + gE.surgeProbe);
      }

      // §F: autoplay を観測
      const t0 = Date.now();
      const visited = new Set();
      let last = null, surgePeak = 0, bossSeen = false, lichSeen = false;
      while ((Date.now() - t0) / 1000 < MAXS) {
        await sleep(1000);
        const t = await pf.evaluate(TICK);
        last = t;
        if (t.node) visited.add(t.node);
        if (t.surge > surgePeak) surgePeak = t.surge;
        if (t.bossTotal > 0) bossSeen = true;
        if ((t.encNames || []).some(n => /リッチ|lich/i.test(n))) lichSeen = true;
        if (t.over || t.cleared) break;
      }
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const outcome = last && last.cleared ? 'clear' : (last && last.over ? 'defeat' : 'timeout');
      visited.forEach(v => agg.visited.add(v));
      agg.surgePeak = Math.max(agg.surgePeak, surgePeak);
      agg.bossSeen = agg.bossSeen || bossSeen;
      agg.lichSeen = agg.lichSeen || lichSeen;
      if (outcome === 'clear') agg.clears++;
      agg.outcomes.push(outcome + '(HP' + (last ? last.hp : '?') + ',' + elapsed + 's)');
      console.log('  [play ' + attempt + '/' + PLAY_TRIES + '] 決着=' + outcome + '  到達ノード=' + Array.from(visited).join('→')
        + '  surgeナレ発火=' + surgePeak + '  ボス出現=' + bossSeen + '  リッチ交戦=' + lichSeen
        + '  経過=' + elapsed + 's  最終HP=' + (last ? last.hp : '?'));
      if (outcome === 'clear') break;   // クリアできたら十分 (塔が最後まで遊べることは示せた)
    }

    check('(F1) n0 と n1 の両方を巡った', agg.visited.has('n0') && agg.visited.has('n1'), 'visited=' + Array.from(agg.visited).join(','));
    check('(F2) ボス (リッチ) と対峙した', agg.bossSeen === true && (agg.lichSeen || agg.surgePeak >= 1), 'bossSeen=' + agg.bossSeen + ' lichSeen=' + agg.lichSeen);
    check('(F3) 「魔力の暴発」ナレが発火した (probe >= 1)', agg.surgePeak >= 1, 'surgePeak=' + agg.surgePeak);
    check('(F4) 塔を最後までクリアできる (最大 ' + PLAY_TRIES + ' 回のうち 1 回以上)', agg.clears >= 1, 'clears=' + agg.clears + '/' + agg.outcomes.length + ' outcomes=' + agg.outcomes.join(','));
    check('(F5) §E/§F で pageerror 0', !(pf.__pageerr && pf.__pageerr.length), 'pageerr=' + JSON.stringify(pf.__pageerr || []));

    await pf.close();
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
