#!/usr/bin/env node
/*
 * verify_road_events.js — ワールドマップ「街道の出来事」(#45 Phase 1) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-03_road-events.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§5 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる (手本 = tools/verify_world_steps.js)。
 *
 * ■ 項目 1 (このコミット) で実際に測れるもの — **装置の土台だけ**
 *     (0a) 搭載 … 素の world.html で typeof window.SkillCheck === "object" かつ
 *                 <script src="js/skill-check.js"> が DOM に在る
 *                 ⭐⭐⭐ **これが無いと以降の全 assert が空振りで永久緑になる**
 *                 (依頼書 §2-2 の罠 A —— `if (window.SkillCheck)` と書くと、undefined でも
 *                  例外を出さずイベントが静かに全部スキップされる)
 *     (0d) 母集団 … 実操作の走行で「**イベント対象の停留所**に着いたタップ」が 1 件以上
 *                 ⛔ 0 件だと「イベントが起きない」が自明に真になる
 *     (9a) 事故  … 測定ページで pageerror / console.error が出ていない
 *                 ⭐ 項目 1 の核心リスク = 足した js/skill-check.js が world.html で
 *                   壊れないこと。これは (0a) では捕まらない (載っていても投げうる)。
 *
 * ■ ⛔ 項目 1 の時点で §1〜§5 が PENDING なのは **正常**
 *   (依頼書 §4-2「STEP1 だけを終えた時点では、イベント本体の assert は赤のままが正しい」)。
 *   ⛔ 緑にするために実装を先取りしないこと。
 *
 * ■ 測り方の規律 (依頼書 §8「計測機構」)
 *   ⛔ `?autoplay` / `opts.auto` は使わない —— SkillCheck が UI を出さず即解決してしまい、
 *      「パネルが出る」という主張を一度も検査しないまま緑になる。
 *   ⛔ イベント対象の停留所を **17 と直書きしない**。way (NODES.kind==="way") と
 *      刻み点 (WORLD_MAP.STEPS) の **実体から数える** (依頼書 §8 (0e) と同じ規律)。
 *   ⛔ goToPoint() / goToNode() を page.evaluate から呼ばない (当たり判定が壊れていても
 *      永久に緑になる)。⭐ 実クリックだけで歩く。
 *   ⚠ ドライバは `?walkstep=0` を **踏まないタブ**で測る (sessionStorage 経由で効き続ける)。
 *   ⚠ WM.findWalkPath(a, b) は **始点を含まない** (戻りは「これから進む点の列」)。
 *      slice(1) すると 1 つ落ちる (依頼書 §2-5)。
 *
 * ■ ⚠ ポート
 *   既定 **9760**。⛔ 9600 台 (verify_world_steps) と 9850〜9870 (隣窓の予約) は使わない。
 *   `--port N` で上書き可。変異は N+1 から 1 本ずつ使う。
 *
 * ■ 使い方
 *     node tools/verify_road_events.js                    受入条件
 *     node tools/verify_road_events.js --negative         負のコントロール (変異が赤くなるか)
 *     node tools/verify_road_events.js --mutate noscript  1 本だけ変異を載せて素の判定を流す
 *     node tools/verify_road_events.js --headful          目で見る
 *
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
const PORT = parseInt(arg('port', '9760'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール)
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
// ⚠⚠ world.html は **ディスク上 CRLF**、js/*.js と tools/*.js は **LF**。
//    アンカーは行内文字列にすること (改行をまたがない)。
// ⭐ 項目 1 で実装できるのは noscript の 1 本だけ (他は本体がまだ無い)。
//   ⛔ 未実装分を表から隠さない —— pending() で毎回出す。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ⭐⭐⭐ 依頼書 §2-2 の罠 A そのものの再現。world.html から skill-check.js の
     <script src> を外す = window.SkillCheck が undefined に戻る。
     ⛔ これが赤くならないなら (0a) は何も検査していない。 */
  noscript: {
    impl: true, file: 'world.html', targets: ['0a'],
    why: 'world.html から <script src="js/skill-check.js"> を外す (罠 A の再現)',
    from: '  <script src="js/skill-check.js"></script><!-- 街道の出来事 (#45) の d20 判定。',
    to: '  <!-- [neg noscript] skill-check.js を載せない。街道の出来事 (#45) の d20 判定。',
  },

  /* ── ここから下は本体 (js/road-events.js + world.html の器/発火) が要る ──
     ⛔ 実装したら impl: true にして from/to を埋め、PENDINGS からも外すこと
       (片方だけだと件数が合わなくなる)。 */
  localparty: { impl: false, file: 'js/road-events.js', targets: ['2a'],
    why: 'party を sessionStorage ではなく localStorage から読む (罠 B の再現)' },
  askreuse: { impl: false, file: 'world.html', targets: ['1a'],
    why: 'イベントを #worldEnterAsk へ出す (器の取り違え)' },
  copytext: { impl: false, file: 'world.html', targets: ['0b'],
    why: '文言を world.html へ写経して js/road-events.js を使わない' },
  neverfire: { impl: false, file: 'world.html', targets: ['0d'],
    why: 'イベントを 1 件も発火させない' },
  alwaysfire: { impl: false, file: 'js/road-events.js', targets: ['3b'],
    why: '確率を無視して毎停留所で出す' },
  revisit: { impl: false, file: 'world.html', targets: ['3a'],
    why: '再訪でもイベントを出す' },
  sitefire: { impl: false, file: 'world.html', targets: ['1b'],
    why: '拠点 (site) でもイベントを出す' },
  retreatfire: { impl: false, file: 'world.html', targets: ['3c'],
    why: '?walkstep=0 (撤退モード) でもイベントを出す' },
  seedignore: { impl: false, file: 'js/road-events.js', targets: ['0c'],
    why: '?roadseed を無視して Math.random を直接使う' },
  movefire: { impl: false, file: 'world.html', targets: ['3d'],
    why: '移動中 (isMoving) でもイベントを開く' },
  sameresult: { impl: false, file: 'js/road-events.js', targets: ['3f'],
    why: '成功と失敗で同じ文を出す' },
  retreatkeep: { impl: false, file: 'world.html', targets: ['5a'],
    why: '?roadevent=0 でも器を DOM に残す (display:none で残す)' },
  nodecount: { impl: false, file: 'js/road-events.js', targets: ['0e'],
    why: 'イベントの母集団を way + step から刻み点だけへ狭める' },
};

const MUT_ORDER = ['noscript', 'localparty', 'askreuse', 'copytext', 'neverfire', 'alwaysfire',
  'revisit', 'sitefire', 'retreatfire', 'seedignore', 'movefire', 'sameresult',
  'retreatkeep', 'nodecount'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_SERVED = MUT_IMPL.filter(k => !MUTATIONS[k].driver);
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE && !MUTATIONS[MUTATE]) {
  console.error('[drv] --mutate ' + MUTATE + ' は未知。使えるのは: ' + MUT_ORDER.join(' / '));
  process.exit(3);
}
if (MUTATE && !MUTATIONS[MUTATE].impl) {
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

const PAGE_PATH = '/world.html';

function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
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
// 観測 A) 素のページ — 搭載と母集団のデータ
// ══════════════════════════════════════════════════════════════════════════════
async function measureBoot(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.query || '') + ' boot] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + (opts.query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);

  const out = await page.evaluate(() => {
    const WM = window.WORLD_MAP;
    const SC = window.SkillCheck;
    /* ⭐ 母集団は **実体から数える** (⛔ 17 を直書きしない)。
       way = NODES の kind==="way" / step = STEPS のキー。site は除外 (入場が優先)。 */
    const ways = Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'way');
    const sites = Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'site');
    const steps = Object.keys(WM.STEPS || {});
    /* ⭐ <script src> の実体。⚠ grep でコメントを拾う事故 (依頼書 §2-2) を DOM で殺す。 */
    const srcs = Array.prototype.slice.call(document.querySelectorAll('script[src]'))
      .map(s => s.getAttribute('src'));
    return {
      skillCheckType: typeof SC,
      hasScriptTag: !!document.querySelector('script[src="js/skill-check.js"]'),
      scriptSrcs: srcs,
      checkKeys: (SC && SC.CHECKS) ? Object.keys(SC.CHECKS) : null,
      dcTiers: (SC && SC.DC_TIERS) ? SC.DC_TIERS : null,
      hasResolve: !!(SC && typeof SC.resolveSkillCheck === 'function'),
      abilitiesType: typeof window.DFAbilities,
      heroClassesType: typeof window.HERO_CLASSES,
      ways: ways, sites: sites, steps: steps,
      pop: ways.concat(steps),
      /* 後続項目 (§1 / §5) が読む器。項目 1 では **まだ無いのが正しい**。 */
      hasEventBox: !!document.getElementById('worldEventBox'),
      hasRoadEventSeam: !!(window.__world && typeof window.__world.roadEvent === 'function'),
      roadEventsModule: typeof window.ROAD_EVENTS,
    };
  });
  out.query = opts.query || '';
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 B) 実操作 — 実クリックだけで歩く (⛔ goToPoint を evaluate から呼ばない)
// ══════════════════════════════════════════════════════════════════════════════
const MAX_TAPS = 16;
const TAP_SETTLE_MS = 140;

async function readPlay(page) {
  /* ⚠ try/catch は必須。ページが world.html を離れると evaluate は
     "Execution context was destroyed" で **投げる**。⭐ 投げたら dead 扱いで返す。 */
  try {
    return await page.evaluate(() => {
      const W = window.__world;
      if (!W) return { dead: true, path: location.pathname, search: location.search };
      return {
        dead: false, node: W.heroNode(), px: W.heroPx(),
        arrivals: W.arrivalCount(), last: W.lastArrival(),
        askOpen: W.askOpen(), moving: W.isMoving(),
        path: location.pathname, search: location.search,
      };
    });
  } catch (e) {
    return { dead: true, path: '(evaluate 失敗: ' + String(e && e.message).slice(0, 80) + ')', search: '' };
  }
}
async function safeEval(page, fn, a) {
  try { return await page.evaluate(fn, a); } catch (e) { return null; }
}
async function waitStill(page) {
  try {
    await page.waitForFunction('!window.__world || !window.__world.isMoving()',
      { timeout: 40000, polling: 60 });
    return true;
  } catch (e) { return false; }
}
async function tapAt(page, cx, cy, id, why) {
  const before = await readPlay(page);
  if (before.dead) {
    return { ok: false, id: id, why: why, before: before, after: before, dist: null,
      err: 'ページが world.html を離れている: ' + before.path };
  }
  await page.mouse.click(Math.round(cx), Math.round(cy));
  const still = await waitStill(page);
  await sleep(TAP_SETTLE_MS);
  const after = await readPlay(page);
  const dist = (after.dead) ? null : Math.hypot(after.px.x - before.px.x, after.px.y - before.px.y);
  return {
    ok: still && !after.dead, id: id, why: why, cx: cx, cy: cy,
    before: before, after: after, dist: dist,
    err: !still ? '到着待ちタイムアウト'
      : (after.dead ? 'タップ後にページが遷移した: ' + after.path : null),
  };
}
/* 停留所 id を 1 回押す (client 座標はその都度ページから引く)。 */
async function tapPoint(page, id, why) {
  const pre = await readPlay(page);
  if (pre.dead) {
    return { ok: false, id: id, why: why, before: pre, after: pre, dist: null,
      err: 'ページが world.html を離れている: ' + pre.path };
  }
  const pt = await safeEval(page, i => window.__world.clientFromPoint(i), id);
  if (!pt) {
    return { ok: false, id: id, why: why, before: pre, after: pre, dist: null,
      err: 'clientFromPoint が null: ' + id };
  }
  return tapAt(page, pt.x, pt.y, id, why);
}

async function measurePlay(browser, port, errs, opts) {
  opts = opts || {};
  const out = { query: opts.query || '', taps: [] };
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.query || '') + ' play] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + (opts.query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);

  /* ⭐ 母集団 (way + step) を **ページの実体から**採る。⛔ 17 を直書きしない。 */
  out.pop = await page.evaluate(() => {
    const WM = window.WORLD_MAP;
    const ways = Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'way');
    const steps = Object.keys(WM.STEPS || {});
    const sites = Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'site');
    return { ways: ways, steps: steps, sites: sites, ids: ways.concat(steps) };
  });

  out.start = await readPlay(page);

  /* ⭐ 行き先は **ページの findWalkPath から選ぶ** (⛔ id をドライバへ直書きしない)。
     ⛔ enter を持つノード (港町フラン) は選ばない —— 着くと location.href で
        town.html へ飛び、以後の測定が全部死ぬ (verify_world_steps が実際に踏んだ)。
     ⭐ 一番遠い拠点を選ぶ = 途中の停留所を最大数踏む = (0d) の母集団が厚くなる。
     ⚠ findWalkPath は **始点を含まない**ので path.length がそのままホップ数。 */
  out.destPick = await page.evaluate(() => {
    const WM = window.WORLD_MAP, W = window.__world;
    const from = W.heroNode();
    let best = null;
    Object.keys(WM.NODES).forEach(function (id) {
      const n = WM.NODES[id];
      if (n.kind !== 'site' || n.enter !== undefined || id === from) return;
      const p = WM.findWalkPath(from, id);
      if (p && p.length && (!best || p.length > best.path.length)) best = { dest: id, path: p };
    });
    return best ? { from: from, dest: best.dest, path: best.path }
      : { from: from, dest: null, path: null };
  });

  /* 押し続けて歩く。⭐ 各タップの到着点 (lastArrival) を残す = (0d) が数える。 */
  out.arrivals = [];
  if (out.destPick && out.destPick.dest) {
    const dest = out.destPick.dest;
    let lastNode = out.start.dead ? null : out.start.node;
    for (let i = 0; i < MAX_TAPS; i++) {
      const t = await tapPoint(page, dest, dest + ' を押す');
      out.taps.push(t);
      if (!t.ok) break;
      if (t.after.last) out.arrivals.push(t.after.last);
      if (t.after.node === dest) break;
      if (t.after.node === lastNode) break;   /* 進まなくなった */
      lastNode = t.after.node;
    }
  }
  out.end = await readPlay(page);
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (実装済み)  ⭐ [key, 見出し, m => [bool, detail]]
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  ['0a', '[装置] 素の world.html で window.SkillCheck が object かつ '
    + '<script src="js/skill-check.js"> が DOM に在る (⭐⭐⭐ 依頼書 §2-2 の罠 A の番人)',
    (m) => {
      const b = m.boot;
      if (!b) return [false, '素のページの観測が無い'];
      const okType = b.skillCheckType === 'object';
      const okTag = b.hasScriptTag === true;
      const okApi = b.hasResolve === true;
      /* ⭐ 依存も同じ assert で見る —— js/abilities.js より **後**に載っていること。
         ⛔ 順序が逆だと abilityModifier が黙って 0 を返し、判定が全部素の d20 になる。 */
      const iA = b.scriptSrcs.indexOf('js/abilities.js');
      const iS = b.scriptSrcs.indexOf('js/skill-check.js');
      const okOrder = iA >= 0 && iS >= 0 && iA < iS;
      const nChecks = b.checkKeys ? b.checkKeys.length : 0;
      return [okType && okTag && okApi && okOrder && nChecks > 0,
        'typeof SkillCheck=' + b.skillCheckType
        + ' / <script src="js/skill-check.js">=' + b.hasScriptTag
        + ' / resolveSkillCheck=' + b.hasResolve
        + ' / CHECKS ' + nChecks + ' 件'
        + ' / 読み込み順 abilities[' + iA + '] < skill-check[' + iS + ']=' + okOrder
        + ' / DFAbilities=' + b.abilitiesType + ' HERO_CLASSES=' + b.heroClassesType];
    }],

  ['0d', '[母集団] 実操作の走行で **イベント対象の停留所 (way + step) に着いたタップ** が 1 件以上'
    + ' (⛔ 0 件だと「起きない」が自明に真)',
    (m) => {
      const p = m.play;
      if (!p) return [false, '実操作の観測が無い'];
      if (!p.pop || !p.pop.ids.length) return [false, '母集団 (way + step) が 0 件'];
      const set = {};
      p.pop.ids.forEach(id => { set[id] = true; });
      const hits = (p.arrivals || []).filter(a => a && set[a.at]);
      const onSite = (p.arrivals || []).filter(a => a && !set[a.at]);
      const bad = (p.taps || []).filter(t => !t.ok);
      return [hits.length >= 1 && bad.length === 0,
        '母集団 ' + p.pop.ids.length + ' 件 (way ' + p.pop.ways.length
        + ' + step ' + p.pop.steps.length + ' / ⛔ site ' + p.pop.sites.length + ' は除外)'
        + ' / 行き先 ' + JSON.stringify(p.destPick && p.destPick.dest)
        + ' (' + ((p.destPick && p.destPick.path) ? p.destPick.path.length : 0) + ' ホップ)'
        + ' / タップ ' + (p.taps || []).length + ' 回'
        + ' / 対象停留所への到着 ' + hits.length + ' 件'
        + ' / 対象外 (site) への到着 ' + onSite.length + ' 件'
        + (bad.length ? ' / ⛔ 失敗タップ ' + bad.length + ' 件: ' + bad[0].err : '')];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// まだ実装されていない受入条件 (⛔ 件数から隠さない = pending() で必ず出す)
//   ⭐ 後続の項目がここを 1 行ずつ ASSERTS へ移す。最終項目の完了条件 = PENDING 0。
//   ⛔ 空になっても配列ごと削除しないこと (削ると PENDING という 3 値そのものが消える)。
//   ⚠ ASSERTS へ移したら **PENDINGS から外し、本体の配線 (§n の配列) へキーを足す**
//     —— 両方やらないと件数が合わなくなる。
// ══════════════════════════════════════════════════════════════════════════════
const PENDINGS = [
  ['§0 装置 (残り) — 依頼書 §8', [
    ['0b', 'イベントの文言は js/road-events.js から引いている (world.html の配信バイトに'
      + ' 6 件の title / intro が 1 つも出てこない)', '⛔ js/road-events.js が未実装 → 項目 2'],
    ['0c', '決定論: ?roadseed=4242 で 2 回走らせて、発火した停留所の列が完全に一致',
      '⛔ ?roadseed が未実装 → 項目 3'],
    ['0e', 'イベント表は 6 件 / 地形は 5 種 / 母集団の停留所は way + step'
      + ' (⛔ 実体から数える。数字を直書きしない)', '⛔ js/road-events.js が未実装 → 項目 2'],
  ]],
  ['§1 器 (どこに出るか) — 依頼書 §8', [
    ['1a', 'イベント表示中は #worldEventBox が可視で、__world.askOpen() は false のまま'
      + ' (⛔ #worldEnterAsk を使っていない)', '⛔ #worldEventBox が未実装 → 項目 2'],
    ['1b', '拠点 (site) へ「着いた」タップではイベントが 1 件も出ない'
      + ' (母集団ガード = 拠点へ着いたタップが 1 件以上)', '⛔ 発火が未実装 → 項目 3'],
    ['1c', 'イベントの器の z-index < 判定パネル (#skillCheckOverlay)'
      + ' ⭐ 105 はページから読む (⛔ 直書きしない)', '⛔ #worldEventBox が未実装 → 項目 2'],
    ['1d', 'compact (390x844) でイベントの器が画面内に収まる (fitsX / fitsY)',
      '⛔ #worldEventBox が未実装 → 項目 2'],
  ]],
  ['§2 party (誰が判定するか) — 依頼書 §8', [
    ['2a', '⭐⭐⭐ sessionStorage に 4 人分を書くと判定パネルのロスターが 4 行出る'
      + ' (⛔ localStorage しか無い状態と区別できること = 罠 B の検出)',
      '⛔ buildParty が未実装 → 項目 3'],
    ['2b', 'sessionStorage を空にすると 1 行 (主人公のみ) に落ちるが判定は成立する'
      + ' (resolveSkillCheck が null を返さない)', '⛔ buildParty が未実装 → 項目 3'],
    ['2c', '⛔ world.html の配信バイトの sessionStorage.removeItem の出現数が着手前と同じ'
      + ' (peek だけ = 一回性のキーを 1 つも消さない)', '⛔ buildParty が未実装 → 項目 3'],
  ]],
  ['§3 発火の規則 — 依頼書 §8', [
    ['3a', '同じ停留所では二度出ない (往復させて再訪させ、2 回目に出ないことを見る)',
      '⛔ 発火が未実装 → 項目 3'],
    ['3b', '地形ごとに発生率が異なる (種を変えて N 回走らせ swamp > coast。⛔ 具体値は縛らない)',
      '⛔ 発火が未実装 → 項目 3'],
    ['3c', '?walkstep=0 では 1 件も出ない (母集団ガード = そのアームでもホップが 1 件以上)',
      '⛔ 発火が未実装 → 項目 3'],
    ['3d', '移動中 (__world.isMoving() が true) にはイベントが開かない', '⛔ 発火が未実装 → 項目 3'],
    ['3e', '判定を伴わない選択肢では #skillCheckOverlay が作られない', '⛔ 二択が未実装 → 項目 3'],
    ['3f', '判定を伴う選択肢では o.success に応じて出る文が変わる'
      + ' (⭐ 種を変えて成功と失敗の**両方**を引く)', '⛔ 二択が未実装 → 項目 3'],
  ]],
  ['§4 恒等 (非退行) — 依頼書 §8', [
    ['4a', 'WORLD_MAP.NODES / EDGES / STEPS が 1 件も変わっていない (恒等ハッシュ)',
      '⛔ 項目 4 が verify_world_steps (1d) と同じハッシュで突き合わせる'],
    ['4b', '__world の既存の窓 (heroNode / askOpen / arrivalCount / lastArrival / stepIds /'
      + ' heroMarkGeom …) が全部残っている', '⛔ 項目 4'],
    ['4c', 'arrivalCount は 1 ホップにつきちょうど 1 増える (#40 の (4b) と同じ規則)', '⛔ 項目 4'],
  ]],
  ['§5 撤退 ?roadevent=0 — 依頼書 §8', [
    ['5a', '?roadevent=0 → #worldEventBox が DOM に存在しない (⛔ display:none で残っていたら赤)',
      '⛔ 撤退スイッチが未実装 → 項目 4'],
    ['5b', '?roadevent=0 のとき __world.roadEvent().on === false かつ発火 0 件'
      + ' (⭐ §1〜§3 の assert を撤退アームにも当てる)', '⛔ 撤退スイッチが未実装 → 項目 4'],
    ['5c', '?roadevent=0 でも歩行そのものは 1 ミリも変わらない'
      + ' (同じ種・同じ経路で arrivalCount と最終ノードが一致)', '⛔ 撤退スイッチが未実装 → 項目 4'],
  ]],
];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_roadevents_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  MUT_SERVED.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

  console.log('=== verify_road_events.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (変異は 1 本も実装されていない)'));

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  const errs = [];

  try {
    /* ══ 装置: 測定タブへ「6 シナリオ クリア済み」を焼く ══════════════════════
       ⚠⚠ world.html を開く箇所は 1 つではないので **browser.newPage を 1 回だけ包む**
         (1 箇所だけ仕込むと札の枚数だけが割れる = verify_world_map.js で実際に踏んだ)。 */
    const CLEARED_ALL = await (async () => {
      const p = await browser.newPage();
      await p.goto('http://localhost:' + PORT + PAGE_PATH, { waitUntil: 'load', timeout: 30000 });
      await p.waitForFunction('!!window.WORLD_MAP', { timeout: 20000 });
      const ids = await p.evaluate(() => Object.keys(window.WORLD_MAP.SITES));
      await p.close();
      return ids;
    })();
    const CLEARED_KEY = 'dragonfighters.cleared';
    const _newPage = browser.newPage.bind(browser);
    browser.newPage = async function () {
      const p = await _newPage();
      await p.evaluateOnNewDocument((k, v) => {
        try { localStorage.setItem(k, v); } catch (e) {}
      }, CLEARED_KEY, JSON.stringify(CLEARED_ALL));
      return p;
    };
    console.log('[drv]   [装置] 測定タブへ ' + CLEARED_KEY + '=' + JSON.stringify(CLEARED_ALL)
      + ' を仕込む (札 7 枚の母集団を復元)');

    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      mark('§0 装置 — 搭載 (0a) と母集団 (0d)');
      const m = {};
      m.boot = await measureBoot(browser, PORT, errs, {});
      /* ⭐ 実操作 (実クリックで歩く) の観測。(0d) が読む。
         ⚠ ここが一番時間を食う (最大 16 タップ x 歩き)。 */
      m.play = await measurePlay(browser, PORT, errs, {});
      for (const key of ['0a', '0d']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }
      if (m.boot) {
        console.log('       [記録] <script src> の並び:');
        console.log('         ' + m.boot.scriptSrcs.join(' → '));
        console.log('       [記録] SkillCheck.CHECKS: '
          + (m.boot.checkKeys ? m.boot.checkKeys.join(' / ') : '(無し)'));
        console.log('       [記録] SkillCheck.DC_TIERS: ' + JSON.stringify(m.boot.dcTiers));
        console.log('       [記録] 項目 2 以降で生える物 (⛔ 今は無いのが正しい): '
          + '#worldEventBox=' + m.boot.hasEventBox
          + ' / __world.roadEvent=' + m.boot.hasRoadEventSeam
          + ' / window.ROAD_EVENTS=' + m.boot.roadEventsModule);
      }
      if (m.play) {
        console.log('       [記録] イベント対象の停留所 (⛔ 数字は直書きせずページから数えた):');
        console.log('         way  ' + m.play.pop.ways.length + ' 件: ' + m.play.pop.ways.join(' '));
        console.log('         step ' + m.play.pop.steps.length + ' 件: ' + m.play.pop.steps.join(' '));
        console.log('         site ' + m.play.pop.sites.length + ' 件 (⛔ 母集団から除外): '
          + m.play.pop.sites.join(' '));
        console.log('         合計 (way + step) = ' + m.play.pop.ids.length + ' 件');
        console.log('       [記録] 実操作の通し (⛔ 期待値ではない。読み解き用):');
        console.log('         起点 ' + JSON.stringify(m.play.start && m.play.start.node)
          + ' → 行き先 ' + JSON.stringify(m.play.destPick && m.play.destPick.dest)
          + ' (findWalkPath ' + ((m.play.destPick && m.play.destPick.path)
            ? m.play.destPick.path.length : 0) + ' ホップ)');
        const set = {};
        m.play.pop.ids.forEach(id => { set[id] = true; });
        for (const t of m.play.taps) {
          console.log('         ' + (t.ok ? '' : '⛔ ')
            + (t.before ? t.before.node : '?') + ' → '
            + ((t.ok && t.after) ? t.after.node : ('⛔' + t.err))
            + (t.ok && t.dist !== null ? ('  ' + t.dist.toFixed(1) + 'px') : '')
            + (t.ok && t.after && t.after.last
              ? ('  last=' + JSON.stringify(t.after.last)
                + (set[t.after.last.at] ? '  ★イベント対象' : '  (site)')) : ''));
        }
      }

      for (const [title, rows] of PENDINGS) {
        mark(title);
        for (const p of rows) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      mark('§9 ページエラー');
      check('(9a) 測定ページで pageerror / console.error が出ていない'
        + ' (⭐ 項目 1 の核心 = 足した js/skill-check.js が world.html で壊れない)',
        errs.length === 0, errs.slice(0, 6).join(' | '));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
            pure.body.split(MUTATIONS[k].to).length - 1 === 0
            && mut.body.split(MUTATIONS[k].to).length - 1 === 1, f);
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length,
            '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }

        mark('欠陥を注入すると担当の節が赤くなること');
        for (const k of MUT_IMPL) {
          const negErrs = [];
          const port = MUTATIONS[k].driver ? PORT : PORT_OF[k];
          const m = {};
          m.boot = await measureBoot(browser, port, negErrs, {});
          /* ⭐ (0d) / §1 / §3 / §4 を狙う変異は **実操作の観測**が無いと
             「実操作の観測が無い」で機械的に赤くなり、欠陥を検出したのか装置が
             欠けているのか読めなくなる。⛔ 片方だけにしない。
             ⚠ 実操作は 1 本あたり数十秒。必要な変異でだけ採る。 */
          const needsPlay = MUTATIONS[k].targets.some(t => t === '0d' || /^[134]/.test(t));
          if (needsPlay) m.play = await measurePlay(browser, port, negErrs, {});
          for (const key of MUTATIONS[k].targets) {
            const a = ASSERT_OF[key];
            if (!a) {
              pending('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる',
                '⛔ (' + key + ') はまだ ASSERTS に無い (後続項目が実装する)');
              continue;
            }
            const r = a[2](m);
            check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
              r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
          }
        }
      }

      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⛔ 件数から隠さない)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → '
            + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
            MUTATIONS[k].why + '  [予定の配信先 ' + MUTATIONS[k].file + ']');
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
