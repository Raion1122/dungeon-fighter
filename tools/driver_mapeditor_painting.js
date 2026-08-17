#!/usr/bin/env node
/*
 * driver_mapeditor_painting.js — 「自作マップの部屋に本編の1枚絵と情景が乗る」ことの恒久回帰検出器
 * ═════════════════════════════════════════════════════════════════════════════
 * 対象: Phase 4 の 4 コミット (9840a70 / 9a2db16 / 0dd21c5 / 025c3da) がまたぐ 3 ファイル
 *       js/df-mapdef.js  … 1枚絵/情景カタログの実行時抽出 + sanitize + lint 2 件
 *       map-editor.html  … 「1枚絵」「情景」2 セレクト + canvas プレビュー
 *       index.html       … loadRoomPaintings / generateScenery のゲート 2 箇所 (mapDef 駆動)
 *
 * ■ なぜ 7 本目が要るのか
 *   Phase 2 で「カスタム幾何なら一律 null」で塞いだ 2 つのゲートを、Phase 4 で
 *   「mapDef に指定があればそれを使う」へ開けた。この機能は **3 ファイルにまたがる 1 本の鎖**で、
 *   どこか 1 箇所が腐ると静かに死ぬ:
 *     ・カタログを写経した瞬間 → 「エディタでは正しいのに本編では違う絵」= 機能の存在意義が消える
 *     ・貼る矩形が rect でなく tileBounds に戻る → 自作地形の外に絵が浮く
 *     ・globalReserved を通さなくなる → blocking 種が廊下を塞ぎ到達不能バグの入口になる
 *     ・lint が面積ヒューリスティックへ戻る → 絵なしの大部屋が常時警告 (Phase 0 の誤検出が復活)
 *   どれも「絵が出ている / 警告が出ている」ようには見えるので、目視では気づけない。
 *
 * ■ 何を測るか
 *   §0 装置    公開シーム / DOM / マーカー定数の実在 (assert が空振りしない前提)
 *   §1 カタログ ★index.html を実行時に読めている (12 枚 / 7 種 / 代表レシピ / フォールバック)
 *   §2 非写経  ★★実装 2 ファイルに本編のアセット名が 1 つも出てこない (+ 対照は index.html)
 *   §3 UI      ★**実マウスで部屋を選び、実 DOM の change** で mapDef に入る / undo / キー横取り無し
 *   §4 プレビュー ★★貼る矩形が **部屋の rect** (+ 対照: tileBounds なら別矩形) / PNG 不変
 *   §5 lint    painting-aspect は明示した部屋だけ / painting-missing 単体 / 未取得なら黙る
 *   §6 退化    カタログ取得失敗を UI と console.warn の両方で知らせる (silent fail-open にしない)
 *   §7 本編    ★従来経路の回帰ゼロ / rect に貼る / density スケール / 床のみ / ★予約タイルを通る
 *   §E 実行中に pageerror / console.error / 意図しない 404 が 1 件も出ていないこと
 *
 * ■ 変異負制御 (--mutate <kind>) ★「assert が空振りでない」ことの直接証明・同一 run に内包
 *     kind           | 注入する欠陥                                        | 落ちるべき節
 *     ---------------|-----------------------------------------------------|--------------
 *     nomark         | PAINTING_CATALOG_MARK を壊す (書式変更の再現)       | §1 §3 §4 §5 §6
 *     srcfallback    | paintingSrcFor の未知参照を既定テーマへ落とす       | §1 §7
 *     tileboundsrect | mapDef 経路の貼る矩形を rect → tileBounds へ戻す    | §7
 *     noreserve      | mapDef 経路だけ globalReserved を無視する           | §7
 *     lintarea       | lint を Phase 0 の面積ヒューリスティックへ戻す      | §5
 *   ⚠ 置換対象が 0 件 / 2 件以上 なら exit 3 (空振りしたまま PASS を防ぐ)。**ファイル単位でなく
 *     全対象ファイルの出現回数の合計**で数える (同じ 1 行が同一ファイル内に 2 箇所ある型を潰す)。
 *   ⚠⚠ 負制御④ は SPEC の素案 (`if (globalReserved.has(tileKey)) continue;` を消す) を採らない。
 *     その行は**従来経路と共有**なので、消すと既存 6 シナリオ側も動いてしまい
 *     「mapDef 経路が予約を通っている」ことの証明力が落ちる (過剰に効く負制御)。
 *     → `!USE_MAPDEF &&` を挿して **mapDef 経路だけ**予約を無視させる。こうすると
 *       同一 run の §7a (素の廃坑 = 従来経路) が PASS のまま残り、
 *       「新経路だけが壊れた」ことが同じログの中で読める。
 *
 * ■ 作法 (プロジェクト規約)
 *   ⭐ Chrome プロファイルは必ず require('./_pptr_profile') (自前で --user-data-dir を作らない)
 *   ⚠ file:// 直開きは不可 → 内蔵 http サーバ。/favicon.ico の 404 は URL 単位で除外する
 *   ⚠⚠ 編集は**実マウス / 実 DOM イベント**で行う。内部シームだけで叩くと、レイアウト起因の
 *      バグ (2026-08-03 のポインタずれ) を既存 4 本が全部すり抜けた前例がある。
 *   ⚠⚠ グローバルな件数 / 合計 / 存在で assert しない。母集団ガードは identity か
 *      特定 code への到達で測る (項目2 で driver_mapdef_step3 §4 G0 がこれで落ちた)。
 *   ⚠⚠ 屋外テーマで drawImage を数えるので **Date.now を凍結**する
 *      (index.html の drawCloudShadows が実時刻を読み、件数が計測ごとに揺れる)。
 *   ⛔ exportPNG() の 3 行は触らない (§4 4j が逐語で見張る)。
 *
 * ■ 使い方
 *     node tools/driver_mapeditor_painting.js [--headful] [--port N] [--root <path>]
 *          [--browser <path>] [--mutate nomark|srcfallback|tileboundsrect|noreserve|lintarea]
 *   ★--root に別ツリーを渡すとドキュメントルートごと差し替えられる。
 *     `git worktree add %TEMP%/df_wt_p4pre 6ea609e --detach` (= Phase 4 の直前) で実測すると
 *     **0 PASS / 8 FAIL** (§0 が全滅 → 以降は driver exception で停止) = 「Phase 4 が丸ごと
 *     無いツリーではこのドライバは原理的に通らない」ことの証明になる。
 *     ⚠ ただし個別 assert の切り分けはできない (§1 以降が API 不在で throw する)。
 *     **どの assert がどの欠陥を捕まえているか**を見たいときは --mutate を使うこと。
 *   exit 0 = 全 PASS / 1 = FAIL / 2 = 環境不備 / 3 = 変異の空振り / 4 = 変異したのに全 PASS
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const makeProfile = require('./_pptr_profile');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8985'), 10);
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '..')));
const MUTATE = arg('mutate', null);

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ① カタログのマーカーを壊す = index.html の書式が変わったのと同じ状態。
   *    ⚠ エディタ側だけが死ぬ (本編は ROOM_PAINTINGS_DEF を直接 set するので無傷) =
   *    §7 が PASS のまま残ることで「どちら側の経路が落ちたか」が読める。 */
  nomark: [
    ['  var PAINTING_CATALOG_MARK = "const ROOM_PAINTINGS_DEF = {";',
     '  var PAINTING_CATALOG_MARK = "const ROOM_PAINTINGS_DEF_BROKEN = {";'],
  ],
  /* ② 未知参照を「テクスチャと同じく既定テーマへ落ちる」に変える。
   *    絵は「無い」が正しい状態なので、捏造すると指定ミスが別の絵として成立してしまう。 */
  srcfallback: [
    ['    // \u26a0 プロトタイプ由来のプロパティ ("constructor" 等) を拾わないよう型でも弾く\n' +
     '    if (!per || typeof per !== "object") return null;',
     '    // \u26a0 プロトタイプ由来のプロパティ ("constructor" 等) を拾わないよう型でも弾く\n' +
     '    if (!per || typeof per !== "object") per = paintingCatalog[SCENERY_FALLBACK_DUNGEON];\n' +
     '    if (!per || typeof per !== "object") return null;'],
  ],
  /* ③ mapDef 経路の貼る矩形を「絵側の tileBounds」へ戻す = Phase 4 の肝を無効化。
   *    ⚠ [卓上グリッド P2] addPainting に第3引数 (blocked マスク) が付いたのでアンカーを
   *      1 行目だけへ張り替えた。**注入する欠陥 (rect → tileBounds) は 1 文字も変えていない**。 */
  tileboundsrect: [
    ['        addPainting(src, room.rect,',
     '        addPainting(src, ROOM_PAINTINGS_DEF[pg.theme][pg.key].tileBounds,'],
  ],
  /* ④ mapDef 経路だけ予約タイル (廊下+2 / 敵スポーン+1 / 起点+1) を無視する。
   *    ★従来経路 (USE_MAPDEF=false) は 1 命令も変わらない = 過剰に効かない負制御。 */
  noreserve: [
    ['            if (isBlocking) {\n              if (globalReserved.has(tileKey)) continue;',
     '            if (isBlocking) {\n              if (!USE_MAPDEF && globalReserved.has(tileKey)) continue;'],
  ],
  /* ⑤ lint を Phase 0 の面積ヒューリスティック (LINT_PAINTING_MIN_AREA = 150) へ戻す。 */
  lintarea: [
    ['      if (!rooms[i].painting) continue;                 // \u2605明示した部屋だけ比率を見る',
     '      if (!rooms[i].painting && (rooms[i].rect[3] - rooms[i].rect[1] + 1) *' +
     ' (rooms[i].rect[2] - rooms[i].rect[0] + 1) < 150) continue;'],
  ],
};
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js', 'map-editor.html'];
let _mutatedCache = null;
function countOcc(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + needle.length; }
  return n;
}
function mutatedSources() {
  if (_mutatedCache) return _mutatedCache;
  const rules = MUTATIONS[MUTATE];
  if (!rules) {
    console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
    process.exit(3);
  }
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of rules) {
    // ⚠ 「何ファイルに在るか」ではなく「合計で何回出るか」で数える (同一ファイル内の重複も弾く)
    let total = 0, hit = null;
    for (const rel of MUTATE_TARGETS) {
      const n = countOcc(out[rel], from);
      if (n) { total += n; hit = rel; }
    }
    if (total !== 1) {
      console.error('[drv] ⛔ 変異の置換対象が ' + (total === 0 ? '見つからない' : total + ' 箇所に重複') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 100)));
      process.exit(3);
    }
    out[hit] = out[hit].split(from).join(to);
  }
  console.log('[drv] ★変異負制御 --mutate ' + MUTATE + ' を注入して配信します');
  _mutatedCache = out;
  return out;
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

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
/* ⚠ favicon は Chrome が勝手に取りに行くもの。除外は **URL 単位**で行う
 *   (本文「404」で一括除外すると本物の 404 検出器まで死ぬ)。
 * ⚠ __no_such_ は §6 (退化) がわざと 404 させるための URL。 */
const IGNORED_URL_RE = /\/favicon\.ico(\?|$)|__no_such_/;

function startServer(port, root) {
  const rec = { notFound: [], expected404: [] };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (MUTATE && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]); return;
        }
        const fp = path.join(root, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          if (IGNORED_URL_RE.test(u)) rec.expected404.push(u); else rec.notFound.push(u);
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
// 判定
// ══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const fails = [];
function mark(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '   [' + detail + ']' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
  return ok;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const J = (v) => JSON.stringify(v);
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 0.6 : eps);

/* ★負のコントロール (--mutate) では DOM 要素やシームが部分的に欠ける。素で書くと最初の
 *   evaluate で throw して「driver exception 1 件」しか出ず、**どの assert が新規に効いたのかが
 *   分からない**。欠けている物は空の値として返し、assert を 1 件ずつ個別に FAIL させる
 *   (実測: --mutate nomark が 72 PASS / 29 FAIL と切り分けられる)。
 * ⚠ Phase 4 が丸ごと無いツリー (--root 6ea609e) までは救えない。DFMapDef の API 自体が
 *   不在で §1 以降の evaluate が throw するため、そこでは 0/8 + driver exception で止まる。 */
const SHIM = () => {
  const EMPTY_EL = { disabled: false, value: '', options: [], textContent: '', label: '',
                     querySelectorAll: () => [], classList: { contains: () => false } };
  window.__q = (id) => document.getElementById(id) || EMPTY_EL;
  window.__P = () => {
    const E = window.__mapEditor;
    if (E && typeof E.paintingInfo === 'function') return E.paintingInfo();
    return { ready: false, status: null, sceneryStatus: null, note: '', noteNg: false,
             options: 0, groups: 0, groupLabels: [], values: [], value: '', disabled: false,
             sceneryValues: [], sceneryValue: '', sceneryDisabled: false,
             painting: null, scenery: null, painted: [] };
  };
  window.__fn = (name) => {
    const E = window.__mapEditor;
    return (E && typeof E[name] === 'function') ? E[name].bind(E)
                                                : (() => Promise.resolve({ ok: false, __absent: true }));
  };
};

/* エディタ canvas の drawImage を実測する。★スクショ目視は誤読するので実呼び出しで確定させる。 */
const HOOK_EDITOR_DRAW = () => {
  window.__diCalls = [];
  const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
  proto.drawImage = function (img) {
    try {
      const src = (img && (img.src || img.currentSrc)) || '';
      if (arguments.length === 5 && /room_/.test(String(src)))
        window.__diCalls.push({ src: String(src), n: arguments.length,
          dx: arguments[1], dy: arguments[2], dw: arguments[3], dh: arguments[4] });
    } catch (_) {}
    return orig.apply(this, arguments);
  };
};

/* ★心臓部 (driver_mapeditor_pointer.js と同じ): 人が「見て」クリックする点 (viewport 座標)。
 *   内部座標をそのまま使うと、レイアウトがずれた実装でも自己整合して空振りする。 */
const visualPointOfTile = (page, tx, ty) => page.evaluate((tx, ty) => {
  const E = window.__mapEditor, r = E.canvas.getBoundingClientRect();
  const t = E.state.mapDef.grid.tile;
  const p = E.worldToScreen((tx + 0.5) * t, (ty + 0.5) * t);
  const sx = r.width / E.state.css.w, sy = r.height / E.state.css.h;
  return { x: r.left + p.x * sx, y: r.top + p.y * sy,
           inside: (p.x * sx >= 0 && p.x * sx < r.width && p.y * sy >= 0 && p.y * sy < r.height) };
}, tx, ty);

/* ツールボタンを **実マウスでクリック**して選ぶ (setTool シームを使わない)。 */
async function clickTool(page, label) {
  const btns = await page.$$('#toolBtns button');
  for (const b of btns) {
    const t = await page.evaluate(el => el.textContent, b);
    if (t === label) { await b.click(); await sleep(60); return true; }
  }
  return false;
}
/* <select> を **実 DOM の change 経路**で操作する (page.select は input + change を発火する)。 */
const selOpt = async (page, sel, v) => { try { await page.select(sel, v); await sleep(80); return true; }
                                        catch (e) { return false; } };
const focusEl = async (page, sel) => { try { await page.focus(sel); return true; } catch (e) { return false; } };

// ══════════════════════════════════════════════════════════════════════════════
// 検証用のカスタム mapDef
// ══════════════════════════════════════════════════════════════════════════════
/* 部屋0 = [3,3,18,22] (16行 × 20列 = 20×16)。既定ダンジョンの山場 [7,24,20,43] とも
 *   絵側の tileBounds [5,24,20,43] とも**別の場所**にあるので、「rect に貼ったのか
 *   tileBounds に貼ったのか」がタイル座標だけで一意に分離できる。
 * 部屋1 = ボス [5,30,22,51] (18行 × 22列 = 22×18)。
 * ★部屋2 (ROOM_RES) = [8,53,16,66] は 廊下 [10,55,14,64] の +2 膨張と**完全に一致**する矩形 =
 *   「全タイルが予約された部屋」。ここに情景を撒くと
 *     予約を通っていれば blocking 種は 1 つも置けない / 非 blocking は置ける
 *   という**確率に依らない**分離ができる (負制御④ の主測定)。 */
const ROOM0 = [3, 3, 18, 22];
const ROOM1 = [5, 30, 22, 51];
const ROOM_RES = [8, 53, 16, 66];
const CORR_RES = [10, 55, 14, 64];

function mkMapDef(o) {
  o = o || {};
  const rooms = [
    { id: 'r0', role: 'start', rect: ROOM0.slice(), enemySlots: [[8, 10], [12, 8]],
      bossSlot: null, painting: o.painting || null, scenery: o.scenery || null },
    { id: 'r1', role: 'boss', rect: ROOM1.slice(), enemySlots: [],
      bossSlot: [40, 13], painting: o.painting1 || null, scenery: o.scenery1 || null },
  ];
  const corridors = [[13, 22, 15, 30]];
  if (o.reservedRoom) {
    rooms.push({ id: 'r2', role: null, rect: ROOM_RES.slice(), enemySlots: [], bossSlot: null,
                 painting: null, scenery: { density: o.reservedRoom } });
    corridors.push(CORR_RES.slice());
  }
  return {
    schema: 'df-map/1', id: 'p4-drv', name: 'Phase4 恒久ドライバ検証マップ',
    grid: { w: 72, h: 28, tile: 96 },
    themeId: o.themeId || 'goblin-mine',
    rooms: rooms, corridors: corridors,
    start: { tx: 5, ty: 13 },
    objective: { kind: 'visitRooms', count: null },
    tiles: null, flags: { bandMask: false },
  };
}
function mkPayload(o) {
  return {
    title: 'Phase4 検証', flavor: '', themeId: (o && o.themeId) || 'goblin-mine',
    spawns: [['goblin', 8, 10], ['goblin', 12, 8]],
    clearXp: 0, mapDef: mkMapDef(o),
  };
}
const CAM = { x: 0, y: 0 };
const inRect = (s, rc) => (s.ty >= rc[0] && s.ty <= rc[2] && s.tx >= rc[1] && s.tx <= rc[3]);

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = makeProfile('df_mapedit_paint_');

  let srv = null, browser = null, rec = null;
  const allErrs = [];
  try {
    const a = await startServer(PORT, ROOT);
    srv = a.srv; rec = a.rec;
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] root=' + ROOT + '  ' + BASE);
    console.log('[drv] mutate=' + (MUTATE || 'なし'));

    browser = await puppeteer.launch({
      executablePath: browserPath, headless: HEADFUL ? false : 'new',
      userDataDir: profile, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    // ══════════════════════════════════════════════════════════════════════════
    // エディタ側 (§0〜§6) — 1 ページを使い回す (節ごとに loadPreset で状態を戻す)
    // ══════════════════════════════════════════════════════════════════════════
    const page = await browser.newPage();
    const consoleWarns = [];
    page.on('pageerror', e => allErrs.push('pageerror: ' + e.message));
    page.on('console', m => {
      const t = m.text();
      if (m.type() === 'error' && !/Failed to load resource/i.test(t)) allErrs.push('console.error: ' + t);
      // ⚠ puppeteer の版で console.warn の type が 'warn' / 'warning' に割れるので両方拾う
      if (m.type() === 'warn' || m.type() === 'warning') consoleWarns.push(t);
    });
    await page.setViewport({ width: 1400, height: 900 });
    await page.evaluateOnNewDocument(SHIM);
    await page.evaluateOnNewDocument(HOOK_EDITOR_DRAW);
    await page.goto(BASE + '/map-editor.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__mapEditor && !!window.DFMapDef,
      { timeout: 20000, polling: 50 });
    // カタログ 2 本の到着待ち。届かなくても先へ進み、各節が理由付きで落ちる。
    await page.evaluate(() => Promise.all([
      (window.__mapEditor.paintingReady || null), (window.__mapEditor.sceneryReady || null)]))
      .catch(() => {});
    await sleep(300);

    // ══════════════════════════════════════════════════════════════════════════
    mark('§0 装置の前提 (assert が空振りしないこと)');
    {
      const d0 = await page.evaluate(() => {
        const E = window.__mapEditor, M = window.DFMapDef;
        const q = (id) => document.getElementById(id);
        const bar = q('roleSel') ? q('roleSel').parentNode : null;
        const kids = bar ? Array.prototype.slice.call(bar.children) : [];
        const ix = (id) => kids.indexOf(q(id));
        return {
          apiMissing: ['loadPaintingCatalog', 'getPaintingCatalog', 'setPaintingCatalog',
                       'paintingEntries', 'paintingSrcFor', 'loadSceneryCatalog',
                       'sceneryRecipeFor', 'sceneryKinds'].filter(k => typeof M[k] !== 'function'),
          seamMissing: ['setPainting', 'setScenery', 'getPainting', 'getScenery', 'paintingInfo',
                        'reloadPaintingCatalog', 'reloadSceneryCatalog'].filter(k => typeof E[k] !== 'function'),
          proms: ['paintingReady', 'sceneryReady'].filter(k => E[k] && typeof E[k].then === 'function'),
          dom: { p: !!q('paintSel'), s: !!q('scenerySel'), n: !!q('paintNote') },
          order: [ix('roleSel'), ix('paintSel'), ix('scenerySel')],
          marks: [M.PAINTING_CATALOG_MARK, M.SCENERY_RECIPE_MARK, M.SCENERY_SHEET_MARK],
          densMax: M.SCENERY_DENSITY_MAX,
          pStatus: window.__P().status, sStatus: window.__P().sceneryStatus,
        };
      });
      check('§0 0a DFMapDef に Phase 4 の公開 API 8 本がある',
        d0.apiMissing.length === 0, '欠け=' + J(d0.apiMissing));
      check('§0 0b __mapEditor に検証シーム 7 関数 + 2 Promise がある',
        d0.seamMissing.length === 0 && d0.proms.length === 2,
        '欠け=' + J(d0.seamMissing) + ' proms=' + J(d0.proms));
      check('§0 0c #paintSel / #scenerySel / #paintNote が DOM にある',
        d0.dom.p && d0.dom.s && d0.dom.n, J(d0.dom));
      check('§0 0d 2 セレクトが roleSel の**すぐ隣**にある (label を挟んで直後の兄弟)',
        d0.order[0] >= 0 && d0.order[1] === d0.order[0] + 2 && d0.order[2] === d0.order[1] + 2,
        '兄弟 index=' + J(d0.order));
      check('§0 0e 3 マーカー定数が index.html の宣言と同じ文字列',
        J(d0.marks) === J(['const ROOM_PAINTINGS_DEF = {', 'const SCENERY_RECIPES = {',
                           'const SCENERY_SHEETS = {']), J(d0.marks));
      check('§0 0f SCENERY_DENSITY_MAX = 4 が公開されている', d0.densMax === 4, String(d0.densMax));
      check('§0 0g map-editor が 2 カタログを実際に load して ok:true',
        !!d0.pStatus && d0.pStatus.ok === true && !!d0.sStatus && d0.sStatus.ok === true,
        J([d0.pStatus, d0.sStatus]));
    }

    // ══════════════════════════════════════════════════════════════════════════
    mark('§1 カタログ — index.html を実行時に読めている');
    let CATALOG = { srcs: [] };
    {
      const c1 = await page.evaluate(() => {
        const M = window.DFMapDef;
        const es = M.paintingEntries();
        const sheets = M.getScenerySheets ? M.getScenerySheets() : null;
        const srcs = es.map(e => String(e.src).split('?')[0]);
        if (sheets) for (const k of Object.keys(sheets)) srcs.push(String(sheets[k].src).split('?')[0]);
        return {
          n: es.length,
          themes: Array.from(new Set(es.map(e => e.theme))),
          climax: es.filter(e => e.key === '1'),
          boss: es.filter(e => e.key === '2'),
          // ★P7: ノード用 (7x6 / 9x6)。旧在庫と**別の物差し**なので別々に採る
          nodeMid: es.filter(e => e.key === 'n4'),
          nodeBoss: es.filter(e => e.key === 'n7'),
          byTheme: (() => { const o = {};
            for (const e of es) (o[e.theme] = o[e.theme] || []).push(e.key);
            for (const t of Object.keys(o)) o[t].sort();
            return o; })(),
          keysAreStr: es.every(e => typeof e.key === 'string'),
          labels: Array.from(new Set(es.map(e => e.label))).sort(),
          hit: M.paintingSrcFor('goblin-mine', '1'),
          hitNum: M.paintingSrcFor('goblin-mine', 1),
          unknownTheme: M.paintingSrcFor('__no_such__', '1'),
          unknownKey: M.paintingSrcFor('goblin-mine', '99'),
          proto: M.paintingSrcFor('constructor', '1'),
          kinds: M.sceneryKinds(),
          mine: M.sceneryRecipeFor('goblin-mine'),
          road: M.sceneryRecipeFor('caravan-road'),
          temple: M.sceneryRecipeFor('undead-temple'),
          srcs: Array.from(new Set(srcs)),
        };
      });
      CATALOG = c1;
      /* ★P7 (2026-08-12): 在庫が 12 → **24 枚**へ増えた (6 テーマ × 山場/ボス/ノード山場/ノードボス)。
       *   ⚠ 件数だけを 12→24 へ書き換えると「増えたこと」しか見ない緩い装置になるので、
       *     **構成 (テーマごとのキーの並び)** も併せて測る。 */
      check('§1 1a paintingEntries() が 24 件 / 6 テーマ (6 テーマ × 4 キー)',
        c1.n === 24 && c1.themes.length === 6, 'n=' + c1.n + ' themes=' + c1.themes.join(','));
      check('§1 1a2 ★全テーマが 1 / 2 / n4 / n7 の 4 キーをそろえている (取りこぼしゼロ)',
        c1.themes.every(t => J(c1.byTheme[t]) === J(['1', '2', 'n4', 'n7'])), J(c1.byTheme));
      check('§1 1b 山場 (key=1) 6 件がすべて tw=20 / th=16',
        c1.climax.length === 6 && c1.climax.every(e => e.tw === 20 && e.th === 16),
        J(c1.climax.map(e => e.tw + 'x' + e.th)));
      check('§1 1c ボス (key=2) 6 件がすべて tw=22 / th=18',
        c1.boss.length === 6 && c1.boss.every(e => e.tw === 22 && e.th === 18),
        J(c1.boss.map(e => e.tw + 'x' + e.th)));
      // ★P7: ノード用の 2 種。旧在庫と縦横比が違う (7:6 / 3:2) ことがここで固定される
      check('§1 1c2 ノード山場 (key=n4) 6 件がすべて tw=7 / th=6',
        c1.nodeMid.length === 6 && c1.nodeMid.every(e => e.tw === 7 && e.th === 6),
        J(c1.nodeMid.map(e => e.tw + 'x' + e.th)));
      check('§1 1c3 ノードボス (key=n7) 6 件がすべて tw=9 / th=6',
        c1.nodeBoss.length === 6 && c1.nodeBoss.every(e => e.tw === 9 && e.th === 6),
        J(c1.nodeBoss.map(e => e.tw + 'x' + e.th)));
      check('§1 1d key は文字列に正規化 / label は 4 種 (旧在庫 2 + ノード用 2)',
        c1.keysAreStr && J(c1.labels) === J(['ノードボス 9×6', 'ノード山場 7×6',
                                             'ボス 22×18', '山場 20×16'].sort()), J(c1.labels));
      check('§1 1e paintingSrcFor("goblin-mine","1") が本編の実 src (数値キーでも同じ)',
        c1.hit === 'assets/room_goblin-mine_1_bs.jpg' && c1.hitNum === c1.hit, String(c1.hit));
      check('§1 1f ★未知テーマは null (テクスチャと違い既定テーマへ落とさない)',
        c1.unknownTheme === null, String(c1.unknownTheme));
      check('§1 1g ★[対照] 未知テーマの戻りが goblin-mine の絵では**ない** (捏造の検出)',
        c1.unknownTheme !== c1.hit, String(c1.unknownTheme));
      check('§1 1h 未知キー / prototype 汚染キーも null',
        c1.unknownKey === null && c1.proto === null, J([c1.unknownKey, c1.proto]));
      /* ⚠ **明示リスト**であって件数ではない。種を足したらここも直す = カタログの identity を
       *   コミットに書き残す装置 (pillar/chair/table/wreck は Phase 6 STEP 2、
       *   railKit = つながる線路 は STEP 2.5、waterKit = つながる水路 は STEP 3 で追加)。 */
      check('§1 1i sceneryKinds() が 13 種 (grass/reed/log/detail/rubble/cart/rail + pillar/chair/table/wreck + railKit/waterKit)',
        J(c1.kinds) === J(['grass', 'reed', 'log', 'detail', 'rubble', 'cart', 'rail',
                           'pillar', 'chair', 'table', 'wreck', 'railKit', 'waterKit']), J(c1.kinds));
      check('§1 1j 代表レシピ goblin-mine = {rubble:26,rail:10,cart:5} / area 676 (全部屋の合算)',
        !!c1.mine && J(c1.mine) === J({ counts: { rubble: 26, rail: 10, cart: 5 }, area: 676 }), J(c1.mine));
      check('§1 1k 代表レシピ caravan-road = {grass:160,log:13,detail:94} / area 904',
        !!c1.road && J(c1.road) === J({ counts: { grass: 160, log: 13, detail: 94 }, area: 904 }), J(c1.road));
      check('§1 1l ★レシピ無しの屋内テーマ (undead-temple) は goblin-mine へ落ちる',
        !!c1.temple && J(c1.temple) === J(c1.mine), J(c1.temple));
      check('§1 1m ★[対照] 屋内の既定が caravan-road では**ない** (フォールバック先の取り違え検出)',
        !!c1.temple && !!c1.road && J(c1.temple) !== J(c1.road));
    }

    // ══════════════════════════════════════════════════════════════════════════
    mark('§2 ★★写経していない (実装 2 ファイルに本編のアセット名が出てこない)');
    /* ⚠ ここがこの機能の生命線。写経した瞬間に「エディタでは正しいのに本編では違う絵」が
     *   起こりうるようになり、機能の存在意義そのものが消える。
     *   実例: 山場 6 枚は room_<theme>_1.png → room_<theme>_1_bs.jpg へ実際に差し替わっている。 */
    {
      const uniq = (CATALOG.srcs || []).filter(s => s && s !== 'undefined');
      check('§2 2a 検査対象のアセット名が 15 個以上ある (母集団が空でない)', uniq.length >= 15,
        uniq.length + ' 個');
      for (const rel of ['map-editor.html', 'js/df-mapdef.js']) {
        let text = '';
        try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) {}
        const hit = uniq.filter(n => text.indexOf(n) >= 0);
        check('§2 2b ' + rel + ' に本編のアセット名が 1 つも無い', text.length > 0 && hit.length === 0,
          hit.length ? '写経を検出: ' + hit.slice(0, 4).join(' / ') : uniq.length + ' 個すべて不在');
      }
      let idx = '';
      try { idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); } catch (e) {}
      const idxHit = uniq.filter(n => idx.indexOf(n) >= 0);
      check('§2 2c [対照] 同じ検査器を index.html に当てると全部ヒットする (検査器が生きている)',
        uniq.length > 0 && idxHit.length === uniq.length, idxHit.length + '/' + uniq.length);
    }

    // ══════════════════════════════════════════════════════════════════════════
    mark('§3 UI — ★実マウスで部屋を選び、実 DOM の change で mapDef に入る');
    {
      await page.evaluate(() => { window.__mapEditor.loadPreset('dungeon'); });
      await sleep(150);
      const toolOk = await clickTool(page, '選択/移動');
      check('§3 3a 装置: ツール「選択/移動」を実マウスで選べた', toolOk === true);

      const rect0 = await page.evaluate(() => window.__mapEditor.getMapDef().rooms[0].rect);
      const inRoom = await visualPointOfTile(page, rect0[1] + 2, rect0[0] + 2);
      const outside = await visualPointOfTile(page, 1, 1);
      check('§3 3b 装置: 部屋の中と外の点がどちらも canvas 内に見えている',
        inRoom.inside && outside.inside, J([inRoom.inside, outside.inside]));

      await page.mouse.click(outside.x, outside.y); await sleep(140);
      const stNone = await page.evaluate(() => ({ sel: window.__mapEditor.getSelection(),
        role: window.__q('roleSel').disabled, p: window.__q('paintSel').disabled,
        s: window.__q('scenerySel').disabled }));
      check('§3 3c 部屋の外を**実クリック**すると 3 つとも disabled',
        !stNone.sel && stNone.role === true && stNone.p === true && stNone.s === true, J(stNone));

      await page.mouse.click(inRoom.x, inRoom.y); await sleep(140);
      const stRoom = await page.evaluate(() => ({ sel: window.__mapEditor.getSelection(),
        role: window.__q('roleSel').disabled, p: window.__q('paintSel').disabled,
        s: window.__q('scenerySel').disabled }));
      check('§3 3d ★部屋を**実クリック**すると 3 つとも有効になる (roleSel と同じ追従)',
        !!stRoom.sel && stRoom.sel.kind === 'room' && stRoom.sel.index === 0 &&
        stRoom.role === false && stRoom.p === false && stRoom.s === false, J(stRoom));

      const ui = await page.evaluate(() => {
        const M = window.DFMapDef, ps = window.__q('paintSel'), ss = window.__q('scenerySel');
        const info = window.__P();
        const groups = Array.prototype.map.call(ps.querySelectorAll('optgroup'), g => g.label);
        const opts = Array.prototype.map.call(ps.querySelectorAll('optgroup option'), o => o.value);
        return { options: info.options, groups: groups, nOpts: opts.length,
          themeNames: M.THEMES.map(t => t.name),
          wellFormed: opts.length > 0 && opts.every(v => /^[^|]+\|[^|]+$/.test(v)),
          resolvable: opts.length > 0 && opts.every(v => !!M.paintingSrcFor(v.split('|')[0], v.split('|')[1])),
          scen: Array.prototype.map.call(ss.options, o => o.value + ':' + o.textContent) };
      });
      // ★P7: 在庫 12 → 24 枚 (ノード用 n4 / n7 を各テーマへ追加)
      check('§3 3e paintSel = 「なし」+ 24 件 = 25 option / optgroup 6 (テーマごと)',
        ui.options === 25 && ui.groups.length === 6, 'options=' + ui.options + ' groups=' + J(ui.groups));
      check('§3 3f optgroup の label は M.THEMES の name (themeSel と同じ表記)',
        ui.groups.length > 0 && ui.groups.every(g => ui.themeNames.indexOf(g) >= 0), J(ui.groups));
      check('§3 3g value は "theme|key" で 24 件すべて paintingSrcFor で引ける (捏造した選択肢が無い)',
        ui.nOpts === 24 && ui.wellFormed === true && ui.resolvable === true, 'opts=' + ui.nOpts);
      check('§3 3h scenerySel = なし / 少なめ0.5 / 既定1 / 多め1.8 の 4 択',
        J(ui.scen) === J([':なし', '0.5:少なめ', '1:既定', '1.8:多め']), J(ui.scen));

      await selOpt(page, '#paintSel', 'goblin-mine|1');
      await selOpt(page, '#scenerySel', '1.8');
      const s3 = await page.evaluate(() => {
        const E = window.__mapEditor, M = window.DFMapDef, d = E.getMapDef();
        return { p: d.rooms[0].painting, s: d.rooms[0].scenery,
          tp: typeof ((d.rooms[0].scenery || {}).density),
          keys: Object.keys(d.rooms[0].painting || {}).sort(),
          other: [d.rooms[1].painting, d.rooms[1].scenery],
          exported: JSON.parse(E.exportJSON()).rooms[0],
          strDies: (() => { const x = M.clone(M.DEFAULT_DUNGEON);
                            x.rooms[0].scenery = { density: '1.8' };
                            return M.sanitize(x).rooms[0].scenery; })() };
      });
      check('§3 3i ★実 change で rooms[0].painting = {theme:"goblin-mine",key:"1"}',
        J(s3.p) === J({ theme: 'goblin-mine', key: '1' }) && J(s3.keys) === J(['key', 'theme']), J(s3.p));
      check('§3 3j ★実 change で rooms[0].scenery = {density:1.8} (**数値**)',
        J(s3.s) === J({ density: 1.8 }) && s3.tp === 'number', J(s3.s) + ' typeof=' + s3.tp);
      check('§3 3k ★[対照] density を文字列 "1.8" のまま入れると sanitize が null にする ' +
            '(= parseFloat が無ければ選んでも反映されない)', s3.strDies === null, J(s3.strDies));
      check('§3 3l 選んでいない部屋は null のまま / exportJSON も同じ形',
        J(s3.other) === J([null, null]) && J(s3.exported.painting) === J(s3.p) &&
        J(s3.exported.scenery) === J(s3.s), J(s3.other));

      const s4 = await page.evaluate(() => {
        const E = window.__mapEditor;
        const g = () => { const d = E.getMapDef(); return [d.rooms[0].painting, d.rooms[0].scenery]; };
        const out = { set: g() };
        out.u1 = E.undo(); out.a1 = g();
        out.u2 = E.undo(); out.a2 = g();
        out.r1 = E.redo(); out.r2 = E.redo(); out.a3 = g();
        return out;
      });
      check('§3 3m ★undo 1 回で scenery だけ戻る (1 操作 = 履歴 1 段)',
        s4.u1 === true && J(s4.a1) === J([{ theme: 'goblin-mine', key: '1' }, null]), J(s4.a1));
      check('§3 3n ★undo 2 回目で painting も戻る / redo 2 回で両方復元',
        s4.u2 === true && J(s4.a2) === J([null, null]) && J(s4.a3) === J(s4.set), J([s4.a2, s4.a3]));

      await selOpt(page, '#paintSel', '');
      await selOpt(page, '#scenerySel', '');
      const s5 = await page.evaluate(() => {
        const d = window.__mapEditor.getMapDef(); return [d.rooms[0].painting, d.rooms[0].scenery]; });
      check('§3 3o 「なし」を選ぶと両方 null に戻る', J(s5) === J([null, null]), J(s5));

      // ── <select> にフォーカスがある時にキーを奪わない (既存配慮がこの 2 つにも効く) ──
      const pre = await page.evaluate(() => {
        const E = window.__mapEditor;
        return { tool: E.state.tool, tools: E.TOOLS.map(t => t.key),
                 rooms: E.getMapDef().rooms.length, sel: E.getSelection() };
      });
      const otherIdx = pre.tools.findIndex(k => k !== pre.tool);
      await focusEl(page, '#paintSel');
      await page.keyboard.press(String(otherIdx + 1));
      await page.keyboard.press('Delete');
      await focusEl(page, '#scenerySel');
      await page.keyboard.press(String(otherIdx + 1));
      await page.keyboard.press('Backspace');
      const s6 = await page.evaluate(() => {
        const E = window.__mapEditor, d = E.getMapDef();
        return { tool: E.state.tool, rooms: d.rooms.length, sel: E.getSelection(),
                 active: document.activeElement && document.activeElement.id };
      });
      check('§3 3p ★2 セレクトにフォーカス中は数字キーでツールが切り替わらない',
        otherIdx >= 0 && s6.tool === pre.tool, pre.tool + ' → ' + s6.tool);
      check('§3 3q ★Delete / BackSpace でも部屋が消えず選択も残る',
        s6.rooms === pre.rooms && J(s6.sel) === J(pre.sel),
        '部屋=' + pre.rooms + '→' + s6.rooms + ' 選択=' + J(s6.sel));
      check('§3 3r 装置: フォーカスが実際に <select> にある (空振りでない)',
        s6.active === 'scenerySel', String(s6.active));
    }

    // ══════════════════════════════════════════════════════════════════════════
    mark('§4 プレビュー — ★★貼る矩形は **部屋の rect** (絵側の tileBounds ではない)');
    {
      const s = await page.evaluate(async () => {
        const E = window.__mapEditor, M = window.DFMapDef;
        E.loadPreset('dungeon');
        const d = E.getMapDef();
        /* 幾何のセットアップだけシームで行う (編集操作そのものは §3 が実マウスで通す)。
         * [3,6,18,25] = 20×16 の 5:4。絵側の tileBounds [5,24,20,43] と**重ならない**ので
         * 「どちらの矩形に貼ったか」が座標だけで一意に分離できる。 */
        d.rooms[0].rect = [3, 6, 18, 25];
        d.rooms[0].painting = { theme: 'goblin-mine', key: '1' };
        E.setMapDef(d);
        const t0 = Date.now();
        while (Date.now() - t0 < 10000) {
          if (window.__P().painted.length) break;
          await new Promise(r => setTimeout(r, 60));
        }
        window.__diCalls.length = 0;
        E.render();
        const t = d.grid.tile, rc = E.getMapDef().rooms[0].rect;
        const a = E.worldToScreen(rc[1] * t, rc[0] * t);
        const b = E.worldToScreen((rc[3] + 1) * t, (rc[2] + 1) * t);
        const cat = M.getPaintingCatalog();
        const tb = (cat && cat['goblin-mine'] && cat['goblin-mine']['1'] &&
                    cat['goblin-mine']['1'].tileBounds) || [0, 0, 0, 0];
        const ta = E.worldToScreen(tb[1] * t, tb[0] * t);
        const tbb = E.worldToScreen((tb[3] + 1) * t, (tb[2] + 1) * t);
        return { rc: rc, tb: tb,
          want: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y },
          tbRect: { x: ta.x, y: ta.y, w: tbb.x - ta.x, h: tbb.y - ta.y },
          painted: window.__P().painted, di: window.__diCalls.slice() };
      });
      console.log('  [ref] rect=' + J(s.rc) + ' / 絵の tileBounds=' + J(s.tb));
      console.log('  [ref] 期待(rect)=' + J(s.want) + ' / tileBounds なら=' + J(s.tbRect));
      check('§4 4a drawImage(5引数) が 1 回だけ呼ばれ src が絵のファイル',
        s.di.length === 1 && s.di[0].n === 5 && /room_goblin-mine_1/.test(s.di[0].src),
        J(s.di.map(c => [c.n, c.src])));
      check('§4 4b ★★貼った矩形が **部屋の rect** と一致する (x/y/w/h すべて)',
        s.di.length === 1 && near(s.di[0].dx, s.want.x) && near(s.di[0].dy, s.want.y) &&
        near(s.di[0].dw, s.want.w) && near(s.di[0].dh, s.want.h),
        '実測=' + J(s.di[0] && [s.di[0].dx, s.di[0].dy, s.di[0].dw, s.di[0].dh]));
      check('§4 4c ★★[対照] 絵側の tileBounds で貼れば**別の矩形**になる (assert が空振りでない証明)',
        !(near(s.want.x, s.tbRect.x) && near(s.want.y, s.tbRect.y)),
        'rect=' + J([s.want.x, s.want.y]) + ' tileBounds=' + J([s.tbRect.x, s.tbRect.y]));
      check('§4 4d paintingInfo().painted が同じ矩形を報告する (シームと実描画が一致)',
        s.painted.length === 1 && near(s.painted[0].x, s.want.x) && near(s.painted[0].w, s.want.w) &&
        s.painted[0].i === 0, J(s.painted));

      const deg = await page.evaluate(async () => {
        const E = window.__mapEditor;
        const out = {};
        window.__diCalls.length = 0;
        E.setTexPreview(false);
        out.offDi = window.__diCalls.length; out.offPainted = window.__P().painted.length;
        E.setTexPreview(true);
        out.onPainted = window.__P().painted.length;
        const d = E.getMapDef();
        d.rooms[0].painting = { theme: '__no_such_theme__', key: '9' };
        E.setMapDef(d);
        window.__diCalls.length = 0; E.render();
        out.unknownDi = window.__diCalls.length; out.unknownPainted = window.__P().painted.length;
        E.loadPreset('dungeon');
        return out;
      });
      check('§4 4e 「本編の見た目」OFF では 1 枚も貼らない (ON に戻せば戻る)',
        deg.offDi === 0 && deg.offPainted === 0 && deg.onPainted === 1,
        'off=' + deg.offPainted + ' on=' + deg.onPainted);
      check('§4 4f ★引けない参照では何も描かない (別の絵で代用しない)',
        deg.unknownDi === 0 && deg.unknownPainted === 0, String(deg.unknownPainted));

      const png = await page.evaluate(() => {
        const E = window.__mapEditor;
        E.loadPreset('dungeon'); E.setTool('select');
        const p0 = E.exportPNG();
        const rc = E.getMapDef().rooms[0].rect;
        E.selectAt(rc[1] + 1, rc[0] + 1);
        window.__fn('setPainting')('goblin-mine|1'); window.__fn('setScenery')('1.8');
        const p1 = E.exportPNG();
        const out = { same: p0 === p1, len: p0.length, painted: window.__P().painted.length,
          rt: (() => { let ok = true;
            for (const k of ['dungeon', 'field']) {
              E.loadPreset(k);
              const j1 = E.exportJSON(); E.importJSON(j1);
              const j2 = E.exportJSON(); E.importJSON(j2);
              if (!(j1 === j2 && j2 === E.exportJSON())) ok = false;
            } return ok; })() };
        E.loadPreset('dungeon');
        return out;
      });
      check('§4 4g ★exportPNG が painting/scenery の指定で 1 バイトも変わらない (焼き込んでいない)',
        png.same === true, 'len=' + png.len);
      check('§4 4h exportPNG の後で画面のプレビューが戻っている', png.painted === 1, String(png.painted));
      check('§4 4i ★往復同一性 export→import→export が 2 プリセットとも 1 バイトも変わらない',
        png.rt === true);
      {
        let src = '';
        try { src = fs.readFileSync(path.join(ROOT, 'map-editor.html'), 'utf8'); } catch (e) {}
        const anchor = /state\.texPreview = false;\r?\n\s*state\.selection = null; state\.slotSelection = null;\r?\n\s*state\.lintOverlay = false;\r?\n\s*render\(\);/;
        check('§4 4j ⛔ exportPNG の 3 行が逐語で無改変 (driver_mapeditor の keepsel / lintpng の依存先)',
          anchor.test(src));
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    mark('§5 lint — painting-aspect は明示した部屋だけ / painting-missing');
    {
      /* ⚠⚠ 期待値の罠: 「引けない参照」を既定ダンジョンの rooms[0] (20×14) に入れると
       *   painting-aspect も同時に出て**警告 2 件**になる。painting-missing **単体**を
       *   測るなら rooms[1] (ボス 22×18 = 11:9 で在庫と一致) を使う。 */
      const L = await page.evaluate(() => {
        const E = window.__mapEditor, M = window.DFMapDef;
        E.loadPreset('dungeon');
        const base = JSON.parse(E.exportJSON());
        const wh = (rc) => [rc[3] - rc[1] + 1, rc[2] - rc[0] + 1];
        const out = { wh0: wh(base.rooms[0].rect), wh1: wh(base.rooms[1].rect),
                      catalogLive: !!M.getPaintingCatalog() };
        out.preset = E.lint();
        const set = (mut) => { const d = JSON.parse(JSON.stringify(base)); mut(d); E.setMapDef(d);
                               return E.lint(); };
        /* ① 比率が合わない部屋 (20×14) に**引ける**参照 → painting-aspect だけ 1 件
         * ⚠ [卓上グリッド P2] 参照を key '1' から **'n4' へ変えた**。key '1' には
         *   障害物マスク (blocked) が付いたので、20×14 の部屋へ貼ると 20 マスが通行不能になり
         *   painting-on-slot / unreachable-slot が**同時に**出て aspectErr が 0 でなくなる。
         *   それは lint として正しい報告だが、この assert が測りたいのは
         *   「比率不一致は error ではなく warning」という 1 点だけ。マスクを持たない
         *   ノード用の絵 (n4 = 7×6 = 7:6 ≠ 10:7) に替えて性質を切り出す。
         *   ⚠ **期待値 (['painting-aspect'] / warning / errors 0) は 1 文字も変えていない**。 */
        let r = set(d => { d.rooms[0].painting = { theme: 'goblin-mine', key: 'n4' }; });
        out.aspect = r.warnings.map(w => w.code);
        out.aspectSev = (r.warnings[0] || {}).severity || null;
        out.aspectErr = r.errors.length;
        // ② 比率が合う部屋 (ボス 22×18) に**引ける**参照 → 何も出ない (常に出す作りではない)
        r = set(d => { d.rooms[1].painting = { theme: 'goblin-mine', key: '2' }; });
        out.fit = r.warnings.map(w => w.code);
        // ③ 比率が合う部屋に**引けない**参照 → painting-missing だけ 1 件
        r = set(d => { d.rooms[1].painting = { theme: '__typo__', key: '2' }; });
        out.missing = r.warnings.map(w => w.code);
        out.missingIdx = r.warnings.map(w => w.roomIndex);
        out.missingSev = (r.warnings[0] || {}).severity || null;
        out.badge = document.getElementById('lintBadgeWarn').textContent;
        // ④ 同じ状態でカタログを未取得へ戻すと黙る (検査器が catalog を見ている証拠)
        M.setPaintingCatalog(null);
        out.missingNoCat = E.lint().warnings.map(w => w.code);
        return out;
      });
      // カタログを取り直す (以降の節が使う)
      await page.evaluate(() => window.__fn('reloadPaintingCatalog')()).catch(() => {});
      await sleep(500);
      check('§5 5a 装置: 既定プリセットの部屋は 20×14 と 22×18',
        J(L.wh0) === J([20, 14]) && J(L.wh1) === J([22, 18]), J([L.wh0, L.wh1]));
      check('§5 5b ★既定プリセット (painting なし) は警告 0 / エラー 0 ' +
            '(面積ヒューリスティックの誤検出が消えている)',
        L.preset.warnings.length === 0 && L.preset.errors.length === 0,
        J(L.preset.warnings.map(w => w.code)));
      check('§5 5c ★painting 明示 + 比率不一致 (20×14) → painting-aspect が 1 件 (warning)',
        J(L.aspect) === J(['painting-aspect']) && L.aspectSev === 'warning' && L.aspectErr === 0,
        J(L.aspect) + ' sev=' + L.aspectSev);
      check('§5 5d [対照] 明示 + 比率一致 (ボス 22×18) → 何も出ない (常に出す作りではない)',
        J(L.fit) === J([]), J(L.fit));
      check('§5 5e ★引けない参照を比率の合う部屋に入れると painting-missing が**単体で** 1 件',
        J(L.missing) === J(['painting-missing']) && J(L.missingIdx) === J([1]) &&
        L.missingSev === 'warning', J(L.missing) + ' roomIndex=' + J(L.missingIdx));
      check('§5 5f lint バッジ (#lintBadgeWarn) にも 1 件として出る', /警告 1/.test(L.badge), L.badge);
      check('§5 5g ★カタログ未取得では painting-missing を出さない (オフライン誤報の防止)',
        J(L.missingNoCat) === J([]), J(L.missingNoCat));
      check('§5 5h 装置: ④ の直前はカタログが載っていた (③ が空振りでない前提)',
        L.catalogLive === true);
    }

    // ══════════════════════════════════════════════════════════════════════════
    mark('§6 退化 — カタログ取得失敗を UI と console.warn の両方で知らせる');
    {
      const before = consoleWarns.length;
      const D = await page.evaluate(async () => {
        const E = window.__mapEditor;
        E.loadPreset('dungeon'); E.setTool('select');
        const rc = E.getMapDef().rooms[0].rect;
        E.selectAt(rc[1] + 1, rc[0] + 1);
        const ok = window.__P();
        const p = window.__fn('reloadPaintingCatalog')('/__no_such_catalog__.html');
        const during = window.__P();
        const r = await p;
        const after = window.__P();
        const back = await window.__fn('reloadPaintingCatalog')();
        const restored = window.__P();
        return { ok, during, r, after, back, restored };
      });
      // ⚠ console イベントは CDP 経由で非同期に届き evaluate の解決とレースする
      await sleep(600);
      const warned = consoleWarns.slice(before);
      console.log('  [ref] 成功時 note="' + D.ok.note + '" / 失敗時 note="' + D.after.note + '"');
      check('§6 6a 成功時の #paintNote が「1枚絵 24 枚 / 情景 13 種」(.ng なし)',
        /1枚絵 24 枚/.test(D.ok.note) && /情景 13 種/.test(D.ok.note) && D.ok.noteNg === false, D.ok.note);
      check('§6 6b 取得中は「読込中…」の 1 項目 + disabled (部屋を選んでいても)',
        D.during.options === 1 && D.during.disabled === true && /読込中/.test(D.during.note),
        'options=' + D.during.options + ' note=' + D.during.note);
      check('§6 6c ★取得失敗で ok:false / option は「(取得失敗)」の 1 項目 + disabled',
        D.r.ok === false && D.after.options === 1 && D.after.disabled === true,
        'ok=' + D.r.ok + ' options=' + D.after.options);
      check('§6 6d ★取得失敗が #paintNote に .ng 付きで出る (silent fail-open にしない)',
        D.after.noteNg === true && /1枚絵カタログ/.test(D.after.note), D.after.note);
      check('§6 6e ★取得失敗で console.warn が出る (silent fail-open にしない)',
        warned.some(t => /1枚絵カタログ.*取得できませんでした/.test(t)),
        '差分=' + warned.length + ' 最新="' + (warned[warned.length - 1] || '').slice(0, 80) + '"');
      check('§6 6f ★scenerySel は 1枚絵カタログが落ちても有効のまま (密度は本編側で解決する)',
        D.after.sceneryDisabled === false && D.after.sceneryValues.length === 4,
        'disabled=' + D.after.sceneryDisabled);
      check('§6 6g 再取得で 25 option / 有効 / note が正常へ戻る (再取得の契約)',
        D.back.ok === true && D.restored.options === 25 && D.restored.disabled === false &&
        D.restored.noteNg === false, 'options=' + D.restored.options);
      await page.close();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 本編側 (§7)
    // ══════════════════════════════════════════════════════════════════════════
    /* payload=null なら素の廃坑 (母集団ガード = 従来経路)。戻りは測定値一式。
     * ⚠ cam は「どこを映して renderMap するか」。**画面外の 1枚絵は drawImage が呼ばれない**
     *   (カリングがある) ので、絵の実描画を数える節ではその絵が映る位置を渡すこと。
     * ⚠ extraQS は追加のクエリ (`&graph=0` など)。§7a の母集団ガードだけが使う (下の注記)。 */
    async function openGame(payload, cam, extraQS) {
      const p = await browser.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push('pageerror: ' + ((e && e.message) || e)));
      p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text()))
        errs.push('console.error: ' + m.text()); });
      await p.setViewport({ width: 1400, height: 900 });
      await p.evaluateOnNewDocument((pl) => {
        try {
          sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
          if (pl) sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(pl));
          else sessionStorage.removeItem('dragonfighters.generatedScenario');
        } catch (e) {}
        window.__di = []; window.__diOn = false;
        const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
        proto.drawImage = function (src) {
          if (window.__diOn) {
            let key = 'other';
            try {
              if (src instanceof HTMLImageElement) key = 'img:' + String(src.getAttribute('src') || src.src);
              else if (src instanceof HTMLCanvasElement) key = 'canvas:' + src.width + 'x' + src.height;
            } catch (e) {}
            window.__di.push([key].concat(Array.prototype.slice.call(arguments, 1)
              .map(v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))));
          }
          return orig.apply(this, arguments);
        };
      }, payload);
      await p.goto(BASE + '/index.html?diag=1' + (extraQS || ''), { waitUntil: 'domcontentloaded' });
      await p.waitForFunction("typeof PARTY_START_TX !== 'undefined' && typeof sceneryPlacements !== 'undefined'",
        { timeout: 30000 });
      await p.waitForFunction("roomPaintings.length === 0 || roomPaintings.every(p => p.loaded)",
        { timeout: 40000 });

      const m = await p.evaluate((cam) => {
        /* 予約タイル集合を generateScenery と**同じ仕様**で独立に組み直す (実装の写しではない)。 */
        const reserved = new Set();
        const add = (r, c, buf) => {
          for (let dr = -buf; dr <= buf; dr++) for (let dc = -buf; dc <= buf; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= MAP_H || cc < 0 || cc >= MAP_W) continue;
            reserved.add(rr * MAP_W + cc);
          }
        };
        for (const [r1, c1, r2, c2] of CORRIDORS)
          for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) add(r, c, 2);
        for (const sp of ENEMY_SPAWNS) add(sp[2], sp[1], 1);
        add(START_TY, START_TX, 1);

        const out = {
          isCustom: !!MAPDEF.isCustom,
          rooms: ROOMS.map(r => r.slice()),
          paintings: roomPaintings.map(p => ({ src: p.img.getAttribute('src'),
            tx: p.tx, ty: p.ty, tw: p.tw, th: p.th, px: p.px, py: p.py, pw: p.pw, ph: p.ph })),
          scenery: sceneryPlacements.map(s => ({ k: s.kind, v: s.variant, tx: s.tx, ty: s.ty,
                                                 b: !!s.blocking })),
          sceneryN: sceneryPlacements.length,
          kindCounts: {}, blockingOnReserved: 0, outsideRooms: 0, onWall: 0, obstacleSum: 0,
          seedCollision: (typeof hashStr === 'function')
            ? (hashStr(_scenIdForTex + ':mapdef:0') === hashStr(_scenIdForTex + ':0')) : null,
        };
        for (const s of sceneryPlacements) {
          out.kindCounts[s.kind] = (out.kindCounts[s.kind] || 0) + 1;
          const key = s.ty * MAP_W + s.tx;
          if (s.blocking && reserved.has(key)) out.blockingOnReserved++;
          if (mapData[s.ty] && mapData[s.ty][s.tx] === 2) out.onWall++;
          let inside = false;
          for (const [r1, c1, r2, c2] of ROOMS)
            if (s.ty >= r1 && s.ty <= r2 && s.tx >= c1 && s.tx <= c2) { inside = true; break; }
          if (!inside) out.outsideRooms++;
        }
        for (let i = 0; i < obstacleTileMask.length; i++) out.obstacleSum += obstacleTileMask[i];

        camX = cam.x; camY = cam.y;
        /* ⚠⚠ drawCloudShadows が Date.now() を読むため、屋外テーマでは描画件数が計測ごとに揺れる。
         *   数える区間だけ時刻を凍結する (計測後に必ず復元)。 */
        const _now = Date.now; Date.now = () => 1700000000000;
        window.__di.length = 0; window.__diOn = true;
        let err = null;
        try { renderMap(); } catch (e) { err = String((e && e.message) || e); }
        window.__diOn = false; Date.now = _now;
        out.renderErr = err;
        // 1枚絵の描画 = オフスクリーン canvas (画像の自然サイズ) を 1000px 超の矩形で貼る呼び出し
        out.paintDraws = window.__di.filter(d => /^canvas:/.test(d[0]) && d[3] >= 1000);
        return out;
      }, cam || CAM);
      m.errs = errs;
      await p.close();
      return m;
    }

    mark('§7a 母集団ガード — 従来経路 (素の廃坑) は 1 つも変わっていない');
    /* ★カメラは山場の絵の左上 (tileBounds [5,24,…] = px 2304 / py 480) に合わせる。
     *   camera(0,0) だと絵が画面外でカリングされ drawImage が 1 度も呼ばれない
     *   = 「描かれた」を測れない (実測: draws=0)。
     *
     * ⚠⚠ **`?graph=0` を必ず付ける** (2026-08-11 に赤くなって判明)。ゲームブック風分岐マップの
     *   P5 (`a4c6091`) で **廃坑は既定で分岐版**になり、entry ノードの mapDef が採用されて
     *   `MAPDEF.isCustom=true` になった。つまり「無指定の廃坑」はもう従来経路ではない。
     *   この節が測りたいのは**従来経路 (非カスタム幾何) が 1 バイトも変わっていないこと**なので、
     *   母集団の方を `?graph=0` (index.html が持つ恒久の撤退スイッチ) で従来経路へ固定する。
     *   ⚠ assert を「isCustom=true を期待」へ書き換えて緑にするのは**禁止**。それは母集団ごと
     *     すり替える行為で、P6 で全シナリオが分岐版になった瞬間に**従来経路の検出器が消える**。
     *   ⚠ `?graph=0` が効かなくなったら 7a-0 が落ちる = このガードは空振りしない。 */
    const branchDefault = await openGame(null, { x: 24 * 96, y: 5 * 96 });
    allErrs.push(...branchDefault.errs);
    check('§7 7a-0 ★装置: 無指定の廃坑は分岐版 (isCustom=true) = `?graph=0` が実際に効いている',
      branchDefault.isCustom === true, 'isCustom(無指定)=' + branchDefault.isCustom);
    const base = await openGame(null, { x: 24 * 96, y: 5 * 96 }, '&graph=0');
    allErrs.push(...base.errs);
    check('§7 7a-1 素の廃坑 (?graph=0) は isCustom=false', base.isCustom === false, 'isCustom=' + base.isCustom);
    check('§7 7a-2 1枚絵 2 枚 / 絵側の tileBounds (山場 tx=24,ty=5,20×16)',
      base.paintings.length === 2 && base.paintings[0].tx === 24 && base.paintings[0].ty === 5 &&
      base.paintings[0].tw === 20 && base.paintings[0].th === 16,
      J(base.paintings.map(p => [p.tx, p.ty, p.tw, p.th])));
    check('§7 7a-3 情景が 41 件 (従来経路の配置が 1 個も動いていない)',
      base.sceneryN === 41, 'n=' + base.sceneryN);
    check('§7 7a-4 ★従来経路の 1枚絵が **絵側 tileBounds の位置**で実描画される (renderMap 例外なし)',
      base.renderErr === null && base.paintDraws.length === 1 &&
      J(base.paintDraws[0].slice(1)) === J([0, 0, 1920, 1536]),
      'err=' + base.renderErr + ' draws=' + J(base.paintDraws));

    mark('§7b 指定なしのカスタムマップ → 絵も情景も無し (Phase 2 の挙動を維持)');
    const plain = await openGame(mkPayload({}));
    allErrs.push(...plain.errs);
    check('§7 7b-1 カスタム幾何として採用され rect が自作のもの',
      plain.isCustom === true && J(plain.rooms) === J([ROOM0, ROOM1]), J(plain.rooms));
    check('§7 7b-2 指定なし → 1枚絵 0 枚 / 情景 0 件 / obstacleTileMask を汚さない',
      plain.paintings.length === 0 && plain.sceneryN === 0 && plain.obstacleSum === 0,
      'paint=' + plain.paintings.length + ' scen=' + plain.sceneryN + ' obst=' + plain.obstacleSum);

    mark('§7c 1枚絵 — ★★貼る矩形は部屋の rect (絵側の tileBounds ではない)');
    const P = await openGame(mkPayload({ painting: { theme: 'goblin-mine', key: '1' } }));
    allErrs.push(...P.errs);
    const p0 = P.paintings[0] || {};
    check('§7 7c-1 painting 指定で 1 枚だけ積まれ src が参照から引いた実 src',
      P.paintings.length === 1 && p0.src === 'assets/room_goblin-mine_1_bs.jpg',
      'n=' + P.paintings.length + ' src=' + p0.src);
    check('§7 7c-2 ★★貼る矩形が部屋の rect (tx=3, ty=3, tw=20, th=16)',
      p0.tx === 3 && p0.ty === 3 && p0.tw === 20 && p0.th === 16, J([p0.tx, p0.ty, p0.tw, p0.th]));
    check('§7 7c-3 ★[対照] 絵側の tileBounds (tx=24, ty=5) では**ない**',
      !(p0.tx === 24 && p0.ty === 5), J([p0.tx, p0.ty]));
    check('§7 7c-4 ★drawImage の宛先矩形も rect (camera 0,0 で 288,288,1920,1536)',
      P.paintDraws.length === 1 && J(P.paintDraws[0].slice(1)) === J([288, 288, 1920, 1536]),
      J(P.paintDraws));
    check('§7 7c-5 1枚絵だけ指定 → 情景は湧かない (ゲートが独立している)',
      P.sceneryN === 0, 'n=' + P.sceneryN);

    const Pn = await openGame(mkPayload({ painting: { theme: '__no_such__', key: '1' } }));
    allErrs.push(...Pn.errs);
    const Pk = await openGame(mkPayload({ painting: { theme: 'goblin-mine', key: '99' } }));
    allErrs.push(...Pk.errs);
    check('§7 7c-6 ★引けない theme → 絵なし (別テーマの絵を捏造しない)',
      Pn.paintings.length === 0, 'n=' + Pn.paintings.length);
    check('§7 7c-7 引けない key → 絵なし', Pk.paintings.length === 0, 'n=' + Pk.paintings.length);

    const P2 = await openGame(mkPayload({ painting: { theme: 'goblin-mine', key: '1' },
                                          painting1: { theme: 'dragon-lair', key: '2' } }));
    allErrs.push(...P2.errs);
    check('§7 7c-8 2 部屋とも指定 → それぞれの rect に乗る (2 枚目は tx=30,ty=5,22×18)',
      P2.paintings.length === 2 && P2.paintings[1].tx === 30 && P2.paintings[1].ty === 5 &&
      P2.paintings[1].tw === 22 && P2.paintings[1].th === 18 &&
      P2.paintings[1].src === 'assets/room_dragon-lair_2.png',
      J(P2.paintings.map(p => [p.tx, p.ty, p.tw, p.th, p.src])));

    mark('§7d 情景 — density スケール / 床のみ / 決定論');
    /* goblin-mine の代表レシピ = {rubble:26, rail:10, cart:5} / area 676。
     * 部屋0 の面積 = 20×16 = 320 → 面積比 320/676 = 0.473373。
     * ⭐ 実証は rail で行う: 3 variant とも blocking:false = 予約タイルで弾かれないので
     *   要求数がそのまま件数になる (rubble / cart は blocking を含むので件数が揺れる)。
     *     density 0.5 → round(10 × 0.473373 × 0.5) = 2
     *     density 1.0 → round(10 × 0.473373 × 1.0) = 5
     *     density 1.8 → round(10 × 0.473373 × 1.8) = 9 */
    const S10 = await openGame(mkPayload({ scenery: { density: 1 } }));
    const S05 = await openGame(mkPayload({ scenery: { density: 0.5 } }));
    const S18 = await openGame(mkPayload({ scenery: { density: 1.8 } }));
    const S10b = await openGame(mkPayload({ scenery: { density: 1 } }));
    for (const m of [S10, S05, S18, S10b]) allErrs.push(...m.errs);
    check('§7 7d-1 scenery 指定で情景が湧き、種は廃坑レシピの 3 種のみ',
      S10.sceneryN > 0 && Object.keys(S10.kindCounts).sort().join(',') === 'cart,rail,rubble',
      J(S10.kindCounts));
    check('§7 7d-2 ★density スケール式: rail = 2 / 5 / 9 (density 0.5 / 1.0 / 1.8)',
      S05.kindCounts.rail === 2 && S10.kindCounts.rail === 5 && S18.kindCounts.rail === 9,
      J([S05.kindCounts.rail, S10.kindCounts.rail, S18.kindCounts.rail]));
    check('§7 7d-3 総数が density で単調増加',
      S05.sceneryN < S10.sceneryN && S10.sceneryN < S18.sceneryN,
      S05.sceneryN + ' < ' + S10.sceneryN + ' < ' + S18.sceneryN);
    check('§7 7d-4 ★全部が部屋 rect の内側 / ★床タイルにだけ置く (壁 mapData===2 に 0 件)',
      S10.outsideRooms === 0 && S10.onWall === 0,
      'outside=' + S10.outsideRooms + ' onWall=' + S10.onWall);
    check('§7 7d-5 blocking 種が obstacleTileMask に積まれている', S10.obstacleSum > 0,
      'sum=' + S10.obstacleSum);
    check('§7 7d-6 情景だけ指定 → 1枚絵は乗らない (ゲートが独立している)',
      S10.paintings.length === 0, 'n=' + S10.paintings.length);
    check('§7 7d-7 ★RNG seed が従来キー (themeId+":"+roomIdx) と衝突しない',
      S10.seedCollision === false, 'collision=' + S10.seedCollision);
    check('§7 7d-8 決定論: 同じマップを 2 回開くと 1 件も動かない',
      J(S10.scenery) === J(S10b.scenery), 'n=' + S10.sceneryN + '/' + S10b.sceneryN);
    check('§7 7d-9 通常の部屋でも blocking 種が予約タイルを踏まない',
      S10.blockingOnReserved === 0, 'hits=' + S10.blockingOnReserved);

    mark('§7e ★★予約タイル — 全タイルが予約された部屋では blocking 種が 1 つも置けない');
    /* ⚠⚠ ここが負制御④ の主測定。「たまたま予約タイルに当たらなかった」で PASS しないよう、
     *   部屋 r2 [8,53,16,66] を廊下 [10,55,14,64] の +2 膨張と**完全一致**させてある =
     *   その部屋のタイルは 100% 予約済み。予約を通っていれば blocking 種は原理的に 0 件、
     *   通っていなければ cart (3 variant とも blocking) が必ず出る = 確率に依らない分離。 */
    const RES = await openGame(mkPayload({ reservedRoom: 1.8 }));
    allErrs.push(...RES.errs);
    {
      const inRes = RES.scenery.filter(s => inRect(s, ROOM_RES));
      const blk = inRes.filter(s => s.b);
      const nonBlk = inRes.filter(s => !s.b);
      check('§7 7e-1 装置: 予約だけの部屋 (r2) が採用され情景ジョブが走っている',
        RES.rooms.length === 3 && J(RES.rooms[2]) === J(ROOM_RES) && inRes.length > 0,
        'rooms=' + RES.rooms.length + ' 置いた数=' + inRes.length);
      check('§7 7e-2 ★★blocking 種が 1 つも置かれない (globalReserved を必ず通っている)',
        blk.length === 0, 'blocking=' + blk.length + ' 内訳=' + J(blk.map(s => s.k + '/' + s.v)));
      check('§7 7e-3 ★[対照] 非 blocking 種は置かれている (ジョブごと空振りしていない証明)',
        nonBlk.length > 0, 'nonBlocking=' + nonBlk.length + ' 種=' +
        J(Array.from(new Set(nonBlk.map(s => s.k)))));
      check('§7 7e-4 ★cart (3 variant とも blocking) が 0 件 = 予約で確実に弾かれている',
        inRes.filter(s => s.k === 'cart').length === 0,
        'cart=' + inRes.filter(s => s.k === 'cart').length);
      check('§7 7e-5 r2 の情景が予約タイルを 1 つも踏んでいない (通行可能域が変わらない)',
        RES.blockingOnReserved === 0, 'hits=' + RES.blockingOnReserved);
    }

    mark('§7f フォールバック / ゲート 2 箇所の同時開放');
    const SR = await openGame(mkPayload({ themeId: 'undead-temple', scenery: { density: 1 } }));
    const B = await openGame(mkPayload({ painting: { theme: 'goblin-mine', key: '1' },
                                         scenery: { density: 1 } }));
    allErrs.push(...SR.errs, ...B.errs);
    check('§7 7f-1 ★レシピ無しテーマ (undead-temple) でも情景が湧き goblin-mine 既定へ落ちる',
      SR.sceneryN > 0 && Object.keys(SR.kindCounts).sort().join(',') === 'cart,rail,rubble' &&
      SR.kindCounts.rail === 5, J(SR.kindCounts));
    check('§7 7f-2 ★ゲート 2 箇所が同時に開く (絵と情景が両方出る = 片方だけの中途半端が無い)',
      B.paintings.length === 1 && B.paintDraws.length === 1 && B.sceneryN > 0,
      'paint=' + B.paintings.length + ' draws=' + B.paintDraws.length + ' scen=' + B.sceneryN);
    check('§7 7f-3 併用でも床のみ / 予約を踏まない / renderMap 例外なし',
      B.onWall === 0 && B.blockingOnReserved === 0 && B.renderErr === null,
      'onWall=' + B.onWall + ' reserved=' + B.blockingOnReserved + ' err=' + B.renderErr);

    // ══════════════════════════════════════════════════════════════════════════
    mark('§E コンソール健全性');
    check('§E pageerror / console.error が 0 件', allErrs.length === 0,
      allErrs.length ? allErrs.slice(0, 4).join(' | ') : 'なし');
    check('§E 意図しない 404 が 0 件 (favicon / §6 の意図的な欠損を除く)', rec.notFound.length === 0,
      rec.notFound.length ? rec.notFound.slice(0, 4).join(' | ') : 'なし');
    check('§E 意図した 404 (§6 の取得失敗) は実際に起きている', rec.expected404.length >= 1,
      J(rec.expected404.slice(0, 3)));

  } catch (e) {
    console.error('\n[drv] 例外: ' + ((e && e.stack) || e));
    fail++; fails.push('driver exception');
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }

  console.log('\n' + '═'.repeat(72));
  console.log('  PASS ' + pass + ' / FAIL ' + fail + '  (合計 ' + (pass + fail) + ')');
  if (fail) console.log('  落ちた assert:\n    - ' + fails.join('\n    - '));
  console.log('═'.repeat(72));

  if (MUTATE && fail === 0) {
    console.error('[drv] ⛔ 変異 ' + MUTATE + ' を入れたのに全 PASS = 負のコントロールが死んでいる');
    process.exit(4);
  }
  process.exit(fail ? 1 : 0);
})();
