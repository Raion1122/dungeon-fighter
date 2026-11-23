#!/usr/bin/env node
/*
 * driver_a2_skill_events.js — A2「ダンジョン内の技能判定イベント拡充」回帰ドライバ
 * ═══════════════════════════════════════════════════════════════════════════════
 * 2026-11-23 開発会議トリアージ (dev-meetings/2026-11-23_dnd-flavor-gimmicks.md) の
 * A2 =「実施」。index.html の A2 ブロック (runA2Event / applyA2Result / A2_EVENTS /
 * registerNodeEvent) が、3 シナリオの入場ノードへ技能判定イベントを足したことを測る。
 *
 * 【測ること】
 *   §R 登録    : events() に a2_* が nodeId=entry / radius=240 で載る (3 シナリオ)
 *   §H 配置    : entry で eventsHere() に a2_* が含まれ、spot が壁でない床へ落ちる
 *   §0 撤退    : ?a2=0 で event が **1 件も載らない** (負のコントロール)
 *   §D 決定論  : ?autoplay で候補 0 を自動選択 → d20 を 1 度も引かない / HP 不変 / 発火済
 *   §1 判定成功: 候補 1「調べる」→ dfSkillCheck が **その技能・その DC** で 1 回呼ばれる
 *   §2 救済    : 通常失敗 (DC 未達) で **HP 不変**・進行継続 (見逃すだけ)
 *   §3 ファンブル: 運動 (temple) だけ HP が減る / 知識・知覚 (fort/dragon) は HP 不変 (罠解除トーン)
 *   §4 クリ    : ナチュ20 を成功として扱い HP 不変
 *   §5 Esc     : 断ると declined (再提示可) になり、判定は呼ばれず発火済にもならない
 *   §E pageerror 0
 *
 * 【駆動の作法】(driver_sce1_events.js の EV-2 に倣う)
 *   - window.SkillCheck.resolveSkillCheck を**スタブ**して「呼び出し回数」と「強制結果」を得る。
 *     ★これが「候補 0 では判定が呼ばれない」(=決定論) を測る唯一の方法。
 *   - gameStarted を true にし、全敵を inactive にして戦闘を起こさず、プレイヤーを spot へ瞬間移動。
 *     本番と同じ 400ms tick (tryInteractNodeEvent) が #choiceDialog を開くので、ボタンを click する。
 *   - rAF は凍結 (論理テストに描画は不要・ライブループの割り込みを断つ)。
 *
 * 使い方: node tools/driver_a2_skill_events.js [--headful] [--browser <path>]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');
const PORT = 10782;
const argv = process.argv.slice(2);
const HEADFUL = argv.indexOf('--headful') >= 0;
function arg(name, def) { const i = argv.indexOf('--' + name); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : def; }

// A2 の 3 イベント。index.html の A2_EVENTS と 1 対 1。
const SCENES = [
  { id: 'orc-fort',      key: 'a2_fort_lore',    check: 'history',    dc: 12, dmgOnFumble: false, title: '歴史判定' },
  { id: 'undead-temple', key: 'a2_temple_gap',   check: 'athletics',  dc: 13, dmgOnFumble: true,  title: '運動判定' },
  { id: 'dragon-lair',   key: 'a2_dragon_cache', check: 'perception', dc: 13, dmgOnFumble: false, title: '知覚判定' },
];
const SCE1_EVENT_RADIUS = 240;   // index.html と同値 (登録 radius の期待値)

// ── puppeteer / Chrome / サーバ ────────────────────────────────────────────────
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
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

// ── 判定 ────────────────────────────────────────────────────────────────────
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── ページ操作ヘルパ ──────────────────────────────────────────────────────────
async function prepare(page, scene) {
  return page.evaluate((sc) => {
    const out = { err: null };
    try {
      out.runActive = !!(typeof RUN !== 'undefined' && RUN);
      out.entry = out.runActive ? RUN.graph.entry : null;
      out.node = currentNodeId;
      out.scenarioId = scenarioId;
      // in-dungeon 状態を強制 (起動直後は gameStarted=false)
      gameStarted = true; gameOver = false;
      try { dungeonCleared = false; } catch (e) {}
      encounterActive = false; encounterRunning = false;
      dialogPaused = false; skillCheckActive = false;
      try { nodeBusy = false; } catch (e) {}
      if (hp <= 0) hp = 100;
      enemies.forEach(e => { e.inactive = true; });   // 戦闘を起こさない (EV-2 と同方針)
      // SkillCheck をスタブ: 呼び出し記録 + mode で結果を強制
      const SC = window.SkillCheck;
      if (!SC.__a2orig) SC.__a2orig = SC.resolveSkillCheck;
      window.__a2 = { calls: [], mode: 'success' };
      SC.resolveSkillCheck = function (checkKey, dc, party, o) {
        window.__a2.calls.push({ checkKey: checkKey, dc: dc,
          extraBonus: (o && o.extraBonus) || 0, title: (o && o.title) || null });
        const dcNum = (typeof dc === 'number') ? dc : 15;
        const m = window.__a2.mode;
        const roll = (m === 'crit') ? 20 : (m === 'fumble') ? 1 : (m === 'fail') ? 2 : 15;
        const bonus = 3;
        const success = (m === 'crit') || (m !== 'fumble' && m !== 'fail');
        return Promise.resolve({ success: success, roll: roll, total: roll + bonus, dc: dcNum,
          bonus: bonus, rep: (party && party[0]) || null, helper: null,
          crit: m === 'crit', fumble: m === 'fumble' });
      };
      const s = nodeEventSpot(2, 0);
      out.spot = s;
      out.spotWalkable = !isTileWall(s.tx, s.ty);
      out.events = window.__graphRun ? window.__graphRun.events() : [];
      out.partyLen = buildPerceptionParty().length;
    } catch (e) { out.err = String((e && e.message) || e); }
    return out;
  }, scene);
}
// プレイヤーを spot そのもの / 半径外 (far) へ瞬間移動
async function placeAt(page, where) {
  await page.evaluate((w) => {
    const s = nodeEventSpot(2, 0);
    const tx = (w === 'far') ? s.tx + 8 : s.tx;
    playerX = tx * TILE_SIZE + TILE_SIZE / 2 - 48;
    playerY = s.ty * TILE_SIZE + TILE_SIZE / 2 - 58;
  }, where);
}
async function waitDialog(page, ms) {
  const t0 = Date.now();
  for (;;) {
    const info = await page.evaluate(() => {
      const d = document.getElementById('choiceDialog');
      if (!d || !d.classList.contains('show')) return null;
      return { msg: (d.querySelector('.choiceMessage') || {}).textContent || '',
               labels: Array.from(d.querySelectorAll('.choiceButtons button')).map(b => b.textContent) };
    });
    if (info) return info;
    if (Date.now() - t0 >= ms) return null;
    await sleep(100);
  }
}
async function click(page, idx) {
  await page.evaluate((i) => {
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    const b = (i < 0) ? btns[btns.length - 1] : btns[i];
    if (b) b.click();
  }, idx);
}
async function settle(page, key) {
  for (let k = 0; k < 60; k++) {
    const done = await page.evaluate((kk) => {
      const d = document.getElementById('choiceDialog');
      const ev = (typeof NODE_EVENTS !== 'undefined') ? NODE_EVENTS.find(e => e.key === kk) : null;
      return !(d && d.classList.contains('show')) && !skillCheckActive && !(ev && ev.busy);
    }, key);
    if (done) { await sleep(120); return true; }
    await sleep(80);
  }
  return false;
}
async function state(page, key) {
  return page.evaluate((kk) => {
    const st = nodeState[currentNodeId];
    const fired = !!(st && st.eventsFired && st.eventsFired.has(kk));
    const ev = (typeof NODE_EVENTS !== 'undefined') ? NODE_EVENTS.find(e => e.key === kk) : null;
    return { hp: hp, calls: window.__a2.calls.slice(), fired: fired,
             declined: !!(ev && ev.declined) };
  }, key);
}
// 発火ラッチ / declined / busy を解いて次の分岐を試せる状態へ戻す
async function rearm(page, key, mode) {
  await page.evaluate((kk, m) => {
    const st = nodeState[currentNodeId];
    if (st && st.eventsFired) st.eventsFired.delete(kk);
    const ev = (typeof NODE_EVENTS !== 'undefined') ? NODE_EVENTS.find(e => e.key === kk) : null;
    if (ev) { ev.declined = false; ev.busy = false; }
    window.__a2.calls.length = 0; window.__a2.mode = m || 'success';
    dialogPaused = false; skillCheckActive = false;
    try { nodeBusy = false; } catch (e) {}
    const d = document.getElementById('choiceDialog');
    if (d) d.classList.remove('show');
    enemies.forEach(e => { e.inactive = true; });
    if (hp <= 0) hp = 100;
  }, key, mode);
}

// ── 1 シナリオの一連の観測 ──────────────────────────────────────────────────────
async function runScene(page, scene) {
  const tag = scene.id;
  const P = await prepare(page, scene);
  if (P.err) console.error('[drv] prepare 例外 (' + tag + '): ' + P.err);

  // §R 登録
  check('(R:' + tag + ') RUN が active で entry=n4', P.runActive && P.entry === 'n4',
    'runActive=' + P.runActive + ' entry=' + P.entry + ' node=' + P.node);
  const led = (P.events || []).filter(e => e.key === scene.key);
  check('(R:' + tag + ') events() に ' + scene.key + ' が 1 件だけ載る', led.length === 1,
    JSON.stringify((P.events || []).map(e => e.key + '@' + (e.nodeId || e.kind))));
  check('(R:' + tag + ') 登録先 nodeId=entry / radius=240', led[0] && led[0].nodeId === P.entry && led[0].radius === SCE1_EVENT_RADIUS,
    led[0] ? ('nodeId=' + led[0].nodeId + ' radius=' + led[0].radius) : 'なし');

  // §H 配置
  check('(H:' + tag + ') spot が壁でない床に落ちる', P.spotWalkable === true, JSON.stringify(P.spot) + ' walkable=' + P.spotWalkable);
  const here = await page.evaluate(() => window.__graphRun.eventsHere());
  check('(H:' + tag + ') entry で eventsHere に ' + scene.key + ' が含まれる', here.indexOf(scene.key) >= 0, JSON.stringify(here));
  check('(H:' + tag + ') 母集団ガード: party 1 名以上', P.partyLen >= 1, 'partyLen=' + P.partyLen);

  // §D 決定論 (autoplay は候補 0 = 判定なし)
  await rearm(page, scene.key, 'success');
  const hpBeforeAuto = (await state(page, scene.key)).hp;
  await page.evaluate(() => { window.__autoplay = true; });
  await placeAt(page, 'spot');
  let fired = false;
  for (let k = 0; k < 50 && !fired; k++) { await sleep(100); fired = (await state(page, scene.key)).fired; }
  await settle(page, scene.key);
  const sAuto = await state(page, scene.key);
  await page.evaluate(() => { window.__autoplay = false; });
  check('(D:' + tag + ') autoplay で発火済になる (候補0 自動選択)', sAuto.fired === true, 'fired=' + sAuto.fired);
  check('(D:' + tag + ') autoplay では d20 を 1 度も引かない', sAuto.calls.length === 0, 'calls=' + sAuto.calls.length);
  check('(D:' + tag + ') autoplay では HP 不変 (盤面を動かさない)', sAuto.hp === hpBeforeAuto, hpBeforeAuto + ' -> ' + sAuto.hp);

  // §1 判定成功 (候補 1「調べる」)
  await rearm(page, scene.key, 'success');
  const hp0 = (await state(page, scene.key)).hp;
  await placeAt(page, 'spot');
  const dlg = await waitDialog(page, 6000);
  check('(1:' + tag + ') 候補 1 で #choiceDialog が開き 3 ボタン (進む/調べる/Esc)', !!dlg && dlg.labels.length === 3,
    dlg ? JSON.stringify(dlg.labels) : 'ダイアログ無し');
  if (dlg) { await click(page, 1); await settle(page, scene.key); }
  const s1 = await state(page, scene.key);
  check('(1:' + tag + ') dfSkillCheck が 1 回だけ呼ばれる', s1.calls.length === 1, 'calls=' + s1.calls.length);
  check('(1:' + tag + ') 技能=' + scene.check + ' / DC=' + scene.dc + ' で振る',
    s1.calls[0] && s1.calls[0].checkKey === scene.check && s1.calls[0].dc === scene.dc,
    s1.calls[0] ? (s1.calls[0].checkKey + ' DC' + s1.calls[0].dc) : 'なし');
  check('(1:' + tag + ') 成功は語りのみ = HP 不変 (バランス非関与)', s1.hp === hp0, hp0 + ' -> ' + s1.hp);
  check('(1:' + tag + ') 成功で発火済 (一度きり)', s1.fired === true, 'fired=' + s1.fired);

  // §2 通常失敗 (DC 未達) = 救済 (HP 不変・進行継続)
  await rearm(page, scene.key, 'fail');
  const hpF0 = (await state(page, scene.key)).hp;
  await placeAt(page, 'spot');
  const dlgF = await waitDialog(page, 6000);
  if (dlgF) { await click(page, 1); await settle(page, scene.key); }
  const s2 = await state(page, scene.key);
  check('(2:' + tag + ') 通常失敗でも HP 不変 (見逃すだけ・詰まない)', s2.hp === hpF0, hpF0 + ' -> ' + s2.hp);
  check('(2:' + tag + ') 通常失敗でも発火済 (進行は止めない)', s2.fired === true, 'fired=' + s2.fired);

  // §3 ファンブル (ナチュ1): 運動だけ被弾 / 他は無罰
  await rearm(page, scene.key, 'fumble');
  const hpB0 = (await state(page, scene.key)).hp;
  await placeAt(page, 'spot');
  const dlgB = await waitDialog(page, 6000);
  if (dlgB) { await click(page, 1); await settle(page, scene.key); }
  const s3 = await state(page, scene.key);
  if (scene.dmgOnFumble) {
    check('(3:' + tag + ') 運動のファンブルは軽い被弾 (HP が減る)', s3.hp < hpB0, hpB0 + ' -> ' + s3.hp);
  } else {
    check('(3:' + tag + ') 知識/知覚のファンブルは無罰 (HP 不変)', s3.hp === hpB0, hpB0 + ' -> ' + s3.hp);
  }

  // §4 クリ (ナチュ20)
  await rearm(page, scene.key, 'crit');
  const hpC0 = (await state(page, scene.key)).hp;
  await placeAt(page, 'spot');
  const dlgC = await waitDialog(page, 6000);
  if (dlgC) { await click(page, 1); await settle(page, scene.key); }
  const s4 = await state(page, scene.key);
  check('(4:' + tag + ') クリは成功扱い = HP 不変', s4.hp === hpC0 && s4.calls.length === 1, hpC0 + ' -> ' + s4.hp + ' calls=' + s4.calls.length);

  // §5 Esc = 断る (declined・再提示可・判定を呼ばない・発火済にならない)
  await rearm(page, scene.key, 'success');
  await placeAt(page, 'spot');
  const dlgE = await waitDialog(page, 6000);
  if (dlgE) { await click(page, -1); await settle(page, scene.key); }
  const s5 = await state(page, scene.key);
  check('(5:' + tag + ') Esc で判定は呼ばれない', s5.calls.length === 0, 'calls=' + s5.calls.length);
  check('(5:' + tag + ') Esc は declined (再提示可)・発火済にならない', s5.declined === true && s5.fired === false,
    'declined=' + s5.declined + ' fired=' + s5.fired);

  // §0b 候補 0 (調べない) = 判定を呼ばない・無罰・発火済
  await rearm(page, scene.key, 'success');
  const hpP0 = (await state(page, scene.key)).hp;
  await placeAt(page, 'spot');
  const dlgP = await waitDialog(page, 6000);
  if (dlgP) { await click(page, 0); await settle(page, scene.key); }
  const s0 = await state(page, scene.key);
  check('(0b:' + tag + ') 候補0「進む」で判定を呼ばない・HP 不変・発火済',
    s0.calls.length === 0 && s0.hp === hpP0 && s0.fired === true,
    'calls=' + s0.calls.length + ' hp=' + hpP0 + '->' + s0.hp + ' fired=' + s0.fired);
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer(PORT);
  console.log('[drv] serving ' + ROOT + ' @ :' + PORT);

  const profile = makeProfile('df_a2_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });

  const errs = [];
  async function boot(query, sid) {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push('[' + sid + query + '] ' + e.message));
    await page.evaluateOnNewDocument((s) => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', s);
        sessionStorage.removeItem('dragonfighters.generatedScenario');
        localStorage.setItem('dragonfighters.xp', '45000');
      } catch (e) {}
    }, sid);
    await page.goto('http://localhost:' + PORT + '/index.html' + query, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      try { return typeof RUN !== 'undefined' && !!RUN && typeof buildPerceptionParty === 'function'
                    && !!window.__graphRun; } catch (e) { return false; }
    }, { timeout: 20000 });
    await page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
    return page;
  }

  for (const scene of SCENES) {
    console.log('\n[drv] ===== ' + scene.id + ' =====');
    const page = await boot('?diag=1', scene.id);
    await runScene(page, scene);
    await page.close();
  }

  // §0 撤退 (?a2=0 で 1 件も載らない) — 負のコントロール
  console.log('\n[drv] ===== ?a2=0 (撤退) =====');
  for (const scene of SCENES) {
    const page = await boot('?diag=1&a2=0', scene.id);
    const off = await page.evaluate(() => window.__graphRun.events().map(e => e.key));
    check('(0:' + scene.id + ') ?a2=0 で ' + scene.key + ' が載らない', off.indexOf(scene.key) < 0, JSON.stringify(off));
    await page.close();
  }

  // §E pageerror 0
  check('(E) pageerror 0', errs.length === 0, errs.slice(0, 6).join(' | '));

  await browser.close();
  srv.close();

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('\n────────────────────────────────────────');
  console.log('[drv] ' + passed + '/' + results.length + ' PASS' + (failed ? ('  — ' + failed + ' FAIL') : ''));
  if (failed) { results.filter(r => !r.ok).forEach(r => console.log('  FAIL ' + r.name + '  — ' + r.detail)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(1); });
