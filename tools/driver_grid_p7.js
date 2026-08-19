#!/usr/bin/env node
/*
 * driver_grid_p7.js — 卓上グリッド P7 (戦闘カメラのズームアウト) の検証ドライバ (2026-08-19)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 何を入れたか
 *   world→screen 倍率 `camZ` を 1 本足し、卓上バトルマップ 1 枚ぶんの大部屋 (n0 33x22 /
 *   n1 39x23) に入ったときだけ引く。compact(390px) の可視幅は 4.06 タイル → 16.25 タイル。
 *   既存の小ノード (7x6 / 9x6)・旧単一マップ・屋外は camZ=1 のまま = 見え方が 1px も動かない。
 *
 * ■ ⭐⭐⭐ 方式: **要素ごとにスケールする** (ラッパを作らない)
 *   world の z-index は 0〜52 に散っており (mapCanvas 0 / 敵 2 / 罠 3 / 宝箱 4 / PT 6 /
 *   HPバー 7 / fx 8 / lighting 9 / 出口矢印 11・12 / FX 50〜52)、HUD の 10・40・41・45・
 *   47・48 と**交互に噛み合っている**。transform はスタッキング文脈を作るので、1 枚のラッパは
 *   中身を 1 層へ畳み、どの z を与えても必ずどこかの前後関係が壊れる。
 *
 * ■ ⭐⭐⭐ この作業で実際に踏んだ欠陥 = §3 が測るもの
 *   「部屋が 26x20 より大きければ引く」という素朴な規則は、実測で **2 回**外れた:
 *     (1) **屋外** (MAP_H=28) が大部屋判定になり、地平線ロックカメラを破壊した
 *         (driver_field_step3 の B4/B5/C0b/C1/C2/C3 が一斉に赤。camY 期待 918.4 → 実測 217.6)。
 *     (2) **旧単一マップ** (?graph=0) の MAP_USED は実測 **45x18** = 幅だけ規格超え。
 *         ここは MAP_USED が「部屋」ではなく「ダンジョン全体」を指すので、規則の前提が
 *         そもそも成り立たない。素直に判定すると既存 6 シナリオの見え方が丸ごと変わる。
 *   → 屋外は `IS_FIELD_THEME`、旧経路は `MAPDEF.isCustom` で外した。§3 がその 2 つを測る。
 *   ⚠ 屋外側の検出は **driver_field_step3 が既に load-bearing** (ガードを外すと上記 6 件が
 *     実際に赤くなることを実測済み)。ここで重複させない。
 *
 * ■ 測る順序の方針
 *   §1 母集団ガード (そもそもズームが入っているか) → §2 目的 (卓上マップが体験に出たか) →
 *   §3 既存が動いていないこと → §4 「絵だけ縮む・UI は縮まない」 → §5 幾何の整合 →
 *   §6 性能の芯 (塗るデバイス px が増えていない) → §7 負のコントロール。
 *   ⭐ §2 は手段 (camZ の値) ではなく**目的** (画面に何タイル入るか / 部屋の全行が入るか) で測る。
 *   ⭐ §5 は DOM 経路と canvas 経路が**互いに一致**することを測る。片方だけ写経すると、
 *     両方が同じ誤りのとき永久に緑になる。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate        | 注入する欠陥                                  | 赤くなるべき節
 *   PORT   | (素)          | —                                             | —
 *   PORT+1 | nodomz        | SX/SY の * camZ を落とす (DOM だけ等倍)       | §5 (5a)(5c)
 *   PORT+2 | nocanvasz     | mapCanvas の CTM を張らない (canvas だけ等倍) | §5 (5b)(5c)
 *   PORT+3 | nospritez     | スプライトの scale を落とす (絵だけ等倍)      | §4 (4a)
 *   PORT+4 | nolegacyguard | 旧単一マップの除外を外す                      | §3 (3b)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので改行を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
 *
 * 使い方:
 *   node tools/driver_grid_p7.js
 *   node tools/driver_grid_p7.js --mutate nodomz [--headful]
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
const PORT = parseInt(arg('port', '8977'), 10);


const STAGE = 'goblin-mine';
/* compact (iPhone 390x844) で測る。ズームの効き目は画面が狭いほど大きく、
 * ⚠ desktop 1280 では fit がそもそも 1 に近いので「引いていない」ように見える。 */
const VIEWPORT = { width: 390, height: 844 };
const TILE = 96;                        // 実装の TILE_SIZE。ドライバ側の独立入力
const N0_CELLS = [33, 22];              // 起点 n0 の卓上マップのマス数 (make_grid_map.py の台帳)
const ZOOM_MIN = 0.25;                  // 実装の下限。ここも独立入力として持つ
// ══════════════════════════════════════════════════════════════════════════════
// 変異
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  /* DOM の world→screen だけ等倍に戻す。canvas は縮んだままなので、
   * 「地面のタイルとスプライトが別の場所を指す」= §5 (5a)(5c) が赤くなる。 */
  nodomz: [
    ['    function SX(wx) { return (wx - camX) * camZ; }',
     '    function SX(wx) { return (wx - camX); }   /* ★変異nodomz */'],
  ],
  /* canvas の CTM だけ等倍に戻す。DOM は縮んだままなので (5b)(5c) が赤くなる。 */
  nocanvasz: [
    ['      ctx.setTransform(camZ, 0, 0, camZ, 0, 0);',
     '      ctx.setTransform(1, 0, 0, 1, 0, 0);   /* ★変異nocanvasz */'],
  ],
  /* 「絵」のスケールだけ落とす。位置は縮むが大きさが等倍のままなので (4a) が赤くなる。 */
  nospritez: [
    ['      let out = (z !== 1) ? ("scale(" + z + ")") : "";',
     '      let out = "";   /* ★変異nospritez */'],
  ],
  /* ★「縮まない UI」の横アンカーを素朴式へ戻す。定数ではなく **唯一の配置関数** を
   *   壊すので、HP バー・名前ラベル・!・バッジ・状態アイコンの 8 箇所すべてに効く。
   *   camZ=1 では恒等なので既存経路は無傷 = 外科的に z<1 だけが壊れる。 */
  nolabelanchor: [
    ['      el.style.left = (SX(wx + half) + (dx - half)) + "px";',
     '      el.style.left = SX(wx + dx) + "px";   /* ★変異nolabelanchor */'],
  ],
  /* ★ズームを cover から fit へ戻す (2026-08-19 のユーザー決定より前の規則)。
   *   絵より描画領域のほうが横長になり、左右に黒帯が出る = §8 (8f) が赤くなる。 */
  nocover: [
    ['      return Math.max(ZOOM_MIN, Math.min(1, Math.max(fitW, fitH)));',
     '      return Math.max(ZOOM_MIN, Math.min(1, Math.min(fitW, fitH)));  /* ★変異nocover */'],
  ],
  /* ★フォグの CTM から camZ を落とす (2026-08-19 に実際に出荷されていた欠陥そのもの)。
   *   resizeCanvas() 側は camZ 込みのままなので **描画のたびに上書きされる** = 本物と同じ壊れ方。
   *   §8 だけが赤くなる。 */
  nofogz: [
    ['      lctx.setTransform(lightScale * camZ, 0, 0, lightScale * camZ, 0, 0);   /* ★[P7修正] ここは毎フレーム走る = camZ を落とすと暗幕だけ等倍になる */',
     '      lctx.setTransform(lightScale, 0, 0, lightScale, 0, 0);   /* ★変異nofogz */'],
  ],
  /* 旧単一マップの除外を外す。?graph=0 の 45x18 が大部屋判定になり (3b) が赤くなる。 */
  nolegacyguard: [
    ['      if (!(typeof MAPDEF !== "undefined" && MAPDEF && MAPDEF.isCustom)) return 1;',
     '      if (false) return 1;   /* ★変異nolegacyguard */'],
  ],
};
const MUT_ORDER = ['nodomz', 'nocanvasz', 'nospritez', 'nolegacyguard', 'nofogz', 'nocover', 'nolabelanchor'];
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
// ══════════════════════════════════════════════════════════════════════════════
// ページから 1 回で読む観測。★実装の SX()/zoomForRoom() を呼ばず、
//   「DOM の実測位置」「canvas の CTM」「backing」など**外から見える事実**だけを採る。
// ══════════════════════════════════════════════════════════════════════════════
function OBSERVE() {
  const rect = (sel) => {
    const e = document.querySelector(sel); if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
  };
  const ctm = mapCanvas.getContext('2d').getTransform();
  return {
    camZ: (typeof camZ !== 'undefined') ? camZ : null,
    camX: camX, camY: camY, playerX: playerX, playerY: playerY,
    innerW: window.innerWidth, innerH: window.innerHeight,
    used: { c0: MAP_USED.c0, c1: MAP_USED.c1, r0: MAP_USED.r0, r1: MAP_USED.r1 },
    isCustom: !!(MAPDEF && MAPDEF.isCustom),
    mapId: String((MAPDEF && MAPDEF.id) || '?'),
    field: (typeof IS_FIELD_THEME !== 'undefined') ? !!IS_FIELD_THEME : null,
    hud: (typeof cameraBottomHud === 'function') ? cameraBottomHud() : null,
    menuW: (typeof UI_MENU_WIDTH !== 'undefined') ? UI_MENU_WIDTH : 0,
    ctm: { a: ctm.a, d: ctm.d },
    backing: { map: [mapCanvas.width, mapCanvas.height],
               light: [lightingCanvas.width, lightingCanvas.height],
               fx: [fxCanvas.width, fxCanvas.height] },
    /* ★[2026-08-19] フォグ (暗幕) の「穴」の外接矩形を **CSS px** で採る。
     *   renderLighting() は毎フレーム lctx の CTM を張り直すので、resizeCanvas() が
     *   camZ 込みで張っていても**そこで落ちうる**。実際に落ちていた ((8x) 参照)。
     *   ⚠ 実装の式を写経せず「暗幕が薄い画素はどこか」という**見えている事実**だけを読む。 */
    fogHole: (function () {
      try {
        const lc = lightingCanvas, W = lc.width, H = lc.height;
        if (!W || !H) return null;
        const d = lc.getContext('2d').getImageData(0, 0, W, H).data;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
          if (d[(y * W + x) * 4 + 3] < 200) {            // α<200 = 明るい/薄明 = 「見えている」
            n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        if (!n) return { n: 0 };
        const sx = window.innerWidth / W, sy = window.innerHeight / H;   // backing px → CSS px
        return { n: n, x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy };
      } catch (e) { return { err: String(e) }; }
    })(),
    player: rect('#player'), hpBar: rect('#warriorHpBar'), label: rect('#warriorLabel'),
    zoomedClass: document.body.classList.contains('zoomed'),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   mutate ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));
  const profile = require('./_pptr_profile')('df_gridp7_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });
  const errs = [];
  const base = MUTATE ? PORT_OF[MUTATE] : PORT;

  /* 素 (ズーム有効) と ?zoom=0 (撤退スイッチ) の**対**を採る。
   * ⭐ 単独の値だけでは「そもそも P7 が効いているか」も「既存が動いていないか」も言えない。 */
  async function observe(port, query, vp) {
    const page = await bootPage(browser, port, query, errs);
    await page.setViewport(vp || VIEWPORT);
    await sleep(700);
    const o = await page.evaluate(OBSERVE);
    await page.close();
    return o;
  }

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
      check('(0a) ★7 種の変異が正しく配信へ載っている', allOk, detail.join(' '));
    }

    // ══ §1 母集団ガード ═════════════════════════════════════════════════════
    mark('§1 母集団ガード — 起点が卓上ノードで、ズームが実際に入っていること');
    const Z = await observe(base, '?intel=0');
    const P = await observe(base, '?intel=0&zoom=0');
    const usedW = Z.used.c1 - Z.used.c0 + 1, usedH = Z.used.r1 - Z.used.r0 + 1;
    check('(1a) ★前提: 起点が卓上マップの大部屋 (' + N0_CELLS[0] + 'x' + N0_CELLS[1] + ') で isCustom',
      usedW === N0_CELLS[0] && usedH === N0_CELLS[1] && Z.isCustom === true && Z.field === false,
      'used=' + usedW + 'x' + usedH + ' custom=' + Z.isCustom + ' field=' + Z.field + ' id=' + Z.mapId);
    check('(1b) ★前提: 素の側で実際に引けている (ここが 1 なら以下は全部空振り)',
      Z.camZ !== null && Z.camZ < 1 && Z.camZ >= ZOOM_MIN - 1e-9,
      'camZ=' + Z.camZ + ' zoomedClass=' + Z.zoomedClass);
    check('(1c) ★撤退スイッチ ?zoom=0 が効く (常に等倍・class も付かない)',
      P.camZ === 1 && P.zoomedClass === false, 'camZ=' + P.camZ + ' zoomedClass=' + P.zoomedClass);
    check('(1d) 対の 2 ページが同じ舞台を見ている (別の部屋を比べていない)',
      P.mapId === Z.mapId && (P.used.c1 - P.used.c0) === (Z.used.c1 - Z.used.c0),
      'zoom=' + Z.mapId + ' plain=' + P.mapId);

    // ══ §2 目的 — 卓上マップが体験に出たか ═════════════════════════════════
    mark('§2 目的: 画面に入る世界が実際に広がったか (手段でなく目的で測る)');
    const visTiles = (o) => o.innerW / (TILE * o.camZ);
    const visRows = (o) => (o.innerH - o.hud) / (TILE * o.camZ);
    check('(2a) ★compact で可視タイル幅が 12 以上ある (卓上マップが読める広さ)',
      visTiles(Z) >= 12, 'zoom=' + visTiles(Z).toFixed(2) + 'tile (camZ=' + Z.camZ + ')');
    check('(2b) ★対: ?zoom=0 では 5 タイル未満しか見えない (= P7 前の状態)',
      visTiles(P) < 5, 'plain=' + visTiles(P).toFixed(2) + 'tile');
    check('(2c) ★部屋の全 ' + usedH + ' 行が縦に収まる (卓上マップの全体像が出る)',
      visRows(Z) >= usedH - 0.02, 'rows=' + visRows(Z).toFixed(2) + ' / room=' + usedH);
    check('(2d) 対: ?zoom=0 では部屋の全行は収まらない',
      visRows(P) < usedH, 'rows=' + visRows(P).toFixed(2));

    // ══ §3 既存が動いていないこと ═══════════════════════════════════════════
    mark('§3 既存の舞台では camZ が 1 のまま (見え方が 1px も動かない)');
    {
      const page = await bootPage(browser, base, '?intel=0', errs);
      await page.setViewport(VIEWPORT);
      await sleep(400);
      const small = await page.evaluate(() => {
        const R = (typeof RUN !== 'undefined') ? RUN : null;
        const g = R && R.graph ? (R.graph.nodes || R.graph) : null;
        const ids = g ? (Array.isArray(g) ? g.map(n => n && n.id).filter(Boolean) : Object.keys(g)) : [];
        const out = [];
        for (const id of ids) {
          try {
            buildNode(resolveNodeMapDef(id), id);
            out.push({ id: id, w: MAP_USED.c1 - MAP_USED.c0 + 1, h: MAP_USED.r1 - MAP_USED.r0 + 1,
                       z: window.__zoomForRoom() });
          } catch (e) { out.push({ id: id, err: String(e).slice(0, 60) }); }
        }
        return out;
      });
      await page.close();
      const big = small.filter(o => !o.err && (o.w > 26 || o.h > 20));
      const smallOnes = small.filter(o => !o.err && o.w <= 26 && o.h <= 20);
      check('(3a-装置) 大部屋と小部屋の**両方**が母集団に居る (片方だけだと空振り)',
        big.length >= 2 && smallOnes.length >= 3,
        'big=' + big.map(o => o.id + ':' + o.w + 'x' + o.h).join(',') +
        ' small=' + smallOnes.map(o => o.id).join(','));
      check('(3a) ★既存規格の小ノードはすべて等倍 (7x6 / 9x6 を引かない)',
        smallOnes.length > 0 && smallOnes.every(o => o.z === 1),
        smallOnes.map(o => o.id + ':' + o.w + 'x' + o.h + '=' + o.z).join(' '));
      check('(3a2) ★卓上の大部屋はすべて引いている',
        big.length > 0 && big.every(o => o.z < 1),
        big.map(o => o.id + ':' + o.w + 'x' + o.h + '=' + o.z).join(' '));
    }
    {
      const L = await observe(base, '?intel=0&graph=0');
      const lw = L.used.c1 - L.used.c0 + 1, lh = L.used.r1 - L.used.r0 + 1;
      check('(3b-装置) 旧単一マップの使用域は素朴な閾値を**超えている** (ガードが load-bearing)',
        L.isCustom === false && (lw > 26 || lh > 20), 'used=' + lw + 'x' + lh + ' custom=' + L.isCustom);
      check('(3b) ★旧単一マップ (?graph=0) は等倍のまま',
        L.camZ === 1 && L.zoomedClass === false, 'camZ=' + L.camZ + ' id=' + L.mapId);
    }

    // ══ §4 「絵だけ縮む・UI は縮まない」 ═══════════════════════════════════
    mark('§4 縮むのは絵だけ。HP バーと名前ラベルは実寸が変わらない');
    check('(4a) ★主人公スプライトの実寸が camZ 倍になっている',
      !!(Z.player && P.player) && Math.abs(Z.player.w - P.player.w * Z.camZ) <= 1.0,
      'zoom=' + (Z.player ? Z.player.w : '?') + ' plain=' + (P.player ? P.player.w : '?') +
      ' want=' + (P.player ? (P.player.w * Z.camZ).toFixed(1) : '?'));
    check('(4b) ★HP バーの実寸は**変わらない** (世界が 1/4 でも読める)',
      !!(Z.hpBar && P.hpBar) && Math.abs(Z.hpBar.w - P.hpBar.w) <= 0.5 &&
      Math.abs(Z.hpBar.h - P.hpBar.h) <= 0.5,
      'zoom=' + (Z.hpBar ? Z.hpBar.w + 'x' + Z.hpBar.h : '?') +
      ' plain=' + (P.hpBar ? P.hpBar.w + 'x' + P.hpBar.h : '?'));
    /* ★★ 「縮まない UI」は**大きさ**が変わらないだけでは足りない。スプライトが縮む以上、
     *   アンカーも一緒に寄せないと z<1 で取り残される (2026-08-19 実測: 名前ラベルが
     *   横 19px = キャラ幅の 2/3 ずれ、HP バーと同じ高さに並んで重なっていた)。
     *   ⚠ ラベル幅は名前の文字数で変わるので「中心が一致するか」では測れない
     *     (z=1 でも中心は一致しない)。**ズームの有無で相対オフセットが変わらないか**を測る。 */
    const relTo = (o, el) => (o[el] && o.player)
      ? { dx: (o[el].x + o[el].w / 2) - (o.player.x + o.player.w / 2), dy: o[el].y - o.player.y }
      : null;
    const relSame = (a, b, tol) => !!(a && b) &&
      Math.abs(a.dx - b.dx) <= tol && Math.abs(a.dy - b.dy) <= tol;
    const relStr = (r) => r ? ('dx=' + r.dx.toFixed(1) + ' dy=' + r.dy.toFixed(1)) : '?';
    check('(4d) ★★名前ラベルのスプライト中心からのオフセットがズームで変わらない',
      relSame(relTo(Z, 'label'), relTo(P, 'label'), 1.5),
      'zoom ' + relStr(relTo(Z, 'label')) + ' / plain ' + relStr(relTo(P, 'label')));
    check('(4e) ★HP バーも同じ (縦の積み重ねが崩れてラベルと重ならない)',
      relSame(relTo(Z, 'hpBar'), relTo(P, 'hpBar'), 1.5),
      'zoom ' + relStr(relTo(Z, 'hpBar')) + ' / plain ' + relStr(relTo(P, 'hpBar')));
    /* ⚠ 「ラベルの下端がバーの上端より上」という素朴な期待値は **camZ=1 でも成り立たない**
     *   (実測: plain でも 2px 食い込む = 元からの見た目)。元から正しくないものを新しい
     *   期待値にしてはいけないので、「ズームで**悪化**しないか」を測る。 */
    const stackGap = (o) => (o.label && o.hpBar) ? (o.hpBar.y - (o.label.y + o.label.h)) : null;
    check('(4f) ★ラベルと HP バーの縦の重なり量がズームで変わらない (積み重ねが保たれる)',
      stackGap(Z) !== null && stackGap(P) !== null && Math.abs(stackGap(Z) - stackGap(P)) <= 1.5,
      'zoom=' + (stackGap(Z) === null ? '?' : stackGap(Z).toFixed(1)) +
      ' plain=' + (stackGap(P) === null ? '?' : stackGap(P).toFixed(1)));
    check('(4c) ★名前ラベルの実寸も変わらない',
      !!(Z.label && P.label) && Math.abs(Z.label.h - P.label.h) <= 0.5,
      'zoom=' + (Z.label ? Z.label.h : '?') + ' plain=' + (P.label ? P.label.h : '?'));

    // ══ §5 幾何 — DOM 経路と canvas 経路が互いに一致すること ════════════════
    mark('§5 幾何: DOM の実測位置と canvas の CTM が同じ倍率を指しているか');
    {
      const wantX = (Z.playerX - Z.camX) * Z.camZ;
      const wantY = (Z.playerY - Z.camY) * Z.camZ;
      check('(5a) ★主人公 DOM の画面位置が (world - cam) * camZ と一致 (±1.5px)',
        !!Z.player && Math.abs(Z.player.x - wantX) <= 1.5 && Math.abs(Z.player.y - wantY) <= 1.5,
        'got=' + (Z.player ? Z.player.x.toFixed(1) + ',' + Z.player.y.toFixed(1) : '?') +
        ' want=' + wantX.toFixed(1) + ',' + wantY.toFixed(1));
      check('(5b) ★mapCanvas の CTM が camZ',
        Math.abs(Z.ctm.a - Z.camZ) < 1e-9 && Math.abs(Z.ctm.d - Z.camZ) < 1e-9,
        'ctm=' + Z.ctm.a + ',' + Z.ctm.d + ' camZ=' + Z.camZ);
      check('(5c) ★DOM の倍率と canvas の倍率が一致する (地面とスプライトがずれない)',
        !!Z.player && Math.abs(Z.ctm.a * (Z.playerX - Z.camX) - Z.player.x) <= 1.5,
        'fromCanvas=' + (Z.ctm.a * (Z.playerX - Z.camX)).toFixed(1) +
        ' fromDOM=' + (Z.player ? Z.player.x.toFixed(1) : '?'));
    }

    // ══ §6 性能の芯 — 塗るデバイス px が増えていないこと ═══════════════════
    mark('§6 backing (塗るデバイス px) が camZ に依らず不変');
    check('(6a) ★3 枚の canvas の backing が ?zoom=0 と同じ (1/camZ^2 倍に暴発していない)',
      eq(Z.backing, P.backing), 'zoom=' + JSON.stringify(Z.backing) + ' plain=' + JSON.stringify(P.backing));

    // ══ §8 フォグ (視界) がズームを通っているか ═════════════════════════════
    /* ⭐⭐⭐ **2026-08-19 に実際に出荷されていた欠陥**: resizeCanvas() は lctx へ
     *   `lightScale * camZ` を張っていたが、renderLighting() が毎フレーム
     *   `lightScale` だけで**張り直して上書き**していた。結果、暗幕の穴だけが等倍の
     *   座標に開き、主人公が黒に塗り潰されて「PC が映らない・視界が壊れた」になった。
     *   §5 (canvas の CTM) は mapCanvas しか見ておらず、この 1 枚を素通ししていた。
     * ⭐ 舞台は **広いデスクトップ窓**。compact(390) では部屋が画面より広いので穴が
     *   画面いっぱいに見え、ずれが見かけ上小さくなる = 母集団として弱い。 */
    mark('§8 フォグの穴がズーム後の部屋と一致する (PC が暗幕に塗り潰されない)');
    const WIDE = { width: 1880, height: 950 };
    const holeCheck = (o) => {
      if (!o.player || !o.fogHole || !(o.fogHole.n > 0)) return false;
      const cx = o.player.x + o.player.w / 2, cy = o.player.y + o.player.h / 2;
      return cx >= o.fogHole.x0 && cx <= o.fogHole.x1 && cy >= o.fogHole.y0 && cy <= o.fogHole.y1;
    };
    const holeWantX0 = (o) => (o.used.c0 * TILE - o.camX) * o.camZ;
    /* 部屋 (= 絵) の画面上の矩形と、描画領域 (メニュー/HUD を除いた矩形) を突き合わせる。 */
    const roomRect = (o) => ({
      x0: (o.used.c0 * TILE - o.camX) * o.camZ, x1: ((o.used.c1 + 1) * TILE - o.camX) * o.camZ,
      y0: (o.used.r0 * TILE - o.camY) * o.camZ, y1: ((o.used.r1 + 1) * TILE - o.camY) * o.camZ,
    });
    const drawRect = (o) => ({ x0: o.menuW, x1: o.innerW, y0: 0, y1: o.innerH - o.hud });
    const coverOk = (o) => {
      const r = roomRect(o), d = drawRect(o), EPS = 1.0;
      return r.x0 <= d.x0 + EPS && r.x1 >= d.x1 - EPS && r.y0 <= d.y0 + EPS && r.y1 >= d.y1 - EPS;
    };
    /* 暗幕の穴が描画領域を覆っているか。⚠ 舞台は n0 = **最初から見渡せる屋外ノード**なので
     *   「見えていない所がある = 欠陥」と言い切れる (坑道内部 n1 では成り立たない)。
     *   EPS が 4 なのは fogHole を 2px 刻みで走査しているぶんの取りこぼし。 */
    const holeCoversDraw = (o) => {
      if (!o.fogHole || !(o.fogHole.n > 0)) return false;
      const d = drawRect(o), E = 4.0;
      return o.fogHole.x0 <= d.x0 + E && o.fogHole.x1 >= d.x1 - E &&
             o.fogHole.y0 <= d.y0 + E && o.fogHole.y1 >= d.y1 - E;
    };
    const holeDetail = (o) => (o.fogHole && o.fogHole.n
      ? 'hole=' + [o.fogHole.x0, o.fogHole.y0, o.fogHole.x1, o.fogHole.y1].map(v => v.toFixed(0)).join(',')
      : 'hole=none') + ' draw=' + (() => { const d = drawRect(o);
        return [d.x0, d.y0, d.x1, d.y1].map(v => v.toFixed(0)).join(','); })();
    const coverDetail = (o) => {
      const r = roomRect(o), d = drawRect(o);
      return 'room=' + [r.x0, r.y0, r.x1, r.y1].map(v => v.toFixed(0)).join(',') +
             ' draw=' + [d.x0, d.y0, d.x1, d.y1].map(v => v.toFixed(0)).join(',') +
             ' camZ=' + o.camZ.toFixed(4);
    };
    {
      const D = await observe(base, '?intel=0', WIDE);
      check('(8a-装置) 広い窓でも camZ<1 = ズームの舞台を実際に踏んでいる',
        D.camZ !== null && D.camZ < 1, 'camZ=' + (D.camZ !== null ? D.camZ.toFixed(4) : '?') + ' vw=' + D.innerW);
      check('(8b-装置) 暗幕の「穴」が観測できている',
        !!(D.fogHole && D.fogHole.n > 0), JSON.stringify(D.fogHole));
      check('(8c) ★★主人公が暗幕の穴の中にいる (= 画面に映る)', holeCheck(D),
        'player=' + (D.player ? D.player.x.toFixed(0) + ',' + D.player.y.toFixed(0) : '?') +
        ' hole=' + (D.fogHole && D.fogHole.n ? [D.fogHole.x0, D.fogHole.y0, D.fogHole.x1, D.fogHole.y1].map(v => v.toFixed(0)).join('..') : '?'));
      check('(8d) ★穴の左端が「部屋の左端 × camZ」と一致 (±24px)',
        !!(D.fogHole && D.fogHole.n > 0) && Math.abs(D.fogHole.x0 - holeWantX0(D)) <= 24,
        'got=' + (D.fogHole && D.fogHole.n ? D.fogHole.x0.toFixed(1) : '?') + ' want=' + holeWantX0(D).toFixed(1));
      /* ⭐ 対: 撤退スイッチ (等倍) でも (8c) は緑 = 「ズームのときだけ通る式」を測っていない。 */
      const Z1 = await observe(base, '?intel=0&zoom=0', WIDE);
      check('(8e-対) ?zoom=0 (等倍) でも主人公は穴の中 = 不変条件で測れている',
        Z1.camZ === 1 && holeCheck(Z1), 'camZ=' + Z1.camZ);
      /* ★★★ 目的そのもの: 「廃坑の戦闘は 1 枚絵の中だけで完結する」
       *   = 描画領域 (左メニューと下部 HUD を除いた矩形) が、部屋の外へ 1px もはみ出さない。
       *   ⭐ 手段 (camZ の値・fit/cover のどちら) ではなく **黒が出ないこと** を測る。
       *   ⚠ 縦横**両方**を見る。片側だけだと縦長/横長のどちらかで永久に緑になる。 */
      check('(8f) ★★描画領域が「絵」の内側に完全に収まる (黒帯ゼロ / 広い窓)',
        coverOk(D), coverDetail(D));
      const C = await observe(base, '?intel=0');   // compact (390x844) でも同じ不変条件
      check('(8g) ★★同じことが compact でも成り立つ (縦長でも黒帯ゼロ)',
        coverOk(C), coverDetail(C));
      check('(8h) ★★n0 では暗幕の穴が描画領域を覆う (黒く潰れた所が無い)',
        holeCoversDraw(D), holeDetail(D));
    }

    // ══ §7 負のコントロール ═════════════════════════════════════════════════
    mark('§7 負のコントロール — 壊すと狙った節だけが赤くなる');
    if (!MUTATE) {
      {
        const M = await observe(PORT_OF.nodomz, '?intel=0');
        const wantX = (M.playerX - M.camX) * M.camZ;
        check('(7a) ★nodomz → DOM だけ等倍に戻り (5a) が赤くなる',
          !(M.player && Math.abs(M.player.x - wantX) <= 1.5),
          'got=' + (M.player ? M.player.x.toFixed(1) : '?') + ' want=' + wantX.toFixed(1));
      }
      {
        const M = await observe(PORT_OF.nocanvasz, '?intel=0');
        check('(7b) ★nocanvasz → canvas だけ等倍に戻り (5b) が赤くなる',
          !(Math.abs(M.ctm.a - M.camZ) < 1e-9), 'ctm=' + M.ctm.a + ' camZ=' + M.camZ);
        check('(7b2) ★そのとき「2 経路が一致」も破れる (地面とスプライトがずれる)',
          !(M.player && Math.abs(M.ctm.a * (M.playerX - M.camX) - M.player.x) <= 1.5),
          'fromCanvas=' + (M.ctm.a * (M.playerX - M.camX)).toFixed(1) +
          ' fromDOM=' + (M.player ? M.player.x.toFixed(1) : '?'));
      }
      {
        const M = await observe(PORT_OF.nospritez, '?intel=0');
        check('(7c) ★nospritez → 絵だけ等倍で残り (4a) が赤くなる',
          !(M.player && P.player && Math.abs(M.player.w - P.player.w * M.camZ) <= 1.0),
          'got=' + (M.player ? M.player.w : '?') + ' want=' +
          (P.player ? (P.player.w * M.camZ).toFixed(1) : '?'));
        check('(7c2) ★そのとき位置は縮んだままなので (5a) は緑 = 外科的に 1 つだけ壊れている',
          !!M.player && Math.abs(M.player.x - (M.playerX - M.camX) * M.camZ) <= 1.5,
          'pos=' + (M.player ? M.player.x.toFixed(1) : '?'));
      }
      {
        const M = await observe(PORT_OF.nofogz, '?intel=0', WIDE);
        /* ⚠ ここを「主人公が穴の外か」で測ってはいけない。cover で穴が広がると
         *   主人公がたまたま壊れた穴の中に入り、**欠陥が載っているのに緑**になる
         *   (2026-08-19 に実測。位置の偶然に依存する負のコントロールは信用できない)。 */
        check('(7e) ★nofogz → 穴が等倍の座標に開き (8h) の被覆が破れる',
          !holeCoversDraw(M), holeDetail(M));
        check('(7e2) ★そのとき (8d) の幾何も破れる',
          !(M.fogHole && M.fogHole.n > 0 && Math.abs(M.fogHole.x0 - holeWantX0(M)) <= 24),
          'got=' + (M.fogHole && M.fogHole.n ? M.fogHole.x0.toFixed(1) : '?') + ' want=' + holeWantX0(M).toFixed(1));
      }
      {
        const M = await observe(PORT_OF.nolabelanchor, '?intel=0');
        check('(7g) ★nolabelanchor → 縮まない UI の横が取り残され (4d) が赤くなる',
          !relSame(relTo(M, 'label'), relTo(P, 'label'), 1.5),
          'mut ' + relStr(relTo(M, 'label')) + ' / plain ' + relStr(relTo(P, 'label')));
        check('(7g2) ★そのとき縦は無傷 = 外科的に横だけ壊れている',
          !!(relTo(M, 'label') && relTo(P, 'label')) &&
          Math.abs(relTo(M, 'label').dy - relTo(P, 'label').dy) <= 1.5,
          'mut dy=' + relStr(relTo(M, 'label')) + ' / plain dy=' + relStr(relTo(P, 'label')));
      }
      {
        const M = await observe(PORT_OF.nocover, '?intel=0', WIDE);
        check('(7f) ★nocover → fit に戻り左右へ黒帯が出て (8f) が赤くなる',
          !coverOk(M), coverDetail(M));
      }
      {
        const M = await observe(PORT_OF.nolegacyguard, '?intel=0&graph=0');
        check('(7d) ★nolegacyguard → 旧単一マップまで引いてしまい (3b) が赤くなる',
          M.camZ !== 1, 'camZ=' + M.camZ + ' id=' + M.mapId);
      }
    } else {
      console.log('  (--mutate ' + MUTATE + ' が指定されたので §7 は省略)');
    }

    // ══ §E 例外 ═════════════════════════════════════════════════════════════
    mark('§E ページ例外 / console.error');
    check('(E1) 全ページ・全操作で pageerror / console.error が 0',
      errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');

  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  PASS ' + pass + ' / FAIL ' + fail + (MUTATE ? '   (--mutate ' + MUTATE + ')' : ''));
  console.log('════════════════════════════════════════');
  if (fail) { console.log('[drv] FAILED:'); for (const f of fails) console.log('   - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
