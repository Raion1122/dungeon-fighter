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
 * ⚠ 実装状況 (2026-08-31 / dev-loop 項目 1)
 *   実装済 … §0 装置 (0a)〜(0g) / §1 (1a)(1e)(1f)
 *   PENDING … (1b)(1d)(2a)(2b) = 項目 2 / (1c)(3a)〜(3f) = 項目 3 /
 *             §4 撤退 (4a)〜(4d) と負のコントロール 12 本 = 項目 4
 *   ⛔ 測れないものを黙って緑にしない。未実装は理由つきの PENDING で出す。
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
function startServer(port, mutKey) {
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
      }), nSight: document.querySelectorAll('#classCards .classSight').length };
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
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
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
        cards: cols.map((c) => ({
          state: c.dataset.state || '',
          name: txt(c.querySelector('.pmName')),
          cls: txt(c.querySelector('.pmClass')),
          zone: txt(c.querySelector('.pmZone')),
          hasSight: !!c.querySelector('.pmSight'),
          sight: txt(c.querySelector('.pmSight')),
        })),
      };
    }));
  } catch (e) { o.errs.push('cinema: ' + ((e && e.message) || e)); }

  await page.close();
  return o;
}

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
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

/* まだ実装していない受入条件。⛔ 黙って緑にしない (理由つきの PENDING で出す)。 */
const PENDING_ASSERTS = [
  ['1b', '★マッチングカードの .pmSight の数字 = 経路Bのその職の tiles (出ているカード全部)', '項目 2 (STEP2) の担当 — .pmSight がまだ実装されていない'],
  ['1d', '★名乗りカード .classSight の数字 = 経路Bの tiles (6 枚すべて)', '項目 2 (STEP2) の担当 — .classSight がまだ実装されていない'],
  ['2a', '4 箇所とも textContent が空文字でない・display !== "none"', '項目 2 (STEP2) の担当 — 4 箇所のうち 3 箇所が未実装'],
  ['2b', '名乗りカードはタップ前は非表示 / タップ後に表示 (既存の開閉規則を壊していない)', '項目 2 (STEP2) の担当'],
  ['1c', '★名簿の .mrMeta の視界 = 経路Bのその職の tiles (名簿の全行)', '項目 3 (STEP3) の担当 — mrMeta の視界がまだ実装されていない'],
  ['3a', '.pmName / .pmClass / .pmEquipRow / .pmSkillsVal のテキストが着手前と 1 文字も違わない', '項目 3 の担当 — 着手前 hash を worktree へ取り出して別 URL で同時配信する装置が要る'],
  ['3b', '.mrMeta から視界の部分を除いた文字列が着手前と一致', '項目 3 の担当'],
  ['3c', '★カードが 1 行増えても #pmDepart が viewport の中に残る (desktop / compact 両方)', '項目 3 の担当 — 引き出しを開いた状態でも測る'],
  ['3d', 'dfSheetSecTraits の既存 3 行 (zone / role / note) が順序ごと不変', '項目 3 の担当 (statOrder は本ドライバが既に採取している)'],
  ['3e', '5 ページ (index / tavern / title / town / world) で pageerror 0 件', '項目 3 の担当 — town / world をまだ開いていない'],
  ['3f', 'シートの開閉で localStorage のキーが 0 本増えない', '項目 3 の担当'],
  ['4a', 'title.html?darkvision=0 → .classSight が 0 個、classDetail の他 3 行は健在', '項目 4 (撤退) の担当'],
  ['4b', 'tavern.html?darkvision=0 → .pmSight が 0 個、.mrMeta に視界が出ない', '項目 4 (撤退) の担当'],
  ['4c', 'index.html?darkvision=0 → シートの [data-stat="sight"] が 0 個', '項目 4 (撤退) の担当'],
  ['4d', '★?darkvision=0 でも getSight() の値は 1 つも変わらない (表示の撤退であって挙動の撤退ではない)', '項目 4 (撤退) の担当'],
];

const SECTIONS = [
  ['§0 装置 — 母集団を先に確かめる', ['0a', '0b', '0c', '0d', '0e', '0f', '0g']],
  ['§1 数字が一致する (本丸)', ['1a', '1e', '1f']],
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
