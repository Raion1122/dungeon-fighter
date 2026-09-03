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
 * ■ 項目 2 (STEP2 表と器) で足したもの
 *     (0b) 写経  … world.html の **配信バイト**に 6 件の title / intro / 選択肢 / 結末文が
 *                 1 文字も出てこない (文言の唯一の正は js/road-events.js)。変異 copytext が番人
 *     (0e) 表    … イベント表 / 地形 / 母集団を **実体から数える**。
 *                 ROAD_EVENTS.stops() == WORLD_MAP の way + step、
 *                 RATE の地形 == イベントが張る地形 == 全停留所の地形、
 *                 checkKey は SkillCheck.CHECKS 内 (⚠⚠⚠ survival / medicine / nature は無い)、
 *                 各イベントは二択で片方だけ判定つき・成功文 ≠ 失敗文
 *     (1c) 層    … #worldEventBox の z-index < #skillCheckOverlay かつ < #worldEnterAsk かつ
 *                 > #worldTitle。⭐ 3 つとも **ページから読む** (⛔ 105 / 20 / 10 を直書きしない)。
 *                 器を開いたまま判定を出し elementFromPoint が本当にパネル内かまで見る
 *     (1d) compact … 390x844 で **6 件すべて**の器が画面内に収まる (fitsX / fitsY)。
 *                 ⛔ 中身を隠して「収まった」ことにしていないか (scrollHeight vs clientHeight) も見る
 *   ⭐ 発火 (onArriveStep からの確率) は項目 3 の担当なので、項目 2 の時点で器を開く手段は
 *     ROAD_EVENTS.open() しか無い。measureBox がそれを使って **決定論的に**開く。
 *
 * ■ ⛔ 項目 2 の時点で (0c) / (1a)(1b) / §2〜§5 が PENDING なのは **正常**
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
  /* ⭐ 依頼書 §8 の copytext。world.html のコメント 1 行を、イベントの **実物の文言**
     (title + 二択の label) へ差し替える = 「写経した」状態の再現。
     ⛔ これが赤くならないなら (0b) は「文言が world.html に無い」を何も検査していない。
     ⚠ 置換文字列に `-->` を含めない —— 含めるとコメントが早く閉じ、後続 2 行が本文へ漏れて
       「(0b) ではなく HTML 崩れ」を測ってしまう。 */
  copytext: {
    impl: true, file: 'world.html', targets: ['0b'],
    why: '文言を world.html へ写経して js/road-events.js を使わない',
    from: '  <!-- 街道の出来事の器 (依頼書 #45 §5-2)。⛔ 文言はここに書かない —— 唯一の正は js/road-events.js',
    to: '  <!-- [neg copytext] 桟橋のいざこざ / 間に割って入り、話をまとめる / 関わらず、荷の脇をすり抜ける',
  },
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
      /* ⭐ 項目 2 が足したイベント表。(0b) / (0e) が **この実体から**数える。
         ⛔ 6 / 5 / 17 をドライバへ直書きしない —— 数えた値どうしの整合だけを縛る。 */
      roadEvents: (function () {
        const RE = window.ROAD_EVENTS;
        if (!RE || !RE.EVENTS) return null;
        const stops = (typeof RE.stops === 'function') ? RE.stops() : [];
        const tmap = {};
        stops.forEach(function (id) {
          tmap[id] = (typeof RE.terrainOf === 'function') ? RE.terrainOf(id) : null;
        });
        return {
          events: RE.EVENTS.map(function (e) {
            return {
              id: e.id, terrain: e.terrain, checkKey: e.checkKey, dc: e.dc,
              title: e.title, intro: e.intro,
              choices: (e.choices || []).map(function (c) {
                return { label: c.label, check: !!c.check,
                  result: c.result || null, success: c.success || null, fail: c.fail || null };
              }),
            };
          }),
          rateKeys: RE.RATE ? Object.keys(RE.RATE) : [],
          rates: RE.RATE || null,
          terrains: RE.TERRAINS || [],
          rank: RE.TERRAIN_RANK || [],
          stops: stops,
          terrainOf: tmap,
          api: { open: typeof RE.open, close: typeof RE.close, isOpen: typeof RE.isOpen,
                 showResult: typeof RE.showResult, armMs: RE.ARM_MS },
        };
      })(),
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
// 観測 C) 器 — #worldEventBox を **決定論的に**開いて (1c)(1d) を測る
//   ⭐ 発火 (onArriveStep からの確率) は項目 3 の担当なので、項目 2 の時点で器を開く
//     手段は ROAD_EVENTS.open() しか無い。⛔ ここで測るのは **器の幾何と層**だけで、
//     「いつ出るか」は 1 バイトも測らない (それは (3a)〜(3d) の仕事)。
//   ⚠ 判定パネルの z-index は **ページから読む** (⛔ 105 を直書きしない)。出すには
//     SkillCheck.resolveSkillCheck を 1 回呼ぶしかない (ensurePanel は非公開)。
//   ⛔ opts.auto は渡さない —— 渡すと UI を出さず即解決し、パネルを一度も測らないまま緑になる。
// ══════════════════════════════════════════════════════════════════════════════
async function measureBox(browser, port, errs, opts) {
  opts = opts || {};
  const vp = opts.viewport || { width: 390, height: 844 };
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.query || '') + ' box ' + vp.width + 'x' + vp.height + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport(vp);
  await page.goto('http://localhost:' + port + PAGE_PATH + (opts.query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);

  const out = { viewport: vp, query: opts.query || '' };

  /* ① 器そのもの (開く前) */
  out.pre = await page.evaluate(() => {
    const b = document.getElementById('worldEventBox');
    return {
      boxFound: !!b,
      display: b ? getComputedStyle(b).display : null,
      visibility: b ? getComputedStyle(b).visibility : null,
      hasShow: !!(b && b.classList.contains('show')),
      compact: document.body.classList.contains('compact'),
      moduleOk: !!(window.ROAD_EVENTS && typeof window.ROAD_EVENTS.open === 'function'),
    };
  });

  /* ② 6 件すべてを順に開いて矩形を測る。⭐ 一番長い 1 件だけ測ると、他の 5 件が
        はみ出していても永久に緑になる。 */
  out.cards = await page.evaluate(() => {
    const RE = window.ROAD_EVENTS;
    const out = [];
    if (!RE || !RE.EVENTS) return out;
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < RE.EVENTS.length; i++) {
      const ev = RE.EVENTS[i];
      const opened = RE.open(ev, function () {});
      const box = document.getElementById('worldEventBox');
      const card = box ? box.querySelector('#worldEventCard') : null;
      const btns = card ? Array.prototype.slice.call(card.querySelectorAll('.worldEventBtn')) : [];
      const r = card ? card.getBoundingClientRect() : null;
      out.push({
        id: ev.id, opened: opened, isOpen: RE.isOpen(),
        display: box ? getComputedStyle(box).display : null,
        rect: r ? { x: r.left, y: r.top, w: r.width, h: r.height,
                    right: r.right, bottom: r.bottom } : null,
        /* ⭐ 中身が器からあふれていないか (max-height + overflow で隠して
             「収まった」ことにしていないかの検出)。 */
        clipY: card ? (card.scrollHeight - card.clientHeight) : null,
        clipX: card ? (card.scrollWidth - card.clientWidth) : null,
        nBtns: btns.length,
        btnRects: btns.map(function (b) {
          const q = b.getBoundingClientRect();
          return { label: b.textContent, x: q.left, y: q.top, w: q.width, h: q.height,
                   right: q.right, bottom: q.bottom };
        }),
        vw: W, vh: H,
      });
      RE.close();
    }
    return out;
  });

  /* ③ 層 — 器を開いたまま判定パネルを出し、**ページから** z-index を読む。
        ⛔ 105 を直書きしない。⭐ elementFromPoint で「本当に最前面か」まで見る。 */
  out.layer = await (async () => {
    const started = await page.evaluate(() => {
      const RE = window.ROAD_EVENTS, SC = window.SkillCheck;
      if (!RE || !RE.EVENTS || !RE.EVENTS.length) return { ok: false, why: 'ROAD_EVENTS が無い' };
      RE.open(RE.EVENTS[0], function () {});
      if (!SC || typeof SC.resolveSkillCheck !== 'function') return { ok: false, why: 'SkillCheck が無い' };
      /* ⛔ opts.auto は渡さない (UI を出さずに即解決してしまう)。 */
      SC.resolveSkillCheck('persuasion', 'easy', [{ classKey: 'warrior', name: '戦士' }], {});
      return { ok: true };
    });
    if (!started.ok) return { panelFound: false, why: started.why };
    try {
      await page.waitForFunction(
        "!!document.getElementById('skillCheckOverlay') && document.getElementById('skillCheckOverlay').classList.contains('show')",
        { timeout: 8000, polling: 60 });
    } catch (e) {
      return { panelFound: false, why: '#skillCheckOverlay が出てこない: ' + String(e.message).slice(0, 60) };
    }
    return page.evaluate(() => {
      const zi = (el) => {
        if (!el) return null;
        const v = parseInt(getComputedStyle(el).zIndex, 10);
        return isFinite(v) ? v : null;
      };
      const box = document.getElementById('worldEventBox');
      const ov = document.getElementById('skillCheckOverlay');
      const ask = document.getElementById('worldEnterAsk');
      const title = document.getElementById('worldTitle');
      const cx = Math.round(window.innerWidth / 2), cy = Math.round(window.innerHeight / 2);
      const top = document.elementFromPoint(cx, cy);
      return {
        panelFound: true,
        boxFound: !!box, boxZ: zi(box), boxOpen: !!(box && box.classList.contains('show')),
        panelZ: zi(ov),
        /* ⭐ 同じページから読む「上の層」と「下の層」。⛔ 20 も 10 も直書きしない。 */
        askZ: zi(ask), titleZ: zi(title),
        /* ⛔ #worldEnterAsk を流用していないこと ((1a) の前哨 / verify_world_steps (4c) の条件②)。 */
        askOpen: !!(window.__world && window.__world.askOpen()),
        topId: top ? (top.id || top.className || top.tagName) : null,
        topInPanel: !!(ov && top && ov.contains(top)),
      };
    });
  })();

  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (実装済み)  ⭐ [key, 見出し, m => [bool, detail]]
// ══════════════════════════════════════════════════════════════════════════════
/* ⛔ 集合の比較は「件数が同じ」で済ませない (件数だけだと入れ替えを検出できない)。 */
const uniq = (a) => Array.from(new Set(a));
const eqList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

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

  ['0b', '[装置] イベントの文言は js/road-events.js から引いている — world.html の'
    + ' **配信バイト**に title / intro / 選択肢 / 結末文が 1 つも出てこない'
    + ' (⛔ 写経の検出。#15 B-1 と同じ規律。変異 copytext が番人)',
    (m) => {
      const b = m.boot;
      if (!b || !b.roadEvents) return [false, 'window.ROAD_EVENTS が無い (js/road-events.js が未搭載)'];
      if (typeof m.served !== 'string' || !m.served.length)
        return [false, 'world.html の配信バイトを読めていない'];
      const evs = b.roadEvents.events || [];
      const strs = [];
      evs.forEach(e => {
        strs.push([e.id + '.title', e.title]);
        strs.push([e.id + '.intro', e.intro]);
        (e.choices || []).forEach((c, i) => {
          strs.push([e.id + '.choices[' + i + '].label', c.label]);
          ['result', 'success', 'fail'].forEach(k => {
            if (c[k]) strs.push([e.id + '.choices[' + i + '].' + k, c[k]]);
          });
        });
      });
      /* ⛔ 短すぎる語は誤検出になるので 4 文字以上だけ見る (id / terrain / dc は元から見ない)。 */
      const checked = strs.filter(s => typeof s[1] === 'string' && s[1].length >= 4);
      const hits = checked.filter(s => m.served.indexOf(s[1]) >= 0);
      /* ⭐⭐⭐ 母集団ガード —— 検索する文言が 0 本なら「出てこない」は**自明に真**。
         1 イベントにつき最低 4 本 (title / intro / label x2) は必ず在る。 */
      const enough = evs.length >= 1 && checked.length >= evs.length * 4;
      return [enough && hits.length === 0,
        'world.html 配信 ' + m.served.length + 'B / 検索した文言 ' + checked.length + ' 本'
        + ' (イベント ' + evs.length + ' 件 x title+intro+選択肢+結末) / 母集団ガード=' + enough
        + (hits.length
          ? ' / ⛔ 写経ヒット ' + hits.length + ' 本: '
            + hits.slice(0, 3).map(s => s[0] + '=' + JSON.stringify(s[1].slice(0, 20))).join(' , ')
          : ' / ヒット 0 本')];
    }],

  ['0e', '[装置] イベント表 / 地形 / 母集団を **実体から数える** — ROAD_EVENTS.stops() が'
    + ' WORLD_MAP の way + step と完全一致 / RATE の地形 = イベントが張る地形 = 全停留所の地形 /'
    + ' checkKey は SkillCheck.CHECKS 内・dc は DC_TIERS 内 / 各イベントは二択で片方だけ判定つき'
    + ' (⛔ 6 / 5 / 17 を直書きしない)',
    (m) => {
      const b = m.boot;
      if (!b || !b.roadEvents) return [false, 'window.ROAD_EVENTS が無い (js/road-events.js が未搭載)'];
      const R = b.roadEvents;
      const evs = R.events || [];
      /* ① 母集団 —— js/world-map.js の実体 (way + step) と ROAD_EVENTS.stops() が同じ集合か。
            ⭐ 変異 nodecount (母集団を刻み点だけに狭める) はここで赤くなる。 */
      const wmPop = b.ways.concat(b.steps).slice().sort();
      const rePop = (R.stops || []).slice().sort();
      const popSame = eqList(wmPop, rePop);
      /* ② 地形 —— 3 つの集合が一致するか (RATE / イベント / 全停留所)。 */
      const rateT = (R.rateKeys || []).slice().sort();
      const evT = uniq(evs.map(e => e.terrain)).sort();
      const stopT = uniq(rePop.map(id => R.terrainOf[id])).sort();
      const terrSame = eqList(rateT, evT) && eqList(rateT, stopT);
      const unknown = rePop.filter(id => !R.terrainOf[id]);
      /* ③ 表の中身 —— id 重複なし / checkKey と dc が実在 / 二択で片方だけ判定つき /
            成功文と失敗文が別の文。⚠⚠⚠ survival・medicine・nature は CHECKS に**無い**ので
            ここで赤くなる (書くと resolveSkillCheck が null を返して判定ごと消える)。 */
      const ids = evs.map(e => e.id);
      const idUniq = uniq(ids).length === ids.length;
      const keys = b.checkKeys || [];
      const tiers = b.dcTiers ? Object.keys(b.dcTiers) : [];
      const badKey = evs.filter(e => keys.indexOf(e.checkKey) < 0).map(e => e.id + ':' + e.checkKey);
      const badDc = evs.filter(e => tiers.indexOf(e.dc) < 0).map(e => e.id + ':' + e.dc);
      const badShape = evs.filter(e => {
        const cs = e.choices || [];
        const yes = cs.filter(c => c.check), no = cs.filter(c => !c.check);
        if (cs.length !== 2 || yes.length !== 1 || no.length !== 1) return true;
        if (!yes[0].success || !yes[0].fail || yes[0].success === yes[0].fail) return true;
        return !no[0].result;
      }).map(e => e.id);
      const ok = evs.length >= 1 && rePop.length >= 1 && keys.length >= 1 && tiers.length >= 1
        && popSame && terrSame && unknown.length === 0 && idUniq
        && !badKey.length && !badDc.length && !badShape.length;
      const cnt = {};
      rePop.forEach(id => { const t = R.terrainOf[id]; cnt[t] = (cnt[t] || 0) + 1; });
      return [ok,
        'イベント ' + evs.length + ' 件 / 地形 ' + rateT.length + ' 種 [' + rateT.join(' ') + ']'
        + ' / 母集団 ' + rePop.length + ' 件 (WORLD_MAP way ' + b.ways.length
        + ' + step ' + b.steps.length + ' = ' + wmPop.length + ' / 一致=' + popSame + ')'
        + ' / 地形の 3 集合一致=' + terrSame
        + ' / 地形割り ' + rateT.map(t => t + ':' + (cnt[t] || 0)).join(' ')
        + ' / 発生率 ' + JSON.stringify(R.rates)
        + (unknown.length ? ' / ⛔ 地形不明 ' + unknown.length + ' 件: ' + unknown.slice(0, 3).join(' ') : '')
        + (idUniq ? '' : ' / ⛔ id が重複')
        + (badKey.length ? ' / ⛔ CHECKS に無い checkKey: ' + badKey.join(' ') : '')
        + (badDc.length ? ' / ⛔ DC_TIERS に無い dc: ' + badDc.join(' ') : '')
        + (badShape.length ? ' / ⛔ 二択の形が違う (片方だけ判定つき・成功文≠失敗文): '
            + badShape.join(' ') : '')];
    }],

  ['1c', '[器] #worldEventBox の z-index が 判定パネル (#skillCheckOverlay) より下・'
    + '#worldEnterAsk より下・#worldTitle より上 — ⭐ 3 つとも **ページから読む**'
    + ' (⛔ 105 / 20 / 10 を直書きしない)。⭐ 器を開いたまま判定を出し、画面中央の'
    + ' elementFromPoint が本当にパネル内であることまで見る',
    (m) => {
      const x = m.box;
      if (!x) return [false, '器の観測が無い'];
      if (!x.pre || !x.pre.boxFound) return [false, '#worldEventBox が DOM に無い'];
      const L = x.layer || {};
      if (!L.panelFound) return [false, '判定パネルを出せなかった: ' + (L.why || '(理由不明)')];
      const fin = (v) => typeof v === 'number' && isFinite(v);
      const ok = fin(L.boxZ) && fin(L.panelZ) && fin(L.askZ) && fin(L.titleZ)
        && L.boxZ < L.panelZ && L.boxZ < L.askZ && L.boxZ > L.titleZ
        && L.boxOpen === true && L.topInPanel === true && L.askOpen === false;
      return [ok,
        '#worldEventBox z=' + L.boxZ + ' (開=' + L.boxOpen + ')'
        + ' / #skillCheckOverlay z=' + L.panelZ
        + ' / #worldEnterAsk z=' + L.askZ + ' / #worldTitle z=' + L.titleZ
        + ' / 中央の最前面=' + JSON.stringify(L.topId) + ' (パネル内=' + L.topInPanel + ')'
        + ' / __world.askOpen()=' + L.askOpen + ' (⛔ true なら #worldEnterAsk を流用している)'];
    }],

  ['1d', '[器] compact (390x844) でイベントの器が画面内に収まる (fitsX / fitsY) — '
    + '⭐ **6 件すべて**を順に開いて測る (1 件だけだと残りのはみ出しを永久に見逃す)。'
    + '⛔ 中身を隠して「収まった」ことにしていないか (scrollHeight vs clientHeight) と'
    + '選択肢 2 つの矩形も同じ assert の視野に入れる',
    (m) => {
      const x = m.box;
      if (!x) return [false, '器の観測が無い'];
      const cards = x.cards || [];
      if (!cards.length) return [false, '器を 1 件も開けていない (ROAD_EVENTS.open が false)'];
      if (!x.pre || !x.pre.compact)
        return [false, 'compact になっていない (viewport '
          + x.viewport.width + 'x' + x.viewport.height + ')'];
      const bad = [];
      let minSlackX = Infinity, minSlackY = Infinity;
      for (const c of cards) {
        const why = [];
        if (!c.opened || !c.isOpen) why.push('開かない');
        if (!c.rect || c.rect.w <= 0 || c.rect.h <= 0) why.push('矩形が無い');
        else {
          const sx = Math.min(c.rect.x, c.vw - c.rect.right);
          const sy = Math.min(c.rect.y, c.vh - c.rect.bottom);
          minSlackX = Math.min(minSlackX, sx);
          minSlackY = Math.min(minSlackY, sy);
          if (sx < -0.5) why.push('fitsX 違反 x=' + c.rect.x.toFixed(1)
            + ' right=' + c.rect.right.toFixed(1) + ' vw=' + c.vw);
          if (sy < -0.5) why.push('fitsY 違反 y=' + c.rect.y.toFixed(1)
            + ' bottom=' + c.rect.bottom.toFixed(1) + ' vh=' + c.vh);
        }
        if (c.clipY > 1 || c.clipX > 1)
          why.push('中身が器からはみ出して隠れている clipX=' + c.clipX + ' clipY=' + c.clipY);
        if (c.nBtns !== 2) why.push('選択肢が ' + c.nBtns + ' 個 (二択でない)');
        for (const q of (c.btnRects || [])) {
          if (q.x < -0.5 || q.right > c.vw + 0.5 || q.y < -0.5 || q.bottom > c.vh + 0.5)
            why.push('選択肢が画面外: ' + JSON.stringify(String(q.label).slice(0, 10)));
        }
        if (why.length) bad.push(c.id + ' → ' + why.join(' / '));
      }
      return [bad.length === 0,
        'viewport ' + x.viewport.width + 'x' + x.viewport.height
        + ' (compact=' + x.pre.compact + ') / 測った器 ' + cards.length + ' 件'
        + ' / 画面端までの最小余白 X=' + (isFinite(minSlackX) ? minSlackX.toFixed(1) : '—')
        + 'px Y=' + (isFinite(minSlackY) ? minSlackY.toFixed(1) : '—') + 'px'
        + ' / 最大の器 ' + (cards.reduce((a, c) => (c.rect && c.rect.h > a) ? c.rect.h : a, 0)).toFixed(1) + 'px'
        + (bad.length ? ' / ⛔ ' + bad.join('  |  ') : '')];
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
    ['0c', '決定論: ?roadseed=4242 で 2 回走らせて、発火した停留所の列が完全に一致',
      '⛔ ?roadseed が未実装 → 項目 3'],
  ]],
  ['§1 器 (残り) — 依頼書 §8', [
    ['1a', 'イベント表示中は #worldEventBox が可視で、__world.askOpen() は false のまま'
      + ' (⛔ #worldEnterAsk を使っていない)',
      '⛔ **発火**が未実装 → 項目 3 (器そのものは (1c)(1d) が測っている)'],
    ['1b', '拠点 (site) へ「着いた」タップではイベントが 1 件も出ない'
      + ' (母集団ガード = 拠点へ着いたタップが 1 件以上)', '⛔ 発火が未実装 → 項目 3'],
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
      mark('§0 装置 / §1 器 — 搭載 (0a) / 写経 (0b) / 母集団 (0d) / 表と地形 (0e) / 層 (1c) / compact (1d)');
      const m = {};
      m.boot = await measureBoot(browser, PORT, errs, {});
      /* ⭐ (0b) は **配信バイト**を見る (⛔ DOM ではない —— 写経は DOM に出ないことがある)。 */
      m.served = (await httpGet('http://localhost:' + PORT + PAGE_PATH)).body;
      /* ⭐ 実操作 (実クリックで歩く) の観測。(0d) が読む。
         ⚠ ここが一番時間を食う (最大 16 タップ x 歩き)。 */
      m.play = await measurePlay(browser, PORT, errs, {});
      /* ⭐ 器の観測 —— compact (390x844) で 6 件を順に開き、層と矩形を測る ((1c)(1d))。 */
      m.box = await measureBox(browser, PORT, errs, { viewport: { width: 390, height: 844 } });
      for (const key of ['0a', '0b', '0d', '0e', '1c', '1d']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }
      if (m.boot) {
        console.log('       [記録] <script src> の並び:');
        console.log('         ' + m.boot.scriptSrcs.join(' → '));
        console.log('       [記録] SkillCheck.CHECKS: '
          + (m.boot.checkKeys ? m.boot.checkKeys.join(' / ') : '(無し)'));
        console.log('       [記録] SkillCheck.DC_TIERS: ' + JSON.stringify(m.boot.dcTiers));
        console.log('       [記録] 器とシーム: '
          + '#worldEventBox=' + m.boot.hasEventBox
          + ' / window.ROAD_EVENTS=' + m.boot.roadEventsModule
          + ' / __world.roadEvent=' + m.boot.hasRoadEventSeam + ' (⛔ 項目 3 で生える)');
      }
      if (m.boot && m.boot.roadEvents) {
        const R = m.boot.roadEvents;
        console.log('       [記録] イベント表 (⛔ 数字は直書きせずページから数えた):');
        for (const e of R.events) {
          const yes = (e.choices || []).filter(c => c.check)[0];
          console.log('         ' + e.id.padEnd(20) + ' ' + String(e.terrain).padEnd(9)
            + ' ' + String(e.checkKey).padEnd(14) + ' dc=' + String(e.dc).padEnd(7)
            + ' 「' + e.title + '」 二択=' + (e.choices || []).length
            + ' 判定つき=' + (yes ? 1 : 0)
            + ' 成功文≠失敗文=' + (yes ? (yes.success !== yes.fail) : '—'));
        }
        console.log('       [記録] 発生率 (⛔ 受入条件は具体値を縛らない = 遊んで動かすレバー): '
          + JSON.stringify(R.rates));
        const cnt = {};
        R.stops.forEach(id => { const t = R.terrainOf[id]; cnt[t] = (cnt[t] || 0) + 1; });
        console.log('       [記録] 地形割り (停留所 ' + R.stops.length + ' 件): '
          + Object.keys(cnt).map(t => t + ':' + cnt[t]).join(' '));
        console.log('       [記録] ROAD_EVENTS の API: ' + JSON.stringify(R.api));
      }
      if (m.box) {
        console.log('       [記録] 器の層 (⛔ 105 / 20 / 10 はページから読んだ値): '
          + JSON.stringify(m.box.layer));
        console.log('       [記録] compact ' + m.box.viewport.width + 'x' + m.box.viewport.height
          + ' の器の矩形 (⛔ 期待値ではない。読み解き用):');
        for (const c of (m.box.cards || [])) {
          console.log('         ' + c.id.padEnd(20)
            + (c.rect ? (' ' + c.rect.w.toFixed(1) + ' x ' + c.rect.h.toFixed(1)
              + ' @ (' + c.rect.x.toFixed(1) + ',' + c.rect.y.toFixed(1) + ')') : ' (矩形なし)')
            + '  選択肢 ' + c.nBtns + ' 個'
            + '  はみ出し clipX=' + c.clipX + ' clipY=' + c.clipY);
        }
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
          /* ⭐ (0b) が読む配信バイト。安いので毎回採る —— 採り忘れると
             「配信バイトが読めていない」で機械的に赤くなり、欠陥の検出と区別できない。 */
          m.served = (await httpGet('http://localhost:' + port + PAGE_PATH)).body;
          /* ⭐ (0d) / (1a)(1b) / §3 / §4 を狙う変異は **実操作の観測**が無いと
             「実操作の観測が無い」で機械的に赤くなり、欠陥を検出したのか装置が
             欠けているのか読めなくなる。⛔ 片方だけにしない。
             ⚠ 実操作は 1 本あたり数十秒。必要な変異でだけ採る。
             ⚠ (1c)(1d) は器の観測 (measureBox) —— 実操作ではない。混ぜない。 */
          const tg = MUTATIONS[k].targets;
          const needsPlay = tg.some(t => t === '0d' || t === '1a' || t === '1b' || /^[34]/.test(t));
          const needsBox = tg.some(t => t === '1c' || t === '1d');
          if (needsPlay) m.play = await measurePlay(browser, port, negErrs, {});
          if (needsBox) {
            m.box = await measureBox(browser, port, negErrs,
              { viewport: { width: 390, height: 844 } });
          }
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
