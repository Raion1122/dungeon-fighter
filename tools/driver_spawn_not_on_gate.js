/*
 * driver_spawn_not_on_gate.js — 「敵は歩けないマスに湧かない」の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * 直した欠陥 (2026-08-23):
 *   bandits-forest / n4「丸太の砦」の banditMage が **出口ゲート (39,13)** に湧いていた。
 *   出口には閉じた扉が 1 枚立ち (rebuildNodeDoors)、閉扉は isTileWall を true にするので、
 *   その敵は岩に埋まったのと同じ = 近づけない・視線も通らない・倒せない。倒せない敵が
 *   1 体残ると isNodeSettled() が永久に false のままで出口が出ず、パーティが立ち尽くす
 *   = **シナリオ2 がクリア不能**だった (実プレイで永久停止を観測)。
 *
 * 主張は 3 つ:
 *   ① [不変条件] 6 シナリオ全ノードで、**本番が実際に湧かせる敵** (ENEMY_SPAWNS) のタイルは
 *      1 つ残らず isTileWall=false。しきい値ではなく **0 件**を要求する。
 *   ② [検出器] df-mapdef.js の lint に graph-spawn-on-gate が居て、汚したグラフで**鳴る**。
 *      ⚠ 本番データは汚さない。**本番グラフの複製**を 1 箇所だけ書き換えて食わせる。
 *      加えて本番 6 グラフが lint を通ること (通らないと単一マップへ黙って落ちる)。
 *   ③ [修正そのもの] n4 の banditMage は (38,13) に居て、入場地点から本番 aStar で到達できる。
 *
 * ── 負のコントロール (同一 run に内包。配信をメモリ上で差し替える) ──────────────
 *   port   | mutate   | 注入する欠陥                                   | 赤くなるべき節
 *   PORT   | (素)     | —                                              | —
 *   PORT+1 | regress  | n4 の banditMage を (39,13) へ戻す              | §1 bandits / §3
 *   PORT+2 | nolint   | lint の graph-spawn-on-gate を素通しにする        | §2 の (2b)(2d)
 *   PORT+3 | regressnolint | 欠陥 + lint 停止 (実行時の姿を観測するため)  | §1 の (1c)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**・**前後でバイト長を変える**・**一意**。
 * ⚠⚠ 座標を動かすときは「その行を文字列で握っている検証器」を必ず grep すること
 *   (変異アンカーが 0 件ヒットすると exit 3 でドライバごと死ぬ)。
 *
 * 使い方:
 *   node tools/driver_spawn_not_on_gate.js
 *   node tools/driver_spawn_not_on_gate.js --mutate regress --headful
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
/* ⚠ ポートは既存ドライバと 4 以上空ける (本ドライバは PORT..PORT+3 の 4 本を掴む)。 */
const PORT = parseInt(arg('port', '9360'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (ドライバ側が持つ「契約」。実装から読み取ると実装の誤りを一緒に信じてしまう)
// ══════════════════════════════════════════════════════════════════════════════
const SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp',
               'orc-fort', 'undead-temple', 'dragon-lair'];
/* 分岐グラフのノード数。6 シナリオとも buildP6Run の 8 ノード。廃坑だけ P8 で 2 ノードへ畳んだ。
 * ⚠ これは母集団ガード。ここが崩れたら「0 件」は**測っていないから 0**かもしれない。 */
const NODES_EXPECTED = { 'goblin-mine': 2, 'bandits-forest': 8, 'lizard-swamp': 8,
                         'orc-fort': 8, 'undead-temple': 8, 'dragon-lair': 8 };
const S2_NODE = 'n4';
const S2_GATE = [39, 13];            // n4 → n7 の出口ゲート (P6_RIGHT)。扉が立つタイル
const S2_MAGE = [38, 13];            // 修正後の banditMage。ゲートの 1 マス西
const S2_ENTRY = [35, 13];           // 西から入場 (縁 col33 + NODE_ENTRY_INSET=2)
const S2_SLOTS = [[34, 12, 'banditHeavy'], [34, 14, 'banditHeavy'],
                  [38, 11, 'banditArcher'], [38, 15, 'banditArcher'], [38, 13, 'banditMage']];

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  /* 欠陥そのものを戻す = 魔術師を出口ゲートへ置く。 */
  regress: [
    '                      [38, 11, "banditArcher"], [38, 15, "banditArcher"], [38, 13, "banditMage"]] },',
    '                      [38, 11, "banditArcher"], [38, 15, "banditArcher"], [39, 13, "banditMage"]] },  /* ★変異regress */'],
  /* lint の判定を**常に素通し**にする = 検出器そのものを殺す。
   * ⚠ 条件を裏返す (=== を !== にする) のは誤り。ゲートに乗っていない全スロットで
   *   鳴ってしまい、lint が落ちて分岐グラフごと立たなくなる = 別物を測ることになる。 */
  nolint: [
    '        if (toId === undefined) continue;',
    '        if (toId === undefined || true) continue;   /* ★変異nolint */'],
};
/* ⚠⚠ regress 単独では **lint が欠陥を捕まえて分岐グラフごと落とす**ので、
 *   「扉の中に湧いた敵」という実行時の姿はもう観測できない。実行時の欠陥を見るには
 *   lint も一緒に殺した版が要る = 2 つの置換を同時に当てる regressnolint。
 *   ⭐ 仕様 (=検出器) を足したら、負のコントロールの**測定点も一緒に移す**。 */
MUTATIONS.regressnolint = [MUTATIONS.regress, MUTATIONS.nolint];
const MUT_ORDER = ['regress', 'nolint', 'regressnolint'];
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
  const pairs = Array.isArray(MUTATIONS[key][0]) ? MUTATIONS[key] : [MUTATIONS[key]];
  for (const [from, to] of pairs) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    if (from.length === to.length) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ');
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
  }
  _mutCache[key] = { files: out };
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

async function bootPage(browser, url, scen, errs) {
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
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* ★★測定の本体は 1 つ。素の版にも変異版にも**同じ関数**を当てる。
 * ⚠⚠ 実プレイと同じ入口 (resetNodeState → buildNode(resolveNodeMapDef(id), id) → …) を通す。
 *   buildNode(mapDef) を直に呼ぶと MAPDEF.isCustom が付かず別の絵のマスクを測ってしまう。
 * ⚠ 見るのは著者が書いた slots ではなく **ENEMY_SPAWNS** (本番が実際に湧かせる一覧)。
 *   隠し要素の追加スポーンもそこに入るので、slots だけ見ると取りこぼす。 */
async function measureAllNodes(page) {
  return page.evaluate(() => {
    const out = { nodes: [], err: null, lint: null };
    if (typeof RUN === 'undefined' || !RUN || !RUN.graph || !RUN.graph.nodes) {
      out.err = 'RUN.graph.nodes が空 = 分岐グラフが立っていない (lint 落ち or 空振り)';
      return out;
    }
    /* 本番グラフが lint を通るか。通らないと index.html は**単一マップへ黙って落ちる**。 */
    try { const L = DFMapDef.lintRun(RUN.graph);
      out.lint = { ok: !!L.ok, errors: L.errors.map(e => e.code) }; } catch (e) { out.lint = 'THREW ' + e.message; }
    for (const nd of RUN.graph.nodes) {
      const rec = { id: nd.id, spawns: [], blocked: [], gates: [], err: null };
      try {
        resetNodeState();
        currentNodeId = nd.id;
        buildNode(resolveNodeMapDef(nd.id), nd.id);
        try { restoreNodeState(nd.id); } catch (e) {}
        const sp = (typeof ENEMY_SPAWNS !== 'undefined' && ENEMY_SPAWNS) ? ENEMY_SPAWNS : [];
        for (const s of sp) {
          const type = s[0], tx = s[1], ty = s[2];
          rec.spawns.push([type, tx, ty]);
          if (!isTileWall(tx, ty)) continue;
          /* ⭐ 「歩けない」を一語でまとめない。理由を分けて出す。 */
          rec.blocked.push({ type, tx, ty,
            door: isDoorBlocking(tx, ty),
            rock: (mapData[ty] ? mapData[ty][tx] : null) === 2,
            scenery: (typeof obstacleTileMask !== 'undefined' &&
                      obstacleTileMask[ty * MAP_W + tx] === 1) });
        }
        for (const o of (nd.exits || []))
          if (o && o.at) rec.gates.push({ to: o.to, tx: o.at[0], ty: o.at[1],
                                          wall: isTileWall(o.at[0], o.at[1]),
                                          door: isDoorBlocking(o.at[0], o.at[1]) });
      } catch (e) { rec.err = String((e && e.message) || e); }
      out.nodes.push(rec);
    }
    return out;
  });
}

/* ★検出器そのものの検査。⚠⚠ 本番データは 1 バイトも汚さない。**本番グラフの複製**を
 *   1 箇所だけ書き換えて lintRun へ食わせる (同じ形・同じ寸法のまま欠陥だけを注入できる)。 */
async function measureLint(page) {
  return page.evaluate(() => {
    const out = {};
    const codes = (L) => (L && L.errors ? L.errors.map(e => e.code) : []);
    const clone = () => JSON.parse(JSON.stringify(RUN.graph));
    const pick = (g) => g.nodes.find(n => n.exits && n.exits.length &&
                                          n.mapDef && n.mapDef.rooms && n.mapDef.rooms.length);
    try {
      const g0 = clone(), n0 = pick(g0);
      if (!n0) { out.err = '出口を持つノードが無い = 空振り'; return out; }
      out.picked = n0.id; out.gate = n0.exits[0].at.slice();
      /* ① 素の複製では鳴らない (装置 assert: 複製そのものが汚れていない) */
      out.clean = codes(DFMapDef.lintRun(g0));
      /* ② 敵スロットを出口ゲートへ置く → 鳴るべき */
      const g1 = clone(), n1 = pick(g1);
      n1.mapDef.rooms[0].enemySlots = (n1.mapDef.rooms[0].enemySlots || [])
        .concat([[n1.exits[0].at[0], n1.exits[0].at[1], 'bandit']]);
      const L1 = DFMapDef.lintRun(g1);
      out.dirty = codes(L1); out.dirtyOk = !!L1.ok;
      /* ③ ゲートの 1 マス内側なら鳴らない (陰性対照。座標一致だけを見ている証拠) */
      const g2 = clone(), n2 = pick(g2);
      n2.mapDef.rooms[0].enemySlots = (n2.mapDef.rooms[0].enemySlots || [])
        .concat([[n2.exits[0].at[0] - 1, n2.exits[0].at[1], 'bandit']]);
      out.near = codes(DFMapDef.lintRun(g2));
      /* ④ bossSlot でも鳴る (敵スロットだけ見ていないこと) */
      const g3 = clone(), n3 = pick(g3);
      n3.mapDef.rooms[0].bossSlot = [n3.exits[0].at[0], n3.exits[0].at[1], 'scar'];
      out.boss = codes(DFMapDef.lintRun(g3));
    } catch (e) { out.err = String((e && e.message) || e); }
    return out;
  });
}

/* ★修正そのもの。n4 を実プレイの入口で組み、5 体すべてが**歩けて到達できる**ことを測る。
 * ⚠ 到達可能性は自前 BFS ではなく**本番の aStar** で測る (近傍の取り方が違うと永久に緑)。 */
async function measureS2Node(page, nodeId, entry) {
  return page.evaluate((id, ent) => {
    const out = { err: null };
    if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[id]) {
      out.err = 'RUN に ' + id + ' が無い'; return out;
    }
    resetNodeState();
    currentNodeId = id;
    buildNode(resolveNodeMapDef(id), id);
    try { restoreNodeState(id); } catch (e) {}
    try { placeNodeParty('right'); } catch (e) {}
    const md = RUN.byId[id].mapDef, room = (md.rooms || [])[0] || {};
    out.name = md.name;
    out.slots = (room.enemySlots || []).map(s => s.slice());
    out.gates = ((RUN.byId[id].exits) || []).map(o => ({ to: o.to, at: o.at.slice() }));
    out.entryWall = isTileWall(ent[0], ent[1]);
    out.rows = out.slots.map(s => {
      let steps = null;
      try { const p = aStar(ent[0], ent[1], s[0], s[1]); steps = p ? p.length : 0; } catch (e) { steps = -1; }
      return { tx: s[0], ty: s[1], type: s[2], wall: isTileWall(s[0], s[1]), steps: steps };
    });
    /* 扉の設計は 1 ビットも変えていない、という装置 assert (ゲートは閉扉で塞がったまま) */
    out.gateBlocked = out.gates.map(g => ({ to: g.to, at: g.at,
      wall: isTileWall(g.at[0], g.at[1]), door: isDoorBlocking(g.at[0], g.at[1]) }));
    return out;
  }, nodeId, entry);
}

/* ★RUN が立たない版でも lint の結果を読むための口。
 * ⚠ 欠陥入りのデータでは index.html が**単一マップへ退行して RUN を作らない**ので、
 *   RUN.graph 経由では lint を観測できない。内蔵グラフを組み直して直接食わせる。 */
async function measureBuiltinLint(page, scen) {
  return page.evaluate((s) => {
    const out = { runStanding: !!(typeof RUN !== 'undefined' && RUN && RUN.graph) };
    try {
      const run = buildScenarioRun(s);
      const L = DFMapDef.lintRun(run);
      out.ok = !!L.ok;
      out.errors = L.errors.map(e => e.code + '@' + (e.nodeId || '-'));
    } catch (e) { out.err = String((e && e.message) || e); }
    return out;
  }, scen);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
function blockedLines(m) {
  const out = [];
  for (const nd of m.nodes) for (const b of nd.blocked)
    out.push(nd.id + '/' + b.type + '(' + b.tx + ',' + b.ty + ')' +
             (b.door ? '扉' : '') + (b.rock ? '岩' : '') + (b.scenery ? '情景' : ''));
  return out;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_spawngate_');
  const errsAll = [];
  const servers = [await startServer(PORT, MUTATE)];
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });

  // ── §1 不変条件: 6 シナリオ全ノードで「歩けないマスに湧く敵 = 0 体」 ──────────
  mark('§1 6 シナリオ全ノードの敵スポーンを本番 isTileWall で測る');
  let s2Measure = null, lintMeasure = null, totalSpawns = 0, totalNodes = 0;
  for (const sid of SCENS) {
    const page = await bootPage(browser, 'http://localhost:' + PORT, sid, errsAll);
    const m = await measureAllNodes(page);
    if (m.err) {
      check('(1-' + sid + ') 分岐グラフが立っている', false, m.err);
      await page.close(); continue;
    }
    const spawns = m.nodes.reduce((a, n) => a + n.spawns.length, 0);
    totalSpawns += spawns; totalNodes += m.nodes.length;
    /* ⚠ 母集団ガード。ノード数と湧き総数が想定どおりでないと「0 件」は
     *   「測っていないから 0」かもしれない。 */
    check('(1a-' + sid + ') ノード数 ' + NODES_EXPECTED[sid] + ' 件を測れている',
          m.nodes.length === NODES_EXPECTED[sid], '実測 ' + m.nodes.length + ' 件');
    check('(1b-' + sid + ') 敵スポーンを 1 体以上測れている (母集団ガード)',
          spawns > 0, spawns + ' 体');
    check('(1c-' + sid + ') 歩けないマスに湧く敵が 0 体',
          blockedLines(m).length === 0, blockedLines(m).join(' / ') || '0 体');
    check('(1d-' + sid + ') 本番グラフが lintRun を通る (落ちると単一マップへ黙って退行)',
          m.lint && m.lint.ok === true, JSON.stringify(m.lint));
    if (sid === 'bandits-forest') {
      s2Measure = await measureS2Node(page, S2_NODE, S2_ENTRY);
      lintMeasure = await measureLint(page);
    }
    await page.close();
  }
  check('(1e) 6 シナリオ合計で十分な母集団を測れている',
        totalNodes >= 40 && totalSpawns >= 60, 'ノード ' + totalNodes + ' 件 / 湧き ' + totalSpawns + ' 体');

  // ── §2 検出器: lint の graph-spawn-on-gate ────────────────────────────────
  mark('§2 lint (graph-spawn-on-gate) が汚したグラフで鳴る');
  const L = lintMeasure || {};
  check('(2-0) lint の測定が成立している (装置 assert)',
        !L.err && Array.isArray(L.clean), L.err || ('picked=' + L.picked + ' gate=' + JSON.stringify(L.gate)));
  check('(2a) 素の複製では鳴らない',
        Array.isArray(L.clean) && L.clean.indexOf('graph-spawn-on-gate') < 0, JSON.stringify(L.clean));
  check('(2b) 敵スロットを出口ゲートへ置くと error が出る',
        Array.isArray(L.dirty) && L.dirty.indexOf('graph-spawn-on-gate') >= 0, JSON.stringify(L.dirty));
  check('(2c) その lint は ok:false になる (単一マップへ落として詰みを防ぐ側へ倒れる)',
        L.dirtyOk === false, 'ok=' + L.dirtyOk);
  check('(2d) ボススロットを出口ゲートへ置いても error が出る',
        Array.isArray(L.boss) && L.boss.indexOf('graph-spawn-on-gate') >= 0, JSON.stringify(L.boss));
  check('(2e) ゲートの 1 マス内側なら鳴らない (座標一致だけを見ている陰性対照)',
        Array.isArray(L.near) && L.near.indexOf('graph-spawn-on-gate') < 0, JSON.stringify(L.near));

  // ── §3 修正そのもの: n4 の banditMage ─────────────────────────────────────
  mark('§3 bandits-forest/n4 の敵 5 体が歩けて到達できる');
  const S = s2Measure || {};
  check('(3-0) n4 を測れている (装置 assert)', !S.err && Array.isArray(S.rows), S.err || S.name);
  check('(3a) 敵スロットが契約どおり', JSON.stringify(S.slots) === JSON.stringify(S2_SLOTS),
        JSON.stringify(S.slots));
  const mage = (S.rows || []).find(r => r.type === 'banditMage');
  check('(3b) banditMage が (' + S2_MAGE.join(',') + ') に居る',
        !!mage && mage.tx === S2_MAGE[0] && mage.ty === S2_MAGE[1],
        mage ? '(' + mage.tx + ',' + mage.ty + ')' : '居ない');
  check('(3c) banditMage は出口ゲート (' + S2_GATE.join(',') + ') と重ならない',
        !!mage && !(mage.tx === S2_GATE[0] && mage.ty === S2_GATE[1]), mage ? mage.tx + ',' + mage.ty : '-');
  check('(3d) 入場地点 (' + S2_ENTRY.join(',') + ') が歩ける (装置 assert)', S.entryWall === false, 'wall=' + S.entryWall);
  const bad3 = (S.rows || []).filter(r => r.wall);
  check('(3e) 5 体すべてが歩けるマスに居る', (S.rows || []).length === 5 && bad3.length === 0,
        bad3.map(r => r.type + '(' + r.tx + ',' + r.ty + ')').join(' / ') || (S.rows || []).length + ' 体');
  const unreach = (S.rows || []).filter(r => !(r.steps > 0));
  check('(3f) 5 体すべてへ本番 aStar で到達できる', (S.rows || []).length === 5 && unreach.length === 0,
        (S.rows || []).map(r => r.type + ':' + r.steps).join(' '));
  /* 扉の設計は 1 ビットも変えていない = ゲートは閉扉で塞がったまま。
   * ⚠ これが無いと「扉を消して通した」という別の直し方でも §1/§3 が緑になってしまう。 */
  const g7 = (S.gateBlocked || []).find(g => g.to === 'n7');
  check('(3g) n4 → n7 の出口ゲートは閉じた扉で塞がったまま (扉の設計は無改修)',
        !!g7 && g7.wall === true && g7.door === true, JSON.stringify(g7));

  // ── §4 負のコントロール (素の版でだけ回す) ────────────────────────────────
  if (MUTATE === null) {
    mark('§4 負のコントロール: 欠陥を注入すると赤くなる');
    for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));

    /* (4a)(4b) 魔術師を (39,13) へ戻す = 実際に起きていた欠陥そのもの。
     * ⭐ lint を足したので、この版は**分岐グラフごと立たなくなる**のが正しい姿。
     *   よって観測は RUN 経由ではなく内蔵グラフの lint で採る (測定点を移した)。 */
    const pr = await bootPage(browser, 'http://localhost:' + PORT_OF.regress, 'bandits-forest', []);
    const lr = await measureBuiltinLint(pr, 'bandits-forest');
    check('(4a) [regress] 欠陥データを lint が捕まえる',
          lr.ok === false && (lr.errors || []).some(c => c.indexOf('graph-spawn-on-gate@n4') === 0),
          JSON.stringify(lr.errors));
    check('(4b) [regress] 詰むマップでは分岐グラフを立てない側へ倒れる',
          lr.runStanding === false, 'RUN=' + lr.runStanding);
    await pr.close();

    /* (4c)(4d) lint も一緒に殺した版 = **実行時に何が起きていたか**。
     * ⚠ 判定は素の版とまったく同じ measure 関数の戻り値で行う (ドライバ側の分岐で補わない)。 */
    const prn = await bootPage(browser, 'http://localhost:' + PORT_OF.regressnolint, 'bandits-forest', []);
    const mrn = await measureAllNodes(prn);
    const srn = await measureS2Node(prn, S2_NODE, S2_ENTRY);
    const lines = blockedLines(mrn);
    check('(4c) [regressnolint] 実行時に「歩けないマスに湧く敵」が現れる (理由 = 閉じた扉)',
          lines.length === 1 && /banditMage\(39,13\)/.test(lines[0]) && /扉/.test(lines[0]),
          JSON.stringify(lines));
    const mage4 = (srn.rows || []).find(r => r.type === 'banditMage');
    check('(4d) [regressnolint] その魔術師へは本番 aStar で到達できない',
          !!mage4 && mage4.wall === true && mage4.steps === 0,
          mage4 ? 'wall=' + mage4.wall + ' steps=' + mage4.steps : '居ない');
    await prn.close();

    /* (4e)(4f) lint を素通しにすると §2 が鳴らなくなる = (2b)(2d) が空振りでない証拠。 */
    const pn = await bootPage(browser, 'http://localhost:' + PORT_OF.nolint, 'bandits-forest', []);
    const ln = await measureLint(pn);
    check('(4e) [nolint] 測定が成立している (装置 assert)', !ln.err && Array.isArray(ln.dirty), ln.err || 'ok');
    check('(4f) [nolint] lint を素通しにすると (2b) が鳴らなくなる',
          Array.isArray(ln.dirty) && ln.dirty.indexOf('graph-spawn-on-gate') < 0, JSON.stringify(ln.dirty));
    check('(4g) [nolint] (2d) も鳴らなくなる',
          Array.isArray(ln.boss) && ln.boss.indexOf('graph-spawn-on-gate') < 0, JSON.stringify(ln.boss));
    await pn.close();
  }

  // ── 後始末 ────────────────────────────────────────────────────────────────
  check('(E) ページエラーが無い', errsAll.length === 0, JSON.stringify(errsAll.slice(0, 4)));
  await browser.close();
  for (const s of servers) s.close();

  const bad = results.filter(r => !r.ok);
  console.log('\n[drv] ' + (results.length - bad.length) + '/' + results.length + ' PASS');
  if (bad.length) for (const b of bad) console.log('  FAIL ' + b.name + '  — ' + b.detail);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('[drv] ' + ((e && e.stack) || e)); process.exit(3); });
