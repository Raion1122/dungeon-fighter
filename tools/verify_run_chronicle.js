/*
 * tools/verify_run_chronicle.js — 冒険の年代記 (実装依頼書 #37) の検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_run_chronicle.js [--headful] [--port N]
 *
 * ── 担当表 (どの節が何を守っているか) ─────────────────────────────────────
 *   §0 装置    … 母集団。「1 件も積まれていない」= 以降が全部空振りで永久緑、を先に潰す
 *   §1 年代記  … 死と撃破。盤面から独立に数えた値と年代記の値を突き合わせる
 *   §2〜§6     … STEP2 / STEP3 / STEP4 の担当。ここでは **pending() で宣言だけ**しておく
 *
 * ── ⚠ 測り方の方針 (依頼書 §9) ────────────────────────────────────────────
 *  記録の正しさを「年代記に何行出たか」で測らない (表示は後段の都合で変わる)。
 *  ⛔ **ドライバへ本番の集計式を写経しない**。同じ間違いを共有すると両方緑になる。
 *  → 撃破数は「defeatEnemy をドライバ側でラップし、その呼び出しで実際に alive が
 *    true→false になった回数」で数える (本番は自前のフックで数えている = 別経路)。
 *  → 倒れた数は「本番の 4 関数を呼ぶ前後で allies[].alive の true→false を数えた値」。
 *
 * ── ⚠ 踏むと必ず事故る点 (再演しやすいので残す) ───────────────────────────
 *  - Playwright MCP は使えない。puppeteer-core + Chrome をヘッドレス直駆動する。
 *  - `--user-data-dir` を自前で作らない。`_pptr_profile` が後始末まで面倒を見る。
 *  - `evaluateOnNewDocument` は **全ナビゲーションで再実行される**。ここに removeItem 系を
 *    置くと遷移のたびに走ってページ側が書いた値を潰す (最頻ハマり)。
 *  - classic script 直下の `let` / `const` (enemies / allies / RunChronicle / hp …) は
 *    **window に載らない**。evaluate からは **bare 参照**で読む。
 *    逆に `function` 宣言 (defeatEnemy / sleepMs / triggerTrapOnAlly …) は window に載るので、
 *    `window.defeatEnemy = wrapper` で**内部の呼び口ごと**差し替えられる。
 *  - `sleepMs` を `() => Promise.resolve()` に差し替えてはいけない。マイクロタスクだけで
 *    回り続けて CDP の evaluate が飢餓し、実行ごとに違う所でタイムアウトする。
 *    必ず `setTimeout(r, 0)` でマクロタスク化する。
 *  - (0c) の「配信バイトを数える assert」の近くでは**コメントも数えられる**。
 *    ⛔ 本ドライバの説明文にも index.html の説明文にも、測定対象の文字列そのものを書かない。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const PORT = parseInt(arg('port', '8897'), 10);
const HEADFUL = argv.includes('--headful');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core'));
}
function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  throw new Error('no browser');
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
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}
function fetchText(urlPath) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: urlPath }, (r) => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c); r.on('end', () => res(b));
    }).on('error', rej);
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, state: cond ? 'PASS' : 'FAIL' });
  console.log((cond ? '  OK   ' : '  NG   ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, state: 'PENDING' });
  console.log('  ....  ' + name + '  -- PENDING: ' + why);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * (0c) 配信バイトの「HP を引く点」の総数。
 *   ⚠ 正規表現は文字列から組む (テンプレートリテラルの中に書くとエスケープが消える)。
 *   ⚠ この定数の周りに測定対象そのものを平文で書かない (コメントまで数えられる)。
 * ══════════════════════════════════════════════════════════════════════════ */
const HP_WRITE_EXPECTED = 43;   // 2026-08-29 / 基準 4f7710d 実測 (14 + 29)
function countHpWrites(src) {
  const reA = new RegExp('\\bhp\\s*-=', 'g');
  const reB = new RegExp('\\bhp\\s*=\\s*Math\\.max\\(\\s*0\\s*,\\s*[A-Za-z0-9_.\\[\\]]*\\.?hp\\s*-', 'g');
  const a = (src.match(reA) || []).length;
  const b = (src.match(reB) || []).length;
  return { a: a, b: b, total: a + b };
}

/* 撃破の**独立な**数え方。本番のフックではなく、defeatEnemy を包んで
 * 「その呼び出しで enemies[index].alive が true → false になったか」を見る。
 * ⚠ 冒頭で数えると多頭ハイドラの「頭を焼き切った / 再生した」= 撃破ではない早期 return まで
 *   混ざる。よって **遷移** を見る。 */
function installKillProbe() {
  window.__dfKill = { wrapped: false, calls: 0, deaths: 0, names: [] };
  const tryWrap = function () {
    if (window.__dfKill.wrapped) return true;
    if (typeof window.defeatEnemy !== 'function') return false;
    const orig = window.defeatEnemy;
    window.defeatEnemy = function (index) {
      const p = window.__dfKill;
      p.calls++;
      let before = null, nm = '?';
      try { before = !!enemies[index].alive; nm = (enemies[index].def && enemies[index].def.name) || '?'; } catch (e) {}
      const r = orig.apply(this, arguments);
      try {
        const after = !!enemies[index].alive;
        if (before === true && after === false) { p.deaths++; p.names.push(nm); }
      } catch (e) {}
      return r;
    };
    window.__dfKill.wrapped = true;
    return true;
  };
  const iv = setInterval(function () { if (tryWrap()) clearInterval(iv); }, 0);
  document.addEventListener('DOMContentLoaded', tryWrap);
}

/* ── 記録棚 / レポートに食わせる年代記の作り物 ────────────────────────────
 * ⚠ 形は index.html の RunChronicle.snapshot() が返すものと同じ。数字の中身は問わない
 *   (§3〜§6 が測るのは「保存・表示・撤退」であって集計ではない。集計は §1/§2 の担当)。 */
function MK_CH(nEvents) {
  const evs = [];
  for (let i = 1; i <= (nEvents || 1); i++) {
    evs.push({ round: i, node: '坑道', kind: (i % 3 === 0) ? 'fall' : 'kill',
      who: (i % 3 === 0) ? 'カイ' : 'ゴブリン', by: 'ゴブリン戦車',
      text: '坑道にて ゴブリン戦車 が ' + ((i % 3 === 0) ? 'カイ を倒した' : 'ゴブリン を討ち取った') + ' (' + i + ')' });
  }
  return {
    v: 1, outcome: 'defeat', rounds: evs.length, kills: evs.length,
    members: [
      { name: 'あなた', classKey: 'warrior', isHero: true,
        dealt: 42, taken: 31, kills: 3, healed: 0, fellAt: { round: 4, node: '坑道' } },
      { name: 'エラ', classKey: 'mage', isHero: false,
        dealt: 18, taken: 6, kills: 1, healed: 0, fellAt: null },
    ],
    events: evs,
    idle: { spellSlotsLeft: 2, spellSlotsMax: 4, slots: [{ who: 'エラ', left: 2, max: 4 }],
            unusedSkills: ['盾構え'], unusedByWho: [{ who: 'あなた', skills: ['盾構え'] }] },
    lastBlow: { by: 'ゴブリン戦車', enemiesLeft: 4 },
  };
}
function MK_RESULT(nEvents) {
  return { scenarioId: 'goblin-mine', scenarioTitle: '廃坑の依頼',
           cleared: false, defeated: true, reward: null, chronicle: MK_CH(nEvents) };
}

/* ── index.html を開く共通口 ────────────────────────────────────────────── */
async function openIndex(browser, qs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push('index :: ' + e.message));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((o) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', o.scen || 'goblin-mine');
      if (o.party) sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(o.party));
      if (o.xp) localStorage.setItem('dragonfighters.xp', String(o.xp));
    } catch (e) {}
  }, { scen: opts.scen || 'goblin-mine', party: opts.party || null, xp: opts.xp || null });
  if (opts.killProbe) await page.evaluateOnNewDocument(installKillProbe);
  await page.goto('http://localhost:' + PORT + '/index.html?' + (qs || 'autoplay=30&diag=1'),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    'typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
    { timeout: 45000 });
  await sleep(400);
  return page;
}

/* ── tavern.html を開く共通口 ─────────────────────────────────────────────
 * ⚠ evaluateOnNewDocument は全ナビゲーションで再実行される。ここで消しているのは
 *   **ページが書く前**のライブキーだけなので、酒場自身が書いた値は潰さない。
 * ⚠ prologueSeen を立てておかないと z:200 のプロローグが被さって導線が押せない。 */
async function openTavern(browser, qs, seed, viewport) {
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push('tavern :: ' + e.message));
  await page.setViewport(viewport || { width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((o) => {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.indexOf('df.') === 0 || k.indexOf('dragonfighters.') === 0) localStorage.removeItem(k);
      });
      Object.keys(sessionStorage).forEach((k) => {
        if (k.indexOf('df.') === 0 || k.indexOf('dragonfighters.') === 0) sessionStorage.removeItem(k);
      });
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (o.seed) sessionStorage.setItem('dragonfighters.lastResult', JSON.stringify(o.seed));
    } catch (e) {}
  }, { seed: seed || null });
  await page.goto('http://localhost:' + PORT + '/tavern.html' + (qs ? ('?' + qs) : ''),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1000);   // consumeResult → setTimeout(…,100) の帰還バナーまで待つ
  return page;
}
/* 帰還バナーの枚数。⚠ バナーには id が無いので、インラインスタイルの指紋で数える
 *   (z-index:15 は tavern.html でこのバナーだけが使う値)。 */
function countBanners() {
  return Array.prototype.slice.call(document.body.children)
    .filter((el) => el.tagName === 'DIV'
      && /z-index:15;/.test((el.getAttribute('style') || '').replace(/\s/g, ''))).length;
}

/* 「出るまでポーリング」。⭐ 固定 sleep はゲームループという共有キューのある所では
 *   原理的にフレークする。 */
async function pollUntil(page, fn, timeoutMs, stepMs) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    try { last = await page.evaluate(fn); } catch (e) { last = { err: String(e && e.message || e) }; }
    if (last && last.done) return last;
    await sleep(stepMs || 500);
  }
  return last;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  const profile = require('./_pptr_profile')('df_chronicle_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  // ══════════════════════════════════════════════════════════════════════
  // §0 装置 — 先に母集団を確かめる
  //   ⭐⭐⭐ (0a) が無いと以降の全 assert が空振りで永久緑になる。最優先。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §0 装置 (母集団) ---');

  // (0c) は配信バイトだけで決まるのでページを開く前に測る
  {
    const src = await fetchText('/index.html');
    const c = countHpWrites(src);
    check('(0c) 配信バイトの「HP を引く点」が ' + HP_WRITE_EXPECTED + ' 箇所 (増えていたら新しい点が手番の内か外かを確認する合図)',
      c.total === HP_WRITE_EXPECTED, JSON.stringify(c));
    check('(0z0) [装置] 配信が空でない (index.html が 1MB 以上返ってきている)',
      src.length > 1000000, src.length + ' bytes');
  }

  {
    const page = await openIndex(browser, 'autoplay=30&diag=1', { killProbe: true });
    console.log('  [arm A] オートプレイを走らせて年代記が積まれるまで待つ …');
    const run = await pollUntil(page, () => {
      const out = { done: false };
      try {
        const s = RunChronicle.snapshot(null);
        out.events = s ? s.events.length : -1;
        out.kills  = s ? s.kills : -1;
        out.rounds = s ? s.rounds : -1;
        out.members = s ? s.members.length : -1;
      } catch (e) { out.err = String(e && e.message || e); }
      out.probe = window.__dfKill ? { wrapped: window.__dfKill.wrapped, calls: window.__dfKill.calls, deaths: window.__dfKill.deaths } : null;
      out.done = !!(out.probe && out.probe.deaths >= 3 && out.events >= 3);
      return out;
    }, 150000, 1500);
    console.log('  [arm A] ' + JSON.stringify(run));

    const probe = (run && run.probe) || { wrapped: false, calls: 0, deaths: 0 };
    check('(0z1) [装置] ドライバ側のラッパが実際に効いている (defeatEnemy を包めた)',
      probe.wrapped === true, JSON.stringify(probe));
    check('(0z2) [装置] 母集団が空でない — オートプレイ中に defeatEnemy が 1 回以上呼ばれた',
      probe.calls >= 1, 'calls=' + probe.calls + ' deaths=' + probe.deaths);
    check('(0a) ★1 回のオートプレイで年代記に 1 件以上の記録が積まれている',
      (run && run.events) >= 1, 'events=' + (run && run.events));
    check('(0b) ★年代記の撃破数が、ドライバ側で数えた実測値 (alive が true→false になった呼び出し) と一致',
      (run && run.kills) === probe.deaths && probe.deaths >= 1,
      'chronicle.kills=' + (run && run.kills) + ' / probe.deaths=' + probe.deaths);
    check('(0z3) [装置] 隊列が空でない (members が 1 人以上)',
      (run && run.members) >= 1, 'members=' + (run && run.members));

    const shape = await page.evaluate(() => {
      const out = {};
      try {
        out.api = ['setRound', 'beginTurn', 'endTurn', 'kill', 'fall', 'snapshot']
          .filter(k => typeof RunChronicle[k] === 'function');
      } catch (e) { out.err = String(e && e.message || e); }
      return out;
    });
    check('(0z4) [装置] 公開 API が 6 本そろっている (setRound/beginTurn/endTurn/kill/fall/snapshot)',
      shape.api && shape.api.length === 6, JSON.stringify(shape.api));

    // ── (1c) defeatEnemy を通さない alive=false は撃破数に混ざらない ─────────
    const cage = await page.evaluate(() => {
      const out = {};
      const before = RunChronicle.snapshot(null);
      out.before = before.kills;
      /* 檻の解放 (applyGrixGuardFlee) と一括消去 (restoreNodeState) が実際にやっているのと
         同じこと = **defeatEnemy を通さずに** alive を倒す。撃破ではないので数は動かないはず。 */
      let touched = 0;
      for (let i = 0; i < enemies.length && touched < 3; i++) {
        if (enemies[i] && enemies[i].alive) { enemies[i].alive = false; touched++; }
      }
      out.touched = touched;
      const after = RunChronicle.snapshot(null);
      out.after = after.kills;
      return out;
    });
    check('(1z1) [装置] 檻の解放を模した「defeatEnemy を通さない alive=false」を実際に 1 件以上起こせた',
      cage.touched >= 1, JSON.stringify(cage));
    check('(1c) ★檻の解放 (applyGrixGuardFlee) と一括消去 (restoreNodeState) が撃破数に混ざっていない',
      cage.touched >= 1 && cage.before === cage.after,
      'kills ' + cage.before + ' → ' + cage.after + ' (alive を ' + cage.touched + ' 体倒した)');

    const src = await fetchText('/index.html');
    const callSites = (src.match(new RegExp('RunChronicle\\.kill\\(', 'g')) || []).length;
    check('(1c2) [静的] 撃破の記録口は配信バイトに 1 本だけ (33 箇所の呼び口を 1 点で覆っている)',
      callSites === 1, 'RunChronicle.kill( = ' + callSites + ' 本');

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // §1 年代記 — 死 (仲間の 4 経路)
  //   本番の 4 関数をそのまま呼び、**盤面の alive 遷移をドライバが自分で数えて**
  //   年代記の fall イベント数と突き合わせる。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §1 年代記 (死と撃破) ---');
  {
    /* ⚠ partyMembers は **rich な形** ({classKey, isHero, zone, …}) でないと index.html の
         ガード (`pm.every(m => m && m.classKey && PARTY_ZONES[m.classKey])`) を通らず、
         黙って既定編成 (仲間 3 人) へフォールバックする。文字列配列を渡しても効かない。
       ⚠ 仲間は **4 経路ぶん = 4 人以上**要る。3 人だと最後の 1 経路が
         「もう犠牲者がいない」で空振りし、他の 3 本だけで緑になる。 */
    const PARTY6 = [
      { classKey: 'warrior', isHero: true,  zone: 'front', name: null, trait: null, line: null },
      { classKey: 'dwarf',   isHero: false, zone: 'front', name: 'アルヴ', trait: null, line: null },
      { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'ベル',   trait: null, line: null },
      { classKey: 'rogue',   isHero: false, zone: 'mid',   name: 'カイ',   trait: null, line: null },
      { classKey: 'elf',     isHero: false, zone: 'mid',   name: 'ディア', trait: null, line: null },
      { classKey: 'mage',    isHero: false, zone: 'rear',  name: 'エラ',   trait: null, line: null },
    ];
    const page = await openIndex(browser, 'autoplay=30&diag=1', { party: PARTY6 });
    // 演出だけを黙らせる (本物の実装はそのまま走らせる)。
    // ⚠ Promise.resolve に差し替えないこと (マイクロタスク飢餓で CDP が死ぬ)。
    await page.evaluate(() => {
      try { enemies.forEach(e => { e.x = -999999; e.y = -999999; }); } catch (e) {}
      try { encounterActive = false; encounterEnemyIndices = []; } catch (e) {}
      window.sleepMs = function () { return new Promise(r => setTimeout(r, 0)); };
    });

    const fell = await page.evaluate(async () => {
      const out = { steps: [], boardFalls: 0, err: null, aliveAtStart: 0 };
      const snapAlive = () => allies.map(a => !!a.alive);
      const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] && !b[i]) n++; return n; };
      try {
        hp = 9999; maxHp = 9999;                 // 頭は死なせない (頭の fall を混ぜないため)
        const victims = allies.filter(a => a.alive && !a.isHero);
        out.aliveAtStart = victims.length;
        if (victims.length < 4) { out.err = 'victims<4 (' + victims.length + ')'; return out; }

        const rig = (a) => {
          a.hp = 1; a.alive = true; a.isHero = false;
          a.buffs = a.buffs || {}; a.buffs.resilientFired = true;   // 不屈を封じる (1d4 で耐える経路)
          a.equippedSkills = [];
          a.stunned = 5;                                            // helpless = 自動命中
        };

        // ① triggerTrapOnAlly (罠)
        {
          const a = victims[0]; rig(a);
          const b0 = snapAlive();
          triggerTrapOnAlly({ triggered: false, found: false }, a);
          const b1 = snapAlive();
          const d = diff(b0, b1); out.boardFalls += d;
          out.steps.push({ site: 'triggerTrapOnAlly', boardDelta: d });
        }
        // ② applyFireBreathToAlly (ブレス)
        {
          const a = victims[1]; rig(a);
          const b0 = snapAlive();
          applyFireBreathToAlly(a, 9999);
          const b1 = snapAlive();
          const d = diff(b0, b1); out.boardFalls += d;
          out.steps.push({ site: 'applyFireBreathToAlly', boardDelta: d });
        }
        // ③ enemyAttackAllyTarget (敵の攻撃)
        {
          const a = victims[2]; rig(a);
          let ei = -1;
          for (let i = 0; i < enemies.length; i++) { if (enemies[i]) { ei = i; break; } }
          if (ei >= 0) {
            const e = enemies[ei];
            e.alive = true; e.hp = e.maxHp || 20;
            e.x = a.x; e.y = a.y;                       // 隣接 = 射程チェックを通す
            const ai = allies.indexOf(a);
            const b0 = snapAlive();
            /* ⚠ 1 発では死なない。命中判定 (d20) と DR があるので**外れる回**が普通にある。
               1 回だけ叩いて 0 だと「この経路は測れていない」のに (1z3) が他の 3 本で緑になる。
               → 倒れるまで叩く (毎回 hp を 1 へ戻す)。 */
            for (let k = 0; k < 24 && a.alive; k++) {
              a.hp = 1; a.stunned = 5;
              await enemyAttackAllyTarget(ei, ai);
            }
            const b1 = snapAlive();
            const d = diff(b0, b1); out.boardFalls += d;
            out.steps.push({ site: 'enemyAttackAllyTarget', boardDelta: d });
            e.alive = false;
          } else {
            out.steps.push({ site: 'enemyAttackAllyTarget', boardDelta: 0, skipped: 'no enemy slot' });
          }
        }
        // ④ wildConfusedStrike (同士討ち)。乱択なので生存者を 1 人に絞って繰り返す。
        {
          const a = victims[3] || null;
          if (a) {
            for (const o of allies) if (o !== a && !o.isHero) o.alive = false;
            rig(a);
            const attacker = allies.find(x => x !== a) || 'player';
            if (attacker !== 'player') { attacker.alive = true; attacker.hp = attacker.maxHp || 30; }
            const b0 = snapAlive();
            for (let k = 0; k < 24 && a.alive; k++) {
              a.hp = 1;
              await wildConfusedStrike(attacker);
            }
            const b1 = snapAlive();
            const d = diff(b0, b1); out.boardFalls += d;
            out.steps.push({ site: 'wildConfusedStrike', boardDelta: d });
          } else {
            out.steps.push({ site: 'wildConfusedStrike', boardDelta: 0, skipped: 'no victim left' });
          }
        }
      } catch (e) { out.err = String(e && e.message || e); }
      const s = RunChronicle.snapshot(null);
      out.falls = s.events.filter(e => e.kind === 'fall');
      out.fallCount = out.falls.length;
      return out;
    });
    console.log('  [arm B] ' + JSON.stringify({ steps: fell.steps, boardFalls: fell.boardFalls,
      fallCount: fell.fallCount, err: fell.err }));
    if (fell.falls) fell.falls.forEach(f => console.log('        · ' + JSON.stringify(f)));

    check('(1z2) [装置] 仲間の死を実際に起こせた (盤面で alive が true→false になった仲間が 4 件以上)',
      fell.boardFalls >= 4, 'boardFalls=' + fell.boardFalls + ' err=' + fell.err);
    check('(1z3) [装置] 仲間の死の 4 経路が **全部** 実際に倒れている (どれか 1 本だけで緑になっていない)',
      (fell.steps || []).filter(s => s.boardDelta > 0).length === 4,
      JSON.stringify((fell.steps || []).map(s => s.site + '=' + s.boardDelta)));
    check('(1a) ★仲間が倒れた回数 (盤面の alive を直接数えた値) = 年代記の fall イベント数',
      fell.boardFalls >= 4 && fell.fallCount === fell.boardFalls,
      'board=' + fell.boardFalls + ' / chronicle=' + fell.fallCount);
    const bad = (fell.falls || []).filter(f => !f.node || !String(f.node).trim() || !f.who || !String(f.who).trim());
    check('(1b) ★年代記の各 fall 行に場所 (部屋名) と名前が入っている',
      (fell.falls || []).length >= 1 && bad.length === 0,
      (fell.falls || []).length + ' 行中、場所か名前が欠けた行 = ' + bad.length);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // (1d) 探索中の罠で頭が死ぬ経路
  //   ⚠ 依頼書のコメントが指す「18642」は古い行番号。実体は triggerTrapOnPlayer の
  //     hp<=0 判定で、そこから onHeadDowned("explore") を経て gameOver が立つ。
  //   showResult は直接呼ばれず、300ms 周期の setInterval 監視が gameOver を見て発火する。
  //   → 到達するので**年代記も保存される**、が期待値 (下で実測して確定させる)。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §1 (1d) 探索中の罠で頭が死ぬ経路 ---');
  {
    const page = await openIndex(browser, 'autoplay=30&diag=1', {});
    await page.evaluate(() => {
      try { enemies.forEach(e => { e.x = -999999; e.y = -999999; }); } catch (e) {}
      try { encounterActive = false; encounterEnemyIndices = []; } catch (e) {}
      window.sleepMs = function () { return new Promise(r => setTimeout(r, 0)); };
    });
    const kick = await page.evaluate(() => {
      const out = {};
      try {
        sessionStorage.removeItem('dragonfighters.lastResult');
        heroIsHead = true;                    // 頭 = 主人公 → onHeadDowned は false を返す = GO
        playerBuffs.resilientFired = true;    // 不屈で耐える経路を封じる
        equippedSkills = [];
        hp = 1;
        triggerTrapOnPlayer({ triggered: false, found: false });
        out.hpAfter = hp;
        out.gameOver = gameOver;
      } catch (e) { out.err = String(e && e.message || e); }
      return out;
    });
    console.log('  [arm C] ' + JSON.stringify(kick));
    const land = await pollUntil(page, () => {
      const raw = sessionStorage.getItem('dragonfighters.lastResult');
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (e) {}
      return { done: !!raw, hasChronicle: !!(parsed && parsed.chronicle),
               keys: parsed ? Object.keys(parsed) : null,
               events: (parsed && parsed.chronicle) ? parsed.chronicle.events.length : -1,
               outcome: (parsed && parsed.chronicle) ? parsed.chronicle.outcome : null };
    }, 12000, 400);
    console.log('  [arm C] lastResult = ' + JSON.stringify(land));

    check('(1z4) [装置] 罠で頭の HP が実際に 0 になり gameOver が立った',
      kick.hpAfter === 0 && kick.gameOver === true, JSON.stringify(kick));
    check('(1d) ★探索中の罠で頭が死ぬ経路でも年代記が保存される '
        + '(showResult は 300ms 周期の監視 setInterval が gameOver を見て発火する)',
      !!(land && land.done && land.hasChronicle), JSON.stringify(land));
    check('(1d2) 保存された年代記の outcome が "defeat"',
      land && land.outcome === 'defeat', 'outcome=' + (land && land.outcome));

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // §2 働きの集計 (STEP2 = 依頼書 §5)
  //   ⛔ 本番の集計式を写経しない。**盤面から独立に数えた値**と年代記を突き合わせる。
  //   ⭐⭐⭐ 測る瞬間を「ラウンドの頭」に固定するのが肝。手番の途中で読むと、盤面には
  //      反映済で年代記にはまだ入っていない (endTurn 前の) 差分が挟まり、必ずズレる。
  //      → 関所は tickCordonZones (ラウンド開始・actor ループの**前**に必ず 1 回通る)。
  //        ここは手番の外なので、本番のスナップショットも開いていない。
  //   ⭐ 敵の手番を黙らせ、全員の HP を盛って「戦闘が終わって別ノードへ移る」を封じる。
  //      敵の配列が入れ替わると、盤面側の差分が原理的に測れなくなるため。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §2 働きの集計 (STEP2 = 依頼書 §5) ---');
  {
    /* ⚠ §1 の PARTY6 はブロックスコープの中なのでここには届かない。同じ形で置き直す。
       ⚠ rich な形でないと index.html のガードに弾かれ、黙って既定編成へ落ちる。 */
    const PARTY6 = [
      { classKey: 'warrior', isHero: true,  zone: 'front', name: null, trait: null, line: null },
      { classKey: 'dwarf',   isHero: false, zone: 'front', name: 'アルヴ', trait: null, line: null },
      { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'ベル',   trait: null, line: null },
      { classKey: 'rogue',   isHero: false, zone: 'mid',   name: 'カイ',   trait: null, line: null },
      { classKey: 'elf',     isHero: false, zone: 'mid',   name: 'ディア', trait: null, line: null },
      { classKey: 'mage',    isHero: false, zone: 'rear',  name: 'エラ',   trait: null, line: null },
    ];

    /* 関所と計器をページへ差し込む。⚠ classic script 直下の function 宣言は window に載るので
       window.<name> = wrapper で**内部の呼び口ごと**差し替えられる (bare 参照も同じ物を指す)。 */
    const installGate = async (page) => {
      await page.evaluate(() => {
        if (window.__chProbe) return;
        const P = window.__chProbe = {
          gate: false, parked: 0, orig: {}, enemyTurnsOff: false,
          healPending: false, healTarget: null, healApplied: 0, ok: false,
        };
        const t = window.tickCordonZones;
        const e = window.enemyAttackTurn;
        const a = window.allyAttackTurn;
        P.ok = (typeof t === 'function' && typeof e === 'function' && typeof a === 'function');
        if (!P.ok) return;
        P.orig.tickCordonZones = t;
        window.tickCordonZones = async function () {
          while (P.gate) { P.parked++; await new Promise(r => setTimeout(r, 20)); }
          return t.apply(this, arguments);
        };
        P.orig.enemyAttackTurn = e;
        window.enemyAttackTurn = async function () {
          if (P.enemyTurnsOff) return;
          return e.apply(this, arguments);
        };
        /* (2c) の注射器: **本番の手番の中で**回復を起こす。
           ⚠ 手番の外で HP を上げても本番のスナップショットが開いていないので何も起きず、
              「回復がダメージに化ける」欠陥を原理的に捕まえられない (空振り)。
           ⚠ 回す相手は行動者以外にする。自分自身だと与ダメの加算条件から外れて弱くなる。 */
        P.orig.allyAttackTurn = a;
        window.allyAttackTurn = async function (who) {
          if (P.healPending && P.healTarget && who !== P.healTarget) {
            P.healPending = false;
            const before = P.healTarget.hp;
            P.healTarget.hp = Math.min(P.healTarget.maxHp, P.healTarget.hp + 400);
            P.healApplied += (P.healTarget.hp - before);
          }
          return a.apply(this, arguments);
        };
        /* 盤面と年代記を**同じ 1 回の読み取り**で採る。時刻がずれないのが肝。 */
        window.__chLedger = function () {
          const out = { err: null };
          try {
            let en = 0;
            for (let i = 0; i < enemies.length; i++) if (enemies[i]) en += enemies[i].hp;
            out.enemyHp = en; out.enemyN = enemies.length;
            let p = hp;
            for (let i = 0; i < allies.length; i++) if (allies[i]) p += allies[i].hp;
            out.partyHp = p; out.allyN = allies.length;
            const s = RunChronicle.snapshot(null);
            let d = 0, tk = 0, h = 0;
            for (const m of s.members) { d += m.dealt; tk += m.taken; h += m.healed; }
            out.dealt = d; out.taken = tk; out.healed = h;
            out.kills = s.kills; out.members = s.members.length;
          } catch (er) { out.err = String((er && er.message) || er); }
          try { out.enc = encounterActive; } catch (er) { out.enc = null; }
          return out;
        };
      });
    };
    const waitEncounter = (page, ms) => pollUntil(page, () => {
      let enc = false, n = 0;
      try { enc = !!encounterActive; } catch (e) {}
      try { n = enemies.filter(x => x && x.alive).length; } catch (e) {}
      return { done: enc && n >= 1, enc: enc, alive: n };
    }, ms || 150000, 700);
    const armGate = async (page, ms) => {
      await page.evaluate(() => { window.__chProbe.gate = true; window.__chProbe.parked = 0; });
      return pollUntil(page, () => {
        const P = window.__chProbe;
        return { done: P.parked >= 2, parked: P.parked };
      }, ms || 90000, 120);
    };
    const releaseGate = (page) => page.evaluate(() => { window.__chProbe.gate = false; });

    // ── 頁 1: (2a) 与ダメの帳尻 と (2c) 回復がダメージに化けていないこと ──────
    const page = await openIndex(browser, 'autoplay=30&diag=1', { party: PARTY6 });
    await installGate(page);
    const enc = await waitEncounter(page);
    console.log('  [arm D] encounter = ' + JSON.stringify(enc));
    check('(2z0) [装置] 関所と計器をページへ差し込めた (tickCordonZones / enemyAttackTurn / allyAttackTurn)',
      await page.evaluate(() => !!(window.__chProbe && window.__chProbe.ok && window.__chLedger)), '');
    check('(2z1) [装置] 戦闘が始まっていて生きた敵が居る (母集団)',
      !!(enc && enc.done), JSON.stringify(enc));

    /* 敵の手番を黙らせ、HP を盛って戦闘が終わらないようにする。
       ⚠ 盛るのは関所に入る**前**。手番の途中で盛ると、その手番の endTurn が「回復」として
          記録してしまい、後で測る healed の差分に混ざる。 */
    await page.evaluate(() => {
      const P = window.__chProbe;
      P.enemyTurnsOff = true;
      try {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (!e) continue;
          e.maxHp = 999999; e.hp = 999999;
        }
        maxHp = 99999; hp = 99999;
        for (const a of allies) if (a) { a.maxHp = 99999; a.hp = 99999; }
      } catch (e) {}
    });

    const p0 = await armGate(page);
    const D0 = await page.evaluate(() => window.__chLedger());
    await releaseGate(page);
    await sleep(6000);
    const p1 = await armGate(page);
    const D1 = await page.evaluate(() => window.__chLedger());
    console.log('  [arm D] park0=' + JSON.stringify(p0) + ' park1=' + JSON.stringify(p1));
    console.log('  [arm D] L0 = ' + JSON.stringify(D0));
    console.log('  [arm D] L1 = ' + JSON.stringify(D1));

    const dEnemyLoss = (D0.enemyHp - D1.enemyHp);
    const dDealt     = (D1.dealt - D0.dealt);
    const dTaken     = (D1.taken - D0.taken);
    check('(2z2) [装置] 測っている間に敵の配列が入れ替わっていない (同じ盤面を前後で見ている)',
      D0.enemyN === D1.enemyN && D0.allyN === D1.allyN && D1.enc === true,
      'enemyN ' + D0.enemyN + '→' + D1.enemyN + ' / allyN ' + D0.allyN + '→' + D1.allyN + ' / enc=' + D1.enc);
    check('(2z3) [装置] 母集団が空でない — 窓の間に敵の HP が実際に減っている',
      dEnemyLoss >= 1, 'boardEnemyLoss=' + dEnemyLoss);
    check('(2z4) [装置] 敵の手番を黙らせたので味方の HP は減っていない (同士討ちが与ダメに混ざらない)',
      D1.partyHp >= D0.partyHp && dTaken === 0,
      'partyHp ' + D0.partyHp + '→' + D1.partyHp + ' / takenΔ=' + dTaken);
    check('(2a) ★各メンバーの与ダメ合計の増分 = 盤面で減った敵 HP の合計 (別経路で算出)',
      dEnemyLoss >= 1 && dDealt === dEnemyLoss,
      'chronicle dealtΔ=' + dDealt + ' / board enemyLoss=' + dEnemyLoss);

    // ── (2c) 回復がダメージとして計上されていないこと ────────────────────────
    /* ⚠ 満タンの相手を「回復」しても Math.min に吸われて何も起きない (#34 の実測)。
       必ず**先に削ってから**測る。 */
    const woundInfo = await page.evaluate(() => {
      const P = window.__chProbe;
      const t = allies.find(a => a && a.alive) || null;
      if (!t) return { ok: false };
      t.maxHp = 99999; t.hp = 1;          // ★ 先に削る
      P.healTarget = t; P.healApplied = 0; P.healPending = true;
      return { ok: true, who: (t.npcName || (t.def && t.def.name) || '?'), hp: t.hp, maxHp: t.maxHp };
    });
    console.log('  [arm F] wound = ' + JSON.stringify(woundInfo));
    const F0 = await page.evaluate(() => window.__chLedger());
    await releaseGate(page);
    await sleep(6000);
    const pf = await armGate(page);
    const F1 = await page.evaluate(() => window.__chLedger());
    const healApplied = await page.evaluate(() => window.__chProbe.healApplied);
    console.log('  [arm F] park=' + JSON.stringify(pf) + ' healApplied=' + healApplied);
    console.log('  [arm F] L0 = ' + JSON.stringify(F0));
    console.log('  [arm F] L1 = ' + JSON.stringify(F1));

    const fEnemyLoss = (F0.enemyHp - F1.enemyHp);
    const fDealt     = (F1.dealt - F0.dealt);
    const fTaken     = (F1.taken - F0.taken);
    const fHealed    = (F1.healed - F0.healed);
    check('(2z5) [装置] 母集団が空でない — **本番の手番の中で**実際に回復が起きた',
      healApplied >= 1, 'healApplied=' + healApplied);
    check('(2z6) [装置] 同じ窓で敵の HP も実際に減っている (帳尻を測る相手が居る)',
      fEnemyLoss >= 1 && F0.enemyN === F1.enemyN, 'boardEnemyLoss=' + fEnemyLoss);
    check('(2z7) [装置] 起きた回復が回復として記録されている (healed が伸びた)',
      fHealed >= healApplied, 'healedΔ=' + fHealed + ' / 注射した回復量=' + healApplied);
    check('(2c) ★回復が与ダメージとして計上されていない (与ダメ増分が盤面の敵 HP 減少とちょうど一致)',
      healApplied >= 1 && fEnemyLoss >= 1 && fDealt === fEnemyLoss && fTaken === 0,
      'dealtΔ=' + fDealt + ' / enemyLoss=' + fEnemyLoss + ' / takenΔ=' + fTaken + ' / heal=' + healApplied);

    await page.close();
  }

  // ── (2b) 手番外の 6 点 ────────────────────────────────────────────────
  //   ⭐⭐⭐ 「発火したこと」を先に装置で確かめる。発火していなければ 0 と 0 が一致して
  //      永久に緑になる。6 本すべてが盤面を動かしたことを (2z8) が縛る。
  console.log('\n--- §2 (2b) 手番外の 6 点 ---');
  {
    const PARTY6b = [
      { classKey: 'warrior', isHero: true,  zone: 'front', name: null, trait: null, line: null },
      { classKey: 'dwarf',   isHero: false, zone: 'front', name: 'アルヴ', trait: null, line: null },
      { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'ベル',   trait: null, line: null },
      { classKey: 'rogue',   isHero: false, zone: 'mid',   name: 'カイ',   trait: null, line: null },
      { classKey: 'elf',     isHero: false, zone: 'mid',   name: 'ディア', trait: null, line: null },
      { classKey: 'mage',    isHero: false, zone: 'rear',  name: 'エラ',   trait: null, line: null },
    ];
    const page = await openIndex(browser, 'autoplay=30&diag=1', { party: PARTY6b });
    await page.evaluate(() => {
      if (window.__chProbe) return;
      const P = window.__chProbe = { gate: false, parked: 0, orig: {}, enemyTurnsOff: false, ok: false };
      const t = window.tickCordonZones;
      P.ok = (typeof t === 'function');
      if (!P.ok) return;
      P.orig.tickCordonZones = t;
      window.tickCordonZones = async function () {
        while (P.gate) { P.parked++; await new Promise(r => setTimeout(r, 20)); }
        return t.apply(this, arguments);
      };
      window.__chLedger = function () {
        const out = {};
        let en = 0;
        for (let i = 0; i < enemies.length; i++) if (enemies[i]) en += enemies[i].hp;
        out.enemyHp = en;
        let p = hp;
        for (let i = 0; i < allies.length; i++) if (allies[i]) p += allies[i].hp;
        out.partyHp = p;
        const s = RunChronicle.snapshot(null);
        let d = 0, tk = 0;
        for (const m of s.members) { d += m.dealt; tk += m.taken; }
        out.dealt = d; out.taken = tk;
        return out;
      };
    });
    const enc2 = await pollUntil(page, () => {
      let e = false, n = 0;
      try { e = !!encounterActive; } catch (er) {}
      try { n = enemies.filter(x => x && x.alive).length; } catch (er) {}
      return { done: e && n >= 1, enc: e, alive: n };
    }, 150000, 700);
    console.log('  [arm E] encounter = ' + JSON.stringify(enc2));

    /* 関所でゲームループごと停める。⚠ ここは手番の**外** = 本番のスナップショットが
       開いていないので、6 点を 1 つずつ呼んでも入れ子で潰されない。 */
    await page.evaluate(() => { window.__chProbe.gate = true; window.__chProbe.parked = 0; });
    const parked2 = await pollUntil(page, () => {
      const P = window.__chProbe;
      return { done: P.parked >= 2, parked: P.parked };
    }, 90000, 120);
    console.log('  [arm E] parked = ' + JSON.stringify(parked2));

    const six = await page.evaluate(async () => {
      const R = { steps: [], err: null, prep: {} };
      const led = window.__chLedger;
      const rec = (site, b, a) => {
        R.steps.push({
          site: site,
          enemyLoss: b.enemyHp - a.enemyHp,
          partyLoss: b.partyHp - a.partyHp,
          dealt: a.dealt - b.dealt,
          taken: a.taken - b.taken,
        });
      };
      try {
        /* 下ごしらえ: 誰も死なせない / 不屈で耐える枝を封じる / 敵を落とさない。
           ⚠ 全部この関所の中 (手番の外) でやるので、どの差分にも帰属されない。 */
        gameOver = false;
        maxHp = 999999; hp = 999999;
        equippedSkills = [];
        playerBuffs.resilientFired = true;
        invincible = false; guardInvincible = false;
        counterActive = false; counterInvincible = false; isGuarding = false;
        for (const a of allies) {
          if (!a) continue;
          a.alive = true; a.maxHp = 999999; a.hp = 999999;
          a.buffs = a.buffs || {}; a.buffs.resilientFired = true;
          a.equippedSkills = [];
        }
        let ei = -1;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (!e) continue;
          e.maxHp = 999999; e.hp = 999999;
          if (ei < 0 && e.alive && !(e.def && e.def.isObjective)) ei = i;
        }
        R.prep.enemyIdx = ei;
        R.prep.allies = allies.filter(a => a && a.alive).length;
        if (ei < 0) { R.err = 'no usable enemy'; return R; }

        // ① damageEnemy (探索フェーズの斬撃)
        {
          const b = led();
          const h0 = enemies[ei].hp;
          for (let k = 0; k < 10 && enemies[ei].hp === h0; k++) damageEnemy(ei);
          rec('damageEnemy', b, led());
        }
        // ② damagePlayer (探索フェーズの被弾)。⚠ encounterActive 中は本体が即 return する。
        {
          const prevEnc = encounterActive;
          encounterActive = false;
          const b = led();
          const h0 = hp;
          for (let k = 0; k < 40 && hp === h0; k++) {
            invincible = false; guardInvincible = false;
            counterActive = false; counterInvincible = false; isGuarding = false;
            damagePlayer(enemies[ei], ei);
          }
          rec('damagePlayer', b, led());
          invincible = false; guardInvincible = false;
          counterActive = false; counterInvincible = false;
          encounterActive = prevEnc;
        }
        // ③ triggerTrapOnPlayer (罠・頭)
        {
          hp = 999999;
          const b = led();
          triggerTrapOnPlayer({ triggered: false, found: false });
          rec('triggerTrapOnPlayer', b, led());
        }
        // ④ triggerTrapOnAlly (罠・仲間)
        {
          const al = allies.find(a => a && a.alive);
          al.hp = 999999;
          const b = led();
          triggerTrapOnAlly({ triggered: false, found: false }, al);
          rec('triggerTrapOnAlly', b, led());
        }
        // ⑤ triggerTrapOnEnemy (武器化した罠)
        {
          const en = enemies[ei];
          en.alive = true; en.hp = 999999;
          const b = led();
          triggerTrapOnEnemy({ type: 'damage', triggered: false, found: true,
                               rearmed: true, owner: 'party', el: null }, en, ei);
          rec('triggerTrapOnEnemy', b, led());
        }
        // ⑥ tickCordonZones (コードンの矢)。⚠ 関所を素通りするため**原本**を呼ぶ。
        {
          const el = allies.find(a => a && a.alive && a.classKey === 'elf')
                  || allies.find(a => a && a.alive);
          const en = enemies[ei];
          en.alive = true; en.hp = 999999;
          const size = (en.def && en.def.displaySize) || 96;
          const tx = Math.floor((en.x + size / 2) / TILE_SIZE);
          const ty = Math.floor((en.y + size / 2) / TILE_SIZE);
          cordonZones.length = 0;
          cordonZones.push({ tx: tx - 1, ty: ty - 1, w: 3, h: 3,
                             dmgDice: '2d6', roundsLeft: 3, owner: el });
          R.prep.cordonOwner = (el && (el.npcName || (el.def && el.def.name))) || null;
          const b = led();
          await window.__chProbe.orig.tickCordonZones();
          rec('tickCordonZones', b, led());
          cordonZones.length = 0;
        }
      } catch (e) { R.err = String((e && e.message) || e); }
      return R;
    });
    console.log('  [arm E] prep = ' + JSON.stringify(six.prep) + ' err=' + six.err);
    (six.steps || []).forEach(s => console.log('        · ' + JSON.stringify(s)));

    const steps = six.steps || [];
    const by = (n) => steps.find(s => s.site === n) || null;
    /* 敵を削る 3 点は「与ダメ」に、味方を削る 3 点は「被ダメ」に載るのが正しい姿。 */
    const HURT_ENEMY = ['damageEnemy', 'triggerTrapOnEnemy', 'tickCordonZones'];
    const HURT_PARTY = ['damagePlayer', 'triggerTrapOnPlayer', 'triggerTrapOnAlly'];
    const firedE = HURT_ENEMY.filter(n => { const s = by(n); return s && s.enemyLoss >= 1; });
    const firedP = HURT_PARTY.filter(n => { const s = by(n); return s && s.partyLoss >= 1; });
    const okE = HURT_ENEMY.filter(n => { const s = by(n); return s && s.enemyLoss >= 1 && s.dealt === s.enemyLoss; });
    const okP = HURT_PARTY.filter(n => { const s = by(n); return s && s.partyLoss >= 1 && s.taken === s.partyLoss; });

    check('(2z8) [装置] 手番外の 6 点が **6 本とも実際に発火した** (盤面の HP が動いた)',
      firedE.length === 3 && firedP.length === 3,
      '敵を削った=' + JSON.stringify(firedE) + ' / 味方を削った=' + JSON.stringify(firedP));
    check('(2z9) [装置] 呼び出し中に例外が出ていない', !six.err, String(six.err));
    check('(2b) ★手番外の 6 点 (罠・探索・コードン) のダメージも 1 本残らず計上されている',
      firedE.length === 3 && firedP.length === 3 && okE.length === 3 && okP.length === 3,
      '与ダメ一致=' + JSON.stringify(okE) + ' / 被ダメ一致=' + JSON.stringify(okP));

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // §3 記録棚と永続化 (STEP4 = 依頼書 §7)
  //   ⭐⭐⭐ どの節も先に「母集団を作れたか」を [装置] で確かめる。
  //      (3c) は「6 件目を保存する前に本当に 5 件溜まっていたか」を先に縛らないと、
  //      0 件のまま 0 件と一致して永久に緑になる。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §3 記録棚と永続化 (STEP4 = 依頼書 §7) ---');
  {
    const page = await openTavern(browser, '', MK_RESULT(3));
    const st = await page.evaluate(() => {
      const out = { api: !!window.__chronicle };
      if (!out.api) return out;
      const C = window.__chronicle;
      out.on  = C.on();
      out.key = C.shelfKey();
      out.max = C.shelfMax();
      out.n   = C.shelf().length;
      out.raw = localStorage.getItem('dragonfighters.chronicles');
      /* 前置詞違いのキー (df_chronicles など) が混ざっていないことも同じ 1 回で見る。
         ⚠ これが無いと N6 wipeleak が「別名で保存」しても (3a) が緑のままになりうる。 */
      out.hits = Object.keys(localStorage).filter(k => k.toLowerCase().indexOf('chronicle') >= 0);
      out.entry0 = C.shelf()[0] || null;
      return out;
    });
    console.log('  [arm G] ' + JSON.stringify({ api: st.api, on: st.on, key: st.key, max: st.max,
      n: st.n, hits: st.hits, rawLen: st.raw ? st.raw.length : -1 }));

    check('(3z0) [装置] 酒場側の読み取り窓 window.__chronicle が載っている',
      st.api === true && st.on === true, JSON.stringify({ api: st.api, on: st.on }));
    check('(3z1) [装置] 母集団が空でない — 帰還 1 回で記録棚に 1 件積まれた',
      st.n >= 1 && !!st.raw, 'shelf=' + st.n + ' raw=' + (st.raw ? 'あり' : 'null'));
    check('(3a) ★dragonfighters.chronicles が localStorage にあり、前置詞が dragonfighters.',
      st.key === 'dragonfighters.chronicles'
        && st.key.indexOf('dragonfighters.') === 0
        && st.raw !== null
        && st.hits.length === 1 && st.hits[0] === 'dragonfighters.chronicles',
      'key=' + st.key + ' / localStorage 内の chronicle キー=' + JSON.stringify(st.hits));
    check('(3a2) 積まれた 1 件が { at (epoch ms) / scenarioTitle / ch } の形をしている',
      !!(st.entry0 && typeof st.entry0.at === 'number' && st.entry0.at > 0
         && st.entry0.scenarioTitle === '廃坑の依頼' && st.entry0.ch && st.entry0.ch.v === 1),
      JSON.stringify(st.entry0 ? { at: st.entry0.at, t: st.entry0.scenarioTitle,
        v: st.entry0.ch && st.entry0.ch.v } : null));

    // ── (3b) 新規ゲーム (wipeLive) で消えること ────────────────────────────
    const wiped = await page.evaluate(() => {
      const out = {};
      const before = localStorage.getItem('dragonfighters.chronicles');
      out.beforeN = before ? (JSON.parse(before) || []).length : 0;
      try { out.removed = DFSlots.wipeLive(); } catch (e) { out.threw = String((e && e.message) || e); }
      out.after = localStorage.getItem('dragonfighters.chronicles');
      return out;
    });
    console.log('  [arm G] wipeLive = ' + JSON.stringify(wiped));
    check('(3z2) [装置] 母集団が空でない — wipeLive の**前**に記録棚が実在した',
      wiped.beforeN >= 1 && !wiped.threw, JSON.stringify(wiped));
    check('(3b) ★DFSlots.wipeLive() の後に dragonfighters.chronicles が null '
        + '(前置詞が dragonfighters. なので keysOf() が勝手に面倒を見る)',
      wiped.after === null && wiped.removed >= 1,
      'after=' + String(wiped.after) + ' removed=' + wiped.removed);
    await page.close();
  }

  // ── (3c) 6 件目で最古が落ちる ────────────────────────────────────────────
  {
    const page = await openTavern(browser, '', null);
    const trim = await page.evaluate(() => {
      const C = window.__chronicle;
      const out = {};
      try {
        localStorage.removeItem('dragonfighters.chronicles');
        /* ⛔ localStorage へ直に書かない。**本番の保存経路** (shelfPush) を通す。
           直書きすると「5 件で切る」ロジックを写経した別実装を測ることになる。 */
        const mk = (i) => ({ at: 1756400000000 + i * 1000, scenarioId: 's' + i,
          scenarioTitle: 'run' + i,
          ch: { v: 1, outcome: 'defeat', rounds: i, kills: 0, members: [], events: [],
                idle: null, lastBlow: null } });
        for (let i = 1; i <= 5; i++) C.shelfPush(mk(i));
        const a5 = C.shelf();
        out.n5 = a5.length;
        out.first5 = a5.length ? a5[0].scenarioTitle : null;
        out.last5  = a5.length ? a5[a5.length - 1].scenarioTitle : null;
        C.shelfPush(mk(6));
        const a6 = C.shelf();
        out.n6 = a6.length;
        out.first6 = a6.length ? a6[0].scenarioTitle : null;
        out.last6  = a6.length ? a6[a6.length - 1].scenarioTitle : null;
        out.max = C.shelfMax();
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    console.log('  [arm H] ' + JSON.stringify(trim));
    check('(3z3) [装置] ★母集団 — 6 件目を保存する**前**に実際に 5 件溜まっていた',
      trim.n5 === 5 && trim.first5 === 'run1' && trim.last5 === 'run5', JSON.stringify(trim));
    check('(3c) ★6 件目を保存すると件数が 5 のまま (最古の run1 が落ちて run2〜run6 が残る)',
      trim.n5 === 5 && trim.n6 === 5 && trim.first6 === 'run2' && trim.last6 === 'run6',
      'n ' + trim.n5 + '→' + trim.n6 + ' / 先頭 ' + trim.first5 + '→' + trim.first6);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // §4 恒等 (非退行) — 触っていないものが本当に動いていないか
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §4 恒等 (非退行) ---');
  {
    // (4a) 帰還バナーは残っていて、従来どおり自動で消える
    const page = await openTavern(browser, '', MK_RESULT(2));
    const b0 = await page.evaluate(countBanners);
    const src = await fetchText('/tavern.html');
    const hasFade  = src.indexOf('banner.style.opacity = "0", 5500') >= 0;
    const hasKill  = src.indexOf('banner.remove(), 6200') >= 0;
    console.log('  [arm I] banners@1s=' + b0 + ' fade5500=' + hasFade + ' remove6200=' + hasKill);
    check('(4z0) [装置] 母集団が空でない — 帰還直後にバナーが 1 枚出ている',
      b0 === 1, 'banners=' + b0);
    await sleep(6600);
    const b1 = await page.evaluate(countBanners);
    check('(4a) ★showReturnBanner が従来どおり存在し、5.5 秒でフェード / 6.2 秒で消える',
      b0 === 1 && b1 === 0 && hasFade && hasKill,
      'banners 1s=' + b0 + ' → 7.6s=' + b1 + ' / fade=' + hasFade + ' remove=' + hasKill);
    await page.close();
  }
  {
    /* (4c) world.html は 1 バイトも触っていない (既存 golden verify_quest_walk の縛りを自分でも守る)。
       ⚠⚠ 依頼書 §9 (4c) の「配信バイトに enterVia|lastResult が **0 回**」は誤り。
          実測 = 14 回出現する (全部コメント)。verify_quest_walk (1b) の実際の述語は
            ① その語を含む行が Storage と**同居していない**
            ② (session|local)Storage.(get|set|remove)Item("…enterVia|lastResult…") が 0 件
          = 「getItem すらしていない」。⛔ 期待値を緩めるのではなく、**golden と同じ述語**を使う。 */
    const w = await fetchText('/world.html');
    const lines = w.split(/\r?\n/).filter(t => /enterVia|lastResult/.test(t));
    const withStorage = lines.filter(t => /Storage/.test(t));
    const apiHits = w.match(
      new RegExp('(?:session|local)Storage\\s*\\.\\s*(?:get|set|remove)Item\\s*\\(\\s*["\'][^"\']*(?:enterVia|lastResult)', 'g')) || [];
    check('(4z1) [装置] world.html の配信が空でない', w.length > 10000, w.length + ' bytes');
    check('(4z2) [装置] ★母集団 — その語を含む行が 1 行以上ある (0 行だと述語が空回りして永久緑)',
      lines.length >= 1, 'lines=' + lines.length);
    check('(4c) ★world.html が enterVia / lastResult を **getItem すらしていない** '
        + '(語を含む行はすべてコメント。verify_quest_walk (1b) と同じ述語)',
      withStorage.length === 0 && apiHits.length === 0,
      'その語を含む行=' + lines.length + ' / Storage と同居=' + withStorage.length
        + ' / Storage API 呼び=' + apiHits.length);
  }

  // ══════════════════════════════════════════════════════════════════════
  // §6 撤退 (6a) と §4 (4b)(4d) — index 側は同じ 2 ページで一度に測る
  //   ⭐ 撤退スイッチは「off で出ないこと」だけでは緑にできない。**on で出ること**を
  //      対にして測らないと、そもそも出ない実装でも「出ない」で通ってしまう。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §6 撤退 (6a) / §4 (4b)(4d) ---');
  {
    const probeResult = () => {
      const out = {};
      try {
        sessionStorage.removeItem('dragonfighters.lastResult');
        out.on = (typeof CHRONICLE_ON !== 'undefined') ? CHRONICLE_ON : null;
        out.logMax = (typeof COMBAT_LOG_MAX !== 'undefined') ? COMBAT_LOG_MAX : null;
        out.hasFn = (typeof window.showResult === 'function');
        resultShown = false;               // 既に出ていても書き直させる
        if (out.hasFn) window.showResult(false);
        const raw = sessionStorage.getItem('dragonfighters.lastResult');
        const p = raw ? JSON.parse(raw) : null;
        out.keys = p ? Object.keys(p) : null;
        out.hasCh = !!(p && p.chronicle);
        /* リザルトの結論 1 行 (§6-2)。⛔ 文面は縛らない。「行が増えたか」だけ見る。 */
        const rr = document.getElementById('resultReward');
        out.reward = rr ? rr.innerHTML : null;
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    };

    const pOn = await openIndex(browser, 'autoplay=30&diag=1', {});
    const on = await pOn.evaluate(probeResult);
    await pOn.close();
    const pOff = await openIndex(browser, 'autoplay=30&diag=1&chronicle=0', {});
    const off = await pOff.evaluate(probeResult);
    await pOff.close();
    console.log('  [arm J] on  = ' + JSON.stringify({ on: on.on, hasCh: on.hasCh, keys: on.keys,
      logMax: on.logMax, rewardLen: (on.reward || '').length, err: on.err }));
    console.log('  [arm J] off = ' + JSON.stringify({ on: off.on, hasCh: off.hasCh, keys: off.keys,
      logMax: off.logMax, rewardLen: (off.reward || '').length, err: off.err }));

    check('(6z0) [装置] 両方のページで showResult が実際に走り lastResult が書かれた',
      on.hasFn === true && off.hasFn === true && !!on.keys && !!off.keys,
      JSON.stringify({ onFn: on.hasFn, offFn: off.hasFn }));
    check('(6z1) [装置] ★対の片方 — 撤退スイッチ無しなら chronicle キーが**載る**'
        + ' (これが無いと (6a) は「出ない実装」でも緑になる)',
      on.on === true && on.hasCh === true, 'CHRONICLE_ON=' + on.on + ' hasChronicle=' + on.hasCh);
    check('(6a) ★index.html?chronicle=0 → lastResult に chronicle キーが載らない',
      off.on === false && off.hasCh === false && (off.keys || []).indexOf('chronicle') < 0,
      'CHRONICLE_ON=' + off.on + ' keys=' + JSON.stringify(off.keys));

    const NEED = ['scenarioId', 'scenarioTitle', 'cleared', 'defeated', 'reward'];
    const missOn  = NEED.filter(k => (on.keys || []).indexOf(k) < 0);
    const missOff = NEED.filter(k => (off.keys || []).indexOf(k) < 0);
    check('(4b) ★lastResult の既存キー (scenarioId/scenarioTitle/cleared/defeated/reward) が'
        + ' ?chronicle=0 の有無どちらでも 1 つも欠けていない',
      missOn.length === 0 && missOff.length === 0,
      '欠け on=' + JSON.stringify(missOn) + ' off=' + JSON.stringify(missOff));
    check('(4d) ★#combatLog の固定バッファ長が従来どおり (実行時の値を読む。'
        + 'バイト数えだとコメントまで数えてしまう)',
      on.logMax === 18 && off.logMax === 18,
      'on=' + on.logMax + ' off=' + off.logMax);
    check('(6a2) 敗北リザルトの結論 1 行 — スイッチ ON では行が増え、?chronicle=0 では増えない'
        + ' (⛔ 文面そのものは縛らない)',
      (on.reward || '').length > (off.reward || '').length && (off.reward || '').length > 0,
      'on=' + (on.reward || '').length + 'B / off=' + (off.reward || '').length + 'B');
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP3 の中身 — 空振り (依頼書 §6-1) と とどめ (§6-2)
  //   ⛔ 「◯◯しましょう」の類が 1 文も無いことは §12 の禁止事項。ここでは**数と名前**が
  //      正しく動くかだけを測る (文面は縛らない = 依頼書 §9 の「測らないこと」)。
  //   ⭐ 発動の記録は 2 経路ある。① 記録口 usedSkill ② 呪文スロット台帳 (max − 残)。
  //      **両方**を別々に動かして、どちらも「発動しなかった一覧」から消えることを見る。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP3 空振り (§6-1) と とどめ (§6-2) ---');
  {
    const PARTY6c = [
      { classKey: 'warrior', isHero: true,  zone: 'front', name: null, trait: null, line: null },
      { classKey: 'dwarf',   isHero: false, zone: 'front', name: 'アルヴ', trait: null, line: null },
      { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'ベル',   trait: null, line: null },
      { classKey: 'rogue',   isHero: false, zone: 'mid',   name: 'カイ',   trait: null, line: null },
      { classKey: 'elf',     isHero: false, zone: 'mid',   name: 'ディア', trait: null, line: null },
      { classKey: 'mage',    isHero: false, zone: 'rear',  name: 'エラ',   trait: null, line: null },
    ];
    const page = await openIndex(browser, 'autoplay=30&diag=1', { party: PARTY6c });
    await page.evaluate(() => {
      try { enemies.forEach(e => { e.x = -999999; e.y = -999999; }); } catch (e) {}
      try { encounterActive = false; encounterEnemyIndices = []; } catch (e) {}
      window.sleepMs = function () { return new Promise(r => setTimeout(r, 0)); };
    });

    const idle = await page.evaluate(() => {
      const out = {};
      try {
        const i0 = RunChronicle.snapshot(null).idle;
        out.n0 = (i0.unusedSkills || []).length;
        out.slotsMax0 = i0.spellSlotsMax; out.slotsLeft0 = i0.spellSlotsLeft;
        /* ① 記録口。⚠ 名前で持つのは、技の入口が 40 本近くあり ID を持たない集約点
              (showRollAtAlly) で拾っているため。 */
        out.target = (i0.unusedSkills || [])[0] || null;
        if (out.target) RunChronicle.usedSkill(out.target);
        const i1 = RunChronicle.snapshot(null).idle;
        out.n1 = (i1.unusedSkills || []).length;
        out.targetGone = out.target ? ((i1.unusedSkills || []).indexOf(out.target) < 0) : null;
        /* ② 呪文スロット台帳。**本番の呪文が書くのと同じ 1 行**を撃つ。 */
        let caster = null, sid = null;
        for (const a of allies) {
          if (!a || !a.spellSlots || !a.maxSpellSlots) continue;
          for (const k of Object.keys(a.maxSpellSlots)) {
            if ((a.maxSpellSlots[k] || 0) > 0 && (a.spellSlots[k] || 0) > 0
                && (a.equippedSkills || []).indexOf(k) >= 0) { caster = a; sid = k; break; }
          }
          if (caster) break;
        }
        out.sid = sid;
        if (caster) {
          out.sname = (getSkill(sid) && getSkill(sid).name) || sid;
          const b = RunChronicle.snapshot(null).idle;
          out.bHas = (b.unusedSkills || []).indexOf(out.sname) >= 0;
          out.bLeft = b.spellSlotsLeft;
          caster.spellSlots[sid] = Math.max(0, caster.spellSlots[sid] - 1);
          const c = RunChronicle.snapshot(null).idle;
          out.cHas = (c.unusedSkills || []).indexOf(out.sname) >= 0;
          out.cLeft = c.spellSlotsLeft;
        }
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    console.log('  [arm N] ' + JSON.stringify(idle));

    check('(6-1z0) [装置] ★母集団 — 出発直後は「発動しなかった技」が 1 つ以上あり、'
        + '呪文スロットも 1 つ以上ある (0 だと以降が空振りで永久緑)',
      idle.n0 >= 1 && idle.slotsMax0 >= 1,
      'unused=' + idle.n0 + ' slots=' + idle.slotsLeft0 + '/' + idle.slotsMax0);
    check('(6-1a) ★記録口 (RunChronicle.usedSkill) を通した技は「一度も発動しなかった技」から消える',
      idle.targetGone === true && idle.n1 === idle.n0 - 1,
      '対象=' + idle.target + ' / 件数 ' + idle.n0 + '→' + idle.n1);
    check('(6-1z1) [装置] ★母集団 — 呪文スロットを持つ技が実在し、消費前は未発動扱いだった',
      !!idle.sid && idle.bHas === true, 'sid=' + idle.sid + ' name=' + idle.sname + ' bHas=' + idle.bHas);
    check('(6-1b) ★呪文スロットを 1 つ消費すると、その技が未発動一覧から消え、残数も 1 減る '
        + '(⭐ 呪文はフックを刺さず既存の台帳から導いている)',
      idle.bHas === true && idle.cHas === false && idle.cLeft === idle.bLeft - 1,
      idle.sname + ': 未発動 ' + idle.bHas + '→' + idle.cHas
        + ' / 残スロット ' + idle.bLeft + '→' + idle.cLeft);

    // ── §6-2 とどめ ────────────────────────────────────────────────────────
    const kick = await page.evaluate(() => {
      const out = {};
      try {
        sessionStorage.removeItem('dragonfighters.lastResult');
        heroIsHead = true;
        playerBuffs.resilientFired = true;
        equippedSkills = [];
        hp = 1;
        /* 盤面から**独立に**残存敵数を数える (本番の式は写経せず、ここで自分で数える)。 */
        triggerTrapOnPlayer({ triggered: false, found: false });
        out.gameOver = gameOver;
        out.boardLeft = enemies.filter(e => e && e.alive && !e.passiveNpc).length;
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    const land = await pollUntil(page, () => {
      const raw = sessionStorage.getItem('dragonfighters.lastResult');
      let p = null;
      try { p = raw ? JSON.parse(raw) : null; } catch (e) {}
      const c = p && p.chronicle;
      return { done: !!(c && c.lastBlow), lb: (c && c.lastBlow) || null,
               outcome: c ? c.outcome : null, idleNull: c ? (c.idle === null) : null,
               unused: (c && c.idle) ? (c.idle.unusedSkills || []).length : -1 };
    }, 15000, 400);
    console.log('  [arm N] kick=' + JSON.stringify(kick) + ' land=' + JSON.stringify(land));

    check('(6-2z0) [装置] ★母集団 — 罠で頭が倒れて gameOver が立ち、リザルトが書かれた',
      kick.gameOver === true && !!(land && land.done), JSON.stringify({ kick: kick, done: land && land.done }));
    check('(6-2a) ★敗北の年代記に lastBlow が入り、とどめを刺した相手の名前が埋まっている',
      !!(land && land.lb && land.lb.by), 'lastBlow=' + JSON.stringify(land && land.lb));
    check('(6-2b) ★lastBlow.enemiesLeft が、盤面で数えた「生きている非 NPC の敵」と一致'
        + ' (ドライバ側で独立に数えた値)',
      !!(land && land.lb) && land.lb.enemiesLeft === kick.boardLeft,
      'chronicle=' + (land && land.lb ? land.lb.enemiesLeft : '?') + ' / board=' + kick.boardLeft);
    check('(6-2c) 保存された年代記に空振り (idle) も一緒に載っている',
      land && land.idleNull === false && land.unused >= 1,
      'idle=' + (land && land.idleNull === false ? 'あり' : 'null') + ' unused=' + (land && land.unused));
    check('(6-2d) outcome が "defeat"', land && land.outcome === 'defeat', 'outcome=' + (land && land.outcome));

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // §5 iOS / 手触り
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §5 iOS / 手触り ---');
  {
    const page = await openTavern(browser, '', MK_RESULT(3));
    const a = await page.evaluate(() => {
      const out = {};
      out.opened = window.__chronicle.open();
      const btn = document.getElementById('chronicleClose');
      out.hasBtn = !!btn;
      if (btn) {
        const r = btn.getBoundingClientRect();
        out.w = Math.round(r.width); out.h = Math.round(r.height);
        out.hit = (function () {
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!(el && (el === btn || btn.contains(el)));
        })();
      }
      return out;
    });
    console.log('  [arm K] close = ' + JSON.stringify(a));
    check('(5z0) [装置] 母集団が空でない — レポートが実際に開いている',
      a.opened === true, 'opened=' + a.opened);
    check('(5a) ★レポートに明示的な閉じるボタンがあり、タップ領域が 44px 以上 (かつ実際に押せる)',
      a.hasBtn === true && a.w >= 44 && a.h >= 44 && a.hit === true,
      JSON.stringify({ w: a.w, h: a.h, hit: a.hit }));

    /* (5b) 配線は「イベントを実際に投げて閉じるか」で測る。
       ⚠ リスナ一覧はページ側から列挙できないので、機能で縛るのが唯一の手。
       ⚠ 背景の口は ev.target !== ov で弾くので、必ず ov 自身へ投げること。 */
    const wire = await page.evaluate(() => {
      const C = window.__chronicle;
      const ov = document.getElementById('chronicleOverlay');
      const btn = document.getElementById('chronicleClose');
      const out = {};
      const trial = (host, type) => {
        C.open();
        if (!C.isOpen()) return 'not-open';
        host.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        return C.isOpen() ? 'still-open' : 'closed';
      };
      out.btnClick = trial(btn, 'click');
      out.btnTouch = trial(btn, 'touchend');
      out.bgClick  = trial(ov,  'click');
      out.bgTouch  = trial(ov,  'touchend');
      /* 中身 (羊皮紙) を叩いても閉じないこと = 背景判定が雑になっていないか */
      C.open();
      document.getElementById('chronicleInner')
        .dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      out.innerKeepsOpen = C.isOpen();
      C.close();
      return out;
    });
    console.log('  [arm K] wire = ' + JSON.stringify(wire));
    check('(5b) ★閉じるボタンと背景の**両方**に click と touchend が配線されている'
        + ' (4 通りとも実際に閉じる)',
      wire.btnClick === 'closed' && wire.btnTouch === 'closed'
        && wire.bgClick === 'closed' && wire.bgTouch === 'closed',
      JSON.stringify(wire));
    check('(5b2) 羊皮紙の中身を叩いても閉じない (背景判定が雑になっていない)',
      wire.innerKeepsOpen === true, 'innerKeepsOpen=' + wire.innerKeepsOpen);
    await page.close();
  }
  {
    /* (5c) 狭幅で 10 行を超えてもスクロールできること。
       ⚠⚠ 依頼書の body.ui-compact は **tavern.html には一度も付かない**。この画面の
          狭幅クラスの実体は body.compact (layout() が付ける)。ui-compact で測ると
          「狭幅になっていないのに緑」になる。 */
    const page = await openTavern(browser, '', MK_RESULT(14), { width: 420, height: 860, deviceScaleFactor: 1 });
    const sc = await page.evaluate(() => {
      const out = {};
      out.bodyClass = document.body.className;
      out.compact = document.body.classList.contains('compact');
      out.opened = window.__chronicle.open();
      const body = document.getElementById('chronicleBody');
      out.rows = body ? body.querySelectorAll('.chEvents li').length : -1;
      out.scrollH = body ? body.scrollHeight : -1;
      out.clientH = body ? body.clientHeight : -1;
      if (body) {
        body.scrollTop = 0;
        body.scrollTop = 99999;
        out.scrolled = body.scrollTop;
      }
      out.idleRows = body ? body.querySelectorAll('.chIdle li').length : -1;
      return out;
    });
    console.log('  [arm L] ' + JSON.stringify(sc));
    check('(5z1) [装置] 狭幅クラスが実際に付いている (body.compact — ui-compact ではない)',
      sc.compact === true, 'bodyClass="' + sc.bodyClass + '"');
    check('(5z2) [装置] ★母集団 — 年代記が実際に 10 行を超えている '
        + '(超えていなければスクロールも起きず永久に緑)',
      sc.rows > 10, 'rows=' + sc.rows);
    check('(5c) ★狭幅で年代記が 10 行を超えてもスクロールできる '
        + '(器ではなく #chronicleBody が縦スクロールを持つ)',
      sc.rows > 10 && sc.scrollH > sc.clientH && sc.scrolled > 0,
      'scrollH=' + sc.scrollH + ' clientH=' + sc.clientH + ' scrollTop=' + sc.scrolled);
    check('(5c2) 空振り (STEP3 §6-1) の行が末尾に出ている', sc.idleRows >= 1, 'idleRows=' + sc.idleRows);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // §6 撤退 (6b) — 酒場側。⭐ こちらも「スイッチ無しなら出る」を対で測る。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §6 撤退 (6b) ---');
  {
    const probeTv = () => {
      const out = {};
      out.on = window.__chronicle ? window.__chronicle.on() : null;
      out.hasOpenBtn = !!document.getElementById('chronicleOpenBtn');
      const sh = document.getElementById('chronicleShelf');
      out.hasShelf = !!sh;
      out.shelfShown = !!(sh && sh.classList.contains('show'));
      out.shelfN = window.__chronicle ? window.__chronicle.shelf().length : -1;
      out.raw = localStorage.getItem('dragonfighters.chronicles');
      out.opened = window.__chronicle ? window.__chronicle.open() : null;
      if (out.opened) window.__chronicle.close();
      out.banners = Array.prototype.slice.call(document.body.children)
        .filter((el) => el.tagName === 'DIV'
          && /z-index:15;/.test((el.getAttribute('style') || '').replace(/\s/g, ''))).length;
      return out;
    };
    const pOn = await openTavern(browser, '', MK_RESULT(3));
    const tvOn = await pOn.evaluate(probeTv);
    await pOn.close();
    const pOff = await openTavern(browser, 'chronicle=0', MK_RESULT(3));
    const tvOff = await pOff.evaluate(probeTv);
    await pOff.close();
    console.log('  [arm M] on  = ' + JSON.stringify(tvOn));
    console.log('  [arm M] off = ' + JSON.stringify(tvOff));

    check('(6z2) [装置] ★対の片方 — スイッチ無しなら導線 (バナーの読む口 + 記録棚) が**出る**',
      tvOn.on === true && tvOn.hasOpenBtn === true && tvOn.hasShelf === true
        && tvOn.shelfShown === true && tvOn.opened === true,
      JSON.stringify({ on: tvOn.on, openBtn: tvOn.hasOpenBtn, shelf: tvOn.shelfShown, opened: tvOn.opened }));
    check('(6b) ★tavern.html?chronicle=0 → レポートの導線が出ず (読む口も記録棚も DOM ごと無い)、'
        + 'バナーだけが従来どおり出る',
      tvOff.on === false && tvOff.hasOpenBtn === false && tvOff.hasShelf === false
        && tvOff.opened === false && tvOff.banners === 1 && tvOn.banners === 1,
      JSON.stringify({ on: tvOff.on, openBtn: tvOff.hasOpenBtn, shelf: tvOff.hasShelf,
        opened: tvOff.opened, banners: tvOff.banners }));
    check('(6b2) ?chronicle=0 では記録棚へ 1 件も書かれない (localStorage が null のまま)',
      tvOff.raw === null && tvOff.shelfN === 0 && tvOn.shelfN >= 1,
      'off raw=' + String(tvOff.raw) + ' / on shelf=' + tvOn.shelfN);
  }

  check('(Z) pageerror ゼロ', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 5)));

  await browser.close();
  srv.close();

  const pass = results.filter(r => r.state === 'PASS').length;
  const fail = results.filter(r => r.state === 'FAIL').length;
  const pend = results.filter(r => r.state === 'PENDING').length;
  console.log('\n[run-chronicle] ' + pass + ' PASSED / ' + fail + ' FAILED / ' + pend + ' PENDING');
  if (fail > 0) {
    console.log('[run-chronicle] NG: ' + results.filter(r => r.state === 'FAIL').map(r => r.name).join(' | '));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(3); });
