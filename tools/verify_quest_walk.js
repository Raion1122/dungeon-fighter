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
 *   ⚠ 10 本とも **項目 4 の担当**。今は名前と担当節だけ宣言し、PENDING を出す。
 *
 *   mutate     | 注入する欠陥                                          | 赤くなるべき節 | 状態
 *   blockwalk  | ⭐⭐⭐ 罠 A の再現 — 未解放ノードを EDGES から外す      | (2c) / (2d)    | PENDING
 *   eatquery   | ⭐⭐⭐ 罠 B の再現 — autoplay 付きでも地図を挟む        | (4d)           | PENDING
 *   pier       | 罠 C の再現 — exitVia を書かずに world.html へ飛ぶ     | (1a)           | PENDING
 *   showall    | 未解放でも札を出す                                    | (2a) / (2b)    | PENDING
 *   enterany   | questDest の一致を見ずにどの拠点でも入れる            | (3d)           | PENDING
 *   eatdest    | world.html が questDest を読む **前**に消す           | (3a) / (3b)    | PENDING
 *   chaindrift | UNLOCK の 1 本を隣へずらす                            | (2z)           | PENDING
 *   nodialog   | 確認をはさまず即遷移する                              | (3a) / (3c)    | PENDING
 *   asktop     | ダイアログを visibility:hidden で隠す                  | (3e)           | PENDING
 *   enterprop  | NODES の 6 拠点へ enter: "index.html" を足して実装する | (5b)           | PENDING
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
const MUTATIONS = {
  blockwalk: {
    impl: false, file: 'world.html', targets: ['2c', '2d'],
    why: '項目 4。⭐⭐⭐ 依頼書 §2-2 罠 A の機械証明 — 未解放ノードを EDGES から外して歩けなくすると、'
      + 'cleared=[] のゲーム開始直後に phlan から mine へ到達できず **詰む**。'
      + '街道網は環状なので 1 つ消しただけでは切れず、単体テストは永久に緑になる。',
  },
  eatquery: {
    impl: false, file: 'tavern.html', targets: ['4d'],
    why: '項目 4。⭐⭐⭐ 依頼書 §2-3 罠 B の機械証明 — autoplay/evade が付いていても地図を挟む。'
      + 'probe_s2_clear.js / sweep_recruit_balance.js がここで死ぬ (長尺なので身代わりが (4d))。',
  },
  pier: {
    impl: false, file: 'tavern.html', targets: ['1a'],
    why: '項目 4。依頼書 §2-4 罠 C — exitVia を書かずに world.html へ飛ぶと '
      + 'world.html が空の exitVia を "title" と読み、spawnFor が **pier (桟橋)** を返す。'
      + '酒場から出たのに桟橋に立つ。',
  },
  showall: {
    impl: false, file: 'world.html', targets: ['2a', '2b'],
    why: '項目 4。未解放でも札を出す = 隠していない。ドラゴンの巣の地名が初回起動から漏れる。',
  },
  enterany: {
    impl: false, file: 'world.html', targets: ['3d'],
    why: '項目 4。questDest の一致を見ずにどの拠点でも入れる = 受注していない地へ潜れる。',
  },
  eatdest: {
    impl: false, file: 'world.html', targets: ['3a', '3b'],
    why: '項目 4。world.html が questDest を読む **前**に消す = 受注中なのに入れない。',
  },
  chaindrift: {
    impl: false, file: 'js/world-map.js', targets: ['2z'],
    why: '項目 4。UNLOCK の 1 本を隣へずらす (orc-fort → bandits-forest)。'
      + '⭐ 意図的に重複させた鎖が黙ってドリフトした状態 = (2z) の照合だけが気づける。',
  },
  nodialog: {
    impl: false, file: 'world.html', targets: ['3a', '3c'],
    why: '項目 4。確認をはさまず即遷移する = 誤タップで潜行が始まる (ユーザー決定 2026-08-25 の反転)。',
  },
  asktop: {
    impl: false, file: 'world.html', targets: ['3e'],
    why: '項目 4。ダイアログを visibility:hidden で隠す = 常に最前面に残り、'
      + '札の中心の elementFromPoint がダイアログに食われる (#15 の town.html で踏んだ罠と同型)。',
  },
  enterprop: {
    impl: false, file: 'js/world-map.js', targets: ['5b'],
    why: '項目 4。NODES の 6 拠点へ enter:"index.html" を足して実装する = '
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
      };
    }
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
// 受入条件 (⭐ 1 つの assert = 1 つの純粋な述語。素でも変異でも同じ式を回す)
//  形: [id, 文面, 述語 or null, PENDING の理由 or undefined]
//  ⚠ **文面は依頼書 §8 の原文を写す。言い換えない**
//    (後続項目が「どれを埋めるか」を文面で照合するため)。
// ══════════════════════════════════════════════════════════════════════════════
const P2 = '項目 2 (tavern.html — 出発を地図へ回す) が実装したら埋める';
const P3 = '項目 3 (world.html — 隠す / 入る / 確認する) が実装したら埋める';
const P4 = '項目 4 (負のコントロール + 仕上げ) が実装する';

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
      return [lo.signCount !== hi.signCount,
        '0本=' + lo.signCount + ' 枚 / 6本=' + hi.signCount + ' 枚'];
    },
    '⭐ 式は書いてあるが world.html が未実装なので **必ず 7 = 7** になる (world.html:552'
    + '「⛔ 札に状態を持たせない。v1 は常に 7 枚とも出す」)。緑にすれば嘘・赤にすれば未実装を'
    + '退行と読み違えるので PENDING。項目 3 の実装後に ' + P4],

  // ── §1 出発の導線 ──────────────────────────────────────────────────────────
  ['1a', '★酒場で廃坑を受注 → 準備 → #btnDepart → world.html に着き、location.search === ""'
    + ' ⭐ 2 経路で突き合わせる: page.url() と、着地後の __world.heroNode() が "phlan" であること'
    + ' (§2-4 罠 C の裏返し)', null, P2],
  ['1b', '★departToScenario が書く既存キーが 地図に着いた後も全部生きている:'
    + ' currentScenario / partyMembers / partyComposition / questFlags / exitVia (= "tavern") /'
    + ' 新設 questDest (= "goblin-mine")。⛔ lastResult / enterVia は getItem すらしていない', null, P2],
  ['1c', '生成クエスト (掲示板 / 闇市) で出発 → index.html へ直行し、questDest が書かれない'
    + ' (ユーザー決定「据え置き」の機械化)', null, P2],

  // ── §2 未解放の不可視 ──────────────────────────────────────────────────────
  ['2z', '★js/world-map.js の UNLOCK が、配信中の tavern.html の scenarios[] から読み取った'
    + ' locked / unlockAfter と 1 文字違わず一致 (別ファイルの実体どうしの照合)', null, P3],
  ['2a', '★cleared = [] のとき、札は 港町フランと廃坑の 2 枚だけ。未解放 5 拠点は'
    + ' .worldSign が 0 枚・.worldNode-site でなく .worldNode-way・title 属性が空', null, P3],
  ['2b', 'cleared を 0 → 1 → 2 → 3 → 4 → 5 本と伸ばすと、札が 2 → 3 → 4 → 5 → 6 → 7 枚へ'
    + ' 1 枚ずつ増える (6 段階を実測。順序も UNLOCK の鎖どおり)', null, P3],
  ['2c', '★★★ 未解放でも歩ける。cleared = [] の状態で、本番の WORLD_MAP.findPath("phlan", X) が'
    + ' 14 ノードすべてに対して null を返さない ⭐ 特に mine と temple を名指しで見る'
    + ' (§2-2 の詰みが起きていない証明)', null, P3],
  ['2d', '未解放拠点を実クリック → 歩けて、そのノードに立つ (__world.heroNode() が一致)。'
    + ' 遷移も確認ダイアログも起きない', null, P3],

  // ── §3 受注地のクリック ────────────────────────────────────────────────────
  ['3z', '[装置] questDest = "goblin-mine" を仕込んだ状態で測っている (__world.questDest() で確認)', null, P3],
  ['3a', '★受注地 (廃坑) の札をタップ → 確認ダイアログが出る (__world.askOpen() が true)。'
    + ' 文言に NODES.mine.label (= 「廃坑」) がそのまま入っている (⛔ 写経していない)', null, P3],
  ['3b', '★「入る」→ index.html へ遷移し、location.search === ""。かつ questDest が消費されている'
    + ' (sessionStorage に無い)。⭐ currentScenario / partyMembers は生きたまま', null, P3],
  ['3c', '「やめる」→ world.html のまま・ダイアログが閉じ・questDest は残る', null, P3],
  ['3d', '★受注していない解放済み拠点 (例: cleared を 6 本にしたうえで questDest = "goblin-mine" の'
    + 'まま森をタップ) → 歩くだけ・遷移せず・確認も出ない', null, P3],
  ['3e', '確認ダイアログが閉じているとき、7 枚の札の中心の elementFromPoint が 自分自身か子孫'
    + ' (#21 の (7d) を壊していない = ダイアログが display:none である証明)', null, P3],

  // ── §4 撤退 ────────────────────────────────────────────────────────────────
  ['4a', 'tavern.html?questwalk=0 で受注 → 出発 → index.html へ直行。questDest が無い', null, P2],
  ['4b', 'world.html?questwalk=0 → 札が 7 枚とも出る (cleared = [] でも)。'
    + ' 港町フラン以外はどれも遷移しない = #21 の (7e) と同じ姿', null, P2],
  ['4c', '?questwalk=0 を付けた後、クエリ無しで開き直しても撤退が効いている'
    + ' (sessionStorage へ写せている)。⭐ 同じタブで測る', null, P2],
  ['4d', '★★★ tavern.html?autoplay=10 で出発 → index.html へ直行し、location.search に'
    + ' autoplay=10 が残っている (§2-3 罠 B の直接の検査。probe_s2_clear.js /'
    + ' sweep_recruit_balance.js の身代わり)', null, P2],
  ['4e', '?world=0 が立っているとき、出発は index.html 直行 (依頼を持ったまま街に落ちない)', null, P2],

  // ── §5 恒等 (非退行) ───────────────────────────────────────────────────────
  ['5a', 'WORLD_MAP.NODES / EDGES / SITES の中身が 1 件も変わっていない'
    + ' (件数・キー・座標・enter の有無をハッシュで固定)', null, P3],
  ['5b', 'enter を持つノードは 今も phlan ただ 1 つ'
    + ' (⛔ 受注地の入場を NODES.enter で実装していないことの証明)', null, P3],
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
