#!/usr/bin/env node
/*
 * driver_mapdef_step3.js — Phase 3「自由タイル (RLE) + ブラシ UI」の恒久回帰検出器
 * ═════════════════════════════════════════════════════════════════════════════
 * SPEC: C:\Users\PC_User\.claude\dev-loop\SPEC_phase3_tiles.md (唯一の正)
 * 対象コミット: b7466a8 (項目1) / 885e996 (項目2) / 70651c4 (項目3) / 66565ad (項目4)
 *
 * ■ 位置づけ
 *   項目1〜4 の実装中に使われた **使い捨てドライバ 4 本を 1 本へ畳んだもの**。
 *   一時ドライバはスクラッチ領域にあり消えるので、Phase 3 が入れたものを恒久的に守るのは
 *   このファイルだけになる。**節をまたいで重複していた assert は畳んだが、
 *   カバレッジ (何が壊れたら赤くなるか) は落としていない**。
 *
 * ■ 何を測るか
 *   §0 前提       公開 API / 既定プリセットの非退行 / 装置の健全性
 *   §1 RLE        ★往復同一性 (両プリセット・deep-equal) / 不正 6 形 / 行優先 / encodeTiles の入力検査
 *   §2 buildMapData tiles が幾何になる / 不正は矩形へ落ちて warn 1 行 / 未指定は無言 / bandMask 不適用
 *   §3 mapUsed    ★★tiles の外接矩形になる (広がる / 狭まる / 全部壁) ← **黒帯の唯一の検出器**
 *   §4 lint       tiles-outside-rooms / 連結性が tiles を見る / band-mask 文言の切替
 *   §5 ゲーム配線 ★mapData ≡ tiles / MAP_USED が tiles の外接矩形 / **MAP_USED の外に歩けるタイル 0 枚**
 *   §6 撤退       ?mapdef=raw は tiles だけ落とす / ?mapdef=0 は raw の上位集合 / 既定経路は無言
 *   §7 ブラシ UI  焼き固め / ★部屋を動かしても床が動かない / ★1ストローク=1undo / 線形補間 /
 *                 fill / 値パレット / サイズ / 矩形に戻す / バッジ 3 状態 / 実測 (サイズ・時間)
 *   §8 往復 I/O   ★exportJSON → importJSON が tiles ごと deep-equal (項目4 で未 assert だった穴)
 *   §9 実プレイ   ★自由タイルで作ったマップを **最後までクリアできる**
 *   §E 実行中に pageerror / console.error / 404 が 1 件も出ていないこと
 *
 * ■ 変異負制御 (--mutate <kind>) ★「assert が空振りでない」ことの直接証明
 *   ⚠⚠ 注入は**すべて文字列置換**で行う (js/df-mapdef.js / index.html / map-editor.html の
 *     写しを配信する)。export を差し替える方式では **lintMapDef が内部で buildMapData /
 *     mapUsed を直接呼ぶため §4 に届かない** (項目2 の worker が実測)。
 *   ⚠ 置換対象が 0 件 / 2 ファイル以上 なら **exit 3 で止める** (空振りしたまま PASS を防ぐ)。
 *
 *     kind           | 注入する欠陥                                   | 落ちるべき節
 *     ---------------|------------------------------------------------|------------------
 *     norlelen       | ★SPEC 必須① RLE の run 長合計の検査を両方向殺す | §1
 *     nomapusedtiles | ★SPEC 必須② mapUsed の tiles 分岐を殺す         | §3 §5 (黒帯が実際に出る)
 *     nobuildtiles   | buildMapData の tiles 分岐を殺す               | §2 §4 §7
 *     nogametiles    | index.html buildMap() の tiles 分岐を殺す       | §5 §9
 *     noraw          | ?mapdef=raw を無効化                           | §6
 *     nointerp       | ブラシの線形補間を殺す (点打ちにする)          | §7
 *     noundo1        | 1 ストローク = 1 undo を殺す (1 打点 1 段)     | §7
 *     nobake         | 焼き固め (tiles への書き戻し) を殺す           | §7 §8
 *     nobrushsize    | ブラシサイズを 1×1 固定にする                  | §7
 *     fillwall       | fill が壁を越える (4 近傍の値検査を全部殺す)   | §7
 *
 *   ⚠⚠ 前任者から渡された 2 つの置換案は**空振りする**ので採らなかった (実地で追跡した結果):
 *     ・「commitTilePaint(pmap); pushHistory(before);」だけでは 1ストローク=1undo は壊れない。
 *       history は「変更前スナップショット」を LIFO で積み、dragEndTile が最後に同じ before を
 *       積むので undo 1 回目で必ず全戻りする → 全 PASS = exit 4。
 *       → snapBefore を「1 打点後のスナップショット」へずらす 2 ルール版にした。
 *     ・「beginTilePaint の if (!commitTilePaint(map)) return null; を殺す」も壊れない。
 *       直後の dragBeginTile:2266 の commitTilePaint(pmap) が tiles を作ってしまう。
 *       → commitTilePaint 本体 (state.mapDef.tiles = enc;) を潰した。
 *
 * ■ 作法 (プロジェクト規約。踏むと黙って壊れる)
 *   ⭐ Chrome プロファイルは必ず require('./_pptr_profile')。⚠ **戻り値は文字列** (.dir は誤り)
 *   ⚠ file:// 直開きは不可 (fetch が死ぬ) → 内蔵 http サーバ
 *   ⚠ /favicon.ico の 404 除外は **URL 単位**。本文「404」で除外すると js/df-mapdef.js の
 *     404 検出器まで一緒に死ぬ
 *   ⚠ 新 assert には「母集団が空でない」ガードを必ず置く (空データの真空 PASS の前科あり)
 *   ⚠⚠ **既定プリセットの上でタイル値を数える assert を書かない**。既定ダンジョンには元から
 *     レア床(1) が 137 枚ある → 数えるときは**全面 壁(2) の白紙 tiles を敷いてから**測る
 *   ⚠⚠ **§9 に戦闘 RNG を混ぜない**。ロスターは rat のみ。過去に goblinKing を混ぜたら
 *     ボスの召喚で PT が全滅し cleared=false になった (= 幾何ではなく編成の問題)
 *   ⚠⚠ **index.html 自身にラン ハード上限 4 分がある** ([DIAG][run-timeout])。検証マップの
 *     横幅は既定と同程度 (起点→ボスで約 34 タイル) に収め、HARD_MS は 4 分より短くする
 *
 * ■ 使い方
 *     node tools/driver_mapdef_step3.js [--headful] [--port N] [--browser <path>]
 *                                       [--mutate <kind>] [--skip-play] [--seed N]
 *   exit 0=全 PASS / 1=FAIL あり (変異時は「捕まえた」= 期待どおり) / 2=環境不足 /
 *        3=装置の故障 (未知 kind・変異の空振り・例外) / 4=注入したのに 0 件も落ちない = assert の穴
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8951'), 10);
const SEED = parseInt(arg('seed', '20260802'), 10);
const SKIP_PLAY = flag('skip-play');

const W = 72, H = 28;                                  // 既定グリッド (df-mapdef.js GRID_W/H)

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御 (文字列置換)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE = arg('mutate', null);
const MUTATIONS = {
  /* ★SPEC 必須① — RLE の長さ検査。**両方向**殺す。
   *   多い側を殺すと余分な run が黙って切り捨てられ、少ない側を殺すと flat に穴 (undefined) が
   *   残ったまま展開される = どちらも「読めたつもりで別の地形」。 */
  norlelen: [
    ['      if (n + len > need)                                                // ② 合計が多い',
     '      if (false)                                                         // ② 合計が多い'],
    ['    if (n !== need)                                                      // ② 合計が少ない',
     '    if (false)                                                           // ② 合計が少ない'],
  ],
  /* ★SPEC 必須② — mapUsed の tiles 分岐。**黒帯の再現**。
   *   これを殺すと「MAP_USED の外に歩けるタイルが N 枚残る」= カメラが寄れず画面に純黒が出る。 */
  nomapusedtiles: [
    ['    var tmap = expandTilesInfo(d).map;\n    if (tmap) {',
     '    var tmap = expandTilesInfo(d).map;\n    if (false) {'],
  ],
  // buildMapData の tiles 分岐 (lint は内部でこれを呼ぶので §4 まで届く)
  nobuildtiles: [
    ['    var ti = expandTilesInfo(d);\n    if (ti.map) return ti.map;\n    if (ti.present) warnMapDef(',
     '    var ti = expandTilesInfo(d);\n    if (false) return ti.map;\n    if (ti.present) warnMapDef('],
  ],
  // index.html buildMap() の tiles 分岐 (ゲーム側の配線)
  nogametiles: [
    ['        const ti = DFMapDef.expandTilesInfo(MAPDEF);\n        if (ti.map) return ti.map;',
     '        const ti = DFMapDef.expandTilesInfo(MAPDEF);\n        if (false) return ti.map;'],
  ],
  // ?mapdef=raw
  noraw: [
    ['    if (paramOf(params, "mapdef") === "raw") {',
     '    if (false && paramOf(params, "mapdef") === "raw") {'],
  ],
  // ── map-editor.html (項目4 ブラシ UI) ────────────────────────────────────
  // 線形補間 → 単発の点打ち (速いドラッグで点線状の穴が空く古典的な欠陥)
  nointerp: [
    ['        paintSegment(drag.map, drag.last.tx, drag.last.ty, pxx, pyy, state.tileValue, state.tileSize);',
     '        paintDab(drag.map, pxx, pyy, state.tileValue, state.tileSize);'],
  ],
  /* 1 ストローク = 1 undo を殺す = 「1 打点 1 段」にする。
   * ⚠ pushHistory を足すだけでは効かない (dragEndTile が最後に積む before が undo 1 回で
   *   全戻りしてしまう)。**snapBefore を 1 打点後へずらす**のが本質。 */
  noundo1: [
    ['      commitTilePaint(pmap);\n      drag = { mode: "paint",',
     '      commitTilePaint(pmap); pushHistory(before);\n      drag = { mode: "paint",'],
    ['               hx: 0, hy: 0, snapBefore: before, map: pmap,',
     '               hx: 0, hy: 0, snapBefore: snapshot(), map: pmap,'],
  ],
  // 焼き固め (tiles への書き戻し) を殺す = 一筆引いても tiles が生えない
  nobake: [
    ['    state.mapDef.tiles = enc;', '    state.mapDef.tiles = state.mapDef.tiles;'],
  ],
  // ブラシサイズを 1×1 固定にする (3/5 を選んでも 1 枚しか塗らない)
  nobrushsize: [
    ['    var g = state.mapDef.grid, half = (size - 1) >> 1, n = 0, dx, dy, x, y;',
     '    var g = state.mapDef.grid, half = 0, n = 0, dx, dy, x, y;'],
  ],
  /* fill が壁を越える。⚠ 素朴な 1 行置換では効かない (前任者のメモ) ので
   *   4 近傍の値検査を **1 本ずつ** true に潰す。 */
  fillwall: [
    ['map[y][x - 1] === from', 'true'],
    ['map[y][x + 1] === from', 'true'],
    ['map[y - 1][x] === from', 'true'],
    ['map[y + 1][x] === from', 'true'],
  ],
};
const MUTATE_TARGETS = ['js/df-mapdef.js', 'index.html', 'map-editor.html'];
let _mutatedCache = null;
function mutatedSources() {
  if (_mutatedCache) return _mutatedCache;
  const rules = MUTATIONS[MUTATE];
  if (!rules) {
    console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
    process.exit(3);
  }
  const orig = {}, out = {};
  for (const rel of MUTATE_TARGETS) orig[rel] = out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of rules) {
    /* ⚠ 置換対象は **ちょうど 1 ファイル**に無ければならない。0 件 = 実装を触って自己失効した、
     *   2 件以上 = 別の場所も巻き込む。どちらも負のコントロールが黙って死ぬので exit 3。 */
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    if (hits.length !== 1) {
      console.error('[drv] ⛔ 変異の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイルに重複') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)) +
        (hits.length ? '  [' + hits.join(', ') + ']' : ''));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
  }
  const touched = MUTATE_TARGETS.filter(rel => out[rel] !== orig[rel]);
  console.log('[drv] ★変異負制御 --mutate ' + MUTATE + ' を注入 (' + touched.join(' + ') + ') して配信します');
  _mutatedCache = out;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome
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
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

// ══════════════════════════════════════════════════════════════════════════════
// 内蔵静的サーバ
// ══════════════════════════════════════════════════════════════════════════════
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* ⚠ /favicon.ico は Chrome が勝手に取りに行くもの。除外は必ず **URL** で行う。
 *   本文「404」で一括除外すると js/df-mapdef.js の 404 まで消えて検出器が黙って死ぬ。 */
const IGNORED_URL_RE = /\/favicon\.ico(\?|$)/;

/* 「既存欠陥だから判定から外す」枠。**今は空**。
 * ⚠⚠ [DIAG][result-double-fire] は 34951ad で修正済みなので**除外していない**
 *   (= 再発したら §9 が捕まえる)。直した欠陥のフィルタを残すと、次に同じ壊れ方をしたとき
 *   無言で通ってしまう。フィルタは assert を殺す。 */
const PREEXISTING_RE = /(?!)/;

/* df-mapdef.js だけを読む最小ハーネス。
 * ⚠ map-editor.html を開くとエディタの副作用 (プリセット読込・カタログ fetch) が混ざるので
 *   §1〜§4 (純関数の検査) はこちらで測る。 */
const HARNESS_URL = '/__mapdef3_harness.html';
const HARNESS = '<!doctype html><meta charset="utf-8"><title>mapdef step3 harness</title>\n'
  + '<script src="/js/df-mapdef.js"></script>\n<body>harness</body>';

function startServer(port, root) {
  const rec = { notFound: [], ignored404: [] };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === HARNESS_URL) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(HARNESS); return;
        }
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (MUTATE && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]); return;
        }
        const fp = path.join(root, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          (IGNORED_URL_RE.test(u) ? rec.ignored404 : rec.notFound).push(u);
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve({ srv, rec }));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定 / 小道具
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

// 2 次元配列の deep-equal (JSON 文字列ではなく要素ごと。型も見る)
function deepEqual2D(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    if (!Array.isArray(a[r]) || !Array.isArray(b[r]) || a[r].length !== b[r].length) return false;
    for (let c = 0; c < a[r].length; c++)
      if (a[r][c] !== b[r][c] || typeof a[r][c] !== typeof b[r][c]) return false;
  }
  return true;
}
// キー順に依存しない再帰 deep-equal (§8 の往復同一性で使う)
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}
function histogram2D(m) {
  const h = {};
  for (const row of (m || [])) for (const v of row) h[v] = (h[v] || 0) + 1;
  return h;
}
const box = (u) => u ? ('c' + u.c0 + '-' + u.c1 + ' / r' + u.r0 + '-' + u.r1) : 'null';
const sameBox = (a, b) => !!a && !!b && a.c0 === b.c0 && a.c1 === b.c1 && a.r0 === b.r0 && a.r1 === b.r1;

// ══════════════════════════════════════════════════════════════════════════════
// §5/§6/§9 で使う「自由タイルの検証マップ」
// ══════════════════════════════════════════════════════════════════════════════
/* ⚠ 値 1 (レア床) は**入れない**。index.html は buildMap の後に
 *   「敵スポーンタイルの 1 → 0」(7277) と「起点の 1 → 0」(7282) を書くので、値 1 を混ぜると
 *   「mapData ≡ tiles」の完全一致 assert が救済のぶんだけズレる (装置が自分で自分を汚す)。 */
function blankMap(v) {
  const m = [];
  for (let r = 0; r < H; r++) {
    const row = new Array(W);
    for (let c = 0; c < W; c++) row[c] = (v === undefined ? 2 : v);
    m.push(row);
  }
  return m;
}
function rectFill(m, r1, c1, r2, c2, v) {
  for (let r = Math.max(0, r1); r <= Math.min(H - 1, r2); r++)
    for (let c = Math.max(0, c1); c <= Math.min(W - 1, c2); c++) m[r][c] = v;
}
function encodeRLE(map) {                              // js/df-mapdef.js encodeTiles と同形式 (行優先)
  const parts = []; let cur = -1, run = 0;
  for (const row of map) for (const v of row) {
    if (run > 0 && v === cur) { run++; continue; }
    if (run > 0) parts.push(cur + 'x' + run);
    cur = v; run = 1;
  }
  if (run > 0) parts.push(cur + 'x' + run);
  return { enc: 'rle', data: parts.join(',') };
}
function bboxOfNonWall(map) {
  let c0 = W, c1 = -1, r0 = H, r1 = -1;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (map[r][c] === 2) continue;
    if (r < r0) r0 = r; if (r > r1) r1 = r;
    if (c < c0) c0 = c; if (c > c1) c1 = c;
  }
  return { c0, c1, r0, r1 };
}
function countNonWall(map) { let n = 0; for (const row of map) for (const v of row) if (v !== 2) n++; return n; }

/* rooms は「意味」だけを担う (焼き固め方式)。⚠ tiles とわざと食い違わせて、
 * 幾何がどちらから来たのかを 1 タイルで判別できる形にする。
 * ⚠⚠ 起点 (10,20) → ボス (44,20) = **横 34 タイル** = 既定 (24→57 = 33) と同程度。
 *   ここを広げると index.html 自身のラン ハード上限 4 分に衝突する (step2 で実際に踏んだ)。 */
const PLAY_ROOMS = [
  { id: 'p0', role: 'start', rect: [17, 5, 25, 18],
    enemySlots: [[8, 19], [12, 22]], bossSlot: null, painting: null, scenery: null },
  { id: 'p1', role: null, rect: [14, 22, 24, 34],
    enemySlots: [[26, 18], [30, 16], [32, 21]], bossSlot: null, painting: null, scenery: null },
  { id: 'p2', role: 'boss', rect: [16, 38, 25, 50],
    enemySlots: [], bossSlot: [44, 20], painting: null, scenery: null },
];
/* ⚠ 廊下は **1 本だけ** (room0 ↔ room1)。room1 ↔ ボス部屋は矩形を持たず、
 *   tiles にだけ描いた「階段状の斜め坑道」でしか繋がっていない
 *   = 実プレイが自由タイルの上を歩いたことの直接証明になる。 */
const PLAY_CORRIDORS = [[19, 18, 20, 22]];

function makePlayTilesMap() {
  const m = blankMap(2);
  for (const r of PLAY_ROOMS) rectFill(m, r.rect[0], r.rect[1], r.rect[2], r.rect[3], 0);
  for (const q of PLAY_CORRIDORS) rectFill(m, q[0], q[1], q[2], q[3], 0);
  // ★階段状の斜め坑道 (c34→c38 で 5 行ぶん登る)。矩形の和では書けない形。3 タイル厚 = 通行できる幅
  for (let k = 0; k <= 4; k++) {
    const c = 34 + k, r = 19 - k;
    for (let dr = -1; dr <= 1; dr++) if (r + dr >= 0 && r + dr < H) m[r + dr][c] = 0;
  }
  // ★外接矩形を rooms+corridors と **4 辺すべて**ずらす出っ張り (どれも本体と連結させる)
  rectFill(m, 10, 45, 15, 46, 0);   // 北の縦坑   (ボス部屋 r16 に接続) → 上端 r10
  rectFill(m, 20, 51, 21, 56, 0);   // 東の横坑   (ボス部屋 c50 に接続) → 右端 c56
  rectFill(m, 26, 3, 27, 4, 0);     // 南西の窪み                        → 下端 r27 / 左端 c3
  m[25][4] = 0; m[25][3] = 0;       // 南西の窪みを起点部屋 (c5) へ繋ぐ
  return m;
}
const PLAY_TILES_MAP = makePlayTilesMap();
const PLAY_TILES = encodeRLE(PLAY_TILES_MAP);
const PLAY_TILES_BBOX = bboxOfNonWall(PLAY_TILES_MAP);
const PLAY_TILES_JSON = JSON.stringify(PLAY_TILES_MAP);
const PLAY_RECT_BBOX = (() => {
  let c0 = W, c1 = -1, r0 = H, r1 = -1;
  for (const q of PLAY_ROOMS.map(r => r.rect).concat(PLAY_CORRIDORS)) {
    if (q[0] < r0) r0 = q[0]; if (q[2] > r1) r1 = q[2];
    if (q[1] < c0) c0 = q[1]; if (q[3] > c1) c1 = q[3];
  }
  return { c0, c1, r0, r1 };
})();

function playMapDef(over) {
  return Object.assign({
    schema: 'df-map/1',
    id: 'drv-step3-tiles',
    name: '検証用 自由タイル坑道',
    grid: { w: W, h: H, tile: 96 },
    themeId: 'goblin-mine',
    rooms: JSON.parse(JSON.stringify(PLAY_ROOMS)),
    corridors: JSON.parse(JSON.stringify(PLAY_CORRIDORS)),
    start: { tx: 10, ty: 20 },
    objective: { kind: 'visitRooms', count: null },
    tiles: JSON.parse(JSON.stringify(PLAY_TILES)),
    flags: { bandMask: false },
  }, over || {});
}
function playPayload(over) {
  return Object.assign({
    title: '検証用 自由タイル坑道', flavor: 'driver_mapdef_step3', themeId: 'goblin-mine',
    mapDef: playMapDef(),
    spawns: [['goblin', 8, 19], ['kobold', 12, 22],
             ['kobold', 26, 18], ['goblin', 30, 16], ['kobold', 32, 21],
             ['goblinKing', 44, 20]],
    trapCount: 3, hiddenChestCount: 2, perceptionDC: 14, clearXp: 0,
    questLevel: 5, tierKey: 'tier2', source: 'map-editor',
  }, over || {});
}

// 既定 (df-mapdef.js DEFAULT_DUNGEON / DEFAULT_FIELD) の値。§6 で「戻ったこと」を測る基準。
const DEFAULT_ROOMS_JSON = JSON.stringify([[7, 24, 20, 43], [5, 47, 22, 68]]);
const DEFAULT_MAP_USED = { c0: 24, c1: 68, r0: 5, r1: 22 };
const DEFAULT_FIELD_MAP_USED = { c0: 2, c1: 68, r0: 5, r1: 22 };

// ══════════════════════════════════════════════════════════════════════════════
// index.html 起動まわり
// ══════════════════════════════════════════════════════════════════════════════
const T_BASE_MS = 1700000000000;

function prelude(cfg) {
  try {
    sessionStorage.removeItem('dragonfighters.currentScenario');
    sessionStorage.removeItem('dragonfighters.questFlags');
    sessionStorage.removeItem('dragonfighters.pendingSummon');
    if (cfg.payload) sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
    else sessionStorage.removeItem('dragonfighters.generatedScenario');
    if (cfg.scen) sessionStorage.setItem('dragonfighters.currentScenario', cfg.scen);
  } catch (e) {}
  const T0 = cfg.t0, OrigDate = Date;
  window.Date = function (a) { return arguments.length ? new OrigDate(a) : new OrigDate(T0); };
  window.Date.now = function () { return T0; };
  window.Date.prototype = OrigDate.prototype;
  let _s = (cfg.seed || 20260802) >>> 0;
  Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  /* ⚠ console.warn は**ページ内で横取り**して同期的に数える。puppeteer の page.on('console') は
   *   非同期なので「evaluate 直後に読む」と取りこぼす。 */
  window.__warns = [];
  const ow = console.warn;
  console.warn = function () {
    try { window.__warns.push(Array.prototype.join.call(arguments, ' ')); } catch (e) {}
    return ow.apply(console, arguments);
  };
}

async function bootPage(browser, url, pre, opt) {
  const o = opt || {};
  const page = await browser.newPage();
  const errs = [], preexisting = [];
  page.on('pageerror', e => errs.push('pageerror: ' + ((e && e.message) || e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // ⚠ 除外は **発生元 URL** で判定 (本文で判定すると js/df-mapdef.js の 404 まで消える)
    const loc = (typeof m.location === 'function') ? m.location() : null;
    if (loc && loc.url && IGNORED_URL_RE.test(loc.url)) return;
    const txt = m.text();
    if (PREEXISTING_RE.test(txt)) { preexisting.push(txt); return; }
    errs.push('console.error: ' + txt + (loc && loc.url ? '  @' + loc.url : ''));
  });
  page.on('requestfailed', r => { if (!IGNORED_URL_RE.test(r.url())) errs.push('requestfailed: ' + r.url()); });
  page.on('response', r => {
    if (r.status() >= 400 && !IGNORED_URL_RE.test(r.url())) errs.push('http' + r.status() + ': ' + r.url());
  });
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  if (pre) await page.evaluateOnNewDocument(prelude, pre);
  await page.goto(url, { waitUntil: o.waitUntil || 'domcontentloaded', timeout: 40000 });
  if (o.wait !== false) {
    await page.waitForFunction(() => {
      try { return !!mapData && typeof ROOMS !== 'undefined' && typeof MAPDEF !== 'undefined'; }
      catch (e) { return false; }
    }, { timeout: 30000, polling: 100 });
  }
  return { page, errs, preexisting };
}

async function probeIndex(page) {
  return page.evaluate(() => {
    const g = (fn, d) => { try { const v = fn(); return (v === undefined) ? d : v; } catch (e) { return d; } };
    const out = {};
    out.hasDFMapDef = !!window.DFMapDef;
    out.scenarioId = g(() => scenarioId, '<none>');
    out.isCustom = g(() => MAPDEF.isCustom, '<none>');
    out.mapdefId = g(() => MAPDEF.id, '<none>');
    out.tilesNull = g(() => MAPDEF.tiles === null, '<none>');
    out.tilesLen = g(() => (MAPDEF.tiles && MAPDEF.tiles.data) ? MAPDEF.tiles.data.length : -1, '<none>');
    out.roomsJson = g(() => JSON.stringify(ROOMS), '<none>');
    out.startTx = g(() => START_TX, '<none>');
    out.startTy = g(() => START_TY, '<none>');
    out.mapUsed = g(() => JSON.stringify(MAP_USED), '<none>');
    out.objectiveRooms = g(() => OBJECTIVE_ROOMS, -1);
    out.bossRoomIdx = g(() => BOSS_ROOM_IDX, -1);
    const md = g(() => mapData, null);
    if (Array.isArray(md)) {
      out.mapRows = md.length;
      out.mapCols = Array.from(new Set(md.map(r => (r && r.length) || -1)));
      out.mapJson = JSON.stringify(md);
      const tally = {};
      for (const row of md) for (const v of row) tally[v] = (tally[v] || 0) + 1;
      out.mapTally = tally;
      // ★黒帯の直接測定: MAP_USED の外側に残っている「歩けるタイル」の数
      const mu = g(() => MAP_USED, null);
      let outside = 0, nonWall = 0;
      for (let r = 0; r < md.length; r++) for (let c = 0; c < md[r].length; c++) {
        if (md[r][c] === 2) continue;
        nonWall++;
        if (mu && (r < mu.r0 || r > mu.r1 || c < mu.c0 || c > mu.c1)) outside++;
      }
      out.nonWall = nonWall; out.outsideMapUsed = outside;
      // 幾何の出所を 1 点で見分ける代表タイル
      out.tileStair = md[16] ? md[16][36] : -1;      // tiles では床 (斜め坑道) / 矩形では壁
      out.tileNorthShaft = md[10] ? md[10][45] : -1; // tiles では床 (北の縦坑) / 矩形では壁
      out.tileEastAdit = md[20] ? md[20][56] : -1;   // tiles では床 (東の横坑) / 矩形では壁
      out.tileRoomEdge = md[14] ? md[14][22] : -1;   // 矩形でも tiles でも床 (room1 の角)
    } else { out.mapRows = -1; out.mapCols = []; out.mapJson = '<none>'; out.mapTally = {}; }
    const sp = g(() => ENEMY_SPAWNS, null);
    out.spawnsLen = Array.isArray(sp) ? sp.length : -1;
    out.spawnsJson = Array.isArray(sp) ? JSON.stringify(sp) : '<none>';
    out.spawnsOnWall = (Array.isArray(sp) && Array.isArray(md))
      ? sp.filter(s => md[s[2]] && md[s[2]][s[1]] === 2).length : -1;
    out.warns = g(() => (window.__warns || []).slice(), []);
    return out;
  });
}

async function runIndex(browser, base, cfg, query) {
  const boot = await bootPage(browser, base + '/index.html' + (query || ''),
    { payload: cfg.payload || null, scen: cfg.scen || null, t0: T_BASE_MS, seed: SEED });
  await new Promise(r => setTimeout(r, 800));            // 情景/1枚絵は ENEMY_SPAWNS 確定後に組まれる
  const p = await probeIndex(boot.page);
  p.errs = boot.errs;
  await boot.page.close();
  return p;
}

// ══════════════════════════════════════════════════════════════════════════════
// メイン
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  /* ⚠ makeProfile は **ディレクトリのパス文字列**を返す (.dir / .cleanup() は誤り)。
   *   後始末は process の exit / SIGINT フックで自動的に行われる。 */
  const profile = makeProfile('df_mapdef3_');

  let srv = null, browser = null, rec = null;
  try {
    const a = await startServer(PORT, ROOT);
    srv = a.srv; rec = a.rec;
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] root=' + ROOT + '  ' + BASE);
    console.log('[drv] seed=' + SEED + ' / mutate=' + (MUTATE || 'なし') + ' / play=' + (SKIP_PLAY ? 'skip' : 'on'));
    console.log('[drv] 検証マップ: tiles RLE ' + PLAY_TILES.data.length + ' 文字 / 非壁 '
      + countNonWall(PLAY_TILES_MAP) + ' タイル');
    console.log('[drv]   tiles の外接矩形       = ' + JSON.stringify(PLAY_TILES_BBOX));
    console.log('[drv]   rooms+corridors の矩形 = ' + JSON.stringify(PLAY_RECT_BBOX));

    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: HEADFUL ? false : 'new',
      userDataDir: profile,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
    });

    // 装置そのものの前提 (node 側で完結する母集団ガード)
    mark('§0 装置の前提 (検証マップが真空でない / tiles と矩形が本当に別物)');
    check('§0 0a 検証マップに床と壁の両方がある (真空でない)',
      countNonWall(PLAY_TILES_MAP) > 200 && countNonWall(PLAY_TILES_MAP) < W * H,
      '非壁=' + countNonWall(PLAY_TILES_MAP) + ' / 全 ' + (W * H));
    check('§0 0b 検証マップの外接矩形が rooms+corridors と **4 辺すべて違う** (黒帯検出器が空振りしない)',
      PLAY_TILES_BBOX.r0 !== PLAY_RECT_BBOX.r0 && PLAY_TILES_BBOX.r1 !== PLAY_RECT_BBOX.r1 &&
      PLAY_TILES_BBOX.c0 !== PLAY_RECT_BBOX.c0 && PLAY_TILES_BBOX.c1 !== PLAY_RECT_BBOX.c1,
      JSON.stringify(PLAY_TILES_BBOX) + ' vs ' + JSON.stringify(PLAY_RECT_BBOX));
    check('§0 0c 検証マップに値 1 (レア床) が無い (救済 7277/7282 で mapData が汚れない形)',
      PLAY_TILES_MAP.every(row => row.every(v => v === 0 || v === 2)), 'ok');
    check('§0 0d 起点 (10,20) → ボス (44,20) が横 34 タイル = 既定 (33) と同程度 (4 分上限に衝突しない)',
      Math.abs(44 - 10) <= 36, '34 タイル');

    // ══════════════════════════════════════════════════════════════════════
    // ハーネス (js/df-mapdef.js だけを読む) — §1〜§4
    // ══════════════════════════════════════════════════════════════════════
    const hBoot = await bootPage(browser, BASE + HARNESS_URL, null, { wait: false });
    const hPage = hBoot.page, hErrs = hBoot.errs;
    await hPage.waitForFunction(() => !!window.DFMapDef, { timeout: 15000, polling: 50 });
    await hPage.evaluate(() => {
      const M = window.DFMapDef;
      window.__warns = [];
      const orig = console.warn.bind(console);
      console.warn = function () {
        try { window.__warns.push(Array.prototype.join.call(arguments, ' ')); } catch (e) {}
        return orig.apply(null, arguments);
      };
      window.__mapdefWarns = () => window.__warns.filter(s => s.indexOf('[mapdef]') === 0);
      window.__clearWarns = () => { window.__warns.length = 0; };
      window.__base = () => M.clone(M.DEFAULT_DUNGEON);
      window.__rectMap = () => M.buildMapData(M.DEFAULT_DUNGEON);
      window.__allWall = () => {
        const m = [];
        for (let r = 0; r < 28; r++) { const row = []; for (let c = 0; c < 72; c++) row.push(2); m.push(row); }
        return m;
      };
      window.__withTiles = (map2d, over) => {
        const d = window.__base();
        d.tiles = M.encodeTiles(map2d);
        if (over) for (const k in over) d[k] = over[k];
        return d;
      };
    });

    // ── §0 (続き) 公開 API と既定プリセットの非退行 ──────────────────────
    mark('§0 公開 API と既定プリセットの非退行');
    const api = await hPage.evaluate(() => {
      const M = window.DFMapDef;
      return {
        encodeTiles: typeof M.encodeTiles, expandTiles: typeof M.expandTiles,
        expandTilesInfo: typeof M.expandTilesInfo, hasTiles: typeof M.hasTiles, TILES_ENC: M.TILES_ENC,
        buildMapData: typeof M.buildMapData, mapUsed: typeof M.mapUsed, validate: typeof M.validate,
        sanitize: typeof M.sanitize, lintMapDef: typeof M.lintMapDef, resolve: typeof M.resolve,
        dungeonTiles: M.DEFAULT_DUNGEON.tiles, fieldTiles: M.DEFAULT_FIELD.tiles,
        dungeonUsed: M.mapUsed(M.DEFAULT_DUNGEON), fieldUsed: M.mapUsed(M.DEFAULT_FIELD),
      };
    });
    check('§0 0e encodeTiles / expandTiles / expandTilesInfo / hasTiles / TILES_ENC が公開されている',
      api.encodeTiles === 'function' && api.expandTiles === 'function' &&
      api.expandTilesInfo === 'function' && api.hasTiles === 'function' && api.TILES_ENC === 'rle',
      JSON.stringify({ e: api.encodeTiles, x: api.expandTiles, i: api.expandTilesInfo,
                       h: api.hasTiles, enc: api.TILES_ENC }));
    check('§0 0f 既存 API が 1 つも消えていない (公開ブロックの編集事故検出)',
      api.buildMapData === 'function' && api.mapUsed === 'function' && api.validate === 'function' &&
      api.sanitize === 'function' && api.lintMapDef === 'function' && api.resolve === 'function', '');
    check('§0 0g 既定プリセット 2 種は tiles:null のまま (Phase 3 は既定を 1bit も変えない)',
      api.dungeonTiles === null && api.fieldTiles === null,
      'dungeon=' + JSON.stringify(api.dungeonTiles) + ' field=' + JSON.stringify(api.fieldTiles));
    check('§0 0h 既定ダンジョンの mapUsed が従来値 (c24-68 / r5-22)',
      sameBox(api.dungeonUsed, DEFAULT_MAP_USED), box(api.dungeonUsed));
    check('§0 0i 既定 屋外の mapUsed が従来値 (c2-68 / r5-22)',
      sameBox(api.fieldUsed, DEFAULT_FIELD_MAP_USED), box(api.fieldUsed));

    // ── §1 RLE (往復同一性 / 不正 / 行優先 / 入力検査) ────────────────────
    mark('§1 RLE: ★往復同一性 expandTiles(encodeTiles(buildMapData(既定))) ≡ buildMapData(既定)');
    for (const key of ['DEFAULT_DUNGEON', 'DEFAULT_FIELD']) {
      const rt = await hPage.evaluate((k) => {
        const M = window.DFMapDef;
        const preset = M[k];
        const src = M.buildMapData(preset);
        const enc = M.encodeTiles(src);
        const def2 = M.clone(preset); def2.tiles = enc;
        const info = M.expandTilesInfo(def2);
        const v = M.validate(def2);
        return { src: src, back: M.expandTiles(def2), enc: enc,
                 runs: (enc && typeof enc.data === 'string') ? enc.data.split(',').length : -1,
                 present: info.present, reason: info.reason,
                 grid: { w: preset.grid.w, h: preset.grid.h },
                 vOk: v.ok, vIssues: v.issues.map(x => x.code) };
      }, key);
      const hSrc = histogram2D(rt.src);
      check('§1 ' + key + ' G1 母集団が空でない (' + rt.grid.h + '行×' + rt.grid.w + '列 / 床0・レア床1・壁2 が全部ある)',
        Array.isArray(rt.src) && rt.src.length === rt.grid.h &&
        rt.src.every(r => Array.isArray(r) && r.length === rt.grid.w) &&
        (hSrc[0] | 0) > 0 && (hSrc[1] | 0) > 0 && (hSrc[2] | 0) > 0,
        '0=' + (hSrc[0] | 0) + ' 1=' + (hSrc[1] | 0) + ' 2=' + (hSrc[2] | 0));
      const encSum = (rt.enc && typeof rt.enc.data === 'string')
        ? rt.enc.data.split(',').reduce((s, p) => s + parseInt(p.split('x')[1], 10), 0) : NaN;
      check('§1 ' + key + ' G2 encodeTiles が enc:"rle" / run 2 本以上 / 連長合計 = w*h',
        !!rt.enc && rt.enc.enc === 'rle' && rt.runs >= 2 && encSum === rt.grid.w * rt.grid.h,
        'runs=' + rt.runs + ' 合計=' + encSum + ' / w*h=' + (rt.grid.w * rt.grid.h));
      check('§1 ' + key + ' 1a ★往復同一性: 2 次元配列として deep-equal',
        deepEqual2D(rt.src, rt.back), 'back rows=' + (rt.back ? rt.back.length : 'null'));
      check('§1 ' + key + ' 1b 往復後も present:true / reason:null / validate が通る (tiles-bad が過剰発火しない)',
        rt.present === true && rt.reason === null && rt.vOk === true && rt.vIssues.indexOf('tiles-bad') < 0,
        'present=' + rt.present + ' ok=' + rt.vOk + ' issues=[' + rt.vIssues.join(',') + ']');
    }

    // 比較器の自己検査 (1 タイルだけ変えたら**必ず**落ちること)
    const selfTest = await hPage.evaluate(() => {
      const M = window.DFMapDef;
      const src = M.buildMapData(M.DEFAULT_DUNGEON);
      const m2 = JSON.parse(JSON.stringify(src));
      const rr = 13, cc = 30, before = m2[rr][cc];
      m2[rr][cc] = (before === 2) ? 0 : 2;
      const d = M.clone(M.DEFAULT_DUNGEON); d.tiles = M.encodeTiles(m2);
      return { src: src, back: M.expandTiles(d), rr: rr, cc: cc, before: before, after: m2[rr][cc] };
    });
    check('§1 N1 空振り検出: 1 タイルだけ変えた tiles は deep-equal で**落ちる**',
      !deepEqual2D(selfTest.src, selfTest.back) && Array.isArray(selfTest.back),
      '(' + selfTest.rr + ',' + selfTest.cc + ') ' + selfTest.before + '→' + selfTest.after);

    mark('§1 RLE: 不正 6 形が個別に null + validate tiles-bad / 未指定 4 形は素通り');
    const bad = await hPage.evaluate(() => {
      const M = window.DFMapDef;
      const good = M.encodeTiles(M.buildMapData(M.DEFAULT_DUNGEON));
      const runs = good.data.split(',');
      function probe(tiles) {
        const d = M.clone(M.DEFAULT_DUNGEON); d.tiles = tiles;
        const v = M.validate(d), info = M.expandTilesInfo(d);
        return { map: M.expandTiles(d), present: info.present, reason: info.reason,
                 ok: v.ok, codes: v.issues.map(x => x.code) };
      }
      return {
        goodRuns: runs.length,
        goodSum: runs.reduce((s, p) => s + parseInt(p.split('x')[1], 10), 0),
        enc: probe({ enc: 'rle2', data: good.data }),                                   // ① enc
        sumShort: probe({ enc: 'rle', data: runs.slice(0, runs.length - 1).join(',') }), // ② 少ない
        sumLong: probe({ enc: 'rle', data: good.data + ',0x1' }),                       // ② 多い
        value: probe({ enc: 'rle', data: '3x' + (72 * 28) }),                           // ③ 値
        dataNum: probe({ enc: 'rle', data: 2016 }),                                     // ④ 型 (数値)
        dataNull: probe({ enc: 'rle', data: null }),                                    // ④ 型 (null)
      };
    });
    check('§1 G3 母集団ガード: 比較元の正しい RLE が非空 (run ' + bad.goodRuns + ' 本 / 合計 ' + bad.goodSum + ')',
      bad.goodRuns >= 2 && bad.goodSum === W * H, 'runs=' + bad.goodRuns + ' sum=' + bad.goodSum);
    const BAD_CASES = [
      ['2a ① enc が "rle" でない', bad.enc],
      ['2b ② run 合計が w*h より少ない', bad.sumShort],
      ['2c ② run 合計が w*h より多い', bad.sumLong],
      ['2d ③ 値が 0,1,2 以外 (3x2016)', bad.value],
      ['2e ④ data が数値', bad.dataNum],
      ['2f ④ data が null', bad.dataNull],
    ];
    for (const pair of BAD_CASES) {
      const label = pair[0], c = pair[1];
      check('§1 ' + label + ' → expandTiles が null / present:true / reason 非空 / validate が tiles-bad',
        c.map === null && c.present === true && typeof c.reason === 'string' && c.reason.length > 0 &&
        c.ok === false && c.codes.indexOf('tiles-bad') >= 0,
        'map=' + (c.map === null ? 'null' : typeof c.map) + ' present=' + c.present +
        ' ok=' + c.ok + ' codes=[' + c.codes.join(',') + '] reason=' +
        JSON.stringify(String(c.reason).slice(0, 60)));
    }
    const none = await hPage.evaluate(() => {
      const M = window.DFMapDef;
      function probe(d) {
        const v = M.validate(d), info = M.expandTilesInfo(d);
        return { has: M.hasTiles(d), map: M.expandTiles(d), present: info.present, reason: info.reason,
                 ok: v.ok, codes: v.issues.map(x => x.code), errs: v.errors.length };
      }
      const noKey = M.clone(M.DEFAULT_DUNGEON); delete noKey.tiles;
      const undef = M.clone(M.DEFAULT_DUNGEON); undef.tiles = undefined;
      return { withNull: probe(M.clone(M.DEFAULT_DUNGEON)), noKey: probe(noKey), undef: probe(undef),
               field: probe(M.clone(M.DEFAULT_FIELD)) };
    });
    const NONE_CASES = [['3a tiles:null', none.withNull], ['3b tiles キー無し', none.noKey],
                        ['3c tiles:undefined', none.undef], ['3d 屋外プリセット', none.field]];
    for (const pair of NONE_CASES) {
      const label = pair[0], c = pair[1];
      check('§1 ' + label + ' → 未指定と判定され validate は通る (「不正」と混同していない)',
        c.has === false && c.present === false && c.reason === null &&
        c.map === null && c.ok === true && c.codes.indexOf('tiles-bad') < 0 && c.errs === 0,
        'hasTiles=' + c.has + ' present=' + c.present + ' ok=' + c.ok + ' codes=[' + c.codes.join(',') + ']');
    }

    mark('§1 RLE: 行優先 (row-major) と encodeTiles の入力検査');
    const hand = await hPage.evaluate(() => {
      const M = window.DFMapDef;
      const Wd = 72, need = Wd * 28;
      const data = '0x100,1x3,2x' + (need - 103);
      const d = M.clone(M.DEFAULT_DUNGEON); d.tiles = { enc: 'rle', data: data };
      const map = M.expandTiles(d);
      const rect = M.buildMapData(M.DEFAULT_DUNGEON);
      return {
        rows: map ? map.length : -1, cols: (map && map[0]) ? map[0].length : -1,
        t99: map ? map[Math.floor(99 / Wd)][99 % Wd] : null,
        t100: map ? map[Math.floor(100 / Wd)][100 % Wd] : null,
        t102: map ? map[Math.floor(102 / Wd)][102 % Wd] : null,
        t103: map ? map[Math.floor(103 / Wd)][103 % Wd] : null,
        last: map ? map[27][71] : null,
        differsFromRect: map ? JSON.stringify(map) !== JSON.stringify(rect) : null,
        reenc: map ? M.encodeTiles(map).data : null, data: data,
        encBad: {
          notArray: M.encodeTiles('nope'), empty: M.encodeTiles([]),
          ragged: M.encodeTiles([[0, 0, 0], [0, 0]]), badValue: M.encodeTiles([[0, 3, 0], [0, 0, 0]]),
          strValue: M.encodeTiles([['0', '0'], ['0', '0']]), good: M.encodeTiles([[0, 0, 2], [2, 2, 1]]),
        },
      };
    });
    check('§1 4a ★行優先: index 99=床0 / 100,102=レア床1 / 103=壁2 / 末尾=壁2 (28行×72列)',
      hand.rows === 28 && hand.cols === 72 && hand.t99 === 0 && hand.t100 === 1 &&
      hand.t102 === 1 && hand.t103 === 2 && hand.last === 2,
      't99=' + hand.t99 + ' t100=' + hand.t100 + ' t102=' + hand.t102 +
      ' t103=' + hand.t103 + ' last=' + hand.last);
    check('§1 4b 手書き tiles は矩形生成の結果と別の地形 + 展開→再エンコードで data が完全一致 (正規形)',
      hand.differsFromRect === true && hand.reenc === hand.data,
      'differs=' + hand.differsFromRect + ' 正規形=' + (hand.reenc === hand.data));
    check('§1 4c encodeTiles が書き出せない入力 (非配列/空/不揃い/値外/文字列値) を全部 null で拒む',
      hand.encBad.notArray === null && hand.encBad.empty === null && hand.encBad.ragged === null &&
      hand.encBad.badValue === null && hand.encBad.strValue === null, JSON.stringify(hand.encBad));
    check('§1 4d 正しい 2 次元配列は run を行またぎで連結する ("0x2,2x3,1x1")',
      !!hand.encBad.good && hand.encBad.good.enc === 'rle' && hand.encBad.good.data === '0x2,2x3,1x1',
      JSON.stringify(hand.encBad.good));

    // ── §2 buildMapData の tiles 対応 ────────────────────────────────────
    mark('§2 buildMapData が tiles を返す / 不正は矩形へ落ちて warn 1 行 / 未指定は無言 / bandMask 不適用');
    const s2 = await hPage.evaluate(() => {
      const M = window.DFMapDef;
      // (a) 矩形とは似ても似つかない地形: rows10-12 / cols30-34 だけ床、他は全部壁
      const m = window.__allWall();
      for (let r = 10; r <= 12; r++) for (let c = 30; c <= 34; c++) m[r][c] = 0;
      m[11][32] = 1;
      const built = M.buildMapData(window.__withTiles(m));
      // (b) 不正 tiles 4 形 → 矩形へ落ちて [mapdef] warn 1 行
      const badOut = {};
      const cases = { enc: { enc: 'rle2', data: '2x2016' }, sumShort: { enc: 'rle', data: '2x5' },
                      value: { enc: 'rle', data: '3x2016' }, dataNum: { enc: 'rle', data: 2016 } };
      for (const k in cases) {
        window.__clearWarns();
        const d = window.__base(); d.tiles = cases[k];
        badOut[k] = { built: M.buildMapData(d), used: M.mapUsed(d), warns: window.__mapdefWarns().slice() };
      }
      // (c) 未指定 / 正常 tiles では warn 0 件
      const quiet = {};
      function runQuiet(label, d) {
        window.__clearWarns(); M.buildMapData(d); M.mapUsed(d);
        quiet[label] = window.__mapdefWarns().slice();
      }
      runQuiet('null', M.clone(M.DEFAULT_DUNGEON));
      const noKey = M.clone(M.DEFAULT_DUNGEON); delete noKey.tiles; runQuiet('noKey', noKey);
      runQuiet('field', M.clone(M.DEFAULT_FIELD));
      runQuiet('goodTiles', window.__withTiles(window.__rectMap()));
      // (d) bandMask: 帯 (row13-15) の外に床を描いた tiles と、tiles:null 版の対
      const bm = window.__allWall();
      for (let c = 30; c <= 34; c++) { bm[2][c] = 0; bm[14][c] = 0; bm[25][c] = 0; }
      const withTiles = window.__withTiles(bm, { flags: { bandMask: true } });
      const noTiles = M.clone(M.DEFAULT_DUNGEON); noTiles.flags = { bandMask: true };
      const A = M.buildMapData(withTiles), B = M.buildMapData(noTiles);
      const rowFloors = (mm, r) => { let n = 0; for (let c = 0; c < 72; c++) if (mm[r][c] !== 2) n++; return n; };
      return {
        want: m, built: built, rect: window.__rectMap(), rectUsed: M.mapUsed(M.DEFAULT_DUNGEON),
        badOut: badOut, quiet: quiet,
        band: { tiles: { r2: rowFloors(A, 2), r14: rowFloors(A, 14), r25: rowFloors(A, 25) },
                rects: { r2: rowFloors(B, 2), r14: rowFloors(B, 14), r25: rowFloors(B, 25) },
                used: M.mapUsed(withTiles) },
      };
    });
    const hBuilt = histogram2D(s2.built), hRect = histogram2D(s2.rect);
    check('§2 1a ★buildMapData(tiles 付き) が tiles の 2 次元配列をそのまま返す (deep-equal)',
      deepEqual2D(s2.want, s2.built), 'rows=' + (s2.built ? s2.built.length : 'null'));
    check('§2 1b ★矩形由来の結果とは別物 + 母集団ガード (床0=14 / レア床1=1 / 壁2=2001)',
      !deepEqual2D(s2.rect, s2.built) &&
      (hBuilt[0] | 0) === 14 && (hBuilt[1] | 0) === 1 && (hBuilt[2] | 0) === W * H - 15,
      '矩形 0=' + (hRect[0] | 0) + ' → tiles 0=' + (hBuilt[0] | 0) +
      ' / 1=' + (hBuilt[1] | 0) + ' / 2=' + (hBuilt[2] | 0));
    for (const k of ['enc', 'sumShort', 'value', 'dataNum']) {
      const c = s2.badOut[k];
      check('§2 2-' + k + ' 不正 tiles → 矩形由来と同じ map + [mapdef] warn が 1 行だけ + mapUsed も矩形',
        deepEqual2D(s2.rect, c.built) && c.warns.length === 1 &&
        /tiles を展開できないため矩形生成へ落ちました/.test(c.warns[0]) && sameBox(c.used, s2.rectUsed),
        'deepEqual=' + deepEqual2D(s2.rect, c.built) + ' warns=' + c.warns.length + ' used=' + box(c.used));
    }
    check('§2 3a 未指定 (null / キー無し / 屋外) と正常 tiles では [mapdef] warn が 0 件 (常時発火でない)',
      ['null', 'noKey', 'field', 'goodTiles'].every(k => s2.quiet[k].length === 0),
      JSON.stringify(Object.keys(s2.quiet).map(k => k + '=' + s2.quiet[k].length)));
    check('§2 4G 母集団ガード: tiles:null + bandMask:true では帯の外が実際に潰れる (row2=0 / row25=0 / row14>0)',
      s2.band.rects.r2 === 0 && s2.band.rects.r25 === 0 && s2.band.rects.r14 > 0,
      'row2=' + s2.band.rects.r2 + ' row14=' + s2.band.rects.r14 + ' row25=' + s2.band.rects.r25);
    check('§2 4a ★tiles があるとき bandMask は適用されない (row2=5 / row14=5 / row25=5 が残る)',
      s2.band.tiles.r2 === 5 && s2.band.tiles.r14 === 5 && s2.band.tiles.r25 === 5,
      'row2=' + s2.band.tiles.r2 + ' row14=' + s2.band.tiles.r14 + ' row25=' + s2.band.tiles.r25);
    check('§2 4b mapUsed も帯の外 (r2-25) まで広がる (bandMask に潰されていない)',
      sameBox(s2.band.used, { c0: 30, c1: 34, r0: 2, r1: 25 }), box(s2.band.used));

    // ── §3 ★★mapUsed = tiles の外接矩形 (黒帯の唯一の検出器) ─────────────
    mark('§3 ★mapUsed が tiles の外接矩形になる (広がる / 狭まる / 全部壁)');
    const s3 = await hPage.evaluate(() => {
      const M = window.DFMapDef;
      const wide = JSON.parse(JSON.stringify(window.__rectMap()));
      wide[2][3] = 0; wide[26][70] = 1;                       // 部屋の外へ床を 1 枚ずつ足す
      const dWide = window.__withTiles(wide);
      const narrow = window.__allWall();
      for (let r = 10; r <= 12; r++) for (let c = 30; c <= 34; c++) narrow[r][c] = 0;
      return {
        rectUsed: M.mapUsed(M.DEFAULT_DUNGEON),
        wide: M.mapUsed(dWide), narrow: M.mapUsed(window.__withTiles(narrow)),
        empty: M.mapUsed(window.__withTiles(window.__allWall())),
        roomsUnchanged: JSON.stringify(dWide.rooms.map(r => r.rect)) ===
                        JSON.stringify(M.DEFAULT_DUNGEON.rooms.map(r => r.rect)),
      };
    });
    check('§3 G0 母集団ガード: rooms/corridors は 3 ケースとも既定のまま (矩形は動かしていない)',
      s3.roomsUnchanged === true, 'roomsUnchanged=' + s3.roomsUnchanged);
    check('§3 1a ★部屋の外へ床を足すと mapUsed が**広がる** (c3-70 / r2-26) かつ矩形由来と別物',
      sameBox(s3.wide, { c0: 3, c1: 70, r0: 2, r1: 26 }) && !sameBox(s3.wide, s3.rectUsed),
      '矩形由来=' + box(s3.rectUsed) + '  →  tiles=' + box(s3.wide));
    check('§3 1b ★部屋を壁で潰すと mapUsed が**狭まる** (c30-34 / r10-12)',
      sameBox(s3.narrow, { c0: 30, c1: 34, r0: 10, r1: 12 }) && !sameBox(s3.narrow, s3.rectUsed),
      '矩形由来=' + box(s3.rectUsed) + '  →  tiles=' + box(s3.narrow));
    check('§3 1c 全部壁の tiles は既存の「該当なし」と同じ全面 (c0-71 / r0-27) へ落ちる',
      sameBox(s3.empty, { c0: 0, c1: 71, r0: 0, r1: 27 }), box(s3.empty));

    // ── §4 lint が tiles 対応になっている ────────────────────────────────
    mark('§4 lint: 部屋の外の床 warning / 連結性が tiles を見る / band-mask 文言の切替');
    const s4 = await hPage.evaluate(() => {
      const M = window.DFMapDef;
      const lint = (d) => {
        const r = M.lintMapDef(d, { catalog: null });
        return { codes: r.warnings.map(w => w.code), errCodes: r.errors.map(e => e.code),
                 hit: r.warnings.filter(w => w.code === 'tiles-outside-rooms'), nWarn: r.warnings.length,
                 shape: (typeof r.ok === 'boolean' && Array.isArray(r.errors) && Array.isArray(r.warnings)) };
      };
      /* ★母集団ガード (G0) 用。「その入力で lint が**終盤まで**走った」ことを入力ごとに証明する。
       *   全部屋の bossSlot を外すと no-boss-slot が必ず積まれる。この warning は
       *   tiles-outside-rooms より**後段**で積まれるので、出れば途中で早期 return していない証拠。
       *  ⚠ 旧 G0 は「3 ケースとも warnings が 1 件以上」だったが、これは Phase 4 項目2 で
       *    廃止された painting-aspect の**誤検出** (面積 150 以上の部屋に常時警告) へ暗黙に
       *    依存していた。グローバルな件数で母集団を測ると、機能が増減した瞬間に壊れる。 */
      const reachedEnd = (d) => {
        const x = JSON.parse(JSON.stringify(d));
        x.rooms.forEach(r => { r.bossSlot = null; });
        return M.lintMapDef(x, { catalog: null }).warnings.filter(w => w.code === 'no-boss-slot').length;
      };
      const inside = window.__withTiles(window.__rectMap());            // 焼き固めそのもの
      const outMap = JSON.parse(JSON.stringify(window.__rectMap()));
      outMap[3][10] = 0; outMap[3][11] = 0; outMap[3][12] = 0; outMap[3][13] = 1;
      const outsideDef = window.__withTiles(outMap);
      const outsideLint = lint(outsideDef);
      const blockedMap = JSON.parse(JSON.stringify(window.__rectMap()));
      for (let r = 13; r <= 15; r++) for (let c = 44; c <= 46; c++) blockedMap[r][c] = 2;  // 廊下を塞ぐ
      const bandTiles = window.__withTiles(window.__rectMap(), { flags: { bandMask: true } });
      return {
        inside: lint(inside), outside: outsideLint, none: lint(M.clone(M.DEFAULT_DUNGEON)),
        reached: { inside: reachedEnd(inside), outside: reachedEnd(outsideDef),
                   none: reachedEnd(M.clone(M.DEFAULT_DUNGEON)) },
        blocked: lint(window.__withTiles(blockedMap)), open: lint(M.clone(M.DEFAULT_DUNGEON)),
        bandMsg: M.lintMapDef(bandTiles, { catalog: null }).warnings
          .filter(w => w.code === 'band-mask').map(w => w.message),
        outMsg: (outsideLint.hit[0] || {}).message,
        outAt: (outsideLint.hit[0] || {}).at, outSev: (outsideLint.hit[0] || {}).severity,
      };
    });
    /* ★Phase 4 項目2 で書き直した。旧 G0 は「3 ケースとも warnings が 1 件以上」で、これは
     *   廃止された painting-aspect の誤検出に暗黙依存していた (グローバルな件数で母集団を
     *   測る型の脆さ)。ガードの意図 =「lint が早期 return せず最後まで走った」を、
     *   入力ごとに no-boss-slot (tiles-outside-rooms より後段の warning) で直接測る形にした。 */
    check('§4 G0 母集団ガード: 3 ケースとも lint が終盤 (no-boss-slot) まで到達し {ok,errors[],warnings[]} を返す (装置が動いている)',
      s4.reached.inside === 1 && s4.reached.outside === 1 && s4.reached.none === 1 &&
      s4.inside.shape && s4.outside.shape && s4.none.shape,
      'no-boss-slot到達 inside=' + s4.reached.inside + ' outside=' + s4.reached.outside +
      ' none=' + s4.reached.none + ' / warn件数 ' +
      [s4.inside.nWarn, s4.outside.nWarn, s4.none.nWarn].join('/'));
    check('§4 1a ★部屋の外に床を描いた tiles で tiles-outside-rooms が**出る** / 中だけなら**出ない** / tiles 無しでも出ない',
      s4.outside.hit.length === 1 && s4.inside.hit.length === 0 && s4.none.hit.length === 0,
      'outside=[' + s4.outside.codes.join(',') + '] inside=[' + s4.inside.codes.join(',') + ']');
    check('§4 1b 新 issue の形が既存と揃っている (severity=warning / at=[10,3] / errors に混ざらない / 内訳を出す)',
      s4.outSev === 'warning' && Array.isArray(s4.outAt) && s4.outAt[0] === 10 && s4.outAt[1] === 3 &&
      s4.outside.errCodes.indexOf('tiles-outside-rooms') < 0 &&
      /4 タイル/.test(s4.outMsg || '') && /床0 = 3/.test(s4.outMsg || '') && /レア床1 = 1/.test(s4.outMsg || ''),
      JSON.stringify({ sev: s4.outSev, at: s4.outAt }) + ' / ' + String(s4.outMsg).slice(0, 90));
    check('§4 2a ★tiles で廊下を塞ぐと unreachable-room が出る (lint が buildMapData の tiles を見ている証拠)',
      s4.blocked.errCodes.indexOf('unreachable-room') >= 0, 'errors=[' + s4.blocked.errCodes.join(',') + ']');
    check('§4 2b 対照: tiles 無しの既定では unreachable-room が出ない (空振りでない)',
      s4.open.errCodes.indexOf('unreachable-room') < 0, 'errors=[' + s4.open.errCodes.join(',') + ']');
    check('§4 3a bandMask + tiles の band-mask warning が「適用されません」へ切り替わる (嘘を言わない)',
      s4.bandMsg.length === 1 && /適用されません/.test(s4.bandMsg[0]),
      'n=' + s4.bandMsg.length + ' / ' + (s4.bandMsg[0] || 'なし'));
    check('§4 4a ハーネス実行中に pageerror / console.error / 4xx が 0 件', hErrs.length === 0,
      hErrs.slice(0, 3).join(' | ') || 'なし');
    await hPage.close();

    // ══════════════════════════════════════════════════════════════════════
    // §5 / §6 — ゲーム側の配線 (index.html)
    // ══════════════════════════════════════════════════════════════════════
    mark('§5 index.html に自由タイルを流し込む (mapData ≡ tiles / MAP_USED / 黒帯)');
    const tl = await runIndex(browser, BASE, { payload: playPayload() });
    console.log('     isCustom=' + tl.isCustom + ' tilesNull=' + tl.tilesNull
      + ' MAP_USED=' + tl.mapUsed + ' mapHash=' + sha(tl.mapJson));
    check('§5 0a DFMapDef が読み込まれている (js/df-mapdef.js が 404 でない)',
      tl.hasDFMapDef === true, 'hasDFMapDef=' + tl.hasDFMapDef);
    check('§5 0b 生成クエストとして起動し、payload の mapDef が採用されている',
      tl.scenarioId === 'generated-quest' && tl.isCustom === true && tl.mapdefId === 'drv-step3-tiles',
      'scenarioId=' + tl.scenarioId + ' isCustom=' + tl.isCustom + ' id=' + tl.mapdefId);
    check('§5 0c pageerror / console.error / HTTP 4xx-5xx が 0 件', tl.errs.length === 0,
      tl.errs.slice(0, 3).join(' | '));
    check('§5 0d 404 が 0 件 (favicon 除く)', rec.notFound.length === 0,
      'notFound=' + JSON.stringify(rec.notFound.slice(0, 5)));
    check('§5 1a MAPDEF.tiles が生きている (raw でも 0 でもない)',
      tl.tilesNull === false && tl.tilesLen === PLAY_TILES.data.length,
      'len=' + tl.tilesLen + ' (期待 ' + PLAY_TILES.data.length + ')');
    check('§5 1b ★mapData が tiles と 1 タイル残らず一致する (28 行 × 72 列)',
      tl.mapJson === PLAY_TILES_JSON && tl.mapRows === 28 && JSON.stringify(tl.mapCols) === '[72]',
      'hash ' + sha(tl.mapJson) + ' vs ' + sha(PLAY_TILES_JSON));
    check('§5 1c 母集団ガード: mapData に床(0) と岩盤(2) の両方がある',
      (tl.mapTally['0'] || 0) > 0 && (tl.mapTally['2'] || 0) > 0, JSON.stringify(tl.mapTally));
    check('§5 1d 矩形では作れない場所が床になっている (斜め坑道 r16c36 / 北の縦坑 r10c45 / 東の横坑 r20c56)',
      tl.tileStair === 0 && tl.tileNorthShaft === 0 && tl.tileEastAdit === 0,
      '斜め=' + tl.tileStair + ' 縦坑=' + tl.tileNorthShaft + ' 横坑=' + tl.tileEastAdit);
    check('§5 2a ★MAP_USED が tiles の外接矩形と一致する',
      tl.mapUsed === JSON.stringify(PLAY_TILES_BBOX),
      tl.mapUsed + ' (期待 ' + JSON.stringify(PLAY_TILES_BBOX) + ')');
    check('§5 2b ★MAP_USED が rooms+corridors の外接矩形と別の値 (矩形のままでは PASS しない)',
      tl.mapUsed !== JSON.stringify(PLAY_RECT_BBOX),
      tl.mapUsed + ' vs 矩形 ' + JSON.stringify(PLAY_RECT_BBOX));
    check('§5 2c ★★MAP_USED の外側に歩けるタイルが 1 枚も残っていない (= 画面が黒帯にならない直接測定)',
      tl.outsideMapUsed === 0 && tl.nonWall > 200,
      'outside=' + tl.outsideMapUsed + ' / 非壁=' + tl.nonWall);
    check('§5 3a 敵が 6 体とも岩盤の上に居ない (スポーン救済が自由タイルでも効いている)',
      tl.spawnsLen === 6 && tl.spawnsOnWall === 0,
      'spawns=' + tl.spawnsLen + ' onWall=' + tl.spawnsOnWall);
    check('§5 3b BOSS_ROOM_IDX / OBJECTIVE_ROOMS が rooms (意味) から導かれている (tiles に潰されていない)',
      tl.bossRoomIdx === 2 && tl.objectiveRooms === 2,
      'boss=' + tl.bossRoomIdx + ' objective=' + tl.objectiveRooms);

    mark('§6 撤退スイッチ ?mapdef=raw / ?mapdef=0 / 既定経路');
    const raw = await runIndex(browser, BASE, { payload: playPayload() }, '?mapdef=raw');
    const notiles = await runIndex(browser, BASE,
      { payload: playPayload({ mapDef: playMapDef({ tiles: null }) }) });
    const zero = await runIndex(browser, BASE, { payload: playPayload() }, '?mapdef=0');
    /* ⚠ `'?graph=0'` は 2026-08-08 (P5) に足した。廃坑が既定で分岐版になったので、
     *   付けないと「既定経路 (素の goblin-mine) は MAP_USED も ROOMS も既定のまま」を
     *   測る対照が分岐ノードの幾何になってしまう。 */
    const def = await runIndex(browser, BASE, { scen: 'goblin-mine' }, '?graph=0');
    console.log('     raw   : MAP_USED=' + raw.mapUsed + ' mapHash=' + sha(raw.mapJson));
    console.log('     tiles を外した同一 payload: mapHash=' + sha(notiles.mapJson));
    console.log('     zero  : rooms=' + zero.roomsJson + ' MAP_USED=' + zero.mapUsed);
    check('§6 1a ?mapdef=raw で MAPDEF.tiles が null に落ち、mapData が tiles 版と違う',
      raw.tilesNull === true && raw.mapJson !== tl.mapJson,
      'tilesNull=' + raw.tilesNull + ' ' + sha(raw.mapJson) + ' vs ' + sha(tl.mapJson));
    check('§6 1b ★raw の mapData が「tiles を外した同一 payload」と 1 タイル残らず一致 (= 矩形生成へ戻った)',
      raw.mapJson === notiles.mapJson && raw.mapRows === 28,
      sha(raw.mapJson) + ' vs ' + sha(notiles.mapJson));
    check('§6 1c raw では MAP_USED が rooms+corridors の外接矩形へ戻る',
      raw.mapUsed === JSON.stringify(PLAY_RECT_BBOX), raw.mapUsed);
    check('§6 1d ★raw は tiles だけを落とす (rooms / start / isCustom は生きたまま)',
      raw.isCustom === true && raw.roomsJson === JSON.stringify(PLAY_ROOMS.map(r => r.rect)) &&
      raw.startTx === 10 && raw.startTy === 20,
      'isCustom=' + raw.isCustom + ' start=' + raw.startTx + ',' + raw.startTy);
    check('§6 1e 斜め坑道 (r16c36) が壁へ戻り、部屋の中 (r14c22) は床のまま',
      raw.tileStair === 2 && raw.tileRoomEdge !== 2,
      '斜め=' + raw.tileStair + ' 部屋の角=' + raw.tileRoomEdge);
    check('§6 1f [mapdef] ?mapdef=raw の警告が raw のときだけ 1 行出る (常時発火でない)',
      raw.warns.filter(w => w.indexOf('?mapdef=raw') >= 0).length === 1 &&
      tl.warns.filter(w => w.indexOf('?mapdef=raw') >= 0).length === 0,
      'raw=' + raw.warns.filter(w => w.indexOf('?mapdef=raw') >= 0).length +
      ' / tiles版=' + tl.warns.filter(w => w.indexOf('?mapdef=raw') >= 0).length);
    check('§6 2a ★?mapdef=0 は raw の上位集合 (isCustom=false / tiles も null / 既定 2 室 / 起点 24,13)',
      zero.isCustom === false && zero.tilesNull === true &&
      zero.roomsJson === DEFAULT_ROOMS_JSON && zero.startTx === 24 && zero.startTy === 13,
      'isCustom=' + zero.isCustom + ' tilesNull=' + zero.tilesNull + ' rooms=' + zero.roomsJson);
    check('§6 2b ?mapdef=0 では MAP_USED が既定 (c24-68 / r5-22) へ戻り、mapData も tiles/raw と別物',
      zero.mapUsed === JSON.stringify(DEFAULT_MAP_USED) &&
      zero.mapJson !== tl.mapJson && zero.mapJson !== raw.mapJson, zero.mapUsed);
    check('§6 3a 既定経路 (素の goblin-mine) は MAP_USED も ROOMS も既定のまま (寄せ替えの非退行)',
      def.mapUsed === JSON.stringify(DEFAULT_MAP_USED) && def.roomsJson === DEFAULT_ROOMS_JSON &&
      def.tilesNull === true && def.isCustom === false,
      'MAP_USED=' + def.mapUsed + ' tilesNull=' + def.tilesNull);
    check('§6 3b 既定経路では [mapdef] の警告が 1 行も出ない / エラーも 0 件',
      def.warns.filter(w => w.indexOf('[mapdef]') >= 0).length === 0 && def.errs.length === 0,
      JSON.stringify(def.warns).slice(0, 120) + ' errs=' + def.errs.length);

    // ══════════════════════════════════════════════════════════════════════
    // §7 / §8 — map-editor.html (ブラシ UI と入出力)
    // ══════════════════════════════════════════════════════════════════════
    mark('§7 ブラシ UI (map-editor.html)');
    const edBoot = await bootPage(browser, BASE + '/map-editor.html', null,
      { wait: false, waitUntil: 'load' });
    const edPage = edBoot.page, edErrs = edBoot.errs;
    await edPage.waitForFunction(() => !!window.__mapEditor, { timeout: 30000, polling: 100 });
    await edPage.evaluate(() => window.__mapEditor.enemyCatalogReady);
    await edPage.evaluate(() => {
      window.__h = (md) => md.map(r => r.join('')).join('|');
      window.__count = (md, v) => { let n = 0; for (const r of md) for (const c of r) if (c === v) n++; return n; };
      window.__reset = () => {
        const E = window.__mapEditor;
        E.loadPreset('dungeon'); E.setTileBrushValue(0); E.setTileBrushSize(1); E.setTool('select');
      };
      /* ⚠⚠ 既定プリセットの上でタイル値を数えてはいけない (元からレア床(1) が 137 枚ある)。
       *   数える節は必ずこの「全面 壁(2) の白紙」を敷いてから測る。 */
      window.__blank = () => {
        const E = window.__mapEditor, M = E.MapDef;
        const map = [];
        for (let r = 0; r < 28; r++) {
          const row = new Array(72);
          for (let c = 0; c < 72; c++) row[c] = 2;
          map.push(row);
        }
        const d = E.getMapDef(); d.tiles = M.encodeTiles(map); E.setMapDef(d);
        return map;
      };
    });
    const seam = await edPage.evaluate(() => {
      const E = window.__mapEditor;
      let rare = 0;
      const md = E.buildMapData();
      for (const r of md) for (const c of r) if (c === 1) rare++;
      return { version: E.version, keys: Object.keys(E).sort(), tools: E.TOOLS.map(t => t.key), rare: rare };
    });
    console.log('     version=' + seam.version + ' TOOLS=' + JSON.stringify(seam.tools)
      + '  既定プリセットのレア床=' + seam.rare + ' 枚');
    const NEED_KEYS = ['setTileBrushValue', 'setTileBrushSize', 'getTileBrush', 'bakeTiles', 'clearTiles', 'tilesInfo'];
    check('§7 0a 検証シームに項目4 の名前が揃い / TOOLS に brush・fill / version>=10',
      NEED_KEYS.every(k => seam.keys.includes(k)) && seam.tools.includes('brush') &&
      seam.tools.includes('fill') && seam.version >= 10,
      'version=' + seam.version + ' 不足=' + JSON.stringify(NEED_KEYS.filter(k => !seam.keys.includes(k))));
    check('§7 0b ⚠ 既定プリセットには元からレア床(1) がある = 値を数える節は白紙を敷く必要がある',
      seam.rare > 0, 'レア床=' + seam.rare + ' 枚');

    const s7a = await edPage.evaluate(() => {
      const E = window.__mapEditor;
      window.__reset();
      const before = E.tilesInfo();
      const mdBefore = E.buildMapData(), hBefore = window.__h(mdBefore);
      E.setTool('brush'); E.setTileBrushValue(0); E.setTileBrushSize(1);
      const wasWall = mdBefore[3][10];
      const ok = E.dragTile([10, 3], [10, 3]);           // 岩盤のど真ん中 = 矩形からは絶対に生まれない床
      const after = E.tilesInfo(), mdAfter = E.buildMapData(), def = E.getMapDef();
      const exp = E.MapDef.expandTiles(def);
      let diff = 0;
      for (let r = 0; r < mdAfter.length; r++) for (let c = 0; c < mdAfter[r].length; c++)
        if (mdAfter[r][c] !== mdBefore[r][c]) diff++;
      return { ok: ok, wasWall: wasWall, beforePresent: before.present, afterPresent: after.present,
               afterOk: after.ok, enc: after.enc, chars: after.chars, runs: after.runs,
               valAt: mdAfter[3][10], changed: hBefore !== window.__h(mdAfter), diff: diff,
               expMatches: !!exp && window.__h(exp) === window.__h(mdAfter),
               rooms: def.rooms.length, slots: def.rooms.reduce((n, r) => n + r.enemySlots.length, 0) };
    });
    check('§7 1G 母集団ガード: 塗る前は tiles 未指定 / 塗った 1 タイルは元々 壁(2)',
      s7a.beforePresent === false && s7a.wasWall === 2 && s7a.ok === true,
      'present=' + s7a.beforePresent + ' 元の値=' + s7a.wasWall);
    check('§7 1a ★一筆で mapDef.tiles が生える (enc="rle" / 展開できる) + 変わったのはその 1 枚だけ',
      s7a.afterPresent === true && s7a.afterOk === true && s7a.enc === 'rle' && s7a.chars > 0 &&
      s7a.valAt === 0 && s7a.changed === true && s7a.diff === 1,
      'enc=' + s7a.enc + ' chars=' + s7a.chars + ' runs=' + s7a.runs + ' 差分=' + s7a.diff);
    check('§7 1b expandTiles(tiles) ≡ buildMapData (tiles が唯一の幾何になっている)',
      s7a.expMatches === true, 'expandTiles ≡ buildMapData = ' + s7a.expMatches);
    check('§7 1c rooms は生き続ける (tiles = 幾何 / rooms = 意味 の分離が崩れていない)',
      s7a.rooms === 2 && s7a.slots === 8, 'rooms=' + s7a.rooms + ' enemySlots=' + s7a.slots);

    const s7b = await edPage.evaluate(() => {
      const E = window.__mapEditor;
      // (a) 対照: 焼き固め **前**に部屋を動かすと床も動く
      window.__reset();
      const h0 = window.__h(E.buildMapData());
      E.setTool('select'); E.selectAt(30, 10);
      const selA = E.getSelection();
      E.dragTile([30, 10], [33, 12], { shift: true });
      const movedRawChanged = h0 !== window.__h(E.buildMapData());
      // (b) 焼き固めてから同じだけ動かす
      window.__reset();
      E.setTool('brush'); E.setTileBrushValue(0); E.setTileBrushSize(1);
      E.dragTile([10, 3], [10, 3]);
      const hBaked = window.__h(E.buildMapData());
      const rectBefore = E.getMapDef().rooms[0].rect.slice();
      E.setTool('select'); E.selectAt(30, 10);
      const selB = E.getSelection();
      E.dragTile([30, 10], [33, 12], { shift: true });
      const rectAfter = E.getMapDef().rooms[0].rect.slice();
      return { selA: selA, selB: selB, movedRawChanged: movedRawChanged,
               rectBefore: rectBefore, rectAfter: rectAfter,
               roomMoved: JSON.stringify(rectBefore) !== JSON.stringify(rectAfter),
               floorMoved: hBaked !== window.__h(E.buildMapData()) };
    });
    check('§7 2G 対照: 焼き固め**前**なら部屋を動かすと床も動く (この節が空振りでない)',
      s7b.movedRawChanged === true && JSON.stringify(s7b.selA) === JSON.stringify({ kind: 'room', index: 0 }),
      '床が動いた=' + s7b.movedRawChanged + ' 選択=' + JSON.stringify(s7b.selA));
    check('§7 2a 焼き固め後も部屋そのものは動く (rooms は生きている = 操作が効いている)',
      s7b.roomMoved === true && JSON.stringify(s7b.selB) === JSON.stringify({ kind: 'room', index: 0 }),
      JSON.stringify(s7b.rectBefore) + ' → ' + JSON.stringify(s7b.rectAfter));
    check('§7 2b ★★焼き固め後に部屋を動かしても床は 1 タイルも動かない (= 焼き固め方式の定義そのもの)',
      s7b.floorMoved === false, '床が動いた=' + s7b.floorMoved);

    const s7c = await edPage.evaluate(() => {
      const E = window.__mapEditor;
      window.__reset();
      const h0 = window.__h(E.buildMapData()), t0 = E.tilesInfo();
      E.setTool('brush'); E.setTileBrushValue(0); E.setTileBrushSize(1);
      E.dragTile([4, 3], [20, 3]);                        // 岩盤を横断する 1 ドラッグ
      const md1 = E.buildMapData(), h1 = window.__h(md1);
      let painted = 0; for (let c = 4; c <= 20; c++) if (md1[3][c] === 0) painted++;
      const u1 = E.undo();
      const h2 = window.__h(E.buildMapData()), t2 = E.tilesInfo();
      const r1 = E.redo();
      const h3 = window.__h(E.buildMapData()), t3 = E.tilesInfo();
      return { painted: painted, before: t0.present, u1: u1, r1: r1,
               backToStart: h2 === h0, tilesGone: t2.present === false,
               redoRestored: h3 === h1, tilesBack: t3.present === true && t3.ok === true };
    });
    check('§7 3G 母集団ガード: 1 ドラッグで 17 枚塗れている / 塗る前は tiles 未指定',
      s7c.painted === 17 && s7c.before === false, '塗れたタイル=' + s7c.painted);
    check('§7 3a ★★undo 1 回で**一筆まるごと**戻る (mapData が元通り / tiles も消える)',
      s7c.u1 === true && s7c.backToStart === true && s7c.tilesGone === true,
      'undo=' + s7c.u1 + ' 元通り=' + s7c.backToStart + ' tiles消えた=' + s7c.tilesGone);
    check('§7 3b redo 1 回で一筆まるごと戻る',
      s7c.r1 === true && s7c.redoRestored === true && s7c.tilesBack === true,
      'redo=' + s7c.r1 + ' 復元=' + s7c.redoRestored);

    const s7d = await edPage.evaluate(() => {
      const E = window.__mapEditor;
      window.__reset(); window.__blank();                 // ⚠ 白紙を敷いてから数える
      E.setTool('brush'); E.setTileBrushValue(1); E.setTileBrushSize(1);
      /* 検証シームの dragTile は begin(a) → update(b) → end(b) = **2 点しか通らない**。
         線形補間が無ければ端の 2 マスしか塗られない。 */
      E.dragTile([4, 2], [4, 25]);                        // 縦 24 マス
      const mdV = E.buildMapData();
      let vLine = 0; for (let r = 2; r <= 25; r++) if (mdV[r][4] === 1) vLine++;
      E.dragTile([50, 2], [61, 13]);                      // 斜め 12 マス
      const mdD = E.buildMapData();
      let dLine = 0; for (let k = 0; k <= 11; k++) if (mdD[2 + k][50 + k] === 1) dLine++;
      return { vLine: vLine, dLine: dLine, offLine: mdD[2][61], total: window.__count(mdD, 1) };
    });
    check('§7 4a ★離れた 2 点の縦ドラッグで間のタイルが全部塗られる (24/24) / 斜めも Bresenham で連続 (12/12)',
      s7d.vLine === 24 && s7d.dLine === 12, '縦=' + s7d.vLine + '/24 斜め=' + s7d.dLine + '/12');
    check('§7 4b 負のコントロール: 線から外れたタイルは塗られていない (総数も過剰でない)',
      s7d.offLine === 2 && s7d.total === 36, '線外の値=' + s7d.offLine + ' 総数=' + s7d.total);

    const s7e = await edPage.evaluate(() => {
      const E = window.__mapEditor, M = E.MapDef;
      window.__reset();
      const map = [];
      for (let r = 0; r < 28; r++) {
        const row = new Array(72);
        for (let c = 0; c < 72; c++) row[c] = 2;
        map.push(row);
      }
      for (let r = 10; r <= 14; r++) for (let c = 10; c <= 14; c++) map[r][c] = 0;   // 部屋 A
      for (let r = 10; r <= 14; r++) for (let c = 20; c <= 24; c++) map[r][c] = 0;   // 部屋 B (非連結)
      const d = E.getMapDef(); d.tiles = M.encodeTiles(map); E.setMapDef(d);
      const before = E.buildMapData();
      const wall0 = window.__count(before, 2), floor0 = window.__count(before, 0);
      E.setTool('fill'); E.setTileBrushValue(1);
      E.dragTile([12, 12], [12, 12]);
      const after = E.buildMapData();
      let inA = 0, inB = 0;
      for (let r = 10; r <= 14; r++) for (let c = 10; c <= 14; c++) if (after[r][c] === 1) inA++;
      for (let r = 10; r <= 14; r++) for (let c = 20; c <= 24; c++) if (after[r][c] === 1) inB++;
      return { wall0: wall0, floor0: floor0, inA: inA, inB: inB, wall1: window.__count(after, 2),
               rare1: window.__count(after, 1), floor1: window.__count(after, 0) };
    });
    check('§7 5G 母集団ガード: 壁 1966 / 床 50 (5×5 が 2 部屋) の盤ができている',
      s7e.wall0 === W * H - 50 && s7e.floor0 === 50, '壁=' + s7e.wall0 + ' 床=' + s7e.floor0);
    check('§7 5a ★fill は連結領域 A の 25 タイルだけを塗る',
      s7e.inA === 25 && s7e.rare1 === 25, 'A=' + s7e.inA + ' レア床総数=' + s7e.rare1);
    check('§7 5b ★壁を越えない (壁の枚数が 1 枚も減らず、隣の部屋 B は無傷)',
      s7e.wall1 === s7e.wall0 && s7e.inB === 0 && s7e.floor1 === 25,
      '壁=' + s7e.wall0 + '→' + s7e.wall1 + ' B=' + s7e.inB + ' 残った床=' + s7e.floor1);

    const s7f = await edPage.evaluate(() => {
      const E = window.__mapEditor;
      window.__reset();
      E.setTool('brush'); E.setTileBrushSize(1);
      const out = {}, sel = document.getElementById('tileValSel');
      [0, 1, 2].forEach((v, i) => {
        sel.value = String(v); sel.dispatchEvent(new Event('change'));   // ★実 UI と同じ経路
        const tx = 4 + i * 2, ty = 3;
        E.dragTile([tx, ty], [tx, ty]);
        out['v' + v] = { brush: E.getTileBrush().value, wrote: E.buildMapData()[ty][tx] };
      });
      sel.value = '0'; sel.dispatchEvent(new Event('change'));
      E.dragTile([30, 10], [30, 10]);
      const beforeErase = E.buildMapData()[10][30];
      document.getElementById('btnEraser').click();
      const brushAfter = E.getTileBrush().value;
      const eraserOn = document.getElementById('btnEraser').classList.contains('on');
      E.dragTile([30, 10], [30, 10]);
      const afterErase = E.buildMapData()[10][30];
      const bad2 = [E.setTileBrushValue(7), E.setTileBrushValue(null), E.setTileBrushValue('x')];
      return { out: out, beforeErase: beforeErase, afterErase: afterErase, brushAfter: brushAfter,
               eraserOn: eraserOn, bad: bad2, selVal: sel.value };
    });
    check('§7 6a 値パレット 0/1/2 が <select> の change 経由でそれぞれ意図どおりの値を書く',
      s7f.out.v0.brush === 0 && s7f.out.v0.wrote === 0 && s7f.out.v1.brush === 1 && s7f.out.v1.wrote === 1 &&
      s7f.out.v2.brush === 2 && s7f.out.v2.wrote === 2, JSON.stringify(s7f.out));
    check('§7 6b ★消しゴムボタンは壁(2) を書く筆 (床 0 → 2 / ボタンが .on になる)',
      s7f.beforeErase === 0 && s7f.afterErase === 2 && s7f.brushAfter === 2 && s7f.eraserOn === true,
      '床' + s7f.beforeErase + '→' + s7f.afterErase + ' 筆=' + s7f.brushAfter + ' .on=' + s7f.eraserOn);
    check('§7 6c 不正な筆の値は無視して現状維持する (壊れた値を黙って受け入れない)',
      s7f.bad.every(v => v === 2) && s7f.selVal === '2', JSON.stringify(s7f.bad));

    const s7g = await edPage.evaluate(() => {
      const E = window.__mapEditor;
      window.__reset();
      const out = {};
      [1, 3, 5].forEach((n) => {
        window.__blank();
        E.setTool('brush');
        const sizeSel = document.getElementById('tileSizeSel');
        sizeSel.value = String(n); sizeSel.dispatchEvent(new Event('change'));   // ★DOM 経由
        E.setTileBrushValue(1);
        E.dragTile([36, 14], [36, 14]);                   // 中央 = クランプされない
        out['s' + n] = { size: E.getTileBrush().size, painted: window.__count(E.buildMapData(), 1) };
      });
      window.__blank();
      E.setTileBrushSize(5); E.setTileBrushValue(1);
      E.dragTile([0, 0], [0, 0]);
      const corner = window.__count(E.buildMapData(), 1);
      window.__blank();
      E.dragTile([71, 27], [71, 27]);
      const md = E.buildMapData();
      return { out: out, corner: corner, corner2: window.__count(md, 1),
               wrapped: md[0][0] === 1 || md[0][71] === 1 || md[27][0] === 1 };
    });
    check('§7 7a ブラシサイズ 1/3/5 がそれぞれ 1/9/25 タイルを塗る (<select> の change 経由)',
      s7g.out.s1.size === 1 && s7g.out.s1.painted === 1 && s7g.out.s3.size === 3 && s7g.out.s3.painted === 9 &&
      s7g.out.s5.size === 5 && s7g.out.s5.painted === 25, JSON.stringify(s7g.out));
    check('§7 7b 境界クランプ: 隅で 5×5 を打つと 9 枚だけ / 反対側へ回り込まない',
      s7g.corner === 9 && s7g.corner2 === 9 && s7g.wrapped === false,
      '左上=' + s7g.corner + ' 右下=' + s7g.corner2 + ' 回り込み=' + s7g.wrapped);

    const s7h = await edPage.evaluate(() => {
      const E = window.__mapEditor;
      window.__reset();
      const badge = document.getElementById('tileBadge');
      const hRect = window.__h(E.buildMapData());
      const off = { text: badge.textContent, on: badge.classList.contains('on'),
                    bad: badge.classList.contains('bad') };
      E.setTool('brush'); E.setTileBrushValue(0); E.setTileBrushSize(3);
      E.dragTile([4, 3], [12, 3]);
      const hPainted = window.__h(E.buildMapData());
      const t1 = E.tilesInfo();
      const on = { text: badge.textContent, on: badge.classList.contains('on'),
                   bad: badge.classList.contains('bad') };
      const btn = document.getElementById('btnUnbake');
      const disabledWhileBaked = btn.disabled;
      btn.click();                                        // ★実 UI と同じ経路
      const t2 = E.tilesInfo();
      const hBack = window.__h(E.buildMapData());
      const off2 = { text: badge.textContent, on: badge.classList.contains('on') };
      const u = E.undo();
      const t3 = E.tilesInfo(), hUndone = window.__h(E.buildMapData());
      E.clearTiles(); E.clearTiles();
      const reason = E.lastReason();
      const disabledAfter = document.getElementById('btnUnbake').disabled;
      // 壊れた tiles → 「壊れています」表示 (silent fail-open にしない)
      const d = E.getMapDef(); d.tiles = { enc: 'rle', data: '0x5' }; E.setMapDef(d);
      const broken = { text: badge.textContent, on: badge.classList.contains('on'),
                       bad: badge.classList.contains('bad') };
      const info = E.tilesInfo();
      return { painted: hPainted !== hRect, t1: t1.present, t2: t2.present,
               t3: { p: t3.present, ok: t3.ok },
               hRectEqBack: hRect === hBack, disabledWhileBaked: disabledWhileBaked,
               undone: u && hUndone === hPainted, reason: reason, disabledAfter: disabledAfter,
               off: off, on: on, off2: off2, broken: broken,
               info: { present: info.present, ok: info.ok, reason: info.reason },
               brushInfo: document.getElementById('tileBrushInfo').textContent };
    });
    check('§7 8a 「矩形に戻す」で tiles が消え、幾何が矩形由来へ完全に戻る',
      s7h.painted === true && s7h.t1 === true && s7h.t2 === false &&
      s7h.hRectEqBack === true && s7h.disabledWhileBaked === false,
      'tiles=' + s7h.t1 + '→' + s7h.t2 + ' 矩形一致=' + s7h.hRectEqBack);
    check('§7 8b ★「矩形に戻す」は undo で取り消せる (tiles が戻る)',
      s7h.undone === true && s7h.t3.p === true && s7h.t3.ok === true, 'undo で塗った状態へ=' + s7h.undone);
    check('§7 8c tiles が無いときに押しても無言で終わらない (理由が残る / ボタンも disabled)',
      typeof s7h.reason === 'string' && s7h.reason.length > 0 && s7h.disabledAfter === true,
      '理由="' + s7h.reason + '" disabled=' + s7h.disabledAfter);
    check('§7 9a バッジ 3 状態が DOM に出ている (OFF / ★ON / ⚠壊れています)',
      /OFF/.test(s7h.off.text) && s7h.off.on === false && s7h.off.bad === false &&
      /ON/.test(s7h.on.text) && s7h.on.on === true && s7h.on.bad === false &&
      /OFF/.test(s7h.off2.text) && s7h.off2.on === false &&
      /壊/.test(s7h.broken.text) && s7h.broken.bad === true && s7h.broken.on === false,
      '"' + s7h.off.text + '" / "' + s7h.on.text + '" / "' + s7h.broken.text + '"');
    check('§7 9b 壊れた tiles は present:true / ok:false / reason 付き (黙って矩形へ落ちたように見せない)',
      s7h.info.present === true && s7h.info.ok === false && !!s7h.info.reason &&
      typeof s7h.brushInfo === 'string' && s7h.brushInfo.length > 0,
      'reason=' + s7h.info.reason + ' / 筆="' + s7h.brushInfo + '"');

    // 実測 (SPEC 項目4 の完了条件。以後は安価な性能回帰ガードとして残す)
    const s7z = await edPage.evaluate(() => {
      const E = window.__mapEditor, M = E.MapDef;
      const measure = () => {
        const def = E.getMapDef();
        const json = JSON.stringify({ schema: 'df-map-store/1', id: 'x', name: 'x',
                                      savedAt: '2026-08-02', mapDef: def });
        const N = 200;
        let t = performance.now();
        for (let i = 0; i < N; i++) M.sanitize(def, M.DEFAULT_DUNGEON);
        const sanMs = (performance.now() - t) / N;
        t = performance.now();
        for (let i = 0; i < N; i++) M.buildMapData(def);
        const buildMs = (performance.now() - t) / N;
        const info = E.tilesInfo();
        return { bytes: json.length, chars: info.chars, runs: info.runs, sanMs: sanMs, buildMs: buildMs };
      };
      window.__reset();
      E.fitToView();
      const rect = measure();
      let t = performance.now();
      for (let i = 0; i < 120; i++) E.render();
      const renderRect = (performance.now() - t) / 120;
      E.setTool('brush'); E.setTileBrushValue(0); E.setTileBrushSize(1);
      E.dragTile([10, 3], [10, 3]);
      const baked = measure();
      t = performance.now();
      for (let i = 0; i < 120; i++) E.render();
      const renderTiles = (performance.now() - t) / 120;
      for (let i = 0; i < 40; i++) {                       // ★最悪側 (run が増える) を作る
        E.setTileBrushValue(i % 3);
        E.dragTile([2 + (i * 7) % 68, 1 + (i * 5) % 26], [2 + (i * 13) % 68, 1 + (i * 11) % 26]);
      }
      const messy = measure();
      t = performance.now();
      for (let i = 0; i < 40; i++) E.dragTile([4, 6 + (i % 3)], [64, 6 + (i % 3)]);
      const stroke = (performance.now() - t) / 40;
      const sv = E.saveLocal('phase3-step3-perf');
      let stored = 0;
      try { stored = (localStorage.getItem('dfMapEditor.maps.' + sv.id) || '').length; } catch (e) { stored = -1; }
      E.deleteLocal(sv.id);
      return { rect: rect, baked: baked, messy: messy, renderRect: renderRect,
               renderTiles: renderTiles, stroke: stroke, saveOk: sv.ok, stored: stored };
    });
    console.log('     localStorage 矩形のみ=' + s7z.rect.bytes + ' B / 焼き固め直後=' + s7z.baked.bytes
      + ' B (' + s7z.baked.runs + ' run) / 乱雑 40 ストローク後=' + s7z.messy.bytes
      + ' B (' + s7z.messy.runs + ' run) / 実書込=' + s7z.stored + ' B');
    console.log('     sanitize=' + s7z.messy.sanMs.toFixed(4) + ' ms  buildMapData='
      + s7z.messy.buildMs.toFixed(4) + ' ms  render 矩形=' + s7z.renderRect.toFixed(3)
      + ' ms / 自由タイル=' + s7z.renderTiles.toFixed(3) + ' ms  60タイル1ストローク='
      + s7z.stroke.toFixed(3) + ' ms');
    check('§7 10a 母集団ガード: 乱雑に塗ると run が焼き固め直後より増えている (最悪側を実際に作れた)',
      s7z.messy.runs > s7z.baked.runs && s7z.messy.chars > 0 && s7z.saveOk === true && s7z.stored > 0,
      'run ' + s7z.baked.runs + ' → ' + s7z.messy.runs + ' / 実書込 ' + s7z.stored + ' B');
    check('§7 10b 保存サイズが localStorage の実用域 (< 200KB) / sanitize が編集ごとでも軽い (< 1.0ms)',
      s7z.stored < 200 * 1024 && s7z.messy.sanMs < 1.0,
      s7z.stored + ' B / ' + s7z.messy.sanMs.toFixed(4) + ' ms');
    check('§7 10c render() もブラシ 1 ストロークも 16ms 予算内 (mapUsed の tiles 再展開込み)',
      s7z.renderTiles < 16 && s7z.renderRect < 16 && s7z.stroke < 16,
      'render 自由タイル=' + s7z.renderTiles.toFixed(3) + 'ms / ストローク=' + s7z.stroke.toFixed(3) + 'ms');

    // ── §8 ★exportJSON → importJSON の往復同一性 (項目4 で未 assert だった穴) ──
    mark('§8 ★exportJSON → importJSON の往復同一性 (tiles ごと)');
    const s8 = await edPage.evaluate((tilesRLE) => {
      const E = window.__mapEditor;
      const out = {};
      // (a) ブラシで塗った mapDef の往復
      window.__reset();
      E.setTool('brush'); E.setTileBrushValue(0); E.setTileBrushSize(3);
      E.dragTile([4, 3], [20, 6]);
      const painted = E.getMapDef();
      const json1 = E.exportJSON();
      const imp1 = E.importJSON(json1);
      out.painted = { src: painted, back: E.getMapDef(), ok: imp1.ok, reason: imp1.reason || null,
                      json1: json1, json2: E.exportJSON(),
                      hSrc: window.__h(E.MapDef.buildMapData(painted)),
                      hBack: window.__h(E.buildMapData()) };
      // (b) ドライバが作った「矩形では作れない」tiles を流し込んでの往復
      window.__reset();
      const d = E.getMapDef(); d.tiles = JSON.parse(JSON.stringify(tilesRLE)); E.setMapDef(d);
      const src2 = E.getMapDef();
      const json3 = E.exportJSON();
      const imp2 = E.importJSON(json3);
      out.injected = { src: src2, back: E.getMapDef(), ok: imp2.ok, json3: json3, json4: E.exportJSON() };
      /* (c) ★既知の穴の実測: sanitize は tiles の中身を検査せず clone するだけなので、
       *   **非オブジェクトの壊れた tiles は黙って null に潰れる**。ここは「今どうなっているか」を
       *   測って報告する。assert は「実装を直しても生き残る不変条件」= **冪等性**だけに置く
       *   (現在の壊れ方をそのまま assert すると、直したときに赤くなってしまう)。 */
      window.__reset();
      const brokenObj = E.getMapDef(); brokenObj.tiles = 'これは文字列';
      const impB = E.importJSON(JSON.stringify(brokenObj));
      const afterBroken = E.getMapDef();
      const roundB = E.exportJSON();
      E.importJSON(roundB);
      out.broken = { ok: impB.ok, reason: impB.reason || null,
                     tiles: afterBroken.tiles, tilesType: typeof afterBroken.tiles,
                     idempotent: roundB === E.exportJSON() };
      return out;
    }, PLAY_TILES);
    const p8 = s8.painted, i8 = s8.injected;
    check('§8 G0 母集団ガード: 往復の元になった mapDef が実際に tiles を持っている (真空でない)',
      !!p8.src.tiles && typeof p8.src.tiles.data === 'string' && p8.src.tiles.data.length > 0 &&
      !!i8.src.tiles && i8.src.tiles.data === PLAY_TILES.data,
      '塗った版=' + (p8.src.tiles ? p8.src.tiles.data.length : -1) + ' 文字 / 注入版=' +
      (i8.src.tiles ? i8.src.tiles.data.length : -1) + ' 文字');
    check('§8 1a ★ブラシで塗った mapDef が exportJSON → importJSON で **deep-equal** (tiles ごと復元)',
      p8.ok === true && deepEqual(p8.src, p8.back),
      'ok=' + p8.ok + ' reason=' + p8.reason + ' deepEqual=' + deepEqual(p8.src, p8.back));
    check('§8 1b 往復後の幾何 (buildMapData) も 1 タイル残らず一致 / 再 export が 1 文字も変わらない',
      p8.hSrc === p8.hBack && p8.json1 === p8.json2,
      '幾何一致=' + (p8.hSrc === p8.hBack) + ' 再export一致=' + (p8.json1 === p8.json2));
    check('§8 2a ★矩形では作れない tiles (' + PLAY_TILES.data.length + ' 文字) も往復で deep-equal',
      i8.ok === true && deepEqual(i8.src, i8.back) && i8.json3 === i8.json4,
      'ok=' + i8.ok + ' deepEqual=' + deepEqual(i8.src, i8.back));
    console.log('     ★既知の穴 (SPEC 記載): 壊れた tiles ("これは文字列") を importJSON すると '
      + 'sanitize が黙って tiles=' + JSON.stringify(s8.broken.tiles) + ' (' + s8.broken.tilesType
      + ') へ潰す。ok=' + s8.broken.ok + ' / 理由=' + s8.broken.reason);
    check('§8 3a 壊れた tiles を読み込んでも往復が**冪等** (import→export→import で 1 文字も動かない)',
      s8.broken.idempotent === true, 'idempotent=' + s8.broken.idempotent);
    check('§8 3b map-editor 実行中に pageerror / console.error / 404 が 0 件',
      edErrs.length === 0, edErrs.slice(0, 3).join(' | ') || 'なし');
    await edPage.close();

    // ══════════════════════════════════════════════════════════════════════
    // §9 実プレイ — 自由タイルで作ったマップを最後までクリアする
    // ══════════════════════════════════════════════════════════════════════
    if (SKIP_PLAY) {
      console.log('\n[drv] §9 --skip-play のためスキップ');
    } else {
      /* ⚠⚠ ここが測るのは **幾何の到達性**であって戦闘バランスではない。
       *   ロスターに goblinKing 等を混ぜるとボスの召喚で PT が全滅し cleared=false になるが、
       *   それは「マップが壊れている」ではなく「その編成では勝てなかった」でしかない
       *   (2026-08-02 に step2 の worker が実際に踏んだ)。→ **rat のみ**にする。
       * ⚠⚠ HARD_MS は **index.html 自身のラン ハード上限 4 分より短く**する。超えるとゲーム側が
       *   console.error("[DIAG][run-timeout] …") を出して強制終了し、1f (エラー 0 件) が
       *   「ドライバが長く待ちすぎたせい」で落ちて原因が読めなくなる。
       * ⚠ 「時間切れ」と「本当に詰まった」を区別する: 進捗 (踏破数・残敵数・PT 位置) が
       *   STALL_MS 変化しなければ即打ち切って stalled として報告する。 */
      const HARD_MS = 210000, STALL_MS = 90000;
      mark('§9 ?autoplay=30 で自由タイルのマップを実際にクリアできるか (最大 ' + (HARD_MS / 1000) + ' 秒)');
      const reachPayload = playPayload({
        spawns: [['rat', 8, 19], ['rat', 12, 22], ['rat', 26, 18], ['rat', 30, 16],
                 ['rat', 32, 21], ['rat', 44, 20]],
      });
      const boot = await bootPage(browser, BASE + '/index.html?autoplay=30&intel=0',
        { payload: reachPayload, scen: null, t0: T_BASE_MS, seed: SEED });
      const apPage = boot.page, apErrs = boot.errs, apPre = boot.preexisting;
      // 起動直後に「本当に tiles の上を歩いているか」を確かめる (矩形へ落ちていたら実プレイの意味がない)
      const geo = await apPage.evaluate(() => {
        const g = (fn, d) => { try { const v = fn(); return (v === undefined) ? d : v; } catch (e) { return d; } };
        const md = g(() => mapData, null);
        return { mapJson: md ? JSON.stringify(md) : '<none>',
                 mapUsed: g(() => JSON.stringify(MAP_USED), '<none>'),
                 stair: (md && md[16]) ? md[16][36] : -1,
                 isCustom: g(() => MAPDEF.isCustom, '<none>'),
                 objective: g(() => OBJECTIVE_ROOMS, -1) };
      });
      check('§9 0a ★実プレイの幾何が tiles そのもの (矩形へ落ちていない = この節が自由タイルを測っている)',
        geo.mapJson === PLAY_TILES_JSON && geo.stair === 0 && geo.isCustom === true,
        'hash ' + sha(geo.mapJson) + ' vs ' + sha(PLAY_TILES_JSON) + ' / 斜め坑道=' + geo.stair);
      check('§9 0b MAP_USED が tiles の外接矩形 (実プレイでもカメラが黒帯にならない)',
        geo.mapUsed === JSON.stringify(PLAY_TILES_BBOX), geo.mapUsed);

      let cleared = false, stalled = false, defeated = false, visited = -1, aliveN = -1, where = '?';
      let lastSig = '', lastChange = Date.now(), lastLog = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < HARD_MS) {
        const s = await apPage.evaluate(() => {
          const g = (fn, d) => { try { const v = fn(); return (v === undefined) ? d : v; } catch (e) { return d; } };
          const T = g(() => TILE_SIZE, 96);
          return {
            cleared: g(() => dungeonCleared, false),
            over: g(() => gameOver, false),
            visited: g(() => visitedRooms.size, -1),
            alive: g(() => enemies.filter(e => e.alive && !e.passiveNpc).length, -1),
            at: g(() => Math.round(playerX / T) + ',' + Math.round(playerY / T), '?'),
          };
        });
        visited = s.visited; aliveN = s.alive; where = s.at;
        if (s.cleared) { cleared = true; break; }
        if (s.over) { defeated = true; break; }          // 全滅。時間切れと**別枠**で報告する
        const sig = s.visited + '/' + s.alive + '/' + s.at;
        if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); }
        else if (Date.now() - lastChange > STALL_MS) { stalled = true; break; }
        const el = Date.now() - t0;
        if (el - lastLog >= 30000) {
          lastLog = el;
          console.log('     …' + Math.round(el / 1000) + 's  踏破' + s.visited + ' 残敵' + s.alive
            + ' PT(' + s.at + ')');
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const detail = '踏破' + visited + ' 残敵' + aliveN + ' PT(' + where + ') ' + elapsed + '秒'
        + (stalled ? ' ★' + (STALL_MS / 1000) + '秒 進捗なしで打ち切り = 本当に詰まっている' : '')
        + (defeated ? ' ★PT 全滅 (幾何ではなく戦闘の問題)' : '');
      console.log('     cleared=' + cleared + '  ' + detail);
      check('§9 1a ★★自由タイルのマップで dungeonCleared === true になる', cleared === true, detail);
      check('§9 1b 踏破部屋数が OBJECTIVE_ROOMS (' + geo.objective + ') 以上', visited >= geo.objective,
        'visited=' + visited + ' / 必要 ' + geo.objective);
      check('§9 1c 生存している敵が 0 (岩盤に埋まって到達不能な alive が残っていない)', aliveN === 0,
        'alive=' + aliveN);
      check('§9 1d 進捗が止まらなかった (時間切れと「詰まり」の区別)', stalled === false, detail);
      check('§9 1e PT が全滅していない (戦闘敗北を幾何の失敗と読み違えないため)', defeated === false, detail);
      /* ★除外枠 (PREEXISTING_RE) は**空**なので、これは [DIAG][result-double-fire] (34951ad で修正済み)
       *   と [DIAG][run-timeout] の回帰検出器でもある。 */
      check('§9 1f autoplay 実行中に pageerror / console.error が 1 件も出ていない', apErrs.length === 0,
        apErrs.slice(0, 3).join(' | '));
      if (apPre.length) {
        console.log('     ⚠ 除外枠に入った console.error を ' + apPre.length + ' 件観測 (判定からは除外):');
        for (const x of apPre.slice(0, 3)) console.log('        · ' + x);
      }
      await apPage.close();
    }

    // ── §E ──────────────────────────────────────────────────────────────
    mark('§E 404 の総括');
    check('§E 1a js/df-mapdef.js を含め 404 が 1 件も出ていない (除外は URL 単位 = favicon のみ)',
      rec.notFound.length === 0,
      '未検出404=' + (rec.notFound.slice(0, 5).join(',') || 'なし') + ' / 無視した favicon=' + rec.ignored404.length);

  } catch (e) {
    console.error('\n[drv] 装置の故障: ' + ((e && e.stack) || e));
    try { if (browser) await browser.close(); } catch (_) {}
    try { if (srv) srv.close(); } catch (_) {}
    process.exit(3);
  }
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (srv) srv.close(); } catch (_) {}

  // ── 集計 ────────────────────────────────────────────────────────────────
  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log('\n════════════════════════════════════════════');
  console.log('  ' + pass + '/' + results.length + ' PASS' + (fail ? '   ★FAIL ' + fail + ' 件' : ''));
  if (fail) {
    console.log('  ── FAIL 一覧 ──');
    for (const r of results) if (!r.ok) console.log('   ✗ ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  if (MUTATE) {
    console.log('  (--mutate ' + MUTATE + ': FAIL が 1 件以上出るのが**正しい**。0 件なら assert の穴)');
    if (fail === 0) { console.log('  ★assert の穴: 欠陥を注入したのに全 PASS した'); process.exit(4); }
    console.log('  [drv] 変異 ' + MUTATE + ' → ' + fail + ' 件で捕まえた (期待どおり)');
    process.exit(1);
  }
  /* ⚠ 母集団が空のまま「全 PASS」になるのを防ぐ (assert が 1 つも走っていない = 装置の故障)。
   *   --skip-play では §9 の 8 件が走らないぶん下限を下げる。 */
  const MIN = SKIP_PLAY ? 50 : 58;
  if (results.length < MIN) {
    console.log('  ★装置の故障: assert が ' + results.length + ' 件しか走っていない (下限 ' + MIN + ')');
    process.exit(3);
  }
  process.exit(fail ? 1 : 0);
})();
