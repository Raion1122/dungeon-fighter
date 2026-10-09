#!/usr/bin/env node
/*
 * verify_tower_mother_b.js — 実装依頼書 #83「塔の母」B (母が小部屋から出てきて一緒に帰り、酒場で息子と迎える) の受入ドライバ
 *   (依頼書 2026-10-04_tower-mother-b.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_tower_mother_b.js                         # 素
 *   node tools/verify_tower_mother_b.js --negative              # 変異 11 本 (port 10556〜10566)。先に素の基準を走らせる
 *   node tools/verify_tower_mother_b.js --negative --only nomark,everytime
 *   node tools/verify_tower_mother_b.js --mutate backexit       # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 随伴は**本番の流れで観測**する。ワイバーン 2 匹は #82 の受入 (verify_tower_mother) と同じ口で追い払う
 *     (手番の関数 playerAttackTurn / allyAttackTurn / enemyAttackTurn だけ差し替え、数値の HP を注入)。
 *     ⛔ 随伴のコード (tickTowerMother・checkDungeonClear のゲート・tickNodeChoice・経路) は差し替えない。
 *   - (1f) の数え方 = enterNode('n1') の**後**に enterNode / chooseExit / showExitArrows を「数えるだけ」の包みで包む
 *     (前に包むと入室そのものを数える)。⚠ 出口の冷却を装置にしない (入口で返すのが本番・依頼書 §12-0 K4)。
 *   - (2a) 詰み防止 = 主人公が階段の口に着かない装置: follow が始まったら heroForcedGoal を「その時の主人公のタイル」へ
 *     付け替え続ける (⭐ 母の経路を壊すだけでは母が足跡へ寄せられて詰まない = 項目2a の申し送り)。
 *     上限 (本番 90 秒〜・止まっていない時間だけ) を本当に待つので 1 腕 2 分超。上限の秒数は測らない (doneBy だけ)。
 *   - 酒場は lastResult を sessionStorage に実際に置いて開き、本番の consumeResult() から通す。
 *     「2 回目」は同じタブで lastResult を置き直して reload (sessionStorage はタブ単位)。
 *   - (3c) ⚠ 変異 intavern では TAVERN.length も 10 になる ⇒「.npcUnit の数 = TAVERN.length」だけでは永久緑。
 *     reunion().keys が空 + [data-npc=harold] / [data-npc=towerMother] が無いことを併せて見る。
 *   - (3e) ⚠ K16: compact (390x844) では息子の要素の中心が画面外 ⇒ 要素の**画面内の部分**の中心を押す。
 *   - (3g) ⚠ boardFacts().unlocked は塔の母が解放される進行 (unlockAfter までクリア) を種に入れないと空振りする
 *     ⇒ 種に入れた上で、対照 (unlockAfter の 1 本手前まで) では unlocked に無いことも見る (空振りで緑にしない)。
 *   - 乱数は固定しない。札の抽選 (K7) は validate に実 DOM の札を渡すので盤面に依らない。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] __towerMotherTV.mother / holds / active と __TAVERN_TV.reunion が見える
 *      (0b) [装置] 追い払いの後に随伴が起動し phase が "hidden" 以外へ動いた
 *      (0c) [装置] 全ページで pageerror 0 件 (本ドライバ独自の追加)
 *   §1 (1a) 最後のワイバーンが去ってから phase === "done" まで dungeonCleared は偽のまま (シームの phase と本番の
 *           dungeonCleared の 2 経路)・done の後に dungeonCleared が立つ
 *      (1b) 母の DOM (#towerMother) が #nodeLayer の中・見えている・背景の Y が 3 段目 (-288px)・背景画像の範囲内
 *      (1c) 母は敵配列に居ない (enemies の長さが入室後〜制覇まで不変・enemies に母の状態が無い・enemyElements に母の DOM が無い)
 *      (1d) 母の台詞 2 件 (tower.mother.meet / tower.mother.follow) が __speech.log (実際に表示したもの) に載る
 *      (1e) done の時点で主人公が n1 の mapDef.start に居て、母が主人公からチェビシェフ 2 以内・doneBy "arrived" (上限ではない)
 *      (1f) 随伴の間 enterNode / chooseExit / showExitArrows の呼び出し 0・現在ノードは n1 のまま・#choiceDialog が出ない
 *      (1g) 随伴の間 撤退ボタンが disabled (全標本)・disabled を外して押しても撤退が始まらない (クリックの条件)
 *      (1h) done の後 今の流れでクリア: lastResult.cleared・scenarioId tower-mother・reward.gold − coins = clearGold (300) + 道中の宝箱の補填 (#87: 75) = 375
 *   §2 (2a) 主人公が階段の口に着かない盤面でも、上限で done (doneBy "cap") になりクリアする
 *   §3 (3a) tower-mother のクリアを置いて酒場を開く → 印 "1"・[data-npc=harold] と [data-npc=towerMother] が在る
 *      (3b) 初回は再会の吹き出しが順に 3 件 (harold → towerMother → harold)。同じ保存で 2 回目は母子は居るが場面 0 件
 *      (3c) 印が無い保存では母子が居ない (keys 空・要素なし)・.npcUnit の数 = TAVERN.length
 *      (3d) NPC_CROWD.validate(REUNION, TAVERN_MAP, 実 DOM の札) が ok (desktop / compact)
 *      (3e) 母子を押すと自分の say が出て主人公が歩き出さない (desktop / compact。compact は画面内の部分を押す)
 *      (3f) 他のシナリオのクリアで戻っても印は立たない
 *      (3g) クリア後も tower-mother は boardFacts().unlocked に在る (対照: 解放前の進行では無い)
 *   §4 (4a) index.html?towermother=0 で母が出ず (phase null・DOM なし)、そのまま制覇・帰還
 *      (4b) tavern.html?towermother=0 で印ありの保存でも母子が生えない・場面が出ない・印は消えない
 *      (4c) (0b)(3a)(4a) の条件を ON/OFF の両方へ当てて反転 (ON = [true,true,false] / OFF = [false,false,true])
 *   ⛔ 測らないこと (依頼書 §8): 母の歩く速さ・吹き出しの文面・土埃と揺れの見た目・上限時間の秒数・礼金の額の妥当性
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html / tavern.html / js/npc-crowd.js は**起動時に 1 回だけ readFileSync して凍結**し、
 *     変異はその文字列をメモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *   - 素と各変異はポート = オリジンが違う ⇒ localStorage は混ざらない。
 *   - 起動時に全変異のアンカーを**原本**で検算する (配信 3 ファイル + town.html / world.html の合算でちょうど 1 件・
 *     注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *   - 罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持つ (なるべく欠陥が効く枝でだけ鳴る)。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」+ 注入行の実行 > 0。
 *     担当は**実走で決めた** (--mutate で 1 本ずつ・依頼書 §12-3)。
 *   - ⛔ git を読まない ⇒ 影のツリー / clone でもそのまま走る。⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0` (verify_tower_mother と同じ型)。
 *
 * ■ ポート = **10555** (素) / 変異 **10556〜10566** (11 本・MUTATIONS の並び順)。次の新規ドライバ base = 10567。
 * ■ 所要 (2026-10-05 この機械の実測・HEAD 96298f0) = 素 約 340〜365 秒 (22 assert・塔 3 腕 = 主 / 詰み (2a) / 撤退 +
 *   酒場 9 枚) / --negative 約 4,150 秒 (素の基準 + 変異 11 本。asenemy 613 秒・nofailopen 463 秒が長い)。
 * ■ 担当表は実走で確定 (依頼書 §12-3)。予想の節は 11 本すべて含み、7 本は「随伴が done に届かない」連鎖で広い。
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
const PORT = parseInt(arg('port', '10555'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前 (データ。期待値の写しではない) */
const TOWER = 'tower-mother';
const REUNION_KEYS = ['harold', 'towerMother'];
const SCENE_ORDER = ['harold', 'towerMother', 'harold'];   // 依頼書 §5-3 の 3 件の話し手
const CLEAR_GOLD = 300;                                    // 依頼書 §1「既存の礼金 (clearGold 300G) を動かさない」
/* ★[#87] 道中の宝箱を廃止したぶんの補填 (index.html ROAD_CHEST_GOLD['tower-mother'] = 隠し宝箱 3 × 25G)。勝利時に礼金へ足して払う
 *   (SCENARIOS の clearGold 300 は動かさない)。撤退 ?roadchest=0 なら 0。⛔ ページから読まず数値で持つ (読むと補填が消えても緑)。 */
const ROAD_CHEST_BONUS = 75;
const ROW3_Y = -288;                                       // 老婆のシートの 3 段目 (依頼書 §2-1 ①)
const SHEET = { w: 576, h: 384, cell: 96 };
const VIEW_I = { width: 1280, height: 800 };
const VIEWS_T = { desktop: { width: 1440, height: 900 }, compact: { width: 390, height: 844 } };
const ENC_START_WAIT_MS = 90000;    // #82 K14: 入室の語りの待ちで 23 秒前後
const ENC_END_WAIT_MS = 100000;
const OBS_MAIN_MS = 200000;         // 終戦 → 帰還の観測の上限 (素は 52〜58 秒 = 依頼書 §12-1)。⛔ 合否ではない
const OBS_STUCK_MS = 240000;        // (2a) 上限 (follow の止まっていない時間 90 秒〜) + emerge〜talk + 帰還
const OBS_OFF_MS = 60000;
const SCENE_WATCH_MS = 12500;       // 場面は NPC が生えてから 0.9 / 4.9 / 8.9 秒
const QUIET_WATCH_MS = 10000;

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html', F_TAVERN = 'tavern.html', F_CROWD = 'js/npc-crowd.js';
const SERVED = [F_INDEX, F_TAVERN, F_CROWD];
const COUNTED = SERVED.concat(['town.html', 'world.html']);   // 一意性の検算だけに使う (npc-crowd.js を読む画面)
const PRISTINE = {};
for (const f of COUNTED) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 11 本)。逐語は HEAD 96298f0 (項目2b の実装後) の行で取った。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const MUTATIONS = {
  /* 罠 1: tickNodeChoice の入口の 1 行を外す。印は「随伴中に入口を素通りした」とき */
  backexit: [
    { file: F_INDEX, from: 'if (towerMotherActive()) return;                    // ★[#83] 塔の母の随伴中は出口 (n1 にも出る「引き返す」) を選ばない (罠 1)',
      to: 'if (towerMotherActive()) ' + HIT('backexit') + ';   /* ★変異backexit */' }],
  /* 罠 2: 撤退の 2 か所 (クリック / 見た目) から随伴中を外す。⚠ 見た目の行は前行に ; が無いので式のまま残す */
  retreatopen: [
    { file: F_INDEX, from: 'if (towerMotherActive()) return;   // ★[#83] 塔の母の随伴中は撤退させない (罠 2)',
      to: 'if (towerMotherActive()) ' + HIT('retreatopen') + ';   /* ★変異retreatopen */' },
    { file: F_INDEX, from: '|| towerMotherActive();   // ★[#83] 塔の母の随伴中も撤退できない見た目に (罠 2)',
      to: '|| (towerMotherActive() && (' + HIT('retreatopen') + ', false));   /* ★変異retreatopen */' }],
  /* 罠 3: follow の上限を外す。印は上限に達したとき (1 回) */
  nofailopen: [
    { file: F_INDEX, from: 'if (m.followMs >= m.capMs) { towerMotherFinish("cap"); return; }   // ★[#83] 上限 = 詰み防止 (罠 3)',
      to: 'if (m.followMs >= m.capMs && !m.__mutCap) { m.__mutCap = 1; ' + HIT('nofailopen') + '; }   /* ★変異nofailopen */' }],
  /* checkDungeonClear のゲートを外す。印は制覇の条件が揃ったとき */
  nogate: [
    { file: F_INDEX, from: 'if (towerMotherHolds()) return;   // ★[#83] 塔の母が階段の口に着くまで制覇を待つ (撤退 ?towermother=0 では常に false)',
      to: HIT('nogate') + ';   /* ★変異nogate */' }],
  /* §2-1: 母を敵配列へ足す (起動のラッチで実行時に push) */
  asenemy: [
    { file: F_INDEX, from: '      towerMother = m;',
      to: '      towerMother = m; enemies.push(m); ' + HIT('asenemy') + ';   /* ★変異asenemy */' }],
  /* §2-1 ①: 母の背景の Y を 0 段目に (透明になる罠)。段の出所はこの 1 定数だけ (印は読み込み時) */
  rowzero: [
    { file: F_INDEX, from: 'const TOWER_MOTHER_ROW_Y = -288;',
      to: 'const TOWER_MOTHER_ROW_Y = (' + HIT('rowzero') + ', 0);' }],
  /* 母の DOM を #nodeLayer でなく body へ (遷移で消えない) */
  nonodelayer: [
    { file: F_INDEX, from: 'nodeLayer.appendChild(el);   // ★[#83] 母の DOM はノード寿命 (#nodeLayer = 遷移で一掃)',
      to: 'document.body.appendChild(el); ' + HIT('nonodelayer') + ';   /* ★変異nonodelayer */' }],
  /* consumeResult() の印の 1 行を外す。印は tower-mother のクリアで戻ったとき */
  nomark: [
    { file: F_TAVERN, from: 'if (r.scenarioId === "tower-mother") markTowerMotherHome();   // ★[#83] 印だけ (DOM は作らない)',
      to: 'if (r.scenarioId === "tower-mother") ' + HIT('nomark') + ';   /* ★変異nomark */' }],
  /* 「初回だけ」の判定を外す。印は既に印があったのに pending を立てたとき */
  everytime: [
    { file: F_TAVERN, from: 'if (!wasHome) window.__towerReunionPending = true;',
      to: 'if (wasHome) ' + HIT('everytime') + '; window.__towerReunionPending = true;' }],
  /* REUNION を TAVERN へ混ぜる (印は読み込み時) */
  intavern: [
    { file: F_CROWD, from: 'TAVERN: TAVERN, TOWN: TOWN, REUNION: REUNION,',
      to: 'TAVERN: (' + HIT('intavern') + ', TAVERN.concat(REUNION)), TOWN: TOWN, REUNION: REUNION,' }],
  /* 酒場の撤退スイッチを外す。印は ?towermother=0 なのに有効と答えたとき */
  noretire: [
    { file: F_TAVERN, from: 'try { return new URLSearchParams(location.search).get("towermother") !== "0"; } catch (e) { return true; }',
      to: 'try { if (new URLSearchParams(location.search).get("towermother") === "0") ' + HIT('noretire') + '; return true; } catch (e) { return true; }' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-3)。 */
/* ⚠ 依頼書の予想より広い 7 本 (依頼書 §12-3 K20〜): 予想の節は全部含む。広がりは「随伴が done に届かない」連鎖
 *   backexit    … 終戦の 61ms 後 (hidden の間・heroForcedGoal がまだ無い) に ② が走り chooseExit + 矢印 = dialogPaused で
 *                 ゲームごと止まる ⇒ 母が出ず done も制覇も来ない ((0b)(1a)〜(1h)(4c))。(2a) の腕も同じく止まる
 *   retreatopen … (1g) の押下で撤退が始まる ⇒ 観測を打ち切る ⇒ done も帰還も無い ((1a)(1e)(1f)(1h))
 *   nogate      … 母が 1 度も起動しない ⇒ 母に依存する節が全部空 ((0b)(1a)〜(1h)(2a)(4c))
 *   asenemy     … 生きた母が敵配列に居る ⇒ 勝利判定が永久に偽 = 帰還なし + renderWorld が enemyElements[i] の
 *                 style を読んで pageerror ((0c)) + 吹き出しが出ない ((1d))
 *   nomark      … 母子が生えない ⇒ 場面・押す (desktop)・(4c) の ON も赤
 *   intavern    … 母子が全画面で常駐 (印ありは 2 重) ⇒ (3a)(3b)(3e)(3f)(4b)(4c) も赤
 *   noretire    … (4c) の OFF の酒場で印が立ち母子が生える */
const MOTHER_CHAIN = ['(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(1h)'];
const NEG_EXPECT = {
  backexit:    ['(0b)'].concat(MOTHER_CHAIN, ['(2a)', '(4c)']),
  retreatopen: ['(1a)', '(1e)', '(1f)', '(1g)', '(1h)'],
  nofailopen:  ['(2a)'],
  nogate:      ['(0b)'].concat(MOTHER_CHAIN, ['(2a)', '(4c)']),
  asenemy:     ['(0c)', '(1a)', '(1c)', '(1d)', '(1e)', '(1g)', '(1h)', '(2a)'],
  rowzero:     ['(1b)'],
  nonodelayer: ['(1b)'],
  nomark:      ['(3a)', '(3b)', '(3e)', '(4c)'],
  everytime:   ['(3b)'],
  intavern:    ['(3a)', '(3b)', '(3c)', '(3e)', '(3f)', '(4b)', '(4c)'],
  noretire:    ['(4b)', '(4c)'],
};
/* 変異 → 乱数・時機しだいで赤くなり得る節 (緑でも赤でも可)。理由は依頼書 §12-3。 */
const NEG_MAYBE = {
  backexit: [], retreatopen: [], nofailopen: [], nogate: [], asenemy: [], rowzero: [], nonodelayer: [],
  nomark: [], everytime: [], intavern: [], noretire: [],
};
/* 依頼書 §8 の予想 (⭐ 実測と違うものは依頼書 §12-3 に理由を書いた) */
const NEG_PREDICTED = {
  backexit: ['(1f)', '(1h)'], retreatopen: ['(1g)'], nofailopen: ['(2a)'], nogate: ['(0b)', '(1a)'], asenemy: ['(1c)'],
  rowzero: ['(1b)'], nonodelayer: ['(1b)'], nomark: ['(3a)'], everytime: ['(3b)'], intavern: ['(3c)'], noretire: ['(4b)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 11) vetFail('変異は 11 本まで (ポート 10556〜10566)');
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
/* 罠E の自己検査: 他の tools/*.js が同じ行を指していないこと */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self);
  const src = peers.map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
    const core = e.from.trim();
    const clash = src.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
    if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(','));
  }
}
for (const f of COUNTED) if (countOf(PRISTINE[f], '__MUTHIT__') !== 0) vetFail('原本 ' + f + ' に __MUTHIT__ が在る');
const _mutCache = {};
function servedFile(file, key) {
  if (!key) return PRISTINE[file];
  const ck = key + '|' + file;
  if (_mutCache[ck] !== undefined) return _mutCache[ck];
  let s = PRISTINE[file];
  for (const e of MUTATIONS[key]) {
    if (e.file !== file) continue;
    const tot = COUNTED.reduce((n, f) => n + countOf(PRISTINE[f], e.from), 0);
    const c = countOf(PRISTINE[file], e.from);
    if (c !== 1 || tot !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + file + ' に ' + c + ' 件・配信 + town/world 合算 ' + tot + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE[file], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    s = s.split(e.from).join(e.to);
  }
  if (s.split('\n').length !== PRISTINE[file].split('\n').length) vetFail('変異 ' + key + ' が ' + file + ' の行数を変えた');
  _mutCache[ck] = s;
  return s;
}
for (const k of MUT_ORDER) {
  if (!MUTATIONS[k].some((e) => e.to.indexOf('__MUTHIT__' + k) >= 0)) vetFail('変異 ' + k + ' に実行の印が無い');
  if (SERVED.every((f) => servedFile(f, k) === PRISTINE[f])) vetFail('変異 ' + k + ' が何も変えていない');
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で 1 箇所 (配信 3 + town/world 合算)・行数不変・他ドライバとアンカーの重なり 0');

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
  const frozen = {};
  for (const f of SERVED) frozen[f] = Buffer.from(servedFile(f, mutKey), 'utf8');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (frozen[rel]) { res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()]); res.end(frozen[rel]); return; }
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(1h)', '(2a)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(3f)', '(3g)', '(4a)', '(4b)', '(4c)'];
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

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側の観測 (⛔ 期待値はここに書かない)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* 酒場: 母子・札・印の観測 (item2b/reunion_check.js の probe の写し。札は実 DOM をステージ座標へ) */
const TAV_PROBE = () => {
  const N = window.NPC_CROWD, M = window.TAVERN_MAP;
  const st = document.getElementById('tavernStage'); const sr = st.getBoundingClientRect();
  const mm = /matrix\(([^,]+),/.exec(getComputedStyle(st).transform); const z = mm ? (parseFloat(mm[1]) || 1) : 1;
  const signs = Array.from(document.querySelectorAll('#tavernStage .tavernSign')).map((el) => {
    const b = el.getBoundingClientRect();
    return { key: el.id, w: b.width / z, h: b.height / z, cx: ((b.left + b.width / 2) - sr.left) / z, cy: ((b.top + b.height / 2) - sr.top) / z };
  });
  const units = Array.from(document.querySelectorAll('#npcLayer .npcUnit')).map((el) => el.getAttribute('data-npc'));
  const rv = window.__TAVERN_TV.reunion();
  let vR = null;
  try { vR = N.REUNION ? N.validate(N.REUNION, M, signs) : null; } catch (e) { vR = { ok: false, err: String(e && e.message || e) }; }
  let cleared = null;
  try { cleared = JSON.parse(localStorage.getItem('dragonfighters.cleared')); } catch (e) {}
  let facts = null;
  try { facts = window.__TAVERN_TV.boardFacts(); } catch (e) {}
  return { units, n: units.length, tavernLen: N.TAVERN.length, rv, vR, nSigns: signs.length,
           harold: !!document.querySelector('#npcLayer .npcUnit[data-npc="harold"]'),
           mother: !!document.querySelector('#npcLayer .npcUnit[data-npc="towerMother"]'),
           mark: localStorage.getItem('dragonfighters.towerMotherHome'), cleared, facts };
};
/* 酒場: 母子を 1 人押す (要素の画面内の部分の中心 = K16) → 吹き出しと主人公 */
async function tapFamily(p, key) {
  const before = await p.evaluate(() => window.__TAVERN_TV.heroTile());
  const pt = await p.evaluate((k) => {
    const el = document.querySelector('#npcLayer .npcUnit[data-npc="' + k + '"]');
    if (!el) return { none: true };
    const b = el.getBoundingClientRect();
    const l = Math.max(b.left, 0), r = Math.min(b.right, innerWidth);
    const x = (l + r) / 2, y = b.top + b.height * 0.55;
    const h = document.elementFromPoint(x, y);
    return { x, y, hit: !!h && (h === el || el.contains(h)), visW: Math.round(r - l), centerX: Math.round(b.left + b.width / 2) };
  }, key);
  if (pt.none || !pt.hit) return { key, pt, ok: false };
  await p.mouse.click(pt.x, pt.y);
  await sleep(600);
  const a = await p.evaluate(() => {
    const b = document.querySelector('.npcBubble');
    return { text: b ? b.textContent : null, who: b ? b.getAttribute('data-npc-say') : null,
             walking: window.__TAVERN_TV.walkingTo(), moving: window.__TAVERN_TV.isMoving(), hero: window.__TAVERN_TV.heroTile() };
  });
  const say = await p.evaluate((k) => { const n = window.NPC_CROWD.REUNION.find((x) => x.key === k); return n ? n.say : null; }, key);
  const ok = a.who === key && !!say && a.text === say && !a.moving && !a.walking && !!before && !!a.hero && a.hero.c === before.c && a.hero.r === before.r;
  return { key, pt, a: { who: a.who, sayOk: a.text === say, moving: a.moving, walking: a.walking, hero: a.hero, before }, ok };
}
async function watchScene(p, ms) {
  const seen = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const b = await p.evaluate(() => { const x = document.querySelector('.npcBubble'); return x ? x.getAttribute('data-npc-say') + '|' + x.textContent : null; });
    if (b && seen[seen.length - 1] !== b) seen.push(b);
    await sleep(150);
  }
  return seen;
}

/* 塔: 追い払いの手番 (verify_tower_mother と item2a/run_mother.js の写し) */
const SETUP_TURNS = () => {
  const S = window.__tb = { turnNo: 0, enterNodeCalls: [], chooseExitCalls: 0, arrows: 0 };
  playerAttackTurn = async function () {
    S.turnNo++;
    const W = enemies.map((e, i) => i).filter((i) => enemies[i].alive && enemies[i].def && enemies[i].def.fleeAtHpRatio);
    if (S.turnNo === 1) { const i = W.find((k) => !enemies[k].def.isBoss); if (i != null) enemies[i].hp = Math.floor(enemies[i].maxHp * 0.45); return; }
    for (const i of W) { enemies[i].hp = 0; defeatEnemy(i); }
  };
  allyAttackTurn = async function () {};
  enemyAttackTurn = async function () {};
};
const ENTER_N1 = async () => {
  await enterNode('n1', 'right');
  /* (1f) enterNode('n1') の**後**に、数えるだけの包みで包む (引数も戻り値も変えない) */
  const S = window.__tb;
  const _en = enterNode; enterNode = async function () { S.enterNodeCalls.push(Array.from(arguments)); return _en.apply(this, arguments); };
  const _ce = chooseExit; chooseExit = async function () { S.chooseExitCalls++; return _ce.apply(this, arguments); };
  const _sa = showExitArrows; showExitArrows = function () { S.arrows++; return _sa.apply(this, arguments); };
  const W = enemies.map((e, i) => i).filter((i) => enemies[i].def && enemies[i].def.fleeAtHpRatio);
  for (const i of W) enemies[i].hp = Math.floor(enemies[i].maxHp * 0.55);
  await new Promise((r) => setTimeout(r, 1500));
  const tv = window.__towerMotherTV || {};
  return { cur: currentNodeId, nEnemies: enemies.length, nWyv: W.length, boss: RUN.bossNodeId,
           start: RUN.byId[RUN.bossNodeId] && RUN.byId[RUN.bossNodeId].mapDef ? Object.assign({}, RUN.byId[RUN.bossNodeId].mapDef.start) : null,
           seams: { mother: typeof tv.mother, holds: typeof tv.holds, active: typeof tv.active },
           motherAtEntry: tv.mother ? tv.mother() : null };
};
/* 塔: 追い払い → 随伴 → 帰還 の観測 (50ms 標本)。opt.pin = (2a) の装置 / opt.probe = (1g) のクリック */
const RUN_FLOW = async (opt) => {
  const o = { samples: 0 };
  const S = window.__tb;
  const tv = window.__towerMotherTV;
  const heroTile = () => ({ tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) });
  const W = enemies.map((e, i) => i).filter((i) => enemies[i].def && enemies[i].def.fleeAtHpRatio);
  const iNB = W.find((i) => !enemies[i].def.isBoss);
  if (!encounterActive && iNB != null) {
    const w0 = enemies[iNB];
    playerX = w0.x - 2 * TILE_SIZE; playerY = w0.y + 60;
    await new Promise((r) => setTimeout(r, 400));
    try { tryStartEncounter(); } catch (e) { o.tseErr = e.message; }
  }
  const v = { clearedBeforeDone: 0, retreatEnabled: 0, activeSamples: 0, notN1: 0, choiceShown: 0 };
  let lastPhase = '?';
  o.tl = [];
  const sample = (m) => {
    o.samples++;
    if (m.phase !== lastPhase) { o.tl.push([Math.round(performance.now() - o.t0), m.phase, m.tx, m.ty, m.doneBy || null]); lastPhase = m.phase; }
    if (m.phase !== 'done' && dungeonCleared && !o.clearedAt) v.clearedBeforeDone++;
    if (tv.active()) { v.activeSamples++; if (!document.getElementById('retreatBtn').disabled) v.retreatEnabled++; }
    if (currentNodeId !== 'n1') v.notN1++;
    const cd = document.getElementById('choiceDialog');
    if (m.phase && cd && getComputedStyle(cd).display !== 'none' && cd.classList.contains('show')) v.choiceShown++;
    if (o.enMin == null || enemies.length < o.enMin) o.enMin = enemies.length;
    if (o.enMax == null || enemies.length > o.enMax) o.enMax = enemies.length;
    if (typeof towerMother !== 'undefined' && towerMother && enemies.indexOf(towerMother) >= 0) o.motherInEnemies = true;
    const el = document.getElementById('towerMother');
    if (el && enemyElements.indexOf(el) >= 0) o.elInEnemyEls = true;
    if (el) o.everEl = true;
    if (m.phase && m.phase !== 'hidden' && !o.firstNonHidden) o.firstNonHidden = m.phase;
  };
  o.t0 = performance.now();
  const t0 = performance.now();
  while (!encounterActive && performance.now() - t0 < opt.startMs) await new Promise((r) => setTimeout(r, 100));
  o.started = !!encounterActive; o.startMs = Math.round(performance.now() - t0);
  const t1 = performance.now();
  while ((encounterActive || encounterRunning) && performance.now() - t1 < opt.endMs) {
    await new Promise((r) => setTimeout(r, 100));
    sample(tv.mother());
  }
  o.ended = !encounterActive && !encounterRunning; o.encMs = Math.round(performance.now() - t1);
  o.allGone = W.every((i) => !enemies[i].alive);
  o.endState = { dungeonCleared, m: tv.mother() };
  let lr = null, pinned = null;
  const t2 = performance.now();
  while (performance.now() - t2 < opt.obsMs) {
    await new Promise((r) => setTimeout(r, 50));
    const m = tv.mother();
    sample(m);
    /* (2a) 装置: follow が始まったら主人公をその場に留め続ける (階段の口に着かせない) */
    if (opt.pin && m.phase === 'follow') {
      if (!pinned) { pinned = snapToWalkable(heroTile()); o.pin = { tx: pinned.tx, ty: pinned.ty, goal: m.goal }; }
      if (heroForcedGoal !== pinned) { heroForcedGoal = pinned; o.repins = (o.repins || 0) + 1; }
    }
    /* (1g) クリックの条件: disabled を一瞬外して押す → 本番は撤退を始めない */
    if (opt.probe && m.phase === 'follow' && !o.click && m.followMs > 2000) {
      const b = document.getElementById('retreatBtn');
      const was = b.disabled;
      b.disabled = false;
      b.click();
      o.click = { was, inProgress: (typeof retreatInProgress !== 'undefined') ? retreatInProgress : null };
      updateRetreatBtnState();
      /* ⚠ 撤退が始まった (= 欠陥) ら 2.1 秒後に酒場へ遷移して文脈が消える ⇒ 遷移の前に観測を打ち切る */
      if (o.click.inProgress !== false) { o.retreatStarted = true; break; }
    }
    if (m.phase === 'follow' && !o.dom) {
      const el = document.getElementById('towerMother');
      if (el) {
        const cs = getComputedStyle(el);
        const bp = (el.style.backgroundPosition || '').split(/\s+/).map((s) => parseFloat(s));
        o.dom = { inNodeLayer: !!el.closest('#nodeLayer'), parentId: el.parentElement ? el.parentElement.id : null, display: cs.display, visibility: cs.visibility,
                  opacity: cs.opacity, w: el.offsetWidth, h: el.offsetHeight, bgX: bp[0], bgY: bp[1], bgSize: cs.backgroundSize, bgImage: cs.backgroundImage.slice(-50) };
      } else o.dom = { none: true };
    }
    if (m.phase === 'done' && !o.doneSnap) {
      const node = RUN.byId[RUN.bossNodeId];
      o.doneSnap = { m, hero: heroTile(), start: node && node.mapDef ? Object.assign({}, node.mapDef.start) : null, cleared: dungeonCleared };
    }
    if (dungeonCleared && !o.clearedAt) o.clearedAt = { ms: Math.round(performance.now() - t2), phase: m.phase };
    if ((S.enterNodeCalls.length + S.chooseExitCalls + S.arrows) > 0 && !o.exitBreak) { o.exitBreak = Math.round(performance.now() - t2); break; }
    try { lr = JSON.parse(sessionStorage.getItem('dragonfighters.lastResult')); } catch (e) {}
    if (lr) break;
  }
  o.obsMs = Math.round(performance.now() - t2);
  o.viol = v;
  o.mEnd = tv.mother();
  o.lastResult = lr ? { cleared: lr.cleared, retreated: !!lr.retreated, scenarioId: lr.scenarioId, gold: lr.reward ? lr.reward.gold : null } : null;
  o.coins = coins;
  o.clearGold = SCENARIOS['tower-mother'] ? SCENARIOS['tower-mother'].clearGold : null;
  o.roadChestBonus = (typeof roadChestBonusGold === 'function') ? roadChestBonusGold() : null;   // ★[#87] 参考 (assert は数値 ROAD_CHEST_BONUS で測る)
  o.speech = (window.__speech && window.__speech.log ? window.__speech.log : []).filter((x) => x.key.indexOf('tower.mother') === 0).map((x) => [x.key, x.kind]);
  o.enterNodeCalls = S.enterNodeCalls.length; o.chooseExitCalls = S.chooseExitCalls; o.arrows = S.arrows;
  o.cur = currentNodeId;
  o.towerEl = !!document.getElementById('towerMother');
  return o;
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { booted: 0, errs: [], hits: {} };
  const base = 'http://127.0.0.1:' + port + '/';
  const pages = [];
  async function newPage(view) {
    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
    page.on('console', (m) => {
      let t = ''; try { t = m.text(); } catch (e) { return; }
      if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
    });
    await page.setViewport(view);
    return page;
  }
  /* 酒場を開く: 新しいタブ + sessionStorage の 1 回きりガード (reload では種を撒き直さない) */
  async function openTav(view, seed, query) {
    const p = await newPage(VIEWS_T[view]);
    await p.evaluateOnNewDocument((seed) => {
      try {
        if (sessionStorage.getItem('__s83b3')) return;
        sessionStorage.setItem('__s83b3', '1');
        const kill = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
        kill.forEach((k) => localStorage.removeItem(k));
        localStorage.setItem('dragonfighters.prologueSeen', '1');
        localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
        if (seed.cleared) localStorage.setItem('dragonfighters.cleared', JSON.stringify(seed.cleared));
        if (seed.mark) localStorage.setItem('dragonfighters.towerMotherHome', '1');
        if (seed.lr) sessionStorage.setItem('dragonfighters.lastResult', seed.lr);
      } catch (e) {}
    }, seed);
    await p.goto(base + F_TAVERN + (query || ''), { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction("window.__TAVERN_TV && window.__TAVERN_TV.reunion && window.NPC_CROWD && document.getElementById('npcLayer')", { timeout: 30000 });
    ctx.booted++;
    return p;
  }
  /* 塔の 1 腕。⚠ 腕の中の例外は腕の観測だけを空にする (酒場の節まで巻き込まない) */
  async function towerArm(q, opt) {
    try { return await towerArm1(q, opt); }
    catch (e) {
      const msg = String((e && e.message) || e).slice(0, 200);
      console.log('  ⛔ 塔の腕 ' + q + ' 例外: ' + msg);
      return { err: msg, N1: { seams: {}, nEnemies: null },
               FL: { err: msg, samples: 0, tl: [], viol: { clearedBeforeDone: 0, retreatEnabled: 0, activeSamples: 0, notN1: 0, choiceShown: 0 }, mEnd: {}, speech: [] } };
    }
  }
  async function towerArm1(q, opt) {
    const ip = await newPage(VIEW_I);
    await ip.evaluateOnNewDocument((SID) => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', SID); } catch (e) {}
      try { localStorage.setItem('dragonfighters.xp', '20000'); localStorage.setItem('dragonfighters.prologueSeen', '1'); } catch (e) {}
    }, TOWER);
    await ip.goto(base + F_INDEX + q, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ip.waitForFunction("typeof RUN !== 'undefined' && RUN && typeof enterNode === 'function'", { timeout: 60000 });
    ctx.booted++;
    await ip.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(2500);
    await ip.evaluate(SETUP_TURNS);
    const N1 = await ip.evaluate(ENTER_N1);
    for (let i = 0; i < 12; i++) {
      if (await ip.evaluate(() => !skillCheckActive && !dialogPaused)) break;
      await ip.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
        if (btns.length) btns[btns.length - 1].click();
        const ov = document.getElementById('skillCheckOverlay');
        if (ov && ov.classList.contains('show')) { const rb = document.getElementById('scRollBtn'); if (rb) rb.click(); ov.click(); }
        document.body.click();
      });
      await sleep(300);
    }
    const FL = await ip.evaluate(RUN_FLOW, Object.assign({ startMs: ENC_START_WAIT_MS, endMs: ENC_END_WAIT_MS }, opt));
    await ip.close().catch(() => {});
    return { N1, FL };
  }
  try {
    /* ══════════ 酒場 ══════════ */
    const LR = (sid, title) => JSON.stringify({ cleared: true, scenarioId: sid, scenarioTitle: title, reward: { gold: CLEAR_GOLD, totalGold: CLEAR_GOLD } });
    const TM = LR(TOWER, '塔の母');
    /* 本筋と塔の母の前提 = ページの scenarios から (⛔ 写経しない) */
    let p = await openTav('desktop', {}, '');
    const sc = await p.evaluate(() => scenarios.map((s) => ({ id: s.id, side: !!s.side, locked: !!s.locked, unlockAfter: s.unlockAfter || null })));
    await p.close().catch(() => {});
    const mainIds = sc.filter((s) => !s.side).map((s) => s.id);
    const tw = sc.find((s) => s.id === TOWER) || {};
    const ia = mainIds.indexOf(tw.unlockAfter);
    const PRE = ia >= 0 ? mainIds.slice(0, ia + 1) : [];
    const PRE_MINUS = ia >= 0 ? mainIds.slice(0, ia) : [];
    const other = mainIds[0];
    const GM = LR(other, other);

    /* T1 desktop: 初めて tower-mother のクリアで帰還 → 場面 → 押す → 同じタブで 2 回目 */
    p = await openTav('desktop', { cleared: PRE, lr: TM }, '');
    const seen1 = await watchScene(p, SCENE_WATCH_MS);
    const t1 = await p.evaluate(TAV_PROBE);
    const taps = [];
    for (const k of REUNION_KEYS) taps.push(Object.assign({ view: 'desktop' }, await tapFamily(p, k)));
    await p.evaluate((lr) => sessionStorage.setItem('dragonfighters.lastResult', lr), TM);
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction("window.__TAVERN_TV && window.__TAVERN_TV.reunion && document.getElementById('npcLayer')", { timeout: 30000 });
    ctx.booted++;
    const seen2 = await watchScene(p, QUIET_WATCH_MS);
    const t1b = await p.evaluate(TAV_PROBE);
    await p.close().catch(() => {});
    /* T1c compact: 印あり → 札と押す (K16) */
    p = await openTav('compact', { cleared: PRE, mark: true }, '');
    await sleep(2500);
    const tc = await p.evaluate(TAV_PROBE);
    for (const k of REUNION_KEYS) taps.push(Object.assign({ view: 'compact' }, await tapFamily(p, k)));
    await p.close().catch(() => {});
    /* T2 印なし */
    p = await openTav('desktop', {}, ''); await sleep(2500);
    const t2 = await p.evaluate(TAV_PROBE); await p.close().catch(() => {});
    /* T3 他シナリオのクリア */
    p = await openTav('desktop', { lr: GM }, ''); await sleep(2500);
    const t3 = await p.evaluate(TAV_PROBE); await p.close().catch(() => {});
    /* T4 ?towermother=0 + 印あり */
    p = await openTav('desktop', { mark: true }, '?towermother=0');
    const seen4 = await watchScene(p, 7000);
    const t4 = await p.evaluate(TAV_PROBE); await p.close().catch(() => {});
    /* T5 ?towermother=0 + 初めてのクリア (4c の OFF) */
    p = await openTav('desktop', { cleared: PRE, lr: TM }, '?towermother=0');
    const seen5 = await watchScene(p, 7000);
    const t5 = await p.evaluate(TAV_PROBE); await p.close().catch(() => {});
    /* T6 (3g) 対照: 解放の 1 本手前まで */
    p = await openTav('desktop', { cleared: PRE_MINUS }, ''); await sleep(1500);
    const t6 = await p.evaluate(TAV_PROBE); await p.close().catch(() => {});

    /* ══════════ 塔 ══════════ */
    const A = await towerArm('?diag=1', { obsMs: OBS_MAIN_MS, probe: true });
    const B = await towerArm('?diag=1', { obsMs: OBS_STUCK_MS, pin: true });
    const C = await towerArm('?diag=1&towermother=0', { obsMs: OBS_OFF_MS });

    /* ── §0 ── */
    const seamsI = A.N1.seams;
    R.check('(0a)', '[装置] __towerMotherTV.mother / holds / active と __TAVERN_TV.reunion が見える',
      seamsI.mother === 'function' && seamsI.holds === 'function' && seamsI.active === 'function' && !!t1.rv && Array.isArray(t1.rv.keys),
      { index: seamsI, reunion: t1.rv });
    const fa = A.FL;
    R.check('(0b)', '[装置] 追い払いの後に随伴が起動し phase が hidden 以外へ動いた',
      fa.started && fa.ended && fa.allGone && !!fa.firstNonHidden,
      { started: fa.started, ended: fa.ended, allGone: fa.allGone, firstNonHidden: fa.firstNonHidden, tl: fa.tl, atEntry: A.N1.motherAtEntry });
    /* ── §1 ── */
    const ds = fa.doneSnap || null;
    R.check('(1a)', '最後のワイバーンが去ってから done まで dungeonCleared は偽 (シームの phase / 本番の dungeonCleared)・done の後に立つ',
      fa.allGone && !!ds && fa.viol.clearedBeforeDone === 0 && !!fa.clearedAt && fa.clearedAt.phase === 'done' && fa.samples > 0,
      { clearedBeforeDone: fa.viol.clearedBeforeDone, clearedAt: fa.clearedAt, done: !!ds, tl: fa.tl, samples: fa.samples });
    const dm = fa.dom || {};
    const imgOk = /villager_oldwoman_walk\.png/.test(dm.bgImage || '');
    const inSheet = typeof dm.bgX === 'number' && typeof dm.bgY === 'number' && dm.bgX <= 0 && dm.bgY <= 0
      && (-dm.bgX + SHEET.cell) <= SHEET.w && (-dm.bgY + SHEET.cell) <= SHEET.h;
    R.check('(1b)', '母の DOM が #nodeLayer の中・見えている・背景の Y が 3 段目 (' + ROW3_Y + 'px)・背景画像の範囲内',
      !!fa.dom && !dm.none && dm.inNodeLayer === true && dm.display !== 'none' && dm.visibility !== 'hidden' && parseFloat(dm.opacity) > 0
        && dm.w > 0 && dm.h > 0 && dm.bgY === ROW3_Y && inSheet && imgOk && dm.bgSize === SHEET.w + 'px ' + SHEET.h + 'px',
      dm);
    R.check('(1c)', '母は敵配列に居ない (enemies の長さが入室後〜制覇まで不変・enemies に母の状態なし・enemyElements に母の DOM なし)',
      fa.everEl === true && fa.enMin === A.N1.nEnemies && fa.enMax === A.N1.nEnemies && !fa.motherInEnemies && !fa.elInEnemyEls,
      { nAtEntry: A.N1.nEnemies, min: fa.enMin, max: fa.enMax, motherInEnemies: !!fa.motherInEnemies, elInEnemyEls: !!fa.elInEnemyEls, everEl: !!fa.everEl });
    const keysSaid = (fa.speech || []).map((x) => x[0]);
    R.check('(1d)', '母の台詞 2 件 (tower.mother.meet / tower.mother.follow) が __speech.log (実際に表示したもの) に載る',
      keysSaid.indexOf('tower.mother.meet') >= 0 && keysSaid.indexOf('tower.mother.follow') >= 0, fa.speech);
    const cheb = ds ? Math.max(Math.abs(ds.m.tx - ds.hero.tx), Math.abs(ds.m.ty - ds.hero.ty)) : null;
    R.check('(1e)', 'done の時点で主人公が n1 の mapDef.start・母が主人公からチェビシェフ 2 以内・doneBy arrived (上限でない)',
      !!ds && !!ds.start && ds.hero.tx === ds.start.tx && ds.hero.ty === ds.start.ty && !!ds.m.goal && ds.m.goal.tx === ds.start.tx && ds.m.goal.ty === ds.start.ty
        && cheb !== null && cheb <= 2 && ds.m.doneBy === 'arrived',
      ds ? { hero: ds.hero, start: ds.start, mother: [ds.m.tx, ds.m.ty], cheb, doneBy: ds.m.doneBy, followMs: Math.round(ds.m.followMs), capMs: ds.m.capMs } : { doneSnap: null, tl: fa.tl });
    R.check('(1f)', '随伴の間 enterNode / chooseExit / showExitArrows 0 回・現在ノードは n1 のまま・#choiceDialog が出ない',
      !!ds && fa.enterNodeCalls === 0 && fa.chooseExitCalls === 0 && fa.arrows === 0 && fa.viol.notN1 === 0 && fa.viol.choiceShown === 0 && !fa.exitBreak,
      { enterNode: fa.enterNodeCalls, chooseExit: fa.chooseExitCalls, arrows: fa.arrows, notN1: fa.viol.notN1, choiceShown: fa.viol.choiceShown, exitBreak: fa.exitBreak || null, cur: fa.cur });
    R.check('(1g)', '随伴の間 撤退ボタンが disabled (全標本)・disabled を外して押しても撤退が始まらない',
      fa.viol.activeSamples > 0 && fa.viol.retreatEnabled === 0 && !!fa.click && fa.click.was === true && fa.click.inProgress === false
        && !!fa.lastResult && !fa.lastResult.retreated,
      { activeSamples: fa.viol.activeSamples, retreatEnabled: fa.viol.retreatEnabled, click: fa.click || null, lastResult: fa.lastResult });
    const lr = fa.lastResult;
    R.check('(1h)', 'done の後 今の流れでクリア: lastResult.cleared・scenarioId tower-mother・reward.gold − coins = clearGold (' + CLEAR_GOLD + ')',
      !!ds && !!lr && lr.cleared === true && lr.scenarioId === TOWER && fa.clearGold === CLEAR_GOLD && typeof lr.gold === 'number' && lr.gold - fa.coins === fa.clearGold + ROAD_CHEST_BONUS,
      { lastResult: lr, coins: fa.coins, clearGold: fa.clearGold, roadChestBonus: ROAD_CHEST_BONUS, roadChestBonusPage: fa.roadChestBonus, obsMs: fa.obsMs });
    /* ── §2 ── */
    const fb = B.FL, dsB = fb.doneSnap || null;
    R.check('(2a)', '主人公が階段の口に着かない盤面でも、上限で done (doneBy cap) になりクリアする',
      !!fb.pin && !!dsB && dsB.m.doneBy === 'cap' && !!dsB.m.goal && !(dsB.hero.tx === dsB.m.goal.tx && dsB.hero.ty === dsB.m.goal.ty)
        && fb.viol.clearedBeforeDone === 0 && !!fb.lastResult && fb.lastResult.cleared === true && fb.lastResult.scenarioId === TOWER,
      { pin: fb.pin, repins: fb.repins, done: dsB ? { doneBy: dsB.m.doneBy, hero: dsB.hero, goal: dsB.m.goal, followMs: Math.round(dsB.m.followMs), capMs: dsB.m.capMs } : null,
        mEnd: { phase: fb.mEnd.phase, doneBy: fb.mEnd.doneBy, followMs: Math.round(fb.mEnd.followMs || 0), capMs: fb.mEnd.capMs }, lastResult: fb.lastResult, obsMs: fb.obsMs });
    /* ── §3 ── */
    const hasFamily = (t) => t.harold && t.mother && J(t.rv.keys) === J(REUNION_KEYS);
    R.check('(3a)', 'tower-mother のクリアを置いて酒場を開く → 印 "1"・harold と towerMother の .npcUnit が在る',
      t1.mark === '1' && hasFamily(t1) && t1.n === t1.tavernLen + REUNION_KEYS.length, { mark: t1.mark, keys: t1.rv.keys, n: t1.n, tavernLen: t1.tavernLen });
    const sceneKeys = t1.rv.scene.map((s) => s.key);
    const seenKeys = seen1.map((s) => s.split('|')[0]);
    R.check('(3b)', '初回は再会の吹き出しが順に 3 件 (' + SCENE_ORDER.join(' → ') + ')・同じ保存で 2 回目は母子は居るが場面 0 件',
      t1.rv.pending === true && J(sceneKeys) === J(SCENE_ORDER) && J(seenKeys) === J(SCENE_ORDER)
        && hasFamily(t1b) && t1b.rv.pending === false && t1b.rv.scene.length === 0 && seen2.length === 0,
      { first: { pending: t1.rv.pending, scene: sceneKeys, seen: seenKeys }, second: { keys: t1b.rv.keys, pending: t1b.rv.pending, scene: t1b.rv.scene.length, seen: seen2 } });
    R.check('(3c)', '印が無い保存では母子が居ない (keys 空・要素なし)・.npcUnit の数 = TAVERN.length',
      t2.mark === null && t2.rv.keys.length === 0 && !t2.harold && !t2.mother && t2.n === t2.tavernLen,
      { mark: t2.mark, keys: t2.rv.keys, harold: t2.harold, mother: t2.mother, n: t2.n, tavernLen: t2.tavernLen });
    R.check('(3d)', 'NPC_CROWD.validate(REUNION, TAVERN_MAP, 実 DOM の札) が ok (desktop / compact)',
      !!t1.vR && t1.vR.ok === true && !!tc.vR && tc.vR.ok === true && t1.nSigns > 0 && tc.nSigns > 0,
      { desktop: t1.vR, compact: tc.vR, signs: [t1.nSigns, tc.nSigns] });
    R.check('(3e)', '母子を押すと自分の say が出て主人公が歩き出さない (desktop / compact・画面内の部分を押す)',
      taps.length === 4 && taps.every((t) => t.ok), taps);
    R.check('(3f)', '他のシナリオ (' + other + ') のクリアで戻っても印は立たない',
      t3.mark === null && t3.rv.keys.length === 0 && Array.isArray(t3.cleared) && t3.cleared.indexOf(other) >= 0,
      { mark: t3.mark, keys: t3.rv.keys, cleared: t3.cleared });
    const unl = (t) => (t.facts && Array.isArray(t.facts.unlocked)) ? t.facts.unlocked : [];
    R.check('(3g)', 'クリア後も tower-mother は boardFacts().unlocked に在る (対照: 解放前の進行では無い)',
      PRE.length > 0 && Array.isArray(t1.cleared) && t1.cleared.indexOf(TOWER) >= 0 && unl(t1).indexOf(TOWER) >= 0 && unl(t6).length > 0 && unl(t6).indexOf(TOWER) < 0,
      { unlockAfter: tw.unlockAfter, seedPre: PRE, cleared: t1.cleared, unlocked: unl(t1), control: { seed: PRE_MINUS, unlocked: unl(t6) } });
    /* ── §4 ── */
    const fc = C.FL;
    R.check('(4a)', 'index.html?towermother=0 で母が出ず (phase null・DOM なし)、そのまま制覇・帰還',
      fc.allGone && !fc.firstNonHidden && fc.mEnd.phase === null && fc.mEnd.on === false && !fc.everEl && !!fc.lastResult && fc.lastResult.cleared === true && fc.lastResult.scenarioId === TOWER,
      { mEnd: fc.mEnd, everEl: !!fc.everEl, clearedAt: fc.clearedAt, lastResult: fc.lastResult, tl: fc.tl });
    R.check('(4b)', 'tavern.html?towermother=0 で印ありの保存でも母子が生えない・場面が出ない・印は消えない',
      t4.rv.on === false && t4.mark === '1' && t4.rv.keys.length === 0 && !t4.harold && !t4.mother && t4.rv.scene.length === 0 && seen4.length === 0 && t4.n === t4.tavernLen,
      { on: t4.rv.on, mark: t4.mark, keys: t4.rv.keys, scene: t4.rv.scene, seen: seen4, n: t4.n });
    const cond = (flow, tav) => [!!flow.firstNonHidden, tav.mark === '1' && hasFamily(tav),
      !flow.firstNonHidden && !flow.everEl && !!flow.lastResult && flow.lastResult.cleared === true];
    const on = cond(fa, t1), off = cond(fc, t5);
    R.check('(4c)', '(0b)(3a)(4a) の条件を ON/OFF へ当てて反転 (ON = [true,true,false] / OFF = [false,false,true])',
      J(on) === J([true, true, false]) && J(off) === J([false, false, true]) && seen5.length === 0,
      { on, off, offTavern: { mark: t5.mark, keys: t5.rv.keys, pending: t5.rv.pending, seen: seen5 } });
    /* ══════════ (0c) ══════════ */
    R.check('(0c)', '[装置] 全ページで pageerror 0 件', ctx.booted > 0 && ctx.errs.length === 0, '起動 ' + ctx.booted + ' 回 / pageerror ' + J(ctx.errs.slice(0, 3)));
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await sleep(200);   // console イベントの取りこぼしを避ける
    for (const pg of pages) await pg.close().catch(() => {});
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_tower_mother_b_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 900000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  const run = async (port, key, lab) => {
    const srv = await startServer(port, key);
    console.log('\n[vet] ════════ ' + lab + ' (port ' + port + ') ════════');
    const t0 = Date.now();
    const R = await runSuite(browser, port, key, lab);
    console.log('[vet] ' + lab + ' 所要 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
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
