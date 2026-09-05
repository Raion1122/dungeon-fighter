#!/usr/bin/env node
/*
 * verify_recruit_talk.js — #54「酒場で声を掛けて仲間にする + 魔法使いのスリープ常備」受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 依頼書 `実装依頼書/2026-09-05_tavern-recruit-talk.md` §8 を機械的に測る。
 * 流用元 = verify_npc_crowd.js / verify_cone_cast.js
 * (http 自前配信 + 配信バイトの凍結 + 実 Chrome 直駆動 + 3 値表示 + --negative)。
 *
 * ■ ⚠ ポート 10020。変異 11 本を 10021〜10031 で予約。
 *   ⭐ 依頼書 §8 の指定 9940 は **#50 verify_cone_cast が 9940〜9960 を占有済み**で衝突する。
 *     さらに #51 verify_road_ambush が 9970〜9990 を予約 (tools/*.js の base 最大は 9970)。
 *     ⇒ 10020 へ移した。受入条件 (--negative なし) が listen するのは 10020 の 1 本だけ。
 *
 * ■ 測る / 測らない
 *   測る    = 誘った人が実際に潜行へ行くか / 枠を触らずに sleep が入るか
 *   測らない = 承諾の台詞の文面 / 吹き出しの位置と間 / 「今日の 4 人」がどの 4 人か (乱数)
 *
 * ■ ⚠⚠⚠ 依頼書 §2-3 は起草時点で誤っており、STEP0 の実測で訂正された。ここが測るのは訂正後の機構:
 *     SKILL_SLOT_CURVE は **マーシャル職専用**で魔法使いに効かない (slice を 1 度も通らない)。
 *     魔法使いの呪文枠は SPELL_SLOT_CURVE_MAGE (Lv1 = 3)。
 *     本当の関門は DEFAULT_KNOWN.mage に sleep が無いこと = isSpellKnown の完全ゲート。
 *   ⇒ (1d) SKILL_SLOT_CURVE 凍結 = マーシャル職へ波及していない証拠
 *     (1d2) SPELL_SLOT_CURVE_MAGE 凍結 = 枠で解決していない証拠。**役割が違うので両方要る。**
 *
 * ■ ⭐⭐⭐ 配分は「順序」で決まる (依頼書 §12-1)。sleep は index 1 に挿す。
 *     NPC 経路   (defaultCasterMap)   = 2 枠ずつ → {magic-missile:2, sleep:1}
 *     主人公経路 (酒場の partySkills) = 1 枠ずつ → {magic-missile:1, sleep:1, fire-bolt:1}
 *   末尾に置くと枠が尽きて黙って落ちる ⇒ 変異 sleeplast が守る。
 *
 * ■ 負のコントロール: ⚠⚠⚠ #53 の教訓 — 変異は「赤くなったか」ではなく
 *   **期待した assert が赤くなったか** まで機械で見る (MUT_EXPECT)。
 *
 * 使い方:
 *   node tools/verify_recruit_talk.js
 *   node tools/verify_recruit_talk.js --negative
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const ROOT     = path.resolve(arg('root', path.join(__dirname, '..')));
const PORT     = parseInt(arg('port', '10020'), 10);
const NEGATIVE = flag('negative');
const HEADFUL  = flag('headful');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定'); process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (切り出して取り込み漏れると全 500 になり
 *   「シームが undefined」に見える — verify_npc_crowd の注記と同じ罠)。 */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* ── 配信バイトの凍結 ────────────────────────────────────────────────────────
 * ⛔ 本番ファイルは 1 バイトも書き換えない。変異はメモリ上の写しへ注入し変異ポートから配る。
 *   別窓が保存しても走行中に混合ビルドにならない。 */
const FROZEN = {};
function frozen(rel) {
  if (Object.prototype.hasOwnProperty.call(FROZEN, rel)) return FROZEN[rel];
  const f = path.join(ROOT, rel);
  let buf = null;
  try { if (fs.existsSync(f) && fs.statSync(f).isFile()) buf = fs.readFileSync(f); } catch (e) { buf = null; }
  FROZEN[rel] = buf;
  return buf;
}

/* ── 変異表 ────────────────────────────────────────────────────────────────
 * ⚠ from/to は 1 行に閉じる (複数行アンカーは CRLF/LF の食い違いで必ず空振りする)。
 * ⚠ index.html / tavern.html は CRLF、js/*.js は LF。逐語置換なので改行には触れない。
 * ⭐ expect = その変異で **赤くなるべき assert の id**。空振りしたら受入条件の側が壊れている。 */
const MUT = {
  compnotmembers: { file: 'tavern.html', expect: ['2b'],
    why: '誘った人を partyComposition にだけ積み partyMembers に積まない (§2-2 の罠の再現)',
    from: '      selection.partyMembers = orderFormation([makeHeroMember(heroKey)].concat(cands));',
    to:   '      selection.partyComposition = [heroKey].concat(cands.map(function (m) { return m.classKey; })); selection.partyMembers = orderFormation([makeHeroMember(heroKey)]); /* mut */' },
  nosleepknown: { file: 'index.html', expect: ['1a', '1b'],
    why: 'DEFAULT_KNOWN.mage から sleep を抜く (isSpellKnown の完全ゲート = 真の関門)',
    from: '    DEFAULT_KNOWN.mage = withInnateSleepList(DEFAULT_KNOWN.mage);',
    to:   '    DEFAULT_KNOWN.mage = DEFAULT_KNOWN.mage.slice(); /* mut */' },
  sleeplast: { file: 'index.html', expect: ['1c2'],
    why: 'sleep を defaultSkills の末尾に置く (枠が尽きて黙って落ちる = 順序が効く証拠)',
    from: '      out.splice(1, 0, "sleep");',
    to:   '      out.push("sleep"); /* mut */' },
  sleepall: { file: 'index.html', expect: ['1e'],
    why: '魔法使い以外の職にも常備を配る (mage 限定のガードを外す)',
    from: '    CLASS_DEFS.mage.defaultSkills = withInnateSleepList(CLASS_DEFS.mage.defaultSkills);',
    /* ⚠⚠ 初版は withInnateSleepList() を全職へ回すだけだった → **空振りした**。
       真因は「変異が観測できない母集団」: この関数は index 1 に挿すので、Lv1 の
       マーシャル職は枠 1 個の slice(0,1) に切られて **sleep が画面に出ない**。
       ⇒ index 0 (unshift) にして観測可能にする。⭐ 教訓 = 変異は「注入できたか」でなく
       **測っている場所に現れるか**まで設計する。 */
    to:   '    Object.keys(CLASS_DEFS).forEach(function (k) { var d = CLASS_DEFS[k] && CLASS_DEFS[k].defaultSkills; if (isMageSleepOn() && d && d.length && d.indexOf("sleep") < 0) d.unshift("sleep"); }); /* mut */' },
  magecurvebump: { file: 'index.html', expect: ['1d2'],
    why: '呪文枠を増やして解決する (SPELL_SLOT_CURVE_MAGE[1] を 3→4)',
    from: '    const SPELL_SLOT_CURVE_MAGE = [0, 3, 4, 5, 6, 8, 9, 10, 12, 13, 15];   // index = Lv (1-10)',
    to:   '    const SPELL_SLOT_CURVE_MAGE = [0, 4, 4, 5, 6, 8, 9, 10, 12, 13, 15];   /* mut */' },
  fallbackauto: { file: 'tavern.html', expect: ['2d'],
    why: '候補 0 人のとき従来の自動抽選へ落とす (誘う意味が消える)',
    from: '    if (isRecruitTalkOn()) {',
    to:   '    if (isRecruitTalkOn() && (window.DFRecruits ? DFRecruits.count() : 0) > 0) { /* mut */' },
  nodisband: { file: 'tavern.html', expect: ['2f'],
    why: '帰還時に候補をクリアしない (解散しない)',
    from: '      try { if (window.DFRecruits) DFRecruits.clear(); }',
    to:   '      try { if (false && window.DFRecruits) DFRecruits.clear(); } /* mut */' },
  notalkgate: { file: 'tavern.html', expect: ['4a'],
    why: '撤退スイッチ ?recruittalk=0 を無視する',
    from: '    try { return new URLSearchParams(location.search).get("recruittalk") !== "0"; } catch (e) { return true; }',
    to:   '    return true; /* mut */' },
  nomagegate: { file: 'index.html', expect: ['4b'],
    why: '撤退スイッチ ?magesleep=0 を無視する',
    from: '      if (!isMageSleepOn() || !Array.isArray(list) || list.includes("sleep")) return list;',
    to:   '      if (!Array.isArray(list) || list.includes("sleep")) return list; /* mut */' },
  movetile: { file: 'js/npc-crowd.js', expect: ['3a'],
    why: 'npc-crowd の tile を 1 マス動かす (配置データの恒等が壊れる)',
    from: '    { key: "patronA", kind: "stand", tile: [ 3, 3], dx: -14, dy:  -6, face: "right",',
    to:   '    { key: "patronA", kind: "stand", tile: [ 3, 4], dx: -14, dy:  -6, face: "right", /* mut */' },
  nosoloconfirm: { file: 'tavern.html', expect: ['2h'],
    why: '単身出発の確認を出さない (ユーザー決定 C の実装を外す)',
    from: '    if (needsSoloWarning()) {',
    to:   '    if (false) { /* mut */' },
};
const MUT_ORDER = Object.keys(MUT);
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const MUT_SRC = {};
const MUT_ANCHOR_BAD = [];
function buildMutations() {
  for (const k of MUT_ORDER) {
    const m = MUT[k];
    const buf = frozen(m.file);
    if (!buf) { MUT_ANCHOR_BAD.push(k + ': ファイルが読めない (' + m.file + ')'); continue; }
    const src = buf.toString('utf8');
    const n = src.split(m.from).length - 1;
    if (n !== 1) { MUT_ANCHOR_BAD.push(k + ': アンカーが ' + n + ' 件 (1 件であるべき) — ' + m.file); continue; }
    MUT_SRC[k] = {}; MUT_SRC[k][m.file] = src.replace(m.from, m.to);
  }
}

function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '') || 'index.html';
        if (mutKey && MUT_SRC[mutKey] && Object.prototype.hasOwnProperty.call(MUT_SRC[mutKey], rel)) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey][rel]); return;
        }
        const buf = frozen(rel);
        if (buf === null) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buf);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── 判定 (PASSED / FAILED / PENDING の 3 値) ───────────────────────────────── */
let results = [];
function check(id, name, cond, detail) {
  results.push({ id: id, name: name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + '(' + id + ') ' + name + (detail ? '  — ' + detail : ''));
}

/* ── 観測 ────────────────────────────────────────────────────────────────── */
const SEATS = ['patronA', 'patronB', 'patronC', 'patronD'];
const OLD3  = ['magic-missile', 'fire-bolt', 'arcane-shield'];
const CURVE_SKILL = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
const CURVE_MAGE  = [0, 3, 4, 5, 6, 8, 9, 10, 12, 13, 15];

let browser = null;
const pageErrors = [];

async function newTavern(port, qs, seed) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => pageErrors.push('tavern' + (qs || '') + ' :: ' + e.message));
  const base = 'http://localhost:' + port + '/tavern.html';
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((s) => {
    try {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (s && s.partySkills) localStorage.setItem('dragonfighters.partySkills', JSON.stringify(s.partySkills));
      if (s && s.soloSeen) localStorage.setItem('dragonfighters.soloWarnSeen', '1');
    } catch (e) {}
  }, seed || null);
  await page.goto(base + (qs || ''), { waitUntil: 'networkidle2', timeout: 40000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 25000 });
  await sleep(700);
  return page;
}

/* NPC を **実座標のマウス**で押す。⛔ el.click() は使わない —
   clientX/clientY が 0 になり #tavernViewport が (0,0) を拾う (verify_npc_crowd の注記)。 */
async function tapSeat(page, key, waitDialog) {
  const box = await page.evaluate((k) => {
    const e = document.querySelector('.npcUnit[data-npc="' + k + '"]');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, key);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  if (!waitDialog) { await sleep(400); return true; }
  for (let i = 0; i < 24; i++) {
    await sleep(250);
    const vis = await page.evaluate(() =>
      { const d = document.getElementById('recruitDialog'); return !!d && getComputedStyle(d).display !== 'none'; });
    if (vis) return true;
  }
  return false;
}
const clickYes = (p) => p.evaluate(() => { const b = document.getElementById('btnRecruitYes'); if (b) b.click(); });
const candNames = (p) => p.evaluate(() => (window.DFRecruits ? DFRecruits.all().map(m => m.name) : null));

/* 受注 → selection.partyMembers を読む。⛔ 期待人数を焼かない = 実体そのものを数える。 */
const acceptAndRead = (p, id) => p.evaluate(async (sid) => {
  const sc = (typeof scenarios !== 'undefined') ? scenarios.find(s => s.id === sid) : null;
  if (!sc) return { err: 'no scenario ' + sid };
  Promise.resolve(openPrep(sc)).catch(function () {});   /* ⚠ await しない (演出がタップ待ちで止まる) */
  await new Promise(r => setTimeout(r, 500));
  const ms = (selection.partyMembers || []);
  const line = document.getElementById('recruitCountLine');
  return { names: ms.map(m => (m.isHero ? '__HERO__' : m.name)),
           npc: ms.filter(m => !m.isHero).length,
           lineText: line ? line.textContent : null,
           want: (typeof recruitCountOf === 'function') ? recruitCountOf(sc) : null };
}, id);

/* index.html を開いて編成と呪文枠を読む。
   ⭐ classic script 直下の識別子は window に載らないが、page.evaluate からは
     **素の識別子**として読める (verify_cone_cast が使っている作法)。 */
async function readGame(port, qs, seed) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push('index' + qs + ' :: ' + e.message));
  await page.goto('http://localhost:' + port + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((s) => {
    try {
      localStorage.clear(); sessionStorage.clear();
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(s.party));
      if (s.skills) localStorage.setItem('dragonfighters.partySkills', JSON.stringify(s.skills));
      localStorage.setItem('dragonfighters.xp', '0');
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
    } catch (e) {}
  }, seed);
  await page.goto('http://localhost:' + port + '/index.html?autoplay=30&diag=1' + qs,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  let ok = true;
  try {
    await page.waitForFunction('typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
      { timeout: 60000 });
  } catch (e) { ok = false; }
  const r = ok ? await page.evaluate(() => {
    const list = (typeof allies !== 'undefined' && allies) ? allies : [];
    return {
      leaderSlots: (typeof currentSpellSlots !== 'undefined') ? JSON.parse(JSON.stringify(currentSpellSlots || {})) : null,
      curveSkill: (typeof SKILL_SLOT_CURVE !== 'undefined') ? SKILL_SLOT_CURVE.slice() : null,
      curveMage:  (typeof SPELL_SLOT_CURVE_MAGE !== 'undefined') ? SPELL_SLOT_CURVE_MAGE.slice() : null,
      allies: list.map(a => ({ cls: a.classKey, hero: !!a.isHero,
        skills: Array.isArray(a.equippedSkills) ? a.equippedSkills.slice() : null,
        slots: a.maxSpellSlots ? JSON.parse(JSON.stringify(a.maxSpellSlots)) : null })),
    };
  }) : { err: 'not started' };
  await page.close();
  return r;
}

const PARTY_W = [{ classKey: 'warrior', isHero: true, name: '勇者', level: 1 },
                 { classKey: 'mage',    name: 'ミラ',  level: 1 },
                 { classKey: 'dwarf',   name: 'グリム', level: 1 },
                 { classKey: 'cleric',  name: 'リタ',  level: 1 }];
const PARTY_M = [{ classKey: 'mage',    isHero: true, name: '勇者', level: 1 },
                 { classKey: 'warrior', name: 'ガル',  level: 1 },
                 { classKey: 'dwarf',   name: 'グリム', level: 1 },
                 { classKey: 'cleric',  name: 'リタ',  level: 1 }];
const SEEDED_MAGE = ['magic-missile', 'sleep', 'fire-bolt', 'arcane-shield'];

/* 1 ポート分をまるごと観測する。戻り値は「素」でも「変異」でも同じ形。 */
async function observe(port) {
  const o = { err: [] };
  try {
    /* ── 卓の 4 人 / 声掛け / 受注 ───────────────────────────────────────── */
    const p1 = await newTavern(port, '', { soloSeen: true });
    o.seats = await p1.evaluate((keys) => {
      const out = { by: {}, sprites: [] };
      keys.forEach((k) => {
        const m = (typeof todaysPatrons !== 'undefined' && todaysPatrons) ? todaysPatrons[k] : null;
        out.by[k] = m ? { name: m.name, cls: m.classKey } : null;
        const e = document.querySelector('.npcUnit[data-npc="' + k + '"]');
        out.sprites.push(e ? (e.style.backgroundImage || '').replace(/^url\("?|"?\)$/g, '').split('/').pop() : null);
      });
      return out;
    }, SEATS);
    o.tapped = [];
    for (const k of ['patronA', 'patronB', 'patronC']) {
      const ok = await tapSeat(p1, k, true);
      o.tapped.push(ok);
      if (ok) { await clickYes(p1); await sleep(200); }
    }
    o.cands = await candNames(p1);
    /* 4 人目 = 上限。⭐ 上限は実体 (RECRUIT_MAX) から読む。⛔ 数字 3 を焼かない。 */
    o.capOpened = await tapSeat(p1, 'patronD', true);
    o.capState = await p1.evaluate(() => ({
      disabled: document.getElementById('btnRecruitYes').disabled,
      max: (typeof RECRUIT_MAX !== 'undefined') ? RECRUIT_MAX : null,
      slots: document.getElementById('recruitSlots').textContent }));
    await p1.evaluate(() => { const b = document.getElementById('btnRecruitNo'); if (b) b.click(); });
    o.accepted = await acceptAndRead(p1, 'goblin-mine');
    /* ⭐ (2e) マッチング演出に誘った人の名前が出るか (既存演出が拾えている証拠) */
    /* ⚠ 器の id は #partyMatchOverlay (中身は #pmColumns)。⛔ #partyMatch は存在しない。
       ⚠ PM_REVEAL_INTERVAL = 720ms 間隔で 1 人ずつ確定するので、全員そろうまで待つ。
       ⭐ 待ち方は「人数ぶんの時間」ではなく **誘った名前が全部出たか**で打ち切る
         (⛔ 固定の sleep にすると、テンポ調整レバーを動かした瞬間に空振りする)。 */
    /* ⚠⚠ 受注ナレ (#prologueOverlay) が **音声ペースで 20 秒近く**かかり、
       クリックで送らないと演出に到達しない (手本 = verify_party_match_setup.js
       の advanceToCinema)。⛔ 固定 sleep で待つと必ず空振りする。
       ⛔ #partyMatchOverlay / #pmColumns は叩かない (測定対象そのもの)。 */
    o.pmText = await (async () => {
      const t0 = Date.now();
      let last = 0;
      while (Date.now() - t0 < 90000) {
        const st = await p1.evaluate(() => {
          const q = (id) => document.getElementById(id);
          const vis = (e) => !!e && getComputedStyle(e).display !== 'none';
          const ov = q('partyMatchOverlay'), cols = q('pmColumns');
          return { cinema: !!(ov && ov.style.display === 'flex'),
                   prep: vis(q('prep')), prol: vis(q('prologueOverlay')),
                   txt: cols ? (cols.textContent || '') : '' };
        });
        const want = o.cands || [];
        if (st.cinema && want.length && want.every(n => st.txt.indexOf(n) >= 0)) return st.txt;
        if (st.prep) return st.txt;          /* 演出を飛び越えて準備画面まで来た */
        if (st.prol && Date.now() - last > 400) {
          last = Date.now();
          try { await p1.mouse.click(640, 430); } catch (e) {}
        }
        await sleep(120);
      }
      return await p1.evaluate(() => {
        const c = document.getElementById('pmColumns'); return c ? (c.textContent || '') : null; });
    })();
    /* ⭐ (2f) 帰還で解散。index を経ずに lastResult を仕込んで酒場を開き直す。 */
    await p1.evaluate(() => {
      try {
        sessionStorage.setItem('dragonfighters.lastResult', JSON.stringify(
          { cleared: true, scenarioId: 'goblin-mine', roster: { ids: [], survived: true } }));
      } catch (e) {}
    });
    await p1.goto('http://localhost:' + port + '/tavern.html', { waitUntil: 'networkidle2', timeout: 40000 });
    await sleep(800);
    o.afterReturn = await candNames(p1);
    await p1.close();
  } catch (e) { o.err.push('A: ' + String((e && e.stack) || e)); }
  try {
    /* ── 誰も誘わない → 単身確認 → ソロ ─────────────────────────────────── */
    const p2 = await newTavern(port, '', null);   /* ⚠ soloWarnSeen を仕込まない */
    o.soloConfirm = await p2.evaluate(async () => {
      currentScenario = scenarios.find(s => s.id === 'goblin-mine');
      document.getElementById('btnAccept').click();
      await new Promise(r => setTimeout(r, 300));
      const d = document.getElementById('soloConfirm');
      const p = document.getElementById('prep');
      return { shown: !!d && getComputedStyle(d).display !== 'none',
               prepVisible: !!p && getComputedStyle(p).display !== 'none' };
    });
    o.soloGo = await p2.evaluate(async () => {
      const b = document.getElementById('btnSoloGo');
      if (b) b.click();
      await new Promise(r => setTimeout(r, 600));
      return { names: (selection.partyMembers || []).map(m => (m.isHero ? '__HERO__' : m.name)),
               seen: localStorage.getItem('dragonfighters.soloWarnSeen') };
    });
    await p2.close();
    /* 2 回目は出ない (一度きり)。⚠ 同じプロファイルを引き継ぐため localStorage を消さない。 */
    const p2b = await browser.newPage();
    await p2b.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
    p2b.on('pageerror', (e) => pageErrors.push('tavern(solo2) :: ' + e.message));
    await p2b.goto('http://localhost:' + port + '/tavern.html', { waitUntil: 'networkidle2', timeout: 40000 });
    await p2b.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 25000 });
    await sleep(600);
    o.soloAgain = await p2b.evaluate(async () => {
      currentScenario = scenarios.find(s => s.id === 'goblin-mine');
      document.getElementById('btnAccept').click();
      await new Promise(r => setTimeout(r, 300));
      const d = document.getElementById('soloConfirm');
      return !!d && getComputedStyle(d).display !== 'none';
    });
    o.soloOnly = await acceptAndRead(p2b, 'goblin-mine');
    await p2b.close();
  } catch (e) { o.err.push('B: ' + String((e && e.stack) || e)); }
  try {
    /* ── 撤退 ?recruittalk=0 ─────────────────────────────────────────────── */
    const p3 = await newTavern(port, '?recruittalk=0', { soloSeen: true });
    o.retreatTap = await tapSeat(p3, 'patronA', true);   /* ⚠ ダイアログは開かないはず */
    o.retreatSprites = await p3.evaluate((keys) => keys.map((k) => {
      const e = document.querySelector('.npcUnit[data-npc="' + k + '"]');
      return e ? (e.style.backgroundImage || '').replace(/^url\("?|"?\)$/g, '').split('/').pop() : null;
    }), SEATS);
    o.retreatAccept = await acceptAndRead(p3, 'goblin-mine');
    o.geom = await p3.evaluate(() => (window.NPC_CROWD ? window.NPC_CROWD.TAVERN.map(n =>
      ({ key: n.key, tile: n.tile || null, dx: (n.dx === undefined ? null : n.dx),
         dy: (n.dy === undefined ? null : n.dy) })) : null));
    await p3.close();
  } catch (e) { o.err.push('C: ' + String((e && e.stack) || e)); }
  try {
    /* ── スリープ常備 (index.html の 2 経路 + 撤退) ───────────────────────── */
    o.gOn      = await readGame(port, '', { party: PARTY_W });
    o.gOff     = await readGame(port, '&magesleep=0', { party: PARTY_W });
    o.gLead    = await readGame(port, '', { party: PARTY_M, skills: { mage: SEEDED_MAGE } });
    o.gLeadOff = await readGame(port, '&magesleep=0', { party: PARTY_M, skills: { mage: SEEDED_MAGE } });
  } catch (e) { o.err.push('D: ' + String((e && e.stack) || e)); }
  try {
    /* ── 酒場側の習得ゲート + 既存セーブへの常備確保 + スイッチの独立 ─────── */
    const p5 = await newTavern(port, '', { partySkills: { mage: OLD3 }, soloSeen: true });
    o.tvOn = await p5.evaluate(() => ({
      mage: (typeof selection !== 'undefined' && selection.partySkills) ? selection.partySkills.mage.slice() : null,
      known: (typeof knownSpellsTV !== 'undefined') ? knownSpellsTV.mage.slice() : null }));
    await p5.close();
    const p6 = await newTavern(port, '?magesleep=0', { partySkills: { mage: OLD3 }, soloSeen: true });
    o.tvOff = await p6.evaluate(() => ({
      mage: (typeof selection !== 'undefined' && selection.partySkills) ? selection.partySkills.mage.slice() : null,
      known: (typeof knownSpellsTV !== 'undefined') ? knownSpellsTV.mage.slice() : null }));
    await p6.close();
    /* (4c) magesleep を切っても勧誘は生きている = 2 本が独立 */
    const p7 = await newTavern(port, '?magesleep=0', { soloSeen: true });
    o.bothTap = await tapSeat(p7, 'patronA', true);
    await p7.close();
  } catch (e) { o.err.push('E: ' + String((e && e.stack) || e)); }
  return o;
}

/* ── 受入条件の判定 ────────────────────────────────────────────────────────
 * ⛔ 期待値を焼かず、**実体から導く**もの: 上限 (RECRUIT_MAX) / 依頼の重さ (recruitCountOf) /
 *   人数 (selection.partyMembers)。 */
function judge(o) {
  results = [];
  const J = JSON.stringify;
  const seats = (o.seats && o.seats.by) || {};
  const filled = SEATS.filter(k => seats[k] && seats[k].name);

  console.log('\n[drv] §0 装置 — 先に母集団を確かめる');
  check('0a', '卓に冒険者が 4 人座っている (⭐ これが無いと全 assert が空振りして永久緑になる)',
    filled.length === 4, '席 = ' + J(SEATS.map(k => seats[k] && (seats[k].name + '/' + seats[k].cls))));
  check('0b', '候補の一覧を実体 (DFRecruits) から引けている (⛔ 表を写経しない)',
    Array.isArray(o.cands), 'cands = ' + J(o.cands));

  console.log('\n[drv] §1 (B) スリープ常備');
  const mOn  = ((o.gOn  && o.gOn.allies)  || []).find(a => a.cls === 'mage' && !a.hero) || null;
  const mOff = ((o.gOff && o.gOff.allies) || []).find(a => a.cls === 'mage' && !a.hero) || null;
  const lead = (o.gLead && o.gLead.leaderSlots) || null;
  check('1a', '★主人公が魔法使いのとき呪文枠に sleep が入る',
    !!(lead && lead.sleep > 0), 'slots = ' + J(lead));
  check('1b', '★NPC 仲間の魔法使いの equippedSkills に sleep が入る',
    !!(mOn && mOn.skills && mOn.skills.indexOf('sleep') >= 0), 'skills = ' + J(mOn && mOn.skills));
  check('1c', 'magic-missile を失っていない (足し戻しであって置換ではない)',
    !!(mOn && mOn.skills.indexOf('magic-missile') >= 0) && !!(lead && lead['magic-missile'] > 0),
    'NPC = ' + J(mOn && mOn.skills) + ' / 主人公 = ' + J(lead));
  check('1c2', '★★(A) の配分どおり NPC = {magic-missile:2, sleep:1} (⭐ 順序が効く証拠)',
    !!(mOn && mOn.slots && mOn.slots['magic-missile'] === 2 && mOn.slots.sleep === 1
       && Object.keys(mOn.slots).length === 2), J(mOn && mOn.slots));
  check('1d', 'SKILL_SLOT_CURVE が 1 ビットも変わっていない (マーシャル職へ波及していない証拠)',
    J(o.gOn && o.gOn.curveSkill) === J(CURVE_SKILL), J(o.gOn && o.gOn.curveSkill));
  check('1d2', '★★SPELL_SLOT_CURVE_MAGE が 1 ビットも変わっていない (枠で解決していない証拠)',
    J(o.gOn && o.gOn.curveMage) === J(CURVE_MAGE), J(o.gOn && o.gOn.curveMage));
  const nonMage = (r) => ((r && r.allies) || []).filter(a => a.cls !== 'mage')
    .map(a => a.cls + ':' + J(a.skills)).join(' ');
  /* ⚠⚠ 「素と撤退の差分」だけだと **?magesleep でゲートされていない漏れ**は
     両アームに同じように出るので検出できない (負のコントロール sleepall で実測)。
     ⇒ 「非魔法職の equippedSkills に sleep が 1 件も無い」を **直接**併せて見る。
     ⭐ sleep は MAGE_SKILLS の呪文で、僧侶/エルフは別の辞書を引く ⇒ 出たら必ず漏れ。 */
  const noSleepElsewhere = ((o.gOn && o.gOn.allies) || []).filter(a => a.cls !== 'mage')
    .every(a => !a.skills || a.skills.indexOf('sleep') < 0);
  check('1e', '魔法使い以外の職の equippedSkills が 1 件も変わらない (素と撤退の 2 経路 + sleep 不在の直接検査)',
    nonMage(o.gOn) !== '' && nonMage(o.gOn) === nonMage(o.gOff) && noSleepElsewhere,
    (nonMage(o.gOn) === nonMage(o.gOff) ? '2 経路一致' : '素 = ' + nonMage(o.gOn) + ' / 撤退 = ' + nonMage(o.gOff))
      + ' / 非魔法職に sleep 不在 = ' + noSleepElsewhere
      + ' (' + nonMage(o.gOn).slice(0, 80) + '…)');
  check('1f', '★既存セーブの partySkills にも常備が入る (index 1。⚠ partySkills は置換で自己修復しない)',
    J(o.tvOn && o.tvOn.mage) === J(['magic-missile', 'sleep', 'fire-bolt', 'arcane-shield']),
    J(o.tvOn && o.tvOn.mage));
  check('1g', '酒場側の習得ゲート (knownSpellsTV) にも sleep が入る (⚠ index.html と二重定義)',
    !!(o.tvOn && o.tvOn.known && o.tvOn.known.indexOf('sleep') >= 0)
    && !(o.tvOff && o.tvOff.known && o.tvOff.known.indexOf('sleep') >= 0),
    '素 = ' + J(o.tvOn && o.tvOn.known) + ' / 撤退 = ' + J(o.tvOff && o.tvOff.known));

  console.log('\n[drv] §2 (A) 声掛け');
  const acc = o.accepted || {};
  check('2a', '卓の冒険者に話しかけると勧誘ダイアログが開き、同行候補に入る',
    (o.tapped || []).length === 3 && (o.tapped || []).every(Boolean)
      && Array.isArray(o.cands) && o.cands.length === 3,
    'tapped = ' + J(o.tapped) + ' / cands = ' + J(o.cands));
  check('2b', '★受注後の partyMembers に **誘った人が含まれる** (名前で一致)',
    !!(o.cands && o.cands.length && acc.names && o.cands.every(n => acc.names.indexOf(n) >= 0)),
    'members = ' + J(acc.names));
  check('2c', '★誘っていない人は含まれない (自動抽選に落ちていない)',
    !!(acc.names && o.cands && acc.names.length === o.cands.length + 1
       && acc.names.filter(n => n === '__HERO__').length === 1),
    '編成 ' + ((acc.names || []).length) + ' 人 = 主人公 1 + 誘った ' + ((o.cands || []).length));
  check('2d', '★誰も誘わずに受注 → partyMembers が **主人公 1 人** (ソロ)',
    !!(o.soloOnly && o.soloOnly.names && o.soloOnly.names.length === 1
       && o.soloOnly.names[0] === '__HERO__'), J(o.soloOnly && o.soloOnly.names));
  check('2e', '★マッチング演出に誘った人の名前が出る (既存演出が拾えている証拠。⛔ 演出は 1 行も変えていない)',
    !!(o.pmText && o.cands && o.cands.length && o.cands.every(n => o.pmText.indexOf(n) >= 0)),
    'partyMatch に居た = ' + J((o.cands || []).filter(n => o.pmText && o.pmText.indexOf(n) >= 0)));
  check('2f', 'クリア帰還後に候補が空になっている (= 解散)',
    Array.isArray(o.afterReturn) && o.afterReturn.length === 0, J(o.afterReturn));
  check('2g', '上限は RECRUIT_MAX。到達すると「同道を頼む」が押せない (⛔ 数字 3 を写経せず実体から読む)',
    !!(o.capOpened && o.capState && o.capState.disabled === true
       && o.capState.max === (o.cands || []).length), J(o.capState));
  check('2h', '★誰も誘わずに「引き受ける」を押すと **単身出発の確認**が出る / 一度きり / 押せば出発できる',
    !!(o.soloConfirm && o.soloConfirm.shown && o.soloConfirm.prepVisible === false)
      && o.soloAgain === false && !!(o.soloGo && o.soloGo.seen === '1'),
    '1 回目 = ' + J(o.soloConfirm) + ' / 2 回目に出た = ' + J(o.soloAgain)
      + ' / 出発後の編成 = ' + J(o.soloGo && o.soloGo.names));
}

/* §3 恒等 / §4 撤退。⚠ judge() の続き (results は同じ配列に積む)。 */
function judgeRest(o) {
  const J = JSON.stringify;
  console.log('\n[drv] §3 恒等 (非退行)');
  /* ⭐ 期待値は **配信した js/npc-crowd.js の実体**から作る。⛔ 座標を焼かない。 */
  let want = null;
  try {
    const src = frozen('js/npc-crowd.js').toString('utf8');
    const body = src.slice(src.indexOf('var TAVERN = ['), src.indexOf('var TOWN = ['));
    /* ⚠ 1 本の正規表現で tile/dx/dy をまとめて拾うと、tile を持たない stroll 型で
       省略可能グループが崩れて **全件 tile:null** になる (実測で踏んだ)。
       ⇒ **エントリごとに切ってから**個別に読む。 */
    want = [];
    body.split('{ key:').slice(1).forEach((chunk) => {
      const k = /^\s*"([a-zA-Z]+)"/.exec(chunk);
      if (!k) return;
      const ti = /tile:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/.exec(chunk);
      const dxm = /dx:\s*(-?\d+)/.exec(chunk);
      const dym = /dy:\s*(-?\d+)/.exec(chunk);
      want.push({ key: k[1], tile: ti ? [Number(ti[1]), Number(ti[2])] : null,
                  dx: dxm ? Number(dxm[1]) : null, dy: dym ? Number(dym[1]) : null });
    });
  } catch (e) { want = null; }
  const got = o.geom || null;
  const same = !!(want && got && want.length === got.length
    && want.every((w, i) => got[i].key === w.key && J(got[i].tile) === J(w.tile)
                            && got[i].dx === w.dx && got[i].dy === w.dy));
  check('3a', '★js/npc-crowd.js の tile / dx / dy が 1 件も変わっていない (⭐ 期待値は配信バイトから作る)',
    same, want ? ('照合 ' + want.length + ' 件 / 一致 = ' + same
      + (same ? '' : '  got=' + J(got && got.slice(0, 3)) + ' want=' + J(want.slice(0, 3))))
      : '⛔ 期待値を作れなかった');
  const acc = o.accepted || {};
  check('3b', 'renderRecruitCountLine が出す数が partyMembers の NPC 数と一致する',
    !!(acc.lineText && acc.npc !== undefined
       && acc.lineText.indexOf(String(acc.npc)) >= 0),
    '「' + (acc.lineText || '(なし)') + '」 vs NPC ' + acc.npc + ' 人');

  console.log('\n[drv] §4 撤退');
  const ra = o.retreatAccept || {};
  check('4a', '★?recruittalk=0 → 従来の自動編成 (1 + recruitCountOf) に戻る / 卓の 4 人も従来の固定顔',
    !!(ra.names && ra.want !== null && ra.names.length === 1 + ra.want)
      && J(o.retreatSprites) === J(['dwarf_warrior_walk.png', 'rogue_male_walk.png',
                                    'cleric_npcmale_walk.png', 'elf_male_walk.png'])
      && o.retreatTap === false,
    '編成 ' + J(ra.names) + ' (期待 1+' + ra.want + ') / スプライト ' + J(o.retreatSprites)
      + ' / 勧誘ダイアログが開いた = ' + J(o.retreatTap));
  const mOff = ((o.gOff && o.gOff.allies) || []).find(a => a.cls === 'mage' && !a.hero) || null;
  check('4b', '★?magesleep=0 → 魔法使いの equippedSkills に sleep が入らない (NPC / 主人公 / 酒場の 3 経路とも)',
    !!(mOff && mOff.skills && mOff.skills.indexOf('sleep') < 0)
      && !(o.gLeadOff && o.gLeadOff.leaderSlots && o.gLeadOff.leaderSlots.sleep)
      && J(o.tvOff && o.tvOff.mage) === J(OLD3),
    'NPC = ' + J(mOff && mOff.skills) + ' / 主人公 = ' + J(o.gLeadOff && o.gLeadOff.leaderSlots)
      + ' / 酒場 = ' + J(o.tvOff && o.tvOff.mage));
  check('4c', '★2 本のスイッチが独立 (?magesleep=0 でも勧誘は生き、?recruittalk=0 でも sleep は生きる)',
    o.bothTap === true && !!(((o.gOn && o.gOn.allies) || [])
      .find(a => a.cls === 'mage' && !a.hero && a.skills && a.skills.indexOf('sleep') >= 0)),
    'magesleep=0 で勧誘ダイアログが開いた = ' + J(o.bothTap));
  check('Z', 'JS エラーが 1 件も出ていない', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
}

/* ── 主処理 ────────────────────────────────────────────────────────────────── */
(async () => {
  buildMutations();
  console.log('[drv] ROOT=' + ROOT + '  PORT=' + PORT
    + '  変異ポート予約=' + PORT_OF[MUT_ORDER[0]] + '〜' + PORT_OF[MUT_ORDER[MUT_ORDER.length - 1]]);
  if (MUT_ANCHOR_BAD.length) {
    /* ⛔ 握り潰さない。アンカーがずれた変異は「静かに緑」になる = 負のコントロールの意味が消える。 */
    console.log('[drv] ⛔ 変異アンカーの不備 ' + MUT_ANCHOR_BAD.length + ' 件:');
    MUT_ANCHOR_BAD.forEach(s => console.log('        - ' + s));
  }
  const servers = [await startServer(PORT, null)];
  if (NEGATIVE) for (const k of MUT_ORDER) if (MUT_SRC[k]) servers.push(await startServer(PORT_OF[k], k));

  browser = await loadPuppeteer().launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--user-data-dir=' + path.join(os.tmpdir(), 'df_recruit_' + Date.now()),
           '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  let exitCode = 0;
  try {
    console.log('\n[drv] ── 素のアーム (port ' + PORT + ') ──');
    const base = await observe(PORT);
    if (base.err && base.err.length) base.err.forEach(e => console.log('[drv] ⚠ 観測エラー: ' + e.slice(0, 300)));
    judge(base);
    judgeRest(base);
    const pass = results.filter(r => r.state === 'PASSED').length;
    const fail = results.filter(r => r.state === 'FAILED').length;
    const pend = results.filter(r => r.state === 'PENDING').length;
    console.log('\n──────────────────────────────────────────────');
    console.log('  ' + pass + '/' + results.length + ' PASSED   FAILED ' + fail + '   **PENDING** ' + pend);
    console.log('──────────────────────────────────────────────');
    if (fail > 0) exitCode = 1;

    if (NEGATIVE) {
      /* ⚠⚠⚠ #53 の教訓: 「赤くなったか」ではなく **期待した assert が赤くなったか** を見る。 */
      console.log('\n[drv] ── 負のコントロール (期待した assert が赤くなるか) ──');
      let bad = 0;
      for (const k of MUT_ORDER) {
        if (!MUT_SRC[k]) { console.log('  ⛔ ' + k + ' : 変異を作れていない (アンカー不備) — 検査できない'); bad++; continue; }
        pageErrors.length = 0;
        const o = await observe(PORT_OF[k]);
        const saved = console.log;
        console.log = () => {};                     /* 変異アームの逐一出力は抑える */
        judge(o); judgeRest(o);
        console.log = saved;
        const red = results.filter(r => r.state === 'FAILED').map(r => r.id);
        const want = MUT[k].expect;
        const hit = want.filter(id => red.indexOf(id) >= 0);
        const ok = hit.length === want.length;
        if (!ok) bad++;
        console.log('  ' + (ok ? 'OK  ' : '⛔  ') + k + ' — ' + MUT[k].why);
        console.log('      期待 [' + want.join(',') + ']  実際に赤 [' + red.join(',') + ']'
          + (ok ? '' : '   ⛔ 期待した assert が赤くなっていない'));
      }
      console.log('\n[drv] 負のコントロール: ' + (MUT_ORDER.length - bad) + '/' + MUT_ORDER.length + ' 本が期待どおり');
      if (bad > 0) exitCode = 1;
    }
  } catch (e) {
    console.log('[drv] ⛔ ドライバが例外で停止: ' + ((e && e.stack) || e));
    exitCode = 1;
  } finally {
    if (browser) await browser.close();
    servers.forEach(s => { try { s.close(); } catch (e) {} });
  }
  process.exit(exitCode);
})();
