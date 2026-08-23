#!/usr/bin/env node
/*
 * driver_grid_p3b.js — 卓上グリッド P3 追補 の検証ドライバ (2026-08-18)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 塞ぐ穴 (ユーザー要望 2 件)
 *   ① 「廃坑入口も、きちんとここにしてほしい」
 *      坑道への出口が nodeGateTile の**辺の中点** [52,13] (右辺中央の崖際) に立っていて、
 *      絵に描かれた木枠の坑口 (絵ローカル [25,4]) と食い違っていた。
 *      → ROOM_PAINTINGS_DEF に gates を足し、絵の口へ移した。
 *   ② 「廃坑入口MAP自体は、外なので、はじめからMAP見えてる感じでいいかな。
 *       廃坑内は暗くてもいいので」
 *      → ROOM_PAINTINGS_DEF に outdoor を足し、その部屋だけフォグの「記憶」を先に立てた。
 *
 *   既存ドライバはどれもこれを測れない:
 *     ・driver_graph_sce1    … 出口タイルの**値を写経**して比べるだけ (規則は見ない)
 *     ・driver_doors_p1..p8  … 扉の状態遷移。立ち位置は nodeGateTile 任せで見ない
 *     ・driver_paint_blocked … 障害物マスクだけ。gates も outdoor も通らない
 *     ・golden 系            … 描画コマンド列。フォグ配列も扉の向きも出ない
 *
 * ■ 測り方の方針
 *   ⭐⭐ **データと導出の一致を測る**。出口の立ち位置には出所が 2 つある —
 *     ノード定義の exits[].at (データ) と nodeGateTile (導出)。この 2 つが食い違うと
 *     「矢印はここ・扉はあそこ」になり、openDoorAt はタイルで扉を同定するので
 *     **開かない扉**が残る。§2 (2a) はこれを**両モードで**測るので、絵の gates と
 *     buildGoblinMineRun の定数を片方だけ直した日に必ず赤くなる。
 *   ⭐ **目的で測る**。「口が動いたか」(手段) だけでなく「起点からその口へ歩けるか」
 *     (目的) を isTileWall の BFS で測る。isTileWall は mapData と obstacleTileMask の
 *     **両方**を見る唯一の歩行判定なので、絵の障害物で口が封鎖されたら赤くなる。
 *   ⭐ **母数を実装の戻り値から取らない**。__outdoorRevealProbe の exploredNow は
 *     stat ではなく exploredTiles を数え直した値。「開けたつもりの数」を返すと、
 *     restoreNodeState が後から潰しても緑のままになる。
 *   ⚠ 退避スイッチは「壊れた状態へ退避する」ものであってはいけない。?paintgate=0 は
 *     データと導出の**両方**を辺の中点へ戻すので、(4b) が退避先でも一致を測る。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate        | 注入する欠陥                                | 赤くなるべき節
 *   PORT   | (素)          | —                                           | —
 *   PORT+1 | nogateface    | 扉の向きを face でなく dir から決める        | §2 (2f)
 *   PORT+2 | gatedrift     | exits[].at を 1 タイルずらす (データだけ)    | §2 (2a)
 *   PORT+3 | gatebroken    | 絵の gates を絵の外の座標にする              | §1 (1b) §2 (2b)
 *   PORT+4 | nobootreveal  | 起動ノードぶんの屋外開放の呼び出しを消す      | §3 (3a)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす**(同じ長さだと §0 が誤報する)。
 * ⚠ 行末コメントまで含めた 1 行で指定する。素の `revealOutdoorRooms();` は buildNode の中の
 *   同じ呼び出し (インデントが 2 つ深い) の部分文字列になり、2 箇所に刺さって空振りする。
 *
 * 使い方:
 *   node tools/driver_grid_p3b.js
 *   node tools/driver_grid_p3b.js --mutate gatedrift [--headful]
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
const PORT = parseInt(arg('port', '8951'), 10);

/* 舞台。★goblin-mine が唯一の「屋外の絵を持つノード」を含むシナリオ。
 *   他の 5 本は (3i) の identity (開放 0 部屋) の母集団として使う。 */
const STAGE = 'goblin-mine';
const OTHER_STAGES = ['bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];

/* 絵の側の真実 (ROOM_PAINTINGS_DEF["goblin-mine"].n0)。
 * ⚠ ここに書くのは**ドライバが独立に組み直すための入力**であって、実装から借りた値ではない。
 *   絶対タイルは rect と組み合わせてドライバ側で計算する (実装の写像は 1 行も借りない)。 */
const N0_RECT = [3, 20, 24, 52];        // [r1,c1,r2,c2] = 33 列 x 22 行
const N0_GATE_LOCAL = [25, 4];          // 絵ローカル [列, 行] = 木枠の坑口の真下の砂利
const N0_GATE_FACE = 'up';              // 口が向いている向き (南から北へ潜る)
const N0_MIDPOINT_RIGHT = [52, 13];     // 追補前の値 (辺の中点) = ?paintgate=0 の退避先

// ══════════════════════════════════════════════════════════════════════════════
// 変異
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  nogateface: [
    ['            const face = g.face || dir;',
     '            const face = dir;   /* \u2605\u5909\u7570nogateface */'],
  ],
  gatedrift: [
    ['      const E_RIGHT = PAINT_GATE_OFF ? [52, 13] : [45, 7];',
     '      const E_RIGHT = PAINT_GATE_OFF ? [52, 13] : [46, 7];   /* \u2605\u5909\u7570gatedrift */'],
  ],
  gatebroken: [
    ['             gates: { right: [25, 4, "up"] },',
     '             gates: { right: [99, 4, "up"] },   /* \u2605\u5909\u7570gatebroken */'],
  ],
  nobootreveal: [
    ['    revealOutdoorRooms();   // \u2605\u8d77\u52d5\u30ce\u30fc\u30c9\u306f buildNode \u3092\u901a\u3089\u306a\u3044\u306e\u3067\u3001\u3053\u3053\u306b\u3082 1 \u56de\u8981\u308b',
     '    /* \u2605\u5909\u7570nobootreveal */'],
  ],
};
const MUT_ORDER = ['nogateface', 'gatedrift', 'gatebroken', 'nobootreveal'];
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
    window.__p3bfreeze = setInterval(() => { nodeChoiceCooldownUntil = Date.now() + 60000; }, 150);
    nodeChoiceCooldownUntil = Date.now() + 60000;
  });
  await sleep(600);
  return page;
}

/* 現在ノードの観測を 1 回で採る。★値の出所はすべて**実装のシーム**で、
 * 「辺の中点」も「絵ローカル → 絶対」もドライバ側では計算しない (写経の禁止)。 */
async function readNode(page) {
  return page.evaluate(() => {
    const gate = window.__nodeGateProbe();
    const out = window.__outdoorRevealProbe();
    const gr = (window.__graphRun && window.__graphRun.graph()) || null;
    const lint = (gr && window.DFMapDef) ? (() => {
      const l = DFMapDef.lintRun(gr);
      return { ok: l.ok, e: l.errors.map(x => x.code), w: l.warnings.map(x => x.code) };
    })() : null;
    /* 絵が持つ口の生の姿 (検査を通ったか / 捨てられたか)。★母集団ガードの出所。 */
    const best = MAPDEF.rooms.reduce((b, r) => {
      const a = (r.rect[2] - r.rect[0] + 1) * (r.rect[3] - r.rect[1] + 1);
      return (!b || a > b.a) ? { a: a, r: r } : b;
    }, null);
    const room = best.r;
    const pg = room.painting;
    const gm = (pg && window.DFMapDef) ? DFMapDef.paintingGatesFor(pg.theme, pg.key) : null;
    const bm = (pg && window.DFMapDef) ? DFMapDef.paintingBlockedFor(pg.theme, pg.key) : null;
    /* 起点から各出口タイルへ isTileWall で BFS。★歩行判定は 1 本しかない
     *   (mapData の値2 と obstacleTileMask の両方) ので、ここを通せば目的で測れる。 */
    function reach(fromTx, fromTy) {
      const seen = new Uint8Array(MAP_W * MAP_H), q = [[fromTx, fromTy]];
      seen[fromTy * MAP_W + fromTx] = 1;
      for (let h = 0; h < q.length; h++) {
        const x = q[h][0], y = q[h][1];
        const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const s of steps) {
          const nx = x + s[0], ny = y + s[1];
          if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
          const k = ny * MAP_W + nx;
          if (seen[k] || isTileWall(nx, ny)) continue;
          seen[k] = 1; q.push([nx, ny]);
        }
      }
      return seen;
    }
    const startWalk = !isTileWall(START_TX, START_TY);
    const seen = startWalk ? reach(START_TX, START_TY) : new Uint8Array(MAP_W * MAP_H);
    const reachOf = {};
    for (const d of Object.keys(gate.gates)) {
      const g = gate.gates[d];
      reachOf[d] = { walkable: !isTileWall(g.tx, g.ty), reachable: !!seen[g.ty * MAP_W + g.tx] };
    }
    /* 現在視界 (光源が当たっているマス) の総数。★屋外の開放は explored だけを立てるので、
     *   ここが部屋全体になっていたら「暗幕を一切張らない」側へ倒れている。 */
    let visNow = 0;
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++)
      if (visibleTiles[ty][tx]) visNow++;
    /* ⚠⚠ 部屋の中だけを数える。__outdoorRevealProbe の exploredNow は**マップ全体**なので、
     *   部屋の床数と直に比べると壁リングや部屋の外まで混ざって桁が合わない
     *   (2026-08-18 に実際に n1 で explored=71 vs 部屋の床=42 という比較不能な赤を出した)。 */
    const rc = room.rect;
    let floorInRoom = 0, exploredInRoom = 0;
    for (let ty = rc[0]; ty <= rc[2]; ty++) for (let tx = rc[1]; tx <= rc[3]; tx++) {
      if (mapData[ty] && mapData[ty][tx] !== 2) floorInRoom++;
      if (exploredTiles[ty] && exploredTiles[ty][tx]) exploredInRoom++;
    }
    return {
      gate: gate, outdoor: out, lint: lint,
      /* ★シナリオ単位の「暗幕を一切張らない」スイッチ。追補②はこれを**立てずに**解いた
       *   (立てると坑内まで明るくなり「廃坑内は暗くてもいい」と食い違う) ので、
       *   常に false であることがこの実装方針そのものの assert になる。 */
      daylight: (typeof __daylight !== 'undefined') ? !!__daylight : null,
      start: [START_TX, START_TY], startWalk: startWalk,
      mainRect: rc.slice(), painting: pg ? (pg.theme + '/' + pg.key) : null,
      gatesSpec: gm ? { has: !!gm.gates, err: gm.error,
                        raw: gm.gates ? JSON.parse(JSON.stringify(gm.gates)) : null,
                        tw: gm.tw, th: gm.th } : null,
      blockedRows: (bm && bm.rows) ? bm.rows.slice() : null,
      reachOf: reachOf, visNow: visNow,
      floorInRoom: floorInRoom, exploredInRoom: exploredInRoom,
      isCustom: !!MAPDEF.isCustom, mapW: MAP_W, mapH: MAP_H,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 :' + PORT + '   変異 ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));
  const profile = require('./_pptr_profile')('df_gridp3b_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });
  const errs = [];
  const base = MUTATE ? PORT_OF[MUTATE] : PORT;

  try {
    // ══ §0 変異の配信検算 ═══════════════════════════════════════════════════
    mark('§0 変異が素の配信に無く、変異ポートにだけ載っていること');
    {
      let allOk = true; const detail = [];
      for (const k of MUT_ORDER) {
        const info = mutatedSources(k);
        let ok = true;
        for (let i = 0; i < MUTATIONS[k].length; i++) {
          const from = MUTATIONS[k][i][0], to = MUTATIONS[k][i][1];
          const tgt = info.targets[i];
          const pure = await httpGet(PORT, '/' + tgt);
          const mut = await httpGet(PORT_OF[k], '/' + tgt);
          if (!(pure.indexOf(from) >= 0 && mut.indexOf(from) < 0 && mut.indexOf(to) >= 0)) ok = false;
        }
        if (!ok) allOk = false;
        detail.push(k + (ok ? ':ok' : ':NG'));
      }
      check('(0a) ★' + MUT_ORDER.length + ' 種の変異が正しく配信へ載っている', allOk, detail.join(' '));
    }

    // ══ §1 母集団ガード (真空 PASS 対策) ═════════════════════════════════════
    mark('§1 母集団ガード — 絵と、その絵が持つ口が実在する');
    const page = await bootPage(browser, base, '?diag=1&intel=0', errs);
    const N = await readNode(page);

    check('(1a) ★前提: 起点 n0 の主部屋に 1 枚絵 goblin-mine/n0 が mapDef 経路で貼られている',
      N.gate.nodeId === 'n0' && N.painting === 'goblin-mine/n0' && N.isCustom === true &&
      eq(N.mainRect, N0_RECT),
      'node=' + N.gate.nodeId + ' paint=' + N.painting + ' custom=' + N.isCustom +
      ' rect=' + JSON.stringify(N.mainRect));
    check('(1b) ★前提: その絵の gates が検査を通っている (丸ごと捨てられていない)',
      !!(N.gatesSpec && N.gatesSpec.has && !N.gatesSpec.err && N.gatesSpec.raw.right &&
         N.gatesSpec.raw.right.c === N0_GATE_LOCAL[0] &&
         N.gatesSpec.raw.right.r === N0_GATE_LOCAL[1] &&
         N.gatesSpec.raw.right.face === N0_GATE_FACE),
      JSON.stringify(N.gatesSpec));
    check('(1c) 絵の寸法 (tw x th) が tileBounds と一致 = 絵ローカル→絶対が恒等写像',
      !!(N.gatesSpec && N.gatesSpec.tw === (N0_RECT[3] - N0_RECT[1] + 1) &&
         N.gatesSpec.th === (N0_RECT[2] - N0_RECT[0] + 1)),
      N.gatesSpec ? (N.gatesSpec.tw + 'x' + N.gatesSpec.th) : 'null');
    check('(1d) ★前提: 起点タイルが歩ける (BFS の母数が空でない)',
      N.startWalk === true, 'start=' + JSON.stringify(N.start));
    check('(1e) 絵の障害物マスクも生きている (blocked が 22 行 x 33 桁で採れている)',
      !!(N.blockedRows && N.blockedRows.length === 22 && N.blockedRows[0].length === 33),
      N.blockedRows ? (N.blockedRows.length + '行 x ' + N.blockedRows[0].length + '桁') : 'null');

    // ══ §2 出口が絵の坑口に立っている (追補①) ═══════════════════════════════
    mark('§2 出口 = 絵に描かれた坑口');
    /* ドライバ側で独立に組む絶対タイル。★実装の paintingGateTileFor は 1 行も借りない。 */
    const WANT_GATE = [N0_RECT[1] + N0_GATE_LOCAL[0], N0_RECT[0] + N0_GATE_LOCAL[1]];   // [45,7]

    check('(2a) ★★データ (exits[].at) と導出 (nodeGateTile) が全出口で 1 タイルも違わない',
      N.gate.exits.length > 0 && N.gate.exits.every(e => {
        const g = N.gate.gates[e.dir];
        return g && g.tx === e.at[0] && g.ty === e.at[1];
      }),
      N.gate.exits.map(e => e.dir + ':at' + e.at.join(',') +
        ' vs gate' + [N.gate.gates[e.dir].tx, N.gate.gates[e.dir].ty].join(',')).join(' / '));
    check('(2b) ★right の口が絵の坑口 [' + WANT_GATE.join(',') + '] (辺の中点ではない)',
      N.gate.gates.right.tx === WANT_GATE[0] && N.gate.gates.right.ty === WANT_GATE[1] &&
      !eq([N.gate.gates.right.tx, N.gate.gates.right.ty], N0_MIDPOINT_RIGHT),
      'right=' + N.gate.gates.right.tx + ',' + N.gate.gates.right.ty);
    check('(2c) ★up / down は辺の中点のまま (指定していない向きは 1 命令も変わらない)',
      N.gate.gates.up.ty === N0_RECT[0] && N.gate.gates.down.ty === N0_RECT[2] &&
      N.gate.gates.up.tx === N.gate.gates.down.tx &&
      N.gate.gates.up.face === 'up' && N.gate.gates.down.face === 'down',
      'up=' + [N.gate.gates.up.tx, N.gate.gates.up.ty] +
      ' down=' + [N.gate.gates.down.tx, N.gate.gates.down.ty]);
    /* ⚠⚠ **素のページで口の歩行判定を測ってはいけない**。出口には閉じた扉が 1 枚立って
     *   いて、閉扉は isTileWall を true にする (P3 で当たり判定に載せた) ので、口は
     *   「歩けない」と出るのが**正常**。2026-08-18 に実際にこれで赤を出した。
     *   本編の commitExit は「開ける → 目標を決める」順なので、地形として届くかを測るには
     *   扉を外した配信 (?doors=0 = 扉システムの退避スイッチ) で見るのが実経路に忠実。 */
    {
      const pR = await bootPage(browser, base, '?diag=1&intel=0&doors=0', errs);
      const R = await readNode(pR);
      check('(2d) ★扉を除けば口のタイルは歩ける (?doors=0 で isTileWall が false)',
        R.reachOf.right.walkable === true, JSON.stringify(R.reachOf.right));
      check('(2e) ★★目的: 起点から 3 本の口すべてへ歩いて辿り着ける (詰まない)',
        R.reachOf.right.reachable === true &&
        R.reachOf.up.reachable === true && R.reachOf.down.reachable === true,
        Object.keys(R.reachOf).map(d => d + ':' + (R.reachOf[d].reachable ? 'ok' : 'NG')).join(' '));
      check('(2e2) ★装置の対: 素のページでは同じ口が閉扉で塞がっている (?doors=0 が効いた証拠)',
        N.reachOf.right.walkable === false && R.reachOf.right.walkable === true,
        '素=' + N.reachOf.right.walkable + ' / doors=0 側=' + R.reachOf.right.walkable);
      check('(2e3) 口が絵の坑口であることは扉の有無に依らない (?doors=0 でも同じタイル)',
        eq([R.gate.gates.right.tx, R.gate.gates.right.ty], WANT_GATE),
        'right=' + [R.gate.gates.right.tx, R.gate.gates.right.ty]);
      await pR.close();
    }
    {
      const d = N.gate.doors.filter(x => x.id === 'gate-right')[0];
      check('(2f) ★扉が口と同じタイルに立ち、板が東西へ伸びる (face:"up" が効いている)',
        !!d && eq([d.tx, d.ty], WANT_GATE) && d.orientation === 'horizontal' &&
        N.gate.gates.right.face === N0_GATE_FACE,
        JSON.stringify(d) + ' face=' + N.gate.gates.right.face);
    }
    {
      /* 口は絵の障害物 (崖と坑口の闇) に**接している** = 岩壁の際の口であって
       * 広場の真ん中ではない。★絵の側 (blocked) から測るので、口の座標を写経しても
       * 「絵のどこに立っているか」までは合わせられない。 */
      const lc = N0_GATE_LOCAL[0], lr = N0_GATE_LOCAL[1];
      const above = N.blockedRows[lr - 1].charAt(lc);
      const here = N.blockedRows[lr].charAt(lc);
      check('(2g) ★口は絵の坑口の**真下** (真上が崖/闇の "#"、口自身は歩ける ".")',
        above === '#' && here !== '#', 'above="' + above + '" here="' + here + '"');
    }
    check('(2h) lintRun が error 0 / warning 0 (gate-not-floor も dir-mismatch も鳴らない)',
      !!(N.lint && N.lint.ok === true && N.lint.e.length === 0 && N.lint.w.length === 0),
      N.lint ? ('e=' + JSON.stringify(N.lint.e) + ' w=' + JSON.stringify(N.lint.w)) : 'null');

    // ══ §3 屋外の部屋は最初から見えている (追補②) ═══════════════════════════
    mark('§3 屋外の開放');
    const ROOM_TILES = (N0_RECT[2] - N0_RECT[0] + 1) * (N0_RECT[3] - N0_RECT[1] + 1);   // 726
    check('(3a) ★★n0 で ' + ROOM_TILES + ' マス (33x22) が探索済みになっている',
      N.outdoor.off === false && N.outdoor.rooms === 1 && N.outdoor.tiles === ROOM_TILES &&
      N.outdoor.exploredNow >= ROOM_TILES,
      JSON.stringify({ rooms: N.outdoor.rooms, tiles: N.outdoor.tiles, exploredNow: N.outdoor.exploredNow }));
    check('(3b) ★開けた矩形が部屋の rect と厳密に一致 (部屋の外まで開けていない)',
      N.outdoor.rects.length === 1 &&
      eq(N.outdoor.rects[0], [N0_RECT[1], N0_RECT[0], N0_RECT[3], N0_RECT[2]]),
      JSON.stringify(N.outdoor.rects));
    check('(3c) ★現在視界は部屋全体ではない (光源の演出が残っている = 暗幕を消していない)',
      N.visNow > 0 && N.visNow < ROOM_TILES,
      'visibleTiles=' + N.visNow + ' / 部屋 ' + ROOM_TILES);
    check('(3d) 索敵の Set (visitedTiles) も同じだけ立っている (見えるのに反応しない敵を作らない)',
      N.outdoor.seenNow >= ROOM_TILES, 'seen=' + N.outdoor.seenNow);

    /* ★「廃坑内は暗くてもいい」の側。n1 (見張りの詰所 = 坑道の中) へ実際に入って測る。 */
    mark('§3b 坑内は暗いまま + 再入場で開放が残る');
    await page.evaluate(() => { enterNode('n1', 'right'); });
    await page.waitForFunction("currentNodeId === 'n1' && !nodeBusy", { timeout: 25000 });
    await sleep(500);
    const N1 = await readNode(page);
    check('(3e) ★★坑内 (n1) は暗いまま = 屋外の開放が 1 部屋も起きない',
      N1.gate.nodeId === 'n1' && N1.outdoor.rooms === 0 && N1.outdoor.tiles === 0,
      'node=' + N1.gate.nodeId + ' rooms=' + N1.outdoor.rooms + ' tiles=' + N1.outdoor.tiles);
    /* ★「廃坑内は暗くてもいい」を**実装方針の側**で測る。追補②はシナリオ単位の
     *   __daylight (暗幕を一切張らない) を**立てずに**解いた。立てると坑内まで明るくなり、
     *   ユーザーの要望と正面から食い違う。ここが true になったら方針ごと崩れている。
     * ⚠ 「n1 の部屋が全部は見えていない」では測れない。道中ノードは 7x6 タイルで
     *   可視域 (7.7x6.2) より小さいので、屋外開放が無くても入った瞬間にほぼ全部が光源に
     *   入る。**部屋が小さいことを検出器の根拠にしてはいけない**。 */
    check('(3f) ★★坑内でも屋外でも __daylight は false = 暗幕を消して解決していない',
      N1.daylight === false && N.daylight === false,
      'n1=' + N1.daylight + ' n0=' + N.daylight);
    check('(3f2) ★n0 は部屋の中が 100% 探索済み・n1 は開放由来のマスが 1 つも無い',
      N.exploredInRoom === ROOM_TILES && N1.outdoor.tiles === 0,
      'n0=' + N.exploredInRoom + '/' + ROOM_TILES + ' n1の開放=' + N1.outdoor.tiles);

    await page.evaluate(() => { enterNode('n0', 'left'); });
    await page.waitForFunction("currentNodeId === 'n0' && !nodeBusy", { timeout: 25000 });
    await sleep(500);
    const N0b = await readNode(page);
    check('(3g) ★再入場でも n0 の開放が残る (nodeState の復元が潰していない)',
      N0b.gate.nodeId === 'n0' && N0b.outdoor.exploredNow >= ROOM_TILES,
      'explored=' + N0b.outdoor.exploredNow);
    check('(3h) 再入場でも口は同じタイル (盤面は node id だけで決まる)',
      eq([N0b.gate.gates.right.tx, N0b.gate.gates.right.ty], WANT_GATE) &&
      N0b.gate.exits.every(e => { const g = N0b.gate.gates[e.dir];
                                  return g && g.tx === e.at[0] && g.ty === e.at[1]; }),
      'right=' + [N0b.gate.gates.right.tx, N0b.gate.gates.right.ty]);
    await page.close();

    // ══ §3c 他 5 シナリオは 1 部屋も開放しない (identity) ═════════════════════
    mark('§3c 屋外の絵を持たないシナリオでは 1 マスも開放しない');
    {
      const rows = [];
      for (const sc of OTHER_STAGES) {
        const p = await bootPage(browser, base, '?diag=1&intel=0', errs, { scen: sc });
        const r = await readNode(p);
        rows.push(sc + ':' + r.outdoor.rooms + '/' + r.outdoor.tiles);
        await p.close();
      }
      /* ★[#16] シナリオ2 は 1 ノードへ畳まれ、**起点がそのまま outdoor の大部屋 n7** に
       *   なった (52x26 = 1352 マス)。「屋外の起点は廃坑 n0 の絵だけ」という前提は
       *   ここで崩れる。
       * ⚠ **緩めていない** — 「全部 0/0」という一様な期待値を、**シナリオごとの
       *   名指しの期待値**へ置き換えた (0/0 のままだと畳みを見落とし、
       *   `every(:0/0)` だと逆にシナリオ2 の 1352 マスを説明できない)。
       *   ここが赤くなったら「どのシナリオの起点が屋外になったか」を必ず確かめること。 */
      const OUTDOOR_ENTRY_EXPECT = {
        'bandits-forest': '1/1352',   // ★[#16] 畳んだ n7 = 卓上バトルマップ 52x26
        'lizard-swamp': '0/0', 'orc-fort': '0/0', 'undead-temple': '0/0', 'dragon-lair': '0/0',
      };
      const wantRows = OTHER_STAGES.map(sc => sc + ':' + OUTDOOR_ENTRY_EXPECT[sc]);
      check('(3i) ★他 5 シナリオの起点の開放が契約どおり (屋外の起点はシナリオ2 の n7 だけ)',
        rows.join(' ') === wantRows.join(' '), '実測 ' + rows.join(' ') + ' / 期待 ' + wantRows.join(' '));
      /* ⚠ 母集団ガード: 0/0 でないものが**ちょうど 1 本**であること。
       *   全部が非 0 になったら「outdoor が全シナリオへ漏れた」= 別の壊れ方。 */
      check('(3i2) ★屋外の起点を持つのは 5 本中ちょうど 1 本',
        rows.filter(s => !/:0\/0$/.test(s)).length === 1,
        rows.filter(s => !/:0\/0$/.test(s)).join(' ') || '0 本');
      check('(3j) ★母集団の identity: 5 本すべて測れている (空振りしていない)',
        rows.length === OTHER_STAGES.length, rows.length + ' 本');
    }

    // ══ §4 退避スイッチ ═════════════════════════════════════════════════════
    mark('§4 退避スイッチ ?paintgate=0 / ?outdoor=0');
    {
      const p = await bootPage(browser, base, '?diag=1&intel=0&paintgate=0', errs);
      const R = await readNode(p);
      check('(4a) ?paintgate=0 で right が辺の中点 [' + N0_MIDPOINT_RIGHT.join(',') + '] へ戻る',
        R.gate.off === true &&
        eq([R.gate.gates.right.tx, R.gate.gates.right.ty], N0_MIDPOINT_RIGHT) &&
        R.gate.gates.right.face === 'right',
        'right=' + [R.gate.gates.right.tx, R.gate.gates.right.ty] + ' face=' + R.gate.gates.right.face);
      check('(4b) ★★退避先でもデータと導出が一致する (壊れた状態へ退避していない)',
        R.gate.exits.every(e => { const g = R.gate.gates[e.dir];
                                  return g && g.tx === e.at[0] && g.ty === e.at[1]; }),
        R.gate.exits.map(e => e.dir + ':' + e.at.join(',')).join(' '));
      {
        const d = R.gate.doors.filter(x => x.id === 'gate-right')[0];
        check('(4c) 退避先では扉が縦板へ戻る (face が dir と同じになる)',
          !!d && d.orientation === 'vertical' && eq([d.tx, d.ty], N0_MIDPOINT_RIGHT),
          JSON.stringify(d));
      }
      check('(4d) 退避しても屋外の開放は効いたまま (スイッチが混線していない)',
        R.outdoor.tiles === ROOM_TILES, 'tiles=' + R.outdoor.tiles);
      await p.close();
    }
    {
      const p = await bootPage(browser, base, '?diag=1&intel=0&outdoor=0', errs);
      const R = await readNode(p);
      check('(4e) ?outdoor=0 で開放が 0 部屋 / 0 マスになる',
        R.outdoor.off === true && R.outdoor.rooms === 0 && R.outdoor.tiles === 0,
        JSON.stringify({ off: R.outdoor.off, rooms: R.outdoor.rooms, tiles: R.outdoor.tiles }));
      check('(4f) ★★そのとき探索済みが部屋のマス数より遥かに少ない (開放が load-bearing)',
        R.outdoor.exploredNow < ROOM_TILES / 2,
        'explored=' + R.outdoor.exploredNow + ' / 部屋 ' + ROOM_TILES);
      check('(4g) 退避しても口は絵の坑口のまま (スイッチが混線していない)',
        eq([R.gate.gates.right.tx, R.gate.gates.right.ty], WANT_GATE),
        'right=' + [R.gate.gates.right.tx, R.gate.gates.right.ty]);
      await p.close();
    }

    // ══ §5 変異 (負のコントロール) ═══════════════════════════════════════════
    mark('§5 変異: 注入した欠陥をこのドライバが実際に捕まえる');
    if (!MUTATE) {
      for (const k of MUT_ORDER) {
        const p = await bootPage(browser, PORT_OF[k], '?diag=1&intel=0', errs);
        const R = await readNode(p);
        if (k === 'nogateface') {
          const d = R.gate.doors.filter(x => x.id === 'gate-right')[0];
          check('(5a) nogateface → 扉が縦板になり (2f) が赤くなる',
            !!d && d.orientation === 'vertical', JSON.stringify(d));
        } else if (k === 'gatedrift') {
          const bad = R.gate.exits.filter(e => { const g = R.gate.gates[e.dir];
                                                 return !g || g.tx !== e.at[0] || g.ty !== e.at[1]; });
          check('(5b) ★gatedrift → データと導出が食い違い (2a) が赤くなる',
            bad.length === 1 && bad[0].dir === 'right',
            bad.map(e => e.dir + ':at' + e.at.join(',')).join(' ') || '食い違いなし');
        } else if (k === 'gatebroken') {
          check('(5c) ★gatebroken → 絵の gates が丸ごと捨てられ (1b) が赤くなる',
            !!(R.gatesSpec && !R.gatesSpec.has && R.gatesSpec.err),
            JSON.stringify(R.gatesSpec));
          /* ⚠⚠ 見るのは **graph-** 接頭辞のほう。lintRun は lintMapDef を呼ばないので、
           *   lintMapDef 側の painting-gate-broken は分岐マップのノードには一度も掛からない
           *   (2026-08-18 に実際にこれで空振りし、⑧ を lintRun へ足して塞いだ)。 */
          check('(5d) ★gatebroken → lintRun が graph-painting-gate-broken を出す (黙って捨てない)',
            !!(R.lint && R.lint.w.indexOf('graph-painting-gate-broken') >= 0),
            R.lint ? JSON.stringify(R.lint.w) : 'null');
          check('(5e) gatebroken → 口が辺の中点へ落ちて (2b) が赤くなる',
            eq([R.gate.gates.right.tx, R.gate.gates.right.ty], N0_MIDPOINT_RIGHT),
            'right=' + [R.gate.gates.right.tx, R.gate.gates.right.ty]);
        } else if (k === 'nobootreveal') {
          check('(5f) ★★nobootreveal → 起動ノードが暗いまま = (3a) が赤くなる',
            R.outdoor.exploredNow < ROOM_TILES,
            'explored=' + R.outdoor.exploredNow + ' / 部屋 ' + ROOM_TILES);
          check('(5g) nobootreveal でも口は動いていない (混ぜていない = 外科的な変異)',
            eq([R.gate.gates.right.tx, R.gate.gates.right.ty], WANT_GATE),
            'right=' + [R.gate.gates.right.tx, R.gate.gates.right.ty]);
        }
        await p.close();
      }
    } else {
      console.log('  (--mutate ' + MUTATE + ' 指定のため §5 は省略。素の節が赤くなるのを見る)');
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
