#!/usr/bin/env node
/*
 * driver_action_tactics.js — B1「行動優先度の作り込み (縮小版)」= 作戦 (tactics) 検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/driver_action_tactics.js [--headful] [--port N] [--browser <path>]
 *   node tools/driver_action_tactics.js --negative   ← 負のコントロール
 *
 * ── 何を測るか ───────────────────────────────────────────────────────────────
 *   (T0) 二重定義の突合 … tavern.html の AP_TACTICS と index.html の
 *        AP_BOSS_BIG_IDS / AP_HEAL_IDS が「キー・効く職・技 ID」で食い違わない。
 *        ⭐ 期待表はこのドライバが独立に持つ (実装からコピーしない)。
 *   (T1) 酒場 UI … 準備画面で、職ごとに正しい作戦チェックが出る / トグルが localStorage に
 *        残る / ?actionpri=0 で消える (保存値は無傷)。
 *   (T2) エンジン … seed した作戦が window.apTacticOn に効く / ボス戦でだけ大技が
 *        「実質の優先技」になる / 名指し (#19) が作戦に優先する / リーダーの早め回復は
 *        手負い時だけ起きる / ?actionpri=0 で全部 no-op。
 *
 * ── 負のコントロール (--negative) ───────────────────────────────────────────
 *   NT1: apTacticOn の本体を `return false;` に差し替える (作戦が一切効かなくなる)。
 *        → (T2-on) / (T2-boss-eff) / (T2-leader-boss) / (T2-leader-heal) が赤くなること。
 *   NT2: apEffectivePreferredIdForUnit の `situation === "boss" &&` を外す (ボス限定を壊す)。
 *        → (T2-boss-mobnull) が赤くなること。
 *   注入点がちょうど 1 箇所見つからなければ、走らせる前に exit 1。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
// 2 つの変異は互いを覆い隠す (NT1 が apTacticOn を殺すと NT2 のボスゲートの効果が見えない)。
// なので **1 度に 1 つだけ** 注入する。--negative = NT1 / --negative-gate = NT2。
const NEG_NT1  = flag('negative');
const NEG_NT2  = flag('negative-gate');
const NEGATIVE = NEG_NT1 || NEG_NT2;
const PORT     = parseInt(arg('port', '8844'), 10);

/* ── 配信バイトを起動時に凍結 (別窓の並走で汚れないように) + --negative の注入 ── */
const FROZEN = {};
function freeze() {
  for (const f of ['/index.html', '/tavern.html']) {
    FROZEN[f] = fs.readFileSync(path.join(ROOT, f.slice(1)), 'utf8');
  }
}
// ⚠ 本番ファイルは CRLF。needle は改行を含めない単行 or \r?\n を許す RegExp で突く。
function injectOnce(file, re, replacement, label) {
  const src = FROZEN[file];
  const m = src.match(new RegExp(re.source, 'g'));
  const n = m ? m.length : 0;
  if (n !== 1) {
    console.error(`[driver] ★ 負のコントロール ${label}: 注入点が ${n} 箇所 (1 でない)。アンカーが腐っている`);
    process.exit(1);
  }
  FROZEN[file] = src.replace(re, replacement);
  console.log(`[driver] ★ 負のコントロール ${label} を注入しました`);
}
function applyNegative() {
  if (NEG_NT1) {
    // NT1: apTacticOn を常に false に (本体の 1 行だけを差し替え。この行は apTacticOn に唯一)
    injectOnce('/index.html',
      /      return !!\(t && t\[tacticKey\]\);/,
      '      return false; /* NT1 */',
      'NT1 (apTacticOn→false)');
  }
  if (NEG_NT2) {
    // NT2: apEffectivePreferredIdForUnit のボス限定ガードを外す (直後の const equipped で一意に特定)。
    injectOnce('/index.html',
      /if \(situation === "boss" && apTacticOn\(cls, "bossSpell"\)\) \{(\r?\n\s*)const equipped/,
      'if (apTacticOn(cls, "bossSpell")) {$1const equipped',
      'NT2 (drop boss gate)');
  }
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません');
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u]) { rs.setHeader('Content-Type', MIME['.html']); rs.end(FROZEN[u]); return; }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

/* ── 集計 ── */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];
const setEq = (a, b) => { const A = new Set(a), B = new Set(b); if (A.size !== B.size) return false; for (const x of A) if (!B.has(x)) return false; return true; };

/* ── ドライバが独立に持つ期待表 (実装からコピーしない) ── */
const EXPECT_TACTIC_CLASSES = { bossSpell: ['warrior', 'dwarf', 'mage', 'elf', 'rogue'], healLow: ['cleric'] };
const EXPECT_TACTIC_KEYS = ['bossSpell', 'healLow'];

/* ── seed + 準備画面 ── */
function seed() {
  try {
    [localStorage, sessionStorage].forEach(function (store) {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) store.removeItem(k);
      });
    });
  } catch (e) {}
  try {
    localStorage.setItem('dragonfighters.xp', '10000');
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
  } catch (e) {}
}
async function openPrepScreen(browser, qs) {
  const q = qs ? ('?' + qs + '&prepskip=0') : '?prepskip=0';
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto('http://localhost:' + PORT + '/tavern.html' + q, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.evaluate(seed);
  await page.goto('http://localhost:' + PORT + '/tavern.html' + q, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 20000 });
  await page.evaluate(() => {
    const sc = scenarios.find(s => s.id === 'goblin-mine');
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch(() => {});
  });
  let shown = false;
  for (let i = 0; i < 45 && !shown; i++) {
    shown = await page.evaluate(() => {
      const p = document.getElementById('prep');
      return !!p && getComputedStyle(p).display !== 'none';
    });
    if (shown) break;
    const pressed = await page.evaluate(() => {
      const dep = document.getElementById('pmDepart');
      if (dep && dep.getClientRects().length > 0) { dep.click(); return true; }
      return false;
    });
    if (!pressed) await page.mouse.click(640, 450);
    await sleep(550);
  }
  if (!shown) throw new Error('準備画面 (#prep) が可視にならなかった');
  await page.evaluate(() => { const ov = document.getElementById('prologueOverlay'); if (ov) ov.style.display = 'none'; });
  await sleep(250);
  return page;
}
async function navIndex(browser, tactics, ap, qs) {
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.evaluate(seed);
  await page.evaluate((t, a) => {
    if (t) localStorage.setItem('dragonfighters.actionTactics', JSON.stringify(t));
    if (a) localStorage.setItem('dragonfighters.actionPriority', JSON.stringify(a));
  }, tactics || null, ap || null);
  await page.goto('http://localhost:' + PORT + '/index.html?' + (qs || 'autoplay=30&diag=1'),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof window.apTacticOn === 'function'", { timeout: 45000 });
  return page;
}

(async function main() {
  freeze();
  if (NEGATIVE) applyNegative();
  const server = await startServer();
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL, args: ['--no-sandbox'] });
  try {
    /* ═══ (T0) 二重定義の突合 ═══ */
    console.log('\n--- (T0) 二重定義 tavern.AP_TACTICS ↔ index.AP_BOSS_BIG_IDS/AP_HEAL_IDS ---');
    const prep = await openPrepScreen(browser);
    const tav = await prep.evaluate(() => {
      const byKey = {};
      for (const t of AP_TACTICS) byKey[t.key] = t.classes.slice();
      const poolByClass = {};
      for (const slot of PARTY_SLOTS) poolByClass[slot.classKey] = slot.skillPool.map(sk => sk.id);
      return { keys: AP_TACTICS.map(t => t.key), byKey, poolByClass };
    });
    const idx = await navIndex(browser, null, null);
    const eng = await idx.evaluate(() => ({ boss: window.AP_BOSS_BIG_IDS, heal: window.AP_HEAL_IDS, ratio: window.AP_HEAL_EARLY_RATIO }));

    check('(T0-1) tavern の AP_TACTICS キーが {bossSpell, healLow}',
      setEq(tav.keys, EXPECT_TACTIC_KEYS), JSON.stringify(tav.keys));
    check('(T0-2) tavern bossSpell の効く職が期待どおり (攻撃 5 職)',
      setEq(tav.byKey.bossSpell || [], EXPECT_TACTIC_CLASSES.bossSpell),
      JSON.stringify(tav.byKey.bossSpell) + ' / 期待 ' + JSON.stringify(EXPECT_TACTIC_CLASSES.bossSpell));
    check('(T0-3) tavern healLow の効く職が期待どおり (僧侶のみ)',
      setEq(tav.byKey.healLow || [], EXPECT_TACTIC_CLASSES.healLow),
      JSON.stringify(tav.byKey.healLow) + ' / 期待 ' + JSON.stringify(EXPECT_TACTIC_CLASSES.healLow));
    check('(T0-4) index AP_BOSS_BIG_IDS のキー職 = tavern bossSpell の職',
      setEq(Object.keys(eng.boss || {}), EXPECT_TACTIC_CLASSES.bossSpell),
      JSON.stringify(Object.keys(eng.boss || {})));
    check('(T0-5) index AP_HEAL_IDS のキー職 = tavern healLow の職',
      setEq(Object.keys(eng.heal || {}), EXPECT_TACTIC_CLASSES.healLow),
      JSON.stringify(Object.keys(eng.heal || {})));
    const ghost = [];
    for (const cls of Object.keys(eng.boss || {}))
      for (const id of eng.boss[cls]) if ((tav.poolByClass[cls] || []).indexOf(id) < 0) ghost.push(cls + '/' + id);
    for (const cls of Object.keys(eng.heal || {}))
      for (const id of eng.heal[cls]) if ((tav.poolByClass[cls] || []).indexOf(id) < 0) ghost.push(cls + '/' + id);
    check('(T0-6) 大技 / 回復呪文の ID がすべてその職の skillPool に実在する (幽霊 ID が無い)',
      ghost.length === 0, ghost.length ? ghost.join(' ') : '全件 実在');
    check('(T0-7) AP_HEAL_EARLY_RATIO が 0 < r < 1', eng.ratio > 0 && eng.ratio < 1, 'ratio=' + eng.ratio);
    await idx.close();

    /* ═══ (T1) 酒場 UI ═══ */
    console.log('\n--- (T1) 酒場 UI (準備画面の作戦チェック) ---');
    const uiByClass = {};
    for (const cls of ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue']) {
      uiByClass[cls] = await prep.evaluate((ck) => {
        window.__equipTV.setTab(ck);
        const box = document.getElementById('apTactics');
        const rows = box ? Array.from(box.querySelectorAll('.apTacticRow')) : [];
        const keys = rows.map(r => {
          const cb = r.querySelector('input[type="checkbox"]');
          const id = cb ? cb.id : '';
          const m = id.match(/^apTac_[a-z]+_(.+)$/);
          return m ? m[1] : null;
        }).filter(Boolean);
        return { exists: !!box, keys };
      }, cls);
    }
    let uiOk = true; const uiDetail = [];
    for (const cls of Object.keys(uiByClass)) {
      const expect = EXPECT_TACTIC_KEYS.filter(k => EXPECT_TACTIC_CLASSES[k].indexOf(cls) >= 0);
      const got = uiByClass[cls].keys;
      if (!setEq(expect, got)) { uiOk = false; uiDetail.push(cls + ': got=' + JSON.stringify(got) + ' expect=' + JSON.stringify(expect)); }
      else uiDetail.push(cls + '=' + JSON.stringify(got));
    }
    check('(T1-1) 職ごとに正しい作戦チェックが出る (攻撃職=bossSpell / 僧侶=healLow)', uiOk, uiDetail.join(' | '));

    const toggle = await prep.evaluate(() => {
      window.__equipTV.setTab('mage');
      const cb = document.getElementById('apTac_mage_bossSpell');
      if (!cb) return { err: 'checkbox 無し' };
      const read = () => { try { return (JSON.parse(localStorage.getItem('dragonfighters.actionTactics') || '{}').mage || {}).bossSpell === true; } catch (e) { return null; } };
      const before = read();
      cb.checked = true; cb.dispatchEvent(new Event('change'));
      const afterOn = read();
      cb.checked = false; cb.dispatchEvent(new Event('change'));
      const afterOff = read();
      return { before, afterOn, afterOff };
    });
    check('(T1-2) 作戦チェックの ON/OFF が localStorage に残る',
      toggle && toggle.before !== true && toggle.afterOn === true && toggle.afterOff !== true, JSON.stringify(toggle));

    const prepC = await openPrepScreen(browser);
    await prepC.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const widthFacts = await prepC.evaluate(() => {
      window.__equipTV.setTab('cleric');
      const sec = document.getElementById('actionPrioritySection');
      const box = document.getElementById('apTactics');
      return { secScroll: sec ? sec.scrollWidth : 0, secClient: sec ? sec.clientWidth : 0,
               tacticW: box ? box.getBoundingClientRect().width : 0, rows: box ? box.querySelectorAll('.apTacticRow').length : 0 };
    });
    check('(T1-3a) compact (390px) で #actionPrioritySection が横スクロールしない',
      widthFacts.secScroll <= widthFacts.secClient + 1, widthFacts.secScroll + ' <= ' + widthFacts.secClient);
    check('(T1-3b) 母集団: 作戦段が実幅を持って描かれている (0 幅で自明に緑にならない)',
      widthFacts.tacticW > 1 && widthFacts.rows >= 1, 'w=' + widthFacts.tacticW + ' rows=' + widthFacts.rows);
    await prepC.close();

    const offPrep = await openPrepScreen(browser, 'actionpri=0');
    const offFacts = await offPrep.evaluate(() => {
      try { localStorage.setItem('dragonfighters.actionTactics', JSON.stringify({ mage: { bossSpell: true } })); } catch (e) {}
      window.__equipTV.setTab('mage');
      const box = document.getElementById('apTactics');
      const sec = document.getElementById('actionPrioritySection');
      let saved = null; try { saved = (JSON.parse(localStorage.getItem('dragonfighters.actionTactics') || '{}').mage || {}).bossSpell; } catch (e) {}
      return { cbs: box ? box.querySelectorAll('input[type=checkbox]').length : -1,
               secHidden: sec ? getComputedStyle(sec).display === 'none' : false, saved };
    });
    check('(T1-4a) ?actionpri=0 で作戦チェックが 0 個 (設定欄ごと消える)', offFacts.cbs === 0, 'checkbox=' + offFacts.cbs + ' sectionHidden=' + offFacts.secHidden);
    check('(T1-4b) ?actionpri=0 でも保存済みの作戦値は消えない', offFacts.saved === true, 'saved=' + JSON.stringify(offFacts.saved));
    await offPrep.close();
    await prep.close();

    /* ═══ (T2) エンジン ═══ */
    console.log('\n--- (T2) エンジン (apTacticOn / 実質の優先技 / リーダー) ---');
    const SEED_T = { mage: { bossSpell: true }, cleric: { healLow: true } };
    const e1 = await navIndex(browser, SEED_T, null);
    const t2 = await e1.evaluate(() => {
      const r = {};
      r.onMageBoss   = window.apTacticOn('mage', 'bossSpell');
      r.onClericHeal = window.apTacticOn('cleric', 'healLow');
      r.onMageHeal   = window.apTacticOn('mage', 'healLow');
      r.onWarBoss    = window.apTacticOn('warrior', 'bossSpell');
      const mageUnit = { classKey: 'mage', equippedSkills: ['fire-bolt', 'fireball', 'magic-missile'] };
      r.bossEff = window.apEffectivePreferredIdForUnit(mageUnit, 'boss');
      r.mobEff  = window.apEffectivePreferredIdForUnit(mageUnit, 'mob');
      const mageUnit2 = { classKey: 'mage', equippedSkills: ['fire-bolt', 'magic-missile'] };
      r.bossEff2 = window.apEffectivePreferredIdForUnit(mageUnit2, 'boss');
      r.leaderBoss  = window.apLeaderTacticPreferredId('mage', 'boss', ['normal', 'fire-bolt', 'fireball'], { ratio: 1 });
      r.leaderMob   = window.apLeaderTacticPreferredId('mage', 'mob',  ['normal', 'fire-bolt', 'fireball'], { ratio: 1 });
      r.leaderHeal  = window.apLeaderTacticPreferredId('cleric', 'boss', ['normal', 'cure-light-wounds'], { ratio: 0.5 });
      r.leaderHealN = window.apLeaderTacticPreferredId('cleric', 'boss', ['normal', 'cure-light-wounds'], { ratio: 0.95 });
      return r;
    });
    check('(T2-on) seed した作戦が apTacticOn に効く / 未 seed は false',
      t2.onMageBoss === true && t2.onClericHeal === true && t2.onMageHeal === false && t2.onWarBoss === false, JSON.stringify(t2));
    check('(T2-boss-eff) ボス戦で装備中の最強攻撃が実質の優先技になる (fire-bolt<fireball を優先)',
      t2.bossEff === 'fireball', 'bossEff=' + t2.bossEff);
    check('(T2-boss-mobnull) 雑魚戦では bossSpell は効かない (実質の優先技は null)',
      t2.mobEff === null, 'mobEff=' + JSON.stringify(t2.mobEff));
    check('(T2-boss-order) fireball を外すと次点 (fire-bolt) が選ばれる',
      t2.bossEff2 === 'fire-bolt', 'bossEff2=' + t2.bossEff2);
    check('(T2-leader-boss) リーダーもボス戦で大技が優先技になる / 雑魚では null',
      t2.leaderBoss === 'fireball' && t2.leaderMob === null, 'boss=' + t2.leaderBoss + ' mob=' + JSON.stringify(t2.leaderMob));
    check('(T2-leader-heal) 早め回復は手負い (9 割未満) のときだけ優先技になる',
      t2.leaderHeal === 'cure-light-wounds' && t2.leaderHealN === null,
      'wounded=' + t2.leaderHeal + ' full=' + JSON.stringify(t2.leaderHealN));
    await e1.close();

    const e2 = await navIndex(browser, { mage: { bossSpell: true } },
      { mage: { general: null, mob: null, boss: 'magic-missile', travel: null } });
    const t2b = await e2.evaluate(() => {
      const mageUnit = { classKey: 'mage', equippedSkills: ['fireball', 'magic-missile', 'fire-bolt'] };
      return { eff: window.apEffectivePreferredIdForUnit(mageUnit, 'boss'), explicit: window.apPreferredId('mage', 'boss') };
    });
    check('(T2-explicit) #19 の名指しが作戦より優先する (boss=magic-missile のとき fireball でなく magic-missile)',
      t2b.eff === 'magic-missile' && t2b.explicit === 'magic-missile', JSON.stringify(t2b));
    await e2.close();

    const e3 = await navIndex(browser, SEED_T, null, 'actionpri=0&autoplay=30&diag=1');
    const t2c = await e3.evaluate(() => ({
      on: window.apTacticOn('mage', 'bossSpell'),
      eff: window.apEffectivePreferredIdForUnit({ classKey: 'mage', equippedSkills: ['fireball'] }, 'boss'),
      leader: window.apLeaderTacticPreferredId('mage', 'boss', ['normal', 'fireball'], { ratio: 1 }),
    }));
    check('(T2-off) ?actionpri=0 で作戦が全部 no-op (apTacticOn=false / 実質優先技=null)',
      t2c.on === false && t2c.eff === null && t2c.leader === null, JSON.stringify(t2c));
    await e3.close();

    check('(Z) pageerror ゼロ', pageErrors.length === 0, pageErrors.join(' | '));
  } catch (e) {
    console.error('\n[driver] 例外:', e && e.stack ? e.stack : e);
    check('(FATAL) ドライバが例外で停止', false, String(e && e.message || e));
  } finally {
    await browser.close();
    server.close();
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('\n[driver] RESULT: PASSED ' + passed + ' / FAILED ' + failed);
  if (NEGATIVE) {
    // 変異ごとに「赤くなるべき assert」は違う (互いを覆い隠すので同時には注入しない)。
    const mustRed = NEG_NT2
      ? ['(T2-boss-mobnull)']
      : ['(T2-on)', '(T2-boss-eff)', '(T2-boss-order)', '(T2-leader-boss)', '(T2-leader-heal)'];
    const stillGreen = mustRed.filter(n => { const r = results.find(x => x.name.indexOf(n) === 0); return r && r.ok; });
    if (stillGreen.length) {
      console.log('[driver] ✗ 負のコントロール失敗: 以下がまだ緑 = assert が空振り: ' + stillGreen.join(' '));
      process.exit(1);
    }
    console.log('[driver] ✓ 負のコントロール成功: 狙った assert がすべて赤くなった');
    process.exit(0);
  }
  process.exit(failed === 0 ? 0 : 1);
})();
