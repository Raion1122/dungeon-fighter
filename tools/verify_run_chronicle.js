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
  // §2〜§6 — 宣言だけ。STEP2 / STEP3 / STEP4 が埋める。
  //   ⚠ ここを消さないこと。「まだ測っていない」が一覧に残っているのが唯一の目印になる。
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n--- §2 働きの集計 (STEP2 = 依頼書 §5) ---');
  pending('(2a) 各メンバーの与ダメ合計 = 敵の maxHp からの減少量の合計 (別経路で盤面から算出)',
    'STEP2 (手番ラップ §5-1) 未実装');
  pending('(2b) 手番外の 6 点 (罠・探索) のダメージも計上されている', 'STEP2 (§5-2) 未実装');
  pending('(2c) 回復が与ダメージとして計上されていない', 'STEP2 (§5-2) 未実装');

  console.log('\n--- §3 記録棚と永続化 (STEP4 = 依頼書 §7) ---');
  pending('(3a) dragonfighters.chronicles が localStorage にあり、前置詞が dragonfighters.', 'STEP4 未実装');
  pending('(3b) DFSlots.wipeLive() の後に dragonfighters.chronicles が null', 'STEP4 未実装');
  pending('(3c) 6 件目を保存すると件数が 5 のまま (最古が落ちる)', 'STEP4 未実装');

  console.log('\n--- §4 恒等 (非退行) ---');
  pending('(4a) showReturnBanner が従来どおり存在し、5.5 秒で消える', 'STEP3 で酒場側を測る');
  pending('(4b) lastResult の既存キーが 1 つも欠けていない', 'STEP3 で酒場側を測る');
  pending('(4c) world.html の配信バイトに enterVia|lastResult が 0 回', 'STEP3 で測る');
  pending('(4d) #combatLog の固定バッファ長が従来どおり', 'STEP3 で測る');

  console.log('\n--- §5 iOS / 手触り ---');
  pending('(5a) レポートに明示的な閉じるボタンがあり、タップ領域が 44px 以上', 'STEP3 (項目3) 担当');
  pending('(5b) 閉じるボタンと背景の両方に click と touchend が配線されている', 'STEP3 (項目3) 担当');
  pending('(5c) body.ui-compact で年代記が 10 行を超えてもスクロールできる', 'STEP3 (項目3) 担当');

  console.log('\n--- §6 撤退 ---');
  pending('(6a) index.html?chronicle=0 → lastResult に chronicle キーが載らない', 'STEP3 (項目3) 担当');
  pending('(6b) tavern.html?chronicle=0 → レポートの導線が出ず、バナーだけが従来どおり出る', 'STEP3 (項目3) 担当');

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
