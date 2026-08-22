/*
 * driver_grid_s2.js — ★[#11] シナリオ2 ボスノード n7「盗賊団のアジト」大部屋化の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * 主張は 6 つ:
 *   ① codex1 納品の卓上バトルマップ (52x26) が n7 に**1 枚**貼られ、tileBounds が
 *      部屋 rect [1,10,26,61] と**完全一致**する (paintingAspectFits の要求)。
 *   ② 絵の blocked マスクが実マップへ効いている。⚠ 突き合わせる相手は**絵の側の元データ**
 *      (ROOM_PAINTINGS_DEF の blocked 文字列)。実装の戻り値どうしを比べると、
 *      両方が同じ誤りを持っていた場合に永久に緑になる。
 *   ③ 川は橋 (30-31, 15-16) でしか渡れない = 入場からボスへの本番 aStar 経路が橋を通る。
 *   ④ 外周は sealRing で塞がっている。歩ける外周マスは**4 方向のゲートタイルだけ**。
 *   ⑤ density:0 が効いて情景が 1 個も湧かない (絵に既に草も倒木も描かれているため)。
 *   ⑥ 他 4 シナリオの mapDef は 1 バイトも変わっていない (STEP3「配線だけ」の非退行)。
 *      加えて n0〜n6 (残影の獣 / 罠 / 宝箱 / 湧き水) も無改修。
 *
 * ── 負のコントロール (同一 run に内包。配信をメモリ上で差し替える) ──────────────
 *   port   | mutate      | 注入する欠陥                                  | 赤くなるべき節
 *   PORT   | (素)        | —                                             | —
 *   PORT+1 | nobridge    | マスクの橋の行 (row14) を塞ぐ                  | §3 (3a)
 *   PORT+2 | nostart     | p6Node の start 上書きを外す (既定 36,13 へ)   | §3 (3b) = §2 の穴
 *   PORT+3 | nodensity   | density の既定落としを != null から || へ      | §3 (3c) = §7 の情景
 *   PORT+4 | noring      | sealRing の適用を殺す                          | §3 (3d) = §6 の外周
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**。
 * ⚠ **部分文字列で 2 箇所に当たる行を選ばない**。p6Node の scenery 行は
 *   buildGoblinMineRun の node() と**インデント違いの同一文**なので、末尾に `// ★p6Node` を
 *   付けて一意にしてある (driver_doors_p6 の noleafguard と同じ作法)。
 *
 * 使い方:
 *   node tools/driver_grid_s2.js
 *   node tools/driver_grid_s2.js --mutate nobridge --headful
 *   node tools/driver_grid_s2.js --update-golden     ← §8 の基準値を記録 (git add して commit)
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

/* ⚠⚠ path.resolve 必須。'/' 区切りのままだと startsWith が必ず false で全 404 になる。 */
const ROOT = path.resolve(__dirname, '..');
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}
const HEADFUL = process.argv.includes('--headful');
const UPDATE_GOLDEN = process.argv.includes('--update-golden');
/* ⚠ ポートは既存ドライバと 6 以上空ける (本ドライバは PORT..PORT+4 の 5 本を掴む)。 */
const PORT = parseInt(arg('port', '9320'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (ドライバ側が持つ「契約」。実装から読み取ると実装の誤りを一緒に信じてしまう)
// ══════════════════════════════════════════════════════════════════════════════
const SCEN = 'bandits-forest';
const NODE = 'n7';
const RECT = [1, 10, 26, 61];              // [r1,c1,r2,c2] = 26 行 x 52 列
const PAINT_KEY = 'n7big';
const PAINT_SRC = 'assets/room_bandits-forest_n7_map.jpg';
const OLD_SRC = 'assets/room_bandits-forest_n7.jpg';
const OLD_RECT = [11, 32, 16, 40];         // 旧 9x6 (?banditmap=0 の行き先)
const COLS = RECT[3] - RECT[1] + 1;        // 52
const ROWS = RECT[2] - RECT[0] + 1;        // 26
const GATE_LEFT = [10, 15];                // 絵に描かれた街道の西口 (絵ローカル 0,14)
const ENTRY = [12, 15];                    // ★ゲートではなく NODE_ENTRY_INSET=2 だけ内側
const BOSS = [57, 12];                     // 赤い天幕の前 (絵ローカル 47,11)
const BRIDGE = [[30, 15], [31, 15], [30, 16], [31, 16]];   // 唯一の渡り
/* 外周で歩けてよいのは 4 方向のゲートタイルだけ。
 *   left  = 絵の gates 指定 (10,15)
 *   up / down / right = nodeGateTile の既定 (辺の中点)。midC=floor((10+61)/2)=35 /
 *                       midR=floor((1+26)/2)=13 なので (35,1) / (35,26) / (61,13)。 */
const RING_OPEN_OK = [GATE_LEFT, [35, 1], [35, 26], [61, 13]];
const ZOOM_MIN = 0.25;
/* 他 4 シナリオ = 上書きを 1 つも書いていない = STEP3 の既定値が 1 ビットも動いていない証拠 */
const UNTOUCHED = ['lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const S2_KEEP_NODES = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'];

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  /* マスクの row14 (街道と橋の行) の橋 2 マスを塞ぐ = 川を渡れなくする。
   * ⚠ この 1 行は絵ローカル row14 のマスクそのもの。行を動かしたら**必ずここも直す**
   *   (変異アンカーが 0 件ヒットすると exit 3 でドライバごと死ぬ)。 */
  nobridge: [
    ['               "................................................###.",   // 14',
     '               "....................##..........................###.",  /* ★変異nobridge */ // 14'],
    /* ⚠⚠ **橋は 2 行ある** (絵ローカル rows 14-15)。row14 だけ塞いでも row15 で渡れてしまい、
     *   負のコントロールが空振りする (2026-08-22 に実際に踏んだ = (3a) が 50 歩で赤くならなかった)。 */
    ['               "........########................................###.",   // 15',
     '               "........########....##..........................###.",  /* ★変異nobridge2 */ // 15']],
  /* start の上書きを外す = 既定 (36,13) = 絵ローカル (26,12) = 北東の岩場の内側。
   * buildNode の「起点の床保証」がそこを問答無用に床へ彫るので、マスクに穴が 1 マス開く。 */
  nostart: [
    '        corridors: [], start: opt.start != null ? opt.start : { tx: 36, ty: 13 },',
    '        corridors: [], start: { tx: 36, ty: 13 },   /* ★変異nostart */'],
  /* 既定落としを != null から || へ。density:0 は falsy なので黙って 1 に戻る。 */
  nodensity: [
    '                  scenery: { density: opt.density != null ? opt.density : 1 } }],   // ★p6Node',
    '                  scenery: { density: opt.density || 1 } }],   /* ★変異nodensity */'],
  /* 外周封鎖を殺す。⚠ n7big の `sealRing: true,` は n0 / n1 と同一文なので**アンカーにできない**
   *   (部分文字列で 3 箇所に当たる)。適用側の 1 行を握るのが正しい。 */
  noring: [
    '        const sealing = !!(p.sealRing && !PAINT_RING_OFF);',
    '        const sealing = false;   /* ★変異noring */'],
};
const MUT_ORDER = ['nobridge', 'nostart', 'nodensity', 'noring'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  /* 1 組 ([from,to]) でも複数組 ([[from,to],[from,to]]) でも受ける。
   * ⚠ 複数組が要るのは「橋が 2 行ある」ように**欠陥の注入点が複数ある**場合。
   *   1 行しか塞がないと迂回できてしまい、負のコントロールが黙って空振りする。 */
  const pairs = Array.isArray(MUTATIONS[key][0]) ? MUTATIONS[key] : [MUTATIONS[key]];
  let target = null;
  for (const [from, to] of pairs) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    if (from.length === to.length) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → (0-*) が誤報する');
      process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 100)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
    target = hits[0];
  }
  _mutCache[key] = { files: out, target: target };
  return _mutCache[key];
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
/* ⚠ MIME は helper 切り出しで落としやすい。落とすと try/catch に飲まれて**全 500** = 白紙。 */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey).files[rel]); return;
        }
        const fp = path.join(ROOT, u);
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
function httpStatus(port, p) {
  return new Promise((res) => {
    http.get({ host: 'localhost', port: port, path: p }, r => { r.resume(); res(r.statusCode); })
      .on('error', () => res(0));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const G = require('./_golden')('grid_s2', { update: UPDATE_GOLDEN });

async function bootPage(browser, url, errs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, SCEN);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* ★★測定の本体は 1 つ。素の版にも ?banditmap=0 にも変異版にも**同じ関数**を当てる。
 * ⚠ #5 の教訓: 「スイッチを外すと赤」を緑側だけで測ると、何も起きないので結果的に
 *   期待値と一致して空振りする。§9 は下の contractOf() が返す**状態の conjunction**で判定する。
 * ⚠⚠ 実プレイと同じ入口 (resetNodeState → buildNode(resolveNodeMapDef(id), id) → …) を通す。
 *   buildNode(mapDef) を直に呼ぶと MAPDEF.isCustom が付かず、旧在庫 (キー "1"/"2") の絵が
 *   貼られたままの盤面を測ってしまう (2026-08-22 に実際に踏んだ)。 */
async function measureNode(page, nodeId, via) {
  return page.evaluate((scen, id, dir, RECT_, ENTRY_, BOSS_, KEY_) => {
    const out = { err: null };
    if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[id]) {
      out.err = 'RUN に ' + id + ' が無い'; return out;
    }
    resetNodeState();
    currentNodeId = id;
    buildNode(resolveNodeMapDef(id), id);
    try { restoreNodeState(id); } catch (e) {}
    try { placeNodeParty(dir); } catch (e) {}
    try { applyNodeZoom(); } catch (e) {}
    const md = RUN.byId[id].mapDef;
    const room = (md.rooms || [])[0] || {};
    out.name = md.name;
    out.rect = room.rect;
    out.start = md.start;
    out.paintKey = room.painting ? room.painting.key : null;
    out.density = room.scenery ? room.scenery.density : null;
    out.isCustom = !!(MAPDEF && MAPDEF.isCustom);
    out.slots = room.enemySlots || [];
    out.boss = room.bossSlot || null;
    /* 実際に積まれた 1 枚絵 (「宣言」ではなく「積まれた結果」) */
    out.paintings = (typeof roomPaintings !== 'undefined' ? roomPaintings : []).map(p => ({
      src: (p.img && p.img.getAttribute('src')) || '',
      bounds: [p.ty, p.tx, p.ty + p.th - 1, p.tx + p.tw - 1], seal: !!p.sealRing }));
    /* 絵の側の**元データ**。実装の戻り値ではない */
    const def = (ROOM_PAINTINGS_DEF[scen] || {})[KEY_] || null;
    out.maskRows = def && def.blocked ? def.blocked.slice() : null;
    out.maskSeal = !!(def && def.sealRing);
    out.maskBounds = def ? def.tileBounds : null;
    /* 実マップ (rect 全域) */
    out.wallRows = [];
    for (let r = RECT_[0]; r <= RECT_[2]; r++) {
      let line = '';
      for (let c = RECT_[1]; c <= RECT_[3]; c++) line += isTileWall(c, r) ? '#' : '.';
      out.wallRows.push(line);
    }
    /* 到達可能性と経路は**本番の aStar**で (4 方向)。自前 BFS は禁止 */
    let p = null;
    try { p = aStar(ENTRY_[0], ENTRY_[1], BOSS_[0], BOSS_[1]); } catch (e) { p = null; }
    out.path = Array.isArray(p)
      ? p.map(n => [n.tx !== undefined ? n.tx : n[0], n.ty !== undefined ? n.ty : n[1]])
      : null;
    out.entryWall = isTileWall(ENTRY_[0], ENTRY_[1]);
    out.bossWall = isTileWall(BOSS_[0], BOSS_[1]);
    /* 情景。density:0 なら 1 個も積まれないはず */
    out.scenery = (typeof sceneryPlacements !== 'undefined' ? sceneryPlacements.length : -1);
    /* 引き倍率 (P8 のシームをそのまま使う。ドライバに規則を写経しない) */
    try { out.largeRoom = window.__largeRoomSize ? window.__largeRoomSize() : null; } catch (e) {}
    try {
      const s = out.largeRoom;
      out.zoom = (window.__zoomForRoom && s) ? window.__zoomForRoom(s.w, s.h) : null;
    } catch (e) { out.zoom = null; }
    try { out.camZoom = window.__camZoom ? window.__camZoom() : null; } catch (e) {}
    out.enemies = (typeof enemies !== 'undefined' ? enemies : []).map(e => ({
      type: e.type, tx: Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE),
      ty: Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE), boss: !!e.isBoss }));
    return out;
  }, SCEN, nodeId, via, RECT, ENTRY, BOSS, PAINT_KEY);
}

/* 「大部屋になっているか」を**状態の conjunction**で 1 つの真偽へ畳む。
 * §9 はこれが ?banditmap=0 で **false** になることを要求する = スイッチが本当に効いた証拠。 */
function contractOf(m) {
  if (!m || m.err) return { ok: false, why: 'measure err: ' + (m && m.err) };
  const why = [];
  if (m.paintKey !== PAINT_KEY) why.push('paintKey=' + m.paintKey);
  if (JSON.stringify(m.rect) !== JSON.stringify(RECT)) why.push('rect=' + JSON.stringify(m.rect));
  if (m.density !== 0) why.push('density=' + m.density);
  if (!m.start || m.start.tx !== ENTRY[0] || m.start.ty !== ENTRY[1]) {
    why.push('start=' + JSON.stringify(m.start));
  }
  if (!m.path || !m.path.length) why.push('ボスへ到達不能');
  if (m.scenery !== 0) why.push('scenery=' + m.scenery);
  return { ok: why.length === 0, why: why.join(' / ') || '全部成立' };
}

/* 絵のマスク (元データ) と実マップの突き合わせ。⚠ 「塞ぐはずが歩ける」= 穴 が本命。 */
function maskDiff(m) {
  const holes = [], extra = [];
  const ringOk = new Set(RING_OPEN_OK.map(t => t[0] + ',' + t[1]));
  for (let r = 0; r < ROWS; r++) {
    const mask = (m.maskRows && m.maskRows[r]) || '';
    const act = m.wallRows[r] || '';
    for (let c = 0; c < COLS; c++) {
      const gx = RECT[1] + c, gy = RECT[0] + r;
      const onRing = (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1);
      const want = (mask[c] === '#') || (m.maskSeal && onRing);
      if (want && act[c] === '.') { if (!ringOk.has(gx + ',' + gy)) holes.push([gx, gy]); }
      else if (!want && act[c] === '#') extra.push([gx, gy]);
    }
  }
  return { holes, extra };
}

function ringOpenCount(m) {
  let open = 0; const at = [];
  for (let c = 0; c < COLS; c++) {
    if (m.wallRows[0][c] === '.') { open++; at.push([RECT[1] + c, RECT[0]]); }
    if (m.wallRows[ROWS - 1][c] === '.') { open++; at.push([RECT[1] + c, RECT[2]]); }
  }
  for (let r = 1; r < ROWS - 1; r++) {
    if (m.wallRows[r][0] === '.') { open++; at.push([RECT[1], RECT[0] + r]); }
    if (m.wallRows[r][COLS - 1] === '.') { open++; at.push([RECT[3], RECT[0] + r]); }
  }
  return { open, at };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 http://localhost:' + PORT + '   変異 ' +
              MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const profile = require('./_pptr_profile')('df_grid_s2_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });

  const PURE = 'http://localhost:' + PORT;
  const errsAll = [];

  // ── §0 変異が本当に配信へ載っているか (空振り検出) ──────────────────────────
  mark('§0 変異の配信検算');
  {
    const base = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const k of MUT_ORDER) {
      const mut = mutatedSources(k);
      check('(0-' + k + ') 変異が 1 箇所だけ当たり、長さが変わる',
            mut.files[mut.target].length !== base.length,
            mut.target + ' Δ=' + (mut.files[mut.target].length - base.length));
    }
    check('(0e) 素材 ' + PAINT_SRC + ' が 200 で引ける',
          (await httpStatus(PORT, '/' + PAINT_SRC)) === 200);
  }

  // ══════════════════════════════════════════════════════════════════════════
  mark('素の版で n7 を測る');
  const page = await bootPage(browser, PURE, errsAll);
  const m = await measureNode(page, NODE, 'right');
  if (m.err) { console.error('[drv] ⛔ ' + m.err); process.exit(1); }

  // ── §1 絵が載っている ────────────────────────────────────────────────────
  mark('§1 絵が載っている');
  check('(1a) n7 の painting.key が "' + PAINT_KEY + '"', m.paintKey === PAINT_KEY, 'key=' + m.paintKey);
  check('(1b) 部屋 rect が ' + JSON.stringify(RECT),
        JSON.stringify(m.rect) === JSON.stringify(RECT), JSON.stringify(m.rect));
  check('(1c) 絵の tileBounds が rect と完全一致 (paintingAspectFits の要求)',
        JSON.stringify(m.maskBounds) === JSON.stringify(RECT), JSON.stringify(m.maskBounds));
  check('(1d) 実際に積まれた 1 枚絵はちょうど 1 枚', (m.paintings || []).length === 1,
        JSON.stringify((m.paintings || []).map(p => p.src)));
  {
    const p0 = (m.paintings || [])[0] || {};
    check('(1e) 積まれた絵の src が ' + PAINT_SRC, p0.src === PAINT_SRC, String(p0.src));
    check('(1f) 積まれた絵が覆う矩形が rect と一致',
          JSON.stringify(p0.bounds) === JSON.stringify(RECT), JSON.stringify(p0.bounds));
    check('(1g) sealRing が立っている', p0.seal === true, String(p0.seal));
  }
  check('(1h) MAPDEF.isCustom = true (実プレイ経路を通っている装置 assert)', m.isCustom === true);
  check('(1i) ノード名が「頭目の館」から変わっている (絵は野営地であって館ではない)',
        m.name === '盗賊団のアジト', String(m.name));
  check('(1j) start が入場地点 ' + JSON.stringify(ENTRY) + ' へ寄せてある',
        !!m.start && m.start.tx === ENTRY[0] && m.start.ty === ENTRY[1], JSON.stringify(m.start));

  // ── §2 blocked が効いている (絵の元データと突き合わせる) ─────────────────
  mark('§2 blocked マスクが実マップへ効いている');
  {
    /* 装置 assert — マスクが空でも 0 件で緑にならないようにする */
    const rows = (m.maskRows || []).length;
    const hashes = (m.maskRows || []).reduce((a, s) => a + (s.split('#').length - 1), 0);
    check('(2z) マスクが 26 行 x 52 列で塞ぎが十分にある (母集団が空でない装置 assert)',
          rows === ROWS && (m.maskRows || []).every(s => s.length === COLS) && hashes > 800,
          rows + ' 行 / 塞ぎ ' + hashes + ' マス');
    const d = maskDiff(m);
    check('(2a) 塞ぐはずが歩けるマス (穴) が 0',
          d.holes.length === 0, d.holes.length + ' 個 ' + JSON.stringify(d.holes.slice(0, 8)));
    check('(2b) 塞がないはずが壁のマスが 0',
          d.extra.length === 0, d.extra.length + ' 個 ' + JSON.stringify(d.extra.slice(0, 8)));
    /* 敵スポーンは applyPaintingBlocking の門番を通る = マスクで塞がれない。
     * 逆に言えば**マスクが '#' のマスに敵を置くと穴が開く**ので、そこを直接測る。 */
    const bad = (m.slots || []).concat(m.boss ? [m.boss] : []).filter(sl => {
      const r = sl[1] - RECT[0], c = sl[0] - RECT[1];
      return !(m.maskRows && m.maskRows[r] && m.maskRows[r][c] === '.');
    });
    check('(2c) 敵スポーンが 1 体もマスクの塞ぎに載っていない (穴あけ防止)',
          bad.length === 0, bad.length + ' 体 ' + JSON.stringify(bad));
    check('(2d) 装置 assert: 敵が 10 体 + ボス 1 体スポーンしている',
          (m.enemies || []).length === 10, (m.enemies || []).length + ' 体');
  }

  // ── §4 §5 到達可能性と経路 ───────────────────────────────────────────────
  mark('§4 §5 入場 → ボス (本番の aStar / 4 方向)');
  check('(4a) 入場地点 ' + JSON.stringify(ENTRY) + ' が床', m.entryWall === false);
  check('(4b) ボス ' + JSON.stringify(BOSS) + ' が床', m.bossWall === false);
  check('(4c) 入場 → ボス が本番の aStar で到達可能', !!m.path && m.path.length > 0,
        m.path ? m.path.length + ' 歩' : '到達不能');
  {
    const set = new Set((m.path || []).map(p => p[0] + ',' + p[1]));
    const via = BRIDGE.filter(b => set.has(b[0] + ',' + b[1]));
    check('(5a) その経路が橋 ' + JSON.stringify(BRIDGE) + ' を通る',
          via.length > 0, '通ったマス ' + JSON.stringify(via));
  }

  // ── §6 外周が塞がっている ────────────────────────────────────────────────
  mark('§6 外周 (sealRing)');
  {
    const R = ringOpenCount(m);
    const ok = new Set(RING_OPEN_OK.map(t => t[0] + ',' + t[1]));
    const unexpected = R.at.filter(t => !ok.has(t[0] + ',' + t[1]));
    check('(6a) 外周で歩けるのは 4 方向のゲートタイルだけ', unexpected.length === 0,
          '歩ける外周 ' + R.open + ' マス / 想定外 ' + unexpected.length + ' ' +
          JSON.stringify(unexpected.slice(0, 8)));
    check('(6b) その 4 マスは実際に歩ける (門番の例外が効いている装置 assert)',
          R.open === RING_OPEN_OK.length, R.open + ' マス ' + JSON.stringify(R.at));
  }

  // ── §7 scenery が湧かない ────────────────────────────────────────────────
  mark('§7 density:0 で情景が湧かない');
  check('(7a) n7 の density が 0', m.density === 0, String(m.density));
  check('(7b) sceneryPlacements が 0 個', m.scenery === 0, m.scenery + ' 個');
  {
    /* 装置 assert — 「情景が数えられている」ことを density:1 のノードで示す。
     * ⚠ これが無いと sceneryPlacements の読みが壊れていても (7b) は永久に緑。 */
    const m4 = await measureNode(page, 'n4', 'right');
    check('(7c) 装置 assert: density:1 の n4 では情景が 1 個以上湧く',
          m4.density === 1 && m4.scenery > 0, 'n4 density=' + m4.density + ' scenery=' + m4.scenery);
  }

  // ── §10 引き倍率 ─────────────────────────────────────────────────────────
  mark('§10 引き倍率 (largeRoomSize / zoomForRoom)');
  const m7 = await measureNode(page, NODE, 'right');
  check('(10a) __largeRoomSize() が w=52 / h=26',
        !!m7.largeRoom && m7.largeRoom.w === COLS && m7.largeRoom.h === ROWS,
        JSON.stringify(m7.largeRoom));
  check('(10b) __zoomForRoom() が ZOOM_MIN (' + ZOOM_MIN + ') へクランプされない',
        typeof m7.zoom === 'number' && m7.zoom > ZOOM_MIN, 'zoom=' + m7.zoom);
  check('(10c) 実際のカメラ倍率も 1 未満 (大部屋として引けている)',
        typeof m7.camZoom === 'number' && m7.camZoom < 1 && m7.camZoom > ZOOM_MIN,
        'camZ=' + m7.camZoom);
  {
    /* ⚠⚠ **母集団は画面の向きでも割れる**。zoomForRoom は cover (fitW と fitH の大きい方) を
     *   採るので、横長デスクトップと縦長 compact で効く軸が入れ替わる。
     *   片方だけで測ると、もう片方でだけ ZOOM_MIN へ張り付く欠陥を見逃す。 */
    const pc = await bootPage(browser, PURE, errsAll);
    await pc.setViewport({ width: 390, height: 844 });
    const mc = await measureNode(pc, NODE, 'right');
    check('(10d) compact (390x844) でも ZOOM_MIN へクランプされない',
          typeof mc.zoom === 'number' && mc.zoom > ZOOM_MIN, 'zoom=' + mc.zoom);
    check('(10e) 装置 assert: compact と desktop で倍率が実際に違う (向きで軸が入れ替わる)',
          typeof mc.zoom === 'number' && typeof m7.zoom === 'number' && mc.zoom !== m7.zoom,
          'compact=' + mc.zoom + ' desktop=' + m7.zoom);
    await pc.close();
  }

  // ── §11 §12 隠し要素 / 罠 / 宝箱 が無改修 ────────────────────────────────
  mark('§11 §12 n0〜n6 が無改修 (残影の獣 / 罠 / 宝箱 / 湧き水)');
  const keepJson = await page.evaluate((scen, ids) => {
    const run = buildScenarioRun(scen);
    const byId = run.byId || {};
    const out = {};
    for (const id of ids) {
      const nd = byId[id] || run.nodes.find(n => n.id === id);
      out[id] = { kind: nd.kind, mapDef: JSON.stringify(nd.mapDef) };
    }
    const ex = (typeof SCENARIO_NODE_EXTRAS !== 'undefined' ? SCENARIO_NODE_EXTRAS[scen] : null);
    out.__extras = ex ? JSON.stringify(ex) : null;
    return out;
  }, SCEN, S2_KEEP_NODES);
  check('(11a) n6 (残影の獣の間) の kind が event', keepJson.n6.kind === 'event', keepJson.n6.kind);
  check('(11b) SCENARIO_NODE_EXTRAS の n6 が生きている',
        !!keepJson.__extras && keepJson.__extras.indexOf('n6') >= 0);
  check('(12a) n2 の kind が search (罠の湧き口)', keepJson.n2.kind === 'search', keepJson.n2.kind);
  check('(12b) n3 の kind が loot (宝箱の湧き口)', keepJson.n3.kind === 'loot', keepJson.n3.kind);
  check('(12c) n5 の kind が rest (湧き水の泉)', keepJson.n5.kind === 'rest', keepJson.n5.kind);
  for (const id of S2_KEEP_NODES) {
    G.check(check, '(11-' + id + ') ' + SCEN + '/' + id + ' の mapDef が golden と一致',
            's2-' + id, keepJson[id].mapDef);
  }

  // ── §8 他 4 シナリオの mapDef が不変 ─────────────────────────────────────
  mark('§8 他 4 シナリオの mapDef が 1 バイトも変わっていない');
  const others = await page.evaluate((scens) => {
    const out = {};
    for (const s of scens) {
      const run = buildScenarioRun(s);
      out[s] = {};
      for (const nd of run.nodes) out[s][nd.id] = JSON.stringify(nd.mapDef);
    }
    return out;
  }, UNTOUCHED);
  for (const s of UNTOUCHED) {
    for (const id of Object.keys(others[s])) {
      G.check(check, '(8-' + s + '/' + id + ') mapDef が golden と一致', s + '/' + id, others[s][id]);
    }
  }
  /* ⚠ golden が「壊れた状態を焼き付けた」場合に備えて、同じ母集団が相互に異なることを要求 */
  G.distinct(check, '(8z) lizard-swamp の 8 ノードの mapDef が相互に異なる', 'lizard-swamp/');

  // ══════════════════════════════════════════════════════════════════════════
  // §9 撤退スイッチ — **同じ assert 本体**を当てて赤になること
  // ══════════════════════════════════════════════════════════════════════════
  mark('§9 ?banditmap=0 で大部屋化より前の姿へ戻る');
  {
    const off = await bootPage(browser, PURE + '?banditmap=0', errsAll);
    const mo = await measureNode(off, NODE, 'right');
    const c0 = contractOf(m), c1 = contractOf(mo);
    check('(9z) 装置 assert: 素の版では大部屋の契約がすべて成立している', c0.ok === true, c0.why);
    check('(9a) ?banditmap=0 では大部屋の契約が成立しない (= スイッチが効いた)',
          c1.ok === false, c1.why);
    check('(9b) 絵が旧 n7 (9x6) に戻る',
          mo.paintKey === 'n7' && JSON.stringify(mo.rect) === JSON.stringify(OLD_RECT),
          'key=' + mo.paintKey + ' rect=' + JSON.stringify(mo.rect));
    check('(9c) density が 1 に戻る', mo.density === 1, String(mo.density));
    check('(9d) start が既定 (36,13) に戻る',
          !!mo.start && mo.start.tx === 36 && mo.start.ty === 13, JSON.stringify(mo.start));
    check('(9e) 敵スロットが元の 4 + スカーに戻る',
          (mo.slots || []).length === 4 && !!mo.boss && mo.boss[2] === 'scar',
          JSON.stringify(mo.slots) + ' boss=' + JSON.stringify(mo.boss));
    check('(9f) 旧絵 ' + OLD_SRC + ' が 200 で引ける (撤退先が実在)',
          (await httpStatus(PORT, '/' + OLD_SRC)) === 200);
    await off.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §3 負のコントロール — 変異版で**同じ assert 本体**が赤くなること
  // ══════════════════════════════════════════════════════════════════════════
  mark('§3 負のコントロール (変異版)');
  {
    const p1 = await bootPage(browser, 'http://localhost:' + PORT_OF.nobridge, []);
    const m1 = await measureNode(p1, NODE, 'right');
    check('(3z) [nobridge] 装置 assert: 変異が効いて橋の 2 行とも塞がっている',
          !!m1.maskRows && m1.maskRows[14] && m1.maskRows[15] &&
          m1.maskRows[14][20] === '#' && m1.maskRows[14][21] === '#' &&
          m1.maskRows[15][20] === '#' && m1.maskRows[15][21] === '#',
          m1.maskRows ? JSON.stringify([m1.maskRows[14].slice(18, 24), m1.maskRows[15].slice(18, 24)])
                      : 'マスク無し');
    check('(3a) [nobridge] 橋を塞ぐと 入場 → ボス が到達不能',
          !m1.path || m1.path.length === 0,
          m1.path ? m1.path.length + ' 歩 (橋以外に渡りがある = マスクの欠陥)' : '到達不能');
    await p1.close();

    const p2 = await bootPage(browser, 'http://localhost:' + PORT_OF.nostart, []);
    const m2 = await measureNode(p2, NODE, 'right');
    const d2 = maskDiff(m2);
    check('(3b) [nostart] start の上書きを外すとマスクに穴が開く',
          d2.holes.length > 0, d2.holes.length + ' 個 ' + JSON.stringify(d2.holes.slice(0, 4)));
    await p2.close();

    const p3 = await bootPage(browser, 'http://localhost:' + PORT_OF.nodensity, []);
    const m3 = await measureNode(p3, NODE, 'right');
    check('(3c) [nodensity] 既定落としを || にすると情景が湧く', m3.scenery > 0, m3.scenery + ' 個');
    await p3.close();

    const p4 = await bootPage(browser, 'http://localhost:' + PORT_OF.noring, []);
    const m4 = await measureNode(p4, NODE, 'right');
    const R4 = ringOpenCount(m4);
    check('(3d) [noring] sealRing を殺すと外周が歩けるようになる',
          R4.open > RING_OPEN_OK.length,
          '歩ける外周 ' + R4.open + ' マス (素の版は ' + RING_OPEN_OK.length + ')');
    await p4.close();
  }

  // ── 後始末 ────────────────────────────────────────────────────────────────
  check('(E) ページエラーが無い', errsAll.length === 0, JSON.stringify(errsAll.slice(0, 4)));
  G.finish(check);
  await browser.close();
  for (const s of servers) s.close();

  const bad = results.filter(r => !r.ok);
  console.log('\n[drv] ' + (results.length - bad.length) + '/' + results.length + ' PASS');
  if (bad.length) for (const b of bad) console.log('  FAIL ' + b.name + '  — ' + b.detail);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('[drv] ' + ((e && e.stack) || e)); process.exit(3); });
