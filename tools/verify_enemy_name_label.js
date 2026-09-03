#!/usr/bin/env node
/*
 * verify_enemy_name_label.js — 敵の頭上の名前札 / 札を 70% へ (#44) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-03_enemy-name-label.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§4 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる
 *   (手本 = tools/verify_world_heromark.js / tools/verify_world_steps.js)。
 *
 * ■ 項目 1 (このコミット) で実際に測れるもの — **§0 装置だけ**
 *     (0a) 母集団 … ダンジョンが起動し、**見えている生存中の敵が 1 体以上**居る
 *                   ⭐⭐⭐ これが無いと §1 の全 assert が空振りで永久緑になる
 *                   ⚠ 依頼書 §8 の ⚠ に従い「(0a)(0e)(0f) の母集団が全部同じ 1 体に
 *                     ならないこと」も同じ assert の中で要求する (1 体だけで測ると
 *                     「その 1 体だけを特別扱いした実装」で全部通る = #39 の教訓)
 *     (0b) 2 経路 … 敵名の表を**写経しない**。配信バイト (GET /index.html) の
 *                   ENEMY_TYPES から name: を抜いた集合と、ページの
 *                   Object.keys(ENEMY_TYPES).length が一致する
 *     (0c) 装置   … 素の起動で document.body.classList.contains('labelSmall') === true
 *     (0d) 装置   … window.__enemyLabels() の長さ === enemies.length (添字並列が無傷)
 *     (0e) 母集団 … **バッジを持つ敵**が 1 体以上見えている ((1h) の母集団)
 *     (0f) 母集団 … **伏兵化フォグで隠れている敵**が 1 体以上居る ((1c) の母集団)
 *     (0g) 宣言   … **ドライバが敵の箱を寸法データから計算していない** (位置・寸法は
 *                   すべて getBoundingClientRect 由来 / placeUnscaledUi を写経しない)
 *     (0h) 母集団 … **見えている敵のうち最小のものが 70 以下** ((2f) の母集団)
 *
 * ■ 項目 2〜4 が埋めるもの (今は PENDINGS。⛔ 件数から隠さない)
 *     §1 敵の札      (1a)〜(1h)
 *     §2 70%         (2a)〜(2f)
 *     §3 恒等(非退行) (3a)〜(3d)
 *     §4 撤退        (4a)〜(4c)
 *
 * ■ ⚠⚠⚠ §0 の全ガードに共通の規則 — **母集団が立たなかったら「スキップして緑」にしない**
 *   (依頼書 §8 に太字で書いてある)。`(0a)(0e)(0f)(0h)` のどれかが偽になったら、
 *   **そのガード自身を FAIL にし、それを母集団とする本体の assert も FAIL** にする。
 *   ⭐ 「母集団が無いので測れなかった」を緑で記録すると、**assert が静かに消えるのに
 *     記録行は正常に見える**。#39 の「撤退アームだけ見ると永久緑」と同じ形で、
 *     本チケットでいちばん起こりやすい壊れ方。
 *   ⭐ 本体の assert 側は detail に `population: none` を出して
 *     「測れないから赤」と「値が悪いから赤」を区別できるようにする
 *     (項目 2 以降が §1/§2 を実装するときに `popFail()` を必ず通すこと)。
 *   → 変異 `bigonly` がこの規則自体を機械で検査する (下表)。
 *
 * ■ ⭐⭐⭐ 測定は **本番で配信される `/index.html` の上で行う**
 *   ⛔ 自前ハーネスに札だけを載せない — 本番ページだけが壊れているケースを
 *      永久に緑と報告するため。⛔ placeUnscaledUi の式を写経しない
 *      (実装と同じ間違いを共有して両方緑になる) → (0g) が機械で見る。
 *
 * ■ ⭐⭐⭐ 配信バイトは **起動時に 1 回だけ読んで凍結する** (下の SRC / MUT_SRC)。
 *   別窓が index.html を保存しても、走行中に混合ビルドにならない。
 *
 * ■ ⭐ 母集団は **本番の factory (createEnemy + createEnemyDom) をそのまま通して**作る。
 *   ⚠⚠ **素の object を enemies へ push してはいけない** — 添字並列の DOM 配列が
 *     **11 本** (#44 で 10 → 11) あるので、描画ループが即座に落ちる
 *     (driver_cast_circle.js の同じ注意書きと同根)。
 *   ⚠ 分岐マップの entry ノードは設計上わざと敵 0 体なので、フィクスチャ無しでは
 *     §1 の母集団が原理的に立たない (#39 / 卓上グリッド P1 の「母集団はカメラの
 *     置き方だけで消える」と同型の罠)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   ⭐ 項目 4 の担当。今は **17 本とも impl: false** = --negative は 17 本ぶんの
 *     PENDING を出す (⛔ 実装を忘れた変異が件数から消えないため MUT_ORDER には全部並べる)。
 *
 *   mutate      | 注入する欠陥                                              | 赤くなるべき節
 *   nolabel     | createEnemyDom の札生成ブロックを消す                       | (0a)(1a)(1b)
 *   noscale     | document.body.classList.add("labelSmall") を消す           | (0c)(2a)(2b)
 *   nocss       | body.labelSmall .enemyLabel { … } を消す                   | (2c) 敵だけ 100%
 *   noenemycss  | .enemyLabel { … } を丸ごと消す (className は残す)          | (2d) 罠C の再現
 *   deadshow    | 死亡時の札 hide を消す                                     | (1d)
 *   fogshow     | 伏兵化フォグの札 hide を消す                                | (1c)
 *   hydrashow   | ハイドラ封印の札 hide を消す                                | (1e)
 *   badgestay   | バッジ dy を -58 → -46 に戻す                              | (1h) 罠B の再現
 *   statusdetach| 状態アイコン列を札の子にせず独立配置のまま                    | (1g)
 *   typekey     | 札のテキストを def.name でなく typeKey にする                | (1b)
 *   nonull      | 撤退時の enemyLabelElements.push(null) を消す                | (0d) 添字ずれ
 *   noclear     | clearNodeArrays に 11 本目を足さない                        | (3d)
 *   noteardown  | driver_cast_circle.js の撤去ループへ足さない                  | (3d) 罠A の再現
 *   dyshift     | 札の dy を -27 → -30 にする                                | (2e)
 *   hpshift     | HP バーの dy を -10 → -12 にする                            | (3a) 恒等の空振り検査
 *   bothgrow    | .allyLabel の素と body.labelSmall の上書きを**同率で**膨らませる | **(2f) だけ**
 *   bigonly     | 配信バイトの ENEMY_TYPES で小さい敵の寸法を全部 96 へ         | **(0h) と (2f) が両方赤**
 *
 *   ⭐ §2-2 の罠A = noteardown / §2-5 の罠B = badgestay / §2-7 の罠C = noenemycss
 *     の 3 本が、起草中にしか見つからない知見を実装後まで生かす唯一の形。
 *   ⭐⭐⭐ bothgrow は「比だけで縛って絶対量を誰も見ていない」を、
 *     bigonly は「母集団が消えると assert も静かに消える」を、それぞれ機械で捕まえる。
 *     ⚠ bigonly での (2f) は「測れないから赤」であって「比が悪いから赤」ではないので、
 *       detail に `population: none` と出して区別できるようにすること。
 *
 *   ⚠ 変異アンカーは **部分文字列一致**で、配信スナップショット中に **ちょうど 1 箇所**
 *     ヒットしなければ **exit 3 でドライバごと死ぬ** (0 件でも 2 件以上でも空振りするため)。
 *   ⚠ 置換文字列は **1 行に閉じる** (index.html はディスク上 **CRLF** なので複数行アンカーは
 *     必ず空振りする。tools/*.js は LF)。
 *   ⚠ 置換前後で **長さを変える** (同じ長さだと「当たったのに何も変わらない」を検出できない)。
 *   ⭐ アンカーに選んだ行は **整形し直さない** (空白 1 つで exit 3 になる = 2026-08-12 の実測)。
 *   ⭐ 変異が空振りしたら、**変異のほうを直す** (受入条件を弱めない = #38 の教訓)。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   敵の札の色そのもの (#ffe0d8 / rgba(56,20,20,0.55)) / バッジの dy = -58 という具体値 /
 *   font-size: 7.7px という具体値 / 札が長い敵どうしの重なり (混雑時は別チケット) /
 *   **札の pointer-events**。
 *   ⭐⭐⭐ pointer-events を測らない理由を実測付きで残す (依頼書 §2-11(b)):
 *     ダンジョンの遊びのクリックは **document に張られた 1 本**で、e.clientX/clientY を
 *     WX()/WY() で世界座標へ直して openChestAt() を呼ぶだけ。
 *     `grep -c "elementFromPoint" index.html` = **0** (2026-09-03 実測)、札に
 *     stopPropagation も付けない。→ **札が何であってもクリックは通る** =
 *     「札がクリックの盾になる」欠陥は**原理的に起きない**。
 *     ⛔ だから pointer-events: none → auto の変異は作らない (必ず空振りする)。
 *     ⚠ #41 で街の .npcUnit がクリックを奪ったのは受け口が #tavernViewport で
 *       stopPropagation を足したから。**受け口の張り先が違うのであの教訓はここには効かない**。
 *   ⭐⭐⭐ 「素のアームで自明に真になる assert」は 1 本も書かない (依頼書 §2-11(c))。
 *     全 assert に「素で真 / どの変異で偽」の**対**がある。対が書けないものは
 *     **測っているつもりで判定していない**ので、assert にせず detail の出力に留める。
 *
 * ■ ⚠ 依頼書 §2-8 の「敵 46 種」は **起草時の数え違い**。2026-09-03 の実測は **50 種**
 *   (top-level キー 50 / name: 50 で 1:1)。⭐ だから (0b) は件数を**写経せず**、
 *   「配信バイトから抜いた集合」と「ページの Object.keys(ENEMY_TYPES)」の **2 経路の一致**
 *   だけを縛る (卓上グリッド P3 の教訓 ⑪ =「在庫の総数を写経した装置は、在庫が 1 件
 *   増えた日にまとめて嘘の赤を出す」)。
 *
 * ⚠ ポート **9850** (変異 9851〜9867 = 17 本 / 撤退アームの基準ページ 9870)。
 *   2026-09-03 実測の使用中 (grep -rho "9[0-9]\{3\}" tools/*.js): 9168〜9497 /
 *   9500 / 9530〜9593 / 9600 / 9615 / 9632 / 9665 / 9681 / 9715 / 9725 / 9774 /
 *   9789 / 9840 / 9999。⇒ **9850 番台と 9870 は空き**。⛔ 他のドライバのポートは触らない。
 *
 * 使い方:
 *   node tools/verify_enemy_name_label.js              # 受入条件 (素の配信)
 *   node tools/verify_enemy_name_label.js --negative   # 負のコントロール (項目 4 で実装)
 *   node tools/verify_enemy_name_label.js --mutate nolabel   # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える (2026-08-12 の実測)。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '9850'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (17 本。⭐ **項目 4 の担当** なので今は全部 impl: false)
//   ⛔ impl: false のまま MUT_ORDER には並べる = --negative が PENDING で 17 本ぶん出すので
//     「実装を忘れた変異」が件数から消えない。
//   ⚠ from/to は項目 4 が `grep -cF` で「配信バイト中ちょうど 1 件」を実測してから
//     書き入れて impl: true にすること (⛔ 当たることと赤くなることは別)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  nolabel: { impl: false, file: 'index.html', targets: ['0a', '1a', '1b'],
    why: 'createEnemyDom の札生成ブロックを消す (敵の札が 1 枚も出ない)' },
  noscale: { impl: false, file: 'index.html', targets: ['0c', '2a', '2b'],
    why: 'document.body.classList.add("labelSmall") を消す (70% が効かない)' },
  nocss: { impl: false, file: 'index.html', targets: ['2c'],
    why: 'body.labelSmall .enemyLabel { … } を消す (敵の札だけ 100% のまま)' },
  noenemycss: { impl: false, file: 'index.html', targets: ['2d'],
    why: '.enemyLabel { … } を丸ごと消す (className は残る = §2-7 罠C の再現)' },
  deadshow: { impl: false, file: 'index.html', targets: ['1d'],
    why: '死亡時の札 hide を消す (倒した敵の名前が床に残る)' },
  fogshow: { impl: false, file: 'index.html', targets: ['1c'],
    why: '伏兵化フォグの札 hide を消す (伏兵が名前で丸見えになる)' },
  hydrashow: { impl: false, file: 'index.html', targets: ['1e'],
    why: 'ハイドラ封印中の札 hide を消す (祭壇だけの見た目が壊れる)' },
  badgestay: { impl: false, file: 'index.html', targets: ['1h'],
    why: '装備バッジの dy を -58 → -46 に戻す (§2-5 罠B = 札と 9px 重なる)' },
  statusdetach: { impl: false, file: 'index.html', targets: ['1g'],
    why: '状態アイコン列を札の子にせず独立配置のままにする' },
  typekey: { impl: false, file: 'index.html', targets: ['1b'],
    why: '札のテキストを def.name でなく typeKey にする' },
  nonull: { impl: false, file: 'index.html', targets: ['0d'],
    why: '撤退時の enemyLabelElements.push(null) を消す (添字ずれ)' },
  noclear: { impl: false, file: 'index.html', targets: ['3d'],
    why: 'clearNodeArrays に 11 本目 (enemyLabelElements) を足さない' },
  noteardown: { impl: false, file: 'tools/driver_cast_circle.js', targets: ['3d'],
    why: 'driver_cast_circle.js の撤去ループへ enemyLabelElements を足さない (§2-2 罠A)' },
  dyshift: { impl: false, file: 'index.html', targets: ['2e'],
    why: '札の dy を -27 → -30 にする (placeUnscaledUi の上端が動く)' },
  hpshift: { impl: false, file: 'index.html', targets: ['3a'],
    why: 'HP バーの dy を -10 → -12 にする (恒等 assert の空振り検査)' },
  bothgrow: { impl: false, file: 'index.html', targets: ['2f'],
    why: '.allyLabel の素を font-size: 16px に、body.labelSmall の上書きを 11.2px に'
      + ' **同率で**膨らませる — ⭐⭐⭐ (2a)(2b)(2c) は比 0.70 のまま**緑で通る**。'
      + ' §2-11(e)「両方同じだけ壊れる変更」の再現で、この 1 本のためだけに (2f) がある' },
  bigonly: { impl: false, file: 'index.html', targets: ['0h', '2f'],
    why: '配信バイトの ENEMY_TYPES で 71 未満の敵の寸法を全部 96 へ書き換える'
      + ' (= (2f) の母集団を殺す) — ⭐⭐⭐ 「母集団が立たないので skip = 緑」を実装すると'
      + ' この変異が**空振り**する。§0 の共通規則そのものを機械で検査する 1 本' },
};
const MUT_ORDER = ['nolabel', 'noscale', 'nocss', 'noenemycss', 'deadshow', 'fogshow',
  'hydrashow', 'badgestay', 'statusdetach', 'typekey', 'nonull', 'noclear',
  'noteardown', 'dyshift', 'hpshift', 'bothgrow', 'bigonly'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_SERVED = MUT_IMPL.filter(k => !MUTATIONS[k].driver);
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
 *     走行中に「素の行」と「変異後の行」が混ざったビルドを配ってしまう。
 *  ⚠ 今は MUT_SERVED が空 (17 本とも impl: false) なのでこのループは 0 周する。 */
const SRC = {};
const MUT_SRC = {};
function editsOf(m) { return m.edits ? m.edits : [{ from: m.from, to: m.to }]; }
for (const k of MUT_SERVED) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  let body = SRC[m.file];
  const eds = editsOf(m);
  for (let i = 0; i < eds.length; i++) {
    const e = eds[i];
    const at = ' 変異 ' + k + (eds.length > 1 ? ' の置換 ' + (i + 1) + '/' + eds.length : '');
    if (typeof e.from !== 'string' || typeof e.to !== 'string') {
      console.error('[drv] ⛔' + at + ' の from/to が文字列でない'); process.exit(3);
    }
    if (e.from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔' + at + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)'); process.exit(3);
    }
    if (e.from.length === e.to.length) {
      console.error('[drv] ⛔' + at + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
    }
    const n = body.split(e.from).length - 1;
    if (n !== 1) {
      console.error('[drv] ⛔' + at + ' の置換対象が ' + m.file + ' 内に ' + n
        + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(e.from.slice(0, 90)));
      process.exit(3);
    }
    body = body.split(e.from).join(e.to);
  }
  MUT_SRC[k] = { file: m.file, body: body };
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

const PAGE_PATH = '/index.html';
/* 撤退のクエリ。§4 (項目 4) が本番で使う。 */
const RETREAT_QUERY = '?namelabel=0';
/* シナリオは **廃坑 (goblin-mine) に固定**する (依頼書 §8 (0h))。
   ⭐ 大型の敵しか出ない部屋を測ると (2f) の母集団が消えるため。 */
const SCENARIO_KEY = 'dragonfighters.currentScenario';
const SCENARIO_ID = 'goblin-mine';

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
/* 書体 + 画像が届いて layout() が落ち着くまで待つ。⛔ 固定時間だけに頼らない。 */
async function settle(page) {
  try { await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null); } catch (e) {}
  await sleep(300);
}
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
 *    「測れないから赤」と「値が悪いから赤」が記録の上で区別できる。
 *  ⚠ 項目 2 以降が §1/§2 を実装するときは、母集団ガードが偽の枝で **必ず** これを呼ぶこと。 */
function popFail(which, why) {
  return [false, 'population: none  (' + which + ' が立っていない: ' + why + ')'];
}

/* ⭐ 頭上 UI の帯は「矩形の交差」で測る (依頼書 §8 の ⚠ 計測機構)。
 *  ⛔ 中心 1 点や上端 1 点では取りこぼす (#42 で「中心の逃げ幅は不変なのに
 *     食われる面積は増えていた」を踏んだ)。⚠ (1h) が項目 2 で使う。 */
const overlaps = (a, b) => !!a && !!b && !(a.right <= b.left || b.right <= a.left ||
                                          a.bottom <= b.top || b.bottom <= a.top);

// ── §0 の計測パラメタ ────────────────────────────────────────────────────────
/* (0h) の閾値。⭐ 「見えている敵のうち最小のもの」が **これ以下**であることを要求する。
 *  ⚠ 依頼書 §8 (0h) の 70 = ホブゴブリン (74) では 100% の札でも比 0.270 で通ってしまうので、
 *    (2f) を効かせるには 70 以下の敵に当てるしかない、という較正から来た数値。
 *  ⛔ これは「敵の大きさの期待値」ではなく **(2f) を測れる母集団の定義**。 */
const SMALL_MAX = 70;
/* (0a)(0e)(0f) の母集団の下限 (依頼書 §8 = 「1 体以上」)。 */
const POP_MIN = 1;
/* ⚠ 依頼書 §8 の ⚠ =「(0a)(0e)(0f) の母集団が全部同じ 1 体にならないこと」。
 *  1 体だけで測ると「その 1 体だけを特別扱いした実装」で全部通る (#39 の教訓)。 */
const POP_DISTINCT_MIN = 2;
/* (0g) の自己検査マーカー。⭐ ドライバ自身のソースで敵の寸法データ語に触れる行は
 *  **すべて**この印を同じ行に持つこと = 「これはデータとしての参照であって、
 *  箱の計算ではない」という宣言。⛔ 印を付けずに触れた行があれば (0g) は赤になる。 */
const SELF_MARK = '[0g-data]';
/* (0g) が探す語。⛔ ソース中にベタ書きすると自分自身がヒットして意味が濁るので連結で作る。 */
const SIZE_WORD = 'display' + 'Size';
/* (0g) の第 2 条件。⭐ 実装の置き位置の式を**写経していない**こと
 *  (対象 = 本番の配置関数 placeUnscaledUi と、world → 画面の変換 SX / SY)。
 *  ⛔ 写経すると実装と同じ間違いを共有して両方緑になる (依頼書 §8 の測り方の方針)。
 *
 *  ⚠⚠⚠ 探すのは **開き括弧まで含めた呼び出し/複写の形**だけ、かつ
 *    **この定義行自身が literal を含まないよう連結で組む**。2026-09-03 の実装中に
 *    **2 回連続で自己ヒットした**ので、作法として書き残す:
 *      1 回目 … 裸の識別子で探したら §2 (2e) の見出し文
 *               「…の dy を動かしていない」に当たった
 *      2 回目 … 開き括弧付きに直したら、その理由を説明した**このコメント自身**に当たった
 *    ⭐ 教訓 = **自分自身を読む assert は、自分の説明文も母集団に入る**。
 *      ⇒ ① 判定トークンは連結で作る ② 散文では開き括弧を付けずに名前だけ書く
 *      (上の 1 行目のように「placeUnscaledUi」「SX / SY」と書くぶんには当たらない)。
 *  ⭐ 名前を書いて**説明する**ことと、式を**持ち込む**ことは別物 — 縛りたいのは後者だけ。 */
const FORBIDDEN_IN_SELF = ['place' + 'UnscaledUi(', 'S' + 'X(', 'S' + 'Y('];
/* (0g) の第 3 条件。⭐ 矩形は **すべて getBoundingClientRect 由来**であること。
 *  観測側 (ページ内 rectOf) が 1 枚ごとに via を刻み、ここで種類を突き合わせる。 */
const RECT_VIA_WANT = 'getBoundingClientRect';

const isFiniteNum = (v) => typeof v === 'number' && isFinite(v);

/* ══════════════════════════════════════════════════════════════════════════════
 * (0g) ドライバ自身のソースを読んで「箱を寸法データから計算していない」を宣言する
 *   ⭐⭐⭐ 依頼書 §2-11(a): 既存ドライバ 20 本以上は敵の箱を寸法データから計算しており、
 *     **名前札はその箱の外** (スプライト上端の -27..-12.6) に出るので、
 *     計算経路の assert では原理的に気づけない。DOM 経路で測っていることを装置自身で
 *     宣言しておかないと、次の窓が善意で計算経路へ書き換えて**永久緑**になる。
 *   ⚠ これが捕まえるのは「将来の書き換え」であって「今この瞬間の正しさ」ではない。
 *     今の正しさは §1/§2 の assert が DOM 矩形で測ることそのものが担保する。
 * ══════════════════════════════════════════════════════════════════════════════ */
function selfScan() {
  let src = '';
  try { src = fs.readFileSync(__filename, 'utf8'); }
  catch (e) { return { ok: false, err: 'ドライバ自身を読めない: ' + String((e && e.message) || e) }; }
  const at = src.indexOf("'use strict';");
  if (at < 0) return { ok: false, err: "ドライバ内に 'use strict'; が無い (先頭コメントを切り出せない)" };
  const body = src.slice(at);
  const rows = body.split('\n');
  const bad = [];
  let touched = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].indexOf(SIZE_WORD) < 0) continue;
    touched++;
    if (rows[i].indexOf(SELF_MARK) < 0) bad.push('L' + (i + 1) + ': ' + rows[i].trim().slice(0, 80));
  }
  const forbidden = FORBIDDEN_IN_SELF.filter(w => body.indexOf(w) >= 0);
  return { ok: true, err: null, touched: touched, bad: bad, forbidden: forbidden };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * (0b)(0h) 配信バイトから ENEMY_TYPES の name / 寸法を抜く
 *   ⭐ 敵名の表を**写経しない**。⛔ 件数 (50) も期待値として持たない —
 *     ページ側の Object.keys(ENEMY_TYPES).length との **2 経路の一致**だけを縛る。
 * ══════════════════════════════════════════════════════════════════════════════ */
function rosterFromBytes(html) {
  const head = 'const ENEMY_TYPES = {';
  const i = html.indexOf(head);
  if (i < 0) return { ok: false, err: '配信バイトに ' + head + ' が無い', names: [], sizes: [], keys: [] };
  const j = html.indexOf('\n    };', i);
  if (j < 0) return { ok: false, err: 'ENEMY_TYPES の終端が見つからない', names: [], sizes: [], keys: [] };
  const blk = html.slice(i, j);
  const names = [];
  const reName = /\n {8}name: "((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = reName.exec(blk)) !== null) names.push(m[1]);
  const sizes = [];
  const reSize = new RegExp('\\n {8}' + SIZE_WORD + ': *(\\d+)', 'g');   /* [0g-data] 名簿の数値をデータとして拾うだけ */
  while ((m = reSize.exec(blk)) !== null) sizes.push(parseInt(m[1], 10));
  const keys = [];
  const reKey = /\n {6}([A-Za-z_][A-Za-z0-9_]*): \{/g;
  while ((m = reKey.exec(blk)) !== null) keys.push(m[1]);
  return { ok: true, err: null, names: names, sizes: sizes, keys: keys, bytes: blk.length };
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 — ⛔ 返すのは **本番のデータ / 本番の関数 / ブラウザのレイアウト結果**だけ。
//        期待値を混ぜない (assert 側が突き合わせる)。
// ══════════════════════════════════════════════════════════════════════════════
async function measure(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.query || '') + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.evaluateOnNewDocument((k, v) => {
    try { sessionStorage.setItem(k, v); } catch (e) {}
  }, SCENARIO_KEY, SCENARIO_ID);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + (opts.query || ''),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  /* ⚠ 裸の識別子で待つ。classic script 直下の const/let/function は window に載らないので
     `window.createEnemy` は常に undefined (メモリ ⑩ の教訓)。 */
  await page.waitForFunction(
    () => typeof createEnemy === 'function' && typeof createEnemyDom === 'function'
      && typeof updatePositions === 'function' && typeof ENEMY_TYPES !== 'undefined'
      && typeof enemies !== 'undefined' && typeof TILE_SIZE !== 'undefined',
    { timeout: 25000 });
  await settle(page);

  /* ══ 母集団の作成 + 描画 + 観測を **1 回の evaluate** で通す ═══════════════
     ⭐ 途中でオートバトルの手番が回ると everSeen が立って (0f) の母集団が消えるので、
       仕込みと計測の間にゲームのフレームを挟まない。
     ⚠⚠ **素の object を enemies へ push しない** — 添字並列の DOM 配列が 11 本ある。
       本番の factory (createEnemy + createEnemyDom) をそのまま通すのが唯一安全な作り方。 */
  const m = await page.evaluate((mapWFallback) => {
    const out = {
      fixture: { ok: false, err: null, made: [], renderOk: false, renderErr: null },
      rectCount: 0, rectVia: [],
    };
    const VIA = {};
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      VIA['getBoundingClientRect'] = (VIA['getBoundingClientRect'] || 0) + 1;
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
               w: r.width, h: r.height, via: 'getBoundingClientRect' };
    };
    const safe = (f, d) => { try { return f(); } catch (e) { return d; } };

    // ── 母集団を本番の factory で作る ────────────────────────────────────────
    try {
      const ptx = Math.floor(playerX / TILE_SIZE);
      const pty = Math.floor(playerY / TILE_SIZE);
      const mapW = safe(() => MAP_W, mapWFallback) || mapWFallback;
      /* フォグ用の敵は **視界の外**へ置く (近くに置くと isEnemyVisibleToParty が真になって
         everSeen が立ち、(0f) の母集団が消える)。⭐ 盤の反対側の端を選ぶ。 */
      const farX = (ptx < mapW / 2) ? (mapW - 3) : 2;
      const plan = [
        { key: 'rat', tx: ptx + 2, ty: pty, mode: 'visible' },            // 最小 = (0h) の母集団
        { key: 'goblin', tx: ptx + 3, ty: pty + 1, mode: 'visible' },
        { key: 'hobgoblin', tx: ptx + 4, ty: pty - 1, mode: 'visible' },  // badge 持ち = (0e)
        { key: 'goblin', tx: farX, ty: pty, mode: 'fog' },                // (0f)
        { key: 'hydra', tx: ptx + 6, ty: pty + 3, mode: 'sealed' },       // (1e)
        { key: 'kobold', tx: ptx + 2, ty: pty + 2, mode: 'dead' },        // (1d)
      ];
      for (const p of plan) {
        if (!ENEMY_TYPES[p.key]) { out.fixture.err = '未知の敵キー ' + p.key; break; }
        const idx = enemies.length;
        const e = createEnemy(p.key, p.tx, p.ty);
        if (p.mode === 'visible') { e.everSeen = true; e.state = 'idle'; }
        else if (p.mode === 'fog') { e.everSeen = false; e.state = 'idle'; }
        else if (p.mode === 'sealed') { e.everSeen = true; e.inactive = true; }
        else if (p.mode === 'dead') { e.everSeen = true; e.alive = false; }
        enemies.push(e);
        createEnemyDom(idx, e.def, p.key);
        out.fixture.made.push({ idx: idx, key: p.key, mode: p.mode });
      }
      out.fixture.ok = !out.fixture.err && out.fixture.made.length === plan.length;
    } catch (err) { out.fixture.err = String((err && err.message) || err); }

    // ── 本番の描画ループを 1 回通す ──────────────────────────────────────────
    try { updatePositions(); out.fixture.renderOk = true; }
    catch (err) { out.fixture.renderErr = String((err && err.message) || err); }

    // ── 観測 ────────────────────────────────────────────────────────────────
    const labels = safe(() => (typeof window.__enemyLabels === 'function') ? window.__enemyLabels() : null, null);
    out.seamTypes = {
      enemyLabels: typeof window.__enemyLabels,
      nameLabelOn: typeof window.__nameLabelOn,
    };
    out.nameLabelOn = safe(() => window.__nameLabelOn(), null);
    out.labelArrayLen = Array.isArray(labels) ? labels.length : null;
    out.enemyCount = enemies.length;
    out.bodyHasLabelSmall = document.body.classList.contains('labelSmall');
    out.enemyTypeKeyCount = safe(() => Object.keys(ENEMY_TYPES).length, null);
    out.scenarioId = safe(() => sessionStorage.getItem('dragonfighters.currentScenario'), null);
    out.enemyLabelDomCount = document.querySelectorAll('.enemyLabel').length;
    out.enemyStatusSlotDomCount = document.querySelectorAll('.enemy-status-slot').length;

    /* 敵 1 体ぶんの生の観測。⛔ ここでは判定しない (assert 側が突き合わせる)。 */
    out.enemies = enemies.map((e, i) => {
      const lb = (labels && labels[i]) || null;
      const el = document.getElementById('enemy' + i);
      const hp = document.getElementById('hpBar' + i);
      const bd = document.getElementById('enemyBadge' + i);
      const st = document.getElementById('enemyStatus' + i);
      const dispOf = (x) => x ? (x.style.display || '') : null;
      const protectedNpc = !!(e.inactive || e.passiveNpc || (e.def && e.def.isNpcSpirit));
      return {
        i: i,
        type: e.type,
        name: (e.def && e.def.name) || null,
        size: (e.def && e.def.displaySize) || null,   /* [0g-data] データとしての参照。箱は rectOf で採る */
        alive: !!e.alive,
        inactive: !!e.inactive,
        isHydra: !!(e.def && e.def.isHydra),
        everSeen: !!e.everSeen,
        state: e.state || null,
        hasBadge: !!(e.def && e.def.badge),
        protectedNpc: protectedNpc,
        labelPresent: !!lb,
        labelDisplay: dispOf(lb),
        labelText: lb ? (lb.textContent || '') : null,
        labelNameText: (lb && lb.firstChild) ? (lb.firstChild.textContent || '') : null,
        labelBg: lb ? getComputedStyle(lb).backgroundColor : null,
        statusIsChildOfLabel: !!(lb && st && lb.contains(st)),
        spriteDisplay: dispOf(el),
        badgeDisplay: dispOf(bd),
        rectLabel: rectOf(lb),
        rectSprite: rectOf(el),
        rectHp: rectOf(hp),
        rectBadge: rectOf(bd),
      };
    });

    /* 味方側 (§2 の対照で使う)。⛔ 項目 1 では判定しない = 記録だけ。 */
    const heroLabel = document.getElementById('warriorLabel');
    out.heroLabel = { present: !!heroLabel, rect: rectOf(heroLabel),
      bg: heroLabel ? getComputedStyle(heroLabel).backgroundColor : null };
    const allyLabels = Array.prototype.slice.call(document.querySelectorAll('.allyLabel'))
      .filter(x => x.id !== 'warriorLabel');
    out.allyLabels = allyLabels.map(x => ({ rect: rectOf(x), bg: getComputedStyle(x).backgroundColor }));

    out.rectCount = VIA['getBoundingClientRect'] || 0;
    out.rectVia = Object.keys(VIA);
    return out;
  }, 72);

  await page.close();
  return m;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (実装済み)  ⭐ [key, 見出し, m => [bool, detail]]
// ══════════════════════════════════════════════════════════════════════════════
/* 母集団の導出はここに 1 箇所だけ置く。⛔ assert ごとに数え直さない
   (数え方が 2 通りになると (0a) と (1a) が別の母集団を見て静かにズレる)。 */
function popVisible(m) {
  return (m.enemies || []).filter(e => e.alive && e.labelPresent && e.labelDisplay !== 'none');
}
function popBadge(m) {
  return popVisible(m).filter(e => e.hasBadge && e.badgeDisplay !== 'none');
}
function popFog(m) {
  return (m.enemies || []).filter(e => e.alive && !e.everSeen && e.state === 'idle'
    && !e.protectedNpc && e.spriteDisplay === 'none');
}

const ASSERTS = [
  // ── §0 装置 ────────────────────────────────────────────────────────────────
  ['0a', '[母集団] ダンジョンが起動し、**見えている生存中の敵が ' + POP_MIN + ' 体以上**居る'
    + ' (⚠ かつ (0a)(0e)(0f) の母集団が全部同じ 1 体でない)'
    + ' ⭐⭐⭐ これが無いと §1 の全 assert が空振りで永久緑になる',
    m => {
      if (!m.fixture || !m.fixture.ok) {
        return popFail('母集団の仕込み', 'createEnemy/createEnemyDom が通らなかった: '
          + (m.fixture && m.fixture.err) + '  made=' + JSON.stringify(m.fixture && m.fixture.made));
      }
      if (!m.fixture.renderOk) {
        return popFail('描画', 'updatePositions() が例外で落ちた: ' + m.fixture.renderErr);
      }
      const vis = popVisible(m), bdg = popBadge(m), fog = popFog(m);
      /* ⚠ 依頼書 §8 の ⚠ = 3 つの母集団が全部同じ 1 体にならないこと。
         ⭐ 「別々の敵が居る」を **相異なる添字の総数**で数える。 */
      const idx = {};
      for (const e of vis.concat(bdg, fog)) idx[e.i] = true;
      const distinct = Object.keys(idx).length;
      const ok = vis.length >= POP_MIN && distinct >= POP_DISTINCT_MIN;
      return [ok,
        '見えている生存敵 ' + vis.length + ' 体 ' + JSON.stringify(vis.map(e => e.type))
        + '  / (0a)+(0e)+(0f) の相異なる敵 ' + distinct + ' 体 (下限 ' + POP_DISTINCT_MIN + ')'
        + '  / 仕込み ' + JSON.stringify(m.fixture.made.map(x => x.key + ':' + x.mode))
        + (ok ? '' : '  ⛔ ' + (vis.length < POP_MIN ? '見えている敵が居ない' : '母集団が同じ敵に偏っている'))];
    }],

  ['0b', '[2 経路] 敵名の表を**写経していない** — 配信バイト (GET /index.html) の ENEMY_TYPES'
    + ' から抜いた name の集合と、ページの Object.keys(ENEMY_TYPES).length が一致する'
    + ' ⭐ 件数そのものは期待値に持たない (⚠ 依頼書 §2-8 の「46 種」は起草時の数え違いで実測 50 種)',
    m => {
      const r = m.roster;
      if (!r || !r.ok) return [false, '⛔ 配信バイトから ENEMY_TYPES を切り出せない: ' + (r && r.err)];
      const nNames = r.names.length, nKeys = r.keys.length, nPage = m.enemyTypeKeyCount;
      const uniq = {};
      for (const s of r.names) uniq[s] = true;
      const dup = nNames - Object.keys(uniq).length;
      const ok = nNames > 0 && nNames === nKeys && nNames === nPage;
      return [ok,
        '配信バイト: name ' + nNames + ' 件 / top-level キー ' + nKeys + ' 件'
        + '  ページ: Object.keys(ENEMY_TYPES) ' + nPage + ' 件'
        + '  (同名の重複 ' + dup + ' 件 / 切り出した ' + r.bytes + 'B)'
        + '  例: ' + JSON.stringify(r.names.slice(0, 3))
        + (ok ? '' : '  ⛔ 3 つの数が一致しない = 抜き方かページのどちらかが壊れている')];
    }],

  ['0c', "[装置] 素の起動で document.body.classList.contains('labelSmall') === true"
    + ' (= 70% の上書きが効く状態になっている)',
    m => {
      const ok = m.bodyHasLabelSmall === true && m.nameLabelOn === true;
      return [ok,
        'body.labelSmall=' + JSON.stringify(m.bodyHasLabelSmall)
        + '  __nameLabelOn()=' + JSON.stringify(m.nameLabelOn) + ' (' + m.seamTypes.nameLabelOn + ')'
        + (ok ? '' : '  ⛔ 素のアームで 70% が効いていない')];
    }],

  ['0d', '[装置] window.__enemyLabels() の長さ === enemies.length'
    + ' (⚠⚠⚠ 添字並列が崩れていない = 撤退時の push(null) を含めて 11 本目が揃っている)',
    m => {
      const fnOk = m.seamTypes.enemyLabels === 'function';
      const ok = fnOk && isFiniteNum(m.labelArrayLen) && m.labelArrayLen === m.enemyCount;
      return [ok,
        '__enemyLabels() の長さ ' + JSON.stringify(m.labelArrayLen)
        + ' / enemies.length ' + m.enemyCount
        + '  (シームの型 ' + m.seamTypes.enemyLabels + ')'
        + '  .enemyLabel の DOM 総数 ' + m.enemyLabelDomCount
        + (ok ? '' : '  ⛔ 添字並列が崩れている (別の敵の札を指す)')];
    }],

  ['0e', '[母集団] **バッジを持つ敵**が ' + POP_MIN + ' 体以上見えている ((1h) の母集団)',
    m => {
      const bdg = popBadge(m);
      if (bdg.length < POP_MIN) {
        return popFail('(0e) バッジ持ちの敵',
          '見えている生存敵 ' + popVisible(m).length + ' 体のうち badge 持ちは ' + bdg.length + ' 体  '
          + JSON.stringify(popVisible(m).map(e => e.type + ':' + e.hasBadge + ':' + e.badgeDisplay)));
      }
      return [true, 'バッジを持つ見えている敵 ' + bdg.length + ' 体 '
        + JSON.stringify(bdg.map(e => e.type))
        + '  (badge の display=' + JSON.stringify(bdg.map(e => e.badgeDisplay)) + ')'];
    }],

  ['0f', '[母集団] **伏兵化フォグで隠れている敵**が ' + POP_MIN + ' 体以上居る ((1c) の母集団)',
    m => {
      const fog = popFog(m);
      if (fog.length < POP_MIN) {
        return popFail('(0f) 伏兵化フォグの敵',
          'alive && !everSeen && state==="idle" && !protectedNpc && スプライトが none の敵が 0 体'
          + '  (全敵の everSeen=' + JSON.stringify((m.enemies || []).map(e => e.type + ':' + e.everSeen)) + ')');
      }
      return [true, 'フォグで隠れている敵 ' + fog.length + ' 体 ' + JSON.stringify(fog.map(e => e.type))
        + '  (札の display=' + JSON.stringify(fog.map(e => e.labelDisplay)) + ')'];
    }],

  ['0g', '[宣言] **ドライバが敵の箱を寸法データから計算していない** — 位置・寸法はすべて'
    + ' getBoundingClientRect 由来で、実装の置き位置の式も写経していない'
    + ' ⭐⭐⭐ 次の窓が善意で計算経路へ書き換えると永久緑になるのを防ぐ (依頼書 §2-11(a))',
    m => {
      const s = m.selfScan;
      if (!s || !s.ok) return [false, '⛔ ドライバ自身を検査できない: ' + (s && s.err)];
      const viaOk = Array.isArray(m.rectVia) && m.rectVia.length === 1
        && m.rectVia[0] === RECT_VIA_WANT && m.rectCount > 0;
      const ok = s.bad.length === 0 && s.forbidden.length === 0 && viaOk;
      return [ok,
        '採った矩形 ' + m.rectCount + ' 枚 / 由来 ' + JSON.stringify(m.rectVia)
        + '  ドライバ本体で寸法データ語に触れた行 ' + s.touched + ' 行 (すべて ' + SELF_MARK + ' 付き: '
        + (s.bad.length === 0 ? 'はい' : 'いいえ') + ')'
        + '  写経禁止語の混入 ' + JSON.stringify(s.forbidden)
        + (s.bad.length ? '  ⛔ 印の無い行: ' + s.bad.slice(0, 4).join(' | ') : '')
        + (viaOk ? '' : '  ⛔ 矩形の由来が getBoundingClientRect 一本でない')];
    }],

  ['0h', '[母集団] **見えている敵のうち最小のものが ' + SMALL_MAX + ' 以下**'
    + ' ((2f) の母集団。⚠⚠⚠ 立たなければ (0h) 自身と (2f) の**両方**を FAIL にする)',
    m => {
      const vis = popVisible(m);
      if (vis.length < POP_MIN) {
        return popFail('(0h) 見えている敵', '(0a) が立っていないので最小値を採れない');
      }
      let min = null;
      for (const e of vis) {
        if (!isFiniteNum(e.size)) continue;
        if (min === null || e.size < min.size) min = e;
      }
      if (min === null) return popFail('(0h) 敵の寸法', '見えている敵から数値の寸法を採れなかった');
      const roster = (m.roster && m.roster.ok) ? m.roster.sizes : [];
      const rosterMin = roster.length ? Math.min.apply(null, roster) : null;
      const ok = min.size <= SMALL_MAX;
      /* ⭐ detail に 3 つを必ず出す (閾値の意味を後から追える形にする)。
         ⚠ 閾値 0.30 ((2f) 側) は**モンスター名簿に依存している**。rosterMin より小さい敵が
           将来追加されると比が上がって (2f) は厳しくなる — それは正しい挙動だが、
           依存していること自体を記録に残す。 */
      return [ok,
        'booted シナリオ=' + JSON.stringify(m.scenarioId)
        + '  minEnemyKey=' + JSON.stringify(min.type)
        + '  minDisplaySize=' + min.size                     /* [0g-data] 記録に出す実測値 */
        + '  rosterMin=' + JSON.stringify(rosterMin) + ' (名簿 ' + roster.length + ' 件の最小)'
        + '  見えている敵の寸法 ' + JSON.stringify(vis.map(e => e.type + ':' + e.size))
        + (ok ? '' : '  ⛔ 最小の敵が ' + SMALL_MAX + ' より大きい = (2f) は自明に緑になるので測れない')];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// まだ実装されていない受入条件 (⛔ 件数から隠さない = pending() で必ず出す)
//   ⭐ 最終項目の完了条件 = **PENDING 0**。
//   ⛔ ここに置いたキーは ASSERT_OF に無いので、実装したら必ず PENDINGS から外して
//     本体の配線 (['1a','1b', …] の並び) へキーを足すこと (両方やらないと数が合わない)。
//   ⛔ 空になっても配列ごと削除しないこと (削ると PENDING という 3 値そのものが消える)。
//   ⚠⚠⚠ 実装するとき、母集団ガードが偽の枝では **必ず popFail() を通す**
//     (「母集団が無いので緑」は禁止 = 依頼書 §8 の太字。変異 bigonly がこれを検査する)。
//   ⭐ 交差の判定には上の overlaps() を使う ((1h))。⛔ 中心 1 点や上端 1 点で代用しない。
// ══════════════════════════════════════════════════════════════════════════════
const PENDINGS = [
  ['§1 敵の札', [
    ['1a', '見えている生存敵**すべて**に札があり、テキストが enemies[i].def.name と一致'
      + ' (DOM 経路 × ページのデータ経路)', '項目 2 の担当。母集団 = (0a) / 変異 nolabel'],
    ['1b', 'その札のテキストが (0b) の**配信バイト由来の名前集合**に含まれる'
      + ' (⭐ 2 経路目。実装が def.name でなく type キーを書いていたらここで落ちる)',
      '項目 2 の担当。変異 typekey が証明する'],
    ['1c', '伏兵化フォグで隠れている敵の札は display:none',
      '項目 2 の担当。母集団 = (0f) / 変異 fogshow'],
    ['1d', '倒した敵の札は display:none (⭐ 1 体倒してから測る)', '項目 2 の担当。変異 deadshow'],
    ['1e', '封印中のハイドラの札は出ない', '項目 2 の担当。変異 hydrashow'],
    ['1f', '札の下端が HP バーの上端より**上**: label.bottom <= hpBar.top + 0.5'
      + ' (⭐ 味方は元から 2px 食い込んでいたが、**敵は新規なので最初から正しくできる**)',
      '項目 2 の担当'],
    ['1g', '状態アイコン列が札の**子**:'
      + " labelEl.contains(document.getElementById('enemyStatus'+i))",
      '項目 2 の担当。変異 statusdetach'],
    ['1h', '装備バッジの矩形と札の矩形が**交差しない** (overlaps() が false)',
      '項目 2 の担当。母集団 = (0e) / 変異 badgestay (§2-5 罠B の再現)'],
  ]],
  ['§2 70%', [
    ['2a', '味方の札の**高さ**が ' + RETREAT_QUERY + ' の同じ札の **0.70〜0.75 倍**'
      + ' (⭐ 絶対 px を書かない。⭐ 対照は同じドライバの中で両方開いて採る)',
      '項目 3 の担当。変異 noscale'],
    ['2b', '味方の札の**幅**が ' + RETREAT_QUERY + ' の同じ札の **0.68〜0.73 倍**',
      '項目 3 の担当。変異 noscale'],
    ['2c', '主人公 #warriorLabel / NPC 仲間 .allyLabel / 敵 .enemyLabel の **3 種の高さが同じ**'
      + ' (±0.6px)。⭐「敵の札だけ 100% のまま」を捕まえる', '項目 3 の担当。変異 nocss'],
    ['2d', '敵の札の background-color が味方の札と**異なる**'
      + ' (⭐ §2-7 の .heroLabel 事故 = className だけ書いて CSS が 0 行、を捕まえる)',
      '項目 3 の担当。変異 noenemycss'],
    ['2e', '札の**上端** (top) が ' + RETREAT_QUERY + ' と**同じ** (±0.6px)'
      + ' = placeUnscaledUi の dy を動かしていない', '項目 3 の担当。変異 dyshift'],
    ['2f', '⭐⭐⭐ **絶対量の歯止め** — **見えている最小の敵**について'
      + ' 札の高さ ÷ その敵のスプライトの高さ <= 0.30'
      + ' (① 札 = CSS 由来 / ② スプライト = 敵の寸法データ由来 の **完全に独立した 2 経路**)',
      '項目 3 の担当。母集団 = (0h)。⚠ 母集団が立たなければ popFail() で赤にする。'
      + ' 変異 bothgrow (比をすり抜ける膨張) と bigonly (母集団殺し) の 2 本が証明する'],
  ]],
  ['§3 恒等 (非退行)', [
    ['3a', 'HP バー (味方/敵) の矩形が ' + RETREAT_QUERY + ' と**完全一致** (±0.5px)',
      '項目 3 の担当。変異 hpshift が「恒等の空振り」を検査する'],
    ['3b', 'スプライト #player / .enemy の矩形が ' + RETREAT_QUERY + ' と**完全一致** (±0.5px)',
      '項目 3 の担当'],
    ['3c', '装備バッジの**寸法** (w x h) が ' + RETREAT_QUERY + ' と**完全一致** (±0.5px)'
      + ' — ⭐ 位置 (top) は -58 へ動かすので**測らない**。「動かしたのは位置だけ」という宣言',
      '項目 3 の担当'],
    ['3d', '部屋を 1 つ跨いだあと enemyLabelElements.length === enemies.length かつ'
      + ' .enemyLabel の DOM 総数 <= 敵の数'
      + ' (⭐ clearNodeArrays と driver_cast_circle の取りこぼしを捕まえる)',
      '項目 3 の担当。変異 noclear / noteardown (§2-2 罠A の再現)'],
  ]],
  ['§4 撤退 ' + RETREAT_QUERY, [
    ['4a', 'index.html' + RETREAT_QUERY + ' で 4 条件を測る'
      + ' { enemyLabelCount, allyLabelH, statusIsChild, badgeTop }'
      + ' → ON {>0, 素の 0.7 倍, true, 札より上} / OFF {0, 素と同じ, false, -46 相当}'
      + ' ⭐⭐⭐ **撤退アームだけを見る assert は永久緑になる** → 素のアームの対照を同居させる',
      '項目 4 の担当'],
    ['4b', 'OFF でも **HP バーとスプライトの矩形は ON と一致**する'
      + ' (⭐「撤退のしすぎ」= 札ごと HP バーまで壊した実装をここで落とす)', '項目 4 の担当'],
    ['4c', 'OFF で pageerror / console.error が 0 件 (⭐ 素のアームの事故も同じ assert で見る)',
      '項目 4 の担当'],
  ]],
];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_enemynamelabel_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  /* ⚠ ポートは **MUT_ORDER の並び**で固定的に割り当てる (impl の増減で番号が動かないように)。
     9851〜9867 が変異 17 本ぶん。撤退アームの基準ページは 9870。 */
  MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });
  const RETREAT_PORT = PORT + 20;

  console.log('=== verify_enemy_name_label.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   撤退アーム:' + RETREAT_PORT + ' (' + RETREAT_QUERY + ')'
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (変異は 1 本も実装されていない = 項目 4 の担当)'));

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (!NEGATIVE) servers.push(await startServer(RETREAT_PORT, null));
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
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      mark('§0 装置 — 母集団と 2 経路 (⭐ ここが立たないと §1〜§4 は全部空振りで永久緑)');
      const m = await measure(browser, PORT, errs, {});
      /* ⭐ (0b)(0h) の 2 経路目 = **配信バイト**。⛔ ディスクを読み直さない
         (走行中に別窓が保存すると混合ビルドを測ることになる)。 */
      const served = await httpGet('http://localhost:' + PORT + PAGE_PATH);
      m.roster = rosterFromBytes(served.body);
      m.servedBytes = served.body.length;
      /* ⭐ (0g) の自己検査。⛔ 「DOM で測っている」を口約束にしない。 */
      m.selfScan = selfScan();

      for (const key of ['0a', '0b', '0c', '0d', '0e', '0f', '0g', '0h']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }

      console.log('       [記録] §0 の母集団 (⛔ 期待値ではない。読み解き用):');
      console.log('         配信バイト ' + m.servedBytes + 'B / ENEMY_TYPES を '
        + (m.roster.ok ? m.roster.bytes + 'B 切り出し' : '⛔ 切り出せず: ' + m.roster.err));
      for (const e of (m.enemies || [])) {
        console.log('         #' + e.i + ' ' + e.type
          + '  size=' + e.size                                  /* [0g-data] 記録行 */
          + ' alive=' + e.alive + ' everSeen=' + e.everSeen + ' inactive=' + e.inactive
          + ' badge=' + e.hasBadge
          + '  sprite.display=' + JSON.stringify(e.spriteDisplay)
          + '  label=' + (e.labelPresent ? ('あり display=' + JSON.stringify(e.labelDisplay)
            + ' ' + (e.rectLabel ? (e.rectLabel.w.toFixed(1) + 'x' + e.rectLabel.h.toFixed(1) + 'px') : '—')
            + ' text=' + JSON.stringify((e.labelNameText || '').slice(0, 14))
            + ' statusIsChild=' + e.statusIsChildOfLabel) : '⛔ 無い'));
      }
      console.log('         主人公の札 ' + (m.heroLabel.present && m.heroLabel.rect
        ? (m.heroLabel.rect.w.toFixed(1) + 'x' + m.heroLabel.rect.h.toFixed(1) + 'px  bg=' + m.heroLabel.bg)
        : '⛔ 無い') + '   NPC 仲間の札 ' + m.allyLabels.length + ' 枚');

      for (const [title, rows] of PENDINGS) {
        mark(title);
        for (const p of rows) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      /* ⭐ 項目 1 では §4 (4c) がまだ PENDING なので、事故は **記録として**必ず出す。
         ⛔ 黙って捨てない (silent fail-open を作らない)。§4 を実装する項目 4 が
            (4c) で両アームの errs を assert に昇格させること。 */
      mark('事故の記録 (⚠ assert は (4c) = 項目 4 の担当。⛔ ここで黙って捨てない)');
      console.log('       素のアームの pageerror / console.error: ' + errs.length + ' 件'
        + (errs.length ? '\n         ' + errs.slice(0, 6).join('\n         ') : ''));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          const eds = editsOf(MUTATIONS[k]);
          const bad = eds.filter(e =>
            !(pure.body.split(e.to).length - 1 === 0 && mut.body.split(e.to).length - 1 === 1));
          check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある'
            + (eds.length > 1 ? ' (置換 ' + eds.length + ' 箇所すべて)' : ''),
            bad.length === 0,
            f + (bad.length ? '  ⛔ 当たっていない置換: '
              + bad.map(e => JSON.stringify(String(e.to).slice(0, 50))).join(' / ') : ''));
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length,
            '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }

        mark('欠陥を注入すると担当の節が赤くなること');
        for (const k of MUT_IMPL) {
          const negErrs = [];
          const port = MUTATIONS[k].driver ? PORT : PORT_OF[k];
          const mm = await measure(browser, port, negErrs, {});
          const servedNeg = await httpGet('http://localhost:' + port + PAGE_PATH);
          mm.roster = rosterFromBytes(servedNeg.body);
          mm.servedBytes = servedNeg.body.length;
          mm.selfScan = selfScan();
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
