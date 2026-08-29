#!/usr/bin/env node
/*
 * verify_quest_walk.js — 「受注した依頼の地まで地図を歩いて向かう」検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-25_quest-walk-to-site.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§5 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる (#19 / #22 でこの型が停止 0 回で完走した)。
 *
 * ■ 4 項目分割の担当 (依頼書 #23)
 *     項目 1 (このコミット) … js/world-map.js の解放の鎖 + 本ドライバの骨組み + §0 装置
 *     項目 2                … tavern.html (出発を地図へ回す) → §1 / §4 を埋める
 *     項目 3                … world.html   (隠す・入る・確認する) → §2 / §3 / §5 を埋める
 *     項目 4                … 負のコントロール 10 本 + (0b) 本実装 + 既存 golden 非退行
 *
 * ■ 現時点 (項目 1) で実際に測れるもの
 *     (0z) 母集団 … 配信中の tavern.html から id/place/locked/unlockAfter を 6 組抜けている
 *                   ⭐⭐⭐ これが無いと (2z) の照合が「両方 0 件で一致」= **永久緑**になる
 *     (0a) 仕込み … evaluateOnNewDocument で入れた cleared が本当にページへ届いている
 *                   ⭐ 0 本 / 6 本の **両方向**で確かめる (片方向だと「常に同じ物を書いている」
 *                     装置でも緑になる)
 *
 * ■ (0b) が PENDING である理由 (⚠ 数合わせで緑にしない)
 *   (0b) は「cleared を 0 本 → 6 本へ動かすと **札の DOM 枚数が実際に変わる**」。
 *   world.html は **項目 3 が実装するまで常に 7 枚とも出す** (world.html:552 の当時の判断:
 *   「⛔ 札に『未解放 / 解放済』の状態を持たせない。v1 は常に 7 枚とも出す」)。
 *   つまり今は **必ず 7 = 7** で、緑にすれば嘘、赤にすれば「まだ実装していない」を
 *   退行と読み違える。→ **PENDING**。項目 3 の実装後に **項目 4** が本実装する。
 *   ⭐ ただし枚数そのものは今から [記録] として出す (項目 4 は式を書くだけで済む)。
 *
 * ■ ⭐⭐⭐ 空振りを防ぐ仕掛け (この骨組みが背負っているもの)
 *   - 解放の鎖は **ドライバに写経しない**。`js/world-map.js` の UNLOCK と、
 *     配信中の `tavern.html` の `scenarios[]` という **別ファイルの実体どうし**を突き合わせる
 *     ((2z) / 変異 chaindrift)。前例 = verify_world_map.js の (7a)。
 *   - 解放段階は **tavern.html から読んだ順序**で作る (`clearedUpTo()`)。
 *     ドライバに "goblin-mine" 等を並べて書くと、鎖が変わった日に嘘の緑が出る。
 *   - 到達性は **自前で BFS を書かない**。`WORLD_MAP.findPath` をブラウザで呼ぶ
 *     (近傍の定義が違うだけで「歩けない道」を永久に緑と報告する恒久教訓)。
 *   - 調査シームを **本番ファイルへ書き込まない**。変異は「配信するスナップショットへ
 *     実行時に注入する」(CLAUDE.md の恒久方針)。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   確認ダイアログの配色・寸法・文字サイズ / 未解放拠点の点の大きさ /
 *   world BGM の volume (#17 / #21 の「耳で下げてよい」を壊さない)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   ⭐ 10 本とも **実装済** (項目 4)。空振り (赤くならない) があれば exit 1。
 *
 *   port | mutate     | 注入する欠陥                                          | 担当の節    | 一緒に赤くなる
 *   9161 | blockwalk  | ⭐⭐⭐ 罠 A の再現 — 未解放を EDGES から外す           | (2c)(2d)    | (5a)
 *   9162 | eatquery   | ⭐⭐⭐ 罠 B の再現 — autoplay 付きでも地図を挟む       | (4d)        | —
 *   9163 | pier       | 罠 C の再現 — exitVia を書かずに world.html へ飛ぶ     | (1a)        | (1b)
 *   9164 | showall    | 未解放でも札を出す                                    | (2a)(2b)    | —
 *   9165 | enterany   | questDest の一致を見ずにどの拠点でも入れる            | (3d)        | —
 *   9166 | eatdest    | world.html が questDest を読む **前**に消す           | (3a)(3b)    | (3z)(3c)
 *   9167 | chaindrift | UNLOCK の 1 本を隣へずらす                            | (2z)        | —
 *   9168 | nodialog   | 確認をはさまず即遷移する                              | (3a)(3c)    | (3b)
 *   9169 | asktop     | ダイアログを visibility:hidden で隠す                  | (3e)        | —
 *   9170 | enterprop  | NODES の 6 拠点へ enter: "index.html" を足して実装する | (5b)        | (5a)
 *
 *   ⚠ 依頼書 §8 の表は「赤くなるべき節」を **最小限**しか書いていない。実際には上の
 *     「一緒に赤くなる」列の節も赤くなる。これは欠陥の性質そのものなので MUTATIONS[k].allowRed
 *     へ明示的に許可を書き、(neg-*-範囲) が **それ以外の巻き込み** だけを落とす。
 *   ⚠ 変異ごとに採る測定は MUTATIONS[k].need で絞っている (全部採ると measureDepart /
 *     measureAskChain が 10 回ずつ走って終わらない)。⛔ 採っていない節を evaluable へ書かない。
 *
 *   ⚠ 変異アンカーは **部分文字列一致**で、配信スナップショット中に **ちょうど 1 箇所**
 *     ヒットしなければ **exit 3 でドライバごと死ぬ** (0 件でも 2 件以上でも空振りするため)。
 *
 * 使い方:
 *   node tools/verify_quest_walk.js               # 受入条件 (素の配信)
 *   node tools/verify_quest_walk.js --negative    # 負のコントロール (赤くならなければ exit 1)
 *   node tools/verify_quest_walk.js --mutate blockwalk   # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');            // (5a) の恒等ハッシュ (項目 3 が追加)

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
/* ⚠ ポートは既存ドライバと空ける。9120-9130 = verify_world_map / 次の在庫は 9309。
 *   9160-9170 が空いていることは tools/*.js のポート直書きの数え上げで実測済み (2026-08-26)。 */
const PORT = parseInt(arg('port', '9160'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (⚠ 10 本とも項目 4 の担当。impl:false = PENDING)
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
// ══════════════════════════════════════════════════════════════════════════════
/* 各エントリの意味 (項目 4 が実装):
 *   from / to  … 配信スナップショットへの 1 行置換。⚠ **ちょうど 1 箇所**ヒットが起動時の条件。
 *   targets    … 依頼書 §8 の表。**ここが赤くならなければ空振り = exit 1**。
 *   need       … 変異ポートで採る測定 (⭐ 担当の節が読める最小限だけ。全部採ると 10 倍遅い)。
 *   evaluable  … その測定で **実際に評価できる** assert。⛔ 測っていない節をここへ書かない
 *                (述語が例外 → 一律 false = 「巻き込んだ」の偽陽性になる)。
 *   allowRed   … targets 以外で **赤くなるのが正しい**節。⭐ 依頼書の表は最小限しか
 *                書いていないので、余分に赤くなる節はここで明示的に許可し、証拠へ出す。 */
const MUTATIONS = {
  blockwalk: {
    impl: true, file: 'js/world-map.js', targets: ['2c', '2d'],
    /* ⭐⭐⭐ 依頼書 §2-2 罠 A の再現。cleared=[] で未解放の swamp / fort を街道網から外す。 */
    from: '    ["cross_n", "swamp"], ["swamp", "village_s"], ["village_s", "fort"], ["fort", "lakeside"],',
    to: '    ["village_s", "lakeside"],   /* mut-blockwalk 未解放の swamp / fort を EDGES から外す */',
    need: ['stage0', 'walkPlain'],
    evaluable: ['2z', '2a', '2c', '2d', '5a', '5b'],
    /* ⭐ EDGES を触ったので恒等ハッシュ (5a) が赤くなるのは定義どおり = 想定内。 */
    allowRed: ['5a'],
    why: '⭐⭐⭐ 依頼書 §2-2 罠 A の機械証明 — 未解放ノードを EDGES から外して歩けなくすると、'
      + 'cleared=[] のゲーム開始直後に phlan から mine へ到達できず **詰む**。'
      + '街道網は環状なので 1 つ消しただけでは切れず、単体テストは永久に緑になる。',
  },
  eatquery: {
    impl: true, file: 'tavern.html', targets: ['4d'],
    /* ⭐⭐⭐ 依頼書 §2-3 罠 B の再現 = 「行き先が index.html なら **クエリを無視して**
       地図を挟む」実装にする。
       ⚠⚠ 2026-08-26 実測: 条件①「params が 0 本」だけを潰しても **(4d) は緑のままだった**。
         `target += sep + params.join("&")` (すぐ上の行) が target を "index.html?autoplay=10"
         にしているので、条件②の `target === "index.html"` が代わりに止めていたため。
         ⭐ dev URL を素通しさせているのは①と②の **2 つ**で、①だけでは罠 B を再現できない。
       ⭐ && は || より強く結合するので、この 1 行で
         (params 0 本) || (クエリを剥いだ行き先が index.html && 拠点 && 撤退が立っていない)
         になり、autoplay=10 でも地図を挟むようになる。 */
    from: '      && (target === "index.html")',
    to: '      || (target.split("?")[0] === "index.html") /* mut-eatquery クエリを無視して地図を挟む */',
    need: ['departAuto'],
    evaluable: ['4d'],
    allowRed: [],
    why: '⭐⭐⭐ 依頼書 §2-3 罠 B の機械証明 — autoplay/evade が付いていても地図を挟む。'
      + 'probe_s2_clear.js / sweep_recruit_balance.js がここで死ぬ (長尺なので身代わりが (4d))。',
  },
  pier: {
    impl: true, file: 'tavern.html', targets: ['1a'],
    /* ⚠ exitVia の setItem は tavern.html に **2 箇所**ある (出発と「街へ出る」) ので、
       その行そのものはアンカーにできない (2 ヒットで exit 3)。⭐ 代わりに出発側だけに在る
       「world.html へ飛ぶ 1 行」を握り、飛ぶ直前に exitVia を落とす = 書かなかったのと同じ。 */
    from: '      window.location.href = "world.html";',
    to: '      try { sessionStorage.removeItem("dragonfighters.exitVia"); } catch (e) {} /* mut-pier */ window.location.href = "world.html";',
    need: ['depart', 'worldSrc'],
    evaluable: ['1a', '1b'],
    /* ⭐ (1b) は exitVia === "tavern" を要求しているので一緒に赤くなるのが正しい。 */
    allowRed: ['1b'],
    why: '依頼書 §2-4 罠 C — exitVia を書かずに world.html へ飛ぶと '
      + 'world.html が空の exitVia を "title" と読み、spawnFor が **pier (桟橋)** を返す。'
      + '酒場から出たのに桟橋に立つ。',
  },
  showall: {
    impl: true, file: 'world.html', targets: ['2a', '2b'],
    from: '      if (questWalkOff) return true;',
    to: '      if (true) return true; /* mut-showall 未解放でも札を出す */',
    need: ['stages6'],
    evaluable: ['2z', '2a', '2b', '2c', '5a', '5b'],
    allowRed: [],
    why: '未解放でも札を出す = 隠していない。ドラゴンの巣の地名が初回起動から漏れる。',
  },
  enterany: {
    impl: true, file: 'world.html', targets: ['3d'],
    from: '      if (WM.scenarioOfNode(id) !== questDest) return;',
    to: '      /* mut-enterany 受注地と一致しているかを見ない */',
    need: ['askOther'],
    evaluable: ['3d'],
    allowRed: [],
    why: 'questDest の一致を見ずにどの拠点でも入れる = 受注していない地へ潜れる。',
  },
  eatdest: {
    impl: true, file: 'world.html', targets: ['3a', '3b'],
    from: '    try { questDest = sessionStorage.getItem("dragonfighters.questDest"); } catch (e) {}',
    to: '    try { sessionStorage.removeItem("dragonfighters.questDest"); /* mut-eatdest 読む前に消す */ questDest = sessionStorage.getItem("dragonfighters.questDest"); } catch (e) {}',
    need: ['ask'],
    evaluable: ['3z', '3a', '3b', '3c'],
    /* ⭐ 受注中の印そのものが消えるので、装置の (3z) と「やめる後も残る」(3c) も一緒に赤くなる。 */
    allowRed: ['3z', '3c'],
    why: 'world.html が questDest を読む **前**に消す = 受注中なのに入れない。',
  },
  chaindrift: {
    impl: true, file: 'js/world-map.js', targets: ['2z'],
    from: '    "orc-fort":       "lizard-swamp",',
    to: '    "orc-fort": "bandits-forest", /* mut-chaindrift 鎖を隣へずらす */',
    need: ['stage0'],
    evaluable: ['2z', '2a', '2c', '5a', '5b'],
    allowRed: [],
    why: 'UNLOCK の 1 本を隣へずらす (orc-fort → bandits-forest)。'
      + '⭐ 意図的に重複させた鎖が黙ってドリフトした状態 = (2z) の照合だけが気づける。',
  },
  nodialog: {
    impl: true, file: 'world.html', targets: ['3a', '3c'],
    /* ⭐ 「確認をはさまず即遷移する」実装は questDest も同時に消費する (askEnter の中の
       removeItem を前へ持ってきただけ) ので、(3c)「やめる後も questDest が残る」も赤くなる。 */
    from: '      askEnter(id);',
    to: '      try { sessionStorage.removeItem("dragonfighters.questDest"); } catch (e) {} location.href = "index.html"; /* mut-nodialog 確認をはさまず即遷移 */',
    need: ['ask'],
    evaluable: ['3z', '3a', '3b', '3c'],
    /* ⭐ 「入る」を押す相手が居なくなるので (3b) の遷移も起きない = 一緒に赤くなるのが正しい。 */
    allowRed: ['3b'],
    why: '確認をはさまず即遷移する = 誤タップで潜行が始まる (ユーザー決定 2026-08-25 の反転)。',
  },
  asktop: {
    impl: true, file: 'world.html', targets: ['3e'],
    from: '    #worldEnterAsk { display: none; position: fixed; inset: 0; z-index: 20;',
    to: '    #worldEnterAsk { visibility: hidden; display: flex; /* mut-asktop */ position: fixed; inset: 0; z-index: 20;',
    need: ['device'],
    evaluable: ['0a', '0b', '3e'],
    allowRed: [],
    why: 'ダイアログを visibility:hidden で隠す = 全面 (inset:0 / z-index:20) を覆ったまま'
      + '常に最前面に残る (#15 の town.html で踏んだ罠と同型)。'
      + '⭐ (3e) は「閉じているとき display が none であること」まで見ているので、'
      + 'ブラウザが visibility:hidden を hit-test から外す実装でも取り逃がさない。',
  },
  enterprop: {
    impl: true, file: 'js/world-map.js', targets: ['5b'],
    /* ⭐ 6 行を別々に書き換えると 1 行 1 アンカーの規則を破るので、NODES の直後に
       「site 全部へ enter を生やす 1 行」を差し込んで同じ状態を作る。 */
    from: '  var EDGES = [',
    to: '  Object.keys(NODES).forEach(function (k) { if (NODES[k].kind === "site" && !NODES[k].enter) NODES[k].enter = "index.html"; });  /* mut-enterprop */  var EDGES = [',
    need: ['stage0'],
    evaluable: ['2z', '2a', '2c', '5a', '5b'],
    /* ⭐ nodesFP は enter の有無を含むので恒等ハッシュ (5a) も赤くなる = 定義どおり。 */
    allowRed: ['5a'],
    why: 'NODES の 6 拠点へ enter:"index.html" を足して実装する = '
      + '行き先を「受注状態の関数」でなく「ページの静的属性」にしてしまう (依頼書 §11)。',
  },
};
const MUT_ORDER = ['blockwalk', 'eatquery', 'pier', 'showall', 'enterany',
  'eatdest', 'chaindrift', 'nodialog', 'asktop', 'enterprop'];
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

/* 変異ソースを先に組み立てる。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。 */
const SRC = {};
const MUT_SRC = {};
for (const k of MUT_SERVED) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する');
    process.exit(3);
  }
  const n = SRC[m.file].split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: SRC[m.file].split(m.from).join(m.to) };
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
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

const WORLD_PATH = '/world.html';
const TAVERN_PATH = '/tavern.html';
const INDEX_PATH = '/index.html';

/* ⭐ 測る対象は **本番で配信されるページそのもの**。⛔ 自前ハーネスを作らない
 *   (本番ページだけが壊れているケースを永久に緑と報告するため)。
 * ⭐ 変異は「配信するファイルの中身を実行時に差し替える」= 本番ファイルへ調査シームを
 *   書き込まない (CLAUDE.md の恒久方針)。 */
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
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
  await sleep(260);
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

// ══════════════════════════════════════════════════════════════════════════════
// キー (⚠ 唯一の正は本番コード。ここは「読む窓口の名前」であって状態の置き場ではない)
// ══════════════════════════════════════════════════════════════════════════════
const KEY_CLEARED = 'dragonfighters.cleared';            // localStorage  — tavern.html:2934 の PROGRESS_KEY
const KEY_QUEST_DEST = 'dragonfighters.questDest';       // sessionStorage — #23 で新設 (受注中の行き先)
const KEY_EXIT_VIA = 'dragonfighters.exitVia';           // sessionStorage — 一回性 (消費するのは town.html)
const KEY_ENTER_VIA = 'dragonfighters.enterVia';         // ⛔ world は触れない
const KEY_LAST_RESULT = 'dragonfighters.lastResult';     // ⛔ world は触れない
const KEY_SCENARIO = 'dragonfighters.currentScenario';
const KEY_PARTY = 'dragonfighters.partyMembers';
const KEY_PARTY_COMP = 'dragonfighters.partyComposition';
const KEY_QUEST_FLAGS = 'dragonfighters.questFlags';
const KEY_WALK_OFF = 'dragonfighters.questWalkOff';      // #23 の撤退スイッチ ?questwalk=0
const KEY_WORLD_OFF = 'dragonfighters.worldOff';         // #21 の撤退スイッチ ?world=0
const KEY_TOWN_OFF = 'dragonfighters.townOff';           // #12 の撤退スイッチ ?town=0
/* ⚠ ドライバ専用。本番は 1 バイトも読まない。仕込みを **1 回だけ**にするための目印。 */
const KEY_SEED_MARK = '__df_seed_done';

const SESSION_KEYS = [KEY_QUEST_DEST, KEY_EXIT_VIA, KEY_ENTER_VIA, KEY_LAST_RESULT,
  KEY_SCENARIO, KEY_PARTY, KEY_PARTY_COMP, KEY_QUEST_FLAGS, KEY_WALK_OFF, KEY_WORLD_OFF, KEY_TOWN_OFF];
const LOCAL_KEYS = [KEY_CLEARED];

// ══════════════════════════════════════════════════════════════════════════════
// 装置 — 配信中の tavern.html から scenarios[] を読む
// ⭐⭐⭐ 解放の鎖を **ドライバに写経しない**。ここが空振りすると (2z) の照合が
//   「両方 0 件で一致」= 永久緑になる → それを (0z) が殺す。
// ⚠ locked / unlockAfter は enemies:[…] の **後ろ**に在るので、id と place を 1 本の
//   正規表現で拾ってから **エントリごとの塊**へ切り分けて読む (1 本で全部は取れない)。
// ⭐ 手本 = verify_world_map.js の readTavernPlaces()。
// ══════════════════════════════════════════════════════════════════════════════
async function readTavernScenarios(port) {
  const r = await httpGet('http://localhost:' + port + TAVERN_PATH);
  const body = r.body;
  const start = body.indexOf('const scenarios = [');
  const endRel = body.indexOf('\n  ];', start);
  const region = (start < 0) ? '' : body.slice(start, endRel < 0 ? body.length : endRel);
  const re = /id:\s*"([a-z0-9-]+)"\s*,\s*place:\s*"([^"]+)"/g;
  const hits = []; let mm;
  while ((mm = re.exec(region)) !== null) hits.push({ id: mm[1], place: mm[2], at: mm.index });
  const rows = hits.map((h, i) => {
    const chunk = region.slice(h.at, (i + 1 < hits.length) ? hits[i + 1].at : region.length);
    const lk = /\blocked:\s*(true|false)\b/.exec(chunk);
    const ua = /\bunlockAfter:\s*"([^"]+)"/.exec(chunk);
    return {
      id: h.id, place: h.place,
      locked: lk ? (lk[1] === 'true') : null,
      unlockAfter: ua ? ua[1] : null,
    };
  });
  const map = {}; for (const row of rows) map[row.id] = row;
  return {
    status: r.status, bytes: body.length, regionBytes: region.length,
    found: start >= 0, rows: rows, map: map, order: rows.map(r2 => r2.id),
  };
}

/* ⭐ 解放段階を **tavern.html から読んだ順序**で作る。⛔ ドライバに id を並べて書かない
 *   (鎖が変わった日に嘘の緑が出る)。n=0 → [] / n=6 → 6 本すべて。 */
function clearedUpTo(tav, n) { return tav.order.slice(0, Math.max(0, Math.min(n, tav.order.length))); }

// ══════════════════════════════════════════════════════════════════════════════
// 装置 — ページを開く / 仕込む / 読む (⭐ 後続項目 2 / 3 / 4 はこの 4 本を使い回す)
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 仕込みは **1 タブにつき 1 回だけ**効く (sessionStorage の目印で自分を止める)。
 *   ⚠⚠ こうしないと evaluateOnNewDocument が **遷移のたびに再実行**されるので、
 *     world.html が questDest を消費しても次のページで蘇り、(3b)「消費されている」が
 *     永久に赤くなる (あるいは撤退スイッチが毎ページ復活する)。
 *   ⚠ cleared は localStorage なので、放っておいてもタブ内で生き続ける。 */
async function seedPage(page, seed) {
  const s = seed || {};
  await page.evaluateOnNewDocument((sd, KC, KM) => {
    try {
      if (sessionStorage.getItem(KM) === '1') return;      // ★ 2 回目以降は何もしない
      sessionStorage.setItem(KM, '1');
      if (sd.cleared !== undefined && sd.cleared !== null) {
        localStorage.setItem(KC, JSON.stringify(sd.cleared));
      }
      if (sd.session) {
        for (const k of Object.keys(sd.session)) {
          if (sd.session[k] === null) sessionStorage.removeItem(k);
          else sessionStorage.setItem(k, sd.session[k]);
        }
      }
    } catch (e) {}
  }, s, KEY_CLEARED, KEY_SEED_MARK);
}

/* エラーの取りこぼしを作らない共通のページ生成。⚠ 除外は favicon の 1 本だけに絞る。 */
async function newPage(browser, errs, tag, opts) {
  const o = opts || {};
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let u = ''; try { u = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(u)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (u ? ' <' + u + '>' : ''));
  });
  await page.setViewport({ width: o.width || 1280, height: o.height || 900 });
  if (o.seed) await seedPage(page, o.seed);
  return page;
}

/* sessionStorage / localStorage の実体をまとめて読む。⛔ 期待値はここに書かない。 */
async function readStorage(page) {
  return page.evaluate((sk, lk) => {
    const out = { session: {}, local: {}, path: location.pathname, search: location.search };
    for (const k of sk) { try { out.session[k] = sessionStorage.getItem(k); } catch (e) { out.session[k] = '⛔' + String(e && e.message); } }
    for (const k of lk) { try { out.local[k] = localStorage.getItem(k); } catch (e) { out.local[k] = '⛔' + String(e && e.message); } }
    return out;
  }, SESSION_KEYS, LOCAL_KEYS);
}

/* ── world.html の観測 ────────────────────────────────────────────────────────
 *  ⭐ 返す物は「DOM が実際に持っている値」だけ。⛔ 期待値を混ぜない。
 *  ⚠ revealed / questDest / askOpen は **項目 3 が足す検証シーム**。まだ無いので
 *     hasXxx で「有るか無いか」を持ち帰り、assert 側が有無を判断する
 *     (無い物を呼んで例外にすると、実装前は全 assert が fatal で潰れる)。 */
async function measureWorld(browser, port, errs, opts) {
  const o = opts || {};
  const tag = '[:' + port + ' world' + (o.tag ? ' ' + o.tag : '') + '] ';
  const page = await newPage(browser, errs, tag, o);
  await page.goto('http://localhost:' + port + WORLD_PATH + (o.query || ''), { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 }).catch(() => {});
  await settle(page);

  const out = await page.evaluate((KC) => {
    const WM = window.WORLD_MAP, WD = window.__world || {};
    const signIds = [];
    const nodes = {};
    for (const id of Object.keys(WM ? WM.NODES : {})) {
      const el = document.getElementById('worldNode_' + id);
      const sign = el ? el.querySelector('.worldSign') : null;
      if (sign) signIds.push(id);
      nodes[id] = {
        exists: !!el,
        cls: el ? el.className : null,
        title: el ? (el.getAttribute('title') || '') : null,
        hasSign: !!sign,
        signText: sign ? sign.textContent : null,
        kind: WM ? WM.NODES[id].kind : null,
        /* ⭐ 項目 2 が追加。(4b) が「港町フラン以外」を **enter の有無**で選り分けるために要る
           (⛔ ドライバに "phlan" と直書きしない)。項目 3 の (5b) もこの窓で測れる。 */
        hasEnter: WM ? (WM.NODES[id].enter !== undefined) : null,
      };
    }
    /* ── 項目 3 が追加 ────────────────────────────────────────────────────
       ⭐ 返すのは **本番のデータ / 本番の関数が出した値**だけ。⛔ 期待値を混ぜない。 */
    /* (2z)/(5a)/(5b) 用の実体。⛔ ドライバへ写経せず毎回ここから引く。 */
    const mapData = WM ? {
      unlock: WM.UNLOCK || null,
      sites: WM.SITES,
      edges: WM.EDGES.map(e => e[0] + '__' + e[1]),
      nodesFP: Object.keys(WM.NODES).map(id => {
        const n = WM.NODES[id];
        return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—');
      }),
      enterIds: Object.keys(WM.NODES).filter(id => WM.NODES[id].enter !== undefined),
    } : null;
    /* (2c) 到達性。⛔ 自前 BFS を書かない — **本番の findPath をブラウザで呼ぶ**
       (近傍の定義が違うだけで「歩けない道」を永久に緑と報告する恒久教訓)。
       ⭐ 起点は「enter を持つノード」= 港町 (⛔ "phlan" を直書きしない)。 */
    const paths = WM ? (function () {
      const start = Object.keys(WM.NODES).filter(id => WM.NODES[id].enter !== undefined)[0] || null;
      const o = { start: start, len: {} };
      if (start) for (const id of Object.keys(WM.NODES)) {
        const p = WM.findPath(start, id);
        o.len[id] = (p === null) ? null : p.length;
      }
      return o;
    })() : null;
    /* (3e) 札の中心の elementFromPoint。⚠ 中心は **札自身の矩形**から採る
       (ノード座標ではない — 札は主人公の頭上へ逃がしてあるので必ずズレる)。
       手本 = verify_world_map.js の (7d)。 */
    const signProbe = (function () {
      const rows = [];
      document.querySelectorAll('.worldSign').forEach(function (sg) {
        const r = sg.getBoundingClientRect();
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        const owner = sg.closest('.worldNode');
        rows.push({
          id: owner ? owner.getAttribute('data-node') : null,
          onScreen: r.width > 0 && r.height > 0 && cx >= 0 && cy >= 0
            && cx < window.innerWidth && cy < window.innerHeight,
          self: !!hit && (hit === sg || sg.contains(hit)),
          top: hit ? (hit.id || hit.className || hit.tagName) : '(null)',
        });
      });
      return rows;
    })();
    const askEl = document.getElementById('worldEnterAsk');

    let clearedRaw = null;
    try { clearedRaw = localStorage.getItem(KC); } catch (e) { clearedRaw = '⛔' + String(e && e.message); }
    let clearedParsed = null;
    try { clearedParsed = JSON.parse(clearedRaw || '[]'); } catch (e) { clearedParsed = null; }
    return {
      path: location.pathname, search: location.search,
      hasWorldMap: !!WM, hasSeam: !!window.__world,
      signIds: signIds, signCount: document.querySelectorAll('.worldSign').length,
      nodes: nodes,
      heroNode: (typeof WD.heroNode === 'function') ? WD.heroNode() : null,
      /* ★ 項目 3 が足す窓。無ければ null + hasXxx:false を返す (呼んで落とさない)。 */
      hasRevealed: typeof WD.revealed === 'function',
      revealed: (typeof WD.revealed === 'function') ? WD.revealed() : null,
      hasQuestDestFn: typeof WD.questDest === 'function',
      questDestSeam: (typeof WD.questDest === 'function') ? WD.questDest() : null,
      hasAskOpenFn: typeof WD.askOpen === 'function',
      askOpen: (typeof WD.askOpen === 'function') ? WD.askOpen() : null,
      /* ⭐ 見た目の実体も採る。(3e) / 変異 asktop は「display:none か visibility:hidden か」で割れる。 */
      askDisplay: askEl ? getComputedStyle(askEl).display : null,
      askAria: askEl ? askEl.getAttribute('aria-hidden') : null,
      mapData: mapData, paths: paths, signProbe: signProbe,
      clearedRaw: clearedRaw, clearedParsed: clearedParsed,
    };
  }, KEY_CLEARED);
  out.storage = await readStorage(page);
  if (o.keepOpen) { out.page = page; return out; }
  await page.close();
  return out;
}

/* ── §0 装置の母集団 ──────────────────────────────────────────────────────────
 *  ⭐ cleared を **0 本と 6 本の両方向**で仕込んで測る。片方向だけだと
 *    「常に同じ物を書いている」装置でも (0a) が緑になる。 */
async function measureDevice(browser, port, errs, tav) {
  const stages = {};
  for (const n of [0, tav.order.length]) {
    const want = clearedUpTo(tav, n);
    const m = await measureWorld(browser, port, errs, {
      tag: 'cleared=' + n, seed: { cleared: want },
    });
    m.want = want;
    stages[n] = m;
  }
  return { stages: stages, lo: 0, hi: tav.order.length };
}

// ══════════════════════════════════════════════════════════════════════════════
// 装置 — 酒場から出発させて着地先を測る (項目 2 が追加。§1 / §4 が使う)
// ══════════════════════════════════════════════════════════════════════════════
/* ⚠ classic script 直下の let/const/function は window に載らない。
 *   本番の識別子は **裸で** 読む (verify_recruit_size.js:270 と同じ作法)。 */
const VIS_FN = `(function(el){
  if (!el) return false;
  if (typeof el.checkVisibility === 'function')
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  return el.getClientRects().length > 0;
})`;

/* 実クリックだけで 酒場 → 依頼書ダイアログ → 出発準備 まで進む。
 * ⭐ 既定で解放されているのは goblin-mine (テーブル 1) だけ = 廃坑の受注そのもの。
 * ⛔ prepScenario を直接置く近道にしない ((1a) の文面が「受注 → 準備 → #btnDepart」)。
 * 手本 = verify_recruit_size.js:315 advanceToPrep()。 */
async function advanceToPrep(page, maxSteps) {
  const steps = [];
  /* ⚠ 150 回 (約 63 秒) は手本どおり。受注ナレーションが #prologueOverlay を使い回して
     おり、音声ペースで 1 行ずつ進むので 60 回だと準備画面まで届かない (2026-08-26 実測:
     steps = [table>btnAccept>prologueOverlay>partyMatchOverlay>prologueOverlay] で打ち切り)。 */
  for (let i = 0; i < (maxSteps || 150); i++) {
    const st = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      if (vis(q('prep'))) return { done: true, at: 'prep' };
      /* #35: 全確定後の「背景タップ = 出発」は廃止され、出発の口は #pmDepart になった。
         ⚠ 開示中 (reveal) はスキップのために背景を叩く必要が残るので **2 段**にする。
         ⭐ フォールバックを残すのは ?pmsetup=0 / 旧版でも同じ手順で突破できるようにするため。 */
      if (vis(q('partyMatchOverlay'))) {
        const dep = q('pmDepart');
        if (dep && vis(dep)) { dep.click(); return { done: false, at: 'pmDepart' }; }
        q('partyMatchOverlay').click(); return { done: false, at: 'partyMatchOverlay' };
      }
      if (vis(q('prologueOverlay')))   { q('prologueOverlay').click();   return { done: false, at: 'prologueOverlay' }; }
      const acc = q('btnAccept');
      if (vis(acc) && !acc.disabled) { acc.click(); return { done: false, at: 'btnAccept' }; }
      /* ⭐ #25 で酒場が歩ける地図になり、卓は床の上の席札 (#questTable_<scenarioId>) になった。
         地図 ON では body.tavernMapOn #tableArea { display:none } なので vis() が false → 一度も押されず (待機) で打ち切られた。
         カンマ区切りの querySelector は「セレクタ順」でなく **文書順** で 1 件返す。
         #tavernViewport (席札) は #tableArea より前にあるので席札が勝ち、撤退 ?tavernmap=0 では
         席札が存在しないので #tableArea .table が返る (両方の経路を測る)。 */
      const t = document.querySelector('#questTable_goblin-mine, #tableArea .table');
      if (t && vis(t)) { t.click(); return { done: false, at: 'table' }; }
      return { done: false, at: '(待機)' };
    }, VIS_FN);
    if (steps[steps.length - 1] !== st.at) steps.push(st.at);
    if (st.done) return { reached: true, steps: steps };
    await sleep(420);
  }
  return { reached: false, steps: steps };
}

/* ── 出発を 1 回測る ──────────────────────────────────────────────────────────
 *  opts = { tag, query, reopen, mode:'ui'|'generated', seed }
 *
 *  ⭐⭐⭐ **index.html への遷移だけを横取りして中止する**。理由は 2 つ:
 *    ① index.html は本編まるごと = 重く、console.error も出るので (9a) を汚す
 *    ② 中止した **リクエスト URL の search が、着地していたはずの location.search そのもの**
 *       → (4d)「autoplay=10 が残っている」を、本編を起動せずに直接測れる
 *    ⚠ departToScenario() は本番のまま完走する (横取りするのは遷移だけ) ので、
 *      sessionStorage への書き込みは全部起きている。手本 = verify_recruit_size.js:230。
 *  ⛔ world.html は横取りしない ((1a) が heroNode を実際に読む必要がある)。 */
async function measureDepart(browser, port, errs, opts) {
  const o = opts || {};
  const tag = '[:' + port + ' depart' + (o.tag ? ' ' + o.tag : '') + '] ';
  const page = await newPage(browser, errs, tag, o);
  /* ⚠⚠ 前口上 (音声ペースで数分) は測定対象外。※これを飛ばさないと
     advanceToPrep が #prologueOverlay を押し続けて準備画面へ永久に届かない
     (2026-08-26 実測: steps が [prologueOverlay] だけで止まる)。
     ⭐ localStorage なので 1 回書けばタブ内で生き続ける。dev ゲートとは無関係のキー。
     手本 = verify_recruit_size.js:222。 */
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('dragonfighters.prologueSeen', '1'); } catch (e) {}
  });
  const blocked = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    try {
      const u = r.url();
      const nav = (typeof r.isNavigationRequest === 'function')
        ? (r.isNavigationRequest() && r.frame() === page.mainFrame())
        : (r.resourceType() === 'document');
      if (nav && /\/index\.html(\?|#|$)/.test(u)) {
        /* ⚠ 'aborted' を明示する。既定の abort() は net::ERR_FAILED で
           Chrome が console.error を 1 本吐く → (9a) が偽の赤になる。 */
        blocked.push(u); r.abort('aborted'); return;
      }
      r.continue();
    } catch (e) { try { r.continue(); } catch (e2) {} }
  });

  const WAIT_TAVERN = "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'";
  await page.goto('http://localhost:' + port + TAVERN_PATH + (o.query || ''), { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(WAIT_TAVERN, { timeout: 20000 });
  /* (4c) 用: **同じタブで**クエリ無しへ開き直す (sessionStorage へ写せているかの検査)。 */
  if (o.reopen !== undefined && o.reopen !== null) {
    await page.goto('http://localhost:' + port + TAVERN_PATH + o.reopen, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(WAIT_TAVERN, { timeout: 20000 });
  }
  await settle(page);

  /* ⭐ 装置: 酒場から WORLD_MAP が本当に見えているか。⚠⚠⚠ ここが 'undefined' だと
     §5-2 の分岐が永久に false = 「何も起きないのに緑」になる。必ず証拠へ出す。 */
  const seam = await page.evaluate(() => ({
    scenarios: typeof scenarios,
    departToScenario: typeof departToScenario,
    regenerate: typeof regeneratePartyMembers,
    QuestGen: typeof QuestGen,
    buildPlazaSynthetic: typeof buildPlazaSynthetic,
    worldMapInTavern: typeof window.WORLD_MAP,
    sites: (window.WORLD_MAP && window.WORLD_MAP.SITES) ? Object.keys(window.WORLD_MAP.SITES) : null,
    questWalkOff: window.__questWalkOff === true,
    search: location.search,
  }));

  let reachedPrep = null, steps = [];
  if (o.mode === 'generated') {
    /* ⭐ 本番の変換器を通す (⛔ 合成シナリオをドライバに写経しない)。
       手本 = verify_recruit_size.js:806 の buildPlazaSynthetic(QuestGen.generateQuest(...))。 */
    const g = await page.evaluate(() => {
      const out = { threw: '', id: null, target: null };
      try {
        const q = QuestGen.generateQuest(3, { source: 'plaza' });
        q._sentence = QuestGen.buildSentence(q);
        const s = buildPlazaSynthetic(q);        // ★本番の 生成クエスト → シナリオ 変換
        prepScenario = s;                        // openPrep(synthetic) が最初にやることと同じ
        regeneratePartyMembers();                // ★本番の再抽選
        out.id = s.id; out.target = s.target;
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    });
    steps = ['QuestGen>buildPlazaSynthetic'];
    reachedPrep = (g.threw === '');
    if (g.threw) errs.push(tag + '生成クエストの合成に失敗: ' + g.threw);
  } else {
    const adv = await advanceToPrep(page);
    reachedPrep = adv.reached; steps = adv.steps;
  }

  const pre = await page.evaluate(() => ({
    prepId: (typeof prepScenario === 'object' && prepScenario) ? prepScenario.id : null,
    prepTarget: (typeof prepScenario === 'object' && prepScenario) ? (prepScenario.target || null) : null,
    hasBtn: !!document.getElementById('btnDepart'),
  }));
  /* ★本番の「出発する」ボタン。⛔ departToScenario() を直接叩かない。 */
  await page.evaluate(() => { const b = document.getElementById('btnDepart'); if (b) b.click(); });

  /* 決着待ち: 「index.html への遷移が中止された」か「tavern から出た」かのどちらか。 */
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    if (blocked.length) break;
    let u = ''; try { u = page.url(); } catch (e) {}
    if (!/\/tavern\.html/.test(u)) break;
    await sleep(120);
  }

  const landedUrl = page.url();
  const out = {
    tag: o.tag || '', seam: seam, steps: steps, reachedPrep: reachedPrep,
    prepId: pre.prepId, prepTarget: pre.prepTarget, hasBtn: pre.hasBtn,
    blocked: blocked.slice(),
    blockedParsed: blocked.map(u => {
      try { const x = new URL(u); return { path: x.pathname, search: x.search }; }
      catch (e) { return { path: '⛔', search: '⛔' }; }
    }),
    landed: { url: landedUrl, path: '', search: '' },
    heroNode: null, spawnVia: null, worldSignCount: null,
  };
  if (/\/world\.html/.test(landedUrl)) {
    await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 }).catch(() => {});
    await settle(page);
    const w = await page.evaluate(() => ({
      heroNode: (window.__world && typeof window.__world.heroNode === 'function') ? window.__world.heroNode() : null,
      spawnVia: (window.__world && typeof window.__world.spawnVia === 'function') ? window.__world.spawnVia() : null,
      signCount: document.querySelectorAll('.worldSign').length,
      path: location.pathname, search: location.search,
    }));
    out.heroNode = w.heroNode; out.spawnVia = w.spawnVia; out.worldSignCount = w.signCount;
    out.landed.path = w.path; out.landed.search = w.search;
  } else {
    const p = await page.evaluate(() => ({ path: location.pathname, search: location.search }));
    out.landed.path = p.path; out.landed.search = p.search;
  }
  out.storage = await readStorage(page);
  /* ⭐ 項目 3 が追加。(3a)/(3b)/(3c) は **本番の酒場が実際に受注 → 出発した** タブを
     そのまま使い続ける (⛔ questDest を仕込んだ合成タブで代用しない)。
     ⚠ blocked は **生の参照**を渡す — 「入る」を押した後の遷移がここへ積まれる。 */
  if (o.keepOpen) { out.page = page; out._blocked = blocked; return out; }
  await page.close();
  return out;
}

/* ── ノードを 1 つ実クリックして到着まで待つ (項目 3 が追加) ─────────────────
 *  ⛔ goToNode() を直接呼ばない。**画面上の点を実際に押す**
 *    (当たり判定が壊れていても永久に緑になるのを防ぐ)。 */
async function clickNode(page, id, errs, tag) {
  const pt = await page.evaluate((i) => window.__world.clientFromNode(i), id);
  if (!pt) { errs.push(tag + ' clientFromNode が null: ' + id); return false; }
  await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
  /* ⚠ 港町 → 廃坑は実測 1,200px / PX_PER_MS 0.18 = 約 6.7 秒。30 秒では足りない腕が出うる。 */
  try { await page.waitForFunction('!window.__world.isMoving()', { timeout: 60000, polling: 80 }); }
  catch (e) { errs.push(tag + ' 到着待ちタイムアウト: ' + id); return false; }
  await sleep(200);
  return true;
}

/* 確認ダイアログの姿を読む。⛔ 期待値を混ぜない (⭐ display も aria も実体で採る)。 */
async function readAskState(page) {
  return page.evaluate(() => {
    const el = document.getElementById('worldEnterAsk');
    const tx = document.getElementById('worldEnterText');
    const WD = window.__world || {};
    return {
      askOpen: (typeof WD.askOpen === 'function') ? WD.askOpen() : null,
      askText: tx ? (tx.textContent || '') : null,
      askDisplay: el ? getComputedStyle(el).display : null,
      askAria: el ? el.getAttribute('aria-hidden') : null,
      heroNode: (typeof WD.heroNode === 'function') ? WD.heroNode() : null,
      path: location.pathname, search: location.search,
    };
  });
}

/* ── §3 の本線 ((3z)(3a)(3b)(3c)) ────────────────────────────────────────────
 *  ⭐⭐⭐ **仕込みではなく、本番の酒場が実際に受注 → 出発した**タブで測る。
 *    questDest も partyMembers も currentScenario も本物なので、(3b) の
 *    「消費されるのは questDest だけ」が本当の意味で測れる。
 *  ⭐ 押す先は sessionStorage の questDest → WORLD_MAP.SITES で引く
 *    (⛔ "goblin-mine" / "mine" をドライバに直書きしない)。
 *  順番: 札をタップ → 確認が出る → **やめる** ((3c)) → もう一度タップ → **入る** ((3b))。
 *  ⚠ 2 回目のタップは「同じノードにもう一度」= goToNode の即時枝を通る。 */
async function measureAskChain(browser, port, errs) {
  const d = await measureDepart(browser, port, errs, {
    tag: '受注→地図→入場', mode: 'ui', seed: { cleared: [] }, keepOpen: true,
  });
  const out = { depart: d, onWorld: /\/world\.html$/.test(d.landed.path) };
  const page = d.page;
  if (!out.onWorld) { if (page) await page.close(); return out; }
  const tag = '[:' + port + ' askchain] ';

  const t = await page.evaluate((K) => {
    const WM = window.WORLD_MAP, WD = window.__world || {};
    let dest = null; try { dest = sessionStorage.getItem(K); } catch (e) {}
    const nodeId = (dest && WM && WM.SITES[dest]) ? WM.SITES[dest] : null;
    return {
      dest: dest, nodeId: nodeId,
      label: nodeId ? (WM.NODES[nodeId].label || '') : '',
      seamDest: (typeof WD.questDest === 'function') ? WD.questDest() : null,
      hasAskOpen: typeof WD.askOpen === 'function',
      signCount: document.querySelectorAll('.worldSign').length,
    };
  }, KEY_QUEST_DEST);
  Object.assign(out, t);
  if (!t.nodeId) { await page.close(); return out; }

  /* ── 1 回目: タップ → 確認 → やめる ── */
  await clickNode(page, t.nodeId, errs, tag + '1回目');
  out.afterClick = await readAskState(page);
  await page.evaluate(() => { const b = document.getElementById('worldEnterNo'); if (b) b.click(); });
  await sleep(240);
  out.afterNo = await readAskState(page);
  out.afterNoStorage = await readStorage(page);

  /* ── 2 回目: 同じ札をタップ → 確認 → 入る ── */
  await clickNode(page, t.nodeId, errs, tag + '2回目');
  out.afterClick2 = await readAskState(page);
  const before = d._blocked.length;
  await page.evaluate(() => { const b = document.getElementById('worldEnterYes'); if (b) b.click(); });
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    if (d._blocked.length > before) break;
    let u = ''; try { u = page.url(); } catch (e) {}
    if (!/\/world\.html/.test(u)) break;
    await sleep(100);
  }
  out.yesBlocked = d._blocked.slice(before).map(u => {
    try { const x = new URL(u); return { path: x.pathname, search: x.search }; }
    catch (e) { return { path: '⛔', search: '⛔' }; }
  });
  out.afterYes = await readAskState(page);
  out.afterYesStorage = await readStorage(page);
  await page.close();
  return out;
}

/* ── §3 の対照 ((3d)) ────────────────────────────────────────────────────────
 *  受注していない解放済み拠点をタップ → 歩くだけ。
 *  ⭐ ここは仕込みでよい (測るのは「受注状態と一致しない拠点では何も起きない」だけで、
 *    party や exitVia は関係しない)。⛔ ただし押す先は SITES から引く。 */
async function measureSeededAsk(browser, port, errs, tav, opts) {
  const o = opts || {};
  const tag = '[:' + port + ' seededask ' + (o.tag || '') + '] ';
  const seed = { cleared: clearedUpTo(tav, o.clearedN), session: {} };
  seed.session[KEY_QUEST_DEST] = o.questDest;
  seed.session[KEY_SCENARIO] = o.questDest;
  const page = await newPage(browser, errs, tag, { seed: seed });
  const blocked = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    try {
      const u = r.url();
      const nav = (typeof r.isNavigationRequest === 'function')
        ? (r.isNavigationRequest() && r.frame() === page.mainFrame())
        : (r.resourceType() === 'document');
      /* ⚠ 'aborted' を明示する (既定の abort() は net::ERR_FAILED で (9a) を汚す)。 */
      if (nav && /\/index\.html(\?|#|$)/.test(u)) { blocked.push(u); r.abort('aborted'); return; }
      r.continue();
    } catch (e) { try { r.continue(); } catch (e2) {} }
  });
  await page.goto('http://localhost:' + port + WORLD_PATH, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 }).catch(() => {});
  await settle(page);
  const seam = await page.evaluate(() => {
    const WD = window.__world || {};
    return {
      questDest: (typeof WD.questDest === 'function') ? WD.questDest() : null,
      signCount: document.querySelectorAll('.worldSign').length,
      revealed: (typeof WD.revealed === 'function') ? WD.revealed() : null,
    };
  });
  const target = await page.evaluate((sc) => {
    const WM = window.WORLD_MAP;
    return (WM && WM.SITES[sc]) ? WM.SITES[sc] : null;
  }, o.targetScenario);
  if (target) await clickNode(page, target, errs, tag);
  const st = await readAskState(page);
  const storage = await readStorage(page);
  await page.close();
  return { target: target, targetScenario: o.targetScenario, seam: seam, st: st, storage: storage, blocked: blocked.slice() };
}

/* ── 地図の札を実際に押す ((4b)) ─────────────────────────────────────────────
 *  ⭐ 押す先は **enter を持たない site ノード** = 「港町フラン以外」を実測で選り分ける
 *    (⛔ "phlan" をドライバに直書きしない)。手本 = verify_world_map.js の (7e)。 */
async function measureWorldClicks(browser, port, errs, opts) {
  const m = await measureWorld(browser, port, errs, Object.assign({}, opts || {}, { keepOpen: true }));
  const page = m.page;
  const tag = '[:' + port + ' worldclick' + (opts && opts.tag ? ' ' + opts.tag : '') + '] ';
  const ids = Object.keys(m.nodes).filter(id => m.nodes[id].kind === 'site' && m.nodes[id].hasEnter === false);
  const rows = [];
  for (const id of ids) {
    const pt = await page.evaluate((i) => window.__world.clientFromNode(i), id);
    if (!pt) { rows.push({ id: id, err: 'clientFromNode が null' }); continue; }
    await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
    try { await page.waitForFunction('!window.__world.isMoving()', { timeout: 30000, polling: 80 }); }
    catch (e) { errs.push(tag + '到着待ちタイムアウト: ' + id); }
    rows.push(await page.evaluate((i) => ({
      id: i,
      node: window.__world.heroNode(),
      path: location.pathname, search: location.search,
      hasAskOpen: typeof window.__world.askOpen === 'function',
      askOpen: (typeof window.__world.askOpen === 'function') ? window.__world.askOpen() : null,
    }), id));
  }
  m.clicks = rows; m.clickIds = ids;
  await page.close(); delete m.page;
  return m;
}

/* ── world.html のソース検査 ((1b) の後半) ───────────────────────────────────
 *  「enterVia / lastResult は getItem すらしていない」を機械化する。
 *  ⭐ 判定 = ① キー文字列を Storage API に渡している箇所が 0 件
 *            ② それらの語を含む行が 1 行も Storage と同居していない (= 全部コメント)
 *  ⚠ 母集団ガード: world.html を本当に配信できたか (served) を必ず併記する。 */
async function readWorldSource(port) {
  const r = await httpGet('http://localhost:' + port + WORLD_PATH);
  const body = r.body || '';
  const lines = [];
  body.split(/\r?\n/).forEach((t, i) => { if (/enterVia|lastResult/.test(t)) lines.push({ n: i + 1, text: t.trim() }); });
  return {
    served: r.status === 200 && body.length > 1000,
    status: r.status, bytes: body.length, lines: lines,
    withStorage: lines.filter(h => /Storage/.test(h.text)),
    apiHits: body.match(/(?:session|local)Storage\s*\.\s*(?:get|set|remove)Item\s*\(\s*["'][^"']*(?:enterVia|lastResult)/g) || [],
  };
}

/* ── 負のコントロールで採る測定 (項目 4 が追加) ───────────────────────────────
 *  ⭐⭐⭐ **素の実行とまったく同じ装置・まったく同じ述語**を、変異ポートへ向けて回す。
 *    ⛔ 変異専用の簡易測定を書かない (それは「別の物差しで採った数値」= 恒久教訓)。
 *  ⭐ 採るのは MUTATIONS[k].need に挙がった物だけ。10 本すべてで全部採ると
 *    measureDepart / measureAskChain が 10 回ずつ走って現実的な時間で終わらない。
 *  ⛔ ここで採っていない測定を evaluable へ書かないこと — 述語が例外で落ちて一律 false =
 *    「担当外を巻き込んだ」の偽陽性になる。 */
async function negMeasure(browser, port, errs, tav, need) {
  const m = { tavern: tav };
  const has = (k) => need.indexOf(k) >= 0;
  if (has('stage0')) {
    m.stages = [await measureWorld(browser, port, errs, { tag: 'neg cleared=0本', seed: { cleared: [] } })];
    m.stages[0].want = [];
  }
  if (has('stages6')) {
    m.stages = [];
    for (let n = 0; n <= 5; n++) {
      const want = clearedUpTo(tav, n);
      const st = await measureWorld(browser, port, errs, { tag: 'neg cleared=' + n + '本', seed: { cleared: want } });
      st.want = want; m.stages.push(st);
    }
  }
  if (has('walkPlain')) {
    m.walkPlain = await measureWorldClicks(browser, port, errs, { tag: 'neg 未解放を歩く', seed: { cleared: [] } });
  }
  if (has('device')) m.device = await measureDevice(browser, port, errs, tav);
  if (has('worldSrc')) m.worldSrc = await readWorldSource(port);
  if (has('depart')) {
    m.depart = await measureDepart(browser, port, errs, { tag: 'neg 素', mode: 'ui', seed: { cleared: [] } });
  }
  if (has('departAuto')) {
    m.departAuto = await measureDepart(browser, port, errs,
      { tag: 'neg autoplay=10', mode: 'ui', query: '?autoplay=10', seed: { cleared: [] } });
  }
  if (has('ask')) m.ask = await measureAskChain(browser, port, errs);
  if (has('askOther')) {
    m.askOther = await measureSeededAsk(browser, port, errs, tav, {
      tag: 'neg 受注外', clearedN: tav.order.length,
      questDest: tav.order[0], targetScenario: tav.order[1],
    });
  }
  return m;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (⭐ 1 つの assert = 1 つの純粋な述語。素でも変異でも同じ式を回す)
//  形: [id, 文面, 述語 or null, PENDING の理由 or undefined]
//  ⚠ **文面は依頼書 §8 の原文を写す。言い換えない**
//    (後続項目が「どれを埋めるか」を文面で照合するため)。
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 4 項目とも実装済 = **PENDING を出す assert はもう 1 本も無い**。
 *   (起草時は P2 / P3 / P4 という PENDING 理由文の定数を置いて 4 番目の要素へ渡していた。
 *    項目 4 で最後の (0b) が埋まったので、参照が 0 件になった定数ごと外した。)
 *   ⚠ 新しく assert を足して未実装のまま置く時は、4 番目の要素に理由文字列を書けば
 *     emit() が PASSED / FAILED ではなく **PENDING** で出す (3 値表示は生きている)。 */

const ASSERTS = [
  // ── §0 装置 (先に母集団を確かめる) ─────────────────────────────────────────
  ['0z', '[装置] 配信中の tavern.html から id / place / locked / unlockAfter を 6 組抜けている'
    + ' (正規表現が空振りしていない) ⭐⭐⭐ これが無いと (2z) の照合が「両方 0 件で一致」= 永久緑になる',
    m => {
      const t = m.tavern;
      const ok = t.status === 200 && t.found === true && t.rows.length === 6
        && t.rows.every(r => !!r.id && !!r.place && r.locked !== null)
        && t.rows.filter(r => r.locked === false).length === 1
        && t.rows.filter(r => r.unlockAfter !== null).length === 5;
      return [ok, 'status=' + t.status + ' region=' + t.regionBytes + 'B 組数=' + t.rows.length
        + ' locked:false=' + t.rows.filter(r => r.locked === false).length
        + ' unlockAfter有=' + t.rows.filter(r => r.unlockAfter !== null).length
        + '  ' + t.rows.map(r => r.id + '(' + r.place + '/' + r.locked + '/' + (r.unlockAfter || '—') + ')').join(' ')];
    }],
  ['0a', '[装置] 仕込んだ cleared が実際にページへ届いている'
    + ' (localStorage の実体と __world.revealed() の両方を読む)',
    m => {
      const lo = m.device.stages[m.device.lo], hi = m.device.stages[m.device.hi];
      const eq = (got, want) => JSON.stringify(got) === JSON.stringify(want);
      /* ⭐ 0 本 / 6 本の **両方向**が届いていること = 「常に同じ物を書いている」装置を殺す。 */
      const ok = !!lo && !!hi && lo.hasWorldMap && hi.hasWorldMap
        && eq(lo.clearedParsed, lo.want) && eq(hi.clearedParsed, hi.want)
        && !eq(lo.clearedParsed, hi.clearedParsed);
      /* ⚠ __world.revealed() は項目 3 が足す窓。⛔ 有無で合否を分けない
         (無いのは退行ではなく未実装。証拠文字列にだけ出す)。 */
      const seam = hi.hasRevealed
        ? ('revealed()=' + JSON.stringify(hi.revealed))
        : '⚠ __world.revealed() はまだ無い (項目 3 が足す) — 合否には数えない';
      return [ok, '0本: localStorage=' + JSON.stringify(lo.clearedParsed) + ' (期待 ' + JSON.stringify(lo.want) + ')'
        + ' / 6本: localStorage=' + JSON.stringify(hi.clearedParsed) + ' (期待 ' + JSON.stringify(hi.want) + ')'
        + '  ' + seam];
    }],
  ['0b', '[装置] cleared を 0 本 → 6 本へ動かすと 札の DOM 枚数が実際に変わる'
    + ' (検出器が状態に反応している = 常に同じ数を返していない)',
    m => {
      const lo = m.device.stages[m.device.lo], hi = m.device.stages[m.device.hi];
      /* ⭐⭐⭐ 見るのは「枚数が同じか違うか」ただ 1 つ。⛔ 2 枚 / 7 枚という**数**を
         ここへ書かない — それは (2a)(2b) の仕事で、ここは「検出器が状態に反応しているか」
         (= 何を仕込んでも同じ数を返す装置ではないこと) だけを見る番人。
         ⚠ 起草時 (2026-08-25) の PENDING 理由文は「world.html が未実装なので必ず 7 = 7」
           だったが、項目 3 の実装で **2 枚 / 7 枚**に実際に割れたので理由ごと外した。 */
      const same = lo.signCount === hi.signCount;
      return [!same,
        '0本 ' + JSON.stringify(lo.want) + ' → ' + lo.signCount + ' 枚 (' + lo.signIds.join(',') + ')'
        + '  /  ' + m.device.hi + '本 ' + JSON.stringify(hi.want) + ' → ' + hi.signCount
        + ' 枚 (' + hi.signIds.join(',') + ')'
        + (same ? '  ⛔ 同じ枚数 = 検出器が cleared に反応していない (常に同じ数を返している)'
          : '  ⭐ 同じ検出器 (.worldSign の DOM 件数) が 2 つの状態で違う数を返した'
            + ' = 「何を仕込んでも同じ」ではない')];
    }],

  // ── §1 出発の導線 ──────────────────────────────────────────────────────────
  ['1a', '★酒場で廃坑を受注 → 準備 → #btnDepart → world.html に着き、location.search === ""'
    + ' ⭐ 2 経路で突き合わせる: page.url() と、着地後の __world.heroNode() が "phlan" であること'
    + ' (§2-4 罠 C の裏返し)',
    m => {
      const d = m.depart;
      /* ⭐⭐⭐ 装置: 酒場から WORLD_MAP が見えているか。'undefined' なら §5-2 の条件②が
         永久 false = 地図を一度も挟まないまま「素で緑」になる。合否に含める。 */
      const ok = d.seam.worldMapInTavern === 'object'
        && d.reachedPrep === true && d.prepId === 'goblin-mine'
        && d.blocked.length === 0
        && /\/world\.html$/.test(d.landed.path) && d.landed.search === ''
        && d.heroNode === 'phlan';
      return [ok, '準備画面まで [' + d.steps.join('>') + '] 受注=' + d.prepId
        + '  →  着地 ' + d.landed.path + ' search="' + d.landed.search + '"'
        + '  heroNode=' + d.heroNode + ' (spawnVia=' + JSON.stringify(d.spawnVia) + ')'
        + '  [装置] 酒場で typeof window.WORLD_MAP=' + d.seam.worldMapInTavern
        + ' SITES=' + JSON.stringify(d.seam.sites)
        + ' / index.html への遷移 ' + d.blocked.length + ' 件'];
    }],
  ['1b', '★departToScenario が書く既存キーが 地図に着いた後も全部生きている:'
    + ' currentScenario / partyMembers / partyComposition / questFlags / exitVia (= "tavern") /'
    + ' 新設 questDest (= "goblin-mine")。⛔ lastResult / enterVia は getItem すらしていない',
    m => {
      const d = m.depart, s = d.storage.session, w = m.worldSrc;
      const j = (k) => { try { return JSON.parse(s[k]); } catch (e) { return null; } };
      const party = j(KEY_PARTY), comp = j(KEY_PARTY_COMP), flags = j(KEY_QUEST_FLAGS);
      const alive = s[KEY_SCENARIO] === 'goblin-mine'
        && Array.isArray(party) && party.length > 0
        && Array.isArray(comp) && comp.length === party.length
        && flags !== null && typeof flags === 'object'
        && s[KEY_EXIT_VIA] === 'tavern'
        && s[KEY_QUEST_DEST] === 'goblin-mine';
      /* ⛔ world.html が enterVia / lastResult を **getItem すらしていない** の機械化。
         ⚠ 母集団ガード: world.html を本当に配信できたか (served) を合否に含める。 */
      const untouched = w.served && w.withStorage.length === 0 && w.apiHits.length === 0;
      return [alive && untouched,
        'currentScenario=' + s[KEY_SCENARIO]
        + ' / partyMembers=' + (Array.isArray(party) ? party.length + '人' : '⛔' + s[KEY_PARTY])
        + ' / partyComposition=' + (Array.isArray(comp) ? comp.length + '件' : '⛔' + s[KEY_PARTY_COMP])
        + ' / questFlags=' + s[KEY_QUEST_FLAGS]
        + ' / exitVia=' + s[KEY_EXIT_VIA] + ' / questDest=' + s[KEY_QUEST_DEST]
        + '  ||  world.html(' + w.bytes + 'B status=' + w.status + ') の enterVia|lastResult 出現 '
        + w.lines.length + ' 行 (行 ' + w.lines.map(h => h.n).join(',') + ') '
        + '— Storage と同居 ' + w.withStorage.length + ' 行 / '
        + 'getItem 等へキーを渡している箇所 ' + w.apiHits.length + ' 件'];
    }],
  ['1c', '生成クエスト (掲示板 / 闇市) で出発 → index.html へ直行し、questDest が書かれない'
    + ' (ユーザー決定「据え置き」の機械化)',
    m => {
      const d = m.departGen, s = d.storage.session;
      const b = d.blockedParsed[0] || { path: '(遷移なし)', search: '' };
      const ok = d.seam.worldMapInTavern === 'object'   /* 装置: 判別の材料が在る上での「直行」 */
        && d.prepId === 'generated-quest'
        && d.blockedParsed.length === 1 && /\/index\.html$/.test(b.path) && b.search === ''
        && /\/tavern\.html$/.test(d.landed.path)        /* world へは 1 度も行っていない */
        && s[KEY_SCENARIO] === 'generated-quest'        /* 出発処理は本当に走った */
        && s[KEY_QUEST_DEST] === null;
      return [ok, '合成シナリオ id=' + d.prepId + ' target=' + d.prepTarget
        + '  →  遷移先 ' + b.path + ' search="' + b.search + '" (' + d.blockedParsed.length + ' 件)'
        + '  currentScenario=' + s[KEY_SCENARIO]
        + ' questDest=' + (s[KEY_QUEST_DEST] === null ? '(無し)' : s[KEY_QUEST_DEST])
        + ' exitVia=' + (s[KEY_EXIT_VIA] === null ? '(無し)' : s[KEY_EXIT_VIA])
        + '  [装置] SITES に "generated-quest" は'
        + (((d.seam.sites || []).indexOf('generated-quest') >= 0) ? '**ある**⛔' : '無い')
        + ' (SITES=' + JSON.stringify(d.seam.sites) + ')'];
    }],

  // ── §2 未解放の不可視 ──────────────────────────────────────────────────────
  ['2z', '★js/world-map.js の UNLOCK が、配信中の tavern.html の scenarios[] から読み取った'
    + ' locked / unlockAfter と 1 文字違わず一致 (別ファイルの実体どうしの照合)',
    m => {
      const tav = m.tavern, md = m.stages[0].mapData;
      const unlock = md ? md.unlock : null;
      if (!unlock) return [false, '⛔ WORLD_MAP.UNLOCK がブラウザから見えない'];
      const keys = Object.keys(unlock), diffs = [];
      if (keys.length !== tav.rows.length) diffs.push('件数 UNLOCK=' + keys.length + '/tavern=' + tav.rows.length);
      for (const r of tav.rows) {
        if (!(r.id in unlock)) { diffs.push(r.id + ':UNLOCK に無い'); continue; }
        const got = unlock[r.id];
        /* ⭐ 2 つの実体を突き合わせる: ① 前提の id が一致 ② 「鍵が掛かっているか」も一致 */
        if (got !== r.unlockAfter) {
          diffs.push(r.id + ':UNLOCK=' + JSON.stringify(got) + ' ≠ tavern.unlockAfter=' + JSON.stringify(r.unlockAfter));
        }
        if ((got === null) !== (r.locked === false)) {
          diffs.push(r.id + ':UNLOCK=' + JSON.stringify(got) + ' なのに tavern.locked=' + r.locked);
        }
      }
      for (const k of keys) if (!tav.map[k]) diffs.push(k + ':tavern に無い');
      return [tav.rows.length === 6 && keys.length === 6 && diffs.length === 0,
        'js/world-map.js UNLOCK=' + JSON.stringify(unlock)
        + '  vs  配信中の tavern.html='
        + JSON.stringify(tav.rows.reduce((o, r) => { o[r.id] = (r.locked ? r.unlockAfter : null); return o; }, {}))
        + (diffs.length ? '  ⛔ ' + diffs.join(' / ') : '')];
    }],
  ['2a', '★cleared = [] のとき、札は 港町フランと廃坑の 2 枚だけ。未解放 5 拠点は'
    + ' .worldSign が 0 枚・.worldNode-site でなく .worldNode-way・title 属性が空',
    m => {
      const st = m.stages[0], md = st.mapData;
      /* ⭐ 期待値は **UNLOCK と SITES から導く**。⛔ "phlan" / "mine" をここに書かない
         (鎖が変わった日に嘘の緑が出る)。cleared=[] なので前提の要らないシナリオだけ解放。 */
      const scOf = {}; for (const sc of Object.keys(md.sites)) scOf[md.sites[sc]] = sc;
      const siteIds = Object.keys(st.nodes).filter(id => st.nodes[id].kind === 'site');
      const wantShown = siteIds.filter(id => !scOf[id] || md.unlock[scOf[id]] === null);
      const wantHidden = siteIds.filter(id => wantShown.indexOf(id) < 0);
      const bad = [];
      for (const id of wantShown) {
        const n = st.nodes[id];
        if (!n.hasSign) bad.push(id + ':札が無い');
        if (!/worldNode-site/.test(n.cls)) bad.push(id + ':class=' + n.cls);
        if (!n.title) bad.push(id + ':title が空');
      }
      for (const id of wantHidden) {
        const n = st.nodes[id];
        if (n.hasSign) bad.push(id + ':札が出ている');
        if (/worldNode-site/.test(n.cls) || !/worldNode-way/.test(n.cls)) bad.push(id + ':class=' + n.cls);
        if (n.title !== '') bad.push(id + ':title="' + n.title + '" が漏れている');
      }
      /* ⭐ 検証シームの側も同じ答えか (DOM だけ隠して内部状態が食い違っていないか)。 */
      const wantRevealed = Object.keys(st.nodes).filter(id => wantHidden.indexOf(id) < 0);
      if (!st.hasRevealed) bad.push('__world.revealed() が無い');
      else if (JSON.stringify(st.revealed) !== JSON.stringify(wantRevealed)) {
        bad.push('revealed()=' + JSON.stringify(st.revealed) + ' ≠ 期待 ' + JSON.stringify(wantRevealed));
      }
      const ok = JSON.stringify(st.clearedParsed) === '[]'
        && wantShown.length === 2 && wantHidden.length === 5
        && st.signCount === 2 && bad.length === 0;
      return [ok, 'cleared=[] → .worldSign ' + st.signCount + ' 枚 (' + st.signIds.join(',') + ')'
        + '  ⭐ UNLOCK から導いた 出す=' + JSON.stringify(wantShown)
        + ' / 隠す=' + JSON.stringify(wantHidden)
        + '  隠した側の実測=' + JSON.stringify(wantHidden.map(id =>
            id + '{' + st.nodes[id].cls + '|title="' + st.nodes[id].title + '"|札=' + st.nodes[id].hasSign + '}'))
        + (bad.length ? '  ⛔ ' + bad.join(' / ') : '')];
    }],
  ['2b', 'cleared を 0 → 1 → 2 → 3 → 4 → 5 本と伸ばすと、札が 2 → 3 → 4 → 5 → 6 → 7 枚へ'
    + ' 1 枚ずつ増える (6 段階を実測。順序も UNLOCK の鎖どおり)',
    m => {
      const rows = m.stages.map((st, n) => {
        const md = st.mapData;
        const scOf = {}; for (const sc of Object.keys(md.sites)) scOf[md.sites[sc]] = sc;
        const siteIds = Object.keys(st.nodes).filter(id => st.nodes[id].kind === 'site');
        const cleared = st.clearedParsed || [];
        /* ⭐ 期待する札の並びは **UNLOCK の鎖 + 仕込んだ cleared** から毎回導く。
           ⛔ 2,3,4,5,6,7 の内訳をドライバへ並べ書きしない。 */
        const want = siteIds.filter(id => {
          const sc = scOf[id];
          if (!sc) return true;
          const need = md.unlock[sc];
          return !need || cleared.indexOf(need) >= 0;
        });
        return { n: n, cleared: cleared, want: want, got: st.signIds, count: st.signCount };
      });
      const bad = [];
      rows.forEach((r, i) => {
        if (JSON.stringify(r.got) !== JSON.stringify(r.want)) {
          bad.push('cleared=' + r.n + '本:札=' + JSON.stringify(r.got) + ' ≠ 鎖から導いた ' + JSON.stringify(r.want));
        }
        if (r.count !== i + 2) bad.push('cleared=' + r.n + '本:' + r.count + ' 枚 (期待 ' + (i + 2) + ')');
      });
      return [m.stages.length === 6 && bad.length === 0,
        rows.map(r => r.n + '本[' + r.cleared.length + ']→' + r.count + '枚(' + r.got.join(',') + ')').join('   ')
        + (bad.length ? '  ⛔ ' + bad.join(' / ') : '')];
    }],
  ['2c', '★★★ 未解放でも歩ける。cleared = [] の状態で、本番の WORLD_MAP.findPath("phlan", X) が'
    + ' 14 ノードすべてに対して null を返さない ⭐ 特に mine と temple を名指しで見る'
    + ' (§2-2 の詰みが起きていない証明)',
    m => {
      const st = m.stages[0], p = st.paths, md = st.mapData;
      if (!p) return [false, '⛔ findPath の測定が取れていない'];
      const ids = Object.keys(st.nodes);
      const unreachable = ids.filter(id => p.len[id] === null || p.len[id] === undefined);
      /* ⭐ 名指しの 2 つ = 鎖の 1 本目 (廃坑) と 5 本目 (地下神殿)。
         ⛔ ノード id を直書きせず tavern の並び → SITES で引く。 */
      const named = [m.tavern.order[0], m.tavern.order[m.tavern.order.length - 2]]
        .map(sc => ({ sc: sc, node: md.sites[sc] }));
      const namedBad = named.filter(x => !x.node || p.len[x.node] === null || p.len[x.node] === undefined);
      const ok = JSON.stringify(st.clearedParsed) === '[]'
        && !!p.start && ids.length === 14
        && unreachable.length === 0 && namedBad.length === 0;
      return [ok, 'cleared=[] / 起点=' + p.start + ' (enter を持つノード = 港町)  '
        + ids.length + ' ノードすべてへ本番の findPath が経路を返す'
        + '  ⭐ 名指し: ' + named.map(x => x.sc + '→' + x.node + '(' + p.len[x.node] + '手)').join(' / ')
        + '  全ノードの手数=' + JSON.stringify(p.len)
        + (unreachable.length ? '  ⛔ 到達不能 ' + unreachable.join(',') : '')];
    }],
  ['2d', '未解放拠点を実クリック → 歩けて、そのノードに立つ (__world.heroNode() が一致)。'
    + ' 遷移も確認ダイアログも起きない',
    m => {
      const w = m.walkPlain, md = w.mapData;
      const scOf = {}; for (const sc of Object.keys(md.sites)) scOf[md.sites[sc]] = sc;
      const cleared = w.clearedParsed || [];
      const hidden = w.clickIds.filter(id => {
        const sc = scOf[id];
        return sc && md.unlock[sc] !== null && cleared.indexOf(md.unlock[sc]) < 0;
      });
      const bad = [];
      for (const r of w.clicks) {
        if (r.err) { bad.push(r.id + ':' + r.err); continue; }
        if (!/\/world\.html$/.test(r.path)) bad.push(r.id + ':' + r.path + ' へ遷移した');
        if (r.search !== '') bad.push(r.id + ':search="' + r.search + '"');
        if (r.node !== r.id) bad.push(r.id + ':歩けていない heroNode=' + r.node);
        if (r.askOpen !== false) bad.push(r.id + ':askOpen=' + r.askOpen);
      }
      const ok = w.signCount === 2 && hidden.length === 5
        && w.clickIds.length === 6 && bad.length === 0;
      return [ok, 'cleared=[] (札 ' + w.signCount + ' 枚) で 拠点 ' + w.clickIds.length
        + ' 件を実クリック — うち **未解放が ' + hidden.length + ' 件** (' + hidden.join(',') + ')'
        + '  着いた先=' + JSON.stringify(w.clicks.map(r => r.id + '→' + r.node))
        + '  遷移 0 件 / 確認ダイアログ 0 件'
        + (bad.length ? '  ⛔ ' + bad.join(' / ') : '')];
    }],

  // ── §3 受注地のクリック ────────────────────────────────────────────────────
  ['3z', '[装置] questDest = "goblin-mine" を仕込んだ状態で測っている (__world.questDest() で確認)',
    m => {
      const a = m.ask;
      const ok = a.onWorld === true && a.dest === 'goblin-mine' && a.seamDest === 'goblin-mine'
        && !!a.nodeId && !!a.label && a.hasAskOpen === true;
      return [ok, '⭐ 仕込みではなく **本番の酒場が実際に受注 → 出発** した結果を測っている  '
        + 'sessionStorage[questDest]=' + a.dest + ' / __world.questDest()=' + a.seamDest
        + ' / SITES で引いた受注地=' + a.nodeId + ' (label="' + a.label + '")'
        + ' / 着地=' + a.depart.landed.path + ' search="' + a.depart.landed.search + '"'
        + ' / 札=' + a.signCount + ' 枚'
        + ' / __world.askOpen()=' + (a.hasAskOpen ? 'あり' : '⛔ 無い')];
    }],
  ['3a', '★受注地 (廃坑) の札をタップ → 確認ダイアログが出る (__world.askOpen() が true)。'
    + ' 文言に NODES.mine.label (= 「廃坑」) がそのまま入っている (⛔ 写経していない)',
    m => {
      const a = m.ask, s1 = a.afterClick || {}, s2 = a.afterClick2 || {};
      const label = a.label || '';
      /* ⛔ 文言そのものをドライバへ写経しない。⭐ **本番の label を読んで**
         「その label が文中に在り、かつ label だけではない (文になっている)」を見る。 */
      const textOk = (t) => !!t && !!label && t.indexOf(label) >= 0 && t.length > label.length;
      const ok = s1.askOpen === true && s1.heroNode === a.nodeId && textOk(s1.askText)
        && /\/world\.html$/.test(s1.path) && s1.search === ''
        && s2.askOpen === true && textOk(s2.askText);
      return [ok, '受注地 ' + a.nodeId + ' の札をタップ → askOpen=' + s1.askOpen
        + ' / heroNode=' + s1.heroNode + ' / display=' + s1.askDisplay + ' / aria-hidden=' + s1.askAria
        + '  文言="' + s1.askText + '"'
        + '  ⭐ 本番の label ("' + label + '" = js/world-map.js) を含む=' + (textOk(s1.askText) ? 'true' : 'false')
        + '  [2 回目のタップ] askOpen=' + s2.askOpen + ' 文言="' + s2.askText + '"'];
    }],
  ['3b', '★「入る」→ index.html へ遷移し、location.search === ""。かつ questDest が消費されている'
    + ' (sessionStorage に無い)。⭐ currentScenario / partyMembers は生きたまま',
    m => {
      const a = m.ask;
      const st = a.afterYesStorage ? a.afterYesStorage.session : {};
      const b = (a.yesBlocked && a.yesBlocked[0]) || { path: '(遷移なし)', search: '' };
      let party = null; try { party = JSON.parse(st[KEY_PARTY]); } catch (e) {}
      let comp = null; try { comp = JSON.parse(st[KEY_PARTY_COMP]); } catch (e) {}
      const ok = (a.yesBlocked || []).length === 1
        && /\/index\.html$/.test(b.path) && b.search === ''
        && st[KEY_QUEST_DEST] === null
        && st[KEY_SCENARIO] === 'goblin-mine'
        && Array.isArray(party) && party.length > 0
        && Array.isArray(comp) && comp.length === party.length
        && st[KEY_EXIT_VIA] === 'tavern';        /* ⛔ world は一回性キーを食わない */
      return [ok, '「入る」→ ' + b.path + ' search="' + b.search + '" ('
        + (a.yesBlocked || []).length + ' 件)  ⭐ 横取りしたのは遷移だけなので、この search が'
        + ' 着地していたはずの location.search'
        + '  questDest=' + (st[KEY_QUEST_DEST] === null ? '(消費済)' : '⛔ 残っている ' + st[KEY_QUEST_DEST])
        + '  ⭐ 生きたまま: currentScenario=' + st[KEY_SCENARIO]
        + ' / partyMembers=' + (Array.isArray(party) ? party.length + '人' : '⛔' + st[KEY_PARTY])
        + ' / partyComposition=' + (Array.isArray(comp) ? comp.length + '件' : '⛔' + st[KEY_PARTY_COMP])
        + ' / exitVia=' + st[KEY_EXIT_VIA]
        + ' / enterVia=' + (st[KEY_ENTER_VIA] === null ? '(元から無し)' : st[KEY_ENTER_VIA])
        + ' / lastResult=' + (st[KEY_LAST_RESULT] === null ? '(元から無し)' : st[KEY_LAST_RESULT])];
    }],
  ['3c', '「やめる」→ world.html のまま・ダイアログが閉じ・questDest は残る',
    m => {
      const a = m.ask, s = a.afterNo || {};
      const st = a.afterNoStorage ? a.afterNoStorage.session : {};
      const ok = s.askOpen === false && s.askDisplay === 'none' && s.askAria === 'true'
        && /\/world\.html$/.test(s.path) && s.search === ''
        && s.heroNode === a.nodeId
        && st[KEY_QUEST_DEST] === 'goblin-mine';
      return [ok, '「やめる」→ ' + s.path + ' search="' + s.search + '"'
        + ' / askOpen=' + s.askOpen + ' / display=' + s.askDisplay + ' / aria-hidden=' + s.askAria
        + ' / heroNode=' + s.heroNode
        + ' / questDest=' + (st[KEY_QUEST_DEST] === null ? '⛔ 消えている' : st[KEY_QUEST_DEST] + ' (残っている)')];
    }],
  ['3d', '★受注していない解放済み拠点 (例: cleared を 6 本にしたうえで questDest = "goblin-mine" の'
    + 'まま森をタップ) → 歩くだけ・遷移せず・確認も出ない',
    m => {
      const o = m.askOther, s = o.st || {}, st = o.storage ? o.storage.session : {};
      const ok = !!o.seam && o.seam.signCount === 7            /* ★ 母集団: 全部解放済み */
        && o.seam.questDest === 'goblin-mine'                  /* ★ 受注はしている */
        && !!o.target && o.targetScenario !== 'goblin-mine'    /* ★ 押したのは受注地ではない */
        && s.heroNode === o.target                             /* 歩けている */
        && s.askOpen === false && s.askDisplay === 'none'
        && /\/world\.html$/.test(s.path)
        && (o.blocked || []).length === 0
        && st[KEY_QUEST_DEST] === 'goblin-mine';               /* 消費されていない */
      return [ok, 'cleared=6本 (札 ' + (o.seam ? o.seam.signCount : '?') + ' 枚) / questDest='
        + (o.seam ? o.seam.questDest : '?') + ' のまま、受注していない '
        + o.targetScenario + ' (' + o.target + ') をタップ'
        + '  →  heroNode=' + s.heroNode + ' / ' + s.path + s.search
        + ' / askOpen=' + s.askOpen + ' display=' + s.askDisplay
        + ' / index.html への遷移 ' + (o.blocked || []).length + ' 件'
        + ' / questDest=' + st[KEY_QUEST_DEST] + ' (消費されていない)'];
    }],
  ['3e', '確認ダイアログが閉じているとき、7 枚の札の中心の elementFromPoint が 自分自身か子孫'
    + ' (#21 の (7d) を壊していない = ダイアログが display:none である証明)',
    m => {
      const st = m.device.stages[m.device.hi];   /* cleared = 6 本 = 札 7 枚の母集団 */
      const rows = st.signProbe || [];
      const bad = rows.filter(r => !r.onScreen || !r.self)
        .map(r => r.id + '[' + (r.onScreen ? '' : '画面外/') + '押した先=' + r.top + ']');
      const ok = st.askOpen === false && st.askDisplay === 'none'
        && rows.length === 7 && bad.length === 0;
      return [ok, 'cleared=6本 → 札 ' + rows.length + ' 枚 (' + rows.map(r => r.id).join(',')
        + ') の中心の elementFromPoint がすべて自分自身か子孫'
        + '  ダイアログ: askOpen=' + st.askOpen + ' / display=' + st.askDisplay
        + ' (⭐ display:none だから札が食われない — visibility:hidden にすると 7 枚とも赤くなる)'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],

  // ── §4 撤退 ────────────────────────────────────────────────────────────────
  ['4a', 'tavern.html?questwalk=0 で受注 → 出発 → index.html へ直行。questDest が無い',
    m => {
      const d = m.departOff, s = d.storage.session;
      const b = d.blockedParsed[0] || { path: '(遷移なし)', search: '' };
      const ok = d.seam.worldMapInTavern === 'object'
        && d.seam.questWalkOff === true && s[KEY_WALK_OFF] === '1'
        && d.reachedPrep === true && d.prepId === 'goblin-mine'
        && d.blockedParsed.length === 1 && /\/index\.html$/.test(b.path) && b.search === ''
        && /\/tavern\.html$/.test(d.landed.path)
        && s[KEY_QUEST_DEST] === null;
      return [ok, '酒場 URL="' + d.seam.search + '" __questWalkOff=' + d.seam.questWalkOff
        + ' sessionStorage[questWalkOff]=' + s[KEY_WALK_OFF]
        + '  受注=' + d.prepId + '  →  ' + b.path + ' search="' + b.search + '"'
        + '  questDest=' + (s[KEY_QUEST_DEST] === null ? '(無し)' : s[KEY_QUEST_DEST])
        + '  [装置] 酒場で typeof window.WORLD_MAP=' + d.seam.worldMapInTavern];
    }],
  ['4b', 'world.html?questwalk=0 → 札が 7 枚とも出る (cleared = [] でも)。'
    + ' 港町フラン以外はどれも遷移しない = #21 の (7e) と同じ姿',
    m => {
      const w = m.walkOffWorld;
      const bad = [];
      for (const r of w.clicks) {
        if (r.err) { bad.push(r.id + ':' + r.err); continue; }
        if (!/\/world\.html$/.test(r.path)) bad.push(r.id + ':' + r.path + ' へ遷移した');
        if (r.search !== '?questwalk=0') bad.push(r.id + ':search="' + r.search + '"');
        if (r.node !== r.id) bad.push(r.id + ':歩けていない heroNode=' + r.node);
        if (r.askOpen === true) bad.push(r.id + ':確認ダイアログが出た');
      }
      /* ⛔ 「常に true を返す式」にしない。DOM の .worldSign を **実際に数えて** 7 と比べる。
         ⚠ 今は world.html が未実装なので 7 枚は自明だが、項目 3 の実装後も 7 枚のままで
           あることを守る番人になる (撤退スイッチが効いている証明)。 */
      const ok = w.search === '?questwalk=0'        /* 装置: クエリが本当に届いている */
        && w.signCount === 7
        && w.clickIds.length === 6                  /* 港町フラン以外 = enter を持たない site */
        && bad.length === 0;
      return [ok, 'URL search="' + w.search + '"  .worldSign=' + w.signCount + ' 枚'
        + '  押した札 ' + w.clickIds.length + ' 枚 (' + w.clickIds.join(',') + ')'
        + '  遷移 0 件 / 確認ダイアログ 0 件'
        + (w.clicks.length && w.clicks[0].hasAskOpen === false
            ? ' (⚠ __world.askOpen() はまだ無い = 項目 3 が足す。出ていないことは path で押さえた)' : '')
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['4c', '?questwalk=0 を付けた後、クエリ無しで開き直しても撤退が効いている'
    + ' (sessionStorage へ写せている)。⭐ 同じタブで測る',
    m => {
      const d = m.departOff2, s = d.storage.session;
      const b = d.blockedParsed[0] || { path: '(遷移なし)', search: '' };
      const ok = d.seam.worldMapInTavern === 'object'
        && d.seam.search === ''                     /* ★ 開き直した後は素の URL */
        && d.seam.questWalkOff === true             /* それでも撤退が効いている */
        && s[KEY_WALK_OFF] === '1'
        && d.blockedParsed.length === 1 && /\/index\.html$/.test(b.path) && b.search === ''
        && /\/tavern\.html$/.test(d.landed.path)
        && s[KEY_QUEST_DEST] === null;
      return [ok, '?questwalk=0 → 同じタブでクエリ無しへ開き直した後の location.search="'
        + d.seam.search + '"  __questWalkOff=' + d.seam.questWalkOff
        + '  sessionStorage[questWalkOff]=' + s[KEY_WALK_OFF]
        + '  →  ' + b.path + ' search="' + b.search + '"'
        + '  questDest=' + (s[KEY_QUEST_DEST] === null ? '(無し)' : s[KEY_QUEST_DEST])];
    }],
  ['4d', '★★★ tavern.html?autoplay=10 で出発 → index.html へ直行し、location.search に'
    + ' autoplay=10 が残っている (§2-3 罠 B の直接の検査。probe_s2_clear.js /'
    + ' sweep_recruit_balance.js の身代わり)',
    m => {
      const d = m.departAuto, s = d.storage.session;
      const b = d.blockedParsed[0] || { path: '(遷移なし)', search: '' };
      /* ⭐⭐⭐ worldMapInTavern を合否に入れるのが肝。入れないと「WORLD_MAP が
         undefined で地図を一度も挟まない」実装でも (4d) は緑になってしまう。 */
      const ok = d.seam.worldMapInTavern === 'object'
        && d.seam.search === '?autoplay=10'
        && d.reachedPrep === true && d.prepId === 'goblin-mine'
        && d.blockedParsed.length === 1 && /\/index\.html$/.test(b.path)
        && /(^|[?&])autoplay=10($|&)/.test(b.search)
        && /\/tavern\.html$/.test(d.landed.path)
        && s[KEY_QUEST_DEST] === null;
      return [ok, '酒場 URL="' + d.seam.search + '"  →  遷移先 ' + b.path
        + ' search="' + b.search + '"'
        + ' (⭐ これが着地していたはずの location.search。横取りしたのは遷移だけ)'
        + '  questDest=' + (s[KEY_QUEST_DEST] === null ? '(無し)' : s[KEY_QUEST_DEST])
        + '  [装置] 酒場で typeof window.WORLD_MAP=' + d.seam.worldMapInTavern
        + ' (undefined なら地図を挟む条件が永久 false = この緑は嘘)'];
    }],
  ['4e', '?world=0 が立っているとき、出発は index.html 直行 (依頼を持ったまま街に落ちない)',
    m => {
      const d = m.departWorldOff, s = d.storage.session;
      const b = d.blockedParsed[0] || { path: '(遷移なし)', search: '' };
      const ok = d.seam.worldMapInTavern === 'object'
        && s[KEY_WORLD_OFF] === '1'                 /* ★ 装置: ?world=0 の写しが実在する */
        && d.seam.questWalkOff === false            /* ⭐ questwalk とは独立に効いている */
        && d.reachedPrep === true && d.prepId === 'goblin-mine'
        && d.blockedParsed.length === 1 && /\/index\.html$/.test(b.path) && b.search === ''
        && /\/tavern\.html$/.test(d.landed.path)
        && s[KEY_QUEST_DEST] === null;
      return [ok, 'sessionStorage[worldOff]=' + s[KEY_WORLD_OFF]
        + ' / [questWalkOff]=' + (s[KEY_WALK_OFF] === null ? '(無し)' : s[KEY_WALK_OFF])
        + '  受注=' + d.prepId + '  →  ' + b.path + ' search="' + b.search + '"'
        + '  questDest=' + (s[KEY_QUEST_DEST] === null ? '(無し)' : s[KEY_QUEST_DEST])
        + '  [装置] 酒場で typeof window.WORLD_MAP=' + d.seam.worldMapInTavern];
    }],

  // ── §5 恒等 (非退行) ───────────────────────────────────────────────────────
  ['5a', 'WORLD_MAP.NODES / EDGES / SITES の中身が 1 件も変わっていない'
    + ' (件数・キー・座標・enter の有無をハッシュで固定)',
    m => {
      const md = m.stages[0].mapData;
      /* ⭐ 固定するのは **件数・キー・kind・座標・enter の有無・エッジの並び・SITES** だけ。
         ⛔ label / desc は入れない (それは verify_world_map.js の (7a) が
            配信中の tavern.html と照合して縛っている = 二重に持たない)。
         ⚠ 期待値は #23 着手時 (2026-08-26) の実測を焼いたもの。ここが赤くなったら
            「地図のデータを触った」= 依頼書 §11 の禁止事項を踏んだということ。 */
      const canon = JSON.stringify({ nodes: md.nodesFP, edges: md.edges, sites: md.sites });
      const got = crypto.createHash('sha1').update(canon).digest('hex').slice(0, 16);
      const WANT = '876c5f6336f96811';   /* 2026-08-26 実測 (NODES 14 / EDGES 14 / SITES 6) */
      return [got === WANT, 'NODES ' + md.nodesFP.length + ' 件 / EDGES ' + md.edges.length
        + ' 本 / SITES ' + Object.keys(md.sites).length + ' 件'
        + '  sha1(先頭16)=' + got + ' (固定値 ' + WANT + ')'
        + (got === WANT ? '' : '  ⛔ 実測の中身= ' + canon)];
    }],
  ['5b', 'enter を持つノードは 今も phlan ただ 1 つ'
    + ' (⛔ 受注地の入場を NODES.enter で実装していないことの証明)',
    m => {
      const st = m.stages[0], md = st.mapData;
      /* ⭐ 2 経路で突き合わせる: ① WORLD_MAP のデータ ② ページが DOM を組む時に見た値。 */
      const domEnter = Object.keys(st.nodes).filter(id => st.nodes[id].hasEnter === true);
      const ok = md.enterIds.length === 1 && domEnter.length === 1
        && md.enterIds[0] === domEnter[0]
        && st.nodes[md.enterIds[0]].kind === 'site';
      return [ok, 'enter を持つノード = ' + JSON.stringify(md.enterIds)
        + ' (DOM 経路の実測=' + JSON.stringify(domEnter) + ')'
        + '  ⭐ 受注地の入場は NODES.enter ではなく **受注状態の関数**'
        + ' (onArriveNode → askEnter) で実装されている  — (3a)(3b) がその実装を実測している'];
    }],
];
const ASSERT_OF = {}; for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

/* ⭐ 出口は 1 本。PENDING の理由を持っている assert はここで PENDING になる。
 *   ⚠ 後続項目は「述語を書いて 4 番目の要素を消す」だけでよい。 */
function emit(key, m) {
  const a = ASSERT_OF[key];
  if (!a) { check('(' + key + ') [装置] assert が ASSERTS に登録されている', false, '⛔ 未登録'); return; }
  if (a[3]) { pending('(' + a[0] + ') ' + a[1], a[3]); return; }
  let r;
  try { r = a[2](m); } catch (e) { r = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}
const SECTIONS = [
  ['§0 装置 — 母集団と仕込み', ['0z', '0a', '0b']],
  ['§1 出発の導線', ['1a', '1b', '1c']],
  ['§2 未解放の不可視', ['2z', '2a', '2b', '2c', '2d']],
  ['§3 受注地のクリック', ['3z', '3a', '3b', '3c', '3d', '3e']],
  ['§4 撤退', ['4a', '4b', '4c', '4d', '4e']],
  ['§5 恒等 (非退行)', ['5a', '5b']],
];

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_questwalk_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  MUT_SERVED.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

  console.log('=== verify_quest_walk.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (実装済の変異はまだ 0 本 — 10 本とも項目 4 の担当)'));

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    /* ⭐ #20 / #21 と同じフラグ。地図は BGM を鳴らすので、音で落ちないよう mute する。 */
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const errs = [];

  try {
    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      const m = {};
      mark(SECTIONS[0][0]);
      m.tavern = await readTavernScenarios(PORT);
      m.device = await measureDevice(browser, PORT, errs, m.tavern);
      for (const key of SECTIONS[0][1]) emit(key, m);
      console.log('       [記録] 配信中の tavern.html から読んだ解放の鎖 (⛔ ドライバに写経しない):');
      for (const r of m.tavern.rows) {
        console.log('         ' + r.id + '  place="' + r.place + '"  locked=' + r.locked
          + '  unlockAfter=' + (r.unlockAfter || '—'));
      }
      console.log('       [記録] cleared の段数と札の枚数 (⭐ 項目 3 の実装後、ここが 2 枚 / 7 枚へ割れる):');
      for (const n of [m.device.lo, m.device.hi]) {
        const st = m.device.stages[n];
        console.log('         cleared=' + n + ' 本 ' + JSON.stringify(st.want)
          + '  →  .worldSign ' + st.signCount + ' 枚  (site ノード '
          + Object.keys(st.nodes).filter(id => st.nodes[id].kind === 'site').length + ' 件)'
          + '  heroNode=' + st.heroNode);
      }
      const hi = m.device.stages[m.device.hi];
      console.log('       [記録] 項目 3 が足す検証シームの現況 (⛔ 有無で合否を分けない):');
      console.log('         __world.revealed() = ' + (hi.hasRevealed ? 'あり' : '⚠ まだ無い')
        + '   __world.questDest() = ' + (hi.hasQuestDestFn ? 'あり' : '⚠ まだ無い')
        + '   __world.askOpen() = ' + (hi.hasAskOpenFn ? 'あり' : '⚠ まだ無い'));

      /* ══ §1 / §4 の測定 (項目 2 が追加) ═══════════════════════════════════
         ⭐ 1 回の measureDepart = 1 タブ。seedPage の仕込みは 1 タブ 1 回だけ効くので、
           腕どうしが sessionStorage を汚し合うことはない。
         ⚠ index.html への遷移だけ横取りして中止するので、本編は 1 度も起動しない
           (重さと console.error を持ち込まない)。 */
      mark('§1 / §4 の測定 — 酒場から実際に出発させる');
      m.worldSrc       = await readWorldSource(PORT);
      m.depart         = await measureDepart(browser, PORT, errs, { tag: '素',            mode: 'ui',        seed: { cleared: [] } });
      m.departGen      = await measureDepart(browser, PORT, errs, { tag: '生成クエスト',   mode: 'generated', seed: { cleared: [] } });
      m.departOff      = await measureDepart(browser, PORT, errs, { tag: 'questwalk=0',   mode: 'ui', query: '?questwalk=0', seed: { cleared: [] } });
      m.departOff2     = await measureDepart(browser, PORT, errs, { tag: 'questwalk=0→素', mode: 'ui', query: '?questwalk=0', reopen: '', seed: { cleared: [] } });
      m.departAuto     = await measureDepart(browser, PORT, errs, { tag: 'autoplay=10',   mode: 'ui', query: '?autoplay=10', seed: { cleared: [] } });
      m.departWorldOff = await measureDepart(browser, PORT, errs, { tag: 'world=0',       mode: 'ui', seed: { cleared: [], session: { [KEY_WORLD_OFF]: '1' } } });
      m.walkOffWorld   = await measureWorldClicks(browser, PORT, errs, { tag: 'questwalk=0', query: '?questwalk=0', seed: { cleared: [] } });
      console.log('       [記録] 出発の着地先 (⭐ 「地図を挟む / 挟まない」を分ける 5 条件の実測):');
      for (const d of [m.depart, m.departGen, m.departOff, m.departOff2, m.departAuto, m.departWorldOff]) {
        const b = d.blockedParsed[0];
        console.log('         ' + (d.tag + '                ').slice(0, 16)
          + ' 受注=' + ((d.prepId || '-') + '            ').slice(0, 16)
          + ' → ' + (b ? (b.path + b.search + '  (直行)') : (d.landed.path + d.landed.search + '  (地図経由)'))
          + '  questDest=' + (d.storage.session[KEY_QUEST_DEST] === null ? '—' : d.storage.session[KEY_QUEST_DEST])
          + '  exitVia=' + (d.storage.session[KEY_EXIT_VIA] === null ? '—' : d.storage.session[KEY_EXIT_VIA])
          + '  heroNode=' + (d.heroNode === null ? '—' : d.heroNode));
      }

      /* ══ §2 / §3 / §5 の測定 (項目 3 が追加) ═══════════════════════════
         ⭐ 解放段階は **配信中の tavern.html から読んだ順序**で作る (clearedUpTo)。
           ⛔ "goblin-mine" 等を並べ書きしない (鎖が変わった日に嘘の緑が出る)。
         ⚠ 1 段階 = 1 タブ。seedPage の仕込みは 1 タブ 1 回だけ効くので混ざらない。 */
      mark('§2 / §3 の測定 — 解放段階ごとの札と、受注地への入場');
      m.stages = [];
      for (let n = 0; n <= 5; n++) {
        const want = clearedUpTo(m.tavern, n);
        const st = await measureWorld(browser, PORT, errs, { tag: 'cleared=' + n + '本', seed: { cleared: want } });
        st.want = want;
        m.stages.push(st);
      }
      /* (2d) 未解放でも歩けること。⭐ questDest は仕込まない = 何も起きないのが正解。 */
      m.walkPlain = await measureWorldClicks(browser, PORT, errs, { tag: 'cleared=0 未解放を歩く', seed: { cleared: [] } });
      /* (3z)(3a)(3b)(3c) ⭐ 本番の酒場が実際に受注 → 出発したタブをそのまま使う。 */
      m.ask = await measureAskChain(browser, PORT, errs);
      /* (3d) 受注外の拠点。⭐ 押す先は「鎖の 2 本目」= 受注地 (1 本目) とは必ず別。 */
      m.askOther = await measureSeededAsk(browser, PORT, errs, m.tavern, {
        tag: '受注外', clearedN: m.tavern.order.length,
        questDest: m.tavern.order[0], targetScenario: m.tavern.order[1],
      });
      console.log('       [記録] 解放段階 → 札 (⭐ 期待値は UNLOCK の鎖から毎回導いている):');
      for (const st of m.stages) {
        console.log('         cleared=' + st.want.length + '本 ' + JSON.stringify(st.want)
          + '  →  .worldSign ' + st.signCount + ' 枚  [' + st.signIds.join(',') + ']');
      }
      console.log('       [記録] 受注地への入場 (⭐ 実出発したタブでの実クリック):');
      console.log('         受注=' + m.ask.dest + ' → ノード ' + m.ask.nodeId
        + ' (label="' + m.ask.label + '")'
        + '  1回目=' + JSON.stringify(m.ask.afterClick ? m.ask.afterClick.askText : null)
        + '  やめる後 askOpen=' + (m.ask.afterNo ? m.ask.afterNo.askOpen : null)
        + '  入る後の遷移=' + JSON.stringify(m.ask.yesBlocked || []));

      for (let i = 1; i < SECTIONS.length; i++) {
        mark(SECTIONS[i][0]);
        for (const key of SECTIONS[i][1]) emit(key, m);
      }

      mark('§9 ページエラー');
      check('(9a) 測定ページで pageerror / console.error が出ていない', errs.length === 0, errs.slice(0, 6).join(' | '));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
            pure.body.split(MUTATIONS[k].to).length - 1 === 0 && mut.body.split(MUTATIONS[k].to).length - 1 === 1, f);
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length, '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }
      }

      mark('欠陥を注入すると担当の節が赤くなること (⭐ 素と同じ装置・同じ述語を変異ポートへ)');
      const negTav = await readTavernScenarios(PORT);
      check('(n1z) [装置] 変異の母集団 — 配信中の tavern.html から解放の鎖を 6 組読めている',
        negTav.status === 200 && negTav.rows.length === 6,
        'status=' + negTav.status + ' 組数=' + negTav.rows.length
        + ' order=' + JSON.stringify(negTav.order));

      for (const k of MUT_IMPL) {
        const mt = MUTATIONS[k];
        const port = PORT_OF[k];
        const negErrs = [];
        const m = await negMeasure(browser, port, negErrs, negTav, mt.need);
        /* ⭐ 評価できる assert を **全部** 1 度ずつ回してから合否を組む。
           こうすると「担当の節が赤い」だけでなく「他にどこが赤くなったか」まで証拠に残る。 */
        const res = {};
        for (const key of mt.evaluable) {
          try { res[key] = ASSERT_OF[key][2](m); }
          catch (e) { res[key] = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
        }
        for (const key of mt.targets) {
          const r = res[key] || [true, '⛔ evaluable に載っていない = この変異では測っていない'];
          check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる — '
            + ASSERT_OF[key][1].slice(0, 60),
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        const red = mt.evaluable.filter(key => res[key][0] === false);
        const extra = red.filter(key => mt.targets.indexOf(key) < 0);
        const unexpected = extra.filter(key => (mt.allowRed || []).indexOf(key) < 0);
        /* ⭐ 「効きすぎていないこと」まで見る。⚠ 依頼書 §8 の表は **赤くなるべき節を最小限**
           しか書いていないので、余分に赤くなる節は allowRed で明示的に許可して証拠へ出す
           (例: enterprop は (5b) だけでなく (5a) も赤くなる — 恒等ハッシュが enter の有無を含む)。 */
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない'
          + ' (見た節=' + mt.evaluable.join('/') + ')',
          unexpected.length === 0,
          '赤=' + (red.length ? red.join(',') : '(無し)')
          + '  担当=' + mt.targets.join(',')
          + '  想定内の巻き添え=' + ((mt.allowRed || []).length ? mt.allowRed.join(',') : '(無し)')
          + '  緑のまま=' + (mt.evaluable.filter(x => red.indexOf(x) < 0).join(',') || '(無し)')
          + (unexpected.length ? '  ⛔ 想定外の巻き込み=' + unexpected.join(',') : '')
          + (negErrs.length ? '  [変異ページのエラー ' + negErrs.length + ' 件: '
            + negErrs.slice(0, 2).join(' | ') + ']' : ''));
      }

      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⭐ 項目 4 の完了条件 = ここが 0 件)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → ' + MUTATIONS[k].targets.map(t => '(' + t + ')').join('')
            + ' が赤くなる  [' + MUTATIONS[k].file + ']', MUTATIONS[k].why);
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
