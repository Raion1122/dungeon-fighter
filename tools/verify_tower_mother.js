#!/usr/bin/env node
/*
 * verify_tower_mother.js — 実装依頼書 #82「塔の母」A (器と戦闘) の受入ドライバ
 *   (依頼書 2026-10-03_tower-mother-a.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_tower_mother.js                        # 素
 *   node tools/verify_tower_mother.js --negative             # 変異 9 本 (port 10539〜10547)。先に素の基準を走らせる
 *   node tools/verify_tower_mother.js --negative --only lethalonly,viadefeat
 *   node tools/verify_tower_mother.js --mutate fieldtheme    # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 登録の整合は**ブラウザに載った実体どうし**で突き合わせる (tavern.html の scenarios と、同じページに
 *     載った js/world-map.js の WORLD_MAP.SITES / UNLOCK / NODES、world.html の WORLD_MAP と DOM)。⛔ 写経しない
 *     (ドライバが持つ固定値は依頼書が決めた名前 = id "tower-mother" / 拠点 "pass_n" / 前提 "orc-fort" だけ。
 *      本筋の並びはページの scenarios の「side でない」並びから取る)。
 *   - 追い払いは本番の runEncounter を回して観測する。手番の関数 (playerAttackTurn / allyAttackTurn /
 *     enemyAttackTurn = classic script の関数宣言 = 裸の識別子で差し替えられる) だけを差し替え、
 *     数値のダメージ (HP の書き込み) を注入して境界 (最大の 0.55 → 0.45 / 一撃で 0) を踏む。
 *     割り込み口 (手番の終わり・ラウンド頭・defeatEnemy の先頭) は本番のまま走る。
 *   - 経路は本番の aStar (⛔ 自前の BFS を書かない)。焼き上がりの検算は本番の道具 make_grid_map.py --check。
 *   - 乱数は固定しない。(1c)「砦まで 4 本で塔の母が卓に入りうる」は確率的 ⇒ 回数で偽赤の確率を抑える:
 *       drawBoard (tavern.html) は本筋 (神殿) を必ず入れ、残り 1 枠を「解放済み 6 件 − 本筋」= 5 件から一様に引く。
 *       ⇒ 1 回の引きで塔の母が出る確率 p = 1/5、N 回で 1 度も出ない (= 素が偽赤になる) 確率 = 0.8^N。
 *       N = 42 で 0.8^42 = 8.5e-5 (< 1e-4)。⛔ 依頼書の「8 回」は 0.8^8 = 16.8% で偽赤になるので採らない (§12-2)。
 *       OFF 腕 (?tower=0) は塔の母が scenarios に居ない = 何回引いても 0 回 (決定的)。N_OFF = 8。
 *   - 強さ (⑤) は assert にしない (別の道具で記録する。依頼書 §12-2)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] window.__towerMotherTV.ENEMY_TYPES.wyvern / window.buildTowerMotherRun / window.fleeEnemy が見える
 *      (0b) [装置] tower-mother の 2 ノード (n0 start / n1 boss) が組み上がり、n1 に追い払い持ち 2 体・n0 に魔物 1 体以上
 *      (0c) [装置] 全ページで pageerror 0 件 (本ドライバ独自の追加)
 *   §1 (1a) tavern の scenarios の tower-mother (side・unlockAfter "orc-fort") と、同じページの WORLD_MAP.SITES / UNLOCK、
 *           world.html の WORLD_MAP.SITES が一致 (全 id の集合一致 + 前提の一致 + pass_n が拠点)
 *      (1b) ALL_MAIN_SCENARIOS (tavern) に tower-mother が無く、本筋 (side でない scenarios) と同じ 6 本
 *      (1c) cleared = 砦まで 4 本 → 鍵を消して 42 回引き直し、塔の母が 1 回以上出る・毎回 本筋 (神殿) が卓に在る・
 *           本番の boardFacts().frontier が神殿 (= ドライバが scenarios の素のデータから独立に出した本筋と一致)
 *      (1d) cleared = 本筋 6 本 (と +塔の母) → boardFacts().frontier が null (⛔ tower-mother を本筋にしない)
 *      (1e) ?tavernmap=0 の 1 枚絵は 6 卓・塔の札なし / ?questdraw=0 の奥の間 (扉を押して開く) は 3 卓 = 本筋の 4〜6 本目
 *   §2 (2a) 焼き上がり 2 枚 (n0 / n1 に実際に貼られた絵) が make_grid_map.py --check の縦横 3 指標で OK
 *      (2b) 本番の aStar で 丘の道の入口 → 出口の手前、最上階の階段 → 各ワイバーン (巣の前) が通る。敵のタイルが全部歩ける
 *      (2c) 丘の道 n0 の罠と宝箱が 0 でない (NODE_EXTRA_SPAWN_KINDS が効いている)
 *      (2d) 丘の道は isCustom (テーマ tower-mother)・絵が読み込まれ、霧が絵の範囲 (tw x th) 以上晴れている (屋外)。最上階も isCustom
 *   §3 (3a) 戦闘中に非ボスのワイバーンの HP を最大の 0.55 → 0.45 (非致死) → 次の手番が来る前に alive=false・__fled・HP > 0
 *      (3b) ボスのワイバーンを一撃で 0 (致死・本番の defeatEnemy) → 撃破でなく追い払い (__fled・__diagDead なし)
 *      (3c) 追い払い 1 回で gainXP がちょうど def.xp を 1 回 (2 匹で 2 回)・RunChronicle の撃破数が増えない・
 *           ドロップ関数 5 種の呼び出し 0・__diagDead が立たない
 *      (3d) 2 匹とも追い払うと戦闘が終わり、ノードが落ち着き (isNodeSettled / graphBossDefeated)、
 *           帰還の lastResult.cleared === true (scenarioId tower-mother)
 *           ★[#83] 言い直し: 制覇は塔の母の随伴 (__towerMotherTV.mother().phase) が done になってから。
 *           随伴が起動していること・done を見たこと・done より前に dungeonCleared が立っていないことも見る
 *      (3e) 他の敵 (丘の道の廃墟の大蜘蛛) は HP 0.4 で checkFleeEnemies に拾われず、HP 0 では普通に撃破される
 *   §4 (4a) tavern.html?tower=0 で scenarios に tower-mother が無い / world.html?tower=0 で pass_n が中継点 (データと DOM)
 *      (4b) (1a)(1c)(4a) の条件を ON/OFF の両方へ当てて反転 (ON = true x3 / OFF = false x3)
 *   ⛔ 測らないこと (依頼書 §8): 飛び去る演出の見た目・長さ / 依頼の文面 / 礼金の額 / 強さ (⑤ は記録のみ)
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html / tavern.html / js/df-mapdef.js は**起動時に 1 回だけ readFileSync して凍結**し、
 *     変異はその文字列をメモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *   - 素と各変異はポート = オリジンが違う ⇒ localStorage は混ざらない。種まき用に空のページ /__blank.html を配る。
 *   - 起動時に全変異のアンカーを**原本**で検算する (配信 3 ファイル合算でちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     崩れたら素でも exit 3。
 *   - 罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと (同じ行を他の本が指していない)。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持つ。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」+ 注入行の実行 > 0。
 *     担当は**実走で決めた** (--mutate で 1 本ずつ・依頼書 §12-2)。
 *   - ⭐ 戦闘開始は遅い (K14: ボス部屋の入室の語りの待ちで 23 秒前後) ⇒ 開始待ちは 90 秒。
 *   - ⛔ git を読まない ⇒ 影のツリー / clone でもそのまま走る。⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0` (verify_quest_draw と同じ型)。
 *
 * ■ ポート = **10538** (素) / 変異 **10539〜10547** (9 本・MUTATIONS の並び順)。次の新規ドライバ base = 10548。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10538'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前 (データ。期待値の写しではない) */
const TOWER = 'tower-mother';
const TOWER_SITE = 'pass_n';
const TOWER_AFTER = 'orc-fort';
const BOARD_KEY = 'dragonfighters.questBoard';
const CLEARED_KEY = 'dragonfighters.cleared';
const VIEW = { width: 1280, height: 800 };
/* 回数。⭐ N_1C_ON は偽赤の確率 0.8^N < 1e-4 となる最小の N (= 42)。下げると素が確率で赤くなる */
const N_1C_ON = 42, N_1C_OFF = 8;
const P_TOWER_PER_DRAW = 1 / 5;
const FALSE_RED = Math.pow(1 - P_TOWER_PER_DRAW, N_1C_ON);
if (!(FALSE_RED < 1e-4)) { console.error('[vet] ⛔ N_1C_ON=' + N_1C_ON + ' では偽赤の確率 ' + FALSE_RED + ' が 1e-4 以上'); process.exit(3); }
const ENC_START_WAIT_MS = 90000;   // K14: 入室の語りの待ちで 23 秒前後
const ENC_END_WAIT_MS = 100000;
/* ★[#83] 追い払いの後、塔の母の随伴 (小部屋から出る → 主人公の隣 → ひと言 → 階段の口まで付いてくる) が done に
 *   なるまでの待ちの上限。随伴は follow の上限 (本番 90 秒〜・止まっていない時間だけ) で必ず done へ倒れるので、
 *   emerge〜talk と止まっている時間の分を足した 180 秒で打ち切る (⛔ これは (3d) の合否ではなく待ちの上限)。 */
const MOTHER_WAIT_MS = 180000;

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html', F_TAVERN = 'tavern.html', F_MAPDEF = 'js/df-mapdef.js';
const SERVED = [F_INDEX, F_TAVERN, F_MAPDEF];
const PRISTINE = {};
for (const f of SERVED) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 9 本)。逐語は HEAD ab2d180 (項目2 の実装後) の行で取った。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const SHOULD_FLEE = 'enemies.some(function (e) { return e && e.alive && !e.__fled && e.def && e.def.fleeAtHpRatio && e.hp <= e.maxHp * e.def.fleeAtHpRatio; })';
const MUTATIONS = {
  /* 罠 1: 非致死の割り込み口 2 つ (手番の終わり・ラウンド頭) を外す = 致死の口 (defeatEnemy 先頭) だけ。
     印は「外した口が、本来なら飛び去らせていた個体が居たとき」 */
  lethalonly: [
    { file: F_INDEX, from: 'checkFleeEnemies("turnEnd");', to: 'if (' + SHOULD_FLEE + ') ' + HIT('lethalonly') + ';' },
    { file: F_INDEX, from: 'checkFleeEnemies("cordon");', to: 'if (' + SHOULD_FLEE + ') ' + HIT('lethalonly') + ';' }],
  /* 罠 2: 飛び去りを fleeEnemy でなく defeatEnemy の本体経由にする (撃破の集約点・__diagDead・ドロップを通る)。
     先頭の行は「印を付けて本体へ落ちる」、非致死の口は defeatEnemy を呼ぶ */
  viadefeat: [
    { file: F_INDEX, from: '      if (enemy && enemy.def && enemy.def.fleeAtHpRatio) { if (!enemy.__fled) fleeEnemy(index, "lethal"); return; }',
      to: '      if (enemy && enemy.def && enemy.def.fleeAtHpRatio) { if (enemy.__fled) return; ' + HIT('viadefeat') + '; enemy.__fled = true; }   /* ★変異viadefeat */' },
    { file: F_INDEX, from: '        if (e.hp <= e.maxHp * e.def.fleeAtHpRatio && fleeEnemy(i, site)) n++;',
      to: '        if (e.hp <= e.maxHp * e.def.fleeAtHpRatio) { defeatEnemy(i); n++; }   /* ★変異viadefeat */' }],
  /* 罠 3: tower-mother を屋外テーマ (FIELD_THEME_IDS = resolve() の規則④) に入れる */
  fieldtheme: [
    { file: F_MAPDEF, from: '  var FIELD_THEME_IDS = { "caravan-road": 1 };',
      to: '  var FIELD_THEME_IDS = { "caravan-road": 1, "tower-mother": 1 }; ' + HIT('fieldtheme') + ';   /* ★変異fieldtheme */' }],
  /* THEMES から tower-mother を外す (印 = 配列の評価時) */
  nothemes: [
    { file: F_MAPDEF, from: '    { id: "tower-mother",   name: "見張りの塔 (tower-mother)" },',
      to: '    ...(' + HIT('nothemes') + ', []),   /* ★変異nothemes */' }],
  /* boardFacts の side 除外を外す (本筋を scenarios 全件から探す)。印は side が本筋に選ばれたとき */
  sidefrontier: [
    { file: F_TAVERN, from: '      var frontier = main.find(function (s) { return isUnlocked(s) && !progress.cleared.has(s.id); }) || null;   /* 抽選の母集団 (unlocked) には side も入る */',
      to: '      var frontier = scenarios.find(function (s) { return isUnlocked(s) && !progress.cleared.has(s.id); }) || null; if (frontier && frontier.side) ' + HIT('sidefrontier') + ';   /* ★変異sidefrontier */' }],
  /* ALL_MAIN_SCENARIOS に tower-mother を足す */
  inmain: [
    { file: F_TAVERN, from: '  const ALL_MAIN_SCENARIOS = ["goblin-mine", "bandits-forest", "lizard-swamp", "orc-fort", "undead-temple", "dragon-lair"];',
      to: '  const ALL_MAIN_SCENARIOS = (' + HIT('inmain') + ', ["goblin-mine", "bandits-forest", "lizard-swamp", "orc-fort", "undead-temple", "dragon-lair", "tower-mother"]);   /* ★変異inmain */' }],
  /* 1 枚絵の既定を scenarios 全件にする (side を外さない)。印は既定で描いたとき */
  sixslots: [
    { file: F_TAVERN, from: '    (list || mainScenarios()).forEach((sc, i) => {   /* ★[#82] 既定は本筋 6 本 (side は 1 枚絵の 6 枠に載せない) */',
      to: '    (list || (' + HIT('sixslots') + ', scenarios)).forEach((sc, i) => {   /* ★変異sixslots */' }],
  /* NODE_EXTRA_SPAWN_KINDS の tower-mother を外す */
  nokinds: [
    { file: F_INDEX, from: '      t["tower-mother"] = { n0: ["search", "loot"] };',
      to: '      ' + HIT('nokinds') + ';   /* ★変異nokinds */' }],
  /* すべての敵に fleeAtHpRatio を付ける。⚠ `fleeAtHpRatio: 0.5,` は 2 箇所 (wyvern / wyvernBoss) = アンカーにできない
     ⇒ 検証シームの直前に、ENEMY_TYPES 全体へ実行時に付与する行を差し込む (印は付与した型が 1 つ以上のとき) */
  fleeall: [
    { file: F_INDEX, from: '    window.fleeEnemy = fleeEnemy;',
      to: '    (function () { var n = 0; Object.keys(ENEMY_TYPES).forEach(function (k) { var d = ENEMY_TYPES[k]; if (d && typeof d === "object" && !d.fleeAtHpRatio) { d.fleeAtHpRatio = 0.5; n++; } }); if (n) '
        + HIT('fleeall') + '; })();   /* ★変異fleeall */ window.fleeEnemy = fleeEnemy;' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-2)。 */
/* ⚠ 依頼書の予想と違った 4 本 (依頼書 §12-2 K16〜K18):
 *   viadefeat  … (3b) も赤 = 致死の口でボスが defeatEnemy の本体へ落ち __diagDead が立つ (罠 2 そのもの)
 *   fieldtheme / nothemes … resolve() がカスタム幾何ごと捨てて既定 (goblin-mine) の地図へ落ちる =
 *                 絵だけでなくワイバーン・魔物・経路まで消える ⇒ (0b)(2a)(2b)(2d)(3a)〜(3e) が全部赤 (罠 3 の実害)
 *   fleeall    … (0b) も赤 = n0 の「追い払いを持たない魔物」が 0 体になる */
const SHATTER = ['(0b)', '(2a)', '(2b)', '(2d)', '(3a)', '(3b)', '(3c)', '(3d)', '(3e)'];
const NEG_EXPECT = {
  lethalonly:   ['(3a)'],
  viadefeat:    ['(3b)', '(3c)'],
  fieldtheme:   SHATTER.slice(),
  nothemes:     SHATTER.slice(),
  sidefrontier: ['(1d)'],
  inmain:       ['(1b)'],
  sixslots:     ['(1e)'],
  nokinds:      ['(2c)'],
  fleeall:      ['(0b)', '(3e)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可)。理由は依頼書 §12-2。 */
const NEG_MAYBE = {
  lethalonly: [], fieldtheme: [], nothemes: [], sidefrontier: [], inmain: [], sixslots: [], nokinds: [], fleeall: [],
  /* defeatEnemy の本体はドロップ (maybeDropIronSword ほか・Math.random) を振る。落ちた回は床に拾われない宝箱が残り
     isNodeSettled() (findNearestDrop) が false = (3d) が赤。落ちなかった回は緑 (--negative 2 回目で実測・依頼書 §12-2 K19) */
  viadefeat: ['(3d)'],
};
/* 依頼書 §8 の予想 (⭐ 実測と違うものは依頼書 §12-2 に理由を書いた) */
const NEG_PREDICTED = {
  lethalonly: ['(3a)'], viadefeat: ['(3c)'], fieldtheme: ['(2d)'], nothemes: ['(2d)'], sidefrontier: ['(1d)'],
  inmain: ['(1b)'], sixslots: ['(1e)'], nokinds: ['(2c)'], fleeall: ['(3e)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 9) vetFail('変異は 9 本まで (ポート 10539〜10547)');
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
for (const f of SERVED) if (countOf(PRISTINE[f], '__MUTHIT__') !== 0) vetFail('原本 ' + f + ' に __MUTHIT__ が在る');
const _mutCache = {};
function servedFile(file, key) {
  if (!key) return PRISTINE[file];
  const ck = key + '|' + file;
  if (_mutCache[ck] !== undefined) return _mutCache[ck];
  let s = PRISTINE[file];
  for (const e of MUTATIONS[key]) {
    if (e.file !== file) continue;
    /* 配信 3 ファイル合算でちょうど 1 件 (別ファイルに同じ行が在ると注入先を取り違える) */
    const tot = SERVED.reduce((n, f) => n + countOf(PRISTINE[f], e.from), 0);
    const c = countOf(PRISTINE[file], e.from);
    if (c !== 1 || tot !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + file + ' に ' + c + ' 件・配信 3 ファイル合算 ' + tot + ' 件): ' + e.from.slice(0, 160));
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
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で 1 箇所 (配信 3 ファイル合算)・行数不変・他ドライバとアンカーの重なり 0'
  + ' / (1c) N=' + N_1C_ON + ' の偽赤の確率 ' + FALSE_RED.toExponential(2));

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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)', '(2d)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(4a)', '(4b)'];
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

/* 焼き上がりの検算 (本番の道具)。tile はページの TILE_SIZE */
function gridCheck(rel, tile) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return { ok: false, why: '無い ' + rel };
  let out = '', code = -2;
  for (const py of ['py', 'python3']) {
    try { out = execFileSync(py, [path.join(ROOT, 'tools', 'make_grid_map.py'), '--check', fp, '--tile', String(tile)], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); code = 0; break; }
    catch (e) { if (e.code === 'ENOENT') continue; out = String((e.stdout || '') + (e.stderr || '')); code = e.status == null ? -1 : e.status; break; }
  }
  const lines = out.split(/\r?\n/).filter((l) => /(縦線|横線):/.test(l));
  const ok = code === 0 && lines.length === 2 && lines.every((l) => /^\s*OK /.test(l));
  return { ok, code, lines: lines.map((l) => l.trim().slice(0, 140)) };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側の観測 (⛔ 期待値はここに書かない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const TAV_SNAP = (SITE) => {
  const o = {};
  try {
    o.scen = scenarios.map((s) => ({ id: s.id, side: !!s.side, locked: !!s.locked, unlockAfter: s.unlockAfter || null, place: s.place }));
    o.main = (typeof mainScenarios === 'function') ? mainScenarios().map((s) => s.id) : null;
    const f = window.__TAVERN_TV ? window.__TAVERN_TV.boardFacts() : null;
    o.frontier = f ? f.frontier : 'NO-FACTS';   /* __TAVERN_TV.boardFacts() は id (文字列) か null を返す */
    const b = window.__TAVERN_TV ? window.__TAVERN_TV.board() : null;
    o.seats = (b && b.seats) ? Object.values(b.seats) : null;
    o.sites = window.WORLD_MAP ? Object.assign({}, window.WORLD_MAP.SITES) : null;
    o.unlock = window.WORLD_MAP ? Object.assign({}, window.WORLD_MAP.UNLOCK) : null;
    o.passn = window.WORLD_MAP ? Object.assign({}, window.WORLD_MAP.NODES[SITE]) : null;
    o.allMain = (typeof ALL_MAIN_SCENARIOS !== 'undefined') ? ALL_MAIN_SCENARIOS.slice() : null;
    const tables = Array.prototype.slice.call(document.querySelectorAll('#tableArea .table'));
    o.tables = tables.map((t) => { const p = t.querySelector('.place'); return p ? p.textContent : null; });
    o.mapOn = window.__tavernMapOn === true;
  } catch (e) { o.err = String((e && e.message) || e); }
  return o;
};
const WORLD_SNAP = (SITE) => {
  const el = document.getElementById('worldNode_' + SITE);
  const W = window.WORLD_MAP;
  return { cls: el ? el.className : null,
           sites: W ? Object.assign({}, W.SITES) : null, unlock: W ? Object.assign({}, W.UNLOCK) : null,
           node: W ? Object.assign({}, W.NODES[SITE]) : null };
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { booted: 0, errs: [], hits: {} };
  const base = 'http://127.0.0.1:' + port + '/';
  const pages = [];
  async function newPage() {
    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
    page.on('console', (m) => {
      let t = ''; try { t = m.text(); } catch (e) { return; }
      if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
    });
    await page.setViewport(VIEW);
    return page;
  }
  async function prep(page, cleared) {
    await page.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
    await page.evaluate((cl, CK) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (cl) localStorage.setItem(CK, JSON.stringify(cl));
    }, cleared, CLEARED_KEY);
  }
  try {
    /* ══════════ tavern ══════════ */
    const tp = await newPage();
    const openTav = async (q) => {
      await tp.goto(base + F_TAVERN + (q || ''), { waitUntil: 'load', timeout: 60000 });
      await tp.waitForFunction(() => { try { return typeof scenarios !== 'undefined' && (window.__tavernMapOn === false || !!window.__TAVERN_TV); } catch (e) { return false; } }, { timeout: 30000 });
      await tp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await sleep(150);
      ctx.booted++;
      return tp.evaluate(TAV_SNAP, TOWER_SITE);
    };
    const redraw = async (q) => { await tp.evaluate((BK) => localStorage.removeItem(BK), BOARD_KEY); return openTav(q); };

    /* 本筋の並び = ページの scenarios の「side でない」並び (データから。⛔ 写経しない) */
    await prep(tp, []);
    const s0 = await openTav('');
    const mainIds = s0.scen.filter((s) => !s.side).map((s) => s.id);
    const MAIN4 = mainIds.slice(0, mainIds.indexOf(TOWER_AFTER) + 1);
    const MAIN_ALL = mainIds.slice();
    /* ドライバ側の独立計算: 本筋 = side でない scenarios のうち、解放済みで未クリアの最初 */
    const indepFrontier = (scen, cleared) => {
      const cs = new Set(cleared);
      const f = scen.filter((s) => !s.side).find((s) => (!s.locked || cs.has(s.unlockAfter)) && !cs.has(s.id));
      return f ? f.id : null;
    };

    /* ON: cleared = 砦まで */
    await prep(tp, MAIN4);
    const on = await openTav('');
    const onDraws = [on.seats];
    for (let i = 1; i < N_1C_ON; i++) onDraws.push((await redraw('')).seats);
    /* OFF: ?tower=0 */
    await prep(tp, MAIN4);
    const off = await openTav('?tower=0');
    const offDraws = [off.seats];
    for (let i = 1; i < N_1C_OFF; i++) offDraws.push((await redraw('?tower=0')).seats);
    /* (1d) */
    await prep(tp, MAIN_ALL);
    const c6 = await openTav('');
    await prep(tp, MAIN_ALL.concat([TOWER]));
    const c7 = await openTav('');
    /* (1e) 1 枚絵 (全部解放 = 札の文字が出る状態) */
    await prep(tp, MAIN_ALL.concat([TOWER]));
    const map0 = await openTav('?tavernmap=0');
    /* (1e) 奥の間 = ?questdraw=0 の扉を押して開く (本番の導線) */
    await prep(tp, MAIN_ALL.concat([TOWER]));
    await openTav('?questdraw=0');
    let back = null;
    try {
      await tp.click('#tavernDoor_back');
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        back = await tp.evaluate(() => document.body.classList.contains('backroomOn'));
        if (back) break;
        await sleep(80);
      }
      await sleep(200);
    } catch (e) { back = 'err:' + String((e && e.message) || e).slice(0, 120); }
    const qd0back = await tp.evaluate(TAV_SNAP, TOWER_SITE);

    /* ══════════ world ══════════ */
    const wp = await newPage();
    const openWorld = async (q) => {
      await prep(wp, MAIN4);
      await wp.goto(base + 'world.html' + (q || ''), { waitUntil: 'load', timeout: 60000 });
      await wp.waitForFunction((S) => !!window.WORLD_MAP && !!document.getElementById('worldNode_' + S), { timeout: 30000 }, TOWER_SITE);
      await sleep(800);
      ctx.booted++;
      return wp.evaluate(WORLD_SNAP, TOWER_SITE);
    };
    const wOn = await openWorld('');
    const wOff = await openWorld('?tower=0');

    /* ── §1 / §4 の判定 ── */
    const towerOf = (s) => (s.scen || []).find((x) => x.id === TOWER) || null;
    const A1 = (s, w) => {
      const t = towerOf(s);
      if (!t || !s.sites || !s.unlock || !w || !w.sites) return { ok: false, why: '塔の母が scenarios / SITES に無い (scenarios に ' + (t ? '在る' : '無い') + ')' };
      const ids = s.scen.map((x) => x.id).sort().join('|');
      const why = [];
      if (!(t.side === true && t.locked === true && t.unlockAfter === TOWER_AFTER)) why.push('scenarios の塔の母 ' + J(t));
      if (Object.keys(s.sites).sort().join('|') !== ids) why.push('tavern の SITES の id 集合 ≠ scenarios');
      if (Object.keys(w.sites).sort().join('|') !== ids) why.push('world.html の SITES の id 集合 ≠ scenarios');
      if (s.sites[TOWER] !== TOWER_SITE || w.sites[TOWER] !== TOWER_SITE) why.push('SITES[塔の母] ' + s.sites[TOWER] + '/' + w.sites[TOWER]);
      for (const x of s.scen) {
        const u = x.locked ? x.unlockAfter : null;
        if ((s.unlock[x.id] || null) !== u) why.push('UNLOCK[' + x.id + ']=' + s.unlock[x.id] + ' ≠ unlockAfter ' + u);
        if ((w.unlock[x.id] || null) !== u) why.push('world.html UNLOCK[' + x.id + ']=' + w.unlock[x.id] + ' ≠ unlockAfter ' + u);
      }
      if (!s.passn || s.passn.kind !== 'site' || !w.node || w.node.kind !== 'site') why.push('pass_n が拠点でない ' + J([s.passn, w.node]));
      return { ok: why.length === 0, why: why.join(' / ') };
    };
    const a1On = A1(on, wOn), a1Off = A1(off, wOff);
    R.check('(1a)', 'tavern の scenarios の塔の母 (side・unlockAfter ' + TOWER_AFTER + ') と WORLD_MAP の SITES / UNLOCK (tavern と world.html) が一致',
      a1On.ok, a1On);
    R.check('(1b)', 'ALL_MAIN_SCENARIOS に塔の母が無く、本筋 (side でない scenarios) と同じ並び',
      Array.isArray(on.allMain) && on.allMain.indexOf(TOWER) < 0 && on.allMain.join('|') === MAIN_ALL.join('|') && J(on.main) === J(MAIN_ALL),
      { allMain: on.allMain, main: on.main });
    const indepOn = indepFrontier(on.scen, MAIN4);
    const towerN = onDraws.filter((s) => Array.isArray(s) && s.indexOf(TOWER) >= 0).length;
    const frontierEvery = onDraws.every((s) => Array.isArray(s) && s.length === 2 && s.indexOf(indepOn) >= 0);
    const c1On = towerN >= 1;
    R.check('(1c)', 'cleared=砦まで → ' + N_1C_ON + ' 回の引きで塔の母が 1 回以上・毎回本筋 (独立計算) が卓に在り、本番の本筋も同じ',
      c1On && frontierEvery && indepOn === mainIds[MAIN4.length] && on.frontier === indepOn,
      { towerAppeared: towerN + '/' + N_1C_ON, indepFrontier: indepOn, pageFrontier: on.frontier, frontierEvery, sample: onDraws.slice(0, 4) });
    R.check('(1d)', 'cleared=本筋 6 本 (と +塔の母) → 本番の本筋が null (塔の母を本筋にしない)',
      c6.frontier === null && c7.frontier === null && indepFrontier(c6.scen, MAIN_ALL) === null,
      { c6: c6.frontier, c7: c7.frontier });
    const backPlaces = mainIds.slice(3).map((id) => (on.scen.find((x) => x.id === id) || {}).place);
    const towerPlace = (towerOf(on) || {}).place || '(塔の母なし)';
    R.check('(1e)', '?tavernmap=0 の 1 枚絵は 6 卓 (塔の札なし) / ?questdraw=0 の奥の間は扉を押して 3 卓 = 本筋の 4〜6 本目',
      !map0.mapOn && map0.tables.length === MAIN_ALL.length && MAIN_ALL.length === 6 && map0.tables.indexOf(towerPlace) < 0
        && back === true && J(qd0back.tables) === J(backPlaces),
      { oneSheet: map0.tables, backroom: qd0back.tables, want: backPlaces, back });
    /* (4a) の条件 = 「塔の母が酒場に在り、ワールドマップの pass_n が拠点 (データと DOM)」。ON で真・OFF で偽 */
    const W4 = (s, w) => !!towerOf(s) && !!(w.sites && w.sites[TOWER]) && !!w.node && w.node.kind === 'site' && /\bworldNode-site\b/.test(w.cls || '');
    const w4On = W4(on, wOn), w4Off = W4(off, wOff);
    R.check('(4a)', 'tavern.html?tower=0 で scenarios に塔の母が無い / world.html?tower=0 で pass_n が中継点 (データと DOM)',
      !towerOf(off) && !!wOff.node && wOff.node.kind === 'way' && /\bworldNode-way\b/.test(wOff.cls || '') && !(wOff.sites && wOff.sites[TOWER]),
      { tavernOff: (off.scen || []).map((x) => x.id), worldOff: { cls: wOff.cls, node: wOff.node, siteTower: wOff.sites && wOff.sites[TOWER] } });
    const offTowerN = offDraws.filter((s) => Array.isArray(s) && s.indexOf(TOWER) >= 0).length;
    const onTriple = [a1On.ok, c1On, w4On];
    const offTriple = [a1Off.ok, offTowerN >= 1, w4Off];
    R.check('(4b)', '(1a)(1c)(4a) の条件を ON/OFF へ当てて反転 (ON = true x3 / OFF = false x3)',
      onTriple.every((x) => x === true) && offTriple.every((x) => x === false),
      { on: onTriple, off: offTriple, offTowerAppeared: offTowerN + '/' + N_1C_OFF, onCls: wOn.cls, offCls: wOff.cls });
    await tp.close().catch(() => {}); await wp.close().catch(() => {});

    /* ══════════ index ══════════ */
    const ip = await newPage();
    await ip.evaluateOnNewDocument((SID) => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', SID); } catch (e) {}
      try { localStorage.setItem('dragonfighters.xp', '20000'); localStorage.setItem('dragonfighters.prologueSeen', '1'); } catch (e) {}
    }, TOWER);
    await ip.goto(base + F_INDEX + '?diag=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ip.waitForFunction("typeof RUN !== 'undefined' && RUN && typeof enterNode === 'function'", { timeout: 60000 });
    ctx.booted++;
    await ip.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(2500);
    const N0 = await ip.evaluate(() => {
      const o = {};
      const tv = window.__towerMotherTV;
      o.seams = { tvWyvern: !!(tv && tv.ENEMY_TYPES && tv.ENEMY_TYPES.wyvern && tv.ENEMY_TYPES.wyvern.fleeAtHpRatio),
                  build: typeof window.buildTowerMotherRun, flee: typeof window.fleeEnemy, check: typeof window.checkFleeEnemies };
      try { o.scen = scenarioId; } catch (e) { o.scen = null; }
      o.nodes = RUN && RUN.graph ? RUN.graph.nodes.map((n) => n.id + ':' + n.kind) : null;
      o.cur = currentNodeId;
      o.custom = !!(MAPDEF && MAPDEF.isCustom); o.themeId = MAPDEF ? MAPDEF.themeId : null;
      o.tile = TILE_SIZE;
      o.outdoor = window.__outdoorRevealProbe ? window.__outdoorRevealProbe() : null;
      o.paintings = roomPaintings.map((p) => ({ src: p.img && p.img.src ? decodeURIComponent(p.img.src.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]) : null,
        loaded: !!p.loaded, tw: p.tw, th: p.th }));
      o.traps = traps.length; o.chests = roomChests.length;
      o.player = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      const tileOf = (e) => ({ tx: Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), ty: Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE) });
      o.enemies = enemies.map((e, i) => Object.assign({ i, type: e.type, flee: !!(e.def && e.def.fleeAtHpRatio) }, tileOf(e)));
      o.enemyWall = o.enemies.filter((e) => isTileWall(e.tx, e.ty)).map((e) => e.type + '@' + e.tx + ',' + e.ty);
      const n0 = RUN.graph.nodes.find((n) => n.id === currentNodeId);
      const ex = n0 && n0.exits && n0.exits[0];
      const DV = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
      if (ex) {
        const d = DV[ex.dir] || [0, 0];
        o.exitInner = [ex.at[0] - d[0], ex.at[1] - d[1]];
        const p = aStar(o.player.tx, o.player.ty, o.exitInner[0], o.exitInner[1]);
        o.pathToExit = p ? p.length : null;
      }
      o.pathToEnemies = o.enemies.map((e) => { const q = aStar(o.player.tx, o.player.ty, e.tx, e.ty); return q ? q.length : null; });
      /* (3e) 追い払いを持たない魔物 (廃墟の大蜘蛛) */
      const sp = enemies.findIndex((e) => e.alive && e.def && !e.def.isBoss && e.type === 'ruinSpider');
      o.spider = { idx: sp };
      if (sp >= 0) {
        const e = enemies[sp];
        const kills0 = RunChronicle.snapshot().kills;
        e.hp = Math.floor(e.maxHp * 0.4);
        o.spider.nonLethalCaught = checkFleeEnemies('probe');
        o.spider.afterNonLethal = { alive: e.alive, fled: !!e.__fled };
        e.hp = 0;
        defeatEnemy(sp);
        o.spider.afterLethal = { alive: e.alive, fled: !!e.__fled, diag: !!e.__diagDead, killsDelta: RunChronicle.snapshot().kills - kills0 };
      }
      o.encActive = !!encounterActive;
      return o;
    });
    /* n1 へ。⭐ 手番の関数は enterNode の前に差し替える (入室直後に主人公が自力で戦闘を始めても同じ観測になるように) */
    await ip.evaluate(() => {
      const S = window.__tmS = { seq: 0, turns: [], snapAfterT1: null, t1done: false, fallback: 0, xpCalls: [], drops: {}, err: [] };
      const snapW = () => enemies.map((e, i) => ({ i, alive: e.alive, fled: !!e.__fled, hp: e.hp, maxHp: e.maxHp, diag: !!e.__diagDead, boss: !!(e.def && e.def.isBoss) }));
      const onAnyTurn = () => { S.seq++; if (S.t1done && !S.snapAfterT1) S.snapAfterT1 = snapW(); };
      let turnNo = 0;
      playerAttackTurn = async function () {
        onAnyTurn();
        turnNo++;
        const W = enemies.map((e, i) => i).filter((i) => enemies[i].alive && enemies[i].def && enemies[i].def.fleeAtHpRatio);
        if (turnNo === 1) {
          const iNB = W.find((i) => !enemies[i].def.isBoss);
          if (iNB == null) { S.err.push('t1: 非ボスのワイバーンが居ない'); S.t1done = true; return; }
          S.iNB = iNB;
          enemies[iNB].hp = Math.floor(enemies[iNB].maxHp * 0.45);   // 非致死の数値ダメージ
          S.turns.push({ t: 1, idx: iNB, set: enemies[iNB].hp });
          S.t1done = true;
          return;
        }
        if (turnNo === 2) {
          const iB = W.find((i) => enemies[i].def.isBoss);
          if (iB == null) { S.err.push('t2: ボスのワイバーンが居ない'); return; }
          S.iB = iB;
          enemies[iB].hp = 0;
          defeatEnemy(iB);   // 一撃で 0 = 本番の致死の口へ (全攻撃経路は hp<=0 で defeatEnemy を呼ぶ)
          const b = enemies[iB];
          S.turns.push({ t: 2, idx: iB, after: { alive: b.alive, fled: !!b.__fled, hp: b.hp, diag: !!b.__diagDead, rage: !!b.ragePhaseEntered } });
          return;
        }
        /* 素では来ない手番。変異で残ったワイバーンを致死の口で片付け、(3d) を他の節から切り離す */
        for (const i of W) { enemies[i].hp = 0; defeatEnemy(i); S.fallback++; }
      };
      allyAttackTurn = async function () { onAnyTurn(); };
      enemyAttackTurn = async function () { onAnyTurn(); };
      const _g = gainXP; gainXP = function (a, s) { S.xpCalls.push([a, String(s), !!(encounterActive || encounterRunning)]); return _g.apply(this, arguments); };
      /* ドロップ 5 種 (defeatEnemy 本体の maybeDrop… / maybeGrant…)。関数宣言 = window のプロパティなので差し替えが裸の呼び出しに効く */
      for (const fn of ['maybeDropIronSword', 'maybeDropLeatherArmor', 'maybeDropShadowAmulet', 'maybeGrantScrollDrop', 'maybeGrantPolymorphWand']) {
        const orig = window[fn];
        if (typeof orig !== 'function') { S.err.push('drop 関数が無い ' + fn); continue; }
        S.drops[fn] = 0;
        window[fn] = function () { S.drops[fn]++; return orig.apply(this, arguments); };
      }
      S.wrapped = { player: playerAttackTurn === window.playerAttackTurn, gain: gainXP === window.gainXP,
                    drop: maybeGrantScrollDrop === window.maybeGrantScrollDrop };
    });
    const N1 = await ip.evaluate(async () => {
      const o = {};
      await enterNode('n1', 'right');
      const W = enemies.map((e, i) => i).filter((i) => enemies[i].def && enemies[i].def.fleeAtHpRatio);
      for (const i of W) enemies[i].hp = Math.floor(enemies[i].maxHp * 0.55);
      await new Promise((r) => setTimeout(r, 1500));
      o.cur = currentNodeId; o.custom = !!(MAPDEF && MAPDEF.isCustom);
      o.paintings = roomPaintings.map((p) => ({ src: p.img && p.img.src ? decodeURIComponent(p.img.src.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]) : null, loaded: !!p.loaded }));
      o.player = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      const tileOf = (e) => ({ tx: Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), ty: Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE) });
      o.enemies = enemies.map((e, i) => Object.assign({ i, type: e.type, flee: !!(e.def && e.def.fleeAtHpRatio), boss: !!(e.def && e.def.isBoss), xp: e.def ? e.def.xp : null, name: e.def ? e.def.name : null }, tileOf(e)));
      o.enemyWall = o.enemies.filter((e) => isTileWall(e.tx, e.ty)).map((e) => e.type + '@' + e.tx + ',' + e.ty);
      o.pathToEnemies = o.enemies.map((e) => { const q = aStar(o.player.tx, o.player.ty, e.tx, e.ty); return q ? q.length : null; });
      o.xp0 = currentTotalXp; o.kills0 = RunChronicle.snapshot().kills;
      o.encActive = !!encounterActive;
      return o;
    });
    /* 入室の語り・選択肢を流す */
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
    const FL = await ip.evaluate(async (START_MS, END_MS, MOTHER_WAIT_MS) => {
      const o = {};
      const S = window.__tmS;
      const W = enemies.map((e, i) => i).filter((i) => enemies[i].def && enemies[i].def.fleeAtHpRatio);
      const iNB = W.find((i) => !enemies[i].def.isBoss);
      if (!encounterActive && iNB != null) {
        const w0 = enemies[iNB];
        playerX = w0.x - 2 * TILE_SIZE; playerY = w0.y + 60;
        await new Promise((r) => setTimeout(r, 400));
        try { tryStartEncounter(); } catch (e) { o.tseErr = e.message; }
      }
      const t0 = performance.now();
      while (!encounterActive && performance.now() - t0 < START_MS) await new Promise((r) => setTimeout(r, 250));
      o.started = !!encounterActive; o.startMs = Math.round(performance.now() - t0);
      const t1 = performance.now();
      while ((encounterActive || encounterRunning) && performance.now() - t1 < END_MS) await new Promise((r) => setTimeout(r, 250));
      o.ended = !encounterActive && !encounterRunning; o.encMs = Math.round(performance.now() - t1);
      o.after = W.map((i) => { const e = enemies[i]; return { i, boss: !!e.def.isBoss, alive: e.alive, fled: !!e.__fled, hp: e.hp, maxHp: e.maxHp, diag: !!e.__diagDead, rage: !!e.ragePhaseEntered }; });
      o.fleeLog = window.__towerMotherTV.fleeLog();
      o.xp1 = currentTotalXp; o.kills1 = RunChronicle.snapshot().kills;
      o.xpCallsAtEnd = S.xpCalls.slice();
      o.settled = isNodeSettled(); o.bossDefeated = graphBossDefeated();
      /* ★[#83] 随伴を待つ。⭐ 制覇は「母が階段の口に着いて随伴が done」の後 (依頼書 #83 §4-2)。
       *   (3d) は done を見たこと + done より前に dungeonCleared が 1 度も立たなかったこと + その後の帰還、で判定する
       *   (⛔ 待ち時間を伸ばすだけにしない = 随伴が 1 度も起動しない / 随伴を待たずに制覇する、の両方を赤にする)。 */
      const tv = window.__towerMotherTV;
      o.motherAtEnd = (tv && tv.mother) ? tv.mother() : null;
      o.clearedBeforeDone = false;
      if (tv && tv.mother) {
        const tm = performance.now();
        while (performance.now() - tm < MOTHER_WAIT_MS) {
          const m = tv.mother();
          if (m.phase === 'done' || !m.phase) break;
          if (dungeonCleared) o.clearedBeforeDone = true;
          await new Promise((r) => setTimeout(r, 250));
        }
        o.motherWaitMs = Math.round(performance.now() - tm);
      }
      o.mother = (tv && tv.mother) ? tv.mother() : null;
      /* 帰還 (自然に待ってから。来なければ本番の checkDungeonClear を 1 回だけ蹴る) */
      let lr = null;
      const t2 = performance.now();
      while (!lr && performance.now() - t2 < 12000) {
        await new Promise((r) => setTimeout(r, 500));
        try { lr = JSON.parse(sessionStorage.getItem('dragonfighters.lastResult')); } catch (e) {}
      }
      o.manualClear = false;
      if (!lr) {
        o.manualClear = true;
        try { if (!dungeonCleared) checkDungeonClear(); } catch (e) { o.checkErr = e.message; }
        const t3 = performance.now();
        while (!lr && performance.now() - t3 < 15000) {
          await new Promise((r) => setTimeout(r, 500));
          try { lr = JSON.parse(sessionStorage.getItem('dragonfighters.lastResult')); } catch (e) {}
        }
      }
      o.lastResult = lr ? { cleared: lr.cleared, scenarioId: lr.scenarioId } : null;
      o.S = JSON.parse(JSON.stringify(S));
      return o;
    }, ENC_START_WAIT_MS, ENC_END_WAIT_MS, MOTHER_WAIT_MS);

    /* ── §0 ── */
    R.check('(0a)', '[装置] __towerMotherTV.ENEMY_TYPES.wyvern / window.buildTowerMotherRun / window.fleeEnemy / checkFleeEnemies が見える',
      N0.seams.tvWyvern && N0.seams.build === 'function' && N0.seams.flee === 'function' && N0.seams.check === 'function', N0.seams);
    const wyv = (N1.enemies || []).filter((e) => e.flee);
    const n0mobs = (N0.enemies || []).filter((e) => !e.flee);
    R.check('(0b)', '[装置] 2 ノード (n0 start / n1 boss) が組み上がり、n1 に追い払い持ち 2 体 (うちボス 1)・n0 に魔物 1 体以上',
      N0.scen === TOWER && J(N0.nodes) === J(['n0:start', 'n1:boss']) && N0.cur === 'n0' && N1.cur === 'n1'
        && wyv.length === 2 && wyv.filter((e) => e.boss).length === 1 && n0mobs.length >= 1 && N0.encActive === false,
      { scen: N0.scen, nodes: N0.nodes, cur: [N0.cur, N1.cur], wyverns: wyv.map((e) => e.type), n0mobs: n0mobs.length, encActiveAtN0: N0.encActive, encActiveAtN1: N1.encActive });
    /* ── §2 ── */
    const p0 = (N0.paintings || [])[0] || {}, p1 = (N1.paintings || [])[0] || {};
    const g0 = p0.src ? gridCheck(p0.src, N0.tile) : { ok: false, why: 'n0 に絵が無い' };
    const g1 = p1.src ? gridCheck(p1.src, N0.tile) : { ok: false, why: 'n1 に絵が無い' };
    R.check('(2a)', '焼き上がり 2 枚 (n0 / n1 に貼られた絵) が make_grid_map.py --check の縦横 3 指標で OK',
      g0.ok && g1.ok && p0.src !== p1.src, { n0: [p0.src, g0], n1: [p1.src, g1] });
    R.check('(2b)', '本番の aStar で 丘の道の入口 → 出口の手前・最上階の階段 → 各ワイバーンが通り、敵のタイルが全部歩ける',
      typeof N0.pathToExit === 'number' && N0.pathToExit > 0 && N0.pathToEnemies.length > 0 && N0.pathToEnemies.every((x) => typeof x === 'number')
        && N1.pathToEnemies.length === 2 && N1.pathToEnemies.every((x) => typeof x === 'number') && N0.enemyWall.length === 0 && N1.enemyWall.length === 0,
      { n0: { from: N0.player, exitInner: N0.exitInner, pathToExit: N0.pathToExit, toEnemies: N0.pathToEnemies, wall: N0.enemyWall },
        n1: { from: N1.player, toEnemies: N1.pathToEnemies, wall: N1.enemyWall } });
    R.check('(2c)', '丘の道 n0 の罠と宝箱が 0 でない', N0.traps > 0 && N0.chests > 0, { traps: N0.traps, chests: N0.chests });
    const area0 = (p0.tw || 0) * (p0.th || 0);
    R.check('(2d)', '丘の道は isCustom (テーマ ' + TOWER + ')・絵が読み込まれ、霧が絵の範囲 (tw x th) 以上晴れている。最上階も isCustom',
      N0.custom && N0.themeId === TOWER && !!p0.loaded && area0 > 0 && !!N0.outdoor && N0.outdoor.exploredNow >= area0 && N1.custom && !!p1.loaded,
      { custom: [N0.custom, N1.custom], theme: N0.themeId, painting0: p0, area0, explored: N0.outdoor && N0.outdoor.exploredNow, painting1: p1 });
    /* ── §3 ── */
    const S = FL.S || {};
    const nbAfter = (FL.after || []).find((e) => !e.boss);
    const snapNB = S.snapAfterT1 && S.iNB != null ? S.snapAfterT1.find((e) => e.i === S.iNB) : null;
    R.check('(3a)', '非ボスを最大の 0.55 → 0.45 (非致死) → 次の手番が来る前に alive=false・__fled・HP > 0 (戦闘後も HP > 0)',
      FL.started && !!snapNB && snapNB.alive === false && snapNB.fled === true && snapNB.hp > 0 && !!nbAfter && nbAfter.fled && nbAfter.hp > 0 && !nbAfter.alive,
      { started: FL.started, startMs: FL.startMs, set: S.turns && S.turns[0], snapAfterT1: snapNB, after: nbAfter, err: S.err });
    const t2 = (S.turns || []).find((t) => t.t === 2);
    R.check('(3b)', 'ボスを一撃で 0 (本番の defeatEnemy) → 撃破でなく追い払い (__fled・__diagDead なし・激怒なし)',
      !!t2 && t2.after.alive === false && t2.after.fled === true && t2.after.diag === false && t2.after.rage === false,
      { t2, err: S.err });
    const wxp = wyv.length ? wyv[0].xp : null;
    /* ワイバーンの名前で入った gainXP = 追い払いの XP (クリア報酬などは別の名前)。XP の増分は記録した全呼び出しの和と一致 (記録外の XP 経路なし) */
    const wname = wyv.length ? wyv[0].name : null;
    const xpIn = (FL.xpCallsAtEnd || []).filter((c) => c[1] === wname);
    const xpW = xpIn.filter((c) => c[0] === wxp);
    const xpSum = (FL.xpCallsAtEnd || []).reduce((n, c) => n + c[0], 0);
    const drops = Object.keys(S.drops || {}).reduce((n, k) => n + S.drops[k], 0);
    R.check('(3c)', '追い払い 1 回で gainXP がちょうど def.xp を 1 回 (2 匹で 2 回)・撃破数が増えない・ドロップ呼び出し 0・__diagDead なし',
      typeof wxp === 'number' && wxp > 0 && xpIn.length === 2 && xpW.length === 2 && FL.xp1 - N1.xp0 === xpSum
        && FL.kills1 === N1.kills0 && drops === 0 && Object.keys(S.drops || {}).length === 5 && !!S.wrapped && S.wrapped.drop === true && (FL.after || []).every((e) => !e.diag),
      { defXp: wxp, name: wname, xpCalls: FL.xpCallsAtEnd, xpDelta: FL.xp1 - N1.xp0, kills: [N1.kills0, FL.kills1], drops: S.drops, diag: (FL.after || []).map((e) => e.diag), wrapped: S.wrapped });
    /* ★[#83] 言い直し (依頼書 #83 §8 既存 golden / §12-0 K9): 追い払い → 塔の母の随伴が done → 制覇 → 帰還。
     *   ⭐ 随伴が起動している (終戦時点で phase が null でない) / done を見た / done より前に dungeonCleared が立っていない、
     *     を足した (⛔ 待ちを伸ばしただけにしない)。done の理由 (到着 / 上限) は (3d) の合否にしない = #83 の受入 (1e) の担当。 */
    const fm = FL.mother || {};
    R.check('(3d)', '2 匹とも追い払うと戦闘が終わり、ノードが落ち着き、塔の母の随伴が done になってから制覇し、帰還の lastResult.cleared === true',
      FL.started && FL.ended && (FL.after || []).length === 2 && FL.after.every((e) => !e.alive && e.fled) && FL.settled === true && FL.bossDefeated === true
        && !!FL.motherAtEnd && !!FL.motherAtEnd.phase && fm.phase === 'done' && FL.clearedBeforeDone === false
        && !!FL.lastResult && FL.lastResult.cleared === true && FL.lastResult.scenarioId === TOWER,
      { ended: FL.ended, encMs: FL.encMs, after: FL.after, settled: FL.settled, bossDefeated: FL.bossDefeated,
        mother: { atEnd: FL.motherAtEnd && FL.motherAtEnd.phase, phase: fm.phase, doneBy: fm.doneBy, followMs: fm.followMs, capMs: fm.capMs, waitMs: FL.motherWaitMs, clearedBeforeDone: FL.clearedBeforeDone },
        lastResult: FL.lastResult, manualClear: FL.manualClear, fallback: S.fallback, fleeLog: FL.fleeLog });
    const sp = N0.spider || {};
    R.check('(3e)', '他の敵 (廃墟の大蜘蛛) は HP 0.4 で checkFleeEnemies に拾われず、HP 0 では普通に撃破される',
      sp.idx >= 0 && sp.nonLethalCaught === 0 && sp.afterNonLethal.alive === true && sp.afterNonLethal.fled === false
        && sp.afterLethal.alive === false && sp.afterLethal.fled === false && sp.afterLethal.diag === true && sp.afterLethal.killsDelta === 1,
      sp);
    /* ══════════ (0c) ══════════ */
    R.check('(0c)', '[装置] 全ページで pageerror 0 件', ctx.booted > 0 && ctx.errs.length === 0, '起動 ' + ctx.booted + ' 回 / pageerror ' + J(ctx.errs.slice(0, 3)));
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await sleep(200);   // console イベントの取りこぼしを避ける
    for (const p of pages) await p.close().catch(() => {});
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_tower_mother_');
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
