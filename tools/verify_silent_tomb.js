#!/usr/bin/env node
/*
 * verify_silent_tomb.js — 実装依頼書 #105「沈黙の墓所」の受入ドライバ
 *   (依頼書 実装依頼書/2026-10-30_silent-tomb.md §8 = 受入条件の唯一の正。型 = tools/verify_lost_cargo.js)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_silent_tomb.js                          # 素
 *   node tools/verify_silent_tomb.js --negative               # 先に素の基準 → 変異 12 本 (port 10665〜10676)
 *   node tools/verify_silent_tomb.js --negative --only usefeardc,typerng
 *   node tools/verify_silent_tomb.js --mutate nosite          # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome / git が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 登録の整合は**ブラウザに載った実体どうし**で突き合わせる (tavern.html の scenarios と同じページの
 *     WORLD_MAP、world.html の WORLD_MAP と DOM の札)。⛔ 写経しない。ドライバが持つ固定値は依頼書が決めた名前
 *     (id "silent-tomb" / 拠点 "lake_n" / 港町 "phlan" / 廃坑の拠点 "mine" / 罠の種類 "dart" "glyph" / ボスの型 "mummy"
 *     / 墓所専用の手下 "tombArmor" "tombGargoyle")・§12-1 (3) の MASK が決めた石棺の台座の矩形・
 *     地図の sha1 の固定値 (既に焼かれた値) だけ。place (札の文言) は配信バイトの id → place の並びから読む。
 *   - 恐怖のまなざしは本番の runEncounter を回して観測する (§3)。playerAttackTurn / allyAttackTurn だけを
 *     差し替え (見張る型の手番が規定数来るまで何もしない → 来たら本番の defeatEnemy で全員を倒して戦闘を終える)、
 *     enemyAttackTurn は**本番を呼ぶ包み**で手番ごとの __glareProbe / traps.length / pickBossAction の呼び出し /
 *     パーティの HP を数える。(3b)(3c) は d20 と pickEnemyTarget を呼び出しの間だけ差し替えて mummyDreadfulGlare を
 *     直接呼ぶ (戦闘の外 = マミーの __glareUsed は立たない)。(3e) の「他のボス」は巣穴の族長と倉庫街の司祭で 1 戦闘ずつ。
 *   - 経路は本番の aStar (⛔ 自前の BFS を書かない)。焼き上がりの検算は本番の道具 make_grid_map.py --check。
 *   - (6a) は git BASE_REV (= #105 項目2 の前の commit) の index.html を同じ origin で配り (?__base=1)、
 *     同じ種の乱数で spawnTraps を 1 回だけ回して、罠の座標・種類・Math.random の呼び出し回数・その次の乱数を比べる。
 *   - 強さ (⑤) は assert にしない (別の道具で記録する。依頼書 §12-3 用)。
 *
 * ■ 依頼書 §8 からの言い直し (実装と項目1・2 の実測に合わせた点)
 *   - pageerror 0 は (0d) に分けた (依頼書の (0c) は守護者の番人なので番号を譲った)。
 *   - (0c) は 台帳 (buildSilentTombRun の slots / boss の鍵 → ENEMY_TYPES の faction / startsDormant) と
 *     実体 (n0 / n1 の入場直後の敵 + 全期間 200ms ごとの監視で inactive / dormant / faction beast を 1 度も見ない) の 2 経路 +
 *     n0 の番人 (東の群れ) との戦闘を最後まで回して awakenGuardians 0 回・「古代王国の守護者」のバナー 0。
 *   - (1f) は「札どうしの交わり 0」に加え、**墓所の札が刻み点マーカーの中心を奪わない** (elementFromPoint) を縛る。
 *     ⭐ 項目2 の予告外の赤 (verify_world_steps (2c): signDx 0 だと墓所の札が刻み点 farm_n__pass_n@1 を覆う) を
 *     この本でも捕まえるため (変異 signclash = lake_n の signDx を外す)。主人公の立ち位置は title 起点 / lake_n /
 *     farm_n__pass_n@1 (sessionStorage の roadReturn = 襲撃からの再開の口で置く)。⛔ 札の px・主人公が覆う割合は縛らない (記録だけ)。
 *   - (1g) は 3 本の腕: ① 受注 = 墓所のまま廃坑を押して歩く → lake_n を通っても開かず、廃坑でも開かない
 *     (⭐ onArriveNode は受注中の依頼の地でしか開かない = 受注が廃坑だと「通過で開く」欠陥が見えない) →
 *     そのまま lake_n を押して戻ると墓所の入場が開く / ② 受注 = 廃坑で廃坑を押して歩く → lake_n を通っても開かず
 *     廃坑で開く (文言は墓所でない)。母集団ガード = findWalkPath("phlan","mine") が lake_n を含み、主人公が実際に lake_n を踏む。
 *   - (3a) は「最初の手番で pickBossAction が呼ばれていない」(= 入口は行動選択の前) も縛る (変異 glareafter)。
 *   - (3e) の「HP は 1 も減らない」はまなざしの手番の前後のパーティの HP の合計で見る。
 *   - (4a) の開幕の語りは ?autoplay=1 のページで #dmBody に実際に出た文を拾い、4 行すべてが出たことを見る。
 *   - (4c) は 4 段の撤退の各段の後を固定値で縛る: retireTomb() 後 = 2e2e291 (#104 完了) の既定の地図 /
 *     +retireCargo() = #103 の地図 / +retireWarren() = #82 の地図 / +retireTower() = 塔の母の前の地図。
 *   - (6a) の基準は 0014d8f (項目1。index.html は項目2 の前)。既存 9 シナリオ = 本筋 6 + 塔の母 + 巣穴 + 倉庫街。
 *   - 負のコントロールに signclash を足した (依頼書の 11 本 + 1 = 12 本・ポート 10665〜10676)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] __silentTombTV (マミーの型) / buildSilentTombRun / mummyDreadfulGlare が見え、2 ノード (n0 start / n1 boss) の台帳と実体の敵が 0 体でない・n1 のボスはマミー 1
 *      (0b) [装置] __glareProbe が配列で在り、発動前 (n0・n1 の入場直後) は 0 件
 *      (0c) ⭐ 墓所に守護者 (第三勢力 + 休眠) が居ない: 台帳と実体の 2 経路・n0 の番人との戦闘で起動の語りが出ない
 *      (0d) [装置] 全ページで pageerror 0 件
 *   §1 (1a) tavern の silent-tomb (配信バイトの id → place・side・locked・unlockAfter) と、同じページの SITES / UNLOCK / NODES.lake_n、
 *           world.html の SITES / UNLOCK と DOM の札 (文言 = place) が一致
 *      (1b) side・ALL_MAIN_SCENARIOS に無い・本筋 6 本 (と +本筋外 4 本) クリアで frontier が null
 *      (1c) cleared=[] → 卓は「廃坑 + 巣穴」(8 回引き直しても)・cleared=[廃坑] → 解放済み 4 件のまま・どちらも lake_n は中継点の見た目
 *      (1d) cleared=[廃坑, 森] → 解放済みに墓所 (と沼地) が入る・world.html の lake_n に札
 *      (1e) findWalkPath("phlan", "lake_n") が null でなく lake_n で終わる
 *      (1f) cleared=[廃坑, 森] の world.html (1440x900 / 390x844 × 立ち位置 3) で墓所の札と他の札の交わり 0・刻み点マーカーを奪わない
 *      (1g) 通過では開かない / 押して着くと開く (上の 3 本の腕)
 *   §2 (2a) 焼き上がり 2 枚が make_grid_map.py --check の縦横 3 指標で OK
 *      (2b) 本番の aStar で n0 入口 → 出口の手前・各敵 / n1 入口 → マミー・各敵が通る・敵のタイルは歩ける・石棺の台座 25 マスは壁
 *      (2c) 罠は n0 に 1 つ (dart)・n1 に 1 つ (glyph)・湧いた罠を踏むと語りが dmText・n0 に宝箱 (?roadchest=0)
 *      (2d) 2 枚とも isCustom (テーマ silent-tomb)・絵が読み込まれ、屋外の開放 0・探索済み < 絵の範囲 (霧が効く)
 *   §3 (3a) マミーの最初の手番で __glareProbe に 1 件 (pickBossAction より前)・2 手番目以降は増えない・__glareUsed
 *      (3b) 乱数固定の直接呼び: 成功 / 失敗 (恐怖) / 5 以上の差の失敗 (恐怖 + 行動不能) × 頭と仲間。状態と probe の 2 経路・仲間に sleepWatchHp を書かない
 *      (3c) 自由行動の指輪を着けた頭 / 仲間は probe の immune: true で、恐怖も行動不能も立たない
 *      (3d) 戦闘開始時の全体恐怖 partyWillSave が墓所の戦闘 (n0 / n1) で 1 度も呼ばれない
 *      (3e) glareDC を持つ型 = mummy だけ / 手下・巣穴の族長・倉庫街の司祭の手番で probe が増えない・まなざしの手番で traps.length と HP が変わらない
 *   §4 (4a) 開幕の語り 4 行が出る (2 行目に碑文)・n0 = 矢 / n1 = 紋の語り (頭・仲間)・第 2 引数が優先・既存 9 シナリオは BASE_REV と同じ語り
 *      (4b) ?tomb=0 で tavern の配列から消え・lake_n が中継点・cleared=[廃坑, 森] の解放済みから墓所が消える・(1a)(1d) の条件が ON/OFF で反転
 *      (4c) retireTomb() → retireCargo() → retireWarren() → retireTower() の各段の地図の sha1 が既存の固定値
 *   §6 (6a) 既存 9 シナリオで spawnTraps の罠 (座標・種類)・乱数の呼び出し回数・次の乱数が BASE_REV と同じ
 *   ⛔ 測らないこと (依頼書 §8): マミーの displaySize・語りの文面の良し悪し・バナーの絵文字・クリアの XP と金貨・
 *      恐怖の手番数・札の位置の px。⑤ 強さは記録のみ。
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html / tavern.html / world.html / js/df-mapdef.js / js/world-map.js は**起動時に 1 回だけ
 *     readFileSync して凍結**し、変異はその文字列をメモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。
 *     他のファイルは都度ディスクから配る。favicon.ico は 204。
 *   - 起動時に全変異のアンカーを**原本**で検算する (配信 5 ファイル合算でちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     崩れたら素でも exit 3。罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持つ。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」+ 注入行の実行 > 0。
 *     担当は**実走で決めた** (--mutate で 1 本ずつ)。依頼書の予想 (NEG_PREDICTED) は記録として並べるだけ。
 *   - 酒場を開く種まきに plazaClock = 21 を入れる (昼に走らせても夜に走らせても同じ色・CLAUDE.md #102)。
 *   - world.html の歩きは ?roadevent=0&ambush=0 (街道の出来事・襲撃で別ページへ飛ばない)。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - ⭐⭐ 揺れの原因と対処 (項目3 で特定・依頼書 §12-3): n0 の敵を倒し切ると本番の tickNodeChoice が nodeBusy の内側で
 *     revealExitHints (知覚判定) → chooseExit (出口の矢印 = dialogPaused) を回す。その最中にドライバが enterNode('n1') を
 *     直接呼ぶと n0 の矢印が n1 へ持ち越されて dialogPaused = true のまま止まり、玄室の戦闘が始まらない ((3a)(3d)(3e) が赤)。
 *     ⇒ n1 へ入る前に「判定パネルは振る・矢印は Esc (留まる)・nodeBusy / skillCheckActive / dialogPaused が 1 秒下りたまま」を待つ。
 *     本番の enterNode は tickNodeChoice の流れの終わりからしか呼ばれない = 普通のプレイでは起きない (本番は触らない)。
 *   - [診断] --tracedp: 配信する index.html の `dialogPaused = <値>;` を行番号つきの記録に包む (配信バイトだけ)。
 *     (3a) が赤のとき diag.dpLog に [時刻, 行, 値, ノード] の最後の 30 件が出る。⛔ 合否には使わない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10664** (素) / 変異 **10665〜10676** (12 本・MUTATIONS の並び順)。次の新規ドライバ base = 10677。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10664'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前 (データ。期待値の写しではない) */
const ST = 'silent-tomb';
const ST_SITE = 'lake_n';
const PORT_TOWN = 'phlan';           // 港町フラン (js/world-map.js の NODES.phlan)
const MINE_SITE = 'mine';            // 廃坑の拠点 ((1g) で lake_n を通り抜けて向かう先)
const WARREN = 'kobold-warren', CARGO = 'lost-cargo';   // (3e) の「他のボス」の依頼
const MUMMY = 'mummy', CHIEF = 'koboldChief', PRIEST = 'plaguePriest';
const TOMB_TYPES = ['skeleton', 'tombArmor', 'tombGargoyle', MUMMY];   // 墓所の台帳に載ってよい鍵 (依頼書 §5-5)
const N0_TRAP = 'dart', N1_TRAP = 'glyph';
const STEP_GUARD = 'farm_n__pass_n@1';   // (1f) 項目2 で墓所の札が覆った刻み点 (母集団ガード)
const BASE_REV = '0014d8f';          // #105 項目1 (index.html は項目2 の前 = 着手前)
/* 石棺の台座 (MASK §12-1 (3) の 絵ローカル col 16-20 / row 5-9) を global (+16, +6) へ */
const SARC = { c1: 32, c2: 36, r1: 11, r2: 15 };
/* (4c) 撤退の各段の地図の sha1 (先頭 16)。
 *   ★[#106 項目4] 魔女の小屋 (lakeside) が足されたので、その前にもう 1 段 retireHag() を挟む
 *     (= 6213fcb (#105 完了) の既定の地図 3dd5550782057025・verify_quest_walk (5a) の WANT_H0)。以後の 4 値は 1 文字も変えない。
 *   (以下、#105 時点の段の数え方) 1 段目 = git show 2e2e291:js/world-map.js を node の vm で読んだ既定の地図 (#104 完了・墓所の前)。
 *   2〜4 段目 = verify_quest_walk (5a) / verify_lost_cargo (4c) が既に焼いた固定値 (#103 / #82 / #23 の実測)。 */
const SHA_AFTER_GIANT = '63f3bce7696bf14a';   /* ★[#107] retireGiant() 後 = #106 の既定の地図 (1 文字も変えず当て直し) */
const SHA_AFTER_HAG = '3dd5550782057025';   /* ★[#106] */
const SHA_AFTER_TOMB = '44b1de14f8b2c9d0';
const SHA_AFTER_CARGO = '3918d569e7f3f7db';
const SHA_AFTER_WARREN = '647e71f6b2956389';
const SHA_AFTER_TOWER = '876c5f6336f96811';
const SIGN_VIEWS = [{ w: 1440, h: 900, mobile: false }, { w: 390, h: 844, mobile: true }];
const SIGN_STANDS = ['title', ST_SITE, STEP_GUARD];
const BOARD_KEY = 'dragonfighters.questBoard';
const CLEARED_KEY = 'dragonfighters.cleared';
const VIEW = { width: 1280, height: 800 };
const N_1C = 8;                      // (1c) 引き直しの回数 (解放済みが 2 件 = 決定的)
const BOSS_TURNS = 3;                // §3 の戦闘でボスの手番を何回見るか
const GUARD_TURNS = 2;               // (0c) n0 の番人の手番を何回見るか
const ENC_START_WAIT_MS = 90000;
const ENC_END_WAIT_MS = 120000;
const WALK_MS = 240000;              // (1g) 1 本の歩きの上限
const WORLD_Q = '?roadevent=0&ambush=0';
const PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガルド', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ',   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ',   trait: null, line: null },
];

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html', F_TAVERN = 'tavern.html', F_WORLD = 'world.html', F_MAPDEF = 'js/df-mapdef.js', F_WMAP = 'js/world-map.js';
const SERVED = [F_INDEX, F_TAVERN, F_WORLD, F_MAPDEF, F_WMAP];
const PRISTINE = {};
for (const f of SERVED) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
let BASE_INDEX = null;
try { BASE_INDEX = execFileSync('git', ['-C', ROOT, 'show', BASE_REV + ':' + F_INDEX], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
catch (e) { console.error('[vet] git show ' + BASE_REV + ':index.html に失敗: ' + e.message); process.exit(2); }
if (BASE_INDEX.indexOf('glareDC') >= 0) vetFail('BASE_REV ' + BASE_REV + ' の index.html に glareDC が在る (着手前でない)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 11 本 + signclash)。逐語は HEAD f1b0d6b (項目2 の実装後) の行で取った。
 * ⚠ どれも 1 行 → 1 行 (行数不変)。⚠ 他ドライバのアンカーと重ならない行を選んだ (罠E・起動時に検査)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const A_GLARE_DEF = '        glareDC: 11, glareStunGap: 5,';
const A_GLARE_ENTRY = '      if (def.glareDC && !enemy.__glareUsed) {';
const A_LAKE = '    lake_n:    { kind: "site", x:  736, y: 288, label: "湖の北の島", desc: "湖に浮かぶ小島。古の魔法使いが眠る墓所", signDx: 64 },';
const TOMB_RETIRE = '  /* ══ 撤退スイッチ ?tomb=0 (実装依頼書 #105 §7) ═════════════════════════════';
const MUTATIONS = {
  /* ⭐ マミーの glareDC を fearDC と名乗らせる (依頼書 §2-7 の罠 = 戦闘開始時の全体恐怖が黙って起きる) */
  usefeardc: [
    { file: F_INDEX, from: A_GLARE_DEF,
      to: '        fearDC: (' + HIT('usefeardc') + ', 11), glareStunGap: 5,   /* ★変異usefeardc */' }],
  /* まなざしを「traps[] へ罠を 1 つ足す」形にする (マミーの足元に damage の罠を置いて手番を終える) */
  glareastrap: [
    { file: F_INDEX, from: '        await mummyDreadfulGlare(idx);',
      to: '        { const __m = { tx: Math.floor((enemy.x + def.displaySize / 2) / TILE_SIZE), ty: Math.floor((enemy.y + def.displaySize / 2) / TILE_SIZE), type: "damage", damageDice: "1d6", found: false, triggered: false, disarmed: false, rearmed: false, owner: null, _disarmRolled: false, el: null }; traps.push(__m); createTrapDom(__m, traps.length - 1); ' + HIT('glareastrap') + '; }   /* ★変異glareastrap */' }],
  /* ⭐ 入口を行動選択 (pickBossAction) の後ろへ動かす: 元の入口を殺し、召喚の分岐の直前に同じブロックを置く */
  glareafter: [
    { file: F_INDEX, from: A_GLARE_ENTRY,
      to: '      if (false && def.glareDC && !enemy.__glareUsed) {   /* ★変異glareafter (元の入口を殺す) */' },
    { file: F_INDEX, from: '        if (bossAction === "summon") {',
      to: '        if (def.glareDC && !enemy.__glareUsed) { enemy.__glareUsed = true; ' + HIT('glareafter') + '; await mummyDreadfulGlare(idx); await sleepMs(1100); return; } if (bossAction === "summon") {   /* ★変異glareafter */' }],
  /* def.glareDC の条件を外し、ボスなら誰でも使う */
  glareall: [
    { file: F_INDEX, from: A_GLARE_ENTRY,
      to: '      if ((def.glareDC || def.isBoss) && !enemy.__glareUsed) { if (!def.glareDC) ' + HIT('glareall') + ';   /* ★変異glareall */' }],
  /* 仲間の行動不能に sleepWatchHp も書く (= 眠り扱いになり、殴られて起きる) */
  stunassleep: [
    { file: F_INDEX, from: '        applyStun = () => { a.stunned = Math.max(a.stunned || 0, 1); };   // ⛔ sleepWatchHp は書かない',
      to: '        applyStun = () => { a.stunned = Math.max(a.stunned || 0, 1); a.buffs.sleepWatchHp = a.hp; ' + HIT('stunassleep') + '; };   /* ★変異stunassleep */' }],
  /* ⭐ 罠の種類を決めるのに Math.random を 1 回足す (宣言を持つシナリオ = 巣穴・倉庫街・墓所で効く) */
  typerng: [
    { file: F_INDEX, from: '      try { nid = currentNodeId; } catch (e) { nid = null; }   // ⚠ let の宣言より前に呼ばれても落ちない',
      to: '      try { nid = currentNodeId; } catch (e) { nid = null; } Math.random(); ' + HIT('typerng') + ';   /* ★変異typerng */' }],
  /* 墓所を locked:false にする (撤退スイッチの直前で実行時に書き換える) */
  unlockfree: [
    { file: F_TAVERN, from: TOMB_RETIRE,
      /* ⚠ 原本の行は複数行コメントの開き = 置換後も開いたまま残す */
      to: '  (function () { var s = scenarios.find(function (x) { return x.id === "silent-tomb"; }); if (s) { s.locked = false; ' + HIT('unlockfree') + '; } })();' + TOMB_RETIRE + ' ★変異unlockfree' }],
  /* lake_n を kind: "way" のままにする (札も label も無い今日の中継点) */
  nosite: [
    { file: F_WMAP, from: A_LAKE,
      to: '    lake_n:    (' + HIT('nosite') + ', { kind: "way",  x:  736, y: 288 }),   /* ★変異nosite */' }],
  /* ⭐ 墓所の札を主人公の真上へ戻す (signDx を外す)。項目2 の予告外の赤 = 刻み点 farm_n__pass_n@1 を札が覆う */
  signclash: [
    { file: F_WMAP, from: A_LAKE,
      to: '    lake_n:    (' + HIT('signclash') + ', { kind: "site", x:  736, y: 288, label: "湖の北の島", desc: "湖に浮かぶ小島。古の魔法使いが眠る墓所" }),   /* ★変異signclash */' }],
  /* ⭐ 通過した拠点でも入場判定を呼ぶ (arrived の条件を外す) */
  passopen: [
    /* ★[#109] onArriveStep が「器を開いたら true」を返すようになったのに追従 (return; → return true;) */
    { file: F_WORLD, from: '      if (lastArrival.arrived && WM.has(atId)) { onArriveNode(atId); return true; }   /* ⭐ 入場が優先 */',
      to: '      if (WM.has(atId)) { if (!lastArrival.arrived) ' + HIT('passopen') + '; onArriveNode(atId); return true; }   /* ★変異passopen */' }],
  /* NODE_EXTRA_SPAWN_KINDS から n1 の search を外す */
  nosearch: [
    { file: F_INDEX, from: '      t["silent-tomb"] = { n0: ["search", "loot"], n1: ["search"] };',
      to: '      t["silent-tomb"] = (' + HIT('nosearch') + ', { n0: ["search", "loot"] });   /* ★変異nosearch */' }],
  /* ⭐ 墓所の slots の tombArmor / tombGargoyle を元の animatedArmor / gargoyle (砦の守護者 = 第三勢力 + 休眠) に戻す */
  useguardian: [
    { file: F_INDEX, from: '                [37, 12, "tombArmor"], [37, 14, "tombArmor"]],',
      to: '                [37, 12, (' + HIT('useguardian') + ', "animatedArmor")], [37, 14, "animatedArmor"]],   /* ★変異useguardian */' },
    { file: F_INDEX, from: '        slots: [[31, 15, "tombArmor"], [31, 10, "tombGargoyle"], [31, 16, "tombGargoyle"]],',
      to: '        slots: [[31, 15, "animatedArmor"], [31, 10, "gargoyle"], [31, 16, "gargoyle"]],   /* ★変異useguardian */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた
 *   (項目3・2026-10-30。揺れの対処 (n1 へ入る前の settle) を入れた後に 12 本を 1 本ずつ実走 = r105/item3/mut2/*.log。
 *    対処前の手回し (r105/item3/mut_*.log) と同じ集合から (3a)(3d)(3e) の揺れを除いたものと一致した)。
 *   - usefeardc: glareDC が消える = まなざし自体が起きない ⇒ (0a) 型の検算・(3a) 発動・(3b) 直接呼び・(3e) 型の集合も赤 (本命は (3d))
 *   - unlockfree: 配信バイトの locked が world-map の UNLOCK と食い違う (1a)・卓の抽選 (1c)・?tomb=0 の反転 (4b)
 *   - nosite: lake_n に札が出ない ⇒ (1a)(1d)(1f)(1g)(4b)
 *     ★[#106 項目4] + (4c): 撤退の 1 段目を retireHag() にしたので、lake_n が way のままの既定・retireHag() 後の地図は
 *     固定値と食い違う (決定的・verify_lost_cargo の nosite に #105 で (4c) を足したのと同じ理由)
 *   - useguardian: 台帳と実体 (0c) + 玄室の手下が休眠して手番 0 = (3e) の「手下の手番」が空 */
const NEG_EXPECT = {
  usefeardc:   ['(0a)', '(3a)', '(3b)', '(3d)', '(3e)'],
  glareastrap: ['(3a)', '(3e)'],
  glareafter:  ['(3a)'],
  glareall:    ['(3e)'],
  stunassleep: ['(3b)'],
  typerng:     ['(6a)'],
  unlockfree:  ['(1a)', '(1c)', '(4b)'],
  nosite:      ['(1a)', '(1d)', '(1f)', '(1g)', '(4b)', '(4c)'],
  signclash:   ['(1f)'],
  passopen:    ['(1g)'],
  nosearch:    ['(2c)'],
  useguardian: ['(0c)', '(3e)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可)
 *   - useguardian: 玄室の手下が全員休眠 = ドライバの近寄り先が無く、主人公の自走でマミーと戦闘に入る (実測 18.8 秒)。
 *     90 秒で入れなければ (3a) と (3d) (F0 / FT の started を縛る) が赤 = 欠陥の検出とは無関係なので担当にしない。 */
const NEG_MAYBE = {
  usefeardc: [], glareastrap: [], glareafter: [], glareall: [], stunassleep: [], typerng: [], unlockfree: [], nosite: [],
  signclash: [], passopen: [], nosearch: [], useguardian: ['(3a)', '(3d)'],
};
/* 依頼書 §8 の予想 (記録。⛔ 合否には使わない = 担当は実走で決める)。signclash は依頼書の表に無い (項目2 の申し送りの提案) */
const NEG_PREDICTED = {
  usefeardc: ['(3d)'], glareastrap: ['(3a)', '(3e)'], glareafter: ['(3a)', '(6a)'], glareall: ['(3e)'], stunassleep: ['(3b)'],
  typerng: ['(6a)'], unlockfree: ['(1c)'], nosite: ['(1a)', '(1d)'], signclash: ['(1f)'], passopen: ['(1g)'], nosearch: ['(2c)'],
  useguardian: ['(0c)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 12) vetFail('変異は 12 本まで (ポート 10665〜10676)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_MAYBE[k] || !NEG_PREDICTED[k])) vetFail('NEG_EXPECT / NEG_MAYBE / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length) vetFail('変異 ' + k + ' に必ず赤の節が無い');
  const both = NEG_EXPECT[k].filter((x) => NEG_MAYBE[k].indexOf(x) >= 0);
  if (both.length) vetFail('変異 ' + k + ' の ' + both.join(',') + ' が必ず赤と確率で赤の両方に居る');
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
    if (c !== 1 || tot !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + file + ' に ' + c + ' 件・配信 5 ファイル合算 ' + tot + ' 件): ' + e.from.slice(0, 160));
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
/* (1a) の材料: 配信バイトの「id → place」の並び (⚠ 本番のコメントが「id の直後に置く」と約束している) */
const PLACE_RE = new RegExp('id: "' + ST + '",\\r?\\n\\s*place: "([^"]+)"');
const PLACE_OF = (s) => { const m = PLACE_RE.exec(s); return m ? m[1] : null; };
if (!PLACE_OF(PRISTINE[F_TAVERN])) vetFail('tavern.html の配信バイトに id: "' + ST + '" → place: の並びが無い');
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で 1 箇所 (配信 5 ファイル合算)・行数不変・他ドライバとアンカーの重なり 0'
  + ' / (6a) の基準 = git ' + BASE_REV + ':index.html (' + BASE_INDEX.length + ' 文字) / 配信バイトの place = "' + PLACE_OF(PRISTINE[F_TAVERN]) + '"');

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
  /* [診断 --tracedp] index.html の dialogPaused への代入 (true / false / 保存値の書き戻し) を行番号つきで記録する。⛔ 本番は触らない (配信バイトだけ) */
  if (flag('tracedp')) {
    const NL = String.fromCharCode(10);
    frozen[F_INDEX] = Buffer.from(servedFile(F_INDEX, mutKey).split(NL).map((ln, i) => ln.replace(/(\bdialogPaused = )(true|false|prevDp|handPrevDp)(?=;)/g,
      (m, a, v) => a + '((window.__dpW && window.__dpW(' + (i + 1) + ', ' + v + ')), ' + v + ')')).join(NL), 'utf8');
  }
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(2a)', '(2b)', '(2c)', '(2d)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(4a)', '(4b)', '(4c)', '(6a)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 1500));
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

/* 焼き上がりの検算 (本番の道具)。tile は焼き上がりの 1 マス (絵の実寸 / マス数) */
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
const sha16 = (o) => crypto.createHash('sha1').update(JSON.stringify({ nodes: o.nodesFP, edges: o.edges, sites: o.sites })).digest('hex').slice(0, 16);

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側の観測 (⛔ 期待値はここに書かない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const TAV_SNAP = (SITE) => {
  const o = {};
  try {
    o.scen = scenarios.map((s) => ({ id: s.id, side: !!s.side, locked: !!s.locked, unlockAfter: s.unlockAfter || null, place: s.place }));
    o.main = (typeof mainScenarios === 'function') ? mainScenarios().map((s) => s.id) : null;
    o.facts = window.__TAVERN_TV ? window.__TAVERN_TV.boardFacts() : null;
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
  const sg = el ? el.querySelector('.worldSign') : null;
  const W = window.WORLD_MAP, WD = window.__world;
  let p = null;
  try { p = W ? W.findWalkPath(FROM, SITE) : null; } catch (e) { p = 'ERR ' + e.message; }
  return { cls: el ? el.className : null, sign: sg ? sg.textContent.replace(/\s+/g, ' ').trim() : null, title: el ? (el.title || '') : null,
           sites: W ? Object.assign({}, W.SITES) : null, unlock: W ? Object.assign({}, W.UNLOCK) : null,
           node: W ? Object.assign({}, W.NODES[SITE]) : null,
           path: Array.isArray(p) ? p.slice() : p, hero: WD ? WD.heroNode() : null, ask: WD ? WD.askOpen() : null,
           retireFns: W ? [typeof W.retireTomb, typeof W.retireCargo, typeof W.retireWarren, typeof W.retireTower] : null };
};
/* (1f): 札の矩形どうしの交わりと、墓所の札が刻み点マーカーの中心を奪っていないか (実描画) */
const SIGN_SNAP = (SITE) => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const inter = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const vw = innerWidth, vh = innerHeight;
  const signs = Array.from(document.querySelectorAll('.worldSign')).filter((e) => e.offsetParent !== null)
    .map((e) => { const n = e.closest('[id^=worldNode_]'); return { id: n ? n.id.replace('worldNode_', '') : '?', el: e, rect: R(e) }; });
  const me = signs.find((s) => s.id === SITE) || null;
  const vsOthers = me ? signs.filter((s) => s.id !== SITE).map((s) => ({ id: s.id, a: +inter(me.rect, s.rect).toFixed(1) })).filter((x) => x.a > 0) : null;
  const checked = [], stolen = [];
  if (me) {
    for (const id of window.__world.stepIds()) {
      const el = document.getElementById('worldStep_' + id);
      if (!el) continue;
      const r = R(el); const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
      if (!(cx >= 0 && cy >= 0 && cx < vw && cy < vh)) continue;
      checked.push(id);
      const hit = document.elementFromPoint(cx, cy);
      if (hit && (hit === me.el || me.el.contains(hit))) stolen.push(id);
    }
  }
  const heroEl = document.getElementById('worldHero');
  const hero = heroEl ? R(heroEl) : null;
  const area = me ? me.rect.w * me.rect.h : 0;
  return { heroNode: window.__world ? window.__world.heroNode() : null, signCount: signs.length, me: me && me.rect,
           vsOthers, checked, stolen, heroCover: (me && hero && area > 0) ? inter(me.rect, hero) / area : null };
};
/* index: いまのノードの観測 (n0 / n1 共通)。⚠ page.evaluate へは toString で渡して new Function で戻す */
const NODE_SNAP = (SARC) => {
  const o = {};
  try { o.scen = scenarioId; } catch (e) { o.scen = null; }
  o.nodes = (RUN && RUN.graph) ? RUN.graph.nodes.map((n) => n.id + ':' + n.kind) : null;
  o.cur = currentNodeId;
  o.custom = !!(MAPDEF && MAPDEF.isCustom); o.themeId = MAPDEF ? MAPDEF.themeId : null;
  o.outdoor = window.__outdoorRevealProbe ? window.__outdoorRevealProbe() : null;
  o.paintings = roomPaintings.map((p) => ({ src: p.img && p.img.src ? decodeURIComponent(p.img.src.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]) : null,
    loaded: !!p.loaded, tw: p.tw, th: p.th, nw: p.img ? p.img.naturalWidth : null, nh: p.img ? p.img.naturalHeight : null,
    bakeTile: (p.img && p.tw && p.th && p.img.naturalWidth / p.tw === p.img.naturalHeight / p.th) ? p.img.naturalWidth / p.tw : null }));
  o.traps = window.__silentTombTV ? window.__silentTombTV.traps() : traps.map((t) => ({ tx: t.tx, ty: t.ty, type: t.type }));
  o.trapsLen = traps.length;
  o.chests = roomChests.length;
  o.probeLen = Array.isArray(window.__glareProbe) ? window.__glareProbe.length : null;
  o.player = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
  const tileOf = (e) => ({ tx: Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), ty: Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE) });
  o.enemies = enemies.map((e, i) => Object.assign({ i, type: e.type, boss: !!(e.def && e.def.isBoss), alive: !!e.alive, inactive: !!e.inactive,
    dormant: !!e.dormant, faction: (e.def && e.def.faction) || null }, tileOf(e)));
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
  if (SARC) {
    const wall = [], open = [];
    for (let r = SARC.r1; r <= SARC.r2; r++) for (let c = SARC.c1; c <= SARC.c2; c++) (isTileWall(c, r) ? wall : open).push(c + ',' + r);
    o.sarc = { wall: wall.length, open };
  }
  o.encActive = !!encounterActive;
  return o;
};
/* 罠の語り: traps[] の外の使い捨て (種類 = 本番の trapTypeForNode()) と、湧いた罠 (traps[0]) を踏ませる */
const TRAP_SAY = (withAlly) => {
  const o = {};
  const said = [];
  const _dm = showDMMessage;
  showDMMessage = function (t) { said.push(String(t)); return _dm.apply(this, arguments); };
  o.dmWrapped = (showDMMessage === window.showDMMessage);
  const hp0 = hp, mx0 = maxHp;
  maxHp = Math.max(maxHp, 999); hp = maxHp;
  const t = { tx: -1, ty: -1, type: window.__silentTombTV.trapTypeForNode(), damageDice: '1d6', found: false, triggered: false, el: null };
  o.type = t.type;
  said.length = 0; triggerTrapOnPlayer(t); o.player = said.slice();
  said.length = 0; triggerTrapOnPlayer(t, '引数の語り(検証)'); o.arg = said.slice();
  if (withAlly) {
    const al = allies.find((a) => a.alive);
    if (al) { const ah = al.hp; al.hp = 999; said.length = 0; triggerTrapOnAlly(t, al); o.ally = said.slice(); al.hp = ah; }
  }
  /* 湧いた罠そのもの (2c) */
  if (traps.length) { const sp = traps[0]; o.spawnedType = sp.type; said.length = 0; triggerTrapOnPlayer(sp); o.spawned = said.slice(); }
  showDMMessage = _dm;
  hp = hp0; maxHp = mx0;
  o.tt = window.__silentTombTV.TRAP_TYPES();
  return o;
};
/* (0c)(3d) の見張り: ページの全期間 (index) で守護者の起動・全体恐怖・バナー・休眠した敵を数える (状態は変えない) */
const WATCH_INSTALL = () => {
  if (window.__stW) return true;
  const W = window.__stW = { awake: 0, pws: 0, banners: [], dormantSeen: [], beastSeen: [] };
  const oA = awakenGuardians; awakenGuardians = async function () { W.awake++; return oA.apply(this, arguments); };
  const oP = partyWillSave; partyWillSave = function () { W.pws++; return oP.apply(this, arguments); };
  const oB = showBanner; showBanner = function (t) { W.banners.push(String(t)); return oB.apply(this, arguments); };
  W.iv = setInterval(() => {
    let nid = null; try { nid = currentNodeId; } catch (e) {}
    for (const e of enemies) {
      if (!e || !e.alive) continue;
      if (e.inactive || e.dormant) W.dormantSeen.push(nid + ':' + e.type);
      if (e.def && e.def.faction === 'beast') W.beastSeen.push(nid + ':' + e.type);
    }
  }, 200);
  return awakenGuardians === window.awakenGuardians && partyWillSave === window.partyWillSave && showBanner === window.showBanner;
};
const WATCH_READ = () => { const W = window.__stW; return W ? { awake: W.awake, pws: W.pws, banners: W.banners.slice(),
  dormantSeen: Array.from(new Set(W.dormantSeen)), beastSeen: Array.from(new Set(W.beastSeen)) } : null; };

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
    if (view) await page.setViewport({ width: view.w, height: view.h, isMobile: !!view.mobile, hasTouch: !!view.mobile, deviceScaleFactor: view.mobile ? 3 : 1 });
    else await page.setViewport(VIEW);
    return page;
  }
  async function prep(page, cleared, extra) {
    await page.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
    await page.evaluate((cl, CK, X) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      sessionStorage.setItem('dragonfighters.plazaClock', '21');   /* 時刻で色が変わらないように (CLAUDE.md #102) */
      if (cl) localStorage.setItem(CK, JSON.stringify(cl));
      if (X) for (const k of Object.keys(X.ls || {})) localStorage.setItem(k, X.ls[k]);
      if (X) for (const k of Object.keys(X.ss || {})) sessionStorage.setItem(k, X.ss[k]);
    }, cleared, CLEARED_KEY, extra || null);
  }
  const idxSeed = (sid) => ({ ls: { 'dragonfighters.xp': '20000' },
    ss: { 'dragonfighters.currentScenario': sid, 'dragonfighters.partyMembers': J(PARTY) } });
  async function gotoIndex(page, sid, q) {
    await prep(page, null, idxSeed(sid));
    if (flag('tracedp') && !page.__dpHooked) { page.__dpHooked = true; await page.evaluateOnNewDocument(() => { window.__dpLog = []; window.__dpW = (ln, v) => { let n = null; try { n = currentNodeId; } catch (e) {} window.__dpLog.push([Math.round(performance.now()), ln, !!v, n]); if (window.__dpLog.length > 80) window.__dpLog.shift(); }; }); }
    await page.goto(base + F_INDEX + (q || '?diag=1'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction("typeof RUN !== 'undefined' && RUN && typeof enterNode === 'function' && typeof spawnTraps === 'function'", { timeout: 90000 });
    ctx.booted++;
  }
  /* world.html を開く (keep = 閉じずに返す) */
  async function openWorld(o) {
    const page = await newPage(o.view || null);
    await prep(page, o.cleared || [], { ss: o.ss || {} });
    await page.goto(base + F_WORLD + (o.q || ''), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction((S) => !!window.WORLD_MAP && !!window.__world && !!document.getElementById('worldNode_' + S), { timeout: 30000 }, ST_SITE);
    await sleep(o.settle || 1200);
    ctx.booted++;
    const snap = await page.evaluate(WORLD_SNAP, ST_SITE, PORT_TOWN);
    if (!o.keep) await page.close().catch(() => {});
    return { page, snap };
  }
  /* (1g) 押した先へ着くか入場が開くまで歩く (着かなければ押し直す) */
  async function walkTo(page, dest) {
    await page.evaluate((d) => window.__world.goToNode(d), dest);
    const t0 = Date.now(); const seen = []; const askAt = [];
    while (Date.now() - t0 < WALK_MS) {
      const s = await page.evaluate(() => ({ h: window.__world.heroNode(), a: window.__world.askOpen(), m: window.__world.isMoving(),
        t: (document.getElementById('worldEnterText') || {}).textContent || '' }));
      if (seen[seen.length - 1] !== s.h) seen.push(s.h);
      if (s.a) { askAt.push({ h: s.h, t: s.t.replace(/\s+/g, ' ').slice(0, 80) }); break; }
      if (!s.m && s.h === dest) { await sleep(800); const a2 = await page.evaluate(() => window.__world.askOpen()); if (!a2) break; }
      else if (!s.m) await page.evaluate((d) => window.__world.goToNode(d), dest);
      await sleep(250);
    }
    const end = await page.evaluate(() => ({ h: window.__world.heroNode(), a: window.__world.askOpen() }));
    return { seen, askAt, end, ms: Date.now() - t0 };
  }
  /* §3 / (0c) の戦闘: 手番の関数を包んで 1 戦闘回す
   *   ⭐ enemyAttackTurn は本番を呼ぶ包み・頭と仲間は見張る型 (W) の手番が CT 回来るまで何もしない
   *   approach: 'nonboss' = 生きていて休眠していない手下の脇へ / 'east' = いちばん東の手下の脇へ (休眠していても) */
  async function battle(page, W, CT, approach) {
    await page.evaluate((W, CT) => {
      const S = window.__stS = { watch: [], other: { turns: 0, added: 0, recs: [] }, killed: false, pba: [], pws: 0 };
      const _e = enemyAttackTurn, _pb = pickBossAction, _pw = partyWillSave;
      pickBossAction = function (e) { S.pba.push(enemies.indexOf(e)); return _pb.apply(this, arguments); };
      partyWillSave = function () { S.pws++; return _pw.apply(this, arguments); };
      const partyHp = () => hp + allies.filter((a) => !a.isHero).reduce((n, a) => n + (a.hp || 0), 0);
      enemyAttackTurn = async function (idx) {
        const e = enemies[idx];
        const isW = !!(e && e.type === W);
        const p0 = window.__glareProbe.length, t0 = traps.length, b0 = S.pba.length, used0 = !!(e && e.__glareUsed), h0 = partyHp();
        const r = await _e.apply(this, arguments);
        const add = window.__glareProbe.slice(p0).map((x) => ({ enemyIdx: x.enemyIdx, kind: x.kind, target: x.target, roll: x.roll, total: x.total, saved: x.saved, immune: x.immune, trapsLen: x.trapsLen }));
        const pba = S.pba.slice(b0).filter((i) => i === idx).length;
        if (isW) S.watch.push({ n: S.watch.length + 1, idx, added: add.length, recs: add, trapsBefore: t0, trapsAfter: traps.length, pba, used0, used1: !!e.__glareUsed, hpBefore: h0, hpAfter: partyHp() });
        else { S.other.turns++; S.other.added += add.length; if (add.length) S.other.recs.push({ idx, type: e && e.type, add }); }
        return r;
      };
      const finish = () => {
        if (S.killed || S.watch.length < CT) return;
        S.killed = true;
        for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e && e.alive && !e.passiveNpc) { e.hp = 0; defeatEnemy(i); } }
      };
      playerAttackTurn = async function () { finish(); };
      allyAttackTurn = async function () { finish(); };
      S.wrapped = { enemy: enemyAttackTurn === window.enemyAttackTurn, player: playerAttackTurn === window.playerAttackTurn, pba: pickBossAction === window.pickBossAction };
      maxHp = Math.max(maxHp, 999); hp = maxHp;
      for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; }
    }, W, CT);
    /* 入室の語り・選択肢を流す */
    for (let i = 0; i < 12; i++) {
      if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) break;
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
        if (btns.length) btns[btns.length - 1].click();
        const ov = document.getElementById('skillCheckOverlay');
        if (ov && ov.classList.contains('show')) { const rb = document.getElementById('scRollBtn'); if (rb) rb.click(); ov.click(); }
        document.body.click();
      });
      await sleep(300);
    }
    const o = await page.evaluate(async (W, START_MS, END_MS, AP) => {
      const o = {};
      const S = window.__stS;
      o.trapsAtEntry = traps.length;
      let k = null;
      if (AP === 'east') {
        for (const e of enemies) if (e.alive && !(e.def && e.def.isBoss) && (!k || e.x > k.x)) k = e;
      } else k = enemies.find((e) => e.alive && !e.inactive && !(e.def && e.def.isBoss)) || null;
      o.approach = k ? k.type : null;
      if (!encounterActive && k) {
        const ktx = Math.floor((k.x + k.def.displaySize / 2) / TILE_SIZE), kty = Math.floor((k.y + k.def.displaySize / 2) / TILE_SIZE);
        playerX = (ktx - 2) * TILE_SIZE - 16; playerY = kty * TILE_SIZE - 26;
        await new Promise((r) => setTimeout(r, 400));
        try { tryStartEncounter(); } catch (e) { o.tseErr = e.message; }
      }
      const t0 = performance.now();
      while (!encounterActive && performance.now() - t0 < START_MS) await new Promise((r) => setTimeout(r, 250));
      o.started = !!encounterActive; o.startMs = Math.round(performance.now() - t0);
      if (window.__dpTrace) { o.eyeTrace = { pre: window.__dpTrace.pre, eye: window.__dpTrace.eye }; clearInterval(window.__dpTrace.iv); }
      if (!o.started) {
        const vis = (id) => { const el = document.getElementById(id); return !!el && (el.classList.contains('show') || getComputedStyle(el).display !== 'none'); };
        let eng = null; try { eng = detectEngaged().length; } catch (e) { eng = 'ERR ' + e.message; }
        o.diag = { gameStarted: !!gameStarted, gameOver: !!gameOver, attackActive: !!attackActive, counterActive: !!counterActive, playerHitStun,
          dialogPaused: !!dialogPaused, skillCheckActive: !!skillCheckActive, engaged: eng, cur: currentNodeId,
          player: [Math.floor((playerX + 48) / TILE_SIZE), Math.floor((playerY + 58) / TILE_SIZE)],
          k: k ? { type: k.type, alive: !!k.alive, inactive: !!k.inactive, t: [Math.floor((k.x + k.def.displaySize / 2) / TILE_SIZE), Math.floor((k.y + k.def.displaySize / 2) / TILE_SIZE)] } : null,
          choice: vis('choiceDialog'), skill: vis('skillCheckOverlay'), dm: vis('dmNarration'),
          hold: (typeof narrationHold !== 'undefined') ? !!narrationHold : null, playing: (typeof narrationPlaying !== 'undefined') ? !!narrationPlaying : null,
          hand: (typeof mageHandBusy !== 'undefined') ? !!mageHandBusy : null,
          shown: Array.from(document.querySelectorAll('.show')).map((e) => (e.id || e.className).slice(0, 40)).slice(0, 12),
          bodyCls: document.body.className.slice(0, 120),
          traps: traps.map((t) => ({ tx: t.tx, ty: t.ty, found: !!t.found, rolled: !!t._disarmRolled, trig: !!t.triggered, dis: !!t.disarmed })), dpLog: window.__dpLog ? window.__dpLog.slice(-30) : null, dpTrace: window.__dpTrace ? { pre: window.__dpTrace.pre, eye: window.__dpTrace.eye, tl: window.__dpTrace.tl.slice(-20) } : null };
      }
      const t1 = performance.now();
      while ((encounterActive || encounterRunning) && performance.now() - t1 < END_MS) await new Promise((r) => setTimeout(r, 250));
      o.ended = !encounterActive && !encounterRunning; o.encMs = Math.round(performance.now() - t1);
      o.trapsAtEnd = traps.length;
      const wi = enemies.findIndex((e) => e.type === W);
      o.wIdx = wi; o.wUsed = wi >= 0 ? !!enemies[wi].__glareUsed : null;
      o.probeAll = window.__glareProbe.map((x) => ({ enemyIdx: x.enemyIdx, kind: x.kind, saved: x.saved }));
      o.S = JSON.parse(JSON.stringify(S));
      return o;
    }, W, ENC_START_WAIT_MS, ENC_END_WAIT_MS, approach || 'nonboss');
    return o;
  }
  try {
    const PLACE = PLACE_OF(servedFile(F_TAVERN, mutKey));
    /* ══════════ tavern ══════════ */
    const tp = await newPage();
    const openTav = async (q) => {
      await tp.goto(base + F_TAVERN + (q || ''), { waitUntil: 'load', timeout: 60000 });
      await tp.waitForFunction(() => { try { return typeof scenarios !== 'undefined' && !!window.__TAVERN_TV; } catch (e) { return false; } }, { timeout: 30000 });
      await tp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await sleep(150);
      ctx.booted++;
      return tp.evaluate(TAV_SNAP, ST_SITE);
    };
    const redraw = async (q) => { await tp.evaluate((BK) => localStorage.removeItem(BK), BOARD_KEY); return openTav(q); };

    await prep(tp, []);
    const on0 = await openTav('');
    const onDraws = [on0.seats];
    for (let i = 1; i < N_1C; i++) onDraws.push((await redraw('')).seats);
    const mainIds = (on0.scen || []).filter((s) => !s.side).map((s) => s.id);
    const sideIds = (on0.scen || []).filter((s) => s.side).map((s) => s.id);
    const MINE = mainIds[0], FOREST = mainIds[1], SWAMP = mainIds[2];
    const MF = [MINE, FOREST];
    await prep(tp, [MINE]);
    const on1 = await openTav('');
    await prep(tp, MF);
    const on2 = await openTav('');
    await prep(tp, MF);
    const off2 = await openTav('?tomb=0');
    await prep(tp, mainIds);
    const c6 = await openTav('');
    await prep(tp, mainIds.concat(sideIds));
    const cAll = await openTav('');
    await tp.close().catch(() => {});

    /* ══════════ world ══════════ */
    const w0 = (await openWorld({ cleared: [] })).snap;                 /* (1c)(1e) */
    const w1 = (await openWorld({ cleared: [MINE] })).snap;             /* (1c) */
    const w2 = (await openWorld({ cleared: MF })).snap;                 /* (1a)(1d) */
    const w2off = (await openWorld({ cleared: MF, q: '?tomb=0' })).snap;   /* (4b) */
    /* (4c) 撤退 4 段 (本番の関数を呼ぶ。⚠ 閉じる直前のページで)。★[#106] 先頭に retireHag() を足して 5 段 */
    const wr = await openWorld({ cleared: [], keep: true });
    const retired = await wr.page.evaluate(() => {
      const W = window.WORLD_MAP;
      const fp = () => ({ sites: JSON.parse(JSON.stringify(W.SITES)), edges: W.EDGES.map((e) => e[0] + '__' + e[1]),
        nodesFP: Object.keys(W.NODES).map((id) => { const n = W.NODES[id]; return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—'); }) });
      if (['retireGiant', 'retireHag', 'retireTomb', 'retireCargo', 'retireWarren', 'retireTower'].some((f) => typeof W[f] !== 'function')) return null;
      const o = { on: fp() };
      W.retireGiant(); o.giant = fp();   /* ★[#107] さらに先頭に retireGiant() を足して 6 段 */
      W.retireHag(); o.hag = fp();
      W.retireTomb(); o.tomb = fp();
      W.retireCargo(); o.cargo = fp();
      W.retireWarren(); o.warren = fp();
      W.retireTower(); o.tower = fp();
      return o;
    }).catch(() => null);
    await wr.page.close().catch(() => {});
    /* (1f) 札の重なり + 刻み点を奪わない: 2 画面 × 立ち位置 3 (title 起点 / lake_n / farm_n__pass_n@1) */
    const signRows = [];
    for (const v of SIGN_VIEWS) {
      for (const stand of SIGN_STANDS) {
        const ss = stand === 'title' ? {} : { 'dragonfighters.roadReturn': stand };
        const w = await openWorld({ cleared: MF, ss, view: v, keep: true, settle: 1500 });
        const m = await w.page.evaluate(SIGN_SNAP, ST_SITE);
        await w.page.close().catch(() => {});
        signRows.push(Object.assign({ view: v.w + 'x' + v.h, stand }, m));
      }
    }
    /* (1g) ① 受注 = 墓所: 廃坑を押して歩く (lake_n を通る) → 開かない → lake_n を押して戻る → 開く
     *      ② 受注 = 廃坑: 廃坑を押して歩く → lake_n を通っても開かず廃坑で開く */
    const G = {};
    {
      const w = await openWorld({ cleared: MF, q: WORLD_Q, ss: { 'dragonfighters.exitVia': 'town', 'dragonfighters.questDest': ST, 'dragonfighters.currentScenario': ST }, keep: true, settle: 1800 });
      G.start1 = { hero: w.snap.hero, ask: w.snap.ask };
      G.path1 = await w.page.evaluate((F, M) => window.WORLD_MAP.findWalkPath(F, M), PORT_TOWN, MINE_SITE);
      G.toMine = await walkTo(w.page, MINE_SITE);
      G.back = await walkTo(w.page, ST_SITE);
      await w.page.close().catch(() => {});
    }
    {
      const w = await openWorld({ cleared: MF, q: WORLD_Q, ss: { 'dragonfighters.exitVia': 'town', 'dragonfighters.questDest': MINE, 'dragonfighters.currentScenario': MINE }, keep: true, settle: 1800 });
      G.start2 = { hero: w.snap.hero, ask: w.snap.ask };
      G.mineQ = await walkTo(w.page, MINE_SITE);
      await w.page.close().catch(() => {});
    }

    /* ── §1 / §4b の判定 ── */
    const stOf = (s) => (s.scen || []).find((x) => x.id === ST) || null;
    const A1 = (s, w) => {
      const t = stOf(s);
      if (!t || !s.sites || !s.unlock || !w || !w.sites) return { ok: false, why: '墓所が scenarios / SITES に無い (scenarios に ' + (t ? '在る' : '無い') + ')' };
      const ids = s.scen.map((x) => x.id).sort().join('|');
      const why = [];
      if (!(t.side === true && t.locked === true && typeof t.unlockAfter === 'string' && t.place === PLACE)) why.push('scenarios の墓所 ' + J(t) + ' / 配信バイトの place ' + PLACE);
      if (Object.keys(s.sites).sort().join('|') !== ids) why.push('tavern の SITES の id 集合 ≠ scenarios');
      if (Object.keys(w.sites).sort().join('|') !== ids) why.push('world.html の SITES の id 集合 ≠ scenarios');
      if (s.sites[ST] !== ST_SITE || w.sites[ST] !== ST_SITE) why.push('SITES[墓所] ' + s.sites[ST] + '/' + w.sites[ST]);
      for (const x of s.scen) {
        const u = x.locked ? x.unlockAfter : null;
        if ((s.unlock[x.id] || null) !== u) why.push('UNLOCK[' + x.id + ']=' + s.unlock[x.id] + ' ≠ unlockAfter ' + u);
        if ((w.unlock[x.id] || null) !== u) why.push('world.html UNLOCK[' + x.id + ']=' + w.unlock[x.id] + ' ≠ unlockAfter ' + u);
      }
      if (!s.node || s.node.kind !== 'site' || s.node.label !== PLACE || !w.node || w.node.kind !== 'site' || w.node.label !== PLACE) why.push(ST_SITE + ' が拠点「' + PLACE + '」でない ' + J([s.node, w.node]));
      if (!/\bworldNode-site\b/.test(w.cls || '') || !w.sign || w.sign.indexOf(PLACE) < 0) why.push('world.html の DOM の札 ' + J([w.cls, w.sign]));
      return { ok: why.length === 0, why: why.join(' / ') };
    };
    const a1On = A1(on2, w2), a1Off = A1(off2, w2off);
    R.check('(1a)', 'tavern の墓所 (配信バイトの id → place「' + PLACE + '」・side・locked・unlockAfter) と同じページの SITES / UNLOCK / NODES.' + ST_SITE + '、world.html の SITES / UNLOCK / DOM の札が一致',
      a1On.ok, a1On);
    R.check('(1b)', 'side・ALL_MAIN_SCENARIOS に無い・本筋 (side でない scenarios) と同じ並び・本筋 6 本 (と +本筋外 ' + sideIds.length + ' 本) クリアで frontier が null',
      !!stOf(on0) && stOf(on0).side === true && Array.isArray(on0.allMain) && on0.allMain.indexOf(ST) < 0 && on0.allMain.join('|') === mainIds.join('|')
        && J(on0.main) === J(mainIds) && mainIds.length === 6 && mainIds.indexOf(ST) < 0 && sideIds.indexOf(ST) >= 0
        && !!c6.facts && !!cAll.facts && c6.facts.frontier === null && cAll.facts.frontier === null,
      { allMain: on0.allMain, main: on0.main, side: sideIds, c6: c6.facts && c6.facts.frontier, cAll: cAll.facts && cAll.facts.frontier });
    const pairIs = (s, a, b) => Array.isArray(s) && s.length === 2 && s.indexOf(a) >= 0 && s.indexOf(b) >= 0;
    const wayLook = (w) => !!w && /\bworldNode-way\b/.test(w.cls || '') && w.sign === null && !w.title;
    const srt = (a) => J((a || []).slice().sort());
    R.check('(1c)', 'cleared=[] → 卓は「' + MINE + ' + 巣穴」・本筋は ' + MINE + '・' + N_1C + ' 回引き直しても変わらない / cleared=[' + MINE + '] → 解放済み 4 件のまま (' + [MINE, FOREST, WARREN, CARGO].join('・') + ') / どちらも world.html の ' + ST_SITE + ' は中継点の見た目',
      !!on0.facts && srt(on0.facts.unlocked) === srt([MINE, WARREN]) && on0.facts.frontier === MINE
        && onDraws.length === N_1C && onDraws.every((d) => pairIs(d, MINE, WARREN))
        && !!on1.facts && srt(on1.facts.unlocked) === srt([MINE, FOREST, WARREN, CARGO]) && wayLook(w0) && wayLook(w1),
      { facts0: on0.facts, draws: onDraws, facts1: on1.facts && on1.facts.unlocked, world0: { cls: w0.cls, sign: w0.sign, title: w0.title }, world1: { cls: w1.cls, sign: w1.sign, title: w1.title } });
    const D1 = (s, w, offFacts) => !!s.facts && (s.facts.unlocked || []).indexOf(ST) >= 0 && (s.facts.unlocked || []).indexOf(SWAMP) >= 0
      && !!offFacts && srt(s.facts.unlocked) === srt((offFacts.unlocked || []).concat([ST]))
      && !!w && /\bworldNode-site\b/.test(w.cls || '') && !!w.sign && w.sign.indexOf(PLACE) >= 0;
    R.check('(1d)', 'cleared=[' + MF.join(', ') + '] → 解放済みに墓所 (と ' + SWAMP + ') が入る (= ?tomb=0 の解放済み + 墓所)・world.html の ' + ST_SITE + ' に札「' + PLACE + '」',
      D1(on2, w2, off2.facts), { facts: on2.facts, offUnlocked: off2.facts && off2.facts.unlocked, world: { cls: w2.cls, sign: w2.sign } });
    /* ⚠ findWalkPath の戻り値は「出発点を含まない」歩く順のノード列 */
    R.check('(1e)', 'world.html で WORLD_MAP.findWalkPath("' + PORT_TOWN + '", "' + ST_SITE + '") が null でなく ' + ST_SITE + ' で終わる',
      Array.isArray(w0.path) && w0.path.length >= 1 && w0.path[w0.path.length - 1] === ST_SITE, { path: w0.path });
    const f1ok = signRows.length === SIGN_VIEWS.length * SIGN_STANDS.length
      && signRows.every((r) => !!r.me && Array.isArray(r.vsOthers) && r.vsOthers.length === 0 && Array.isArray(r.stolen) && r.stolen.length === 0
        && (r.stand === 'title' || r.heroNode === r.stand))
      && SIGN_VIEWS.every((v) => signRows.some((r) => r.view === v.w + 'x' + v.h && (r.checked || []).indexOf(STEP_GUARD) >= 0));
    R.check('(1f)', 'cleared=[' + MF.join(', ') + '] の world.html (1440x900 / 390x844 × 主人公が title 起点 / ' + ST_SITE + ' / ' + STEP_GUARD + ') で墓所の札と他の札の交わり 0・墓所の札が刻み点マーカーの中心を奪わない (各画面で ' + STEP_GUARD + ' を 1 回以上調べる)',
      f1ok, signRows.map((r) => ({ view: r.view, stand: r.stand, at: r.heroNode, signs: r.signCount, others: r.vsOthers, steps: (r.checked || []).length,
        guard: (r.checked || []).indexOf(STEP_GUARD) >= 0, stolen: r.stolen, cover: r.heroCover == null ? null : +(r.heroCover * 100).toFixed(1) })));
    const g1 = G.toMine || {}, gb = G.back || {}, g2 = G.mineQ || {};
    const lakeIn = (x) => (x.seen || []).indexOf(ST_SITE) >= 0;
    R.check('(1g)', '母集団: findWalkPath("' + PORT_TOWN + '","' + MINE_SITE + '") が ' + ST_SITE + ' を含む / ① 受注 = 墓所で ' + MINE_SITE + ' を押して歩くと ' + ST_SITE + ' を踏んでも開かず ' + MINE_SITE + ' でも開かない → '
      + ST_SITE + ' を押して戻ると墓所の入場が開く / ② 受注 = 廃坑なら ' + ST_SITE + ' を踏んでも開かず ' + MINE_SITE + ' で開く',
      Array.isArray(G.path1) && G.path1.indexOf(ST_SITE) >= 0 && !!G.start1 && G.start1.hero === PORT_TOWN && G.start1.ask === false
        && lakeIn(g1) && (g1.askAt || []).length === 0 && !!g1.end && g1.end.h === MINE_SITE && g1.end.a === false
        && (gb.askAt || []).length === 1 && gb.askAt[0].h === ST_SITE && gb.askAt[0].t.indexOf(PLACE) >= 0
        && !!G.start2 && G.start2.hero === PORT_TOWN && G.start2.ask === false
        && lakeIn(g2) && (g2.askAt || []).length === 1 && g2.askAt[0].h === MINE_SITE && g2.askAt[0].t.indexOf(PLACE) < 0,
      G);
    /* (4b) = 配列から消え・lake_n が中継点・cleared=[廃坑, 森] の解放済みから墓所が消える・(1a)(1d) の条件が ON/OFF で反転 */
    const offOk = !stOf(off2) && !(off2.sites && off2.sites[ST]) && !!off2.node && off2.node.kind === 'way'
      && !!off2.facts && (off2.facts.unlocked || []).indexOf(ST) < 0 && !!on2.facts && (on2.facts.unlocked || []).length === (off2.facts.unlocked || []).length + 1
      && !!w2off.node && w2off.node.kind === 'way' && wayLook(w2off) && !(w2off.sites && w2off.sites[ST]);
    const onPair = [a1On.ok, D1(on2, w2, off2.facts)], offPair = [a1Off.ok, D1(off2, w2off, off2.facts)];
    R.check('(4b)', '?tomb=0 で tavern の配列から消え・' + ST_SITE + ' が中継点 (tavern と world.html)・cleared=[' + MF.join(', ') + '] の解放済みから墓所が消える (件数 −1)・(1a)(1d) の条件が ON/OFF で反転',
      offOk && onPair.every((x) => x === true) && offPair.every((x) => x === false),
      { offOk, on: onPair, off: offPair, offFacts: off2.facts, worldOff: { cls: w2off.cls, node: w2off.node, sign: w2off.sign } });
    const rs = retired ? { on: sha16(retired.on), giant: sha16(retired.giant), hag: sha16(retired.hag), tomb: sha16(retired.tomb), cargo: sha16(retired.cargo), warren: sha16(retired.warren), tower: sha16(retired.tower) } : null;
    const shaWant = [SHA_AFTER_GIANT, SHA_AFTER_HAG, SHA_AFTER_TOMB, SHA_AFTER_CARGO, SHA_AFTER_WARREN, SHA_AFTER_TOWER];
    R.check('(4c)', 'retireGiant() → retireHag() → retireTomb() → retireCargo() → retireWarren() → retireTower() の各段の地図の sha1 = ' + shaWant.join(' / ') + ' (★[#107] 1 段目 = 241c718 の既定・★[#106] 2 段目 = 6213fcb の既定・3 段目 = 2e2e291 の既定)・既定の地図はそのどれとも違う',
      !!rs && rs.giant === SHA_AFTER_GIANT && rs.hag === SHA_AFTER_HAG && rs.tomb === SHA_AFTER_TOMB && rs.cargo === SHA_AFTER_CARGO && rs.warren === SHA_AFTER_WARREN && rs.tower === SHA_AFTER_TOWER && shaWant.indexOf(rs.on) < 0,
      { sha: rs, sitesOn: retired && Object.keys(retired.on.sites).length, sitesTower: retired && Object.keys(retired.tower.sites).length });

    /* ══════════ index: 開幕の語り (?autoplay=1 のページで #dmBody に実際に出た文) ══════════ */
    const np = await newPage();
    await prep(np, null, idxSeed(ST));
    await np.evaluateOnNewDocument(() => {
      /* ⭐ #dmBody の文字が変わるたびに拾う (MutationObserver)。⚠ setInterval の間引きだと、
       *   負荷の高い時に 1 段落が書き上がった瞬間を取りこぼす (変異の手回しで実測した揺れ)。 */
      const seen = window.__narrSeen = [];
      const take = (b) => { const t = (b.textContent || '').trim(); if (t && seen[seen.length - 1] !== t) seen.push(t); };
      const iv = setInterval(() => {
        const b = document.getElementById('dmBody');
        if (!b) return;
        clearInterval(iv);
        take(b);
        new MutationObserver(() => take(b)).observe(b, { childList: true, characterData: true, subtree: true });
      }, 15);
      window.__narrStop = () => clearInterval(iv);
    });
    await np.goto(base + F_INDEX + '?autoplay=1&diag=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    ctx.booted++;
    let NARR = null;
    {
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        NARR = await np.evaluate((ID) => ({ paras: (typeof SCENARIO_NARRATIONS !== 'undefined' && SCENARIO_NARRATIONS[ID]) ? SCENARIO_NARRATIONS[ID].slice() : null,
          seen: (window.__narrSeen || []).slice(), started: typeof gameStarted !== 'undefined' && !!gameStarted, scen: typeof scenarioId !== 'undefined' ? scenarioId : null,
          header: (document.querySelector('#dmNarration .dmHeader') || {}).textContent || null }), ST).catch(() => NARR);
        if (NARR && NARR.started) break;
        await sleep(500);
      }
    }
    await np.close().catch(() => {});

    /* ══════════ index: n0 ══════════ */
    const ip = await newPage();
    await gotoIndex(ip, ST);
    const watchOk = await ip.evaluate(WATCH_INSTALL);
    await ip.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(2500);
    const N0 = await ip.evaluate((SNAP, TS, TT) => {
      const o = (new Function('return (' + SNAP + ')'))()(null);
      const tv = window.__silentTombTV;
      o.seams = { tvMummy: !!(tv && tv.ENEMY_TYPES && tv.ENEMY_TYPES.mummy && tv.ENEMY_TYPES.mummy.glareDC),
                  build: typeof window.buildSilentTombRun, glare: typeof window.mummyDreadfulGlare, probe: Array.isArray(window.__glareProbe) };
      try {
        const run = window.buildSilentTombRun();
        o.ledger = run.nodes.map((n) => ({ id: n.id, kind: n.kind,
          slots: [].concat(...n.mapDef.rooms.map((r) => (r.enemySlots || []).map((s) => s[2]))),
          boss: [].concat(...n.mapDef.rooms.map((r) => r.bossSlot ? [r.bossSlot[2]] : [])) }));
        const keys = Array.from(new Set([].concat(...o.ledger.map((n) => n.slots.concat(n.boss)))));
        o.ledgerDefs = keys.map((k) => ({ k, known: !!ENEMY_TYPES[k], faction: (ENEMY_TYPES[k] && ENEMY_TYPES[k].faction) || null, dormant: !!(ENEMY_TYPES[k] && ENEMY_TYPES[k].startsDormant) }));
      } catch (e) { o.ledger = 'ERR ' + e.message; }
      o.glareTypes = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k] && ENEMY_TYPES[k].glareDC);
      o.tombDefs = TT.map((k) => ({ k, fearDC: (ENEMY_TYPES[k] && ENEMY_TYPES[k].fearDC) || null, fearEyeDC: (ENEMY_TYPES[k] && ENEMY_TYPES[k].fearEyeDC) || null }));
      o.say = (new Function('return (' + TS + ')'))()(true);
      o.allies = allies.length;
      return o;
    }, NODE_SNAP.toString(), TRAP_SAY.toString(), TOMB_TYPES);
    /* (0c) n0 の番人 (東の群れ) と 1 戦闘: 見張る型 = いちばん東の手下 */
    const n0East = (N0.enemies || []).reduce((a, e) => (!e.boss && (!a || e.tx > a.tx)) ? e : a, null);
    const F0 = await battle(ip, n0East ? n0East.type : 'tombArmor', GUARD_TURNS, 'east');
    const W0 = await ip.evaluate(WATCH_READ);
    /* (2c) の宝箱は撤退の腕 ?roadchest=0 の起動ノード n0 で数える */
    const ipRC = await newPage();
    await gotoIndex(ipRC, ST, '?diag=1&roadchest=0');
    const N0rc = await ipRC.evaluate(() => ({ cur: currentNodeId, traps: traps.length, chests: roomChests.length }));
    await ipRC.close().catch(() => {});

    /* ══════════ index: n1 ══════════ */
    const N1 = await ip.evaluate(async (SNAP, TS, SC, MU) => {
      /* [診断] dialogPaused の遷移を 30ms ごとに記録 (誰が握ったかの切り分け) */
      const DT = window.__dpTrace = { pre: { dp: !!dialogPaused, sk: !!skillCheckActive, enc: !!(encounterActive || encounterRunning),
        choice: !!document.querySelector('#choiceDialog.show'), log: Array.from(document.querySelectorAll('#log > *')).slice(-4).map((e) => e.textContent.slice(0, 50)) },
        eye: [], tl: [] };
      let lastDp = null;
      const tick = () => { if (dialogPaused !== lastDp) { lastDp = dialogPaused; DT.tl.push([Math.round(performance.now()), !!dialogPaused, !!skillCheckActive]); if (DT.tl.length > 60) DT.tl.shift(); } };
      DT.iv = setInterval(tick, 30);
      const _eye = tryArcaneEyeOnEntry;
      tryArcaneEyeOnEntry = async function () { const r0 = { node: currentNodeId, dp: !!dialogPaused, sk: !!skillCheckActive }; const r = await _eye.apply(this, arguments); r0.ret = r; r0.dpAfter = !!dialogPaused; DT.eye.push(r0); return r; };
      /* ⭐ n0 の戦闘の後始末が済むまで待ってから n1 へ入る (揺れの原因 = 項目3 で特定・依頼書 §12-3)。
       *   n0 の敵を倒し切ると本番の tickNodeChoice が nodeBusy の内側で revealExitHints (知覚判定 = skillCheckActive + dialogPaused)
       *   → chooseExit (出口の矢印 = dialogPaused) を回す。その最中にドライバが enterNode を直接呼ぶと、
       *   n0 の矢印の Promise が n1 へ持ち越され dialogPaused = true のまま止まる (ゲームループが止まり戦闘が始まらない)。
       *   本番の enterNode はこの流れの終わりからしか呼ばれない (nodeBusy で排他) = 普通のプレイでは起きない。
       *   ⇒ 判定パネルは振って閉じ、矢印は Esc (= 留まる) で閉じ、nodeBusy / skillCheckActive / dialogPaused が 1 秒続けて下りてから入る。 */
      const settle = { esc: 0, roll: 0, ms: 0, ok: false };
      { const t0 = performance.now(); let calmSince = null;
        while (performance.now() - t0 < 30000) {
          const ov = document.getElementById('skillCheckOverlay');
          if (ov && ov.classList.contains('show')) { const rb = document.getElementById('scRollBtn'); if (rb) rb.click(); ov.click(); settle.roll++; }
          if (document.querySelector('.exitArrow')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); settle.esc++; }
          const calm = !nodeBusy && !skillCheckActive && !dialogPaused && !document.querySelector('.exitArrow');
          if (!calm) calmSince = null; else if (calmSince === null) calmSince = performance.now(); else if (performance.now() - calmSince >= 1000) { settle.ok = true; break; }
          await new Promise((r) => setTimeout(r, 100));
        }
        settle.ms = Math.round(performance.now() - t0); }
      await enterNode('n1', 'right');
      await new Promise((r) => setTimeout(r, 1200));
      const o = (new Function('return (' + SNAP + ')'))()(SC);
      o.settle = settle;
      o.mummyIdx = enemies.findIndex((e) => e.type === MU);
      o.say = (new Function('return (' + TS + ')'))()(false);
      /* (3b)(3c) mummyDreadfulGlare を直接呼ぶ。標的は差し替え (頭 / 仲間)・d20 を固定 */
      const mi = o.mummyIdx;
      o.direct = { encBefore: !!(encounterActive || encounterRunning), cases: [] };
      if (mi >= 0) {
        const _pick = pickEnemyTarget, _d20 = d20;
        const al = allies.find((a) => a.alive && !a.isHero);
        const alIdx = al ? allies.indexOf(al) : -1;
        const dc = enemies[mi].def.glareDC, gap = enemies[mi].def.glareStunGap;
        const clr = () => {
          playerBuffs.frightenedRemaining = 0; playerBuffs.frightenedPenalty = 0; playerBuffs.skipNextTurn = false;
          if (al) { al.buffs.frightenedRemaining = 0; al.buffs.frightenedPenalty = 0; al.stunned = 0; al.buffs.sleepWatchHp = null; }
        };
        const modL = (playerStats.wis || 0) + getSaveBonus('player');
        const modA = al ? (al.wis || 0) + getSaveBonus(al) : null;
        o.direct.dc = dc; o.direct.gap = gap; o.direct.modL = modL; o.direct.modA = modA;
        const ringIdx = accessories.findIndex((a) => a && a.freeAction);
        const one = async (label, who, roll, ring) => {
          clr();
          const accL = getUnitAccessoryIndices('player'), bakL = accL.slice();
          const hadA = al && Array.isArray(al.accessoryIndices), bakA = hadA ? al.accessoryIndices.slice() : null;
          if (ring) { if (who === 'ally') al.accessoryIndices = [ringIdx, 0]; else accL[0] = ringIdx; }
          const ringOn = who === 'ally' ? hasFreeAction(al) : hasFreeAction('player');
          pickEnemyTarget = who === 'ally'
            ? function () { return { kind: 'ally', idx: alIdx, zone: 'front', cx: al.x + al.def.displaySize / 2, cy: al.y + al.def.displaySize / 2 }; }
            : function () { return { kind: 'leader', zone: 'front', cx: playerX + 48, cy: playerY + 58 }; };
          let d20calls = 0;
          d20 = function () { d20calls++; return roll; };
          const n0 = window.__glareProbe.length, h0 = who === 'ally' ? al.hp : hp;
          try { await mummyDreadfulGlare(mi); } finally { pickEnemyTarget = _pick; d20 = _d20; }
          const rec = window.__glareProbe.slice(n0).map((r) => ({ kind: r.kind, roll: r.roll, total: r.total, dc: r.dc, saved: r.saved, frightened: r.frightened, stunned: r.stunned, immune: r.immune, idx: r.idx }));
          const st = who === 'ally'
            ? { fr: al.buffs.frightenedRemaining || 0, pen: al.buffs.frightenedPenalty || 0, stun: al.stunned || 0, sleepWatchHp: al.buffs.sleepWatchHp == null ? null : al.buffs.sleepWatchHp }
            : { fr: playerBuffs.frightenedRemaining || 0, pen: playerBuffs.frightenedPenalty || 0, skip: playerBuffs.skipNextTurn === true };
          const h1 = who === 'ally' ? al.hp : hp;
          if (ring) { if (who === 'ally') { if (hadA) al.accessoryIndices = bakA; else delete al.accessoryIndices; } else { accL[0] = bakL[0]; } }
          o.direct.cases.push({ label, who, roll, ring: !!ring, ringOn, d20calls, recs: rec, st, hpDrop: h0 - h1 });
          clr();
        };
        const clampR = (x) => Math.max(1, Math.min(20, x));
        /* 成功 = total が dc ちょうど / 恐怖だけ = dc - 2 / 恐怖 + 行動不能 = dc - gap (差 5 ちょうど) */
        await one('leader-save', 'leader', clampR(dc - modL));
        await one('leader-fear', 'leader', clampR(dc - 2 - modL));
        await one('leader-stun', 'leader', clampR(dc - gap - modL));
        if (al) {
          await one('ally-save', 'ally', clampR(dc - modA));
          await one('ally-fear', 'ally', clampR(dc - 2 - modA));
          await one('ally-stun', 'ally', clampR(dc - gap - modA));
          await one('ally-ring', 'ally', 1, true);
        }
        await one('leader-ring', 'leader', 1, true);
        o.direct.wrappedBack = (pickEnemyTarget === _pick && d20 === _d20);
        o.direct.usedAfter = !!enemies[mi].__glareUsed;
        o.direct.ringIdx = ringIdx;
      }
      o.direct.encAfter = !!(encounterActive || encounterRunning);
      o.direct.probeAfterDirect = window.__glareProbe.length;
      window.__glareProbe.length = 0;   /* 直接呼びの記録を消して §3 の戦闘を測る */
      return o;
    }, NODE_SNAP.toString(), TRAP_SAY.toString(), SARC, MUMMY);
    const FT = await battle(ip, MUMMY, BOSS_TURNS, 'nonboss');
    const W1 = await ip.evaluate(WATCH_READ);
    await ip.close().catch(() => {});

    /* ══════════ (3e) 他のボス: 巣穴の族長・倉庫街の司祭 ══════════ */
    const otherBoss = async (sid, type) => {
      const kp = await newPage();
      await gotoIndex(kp, sid);
      await kp.evaluate(() => { try { startGame(); } catch (e) {} });
      await sleep(2000);
      await kp.evaluate(async () => { await enterNode('n1', 'right'); await new Promise((r) => setTimeout(r, 1200)); window.__glareProbe.length = 0; });
      const F = await battle(kp, type, BOSS_TURNS, 'nonboss');
      await kp.close().catch(() => {});
      return F;
    };
    const FK = await otherBoss(WARREN, CHIEF);
    const FP = await otherBoss(CARGO, PRIEST);

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
    const probeBase = await runSpawn(MINE || 'goblin-mine', true, 1);
    const EXIST = (probeBase.keys || []).filter((k) => k !== ST);
    const nine = [];
    for (let i = 0; i < EXIST.length; i++) {
      const sid = EXIST[i], seed = 105000 + i * 7919;
      const b = await runSpawn(sid, true, seed);
      const c = await runSpawn(sid, false, seed);
      nine.push({ sid, base: b, cur: c });
    }
    await sp.close().catch(() => {});

    /* ── §0 ── */
    const led = Array.isArray(N0.ledger) ? N0.ledger : [];
    const l0 = led.find((n) => n.id === 'n0') || {}, l1 = led.find((n) => n.id === 'n1') || {};
    const n1m = (N1.enemies || []).filter((e) => e.type === MUMMY).length;
    R.check('(0a)', '[装置] __silentTombTV (マミーの型) / buildSilentTombRun / mummyDreadfulGlare が見え、2 ノード (n0 start / n1 boss) の台帳と実体の敵が 0 体でない・n1 のボスはマミー 1',
      N0.seams.tvMummy && N0.seams.build === 'function' && N0.seams.glare === 'function'
        && N0.scen === ST && J(N0.nodes) === J(['n0:start', 'n1:boss']) && N0.cur === 'n0' && N1.cur === 'n1'
        && led.length === 2 && (l0.slots || []).length >= 1 && (l1.slots || []).length >= 1 && J(l1.boss) === J([MUMMY]) && J(l0.boss) === J([])
        && (N0.enemies || []).length >= 1 && (N1.enemies || []).length >= 2 && n1m === 1 && (N0.enemies || []).every((e) => e.type !== MUMMY),
      { seams: N0.seams, scen: N0.scen, nodes: N0.nodes, cur: [N0.cur, N1.cur], ledger: N0.ledger, n0: (N0.enemies || []).map((e) => e.type), n1: (N1.enemies || []).map((e) => e.type) });
    R.check('(0b)', '[装置] __glareProbe が配列で在り、発動前 (n0・n1 の入場直後) は 0 件',
      N0.seams.probe === true && N0.probeLen === 0 && N1.probeLen === 0, { n0: N0.probeLen, n1: N1.probeLen });
    const ldefs = N0.ledgerDefs || [];
    const entryClean = (N) => (N.enemies || []).every((e) => !e.inactive && !e.dormant && e.faction !== 'beast');
    const noGuardBanner = (W) => !!W && W.awake === 0 && !W.banners.some((b) => /古代王国の守護者/.test(b));
    R.check('(0c)', '⭐ 墓所に守護者が居ない: 台帳 (slots / boss の鍵 ⊆ ' + TOMB_TYPES.join('・') + '・faction / startsDormant を持たない) と実体 (n0 / n1 の入場直後・全期間 200ms の監視で inactive / dormant / faction beast が 0) / n0 の番人と '
      + GUARD_TURNS + ' 手番以上の戦闘を最後まで回して awakenGuardians 0 回・「古代王国の守護者」のバナー 0',
      ldefs.length >= 3 && ldefs.every((d) => d.known && TOMB_TYPES.indexOf(d.k) >= 0 && d.faction === null && d.dormant === false)
        && entryClean(N0) && entryClean(N1) && watchOk === true && !!W1 && W1.dormantSeen.length === 0 && W1.beastSeen.length === 0
        && F0.started && F0.ended && (F0.S.watch || []).length >= GUARD_TURNS && noGuardBanner(W0) && noGuardBanner(W1),
      { ledgerDefs: ldefs, n0: (N0.enemies || []).map((e) => e.type + (e.inactive ? ':inactive' : '') + (e.dormant ? ':dormant' : '') + (e.faction ? ':' + e.faction : '')),
        n1: (N1.enemies || []).map((e) => e.type + (e.inactive ? ':inactive' : '') + (e.dormant ? ':dormant' : '') + (e.faction ? ':' + e.faction : '')),
        watchOk, n0battle: { approach: F0.approach, started: F0.started, ended: F0.ended, turns: (F0.S.watch || []).length, encMs: F0.encMs },
        W0: W0 && { awake: W0.awake, banners: W0.banners }, W1: W1 && { awake: W1.awake, dormant: W1.dormantSeen, beast: W1.beastSeen, banners: W1.banners } });
    /* ── §2 ── */
    const p0 = (N0.paintings || [])[0] || {}, p1 = (N1.paintings || [])[0] || {};
    const g0 = (p0.src && p0.bakeTile) ? gridCheck(p0.src, p0.bakeTile) : { ok: false, why: 'n0 に絵が無い / 1 マスの画素が縦横で揃わない' };
    const g1c = (p1.src && p1.bakeTile) ? gridCheck(p1.src, p1.bakeTile) : { ok: false, why: 'n1 に絵が無い / 1 マスの画素が縦横で揃わない' };
    R.check('(2a)', '焼き上がり 2 枚 (n0 / n1 に貼られた絵) が make_grid_map.py --check の縦横 3 指標で OK (--tile = 絵の実寸 / マス数)',
      g0.ok && g1c.ok && p0.src !== p1.src, { n0: [p0.src, p0.bakeTile, g0], n1: [p1.src, p1.bakeTile, g1c] });
    const mi1 = N1.mummyIdx;
    const n1PathMummy = (mi1 >= 0 && N1.pathToEnemies) ? N1.pathToEnemies[mi1] : null;
    const sarcN = (SARC.c2 - SARC.c1 + 1) * (SARC.r2 - SARC.r1 + 1);
    R.check('(2b)', '本番の aStar で n0 入口 → 出口の手前・各敵 / n1 入口 → マミー・各敵が通る・敵のタイルは全部歩ける・石棺の台座 ' + sarcN + ' マスは全部壁',
      typeof N0.pathToExit === 'number' && N0.pathToExit > 0 && (N0.pathToEnemies || []).length > 0 && N0.pathToEnemies.every((x) => typeof x === 'number')
        && (N1.pathToEnemies || []).length > 0 && N1.pathToEnemies.every((x) => typeof x === 'number') && typeof n1PathMummy === 'number'
        && N0.enemyWall.length === 0 && N1.enemyWall.length === 0
        && !!N1.sarc && N1.sarc.open.length === 0 && N1.sarc.wall === sarcN,
      { n0: { from: N0.player, exitInner: N0.exitInner, pathToExit: N0.pathToExit, toEnemies: N0.pathToEnemies, wall: N0.enemyWall },
        n1: { from: N1.player, toEnemies: N1.pathToEnemies, toMummy: n1PathMummy, wall: N1.enemyWall, sarc: N1.sarc } });
    const TT = N0.say && N0.say.tt || {};
    const dartText = TT[N0_TRAP] && TT[N0_TRAP].dmText, glyphText = TT[N1_TRAP] && TT[N1_TRAP].dmText;
    const s0 = N0.say || {}, s1 = N1.say || {};
    R.check('(2c)', '罠が n0 に 1 つ (' + N0_TRAP + ')・n1 に 1 つ (' + N1_TRAP + ')・湧いた罠を踏むと語りが dmText・n0 に宝箱 (?roadchest=0 の腕)',
      (N0.traps || []).length === 1 && N0.traps[0].type === N0_TRAP && (N1.traps || []).length === 1 && N1.traps[0].type === N1_TRAP
        && typeof dartText === 'string' && typeof glyphText === 'string' && J(s0.spawned) === J([dartText]) && J(s1.spawned) === J([glyphText])
        && N0rc.cur === 'n0' && N0rc.chests > 0,
      { n0: N0.traps, n1: N1.traps, spawnedSay: [s0.spawned, s1.spawned], roadchest0: N0rc });
    const area0 = (p0.tw || 0) * (p0.th || 0), area1 = (p1.tw || 0) * (p1.th || 0);
    const indoor = (N, p, area) => N.custom && N.themeId === ST && !!p.loaded && area > 0 && !!N.outdoor && N.outdoor.rooms === 0 && N.outdoor.exploredNow < area;
    R.check('(2d)', '2 枚とも isCustom (テーマ ' + ST + ')・絵が読み込まれ、屋外の開放 0・探索済み < 絵の範囲 (tw x th) = 霧が効く',
      indoor(N0, p0, area0) && indoor(N1, p1, area1),
      { custom: [N0.custom, N1.custom], theme: [N0.themeId, N1.themeId], p0: { loaded: p0.loaded, tw: p0.tw, th: p0.th }, p1: { loaded: p1.loaded, tw: p1.tw, th: p1.th },
        out0: N0.outdoor && { rooms: N0.outdoor.rooms, explored: N0.outdoor.exploredNow, area: area0 }, out1: N1.outdoor && { rooms: N1.outdoor.rooms, explored: N1.outdoor.exploredNow, area: area1 } });
    /* ── §3 ── */
    const S = FT.S || { watch: [], other: {} };
    const b1 = (S.watch || [])[0] || null;
    const r1 = b1 && b1.recs && b1.recs[0];
    const later = (S.watch || []).slice(1);
    R.check('(3a)', 'マミーの最初の手番で __glareProbe に 1 件 (その手番で pickBossAction は呼ばれない = 行動選択の前)・2 回目以降 (' + (BOSS_TURNS - 1) + ' 回以上) は増えない・__glareUsed が立つ',
      FT.started && !!b1 && b1.added === 1 && !!r1 && r1.enemyIdx === FT.wIdx && b1.pba === 0 && b1.used0 === false && b1.used1 === true
        && typeof r1.saved === 'boolean' && !!r1.target
        && later.length >= BOSS_TURNS - 1 && later.every((t) => t.added === 0) && FT.wUsed === true,
      { started: FT.started, startMs: FT.startMs, settle: N1.settle, eyeTrace: FT.eyeTrace, diag: FT.diag, approach: FT.approach, first: b1, later: later.map((t) => ({ n: t.n, added: t.added, pba: t.pba })), ended: FT.ended, encMs: FT.encMs, wrapped: S.wrapped });
    const Dd = N1.direct || {};
    const cs = Dd.cases || [];
    const caseOk = (c) => {
      const r = (c.recs || [])[0];
      if (!r || c.recs.length !== 1 || c.hpDrop !== 0) return false;
      if (r.kind !== (c.who === 'ally' ? 'ally' : 'leader')) return false;
      const st = c.st || {};
      const stun = c.who === 'ally' ? st.stun >= 1 : st.skip === true;
      const noStun = c.who === 'ally' ? st.stun === 0 : st.skip === false;
      if (c.ring) return c.ringOn === true && r.immune === true && r.saved === true && r.roll === null && c.d20calls === 0
        && r.frightened === false && r.stunned === false && st.fr === 0 && noStun && (c.who !== 'ally' || st.sleepWatchHp === null);
      const mod = c.who === 'ally' ? Dd.modA : Dd.modL;
      if (r.immune !== false || r.roll !== c.roll || r.total !== c.roll + mod || r.dc !== Dd.dc || c.d20calls !== 1) return false;
      const wantSave = r.total >= Dd.dc, wantStun = !wantSave && r.total <= Dd.dc - Dd.gap;
      if (r.saved !== wantSave || r.frightened !== !wantSave || r.stunned !== wantStun) return false;
      const kind = c.label.split('-')[1];
      if (kind === 'save' && !wantSave) return false;
      if (kind === 'fear' && (wantSave || wantStun)) return false;
      if (kind === 'stun' && !wantStun) return false;
      if (c.who === 'ally' && st.sleepWatchHp !== null) return false;
      if (wantSave) return st.fr === 0 && noStun;
      return st.fr > 0 && st.pen > 0 && (wantStun ? stun : noStun);
    };
    const plain = cs.filter((c) => !c.ring);
    R.check('(3b)', '乱数固定の直接呼び: 成功 (total = DC) / 失敗で恐怖だけ (DC−2) / 5 以上の差の失敗で恐怖 + 行動不能 (DC−5) × 頭と仲間・状態 (frightenedRemaining / skipNextTurn / stunned) と probe が一致・HP は減らない・仲間に sleepWatchHp を書かない',
      !Dd.encBefore && !Dd.encAfter && Dd.wrappedBack === true && Dd.usedAfter === false && plain.length === 6 && plain.every(caseOk),
      { dc: Dd.dc, gap: Dd.gap, modL: Dd.modL, modA: Dd.modA, cases: plain.map((c) => ({ label: c.label, roll: c.roll, rec: c.recs[0], st: c.st, hpDrop: c.hpDrop, ok: caseOk(c) })) });
    const rings = cs.filter((c) => c.ring);
    R.check('(3c)', '自由行動の指輪 (accessories の freeAction) を着けた頭 / 仲間は probe の immune: true・d20 を振らない・恐怖も行動不能も立たない',
      Dd.ringIdx > 0 && rings.length === 2 && rings.every(caseOk) && rings.some((c) => c.who === 'ally') && rings.some((c) => c.who === 'leader'),
      { ringIdx: Dd.ringIdx, cases: rings.map((c) => ({ label: c.label, ringOn: c.ringOn, d20calls: c.d20calls, rec: c.recs[0], st: c.st, ok: caseOk(c) })) });
    R.check('(3d)', '⭐ 戦闘開始時の全体恐怖 partyWillSave が墓所の戦闘 (n0 の番人・n1 の玄室) で 1 度も呼ばれない (全期間の見張りでも 0)',
      F0.started && FT.started && (F0.S || {}).pws === 0 && (FT.S || {}).pws === 0 && !!W1 && W1.pws === 0,
      { n0: (F0.S || {}).pws, n1: (FT.S || {}).pws, page: W1 && W1.pws });
    const oth = S.other || {};
    const KS = FK.S || { watch: [], other: {} }, PS = FP.S || { watch: [], other: {} };
    const otherOk = (F, X) => F.started && (X.watch || []).length >= BOSS_TURNS && X.watch.every((t) => t.added === 0) && (X.other || {}).added === 0 && (F.probeAll || []).length === 0;
    R.check('(3e)', 'glareDC を持つ型 = ' + MUMMY + ' だけ (墓所の型は fearDC / fearEyeDC を持たない) / 玄室の手下の手番・巣穴の族長と倉庫街の司祭 (' + BOSS_TURNS + ' 手番ずつ) と手下の手番で probe が増えない / まなざしの手番で traps.length と パーティの HP が変わらない',
      J(N0.glareTypes) === J([MUMMY]) && (N0.tombDefs || []).every((d) => d.fearDC === null && d.fearEyeDC === null)
        && (oth.turns || 0) >= 1 && oth.added === 0 && (FT.probeAll || []).every((x) => x.enemyIdx === FT.wIdx)
        && !!b1 && b1.trapsBefore === b1.trapsAfter && !!r1 && r1.trapsLen === b1.trapsBefore && FT.trapsAtEnd === FT.trapsAtEntry && b1.hpBefore === b1.hpAfter
        && otherOk(FK, KS) && otherOk(FP, PS),
      { types: N0.glareTypes, tombDefs: N0.tombDefs, cryptOther: { turns: oth.turns, added: oth.added, recs: (oth.recs || []).slice(0, 3) },
        glareTurn: b1 && { trapsBefore: b1.trapsBefore, trapsAfter: b1.trapsAfter, probeTrapsLen: r1 && r1.trapsLen, hp: [b1.hpBefore, b1.hpAfter] },
        warren: { started: FK.started, turns: (KS.watch || []).map((t) => t.added), other: KS.other && [KS.other.turns, KS.other.added], probe: FK.probeAll },
        cargo: { started: FP.started, turns: (PS.watch || []).map((t) => t.added), other: PS.other && [PS.other.turns, PS.other.added], probe: FP.probeAll } });
    /* ── §4 ── */
    const paras = (NARR && NARR.paras) || [];
    const seenAll = paras.length === 4 && paras.every((p) => (NARR.seen || []).some((t) => t.replace(/\s+/g, '') === p.replace(/\s+/g, '')));
    const nineTexts = nine.map((x) => ({ sid: x.sid, base: x.base.said, cur: x.cur.said }));
    const existOk = nine.length > 0 && nine.some((x) => (x.base.said || []).length > 0)
      && nine.every((x) => J(x.base.said) === J(x.cur.said) && (x.cur.said || []).every((t) => t !== dartText && t !== glyphText));
    R.check('(4a)', '開幕の語り 4 行が #dmBody に出る (2 行目に碑文)・n0 の罠 = 矢の語り (頭・仲間)・n1 = 紋の語り・第 2 引数が優先・既存 ' + nine.length + ' シナリオは ' + BASE_REV + ' と同じ語り',
      !!NARR && NARR.scen === ST && seenAll && /眠りを妨げる者/.test(paras[1] || '')
        && s0.dmWrapped === true && typeof dartText === 'string' && /矢/.test(dartText) && typeof glyphText === 'string' && /紋/.test(glyphText)
        && s0.type === N0_TRAP && s1.type === N1_TRAP && J(s0.player) === J([dartText]) && J(s0.ally) === J([dartText]) && J(s0.arg) === J(['引数の語り(検証)'])
        && J(s1.player) === J([glyphText]) && J(s1.arg) === J(['引数の語り(検証)']) && existOk,
      { narr: NARR && { scen: NARR.scen, paras: paras.length, seen: (NARR.seen || []).length, header: NARR.header, all: seenAll, line2: paras[1] }, dart: dartText, glyph: glyphText,
        n0: { type: s0.type, player: s0.player, ally: s0.ally, arg: s0.arg }, n1: { type: s1.type, player: s1.player, arg: s1.arg }, exist: nineTexts });
    /* ── §6 ── */
    const nineRows = nine.map((x) => ({ sid: x.sid, traps: x.cur.traps.length, same: J(x.base.traps) === J(x.cur.traps), calls: [x.base.calls, x.cur.calls], next: x.base.next === x.cur.next,
      types: Array.from(new Set(x.cur.traps.map((t) => t[2]))) }));
    R.check('(6a)', '既存 ' + nine.length + ' シナリオ (' + BASE_REV + ' の SCENARIOS) で、同じ種の乱数のもと spawnTraps の罠 (座標・種類)・乱数の呼び出し回数・次の乱数が ' + BASE_REV + ' と同じ',
      nine.length === 9 && EXIST.indexOf(ST) < 0 && EXIST.indexOf(WARREN) >= 0 && EXIST.indexOf(CARGO) >= 0 && nine.some((x) => x.cur.traps.length > 0)
        && nine.every((x) => J(x.base.traps) === J(x.cur.traps) && x.base.calls === x.cur.calls && x.base.next === x.cur.next),
      { exist: EXIST, rows: nineRows });
    /* ══════════ (0d) ══════════ */
    R.check('(0d)', '[装置] 全ページで pageerror 0 件', ctx.booted > 0 && ctx.errs.length === 0, '起動 ' + ctx.booted + ' 回 / pageerror ' + J(ctx.errs.slice(0, 3)));
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
  const profile = require('./_pptr_profile')('df_verify_silent_tomb_');
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
            + ' / 実際に赤くなった=' + (red.join(',') || '(なし)') + ' / 注入行の実行 ' + hit + ' 回 / 依頼書の予想=' + NEG_PREDICTED[key].join(',') + ' → ' + (ok ? '✓ OK' : '✗ ' + (hit ? '' : '注入行が実行されていない ')
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
