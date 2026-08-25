#!/usr/bin/env node
/*
 * verify_world_map.js — 地方全景 (ワールドマップ) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-25_world-map-entry.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§8 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる (依頼書 #19 でこの型が停止 0 回で完走した)。
 *
 * ■ 現時点で実際に測れるもの (項目 1 = データ層)
 *   world.html はまだ無い。よってドライバは **自前の最小ハーネスページ**
 *   `/__world_probe__.html` (メモリ上で組み立てて配信) に `js/world-map.js` だけを載せ、
 *   `window.WORLD_MAP` を直に測る。
 *     (0a) 母集団   … NODES / EDGES が空でない  ← これが無いと以降が全部空振りで永久緑
 *     (1a) 水       … 全ノード + 全エッジ (16px 刻み) の周囲 32px 角の水率 < 40%
 *     (1b) 対照     … 海 / 湖が水と判定される  ← 検出器が全部 0 を返していないことの証明
 *     (3a) 到達性   … phlan から全ノードへ **本番の WORLD_MAP.findPath** が null を返さない
 *     (4s) SITES    … tavern.html の実体から抜いたシナリオ id 集合と完全一致し、
 *                      値は全部 kind:"site" の実在ノード
 *     (7a) 札の文言 … **配信中の tavern.html の `place:`** と 1 文字違わず一致
 *     (7b) 札の枚数 … kind:"site" がちょうど 7 / enter を持つのは 1 つだけ (データ側)
 *     (7c) 札の間隔 … 札どうし & 札と「絵に描かれた集落」が 96px 以上
 *
 * ■ ⭐⭐⭐ 空振りを防ぐ仕掛け
 *   - 到達可能性は **自前で BFS を書かない**。`WORLD_MAP.findPath` をブラウザで呼ぶ
 *     (近傍の定義が違うだけで「歩けない道」を永久に緑と報告する恒久教訓)。
 *     ⭐ さらに「存在しないノードへは null を返す」対照を置く (常に非 null なら無力)。
 *   - 水は **人が置いたノード座標** x **codex1 が描いた画素** = 別々の作者のデータで突き合わせる。
 *     ⭐ (1b) が無いと、検出器が全部 0 を返していても (1a) が緑になる。
 *   - 札の文言は **ドライバに写経しない**。`tavern.html` を配信から読んで
 *     `id:"…" , place:"…"` を抜き、`WORLD_MAP` 側と突き合わせる = 別ファイルの実体どうし。
 *   - (7c) は「例外」を作らずに **両方向**で測る:
 *     6 つのシナリオ札は描かれた集落から 96px 以上離れ、
 *     唯一 enter を持つ札 (港町) は逆に描かれた港町の **96px 以内**に在ること。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   ルート線の色 / 太さ / 点の間隔・ノードの px 座標そのもの・`BGM_FILES.world.volume`・
 *   既存 10 曲の volume・札の説明文 (`desc`)。
 *   ⛔ **道マスクは受入条件にしない** (依頼書 §2-6: 東半分の岩肌が道と同じ色域に入る)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   port  | mutate     | 注入する欠陥                                 | 赤くなるべき節   | 状態
 *   9120  | (素)       | —                                            | —                | —
 *   9121  | sinkroute  | swamp を湖の中心 (736,480) へ移す            | (1a) / (3a) は緑 | 実装済
 *   9120  | nowater    | **ドライバの水検出器**が常に 0 を返す         | (1b) のみ        | 実装済
 *   9122  | labeldrift | mine の label を「古い坑道」へ                | (7a) のみ        | 実装済
 *   9123  | crowdsign  | temple を mine の隣 (1120,416) へ寄せる       | (7c-1) / 他は緑  | 実装済
 *   —     | eatvia     | world.html に exitVia の removeItem を足す    | (4a) / (4b) は緑 | **PENDING**
 *   —     | eatresult  | world.html に lastResult の removeItem を足す | (4c) のみ        | **PENDING**
 *   —     | maskdrift  | 描画側の線だけ +12px ずらす (グラフは触らない) | (2b) / (3a) は緑 | **PENDING**
 *   —     | earlyworld | dfReturnPage の off 判定より前に world を返す  | (6c)             | **PENDING**
 *   —     | silent     | world.html の playBgm 呼び口を 2 本とも消す    | (8a)(8b)         | **PENDING**
 *   —     | spyonly    | pointerdown 側の unlock() だけ消す             | (8a) は緑 /(8b)  | **PENDING**
 *
 *   ⚠ nowater だけは **配信の差し替えではなくドライバ内の差し替え**にしてある。
 *     水検出器はドライバ側に居るので、配信スナップショットを差し替えても届かない
 *     (「その assert は配信を読むのかディスクを読むのか」を必ず確認する、の実践)。
 *   ⚠ 変異アンカーは **部分文字列一致**で、配信スナップショット中に **ちょうど 1 箇所**
 *     ヒットしなければ **exit 3 でドライバごと死ぬ** (0 件でも 2 件以上でも空振りするため)。
 *
 * 使い方:
 *   node tools/verify_world_map.js               # 受入条件 (素の配信)
 *   node tools/verify_world_map.js --negative    # 負のコントロール (赤くならなければ exit 1)
 *   node tools/verify_world_map.js --mutate sinkroute   # 変異を手回しで 1 つだけ載せる
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
/* ⚠ ポートは既存ドライバと空ける。9100-9105 = driver_bgm_town / 9110-9114 = driver_bgm_title。
 *   9120-9130 が空いていることは tools 全体のポート直書きの数え上げで実測済み。 */
const PORT = parseInt(arg('port', '9120'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* 罠: 線を絵の水面へ引いてしまう。⭐ グラフの繋がりは 1 本も変えないので (3a) は緑のまま。 */
  sinkroute: {
    impl: true, file: 'js/world-map.js', targets: ['1a'],
    from: '    swamp:     { kind: "site", x:  544, y: 672, label: "沼地", desc: "湖の西に沈む湿地" },',
    to: '    swamp: { kind: "site", x: 736, y: 480, label: "沼地", desc: "湖の西に沈む湿地" },   /* mut-sinkroute 湖の中心へ沈めた */',
  },
  /* ⭐ 検出器そのものを殺す変異。(1a) は「40% 未満」なので全部 0 でも緑 = (1b) だけが気づける。 */
  nowater: { impl: true, driver: true, targets: ['1b'] },
  /* 意図的に重複させた文言 (tavern.html の place: の写し) が黙ってドリフトした状態。 */
  labeldrift: {
    impl: true, file: 'js/world-map.js', targets: ['7a'],
    from: '    mine:      { kind: "site", x: 1056, y: 352, label: "廃坑", desc: "雪山の麓に口を開けた坑道" },',
    to: '    mine: { kind: "site", x: 1056, y: 352, label: "古い坑道", desc: "雪山の麓に口を開けた坑道" },   /* mut-labeldrift */',
  },
  /* 札が寄りすぎて絵の中で潰れる。⭐ 水にも掛からず繋がりも変えないので (1a)(3a) は緑のまま。 */
  crowdsign: {
    impl: true, file: 'js/world-map.js', targets: ['7c-1'],
    from: '    temple:    { kind: "site", x: 1184, y: 416, label: "地下神殿", desc: "雪山の谷あいに埋もれた神殿" },',
    to: '    temple: { kind: "site", x: 1120, y: 416, label: "地下神殿", desc: "雪山の谷あいに埋もれた神殿" },   /* mut-crowdsign 廃坑の隣へ寄せた */',
  },
  /* ── ここから下は項目 2〜4 の担当。枠だけ宣言して PENDING を出す ───────────── */
  eatvia: { impl: false, targets: ['4a'], why: '項目 3: world.html が exitVia を消さないこと' },
  eatresult: { impl: false, targets: ['4c'], why: '項目 3: world.html が lastResult を消さないこと' },
  maskdrift: { impl: false, targets: ['2b'], why: '項目 2: 点線の描画が EDGES と同一データであること' },
  earlyworld: { impl: false, targets: ['6c'], why: '項目 3: dfReturnPage の判定順 (?town=0 が先)' },
  silent: { impl: false, targets: ['8a', '8b'], why: '項目 4: world.html の playBgm 呼び口 2 本' },
  spyonly: { impl: false, targets: ['8b'], why: '項目 4: pointerdown 側の unlock() (経路 B)' },
};
const MUT_ORDER = ['sinkroute', 'nowater', 'labeldrift', 'crowdsign',
  'eatvia', 'eatresult', 'maskdrift', 'earlyworld', 'silent', 'spyonly'];
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

/* ⭐ world.html はまだ無い (項目 2 の担当) ので、データ層だけを載せる最小ハーネスを配る。
 *   ⚠ 同一オリジンで配ること。別オリジンから画像を読むと canvas が汚染されて
 *      getImageData が SecurityError になり、水の測定が丸ごと空振りする。 */
const PROBE_PATH = '/__world_probe__.html';
const PROBE_HTML = '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
  + '<title>world-map probe</title></head><body>'
  + '<script src="js/world-map.js"></' + 'script>'
  + '</body></html>';

function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/' || u === PROBE_PATH) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(PROBE_HTML); return;
        }
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

/* ⭐ 「絵に描かれた集落」の位置 (依頼書 §2-5 が原寸 px から実測してタイル換算したもの)。
 *   ⚠ これは **codex1 が描いた絵の事実**であって、人が置いたノード座標とは別の作者のデータ。
 *      だから (7c) は「写経どうしの突き合わせ」にならない。単位はタイル (x64 で px)。 */
const DRAWN_SETTLEMENTS = [
  { name: '北の農村', tx: 9.5, ty: 3.5 },
  { name: '東の湖畔村', tx: 16.5, ty: 8.0 },
  { name: '南の森の村', tx: 11.0, ty: 13.0 },
  { name: '港町', tx: 5.5, ty: 8.5 },
];
const HARBOR = DRAWN_SETTLEMENTS[3];
const MIN_SIGN_GAP = 96;      // 1.5 タイル (依頼書 §8 (7c))
const WATER_MAX = 0.40;       // 依頼書 §8 (1a)

// ══════════════════════════════════════════════════════════════════════════════
// 観測 (⭐ 素でも変異でも **この同じ関数**を回す)
// ══════════════════════════════════════════════════════════════════════════════
async function measure(browser, port, errs, opts) {
  opts = opts || {};
  const m = { port: port };
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.nowater ? ' nowater' : '') + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PROBE_PATH, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP', { timeout: 20000 });

  m.map = await page.evaluate(() => {
    const WM = window.WORLD_MAP;
    return {
      W: WM.W, H: WM.H,
      nodes: JSON.parse(JSON.stringify(WM.NODES)),
      edges: JSON.parse(JSON.stringify(WM.EDGES)),
      sites: JSON.parse(JSON.stringify(WM.SITES)),
      fnFindPath: typeof WM.findPath === 'function',
      fnNeighbors: typeof WM.neighbors === 'function',
      fnSpawnFor: typeof WM.spawnFor === 'function',
    };
  });

  /* ⭐⭐⭐ 到達性は **本番の findPath をブラウザで呼ぶ**。自前 BFS を書かない。 */
  m.reach = await page.evaluate(() => {
    const WM = window.WORLD_MAP, out = {};
    for (const id of Object.keys(WM.NODES)) {
      const p = WM.findPath('phlan', id);
      out[id] = (p === null) ? null : p.length;
    }
    const self = WM.findPath('phlan', 'phlan');
    return {
      paths: out,
      nullProbe: WM.findPath('phlan', '__no_such_node__') === null,
      selfEmpty: Array.isArray(self) && self.length === 0,
    };
  });

  /* 立ち位置の fail-safe。⚠ シナリオ id はドライバに写経せず tavern.html 由来のものを渡す。 */
  m.spawn = await page.evaluate((scenIds) => {
    const WM = window.WORLD_MAP;
    const byScen = {};
    for (const s of scenIds) byScen[s] = WM.spawnFor('dungeon', s);
    return {
      title: WM.spawnFor('title'),
      byScen: byScen,
      unknownVia: WM.spawnFor('__nope__'),
      missingVia: WM.spawnFor(),
      dungeonUnknownScen: WM.spawnFor('dungeon', '__nope__'),
    };
  }, opts.scenIds || []);

  /* ── 水 (経路 2 = codex1 が描いた画素) ─────────────────────────────────────
   *  依頼書 §2-6 の式:  水 = (B > R+18) && (B >= G)  →  MedianFilter(5)
   *  ⚠ boolean の median は 5x5 の多数決 (25 個中 13 個以上) と同値。
   *  ⚠ nowater 変異は **この検出器**を常に 0 にする (配信ではなくドライバ内の差し替え)。 */
  m.water = await page.evaluate(async (noWater) => {
    const WM = window.WORLD_MAP;
    const img = await new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = 'assets/world_region.jpg';
    });
    if (!img) return { ok: false, err: 'assets/world_region.jpg が読めない' };
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, W, H).data; }
    catch (e) { return { ok: false, err: 'getImageData: ' + String(e && e.message) }; }

    const N = W * H;
    const raw = new Uint8Array(N);
    if (!noWater) {
      for (let i = 0, p = 0; p < N; i += 4, p++) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (b > r + 18 && b >= gg) raw[p] = 1;
      }
    }
    // 5x5 の多数決 (分離可能な 2 パス)。端は edge クランプ。
    const hs = new Int32Array(N);
    for (let y = 0; y < H; y++) {
      const off = y * W;
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) { let xx = x + k; if (xx < 0) xx = 0; else if (xx >= W) xx = W - 1; s += raw[off + xx]; }
        hs[off + x] = s;
      }
    }
    const med = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) { let yy = y + k; if (yy < 0) yy = 0; else if (yy >= H) yy = H - 1; s += hs[yy * W + x]; }
        med[y * W + x] = (s >= 13) ? 1 : 0;
      }
    }
    const frac = (cx, cy) => {                       // 周囲 32px 角
      const x0 = Math.max(0, Math.round(cx) - 16), x1 = Math.min(W, Math.round(cx) + 16);
      const y0 = Math.max(0, Math.round(cy) - 16), y1 = Math.min(H, Math.round(cy) + 16);
      let c = 0;
      for (let y = y0; y < y1; y++) { const off = y * W; for (let x = x0; x < x1; x++) c += med[off + x]; }
      return c / ((x1 - x0) * (y1 - y0));
    };
    const nodes = {};
    for (const id of Object.keys(WM.NODES)) { const n = WM.NODES[id]; nodes[id] = frac(n.x, n.y); }
    const edges = [];
    for (const e of WM.EDGES) {
      const a = WM.NODES[e[0]], b = WM.NODES[e[1]];
      if (!a || !b) { edges.push({ edge: e[0] + '-' + e[1], broken: true, max: 1, pts: 0 }); continue; }
      const len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
      const steps = Math.max(1, Math.floor(len / 16));       // 16px 刻み
      let mx = 0, at = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const f = frac(x, y);
        if (f > mx) { mx = f; at = [Math.round(x), Math.round(y)]; }
      }
      edges.push({ edge: e[0] + '-' + e[1], len: Math.round(len * 10) / 10, pts: steps + 1, max: mx, at: at });
    }
    return {
      ok: true, W: W, H: H, nodes: nodes, edges: edges,
      sea: frac(64, 544),          // 対照: 海
      lake: frac(736, 480),        // 対照: 湖の中心
      edgePts: edges.reduce((s, e) => s + e.pts, 0),
    };
  }, !!opts.nowater);

  await page.close();
  return m;
}

/* ⭐ 札の文言の唯一の正 = 配信中の tavern.html の実体。⛔ ドライバに文字列を写経しない。 */
async function readTavernPlaces(port) {
  const r = await httpGet('http://localhost:' + port + '/tavern.html');
  const re = /id:\s*"([a-z0-9-]+)"\s*,\s*place:\s*"([^"]+)"/g;
  const map = {}; const order = [];
  let mm;
  while ((mm = re.exec(r.body)) !== null) { map[mm[1]] = mm[2]; order.push(mm[1]); }
  return { status: r.status, bytes: r.body.length, map: map, order: order };
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (⭐ 1 つの assert = 1 つの純粋な述語。素でも変異でも同じ式を回す)
// ══════════════════════════════════════════════════════════════════════════════
const px = (t) => t * 64;
const hypot = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const siteIds = (m) => Object.keys(m.map.nodes).filter(id => m.map.nodes[id].kind === 'site');
const enterIds = (m) => Object.keys(m.map.nodes).filter(id => m.map.nodes[id].enter !== undefined);

const ASSERTS = [
  // ── §0 装置 ────────────────────────────────────────────────────────────────
  ['0a', '[装置] WORLD_MAP.NODES / EDGES が 0 件でない (これが無いと以降の全 assert が空振りで永久緑)',
    m => [Object.keys(m.map.nodes).length > 0 && m.map.edges.length > 0,
      'nodes=' + Object.keys(m.map.nodes).length + ' edges=' + m.map.edges.length]],
  ['0d', '[装置] 公開シグネチャが揃っている (findPath / neighbors / spawnFor)',
    m => [m.map.fnFindPath && m.map.fnNeighbors && m.map.fnSpawnFor,
      JSON.stringify({ findPath: m.map.fnFindPath, neighbors: m.map.fnNeighbors, spawnFor: m.map.fnSpawnFor })]],

  // ── §1 ルートは水の上を通らない ────────────────────────────────────────────
  ['1z', '[装置] 絵の画素を実際に読めて、サンプル点の母集団が空でない',
    m => [m.water.ok === true && m.water.edgePts >= 100 && Object.keys(m.water.nodes).length === Object.keys(m.map.nodes).length,
      m.water.ok ? ('edgePts=' + m.water.edgePts + ' nodes=' + Object.keys(m.water.nodes).length
        + ' img=' + m.water.W + 'x' + m.water.H) : String(m.water.err)]],
  ['1a', '全ノード + 全エッジ (16px 刻み) の周囲 32px 角の水率が 40% 未満 (⛔ 例外なし)',
    m => {
      if (!m.water.ok) return [false, String(m.water.err)];
      const badN = Object.keys(m.water.nodes).filter(id => m.water.nodes[id] >= WATER_MAX)
        .map(id => id + '=' + (m.water.nodes[id] * 100).toFixed(1) + '%');
      const badE = m.water.edges.filter(e => e.max >= WATER_MAX)
        .map(e => e.edge + '=' + (e.max * 100).toFixed(1) + '%@' + JSON.stringify(e.at));
      let worst = 0, who = '-';
      for (const id of Object.keys(m.water.nodes)) if (m.water.nodes[id] > worst) { worst = m.water.nodes[id]; who = 'node:' + id; }
      for (const e of m.water.edges) if (e.max > worst) { worst = e.max; who = 'edge:' + e.edge; }
      return [badN.length === 0 && badE.length === 0,
        '最悪 ' + (worst * 100).toFixed(1) + '% (' + who + ')'
        + (badN.length + badE.length ? '  ⛔ ' + badN.concat(badE).join(' ') : '')];
    }],
  ['1b', '[対照] 海 (64,544) の水率 > 90% / 湖の中心 (736,480) > 60% (検出器が全部 0 を返していない)',
    m => [m.water.ok === true && m.water.sea > 0.90 && m.water.lake > 0.60,
      m.water.ok ? ('海=' + (m.water.sea * 100).toFixed(1) + '% 湖=' + (m.water.lake * 100).toFixed(1) + '%')
        : String(m.water.err)]],

  // ── §3 歩ける / 歩けない ───────────────────────────────────────────────────
  ['3z', '[装置] findPath が「存在しないノード」には null を返し、同じノードには [] を返す (常に非 null ではない)',
    m => [m.reach.nullProbe === true && m.reach.selfEmpty === true,
      'nullProbe=' + m.reach.nullProbe + ' selfEmpty=' + m.reach.selfEmpty]],
  ['3a', 'phlan から全ノードへ本番の WORLD_MAP.findPath が null を返さない (孤立ノード 0 件)',
    m => {
      const bad = Object.keys(m.reach.paths).filter(id => m.reach.paths[id] === null);
      return [bad.length === 0 && Object.keys(m.reach.paths).length === Object.keys(m.map.nodes).length,
        '到達 ' + (Object.keys(m.reach.paths).length - bad.length) + '/' + Object.keys(m.map.nodes).length
        + (bad.length ? '  ⛔ 孤立=' + bad.join(',') : '')];
    }],

  // ── §4 立ち位置 / SITES の健全性 ───────────────────────────────────────────
  ['4s-1', 'WORLD_MAP.SITES のキー集合が tavern.html のシナリオ id 集合と完全一致 (⛔ ドライバに写経しない)',
    m => {
      const a = Object.keys(m.map.sites).slice().sort();
      const b = Object.keys(m.tavern.map).slice().sort();
      return [a.length > 0 && JSON.stringify(a) === JSON.stringify(b),
        'world=' + JSON.stringify(a) + ' tavern=' + JSON.stringify(b)];
    }],
  ['4s-2', 'SITES の値が全部 NODES に実在し、かつ kind === "site" (依頼書 §5-3 の存在しない id の訂正)',
    m => {
      const bad = Object.keys(m.map.sites).filter(k => {
        const n = m.map.nodes[m.map.sites[k]];
        return !n || n.kind !== 'site';
      }).map(k => k + '->' + m.map.sites[k]);
      return [Object.keys(m.map.sites).length > 0 && bad.length === 0,
        bad.length ? '⛔ ' + bad.join(' ') : JSON.stringify(m.map.sites)];
    }],
  ['4s-3', 'spawnFor の fail-safe: 未知の via / 欠損 / 未知のシナリオ id は phlan、title は pier',
    m => {
      const s = m.spawn;
      const ok = s.title === 'pier' && s.unknownVia === 'phlan' && s.missingVia === 'phlan'
        && s.dungeonUnknownScen === 'phlan'
        && Object.keys(s.byScen).length > 0
        && Object.keys(s.byScen).every(k => s.byScen[k] === m.map.sites[k]);
      return [ok, JSON.stringify(s)];
    }],

  // ── §7 拠点の札 ────────────────────────────────────────────────────────────
  ['7z', '[装置] 配信中の tavern.html から id/place を 6 組以上抜けている (正規表現が空振りしていない)',
    m => [m.tavern.status === 200 && m.tavern.bytes > 100000 && m.tavern.order.length >= 6,
      'status=' + m.tavern.status + ' bytes=' + m.tavern.bytes + ' pairs=' + m.tavern.order.length
      + ' ' + JSON.stringify(m.tavern.map)]],
  ['7a', '★6 つの label が tavern.html の place: と 1 文字違わず一致する (別ファイルの実体どうしの照合)',
    m => {
      const bad = [];
      for (const k of Object.keys(m.map.sites)) {
        const n = m.map.nodes[m.map.sites[k]];
        const want = m.tavern.map[k];
        if (!n || want === undefined || n.label !== want) bad.push(k + ': world="' + (n && n.label) + '" tavern="' + want + '"');
      }
      return [Object.keys(m.map.sites).length > 0 && bad.length === 0,
        bad.length ? '⛔ ' + bad.join(' / ') : Object.keys(m.map.sites).length + ' 件一致'];
    }],
  ['7b-data', 'kind === "site" がちょうど 7 件 / enter を持つのはただ 1 つで、それはシナリオ拠点ではない / enter にクエリが無い',
    m => {
      const sites = siteIds(m), ents = enterIds(m);
      const scenTargets = Object.keys(m.map.sites).map(k => m.map.sites[k]);
      const one = ents.length === 1 ? ents[0] : null;
      const ok = sites.length === 7 && one !== null
        && m.map.nodes[one].kind === 'site'
        && scenTargets.indexOf(one) < 0
        && String(m.map.nodes[one].enter).indexOf('?') < 0;
      return [ok, 'site=' + sites.length + ' enter=' + JSON.stringify(ents)
        + (one ? ' -> "' + m.map.nodes[one].enter + '"' : '')];
    }],
  ['7c-1', '札どうしの距離が 96px 以上',
    m => {
      const ids = siteIds(m), bad = [];
      let mn = Infinity, who = '-';
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = m.map.nodes[ids[i]], b = m.map.nodes[ids[j]];
        const d = hypot(a.x, a.y, b.x, b.y);
        if (d < mn) { mn = d; who = ids[i] + '<->' + ids[j]; }
        if (d < MIN_SIGN_GAP) bad.push(ids[i] + '<->' + ids[j] + '=' + d.toFixed(1) + 'px');
      }
      return [ids.length >= 2 && bad.length === 0,
        '最小 ' + (isFinite(mn) ? mn.toFixed(1) : '-') + 'px (' + who + ')'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['7c-2', '6 つのシナリオ札が「絵に描かれた集落」4 つから 96px 以上離れている',
    m => {
      const targets = Object.keys(m.map.sites).map(k => m.map.sites[k]);
      const bad = []; let mn = Infinity, who = '-';
      for (const id of targets) {
        const n = m.map.nodes[id]; if (!n) continue;
        for (const s of DRAWN_SETTLEMENTS) {
          const d = hypot(n.x, n.y, px(s.tx), px(s.ty));
          if (d < mn) { mn = d; who = id + '<->' + s.name; }
          if (d < MIN_SIGN_GAP) bad.push(id + '<->' + s.name + '=' + d.toFixed(1) + 'px');
        }
      }
      return [targets.length > 0 && bad.length === 0,
        '最小 ' + (isFinite(mn) ? mn.toFixed(1) : '-') + 'px (' + who + ')'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['7c-3', '[対照] 唯一 enter を持つ札は逆に「絵に描かれた港町」の 96px 以内に在る (例外扱いではなく実測で縛る)',
    m => {
      const ents = enterIds(m);
      if (ents.length !== 1) return [false, 'enter=' + JSON.stringify(ents)];
      const n = m.map.nodes[ents[0]];
      const d = hypot(n.x, n.y, px(HARBOR.tx), px(HARBOR.ty));
      return [d < MIN_SIGN_GAP, ents[0] + ' <-> 描かれた港町 = ' + d.toFixed(1) + 'px'];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_worldmap_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  MUT_SERVED.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

  console.log('=== verify_world_map.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   '
    + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
    + '   (nowater はドライバ内の差し替え)');

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });
  const errs = [];

  try {
    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      mark('§0 装置 — 母集団と変異アンカー');
      const tav = await readTavernPlaces(PORT);
      const m = await measure(browser, PORT, errs, { scenIds: tav.order });
      m.tavern = tav;
      for (const key of ['0a', '0d']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      pending('(0b) 素材が 1536x1024 で読めている (naturalWidth/Height を **DOM から**)',
        '項目 2: world.html のステージ DOM が要る (ここでは probe ページの Image でしか読めない)');
      for (const k of MUT_SERVED) {
        check('(0c-' + k + ') [装置] 変異アンカーが ' + MUTATIONS[k].file + ' 内にちょうど 1 箇所ヒットする', true,
          '起動時ガードを通過 (0 件 or 2 件以上なら exit 3)');
      }
      check('(0c-nowater) [装置] nowater はドライバ内の検出器を差し替える (配信アンカー不要)', true,
        '⚠ 水検出器はドライバ側に居るので配信差し替えでは届かない');
      pending('(0c) 残り 6 本の変異アンカーが 1 箇所ヒットする',
        '未実装: ' + MUT_TODO.join(' / ') + ' (world.html / index.html / title.html / audio.js がまだ無い or 未改修)');

      mark('§1 ルートは水の上を通らない (2 経路)');
      for (const key of ['1z', '1a', '1b']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      console.log('       [記録] エッジごとの最大水率:');
      for (const e of (m.water.edges || [])) {
        console.log('         ' + e.edge + '  len=' + e.len + ' pts=' + e.pts + '  max=' + (e.max * 100).toFixed(1) + '%');
      }

      mark('§2 線とグラフが同一データ (罠 C)');
      pending('(2a) 画面に描かれた線分の本数が EDGES.length と一致', '項目 2: world.html の点線描画');
      pending('(2b) 各線分の両端の画面座標が対応する 2 ノード (x zoom) と 2px 以内で一致', '項目 2: world.html の点線描画');

      mark('§3 歩ける / 歩けない');
      for (const key of ['3z', '3a']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      pending('(3b) ノードをタップ → 駒がそのノードの座標に立つ (FOOT=0.93 の接地込み)', '項目 2: world.html の駒');
      pending('(3c) 線の無い座標をタップ → 駒が 1px も動かない', '項目 2: world.html の駒');
      pending('(3d) phlan の札をタップ → 歩いてから town.html へ遷移し location.search が空文字', '項目 3: 遷移');

      mark('§4 一回性のキーを壊していない (罠 A) — 本チケットの核心');
      for (const key of ['4s-1', '4s-2', '4s-3']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      pending('(4a) exitVia="dungeon" で world をロード → 駒は SITES[currentScenario] に立ち、exitVia が残っている',
        '項目 3: world.html。⚠ 期待値は WORLD_MAP.SITES から引くこと (⛔ ノード id を写経しない)');
      pending('(4b) そのまま town.html へ → town が exitVia を消費し主人公が (10,3) 酒場前に立つ', '項目 3: 遷移');
      pending('(4c) lastResult を置いて ダンジョン → world → town → tavern で酒場のリザルト画面が出る', '項目 3: 通し検査');

      mark('§5 compact でも遊べる');
      pending('(5a) 390x844 / 1440x900 の 2 点で 横スクロール無し / 黒帯 5% 未満 / 駒が画面内', '項目 2: world.html の layout()');

      mark('§6 撤退');
      pending('(6a) title.html?world=0 → town.html へ直行 (world.html を経由しない)', '項目 3: title.html');
      pending('(6b) index.html?world=0 の dfReturnPage() → town.html', '項目 3: index.html');
      pending('(6c) title.html?town=0 → tavern.html (?world=0 の有無によらず)', '項目 3: 2x2 の組み合わせ表');

      mark('§7 拠点の札 7 枚');
      for (const key of ['7z', '7a', '7b-data', '7c-1', '7c-2', '7c-3']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      pending('(7b-dom) 札の DOM がちょうど 7 枚で kind==="site" の件数と一致', '項目 3: world.html の立て札');
      pending('(7d) 札の中心の elementFromPoint が自分自身か子孫 (他の要素の下に潜っていない)', '項目 3: 立て札');
      pending('(7e) phlan 以外の札をタップ → 歩くだけで location が変わらない', '項目 3: 立て札');

      mark('§8 BGM (2 経路)');
      pending('(8a) [経路A] ロード時に GameAudio.playBgm へ渡った ID が "world"', '項目 4: audio.js + world.html');
      pending('(8b) [経路B] 最初の pointerdown 後、__bgmFileState() の src に fierd.mp3 / paused:false', '項目 4');
      pending('(8c) BGM_FILES.world の src / credit が assets/bgm/fierd.mp3 / "魔王魂"', '項目 4');

      mark('§9 ページエラー');
      check('(9a) 測定ページで pageerror / console.error が出ていない', errs.length === 0, errs.slice(0, 6).join(' | '));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
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

      mark('欠陥を注入すると担当の節が赤くなること');
      const tav = await readTavernPlaces(PORT);
      for (const k of MUT_IMPL) {
        const negErrs = [];
        const port = MUTATIONS[k].driver ? PORT : PORT_OF[k];
        const m = await measure(browser, port, negErrs, { scenIds: tav.order, nowater: (k === 'nowater') });
        m.tavern = tav;
        for (const key of MUTATIONS[k].targets) {
          const a = ASSERT_OF[key];
          const r = a[2](m);
          check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        /* ⭐ 「効きすぎていないこと」まで見る。担当外の本体 assert は緑のままであるべき。 */
        const collateral = ['0a', '1a', '3a', '7a', '7c-1', '7c-2']
          .filter(key => MUTATIONS[k].targets.indexOf(key) < 0);
        const broke = collateral.filter(key => ASSERT_OF[key][2](m)[0] === false);
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない (0a/1a/3a/7a/7c-1/7c-2 のうち担当外)',
          broke.length === 0, broke.length ? '⛔ 巻き込み=' + broke.join(',') : '巻き込み 0 件');
      }

      mark('まだ実装されていない変異 (項目 2〜4 の担当)');
      for (const k of MUT_TODO) {
        pending('(neg-' + k + ') 変異 ' + k + ' → ' + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
          MUTATIONS[k].why);
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
