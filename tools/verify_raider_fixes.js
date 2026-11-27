#!/usr/bin/env node
/*
 * verify_raider_fixes.js — 街道の襲撃者の野営地 (raider-camp) の 2 件の検証/修正を実機 Chrome で確かめる。
 *
 *   不具合#1 (依頼人ガレスの肖像が出ない): CLIENT_ART / SCENE_ART に "orc-fort" 流用エイリアスを
 *     足した修正を検証する。tavern で raider-camp の受注ナレ挿絵 src が assets/client_orc-fort.png /
 *     assets/scene_orc-fort.png へ解決し、どちらも HTTP 200 で、受注ナレ overlay に肖像が出る (hidden でない) こと。
 *     対照 = goblin-mine は自分の立ち絵のまま / 別の本筋外 (tower-mother 等) は null = 暗い帯のまま (非退行)。
 *
 *   不具合#2 (技能判定 DC の確認): 罠の知覚 DC (scenario perceptionDC) = 13 と A2 イベントの DC = 12 が
 *     別物で混同が無いこと。A2 を「観察する」で発火させ、SkillCheck へ渡る dc が 12 / check=perception で、
 *     rogue/elf が居ると加算側に +2 (DC は 12 のまま) であることを実測する。
 *
 * 使い方: node tools/verify_raider_fixes.js [--headful] [--port 10721]
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
const PORT = parseInt(arg('port', '10721'), 10);

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

function SEED(cfg) {
  try {
    if (sessionStorage.getItem('__dfRaiderPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfRaiderPurged', '1');
  } catch (e) {}
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] serving ' + ROOT + '  :' + PORT);

  const profile = makeProfile('df_raiderfix_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  const pageerr = [];
  page.on('pageerror', (e) => { if (pageerr.length < 10) pageerr.push(e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  const seed = { cleared: ['goblin-mine', 'bandits-forest'], xp: 6000 };
  await page.evaluateOnNewDocument(SEED, seed);

  const shotPath = path.join(os.tmpdir(), 'raider_portrait_after.png');

  try {
    // ════════ 不具合#1: 依頼人ガレスの肖像 (受注ナレ挿絵) ════════
    const TAVURL = '?dev=1&unlockall=1&forcequest=raider-camp&recruittalk=0';
    await page.goto('http://localhost:' + PORT + '/tavern.html' + TAVURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof scenarios !== 'undefined' && typeof artSourceId === 'function' && typeof playQuestAcceptNarration === 'function'", { timeout: 30000 });
    await sleep(300);

    // 解決される立ち絵/風景の src を読む (3 件: 対象 raider-camp / 対照 goblin-mine / 非退行 tower-mother)
    const resolved = await page.evaluate(async () => {
      function srcFor(map, prefix, id) {
        const sid = (typeof artSourceId === 'function') ? artSourceId(map, id) : null;
        return sid ? ('assets/' + prefix + '_' + sid + '.png') : null;
      }
      async function status(url) {
        if (!url) return 0;
        try { const r = await fetch(url, { method: 'GET', cache: 'no-store' }); return r.status; } catch (e) { return -1; }
      }
      const out = {};
      for (const id of ['raider-camp', 'goblin-mine', 'tower-mother']) {
        const cl = srcFor(CLIENT_ART, 'client', id);
        const sc = srcFor(SCENE_ART, 'scene', id);
        out[id] = { client: cl, scene: sc, clientStatus: await status(cl), sceneStatus: await status(sc),
                    clientRaw: CLIENT_ART[id] === undefined ? null : CLIENT_ART[id],
                    sceneRaw: SCENE_ART[id] === undefined ? null : SCENE_ART[id] };
      }
      return out;
    });
    const R = resolved['raider-camp'], G = resolved['goblin-mine'], T = resolved['tower-mother'];
    check('(1a) raider-camp 立ち絵 → assets/client_orc-fort.png',
      R.client === 'assets/client_orc-fort.png' && R.clientRaw === 'orc-fort', 'client=' + R.client + ' raw=' + R.clientRaw);
    check('(1b) raider-camp 風景 → assets/scene_orc-fort.png',
      R.scene === 'assets/scene_orc-fort.png' && R.sceneRaw === 'orc-fort', 'scene=' + R.scene + ' raw=' + R.sceneRaw);
    check('(1c) 流用先 2 ファイルが HTTP 200 (実在)',
      R.clientStatus === 200 && R.sceneStatus === 200, 'client=' + R.clientStatus + ' scene=' + R.sceneStatus);
    check('(1d) 対照: goblin-mine は自分の立ち絵/風景のまま (true)',
      G.client === 'assets/client_goblin-mine.png' && G.scene === 'assets/scene_goblin-mine.png' && G.clientRaw === true,
      'client=' + G.client + ' raw=' + G.clientRaw);
    check('(1e) 非退行: 別の本筋外 (tower-mother) は立ち絵/風景なし = null (暗い帯のまま)',
      T.client === null && T.scene === null, 'client=' + T.client + ' scene=' + T.scene);

    // 受注ナレ overlay を実際に出して、挿絵 (scene) と肖像 (portrait) が入ることを確かめる
    const narr = await page.evaluate(() => {
      const sc = scenarios.find(s => s.id === 'raider-camp');
      try { playQuestAcceptNarration(sc); } catch (e) { return { err: String(e) }; }
      return { fired: true };
    });
    await sleep(600);
    const art = await page.evaluate(() => {
      const scene = document.getElementById('questAcceptScene');
      const portrait = document.getElementById('questAcceptPortrait');
      const overlay = document.getElementById('prologueOverlay');
      return {
        overlayShown: overlay && getComputedStyle(overlay).display !== 'none',
        questAccept: overlay && overlay.classList.contains('quest-accept'),
        sceneSrc: scene ? (scene.getAttribute('src') || null) : null,
        portraitSrc: portrait ? (portrait.getAttribute('src') || null) : null,
        portraitHidden: portrait ? portrait.classList.contains('hidden') : null,
      };
    });
    // 見た目の証拠 (挿絵帯の screenshot)
    try {
      const el = await page.$('#questAcceptArt');
      if (el) await el.screenshot({ path: shotPath });
    } catch (e) {}
    check('(1f) 受注ナレ overlay が quest-accept で開く', art.overlayShown === true && art.questAccept === true,
      'shown=' + art.overlayShown + ' qa=' + art.questAccept);
    check('(1g) 挿絵 scene に orc-fort の風景 src が入る', art.sceneSrc === 'assets/scene_orc-fort.png', 'sceneSrc=' + art.sceneSrc);
    check('(1h) 肖像 portrait が表示 (hidden でない) & orc-fort の立ち絵 src',
      art.portraitHidden === false && art.portraitSrc === 'assets/client_orc-fort.png',
      'hidden=' + art.portraitHidden + ' portraitSrc=' + art.portraitSrc);

    // ════════ 不具合#2: 技能判定 DC (罠 13 と A2 12 は別物) ════════
    // tavern から raider-camp へ出発し index へ着地する (autoplay=30 を override で渡し __diagEnabled + 稼働状態にする)
    const kick = await page.evaluate(() => {
      try {
        const sc = scenarios.find(s => s.id === 'raider-camp');
        prepScenario = sc; regeneratePartyMembers(); departToScenario(30);
        return { kicked: true };
      } catch (e) { return { err: String((e && e.message) || e) }; }
    });
    check('(2a) raider-camp へ出発 (departToScenario)', kick.kicked === true, 'err=' + (kick.err || 'none'));

    let landed = null;
    try { await page.waitForFunction("typeof mapData !== 'undefined' && typeof A2_EVENTS !== 'undefined' && typeof runA2Event === 'function' && typeof allies !== 'undefined' && window.SkillCheck", { timeout: 60000 }); landed = page.url(); }
    catch (e) { landed = 'TIMEOUT url=' + page.url(); }
    await sleep(1200);

    const dc = await page.evaluate(async () => {
      const out = {};
      out.trapDC = (typeof SCENARIOS !== 'undefined' && SCENARIOS['raider-camp']) ? SCENARIOS['raider-camp'].perceptionDC : null;
      out.a2DC = (typeof A2_EVENTS !== 'undefined' && A2_EVENTS['raider-camp']) ? A2_EVENTS['raider-camp'].dc : null;
      out.a2Check = (typeof A2_EVENTS !== 'undefined' && A2_EVENTS['raider-camp']) ? A2_EVENTS['raider-camp'].check : null;
      out.a2Classes = (typeof A2_EVENTS !== 'undefined' && A2_EVENTS['raider-camp']) ? String(A2_EVENTS['raider-camp'].classes) : null;

      // --- A2 を「観察する」で発火させ、SkillCheck へ渡る (dc, check, extraBonus) を 2 条件で捕まえる ---
      try {
        const orig = window.SkillCheck.resolveSkillCheck;
        let last = null;
        window.SkillCheck.resolveSkillCheck = function (checkKey, dcArg, party, opts) {
          last = { checkKey, dc: dcArg, extraBonus: opts ? opts.extraBonus : undefined,
                   partyClasses: (party || []).map(function (m) { return m.classKey; }).join(',') };
          // 判定後の applyA2Result が落ちないよう良性の結果を返す
          return Promise.resolve({ success: true, crit: false, fumble: false, total: 99, dc: dcArg,
                                   rep: { name: (party && party[0] && party[0].name) || 'test' } });
        };
        window.showCharChoice = function () { return Promise.resolve(1); };   // 常に「観察する」

        const savedAllies = allies.slice();
        // (i) 戦士ソロ (= ユーザーのテスト条件): allies を空にして発火 → dc=12 / extraBonus=0
        allies.length = 0;
        last = null;
        await runA2Event({}, A2_EVENTS['raider-camp']);
        out.capSolo = last;
        // (ii) elf を 1 人だけ在籍させて発火 → dc は 12 のまま / extraBonus=+2 (加算側へ)。
        //      実在する仲間オブジェクト (装備ゲッターが読む全フィールドを持つ) を elf へ付け替える。
        out.hadRealAlly = savedAllies.length > 0;
        allies.length = 0;
        if (savedAllies.length > 0) {
          const e = savedAllies[0]; e.classKey = 'elf'; e.alive = true; allies.push(e);
        } else {
          allies.push({ alive: true, classKey: 'elf', npcName: 'テストエルフ', equippedSkills: [], inventory: {}, def: { name: 'elf' } });
        }
        last = null;
        await runA2Event({}, A2_EVENTS['raider-camp']);
        out.capElf = last;
        // 後始末 (この後ブラウザは閉じるが一応戻す)
        allies.length = 0; savedAllies.forEach(function (a) { allies.push(a); });
        window.SkillCheck.resolveSkillCheck = orig;
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    check('(2b) 罠の知覚 DC (scenario perceptionDC) = 13', dc.trapDC === 13, 'trapDC=' + dc.trapDC);
    check('(2c) A2 イベント DC = 12 / check=perception / classes=rogue,elf',
      dc.a2DC === 12 && dc.a2Check === 'perception' && dc.a2Classes === 'rogue,elf',
      'dc=' + dc.a2DC + ' check=' + dc.a2Check + ' classes=' + dc.a2Classes);
    check('(2d) 罠 DC13 と A2 DC12 は別物 (混同なし)', dc.trapDC === 13 && dc.a2DC === 12, 'trap=' + dc.trapDC + ' a2=' + dc.a2DC);
    const cS = dc.capSolo, cE = dc.capElf;
    check('(2e) 戦士ソロでも A2 を「観察」で発火 → SkillCheck へ dc=12 / check=perception',
      cS && cS.dc === 12 && cS.checkKey === 'perception', 'solo=' + JSON.stringify(cS) + ' err=' + (dc.err || 'none'));
    check('(2f) 戦士ソロは加算 +0 (DC12 のまま = 罠DC13 と混ざらない)', cS && cS.extraBonus === 0, 'extraBonus=' + (cS ? cS.extraBonus : 'n/a'));
    check('(2g) elf 在籍でも DC は 12 のまま / 加算側 +2 (DC を下げない)',
      cE && cE.dc === 12 && cE.extraBonus === 2, 'elf=' + JSON.stringify(cE));

    check('(Z) pageerror 0', pageerr.length === 0, pageerr.length ? JSON.stringify(pageerr) : 'none');
  } catch (e) {
    check('(FATAL) 例外なく通し', false, String((e && e.message) || e));
  } finally {
    await browser.close(); srv.close();
  }

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\n  ' + pass + '/' + results.length + '  PASSED   FAILED ' + fail);
  if (fs.existsSync(shotPath)) console.log('  [shot] 受注ナレ挿絵: ' + shotPath);
  process.exit(fail ? 1 : 0);
})();
