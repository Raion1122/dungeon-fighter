#!/usr/bin/env node
/*
 * verify_kobold_warren.js — 実装依頼書 #103「コボルドの巣穴」の受入ドライバ
 *   (依頼書 実装依頼書/2026-10-28_kobold-warren.md §8 = 受入条件の唯一の正)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_kobold_warren.js                        # 素
 *   node tools/verify_kobold_warren.js --negative             # 先に素の基準 → 変異 10 本 (port 10643〜10652)
 *   node tools/verify_kobold_warren.js --negative --only snareastrap,typerng
 *   node tools/verify_kobold_warren.js --mutate locked        # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome / git が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 登録の整合は**ブラウザに載った実体どうし**で突き合わせる (tavern.html の scenarios と、同じページに載った
 *     js/world-map.js の WORLD_MAP.SITES / UNLOCK / NODES、world.html の WORLD_MAP と DOM)。⛔ 写経しない
 *     (ドライバが持つ固定値は依頼書が決めた名前 = id "kobold-warren" / 拠点 "village_s" / 港町 "phlan" /
 *      罠の種類 "pit" "rockfall" と、§12-1 (5) の MASK が決めた祭壇の矩形だけ。本筋の並びはページの
 *      scenarios の「side でない」並びから取る)。
 *   - 仕掛け罠は本番の runEncounter を回して観測する (§3)。手番の関数のうち playerAttackTurn / allyAttackTurn だけを
 *     差し替え (族長の手番が 3 回来るまで何もしない → 来たら全員を本番の defeatEnemy で倒して戦闘を終える)、
 *     enemyAttackTurn は**本番の関数をそのまま呼ぶ包み**で手番ごとの __snareProbe / traps.length の増分を数える。
 *     (3c)(3d) のセーヴの成否は d20 と標的の選択 (pickEnemyTarget) を呼び出しの間だけ差し替えて koboldSnare を直接呼ぶ
 *     (戦闘の外 = 族長の __snareUsed は立たない。§3 の戦闘とは独立)。
 *   - 経路は本番の aStar (⛔ 自前の BFS を書かない)。焼き上がりの検算は本番の道具 make_grid_map.py --check。
 *   - (6a) は「着手前」= git の BASE_REV (#103 項目1 の commit。index.html は項目2 の前) の index.html を同じ origin で
 *     配り (?__base=1)、同じ種の乱数で spawnTraps を 1 回だけ回して、罠の座標・種類・spawnTraps の中の
 *     Math.random の呼び出し回数・その次の乱数を比べる。⭐ 罠の座標はシャッフル (候補の Fisher-Yates) で決まり、
 *     種類を決める trapTypeForNode はシャッフルの**後**で呼ばれる ⇒ 種類のために乱数を 1 つ足しても**このノードの
 *     座標は動かない** (後続のスポーンだけがずれる)。だから「呼び出し回数」と「次の乱数」まで比べる (変異 typerng)。
 *   - 強さ (⑤) は assert にしない (別の道具で記録する。依頼書 §12 用のメモ)。
 *
 * ■ 依頼書 §8 からの言い直し (実装に合わせた点)
 *   - 仕掛け罠の入口は「bossAction === "normal" の後」でなく**ボスの行動選択 (pickBossAction) の前** (項目2 の変更。
 *     最初の手番が強打に当たって後ろへずれないため)。(3a) は「族長の最初の enemyAttackTurn で発動」をそのまま測る。
 *   - 地図の格子は 64px・丘 23x15 / 祭壇 23x16 (依頼書 §12-1 (3))。祭壇の矩形 = 絵ローカル col 18-21 / row 4-11 を
 *     global (+17, +6) へ写した col 35-38 / row 10-17 (MASK §12-1 (5))。
 *   - (2c) の宝箱は #87 (道中の宝箱の廃止) により撤退の腕 ?roadchest=0 の n0 で数える (verify_tower_mother と同じ)。
 *   - (4a) の「既存シナリオは今日の語り」は、(6a) と同じページで既存 7 シナリオの罠を本番の triggerTrapOnPlayer で
 *     踏ませた語りが BASE_REV の語りと一致すること。⭐ 加えて第 2 引数 (文脈の語り) が種類の語りより優先されること。
 *   - (4c) は酒場 2 回の帰還に加え、index 側の勝利の一言 (__redEggNarrated) が立ったことも見る。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] __koboldWarrenTV.ENEMY_TYPES.koboldChief / window.buildKoboldWarrenRun / window.koboldSnare / __snareProbe が見える
 *      (0b) [装置] kobold-warren の 2 ノード (n0 start / n1 boss) が組み上がり、族長 1・コボルドが n0 / n1 に 1 体以上 (台帳と実体の両方)
 *      (0c) [装置] 全ページで pageerror 0 件 (本ドライバ独自)
 *   §1 (1a) tavern の kobold-warren (side・locked:false) と WORLD_MAP の SITES / UNLOCK (tavern と world.html) が一致・village_s が拠点 (データと DOM)
 *      (1b) ALL_MAIN_SCENARIOS に kobold-warren が無く、本筋 (side でない scenarios) と同じ並び
 *      (1c) cleared=[] → 卓は「廃坑 (本筋の 1 本目) + 巣穴」・本筋は廃坑。8 回引き直しても変わらない
 *      (1d) cleared = 本筋 6 本 (と +巣穴) → 本筋は null
 *      (1e) cleared=[] の world.html で WORLD_MAP.findWalkPath("phlan", "village_s") が null でない
 *   §2 (2a) 焼き上がり 2 枚 (n0 / n1 に実際に貼られた絵) が make_grid_map.py --check の縦横 3 指標で OK
 *      (2b) 本番の aStar で n0 入口 → 出口の手前・各敵、n1 入口 → 族長 (祭壇の前)・各敵が通る。敵のタイルは全部歩ける。祭壇のタイルは全部壁
 *      (2c) 罠が n0 に 1 つ (pit)・n1 に 1 つ (rockfall)。玄室の宝箱が n0 に出る (?roadchest=0 の腕)
 *      (2d) n0 は isCustom (テーマ kobold-warren)・絵が読み込まれ、霧が絵の範囲以上晴れている / n1 も isCustom・絵あり・霧は晴らさない
 *   §3 (3a) 族長の最初の手番で __snareProbe に 1 件 (族長・DC・ロール・成否)。その手番で traps.length は変わらない
 *      (3b) 族長の 2 回目以降の手番 (2 回以上) では発動しない・__snareUsed が立つ
 *      (3c) d20=1 → 標的が prone・HP が 1〜6 減る / d20=20 → どちらも起きない
 *      (3d) リングオブフリーアクション + d20=1 → prone は付かない・ダメージは受ける
 *      (3e) 他の敵は仕掛け罠を使わない (ENEMY_TYPES で snareDC を持つのは koboldChief だけ / §3 の戦闘でコボルドの手番の発動 0)
 *   §4 (4a) n0 の罠を踏むと落とし穴の語り (頭・仲間)・n1 は落石の語り・既存 7 シナリオは BASE_REV と同じ語り・第 2 引数が優先
 *      (4b) tavern.html?warren=0 で依頼が無く開始直後の卓が「廃坑 + 森の予告 (本筋の 2 本目)」/ world.html?warren=0 で village_s が中継点。
 *           (1a)(1c)(4b) の条件を ON/OFF へ当てて反転
 *      (4c) 帰還 (kobold-warren クリア) で印が立ち初回だけ keeper がしゃべる・2 回目は黙る・index の勝利の一言が立つ
 *   §6 (6a) 既存 7 シナリオで、同じ種の乱数のもと spawnTraps の罠 (座標・種類 damage)・乱数の呼び出し回数・次の乱数が BASE_REV と同じ
 *   ⛔ 測らないこと (依頼書 §8): 地図の絵の出来・族長の見た目・仕掛け罠の演出の長さ / 依頼の文面 / 謝礼の額 / 主人の台詞
 *      (卵の台詞は keeper が「1 回しゃべった」ことだけを見る。文面は比べない)。⑤ 強さは記録のみ。
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html / tavern.html / js/df-mapdef.js / js/world-map.js は**起動時に 1 回だけ
 *     readFileSync して凍結**し、変異はその文字列をメモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。
 *     他のファイルは都度ディスクから配る。favicon.ico は 204 を返す (404 の console.error を出さない)。
 *   - BASE_REV の index.html は git show で起動時に 1 回だけ読み、index.html?__base=1 のときだけ配る (同じ origin)。
 *   - 起動時に全変異のアンカーを**原本**で検算する (配信 4 ファイル合算でちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     崩れたら素でも exit 3。罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持つ。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」+ 注入行の実行 > 0。
 *     担当は**実走で決めた** (--mutate で 1 本ずつ)。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0` (verify_tower_mother と同じ型)。
 *
 * ■ ポート = **10642** (素) / 変異 **10643〜10652** (10 本・MUTATIONS の並び順)。次の新規ドライバ base = 10653。
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
const PORT = parseInt(arg('port', '10642'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前 (データ。期待値の写しではない) */
const KW = 'kobold-warren';
const KW_SITE = 'village_s';
const PORT_TOWN = 'phlan';           // 港町フラン (js/world-map.js の NODES.phlan)
const N0_TRAP = 'pit', N1_TRAP = 'rockfall';
const BASE_REV = '2a6333b';          // #103 項目1 (index.html は項目2 の前 = 着手前)
/* 祭壇と卵 (MASK §12-1 (5) の 絵ローカル col 18-21 / row 4-11) を global (+17, +6) へ */
const ALTAR = { c1: 35, c2: 38, r1: 10, r2: 17 };
const BOARD_KEY = 'dragonfighters.questBoard';
const CLEARED_KEY = 'dragonfighters.cleared';
const LAST_RESULT_KEY = 'dragonfighters.lastResult';
const VIEW = { width: 1280, height: 800 };
const N_1C = 8;                      // (1c) 引き直しの回数 (解放済みが 2 件 = 決定的。依頼書 §8 の 8 回)
const CHIEF_TURNS = 3;               // §3 の戦闘で族長の手番を何回見るか ((3b) は 2 回目以降)
const ENC_START_WAIT_MS = 90000;
const ENC_END_WAIT_MS = 120000;
const PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガルド', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ',   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ',   trait: null, line: null },
];

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html', F_TAVERN = 'tavern.html', F_MAPDEF = 'js/df-mapdef.js', F_WMAP = 'js/world-map.js';
const SERVED = [F_INDEX, F_TAVERN, F_MAPDEF, F_WMAP];
const PRISTINE = {};
for (const f of SERVED) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
let BASE_INDEX = null;
try { BASE_INDEX = execFileSync('git', ['-C', ROOT, 'show', BASE_REV + ':' + F_INDEX], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
catch (e) { console.error('[vet] git show ' + BASE_REV + ':index.html に失敗: ' + e.message); process.exit(2); }
if (BASE_INDEX.indexOf('koboldChief') >= 0) vetFail('BASE_REV ' + BASE_REV + ' の index.html に koboldChief が在る (着手前でない)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。逐語は HEAD 2c8a255 (項目2 の実装後) の行で取った。
 * ⚠ どれも 1 行 → 1 行 (行数不変)。⚠ 他ドライバのアンカーと重ならない行を選んだ (罠E)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const WARREN_RETIRE = '  /* ══ 撤退スイッチ ?warren=0 (実装依頼書 #103 §7) ═════════════════════════════';
const MUTATIONS = {
  /* ⭐ 罠 1: 仕掛け罠を「traps[] へ罠を 1 つ足す」形にする (族長の足元に damage の罠を置いて手番を終える) */
  snareastrap: [
    { file: F_INDEX, from: '        await koboldSnare(idx);',
      to: '        { const __m = { tx: Math.floor((enemy.x + def.displaySize / 2) / TILE_SIZE), ty: Math.floor((enemy.y + def.displaySize / 2) / TILE_SIZE), type: "damage", damageDice: "1d6", found: false, triggered: false, disarmed: false, rearmed: false, owner: null, _disarmRolled: false, el: null }; traps.push(__m); createTrapDom(__m, traps.length - 1); ' + HIT('snareastrap') + '; }   /* ★変異snareastrap */' }],
  /* __snareUsed を立てない (毎手番使う) */
  snareevery: [
    { file: F_INDEX, from: '        enemy.__snareUsed = true;',
      to: '        ' + HIT('snareevery') + ';   /* ★変異snareevery */' }],
  /* ⭐ 罠 2: 種類を決めるのに Math.random を 1 回足す */
  typerng: [
    { file: F_INDEX, from: '      if (!decl) return "damage";',
      to: '      Math.random(); ' + HIT('typerng') + '; if (!decl) return "damage";   /* ★変異typerng */' }],
  /* NODE_EXTRA_SPAWN_KINDS から n1 の search を外す */
  nosearch: [
    { file: F_INDEX, from: '      t["kobold-warren"] = { n0: ["search", "loot"], n1: ["search"] };',
      to: '      t["kobold-warren"] = (' + HIT('nosearch') + ', { n0: ["search", "loot"] });   /* ★変異nosearch */' }],
  /* kobold-warren を屋外テーマ (FIELD_THEME_IDS) に入れる。⚠ FIELD_THEME_IDS の宣言 (var = 巻き上げで undefined) より後の行で実行時に足す。
     ⚠ 宣言の行そのものは verify_tower_mother のアンカー (罠E) なので、直後の LINT_PAINTING_ASPECTS の行で握る */
  fieldtheme: [
    { file: F_MAPDEF, from: '  var LINT_PAINTING_ASPECTS = [',
      to: '  FIELD_THEME_IDS["kobold-warren"] = 1; ' + HIT('fieldtheme') + '; var LINT_PAINTING_ASPECTS = [   /* ★変異fieldtheme */' }],
  /* ⭐ 罠 3 の裏: 巣穴を locked:true / unlockAfter:"goblin-mine" にする (撤退スイッチの直前で実行時に書き換える) */
  locked: [
    { file: F_TAVERN, from: WARREN_RETIRE,
      /* ⚠ 原本の行は複数行コメントの開き = 置換後も開いたまま残す (閉じると後続のコメント行がコードになり tavern ごと落ちる) */
      to: '  (function () { var s = scenarios.find(function (x) { return x.id === "kobold-warren"; }); if (s) { s.locked = true; s.unlockAfter = "goblin-mine"; ' + HIT('locked') + '; } })();' + WARREN_RETIRE + ' ★変異locked' }],
  /* ALL_MAIN_SCENARIOS に巣穴を足す (宣言の直後の行で実行時に push) */
  inmain: [
    { file: F_TAVERN, from: '  const FORCE_POSTGAME_UNLOCK = (function () {',
      to: '  ALL_MAIN_SCENARIOS.push("kobold-warren"); ' + HIT('inmain') + '; const FORCE_POSTGAME_UNLOCK = (function () {   /* ★変異inmain */' }],
  /* village_s を kind: "way" のままにする */
  nositeflag: [
    { file: F_WMAP, from: '    village_s: { kind: "site", x:  736, y: 864, label: "南の村", desc: "湖の南の農村。丘の下にコボルドの巣穴" },',
      to: '    village_s: (' + HIT('nositeflag') + ', { kind: "way",  x:  736, y: 864 }),   /* ★変異nositeflag */' }],
  /* すべての敵に snareDC を付ける (検証シームの直前で ENEMY_TYPES 全体へ実行時に付与) */
  snareall: [
    { file: F_INDEX, from: '    window.koboldSnare = koboldSnare;',
      to: '    (function () { var n = 0; Object.keys(ENEMY_TYPES).forEach(function (k) { var d = ENEMY_TYPES[k]; if (d && typeof d === "object" && !d.snareDC) { d.snareDC = 12; d.snareDice = "1d6"; n++; } }); if (n) '
        + HIT('snareall') + '; })();   /* ★変異snareall */ window.koboldSnare = koboldSnare;' }],
  /* リングオブフリーアクションでダメージも防ぐ */
  ringall: [
    { file: F_INDEX, from: '      if (hasFree) { rec.ring = true; } else { applyStatus(unit, "prone", 1); rec.prone = true; }',
      to: '      if (hasFree) { rec.ring = true; ' + HIT('ringall') + '; window.__snareProbe.push(rec); return; } else { applyStatus(unit, "prone", 1); rec.prone = true; }   /* ★変異ringall */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた。 */
/* ⚠ 依頼書の予想より広い 3 本 (理由は構造的 = 狭める直し方は無い):
 *   fieldtheme … resolve() がカスタム幾何ごと捨てて既定 (goblin-mine) の地図へ落ちる = 絵・族長・経路ごと消える
 *                (verify_tower_mother K18 と同じ「罠 3 の実害」)。(0b)(2a)(2b)(2d)(3a)〜(3d)(4c) が赤
 *   locked     … (1a) は「巣穴が locked:false」を、(4b) は「ON で (1a)(1c) の条件が真」を測る = 同じ欠陥を 3 節が見る
 *   nositeflag … (4b) の ON 腕は「village_s が拠点」を含む (依頼書の「ON/OFF の両方へ当てて反転」) */
const SHATTER = ['(0b)', '(2a)', '(2b)', '(2d)', '(3a)', '(3b)', '(3c)', '(3d)', '(4c)'];
const NEG_EXPECT = {
  snareastrap: ['(3a)'],
  snareevery:  ['(3b)'],
  typerng:     ['(6a)'],
  nosearch:    ['(2c)'],
  fieldtheme:  SHATTER.slice(),
  locked:      ['(1a)', '(1c)', '(4b)'],
  inmain:      ['(1b)'],
  nositeflag:  ['(1a)', '(4b)'],
  snareall:    ['(3e)'],
  ringall:     ['(3d)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = {
  snareastrap: [], snareevery: [], typerng: [], nosearch: [], fieldtheme: [], locked: [], inmain: [], nositeflag: [], snareall: [], ringall: [],
};
/* 依頼書 §8 の予想 */
const NEG_PREDICTED = {
  snareastrap: ['(3a)'], snareevery: ['(3b)'], typerng: ['(6a)'], nosearch: ['(2c)'], fieldtheme: ['(2d)'],
  locked: ['(1c)'], inmain: ['(1b)'], nositeflag: ['(1a)'], snareall: ['(3e)'], ringall: ['(3d)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 10) vetFail('変異は 10 本まで (ポート 10643〜10652)');
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
    const tot = SERVED.reduce((n, f) => n + countOf(PRISTINE[f], e.from), 0);
    const c = countOf(PRISTINE[file], e.from);
    if (c !== 1 || tot !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + file + ' に ' + c + ' 件・配信 4 ファイル合算 ' + tot + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE[file], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    if (/[\r\n]/.test(e.from + e.to)) vetFail('変異 ' + key + ' が改行を含む');
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
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で 1 箇所 (配信 4 ファイル合算)・行数不変・他ドライバとアンカーの重なり 0'
  + ' / (6a) の基準 = git ' + BASE_REV + ':index.html (' + BASE_INDEX.length + ' 文字)');

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
  const baseBuf = Buffer.from(BASE_INDEX, 'utf8');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const q = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?')) : '';
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === 'favicon.ico') { res.statusCode = 204; res.end(); return; }
        if (rel === F_INDEX && /[?&]__base=1(&|$)/.test(q)) { res.setHeader('Content-Type', MIME['.html']); res.end(baseBuf); return; }
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
  '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(4a)', '(4b)', '(4c)', '(6a)'];
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
    o.facts = window.__TAVERN_TV ? window.__TAVERN_TV.boardFacts() : null;   /* 文字列の id / null */
    const b = window.__TAVERN_TV ? window.__TAVERN_TV.board() : null;
    o.seats = (b && b.seats) ? Object.values(b.seats) : null;
    o.sites = window.WORLD_MAP ? Object.assign({}, window.WORLD_MAP.SITES) : null;
    o.unlock = window.WORLD_MAP ? Object.assign({}, window.WORLD_MAP.UNLOCK) : null;
    o.node = window.WORLD_MAP ? Object.assign({}, window.WORLD_MAP.NODES[SITE]) : null;
    o.allMain = (typeof ALL_MAIN_SCENARIOS !== 'undefined') ? ALL_MAIN_SCENARIOS.slice() : null;
  } catch (e) { o.err = String((e && e.message) || e); }
  return o;
};
const WORLD_SNAP = (SITE, FROM) => {
  const el = document.getElementById('worldNode_' + SITE);
  const W = window.WORLD_MAP;
  let p = null;
  try { p = W ? W.findWalkPath(FROM, SITE) : null; } catch (e) { p = 'ERR ' + e.message; }
  return { cls: el ? el.className : null,
           sites: W ? Object.assign({}, W.SITES) : null, unlock: W ? Object.assign({}, W.UNLOCK) : null,
           node: W ? Object.assign({}, W.NODES[SITE]) : null, from: W ? Object.assign({}, W.NODES[FROM]) : null,
           path: Array.isArray(p) ? p.slice() : p };
};
/* index: いまのノードの観測 (n0 / n1 共通)。⚠ page.evaluate へは toString で渡して new Function で戻す */
const NODE_SNAP = (ALT) => {
  const o = {};
  try { o.scen = scenarioId; } catch (e) { o.scen = null; }
  o.nodes = (RUN && RUN.graph) ? RUN.graph.nodes.map((n) => n.id + ':' + n.kind) : null;
  o.cur = currentNodeId;
  o.custom = !!(MAPDEF && MAPDEF.isCustom); o.themeId = MAPDEF ? MAPDEF.themeId : null;
  o.tile = TILE_SIZE;
  o.outdoor = window.__outdoorRevealProbe ? window.__outdoorRevealProbe() : null;
  /* bakeTile = 焼き上がりの 1 マスの画素 (絵の実寸 / マス数)。⚠ ページの TILE_SIZE (96 = 表示の 1 マス) とは別物 */
  o.paintings = roomPaintings.map((p) => ({ src: p.img && p.img.src ? decodeURIComponent(p.img.src.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]) : null,
    loaded: !!p.loaded, tw: p.tw, th: p.th, nw: p.img ? p.img.naturalWidth : null, nh: p.img ? p.img.naturalHeight : null,
    bakeTile: (p.img && p.tw && p.th && p.img.naturalWidth / p.tw === p.img.naturalHeight / p.th) ? p.img.naturalWidth / p.tw : null }));
  o.traps = window.__koboldWarrenTV ? window.__koboldWarrenTV.traps() : traps.map((t) => ({ tx: t.tx, ty: t.ty, type: t.type }));
  o.trapsLen = traps.length;
  o.chests = roomChests.length;
  o.player = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
  const tileOf = (e) => ({ tx: Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), ty: Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE) });
  o.enemies = enemies.map((e, i) => Object.assign({ i, type: e.type, boss: !!(e.def && e.def.isBoss), alive: !!e.alive, inactive: !!e.inactive }, tileOf(e)));
  o.enemyWall = o.enemies.filter((e) => isTileWall(e.tx, e.ty)).map((e) => e.type + '@' + e.tx + ',' + e.ty);
  o.pathToEnemies = o.enemies.map((e) => { const q = aStar(o.player.tx, o.player.ty, e.tx, e.ty); return q ? q.length : null; });
  const nd = RUN.graph.nodes.find((n) => n.id === currentNodeId);
  const ex = nd && nd.exits && nd.exits[0];
  const DV = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
  if (ex) {
    const d = DV[ex.dir] || [0, 0];
    o.exitInner = [ex.at[0] - d[0], ex.at[1] - d[1]];
    const p = aStar(o.player.tx, o.player.ty, o.exitInner[0], o.exitInner[1]);
    o.pathToExit = p ? p.length : null;
  }
  if (ALT) {
    const wall = [], open = [];
    for (let r = ALT.r1; r <= ALT.r2; r++) for (let c = ALT.c1; c <= ALT.c2; c++) (isTileWall(c, r) ? wall : open).push(c + ',' + r);
    o.altar = { wall: wall.length, open };
  }
  o.encActive = !!encounterActive;
  return o;
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
  async function prep(page, cleared, extra) {
    await page.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
    await page.evaluate((cl, CK, X) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (cl) localStorage.setItem(CK, JSON.stringify(cl));
      if (X) for (const k of Object.keys(X.ls || {})) localStorage.setItem(k, X.ls[k]);
      if (X) for (const k of Object.keys(X.ss || {})) sessionStorage.setItem(k, X.ss[k]);
    }, cleared, CLEARED_KEY, extra || null);
  }
  const idxSeed = (sid) => ({ ls: { 'dragonfighters.xp': '20000' },
    ss: { 'dragonfighters.currentScenario': sid, 'dragonfighters.partyMembers': J(PARTY) } });
  async function gotoIndex(page, sid, q) {
    await prep(page, null, idxSeed(sid));
    await page.goto(base + F_INDEX + (q || '?diag=1'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction("typeof RUN !== 'undefined' && RUN && typeof enterNode === 'function' && typeof spawnTraps === 'function'", { timeout: 90000 });
    ctx.booted++;
  }
  let lastResultRaw = null;
  try {
    /* ══════════ tavern ══════════ */
    const tp = await newPage();
    const openTav = async (q) => {
      await tp.goto(base + F_TAVERN + (q || ''), { waitUntil: 'load', timeout: 60000 });
      await tp.waitForFunction(() => { try { return typeof scenarios !== 'undefined' && !!window.__TAVERN_TV; } catch (e) { return false; } }, { timeout: 30000 });
      await tp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await sleep(150);
      ctx.booted++;
      return tp.evaluate(TAV_SNAP, KW_SITE);
    };
    const redraw = async (q) => { await tp.evaluate((BK) => localStorage.removeItem(BK), BOARD_KEY); return openTav(q); };

    await prep(tp, []);
    const on = await openTav('');
    const onDraws = [on.seats];
    for (let i = 1; i < N_1C; i++) onDraws.push((await redraw('')).seats);
    await prep(tp, []);
    const off = await openTav('?warren=0');
    const offDraws = [off.seats];
    for (let i = 1; i < N_1C; i++) offDraws.push((await redraw('?warren=0')).seats);
    /* 本筋の並び = ページの scenarios の「side でない」並び (データから。⛔ 写経しない) */
    const mainIds = (on.scen || []).filter((s) => !s.side).map((s) => s.id);
    await prep(tp, mainIds);
    const c6 = await openTav('');
    await prep(tp, mainIds.concat([KW]));
    const c7 = await openTav('');

    /* ══════════ world ══════════ */
    const wp = await newPage();
    const openWorld = async (q) => {
      await prep(wp, []);
      await wp.goto(base + 'world.html' + (q || ''), { waitUntil: 'load', timeout: 60000 });
      await wp.waitForFunction((S) => !!window.WORLD_MAP && !!document.getElementById('worldNode_' + S), { timeout: 30000 }, KW_SITE);
      await sleep(800);
      ctx.booted++;
      return wp.evaluate(WORLD_SNAP, KW_SITE, PORT_TOWN);
    };
    const wOn = await openWorld('');
    const wOff = await openWorld('?warren=0');
    await tp.close().catch(() => {}); await wp.close().catch(() => {});

    /* ── §1 / §4b の判定 ── */
    const kwOf = (s) => (s.scen || []).find((x) => x.id === KW) || null;
    const A1 = (s, w) => {
      const t = kwOf(s);
      if (!t || !s.sites || !s.unlock || !w || !w.sites) return { ok: false, why: '巣穴が scenarios / SITES に無い (scenarios に ' + (t ? '在る' : '無い') + ')' };
      const ids = s.scen.map((x) => x.id).sort().join('|');
      const why = [];
      if (!(t.side === true && t.locked === false && t.unlockAfter === null)) why.push('scenarios の巣穴 ' + J(t));
      if (Object.keys(s.sites).sort().join('|') !== ids) why.push('tavern の SITES の id 集合 ≠ scenarios');
      if (Object.keys(w.sites).sort().join('|') !== ids) why.push('world.html の SITES の id 集合 ≠ scenarios');
      if (s.sites[KW] !== KW_SITE || w.sites[KW] !== KW_SITE) why.push('SITES[巣穴] ' + s.sites[KW] + '/' + w.sites[KW]);
      for (const x of s.scen) {
        const u = x.locked ? x.unlockAfter : null;
        if ((s.unlock[x.id] || null) !== u) why.push('UNLOCK[' + x.id + ']=' + s.unlock[x.id] + ' ≠ unlockAfter ' + u);
        if ((w.unlock[x.id] || null) !== u) why.push('world.html UNLOCK[' + x.id + ']=' + w.unlock[x.id] + ' ≠ unlockAfter ' + u);
      }
      if (!s.node || s.node.kind !== 'site' || !w.node || w.node.kind !== 'site' || !/\bworldNode-site\b/.test(w.cls || '')) why.push(KW_SITE + ' が拠点でない ' + J([s.node, w.node, w.cls]));
      return { ok: why.length === 0, why: why.join(' / ') };
    };
    const a1On = A1(on, wOn), a1Off = A1(off, wOff);
    R.check('(1a)', 'tavern の巣穴 (side・locked:false) と WORLD_MAP の SITES / UNLOCK (tavern と world.html) が一致・' + KW_SITE + ' が拠点 (データと DOM)',
      a1On.ok, a1On);
    R.check('(1b)', 'ALL_MAIN_SCENARIOS に巣穴が無く、本筋 (side でない scenarios) と同じ並び',
      Array.isArray(on.allMain) && on.allMain.indexOf(KW) < 0 && on.allMain.join('|') === mainIds.join('|') && J(on.main) === J(mainIds) && mainIds.length === 6,
      { allMain: on.allMain, main: on.main, mainIds });
    const MINE = mainIds[0], FOREST = mainIds[1];
    const pairIs = (s, a, b) => Array.isArray(s) && s.length === 2 && s.indexOf(a) >= 0 && s.indexOf(b) >= 0;
    const C1 = (s, draws) => !!s.facts && J((s.facts.unlocked || []).slice().sort()) === J([MINE, KW].sort()) && s.facts.frontier === MINE
      && draws.length === N_1C && draws.every((d) => pairIs(d, MINE, KW));
    const c1On = C1(on, onDraws);
    R.check('(1c)', 'cleared=[] → 卓は「' + MINE + ' + 巣穴」・本筋は ' + MINE + '・' + N_1C + ' 回引き直しても変わらない',
      c1On, { facts: on.facts, draws: onDraws });
    R.check('(1d)', 'cleared = 本筋 6 本 (と +巣穴) → 本筋は null (巣穴を本筋にしない)',
      !!c6.facts && !!c7.facts && c6.facts.frontier === null && c7.facts.frontier === null,
      { c6: c6.facts && c6.facts.frontier, c7: c7.facts && c7.facts.frontier });
    /* ⚠ findWalkPath の戻り値は「出発点を含まない」歩く順のノード列 (同じ点なら []) */
    R.check('(1e)', 'cleared=[] の world.html で WORLD_MAP.findWalkPath("' + PORT_TOWN + '", "' + KW_SITE + '") が null でない (道が通る)',
      Array.isArray(wOn.path) && wOn.path.length >= 1 && wOn.path.indexOf(PORT_TOWN) < 0 && wOn.path[wOn.path.length - 1] === KW_SITE,
      { path: wOn.path, from: wOn.from && wOn.from.label });
    /* (4b) の条件 = 酒場に巣穴が無い・卓は「廃坑 + 森の予告」・world.html の village_s が中継点 (データと DOM) */
    const offOk = !kwOf(off) && !!off.facts && off.facts.nextLocked === FOREST && off.facts.frontier === MINE
      && offDraws.length === N_1C && offDraws.every((d) => pairIs(d, MINE, FOREST))
      && !!wOff.node && wOff.node.kind === 'way' && /\bworldNode-way\b/.test(wOff.cls || '') && !(wOff.sites && wOff.sites[KW]);
    const W4 = (s, w) => !!kwOf(s) && !!(w.sites && w.sites[KW]) && !!w.node && w.node.kind === 'site' && /\bworldNode-site\b/.test(w.cls || '');
    const onTriple = [a1On.ok, c1On, W4(on, wOn)];
    const offTriple = [a1Off.ok, C1(off, offDraws), W4(off, wOff)];
    R.check('(4b)', 'tavern.html?warren=0 で巣穴が無く開始直後の卓が「' + MINE + ' + 森の予告 ' + FOREST + '」/ world.html?warren=0 で ' + KW_SITE + ' が中継点・(1a)(1c)(4b) の条件が ON/OFF で反転',
      offOk && onTriple.every((x) => x === true) && offTriple.every((x) => x === false),
      { offOk, on: onTriple, off: offTriple, offFacts: off.facts, offDraws: offDraws.slice(0, 3), worldOff: { cls: wOff.cls, node: wOff.node } });

    /* ══════════ index: n0 ══════════ */
    const ip = await newPage();
    await gotoIndex(ip, KW);
    await ip.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(2500);
    const N0 = await ip.evaluate((SNAP) => {
      const o = (new Function('return (' + SNAP + ')'))()(null);
      const tv = window.__koboldWarrenTV;
      o.seams = { tvChief: !!(tv && tv.ENEMY_TYPES && tv.ENEMY_TYPES.koboldChief && tv.ENEMY_TYPES.koboldChief.snareDC),
                  build: typeof window.buildKoboldWarrenRun, snare: typeof window.koboldSnare, probe: Array.isArray(window.__snareProbe) };
      /* (0b) 台帳 (buildKoboldWarrenRun の戻り値) */
      try {
        const run = window.buildKoboldWarrenRun();
        o.ledger = run.nodes.map((n) => ({ id: n.id, kind: n.kind,
          slots: [].concat(...n.mapDef.rooms.map((r) => (r.enemySlots || []).map((s) => s[2]))),
          boss: [].concat(...n.mapDef.rooms.map((r) => r.bossSlot ? [r.bossSlot[2]] : [])) }));
      } catch (e) { o.ledger = 'ERR ' + e.message; }
      /* (3e) の静的な半分: snareDC を持つ敵の型 */
      o.snareTypes = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k] && ENEMY_TYPES[k].snareDC);
      /* (4a) n0 の罠を頭・仲間に踏ませる (本番の triggerTrapOnPlayer / triggerTrapOnAlly)。語りは showDMMessage の包みで拾う */
      const said = [];
      const _dm = showDMMessage;
      showDMMessage = function (t) { said.push(String(t)); return _dm.apply(this, arguments); };
      o.dmWrapped = (showDMMessage === window.showDMMessage);
      const hp0 = hp, mx0 = maxHp;
      maxHp = Math.max(maxHp, 999); hp = maxHp;
      o.tt = window.__koboldWarrenTV.TRAP_TYPES();
      /* ⭐ 踏ませる罠は traps[] の外の使い捨て (種類 = 本番の trapTypeForNode())。罠が湧いたかは (2c) の担当 = (4a) を湧きから切り離す */
      o.n0Trap = {};
      {
        const t = { tx: -1, ty: -1, type: window.__koboldWarrenTV.trapTypeForNode(), damageDice: '1d6', found: false, triggered: false, el: null };
        o.n0Trap.type = t.type;
        said.length = 0; triggerTrapOnPlayer(t); o.n0Trap.player = said.slice();
        said.length = 0; triggerTrapOnPlayer(t, '引数の語り(検証)'); o.n0Trap.arg = said.slice();
        const al = allies.find((a) => a.alive);
        if (al) { const ah = al.hp; al.hp = 999; said.length = 0; triggerTrapOnAlly(t, al); o.n0Trap.ally = said.slice(); al.hp = ah; }
      }
      showDMMessage = _dm;
      hp = hp0; maxHp = mx0;
      o.allies = allies.length;
      return o;
    }, NODE_SNAP.toString());
    /* (2c) の宝箱は撤退の腕 ?roadchest=0 の起動ノード n0 で数える */
    const ipRC = await newPage();
    await gotoIndex(ipRC, KW, '?diag=1&roadchest=0');
    const N0rc = await ipRC.evaluate(() => ({ cur: currentNodeId, traps: traps.length, chests: roomChests.length }));
    await ipRC.close().catch(() => {});

    /* ══════════ index: n1 ══════════ */
    const N1 = await ip.evaluate(async (SNAP, ALT) => {
      await enterNode('n1', 'right');
      await new Promise((r) => setTimeout(r, 1200));
      const o = (new Function('return (' + SNAP + ')'))()(ALT);
      o.chiefIdx = enemies.findIndex((e) => e.type === 'koboldChief');
      /* (4a) n1 の罠 */
      const said = [];
      const _dm = showDMMessage;
      showDMMessage = function (t) { said.push(String(t)); return _dm.apply(this, arguments); };
      const hp0 = hp, mx0 = maxHp;
      maxHp = Math.max(maxHp, 999); hp = maxHp;
      o.n1Trap = {};
      {
        const t = { tx: -1, ty: -1, type: window.__koboldWarrenTV.trapTypeForNode(), damageDice: '1d6', found: false, triggered: false, el: null };
        o.n1Trap.type = t.type;
        said.length = 0; triggerTrapOnPlayer(t); o.n1Trap.player = said.slice();
      }
      showDMMessage = _dm;
      /* (3c)(3d) koboldSnare を直接呼ぶ。標的は頭に固定 (pickEnemyTarget を呼び出しの間だけ差し替え)・d20 を固定 */
      const ci = o.chiefIdx;
      o.direct = { encBefore: !!(encounterActive || encounterRunning) };
      if (ci >= 0) {
        const _pick = pickEnemyTarget, _d20 = d20;
        const ringIdx = accessories.findIndex((a) => a && a.freeAction);
        const acc0 = currentAccessoryIndices.slice();
        const one = async (roll, ring) => {
          removeStatus('player', 'prone');
          hp = maxHp;
          for (let i = 0; i < currentAccessoryIndices.length; i++) currentAccessoryIndices[i] = 0;
          if (ring) currentAccessoryIndices[0] = ringIdx;
          pickEnemyTarget = function () { return { kind: 'leader', zone: 'front', cx: playerX + 48, cy: playerY + 58 }; };
          d20 = function () { return roll; };
          const n0 = window.__snareProbe.length, h0 = hp;
          try { await koboldSnare(ci); } finally { pickEnemyTarget = _pick; d20 = _d20; }
          const rec = window.__snareProbe.slice(n0);
          return { roll, ring, hasFree: hasFreeAction('player'), recs: rec.map((r) => ({ kind: r.kind, roll: r.roll, saved: r.saved, prone: r.prone, ring: r.ring, dmg: r.dmg, dc: r.dc })),
                   hpDrop: h0 - hp, prone: hasStatus('player', 'prone') };
        };
        o.direct.fail = await one(1, false);
        o.direct.save = await one(20, false);
        o.direct.ringFail = await one(1, true);
        o.direct.ringIdx = ringIdx;
        for (let i = 0; i < acc0.length; i++) currentAccessoryIndices[i] = acc0[i];
        o.direct.wrappedBack = (pickEnemyTarget === _pick && d20 === _d20);
        o.direct.usedAfter = !!enemies[ci].__snareUsed;
      }
      removeStatus('player', 'prone');
      hp = hp0; maxHp = mx0;
      o.direct.encAfter = !!(encounterActive || encounterRunning);
      window.__snareProbe.length = 0;   /* 直接呼びの記録を消して §3 の戦闘を測る */
      o.trapsAtEntry = traps.length;
      return o;
    }, NODE_SNAP.toString(), ALTAR);

    /* §3 の戦闘: 手番の関数を包む (⭐ enemyAttackTurn は本番を呼ぶ包み・頭と仲間は族長の手番が揃うまで何もしない) */
    await ip.evaluate((CT) => {
      const S = window.__kwS = { chief: [], other: { turns: 0, added: 0, recs: [] }, killed: false, err: [] };
      const _e = enemyAttackTurn;
      enemyAttackTurn = async function (idx) {
        const e = enemies[idx];
        const isChief = !!(e && e.type === 'koboldChief');
        const p0 = window.__snareProbe.length, t0 = traps.length, used0 = !!(e && e.__snareUsed);
        const r = await _e.apply(this, arguments);
        const add = window.__snareProbe.slice(p0).map((x) => ({ enemyIdx: x.enemyIdx, kind: x.kind, target: x.target, dc: x.dc, roll: x.roll, total: x.total, saved: x.saved, trapsLen: x.trapsLen }));
        if (isChief) S.chief.push({ n: S.chief.length + 1, idx, added: add.length, recs: add, trapsBefore: t0, trapsAfter: traps.length, used0, used1: !!e.__snareUsed });
        else { S.other.turns++; S.other.added += add.length; if (add.length) S.other.recs.push({ idx, type: e && e.type, add }); }
        return r;
      };
      const finish = () => {
        if (S.killed || S.chief.length < CT) return;
        S.killed = true;
        for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e && e.alive && !e.passiveNpc) { e.hp = 0; defeatEnemy(i); } }
      };
      playerAttackTurn = async function () { finish(); };
      allyAttackTurn = async function () { finish(); };
      S.wrapped = { enemy: enemyAttackTurn === window.enemyAttackTurn, player: playerAttackTurn === window.playerAttackTurn };
      maxHp = Math.max(maxHp, 999); hp = maxHp;
      for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; }
    }, CHIEF_TURNS);
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
    const FT = await ip.evaluate(async (START_MS, END_MS) => {
      const o = {};
      const S = window.__kwS;
      const k = enemies.find((e) => e.alive && e.type === 'kobold');
      if (!encounterActive && k) {
        const ktx = Math.floor((k.x + k.def.displaySize / 2) / TILE_SIZE), kty = Math.floor((k.y + k.def.displaySize / 2) / TILE_SIZE);
        playerX = (ktx - 2) * TILE_SIZE - 16; playerY = kty * TILE_SIZE - 26;
        await new Promise((r) => setTimeout(r, 400));
        try { tryStartEncounter(); } catch (e) { o.tseErr = e.message; }
      }
      const t0 = performance.now();
      while (!encounterActive && performance.now() - t0 < START_MS) await new Promise((r) => setTimeout(r, 250));
      o.started = !!encounterActive; o.startMs = Math.round(performance.now() - t0);
      const t1 = performance.now();
      while ((encounterActive || encounterRunning) && performance.now() - t1 < END_MS) await new Promise((r) => setTimeout(r, 250));
      o.ended = !encounterActive && !encounterRunning; o.encMs = Math.round(performance.now() - t1);
      o.trapsAtEnd = traps.length;
      const ci = enemies.findIndex((e) => e.type === 'koboldChief');
      o.chiefIdx = ci; o.chiefUsed = ci >= 0 ? !!enemies[ci].__snareUsed : null;
      o.probeAll = window.__snareProbe.map((x) => ({ enemyIdx: x.enemyIdx, kind: x.kind, saved: x.saved }));
      /* 帰還 (自然に待ってから。来なければ本番の checkDungeonClear を 1 回だけ蹴る) */
      let lr = null;
      const t2 = performance.now();
      while (!lr && performance.now() - t2 < 12000) {
        await new Promise((r) => setTimeout(r, 500));
        try { lr = sessionStorage.getItem('dragonfighters.lastResult'); } catch (e) {}
      }
      o.manualClear = false;
      if (!lr) {
        o.manualClear = true;
        try { if (!dungeonCleared) checkDungeonClear(); } catch (e) { o.checkErr = e.message; }
        const t3 = performance.now();
        while (!lr && performance.now() - t3 < 15000) {
          await new Promise((r) => setTimeout(r, 500));
          try { lr = sessionStorage.getItem('dragonfighters.lastResult'); } catch (e) {}
        }
      }
      o.lastResultRaw = lr;
      o.egg = window.__redEggNarrated === true;
      o.S = JSON.parse(JSON.stringify(S));
      return o;
    }, ENC_START_WAIT_MS, ENC_END_WAIT_MS);
    lastResultRaw = FT.lastResultRaw;
    await ip.close().catch(() => {});

    /* ══════════ (6a) + (4a) 既存シナリオ: BASE_REV と現在を同じ種で ══════════ */
    const sp = await newPage();
    const SPAWN = async (SEED) => {
      const o = {};
      o.scen = scenarioId; o.trapCount = currentScenario.trapCount; o.node = (typeof currentNodeId !== 'undefined') ? currentNodeId : null;
      for (const t of traps) { try { if (t.el && t.el.remove) t.el.remove(); } catch (e) {} }
      traps.length = 0;
      const R0 = Math.random;
      let s = SEED >>> 0, calls = 0;
      Math.random = function () { calls++; s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); const u = (t ^ (t >>> 14)) >>> 0; return u / 4294967296; };   /* mulberry32 */
      try { spawnTraps(); o.calls = calls; o.next = Math.random(); } finally { Math.random = R0; }
      o.traps = traps.map((t) => [t.tx, t.ty, t.type]);
      /* (4a) 既存シナリオの語り */
      const said = [];
      const _dm = showDMMessage;
      showDMMessage = function (t) { said.push(String(t)); return _dm.apply(this, arguments); };
      const hp0 = hp, mx0 = maxHp;
      maxHp = Math.max(maxHp, 999); hp = maxHp;
      if (traps.length) { try { triggerTrapOnPlayer(traps[0]); } catch (e) { said.push('ERR ' + e.message); } }
      showDMMessage = _dm; hp = hp0; maxHp = mx0;
      o.said = said;
      o.keys = Object.keys(SCENARIOS);
      return o;
    };
    const runSpawn = async (sid, isBase, seed) => {
      await gotoIndex(sp, sid, '?diag=1' + (isBase ? '&__base=1' : ''));
      await sleep(800);
      return sp.evaluate(SPAWN, seed);
    };
    const probeBase = await runSpawn(mainIds[0] || 'goblin-mine', true, 1);
    const EXIST = (probeBase.keys || []).filter((k) => k !== KW);
    const six = [];
    for (let i = 0; i < EXIST.length; i++) {
      const sid = EXIST[i], seed = 103000 + i * 7919;
      const b = await runSpawn(sid, true, seed);
      const c = await runSpawn(sid, false, seed);
      six.push({ sid, base: b, cur: c });
    }
    await sp.close().catch(() => {});

    /* ══════════ tavern: 卵の印 (2 回の帰還) ══════════ */
    const lrUse = (lastResultRaw && /"scenarioId":"kobold-warren"/.test(lastResultRaw) && /"cleared":true/.test(lastResultRaw)) ? lastResultRaw : null;
    const visitEgg = async () => {
      const pb = await newPage();
      await pb.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
      await pb.evaluate((v, K) => sessionStorage.setItem(K, v), lrUse || J({ cleared: true, scenarioId: KW }), LAST_RESULT_KEY);
      await pb.goto(base + F_TAVERN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await pb.waitForFunction(() => !!(window.__TAVERN_TV && window.__TAVERN_TV.redEgg), { timeout: 30000 });
      ctx.booted++;
      let o = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        o = await pb.evaluate(() => window.__TAVERN_TV.redEgg());
        if (o && o.scene && o.scene.length) break;
        await sleep(300);
      }
      await sleep(1500);
      o = await pb.evaluate(() => window.__TAVERN_TV.redEgg());
      await pb.close().catch(() => {});
      return o;
    };
    const blankEgg = await newPage();
    await blankEgg.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
    await blankEgg.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('dragonfighters.prologueSeen', '1'); });
    const egg0 = await blankEgg.evaluate(() => localStorage.getItem('dragonfighters.redEgg'));
    await blankEgg.close().catch(() => {});
    const d1 = await visitEgg();
    const d2 = await visitEgg();

    /* ── §0 ── */
    R.check('(0a)', '[装置] __koboldWarrenTV.ENEMY_TYPES.koboldChief / window.buildKoboldWarrenRun / window.koboldSnare / __snareProbe が見える',
      N0.seams.tvChief && N0.seams.build === 'function' && N0.seams.snare === 'function' && N0.seams.probe, N0.seams);
    const led = Array.isArray(N0.ledger) ? N0.ledger : [];
    const l0 = led.find((n) => n.id === 'n0') || {}, l1 = led.find((n) => n.id === 'n1') || {};
    const n0k = (N0.enemies || []).filter((e) => e.type === 'kobold').length;
    const n1k = (N1.enemies || []).filter((e) => e.type === 'kobold').length;
    const n1c = (N1.enemies || []).filter((e) => e.type === 'koboldChief').length;
    R.check('(0b)', '[装置] 2 ノード (n0 start / n1 boss) が組み上がり、族長 1・コボルドが n0 / n1 に 1 体以上 (台帳と実体)',
      N0.scen === KW && J(N0.nodes) === J(['n0:start', 'n1:boss']) && N0.cur === 'n0' && N1.cur === 'n1'
        && (l0.slots || []).filter((t) => t === 'kobold').length >= 1 && (l1.slots || []).filter((t) => t === 'kobold').length >= 1
        && J(l1.boss) === J(['koboldChief']) && J(l0.boss) === J([])
        && n0k >= 1 && n1k >= 1 && n1c === 1 && (N0.enemies || []).every((e) => e.type !== 'koboldChief') && N0.encActive === false,
      { scen: N0.scen, nodes: N0.nodes, cur: [N0.cur, N1.cur], ledger: N0.ledger, n0: (N0.enemies || []).map((e) => e.type), n1: (N1.enemies || []).map((e) => e.type) });
    /* ── §2 ── */
    const p0 = (N0.paintings || [])[0] || {}, p1 = (N1.paintings || [])[0] || {};
    /* ⚠ --tile は焼き上がりの 1 マス (絵の実寸 / tw・th。縦横で一致すること) で測る。ページの TILE_SIZE (表示の 1 マス) ではない */
    const g0 = (p0.src && p0.bakeTile) ? gridCheck(p0.src, p0.bakeTile) : { ok: false, why: 'n0 に絵が無い / 1 マスの画素が縦横で揃わない' };
    const g1 = (p1.src && p1.bakeTile) ? gridCheck(p1.src, p1.bakeTile) : { ok: false, why: 'n1 に絵が無い / 1 マスの画素が縦横で揃わない' };
    R.check('(2a)', '焼き上がり 2 枚 (n0 / n1 に貼られた絵) が make_grid_map.py --check の縦横 3 指標で OK (--tile = 絵の実寸 / マス数)',
      g0.ok && g1.ok && p0.src !== p1.src, { n0: [p0.src, p0.bakeTile, g0], n1: [p1.src, p1.bakeTile, g1] });
    const ci1 = N1.chiefIdx;
    const n1PathChief = (ci1 >= 0 && N1.pathToEnemies) ? N1.pathToEnemies[ci1] : null;
    R.check('(2b)', '本番の aStar で n0 入口 → 出口の手前・各敵 / n1 入口 → 族長 (祭壇の前)・各敵が通る・敵のタイルは全部歩ける・祭壇 ' + ((ALTAR.c2 - ALTAR.c1 + 1) * (ALTAR.r2 - ALTAR.r1 + 1)) + ' マスは全部壁',
      typeof N0.pathToExit === 'number' && N0.pathToExit > 0 && (N0.pathToEnemies || []).length > 0 && N0.pathToEnemies.every((x) => typeof x === 'number')
        && (N1.pathToEnemies || []).length > 0 && N1.pathToEnemies.every((x) => typeof x === 'number') && typeof n1PathChief === 'number'
        && N0.enemyWall.length === 0 && N1.enemyWall.length === 0
        && !!N1.altar && N1.altar.open.length === 0 && N1.altar.wall === (ALTAR.c2 - ALTAR.c1 + 1) * (ALTAR.r2 - ALTAR.r1 + 1),
      { n0: { from: N0.player, exitInner: N0.exitInner, pathToExit: N0.pathToExit, toEnemies: N0.pathToEnemies, wall: N0.enemyWall },
        n1: { from: N1.player, toEnemies: N1.pathToEnemies, toChief: n1PathChief, wall: N1.enemyWall, altar: N1.altar } });
    R.check('(2c)', '罠が n0 に 1 つ (' + N0_TRAP + ')・n1 に 1 つ (' + N1_TRAP + ')・玄室の宝箱が n0 に出る (?roadchest=0 の腕)',
      (N0.traps || []).length === 1 && N0.traps[0].type === N0_TRAP && (N1.traps || []).length === 1 && N1.traps[0].type === N1_TRAP
        && N0rc.cur === 'n0' && N0rc.chests > 0,
      { n0: N0.traps, n1: N1.traps, roadchest0: N0rc });
    const area0 = (p0.tw || 0) * (p0.th || 0), area1 = (p1.tw || 0) * (p1.th || 0);
    R.check('(2d)', 'n0 は isCustom (テーマ ' + KW + ')・絵が読み込まれ霧が絵の範囲 (tw x th) 以上晴れている / n1 も isCustom・絵あり・霧は晴らさない (屋外の開放 0・探索済み < 絵の範囲)',
      N0.custom && N0.themeId === KW && !!p0.loaded && area0 > 0 && !!N0.outdoor && N0.outdoor.rooms >= 1 && N0.outdoor.exploredNow >= area0
        && N1.custom && N1.themeId === KW && !!p1.loaded && area1 > 0 && !!N1.outdoor && N1.outdoor.rooms === 0 && N1.outdoor.exploredNow < area1,
      { custom: [N0.custom, N1.custom], theme: [N0.themeId, N1.themeId], painting0: p0, area0, out0: N0.outdoor && { rooms: N0.outdoor.rooms, explored: N0.outdoor.exploredNow },
        painting1: p1, area1, out1: N1.outdoor && { rooms: N1.outdoor.rooms, explored: N1.outdoor.exploredNow } });
    /* ── §3 ── */
    const S = FT.S || { chief: [], other: {} };
    const c1t = (S.chief || [])[0] || null;
    const r1 = c1t && c1t.recs && c1t.recs[0];
    R.check('(3a)', '族長の最初の手番で __snareProbe に 1 件 (族長・DC・ロール・成否)・その手番で traps.length は変わらない',
      FT.started && !!c1t && c1t.added === 1 && !!r1 && r1.enemyIdx === FT.chiefIdx && typeof r1.dc === 'number' && r1.dc > 0
        && typeof r1.roll === 'number' && typeof r1.saved === 'boolean' && !!r1.target && c1t.trapsBefore === c1t.trapsAfter && r1.trapsLen === c1t.trapsBefore
        && FT.trapsAtEnd === N1.trapsAtEntry,
      { started: FT.started, startMs: FT.startMs, first: c1t, trapsAtEntry: N1.trapsAtEntry, trapsAtEnd: FT.trapsAtEnd, wrapped: S.wrapped });
    const later = (S.chief || []).slice(1);
    R.check('(3b)', '族長の 2 回目以降の手番 (' + (CHIEF_TURNS - 1) + ' 回以上) では発動しない・__snareUsed が立つ',
      FT.started && later.length >= CHIEF_TURNS - 1 && later.every((t) => t.added === 0) && FT.chiefUsed === true,
      { chiefTurns: (S.chief || []).map((t) => ({ n: t.n, added: t.added, used0: t.used0, used1: t.used1 })), chiefUsed: FT.chiefUsed, ended: FT.ended, encMs: FT.encMs });
    const D = N1.direct || {};
    const rf = D.fail && D.fail.recs[0], rs = D.save && D.save.recs[0];
    R.check('(3c)', 'd20=1 → 標的 (頭) が prone・HP が 1〜6 減る / d20=20 → prone も減りも無い',
      !D.encBefore && !D.encAfter && !!D.fail && D.fail.recs.length === 1 && rf.saved === false && rf.prone === true && D.fail.prone === true
        && D.fail.hpDrop >= 1 && D.fail.hpDrop <= 6 && rf.dmg === D.fail.hpDrop
        && !!D.save && D.save.recs.length === 1 && rs.saved === true && rs.prone === false && D.save.prone === false && D.save.hpDrop === 0
        && D.wrappedBack === true,
      { fail: D.fail, save: D.save, enc: [D.encBefore, D.encAfter] });
    const rr = D.ringFail && D.ringFail.recs[0];
    R.check('(3d)', 'リングオブフリーアクション + d20=1 → prone は付かない・ダメージは受ける (1〜6)',
      typeof D.ringIdx === 'number' && D.ringIdx > 0 && !!D.ringFail && D.ringFail.hasFree === true && D.ringFail.recs.length === 1
        && rr.saved === false && rr.ring === true && rr.prone === false && D.ringFail.prone === false
        && D.ringFail.hpDrop >= 1 && D.ringFail.hpDrop <= 6 && rr.dmg === D.ringFail.hpDrop,
      { ringFail: D.ringFail, ringIdx: D.ringIdx });
    const oth = S.other || {};
    R.check('(3e)', '他の敵は仕掛け罠を使わない (snareDC を持つ型 = koboldChief だけ / §3 の戦闘でコボルドの手番 1 回以上・発動 0・全記録が族長)',
      J(N0.snareTypes) === J(['koboldChief']) && (oth.turns || 0) >= 1 && oth.added === 0 && (FT.probeAll || []).every((x) => x.enemyIdx === FT.chiefIdx),
      { snareTypes: N0.snareTypes, otherTurns: oth.turns, otherAdded: oth.added, otherRecs: (oth.recs || []).slice(0, 3), probeAll: FT.probeAll });
    /* ── §4 ── */
    const TT = N0.tt || {};
    const pitText = TT[N0_TRAP] && TT[N0_TRAP].dmText, rockText = TT[N1_TRAP] && TT[N1_TRAP].dmText;
    const tr0 = N0.n0Trap || {}, tr1 = N1.n1Trap || {};
    const sixTexts = six.map((x) => ({ sid: x.sid, base: x.base.said, cur: x.cur.said }));
    const existOk = six.length > 0 && six.some((x) => (x.base.said || []).length > 0)
      && six.every((x) => J(x.base.said) === J(x.cur.said) && (x.cur.said || []).every((t) => t !== pitText && t !== rockText));
    R.check('(4a)', 'n0 の罠 = 落とし穴の語り (頭・仲間)・n1 = 落石の語り・既存 ' + six.length + ' シナリオは ' + BASE_REV + ' と同じ語り・第 2 引数が優先',
      N0.dmWrapped === true && typeof pitText === 'string' && /落とし穴/.test(pitText) && typeof rockText === 'string' && /落石/.test(rockText)
        && tr0.type === N0_TRAP && tr1.type === N1_TRAP && J(tr0.player) === J([pitText]) && J(tr0.ally) === J([pitText]) && J(tr0.arg) === J(['引数の語り(検証)'])
        && J(tr1.player) === J([rockText]) && existOk,
      { pit: pitText, rock: rockText, n0: tr0, n1: tr1, allies: N0.allies, exist: sixTexts });
    R.check('(4c)', '帰還 (巣穴クリア) で印が立ち初回だけ keeper がしゃべる・2 回目は黙る・index の勝利の一言が立つ',
      egg0 === null && !!d1 && d1.mark === true && d1.pending === true && (d1.scene || []).length === 1 && d1.scene[0].key === 'keeper'
        && !!d2 && d2.mark === true && d2.pending === false && (d2.scene || []).length === 0 && FT.egg === true,
      { before: egg0, first: d1 && { mark: d1.mark, pending: d1.pending, scene: (d1.scene || []).map((s) => s.key) },
        second: d2 && { mark: d2.mark, pending: d2.pending, scene: (d2.scene || []).map((s) => s.key) }, indexEgg: FT.egg,
        lastResult: lrUse ? 'index の帰還' : '合成 (index の帰還が取れなかった)', manualClear: FT.manualClear });
    /* ── §6 ── */
    const sixRows = six.map((x) => ({ sid: x.sid, traps: x.cur.traps.length, same: J(x.base.traps) === J(x.cur.traps), calls: [x.base.calls, x.cur.calls], next: x.base.next === x.cur.next,
      types: Array.from(new Set(x.cur.traps.map((t) => t[2]))) }));
    R.check('(6a)', '既存 ' + six.length + ' シナリオ (' + BASE_REV + ' の SCENARIOS) で、同じ種の乱数のもと spawnTraps の罠 (座標・種類 damage)・乱数の呼び出し回数・次の乱数が ' + BASE_REV + ' と同じ',
      six.length === 7 && EXIST.indexOf(KW) < 0 && six.some((x) => x.cur.traps.length > 0)
        && six.every((x) => J(x.base.traps) === J(x.cur.traps) && x.base.calls === x.cur.calls && x.base.next === x.cur.next && x.cur.traps.every((t) => t[2] === 'damage')),
      { exist: EXIST, rows: sixRows });
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
  const profile = require('./_pptr_profile')('df_verify_kobold_warren_');
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
