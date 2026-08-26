#!/usr/bin/env node
/*
 * verify_tavern_map.js — 銀の鹿亭 tavern.html / js/tavern-map.js の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-26_stag-tavern-dnd-map.md` の §9 受入条件を機械的に測る。
 * 流用元は tools/verify_town_map.js (http 自前配信 + puppeteer-core で実 Chrome 直駆動) と
 * tools/verify_quest_walk.js (PASSED / FAILED / **PENDING** の 3 値表示 + --negative)。
 *
 * ■ 出力は 3 値。完了条件 = **PENDING 0**
 *     PASSED / FAILED / **PENDING**
 *   exit コードは FAILED が 0 件なら 0 (PENDING は 0 のまま通す)。
 *   → 後続項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認できる。
 *
 * ■ ⭐⭐⭐ なぜ「素のスタブページ」を配って測るのか (逃げではなく **2 経路の分離**)
 *   §0(0b)(0c) と §1 が測るのは **データ層**で、これは
 *       js/tavern-map.js + assets/tavern_map.jpg
 *   の 2 つだけで決まる。tavern.html が何を読み込んでいるかとは独立している。
 *   そこでドライバは、ディスクに残さないメモリ上のスタブ
 *       <!doctype html><meta charset="utf-8"><title>probe</title>
 *       <script src="js/tavern-map.js"></script>
 *   を配って、そこで window.TAVERN_MAP を読む。
 *   ⭐ 「tavern.html がそれを実際に読み込んでいるか」は **(0a) が別途**見る。
 *      (0a) は項目 3 で実装する。両方が揃って初めて「載っていて、正しい」が言える。
 *   ⛔ (0a) をデータ層の測定で代用しないこと。#23 で js/world-map.js の <script src> を
 *      書き忘れ、5 本の assert が「何も起きないのに全部緑」になった事故がある。
 *
 * ■ この時点 (依頼書 #25 の項目 1) で **実装済 = 5 本**
 *     (0b) MASK の寸法 / (0c) 絵の実寸 / (1a) 格子の位置合わせ / (1b) enter の通行可否 /
 *     (1c) spawn からの到達塗りつぶし   + 装置 assert (0z1)(0z2)(1z1)(1z2)(0m-*)
 *   §0(0a) と §2〜§7 は **PENDING**。項目 2 で tavern.html を改修した後、項目 3 が埋める。
 *
 * ■ ⚠⚠ 寸法の数は 1 つも直書きしない
 *   ROWS / COLS の期待値 … tools/make_grid_map.py の GRIDS["stag-tavern"]["cells"] から引く
 *   TILE                 … window.TAVERN_MAP.TILE から引く (= 96。⚠ 依頼書 §9 の「64」は
 *                          STEP1 で 96 へ逸脱済みなので誤り。理由は js/tavern-map.js 冒頭)
 *   ⭐ 台帳の tile と TAVERN_MAP.TILE が一致することは (0z2) が 2 経路で突き合わせる。
 *
 * ■ ⚠⚠⚠ (1a) は make_grid_map.py --check ではなく check_grid_alignment.py を使う
 *   2026-08-27 実測: `py tools/make_grid_map.py --check assets/tavern_map.jpg --tile 96` は
 *       NG 縦線: 累積ドリフト 1.22 (許容 4.0) / 位相ズレ 47.50 (許容 2.0) / score比 86.2%
 *       NG 横線: 累積ドリフト 1.46 (許容 4.0) / 位相ズレ 24.50 (許容 2.0) / score比 79.7%
 *   を返す。⭐ ドリフトも score 比も許容内で、落ちているのは **位相ズレだけ**。
 *   これは #24 の罠 H そのもの = 銀の鹿亭の床は板の継ぎ目が 24px (= 1/4 マス) 間隔で走るので、
 *   周期 96 の櫛が位相 0 / 24 / 48 / 72 に等しく当たり、指標が構造的に誤報する。
 *   → #24 でこの誤報のために作られた tools/check_grid_alignment.py を使う。
 *      判定は「位相 0 の相対位置 >= 70%」を縦横の AND。2026-08-27 実測 縦 78.0% / 横 82.5% で OK。
 *   ⭐ --check の測定値も (1a) の detail に出す (ドリフトと score 比は生きた指標なので捨てない)。
 *   ⚠ 子プロセスには PYTHONIOENCODING=utf-8 を渡すこと。cp932 のままだと成功行の "⭐" で
 *     UnicodeEncodeError になり、**両軸 OK なのに exit 1** になる (2026-08-27 実測)。
 *   ⭐ (1z2) が「--shift TILE/4 で NG になる」= 道具が生きていることを毎回証明する。
 *
 * ■ ⭐⭐ 配信バイトの凍結を内蔵している (別窓の並走で測定が汚れない)
 *   起動時に js/tavern-map.js / tavern.html / assets/tavern_map.jpg をディスクから 1 回だけ
 *   読み、以降の配信はそのスナップショットから返す。他のファイルも初回アクセス時に凍結する。
 *   ⭐ 変異も「ディスクを書き換える」のではなく「**配信を差し替える**」(作業ツリーを汚さない)。
 *
 * ■ 使い方
 *     node tools/verify_tavern_map.js
 *     node tools/verify_tavern_map.js --negative        # 負のコントロール (空振り 1 本で exit 1)
 *     node tools/verify_tavern_map.js --mutate gatetable
 *     node tools/verify_tavern_map.js --port 9170 --headful
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

/* ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
 *   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える。 */
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const NEGATIVE = flag('negative');
const HEADFUL  = flag('headful');
const MUTATE   = arg('mutate', null);
/* ⚠ ポートは既存ドライバと空ける。2026-08-27 に tools/*.js のポート直書きを数え上げ、
 *   9161-9179 が 1 本も使われていないことを実測した (9160 = verify_quest_walk)。 */
const PORT = parseInt(arg('port', '9170'), 10);

const MAP_JS      = 'js/tavern-map.js';
const TAVERN_HTML = 'tavern.html';
const MAP_JPG     = 'assets/tavern_map.jpg';
const LEDGER_PY   = 'tools/make_grid_map.py';
const LEDGER_KEY  = 'stag-tavern';

/* データ層だけを載せた素のスタブ。⛔ ディスクに残さない (作業ツリーを汚さない)。 */
const STUB_REL  = '__tavern_map_probe.html';
const STUB_HTML = '<!doctype html><meta charset="utf-8"><title>probe</title>\n'
  + '<script src="' + MAP_JS + '"></script>\n';

// ══════════════════════════════════════════════════════════════════════════════
// 台帳 (tools/make_grid_map.py の GRIDS) から寸法を引く
// ⚠⚠ ドライバに 15 / 10 / 96 / 64 を **1 つも直書きしない**。
//    直書きすると「絵と台帳とマスクが食い違っている」を永久に緑と報告する。
// ══════════════════════════════════════════════════════════════════════════════
function readLedger() {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, LEDGER_PY), 'utf8'); } catch (e) { return null; }
  const i = src.indexOf('"' + LEDGER_KEY + '": {');
  if (i < 0) return null;
  let j = src.indexOf('\n    },', i);
  if (j < 0) j = src.length;
  const body = src.slice(i, j);
  const mc = body.match(/"cells"\s*:\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  const mt = body.match(/"tile"\s*:\s*(\d+)/);
  if (!mc || !mt) return null;
  return { cols: parseInt(mc[1], 10), rows: parseInt(mc[2], 10), tile: parseInt(mt[1], 10) };
}
const LEDGER = readLedger();

// ══════════════════════════════════════════════════════════════════════════════
// 負のコントロール (依頼書 §9 の変異 10 本)
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
//
// 各エントリ:
//   impl      … false = **PENDING** (まだ実装していない)。項目 3 が埋める。
//   file/from/to … 配信スナップショットへの 1 行置換。⚠ ちょうど 1 箇所ヒットが起動時の条件。
//   targets   … 依頼書 §9 の表。**ここが赤くならなければ空振り = exit 1**。
//   evaluable … 変異ポートの測定で **実際に評価できる** assert。
//               ⛔ 測っていない節をここへ書かない (述語が例外 → 一律 false = 偽陽性)。
//   allowRed  … targets 以外で **赤くなるのが正しい**節 (依頼書の表は最小限しか書いていない)。
// ══════════════════════════════════════════════════════════════════════════════
const P3 = '項目 3 で実装 (tavern.html の改修 = 項目 2 待ち)';

const MUTATIONS = {
  nomapjs: { impl: false, file: TAVERN_HTML, targets: ['0a'],
    why: '⭐ #23 で実際に起きた「<script src> を書き忘れて、読み込んでいないのに全部緑」の再現。'
      + ' ' + P3 + ' — 現時点の tavern.html にはまだこの 1 行が無いのでアンカーが存在しない。' },
  reclick: { impl: false, file: TAVERN_HTML, targets: ['3b'],
    why: '⭐⭐⭐ 依頼書 §2-2 罠 A の機械証明。goToTable の "if (walkingTo === t.key) return;" を'
      + '消すと、420ms ごとの再クリックで walkPath が毎回 stopWalk して t0 を打ち直し、'
      + '歩きが再起動し続けて永久に着かない。' + P3 },
  instant: { impl: false, file: TAVERN_HTML, targets: ['3a'],
    why: '卓のクリックで歩かずに即 openDialog にする =「歩いてから開く」が死ぬ。' + P3 },
  gatetable: { impl: true, file: MAP_JS, targets: ['1b', '1c'],
    from: '    { key: "t1", scenarioId: "goblin-mine",    enter: [4, 4], sign: [4, 1] },',
    to:   '    { key: "t1", scenarioId: "goblin-mine", enter: [0, 0], sign: [4, 1] },  /* mut-gatetable: enter を外壁 W へずらす */',
    evaluable: ['0z1', '0b', '0c', '1z1', '1b', '1c'], allowRed: [],
    why: '⚠ 扉システムで踏んだ「出口ゲートタイルに置くと壁に埋まって詰む」の同型。'
      + 'TABLES[0].enter を (0,0) = 外壁 W へずらす。' },
  dropscen: { impl: false, file: TAVERN_HTML, targets: ['6a', '4b'],
    why: '卓を 3 つにするために scenarios から 4〜6 を配列ごと削る誘惑。' + P3 },
  hidelock: { impl: false, file: TAVERN_HTML, targets: ['2d'],
    why: '未解放の卓を DOM に作らない =「次がある」が見えなくなる。' + P3 },
  copyplace: { impl: false, file: MAP_JS, targets: ['2c'],
    why: 'js/tavern-map.js に place の文字列を写して札をそこから描く = 二重管理のドリフト。'
      + '⚠ 変異先は js だが、赤くなる (2c) は tavern.html の描画を見るので ' + P3 },
  gridsize: { impl: true, file: MAP_JS, targets: ['0b'],
    from: '    /* row 5 */ "WC.......TT..CW",',
    to:   '    /* mut-gridsize: row 5 を落として ROWS と食い違わせる */',
    evaluable: ['0z1', '0b', '0c', '1z1', '1b', '1c'], allowRed: ['1b', '1c'],
    /* ⭐ MASK を 1 行削ると行が繰り上がるので、(0b) 以外に (1b)(1c) も必ず赤くなる:
       enter [4,8] と spawn [7,8] が旧 row 9 の外壁へ落ちる。依頼書の表は最小限しか
       書いていないので allowRed で明示的に許可し、証拠へ出す。 */
    why: '絵とマスクの寸法ズレ。MASK を 1 行削って ROWS と食い違わせる。' },
  plazashow: { impl: false, file: TAVERN_HTML, targets: ['4c'],
    why: '闇市の石段を display:none で DOM に残す = 押せてしまう事故の芽。' + P3 },
  noretreat: { impl: false, file: TAVERN_HTML, targets: ['7a', '7b'],
    why: '?tavernmap=0 の分岐を握り潰す = 撤退スイッチが死ぬ。' + P3 },
};
const MUT_ORDER  = ['nomapjs', 'reclick', 'instant', 'gatetable', 'dropscen',
                    'hidelock', 'copyplace', 'gridsize', 'plazashow', 'noretreat'];
const MUT_IMPL   = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_TODO   = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING): ' + MUTATIONS[MUTATE].why);
  process.exit(3);
}

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ 配信バイトの凍結 (依頼書 §9 冒頭)
//   別窓が同じリポジトリを触っても測定が汚れないよう、ディスクから 1 回読んだバイトを保持し、
//   以降の配信はそのスナップショットから返す。⛔ リクエストのたびに読み直さない。
// ══════════════════════════════════════════════════════════════════════════════
const SNAP = new Map();
function frozen(rel) {
  if (SNAP.has(rel)) return SNAP.get(rel);
  let buf = null;
  try {
    const fp = path.join(ROOT, rel);
    if (fp.startsWith(ROOT) && fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) buf = fs.readFileSync(fp);
  } catch (e) { buf = null; }
  SNAP.set(rel, buf);
  return buf;
}
// 起動時に凍結する (= 測定の途中で別窓が書き換えても影響を受けない)
for (const rel of [MAP_JS, TAVERN_HTML, MAP_JPG]) frozen(rel);

/* 変異ソースを先に組み立てる。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。 */
const MUT_SRC = {};
for (const k of MUT_IMPL) {
  const m = MUTATIONS[k];
  const body = frozen(m.file);
  if (body === null) {
    console.error('[drv] ⛔ 変異 ' + k + ' の対象 ' + m.file + ' が読めない'); process.exit(3);
  }
  const src = body.toString('utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する');
    process.exit(3);
  }
  const n = src.split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: src.split(m.from).join(m.to) };
}
const PORT_OF = {};
MUT_IMPL.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

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
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると startServer の
 *   try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
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
        const u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '');
        if (rel === STUB_REL) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(STUB_HTML); return;
        }
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        const buf = frozen(rel);
        if (buf === null) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buf);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uniqNums = (a) => Array.from(new Set(a || []));

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
// 測定 ① データ層 — 素のスタブページに js/tavern-map.js だけを載せて読む
//   ⭐ tavern.html を開かないのは「まだ読み込んでいないから」ではなく、
//     **データ層とページの結線を別々に測る**ため (結線は (0a) の担当)。
// ══════════════════════════════════════════════════════════════════════════════
async function probeStub(browser, base) {
  const out = { pageErrs: [] };
  const page = await browser.newPage();
  page.on('pageerror', e => out.pageErrs.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    let url = '';
    try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ favicon の 404 だけは除く (この 1 本に絞る)
    out.pageErrs.push('console: ' + m.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  await page.goto(base + '/' + STUB_REL, { waitUntil: 'load', timeout: 30000 });

  /* ⚠⚠⚠ 到達可能性は **自前で BFS を書かない**。本番の TAVERN_MAP.findPath をブラウザで呼ぶ
   *   (js/tavern-map.js 冒頭の指示)。近傍の数が違うだけで「歩けない道」を永久に緑と報告する。
   * ⚠ 変異 gridsize は MASK と ROWS を食い違わせるので tileAt が例外を投げうる。
   *   区画ごとに try/catch を分けて、1 か所の例外が他の測定を巻き込まないようにする。 */
  const d = await page.evaluate(() => {
    const o = { has: false, errors: [] };
    const TM = window.TAVERN_MAP;
    if (!TM) return o;
    o.has = true;
    try {
      o.COLS = TM.COLS; o.ROWS = TM.ROWS; o.TILE = TM.TILE;
      o.maskLen = TM.MASK.length;
      o.rowLens = TM.MASK.map(function (s) { return String(s).length; });
    } catch (e) { o.errors.push('dims: ' + e.message); }
    try {
      o.enters = [];
      TM.TABLES.forEach(function (t) {
        o.enters.push({ kind: 'table', key: t.key, sid: t.scenarioId || '', c: t.enter[0], r: t.enter[1] });
      });
      TM.DOORS.forEach(function (dr) {
        o.enters.push({ kind: 'door', key: dr.key, sid: '', c: dr.enter[0], r: dr.enter[1] });
      });
      o.enters.forEach(function (e) {
        try { e.walkable = !!TM.isWalkable(e.c, e.r); }
        catch (ex) { e.walkable = false; e.err = ex.message; }
      });
    } catch (e) { o.errors.push('enters: ' + e.message); }
    try {
      const sp = TM.spawnFor('door');
      o.spawn = [sp.c, sp.r];
      try { o.spawnWalkable = !!TM.isWalkable(sp.c, sp.r); } catch (ex) { o.spawnWalkable = false; }
      const reach = {};
      let walk = 0;
      for (let r = 0; r < TM.ROWS; r++) {
        for (let c = 0; c < TM.COLS; c++) {
          let w = false;
          try { w = !!TM.isWalkable(c, r); } catch (ex) { w = false; }
          if (!w) continue;
          walk++;
          let p = null;
          try { p = TM.findPath(sp.c, sp.r, c, r); } catch (ex) { p = null; }
          if (p !== null) reach[c + ',' + r] = true;
        }
      }
      o.walkable = walk;
      o.reachable = Object.keys(reach).length;
      o.unreached = (o.enters || []).filter(function (e) { return !reach[e.c + ',' + e.r]; })
        .map(function (e) { return e.kind + ':' + e.key + '(' + e.c + ',' + e.r + ')'; });
    } catch (e) { o.errors.push('flood: ' + e.message); }
    return o;
  });

  /* 絵の実寸は **ブラウザに読ませる** (配信できていること自体も同時に測れる)。 */
  const img = await page.evaluate((rel) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res({ ok: false, w: 0, h: 0 });
    im.src = rel + '?t=' + Date.now();
  }), MAP_JPG);

  await page.close();
  return Object.assign(out, d, { img: img });
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ② 焼き込み格子 — py の 2 本を child_process で回す
//   ⚠ `python` は Windows ストアのスタブで exit 49 になる。必ず `py`。
//   ⚠ PYTHONIOENCODING=utf-8 を渡す。cp932 のままだと成功行の "⭐" で UnicodeEncodeError に
//     なり、**両軸 OK なのに exit 1** になる (2026-08-27 実測)。
// ══════════════════════════════════════════════════════════════════════════════
function runPy(args) {
  const env = Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' });
  try {
    const out = execFileSync('py', args, { cwd: ROOT, encoding: 'utf8', env: env });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: (e && typeof e.status === 'number') ? e.status : -1,
             out: String((e && e.stdout) || '') + String((e && e.stderr) || '') };
  }
}
function measureGrid(tile) {
  const t = String(tile);
  const align = runPy(['tools/check_grid_alignment.py', MAP_JPG, '--tile', t]);
  const shift = runPy(['tools/check_grid_alignment.py', MAP_JPG, '--tile', t,
                       '--shift', String(Math.round(tile / 4))]);
  const drift = runPy(['tools/make_grid_map.py', '--check', MAP_JPG, '--tile', t]);
  /* ⚠⚠ 正規表現は **リテラル**で書く。new RegExp('...' + name + '...') の形だと
   *   バックスラッシュが 1 段食われて黙って (OK|NG)s+ になり、**永久にマッチしない検出器**になる
   *   (2026-08-27 に 1 回踏んだ。症状は「縦 ? / 横 ? で (1a) と (1z2) が同時に赤」)。 */
  const grab = (s, name) => {
    const RE = { '縦線': /(OK|NG)\s+縦線:[^\r\n]*相対位置\s*([0-9.]+)%/, '横線': /(OK|NG)\s+横線:[^\r\n]*相対位置\s*([0-9.]+)%/ };
    const m = s.match(RE[name]);
    return m ? { ok: m[1] === 'OK', pct: parseFloat(m[2]) } : null;
  };
  const grabDrift = (s, name) => {
    const RE = { '縦線': /縦線:[^\r\n]*累積ドリフト\s*([0-9.]+)world-px[^\r\n]*score比\s*([0-9.]+)%/, '横線': /横線:[^\r\n]*累積ドリフト\s*([0-9.]+)world-px[^\r\n]*score比\s*([0-9.]+)%/ };
    const m = s.match(RE[name]);
    return m ? { drift: parseFloat(m[1]), score: parseFloat(m[2]) } : null;
  };
  return {
    tile: tile,
    v: grab(align.out, '縦線'), h: grab(align.out, '横線'), code: align.code, out: align.out,
    shiftV: grab(shift.out, '縦線'), shiftH: grab(shift.out, '横線'), shiftCode: shift.code,
    dv: grabDrift(drift.out, '縦線'), dh: grabDrift(drift.out, '横線'), driftOut: drift.out,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件の表 (依頼書 §9 の §0〜§7 を **全部宣言**する)
//   形: [id, 文面, 述語 (m -> [bool, detail]) or null, PENDING の理由 or undefined]
//   ⭐ 未実装は 4 番目の要素に理由を持たせる → emit() が **PENDING** で出す。
//   ⭐ 完了条件は「PENDING 0」。⛔ 数合わせで緑にしない。
// ══════════════════════════════════════════════════════════════════════════════
const S = (m) => (m && m.stub) || {};
const kinds = (m, k) => ((S(m).enters) || []).filter(e => e.kind === k);

const ASSERT_OF = {};
[
  /* ── §0 装置 (先に母集団を確かめる) ──────────────────────────────────────── */
  ['0z1', '[装置] スタブページに window.TAVERN_MAP が載っている (データ層の母集団ガード)',
    (m) => [!!S(m).has, S(m).has ? 'COLS=' + S(m).COLS + ' ROWS=' + S(m).ROWS + ' TILE=' + S(m).TILE
      : '⛔ undefined — 以下 §0/§1 は全部空振りになる'
      + (S(m).pageErrs && S(m).pageErrs.length ? ' / ページのエラー: ' + S(m).pageErrs.slice(0, 2).join(' | ') : '')]],
  ['0z2', '[装置] 台帳 GRIDS["' + LEDGER_KEY + '"].tile と TAVERN_MAP.TILE が一致 (2 経路の突き合わせ)',
    (m) => [!!(m.ledger && S(m).has && m.ledger.tile === S(m).TILE),
      m.ledger ? ('台帳 tile=' + m.ledger.tile + ' cells(' + m.ledger.cols + ',' + m.ledger.rows + ')'
        + ' / TAVERN_MAP.TILE=' + S(m).TILE) : '⛔ ' + LEDGER_PY + ' の GRIDS を読めない']],
  ['0a', 'window.TAVERN_MAP が tavern.html に実際に載っている', null,
    '⭐⭐⭐ 母集団ガード。' + P3 + ' — 現時点の tavern.html にはまだ <script src="' + MAP_JS
    + '"> が無い。⚠ これが無いと §2〜§4 が全部空振りで永久緑になる (#23 の再発防止)'],
  ['0b', 'TAVERN_MAP.MASK.length === ROWS かつ全行の長さ === COLS',
    (m) => {
      const s = S(m);
      if (!s.has) return [false, '⛔ TAVERN_MAP が無い'];
      if (!m.ledger) return [false, '⛔ 台帳 ' + LEDGER_PY + ' の cells を読めない'];
      const dimOk = s.COLS === m.ledger.cols && s.ROWS === m.ledger.rows;
      const maskOk = s.maskLen === s.ROWS;
      const lens = uniqNums(s.rowLens);
      const rowsOk = lens.length === 1 && lens[0] === s.COLS;
      return [dimOk && maskOk && rowsOk,
        'MASK ' + s.maskLen + ' 行 (ROWS=' + s.ROWS + ') / 行長 ' + lens.join(',') + ' (COLS=' + s.COLS + ')'
        + ' / 台帳 cells(' + m.ledger.cols + ',' + m.ledger.rows + ')'
        + (dimOk ? '' : '  ⛔ 台帳と食い違い') + (maskOk ? '' : '  ⛔ MASK の行数が ROWS と違う')
        + (rowsOk ? '' : '  ⛔ 行の長さが COLS と違う')];
    }],
  ['0c', 'assets/tavern_map.jpg の実寸が COLS*TILE x ROWS*TILE と一致',
    (m) => {
      const s = S(m);
      if (!s.has) return [false, '⛔ TAVERN_MAP が無い'];
      const im = s.img || {};
      const w = s.COLS * s.TILE, h = s.ROWS * s.TILE;
      return [!!im.ok && im.w === w && im.h === h,
        (im.ok ? im.w + 'x' + im.h : '⛔ 画像を読めない') + ' / 期待 ' + w + 'x' + h
        + ' (COLS ' + s.COLS + ' x TILE ' + s.TILE + ', ROWS ' + s.ROWS + ' x TILE ' + s.TILE + ')'];
    }],

  /* ── §1 マップと絵が食い違っていない ─────────────────────────────────────── */
  ['1z1', '[装置] 母集団 — TABLES 3 卓 + DOORS 3 扉の enter があり、歩ける床が 2 マス以上ある',
    (m) => {
      const s = S(m);
      const nt = kinds(m, 'table').length, nd = kinds(m, 'door').length;
      return [nt >= 3 && nd >= 3 && (s.walkable || 0) >= 2,
        '卓 ' + nt + ' 件 / 扉 ' + nd + ' 件 / 歩ける床 ' + (s.walkable || 0) + ' マス'
        + '  ⭐ ここが 0 だと (1b)(1c) が空振りで永久緑になる'];
    }],
  ['1z2', '[装置] check_grid_alignment は --shift TILE/4 で NG になる (検出器が生きている証拠)',
    (m) => {
      const g = m.grid;
      const v = g.shiftV, h = g.shiftH;
      /* ⚠ 横は 24px (= 1/4 マス) 間隔の板の継ぎ目があるので、ずらしても OK に見えることがある
         (check_grid_alignment.py の冒頭に実測 70.9% として明記されている)。
         ⭐ 縦は板と直交するので格子線しか無く、必ず落ちる。判定は「どちらかが NG」。 */
      return [g.shiftCode !== 0 && !!(v && h) && (!v.ok || !h.ok),
        '--shift ' + Math.round(g.tile / 4) + ' で 縦 ' + (v ? (v.ok ? 'OK' : 'NG') + ' ' + v.pct + '%' : '?')
        + ' / 横 ' + (h ? (h.ok ? 'OK' : 'NG') + ' ' + h.pct + '%' : '?') + ' / exit ' + g.shiftCode];
    }],
  ['1a', '焼き込み格子がタイル境界に乗っている (縦横とも OK)',
    (m) => {
      const g = m.grid;
      const v = g.v, h = g.h;
      const ok = g.code === 0 && !!(v && h) && v.ok && h.ok;
      /* ⚠⚠ 依頼書 §9 は make_grid_map.py --check を指定しているが、この絵では
         **位相ズレが構造的に誤報する** (床の板目が 24px = 1/4 マス周期で走るため)。
         2026-08-27 実測 縦 47.50 / 横 24.50 world-px で NG。周期側 (累積ドリフト) と
         score 比は許容内。→ #24 でこの誤報のために作られた check_grid_alignment.py で判定し、
         --check の生きた指標 (ドリフト / score 比) は detail に残す。 */
      const d = (x) => x ? ('ドリフト ' + x.drift + ' / score比 ' + x.score + '%') : '?';
      return [ok,
        'check_grid_alignment: 縦 ' + (v ? (v.ok ? 'OK' : 'NG') + ' ' + v.pct + '%' : '?')
        + ' / 横 ' + (h ? (h.ok ? 'OK' : 'NG') + ' ' + h.pct + '%' : '?')
        + ' (許容 70% 以上, tile=' + g.tile + ', exit ' + g.code + ')'
        + '  [参考 make_grid_map --check: 縦 ' + d(g.dv) + ' / 横 ' + d(g.dh)
        + ' — ⚠ 位相ズレは板目 24px の倍音で構造的に誤報するので判定に使わない]'];
    }],
  ['1b', 'TABLES と DOORS の enter タイルが全件 isWalkable (0 件の例外)',
    (m) => {
      const es = S(m).enters || [];
      if (!es.length) return [false, '⛔ 母集団が空 ((1z1) を見よ)'];
      const bad = es.filter(e => !e.walkable);
      return [bad.length === 0,
        es.length + ' 件中 歩けない ' + bad.length + ' 件'
        + (bad.length ? ' ⛔ ' + bad.map(e => e.kind + ':' + e.key + '(' + e.c + ',' + e.r + ')'
            + (e.err ? '[例外 ' + e.err + ']' : '')).join(' ') : '')];
    }],
  ['1c', 'spawnFor("door") から 3 卓すべてと全ての扉へ findPath が通る',
    (m) => {
      const s = S(m);
      const es = s.enters || [];
      if (!es.length) return [false, '⛔ 母集団が空 ((1z1) を見よ)'];
      /* ⭐⭐⭐ 1 つずつ試して緑では足りない (#23「街道網は環状なので単体テストでは永久に緑」)。
         spawn から本番の findPath で到達できるタイルを **塗りつぶし**、6 件が全部その集合に
         入ることを見る。⚠⚠ findPath はブラウザで呼ぶ (自前 BFS は近傍の数が違うだけで誤報)。 */
      const un = s.unreached || [];
      return [un.length === 0 && (s.reachable || 0) > 0,
        'spawn(' + (s.spawn || []).join(',') + ')' + (s.spawnWalkable ? '' : ' ⛔歩けない')
        + ' から到達 ' + (s.reachable || 0) + '/' + (s.walkable || 0) + ' マス'
        + ' / 未到達の enter ' + un.length + ' 件' + (un.length ? ' ⛔ ' + un.join(' ') : '')];
    }],
].forEach(a => { ASSERT_OF[a[0]] = a; });

/* ── §2〜§7 は **枠だけ宣言**して PENDING を出す (項目 3 が埋める) ─────────────
 *  ⭐ 文面は依頼書 §9 のもの。⛔ 述語を書かずに緑にしない (数合わせは禁止)。
 *  ⚠ 項目 3 は 4 番目の要素 (PENDING 理由) を消して 3 番目に述語を書くだけでよい。 */
[
  /* §2 卓が 3 つで、シナリオ1〜3 に対応している */
  ['2a', '#tavernStage 上の席札がちょうど 3 枚 / id が questTable_<scenarioId> (goblin-mine / bandits-forest / lizard-swamp)', null, P3],
  ['2b', '⭐ 2 経路の突き合わせ: TAVERN_MAP.TABLES[].scenarioId の 3 件が tavern.html の scenarios[].id の先頭 3 件と完全一致', null, P3],
  ['2c', '席札の文言が scenarios[].place から生成されている (place を書き換えると札も変わる = 写しを持っていない)', null, P3],
  ['2d', '未解放の卓 (bandits-forest / lizard-swamp) は DOM に在り、かつ ??? 表示である (⛔ 隠していない)', null, P3],
  /* §3 歩いて着いてから開く */
  ['3a', 'questTable_goblin-mine を 1 回押すと、押した直後は #dialog が閉じたままで、TABLES[0].enter へ到達した後に開く', null, P3],
  ['3b', '⭐ 罠 A の対策が効いている: 420ms 間隔で同じ卓を 6 回押し続けても主人公は前進し、5 秒以内に到達してダイアログが開く', null, P3],
  ['3c', '歩けないタイルを押しても動かない (隣接まで寄せる救済を入れない)', null, P3],
  /* §4 扉 */
  ['4a', '「町へ出る」で exitVia === "tavern" が書かれ town.html へ遷移する / ⛔ URL にクエリが 1 文字も付かない', null, P3],
  ['4b', '「奥の間へ」で #tableArea が開き、シナリオ4〜6 の 3 卓だけが並ぶ (⚠ 暫定 — #26 で消える節)', null, P3],
  ['4c', '闇市の石段は plazaState.unlocked === false のとき DOM に存在しない (⛔ display:none で残っていたら赤)', null, P3],
  /* §5 compact (縦画面) */
  ['5a', '390x844 で zoom が 34/TILE 以上 (1 マス 34px 未満にならない) かつ 1.5 以下', null,
    P3 + ' ⚠ 依頼書の「34/64」は誤り。TILE=96 なので 34/TAVERN_MAP.TILE から引くこと'],
  ['5b', '#title の下に席札が潜っていない (#title の矩形と 3 枚の席札の矩形が交差 0 件)', null, P3],
  ['5c', '@media (max-width:560px) の 2 列グリッドが効いていない (#questTable_* の position が relative ではない)', null,
    P3 + ' ⚠ tavern.html の @media (max-width: 560px) は 3 ブロックある。括ってよいのは卓のグリッドの 1 つだけ'],
  /* §6 恒等 (非退行) */
  ['6a', 'scenarios は 6 件のまま (⛔ 卓を 3 つにするために配列を削らない)', null, P3],
  ['6b', 'tavern.html の place: 6 件の文字列が HEAD と 1 文字も違わない (verify_world_map の (7a) がこれを見ている)', null, P3],
  ['6c', '#dialog / #prep / #shopScreen / #plazaScreen の DOM 構造が HEAD と同一', null, P3],
  /* §7 撤退 */
  ['7a', 'tavern.html?tavernmap=0 で #tavernViewport が DOM に存在しない', null, P3],
  ['7b', '同 URL で #tableArea .table が 6 枚あり assets/tavern_bg.png が敷かれている', null, P3],
  ['7c', '⭐ 撤退の受入は「OFF で緑」ではなく、同じ条件を ON/OFF 両方へ当てて崩れること', null, P3],
].forEach(a => { ASSERT_OF[a[0]] = a; });

const SECTIONS = [
  ['§0 装置 — 先に母集団を確かめる',            ['0z1', '0z2', '0a', '0b', '0c']],
  ['§1 マップと絵が食い違っていない',            ['1z1', '1z2', '1a', '1b', '1c']],
  ['§2 卓が 3 つで、シナリオ1〜3 に対応している', ['2a', '2b', '2c', '2d']],
  ['§3 歩いて着いてから開く',                    ['3a', '3b', '3c']],
  ['§4 扉',                                      ['4a', '4b', '4c']],
  ['§5 compact (縦画面)',                        ['5a', '5b', '5c']],
  ['§6 恒等 (非退行)',                           ['6a', '6b', '6c']],
  ['§7 撤退',                                    ['7a', '7b', '7c']],
];

/* ⭐ 出口は 1 本。PENDING の理由を持っている assert はここで PENDING になる。 */
function emit(id, m) {
  const a = ASSERT_OF[id];
  if (!a) { check('(' + id + ') ⛔ 未宣言の assert', false, 'ASSERT_OF に無い'); return; }
  if (a[3]) { pending('(' + a[0] + ') ' + a[1], a[3]); return; }
  let r;
  try { r = a[2](m); } catch (e) { r = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_tavern_map — 銀の鹿亭 歩ける D&D マップ (依頼書 #25 §9) '
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] ROOT=' + ROOT + '  PORT=' + PORT
    + (NEGATIVE ? '  変異ポート=' + MUT_IMPL.map(k => k + ':' + PORT_OF[k]).join(' ') : ''));

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_tavmap_');
  const servers = [await startServer(PORT, MUTATE)];
  if (NEGATIVE) for (const k of MUT_IMPL) servers.push(await startServer(PORT_OF[k], k));
  const base = 'http://localhost:' + PORT;
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  try {
    mark('装置 — 台帳と変異アンカー');
    check('(0m-台帳) [装置] ' + LEDGER_PY + ' の GRIDS["' + LEDGER_KEY + '"] から cells / tile を引けた',
      !!LEDGER, LEDGER ? 'cells(' + LEDGER.cols + ',' + LEDGER.rows + ') tile ' + LEDGER.tile
        : '⛔ 読めない — (0b)(0c) の期待値をドライバに直書きしてはいけないので、ここが赤なら実装を直す');
    for (const k of MUT_IMPL) {
      check('(0m-' + k + ') [装置] 変異アンカーが ' + MUTATIONS[k].file + ' の 1 箇所にヒットする',
        !!MUT_SRC[k], '置換 ' + MUTATIONS[k].from.length + ' → ' + MUTATIONS[k].to.length + ' bytes');
    }

    mark('測定 — 焼き込み格子 (py) とデータ層 (素のスタブページ)');
    /* ⭐ TILE は TAVERN_MAP から引くのが正だが、py は先に回す必要がある。
       → 先にスタブを読んで TILE を得てから、その値で py を回す。⛔ 96 を直書きしない。 */
    let stub = await probeStub(browser, base);
    const tile = (stub && stub.has && stub.TILE) ? stub.TILE : (LEDGER ? LEDGER.tile : 0);
    console.log('[drv]   TAVERN_MAP.TILE=' + (stub.has ? stub.TILE : '(無し)')
      + ' → py の --tile に ' + tile + ' を渡す');
    const grid = tile > 0 ? measureGrid(tile)
      : { tile: 0, code: -1, out: '', shiftCode: 0, v: null, h: null, shiftV: null, shiftH: null,
          dv: null, dh: null, driftOut: '' };
    const M = { ledger: LEDGER, grid: grid, stub: stub };
    if (stub.pageErrs && stub.pageErrs.length) {
      console.log('[drv]   ⚠ スタブページのエラー ' + stub.pageErrs.length + ' 件: '
        + stub.pageErrs.slice(0, 3).join(' | '));
    }

    for (const sec of SECTIONS) {
      mark(sec[0]);
      for (const id of sec[1]) emit(id, M);
    }

    /* ── 負のコントロール ────────────────────────────────────────────────────
     *  ⭐ 各変異について「赤くなるべき節」が実際に赤くなったかを数える。
     *    赤くならなかった変異が 1 本でもあれば **空振り** = exit 1。
     *  ⚠ PENDING の変異は母集団から外して明示的に PENDING 表示する。 */
    if (NEGATIVE) {
      for (const k of MUT_IMPL) {
        mark('負のコントロール — 変異 ' + k + ' (' + MUTATIONS[k].file + ' の配信を差し替え) → ('
          + MUTATIONS[k].targets.join(')(') + ') が赤くなる');
        const ms = await probeStub(browser, 'http://localhost:' + PORT_OF[k]);
        const mm = { ledger: LEDGER, grid: grid, stub: ms };
        const ev = MUTATIONS[k].evaluable || [];
        const res = {};
        for (const id of ev) {
          try { res[id] = ASSERT_OF[id][2](mm); }
          catch (e) { res[id] = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
        }
        for (const id of MUTATIONS[k].targets) {
          const r = res[id] || [true, '⛔ evaluable に載っていない = この変異では測っていない'];
          check('(neg-' + k + '-' + id + ') 変異 ' + k + ' で (' + id + ') が赤くなる — '
            + ASSERT_OF[id][1].slice(0, 46),
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        const red = ev.filter(id => res[id][0] === false);
        const extra = red.filter(id => MUTATIONS[k].targets.indexOf(id) < 0);
        const unexpected = extra.filter(id => (MUTATIONS[k].allowRed || []).indexOf(id) < 0);
        /* ⭐ 「効きすぎていないこと」まで見る。依頼書 §9 の表は赤くなるべき節を最小限しか
           書いていないので、余分に赤くなる節は allowRed で明示的に許可して証拠へ出す。 */
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない (見た節=' + ev.join('/') + ')',
          unexpected.length === 0,
          '赤=' + (red.length ? red.join(',') : '(無し)')
          + '  担当=' + MUTATIONS[k].targets.join(',')
          + '  想定内の巻き添え=' + ((MUTATIONS[k].allowRed || []).length ? MUTATIONS[k].allowRed.join(',') : '(無し)')
          + '  緑のまま=' + (ev.filter(x => red.indexOf(x) < 0).join(',') || '(無し)')
          + (unexpected.length ? '  ⛔ 想定外の巻き込み=' + unexpected.join(',') : ''));
      }
      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⭐ 項目 3 の完了条件 = ここが 0 件)');
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
    check('(fatal) ドライバが例外なく完走する', false, (e && e.message) + '\n' + ((e && e.stack) || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend   = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length
    + (NEGATIVE ? '   [負のコントロール]' : (MUTATE ? '   [変異 ' + MUTATE + ']' : '')));
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (完了条件 = ここが 0 件。項目 3 が埋める):');
    for (const b of pend) console.log('    - ' + b.name);
  }
  console.log('──────────────────────────────────────────────');
  process.exit(failed.length ? 1 : 0);
})();
