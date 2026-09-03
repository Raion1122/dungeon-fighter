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
 * ■ 項目 1 (このコミット) で入ったもの — **§0 装置 (0a)〜(0d) / §1 到達性 (1a)〜(1f)**
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
 *   ⭐ 項目 1 で実装したのは **4 本** (popzero / island / sealgate / sealfoe)。
 *     残り 12 本は後続項目が埋める (⛔ MUT_ORDER からは消さない = 件数から隠さない)。
 *
 *   mutate      | 注入する欠陥                                       | 赤くなるべき節 | 実装
 *   popzero     | n1 の乱戦+護衛スロットを空にする                    | (0b)          | 項目1
 *   island      | (52,5) を塞いで (53,5) を孤島にする                 | **(1d) だけ** | 項目1
 *   sealgate    | ゲート (34,3) を塞ぐ                                | (1a)(1f)      | 項目1
 *   sealfoe     | 敵スロット (32,9) を塞ぐ                            | (1c)          | 項目1
 *   zprefix     | zTfAnchored を前置形へ戻す                          | (2a)(2c)      | 項目2
 *   camz1only   | camZ=1 だけを測る assert に差し替える                | (2a) の逆変異 | 項目2
 *   origin00    | .fxCastCircle の transform-origin を 0 0 に         | (2a)(2e)      | 項目2
 *   fireonly    | 火炎コアだけ前置形に戻す                            | (2d)          | 項目2
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
/* (0d) マスクの寸法。⭐ 行数がずれた状態で座標を語ると全部 1 タイルずれる。
 *  ⛔ 数値は写経ではなく **room.rect から導く** (下の (0d) を参照)。ここは tileBounds の
 *  「絵の側の宣言」と rect の「部屋の側の宣言」が一致することを見るための定数。 */
const MASK_TILE_BOUNDS = [2, 17, 24, 55];

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
const sealTo = (tx, ty, tag) => SEAL_ANCHOR
  + ' if (p.tw === 39 && p.th === 23) { obstacleTileMask[' + ty + ' * MAP_W + ' + tx + '] = 1; /* ' + tag + ' */ }';

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
  // ── 項目 2 (魔法陣) が実装する 5 本 ─────────────────────────────────────────
  zprefix: { impl: false, file: 'index.html', targets: ['2a', '2c'],
    why: 'zTfAnchored を前置形 ("scale(z) " + inner) へ戻す (= 従来のズレたまま)' },
  camz1only: { impl: false, file: 'tools/verify_walk_block.js', targets: ['2a'],
    why: '(2a) を camZ=1 だけ測る形に差し替える — ⭐ §2-7 の穴そのものを再現し、'
      + '「1 点しか測らない検査では捕まらない」を機械で示す逆変異' },
  origin00: { impl: false, file: 'index.html', targets: ['2a', '2e'],
    why: '.fxCastCircle の transform-origin を 0 0 にする' },
  fireonly: { impl: false, file: 'index.html', targets: ['2d'],
    why: '火炎の爆発コア (.fxFireImpactCore) だけ前置形に戻す' },
  nocircle: { impl: false, file: 'index.html', targets: ['0c'],
    why: 'spawnCastCircle を常に null にする (シート未ロードと同じ = 静かに何も出さない)' },
  // ── 項目 3 (バッジ廃止) が実装する 4 本 ─────────────────────────────────────
  badgepush: { impl: false, file: 'index.html', targets: ['3c'],
    why: 'バッジ OFF 時に enemyBadgeElements.push(null) をやめる (添字並列が崩れる = §2-8 の罠)' },
  badgeleak: { impl: false, file: 'index.html', targets: ['3a'],
    why: '既定で .enemyBadge を 1 個だけ作る' },
  badgedata: { impl: false, file: 'index.html', targets: ['3d'],
    why: 'ENEMY_TYPES の badge: を 1 件消す (データを消していないことの検査)' },
  labelshift: { impl: false, file: 'index.html', targets: ['3b'],
    why: 'バッジ廃止のついでに名前札を 3px 動かす (恒等 assert の検査)' },
  // ── 項目 4 (マスク編集) が実装する 3 本 ─────────────────────────────────────
  sealrail: { impl: false, file: 'index.html', targets: ['1f'],
    why: '規則② で空けてある マスク行18 の枕木 (グローバル col32-38 / row20) を塞ぐ' },
  sealp8: { impl: false, file: 'index.html', targets: ['1a', '1b', '1d'],
    why: '★P8 で開けた (37,16) の荷車の軒下を塞ぐ (南半分へ 4 近傍で下りられなくなる = §2-4 の罠)' },
  overblock: { impl: false, file: 'index.html', targets: ['1e', '1d'],
    why: '暗部率 0.5 の自動規則で n1 を塗り直す (§2-3 の再現 = なぜ自動生成を採らなかったかを機械で示す)' },
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
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        const ov = mutKey ? (MUT_SRC[mutKey] || null) : null;
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
                       skipSpawn: pb.skipSpawn, skipCorridor: pb.skipCorridor, onWall: pb.onWall } : null;
  } catch (e) {
    out.err = (e && e.message) || String(e);
  }
  return out;
}

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
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

/* ══ 未実装の受入条件 (⛔ 配列ごと削除しない — 削ると PENDING という 3 値そのものが消える) ══ */
const PENDINGS = [
  ['§2 魔法陣 (項目 2 の担当)', [
    ['2a', 'camZ ∈ {1, 0.8125, 0.5, 0.25} の 4 点すべてで陣の楕円中心と足元が ±1.0px 以内',
      '⭐ camZ を 1 点しか測らない assert は今回の欠陥を検出できない (§2-7 の穴)'],
    ['2b', 'camZ=1 のとき transform が translate(-50%, -64%) scale(<f>) に完全一致',
      '従来とビット等価であることの担保'],
    ['2c', 'camZ=0.25 のとき transform の先頭が scale( でない',
      '⚠ 部分一致の正規表現にしない — §2-7 の 5.4 は部分一致だったので壊れていても通った'],
    ['2d', '火炎の爆発コアも camZ=0.25 で中心が ±1.0px 以内', '.fxFireImpactCore (§2-6)'],
    ['2e', '陣の見かけ直径が camZ に比例 (rect.width ≈ w * camZ、誤差 2%)',
      '⭐ 位置だけ直して大きさを壊す修正を弾く'],
  ]],
  ['§3 バッジ廃止 (項目 3 の担当)', [
    ['3a', '既定で .enemyBadge が 0 個', ''],
    ['3b', '恒等: 名前札と状態アイコン列の rect が #46 前と 1px も変わらない',
      '⚠ 基準は着手前 hash の index.html を別 URL で同時配信して取る (⛔ git show HEAD: にしない)'],
    ['3c', 'enemyBadgeElements.length === enemies.length (添字並列が崩れていない)',
      '⭐ §2-8 の罠を直接測る。⛔ > 0 で見ない'],
    ['3d', 'badge を持つ ENEMY_TYPES 定義が 44 件のまま', 'データを消していない'],
  ]],
  ['§4 撤退 (項目 2 / 3 / 4 で分担)', [
    ['4a', '?walkblock=0 で n1 の塞がり率が 58.8% へ戻る', '項目 4'],
    ['4b', '?castanchor=0 で camZ=0.25 のズレが (54.06, 43.23)px ±1.0 に戻る',
      '項目 2 ⭐ 撤退アームでも数値を打つ'],
    ['4c', '?enemybadge=1 で .enemyBadge が敵の数だけ生成され 🐺 / 🏹 が実在する', '項目 3'],
    ['4d', '撤退アームでも §1 の到達性 (1a)(1b) が緑',
      '項目 4 ⭐ 撤退枝にしか無いコードは素のアームだけ見る assert では捕まらない'],
  ]],
];

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

  console.log('=== verify_walk_block.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   対象 ' + SCENARIO_ID + '/' + NODE_ID
    + '   実装済の変異 ' + (MUT_SERVED.length ? MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ') : '(無し)'));

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const errs = [];

  try {
    if (!NEGATIVE) {
      mark('§0 装置 — 母集団 (⭐ ここが立たないと §1 は全部空振りで永久緑)');
      const m = await measure(browser, PORT, errs, {});
      for (const key of ['0a', '0b', '0c', '0d']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      mark('§1 到達性 — ⭐⭐⭐ 本番の aStar だけで測る (ドライバ側に BFS は 1 行も無い)');
      for (const key of ['1a', '1b', '1c', '1d', '1e', '1f']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
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
