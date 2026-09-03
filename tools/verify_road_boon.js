#!/usr/bin/env node
/*
 * verify_road_boon.js — 「街道の実り」(#47 Phase 2) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-03_road-harvest.md` の §8 受入条件を機械で測る。
 * 流用元 = `tools/verify_road_events.js` (#45)。同じ world.html を **実クリックで歩き**、
 * 種つき乱数 ?roadseed=N で決定論にし、配信スナップショットへの実行時注入で変異を載せる。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§4 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる (手本 = tools/verify_road_events.js)。
 *
 * ■ ⚠⚠⚠ ポート = 9790 (⛔ 依頼書 §4-1 の「9770」は誤りなので採らない)
 *   `tools/verify_road_events.js` は base **9760** + 変異 **14 本**で、`--negative` 時に
 *   `PORT + 1 + i` = **9761〜9774 を占有する**。⛔ **9770 はそのレンジのど真ん中**で、
 *   両方を並走させると片方のサーバが EADDRINUSE で落ちる (2026-09-03 実測して訂正)。
 *   9775〜9849 は完全に空き (次に使われているのは verify_enemy_name_label の 9850) なので、
 *   本ドライバは base **9790** / `--negative` で **9791〜9804** (変異 14 本) を使う。
 *   `--port N` で上書き可。
 *
 * ■ 項目 1 (このコミット) で実際に測れるもの — **装置の土台だけ**
 *     (0d) 母集団 … 決定論の種で world.html を歩き、器の二択を **実クリックで押して**
 *                 「① 判定なし / ② 判定つき失敗 / ③ 判定つき成功」の 3 本の腕が
 *                 それぞれ 1 回以上成立する。
 *                 ⭐⭐⭐ **これが立たないと §1 (1a) の 3 経路が全部空振りで永久緑**になる。
 *                 ⭐ BOONS がまだ無くても測れる (js/road-events.js の EVENTS と
 *                   js/skill-check.js の d20 だけで足りる) ので、項目 1 の唯一の実測。
 *     (9a) 事故  … 測定ページで pageerror / console.error が出ていない
 *
 * ■ 項目 2 以降で **自動的に有効になる** 3 本 (⛔ 後続がドライバへ 1 行も足さなくてよい)
 *     (0a) 表    … ROAD_EVENTS.BOONS のキー集合が EVENTS の id 集合の**部分集合**かつ 1 件以上
 *     (0b) 写経  … ⛔ world.html の **配信バイト**に BOONS の label が 1 つも出てこない
 *                 (文言の唯一の正は js/road-events.js。変異 copyboon が番人)
 *     (0c) 母集団 … 決定論の種で歩き切ったとき sessionStorage["dragonfighters.roadBoon"] が
 *                 **1 件以上**になる腕が存在する (⛔ 0 件だと (1a)(1c)(2a) が全部空振り)
 *   ⭐ この 3 本は **動的分岐**で書いてある —— `ROAD_EVENTS.BOONS` が未実装なら PENDING、
 *     生えた瞬間から測って PASS/FAIL する。⛔ 「まだ無いから緑」にはしない。
 *
 * ■ 項目 2〜4 が PENDINGS から ASSERTS へ移すもの
 *     §1 書き込み (街道側) … (1a)(1b)(1c)(1d)(1e)
 *     §2 消費と適用 (潜行側) … (2a)(2b)(2c)(2d)(2e)(2f)
 *     §3 恒等 (非退行) … (3a)
 *     §4 撤退 ?roadboon=0 … (4a)(4b)(4c)
 *
 * ■ 測り方の規律 (依頼書 §8「計測機構」/ ⚠ 既存ドライバの写経では動かない点)
 *   ⚠ **ARM_MS (260ms) を 2 回待つ** —— 導入で 1 回、結末で 1 回。待たないとゴースト
 *     クリック除け (js/road-events.js makeBtn の armAt) で押しが無視される。
 *   ⚠ **?roadseed=N を必ず付ける** —— 素の一巡で 1 件も出ない確率が約 7% ある (#45 実測)。
 *   ⚠ **器を閉じるクリックはタップ数に数えない** (#45 の (3b)(4b) と数え方を合わせる)。
 *   ⚠ **?autoplay はカメラ測定台に使えない** (focusCameraOn が丸ごと止まる)。ただし
 *     SkillCheck は `global.__autoplay || opts.auto` で UI を出さず即解決するので
 *     (js/skill-check.js:481)、判定の成否だけを大量に振りたい腕ではその経路を使ってよい。
 *     ⛔ 本ドライバは使っていない —— d20 は Math.random を固定して振り分ける。
 *   ⛔ goToPoint() / goToNode() を page.evaluate から呼ばない (当たり判定が壊れていても
 *     永久に緑になる)。⭐ 実クリックだけで歩く。
 *   ⛔ ROAD_EVENTS.close() を evaluate から呼ばない (押し口が壊れていても永久に緑)。
 *
 * ■ ⛔ 触らないもの
 *   本ドライバは **読むだけ**。index.html / world.html / js/road-events.js / tavern.html を
 *   1 バイトも変更しない (変異は配信スナップショットへの実行時注入で、ディスクは触らない)。
 *
 * ■ 使い方
 *     node tools/verify_road_boon.js                    受入条件
 *     node tools/verify_road_boon.js --negative         負のコントロール (変異が赤くなるか)
 *     node tools/verify_road_boon.js --mutate nogrant   1 本だけ変異を載せて素の判定を流す
 *     node tools/verify_road_boon.js --headful          目で見る
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
/* ⛔ 9770 は verify_road_events の --negative レンジ (9761-9774) と衝突するので 9790 にした。 */
const PORT = parseInt(arg('port', '9790'), 10);

/* ══ #47 の唯一のキーと、label のホワイトリスト ══════════════════════════════
   ⛔ ドライバの定数として持つ (⚠ ページから読むと「キー名を間違えた実装」を検出できない)。
   ⚠ 正規表現は依頼書 §2-3 のもの —— index.html の appendLog は innerHTML 代入で、
     escape ヘルパが 1 つも無いので、入口でここを通す規律になっている。 */
const BOON_KEY = 'dragonfighters.roadBoon';
const BOON_LABEL_OK = /^[^\r\n<>&"']{1,24}$/;
const BOON_KINDS = ['provision', 'vigilance'];

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール) —— 依頼書 §8「負のコントロール」の 14 本
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
// ⚠⚠ world.html / index.html は **ディスク上 CRLF**、js/*.js と tools/*.js は **LF**。
//    アンカーは行内文字列にすること (改行をまたがない)。
// ⭐ 項目 1 の時点では **本体が 1 バイトも無い**ので 14 本すべて impl: false = PENDING。
//   ⛔ 未実装分を表から隠さない —— pending() で毎回出す。
//   ⚠ 項目 4 が impl: true にして from / to のアンカー文字列を埋める。そのとき
//     **PENDINGS からも外して ASSERTS へ移す** —— 片方だけだと件数が合わなくなる。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  nogrant: {
    impl: false, file: 'js/road-events.js', targets: ['0c', '1a'],
    why: 'boonOf が常に null を返す (恩恵を 1 件も配らない)',
  },
  /* ⭐⭐⭐ 依頼書 §2-2 の罠 A そのものの再現。これが赤くならない装置は、
     「既存 golden 3 本 (verify_world_steps:774 / world_map:683 / quest_walk:831 の
      `(ev.choices||[]).filter(x => !x.check)[0]`) を巻き込むかどうか」を 1 つも検出できていない。 */
  dismissboon: {
    impl: false, file: 'js/road-events.js', targets: ['1a', '3a'],
    why: '⭐⭐⭐ 罠 A の再現 — boonOf から !choice.check の門番を外す (判定なしの枝でも恩恵)',
  },
  failgrant: {
    impl: false, file: 'js/road-events.js', targets: ['1a'],
    why: '!outcome.success の門番を外す (判定に負けても恩恵)',
  },
  taintlabel: {
    impl: false, file: 'js/road-events.js', targets: ['2e'],
    why: 'BOONS の label を <img src=x onerror=1> に差し替える (罠 B の再現)',
  },
  emptylabel: {
    impl: false, file: 'js/road-events.js', targets: ['1b'],
    why: 'BOONS の label を空文字にする',
  },
  nocap: {
    impl: false, file: 'world.html', targets: ['1c'],
    why: 'pushRoadBoon の while (list.length > ROAD_BOON_MAX) を消す (上限が効かない)',
  },
  noconsume: {
    impl: false, file: 'index.html', targets: ['2a'],
    why: 'consumeRoadBoon の removeItem を落とす (1 度で消えない)',
  },
  nogrow: {
    impl: false, file: 'index.html', targets: ['2b'],
    why: '糧の maxHp += 3 を += 0 にする (持ち込んでも何も起きない)',
  },
  alwaysvigil: {
    impl: false, file: 'index.html', targets: ['2c'],
    why: 'applyRoadVigilance の roadVigilance = false を消す (2 戦目以降も初手を潰す)',
  },
  copyboon: {
    impl: false, file: 'world.html', targets: ['0b'],
    why: 'BOONS の label を world.html のコメントへ写経する',
  },
  localwrite: {
    impl: false, file: 'world.html', targets: ['1d'],
    why: 'pushRoadBoon を localStorage へ書き換える (world.html の 0 件を崩す)',
  },
  retreatwrite: {
    impl: false, file: 'world.html', targets: ['4a'],
    why: 'world 側の撤退門番 (ROAD_BOON_ON ? … : null) を外す (?roadboon=0 でも書く)',
  },
  retreatconsume: {
    impl: false, file: 'index.html', targets: ['4b'],
    why: 'index 側の撤退門番より前に removeItem を出す (撤退なのに状態を触る)',
  },
  boxleak: {
    impl: false, file: 'js/road-events.js', targets: ['1e'],
    why: 'close() / paint() で #worldEventBoon をクリアしない (前の結末の残骸が残る)',
  },
};

const MUT_ORDER = ['nogrant', 'dismissboon', 'failgrant', 'taintlabel', 'emptylabel', 'nocap',
  'noconsume', 'nogrow', 'alwaysvigil', 'copyboon', 'localwrite', 'retreatwrite',
  'retreatconsume', 'boxleak'];
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
/* ⭐ §2 (消費と適用) は潜行側 = index.html を開いて測る (項目 3 の担当)。 */
const PAGE_INDEX = '/index.html';

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
//   ⭐ ASSERTS の述語は **3 値**を返せる: [true|false, detail] のほか [null, detail] で
//     PENDING。⛔ 「実装がまだ無いから true」にはしない (それが永久緑の作り方)。
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
// 種 (決定論のシーム) — ⭐ **ドライバの定数**。⛔ ページから読まない。
// ⚠⚠⚠ 確率のままだとドライバは間欠で赤くなる (素の一巡で 1 件も出ない確率が約 7%)。
//   下の 2 つは #45 が mulberry32 をオフラインで回して選んだ種で、実走行の発火列が決まっている。
//     SEED_MAIN … pier → fort (対象停留所 5 / うち 4 つが swamp) で **複数件**発火する
//     SEED_NEAR … **2 タップ目**の cross_n (coast) で必ず 1 件発火する
//                 = 二択を押す測定を 2 タップで済ませられる
// ⚠ 行き先に phlan を選ばないこと —— enter を持つただ 1 つのノードで、着いた瞬間に
//   location.href で town.html へ飛び、以後の測定が全部死ぬ。
// ⚠ 押した行き先へ「着いた」タップでは入場が優先されて出来事は出ない。だから
//   DEST_NEAR は cross_n ではなく **その先の swamp**。
// ══════════════════════════════════════════════════════════════════════════════
const SEED_MAIN = 282;
const SEED_NEAR = 7;
const DEST_MAIN = 'fort';
const DEST_NEAR = 'swamp';
/* party の出所。⛔ world.html は storage へ 1 バイトも書かないのでドライバ側で用意する。 */
const PARTY4 = ['warrior', 'dwarf', 'elf', 'cleric'];
/* ⭐ js/skill-check.js の d20 は **Math.random 由来**で ?roadseed の PRNG とは別系統。
   成功と失敗の**両方**を引くにはここを固定するしかない
   (⛔ js/skill-check.js は 1 バイトも触らない / ⛔ opts.auto も ?autoplay も使わない)。 */
const D20_WIN = 0.999;    /* → d20 = 20 (クリティカル成功) */
const D20_LOSE = 0.0;     /* → d20 = 1  (ファンブル失敗) */

// ══════════════════════════════════════════════════════════════════════════════
// 観測 A) 素のページ — 表と搭載
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
    const RE = window.ROAD_EVENTS;
    return {
      roadEventsModule: typeof RE,
      /* ⭐ #47 の器の受け皿 (項目 2 が world.html へ足す)。(1e) がここから読む。 */
      hasBoonSlot: !!document.getElementById('worldEventBoon'),
      hasEventBox: !!document.getElementById('worldEventBox'),
      /* ⭐ 表は **実体から数える**。⛔ 6 / 2 をドライバへ直書きしない。 */
      roadEvents: (function () {
        if (!RE || !RE.EVENTS) return null;
        return {
          events: RE.EVENTS.map(function (e) {
            return { id: e.id, terrain: e.terrain, checkKey: e.checkKey, dc: e.dc, title: e.title };
          }),
          /* ⭐ #47 の恩恵表。⛔ 未実装なら **null のまま返す** (0 件と混同しない)。 */
          boonsType: typeof RE.BOONS,
          boons: (RE.BOONS && typeof RE.BOONS === 'object')
            ? (function () {
                const o = {};
                Object.keys(RE.BOONS).forEach(function (k) {
                  const b = RE.BOONS[k];
                  o[k] = { kind: b && b.kind, label: b && b.label };
                });
                return o;
              })()
            : null,
          api: { open: typeof RE.open, close: typeof RE.close, isOpen: typeof RE.isOpen,
                 showResult: typeof RE.showResult, boonOf: typeof RE.boonOf, armMs: RE.ARM_MS },
        };
      })(),
      /* ⭐ (4b) の材料 —— world 側の起動直後に roadBoon が残っていないこと。 */
      boonAtBoot: (function () {
        try { return sessionStorage.getItem('dragonfighters.roadBoon'); } catch (e) { return '(throw)'; }
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
const MAX_TAPS = 24;
const TAP_SETTLE_MS = 140;
const ARM_PAD_MS = 180;   /* ROAD_EVENTS.ARM_MS への上乗せ (#35 のゴーストクリック除け) */

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
        road: (typeof W.roadEvent === 'function') ? W.roadEvent() : null,
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

/* ── 街道の出来事の器を **本物の UI 経路で**畳む ──────────────────────────────
   ⛔ ROAD_EVENTS.close() を evaluate から呼ばない (押し口が壊れていても永久に緑になる)。
   ⚠ 選択肢は「1 番目」で決め打ちしない —— ROAD_EVENTS の choices[].check から引く。
   ⚠⚠ **ARM_MS を 2 回待つ** —— 導入の二択で 1 回、結末の「先へ進む」で 1 回。 */
async function eventState(page) {
  return safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    const box = document.getElementById('worldEventBox');
    const t = document.getElementById('worldEventTitle');
    const x = document.getElementById('worldEventText');
    /* ⭐ #47 の「携えた」の 1 行。(1e) が hidden / textContent の両方で見る。 */
    const bn = document.getElementById('worldEventBoon');
    return {
      open: !!(RE && typeof RE.isOpen === 'function' && RE.isOpen()),
      boxShow: !!(box && box.classList.contains('show')),
      display: box ? getComputedStyle(box).display : null,
      title: t ? t.textContent : null,
      text: x ? x.textContent : null,
      boonSlot: bn ? { found: true, hidden: !!bn.hidden, text: bn.textContent,
                       display: getComputedStyle(bn).display } : { found: false },
      btns: Array.prototype.slice.call(document.querySelectorAll('#worldEventBtns .worldEventBtn'))
        .map(b => b.textContent),
      askOpen: !!(window.__world && window.__world.askOpen()),
      current: (RE && typeof RE.current === 'function' && RE.current()) ? RE.current().id : null,
    };
  });
}
async function clickEventBtn(page, label) {
  const r = await safeEval(page, (lab) => {
    const bs = Array.prototype.slice.call(document.querySelectorAll('#worldEventBtns .worldEventBtn'));
    const b = lab ? bs.filter(x => x.textContent === lab)[0] : bs[0];
    if (!b) return null;
    const q = b.getBoundingClientRect();
    return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
  }, label || null);
  if (!r) return false;
  await page.mouse.click(Math.round(r.x), Math.round(r.y));
  return true;
}
/* mode: 'none' = 判定なしの選択肢を押す / 'check' = 判定つきの選択肢を押す */
async function resolveOpenEvent(page, mode, armWait) {
  const st0 = await eventState(page);
  if (!st0 || !st0.open) return null;
  const rec = { mode: mode, event: st0.current, title: st0.title, intro: st0.text,
    btns: st0.btns, ok: false, why: '' };
  /* ⚠ ①ARM_MS の 1 回目。待たないと二択の押しが armAt で無視される。 */
  await sleep(armWait);
  const label = await safeEval(page, (o) => {
    const RE = window.ROAD_EVENTS;
    const ev = (typeof RE.byId === 'function') ? RE.byId(o.id) : null;
    if (!ev) return null;
    const c = (ev.choices || []).filter(x => !!x.check === o.want)[0];
    return c ? c.label : null;
  }, { id: st0.current, want: mode === 'check' });
  rec.label = label;
  if (!label) { rec.why = '選択肢が引けない (ROAD_EVENTS.byId が null)'; return rec; }
  await clickEventBtn(page, label);
  if (mode === 'check') {
    try {
      await page.waitForFunction(
        "!!document.getElementById('skillCheckOverlay') && document.getElementById('skillCheckOverlay').classList.contains('show')",
        { timeout: 9000, polling: 60 });
      rec.panel = await safeEval(page, () => {
        const ov = document.getElementById('skillCheckOverlay');
        const rows = Array.prototype.slice.call(ov.querySelectorAll('.scRoster .scRow'));
        return { rows: rows.length,
          names: rows.map(r => ((r.querySelector('.scName') || {}).textContent || '').trim()) };
      });
    } catch (e) { rec.panel = null; rec.why += ' 判定パネルが出ない'; }
    /* AUTO_ROLL_MS(2000) → 演出 → RESULT_HOLD_MS(3600) で自動的に閉じる。⛔ 尺は触らない。 */
    try {
      await page.waitForFunction(
        "!document.getElementById('skillCheckOverlay') || !document.getElementById('skillCheckOverlay').classList.contains('show')",
        { timeout: 25000, polling: 100 });
    } catch (e) { rec.why += ' 判定が閉じない'; }
  }
  /* 結末の 1 文 + 「先へ進む」の 1 ボタンへ変わるのを待つ。 */
  try {
    await page.waitForFunction(
      "(function(){var b=document.getElementById('worldEventBtns');return !!b && b.children.length===1;})()",
      { timeout: 12000, polling: 80 });
  } catch (e) { rec.why += ' 結末が出ない'; }
  const st1 = await eventState(page);
  rec.resultTitle = st1 ? st1.title : null;
  rec.resultText = st1 ? st1.text : null;
  /* ⭐ (1e) の観測点 —— **結末が出ている瞬間**の「携えた」の 1 行。
     ⛔ 閉じた後に読むと必ず空になり、永久に緑/赤のどちらかへ張り付く。 */
  rec.boonSlotAtResult = st1 ? st1.boonSlot : null;
  rec.doneBtns = st1 ? st1.btns : null;
  rec.roadLast = await safeEval(page, () => {
    const W = window.__world;
    return (W && typeof W.roadEvent === 'function') ? W.roadEvent().last : null;
  });
  /* ⭐ 書き込みは finishRoadEvent の中で済んでいる = **器を閉じる前**に読める。 */
  rec.boonAtResult = await safeEval(page, (k) => {
    try { return sessionStorage.getItem(k); } catch (e) { return '(throw)'; }
  }, BOON_KEY);
  /* ⚠ ②ARM_MS の 2 回目。⛔ 器を閉じるこのクリックは「タップ数」に数えない。 */
  await sleep(armWait);
  await clickEventBtn(page, null);
  await sleep(200);
  const st2 = await eventState(page);
  rec.closed = !!(st2 && !st2.open);
  /* ⭐ (1e) の後半 —— 閉じたあとに残骸が残っていないか (変異 boxleak が番人)。 */
  rec.boonSlotAfterClose = st2 ? st2.boonSlot : null;
  rec.ok = !!(rec.resultText && rec.closed);
  return rec;
}

async function measurePlay(browser, port, errs, opts) {
  opts = opts || {};
  const seed = (opts.seed === undefined) ? SEED_MAIN : opts.seed;
  const dest = opts.dest || DEST_MAIN;
  const mode = opts.resolve || 'none';
  const query = '?roadseed=' + seed + (opts.extraQuery || '');
  const out = { seed: seed, dest: dest, mode: mode, query: query,
    taps: [], arrivals: [], events: [] };
  const page = await browser.newPage();
  const tag = '[:' + port + query + ' play] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  /* ⭐ party の出所を作る。⚠ localStorage はプロファイル共有なので、指定が無い走行では
     **明示的に消す** (前の走行の残りが次の走行の期待値を汚す)。
     ⭐ #47 のキーも毎回消してから始める —— 前の腕が残した恩恵が「今回書かれた」に見える。 */
  await page.evaluateOnNewDocument((s) => {
    const K = 'dragonfighters.partyComposition';
    try { if (s.local) localStorage.setItem(K, JSON.stringify(s.local)); else localStorage.removeItem(K); } catch (e) {}
    try { if (s.session) sessionStorage.setItem(K, JSON.stringify(s.session)); } catch (e) {}
    try { if (s.seedBoon) sessionStorage.setItem(s.boonKey, s.seedBoon); else sessionStorage.removeItem(s.boonKey); } catch (e) {}
  }, { local: opts.local || null, session: opts.session || null,
       boonKey: BOON_KEY, seedBoon: opts.seedBoon || null });
  if (typeof opts.force === 'number') {
    await page.evaluateOnNewDocument((v) => { Math.random = function () { return v; }; }, opts.force);
  }
  await page.setViewport(opts.viewport || { width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + query,
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);

  /* ⭐⭐⭐ 器が **開いた瞬間** を同期で捕まえる (⛔ MutationObserver では間に合わない)。
     ⛔ これは「駆動」ではなく「計測」。歩くのは実クリックだけ。 */
  await page.evaluate(() => {
    window.__roadOpen = [];
    const RE = window.ROAD_EVENTS;
    if (!RE || typeof RE.open !== 'function') return;
    const orig = RE.open;
    RE.open = function (ev, cb) {
      const rec = { id: (ev && ev.id) || null, at: null, terrain: null,
        moving: !!(window.__world && window.__world.isMoving()) };
      try {
        const r = window.__world.roadEvent();
        rec.at = r.last ? r.last.at : null;
        rec.terrain = r.last ? r.last.terrain : null;
        rec.fired = r.fired;
      } catch (e) {}
      const ret = orig.apply(this, arguments);
      window.__roadOpen.push(rec);
      return ret;
    };
  });

  /* ⭐ 母集団 (way + step) を **ページの実体から**採る。⛔ 17 を直書きしない。 */
  out.pop = await page.evaluate(() => {
    const WM = window.WORLD_MAP;
    const ways = Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'way');
    const steps = Object.keys(WM.STEPS || {});
    const sites = Object.keys(WM.NODES).filter(k => WM.NODES[k].kind === 'site');
    return { ways: ways, steps: steps, sites: sites, ids: ways.concat(steps) };
  });
  out.start = await readPlay(page);
  /* ⚠ findWalkPath は **始点を含まない** = path.length がそのままホップ数。 */
  out.destPick = await safeEval(page, (d) => {
    const WM = window.WORLD_MAP, W = window.__world;
    const from = W.heroNode();
    return { from: from, dest: d, path: WM.findWalkPath(from, d), nodePath: WM.findPath(from, d) };
  }, dest);
  const armWait = ((await safeEval(page, () => (window.ROAD_EVENTS && window.ROAD_EVENTS.ARM_MS) || 0)) || 0)
    + ARM_PAD_MS;
  out.armWait = armWait;

  async function walkTo(target, bucket) {
    let lastNode = null;
    for (let i = 0; i < MAX_TAPS; i++) {
      const t = await tapPoint(page, target, target + ' を押す');
      bucket.push(t);
      if (!t.ok) break;
      if (t.after.last) out.arrivals.push(t.after.last);
      const st = await eventState(page);
      if (st && st.open) {
        const rec = await resolveOpenEvent(page, mode, armWait);
        if (rec) { rec.at = t.after.last ? t.after.last.at : null; out.events.push(rec); }
        if (!rec || !rec.closed) { t.stuck = true; break; }
        if (opts.stopAfterEvent) break;
      }
      if (t.after.node === target) break;
      if (t.after.node === lastNode) break;   /* 進まなくなった */
      lastNode = t.after.node;
    }
  }
  if (out.destPick && out.destPick.path && out.destPick.path.length) {
    await walkTo(dest, out.taps);
  }
  out.openLog = (await safeEval(page, () => window.__roadOpen || [])) || [];
  out.roadEnd = await safeEval(page, () => {
    const W = window.__world;
    return (W && typeof W.roadEvent === 'function') ? W.roadEvent() : null;
  });
  /* ⭐ #47 の本丸 —— 歩き切ったあとの sessionStorage。(0c)(1a)(1b)(1c)(4a) が読む。
     ⛔ 「あるか」だけでなく **JSON.parse できたか / 配列か / 何件か** まで採る。 */
  out.boon = await safeEval(page, (k) => {
    let raw = null;
    try { raw = sessionStorage.getItem(k); } catch (e) { raw = '(throw)'; }
    let list = null, parseOk = false;
    if (typeof raw === 'string' && raw !== '(throw)') {
      try { list = JSON.parse(raw); parseOk = true; } catch (e) { list = null; parseOk = false; }
    }
    /* ⭐ localStorage 側も採る —— 変異 localwrite が「向きを変えただけ」で緑にならないように。 */
    let lraw = null;
    try { lraw = localStorage.getItem(k); } catch (e) { lraw = '(throw)'; }
    return { raw: raw, list: list, parseOk: parseOk,
      n: Array.isArray(list) ? list.length : null, localRaw: lraw };
  }, BOON_KEY);
  out.end = await readPlay(page);
  await page.close();
  return out;
}

/* ⭐ SEED_NEAR + DEST_NEAR なら **2 タップ目**に必ず 1 件出るので、二択を押す測定は
   ここへ畳める (⛔ 8 ホップ歩いてから測る必要は無い)。
   ⭐ 返すのは play オブジェクトそのもの + `.pick` = 最初の出来事の記録。
     (⛔ 記録だけ返すと sessionStorage の観測が落ちて (0c) が測れなくなる) */
async function measureArm(browser, port, errs, o) {
  o = o || {};
  const p = await measurePlay(browser, port, errs, {
    seed: (o.seed === undefined) ? SEED_NEAR : o.seed,
    dest: o.dest || DEST_NEAR,
    resolve: o.resolve || 'check', stopAfterEvent: true,
    force: o.force, session: o.session || PARTY4, local: o.local || null,
    extraQuery: o.extraQuery || '',
  });
  p.pick = (p.events || [])[0] || null;
  if (!p.pick) {
    p.why = '2 タップで出来事が出なかった (種 ' + p.seed + ' / 行き先 ' + p.dest
      + ' / タップ ' + p.taps.length + ' 回 / 発火 ' + (p.roadEnd ? p.roadEnd.fired : '—') + ' 件)';
  }
  return p;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (実装済み)  ⭐ [key, 見出し, m => [bool|null, detail]]
//   ⭐ 述語が **null** を返したら PENDING (= 本体がまだ無いので測れない)。
//     ⛔ 「まだ無いから true」にはしない。
// ══════════════════════════════════════════════════════════════════════════════
const uniq = (a) => Array.from(new Set(a));
/* 発火した停留所の列 (器が開いた順)。⛔ 件数だけにしない。 */
const firedList = (p) => ((p && p.openLog) || []).map(o => String(o.at) + '#' + String(o.id));
/* ⭐ BOONS が生えているか。⛔ 「0 件」と「未実装」を混同しない (前者は FAILED / 後者は PENDING)。 */
function boonTable(m) {
  const b = m.boot;
  if (!b || !b.roadEvents) return { state: 'noModule' };
  const R = b.roadEvents;
  if (!R.boons) return { state: 'pending', boonsType: R.boonsType, boonOf: R.api.boonOf,
    nEvents: R.events.length };
  return { state: 'ok', boons: R.boons, keys: Object.keys(R.boons),
    ids: R.events.map(e => e.id), boonOf: R.api.boonOf };
}
const PEND_BOONS = (t) => '⏳ ROAD_EVENTS.BOONS がまだ無い (項目 2 が js/road-events.js へ足す)'
  + ' — typeof BOONS=' + t.boonsType + ' / typeof boonOf=' + t.boonOf
  + ' / EVENTS ' + t.nEvents + ' 件';

const ASSERTS = [
  ['0a', '[装置] ROAD_EVENTS.BOONS のキー集合が EVENTS の id 集合の **部分集合** かつ 1 件以上'
    + ' (⭐⭐⭐ これが無いと以降の全 assert が空振りで永久緑になる)',
    (m) => {
      const t = boonTable(m);
      if (t.state === 'noModule') return [false, 'window.ROAD_EVENTS が無い (js/road-events.js が未搭載)'];
      if (t.state === 'pending') return [null, PEND_BOONS(t)];
      const bad = t.keys.filter(k => t.ids.indexOf(k) < 0);
      const okFn = t.boonOf === 'function';
      return [t.keys.length >= 1 && bad.length === 0 && okFn,
        'BOONS ' + t.keys.length + ' 件 ' + JSON.stringify(t.keys)
        + ' / EVENTS ' + t.ids.length + ' 件 ' + JSON.stringify(t.ids)
        + ' / typeof boonOf=' + t.boonOf
        + (bad.length ? '  ⛔ EVENTS に無い id: ' + JSON.stringify(bad) : '  部分集合=true')
        + (okFn ? '' : '  ⛔ ROAD_EVENTS.boonOf が関数でない')];
    }],

  ['0b', '[装置] 恩恵の文言は js/road-events.js から引いている — world.html の **配信バイト**に'
    + ' BOONS の label が 1 つも出てこない (⛔ 写経の検出。変異 copyboon が番人)',
    (m) => {
      const t = boonTable(m);
      if (t.state === 'noModule') return [false, 'window.ROAD_EVENTS が無い'];
      if (t.state === 'pending') return [null, PEND_BOONS(t)];
      if (typeof m.served !== 'string' || !m.served.length)
        return [false, 'world.html の配信バイトを読めていない'];
      const all = t.keys.map(k => [k, t.boons[k] && t.boons[k].label]);
      /* ⛔ 短すぎる語は誤検出になるので 2 文字以上だけ見る。 */
      const checked = all.filter(s => typeof s[1] === 'string' && s[1].length >= 2);
      const hits = checked.filter(s => m.served.indexOf(s[1]) >= 0);
      /* ⭐⭐⭐ 母集団ガード —— 検索する文言が BOONS の全件ぶん揃っていなければ
         「出てこない」は**自明に真**。⛔ 空 label が黙って検索集合から抜けるのを殺す。 */
      const enough = checked.length >= 1 && checked.length === all.length;
      return [enough && hits.length === 0,
        'world.html 配信 ' + m.served.length + 'B / 検索した label ' + checked.length + '/'
        + all.length + ' 本 ' + JSON.stringify(checked.map(s => s[1]))
        + ' / 母集団ガード=' + enough
        + (hits.length
          ? '  ⛔ 写経ヒット ' + hits.length + ' 本: '
            + hits.map(s => s[0] + '=' + JSON.stringify(s[1])).join(' , ')
          : '  ヒット 0 本')];
    }],

  ['0c', '[母集団] 決定論の種で world.html を歩き切ったとき sessionStorage["' + BOON_KEY + '"] が'
    + ' **1 件以上**になる腕が存在する (⛔ 0 件だと (1a)(1c)(2a) が全部空振りする)',
    (m) => {
      const t = boonTable(m);
      if (t.state === 'noModule') return [false, 'window.ROAD_EVENTS が無い'];
      if (t.state === 'pending')
        return [null, PEND_BOONS(t) + ' → world.html の finishRoadEvent もまだ書かない'
          + ' (項目 2 が pushRoadBoon を足す)'];
      const p = m.armWin;
      if (!p) return [false, '成功アームの観測が無い'];
      if (!p.pick) return [false, '母集団: ' + (p.why || '出来事が 1 件も出なかった')];
      const won = !!(p.pick.roadLast && p.pick.roadLast.success === true);
      const b = p.boon || {};
      const why = [];
      if (!won) why.push('⛔ 母集団: 判定に成功していない (success=' + (p.pick.roadLast ? p.pick.roadLast.success : '—') + ')');
      if (b.raw === null || b.raw === undefined) why.push('⛔ キーが書かれていない');
      else if (!b.parseOk) why.push('⛔ JSON.parse できない: ' + JSON.stringify(String(b.raw).slice(0, 60)));
      else if (!Array.isArray(b.list)) why.push('⛔ 配列でない: ' + JSON.stringify(b.list));
      else if (b.list.length < 1) why.push('⛔ 0 件');
      return [why.length === 0,
        '種 ' + p.seed + ' / 行き先 ' + p.dest + ' / タップ ' + (p.taps || []).length + ' 回'
        + ' / 出来事 ' + JSON.stringify(p.pick.event) + ' 「' + String(p.pick.label).slice(0, 18) + '」'
        + ' success=' + (p.pick.roadLast ? p.pick.roadLast.success : '—')
        + ' / roadBoon=' + JSON.stringify(b.raw)
        + (why.length ? '  ' + why.join(' ') : '')];
    }],

  ['0d', '[母集団] 決定論の種で world.html を歩き、器の二択を **実クリックで押して** '
    + '① 判定なし / ② 判定つき失敗 / ③ 判定つき成功 の 3 本の腕がそれぞれ 1 回以上成立する'
    + ' (⭐⭐⭐ これが立たないと §1 (1a) の 3 経路が全部空振りで永久緑になる)',
    (m) => {
      const arms = [['① 判定なし', m.armNone, null], ['② 判定つき失敗', m.armLose, false],
        ['③ 判定つき成功', m.armWin, true]];
      const why = [], detail = [];
      for (const [tag, p, wantSuccess] of arms) {
        if (!p) { why.push('⛔ ' + tag + ' の観測が無い'); detail.push(tag + '=(観測なし)'); continue; }
        const bad = (p.taps || []).filter(t => !t.ok);
        if (!p.pick) {
          why.push('⛔ ' + tag + ': ' + (p.why || '出来事が出なかった'));
          detail.push(tag + '=(発火なし 発火' + (p.roadEnd ? p.roadEnd.fired : '—') + '件)');
          continue;
        }
        const got = p.pick.roadLast ? p.pick.roadLast.success : undefined;
        if (got !== wantSuccess) why.push('⛔ ' + tag + ': success=' + got + ' (期待 ' + wantSuccess + ')');
        if (!p.pick.closed) why.push('⛔ ' + tag + ': 器が閉じない' + (p.pick.why || ''));
        if (!p.pick.resultText) why.push('⛔ ' + tag + ': 結末の文が出ていない');
        if (bad.length) why.push('⛔ ' + tag + ': 失敗タップ ' + bad.length + ' 件 ' + bad[0].err);
        /* ⭐ 判定つきの腕は **パネルが実際に出た**ことまで見る
           (⛔ opts.auto / ?autoplay へ逃げていないことの証拠)。 */
        if (wantSuccess !== null && !(p.pick.panel && p.pick.panel.rows >= 1))
          why.push('⛔ ' + tag + ': 判定パネルのロスターが 0 行 (UI 経路を通っていない)');
        detail.push(tag + '=' + String(p.pick.event)
          + ' 「' + String(p.pick.label).slice(0, 14) + '」'
          + ' success=' + got + ' 閉=' + p.pick.closed
          + ' ロスター' + (p.pick.panel ? p.pick.panel.rows : '—') + '行'
          + ' タップ' + (p.taps || []).length + '回');
      }
      return [why.length === 0,
        '種 ' + SEED_NEAR + ' / 行き先 ' + DEST_NEAR + ' / d20 は Math.random 固定'
        + ' (勝=' + D20_WIN + ' 負=' + D20_LOSE + ')  ' + detail.join('  |  ')
        + (why.length ? '   ' + why.join(' ') : '')];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// まだ実装されていない受入条件 (⛔ 件数から隠さない = pending() で必ず出す)
//   ⭐ 後続の項目がここを 1 行ずつ ASSERTS へ移す。最終項目の完了条件 = PENDING 0。
//   ⛔ 空になっても配列ごと削除しないこと (削ると PENDING という 3 値そのものが消える)。
//   ⚠ ASSERTS へ移したら **PENDINGS から外し、本体の配線 (§n の配列) と NEEDS へキーを足す**
//     —— 全部やらないと件数が合わなくなる。
// ══════════════════════════════════════════════════════════════════════════════
const PENDINGS = [
  ['§1 書き込み (街道側) — 依頼書 §8 §1', [
    ['1a', '⭐⭐⭐ 恩恵は「判定に勝った枝」だけ — ① 判定なしの枝 (既存 golden 3 本が押す枝) を'
      + '押すと roadBoon が **無い** / ② 判定つきで失敗すると **無い** / ③ 判定つきで成功すると **1 件**',
      '3 経路を (0d) の 3 本の腕でそのまま突き合わせる。⚠ 母集団ガード = ①②③ がそれぞれ 1 回以上成立'
      + ' (= (0d) が緑であること)。変異 dismissboon / failgrant / nogrant が番人'],
    ['1b', '中身の形 — 配列で、各要素の kind が provision|vigilance のいずれか、'
      + 'label が /^[^\\r\\n<>&"\']{1,24}$/ を満たし **空でない**、event が EVENTS の id',
      'measurePlay の out.boon.list を 1 要素ずつ検める。変異 emptylabel が番人'],
    ['1c', '上限 3 件 — 4 件目を得ると最古が落ちて長さ 3 のまま',
      '⭐ 恩恵つきの結末を 4 回踏む腕を作るか、seedBoon で 3 件を仕込んでから 1 件足す。'
      + '⛔ 上限の数 (3) そのものは縛らない (world / index を同時に変えれば緑でよい)。変異 nocap が番人'],
    ['1d', '⛔ 恒等 — world.html の配信バイトの localStorage.setItem = 0 / localStorage.removeItem = 0 /'
      + ' sessionStorage.removeItem = 1 (= verify_road_events (2c) と同じ数を本チケットでも独立に張る)',
      '配信バイトを正規表現で数える。⚠ 着手前の実測は lset=0 / lrm=0 / rm=1 (依頼書 §2-4)。'
      + '⛔ setItem は数えない (#47 で 3 → 4 に増えるのが仕様)。変異 localwrite が番人'],
    ['1e', '器に「携えた」の 1 行が出る (#worldEventBoon が hidden でなく空でない)。'
      + 'かつ **恩恵の無い結末では hidden かつ空**',
      'resolveOpenEvent が採る boonSlotAtResult (結末が出ている瞬間) と boonSlotAfterClose'
      + ' (閉じたあと) の両方で見る。変異 boxleak が番人'],
  ]],
  ['§2 消費と適用 (潜行側) — 依頼書 §8 §2', [
    ['2a', 'index.html の起動で **キーが消える** (起動後 getItem が null)',
      '⭐ sessionStorage へ値を置いてから index.html を開き、既存のブリッジ越しに読む。変異 noconsume が番人'],
    ['2b', '糧 — 全員 (頭 + allies) の maxHp が **+3×件数**、かつ hp === maxHp',
      '⭐ 2 経路 = 「キーを置いた腕」と「置かない腕」の **差分**で見る (⛔ 絶対値を写経しない)。変異 nogrow が番人'],
    ['2c', '備え — **最初の交戦**で交戦中の敵が stunned >= 1、かつ **2 度目の交戦では 1 体も stunned にならない**',
      '⭐ applyRoadVigilance は applyMineRangedOpening (index.html:24310) と同じ stunned 枠。変異 alwaysvigil が番人'],
    ['2d', '#combatLog に 1 行出る。⭐ 2 経路 = 供給口 (置いた label) と DOM のテキスト',
      '⛔ 「行が増えた」だけにしない —— 置いた label そのものが DOM に出ていることまで見る'],
    ['2e', '⚠ 汚れた label を使わない — label に <img src=x onerror=1> を置いて起動すると'
      + ' ① #combatLog の **要素数が既定語のときと同じ** (タグが増えていない)'
      + ' ② ログの文字列に既定語 (「街道の糧」/「街道の備え」) が出る',
      '⚠⚠⚠ 罠 B (依頼書 §2-3): appendLog は innerHTML 代入で index.html に escape ヘルパが 0 件。変異 taintlabel が番人'],
    ['2f', 'キーが無いとき何も起きない — maxHp が素のアームと **ちょうど同じ**、ログに街道の行が 0 本',
      '⭐ pendingSummon 型の「キーが無い = 何も起きない」。⛔ questFlags の「無い = 開放」とは逆'],
  ]],
  ['§3 恒等 (非退行) — 依頼書 §8 §3', [
    ['3a', '⭐⭐⭐ 既存 golden 3 本が通る経路そのものを再現して測る — 「判定なしの枝」を押しながら'
      + ' world.html を歩き切り、入場して index.html へ着いたとき **maxHp が ?roadboon=0 の腕と 1 も違わない**',
      '⚠ 母集団ガード = その横断で器が **1 回以上開いている**こと (0 回だと「押す枝が無かっただけ」で自明に緑)。'
      + '⚠⚠⚠ 罠 A (依頼書 §2-2): verify_world_steps:774 / world_map:683 / quest_walk:831 が'
      + ' `(ev.choices||[]).filter(x => !x.check)[0]` を機械的に押して index.html まで進む。変異 dismissboon が番人'],
  ]],
  ['§4 撤退 ?roadboon=0 — 依頼書 §8 §4', [
    ['4a', 'world.html?roadboon=0 — 判定に **成功しても** roadBoon が書かれず、器の 1 行も出ない',
      '⚠ 母集団ガード = その腕で **判定に成功した出来事が 1 件以上**あること'
      + ' (⛔ 「1 件も起きなかったので書かれなかった」を通さない)。変異 retreatwrite が番人'],
    ['4b', 'index.html?roadboon=0 — キーを置いてから開いても ① maxHp が素と同じ ② ログに街道の行が 0 本'
      + ' ③ **キーが消えていない** (removeItem もしない)',
      '⭐ 撤退は状態への副作用ゼロ (#46 の規律)。⚠ ③ が「撤退アームだけの assert は自明に緑」を殺す。変異 retreatconsume が番人'],
    ['4c', '両ページの撤退アームで pageerror 0 件', '⭐ world.html?roadboon=0 と index.html?roadboon=0 の両方'],
  ]],
];

// ══════════════════════════════════════════════════════════════════════════════
// 観測の集約 — ⭐ 受入条件ごとに「何を測れば足りるか」を 1 表で持つ
//   ⚠⚠ 負のコントロールで **必要な観測を採り忘れる**と、assert が「観測が無い」で
//     機械的に赤くなり、欠陥を検出したのか装置が欠けたのか読めなくなる (#38 の教訓)。
//   ⚠ 実操作は 1 本あたり数十秒。必要な変異でだけ採る。
// ══════════════════════════════════════════════════════════════════════════════
const NEEDS = {
  '0a': ['boot'], '0b': ['boot', 'served'],
  '0c': ['boot', 'armWin'],
  '0d': ['armNone', 'armLose', 'armWin'],
};
const ALL_KEYS = ['0a', '0b', '0c', '0d'];

async function collect(browser, port, errs, need) {
  const m = {}, want = {};
  need.forEach(k => { want[k] = true; });
  if (want.boot) m.boot = await measureBoot(browser, port, errs, {});
  if (want.bootRetreat) m.bootRetreat = await measureBoot(browser, port, errs, { query: '?roadboon=0' });
  if (want.served) m.served = (await httpGet('http://localhost:' + port + PAGE_PATH)).body;
  if (want.servedIndex) m.servedIndex = (await httpGet('http://localhost:' + port + PAGE_INDEX)).body;
  /* ⭐ §1 (1a) の 3 経路 = ここで採る 3 本の腕がそのまま母集団になる。
     ⛔ 種も行き先も 3 本で **同じ** にすること (違う条件で採ると経路の差が交ざる)。 */
  if (want.armNone) m.armNone = await measureArm(browser, port, errs, { resolve: 'none' });
  if (want.armLose) m.armLose = await measureArm(browser, port, errs, { resolve: 'check', force: D20_LOSE });
  if (want.armWin) m.armWin = await measureArm(browser, port, errs, { resolve: 'check', force: D20_WIN });
  /* ⭐ (4a) の撤退アーム — 素の armWin と **同じ種・同じ行き先・同じ d20** で採る。 */
  if (want.armWinRetreat) m.armWinRetreat = await measureArm(browser, port, errs,
    { resolve: 'check', force: D20_WIN, extraQuery: '&roadboon=0' });
  return m;
}
function needsOf(keys) {
  const need = [];
  keys.forEach(k => (NEEDS[k] || ['boot']).forEach(n => { if (need.indexOf(n) < 0) need.push(n); }));
  return need;
}
function runCheck(m, key) {
  const a = ASSERT_OF[key];
  const r = a[2](m);
  /* ⭐ 3 値。null = まだ測れない (本体が無い) → PENDING。 */
  if (r[0] === null) { pending('(' + a[0] + ') ' + a[1], r[1]); return; }
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_roadboon_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  MUT_SERVED.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

  console.log('=== verify_road_boon.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (変異は 1 本も実装されていない)'));
  console.log('[drv]   ⛔ 9770 は verify_road_events の --negative レンジ (9761-9774) と衝突するので 9790');

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
      + ' を仕込む (拠点の母集団を復元)');

    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      mark('観測を採る — 素の world.html / 二択を押す腕 x3 (判定なし・判定つき失敗・判定つき成功)');
      const m = await collect(browser, PORT, errs, needsOf(ALL_KEYS));

      mark('§0 装置 — 恩恵表 (0a) / 写経 (0b) / 書き込みの母集団 (0c) / 二択の母集団 (0d)');
      for (const key of ['0a', '0b', '0c', '0d']) runCheck(m, key);

      if (m.boot) {
        console.log('       [記録] 器とシーム: '
          + '#worldEventBox=' + m.boot.hasEventBox
          + ' / #worldEventBoon=' + m.boot.hasBoonSlot
          + ' / window.ROAD_EVENTS=' + m.boot.roadEventsModule
          + ' / typeof BOONS=' + (m.boot.roadEvents ? m.boot.roadEvents.boonsType : '—')
          + ' / typeof boonOf=' + (m.boot.roadEvents ? m.boot.roadEvents.api.boonOf : '—'));
        console.log('       [記録] 起動直後の ' + BOON_KEY + ' = ' + JSON.stringify(m.boot.boonAtBoot));
      }
      if (m.boot && m.boot.roadEvents) {
        const R = m.boot.roadEvents;
        console.log('       [記録] イベント表 ' + R.events.length + ' 件 (⛔ 数字は直書きせずページから数えた):');
        for (const e of R.events) {
          const b = R.boons ? R.boons[e.id] : null;
          console.log('         ' + e.id.padEnd(20) + ' ' + String(e.terrain).padEnd(9)
            + ' ' + String(e.checkKey).padEnd(14) + ' dc=' + String(e.dc).padEnd(7)
            + ' 実り=' + (b ? (b.kind + ' 「' + b.label + '」') : '(未実装)'));
        }
      }
      for (const [tag, p] of [['① 判定なし    ', m.armNone], ['② 判定つき失敗', m.armLose],
        ['③ 判定つき成功', m.armWin]]) {
        if (!p) continue;
        console.log('       [記録] ' + tag + ' ' + JSON.stringify(p.query)
          + ' タップ ' + (p.taps || []).length + ' 回'
          + ' / 発火 ' + (p.roadEnd ? p.roadEnd.fired : '—') + ' 件 ' + JSON.stringify(firedList(p))
          + ' / 到着 ' + JSON.stringify(p.end ? p.end.node : null));
        if (p.pick) {
          console.log('         → ' + String(p.pick.event).padEnd(20)
            + ' 「' + String(p.pick.label).slice(0, 22) + '」'
            + ' success=' + (p.pick.roadLast ? p.pick.roadLast.success : '—')
            + ' ロスター ' + (p.pick.panel ? p.pick.panel.rows : '—') + ' 行 '
            + JSON.stringify(p.pick.panel ? p.pick.panel.names : null)
            + ' 閉じた=' + p.pick.closed);
          console.log('         → 結末 ' + JSON.stringify(String(p.pick.resultText).slice(0, 34)));
          console.log('         → #worldEventBoon 結末時=' + JSON.stringify(p.pick.boonSlotAtResult)
            + ' 閉じた後=' + JSON.stringify(p.pick.boonSlotAfterClose));
        } else {
          console.log('         → ⛔ ' + (p.why || '出来事が出なかった'));
        }
        console.log('         → ' + BOON_KEY + ' = ' + JSON.stringify(p.boon ? p.boon.raw : null)
          + ' (localStorage 側=' + JSON.stringify(p.boon ? p.boon.localRaw : null) + ')');
      }

      for (const [title, rows] of PENDINGS) {
        mark(title);
        for (const p of rows) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      mark('§9 ページエラー');
      check('(9a) 測定ページで pageerror / console.error が出ていない'
        + ' (⭐ #47 が足す js/road-events.js の BOONS / world.html の書き込みが壊れないこと。'
        + 'これは (0a) では捕まらない = 載っていても投げうる)',
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
          /* ⭐ その変異が狙う節が読む観測 **だけ** を採る (⛔ 全部採ると 1 本 5 分かかる)。
             ⚠ boot と served は安いので必ず採る —— 採り忘れると assert が
               「観測が無い」で機械的に赤くなり、欠陥の検出と区別できなくなる。 */
          const need = needsOf(MUTATIONS[k].targets);
          if (need.indexOf('boot') < 0) need.push('boot');
          if (need.indexOf('served') < 0) need.push('served');
          console.log('  [neg ' + k + '] :' + port + ' 観測 ' + JSON.stringify(need));
          const m = await collect(browser, port, negErrs, need);
          for (const key of MUTATIONS[k].targets) {
            const a = ASSERT_OF[key];
            if (!a) {
              pending('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる',
                '⛔ (' + key + ') はまだ ASSERTS に無い (後続項目が実装する)');
              continue;
            }
            const r = a[2](m);
            if (r[0] === null) {
              pending('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる',
                '⛔ (' + key + ') は本体が無く PENDING のまま — ' + r[1]);
              continue;
            }
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
