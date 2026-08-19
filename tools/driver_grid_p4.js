#!/usr/bin/env node
/*
 * driver_grid_p4.js — 卓上グリッド P4 の検証ドライバ (2026-08-19)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 何を入れたか
 *   codex1 納品の 2 枚目 (廃坑.png = 坑道の内部) を tools/make_grid_map.py で 39x23 マスへ
 *   焼き直し、**n1「見張りの詰所」**へ貼った。部屋は 7x6 [11,33,16,39] から
 *   39x23 [2,17,24,55] の大部屋になり、出口 2 本 (left = 引き返す坑口 / up = 梯子) を
 *   絵の gates で移した。right (n4 へ) は辺の中点のまま = 絵の軌道と一致するので触らない。
 *
 * ■ ⭐⭐⭐ この作業で実際に踏んだ欠陥 = §4 が測るもの
 *   下書きのマスクは「連結成分 1 個・全ゲート歩ける」を**満たしていた**のに、実プレイでは
 *   パーティが部屋を大きく迂回して 1 ノードに 160 秒かかり、autoplay 完走が上限を超えた。
 *   真因は **経路が外周 1 タイル (フェザー帯) を通っていた**こと。作法①「外周 1 タイルは
 *   塞がない」があるので、内部をどれだけ塞いでも外周がぐるりと繋がってしまい、
 *   **連結性の検査は永久に緑になる**。
 *   ⭐ よって測るべきは連結性ではなく「**外周を使わずに**口から口へ歩けるか」。
 *     §4 は BFS から外周リングを除いて測り、(4d) が素の BFS との歩数比も出す。
 *
 * ■ その他の方針 (P3 追補 driver_grid_p3b と同じ流儀)
 *   ⭐ データ (exits[].at) と導出 (nodeGateTile) の一致を**両モードで**測る (§3)。
 *   ⭐ 絵そのものの性質 (画素の縦横比が 39:23) を別に測る (§2)。台帳の値を写経して
 *     突き合わせても、両方が同じ誤りだと永久に通る。
 *   ⭐ 母数は実装の戻り値からでなく mapData / isTileWall を数え直して採る。
 *   ⚠ 「廃坑内は暗い」= n1 で屋外開放が起きないことは driver_grid_p3b の (3e)(3f2) が
 *     既に測っているので、ここでは重複させない。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate       | 注入する欠陥                                  | 赤くなるべき節
 *   PORT   | (素)         | —                                             | —
 *   PORT+1 | n1updrift    | n1 の up を exits 側だけ 1 タイルずらす        | §3 (3a)
 *   PORT+2 | n1ringonly   | 行 9 の東西主通路を塞ぐ (外周迂回だけが残る)   | §4 (4b)(4c)
 *   PORT+3 | n1noblocked  | n1 の blocked を空にする (絵の岩を素通し)      | §5 (5a)
 *   PORT+4 | n1aspect     | 絵の tileBounds だけ 1 列狭める (絵が横へ伸びる) | §2 (2c)(2e)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
 *
 * 使い方:
 *   node tools/driver_grid_p4.js
 *   node tools/driver_grid_p4.js --mutate n1ringonly [--headful]
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8971'), 10);

const STAGE = 'goblin-mine';

/* 絵の側の真実 (ROOM_PAINTINGS_DEF["goblin-mine"].n1)。
 * ⚠ ここに書くのは**ドライバが独立に組み直すための入力**であって、実装から借りた値ではない。
 *   絶対タイルは rect と組み合わせてドライバ側で計算する (実装の写像は 1 行も借りない)。 */
const N1_RECT = [2, 17, 24, 55];        // [r1,c1,r2,c2] = 39 列 x 23 行
const N1_CELLS = [39, 23];              // 焼いたマス数 (tools/make_grid_map.py の台帳)
const N1_SRC = 'assets/room_goblin-mine_n1.jpg';
const N1_GATE_LOCAL = { left: [2, 9], up: [17, 1] };   // 絵ローカル [列, 行]
const N1_MID = { up: [36, 2], down: [36, 24], left: [17, 13], right: [55, 13] };  // 辺の中点
// ══════════════════════════════════════════════════════════════════════════════
// 変異
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  /* データ側 (exits[].at) だけをずらす。導出側 (nodeGateTile → 絵の gates) は動かないので
   * §3 (3a)「データと導出の一致」が赤くなる。 */
  n1updrift: [
    ['      const N1_UP = PAINT_GATE_OFF ? [36, 2] : [34, 3];',
     '      const N1_UP = PAINT_GATE_OFF ? [36, 2] : [34, 4];   /* ★変異n1updrift */'],
  ],
  /* ★行 9 の東西主通路 (col23-28 が岩の下をくぐる) を塞ぐ。連結性は**外周リング経由で残る**
   * ので「連結成分 1 個」も「全ゲート到達可能」も緑のまま。§4 の外周禁止 BFS だけが捕まえる。 */
  n1ringonly: [
    ['               ".............#...###.........###..####.",   //  9  ★東西の主通路 (col23-28 が岩の下をくぐる) / col17-19 = 立った木柵',
     '               ".............#...###....########..####.",   //  9  ★変異n1ringonly (東西の主通路を塞ぐ)'],
  ],
  /* 絵の障害物マスクを丸ごと捨てさせる (行 0 を 38 桁にして桁数不一致にする)。
   * paintingBlockedRows は形の合わない指定を丸ごと捨てるので、岩も木箱も素通しになる。 */
  n1noblocked: [
    ['               ".......................................",   //  0  外周 (フェザー帯) — 規則①',
     '               "......................................",   //  0  ★変異n1noblocked (38 桁 = 桁数不一致で丸ごと捨てさせる)'],
  ],
  /* 絵の tileBounds だけを 1 列狭める (38x23)。部屋は 39x23 のままなので縦横比が食い違い、
   * 絵が黙って横へ伸びる = §2 (2c) と lint の graph-painting-aspect が赤くなる。
   * ⚠ 部屋の rect 側を壊す変異にしないこと。exits[].at が部屋の外へ落ちてノードへ入れなくなり、
   *   ドライバが waitForFunction のタイムアウトで**落ちる** (2026-08-19 に実際に踏んだ)。
   *   負のコントロールは「1 つの欠陥だけを注入して他は動く」= 外科的でなければならない。 */
  n1aspect: [
    ['        n1: { src: "assets/room_goblin-mine_n1.jpg", tileBounds: [2, 17, 24, 55], node: true,',
     '        n1: { src: "assets/room_goblin-mine_n1.jpg", tileBounds: [2, 17, 24, 54], node: true, /* ★n1aspect */'],
  ],
};
const MUT_ORDER = ['n1updrift', 'n1ringonly', 'n1noblocked', 'n1aspect'];
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
  const targets = [];
  for (const [from, to] of MUTATIONS[key]) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    if (from.length === to.length) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → §0 が誤報する');
      process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
    targets.push(hits[0]);
  }
  _mutCache[key] = { files: out, targets: targets };
  return _mutCache[key];
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey).files[rel]); return;
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
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
const httpGet = (port, p) => new Promise((res, rej) => {
  /* ⚠ Buffer で受けてから 1 度だけ decode する。チャンク境界で日本語 (3 バイト) が
   *   割れると文字数が変わり (0a) が誤報する。 */
  http.get({ host: '127.0.0.1', port: port, path: p }, r => {
    const bufs = []; r.on('data', d => bufs.push(d));
    r.on('end', () => res(Buffer.concat(bufs).toString('utf8')));
  }).on('error', rej);
});

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; fails.push(name + (detail ? '  — ' + detail : '')); }
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ══════════════════════════════════════════════════════════════════════════════
// ページ起動
// ══════════════════════════════════════════════════════════════════════════════
async function bootPage(browser, port, query, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('[:' + port + '] PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('[:' + port + '] CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((scen) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', scen);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, opts.scen || STAGE);
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function' && " +
    "!!window.__nodeGateProbe && !!window.__outdoorRevealProbe",
    { timeout: 25000 });
  /* ⚠⚠ startGame() を通さないと gameStarted が false のまま = フォグ更新も進まない。
   *   開始画面をタップするのと同じ経路を踏むのが最も本編に忠実
   *   (driver_graph_sce1 の作法をそのまま写す)。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  /* ⚠⚠ 出口選択 UI を止めないと nodeBusy が下りず、enterNode を呼ぶ §3b が固まる。
   *   到着猶予を未来へ押し続ける (driver_graph_sce1 の freezeChoice をそのまま写す)。 */
  await page.evaluate(() => {
    window.__p4freeze = setInterval(() => { nodeChoiceCooldownUntil = Date.now() + 60000; }, 150);
    nodeChoiceCooldownUntil = Date.now() + 60000;
  });
  await sleep(600);
  return page;
}

/* 現在ノードの観測を 1 回で採る。★値の出所はすべて**実装のシーム**で、
 * 「辺の中点」も「絵ローカル → 絶対」もドライバ側では計算しない (写経の禁止)。 */

/* n1 の観測を 1 回で採る。★値の出所はすべて**実装のシーム** (__nodeGateProbe / DFMapDef)。
 * 「辺の中点」も「絵ローカル → 絶対」もドライバ側では計算しない (写経の禁止)。 */
async function readN1(page) {
  return page.evaluate(() => {
    const gate = window.__nodeGateProbe();
    const gr = (window.__graphRun && window.__graphRun.graph()) || null;
    const lint = (gr && window.DFMapDef) ? (() => {
      const l = DFMapDef.lintRun(gr);
      return { ok: l.ok, e: l.errors.map(x => x.code), w: l.warnings.map(x => x.code) };
    })() : null;
    const best = MAPDEF.rooms.reduce((b, r) => {
      const a = (r.rect[2] - r.rect[0] + 1) * (r.rect[3] - r.rect[1] + 1);
      return (!b || a > b.a) ? { a: a, r: r } : b;
    }, null);
    const room = best.r, rc = room.rect, pg = room.painting;
    const gm = (pg && window.DFMapDef) ? DFMapDef.paintingGatesFor(pg.theme, pg.key) : null;
    const bm = (pg && window.DFMapDef) ? DFMapDef.paintingBlockedFor(pg.theme, pg.key) : null;
    /* ⚠ ROOM_PAINTINGS_DEF は classic script 直下の const なので window に載らない。
     *   tileBounds を直に読む代わりに、**実装が持つ述語** paintingAspectFits と
     *   paintingGates が返す tw/th で「絵と部屋の幾何が一致するか」を測る
     *   (規則を driver 側へ写経しない = 両方が同じ誤りを共有する事故を避ける)。 */
    const aspectFits = (pg && window.DFMapDef && DFMapDef.paintingAspectFits)
      ? !!DFMapDef.paintingAspectFits(rc, pg) : null;

    /* ★BFS。ban フラグで「外周 1 タイル (フェザー帯) を通らない」経路だけに絞れる。
     *   ⭐ これが本ドライバの主役。外周は作法①で必ず空くので、ban=false の連結性は
     *     内部をどれだけ塞いでも緑になる (2026-08-19 に実際に踏んだ)。
     *   ⚠ 終点そのものは外周に載りうる (right ゲートは col55 = 部屋の右端) ので、
     *     終点だけは例外にする。そうしないと「原理的に到達不能」で常に赤になる。 */
    function bfs(from, to, banRing) {
      const W = MAP_W, H = MAP_H, dist = new Int32Array(W * H).fill(-1);
      const r1 = rc[0], c1 = rc[1], r2 = rc[2], c2 = rc[3];
      const onRing = (x, y) => (y === r1 || y === r2 || x === c1 || x === c2);
      const q = [[from[0], from[1]]];
      dist[from[1] * W + from[0]] = 0;
      for (let h = 0; h < q.length; h++) {
        const x = q[h][0], y = q[h][1];
        if (x === to[0] && y === to[1]) break;
        for (const s of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + s[0], ny = y + s[1];
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const k = ny * W + nx;
          if (dist[k] >= 0 || isTileWall(nx, ny)) continue;
          if (banRing && onRing(nx, ny) && !(nx === to[0] && ny === to[1])) continue;
          dist[k] = dist[y * W + x] + 1; q.push([nx, ny]);
        }
      }
      const d = dist[to[1] * W + to[0]];
      return d < 0 ? null : d;
    }
    /* 部屋の中で「歩ける / 塞がれている」を数え直す (母数を実装の戻り値から取らない)。 */
    let floorInRoom = 0, walkInRoom = 0;
    for (let ty = rc[0]; ty <= rc[2]; ty++) for (let tx = rc[1]; tx <= rc[3]; tx++) {
      if (mapData[ty] && mapData[ty][tx] !== 2) floorInRoom++;
      if (!isTileWall(tx, ty)) walkInRoom++;
    }
    const gates = gate.gates;
    const pairs = [['left', 'right'], ['left', 'up'], ['up', 'right']];
    const routes = {};
    for (const [a, b] of pairs) {
      const ga = gates[a], gb = gates[b];
      routes[a + '->' + b] = { plain: bfs([ga.tx, ga.ty], [gb.tx, gb.ty], false),
                               inner: bfs([ga.tx, ga.ty], [gb.tx, gb.ty], true) };
    }
    const partyStart = { tx: Math.round(playerX / TILE_SIZE), ty: Math.round(playerY / TILE_SIZE) };
    const fromParty = {};
    for (const d of Object.keys(gates))
      fromParty[d] = bfs([partyStart.tx, partyStart.ty], [gates[d].tx, gates[d].ty], true);

    return {
      gate: gate, lint: lint, mainRect: rc.slice(),
      painting: pg ? (pg.theme + '/' + pg.key) : null,
      aspectFits: aspectFits,
      gatesSpec: gm ? { has: !!gm.gates, err: gm.error,
                        raw: gm.gates ? JSON.parse(JSON.stringify(gm.gates)) : null,
                        tw: gm.tw, th: gm.th } : null,
      blocked: (bm && bm.rows) ? { rows: bm.rows.length, cols: bm.rows[0].length,
                                   hashes: bm.rows.map(r => r.split('#').length - 1) } : null,
      routes: routes, fromParty: fromParty, partyStart: partyStart,
      floorInRoom: floorInRoom, walkInRoom: walkInRoom,
      isCustom: !!MAPDEF.isCustom, mapW: MAP_W, mapH: MAP_H,
    };
  });
}

/* n1 へ入る。★実プレイの入口関数 enterNode を通す (生 mapDef を組むと isCustom が付かず偽の赤)。 */
async function gotoN1(page) {
  await page.evaluate(() => { enterNode('n1', 'right'); });
  await page.waitForFunction("currentNodeId === 'n1' && !nodeBusy", { timeout: 25000 });
  await sleep(600);
  return readN1(page);
}

/* 焼いた画像そのものの性質 (画素の縦横比)。★台帳の値を写経して突き合わせても
 * 両方が同じ誤りだと永久に通るので、**実ファイル**を測る。 */
function imageAspect(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC)
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), bytes: buf.length };
    i += 2 + len;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 :' + PORT + '   変異 ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));
  const profile = require('./_pptr_profile')('df_gridp4_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });
  const errs = [];
  const base = MUTATE ? PORT_OF[MUTATE] : PORT;
  const WANT_UP = [N1_RECT[1] + N1_GATE_LOCAL.up[0], N1_RECT[0] + N1_GATE_LOCAL.up[1]];
  const WANT_LEFT = [N1_RECT[1] + N1_GATE_LOCAL.left[0], N1_RECT[0] + N1_GATE_LOCAL.left[1]];

  try {
    // ══ §0 変異の配信検算 ═══════════════════════════════════════════════════
    mark('§0 変異が素の配信に無く、変異ポートにだけ載っていること');
    {
      let allOk = true; const detail = [];
      for (const k of MUT_ORDER) {
        const rel = mutatedSources(k).targets[0];
        const plain = await httpGet(PORT, '/' + rel);
        const mut = await httpGet(PORT_OF[k], '/' + rel);
        const want = mutatedSources(k).files[rel];
        const ok = (plain.length !== mut.length) && (mut.length === want.length);
        if (!ok) allOk = false;
        detail.push(k + ':' + (ok ? 'ok' : 'NG(' + plain.length + '/' + mut.length + '/' + want.length + ')'));
      }
      check('(0a) ★4 種の変異が正しく配信へ載っている', allOk, detail.join(' '));
    }

    // ══ §1 母集団ガード ═════════════════════════════════════════════════════
    mark('§1 母集団ガード — n1 に絵が貼られ、その口とマスクが実在する');
    const page = await bootPage(browser, base, '?diag=1&intel=0', errs);
    const N = await gotoN1(page);
    check('(1a) ★前提: n1 の主部屋に 1 枚絵 goblin-mine/n1 が mapDef 経路で貼られている',
      N.gate.nodeId === 'n1' && N.painting === 'goblin-mine/n1' && N.isCustom === true,
      'node=' + N.gate.nodeId + ' paint=' + N.painting + ' custom=' + N.isCustom);
    check('(1b) ★前提: その絵の gates が検査を通っている (丸ごと捨てられていない)',
      !!(N.gatesSpec && N.gatesSpec.has && !N.gatesSpec.err),
      JSON.stringify(N.gatesSpec));
    check('(1c) ★前提: 障害物マスクが 23 行 x 39 桁で採れている',
      !!(N.blocked && N.blocked.rows === N1_CELLS[1] && N.blocked.cols === N1_CELLS[0]),
      N.blocked ? (N.blocked.rows + '行 x ' + N.blocked.cols + '桁') : 'null');
    check('(1d) ★前提: マスクが実際に塞いでいる (床の 20〜70% が障害物)',
      N.floorInRoom > 0 && (N.floorInRoom - N.walkInRoom) / N.floorInRoom > 0.20 &&
      (N.floorInRoom - N.walkInRoom) / N.floorInRoom < 0.70,
      '床 ' + N.floorInRoom + ' / 歩ける ' + N.walkInRoom +
      ' = 塞ぎ率 ' + Math.round(100 * (N.floorInRoom - N.walkInRoom) / N.floorInRoom) + '%');
    check('(1e) 絵の寸法 (tw x th) が tileBounds と一致 = 絵ローカル→絶対が恒等写像',
      N.gatesSpec.tw === N1_CELLS[0] && N.gatesSpec.th === N1_CELLS[1],
      N.gatesSpec.tw + 'x' + N.gatesSpec.th);

    // ══ §2 幾何 (部屋 / 絵 / 実ファイル) ═════════════════════════════════════
    mark('§2 部屋・絵・実ファイルの幾何が 39x23 で揃っている');
    check('(2a) ★n1 の部屋が [' + N1_RECT.join(',') + '] = 39 列 x 23 行',
      eq(N.mainRect, N1_RECT), JSON.stringify(N.mainRect));
    check('(2b) 中心が他ノードと同じ col36 / row13 (ノード遷移でカメラが飛ばない)',
      Math.floor((N.mainRect[1] + N.mainRect[3]) / 2) === 36 &&
      Math.floor((N.mainRect[0] + N.mainRect[2]) / 2) === 13,
      'midC=' + Math.floor((N.mainRect[1] + N.mainRect[3]) / 2) +
      ' midR=' + Math.floor((N.mainRect[0] + N.mainRect[2]) / 2));
    /* ⭐ 判定は**実装が持つ述語** paintingAspectFits ただ 1 本 (lint の graph-painting-aspect と
     *   同じ式)。加えて「絵のタイル寸法 tw x th が部屋の幅 x 高さと同じ」= 恒等写像であることも
     *   測る。⚠ 縦横比だけでは 2 倍サイズの絵を見逃す (比は合うので aspectFits は通る)。 */
    check('(2c) ★絵と部屋の幾何が完全一致 (縦横比 + タイル寸法 = 伸縮ゼロの恒等写像)',
      N.aspectFits === true &&
      N.gatesSpec.tw === (N.mainRect[3] - N.mainRect[1] + 1) &&
      N.gatesSpec.th === (N.mainRect[2] - N.mainRect[0] + 1),
      'aspectFits=' + N.aspectFits + ' 絵=' + N.gatesSpec.tw + 'x' + N.gatesSpec.th +
      ' 部屋=' + (N.mainRect[3] - N.mainRect[1] + 1) + 'x' + (N.mainRect[2] - N.mainRect[0] + 1));
    {
      const im = imageAspect(N1_SRC);
      /* ⭐ 台帳の値ではなく**実ファイルの画素**を測る。焼き直しを忘れて古い画像が
       *   残っていたら、tileBounds とだけ突き合わせても気づけない。 */
      check('(2d) ★焼いた画像そのものが 39:23 の画素比 (1 マス = 整数 px で焼けている)',
        !!im && im.w % N1_CELLS[0] === 0 && im.h % N1_CELLS[1] === 0 &&
        im.w / N1_CELLS[0] === im.h / N1_CELLS[1],
        im ? (im.w + 'x' + im.h + ' → 1 マス ' + (im.w / N1_CELLS[0]) + 'px / ' +
              (im.bytes / 1048576).toFixed(2) + ' MB') : 'JPEG ヘッダを読めない');
    }
    check('(2e) ★lintRun が error 0 / warning 0 (aspect も gate-not-floor も dir-mismatch も鳴らない)',
      !!(N.lint && N.lint.e.length === 0 && N.lint.w.length === 0),
      N.lint ? ('e=' + JSON.stringify(N.lint.e) + ' w=' + JSON.stringify(N.lint.w)) : 'null');

    // ══ §3 出口 = 絵に描かれた口 ═════════════════════════════════════════════
    mark('§3 出口タイル (データと導出の一致 / 絵の口 / 辺の中点)');
    check('(3a) ★★データ (exits[].at) と導出 (nodeGateTile) が全出口で 1 タイルも違わない',
      N.gate.exits.length > 0 && N.gate.exits.every(e => {
        const g = N.gate.gates[e.dir]; return g && g.tx === e.at[0] && g.ty === e.at[1]; }),
      N.gate.exits.map(e => e.dir + ':at' + e.at.join(',') +
        ' vs gate' + [N.gate.gates[e.dir].tx, N.gate.gates[e.dir].ty].join(',')).join(' / '));
    check('(3b) ★up の口が絵の梯子 [' + WANT_UP.join(',') + '] (辺の中点ではない)',
      eq([N.gate.gates.up.tx, N.gate.gates.up.ty], WANT_UP) &&
      !eq([N.gate.gates.up.tx, N.gate.gates.up.ty], N1_MID.up),
      'up=' + [N.gate.gates.up.tx, N.gate.gates.up.ty] + ' 中点=' + N1_MID.up);
    check('(3c) ★引き返し口 left が絵の坑口 [' + WANT_LEFT.join(',') + '] (外光の差す木枠)',
      eq([N.gate.gates.left.tx, N.gate.gates.left.ty], WANT_LEFT),
      'left=' + [N.gate.gates.left.tx, N.gate.gates.left.ty]);
    check('(3d) ★right は辺の中点 [' + N1_MID.right.join(',') + '] のまま (絵の軌道と一致 = 上書き不要)',
      eq([N.gate.gates.right.tx, N.gate.gates.right.ty], N1_MID.right) &&
      N.gate.gates.right.face === 'right',
      'right=' + [N.gate.gates.right.tx, N.gate.gates.right.ty] + ' face=' + N.gate.gates.right.face);
    check('(3e) 指定した 2 つの口はどちらも face = キーの向き (n0 の坑口と違い上書きが要らない)',
      N.gate.gates.up.face === 'up' && N.gate.gates.left.face === 'left',
      'up=' + N.gate.gates.up.face + ' left=' + N.gate.gates.left.face);
    check('(3f) ★扉が口と同じタイルに立っている (矢印と扉が別タイルに割れていない)',
      N.gate.doors.length >= 2 && N.gate.doors.every(d => {
        const dir = d.id.replace('gate-', ''); const g = N.gate.gates[dir];
        return g && g.tx === d.tx && g.ty === d.ty; }),
      N.gate.doors.map(d => d.id + '@' + d.tx + ',' + d.ty + '/' + d.orientation).join(' '));

    // ══ §4 ★★★ 外周リングに頼らずに口から口へ歩ける ═════════════════════════
    mark('§4 目的: 外周 1 タイルを使わずに口から口へ歩ける (今日の実際の欠陥)');
    /* ⚠⚠ **?doors=0 のページで測る**。出口タイルには既定で閉じた扉が立ち、doorBlocks が
     *   isTileWall を true にするので、素のページでは BFS が終点へ入れず**全経路 null**になる
     *   (2026-08-19 に実際に踏んだ)。測りたいのは「絵の障害物のせいで詰まないか」であって
     *   「扉が閉じているか」ではない。扉が実際に塞いでいることは (4e) が対で測る。 */
    const pageND = await bootPage(browser, base, '?diag=1&intel=0&doors=0', errs);
    const ND = await gotoN1(pageND);
    check('(4a) ★入場したパーティから 3 本の口すべてへ**外周を使わずに**歩いて行ける',
      ['up', 'left', 'right'].every(d => ND.fromParty[d] !== null),
      Object.keys(ND.fromParty).map(d => d + ':' + ND.fromParty[d]).join(' ') +
      ' party=' + JSON.stringify(ND.partyStart));
    check('(4b) ★★口から口への 3 経路すべてが**外周を使わずに**成立する',
      Object.keys(ND.routes).every(k => ND.routes[k].inner !== null),
      Object.keys(ND.routes).map(k => k + ' 素' + ND.routes[k].plain + '/内' + ND.routes[k].inner).join(' '));
    /* ⭐ 「外周を使えば繋がる」だけでは足りない。外周迂回は素の BFS より必ず長くなるので、
     *   内部経路が素の経路と**ほぼ同じ長さ**であること = 最短路が内部を通っていることまで測る。
     *   ここが 1.5 倍以上に開いたら、内部が実質封鎖されて外周へ逃げている。 */
    check('(4c) ★★最短路が内部を通っている (外周禁止で歩数が 1.5 倍以上に伸びない)',
      Object.keys(ND.routes).every(k => {
        const r = ND.routes[k]; return r.plain !== null && r.inner !== null && r.inner <= r.plain * 1.5; }),
      Object.keys(ND.routes).map(k => k + ' 素' + ND.routes[k].plain + '→内' + ND.routes[k].inner).join(' '));
    check('(4d) ★装置: 部屋が実際に広い (7x6 の部屋では出ない歩数 = 母集団がある)',
      ND.routes['left->right'].plain >= 25,
      'left->right = ' + ND.routes['left->right'].plain + ' 歩');
    /* ⭐ 装置の対。?doors=0 が load-bearing であること = 素のページでは同じ口が閉扉で
     *   塞がっていることを実測する。これが無いと「?doors=0 が実は何もしていない」場合に
     *   §4 全体が意味を失ったまま緑になる。 */
    check('(4e) ★装置の対: 素のページでは同じ口が閉扉で塞がっている (?doors=0 が効いた証拠)',
      N.fromParty.up === null && N.fromParty.right === null &&
      ND.fromParty.up !== null && ND.fromParty.right !== null,
      '素 up=' + N.fromParty.up + '/right=' + N.fromParty.right +
      '  doors=0 側 up=' + ND.fromParty.up + '/right=' + ND.fromParty.right);
    await pageND.close();

    // ══ §5 絵の障害物が当たり判定に載っている ════════════════════════════════
    mark('§5 絵に描かれた岩と木箱が実際に通れない');
    {
      /* 絵の blocked のうち「# が最も多い行」を選び、その行が実際に歩けないことを測る。
       * ⚠ 行番号を写経しない (マスクを描き直した日に空振りする)。 */
      const worst = N.blocked.hashes.indexOf(Math.max.apply(null, N.blocked.hashes));
      const r = await page.evaluate((row, rect) => {
        let wall = 0, total = 0;
        for (let tx = rect[1]; tx <= rect[3]; tx++) { total++; if (isTileWall(tx, rect[0] + row)) wall++; }
        return { wall: wall, total: total };
      }, worst, N.mainRect);
      check('(5a) ★最も塞がった行 (絵ローカル 行' + worst + ') が実際に壁として効いている',
        r.wall >= N.blocked.hashes[worst],
        '期待 ' + N.blocked.hashes[worst] + ' 以上 / 実測 ' + r.wall + ' / ' + r.total);
      check('(5b) 外周 1 タイルは 1 マスも塞いでいない (規則①)',
        N.blocked.hashes[0] === 0 && N.blocked.hashes[N.blocked.rows - 1] === 0,
        '行0=' + N.blocked.hashes[0] + ' 行' + (N.blocked.rows - 1) + '=' +
        N.blocked.hashes[N.blocked.rows - 1]);
    }
    await page.close();

    // ══ §6 退避スイッチ ═════════════════════════════════════════════════════
    mark('§6 退避スイッチ ?paintgate=0 / ?paintblock=0');
    {
      const p1 = await bootPage(browser, base, '?diag=1&intel=0&paintgate=0', errs);
      const R = await gotoN1(p1);
      check('(6a) ?paintgate=0 で up が辺の中点 [' + N1_MID.up.join(',') + '] / left が [' +
            N1_MID.left.join(',') + '] へ戻る',
        R.gate.off === true && eq([R.gate.gates.up.tx, R.gate.gates.up.ty], N1_MID.up) &&
        eq([R.gate.gates.left.tx, R.gate.gates.left.ty], N1_MID.left),
        'up=' + [R.gate.gates.up.tx, R.gate.gates.up.ty] +
        ' left=' + [R.gate.gates.left.tx, R.gate.gates.left.ty]);
      check('(6b) ★★退避先でもデータと導出が一致する (壊れた状態へ退避していない)',
        R.gate.exits.every(e => { const g = R.gate.gates[e.dir];
                                  return g && g.tx === e.at[0] && g.ty === e.at[1]; }),
        R.gate.exits.map(e => e.dir + ':' + e.at.join(',')).join(' '));
      check('(6c) 退避しても絵の障害物は効いたまま (スイッチが混線していない)',
        R.floorInRoom - R.walkInRoom > 0,
        '塞がれ ' + (R.floorInRoom - R.walkInRoom) + ' マス');
      await p1.close();

      /* ⚠ &doors=0 も一緒に付ける。付けないと閉扉 2 枚ぶんが isTileWall に残り、
       *   「絵の障害物が 0 になった」を厳密一致で測れない (扉と絵を切り分けるため)。 */
      const p2 = await bootPage(browser, base, '?diag=1&intel=0&paintblock=0&doors=0', errs);
      const R2 = await gotoN1(p2);
      check('(6d) ?paintblock=0 で絵の障害物が 1 マスも効かなくなる',
        R2.floorInRoom === R2.walkInRoom,
        '床 ' + R2.floorInRoom + ' / 歩ける ' + R2.walkInRoom);
      check('(6e) 退避しても口は絵の位置のまま (スイッチが混線していない)',
        eq([R2.gate.gates.up.tx, R2.gate.gates.up.ty], WANT_UP),
        'up=' + [R2.gate.gates.up.tx, R2.gate.gates.up.ty]);
      await p2.close();
    }

    // ══ §7 変異 (負のコントロール) ═══════════════════════════════════════════
    mark('§7 変異: 注入した欠陥をこのドライバが実際に捕まえる');
    if (!MUTATE) {
      for (const k of MUT_ORDER) {
        /* ⚠ 変異側も **?doors=0**。§4 と同じ理由 (閉扉が isTileWall を汚すと、
         *   注入した欠陥ではなく扉のせいで赤くなり負のコントロールが意味を失う)。 */
        const p = await bootPage(browser, PORT_OF[k], '?diag=1&intel=0&doors=0', errs);
        const R = await gotoN1(p);
        if (k === 'n1updrift') {
          const bad = R.gate.exits.filter(e => { const g = R.gate.gates[e.dir];
                                                 return !g || g.tx !== e.at[0] || g.ty !== e.at[1]; });
          check('(7a) ★n1updrift → データと導出が食い違い (3a) が赤くなる',
            bad.length === 1 && bad[0].dir === 'up',
            bad.map(e => e.dir + ':at' + e.at.join(',')).join(' ') || '食い違いなし');
        } else if (k === 'n1ringonly') {
          /* ⭐⭐⭐ ここが本ドライバの存在理由。素朴な連結性は**緑のまま**であることを
           *   同時に測り、「外周禁止 BFS だけが捕まえる」ことを実測で示す。 */
          const plainOk = Object.keys(R.routes).every(x => R.routes[x].plain !== null);
          const innerBroken = Object.keys(R.routes).some(x => R.routes[x].inner === null) ||
            Object.keys(R.routes).some(x => R.routes[x].plain !== null &&
              R.routes[x].inner !== null && R.routes[x].inner > R.routes[x].plain * 1.5);
          check('(7b) ★★n1ringonly → 外周禁止 BFS が壊れ (4b)(4c) が赤くなる',
            innerBroken,
            Object.keys(R.routes).map(x => x + ' 素' + R.routes[x].plain + '→内' + R.routes[x].inner).join(' '));
          check('(7c) ★★★同じ盤面で「連結している」だけの検査は**緑のまま** = 外周禁止が load-bearing',
            plainOk, Object.keys(R.routes).map(x => x + ':' + R.routes[x].plain).join(' '));
        } else if (k === 'n1noblocked') {
          check('(7d) ★n1noblocked → 絵のマスクが丸ごと捨てられ (1c)(5a) が赤くなる',
            R.blocked === null && R.floorInRoom === R.walkInRoom,
            'blocked=' + JSON.stringify(R.blocked) + ' 床=' + R.floorInRoom + ' 歩ける=' + R.walkInRoom);
          check('(7e) ★そのとき lint が blocked-broken 系を出す (黙って捨てない)',
            !!(R.lint && (R.lint.w.indexOf('graph-painting-blocked-broken') >= 0 ||
                          R.lint.w.indexOf('painting-blocked-broken') >= 0)),
            R.lint ? JSON.stringify(R.lint.w) : 'null');
        } else if (k === 'n1aspect') {
          check('(7f) ★n1aspect → 絵と部屋の幾何が食い違い (2c) が赤くなる',
            R.aspectFits === false || R.gatesSpec.tw !== (R.mainRect[3] - R.mainRect[1] + 1),
            'aspectFits=' + R.aspectFits + ' 絵幅=' + (R.gatesSpec ? R.gatesSpec.tw : null) +
            ' 部屋幅=' + (R.mainRect[3] - R.mainRect[1] + 1));
          check('(7g) ★そのとき lint が graph-painting-aspect を出す (絵が黙って横へ伸びない)',
            !!(R.lint && R.lint.w.indexOf('graph-painting-aspect') >= 0),
            R.lint ? JSON.stringify(R.lint.w) : 'null');
        }
        await p.close();
      }
    } else {
      console.log('  (--mutate ' + MUTATE + ' 指定のため §7 は省略。素の節が赤くなるのを見る)');
    }

    // ══ §E 例外 ═════════════════════════════════════════════════════════════
    mark('§E ページ例外 / console.error');
    check('(E1) 全ページ・全操作で pageerror / console.error が 0',
      errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');

  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  console.log('\n════════════════════════════════════════');
  console.log('  PASS ' + pass + ' / FAIL ' + fail + (MUTATE ? '   (--mutate ' + MUTATE + ')' : ''));
  console.log('════════════════════════════════════════');
  if (fail) { console.log('[drv] FAILED:'); for (const f of fails) console.log('   - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
