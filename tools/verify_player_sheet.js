#!/usr/bin/env node
/*
 * tools/verify_player_sheet.js — プレイヤーシート v1 + 言語 (実装依頼書 #29 §9)
 * ════════════════════════════════════════════════════════════════════════════
 * 何を担保するか (依頼書 §9 の §0〜§5 を 1 つ残らず宣言する)
 *   §0 装置   母集団 (5 ページ) / DFSheet の搭載 / **開いたことの確認** / 言語マスタの件数
 *   §1 呼出口 3 経路 (partyPanel の子 / townHud の子 / body へ fixed) と、覆われていないこと
 *   §2 中身   6 能力 (CHA 込み) / 修正値が DFAbilities 由来 / 取れない区画は行ごと消える / 技能 12
 *   §3 言語   選択チップ / 未充足で出発不可 / 保存は選択分だけ / 表示は固定+選択 / 職替えでリセット
 *   §4 恒等   既存 HUD が 1px も動かない / XP_THRESHOLDS の写しが index.html と一致 /
 *             pageerror 0 / 増えた localStorage キーは 1 本だけ
 *   §5 撤退   ?sheet=0 で何も注入されない / 言語キー無しでも固定分だけ出て落ちない
 *
 * ⭐⭐⭐ 本ファイルは **dev-loop 項目 1 の成果物**である。
 *   項目 1 の時点では 5 ページに `<script src="js/player-sheet.js">` が **まだ 1 行も無い**
 *   (HTML を触るのは項目 2 の担当)。よって実ページが要る受入条件は **1 つも測れない**。
 *   ⛔ 測れないものを「緑」にしない。**pending() で理由つきに PENDING 出力**する。
 *   → 出力は PASSED / FAILED / **PENDING** の 3 値。項目 2〜4 の worker は
 *     「どれを埋めるか」「黙って緑にしていないか」を末尾の合計行だけで確認できる。
 *   ⭐ 完了条件 (項目 4) = **PENDING 0** かつ **FAILED 0** かつ **変異 7 本すべて実装**。
 *
 * ⭐ この時点で測れるもの (= 実ページを開かずに済むもの) は全部埋めてある:
 *   共有モジュール単体の契約を、`__sheet_probe.html` という **最小スタブページ**を配信して測る。
 *   (abilities.js + player-sheet.js だけを載せた HTML。本番 HTML は 1 バイトも触らない)
 *
 * ⛔ 測らないこと (依頼書 §9「測らないこと」)
 *   - 見た目の寸法・色・フォント (実機の目視で決める)
 *   - assets/sheet_frame.png の有無 (絵の到着待ちで赤にしない。§7)
 *   - 言語の効き目 (判定・イベント分岐)。v1 では存在しない
 *
 * 使い方:
 *     node tools/verify_player_sheet.js                    # 素
 *     node tools/verify_player_sheet.js --negative         # 負のコントロール (空振り 1 本で exit 1)
 *     node tools/verify_player_sheet.js --mutate nocha     # 単一変異で走らせる
 *     node tools/verify_player_sheet.js --port 9470 --headful
 *
 * ⚠ ポート: 既定 9470。`grep -rnoE "'9[0-9]{3}'" tools/` で 2026-08-28 に実測し、
 *   9470〜9479 が**丸ごと空き**であることを確認して選んだ。
 *   ⛔ 依頼を受けた既定値 8935 は採らなかった: 変異 7 本ぶんの 8936〜8942 が
 *   driver_choice_logslot (8940) / driver_mapeditor_waterkit (8941) と、
 *   さらに verify_ability_scores の変異ポート帯 (8931〜8936) と重なる。
 */
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..');
const argv  = process.argv.slice(2);
const arg   = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag  = (n) => argv.includes('--' + n);
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE   = arg('mutate', null);
const PORT     = parseInt(arg('port', '9470'), 10);

const SHEET_JS     = 'js/player-sheet.js';
const ABILITIES_JS = 'js/abilities.js';
const HERO_JS      = 'js/hero-classes.js';
const SKILL_JS     = 'js/skill-check.js';
const INDEX_HTML   = 'index.html';
const TITLE_HTML   = 'title.html';
const PAGES = ['index.html', 'tavern.html', 'town.html', 'world.html', 'title.html'];

/* ── スタブページ ────────────────────────────────────────────────────────
 *  ⭐ ゲーム本体を開かないのは軽さのためではなく、**データ層と結線を別々に測る**ため。
 *    結線 (5 ページへの <script src>) は §0(0b) / §1 の担当で、そちらは項目 2 が入るまで測れない。
 *  ⚠ 本番 HTML を 1 バイトも触らずにモジュールを評価するための器なので、
 *    ここに本番の CSS も HUD も入れないこと (入れると「本番で動く」の証拠に化けてしまう)。 */
const STUB_REL  = '__sheet_probe.html';
const STUB_HTML = '<!doctype html><meta charset="utf-8"><title>sheet probe</title>\n'
  + '<script src="' + ABILITIES_JS + '"></script>\n'
  + '<script src="' + SHEET_JS + '"></script>\n';

/* HERO_CLASSES を載せた版。⭐ シートが自前で持つ CLASS_LABELS が
 *   js/hero-classes.js の表示名とズレていないかを **2 経路**で照合するためだけに使う。 */
const STUB_HC_REL  = '__sheet_probe_hc.html';
const STUB_HC_HTML = '<!doctype html><meta charset="utf-8"><title>sheet probe (hero-classes)</title>\n'
  + '<script src="' + ABILITIES_JS + '"></script>\n'
  + '<script src="' + HERO_JS + '"></script>\n'
  + '<script src="' + SHEET_JS + '"></script>\n';

// ══════════════════════════════════════════════════════════════════════════════
// 変異表 (負のコントロール) — 依頼書 §9 の表そのもの
//   ⭐ 項目 1 では **7 本すべて impl:false = 宣言のみ**。実装は項目 4 の担当。
//   ⚠ 実装するとき: file/from/to は「配信スナップショットへの 1 行置換」。
//     ちょうど 1 箇所ヒットが起動時の条件で、2 箇所ヒットなら exit 3 で即死する。
//   ⚠ 変異アンカーは **部分文字列で照合**する。同じ処理をインデント違いで 2 箇所へ置くと
//     必ず 2 ヒットして exit 3 になる (2026-08-25 に BGM で実測済み)。
//   ⚠ verify_ability_scores.js も `nocha` という名前の変異を持つが、
//     あちらの対象は js/abilities.js、こちらは js/player-sheet.js。**対象ファイルが
//     違うので衝突しない**。本ドライバが触る対象は js/player-sheet.js と
//     title.html に閉じること。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  wipeorder: {
    impl: false, file: TITLE_HTML, targets: ['3c'],
    why: '⭐⭐⭐ 依頼書 §2-2 罠 B の再現。languages の保存を DFSlots.newGame() の **前** へ移す。'
       + ' newGame() は dragonfighters.* を prefix 総なめで消すので、書いた直後に消える'
       + ' (しかもエラーは 1 つも出ない = 振る舞いのテストでしか捕まらない)。',
  },
  fixedsave: {
    impl: false, file: TITLE_HTML, targets: ['3c'],
    why: '固定分 (CLASS_LANGUAGES.fixed) も dragonfighters.languages へ保存する。'
       + ' ⛔ 依頼書 §2-5 の禁止事項。混ぜると職の固定言語を直したとき既存セーブだけ古くなる。',
  },
  nocha: {
    impl: false, file: SHEET_JS, targets: ['2a'],
    why: 'シートの能力値行から CHA を落とす。#28 で CHA 込みへ一本化した意味が死ぬ。',
  },
  ownmod: {
    impl: false, file: SHEET_JS, targets: ['2b'],
    why: '⭐ シートが修正値を Math.floor((s-10)/2) で自前計算する。'
       + ' 見た目は同じ数字になるので (2a) は緑のまま — 赤くなるのは ?ability5e=0 を'
       + ' 当てた (2b) だけ。「撤退スイッチが効かなくなる」を機械証明する。',
  },
  blankrow: {
    impl: false, file: SHEET_JS, targets: ['2c'],
    why: '⭐⭐ 取れない区画を「行ごと消す」でなく空文字で描く。'
       + ' 画面はどちらも同じに見えるので、__state() の avail と inDom を'
       + ' **別々に**返していないと原理的に検出できない (依頼書 §2-4)。',
  },
  fixedbtn: {
    impl: false, file: SHEET_JS, targets: ['1b'],
    why: '⭐ 依頼書 §2-1 の再現。#partyPanel / #townHud を無視して常に position:fixed で'
       + ' 注入する。index.html は上下左右すべて既存 HUD が占有しているので必ず衝突する。',
  },
  closedread: {
    impl: false, file: null, driverSide: true, targets: ['0c'],
    why: '⭐⭐⭐ 装置側の変異: シートを **開かずに** 中身を採る。'
       + ' (0c) が無いと「閉じたままの空 DOM を測って全部緑」になることを機械証明する。'
       + ' ⚠ ファイル置換ではなく、測定関数が open() を呼ばない経路を通す形で実装する。',
  },
};
const MUT_ORDER = ['wipeorder', 'fixedsave', 'nocha', 'ownmod', 'blankrow', 'fixedbtn', 'closedread'];
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
for (const rel of [SHEET_JS, ABILITIES_JS, HERO_JS, SKILL_JS].concat(PAGES)) frozen(rel);

const MUT_SRC = {};
for (const k of MUT_IMPL) {
  const m = MUTATIONS[k];
  if (m.driverSide) continue;                     // 装置側の変異はファイル置換を持たない
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
// ソースからの抽出 (ブラウザを通さない 2 経路目)
// ══════════════════════════════════════════════════════════════════════════════
/** `XP_THRESHOLDS = [0, 1000, ...]` を数値配列で採る。無ければ null。 */
function parseXpThresholds(src) {
  if (!src) return null;
  const m = src.match(/XP_THRESHOLDS\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  const nums = m[1].split(',').map(s => s.trim()).filter(s => s.length).map(s => parseInt(s, 10));
  return nums.some(n => !isFinite(n)) ? null : nums;
}
/** 素朴なコメント除去。⭐ 「自前で式を書いていない」を**コメントを勘定に入れずに**見るため。 */
function stripComments(src) {
  if (!src) return '';
  let out = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  out = out.split('\n').map(line => {
    const t = line.replace(/^\s+/, '');
    if (t.startsWith('//') || t.startsWith('*')) return '';
    return line;
  }).join('\n');
  return out;
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
        if (rel === STUB_REL || rel === STUB_HC_REL) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(rel === STUB_REL ? STUB_HTML : STUB_HC_HTML); return;
        }
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
// 測定 — スタブページで共有モジュール単体の契約を採る
// ══════════════════════════════════════════════════════════════════════════════
async function openPage(browser, url, seed) {
  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(String((e && e.message) || e)));
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  /* ⚠ localStorage は origin が決まってからでないと触れない。
     evaluateOnNewDocument は「ページのスクリプトより前・origin 確定後」に走るので、
     モジュールが読む前に種を仕込める (goto 後に setItem しても手遅れ)。 */
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s) for (const k in s) if (s[k] !== null && s[k] !== undefined) localStorage.setItem(k, s[k]);
    } catch (e) { /* private mode 等 */ }
  }, seed || null);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await sleep(120);
  return { page, errs };
}

/** モジュール単体の契約を 1 ページで全部採る。 */
async function probeModule(browser, base, query) {
  const o = { errs: [], has: false };
  const r = await openPage(browser, base + '/' + STUB_REL + (query || ''), null);
  o.errs = r.errs;
  const d = await r.page.evaluate(() => {
    const out = { has: false };
    const S = window.DFSheet;
    out.has = !!S;
    out.hasBtn = !!document.getElementById('dfSheetBtn');
    out.hasOverlay = !!document.getElementById('dfSheetOverlay');
    if (!S) return out;
    out.api = ['LANGUAGES', 'CLASS_LANGUAGES', 'open', 'close', 'isOpen', 'render',
      'languagesOf', '__state'].filter(k => S[k] === undefined);
    out.languages   = JSON.parse(JSON.stringify(S.LANGUAGES || []));
    out.classLang   = JSON.parse(JSON.stringify(S.CLASS_LANGUAGES || {}));
    out.classLabels = JSON.parse(JSON.stringify(S.CLASS_LABELS || {}));
    out.sectionIds  = (S.SECTION_IDS || []).slice();
    out.xp          = (S.XP_THRESHOLDS || []).slice();
    out.langKey     = S.LANG_KEY;

    const setLang = (v) => {
      try { if (v === null) localStorage.removeItem(S.LANG_KEY); else localStorage.setItem(S.LANG_KEY, v); }
      catch (e) { /* noop */ }
    };
    const call = (k) => { try { return S.languagesOf(k); } catch (e) { return 'THROW: ' + e.message; } };
    const forAll = () => {
      const m = {};
      for (const k of Object.keys(out.classLang)) m[k] = call(k);
      return m;
    };

    // (契約 1) キー無し → 固定分だけ
    setLang(null);                        out.cNoKey = forAll();
    // (契約 2) 壊れた JSON → 固定分だけ・例外なし
    setLang('{ not json at all');         out.cBroken = forAll();
    // (契約 3) 配列でない JSON → 固定分だけ
    setLang('"just a string"');           out.cNotArray = forAll();
    // (契約 4) 未知の言語 id → 捨てる
    setLang(JSON.stringify(['klingon'])); out.cUnknownId = call('warrior');
    // (契約 5) 選択分がマージされる
    setLang(JSON.stringify(['dwarvish', 'goblin'])); out.cMerge = call('warrior');
    // (契約 6) 固定分と重複する選択を入れても重複しない
    setLang(JSON.stringify(['common', 'dwarvish', 'dwarvish'])); out.cDup = call('dwarf');
    // (契約 7) 未知 classKey / null / undefined → warrior へ落ちる・例外なし
    setLang(null);
    out.cUnknownClass = { paladin: call('paladin'), nul: call(null), undef: call(undefined) };
    out.cWarrior = call('warrior');

    // (契約 8) ⛔ languagesOf / open / render が localStorage へ 1 バイトも書かない
    try { localStorage.clear(); } catch (e) {}
    const before = [];
    try { for (let i = 0; i < localStorage.length; i++) before.push(localStorage.key(i)); } catch (e) {}
    S.languagesOf('dwarf'); S.open(); S.render(); S.close();
    const after = [];
    try { for (let i = 0; i < localStorage.length; i++) after.push(localStorage.key(i)); } catch (e) {}
    out.writeBefore = before.slice().sort();
    out.writeAfter  = after.slice().sort();
    out.langKeyAfterOpen = (function () { try { return localStorage.getItem(S.LANG_KEY); } catch (e) { return null; } })();

    // (契約 9) 開閉が効く + __state() の形
    out.openBefore = S.isOpen();
    out.openRet    = S.open();
    out.openAfter  = S.isOpen();
    out.state      = JSON.parse(JSON.stringify(S.__state()));
    S.close();
    out.closedAfter = S.isOpen();
    return out;
  });
  await r.page.close();
  return Object.assign(o, d);
}

/** HERO_CLASSES 同載スタブ — 職業表示名の 2 経路照合だけに使う。 */
async function probeLabels(browser, base) {
  const o = { ok: false, mismatch: [], n: 0, errs: [] };
  const r = await openPage(browser, base + '/' + STUB_HC_REL, null);
  o.errs = r.errs;
  const d = await r.page.evaluate(() => {
    const S = window.DFSheet, HC = window.HERO_CLASSES;
    if (!S || !HC) return { ok: false, why: 'DFSheet=' + !!S + ' HERO_CLASSES=' + !!HC };
    const bad = [];
    for (const c of HC) {
      const own = (S.CLASS_LABELS || {})[c.classKey];
      if (own !== c.name) bad.push(c.classKey + ' 自前"' + own + '" vs HERO_CLASSES"' + c.name + '"');
    }
    return { ok: bad.length === 0, mismatch: bad, n: HC.length };
  });
  await r.page.close();
  return Object.assign(o, d);
}

/**
 * (5b) 言語キーが無いセーブ (= title.html?sheet=0 で作ったキャラ) でシートを開く。
 *   ⭐ 固定分だけが出て、例外を投げないこと。
 */
async function probeNoLangKey(browser, base) {
  const o = { errs: [] };
  const r = await openPage(browser, base + '/' + STUB_REL, {
    'dragonfighters.partyComposition': JSON.stringify(['dwarf']),
    'dragonfighters.xp': '3000',
    /* ⭐ dragonfighters.languages は **あえて入れない** = ?sheet=0 で作ったキャラの再現 */
  });
  o.errs = r.errs;
  const d = await r.page.evaluate(() => {
    const S = window.DFSheet;
    if (!S) return { has: false };
    const out = { has: true };
    out.hadKey = (function () { try { return localStorage.getItem(S.LANG_KEY); } catch (e) { return null; } })();
    let threw = null;
    try { S.open(); } catch (e) { threw = e.message; }
    out.threw = threw;
    out.open = S.isOpen();
    out.classKey = S.heroClassKey();
    out.expect = S.languagesOf(out.classKey);
    const sec = document.getElementById('dfSheetSecLanguages');
    out.secPresent = !!sec;
    out.chips = sec ? Array.prototype.slice.call(sec.querySelectorAll('[data-lang]'))
      .map(el => ({ id: el.getAttribute('data-lang'), fixed: el.getAttribute('data-fixed') === '1',
                    text: (el.textContent || '').trim() })) : [];
    out.state = JSON.parse(JSON.stringify(S.__state()));
    S.close();
    return out;
  });
  await r.page.close();
  return Object.assign(o, d);
}

/** 撤退 ?sheet=0 — モジュールが丸ごと居なくなること。 */
async function probeRetreat(browser, base) {
  const o = { errs: [] };
  const r = await openPage(browser, base + '/' + STUB_REL + '?sheet=0', null);
  o.errs = r.errs;
  const d = await r.page.evaluate(() => ({
    hasDFSheet: typeof window.DFSheet !== 'undefined',
    btn: !!document.getElementById('dfSheetBtn'),
    overlay: !!document.getElementById('dfSheetOverlay'),
    style: !!document.getElementById('dfSheetStyle'),
  }));
  await r.page.close();
  return Object.assign(o, d);
}

// ══════════════════════════════════════════════════════════════════════════════
// assert 一覧 (id / 見出し / 述語)。述語は測定結果 M だけを見る純関数。
// ══════════════════════════════════════════════════════════════════════════════
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameSet = (a, b) => deepEq((a || []).slice().sort(), (b || []).slice().sort());

const ASSERTS = [
  // ── §0 装置 (この項目で測れる分) ───────────────────────────────────────
  ['0s1', 'スタブページで window.DFSheet が生えている (公開 API が欠けていない)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ DFSheet が無い — 以降が undefined 比較で空振りし、永久緑になる'];
    return [(m.api || []).length === 0,
      (m.api || []).length ? '⛔ 欠けている API: ' + m.api.join(',')
        : 'open/close/isOpen/render/languagesOf/__state 有り'];
  }],
  ['0s2', 'スタブページで pageerror ゼロ (モジュール単体が例外を投げない)', (M) => {
    const e = (M.mod && M.mod.errs) || [];
    return [e.length === 0, e.length ? '⛔ ' + e.slice(0, 3).join(' | ') : '0 件'];
  }],
  ['0d', '言語マスタが 14 件 / CLASS_LANGUAGES が 6 職 (rogue だけ picks 2)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const L = m.languages || [], C = m.classLang || {};
    const ids = L.map(x => x.id);
    const uniq = new Set(ids).size === ids.length;
    const std = L.filter(x => x.tier === 'standard').length;
    const exo = L.filter(x => x.tier === 'exotic').length;
    const cls = Object.keys(C);
    const picks2 = cls.filter(k => C[k].picks === 2);
    const picks1 = cls.filter(k => C[k].picks === 1);
    const ok = L.length === 14 && uniq && std === 8 && exo === 6
      && cls.length === 6 && picks2.length === 1 && picks2[0] === 'rogue' && picks1.length === 5;
    return [ok, L.length + ' 言語 (標準 ' + std + ' / 異種 ' + exo + ', id 重複 ' + (uniq ? '無' : '⛔有') + ')'
      + '  ' + cls.length + ' 職  picks2=' + (picks2.join(',') || '(無し)')
      + (ok ? '' : '  ⛔ 期待 14 件 (8/6) / 6 職 / picks2 = rogue のみ')];
  }],
  ['0s3', '各職の fixed が LANGUAGES に実在し、全職が common を含む', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const ids = new Set((m.languages || []).map(x => x.id));
    const bad = [], noCommon = [];
    for (const k of Object.keys(m.classLang || {})) {
      const f = m.classLang[k].fixed || [];
      for (const id of f) if (!ids.has(id)) bad.push(k + '.' + id);
      if (f.indexOf('common') < 0) noCommon.push(k);
    }
    return [bad.length === 0 && noCommon.length === 0,
      (bad.length ? '⛔ マスタに無い id: ' + bad.join(',') + '  ' : '')
      + (noCommon.length ? '⛔ common を持たない職: ' + noCommon.join(',')
        : '6 職とも common 有り・id は全部実在')];
  }],
  ['0s4', 'languagesOf: 保存キー無しなら **固定分だけ**が返る (6 職すべて)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const bad = [];
    for (const k of Object.keys(m.classLang)) {
      const got = m.cNoKey[k];
      if (!Array.isArray(got) || !deepEq(got, m.classLang[k].fixed)) {
        bad.push(k + ' ' + JSON.stringify(got) + '≠' + JSON.stringify(m.classLang[k].fixed));
      }
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : '6 職とも fixed と一致 (warrior=' + JSON.stringify(m.cNoKey.warrior) + ')'];
  }],
  ['0s5', 'languagesOf: 壊れた JSON / 配列でない値でも **例外を投げず**固定分だけ', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const bad = [];
    for (const k of Object.keys(m.classLang)) {
      const cases = [['壊れたJSON', m.cBroken], ['配列でない', m.cNotArray]];
      for (let i = 0; i < cases.length; i++) {
        const tag = cases[i][0], got = cases[i][1][k];
        if (typeof got === 'string' && got.indexOf('THROW') === 0) { bad.push(k + '/' + tag + ' ' + got); continue; }
        if (!deepEq(got, m.classLang[k].fixed)) bad.push(k + '/' + tag + ' ' + JSON.stringify(got));
      }
    }
    const unknownOk = deepEq(m.cUnknownId, m.classLang.warrior.fixed);
    return [bad.length === 0 && unknownOk,
      (bad.length ? '⛔ ' + bad.join(' / ') + '  ' : '')
      + '未知の言語 id は捨てる: ' + JSON.stringify(m.cUnknownId) + (unknownOk ? '' : ' ⛔')];
  }],
  ['0s6', 'languagesOf: 未知 classKey / null / undefined は warrior へ落ちる (例外なし)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const w = m.cWarrior;
    const bad = Object.keys(m.cUnknownClass || {}).filter(k => !deepEq(m.cUnknownClass[k], w));
    return [bad.length === 0 && Array.isArray(w),
      bad.length ? '⛔ warrior へ落ちていない: '
        + bad.map(k => k + '=' + JSON.stringify(m.cUnknownClass[k])).join(' / ')
        : 'paladin / null / undefined → ' + JSON.stringify(w)];
  }],
  ['0s7', 'languagesOf: 選択分がマージされ、固定分との重複が出ない', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const wantMerge = m.classLang.warrior.fixed.concat(['dwarvish', 'goblin']);
    const dup = m.cDup;
    const dupOk = Array.isArray(dup) && new Set(dup).size === dup.length
      && sameSet(dup, m.classLang.dwarf.fixed);
    return [deepEq(m.cMerge, wantMerge) && dupOk,
      'merge=' + JSON.stringify(m.cMerge) + ' (期待 ' + JSON.stringify(wantMerge) + ')'
      + '  dedup=' + JSON.stringify(dup) + (dupOk ? '' : ' ⛔ 重複または固定分と不一致')];
  }],
  ['0s8', '⛔ languagesOf / open / render が localStorage へ 1 バイトも書かない (fixed を保存しない)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const added = (m.writeAfter || []).filter(k => (m.writeBefore || []).indexOf(k) < 0);
    return [added.length === 0 && m.langKeyAfterOpen === null,
      added.length ? '⛔ 増えたキー: ' + added.join(',')
        : (m.langKeyAfterOpen === null ? '増減 0 件 / languages キーも未生成'
          : '⛔ languages キーが書かれた: ' + m.langKeyAfterOpen)];
  }],
  ['0s9', '区画 id が 5 件で、__state() が avail と inDom を **別々に** 返す', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const st = m.state || {};
    const secs = st.sections || [];
    const shape = secs.length === 5 && secs.every(s =>
      typeof s.id === 'string' && typeof s.avail === 'boolean' && typeof s.inDom === 'boolean');
    const ids = (m.sectionIds || []);
    const idsOk = ids.length === 5 && sameSet(ids, secs.map(s => s.id));
    const listOk = Array.isArray(st.shown) && Array.isArray(st.hidden)
      && st.shown.length + st.hidden.length === 5;
    return [shape && idsOk && listOk,
      '区画 ' + ids.length + ' 件 ' + JSON.stringify(ids)
      + '  shown=' + JSON.stringify(st.shown) + ' hidden=' + JSON.stringify(st.hidden)
      + (shape && idsOk && listOk ? '' : '  ⛔ __state() の形が契約と違う')];
  }],
  ['0s10', 'スタブページでシートが開いて閉じる (isOpen が false→true→false)', (M) => {
    const m = M.mod;
    if (!m || !m.has) return [false, '⛔ 母集団が無い'];
    const ok = m.openBefore === false && m.openRet === true && m.openAfter === true && m.closedAfter === false;
    return [ok, 'before=' + m.openBefore + ' open()=' + m.openRet + ' after=' + m.openAfter
      + ' closed=' + m.closedAfter + (ok ? '' : '  ⛔ 期待 false/true/true/false')];
  }],
  ['0s11', '?sheet=0 で window.DFSheet が生えず、ボタンもオーバーレイも注入されない', (M) => {
    const r = M.off;
    if (!r) return [false, '⛔ 測定が無い'];
    const ok = r.hasDFSheet === false && r.btn === false && r.overlay === false && r.style === false;
    return [ok, 'DFSheet=' + r.hasDFSheet + ' btn=' + r.btn + ' overlay=' + r.overlay + ' style=' + r.style
      + (ok ? '  (pageerror ' + (r.errs || []).length + ' 件)' : '  ⛔ 期待 全部 false')];
  }],
  ['0s12', '自前の職業表示名が js/hero-classes.js の HERO_CLASSES と 6 職とも一致 (2 経路)', (M) => {
    const r = M.labels;
    if (!r) return [false, '⛔ 測定が無い'];
    return [r.ok === true && r.n === 6,
      r.ok ? 'HERO_CLASSES ' + r.n + ' 職と一致'
        : '⛔ ' + ((r.mismatch || []).join(' / ') || r.why || '不明')];
  }],
  ['0s13', 'シートが修正値を自前計算していない (js/player-sheet.js のコード部に Math.floor が無い)', (M) => {
    const code = stripComments(M.sheetSrc || '');
    const floors = (code.split('Math.floor').length - 1);
    const halves = (code.split('- 10) / 2').length - 1) + (code.split('-10)/2').length - 1);
    return [floors === 0 && halves === 0,
      floors === 0 && halves === 0
        ? 'Math.floor 0 箇所 / (s-10)/2 0 箇所 (DFAbilities.abilityMod が唯一の入口)'
        : '⛔ Math.floor ' + floors + ' 箇所 / (s-10)/2 ' + halves
          + ' 箇所 — #28 の ?ability5e=0 が効かなくなる'];
  }],

  // ── §4 恒等 (この項目で測れる分) ───────────────────────────────────────
  ['4b', 'シートの XP_THRESHOLDS の写しが index.html の実体と完全一致 (10 要素すべて)', (M) => {
    const a = M.xpSheet, b = M.xpIndex, c = (M.mod && M.mod.has) ? M.mod.xp : null;
    if (!a || !b) return [false, '⛔ 母集団が無い (sheet=' + JSON.stringify(a) + ' index=' + JSON.stringify(b) + ')'];
    const ok = a.length === 10 && deepEq(a, b) && (c === null || deepEq(a, c));
    return [ok, 'sheet=' + JSON.stringify(a)
      + (deepEq(a, b) ? ' == index.html' : ' ⛔≠ index.html ' + JSON.stringify(b))
      + (c === null ? '' : (deepEq(a, c) ? '  (ブラウザ評価も一致)' : '  ⛔ ブラウザ評価 ' + JSON.stringify(c)))];
  }],

  // ── §5 撤退 (この項目で測れる分) ───────────────────────────────────────
  ['5b', '言語キーが無いセーブでも **固定分だけ**が出て、エラーにならない', (M) => {
    const r = M.nolang;
    if (!r || !r.has) return [false, '⛔ 母集団が無い'];
    const wantIds = r.expect || [];
    const gotIds = (r.chips || []).map(c => c.id);
    const allFixed = (r.chips || []).length > 0 && (r.chips || []).every(c => c.fixed === true);
    const ok = r.hadKey === null && r.threw === null && r.open === true
      && r.secPresent === true && deepEq(gotIds, wantIds) && allFixed
      && (r.errs || []).length === 0;
    return [ok, 'classKey=' + r.classKey + '  languages キー=' + JSON.stringify(r.hadKey)
      + '  チップ=' + JSON.stringify(gotIds) + ' (期待 ' + JSON.stringify(wantIds) + ')'
      + '  全部 fixed=' + allFixed + '  例外=' + JSON.stringify(r.threw)
      + '  pageerror=' + (r.errs || []).length
      + (ok ? '' : '  ⛔ 固定分だけが出てエラー 0 であること')];
  }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

/* ══ まだ測れない受入条件 (依頼書 §9 そのまま) ══════════════════════════════
 *  ⭐ 項目 1 は HTML を 1 枚も触らないので、5 ページに <script src> がまだ無い。
 *    → 実ページを開いて測る条件は **全部 PENDING**。理由を必ず添える。
 *  ⛔ 「測れないから消す」も「測れないけど緑にする」も禁止。 */
const HTML_YET = '実ページに <script src="js/player-sheet.js"> がまだ無い (項目 2 の担当)';
const PENDING_OF = {
  '0a': ['[装置] 5 ページすべてが HTTP 200 で読めている (母集団 = 5)',
    HTML_YET + ' — ページ自体は 200 だが、母集団として意味を持つのは搭載後'],
  '0b': ['5 ページすべてで window.DFSheet が truthy (1 枚でも欠けたら赤)',
    HTML_YET + ' ⭐ 罠 A: 「共有モジュールだから見える」は false。5 枚に個別で <script src> が要る'],
  '0c': ['[装置] 各ページで実際にシートが開いた (DFSheet.isOpen() === true) を確認してから中身を採る',
    HTML_YET + ' ⭐ これが無いと「閉じたままの空 DOM を測って全部緑」になる (変異 closedread の担当)'],
  '1a': ['tavern / town / world / title で #dfSheetBtn の中心の elementFromPoint が自分自身か子孫',
    HTML_YET + ' ⚠ 存在だけでは足りない。覆われていないことまで見る'],
  '1b': ['index では #dfSheetBtn が #partyPanel の子孫 / town(compact) では #townHud の子孫',
    HTML_YET + ' ⚠ キュー訂正版の 3 経路。町は **compact のときだけ** #townHud の子になる'
      + ' (デスクトップでは #townHud が display:none なので body へ fixed。実装のコメント参照)'],
  '1c': ['5 ページすべてで、ボタンを押す前後で DFSheet.isOpen() が false → true',
    HTML_YET + ' ⚠ click だけでなく touchend でも押せること'],
  '2a': ['6 能力すべて (CHA 含む) が描かれ、値が DFAbilities.CLASS_ABILITIES と一致 (2 経路)',
    HTML_YET + ' ⛔ 期待値をドライバに写経しない。DOM のテキスト vs ブラウザで評価したモジュール値'],
  '2b': ['修正値が DFAbilities.abilityMod() と一致し、?ability5e=0 でシートも B/X へ戻る',
    HTML_YET + ' ⭐ シートが自前の式を持っていないことの証明 (変異 ownmod の担当)'],
  '2c': ['取れない区画は行ごと消えている (__state().hidden と DOM に無い id の集合が一致)',
    HTML_YET + ' ⭐ 「空文字を描いた」と「行ごと消した」の区別 (変異 blankrow の担当)'],
  '2d': ['技能 12 種が描かれ、各行の合計が SkillCheck.checkScore と一致',
    HTML_YET + ' ⚠ SkillCheck は index / tavern にしか載っていない。他 3 枚では区画ごと伏せる'],
  '3a': ['title.html で職を選ぶと CLASS_LANGUAGES[key].picks 個の選択チップが出る (6 職・rogue だけ 2)',
    'title.html の「汝は何者か」に言語選択 UI がまだ無い (項目 3 の担当)'],
  '3b': ['picks 未充足では「出発」が disabled',
    'title.html の言語選択 UI がまだ無い (項目 3 の担当)'],
  '3c': ['出発後、localStorage["dragonfighters.languages"] が **選択分だけ**の JSON 配列',
    'title.html の departAsChosen() に保存がまだ無い (項目 3 の担当)'
      + ' ⭐⭐⭐ 罠 B: DFSlots.newGame() の **後** に書くこと'],
  '3d': ['シートの言語欄が DFSheet.languagesOf(classKey) と一致し、固定分 + 選択分が両方出ている',
    HTML_YET + ' + 項目 3 の保存が要る (固定分だけの経路は (5b) で既に緑)'],
  '3e': ['職を選び直すと選択済みがリセットされる (固定分との重複が起きない)',
    'title.html の言語選択 UI がまだ無い (項目 3 の担当)'],
  '4a': ['シートを開閉しても既存 HUD (#settingsBtn / #partyToggleBtn / #combatLog) の矩形が 1px も動かない',
    HTML_YET + ' ⚠ 開く前後の getBoundingClientRect を比較する'],
  '4c': ['5 ページすべてで pageerror ゼロ',
    HTML_YET + ' (モジュール単体の pageerror 0 は (0s2) で既に緑)'],
  '4d': ['localStorage に増えたキーが dragonfighters.languages の 1 本だけ',
    HTML_YET + ' + 項目 3 の保存が要る (シートが 1 バイトも書かないことは (0s8) で既に緑)'],
  '5a': ['?sheet=0 で 5 ページとも #dfSheetBtn も #dfSheetOverlay も存在しない',
    HTML_YET + ' (スタブページでの撤退は (0s11) で既に緑)'],
};

const SECTIONS = [
  ['§0 装置 — 共有モジュール単体の契約 (項目 1 で測れる分)',
    ['0s1', '0s2', '0d', '0s3', '0s4', '0s5', '0s6', '0s7', '0s8', '0s9', '0s10', '0s11', '0s12', '0s13']],
  ['§0 装置 — 実ページの母集団 (項目 2 以降)', ['0a', '0b', '0c']],
  ['§1 呼び出し口 — 3 経路 (キュー訂正版)', ['1a', '1b', '1c']],
  ['§2 中身 — 能力値 / 技能 / 伏せた区画', ['2a', '2b', '2c', '2d']],
  ['§3 言語 — 選択 UI と保存', ['3a', '3b', '3c', '3d', '3e']],
  ['§4 恒等 — 非退行', ['4a', '4b', '4c', '4d']],
  ['§5 撤退 — ?sheet=0', ['5a', '5b']],
];

function emit(id, M) {
  if (PENDING_OF[id]) { pending('(' + id + ') ' + PENDING_OF[id][0], PENDING_OF[id][1]); return; }
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
  console.log('=== verify_player_sheet — プレイヤーシート v1 + 言語 (依頼書 #29 §9) '
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] ROOT=' + ROOT + '  PORT=' + PORT
    + '  変異 実装 ' + MUT_IMPL.length + ' / 宣言 ' + MUT_ORDER.length
    + (NEGATIVE && MUT_IMPL.length ? '  変異ポート=' + MUT_IMPL.map(k => k + ':' + PORT_OF[k]).join(' ') : ''));

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_sheet_');
  const servers = [await startServer(PORT, MUTATE)];
  if (NEGATIVE) for (const k of MUT_IMPL) servers.push(await startServer(PORT_OF[k], k));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /** 1 ポート分を丸ごと測る。want で「要る測定だけ」に絞る (変異ごとの時短)。 */
  async function measureAll(port, mutKey, want) {
    const base = 'http://localhost:' + port;
    const m = {};
    m.sheetSrc = servedSrc(mutKey, SHEET_JS);
    m.indexSrc = servedSrc(mutKey, INDEX_HTML);
    m.xpSheet  = parseXpThresholds(m.sheetSrc);
    m.xpIndex  = parseXpThresholds(m.indexSrc);
    m.mod    = (!want || want.mod)    ? await probeModule(browser, base, '')  : { has: false, errs: [] };
    m.off    = (!want || want.off)    ? await probeRetreat(browser, base)     : null;
    m.labels = (!want || want.labels) ? await probeLabels(browser, base)      : null;
    m.nolang = (!want || want.nolang) ? await probeNoLangKey(browser, base)   : null;
    return m;
  }

  try {
    mark('装置 — 変異アンカーが 1 箇所にヒットするか');
    if (!MUT_IMPL.length) {
      console.log('  (実装済みの変異が 0 本 — 項目 1 の設計どおり。--negative で PENDING 一覧が出る)');
    }
    for (const k of MUT_IMPL) {
      check('(0m-' + k + ') [装置] 変異アンカーが ' + MUTATIONS[k].file + ' の 1 箇所にヒットする',
        !!MUT_SRC[k] || !!MUTATIONS[k].driverSide,
        MUTATIONS[k].driverSide ? '装置側の変異 (ファイル置換なし)'
          : '置換 ' + MUTATIONS[k].from.length + ' → ' + MUTATIONS[k].to.length + ' bytes');
    }

    mark('測定 — モジュール単体 / 撤退 / 表示名 / 言語キー無し');
    const M = await measureAll(PORT, MUTATE, null);
    console.log('[drv]   DFSheet=' + (M.mod.has ? '有り' : '⛔無し')
      + '  言語 ' + ((M.mod.languages || []).length) + ' 件'
      + '  職 ' + Object.keys(M.mod.classLang || {}).length
      + '  区画 ' + ((M.mod.sectionIds || []).length) + ' 件'
      + '  XP_THRESHOLDS sheet=' + JSON.stringify(M.xpSheet));
    if ((M.mod.errs || []).length) console.log('[drv]   ⚠ スタブの pageerror: ' + M.mod.errs.slice(0, 3).join(' | '));

    for (const sec of SECTIONS) { mark(sec[0]); for (const id of sec[1]) emit(id, M); }

    /* ── 負のコントロール ──────────────────────────────────────────────────
     *  ⭐ 各変異について「赤くなるべき節」が実際に赤くなったかを数える。
     *    赤くならなかった変異が 1 本でもあれば **空振り** = exit 1。
     *  ⚠ 項目 1 では 7 本すべて未実装なので、ここは PENDING の一覧になる。 */
    if (NEGATIVE) {
      for (const k of MUT_IMPL) {
        const mu = MUTATIONS[k];
        mark('負のコントロール — 変異 ' + k + ' → (' + mu.targets.join(')(') + ') が赤くなる');
        const ev = mu.evaluable || [];
        const mm = await measureAll(PORT_OF[k], k, null);
        const res = {};
        for (const id of ev) {
          try { res[id] = ASSERT_OF[id][2](mm); }
          catch (e) { res[id] = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
        }
        for (const id of mu.targets) {
          const r = res[id] || [true, '⛔ evaluable に載っていない = この変異では測っていない'];
          check('(neg-' + k + '-' + id + ') 変異 ' + k + ' で (' + id + ') が赤くなる',
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        const red = ev.filter(id => res[id][0] === false);
        const extra = red.filter(id => mu.targets.indexOf(id) < 0);
        const unexpected = extra.filter(id => (mu.allowRed || []).indexOf(id) < 0);
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない (見た節=' + ev.join('/') + ')',
          unexpected.length === 0,
          '赤=' + (red.length ? red.join(',') : '(無し)') + '  担当=' + mu.targets.join(',')
          + (unexpected.length ? '  ⛔ 想定外の巻き込み=' + unexpected.join(',') : ''));
      }
      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (完了条件 = ここが 0 件 / 項目 4 の担当)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → ' + MUTATIONS[k].targets.map(t => '(' + t + ')').join('')
            + ' が赤くなる  [' + (MUTATIONS[k].file || '装置側') + ']', MUTATIONS[k].why);
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
    console.log('  **PENDING** (項目 2〜4 で埋める):');
    for (const b of pend) console.log('    - ' + b.name);
  }
  console.log('──────────────────────────────────────────────');
  process.exit(failed.length ? 1 : 0);
})();
