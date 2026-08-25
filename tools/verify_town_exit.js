#!/usr/bin/env node
/*
 * verify_town_exit.js — 依頼書 #22「街 → ワールドマップへ出る導線」の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-25_town-world-exit.md` の §8 受入条件を機械的に測る。
 *
 * ■ 何を測るか (依頼書 §8 の番号と 1:1)
 *    §0 装置 … 変異アンカー / FACILITIES の id 列 / 起動と pageerror
 *    §1 札が 4 枚になり重なっていない
 *    §2 出口が world.html へ着く
 *    §3 一回性キーの扱い (2 経路で突き合わせる)
 *    §4 恒等 (既存 3 施設が 1 文字も変わっていない)
 *    §5 撤退 (?world=0)
 *
 * ■ ⭐⭐⭐ 3 値表示 (PASSED / FAILED / **PENDING**)
 *    本チケットは dev-loop で 4 項目に分割して実装する。**枠は最初から全部宣言し**、
 *    未実装の節は `pending()` で明示的に **PENDING** と出す。
 *      - 黙って緑にしない (省略された assert は「測っていない」と区別が付かない)
 *      - 後続の項目が「どれを埋めるか」を一目で見られる
 *      - **最終項目 (④) の完了条件は「PENDING 0」**
 *    ⚠ PENDING は exit code に影響しない (0 のまま)。FAILED があるときだけ exit 1。
 *
 * ■ 実装状況 (項目 ④ = 最終項目時点)
 *    ✅ §0〜§5 を全部実装済み = **PENDING 0**。--negative も 4/4 実行。
 *    ⚠ (0a) の変異アンカー 4 種のうち 3 種は `town.html` 側 = **項目 ② が書くまで存在しない**。
 *      → アンカー 0 件は `exit 3` ではなく **PENDING**。2 件以上だけ即死 (変異が効きすぎる
 *        事故は静かに壊れるため)。項目 ② が行を書いた瞬間、自動で本物の装置 assert に変わる。
 *
 * ■ ⭐⭐⭐ 空振りを防ぐ仕掛け
 *    - 件数を直書きしない。札の枚数は **TOWN_MAP.FACILITIES.length** から引く。
 *    - 札の文言をドライバに写さない。**FACILITIES の実体と DOM を突き合わせる**だけ。
 *    - 到達可能性や経路は自前で BFS を書かない。本番の TOWN_MAP.findPath をブラウザで呼ぶ。
 *    - --negative は「そのアンカーがまだ無い / その assert がまだ PENDING」を
 *      **空振りと区別して報告する** (実装が進むと自動で本物の判定に切り替わる)。
 *
 * ■ 使い方
 *     node tools/verify_town_exit.js
 *     node tools/verify_town_exit.js --negative              (負のコントロールの自己検査)
 *     node tools/verify_town_exit.js --mutate signcrowd      (手回し)
 *     node tools/verify_town_exit.js --mutate eatenter | noexitvia | worldalive
 *
 * ⚠ ポート 9460 (+1..+4 が --negative 用)。`grep -rn "arg('port'" tools/*.js` で空きを実測済み
 *   (9451 = driver_heromark_signplate が +4 まで使うので 9455 まで塞がっている / 9460 台は空き)。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

// ⚠ path.resolve 必須。区切り文字のまま持つと startsWith が必ず false で配信が全 404 になり、
//   症状はタイムアウトだけになる (恒久教訓)。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const HEADFUL  = argv.includes('--headful');
const NEGATIVE = argv.includes('--negative');
const PORT     = parseInt(arg('port', '9460'), 10);
const MUTATE   = arg('mutate', null);

/* ══ 負のコントロール ═══════════════════════════════════════════════════════
 *  ⚠ 置換前後で**長さを変える**こと。同じ長さだと「当たったのに何も変わらない」を検出できない。
 *  ⚠ 置換文字列は 1 行に閉じる (CRLF/LF 混在で複数行は必ず空振りする)。
 *  ⚠⚠ eatenter / noexitvia / worldalive のアンカーは **項目 ② が town.html に書く行**。
 *     それまでは 0 件ヒット = PENDING で通す (exit 3 にしない)。 */
const MUT_TARGETS = ['js/town-map.js', 'town.html'];
const MUTATIONS = {
  /* 出口分岐で enterVia **も**書いてしまう → (3b) だけが赤くなるべき。
     ⚠ (2a) は緑のまま。両方赤なら変異が効きすぎ (依頼書 §8 の負のコントロール表)。 */
  eatenter: [
    ['town.html',
     '        try { sessionStorage.setItem(EXIT_VIA_KEY, "town"); } catch (e) {}',
     '        try { sessionStorage.setItem(EXIT_VIA_KEY, "town"); sessionStorage.setItem(ENTER_VIA_KEY, "tavern"); } catch (e) {}  /* \u2605\u5909\u7570eatenter */'],
  ],
  /* gate の札を銀の鹿亭の札 (10,1) と同じ row の 3 タイル隣 (7,1) へ寄せる
     → (1b) だけが赤くなるべき ((1a)(1c)(1d) は緑のまま = 札は在るし押せる)。
     ⚠⚠⚠ 依頼書 §2-5 は「(6,1) へ寄せると 4px 交差する」と書いていたが **実測で崩れた**。
       実測 (desktop 1440x900 / zoom 0.875 / 単位は getBoundingClientRect):
         townSign_tavern  x=560 w=210 (client)  → stage で 240px
         townSign_gate          w=210 (client)  → stage で 240px
       ⇒ 鹿亭の札は `max-width: 280px` に **張り付いていない**。両方とも 240 stage px。
       ⇒ 同じ row で交差するのは中心間が 240 stage px = **3.75 タイル未満**の時だけ。
         (6,1) = 4 タイル差 = 256 stage px → **交差しない** (実測で client 12px の隙間が残る)。
         (7,1) = 3 タイル差 = 192 stage px → 交差する。
     ⭐⭐ 負のコントロールは「寄せれば重なるはず」という**思い込みで選ばない**。
       実際に重なる位置を矩形で測ってから選ぶ (verify_town_map.js の isolate と同じ教訓)。
     ⭐ 本番の (5,2) は鹿亭 (10,1) と **row が違う** (縦 64 stage px = client 56px > 札の高さ 47px)
       のでさらに余裕がある。⚠ (5,2) を動かすなら 3.75 タイルの間合を守ること。 */
  signcrowd: [
    ['js/town-map.js',
     '    { key: "gate", icon: "\uD83D\uDEAA", name: "\u753a\u306e\u5916\u3078", enter: [6, 0], sign: [5, 2],',
     '    { key: "gate", icon: "\uD83D\uDEAA", name: "\u753a\u306e\u5916\u3078", enter: [6, 0], sign: [7, 1],  /* \u2605\u5909\u7570signcrowd */'],
  ],
  /* exitVia を書かない → (3a)(3c)(3d) が赤くなるべき (駒が phlan でなく pier に立つ)。
     ⭐ 依頼書 §2-1 の罠 (⚓ アンカーが「新キー不要」と断言していた誤り) の再現。 */
  noexitvia: [
    ['town.html',
     '        try { sessionStorage.setItem(EXIT_VIA_KEY, "town"); } catch (e) {}',
     '        /* \u2605\u5909\u7570noexitvia: exitVia \u3092\u66f8\u304b\u306a\u3044 */'],
  ],
  /* ?world=0 でも出口を作ってしまう → (5a)(5c) が赤くなるべき。 */
  worldalive: [
    ['town.html',
     '        if (f.to && worldOff) return;',
     '        /* \u2605\u5909\u7570worldalive: ?world=0 \u3067\u3082\u51fa\u53e3\u3092\u4f5c\u3063\u3066\u3057\u307e\u3046 */'],
  ],
};
const MUT_ORDER = ['eatenter', 'signcrowd', 'noexitvia', 'worldalive'];
/* その変異で **赤くなるべき** assert の接頭辞。⭐ 「負のコントロールが空振りしていない」ことの
   唯一の判定基準。⚠ 依頼書 §8 の表の写し。勝手に緩めない。 */
const MUT_EXPECT = {
  eatenter:   ['(3b'],
  signcrowd:  ['(1b'],
  noexitvia:  ['(3a', '(3c', '(3d'],
  worldalive: ['(5a', '(5c'],
};
/* その変異で「同時に**緑のままである**べき」assert。
   ⚠ eatenter は (2a) を緑のままにすること (依頼書 §8: 両方赤なら変異が効きすぎ)。 */
const MUT_KEEP_GREEN = { eatenter: ['(2a'] };

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}

/* ⭐ 配信バイトの凍結。起動時に 1 回だけ読む。別窓が本体を保存しても走行中に混ざらない。 */
const FROZEN = {};
for (const rel of MUT_TARGETS) FROZEN[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ══ (0a) 変異アンカーの検算 ═══════════════════════════════════════════════
 *  ⛔ --mutate の有無に関わらず**毎回**回す。0 件ヒットの変異を放置すると、
 *    負のコントロールが静かに空振りして「全部緑」になる。
 *  ⭐ ただし本チケットは 4 項目に分割実装するので、判定は 3 値:
 *      0 件         → 'pending' (項目 ② がまだその行を書いていない)
 *      ちょうど 1 件 → 'ok'
 *      2 件以上 / 複数行 / 同長 / 他ファイルにも在る → 'fatal' (exit 3) */
function auditMutations() {
  const status = {};
  let fatal = 0;
  for (const key of MUT_ORDER) {
    let st = 'ok';
    const note = [];
    for (const pair of MUTATIONS[key]) {
      const rel = pair[0], from = pair[1], to = pair[2];
      if (from.indexOf('\n') >= 0) {
        console.error('[drv] ⛔ ' + key + ': 置換文字列が複数行'); st = 'fatal'; continue;
      }
      if (from.length === to.length) {
        console.error('[drv] ⛔ ' + key + ': 置換前後が同じ長さ → 当たっても何も変わらない'); st = 'fatal'; continue;
      }
      const n = FROZEN[rel].split(from).length - 1;
      // 他ファイルにも同じ行が無いこと (ファイルを取り違えた変異は別物を測る)
      const elsewhere = MUT_TARGETS.filter(r => r !== rel && FROZEN[r].indexOf(from) >= 0);
      if (elsewhere.length || n > 1) {
        console.error('[drv] ⛔ 変異 ' + key + ' のアンカーが ' + rel + ' に ' + n + ' 箇所'
          + (elsewhere.length ? ' / 他ファイルにも: ' + elsewhere.join(',') : '')
          + ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 70)));
        st = 'fatal';
      } else if (n === 0) {
        if (st !== 'fatal') st = 'pending';
        note.push(rel + ' に未実装');
      } else {
        note.push(rel + ' x1');
      }
    }
    if (st === 'fatal') fatal++;
    status[key] = { st: st, note: note.join(' / ') };
  }
  return { status: status, fatal: fatal };
}
function mutatedSource(rel) {
  let s = FROZEN[rel];
  if (!MUTATE) return s;
  for (const pair of MUTATIONS[MUTATE]) if (pair[0] === rel) s = s.split(pair[1]).join(pair[2]);
  return s;
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/town.html';
        const rel = u.replace(/^\/+/, '');
        if (MUT_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSource(rel)); return;
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

/* ══ 3 値の記録 ════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, st: cond ? 'PASSED' : 'FAILED' });
  console.log('  ' + (cond ? 'PASSED' : 'FAILED') + ' ' + name + (detail !== undefined ? '  -- ' + detail : ''));
}
/* ⭐ 未実装の受入条件。**黙って省略しない**。owner = どの項目が埋めるか。 */
function pending(name, owner) {
  results.push({ name: name, st: 'PENDING', owner: owner });
  console.log('  **PENDING** ' + name + '  -- ' + owner);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ══ ページを開く共通手順 ═══════════════════════════════════════════════════
 *  ⚠⚠ same-origin の localStorage / sessionStorage は **ページ遷移をまたいで生き残る**。
 *    document-start で dragonfighters 接頭辞を purge してから、この試験が要る値だけを置く。
 *  ⚠ purge は 1 タブ 1 回に絞る。絞らないと town → world の遷移で exitVia を自分で消してしまい、
 *    §3 (項目 ②) が測れなくなる。 */
async function openTown(browser, base, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  /* ⚠ /favicon.ico の 404 だけは除く。リポジトリに favicon が無いのは他ページも同じで、
     この機能の欠陥ではない。⛔ ただし 404 を一括では握り潰さない (除外はこの 1 本の URL だけ)。 */
  page.on('console', m => {
    if (m.type() !== 'error') return;
    let url = '';
    try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push('console: ' + m.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: opts.w || 1440, height: opts.h || 900,
                           isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try {
      if (sessionStorage.getItem('__drvSeeded')) return;
      sessionStorage.setItem('__drvSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('dragonfighters.') === 0) kill.push(k);
      }
      kill.forEach(k => localStorage.removeItem(k));
      const kill2 = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.indexOf('dragonfighters.') === 0) kill2.push(k);
      }
      kill2.forEach(k => sessionStorage.removeItem(k));
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify([seed.cls]));
      if (seed.plazaUnlocked) {
        /* ⚠ 闇市は解禁前は **DOM に作られない**。札を FACILITIES.length 枚数えるには
           解禁済みが要る (= 母集団ガード。ここを忘れると (1a) が永久に 3/4 で赤くなる)。 */
        localStorage.setItem('dragonfighters.plazaState',
          JSON.stringify({ unlocked: true, everEntered: true, gatekeeperEventSeen: true }));
      }
      /* ⚠ 前口上が未読だと鹿亭の札に .beckon (拡大アニメ) が付いて矩形が揺れる
         → (1b) の交差面積が実行ごとにブレる。既読にして固定する。 */
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (seed.exitVia !== null) sessionStorage.setItem('dragonfighters.exitVia', seed.exitVia);
    } catch (e) {}
  }, { cls: opts.cls || 'warrior', plazaUnlocked: opts.plazaUnlocked !== false,
       exitVia: (opts.exitVia === undefined || opts.exitVia === null) ? null : opts.exitVia });
  await page.goto(base + (opts.url || '/town.html'), { waitUntil: 'load', timeout: 30000 });
  return { page: page, errs: errs };
}
async function waitTownReady(page, ms) {
  try {
    await page.waitForFunction("window.__town && typeof window.__town.heroTile === 'function'", { timeout: ms || 15000 });
    return true;
  } catch (e) { return false; }
}

/* ══ §1 の測定本体 ═══════════════════════════════════════════════════════════
 *  ⭐ 件数を直書きしない。すべて TOWN_MAP.FACILITIES から引く。
 *  ⭐ 札の文言も写さない。DOM と FACILITIES を突き合わせるだけ。
 *  ⭐ 「出口」は key === 'gate' ではなく **f.to を持つもの**で見つける
 *    (key を写経すると、名前を変えたときにドライバが黙って空振りする)。
 *  ⭐ §5 (項目 ④) の conjunction もここから引けるように gateExists / gateHit を返す。 */
async function measureSigns(page) {
  return await page.evaluate(() => {
    const TM = window.TOWN_MAP;
    const facs = TM.FACILITIES.map(f => f.key);
    const gate = TM.FACILITIES.filter(f => f.to)[0] || null;
    const els = Array.prototype.slice.call(document.querySelectorAll('.townSign'));
    const rects = els.map(e => {
      const r = e.getBoundingClientRect();
      return { id: e.id, x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    });
    // 交差面積 (総和)。⭐ 「重なっていない」を面積 0 で言い切る。
    let overlap = 0, worst = null;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const w = Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x));
      const h = Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
      if (w * h > 0) {
        overlap += w * h;
        if (!worst || w * h > worst.area) worst = { pair: a.id + '/' + b.id, area: Math.round(w * h) };
      }
    }
    const t = document.getElementById('townTitle');
    const titleBottom = t ? t.getBoundingClientRect().bottom : 0;
    const belowTitle = rects.filter(r => r.y > titleBottom).length;

    // 出口の札の 1 行目 / 2 行目 + 実際に押せるか
    let gateText = null, gateHit = null, gateExists = false;
    if (gate) {
      const g = document.getElementById('townSign_' + gate.key);
      gateExists = !!g;
      if (g) {
        const nm = g.querySelector('.townSignName');
        const ds = g.querySelector('.townSignDesc');
        gateText = { line1: nm ? nm.textContent : null, line2: ds ? ds.textContent : null,
                     wantLine1: gate.name, wantLine2: gate.desc };
        const gr = g.getBoundingClientRect();
        const hit = document.elementFromPoint(gr.left + gr.width / 2, gr.top + gr.height / 2);
        gateHit = { got: hit ? (hit.id || hit.className || hit.tagName) : null,
                    self: !!(hit && (hit === g || g.contains(hit))) };
      }
    }
    return {
      facilities: facs,
      facCount: facs.length,
      signCount: els.length,
      signIds: rects.map(r => r.id),
      hudCount: document.querySelectorAll('#townHud button').length,
      overlap: overlap, worst: worst,
      titleBottom: titleBottom, belowTitle: belowTitle,
      gateKey: gate ? gate.key : null, gateExists: gateExists,
      gateClickable: !!(gateHit && gateHit.self),
      gateText: gateText, gateHit: gateHit,
      /* ⭐ (1b) が赤い時に「どれだけ重なったか」を語れるように矩形をそのまま持ち帰る。 */
      rects: rects.map(function (r) { return { id: r.id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }; })
    };
  });
}

/* ══ §2 §3 の共通手順: 街 → 出口を押す → world.html ════════════════════
 *  ⚠⚠⚠ 主人公が出口タイルに着いた **その rAF の中で** location.href が走る。
 *    後からポーリングしても文脈が消えていて間に合わない (固定時間窓でも同じ)。
 *    → **pagehide で「消える直前」を同期で焼き付け**、遷移先から読む。
 *  ⭐ 出口は key を写経せず **f.to を持つ施設**から引く (名前を変えても空振りしない)。
 *  ⭐ lastResult は **番兵を置いてから**測る。null 同士の一致は「触っていない」の
 *    証拠にならない (酒場が消費する一回性キーだから、誤って消されたら赤くしたい)。 */
const SENTINEL = 'DRV_LAST_RESULT_SENTINEL';

async function walkOutOfTown(browser, base, opts) {
  opts = opts || {};
  const o = await openTown(browser, base, { plazaUnlocked: true, w: opts.w, h: opts.h, mobile: opts.mobile });
  const out = { page: o.page, errs: o.errs, why: null };
  out.alive = await waitTownReady(o.page, 12000);
  if (!out.alive) { out.why = 'town が起動しない'; return out; }

  out.gate = await o.page.evaluate(() => {
    const g = window.TOWN_MAP.FACILITIES.filter(f => f.to)[0];
    return g ? { key: g.key, to: g.to, enter: g.enter } : null;
  });
  if (!out.gate) { out.why = 'f.to を持つ施設が FACILITIES に無い'; return out; }

  out.before = await o.page.evaluate((sent) => {
    sessionStorage.setItem('dragonfighters.lastResult', sent);
    const snap = () => ({
      tile: window.__town ? window.__town.heroTile() : null,
      exitVia:    sessionStorage.getItem('dragonfighters.exitVia'),
      enterVia:   sessionStorage.getItem('dragonfighters.enterVia'),
      lastResult: sessionStorage.getItem('dragonfighters.lastResult')
    });
    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem('__drvAtExit', JSON.stringify(snap())); } catch (e) {}
    });
    return snap();
  }, SENTINEL);

  /* 押し口 (desktop = 立て札 / compact = HUD ボタン) を **実座標でクリック**する。
     ⚠ elementFromPoint が押し口自身でないなら「押せない」= 欠陥なのでそのまま落とす。 */
  const id = (opts.viaHud ? 'townHudBtn_' : 'townSign_') + out.gate.key;
  out.hit = await o.page.evaluate((sel) => {
    const el = document.getElementById(sel);
    if (!el) return { id: sel, found: false };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const h = document.elementFromPoint(cx, cy);
    return { id: sel, found: true, x: cx, y: cy,
             self: !!(h && (h === el || el.contains(h))),
             got: h ? (h.id || h.className || h.tagName) : null };
  }, id);
  if (!out.hit.found) { out.why = id + ' が DOM に無い'; return out; }
  if (!out.hit.self)  { out.why = id + ' が他の要素に覚われている: ' + out.hit.got; return out; }

  try {
    await Promise.all([
      o.page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      o.page.mouse.click(Math.round(out.hit.x), Math.round(out.hit.y)),
    ]);
  } catch (e) { out.why = '遷移しなかった: ' + e.message; return out; }

  await o.page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 }).catch(() => {});
  out.world = await o.page.evaluate(() => {
    const N = (window.WORLD_MAP && window.WORLD_MAP.NODES) || {};
    return {
      path: location.pathname, search: location.search,
      /* ⭐ 'phlan' を写経しない。「街へ戻る札」= enter を持つノードから引く。 */
      townNode: Object.keys(N).find(k => N[k].enter !== undefined) || null,
      heroNode: window.__world ? window.__world.heroNode() : null,
      spawnForTown: window.WORLD_MAP ? window.WORLD_MAP.spawnFor('town') : null,
      spawnVia: window.__world ? window.__world.spawnVia() : null,
      exitVia:    sessionStorage.getItem('dragonfighters.exitVia'),
      enterVia:   sessionStorage.getItem('dragonfighters.enterVia'),
      lastResult: sessionStorage.getItem('dragonfighters.lastResult'),
      atExit: (function () { try { return JSON.parse(sessionStorage.getItem('__drvAtExit')); } catch (e) { return null; } })()
    };
  });
  return out;
}

/* ══ §4 恒等 (非退行) の測定: 立て札 → 素の tavern.html ════════════════
 *  ⭐ 出口の分岐 (f.to) が **既存経路を巻き込んでいない**ことを、実際に踏んで測る。
 *  ⚠⚠⚠ tavern.html は enterVia を **読んだ直後に removeItem する** (tavern.html:1866-1867)。
 *    → 着地後に sessionStorage を読むと必ず null で、「そもそも書かれていない」と区別できない。
 *    ⭐ だから 2 経路で突き合わせる:
 *      ① town が消える直前の pagehide スナップショット (= town が書いたか)
 *      ② 酒場が解釈した window.__enterVia            (= 届いて解釈されたか)
 *  ⭐ 押し方は walkOutOfTown と同じ「実座標クリック」。key だけ差し替える。
 *  ⚠ 待つのは load ではなく domcontentloaded (酒場は 6,800 行 + 音源で load が重い)。 */
async function enterFacilityBySign(browser, base, key) {
  const o = await openTown(browser, base, { plazaUnlocked: true });
  const out = { page: o.page, errs: o.errs, why: null, keep: null, hit: null, dest: null };
  if (!(await waitTownReady(o.page, 12000))) { out.why = 'town が起動しない'; return out; }

  /* ⭐ (4a) の実体はここで採る。⛔ gate (f.to を持つ 4 件目) は含めない
     (4 件目は via ではなく to を持つ別形なので、恒等の母集団ではない)。 */
  out.keep = await o.page.evaluate(() => window.TOWN_MAP.FACILITIES.filter(f => !f.to).map(f => ({
    key: f.key, name: f.name, desc: f.desc, icon: f.icon, enter: f.enter, sign: f.sign, via: f.via })));

  await o.page.evaluate(() => {
    window.addEventListener('pagehide', function () {
      try {
        sessionStorage.setItem('__drvAtEnter', JSON.stringify({
          exitVia:  sessionStorage.getItem('dragonfighters.exitVia'),
          enterVia: sessionStorage.getItem('dragonfighters.enterVia')
        }));
      } catch (e) {}
    });
  });

  const id = 'townSign_' + key;
  out.hit = await o.page.evaluate((sel) => {
    const el = document.getElementById(sel);
    if (!el) return { id: sel, found: false };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const h = document.elementFromPoint(cx, cy);
    return { id: sel, found: true, x: cx, y: cy,
             self: !!(h && (h === el || el.contains(h))),
             got: h ? (h.id || h.className || h.tagName) : null };
  }, id);
  if (!out.hit.found) { out.why = id + ' が DOM に無い'; return out; }
  if (!out.hit.self)  { out.why = id + ' が他の要素に覆われている: ' + out.hit.got; return out; }

  try {
    await Promise.all([
      o.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      o.page.mouse.click(Math.round(out.hit.x), Math.round(out.hit.y)),
    ]);
  } catch (e) { out.why = '遷移しなかった: ' + e.message; return out; }

  await o.page.waitForFunction('"__enterVia" in window', { timeout: 20000 }).catch(() => {});
  out.dest = await o.page.evaluate(() => ({
    path: location.pathname, search: location.search,
    /* ⚠ null と「キーごと無い」を潰さない (後者は酒場側の受け口が動いていない)。 */
    hasKey: ('__enterVia' in window),
    interpreted: ('__enterVia' in window) ? window.__enterVia : null,
    atEnter: (function () { try { return JSON.parse(sessionStorage.getItem('__drvAtEnter')); } catch (e) { return null; } })()
  }));
  return out;
}

/* ══ (3d) 地方全景 → 港町フランの札を押して街へ戻る ══════════════════
 *  ⭐ ノード id を写経せず **enter を持つノード** を押す (唯一の正は js/world-map.js)。
 *  ⚠ #worldHero は pointer-events: none なので、駒がその札の上に立っていても押せる。 */
async function returnToTown(page) {
  const r = { enterId: null, why: null };
  r.enterId = await page.evaluate(() => {
    const N = (window.WORLD_MAP && window.WORLD_MAP.NODES) || {};
    return Object.keys(N).find(k => N[k].enter !== undefined) || null;
  });
  if (!r.enterId) { r.why = 'enter を持つノードが無い'; return r; }
  const pt = await page.evaluate((i) => window.__world.clientFromNode(i), r.enterId);
  if (!pt) { r.why = 'clientFromNode が null'; return r; }
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      page.mouse.click(Math.round(pt.x), Math.round(pt.y)),
    ]);
  } catch (e) { r.why = '遷移しなかった: ' + e.message; return r; }
  await page.waitForFunction('!!window.__town', { timeout: 20000 }).catch(() => {});
  const t = await page.evaluate(() => ({
    path: location.pathname, search: location.search,
    tile: window.__town ? window.__town.heroTile() : null,
    spawnVia: window.__town ? window.__town.spawnVia() : null,
    /* ⭐ (6,1) を写経しない。唯一の正は js/town-map.js の SPAWNS.town。 */
    spawnTown: (window.TOWN_MAP && window.TOWN_MAP.SPAWNS.town) || null,
    exitVia: sessionStorage.getItem('dragonfighters.exitVia')
  }));
  Object.keys(t).forEach(k => { r[k] = t[k]; });
  return r;
}

// ══════════════════════════════════════════════════════════════════════════════
// --negative : 4 変異を自分で回し、赤くならなければ exit 1
//   ⭐ 「まだアンカーが無い」「その assert がまだ PENDING」を**空振りと区別して**報告する。
//     実装 (項目 ②③) が進むと自動で本物の判定に切り替わる。
// ══════════════════════════════════════════════════════════════════════════════
function runNegative(audit) {
  console.log('══════ 負のコントロール (--negative) ══════');
  console.log('  ⭐ 「その変異で赤くなるはずの assert」が実際に FAILED になるかを見る。');
  let bad = 0, pend = 0;
  MUT_ORDER.forEach((key, i) => {
    const want = MUT_EXPECT[key];
    if (audit.status[key].st === 'pending') {
      pend++;
      console.log('  **PENDING** 変異 ' + key + ' — アンカー未実装 (' + audit.status[key].note
        + ') / 赤くなるべき: ' + want.join(' '));
      return;
    }
    const port = PORT + 1 + i;
    let out = '';
    try {
      out = execFileSync(process.execPath, [__filename, '--mutate', key, '--port', String(port)],
                         { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: ROOT });
    } catch (e) {
      out = (e.stdout || '') + (e.stderr || '');   // FAILED があると exit 1 で来る = 正常
    }
    const lines = out.split(/\r?\n/);
    const hasFailed = (pfx) => lines.some(l => l.indexOf('FAILED ' + pfx) >= 0);
    const isPending = (pfx) => lines.some(l => l.indexOf('**PENDING** ' + pfx) >= 0);

    const notYet = want.filter(pfx => !hasFailed(pfx) && isPending(pfx));
    if (notYet.length === want.length) {
      pend++;
      console.log('  **PENDING** 変異 ' + key + ' — 赤くなるべき ' + want.join(' ')
        + ' がまだ受入条件として未実装');
      return;
    }
    const missing = want.filter(pfx => !hasFailed(pfx) && !isPending(pfx));
    /* 「緑のままであるべき」assert が赤くなっていたら効きすぎ。
       ⚠ その assert 自体がまだ PENDING のときは判定できないので数えない。 */
    const keep = MUT_KEEP_GREEN[key] || [];
    const overreach = keep.filter(pfx => hasFailed(pfx));
    const ok = missing.length === 0 && overreach.length === 0;
    if (!ok) bad++;
    console.log('  ' + (ok ? 'PASSED' : 'FAILED') + ' 変異 ' + key + ' で ' + want.join(' / ')
      + ' が赤くなる'
      + (missing.length ? '  — 赤くならなかった: ' + missing.join(' ') : '')
      + (overreach.length ? '  — ⛔ 効きすぎ (緑のままであるべき): ' + overreach.join(' ') : '')
      + (notYet.length ? '  (うち未実装: ' + notYet.join(' ') + ')' : ''));
    if (!ok) {
      const tail = lines.filter(l => /PASSED|FAILED|PENDING/.test(l)).slice(-40).join('\n');
      console.log('    ---- 変異 ' + key + ' の出力 (末尾) ----\n' + tail);
    }
  });
  console.log('════════════════════════════════════════════');
  console.log('  ' + (MUT_ORDER.length - pend) + ' / ' + MUT_ORDER.length + ' 実行  (PENDING ' + pend + ')');
  console.log(bad === 0 ? '  空振りした変異は無い' : '  ⛔ ' + bad + ' 本が空振り = 検出器が壊れている');
  console.log('════════════════════════════════════════════');
  process.exit(bad === 0 ? 0 : 1);
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_town_exit.js' + (MUTATE ? '  [変異 ' + MUTATE + ']' : '') + ' ===\n');

  const audit = auditMutations();
  if (audit.fatal) {
    console.error('[drv] ⛔ (0a) 変異アンカーの検算に失敗 → 測定不能');
    process.exit(3);
  }
  if (NEGATIVE) return runNegative(audit);

  /* ── §0 装置 (先に母集団を確かめる) ──────────────────────────────────── */
  console.log('--- §0 装置 (先に母集団を確かめる) ---');
  for (const key of MUT_ORDER) {
    const st = audit.status[key];
    const nm = '(0a-' + key + ') [装置] 変異アンカーが 1 ファイル 1 箇所にヒットする';
    if (st.st === 'pending') pending(nm, '項目② が town.html にこの行を書くまで存在しない (' + st.note + ')');
    else check(nm, true, st.note);
  }

  const puppeteer = loadPuppeteer();
  const exe = findBrowser();
  const profile = require('./_pptr_profile')('df_townexit_');
  const srv = await startServer(PORT);
  const base = 'http://localhost:' + PORT;
  console.log('[drv] ' + base + '  browser=' + path.basename(exe)
    + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
  const browser = await puppeteer.launch({
    executablePath: exe, headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + profile] });

  try {
    const o = await openTown(browser, base, { plazaUnlocked: true });
    const page = o.page;
    const alive = await waitTownReady(page, 12000);
    check('(0c) town.html が起動し window.__town が載っている', alive);

    let s = null;
    if (alive) {
      s = await measureSigns(page);
      /* ⭐ 件数ではなく id 列。母集団が増えたことを黙って飲まない。
         ⛔ 札の文言はここに写さない (唯一の正は FACILITIES / (1c) が実体照合する)。 */
      check('(0b) TOWN_MAP.FACILITIES の id 列が tavern,shop,plaza,gate ちょうど',
            s.facilities.join(',') === 'tavern,shop,plaza,gate', s.facilities.join(','));
    } else {
      check('(0b) TOWN_MAP.FACILITIES の id 列が tavern,shop,plaza,gate ちょうど', false, '起動できず');
    }

    /* ── §1 札が 4 枚になり、重なっていない ───────────────────────────── */
    console.log('\n--- §1 札が 4 枚になり、重なっていない ---');
    if (!s) {
      check('(1a) .townSign の枚数 == FACILITIES.length / compact 390 の #townHud button も同数', false, '起動できず');
      check('(1b) 札同士の交差面積が 0 / 全部 #townTitle の下端より下 (desktop 1440x900)', false, '起動できず');
      check('(1c) 出口の札の 1 行目 / 2 行目が FACILITIES の name / desc と文字列一致', false, '起動できず');
      check('(1d) 出口の札の中心の elementFromPoint が自分自身か子孫 (= 実際に押せる)', false, '起動できず');
    } else {
      // ⛔ 4 を直書きしない。実体 (FACILITIES.length) から引く。
      const compact = await openTown(browser, base, { plazaUnlocked: true, w: 390, h: 844, mobile: true });
      const cAlive = await waitTownReady(compact.page, 12000);
      const cs = cAlive ? await measureSigns(compact.page) : null;
      check('(1a) .townSign の枚数 == FACILITIES.length / compact 390 の #townHud button も同数',
            s.signCount === s.facCount && !!cs && cs.hudCount === cs.facCount,
            'desktop signs=' + s.signCount + '/' + s.facCount + ' [' + s.signIds.join(' ') + ']'
            + '  compact hud=' + (cs ? cs.hudCount + '/' + cs.facCount : 'n/a'));
      await compact.page.close();

      check('(1b) 札同士の交差面積が 0 / 全部 #townTitle の下端より下 (desktop 1440x900)',
            s.overlap === 0 && s.signCount > 0 && s.belowTitle === s.signCount,
            'overlap=' + s.overlap.toFixed(1) + (s.worst ? ' worst=' + s.worst.pair + ' ' + s.worst.area + 'px2' : '')
            + '  belowTitle=' + s.belowTitle + '/' + s.signCount
            + '  titleBottom=' + s.titleBottom.toFixed(1)
            + '  rects=' + JSON.stringify(s.rects));

      /* ⛔ ドライバ側に札の文言を書かない。実体から引いて比べる。 */
      const gt = s.gateText;
      check('(1c) 出口の札の 1 行目 / 2 行目が FACILITIES の name / desc と文字列一致',
            !!gt && !!gt.wantLine1 && !!gt.wantLine2 && gt.line1 === gt.wantLine1 && gt.line2 === gt.wantLine2,
            gt ? JSON.stringify(gt) : '出口 (f.to を持つ施設) の札が DOM に無い');

      check('(1d) 出口の札の中心の elementFromPoint が自分自身か子孫 (= 実際に押せる)',
            s.gateClickable,
            s.gateHit ? 'id=townSign_' + s.gateKey + ' ' + JSON.stringify(s.gateHit) : '出口の札が DOM に無い');
    }
    check('(0c-err) pageerror / console error が 0 件', o.errs.length === 0, o.errs.join(' | ') || 'なし');
    await page.close();

    /* ── §2 出口が world.html へ着く ──────────────────────────────── */
    console.log('\n--- §2 出口が world.html へ着く ---');
    /* ⭐ (6,0) / 'world.html' をドライバに写経しない。全部 FACILITIES の実体から引く。 */
    const gx = await walkOutOfTown(browser, base, {});
    const gT = gx.gate ? { c: gx.gate.enter[0], r: gx.gate.enter[1] } : null;
    const gW = gx.world || null;
    const gA = gW && gW.atExit ? gW.atExit : null;
    const gArrived = !!(gT && gA && eq(gA.tile, gT));
    const gLanded  = !!(gW && gx.gate && gW.path === '/' + gx.gate.to);
    const gDetail  = (gx.why ? '⛔ ' + gx.why + '  ' : '')
      + 'gate=' + JSON.stringify(gx.gate) + '  hit=' + JSON.stringify(gx.hit || null)
      + '  atExit=' + JSON.stringify(gA) + '  world=' + JSON.stringify(gW);

    check('(2a) townSign_gate を押す → 主人公が (6,0) に立ち location.pathname が /world.html',
          gArrived && gLanded, gDetail);
    check('(2b) 遷移後の location.search === "" (⛔ クエリを足していない)',
          !!gW && gW.search === '', gW ? JSON.stringify({ path: gW.path, search: gW.search }) : '遷移していない');

    /* compact は **HUD ボタンから**押す (押し口が別系統なので別に測る)。 */
    const cxr = await walkOutOfTown(browser, base, { w: 390, h: 844, mobile: true, viaHud: true });
    const cT = cxr.gate ? { c: cxr.gate.enter[0], r: cxr.gate.enter[1] } : null;
    const cW = cxr.world || null;
    const cA = cW && cW.atExit ? cW.atExit : null;
    check('(2c) compact 390x844 で townHudBtn_gate から押しても (2a)(2b) と同じ結果',
          !!(cT && cA && eq(cA.tile, cT)) && !!(cW && cxr.gate && cW.path === '/' + cxr.gate.to)
          && !!cW && cW.search === '',
          (cxr.why ? '⛔ ' + cxr.why + '  ' : '')
          + 'hit=' + JSON.stringify(cxr.hit || null) + '  atExit=' + JSON.stringify(cA)
          + '  world=' + (cW ? JSON.stringify({ path: cW.path, search: cW.search, heroNode: cW.heroNode }) : 'null'));
    if (cxr.page) await cxr.page.close();

    /* ── §3 一回性キーの扱い ────────────────────────────────── */
    console.log('\n--- §3 一回性キーの扱い (2 経路で突き合わせる) ---');
    check('(3a) 遷移直後 sessionStorage["dragonfighters.exitVia"] === "town"',
          !!gW && gW.exitVia === 'town',
          gW ? 'world で読んだ値=' + JSON.stringify(gW.exitVia)
             + ' / 消える直前=' + JSON.stringify(gA && gA.exitVia)
             + ' / world が解釈した spawnVia=' + JSON.stringify(gW.spawnVia)
             : '遷移していない');

    /* ⛔ 書き忘れより誤爆のほうが静かに壊れる。書いていないことも測る。 */
    check('(3b) ⛔ dragonfighters.enterVia が null のまま / lastResult も遷移前後で不変',
          !!gW && !!gA && gW.enterVia === null && gA.enterVia === null
          && !!gx.before && gx.before.lastResult === SENTINEL
          && gA.lastResult === SENTINEL && gW.lastResult === SENTINEL,
          'before=' + JSON.stringify(gx.before || null)
          + ' / atExit=' + JSON.stringify(gA)
          + ' / world=' + JSON.stringify(gW ? { enterVia: gW.enterVia, lastResult: gW.lastResult } : null));

    /* ⭐ ①だけだと「本番が spawnFor を呼んでいない」を見逃すので ② と両方見る。
       ⭐ 'phlan' はドライバに写経せず、**enter を持つノード** (= 街へ戻る札) と照合する。 */
    check('(3c) world 側の駒が phlan に立つ (① WORLD_MAP.spawnFor("town") ② __world.heroNode() の 2 経路)',
          !!gW && !!gW.townNode && gW.spawnForTown === gW.townNode && gW.heroNode === gW.townNode,
          gW ? '街へ戻るノード=' + JSON.stringify(gW.townNode)
             + ' / ① spawnFor("town")=' + JSON.stringify(gW.spawnForTown)
             + ' / ② heroNode()=' + JSON.stringify(gW.heroNode)
             : '遷移していない');

    /* (3d) そのまま港町フランの札を押して街へ戻る。 */
    const back = gW ? await returnToTown(gx.page) : null;
    const bT = back && back.spawnTown ? { c: back.spawnTown[0], r: back.spawnTown[1] } : null;
    /* ⭐ SPAWNS.town と一致するだけだとデータの写しになるので、
       「出口タイルの 1 マス内側」(直前に居た場所の前) という規則も同時に見る。 */
    const bAdj = !!(bT && gT && Math.abs(bT.c - gT.c) + Math.abs(bT.r - gT.r) === 1);
    check('(3d) 港町フランの札から街へ戻る → 主人公が (6,1) / exitVia が null (消費済み)',
          !!back && back.path === '/town.html' && back.search === ''
          && !!bT && eq(back.tile, bT) && bAdj
          && back.spawnVia === 'town' && back.exitVia === null,
          back ? (back.why ? '⛔ ' + back.why + '  ' : '')
                 + 'enterId=' + JSON.stringify(back.enterId) + ' path=' + JSON.stringify(back.path)
                 + ' tile=' + JSON.stringify(back.tile) + ' SPAWNS.town=' + JSON.stringify(back.spawnTown)
                 + ' 出口の1マス内側=' + bAdj
                 + ' spawnVia=' + JSON.stringify(back.spawnVia) + ' exitVia=' + JSON.stringify(back.exitVia)
               : 'world へ遷移していないので戻れない');
    if (gx.page) await gx.page.close();

    /* ── §4 恒等 (非退行) ─────────────────────────────────────────────── */
    console.log('\n--- §4 恒等 (非退行) ---');
    /* ⭐⭐ ドライバへ期待値を写してよいのは **ここだけ**。「1 文字も変わっていない」は
       写しと突き合わせる以外に測りようが無い。値は本チケット着手前の HEAD (8c402f4) の
       js/town-map.js から機械生成した。
       ⚠ \u エスケープにしてあるのは 🛡️ が U+1F6E1 + U+FE0F の **2 コードポイント**で、
         見た目では写経ズレ (VS16 の欠落) を検出できないため。
       ⛔ gate は含めない (4 件目は via ではなく to を持つ別形)。 */
    const KEEP3 = [
      { key: "tavern", name: "\u9280\u306e\u9e7f\u4ead", desc: "\u5bbf\u3068\u9152\u3002\u4ef2\u9593\u3092\u52df\u308a\u3001\u4f9d\u983c\u3092\u53d7\u3051\u308b",
        icon: "\ud83e\udd8c", enter: [10, 2], sign: [10, 1], via: "tavern" },
      { key: "shop", name: "\u6b66\u5668\u9632\u5177\u5c4b", desc: "\u5263\u30fb\u93a7\u30fb\u5f13\u3002\u65c5\u88c5\u3092\u6574\u3048\u308b",
        icon: "\ud83d\udee1\ufe0f", enter: [15, 2], sign: [15, 1], via: "shop" },
      { key: "plaza", name: "\u602a\u3057\u3044\u77f3\u6bb5", desc: "\u4e0b\u308a\u308c\u3070\u95c7\u5e02\u3002\u7259\u8ca8\u3060\u3051\u304c\u7269\u3092\u8a00\u3046",
        icon: "\ud83c\udf11", enter: [3, 10], sign: [2, 10], via: "plaza" },
    ];
    const fx = await enterFacilityBySign(browser, base, 'tavern');
    check('(4a) 既存 3 施設の key/name/desc/icon/enter/sign/via が 1 文字も変わっていない',
          !!fx.keep && eq(fx.keep, KEEP3),
          fx.keep ? JSON.stringify(fx.keep) : '⛔ ' + (fx.why || '街が起動していない'));

    /* ⭐ ① town が書いたか (pagehide) ② 酒場が解釈したか (__enterVia) の 2 経路。
       ⭐ exitVia が null のままであることも同時に見る = 出口の分岐 (f.to) が
         既存経路へ漏れ出していないことの裏。 */
    const dz = fx.dest;
    const aE = dz && dz.atEnter ? dz.atEnter : null;
    check('(4b) townSign_tavern → 素の /tavern.html (search === "") かつ enterVia === "tavern"',
          !!dz && dz.path === '/tavern.html' && dz.search === ''
          && !!aE && aE.enterVia === 'tavern' && aE.exitVia === null
          && dz.hasKey === true && dz.interpreted === 'tavern',
          (fx.why ? '⛔ ' + fx.why + '  ' : '')
          + 'hit=' + JSON.stringify(fx.hit)
          + ' / ① 消える直前=' + JSON.stringify(aE)
          + ' / ② 酒場が解釈した __enterVia=' + JSON.stringify(dz ? dz.interpreted : null)
          + ' (hasKey=' + (dz ? dz.hasKey : 'n/a') + ')'
          + ' / dest=' + JSON.stringify(dz ? { path: dz.path, search: dz.search } : null));
    if (fx.page) await fx.page.close();

    /* ── §5 撤退 ──────────────────────────────────────────────────────── */
    console.log('\n--- §5 撤退 (?world=0) ---');
    /* ⭐⭐⭐ 「3」を直書きしない。母集団の唯一の正は FACILITIES なので **facCount - 1** で引く
       (出口は f.to を持つちょうど 1 件 = §0 の (0b) が id 列で押さえている)。
       ⚠⚠ openTown の purge は sessionStorage の __drvSeeded で **1 タブ 1 回**。
         (5b) は「クエリ無しの 2 回目のロード」を測るので、**同じタブで page.goto を 2 回**踏む。
         新しいタブを作ると purge が走って worldOff が消え、assert が静かに空振りする。 */
    const off = await openTown(browser, base, { plazaUnlocked: true, url: '/town.html?world=0' });
    const offAlive = await waitTownReady(off.page, 12000);
    const sOff = offAlive ? await measureSigns(off.page) : null;

    /* compact は別タブで測る (HUD ボタンは札と同じループで作られるが、押し口が別系統なので別に見る)。 */
    const offC = await openTown(browser, base,
      { plazaUnlocked: true, url: '/town.html?world=0', w: 390, h: 844, mobile: true });
    const offCAlive = await waitTownReady(offC.page, 12000);
    const cOff = offCAlive ? await measureSigns(offC.page) : null;

    check('(5a) town.html?world=0 → .townSign が 3 枚 / townSign_gate が DOM に無い / compact の #townHud button も 3 個',
          !!sOff && sOff.signCount === sOff.facCount - 1 && sOff.gateExists === false
          && sOff.signIds.indexOf('townSign_' + sOff.gateKey) < 0
          && !!cOff && cOff.hudCount === cOff.facCount - 1,
          sOff ? 'desktop signs=' + sOff.signCount + '/' + sOff.facCount
               + ' (期待 facCount-1=' + (sOff.facCount - 1) + ') [' + sOff.signIds.join(' ') + ']'
               + ' gateKey=' + JSON.stringify(sOff.gateKey) + ' gateExists=' + sOff.gateExists
               + '  compact hud=' + (cOff ? cOff.hudCount + '/' + cOff.facCount : 'n/a')
             : '街が起動していない');
    if (offC.page) await offC.page.close();

    /* (5b) 同じタブで素の town.html をもう一度ロードする。purge は走らないので
       ?world=0 が sessionStorage へ写っていれば効き続けるはず。 */
    await off.page.goto(base + '/town.html', { waitUntil: 'load', timeout: 30000 });
    const off2Alive = await waitTownReady(off.page, 12000);
    const sOff2 = off2Alive ? await measureSigns(off.page) : null;
    const off2Env = await off.page.evaluate(() => ({
      search: location.search,
      worldOff: sessionStorage.getItem('dragonfighters.worldOff')
    }));
    check('(5b) ?world=0 の後に素の town.html をロードしても効いている (sessionStorage へ写っている)',
          !!sOff2 && off2Env.search === '' && off2Env.worldOff === '1'
          && sOff2.gateExists === false && sOff2.signCount === sOff2.facCount - 1,
          (sOff2 ? 'signs=' + sOff2.signCount + '/' + sOff2.facCount
                 + ' gateExists=' + sOff2.gateExists + ' [' + sOff2.signIds.join(' ') + ']'
                 : '街が起動していない')
          + '  env=' + JSON.stringify(off2Env));

    /* (5c) ⭐⭐⭐ 「?world=0 で緑」ではなく、**同じ conjunction を両モードへ当てる**。
       ON で成立し OFF で崩れて初めて「このスイッチが効いている」と言える
       (OFF だけ測ると、出口がそもそも壊れていても永久に緑になる)。
       ⭐ 材料は measureSigns の 1 本から全部引く。ON = §1 で採った s をそのまま使う。 */
    const conj = (m) => !!m && m.gateExists === true && m.gateClickable === true && m.signCount === m.facCount;
    const conjDump = (m) => m ? JSON.stringify({ gateExists: m.gateExists, gateClickable: m.gateClickable,
                                                 signCount: m.signCount, facCount: m.facCount }) : 'null';
    check('(5c) ⭐ 同じ測定関数を両モードへ当てて conjunction が崩れる (gateExists && gateClickable && signCount === facilities.length)',
          conj(s) === true && conj(sOff) === false && conj(sOff2) === false,
          'ON=' + conj(s) + ' ' + conjDump(s)
          + ' / OFF=' + conj(sOff) + ' ' + conjDump(sOff)
          + ' / OFF(2回目)=' + conj(sOff2) + ' ' + conjDump(sOff2));
    if (off.page) await off.page.close();

  } catch (e) {
    console.error('\n[drv] 例外: ' + e.message + '\n' + (e.stack || ''));
    results.push({ name: '例外なく完走', st: 'FAILED' });
  }

  await browser.close();
  srv.close();

  const pass = results.filter(r => r.st === 'PASSED');
  const fail = results.filter(r => r.st === 'FAILED');
  const pend = results.filter(r => r.st === 'PENDING');
  console.log('\n════════════════════════════════════════════');
  console.log('  素 ' + pass.length + '/' + (pass.length + fail.length) + ' PASSED'
    + '  (PENDING ' + pend.length + ')' + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
  if (fail.length) { console.log('  FAILED:'); fail.forEach(r => console.log('    - ' + r.name)); }
  if (pend.length) {
    console.log('  PENDING (⭐ 最終項目 ④ の完了条件 = ここが 0 になること):');
    pend.forEach(r => console.log('    - ' + r.name + '  [' + r.owner + ']'));
  }
  console.log('════════════════════════════════════════════');
  process.exit(fail.length ? 1 : 0);
})();
