#!/usr/bin/env node
/*
 * verify_world_steps.js — ワールドマップ「歩みの刻み」(#40) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-01_world-walk-steps.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§6 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる (手本 = tools/verify_world_map.js)。
 *
 * ■ 項目 1 (このコミット) で実際に測れるもの — **データ層だけ**
 *     (0z) 装置   … WORLD_MAP に #40 の 7 つの公開シグネチャが揃っている
 *     (0a) 母集団 … WORLD_MAP.STEPS が 0 件でなく、STEP_MAX_PX が数値として読める
 *                   ⭐⭐⭐ これが無いと §1 が全部空振りで永久緑になる
 *     (0b) 2 経路 … ドライバが**独立に計算した** expectSteps(NODES, EDGES, cap) の
 *                   id 集合と座標が、ページの STEPS と 1 件残らず一致 (0.01px 以内)
 *                   ⛔ cap はページの WORLD_MAP.STEP_MAX_PX から読む。**320 を直書きしない**
 *     (1a) 刻み   … walkEdges() の全区間長が STEP_MAX_PX 以下 (母集団 >= EDGES.length も同居)
 *     (1b) 線上   … どの刻み点も元エッジの線分上 (点と線分の距離 <= 0.5px)
 *     (1c) 当たり … どの刻み点も最寄りの NODES から 44px より離れている
 *     (1d) 恒等   … {nodesFP, edges, sites} の sha1 が 876c5f6336f96811
 *     (9a) 事故   … 測定ページで pageerror / console.error が出ていない
 *
 * ■ 項目 2 が足したもの — **画面のマーカー** (measureSteps() = DOM の 2 経路目)
 *     (0c) 装置   … .worldStep の DOM 件数が STEPS と一致し、**1 枚も .worldNode を着ていない**
 *                   ⚠ 着せると verify_world_map.js:736/:1187 と verify_quest_walk.js:547 が誤爆する
 *     (2a) 位置   … マーカーの画面座標が STEPS の座標 x zoom と 2px 以内
 *                   ⭐ getBoundingClientRect から採る (実装の clientFromWorld とは **別経路**)
 *     (2b) 非侵襲 … 点線 <line> は EDGES.length 本のまま (⛔ 刻み点で分割していない)
 *     (2c) 押せる … 各マーカー中心の elementFromPoint が自分自身か子孫
 *     (2d) 非干渉 … マーカーの矩形が 7 枚の .worldSign のどれとも 1px も重ならない
 *   ⚠⚠ (2a)(2b)(2c)(2d) は **マーカーが 0 枚だと自明に真**になるので、
 *      各 assert の中で母集団 (検査した件数) を必ず見る。(0c) が件数そのものを縛る。
 *
 * ■ ⭐⭐⭐ 測定は **本番で配信される `/world.html` の上で行う**
 *   (world.html が js/world-map.js を読むので window.WORLD_MAP はそのまま取れる)。
 *   ⛔ 自前ハーネスで js/world-map.js だけを載せない — 本番ページだけが壊れているケースを
 *      永久に緑と報告するため (verify_world_map.js が項目 2 で畳んだのと同じ理由)。
 *
 * ■ ⭐⭐⭐ 空振りを防ぐ仕掛け
 *   - (0b) は **ドライバ側で刻み点を計算し直す**。ページの STEPS をそのまま期待値にしない
 *     (材料は WORLD_MAP.NODES / EDGES / STEP_MAX_PX という「実装が読んでいるのと同じ生データ」
 *      だけにして、**割り算はドライバが自分でやる** = 写経どうしの突き合わせにならない)。
 *   - (1a) は「全部 <= cap」なので **母集団が空でも緑になる**。だから同じ assert の中で
 *     「区間数 >= EDGES.length」まで見る (#39 の教訓)。
 *   - (1d) は verify_quest_walk.js の (5a) と **同じ式**をここへ同居させたもの。
 *     ⭐ 2 本で縛るので、片方のドライバだけを直して通す逃げが効かない。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   刻み点マーカーの色 / 大きさ / 形・PX_PER_MS (歩く速さ)・ランダムイベントの中身・
 *   **刻みの上限値そのもの (320px)**。(1a)(0b) は必ずページから読んだ cap と比較する。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   ⚠ 項目 1 では **器だけ**。変異 12 本は **項目 4 の担当** = 全部 PENDING で正直に出す。
 *
 *   mutate       | 注入する欠陥                                           | 赤くなるべき節    | 状態
 *   nosteps      | STEPS を空オブジェクトにする                            | (0a)(1a)(2a)      | PENDING
 *   fullwalk     | path.slice(0, 1) を path に戻す (今日の姿)              | (3a)(3b)(3c)(6b)  | PENDING
 *   handcoord    | STEPS を EDGES から生成せず手書き座標表にし 8px ずらす   | (0b)(1b)          | PENDING
 *   nodemut      | 刻み点を WORLD_MAP.NODES へ注入する                     | (1d)(5c)          | PENDING
 *   linemut      | 点線 <line> を刻み点で分割する                           | (2b)              | PENDING
 *   stepclass    | 刻み点マーカーに .worldNode クラスを着せる               | (0c)              | PENDING
 *   hopnone      | 遠い行き先では 1px も動かない (隣接だけ押せる)           | (3a)(3c)          | PENDING
 *   pathswap     | findPath 自体を findWalkPath へ差し替える                | (5a)              | PENDING
 *   retreatdead  | ?walkstep=0 を無視する                                  | (6a)(6c)          | PENDING
 *   retreatkills | 撤退時に STEPS のデータごと空にする (撤退のしすぎ)       | (6d)              | PENDING
 *   fireevent    | 刻み点到着で確認ダイアログを開く (器に中身を入れる)      | (4c)              | PENDING
 *   arrivedup    | walkPath の中からフックを呼び 1 ホップで 2 回鳴らす       | (4b)              | PENDING
 *
 *   ⚠ 変異アンカーは **部分文字列一致**で、配信スナップショット中に **ちょうど 1 箇所**
 *     ヒットしなければ **exit 3 でドライバごと死ぬ** (0 件でも 2 件以上でも空振りするため)。
 *   ⭐ アンカーに選んだ行は**整形し直さない**。
 *   ⭐ 変異が空振りしたら、**変異のほうを直す** (受入条件を弱めない)。
 *
 * ⚠ ポート 9560 (+1..+12 が --negative 用)。`grep -rn "arg('port'" tools/*.js` の数え上げで
 *   空きを実測済み (最大は verify_darkvision の 9540 で、変異 12 本でも 9552 まで)。
 *
 * 使い方:
 *   node tools/verify_world_steps.js               # 受入条件 (素の配信)
 *   node tools/verify_world_steps.js --negative    # 負のコントロール (赤くならなければ exit 1)
 *   node tools/verify_world_steps.js --mutate nosteps   # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');            // (1d) の恒等ハッシュ

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '9560'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (項目 4 が中身を入れる。⚠ 今は器だけ = 全部 impl: false)
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
// ⚠⚠ world.html は **ディスク上 CRLF**、js/world-map.js と tools/*.js は **LF** (2026-09-01 実測)。
//    アンカーは行内文字列にすること (改行をまたがない)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  nosteps: { impl: false, file: 'js/world-map.js', targets: ['0a', '1a', '2a'],
    why: '項目 4 の担当 — STEPS を空オブジェクトにする' },
  fullwalk: { impl: false, file: 'world.html', targets: ['3a', '3b', '3c', '6b'],
    why: '項目 4 の担当 — path.slice(0, 1) を path へ戻す (今日の姿)' },
  handcoord: { impl: false, file: 'js/world-map.js', targets: ['0b', '1b'],
    why: '項目 4 の担当 — STEPS を EDGES から生成せず手書き座標表にして 1 点だけ 8px ずらす' },
  nodemut: { impl: false, file: 'js/world-map.js', targets: ['1d', '5c'],
    why: '項目 4 の担当 — 刻み点を WORLD_MAP.NODES へ注入する (依頼書 §2-2 の罠 A)' },
  linemut: { impl: false, file: 'world.html', targets: ['2b'],
    why: '項目 4 の担当 — 点線 <line> を刻み点で分割する' },
  stepclass: { impl: false, file: 'world.html', targets: ['0c'],
    why: '項目 4 の担当 — 刻み点マーカーに .worldNode クラスを着せる (依頼書 §2-4)' },
  hopnone: { impl: false, file: 'world.html', targets: ['3a', '3c'],
    why: '項目 4 の担当 — 遠い行き先では 1px も動かない (隣接だけ押せる)' },
  pathswap: { impl: false, file: 'js/world-map.js', targets: ['5a'],
    why: '項目 4 の担当 — findPath 自体を findWalkPath へ差し替える (既存 API を汚す)' },
  retreatdead: { impl: false, file: 'world.html', targets: ['6a', '6c'],
    why: '項目 4 の担当 — ?walkstep=0 を無視する' },
  retreatkills: { impl: false, file: 'world.html', targets: ['6d'],
    why: '項目 4 の担当 — 撤退時に STEPS のデータごと空にする (撤退のしすぎ)' },
  fireevent: { impl: false, file: 'world.html', targets: ['4c'],
    why: '項目 4 の担当 — 刻み点到着で確認ダイアログを開く (器に中身を入れる)' },
  arrivedup: { impl: false, file: 'world.html', targets: ['4b'],
    why: '項目 4 の担当 — walkPath の中からフックを呼び 1 ホップで 2 回鳴らす' },
};
const MUT_ORDER = ['nosteps', 'fullwalk', 'handcoord', 'nodemut', 'linemut', 'stepclass',
  'hopnone', 'pathswap', 'retreatdead', 'retreatkills', 'fireevent', 'arrivedup'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_SERVED = MUT_IMPL.filter(k => !MUTATIONS[k].driver);
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
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
        let u = decodeURIComponent(req.url.split('?')[0]);
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

/* (1c) 刻み点と拠点の当たり判定が重ならない下限。⭐ .worldNode は 44px 角 (world.html の CSS)。
 *  ⚠ 2026-09-01 実測の最小は lake_n__lakeside@1 → mine の 172.3px なので余裕がある。 */
const NODE_HIT_PX = 44;
/* (0b) ドライバ計算とページの STEPS の座標一致の許容差。⭐ 同じ式なので本来は完全一致。 */
const COORD_EPS = 0.01;
/* (1b) 刻み点が元エッジの線分から離れてよい距離。 */
const ON_LINE_EPS = 0.5;
/* (1a) 浮動小数の丸めぶんだけ許す (等分なので理論上はちょうど cap 以下)。 */
const LEN_EPS = 1e-6;

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ ドライバ側の独立計算 ((0b) の 2 経路目)
//   ⛔ ページの STEPS をそのまま期待値にしない。⛔ 320 を直書きしない (cap は引数)。
// ══════════════════════════════════════════════════════════════════════════════
function expectSteps(NODES, EDGES, cap) {
  const out = [];
  for (const [a, b] of EDGES) {
    const na = NODES[a], nb = NODES[b];
    if (!na || !nb) continue;
    const d = Math.hypot(nb.x - na.x, nb.y - na.y);
    const k = Math.max(1, Math.ceil(d / cap));
    for (let i = 1; i < k; i++) {
      const t = i / k;
      out.push({ id: `${a}__${b}@${i}`, x: na.x + (nb.x - na.x) * t, y: na.y + (nb.y - na.y) * t });
    }
  }
  return out;
}
/* 点 p と線分 ab の距離。(1b) 用。 */
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 (⭐ 素でも変異でも **この同じ関数**を回す)
// ══════════════════════════════════════════════════════════════════════════════
async function measure(browser, port, errs, opts) {
  opts = opts || {};
  const m = { port: port };
  const page = await browser.newPage();
  const tag = '[:' + port + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + (opts.query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);

  /* ⭐ 返すのは **本番のデータ / 本番の関数が出した値**だけ。⛔ 期待値を混ぜない。 */
  m.map = await page.evaluate(() => {
    const WM = window.WORLD_MAP;
    const fn = (k) => typeof WM[k];
    const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
    return {
      W: WM.W, H: WM.H,
      nodes: JSON.parse(JSON.stringify(WM.NODES)),
      edges: JSON.parse(JSON.stringify(WM.EDGES)),
      sites: JSON.parse(JSON.stringify(WM.SITES)),
      /* ── #40 の派生レイヤ ── */
      stepMaxPx: WM.STEP_MAX_PX,
      stepMaxType: typeof WM.STEP_MAX_PX,
      steps: WM.STEPS ? JSON.parse(JSON.stringify(WM.STEPS)) : null,
      walkNodes: fn('walkNodes') === 'function' ? safe(() => JSON.parse(JSON.stringify(WM.walkNodes())), null) : null,
      walkEdges: fn('walkEdges') === 'function' ? safe(() => JSON.parse(JSON.stringify(WM.walkEdges())), null) : null,
      sig: {
        STEP_MAX_PX: typeof WM.STEP_MAX_PX, STEPS: typeof WM.STEPS,
        stepsOfEdge: fn('stepsOfEdge'), walkNodes: fn('walkNodes'), walkEdges: fn('walkEdges'),
        walkNeighbors: fn('walkNeighbors'), findWalkPath: fn('findWalkPath'),
      },
      /* (1d) の恒等ハッシュの材料。⛔ ドライバへ写経せず毎回ここから引く
         (式は tools/verify_quest_walk.js:520 / :1511 の (5a) と 1 文字違わず同じ)。 */
      nodesFP: Object.keys(WM.NODES).map(id => {
        const n = WM.NODES[id];
        return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—');
      }),
      edgesFP: WM.EDGES.map(e => e[0] + '__' + e[1]),
    };
  });
  await page.close();
  return m;
}

/* ⭐ 画面の実測 (項目 2)。⛔ measure() と分けてある理由 = こちらは **DOM の矩形と命中先**
 *   しか採らない (データ層と混ぜると、どちらが壊れて赤いのか読めなくなる)。
 *   ⚠⚠ 座標は getBoundingClientRect から採る = 実装の clientFromWorld とは **別経路**。
 *      同じ式を 2 回書くと写経どうしの照合になり、ズレを永久に検出できない。
 *   ⚠ 呼ぶのは cleared 焼き込み装置 (browser.newPage のラップ) を仕掛けた **後**。
 *      でないと札が 2 枚になり (2d) の母集団が壊れる。
 *   ⚠ #worldStage は transform-origin: 0 0 なので「ステージ矩形の左上 + world 座標 x zoom」で
 *      クライアント座標になる (world.html:129 で実測)。 */
async function measureSteps(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.query || '') + ' dom] ';
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

  const d = await page.evaluate(() => {
    const WM = window.WORLD_MAP;
    const stage = document.getElementById('worldStage').getBoundingClientRect();
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, w: r.width, h: r.height };
    };
    /* ⭐ 刻み点マーカー。⛔ セレクタは .worldStep だけ = 「.worldNode を着ていない」を
       別の assert が測れるように、ここでは className をそのまま持ち帰る。 */
    const marks = Array.from(document.querySelectorAll('.worldStep')).map(el => {
      const r = rectOf(el);
      const cx = r.l + r.w / 2, cy = r.t + r.h / 2;
      const hit = document.elementFromPoint(cx, cy);
      return {
        id: el.getAttribute('data-step'), domId: el.id, cls: el.className,
        rect: r, cx: cx, cy: cy,
        /* ⚠ closest は自分自身も見る = .worldNode を着せた瞬間に true になる (変異 stepclass)。 */
        inNode: el.closest('.worldNode') !== null,
        onScreen: cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight,
        hitOk: !!hit && (hit === el || el.contains(hit)),
        hitDesc: hit ? (hit.id || hit.className || hit.tagName) : 'null',
      };
    });
    /* 札。⚠ 所有者は verify_quest_walk.js:547 と同じ式 (sg.closest('.worldNode')) で引く。 */
    const signs = Array.from(document.querySelectorAll('.worldSign')).map(sg => {
      const owner = sg.closest('.worldNode');
      const r = rectOf(sg);
      return { node: owner ? owner.getAttribute('data-node') : null, l: r.l, t: r.t, w: r.w, h: r.h };
    });
    const svg = document.getElementById('worldRoutes');
    const lines = svg ? Array.from(svg.querySelectorAll('line')) : [];
    return {
      zoom: window.__world.zoom(),
      stage: { left: stage.left, top: stage.top },
      steps: WM.STEPS ? JSON.parse(JSON.stringify(WM.STEPS)) : {},
      edgeCount: WM.EDGES.length,
      siteCount: Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'site').length,
      marks: marks, signs: signs,
      lineCount: lines.length,
      lineEdges: lines.map(l => l.getAttribute('data-edge')),
      nodeElCount: document.querySelectorAll('.worldNode').length,
      /* ⚠ 参考値。__world の読み窓そのものは (0d) が縛る (項目 3 の担当)。 */
      stepIdsType: typeof window.__world.stepIds,
      stepIds: (typeof window.__world.stepIds === 'function') ? window.__world.stepIds() : null,
    };
  });
  await page.close();
  return d;
}

/* ⭐ 装置: 測定タブへ「6 シナリオ クリア済み」を焼く (手本 = verify_world_map.js の同名装置)。
 *   ヘッドレスの素のプロファイルは localStorage["dragonfighters.cleared"] が未設定 =
 *   解放は廃坑だけなので、何も仕込まないと札が **2 枚**になり、
 *   項目 2 の (2d)「7 枚の .worldSign と重ならない」の母集団が壊れる。
 *   ⛔ 6 本を直書きしない。⭐ 出所は WORLD_MAP.SITES のキー (これ自体
 *      verify_world_map.js の (4s) が配信中の tavern.html と機械照合している)。 */
async function readScenarioIds(browser, port) {
  const page = await browser.newPage();
  await page.goto('http://localhost:' + port + PAGE_PATH, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP', { timeout: 20000 });
  const ids = await page.evaluate(() => Object.keys(window.WORLD_MAP.SITES));
  await page.close();
  return ids;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (実装済み)  ⭐ [key, 見出し, m => [bool, detail]]
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  // ── §0 装置 ────────────────────────────────────────────────────────────────
  ['0z', '[装置] WORLD_MAP に #40 の 7 つの公開シグネチャが揃っている'
    + ' (STEP_MAX_PX / STEPS / stepsOfEdge / walkNodes / walkEdges / walkNeighbors / findWalkPath)',
    m => {
      const s = m.map.sig;
      const ok = s.STEP_MAX_PX === 'number' && s.STEPS === 'object'
        && s.stepsOfEdge === 'function' && s.walkNodes === 'function' && s.walkEdges === 'function'
        && s.walkNeighbors === 'function' && s.findWalkPath === 'function';
      return [ok, JSON.stringify(s)];
    }],
  ['0a', '[装置] WORLD_MAP.STEPS が 0 件でなく、STEP_MAX_PX が数値として読める'
    + ' ⭐⭐⭐ これが無いと §1 が全部空振りで永久緑になる',
    m => {
      const st = m.map.steps;
      const n = st ? Object.keys(st).length : 0;
      const capOk = m.map.stepMaxType === 'number' && isFinite(m.map.stepMaxPx) && m.map.stepMaxPx > 0;
      return [n > 0 && capOk,
        'STEPS=' + n + ' 件' + (n ? ' (' + Object.keys(st).join(', ') + ')' : '')
        + '  STEP_MAX_PX=' + m.map.stepMaxPx + ' (' + m.map.stepMaxType + ')'];
    }],
  ['0b', 'ドライバが独立に計算した expectSteps(NODES, EDGES, cap) の id 集合と座標が'
    + ' ページの STEPS と 1 件残らず一致する (座標は 0.01px 以内)'
    + ' ⛔ cap はページから読む (320 を直書きしない)',
    m => {
      if (m.map.stepMaxType !== 'number') return [false, 'STEP_MAX_PX が数値でない: ' + m.map.stepMaxType];
      const cap = m.map.stepMaxPx;
      const want = expectSteps(m.map.nodes, m.map.edges, cap);
      const got = m.map.steps || {};
      const wantIds = want.map(s => s.id).slice().sort();
      const gotIds = Object.keys(got).slice().sort();
      if (JSON.stringify(wantIds) !== JSON.stringify(gotIds)) {
        return [false, '⛔ id 集合違い  ドライバ=' + JSON.stringify(wantIds)
          + ' / ページ=' + JSON.stringify(gotIds) + '  (cap=' + cap + ')'];
      }
      let worst = 0, who = '-';
      for (const w of want) {
        const g = got[w.id];
        const e = Math.max(Math.abs(g.x - w.x), Math.abs(g.y - w.y));
        if (e > worst) { worst = e; who = w.id; }
      }
      return [wantIds.length > 0 && worst <= COORD_EPS,
        '一致 ' + wantIds.length + ' 件 (cap=' + cap + ' をページから読んだ)'
        + '  座標の最悪差 ' + worst.toFixed(4) + 'px (' + who + ')'
        + '  内訳: ' + want.map(s => s.id + '(' + s.x + ',' + s.y + ')').join(' ')];
    }],
  ['0c', '刻み点マーカーの DOM 件数が STEPS の件数と一致し、**1 枚も .worldNode を着ていない**'
    + ' (el.closest(".worldNode") === null)'
    + ' ⚠ 着せると verify_world_map.js:736/:1187 と verify_quest_walk.js:547 が誤爆する (依頼書 §2-4)',
    m => {
      const d = m.dom;
      if (!d) return [false, '⛔ DOM の観測が無い (measureSteps を呼んでいない)'];
      const want = Object.keys(d.steps || {}).slice().sort();
      const got = d.marks.map(x => x.id).slice().sort();
      const idsOk = JSON.stringify(want) === JSON.stringify(got);
      const inNode = d.marks.filter(x => x.inNode);
      /* ⚠ closest だけでなく **クラス文字列**も見る (親子関係と着衣は別の壊れ方)。 */
      const wearing = d.marks.filter(x => /(^|\s)worldNode(\s|$)/.test(x.cls || ''));
      return [want.length > 0 && d.marks.length === want.length && idsOk
        && inNode.length === 0 && wearing.length === 0,
        'マーカー ' + d.marks.length + ' 枚 / STEPS ' + want.length + ' 件  id 一致=' + idsOk
        + '  .worldNode の子孫=' + inNode.length + ' 枚 / worldNode クラス着用=' + wearing.length + ' 枚'
        + '  class=' + JSON.stringify(d.marks.map(x => x.cls))
        + '  domId=' + JSON.stringify(d.marks.map(x => x.domId))
        + '  (参考 __world.stepIds=' + d.stepIdsType + ' ' + JSON.stringify(d.stepIds) + ')'
        + (idsOk ? '' : '  ⛔ want=' + JSON.stringify(want) + ' / got=' + JSON.stringify(got))];
    }],

  // ── §2 見た目 ──────────────────────────────────────────────────────────────
  ['2a', '刻み点マーカーの**画面座標**が STEPS の座標 x zoom と 2px 以内'
    + ' ⭐ getBoundingClientRect から採る (実装の clientFromWorld とは **別経路**)',
    m => {
      const d = m.dom;
      if (!d) return [false, '⛔ DOM の観測が無い'];
      /* ⚠⚠ 母集団ガード。0 枚だと「全部 2px 以内」が自明に真で永久緑になる。 */
      if (d.marks.length === 0) return [false, '⛔ 母集団 0 枚 (マーカーが 1 つも描かれていない)'];
      const bad = [];
      let worst = -1, who = '-';
      for (const k of d.marks) {
        const s = d.steps[k.id];
        if (!s) { bad.push(k.id + ': STEPS に無い id'); continue; }
        const ex = d.stage.left + s.x * d.zoom, ey = d.stage.top + s.y * d.zoom;
        const e = Math.max(Math.abs(k.cx - ex), Math.abs(k.cy - ey));
        if (e > worst) { worst = e; who = k.id; }
        if (e > 2) bad.push(k.id + '=' + e.toFixed(2) + 'px (期待 ' + ex.toFixed(1) + ',' + ey.toFixed(1)
          + ' / 実測 ' + k.cx.toFixed(1) + ',' + k.cy.toFixed(1) + ')');
      }
      return [bad.length === 0,
        d.marks.length + ' 枚を検査 (zoom=' + d.zoom.toFixed(4) + ')  最悪差 '
        + worst.toFixed(3) + 'px (' + who + ') / 許容 2px'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['2b', '⭐⭐⭐ 点線 <line> の本数が **EDGES.length のまま** (⛔ 点線を刻み点で分割していない)'
    + ' ⚠ data-edge に刻み点 id ("@") が混ざっていないことも同じ assert で見る',
    m => {
      const d = m.dom;
      if (!d) return [false, '⛔ DOM の観測が無い'];
      /* ⚠ 母集団: 刻み点が 1 つも無ければ「分割していない」は自明に真。 */
      if (d.marks.length === 0) return [false, '⛔ 母集団 0 枚 (刻み点が無いので「分割していない」が自明)'];
      const dirty = d.lineEdges.filter(e => e === null || String(e).indexOf('@') >= 0);
      return [d.edgeCount > 0 && d.lineCount === d.edgeCount && dirty.length === 0,
        '<line>=' + d.lineCount + ' 本 / EDGES=' + d.edgeCount + ' 本'
        + '  刻み点入り or data-edge 無しの線=' + dirty.length + ' 本'
        + '  (母集団: 刻み点マーカー ' + d.marks.length + ' 枚)'
        + (dirty.length ? '  ⛔ ' + JSON.stringify(dirty.slice(0, 6)) : '')];
    }],
  ['2c', '各刻み点マーカーの中心の elementFromPoint が **自分自身か子孫** (= 実際に押せる)'
    + ' ⚠ 点線 SVG は pointer-events: none なので SVG の子にすると必ずここが赤くなる (罠 B)',
    m => {
      const d = m.dom;
      if (!d) return [false, '⛔ DOM の観測が無い'];
      if (d.marks.length === 0) return [false, '⛔ 母集団 0 枚 (マーカーが 1 つも描かれていない)'];
      const off = d.marks.filter(k => !k.onScreen);
      const bad = d.marks.filter(k => !k.hitOk);
      return [off.length === 0 && bad.length === 0,
        d.marks.length + ' 枚を検査  画面外=' + off.length + ' 枚'
        + '  命中先: ' + d.marks.map(k => k.id + '→' + k.hitDesc + '(' + (k.hitOk ? 'self' : '⛔他人') + ')').join(' ')];
    }],
  ['2d', '刻み点マーカーの矩形が **7 枚の .worldSign** のどれとも 1px も重ならない'
    + ' ⚠ 札 7 枚の母集団 (cleared 焼き込み) が立っていることを同じ assert で確かめる',
    m => {
      const d = m.dom;
      if (!d) return [false, '⛔ DOM の観測が無い'];
      if (d.marks.length === 0) return [false, '⛔ 母集団 0 枚 (マーカーが 1 つも描かれていない)'];
      /* ⚠⚠ 母集団ガード 2 本立て: 札の実数と、データ側の site ノード数の両方を見る。
         ⛔ 0 枚でも「重ならなかった」で緑になる書き方をしない。 */
      if (d.siteCount !== 7 || d.signs.length !== 7) {
        return [false, '⛔ 母集団が壊れている: .worldSign=' + d.signs.length + ' 枚 / site ノード='
          + d.siteCount + ' 件 (どちらも 7 のはず)  札の所有者='
          + JSON.stringify(d.signs.map(s => s.node))];
      }
      const bad = [];
      let nearest = Infinity, who = '-';
      for (const k of d.marks) {
        for (const s of d.signs) {
          const ox = Math.min(k.rect.l + k.rect.w, s.l + s.w) - Math.max(k.rect.l, s.l);
          const oy = Math.min(k.rect.t + k.rect.h, s.t + s.h) - Math.max(k.rect.t, s.t);
          if (ox > 0 && oy > 0) {
            bad.push(k.id + ' x ' + s.node + '=' + ox.toFixed(1) + 'x' + oy.toFixed(1) + 'px');
          }
          const gap = Math.max(-ox, -oy);      /* 離れていれば正 = 隙間 */
          if (gap < nearest) { nearest = gap; who = k.id + ' / ' + s.node; }
        }
      }
      return [bad.length === 0,
        'マーカー ' + d.marks.length + ' 枚 x 札 ' + d.signs.length + ' 枚を総当たり'
        + '  最小の隙間 ' + nearest.toFixed(1) + 'px (' + who + ')'
        + (bad.length ? '  ⛔ 重なり=' + bad.join(' ') : '')];
    }],

  // ── §1 刻みのデータ ────────────────────────────────────────────────────────
  ['1a', '⭐⭐⭐ 細分化後の全区間長が STEP_MAX_PX 以下'
    + ' (⚠ 母集団が空でないこと = 区間数 >= EDGES.length も同じ assert で見る)',
    m => {
      const we = m.map.walkEdges, G = m.map.walkNodes;
      if (!we || !G) return [false, 'walkEdges() / walkNodes() が読めない'];
      if (m.map.stepMaxType !== 'number') return [false, 'STEP_MAX_PX が数値でない'];
      const cap = m.map.stepMaxPx;
      const bad = [], lens = [];
      for (const [a, b] of we) {
        const na = G[a], nb = G[b];
        if (!na || !nb) { bad.push(a + '->' + b + ':座標が引けない'); continue; }
        const d = Math.hypot(nb.x - na.x, nb.y - na.y);
        lens.push({ e: a + '->' + b, d: d });
        if (d > cap + LEN_EPS) bad.push(a + '->' + b + '=' + d.toFixed(1) + 'px');
      }
      lens.sort((p, q) => q.d - p.d);
      const popOk = we.length >= m.map.edges.length;
      return [bad.length === 0 && popOk && we.length > 0,
        '区間 ' + we.length + ' 本 (EDGES ' + m.map.edges.length + ' 本以上=' + popOk + ')'
        + '  最長 ' + (lens[0] ? lens[0].d.toFixed(1) + 'px (' + lens[0].e + ')' : '-')
        + ' / 上限 ' + cap + 'px'
        + (bad.length ? '  ⛔ 超過=' + bad.join(' ') : '')];
    }],
  ['1b', 'どの刻み点も必ず元エッジの線分上にある (点と線分の距離 <= 0.5px)'
    + ' ⭐「描く線と歩けるデータが同一」の機械証明',
    m => {
      const st = m.map.steps, N = m.map.nodes;
      if (!st) return [false, 'STEPS が読めない'];
      const ids = Object.keys(st);
      if (ids.length === 0) return [false, '⛔ 母集団 0 件 (刻み点が 1 つも無い)'];
      const bad = [];
      let worst = 0, who = '-';
      for (const id of ids) {
        const s = st[id];
        /* ⭐ 元エッジは 2 経路で引く: ① 実装が持つ on ② id の "<a>__<b>@<i>" の解析
              → 食い違ったらその時点で赤 (id と on が別物になっていないことの担保)。 */
        const parsed = id.split('@')[0].split('__');
        const on = Array.isArray(s.on) ? s.on : null;
        if (!on || on.length !== 2 || on[0] !== parsed[0] || on[1] !== parsed[1]) {
          bad.push(id + ':on=' + JSON.stringify(on) + ' が id の解析結果 ' + JSON.stringify(parsed) + ' と違う');
          continue;
        }
        const na = N[on[0]], nb = N[on[1]];
        if (!na || !nb) { bad.push(id + ':元ノードが NODES に無い'); continue; }
        const d = distToSegment(s.x, s.y, na.x, na.y, nb.x, nb.y);
        if (d > worst) { worst = d; who = id; }
        if (d > ON_LINE_EPS) bad.push(id + '=' + d.toFixed(3) + 'px');
      }
      return [bad.length === 0,
        ids.length + ' 件を検査  線分からの最悪距離 ' + worst.toFixed(4) + 'px (' + who + ')'
        + ' / 上限 ' + ON_LINE_EPS + 'px'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['1c', 'どの刻み点も最寄りの NODES から 44px より離れている (当たり判定が重ならない)'
    + ' ⚠ 2026-09-01 実測の最小は lake_n__lakeside@1 → mine の 172.3px',
    m => {
      const st = m.map.steps, N = m.map.nodes;
      if (!st) return [false, 'STEPS が読めない'];
      const ids = Object.keys(st);
      if (ids.length === 0) return [false, '⛔ 母集団 0 件 (刻み点が 1 つも無い)'];
      let mind = Infinity, who = '-';
      const bad = [];
      for (const id of ids) {
        const s = st[id];
        let best = Infinity, bestId = '-';
        for (const nid of Object.keys(N)) {
          const d = Math.hypot(s.x - N[nid].x, s.y - N[nid].y);
          if (d < best) { best = d; bestId = nid; }
        }
        if (best < mind) { mind = best; who = id + ' → ' + bestId; }
        if (best <= NODE_HIT_PX) bad.push(id + '→' + bestId + '=' + best.toFixed(1) + 'px');
      }
      return [bad.length === 0,
        ids.length + ' 件を検査  最小 ' + mind.toFixed(1) + 'px (' + who + ')'
        + ' / 下限 ' + NODE_HIT_PX + 'px'
        + (bad.length ? '  ⛔ ' + bad.join(' ') : '')];
    }],
  ['1d', '⭐⭐⭐ [恒等] {nodesFP, edges, sites} の sha1 が 876c5f6336f96811'
    + ' (NODES 14 件 / EDGES 14 本 / SITES 6 件)'
    + ' ⚠ tools/verify_quest_walk.js:1511 の (5a) と **同じ式**を同居させて 2 本で縛る',
    m => {
      const md = m.map;
      /* ⭐ 固定するのは **件数・キー・kind・座標・enter の有無・エッジの並び・SITES** だけ。
         ⛔ label / desc は入れない (それは verify_world_map.js の (7a) が
            配信中の tavern.html と照合して縛っている = 二重に持たない)。
         ⚠ ここが赤くなったら「地図のデータを触った」= #40 依頼書 §11 の禁止事項を踏んだということ。
         ⭐⭐⭐ 刻み点は **派生レイヤ** (STEPS) に居るので、正しく実装されている限りここは動かない。 */
      const canon = JSON.stringify({ nodes: md.nodesFP, edges: md.edgesFP, sites: md.sites });
      const got = crypto.createHash('sha1').update(canon).digest('hex').slice(0, 16);
      const WANT = '876c5f6336f96811';   /* 2026-08-26 実測 (NODES 14 / EDGES 14 / SITES 6) */
      const counts = md.nodesFP.length === 14 && md.edgesFP.length === 14
        && Object.keys(md.sites).length === 6;
      return [got === WANT && counts,
        'NODES ' + md.nodesFP.length + ' 件 / EDGES ' + md.edgesFP.length
        + ' 本 / SITES ' + Object.keys(md.sites).length + ' 件'
        + '  sha1(先頭16)=' + got + ' (固定値 ' + WANT + ')'
        + (got === WANT ? '' : '  ⛔ 実測の中身= ' + canon)];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// まだ実装されていない受入条件 (⛔ 件数から隠さない = pending() で必ず出す)
//   ⭐ 項目 2〜4 がここを 1 行ずつ ASSERTS へ移す。最終項目の完了条件 = PENDING 0。
// ══════════════════════════════════════════════════════════════════════════════
const PENDINGS = [
  ['§0 装置 (残り)', [
    ['0d', '__world に stepIds / lastArrival / arrivalCount / walkStepOff / stepMaxPx / clientFromPoint が揃っている',
      '項目 3 (world.html の読み窓) 待ち  ⭐ stepIds は項目 2 で着地済み'],
  ]],
  ['§3 1 タップ = 1 刻み (本体)', [
    ['3a', '⭐⭐⭐ phlan から temple の札を 1 回だけ押す → 着かない。かつ findWalkPath の先頭 1 点に立つ',
      '項目 3 (world.html の 1 ホップ化) 待ち'],
    ['3b', '同じ札を押し続けると着く。押した回数が findWalkPath("phlan","temple").length と一致',
      '項目 3 待ち'],
    ['3c', '⭐ 1 タップで進んだ距離が stepMaxPx() 以下 (全停留所を起点に測る)',
      '項目 3 待ち'],
    ['3d', '刻み点マーカーを直接タップ → 1 ホップでそこへ着く',
      '項目 3 待ち'],
    ['3e', '線の無い座標 (64,544) / (1440,960) をタップ → 1px も動かない',
      '項目 3 待ち'],
  ]],
  ['§4 到着フック (ランダムイベントの器)', [
    ['4a', 'lastArrival() が {at, dest, kind, arrived} を返し、刻み点なら kind="step" / arrived=false',
      '項目 3 待ち'],
    ['4b', 'arrivalCount() が 1 ホップにつきちょうど 1 増える',
      '項目 3 待ち'],
    ['4c', '⛔ イベントは 1 件も起きない (ダイアログ / 遷移が発生しない)',
      '項目 3 待ち'],
  ]],
  ['§5 恒等 (非退行)', [
    ['5a', '⭐⭐⭐ findPath / neighbors が細分化前のまま (刻み点 id を 1 つも含まない)',
      '項目 3 待ち (データ層は着地済みだが、押し口の測定と同居させる)'],
    ['5b', 'enter を持つノードは今も phlan ただ 1 つ',
      '項目 3 待ち'],
    ['5c', '札 (.worldSign) の DOM がちょうど 7 枚 (刻み点に札が生えていない)',
      '⭐ (2d) が既に .worldSign 7 枚 + site ノード 7 件を母集団ガードとして実測しているので、'
      + 'm.dom.signs / m.dom.siteCount をそのまま使えば移すだけで済む'],
  ]],
  ['§6 撤退', [
    ['6a', '?walkstep=0 → 刻み点マーカーが 0 枚、temple の札を 1 回押すと着く (今日の姿)',
      '項目 4 待ち'],
    ['6b', '⭐⭐⭐ 素のアームの対照を同じ assert に同居 — 撤退なしなら 1 回では着かない',
      '項目 4 待ち'],
    ['6c', 'クエリを外して開き直しても撤退が効いている (sessionStorage へ写っている)',
      '項目 4 待ち'],
    ['6d', '⭐ 撤退のしすぎを測る — ?walkstep=0 でも STEPS は同じ件数・同じ座標で存在する',
      '項目 4 待ち'],
  ]],
];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_worldsteps_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  MUT_SERVED.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

  console.log('=== verify_world_steps.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (変異は 1 本も実装されていない = 項目 4 の担当)'));

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
    const CLEARED_ALL = await readScenarioIds(browser, PORT);
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
      mark('§0 装置 — 母集団と 2 経路');
      const m = await measure(browser, PORT, errs, {});
      /* ⭐ DOM の観測は別タブ・別関数。⛔ 期待値はここでも混ぜない (assert 側が突き合わせる)。 */
      m.dom = await measureSteps(browser, PORT, errs, {});
      for (const key of ['0z', '0a', '0b', '0c']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      for (const p of PENDINGS[0][1]) pending('(' + p[0] + ') ' + p[1], p[2]);
      if (MUT_TODO.length === 0) {
        check('(0e) [装置] 変異アンカーの実装漏れが 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      } else {
        pending('(0e) [装置] 変異アンカーの実装漏れが 0 件 (' + MUT_ORDER.length + ' 本)',
          '⛔ 未実装=' + MUT_TODO.join(' / ') + ' → 項目 4 の担当');
      }

      mark('§1 刻みのデータ');
      for (const key of ['1a', '1b', '1c', '1d']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      console.log('       [記録] 刻み点 (WORLD_MAP.STEPS):');
      for (const id of Object.keys(m.map.steps || {})) {
        const s = m.map.steps[id];
        console.log('         ' + id + '  (' + s.x + ', ' + s.y + ')  kind=' + s.kind
          + '  on=' + JSON.stringify(s.on));
      }
      console.log('       [記録] 細分化後の区間長 (walkEdges / 上位 5 件):');
      {
        const G = m.map.walkNodes || {};
        const rows = (m.map.walkEdges || []).map(([a, b]) => ({
          e: a + ' -> ' + b,
          d: (G[a] && G[b]) ? Math.hypot(G[a].x - G[b].x, G[a].y - G[b].y) : NaN,
        })).sort((p, q) => q.d - p.d);
        for (const r of rows.slice(0, 5)) {
          console.log('         ' + r.e + '  ' + r.d.toFixed(1) + 'px  ('
            + (r.d / 64).toFixed(2) + ' マス)');
        }
        console.log('         … 全 ' + rows.length + ' 区間 / 上限 ' + m.map.stepMaxPx + 'px');
      }

      mark('§2 見た目 — 位置 / 点線を割らない / 押せる / 札に被らない');
      for (const key of ['2a', '2b', '2c', '2d']) { const a = ASSERT_OF[key]; const r = a[2](m); check('(' + a[0] + ') ' + a[1], r[0], r[1]); }
      console.log('       [記録] 刻み点マーカー (.worldStep) の実描画:');
      for (const k of (m.dom ? m.dom.marks : [])) {
        console.log('         ' + k.id + '  class="' + k.cls + '"  id=' + k.domId
          + '  中心 (' + k.cx.toFixed(1) + ', ' + k.cy.toFixed(1) + ')'
          + '  ' + k.rect.w.toFixed(1) + 'x' + k.rect.h.toFixed(1) + 'px'
          + '  命中先=' + k.hitDesc);
      }
      if (m.dom) {
        console.log('       [記録] 札 (.worldSign) ' + m.dom.signs.length + ' 枚: '
          + m.dom.signs.map(s => s.node + '(' + s.w.toFixed(0) + 'x' + s.h.toFixed(0) + ')').join(' '));
        console.log('       [記録] 点線 <line> ' + m.dom.lineCount + ' 本 / .worldNode '
          + m.dom.nodeElCount + ' 枚 / zoom ' + m.dom.zoom.toFixed(4));
      }

      for (const [title, rows] of PENDINGS.slice(1)) {
        mark(title + ' (項目 2〜4 の担当)');
        for (const p of rows) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      mark('§9 ページエラー');
      check('(9a) 測定ページで pageerror / console.error が出ていない', errs.length === 0, errs.slice(0, 6).join(' | '));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
            pure.body.split(MUTATIONS[k].to).length - 1 === 0 && mut.body.split(MUTATIONS[k].to).length - 1 === 1, f);
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length, '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }

        mark('欠陥を注入すると担当の節が赤くなること');
        for (const k of MUT_IMPL) {
          const negErrs = [];
          const port = MUTATIONS[k].driver ? PORT : PORT_OF[k];
          const m = await measure(browser, port, negErrs, {});
          /* ⚠ DOM 側の assert ((0c)(2a)-(2d)) も変異で赤くなることを測るので、
             素と同じ 2 経路をここでも採る。⛔ 片方だけにすると m.dom が undefined で
             「DOM の観測が無い」= どの変異でも赤 = 何も検出していないのに緑に見える。 */
          m.dom = await measureSteps(browser, port, negErrs, {});
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
