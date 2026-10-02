#!/usr/bin/env node
/*
 * verify_quest_draw.js — 実装依頼書 #81「酒場の依頼を戻るたびに入れ替わる 2 件へ + 奥の小部屋を武器防具屋へ」の受入ドライバ
 *   (依頼書 2026-10-02_quest-draw-shop-room.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_quest_draw.js                        # 素
 *   node tools/verify_quest_draw.js --negative             # 変異 10 本 (port 10528〜10537)。先に素の基準を走らせる
 *   node tools/verify_quest_draw.js --negative --only memonly,noreroll
 *   node tools/verify_quest_draw.js --mutate lockedpool    # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 盤面は**ブラウザで本番の関数に作らせる** (tavern.html を開くだけ = buildSigns → loadOrDrawBoard)。
 *     ドライバは localStorage の種 (dragonfighters.cleared / dragonfighters.questBoard) と
 *     sessionStorage["dragonfighters.lastResult"] をまき、DOM の札 (#tavernStage [data-scenario]) と
 *     保存値 (localStorage) と __TAVERN_TV.board() の写しで判定する。⛔ 盤面を書き換えるシームは使わない (無い)。
 *   - 期待値 (解放済み / 本筋 / 次の未解放 / 盤面の妥当性) は、ページ内の `scenarios` の {id, locked, unlockAfter} と
 *     ドライバがまいた cleared から**ドライバ側で独立に**計算する (indepFacts / indepValid)。
 *     ⛔ 本番の __TAVERN_TV.boardFacts() は判定に使わない (写経にしない)。
 *   - 乱数は固定しない。分布は測らない (§8「測らないこと」)。代わりに「何回引いても成り立つ不変条件」を
 *     複数回の引き直しで問う ((1a)(1b) 各 6 回・(1c) 5 状態 × 8 回・(1d) 4 回・(3b) 2 状態 × 6 種)。
 *     ⭐ 回数は変異の検出を決定的にするための数 (例: lockedpool の (1a) は 1 回なら 80% でしか赤くならない)。
 *   - 町との往復 (2a) は town.html を実際に開き、町が施設へ入るときと同じ
 *     sessionStorage["dragonfighters.enterVia"]="tavern" + location.href="tavern.html" で戻る (town.html enterFacility の作法)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] window.TAVERN_MAP と __TAVERN_TV.board が在り、新規状態の盤面が 2 件 (⭐ 無いと全部空振りで緑)
 *      (0b) [装置] scenarios が 6 件・一本道 (先頭だけ locked なし、以後は locked かつ unlockAfter = 1 つ前)
 *      (0c) [装置] 全ページで pageerror 0 件 (本ドライバ独自の追加)
 *   §1 (1a) 新規 (cleared=[]) を 6 回引く → 毎回 札は questTable_goblin-mine (押せる) + questTable_bandits-forest (???・.locked) の 2 枚ちょうど
 *      (1b) cleared=[廃坑] を 6 回引く → 毎回 盤面 = {廃坑, 森} (順不同)・両方押せる
 *      (1c) cleared 1〜5 本の各状態で鍵を消して 8 回読み直す → 全回で本筋が入り、もう 1 件は解放済み、未解放の札 0 枚・盤面が独立計算で妥当
 *      (1d) cleared 6 本を 4 回引く → 本筋なし・2 件とも解放済み・重複なし
 *      (1e) 2 経路: §1 の全読み込みで DOM の札 id 集合 === board().seats の値集合 === localStorage の保存値の集合
 *           (+ 保存値 === board() の写し・各札が自分の席 (TABLES の sign タイル) に立っている)
 *   §2 (2a) cleared 3 本で盤面を作らせた後、再読込 5 回・町へ出て戻る 3 回で nonce も席も 1 文字も変わらない
 *      (2b) 妥当な盤面の種 2 つ (新規状態の ??? 入り / cleared 3 本) がそのまま採用される (nonce が種のまま・保存値も種のまま)
 *   §3 (3a) 種の盤面 (nonce "SEED") + lastResult を cleared / defeated / retreated / generated-quest の 4 通り → 4 通りとも
 *           nonce !== "SEED" かつ引き直した盤面が (帰還後の cleared で) 独立計算で妥当
 *      (3b) 妥当でない種 6 種 (本筋欠け / 未解放 id / 3 件 / 存在しない席 / id 重複 / 存在しない id) を cleared 3 本と 4 本で
 *           まく → 12 回とも捨てて引き直す (nonce !== "SEED") かつ引き直した盤面が独立計算で妥当
 *   §4 (4a) #tavernDoor_shop が在り文言が「武器防具屋」/ #tavernDoor_back は DOM に無い
 *      (4b) 扉札を押す → 扉前 (13,2) へ歩いてから #shopScreen が display:flex、#backroomBar は出ない
 *      (4c) 地図モードで #shopEntry が見えない (checkVisibility() false) かつ DOM には在る
 *      (4d) ?tavernmap=0 では #shopEntry が見えて押すと店が開く
 *   §5 (5a) ?questdraw=0 → 札 3 枚 = TABLES の scenarioId が TABLES の席どおり・board() null・#tavernDoor_back「奥の間へ」が
 *           奥の間を開く・#tavernDoor_shop は無い・#shopEntry が見える
 *      (5b) (1e)(4a)(4c) の 3 条件を ON/OFF の両方へ当てて全部反転 (ON = 全部 true / OFF = 全部 false)
 *   ⛔ 測らないこと (依頼書 §8): 抽選の分布の偏り / 扉札の説明文の文言
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。tavern.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列を
 *     メモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *     種まき用に空のページ /__blank.html を配る (同じオリジンで storage を触るため)。
 *   - 素と各変異はポート = オリジンが違う ⇒ localStorage は互いに混ざらない。
 *   - 起動時に全変異のアンカーを**原本**で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *   - 罠E の自己検査: 自分のアンカーが、同じ場所を変異させる他ドライバ (verify_tavern_map / verify_npc_crowd /
 *     verify_recruit_talk) のソースに出てこないこと。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を**欠陥が効く枝**に持つ。CSS の変異 shopbtn は console を持てないので
 *     代わりに `--mut-shopbtn: 1` を宣言し、ドライバが #shopEntry の計算値でその規則が当たったことを数える。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」+ 注入行の実行 > 0。
 *     確率で赤 = 変異が乱数の引きによってだけ現れる節 (例: lockedpool の (2a) は最初の引きに未解放が入ったときだけ)。
 *     ⛔ 必ず赤の節は、緑になる確率が 1e-3 未満になるよう回数を決めた (上の §1/§3 の回数・依頼書 §12-2)。
 *   - ⛔ git を読まない ⇒ 影のツリー / clone でもそのまま走る。⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0` (verify_mage_hand と同じ型)。
 *
 * ■ ポート = **10527** (素) / 変異 **10528〜10537** (10 本・MUTATIONS の並び順)。次の新規ドライバ base = 10538。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10527'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BOARD_KEY = 'dragonfighters.questBoard';
const CLEARED_KEY = 'dragonfighters.cleared';
const RESULT_KEY = 'dragonfighters.lastResult';
const SHOP_NAME = '武器防具屋';
const BACK_NAME = '奥の間へ';
const VIEW = { width: 1440, height: 900 };
/* 回数 (⭐ 変異の検出を決定的にするための数。下げると「必ず赤」が確率に落ちる) */
const N_1A = 6, N_1B = 6, N_1C = 8, N_1D = 4, N_2A_RELOAD = 5, N_2A_TOWN = 3;

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_TAVERN = 'tavern.html';
const PRISTINE = { [F_TAVERN]: fs.readFileSync(path.join(ROOT, F_TAVERN), 'utf8') };
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。逐語は HEAD d914fdc (項目2 の実装後) の行で取った。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const MUTATIONS = {
  /* 罠 2: 保存値を読まない = 毎回 drawBoard() (印は保存値があるのに無視したとき) */
  memonly: [
    { from: '      try { b = JSON.parse(localStorage.getItem(BOARD_KEY) || "null"); }',
      to: '      try { if (localStorage.getItem(BOARD_KEY)) ' + HIT('memonly') + '; b = null; }   /* ★変異memonly */' }],
  /* 罠 1: 母集団を scenarios 全件にする (印は未解放を母集団へ入れたとき) */
  lockedpool: [
    { from: '      var unlocked = scenarios.filter(function (s) { return isUnlocked(s); });',
      to: '      var unlocked = scenarios.filter(function (s) { return isUnlocked(s) || (' + HIT('lockedpool') + ', true); });   /* ★変異lockedpool */' }],
  /* 本筋を入れない (印は本筋があるのに入れなかったとき) */
  nofrontier: [
    { from: '      if (f.frontier) ids.push(f.frontier.id);',
      to: '      if (f.frontier && (' + HIT('nofrontier') + ', false)) ids.push(f.frontier.id);   /* ★変異nofrontier */' }],
  /* 罠 3: boardValid が (形だけ見て) 常に true。原本の本体は __bv0 として残し、原本なら捨てた盤面を通したときだけ印 */
  novalidate: [
    { from: '    function boardValid(b, f) {',
      to: '    function boardValid(b, f) { var __ok = !!(b && typeof b === "object" && b.seats && typeof b.seats === "object"); if (__ok && !__bv0(b, f)) '
        + HIT('novalidate') + '; return __ok; }   /* ★変異novalidate */ function __bv0(b, f) {' }],
  /* consumeResult() の鍵消しを外す (印は帰還を消費したとき) */
  noreroll: [
    { from: '    try { localStorage.removeItem("dragonfighters.questBoard"); } catch (e) {}',
      to: '    try { ' + HIT('noreroll') + '; } catch (e) {}   /* ★変異noreroll */' }],
  /* 不採用案: 地図の起動時に毎回鍵を消す (印は消す鍵があったとき) */
  enterreroll: [
    { from: '    document.body.classList.toggle("questDrawOn", QUEST_DRAW_ON);',
      to: '    document.body.classList.toggle("questDrawOn", QUEST_DRAW_ON); try { if (localStorage.getItem("dragonfighters.questBoard")) ' + HIT('enterreroll')
        + '; localStorage.removeItem("dragonfighters.questBoard"); } catch (e) {}   /* ★変異enterreroll */' }],
  /* 序盤の ??? 埋めを外す (印は埋めるはずだったとき) */
  oneonly: [
    { from: '      if (ids.length < BOARD_SIZE && f.nextLocked) ids.push(f.nextLocked.id);',
      to: '      if (ids.length < BOARD_SIZE && f.nextLocked && (' + HIT('oneonly') + ', false)) ids.push(f.nextLocked.id);   /* ★変異oneonly */' }],
  /* shop の扉を openBackroom() へ (印は扉を押したとき) */
  backroomdoor: [
    { from: '      if (d.key === "shop") { openShop(); return; }',
      to: '      if (d.key === "shop") { ' + HIT('backroomdoor') + '; openBackroom(); return; }' }],
  /* #shopEntry を隠す CSS を外す (CSS は console を持てない ⇒ 規則が当たった印に --mut-shopbtn を宣言しドライバが計算値で数える) */
  shopbtn: [
    { from: '    body.tavernMapOn.questDrawOn #shopEntry { display: none; }',
      to: '    body.tavernMapOn.questDrawOn #shopEntry { --mut-shopbtn: 1; }' }],
  /* #shopEntry の DOM を消す (印は要素の代わりに置いた script が走ったとき)。⚠ bindShop は if (entry) で守られている */
  killshopdom: [
    { from: '    <div id="shopEntry" title="武器防具屋">🛡️ 武器防具屋</div>',
      to: '    <script>' + HIT('killshopdom') + '</script>' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-2)。 */
const NEG_EXPECT = {
  memonly:      ['(2a)', '(2b)'],
  lockedpool:   ['(1a)', '(1b)', '(1c)', '(2b)'],
  nofrontier:   ['(1c)', '(3b)'],
  novalidate:   ['(3b)'],
  noreroll:     ['(3a)'],
  enterreroll:  ['(2a)', '(2b)'],
  /* 新規状態で引き直す (3a) の敗北/撤退/生成クエストの 3 通りも 1 件の盤面になる */
  oneonly:      ['(0a)', '(1a)', '(3a)'],
  backroomdoor: ['(4b)'],
  shopbtn:      ['(4c)', '(5b)'],
  killshopdom:  ['(4c)', '(4d)', '(5a)', '(5b)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可)。理由は依頼書 §12-2。 */
const NEG_MAYBE = {
  memonly: [], novalidate: [], noreroll: [], enterreroll: [], oneonly: [], backroomdoor: [], shopbtn: [], killshopdom: [],
  /* 最初の引きに未解放が入ると次の読み込みで捨てられる (2a) / 引き直した盤面に未解放が入る (3a)(3b) */
  lockedpool:   ['(2a)', '(3a)', '(3b)'],
  /* cleared 3 本の最初の引きが本筋を欠くと、次の読み込みで捨てられる */
  nofrontier:   ['(2a)'],
};
/* 依頼書 §8 の予想 (⭐ 実測と違うものは依頼書 §12-2 に理由を書いた) */
const NEG_PREDICTED = {
  memonly: ['(2a)', '(2b)'], lockedpool: ['(1c)'], nofrontier: ['(1c)', '(3b)'], novalidate: ['(3b)'], noreroll: ['(3a)'],
  enterreroll: ['(2a)'], oneonly: ['(1a)'], backroomdoor: ['(4b)'], shopbtn: ['(4c)', '(5b)'], killshopdom: ['(4c)', '(4d)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 10) vetFail('変異は 10 本まで (ポート 10528〜10537)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_MAYBE[k] || !NEG_PREDICTED[k])) vetFail('NEG_EXPECT / NEG_MAYBE / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length) vetFail('変異 ' + k + ' に必ず赤の節が無い');
  const both = NEG_EXPECT[k].filter((x) => NEG_MAYBE[k].indexOf(x) >= 0);
  if (both.length) vetFail('変異 ' + k + ' の ' + both.join(',') + ' が必ず赤と確率で赤の両方に居る');
  const miss = NEG_PREDICTED[k].filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  if (miss.length) vetFail('担当 ' + k + ' が依頼書 §8 の予想 ' + J(NEG_PREDICTED[k]) + ' を必ず赤に含まない (' + miss.join(',') + ')');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
/* 罠E の自己検査 */
const PEER_DRIVERS = ['verify_tavern_map.js', 'verify_npc_crowd.js', 'verify_recruit_talk.js'];
const PEER_SRC = PEER_DRIVERS.map((f) => { try { return { f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }; } catch (e) { return { f, s: null }; } });
if (PEER_SRC.some((x) => x.s === null)) vetFail('罠E の自己検査: 他ドライバのソースが読めない (' + PEER_SRC.filter((x) => x.s === null).map((x) => x.f).join(',') + ')');
for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
  const core = e.from.trim();
  const clash = PEER_SRC.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
  if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(','));
}
const _mutCache = {};
function servedTavern(key) {
  if (!key) return PRISTINE[F_TAVERN];
  if (_mutCache[key] !== undefined) return _mutCache[key];
  let s = PRISTINE[F_TAVERN];
  for (const e of MUTATIONS[key]) {
    const c = countOf(PRISTINE[F_TAVERN], e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + F_TAVERN + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE[F_TAVERN], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    s = s.split(e.from).join(e.to);
  }
  if (s.split('\n').length !== PRISTINE[F_TAVERN].split('\n').length) vetFail('変異 ' + key + ' が ' + F_TAVERN + ' の行数を変えた');
  _mutCache[key] = s;
  return s;
}
if (countOf(PRISTINE[F_TAVERN], '__MUTHIT__') !== 0 || countOf(PRISTINE[F_TAVERN], '--mut-') !== 0) vetFail('原本に __MUTHIT__ / --mut- が在る');
for (const k of MUT_ORDER) {
  if (!MUTATIONS[k].some((e) => e.to.indexOf('__MUTHIT__' + k) >= 0 || e.to.indexOf('--mut-' + k) >= 0)) vetFail('変異 ' + k + ' に実行の印が無い');
  if (servedTavern(k) === PRISTINE[F_TAVERN]) vetFail('変異 ' + k + ' が何も変えていない');
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本 ' + F_TAVERN + ' で 1 箇所・行数不変・他ドライバ '
  + PEER_DRIVERS.length + ' 本とアンカーの重なり 0');

/* ══════════════════════════════════════════════════════════════════════════════
 * ドライバ側の独立計算 (依頼書 §2-2 / §2-4 の規則を、ページの scenarios の素のデータとまいた cleared から)
 * ⛔ 本番の boardFacts() / boardValid() の答えは使わない。
 * ══════════════════════════════════════════════════════════════════════════════ */
function indepFacts(scen, cleared) {
  const cs = new Set(cleared || []);
  const isU = (s) => !s.locked || cs.has(s.unlockAfter);
  const unlocked = scen.filter(isU).map((s) => s.id);
  const fr = scen.find((s) => isU(s) && !cs.has(s.id));
  const nl = scen.find((s) => !isU(s));
  return { unlocked, frontier: fr ? fr.id : null, nextLocked: nl ? nl.id : null, ids: scen.map((s) => s.id) };
}
/* 盤面の妥当性 (§2-4 の 3 条件)。seatKeys = TAVERN_MAP.TABLES の key (データ) */
function indepValid(b, F, seatKeys) {
  if (!b || typeof b !== 'object' || !b.seats || typeof b.seats !== 'object') return { ok: false, why: '盤面が無い' };
  const keys = Object.keys(b.seats);
  if (keys.length !== 2) return { ok: false, why: '件数 ' + keys.length };
  const ids = [];
  for (const k of keys) {
    if (seatKeys.indexOf(k) < 0) return { ok: false, why: '存在しない席 ' + k };
    const id = b.seats[k];
    if (typeof id !== 'string' || ids.indexOf(id) >= 0) return { ok: false, why: 'id 重複/不正 ' + id };
    if (F.ids.indexOf(id) < 0) return { ok: false, why: '存在しない id ' + id };
    if (F.unlocked.indexOf(id) < 0 && !(F.unlocked.length < 2 && F.nextLocked === id)) return { ok: false, why: '未解放 ' + id };
    ids.push(id);
  }
  if (F.frontier && ids.indexOf(F.frontier) < 0) return { ok: false, why: '本筋 ' + F.frontier + ' が無い' };
  return { ok: true, why: '' };
}
const setEq = (a, b) => a.length === b.length && a.slice().sort().join('|') === b.slice().sort().join('|');

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[vet] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[vet] Chrome/Edge が見つかりません (--browser <path>)'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.md': 'text/markdown;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SERVERS = [];
function startServer(port, mutKey) {
  const tav = servedTavern(mutKey);
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === F_TAVERN) { res.setHeader('Content-Type', MIME['.html']); res.end(Buffer.from(tav, 'utf8')); return; }
        if (rel === '__blank.html') { res.setHeader('Content-Type', MIME['.html']); res.end('<!doctype html><title>blank</title>'); return; }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => { SERVERS.push(srv); resolve(srv); });
  });
}
function stopServer(srv) {
  return new Promise((resolve) => {
    try { srv.closeAllConnections(); } catch (e) {}
    try { srv.close(() => resolve()); } catch (e) { resolve(); }
    const i = SERVERS.indexOf(srv); if (i >= 0) SERVERS.splice(i, 1);
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(3a)', '(3b)',
  '(4a)', '(4b)', '(4c)', '(4d)', '(5a)', '(5b)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 900));
  };
  return R;
}
function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + '   PENDING 0' + (label ? '   ' + label : ''));
  if (failed) {
    console.log('  --- FAILED ---');
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 80) + '  -- ' + r.detail.slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed, failed };
}

/* ページ 1 枚の姿 (⛔ 期待値はここに書かない)。地図が無いページ (?tavernmap=0) でも落ちない */
const SNAP = (BKEY, CKEY) => {
  const $ = (s) => document.querySelector(s);
  const TV = window.__TAVERN_TV;
  const st = $('#tavernStage');
  const nameOf = (el) => { const n = el && el.querySelector('.tavernSignName'); return n ? n.textContent : null; };
  const signs = st ? Array.prototype.slice.call(st.querySelectorAll('[data-scenario]')).map((el) => ({
    id: el.id, sid: el.getAttribute('data-scenario'), locked: el.classList.contains('locked'), name: nameOf(el),
    left: parseFloat(el.style.left), top: parseFloat(el.style.top) })) : [];
  const door = (k) => { const el = document.getElementById('tavernDoor_' + k); return el ? { name: nameOf(el) } : null; };
  let saved = null, cleared = null;
  try { saved = localStorage.getItem(BKEY); } catch (e) {}
  try { cleared = JSON.parse(localStorage.getItem(CKEY) || '[]'); } catch (e) {}
  const se = document.getElementById('shopEntry');
  let mutcss = '';
  try { if (se) mutcss = getComputedStyle(se).getPropertyValue('--mut-shopbtn').trim(); } catch (e) {}
  const TM = window.TAVERN_MAP;
  return {
    hasTM: !!TM, hasBoardFn: !!(TV && typeof TV.board === 'function'),
    board: (TV && TV.board) ? TV.board() : undefined,
    signs, doorShop: door('shop'), doorBack: door('back'), saved, cleared,
    shopEntryDom: !!se, shopEntryVis: se ? se.checkVisibility() : null, mutcss,
    questDrawOn: document.body.classList.contains('questDrawOn'),
    mapOn: window.__tavernMapOn === true,
    tables: TM ? TM.TABLES.map((t) => ({ key: t.key, scenarioId: t.scenarioId, sign: t.sign.slice() })) : null,
    tile: TM ? TM.TILE : null,
    scen: (typeof scenarios !== 'undefined') ? scenarios.map((s) => ({ id: s.id, locked: !!s.locked, unlockAfter: s.unlockAfter || null })) : null,
  };
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { port, booted: 0, errs: [], hits: {} };
  const base = 'http://127.0.0.1:' + port + '/';
  const page = await browser.newPage();
  page.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
  page.on('console', (m) => {
    let t = ''; try { t = m.text(); } catch (e) { return; }
    if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
  });
  await page.setViewport(VIEW);

  /* 種まき: 同じオリジンの空ページで storage を総入れ替え (⚠ 前口上の暗幕を消す prologueSeen だけは常に立てる) */
  async function prep(o) {
    o = o || {};
    await page.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
    await page.evaluate((x, BK, CK, RK) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (x.cleared) localStorage.setItem(CK, JSON.stringify(x.cleared));
      if (x.board) localStorage.setItem(BK, x.board);
      if (x.result) sessionStorage.setItem(RK, JSON.stringify(x.result));
    }, o, BOARD_KEY, CLEARED_KEY, RESULT_KEY);
  }
  async function waitReady() {
    await page.waitForFunction(() => { try { return typeof scenarios !== 'undefined' && (window.__tavernMapOn === false || !!window.__TAVERN_TV); } catch (e) { return false; } }, { timeout: 30000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(150);
    ctx.booted++;
  }
  async function snap() {
    const s = await page.evaluate(SNAP, BOARD_KEY, CLEARED_KEY);
    if (s.mutcss === '1') ctx.hits.shopbtn = (ctx.hits.shopbtn || 0) + 1;
    return s;
  }
  async function open(q) {
    await page.goto(base + F_TAVERN + (q || ''), { waitUntil: 'load', timeout: 60000 });
    await waitReady();
    return snap();
  }
  /* 鍵だけ消して読み直す (= 次の引き)。cleared はそのまま */
  async function redraw() {
    await page.evaluate((BK) => localStorage.removeItem(BK), BOARD_KEY);
    return open('');
  }
  /* 1 枚の読み込みの「2 経路」(1e) を判定する。⛔ ここで期待値の盤面は作らない (三者の一致と席の位置だけ) */
  function twoRoutes(s) {
    const why = [];
    const b = s.board;
    if (!b || !b.seats) return { ok: false, why: 'board() が無い' };
    let sv = null; try { sv = JSON.parse(s.saved); } catch (e) {}
    if (!sv || !sv.seats) return { ok: false, why: '保存値が無い' };
    const dom = s.signs.map((x) => x.sid);
    if (!s.signs.every((x) => x.id === 'questTable_' + x.sid)) why.push('札 id と data-scenario が食い違う');
    if (!setEq(dom, Object.values(b.seats))) why.push('DOM ' + J(dom) + ' ≠ board ' + J(b.seats));
    if (!setEq(Object.values(b.seats), Object.values(sv.seats))) why.push('board ≠ 保存値');
    if (J(sv) !== J(b)) why.push('保存値の JSON ≠ board() の写し');
    for (const k of Object.keys(b.seats)) {
      const t = (s.tables || []).find((x) => x.key === k);
      const sg = s.signs.find((x) => x.sid === b.seats[k]);
      if (!t || !sg) { why.push('席 ' + k + ' の札が無い'); continue; }
      const wx = t.sign[0] * s.tile + s.tile / 2, wy = t.sign[1] * s.tile + s.tile / 2;
      if (Math.abs(sg.left - wx) > 0.5 || Math.abs(sg.top - wy) > 0.5) why.push('札 ' + sg.sid + ' が席 ' + k + ' に居ない');
    }
    return { ok: why.length === 0, why: why.join(' / ') };
  }
  const seatKeysOf = (s) => (s.tables || []).map((t) => t.key);
  const signsOnly = (s) => s.signs.map((x) => x.id + (x.locked ? '#L' : '') + '@' + x.left + ',' + x.top).sort().join(' ');
  const SC_ALL = [];   // 0b で埋める (scenarios の素のデータ)
  const routes = [];   // (1e) の標本
  let onSnap = null;   // (5b) の ON
  let offSnap = null;  // (5b) の OFF

  try {
    /* ══════════ §0 ══════════ */
    await prep({});
    const s0 = await open('');
    SC_ALL.push(...(s0.scen || []));
    R.check('(0a)', '[装置] window.TAVERN_MAP と __TAVERN_TV.board が在り、新規状態の盤面が 2 件',
      s0.hasTM && s0.hasBoardFn && s0.board && s0.board.seats && Object.keys(s0.board.seats).length === 2,
      { hasTM: s0.hasTM, hasBoardFn: s0.hasBoardFn, board: s0.board });
    {
      const sc = SC_ALL;
      const chain = sc.length === 6 && !sc[0].locked && sc.slice(1).every((x, i) => x.locked && x.unlockAfter === sc[i].id);
      R.check('(0b)', '[装置] scenarios が 6 件・一本道 (先頭だけ locked なし、以後は locked かつ unlockAfter = 1 つ前)', chain,
        sc.map((x) => x.id + (x.locked ? '<' + x.unlockAfter : '')).join(' → '));
    }
    const ID = SC_ALL.map((x) => x.id);   // 一本道の並び (0b が守る)
    const F = (cl) => indepFacts(SC_ALL, cl);

    /* ══════════ §1 ══════════ */
    {
      const fx = F([]);
      const det = []; let ok = fx.unlocked.length === 1 && fx.frontier === ID[0] && fx.nextLocked === ID[1];
      for (let i = 0; i < N_1A; i++) {
        const s = i === 0 ? s0 : await redraw();
        routes.push(['1a#' + i, s]);
        const ids = s.signs.map((x) => x.id).sort();
        const g = s.signs.find((x) => x.sid === ID[0]), f = s.signs.find((x) => x.sid === ID[1]);
        const one = ids.length === 2 && !!g && !!f && !g.locked && f.locked && f.name === '???' && g.name !== '???'
          && indepValid(s.board, fx, seatKeysOf(s)).ok;
        if (!one) ok = false;
        det.push(ids.join('+') + (f ? (f.locked ? '(L:' + f.name + ')' : '(open)') : '') + '@' + (s.board ? Object.keys(s.board.seats || {}).join('') : '-'));
      }
      R.check('(1a)', '新規 (cleared=[]) を ' + N_1A + ' 回引く → 毎回 札は ' + ID[0] + ' (押せる) + ' + ID[1] + ' (???・.locked) の 2 枚ちょうど', ok, det.join(' '));
    }
    {
      const cl = [ID[0]];
      await prep({ cleared: cl });
      const fx = F(cl);
      const det = []; let ok = true;
      for (let i = 0; i < N_1B; i++) {
        const s = i === 0 ? await open('') : await redraw();
        routes.push(['1b#' + i, s]);
        const v = s.board && s.board.seats ? Object.values(s.board.seats) : [];
        const one = setEq(v, [ID[0], ID[1]]) && s.signs.length === 2 && s.signs.every((x) => !x.locked) && indepValid(s.board, fx, seatKeysOf(s)).ok;
        if (!one) ok = false;
        det.push(v.join('+') + (s.signs.some((x) => x.locked) ? '(L)' : ''));
      }
      R.check('(1b)', 'cleared=[' + ID[0] + '] を ' + N_1B + ' 回引く → 毎回 盤面 = {' + ID[0] + ', ' + ID[1] + '}・両方押せる', ok, det.join(' '));
    }
    {
      const det = []; let ok = true;
      for (let k = 1; k <= 5; k++) {
        const cl = ID.slice(0, k);
        await prep({ cleared: cl });
        const fx = F(cl);
        const row = [];
        for (let i = 0; i < N_1C; i++) {
          const s = i === 0 ? await open('') : await redraw();
          routes.push(['1c' + k + '#' + i, s]);
          const v = s.board && s.board.seats ? Object.values(s.board.seats) : [];
          const other = v.filter((x) => x !== fx.frontier);
          const vv = indepValid(s.board, fx, seatKeysOf(s));
          const one = v.length === 2 && v.indexOf(fx.frontier) >= 0 && other.length === 1 && fx.unlocked.indexOf(other[0]) >= 0
            && s.signs.length === 2 && s.signs.filter((x) => x.locked).length === 0 && vv.ok;
          if (!one) { ok = false; row.push('✗' + v.join('+') + (vv.ok ? '' : '[' + vv.why + ']') + (s.signs.some((x) => x.locked) ? '(L)' : '')); }
          else row.push(other[0]);
        }
        det.push('c' + k + '(本筋 ' + fx.frontier + '): ' + row.join(','));
      }
      R.check('(1c)', 'cleared 1〜5 本の各状態で鍵を消して ' + N_1C + ' 回読み直す → 全回で本筋が入り、もう 1 件は解放済み、未解放の札 0 枚',
        ok, det.join(' | '));
    }
    {
      const cl = ID.slice();
      await prep({ cleared: cl });
      const fx = F(cl);
      const det = []; let ok = fx.frontier === null && fx.unlocked.length === 6;
      for (let i = 0; i < N_1D; i++) {
        const s = i === 0 ? await open('') : await redraw();
        routes.push(['1d#' + i, s]);
        const v = s.board && s.board.seats ? Object.values(s.board.seats) : [];
        const one = v.length === 2 && v[0] !== v[1] && v.every((x) => fx.unlocked.indexOf(x) >= 0) && s.signs.length === 2
          && s.signs.every((x) => !x.locked) && indepValid(s.board, fx, seatKeysOf(s)).ok;
        if (!one) ok = false;
        det.push(v.join('+'));
      }
      R.check('(1d)', 'cleared 6 本を ' + N_1D + ' 回引く → 本筋なし・2 件とも解放済み・重複なし', ok, det.join(' '));
    }
    {
      const bad = routes.map(([n, s]) => [n, twoRoutes(s)]).filter((x) => !x[1].ok);
      R.check('(1e)', '2 経路: §1 の全 ' + routes.length + ' 読み込みで DOM の札 === board().seats === localStorage の保存値 (+ 各札が自分の席)',
        routes.length === N_1A + N_1B + 5 * N_1C + N_1D && bad.length === 0,
        bad.length ? bad.slice(0, 4).map((x) => x[0] + ': ' + x[1].why).join(' | ') : routes.length + ' 読み込みすべて一致');
    }

    /* ══════════ §2 ══════════ */
    {
      const cl = ID.slice(0, 3);
      await prep({ cleared: cl });
      const a = await open('');
      const want = J(a.board), wantSigns = signsOnly(a), wantSaved = a.saved;
      const det = [];
      let ok = !!(a.board && a.board.nonce) && indepValid(a.board, F(cl), seatKeysOf(a)).ok;
      for (let i = 0; i < N_2A_RELOAD; i++) {
        const s = await open('');
        const one = J(s.board) === want && signsOnly(s) === wantSigns && s.saved === wantSaved;
        if (!one) ok = false;
        det.push('reload' + i + (one ? '=' : '≠' + (s.board && s.board.nonce)));
      }
      for (let i = 0; i < N_2A_TOWN; i++) {
        await page.goto(base + 'town.html', { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
        await sleep(300);
        /* 町が施設へ入るときと同じ作法 (town.html enterFacility): enterVia を書いて素の tavern.html へ */
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
          page.evaluate(() => { sessionStorage.setItem('dragonfighters.enterVia', 'tavern'); location.href = 'tavern.html'; }),
        ]);
        await waitReady();
        const s = await snap();
        const one = J(s.board) === want && signsOnly(s) === wantSigns && s.saved === wantSaved;
        if (!one) ok = false;
        det.push('town' + i + (one ? '=' : '≠' + (s.board && s.board.nonce)));
      }
      R.check('(2a)', 'cleared 3 本で盤面を作らせた後、再読込 ' + N_2A_RELOAD + ' 回・町へ出て戻る ' + N_2A_TOWN + ' 回で nonce も席も 1 文字も変わらない',
        ok, 'nonce=' + (a.board && a.board.nonce) + ' seats=' + J(a.board && a.board.seats) + ' ' + det.join(' '));
    }
    {
      const seeds = [
        { cleared: [], board: { v: 1, seats: { t3: ID[0], t2: ID[1] }, nonce: 'SEED-2b-new' } },
        { cleared: ID.slice(0, 3), board: { v: 1, seats: { t3: ID[3], t1: ID[2] }, nonce: 'SEED-2b-c3' } },
      ];
      const det = []; let ok = true;
      for (const sd of seeds) {
        const pre = indepValid(sd.board, F(sd.cleared), ['t1', 't2', 't3']);
        if (!pre.ok) { ok = false; det.push('[装置] 種が独立計算で妥当でない ' + pre.why); continue; }
        const str = J(sd.board);
        await prep({ cleared: sd.cleared, board: str });
        const s = await open('');
        const dom = s.signs.map((x) => x.sid);
        const one = J(s.board) === str && s.saved === str && setEq(dom, Object.values(sd.board.seats));
        if (!one) ok = false;
        det.push(sd.board.nonce + (one ? ' 採用' : ' ✗ board=' + J(s.board)));
      }
      R.check('(2b)', '妥当な盤面の種 (新規状態の ??? 入り / cleared 3 本) がそのまま採用される (nonce・保存値が種のまま)', ok, det.join(' | '));
    }

    /* ══════════ §3 ══════════ */
    {
      const seed = J({ v: 1, seats: { t1: ID[0], t2: ID[1] }, nonce: 'SEED' });
      const cases = [
        { cleared: true, scenarioId: ID[0] },
        { defeated: true, scenarioId: ID[0] },
        { retreated: true, scenarioId: ID[0] },
        { cleared: true, scenarioId: 'generated-quest' },
      ];
      const det = []; let ok = true;
      for (const r of cases) {
        await prep({ cleared: [], board: seed, result: r });
        const s = await open('');
        const cl = s.cleared || [];
        /* 装置: 帰還が消費された (cleared の帰還は廃坑が cleared に入る / 生成クエストと敗北・撤退は入らない) */
        const consumed = (r.cleared && r.scenarioId === ID[0]) ? cl.indexOf(ID[0]) >= 0 : cl.length === 0;
        const vv = indepValid(s.board, F(cl), seatKeysOf(s));
        const one = !!s.board && s.board.nonce !== 'SEED' && vv.ok && consumed && s.saved === J(s.board);
        if (!one) ok = false;
        det.push(Object.keys(r)[0] + ':' + r.scenarioId + ' → nonce=' + (s.board && s.board.nonce) + (vv.ok ? '' : ' [' + vv.why + ']') + (consumed ? '' : ' [未消費]'));
      }
      R.check('(3a)', '種の盤面 (nonce "SEED") + lastResult を cleared / defeated / retreated / generated-quest の 4 通り → 4 通りとも引き直し (引き直した盤面も妥当)',
        ok, det.join(' | '));
    }
    {
      const det = []; let ok = true;
      for (const k of [3, 4]) {
        const cl = ID.slice(0, k);
        const fx = F(cl);
        const fr = fx.frontier, lk = fx.nextLocked;
        const bads = [
          ['本筋欠け', { t1: ID[0], t2: ID[1] }],
          ['未解放', { t1: fr, t2: lk }],
          ['3件', { t1: fr, t2: ID[0], t3: ID[1] }],
          ['存在しない席', { t1: fr, t9: ID[0] }],
          ['id重複', { t1: fr, t2: fr }],
          ['存在しないid', { t1: fr, t2: 'no-such-quest' }],
        ];
        for (const [nm, seats] of bads) {
          const bd = { v: 1, seats, nonce: 'SEED' };
          const pre = indepValid(bd, fx, ['t1', 't2', 't3']);
          if (pre.ok) { ok = false; det.push('[装置] c' + k + ' ' + nm + ' が独立計算で妥当になってしまう'); continue; }
          await prep({ cleared: cl, board: J(bd) });
          const s = await open('');
          const vv = indepValid(s.board, fx, seatKeysOf(s));
          const one = !!s.board && s.board.nonce !== 'SEED' && vv.ok && s.saved === J(s.board);
          if (!one) { ok = false; det.push('✗c' + k + ' ' + nm + ' → ' + J(s.board) + (vv.ok ? '' : ' [' + vv.why + ']')); }
          else det.push('c' + k + ' ' + nm + ' → ' + Object.values(s.board.seats).join('+'));
        }
      }
      R.check('(3b)', '妥当でない種 6 種を cleared 3 本 / 4 本でまく → 12 回とも捨てて引き直す (引き直した盤面も妥当)', ok, det.join(' | '));
    }

    /* ══════════ §4 ══════════ */
    {
      await prep({});
      const s = await open('');
      onSnap = s;
      R.check('(4a)', '#tavernDoor_shop が在り文言が「' + SHOP_NAME + '」/ #tavernDoor_back は DOM に無い',
        !!s.doorShop && s.doorShop.name === SHOP_NAME && !s.doorBack, { shop: s.doorShop, back: s.doorBack });
      R.check('(4c)', '地図モードで #shopEntry が見えない (checkVisibility() false) かつ DOM には在る',
        s.mapOn && s.shopEntryDom && s.shopEntryVis === false, { mapOn: s.mapOn, dom: s.shopEntryDom, vis: s.shopEntryVis, questDrawOn: s.questDrawOn });
      let st = null, start = null;
      const t0 = Date.now();
      try {
        start = await page.evaluate(() => window.__TAVERN_TV.heroTile());
        await page.click('#tavernDoor_shop');
        while (Date.now() - t0 < 15000) {
          st = await page.evaluate(() => {
            const bar = document.getElementById('backroomBar');
            return { shop: getComputedStyle(document.getElementById('shopScreen')).display,
                     bar: !!(bar && bar.checkVisibility()), backroomOn: document.body.classList.contains('backroomOn'),
                     tile: window.__TAVERN_TV.heroTile() };
          });
          if (st.shop === 'flex' || st.backroomOn) break;
          await sleep(60);
        }
        if (st && st.shop === 'flex') {
          await sleep(400);
          st.barLater = await page.evaluate(() => { const b = document.getElementById('backroomBar'); return !!(b && b.checkVisibility()) || document.body.classList.contains('backroomOn'); });
        }
      } catch (e) { st = { err: String((e && e.message) || e).slice(0, 200) }; }
      const walked = !!start && !(start.c === 13 && start.r === 2);
      R.check('(4b)', '扉札を押す → 扉前 (13,2) へ歩いてから #shopScreen が display:flex、#backroomBar は出ない',
        walked && !!st && st.shop === 'flex' && !!st.tile && st.tile.c === 13 && st.tile.r === 2 && !st.bar && !st.backroomOn && st.barLater === false,
        { start, at: st, ms: Date.now() - t0 });
    }
    {
      await prep({});
      const s = await open('?tavernmap=0');
      let opened = null;
      try {
        if (s.shopEntryDom) {
          await page.click('#shopEntry');
          const t0 = Date.now();
          while (Date.now() - t0 < 4000) {
            opened = await page.evaluate(() => getComputedStyle(document.getElementById('shopScreen')).display);
            if (opened === 'flex') break;
            await sleep(60);
          }
        }
      } catch (e) { opened = 'err:' + String((e && e.message) || e).slice(0, 120); }
      R.check('(4d)', '?tavernmap=0 では #shopEntry が見えて押すと店が開く',
        !s.mapOn && s.shopEntryDom && s.shopEntryVis === true && opened === 'flex', { mapOn: s.mapOn, dom: s.shopEntryDom, vis: s.shopEntryVis, shop: opened });
    }

    /* ══════════ §5 ══════════ */
    {
      await prep({});
      const s = await open('?questdraw=0');
      offSnap = s;
      const tb = s.tables || [];
      const seatOk = tb.length === 3 && s.signs.length === 3 && tb.every((t) => {
        const sg = s.signs.find((x) => x.sid === t.scenarioId);
        return sg && sg.id === 'questTable_' + t.scenarioId
          && Math.abs(sg.left - (t.sign[0] * s.tile + s.tile / 2)) <= 0.5 && Math.abs(sg.top - (t.sign[1] * s.tile + s.tile / 2)) <= 0.5;
      });
      const fixed = setEq(tb.map((t) => t.scenarioId), ID.slice(0, 3));
      let back = null;
      try {
        if (s.doorBack) {
          await page.click('#tavernDoor_back');
          const t0 = Date.now();
          while (Date.now() - t0 < 15000) {
            back = await page.evaluate(() => ({ on: document.body.classList.contains('backroomOn'),
              open: document.getElementById('tableArea').classList.contains('backroomOpen'),
              shop: getComputedStyle(document.getElementById('shopScreen')).display, tile: window.__TAVERN_TV.heroTile() }));
            if (back.on || back.shop === 'flex') break;
            await sleep(60);
          }
        }
      } catch (e) { back = { err: String((e && e.message) || e).slice(0, 200) }; }
      R.check('(5a)', '?questdraw=0 → 札 3 枚 = 廃坑/森/沼地 が TABLES の席どおり・board() null・「' + BACK_NAME + '」が奥の間を開く・shop の扉なし・#shopEntry が見える',
        seatOk && fixed && s.board === null && !s.questDrawOn && !!s.doorBack && s.doorBack.name === BACK_NAME && !s.doorShop
          && s.shopEntryDom && s.shopEntryVis === true && !!back && back.on === true && back.open === true && back.shop !== 'flex',
        { signs: s.signs.map((x) => x.id), fixed, board: s.board, back: s.doorBack, shop: s.doorShop, vis: s.shopEntryVis, opened: back });
    }
    {
      const P = (s) => {
        if (!s) return [null, null, null];
        const p1 = !!(s.board && s.board.seats) && twoRoutes(s).ok;
        const p2 = !!s.doorShop && s.doorShop.name === SHOP_NAME && !s.doorBack;
        const p3 = !!s.shopEntryDom && s.shopEntryVis === false;
        return [p1, p2, p3];
      };
      const on = P(onSnap), off = P(offSnap);
      R.check('(5b)', '(1e)(4a)(4c) の 3 条件を ON/OFF へ当てて全部反転 (ON = true×3 / OFF = false×3)',
        on.every((x) => x === true) && off.every((x) => x === false), { on, off });
    }

    /* ══════════ (0c) ══════════ */
    R.check('(0c)', '[装置] 全ページで pageerror 0 件', ctx.booted > 0 && ctx.errs.length === 0, '起動 ' + ctx.booted + ' 回 / pageerror ' + J(ctx.errs.slice(0, 3)));
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await sleep(200);   // console イベントの取りこぼしを避ける
    await page.close().catch(() => {});
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_quest_draw_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  const run = async (port, key, label) => {
    const srv = await startServer(port, key);
    console.log('\n[vet] ════════ ' + label + ' (port ' + port + ') ════════');
    const t0 = Date.now();
    const R = await runSuite(browser, port, key, label);
    console.log('[vet] ' + label + ' 所要 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
    await stopServer(srv);
    return R;
  };
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const R0 = await run(PORT, null, '(素・基準)');
      const s0 = summarize(R0, '[素・基準]');
      const hits0 = Object.keys(R0.hits);
      if (s0.failed || R0.length !== ALL_IDS.length || hits0.length) {
        console.error('[vet] ⛔ 素の基準で FAIL がある / 判定数が合わない / 変異の印が出た (' + J(R0.hits) + ') — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const R = await run(port, key, '[変異 ' + key + ']');
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const hit = R.hits[key] || 0;
          const want = NEG_EXPECT[key], maybe = NEG_MAYBE[key];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = red.filter((x) => want.indexOf(x) < 0 && maybe.indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = hit > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + (maybe.length ? ' (確率で赤 ' + maybe.join(',') + ')' : '')
            + ' / 実際に赤くなった=' + (red.join(',') || '(なし)') + ' / 注入行の実行 ' + hit + ' 回 → ' + (ok ? '✓ OK' : '✗ ' + (hit ? '' : '注入行が実行されていない ')
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, maybe, red, ok, hit });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (必ず赤 ⊆ 赤 ⊆ 必ず赤 ∪ 確率で赤)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(13) + ' 担当 ' + r.want.join(',') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '')
          + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 注入行 ' + r.hit + ' 回');
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const R = await run(port, MUTATE, '[変異 ' + MUTATE + ' (手回し)]');
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vet] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)') + ' / 注入行の実行 ' + (R.hits[MUTATE] || 0) + ' 回');
      exitCode = 0;
    } else {
      const R = await run(PORT, null, '(素)');
      const s = summarize(R, '');
      const hits = Object.keys(R.hits);
      if (hits.length) console.error('[vet] ⛔ 素で変異の印が出た: ' + J(R.hits));
      exitCode = (s.failed || R.length !== ALL_IDS.length || hits.length) ? 1 : 0;
    }
  } catch (e) {
    console.error('[vet] 例外: ' + ((e && e.stack) || e));
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    for (const s of SERVERS.slice()) await stopServer(s);
  }
  console.log('[vet] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
})();
