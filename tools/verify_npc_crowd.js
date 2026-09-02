#!/usr/bin/env node
/*
 * verify_npc_crowd.js — 銀の鹿亭と港町フランの NPC 群衆 (#41) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-01_town-tavern-npc-crowd.md` の §8 受入条件を機械的に測る。
 * 流用元は tools/verify_tavern_map.js (http 自前配信 + 配信バイトの凍結 + 実 Chrome 直駆動 +
 * PASSED / FAILED / **PENDING** の 3 値表示 + --negative)。
 *
 * ■ 出力は 3 値。最終的な完了条件 = **PENDING 0**
 *   exit コードは FAILED が 0 件なら 0 (PENDING は 0 のまま通す)。
 *   → 後続項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認できる。
 *
 * ■ 実装状況 (⭐ 項目 1 = ここまで)
 *     §0 (0a-town)(0b)(0c)(0d)(0e) / §1 (1z)(1a)(1b)(1c)(1d)(1e)  … 実装済
 *     §0 (0a-tavern)(0b-dom)                                      … **PENDING** (項目 2)
 *     §2 描画 / §3 吹き出し                                        … **PENDING** (項目 2 / 項目 3)
 *     §4 恒等 / §5 撤退                                            … **PENDING** (項目 3 / 項目 4)
 *     負のコントロール 13 本                                        … **PENDING** (項目 4)
 *
 * ■ ⚠⚠⚠ (0a) を注入で緑にしてはいけない
 *   このドライバは酒場側の **データ層**を測るために、tavern.html を開いた後で
 *   page.addScriptTag({ url: '/js/npc-crowd.js' }) を撃って NPC_CROWD を載せている。
 *   ⛔ これは「tavern.html が実際に読み込んでいる」ことの証拠には **ならない**。
 *   → (0a-tavern) は「**配信された tavern.html のバイトに <script src> が実在するか**」だけを
 *     見る。項目 1 の時点では実在しないので **PENDING**。項目 2 が結線したら PASSED へ変える。
 *   ⭐ 街側 (0a-town) は既に結線済みなので、注入なしで
 *     ① 配信バイトにタグが実在する ② ページが /js/npc-crowd.js を実際に要求した
 *     ③ window.NPC_CROWD が生きている の **3 つの AND** で測る。
 *   ⭐⭐⭐ #23 で js/world-map.js の <script src> を書き忘れ、5 本の assert が
 *     「何も起きないのに全部緑」になった事故と同型を、ここで防いでいる。
 *
 * ■ ⭐⭐⭐ 不変条件は自前で書き直さない
 *   到達性 / 通行可否は **本番の TAVERN_MAP.isWalkable / TOWN_MAP.isWalkable を
 *   ブラウザで呼ぶ**。不変条件は **本番の NPC_CROWD.validate() を呼ぶ**。
 *   写経すると実装とドライバが同じ間違いを共有して両方緑になる (恒久教訓)。
 *
 * ■ ⭐ ただし (1a) だけは 2 経路
 *   経路 ① … ブラウザで NPC_CROWD.validate(list, MAP, 実 DOM から測った札) → problems 0 件
 *   経路 ② … ドライバが **自前で** データからスプライト矩形とセル列を起こし、
 *            実 DOM から測った札の矩形との交差を数える (⛔ boxOf / cellsOf を呼ばない)
 *   ⚠ 項目 1 の時点では .npcUnit がまだ DOM に無いので、経路 ② は
 *     「**データから計算した矩形** vs 実 DOM の札の矩形」。
 *     **DOM の .npcUnit 矩形**との突き合わせは項目 2 が (2b) と一緒に足す。
 *
 * ■ ⚠ 札の矩形は必ず実 DOM から測ってステージ px へ戻す (定数表を渡さない)
 *   ステージには CSS transform の zoom が乗っている (実測 酒場 0.825 / 街 0.866667 @1440x900)。
 *   ⭐ #tavernStage / #townStage は transform-origin: 0 0 だが、
 *     (子の rect - ステージの rect) / zoom という引き方は origin に依らず正しい。
 *   ⚠ 酒場の札は compact で幅が 128 → 55 に縮む → **desktop と compact の両方**で測る。
 *
 * ■ ⭐⭐ 配信バイトの凍結を内蔵している (別窓の並走で測定が汚れない)
 *   起動時に tavern.html / town.html / js/npc-crowd.js をディスクから 1 回だけ読み、
 *   以降の配信はそのスナップショットから返す。他のファイルも初回アクセス時に凍結する。
 *   ⭐ 変異も「ディスクを書き換える」のではなく「**配信を差し替える**」(作業ツリーを汚さない)。
 *
 * ■ ⚠⚠ ポート
 *   9573 を素に使う (隣の窓が 9560〜9572 を使用済み)。変異は 9574〜9586 を予約 (項目 4)。
 *
 * ■ 使い方
 *     node tools/verify_npc_crowd.js
 *     node tools/verify_npc_crowd.js --negative        # 負のコントロール (項目 4 で実装)
 *     node tools/verify_npc_crowd.js --port 9573 --headful
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

/* ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
 *   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える。 */
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const NEGATIVE = flag('negative');
const HEADFUL  = flag('headful');
const MUTATE   = arg('mutate', null);
const PORT     = parseInt(arg('port', '9573'), 10);

const NPC_JS      = 'js/npc-crowd.js';
const TAVERN_HTML = 'tavern.html';
const TOWN_HTML   = 'town.html';

/* 配信 HTML に「その 1 行」が実在するかを見るためのアンカー。
 * ⚠ 属性の引用符まで含めて素直に書く。⛔ 正規表現にしない (エスケープの事故を避ける)。 */
const SCRIPT_TAG = '<script src="' + NPC_JS + '"></script>';

const VIEW_DESKTOP = { width: 1440, height: 900 };
const VIEW_COMPACT = { width: 390,  height: 844 };

/* 2026-09-01 / 2026-09-02 に実測した母集団。⛔ 期待値ではなく **母集団ガード** として使う。
 * ⚠ ここが動いたら「マスクを 1 文字も変えない」(依頼書 §2-5) が破れている。 */
const POP = {
  tavern: { blocked: 87,  walkable: 63,  signs: 5 },
  town:   { blocked: 216, walkable: 129, signs: 3 },
};

// ══════════════════════════════════════════════════════════════════════════════
// 負のコントロール (依頼書 §8 の変異 13 本) — ⭐ 項目 4 が実装する
//   impl … false = **PENDING**。file/from/to を埋めて true にすると有効になる。
//   ⚠ 変異のアンカーは実装後に配信バイトへ当てて 1 回空振りを確認すること (#38 の恒久教訓)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  nosrc:       { impl: false, targets: ['0a-town', '0a-tavern'],
    why: '配信 HTML から <script src="js/npc-crowd.js"> を落とす。⭐ #23 の「読み込んでいないのに全部緑」の再現。' },
  walkable:    { impl: false, targets: ['1b'],
    why: '定点 1 体を歩けるタイル (酒場 (7,4)) へ移す = (I1) 違反。' },
  oversign:    { impl: false, targets: ['1a', '2b'],
    why: '⭐⭐⭐ 依頼書 §2-3 の罠の再現。街 mason を (11,2) へ移す (townSign_tavern の 242px 幅と交差)。' },
  strollsign:  { impl: false, targets: ['1a'],
    why: '⭐⭐⭐ 罠の再現 2。酒場 server の巡回を (8,3)⇄(8,6) へ戻す (端点は無事だが**経路上の (8,3)** が席札と交差)。' },
  dxover:      { impl: false, targets: ['1d'],
    why: 'dx を TILE/2 + 1 にする = (I3) 違反。' },
  maskpatch:   { impl: false, targets: ['4a', '4b'],
    why: 'js/npc-crowd.js に TAVERN_MAP.MASK[4] = "W.............W" を足す = マスクへの書き込み。' },
  zorder:      { impl: false, targets: ['2a', '2b'],
    why: '.npcUnit の z-index を 5 にする = 札 (4) の上に被さる。' },
  nostop:      { impl: false, targets: ['3c'],
    why: '吹き出しの ev.stopPropagation() を外す = NPC を押すと主人公が歩き出す。' },
  twobubble:   { impl: false, targets: ['3b'],
    why: '前の吹き出しを消さない = 吹き出しが 2 枚以上出る。' },
  row0:        { impl: false, targets: ['2d'],
    why: 'background-position の Y を 0 にする (空の行 0 を指す) = NPC が全員透明になる。' },
  retreatnoop: { impl: false, targets: ['5a', '5b'],
    why: '?npc=0 の判定を潰す = 撤退スイッチが死ぬ。' },
  allstand:    { impl: false, targets: ['1e'],
    why: '巡回 3 本を全部 stand にする = (1c) の母集団が空になる。' },
  validateyes: { impl: false, targets: ['0e'],
    why: 'validate() を常に {ok:true, problems:[]} にする = 装置が素通しになる。' },
};
const MUT_ORDER = ['nosrc', 'walkable', 'oversign', 'strollsign', 'dxover', 'maskpatch',
                   'zorder', 'nostop', 'twobubble', 'row0', 'retreatnoop', 'allstand', 'validateyes'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING): ' + MUTATIONS[MUTATE].why);
  process.exit(3);
}

// ══════════════════════════════════════════════════════════════════════════════
// 配信バイトの凍結
// ══════════════════════════════════════════════════════════════════════════════
const SNAP = new Map();
function frozen(rel) {
  if (SNAP.has(rel)) return SNAP.get(rel);
  let buf = null;
  try {
    const fp = path.join(ROOT, rel);
    if (fp.startsWith(ROOT) && fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) buf = fs.readFileSync(fp);
  } catch (e) { buf = null; }
  SNAP.set(rel, buf);
  return buf;
}
for (const rel of [NPC_JS, TAVERN_HTML, TOWN_HTML]) frozen(rel);

/* 変異ソース (項目 4 で MUT_IMPL が埋まったら動き出す)。
 * ⚠ アンカーが 1 箇所にヒットしなければここで exit 3。 */
const MUT_SRC = {};
for (const k of MUT_IMPL) {
  const m = MUTATIONS[k];
  const body = frozen(m.file);
  if (body === null) {
    console.error('[drv] ⛔ 変異 ' + k + ' の対象 ' + m.file + ' が読めない'); process.exit(3);
  }
  const src = body.toString('utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する');
    process.exit(3);
  }
  const n = src.split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: src.split(m.from).join(m.to) };
}
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });   /* 9574〜9586 を予約 */

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
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると startServer の
 *   try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};
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
        const buf = frozen(rel);
        if (buf === null) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buf);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
// ページを開いて測る
//   ⚠ same-origin の localStorage / sessionStorage は遷移をまたいで生き残る。
//     document-start で dragonfighters 接頭辞を purge してから、この試験が要る値だけ置く。
//   ⚠ prologueSeen を立てるのは、酒場の全画面暗幕 #prologueOverlay がステージに
//     被さるのを避けるため。⛔ 闇市は解禁しない (解禁すると札が 6 枚 / 4 枚になる)。
// ══════════════════════════════════════════════════════════════════════════════
async function newPage(browser, view) {
  const page = await browser.newPage();
  const errs = [], reqs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    let url = '';
    try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (url.indexOf('favicon.ico') >= 0) return;
    errs.push('console: ' + m.text());
  });
  page.on('request', r => { try { reqs.push(r.url()); } catch (e) {} });
  await page.evaluateOnNewDocument(() => {
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
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    } catch (e) {}
  });
  await page.setViewport(Object.assign({ deviceScaleFactor: 1 }, view || VIEW_DESKTOP));
  return { page: page, errs: errs, reqs: reqs };
}
async function settle(page) {
  try {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  } catch (e) { /* 遷移中は無視 */ }
  await sleep(200);
}

/* ── ページの中で走る観測 ────────────────────────────────────────────────────
 *  ⚠⚠ **投げる前提で全部 try/catch に包む。** 後続項目の負のコントロールでは
 *     「実装が壊れた世界」を走らせるので、1 か所の例外で観測関数ごと死ぬと
 *     残りの assert が回らず fatal で止まる (#40 の実測)。 */
function pageProbe(cfg) {
  const out = { err: [], cfg: cfg };
  const N = window.NPC_CROWD;
  const M = window[cfg.mapGlobal];

  try { out.hasNPC = typeof window.NPC_CROWD; } catch (e) { out.hasNPC = 'throw'; out.err.push('hasNPC: ' + e.message); }
  try { out.hasMap = typeof window[cfg.mapGlobal]; } catch (e) { out.hasMap = 'throw'; }

  /* ── 札を実 DOM から測ってステージ px へ戻す (⛔ 定数表を使わない) ── */
  try {
    const st = document.getElementById(cfg.stageId);
    out.stage = !!st;
    if (st) {
      const sr = st.getBoundingClientRect();
      const m = /matrix\(([^,]+),/.exec(getComputedStyle(st).transform);
      const z = m ? (parseFloat(m[1]) || 1) : 1;
      out.zoom = z;
      out.signs = Array.prototype.slice
        .call(document.querySelectorAll('#' + cfg.stageId + ' ' + cfg.signSel))
        .map(function (el) {
          const b = el.getBoundingClientRect();
          return { key: el.id, w: b.width / z, h: b.height / z,
                   cx: ((b.left + b.width / 2) - sr.left) / z,
                   cy: ((b.top + b.height / 2) - sr.top) / z,
                   zIndex: getComputedStyle(el).zIndex };
        });
    }
  } catch (e) { out.err.push('signs: ' + e.message); out.signs = out.signs || []; }

  /* ── 通行マスクの母集団 (本番の isWalkable を呼ぶ。⛔ 自前で判定を書き直さない) ── */
  try {
    if (M) {
      out.TILE = M.TILE; out.COLS = M.COLS; out.ROWS = M.ROWS;
      out.maskRows = (M.MASK || []).map(function (s) { return String(s); });
      let w = 0, b = 0;
      for (let r = 0; r < M.ROWS; r++) for (let c = 0; c < M.COLS; c++) {
        let ok = false;
        try { ok = !!M.isWalkable(c, r); } catch (ex) { ok = false; }
        if (ok) w++; else b++;
      }
      out.walkable = w; out.blocked = b;
    }
  } catch (e) { out.err.push('mask: ' + e.message); }

  /* ── 配置データ (NPC_CROWD からそのまま持ち出す) ── */
  try {
    const list = N ? N[cfg.listKey] : null;
    out.listKey = cfg.listKey;
    out.list = list ? list.map(function (n) {
      return { key: n.key, kind: n.kind, tile: n.tile || null, from: n.from || null, to: n.to || null,
               dx: (n.dx === undefined ? null : n.dx), dy: (n.dy === undefined ? null : n.dy),
               face: n.face, sprite: n.sprite, hold: (n.hold === undefined ? null : n.hold),
               say: n.say };
    }) : null;
    out.SPRITE = N ? N.SPRITE : null;
    out.FOOT   = N ? N.FOOT   : null;
  } catch (e) { out.err.push('list: ' + e.message); }

  /* ── 本番の cellsOf が返すセル列 (⭐ ドライバ側の自前展開と (1z) で突き合わせる) ── */
  try {
    if (N && out.list) {
      out.cellsProd = {};
      N[cfg.listKey].forEach(function (n) {
        try { out.cellsProd[n.key] = N.cellsOf(n).map(function (p) { return [p[0], p[1]]; }); }
        catch (ex) { out.cellsProd[n.key] = null; }
      });
    }
  } catch (e) { out.err.push('cellsOf: ' + e.message); }

  /* ── (1b)(1c) の素材 — 本番の isWalkable / inBounds をタイルごとに呼ぶ ── */
  try {
    if (N && M && out.cellsProd) {
      out.tileFacts = [];
      N[cfg.listKey].forEach(function (n) {
        const cells = out.cellsProd[n.key] || [];
        const rows = cells.map(function (p) {
          let w = false, ib = false;
          try { ib = !!M.inBounds(p[0], p[1]); } catch (ex) { ib = false; }
          try { w = !!M.isWalkable(p[0], p[1]); } catch (ex) { w = false; }
          return { c: p[0], r: p[1], inBounds: ib, walkable: w };
        });
        /* 可視条件 = マンハッタン距離 2 以内に歩けるマスが 1 つ以上ある */
        let near = null;
        if (n.kind === 'stand' && n.tile) {
          near = [];
          for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) {
            if (Math.abs(dc) + Math.abs(dr) > 2 || (!dc && !dr)) continue;
            const c = n.tile[0] + dc, r = n.tile[1] + dr;
            let ib = false, w = false;
            try { ib = !!M.inBounds(c, r); } catch (ex) { ib = false; }
            try { w = ib && !!M.isWalkable(c, r); } catch (ex) { w = false; }
            if (w) near.push([c, r]);
          }
        }
        out.tileFacts.push({ key: n.key, kind: n.kind, cells: rows,
                             nearWalkable: near, nearCount: near ? near.length : null });
      });
    }
  } catch (e) { out.err.push('tileFacts: ' + e.message); }

  /* ── 経路 ① : 本番の validate() を、実 DOM から測った札を渡して呼ぶ ── */
  try {
    if (N && M) {
      const v = N.validate(N[cfg.listKey], M, out.signs || []);
      out.validate = { ok: !!(v && v.ok),
                       problems: (v && v.problems ? v.problems : []).map(function (p) {
                         return { key: p.key, why: p.why, detail: p.detail }; }) };
    }
  } catch (e) { out.err.push('validate: ' + e.message); out.validate = { ok: null, problems: [], threw: String(e && e.message) }; }

  /* ── (0e) 装置 — validate() が素通しでないことを毎回証明する ──────────────
   *  ⭐ 「常に ok:true」でも「常に ok:false」でも赤くなるように、
   *     ① 空配列 → ok:true  ② 故意に壊した 4 件 → I1 / I3 / I4 / I5 が全部出る
   *     (I2 は「2 マス以内に歩けるマスが 1 つも無い」タイルが実在するときだけ測る)
   *  ⛔ 期待値をここに書かない。出た why の集合だけを持ち帰り、判定は述語がやる。 */
  try {
    if (N && M) {
      const probe = { empty: null, whys: [], threw: null, used: {} };
      try { const v0 = N.validate([], M, out.signs || []); probe.empty = !!(v0 && v0.ok); }
      catch (ex) { probe.threw = 'empty: ' + ex.message; }

      /* 歩けるタイルを 1 つ探す (I1 用) / 歩けないタイルを 1 つ探す (I3 I4 用) */
      let walkTile = null, blindTile = null, blockTile = null;
      for (let r = 0; r < M.ROWS && !(walkTile && blockTile); r++) {
        for (let c = 0; c < M.COLS; c++) {
          let w = false;
          try { w = !!M.isWalkable(c, r); } catch (ex) { w = false; }
          if (w && !walkTile) walkTile = [c, r];
          if (!w && !blockTile) blockTile = [c, r];
        }
      }
      /* 「2 マス以内に歩けるマスが 1 つも無い」タイルを探す (I2 用) */
      for (let r = 0; r < M.ROWS && !blindTile; r++) {
        for (let c = 0; c < M.COLS && !blindTile; c++) {
          let w = true;
          try { w = !!M.isWalkable(c, r); } catch (ex) { w = true; }
          if (w) continue;
          let vis = false;
          for (let dc = -2; dc <= 2 && !vis; dc++) for (let dr = -2; dr <= 2; dr++) {
            if (Math.abs(dc) + Math.abs(dr) > 2 || (!dc && !dr)) continue;
            let ok2 = false;
            try { ok2 = !!M.inBounds(c + dc, r + dr) && !!M.isWalkable(c + dc, r + dr); } catch (ex) { ok2 = false; }
            if (ok2) { vis = true; break; }
          }
          if (!vis) blindTile = [c, r];
        }
      }
      probe.used = { walkTile: walkTile, blindTile: blindTile, blockTile: blockTile };

      const bad = [];
      if (walkTile)  bad.push({ key: '__probeI1', kind: 'stand', tile: walkTile, dx: 0, dy: 0 });
      if (blindTile) bad.push({ key: '__probeI2', kind: 'stand', tile: blindTile, dx: 0, dy: 0 });
      if (blockTile) bad.push({ key: '__probeI3', kind: 'stand', tile: blockTile,
                                dx: M.TILE / 2 + 1, dy: 0 });
      if (blockTile) bad.push({ key: '__probeI4', kind: 'stroll', from: blockTile, to: blockTile });
      /* I5 … 札そのもののタイルへ立たせれば必ず矩形が重なる */
      const s0 = (out.signs || [])[0];
      if (s0) bad.push({ key: '__probeI5', kind: 'stand',
                         tile: [Math.floor(s0.cx / M.TILE), Math.floor(s0.cy / M.TILE)], dx: 0, dy: 0 });
      probe.badKeys = bad.map(function (b) { return b.key; });
      try {
        const v1 = N.validate(bad, M, out.signs || []);
        probe.badOk = !!(v1 && v1.ok);
        probe.whys = (v1 && v1.problems ? v1.problems : []).map(function (p) { return p.why; });
        probe.pairs = (v1 && v1.problems ? v1.problems : []).map(function (p) { return p.key + ':' + p.why; });
      } catch (ex) { probe.threw = (probe.threw ? probe.threw + ' / ' : '') + 'bad: ' + ex.message; }
      out.probe = probe;
    }
  } catch (e) { out.err.push('probe: ' + e.message); }

  /* ── 項目 2 以降の器 (今は 0 件で正しい) ── */
  try {
    out.npcLayer = !!document.getElementById('npcLayer');
    const us = Array.prototype.slice.call(document.querySelectorAll('.npcUnit'));
    out.npcUnitCount = us.length;
    const st2 = document.getElementById(cfg.stageId);
    const sr2 = st2 ? st2.getBoundingClientRect() : null;
    const z2 = out.zoom || 1;
    out.npcRects = (sr2 === null) ? [] : us.map(function (el) {
      const b = el.getBoundingClientRect();
      return { key: el.getAttribute('data-npc') || el.id || '',
               l: (b.left - sr2.left) / z2, t: (b.top - sr2.top) / z2,
               w: b.width / z2, h: b.height / z2,
               zIndex: getComputedStyle(el).zIndex,
               bgPos: getComputedStyle(el).backgroundPosition };
    });
  } catch (e) { out.err.push('npcUnit: ' + e.message); }

  return out;
}

async function measure(browser, port, o) {
  const out = { tag: o.tag, err: null, injected: false, reqSawNpcJs: false };
  const ctx = await newPage(browser, o.view);
  try {
    await ctx.page.goto('http://localhost:' + port + '/' + o.file, { waitUntil: 'load', timeout: 40000 });
    await ctx.page.waitForFunction(o.ready, { timeout: 25000 });
    await settle(ctx.page);
    /* ⭐ 「ページが js/npc-crowd.js を実際に要求したか」は **注入する前に** 確定させる。
       ⛔ 注入後に見ると (0a) が注入で緑になる。 */
    out.reqSawNpcJs = ctx.reqs.some(function (u) { return u.indexOf('/' + NPC_JS) >= 0; });
    out.hasNPCBeforeInject = await ctx.page.evaluate(() => {
      try { return typeof window.NPC_CROWD; } catch (e) { return 'throw'; } });
    if (o.inject && out.hasNPCBeforeInject !== 'object') {
      /* 酒場は項目 2 が結線するまで載っていない。データ層だけ測るために **暫定注入**する。
         ⛔ これで (0a-tavern) を緑にしない (PENDING のまま報告する)。 */
      await ctx.page.addScriptTag({ url: '/' + NPC_JS });
      out.injected = true;
      await settle(ctx.page);
    }
    out.probe = await ctx.page.evaluate(pageProbe, {
      stageId: o.stageId, signSel: o.signSel, mapGlobal: o.mapGlobal, listKey: o.listKey });
  } catch (e) { out.err = String(e && e.message); }
  finally { try { await ctx.page.close(); } catch (e) {} }
  out.pageErrs = ctx.errs;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ (1a) 経路 ② — ドライバが **自前で** セル列と矩形を起こす
//   ⛔ NPC_CROWD.cellsOf / boxOf を呼ばない (呼ぶと 1 経路目と同じ間違いを共有する)。
//   ⚠ SPRITE / FOOT / TILE は本番から引いた実測値を渡す (⛔ 96 / 0.93 / 64 を直書きしない)。
//   ⭐ 交差判定は本番の「否定形」ではなく **肯定形**で書く
//      (どちらかが符号を間違えたら食い違って見える)。
//   ⭐ 斜めの巡回は null を返す = 本番の cellsOf が黙って横一列に潰す欠陥を (1z) で捕まえる。
// ══════════════════════════════════════════════════════════════════════════════
function drvCells(n) {
  if (n.kind === 'stroll') {
    const a = n.from, b = n.to, out = [];
    if (!a || !b) return null;
    if (a[0] === b[0] && a[1] === b[1]) return [[a[0], a[1]]];
    if (a[0] === b[0]) { for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) out.push([a[0], y]); return out; }
    if (a[1] === b[1]) { for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) out.push([x, a[1]]); return out; }
    return null;
  }
  return n.tile ? [[n.tile[0], n.tile[1]]] : null;
}
function drvBox(c, r, TILE, dx, dy, SPRITE, FOOT) {
  const cx = c * TILE + TILE / 2 + (dx || 0);
  const cy = r * TILE + TILE / 2 + (dy || 0);
  return { l: cx - SPRITE / 2, r: cx + SPRITE / 2, t: cy - SPRITE * FOOT, b: cy + SPRITE * (1 - FOOT) };
}
function drvHit(a, s) {
  const sl = s.cx - s.w / 2, st = s.cy - s.h / 2, sr = s.cx + s.w / 2, sb = s.cy + s.h / 2;
  return (a.l < sr) && (sl < a.r) && (a.t < sb) && (st < a.b);
}
/* 経路 ② の本体。戻り値 = { hits, cells, diag, cellCount } */
function drvCross(p) {
  const out = { hits: [], cells: {}, diag: [], cellCount: 0 };
  const list = (p && p.list) || [];
  const signs = (p && p.signs) || [];
  const TILE = p && p.TILE, SPRITE = p && p.SPRITE, FOOT = p && p.FOOT;
  if (!TILE || !SPRITE || typeof FOOT !== 'number') { out.broken = 'TILE/SPRITE/FOOT が引けない'; return out; }
  list.forEach(function (n) {
    const cells = drvCells(n);
    if (cells === null) { out.diag.push(n.key); out.cells[n.key] = null; return; }
    out.cells[n.key] = cells;
    out.cellCount += cells.length;
    cells.forEach(function (pc) {
      const bx = drvBox(pc[0], pc[1], TILE, n.dx, n.dy, SPRITE, FOOT);
      signs.forEach(function (s) {
        if (drvHit(bx, s)) out.hits.push(n.key + '(' + pc[0] + ',' + pc[1] + ')x' + s.key);
      });
    });
  });
  return out;
}
const cellsEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件の表 (依頼書 §8 の §0〜§5 を **全部宣言**する)
//   形: [id, 文面, 述語 (m -> [bool, detail]) or null, PENDING の理由 or undefined]
//   ⭐ 完了条件は「PENDING 0」。⛔ 数合わせで緑にしない。
// ══════════════════════════════════════════════════════════════════════════════
const P  = (ph) => (ph && ph.probe) || {};
const PH = (m, k) => (m && m[k]) || null;
const ALL4 = (m) => [['酒場/desktop', PH(m, 'tav')], ['酒場/compact', PH(m, 'tavC')],
                     ['街/desktop', PH(m, 'town')], ['街/compact', PH(m, 'townC')]];
const PAIRS = (m) => [['酒場', PH(m, 'tav'), PH(m, 'tavC'), POP.tavern],
                      ['街',   PH(m, 'town'), PH(m, 'townC'), POP.town]];

const ASSERT_OF = {};
[
  /* ── §0 装置 (先に母集団を確かめる) ──────────────────────────────────────── */
  ['0a-town', 'town.html が js/npc-crowd.js を実際に読み込んでいる'
    + ' (① 配信バイトに <script src> が実在 ② ページが要求した ③ window.NPC_CROWD が生きている)',
    (m) => {
      const n = m.html.town.split(SCRIPT_TAG).length - 1;
      const ph = PH(m, 'town');
      if (!ph) return [false, '⛔ 街を測っていない'];
      const req = ph.reqSawNpcJs === true;
      const live = ph.hasNPCBeforeInject === 'object';
      const noInject = ph.injected === false;
      const ok = n === 1 && req && live && noInject;
      return [ok, '配信バイトに ' + JSON.stringify(SCRIPT_TAG) + ' が ' + n + ' 箇所'
        + ' / 要求した=' + req + ' / 注入前の typeof NPC_CROWD=' + ph.hasNPCBeforeInject
        + ' / 注入=' + ph.injected
        + (ok ? '' : '  ⛔ この状態では §1 が全部空振りで永久緑になる (#23 の再発)')];
    }],
  ['0a-tavern', 'tavern.html が js/npc-crowd.js を実際に読み込んでいる (配信バイトに <script src> が実在)',
    null,
    /* ⚠ 起動時に実測値を差し込む (下の本体を参照)。⛔ 「まだ」だけで済ませない。 */
    '項目 2 が tavern.html の <script src="js/tavern-map.js"> の直後へ結線する。'
    + '⛔ 項目 1 では tavern.html を 1 バイトも触らない'
    + ' (触ると changelog フックが commit を止め、プレイヤーに見える変化が実在しないので'
    + '嘘の要約を書くしかなくなる)。'
    + '⭐ ドライバは酒場のデータ層を測るため addScriptTag で暫定注入している'
    + ' — **注入で (0a) を緑にしない**。'],
  ['0b', '[装置] 配置データの母集団が空でない (酒場 / 街ともに 1 件以上)',
    (m) => {
      const rows = PAIRS(m).map(function (x) {
        const p = P(x[1]);
        return { name: x[0], n: (p.list || []).length,
                 stand: (p.list || []).filter(function (q) { return q.kind === 'stand'; }).length,
                 stroll: (p.list || []).filter(function (q) { return q.kind === 'stroll'; }).length };
      });
      const ok = rows.every(function (r) { return r.n > 0; });
      return [ok, rows.map(function (r) {
        return r.name + ' ' + r.n + ' 件 (定点 ' + r.stand + ' / 巡回 ' + r.stroll + ')'; }).join(' / ')
        + (ok ? '' : '  ⛔ 0 件だと §1 の全 assert が空振りする')];
    }],
  ['0b-dom', '[装置] 実際に生成された .npcUnit の数が NPC_CROWD.TAVERN.length / .TOWN.length と一致し、どちらも 0 でない',
    null,
    '項目 2 が #npcLayer と .npcUnit を描く。⚠ 現在は両ページとも 0 件 (器だけ用意した状態)。'],
  ['0c', '[装置] 札を実 DOM から 1 枚以上測れている (⭐ 0 枚だと (1a) の交差検査が空振りする)',
    (m) => {
      const want = { '酒場/desktop': POP.tavern.signs, '酒場/compact': POP.tavern.signs,
                     '街/desktop': POP.town.signs,     '街/compact': POP.town.signs };
      const rows = ALL4(m).map(function (x) {
        const p = P(x[1]);
        return { name: x[0], n: (p.signs || []).length,
                 keys: (p.signs || []).map(function (s) { return s.key + ':' + Math.round(s.w) + 'x' + Math.round(s.h); }).join(' '),
                 zoom: p.zoom };
      });
      const guard = rows.every(function (r) { return r.n > 0; });
      const exact = rows.every(function (r) { return r.n === want[r.name]; });
      return [guard && exact, rows.map(function (r) {
        return r.name + ' ' + r.n + ' 枚 (期待 ' + want[r.name] + ', zoom ' + r.zoom + ') [' + r.keys + ']'; }).join('  /  ')
        + (exact ? '' : '  ⛔ 枚数が違う — 闇市が解禁されていないか (解禁すると酒場 6 / 街 4)、'
          + 'または札そのものが増減した。⚠ 期待値を書き換える前に理由を突き止めること')];
    }],
  ['0d', '[装置] 通行マスクの母集団が空でない — 歩けないマスが 酒場 ' + POP.tavern.blocked
    + ' / 街 ' + POP.town.blocked + ' (2026-09-02 実測)',
    (m) => {
      const rows = PAIRS(m).map(function (x) {
        const p = P(x[1]);
        return { name: x[0], w: p.walkable, b: p.blocked, want: x[3], tile: p.TILE,
                 cols: p.COLS, rws: p.ROWS };
      });
      const guard = rows.every(function (r) { return r.b > 0 && r.w > 0; });
      const exact = rows.every(function (r) { return r.b === r.want.blocked && r.w === r.want.walkable; });
      return [guard && exact, rows.map(function (r) {
        return r.name + ' ' + r.cols + 'x' + r.rws + ' TILE' + r.tile
          + ' 歩ける ' + r.w + ' (期待 ' + r.want.walkable + ')'
          + ' / 歩けない ' + r.b + ' (期待 ' + r.want.blocked + ')'; }).join('  /  ')
        + (exact ? '' : '  ⛔ マスクが動いている — 依頼書 §2-5「マスクを 1 文字も変えない」が破れた疑い')];
    }],
  ['0e', '[装置] NPC_CROWD.validate() が素通しでない'
    + ' (空配列は ok:true / 故意に壊した記録では I1 I3 I4 I5 が必ず出る)',
    (m) => {
      const rows = PAIRS(m).map(function (x) {
        const p = P(x[1]), pr = p.probe || {};
        const whys = pr.whys || [];
        const need = ['I1', 'I3', 'I4', 'I5'];
        const missing = need.filter(function (w) { return whys.indexOf(w) < 0; });
        /* I2 は「2 マス以内に歩けるマスが 1 つも無いタイル」が実在するときだけ測る */
        const i2 = (pr.used && pr.used.blindTile) ? (whys.indexOf('I2') >= 0) : null;
        return { name: x[0], empty: pr.empty, badOk: pr.badOk, missing: missing,
                 i2: i2, blind: pr.used && pr.used.blindTile, threw: pr.threw,
                 pairs: (pr.pairs || []).join(' ') };
      });
      const ok = rows.every(function (r) {
        return r.empty === true && r.badOk === false && r.missing.length === 0
          && r.i2 !== false && !r.threw;
      });
      return [ok, rows.map(function (r) {
        return r.name + ' 空配列 ok=' + r.empty + ' / 壊した記録 ok=' + r.badOk
          + ' / 欠けた不変条件=' + (r.missing.length ? r.missing.join(',') : '(無し)')
          + ' / I2=' + (r.i2 === null ? '(該当タイル無し)' : r.i2)
          + (r.blind ? ' [I2 の種 (' + r.blind + ')]' : '')
          + (r.threw ? ' ⛔ 例外: ' + r.threw : '')
          + ' / 検出=' + r.pairs; }).join('  //  ')
        + (ok ? '' : '  ⛔ validate() が常に ok:true か常に ok:false — (1a) が何も測らなくなる')];
    }],

  /* ── §1 データの不変条件 ─────────────────────────────────────────────────── */
  ['1z', '[装置] ドライバが自前で展開したセル列が NPC_CROWD.cellsOf() と一致する'
    + ' (⭐ 経路 ② が経路 ① の写経でないことの証明。斜めの巡回は展開できないので赤にする)',
    (m) => {
      const rows = PAIRS(m).map(function (x) {
        const p = P(x[1]);
        const d = drvCross({ list: p.list, signs: p.signs, TILE: p.TILE, SPRITE: p.SPRITE, FOOT: p.FOOT });
        const prod = p.cellsProd || {};
        const bad = Object.keys(d.cells).filter(function (k) { return !cellsEq(d.cells[k], prod[k]); });
        return { name: x[0], n: Object.keys(d.cells).length, cellCount: d.cellCount,
                 diag: d.diag, bad: bad, broken: d.broken };
      });
      const ok = rows.every(function (r) {
        return !r.broken && r.diag.length === 0 && r.bad.length === 0 && r.n > 0; });
      return [ok, rows.map(function (r) {
        return r.name + ' ' + r.n + ' 体 / セル合計 ' + r.cellCount
          + ' / 食い違い=' + (r.bad.length ? r.bad.join(',') : '(無し)')
          + ' / 斜めの巡回=' + (r.diag.length ? r.diag.join(',') : '(無し)')
          + (r.broken ? ' ⛔ ' + r.broken : ''); }).join('  /  ')];
    }],
  ['1a', '★★ validate(list, MAP, 実 DOM の札) が problems 0 件 — '
    + '**2 経路** (本番の validate / ドライバ自前の矩形交差) かつ **desktop と compact の両方**',
    (m) => {
      const rows = ALL4(m).map(function (x) {
        const p = P(x[1]);
        const v = p.validate || { ok: null, problems: [] };
        const d = drvCross({ list: p.list, signs: p.signs, TILE: p.TILE, SPRITE: p.SPRITE, FOOT: p.FOOT });
        return { name: x[0], ok: v.ok, probs: v.problems || [], hits: d.hits,
                 signs: (p.signs || []).length, cells: d.cellCount, broken: d.broken };
      });
      const ok = rows.every(function (r) {
        return r.ok === true && r.probs.length === 0 && r.hits.length === 0
          && r.signs > 0 && r.cells > 0 && !r.broken;
      });
      return [ok, rows.map(function (r) {
        return r.name + ' 経路①problems ' + r.probs.length
          + (r.probs.length ? ' [' + r.probs.map(function (q) { return q.key + ':' + q.why + ':' + q.detail; }).join(' | ') + ']' : '')
          + ' / 経路②交差 ' + r.hits.length
          + (r.hits.length ? ' [' + r.hits.join(' | ') + ']' : '')
          + ' (札 ' + r.signs + ' 枚 x セル ' + r.cells + ')'; }).join('  //  ')];
    }],
  ['1b', '定点 NPC 全員が isWalkable()===false のタイルに立ち、マンハッタン距離 2 以内に歩けるマスを持つ'
    + ' (⭐ 本番の isWalkable を呼んで測る)',
    (m) => {
      const rows = PAIRS(m).map(function (x) {
        const p = P(x[1]);
        const st = (p.tileFacts || []).filter(function (f) { return f.kind === 'stand'; });
        const onWalk = st.filter(function (f) { return f.cells.some(function (c) { return c.walkable; }); });
        const blind  = st.filter(function (f) { return !(f.nearCount > 0); });
        const oob    = st.filter(function (f) { return f.cells.some(function (c) { return !c.inBounds; }); });
        return { name: x[0], n: st.length, onWalk: onWalk, blind: blind, oob: oob,
                 near: st.map(function (f) { return f.key + ':' + f.nearCount; }).join(' ') };
      });
      const ok = rows.every(function (r) {
        return r.n > 0 && r.onWalk.length === 0 && r.blind.length === 0 && r.oob.length === 0; });
      return [ok, rows.map(function (r) {
        return r.name + ' 定点 ' + r.n + ' 体'
          + ' / (I1) 歩けるタイルに立っている=' + (r.onWalk.length ? r.onWalk.map(function (f) { return f.key; }).join(',') : '0 件')
          + ' / (I2) 2 マス以内に歩けるマスが無い=' + (r.blind.length ? r.blind.map(function (f) { return f.key; }).join(',') : '0 件')
          + ' / 範囲外=' + (r.oob.length ? r.oob.map(function (f) { return f.key; }).join(',') : '0 件')
          + ' / 近傍数 [' + r.near + ']'; }).join('  //  ')];
    }],
  ['1c', '巡回 NPC の **経路上の全マス** が歩ける (⛔ 端点だけ見ない)',
    (m) => {
      const rows = PAIRS(m).map(function (x) {
        const p = P(x[1]);
        const sl = (p.tileFacts || []).filter(function (f) { return f.kind === 'stroll'; });
        const bad = [];
        let cells = 0;
        sl.forEach(function (f) {
          cells += f.cells.length;
          f.cells.forEach(function (c) { if (!c.walkable) bad.push(f.key + '(' + c.c + ',' + c.r + ')'); });
        });
        return { name: x[0], n: sl.length, cells: cells, bad: bad,
                 lens: sl.map(function (f) { return f.key + ':' + f.cells.length; }).join(' ') };
      });
      const ok = rows.every(function (r) { return r.n > 0 && r.cells > 0 && r.bad.length === 0; });
      return [ok, rows.map(function (r) {
        return r.name + ' 巡回 ' + r.n + ' 本 / 経路マス合計 ' + r.cells
          + ' / 歩けないマス=' + (r.bad.length ? r.bad.join(',') : '0 件')
          + ' / 内訳 [' + r.lens + ']'; }).join('  //  ')];
    }],
  ['1d', 'dx / dy が全員 ±TILE/2 以内 (⭐ TILE は本番の MAP.TILE から引く。⛔ 48 / 32 を直書きしない)',
    (m) => {
      const rows = PAIRS(m).map(function (x) {
        const p = P(x[1]);
        const lim = p.TILE ? p.TILE / 2 : null;
        const st = (p.list || []).filter(function (q) { return q.kind === 'stand'; });
        const bad = st.filter(function (q) {
          return lim === null || Math.abs(q.dx || 0) > lim || Math.abs(q.dy || 0) > lim; });
        let mx = 0;
        st.forEach(function (q) { mx = Math.max(mx, Math.abs(q.dx || 0), Math.abs(q.dy || 0)); });
        return { name: x[0], n: st.length, lim: lim, bad: bad, mx: mx };
      });
      const ok = rows.every(function (r) { return r.n > 0 && r.lim !== null && r.bad.length === 0; });
      return [ok, rows.map(function (r) {
        return r.name + ' 定点 ' + r.n + ' 体 / 上限 ±' + r.lim + ' / 実測の最大 ' + r.mx
          + ' / 超過=' + (r.bad.length ? r.bad.map(function (q) { return q.key + '(' + q.dx + ',' + q.dy + ')'; }).join(',') : '0 件'); }).join('  //  ')];
    }],
  ['1e', '母集団の作り分けが効いている — 定点と巡回が **どちらも 1 件以上** ある'
    + ' (⭐ 全部 stand にすると (1c) が空振りする)',
    (m) => {
      const rows = PAIRS(m).map(function (x) {
        const p = P(x[1]);
        const kinds = {};
        (p.list || []).forEach(function (q) { kinds[q.kind] = (kinds[q.kind] || 0) + 1; });
        return { name: x[0], stand: kinds.stand || 0, stroll: kinds.stroll || 0,
                 other: Object.keys(kinds).filter(function (k) { return k !== 'stand' && k !== 'stroll'; }) };
      });
      const ok = rows.every(function (r) { return r.stand > 0 && r.stroll > 0 && r.other.length === 0; });
      return [ok, rows.map(function (r) {
        return r.name + ' 定点 ' + r.stand + ' / 巡回 ' + r.stroll
          + (r.other.length ? ' ⛔ 未知の kind: ' + r.other.join(',') : ''); }).join('  /  ')];
    }],

  /* ── §2 描画 (項目 2) ────────────────────────────────────────────────────── */
  ['2a', '.npcUnit の z-index が全員 3 以下 (札の 4 を超えない)', null,
    '項目 2 が #npcLayer / .npcUnit を描く。⚠ 現在 .npcUnit は 0 件。'],
  ['2b', '★ 札 (酒場 5 枚 / 街 3 枚) の中心の elementFromPoint が自分自身か子孫'
    + ' — ⭐ 既存 golden 4 本と同じ条件を **NPC が居る状態で**独立に測る', null,
    '項目 2 が NPC を描いてから測る。⚠ NPC が 0 件の今に測ると空振り = 永久緑になるので測らない。'],
  ['2c', '.npcUnit の top が cy + dy - SPRITE * FOOT と 1px 以内で一致 (CSS と JS の写経ズレを殺す)', null,
    '項目 2 が描く。⚠ 現在 .npcUnit は 0 件。'],
  ['2d', 'background-position の Y が -3 * SPRITE (= 右向きの行)。⭐ 行 0〜2 は空なので間違えると全員透明', null,
    '項目 2 が描く。⚠ 現在 .npcUnit は 0 件。'],

  /* ── §3 吹き出し (項目 3) ────────────────────────────────────────────────── */
  ['3a', '★ .npcUnit を 1 体押すと吹き出しが 1 枚出て、textContent がデータの say と 1 文字も違わない', null,
    '項目 3 が吹き出しを実装する。'],
  ['3b', '別の NPC を押すと吹き出しは常に 1 枚のまま (前が消える)', null, '項目 3。'],
  ['3c', '★ NPC を押しても主人公が動かない (stopPropagation が効いている)', null, '項目 3。'],
  ['3d', '吹き出しの pointer-events が none', null, '項目 3。'],

  /* ── §4 恒等 (非退行) (項目 3) ───────────────────────────────────────────── */
  ['4a', '★★★ TAVERN_MAP.MASK / TOWN_MAP.MASK の全行の文字列が起動前後で同一'
    + ' (⭐ NPC がマスクへ書き込んでいないことの直接証拠)', null,
    '項目 3 が「起動前」のスナップショットと突き合わせる。'
    + '⚠ 項目 1 の時点では NPC を描く実装がまだ無いので、比較する「後」が存在しない。'],
  ['4b', '歩けるマスの数が 酒場 ' + POP.tavern.walkable + ' / 街 ' + POP.town.walkable + ' のまま', null,
    '項目 3。⚠ 現在の実測値は (0d) が毎回出している。'],
  ['4c', '主人公の初期タイルが従来どおり (酒場 spawnFor / 街 spawnFor の結果が不変)', null, '項目 3。'],
  ['4d', '#tavernStage / #townStage の札の枚数が従来どおり (酒場 5 / 街 3)', null,
    '項目 3。⚠ 現在の実測値は (0c) が毎回出している。'],

  /* ── §5 撤退 (項目 4) ────────────────────────────────────────────────────── */
  ['5a', 'tavern.html?npc=0 / town.html?npc=0 で #npcLayer が DOM に存在しない'
    + ' (⛔ display:none で残っていない)', null, '項目 4 が ?npc=0 を実装する。'],
  ['5b', '⭐ 同じ 4 条件を ON/OFF 両方へ当てる — ON {true,true,true,true} / OFF {false,false,false,**true**}'
    + ' (⚠ signsClickable は両方 true が正)', null,
    '項目 4。⭐⭐ 「全部反転」ではなく「反転すべき 3 つが反転し、反転してはいけない 1 つが動かない」を測る。'],
  ['5c', '?npc=0 が次のページへ持ち越されない (酒場で ?npc=0 → 街へ出ると NPC が居る)', null, '項目 4。'],
].forEach(a => { ASSERT_OF[a[0]] = a; });

const SECTIONS = [
  ['§0 装置 — 先に母集団を確かめる', ['0a-town', '0a-tavern', '0b', '0b-dom', '0c', '0d', '0e']],
  ['§1 データの不変条件',            ['1z', '1a', '1b', '1c', '1d', '1e']],
  ['§2 描画 (項目 2)',               ['2a', '2b', '2c', '2d']],
  ['§3 吹き出し (項目 3)',           ['3a', '3b', '3c', '3d']],
  ['§4 恒等 — 非退行 (項目 3)',      ['4a', '4b', '4c', '4d']],
  ['§5 撤退 (項目 4)',               ['5a', '5b', '5c']],
];

/* ⭐ 出口は 1 本。PENDING の理由を持っている assert はここで PENDING になる。 */
function emit(id, m) {
  const a = ASSERT_OF[id];
  if (!a) { check('(' + id + ') ⛔ 未宣言の assert', false, 'ASSERT_OF に無い'); return; }
  if (a[3]) { pending('(' + a[0] + ') ' + a[1], a[3]); return; }
  let r;
  try { r = a[2](m); } catch (e) { r = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_npc_crowd — 酒場と街の NPC 群衆 (依頼書 #41 §8) '
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] ROOT=' + ROOT + '  PORT=' + PORT
    + '  変異ポート予約=' + PORT_OF[MUT_ORDER[0]] + '〜' + PORT_OF[MUT_ORDER[MUT_ORDER.length - 1]]);

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_npc_');
  const servers = [await startServer(PORT, MUTATE)];
  if (NEGATIVE) for (const k of MUT_IMPL) servers.push(await startServer(PORT_OF[k], k));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  const TAV_CFG = { file: TAVERN_HTML, stageId: 'tavernStage', signSel: '.tavernSign',
                    mapGlobal: 'TAVERN_MAP', listKey: 'TAVERN', inject: true,
                    ready: "window.__TAVERN_TV && typeof window.__TAVERN_TV.zoom === 'function'" };
  const TOWN_CFG = { file: TOWN_HTML, stageId: 'townStage', signSel: '.townSign',
                     mapGlobal: 'TOWN_MAP', listKey: 'TOWN', inject: false,
                     ready: "window.__town && typeof window.__town.zoom === 'function'" };

  try {
    mark('測定 — 4 面 (酒場 desktop / 酒場 compact / 街 desktop / 街 compact)');
    console.log('[drv]   酒場 desktop 1440x900');
    const tav   = await measure(browser, PORT, Object.assign({ tag: '酒場/desktop', view: VIEW_DESKTOP }, TAV_CFG));
    console.log('[drv]   酒場 compact 390x844');
    const tavC  = await measure(browser, PORT, Object.assign({ tag: '酒場/compact', view: VIEW_COMPACT }, TAV_CFG));
    console.log('[drv]   街   desktop 1440x900');
    const town  = await measure(browser, PORT, Object.assign({ tag: '街/desktop', view: VIEW_DESKTOP }, TOWN_CFG));
    console.log('[drv]   街   compact 390x844');
    const townC = await measure(browser, PORT, Object.assign({ tag: '街/compact', view: VIEW_COMPACT }, TOWN_CFG));

    const M = { tav: tav, tavC: tavC, town: town, townC: townC,
                html: { tavern: frozen(TAVERN_HTML).toString('utf8'),
                        town:   frozen(TOWN_HTML).toString('utf8') } };

    for (const pair of [['酒場/desktop', tav], ['酒場/compact', tavC], ['街/desktop', town], ['街/compact', townC]]) {
      const k = pair[0], ph = pair[1];
      if (ph.err) console.log('[drv]   ⛔ ' + k + ' の測定が失敗: ' + ph.err);
      if (ph.pageErrs && ph.pageErrs.length) {
        console.log('[drv]   ⚠ ' + k + ' のページエラー ' + ph.pageErrs.length + ' 件: '
          + ph.pageErrs.slice(0, 2).join(' | '));
      }
      const p = P(ph);
      if (p.err && p.err.length) console.log('[drv]   ⚠ ' + k + ' の観測エラー: ' + p.err.join(' | '));
      if (ph.injected) console.log('[drv]   ⭐ ' + k + ' は addScriptTag で js/npc-crowd.js を **暫定注入**した'
        + ' (⛔ (0a-tavern) はこれで緑にしない)');
    }

    /* (0a-tavern) の PENDING 理由へ実測値を差し込む。⛔ 「まだ」だけで済ませない。 */
    {
      const n = M.html.tavern.split(SCRIPT_TAG).length - 1;
      ASSERT_OF['0a-tavern'][3] = '実測: 配信 tavern.html に ' + JSON.stringify(SCRIPT_TAG) + ' が ' + n + ' 箇所'
        + ' / ページが要求した=' + tav.reqSawNpcJs
        + ' / 注入前の typeof NPC_CROWD=' + tav.hasNPCBeforeInject
        + ' / ドライバの暫定注入=' + tav.injected + '  ——  ' + ASSERT_OF['0a-tavern'][3];
    }

    for (const sec of SECTIONS) {
      mark(sec[0]);
      for (const id of sec[1]) emit(id, M);
    }

    if (NEGATIVE) {
      mark('負のコントロール');
      if (MUT_IMPL.length === 0) {
        console.log('[drv]   ⚠ 実装済みの変異が 0 本 — 項目 4 が 13 本すべてを埋める');
      }
      if (MUT_TODO.length) {
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → '
            + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
            MUTATIONS[k].why);
        }
      } else {
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, (e && e.message) + '\n' + ((e && e.stack) || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend   = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length
    + (NEGATIVE ? '   [負のコントロール]' : (MUTATE ? '   [変異 ' + MUTATE + ']' : '')));
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (最終的な完了条件 = ここが 0 件。項目 2〜4 が埋める):');
    for (const b of pend) console.log('    - ' + b.name);
  }
  console.log('──────────────────────────────────────────────');
  process.exit(failed.length ? 1 : 0);
})();
