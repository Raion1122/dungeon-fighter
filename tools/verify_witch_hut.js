#!/usr/bin/env node
/*
 * verify_witch_hut.js — 実装依頼書 #106「霧の中の魔女の小屋」の受入ドライバ
 *   (依頼書 実装依頼書/2026-11-01_witch-hut.md §8 = 受入条件の唯一の正。型 = tools/verify_silent_tomb.js)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_witch_hut.js                          # 素
 *   node tools/verify_witch_hut.js --negative               # 先に素の基準 → 変異 12 本 (port 10678〜10689)
 *   node tools/verify_witch_hut.js --negative --only passiveearly,fightlast
 *   node tools/verify_witch_hut.js --mutate nosite          # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome / git が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 登録の整合は**ブラウザに載った実体どうし**で突き合わせる (tavern.html の scenarios と同じページの WORLD_MAP、
 *     world.html の WORLD_MAP と DOM の札)。⛔ 写経しない。ドライバが持つ固定値は依頼書が決めた名前
 *     (id "witch-hut" / 拠点 "lakeside" / 港町 "phlan" / 廃坑の拠点 "mine" / 神殿の拠点 "temple" / 罠の種類 "thorn" "hex" /
 *     ボスの型 "greenHag" / 隊列の帯 = 依頼書 §2-7 の PARTY_ZONES の表)・§12-1 (3) の MASK が決めた大鍋の矩形・
 *     地図の sha1 の固定値 (既に焼かれた値)・ユーザー判断 (a) の「札に覆われてよい点」の組 (temple ← lakeside) だけ。
 *     place (札の文言) は配信バイトの id → place の並びから読む。
 *   - 霧渡りは 3 つの経路で見る:
 *       ① 全自動 (?autoplay=1) の戦う道を本番の runEncounter で回す ((3a)(4d)(4f))。頭と仲間の手番だけ差し替え
 *         (n0 = 最初の手番で本番の defeatEnemy で全員を倒す → 本番の出口の流れで n1 へ / n1 = ハグの手番が規定数来たら倒す)。
 *       ② ?diag=1 のページで n1 に入り 2 択 (戦う) の直後にゲームループを止め (dialogPaused)、hagMistPassage を直接呼ぶ
 *         ((3b)(3c)(3d)。d20 / Math.random を呼び出しの間だけ差し替え・隊員を倒れたことにして帯を作り替える)。
 *       ③ ②のページで戦闘を回し、ハグの最初の手番だけ隊員の隣 8 マスを isTileWall で塞ぐ ((3e) 移動先が無い盤面)。
 *     (3f) の「他のボス」は巣穴の族長・倉庫街の司祭・墓所のマミーで 1 戦闘ずつ。
 *   - 経路は本番の aStar (⛔ 自前の BFS を書かない)。焼き上がりの検算は本番の道具 make_grid_map.py --check。
 *   - (6a) は git BASE_REV (= #106 項目2 の前の commit) の index.html を同じ origin で配り (?__base=1)、
 *     同じ種の乱数で spawnTraps を 1 回だけ回して、罠の座標・種類・Math.random の呼び出し回数・その次の乱数を比べる。
 *   - (6b) は写し元の関数 (沼の若い司祭の 2 択の器・showCharChoice・シャドウステップ・傷を腐らせる手・クリア判定) の
 *     ソースを BASE_REV と現在で突き合わせる (⭐ verify_swamp_novice は (4b) が項目4 の言い直し待ちで赤 = 代わりに写し元の不変を縛る)。
 *   - 強さ (⑤) は assert にしない (別の道具で記録する。依頼書 §12-3 用)。
 *
 * ■ 依頼書 §8 からの言い直し (実装と項目1・2 の実測に合わせた点)
 *   - pageerror 0 は (0d) に分けた。
 *   - (0c) は 2 経路: ?diag=1 のページ (n1 の入場直後・2 択までの 50ms ごとの全観測・2 択が呼ばれた瞬間) と
 *     ?autoplay=1 のページ (本番の出口の流れで n1 へ入った直後・2 択までの全観測)。
 *   - (1f) ⭐ ユーザー判断 (a) 2026-11-02: lakeside の札は signDx 160 のまま **地下神殿の停留所の点 (temple) を覆ってよい**。
 *     ⇒ ① cleared=[廃坑, 森, 沼地] の world.html (1440x900 / 390x844 × 立ち位置 5) で: 札どうしの交わり 0・札と刻み点マーカーの
 *     矩形の交わり 0・マーカーの中心を奪わない・停留所の点を奪うのは temple だけ。
 *     ② 本筋 6 本クリアの世界 (神殿の札が出る) で: 札が temple の点を覆うかを**事実として記録** (覆ってよい・合否に使わない)、
 *     他の点は奪わない、**神殿の札の中心は神殿の拠点の子孫** (lakeside に立って 1440 / 390)、1440 で title 起点から
 *     神殿の札を押し続けると lakeside を通って神殿へ着く (⚠ 立ち位置 roadReturn は ?ambush=0 だと読まれない = 押す腕は title 起点)。
 *     ⭐ cleared=[廃坑, 森, 沼地] の世界でも temple の点 (未解放 = 札なしの点) は lakeside の札の下に在る (実測) = 同じ組で許す。
 *   - (1g) は 3 本の腕 (verify_silent_tomb と同じ): ① 受注 = 魔女の小屋のまま廃坑を押して歩く → lakeside を通っても開かず
 *     廃坑でも開かない → lakeside を押して戻ると魔女の小屋の入場が開く / ② 受注 = 廃坑なら lakeside を通っても開かず廃坑で開く。
 *   - (2b) に「大鍋 (MASK 絵ローカル col 16-18 / row 5-10) は全部壁」を足した (⭐ 依頼書 §5-1 (3) の「大鍋は #」)。
 *   - (3b) は「狙いと移動先を決めるのに Math.random を使わない」も縛る: 各帯で Math.random を 0 固定と 0.999 固定の
 *     2 回呼び、どちらも同じ (期待どおりの) 狙いになること (変異 passagerng)。
 *   - (3d) の「例外」は spawnShadowPuff の 2 回目 (移動先で霧) を投げさせて作る。
 *   - (4c) は 5 段の撤退の各段の後を固定値で縛る: retireHag() 後 = 6213fcb (#105 完了) の既定の地図 /
 *     +retireTomb() = #104 / +retireCargo() = #103 / +retireWarren() = #82 / +retireTower() = 塔の母の前。
 *   - (4d) の N (2 択が開くまでの上限) は装置の上限 (項目3 の実測 = 依頼書 §12-3)。
 *   - (4e) の 2 経路 = probe の scaledXp / scaledGold と、gainXP の「クリア報酬」・localStorage の gold / xp の増分
 *     (gold の増分 − 道中の coins − 宝箱の補填 = 礼金 0 / 戦う道は 250 = (4f))。
 *   - 負のコントロールに signclash を足した (依頼書の 11 本 + 1 = 12 本・ポート 10678〜10689)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] __witchHutTV / buildWitchHutRun / hagMistPassage / pickHagPassageTile が見え、2 ノード (n0 start / n1 boss) の
 *           台帳と実体の敵が 0 体でない・n1 のボスはハグ 1
 *      (0b) [装置] __hagPassageProbe / __hagChoiceProbe が配列で在り、発動前 (n0・n1 の入場直後) は 0 件
 *      (0c) ⭐ n1 に入った直後 (2 択の前) ハグと手下が全員 inactive かつ passiveNpc が偽・未制覇 (2 経路)
 *      (0d) [装置] 全ページで pageerror 0 件
 *   §1 (1a) tavern の witch-hut (配信バイトの id → place・side・locked・unlockAfter) と同じページの SITES / UNLOCK / NODES.lakeside、
 *           world.html の SITES / UNLOCK と DOM の札 (文言 = place) が一致
 *      (1b) side・ALL_MAIN_SCENARIOS に無い・本筋 6 本 (と +本筋外) クリアで frontier が null
 *      (1c) cleared=[] / [廃坑] / [廃坑, 森] の解放済みは ?hag=0 と同じ・魔女の小屋は入らない・lakeside は中継点の見た目
 *      (1d) cleared=[廃坑, 森, 沼地] → 解放済みに魔女の小屋 (と砦) が入る (= ?hag=0 + 魔女の小屋)・world.html の lakeside に札
 *      (1e) findWalkPath("phlan", "lakeside") が null でなく lakeside で終わる
 *      (1f) 上の言い直し (札 × 他の札 / 刻み点マーカー / 停留所の点・神殿の札を押せば神殿へ)
 *      (1g) 通過では開かない / 押して着くと開く
 *   §2 (2a) 焼き上がり 2 枚が make_grid_map.py --check の縦横 3 指標で OK
 *      (2b) 本番の aStar で n0 入口 → 出口の手前・各敵 / n1 入口 → ハグ・各敵が通る・敵のタイルは歩ける・大鍋 18 マスは壁
 *      (2c) 罠は n0 に 1 つ (thorn)・n1 に 1 つ (hex)・湧いた罠を踏むと語りが dmText・n0 に宝箱 (?roadchest=0)
 *      (2d) 2 枚とも outdoor が付いていない (ROOM_PAINTINGS_DEF と実体の屋外の開放 0・探索済み < 絵の範囲 = 暗幕が効く)
 *   §3 (3a) 戦う道 (全自動) でハグの最初の手番に probe 1 件 (pickBossAction の前)・2 手番目以降は増えない・__passageUsed
 *      (3b) 狙い = rear → mid → front の最初の帯の、ハグから一番遠い 1 人 (3 編成 × Math.random 2 通り・probe と実体の 2 経路)・
 *           移動先は狙った相手の隣 8 マスで歩けて空いている (isTileWall / 本番の aStar / getUnitOccupiedTiles と自前の占有)
 *      (3c) 有利: rolls が 2 つで roll = max(rolls) (d20 を差し替えて高い方を 1 回目にも 2 回目にも)・命中で HP が dmg 減る・外れで減らない
 *      (3d) 発動の後ハグの透明度が元に戻る (spawnShadowPuff が投げた回でも)
 *      (3e) 移動先が無い盤面 (隊員の隣 8 マスを塞ぐ) で fellBack: true・座標は動かず・その手番に普通の行動 (pickBossAction)
 *      (3f) mistPassage を持つ型 = greenHag だけ / 手下・巣穴の族長・倉庫街の司祭・墓所のマミーの手番で probe が増えない /
 *           霧渡りの手番で traps.length が変わらない
 *   §4 (4a) 開幕の語り 4 行・n0 = 茨 / n1 = 呪いの人形の語り (頭・仲間)・第 2 引数が優先・既存 10 シナリオは BASE_REV と同じ語り
 *      (4b) ?hag=0 で tavern の配列から消え・lakeside が中継点・cleared=[廃坑, 森, 沼地] の解放済みが −1・(1a)(1d) が反転
 *      (4c) 5 段の撤退の各段の地図の sha1 が既存の固定値
 *      (4d) ⭐ ?autoplay=1 で n1 に入ると 2 択が入場から N 秒以内に 1 回だけ開き (先頭 = 戦う・probe choice 0・autoplay)、
 *           ハグと手下の inactive が外れ、戦闘が始まる。2 択の前に制覇しない
 *      (4e) ⭐ 取り引きの道: 制覇・ハグは生きたまま passiveNpc・礼金が入らない・クリア XP は半分・SCENARIOS の表は不変
 *      (4f) 戦う道の勝利で礼金 (SCENARIOS の clearGold) とクリア XP が今日どおり入る
 *   §6 (6a) 既存 10 シナリオで spawnTraps の罠 (座標・種類)・乱数の呼び出し回数・次の乱数が BASE_REV と同じ
 *      (6b) 写し元の関数のソースが BASE_REV と同じ (沼の若い司祭の 2 択の器ほか)
 *   ⛔ 測らないこと (依頼書 §8): ハグの displaySize・語りの文面の良し悪し・バナーの絵文字・クリアの XP と金貨の値そのもの
 *      (取り引きの「0 / 半分」の関係だけ)・霧渡りの移動先のタイルの位置 (条件だけ)・札の位置の px・2 択が開くまでの秒数。
 *      ⑤ 強さは記録のみ (r106/item3/probe_hag_clear.js)。
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
 *   - ⭐ #105 の揺れ (n0 の出口の矢印が n1 へ持ち越す) を踏まないため、?diag=1 のページは n0 の敵を倒さずに
 *     落ち着き (判定パネル・矢印・nodeBusy・dialogPaused が 1 秒下りたまま) を待ってから enterNode('n1') を呼ぶ。
 *     全自動のページは本番の出口の流れ (tickNodeChoice → chooseExit → enterNode) で n1 へ入る (直接呼ばない)。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10677** (素) / 変異 **10678〜10689** (12 本・MUTATIONS の並び順)。次の新規ドライバ base = 10690。
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
const PORT = parseInt(arg('port', '10677'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前 (データ。期待値の写しではない) */
const WH = 'witch-hut';
const WH_SITE = 'lakeside';
const PORT_TOWN = 'phlan';           // 港町フラン (js/world-map.js の NODES.phlan)
const MINE_SITE = 'mine';            // 廃坑の拠点 ((1g) で lakeside を通り抜けて向かう先)
const TEMPLE_SITE = 'temple';        // 地下神殿の拠点 ((1f) ユーザー判断 (a) で lakeside の札に覆われてよい点)
const COVER_OK = { temple: WH_SITE };   // ⭐ ユーザー判断 (a) 2026-11-02: 覆われてよい点 → 覆う札の持ち主 (この組だけ)
const WARREN = 'kobold-warren', CARGO = 'lost-cargo', TOMB = 'silent-tomb';   // (3f) の「他のボス」の依頼
const HAG = 'greenHag', CHIEF = 'koboldChief', PRIEST = 'plaguePriest', MUMMY = 'mummy';
const HUT_TYPES = ['rat', 'zombie', HAG];   // 魔女の小屋の台帳に載ってよい鍵 (依頼書 §5-6)
const N0_TRAP = 'thorn', N1_TRAP = 'hex';
const STEP_GUARD = 'lakeside__mine@1';   // (1f) 札の真下の刻み点 (依頼書 §2-2・母集団ガード)
const BASE_REV = '5651eb6';          // #106 項目1 (index.html は項目2 の前 = 着手前。6213fcb と本番ファイルの差 0)
/* 隊列の帯 (依頼書 §2-7 の実測 = PARTY_ZONES)。⛔ 本番の表は読まない (実体の隊員の classKey から自分で引く = 2 経路目) */
const ZONE_OF = { warrior: 'front', dwarf: 'front', rogue: 'mid', elf: 'mid', cleric: 'mid', mage: 'rear' };
/* 大鍋 (MASK §12-1 (3) の 絵ローカル col 16-18 / row 5-10 = 炉の石組みの芯) を global (+16, +6) へ */
const CAUL = { c1: 32, c2: 34, r1: 11, r2: 16 };
/* (4c) 撤退の各段の地図の sha1 (先頭 16)。
 *   1 段目 = 6213fcb (#105 完了・魔女の前) の既定の地図 (verify_quest_walk (5a) / verify_silent_tomb が焼いた既定値)。
 *   2〜5 段目 = verify_silent_tomb (4c) の固定値 (#104 / #103 / #82 / #23 の実測)。 */
const SHA_AFTER_HAG = '3dd5550782057025';
const SHA_AFTER_TOMB = '44b1de14f8b2c9d0';
const SHA_AFTER_CARGO = '3918d569e7f3f7db';
const SHA_AFTER_WARREN = '647e71f6b2956389';
const SHA_AFTER_TOWER = '876c5f6336f96811';
const SIGN_VIEWS = [{ w: 1440, h: 900, mobile: false }, { w: 390, h: 844, mobile: true }];
const SIGN_STANDS = ['title', WH_SITE, STEP_GUARD, 'lake_n__lakeside@2', 'fort__lakeside@1'];
const CLEARED_KEY = 'dragonfighters.cleared';
const VIEW = { width: 1280, height: 800 };
const BOSS_TURNS = 3;                // 戦闘でボスの手番を何回見るか
const FB_TURNS = 2;                  // (3e) 塞いだ盤面の戦闘でハグの手番を何回見るか
const DIALOG_N_MS = 8000;            // (4d) 2 択が n1 の入場から開くまでの上限 (装置の上限。実測は依頼書 §12-3)
const ENC_START_WAIT_MS = 90000;
const ENC_END_WAIT_MS = 120000;
const AUTO_MS = 300000;              // 全自動の 1 本の上限
const WALK_MS = 240000;              // (1g) 1 本の歩きの上限
const PRESS_MAX = 20;                // (1f) 神殿の札を押す回数の上限 (title 起点 pier → temple = 12 停留所)
const WORLD_Q = '?roadevent=0&ambush=0';
const PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガルド', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ',   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'rear',  name: 'ミラ',   trait: null, line: null },
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
if (BASE_INDEX.indexOf('mistPassage') >= 0) vetFail('BASE_REV ' + BASE_REV + ' の index.html に mistPassage が在る (着手前でない)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 11 本 + signclash)。逐語は HEAD cd3f3cb (項目2 の実装後) の行で取った。
 * ⚠ どれも 1 行 → 1 行 (行数不変)。⚠ 他ドライバのアンカーと重ならない行を選んだ (罠E・起動時に検査)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const A_LAKESIDE = '    lakeside:  { kind: "site", x: 1056, y: 544, label: "湖畔の集落", desc: "湖の東岸の小さな集落。霧の森の奥に魔女の小屋", signDx: 160 }';
const A_PASS_ENTRY = '      if (def.mistPassage && !enemy.__passageUsed) {';
const HAG_RETIRE = '  /* ══ 撤退スイッチ ?hag=0 (実装依頼書 #106 §7) ═════════════════════════════';
const MUTATIONS = {
  /* ⭐ initWitchHag で passiveNpc も立てる (依頼書 §2-4 の罠 = ボスの部屋に入った瞬間に制覇する) */
  passiveearly: [
    { file: F_INDEX, from: '        e.inactive = true;                                     // ⛔ passiveNpc は付けない (§2-4)',
      to: '        e.inactive = true; e.passiveNpc = true; ' + HIT('passiveearly') + ';   /* ★変異passiveearly */' }],
  /* 選択肢の並びを入れ替える (先頭 = 取り引き = 全自動が取り引きへ落ちる) */
  fightlast: [
    { file: F_INDEX, from: '          [{ label: "戦って子を取り返す" }, { label: "礼金を渡して取り引きする" }],',
      to: '          [{ label: "礼金を渡して取り引きする" }, { label: "戦って子を取り返す" }],   /* ★変異fightlast */' },
    { file: F_INDEX, from: '      await applyWitchHagChoice(c === 1 ? 1 : 0);   // null (Esc) と 0 は戦う',
      to: '      ' + HIT('fightlast') + '; await applyWitchHagChoice(c === 1 ? 0 : 1);   /* ★変異fightlast */' }],
  /* 取り引きで SCENARIOS["witch-hut"] そのものを書き換える (浅い写しへの差し替えをやめる) */
  tablewrite: [
    { file: F_INDEX, from: '        currentScenario = Object.assign({}, currentScenario,',
      to: '        ' + HIT('tablewrite') + '; currentScenario = Object.assign(SCENARIOS["witch-hut"],   /* ★変異tablewrite */' }],
  /* 2 択の tick の条件を「n1 に入ったら」から「近づいたら (半径 220)」へ */
  nodialog: [
    { file: F_INDEX, from: '      if (!RUN || currentNodeId !== RUN.bossNodeId) return;',
      to: '      if (!RUN || (' + HIT('nodialog') + ', Math.hypot(enemies[hagIdx].x + enemies[hagIdx].def.displaySize / 2 - (playerX + 48), enemies[hagIdx].y + enemies[hagIdx].def.displaySize / 2 - (playerY + 58))) > 220) return;   /* ★変異nodialog */' }],
  /* 霧渡りの狙いを Math.random で選ぶ (帯を無視して隊員から 1 人) */
  passagerng: [
    { file: F_INDEX, from: '        const best = farthest(cands.filter(c => c.zone === z));',
      to: '        const best = (' + HIT('passagerng') + ', cands[Math.floor(Math.random() * cands.length)]);   /* ★変異passagerng */' }],
  /* 有利をやめる (d20 を 1 回だけ振る) */
  noadvantage: [
    { file: F_INDEX, from: '      const r1 = d20(), r2 = d20();',
      to: '      const r1 = d20(), r2 = (' + HIT('noadvantage') + ', r1);   /* ★変異noadvantage */' }],
  /* 透明度を戻す行を消す */
  opacitystuck: [
    { file: F_INDEX, from: '        setEnemyVfx(enemyIdx, undefined, prevOpacity);   // ⚠ 透明度は必ず戻す (例外でも)',
      to: '        ' + HIT('opacitystuck') + ';   /* ★変異opacitystuck (透明度を戻す行を消した) */' }],
  /* def.mistPassage の条件を外し、ボスなら誰でも霧渡りする */
  passageall: [
    { file: F_INDEX, from: A_PASS_ENTRY,
      to: '      if ((def.mistPassage || def.isBoss) && !enemy.__passageUsed) { if (!def.mistPassage) ' + HIT('passageall') + ';   /* ★変異passageall */' }],
  /* 魔女の小屋を locked:false にする (撤退スイッチの直前で実行時に書き換える) */
  unlockfree: [
    { file: F_TAVERN, from: HAG_RETIRE,
      /* ⚠ 原本の行は複数行コメントの開き = 置換後も開いたまま残す */
      to: '  (function () { var s = scenarios.find(function (x) { return x.id === "witch-hut"; }); if (s) { s.locked = false; ' + HIT('unlockfree') + '; } })();' + HAG_RETIRE + ' ★変異unlockfree' }],
  /* lakeside を kind: "way" のままにする (札も label も無い今日の中継点) */
  nosite: [
    { file: F_WMAP, from: A_LAKESIDE,
      to: '    lakeside:  (' + HIT('nosite') + ', { kind: "way",  x: 1056, y: 544 })   /* ★変異nosite */' }],
  /* ⭐ 札を主人公の真上へ戻す (signDx を外す) = 札の下端が廃坑への刻み点 lakeside__mine@1 のマーカーに掛かる (依頼書 §2-2) */
  signclash: [
    { file: F_WMAP, from: A_LAKESIDE,
      to: '    lakeside:  (' + HIT('signclash') + ', { kind: "site", x: 1056, y: 544, label: "湖畔の集落", desc: "湖の東岸の小さな集落。霧の森の奥に魔女の小屋" })   /* ★変異signclash */' }],
  /* NODE_EXTRA_SPAWN_KINDS から n1 の search を外す */
  nosearch: [
    { file: F_INDEX, from: '      t["witch-hut"] = { n0: ["search", "loot"], n1: ["search"] };',
      to: '      t["witch-hut"] = (' + HIT('nosearch') + ', { n0: ["search", "loot"] });   /* ★変異nosearch */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で 1 本ずつ実走し、実際に赤くなった集合で決めた
 *   (項目3・2026-11-02 = r106/item3/mut/*.log。4 本ずつ並走 + 素の 3 回と同時に走らせた負荷の下)。予想との差の理由:
 *   - passiveearly: 必ず赤 = 入場直後の観測 (0c)(4d) (n1 に入った瞬間から passiveNpc が立っている)。その後は
 *     クリア判定の tick と 2 択の tick (400ms) の**競走**: クリアが先なら 2 択が開かず、直接呼び (3b)(3c)(3d)・塞いだ盤面 (3e)・
 *     霧渡り (3a)(3f)・取り引きの道 (4e) が空になって赤。2 択が先なら「戦う」で passiveNpc が外れて緑 (--negative の 1 回目で
 *     (3b)(3c)(3d)(3e) が緑だった) ⇒ 確率で赤。(4f) は即制覇でも礼金と XP は入るので緑。
 *   - fightlast: 対応 (index 0 = 取り引き) が入れ替わるので、?diag=1 のページ (0 を返す) も全自動も取り引きへ落ちる
 *     ⇒ 戦闘が無い (3a)(3e)(3f)(4f)・取り引きの透明度 0 が残る (3d)・取り引きの腕 (1 を返す) は戦う道へ (4e)。
 *   - nodialog: 主人公が inactive の敵へ寄らないので 2 択が永久に開かない (§2-4 の穴) ⇒ (0c) と 2 択の後ろが全部赤。
 *   - passagerng: 狙いが変わり、狙った相手の HP を見る (3c) も赤。(6a) は赤くならない (spawnTraps の乱数に触らない)。
 *   - unlockfree: 配信バイトの locked と UNLOCK の食い違い (1a)・?hag=0 の反転 (4b)。nosite: 札が出ない (1f)(1g)(4b)。 */
const NEG_EXPECT = {
  passiveearly: ['(0c)', '(4d)'],
  fightlast:    ['(3a)', '(3d)', '(3e)', '(3f)', '(4d)', '(4e)', '(4f)'],
  tablewrite:   ['(4e)'],
  nodialog:     ['(0c)', '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(3f)', '(4d)', '(4e)', '(4f)'],
  passagerng:   ['(3b)', '(3c)'],
  noadvantage:  ['(3c)'],
  opacitystuck: ['(3d)'],
  passageall:   ['(3f)'],
  unlockfree:   ['(1a)', '(1c)', '(4b)'],
  nosite:       ['(1a)', '(1d)', '(1f)', '(1g)', '(4b)'],
  signclash:    ['(1f)'],
  nosearch:     ['(2c)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = {
  passiveearly: ['(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(3f)', '(4e)'], fightlast: [], tablewrite: [], nodialog: [], passagerng: [], noadvantage: [], opacitystuck: [],
  passageall: [], unlockfree: [], nosite: [], signclash: [], nosearch: [],
};
/* 依頼書 §8 の予想 (記録。⛔ 合否には使わない = 担当は実走で決める)。signclash は依頼書の表に無い (#105 の型を写した) */
const NEG_PREDICTED = {
  passiveearly: ['(0c)', '(4d)'], fightlast: ['(4d)'], tablewrite: ['(4e)'], nodialog: ['(4d)'], passagerng: ['(3b)', '(6a)'],
  noadvantage: ['(3c)'], opacitystuck: ['(3d)'], passageall: ['(3f)'], unlockfree: ['(1c)'], nosite: ['(1a)', '(1d)'],
  signclash: ['(1f)'], nosearch: ['(2c)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 12) vetFail('変異は 12 本まで (ポート 10678〜10689)');
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
const PLACE_RE = new RegExp('id: "' + WH + '",\\r?\\n\\s*place: "([^"]+)"');
const PLACE_OF = (s) => { const m = PLACE_RE.exec(s); return m ? m[1] : null; };
if (!PLACE_OF(PRISTINE[F_TAVERN])) vetFail('tavern.html の配信バイトに id: "' + WH + '" → place: の並びが無い');

/* (6b) 写し元の関数のソース (宣言の頭から中括弧の対応で切り出す。BASE と現在で同じ切り出し方 = 比べる限り公平) */
const SOURCE_FNS = ['initSwampNovice', 'tryApproachNovice', 'runNoviceDialog', 'applyNoviceResult', 'showCharChoice',
  'pickShadowStepTile', 'allyShadowStep', 'spawnShadowPuff', 'inflictWoundsTouch', 'checkDungeonClear'];
function fnSource(src, name) {
  const re = new RegExp('\\n[ \\t]*(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  /* 本体 = 宣言の後で最初に「) {」+ 改行 が来る所 (引数の既定値の文字列に ")" や "{}" があっても誤らない) */
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(2a)', '(2b)', '(2c)', '(2d)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(3f)', '(4a)', '(4b)', '(4c)', '(4d)', '(4e)', '(4f)', '(6a)', '(6b)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 6000));
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
           path: Array.isArray(p) ? p.slice() : p, hero: WD ? WD.heroNode() : null, ask: WD ? WD.askOpen() : null };
};
/* (1f): 札の矩形どうし・札と刻み点マーカーの矩形の交わり / マーカーの中心・停留所の点を奪っていないか (実描画) */
const SIGN_SNAP = (SITE) => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const inter = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const vw = innerWidth, vh = innerHeight;
  const W = window.__world;
  const signs = Array.from(document.querySelectorAll('.worldSign')).filter((e) => e.offsetParent !== null)
    .map((e) => { const n = e.closest('[id^=worldNode_]'); return { id: n ? n.id.replace('worldNode_', '') : '?', el: e, rect: R(e) }; });
  const me = signs.find((s) => s.id === SITE) || null;
  const vsOthers = me ? signs.filter((s) => s.id !== SITE).map((s) => ({ id: s.id, a: +inter(me.rect, s.rect).toFixed(1) })).filter((x) => x.a > 0) : null;
  const checked = [], stolen = [], rectHit = [], nodesChecked = [], nodesStolen = [];
  if (me) {
    for (const id of W.stepIds()) {
      const el = document.getElementById('worldStep_' + id);
      if (!el) continue;
      const r = R(el); const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
      if (!(cx >= 0 && cy >= 0 && cx < vw && cy < vh)) continue;
      checked.push(id);
      const a = inter(me.rect, r);
      if (a > 0) rectHit.push({ id, a: +a.toFixed(1) });
      const hit = document.elementFromPoint(cx, cy);
      if (hit && (hit === me.el || me.el.contains(hit))) stolen.push(id);
    }
    for (const id of W.nodeIds()) {
      if (id === SITE) continue;
      const pt = W.clientFromNode ? W.clientFromNode(id) : null;
      if (!pt || !(pt.x >= 0 && pt.y >= 0 && pt.x < vw && pt.y < vh)) continue;
      nodesChecked.push(id);
      const hit = document.elementFromPoint(pt.x, pt.y);
      if (hit && (hit === me.el || me.el.contains(hit))) nodesStolen.push(id);
    }
  }
  const heroEl = document.getElementById('worldHero');
  const hero = heroEl ? R(heroEl) : null;
  const area = me ? me.rect.w * me.rect.h : 0;
  return { heroNode: W ? W.heroNode() : null, signCount: signs.length, me: me && me.rect, signIds: signs.map((s) => s.id),
           vsOthers, checked, stolen, rectHit, nodesChecked, nodesStolen, heroCover: (me && hero && area > 0) ? inter(me.rect, hero) / area : null };
};
/* (1f) ② 神殿の札: 中心の elementFromPoint が神殿の拠点の子孫か・神殿の点が lakeside の札に覆われているか (事実の記録) */
const TEMPLE_SNAP = (T, OWNER) => {
  const W = window.__world;
  const host = document.getElementById('worldNode_' + T);
  const sign = host && host.querySelector('.worldSign');
  const o = { hero: W.heroNode(), sign: !!sign, signText: sign ? sign.textContent.replace(/\s+/g, ' ').trim() : null };
  if (sign) {
    const r = sign.getBoundingClientRect();
    o.cx = r.left + r.width / 2; o.cy = r.top + r.height / 2;
    o.inView = o.cx >= 0 && o.cy >= 0 && o.cx < innerWidth && o.cy < innerHeight;
    const h = document.elementFromPoint(o.cx, o.cy);
    o.centerOwn = !!(h && host.contains(h));
  }
  const pt = W.clientFromNode ? W.clientFromNode(T) : null;
  if (pt) {
    const h = document.elementFromPoint(pt.x, pt.y);
    const oh = document.getElementById('worldNode_' + OWNER);
    const os = oh && oh.querySelector('.worldSign');
    o.pointCoveredByOwner = !!(h && os && os.contains(h));
  }
  return o;
};
/* index: いまのノードの観測 (n0 / n1 共通)。⚠ page.evaluate へは toString で渡して new Function で戻す */
const NODE_SNAP = (CAUL) => {
  const o = {};
  try { o.scen = scenarioId; } catch (e) { o.scen = null; }
  o.nodes = (RUN && RUN.graph) ? RUN.graph.nodes.map((n) => n.id + ':' + n.kind) : null;
  o.cur = currentNodeId;
  o.custom = !!(MAPDEF && MAPDEF.isCustom); o.themeId = MAPDEF ? MAPDEF.themeId : null;
  o.outdoor = window.__outdoorRevealProbe ? window.__outdoorRevealProbe() : null;
  o.paintings = roomPaintings.map((p) => ({ src: p.img && p.img.src ? decodeURIComponent(p.img.src.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]) : null,
    loaded: !!p.loaded, tw: p.tw, th: p.th, nw: p.img ? p.img.naturalWidth : null, nh: p.img ? p.img.naturalHeight : null,
    bakeTile: (p.img && p.tw && p.th && p.img.naturalWidth / p.tw === p.img.naturalHeight / p.th) ? p.img.naturalWidth / p.tw : null }));
  try { const D = ROOM_PAINTINGS_DEF['witch-hut']; o.outdoorFlags = D ? Object.keys(D).map((k) => [k, !!D[k].outdoor]) : null; } catch (e) { o.outdoorFlags = null; }
  o.traps = window.__witchHutTV ? window.__witchHutTV.traps() : traps.map((t) => ({ tx: t.tx, ty: t.ty, type: t.type }));
  o.trapsLen = traps.length;
  o.chests = roomChests.length;
  o.passLen = Array.isArray(window.__hagPassageProbe) ? window.__hagPassageProbe.length : null;
  o.choiceLen = Array.isArray(window.__hagChoiceProbe) ? window.__hagChoiceProbe.length : null;
  o.player = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
  const tileOf = (e) => ({ tx: Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), ty: Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE) });
  o.enemies = enemies.map((e, i) => Object.assign({ i, type: e.type, boss: !!(e.def && e.def.isBoss), alive: !!e.alive, inactive: !!e.inactive,
    passive: !!e.passiveNpc }, tileOf(e)));
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
  if (CAUL) {
    const wall = [], open = [];
    for (let r = CAUL.r1; r <= CAUL.r2; r++) for (let c = CAUL.c1; c <= CAUL.c2; c++) (isTileWall(c, r) ? wall : open).push(c + ',' + r);
    o.caul = { wall: wall.length, open };
    /* ハグの隣 (8 マス) のうち歩けるところへ入口から通るか */
    const h = o.enemies.find((e) => e.type === 'greenHag');
    if (h) {
      const adj = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const tx = h.tx + dx, ty = h.ty + dy;
        if (isTileWall(tx, ty)) continue;
        const q = aStar(o.player.tx, o.player.ty, tx, ty);
        adj.push({ t: [tx, ty], len: q ? q.length : null });
      }
      o.hagAdj = adj;
    }
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
  const t = { tx: -1, ty: -1, type: window.__witchHutTV.trapTypeForNode(), damageDice: '1d6', found: false, triggered: false, el: null };
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
  o.tt = window.__witchHutTV.TRAP_TYPES();
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
    await page.waitForFunction((S) => !!window.WORLD_MAP && !!window.__world && !!document.getElementById('worldNode_' + S), { timeout: 30000 }, WH_SITE);
    await sleep(o.settle || 1200);
    ctx.booted++;
    const snap = await page.evaluate(WORLD_SNAP, WH_SITE, PORT_TOWN);
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
  /* 戦闘: 手番の関数を包んで 1 戦闘回す (?diag=1 のページ・verify_silent_tomb の型)
   *   ⭐ enemyAttackTurn は本番を呼ぶ包み・頭と仲間は見張る型 (W) の手番が CT 回来るまで何もしない
   *   BLOCK = 見張る型の**最初の手番だけ**、生きている隊員の隣 8 マスを isTileWall で塞ぐ ((3e) 移動先が無い盤面) */
  async function battle(page, W, CT, BLOCK) {
    await page.evaluate((W, CT, BLOCK) => {
      const S = window.__wbS = { watch: [], other: { turns: 0, added: 0, recs: [] }, killed: false, pba: [] };
      const _e = enemyAttackTurn, _pb = pickBossAction;
      pickBossAction = function (e) { S.pba.push(enemies.indexOf(e)); return _pb.apply(this, arguments); };
      const tl = (x, y, ds) => [Math.floor((x + ds / 2) / TILE_SIZE), Math.floor((y + ds / 2) / TILE_SIZE)];
      enemyAttackTurn = async function (idx) {
        const e = enemies[idx];
        const isW = !!(e && e.type === W);
        const p0 = window.__hagPassageProbe.length, t0 = traps.length, b0 = S.pba.length, used0 = !!(e && e.__passageUsed);
        const at0 = e ? tl(e.x, e.y, e.def.displaySize) : null;
        let _w = null, blocked = 0;
        if (isW && BLOCK && S.watch.length === 0) {
          const bl = new Set();
          const mark = (cx, cy) => { const tx = Math.floor(cx / TILE_SIZE), ty = Math.floor(cy / TILE_SIZE); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) bl.add((tx + dx) + ',' + (ty + dy)); };
          if (hp > 0) mark(playerX + 48, playerY + 58);
          for (const a of allies) if (a.alive) mark(a.x + a.def.displaySize / 2, a.y + a.def.displaySize / 2);
          blocked = bl.size;
          _w = isTileWall;
          isTileWall = function (tx, ty) { if (bl.has(tx + ',' + ty)) return true; return _w.apply(this, arguments); };
        }
        let r;
        try { r = await _e.apply(this, arguments); } finally { if (_w) isTileWall = _w; }
        const add = window.__hagPassageProbe.slice(p0).map((x) => ({ enemyIdx: x.enemyIdx, zone: x.zone, kind: x.kind, idx: x.idx, from: x.from, to: x.to, rolls: x.rolls, roll: x.roll, hit: x.hit, fellBack: x.fellBack, trapsLen: x.trapsLen }));
        const pba = S.pba.slice(b0).filter((i) => i === idx).length;
        if (isW) S.watch.push({ n: S.watch.length + 1, idx, added: add.length, recs: add, trapsBefore: t0, trapsAfter: traps.length, pba, used0, used1: !!e.__passageUsed, at0, blocked });
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
    }, W, CT, !!BLOCK);
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
    return page.evaluate(async (W, START_MS, END_MS) => {
      const o = {};
      const S = window.__wbS;
      o.trapsAtEntry = traps.length;
      const k = enemies.find((e) => e.alive && !e.inactive && !e.passiveNpc && !(e.def && e.def.isBoss)) || null;
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
      if (!o.started) o.diag = { dialogPaused: !!dialogPaused, skillCheckActive: !!skillCheckActive, nodeBusy: !!nodeBusy, cur: currentNodeId, gameOver: !!gameOver };
      const t1 = performance.now();
      while ((encounterActive || encounterRunning) && performance.now() - t1 < END_MS) await new Promise((r) => setTimeout(r, 250));
      o.ended = !encounterActive && !encounterRunning; o.encMs = Math.round(performance.now() - t1);
      o.trapsAtEnd = traps.length;
      const wi = enemies.findIndex((e) => e.type === W);
      o.wIdx = wi; o.wUsed = wi >= 0 ? !!enemies[wi].__passageUsed : null;
      o.probeAll = window.__hagPassageProbe.map((x) => ({ enemyIdx: x.enemyIdx, fellBack: x.fellBack }));
      o.S = JSON.parse(JSON.stringify(S));
      return o;
    }, W, ENC_START_WAIT_MS, ENC_END_WAIT_MS);
  }
  /* 全自動 (?autoplay=1) の 1 本: n0 は最初の手番で全員を倒す → 本番の出口の流れで n1 → 2 択 (MODE: fight = 本番どおり先頭 / bargain = 1 を返す)
   *   → fight はハグの手番が CT 回来たら全員を倒す。帰還の結果 (lastResult) まで見る。 */
  /* ⭐ 段ごとの例外は段の中に閉じ込める (1 つの段の失敗で他の節まで「例外で判定できず」にしない = 変異の担当が漏れる。
   *   --negative 1 回目の nodialog で autoRun の注入が ReferenceError を投げ、§0〜§6 の 20 節が赤になった)。 */
  const STAGE_ERRS = [];
  const stage = async (name, f, fb) => { try { return await f(); } catch (e) { STAGE_ERRS.push(name + ': ' + String((e && e.message) || e).slice(0, 200)); return fb; } };
  async function autoRun(MODE) {
    const page = await newPage();
    await prep(page, null, idxSeed(WH));
    await page.goto(base + F_INDEX + '?autoplay=1&diag=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction("typeof RUN !== 'undefined' && RUN && typeof enterNode === 'function' && typeof gainXP === 'function' && typeof maxHp !== 'undefined'", { timeout: 90000 });
    ctx.booted++;
    const inst = await page.evaluate((MODE, CT) => {
      const S = window.__ar = { mode: MODE, calls: [], preN: 0, preBad: [], n1At: null, entry: null, encAt: null, clearAt: null, choiceAt: null, after: null,
        hag: [], other: { turns: 0, added: 0 }, xp: [], pba: [], killed: { n0: false, n1: false },
        gold0: Number(localStorage.getItem('dragonfighters.gold')) || 0, xp0: Number(localStorage.getItem('dragonfighters.xp')) || 0 };
      const snapE = () => ({ cur: currentNodeId, cleared: !!dungeonCleared,
        list: enemies.map((e) => ({ type: e.type, alive: !!e.alive, inactive: !!e.inactive, passive: !!e.passiveNpc })) });
      const oC = showCharChoice;
      showCharChoice = function (msg, cands) {
        if (/その子が欲しいかい/.test(String(msg))) {
          S.calls.push({ at: performance.now(), labels: (cands || []).map((c) => c.label), state: snapE(), autoplay: window.__autoplay });
          S.choiceAt = performance.now();
          if (MODE === 'bargain') return Promise.resolve(1);
        }
        return oC.apply(this, arguments);
      };
      const oX = gainXP; gainXP = function (a, s) { S.xp.push([a, s]); return oX.apply(this, arguments); };
      /* ⭐ xp の保存の瞬間の gainXP の合計を控える (保存の後にも罠の解除などで gainXP が呼ばれうる = 揺れた。--negative 1 回目の passageall で 25 差) */
      const oSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (this === localStorage && k === 'dragonfighters.xp') { S.xpSave = S.xp.reduce((n, x) => n + x[0], 0); S.xpSaveN = (S.xpSaveN || 0) + 1; } return oSet.apply(this, arguments); };
      const _pb = pickBossAction; pickBossAction = function (e) { S.pba.push(enemies.indexOf(e)); return _pb.apply(this, arguments); };
      const _e = enemyAttackTurn;
      enemyAttackTurn = async function (idx) {
        const e = enemies[idx];
        const isH = !!(e && e.type === 'greenHag');
        const p0 = window.__hagPassageProbe.length, t0 = traps.length, b0 = S.pba.length, used0 = !!(e && e.__passageUsed);
        const r = await _e.apply(this, arguments);
        const add = window.__hagPassageProbe.slice(p0).map((x) => ({ enemyIdx: x.enemyIdx, zone: x.zone, kind: x.kind, rolls: x.rolls, roll: x.roll, hit: x.hit, dmg: x.dmg, fellBack: x.fellBack, trapsLen: x.trapsLen }));
        const pba = S.pba.slice(b0).filter((i) => i === idx).length;
        if (isH) S.hag.push({ n: S.hag.length + 1, idx, added: add.length, recs: add, trapsBefore: t0, trapsAfter: traps.length, pba, used0, used1: !!e.__passageUsed });
        else { S.other.turns++; S.other.added += add.length; }
        return r;
      };
      const killAll = () => { for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e && e.alive && !e.passiveNpc) { e.hp = 0; defeatEnemy(i); } } };
      /* ⭐ n1: ハグは手下と同じ戦闘に入るとは限らない (隊が手下へ寄った所で戦闘が始まり、ハグは間合いの外に残る)。
       *   頭と仲間の手番は何もしないので、手下だけの戦闘は終わらない ⇒ n1 の最初の手番で手下だけを倒し、
       *   本番の自走でハグへ寄らせて次の戦闘でハグの手番を待つ。CT 回来たら全員を倒す。 */
      const killMinions = () => { for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e && e.alive && !e.passiveNpc && !(e.def && e.def.isBoss) && !S.hag.length) { e.hp = 0; defeatEnemy(i); } } };
      const turn = async function () {
        if (currentNodeId === 'n0' && !S.killed.n0) { S.killed.n0 = true; killAll(); return; }
        if (currentNodeId !== 'n1') return;
        if (S.hag.length >= CT) { if (!S.killed.n1) { S.killed.n1 = true; killAll(); } return; }
        if (!S.hag.length && !S.killed.minions && !encounterHasHag()) { S.killed.minions = true; killMinions(); }
      };
      const encounterHasHag = () => { try { return Array.isArray(encounterEnemyIndices) && encounterEnemyIndices.some((i) => enemies[i] && enemies[i].type === 'greenHag'); } catch (e) { return false; } };
      playerAttackTurn = turn; allyAttackTurn = turn;
      const heal = () => { maxHp = Math.max(maxHp, 999); hp = maxHp; for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; } };
      heal();
      S.iv = setInterval(() => {
        let nid = null; try { nid = currentNodeId; } catch (e) { return; }
        if (nid !== 'n1') return;
        const now = performance.now();
        if (!S.n1At) { S.n1At = now; heal(); S.entry = snapE(); }
        if (!S.calls.length) {
          S.preN++;
          const st = snapE();
          if (st.cleared || !st.list.every((x) => !x.alive || (x.inactive && !x.passive))) { if (S.preBad.length < 5) S.preBad.push(st); }
        }
        if (S.calls.length && !S.after && now - S.choiceAt > 700) S.after = snapE();
        if (encounterActive && !S.encAt) S.encAt = now;
        if (dungeonCleared && !S.clearAt) S.clearAt = now;
      }, 50);
      return { wrapped: showCharChoice !== oC && enemyAttackTurn === window.enemyAttackTurn && gainXP === window.gainXP };
    }, MODE, BOSS_TURNS);
    const t0 = Date.now();
    let lr = null, over = false;
    while (Date.now() - t0 < AUTO_MS) {
      const s = await page.evaluate(() => { let l = null; try { l = JSON.parse(sessionStorage.getItem('dragonfighters.lastResult')); } catch (e) {} return { l, over: !!gameOver }; }).catch(() => null);
      if (s && s.l) { lr = s.l; break; }
      if (s && s.over) { over = true; await sleep(1500); }
      await sleep(500);
    }
    await sleep(400);
    const fin = await page.evaluate(() => {
      const S = window.__ar; clearInterval(S.iv);
      const hi = enemies.findIndex((e) => e.type === 'greenHag');
      let lr = null; try { lr = JSON.parse(sessionStorage.getItem('dragonfighters.lastResult')); } catch (e) {}
      return { S: JSON.parse(JSON.stringify(S)), passProbe: window.__hagPassageProbe.slice(), choiceProbe: window.__hagChoiceProbe.slice(),
        gold1: Number(localStorage.getItem('dragonfighters.gold')) || 0, xp1: Number(localStorage.getItem('dragonfighters.xp')) || 0,
        coins: coins, roadChest: roadChestBonusGold(), table: { g: SCENARIOS['witch-hut'].clearGold, x: SCENARIOS['witch-hut'].clearXp },
        cur: { g: currentScenario.clearGold, x: currentScenario.clearXp }, cleared: !!dungeonCleared, over: !!gameOver,
        hag: hi >= 0 ? { alive: !!enemies[hi].alive, passive: !!enemies[hi].passiveNpc, inactive: !!enemies[hi].inactive } : null,
        lr: lr && { cleared: lr.cleared, scenarioId: lr.scenarioId, reward: lr.reward } };
    }).catch((e) => ({ err: e.message }));
    fin.inst = inst; fin.ms = Date.now() - t0; fin.lrSeen = !!lr; fin.overSeen = over;
    await page.close().catch(() => {});
    return fin;
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
      return tp.evaluate(TAV_SNAP, WH_SITE);
    };
    await prep(tp, []);
    const on0 = await openTav('');
    const mainIds = (on0.scen || []).filter((s) => !s.side).map((s) => s.id);
    const sideIds = (on0.scen || []).filter((s) => s.side).map((s) => s.id);
    const MINE = mainIds[0], FOREST = mainIds[1], SWAMP = mainIds[2], FORT = mainIds[3];
    const MF = [MINE, FOREST], MFS = [MINE, FOREST, SWAMP];
    await prep(tp, []);
    const off0 = await openTav('?hag=0');
    await prep(tp, [MINE]);
    const on1 = await openTav('');
    await prep(tp, [MINE]);
    const off1 = await openTav('?hag=0');
    await prep(tp, MF);
    const on2 = await openTav('');
    await prep(tp, MF);
    const off2 = await openTav('?hag=0');
    await prep(tp, MFS);
    const on3 = await openTav('');
    await prep(tp, MFS);
    const off3 = await openTav('?hag=0');
    await prep(tp, mainIds);
    const c6 = await openTav('');
    await prep(tp, mainIds.concat(sideIds));
    const cAll = await openTav('');
    await tp.close().catch(() => {});

    /* ══════════ world ══════════ */
    const w0 = (await openWorld({ cleared: [] })).snap;                 /* (1c)(1e) */
    const w1 = (await openWorld({ cleared: [MINE] })).snap;             /* (1c) */
    const w2 = (await openWorld({ cleared: MF })).snap;                 /* (1c) */
    const w3 = (await openWorld({ cleared: MFS })).snap;                /* (1a)(1d) */
    const w3off = (await openWorld({ cleared: MFS, q: '?hag=0' })).snap;   /* (4b) */
    /* (4c) 撤退 5 段 (本番の関数を呼ぶ) */
    const wr = await openWorld({ cleared: [], keep: true });
    const retired = await wr.page.evaluate(() => {
      const W = window.WORLD_MAP;
      const fp = () => ({ sites: JSON.parse(JSON.stringify(W.SITES)), edges: W.EDGES.map((e) => e[0] + '__' + e[1]),
        nodesFP: Object.keys(W.NODES).map((id) => { const n = W.NODES[id]; return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—'); }) });
      if (['retireHag', 'retireTomb', 'retireCargo', 'retireWarren', 'retireTower'].some((f) => typeof W[f] !== 'function')) return null;
      const o = { on: fp() };
      W.retireHag(); o.hag = fp();
      W.retireTomb(); o.tomb = fp();
      W.retireCargo(); o.cargo = fp();
      W.retireWarren(); o.warren = fp();
      W.retireTower(); o.tower = fp();
      return o;
    }).catch(() => null);
    await wr.page.close().catch(() => {});
    /* (1f) ① cleared=[廃坑, 森, 沼地]: 2 画面 × 立ち位置 5 */
    const signRows = [];
    for (const v of SIGN_VIEWS) {
      for (const stand of SIGN_STANDS) {
        const ss = stand === 'title' ? {} : { 'dragonfighters.roadReturn': stand };
        const w = await openWorld({ cleared: MFS, ss, view: v, keep: true, settle: 1500 });
        const m = await w.page.evaluate(SIGN_SNAP, WH_SITE);
        await w.page.close().catch(() => {});
        signRows.push(Object.assign({ view: v.w + 'x' + v.h, stand }, m));
      }
    }
    /* (1f) ② 本筋 6 本クリアの世界 (神殿の札が出る): lakeside に立って、点の事実を記録 → 神殿の札を押し続けて神殿へ */
    /*   ⚠ 立ち位置 (roadReturn) は ?ambush=0 だと読まれない (world.html #51 §7) = 観測の腕は ?roadevent=0 だけで開いて歩かない。
     *   押す腕は 1440 だけ・?roadevent=0&ambush=0 で title 起点 (pier) から神殿の札を押し続ける (1 回押すと 1 停留所進む)。 */
    const templeRows = [];
    for (const v of SIGN_VIEWS) {
      const w = await openWorld({ cleared: mainIds, q: '?roadevent=0', ss: { 'dragonfighters.roadReturn': WH_SITE }, view: v, keep: true, settle: 1500 });
      const m = await w.page.evaluate(SIGN_SNAP, WH_SITE);
      const t0 = await w.page.evaluate(TEMPLE_SNAP, TEMPLE_SITE, WH_SITE);
      await w.page.close().catch(() => {});
      templeRows.push({ view: v.w + 'x' + v.h, m, t0 });
    }
    {
      const w = await openWorld({ cleared: mainIds, q: WORLD_Q, view: SIGN_VIEWS[0], keep: true, settle: 1500 });
      const presses = [];
      let arrived = false;
      for (let i = 0; i < PRESS_MAX && !arrived; i++) {
        const t = await w.page.evaluate(TEMPLE_SNAP, TEMPLE_SITE, WH_SITE);
        if (!t.sign || !t.inView || !t.centerOwn) { presses.push({ i, bad: t }); break; }
        await w.page.mouse.click(Math.round(t.cx), Math.round(t.cy));
        const ts = Date.now();
        await sleep(300);
        while (Date.now() - ts < 20000 && await w.page.evaluate(() => window.__world.isMoving())) await sleep(150);
        await sleep(250);
        const h = await w.page.evaluate(() => ({ h: window.__world.heroNode(), a: window.__world.askOpen() }));
        presses.push({ i, at: [Math.round(t.cx), Math.round(t.cy)], hero: h.h, ask: h.a });
        if (h.h === TEMPLE_SITE) arrived = true;
      }
      await w.page.close().catch(() => {});
      templeRows.press = { presses, arrived, start: w.snap.hero };
    }
    /* (1g) ① 受注 = 魔女の小屋: 廃坑を押して歩く (lakeside を通る) → 開かない → lakeside を押して戻る → 開く
     *      ② 受注 = 廃坑: 廃坑を押して歩く → lakeside を通っても開かず廃坑で開く */
    const G = {};
    {
      const w = await openWorld({ cleared: MFS, q: WORLD_Q, ss: { 'dragonfighters.exitVia': 'town', 'dragonfighters.questDest': WH, 'dragonfighters.currentScenario': WH }, keep: true, settle: 1800 });
      G.start1 = { hero: w.snap.hero, ask: w.snap.ask };
      G.path1 = await w.page.evaluate((F, M) => window.WORLD_MAP.findWalkPath(F, M), PORT_TOWN, MINE_SITE);
      G.toMine = await walkTo(w.page, MINE_SITE);
      G.back = await walkTo(w.page, WH_SITE);
      await w.page.close().catch(() => {});
    }
    {
      const w = await openWorld({ cleared: MFS, q: WORLD_Q, ss: { 'dragonfighters.exitVia': 'town', 'dragonfighters.questDest': MINE, 'dragonfighters.currentScenario': MINE }, keep: true, settle: 1800 });
      G.start2 = { hero: w.snap.hero, ask: w.snap.ask };
      G.mineQ = await walkTo(w.page, MINE_SITE);
      await w.page.close().catch(() => {});
    }

    /* ── §1 / §4b の判定 ── */
    const whOf = (s) => (s.scen || []).find((x) => x.id === WH) || null;
    const A1 = (s, w) => {
      const t = whOf(s);
      if (!t || !s.sites || !s.unlock || !w || !w.sites) return { ok: false, why: '魔女の小屋が scenarios / SITES に無い (scenarios に ' + (t ? '在る' : '無い') + ')' };
      const ids = s.scen.map((x) => x.id).sort().join('|');
      const why = [];
      if (!(t.side === true && t.locked === true && typeof t.unlockAfter === 'string' && t.place === PLACE)) why.push('scenarios の魔女の小屋 ' + J(t) + ' / 配信バイトの place ' + PLACE);
      if (Object.keys(s.sites).sort().join('|') !== ids) why.push('tavern の SITES の id 集合 ≠ scenarios');
      if (Object.keys(w.sites).sort().join('|') !== ids) why.push('world.html の SITES の id 集合 ≠ scenarios');
      if (s.sites[WH] !== WH_SITE || w.sites[WH] !== WH_SITE) why.push('SITES[魔女の小屋] ' + s.sites[WH] + '/' + w.sites[WH]);
      for (const x of s.scen) {
        const u = x.locked ? x.unlockAfter : null;
        if ((s.unlock[x.id] || null) !== u) why.push('UNLOCK[' + x.id + ']=' + s.unlock[x.id] + ' ≠ unlockAfter ' + u);
        if ((w.unlock[x.id] || null) !== u) why.push('world.html UNLOCK[' + x.id + ']=' + w.unlock[x.id] + ' ≠ unlockAfter ' + u);
      }
      if (!s.node || s.node.kind !== 'site' || s.node.label !== PLACE || !w.node || w.node.kind !== 'site' || w.node.label !== PLACE) why.push(WH_SITE + ' が拠点「' + PLACE + '」でない ' + J([s.node, w.node]));
      if (!/\bworldNode-site\b/.test(w.cls || '') || !w.sign || w.sign.indexOf(PLACE) < 0) why.push('world.html の DOM の札 ' + J([w.cls, w.sign]));
      return { ok: why.length === 0, why: why.join(' / ') };
    };
    const a1On = A1(on3, w3), a1Off = A1(off3, w3off);
    R.check('(1a)', 'tavern の魔女の小屋 (配信バイトの id → place「' + PLACE + '」・side・locked・unlockAfter) と同じページの SITES / UNLOCK / NODES.' + WH_SITE + '、world.html の SITES / UNLOCK / DOM の札が一致',
      a1On.ok, a1On);
    R.check('(1b)', 'side・ALL_MAIN_SCENARIOS に無い・本筋 (side でない scenarios) と同じ並び・本筋 6 本 (と +本筋外 ' + sideIds.length + ' 本) クリアで frontier が null',
      !!whOf(on0) && whOf(on0).side === true && Array.isArray(on0.allMain) && on0.allMain.indexOf(WH) < 0 && on0.allMain.join('|') === mainIds.join('|')
        && J(on0.main) === J(mainIds) && mainIds.length === 6 && mainIds.indexOf(WH) < 0 && sideIds.indexOf(WH) >= 0
        && !!c6.facts && !!cAll.facts && c6.facts.frontier === null && cAll.facts.frontier === null,
      { allMain: on0.allMain, main: on0.main, side: sideIds, c6: c6.facts && c6.facts.frontier, cAll: cAll.facts && cAll.facts.frontier });
    const srt = (a) => J((a || []).slice().sort());
    const wayLook = (w) => !!w && /\bworldNode-way\b/.test(w.cls || '') && w.sign === null && !w.title;
    const sameUnlocked = (a, b) => !!a.facts && !!b.facts && srt(a.facts.unlocked) === srt(b.facts.unlocked) && (a.facts.unlocked || []).indexOf(WH) < 0;
    R.check('(1c)', 'cleared=[] / [' + MINE + '] / [' + MF.join(', ') + '] の解放済みが ?hag=0 と同じ (魔女の小屋は入らない)・どれも world.html の ' + WH_SITE + ' は中継点の見た目 (札なし)',
      sameUnlocked(on0, off0) && sameUnlocked(on1, off1) && sameUnlocked(on2, off2) && wayLook(w0) && wayLook(w1) && wayLook(w2),
      { u0: [on0.facts && on0.facts.unlocked, off0.facts && off0.facts.unlocked], u1: [on1.facts && on1.facts.unlocked, off1.facts && off1.facts.unlocked],
        u2: [on2.facts && on2.facts.unlocked, off2.facts && off2.facts.unlocked],
        world: [w0, w1, w2].map((w) => ({ cls: w.cls, sign: w.sign, title: w.title })) });
    const D1 = (s, w, offFacts) => !!s.facts && (s.facts.unlocked || []).indexOf(WH) >= 0 && (s.facts.unlocked || []).indexOf(FORT) >= 0
      && !!offFacts && srt(s.facts.unlocked) === srt((offFacts.unlocked || []).concat([WH]))
      && !!w && /\bworldNode-site\b/.test(w.cls || '') && !!w.sign && w.sign.indexOf(PLACE) >= 0;
    R.check('(1d)', 'cleared=[' + MFS.join(', ') + '] → 解放済みに魔女の小屋 (と ' + FORT + ') が入る (= ?hag=0 の解放済み + 魔女の小屋)・world.html の ' + WH_SITE + ' に札「' + PLACE + '」',
      D1(on3, w3, off3.facts), { facts: on3.facts, offUnlocked: off3.facts && off3.facts.unlocked, world: { cls: w3.cls, sign: w3.sign } });
    /* ⚠ findWalkPath の戻り値は「出発点を含まない」歩く順のノード列 */
    R.check('(1e)', 'world.html で WORLD_MAP.findWalkPath("' + PORT_TOWN + '", "' + WH_SITE + '") が null でなく ' + WH_SITE + ' で終わる',
      Array.isArray(w0.path) && w0.path.length >= 1 && w0.path[w0.path.length - 1] === WH_SITE, { path: w0.path });
    const okNodes = (list) => (list || []).every((id) => COVER_OK[id] === WH_SITE);
    const f1a = signRows.length === SIGN_VIEWS.length * SIGN_STANDS.length
      && signRows.every((r) => !!r.me && Array.isArray(r.vsOthers) && r.vsOthers.length === 0 && r.stolen.length === 0 && r.rectHit.length === 0
        && okNodes(r.nodesStolen) && (r.stand === 'title' || r.heroNode === r.stand))
      && SIGN_VIEWS.every((v) => signRows.some((r) => r.view === v.w + 'x' + v.h && (r.checked || []).indexOf(STEP_GUARD) >= 0));
    const f1b = templeRows.length === SIGN_VIEWS.length && templeRows.every((r) => !!r.m.me && r.m.vsOthers.length === 0 && r.m.stolen.length === 0
      && r.m.rectHit.length === 0 && okNodes(r.m.nodesStolen) && r.m.heroNode === WH_SITE
      && r.t0.sign && r.t0.inView && r.t0.centerOwn)
      && !!templeRows.press && templeRows.press.arrived === true && templeRows.press.presses.length >= 2
      && templeRows.press.presses.every((p) => !p.bad);
    R.check('(1f)', '① cleared=[' + MFS.join(', ') + '] (1440x900 / 390x844 × 主人公 ' + SIGN_STANDS.join(' / ') + '): 魔女の札と他の札の交わり 0・刻み点マーカーの矩形の交わり 0・中心を奪わない・停留所の点を奪うのは '
      + Object.keys(COVER_OK).join(',') + ' だけ (各画面で ' + STEP_GUARD + ' を調べる) / ② 本筋 6 本クリア: 同じ条件 + 神殿の札の中心は神殿の拠点の子孫・' + WH_SITE + ' から神殿の札を押し続けると神殿へ着く (ユーザー判断 (a): 札が神殿の点を覆う事実は記録だけ)',
      f1a && f1b,
      { mfs: signRows.map((r) => ({ view: r.view, stand: r.stand, at: r.heroNode, signs: r.signCount, others: r.vsOthers, steps: (r.checked || []).length,
          guard: (r.checked || []).indexOf(STEP_GUARD) >= 0, rect: r.rectHit, stolen: r.stolen, nodes: (r.nodesChecked || []).length, nodesStolen: r.nodesStolen,
          cover: r.heroCover == null ? null : +(r.heroCover * 100).toFixed(1) })),
        main6: templeRows.map((r) => ({ view: r.view, signs: r.m.signCount, others: r.m.vsOthers, rect: r.m.rectHit, stolen: r.m.stolen, nodesStolen: r.m.nodesStolen,
          at: r.m.heroNode, templePointCoveredByLakesideSign: r.t0.pointCoveredByOwner, templeSign: r.t0.signText, inView: r.t0.inView, centerOwn: r.t0.centerOwn })),
        press1440: templeRows.press && { start: templeRows.press.start, n: templeRows.press.presses.length, arrived: templeRows.press.arrived,
          walk: templeRows.press.presses.map((p) => p.hero || p.bad) } });
    const g1 = G.toMine || {}, gb = G.back || {}, g2 = G.mineQ || {};
    const lakeIn = (x) => (x.seen || []).indexOf(WH_SITE) >= 0;
    R.check('(1g)', '母集団: findWalkPath("' + PORT_TOWN + '","' + MINE_SITE + '") が ' + WH_SITE + ' を含む / ① 受注 = 魔女の小屋で ' + MINE_SITE + ' を押して歩くと ' + WH_SITE + ' を踏んでも開かず ' + MINE_SITE + ' でも開かない → '
      + WH_SITE + ' を押して戻ると魔女の小屋の入場が開く / ② 受注 = 廃坑なら ' + WH_SITE + ' を踏んでも開かず ' + MINE_SITE + ' で開く',
      Array.isArray(G.path1) && G.path1.indexOf(WH_SITE) >= 0 && !!G.start1 && G.start1.hero === PORT_TOWN && G.start1.ask === false
        && lakeIn(g1) && (g1.askAt || []).length === 0 && !!g1.end && g1.end.h === MINE_SITE && g1.end.a === false
        && (gb.askAt || []).length === 1 && gb.askAt[0].h === WH_SITE && gb.askAt[0].t.indexOf(PLACE) >= 0
        && !!G.start2 && G.start2.hero === PORT_TOWN && G.start2.ask === false
        && lakeIn(g2) && (g2.askAt || []).length === 1 && g2.askAt[0].h === MINE_SITE && g2.askAt[0].t.indexOf(PLACE) < 0,
      G);
    /* (4b) = 配列から消え・lakeside が中継点・cleared=[廃坑, 森, 沼地] の解放済みが −1・(1a)(1d) の条件が ON/OFF で反転 */
    const offOk = !whOf(off3) && !(off3.sites && off3.sites[WH]) && !!off3.node && off3.node.kind === 'way'
      && !!off3.facts && (off3.facts.unlocked || []).indexOf(WH) < 0 && !!on3.facts && (on3.facts.unlocked || []).length === (off3.facts.unlocked || []).length + 1
      && !!w3off.node && w3off.node.kind === 'way' && wayLook(w3off) && !(w3off.sites && w3off.sites[WH]);
    const onPair = [a1On.ok, D1(on3, w3, off3.facts)], offPair = [a1Off.ok, D1(off3, w3off, off3.facts)];
    R.check('(4b)', '?hag=0 で tavern の配列から消え・' + WH_SITE + ' が中継点 (tavern と world.html)・cleared=[' + MFS.join(', ') + '] の解放済みから魔女の小屋が消える (件数 −1)・(1a)(1d) の条件が ON/OFF で反転',
      offOk && onPair.every((x) => x === true) && offPair.every((x) => x === false),
      { offOk, on: onPair, off: offPair, offFacts: off3.facts, worldOff: { cls: w3off.cls, node: w3off.node, sign: w3off.sign } });
    const rs = retired ? { on: sha16(retired.on), hag: sha16(retired.hag), tomb: sha16(retired.tomb), cargo: sha16(retired.cargo), warren: sha16(retired.warren), tower: sha16(retired.tower) } : null;
    const shaWant = [SHA_AFTER_HAG, SHA_AFTER_TOMB, SHA_AFTER_CARGO, SHA_AFTER_WARREN, SHA_AFTER_TOWER];
    R.check('(4c)', 'retireHag() → retireTomb() → retireCargo() → retireWarren() → retireTower() の各段の地図の sha1 = ' + shaWant.join(' / ') + ' (1 段目 = 6213fcb の既定)・既定の地図はそのどれとも違う',
      !!rs && rs.hag === SHA_AFTER_HAG && rs.tomb === SHA_AFTER_TOMB && rs.cargo === SHA_AFTER_CARGO && rs.warren === SHA_AFTER_WARREN && rs.tower === SHA_AFTER_TOWER && shaWant.indexOf(rs.on) < 0,
      { sha: rs, sitesOn: retired && Object.keys(retired.on.sites).length, sitesTower: retired && Object.keys(retired.tower.sites).length });

    /* ══════════ index: 開幕の語り (?autoplay=1 のページで #dmBody に実際に出た文) ══════════ */
    const np = await newPage();
    await prep(np, null, idxSeed(WH));
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
    let NARR = null;
    {
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        NARR = await np.evaluate((ID) => ({ paras: (typeof SCENARIO_NARRATIONS !== 'undefined' && SCENARIO_NARRATIONS[ID]) ? SCENARIO_NARRATIONS[ID].slice() : null,
          seen: (window.__narrSeen || []).slice(), started: typeof gameStarted !== 'undefined' && !!gameStarted, scen: typeof scenarioId !== 'undefined' ? scenarioId : null }), WH).catch(() => NARR);
        if (NARR && NARR.started) break;
        await sleep(500);
      }
    }
    await np.close().catch(() => {});

    /* ══════════ index ?diag=1: n0 ══════════ */
    const ip = await newPage();
    await gotoIndex(ip, WH);
    await ip.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(2500);
    const N0 = await ip.evaluate((SNAP, TS, HT) => {
      const o = (new Function('return (' + SNAP + ')'))()(null);
      const tv = window.__witchHutTV;
      o.seams = { tvHag: !!(tv && tv.ENEMY_TYPES && tv.ENEMY_TYPES.greenHag && tv.ENEMY_TYPES.greenHag.mistPassage),
                  build: typeof window.buildWitchHutRun, pass: typeof window.hagMistPassage, tile: typeof window.pickHagPassageTile,
                  passProbe: Array.isArray(window.__hagPassageProbe), choiceProbe: Array.isArray(window.__hagChoiceProbe) };
      try {
        const run = window.buildWitchHutRun();
        o.ledger = run.nodes.map((n) => ({ id: n.id, kind: n.kind,
          slots: [].concat(...n.mapDef.rooms.map((r) => (r.enemySlots || []).map((s) => s[2]))),
          boss: [].concat(...n.mapDef.rooms.map((r) => r.bossSlot ? [r.bossSlot[2]] : [])) }));
        const keys = Array.from(new Set([].concat(...o.ledger.map((n) => n.slots.concat(n.boss)))));
        o.ledgerKeys = keys.map((k) => ({ k, known: !!ENEMY_TYPES[k], inHut: HT.indexOf(k) >= 0 }));
      } catch (e) { o.ledger = 'ERR ' + e.message; }
      o.passTypes = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k] && ENEMY_TYPES[k].mistPassage);
      o.say = (new Function('return (' + TS + ')'))()(true);
      return o;
    }, NODE_SNAP.toString(), TRAP_SAY.toString(), HUT_TYPES);
    /* (2c) の宝箱は撤退の腕 ?roadchest=0 の起動ノード n0 で数える */
    const ipRC = await newPage();
    await gotoIndex(ipRC, WH, '?diag=1&roadchest=0');
    const N0rc = await ipRC.evaluate(() => ({ cur: currentNodeId, traps: traps.length, chests: roomChests.length }));
    await ipRC.close().catch(() => {});

    /* ══════════ index ?diag=1: n1 (入場の観測 → 2 択 (戦う) → ループを止めて霧渡りを直接呼ぶ) ══════════ */
    const N1 = await ip.evaluate(async (SNAP, TS, CAUL, ZOF) => {
      const H = window.__hw = { calls: [], preN: 0, preBad: [], entry: null };
      const snapE = () => ({ cur: currentNodeId, cleared: !!dungeonCleared,
        list: enemies.map((e) => ({ type: e.type, alive: !!e.alive, inactive: !!e.inactive, passive: !!e.passiveNpc })) });
      const oC = showCharChoice;
      showCharChoice = function (msg, cands) {
        if (/その子が欲しいかい/.test(String(msg))) {
          H.calls.push({ at: performance.now(), labels: (cands || []).map((c) => c.label), state: snapE() });
          dialogPaused = true;   /* ⭐ ゲームループを止める (直接呼びの間に戦闘が始まらない・下で戻す) */
          return Promise.resolve(0);
        }
        return oC.apply(this, arguments);
      };
      /* 落ち着きを待つ (#105 の揺れの型: 判定パネル・矢印・nodeBusy・dialogPaused が 1 秒下りたまま) */
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
      H.entry = snapE(); H.entryAt = performance.now();
      H.passAtEntry = window.__hagPassageProbe.length; H.choiceAtEntry = window.__hagChoiceProbe.length;
      H.iv = setInterval(() => {
        if (H.calls.length) return;
        H.preN++;
        const st = snapE();
        if (st.cleared || !st.list.every((x) => !x.alive || (x.inactive && !x.passive))) { if (H.preBad.length < 5) H.preBad.push(st); }
      }, 50);
      { const t0 = performance.now(); while (!H.calls.length && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50)); }
      clearInterval(H.iv);
      await new Promise((r) => setTimeout(r, 300));
      const o = (new Function('return (' + SNAP + ')'))()(CAUL);
      o.settle = settle;
      o.H = JSON.parse(JSON.stringify(H));
      o.dpAfterChoice = !!dialogPaused;
      o.say = (new Function('return (' + TS + ')'))()(false);
      /* ── (3b)(3c)(3d) 霧渡りの直接呼び ── */
      const hi = enemies.findIndex((e) => e.type === 'greenHag');
      o.hagIdx = hi;
      o.direct = { encBefore: !!(encounterActive || encounterRunning), cases: [] };
      if (hi >= 0 && H.calls.length) {
        const hag = enemies[hi];
        const home = { x: hag.x, y: hag.y };
        const T = (x, y, ds) => [Math.floor((x + ds / 2) / TILE_SIZE), Math.floor((y + ds / 2) / TILE_SIZE)];
        const _d20 = d20, _rand = Math.random, _puff = spawnShadowPuff;
        const members = () => {
          const L = [];
          if (hp > 0 && !gameOver) L.push({ kind: 'leader', idx: null, cls: leaderClassKey, zone: ZOF[leaderClassKey], cx: playerX + 48, cy: playerY + 58 });
          allies.forEach((a, i) => { if (a.alive && !a.isHero) L.push({ kind: 'ally', idx: i, cls: a.classKey, zone: ZOF[a.classKey], cx: a.x + a.def.displaySize / 2, cy: a.y + a.def.displaySize / 2 }); });
          return L;
        };
        const expectOf = () => {
          const hc = { x: hag.x + hag.def.displaySize / 2, y: hag.y + hag.def.displaySize / 2 };
          const L = members();
          for (const z of ['rear', 'mid', 'front']) {
            const band = L.filter((m) => m.zone === z);
            if (!band.length) continue;
            let best = null, bd = -1;
            for (const m of band) { const d = Math.hypot(m.cx - hc.x, m.cy - hc.y); if (d > bd) { bd = d; best = m; } }
            return Object.assign({ band: band.length }, best);
          }
          return null;
        };
        const hpOf = (m) => m.kind === 'leader' ? hp : allies[m.idx].hp;
        const acOf = (m) => m.kind === 'leader' ? currentPlayerAc() : currentAllyAc(allies[m.idx]);
        const one = async (label, dead, rolls, randV, mode) => {
          hag.x = home.x; hag.y = home.y; hag.path = []; hag.slideTargetTile = null;
          const aliveBak = allies.map((a) => a.alive);
          allies.forEach((a) => { if (!a.isHero && dead.indexOf(a.classKey) >= 0) a.alive = false; });
          maxHp = Math.max(maxHp, 999); hp = maxHp;
          for (const a of allies) if (a.alive) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; }
          const exp = expectOf();
          const occ = new Set();
          if (hp > 0) { const t = [Math.floor((playerX + 48) / TILE_SIZE), Math.floor((playerY + 58) / TILE_SIZE)]; occ.add(t[0] + ',' + t[1]); }
          for (const a of allies) if (a.alive) { const t = T(a.x, a.y, a.def.displaySize); occ.add(t[0] + ',' + t[1]); }
          enemies.forEach((e, i) => { if (i !== hi && e.alive) { const t = T(e.x, e.y, e.def.displaySize); occ.add(t[0] + ',' + t[1]); } });
          const prodOcc = getUnitOccupiedTiles(hag);
          const tgtTile = exp ? [Math.floor(exp.cx / TILE_SIZE), Math.floor(exp.cy / TILE_SIZE)] : null;
          const hp0 = exp ? hpOf(exp) : null, ac0 = exp ? acOf(exp) : null;
          const from0 = T(hag.x, hag.y, hag.def.displaySize);
          let k = 0, calls = 0, puffN = 0;
          d20 = function () { calls++; const v = rolls[k++]; return v == null ? 10 : v; };
          Math.random = function () { return randV; };
          if (mode === 'throw') spawnShadowPuff = function () { puffN++; if (puffN === 2) throw new Error('検証: 移動先の霧で例外'); return _puff.apply(this, arguments); };
          const prevOp = hag.vfxOpacity;
          hag.inactive = false;
          const n0 = window.__hagPassageProbe.length;
          let ret = null, err = null;
          try { ret = await hagMistPassage(hi); } catch (e) { err = String(e && e.message || e); }
          finally { d20 = _d20; Math.random = _rand; spawnShadowPuff = _puff; }
          const recs = window.__hagPassageProbe.slice(n0).map((r) => JSON.parse(JSON.stringify(r)));
          const at1 = T(hag.x, hag.y, hag.def.displaySize);
          const hp1 = exp ? hpOf(exp) : null;
          const r0 = recs[0] || null;
          const dest = r0 && r0.to ? r0.to : null;
          const c = { label, dead, rolls, randV, mode: mode || null, ret, err, d20calls: calls, recs, exp: exp && { kind: exp.kind, idx: exp.idx, zone: exp.zone, cls: exp.cls, band: exp.band },
            tgtTile, from0, at1, hp0, hp1, ac0, prevOp, opAfter: hag.vfxOpacity };
          if (dest && tgtTile) {
            c.adj = Math.max(Math.abs(dest[0] - tgtTile[0]), Math.abs(dest[1] - tgtTile[1])) === 1;
            c.destWall = isTileWall(dest[0], dest[1]);
            c.destOcc = occ.has(dest[0] + ',' + dest[1]);
            c.destProdOcc = prodOcc.has(dest[0] + ',' + dest[1]);
            const q = aStar(tgtTile[0], tgtTile[1], dest[0], dest[1]);
            c.destPath = q ? q.length : null;
            c.zoneOfEntity = r0.kind === 'leader' ? ZOF[leaderClassKey] : (allies[r0.idx] ? ZOF[allies[r0.idx].classKey] : null);
          }
          allies.forEach((a, i) => { a.alive = aliveBak[i]; });
          hag.x = home.x; hag.y = home.y; hag.path = []; hag.slideTargetTile = null;
          o.direct.cases.push(c);
        };
        /* 帯 3 通り × Math.random 2 通り。rolls は高い方を 2 回目 / 1 回目に置く (命中 / 外れの両方) */
        await one('rear-hit', [], [3, 19], 0, null);
        await one('rear-miss', [], [2, 1], 0.999, null);
        await one('mid-hit', ['mage'], [19, 3], 0, null);
        await one('mid-miss', ['mage'], [1, 2], 0.999, null);
        await one('front-hit', ['mage', 'cleric'], [3, 19], 0, null);
        await one('front-miss', ['mage', 'cleric'], [2, 1], 0.999, null);
        await one('rear-throw', [], [3, 19], 0, 'throw');
        o.direct.wrappedBack = (d20 === _d20 && Math.random === _rand && spawnShadowPuff === _puff);
        o.direct.home = home;
      }
      o.direct.encAfter = !!(encounterActive || encounterRunning);
      o.direct.dpDuring = !!dialogPaused;
      o.direct.probeAfterDirect = window.__hagPassageProbe.length;
      /* 戦闘の準備: 直接呼びの記録を消し、霧渡りを未使用へ戻し、ループを再開する */
      if (hi >= 0) enemies[hi].__passageUsed = false;
      window.__hagPassageProbe.length = 0;
      dialogPaused = false;
      return o;
    }, NODE_SNAP.toString(), TRAP_SAY.toString(), CAUL, ZONE_OF);
    /* (3e) 塞いだ盤面の戦闘 (ハグの最初の手番だけ隊員の隣 8 マスを塞ぐ) */
    const FB = await stage('battle-fellback', () => battle(ip, HAG, FB_TURNS, true), { started: false, S: { watch: [], other: {} } });
    await ip.close().catch(() => {});

    /* ══════════ index ?autoplay=1: 戦う道 / 取り引きの道 ══════════ */
    const AF = await stage('auto-fight', () => autoRun('fight'), { S: {} });
    const AB = await stage('auto-bargain', () => autoRun('bargain'), { S: {} });

    /* ══════════ (3f) 他のボス: 巣穴の族長・倉庫街の司祭・墓所のマミー ══════════ */
    const otherBoss = async (sid, type) => {
      const kp = await newPage();
      await gotoIndex(kp, sid);
      await kp.evaluate(() => { try { startGame(); } catch (e) {} });
      await sleep(2000);
      await kp.evaluate(async () => { await enterNode('n1', 'right'); await new Promise((r) => setTimeout(r, 1200)); window.__hagPassageProbe.length = 0; });
      const F = await stage('battle-' + type, () => battle(kp, type, BOSS_TURNS, false), { started: false, S: { watch: [], other: {} } });
      await kp.close().catch(() => {});
      return F;
    };
    const FK = await otherBoss(WARREN, CHIEF);
    const FP = await otherBoss(CARGO, PRIEST);
    const FM = await otherBoss(TOMB, MUMMY);

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
    const EXIST = (probeBase.keys || []).filter((k) => k !== WH);
    const ten = [];
    for (let i = 0; i < EXIST.length; i++) {
      const sid = EXIST[i], seed = 106000 + i * 7919;
      const b = await runSpawn(sid, true, seed);
      const c = await runSpawn(sid, false, seed);
      ten.push({ sid, base: b, cur: c });
    }
    await sp.close().catch(() => {});

    /* ── §0 ── */
    const led = Array.isArray(N0.ledger) ? N0.ledger : [];
    const l0 = led.find((n) => n.id === 'n0') || {}, l1 = led.find((n) => n.id === 'n1') || {};
    const n1h = (N1.enemies || []).filter((e) => e.type === HAG).length;
    R.check('(0a)', '[装置] __witchHutTV (ハグの型) / buildWitchHutRun / hagMistPassage / pickHagPassageTile が見え、2 ノード (n0 start / n1 boss) の台帳と実体の敵が 0 体でない・台帳の鍵 ⊆ ' + HUT_TYPES.join('・') + '・n1 のボスはハグ 1',
      N0.seams.tvHag && N0.seams.build === 'function' && N0.seams.pass === 'function' && N0.seams.tile === 'function'
        && N0.scen === WH && J(N0.nodes) === J(['n0:start', 'n1:boss']) && N0.cur === 'n0' && N1.cur === 'n1'
        && led.length === 2 && (l0.slots || []).length >= 1 && (l1.slots || []).length >= 1 && J(l1.boss) === J([HAG]) && J(l0.boss) === J([])
        && (N0.ledgerKeys || []).every((x) => x.known && x.inHut)
        && (N0.enemies || []).length >= 1 && (N1.enemies || []).length >= 2 && n1h === 1 && (N0.enemies || []).every((e) => e.type !== HAG),
      { seams: N0.seams, scen: N0.scen, nodes: N0.nodes, cur: [N0.cur, N1.cur], ledger: N0.ledger, n0: (N0.enemies || []).map((e) => e.type), n1: (N1.enemies || []).map((e) => e.type) });
    const H1 = N1.H || {};
    R.check('(0b)', '[装置] __hagPassageProbe / __hagChoiceProbe が配列で在り、発動前 (n0・n1 の入場直後) は 0 件',
      N0.seams.passProbe === true && N0.seams.choiceProbe === true && N0.passLen === 0 && N0.choiceLen === 0 && H1.passAtEntry === 0 && H1.choiceAtEntry === 0,
      { n0: [N0.passLen, N0.choiceLen], n1Entry: [H1.passAtEntry, H1.choiceAtEntry] });
    const allQuiet = (st) => !!st && st.cur === 'n1' && st.cleared === false && st.list.filter((x) => x.alive).length >= 2
      && st.list.every((x) => !x.alive || (x.inactive === true && x.passive === false));
    const call1 = (H1.calls || [])[0] || null;
    const AFS = (AF.S || {}), ABS = (AB.S || {});
    R.check('(0c)', '⭐ n1 に入った直後 (2 択の前) ハグと手下が全員 inactive かつ passiveNpc が偽・未制覇 — ① ?diag=1: 入場直後・2 択までの 50ms ごとの全観測・2 択が呼ばれた瞬間 / ② ?autoplay=1 (本番の出口の流れで入場): 入場直後・2 択までの全観測',
      allQuiet(H1.entry) && (H1.preBad || []).length === 0 && !!call1 && allQuiet(call1.state)
        && allQuiet(AFS.entry) && (AFS.preBad || []).length === 0 && AFS.preN > 0 && allQuiet(ABS.entry) && (ABS.preBad || []).length === 0,
      { diag: { entry: H1.entry, preN: H1.preN, preBad: H1.preBad, atCall: call1 && call1.state }, auto: { entry: AFS.entry, preN: AFS.preN, preBad: AFS.preBad },
        autoBargain: { entry: ABS.entry, preN: ABS.preN, preBad: ABS.preBad } });
    /* ── §2 ── */
    const p0 = (N0.paintings || [])[0] || {}, p1 = (N1.paintings || [])[0] || {};
    const g0 = (p0.src && p0.bakeTile) ? gridCheck(p0.src, p0.bakeTile) : { ok: false, why: 'n0 に絵が無い / 1 マスの画素が縦横で揃わない' };
    const g1c = (p1.src && p1.bakeTile) ? gridCheck(p1.src, p1.bakeTile) : { ok: false, why: 'n1 に絵が無い / 1 マスの画素が縦横で揃わない' };
    R.check('(2a)', '焼き上がり 2 枚 (n0 / n1 に貼られた絵) が make_grid_map.py --check の縦横 3 指標で OK (--tile = 絵の実寸 / マス数)',
      g0.ok && g1c.ok && p0.src !== p1.src, { n0: [p0.src, p0.bakeTile, g0], n1: [p1.src, p1.bakeTile, g1c] });
    const caulN = (CAUL.c2 - CAUL.c1 + 1) * (CAUL.r2 - CAUL.r1 + 1);
    const hagAdjOk = (N1.hagAdj || []).length > 0 && (N1.hagAdj || []).some((a) => typeof a.len === 'number');
    R.check('(2b)', '本番の aStar で n0 入口 → 出口の手前・各敵 / n1 入口 → 各敵 (ハグを含む)・ハグの隣のどこか が通る・敵のタイルは全部歩ける・大鍋 ' + caulN + ' マスは全部壁',
      typeof N0.pathToExit === 'number' && N0.pathToExit > 0 && (N0.pathToEnemies || []).length > 0 && N0.pathToEnemies.every((x) => typeof x === 'number')
        && (N1.pathToEnemies || []).length > 0 && N1.pathToEnemies.every((x) => typeof x === 'number') && hagAdjOk
        && N0.enemyWall.length === 0 && N1.enemyWall.length === 0
        && !!N1.caul && N1.caul.open.length === 0 && N1.caul.wall === caulN,
      { n0: { from: N0.player, exitInner: N0.exitInner, pathToExit: N0.pathToExit, toEnemies: N0.pathToEnemies, wall: N0.enemyWall },
        n1: { from: N1.player, toEnemies: N1.pathToEnemies, hagAdj: N1.hagAdj, wall: N1.enemyWall, caul: N1.caul } });
    const TT = N0.say && N0.say.tt || {};
    const thornText = TT[N0_TRAP] && TT[N0_TRAP].dmText, hexText = TT[N1_TRAP] && TT[N1_TRAP].dmText;
    const s0 = N0.say || {}, s1 = N1.say || {};
    R.check('(2c)', '罠が n0 に 1 つ (' + N0_TRAP + ')・n1 に 1 つ (' + N1_TRAP + ')・湧いた罠を踏むと語りが dmText・n0 に宝箱 (?roadchest=0 の腕)',
      (N0.traps || []).length === 1 && N0.traps[0].type === N0_TRAP && (N1.traps || []).length === 1 && N1.traps[0].type === N1_TRAP
        && typeof thornText === 'string' && typeof hexText === 'string' && J(s0.spawned) === J([thornText]) && J(s1.spawned) === J([hexText])
        && N0rc.cur === 'n0' && N0rc.chests > 0,
      { n0: N0.traps, n1: N1.traps, spawnedSay: [s0.spawned, s1.spawned], roadchest0: N0rc });
    const area0 = (p0.tw || 0) * (p0.th || 0), area1 = (p1.tw || 0) * (p1.th || 0);
    const indoor = (N, p, area) => N.custom && N.themeId === WH && !!p.loaded && area > 0 && !!N.outdoor && N.outdoor.rooms === 0 && N.outdoor.exploredNow < area;
    const flagsOk = Array.isArray(N0.outdoorFlags) && N0.outdoorFlags.length === 2 && N0.outdoorFlags.every((x) => x[1] === false);
    R.check('(2d)', '2 枚とも outdoor が付いていない (ROOM_PAINTINGS_DEF["' + WH + '"] の n0big / n1big)・isCustom (テーマ ' + WH + ')・絵が読み込まれ、屋外の開放 0・探索済み < 絵の範囲 = 暗幕が効く',
      flagsOk && indoor(N0, p0, area0) && indoor(N1, p1, area1),
      { flags: N0.outdoorFlags, custom: [N0.custom, N1.custom], theme: [N0.themeId, N1.themeId], p0: { loaded: p0.loaded, tw: p0.tw, th: p0.th }, p1: { loaded: p1.loaded, tw: p1.tw, th: p1.th },
        out0: N0.outdoor && { rooms: N0.outdoor.rooms, explored: N0.outdoor.exploredNow, area: area0 }, out1: N1.outdoor && { rooms: N1.outdoor.rooms, explored: N1.outdoor.exploredNow, area: area1 } });
    /* ── §3 ── */
    const hw = AFS.hag || [];
    const h1 = hw[0] || null, hr = h1 && h1.recs && h1.recs[0];
    const hLater = hw.slice(1);
    R.check('(3a)', '戦う道 (?autoplay=1) でハグの最初の手番に __hagPassageProbe 1 件 (霧渡り・その手番で pickBossAction は呼ばれない = 行動選択の前)・2 回目以降 (' + (BOSS_TURNS - 1) + ' 回以上) は増えない・__passageUsed が立つ',
      !!h1 && h1.added === 1 && !!hr && hr.fellBack === false && h1.pba === 0 && h1.used0 === false && h1.used1 === true
        && Array.isArray(hr.rolls) && hr.rolls.length === 2
        && hLater.length >= BOSS_TURNS - 1 && hLater.every((t) => t.added === 0) && (AF.passProbe || []).length === 1,
      { first: h1, later: hLater.map((t) => ({ n: t.n, added: t.added, pba: t.pba })), total: (AF.passProbe || []).length, encAt: AFS.encAt, ms: AF.ms });
    const Dd = N1.direct || {};
    const cs = Dd.cases || [];
    const bandOf = (c) => c.label.split('-')[0];
    const caseB = (c) => {
      const r = (c.recs || [])[0];
      if (!r || c.recs.length !== 1 || r.fellBack !== false || c.ret !== true || c.err !== null) return false;
      if (!c.exp || c.exp.zone !== bandOf(c)) return false;   /* 編成の作り替えが効いている (期待の帯 = 名札) */
      if (r.kind !== c.exp.kind || r.idx !== c.exp.idx || r.zone !== c.exp.zone || c.zoneOfEntity !== c.exp.zone) return false;
      return c.adj === true && c.destWall === false && c.destOcc === false && c.destProdOcc === false && typeof c.destPath === 'number'
        && J(c.at1) === J(r.to) && J(c.from0) === J(r.from);
    };
    const plain = cs.filter((c) => c.mode === null);
    R.check('(3b)', '狙い = rear → mid → front の最初の帯の、ハグから一番遠い 1 人 (帯 3 通り × Math.random 0 / 0.999 で同じ = 乱数を使わない・probe の kind / idx / zone と実体の隊員の classKey の帯が一致)・移動先は狙った相手の隣 8 マスで isTileWall でない・本番の aStar で相手から通る・getUnitOccupiedTiles と自前の占有のどちらにも無い・ハグがそこへ移る',
      !Dd.encBefore && !Dd.encAfter && Dd.dpDuring === true && Dd.wrappedBack === true && plain.length === 6 && plain.every(caseB)
        && ['rear', 'mid', 'front'].every((z) => plain.filter((c) => bandOf(c) === z).length === 2),
      { cases: plain.map((c) => ({ label: c.label, rand: c.randV, exp: c.exp, rec: c.recs[0] && { kind: c.recs[0].kind, idx: c.recs[0].idx, zone: c.recs[0].zone, from: c.recs[0].from, to: c.recs[0].to },
        ent: c.zoneOfEntity, tgt: c.tgtTile, adj: c.adj, wall: c.destWall, occ: [c.destOcc, c.destProdOcc], path: c.destPath, at1: c.at1, ok: caseB(c), err: c.err })), enc: [Dd.encBefore, Dd.encAfter], dp: Dd.dpDuring });
    const caseC = (c) => {
      const r = (c.recs || [])[0];
      if (!r || c.d20calls !== 2 || !Array.isArray(r.rolls) || J(r.rolls) !== J(c.rolls.slice(0, 2))) return false;
      const want = Math.max(c.rolls[0], c.rolls[1]);
      if (r.roll !== want || r.ac !== c.ac0) return false;
      const wantHit = want >= 20 || (want !== 1 && r.total >= r.ac);
      if (r.hit !== wantHit) return false;
      const drop = c.hp0 - c.hp1;
      return r.hit ? (r.dmg > 0 && drop === r.dmg) : (r.dmg === 0 && drop === 0);
    };
    R.check('(3c)', '有利: probe の rolls が差し替えた 2 つの d20 (d20 はちょうど 2 回) で roll = max(rolls) (高い方を 2 回目 / 1 回目の両方)・命中なら狙った相手の HP が dmg だけ減る・外れなら減らない (命中 3 / 外れ 3)',
      plain.length === 6 && plain.every(caseC) && plain.filter((c) => (c.recs[0] || {}).hit === true).length === 3 && plain.filter((c) => (c.recs[0] || {}).hit === false).length === 3
        && plain.some((c) => c.rolls[0] > c.rolls[1] && (c.recs[0] || {}).hit) && plain.some((c) => c.rolls[1] > c.rolls[0] && (c.recs[0] || {}).hit),
      plain.map((c) => ({ label: c.label, rolls: c.rolls, d20: c.d20calls, rec: c.recs[0] && { rolls: c.recs[0].rolls, roll: c.recs[0].roll, total: c.recs[0].total, ac: c.recs[0].ac, hit: c.recs[0].hit, dmg: c.recs[0].dmg }, ac0: c.ac0, hp: [c.hp0, c.hp1], ok: caseC(c) })));
    const thr = cs.find((c) => c.mode === 'throw') || null;
    const opOk = (c) => !!c && c.opAfter === c.prevOp && c.opAfter !== '0';
    R.check('(3d)', '霧渡りの後、ハグの透明度 (vfxOpacity) が発動前の値に戻っている (6 回とも)・移動先の霧 (spawnShadowPuff の 2 回目) で例外を投げさせた回でも戻る',
      plain.length === 6 && plain.every(opOk) && !!thr && typeof thr.err === 'string' && /検証/.test(thr.err) && opOk(thr),
      { plain: plain.map((c) => [c.label, c.prevOp, c.opAfter]), thrown: thr && { err: thr.err, prev: thr.prevOp, after: thr.opAfter } });
    const FS = FB.S || { watch: [] };
    const f1 = (FS.watch || [])[0] || null, fr = f1 && f1.recs && f1.recs[0];
    R.check('(3e)', '移動先が無い盤面 (ハグの最初の手番だけ隊員の隣 8 マスを塞ぐ) で probe 1 件 fellBack: true・to が null・from = 手番の初めの位置・その手番に普通の行動 (pickBossAction が呼ばれる)・__passageUsed は立つ・2 手番目に霧渡りはしない',
      FB.started && !!f1 && f1.blocked > 0 && f1.added === 1 && !!fr && fr.fellBack === true && fr.to === null && J(fr.from) === J(f1.at0)
        && f1.pba >= 1 && f1.used1 === true && (FS.watch || []).length >= FB_TURNS && FS.watch.slice(1).every((t) => t.added === 0),
      { started: FB.started, startMs: FB.startMs, diag: FB.diag, first: f1, later: (FS.watch || []).slice(1).map((t) => ({ n: t.n, added: t.added, pba: t.pba })), settle: N1.settle });
    const otherOk = (F) => F.started && ((F.S || {}).watch || []).length >= BOSS_TURNS && F.S.watch.every((t) => t.added === 0) && (F.S.other || {}).added === 0 && (F.probeAll || []).length === 0
      && F.trapsAtEnd === F.trapsAtEntry;
    const passTurn = h1 || {};
    R.check('(3f)', 'mistPassage を持つ型 = ' + HAG + ' だけ / 小屋の手下の手番 (全自動・塞いだ盤面) と巣穴の族長・倉庫街の司祭・墓所のマミー (' + BOSS_TURNS + ' 手番ずつ) と手下の手番で probe が増えない / 霧渡りの手番で traps.length が変わらない',
      J(N0.passTypes) === J([HAG]) && ((AFS.other || {}).turns || 0) + ((FS.other || {}).turns || 0) >= 1 && (AFS.other || {}).added === 0 && ((FS.other || {}).added === 0)
        && passTurn.trapsBefore === passTurn.trapsAfter && !!hr && hr.trapsLen === passTurn.trapsBefore
        && otherOk(FK) && otherOk(FP) && otherOk(FM),
      { types: N0.passTypes, hutOther: [AFS.other, FS.other], passTurnTraps: [passTurn.trapsBefore, passTurn.trapsAfter, hr && hr.trapsLen],
        warren: { started: FK.started, turns: ((FK.S || {}).watch || []).map((t) => t.added), other: FK.S && FK.S.other, probe: FK.probeAll },
        cargo: { started: FP.started, turns: ((FP.S || {}).watch || []).map((t) => t.added), other: FP.S && FP.S.other, probe: FP.probeAll },
        tomb: { started: FM.started, turns: ((FM.S || {}).watch || []).map((t) => t.added), other: FM.S && FM.S.other, probe: FM.probeAll } });
    /* ── §4 ── */
    const paras = (NARR && NARR.paras) || [];
    const seenAll = paras.length === 4 && paras.every((p) => (NARR.seen || []).some((t) => t.replace(/\s+/g, '') === p.replace(/\s+/g, '')));
    const existOk = ten.length > 0 && ten.some((x) => (x.base.said || []).length > 0)
      && ten.every((x) => J(x.base.said) === J(x.cur.said) && (x.cur.said || []).every((t) => t !== thornText && t !== hexText));
    R.check('(4a)', '開幕の語り 4 行が #dmBody に出る・n0 の罠 = 茨の語り (頭・仲間)・n1 = 呪いの人形の語り・第 2 引数が優先・既存 ' + ten.length + ' シナリオは ' + BASE_REV + ' と同じ語り',
      !!NARR && NARR.scen === WH && seenAll
        && s0.dmWrapped === true && typeof thornText === 'string' && /茨/.test(thornText) && typeof hexText === 'string' && /呪い/.test(hexText)
        && s0.type === N0_TRAP && s1.type === N1_TRAP && J(s0.player) === J([thornText]) && J(s0.ally) === J([thornText]) && J(s0.arg) === J(['引数の語り(検証)'])
        && J(s1.player) === J([hexText]) && J(s1.arg) === J(['引数の語り(検証)']) && existOk,
      { narr: NARR && { scen: NARR.scen, paras: paras.length, seen: (NARR.seen || []).length, all: seenAll }, thorn: thornText, hex: hexText,
        n0: { type: s0.type, player: s0.player, ally: s0.ally, arg: s0.arg }, n1: { type: s1.type, player: s1.player, arg: s1.arg },
        exist: ten.map((x) => ({ sid: x.sid, same: J(x.base.said) === J(x.cur.said) })) });
    const ac1 = (AFS.calls || [])[0] || null;
    const cp = AF.choiceProbe || [];
    const openMs = (ac1 && AFS.n1At) ? Math.round(ac1.at - AFS.n1At) : null;
    const afterAwake = !!AFS.after && AFS.after.list.filter((x) => x.alive).length >= 2 && AFS.after.list.every((x) => !x.alive || (x.inactive === false && x.passive === false));
    R.check('(4d)', '⭐ ?autoplay=1 で n1 に入ると 2 択が入場から ' + (DIALOG_N_MS / 1000) + ' 秒以内に 1 回だけ開き (先頭の候補 = 戦う・probe 1 件 choice 0・autoplay)、ハグと手下の inactive が外れ、その後に戦闘が始まる。2 択の前に制覇しない',
      !!AFS.n1At && (AFS.calls || []).length === 1 && openMs !== null && openMs >= 0 && openMs <= DIALOG_N_MS && /戦/.test((ac1.labels || [])[0] || '')
        && cp.length === 1 && cp[0].choice === 0 && cp[0].autoplay === true && cp[0].node === 'n1'
        && afterAwake && !!AFS.encAt && AFS.encAt > ac1.at && (AFS.preBad || []).length === 0 && (!AFS.clearAt || AFS.clearAt > ac1.at),
      { openMs, calls: (AFS.calls || []).map((c) => ({ labels: c.labels, autoplay: c.autoplay })), probe: cp, after: AFS.after, encAfterChoiceMs: (AFS.encAt && ac1) ? Math.round(AFS.encAt - ac1.at) : null,
        preN: AFS.preN, preBad: AFS.preBad, inst: AF.inst, lr: AF.lr, ms: AF.ms, err: AF.err });
    const clearXpOf = (A) => ((A.S || {}).xp || []).filter((x) => x[1] === 'クリア報酬').map((x) => x[0]);
    const xpSum = (A) => (A.S || {}).xpSave;   /* xp を localStorage へ書いた瞬間までの gainXP の合計 */
    const goldExtra = (A) => (A.gold1 - ((A.S || {}).gold0 || 0)) - (A.coins || 0) - (A.roadChest || 0);
    const bcp = AB.choiceProbe || [];
    const tableG = AB.table ? AB.table.g : null, tableX = AB.table ? AB.table.x : null;
    R.check('(4e)', '⭐ 取り引きの道 (2 択に 1 を返す): 制覇 (lastResult.cleared)・ハグは生きたまま passiveNpc・霧渡り 0・probe { choice 1, scaledGold 0, scaledXp = floor(表の clearXp / 2) }・gainXP の「クリア報酬」も同じ 1 回・gold の増分 − 道中の coins − 宝箱の補填 = 0 (礼金が入らない)・xp の増分 = 保存の瞬間までの gainXP の合計・SCENARIOS["' + WH + '"] の表は書き換わらない (戦う道と同じ値)',
      !!AB.lr && AB.lr.cleared === true && AB.lr.scenarioId === WH && !!AB.hag && AB.hag.alive === true && AB.hag.passive === true && (AB.passProbe || []).length === 0
        && bcp.length === 1 && bcp[0].choice === 1 && bcp[0].scaledGold === 0 && typeof tableX === 'number' && tableX > 0 && bcp[0].scaledXp === Math.floor(tableX / 2)
        && J(clearXpOf(AB)) === J([Math.floor(tableX / 2)]) && goldExtra(AB) === 0 && (AB.xp1 - ((AB.S || {}).xp0 || 0)) === xpSum(AB)
        && !!AF.table && tableG === AF.table.g && tableX === AF.table.x && tableG > 0
        && !!ABS.clearAt && !!(ABS.calls || [])[0] && ABS.clearAt > ABS.calls[0].at,
      { lr: AB.lr, hag: AB.hag, pass: (AB.passProbe || []).length, probe: bcp, clearXp: clearXpOf(AB), goldDelta: AB.gold1 - ((AB.S || {}).gold0 || 0), coins: AB.coins, roadChest: AB.roadChest,
        xpDelta: AB.xp1 - ((AB.S || {}).xp0 || 0), xpSum: xpSum(AB), table: AB.table, tableFight: AF.table, cur: AB.cur,
        clearAfterChoiceMs: (ABS.clearAt && (ABS.calls || [])[0]) ? Math.round(ABS.clearAt - ABS.calls[0].at) : null, ms: AB.ms, err: AB.err });
    R.check('(4f)', '戦う道の勝利で礼金 = 表の clearGold (gold の増分 − coins − 宝箱の補填)・クリア XP = 表の clearXp (gainXP の「クリア報酬」1 回)・lastResult.cleared',
      !!AF.lr && AF.lr.cleared === true && AF.lr.scenarioId === WH && !!AF.table && AF.table.g > 0 && goldExtra(AF) === AF.table.g
        && J(clearXpOf(AF)) === J([AF.table.x]) && (AF.xp1 - ((AF.S || {}).xp0 || 0)) === xpSum(AF),
      { lr: AF.lr, table: AF.table, goldDelta: AF.gold1 - ((AF.S || {}).gold0 || 0), coins: AF.coins, roadChest: AF.roadChest, clearXp: clearXpOf(AF), xpDelta: AF.xp1 - ((AF.S || {}).xp0 || 0), xpSum: xpSum(AF) });
    /* ── §6 ── */
    const tenRows = ten.map((x) => ({ sid: x.sid, traps: x.cur.traps.length, same: J(x.base.traps) === J(x.cur.traps), calls: [x.base.calls, x.cur.calls], next: x.base.next === x.cur.next,
      types: Array.from(new Set(x.cur.traps.map((t) => t[2]))) }));
    R.check('(6a)', '既存 ' + ten.length + ' シナリオ (' + BASE_REV + ' の SCENARIOS) で、同じ種の乱数のもと spawnTraps の罠 (座標・種類)・乱数の呼び出し回数・次の乱数が ' + BASE_REV + ' と同じ',
      ten.length === 10 && EXIST.indexOf(WH) < 0 && EXIST.indexOf(WARREN) >= 0 && EXIST.indexOf(CARGO) >= 0 && EXIST.indexOf(TOMB) >= 0 && ten.some((x) => x.cur.traps.length > 0)
        && ten.every((x) => J(x.base.traps) === J(x.cur.traps) && x.base.calls === x.cur.calls && x.base.next === x.cur.next),
      { exist: EXIST, rows: tenRows });
    const curIndex = servedFile(F_INDEX, mutKey);
    const srcRows = SOURCE_FNS.map((n) => { const a = fnSource(BASE_INDEX, n), b = fnSource(curIndex, n); return { n, base: a ? a.length : null, cur: b ? b.length : null, same: !!a && a === b }; });
    R.check('(6b)', '写し元の関数 (' + SOURCE_FNS.join(' / ') + ') のソースが ' + BASE_REV + ' と同じ (沼の若い司祭の 2 択の器・showCharChoice・シャドウステップ・傷を腐らせる手・クリア判定を触っていない)',
      srcRows.every((r) => r.same && r.cur > 100), srcRows);
    /* ══════════ (0d) ══════════ */
    R.check('(0d)', '[装置] 全ページで pageerror 0 件 (段の例外は記録だけ: 例外の出た段の節が赤になる)', ctx.booted > 0 && ctx.errs.length === 0, '起動 ' + ctx.booted + ' 回 / pageerror ' + J(ctx.errs.slice(0, 3)) + ' / 段の例外 ' + J(STAGE_ERRS));
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
  const profile = require('./_pptr_profile')('df_verify_witch_hut_');
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
