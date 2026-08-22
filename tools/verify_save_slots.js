/*
 * tools/verify_save_slots.js — セーブスロット基盤 (js/save-slots.js) の検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-20_save-slots.md` の受入条件 1.〜8. を測る。
 * (9. の「既存 golden ドライバの非退行」は別ドライバを回して確かめる = ここには入らない)
 *
 *   node tools/verify_save_slots.js [--headful] [--port N]
 *
 * ── ★ 本ドライバの設計上の核心: 受入条件 7 (撤退スイッチの装置 assert) ────────
 * 依頼書は「?slots=0 で **1.〜4. が落ちる**」ことを要求している。「?slots=0 で緑」ではない。
 * そこで本ドライバは
 *     ① ページ側 = 観測だけを行う (featureProbe)。判定を 1 つも持たない
 *     ② Node 側 = 判定だけを行う (featureAsserts)。観測に触らない
 * と分け、**同じ featureAsserts() を 2 回**呼ぶ:
 *     /tavern.html          → 4 本すべてが true であることを PASS とする  (受入条件 1.〜4.)
 *     /tavern.html?slots=0  → 4 本すべてが false であることを PASS とする (受入条件 7.)
 * assert 本体を共有していないと「別々に書いた 2 つの assert が両方とも間違っている」事故
 * (= 実装とドライバが同じ誤りを持つと永久に緑) を防げない。
 *
 * ⚠ 逃げ道つき assert は逃げ道の測り方でフレークする。負のコントロールが
 *   「例外で落ちただけ」「ページが空だっただけ」で赤くなっていないことを、
 *   (7z) 群の装置 assert (enabled===false / threw==='' / ranToEnd / 種を実際に蒔いた) で押さえる。
 *
 * ── ⚠ 踏んだ罠 (再演しやすいので残す) ──────────────────────────────────────
 *  - same-origin の localStorage は **ページ遷移をまたいで生き残る**。tavern を開いた時点で
 *    consumeResult 直後の snapshot フックが df.slot1 を焼くため、前のセクションの df.* が
 *    次のセクションへ漏れて偽の赤になる。→ page ごとに document-start で df. と dragonfighters. の
 *    両接頭辞を purge する。⚠ ここで `df.` と `dragonfighters.` をスラッシュで並べて書くと
 *    ブロックコメントが閉じて SyntaxError になる (実際に踏んだ)。
 *  - ROOT は必ず path.resolve を通す。`/` 区切りのまま持つと配信が全 404 になり、症状はタイムアウトだけ。
 *  - MIME テーブルを持たせ忘れると全 500 でページが空になる (シームが undefined に見える)。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ⚠ path.resolve 必須。`/` 区切りのまま join すると全 404 になり、症状はタイムアウトだけになる。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const PORT = parseInt(arg('port', '8891'), 10);
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

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * ① ページ側: 受入条件 1.〜4. の **観測** だけを行う。判定を 1 つも持たない。
 *    (判定を持たせると ?slots=0 側で「別の assert」になってしまい、共有の意味が消える)
 * ══════════════════════════════════════════════════════════════════════════ */
function featureProbe() {
  var out = { threw: '', ranToEnd: false };
  try {
    localStorage.clear(); sessionStorage.clear();
    var L = localStorage;
    out.enabled = DFSlots.enabled();

    // 「スロット1 のセーブ」を蒔く。KEEP の 2 キーはスロットを跨いで共通なので別枠。
    var SEED = {
      'dragonfighters.xp': '10000',
      'dragonfighters.gold': '340',
      'dragonfighters.partyComposition': '["warrior"]',
      'dragonfighters.cleared': '["goblin-mine","bandits-forest"]',
      'dragonfighters.knownSpells': '{"mage":["magicMissile","sleep"]}',
      'dragonfighters.equipWeaponIdx': '3'
    };
    Object.keys(SEED).forEach(function (k) { L.setItem(k, SEED[k]); });
    L.setItem('dragonfighters.settings', '{"master":0.42}');
    L.setItem('dragonfighters.panelCollapsed', '1');
    out.seed = SEED;
    out.seededKeys = DFSlots._liveKeys().length;

    // ── 受入条件 1: 書く → switchTo(2) で消える → switchTo(1) で戻る ──────────
    out.active0     = DFSlots.active();
    out.sw2         = DFSlots.switchTo(2);
    out.activeOn2   = DFSlots.active();
    out.xpOnSlot2   = L.getItem('dragonfighters.xp');
    out.goldOnSlot2 = L.getItem('dragonfighters.gold');
    out.liveKeysOn2 = DFSlots._liveKeys().length;
    out.sw1         = DFSlots.switchTo(1);
    out.activeBack  = DFSlots.active();
    out.xpBack      = L.getItem('dragonfighters.xp');
    out.goldBack    = L.getItem('dragonfighters.gold');
    out.clearedBack = L.getItem('dragonfighters.cleared');

    // ── 受入条件 3: list() が 3 件 / 空は empty:true / 埋まった枠の meta が実データ一致 ──
    var flat = function (s) {
      var m = s.meta;
      return { slot: s.slot, active: s.active, empty: s.empty,
               level: m ? m.level : null, gold: m ? m.gold : null,
               hero: m ? m.hero : null, cleared: m ? m.clearedCount : null,
               hasMeta: !!m };
    };
    out.listA = DFSlots.list().map(flat);

    // ── 受入条件 4: active の meta は **ライブから算出** される ────────────────
    //    ライブの gold だけ書き換え、snapshot() を **一度も呼ばずに** list() を読む。
    //    同時にアーカイブ側 (df.slot1) の gold も読む: そちらは古いまま = 由来がライブである証拠。
    L.setItem('dragonfighters.gold', '55555');
    var a1 = DFSlots._readSlot(1);
    out.arch1GoldDuring4 = (a1 && a1.meta) ? a1.meta.gold : null;
    out.listB = DFSlots.list().map(flat);
    L.setItem('dragonfighters.gold', '340');   // 以降の比較のために戻す

    // ── 受入条件 2: newGame(2) してもスロット1 のデータが無傷 ─────────────────
    out.before          = DFSlots._liveData();
    out.ng              = DFSlots.newGame(2);
    out.activeAfterNg   = DFSlots.active();
    out.liveKeysAfterNg = DFSlots._liveKeys().length;
    out.slot2AfterNg    = DFSlots._readSlot(2);
    out.sw1b            = DFSlots.switchTo(1);
    out.activeAfterSw1b = DFSlots.active();
    out.after           = DFSlots._liveData();
    out.keepAfterAll    = [L.getItem('dragonfighters.settings'), L.getItem('dragonfighters.panelCollapsed')];

    out.ranToEnd = true;
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ② Node 側: 受入条件 1.〜4. の **判定**。
 *    ★ この関数を「?slots=0 なしのページ」と「?slots=0 のページ」の **両方**に当てる。
 *      前者は全 true が PASS / 後者は全 false が PASS (= 受入条件 7)。
 *    ⚠ どの assert も「API が『やった』と言ったか (戻り値)」と「実際に状態がそうなったか」の
 *      **両方**を conjunction にしてある。片方だけだと ?slots=0 側で
 *      「何も起きなかったので結果的に状態が一致してしまう」ケースが緑になり、負のコントロールが空振りする。
 * ══════════════════════════════════════════════════════════════════════════ */
function mapsEqual(a, b) {
  if (!a || !b) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) { if (ka[i] !== kb[i]) return false; if (a[ka[i]] !== b[kb[i]]) return false; }
  return true;
}

function featureAsserts(o) {
  const A = o.listA || [], B = o.listB || [];
  const a0 = A[0] || {}, a1 = A[1] || {}, a2 = A[2] || {}, b0 = B[0] || {};
  return [
    {
      id: '1',
      name: '受入条件1: スロット1 に xp を書く → switchTo(2) で消える → switchTo(1) で元の値が戻る',
      ok: o.sw2 === true && o.activeOn2 === 2
        && o.xpOnSlot2 === null && o.goldOnSlot2 === null && o.liveKeysOn2 === 0
        && o.sw1 === true && o.activeBack === 1
        && o.xpBack === '10000' && o.goldBack === '340'
        && o.clearedBack === '["goblin-mine","bandits-forest"]',
      detail: JSON.stringify({ sw2: o.sw2, activeOn2: o.activeOn2, xpOnSlot2: o.xpOnSlot2,
        liveKeysOn2: o.liveKeysOn2, sw1: o.sw1, xpBack: o.xpBack, goldBack: o.goldBack }),
    },
    {
      id: '2',
      name: '受入条件2: newGame(2) してもスロット1 のデータが無傷 (switchTo(1) で全キー一致)',
      ok: o.ng === true && o.activeAfterNg === 2
        && o.liveKeysAfterNg === 0 && o.slot2AfterNg === null
        && o.sw1b === true && o.activeAfterSw1b === 1
        && mapsEqual(o.before, o.after),
      detail: JSON.stringify({ ng: o.ng, activeAfterNg: o.activeAfterNg, liveKeysAfterNg: o.liveKeysAfterNg,
        slot2AfterNg: o.slot2AfterNg, sw1b: o.sw1b,
        keysEqual: mapsEqual(o.before, o.after),
        beforeN: o.before ? Object.keys(o.before).length : null,
        afterN: o.after ? Object.keys(o.after).length : null }),
    },
    {
      id: '3',
      name: '受入条件3: list() が 3 件 / 空スロットは empty:true / 埋まった枠の meta.level・gold・hero が実データ一致',
      ok: A.length === 3
        && a0.slot === 1 && a0.active === true && a0.empty === false && a0.hasMeta === true
        && a0.level === 5 && a0.gold === 340 && a0.hero === 'warrior' && a0.cleared === 2
        && a1.slot === 2 && a1.empty === true && a1.hasMeta === false
        && a2.slot === 3 && a2.empty === true && a2.hasMeta === false,
      detail: JSON.stringify(A),
    },
    {
      id: '4',
      name: '受入条件4: active の meta はライブから算出 (snapshot() を挟まず gold=55555 が出る / アーカイブは 340 のまま)',
      ok: b0.gold === 55555 && b0.empty === false && b0.active === true
        && a0.gold === 340                      // 同じ list() の式で直前は 340 だった
        && o.arch1GoldDuring4 === 340,          // ★ アーカイブは古いまま = 由来がライブである証拠
      detail: JSON.stringify({ listA0gold: a0.gold, listB0gold: b0.gold, archive1gold: o.arch1GoldDuring4 }),
    },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
 * 受入条件 5. / 6. — wipeLive()
 * ══════════════════════════════════════════════════════════════════════════ */
function wipeProbe() {
  var out = { threw: '' };
  try {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('dragonfighters.xp', '10000');
    localStorage.setItem('dragonfighters.gold', '340');
    localStorage.setItem('dragonfighters.settings', '{"master":0.42}');
    localStorage.setItem('dragonfighters.panelCollapsed', '1');
    sessionStorage.setItem('dragonfighters.lastResult', '{"cleared":true}');
    sessionStorage.setItem('dragonfighters.settings', '{"master":0.99}');
    out.beforeLocal = Object.keys(localStorage).filter(function (k) { return k.indexOf('dragonfighters.') === 0; }).length;
    out.beforeSession = Object.keys(sessionStorage).filter(function (k) { return k.indexOf('dragonfighters.') === 0; }).length;
    // 受入条件 6 用の見張り: 遷移すれば window の変数もろとも消える
    window.__wipeSentinel = 'alive-' + Date.now();
    out.hrefBefore = location.href;
    var sentinelBefore = window.__wipeSentinel;

    out.removed = DFSlots.wipeLive();

    out.hrefAfter = location.href;
    out.sentinelSurvived = (window.__wipeSentinel === sentinelBefore);
    out.xpGone = localStorage.getItem('dragonfighters.xp');
    out.goldGone = localStorage.getItem('dragonfighters.gold');
    out.lastResultGone = sessionStorage.getItem('dragonfighters.lastResult');
    out.keepLocal = [localStorage.getItem('dragonfighters.settings'),
                     localStorage.getItem('dragonfighters.panelCollapsed')];
    out.keepSession = sessionStorage.getItem('dragonfighters.settings');
    out.wipeSrc = DFSlots.wipeLive.toString();
    out.enabled = DFSlots.enabled();
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 受入条件 8. — sizeReport() の実測 (3 スロット満杯)
 *   ⚠ 満杯は「実データに近い形」で作る。酒場自身のカタログ (CHAR_EQUIP / PARTY_SLOTS /
 *     SCROLL_CATALOG_TV / ACCESSORIES_TV / PLAZA_ITEMS(_COMMON)_TV / ALL_MAIN_SCENARIOS) から
 *     組み立てるので、装備や呪文が増えれば測定値も自動で追随する (= 腐らない)。
 *   ⚠ 識別子はすべて tavern.html の classic script 直下 = 裸で読める (window.X は undefined)。
 * ══════════════════════════════════════════════════════════════════════════ */
const BUILD_MAX_LIVE = function () {
  const CLASSES = ["warrior", "dwarf", "cleric", "mage", "elf", "rogue"];
  const gated = new Set();
  const maxes = { weapons: 0, armors: 0, shields: 0 };
  const bag = {};
  Object.keys(CHAR_EQUIP).forEach(function (ck) {
    const p = CHAR_EQUIP[ck];
    bag[ck] = { weapons: [], armors: [], shields: [] };
    ["weapons", "armors", "shields"].forEach(function (slot) {
      const arr = (p && p[slot]) || [];
      if (arr.length - 1 > maxes[slot]) maxes[slot] = arr.length - 1;
      arr.forEach(function (e, i) {
        if (e && e.gated && e.name) gated.add(e.name);
        bag[ck][slot].push(i);              // 道具袋に全ティア入っている状態 = 満杯
      });
    });
  });
  const owned = {};
  ["weapons", "armors", "shields"].forEach(function (s) {
    owned[s] = []; for (let i = 0; i <= maxes[s]; i++) owned[s].push(i);
  });
  const allSpellIds = new Set();
  PARTY_SLOTS.forEach(function (s) { (s.skillPool || []).forEach(function (sk) { if (sk && sk.id) allSpellIds.add(sk.id); }); });
  Object.keys(SCROLL_CATALOG_TV).forEach(function (cls) {
    Object.keys(SCROLL_CATALOG_TV[cls] || {}).forEach(function (id) { allSpellIds.add(id); });
  });
  const spellList = Array.from(allSpellIds);
  const known = { mage: spellList.slice(), cleric: spellList.slice(), elf: spellList.slice() };
  const scrollStock = {}; spellList.forEach(function (id) { scrollStock[id] = 9; });
  const partySkills = {};
  CLASSES.forEach(function (ck) {
    const slot = PARTY_SLOTS.find(function (s) { return s.classKey === ck; });
    partySkills[ck] = ((slot && slot.skillPool) || []).map(function (sk) { return sk.id; });
  });
  const allyEquip = {};
  CLASSES.forEach(function (ck) { if (ck !== "warrior") allyEquip[ck] = { weapon: maxes.weapons, armor: maxes.armors, shield: maxes.shields }; });
  const accIds = ACCESSORIES_TV.map(function (a) { return a.id; });
  const accState = {}; accIds.forEach(function (id) { accState[id] = { charges: 9, usedThisRun: false, owner: "warrior" }; });
  const plazaIds = Object.keys(PLAZA_ITEMS_TV).concat(Object.keys(PLAZA_ITEMS_COMMON_TV));
  const plazaInv = {}; plazaIds.forEach(function (id) { plazaInv[id] = [9, 9, 9, 9, 9, 9, 9, 9, 9]; });
  const plazaState = { unlocked: true, gatekeeperEventSeen: true, wandDropEnabled: true, everEntered: true,
                       totalQuestsCleared: 99, currentStock: plazaIds.slice(), stockRefreshCount: 99 };
  const L = localStorage;
  L.setItem("dragonfighters.xp", "45000");
  L.setItem("dragonfighters.gold", "999999");
  L.setItem("dragonfighters.fang", "9999");
  L.setItem("dragonfighters.cleared", JSON.stringify(ALL_MAIN_SCENARIOS));
  L.setItem("dragonfighters.ownedEquip", JSON.stringify(owned));
  L.setItem("dragonfighters.ownedGatedNames", JSON.stringify(Array.from(gated)));
  L.setItem("dragonfighters.inventoryBag", JSON.stringify(bag));
  L.setItem("dragonfighters.knownSpells", JSON.stringify(known));
  L.setItem("dragonfighters.scrollStock", JSON.stringify(scrollStock));
  L.setItem("dragonfighters.partySkills", JSON.stringify(partySkills));
  L.setItem("dragonfighters.equippedSkills", JSON.stringify(partySkills));
  L.setItem("dragonfighters.allyEquip", JSON.stringify(allyEquip));
  L.setItem("dragonfighters.accessoryIds", JSON.stringify(accIds));
  L.setItem("dragonfighters.accessoryState", JSON.stringify(accState));
  L.setItem("dragonfighters.accessoryStock", JSON.stringify(accIds));
  L.setItem("dragonfighters.plazaInventory", JSON.stringify(plazaInv));
  L.setItem("dragonfighters.plazaState", JSON.stringify(plazaState));
  L.setItem("dragonfighters.partyComposition", JSON.stringify(["warrior", "cleric", "mage", "rogue"]));
  ["weaponIdx", "armorIdx", "shieldIdx", "equipWeaponIdx", "equipArmorIdx", "equipShieldIdx"]
    .forEach(function (k, i) { L.setItem("dragonfighters." + k, String(maxes[i % 3 === 0 ? "weapons" : i % 3 === 1 ? "armors" : "shields"])); });
  L.setItem("dragonfighters.equipAccessory1", accIds[0] || "none");
  L.setItem("dragonfighters.equipAccessory2", accIds[1] || "none");
  L.setItem("dragonfighters.templeBlessing", "1");
  L.setItem("dragonfighters.prologueSeen", "1");
  L.setItem("dragonfighters.prepOnboardingSeen", "1");
  // KEEP (スロットには入らないが localStorage の容量は実際に食う)
  L.setItem("dragonfighters.settings", JSON.stringify({ master: 0.42, bgm: 0.5, sfx: 0.7, voice: 0.6 }));
  L.setItem("dragonfighters.panelCollapsed", "1");
  return { spells: spellList.length, accessories: accIds.length, plazaItems: plazaIds.length,
           maxes: maxes, gated: gated.size, liveKeys: DFSlots._liveKeys().length };
};

// ══════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  const profile = require('./_pptr_profile')('df_saveslots_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  /* ⚠⚠ same-origin の localStorage はページ遷移をまたいで生き残る。
        tavern を開いた時点で consumeResult 直後の snapshot フックが df.slot1 を焼くため、
        前セクションの df.* が次セクションへ漏れて偽の赤になる (実際に踏んだ)。
        → **document-start** で毎回 purge する。ページ内スクリプトより前に走るのが要点。 */
  async function openTavern(query) {
    const page = await browser.newPage();
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('df.') === 0 || k.indexOf('dragonfighters.') === 0) localStorage.removeItem(k);
        });
        Object.keys(sessionStorage).forEach(function (k) {
          if (k.indexOf('df.') === 0 || k.indexOf('dragonfighters.') === 0) sessionStorage.removeItem(k);
        });
        localStorage.setItem('dragonfighters.prologueSeen', '1');
      } catch (e) {}
    });
    await page.goto('http://localhost:' + PORT + (query || '/tavern.html'),
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(800);
    return page;
  }

  // ══ (1)-(4) 機能: スロット機能 ON のページで featureAsserts() が全部 true ══
  console.log('\n--- 受入条件 1.〜4. (機能) : /tavern.html ---');
  let onObs = null;
  {
    const page = await openTavern();
    onObs = await page.evaluate(featureProbe);
    check('(0a) [装置] スロット機能 ON のページで enabled() が true', onObs.enabled === true, 'enabled=' + onObs.enabled);
    check('(0b) [装置] プローブが例外なく最後まで走った', onObs.threw === '' && onObs.ranToEnd === true,
      JSON.stringify({ threw: onObs.threw, ranToEnd: onObs.ranToEnd }));
    check('(0c) [装置] 種を実際に蒔いている (dragonfighters.* が 6 キー)', onObs.seededKeys === 6, 'seededKeys=' + onObs.seededKeys);
    for (const a of featureAsserts(onObs)) check('(' + a.id + ') ' + a.name, a.ok, a.detail);
    await page.close();
  }

  // ══ (7) 装置 assert: ?slots=0 を付けると 1.〜4. が **落ちる** ══════════════
  //    ★ 上と **同じ featureProbe / 同じ featureAsserts** を当てる。判定式を書き直さない。
  console.log('\n--- 受入条件 7. (装置) : /tavern.html?slots=0 で 1.〜4. が落ちること ---');
  {
    const page = await openTavern('/tavern.html?slots=0');
    const offObs = await page.evaluate(featureProbe);
    // ⚠ 逃げ道つき assert は逃げ道の測り方でフレークする。
    //    「例外で死んだだけ」「ページが空だっただけ」で赤くなっていないことを先に押さえる。
    check('(7z1) [装置] ?slots=0 のページで enabled() が false (スイッチが実際に効いている)',
      offObs.enabled === false, 'enabled=' + offObs.enabled);
    check('(7z2) [装置] ?slots=0 でもプローブは例外なく最後まで走った (赤の原因が例外ではない)',
      offObs.threw === '' && offObs.ranToEnd === true, JSON.stringify({ threw: offObs.threw, ranToEnd: offObs.ranToEnd }));
    check('(7z3) [装置] ?slots=0 でも種は実際に蒔かれている (空ページで赤くなったのではない)',
      offObs.seededKeys === 6, 'seededKeys=' + offObs.seededKeys);
    check('(7z4) [装置] ON 側と OFF 側で同一の featureAsserts() を当てている (assert 本体の共有)',
      featureAsserts(offObs).length === featureAsserts(onObs).length && featureAsserts(offObs).length === 4,
      'n=' + featureAsserts(offObs).length);
    const offRes = featureAsserts(offObs);
    for (const a of offRes) {
      check('(7-' + a.id + ') 受入条件' + a.id + ' の assert が ?slots=0 で **落ちる**', a.ok === false, a.detail);
    }
    check('(7) ★総括: ?slots=0 で 1.〜4. が 4/4 とも落ちた (撤退スイッチが silent fail-open ではない)',
      offRes.filter(a => !a.ok).length === 4, offRes.map(a => a.id + ':' + (a.ok ? 'PASS(=NG)' : 'FAIL(=OK)')).join(' '));
    await page.close();
  }

  // ══ (5)(6) wipeLive: KEEP 残存 / location を触らない ═══════════════════════
  //    ⚠ この 2 本は driver_dev_gate.js の (F)(G) 群と一部重複する。
  //       依頼書の受入条件を 1 本のドライバで全部たどれるほうが良いので、あえて重複させている。
  console.log('\n--- 受入条件 5. / 6. : wipeLive() ---');
  {
    const page = await openTavern();
    let navCount = 0;
    const onNav = () => { navCount++; };
    page.on('framenavigated', onNav);          // ← ロード完了後に張るので初回ロードは数えない
    const w = await page.evaluate(wipeProbe);
    await sleep(600);                          // location.replace があれば遷移が起きるだけの猶予
    page.off('framenavigated', onNav);
    const stillAlive = await page.evaluate(() => ({
      sentinel: window.__wipeSentinel || null, href: location.href,
      keep: [localStorage.getItem('dragonfighters.settings'), localStorage.getItem('dragonfighters.panelCollapsed')],
    }));

    check('(5z) [装置] wipeLive の前にライブが実在した (local 4 件 / session 2 件)',
      w.threw === '' && w.beforeLocal === 4 && w.beforeSession === 2,
      JSON.stringify({ threw: w.threw, beforeLocal: w.beforeLocal, beforeSession: w.beforeSession }));
    check('(5a) wipeLive() が実際に消している (xp / gold / sessionStorage の lastResult が null)',
      w.removed >= 3 && w.xpGone === null && w.goldGone === null && w.lastResultGone === null,
      JSON.stringify({ removed: w.removed, xp: w.xpGone, gold: w.goldGone, lastResult: w.lastResultGone }));
    check('(5) 受入条件5: wipeLive() 後も dragonfighters.settings と dragonfighters.panelCollapsed が残っている',
      w.keepLocal[0] === '{"master":0.42}' && w.keepLocal[1] === '1',
      JSON.stringify(w.keepLocal));
    check('(5b) sessionStorage 側の KEEP も残る (両ストレージで同じ規則)',
      w.keepSession === '{"master":0.99}', 'sessionStorage.settings=' + w.keepSession);
    check('(6) 受入条件6: wipeLive() が location を触らない — 遷移が 0 回・href 不変・window の見張りが生存',
      navCount === 0 && w.hrefBefore === w.hrefAfter && w.sentinelSurvived === true
        && stillAlive.sentinel !== null && stillAlive.href === w.hrefBefore,
      JSON.stringify({ navCount, sentinelSurvived: w.sentinelSurvived, hrefSame: w.hrefBefore === w.hrefAfter }));
    check('(6a) [静的] wipeLive() の関数本体に location という語が 1 つも無い',
      !!w.wipeSrc && !/location/.test(w.wipeSrc), 'srcLen=' + (w.wipeSrc || '').length);
    check('(6b) [装置] 切り出した本体が本物である (removeItem を含む = 空文字で緑になっていない)',
      !!w.wipeSrc && /removeItem/.test(w.wipeSrc), 'srcLen=' + (w.wipeSrc || '').length);
    check('(6c) 遷移後も KEEP が読める (= そもそもページが再読込されていない)',
      stillAlive.keep[0] === '{"master":0.42}' && stillAlive.keep[1] === '1', JSON.stringify(stillAlive.keep));
    await page.close();
  }

  // ══ (8) sizeReport: 3 スロット満杯の実測 ══════════════════════════════════
  console.log('\n--- 受入条件 8. : sizeReport() 実測 (3 スロット満杯) ---');
  {
    const page = await openTavern();
    const rep = await page.evaluate((buildSrc) => {
      localStorage.clear(); sessionStorage.clear();
      const build = new Function('return (' + buildSrc + ')')();
      const out = {};
      out.stats = build();                       // ライブを「満杯」に
      out.one = DFSlots.sizeReport();            // ライブ 1 つだけの状態
      // 3 スロットすべてを満杯にする: 1 → 2 → 3 と移りながら毎回満杯を作る
      DFSlots.active();
      DFSlots.switchTo(2); build();
      DFSlots.switchTo(3); build();
      DFSlots.switchTo(1);                       // 1 へ戻る = ライブ 1 + アーカイブ 2/3
      out.beforeSnap = DFSlots.sizeReport();
      DFSlots.snapshot();                        // アクティブ側も焼いて「4 本ぶん」の最悪値にする
      out.full = DFSlots.sizeReport();
      out.liveKeys = DFSlots._liveKeys().length;
      out.rawTotal = (function () {              // 独立実測: localStorage 全体 (df.* と KEEP を含む)
        let b = 0;
        Object.keys(localStorage).forEach(function (k) { b += (k.length + (localStorage.getItem(k) || '').length) * 2; });
        return b;
      })();
      return out;
    }, BUILD_MAX_LIVE.toString());
    const kb = (n) => (n / 1024).toFixed(1) + ' KB';
    const LIMIT = 5242880, GATE = 2097152;
    console.log('  [満杯の作り方] 酒場自身のカタログ (CHAR_EQUIP / PARTY_SLOTS / SCROLL_CATALOG_TV /');
    console.log('                 ACCESSORIES_TV / PLAZA_ITEMS(_COMMON)_TV / ALL_MAIN_SCENARIOS) から');
    console.log('                 「全装備所持 + 道具袋に全ティア + 3職とも全呪文習得 + 巻物 9 個ずつ +');
    console.log('                  全装身具所持&状態 + 闇市在庫 9 個ずつ + 6 シナリオ全クリア」を組み立て');
    console.log('  [カタログ実数] ' + JSON.stringify(rep.stats));
    console.log('  [1 スロットのみ]           ' + JSON.stringify(rep.one) + '   total=' + kb(rep.one.total));
    console.log('  [ライブ1 + アーカイブ2/3]  ' + JSON.stringify(rep.beforeSnap) + '   total=' + kb(rep.beforeSnap.total));
    console.log('  [★3スロット満杯(最悪値)]  ' + JSON.stringify(rep.full));
    console.log('  [★受入条件8 total] ' + rep.full.total + ' bytes = ' + kb(rep.full.total) +
                '   (上限 5MB=' + LIMIT + ' の ' + (rep.full.total / LIMIT * 100).toFixed(2) + '%)');
    console.log('  [参考] localStorage 全体の実測 (df.* と KEEP 込み) = ' + rep.rawTotal + ' bytes = ' + kb(rep.rawTotal));
    check('(8z1) [装置] 満杯のライブが実際に作れている (dragonfighters.* が 20 キー以上)',
      rep.liveKeys >= 20, 'liveKeys=' + rep.liveKeys);
    check('(8z2) [装置] 3 スロットぶんのアーカイブが実在する (slot1/2/3 すべて > 0)',
      rep.full.slot1 > 0 && rep.full.slot2 > 0 && rep.full.slot3 > 0,
      JSON.stringify([rep.full.slot1, rep.full.slot2, rep.full.slot3]));
    check('(8z3) [装置] 満杯の構築が空振りしていない (total >= 40000 bytes)',
      rep.full.total >= 40000, rep.full.total + ' bytes');
    check('(8z4) total = live + slot1 + slot2 + slot3',
      rep.full.total === rep.full.live + rep.full.slot1 + rep.full.slot2 + rep.full.slot3, JSON.stringify(rep.full));
    check('(8) ★受入条件8: 3 スロット満杯の total が 2MB (' + GATE + ' bytes) 以下',
      rep.full.total <= GATE, rep.full.total + ' bytes = ' + kb(rep.full.total));
    await page.close();
  }

  check('(Z) pageerror ゼロ', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 5)));

  await browser.close();
  srv.close();
  const ok = results.filter(r => r.ok).length;
  console.log('\n[save-slots] RESULT: ' + ok + '/' + results.length + ' passed');
  if (ok !== results.length) {
    console.log('[save-slots] NG: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(3); });
