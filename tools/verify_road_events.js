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
const crypto = require('crypto');            // (4a) の恒等ハッシュ

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
  /* ⭐⭐⭐ 依頼書 §2-3 の罠 B そのものの再現。party を sessionStorage (4 人分) ではなく
     localStorage (主人公 1 人だけ) から読む。
     ⛔ これが赤くならないなら (2a) は「4 人で歩いているのに 1 人で判定する」を何も検査していない。 */
  localparty: {
    impl: true, file: 'js/road-events.js', targets: ['2a'],
    why: 'party を sessionStorage ではなく localStorage から読む (罠 B の再現)',
    from: '    try { raw = sessionStorage.getItem(PARTY_KEY); } catch (e) { raw = null; }   /* ① 4 人分 (peek のみ) */',
    to: '    try { raw = localStorage.getItem(PARTY_KEY); } catch (e) { raw = null; }   /* [neg localparty] 主人公 1 人だけを読む */',
  },
  /* 器の取り違え。#worldEnterAsk は __world.askOpen() が握っており、
     verify_world_steps (4c) の条件②の番人 —— 流用した瞬間に既存 golden も赤くなる。
     ⚠ askEnter(id) は NODES[id].label を読む。刻み点 id を渡すと TypeError になり
       「器の取り違え」ではなく「例外」を測ってしまうので、**拠点 id** を渡す。 */
  askreuse: {
    impl: true, file: 'world.html', targets: ['1a'],
    why: 'イベントを #worldEnterAsk へ出す (器の取り違え)',
    from: '      RE.open(ev, function (choice) { onRoadChoice(ev, choice); });',
    to: '      askEnter("temple");   /* [neg askreuse] 街道の出来事を #worldEnterAsk へ出す */',
  },
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
  /* 1 件も発火させない。⭐ (0d) は母集団の assert —— 「対象停留所に着いたタップ」だけでなく
     「実際に 1 件は発火した」まで見るので、ここが赤くなる
     (⛔ 到着だけを数える (0d) だと、この変異は空振りする = 項目 3 で足した条件)。
     ⚠ RE.roll は呼んだまま条件だけ潰す (乱数の消費列を変えない)。 */
  neverfire: {
    impl: true, file: 'world.html', targets: ['0d'],
    why: 'イベントを 1 件も発火させない',
    from: '      if (!RE.roll(terrain)) return false;              /* 地形ごとの発生率 (表は road-events.js) */',
    to: '      if (RE.roll(terrain) || true) return false;   /* [neg neverfire] 1 件も出さない */',
  },
  /* 確率を無視して毎回出す。⭐ (3b) の「地形ごとに違う」が swamp == coast == 1.0 で崩れる。 */
  alwaysfire: {
    impl: true, file: 'js/road-events.js', targets: ['3b'],
    why: '確率を無視して毎停留所で出す',
    from: '  function roll(terrain) { return rnd() < rateOf(terrain); }',
    to: '  function roll(terrain) { rnd(); return terrain !== null; }   /* [neg alwaysfire] 確率を無視 */',
  },
  /* 再訪でも出す。⭐ **決定論的に**出す —— 「20% でもう一度振る」だと変異が 8 割空振りして
     負のコントロールそのものが間欠になる (#41 の教訓)。 */
  revisit: {
    impl: true, file: 'world.html', targets: ['3a'],
    why: '再訪でもイベントを出す',
    from: '      if (roadVisited[atId]) return false;              /* この滞在で 2 度目 ((3a)) */',
    to: '      if (roadVisited[atId]) { roadFiredCount++; roadLast = { at: atId, terrain: "neg", event: "neg", choice: null, success: null, text: null }; window.ROAD_EVENTS.open(window.ROAD_EVENTS.EVENTS[0], function () {}); return true; }   /* [neg revisit] 再訪でも出す */',
  },
  /* 拠点でも出す。⭐ 同じく決定論的に —— 通りすがりの拠点は 3 件しか無く、
     素の確率 (5% / 10% / 18%) に任せると 3 割しか当たらない。 */
  sitefire: {
    impl: true, file: 'world.html', targets: ['1b'],
    why: '拠点 (site) でもイベントを出す',
    from: '    function isRoadSite(id) { return WM.has(id) && !!NODES[id] && NODES[id].kind === "site"; }',
    to: '    function isRoadSite(id) { if (WM.has(id) && !!NODES[id] && NODES[id].kind === "site") { roadFiredCount++; roadLast = { at: id, terrain: "neg", event: "neg", choice: null, success: null, text: null }; window.ROAD_EVENTS.open(window.ROAD_EVENTS.EVENTS[0], function () {}); } return false; }   /* [neg sitefire] 拠点でも出す */',
  },
  retreatfire: { impl: false, file: 'world.html', targets: ['3c'],
    why: '?walkstep=0 (撤退モード) でもイベントを出す' },
  /* ?roadseed を無視して Math.random を直接使う。⭐ (0c) は「発火した停留所の列」だけでなく
     **乱数 32 連の署名**も 2 枚のタブで突き合わせるので、ここは確実に赤くなる
     (⛔ 発火列だけだと、たまたま両方 0 件で一致して 2 割ほど空振りする)。 */
  seedignore: {
    impl: true, file: 'js/road-events.js', targets: ['0c'],
    why: '?roadseed を無視して Math.random を直接使う',
    from: '    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;',
    to: '    return Math.random();   /* [neg seedignore] 種を無視する */',
  },
  /* 移動中でも開く = 依頼書が ⛔ と書いた「walkPath の中から呼ぶ」設計そのもの。
     ⚠⚠ (3d) は器が開いた **瞬間** を同期で捕まえないと検出できない —— rAF の 1 ブロックの
       中で「開く → stopWalk() で moving=false」まで走り切るため、MutationObserver で
       読むと moving は必ず false に見えて永久に緑になる。 */
  movefire: {
    impl: true, file: 'world.html', targets: ['3d'],
    why: '移動中 (isMoving) でもイベントを開く',
    from: '          heroNodeId = ids[idx];',
    to: '          heroNodeId = ids[idx]; if (window.ROAD_EVENTS) window.ROAD_EVENTS.open(window.ROAD_EVENTS.EVENTS[0], function () {});   /* [neg movefire] 歩行中に開く */',
  },
  /* 成功と失敗で同じ文を出す。⭐ (3f) は「違うこと」だけでなく、success / fail の
     **どちらの文が出たか**まで ROAD_EVENTS の実体と突き合わせる。 */
  sameresult: {
    impl: true, file: 'js/road-events.js', targets: ['3f'],
    why: '成功と失敗で同じ文を出す',
    from: '    return outcome.success ? choice.success : choice.fail;',
    to: '    return choice.success;   /* [neg sameresult] 成功と失敗で同じ文 */',
  },
  retreatkeep: { impl: false, file: 'world.html', targets: ['5a'],
    why: '?roadevent=0 でも器を DOM に残す (display:none で残す)' },
  nodecount: {
    impl: true, file: 'js/road-events.js', targets: ['0e'],
    why: 'イベントの母集団を way + step から刻み点だけへ狭める',
    from: '    for (k in W.NODES) if (has(W.NODES, k) && W.NODES[k].kind === "way") out.push(k);',
    to: '    /* [neg nodecount] 中継点を母集団から外す (刻み点だけへ狭める) */',
  },
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
      /* ⭐ (4a) の恒等ハッシュの材料。⛔ ドライバへ写経せず毎回ここから引く
         (nodesFP / edgesFP の式は tools/verify_world_steps.js:497 の (1d) と同じ。
          そこに **STEPS を足して** #45 が刻み点の派生レイヤも動かしていないことまで見る)。 */
      ident: (function () {
        const nodesFP = Object.keys(WM.NODES).map(function (id) {
          const n = WM.NODES[id];
          return id + ':' + n.kind + ':' + n.x + ',' + n.y + ':' + (n.enter !== undefined ? 'enter' : '—');
        });
        const edgesFP = WM.EDGES.map(function (e) { return e[0] + '__' + e[1]; });
        const stepsFP = Object.keys(WM.STEPS || {}).slice().sort().map(function (id) {
          const s = WM.STEPS[id];
          return id + ':' + s.kind + ':' + s.x.toFixed(3) + ',' + s.y.toFixed(3)
            + ':' + (s.on || []).join('|');
        });
        return { nodesFP: nodesFP, edgesFP: edgesFP, stepsFP: stepsFP, sites: WM.SITES };
      })(),
      /* ⭐ (4b) の材料 —— __world の窓の **キーと型**、および起動直後の返り値。
         ⛔ 「キーが在る」だけで済ませない (#38「キー集合だけの恒等 assert」の教訓)。 */
      seam: (function () {
        const W = window.__world; if (!W) return null;
        const types = {}; Object.keys(W).forEach(function (k) { types[k] = typeof W[k]; });
        let cfn = null; try { cfn = W.clientFromNode('phlan'); } catch (e) { cfn = 'throw'; }
        let hmg = null; try { hmg = W.heroMarkGeom(); } catch (e) { hmg = 'throw'; }
        let hg = null; try { hg = W.heroGeom(); } catch (e) { hg = 'throw'; }
        let re = null; try { re = (typeof W.roadEvent === 'function') ? W.roadEvent() : null; } catch (e) { re = 'throw'; }
        return {
          keys: Object.keys(W), types: types,
          heroNode: W.heroNode(), askOpen: W.askOpen(), isMoving: W.isMoving(),
          arrivalCount: W.arrivalCount(), lastArrival: W.lastArrival(),
          walkStepOff: W.walkStepOff(), stepMaxPx: W.stepMaxPx(),
          stepIds: W.stepIds().length, nodeIds: W.nodeIds().length,
          heroMarkOn: W.heroMarkOn(), heroMarkGeom: hmg, heroGeom: hg,
          clientFromNode: cfn, roadEvent: re,
        };
      })(),
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
// 種 (決定論のシーム) — ⭐ **ドライバの定数**。⛔ ページから読まない
//   (ページから読むと「?roadseed を無視する実装」を検出できない = 変異 seedignore)。
// ⚠⚠⚠ 確率のままだとドライバは間欠で赤くなる (#41 の NPC 巡回が verify_town_map を
//   38% / 15% / 8% で落とし、原因の特定に丸一日かかった)。下の 2 つは 2026-09-03 に
//   mulberry32 をオフラインで回して選んだ種で、実走行の発火列がそれぞれ決まっている。
//     SEED_MAIN … pier → fort (対象停留所 5 / うち 4 つが swamp) で **複数件**発火する
//     SEED_NEAR … **2 タップ目**の cross_n (coast) で必ず 1 件発火する
//                 = 二択を押す測定 ((2a)(2b)(3f)) を 2 タップで済ませられる
// ⚠ 行き先に phlan を選ばないこと —— enter を持つただ 1 つのノードで、着いた瞬間に
//   location.href で town.html へ飛び、以後の測定が全部死ぬ。
// ⚠ 押した行き先へ「着いた」タップでは入場が優先されて出来事は出ない。だから
//   DEST_NEAR は cross_n ではなく **その先の swamp**。
// ══════════════════════════════════════════════════════════════════════════════
const SEED_MAIN = 282;
const SEED_NEAR = 7;
const DEST_MAIN = 'fort';
const DEST_NEAR = 'swamp';
/* party の出所 (依頼書 §2-3 の罠 B)。⛔ world.html は storage へ 1 バイトも書かないので
   ドライバ側で用意する。⚠ localStorage はプロファイル共有 = 毎回明示的に書くか消す。 */
const PARTY4 = ['warrior', 'dwarf', 'elf', 'cleric'];   /* sessionStorage 側 (4 人分) */
const PARTY1 = ['cleric'];                              /* localStorage 側 (主人公 1 人) */
/* ⭐ js/skill-check.js の d20 は **Math.random 由来**で ?roadseed の PRNG とは別系統。
   成功と失敗の**両方**を引くにはここを固定するしかない
   (⛔ js/skill-check.js は 1 バイトも触らない / ⛔ opts.auto も ?autoplay も使わない)。 */
const D20_WIN = 0.999;    /* → d20 = 20 (クリティカル成功) */
const D20_LOSE = 0.0;     /* → d20 = 1  (ファンブル失敗) */

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
   ⚠ 開いてから ARM_MS (ゴーストクリック除け) を必ず待つ。 */
async function eventState(page) {
  return safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    const box = document.getElementById('worldEventBox');
    const ov = document.getElementById('skillCheckOverlay');
    const t = document.getElementById('worldEventTitle');
    const x = document.getElementById('worldEventText');
    return {
      open: !!(RE && typeof RE.isOpen === 'function' && RE.isOpen()),
      boxShow: !!(box && box.classList.contains('show')),
      display: box ? getComputedStyle(box).display : null,
      title: t ? t.textContent : null,
      text: x ? x.textContent : null,
      btns: Array.prototype.slice.call(document.querySelectorAll('#worldEventBtns .worldEventBtn'))
        .map(b => b.textContent),
      overlayExists: !!ov,
      overlayShow: !!(ov && ov.classList.contains('show')),
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
        return {
          rows: rows.length,
          names: rows.map(r => ((r.querySelector('.scName') || {}).textContent || '').trim()),
          meta: (ov.querySelector('.scMeta') || {}).textContent || '',
          title: (ov.querySelector('.scTitle') || {}).textContent || '',
          flavor: (ov.querySelector('.scFlavor') || {}).textContent || '',
          z: parseInt(getComputedStyle(ov).zIndex, 10),
        };
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
  rec.overlayExists = st1 ? st1.overlayExists : null;
  rec.doneBtns = st1 ? st1.btns : null;
  rec.roadLast = await safeEval(page, () => {
    const W = window.__world;
    return (W && typeof W.roadEvent === 'function') ? W.roadEvent().last : null;
  });
  await sleep(armWait);
  await clickEventBtn(page, null);
  await sleep(200);
  const st2 = await eventState(page);
  rec.closed = !!(st2 && !st2.open);
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
    taps: [], back: [], arrivals: [], events: [] };
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
     **明示的に消す** (前の走行の残りが次の走行の期待値を汚す)。 */
  await page.evaluateOnNewDocument((s) => {
    const K = 'dragonfighters.partyComposition';
    try { if (s.local) localStorage.setItem(K, JSON.stringify(s.local)); else localStorage.removeItem(K); } catch (e) {}
    try { if (s.session) sessionStorage.setItem(K, JSON.stringify(s.session)); } catch (e) {}
  }, { local: opts.local || null, session: opts.session || null });
  if (typeof opts.force === 'number') {
    await page.evaluateOnNewDocument((v) => { Math.random = function () { return v; }; }, opts.force);
  }
  await page.setViewport(opts.viewport || { width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + query,
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);

  /* ⭐⭐⭐ 器が **開いた瞬間** を同期で捕まえる。
     ⚠⚠ MutationObserver では間に合わない —— rAF の 1 ブロックの中で「開く →
       stopWalk() で moving=false」まで走り切るので、マイクロタスクで読むと
       isMoving() は必ず false に見え、(3d) が永久に緑になる。
     ⛔ これは「駆動」ではなく「計測」。歩くのは実クリックだけ。 */
  await page.evaluate(() => {
    window.__roadOpen = [];
    const RE = window.ROAD_EVENTS;
    if (!RE || typeof RE.open !== 'function') return;
    const orig = RE.open;
    RE.open = function (ev, cb) {
      const rec = { id: (ev && ev.id) || null, at: null, fired: null, terrain: null,
        moving: !!(window.__world && window.__world.isMoving()),
        askOpenBefore: !!(window.__world && window.__world.askOpen()) };
      try {
        const r = window.__world.roadEvent();
        rec.at = r.last ? r.last.at : null;
        rec.terrain = r.last ? r.last.terrain : null;
        rec.fired = r.fired;
      } catch (e) {}
      const ret = orig.apply(this, arguments);
      try {
        const b = document.getElementById('worldEventBox');
        rec.boxShow = !!(b && b.classList.contains('show'));
        rec.boxDisplay = b ? getComputedStyle(b).display : null;
        rec.askOpenAfter = !!(window.__world && window.__world.askOpen());
        rec.overlayExists = !!document.getElementById('skillCheckOverlay');
      } catch (e) {}
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
  /* ⚠ findWalkPath は **始点を含まない** = path.length がそのままホップ数 (依頼書 §2-5)。 */
  out.destPick = await safeEval(page, (d) => {
    const WM = window.WORLD_MAP, W = window.__world;
    const from = W.heroNode();
    return { from: from, dest: d, path: WM.findWalkPath(from, d) };
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
    /* 往復 ((3a) の再訪)。⭐ 帰り道でも中継点は「通りすがり」なので判定は走る。 */
    if (opts.roundTrip && out.start && !out.start.dead && !out.taps.some(t => t.stuck)) {
      await walkTo(out.start.node, out.back);
    }
  }
  out.openLog = (await safeEval(page, () => window.__roadOpen || [])) || [];
  out.roadEnd = await safeEval(page, () => {
    const W = window.__world;
    return (W && typeof W.roadEvent === 'function') ? W.roadEvent() : null;
  });
  out.overlayExists = await safeEval(page, () => !!document.getElementById('skillCheckOverlay'));
  out.end = await readPlay(page);
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 D) 発生率 — ⭐ 地形ごとに **同じ種で N 回振って**頻度を採る
//   ⚠ 依頼書 §8 (3b) は「種を変えて N 回走らせ」だが、1 走行が 8 タップ x 歩行アニメで
//     数十秒かかるため N 回の実走行は現実的でない (N=20 で 13 分)。⭐ 縛るのは
//     「地形ごとに違う」という **向き**だけなので、発生率を決めている当の関数
//     (ROAD_EVENTS.roll) を直接 N 回振って向きを見る。変異 alwaysfire がここで赤くなる。
//   ⛔ 具体値 (5% / 20%) は 1 つも縛らない = 遊んで動かすレバー。
// ══════════════════════════════════════════════════════════════════════════════
async function measureRates(browser, port, errs, seed) {
  const page = await browser.newPage();
  const tag = '[:' + port + ' rates] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + '?roadseed=' + seed,
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  const out = await safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    if (!RE || typeof RE.roll !== 'function') return null;
    const N = 4000, terr = (RE.TERRAINS || []).slice(), freq = {}, rate = {};
    terr.forEach(function (t) {
      let c = 0;
      for (let i = 0; i < N; i++) if (RE.roll(t)) c++;
      freq[t] = c / N; rate[t] = RE.rateOf(t);
    });
    return { N: N, terrains: terr, freq: freq, rate: rate };
  });
  await page.close();
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測 E) 種の署名 — ⭐ 同じ ?roadseed で開いた 2 枚のタブが同じ乱数列を返すか
//   ⚠ 「発火した停留所の列」だけで決定論を測ると、たまたま両方 0 件で一致してしまい
//     変異 seedignore が 2 割ほど空振りする。⭐ 署名は 32 連ぶんあるので確実に割れる。
// ══════════════════════════════════════════════════════════════════════════════
async function measureSeedSig(browser, port, errs, seed) {
  const page = await browser.newPage();
  const tag = '[:' + port + ' sig] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + '?roadseed=' + seed,
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  const out = await safeEval(page, () => {
    const RE = window.ROAD_EVENTS;
    if (!RE || typeof RE.rnd !== 'function') return null;
    const v = [];
    for (let i = 0; i < 32; i++) v.push(RE.rnd());
    return { seed: (typeof RE.seed === 'function') ? RE.seed() : null,
      fromUrl: (typeof RE.seedFromUrl === 'function') ? RE.seedFromUrl() : null,
      values: v };
  });
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
/* ⭐ 発火した停留所の列 (器が開いた順)。(0c) の決定論と (3a) の重複検出が読む。
   ⛔ 件数だけにしない —— 「どこで / どのイベントが」まで含めて初めて列になる。 */
const firedList = (p) => ((p && p.openLog) || []).map(o => String(o.at) + '#' + String(o.id));
/* ⭐ (4a) の恒等ハッシュ。2026-09-03 実測 (NODES 14 / EDGES 14 / STEPS 10 / SITES 6)。
   ⚠ tools/verify_world_steps.js (1d) は NODES/EDGES/SITES だけを 876c5f6336f96811 で
     縛っている。こちらは **STEPS も混ぜた別の値**なので、両者は別物として並存する。 */
const IDENT_WANT = '4c0a8a6b3d65cda0';

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

  ['0d', '[母集団] 実操作の走行で **イベント対象の停留所 (way + step) に着いたタップ** が 1 件以上、'
    + 'かつ **実際に出来事が 1 件以上発火した** (⛔ 到着 0 件でも発火 0 件でも「起きない」が'
    + '自明に真になり、§1〜§3 の assert が全部空振りする。変異 neverfire が番人)',
    (m) => {
      const p = m.play;
      if (!p) return [false, '実操作の観測が無い'];
      if (!p.pop || !p.pop.ids.length) return [false, '母集団 (way + step) が 0 件'];
      const set = {};
      p.pop.ids.forEach(id => { set[id] = true; });
      const hits = (p.arrivals || []).filter(a => a && set[a.at]);
      const onSite = (p.arrivals || []).filter(a => a && !set[a.at]);
      const bad = (p.taps || []).filter(t => !t.ok);
      const fired = p.roadEnd ? p.roadEnd.fired : 0;
      return [hits.length >= 1 && bad.length === 0 && fired >= 1,
        '母集団 ' + p.pop.ids.length + ' 件 (way ' + p.pop.ways.length
        + ' + step ' + p.pop.steps.length + ' / ⛔ site ' + p.pop.sites.length + ' は除外)'
        + ' / 行き先 ' + JSON.stringify(p.destPick && p.destPick.dest)
        + ' (' + ((p.destPick && p.destPick.path) ? p.destPick.path.length : 0) + ' ホップ)'
        + ' / タップ ' + (p.taps || []).length + ' 回'
        + ' / 対象停留所への到着 ' + hits.length + ' 件'
        + ' / 対象外 (site) への到着 ' + onSite.length + ' 件'
        + ' / 発火 ' + fired + ' 件 ' + JSON.stringify(((p.openLog || []).map(o => o.at)))
        + ' (種 ' + p.seed + ')'
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

  // ── §0 装置 (残り) — 決定論 ───────────────────────────────────────────────
  ['0c', '⭐⭐⭐ [装置] **決定論** — 同じ ?roadseed で 2 回走らせると発火した停留所の列が完全に一致し、'
    + '同じ種で開いた 2 枚のタブが乱数 32 連まで一致する'
    + ' (⭐ 発火列が **空でない**ことまで見る —— 空どうしの一致は自明に真。変異 seedignore が番人)',
    (m) => {
      const a = m.play, b = m.playB, sa = m.sigA, sb = m.sigB;
      if (!a || !b) return [false, '実操作の観測が 2 回ぶん無い'];
      if (!sa || !sb) return [false, '乱数の署名が採れていない (ROAD_EVENTS.rnd が無い)'];
      const la = firedList(a), lb = firedList(b);
      const listSame = eqList(la, lb);
      const sigSame = eqList(sa.values, sb.values);
      const sigVary = uniq(sa.values).length > 1;
      const ok = la.length >= 1 && listSame && sigSame && sigVary
        && sa.seed === sb.seed && sa.fromUrl === true && sa.seed === SEED_MAIN;
      return [ok,
        '種 ' + SEED_MAIN + ' (URL 由来=' + sa.fromUrl + ' / seed()=' + sa.seed + ')'
        + ' / 発火列 A ' + JSON.stringify(la) + ' B ' + JSON.stringify(lb)
        + ' (一致=' + listSame + ' 非空=' + (la.length >= 1) + ')'
        + ' / 乱数 32 連の一致=' + sigSame + ' (ばらけ=' + sigVary + ')'
        + ' / 先頭 3 連 A ' + JSON.stringify(sa.values.slice(0, 3).map(v => +v.toFixed(6)))
        + ' B ' + JSON.stringify(sb.values.slice(0, 3).map(v => +v.toFixed(6)))];
    }],

  // ── §1 器 (残り) — どこに出るか ────────────────────────────────────────────
  ['1a', '[器] イベント表示中は **#worldEventBox が可視**で、__world.askOpen() は false のまま'
    + ' (⛔ #worldEnterAsk を流用していない)。⭐ 母集団ガード = 発火件数 (__world.roadEvent().fired) と'
    + ' 実際に器が開いた回数が **一致し、1 件以上**あること'
    + ' (⛔ 「発火したのに器が開いていない」を緑にしない = 変異 askreuse の番人)',
    (m) => {
      const p = m.play;
      if (!p) return [false, '実操作の観測が無い'];
      const log = p.openLog || [];
      const fired = p.roadEnd ? p.roadEnd.fired : null;
      const bad = log.filter(o => !o.boxShow || o.boxDisplay === 'none'
        || o.askOpenAfter === true || o.askOpenBefore === true);
      const ok = log.length >= 1 && fired === log.length && bad.length === 0
        && !!p.end && p.end.askOpen === false;
      return [ok,
        '発火 ' + fired + ' 件 / 器が開いた ' + log.length + ' 回 (一致=' + (fired === log.length) + ')'
        + ' / 走行後の __world.askOpen()=' + (p.end ? p.end.askOpen : '—')
        + ' / 開いた瞬間の記録 ' + JSON.stringify(log.map(o => ({
          at: o.at, id: o.id, show: o.boxShow, disp: o.boxDisplay, ask: o.askOpenAfter })))
        + (bad.length ? ' / ⛔ 不正 ' + bad.length + ' 件' : '')];
    }],

  ['1b', '[器] **拠点 (site) では出来事が 1 件も出ない** — 通りすがりでも、押した行き先へ着いたときも'
    + ' (入場ダイアログが優先)。⭐ 母集団ガード = 拠点への到着が 1 件以上 **かつ** 発火が 1 件以上'
    + ' (⛔ どちらかが 0 だと「出ない」が自明に真。変異 sitefire が番人)',
    (m) => {
      const p = m.play;
      if (!p) return [false, '実操作の観測が無い'];
      const site = {}; (p.pop ? p.pop.sites : []).forEach(id => { site[id] = true; });
      const siteArrivals = (p.arrivals || []).filter(a => a && site[a.at]);
      const log = p.openLog || [];
      const atSite = log.filter(o => site[o.at]);
      const ok = siteArrivals.length >= 1 && log.length >= 1 && atSite.length === 0;
      return [ok,
        '拠点 ' + (p.pop ? p.pop.sites.length : 0) + ' 件 / 拠点への到着 ' + siteArrivals.length + ' 回 '
        + JSON.stringify(uniq(siteArrivals.map(a => a.at)))
        + ' / 発火 ' + log.length + ' 件 ' + JSON.stringify(log.map(o => o.at))
        + (atSite.length ? ' / ⛔ 拠点で発火 ' + JSON.stringify(atSite.map(o => o.at)) : ' / 拠点での発火 0 件')];
    }],

  // ── §2 party (誰が判定するか) ──────────────────────────────────────────────
  ['2a', '⭐⭐⭐ [party] sessionStorage に 4 人分を書いた状態で判定つきの選択肢を押すと、'
    + '判定パネルのロスターが **4 行**出る。⛔ localStorage しか無い状態 (1 行) と'
    + '**区別できること** (= 依頼書 §2-3 の罠 B の検出。変異 localparty が番人)',
    (m) => {
      const w = m.choiceWin, one = m.choiceParty1;
      if (!w || !one) return [false, '判定つきの選択肢を押した観測が無い'];
      if (!w.panel) return [false, '4 人分を仕込んだのに判定パネルが出ていない: ' + (w.why || '(理由不明)')];
      if (!one.panel) return [false, '1 人分で判定パネルが出ていない: ' + (one.why || '(理由不明)')];
      const ok = w.panel.rows === PARTY4.length && one.panel.rows === PARTY1.length
        && w.panel.rows !== one.panel.rows;
      return [ok,
        'sessionStorage ' + JSON.stringify(PARTY4) + ' → ロスター ' + w.panel.rows + ' 行 '
        + JSON.stringify(w.panel.names)
        + ' / localStorage だけ ' + JSON.stringify(PARTY1) + ' → ' + one.panel.rows + ' 行 '
        + JSON.stringify(one.panel.names)
        + ' / 区別できる=' + (w.panel.rows !== one.panel.rows)
        + ' / meta=' + JSON.stringify(String(w.panel.meta).slice(0, 60))];
    }],

  ['2b', '[party] sessionStorage を空にすると **1 行 (主人公のみ)** に落ちるが、**判定は成立する**'
    + ' (resolveSkillCheck が null を返さない = 結末の文が出て器が閉じ、'
    + '__world.roadEvent().last.success が真偽値になっている)',
    (m) => {
      const one = m.choiceParty1;
      if (!one) return [false, '1 人分の観測が無い'];
      const rl = one.roadLast;
      const ok = !!one.panel && one.panel.rows === 1 && !!one.resultText && one.closed === true
        && !!rl && typeof rl.success === 'boolean';
      return [ok,
        'ロスター ' + (one.panel ? one.panel.rows : '—') + ' 行 '
        + JSON.stringify(one.panel ? one.panel.names : null)
        + ' / 結末の文 ' + (one.resultText ? one.resultText.length + ' 文字' : '⛔ 無し')
        + ' / 器が閉じた=' + one.closed
        + ' / roadEvent().last=' + JSON.stringify(rl)
        + (one.why ? ' / ⛔' + one.why : '')];
    }],

  ['2c', '⛔ [peek] world.html の配信バイトの sessionStorage.removeItem の出現数が **着手前と同じ 1 件**'
    + ' (#23 の questDest だけ) で、localStorage への setItem / removeItem は 0 件'
    + ' —— 一回性のキーを 1 つも消さない (exitVia を消すと帰還先が、lastResult を消すと'
    + '酒場のリザルト画面が黙って壊れる)',
    (m) => {
      if (typeof m.served !== 'string' || !m.served.length)
        return [false, 'world.html の配信バイトを読めていない'];
      const n = (needle) => m.served.split(needle).length - 1;
      const rm = n('sessionStorage.removeItem');
      const lset = n('localStorage.setItem'), lrm = n('localStorage.removeItem');
      const sset = n('sessionStorage.setItem');
      const BASE_REMOVE = 1;   /* 2026-09-03 着手前の実測 (grep -c sessionStorage.removeItem world.html) */
      const ok = rm === BASE_REMOVE && lset === 0 && lrm === 0;
      return [ok,
        'world.html 配信 ' + m.served.length + 'B / sessionStorage.removeItem ' + rm
        + ' 件 (着手前 ' + BASE_REMOVE + ' 件) / sessionStorage.setItem ' + sset
        + ' 件 (撤退フラグ) / localStorage.setItem ' + lset + ' 件 / localStorage.removeItem ' + lrm + ' 件'];
    }],

  // ── §3 発火の規則 ─────────────────────────────────────────────────────────
  ['3a', '[発火] **同じ停留所では二度出ない** — 往復させて再訪させ、器が開いた停留所に重複が無い。'
    + ' ⭐ 母集団ガード = 2 回以上着いた停留所が 1 件以上 **かつ** 発火が 1 件以上'
    + ' (変異 revisit が番人)',
    (m) => {
      const r = m.round;
      if (!r) return [false, '往復の観測が無い'];
      const cnt = {};
      (r.arrivals || []).forEach(a => { if (a) cnt[a.at] = (cnt[a.at] || 0) + 1; });
      const revisited = Object.keys(cnt).filter(k => cnt[k] >= 2);
      const log = r.openLog || [];
      const seen = {}, dup = [];
      log.forEach(o => { const k = String(o.at); if (seen[k]) dup.push(k); seen[k] = true; });
      const ok = revisited.length >= 1 && log.length >= 1 && dup.length === 0;
      return [ok,
        '往路 ' + (r.taps || []).length + ' タップ + 復路 ' + (r.back || []).length + ' タップ'
        + ' / 到着 ' + (r.arrivals || []).length + ' 回'
        + ' / 2 回以上着いた停留所 ' + revisited.length + ' 件 ' + JSON.stringify(revisited.slice(0, 6))
        + ' / 発火 ' + log.length + ' 件 ' + JSON.stringify(log.map(o => o.at))
        + (dup.length ? ' / ⛔ 同じ停留所で 2 度 ' + JSON.stringify(uniq(dup)) : ' / 重複 0 件')];
    }],

  ['3b', '[発火] **地形ごとに発生率が異なる** — 同じ種で各地形 N 回振り、swamp の発火率 > coast の発火率。'
    + ' ⛔ 具体値 (5% / 20%) は 1 つも縛らない = 遊んで動かすレバー。'
    + ' ⭐ 母集団ガード = どの地形も 0 < 発火率 < 1 (⛔ 全部 1 なら「違う」が言えない。変異 alwaysfire)',
    (m) => {
      const r = m.rates;
      if (!r) return [false, 'ROAD_EVENTS.roll が無い (発生率を振れない)'];
      const f = r.freq, rate = r.rate, terr = r.terrains || [];
      const spread = terr.length >= 2 && terr.every(t => f[t] > 0 && f[t] < 1);
      const have = terr.indexOf('swamp') >= 0 && terr.indexOf('coast') >= 0;
      const ok = have && spread && f.swamp > f.coast && rate.swamp > rate.coast;
      return [ok,
        'N=' + r.N + ' 回 / 実測の発火率 '
        + terr.map(t => t + ':' + (f[t] * 100).toFixed(1) + '%').join(' ')
        + ' / 表の発生率 ' + JSON.stringify(rate)
        + ' / swamp > coast = ' + (f.swamp > f.coast)
        + ' / 0 < 率 < 1 が全地形で成立=' + spread];
    }],

  ['3d', '[発火] **移動中には器が開かない** — 器が開いた **瞬間** の __world.isMoving() が全件 false。'
    + ' ⭐ 瞬間を **同期で**捕まえている (MutationObserver では rAF の 1 ブロックが'
    + '「開く → stopWalk() で moving=false」まで走り切った後に届き、永久に緑になる)。'
    + ' 母集団ガード = 器が開いた回数が 1 件以上 (変異 movefire が番人)',
    (m) => {
      const p = m.play;
      if (!p) return [false, '実操作の観測が無い'];
      const log = p.openLog || [];
      const bad = log.filter(o => o.moving === true);
      const ok = log.length >= 1 && bad.length === 0;
      return [ok,
        '器が開いた ' + log.length + ' 回 / 開いた瞬間の isMoving() = '
        + JSON.stringify(log.map(o => o.moving))
        + (bad.length ? ' / ⛔ 移動中に開いた ' + bad.length + ' 件 '
          + JSON.stringify(bad.map(o => ({ at: o.at, id: o.id }))) : ' / 移動中の開きは 0 件')];
    }],

  ['3e', '[判定] **判定を伴わない選択肢では #skillCheckOverlay が作られない** — 実走行で判定なしの'
    + '選択肢だけを押し、結末が出た時点でも走行を終えた時点でも overlay が DOM に無い。'
    + ' ⭐ 母集団ガード = 判定なしの選択肢を実際に押した回数が 1 件以上',
    (m) => {
      const p = m.play;
      if (!p) return [false, '実操作の観測が無い'];
      const evs = (p.events || []).filter(e => e.mode === 'none');
      const bad = evs.filter(e => e.overlayExists === true);
      const ok = evs.length >= 1 && bad.length === 0 && p.overlayExists === false;
      return [ok,
        '判定なしの選択肢を押した ' + evs.length + ' 回 '
        + JSON.stringify(evs.map(e => ({ at: e.at, id: e.event, btn: String(e.label).slice(0, 12) })))
        + ' / 結末時点の overlay 有無 ' + JSON.stringify(evs.map(e => e.overlayExists))
        + ' / 走行後の overlay=' + p.overlayExists
        + (bad.length ? ' / ⛔ 判定なしなのに overlay が作られた' : '')];
    }],

  ['3f', '[判定] **判定つきの選択肢では o.success に応じて出る文が変わる** — 同じ出来事・同じ選択肢で'
    + ' d20 を 20 / 1 に固定して 2 回引き、出た結末が **違い**、かつ ROAD_EVENTS の'
    + ' success / fail と **それぞれ一致する** (⛔ 「違えばよい」にしない。変異 sameresult が番人)',
    (m) => {
      const w = m.choiceWin, l = m.choiceLose;
      if (!w || !l) return [false, '判定つきの選択肢を押した観測が 2 回ぶん無い'];
      if (!w.resultText || !l.resultText)
        return [false, '結末の文が出ていない: 成功側「' + (w.why || '') + '」 失敗側「' + (l.why || '') + '」'];
      const evs = (m.boot && m.boot.roadEvents) ? m.boot.roadEvents.events : [];
      const def = evs.filter(e => e.id === w.event)[0];
      const ch = def ? (def.choices || []).filter(c => c.check)[0] : null;
      if (!def || !ch) return [false, '発火したイベントの定義が引けない: ' + JSON.stringify(w.event)];
      const ok = w.event === l.event && w.label === l.label
        && w.resultText !== l.resultText
        && w.resultText === ch.success && l.resultText === ch.fail
        && !!w.roadLast && !!l.roadLast
        && w.roadLast.success === true && l.roadLast.success === false;
      return [ok,
        'イベント ' + JSON.stringify(w.event) + ' / 選択肢 ' + JSON.stringify(String(w.label).slice(0, 16))
        + ' / d20=20 → success=' + (w.roadLast ? w.roadLast.success : '—')
        + ' 文=' + JSON.stringify(String(w.resultText).slice(0, 24))
        + ' (ROAD_EVENTS.success と一致=' + (w.resultText === ch.success) + ')'
        + ' / d20=1 → success=' + (l.roadLast ? l.roadLast.success : '—')
        + ' 文=' + JSON.stringify(String(l.resultText).slice(0, 24))
        + ' (ROAD_EVENTS.fail と一致=' + (l.resultText === ch.fail) + ')'
        + ' / 2 つの文が違う=' + (w.resultText !== l.resultText)];
    }],

  // ── §4 恒等 (非退行) ──────────────────────────────────────────────────────
  ['4a', '⭐⭐⭐ [恒等] WORLD_MAP の NODES / EDGES / STEPS / SITES が **1 件も変わっていない** — '
    + '{nodesFP, edgesFP, stepsFP, sites} の sha1 が ' + IDENT_WANT
    + ' (NODES 14 / EDGES 14 / STEPS 10 / SITES 6)。'
    + ' ⚠ ここが赤くなったら「地図のデータを触った」= #45 依頼書 §11 の禁止事項を踏んだということ',
    (m) => {
      const b = m.boot;
      if (!b || !b.ident) return [false, '恒等の材料が採れていない'];
      const id = b.ident;
      const canon = JSON.stringify({ nodes: id.nodesFP, edges: id.edgesFP,
        steps: id.stepsFP, sites: id.sites });
      const got = crypto.createHash('sha1').update(canon).digest('hex').slice(0, 16);
      const counts = id.nodesFP.length === 14 && id.edgesFP.length === 14
        && id.stepsFP.length === 10 && Object.keys(id.sites).length === 6;
      return [got === IDENT_WANT && counts,
        'NODES ' + id.nodesFP.length + ' / EDGES ' + id.edgesFP.length
        + ' / STEPS ' + id.stepsFP.length + ' / SITES ' + Object.keys(id.sites).length
        + '  sha1(先頭16)=' + got + ' (固定値 ' + IDENT_WANT + ')'
        + (got === IDENT_WANT ? '' : '  ⛔ 実測の中身= ' + canon.slice(0, 400))];
    }],

  ['4b', '⭐⭐⭐ [恒等] __world の **既存の窓が全部残っている** — #23 / #40 / #43 が足した 25 個が'
    + '全部 function (insets を含む) で、起動直後の返り値も今日のまま'
    + ' (arrivalCount=0 / lastArrival=null / askOpen=false / stepIds が STEPS と同数)。'
    + ' ⭐ #45 が足すのは roadEvent の **1 個だけ** (⛔ キー集合だけ見て済ませない = #38 の教訓)',
    (m) => {
      const b = m.boot;
      if (!b || !b.seam) return [false, '__world が読めていない'];
      const s = b.seam, why = [];
      const KEEP = ['heroNode', 'heroPx', 'heroClass', 'spawnVia', 'worldOff', 'revealed',
        'questDest', 'askOpen', 'isMoving', 'zoom', 'compact', 'insets', 'nodeIds', 'stepIds',
        'lastArrival', 'arrivalCount', 'walkStepOff', 'stepMaxPx', 'clientFromPoint',
        'goToNode', 'heroGeom', 'heroMarkOn', 'heroMarkGeom', 'clientFromWorld', 'clientFromNode'];
      for (const k of KEEP) if (s.types[k] !== 'function') why.push('⛔ ' + k + ' が function でない (' + s.types[k] + ')');
      if (s.types.roadEvent !== 'function') why.push('⛔ #45 の roadEvent が function でない (' + s.types.roadEvent + ')');
      const added = s.keys.filter(k => KEEP.indexOf(k) < 0);
      if (!eqList(added.slice().sort(), ['roadEvent'])) why.push('⛔ 足された窓が roadEvent 以外にもある: ' + JSON.stringify(added));
      if (typeof s.heroNode !== 'string' || !s.heroNode) why.push('⛔ heroNode() が文字列でない');
      if (s.askOpen !== false) why.push('⛔ 起動直後の askOpen() が false でない');
      if (s.isMoving !== false) why.push('⛔ 起動直後の isMoving() が false でない');
      if (s.arrivalCount !== 0) why.push('⛔ 起動直後の arrivalCount() が 0 でない: ' + s.arrivalCount);
      if (s.lastArrival !== null) why.push('⛔ 起動直後の lastArrival() が null でない');
      if (s.walkStepOff !== false) why.push('⛔ クエリ無しの walkStepOff() が false でない');
      if (s.stepIds !== b.steps.length) why.push('⛔ stepIds() ' + s.stepIds + ' != STEPS ' + b.steps.length);
      if (!(s.stepMaxPx > 0)) why.push('⛔ stepMaxPx() が正の数値でない');
      if (!s.clientFromNode || typeof s.clientFromNode.x !== 'number') why.push('⛔ clientFromNode("phlan") が {x,y} を返さない');
      if (!s.heroMarkGeom || typeof s.heroMarkGeom.headTop !== 'number') why.push('⛔ heroMarkGeom() が壊れている');
      if (!s.heroGeom || typeof s.heroGeom.sprite !== 'number') why.push('⛔ heroGeom() が壊れている');
      /* ⭐ #45 の窓そのものも「読むだけ」の形をしているか (on / seed / fired / last / visited)。 */
      const re = s.roadEvent;
      if (!re || typeof re !== 'object') why.push('⛔ roadEvent() が object を返さない');
      else {
        if (re.on !== true) why.push('⛔ クエリ無しの roadEvent().on が true でない: ' + re.on);
        if (typeof re.seed !== 'number') why.push('⛔ roadEvent().seed が数値でない: ' + JSON.stringify(re.seed));
        if (re.fired !== 0) why.push('⛔ 起動直後の roadEvent().fired が 0 でない: ' + re.fired);
        if (re.last !== null) why.push('⛔ 起動直後の roadEvent().last が null でない');
        if (!Array.isArray(re.visited) || re.visited.length !== 0) why.push('⛔ 起動直後の roadEvent().visited が空配列でない');
      }
      return [why.length === 0,
        '窓 ' + s.keys.length + ' 個 (既存 ' + KEEP.length + ' + #45 が足した ' + JSON.stringify(added) + ')'
        + ' / heroNode=' + JSON.stringify(s.heroNode)
        + ' arrivalCount=' + s.arrivalCount + ' lastArrival=' + JSON.stringify(s.lastArrival)
        + ' askOpen=' + s.askOpen + ' walkStepOff=' + s.walkStepOff
        + ' stepIds=' + s.stepIds + '/' + b.steps.length + ' stepMaxPx=' + s.stepMaxPx
        + ' / roadEvent()=' + JSON.stringify(s.roadEvent)
        + (why.length ? '  ' + why.join(' ') : '')];
    }],

  ['4c', '[恒等] **arrivalCount は 1 ホップにつきちょうど 1 増える** (#40 の (4b) と同じ規則)。'
    + ' ⭐ 出来事を挟んだタップでも増分は 1 のまま (⛔ 器を開くたびに二重に数えていないか)。'
    + ' 母集団ガード = 成功したタップが 2 回以上 かつ 出来事を挟んだタップが 1 回以上',
    (m) => {
      const p = m.play;
      if (!p) return [false, '実操作の観測が無い'];
      const taps = (p.taps || []).filter(t => t.ok);
      const deltas = taps.map(t => t.after.arrivals - t.before.arrivals);
      const bad = deltas.filter(d => d !== 1);
      const withEv = (p.events || []).length;
      const ok = taps.length >= 2 && bad.length === 0 && withEv >= 1
        && !!p.end && p.end.arrivals === taps.length;
      return [ok,
        '成功タップ ' + taps.length + ' 回 / 増分 ' + JSON.stringify(deltas)
        + ' / 出来事を挟んだタップ ' + withEv + ' 回'
        + ' / 走行後の arrivalCount=' + (p.end ? p.end.arrivals : '—')
        + (bad.length ? ' / ⛔ 1 でない増分 ' + JSON.stringify(bad) : '')];
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
  ['§3 発火の規則 (残り) — 依頼書 §8', [
    ['3c', '?walkstep=0 では 1 件も出ない (母集団ガード = そのアームでもホップが 1 件以上)',
      '⛔ 撤退アームの測定が未実装 → 項目 4'],
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
// 観測の集約 — ⭐ 受入条件ごとに「何を測れば足りるか」を 1 表で持つ
//   ⚠⚠ 負のコントロールで **必要な観測を採り忘れる**と、assert が「観測が無い」で
//     機械的に赤くなり、欠陥を検出したのか装置が欠けたのか読めなくなる (#38 の教訓)。
//   ⚠ 実操作は 1 本あたり数十秒。必要な変異でだけ採る。
// ══════════════════════════════════════════════════════════════════════════════
const NEEDS = {
  '0a': ['boot'], '0b': ['boot', 'served'], '0c': ['play', 'playB', 'sig'],
  '0d': ['play'], '0e': ['boot'],
  '1a': ['play'], '1b': ['play'], '1c': ['box'], '1d': ['box'],
  '2a': ['choiceWin', 'choiceParty1'], '2b': ['choiceParty1'], '2c': ['served'],
  '3a': ['round'], '3b': ['rates'], '3d': ['play'], '3e': ['play'],
  '3f': ['boot', 'choiceWin', 'choiceLose'],
  '4a': ['boot'], '4b': ['boot'], '4c': ['play'],
};
const ALL_KEYS = ['0a', '0b', '0c', '0d', '0e', '1a', '1b', '1c', '1d',
  '2a', '2b', '2c', '3a', '3b', '3d', '3e', '3f', '4a', '4b', '4c'];

/* ⭐ SEED_NEAR + DEST_NEAR なら **2 タップ目**に必ず 1 件出るので、判定つきの選択肢を
   押す測定 ((2a)(2b)(3f)) はここへ畳める (⛔ 8 ホップ歩いてから測る必要は無い)。 */
async function measureChoice(browser, port, errs, o) {
  const p = await measurePlay(browser, port, errs, {
    seed: SEED_NEAR, dest: DEST_NEAR, resolve: 'check', stopAfterEvent: true,
    force: o.force, session: o.session || null, local: o.local || null,
  });
  const rec = (p.events || [])[0];
  if (rec) { rec.taps = p.taps.length; rec.roadEnd = p.roadEnd; return rec; }
  return { why: '2 タップで出来事が出なかった (種 ' + SEED_NEAR + ' / 行き先 ' + DEST_NEAR
      + ' / タップ ' + p.taps.length + ' 回 / 発火 ' + (p.roadEnd ? p.roadEnd.fired : '—') + ' 件)',
    resultText: null, panel: null, roadLast: null, closed: false, event: null, label: null };
}

async function collect(browser, port, errs, need) {
  const m = {}, want = {};
  need.forEach(k => { want[k] = true; });
  if (want.boot) m.boot = await measureBoot(browser, port, errs, {});
  if (want.served) m.served = (await httpGet('http://localhost:' + port + PAGE_PATH)).body;
  if (want.box) m.box = await measureBox(browser, port, errs, { viewport: { width: 390, height: 844 } });
  if (want.rates) m.rates = await measureRates(browser, port, errs, SEED_MAIN);
  if (want.sig) {
    m.sigA = await measureSeedSig(browser, port, errs, SEED_MAIN);
    m.sigB = await measureSeedSig(browser, port, errs, SEED_MAIN);
  }
  if (want.play) m.play = await measurePlay(browser, port, errs, {});
  if (want.playB) m.playB = await measurePlay(browser, port, errs, {});
  if (want.round) m.round = await measurePlay(browser, port, errs, { roundTrip: true });
  if (want.choiceWin) m.choiceWin = await measureChoice(browser, port, errs, { force: D20_WIN, session: PARTY4 });
  if (want.choiceLose) m.choiceLose = await measureChoice(browser, port, errs, { force: D20_LOSE, session: PARTY4 });
  if (want.choiceParty1) m.choiceParty1 = await measureChoice(browser, port, errs, { force: D20_WIN, local: PARTY1 });
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
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}

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
      mark('観測を採る — 素の world.html / 実操作 x3 (往路・再走・往復) / 器 / 発生率 / 二択 x3');
      const m = await collect(browser, PORT, errs, needsOf(ALL_KEYS));

      mark('§0 装置 — 搭載 (0a) / 写経 (0b) / 決定論 (0c) / 母集団 (0d) / 表と地形 (0e)');
      for (const key of ['0a', '0b', '0c', '0d', '0e']) runCheck(m, key);
      mark('§1 器 — 表示中の器 (1a) / 拠点では出ない (1b) / 層 (1c) / compact (1d)');
      for (const key of ['1a', '1b', '1c', '1d']) runCheck(m, key);
      mark('§2 party — 4 人分 (2a) / 1 人でも判定が成立 (2b) / peek だけ (2c)');
      for (const key of ['2a', '2b', '2c']) runCheck(m, key);
      mark('§3 発火の規則 — 再訪 (3a) / 地形差 (3b) / 移動中 (3d) / 判定なし (3e) / 分岐 (3f)');
      for (const key of ['3a', '3b', '3d', '3e', '3f']) runCheck(m, key);
      mark('§4 恒等 (非退行) — 地図データ (4a) / __world の窓 (4b) / arrivalCount (4c)');
      for (const key of ['4a', '4b', '4c']) runCheck(m, key);

      if (m.boot) {
        console.log('       [記録] <script src> の並び:');
        console.log('         ' + m.boot.scriptSrcs.join(' → '));
        console.log('       [記録] SkillCheck.CHECKS: '
          + (m.boot.checkKeys ? m.boot.checkKeys.join(' / ') : '(無し)'));
        console.log('       [記録] SkillCheck.DC_TIERS: ' + JSON.stringify(m.boot.dcTiers));
        console.log('       [記録] 器とシーム: '
          + '#worldEventBox=' + m.boot.hasEventBox
          + ' / window.ROAD_EVENTS=' + m.boot.roadEventsModule
          + ' / __world.roadEvent=' + m.boot.hasRoadEventSeam);
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
      }
      if (m.rates) {
        console.log('       [記録] roll() を各地形 ' + m.rates.N + ' 回 (⛔ 期待値ではない。向きだけ縛る): '
          + m.rates.terrains.map(t => t + ' ' + (m.rates.freq[t] * 100).toFixed(1) + '%').join(' / '));
      }
      if (m.box) {
        console.log('       [記録] 器の層 (⛔ 105 / 20 / 10 はページから読んだ値): '
          + JSON.stringify(m.box.layer));
      }
      if (m.play) {
        console.log('       [記録] イベント対象の停留所 (⛔ 数字は直書きせずページから数えた):');
        console.log('         way  ' + m.play.pop.ways.length + ' 件: ' + m.play.pop.ways.join(' '));
        console.log('         step ' + m.play.pop.steps.length + ' 件: ' + m.play.pop.steps.join(' '));
        console.log('         site ' + m.play.pop.sites.length + ' 件 (⛔ 母集団から除外): '
          + m.play.pop.sites.join(' '));
        console.log('         合計 (way + step) = ' + m.play.pop.ids.length + ' 件');
        console.log('       [記録] 実操作の通し (種 ' + m.play.seed + ' / ⛔ 期待値ではない。読み解き用):');
        console.log('         起点 ' + JSON.stringify(m.play.start && m.play.start.node)
          + ' → 行き先 ' + JSON.stringify(m.play.dest)
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
        console.log('       [記録] 発火した出来事 ' + (m.play.openLog || []).length + ' 件:');
        for (const o of (m.play.openLog || [])) {
          console.log('         ' + String(o.at).padEnd(20) + ' ' + String(o.terrain).padEnd(9)
            + ' ' + String(o.id).padEnd(20) + ' 移動中=' + o.moving + ' 可視=' + o.boxShow
            + ' askOpen=' + o.askOpenAfter);
        }
        for (const e of (m.play.events || [])) {
          console.log('         → 「' + String(e.label).slice(0, 22) + '」 → 結末 '
            + JSON.stringify(String(e.resultText).slice(0, 30)) + ' 閉じた=' + e.closed
            + ' overlay=' + e.overlayExists);
        }
      }
      if (m.choiceWin || m.choiceLose) {
        console.log('       [記録] 判定つきの選択肢 (d20 を Math.random で固定 / ⛔ opts.auto は使わない):');
        for (const [tag, e] of [['d20=20', m.choiceWin], ['d20= 1', m.choiceLose],
          ['1 人 ', m.choiceParty1]]) {
          if (!e) continue;
          console.log('         ' + tag + '  ' + String(e.event).padEnd(20)
            + ' ロスター ' + (e.panel ? e.panel.rows : '—') + ' 行 '
            + JSON.stringify(e.panel ? e.panel.names : null)
            + ' success=' + (e.roadLast ? e.roadLast.success : '—')
            + ' 結末=' + JSON.stringify(String(e.resultText).slice(0, 24)));
        }
      }

      for (const [title, rows] of PENDINGS) {
        mark(title);
        for (const p of rows) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      mark('§9 ページエラー');
      check('(9a) 測定ページで pageerror / console.error が出ていない'
        + ' (⭐ 足した js/skill-check.js と js/road-events.js が world.html で壊れないこと。'
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
