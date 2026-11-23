#!/usr/bin/env node
/*
 * verify_quest_draw.js — 酒場の卓の依頼 (戻るたびに入れ替わる盤面) の受入ドライバ
 *   ★[#120] 実装依頼書 2026-11-23_tavern-three-quests.md §8 で **3 件へ言い直した** (旧 = #81 2026-10-02_quest-draw-shop-room.md §8 の 18 判定)。
 *   #81 の主張 (2 件・本筋 1・??? 埋め) は撤退 ?board3=0 の腕 (2a) へ寄せて残した。言い直しの対応表は #120 依頼書 §12-3。
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_quest_draw.js                        # 素 (port 10920)
 *   node tools/verify_quest_draw.js --negative             # 素の基準 + 変異 8 本 (port 10921〜10928)
 *   node tools/verify_quest_draw.js --negative --only fixedcount,dup
 *   node tools/verify_quest_draw.js --mutate nolock        # 変異 1 本を載せて手回し
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り (担当の節が赤くならない)・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 #120 §8)
 *   - 盤面は**ブラウザで本番の関数に作らせる** (tavern.html を開くだけ = buildSigns → loadOrDrawBoard)。
 *     ドライバは localStorage の種 (dragonfighters.cleared / dragonfighters.questBoard) と
 *     sessionStorage["dragonfighters.lastResult"] をまき、DOM の札 (#tavernStage [data-scenario]) と
 *     保存値 (localStorage) と __TAVERN_TV.board() の 3 経路で判定する。⛔ 盤面を書き換えるシームは使わない (無い)。
 *   - 期待値 (解放済み / 本筋 / 次の未解放 / 件数 / 盤面の妥当性) は、ページ内の `scenarios` の {id, locked, unlockAfter, side} と
 *     ドライバがまいた cleared から**ドライバ側で独立に**計算する (indepFacts / expCount / indepValid)。
 *     ⛔ 本番の __TAVERN_TV.boardFacts() / boardCount() の答えは判定に使わない (写経にしない)。
 *     件数 expCount は「本筋 1 + 残りの解放済み + 足りなければ次の未解放 1 件、上限 = 卓の件数 (3 / 撤退 2)」という
 *     **積み方の規則**から数える (式の形は本番の boardCount と同じ値になるが、本番の関数は呼ばない)。
 *   - 乱数は固定しない。分布は測らない (§8「測らないこと」)。代わりに「何回引いても成り立つ不変条件」を複数回の引き直しで問う。
 *     ⭐ 回数は変異の検出を決定的にするための数:
 *       nofront の (1b) = cleared=[廃坑] で本筋 (森) を入れずに 4 件から 3 件 → 森が入る確率 3/4 ⇒ N_1B=25 で緑のまま (3/4)^25 ≒ 7.5e-4
 *       dup の (1c)     = 12 件から戻さずに 3 件 → 重複なし (11/12)(10/12) ≒ 0.764 ⇒ N_1C=26 で緑のまま 0.764^26 ≒ 9.1e-4
 *   - 町との往復 ((1g)) は town.html を実際に開き、町が施設へ入るときと同じ
 *     sessionStorage["dragonfighters.enterVia"]="tavern" + location.href="tavern.html" で戻る (town.html enterFacility の作法)。
 *   - 種まきに sessionStorage["dragonfighters.plazaClock"]="21" を入れる (CLAUDE.md #102 節: 酒場に触れるドライバの作法)。
 *
 * ■ 測っているもの (依頼書 #120 §8 の番号。(0c)(0d)(1h)(3b)(4a)〜(4d) は #81 から持ち越した件数に依存しない判定)
 *   §0 (0a) [装置] window.TAVERN_MAP と __TAVERN_TV.board が在り、新規状態の盤面が 3 件 (⭐ 無いと全部空振りで緑)
 *      (0b) [装置] 撤退 ?board3=0 の新規状態の盤面が 2 件 (= 腕が本当に別の世界を測っている)
 *      (0c) [装置] scenarios = 本筋 6 件の一本道 + side 6 件 (#81 (0b) を持ち越し)
 *      (0d) [装置] 全ページで pageerror 0 件 (#81 (0c) を持ち越し)
 *   §1 (1a) 新規状態を 6 回引く → 毎回 {廃坑, 巣穴, 森 (???)} の 3 件。森の札は .locked・名前 ???、廃坑と巣穴は押せる
 *      (1b) cleared=[廃坑] を 25 回 → 3 件とも解放済み・本筋 (森) を含む・重複なし
 *           + cleared 2〜5 本 × 3 回 (#81 (1c) を 3 件へ) + 撤退 ?cargo=0 × 3 回 = {廃坑, 森, 巣穴} ちょうど (#81 (1b) の撤退腕を 3 件へ)
 *      (1c) cleared = 本筋 6 本を 26 回 → 本筋なし・3 件とも解放済み・重複なし
 *      (1d) 3 経路: §1 の全読み込みで DOM の札 id 集合 === board().seats の値の集合 === 保存値の集合 (+ 保存値 === board() の写し・各札が自分の席)
 *      (1e) ⭐ 依頼書 §2-2: ?warren=0 の新規状態で盤面が 2 件 (廃坑 + ??? 森)・__tavernRefreshSigns() を 3 回 + 再読み込み 1 回で nonce が変わらない
 *      (1f) 旧 2 件の保存値 (本筋 + 1 件。#81 の世界で妥当) を種まき → 読み込み後は 3 件・本筋を含む・保存値も 3 件に上書き (1 回の引き直し)。
 *           もう 1 回読み込むと nonce が変わらない (新規状態 / cleared=[廃坑] の 2 通り)
 *      (1g) 依頼から戻った (consumeResult の鍵消し) 後だけ nonce が変わる (#81 の非退行):
 *           妥当な 3 件の種がそのまま採用され (#81 (2b))、再読込 3 回・町へ出て戻る 2 回で 1 文字も変わらず (#81 (2a))、
 *           lastResult (cleared / defeated / retreated / generated-quest) の 4 通りでは引き直す (#81 (3a))
 *      (1h) 妥当でない種 6 種を cleared 3 本 / 4 本でまく → 12 回とも捨てて引き直す (#81 (3b) を 3 件へ)
 *   §2 (2a) 撤退 ?board3=0 の腕で #81 の主張が今どおり: 新規 = {廃坑, 巣穴} の 2 件 / ?warren=0 = {廃坑, ??? 森} /
 *           cleared=[廃坑] = {森 + 1 件} / cleared 2〜5 本 = 本筋 + 解放済み 1 件 / cleared 6 本 = 解放済み 2 件 / 妥当な 2 件の種 3 つが採用
 *   §3 (3a) ?questdraw=0 → 札 3 枚 = TABLES の scenarioId が TABLES の席どおり・board() null・「奥の間へ」が奥の間を開く・shop の扉なし (#81 (5a))
 *      (3b) 3 経路 (1d)・(4a)・(4c) の 3 条件を ON/OFF へ当てて全部反転 (#81 (5b))
 *   §4 (4a)〜(4d) 武器防具屋の扉 (#81 の (4a)〜(4d) をそのまま)
 *   ⛔ 測らないこと (依頼書 §8): 札の見た目・iPhone での重なり / 自由枠の偏り (無作為の分布)
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。tavern.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列を
 *     メモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *     種まき用に空のページ /__blank.html を配る (同じオリジンで storage を触るため)。
 *   - 素と各変異はポート = オリジンが違う ⇒ localStorage は互いに混ざらない。
 *   - 起動時に全変異のアンカーを**原本**で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *   - 罠E の自己検査: 自分のアンカーが、同じ場所を変異させる他ドライバ (verify_tavern_map / verify_npc_crowd /
 *     verify_recruit_talk) のソースに出てこないこと。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を**欠陥が効く枝**に持つ。
 *   - ⭐ --negative の合否 = 「担当 (NEG_EXPECT = 依頼書 §8 の表) ⊆ 実際の赤」+ 注入行の実行 > 0 + 全判定が出ている。
 *     担当外の赤は合否に使わず記録する (NEG_ALSO = 実走の記録。依頼書 §12-3 の表)。
 *   - ⛔ git を読まない ⇒ 影のツリー / clone でもそのまま走る。⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10920** (素) / 変異 **10921〜10928** (8 本・MUTATIONS の並び順)。次の新規ドライバ base = 10929。
 *   (#81 の 10527〜10537 は返した)
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
const PORT = parseInt(arg('port', '10920'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BOARD_KEY = 'dragonfighters.questBoard';
const CLEARED_KEY = 'dragonfighters.cleared';
const RESULT_KEY = 'dragonfighters.lastResult';
const WARREN = 'kobold-warren';   /* ★[#103] 本筋の外・最初から受けられる行き先 (撤退 ?warren=0 で配列から外れる) */
const CARGO = 'lost-cargo';       /* ★[#104] 本筋の外・廃坑の後に受けられる行き先 (撤退 ?cargo=0 で配列から外れる) */
const TOMB = 'silent-tomb';       /* ★[#105] 森の後 */
const HAG = 'witch-hut';          /* ★[#106] 沼地の後 */
const GIANT = 'frost-hold';       /* ★[#107] 神殿の後 */
const SHOP_NAME = '武器防具屋';
const BACK_NAME = '奥の間へ';
const VIEW = { width: 1440, height: 900 };
/* ★[#120] 卓の件数 (既定 / 撤退 ?board3=0)。ページの BOARD_SIZE は読まない (依頼書 §8 の方針) */
const SIZE = 3, SIZE_OFF = 2;
/* 回数 (⭐ 変異の検出を決定的にするための数。下げると「必ず赤」が確率に落ちる。根拠は冒頭の ■ 方針) */
const N_1A = 6, N_1B = 25, N_1B_MID = 3, N_1B_CARGO = 3, N_1C = 26, N_1E_REFRESH = 3, N_1G_RELOAD = 3, N_1G_TOWN = 2, N_2A = 3, N_2A_MID = 2;

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_TAVERN = 'tavern.html';
const PRISTINE = { [F_TAVERN]: fs.readFileSync(path.join(ROOT, F_TAVERN), 'utf8') };
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 #120 §8 の負のコントロール 8 本)。逐語は HEAD 8274d28 (項目 2 の実装後) の行で取った。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const MUTATIONS = {
  /* §2-2 の罠: boardValid ① を「ちょうど BOARD_SIZE 件」へ戻す (印は boardCount なら通っていた盤面を捨てたとき) */
  fixedcount: [
    { from: 'if (keys.length !== boardCount(f)) return false;',
      to: 'if (keys.length !== BOARD_SIZE) { if (keys.length === boardCount(f)) ' + HIT('fixedcount') + '; return false; }   /* ★変異fixedcount */' }],
  /* BOARD_SIZE を 2 に固定 (印は既定の世界で 3 のはずだったとき) */
  size2: [
    { from: 'var BOARD_SIZE = BOARD3_ON ? 3 : 2;',
      to: 'var BOARD_SIZE = BOARD3_ON ? (' + HIT('size2') + ', 2) : 2;   /* ★変異size2 */' }],
  /* 次の未解放 (??? 埋め) を足さない (印は足すはずだったとき)。#81 の oneonly の後継 */
  nolock: [
    { from: 'if (ids.length < n && f.nextLocked) ids.push(f.nextLocked.id);',
      to: 'if (ids.length < n && f.nextLocked && (' + HIT('nolock') + ', false)) ids.push(f.nextLocked.id);   /* ★変異nolock */' }],
  /* 本筋を入れない (印は本筋があるのに入れなかったとき)。#81 の nofrontier と同じ注入 */
  nofront: [
    { from: 'if (f.frontier) ids.push(f.frontier.id);',
      to: 'if (f.frontier && (' + HIT('nofront') + ', false)) ids.push(f.frontier.id);   /* ★変異nofront */' }],
  /* 自由枠の抽選で引いた依頼を母集団から抜かない = 重複を許す (印は実際に重複を引いたとき) */
  dup: [
    { from: 'ids.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0].id);',
      to: '{ var __p = rest[Math.floor(Math.random() * rest.length)].id; if (ids.indexOf(__p) >= 0) ' + HIT('dup') + '; ids.push(__p); }   /* ★変異dup */' }],
  /* ?board3=0 を読まない (印は ?board3=0 が来たのに無視したとき) */
  noswitch: [
    { from: 'try { return new URLSearchParams(location.search).get("board3") !== "0"; } catch (e) { return true; }',
      to: 'try { if (new URLSearchParams(location.search).get("board3") === "0") ' + HIT('noswitch') + '; return true; } catch (e) { return true; }   /* ★変異noswitch */' }],
  /* buildSigns の先頭で保存値を消す = 消し口を増やす (印は消す保存値があったとき) */
  extraconsume: [
    { from: 'var bd = QUEST_DRAW_ON ? loadOrDrawBoard() : null;',
      to: 'try { if (localStorage.getItem("dragonfighters.questBoard")) ' + HIT('extraconsume') + '; localStorage.removeItem("dragonfighters.questBoard"); } catch (e) {} var bd = QUEST_DRAW_ON ? loadOrDrawBoard() : null;   /* ★変異extraconsume */' }],
  /* ??? 札に本当の地名を出す (印は未解放の札を作ったとき) */
  lockedname: [
    { from: 'name: unlocked ? sc.place : "???",',
      to: 'name: unlocked ? sc.place : (' + HIT('lockedname') + ', sc.place),   /* ★変異lockedname */' }],
};
/* 変異 → 必ず赤くなる節 (担当) = 依頼書 #120 §8 の表そのまま。⚠ 実走で赤くならなければ exit 1 (期待を書き換える前に理由を突き止める) */
const NEG_EXPECT = {
  fixedcount:   ['(1e)'],
  size2:        ['(0a)', '(1a)'],
  nolock:       ['(1a)', '(1e)'],
  nofront:      ['(1b)'],
  dup:          ['(1c)'],
  noswitch:     ['(0b)', '(2a)'],
  extraconsume: ['(1e)', '(1f)'],
  lockedname:   ['(1a)'],
};
/* 担当外の赤 (合否に使わない・2026-11-23 の --negative 実走の記録。依頼書 §12-3)。
   ⚠ nofront の (1f)(1h)(2a)・dup の (1d)(1f)(1g)(3b) は乱数の引きしだいで出たり出なかったりし得る */
const NEG_ALSO = {
  fixedcount:   [],
  size2:        ['(0b)', '(1b)', '(1c)', '(1f)', '(1g)', '(1h)'],
  nolock:       ['(0a)', '(0b)', '(1f)', '(1g)', '(2a)'],
  nofront:      ['(1f)', '(1h)', '(2a)'],
  dup:          ['(1a)', '(1b)', '(1d)', '(1f)', '(1g)', '(3b)'],
  noswitch:     [],
  extraconsume: ['(1g)', '(2a)'],
  lockedname:   ['(1e)', '(2a)'],
};
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(1h)', '(2a)', '(3a)', '(3b)',
  '(4a)', '(4b)', '(4c)', '(4d)'];
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 8) vetFail('変異は 8 本まで (ポート 10921〜10928)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_ALSO[k])) vetFail('NEG_EXPECT / NEG_ALSO と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length) vetFail('変異 ' + k + ' に担当の節が無い');
  const unk = NEG_EXPECT[k].filter((x) => ALL_IDS.indexOf(x) < 0);
  if (unk.length) vetFail('変異 ' + k + ' の担当 ' + unk.join(',') + ' が判定の一覧に無い');
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
if (countOf(PRISTINE[F_TAVERN], '__MUTHIT__') !== 0) vetFail('原本に __MUTHIT__ が在る');
for (const k of MUT_ORDER) {
  if (!MUTATIONS[k].some((e) => e.to.indexOf('__MUTHIT__' + k) >= 0)) vetFail('変異 ' + k + ' に実行の印が無い');
  if (servedTavern(k) === PRISTINE[F_TAVERN]) vetFail('変異 ' + k + ' が何も変えていない');
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本 ' + F_TAVERN + ' で 1 箇所・行数不変・他ドライバ '
  + PEER_DRIVERS.length + ' 本とアンカーの重なり 0');

/* ══════════════════════════════════════════════════════════════════════════════
 * ドライバ側の独立計算 (依頼書 #81 §2-2 / §2-4・#120 §2-2 の規則を、ページの scenarios の素のデータとまいた cleared から)
 * ⛔ 本番の boardFacts() / boardCount() / boardValid() の答えは使わない。
 * ══════════════════════════════════════════════════════════════════════════════ */
function indepFacts(scen, cleared) {
  const cs = new Set(cleared || []);
  const isU = (s) => !s.locked || cs.has(s.unlockAfter);
  const unlocked = scen.filter(isU).map((s) => s.id);
  /* ★[#82] 本筋と次の未解放は本筋 (side でない) だけから引く。抽選の母集団 (unlocked) には side も入る。 */
  const main = scen.filter((s) => !s.side);
  const fr = main.find((s) => isU(s) && !cs.has(s.id));
  const nl = main.find((s) => !isU(s));
  return { unlocked, frontier: fr ? fr.id : null, nextLocked: nl ? nl.id : null, ids: scen.map((s) => s.id) };
}
/* 盤面の件数 = 積み方の規則で数える: 本筋 (あれば 1) → 残りの解放済み → 足りなければ次の未解放 1 件、上限 S */
function expCount(F, S) {
  const pool = (F.frontier ? 1 : 0) + F.unlocked.filter((x) => x !== F.frontier).length + (F.nextLocked ? 1 : 0);
  return pool < S ? pool : S;
}
/* 盤面の妥当性 (#81 §2-4 の 3 条件。① の件数は expCount)。seatKeys = TAVERN_MAP.TABLES の key (データ) */
function indepValid(b, F, seatKeys, S) {
  if (!b || typeof b !== 'object' || !b.seats || typeof b.seats !== 'object') return { ok: false, why: '盤面が無い' };
  const keys = Object.keys(b.seats);
  const want = expCount(F, S);
  if (keys.length !== want) return { ok: false, why: '件数 ' + keys.length + ' (期待 ' + want + ')' };
  const ids = [];
  for (const k of keys) {
    if (seatKeys.indexOf(k) < 0) return { ok: false, why: '存在しない席 ' + k };
    const id = b.seats[k];
    if (typeof id !== 'string' || ids.indexOf(id) >= 0) return { ok: false, why: 'id 重複/不正 ' + id };
    if (F.ids.indexOf(id) < 0) return { ok: false, why: '存在しない id ' + id };
    if (F.unlocked.indexOf(id) < 0 && !(F.unlocked.length < S && F.nextLocked === id)) return { ok: false, why: '未解放 ' + id };
    ids.push(id);
  }
  if (F.frontier && ids.indexOf(F.frontier) < 0) return { ok: false, why: '本筋 ' + F.frontier + ' が無い' };
  return { ok: true, why: '' };
}
const setEq = (a, b) => a.length === b.length && a.slice().sort().join('|') === b.slice().sort().join('|');
const distinct = (v) => new Set(v).size === v.length;

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
  const TM = window.TAVERN_MAP;
  return {
    hasTM: !!TM, hasBoardFn: !!(TV && typeof TV.board === 'function'), hasRefresh: typeof window.__tavernRefreshSigns === 'function',
    board: (TV && TV.board) ? TV.board() : undefined,
    signs, doorShop: door('shop'), doorBack: door('back'), saved, cleared,
    shopEntryDom: !!se, shopEntryVis: se ? se.checkVisibility() : null,
    questDrawOn: document.body.classList.contains('questDrawOn'),
    mapOn: window.__tavernMapOn === true,
    tables: TM ? TM.TABLES.map((t) => ({ key: t.key, scenarioId: t.scenarioId, sign: t.sign.slice() })) : null,
    tile: TM ? TM.TILE : null,
    scen: (typeof scenarios !== 'undefined') ? scenarios.map((s) => ({ id: s.id, locked: !!s.locked, unlockAfter: s.unlockAfter || null, side: !!s.side })) : null,
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

  /* 種まき: 同じオリジンの空ページで storage を総入れ替え (⚠ 前口上の暗幕を消す prologueSeen と、#102 の闇市の時刻 21 時は常に立てる) */
  async function prep(o) {
    o = o || {};
    await page.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
    await page.evaluate((x, BK, CK, RK) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      sessionStorage.setItem('dragonfighters.plazaClock', '21');
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
  async function snap() { return page.evaluate(SNAP, BOARD_KEY, CLEARED_KEY); }
  async function open(q) {
    await page.goto(base + F_TAVERN + (q || ''), { waitUntil: 'load', timeout: 60000 });
    await waitReady();
    return snap();
  }
  /* 鍵だけ消して読み直す (= 次の引き)。cleared はそのまま */
  async function redraw(q) {
    await page.evaluate((BK) => localStorage.removeItem(BK), BOARD_KEY);
    return open(q || '');
  }
  /* 町へ出て、町が施設へ入るときと同じ作法で酒場へ戻る (town.html enterFacility) */
  async function viaTown() {
    await page.goto(base + 'town.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
    await sleep(300);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      page.evaluate(() => { sessionStorage.setItem('dragonfighters.enterVia', 'tavern'); location.href = 'tavern.html'; }),
    ]);
    await waitReady();
    return snap();
  }
  /* 1 枚の読み込みの「3 経路」(1d) を判定する。⛔ ここで期待値の盤面は作らない (三者の一致と席の位置だけ) */
  function threeRoutes(s) {
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
  const vals = (s) => (s.board && s.board.seats ? Object.values(s.board.seats) : []);
  const signsOnly = (s) => s.signs.map((x) => x.id + (x.locked ? '#L' : '') + '@' + x.left + ',' + x.top).sort().join(' ');
  const SC_ALL = [];   // (0c) で埋める (scenarios の素のデータ)
  const routes = [];   // (1d) の標本
  let onSnap = null;   // (3b) の ON
  let offSnap = null;  // (3b) の OFF

  try {
    /* ══════════ §0 ══════════ */
    await prep({});
    const s0 = await open('');
    SC_ALL.push(...(s0.scen || []));
    {
      /* #81 (0b) の持ち越し: 本筋 6 件は一本道 + 本筋の外 (side) 6 件 (#82 塔の母 / #103 巣穴 / #104 倉庫街 / #105 墓所 / #106 魔女の小屋 / #107 霜の巨人の砦) */
      const sc = SC_ALL.filter((x) => !x.side), sd = SC_ALL.filter((x) => x.side);
      const sdL = sd.filter((x) => x.locked), one = (id) => sd.filter((x) => x.id === id);
      const sdW = one(WARREN), sdC = one(CARGO), sdT = one(TOMB), sdH = one(HAG), sdG = one(GIANT);
      const chain = sc.length === 6 && !sc[0].locked && sc.slice(1).every((x, i) => x.locked && x.unlockAfter === sc[i].id)
        && sd.length === 6 && sdL.length === 5 && sdL.every((y) => sc.some((x) => x.id === y.unlockAfter))
        && sdW.length === 1 && !sdW[0].locked && !sdW[0].unlockAfter
        && sdC.length === 1 && sdC[0].locked && sdC[0].unlockAfter === sc[0].id
        && sdT.length === 1 && sdT[0].locked && sdT[0].unlockAfter === sc[1].id
        && sdH.length === 1 && sdH[0].locked && sdH[0].unlockAfter === sc[2].id
        && sdG.length === 1 && sdG[0].locked && sdG[0].unlockAfter === sc[4].id && SC_ALL.length === 12;
      R.check('(0c)', '[装置] scenarios が本筋 6 件の一本道 + 本筋の外 (side) 6 件 (' + WARREN + ' = locked なし / ' + CARGO + '・' + TOMB + '・' + HAG + '・' + GIANT + '・塔の母 = locked・前提は本筋)', chain,
        SC_ALL.map((x) => x.id + (x.side ? '[side]' : '') + (x.locked ? '<' + x.unlockAfter : '')).join(' → '));
    }
    const ID = SC_ALL.filter((x) => !x.side).map((x) => x.id);   // 本筋の一本道の並び ((0c) が守る)
    const F = (cl) => indepFacts(SC_ALL, cl);
    /* ★[#103] 撤退 ?warren=0 の世界。ページの scenarios から巣穴を外したもの */
    const SC_OFF = SC_ALL.filter((x) => x.id !== WARREN);
    const F0 = (cl) => indepFacts(SC_OFF, cl);
    const n0 = s0.board && s0.board.seats ? Object.keys(s0.board.seats).length : -1;
    R.check('(0a)', '[装置] window.TAVERN_MAP と __TAVERN_TV.board が在り、新規状態の盤面が ' + SIZE + ' 件',
      s0.hasTM && s0.hasBoardFn && n0 === SIZE && expCount(F([]), SIZE) === SIZE,
      { hasTM: s0.hasTM, hasBoardFn: s0.hasBoardFn, board: s0.board, expCount: expCount(F([]), SIZE) });
    {
      await prep({});
      const s = await open('?board3=0');
      const n = s.board && s.board.seats ? Object.keys(s.board.seats).length : -1;
      R.check('(0b)', '[装置] 撤退 ?board3=0 の新規状態の盤面が ' + SIZE_OFF + ' 件 (既定は ' + SIZE + ' 件 = 腕が別の世界を測っている)',
        s.hasBoardFn && n === SIZE_OFF && n0 === SIZE && expCount(F([]), SIZE_OFF) === SIZE_OFF, { board: s.board, defaultCount: n0 });
    }

    /* ══════════ §1 ══════════ */
    {
      /* ★[#120] 開始直後 = 解放済み {廃坑, 巣穴} の 2 件 + 次の未解放 (森) を ??? で 1 件 = 3 件 (全部強制 = 決定的) */
      const fx = F([]);
      const det = [];
      let ok = setEq(fx.unlocked, [ID[0], WARREN]) && fx.frontier === ID[0] && fx.nextLocked === ID[1] && expCount(fx, SIZE) === 3;
      if (!ok) det.push('[装置] 独立計算が前提と違う ' + J(fx));
      await prep({});
      for (let i = 0; i < N_1A; i++) {
        const s = i === 0 ? await open('') : await redraw('');
        routes.push(['1a#' + i, s]);
        const g = s.signs.find((x) => x.sid === ID[0]), w = s.signs.find((x) => x.sid === WARREN), f = s.signs.find((x) => x.sid === ID[1]);
        const one = s.signs.length === 3 && setEq(vals(s), [ID[0], WARREN, ID[1]]) && !!g && !!w && !!f
          && !g.locked && !w.locked && g.name !== '???' && w.name !== '???' && f.locked && f.name === '???'
          && indepValid(s.board, fx, seatKeysOf(s), SIZE).ok;
        if (!one) ok = false;
        det.push(s.signs.map((x) => x.sid + (x.locked ? '(L:' + x.name + ')' : '')).sort().join('+'));
      }
      R.check('(1a)', '新規状態を ' + N_1A + ' 回引く → 毎回 {' + ID[0] + ', ' + WARREN + ', ' + ID[1] + ' (???・.locked)} の 3 件ちょうど (' + ID[0] + ' と ' + WARREN + ' は押せる)',
        ok, det.join(' '));
    }
    {
      const det = [];
      /* 主: cleared=[廃坑] → 解放済み {廃坑, 森, 巣穴, 倉庫街} の 4 件から 本筋 (森) + 2 件 */
      const cl = [ID[0]];
      const fx = F(cl);
      let okMain = setEq(fx.unlocked, [ID[0], ID[1], WARREN, CARGO]) && fx.frontier === ID[1] && expCount(fx, SIZE) === 3;
      await prep({ cleared: cl });
      const row = [];
      for (let i = 0; i < N_1B; i++) {
        const s = i === 0 ? await open('') : await redraw('');
        routes.push(['1b#' + i, s]);
        const v = vals(s);
        const vv = indepValid(s.board, fx, seatKeysOf(s), SIZE);
        const one = v.length === 3 && v.indexOf(ID[1]) >= 0 && distinct(v) && v.every((x) => fx.unlocked.indexOf(x) >= 0)
          && s.signs.length === 3 && s.signs.every((x) => !x.locked) && vv.ok;
        if (!one) { okMain = false; row.push('✗' + v.join('+') + (vv.ok ? '' : '[' + vv.why + ']')); }
        else row.push(v.filter((x) => x !== ID[1]).sort().join('/'));
      }
      det.push('c1(本筋 ' + ID[1] + '): ' + row.join(','));
      /* #81 (1c) を 3 件へ: cleared 2〜5 本 → 本筋 + 解放済み 2 件・未解放の札 0 枚 */
      let okMid = true;
      for (let k = 2; k <= 5; k++) {
        const c = ID.slice(0, k);
        const f = F(c);
        await prep({ cleared: c });
        const r = [];
        for (let i = 0; i < N_1B_MID; i++) {
          const s = i === 0 ? await open('') : await redraw('');
          routes.push(['1b' + k + '#' + i, s]);
          const v = vals(s);
          const vv = indepValid(s.board, f, seatKeysOf(s), SIZE);
          const one = v.length === 3 && v.indexOf(f.frontier) >= 0 && distinct(v) && v.every((x) => f.unlocked.indexOf(x) >= 0)
            && s.signs.length === 3 && s.signs.every((x) => !x.locked) && vv.ok;
          if (!one) { okMid = false; r.push('✗' + v.join('+') + (vv.ok ? '' : '[' + vv.why + ']')); } else r.push('ok');
        }
        det.push('c' + k + '(本筋 ' + f.frontier + '): ' + r.join(','));
      }
      /* #81 (1b) の撤退腕を 3 件へ: ?cargo=0 → 解放済み {廃坑, 森, 巣穴} の 3 件 = 全部強制 */
      const SC_C0 = SC_ALL.filter((x) => x.id !== CARGO);
      const fxc = indepFacts(SC_C0, cl);
      let okC = setEq(fxc.unlocked, [ID[0], ID[1], WARREN]) && fxc.frontier === ID[1];
      await prep({ cleared: cl });
      for (let i = 0; i < N_1B_CARGO; i++) {
        const s = i === 0 ? await open('?cargo=0') : await redraw('?cargo=0');
        routes.push(['1bC#' + i, s]);
        const scenOk = !!s.scen && setEq(s.scen.map((x) => x.id), SC_C0.map((x) => x.id));
        const one = scenOk && setEq(vals(s), [ID[0], ID[1], WARREN]) && s.signs.length === 3 && s.signs.every((x) => !x.locked)
          && indepValid(s.board, fxc, seatKeysOf(s), SIZE).ok;
        if (!one) okC = false;
        det.push('cargo0:' + vals(s).sort().join('+') + (scenOk ? '' : '[scen≠]'));
      }
      R.check('(1b)', 'cleared=[' + ID[0] + '] を ' + N_1B + ' 回 → 3 件とも解放済み・本筋 ' + ID[1] + ' を含む・重複なし / cleared 2〜5 本 × ' + N_1B_MID
        + ' 回 → 本筋 + 解放済み 2 件 / 撤退 ?cargo=0 × ' + N_1B_CARGO + ' 回 → {' + ID[0] + ', ' + ID[1] + ', ' + WARREN + '} ちょうど', okMain && okMid && okC, det.join(' | '));
    }
    {
      const cl = ID.slice();
      const fx = F(cl);
      let ok = fx.frontier === null && fx.unlocked.length === 12 && expCount(fx, SIZE) === 3;   /* 本筋 6 + side 6 が全部解放済み */
      await prep({ cleared: cl });
      const row = [];
      for (let i = 0; i < N_1C; i++) {
        const s = i === 0 ? await open('') : await redraw('');
        routes.push(['1c#' + i, s]);
        const v = vals(s);
        const vv = indepValid(s.board, fx, seatKeysOf(s), SIZE);
        const one = v.length === 3 && distinct(v) && v.every((x) => fx.unlocked.indexOf(x) >= 0) && s.signs.length === 3
          && s.signs.every((x) => !x.locked) && vv.ok;
        if (!one) { ok = false; row.push('✗' + v.join('+') + (vv.ok ? '' : '[' + vv.why + ']')); } else row.push('ok');
      }
      R.check('(1c)', 'cleared = 本筋 6 本を ' + N_1C + ' 回引く → 本筋なし・3 件とも解放済み・重複なし', ok, row.join(','));
    }
    {
      /* ⭐ 依頼書 §2-2: ?warren=0 の開始直後は 解放済み {廃坑} + 次の未解放 {森} = 積める上限 2 件。
         「ちょうど BOARD_SIZE 件」を要求すると毎回不正 → 読み込むたび (= buildSigns のたび) 引き直しになる (変異 fixedcount) */
      const fx0 = F0([]);
      const det = [];
      let ok = fx0.unlocked.length === 1 && fx0.frontier === ID[0] && fx0.nextLocked === ID[1] && expCount(fx0, SIZE) === 2;
      if (!ok) det.push('[装置] 独立計算が前提と違う ' + J(fx0));
      await prep({});
      const a = await open('?warren=0');
      routes.push(['1e#open', a]);
      const g = a.signs.find((x) => x.sid === ID[0]), f = a.signs.find((x) => x.sid === ID[1]);
      const scenOk = !!a.scen && setEq(a.scen.map((x) => x.id), SC_OFF.map((x) => x.id));
      const first = scenOk && a.hasRefresh && a.signs.length === 2 && setEq(vals(a), [ID[0], ID[1]]) && !!g && !!f && !g.locked && g.name !== '???'
        && f.locked && f.name === '???' && indepValid(a.board, fx0, seatKeysOf(a), SIZE).ok;
      if (!first) ok = false;
      const want = J(a.board), wantSaved = a.saved, wantSigns = signsOnly(a);
      det.push('open nonce=' + (a.board && a.board.nonce) + ' ' + vals(a).join('+') + (first ? '' : ' ✗[refresh=' + a.hasRefresh + ' scen=' + scenOk + ']'));
      for (let i = 0; i < N_1E_REFRESH; i++) {
        await page.evaluate(() => { window.__tavernRefreshSigns(); });
        await sleep(80);
        const s = await snap();
        routes.push(['1e#refresh' + i, s]);
        const one = J(s.board) === want && s.saved === wantSaved && signsOnly(s) === wantSigns;
        if (!one) ok = false;
        det.push('refresh' + i + (one ? '=' : '≠' + (s.board && s.board.nonce) + ':' + vals(s).join('+')));
      }
      {
        const s = await open('?warren=0');
        routes.push(['1e#reload', s]);
        const one = J(s.board) === want && s.saved === wantSaved && signsOnly(s) === wantSigns;
        if (!one) ok = false;
        det.push('reload' + (one ? '=' : '≠' + (s.board && s.board.nonce)));
      }
      R.check('(1e)', '⭐ §2-2: ?warren=0 の新規状態で盤面が 2 件 (' + ID[0] + ' + ??? ' + ID[1] + ')・__tavernRefreshSigns() を ' + N_1E_REFRESH + ' 回 + 再読み込み 1 回で nonce が変わらない',
        ok, det.join(' '));
    }
    {
      /* 旧 2 件の保存値 (#81 の世界 = ?board3=0 で妥当) は 3 件の世界で ① に落ち、既存の道で 1 回だけ引き直す (移行処理なし・依頼書 §2-3) */
      const olds = [
        { nm: '新規', cleared: [], board: { v: 1, seats: { t1: ID[0], t2: WARREN }, nonce: 'OLD2-new' } },
        { nm: 'c1', cleared: [ID[0]], board: { v: 1, seats: { t1: ID[1], t3: WARREN }, nonce: 'OLD2-c1' } },
      ];
      const det = []; let ok = true;
      for (const o of olds) {
        const fx = F(o.cleared);
        const pre2 = indepValid(o.board, fx, ['t1', 't2', 't3'], SIZE_OFF), pre3 = indepValid(o.board, fx, ['t1', 't2', 't3'], SIZE);
        if (!pre2.ok || pre3.ok) { ok = false; det.push('[装置] ' + o.nm + ' の種が「2 件で妥当・3 件で不正」でない'); continue; }
        await prep({ cleared: o.cleared, board: J(o.board) });
        const s = await open('');
        routes.push(['1f' + o.nm + '#1', s]);
        let sv = null; try { sv = JSON.parse(s.saved); } catch (e) {}
        const vv = indepValid(s.board, fx, seatKeysOf(s), SIZE);
        const one = !!s.board && s.board.nonce !== o.board.nonce && vals(s).length === 3 && (!fx.frontier || vals(s).indexOf(fx.frontier) >= 0)
          && vv.ok && s.saved === J(s.board) && !!sv && Object.keys(sv.seats || {}).length === 3;
        const s2 = await open('');
        routes.push(['1f' + o.nm + '#2', s2]);
        const two = J(s2.board) === J(s.board) && s2.saved === s.saved;
        if (!one || !two) ok = false;
        det.push(o.nm + ': ' + o.board.nonce + ' → ' + (s.board && s.board.nonce) + ' ' + vals(s).join('+') + (one ? '' : ' ✗[' + vv.why + ']')
          + ' / 再読込 ' + (two ? '=' : '≠' + (s2.board && s2.board.nonce)));
      }
      R.check('(1f)', '旧 2 件の保存値 (本筋 + 1 件) → 読み込み後は 3 件・本筋入り・保存値も 3 件に上書き / もう 1 回読み込むと nonce 不変 (新規 / cleared=[' + ID[0] + '])',
        ok, det.join(' | '));
    }
    {
      /* 依頼から戻った後だけ引き直す (#81 の非退行)。種 = 新規状態で妥当な 3 件 */
      const seed = { v: 1, seats: { t1: ID[1], t2: ID[0], t3: WARREN }, nonce: 'SEED' };
      const str = J(seed);
      const det = [];
      let ok = indepValid(seed, F([]), ['t1', 't2', 't3'], SIZE).ok;
      if (!ok) det.push('[装置] 種が独立計算で妥当でない');
      /* (i) 妥当な種の採用 (#81 (2b)) — 新規状態 / cleared 3 本 */
      const seedC3 = { v: 1, seats: { t3: ID[3], t1: ID[2], t2: CARGO }, nonce: 'SEED-c3' };
      if (!indepValid(seedC3, F(ID.slice(0, 3)), ['t1', 't2', 't3'], SIZE).ok) { ok = false; det.push('[装置] 種 c3 が独立計算で妥当でない'); }
      {
        await prep({ cleared: ID.slice(0, 3), board: J(seedC3) });
        const s = await open('');
        const one = J(s.board) === J(seedC3) && s.saved === J(seedC3) && setEq(s.signs.map((x) => x.sid), Object.values(seedC3.seats));
        if (!one) ok = false;
        det.push('SEED-c3 ' + (one ? '採用' : '✗ board=' + J(s.board)));
      }
      await prep({ cleared: [], board: str });
      const a = await open('');
      const adopted = J(a.board) === str && a.saved === str && setEq(a.signs.map((x) => x.sid), Object.values(seed.seats));
      if (!adopted) ok = false;
      det.push('SEED ' + (adopted ? '採用' : '✗ board=' + J(a.board)));
      /* (ii) 戻ってこない読み込みでは 1 文字も変わらない (#81 (2a)) */
      const wantSigns = signsOnly(a);
      for (let i = 0; i < N_1G_RELOAD; i++) {
        const s = await open('');
        const one = J(s.board) === str && s.saved === str && signsOnly(s) === wantSigns;
        if (!one) ok = false;
        det.push('reload' + i + (one ? '=' : '≠' + (s.board && s.board.nonce)));
      }
      for (let i = 0; i < N_1G_TOWN; i++) {
        const s = await viaTown();
        const one = J(s.board) === str && s.saved === str && signsOnly(s) === wantSigns;
        if (!one) ok = false;
        det.push('town' + i + (one ? '=' : '≠' + (s.board && s.board.nonce)));
      }
      /* (iii) 帰還 4 通りでは引き直す (#81 (3a)) */
      const cases = [
        { cleared: true, scenarioId: ID[0] },
        { defeated: true, scenarioId: ID[0] },
        { retreated: true, scenarioId: ID[0] },
        { cleared: true, scenarioId: 'generated-quest' },
      ];
      for (const r of cases) {
        await prep({ cleared: [], board: str, result: r });
        const s = await open('');
        const cl = s.cleared || [];
        /* 装置: 帰還が消費された (cleared の帰還は廃坑が cleared に入る / 生成クエストと敗北・撤退は入らない) */
        const consumed = (r.cleared && r.scenarioId === ID[0]) ? cl.indexOf(ID[0]) >= 0 : cl.length === 0;
        const vv = indepValid(s.board, F(cl), seatKeysOf(s), SIZE);
        const one = !!s.board && s.board.nonce !== 'SEED' && vv.ok && consumed && s.saved === J(s.board);
        if (!one) ok = false;
        det.push(Object.keys(r)[0] + ':' + r.scenarioId + ' → nonce=' + (s.board && s.board.nonce) + (vv.ok ? '' : ' [' + vv.why + ']') + (consumed ? '' : ' [未消費]'));
      }
      R.check('(1g)', '依頼から戻った後だけ nonce が変わる: 妥当な 3 件の種が採用 → 再読込 ' + N_1G_RELOAD + ' 回・町へ出て戻る ' + N_1G_TOWN
        + ' 回で不変 → lastResult 4 通り (cleared / defeated / retreated / generated-quest) で引き直す', ok, det.join(' '));
    }
    {
      const det = []; let ok = true;
      for (const k of [3, 4]) {
        const cl = ID.slice(0, k);
        const fx = F(cl);
        const fr = fx.frontier, lk = fx.nextLocked;
        const bads = [
          ['本筋欠け', { t1: ID[0], t2: ID[1], t3: WARREN }],
          ['未解放', { t1: fr, t2: lk, t3: ID[0] }],
          ['2件', { t1: fr, t2: ID[0] }],
          ['存在しない席', { t1: fr, t2: ID[0], t9: ID[1] }],
          ['id重複', { t1: fr, t2: fr, t3: ID[0] }],
          ['存在しないid', { t1: fr, t2: ID[0], t3: 'no-such-quest' }],
        ];
        for (const [nm, seats] of bads) {
          const bd = { v: 1, seats, nonce: 'SEED' };
          const pre = indepValid(bd, fx, ['t1', 't2', 't3'], SIZE);
          if (pre.ok) { ok = false; det.push('[装置] c' + k + ' ' + nm + ' が独立計算で妥当になってしまう'); continue; }
          await prep({ cleared: cl, board: J(bd) });
          const s = await open('');
          const vv = indepValid(s.board, fx, seatKeysOf(s), SIZE);
          const one = !!s.board && s.board.nonce !== 'SEED' && vv.ok && s.saved === J(s.board);
          if (!one) { ok = false; det.push('✗c' + k + ' ' + nm + ' → ' + J(s.board) + (vv.ok ? '' : ' [' + vv.why + ']')); }
          else det.push('c' + k + ' ' + nm + ' → ' + vals(s).join('+'));
        }
      }
      R.check('(1h)', '妥当でない種 6 種 (本筋欠け / 未解放 / 2 件 / 存在しない席 / id 重複 / 存在しない id) を cleared 3 本 / 4 本でまく → 12 回とも捨てて引き直す (引き直した盤面も妥当)',
        ok, det.join(' | '));
    }
    {
      const bad = routes.map(([n, s]) => [n, threeRoutes(s)]).filter((x) => !x[1].ok);
      const plan = N_1A + N_1B + 4 * N_1B_MID + N_1B_CARGO + N_1C + (1 + N_1E_REFRESH + 1) + 2 * 2;
      R.check('(1d)', '3 経路: §1 の全 ' + routes.length + ' 読み込みで DOM の札 === board().seats === localStorage の保存値 (+ 各札が自分の席)',
        routes.length === plan && bad.length === 0,
        bad.length ? bad.slice(0, 4).map((x) => x[0] + ': ' + x[1].why).join(' | ') : routes.length + ' 読み込みすべて一致 (予定 ' + plan + ')');
    }

    /* ══════════ §2 — 撤退 ?board3=0 の腕で #81 の主張 ══════════ */
    {
      const Q = '?board3=0';
      const det = []; let ok = true;
      const sub = (nm, good, d) => { if (!good) ok = false; det.push((good ? '' : '✗') + nm + ': ' + d); };
      /* #81 (1a)・★[#103]: 新規 = {廃坑, 巣穴} の 2 件 (両方押せる) */
      {
        const fx = F([]);
        let g = expCount(fx, SIZE_OFF) === 2; const r = [];
        await prep({});
        for (let i = 0; i < N_2A; i++) {
          const s = i === 0 ? await open(Q) : await redraw(Q);
          const one = setEq(vals(s), [ID[0], WARREN]) && s.signs.length === 2 && s.signs.every((x) => !x.locked && x.name !== '???')
            && indepValid(s.board, fx, seatKeysOf(s), SIZE_OFF).ok && threeRoutes(s).ok;
          if (!one) g = false;
          r.push(vals(s).sort().join('+'));
        }
        sub('新規', g, r.join(','));
      }
      /* #81 (1a) の撤退腕 (#82 までの姿): ?warren=0 → {廃坑 (押せる), 森 (???・.locked)} = ??? 埋め */
      {
        const fx0 = F0([]);
        let g = expCount(fx0, SIZE_OFF) === 2; const r = [];
        await prep({});
        for (let i = 0; i < N_2A; i++) {
          const s = i === 0 ? await open(Q + '&warren=0') : await redraw(Q + '&warren=0');
          const gg = s.signs.find((x) => x.sid === ID[0]), f = s.signs.find((x) => x.sid === ID[1]);
          const one = s.signs.length === 2 && !!gg && !!f && !gg.locked && gg.name !== '???' && f.locked && f.name === '???'
            && indepValid(s.board, fx0, seatKeysOf(s), SIZE_OFF).ok && threeRoutes(s).ok;
          if (!one) g = false;
          r.push(s.signs.map((x) => x.sid + (x.locked ? '(L:' + x.name + ')' : '')).sort().join('+'));
        }
        sub('warren0', g, r.join(','));
      }
      /* #81 (1b): cleared=[廃坑] → {森 (本筋), 廃坑 か 巣穴 か 倉庫街} */
      {
        const cl = [ID[0]], fx = F(cl);
        let g = true; const r = [];
        await prep({ cleared: cl });
        for (let i = 0; i < N_2A; i++) {
          const s = i === 0 ? await open(Q) : await redraw(Q);
          const v = vals(s), other = v.filter((x) => x !== ID[1]);
          const one = v.length === 2 && v.indexOf(ID[1]) >= 0 && other.length === 1 && [ID[0], WARREN, CARGO].indexOf(other[0]) >= 0
            && s.signs.length === 2 && s.signs.every((x) => !x.locked) && indepValid(s.board, fx, seatKeysOf(s), SIZE_OFF).ok && threeRoutes(s).ok;
          if (!one) g = false;
          r.push(v.join('+'));
        }
        sub('c1', g, r.join(','));
      }
      /* #81 (1c): cleared 2〜5 本 → 本筋 + 解放済み 1 件 */
      {
        let g = true; const r = [];
        for (let k = 2; k <= 5; k++) {
          const cl = ID.slice(0, k), fx = F(cl);
          await prep({ cleared: cl });
          for (let i = 0; i < N_2A_MID; i++) {
            const s = i === 0 ? await open(Q) : await redraw(Q);
            const v = vals(s), other = v.filter((x) => x !== fx.frontier);
            const one = v.length === 2 && v.indexOf(fx.frontier) >= 0 && other.length === 1 && fx.unlocked.indexOf(other[0]) >= 0
              && s.signs.length === 2 && s.signs.every((x) => !x.locked) && indepValid(s.board, fx, seatKeysOf(s), SIZE_OFF).ok;
            if (!one) g = false;
            r.push('c' + k + ':' + v.join('+'));
          }
        }
        sub('c2-5', g, r.join(','));
      }
      /* #81 (1d): cleared 6 本 → 本筋なし・解放済み 2 件・重複なし */
      {
        const cl = ID.slice(), fx = F(cl);
        let g = true; const r = [];
        await prep({ cleared: cl });
        for (let i = 0; i < N_2A_MID; i++) {
          const s = i === 0 ? await open(Q) : await redraw(Q);
          const v = vals(s);
          const one = v.length === 2 && distinct(v) && v.every((x) => fx.unlocked.indexOf(x) >= 0) && s.signs.length === 2
            && indepValid(s.board, fx, seatKeysOf(s), SIZE_OFF).ok;
          if (!one) g = false;
          r.push(v.join('+'));
        }
        sub('c6', g, r.join(','));
      }
      /* #81 (2b): 2 件の世界で妥当な種 3 つがそのまま採用 */
      {
        const seeds = [
          { cleared: [], board: { v: 1, seats: { t3: ID[0], t2: WARREN }, nonce: 'SEED-2a-new' }, q: Q },
          { cleared: [], board: { v: 1, seats: { t3: ID[0], t2: ID[1] }, nonce: 'SEED-2a-new-off' }, q: Q + '&warren=0', off: true },
          { cleared: ID.slice(0, 3), board: { v: 1, seats: { t3: ID[3], t1: ID[2] }, nonce: 'SEED-2a-c3' }, q: Q },
        ];
        let g = true; const r = [];
        for (const sd of seeds) {
          const pre = indepValid(sd.board, (sd.off ? F0 : F)(sd.cleared), ['t1', 't2', 't3'], SIZE_OFF);
          if (!pre.ok) { g = false; r.push('[装置] 種が妥当でない ' + pre.why); continue; }
          const str = J(sd.board);
          await prep({ cleared: sd.cleared, board: str });
          const s = await open(sd.q);
          const one = J(s.board) === str && s.saved === str && setEq(s.signs.map((x) => x.sid), Object.values(sd.board.seats));
          if (!one) g = false;
          r.push(sd.board.nonce + (one ? ' 採用' : ' ✗=' + (s.board && s.board.nonce)));
        }
        sub('種', g, r.join(','));
      }
      R.check('(2a)', '撤退 ?board3=0 の腕で #81 の主張が今どおり (新規 {' + ID[0] + ', ' + WARREN + '} / ?warren=0 で ??? 埋め / cleared 1〜5 本 = 本筋 + 1 件 / 6 本 = 2 件 / 2 件の種の採用)',
        ok, det.join(' | '));
    }

    /* ══════════ §4 (#81 の (4a)〜(4d) をそのまま) ══════════ */
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

    /* ══════════ §3 — 撤退 ?questdraw=0 (#81 (5a)(5b)) ══════════ */
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
      R.check('(3a)', '?questdraw=0 → 札 3 枚 = TABLES の scenarioId (廃坑/森/沼地) が TABLES の席どおり・board() null・「' + BACK_NAME + '」が奥の間を開く・shop の扉なし・#shopEntry が見える',
        seatOk && fixed && s.board === null && !s.questDrawOn && !!s.doorBack && s.doorBack.name === BACK_NAME && !s.doorShop
          && s.shopEntryDom && s.shopEntryVis === true && !!back && back.on === true && back.open === true && back.shop !== 'flex',
        { signs: s.signs.map((x) => x.id), fixed, board: s.board, back: s.doorBack, shop: s.doorShop, vis: s.shopEntryVis, opened: back });
    }
    {
      const P = (s) => {
        if (!s) return [null, null, null];
        const p1 = !!(s.board && s.board.seats) && threeRoutes(s).ok;
        const p2 = !!s.doorShop && s.doorShop.name === SHOP_NAME && !s.doorBack;
        const p3 = !!s.shopEntryDom && s.shopEntryVis === false;
        return [p1, p2, p3];
      };
      const on = P(onSnap), off = P(offSnap);
      R.check('(3b)', '(1d)(4a)(4c) の 3 条件を ON/OFF へ当てて全部反転 (ON = true×3 / OFF = false×3)',
        on.every((x) => x === true) && off.every((x) => x === false), { on, off });
    }

    /* ══════════ (0d) ══════════ */
    R.check('(0d)', '[装置] 全ページで pageerror 0 件', ctx.booted > 0 && ctx.errs.length === 0, '起動 ' + ctx.booted + ' 回 / pageerror ' + J(ctx.errs.slice(0, 3)));
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
          const want = NEG_EXPECT[key];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const also = red.filter((x) => want.indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = hit > 0 && miss.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)')
            + (also.length ? ' (担当外の赤 ' + also.join(',') + ' = 記録のみ)' : '') + ' / 注入行の実行 ' + hit + ' 回 → '
            + (ok ? '✓ OK' : '✗ ' + (hit ? '' : '注入行が実行されていない ') + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, red, also, ok, hit });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (担当 ⊆ 赤)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(13) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)')
          + (r.also.length ? ' (担当外 ' + r.also.join(',') + ')' : '') + ' / 注入行 ' + r.hit + ' 回');
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当の節が赤・注入行はすべて実行');
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
