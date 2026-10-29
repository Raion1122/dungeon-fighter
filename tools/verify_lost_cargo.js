#!/usr/bin/env node
/*
 * verify_lost_cargo.js — 実装依頼書 #104「消えた積み荷」の受入ドライバ
 *   (依頼書 実装依頼書/2026-10-29_lost-cargo.md §8 = 受入条件の唯一の正。型 = tools/verify_kobold_warren.js)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_lost_cargo.js                          # 素
 *   node tools/verify_lost_cargo.js --negative               # 先に素の基準 → 変異 10 本 (port 10654〜10663)
 *   node tools/verify_lost_cargo.js --negative --only inflictall,typerng
 *   node tools/verify_lost_cargo.js --mutate nosite          # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome / git が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 登録の整合は**ブラウザに載った実体どうし**で突き合わせる (tavern.html の scenarios と同じページの
 *     WORLD_MAP、world.html の WORLD_MAP と DOM の札)。⛔ 写経しない。ドライバが持つ固定値は依頼書が決めた名前
 *     (id "lost-cargo" / 拠点 "pier" / 港町 "phlan" / 罠の種類 "pit" "miasma" / 司祭の型 "plaguePriest")・
 *     §12-1 (3-6) の MASK が決めた祭壇の矩形・verify_quest_walk (5a) が既に焼いた地図の sha1 の固定値だけ。
 *     place (札の文言) は配信バイトの id → place の並びから読む。
 *   - 傷を腐らせる手は本番の runEncounter を回して観測する (§3)。playerAttackTurn / allyAttackTurn だけを
 *     差し替え (司祭の手番が 3 回来るまで何もしない → 来たら本番の defeatEnemy で全員を倒して戦闘を終える)、
 *     enemyAttackTurn は**本番を呼ぶ包み**で手番ごとの __inflictProbe / traps.length / pickBossAction の呼び出しを数える。
 *     (3b) の命中 / 外れは d20 と pickEnemyTarget を呼び出しの間だけ差し替えて inflictWoundsTouch を直接呼ぶ
 *     (戦闘の外 = 司祭の __inflictUsed は立たない)。(3c) の「他のボス」は巣穴の族長と同じ包みで 1 戦闘回す。
 *   - 経路は本番の aStar (⛔ 自前の BFS を書かない)。焼き上がりの検算は本番の道具 make_grid_map.py --check。
 *   - (6a) は git BASE_REV (= #104 項目2 の前の commit) の index.html を同じ origin で配り (?__base=1)、
 *     同じ種の乱数で spawnTraps を 1 回だけ回して、罠の座標・種類・Math.random の呼び出し回数・その次の乱数を比べる。
 *   - 強さ (⑤) は assert にしない (別の道具で記録する。依頼書 §12 用)。
 *
 * ■ 依頼書 §8 からの言い直し (実装と項目1・2 の実測に合わせた点)
 *   - (0a) の pageerror 0 は (0c) に分けた (全ページを見終わってから数えるため。verify_kobold_warren と同じ)。
 *   - (1f) は「札どうしの交わり 0」に加え、**主人公が phlan / pier に立ったとき倉庫街の札を覆う割合 < 10%**
 *     (上限は verify_world_map (7f) の COVER_MAX と同じ) を縛る。⭐ 項目1 の実測で札どうしは signDx -72 でも
 *     重ならず (縦に 13.7px 空く)、主人公が phlan に立つと札の 35.9% / 39.1% を隠すと分かった → ユーザー決定で
 *     pier の signDx = -100。⛔ 390 幅で札の左端が画面外へ出るのは決定済みの挙動 = 縛らない。札の px も測らない。
 *   - 負のコントロール signclash は「倉庫街の札を signDx: -72」ではなく **signDx: 0 (主人公の真上へ戻す)**
 *     (-72 では (1f) は赤くならない = 項目1 の実測)。
 *   - (1g) は「桟橋に湧いた直後に桟橋そのものを押すと受注中なら開く」(world.html goToPoint の自分のノードの分岐) と
 *     「受注していなければ押しても開かない」も縛る。phlan への**歩いて戻り**は phlan が town.html へ入るので、
 *     町を出た直後 (exitVia "town" = phlan に立つ) のページで pier を押して着く経路で代える。
 *   - (2c) の宝箱は ?roadchest=0 の腕の n0 で数える (#87・verify_kobold_warren と同じ)。
 *   - (3a) は「最初の手番で pickBossAction が呼ばれていない」(= 入口は行動選択の前) も縛る (変異 inflictafter)。
 *   - (4a) の開幕の語りは ?autoplay=1 のページで #dmBody に実際に出た文を拾い、4 行すべてが出たことを見る。
 *   - (4c) は 3 段の撤退の途中も固定値で縛る: retireCargo() 後 = #103 の地図 / +retireWarren() = #82 の地図 /
 *     +retireTower() = 塔の母の前の地図 (固定値は verify_quest_walk (5a) の WANT_ON / WANT_W0 / WANT)。
 *   - (6a) の基準は f80543c (項目1 後半。index.html は項目2 の前)。既存 8 シナリオ = 本筋 6 + 塔の母 + 巣穴。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] __lostCargoTV (司祭の型) / buildLostCargoRun / inflictWoundsTouch が見え、2 ノード (n0 start / n1 boss) の台帳と実体の敵が 0 体でない・n1 のボスは司祭 1
 *      (0b) [装置] __inflictProbe が配列で在り、発動前 (n0・n1 の入場直後) は 0 件
 *      (0c) [装置] 全ページで pageerror 0 件
 *   §1 (1a) tavern の lost-cargo (配信バイトの id → place・side・locked・unlockAfter) と、同じページの SITES / UNLOCK / NODES.pier、
 *           world.html の SITES / UNLOCK と DOM の札 (文言 = place) が一致
 *      (1b) side・ALL_MAIN_SCENARIOS に無い・本筋 6 本 (と +巣穴 +倉庫街) クリアで frontier が null
 *      (1c) cleared=[] → 卓は「廃坑 + 巣穴」(8 回引き直しても)・world.html の pier は中継点の見た目 (札なし)
 *      (1d) cleared=[廃坑] → 解放済み 4 件 (廃坑・森・巣穴・倉庫街)・world.html の pier に札
 *      (1e) findWalkPath("phlan", "pier") が 1 ホップ
 *      (1f) cleared=[廃坑] の world.html (1440x900 / 390x844 × 主人公が phlan / pier) で倉庫街の札と他の札の交わり 0・主人公が倉庫街の札を覆う割合 < 10%
 *      (1g) 受注中に桟橋へ湧くと開かない → 桟橋を押すと開く / 受注なしなら押しても開かない / 町を出て pier へ歩いて着くと開く
 *   §2 (2a) 焼き上がり 2 枚が make_grid_map.py --check の縦横 3 指標で OK
 *      (2b) 本番の aStar で n0 入口 → 出口の手前・各敵 / n1 入口 → 司祭・各敵が通る・敵のタイルは歩ける・祭壇 6 マスは壁
 *      (2c) 罠は n0 に 1 つ (pit)・n1 に 1 つ (miasma)・湧いた罠を踏むと語りが dmText・n0 に宝箱 (?roadchest=0)
 *      (2d) 2 枚とも isCustom (テーマ lost-cargo)・絵が読み込まれ、屋外の開放 0・探索済み < 絵の範囲 (霧が効く)
 *   §3 (3a) 司祭の最初の手番で __inflictProbe に 1 件 (pickBossAction より前)・2 手番目以降は増えない・__inflictUsed
 *      (3b) 乱数固定の直接呼び: 命中は total >= ac かつ HP が dmg だけ減る・外れ (1 の出目・AC 未満) は減らない・20 は CRIT (6〜60)
 *      (3c) inflictDice を持つ型 = plaguePriest だけ / 祠の手下の手番・巣穴の族長と手下の手番で probe が増えない
 *      (3d) 傷を腐らせる手の手番の前後で traps.length が変わらない (probe の trapsLen とも一致)
 *   §4 (4a) 開幕の語り 4 行が出る・n0 = 落とし穴 / n1 = 瘴気の語り (頭・仲間)・第 2 引数が優先・既存 8 シナリオは BASE_REV と同じ語り
 *      (4b) ?cargo=0 で tavern の配列から消え・pier が中継点・cleared=[廃坑] の解放済みが 3 件・(1a)(1d) の条件が ON/OFF で反転
 *      (4c) retireCargo() → retireWarren() → retireTower() の各段の地図の sha1 が既存の固定値
 *   §6 (6a) 既存 8 シナリオで spawnTraps の罠 (座標・種類)・乱数の呼び出し回数・次の乱数が BASE_REV と同じ
 *   ⛔ 測らないこと (依頼書 §8): 司祭の displaySize・語りの文面の良し悪し・バナーの絵文字・クリアの XP と金貨・札の位置の px。
 *      ⑤ 強さは記録のみ。
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
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10653** (素) / 変異 **10654〜10663** (10 本・MUTATIONS の並び順)。次の新規ドライバ base = 10664。
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
const PORT = parseInt(arg('port', '10653'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前 (データ。期待値の写しではない) */
const LC = 'lost-cargo';
const LC_SITE = 'pier';
const PORT_TOWN = 'phlan';           // 港町フラン (js/world-map.js の NODES.phlan)
const WARREN = 'kobold-warren';      // (3c) の「他のボス」= 巣穴の族長 (#103)
const PRIEST = 'plaguePriest', CHIEF = 'koboldChief';
const N0_TRAP = 'pit', N1_TRAP = 'miasma';
const BASE_REV = 'f80543c';          // #104 項目1 後半 (index.html は項目2 の前 = 着手前)
/* 祭壇 (MASK §12-1 (3-6) の 絵ローカル col 21-22 / row 6-8) を global (+16, +6) へ */
const ALTAR = { c1: 37, c2: 38, r1: 12, r2: 14 };
/* (4c) 撤退の各段の地図の sha1 (先頭 16)。⚠ 値は verify_quest_walk (5a) が既に焼いた固定値 (#103 / #82 / #23 の実測)。 */
const SHA_AFTER_CARGO = '3918d569e7f3f7db';            // retireCargo() 後 = #103 の地図 (verify_quest_walk の WANT_ON)
const SHA_AFTER_WARREN = '647e71f6b2956389';           // + retireWarren() = #82 の地図 (WANT_W0)
const SHA_AFTER_TOWER = '876c5f6336f96811';            // + retireTower() = 塔の母の前の地図 (WANT)
const COVER_MAX = 0.10;              // (1f) 主人公が札を覆ってよい上限 (verify_world_map (7f) と同じ)
const SIGN_VIEWS = [{ w: 1440, h: 900, mobile: false }, { w: 390, h: 844, mobile: true }];
const BOARD_KEY = 'dragonfighters.questBoard';
const CLEARED_KEY = 'dragonfighters.cleared';
const VIEW = { width: 1280, height: 800 };
const N_1C = 8;                      // (1c) 引き直しの回数 (解放済みが 2 件 = 決定的)
const BOSS_TURNS = 3;                // §3 の戦闘でボスの手番を何回見るか
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
const F_INDEX = 'index.html', F_TAVERN = 'tavern.html', F_WORLD = 'world.html', F_MAPDEF = 'js/df-mapdef.js', F_WMAP = 'js/world-map.js';
const SERVED = [F_INDEX, F_TAVERN, F_WORLD, F_MAPDEF, F_WMAP];
const PRISTINE = {};
for (const f of SERVED) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
let BASE_INDEX = null;
try { BASE_INDEX = execFileSync('git', ['-C', ROOT, 'show', BASE_REV + ':' + F_INDEX], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
catch (e) { console.error('[vet] git show ' + BASE_REV + ':index.html に失敗: ' + e.message); process.exit(2); }
if (BASE_INDEX.indexOf(PRIEST) >= 0) vetFail('BASE_REV ' + BASE_REV + ' の index.html に ' + PRIEST + ' が在る (着手前でない)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。逐語は HEAD a53074d (項目2 の実装後) の行で取った。
 * ⚠ どれも 1 行 → 1 行 (行数不変)。⚠ 他ドライバのアンカーと重ならない行を選んだ (罠E)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const A_ENTRY = '      if (def.inflictDice && !enemy.__inflictUsed) {';
const A_PIER = '    pier:      { kind: "site", x:  352, y: 608, label: "港の倉庫街", desc: "桟橋の脇に並ぶ古い倉庫。床下は地下水道へ続く", signDx: -100 },';
const CARGO_RETIRE = '  /* ══ 撤退スイッチ ?cargo=0 (実装依頼書 #104 §7) ═════════════════════════════';
const MUTATIONS = {
  /* ⭐ 傷を腐らせる手を「traps[] へ罠を 1 つ足す」形にする (司祭の足元に damage の罠を置いて手番を終える) */
  inflictastrap: [
    { file: F_INDEX, from: '        await inflictWoundsTouch(idx);',
      to: '        { const __m = { tx: Math.floor((enemy.x + def.displaySize / 2) / TILE_SIZE), ty: Math.floor((enemy.y + def.displaySize / 2) / TILE_SIZE), type: "damage", damageDice: "3d10", found: false, triggered: false, disarmed: false, rearmed: false, owner: null, _disarmRolled: false, el: null }; traps.push(__m); createTrapDom(__m, traps.length - 1); ' + HIT('inflictastrap') + '; }   /* ★変異inflictastrap */' }],
  /* ⭐ 入口を行動選択 (pickBossAction) の後ろへ動かす: 元の入口を殺し、pickBossAction の直後に同じブロックを置く */
  inflictafter: [
    { file: F_INDEX, from: A_ENTRY,
      to: '      if (false && def.inflictDice && !enemy.__inflictUsed) {   /* ★変異inflictafter (元の入口を殺す) */' },
    { file: F_INDEX, from: '        bossAction = pickBossAction(enemy);',
      to: '        bossAction = pickBossAction(enemy); if (def.inflictDice && !enemy.__inflictUsed) { enemy.__inflictUsed = true; ' + HIT('inflictafter') + '; await inflictWoundsTouch(idx); await sleepMs(1100); return; }   /* ★変異inflictafter */' }],
  /* def.inflictDice の条件を外し、ボスなら誰でも撃つ */
  inflictall: [
    { file: F_INDEX, from: A_ENTRY,
      to: '      if ((def.inflictDice || def.isBoss) && !enemy.__inflictUsed) { if (!def.inflictDice) ' + HIT('inflictall') + ';   /* ★変異inflictall */' }],
  /* ⭐ 罠の種類を決めるのに Math.random を 1 回足す (宣言を持つシナリオ = 巣穴と倉庫街で効く) */
  typerng: [
    { file: F_INDEX, from: '      const t = nid != null ? decl[nid] : null;',
      to: '      Math.random(); ' + HIT('typerng') + '; const t = nid != null ? decl[nid] : null;   /* ★変異typerng */' }],
  /* 倉庫街を locked:false にする (撤退スイッチの直前で実行時に書き換える) */
  unlockfree: [
    { file: F_TAVERN, from: CARGO_RETIRE,
      /* ⚠ 原本の行は複数行コメントの開き = 置換後も開いたまま残す */
      to: '  (function () { var s = scenarios.find(function (x) { return x.id === "lost-cargo"; }); if (s) { s.locked = false; ' + HIT('unlockfree') + '; } })();' + CARGO_RETIRE + ' ★変異unlockfree' }],
  /* pier を kind: "way" のままにする (札も label も無い今日の中継点) */
  nosite: [
    { file: F_WMAP, from: A_PIER,
      to: '    pier:      (' + HIT('nosite') + ', { kind: "way",  x:  352, y: 608 }),   /* ★変異nosite */' }],
  /* ⭐ 倉庫街の札を主人公の真上へ戻す (signDx: 0)。⚠ 依頼書の -72 では札どうしが重ならず (1f) は赤くならない (項目1 の実測) */
  signclash: [
    { file: F_WMAP, from: A_PIER,
      to: '    pier:      (' + HIT('signclash') + ', { kind: "site", x:  352, y: 608, label: "港の倉庫街", desc: "桟橋の脇に並ぶ古い倉庫。床下は地下水道へ続く", signDx: 0 }),   /* ★変異signclash */' }],
  /* 湧いた瞬間に onArriveNode を呼ぶ (⚠ enter を持つ港町は除く = town.html へ飛んで他の節を巻き込まない) */
  spawnenter: [
    { file: F_WORLD, from: '    window.__world = {',
      to: '    setTimeout(function () { var __n = NODES[heroNodeId]; if (__n && !__n.enter) { ' + HIT('spawnenter') + '; onArriveNode(heroNodeId); } }, 0); window.__world = {   /* ★変異spawnenter */' }],
  /* NODE_EXTRA_SPAWN_KINDS から n1 の search を外す */
  nosearch: [
    { file: F_INDEX, from: '      t["lost-cargo"] = { n0: ["search", "loot"], n1: ["search"] };',
      to: '      t["lost-cargo"] = (' + HIT('nosearch') + ', { n0: ["search", "loot"] });   /* ★変異nosearch */' }],
  /* n1big (祠) に outdoor: true */
  outdoor: [
    { file: F_INDEX, from: '             sealRing: true,   /* 外周 1 タイルを通行不能に (西の梯子だけが外周に開く) */',
      to: '             sealRing: true, outdoor: (' + HIT('outdoor') + ', true),   /* ★変異outdoor */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた。 */
const NEG_EXPECT = {
  inflictastrap: ['(3a)', '(3d)'],
  inflictafter:  ['(3a)'],
  inflictall:    ['(3c)'],
  typerng:       ['(6a)'],
  /* ⚠ (4b) も赤 = (4b) の ON 腕は「(1a) の条件が真」を含む (依頼書の「ON/OFF で反転」)。verify_kobold_warren の locked と同じ構造 */
  unlockfree:    ['(1a)', '(1c)', '(4b)'],
  /* ⚠ (1g) は緑のまま = 入場の可否は SITES (scenarioOfNode) と questDest で決まり、kind を見ない。札が消えるので (1f) は赤 */
  nosite:        ['(1a)', '(1d)', '(1f)', '(4b)'],
  signclash:     ['(1f)'],
  spawnenter:    ['(1g)'],
  nosearch:      ['(2c)'],
  outdoor:       ['(2d)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = {
  inflictastrap: [], inflictafter: [], inflictall: [], typerng: [], unlockfree: [], nosite: [], signclash: [], spawnenter: [], nosearch: [], outdoor: [],
};
/* 依頼書 §8 の予想 (記録。⛔ 合否には使わない = 担当は実走で決める) */
const NEG_PREDICTED = {
  inflictastrap: ['(3a)', '(3d)'], inflictafter: ['(3a)', '(6a)'], inflictall: ['(3c)'], typerng: ['(6a)'], unlockfree: ['(1c)'],
  nosite: ['(1a)', '(1d)'], signclash: ['(1f)'], spawnenter: ['(1g)'], nosearch: ['(2c)'], outdoor: ['(2d)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 10) vetFail('変異は 10 本まで (ポート 10654〜10663)');
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
const PLACE_RE = new RegExp('id: "' + LC + '",\\r?\\n\\s*place: "([^"]+)"');
const PLACE_OF = (s) => { const m = PLACE_RE.exec(s); return m ? m[1] : null; };
if (!PLACE_OF(PRISTINE[F_TAVERN])) vetFail('tavern.html の配信バイトに id: "' + LC + '" → place: の並びが無い');
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(2a)', '(2b)', '(2c)', '(2d)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(4b)', '(4c)', '(6a)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 1200));
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
const TAV_SNAP = (SITE, ID) => {
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
  const fp = () => ({ sites: JSON.parse(JSON.stringify(W.SITES)), edges: W.EDGES.map((e) => e[0] + '__' + e[1]),
    nodesFP: Object.keys(W.NODES).map((id) => { const n = W.NODES[id]; return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—'); }) });
  return { cls: el ? el.className : null, sign: sg ? sg.textContent.replace(/\s+/g, ' ').trim() : null, title: el ? (el.title || '') : null,
           sites: W ? Object.assign({}, W.SITES) : null, unlock: W ? Object.assign({}, W.UNLOCK) : null,
           node: W ? Object.assign({}, W.NODES[SITE]) : null, from: W ? Object.assign({}, W.NODES[FROM]) : null,
           path: Array.isArray(p) ? p.slice() : p, hero: WD ? WD.heroNode() : null, ask: WD ? WD.askOpen() : null,
           retireFns: W ? [typeof W.retireCargo, typeof W.retireWarren, typeof W.retireTower] : null, fp: W ? fp() : null };
};
/* (1f): 札の矩形と主人公の矩形 (実描画) */
const SIGN_SNAP = (SITE) => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const inter = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const signs = Array.from(document.querySelectorAll('.worldSign')).map((e) => { const n = e.closest('[id^=worldNode_]'); return { id: n ? n.id.replace('worldNode_', '') : '?', rect: R(e) }; });
  const me = signs.find((s) => s.id === SITE) || null;
  const hero = R(document.getElementById('worldHero'));
  const vsOthers = me ? signs.filter((s) => s.id !== SITE).map((s) => ({ id: s.id, a: +inter(me.rect, s.rect).toFixed(1) })).filter((x) => x.a > 0) : null;
  const area = me ? me.rect.w * me.rect.h : 0;
  return { heroNode: window.__world ? window.__world.heroNode() : null, signCount: signs.length, me: me && me.rect,
           vsOthers, hero, heroCover: (me && hero && area > 0) ? inter(me.rect, hero) / area : null };
};
/* index: いまのノードの観測 (n0 / n1 共通)。⚠ page.evaluate へは toString で渡して new Function で戻す */
const NODE_SNAP = (ALT) => {
  const o = {};
  try { o.scen = scenarioId; } catch (e) { o.scen = null; }
  o.nodes = (RUN && RUN.graph) ? RUN.graph.nodes.map((n) => n.id + ':' + n.kind) : null;
  o.cur = currentNodeId;
  o.custom = !!(MAPDEF && MAPDEF.isCustom); o.themeId = MAPDEF ? MAPDEF.themeId : null;
  o.outdoor = window.__outdoorRevealProbe ? window.__outdoorRevealProbe() : null;
  o.paintings = roomPaintings.map((p) => ({ src: p.img && p.img.src ? decodeURIComponent(p.img.src.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]) : null,
    loaded: !!p.loaded, tw: p.tw, th: p.th, nw: p.img ? p.img.naturalWidth : null, nh: p.img ? p.img.naturalHeight : null,
    bakeTile: (p.img && p.tw && p.th && p.img.naturalWidth / p.tw === p.img.naturalHeight / p.th) ? p.img.naturalWidth / p.tw : null }));
  o.traps = window.__lostCargoTV ? window.__lostCargoTV.traps() : traps.map((t) => ({ tx: t.tx, ty: t.ty, type: t.type }));
  o.trapsLen = traps.length;
  o.chests = roomChests.length;
  o.probeLen = Array.isArray(window.__inflictProbe) ? window.__inflictProbe.length : null;
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
/* 罠の語り: traps[] の外の使い捨て (種類 = 本番の trapTypeForNode()) と、湧いた罠 (traps[0]) を踏ませる */
const TRAP_SAY = (withAlly) => {
  const o = {};
  const said = [];
  const _dm = showDMMessage;
  showDMMessage = function (t) { said.push(String(t)); return _dm.apply(this, arguments); };
  o.dmWrapped = (showDMMessage === window.showDMMessage);
  const hp0 = hp, mx0 = maxHp;
  maxHp = Math.max(maxHp, 999); hp = maxHp;
  const t = { tx: -1, ty: -1, type: window.__lostCargoTV.trapTypeForNode(), damageDice: '1d6', found: false, triggered: false, el: null };
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
  o.tt = window.__lostCargoTV.TRAP_TYPES();
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
    await page.goto(base + F_INDEX + (q || '?diag=1'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction("typeof RUN !== 'undefined' && RUN && typeof enterNode === 'function' && typeof spawnTraps === 'function'", { timeout: 90000 });
    ctx.booted++;
  }
  /* world.html を開く (keep = 閉じずに返す) */
  async function openWorld(o) {
    const page = await newPage(o.view || null);
    await prep(page, o.cleared || [], { ss: o.ss || {} });
    await page.goto(base + F_WORLD + (o.q || ''), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction((S) => !!window.WORLD_MAP && !!window.__world && !!document.getElementById('worldNode_' + S), { timeout: 30000 }, LC_SITE);
    await sleep(o.settle || 1200);
    ctx.booted++;
    const snap = await page.evaluate(WORLD_SNAP, LC_SITE, PORT_TOWN);
    if (!o.keep) await page.close().catch(() => {});
    return { page, snap };
  }
  /* §3 の戦闘: 手番の関数を包んで 1 戦闘回す (⭐ enemyAttackTurn は本番を呼ぶ包み・頭と仲間はボスの手番が揃うまで何もしない) */
  async function battle(page, BOSS, CT) {
    await page.evaluate((B, CT) => {
      const S = window.__lcS = { boss: [], other: { turns: 0, added: 0, recs: [] }, killed: false, pba: [] };
      const _e = enemyAttackTurn, _pb = pickBossAction;
      pickBossAction = function (e) { S.pba.push(enemies.indexOf(e)); return _pb.apply(this, arguments); };
      enemyAttackTurn = async function (idx) {
        const e = enemies[idx];
        const isBoss = !!(e && e.type === B);
        const p0 = window.__inflictProbe.length, t0 = traps.length, b0 = S.pba.length, used0 = !!(e && e.__inflictUsed);
        const r = await _e.apply(this, arguments);
        const add = window.__inflictProbe.slice(p0).map((x) => ({ enemyIdx: x.enemyIdx, kind: x.kind, target: x.target, roll: x.roll, total: x.total, ac: x.ac, hit: x.hit, dmg: x.dmg, trapsLen: x.trapsLen }));
        const pba = S.pba.slice(b0).filter((i) => i === idx).length;
        if (isBoss) S.boss.push({ n: S.boss.length + 1, idx, added: add.length, recs: add, trapsBefore: t0, trapsAfter: traps.length, pba, used0, used1: !!e.__inflictUsed });
        else { S.other.turns++; S.other.added += add.length; if (add.length) S.other.recs.push({ idx, type: e && e.type, add }); }
        return r;
      };
      const finish = () => {
        if (S.killed || S.boss.length < CT) return;
        S.killed = true;
        for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e && e.alive && !e.passiveNpc) { e.hp = 0; defeatEnemy(i); } }
      };
      playerAttackTurn = async function () { finish(); };
      allyAttackTurn = async function () { finish(); };
      S.wrapped = { enemy: enemyAttackTurn === window.enemyAttackTurn, player: playerAttackTurn === window.playerAttackTurn, pba: pickBossAction === window.pickBossAction };
      maxHp = Math.max(maxHp, 999); hp = maxHp;
      for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; }
    }, BOSS, CT);
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
    return page.evaluate(async (B, START_MS, END_MS) => {
      const o = {};
      const S = window.__lcS;
      o.trapsAtEntry = traps.length;
      const k = enemies.find((e) => e.alive && !e.inactive && !(e.def && e.def.isBoss));
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
      const bi = enemies.findIndex((e) => e.type === B);
      o.bossIdx = bi; o.bossUsed = bi >= 0 ? !!enemies[bi].__inflictUsed : null;
      o.probeAll = window.__inflictProbe.map((x) => ({ enemyIdx: x.enemyIdx, kind: x.kind, hit: x.hit }));
      o.S = JSON.parse(JSON.stringify(S));
      return o;
    }, BOSS, ENC_START_WAIT_MS, ENC_END_WAIT_MS);
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
      return tp.evaluate(TAV_SNAP, LC_SITE, LC);
    };
    const redraw = async (q) => { await tp.evaluate((BK) => localStorage.removeItem(BK), BOARD_KEY); return openTav(q); };

    await prep(tp, []);
    const on0 = await openTav('');
    const onDraws = [on0.seats];
    for (let i = 1; i < N_1C; i++) onDraws.push((await redraw('')).seats);
    const mainIds = (on0.scen || []).filter((s) => !s.side).map((s) => s.id);
    const MINE = mainIds[0], FOREST = mainIds[1];
    await prep(tp, [MINE]);
    const on1 = await openTav('');
    await prep(tp, [MINE]);
    const off1 = await openTav('?cargo=0');
    await prep(tp, mainIds);
    const c6 = await openTav('');
    await prep(tp, mainIds.concat([WARREN, LC]));
    const c8 = await openTav('');
    await tp.close().catch(() => {});

    /* ══════════ world ══════════ */
    const w0 = (await openWorld({ cleared: [] })).snap;               /* (1c)(1e)(4c) */
    const w1 = (await openWorld({ cleared: [MINE] })).snap;           /* (1a)(1d) */
    const w1off = (await openWorld({ cleared: [MINE], q: '?cargo=0' })).snap;   /* (4b) */
    /* (4c) 撤退 3 段 (本番の関数を呼ぶ。⚠ 閉じる直前のページで) */
    const wr = await openWorld({ cleared: [], keep: true });
    const retired = await wr.page.evaluate(() => {
      const W = window.WORLD_MAP;
      const fp = () => ({ sites: JSON.parse(JSON.stringify(W.SITES)), edges: W.EDGES.map((e) => e[0] + '__' + e[1]),
        nodesFP: Object.keys(W.NODES).map((id) => { const n = W.NODES[id]; return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—'); }) });
      if (typeof W.retireCargo !== 'function' || typeof W.retireWarren !== 'function' || typeof W.retireTower !== 'function') return null;
      const o = { on: fp() };
      W.retireCargo(); o.cargo = fp();
      W.retireWarren(); o.warren = fp();
      W.retireTower(); o.tower = fp();
      return o;
    }).catch(() => null);
    await wr.page.close().catch(() => {});
    /* (1f) 札の重なり: 2 画面 × 主人公が phlan (町を出た直後) / pier (タイトルから) */
    const signRows = [];
    for (const v of SIGN_VIEWS) {
      for (const via of ['town', 'title']) {
        const ss = via === 'town' ? { 'dragonfighters.exitVia': 'town' } : {};
        const w = await openWorld({ cleared: [MINE], ss, view: v, keep: true });
        const m = await w.page.evaluate(SIGN_SNAP, LC_SITE);
        await w.page.close().catch(() => {});
        signRows.push(Object.assign({ view: v.w + 'x' + v.h, via }, m));
      }
    }
    /* (1g) 受注中に桟橋へ湧く → 開かない → 桟橋を押すと開く / 受注なし → 押しても開かない / 町を出て pier へ歩く → 開く */
    const QD = { 'dragonfighters.questDest': LC, 'dragonfighters.currentScenario': LC };
    const G = {};
    {
      const w = await openWorld({ cleared: [MINE], ss: QD, keep: true, settle: 1800 });
      G.spawn = { hero: w.snap.hero, ask: w.snap.ask };
      await w.page.evaluate((S) => window.__world.goToNode(S), LC_SITE);
      await sleep(600);
      G.press = await w.page.evaluate(() => ({ hero: window.__world.heroNode(), ask: window.__world.askOpen() }));
      await w.page.close().catch(() => {});
    }
    {
      const w = await openWorld({ cleared: [MINE], keep: true, settle: 1800 });
      G.noQuest = { hero: w.snap.hero, ask: w.snap.ask };
      await w.page.evaluate((S) => window.__world.goToNode(S), LC_SITE);
      await sleep(600);
      G.noQuestPress = await w.page.evaluate(() => ({ hero: window.__world.heroNode(), ask: window.__world.askOpen() }));
      await w.page.close().catch(() => {});
    }
    {
      const w = await openWorld({ cleared: [MINE], ss: Object.assign({ 'dragonfighters.exitVia': 'town' }, QD), keep: true, settle: 1800 });
      G.town = { hero: w.snap.hero, ask: w.snap.ask };
      const t0 = Date.now();
      let asked = false;
      await w.page.evaluate((S) => window.__world.goToNode(S), LC_SITE);
      while (Date.now() - t0 < 60000) {
        await sleep(500);
        const s = await w.page.evaluate(() => ({ ask: window.__world.askOpen(), hero: window.__world.heroNode(), moving: window.__world.isMoving() }));
        if (s.ask) { asked = true; break; }
        if (!s.moving && s.hero !== LC_SITE) await w.page.evaluate((S) => window.__world.goToNode(S), LC_SITE);
      }
      G.walk = await w.page.evaluate(() => ({ hero: window.__world.heroNode(), ask: window.__world.askOpen(), last: window.__world.lastArrival() }));
      G.walk.asked = asked; G.walk.ms = Date.now() - t0;
      await w.page.close().catch(() => {});
    }

    /* ── §1 / §4b の判定 ── */
    const lcOf = (s) => (s.scen || []).find((x) => x.id === LC) || null;
    const A1 = (s, w) => {
      const t = lcOf(s);
      if (!t || !s.sites || !s.unlock || !w || !w.sites) return { ok: false, why: '倉庫街が scenarios / SITES に無い (scenarios に ' + (t ? '在る' : '無い') + ')' };
      const ids = s.scen.map((x) => x.id).sort().join('|');
      const why = [];
      if (!(t.side === true && t.locked === true && typeof t.unlockAfter === 'string' && t.place === PLACE)) why.push('scenarios の倉庫街 ' + J(t) + ' / 配信バイトの place ' + PLACE);
      if (Object.keys(s.sites).sort().join('|') !== ids) why.push('tavern の SITES の id 集合 ≠ scenarios');
      if (Object.keys(w.sites).sort().join('|') !== ids) why.push('world.html の SITES の id 集合 ≠ scenarios');
      if (s.sites[LC] !== LC_SITE || w.sites[LC] !== LC_SITE) why.push('SITES[倉庫街] ' + s.sites[LC] + '/' + w.sites[LC]);
      for (const x of s.scen) {
        const u = x.locked ? x.unlockAfter : null;
        if ((s.unlock[x.id] || null) !== u) why.push('UNLOCK[' + x.id + ']=' + s.unlock[x.id] + ' ≠ unlockAfter ' + u);
        if ((w.unlock[x.id] || null) !== u) why.push('world.html UNLOCK[' + x.id + ']=' + w.unlock[x.id] + ' ≠ unlockAfter ' + u);
      }
      if (!s.node || s.node.kind !== 'site' || s.node.label !== PLACE || !w.node || w.node.kind !== 'site' || w.node.label !== PLACE) why.push(LC_SITE + ' が拠点「' + PLACE + '」でない ' + J([s.node, w.node]));
      if (!/\bworldNode-site\b/.test(w.cls || '') || !w.sign || w.sign.indexOf(PLACE) < 0) why.push('world.html の DOM の札 ' + J([w.cls, w.sign]));
      return { ok: why.length === 0, why: why.join(' / ') };
    };
    const a1On = A1(on1, w1), a1Off = A1(off1, w1off);
    R.check('(1a)', 'tavern の倉庫街 (配信バイトの id → place「' + PLACE + '」・side・locked・unlockAfter) と同じページの SITES / UNLOCK / NODES.' + LC_SITE + '、world.html の SITES / UNLOCK / DOM の札が一致',
      a1On.ok, a1On);
    R.check('(1b)', 'side・ALL_MAIN_SCENARIOS に無い・本筋 (side でない scenarios) と同じ並び・本筋 6 本 (と +巣穴 +倉庫街) クリアで frontier が null',
      !!lcOf(on0) && lcOf(on0).side === true && Array.isArray(on0.allMain) && on0.allMain.indexOf(LC) < 0 && on0.allMain.join('|') === mainIds.join('|')
        && J(on0.main) === J(mainIds) && mainIds.length === 6 && mainIds.indexOf(LC) < 0
        && !!c6.facts && !!c8.facts && c6.facts.frontier === null && c8.facts.frontier === null,
      { allMain: on0.allMain, main: on0.main, c6: c6.facts && c6.facts.frontier, c8: c8.facts && c8.facts.frontier });
    const pairIs = (s, a, b) => Array.isArray(s) && s.length === 2 && s.indexOf(a) >= 0 && s.indexOf(b) >= 0;
    const wayLook = (w) => !!w && /\bworldNode-way\b/.test(w.cls || '') && w.sign === null && !w.title;
    R.check('(1c)', 'cleared=[] → 卓は「' + MINE + ' + 巣穴」・本筋は ' + MINE + '・' + N_1C + ' 回引き直しても変わらない・world.html の ' + LC_SITE + ' は中継点の見た目 (札・title なし)',
      !!on0.facts && J((on0.facts.unlocked || []).slice().sort()) === J([MINE, WARREN].sort()) && on0.facts.frontier === MINE
        && onDraws.length === N_1C && onDraws.every((d) => pairIs(d, MINE, WARREN)) && wayLook(w0),
      { facts: on0.facts, draws: onDraws, world: { cls: w0.cls, sign: w0.sign, title: w0.title } });
    const D1 = (s, w) => !!s.facts && J((s.facts.unlocked || []).slice().sort()) === J([MINE, FOREST, WARREN, LC].sort())
      && !!w && /\bworldNode-site\b/.test(w.cls || '') && !!w.sign && w.sign.indexOf(PLACE) >= 0;
    R.check('(1d)', 'cleared=[' + MINE + '] → 解放済み 4 件 (' + [MINE, FOREST, WARREN, LC].join('・') + ')・world.html の ' + LC_SITE + ' に札「' + PLACE + '」',
      D1(on1, w1), { facts: on1.facts, world: { cls: w1.cls, sign: w1.sign } });
    /* ⚠ findWalkPath の戻り値は「出発点を含まない」歩く順のノード列 */
    R.check('(1e)', 'world.html で WORLD_MAP.findWalkPath("' + PORT_TOWN + '", "' + LC_SITE + '") が 1 ホップ',
      Array.isArray(w0.path) && J(w0.path) === J([LC_SITE]), { path: w0.path });
    const f1ok = signRows.length === SIGN_VIEWS.length * 2 && signRows.every((r) => !!r.me && Array.isArray(r.vsOthers) && r.vsOthers.length === 0
      && typeof r.heroCover === 'number' && r.heroCover < COVER_MAX && r.heroNode === (r.via === 'town' ? PORT_TOWN : LC_SITE));
    R.check('(1f)', 'cleared=[' + MINE + '] の world.html (1440x900 / 390x844 × 主人公が ' + PORT_TOWN + ' / ' + LC_SITE + ') で倉庫街の札と他の札の交わり 0・主人公が倉庫街の札を覆う割合 < ' + (COVER_MAX * 100) + '%',
      f1ok, signRows.map((r) => ({ view: r.view, via: r.via, at: r.heroNode, signs: r.signCount, others: r.vsOthers, cover: r.heroCover == null ? null : +(r.heroCover * 100).toFixed(1) })));
    R.check('(1g)', '受注中に ' + LC_SITE + ' へ湧くと入場ダイアログは開かない → ' + LC_SITE + ' を押すと開く / 受注なしなら押しても開かない / 町を出て (' + PORT_TOWN + ') ' + LC_SITE + ' へ歩いて着くと開く',
      !!G.spawn && G.spawn.hero === LC_SITE && G.spawn.ask === false && !!G.press && G.press.hero === LC_SITE && G.press.ask === true
        && !!G.noQuest && G.noQuest.hero === LC_SITE && G.noQuest.ask === false && !!G.noQuestPress && G.noQuestPress.ask === false
        && !!G.town && G.town.hero === PORT_TOWN && G.town.ask === false && !!G.walk && G.walk.asked === true && G.walk.hero === LC_SITE,
      G);
    /* (4b) = 配列から消え・pier が中継点・cleared=[廃坑] の解放済み 3 件・(1a)(1d) の条件が ON/OFF で反転 */
    const offOk = !lcOf(off1) && !(off1.sites && off1.sites[LC]) && !!off1.node && off1.node.kind === 'way'
      && !!off1.facts && J((off1.facts.unlocked || []).slice().sort()) === J([MINE, FOREST, WARREN].sort())
      && !!w1off.node && w1off.node.kind === 'way' && wayLook(w1off) && !(w1off.sites && w1off.sites[LC]);
    const onPair = [a1On.ok, D1(on1, w1)], offPair = [a1Off.ok, D1(off1, w1off)];
    R.check('(4b)', '?cargo=0 で tavern の配列から消え・' + LC_SITE + ' が中継点 (tavern と world.html)・cleared=[' + MINE + '] の解放済み 3 件・(1a)(1d) の条件が ON/OFF で反転',
      offOk && onPair.every((x) => x === true) && offPair.every((x) => x === false),
      { offOk, on: onPair, off: offPair, offFacts: off1.facts, worldOff: { cls: w1off.cls, node: w1off.node, sign: w1off.sign } });
    const rs = retired ? { on: sha16(retired.on), cargo: sha16(retired.cargo), warren: sha16(retired.warren), tower: sha16(retired.tower) } : null;
    R.check('(4c)', 'retireCargo() → retireWarren() → retireTower() の各段の地図の sha1 = ' + SHA_AFTER_CARGO + ' / ' + SHA_AFTER_WARREN + ' / ' + SHA_AFTER_TOWER + ' (塔の母より前)・既定の地図はそのどれとも違う',
      !!rs && rs.cargo === SHA_AFTER_CARGO && rs.warren === SHA_AFTER_WARREN && rs.tower === SHA_AFTER_TOWER && [SHA_AFTER_CARGO, SHA_AFTER_WARREN, SHA_AFTER_TOWER].indexOf(rs.on) < 0,
      { sha: rs, sitesOn: retired && Object.keys(retired.on.sites).length, sitesTower: retired && Object.keys(retired.tower.sites).length });

    /* ══════════ index: 開幕の語り (?autoplay=1 のページで #dmBody に実際に出た文) ══════════ */
    const np = await newPage();
    await prep(np, null, idxSeed(LC));
    await np.evaluateOnNewDocument(() => {
      const seen = window.__narrSeen = [];
      const iv = setInterval(() => {
        const b = document.getElementById('dmBody');
        if (!b) return;
        const t = (b.textContent || '').trim();
        if (t && seen[seen.length - 1] !== t) seen.push(t);
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
          header: (document.querySelector('#dmNarration .dmHeader') || {}).textContent || null }), LC).catch(() => NARR);
        if (NARR && NARR.started) break;
        await sleep(500);
      }
    }
    await np.close().catch(() => {});

    /* ══════════ index: n0 ══════════ */
    const ip = await newPage();
    await gotoIndex(ip, LC);
    await ip.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(2500);
    const N0 = await ip.evaluate((SNAP, TS) => {
      const o = (new Function('return (' + SNAP + ')'))()(null);
      const tv = window.__lostCargoTV;
      o.seams = { tvPriest: !!(tv && tv.ENEMY_TYPES && tv.ENEMY_TYPES.plaguePriest && tv.ENEMY_TYPES.plaguePriest.inflictDice),
                  build: typeof window.buildLostCargoRun, inflict: typeof window.inflictWoundsTouch, probe: Array.isArray(window.__inflictProbe) };
      try {
        const run = window.buildLostCargoRun();
        o.ledger = run.nodes.map((n) => ({ id: n.id, kind: n.kind,
          slots: [].concat(...n.mapDef.rooms.map((r) => (r.enemySlots || []).map((s) => s[2]))),
          boss: [].concat(...n.mapDef.rooms.map((r) => r.bossSlot ? [r.bossSlot[2]] : [])) }));
      } catch (e) { o.ledger = 'ERR ' + e.message; }
      o.inflictTypes = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k] && ENEMY_TYPES[k].inflictDice);
      o.say = (new Function('return (' + TS + ')'))()(true);
      o.allies = allies.length;
      return o;
    }, NODE_SNAP.toString(), TRAP_SAY.toString());
    /* (2c) の宝箱は撤退の腕 ?roadchest=0 の起動ノード n0 で数える */
    const ipRC = await newPage();
    await gotoIndex(ipRC, LC, '?diag=1&roadchest=0');
    const N0rc = await ipRC.evaluate(() => ({ cur: currentNodeId, traps: traps.length, chests: roomChests.length }));
    await ipRC.close().catch(() => {});

    /* ══════════ index: n1 ══════════ */
    const N1 = await ip.evaluate(async (SNAP, TS, ALT, PR) => {
      await enterNode('n1', 'right');
      await new Promise((r) => setTimeout(r, 1200));
      const o = (new Function('return (' + SNAP + ')'))()(ALT);
      o.priestIdx = enemies.findIndex((e) => e.type === PR);
      o.say = (new Function('return (' + TS + ')'))()(false);
      /* (3b) inflictWoundsTouch を直接呼ぶ。標的は差し替え (頭 / 仲間)・d20 を固定 */
      const pi = o.priestIdx;
      o.direct = { encBefore: !!(encounterActive || encounterRunning), cases: [] };
      if (pi >= 0) {
        const _pick = pickEnemyTarget, _d20 = d20;
        const hp0 = hp, mx0 = maxHp;
        const atk = enemies[pi].def.inflictAtk || 0;
        const al = allies.find((a) => a.alive && !a.isHero);
        const alIdx = al ? allies.indexOf(al) : -1;
        const one = async (label, who, roll) => {
          maxHp = Math.max(mx0, 999); hp = maxHp;
          if (al) { al.maxHp = Math.max(al.maxHp, 999); al.hp = al.maxHp; }
          pickEnemyTarget = who === 'ally'
            ? function () { return { kind: 'ally', idx: alIdx, zone: 'front', cx: al.x + al.def.displaySize / 2, cy: al.y + al.def.displaySize / 2 }; }
            : function () { return { kind: 'leader', zone: 'front', cx: playerX + 48, cy: playerY + 58 }; };
          d20 = function () { return roll; };
          const n0 = window.__inflictProbe.length, h0 = who === 'ally' ? al.hp : hp;
          try { await inflictWoundsTouch(pi); } finally { pickEnemyTarget = _pick; d20 = _d20; }
          const rec = window.__inflictProbe.slice(n0).map((r) => ({ kind: r.kind, roll: r.roll, total: r.total, ac: r.ac, hit: r.hit, crit: r.crit, dmg: r.dmg, atk: r.atk, idx: r.idx }));
          const h1 = who === 'ally' ? al.hp : hp;
          o.direct.cases.push({ label, who, roll, recs: rec, hpDrop: h0 - h1 });
        };
        const acL = currentPlayerAc(), acA = al ? currentAllyAc(al) : null;
        o.direct.acL = acL; o.direct.acA = acA; o.direct.atk = atk;
        const clampHit = (ac) => Math.max(2, Math.min(19, ac - atk));
        await one('leader-hit', 'leader', clampHit(acL));
        if (acL - atk - 1 >= 2) await one('leader-miss', 'leader', Math.min(19, acL - atk - 1));
        await one('leader-nat1', 'leader', 1);
        await one('leader-crit', 'leader', 20);
        if (al) { await one('ally-hit', 'ally', clampHit(acA)); await one('ally-nat1', 'ally', 1); }
        o.direct.wrappedBack = (pickEnemyTarget === _pick && d20 === _d20);
        o.direct.usedAfter = !!enemies[pi].__inflictUsed;
        hp = hp0; maxHp = mx0;
      }
      o.direct.encAfter = !!(encounterActive || encounterRunning);
      o.direct.probeAfterDirect = window.__inflictProbe.length;
      window.__inflictProbe.length = 0;   /* 直接呼びの記録を消して §3 の戦闘を測る */
      return o;
    }, NODE_SNAP.toString(), TRAP_SAY.toString(), ALTAR, PRIEST);
    const FT = await battle(ip, PRIEST, BOSS_TURNS);
    await ip.close().catch(() => {});

    /* ══════════ (3c) 他のボス: 巣穴の族長 ══════════ */
    const kp = await newPage();
    await gotoIndex(kp, WARREN);
    await kp.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(2000);
    await kp.evaluate(async () => { await enterNode('n1', 'right'); await new Promise((r) => setTimeout(r, 1200)); window.__inflictProbe.length = 0; });
    const FK = await battle(kp, CHIEF, BOSS_TURNS);
    await kp.close().catch(() => {});

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
    const EXIST = (probeBase.keys || []).filter((k) => k !== LC);
    const six = [];
    for (let i = 0; i < EXIST.length; i++) {
      const sid = EXIST[i], seed = 104000 + i * 7919;
      const b = await runSpawn(sid, true, seed);
      const c = await runSpawn(sid, false, seed);
      six.push({ sid, base: b, cur: c });
    }
    await sp.close().catch(() => {});

    /* ── §0 ── */
    const led = Array.isArray(N0.ledger) ? N0.ledger : [];
    const l0 = led.find((n) => n.id === 'n0') || {}, l1 = led.find((n) => n.id === 'n1') || {};
    const n1p = (N1.enemies || []).filter((e) => e.type === PRIEST).length;
    R.check('(0a)', '[装置] __lostCargoTV (司祭の型) / buildLostCargoRun / inflictWoundsTouch が見え、2 ノード (n0 start / n1 boss) の台帳と実体の敵が 0 体でない・n1 のボスは司祭 1',
      N0.seams.tvPriest && N0.seams.build === 'function' && N0.seams.inflict === 'function'
        && N0.scen === LC && J(N0.nodes) === J(['n0:start', 'n1:boss']) && N0.cur === 'n0' && N1.cur === 'n1'
        && led.length === 2 && (l0.slots || []).length >= 1 && (l1.slots || []).length >= 1 && J(l1.boss) === J([PRIEST]) && J(l0.boss) === J([])
        && (N0.enemies || []).length >= 1 && (N1.enemies || []).length >= 2 && n1p === 1 && (N0.enemies || []).every((e) => e.type !== PRIEST) && N0.encActive === false,
      { seams: N0.seams, scen: N0.scen, nodes: N0.nodes, cur: [N0.cur, N1.cur], ledger: N0.ledger, n0: (N0.enemies || []).map((e) => e.type), n1: (N1.enemies || []).map((e) => e.type) });
    R.check('(0b)', '[装置] __inflictProbe が配列で在り、発動前 (n0・n1 の入場直後) は 0 件',
      N0.seams.probe === true && N0.probeLen === 0 && N1.probeLen === 0, { n0: N0.probeLen, n1: N1.probeLen });
    /* ── §2 ── */
    const p0 = (N0.paintings || [])[0] || {}, p1 = (N1.paintings || [])[0] || {};
    const g0 = (p0.src && p0.bakeTile) ? gridCheck(p0.src, p0.bakeTile) : { ok: false, why: 'n0 に絵が無い / 1 マスの画素が縦横で揃わない' };
    const g1 = (p1.src && p1.bakeTile) ? gridCheck(p1.src, p1.bakeTile) : { ok: false, why: 'n1 に絵が無い / 1 マスの画素が縦横で揃わない' };
    R.check('(2a)', '焼き上がり 2 枚 (n0 / n1 に貼られた絵) が make_grid_map.py --check の縦横 3 指標で OK (--tile = 絵の実寸 / マス数)',
      g0.ok && g1.ok && p0.src !== p1.src, { n0: [p0.src, p0.bakeTile, g0], n1: [p1.src, p1.bakeTile, g1] });
    const pi1 = N1.priestIdx;
    const n1PathPriest = (pi1 >= 0 && N1.pathToEnemies) ? N1.pathToEnemies[pi1] : null;
    const altarN = (ALTAR.c2 - ALTAR.c1 + 1) * (ALTAR.r2 - ALTAR.r1 + 1);
    R.check('(2b)', '本番の aStar で n0 入口 → 出口の手前・各敵 / n1 入口 → 司祭・各敵が通る・敵のタイルは全部歩ける・祭壇 ' + altarN + ' マスは全部壁',
      typeof N0.pathToExit === 'number' && N0.pathToExit > 0 && (N0.pathToEnemies || []).length > 0 && N0.pathToEnemies.every((x) => typeof x === 'number')
        && (N1.pathToEnemies || []).length > 0 && N1.pathToEnemies.every((x) => typeof x === 'number') && typeof n1PathPriest === 'number'
        && N0.enemyWall.length === 0 && N1.enemyWall.length === 0
        && !!N1.altar && N1.altar.open.length === 0 && N1.altar.wall === altarN,
      { n0: { from: N0.player, exitInner: N0.exitInner, pathToExit: N0.pathToExit, toEnemies: N0.pathToEnemies, wall: N0.enemyWall },
        n1: { from: N1.player, toEnemies: N1.pathToEnemies, toPriest: n1PathPriest, wall: N1.enemyWall, altar: N1.altar } });
    const TT = N0.say && N0.say.tt || {};
    const pitText = TT[N0_TRAP] && TT[N0_TRAP].dmText, miaText = TT[N1_TRAP] && TT[N1_TRAP].dmText;
    const s0 = N0.say || {}, s1 = N1.say || {};
    R.check('(2c)', '罠が n0 に 1 つ (' + N0_TRAP + ')・n1 に 1 つ (' + N1_TRAP + ')・湧いた罠を踏むと語りが dmText・n0 に宝箱 (?roadchest=0 の腕)',
      (N0.traps || []).length === 1 && N0.traps[0].type === N0_TRAP && (N1.traps || []).length === 1 && N1.traps[0].type === N1_TRAP
        && typeof pitText === 'string' && typeof miaText === 'string' && J(s0.spawned) === J([pitText]) && J(s1.spawned) === J([miaText])
        && N0rc.cur === 'n0' && N0rc.chests > 0,
      { n0: N0.traps, n1: N1.traps, spawnedSay: [s0.spawned, s1.spawned], roadchest0: N0rc });
    const area0 = (p0.tw || 0) * (p0.th || 0), area1 = (p1.tw || 0) * (p1.th || 0);
    const indoor = (N, p, area) => N.custom && N.themeId === LC && !!p.loaded && area > 0 && !!N.outdoor && N.outdoor.rooms === 0 && N.outdoor.exploredNow < area;
    R.check('(2d)', '2 枚とも isCustom (テーマ ' + LC + ')・絵が読み込まれ、屋外の開放 0・探索済み < 絵の範囲 (tw x th) = 霧が効く',
      indoor(N0, p0, area0) && indoor(N1, p1, area1),
      { custom: [N0.custom, N1.custom], theme: [N0.themeId, N1.themeId], p0: { loaded: p0.loaded, tw: p0.tw, th: p0.th }, p1: { loaded: p1.loaded, tw: p1.tw, th: p1.th },
        out0: N0.outdoor && { rooms: N0.outdoor.rooms, explored: N0.outdoor.exploredNow, area: area0 }, out1: N1.outdoor && { rooms: N1.outdoor.rooms, explored: N1.outdoor.exploredNow, area: area1 } });
    /* ── §3 ── */
    const S = FT.S || { boss: [], other: {} };
    const b1 = (S.boss || [])[0] || null;
    const r1 = b1 && b1.recs && b1.recs[0];
    const later = (S.boss || []).slice(1);
    R.check('(3a)', '司祭の最初の手番で __inflictProbe に 1 件 (その手番で pickBossAction は呼ばれない = 行動選択の前)・2 回目以降 (' + (BOSS_TURNS - 1) + ' 回以上) は増えない・__inflictUsed が立つ',
      FT.started && !!b1 && b1.added === 1 && !!r1 && r1.enemyIdx === FT.bossIdx && b1.pba === 0 && b1.used0 === false && b1.used1 === true
        && typeof r1.roll === 'number' && typeof r1.hit === 'boolean' && !!r1.target
        && later.length >= BOSS_TURNS - 1 && later.every((t) => t.added === 0) && FT.bossUsed === true,
      { started: FT.started, startMs: FT.startMs, first: b1, later: later.map((t) => ({ n: t.n, added: t.added, pba: t.pba })), ended: FT.ended, encMs: FT.encMs, wrapped: S.wrapped });
    const Dd = N1.direct || {};
    const cs = Dd.cases || [];
    const caseOk = (c) => {
      const r = (c.recs || [])[0];
      if (!r || c.recs.length !== 1 || r.roll !== c.roll || r.total !== c.roll + Dd.atk) return false;
      const want = c.roll === 20 || (c.roll !== 1 && r.total >= r.ac);
      if (r.hit !== want || r.crit !== (c.roll === 20)) return false;
      if (!r.hit) return r.dmg === 0 && c.hpDrop === 0;
      const lo = r.crit ? 6 : 3, hi = r.crit ? 60 : 30;
      return r.dmg >= lo && r.dmg <= hi && c.hpDrop === r.dmg && (c.who === 'ally' ? r.kind === 'ally' : r.kind === 'leader');
    };
    const hitN = cs.filter((c) => c.recs[0] && c.recs[0].hit && !c.recs[0].crit).length, missN = cs.filter((c) => c.recs[0] && !c.recs[0].hit).length;
    R.check('(3b)', '乱数固定の直接呼び: 命中は total >= ac かつ HP が dmg だけ減る (3〜30)・外れ (1 の出目・AC 未満) は減らない・20 は CRIT (6〜60)・頭と仲間の両方',
      !Dd.encBefore && !Dd.encAfter && Dd.wrappedBack === true && Dd.usedAfter === false && cs.length >= 4 && cs.every(caseOk)
        && hitN >= 2 && missN >= 2 && cs.some((c) => c.who === 'ally') && cs.some((c) => c.label === 'leader-crit' && c.recs[0] && c.recs[0].crit),
      { atk: Dd.atk, acL: Dd.acL, acA: Dd.acA, cases: cs.map((c) => ({ label: c.label, roll: c.roll, rec: c.recs[0], hpDrop: c.hpDrop, ok: caseOk(c) })) });
    const oth = S.other || {}, KS = FK.S || { boss: [], other: {} };
    const kAll = (KS.boss || []).concat([]);
    R.check('(3c)', 'inflictDice を持つ型 = ' + PRIEST + ' だけ / 祠の手下の手番 (1 回以上)・巣穴の族長 (' + BOSS_TURNS + ' 手番) と手下の手番で probe が増えない',
      J(N0.inflictTypes) === J([PRIEST]) && (oth.turns || 0) >= 1 && oth.added === 0 && (FT.probeAll || []).every((x) => x.enemyIdx === FT.bossIdx)
        && FK.started && kAll.length >= BOSS_TURNS && kAll.every((t) => t.added === 0) && (KS.other || {}).added === 0 && (FK.probeAll || []).length === 0,
      { types: N0.inflictTypes, shrineOther: { turns: oth.turns, added: oth.added, recs: (oth.recs || []).slice(0, 3) },
        warren: { started: FK.started, chiefTurns: kAll.map((t) => t.added), otherTurns: (KS.other || {}).turns, otherAdded: (KS.other || {}).added, probe: FK.probeAll } });
    R.check('(3d)', '傷を腐らせる手の手番の前後で traps.length が変わらない (probe の trapsLen とも一致)・戦闘の前後でも同じ',
      FT.started && !!b1 && b1.trapsBefore === b1.trapsAfter && !!r1 && r1.trapsLen === b1.trapsBefore && FT.trapsAtEnd === FT.trapsAtEntry,
      { first: b1 && { before: b1.trapsBefore, after: b1.trapsAfter, probeTrapsLen: r1 && r1.trapsLen }, entry: FT.trapsAtEntry, end: FT.trapsAtEnd });
    /* ── §4 ── */
    const paras = (NARR && NARR.paras) || [];
    const seenAll = paras.length === 4 && paras.every((p) => (NARR.seen || []).some((t) => t.replace(/\s+/g, '') === p.replace(/\s+/g, '')));
    const sixTexts = six.map((x) => ({ sid: x.sid, base: x.base.said, cur: x.cur.said }));
    const existOk = six.length > 0 && six.some((x) => (x.base.said || []).length > 0) && six.every((x) => J(x.base.said) === J(x.cur.said) && (x.cur.said || []).every((t) => t !== miaText));
    R.check('(4a)', '開幕の語り 4 行が #dmBody に出る・n0 の罠 = 落とし穴の語り (頭・仲間)・n1 = 瘴気の語り・第 2 引数が優先・既存 ' + six.length + ' シナリオは ' + BASE_REV + ' と同じ語り',
      !!NARR && NARR.scen === LC && seenAll && s0.dmWrapped === true && typeof pitText === 'string' && /落とし穴/.test(pitText) && typeof miaText === 'string' && /瘴気/.test(miaText)
        && s0.type === N0_TRAP && s1.type === N1_TRAP && J(s0.player) === J([pitText]) && J(s0.ally) === J([pitText]) && J(s0.arg) === J(['引数の語り(検証)'])
        && J(s1.player) === J([miaText]) && J(s1.arg) === J(['引数の語り(検証)']) && existOk,
      { narr: NARR && { scen: NARR.scen, paras: paras.length, seen: (NARR.seen || []).length, header: NARR.header, all: seenAll }, pit: pitText, miasma: miaText,
        n0: { type: s0.type, player: s0.player, ally: s0.ally, arg: s0.arg }, n1: { type: s1.type, player: s1.player, arg: s1.arg }, exist: sixTexts });
    /* ── §6 ── */
    const sixRows = six.map((x) => ({ sid: x.sid, traps: x.cur.traps.length, same: J(x.base.traps) === J(x.cur.traps), calls: [x.base.calls, x.cur.calls], next: x.base.next === x.cur.next,
      types: Array.from(new Set(x.cur.traps.map((t) => t[2]))) }));
    R.check('(6a)', '既存 ' + six.length + ' シナリオ (' + BASE_REV + ' の SCENARIOS) で、同じ種の乱数のもと spawnTraps の罠 (座標・種類)・乱数の呼び出し回数・次の乱数が ' + BASE_REV + ' と同じ',
      six.length === 8 && EXIST.indexOf(LC) < 0 && EXIST.indexOf(WARREN) >= 0 && six.some((x) => x.cur.traps.length > 0)
        && six.every((x) => J(x.base.traps) === J(x.cur.traps) && x.base.calls === x.cur.calls && x.base.next === x.cur.next),
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
  const profile = require('./_pptr_profile')('df_verify_lost_cargo_');
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
