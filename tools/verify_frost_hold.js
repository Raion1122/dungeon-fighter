#!/usr/bin/env node
/*
 * verify_frost_hold.js — 実装依頼書 #107「霜の巨人の砦」の受入ドライバ
 *   (依頼書 実装依頼書/2026-11-04_frost-hold.md §8 = 受入条件の唯一の正。型 = tools/verify_witch_hut.js)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_frost_hold.js                          # 素
 *   node tools/verify_frost_hold.js --negative               # 先に素の基準 → 変異 17 本 (port 10691〜10705 + 10730〜10731)
 *   node tools/verify_frost_hold.js --negative --only rockall,nocooldown
 *   node tools/verify_frost_hold.js --mutate keepsteps       # 変異 1 本を載せて手回し (担当表を実走で決める用)
 *   node tools/verify_frost_hold.js --verbose                # 緑の節の詳細も全部出す
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome / git が無い)・例外
 *      3=装置の腐敗 (変異の注入点の数が違う・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 登録の整合は**ブラウザに載った実体どうし**で突き合わせる (tavern.html の scenarios と同じページの WORLD_MAP、
 *     world.html の WORLD_MAP と DOM)。点・道・札の数は**配信バイトの js/world-map.js を node の vm で読んだ値**と突き合わせる
 *     ((0b)。⛔ 15 / 15 / 13 を写経しない)。撤退後の数 (14 / 14 / 10) は着手前 BASE_REV の js/world-map.js を同じ vm で読んだ値。
 *     ドライバが持つ固定値は依頼書が決めた名前 (id "frost-hold" / 拠点 "frost_peak" / 神殿の拠点 "temple" / 港町 "phlan" /
 *     罠の種類 "avalanche" "iceFloor" / 型 "frostGiant" "winterWolf" / 火のブレスのボス 3 体)・地図の sha1 の固定値 (既に焼かれた値)・
 *     変異 shortcut の行き先 (dragon = 実測で既存の最短経路を 2 組変える)・SRD の数値 (4d10+6 / 4d8 / DC 12) だけ。
 *   - 岩投げ・冷気の息は 3 つの経路で見る:
 *       ① ?diag=1 のページで n1 に入り、敵を inactive にして大広間の語りを待ち、ゲームループを止めて (dialogPaused)
 *         giantRockThrow / coldBreath / enemyAttackTurn を**直接**呼ぶ (d20 と 1d6 だけを呼び出しの間だけ差し替え・隊列は置き直す)。
 *       ② 同じページで本番の runEncounter を回す (頭と仲間の手番は何もしない・HP 999)。巨人の手番 BATTLE_TURNS 回分の
 *         probe の並びを規則 (岩 → 次の手番は冷却 / 届けば投げない) と、冬狼ごとの再充填の状態機械に照らす。
 *       ③ 静的: ENEMY_TYPES の rockDice / breathDice / breathElement を持つ型の集合・火のブレスの関数のソースが BASE_REV と同じ。
 *   - 経路は本番の aStar と WORLD_MAP.findPath / findWalkPath (⛔ 自前の BFS を書かない)。焼き上がりの検算は本番の道具。
 *   - (1d) は git BASE_REV の js/world-map.js を同じ origin で配り (?__base=1)、同じページで今の js/world-map.js と並べて
 *     既存の 14 点の全組 (14 × 13) の findPath / findWalkPath を比べる。
 *   - (6a) は git BASE_REV の index.html を同じ origin で配り (?__base=1)、同じ種の乱数で spawnTraps を 1 回だけ回して比べる。
 *   - 強さ (⑤) は assert にしない (別の道具 r107/item3/probe_frost_clear.js で記録する。依頼書 §12-3 用)。
 *
 * ■ 依頼書 §8 からの言い直し (実装と項目1・2 の実測に合わせた点)
 *   - pageerror 0 は (0c) に分けた ((0a) の「⭐ 空振りで永久緑にしない」は装置・敵の数で縛る)。
 *   - (1b) に「刻み点は 10 のまま (= BASE_REV と同じ数)」を足した (§2-3 の座標 = 刻み点を生やさない)。
 *   - (1e) は受注 = 霜の巨人の砦で港町から frost_peak を押して歩く 1 本 (神殿を踏んでも開かず frost_peak で開く)。
 *   - (2a) ⚠ 大広間 (n1) の縦の --check は項目1 で NG (2px の暗線の同点を測定器が左端で拾う構造的な誤報・依頼書 §12-1 (3)・
 *     ユーザー判断待ち (a)/(b)/(c))。⇒ n0 は --check の縦横、n1 は横を --check・縦は「--check が OK か、独立の物差し
 *     check_grid_alignment.py の縦が OK」で縛る (判断が (b)/(c) で決着して --check が OK になっても緑のまま)。
 *   - (2d) の「霧」= n0 は outdoor (屋外の開放が 1 部屋以上)・n1 は屋内 (屋外の開放 0・探索済み < 絵の範囲 = 暗幕が効く)。
 *   - (3a)(3b) の「届く距離」は項目2 の決定 (tileChebyshev ≤ getRange(def.range).tiles = 1) をそのまま使う。
 *   - (3h) の「ボス 3 体は冷気の息の分岐を通らない」は、今の 3 体は breathElement を持たない (静的) ことに加え、
 *     ①で**巨人の def を一時的に写して breathDice / breathElement "cold" を持たせ**、enemyAttackTurn を直接呼んでも
 *     冷気の息の probe が増えない (= 入口の !def.isBoss が効いている) ことで縛る (変異 breathboss)。
 *   - (3i) は直接呼びの冷気の息の間に tryCounterEnemySpell / counterspellWanted / findCounterspeller が 1 度も呼ばれず、
 *     息が着弾する (反射でもない) こと。
 *   - (6b) を足した: 触らない約束の関数 (依頼書 §11) のソースが BASE_REV と同じ。
 *   - 負のコントロール = 依頼書の 15 本 (ポート 10691〜10705)。
 *   - ★[#110] (6b) は関数ごとの基準 (KEEP_BASE[n] || BASE_REV)。defeatEnemy だけ #108 項目3 の 614270e (markHiddenFoeSlain を 1 行足した)。
 *     (0e) を足した (KEEP_BASE の版の実在と defeatEnemy の markHiddenFoeSlain)。変異 basemove (罠 A: BASE_REV ごと 614270e へ・
 *     配信は印だけでドライバの基準を MUT_BASE で差し替える) / keepdrift (checkDungeonClear に空行 1 行 = blankAfter・行数 +1) を足した
 *     (17 本。16 本目からのポートは --port-ext 既定 10730〜)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] __frostHoldTV (4 型) / buildFrostHoldRun / coldBreath / giantRockThrow / probe 3 本が見え、2 ノード (n0 start / n1 boss)
 *           の台帳と実体の敵が 0 体でない (n0 = オーク・n1 = 巨人 1 + 冬狼 1 = X3。SRD の 2 頭から減らした・依頼書 §12-3 ⑤)
 *      (0b) [装置] 点・道・札の数 = 配信バイトの NODES / EDGES / 拠点の数 (vm) = tavern の WORLD_MAP = world.html の DOM
 *      (0c) [装置] 全ページで pageerror 0 件
 *      (0e) [装置] KEEP_BASE の各版が git show でき、defeatEnemy の版の defeatEnemy が markHiddenFoeSlain を含む (#110)
 *   §1 (1a) NODES.frost_peak が site・EDGES に temple–frost_peak が 1 本で frost_peak の道はそれだけ・SITES / UNLOCK が tavern の scenarios と一致
 *      (1b) world.html の DOM: frost_peak の点・点線 <line> = EDGES.length・data-edge temple__frost_peak・刻み点 = BASE_REV の数
 *      (1c) 神殿のクリア前は札が出ない / クリア後に出る (isRevealed)・開始直後と神殿の前の卓は ?giant=0 と同じ
 *      (1d) ⭐ 経路の非退行 (BASE_REV と既存 14 点の全組)・findWalkPath("phlan","frost_peak") は temple を通って着く
 *      (1e) 押して歩くと神殿を通っても開かず frost_peak で開く
 *      (1f) 本筋 6 本クリアで frontier が null・frost-hold は side として解放済み
 *   §2 (2a) 焼き上がり 2 枚の検算 (上の言い直し) / (2b) 本番の aStar で入口 → 出口・各敵 (巨人の体のタイルも歩ける)
 *      (2c) 罠 n0 = 1 (avalanche)・n1 = 1 (iceFloor)・踏むと語りが dmText / (2d) 霧 (上の言い直し)
 *   §3 (3a) 岩: いちばん遠い隊員・命中の式 (d20+9 vs AC・1 はファンブル・20 は確認)・4d10+6 (10〜46)・クリティカルは critMult 倍
 *      (3b) 届けば投げない・投げたら rockCooldown = 1・戦闘で「岩 → 次の手番は冷却」
 *      (3c) rockDice を持つ型 = frostGiant だけ・冬狼の手番で岩の probe が増えない
 *      (3d) 冷気の完全耐性 (resolveElementDefense で 0・炎は通る)
 *      (3e) 息: DC 12・4d8 (4〜32)・セーヴ成功で半減 (切り捨て・最低 1)・3x3 の中の全員に・HP がその分減る
 *      (3f) Recharge 5-6 (直接 6 手番の筋書き + 戦闘の状態機械)
 *      (3g) 3x3 が空なら吐かない (噛む・再充填は使わない)
 *      (3h) ⭐ 火のブレスの非退行 (ソース・ボス 3 体・写したボスの def でも冷気の分岐を通らない)
 *      (3i) カウンタースペルに掛からない
 *   §4 (4a) 開幕の語り 4 行 (#dmBody)・大広間の語り 1 回 (赤い竜)・既存シナリオの罠の語りは BASE_REV と同じ
 *      (4b) ?giant=0 (tavern / world.html の DOM・数は BASE_REV と同じ・刻み点に frost_peak が無い)
 *      (4c) 撤退 6 段の地図の sha1 (既定 + 6 段 = 7 値)
 *   §6 (6a) 既存シナリオの spawnTraps (座標・種類・乱数の呼び出し回数・次の乱数) が BASE_REV と同じ
 *      (6b) 触らない約束の関数のソースがそれぞれの基準の版 (KEEP_BASE[n] || BASE_REV) と同じ (#110)
 *   ⛔ 測らないこと (依頼書 §8): 巨人・冬狼の HP / 攻撃の値の良し悪し・岩の弾の見た目の細部。⑤ 強さは記録のみ。
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html / tavern.html / world.html / js/df-mapdef.js / js/world-map.js は**起動時に 1 回だけ
 *     readFileSync して凍結**し、変異はその文字列をメモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。
 *     他のファイルは都度ディスクから配る。favicon.ico は 204。index.html / js/world-map.js は ?__base=1 で BASE_REV のバイト。
 *   - 起動時に全変異のアンカーを**原本**で検算する (配信 5 ファイル合算で n 件 (既定 1)・注入文字列が原本に無い・行数不変)。
 *     崩れたら素でも exit 3。罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持つ (load で走る行に置いた印も含む)。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」+ 注入行の実行 > 0。
 *     担当は**実走で決めた** (--mutate で 1 本ずつ)。依頼書の予想 (NEG_PREDICTED) は記録として並べるだけ。
 *   - 酒場を開く種まきに plazaClock = 21 を入れる (CLAUDE.md #102)。world.html の歩きは ?roadevent=0&ambush=0。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10690** (素) / 変異 **10691〜10705** (15 本・MUTATIONS の並び順) + #110 の 2 本 **10730〜10731** (--port-ext)。
 *   (10706〜 = verify_clear_chests・10720〜 = verify_world_autowalk)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const VERBOSE = flag('verbose');   // 緑の節も詳細を全部出す (記録用)
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10690'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前 (データ。期待値の写しではない) */
const FH = 'frost-hold';
const FH_SITE = 'frost_peak';
const PORT_TOWN = 'phlan';
const TEMPLE_SITE = 'temple';
const GIANT = 'frostGiant', WOLF = 'winterWolf';
const ORCS = ['orcGrunt', 'orcArcher'];
const HOLD_TYPES = ORCS.concat([WOLF, GIANT]);   // 霜の巨人の砦の台帳に載ってよい鍵 (依頼書 §4)
const FIRE_BOSSES = ['chimera', 'hydra', 'pharaxus'];   // 依頼書 §2-5: breathDice を持つ既存の 3 体 (全部ボス・炎)
/* ★[#111 2026-11-07] ボスでない息持ち = 冬狼 (cold) + コボルドの巣穴の隠し要素の若い赤竜 (SRD red-dragon-wyrmling.md の Fire Breath = fire)。キー順に並べる。 */
const NONBOSS_BREATH = ['redDragonWyrmling:fire', WOLF + ':cold'];
const N0_TRAP = 'avalanche', N1_TRAP = 'iceFloor';
const ROCK = { n: 4, sides: 10, bonus: 6 }, BREATH = { n: 4, sides: 8, dc: 12 };   // SRD (依頼書 §2-8)
/* ⚠ 巨人の近接と冬狼の頭数は SRD からユーザー判断で弱めた (2026-11-05・依頼書 §12-3「⑤ 強さの見直し」の X3)。
 *   SRD = 大斧 2 回・HP 138・3d12+6・×3・冬狼 2 頭 → X3 = 1 回・104・2d12+6・×2・冬狼 1 頭。
 *   critMult は岩のクリティカルの倍数にも使われる (giantRockThrow の times = def.critMult)。AC 15・+9・岩・息は SRD のまま。 */
const GIANT_X3 = { hp: 104, dmgDice: '2d12', dmgBonus: 6, critMult: 2, attacksPerTurn: 1, ac: 15 };
const HALL_WOLVES = 1;
const SHORTCUT_TO = 'dragon';        // 変異 shortcut の 2 本目の道の先 (vm の実測で既存の最短経路を 2 組変える)
const BASE_REV = '0298eca';          // #107 の着手前 (素材の受け取り。index / tavern / world / js は 241c718 と差 0)
/* ★[#110] 意図して変えた関数は、その変更を入れたコミットを基準にする。
   ⭐ 足すときは「どのチケットのどのコミットで何を足したか」を必ず書く。
   ⛔ BASE_REV を丸ごと動かさない (罠 A: (6a)(1b)(1d)(4b)(0b) などの基準でもある。変異 basemove で装置に内蔵)。
   ⛔ (6b) から関数を外して通さない (番人が 1 人減る)。 */
const KEEP_BASE = { defeatEnemy: '614270e' };   // #108 項目3: markHiddenFoeSlain を 1 行足した
const BASE_MOVE_REV = '614270e';     // 変異 basemove (罠 A) で BASE_REV の代わりに使う版
/* (4c) 撤退の各段の地図の sha1 (先頭 16)。
 *   既定 = 項目2 (0fe80e2) の後の既定の地図 (依頼書 §12-2 (3) の実測)。1 段目 (retireGiant 後) = 241c718 (#106 完了) の既定。
 *   2〜6 段目 = verify_witch_hut (4c) の固定値。 */
const SHA_ON = '644bf9dac129dffb';
const SHA_AFTER_GIANT = '63f3bce7696bf14a';
const SHA_AFTER_HAG = '3dd5550782057025';
const SHA_AFTER_TOMB = '44b1de14f8b2c9d0';
const SHA_AFTER_CARGO = '3918d569e7f3f7db';
const SHA_AFTER_WARREN = '647e71f6b2956389';
const SHA_AFTER_TOWER = '876c5f6336f96811';
const CLEARED_KEY = 'dragonfighters.cleared';
const VIEW = { width: 1280, height: 800 };
const BATTLE_TURNS = 4;              // ② 戦闘で巨人の手番を何回見るか
const ENC_START_WAIT_MS = 90000;
const ENC_END_WAIT_MS = 180000;
const WALK_MS = 300000;              // (1e) 歩きの上限
const WORLD_Q = '?roadevent=0&ambush=0';
const PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガルド', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ',   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'rear',  name: 'ミラ',   trait: null, line: null },
];
/* 触らない約束の関数 (依頼書 §11 + 写し元)。(6b) */
const KEEP_FNS = ['pickBossAction', 'tryReflectEnemySpell', 'tryCounterEnemySpell', 'counterspellWanted', 'resolveElementDefense',
  'hagMistPassage', 'checkDungeonClear', 'defeatEnemy', 'runEncounter', 'checkTrapTrigger'];
const FIRE_FNS = ['hydraFireBreath', 'applyFireBreathToAlly'];   // (3h)

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html', F_TAVERN = 'tavern.html', F_WORLD = 'world.html', F_MAPDEF = 'js/df-mapdef.js', F_WMAP = 'js/world-map.js';
const SERVED = [F_INDEX, F_TAVERN, F_WORLD, F_MAPDEF, F_WMAP];
const PRISTINE = {};
for (const f of SERVED) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
/* git show は版 × ファイルごとに 1 回だけ (キャッシュ)。失敗は null (KEEP_BASE の版は (0e) で赤にする) */
const _gitCache = {};
const gitShowAt = (rev, f) => {
  const ck = rev + ':' + f;
  if (Object.prototype.hasOwnProperty.call(_gitCache, ck)) return _gitCache[ck];
  let s = null;
  try { s = execFileSync('git', ['-C', ROOT, 'show', ck], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { s = null; }
  return (_gitCache[ck] = s);
};
const gitShow = (f) => {
  const s = gitShowAt(BASE_REV, f);
  if (s === null) { console.error('[vet] git show ' + BASE_REV + ':' + f + ' に失敗'); process.exit(2); }
  return s;
};
const BASE_INDEX = gitShow(F_INDEX);
const BASE_WMAP = gitShow(F_WMAP);
if (BASE_INDEX.indexOf('giantRockThrow') >= 0 || BASE_WMAP.indexOf('frost_peak') >= 0) vetFail('BASE_REV ' + BASE_REV + ' に霜の巨人の砦が在る (着手前でない)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 15 本)。逐語は HEAD 5cfdf10 (項目2 の後) の行で取った。
 * ⚠ どれも 1 行 → 1 行 (行数不変)。n = 原本に出る回数 (既定 1)。⚠ 他ドライバのアンカーと重ならない行を選んだ (罠E・起動時に検査)。
 * ⚠ 注入行が実行されない場所 (撤退の器・火のブレス) には、load で必ず走る行へ印だけの 2 本目を足した。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const A_PEAK = '    , frost_peak: { kind: "site", x: 1280, y: 288, label: "霜の峠", desc: "地下神殿の谷の奥。雪の峠に霜の巨人の氷の砦", signDx: -112 }';
const A_EDGE = '    , ["temple", "frost_peak"]';
const A_SEAM = '    window.coldBreath = coldBreath;';
const MUTATIONS = {
  /* ⭐ 座標を会議の予備案 (1312,224) へ (刻み点が 1 個生える) + 撤退で STEPS を消さない (依頼書 §2-2) */
  keepsteps: [
    { file: F_WMAP, from: A_PEAK, to: A_PEAK.replace('x: 1280, y: 288', 'x: 1312, y: 224') + '   /* ★変異keepsteps */' },
    { file: F_WMAP, from: '      if (Object.prototype.hasOwnProperty.call(STEPS, k) && STEPS[k].on.indexOf("frost_peak") >= 0) delete STEPS[k];',
      to: '      if (Object.prototype.hasOwnProperty.call(STEPS, k) && STEPS[k].on.indexOf("frost_peak") >= 0) ' + HIT('keepsteps') + ';   /* ★変異keepsteps */' }],
  /* 撤退で EDGES を消さない */
  keepedge: [
    { file: F_WMAP, from: '      if (EDGES[i][0] === "frost_peak" || EDGES[i][1] === "frost_peak") EDGES.splice(i, 1);',
      to: '      if (EDGES[i][0] === "frost_peak" || EDGES[i][1] === "frost_peak") ' + HIT('keepedge') + ';   /* ★変異keepedge */' }],
  /* 道を足さない (点だけ) */
  noedge: [
    { file: F_WMAP, from: A_EDGE, to: '    /* ★変異noedge (道を足さない) */' },
    { file: F_WMAP, from: A_PEAK, to: A_PEAK.replace('frost_peak: {', 'frost_peak: (' + HIT('noedge') + ', {').replace(/ \}$/, ' })') + '   /* ★変異noedge */' }],
  /* 依頼を locked: false にする (後に書いたキーが勝つ) */
  unlockfree: [
    { file: F_TAVERN, from: '      unlockAfter: "undead-temple",   /* ★[#107] 神殿のクリア後 (js/world-map.js の UNLOCK と同じ) */',
      to: '      unlockAfter: "undead-temple", locked: (' + HIT('unlockfree') + ', false),   /* ★変異unlockfree */' }],
  /* 届く距離に隊員が居ても投げる */
  rockall: [
    { file: F_INDEX, from: '      if (R.inReach.length > 0) {',
      to: '      if (R.inReach.length > 0 && (' + HIT('rockall') + ', false)) {   /* ★変異rockall */' }],
  /* いちばん近い隊員を狙う */
  rocknear: [
    { file: F_INDEX, from: '      for (const c of R.all) if (!tgt || c.dist > tgt.dist) tgt = c;',
      to: '      for (const c of R.all) if (!tgt || c.dist < tgt.dist) tgt = c; ' + HIT('rocknear') + ';   /* ★変異rocknear */' }],
  /* 投げても冷却を立てない */
  nocooldown: [
    { file: F_INDEX, from: '      enemy.rockCooldown = 1;                               // 次の手番は前へ出る',
      to: '      ' + HIT('nocooldown') + ';   /* ★変異nocooldown (rockCooldown を立てない) */' }],
  /* 冬狼の breathDice を外す */
  nobreath: [
    { file: F_INDEX, from: '        breathDice: "4d8", breathDC: 12, breathBlast: 3, breathElement: "cold",   /* ★[#107] 冷気の息 (coldBreath)。⛔ 冬狼以外に付けない */',
      to: '        breathDC: 12, breathBlast: 3, breathElement: (' + HIT('nobreath') + ', "cold"),   /* ★変異nobreath */' }],
  /* 吐いても使用済みにしない (再充填の d6 を見ずに毎手番吐く) */
  alwaysbreath: [
    { file: F_INDEX, from: '      enemy.__coldBreathSpent = true;                       // Recharge 5-6 (次の手番の頭から d6 で戻す)',
      to: '      ' + HIT('alwaysbreath') + ';   /* ★変異alwaysbreath (使用済みにしない) */' }],
  /* セーヴ成功でも半減しない (仲間と頭の 2 行) */
  breathfull: [
    { file: F_INDEX, n: 2, from: '        if (saved) { dmg = Math.max(1, Math.floor(dmg / 2)); rec.savedCount++; }',
      to: '        if (saved) { ' + HIT('breathfull') + '; rec.savedCount++; }   /* ★変異breathfull */' }],
  /* 入口の !def.isBoss を外す (ボスが冷気の息の分岐へ入る) */
  breathboss: [
    { file: F_INDEX, from: '      if (!def.isBoss && def.breathDice && def.breathElement === "cold") {',
      to: '      if ((def.isBoss && def.breathDice && def.breathElement === "cold" && ' + HIT('breathboss') + ', def.breathDice && def.breathElement === "cold")) {   /* ★変異breathboss */' }],
  /* hydraFireBreath の文言を 1 字変える (+ load で走る行に印) */
  firebreathedit: [
    { file: F_INDEX, from: '      showBanner("🔥 火炎のブレス 🔥", 1600);', to: '      showBanner("🔥 火焔のブレス 🔥", 1600);' },
    { file: F_INDEX, from: A_SEAM, to: A_SEAM + ' ' + HIT('firebreathedit') + ';   /* ★変異firebreathedit */' }],
  /* 霜の巨人の冷気の完全耐性を外す */
  nocoldimmune: [
    { file: F_INDEX, from: '      frostGiant:     { immune: ["cold"] },                                      // ★[#107] Frost Giant (SRD の Damage Immunities)',
      to: '      frostGiant:     (' + HIT('nocoldimmune') + ', {}),   /* ★変異nocoldimmune */' }],
  /* ?giant=0 を読まない (tavern / world.html) */
  noretire: [
    { file: F_TAVERN, from: '    try { off = new URLSearchParams(location.search).get("giant") === "0"; } catch (e) { off = false; }',
      to: '    off = false; ' + HIT('noretire') + ';   /* ★変異noretire */' },
    { file: F_WORLD, from: '      if (new URLSearchParams(location.search).get("giant") === "0" && window.WORLD_MAP && window.WORLD_MAP.retireGiant) window.WORLD_MAP.retireGiant();',
      to: '      ' + HIT('noretire') + ';   /* ★変異noretire */' }],
  /* frost_peak に 2 本目の道 (袋小路でなくなる = 既存の点どうしの最短経路が変わる) */
  shortcut: [
    { file: F_WMAP, from: A_EDGE, to: A_EDGE + ', (' + HIT('shortcut') + ', ["frost_peak", "' + SHORTCUT_TO + '"])   /* ★変異shortcut */' }],
  /* ★[#110] 罠 A: KEEP_BASE を使わず BASE_REV ごと BASE_MOVE_REV へ動かす (配信は印だけ。基準の差し替えは baseSetOf が担う) */
  basemove: [
    { file: F_INDEX, from: A_SEAM, to: A_SEAM + ' ' + HIT('basemove') + ';   /* ★変異basemove (基準を ' + BASE_MOVE_REV + ' へ) */' }],
  /* ★[#110] defeatEnemy 以外の触らない約束の関数に空行を 1 行足す (blankAfter = アンカー行の直後へ空行。行数 +1) */
  keepdrift: [
    { file: F_INDEX, from: '    function checkDungeonClear() {', blankAfter: true },
    { file: F_INDEX, from: A_SEAM, to: A_SEAM + ' ' + HIT('keepdrift') + ';   /* ★変異keepdrift */' }],
};
/* 変異 → 基準の差し替え (本番ファイルではなくドライバ自身の基準を動かす変異)。⛔ ここに無い変異は BASE_REV + KEEP_BASE */
const MUT_BASE = { basemove: { rev: BASE_MOVE_REV, keepBase: {} } };
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で 1 本ずつ実走し、実際に赤くなった集合で決めた
 *   (項目3・2026-11-04 = r107/item3/mut/*.log。4 本ずつ並走 + ⑤ の 2 本と同時に走らせた負荷の下)。予想との差の理由:
 *   - keepsteps: 座標を予備案へずらすと刻み点が 1 個生える ⇒ 刻み点の数 (1b)・findWalkPath の最後の 2 手 (1d)・既定の地図の sha1 (4c) も赤。
 *   - keepedge: 撤退後も道が残る ⇒ (4b) に加えて撤退の段の sha1 (4c)。
 *   - noedge: 点だけで道が無い ⇒ 数の突き合わせ (0b)・点線 (1b)・frost_peak へ着かない (1d)(1e)・sha1 (4c)。
 *   - unlockfree: 配信バイトの locked と UNLOCK の食い違い (1a)・神殿の前でも卓に出る (1c)。
 *   - nobreath: 冬狼が冷気の分岐へ入らない (3f)・型の値 (3e)・冷気の息の持ち主の集合 (3h)。⚠ coldBreath の直接呼びは
 *     def.breathDice が無くても "4d8" で吐く (既定値の作り) ので、(3e) は型の値の静的な照合で捕まえる。
 *   - alwaysbreath: 吐いても使用済みにならない ⇒ 直接呼びの spentAfter (3e) と 6 手番の筋書き (3f)。
 *   - noretire: ?giant=0 の卓が ON と同じ ⇒ 「ON = OFF + 1」の (1c) と (4b)。
 *   - shortcut: 2 本目の道 ⇒ 袋小路でない (1a)・道の数 (0b)・点線 (1b)・経路 (1d)・sha1 (4c)。 */
const NEG_EXPECT = {
  keepsteps:      ['(1b)', '(1d)', '(4b)', '(4c)'],
  keepedge:       ['(4b)', '(4c)'],
  noedge:         ['(0b)', '(1a)', '(1b)', '(1d)', '(1e)', '(4c)'],
  unlockfree:     ['(1a)', '(1c)'],
  rockall:        ['(3b)'],
  rocknear:       ['(3a)'],
  nocooldown:     ['(3b)'],
  nobreath:       ['(3e)', '(3f)', '(3h)'],
  alwaysbreath:   ['(3e)', '(3f)'],
  breathfull:     ['(3e)'],
  breathboss:     ['(3h)'],
  firebreathedit: ['(3h)'],
  nocoldimmune:   ['(3d)'],
  noretire:       ['(1c)', '(4b)'],
  shortcut:       ['(0b)', '(1a)', '(1b)', '(1d)', '(4c)'],
  /* ★[#110] 実走 (--mutate basemove・2026-11-07): 赤 = (0b)(4b) だけ。点と道の数の基準が 15/15 になり「BASE より 1 つ多い」(0b) と
     「撤退で BASE の数へ戻る」(4b) が崩れる。⚠ (6a)(1d)(1b)(3h)(6b) は緑のまま = 意味だけ変わる (例: (1d) は frost_peak まで
     「既存の点」に吸い込んで素通り)。⚠ 起動時の番人 (BASE_REV に giantRockThrow / frost_peak が在れば exit 3) も罠 A を捕まえる。 */
  basemove:       ['(0b)', '(4b)'],
  keepdrift:      ['(6b)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = {
  keepsteps: [], keepedge: [], noedge: [], unlockfree: [], rockall: [], rocknear: [], nocooldown: [], nobreath: [], alwaysbreath: [],
  breathfull: [], breathboss: [], firebreathedit: [], nocoldimmune: [], noretire: [], shortcut: [], basemove: [], keepdrift: [],
};
/* 依頼書 §8 の予想 (記録。⛔ 合否には使わない = 担当は実走で決める) */
const NEG_PREDICTED = {
  keepsteps: ['(4b)'], keepedge: ['(4b)'], noedge: ['(1a)', '(1b)'], unlockfree: ['(1c)'], rockall: ['(3b)'], rocknear: ['(3a)'],
  nocooldown: ['(3b)'], nobreath: ['(3e)'], alwaysbreath: ['(3f)'], breathfull: ['(3e)'], breathboss: ['(3h)'], firebreathedit: ['(3h)'],
  nocoldimmune: ['(3d)'], noretire: ['(4b)'], shortcut: ['(1d)'],
  basemove: ['(6a)'], keepdrift: ['(6b)'],   // #110 依頼書 §8 (basemove は「(6a) など他の節」)
};
const MUT_ORDER = Object.keys(MUTATIONS);
/* ポート: 先頭 15 本 = PORT+1〜PORT+15 (10691〜10705)。16 本目から = PORT_EXT〜 (10706〜 は verify_clear_chests・10720〜 は
   verify_world_autowalk の割当なので、#110 で足した 2 本は 10730〜10731) */
const PORT_EXT = parseInt(arg('port-ext', '10730'), 10);
const mutPort = (key) => { const i = MUT_ORDER.indexOf(key); return i < 15 ? PORT + 1 + i : PORT_EXT + (i - 15); };
if (MUT_ORDER.length > 17) vetFail('変異は 17 本まで (ポート 10691〜10705 + 10730〜10731)');
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
  let dLines = 0;   // blankAfter の本数 (= 足す空行の数)。他の変異は行数不変
  for (const e of MUTATIONS[key]) {
    if (e.file !== file) continue;
    const want = e.n || 1;
    const tot = SERVED.reduce((n, f) => n + countOf(PRISTINE[f], e.from), 0);
    const c = countOf(PRISTINE[file], e.from);
    if (c !== want || tot !== want) vetFail('変異 ' + key + ' の注入点が ' + want + ' 箇所ではない (' + file + ' に ' + c + ' 件・配信 5 ファイル合算 ' + tot + ' 件): ' + e.from.slice(0, 160));
    if (e.blankAfter) {
      /* ★[#110] アンカー行 (行全体) の直後へ空行を 1 行。改行コードは原本のその行に合わせる */
      const m = new RegExp('(^|\\n)' + e.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\r?\\n)').exec(PRISTINE[file]);
      if (!m) vetFail('変異 ' + key + ' の blankAfter のアンカーが行全体で見つからない');
      if (/[\r\n]/.test(e.from)) vetFail('変異 ' + key + ' が改行を含む');
      const eol = m[2];
      s = s.split(e.from + eol).join(e.from + eol + eol);
      dLines += want;
      continue;
    }
    if (countOf(PRISTINE[file], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    if (/[\r\n]/.test(e.from + e.to)) vetFail('変異 ' + key + ' が改行を含む');
    s = s.split(e.from).join(e.to);
  }
  if (s.split('\n').length !== PRISTINE[file].split('\n').length + dLines) vetFail('変異 ' + key + ' が ' + file + ' の行数を変えた (想定 +' + dLines + ')');
  _mutCache[ck] = s;
  return s;
}
for (const k of MUT_ORDER) {
  if (!MUTATIONS[k].some((e) => (e.to || '').indexOf('__MUTHIT__' + k) >= 0)) vetFail('変異 ' + k + ' に実行の印が無い');
  if (SERVED.every((f) => servedFile(f, k) === PRISTINE[f])) vetFail('変異 ' + k + ' が何も変えていない');
}
/* (1a) の材料: 配信バイトの「id → place」の並び (⚠ 本番のコメントが「id の直後に置く」と約束している) */
const PLACE_RE = new RegExp('id: "' + FH + '",\\r?\\n\\s*place: "([^"]+)"');
const PLACE_OF = (s) => { const m = PLACE_RE.exec(s); return m ? m[1] : null; };
if (!PLACE_OF(PRISTINE[F_TAVERN])) vetFail('tavern.html の配信バイトに id: "' + FH + '" → place: の並びが無い');
/* (0b)(4b) の材料: 配信バイトの js/world-map.js を vm で読む (⛔ 期待の数を写経しない) */
function wmapCounts(src) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src.replace(/console\.log\("__MUTHIT__[a-z]+"\)/g, '0'), ctx);
  const W = ctx.window.WORLD_MAP;
  if (!W) return null;
  return { nodes: Object.keys(W.NODES).length, edges: W.EDGES.length, steps: Object.keys(W.STEPS).length,
    sites: Object.keys(W.NODES).filter((k) => W.NODES[k].kind === 'site').length, ids: Object.keys(W.NODES) };
}
const BASE_COUNTS = wmapCounts(BASE_WMAP);
if (!BASE_COUNTS || BASE_COUNTS.ids.indexOf(FH_SITE) >= 0) vetFail('BASE_REV の js/world-map.js を vm で読めない / frost_peak が在る');

/* (6b)(3h) 関数のソース (宣言の頭から中括弧の対応で切り出す。BASE と現在で同じ切り出し方 = 比べる限り公平) */
function fnSource(src, name) {
  const re = new RegExp('\\n[ \\t]*(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  const bm = /\)\s*\{[ \t]*\r?\n/.exec(src.slice(m.index));
  if (!bm) return null;
  const i = m.index + bm.index + bm[0].indexOf('{');
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(m.index, k + 1).replace(/\r\n/g, '\n'); }
  }
  return null;
}
/* ★[#110] 基準の組 (変異ごと)。素と普通の変異 = BASE_REV + 関数ごとの KEEP_BASE。basemove (MUT_BASE) = 別の版へ丸ごと。
   ⚠ 起動時の「BASE_REV に霜の巨人が在れば止める」番人は BASE_REV だけに掛かる (basemove は節の赤を実測するためここで止めない) */
const _baseSets = {};
function baseSetOf(mutKey) {
  const mb = (mutKey && MUT_BASE[mutKey]) || null;
  const ck = mb ? mutKey : '';
  if (_baseSets[ck]) return _baseSets[ck];
  const rev = mb ? mb.rev : BASE_REV;
  const keepBase = mb ? mb.keepBase : KEEP_BASE;
  const index = rev === BASE_REV ? BASE_INDEX : gitShowAt(rev, F_INDEX);
  const wmap = rev === BASE_REV ? BASE_WMAP : gitShowAt(rev, F_WMAP);
  if (index === null || wmap === null) vetFail('基準の版 ' + rev + ' を git show できない');
  const counts = rev === BASE_REV ? BASE_COUNTS : wmapCounts(wmap);
  if (!counts) vetFail('基準の版 ' + rev + ' の js/world-map.js を vm で読めない');
  const keepRev = (n) => keepBase[n] || rev;
  const keepIndex = (n) => { const r = keepRev(n); return r === rev ? index : gitShowAt(r, F_INDEX); };
  return (_baseSets[ck] = { rev, index, wmap, counts, keepBase, keepRev, keepIndex });
}
/* (0e) KEEP_BASE の各版が実在し (git show 成功)、その版から関数を切り出せ、defeatEnemy の版は markHiddenFoeSlain を含む */
function keepBaseFacts() {
  return Object.keys(KEEP_BASE).map((n) => {
    const s = gitShowAt(KEEP_BASE[n], F_INDEX), f = s === null ? null : fnSource(s, n);
    return { n, rev: KEEP_BASE[n], shown: s !== null, inKeep: KEEP_FNS.indexOf(n) >= 0, len: f ? f.length : null, mark: !!f && f.indexOf('markHiddenFoeSlain') >= 0 };
  });
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で所定の数 (配信 5 ファイル合算)・行数不変・他ドライバとアンカーの重なり 0'
  + ' / 基準 = git ' + BASE_REV + ' (index.html ' + BASE_INDEX.length + ' 文字・js/world-map.js 点 ' + BASE_COUNTS.nodes + ' 道 ' + BASE_COUNTS.edges + ' 刻み点 ' + BASE_COUNTS.steps + ')'
  + ' / 関数ごとの基準 KEEP_BASE = ' + J(KEEP_BASE)
  + ' / 配信バイトの place = "' + PLACE_OF(PRISTINE[F_TAVERN]) + '"');

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
  const BS = baseSetOf(mutKey);   // ★[#110] basemove だけ別の版
  const baseBuf = { [F_INDEX]: Buffer.from(BS.index, 'utf8'), [F_WMAP]: Buffer.from(BS.wmap, 'utf8') };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const q = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?')) : '';
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === 'favicon.ico') { res.statusCode = 204; res.end(); return; }
        if (baseBuf[rel] && /[?&]__base=1(&|$)/.test(q)) { res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()]); res.end(baseBuf[rel]); return; }
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0e)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(2a)', '(2b)', '(2c)', '(2d)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(3f)', '(3g)', '(3h)', '(3i)', '(4a)', '(4b)', '(4c)', '(6a)', '(6b)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok && !VERBOSE ? 300 : 6000));
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

/* 焼き上がりの検算 (本番の道具 2 つ)。tile は焼き上がりの 1 マス (絵の実寸 / マス数) */
function runPy(script, args) {
  let out = '', code = -2;
  for (const py of ['py', 'python3']) {
    try { out = execFileSync(py, [path.join(ROOT, 'tools', script)].concat(args), { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) }); code = 0; break; }
    catch (e) { if (e.code === 'ENOENT') continue; out = String((e.stdout || '') + (e.stderr || '')); code = e.status == null ? -1 : e.status; break; }
  }
  return { out, code };
}
function gridCheck(rel, tile) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return { ok: false, why: '無い ' + rel };
  const r = runPy('make_grid_map.py', ['--check', fp, '--tile', String(tile)]);
  const lines = r.out.split(/\r?\n/).filter((l) => /(縦線|横線):/.test(l));
  const okOf = (w) => lines.some((l) => l.indexOf(w + ':') >= 0 && /^\s*OK /.test(l));
  return { code: r.code, v: okOf('縦線'), h: okOf('横線'), lines: lines.map((l) => l.trim().slice(0, 150)) };
}
function alignCheck(rel, tile) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return { ok: false, why: '無い ' + rel };
  const r = runPy('check_grid_alignment.py', [fp, '--tile', String(tile)]);
  const lines = r.out.split(/\r?\n/).filter((l) => /^\s*(OK|NG)\s/.test(l));
  return { code: r.code, v: lines.length === 2 && /^\s*OK/.test(lines[0]), h: lines.length === 2 && /^\s*OK/.test(lines[1]), lines: lines.map((l) => l.trim().slice(0, 150)) };
}
const sha16 = (o) => crypto.createHash('sha1').update(JSON.stringify({ nodes: o.nodesFP, edges: o.edges, sites: o.sites })).digest('hex').slice(0, 16);

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側の観測 (⛔ 期待値はここに書かない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const TAV_SNAP = (SITE) => {
  const o = {};
  try {
    o.scen = scenarios.map((s) => ({ id: s.id, side: !!s.side, locked: !!s.locked, unlockAfter: s.unlockAfter || null, place: s.place, lv: s.recommendedLevel }));
    o.main = (typeof mainScenarios === 'function') ? mainScenarios().map((s) => s.id) : null;
    o.facts = window.__TAVERN_TV ? window.__TAVERN_TV.boardFacts() : null;
    const W = window.WORLD_MAP;
    o.sites = W ? Object.assign({}, W.SITES) : null;
    o.unlock = W ? Object.assign({}, W.UNLOCK) : null;
    o.node = W && W.NODES[SITE] ? Object.assign({}, W.NODES[SITE]) : null;
    o.edges = W ? W.EDGES.map((e) => e[0] + '__' + e[1]) : null;
    o.n = W ? { nodes: Object.keys(W.NODES).length, edges: W.EDGES.length, steps: Object.keys(W.STEPS).length } : null;
    o.stepIdsFP = W ? Object.keys(W.STEPS).filter((k) => k.indexOf(SITE) >= 0) : null;
  } catch (e) { o.err = String((e && e.message) || e); }
  return o;
};
const WORLD_SNAP = (SITE, FROM, T) => {
  const W = window.WORLD_MAP, WD = window.__world;
  const el = document.getElementById('worldNode_' + SITE);
  const sg = el ? el.querySelector('.worldSign') : null;
  let p = null;
  try { p = W ? W.findWalkPath(FROM, SITE) : null; } catch (e) { p = 'ERR ' + e.message; }
  const vis = (e) => e.offsetParent !== null;
  return { cls: el ? el.className : null, sign: sg ? sg.textContent.replace(/\s+/g, ' ').trim() : null,
    signs: Array.from(document.querySelectorAll('.worldSign')).filter(vis).length,
    domNodes: document.querySelectorAll('[id^="worldNode_"]').length,
    lines: document.querySelectorAll('line[data-edge]').length,
    edgeLine: !!document.querySelector('line[data-edge="' + T + '__' + SITE + '"]'),
    fpLines: Array.from(document.querySelectorAll('line[data-edge]')).filter((l) => (l.getAttribute('data-edge') || '').indexOf(SITE) >= 0).length,
    steps: document.querySelectorAll('[id^="worldStep_"]').length,
    stepsFP: Array.from(document.querySelectorAll('[id^="worldStep_"]')).filter((e) => e.id.indexOf(SITE) >= 0).map((e) => e.id),
    sites: W ? Object.assign({}, W.SITES) : null, unlock: W ? Object.assign({}, W.UNLOCK) : null,
    node: W && W.NODES[SITE] ? Object.assign({}, W.NODES[SITE]) : null,
    n: W ? { nodes: Object.keys(W.NODES).length, edges: W.EDGES.length, steps: Object.keys(W.STEPS).length } : null,
    revealed: W && W.isRevealed ? W.isRevealed('frost-hold', JSON.parse(localStorage.getItem('dragonfighters.cleared') || '[]')) : null,
    path: Array.isArray(p) ? p.slice() : p, hero: WD ? WD.heroNode() : null, ask: WD ? WD.askOpen() : null };
};
/* index: いまのノードの観測 (n0 / n1 共通)。⚠ page.evaluate へは toString で渡して new Function で戻す */
const NODE_SNAP = (GIANT) => {
  const o = {};
  try { o.scen = scenarioId; } catch (e) { o.scen = null; }
  o.nodes = (RUN && RUN.graph) ? RUN.graph.nodes.map((n) => n.id + ':' + n.kind) : null;
  o.cur = currentNodeId;
  o.custom = !!(MAPDEF && MAPDEF.isCustom); o.themeId = MAPDEF ? MAPDEF.themeId : null;
  o.outdoor = window.__outdoorRevealProbe ? window.__outdoorRevealProbe() : null;
  o.paintings = roomPaintings.map((p) => ({ src: p.img && p.img.src ? decodeURIComponent(p.img.src.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]) : null,
    loaded: !!p.loaded, tw: p.tw, th: p.th, nw: p.img ? p.img.naturalWidth : null, nh: p.img ? p.img.naturalHeight : null,
    bakeTile: (p.img && p.tw && p.th && p.img.naturalWidth / p.tw === p.img.naturalHeight / p.th) ? p.img.naturalWidth / p.tw : null }));
  try { const D = ROOM_PAINTINGS_DEF['frost-hold']; o.outdoorFlags = D ? Object.keys(D).map((k) => [k, !!D[k].outdoor]) : null; } catch (e) { o.outdoorFlags = null; }
  o.traps = window.__frostHoldTV ? window.__frostHoldTV.traps() : traps.map((t) => ({ tx: t.tx, ty: t.ty, type: t.type }));
  o.rockLen = Array.isArray(window.__giantRockProbe) ? window.__giantRockProbe.length : null;
  o.breathLen = Array.isArray(window.__coldBreathProbe) ? window.__coldBreathProbe.length : null;
  o.player = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
  const tileOf = (e) => ({ tx: Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), ty: Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE) });
  o.enemies = enemies.map((e, i) => Object.assign({ i, type: e.type, boss: !!(e.def && e.def.isBoss), alive: !!e.alive, inactive: !!e.inactive }, tileOf(e)));
  o.enemyWall = o.enemies.filter((e) => isTileWall(e.tx, e.ty)).map((e) => e.type + '@' + e.tx + ',' + e.ty);
  o.pathToEnemies = o.enemies.map((e) => { const q = aStar(o.player.tx, o.player.ty, e.tx, e.ty); return q ? q.length : null; });
  /* 巨人の体のタイル (unitBodyTiles) が出発点で全部歩けるか */
  const g = o.enemies.find((e) => e.type === GIANT);
  if (g && typeof unitBodyTiles === 'function') {
    try { const bt = unitBodyTiles(ENEMY_TYPES[GIANT], g.tx, g.ty); o.giantBody = { tiles: (bt || []).map((t) => Array.isArray(t) ? t.join(',') : (t.tx + ',' + t.ty)), wall: (bt || []).filter((t) => Array.isArray(t) ? isTileWall(t[0], t[1]) : isTileWall(t.tx, t.ty)).length }; }
    catch (e) { o.giantBody = { err: e.message }; }
  }
  const nd = RUN.graph.nodes.find((n) => n.id === currentNodeId);
  const ex = nd && nd.exits && nd.exits[0];
  const DV = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
  if (ex) {
    const d = DV[ex.dir] || [0, 0];
    o.exitInner = [ex.at[0] - d[0], ex.at[1] - d[1]];
    const p = aStar(o.player.tx, o.player.ty, o.exitInner[0], o.exitInner[1]);
    o.pathToExit = p ? p.length : null;
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
  const t = { tx: -1, ty: -1, type: window.__frostHoldTV.trapTypeForNode(), damageDice: '1d6', found: false, triggered: false, el: null };
  o.type = t.type;
  said.length = 0; triggerTrapOnPlayer(t); o.player = said.slice();
  said.length = 0; triggerTrapOnPlayer(t, '引数の語り(検証)'); o.arg = said.slice();
  if (withAlly) {
    const al = allies.find((a) => a.alive);
    if (al) { const ah = al.hp; al.hp = 999; said.length = 0; triggerTrapOnAlly(t, al); o.ally = said.slice(); al.hp = ah; }
  }
  if (traps.length) { const sp = traps[0]; o.spawnedType = sp.type; said.length = 0; triggerTrapOnPlayer(sp); o.spawned = said.slice(); }
  showDMMessage = _dm;
  hp = hp0; maxHp = mx0;
  o.tt = window.__frostHoldTV.TRAP_TYPES();
  return o;
};
/* ① 直接呼び (ゲームループは止まっている = dialogPaused)。隊列を置き直し、d20 / 1d6 を呼び出しの間だけ差し替える */
const DIRECT = async (C) => {
  const o = { rock: [], reach: null, breath: [], empty: null, seq: null, boss: null, cs: null, immune: null, err: [] };
  const T = TILE_SIZE;
  const gi = enemies.findIndex((e) => e.type === C.GIANT);
  const wis = enemies.map((e, i) => (e.type === C.WOLF ? i : -1)).filter((i) => i >= 0);
  o.gi = gi; o.wis = wis;
  if (gi < 0 || !wis.length) { o.err.push('巨人 / 冬狼が居ない'); return o; }
  const G = enemies[gi], W0 = enemies[wis[0]];
  const putE = (e, tx, ty) => { e.x = tx * T + T / 2 - e.def.displaySize / 2; e.y = ty * T + T / 2 - e.def.displaySize / 2; e.path = []; e.slideTargetTile = null; };
  const putP = (tx, ty) => { playerX = tx * T + T / 2 - 48; playerY = ty * T + T / 2 - 58; };
  const putA = (a, tx, ty) => { a.x = tx * T + T / 2 - a.def.displaySize / 2; a.y = ty * T + T / 2 - a.def.displaySize / 2; a.path = []; };
  const tileE = (e) => [Math.floor((e.x + e.def.displaySize / 2) / T), Math.floor((e.y + e.def.displaySize / 2) / T)];
  /* 元の状態を控える (② の戦闘の前に戻す) */
  const bak = { px: playerX, py: playerY, a: allies.map((a) => ({ x: a.x, y: a.y })), e: enemies.map((e) => ({ x: e.x, y: e.y, inactive: !!e.inactive })) };
  const heal = () => { maxHp = Math.max(maxHp, 999); hp = maxHp; for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; } };
  const live = () => allies.filter((a) => a.alive);
  /* 隊列: 頭 (22,13) / 仲間 (22,12)(21,14)(18,13) = いちばん遠いのは 3 人目・いちばん近いのは頭 (巨人 (34,13) から) */
  const SLOTS = [[22, 12], [21, 14], [18, 13], [20, 15]];
  const layout = () => { putP(22, 13); live().forEach((a, k) => putA(a, SLOTS[k][0], SLOTS[k][1])); heal(); };
  const members = () => {
    const L = [];
    if (hp > 0 && !gameOver) L.push({ kind: 'leader', idx: null, cx: playerX + 48, cy: playerY + 58, hp: hp, ac: currentPlayerAc() });
    allies.forEach((a, i) => { if (a.alive) L.push({ kind: 'ally', idx: i, cx: a.x + a.def.displaySize / 2, cy: a.y + a.def.displaySize / 2, hp: a.hp, ac: currentAllyAc(a) }); });
    return L;
  };
  const hpOf = (kind, idx) => kind === 'leader' ? hp : allies[idx].hp;
  const _d20 = d20, _roll = rollDiceDD;
  /* ── 岩: 届かない盤面 ── */
  const rockCase = async (label, rolls) => {
    layout(); putE(G, 34, 13); G.rockCooldown = 0;
    const L = members();
    const gc = { x: G.x + G.def.displaySize / 2, y: G.y + G.def.displaySize / 2 };
    let far = null, near = null;
    for (const m of L) { m.d = Math.hypot(m.cx - gc.x, m.cy - gc.y); if (!far || m.d > far.d) far = m; if (!near || m.d < near.d) near = m; }
    let k = 0, calls = 0;
    d20 = function () { calls++; const v = rolls[k++]; return v == null ? 10 : v; };
    const n0 = window.__giantRockProbe.length;
    const hp0 = L.map((m) => hpOf(m.kind, m.idx));
    let ret = null, err = null;
    try { ret = await giantRockThrow(gi); } catch (e) { err = String(e && e.message || e); } finally { d20 = _d20; }
    const add = window.__giantRockProbe.slice(n0).map((r) => JSON.parse(JSON.stringify(r)));
    const hp1 = L.map((m) => hpOf(m.kind, m.idx));
    const drops = L.map((m, i) => ({ kind: m.kind, idx: m.idx, drop: hp0[i] - hp1[i] }));
    o.rock.push({ label, rolls, ret, err, calls, add, far: { kind: far.kind, idx: far.idx, d: far.d, ac: far.ac }, near: { kind: near.kind, idx: near.idx },
      drops, cooldownAfter: G.rockCooldown, ds: L.map((m) => +m.d.toFixed(1)) });
    G.rockCooldown = 0;
  };
  try {
    await rockCase('hit', [12]);
    await rockCase('miss', [2]);
    await rockCase('fumble', [1]);
    await rockCase('crit', [20, 19]);
    await rockCase('threat-unconfirmed', [20, 1]);
    /* 届く盤面: 巨人を頭の隣 (23,13) へ */
    layout(); putE(G, 23, 13); G.rockCooldown = 0;
    { let calls = 0; d20 = function () { calls++; return 15; };
      const n0 = window.__giantRockProbe.length, hp0 = hp; let ret = null, err = null;
      try { ret = await giantRockThrow(gi); } catch (e) { err = String(e && e.message || e); } finally { d20 = _d20; }
      const R = window.__frostHoldTV.giantRockReachable(gi);
      o.reach = { ret, err, calls, add: window.__giantRockProbe.slice(n0).map((r) => JSON.parse(JSON.stringify(r))), hpDrop: hp0 - hp, cooldownAfter: G.rockCooldown,
        inReach: R ? R.inReach.map((c) => c.kind + ':' + c.cheb) : null, tiles: R ? R.tiles : null }; }
    putE(G, 34, 13); G.rockCooldown = 0;
  } catch (e) { o.err.push('rock: ' + e.message); }
  /* ── 冷気の息: 3x3 に隊員が入る盤面 (冬狼 (24,13)) ── */
  const csCalls = { t: 0, w: 0, f: 0 };
  const _tc = tryCounterEnemySpell, _cw = counterspellWanted, _fc = findCounterspeller;
  tryCounterEnemySpell = async function () { csCalls.t++; return _tc.apply(this, arguments); };
  counterspellWanted = function () { csCalls.w++; return _cw.apply(this, arguments); };
  findCounterspeller = function () { csCalls.f++; return _fc.apply(this, arguments); };
  const breathCase = async (label, roll) => {
    layout(); putE(W0, 24, 13); W0.__coldBreathSpent = false;
    const L = members();
    const hp0 = L.map((m) => hpOf(m.kind, m.idx));
    let calls = 0;
    d20 = function () { calls++; return roll; };
    const n0 = window.__coldBreathProbe.length;
    let ret = null, err = null;
    try { ret = await coldBreath(wis[0]); } catch (e) { err = String(e && e.message || e); } finally { d20 = _d20; }
    const add = window.__coldBreathProbe.slice(n0).map((r) => JSON.parse(JSON.stringify(r)));
    const rec = add.find((r) => r.site === 'breath') || null;
    const hp1 = L.map((m) => hpOf(m.kind, m.idx));
    /* 3x3 の中に居る隊員 (自前で数える = 2 経路目) */
    const inBox = rec ? L.filter((m) => { const tx = Math.floor(m.cx / T), ty = Math.floor(m.cy / T); return tx >= rec.tx0 && tx < rec.tx0 + 3 && ty >= rec.ty0 && ty < rec.ty0 + 3; })
      .map((m) => m.kind + ':' + m.idx) : null;
    o.breath.push({ label, roll, ret, err, calls, add, inBox, wolfTile: tileE(W0), spentAfter: !!W0.__coldBreathSpent,
      drops: L.map((m, i) => ({ k: m.kind + ':' + m.idx, drop: hp0[i] - hp1[i] })) });
  };
  try {
    await breathCase('fail', 2);
    await breathCase('save', 19);
    o.cs = { calls: Object.assign({}, csCalls), on: typeof isCounterspellOn === 'function' ? !!isCounterspellOn() : null };
  } catch (e) { o.err.push('breath: ' + e.message); }
  finally { tryCounterEnemySpell = _tc; counterspellWanted = _cw; findCounterspeller = _fc; }
  /* ── 3x3 が空の盤面 (冬狼 (32,13) = 隊から 10 マス) ── */
  try {
    layout(); putE(W0, 32, 13); W0.__coldBreathSpent = false;
    let calls = 0; d20 = function () { calls++; return 2; };
    const n0 = window.__coldBreathProbe.length, hp0 = hp;
    let ret = null, err = null;
    try { ret = await coldBreath(wis[0]); } catch (e) { err = String(e && e.message || e); } finally { d20 = _d20; }
    o.empty = { ret, err, calls, add: window.__coldBreathProbe.slice(n0).map((r) => JSON.parse(JSON.stringify(r))), spentAfter: !!W0.__coldBreathSpent, hpDrop: hp0 - hp };
  } catch (e) { o.err.push('empty: ' + e.message); }
  /* ── Recharge 5-6 の筋書き: 本番の enemyAttackTurn を 6 手番 (1d6 だけ差し替え: 2,4,5,6,3) ── */
  try {
    W0.__coldBreathSpent = false; W0.__wolfTurn = 0;
    const D6 = [2, 4, 5, 6, 3];
    let k = 0;
    rollDiceDD = function (n, s) { if (n === 1 && s === 6) { const v = D6[k++]; return { rolls: [v], total: v }; } return _roll.apply(this, arguments); };
    const turns = [];
    for (let t = 1; t <= 6; t++) {
      layout(); putE(W0, 24, 13);
      const c0 = window.__coldBreathProbe.length, r0 = window.__giantRockProbe.length;
      let err = null;
      try { await enemyAttackTurn(wis[0]); } catch (e) { err = String(e && e.message || e); }
      const add = window.__coldBreathProbe.slice(c0).map((r) => r.site + (r.reason ? ':' + r.reason : '') + (r.site === 'recharge' ? ':' + r.d6 + ':' + (r.ready ? 'ready' : 'no') : ''));
      turns.push({ t, add, rockAdd: window.__giantRockProbe.length - r0, err, spent: !!W0.__coldBreathSpent, wolfTurn: W0.__wolfTurn });
    }
    rollDiceDD = _roll;
    o.seq = { turns, d6used: k };
  } catch (e) { rollDiceDD = _roll; o.err.push('seq: ' + e.message); }
  /* ── (3h) 写したボスの def: 巨人に breathDice / breathElement "cold" を持たせ (rockDice は外す)、本番の enemyAttackTurn を 1 手番 ── */
  try {
    layout(); putE(G, 30, 13);
    const def0 = G.def;
    const clone = Object.assign({}, def0, { breathDice: '4d8', breathDC: 12, breathBlast: 3, breathElement: 'cold', breathChance: 1e-9 });
    delete clone.rockDice;
    G.def = clone;
    let fire = 0;
    const _hf = hydraFireBreath;
    hydraFireBreath = async function () { fire++; return _hf.apply(this, arguments); };
    const c0 = window.__coldBreathProbe.length, r0 = window.__giantRockProbe.length;
    let err = null;
    try { await enemyAttackTurn(gi); } catch (e) { err = String(e && e.message || e); }
    finally { hydraFireBreath = _hf; G.def = def0; }
    o.boss = { err, coldAdd: window.__coldBreathProbe.slice(c0).map((r) => r.site + ':' + r.enemyIdx), rockAdd: window.__giantRockProbe.length - r0, fire,
      wolfTurn: G.__wolfTurn === undefined ? null : G.__wolfTurn, isBoss: !!clone.isBoss };
    delete G.__wolfTurn; G.__coldBreathSpent = undefined;
  } catch (e) { o.err.push('boss: ' + e.message); }
  /* ── (3d) 冷気の完全耐性 ── */
  try {
    o.immune = { giantCold: resolveElementDefense(gi, 'cold', 20), giantFire: resolveElementDefense(gi, 'fire', 20),
      wolfCold: resolveElementDefense(wis[0], 'cold', 20), wolfFire: resolveElementDefense(wis[0], 'fire', 20) };
  } catch (e) { o.err.push('immune: ' + e.message); }
  /* ── 戻す (② の戦闘の前) ── */
  playerX = bak.px; playerY = bak.py;
  allies.forEach((a, i) => { if (bak.a[i]) { a.x = bak.a[i].x; a.y = bak.a[i].y; a.path = []; } });
  enemies.forEach((e, i) => { if (bak.e[i]) { e.x = bak.e[i].x; e.y = bak.e[i].y; e.path = []; e.slideTargetTile = null; } });
  G.rockCooldown = 0;
  for (const i of wis) { enemies[i].__coldBreathSpent = false; enemies[i].__wolfTurn = 0; }
  heal();
  o.wrappedBack = (d20 === _d20 && rollDiceDD === _roll && tryCounterEnemySpell === _tc);
  return o;
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const BSET = baseSetOf(mutKey);   // ★[#110] 基準の組 (basemove だけ別の版)
  const ctx = { booted: 0, errs: [], hits: {} };
  const base = 'http://127.0.0.1:' + port + '/';
  const pages = [];
  const STAGE_ERRS = [];
  const stage = async (name, f, fb) => { try { return await f(); } catch (e) { STAGE_ERRS.push(name + ': ' + String((e && e.message) || e).slice(0, 200)); return fb; } };
  async function newPage(view) {
    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
    page.on('console', (m) => {
      let t = ''; try { t = m.text(); } catch (e) { return; }
      if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
    });
    await page.setViewport(view || VIEW);
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
  const idxSeed = (sid) => ({ ls: { 'dragonfighters.xp': '28000' },
    ss: { 'dragonfighters.currentScenario': sid, 'dragonfighters.partyMembers': J(PARTY) } });
  async function gotoIndex(page, sid, q) {
    await prep(page, null, idxSeed(sid));
    await page.goto(base + F_INDEX + (q || '?diag=1'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction("typeof RUN !== 'undefined' && RUN && typeof enterNode === 'function' && typeof spawnTraps === 'function'", { timeout: 90000 });
    ctx.booted++;
  }
  async function openWorld(o) {
    const page = await newPage(null);
    await prep(page, o.cleared || [], { ss: o.ss || {} });
    await page.goto(base + F_WORLD + (o.q || ''), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.WORLD_MAP && !!window.__world && !!document.getElementById('worldNode_' + 'temple'), { timeout: 30000 });
    await sleep(o.settle || 1200);
    ctx.booted++;
    const snap = await page.evaluate(WORLD_SNAP, FH_SITE, PORT_TOWN, TEMPLE_SITE);
    if (!o.keep) await page.close().catch(() => {});
    return { page, snap };
  }
  async function walkTo(page, dest) {
    await page.evaluate((d) => window.__world.goToNode(d), dest);
    const t0 = Date.now(); const seen = []; const askAt = [];
    while (Date.now() - t0 < WALK_MS) {
      const s = await page.evaluate(() => ({ h: window.__world.heroNode(), a: window.__world.askOpen(), m: window.__world.isMoving(),
        t: (document.getElementById('worldEnterText') || {}).textContent || '' }));
      if (seen[seen.length - 1] !== s.h) seen.push(s.h);
      if (s.a) { askAt.push({ h: s.h, t: s.t.replace(/\s+/g, ' ').slice(0, 80) }); break; }
      if (!s.m && s.h !== dest && await page.evaluate((d) => window.WORLD_MAP.findWalkPath(window.__world.heroNode(), d) === null, dest)) { seen.push('(道が無い)'); break; }   /* 変異 noedge で 300 秒待たない */
      if (!s.m && s.h === dest) { await sleep(800); const a2 = await page.evaluate(() => window.__world.askOpen()); if (!a2) break; }
      else if (!s.m) await page.evaluate((d) => window.__world.goToNode(d), dest);
      await sleep(250);
    }
    const end = await page.evaluate(() => ({ h: window.__world.heroNode(), a: window.__world.askOpen() }));
    return { seen, askAt, end, ms: Date.now() - t0 };
  }
  /* ② 戦闘: 本番の runEncounter を回す。頭と仲間の手番は何もしない (HP 999)。巨人の手番が CT 回来たら全員を倒す */
  async function battle(page, CT) {
    await page.evaluate((G, W, CT) => {
      const S = window.__fbS = { giant: [], wolf: [], other: { turns: 0, rockAdd: 0, coldAdd: 0 }, killed: false, encIdx: null };
      const _e = enemyAttackTurn;
      enemyAttackTurn = async function (idx) {
        const e = enemies[idx];
        const r0 = window.__giantRockProbe.length, c0 = window.__coldBreathProbe.length;
        const cd0 = e ? (e.rockCooldown || 0) : null;
        let r;
        try { r = await _e.apply(this, arguments); } finally {
          const rk = window.__giantRockProbe.slice(r0).map((x) => JSON.parse(JSON.stringify(x)));
          const cb = window.__coldBreathProbe.slice(c0).map((x) => JSON.parse(JSON.stringify(x)));
          if (e && e.type === G) S.giant.push({ n: S.giant.length + 1, idx, cd0, cd1: e.rockCooldown || 0, rk, cbN: cb.length });
          else if (e && e.type === W) S.wolf.push({ idx, cb, rkN: rk.length });
          else { S.other.turns++; S.other.rockAdd += rk.length; S.other.coldAdd += cb.length; }
        }
        return r;
      };
      const finish = () => {
        maxHp = Math.max(maxHp, 999); hp = maxHp; for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; }
        if (S.killed || S.giant.length < CT) return;
        S.killed = true;
        for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e && e.alive && !e.passiveNpc) { e.hp = 0; defeatEnemy(i); } }
      };
      playerAttackTurn = async function () { finish(); };
      allyAttackTurn = async function () { finish(); };
      S.wrapped = { enemy: enemyAttackTurn === window.enemyAttackTurn, player: playerAttackTurn === window.playerAttackTurn };
      maxHp = Math.max(maxHp, 999); hp = maxHp;
      for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; }
    }, GIANT, WOLF, CT);
    return page.evaluate(async (G, START_MS, END_MS) => {
      const o = {};
      const S = window.__fbS;
      const gi = enemies.findIndex((e) => e.type === G);
      const g = enemies[gi];
      if (g && !encounterActive) {
        /* 巨人の 3 マス左へ (冬狼 (X3 で 1 頭) も 2 マス以内 = 1 つの戦闘)・巨人には届かない (= 最初の手番は岩) */
        const gtx = Math.floor((g.x + g.def.displaySize / 2) / TILE_SIZE), gty = Math.floor((g.y + g.def.displaySize / 2) / TILE_SIZE);
        playerX = (gtx - 3) * TILE_SIZE + TILE_SIZE / 2 - 48; playerY = gty * TILE_SIZE + TILE_SIZE / 2 - 58;
        await new Promise((r) => setTimeout(r, 400));
        try { tryStartEncounter(); } catch (e) { o.tseErr = e.message; }
      }
      const t0 = performance.now();
      while (!encounterActive && performance.now() - t0 < START_MS) await new Promise((r) => setTimeout(r, 250));
      o.started = !!encounterActive; o.startMs = Math.round(performance.now() - t0);
      try { o.encIdx = Array.isArray(encounterEnemyIndices) ? encounterEnemyIndices.map((i) => enemies[i] && enemies[i].type) : null; } catch (e) { o.encIdx = null; }
      if (!o.started) o.diag = { dialogPaused: !!dialogPaused, skillCheckActive: !!skillCheckActive, nodeBusy: !!nodeBusy, cur: currentNodeId, gameOver: !!gameOver };
      const t1 = performance.now();
      while ((encounterActive || encounterRunning) && performance.now() - t1 < END_MS) await new Promise((r) => setTimeout(r, 250));
      o.ended = !encounterActive && !encounterRunning; o.encMs = Math.round(performance.now() - t1);
      o.S = JSON.parse(JSON.stringify(S));
      o.hall = (window.__frostHallProbe || []).length;
      return o;
    }, GIANT, ENC_START_WAIT_MS, ENC_END_WAIT_MS);
  }
  try {
    const PLACE = PLACE_OF(servedFile(F_TAVERN, mutKey));
    const VMC = wmapCounts(servedFile(F_WMAP, mutKey));
    /* ══════════ tavern ══════════ */
    const tp = await newPage();
    const openTav = async (q) => {
      await tp.goto(base + F_TAVERN + (q || ''), { waitUntil: 'load', timeout: 60000 });
      await tp.waitForFunction(() => { try { return typeof scenarios !== 'undefined' && !!window.__TAVERN_TV; } catch (e) { return false; } }, { timeout: 30000 });
      await tp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await sleep(150);
      ctx.booted++;
      return tp.evaluate(TAV_SNAP, FH_SITE);
    };
    await prep(tp, []);
    const t0 = await openTav('');
    const mainIds = (t0.scen || []).filter((s) => !s.side).map((s) => s.id);
    const sideIds = (t0.scen || []).filter((s) => s.side).map((s) => s.id);
    const M4 = mainIds.slice(0, 4), M5 = mainIds.slice(0, 5);
    const TEMPLE = mainIds[4];
    await prep(tp, []); const t0off = await openTav('?giant=0');
    await prep(tp, M4); const t4 = await openTav('');
    await prep(tp, M4); const t4off = await openTav('?giant=0');
    await prep(tp, M5); const t5 = await openTav('');
    await prep(tp, M5); const t5off = await openTav('?giant=0');
    await prep(tp, mainIds); const t6 = await openTav('');
    await tp.close().catch(() => {});

    /* ══════════ world ══════════ */
    /* ★[#109 項目3] 種まき SIGN_OFF (= ?questsign=0 の撤退)。#109 から札は「受注中の行き先と港町だけ」。
       (0b)(1b)(1c)(4b) は「解放されると拠点 (札) として立つ / 札の数」を測るので今日の姿の札で測る。
       ⛔ 期待値は変えていない。札の新しい規則は verify_world_autowalk が測る。⛔ URL に足さない (q を縛る腕がある)。 */
    const SIGN_OFF = { 'dragonfighters.questSignOff': '1' };
    const w4 = (await openWorld({ cleared: M4, ss: SIGN_OFF })).snap;                       /* (1c) */
    const w5 = (await openWorld({ cleared: M5, ss: SIGN_OFF })).snap;                       /* (1a)(1b)(1c) */
    const w5off = (await openWorld({ cleared: M5, q: '?giant=0', ss: SIGN_OFF })).snap;     /* (4b) */
    const wAll = (await openWorld({ cleared: mainIds.concat(sideIds), ss: SIGN_OFF })).snap; /* (0b) 札の数 */
    /* (4c) 撤退 6 段 (本番の関数を呼ぶ) */
    const wr = await openWorld({ cleared: [], keep: true });
    const retired = await wr.page.evaluate(() => {
      const W = window.WORLD_MAP;
      const fp = () => ({ sites: JSON.parse(JSON.stringify(W.SITES)), edges: W.EDGES.map((e) => e[0] + '__' + e[1]),
        nodesFP: Object.keys(W.NODES).map((id) => { const n = W.NODES[id]; return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—'); }) });
      if (['retireGiant', 'retireHag', 'retireTomb', 'retireCargo', 'retireWarren', 'retireTower'].some((f) => typeof W[f] !== 'function')) return null;
      const o = { on: fp() };
      W.retireGiant(); o.giant = fp();
      W.retireHag(); o.hag = fp();
      W.retireTomb(); o.tomb = fp();
      W.retireCargo(); o.cargo = fp();
      W.retireWarren(); o.warren = fp();
      W.retireTower(); o.tower = fp();
      return o;
    }).catch(() => null);
    await wr.page.close().catch(() => {});
    /* (1d) 経路の非退行: 同じページに BSET.rev と今の js/world-map.js を順に載せる */
    const PATHS = await stage('paths', async () => {
      const pg = await newPage();
      await pg.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
      return pg.evaluate(async (SITE, FROM, T) => {
        const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
        await load('js/world-map.js?__base=1');
        const B = window.WORLD_MAP; window.WORLD_MAP = undefined;
        await load('js/world-map.js');
        const C = window.WORLD_MAP;
        const ids = Object.keys(B.NODES);
        const o = { ids: ids.length, pairs: 0, diff: [], diffW: [], fpEdges: C.EDGES.filter((e) => e[0] === SITE || e[1] === SITE).map((e) => e.join('__')) };
        for (const a of ids) for (const b of ids) {
          if (a === b) continue;
          o.pairs++;
          if (JSON.stringify(B.findPath(a, b)) !== JSON.stringify(C.findPath(a, b))) o.diff.push(a + '>' + b);
          if (JSON.stringify(B.findWalkPath(a, b)) !== JSON.stringify(C.findWalkPath(a, b))) o.diffW.push(a + '>' + b);
        }
        o.walkFP = C.findWalkPath(FROM, SITE); o.pathFP = C.findPath(FROM, SITE);
        o.sameObj = B !== C;
        return o;
      }, FH_SITE, PORT_TOWN, TEMPLE_SITE);
    }, null);
    /* (1e) 受注 = 霜の巨人の砦: 港町から frost_peak を押して歩く */
    const WALK = await stage('walk', async () => {
      const w = await openWorld({ cleared: M5, q: WORLD_Q, ss: { 'dragonfighters.exitVia': 'town', 'dragonfighters.questDest': FH, 'dragonfighters.currentScenario': FH }, keep: true, settle: 1800 });
      const r = { start: { hero: w.snap.hero, ask: w.snap.ask } };
      r.walk = await walkTo(w.page, FH_SITE);
      await w.page.close().catch(() => {});
      return r;
    }, null);

    /* ── §1 / §4b / §0b の判定 ── */
    const fhOf = (s) => (s.scen || []).find((x) => x.id === FH) || null;
    const A1 = (s, w) => {
      const t = fhOf(s);
      if (!t || !s.sites || !s.unlock || !w || !w.sites) return { ok: false, why: '霜の巨人の砦が scenarios / SITES に無い (scenarios に ' + (t ? '在る' : '無い') + ')' };
      const ids = s.scen.map((x) => x.id).sort().join('|');
      const why = [];
      if (!(t.side === true && t.locked === true && typeof t.unlockAfter === 'string' && t.place === PLACE)) why.push('scenarios の霜の巨人の砦 ' + J(t) + ' / 配信バイトの place ' + PLACE);
      if (Object.keys(s.sites).sort().join('|') !== ids) why.push('tavern の SITES の id 集合 ≠ scenarios');
      if (Object.keys(w.sites).sort().join('|') !== ids) why.push('world.html の SITES の id 集合 ≠ scenarios');
      if (s.sites[FH] !== FH_SITE || w.sites[FH] !== FH_SITE) why.push('SITES[霜の巨人の砦] ' + s.sites[FH] + '/' + w.sites[FH]);
      for (const x of s.scen) {
        const u = x.locked ? x.unlockAfter : null;
        if ((s.unlock[x.id] || null) !== u) why.push('UNLOCK[' + x.id + ']=' + s.unlock[x.id] + ' ≠ unlockAfter ' + u);
        if ((w.unlock[x.id] || null) !== u) why.push('world.html UNLOCK[' + x.id + ']=' + w.unlock[x.id] + ' ≠ unlockAfter ' + u);
      }
      if (!s.node || s.node.kind !== 'site' || s.node.label !== PLACE || !w.node || w.node.kind !== 'site' || w.node.label !== PLACE) why.push(FH_SITE + ' が拠点「' + PLACE + '」でない ' + J([s.node, w.node]));
      const fpE = (s.edges || []).filter((e) => e.split('__').indexOf(FH_SITE) >= 0);
      if (J(fpE) !== J([TEMPLE_SITE + '__' + FH_SITE])) why.push('frost_peak の道が temple–frost_peak の 1 本でない ' + J(fpE));
      return { ok: why.length === 0, why: why.join(' / ') };
    };
    const a1 = A1(t5, w5);
    R.check('(1a)', 'NODES.' + FH_SITE + ' が拠点「' + PLACE + '」(配信バイトの id → place)・EDGES の ' + FH_SITE + ' の道は ' + TEMPLE_SITE + '–' + FH_SITE + ' の 1 本だけ (袋小路)・tavern の霜の巨人の砦 (side・locked・unlockAfter) と同じページの SITES / UNLOCK、world.html の SITES / UNLOCK が一致',
      a1.ok, a1);
    const domOk = (w) => !!w && /\bworldNode-site\b/.test(w.cls || '') && w.lines === (w.n && w.n.edges) && w.edgeLine === true && w.fpLines === 1 && w.steps === BSET.counts.steps && w.stepsFP.length === 0;
    R.check('(1b)', 'world.html の DOM: ' + FH_SITE + ' の点 (拠点)・点線 <line> = EDGES.length 本・data-edge "' + TEMPLE_SITE + '__' + FH_SITE + '" が 1 本・刻み点 = ' + BSET.rev + ' と同じ ' + BSET.counts.steps + ' 個 (' + FH_SITE + ' の刻み点 0)',
      domOk(w5), { cls: w5.cls, lines: w5.lines, n: w5.n, edgeLine: w5.edgeLine, fpLines: w5.fpLines, steps: w5.steps, stepsFP: w5.stepsFP });
    const srt = (a) => J((a || []).slice().sort());
    const sameUnl = (a, b) => !!a.facts && !!b.facts && srt(a.facts.unlocked) === srt(b.facts.unlocked) && (a.facts.unlocked || []).indexOf(FH) < 0;
    const t5u = (t5.facts && t5.facts.unlocked) || [], t5ou = (t5off.facts && t5off.facts.unlocked) || [];
    R.check('(1c)', 'cleared=[] / [本筋 4 本] の解放済みは ?giant=0 と同じ (霜の巨人の砦は入らない)・world.html の札は神殿の前は無く (isRevealed 偽)、本筋 5 本 (' + TEMPLE + ' まで) で出る (= ?giant=0 の解放済み + 霜の巨人の砦)',
      sameUnl(t0, t0off) && sameUnl(t4, t4off) && w4.sign === null && w4.revealed === false && !!w4.node
        && t5u.indexOf(FH) >= 0 && srt(t5u) === srt(t5ou.concat([FH])) && !!w5.sign && w5.sign.indexOf(PLACE) >= 0 && w5.revealed === true,
      { u0: [t0.facts && t0.facts.unlocked, t0off.facts && t0off.facts.unlocked], u4: [t4.facts && t4.facts.unlocked, t4off.facts && t4off.facts.unlocked],
        u5: [t5u, t5ou], w4: { sign: w4.sign, revealed: w4.revealed, node: !!w4.node }, w5: { sign: w5.sign, revealed: w5.revealed } });
    const P = PATHS || {};
    const wfp = P.walkFP || [];
    R.check('(1d)', '⭐ 経路の非退行: ' + BSET.rev + ' の js/world-map.js と並べて既存 ' + (P.ids || '?') + ' 点の全組 (' + (P.pairs || '?') + ' 組) の findPath / findWalkPath が同じ・findWalkPath("' + PORT_TOWN + '","' + FH_SITE + '") は ' + TEMPLE_SITE + ' を通って着く',
      !!PATHS && P.ids === BSET.counts.nodes && P.pairs === P.ids * (P.ids - 1) && P.diff.length === 0 && P.diffW.length === 0 && P.sameObj === true
        && Array.isArray(wfp) && wfp[wfp.length - 1] === FH_SITE && wfp[wfp.length - 2] === TEMPLE_SITE,
      { ids: P.ids, pairs: P.pairs, diff: (P.diff || []).slice(0, 10), diffW: (P.diffW || []).slice(0, 10), walk: wfp, path: P.pathFP, fpEdges: P.fpEdges, stage: STAGE_ERRS.filter((s) => /^paths/.test(s)) });
    const WK = (WALK && WALK.walk) || {};
    R.check('(1e)', '受注 = 霜の巨人の砦で ' + PORT_TOWN + ' から ' + FH_SITE + ' を押して歩くと ' + TEMPLE_SITE + ' を踏んでも開かず、' + FH_SITE + ' で入場「' + PLACE + '」が 1 回だけ開く',
      !!WALK && WALK.start.hero === PORT_TOWN && WALK.start.ask === false && (WK.seen || []).indexOf(TEMPLE_SITE) >= 0
        && (WK.askAt || []).length === 1 && WK.askAt[0].h === FH_SITE && WK.askAt[0].t.indexOf(PLACE) >= 0,
      { start: WALK && WALK.start, seen: WK.seen, askAt: WK.askAt, ms: WK.ms, stage: STAGE_ERRS.filter((s) => /^walk/.test(s)) });
    const t6f = t6.facts || {};
    R.check('(1f)', '本筋 6 本クリアで frontier が null・霜の巨人の砦は side (本筋に無い) として解放済み・推奨 Lv8',
      t6f.frontier === null && (t6f.unlocked || []).indexOf(FH) >= 0 && mainIds.length === 6 && mainIds.indexOf(FH) < 0 && sideIds.indexOf(FH) >= 0
        && !!fhOf(t0) && fhOf(t0).lv === 8 && J(t0.main) === J(mainIds),
      { frontier: t6f.frontier, unlocked: t6f.unlocked, main: t0.main, side: sideIds, lv: fhOf(t0) && fhOf(t0).lv });
    /* (4b) */
    const offTav = !fhOf(t5off) && !(t5off.sites && t5off.sites[FH]) && !(t5off.unlock && t5off.unlock[FH]) && t5off.node === null
      && !!t5off.n && t5off.n.nodes === BSET.counts.nodes && t5off.n.edges === BSET.counts.edges && t5off.n.steps === BSET.counts.steps
      && (t5off.stepIdsFP || []).length === 0 && t5u.length === t5ou.length + 1 && t5ou.indexOf(FH) < 0;
    const offWorld = !!w5off && w5off.cls === null && w5off.node === null && w5off.lines === BSET.counts.edges && w5off.fpLines === 0 && w5off.edgeLine === false
      && w5off.steps === BSET.counts.steps && w5off.stepsFP.length === 0 && !!w5off.n && w5off.n.nodes === BSET.counts.nodes && w5off.n.edges === BSET.counts.edges
      && w5off.n.steps === BSET.counts.steps && !(w5off.sites && w5off.sites[FH]);
    R.check('(4b)', '?giant=0: tavern の配列・SITES・UNLOCK から消え・点 ' + BSET.counts.nodes + '・道 ' + BSET.counts.edges + '・刻み点 ' + BSET.counts.steps + ' (= ' + BSET.rev + ' の js/world-map.js) に戻り・刻み点の id に ' + FH_SITE + ' が無い / world.html の DOM から点・線・札が消え・刻み点マーカーに ' + FH_SITE + ' が無い・解放済みは ON − 1',
      offTav && offWorld,
      { offTav, offWorld, tav: { has: !!fhOf(t5off), node: t5off.node, n: t5off.n, stepIdsFP: t5off.stepIdsFP, u: [t5u.length, t5ou.length] },
        world: { cls: w5off.cls, node: w5off.node, lines: w5off.lines, fpLines: w5off.fpLines, steps: w5off.steps, stepsFP: w5off.stepsFP, n: w5off.n }, base: BSET.counts });
    const rs = retired ? { on: sha16(retired.on), giant: sha16(retired.giant), hag: sha16(retired.hag), tomb: sha16(retired.tomb), cargo: sha16(retired.cargo), warren: sha16(retired.warren), tower: sha16(retired.tower) } : null;
    const shaWant = [SHA_ON, SHA_AFTER_GIANT, SHA_AFTER_HAG, SHA_AFTER_TOMB, SHA_AFTER_CARGO, SHA_AFTER_WARREN, SHA_AFTER_TOWER];
    R.check('(4c)', '既定 → retireGiant() → retireHag() → retireTomb() → retireCargo() → retireWarren() → retireTower() の各段の地図の sha1 = ' + shaWant.join(' / ') + ' (1 段目 = 241c718 の既定)',
      !!rs && rs.on === SHA_ON && rs.giant === SHA_AFTER_GIANT && rs.hag === SHA_AFTER_HAG && rs.tomb === SHA_AFTER_TOMB && rs.cargo === SHA_AFTER_CARGO && rs.warren === SHA_AFTER_WARREN && rs.tower === SHA_AFTER_TOWER,
      { sha: rs, sitesOn: retired && Object.keys(retired.on.sites).length });
    R.check('(0b)', '[装置] 点・道・拠点の数 = 配信バイトの js/world-map.js (vm で読んだ値: 点 ' + (VMC && VMC.nodes) + '・道 ' + (VMC && VMC.edges) + '・拠点 ' + (VMC && VMC.sites) + ') = tavern の WORLD_MAP = world.html の WORLD_MAP / DOM (点・点線・全部クリアの札)・' + BSET.rev + ' より点と道が 1 つずつ多い',
      !!VMC && !!t5.n && t5.n.nodes === VMC.nodes && t5.n.edges === VMC.edges && t5.n.steps === VMC.steps
        && !!w5.n && w5.n.nodes === VMC.nodes && w5.n.edges === VMC.edges && w5.domNodes === VMC.nodes && w5.lines === VMC.edges
        && wAll.signs === VMC.sites && VMC.nodes === BSET.counts.nodes + 1 && VMC.edges === BSET.counts.edges + 1 && VMC.sites === BSET.counts.sites + 1,
      { vm: VMC && { nodes: VMC.nodes, edges: VMC.edges, steps: VMC.steps, sites: VMC.sites }, base: { nodes: BSET.counts.nodes, edges: BSET.counts.edges, sites: BSET.counts.sites },
        tav: t5.n, world: { n: w5.n, domNodes: w5.domNodes, lines: w5.lines, signsAll: wAll.signs } });

    /* ══════════ index: 開幕の語り (?autoplay=1 のページで #dmBody に実際に出た文) ══════════ */
    const NARR = await stage('narration', async () => {
      const np = await newPage();
      await prep(np, null, idxSeed(FH));
      await np.evaluateOnNewDocument(() => {
        const seen = window.__narrSeen = [];
        const take = (b) => { const t = (b.textContent || '').trim(); if (t && seen[seen.length - 1] !== t) seen.push(t); };
        const iv = setInterval(() => {
          const b = document.getElementById('dmBody');
          if (!b) return;
          clearInterval(iv);
          take(b);
          new MutationObserver(() => take(b)).observe(b, { childList: true, characterData: true, subtree: true });
        }, 15);
      });
      await np.goto(base + F_INDEX + '?autoplay=1&diag=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
      ctx.booted++;
      let N = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        N = await np.evaluate((ID) => ({ paras: (typeof SCENARIO_NARRATIONS !== 'undefined' && SCENARIO_NARRATIONS[ID]) ? SCENARIO_NARRATIONS[ID].slice() : null,
          seen: (window.__narrSeen || []).slice(), started: typeof gameStarted !== 'undefined' && !!gameStarted, scen: typeof scenarioId !== 'undefined' ? scenarioId : null }), FH).catch(() => N);
        if (N && N.started) break;
        await sleep(500);
      }
      await np.close().catch(() => {});
      return N;
    }, null);

    /* ══════════ index ?diag=1: n0 → n1 (敵を inactive にして語りを待つ) → ① 直接呼び → ② 戦闘 ══════════ */
    const ip = await newPage();
    await gotoIndex(ip, FH);
    await ip.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(1500);
    const N0 = await ip.evaluate((SNAP, TS, HT, G) => {
      const o = (new Function('return (' + SNAP + ')'))()(G);
      for (const e of enemies) e.inactive = true;   /* ⭐ n0 で戦闘を始めさせない (落ち着きを待って n1 へ) */
      const tv = window.__frostHoldTV;
      o.seams = { tv: !!tv, types: tv && tv.ENEMY_TYPES ? Object.keys(tv.ENEMY_TYPES).sort() : null,
        giantRock: !!(tv && tv.ENEMY_TYPES && tv.ENEMY_TYPES.frostGiant && tv.ENEMY_TYPES.frostGiant.rockDice),
        wolfBreath: !!(tv && tv.ENEMY_TYPES && tv.ENEMY_TYPES.winterWolf && tv.ENEMY_TYPES.winterWolf.breathElement),
        build: typeof window.buildFrostHoldRun, cb: typeof window.coldBreath, rk: typeof window.giantRockThrow,
        reach: tv ? typeof tv.giantRockReachable : null, center: tv ? typeof tv.coldBreathCenter : null,
        rkProbe: Array.isArray(window.__giantRockProbe), cbProbe: Array.isArray(window.__coldBreathProbe), hallProbe: Array.isArray(window.__frostHallProbe) };
      const gd = ENEMY_TYPES[G] || {}, wd = ENEMY_TYPES.winterWolf || {};
      o.defs = { giant: { rockDice: gd.rockDice || null, rockBonus: gd.rockBonus, atkBonus: gd.atkBonus, critMult: gd.critMult, range: gd.range || null, isBoss: !!gd.isBoss,
                          hp: gd.hp, dmgDice: gd.dmgDice || null, dmgBonus: gd.dmgBonus, attacksPerTurn: gd.attacksPerTurn, ac: gd.ac },
                 wolf: { breathDice: wd.breathDice || null, breathDC: wd.breathDC, breathBlast: wd.breathBlast, breathElement: wd.breathElement || null, isBoss: !!wd.isBoss } };
      try {
        const run = window.buildFrostHoldRun();
        o.ledger = run.nodes.map((n) => ({ id: n.id, kind: n.kind,
          slots: [].concat(...n.mapDef.rooms.map((r) => (r.enemySlots || []).map((s) => s[2]))),
          boss: [].concat(...n.mapDef.rooms.map((r) => r.bossSlot ? [r.bossSlot[2]] : [])) }));
        const keys = Array.from(new Set([].concat(...o.ledger.map((n) => n.slots.concat(n.boss)))));
        o.ledgerKeys = keys.map((k) => ({ k, known: !!ENEMY_TYPES[k], inHold: HT.indexOf(k) >= 0 }));
      } catch (e) { o.ledger = 'ERR ' + e.message; }
      o.rockTypes = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k] && ENEMY_TYPES[k].rockDice).sort();
      o.breathTypes = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k] && ENEMY_TYPES[k].breathDice).map((k) => ({ k, boss: !!ENEMY_TYPES[k].isBoss, el: ENEMY_TYPES[k].breathElement || null })).sort((a, b) => a.k < b.k ? -1 : 1);
      o.say = (new Function('return (' + TS + ')'))()(true);
      return o;
    }, NODE_SNAP.toString(), TRAP_SAY.toString(), HOLD_TYPES, GIANT);
    const N1 = await stage('n1', () => ip.evaluate(async (SNAP, TS, G) => {
      const H = window.__fh = { said: [] };
      const _dm = showDMMessage;
      showDMMessage = function (t) { H.said.push(String(t)); return _dm.apply(this, arguments); };
      const settle = { esc: 0, roll: 0, ms: 0, ok: false };
      { const t0 = performance.now(); let calmSince = null;
        while (performance.now() - t0 < 30000) {
          const ov = document.getElementById('skillCheckOverlay');
          if (ov && ov.classList.contains('show')) { const rb = document.getElementById('scRollBtn'); if (rb) rb.click(); ov.click(); settle.roll++; }
          if (document.querySelector('.exitArrow')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); settle.esc++; }
          const calm = !nodeBusy && !skillCheckActive && !dialogPaused && !document.querySelector('.exitArrow') && !encounterActive && !encounterRunning;
          if (!calm) calmSince = null; else if (calmSince === null) calmSince = performance.now(); else if (performance.now() - calmSince >= 1000) { settle.ok = true; break; }
          await new Promise((r) => setTimeout(r, 100));
        }
        settle.ms = Math.round(performance.now() - t0); }
      await enterNode('n1', 'right');
      for (const e of enemies) e.inactive = true;   /* ⭐ 戦闘を始めさせずに語りを待つ */
      H.hallAtEntry = (window.__frostHallProbe || []).length;
      H.rockAtEntry = window.__giantRockProbe.length; H.breathAtEntry = window.__coldBreathProbe.length;
      const o = (new Function('return (' + SNAP + ')'))()(G);
      { const t0 = performance.now(); while (!(window.__frostHallProbe || []).length && performance.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 100));
        H.hallMs = Math.round(performance.now() - t0); }
      await new Promise((r) => setTimeout(r, 2500));   /* 2 回目が来ないか */
      H.hall = (window.__frostHallProbe || []).map((x) => ({ node: x.node, encounter: x.encounter }));
      H.narrated = window.__frostHoldTV.hall().narrated;
      showDMMessage = _dm;
      dialogPaused = true;   /* ⭐ ゲームループを止める (① の直接呼びの間に戦闘が始まらない・② の前に戻す) */
      for (const e of enemies) e.inactive = false;
      o.say = (new Function('return (' + TS + ')'))()(false);
      o.settle = settle;
      o.H = JSON.parse(JSON.stringify(H));
      return o;
    }, NODE_SNAP.toString(), TRAP_SAY.toString(), GIANT), {});
    const D = await stage('direct', () => ip.evaluate(DIRECT, { GIANT, WOLF }), {});
    await ip.evaluate(() => { window.__giantRockProbe.length = 0; window.__coldBreathProbe.length = 0; dialogPaused = false; }).catch(() => {});
    const B = await stage('battle', () => battle(ip, BATTLE_TURNS), { started: false, S: { giant: [], wolf: [], other: {} } });
    await ip.close().catch(() => {});

    /* ══════════ (6a) + (4a) 既存シナリオ: BSET.rev と現在を同じ種で ══════════ */
    const sp = await newPage();
    const SPAWN = async (SEED) => {
      const o = {};
      o.scen = scenarioId; o.trapCount = currentScenario.trapCount;
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
    const probeBase = await runSpawn(mainIds[0] || 'goblin-mine', true, 1);
    const EXIST = (probeBase.keys || []).filter((k) => k !== FH);
    const ten = [];
    for (let i = 0; i < EXIST.length; i++) {
      const sid = EXIST[i], seed = 107000 + i * 7919;
      const b = await runSpawn(sid, true, seed);
      const c = await runSpawn(sid, false, seed);
      ten.push({ sid, base: b, cur: c });
    }
    await sp.close().catch(() => {});

    /* ── §0 ── */
    const led = Array.isArray(N0.ledger) ? N0.ledger : [];
    const l0 = led.find((n) => n.id === 'n0') || {}, l1 = led.find((n) => n.id === 'n1') || {};
    const n1E = (N1.enemies || []);
    const SE = N0.seams || {};
    R.check('(0a)', '[装置] __frostHoldTV (4 型・岩・息) / buildFrostHoldRun / coldBreath / giantRockThrow / giantRockReachable / coldBreathCenter / probe 3 本が見え、2 ノード (n0 start / n1 boss)・台帳の鍵 ⊆ ' + HOLD_TYPES.join('・') + '・n0 = オーク (1 体以上)・n1 = ' + GIANT + ' 1 + ' + WOLF + ' ' + HALL_WOLVES + ' (台帳と実体・X3)',
      SE.tv && J(SE.types) === J(HOLD_TYPES.slice().sort()) && SE.giantRock && SE.wolfBreath && SE.build === 'function' && SE.cb === 'function' && SE.rk === 'function'
        && SE.reach === 'function' && SE.center === 'function' && SE.rkProbe && SE.cbProbe && SE.hallProbe
        && N0.scen === FH && J(N0.nodes) === J(['n0:start', 'n1:boss']) && N0.cur === 'n0' && N1.cur === 'n1'
        && led.length === 2 && (l0.slots || []).length >= 1 && (l0.slots || []).every((k) => ORCS.indexOf(k) >= 0) && J(l0.boss) === J([])
        && J(l1.boss) === J([GIANT]) && (l1.slots || []).filter((k) => k === WOLF).length === HALL_WOLVES
        && (N0.ledgerKeys || []).every((x) => x.known && x.inHold)
        && (N0.enemies || []).length >= 1 && (N0.enemies || []).every((e) => ORCS.indexOf(e.type) >= 0)
        && n1E.filter((e) => e.type === GIANT).length === 1 && n1E.filter((e) => e.type === WOLF).length === HALL_WOLVES,
      { seams: SE, scen: N0.scen, nodes: N0.nodes, cur: [N0.cur, N1.cur], ledger: N0.ledger, n0: (N0.enemies || []).map((e) => e.type), n1: n1E.map((e) => e.type) });
    /* ── §2 ── */
    const p0 = (N0.paintings || [])[0] || {}, p1 = (N1.paintings || [])[0] || {};
    const g0 = (p0.src && p0.bakeTile) ? gridCheck(p0.src, p0.bakeTile) : { v: false, h: false, why: 'n0 に絵が無い' };
    const g1 = (p1.src && p1.bakeTile) ? gridCheck(p1.src, p1.bakeTile) : { v: false, h: false, why: 'n1 に絵が無い' };
    const a1g = (p1.src && p1.bakeTile && !g1.v) ? alignCheck(p1.src, p1.bakeTile) : null;
    R.check('(2a)', '焼き上がり 2 枚 (n0 / n1 に貼られた絵): n0 は make_grid_map.py --check の縦横 OK・n1 は横 OK + 縦は --check が OK か独立の物差し check_grid_alignment.py の縦が OK (⚠ 依頼書 §12-1 (3) の構造的な誤報・ユーザー判断待ち)',
      g0.v && g0.h && g1.h && (g1.v || (!!a1g && a1g.v)) && p0.src !== p1.src,
      { n0: [p0.src, p0.bakeTile, g0], n1: [p1.src, p1.bakeTile, g1], n1align: a1g });
    const gb = N1.giantBody || {};
    R.check('(2b)', '本番の aStar で n0 入口 → 出口の手前・各敵 / n1 入口 → 各敵 (巨人を含む) が通る・敵のタイルは全部歩ける・巨人の体のタイル (unitBodyTiles) は出発点で全部歩ける',
      typeof N0.pathToExit === 'number' && N0.pathToExit > 0 && (N0.pathToEnemies || []).length > 0 && N0.pathToEnemies.every((x) => typeof x === 'number')
        && (N1.pathToEnemies || []).length > 0 && N1.pathToEnemies.every((x) => typeof x === 'number')
        && (N0.enemyWall || ['?']).length === 0 && (N1.enemyWall || ['?']).length === 0 && Array.isArray(gb.tiles) && gb.tiles.length >= 1 && gb.wall === 0,
      { n0: { from: N0.player, exitInner: N0.exitInner, pathToExit: N0.pathToExit, toEnemies: N0.pathToEnemies, wall: N0.enemyWall },
        n1: { from: N1.player, toEnemies: N1.pathToEnemies, wall: N1.enemyWall, giantBody: gb } });
    const TT = (N0.say && N0.say.tt) || {};
    const avText = TT[N0_TRAP] && TT[N0_TRAP].dmText, iceText = TT[N1_TRAP] && TT[N1_TRAP].dmText;
    const s0 = N0.say || {}, s1 = N1.say || {};
    R.check('(2c)', '罠が n0 に 1 つ (' + N0_TRAP + ')・n1 に 1 つ (' + N1_TRAP + ')・踏むと語りが dmText (頭・仲間)・第 2 引数が優先',
      (N0.traps || []).length === 1 && N0.traps[0].type === N0_TRAP && (N1.traps || []).length === 1 && N1.traps[0].type === N1_TRAP
        && typeof avText === 'string' && typeof iceText === 'string' && avText !== iceText && s0.dmWrapped === true
        && s0.type === N0_TRAP && s1.type === N1_TRAP && J(s0.spawned) === J([avText]) && J(s1.spawned) === J([iceText])
        && J(s0.player) === J([avText]) && J(s0.ally) === J([avText]) && J(s0.arg) === J(['引数の語り(検証)']) && J(s1.player) === J([iceText]),
      { n0: N0.traps, n1: N1.traps, av: avText, ice: iceText, say0: { player: s0.player, ally: s0.ally, arg: s0.arg, spawned: s0.spawned }, say1: { player: s1.player, spawned: s1.spawned } });
    const area0 = (p0.tw || 0) * (p0.th || 0), area1 = (p1.tw || 0) * (p1.th || 0);
    const flags = N0.outdoorFlags || [];
    R.check('(2d)', '霧: n0 (雪の峠道) は outdoor (ROOM_PAINTINGS_DEF の n0big・屋外の開放が 1 部屋以上) / n1 (大広間) は屋内 (n1big に outdoor なし・屋外の開放 0・探索済み < 絵の範囲 = 暗幕が効く)・どちらも isCustom (テーマ ' + FH + ')',
      J(flags) === J([['n0big', true], ['n1big', false]]) && N0.custom && N0.themeId === FH && N1.custom && N1.themeId === FH && !!p0.loaded && !!p1.loaded
        && !!N0.outdoor && N0.outdoor.rooms >= 1 && !!N1.outdoor && N1.outdoor.rooms === 0 && N1.outdoor.exploredNow < area1 && area0 > 0,
      { flags, theme: [N0.themeId, N1.themeId], out0: N0.outdoor && { rooms: N0.outdoor.rooms, explored: N0.outdoor.exploredNow, area: area0 },
        out1: N1.outdoor && { rooms: N1.outdoor.rooms, explored: N1.outdoor.exploredNow, area: area1 } });

    /* ── §3 ── */
    const DR = D || {};
    const DF = N0.defs || { giant: {}, wolf: {} };
    const rocks = DR.rock || [];
    const rockOk = (c) => {
      const r = (c.add || [])[0];
      if (!r || c.add.length !== 1 || r.site !== 'rock' || c.ret !== true || c.err) return false;
      if (r.kind !== c.far.kind || r.idx !== c.far.idx || r.ac !== c.far.ac) return false;
      const nat = c.rolls[0];
      const fumble = nat === 1, threat = nat >= 20 && !fumble;
      const wantHit = !fumble && (threat || nat + 9 >= r.ac);
      const wantCrit = wantHit && threat && c.rolls[1] + 9 >= r.ac;
      if (r.roll !== nat || r.atk !== 9 || r.total !== nat + 9 || r.hit !== wantHit || r.crit !== wantCrit || r.fumble !== fumble) return false;
      if (c.calls !== (threat && wantHit ? 2 : 1)) return false;
      const drop = c.drops.find((d) => d.kind === r.kind && d.idx === r.idx);
      const others = c.drops.filter((d) => !(d.kind === r.kind && d.idx === r.idx));
      if (others.some((d) => d.drop !== 0)) return false;
      if (!r.hit) return r.dmg === 0 && drop.drop === 0;
      const times = r.crit ? GIANT_X3.critMult : 1;
      if (r.rolls.length !== ROCK.n * times || r.rolls.some((x) => x < 1 || x > ROCK.sides)) return false;
      if (r.dmg !== r.rolls.reduce((a, b) => a + b, 0) + ROCK.bonus * times) return false;
      if (!r.crit && (r.dmg < ROCK.n + ROCK.bonus || r.dmg > ROCK.n * ROCK.sides + ROCK.bonus)) return false;
      return drop.drop === r.dmg;
    };
    const BS = (B && B.S) || { giant: [], wolf: [], other: {} };
    const gTurns = BS.giant || [];
    const bRocks = [].concat(...gTurns.map((t) => (t.rk || []).filter((x) => x.site === 'rock')));
    const bRockOk = (r) => r.dists.every((d) => d.dist <= r.dist + 1e-6) && (!r.hit || r.crit || (r.dmg >= ROCK.n + ROCK.bonus && r.dmg <= ROCK.n * ROCK.sides + ROCK.bonus))
      && (!r.hit || r.dmg === r.rolls.reduce((a, b) => a + b, 0) + ROCK.bonus * (r.crit ? GIANT_X3.critMult : 1));
    R.check('(3a)', '岩: 型の値 = rockDice 4d10・rockBonus 6・atkBonus 9・critMult 2 (X3) + 大斧の X3 = hp 104・2d12+6・attacksPerTurn 1・AC 15 / ① 届かない盤面で 5 通りの d20 (命中 / 外れ / 1 = ファンブル / 20 + 確認 = クリティカル (critMult 2) / 20 + 確認失敗) — 狙い = いちばん遠い隊員 (自前の距離)・AC = その隊員の AC・d20+9 の式・確認の d20 は脅威で命中のときだけ・4d10+6 (10〜46)・その隊員の HP だけがその分減る / ② 戦闘で岩 1 回以上・狙いは probe の dists の最遠',
      DF.giant.rockDice === ROCK.n + 'd' + ROCK.sides && DF.giant.rockBonus === ROCK.bonus && DF.giant.atkBonus === 9 && DF.giant.critMult === GIANT_X3.critMult
        && DF.giant.hp === GIANT_X3.hp && DF.giant.dmgDice === GIANT_X3.dmgDice && DF.giant.dmgBonus === GIANT_X3.dmgBonus
        && DF.giant.attacksPerTurn === GIANT_X3.attacksPerTurn && DF.giant.ac === GIANT_X3.ac
        && rocks.length === 5 && rocks.every(rockOk) && rocks.some((c) => (c.add[0] || {}).crit === true) && rocks.some((c) => (c.add[0] || {}).hit === false)
        && rocks.every((c) => c.far.kind !== c.near.kind || c.far.idx !== c.near.idx)
        && bRocks.length >= 1 && bRocks.every(bRockOk),
      { def: DF.giant, direct: rocks.map((c) => ({ label: c.label, rolls: c.rolls, calls: c.calls, far: c.far, near: c.near, rec: c.add[0] && { kind: c.add[0].kind, idx: c.add[0].idx, roll: c.add[0].roll, total: c.add[0].total, ac: c.add[0].ac, hit: c.add[0].hit, crit: c.add[0].crit, n: (c.add[0].rolls || []).length, dmg: c.add[0].dmg },
          drops: c.drops, ok: rockOk(c), err: c.err })), battle: bRocks.map((r) => ({ kind: r.kind, dist: Math.round(r.dist), hit: r.hit, crit: r.crit, dmg: r.dmg, ok: bRockOk(r) })), errs: DR.err });
    /* ② の巨人の手番の規則: 冷却中 → skip cooldown (cd 1 → 0) / それ以外は岩 (cd → 1) か skip reach。岩の次の手番は必ず冷却 */
    const ruleRows = gTurns.map((t, i) => {
      const k = (t.rk || []).map((x) => x.site + (x.reason ? ':' + x.reason : ''));
      const prevRock = i > 0 && (gTurns[i - 1].rk || []).some((x) => x.site === 'rock');
      let ok = k.length === 1;
      if (ok && t.cd0 > 0) ok = k[0] === 'skip:cooldown' && t.cd1 === t.cd0 - 1;
      else if (ok) ok = (k[0] === 'rock' && t.cd1 === 1) || (k[0] === 'skip:reach' && t.cd1 === 0);
      if (prevRock) ok = ok && k[0] === 'skip:cooldown';
      return { n: t.n, cd0: t.cd0, cd1: t.cd1, k, ok };
    });
    const RC = DR.reach || {};
    R.check('(3b)', '① 届く盤面 (巨人が頭の隣) で投げない (false・probe skip reach・d20 を振らない・HP 不変・冷却 0)・届かない盤面で投げた後は rockCooldown = 1 / ② 戦闘の巨人の手番 ' + BATTLE_TURNS + ' 回: 冷却中は skip cooldown・岩の次の手番は必ず冷却・岩は冷却 0 のときだけ',
      RC.ret === false && !RC.err && RC.calls === 0 && (RC.add || []).length === 1 && RC.add[0].site === 'skip' && RC.add[0].reason === 'reach' && RC.hpDrop === 0 && RC.cooldownAfter === 0
        && (RC.inReach || []).length >= 1 && rocks.length === 5 && rocks.every((c) => c.cooldownAfter === 1)
        && B && B.started && gTurns.length >= BATTLE_TURNS && ruleRows.every((r) => r.ok) && ruleRows.some((r) => r.k[0] === 'skip:cooldown'),
      { reach: RC, cooldownAfter: rocks.map((c) => c.cooldownAfter), battle: { started: B && B.started, encIdx: B && B.encIdx, rows: ruleRows, diag: B && B.diag } });
    const SQ = DR.seq || { turns: [] };
    const wolfTurns = BS.wolf || [];
    R.check('(3c)', 'rockDice を持つ型 = ' + GIANT + ' だけ・冬狼の手番 (① 6 手番 / ② 戦闘) とその他の手番で岩の probe が増えない・写したボスの def (rockDice を外した巨人) の手番でも増えない',
      J(N0.rockTypes) === J([GIANT]) && SQ.turns.length === 6 && SQ.turns.every((t) => t.rockAdd === 0)
        && wolfTurns.length >= 1 && wolfTurns.every((t) => t.rkN === 0) && ((BS.other || {}).rockAdd || 0) === 0
        && !!DR.boss && DR.boss.rockAdd === 0,
      { rockTypes: N0.rockTypes, seqRock: SQ.turns.map((t) => t.rockAdd), battleWolf: wolfTurns.map((t) => t.rkN), other: BS.other, bossClone: DR.boss && DR.boss.rockAdd });
    const IM = DR.immune || {};
    R.check('(3d)', '冷気の完全耐性: resolveElementDefense の冷気 20 → 0 (immune)・炎 20 → 20 (巨人・冬狼とも)',
      !!IM.giantCold && IM.giantCold.immune === true && IM.giantCold.dmg === 0 && IM.wolfCold && IM.wolfCold.immune === true && IM.wolfCold.dmg === 0
        && IM.giantFire && IM.giantFire.dmg === 20 && IM.wolfFire && IM.wolfFire.dmg === 20, IM);
    const brs = DR.breath || [];
    const breathOk = (c, wantSaved) => {
      const r = (c.add || []).find((x) => x.site === 'breath');
      if (!r || c.ret !== true || c.err || r.dc !== BREATH.dc || r.dice !== BREATH.n + 'd' + BREATH.sides || r.reflected) return false;
      if (Math.max(Math.abs(r.center[0] - r.from[0]), Math.abs(r.center[1] - r.from[1])) > 2) return false;
      if (r.hits.length < 1 || r.hitCount !== r.hits.length || c.calls !== r.hits.length) return false;
      if (J(r.hits.map((h) => h.kind + ':' + h.idx).sort()) !== J((c.inBox || []).slice().sort())) return false;
      for (const h of r.hits) {
        if (h.roll !== c.roll || h.saved !== (h.total >= BREATH.dc) || h.saved !== wantSaved) return false;
        if (h.raw < BREATH.n || h.raw > BREATH.n * BREATH.sides) return false;
        if (h.dmg !== (h.saved ? Math.max(1, Math.floor(h.raw / 2)) : h.raw)) return false;
        const d = c.drops.find((x) => x.k === h.kind + ':' + h.idx);
        if (!d || d.drop !== h.dmg) return false;
      }
      if (c.drops.filter((d) => r.hits.every((h) => h.kind + ':' + h.idx !== d.k)).some((d) => d.drop !== 0)) return false;
      return r.savedCount === (wantSaved ? r.hits.length : 0) && c.spentAfter === true;
    };
    const bBreaths = [].concat(...wolfTurns.map((t) => (t.cb || []).filter((x) => x.site === 'breath')));
    const bBreathOk = (r) => r.dc === BREATH.dc && r.hits.every((h) => h.raw >= BREATH.n && h.raw <= BREATH.n * BREATH.sides && h.saved === (h.total >= BREATH.dc)
      && h.dmg === (h.saved ? Math.max(1, Math.floor(h.raw / 2)) : h.raw));
    const fCase = brs.find((c) => c.label === 'fail'), sCase = brs.find((c) => c.label === 'save');
    R.check('(3e)', '冷気の息: 冬狼の型の値 = breathDice 4d8・DC 12・3x3・cold・ボスでない / ① d20 = 2 (失敗) / 19 (成功) — DC 12・4d8 (4〜32)・3x3 (中心は冬狼から 2 マス以内) の中の隊員全員 (自前で数える) に 1 回ずつセーヴ・成功で半減 (切り捨て・最低 1)・HP がちょうど dmg 減り外の隊員は減らない・使用済みになる / ② 戦闘の息も同じ式',
      DF.wolf.breathDice === BREATH.n + 'd' + BREATH.sides && DF.wolf.breathDC === BREATH.dc && DF.wolf.breathBlast === 3 && DF.wolf.breathElement === 'cold' && DF.wolf.isBoss === false
        && !!fCase && !!sCase && breathOk(fCase, false) && breathOk(sCase, true) && bBreaths.every(bBreathOk),
      { def: DF.wolf, fail: fCase && { calls: fCase.calls, inBox: fCase.inBox, rec: (fCase.add || []).find((x) => x.site === 'breath'), drops: fCase.drops, ok: breathOk(fCase, false), err: fCase.err },
        save: sCase && { calls: sCase.calls, inBox: sCase.inBox, rec: (sCase.add || []).find((x) => x.site === 'breath'), drops: sCase.drops, ok: breathOk(sCase, true), err: sCase.err },
        battle: bBreaths.map((r) => ({ n: r.hitCount, s: r.savedCount, h: r.hits.map((h) => h.raw + '>' + h.dmg + (h.saved ? 's' : '')), ok: bBreathOk(r) })) });
    /* ① 6 手番の期待 (1d6 = 2,4,5,6,3) と ② の状態機械 */
    const SEQ_WANT = [['breath'], ['recharge:2:no', 'bite:spent'], ['recharge:4:no', 'bite:spent'], ['recharge:5:ready', 'breath'], ['recharge:6:ready', 'breath'], ['recharge:3:no', 'bite:spent']];
    const seqOk = SQ.turns.length === 6 && SQ.turns.every((t, i) => J(t.add) === J(SEQ_WANT[i]) && !t.err) && SQ.d6used === 5;
    const machine = {};
    const machineRows = wolfTurns.map((t) => {
      const st = machine[t.idx] || (machine[t.idx] = { spent: false });
      const k = (t.cb || []).map((x) => x.site + (x.reason ? ':' + x.reason : ''));
      let ok = true, i = 0;
      if (st.spent) {
        const r = (t.cb || [])[0];
        ok = !!r && r.site === 'recharge' && r.ready === (r.d6 >= 5) && r.d6 >= 1 && r.d6 <= 6;
        if (ok && r.ready) st.spent = false;
        i = 1;
      }
      const rest = k.slice(i);
      if (ok) {
        if (st.spent) ok = J(rest) === J(['bite:spent']);
        else { ok = rest.length === 1 && (rest[0] === 'breath' || rest[0] === 'bite:empty'); if (rest[0] === 'breath') st.spent = true; }
      }
      return { idx: t.idx, k, ok };
    });
    R.check('(3f)', 'Recharge 5-6: ① 本番の enemyAttackTurn を 6 手番 (1d6 = 2,4,5,6,3) — 1 手番目は吐く / 使用済みの間は手番の頭で 1d6 を 1 回・2 / 4 は戻らず噛む・5 / 6 は戻ってその手番に吐く / ② 戦闘の冬狼ごとの手番が同じ状態機械に乗る',
      seqOk && wolfTurns.length >= 2 && machineRows.every((r) => r.ok),
      { seq: SQ.turns.map((t) => ({ t: t.t, add: t.add, err: t.err })), d6used: SQ.d6used, battle: machineRows });
    const EM = DR.empty || {};
    R.check('(3g)', '3x3 に隊員が居ない盤面 (冬狼が隊から 10 マス) で吐かない: false・probe bite empty (中心は寄せた 2 マス)・セーヴの d20 を振らない・使用済みにならない・HP 不変',
      EM.ret === false && !EM.err && EM.calls === 0 && (EM.add || []).length === 1 && EM.add[0].site === 'bite' && EM.add[0].reason === 'empty' && EM.add[0].clamped === true
        && EM.spentAfter === false && EM.hpDrop === 0, EM);
    const curIndex = servedFile(F_INDEX, mutKey);
    const fireRows = FIRE_FNS.map((n) => { const a = fnSource(BSET.index, n), b = fnSource(curIndex, n); return { n, base: a ? a.length : null, cur: b ? b.length : null, same: !!a && a === b }; });
    const btypes = N0.breathTypes || [];
    const BO = DR.boss || {};
    R.check('(3h)', '⭐ 火のブレスの非退行: ' + FIRE_FNS.join(' / ') + ' のソースが ' + BSET.rev + ' と同じ・breathDice を持つボス = ' + FIRE_BOSSES.join(' / ') + ' (breathElement なし)・ボスでない息持ちは ' + NONBOSS_BREATH.join(' / ') + ' の 2 体 (冷気は ' + WOLF + ' だけ)・① 巨人の def を写して breathDice / breathElement "cold" を持たせても enemyAttackTurn で冷気の息の分岐を通らない (probe 0・__wolfTurn なし)・② 戦闘の巨人の手番で冷気の probe 0',
      fireRows.every((r) => r.same && r.cur > 200)
        && J(btypes.filter((x) => x.boss).map((x) => x.k)) === J(FIRE_BOSSES) && btypes.filter((x) => x.boss).every((x) => x.el === null)
        && J(btypes.filter((x) => !x.boss).map((x) => x.k + ':' + x.el)) === J(NONBOSS_BREATH)   /* ★[#111] 冷気は冬狼だけのまま・火の非ボスが 1 体増えた */
        && !!BO.isBoss && !BO.err && (BO.coldAdd || ['?']).length === 0 && BO.wolfTurn === null && BO.fire === 0
        && gTurns.length >= 1 && gTurns.every((t) => t.cbN === 0),
      { src: fireRows, breathTypes: btypes, bossClone: BO, battleGiantCold: gTurns.map((t) => t.cbN) });
    const CS = DR.cs || {};
    R.check('(3i)', '冷気の息はカウンタースペルに掛からない: ① 2 回の息の間に tryCounterEnemySpell / counterspellWanted / findCounterspeller が 1 度も呼ばれず、息は着弾 (反射でもない)',
      !!CS.calls && CS.calls.t === 0 && CS.calls.w === 0 && CS.calls.f === 0 && !!fCase && !!sCase
        && [fCase, sCase].every((c) => { const r = (c.add || []).find((x) => x.site === 'breath'); return !!r && r.hitCount >= 1 && r.reflected === false; }), { cs: CS, wrappedBack: DR.wrappedBack });
    /* ── §4 ── */
    const paras = (NARR && NARR.paras) || [];
    const seenAll = paras.length === 4 && paras.every((p) => (NARR.seen || []).some((t) => t.replace(/\s+/g, '') === p.replace(/\s+/g, '')));
    const H = N1.H || {};
    const dragonSaid = (H.said || []).filter((t) => /赤い竜/.test(t));
    const existOk = ten.length > 0 && ten.some((x) => (x.base.said || []).length > 0)
      && ten.every((x) => J(x.base.said) === J(x.cur.said) && (x.cur.said || []).every((t) => t !== avText && t !== iceText));
    R.check('(4a)', '開幕の語り 4 行が #dmBody に出る・大広間の語りは n1 で 1 回だけ (入場の時点では 0・赤い竜の一言・2.5 秒待っても 1 回・戦闘の後も 1 回)・既存 ' + ten.length + ' シナリオの罠の語りは ' + BSET.rev + ' と同じ',
      !!NARR && NARR.scen === FH && seenAll && H.hallAtEntry === 0 && (H.hall || []).length === 1 && H.hall[0].node === 'n1' && H.narrated === true
        && dragonSaid.length === 1 && !!B && B.hall === 1 && existOk,
      { narr: NARR && { scen: NARR.scen, paras: paras.length, seen: (NARR.seen || []).length, all: seenAll }, hall: H.hall, hallMs: H.hallMs, dragon: dragonSaid, afterBattle: B && B.hall,
        exist: ten.map((x) => ({ sid: x.sid, same: J(x.base.said) === J(x.cur.said) })) });
    /* ── §6 ── */
    const tenRows = ten.map((x) => ({ sid: x.sid, traps: x.cur.traps.length, same: J(x.base.traps) === J(x.cur.traps), calls: [x.base.calls, x.cur.calls], next: x.base.next === x.cur.next }));
    R.check('(6a)', '既存 ' + ten.length + ' シナリオ (' + BSET.rev + ' の SCENARIOS) で、同じ種の乱数のもと spawnTraps の罠 (座標・種類)・乱数の呼び出し回数・次の乱数が ' + BSET.rev + ' と同じ',
      ten.length === 11 && EXIST.indexOf(FH) < 0 && ten.some((x) => x.cur.traps.length > 0)
        && ten.every((x) => J(x.base.traps) === J(x.cur.traps) && x.base.calls === x.cur.calls && x.base.next === x.cur.next),
      { exist: EXIST, rows: tenRows });
    /* ★[#110] (6b) は関数ごとの基準の版 (KEEP_BASE[n] || BSET.rev) と比べる。版ごとの index.html は gitShowAt のキャッシュで 1 回だけ */
    const keepRows = KEEP_FNS.map((n) => {
      const rev = BSET.keepRev(n), src = BSET.keepIndex(n);
      const a = src === null ? null : fnSource(src, n), b = fnSource(curIndex, n);
      return { n, rev, base: a ? a.length : null, cur: b ? b.length : null, same: !!a && a === b };
    });
    R.check('(6b)', '触らない約束の関数 (' + KEEP_FNS.join(' / ') + ') のソースがそれぞれの基準の版と同じ (既定 ' + BSET.rev
      + (Object.keys(BSET.keepBase).length ? '・' + Object.keys(BSET.keepBase).map((n) => n + ' だけ ' + BSET.keepBase[n]).join('・') : '') + ')',
      keepRows.every((r) => r.same && r.cur > 100),
      '関数 / 基準の版 / 長さ (基準→今) / 同じ: ' + keepRows.map((r) => r.n + ' / ' + r.rev + ' / ' + r.base + '→' + r.cur + ' / ' + (r.same ? '同' : '✗違')).join(' ; '));
    const kb = keepBaseFacts();
    R.check('(0e)', '[装置] KEEP_BASE の各版が実在し (git show 成功)・その版から関数を切り出せ・KEEP_FNS に居る・defeatEnemy の版 ('
      + (KEEP_BASE.defeatEnemy || '?') + ') の defeatEnemy が markHiddenFoeSlain を含む',
      kb.length > 0 && kb.every((r) => r.shown && r.inKeep && r.len > 100) && kb.some((r) => r.n === 'defeatEnemy' && r.mark),
      kb);
    /* ══════════ (0c) ══════════ */
    R.check('(0c)', '[装置] 全ページで pageerror 0 件 (段の例外は記録だけ: 例外の出た段の節が赤になる)', ctx.booted > 0 && ctx.errs.length === 0,
      '起動 ' + ctx.booted + ' 回 / pageerror ' + J(ctx.errs.slice(0, 3)) + ' / 段の例外 ' + J(STAGE_ERRS) + ' / 直接呼びの例外 ' + J((D || {}).err || null));
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
  const profile = require('./_pptr_profile')('df_verify_frost_hold_');
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
          const port = mutPort(key);
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
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(15) + ' 担当 ' + r.want.join(',') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '')
          + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 注入行 ' + r.hit + ' 回');
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = mutPort(MUTATE);
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
