#!/usr/bin/env node
/*
 * tools/verify_darkvision.js — 暗視を編成の判断材料にする (実装依頼書 #39 §8)
 * ════════════════════════════════════════════════════════════════════════════
 * 何を担保するか
 *   ① 職業ごとの視界の唯一の正が js/class-sight.js へ **移設**された (写しを作っていない)
 *   ② プレイヤーが読む 4 箇所に出ている数字が、実際にフォグを削っている数字と **同じ**
 *   ③ 表示だけを戻す撤退スイッチ ?darkvision=0 が効き、**挙動には効かない**
 *
 * ⭐⭐⭐ 中心の assert は「2 経路の突き合わせ」
 *   経路A = 画面に出ている文字列から数字を読む
 *           (シートの [data-stat="sight"] / title の .classSight /
 *            tavern の .pmSight と .mrMeta)
 *   経路B = index.html を開いて **裸の識別子**で getSight(classKey).tiles を評価した実行時の値
 *   ⛔ 経路Aを DFSight.sightLabel() と突き合わせない。それは同じ出所の写経で、
 *     実装とドライバが同じ間違いを共有すると **両方緑になる**。
 *
 * ⚠ classic script 直下の const は window に載らない (グローバル字句環境には入る)。
 *   よって CLASS_SIGHT / getSight は **裸の識別子**で読む。window.CLASS_SIGHT は常に undefined。
 *
 * ⚠⚠ (0g) の grep パターンは「値の記法」まで含めて厳しく書くこと (#34 の罠の再演)
 *   2026-08-31 実測: 素朴な /tiles:\s*(8|10|12)/ は index.html の **武器射程表 RANGE**
 *   (`medium: { tiles: 8, label: "中距離", engagePx: 768 }` 等) に **5 件**ヒットして
 *   永久に赤くなる。視界の表だけを掴むには **3 つ組の shape**
 *   (tiles→inner→outer の並び / classKey→3 要素配列) で書くこと。
 *   散文のコメント (「魔法使い・戦士・僧侶・盗賊 = 8」) は数えない。
 *
 * ⚠ 実装状況 (2026-08-31 / dev-loop 項目 3 まで着地)
 *   実装済 … §0 装置 (0a)〜(0g) / §1 (1a)(1b)(1c)(1d)(1e)(1f) / §2 (2a)(2b) /
 *            §3 非退行 (3a)〜(3f)
 *   PENDING … §4 撤退 (4a)〜(4d) と負のコントロール 12 本 = 項目 4
 *   ⛔ 測れないものを黙って緑にしない。未実装は理由つきの PENDING で出す。
 *
 * ⭐⭐⭐ §3 の基準は「**着手前 hash を別ポートで同時配信**して採る」(--baseline <hash>)。
 *   ⛔ HEAD を基準にしてはいけない。commit した瞬間 HEAD === 作業ツリーになり、
 *     (3a)(3b) が「自分自身との比較」に化けて **永久に緑** になる (#34 の教訓)。
 *   ⭐ 別ポート = 別オリジン。localStorage が混ざらないので、両アームへ同じ種を撒ける。
 *
 * ⭐⭐⭐ §3 の顔ぶれは **固定する**。buildParty() が Math.random() で編成を作り直すので、
 *   openPrep 経由で「1 文字も違わない」を測ると **視界と無関係な差分**で必ず赤くなる。
 *   → 既存の検証シーム window.__pmTest.play() に selection.partyMembers を直接与えて
 *     演出だけを開く (verify_party_match_setup の playForcedCinema と同じ手)。
 *   ⚠ この手は「乱数を潰す」のであって「測定点を弱める」のではない。測るのは
 *     **同じ顔ぶれを与えたときに描かれた文字列**で、基準と現行で 1 文字も違わないこと。
 *
 * 使い方:
 *     node tools/verify_darkvision.js                      # 素
 *     node tools/verify_darkvision.js --negative           # 負のコントロール (項目 4 で実装)
 *     node tools/verify_darkvision.js --mutate shadowsight # 単一変異
 *     node tools/verify_darkvision.js --port 9540 --headful
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

/* ⚠⚠ ROOT は必ず path.resolve を通す (既知の罠)。'/' 区切りのままだと全 404 になり、
 *   症状は「タイムアウト」だけで原因が見えない。 */
const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE   = arg('mutate', null);
const PORT     = parseInt(arg('port', '9540'), 10);

const SIGHT_JS = 'js/class-sight.js';
const SHEET_JS = 'js/player-sheet.js';
const INDEX    = 'index.html';
const TAVERN   = 'tavern.html';
const TITLE    = 'title.html';
/* (0g) の「0 件であるべき」側。⭐ 表の移設先 SIGHT_JS はここに入れない。 */
const NUM_FILES = [INDEX, TAVERN, TITLE, SHEET_JS];
const CLASS_KEYS = ['mage', 'warrior', 'cleric', 'rogue', 'elf', 'dwarf'];

/* ★#39 の語の割り当て (§2-5)。⛔ 言い回しそのものは測らない —— 測るのは
 *   「dwarf に暗視」「elf に低光視力」「**elf に暗視が出ていない**」の 3 点だけ。 */
const TERM_DWARF = '暗視';
const TERM_ELF   = '低光視力';

// ══════════════════════════════════════════════════════════════════════════════
// 変異表 (負のコントロール) — 依頼書 §8 の 12 本
//   impl:false = まだ実装していない (項目 4 の担当)。--negative で PENDING として出る。
//   ⛔ 実装していない変異を「無い」ことにしない。件数が見えないと取りこぼす。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  shadowsight: { impl: false, file: INDEX, targets: ['1a', '1b', '1c', '1d'],
    why: '⭐ §2-2 の罠の再現。index.html に CLASS_SIGHT のリテラル表を**違う値で**書き戻し、DFSight.BASE を無視させる。' },
  flatsight:   { impl: false, file: SIGHT_JS, targets: ['0b'],
    why: 'DFSight.BASE の全職を tiles:8 に揃える → 母集団ガード (0b) が効いている証拠。' },
  emptysight:  { impl: false, file: SIGHT_JS, targets: ['0a', '3e'],
    why: 'DFSight.BASE を {} にする → (0a) か、STEP1 の throw (= pageerror) で (3e)。' },
  wrongft:     { impl: false, file: SIGHT_JS, targets: ['1e'],
    why: 'FT_PER_TILE を 4 にする → ft 表記が tiles×5 と食い違う。' },
  elfdark:     { impl: false, file: SIGHT_JS, targets: ['1f'],
    why: 'elf.term を「暗視」にする → SRD と食い違う語を当てた事故。' },
  dropsheetrow:  { impl: false, file: SHEET_JS, targets: ['1a', '2a'],
    why: 'シートの data-stat="sight" 行を出さない。' },
  dropcardsight: { impl: false, file: TAVERN, targets: ['1b', '2a'],
    why: '.pmSight を作らない。' },
  droprostersight: { impl: false, file: TAVERN, targets: ['1c'],
    why: 'mrMeta へ視界を足さない。' },
  droptitlesight:  { impl: false, file: TITLE, targets: ['1d', '2a'],
    why: '.classSight を作らない。' },
  legacydrop:  { impl: false, file: SIGHT_JS, targets: [],
    why: '⚠ 本ドライバでは赤くならない。driver_speech_boss (warriorSight===4) / driver_wall_face (pinOuter===330) が赤くなることを手で確認し §12 に書く。' },
  noretreat:   { impl: false, file: SIGHT_JS, targets: ['4a', '4b', '4c'],
    why: 'DFSight.enabled() を常に true にする → 撤退が効かない。' },
  retreatkills: { impl: false, file: INDEX, targets: ['4d'],
    why: '?darkvision=0 のとき CLASS_SIGHT も既定へ落とす → 「撤退でゲームが変わる」事故。' },
};
const MUT_ORDER = Object.keys(MUTATIONS);
const MUT_IMPL  = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_TODO  = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING / 項目 4 の担当)');
  process.exit(3);
}

// ══════════════════════════════════════════════════════════════════════════════
// 配信バイトの凍結 (別窓が同じリポを触っても測定が汚れないように)
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
for (const rel of [SIGHT_JS, SHEET_JS, INDEX, TAVERN, TITLE]) frozen(rel);

/* ══════════════════════════════════════════════════════════════════════════════
 * §3 非退行の基準 — 着手前 hash を **別ポートで同時配信**する
 *   ⛔⛔ 基準を HEAD にしない (#34 の教訓)。既定は #39 に 1 バイトも触っていない f80a03c。
 *   ⚠ git show が返すのは blob (LF)。作業ツリーは CRLF だが、比べるのはバイトではなく
 *     **実行時に描かれた文字列**なので改行差は結果に影響しない。
 *   ⚠ 着手前に存在しないファイル (js/class-sight.js) は取れない → 現行バイトへフォールバック。
 *     基準の tavern.html はそれを <script src> していないので、置いてあっても 1 行も効かない。
 *   ⚠ git を叩くのは .html / .js / .css だけ。画像や音まで git show すると
 *     1 ページで数十回プロセスを起こすことになる (どうせ #39 では 1 バイトも動いていない)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const BASE_REF  = arg('baseline', 'f80a03c');
const BASE_PORT = PORT + 40;
const BASE_EXT  = ['.html', '.js', '.css'];
const BASE_SNAP = new Map();
let BASE_ERR = null;
function baseBytes(rel) {
  if (BASE_SNAP.has(rel)) return BASE_SNAP.get(rel);
  let buf = null;
  try {
    buf = require('child_process').execFileSync('git', ['show', BASE_REF + ':' + rel],
      { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { buf = null; }
  BASE_SNAP.set(rel, buf);
  return buf;
}
try {
  const bt = baseBytes(TAVERN);
  if (bt === null) throw new Error('git show ' + BASE_REF + ':' + TAVERN + ' が取れない');
  /* ⭐ 母集団ガード: 「基準が本当に着手前か」を 1 点で確かめる。
     基準の tavern.html に既に #39 の痕跡があれば、それは基準ではなく着地後のコミット。 */
  const s = bt.toString('utf8');
  if (s.indexOf('pmSight') >= 0 || s.indexOf('DFSight') >= 0) {
    throw new Error('基準 ' + BASE_REF + ' の tavern.html に既に #39 が入っている'
      + ' (pmSight/DFSight を検出) = 基準が新しすぎる');
  }
} catch (e) { BASE_ERR = (e && e.message) || String(e); }

const MUT_SRC = {};
for (const k of MUT_IMPL) {
  const m = MUTATIONS[k];
  const body = frozen(m.file);
  if (body === null) { console.error('[drv] ⛔ 変異 ' + k + ' の対象 ' + m.file + ' が読めない'); process.exit(3); }
  const src = body.toString('utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換**前**文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
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
MUT_IMPL.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });
/** 変異ポートで実際に配信されるソース (変異対象でなければ凍結バイト) */
function servedSrc(mutKey, rel) {
  if (mutKey && MUT_SRC[mutKey] && MUT_SRC[mutKey].file === rel) return MUT_SRC[mutKey].body;
  const b = frozen(rel);
  return b === null ? '' : b.toString('utf8');
}

// ══════════════════════════════════════════════════════════════════════════════
// (0g) 数値の表を数える — ⚠ 値の記法まで含めた厳しいパターン
//   BASE  … tiles → inner → outer が **この順で並ぶ** 3 つ組 (視界の表の shape そのもの)
//   LEGACY… classKey → 3 要素の数値配列
//   ⭐ どちらも武器射程表 RANGE (`{ tiles: 8, label: …, engagePx: … }`) には当たらない。
//   ⭐ 散文のコメントにも当たらない (2026-08-31 実測: 移設後の index.html で 0/0)。
// ══════════════════════════════════════════════════════════════════════════════
const RE_BASE_ROW   = /tiles:\s*\d+\s*,\s*inner:\s*\d+\s*,\s*outer:\s*\d+/g;
const RE_LEGACY_ROW = /(?:mage|warrior|cleric|rogue|elf|dwarf)\s*:\s*\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]/g;
function countTables(src) {
  return { base:   (String(src).match(RE_BASE_ROW) || []).length,
           legacy: (String(src).match(RE_LEGACY_ROW) || []).length };
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
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
function startServer(port, mutKey, useBase) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '') || 'index.html';
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        /* ★基準ポート: ソース系だけ着手前 hash から配り、資材は現行へフォールバック。 */
        let buf = null;
        if (useBase && BASE_EXT.indexOf(path.extname(rel).toLowerCase()) >= 0) buf = baseBytes(rel);
        if (buf === null || buf === undefined) buf = frozen(rel);
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
  results.push({ name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + name + (detail ? '  — ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, state: 'PENDING', detail: why || '' });
  console.log('  **PENDING** ' + name + (why ? '  — ' + why : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

// ══════════════════════════════════════════════════════════════════════════════
// 種 (⭐ userDataDir が無い = プロファイルは毎回まっさら。状態は自分で仕込む)
// ══════════════════════════════════════════════════════════════════════════════
const PAGE_SEED = {
  'dragonfighters.partyComposition': JSON.stringify(['warrior']),
  'dragonfighters.xp': '6000',
  'dragonfighters.prologueSeen': '1',
  'dragonfighters.prepOnboardingSeen': '1',
  'dragonfighters.languages': JSON.stringify(['goblin']),
};
const PAGE_SETTLE = 1500;   // index は JS が HUD を後から組む。⚠ 縮めると測定がブレる

/** 画面から読んだ「視界 8 マス (40 ft)・暗視」を数値と語へ割る。⭐ これが経路A。 */
function parseSightText(s) {
  const t = String(s || '');
  const mt = t.match(/(\d+)\s*マス/);
  const mf = t.match(/\(\s*(\d+)\s*ft\s*\)/);
  return { tiles: mt ? parseInt(mt[1], 10) : null,
           feet:  mf ? parseInt(mf[1], 10) : null,
           text: t };
}
/** 狭い器 (.pmSight / .mrMeta) 用。「視界 12」から数字だけ拾う。項目 2/3 が使う。 */
function parseSightShort(s) {
  const m = String(s || '').match(/視界\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ① index.html — 経路B (裸の識別子) と 経路A (シートの視界行) を同じページで採る
//   ⭐ 6 職ぶんは localStorage を差し替えて DFSheet.render() を呼び直す。
//     heroClassKey() は毎回 localStorage を読むので、これが本番の描画経路そのもの。
//   ⚠ 切り替わったことは heroKey で必ず確かめる。切り替わっていないと 6 職が同じ行を
//     読むだけになり (1a) が「同じ数字どうし」で自明に緑になる。
// ══════════════════════════════════════════════════════════════════════════════
async function probeIndex(browser, base, query) {
  const o = { errs: [], status: 0, runtime: null, sheet: null };
  const page = await browser.newPage();
  page.on('pageerror', e => o.errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      for (const k in s.ls) localStorage.setItem(k, s.ls[k]);
      sessionStorage.clear();
      for (const k in s.ss) sessionStorage.setItem(k, s.ss[k]);
    } catch (e) { /* private mode 等 */ }
  }, { ls: PAGE_SEED, ss: { 'dragonfighters.currentScenario': 'goblin-mine' } });
  let resp = null;
  try { resp = await page.goto(base + '/' + INDEX + (query || ''), { waitUntil: 'load', timeout: 45000 }); }
  catch (e) { o.errs.push('goto: ' + ((e && e.message) || e)); }
  o.status = resp ? resp.status() : 0;
  await sleep(PAGE_SETTLE);

  /* ── 経路B: 裸の識別子。⚠ window.CLASS_SIGHT は classic script の const なので常に undefined ── */
  o.runtime = await page.evaluate(() => {
    const out = { ok: false };
    try {
      if (typeof CLASS_SIGHT === 'undefined') return { ok: false, why: 'CLASS_SIGHT が未定義' };
      out.keys = Object.keys(CLASS_SIGHT);
      out.getSightIsFn = (typeof getSight === 'function');
      out.tiles = {}; out.raw = {};
      if (out.getSightIsFn) for (const k of out.keys) out.tiles[k] = getSight(k).tiles;
      for (const k of out.keys) out.raw[k] = Object.assign({}, CLASS_SIGHT[k]);
      out.legacyKeys = (typeof CLASS_SIGHT_LEGACY !== 'undefined') ? Object.keys(CLASS_SIGHT_LEGACY) : null;
      out.onWindow = (typeof window.CLASS_SIGHT !== 'undefined');
      out.hasDFSight = !!window.DFSight;
      out.ok = true;
    } catch (e) { out.why = '例外: ' + (e && e.message); }
    return out;
  });

  /* ── 経路A: シートを開き、6 職ぶん再描画して視界行の **文字列** を読む ── */
  o.sheet = await page.evaluate((keys) => {
    const res = { ok: false, byClass: {} };
    const S = window.DFSheet;
    if (!S) { res.why = 'DFSheet が無い'; return res; }
    try { S.open(); } catch (e) { res.why = 'open で例外: ' + (e && e.message); return res; }
    for (const k of keys) {
      try { localStorage.setItem('dragonfighters.partyComposition', JSON.stringify([k])); } catch (e) {}
      try { S.render(); } catch (e) {}
      const sec = document.getElementById('dfSheetSecTraits');
      const row = sec ? sec.querySelector('[data-stat="sight"]') : null;
      const rv  = row ? row.querySelector('.rv') : null;
      res.byClass[k] = {
        heroKey:  S.heroClassKey ? S.heroClassKey() : null,
        secInDom: !!sec,
        rowInDom: !!row,
        /* ⭐ 値だけを読む (.rv)。ラベル「視界」を混ぜると語の assert が自明に緑になる。 */
        value:    rv ? String(rv.textContent || '').trim() : '',
        rowText:  row ? String(row.textContent || '').trim() : '',
        display:  row ? getComputedStyle(row).display : null,
        /* (3d) 用: 既存 3 行の順序。項目 3 が使う。 */
        statOrder: sec ? Array.prototype.map.call(sec.querySelectorAll('[data-stat]'),
                     (e) => e.getAttribute('data-stat')) : [],
      };
    }
    try { res.state = JSON.parse(JSON.stringify(S.__state())); } catch (e) { res.state = null; }
    res.ok = true;
    return res;
  }, CLASS_KEYS);

  await page.close();
  return o;
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ② title.html — 名乗りカード (0c)
//   ⭐ 種は空。スロット 1 が「記録なし」= 1 タップで名乗りへ入れる (手本 = verify_player_sheet)。
//   ⚠⚠ localStorage.clear() は **title.html のときだけ**。無条件だと遷移先でも走る。
// ══════════════════════════════════════════════════════════════════════════════
async function probeTitle(browser, base, query) {
  const o = { errs: [], status: 0, reached: false, nCards: 0, cards: [], beforeClick: null };
  const page = await browser.newPage();
  page.on('pageerror', e => o.errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try { if (/title\.html$/.test(location.pathname)) localStorage.clear(); } catch (e) {}
  });
  try {
    const resp = await page.goto(base + '/' + TITLE + (query || ''), { waitUntil: 'load', timeout: 45000 });
    o.status = resp ? resp.status() : 0;
    await sleep(400);
    await page.click('#slotList .slotCard[data-slot="1"] button[data-act="new"]');
    await sleep(220);
    const needConfirm = await page.$('#slotList button[data-act="confirm-yes"]');
    if (needConfirm) { await page.click('#slotList button[data-act="confirm-yes"]'); await sleep(220); }
    await page.waitForFunction(() => {
      const e = document.getElementById('screenNaming');
      return !!(e && getComputedStyle(e).display !== 'none');
    }, { timeout: 20000 });
    await sleep(200);
    o.reached = true;
  } catch (e) { o.errs.push('naming: ' + ((e && e.message) || e)); }

  if (o.reached) {
    /* 押す前 — .classDetail は閉じている ((2b) が使う) */
    o.beforeClick = await page.evaluate(() => {
      const cards = Array.prototype.slice.call(document.querySelectorAll('#classCards .classCard'));
      return { n: cards.length, detailDisplay: cards.map((c) => {
        const d = c.querySelector('.classDetail');
        return d ? getComputedStyle(d).display : null;
      }), nSight: document.querySelectorAll('#classCards .classSight').length,
        /* ⭐ (2b) 用。⚠ 祖先が display:none でも **自分の** computed display は block のまま
           なので、「見えていない」は getClientRects().length で測る。器を classDetail の
           外へ置いた事故 (= 押す前から見えている) はここでしか捕まらない。 */
        sightVisible: cards.map((c) => {
          const s = c.querySelector('.classSight');
          return s ? (s.getClientRects().length > 0) : null;
        }) };
    });
    o.nCards = o.beforeClick.n;
    /* 6 枚を 1 枚ずつ押して開き、その中の .classSight を読む (項目 2 が (1d) で使う) */
    for (const k of CLASS_KEYS) {
      let rec = { classKey: k, clicked: false };
      try {
        await page.click('#classCards .classCard[data-class-key="' + k + '"]');
        await sleep(120);
        rec = await page.evaluate((ck) => {
          const card = document.querySelector('#classCards .classCard[data-class-key="' + ck + '"]');
          const det  = card ? card.querySelector('.classDetail') : null;
          const sg   = card ? card.querySelector('.classSight') : null;
          const t = (sel) => {
            const e = card ? card.querySelector(sel) : null;
            return e ? String(e.textContent || '').trim() : '';
          };
          return {
            classKey: ck, clicked: true,
            selected: !!(card && card.classList.contains('selected')),
            detailDisplay: det ? getComputedStyle(det).display : null,
            hasSight: !!sg,
            sightText: sg ? String(sg.textContent || '').trim() : '',
            sightDisplay: sg ? getComputedStyle(sg).display : null,
            /* ⭐ (2a)(2b) 用: 実際に描かれているか (祖先ごと隠れていれば rects は 0)。 */
            sightVisible: sg ? (sg.getClientRects().length > 0) : false,
            zone: t('.classZone'), role: t('.classRole'), note: t('.classNote'),
          };
        }, k);
      } catch (e) { rec.err = String((e && e.message) || e); }
      o.cards.push(rec);
    }
  }
  await page.close();
  return o;
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ③ tavern.html — マッチング画面 (0d) と 傭兵名簿 (0e)
//   ⚠ openPrep() を await しない (演出はタップ待ちで止まる)。進めるのは #pmDepart だけ。
//   ⛔ #partyMatchOverlay / #pmColumns を叩かない (それが測定対象そのもの)。
//   ⚠ 名簿は空だと mrEmpty で行が出ない → 先に本番の DFRoster.enroll() で 1 人以上入れる。
//     ⭐ これを忘れると §3 が丸ごと空振りして永久緑になる。
// ══════════════════════════════════════════════════════════════════════════════
function tavernSeed() {
  try {
    [localStorage, sessionStorage].forEach(function (store) {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) store.removeItem(k);
      });
    });
  } catch (e) {}
  try {
    localStorage.setItem('dragonfighters.xp', '10000');
    /* ⭐ (1b) の母集団。主人公を **dwarf** にすることで、
       マッチングカードに必ず tiles が最小でない職が 1 枚混ざる。
       ⚠ 全員が 8 タイルの職だと、番号を写経した実装でも (1b) が緑になる。 */
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['dwarf']));
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
  } catch (e) {}
}

async function probeTavern(browser, base, query) {
  const o = { errs: [], status: 0, cinema: null, roster: null };
  const page = await browser.newPage();
  page.on('pageerror', e => o.errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const url = base + '/' + TAVERN + (query || '');
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(tavernSeed);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    o.status = resp ? resp.status() : 0;
    await page.waitForFunction(
      "typeof openPrep === 'function' && typeof scenarios !== 'undefined' && !!window.DFRoster",
      { timeout: 30000 });
    await sleep(400);
  } catch (e) { o.errs.push('boot: ' + ((e && e.message) || e)); }

  /* ── (0e) 名簿: 本番の enroll() で 3 人入れてから開く ───────────────────────
     ⛔ localStorage へ手で JSON を書かない (保存形をドライバが決めてしまう)。 */
  const roster = { enrolled: -1 };
  try {
    roster.enrolled = await page.evaluate(() => {
      if (!window.DFRoster) return -1;
      const want = [
        { classKey: 'dwarf',   name: '(装置) ドワーフ', trait: '石に明るい', line: '「任せろ。」', level: 3 },
        { classKey: 'elf',     name: '(装置) エルフ',   trait: '耳が良い',   line: '「静かに。」', level: 2 },
        { classKey: 'warrior', name: '(装置) 戦士',     trait: '前に出る',   line: '「行くぞ。」', level: 1 },
      ];
      let n = 0;
      for (const m of want) { if (DFRoster.enroll(m) != null) n++; }
      return n;
    });
    await page.click('#rosterEntry');
    await sleep(250);
  } catch (e) { o.errs.push('roster-open: ' + ((e && e.message) || e)); }
  try {
    o.roster = Object.assign(roster, await page.evaluate(() => {
      const ov = document.getElementById('rosterOverlay');
      const rows = Array.prototype.slice.call(document.querySelectorAll('.mrRow'));
      const cs = ov ? getComputedStyle(ov) : null;
      return {
        hasEntry: !!document.getElementById('rosterEntry'),
        overlayInDom: !!ov,
        overlayDisplay: cs ? cs.display : null,
        overlayVisibility: cs ? cs.visibility : null,
        empty: !!document.querySelector('.mrEmpty'),
        nRows: rows.length,
        all: window.DFRoster ? DFRoster.all().length : -1,
        /* ⭐ (1c) は職ごとに経路Bと突き合わせるので classKey が要る。
           ⛔ 本番 DOM へ検証専用の data 属性を足さない —— 名簿の権威 DFRoster.all() と
             **同じ並び**で突き合わせる (renderRosterPanel は all() を forEach で描いている)。
           ⚠ 並びが同じであることは .mrName と名簿の name の一致で毎回確かめる
             (並びがズレていたら (1c) は職を取り違えたまま緑になりうる)。 */
        allList: window.DFRoster ? DFRoster.all().map((m) => ({
          id: m.id, classKey: m.classKey, name: m.name, level: m.level, runs: m.runs })) : [],
        rows: rows.map((r) => {
          const meta = r.querySelector('.mrMeta');
          const nm   = r.querySelector('.mrName');
          return { name: nm ? String(nm.textContent || '').trim() : '',
                   meta: meta ? String(meta.textContent || '').trim() : '' };
        }),
      };
    }));
  } catch (e) { o.errs.push('roster: ' + ((e && e.message) || e)); o.roster = roster; }

  /* ── (0d) マッチング画面: 受注 → 演出が開いた瞬間 → 全カード確定まで進める ── */
  try {
    await page.evaluate(() => {
      const ov = document.getElementById('rosterOverlay');
      if (ov) ov.classList.remove('show');
    });
    await page.evaluate((id) => {
      const sc = scenarios.find((s) => s.id === id);
      if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
      Promise.resolve(openPrep(sc)).catch(() => {});
    }, 'goblin-mine');
    const t0 = Date.now();
    let lastClick = 0;
    let reached = false;
    while (Date.now() - t0 < 90000) {
      const st = await page.evaluate(() => {
        const q = (id) => document.getElementById(id);
        const ov = q('partyMatchOverlay');
        const vis = (el) => !!(el && el.getClientRects().length > 0);
        return {
          cinema: !!(ov && ov.style.display === 'flex' && !ov.classList.contains('fading')),
          prep: vis(q('prep')),
          prol: vis(q('prologueOverlay')),
        };
      });
      if (st.cinema) { reached = true; break; }
      if (st.prep) break;
      if (st.prol && Date.now() - lastClick > 400) {
        lastClick = Date.now();
        try { await page.click('#prologueOverlay'); } catch (e) {}
      }
      await sleep(60);
    }
    /* 全カードが確定するまで待つ (720ms 刻みの開示フェーズ) */
    if (reached) {
      const tw = Date.now();
      while (Date.now() - tw < 25000) {
        const f = await page.evaluate(() => {
          const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
          return { n: cols.length, filled: cols.filter((c) => c.dataset.state === 'filled').length };
        });
        if (f.n > 0 && f.filled === f.n) break;
        await sleep(200);
      }
    }
    o.cinema = Object.assign({ reached: reached }, await page.evaluate(() => {
      const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
      const txt = (el) => (el && el.textContent ? String(el.textContent).trim() : '');
      return {
        n: cols.length,
        filled: cols.filter((c) => c.dataset.state === 'filled').length,
        cards: cols.map((c) => {
          const sg = c.querySelector('.pmSight');
          return {
            state: c.dataset.state || '',
            /* ⭐ (1b) は職ごとに経路Bと突き合わせるので classKey が要る。
               ⛔ 表示名 (pmClassNameJa) から逆引きしない —— 名前を変えた瞬間に測定が壊れる。 */
            classKey: c.dataset.classKey || '',
            name: txt(c.querySelector('.pmName')),
            cls: txt(c.querySelector('.pmClass')),
            zone: txt(c.querySelector('.pmZone')),
            hasSight: !!sg,
            sight: txt(sg),
            sightDisplay: sg ? getComputedStyle(sg).display : null,
          };
        }),
      };
    }));
  } catch (e) { o.errs.push('cinema: ' + ((e && e.message) || e)); }

  await page.close();
  return o;
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ④ §3 非退行 — 決定論的な編成で演出を開き、器のテキストと出発の口を採る
//   ⭐⭐⭐ openPrep 経由では (3a) を測れない。buildParty() が Math.random() で顔ぶれを
//     作り直すので、基準と現行を 1 文字単位で比べると **視界と無関係な差分**で必ず赤くなる。
//     → 既存の検証シーム window.__pmTest.play() に selection.partyMembers を直接与える。
//   ⭐ 顔ぶれ = warrior(主人公) + dwarf / elf / rogue。視界が 8 / 10 / 12 の 3 種類そろう。
//     ⚠ 全員が同じ職だと「1 行増えたことの巻き添え」が 1 通りしか見えない。
//   ⚠ 名簿も同じ関数で採る。基準 (着手前) には視界の節が無いので (3b) は
//     「視界の節を落とした残り」を突き合わせる。
// ══════════════════════════════════════════════════════════════════════════════
/** 名簿の種。⛔ localStorage へ手で JSON を書かない (保存形をドライバが決めてしまう)。 */
const ROSTER_SEED = [
  { classKey: 'dwarf',   name: '(装置) ドワーフ', trait: '石に明るい', line: '「任せろ。」', level: 3 },
  { classKey: 'elf',     name: '(装置) エルフ',   trait: '耳が良い',   line: '「静かに。」', level: 2 },
  { classKey: 'warrior', name: '(装置) 戦士',     trait: '前に出る',   line: '「行くぞ。」', level: 1 },
];
/** (3a) の顔ぶれ。主人公 warrior + 仲間 3 人。⭐ 視界が 3 種類そろう並び。 */
const NR_PARTY = ['dwarf', 'elf', 'rogue'];

/** 見えている要素の中心を **実マウス**で叩く。⚠ 引き出しを開くと中心が動くので毎回測り直す。 */
async function clickCenterOfSel(page, sel) {
  const rc = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: hit ? String(hit.id || hit.className || hit.tagName) : '(なし)' };
  }, sel);
  if (!rc) return null;
  await page.mouse.click(Math.round(rc.x), Math.round(rc.y));
  return rc;
}

/** 引き出しを開いたまま #pmDepart が viewport に残っているか ((3c))。 */
const DEPART_GEO = () => {
  const dep = document.getElementById('pmDepart');
  const drw = document.getElementById('pmDrawer');
  const r = dep ? dep.getBoundingClientRect() : null;
  const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    drawerVis: !!(drw && !drw.hidden),
    nOpen: document.querySelectorAll('#pmColumns .pmColumn.pmOpen').length,
    depHidden: dep ? !!dep.hidden : null,
    /* ⚠ 2 列へ落ちたことを確かめる。落ちていない幅で測ると compact を測ったことにならない。 */
    cols: (() => { try { return getComputedStyle(document.getElementById('pmColumns'))
      .gridTemplateColumns.trim().split(/\s+/).length; } catch (e) { return -1; } })(),
    rect: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom),
                left: Math.round(r.left), right: Math.round(r.right) } : null,
    hitId: hit ? String(hit.id || hit.className || hit.tagName) : '(なし)',
  };
};

/* ⚠⚠⚠ 2026-08-31 実測: **演出を開いたあとに setViewport で幅を変えると演出ごと畳まれる**
 *   (引き出し vis=false / 開いたカード 0 枚 / #pmDepart の命中先が #tavernViewport)。
 *   → compact は「開いてから縮める」のではなく **最初から 390x844 で開いた別ページ**で測る
 *     (verify_party_match_setup の腕 D と同じ作法)。⛔ 縮めて測る形へ戻さないこと。 */
const VP_DESKTOP = { w: 1280, h: 900, mobile: false, cols: 4 };
const VP_COMPACT = { w: 390,  h: 844, mobile: true,  cols: 2 };

async function probeTavernNR(browser, base, label, vp, opts) {
  vp = vp || VP_DESKTOP;
  const o = { label, vp, errs: [], status: 0, boot: false, enrolled: -1,
              roster: [], cards: [], reached: false, geo: null };
  const page = await browser.newPage();
  page.on('pageerror', e => o.errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1,
    isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  const url = base + '/' + TAVERN;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(tavernSeed);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    o.status = resp ? resp.status() : 0;
    await page.waitForFunction(
      "typeof scenarios !== 'undefined' && !!window.DFRoster"
      + " && !!(window.__pmTest && typeof __pmTest.play === 'function')",
      { timeout: 30000 });
    await sleep(400);
    o.boot = true;
  } catch (e) { o.errs.push('boot: ' + ((e && e.message) || e)); }

  /* ── 名簿 ((3b)) ────────────────────────────────────────────────────── */
  if (!(opts && opts.skipRoster)) try {
    o.enrolled = await page.evaluate((want) => {
      let n = 0;
      for (const m of want) { if (DFRoster.enroll(m) != null) n++; }
      return n;
    }, ROSTER_SEED);
    await page.click('#rosterEntry');
    await sleep(250);
    o.roster = await page.evaluate(() => {
      const txt = (e) => (e ? String(e.textContent || '').trim() : '');
      return Array.prototype.map.call(document.querySelectorAll('.mrRow'), (r) => ({
        name: txt(r.querySelector('.mrName')), meta: txt(r.querySelector('.mrMeta')) }));
    });
    await page.evaluate(() => {
      const ov = document.getElementById('rosterOverlay');
      if (ov) ov.classList.remove('show');
    });
    await sleep(150);
  } catch (e) { o.errs.push('roster: ' + ((e && e.message) || e)); }

  /* ── 演出を **決定論的な顔ぶれ**で開く ────────────────────────────── */
  try {
    await page.evaluate((id, want) => {
      const mk = (ck, isHero, name) => ({
        classKey: ck, isHero: !!isHero, name: name,
        zone: PARTY_ZONES[ck], variant: 0, level: 5,
      });
      selection.partyComposition = ['warrior'];
      selection.partyMembers = [mk('warrior', true, '')]
        .concat(want.map((ck, i) => mk(ck, false, '(装置) 仲間' + (i + 1))));
      const sc = scenarios.find((s) => s.id === id);
      Promise.resolve(window.__pmTest.play(sc)).catch(() => {});
    }, 'goblin-mine', NR_PARTY);
    /* 出発の口が見えるまで待つ (= 全カード確定 + タップ猶予明け)。 */
    for (let i = 0; i < 300; i++) {
      const st = await page.evaluate(() => {
        const d = document.getElementById('pmDepart');
        return !!(d && !d.hidden && d.getClientRects().length > 0);
      });
      if (st) { o.reached = true; break; }
      await sleep(50);
    }
    o.cards = await page.evaluate(() => {
      const txt = (e) => (e ? String(e.textContent || '').trim() : '');
      return Array.prototype.map.call(document.querySelectorAll('#pmColumns .pmColumn'), (c) => ({
        state: c.dataset.state || '',
        classKey: c.dataset.classKey || '',
        name:   txt(c.querySelector('.pmName')),
        cls:    txt(c.querySelector('.pmClass')),
        zone:   txt(c.querySelector('.pmZone')),
        /* ⭐ (3a) の対象。⛔ .pmSight は入れない (それは足したもの = 比べる相手ではない)。 */
        equip:  Array.prototype.map.call(c.querySelectorAll('.pmEquipRow'), (r) => txt(r)),
        skills: txt(c.querySelector('.pmSkillsVal')),
        hasSight: !!c.querySelector('.pmSight'),
        sight:  txt(c.querySelector('.pmSight')),
      }));
    });
  } catch (e) { o.errs.push('cinema: ' + ((e && e.message) || e)); }

  /* ── (3c) 引き出しを開いたまま #pmDepart が画面に残るか ──────────────
     ⚠⚠ #35 の実測: compact の 30vh が desktop の 42vh に勝つ = **両方の幅で**測る。
     ⚠ カードが 2 列へ落ちる境目は @media (max-width: 720px)。
       ⭐ 依頼書 §8 (3c) の「≤900px」は誤り —— tavern.html:2213 を読んで実測した。 */
  if (o.reached) {
    try {
      await clickCenterOfSel(page, '#pmColumns .pmColumn');
      await sleep(320);
      o.geo = await page.evaluate(DEPART_GEO);
    } catch (e) { o.errs.push('depart: ' + ((e && e.message) || e)); }
  }

  await page.close();
  return o;
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ⑤ (3e)(3f) — 本番 5 ページを開き、pageerror と localStorage の増減を採る
//   ⭐ シートは 5 ページ共通モジュール。読み込み順の巻き添えはここでしか見えない。
//   ⚠ 「0 本増えない」は **種が入っていること** が前提。空の localStorage で測ると
//     差分が空振りして永久緑になる (#36 (9b) と同じ罠)。
// ══════════════════════════════════════════════════════════════════════════════
const PAGES5 = [
  { label: 'index',  file: 'index.html'  },
  { label: 'tavern', file: 'tavern.html' },
  { label: 'title',  file: 'title.html'  },
  { label: 'town',   file: 'town.html'   },
  { label: 'world',  file: 'world.html'  },
];
const LS_KEYS = () => {
  const a = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('dragonfighters.') === 0) a.push(k);
    }
  } catch (e) { /* private mode */ }
  return a.sort();
};
async function probePages5(browser, base) {
  const out = [];
  for (const spec of PAGES5) {
    const o = { label: spec.label, file: spec.file, errs: [], status: 0,
                has: false, opened: null, closed: null, lsBefore: [], lsOpen: [], lsAfter: [] };
    const page = await browser.newPage();
    page.on('pageerror', e => o.errs.push(String((e && e.message) || e)));
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((s) => {
      try { localStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); } catch (e) {}
    }, PAGE_SEED);
    let resp = null;
    try { resp = await page.goto(base + '/' + spec.file, { waitUntil: 'load', timeout: 45000 }); }
    catch (e) { o.errs.push('goto: ' + ((e && e.message) || e)); }
    o.status = resp ? resp.status() : 0;
    await sleep(PAGE_SETTLE);
    try {
      const a = await page.evaluate((src) => ({ has: !!window.DFSheet, ls: eval(src)() }), String(LS_KEYS));
      o.has = a.has; o.lsBefore = a.ls;
      if (o.has) {
        o.opened = await page.evaluate((src) => {
          try { DFSheet.open(); } catch (e) { return 'open で例外: ' + (e && e.message); }
          return !!(DFSheet.isOpen && DFSheet.isOpen());
        }, String(LS_KEYS));
        await sleep(500);
        o.lsOpen = await page.evaluate((src) => eval(src)(), String(LS_KEYS));
        o.closed = await page.evaluate(() => {
          try { DFSheet.close(); } catch (e) { return 'close で例外: ' + (e && e.message); }
          return !!(DFSheet.isOpen && DFSheet.isOpen());
        });
        await sleep(400);
        o.lsAfter = await page.evaluate((src) => eval(src)(), String(LS_KEYS));
      }
    } catch (e) { o.errs.push('sheet: ' + ((e && e.message) || e)); }
    await page.close();
    out.push(o);
  }
  return out;
}

/** 「戦士 / Lv3 / 同行 5 回 / 視界 12」から **視界の節だけ**を落とす ((3b))。 */
function stripSight(meta) {
  return String(meta || '').split('/').map(s => s.trim())
    .filter(s => !/^視界\s*\d+$/.test(s)).join(' / ');
}
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ══════════════════════════════════════════════════════════════════════════════
// assert 一覧 (id / 見出し / 述語)。述語は測定結果 M だけを見る純関数。
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  // ── §0 装置 ────────────────────────────────────────────────────────────────
  ['0a', '[装置] index.html で CLASS_SIGHT が 6 職・getSight が関数 (経路Bが立つ)', (M) => {
    const r = M.idx.runtime || {};
    if (!r.ok) return [false, '⛔ ' + (r.why || '経路Bが読めない') + ' — 以降の assert が空振りして永久緑になる'];
    const n = (r.keys || []).length;
    return [n === 6 && r.getSightIsFn === true,
      'keys=' + n + ' (' + (r.keys || []).join(',') + ') getSight=' + (r.getSightIsFn ? '関数' : '⛔無し')
      + ' / window.CLASS_SIGHT=' + (r.onWindow ? '有り' : '無し(classic const なので想定どおり)')
      + ' / DFSight=' + (r.hasDFSight ? '搭載' : '⛔未搭載')];
  }],
  ['0b', '[装置] 経路Bの tiles に相異なる値が 3 種類ある (全職同値だと (1a) が何も測らない)', (M) => {
    const t = (M.idx.runtime || {}).tiles || {};
    const vals = Object.keys(t).map(k => t[k]);
    const uniq = Array.from(new Set(vals)).sort((a, b) => a - b);
    return [uniq.length >= 3,
      '実測 ' + Object.keys(t).map(k => k + '=' + t[k]).join(' ') + '  相異なる値 ' + uniq.length
      + ' 種類 [' + uniq.join(',') + ']' + (uniq.length >= 3 ? '' : ' ⛔ 3 種類必要')];
  }],
  ['0c', '[装置] title.html に .classCard が 6 枚あり、押すと classDetail が開く', (M) => {
    const t = M.title || {};
    if (!t.reached) return [false, '⛔ 名乗り画面へ到達できなかった: ' + (t.errs || []).join(' | ')];
    const opened = (t.cards || []).filter(c => c.detailDisplay && c.detailDisplay !== 'none').length;
    return [t.nCards === 6 && opened === 6,
      'カード ' + t.nCards + ' 枚 / 押して開いた ' + opened + ' 枚'
      + (t.nCards === 6 && opened === 6 ? '' : ' ⛔ 6/6 が必要')];
  }],
  ['0d', '[装置] マッチング画面に .pmColumn が 1 枚以上あり data-state="filled" に到達する', (M) => {
    const c = M.tavern.cinema || {};
    if (!c.reached) return [false, '⛔ 演出へ到達できなかった (openPrep 経由): ' + (M.tavern.errs || []).join(' | ')];
    return [c.n >= 1 && c.n === c.filled,
      'カード ' + c.n + ' 枚 / filled ' + c.filled + ' 枚 (職: '
      + (c.cards || []).map(x => x.cls).join(',') + ')'
      + (c.n >= 1 && c.n === c.filled ? '' : ' ⛔ 全枚 filled が必要')];
  }],
  ['0e', '[装置] 傭兵名簿に 1 人以上入っており .mrRow が出ている (mrEmpty ではない)', (M) => {
    const r = M.tavern.roster || {};
    return [r.nRows >= 1 && r.empty === false && r.all >= 1,
      '本番の enroll() で ' + r.enrolled + ' 人登録 / 在籍 ' + r.all + ' 人 / 描かれた行 ' + r.nRows
      + ' / mrEmpty=' + r.empty + ' / overlay display=' + r.overlayDisplay
      + (r.nRows >= 1 && r.empty === false ? '' : ' ⛔ 空だと §3 が丸ごと空振りして永久緑になる')];
  }],
  ['0f', '[装置] キャラシートの区画 dfSheetSecTraits が inDom (#36 の 3 値契約で avail 側)', (M) => {
    const st = (M.idx.sheet || {}).state;
    if (!st) return [false, '⛔ DFSheet.__state() が採れない'];
    const secs = st.sections || st.secs || [];
    const s = secs.filter(x => x.id === 'dfSheetSecTraits')[0];
    if (!s) return [false, '⛔ dfSheetSecTraits が __state() に居ない (見えた区画: '
      + secs.map(x => x.id).join(',') + ')'];
    return [s.inDom === true && s.avail === true,
      'avail=' + s.avail + ' inDom=' + s.inDom + ' blank=' + s.blank
      + ' dataCells=' + s.dataCells + ' textLen=' + s.textLen];
  }],
  ['0g', '★[装置] 視界の数値の表は js/class-sight.js に**だけ**ある (写しを作っていない / 移設が実際に起きた)', (M) => {
    const g = M.tables || {};
    const src = g[SIGHT_JS] || { base: 0, legacy: 0 };
    const bad = NUM_FILES.filter(f => (g[f] || {}).base > 0 || (g[f] || {}).legacy > 0);
    const desc = NUM_FILES.map(f => f + '=' + (g[f] || {}).base + '/' + (g[f] || {}).legacy).join(' ');
    return [src.base === 6 && src.legacy === 6 && bad.length === 0,
      SIGHT_JS + '=' + src.base + '/' + src.legacy + ' (BASE行/LEGACY行)  他: ' + desc
      + (bad.length ? '  ⛔ 写しが残っている: ' + bad.join(',')
        : (src.base === 6 && src.legacy === 6 ? '' : '  ⛔ 移設先に 6/6 が無い'))];
  }],

  // ── §1 数字が一致する (本丸) ───────────────────────────────────────────────
  ['1a', '★キャラシートの視界行の数字 = 経路Bの getSight(classKey).tiles (6 職すべて)', (M) => {
    const sh = M.idx.sheet || {};
    const rt = (M.idx.runtime || {}).tiles || {};
    if (!sh.ok) return [false, '⛔ ' + (sh.why || 'シートが測れない')];
    const bad = [], seen = [];
    for (const k of CLASS_KEYS) {
      const r = sh.byClass[k] || {};
      /* ⭐ 職が実際に切り替わったかを先に見る。切り替わっていないと 6 職が同じ行を読み、
         (1a) が「同じ数字どうし」で自明に緑になる。 */
      if (r.heroKey !== k) { bad.push(k + ': 主人公が切り替わっていない (heroKey=' + r.heroKey + ')'); continue; }
      if (!r.rowInDom) { bad.push(k + ': 視界行が DOM に無い'); continue; }
      const p = parseSightText(r.value);
      seen.push(k + ' 画面=' + p.tiles + ' 実行時=' + rt[k]);
      if (p.tiles === null) bad.push(k + ': 画面から数字が読めない "' + r.value + '"');
      else if (p.tiles !== rt[k]) bad.push(k + ': 画面 ' + p.tiles + ' ≠ 実行時 ' + rt[k]);
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ') : seen.join('  ')];
  }],
  ['1e', 'ft 表記が「画面から読んだ tiles × 5」と一致 (8→40 / 10→50 / 12→60)', (M) => {
    const sh = M.idx.sheet || {};
    if (!sh.ok) return [false, '⛔ シートが測れない'];
    const bad = [], seen = [];
    for (const k of CLASS_KEYS) {
      const r = sh.byClass[k] || {};
      if (!r.rowInDom) { bad.push(k + ': 視界行が無い'); continue; }
      const p = parseSightText(r.value);
      if (p.tiles === null || p.feet === null) { bad.push(k + ': "' + r.value + '" から tiles/ft が読めない'); continue; }
      /* ⭐ 「40」を写経して比べない。**画面から読んだ tiles を 5 倍したもの**と突き合わせる。 */
      const want = p.tiles * 5;
      seen.push(k + ' ' + p.tiles + '→' + p.feet + 'ft');
      if (p.feet !== want) bad.push(k + ': ' + p.feet + 'ft ≠ ' + p.tiles + '×5=' + want);
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ') : seen.join('  ')];
  }],
  ['1f', '語が職と対応している (dwarf に「暗視」/ elf に「低光視力」/ ⚠ elf に「暗視」が出ていない)', (M) => {
    const sh = M.idx.sheet || {};
    if (!sh.ok) return [false, '⛔ シートが測れない'];
    const dw = (sh.byClass.dwarf || {}).value || '';
    const el = (sh.byClass.elf || {}).value || '';
    const bad = [];
    if (dw.indexOf(TERM_DWARF) < 0) bad.push('dwarf に「' + TERM_DWARF + '」が無い: "' + dw + '"');
    if (el.indexOf(TERM_ELF) < 0) bad.push('elf に「' + TERM_ELF + '」が無い: "' + el + '"');
    /* ⭐ 本作のエルフは 10 タイル (50ft)。5.1 SRD の Elf (Darkvision 60ft) とは違うので
       「暗視」を当てると嘘になる。ここが (1f) の本体。 */
    if (el.indexOf(TERM_DWARF) >= 0) bad.push('⛔ elf に「' + TERM_DWARF + '」が出ている (SRD と食い違う): "' + el + '"');
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : 'dwarf="' + dw + '" / elf="' + el + '"'];
  }],
  ['1b', '★マッチングカードの .pmSight の数字 = 経路Bのその職の tiles (出ているカード全部)', (M) => {
    const c = M.tavern.cinema || {};
    const rt = (M.idx.runtime || {}).tiles || {};
    if (!c.reached) return [false, '⛔ 演出へ到達できなかった — 先に (0d) を見ること'];
    const cards = (c.cards || []).filter(x => x.state === 'filled');
    /* ⭐ 母集団ガード。0 枚だと for が 1 度も回らず「欠陥ゼロ」で永久緑になる。 */
    if (!cards.length) return [false, '⛔ filled のカードが 0 枚 — 母集団が無い'];
    const bad = [], seen = [];
    /* ⭐⭐ 母集団ガードの本体。出ているカードが全部「最小視界の職」だと、
       .pmSight に数字を写経した実装でも (1b) が緑になる。
       ⚠ 最小値は **経路Ｂから導出**する (8 を写経しない)。 */
    const runtimeVals = CLASS_KEYS.map(k => rt[k]).filter(v => typeof v === 'number');
    const minTiles = runtimeVals.length ? Math.min.apply(null, runtimeVals) : null;
    if (minTiles !== null && !cards.some(x => typeof rt[x.classKey] === 'number' && rt[x.classKey] !== minTiles)) {
      bad.push('⛔ 出ているカードが全部「最小視界 ' + minTiles
        + ' の職」— 数字を写経した実装でも緑になる母集団');
    }
    for (const x of cards) {
      const k = x.classKey;
      if (!k) { bad.push('カードに data-class-key が無い (name="' + x.name + '")'); continue; }
      if (typeof rt[k] !== 'number') { bad.push(k + ': 経路Bにその職が無い'); continue; }
      if (!x.hasSight) { bad.push(k + ': .pmSight が無い'); continue; }
      /* ⭐ 経路A = 画面の文字列から数字を読む。⛔ DFSight.sightLabel と突き合わせない。 */
      const t = parseSightShort(x.sight);
      seen.push(k + ' 画面=' + t + ' 実行時=' + rt[k]);
      if (t === null) bad.push(k + ': 画面から数字が読めない "' + x.sight + '"');
      else if (t !== rt[k]) bad.push(k + ': 画面 ' + t + ' ≠ 実行時 ' + rt[k]);
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : cards.length + ' 枚: ' + seen.join('  ')];
  }],
  ['1d', '★名乗りカード .classSight の数字 = 経路Bの tiles (6 枚すべて)', (M) => {
    const t = M.title || {};
    const rt = (M.idx.runtime || {}).tiles || {};
    if (!t.reached) return [false, '⛔ 名乗り画面へ到達できなかった — 先に (0c) を見ること'];
    const bad = [], seen = [];
    for (const k of CLASS_KEYS) {
      const rec = (t.cards || []).filter(c => c.classKey === k)[0];
      if (!rec || !rec.clicked) { bad.push(k + ': カードを押せていない'); continue; }
      if (!rec.hasSight) { bad.push(k + ': .classSight が無い'); continue; }
      const p = parseSightText(rec.sightText);
      seen.push(k + ' 画面=' + p.tiles + ' 実行時=' + rt[k]);
      if (p.tiles === null) bad.push(k + ': 画面から数字が読めない "' + rec.sightText + '"');
      else if (p.tiles !== rt[k]) bad.push(k + ': 画面 ' + p.tiles + ' ≠ 実行時 ' + rt[k]);
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ') : seen.join('  ')];
  }],

  // ── §2 表示が実在する (空文字で緑にしない) ─────────────────────────────
  ['2a', '該当箇所 (シート / 名乗りカード / マッチングカード) の textContent が空文字でない・display !== "none"', (M) => {
    /* ⚠ 4 箇所目の傭兵名簿は項目 3 (STEP3) が足す。ここでは 3 箇所を測る。
       ⭐ #38 の教訓「キー集合だけの恒等 assert は変異を検出できない」→ 値の中身まで見る。 */
    const bad = [], seen = [];
    const sh = M.idx.sheet || {};
    if (!sh.ok) bad.push('シートが測れない');
    else for (const k of CLASS_KEYS) {
      const r = sh.byClass[k] || {};
      if (!r.rowInDom) bad.push('シート ' + k + ': 視界行が DOM に無い');
      else if (!String(r.value || '').trim()) bad.push('シート ' + k + ': 値が空文字');
      else if (r.display === 'none') bad.push('シート ' + k + ': display:none');
    }
    seen.push('シート 6 職');
    const t = M.title || {};
    if (!t.reached) bad.push('名乗り画面へ到達できていない');
    else for (const k of CLASS_KEYS) {
      const rec = (t.cards || []).filter(c => c.classKey === k)[0];
      if (!rec || !rec.hasSight) bad.push('名乗り ' + k + ': .classSight が無い');
      else if (!String(rec.sightText || '').trim()) bad.push('名乗り ' + k + ': 空文字');
      else if (rec.sightDisplay === 'none') bad.push('名乗り ' + k + ': display:none');
      else if (rec.sightVisible !== true) bad.push('名乗り ' + k + ': 開いても画面に出ていない');
    }
    seen.push('名乗り 6 枚');
    const c = M.tavern.cinema || {};
    const cards = (c.cards || []).filter(x => x.state === 'filled');
    if (!c.reached || !cards.length) bad.push('マッチングカードの母集団が 0 枚');
    else for (const x of cards) {
      if (!x.hasSight) bad.push('カード ' + (x.classKey || x.name) + ': .pmSight が無い');
      else if (!String(x.sight || '').trim()) bad.push('カード ' + x.classKey + ': 空文字');
      else if (x.sightDisplay === 'none') bad.push('カード ' + x.classKey + ': display:none');
    }
    seen.push('カード ' + cards.length + ' 枚');
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : seen.join(' / ') + ' すべて非空・可視 (⚠ 4 箇所目の名簿は項目 3)'];
  }],
  ['2b', '名乗りカードはタップ前は非表示 / タップ後に表示 (既存の開閉規則を壊していない)', (M) => {
    const t = M.title || {};
    if (!t.reached) return [false, '⛔ 名乗り画面へ到達できなかった'];
    const bc = t.beforeClick || {};
    const bad = [];
    const openBefore = (bc.detailDisplay || []).filter(d => d && d !== 'none').length;
    if (openBefore !== 0) bad.push('押す前に開いている classDetail が ' + openBefore + ' 枚');
    if (bc.nSight !== 6) bad.push('押す前の .classSight が ' + bc.nSight + ' 個 (器は 6 個作られているはず)');
    const visBefore = (bc.sightVisible || []).filter(v => v === true).length;
    if (visBefore !== 0) bad.push('⛔ 押す前から見えている .classSight が ' + visBefore
      + ' 個 (classDetail の外へ置いた事故)');
    for (const k of CLASS_KEYS) {
      const rec = (t.cards || []).filter(c => c.classKey === k)[0];
      if (!rec) { bad.push(k + ': カードが無い'); continue; }
      if (!rec.selected) bad.push(k + ': 押しても selected にならない');
      if (!rec.detailDisplay || rec.detailDisplay === 'none') bad.push(k + ': 押しても classDetail が開かない');
      if (rec.sightVisible !== true) bad.push(k + ': 押しても .classSight が見えない');
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : '押す前 = classDetail 開 0 枚 / .classSight 器 ' + bc.nSight
        + ' 個・可視 0 個  →  押した後 = 6 枚とも開き視界行が可視'];
  }],

  // ── §1 の 4 箇所目: 傭兵名簿 ─────────────────────────────────────────────
  ['1c', '★名簿の .mrMeta の視界 = 経路Bのその職の tiles (名簿の全行)', (M) => {
    const r  = M.tavern.roster || {};
    const rt = (M.idx.runtime || {}).tiles || {};
    const rows = r.rows || [], all = r.allList || [];
    /* ⭐ 母集団ガード ①: 行が無いと for が 1 度も回らず「欠陥ゼロ」で永久緑になる。 */
    if (!rows.length) return [false, '⛔ .mrRow が 0 行 — 先に (0e) を見ること'];
    if (rows.length !== all.length) return [false, '⛔ 描かれた行 ' + rows.length
      + ' と名簿の在籍 ' + all.length + ' が食い違う (突き合わせの前提が崩れている)'];
    const bad = [], seen = [];
    /* ⭐⭐ 母集団ガード ②: 名簿の職が全部同じ視界だと、「視界 8」を直書きした実装でも
       (1c) が緑になる。相異なる tiles が 2 種類以上あることを要求する。 */
    const uniq = Array.from(new Set(all.map(m => rt[m.classKey]).filter(v => typeof v === 'number')));
    if (uniq.length < 2) bad.push('⛔ 名簿の職の視界が ' + uniq.length
      + ' 種類しかない [' + uniq.join(',') + '] — 数字を直書きした実装でも緑になる母集団');
    for (let i = 0; i < rows.length; i++) {
      const m = all[i] || {};
      /* ⭐ 並びが同じであることを名前で確かめる。ズレていたら職を取り違えたまま緑になる。 */
      if (rows[i].name !== m.name) {
        bad.push('行 ' + i + ': 名簿と描画の並びが違う ("' + rows[i].name + '" vs "' + m.name + '")');
        continue;
      }
      if (typeof rt[m.classKey] !== 'number') { bad.push(m.classKey + ': 経路Bにその職が無い'); continue; }
      /* ⭐ 経路A = 画面の文字列から数字を読む。⛔ DFSight.sightLabel と突き合わせない。 */
      const t = parseSightShort(rows[i].meta);
      seen.push(m.classKey + ' 画面=' + t + ' 実行時=' + rt[m.classKey]);
      if (t === null) bad.push(m.classKey + ': .mrMeta から視界が読めない "' + rows[i].meta + '"');
      else if (t !== rt[m.classKey]) bad.push(m.classKey + ': 画面 ' + t + ' ≠ 実行時 ' + rt[m.classKey]);
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : rows.length + ' 行: ' + seen.join('  ')];
  }],

  // ── §3 既存の器を壊していない (非退行) ───────────────────────────────────
  ['3a', '★.pmName / .pmClass / .pmEquipRow / .pmSkillsVal のテキストが着手前と 1 文字も違わない', (M) => {
    if (M.baseErr) return [false, '⛔ 基準 (' + M.baseRef + ') が配れない: ' + M.baseErr];
    const A = M.nrCur || {}, B = M.nrBase || {};
    if (!A.reached) return [false, '⛔ 現行アームが演出へ到達できなかった: ' + (A.errs || []).join(' | ')];
    if (!B.reached) return [false, '⛔ 基準アームが演出へ到達できなかった: ' + (B.errs || []).join(' | ')];
    const a = A.cards || [], b = B.cards || [];
    /* ⭐ 母集団ガード: カードが 0 枚 / 枚数違い / 空文字だと「差が無い」が自明に成立する。 */
    if (a.length < 2) return [false, '⛔ 現行のカードが ' + a.length + ' 枚 — 母集団が無い'];
    if (a.length !== b.length) return [false, '⛔ 枚数が違う 現行 ' + a.length + ' / 基準 ' + b.length];
    const bad = [];
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (x.classKey !== y.classKey) { bad.push('#' + i + ': 職が違う ' + x.classKey + ' / ' + y.classKey); continue; }
      if (!x.name || !x.cls || !x.skills || (x.equip || []).length === 0) {
        bad.push('#' + i + ' (' + x.classKey + '): ⛔ 器が空 name="' + x.name + '" cls="' + x.cls
          + '" skills="' + x.skills + '" equip=' + (x.equip || []).length + ' 行 — 差が無いのは当たり前');
        continue;
      }
      if (x.name !== y.name)   bad.push('#' + i + ' .pmName "' + x.name + '" ≠ "' + y.name + '"');
      if (x.cls !== y.cls)     bad.push('#' + i + ' .pmClass "' + x.cls + '" ≠ "' + y.cls + '"');
      if (!deepEq(x.equip, y.equip)) bad.push('#' + i + ' .pmEquipRow ' + JSON.stringify(x.equip)
        + ' ≠ ' + JSON.stringify(y.equip));
      if (x.skills !== y.skills) bad.push('#' + i + ' .pmSkillsVal "' + x.skills + '" ≠ "' + y.skills + '"');
    }
    /* ⭐ 基準が「本当に着手前」であることの現場確認: 基準側に .pmSight は 1 枚も無いはず。 */
    const bSight = b.filter(x => x.hasSight).length;
    if (bSight !== 0) bad.push('⛔ 基準 (' + M.baseRef + ') のカードに .pmSight が ' + bSight
      + ' 枚ある = 基準が着手前ではない');
    return [bad.length === 0, bad.length ? '⛔ ' + bad.slice(0, 6).join(' / ')
      : '基準 ' + M.baseRef + ' と現行を同時配信して突き合わせ: ' + a.length + ' 枚 × 4 器 ('
        + a.map(x => x.classKey).join(',') + ') が 1 文字も違わない'
        + '  (現行の .pmSight ' + a.filter(x => x.hasSight).length + ' 枚 / 基準 0 枚)'];
  }],
  ['3b', '.mrMeta から視界の部分を除いた文字列が着手前と一致 (「戦士 / Lv3 / 同行 5 回」)', (M) => {
    if (M.baseErr) return [false, '⛔ 基準 (' + M.baseRef + ') が配れない: ' + M.baseErr];
    const a = (M.nrCur || {}).roster || [], b = (M.nrBase || {}).roster || [];
    if (!a.length) return [false, '⛔ 現行の名簿が 0 行 — 母集団が無い'];
    if (a.length !== b.length) return [false, '⛔ 行数が違う 現行 ' + a.length + ' / 基準 ' + b.length];
    const bad = [], seen = [];
    /* ⭐ 母集団ガード: 現行に視界の節が 1 つも無いなら stripSight は素通しで、
       この assert は「同じものどうし」を比べているだけになる。 */
    const withSight = a.filter(x => stripSight(x.meta) !== x.meta).length;
    if (withSight !== a.length) bad.push('⛔ 現行で視界の節を持つ行が ' + withSight + '/' + a.length
      + ' 行しかない — 落とす対象が無ければ (3b) は何も測っていない');
    for (let i = 0; i < a.length; i++) {
      const cur = stripSight(a[i].meta), base = stripSight(b[i].meta);
      seen.push('"' + cur + '"');
      if (a[i].name !== b[i].name) bad.push('行 ' + i + ': 名前が違う "' + a[i].name + '" / "' + b[i].name + '"');
      if (!base) bad.push('行 ' + i + ': 基準の .mrMeta が空 = 比較が空振り');
      else if (cur !== base) bad.push('行 ' + i + ': "' + cur + '" ≠ 基準 "' + base + '"');
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.slice(0, 5).join(' / ')
      : a.length + ' 行とも視界の節を落とすと基準 ' + M.baseRef + ' と一致: ' + seen.join(' ')
        + '  (現行の原文例 "' + a[0].meta + '")'];
  }],
  ['3c', '★カードが 1 行増えても #pmDepart が viewport の中に残る (desktop 4 列 / compact 2 列・引き出しを開いたまま)', (M) => {
    const A = M.nrCur || {}, C = M.nrCompact || {};
    if (!A.reached) return [false, '⛔ desktop アームが演出へ到達できなかった: ' + (A.errs || []).join(' | ')];
    if (!C.reached) return [false, '⛔ compact アームが演出へ到達できなかった: ' + (C.errs || []).join(' | ')];
    const bad = [], seen = [];
    const judge = (lbl, g, wantCols) => {
      if (!g) { bad.push(lbl + ': 測れていない'); return; }
      if (!g.drawerVis || g.nOpen !== 1) bad.push(lbl + ': 引き出しが開いていない (vis=' + g.drawerVis
        + ' 開いたカード ' + g.nOpen + ' 枚) — 開いていない状態で測ると (3c) は自明に緑');
      if (g.cols !== wantCols) bad.push(lbl + ': #pmColumns が ' + g.cols + ' 列 (期待 ' + wantCols + ' 列)');
      if (!g.rect) { bad.push(lbl + ': #pmDepart の矩形が採れない (hidden=' + g.depHidden + ')'); return; }
      const inView = g.rect.top >= 0 && g.rect.bottom <= g.vh && g.rect.left >= 0 && g.rect.right <= g.vw;
      if (!inView) bad.push(lbl + ': 画面外 rect=' + JSON.stringify(g.rect) + ' viewport ' + g.vw + 'x' + g.vh);
      if (g.hitId !== 'pmDepart') bad.push(lbl + ': 覆われている (命中先=' + g.hitId + ')');
      seen.push(lbl + ' ' + g.vw + 'x' + g.vh + ' ' + g.cols + '列 top=' + g.rect.top
        + ' bottom=' + g.rect.bottom + '/' + g.vh + ' 命中=' + g.hitId);
    };
    judge('desktop', A.geo, VP_DESKTOP.cols);
    judge('compact', C.geo, VP_COMPACT.cols);
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ') : seen.join('   ')];
  }],
  ['3d', 'dfSheetSecTraits の既存 3 行 (data-stat = zone / role / note) が順序ごと不変', (M) => {
    const sh = M.idx.sheet || {};
    if (!sh.ok) return [false, '⛔ シートが測れない'];
    const WANT = ['zone', 'role', 'note'];
    const bad = [], seen = [];
    for (const k of CLASS_KEYS) {
      const so = (sh.byClass[k] || {}).statOrder || [];
      if (so.length < 3) { bad.push(k + ': data-stat の行が ' + so.length + ' 本しか無い'); continue; }
      if (!deepEq(so.slice(0, 3), WANT)) bad.push(k + ': 先頭 3 行が ' + JSON.stringify(so.slice(0, 3)));
      /* ⭐ 足した行が既存 3 行より前に割り込んでいないこと = 上の slice で担保される。
         ⚠ 「sight が有る」は (1a) の担当。ここは **既存 3 行の順序だけ**を見る。 */
      seen.push(k + '=' + so.join('>'));
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ') : seen.join('  ')];
  }],
  ['3e', '5 ページ (index / tavern / title / town / world) で pageerror 0 件', (M) => {
    const P = M.pages5 || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 ページでない (' + P.length + ')'];
    const bad = P.filter(p => (p.errs || []).length || p.status !== 200);
    const n = P.reduce((a, p) => a + (p.errs || []).length, 0);
    return [bad.length === 0,
      P.map(p => p.label + ':' + p.status + '/' + (p.errs || []).length + '件').join(' ')
      + '  合計 pageerror ' + n + ' 件'
      + (bad.length ? '  ⛔ ' + bad.map(p => p.label + ' → ' + ((p.errs || [])[0] || ('status ' + p.status))).join(' / ') : '')];
  }],
  ['3f', 'シートの開閉で localStorage のキーが 0 本増えない (5 ページとも)', (M) => {
    const P = M.pages5 || [];
    if (P.length !== 5) return [false, '⛔ 母集団が 5 ページでない (' + P.length + ')'];
    const bad = [];
    for (const p of P) {
      /* ⭐ 母集団ガード: 種が入っていない / シートが開いていないと差分が空振りする。 */
      if (!p.has) { bad.push(p.label + ' ⛔ DFSheet が載っていない'); continue; }
      if (p.opened !== true) { bad.push(p.label + ' ⛔ シートが開かなかった (' + p.opened + ')'); continue; }
      if (!(p.lsBefore || []).length) { bad.push(p.label + ' ⛔ 種が 0 本 = 差分が空振り'); continue; }
      const addOpen  = (p.lsOpen  || []).filter(k => (p.lsBefore || []).indexOf(k) < 0);
      const addClose = (p.lsAfter || []).filter(k => (p.lsBefore || []).indexOf(k) < 0);
      if (addOpen.length)  bad.push(p.label + ' ⛔ 開いた時点で +' + addOpen.join(','));
      if (addClose.length) bad.push(p.label + ' ⛔ 閉じた後に +' + addClose.join(','));
    }
    return [bad.length === 0,
      P.map(p => p.label + ':' + (p.lsBefore || []).length + '→' + (p.lsOpen || []).length
        + '→' + (p.lsAfter || []).length + '本').join(' ')
      + (bad.length ? '  ⛔ ' + bad.join(' / ') : '  (開閉とも +0 本)')];
  }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

/* まだ実装していない受入条件。⛔ 黙って緑にしない (理由つきの PENDING で出す)。 */
const PENDING_ASSERTS = [
  ['4a', 'title.html?darkvision=0 → .classSight が 0 個、classDetail の他 3 行は健在', '項目 4 (撤退) の担当'],
  ['4b', 'tavern.html?darkvision=0 → .pmSight が 0 個、.mrMeta に視界が出ない', '項目 4 (撤退) の担当'],
  ['4c', 'index.html?darkvision=0 → シートの [data-stat="sight"] が 0 個', '項目 4 (撤退) の担当'],
  ['4d', '★?darkvision=0 でも getSight() の値は 1 つも変わらない (表示の撤退であって挙動の撤退ではない)', '項目 4 (撤退) の担当'],
];

const SECTIONS = [
  ['§0 装置 — 母集団を先に確かめる', ['0a', '0b', '0c', '0d', '0e', '0f', '0g']],
  ['§1 数字が一致する (本丸)', ['1a', '1b', '1c', '1d', '1e', '1f']],
  ['§2 表示が実在する (空文字で緑にしない)', ['2a', '2b']],
  ['§3 既存の器を壊していない (非退行 — 基準は着手前 hash の同時配信)', ['3a', '3b', '3c', '3d', '3e', '3f']],
];
function emit(id, M) {
  const a = ASSERT_OF[id];
  if (!a) { check('(' + id + ') ⛔ 未定義の assert', false); return; }
  let r;
  try { r = a[2](M); } catch (e) { r = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_darkvision — 暗視を編成の判断材料にする (依頼書 #39 §8) '
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] ROOT=' + ROOT + '  PORT=' + PORT);

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_dark_');
  const servers = [await startServer(PORT, MUTATE)];
  if (NEGATIVE) for (const k of MUT_IMPL) servers.push(await startServer(PORT_OF[k], k));
  /* ★§3 の基準を **同じ実行の中で同時に**配る。⛔ HEAD ではない (#34 の教訓)。 */
  if (!BASE_ERR) servers.push(await startServer(BASE_PORT, null, true));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  async function measureAll(port, mutKey) {
    const base = 'http://localhost:' + port;
    const m = {};
    m.idx    = await probeIndex(browser, base, '');
    m.title  = await probeTitle(browser, base, '');
    m.tavern = await probeTavern(browser, base, '');
    m.tables = {};
    for (const f of [SIGHT_JS].concat(NUM_FILES)) m.tables[f] = countTables(servedSrc(mutKey, f));
    return m;
  }

  try {
    mark('測定 — index (経路A/B) / title (名乗り) / tavern (演出・名簿)');
    const M = await measureAll(PORT, MUTATE);
    M.baseRef = BASE_REF; M.baseErr = BASE_ERR;

    mark('測定 — §3 非退行 (基準 = 着手前 ' + BASE_REF + ' を :' + BASE_PORT + ' で同時配信)');
    /* ⭐ 顔ぶれは __pmTest.play で固定する (乱数を潰す)。両アームへ同じ並びを与える。
       ⚠ 現行アームは基準が配れなくても必ず測る —— (3c) は基準を 1 バイトも使わない。
         ここを BASE_ERR で括ると、基準の取得に失敗しただけで (3c) まで巻き添えで赤くなる
         (2026-08-31 実測: --baseline HEAD で 3 本赤くなり、うち 1 本は無関係だった)。 */
    M.nrCur = await probeTavernNR(browser, 'http://localhost:' + PORT, '現行', VP_DESKTOP);
    console.log('[drv]   現行 カード ' + ((M.nrCur.cards || []).length) + ' 枚 / 名簿 '
      + ((M.nrCur.roster || []).length) + ' 行 / 到達=' + M.nrCur.reached);
    if (BASE_ERR) {
      console.log('[drv]   ⛔ 基準が配れない: ' + BASE_ERR);
    } else {
      M.nrBase = await probeTavernNR(browser, 'http://localhost:' + BASE_PORT, '基準', VP_DESKTOP);
      console.log('[drv]   基準 カード ' + ((M.nrBase.cards || []).length) + ' 枚 / 名簿 '
        + ((M.nrBase.roster || []).length) + ' 行 / 到達=' + M.nrBase.reached);
      if ((M.nrCur.roster || [])[0]) console.log('[drv]   .mrMeta 現行="' + M.nrCur.roster[0].meta
        + '"  基準="' + ((M.nrBase.roster || [])[0] || {}).meta + '"');
    }

    /* ⚠⚠⚠ compact は **最初から 390x844 で開く**。開いてから縮めると演出ごと畳まれる
       (2026-08-31 実測 = 引き出し vis=false / 命中先が #tavernViewport)。 */
    mark('測定 — (3c) compact 390x844 (最初からこの幅で演出を開く)');
    M.nrCompact = await probeTavernNR(browser, 'http://localhost:' + PORT, '現行compact',
      VP_COMPACT, { skipRoster: true });
    console.log('[drv]   到達=' + M.nrCompact.reached + ' geo='
      + JSON.stringify((M.nrCompact.geo || {}).rect));

    mark('測定 — 本番 5 ページ (pageerror / localStorage の増減)');
    M.pages5 = await probePages5(browser, 'http://localhost:' + PORT);
    console.log('[drv]   ' + M.pages5.map(p => p.label + ':' + p.status
      + '/err' + (p.errs || []).length).join(' '));

    const rt = (M.idx.runtime || {}).tiles || {};
    const by = (M.idx.sheet || {}).byClass || {};
    console.log('[drv]   経路B (実行時 getSight().tiles): ' + CLASS_KEYS.map(k => k + '=' + rt[k]).join(' '));
    console.log('[drv]   経路A (シートの視界行): ' + CLASS_KEYS.map(k => k + '="' + (by[k] || {}).value + '"').join(' '));
    console.log('[drv]   数値の表 (BASE行/LEGACY行): '
      + Object.keys(M.tables).map(f => f + '=' + M.tables[f].base + '/' + M.tables[f].legacy).join('  '));
    for (const [lbl, p] of [['index', M.idx], ['title', M.title], ['tavern', M.tavern]]) {
      if ((p.errs || []).length) console.log('[drv]   ⚠ ' + lbl + ' の pageerror ' + p.errs.length
        + ' 件: ' + p.errs.slice(0, 3).join(' | '));
    }

    for (const sec of SECTIONS) { mark(sec[0]); for (const id of sec[1]) emit(id, M); }

    mark('まだ実装していない受入条件 (⛔ 測れないものを黙って緑にしない)');
    for (const p of PENDING_ASSERTS) pending('(' + p[0] + ') ' + p[1], p[2]);

    if (NEGATIVE) {
      if (MUT_TODO.length) {
        mark('負のコントロール — まだ実装されていない変異 (完了条件 = ここが 0 件)');
        for (const k of MUT_TODO) {
          const mu = MUTATIONS[k];
          pending('(neg-' + k + ') 変異 ' + k
            + (mu.targets.length ? ' → ' + mu.targets.map(t => '(' + t + ')').join('') + ' が赤くなる' : '')
            + '  [' + mu.file + ']', mu.why);
        }
      } else {
        mark('変異の実装漏れ');
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
    console.log('  **PENDING**:');
    for (const b of pend) console.log('    - ' + b.name);
  }
  console.log('──────────────────────────────────────────────');
  process.exit(failed.length ? 1 : 0);
})();
