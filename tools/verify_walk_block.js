#!/usr/bin/env node
/*
 * verify_walk_block.js — #46「段差を迂回させる / 魔法陣を足元へ / 頭上バッジ廃止」の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-03_walk-block-and-vfx-fixes.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§4 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で締める。
 *   後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる (手本 = tools/verify_enemy_name_label.js)。
 *
 * ■ 項目 4 (このコミット) で入ったもの — **§4 撤退 (4a)(4d) / 変異 sealrail・sealp8・overblock**
 *   ⇒ これで **PENDING 0 / 変異 16 本すべて実装済**。
 *   ⭐⭐⭐ (4a) は「塞がり率が 58.75% へ戻る」だけでは**永久緑**になる (1 マスも足さなければ
 *     素のアームも 58.75% なので、撤退アームの数値だけ見る assert は何も検出しない)。
 *     ⇒ ① 撤退アームが本当に撤退アームか (walkBlockOn===false) ② 足した数 walkBlockNew >= 1
 *        ③ 撤退で実際に外れた数 skipWalkBlock === walkBlockNew ④ 素のアームとの**差**が
 *        ちょうど walkBlockNew — の 4 つを AND で見る。①〜④ のどれが欠けても永久緑になる。
 *   ⭐ (4d) は「撤退枝にしか無いコードは素のアームだけ見る assert では捕まらない」の実装。
 *     ⛔ 撤退用に「#46 前のマスク」をもう 1 セット持つ形にしなかったので (門番を 1 本足す形)、
 *       撤退アームでも到達性が本番と同じ規則で測れる。
 *
 * ■ 項目 3 で入ったもの — **§3 バッジ廃止 (3a)〜(3d) / §4 撤退 (4c)**
 *   ⭐⭐⭐ (3b) の「恒等」は **着手前 hash (e3dfb4a) の index.html を別ポートで同時配信**して測る。
 *     ⛔ `git show HEAD:` を基準にすると実装後は HEAD が動いて**永久緑**になる (#37 の教訓)。
 *     基準が本当に基準かを **3 重**に検算している: ① 配信前にソースへ ENEMY_BADGE_ON が
 *     無いこと ② 配信前にバッジ生成が 1 箇所あること ③ 測定後に基準側の .enemyBadge が
 *     1 個以上あること。①②③のどれかが崩れたら popFail か exit 3 で止まる。
 *   ⭐⭐⭐ 恒等の決定論は「測る直前に camZ / camX / camY / shake / 敵の座標を**全部固定**」して作る。
 *     ⛔ 実プレイの流れのまま測ると両アームでカメラが数 px ずれ、恒等ではなく測定点が動く。
 *   ⚠⚠⚠ (3c) は `enemyBadgeElements.length === enemies.length` で見る。⛔ `> 0` にしない —
 *     OFF のとき中身は全部 null なので、長さ以外では添字ずれ (§2-8 の罠) を捕まえられない。
 *
 * ■ 項目 1 で入ったもの — **§0 装置 (0a)〜(0d) / §1 到達性 (1a)〜(1f)**
 *   ⭐ **順序が肝**。マスクを 1 マスでも触る前に「間違ったマスクを入れても壊れないことを
 *     機械が保証する」装置を先に立てる (依頼書 §4-1 の冒頭)。項目 4 がマスクを触るときには
 *     既に「到達不能が出たら赤くなる」状態になっている。
 *
 * ■ ⭐⭐⭐ 到達性は **本番の `aStar` そのもの**だけで測る。ドライバ側に BFS を 1 行も書かない。
 *   ⛔ 4 近傍 `[[1,0],[-1,0],[0,1],[0,-1]]` を写経しない (index.html:5007-5009 が
 *     「8 近傍 BFS だと斜めで繋がり、実際には歩けない道を繋がっていると報告する」を
 *     **実際に踏んだ**と記録している)。(1d) の連結成分も、床タイル 1 マスずつに対して
 *     `aStar(起点 → そのタイル)` を呼ぶ形にしてある = 4 近傍の規則が本番と同一であることが
 *     **構造的に**保証される (写経しようがない)。
 *
 * ■ ⚠ 計測機構 (依頼書 §8) — 陣の実座標は **`getBoundingClientRect()`** から出す。
 *   ⛔ `el.style.left` を読む方式は §2-7 の穴 (driver_cast_circle.js:311-314 が `* camZ` を
 *      忘れており camZ≠1 を原理的に測れない) に落ちる。§2 を実装する項目 2 はここを守ること。
 *   本項目では (0c) が「陣が実際に 1 枚以上生成された」だけを見る (座標は測らない)。
 *
 * ══ 起草時の主張のうち、着手前の実測で**崩れたもの** (⭐ 依頼書 §12 へも書き残す) ══
 *
 *   ⚠⚠⚠ (A) 依頼書 §8 (1a)「起点から **4 ゲートすべて**へ経路がある」は **成立しない**。
 *     2026-09-03 実測: n1 の `down(36,24)` は **到達不能**。理由は欠陥ではなく設計の帰結:
 *       ・n1 は `exits: []` の**終端ノード**で、down は絵にもグラフにも存在しない口。
 *         `nodeGateTile` が gates 指定の無い方角に対して**辺の中点**を機械的に返しているだけ。
 *       ・`applyPaintingBlocking` の 5 つ目の門番 (gateKeys) は 4 方角**すべて**を無条件に
 *         開ける (index.html の注記どおり「安全側に倒す」)。
 *       ・その結果 (36,24) は sealRing で塞がれた row24 の中で **1 マスだけ開いた床**になり、
 *         真上の (36,23) はマスクの `#` なので、**床 1 マスの孤島**として残る。
 *     ⇒ 受入条件は**弱めず**、判定対象を `GATE_DIRS_MUST_REACH` (up / left / right) に絞り、
 *       除外は `GATE_DIRS_EXCLUDED` に**理由付きで 1 箇所だけ**宣言した。除外が黙って
 *       増えないよう (1a) 自身が「除外は down ちょうど 1 つ」も同時に見る。
 *
 *   ⚠⚠ (B) 依頼書 §8 (1d)「床タイルの 4 近傍連結成分が **1 つ**」も、そのままでは
 *     **着手前から赤**になる (上の (A) の孤島が既に居るため。実測 = 成分 2 つ [369, 1])。
 *     ⇒ 「起点から本番の `aStar` で到達できない床タイルが、**除外ゲートのタイル以外に 0 マス**」
 *       という形へ言い換えた。⭐ 新しく生まれた孤島は 1 マスでも赤になる (変異 island が実証)。
 *
 *   ⚠ (C) 依頼書 §2-4 の表「行 6 … グローバル col28 以東」は 1 タイルぶん大雑把。
 *     index.html の絵の中のコメント (唯一の正) は「col12-13 = 木の支柱 / 中央は軌道の敷かれた床」で、
 *     マスク行 6 の中央の空き run は**絵ローカル col14-24 = グローバル col31-41** (行 = 8)。
 *     global col29-30 は木の支柱で元から `#`。⇒ (1f) は col31-41 を保護対象にしてある。
 *
 *   ⚠⚠⚠ (D) 依頼書 §2-6「火炎の爆発コアも同型の欠陥 (camZ=0.25 で 22.5px ズレる)」は
 *     **誤り**。§2-6 自身が「未実測・式からの予測」と断っており、項目 2 の実測で崩れた:
 *       ・`.fxFireImpactCore` は `animation: fxFireImpactCoreAnim` で **transform を animate** する。
 *         CSS のカスケードは **animation declarations > normal author declarations (= inline style)**
 *         なので、index.html の `zTf("translate(-50%,-50%)")` は **1 度も効いていなかった**
 *         (実測: inline="translate(-50%, -50%)" / computed=matrix(0.45,0,0,0.45,0,0))。
 *       ・したがってズレは camZ に依存せず **(+30.0, +30.0)px の定数** (crit は 84px なので +42)。
 *         camZ = 1 / 0.8125 / 0.5 / 0.25 の 4 点とも同値。
 *     ⇒ 直し方が変わった。呼び口を zTfAnchored へ差し替えるのではなく、**CSS の margin で
 *       中央アンカーを取る** (index.html の 2900 行台の CSS コメントが元々そう設計だと書いている:
 *       「中央アンカー (margin で自分の半分だけ戻している) の絵は…scale すれば中心が動かない」)。
 *       inline transform は消し、「書いても効かない」理由を実測つきで注記した。
 *     ⇒ 変異 `fireonly` も「前置形へ戻す」から「**margin の中央アンカーを外す**」へ変えた
 *       (前置形へ戻す変異は**原理的に空振りする** = 何を書いても表示が 1px も変わらない)。
 *
 *   ⚠⚠ (E) 依頼書 §8「⚠ 計測機構」の `el.parentElement.getBoundingClientRect()` は使えない。
 *     `#vfxLayer` は「stacking context を作らない」ため **CSS を 1 行も持たない = position:static**
 *     (vfxHost() の注記どおり。実測 hostPos="static")。= 絶対配置の子の left/top の基準は
 *     vfxLayer ではなく**祖先の containing block**。⇒ `left:0;top:0` の 0x0 マーカーを同じ親へ
 *     挿して**原点そのものを実測**する (式も祖先の探索も写経しない)。
 *
 *   ⚠ (F) 依頼書の変異表は `origin00` → (2a)/(2e) だが、**(2e) は原理的に赤くならない**。
 *     transform-origin は rect の**位置**しか動かさず、`rect.width` は f*camZ*w のまま
 *     (実測でも一致)。⇒ targets を (2a) だけにし、(2e) は record (判定しない記録) へ落とした。
 *
 * ■ ⭐ 測る対象は **廃坑 goblin-mine の n1 のみ** (依頼書 §2-2 / §11「n1 以外の 14 枚は
 *   やらない」)。n0 から `right` で入場する = 実プレイと同じ経路を通す。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   **どのタイルを `#` にするか** — 承認で決まる値なので、ドライバに座標を焼くと候補を
 *   1 マス足すたびに赤くなる。代わりに (1e) の**塞がり率の上限**と (1f) の**規則②④の
 *   保護マス**という「規則」で縛る。陣の色・コマ送り・持続時間・径の式は
 *   `driver_cast_circle.js` の担当なので二重に縛らない。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   ⭐ 項目 3 までで実装済は **13 本**。残り 3 本 (sealrail / sealp8 / overblock) は
 *     項目 4 が埋める (⛔ MUT_ORDER からは消さない = 件数から隠さない)。
 *
 *   mutate      | 注入する欠陥                                       | 赤くなるべき節 | 実装
 *   popzero     | n1 の乱戦+護衛スロットを空にする                    | (0b)          | 項目1
 *   island      | (52,5) を塞いで (53,5) を孤島にする                 | **(1d) だけ** | 項目1
 *   sealgate    | ゲート (34,3) を塞ぐ                                | (1a)(1f)      | 項目1
 *   sealfoe     | 敵スロット (32,9) を塞ぐ                            | (1c)          | 項目1
 *   zprefix     | zTfAnchored を前置形へ戻す                          | (2a)(2c)      | 項目2
 *   camz1only   | zprefix と**同じ欠陥**を camZ=1 だけ測る assert で   | (2a) の逆変異 | 項目2
 *   origin00    | .fxCastCircle の transform-origin を 0 0 に         | (2a) ⚠(F)     | 項目2
 *   fireonly    | 火炎コアの margin 中央アンカーを外す ⚠(D)           | (2d)          | 項目2
 *   nocircle    | spawnCastCircle を常に null に                      | (0c)          | 項目2
 *   badgepush   | バッジ OFF 時に push(null) をやめる                 | (3c)          | 項目3
 *   badgeleak   | 既定で .enemyBadge を 1 個だけ作る                  | (3a)          | 項目3
 *   badgedata   | badge: を 1 件消す                                  | (3d)          | 項目3
 *   labelshift  | ついでに名前札を 3px 動かす                         | (3b)          | 項目3
 *   sealrail    | 行18 の枕木 col32-38 を塞ぐ                         | (1f)(1d)/(1e) | 項目4
 *   sealp8      | ★P8 で開けた (37,16) を塞ぐ                        | (1a)/(1b)/(1d)| 項目4
 *   overblock   | 暗部率 0.5 の自動規則で n1 を塗り直す (§2-3 の再現) | (1e)/(1d)     | 項目4
 *
 *   ⭐⭐⭐ **`island` は「(1d) が無いと何が起きるか」を機械で証明する 1 本**。
 *     他が全部緑のまま (1d) だけが赤くなること — それが (1d) の存在理由そのもの。
 *
 *   ⚠⚠⚠ 変異は **配信バイトへ実行時に注入する**。⛔ `git show HEAD:` を基準にしない
 *     (実装後は HEAD が動いて永久緑になる = #37 の教訓)。
 *   ⚠ 変異アンカーは**部分文字列一致**で、配信スナップショット中に **ちょうど 1 箇所**
 *     ヒットしなければ **exit 3 でドライバごと死ぬ** (0 件でも 2 件以上でも空振りするため)。
 *   ⚠ 置換文字列は **1 行に閉じる** (index.html はディスク上 **CRLF** なので複数行アンカーは
 *     必ず空振りする)。⚠ 置換前後で**長さを変える** ((n0b) がバイト長で検算する)。
 *
 *   ⭐ 塞ぐ変異 (island / sealgate / sealfoe) は **`obstacleTileMask` へ直接書く**形にしてある。
 *     ⚠⚠⚠ マスクの行文字列に `#` を書いても、`applyPaintingBlocking` の 6 種の門番
 *       (元から壁 / 起点 / 扉 / 敵スポーン / 通路 / ノード出口) が**ゲートと敵スロットを
 *       無条件に弾く**ので、ゲートや敵スロットは**原理的に塞げない**。
 *       ⇒ 「門番が壊れた」= 保護マスが実際に通行不能になった状態を注入するには、
 *         門番の下流である `obstacleTileMask` へ直に書くしかない (2026-09-03 に実測して確定)。
 *
 * ⚠ ポート **9410** (変異 16 本ぶんが 9411〜9426)。
 *   ⚠⚠⚠ 隣窓 `claude-39` が同じリポジトリで別チケットのヘッドレスを走らせているので、
 *   既存ドライバが使う 8800〜9110 / 9168〜9999 の一部を避けて **9400 番台**を取ってある。
 *   `--port` で上書きできる。
 *
 * 使い方:
 *   node tools/verify_walk_block.js                  # 受入条件
 *   node tools/verify_walk_block.js --negative       # 負のコントロール
 *   node tools/verify_walk_block.js --mutate island  # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠⚠ path.resolve 必須。スラッシュ区切りのまま持つと fp.startsWith(ROOT) が
//   path.join の出力 (バックスラッシュ) と一致せず **全リソースが 404** になる。
//   症状は「タイムアウト」だけなので実装の欠陥に見える (2026-09-03 に実際に踏んだ)。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '9410'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (依頼書 §2-2 / §11 = 廃坑 n1 だけ)
// ══════════════════════════════════════════════════════════════════════════════
const SCENARIO_KEY = 'dragonfighters.currentScenario';
const SCENARIO_ID = 'goblin-mine';
const NODE_ID = 'n1';
const ENTER_DIR = 'right';           // n0 → n1 は実プレイと同じ right
const PAGE_PATH = '/index.html';

/* (0b) の母集団。⚠ 依頼書 §2-2 の実測値 (probe_paint_overlay で 2026-09-03 に再現済み)。
 *  ⛔ 「1 体以上」では popzero が空振りする — 「測定器が壊れている」を捕まえたいので
 *    件数そのものを縛る。敵を増減させる別チケットが来たらここを直すのが正しい。 */
const FOE_COUNT_EXPECT = 10;
/* (1e) の塞がり率の上限。⭐ **絶対量で打ってよい** (依頼書 §8 = 「上限はもう決まっている値」)。
 *  現行 58.8% + 余裕。相対比較にすると「両方が同じだけ壊れる変更」を検出できない。 */
const BLOCK_RATIO_MAX = 0.66;
/* (4a) 撤退 ?walkblock=0 の**絶対量**。出所 = 項目 1〜3 の実測 (#46 でマスクを触る前の n1) =
 *  塞がり **527** / 面積 **897** = 58.75%。
 *  ⚠⚠ 依頼書 §8 (4a) は「58.8%」と丸めているが**実測は 58.75%**。丸めた % に帯を張ると
 *    ±1 マス (0.11%) の取りこぼしを素通りさせるので、**マス数そのもの**で縛る。
 *  ⛔ ここを「素のアームより小さい」等の相対比較にしない — 両アームが同じだけ壊れる変更
 *    (例: マスク全体を捨てる) を検出できなくなる。 */
const WALK_BLOCK_LEGACY_BLOCKED = 527;
const WALK_BLOCK_AREA = 897;
/* (0d) マスクの寸法。⭐ 行数がずれた状態で座標を語ると全部 1 タイルずれる。
 *  ⛔ 数値は写経ではなく **room.rect から導く** (下の (0d) を参照)。ここは tileBounds の
 *  「絵の側の宣言」と rect の「部屋の側の宣言」が一致することを見るための定数。 */
const MASK_TILE_BOUNDS = [2, 17, 24, 55];

/* ── §2 魔法陣 / 火炎コア (項目 2) ────────────────────────────────────────────
 * ⭐⭐⭐ **camZ を 4 点で測る**。1 点しか測らない assert は今回の欠陥を検出できない
 *   — それが §2-7 の穴そのもの (driver_cast_circle.js は camZ=1 の腕しか持たず、
 *   `* camZ` も忘れていたので、実機で 54px ずれていても 53/53 で緑だった)。
 *   逆変異 `camz1only` が「camZ=1 だけ測る assert は同じ欠陥を素通りさせる」を機械で示す。
 * ⚠ 4 点は ZOOM_MIN=0.25 〜 1 の実プレイ値域。0.8125 は依頼書 §2-5 の実測表と同じ点。 */
const VFX_ZOOMS = [1, 0.8125, 0.5, 0.25];
const VFX_SIZE = 96;          // 術者 displaySize。⚠ (4b) の絶対量はこの値に紐づく
const VFX_TOL_PX = 1.0;       // 依頼書 §8 (2a)(2d) の許容
const VFX_DIAM_TOL = 0.02;    // (2e) の誤差 2%
const VFX_CORE_N = 3;         // spawnConeFlames が立てる火炎コアの数 (母集団ガード)
/* (4b) 撤退アームの**絶対量**。⭐「戻った」を「陣が出る」だけで測ると永久緑になる。
 *  出所 = 依頼書 §2-5 の実測表 (camZ=0.25 / displaySize=96 → w=144.13 h=90.08 →
 *  0.5w(1-z)=54.05 / 0.64h(1-z)=43.24) と、項目 2 の着手前実測 (54.0608, 43.2300) の一致。
 *  火炎コアの legacy ズレは 60x60 の半分 = (30, 30) (⚠ camZ に依存しない。ヘッダ (D))。 */
const CAST_LEGACY = { z: 0.25, dx: 54.06, dy: 43.23, coreDx: 30.0, coreDy: 30.0 };

/* ── §3 バッジ廃止 (項目 3) ───────────────────────────────────────────────────
 * ⚠⚠⚠ (3b) の**基準は着手前 hash の index.html を別 URL で同時配信**して取る。
 *   ⛔ `git show HEAD:` を基準にすると、実装後は HEAD が動いて**永久緑**になる (#37 の教訓)。
 *   ⚠ 基準は起草コミット caf25d0 では**ない**。#46 項目2 (e3dfb4a) が index.html の
 *     魔法陣まわりを触っているので、そこを基準にしないと「陣の修正ぶんの差」まで
 *     (3b) が拾ってしまう。= **バッジを消す直前**の hash を逐語で握る。 */
const BADGE_REF_HASH = 'e3dfb4a';
const BADGE_REF_FILE = 'index.html';
/* (3d) データを消していないことの期待値 (`grep -c 'badge: "' index.html` = 44)。
 *  ⛔ 「1 件以上」では badgedata が空振りする。件数そのものを縛る。 */
const BADGE_DATA_COUNT = 44;
/* (4c) が実在を確かめる 2 件。⭐ 依頼書 §2-8 が名指しした「🐺 と 🏹」。
 *  ⚠ 絵文字だけでなく**どの敵の定義から出た値か**まで縛る (別の敵に紛れて生き残るのを防ぐ)。 */
const BADGE_EXPECT = { goblinRider: '🐺', goblinArcher: '🏹' };
/* (3b) の恒等測定に使うフィクスチャ。⚠ n1 の rect [2,17,24,55] の内側の**絶対タイル**で置く。
 *  ⛔ playerX 相対にしない — 素のアームと基準アームで主人公の位置が 1 タイルでも違うと
 *    「恒等が崩れた」ではなく「測定点が動いた」で赤くなる。
 *  ⭐ 2 体は badge 持ち (🏹 / 🐺) = (4c) の母集団も同じ 1 回の採取で立つ。 */
const BADGE_FIXTURE = [
  { key: 'goblin', tx: 30, ty: 10 },
  { key: 'goblinArcher', tx: 32, ty: 10 },
  { key: 'goblinRider', tx: 34, ty: 10 },
];
/* (3b) を測る camZ。⚠ 実プレイ値域 (0.25〜1) の中の 1 点を**両アームで同じ値に打つ**。
 *  ⭐ 1 ではなく 0.8125 にしてあるのは、placeUnscaledUi の camZ 分岐を通した状態で測るため。 */
const BADGE_FIX_Z = 0.8125;
/* 「1px も変わらない」= 実質**完全一致**。⚠ 0 ちょうどにすると IEEE754 の最下位ビットで
 *  誤報しうるので 0.01px にしてある (labelshift の 3px とは 300 倍の開きがある)。 */
const BADGE_RECT_TOL = 0.01;

/* ── ゲート ──────────────────────────────────────────────────────────────────
 * ⚠⚠⚠ 依頼書 §8 (1a) は「4 ゲートすべて」だが、**down は原理的に到達不能**
 *   (ファイル冒頭の (A) を参照)。判定対象と除外を 1 箇所で宣言する。 */
const GATE_DIRS = ['up', 'down', 'left', 'right'];
const GATE_DIRS_MUST_REACH = ['up', 'left', 'right'];
const GATE_DIRS_EXCLUDED = ['down'];
const GATE_EXCLUDED_WHY =
  'n1 は exits:[] の終端ノードで down は絵にもグラフにも無い口。nodeGateTile が辺の中点を'
  + '機械的に返し、門番 (gateKeys) が 4 方角すべてを無条件に開けるので、sealRing で塞がれた'
  + 'row24 の中に床 1 マスが孤立して残る (真上の (36,23) はマスクの #)';

/* ── (1f) 規則②④の保護マス ──────────────────────────────────────────────────
 * 出所 = 依頼書 §2-4 の表 + §4-1 STEP C の「絶対に `#` を書かない」リスト。
 * ⚠⚠ 依頼書のコメント由来の座標は**絵ローカル**なので、グローバルへは **+17 / +2** する
 *   (n1 の tileBounds = [2, 17, 24, 55])。混ぜると必ず 1 タイルずれる。
 * ⚠ 行 6 の範囲だけ依頼書の「col28 以東」を実物に合わせて col31-41 へ訂正した
 *   (ファイル冒頭の (C) を参照)。 */
function protectedTiles() {
  const out = [];
  const push = (tx, ty, why) => out.push({ tx: tx, ty: ty, why: why });
  // 規則② — 平置きの物 (跨げる物) は塞がない
  for (let c = 31; c <= 41; c++) push(c, 8, '規則② マスク行6 = 軌道の敷かれた床 (レールは平置き)');
  for (let c = 33; c <= 36; c++) push(c, 12, '規則② マスク行10 = 倒れた板');
  for (let c = 32; c <= 38; c++) push(c, 20, '規則② マスク行18 = 軌道の枕木');
  // ★P8 で 4 近傍の連結のために 1 マスずつ開けた穴 (塞ぐと南半分へ下りられなくなる)
  push(37, 16, '★P8 で開けた = 荷車の軒下 (マスク行14 col20)');
  push(36, 17, '★P8 で開けた = 木箱の山の隙間 (マスク行15 col19)');
  push(37, 18, '★P8 で開けた = 岩の背 (マスク行16 col20)');
  push(38, 19, '★P8 で開けた = 岩の背 (マスク行17 col21)');
  // 規則④ — ゲートへのレーンは絵に道が無くても明示的に空ける
  push(34, 3, '規則④ ゲート up (梯子の縦坑)');
  push(36, 24, '規則④ ゲート down (辺の中点。到達不能だが塞いでもいけない)');
  push(19, 11, '規則④ ゲート left (坑口) = 起点');
  push(55, 13, '規則④ ゲート right (軌道が東へ抜ける)');
  return out;
}
const PROTECTED = protectedTiles();

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (16 本。項目 1 で impl になるのは 4 本)
// ⛔ MUT_ORDER には常に 16 本並べる = --negative が「実装を忘れた変異」を件数から隠さない。
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 塞ぐ変異が共有するアンカー。applyPaintingBlocking の中の「マスクの候補を門番へ通す」1 行。
 *   その直後に **門番を経由しない直書き**を差し込むことで「門番が壊れた」状態を再現する。
 *   ⚠ 差し込みは n1 の絵 (39x23) のときだけ効かせる (n0 = 33x22 には掛からない)。 */
const SEAL_ANCHOR = 'for (const k of keys) tryBlock(k, false);';
/* ⭐ §2 の変異アンカー。zTfAnchored の**三項演算子まるごと**を握る (1 行に閉じている)。
 *  ⚠ index.html はディスク上 CRLF なので複数行アンカーは必ず空振りする。 */
const ANCHOR_TF = '(CAST_ANCHOR_ON ? (inner + " scale(" + camZ + ")") : ("scale(" + camZ + ") " + inner))';
const ANCHOR_TF_PREFIX = '("scale(" + camZ + ") " + inner)';
const sealTo = (tx, ty, tag) => SEAL_ANCHOR
  + ' if (p.tw === 39 && p.th === 23) { obstacleTileMask[' + ty + ' * MAP_W + ' + tx + '] = 1; /* ' + tag + ' */ }';
/* ⭐ 複数マスを一度に塞ぐ版 (項目 4 の sealrail / sealp8)。⚠ 1 行に閉じること (CRLF)。 */
const sealManyTo = (tiles, tag) => SEAL_ANCHOR
  + ' if (p.tw === 39 && p.th === 23) { for (const _t of ' + JSON.stringify(tiles)
  + ') obstacleTileMask[_t[1] * MAP_W + _t[0]] = 1; /* ' + tag + ' */ }';

const MUTATIONS = {
  // ── 項目 1 が実装した 4 本 ─────────────────────────────────────────────────
  popzero: {
    impl: true, file: 'index.html', targets: ['0b'], record: ['1b', '1c'],
    from: 'slots: N1_MELEE_SLOTS.concat(N1_GUARD_SLOTS),',
    to: 'slots: [] /* popzero */,',
    why: 'n1 の乱戦 8 体 + 護衛 2 体のスロットを空にする (ボスだけ残って 10 → 1 体)'
      + ' ⭐ 母集団ガードが立たなければ FAIL。⚠ 依頼書は「0 件にする」だが、boss スロットまで'
      + ' null にすると objective:defeatBoss のランが成立せずページ側が別の理由で壊れるため、'
      + ' 乱戦+護衛だけを落とす形にした (0b は件数を縛るので 1 体でも赤になる)',
  },
  island: {
    impl: true, file: 'index.html', targets: ['1d'], record: ['1a', '1b', '1c', '1e', '1f'],
    from: SEAL_ANCHOR, to: sealTo(52, 5, 'island'),
    why: '(52,5) を塞いで、その唯一の隣人だった (53,5) を**床 1 マスの孤島**にする'
      + ' ⭐⭐⭐ (1a)(1b)(1c)(1e)(1f) は緑のまま (1d) だけが赤 = (1d) の存在理由の機械証明。'
      + ' ⚠ (52,5) は 2026-09-03 の実測で「行き止まり (53,5) の唯一の隣人」であり、'
      + ' ゲートでも敵スロットでも保護マスでもない (だから他の節を巻き込まない)',
  },
  sealgate: {
    impl: true, file: 'index.html', targets: ['1a', '1f'],
    from: SEAL_ANCHOR, to: sealTo(34, 3, 'sealgate'),
    why: 'ゲート up (34,3) = 梯子の縦坑を塞ぐ (起点から up ゲートへ経路が無くなる)'
      + ' ⚠⚠⚠ マスクの行文字列に `#` を書くやり方では**空振りする** — 門番 (gateKeys) が'
      + ' 4 方角すべてを無条件に弾くため。門番の下流 obstacleTileMask へ直に書く',
  },
  sealfoe: {
    impl: true, file: 'index.html', targets: ['1c'], record: ['1b'],
    from: SEAL_ANCHOR, to: sealTo(32, 9, 'sealfoe'),
    why: '敵スロット (32,9) のゴブリンを壁の中に埋める (樽に埋まった敵が alive で残り、'
      + 'ボスを倒してもクエストがクリアしなくなる = 8519138 の再来)'
      + ' ⚠ 敵スポーンの救済は isTileStructuralWall しか見ないので obstacleTileMask では救われない'
      + ' ⚠⚠⚠ ここもマスクの `#` では空振りする (門番 spawnKeys が弾く)',
  },
  // ── 項目 2 (魔法陣 / 火炎コア) が実装した 5 本 ──────────────────────────────
  zprefix: {
    impl: true, file: 'index.html', targets: ['2a', '2c'], record: ['2b', '2d', '2e'],
    from: ANCHOR_TF, to: ANCHOR_TF_PREFIX + ' /* zprefix */',
    why: 'zTfAnchored を前置形 ("scale(z) " + inner) へ戻す (= #46 前のズレたまま)。'
      + ' ⭐ (2b) は camZ=1 だけを見るので**緑のまま**通る = 「camZ=1 では 1 ビットも変わらない」'
      + 'ことの裏返し。(2e) も rect.width は f*camZ*w のままなので緑 = 位置と大きさが別物である証拠',
  },
  camz1only: {
    impl: true, inverse: true, file: 'index.html', targets: ['2a'],
    from: ANCHOR_TF, to: ANCHOR_TF_PREFIX + ' /* camz1only: zprefix と同一の欠陥 */',
    why: '⭐⭐⭐ 逆変異。zprefix と**同じ欠陥**を配りながら「camZ=1 だけを測る壊れた assert」に'
      + '掛ける。壊れた assert は緑 (素通り) / 4 点測る本物の (2a) は赤 — この 2 つが同時に'
      + '成り立って初めて「1 点しか測らない検査では捕まらない」= §2-7 の穴が機械で証明される',
  },
  origin00: {
    impl: true, file: 'index.html', targets: ['2a'], record: ['2b', '2c', '2d', '2e'],
    from: '      transform-origin: 50% 64%;',
    to: '      transform-origin: 0 0; /* origin00 */',
    why: '.fxCastCircle の transform-origin を 0 0 にする (楕円中心のフレーム内比が'
      + ' anchorFY と食い違い、陣が足元からずれる)。⚠ 依頼書は (2e) も赤としているが'
      + ' **原理的に赤くならない** (origin は rect の位置しか動かさず width は f*camZ*w のまま)'
      + ' ⇒ (2e) は record へ落とした (ヘッダ (F))',
  },
  fireonly: {
    impl: true, file: 'index.html', targets: ['2d'], record: ['2a', '2b', '2c', '2e'],
    from: '      margin-left: -30px; margin-top: -30px;   /* [#46] 中央アンカー (60x60 の半分) */',
    to: '      margin-left: 0; margin-top: 0; /* fireonly */',
    why: '火炎の爆発コアの**中央アンカー (margin) を外す** = #46 前の (+30,+30)px ズレへ戻す。'
      + ' ⚠⚠⚠ 依頼書の「前置形に戻す」は**原理的に空振りする** — この要素は animation が'
      + ' transform を animate しており inline style がカスケードで負けるので、JS 側に何を'
      + ' 書いても表示は 1px も変わらない (ヘッダ (D) の実測)。'
      + ' ⭐ (2a)(2b)(2c)(2e) は魔法陣の節なので緑のまま = 「火炎コアだけ」が壊れる',
  },
  nocircle: {
    impl: true, file: 'index.html', targets: ['0c'],
    from: '      if (!unit || !S.loaded) return null;',
    to: '      if (true) return null; /* nocircle */',
    why: 'spawnCastCircle を常に null にする (シート未ロードと同じ = 静かに何も出さない)。'
      + ' ⭐ 母集団ガード (0c) が立たなければ §2 は「陣が 1 枚も無いのに緑」になり得る',
  },
  // ── 項目 3 (バッジ廃止) が実装した 4 本 ─────────────────────────────────────
  badgepush: {
    impl: true, file: 'index.html', targets: ['3c'], record: ['3a', '3b', '3d'],
    from: '        enemyBadgeElements.push(null);   // ⚠⚠⚠ 添字並列を崩さない (#46)',
    to: '        /* badgepush: push ごと飛ばして添字並列を崩す */',
    why: 'バッジ OFF 時に enemyBadgeElements.push(null) を**やめる** = 添字並列が崩れる (§2-8 の罠の再現)。'
      + ' ⭐⭐⭐ (3a) は「バッジ 0 個」なので**緑のまま素通りする** — 見た目は完全に正常で、'
      + ' enemyBadgeElements[index] が別の敵を指すという最も見つけにくい壊れ方だけが残る。'
      + ' それを捕まえるのが (3c) の存在理由 (⛔ だから > 0 ではなく**長さ**で見る)',
  },
  badgeleak: {
    impl: true, file: 'index.html', targets: ['3a'], record: ['3b', '3c', '3d'],
    from: '      if (ENEMY_BADGE_ON) {',
    to: '      if (ENEMY_BADGE_ON || index === 0) { /* badgeleak */',
    why: '既定 (?enemybadge 無し) でも先頭の 1 体にだけ .enemyBadge を作る。'
      + ' ⭐ 1 個だけ漏れる = 「だいたい消えている」を通してしまう assert を弾く'
      + ' (⛔ (3a) を「敵の数より少ない」等で書くとここで空振りする)。'
      + ' ⚠ push は両アームで走るので (3c) は緑のまま = (3a) と (3c) が別物である証拠',
  },
  badgedata: {
    impl: true, file: 'index.html', targets: ['3d'], record: ['3a', '3b', '3c'],
    from: '        badge: "🛒",',
    to: '        /* badgedata: badge: を 1 件消した */',
    why: 'ENEMY_TYPES の badge: を 1 件 (隊商の馬車 🛒) 消す。'
      + ' ⭐ 依頼書 §4-3 の「データは 1 件も消さない」を機械で縛る — 表示を消すついでに'
      + ' データまで削ると、?enemybadge=1 で戻したとき静かに 1 体だけ無地になる。'
      + ' ⚠ 🐺 / 🏹 ではない 1 件を選んである = (4c) の名指しとは独立に (3d) だけが落ちる',
  },
  labelshift: {
    impl: true, file: 'index.html', targets: ['3b'], record: ['3a', '3c', '3d'],
    from: '            placeUnscaledUi(labelEl, enemy.x, enemy.y, enemy.def.displaySize, hpBarOffX + 2, -27);',
    to: '            placeUnscaledUi(labelEl, enemy.x, enemy.y, enemy.def.displaySize, hpBarOffX + 2, -30); /* labelshift */',
    why: 'バッジ廃止の**ついでに**名前札を 3px 上へ動かす (#44 の決定を勝手に動かす変更)。'
      + ' ⭐⭐⭐ 恒等 assert (3b) が無いと、この種の「ついで」は誰にも見つからない'
      + ' (バッジは 0 個のままなので (3a)、長さも合っているので (3c)、データも 44 件のままなので (3d) が'
      + ' すべて緑を返す)。⚠ 状態アイコン列は札の子なので**一緒に**動く = 2 つとも赤になる',
  },
  // ── 項目 4 (マスク編集) が実装した 3 本 ─────────────────────────────────────
  sealrail: {
    impl: true, file: 'index.html', targets: ['1f'], record: ['1a', '1b', '1c', '1d', '1e'],
    from: SEAL_ANCHOR,
    to: sealManyTo([[32, 20], [33, 20], [34, 20], [35, 20], [36, 20], [37, 20], [38, 20]], 'sealrail'),
    why: '規則② で空けてある **マスク行18 の枕木** (グローバル col32-38 / row20) を 7 マスとも塞ぐ。'
      + ' ⭐ 枕木は「跨げる平置きの物」なので塞いではいけない (規則②)。'
      + ' ⚠ 実測: この 7 マスを塞いでも**到達不能は出ない** (row19/row21 側に迂回路がある) ので'
      + ' (1d)(1e) は緑のまま = 「絵の規則を破ったこと」を捕まえられるのは (1f) だけ。'
      + ' ⛔ だから (1f) を「到達性で代用できる」と考えて消してはいけない',
  },
  sealp8: {
    impl: true, file: 'index.html', targets: ['1b', '1d', '1f'], record: ['1a', '1c', '1e'],
    from: SEAL_ANCHOR,
    to: sealManyTo([[37, 16], [36, 17], [37, 18], [38, 19]], 'sealp8'),
    why: '★P8 で開けた 4 マス (37,16)(36,17)(37,18)(38,19) を**全部**塞ぐ = P8 前の状態へ戻す。'
      + ' ⚠⚠⚠ **依頼書の「(37,16) を塞ぐ」だけでは原理的に空振りする** (項目 4 の実測で確定):'
      + ' 行16 の開き run は global col34-37、行17 は col36-39 なので **(36,16)-(36,17) が並行の'
      + ' 4 近傍リンクとして残る**。= (37,16) は「唯一の連結点」ではない。'
      + ' 4 マスとも塞ぐと北半 (主通路) と南半 (泉の間 = 玉座) が 4 近傍で切れ、'
      + ' ボスと護衛 3 体が到達不能になる ((1b)) / 南半の床が丸ごと孤島になる ((1d))。'
      + ' ⭐ (1a) は**緑のまま** — up/left/right の 3 ゲートは全部北半にあるので、'
      + ' 「ゲートへ行ければ良い」という assert では部屋の半分が死んでも気づけない = (1b)(1d) の存在理由',
  },
  overblock: {
    impl: true, file: 'index.html', targets: ['1e', '1d'], record: ['1a', '1b', '1c', '1f'],
    from: SEAL_ANCHOR,
    to: SEAL_ANCHOR + ' if (p.tw === 39 && p.th === 23) { for (let _r = p.ty; _r < p.ty + p.th; _r++)'
      + ' for (let _c = p.tx; _c < p.tx + p.tw; _c++) { if (((_r * 73 + _c * 31) % 100) < 53'
      + ' && !(_r === playerStartTy && _c === playerStartTx)) obstacleTileMask[_r * MAP_W + _c] = 1; }'
      + ' /* overblock */ }',
    why: '⭐⭐⭐ **なぜ「絵のピクセルから自動でマスクを起こす」を採らなかったかを機械で示す 1 本**'
      + ' (依頼書 §2-3 の再現)。§2-3 の実測では最良の特徴量 (暗部率) でも **AUC 0.685** ='
      + ' 3 マスに 1 マス間違え、n1 では床 488 マスのうち **261 マス (53%) を誤って塞ぐ**。'
      + ' ⇒ ここでは「AUC 0.5 = コイン投げの規則が床の 53% を塞ぐ」を**決定論の疑似乱数**'
      + ' ((row*73 + col*31) % 100 < 53) で再現する。⛔ 絵を読み直す実装を写経しないのが肝で、'
      + ' 再現したいのは**手口ではなく帰結** (塞がり率が跳ね上がり、通路ごと消える)。'
      + ' ⚠ 起点だけは除外する (起点が壁だとページが別の理由で壊れ、何を測ったのか分からなくなる)',
  },
};
const MUT_ORDER = ['popzero', 'island', 'sealgate', 'sealfoe',
  'zprefix', 'camz1only', 'origin00', 'fireonly', 'nocircle',
  'badgepush', 'badgeleak', 'badgedata', 'labelshift',
  'sealrail', 'sealp8', 'overblock'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_SERVED = MUT_IMPL.slice();
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING): ' + MUTATIONS[MUTATE].why);
  process.exit(3);
}

/* ⭐⭐⭐ 配信バイトの凍結。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。
 *  ⛔ リクエストのたびに fs.readFileSync しない — 別窓が index.html を保存すると
 *     走行中に「素の行」と「変異後の行」が混ざったビルドを配ってしまう。 */
const SRC = {};
const MUT_SRC = {};
for (const k of MUT_SERVED) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  const body = SRC[m.file];
  const at = ' 変異 ' + k;
  if (typeof m.from !== 'string' || typeof m.to !== 'string') {
    console.error('[drv] ⛔' + at + ' の from/to が文字列でない'); process.exit(3);
  }
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔' + at + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)'); process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔' + at + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
  }
  const n = body.split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔' + at + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: body.split(m.from).join(m.to) };
}

/* ══ (3b) の**基準アーム** = 着手前 hash の index.html ═══════════════════════════
 * ⭐⭐⭐ 別ポートで**同時に配信**する。⛔ `git show HEAD:` を基準にしない
 *   (実装後は HEAD が動いて基準が実装後の姿になり、恒等 assert が永久緑になる = #37 の教訓)。
 * ⚠ 改行を CRLF へ揃える。working tree の index.html はディスク上 CRLF、git の blob は
 *   LF なので、揃えないと「テキストノードの空白の扱いで差が出る」余地が残る
 *   (恒等を 0.01px で測るので、疑いの種は先に潰しておく)。 */
let REF_SRC = null;
try {
  REF_SRC = require('child_process')
    .execFileSync('git', ['show', BADGE_REF_HASH + ':' + BADGE_REF_FILE],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
    .replace(/\r?\n/g, '\r\n');
} catch (e) {
  console.error('[drv] ⛔ 基準 ' + BADGE_REF_HASH + ':' + BADGE_REF_FILE
    + ' を取り出せない: ' + ((e && e.message) || e));
  process.exit(3);
}
/* ⭐⭐⭐ 基準アームが**本当に基準か**を配信前に検算する。これが無いと、間違った hash を
 *  指した瞬間に「両アームともバッジ無し」= (3b) の恒等が自明に成立して永久緑になる。 */
if (REF_SRC.indexOf('ENEMY_BADGE_ON') >= 0) {
  console.error('[drv] ⛔ 基準 ' + BADGE_REF_HASH + ' が ENEMY_BADGE_ON を含む = #46 項目3 より'
    + '**後**の hash。基準は「バッジを消す直前」でなければならない');
  process.exit(3);
}
{
  const n = REF_SRC.split('bd.className = "enemyBadge"').length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 基準 ' + BADGE_REF_HASH + ' の中でバッジ生成が ' + n + ' 箇所 (期待 1)');
    process.exit(3);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};
/* ⚠ 第 3 引数 `override` = 変異ではない差し替え配信 (今は (3b) の基準アームだけが使う)。
 *   ⛔ MUT_SRC へ相乗りさせない — 変異の件数 (MUT_ORDER 16 本) を汚さないため。 */
function startServer(port, mutKey, override) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        const ov = override || (mutKey ? (MUT_SRC[mutKey] || null) : null);
        if (ov && rel === ov.file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(ov.body); return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定 (PASSED / FAILED / PENDING の 3 値)
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + name + (detail ? '  — ' + detail : ''));
}
function pending(name, why) {
  results.push({ name: name, state: 'PENDING', detail: why || '' });
  console.log('  **PENDING** ' + name + (why ? '  — ' + why : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

/* ⚠⚠⚠ 母集団が立たなかったときの返し方。⛔ 「スキップして緑」は禁止 (依頼書 §8 の太字)。
 *  ⭐ 本体の assert は必ずこれを通して赤を返す = detail に `population: none` が出るので
 *    「測れないから赤」と「値が悪いから赤」が記録の上で区別できる。 */
function popFail(which, why) {
  return [false, 'population: none  (' + which + ' が立っていない: ' + why + ')'];
}
const tkey = (t) => t.tx + ',' + t.ty;

// ══════════════════════════════════════════════════════════════════════════════
// 測定 (1 ページ = 1 回)
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ ページ内で走る採取関数。**本番の関数だけ**を呼ぶ:
 *     isTileWall / aStar / nodeGateTile / spawnCastCircle / __paintBlockProbe
 *   ⛔ 4 近傍の規則も、マスクの解釈式も、SX()/SY() の式もここへ写さない。 */
function SNAPSHOT(cfg) {
  const out = { ok: false, err: null };
  try {
    const room = MAPDEF.rooms[0];
    const rect = room.rect.slice();
    const r1 = rect[0], c1 = rect[1], r2 = rect[2], c2 = rect[3];

    const gates = {};
    for (const d of cfg.gateDirs) {
      let t = null;
      try { t = nodeGateTile(MAPDEF, d); } catch (e) { t = null; }
      gates[d] = t ? { tx: t.tx, ty: t.ty } : null;
    }
    /* 起点 = **実際に主人公が立っているタイル**。⚠ MAPDEF.start は node() の既定
     *   (36,13) のままなので、入場口へ寄せられた実座標と一致しない。両方返して記録する。 */
    const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
    const mapStart = { tx: START_TX, ty: START_TY };

    const foes = [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.def) continue;
      const tx = Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE);
      const ty = Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE);
      foes.push({ i: i, key: e.def.key || '', name: e.def.name || '?', tx: tx, ty: ty,
                  boss: !!e.def.isBoss, alive: !!e.alive, wall: !!isTileWall(tx, ty) });
    }

    /* 部屋の歩行判定を 1 枚の文字列グリッドにする。⭐ 出所は isTileWall ただ 1 本
     *   (mapData===2 → isDoorBlocking → obstacleTileMask の 3 述語を順に見る唯一の口)。 */
    const rows = [];
    for (let y = r1; y <= r2; y++) {
      let s = '';
      for (let x = c1; x <= c2; x++) s += isTileWall(x, y) ? '#' : '.';
      rows.push(s);
    }

    /* 絵の側の宣言 (マスクの寸法)。⛔ 行文字列そのものは持ち出さない (座標を焼かない)。 */
    let mask = null;
    try {
      const pd = ROOM_PAINTINGS_DEF[cfg.scenario][cfg.node];
      const lens = {};
      for (const s of (pd.blocked || [])) lens[s.length] = (lens[s.length] || 0) + 1;
      mask = { tileBounds: (pd.tileBounds || []).slice(), rows: (pd.blocked || []).length,
               rowLens: Object.keys(lens).map(Number), sealRing: !!pd.sealRing,
               hasBlocked: !!pd.blocked };
    } catch (e) { mask = null; }

    /* ⭐⭐⭐ 到達性は **本番の aStar だけ**。⛔ ドライバ側に BFS を書かない。 */
    const leg = (a, b) => {
      if (!a || !b) return null;
      const p = aStar(a.tx, a.ty, b.tx, b.ty, null, null);
      return p === null ? null : p.length;
    };
    const gateLegs = {};
    for (const d of cfg.gateDirs) gateLegs[d] = gates[d] ? leg(start, gates[d]) : null;
    const foeLegs = foes.map(f => leg(start, f));

    /* (1d) 連結成分 = **床タイル 1 マスずつに aStar を撃つ**。
     *  ⭐ こうすると 4 近傍の規則が本番と同一であることが構造的に保証される
     *    (ドライバ側に近傍表が 1 つも無いので、写経しようがない)。 */
    const unreachable = [];
    let floorN = 0;
    for (let y = r1; y <= r2; y++) {
      for (let x = c1; x <= c2; x++) {
        if (isTileWall(x, y)) continue;
        floorN++;
        if (x === start.tx && y === start.ty) continue;
        if (aStar(start.tx, start.ty, x, y, null, null) === null) unreachable.push({ tx: x, ty: y });
      }
    }

    /* (1f) 保護マスの現状。⛔ 「歩けるか」は必ず isTileWall で聞く。 */
    const protectedState = cfg.protectedTiles.map(t => ({
      tx: t.tx, ty: t.ty, why: t.why,
      inside: (t.tx >= c1 && t.tx <= c2 && t.ty >= r1 && t.ty <= r2),
      wall: !!isTileWall(t.tx, t.ty),
    }));

    const pb = window.__paintBlockProbe ? window.__paintBlockProbe() : null;
    out.ok = true;
    out.node = window.__graphRun ? window.__graphRun.nodeId() : null;
    out.rect = rect; out.gates = gates; out.start = start; out.mapStart = mapStart;
    out.foes = foes; out.rows = rows; out.mask = mask;
    out.gateLegs = gateLegs; out.foeLegs = foeLegs;
    out.unreachable = unreachable; out.floorN = floorN;
    out.protectedState = protectedState;
    out.area = (r2 - r1 + 1) * (c2 - c1 + 1);
    out.camZ = (typeof camZ !== 'undefined') ? camZ : null;
    out.castProbeLen = (window.__castCircleProbe || []).length;
    out.sheetLoaded = (typeof MAGIC_CIRCLE_SHEET !== 'undefined') ? !!MAGIC_CIRCLE_SHEET.loaded : null;
    out.paint = pb ? { off: pb.off, ringOff: pb.ringOff, applied: pb.applied, ring: pb.ring,
                       skipGate: pb.skipGate, skipStart: pb.skipStart, skipDoor: pb.skipDoor,
                       skipSpawn: pb.skipSpawn, skipCorridor: pb.skipCorridor, onWall: pb.onWall,
                       /* #46 (4a): 撤退 ?walkblock=0 の実績。⛔ ここを写経で作らない
                        *   (出所は applyPaintingBlocking の中の 7 つ目の門番ただ 1 本)。 */
                       walkBlockOn: pb.walkBlockOn, walkBlockNew: pb.walkBlockNew,
                       skipWalkBlock: pb.skipWalkBlock } : null;
  } catch (e) {
    out.err = (e && e.message) || String(e);
  }
  return out;
}

/* ⭐ §2 の採取。**1 回の evaluate の中で同期的に**測る。
 *  ⚠ 間に rAF / setTimeout を挟むと陣のコマ (f.scale) が進んでしまい (2e) の期待値が動く。
 *  ⚠⚠⚠ containing block の原点は `el.parentElement.getBoundingClientRect()` では取れない
 *    (#vfxLayer は position:static。ファイル冒頭 (E))。left:0;top:0 の 0x0 マーカーを同じ親へ
 *    挿して**原点そのものを実測**する。
 *  ⭐ camZ の切替は **本番の setCamZoom()** を通す (書き込み点は index.html の 1 箇所)。
 *    測ったら必ず元へ戻す (finally)。 */
function VFX_SNAPSHOT(cfg) {
  const out = { ok: false, err: null, camZ0: null, anchorFY: null, sheetLoaded: null,
                castAnchorOn: null, legacyClass: null, circle: [], core: [] };
  let prev = null;
  try {
    prev = camZ;
    out.camZ0 = camZ;
    out.anchorFY = MAGIC_CIRCLE_SHEET.anchorFY;
    out.sheetLoaded = !!MAGIC_CIRCLE_SHEET.loaded;
    out.castAnchorOn = (typeof CAST_ANCHOR_ON !== 'undefined') ? !!CAST_ANCHOR_ON : null;
    out.legacyClass = document.body.classList.contains('castAnchorLegacy');
    const setZ = (z) => {
      if (typeof setCamZoom === 'function') setCamZoom(z); else camZ = z;
      return camZ;
    };
    const originOf = (host) => {
      const mk = document.createElement('div');
      mk.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;';
      host.appendChild(mk);
      const r = mk.getBoundingClientRect();
      mk.remove();
      return { x: r.left, y: r.top };
    };
    for (const z of cfg.zooms) {
      const zz = setZ(z);
      const host = vfxHost();
      const org = originOf(host);
      // ── 魔法陣 ──────────────────────────────────────────────────────────────
      const rec = { z: zz, ok: false, hostPos: getComputedStyle(host).position,
                    orgX: org.x, orgY: org.y };
      window.__castCircleProbe.length = 0;
      const sim = { x: playerX, y: playerY, def: { displaySize: cfg.size, name: '(§2)装置' } };
      const h = spawnCastCircle(sim, 'arcane', 4000);
      const p = window.__castCircleProbe[window.__castCircleProbe.length - 1] || null;
      if (h && h.el && p) {
        const el = h.el;
        const r = el.getBoundingClientRect();
        const fy = MAGIC_CIRCLE_SHEET.anchorFY;   // 0.64 を写経しない (シート定義から引く)
        rec.ok = true;
        rec.transform = el.style.transform;
        rec.originCss = getComputedStyle(el).transformOrigin;
        rec.w = p.w; rec.h = p.h; rec.displaySize = p.displaySize;
        rec.rectW = r.width; rec.rectH = r.height;
        /* 楕円中心 (実画面) — rect の中の比で取る。el.style.left を読む方式にしない。 */
        rec.anchorX = r.left + r.width * 0.50;
        rec.anchorY = r.top + r.height * fy;
        rec.wantX = org.x + SX(p.footWX);         // SX の式を写経せず本番の関数を呼ぶ
        rec.wantY = org.y + SY(p.footWY);
        rec.dx = rec.anchorX - rec.wantX;
        rec.dy = rec.anchorY - rec.wantY;
      }
      if (h) h.destroy();
      out.circle.push(rec);
      // ── 火炎の爆発コア (.fxFireImpactCore) ──────────────────────────────────
      /* ⚠ dirX=dirY=0 にすると 3 段すべてが originWX/WY ちょうどに立つ
       *   = ドライバ側に `origin + dir*step*TILE_SIZE` を写経しなくて済む。 */
      const crec = { z: zz, ok: false, n: 0, cores: [] };
      for (const n of Array.from(document.querySelectorAll('.fxFireImpactCore'))) n.remove();
      const cwx = playerX + cfg.size / 2, cwy = playerY + cfg.size / 2;
      try { spawnConeFlames(cwx, cwy, 0, 0); }
      catch (e) { crec.err = (e && e.message) || String(e); }
      const cores = Array.from(document.querySelectorAll('.fxFireImpactCore'));
      crec.n = cores.length;
      for (const c of cores) {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        crec.cores.push({
          crit: c.classList.contains('crit'),
          inline: c.style.transform, computed: cs.transform, anim: cs.animationName,
          rectW: r.width, rectH: r.height,
          dx: (r.left + r.width * 0.5) - (org.x + SX(cwx)),
          dy: (r.top + r.height * 0.5) - (org.y + SY(cwy)),
        });
      }
      crec.ok = crec.cores.length > 0;
      for (const c of cores) c.remove();
      out.core.push(crec);
    }
    out.ok = true;
  } catch (e) {
    out.err = (e && e.message) || String(e);
  } finally {
    try {
      if (prev !== null) { if (typeof setCamZoom === 'function') setCamZoom(prev); else camZ = prev; }
    } catch (e) {}
  }
  return out;
}

/* transform を**分解して全部の部品を見る**。⛔ 部分一致の正規表現にしない
 *  (§2-7 の 5.4 は `/translate\(-50%,\s*-64%\)/` だったので、壊れた
 *   `scale(0.25) translate(-50%, -64%) scale(0.82)` を素通りさせていた)。
 *   camZ===1 → `translate(-50%, -64%) scale(<f>)`               (後置の scale が**無い**)
 *   camZ!==1 → `translate(-50%, -64%) scale(<f>) scale(<camZ>)` (#46: scale は**後置**) */
function castTfParts(tf) {
  const m = /^translate\(-50%, -(\d+(?:\.\d+)?)%\) scale\((\d+(?:\.\d+)?)\)(?: scale\((\d+(?:\.\d+)?)\))?$/
    .exec(tf || '');
  return m ? { fy: parseFloat(m[1]), f: parseFloat(m[2]),
               z: (m[3] === undefined) ? null : parseFloat(m[3]) } : null;
}
function vfxOf(m) { return (m && m.ok && m.vfx && m.vfx.ok) ? m.vfx : null; }
function vfxPop(m) {
  if (!m || !m.ok) return popFail('測定', (m && m.err) || 'SNAPSHOT が失敗');
  return popFail('§2 の採取', (m.vfx && m.vfx.err) || 'VFX_SNAPSHOT が失敗');
}
/* (2a) の本体。⭐ zooms を引数にしてあるのは、逆変異 camz1only が
 *   **同じ関数を [1] だけで呼ぶ**ため = 「1 点しか測らない検査」を写経せずに再現できる。 */
function assertCircleAnchored(m, zooms) {
  const v = vfxOf(m);
  if (!v) return vfxPop(m);
  const rows = zooms.map(z => v.circle.find(r => r.z === z)).filter(Boolean);
  if (rows.length !== zooms.length)
    return popFail('陣の標本', '要求 camZ=' + zooms.join(',') + ' / 取れたのは '
      + v.circle.map(r => r.z).join(','));
  const miss = rows.filter(r => !r.ok);
  if (miss.length) return popFail('陣', 'camZ=' + miss.map(r => r.z).join(',') + ' で 1 枚も出なかった'
    + ' (MAGIC_CIRCLE_SHEET.loaded=' + v.sheetLoaded + ')');
  const bad = rows.filter(r => Math.abs(r.dx) > VFX_TOL_PX || Math.abs(r.dy) > VFX_TOL_PX);
  return [bad.length === 0,
    rows.map(r => 'z=' + r.z + ' Δ=(' + r.dx.toFixed(2) + ',' + r.dy.toFixed(2) + ')').join('  ')
    + '   [許容 ±' + VFX_TOL_PX.toFixed(1) + 'px]'
    + (bad.length ? '  ⛔ 超過 z=' + bad.map(r => r.z).join(',') : '')
    + '   tf@' + rows[rows.length - 1].z + '="' + (rows[rows.length - 1].transform || '') + '"'];
}
/* ⭐⭐⭐ 逆変異 camz1only 用の「壊れた assert」= camZ=1 だけを測る版。
 *  ⛔ これは受入条件ではない (ASSERTS に入れない)。負のコントロールでしか呼ばない。 */
function assert2aCamZ1Only(m) { return assertCircleAnchored(m, [1]); }

/* ⭐ §3 の採取。**1 回の evaluate の中で同期的に**通す (仕込みと計測の間にゲームの
 *   フレームを挟まない = オートバトルの手番で敵が動いて恒等が崩れるのを防ぐ)。
 * ⚠⚠⚠ 順序が肝: (3a)(3c)(3d) は**素の母集団**で測る (フィクスチャを足す**前**)。
 *   足した後に数えると「装置が作ったバッジ」まで数えてしまう。
 * ⚠⚠ 素の object を enemies へ push しない — 添字並列の DOM 配列が 11 本ある。
 *   本番の factory (createEnemy + createEnemyDom) をそのまま通すのが唯一安全な作り方。
 * ⭐⭐⭐ (3b) の決定論は「測る直前に camZ / camX / camY / shake / 敵の座標を**全部固定する**」
 *   ことで作る。⛔ computeCameraTarget に任せない (PT と仲間の位置でカメラが動き、
 *   両アームで数 px ずれて「恒等が崩れた」と誤報する)。
 * ⛔ updatePositions() ではなく renderWorld() を直に呼ぶ — updatePositions は
 *   カメラのグライド分岐を持つので、呼んだ瞬間の camX/camY が非決定的になる。 */
function BADGE_SNAPSHOT(cfg) {
  const out = { ok: false, err: null, fixture: { ok: false, err: null, made: [], renderOk: false } };
  try {
    out.badgeOn = (typeof ENEMY_BADGE_ON !== 'undefined') ? !!ENEMY_BADGE_ON : null;
    out.nameLabelOn = (typeof NAME_LABEL_ON !== 'undefined') ? !!NAME_LABEL_ON : null;

    // ── (3a)(3c)(3d) = 素の母集団 ────────────────────────────────────────────
    out.badgeDom0 = document.querySelectorAll('.enemyBadge').length;
    out.enemyCount0 = enemies.length;
    out.badgeArrayLen0 = enemyBadgeElements.length;
    out.badgeNonNull0 = enemyBadgeElements.filter(b => b !== null && b !== undefined).length;
    out.labelArrayLen0 = enemyLabelElements.length;
    out.statusArrayLen0 = enemyStatusElements.length;
    out.elemArrayLen0 = enemyElements.length;
    out.enemyTypeCount = Object.keys(ENEMY_TYPES).length;
    out.badgeDataCount = Object.keys(ENEMY_TYPES).filter(k => {
      const d = ENEMY_TYPES[k];
      return !!(d && typeof d.badge === 'string' && d.badge.length > 0);
    }).length;
    out.badgeOfKey = {};
    for (const k of Object.keys(cfg.expect)) {
      out.badgeOfKey[k] = (ENEMY_TYPES[k] && ENEMY_TYPES[k].badge) || null;
    }
    /* ⛔ CSS .enemyBadge は残す (依頼書 §4-3.4)。同一オリジンの inline <style> なので
     *   cssRules は読める。読めなかった枚数も残す (静かに false にならないため)。 */
    out.cssRule = false; out.cssUnreadable = 0;
    for (const ss of Array.from(document.styleSheets)) {
      let rules = null;
      try { rules = ss.cssRules; } catch (e) { out.cssUnreadable++; continue; }
      if (!rules) { out.cssUnreadable++; continue; }
      for (const r of Array.from(rules)) {
        if (r.selectorText && r.selectorText.indexOf('.enemyBadge') >= 0) out.cssRule = true;
      }
    }

    // ── (3b) 恒等のための固定 ────────────────────────────────────────────────
    shakeX = 0; shakeY = 0;
    if (typeof setCamZoom === 'function') setCamZoom(cfg.z); else camZ = cfg.z;
    const made = [];
    try {
      for (const p of cfg.fixture) {
        if (!ENEMY_TYPES[p.key]) { out.fixture.err = '未知の敵キー ' + p.key; break; }
        const idx = enemies.length;
        const e = createEnemy(p.key, p.tx, p.ty);
        e.everSeen = true; e.state = 'idle'; e.alive = true;
        enemies.push(e);
        createEnemyDom(idx, e.def, p.key);
        made.push({ idx: idx, key: p.key, tx: p.tx, ty: p.ty });
      }
    } catch (err) { out.fixture.err = String((err && err.message) || err); }
    out.fixture.made = made;
    out.fixture.ok = !out.fixture.err && made.length === cfg.fixture.length;
    /* ⭐ 状態アイコン列を**空でない**状態にする。空の flex は 0x0 になり、恒等 assert が
     *   「点が動かない」しか見なくなる (幅と高さの差を取りこぼす)。
     *   ⛔ 効果 id を写経せず定義の先頭から引く (定義が変わってもドライバは腐らない)。 */
    out.statusId = null;
    try {
      const sid = Object.keys(STATUS_EFFECT_DEFS)[0];
      out.statusId = sid;
      if (sid && made.length) applyStatus(enemies[made[0].idx], sid, 5);
    } catch (err) { out.statusErr = String((err && err.message) || err); }

    /* カメラをフィクスチャの中心へ**明示的に**置く。SX(wx) = (wx - camX) * camZ なので
     * 画面中央 W/2 へ wx を出すには camX = wx - (W/2)/camZ。⚠ 式は 1 行に閉じて記録も残す。 */
    const first = cfg.fixture[0], last = cfg.fixture[cfg.fixture.length - 1];
    const cwx = (first.tx + last.tx) / 2 * TILE_SIZE + TILE_SIZE / 2;
    const cwy = first.ty * TILE_SIZE + TILE_SIZE / 2;
    camX = cwx - (window.innerWidth / 2) / camZ;
    camY = cwy - (window.innerHeight / 2) / camZ;
    out.cam = { camX: camX, camY: camY, camZ: camZ,
                vw: window.innerWidth, vh: window.innerHeight, cwx: cwx, cwy: cwy };
    try { renderWorld(); out.fixture.renderOk = true; }
    catch (err) { out.fixture.renderErr = String((err && err.message) || err); }

    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, w: r.width, h: r.height };
    };
    out.rows = made.map(p => {
      const lb = enemyLabelElements[p.idx] || null;
      const st = enemyStatusElements[p.idx] || null;
      return {
        idx: p.idx, key: p.key, tx: p.tx, ty: p.ty,
        label: rectOf(lb), status: rectOf(st),
        sprite: rectOf(document.getElementById('enemy' + p.idx)),
        hp: rectOf(document.getElementById('hpBar' + p.idx)),
        labelText: lb ? (lb.textContent || '') : null,
        statusKids: st ? st.childElementCount : null,
      };
    });

    // ── (4c) = フィクスチャを足した**後**の観測 (敵の数だけ生成されているか) ──
    out.badgeDom1 = document.querySelectorAll('.enemyBadge').length;
    out.enemyCount1 = enemies.length;
    out.badgeArrayLen1 = enemyBadgeElements.length;
    out.badgeTexts = Array.from(document.querySelectorAll('.enemyBadge')).map(n => n.textContent || '');
    out.ok = true;
  } catch (e) {
    out.err = (e && e.message) || String(e);
  }
  return out;
}
function badgeOf(m) { return (m && m.ok && m.badge && m.badge.ok) ? m.badge : null; }
function badgePop(m) {
  if (!m || !m.ok) return popFail('測定', (m && m.err) || 'SNAPSHOT が失敗');
  return popFail('§3 の採取', (m.badge && m.badge.err) || 'BADGE_SNAPSHOT が失敗');
}
/* (3b) の基準アーム。⭐ **1 回だけ**測って全 assert で使い回す (git の blob は不変なので
 *   変異ごとに測り直す必要が無い)。⚠ 素の measure と同じ手順を通す = 差は index.html だけ。 */
let REF_MEASURE = null;
/* (4a) の**素のアーム**。⭐ 撤退アームの数値だけ見る assert は「1 マスも足していない」を
 *  素通りさせる (素も撤退も 58.75% になるので恒等が自明に成立する)。⇒ 素のアームを控えて
 *  おき、**両アームの差がちょうど walkBlockNew** であることまで (4a) が見る。 */
let BASE_MEASURE = null;

async function closeDialogs(page) {
  for (let i = 0; i < 14; i++) {
    let quiet = false;
    try { quiet = await page.evaluate(() => !skillCheckActive && !dialogPaused); } catch (e) { quiet = true; }
    if (quiet) return;
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
      if (b.length) b[b.length - 1].click();
      const ov = document.getElementById('skillCheckOverlay');
      if (ov && ov.classList.contains('show')) {
        const r = document.getElementById('scRollBtn'); if (r) r.click(); ov.click();
      }
      document.body.click();
    });
    await sleep(300);
  }
}

async function measure(browser, port, errs, opts) {
  opts = opts || {};
  const query = '?diag=1&intel=0' + (opts.query ? '&' + opts.query.replace(/^\?/, '') : '');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => errs.push('[:' + port + '] PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('[:' + port + '] CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((scen, key) => {
    try {
      sessionStorage.setItem(key, scen);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    /* (0c) の記録簿。⭐ spawnCastCircle が押す実装側の唯一の窓。 */
    window.__castCircleProbe = [];
  }, SCENARIO_ID, SCENARIO_KEY);
  await page.goto('http://localhost:' + port + PAGE_PATH + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof isTileWall === 'function' && typeof aStar === 'function'"
    + " && typeof nodeGateTile === 'function' && typeof spawnCastCircle === 'function'"
    + " && typeof buildNode === 'function'", { timeout: 25000 });
  /* ⚠⚠ startGame() を通さないと検出器が丸ごと沈黙する (applyNodeZoom もこの後ろ)。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await sleep(900);
  await closeDialogs(page);

  // ── 対象ノードへ入る。⚠ enter() は到着直後のイベントを await するので await しない ──
  await page.evaluate((to, dir) => {
    window.__wbEnterDone = false;
    window.__wbEnter = window.__graphRun.enter(to, dir).then(() => { window.__wbEnterDone = true; });
  }, opts.node || NODE_ID, opts.dir || ENTER_DIR);
  for (let i = 0; i < 150; i++) {
    let at = null;
    try { at = await page.evaluate(() => window.__graphRun.nodeId()); } catch (e) {}
    if (at === (opts.node || NODE_ID)) break;
    await sleep(120);
  }
  await closeDialogs(page);
  await sleep(900);

  /* (0c) の母集団 — **陣を実際に 1 枚出す**。
   * ⚠ シート未ロードだと spawnCastCircle は null を返して**静かに何も出さない**ので、
   *   まずロードを待つ。待っても載らなければ (0c) が赤になる (それが正しい)。 */
  try {
    await page.waitForFunction(
      "typeof MAGIC_CIRCLE_SHEET !== 'undefined' && MAGIC_CIRCLE_SHEET.loaded === true",
      { timeout: 12000 });
  } catch (e) { /* (0c) が赤になる */ }
  await page.evaluate(() => {
    try {
      window.__castCircleProbe.length = 0;
      const sim = { x: playerX, y: playerY, def: { displaySize: 96, name: '装置(0c)' } };
      const h = spawnCastCircle(sim, 'arcane', 400);
      if (h && h.destroy) h.destroy();
    } catch (e) {}
  });

  const snap = await page.evaluate(SNAPSHOT, {
    gateDirs: GATE_DIRS, scenario: SCENARIO_ID, node: opts.node || NODE_ID,
    protectedTiles: PROTECTED,
  });
  /* ⚠ §2 は SNAPSHOT の**後**に測る。camZ を 4 点動かして戻すので、先に走らせると
   *   §1 の到達性を「素の camZ ではない状態」で測ってしまう恐れがある。 */
  snap.vfx = await page.evaluate(VFX_SNAPSHOT, { zooms: VFX_ZOOMS, size: VFX_SIZE });
  /* ⚠⚠⚠ §3 は**最後**に測る。BADGE_SNAPSHOT は enemies へ 3 体足し、camZ / camX / camY を
   *   固定したまま返すので、先に走らせると §0 (0b) の敵の件数も §1 の到達性も汚れる。 */
  snap.badge = await page.evaluate(BADGE_SNAPSHOT, {
    fixture: BADGE_FIXTURE, z: BADGE_FIX_Z, expect: BADGE_EXPECT,
  });
  if (!opts.keepPage) await page.close();
  snap.port = port;
  return snap;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (依頼書 §8)
//   [key, 見出し, (m) => [bool, detail]]
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  // ── §0 装置 (先に母集団を確かめる) ─────────────────────────────────────────
  ['0a', '対象ノードが n1 で、床タイルが 1 マス以上ある (⭐ 無いと §1 が全部空振りで永久緑)',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      const okNode = m.node === NODE_ID;
      const okFloor = m.floorN >= 1;
      const row = m.rows && m.rows[m.start.ty - m.rect[0]];
      const okStart = !!row && row[m.start.tx - m.rect[1]] === '.';
      return [okNode && okFloor && okStart,
        'node=' + m.node + ' 床=' + m.floorN + '/' + m.area + 'マス'
        + ' 起点=(' + m.start.tx + ',' + m.start.ty + ')' + (okStart ? ' 歩ける' : ' ⛔ 壁の中')
        + ' rect=' + JSON.stringify(m.rect) + ' MAPDEF.start=(' + m.mapStart.tx + ',' + m.mapStart.ty + ')'];
    }],
  ['0b', '敵スロットが ' + FOE_COUNT_EXPECT + ' 箇所取れている (0 件なら測定器が壊れている)',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      const n = (m.foes || []).length;
      const boss = (m.foes || []).filter(f => f.boss).length;
      return [n === FOE_COUNT_EXPECT && boss === 1,
        '敵 ' + n + ' 体 (期待 ' + FOE_COUNT_EXPECT + ') / ボス ' + boss + ' 体  '
        + (m.foes || []).map(f => f.name + '(' + f.tx + ',' + f.ty + ')').join(' ')];
    }],
  ['0c', '陣が実際に 1 枚以上生成された (シート未ロードだと静かに何も出さない)',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      return [m.castProbeLen >= 1,
        '__castCircleProbe.length=' + m.castProbeLen + ' / MAGIC_CIRCLE_SHEET.loaded=' + m.sheetLoaded];
    }],
  ['0d', 'マスクの寸法が tileBounds と一致 (n1 = 23 行 x 39 文字)',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      if (!m.mask || !m.mask.hasBlocked) return popFail('マスク', 'blocked が取れない');
      const tb = m.mask.tileBounds;
      const wantRows = m.rect[2] - m.rect[0] + 1, wantCols = m.rect[3] - m.rect[1] + 1;
      const sameBounds = tb.length === 4 && tb.every((v, i) => v === m.rect[i])
        && tb.every((v, i) => v === MASK_TILE_BOUNDS[i]);
      const okRows = m.mask.rows === wantRows;
      const okCols = m.mask.rowLens.length === 1 && m.mask.rowLens[0] === wantCols;
      return [sameBounds && okRows && okCols,
        'tileBounds=' + JSON.stringify(tb) + ' rect=' + JSON.stringify(m.rect)
        + ' マスク ' + m.mask.rows + '行 x ' + JSON.stringify(m.mask.rowLens) + '文字'
        + ' (期待 ' + wantRows + ' x ' + wantCols + ') sealRing=' + m.mask.sealRing];
    }],

  // ── §1 到達性 (1 点目の本体) ───────────────────────────────────────────────
  ['1a', '起点から ' + GATE_DIRS_MUST_REACH.join('/') + ' の 3 ゲートへ 本番の aStar が経路を返す',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      const missing = GATE_DIRS.filter(d => !m.gates[d]);
      if (missing.length) return popFail('ゲート', 'nodeGateTile が返さない方角: ' + missing.join(','));
      const bad = GATE_DIRS_MUST_REACH.filter(d => m.gateLegs[d] === null);
      /* ⭐ 除外が黙って増えないよう、除外集合そのものも同じ assert で縛る。 */
      const okExcl = GATE_DIRS_EXCLUDED.length === 1 && GATE_DIRS_EXCLUDED[0] === 'down';
      return [bad.length === 0 && okExcl,
        GATE_DIRS.map(d => d + '(' + m.gates[d].tx + ',' + m.gates[d].ty + ')='
          + (m.gateLegs[d] === null ? '到達不能' : m.gateLegs[d] + '歩')
          + (GATE_DIRS_EXCLUDED.indexOf(d) >= 0 ? '[除外]' : '')).join(' ')
        + (bad.length ? '  ⛔ 到達不能: ' + bad.join(',') : '')
        + '   除外の理由: ' + GATE_EXCLUDED_WHY];
    }],
  ['1b', '起点から ' + FOE_COUNT_EXPECT + ' 箇所の敵スロットすべてへ経路がある',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      if ((m.foes || []).length !== FOE_COUNT_EXPECT)
        return popFail('敵スロット', '(0b) が立っていない (敵 ' + (m.foes || []).length + ' 体)');
      const bad = [];
      m.foes.forEach((f, i) => { if (m.foeLegs[i] === null) bad.push(f.name + '(' + f.tx + ',' + f.ty + ')'); });
      return [bad.length === 0,
        m.foes.map((f, i) => f.name + '(' + f.tx + ',' + f.ty + ')='
          + (m.foeLegs[i] === null ? '⛔到達不能' : m.foeLegs[i] + '歩')).join(' ')];
    }],
  ['1c', '敵スロットのうち isTileWall が真のものが 0 箇所 (樽に埋まった敵を作らない)',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      if ((m.foes || []).length !== FOE_COUNT_EXPECT)
        return popFail('敵スロット', '(0b) が立っていない (敵 ' + (m.foes || []).length + ' 体)');
      const bad = m.foes.filter(f => f.wall);
      return [bad.length === 0,
        '塞がれた敵 ' + bad.length + '/' + m.foes.length + ' 体'
        + (bad.length ? '  ⛔ ' + bad.map(f => f.name + '(' + f.tx + ',' + f.ty + ')').join(' ') : '')];
    }],
  ['1d', '床タイルの 4 近傍連結成分が 1 つ (起点から本番の aStar で届かない床が無い)',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      if (!(m.floorN >= 1)) return popFail('床タイル', '(0a) が立っていない');
      /* ⭐ 例外は「除外ゲートのタイル」だけ。⛔ 座標をベタ書きせず gates から引く
       *   (ファイル冒頭 (B) の理由で、着手前から 1 マスだけ孤島が居る)。 */
      const allow = new Set(GATE_DIRS_EXCLUDED.map(d => m.gates[d] ? tkey(m.gates[d]) : 'x'));
      const bad = (m.unreachable || []).filter(t => !allow.has(tkey(t)));
      return [bad.length === 0,
        '到達不能な床 ' + (m.unreachable || []).length + ' マス'
        + ' (うち除外ゲート ' + ((m.unreachable || []).length - bad.length) + ' マス)'
        + '  一覧=' + JSON.stringify((m.unreachable || []).map(t => t.tx + ',' + t.ty))
        + (bad.length ? '  ⛔ 孤島: ' + bad.map(tkey).join(' ') : '')];
    }],
  ['1e', '塞がり率が上限 ' + (BLOCK_RATIO_MAX * 100).toFixed(0) + '% 以下 (⭐ 絶対量で打ってよい)',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      if (!(m.area > 0)) return popFail('部屋の面積', 'rect が取れない');
      const blocked = m.area - m.floorN;
      const ratio = blocked / m.area;
      return [ratio <= BLOCK_RATIO_MAX,
        '塞がり ' + blocked + '/' + m.area + ' = ' + (ratio * 100).toFixed(2) + '%'
        + ' (上限 ' + (BLOCK_RATIO_MAX * 100).toFixed(0) + '% / 2026-09-03 の現行 58.75%)'
        + '  applyPaintingBlocking: applied=' + (m.paint ? m.paint.applied : '?')
        + ' ring=' + (m.paint ? m.paint.ring : '?') + ' skipGate=' + (m.paint ? m.paint.skipGate : '?')];
    }],
  ['1f', '規則②④の保護マス ' + PROTECTED.length + ' 箇所が歩ける (1 つでも壁になったら赤)',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      const st = m.protectedState || [];
      if (st.length !== PROTECTED.length) return popFail('保護マス', '採取できていない');
      const outside = st.filter(t => !t.inside);
      const walls = st.filter(t => t.wall);
      return [walls.length === 0 && outside.length === 0,
        '保護 ' + st.length + ' マス中 壁 ' + walls.length + ' / 部屋の外 ' + outside.length
        + (walls.length ? '  ⛔ ' + walls.map(t => '(' + t.tx + ',' + t.ty + ') ' + t.why).join(' / ') : '')
        + (outside.length ? '  ⛔ 範囲外 ' + outside.map(t => '(' + t.tx + ',' + t.ty + ')').join(' ') : '')];
    }],

  // ── §2 魔法陣 / 火炎コア (2 点目の本体) ────────────────────────────────────
  ['2a', 'camZ ∈ {' + VFX_ZOOMS.join(', ') + '} の 4 点**すべて**で、陣の楕円中心と術者の足元の'
    + '画面座標が ±' + VFX_TOL_PX.toFixed(1) + 'px 以内 (⭐ 1 点しか測らない assert は今回の欠陥を検出できない)',
    (m) => assertCircleAnchored(m, VFX_ZOOMS)],
  ['2b', 'camZ=1 のとき transform が translate(-50%, -64%) scale(<f>) に**完全一致** (前置も後置も無い)',
    (m) => {
      const v = vfxOf(m); if (!v) return vfxPop(m);
      const r = v.circle.find(x => x.z === 1);
      if (!r || !r.ok) return popFail('陣 (camZ=1)', '1 枚も出なかった');
      const q = castTfParts(r.transform);
      const ok = !!q && q.fy === 64 && q.z === null && q.f > 0;
      return [ok, 'transform="' + r.transform + '"  parts=' + JSON.stringify(q)
        + (ok ? '   ⭐ 後置の scale が無い = 従来とビット等価' : '   ⛔ 期待 = translate(-50%, -64%) scale(<f>)')];
    }],
  ['2c', 'camZ=0.25 のとき transform の**先頭が scale( でない** (⛔ 部分一致の正規表現では見ない)',
    (m) => {
      const v = vfxOf(m); if (!v) return vfxPop(m);
      const r = v.circle.find(x => x.z === 0.25);
      if (!r || !r.ok) return popFail('陣 (camZ=0.25)', '1 枚も出なかった');
      const tf = r.transform || '';
      const headIsScale = /^\s*scale\(/.test(tf);
      const q = castTfParts(tf);                 // 全体一致 (前置形なら null になる)
      const whole = !!q && q.fy === 64 && q.z === 0.25;
      /* ⭐ 参考: §2-7 の 5.4 と同じ**部分一致**でも見て、両者の差を detail に出す。
       *   壊れた文字列でも部分一致は true になる = 「なぜ 53/53 が緑だったか」の実演。 */
      const legacyPartial = /translate\(-50%,\s*-64%\)/.test(tf);
      return [!headIsScale && whole,
        'transform="' + tf + '"  先頭が scale(=' + headIsScale + '  全体一致=' + whole
        + '   [参考] §2-7 と同じ部分一致だと=' + legacyPartial];
    }],
  ['2d', '火炎の爆発コアも 4 点すべてで中心が ±' + VFX_TOL_PX.toFixed(1) + 'px 以内 (3 段 x 4 camZ = 12 個)',
    (m) => {
      const v = vfxOf(m); if (!v) return vfxPop(m);
      if (v.core.length !== VFX_ZOOMS.length)
        return popFail('コアの標本', '測れた camZ = ' + v.core.map(r => r.z).join(','));
      const wrongN = v.core.filter(r => r.n !== VFX_CORE_N);
      if (wrongN.length) return popFail('火炎コア', 'camZ=' + wrongN.map(r => r.z + '→' + r.n + '個').join(',')
        + ' (期待 ' + VFX_CORE_N + ' 個 / err=' + (wrongN[0].err || 'なし') + ')');
      const bad = [];
      const all = [];
      v.core.forEach(r => r.cores.forEach(c => {
        const tag = 'z=' + r.z + (c.crit ? '/crit' : '/base') + ' Δ=(' + c.dx.toFixed(2) + ',' + c.dy.toFixed(2) + ')';
        all.push(tag);
        if (Math.abs(c.dx) > VFX_TOL_PX || Math.abs(c.dy) > VFX_TOL_PX) bad.push(tag);
      }));
      return [bad.length === 0,
        all.join('  ') + (bad.length ? '   ⛔ 超過 ' + bad.length + ' 個: ' + bad.join(' ') : '')
        + '   [computed=' + (v.core[0].cores[0] || {}).computed + ' anim='
        + (v.core[0].cores[0] || {}).anim + ' ⚠ inline transform は効かない (ヘッダ (D))]'];
    }],
  ['2e', '陣の見かけ直径が camZ に比例 (rect.width ≈ w * f * camZ、誤差 '
    + (VFX_DIAM_TOL * 100).toFixed(0) + '%)  ⭐ 位置だけ直して大きさを壊す修正を弾く',
    (m) => {
      const v = vfxOf(m); if (!v) return vfxPop(m);
      const rows = v.circle.filter(r => r.ok);
      if (rows.length !== VFX_ZOOMS.length) return popFail('陣の標本', '(2a) が立っていない');
      const det = [], bad = [];
      for (const r of rows) {
        /* ⛔ castCircleFrameAt を写経しない。展開アニメのコマ倍率 f は
         *   **transform に実際に書かれた値**から読む (実装と検証が式を共有しない)。
         *   ⚠ 前置形 (zprefix) でも translate の直後の scale が f になるよう分解する。 */
        const mm = /translate\([^)]*\)\s*scale\((\d+(?:\.\d+)?)\)/.exec(r.transform || '');
        const f = mm ? parseFloat(mm[1]) : null;
        if (f === null) { bad.push('z=' + r.z + ' f が読めない'); continue; }
        const want = r.w * f * r.z;
        const err = Math.abs(r.rectW - want) / want;
        det.push('z=' + r.z + ' rect=' + r.rectW.toFixed(2) + ' 期待=' + want.toFixed(2)
          + ' (w=' + r.w.toFixed(2) + ' f=' + f + ') 誤差=' + (err * 100).toFixed(2) + '%');
        if (err > VFX_DIAM_TOL) bad.push('z=' + r.z + ' 誤差 ' + (err * 100).toFixed(2) + '%');
      }
      return [bad.length === 0, det.join('  ') + (bad.length ? '   ⛔ ' + bad.join(' / ') : '')];
    }],

  // ── §4 撤退 (項目 2 の担当ぶん) ────────────────────────────────────────────
  ['4b', '?castanchor=0 → camZ=' + CAST_LEGACY.z + ' で陣のズレが ('
    + CAST_LEGACY.dx + ', ' + CAST_LEGACY.dy + ')px ±' + VFX_TOL_PX.toFixed(1)
    + ' へ戻り、火炎コアも (' + CAST_LEGACY.coreDx + ', ' + CAST_LEGACY.coreDy + ')px へ戻る',
    (m) => {
      const v = vfxOf(m); if (!v) return vfxPop(m);
      /* ⭐⭐⭐ 撤退アームが**本当に撤退アームか**を先に確かめる。
       *   これが無いと「素のアームを測って緑」という永久緑が作れてしまう。 */
      if (v.castAnchorOn !== false || v.legacyClass !== true)
        return popFail('撤退アーム', 'CAST_ANCHOR_ON=' + v.castAnchorOn
          + ' / body.castAnchorLegacy=' + v.legacyClass + ' (?castanchor=0 が効いていない)');
      const r = v.circle.find(x => x.z === CAST_LEGACY.z);
      if (!r || !r.ok) return popFail('陣', 'camZ=' + CAST_LEGACY.z + ' で 1 枚も出なかった');
      const cRow = v.core.find(x => x.z === CAST_LEGACY.z);
      const c = cRow ? cRow.cores.filter(x => !x.crit)[0] : null;
      if (!c) return popFail('火炎コア', 'camZ=' + CAST_LEGACY.z + ' で base のコアが取れない');
      const okC = Math.abs(r.dx - CAST_LEGACY.dx) <= VFX_TOL_PX
        && Math.abs(r.dy - CAST_LEGACY.dy) <= VFX_TOL_PX;
      const okF = Math.abs(c.dx - CAST_LEGACY.coreDx) <= VFX_TOL_PX
        && Math.abs(c.dy - CAST_LEGACY.coreDy) <= VFX_TOL_PX;
      return [okC && okF,
        '陣 Δ=(' + r.dx.toFixed(2) + ',' + r.dy.toFixed(2) + ') 期待=(' + CAST_LEGACY.dx + ','
        + CAST_LEGACY.dy + ')' + (okC ? '' : ' ⛔')
        + '   火炎コア Δ=(' + c.dx.toFixed(2) + ',' + c.dy.toFixed(2) + ') 期待=('
        + CAST_LEGACY.coreDx + ',' + CAST_LEGACY.coreDy + ')' + (okF ? '' : ' ⛔')
        + '   tf="' + r.transform + '"'];
    }],

  // ── §3 バッジ廃止 (3 点目の本体) ───────────────────────────────────────────
  ['3a', '既定で document.querySelectorAll(".enemyBadge").length === 0'
    + '  (⭐ CSS .enemyBadge は残っていること — ?enemybadge=1 で必要)',
    (m) => {
      const b = badgeOf(m); if (!b) return badgePop(m);
      if (b.badgeOn !== false) return popFail('素のアーム',
        'ENEMY_BADGE_ON=' + b.badgeOn + ' (既定は false でなければならない)');
      if (!(b.enemyCount0 >= 1)) return popFail('敵', '素の母集団が 0 体 = 何も作らせずに数えている');
      return [b.badgeDom0 === 0 && b.cssRule === true,
        '.enemyBadge の DOM ' + b.badgeDom0 + ' 個 (敵 ' + b.enemyCount0 + ' 体)'
        + ' / CSS .enemyBadge ' + (b.cssRule ? 'あり ⭐' : '⛔ 無い (?enemybadge=1 で無地になる)')
        + ' (読めなかった stylesheet ' + b.cssUnreadable + ' 枚)'
        + ' / ENEMY_BADGE_ON=' + b.badgeOn];
    }],
  ['3b', '恒等: バッジを消しても敵の**名前札と状態アイコン列**の getBoundingClientRect が'
    + ' #46 前 (' + BADGE_REF_HASH + ') と 1px も変わらない'
    + '  ⚠ 基準は着手前 hash を**別 URL で同時配信**して取る (⛔ git show HEAD: にしない)',
    (m) => {
      const a = badgeOf(m); if (!a) return badgePop(m);
      const b = REF_MEASURE ? badgeOf(REF_MEASURE) : null;
      if (!b) return popFail('基準アーム', BADGE_REF_HASH + ' の測定が取れていない');
      /* ⭐⭐⭐ 基準アームが**本当に #46 前か**を測定の側でも確かめる。
       *   これが無いと「両アームともバッジ無し」= 恒等が自明に成立する永久緑になる。 */
      if (!(b.badgeDom0 > 0)) return popFail('基準アーム',
        '#46 前のはずなのに .enemyBadge が ' + b.badgeDom0 + ' 個 (基準が基準になっていない)');
      if (a.badgeDom0 !== 0) return popFail('素のアーム',
        '既定でバッジが ' + a.badgeDom0 + ' 個ある (先に (3a) を見ること)');
      if (!a.fixture.ok || !b.fixture.ok || !a.fixture.renderOk || !b.fixture.renderOk)
        return popFail('フィクスチャ',
          '素={ok:' + a.fixture.ok + ',render:' + a.fixture.renderOk + ',err:' + a.fixture.err + '}'
          + ' 基準={ok:' + b.fixture.ok + ',render:' + b.fixture.renderOk + ',err:' + b.fixture.err + '}');
      if (a.rows.length !== BADGE_FIXTURE.length || b.rows.length !== BADGE_FIXTURE.length)
        return popFail('恒等の標本', '素 ' + a.rows.length + ' 体 / 基準 ' + b.rows.length + ' 体');
      if (a.cam.camZ !== b.cam.camZ || a.cam.camX !== b.cam.camX || a.cam.camY !== b.cam.camY)
        return popFail('カメラの固定', '素=' + JSON.stringify(a.cam) + ' 基準=' + JSON.stringify(b.cam));
      const bad = [], det = [];
      let worst = 0, worstAt = '';
      const cmp = (tag, ra, rb) => {
        if (!ra || !rb) { bad.push(tag + ' 器が無い (素=' + !!ra + ' / 基準=' + !!rb + ')'); return; }
        for (const f of ['left', 'top', 'w', 'h']) {
          const d = Math.abs(ra[f] - rb[f]);
          if (d > worst) { worst = d; worstAt = tag + '.' + f; }
          if (d > BADGE_RECT_TOL) bad.push(tag + '.' + f + ' 素=' + ra[f].toFixed(2)
            + ' 基準=' + rb[f].toFixed(2) + ' Δ=' + d.toFixed(3));
        }
      };
      a.rows.forEach((r, i) => {
        const q = b.rows[i];
        cmp(r.key + ' 札', r.label, q.label);
        cmp(r.key + ' 状態列', r.status, q.status);
        cmp(r.key + ' 絵', r.sprite, q.sprite);
        cmp(r.key + ' HP', r.hp, q.hp);
        det.push(r.key + ' 札=' + (r.label
          ? ('(' + r.label.left.toFixed(2) + ',' + r.label.top.toFixed(2) + ' '
            + r.label.w.toFixed(2) + 'x' + r.label.h.toFixed(2) + ')') : 'なし')
          + ' 状態列=' + (r.status
            ? ('(' + r.status.left.toFixed(2) + ',' + r.status.top.toFixed(2) + ' '
              + r.status.w.toFixed(2) + 'x' + r.status.h.toFixed(2) + ')') : 'なし')
          + ' 子=' + r.statusKids);
      });
      return [bad.length === 0,
        '基準 ' + BADGE_REF_HASH + ':' + BADGE_REF_FILE + ' を :' + REF_MEASURE.port + ' で同時配信'
        + ' (基準側のバッジ ' + b.badgeDom0 + ' 個 / 素は ' + a.badgeDom0 + ' 個)'
        + '  camZ=' + a.cam.camZ + ' 状態=' + a.statusId
        + '  最大差 ' + worst.toFixed(3) + 'px' + (worstAt ? ' @' + worstAt : '')
        + ' [許容 ' + BADGE_RECT_TOL + 'px]  ' + det.join('  ')
        + (bad.length ? '   ⛔ ' + bad.join(' / ') : '')];
    }],
  ['3c', 'enemyBadgeElements.length === enemies.length (添字並列が崩れていない)'
    + '  ⛔ > 0 で見ない — OFF のとき中身は全部 null なので**長さ**でしか捕まらない',
    (m) => {
      const b = badgeOf(m); if (!b) return badgePop(m);
      if (!(b.enemyCount0 >= 1)) return popFail('敵', '素の母集団が 0 体');
      const okLen = b.badgeArrayLen0 === b.enemyCount0;
      const okNull = b.badgeOn ? true : (b.badgeNonNull0 === 0);
      /* ⭐ 併走する 3 本の添字並列配列も同じ長さであることを見る = 「バッジだけ」が
       *   ずれたのか「全体がずれている」のかが detail で分かる。 */
      const okSib = b.elemArrayLen0 === b.enemyCount0 && b.labelArrayLen0 === b.enemyCount0
        && b.statusArrayLen0 === b.enemyCount0;
      return [okLen && okNull && okSib,
        'enemyBadgeElements ' + b.badgeArrayLen0 + ' 本 / enemies ' + b.enemyCount0 + ' 体'
        + ' (うち非 null ' + b.badgeNonNull0 + ' 本、ENEMY_BADGE_ON=' + b.badgeOn + ')'
        + '  併走: enemyElements=' + b.elemArrayLen0 + ' enemyLabelElements=' + b.labelArrayLen0
        + ' enemyStatusElements=' + b.statusArrayLen0
        + (okLen ? '' : '   ⛔ 添字並列が崩れている (enemyBadgeElements[index] が別の敵を指す)')
        + (okNull ? '' : '   ⛔ OFF なのに非 null が混じっている')];
    }],
  ['3d', 'badge を持つ ENEMY_TYPES 定義が ' + BADGE_DATA_COUNT + ' 件のまま (データを 1 件も消していない)',
    (m) => {
      const b = badgeOf(m); if (!b) return badgePop(m);
      if (!(b.enemyTypeCount > 0)) return popFail('ENEMY_TYPES', '定義が 0 件');
      const names = Object.keys(BADGE_EXPECT);
      const okNamed = names.every(k => b.badgeOfKey[k] === BADGE_EXPECT[k]);
      return [b.badgeDataCount === BADGE_DATA_COUNT && okNamed,
        'badge 持ち ' + b.badgeDataCount + ' 件 / ENEMY_TYPES ' + b.enemyTypeCount + ' 種'
        + ' (期待 ' + BADGE_DATA_COUNT + " 件 = grep -c 'badge: \"' index.html)"
        + '  名指し: ' + names.map(k => k + '=' + JSON.stringify(b.badgeOfKey[k])).join(' ')
        + (okNamed ? '' : '   ⛔ 名指しの 2 件が期待と違う')];
    }],

  // ── §4 撤退 (項目 3 の担当ぶん) ────────────────────────────────────────────
  ['4c', '?enemybadge=1 → .enemyBadge が**敵の数だけ**生成され、'
    + Object.values(BADGE_EXPECT).join(' と ') + ' の textContent が実在する',
    (m) => {
      const b = badgeOf(m); if (!b) return badgePop(m);
      /* ⭐⭐⭐ 撤退アームが**本当に撤退アームか**を先に確かめる (4b と同じ作法)。
       *   これが無いと素のアームを測って「バッジ 0 個 = 0 体ぶん」で緑にできてしまう。 */
      if (b.badgeOn !== true) return popFail('撤退アーム',
        'ENEMY_BADGE_ON=' + b.badgeOn + ' (?enemybadge=1 が効いていない)');
      if (!(b.enemyCount0 >= 1)) return popFail('敵', '素の母集団が 0 体');
      const okBefore = b.badgeDom0 === b.enemyCount0;
      const okAfter = b.badgeDom1 === b.enemyCount1;   // フィクスチャ 3 体を足した後も一致
      const texts = b.badgeTexts || [];
      const missing = Object.keys(BADGE_EXPECT)
        .filter(k => texts.indexOf(BADGE_EXPECT[k]) < 0);
      return [okBefore && okAfter && missing.length === 0,
        '素の敵 ' + b.enemyCount0 + ' 体 → バッジ ' + b.badgeDom0 + ' 個'
        + ' / フィクスチャ後 ' + b.enemyCount1 + ' 体 → ' + b.badgeDom1 + ' 個'
        + '  配列 ' + b.badgeArrayLen1 + ' 本'
        + '  textContent=' + JSON.stringify(texts)
        + (missing.length ? '   ⛔ 出ていない: '
          + missing.map(k => k + '(' + BADGE_EXPECT[k] + ')').join(' ') : '   ⭐ 🐺 / 🏹 とも実在')];
    }],

  // ── §4 撤退 (項目 4 の担当ぶん) ────────────────────────────────────────────
  ['4a', '?walkblock=0 → n1 の塞がり率が #46 前の ' + WALK_BLOCK_LEGACY_BLOCKED + '/' + WALK_BLOCK_AREA
    + ' = ' + (WALK_BLOCK_LEGACY_BLOCKED / WALK_BLOCK_AREA * 100).toFixed(2) + '% へ戻る'
    + '  ⛔ 「戻る」だけでは**永久緑** (1 マスも足さなければ素のアームも同じ値) →'
    + ' 素のアームとの**差**と、外れたマス数まで同時に見る',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      const p = m.paint;
      if (!p) return popFail('__paintBlockProbe', 'シームが取れない');
      /* ⭐⭐⭐ 撤退アームが**本当に撤退アームか**を先に確かめる ((4b)(4c) と同じ作法)。 */
      if (p.walkBlockOn !== false)
        return popFail('撤退アーム', 'walkBlockOn=' + p.walkBlockOn + ' (?walkblock=0 が効いていない)');
      const b = BASE_MEASURE;
      if (!b || !b.ok || !b.paint) return popFail('素のアーム', '§0 の測定が取れていない');
      if (b.paint.walkBlockOn !== true)
        return popFail('素のアーム', 'walkBlockOn=' + b.paint.walkBlockOn + ' (素が既定になっていない)');
      const legacyBlocked = m.area - m.floorN;
      const baseBlocked = b.area - b.floorN;
      const n = p.walkBlockNew;
      const okNew = n >= 1;                                 // ⭐ 1 マスも足していなければ赤
      const okSkip = p.skipWalkBlock === n;                 // 足した分が撤退で全部外れた
      const okAbs = legacyBlocked === WALK_BLOCK_LEGACY_BLOCKED && m.area === WALK_BLOCK_AREA;
      const okDiff = (baseBlocked - legacyBlocked) === n;   // 素との差がちょうど n マス
      return [okNew && okSkip && okAbs && okDiff,
        '撤退 ' + legacyBlocked + '/' + m.area + ' = ' + (legacyBlocked / m.area * 100).toFixed(2) + '%'
        + ' (期待 ' + WALK_BLOCK_LEGACY_BLOCKED + '/' + WALK_BLOCK_AREA + ')' + (okAbs ? '' : ' ⛔')
        + '   素 ' + baseBlocked + '/' + b.area + ' = ' + (baseBlocked / b.area * 100).toFixed(2) + '%'
        + '   #46 で足した `#` = ' + n + ' マス' + (okNew ? '' : ' ⛔ 1 マスも足していない')
        + '   撤退で外れた = ' + p.skipWalkBlock + ' マス' + (okSkip ? '' : ' ⛔ 足した数と合わない')
        + '   両アームの差 = ' + (baseBlocked - legacyBlocked) + ' マス' + (okDiff ? ' ⭐' : ' ⛔')];
    }],
  ['4d', '⚠ 撤退アーム (?walkblock=0) でも §1 の到達性 (1a)(1b) が緑'
    + '  ⭐ 撤退枝にしか無いコードは素のアームだけ見る assert では原理的に捕まらない',
    (m) => {
      if (!m.ok) return popFail('測定', m.err || 'SNAPSHOT が失敗');
      if (!m.paint || m.paint.walkBlockOn !== false)
        return popFail('撤退アーム',
          'walkBlockOn=' + (m.paint ? m.paint.walkBlockOn : '取れない') + ' (?walkblock=0 が効いていない)');
      /* ⛔ 判定式を書き直さない — §1 の本体をそのまま撤退アームの測定へ掛ける
       *   (書き直すと「素のアームだけ厳しい / 撤退アームだけ甘い」が静かに生まれる)。 */
      const ra = ASSERT_OF['1a'][2](m);
      const rb = ASSERT_OF['1b'][2](m);
      return [ra[0] === true && rb[0] === true,
        '(1a)=' + (ra[0] ? '緑' : '⛔ 赤') + '  ' + ra[1]
        + '   (1b)=' + (rb[0] ? '緑' : '⛔ 赤') + '  ' + rb[1]];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

/* ══ 未実装の受入条件 (⛔ 配列ごと削除しない — 削ると PENDING という 3 値そのものが消える) ══
 * ⭐ 項目 4 で **空になった** = 依頼書 §8 の (0a)〜(4d) が全部実装済という意味。
 *   ⛔ 「PENDING が出ないから」といってこの配列と下のループを消さないこと。次のチケットが
 *     受入条件を先に宣言したくなったとき、3 値のうち PENDING という状態ごと失われる。 */
const PENDINGS = [];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_walkblock_');
  const browserPath = findBrowser();
  /* ⚠ ポートは MUT_ORDER の並びで固定的に割り当てる (impl の増減で番号が動かないように)。 */
  const PORT_OF = {};
  MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });
  /* (3b) の基準アーム。⚠ 変異の後ろへ置く = 変異が 16 本から増えても衝突しない。 */
  const REF_PORT = PORT + 1 + MUT_ORDER.length;

  console.log('=== verify_walk_block.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   対象 ' + SCENARIO_ID + '/' + NODE_ID
    + '   実装済の変異 ' + (MUT_SERVED.length ? MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ') : '(無し)'));

  console.log('[drv]   (3b) の基準 ' + BADGE_REF_HASH + ':' + BADGE_REF_FILE
    + ' を :' + REF_PORT + ' で**同時配信** (' + REF_SRC.length + 'B)'
    + '   ⛔ git show HEAD: を基準にしない = 実装後に永久緑になる');

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  servers.push(await startServer(REF_PORT, null, { file: BADGE_REF_FILE, body: REF_SRC }));
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const errs = [];

  try {
    /* ⭐⭐⭐ (3b) の基準アームを**先に 1 回だけ**測る (素のアームでも変異アームでも同じ基準を
     *   使い回す = git の blob は不変なので測り直す必要が無い)。
     * ⚠ 事故は refErrs に分けて数える (基準アームのノイズを本編の記録へ混ぜない)。 */
    const refErrs = [];
    mark('§3 の基準アーム — #46 前 ' + BADGE_REF_HASH + ' の index.html を :' + REF_PORT
      + ' で同時配信して測る (⛔ git show HEAD: にしない)');
    REF_MEASURE = await measure(browser, REF_PORT, refErrs, {});
    {
      const rb = badgeOf(REF_MEASURE);
      console.log('       基準 ok=' + (REF_MEASURE && REF_MEASURE.ok)
        + ' node=' + (REF_MEASURE && REF_MEASURE.node)
        + ' .enemyBadge=' + (rb ? rb.badgeDom0 : '—') + ' 個'
        + ' / 敵 ' + (rb ? rb.enemyCount0 : '—') + ' 体'
        + ' / ENEMY_BADGE_ON=' + (rb ? rb.badgeOn : '—') + ' (⚠ #46 前なので undefined が正しい)'
        + ' / フィクスチャ ' + (rb ? JSON.stringify(rb.fixture.made.length) : '—') + ' 体'
        + '  ページ事故 ' + refErrs.length + ' 件'
        + (refErrs.length ? ': ' + refErrs.slice(0, 3).join(' | ') : ''));
    }

    if (!NEGATIVE) {
      mark('§0 装置 — 母集団 (⭐ ここが立たないと §1 は全部空振りで永久緑)');
      const m = await measure(browser, PORT, errs, {});
      BASE_MEASURE = m;     // (4a) が「素との差 = 足した `#` の数」を見るために控える
      for (const key of ['0a', '0b', '0c', '0d']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§1 到達性 — ⭐⭐⭐ 本番の aStar だけで測る (ドライバ側に BFS は 1 行も無い)');
      for (const key of ['1a', '1b', '1c', '1d', '1e', '1f']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§2 魔法陣 / 火炎コア — ⭐⭐⭐ camZ を 4 点 (' + VFX_ZOOMS.join(' / ') + ') で測る');
      for (const key of ['2a', '2b', '2c', '2d', '2e']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§4 撤退 — ?walkblock=0 (⭐ 今回足した `#` **だけ**を外して 2026-09-03 のマスクで走る。'
        + '⛔ マスク全体を捨てるスイッチではない)');
      const mWalk = await measure(browser, PORT, errs, { query: 'walkblock=0' });
      for (const key of ['4a', '4d']) {
        const a = ASSERT_OF[key]; const r = a[2](mWalk);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§4 撤退 — ?castanchor=0 (⭐ 撤退アームでも**数値を打つ**。'
        + '「陣が出る」だけで測ると永久緑になる)');
      const mLegacy = await measure(browser, PORT, errs, { query: 'castanchor=0' });
      {
        const a = ASSERT_OF['4b']; const r = a[2](mLegacy);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§3 バッジ廃止 — ⭐ 恒等 (3b) の基準は着手前 hash ' + BADGE_REF_HASH
        + ' を :' + REF_PORT + ' で同時配信したもの');
      for (const key of ['3a', '3b', '3c', '3d']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§4 撤退 — ?enemybadge=1 (⚠ 慣習と逆向き。「廃止」なので既定 OFF = **=1 で復活**)');
      const mBadgeOn = await measure(browser, PORT, errs, { query: 'enemybadge=1' });
      {
        const a = ASSERT_OF['4c']; const r = a[2](mBadgeOn);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      /* ⭐ 項目 4 がマスクを 1 マスずつ触るときの目視用。⛔ 判定はしない (記録)。 */
      mark('[記録] n1 の歩行判定グリッド (⛔ 期待値ではない。項目 4 の読み解き用)');
      if (m.ok && m.rows) {
        const c1 = m.rect[1], r1 = m.rect[0];
        let head = '        ';
        for (let x = c1; x <= m.rect[3]; x++) head += (x % 10 === 0) ? String(Math.floor(x / 10)) : ' ';
        console.log(head);
        let head2 = '        ';
        for (let x = c1; x <= m.rect[3]; x++) head2 += String(x % 10);
        console.log(head2);
        m.rows.forEach((s, i) => {
          console.log('    ' + String(r1 + i) + (String(r1 + i).length < 2 ? ' ' : '') + '  ' + s);
        });
        console.log('    起点=(' + m.start.tx + ',' + m.start.ty + ')  camZ=' + m.camZ
          + '  applyPaintingBlocking=' + JSON.stringify(m.paint));
      }

      for (const [title, rows] of PENDINGS) {
        mark(title);
        for (const p of rows) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      mark('未実装の変異 (⛔ 件数から隠さない)');
      for (const k of MUT_TODO) {
        pending('(neg-' + k + ') 変異 ' + k + ' → '
          + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
          MUTATIONS[k].why + '  [予定の配信先 ' + MUTATIONS[k].file + ']');
      }

      mark('事故の記録 (⛔ ここで黙って捨てない)');
      console.log('       pageerror / console.error: ' + errs.length + ' 件'
        + (errs.length ? '\n         ' + errs.slice(0, 8).join('\n         ') : ''));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          const to = MUTATIONS[k].to;
          check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
            pure.body.split(to).length - 1 === 0 && mut.body.split(to).length - 1 === 1,
            f + '  素=' + (pure.body.split(to).length - 1) + '件 / 変異=' + (mut.body.split(to).length - 1) + '件');
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length,
            '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }

        mark('欠陥を注入すると担当の節が赤くなること (⛔ 空振り = FAILED)');
        for (const k of MUT_IMPL) {
          const negErrs = [];
          const mm = await measure(browser, PORT_OF[k], negErrs, {});
          if (MUTATIONS[k].inverse) {
            /* ⭐⭐⭐ 逆変異。zprefix と**同じ欠陥バイト**を配りながら、
             *   「camZ=1 だけを測る壊れた assert」に掛ける。
             *   壊れた assert = 緑 (素通り) かつ 4 点測る本物の (2a) = 赤 —
             *   この 2 つが**同時に**成り立って初めて「1 点しか測らない検査では
             *   捕まらない」= §2-7 の穴が機械で証明される。
             *   ⛔ どちらか一方だけでは証明にならないので AND で判定する。 */
            const full = ASSERT_OF['2a'][2](mm);
            const crip = assert2aCamZ1Only(mm);
            check('(neg-' + k + '-2a) 逆変異: 同じ欠陥を **camZ=1 だけ測る assert は素通りさせ**、'
              + '4 点測る本物の (2a) だけが赤くなる',
              crip[0] === true && full[0] === false,
              '壊れた assert(camZ=1 のみ)=' + (crip[0] ? '緑 = 素通り ⭐' : '⛔ 赤 (逆変異が成立しない)')
              + ' / 本物の (2a)=' + (full[0] ? '⛔ 緑のまま (空振り)' : '赤 ⭐')
              + '   [camZ=1] ' + crip[1] + '   [4 点] ' + full[1]);
            if (negErrs.length) {
              console.log('       [記録] 変異 ' + k + ' のページ事故 ' + negErrs.length + ' 件: '
                + negErrs.slice(0, 3).join(' | '));
            }
            continue;
          }
          for (const key of MUTATIONS[k].targets) {
            const a = ASSERT_OF[key];
            if (!a) {
              pending('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる',
                '⛔ (' + key + ') はまだ ASSERTS に無い (後続項目が実装する)');
              continue;
            }
            const r = a[2](mm);
            check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
              r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
          }
          /* ⭐⭐⭐ record = 「この変異では**緑のまま通る**節」を同じ走行で実証する。
             ⛔ 判定はしない (記録)。island が「(1a)(1b)(1c)(1e)(1f) をすり抜けるのに
             (1d) だけが落とす」= (1d) が存在する理由そのものを紙に残すため。 */
          for (const key of (MUTATIONS[k].record || [])) {
            const a = ASSERT_OF[key];
            if (!a) continue;
            const r = a[2](mm);
            console.log('       [記録・⛔ 判定しない] 変異 ' + k + ' でも ('
              + key + ') は ' + (r[0] ? '緑のまま' : '⛔ 赤になった') + '  — ' + r[1]);
          }
          if (negErrs.length) {
            console.log('       [記録] 変異 ' + k + ' のページ事故 ' + negErrs.length + ' 件: '
              + negErrs.slice(0, 3).join(' | '));
          }
        }
      }

      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⛔ 件数から隠さない)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → '
            + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
            MUTATIONS[k].why + '  [予定の配信先 ' + MUTATIONS[k].file + ']');
        }
      } else {
        mark('変異の実装漏れ');
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length);
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (最終項目の完了条件 = ここが 0 件):');
    for (const b of pend) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(failed.length ? 1 : 0);
})();
