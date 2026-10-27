#!/usr/bin/env node
/* verify_plaza_hours.js — #102 闇市は夜だけ開く (20:00〜24:59 なら誰でも入れる・昼は入り口が DOM に無い) の受入
 *
 *   node tools/verify_plaza_hours.js                         ← 素の受入 (依頼書 §8 の全節)
 *   node tools/verify_plaza_hours.js --negative              ← 負のコントロール 12 本 (1 本ずつ子プロセスで順に)
 *   node tools/verify_plaza_hours.js --negative --only notap
 *
 * 依頼書: 実装依頼書/2026-10-27_plaza-night-hours.md §8 (受入条件の唯一の正)。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 時刻は 2 経路で動かす: (i) sessionStorage["dragonfighters.plazaClock"] (上書きの経路) /
 *    (ii) evaluateOnNewDocument で Date そのものを差し替えた実時計の経路 (上書きなし。window.__fakeNow(ms) で後から動かす)。
 *    ⭐ すべての腕で (i) か (ii) のどちらかで時刻を固定する = 走らせた時刻 (昼/夜) に依らず同じ結果になる。
 *    ⚠ performance.now / requestAnimationFrame は触らない (歩きの補間が壊れる)。
 *  - 観測は DOM (札の有無・#plazaScreen の開閉・#prologueOverlay を経たか) と __plazaTV.state() / plazaInventory。
 *    ⛔ ナレの文言そのもの・tick の長さそのもの・闇市の中の品/露店/住人は測らない (依頼書 §8 ⛔)。
 *  - tavern.html / town.html / index.html / js/plaza-hours.js は起動時に読み込んで凍結し、配信はその凍結版から出す。
 *    負のコントロールは凍結版をメモリ上で差し替える。⛔ 本番ファイルは 1 バイトも書き換えない。⚠ 走行中に本番を編集しないこと。
 *  - 腕ごとに新しい browser context (= storage が空のタブ) を使う。種まきは 1 タブ 1 回 (同じタブの遷移ではまき直さない)。
 *
 * ── 依頼書 §8 からの言い直し ─────────────────────────────────────────────
 *  (4a)(5a)(5b)(6a) 開始時刻を「HH:59:50」ではなく「HH:59:00」にした。tavern.html の読み込み (札を作る瞬間) に
 *       数秒かかるので、:50 から始めると読み込み中に境界をまたいで「境界の手前の姿」を確かめる前提が崩れる日がある。
 *       境界を越える側 (01:00:10 / 20:00:10 / 01:00:30) は依頼書どおり。測る現象 (手前で在る/無い → 越えた後に変わる) は同じ。
 *  (4a) 「その後 #tavernDoor_plaza が DOM から消える」は、店じまいのオーバーレイが閉じてから **10 秒以内** に見る
 *       (tick の 30 秒より前 = 消したのが tick ではなく onTapPlazaDoor の updatePlazaDoor であること)。
 *  (5c) 「看板 1 + HUD 1」に加え、作り直した後に他の施設の看板も二重になっていない (.townSign の data-facility に重複なし) を見る。
 *  (7b) index.html は既存の検証ブリッジ window.__plaza.maybeGrantPolymorphWand を叩く (本番に計測シームを足さない)。
 *       ボスの敵オブジェクト = { def: { isBoss: true } }。Math.random は呼び出しの間だけ () => 0 に差し替えて戻す。
 *  (8a) 作業ツリーの js/*.js は CRLF (.gitattributes の js/*.js eol=crlf)、git の blob は LF。
 *       「バイト一致」は (i) `git hash-object --path` (作業ツリーを blob と同じ正規化に通した値) == `git rev-parse 3cb06b5:<f>` と
 *       (ii) 配信したバイトの CRLF→LF == `git show 3cb06b5:<f>` のバイト、の 2 本で見る。
 *  (Xc) 撤退の腕は昼 (plazaClock = 12) で回す (撤退中は時刻を見ないことも併せて示す)。
 *  (err) pageerror (捕まらなかった例外) 0 件。装置の健全性として最後に 1 本。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - 1 本ずつ子プロセスで順に回す。port は 10641 だけを順に使う (verify_town_changelog と同じ作法)。
 *  - アンカーは**手つかずの凍結版**で 1 件ちょうどを起動時に確かめる (素の走行でも)。0 件 / 2 件以上 /
 *    置換前後が同じ / 改行を含む / 置換文字列が原本に既に在る なら exit 3 (空振りで緑にしない)。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は一覧に出す。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 (puppeteer / ブラウザ / ポート / git) / 3 = 変異アンカーの腐敗
 * port: 10641 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
 * ⛔ timeout コマンドで包まない (孤児の node がポートを掴む)。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10641'), 10);
const T0 = Date.now();

const BASE_REV = '3cb06b5';        // 着手前 (clean・push 済) — 依頼書 §8 (8a)
const TRAP_B_LINE = '        if (d.requiresPlazaUnlock && !plazaUnlocked()) return;';   // 罠 B (9a)

/* ══ 凍結版 ══ */
const FROZEN_FILES = ['tavern.html', 'town.html', 'index.html', 'js/plaza-hours.js'];
const PRISTINE = {};
for (const f of FROZEN_FILES) {
  try { PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); }
  catch (e) { console.error('[driver] ' + f + ' が読めません'); process.exit(2); }
}
function git(args, enc) {
  try { return execFileSync('git', ['-C', ROOT].concat(args), { encoding: enc === undefined ? 'utf8' : enc, maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { console.error('[driver] git ' + args.join(' ') + ' に失敗: ' + e.message); process.exit(2); }
}

/* ══ 負のコントロール (依頼書 §8 の表)。edits = [[file, anchor, patch], ...]。⚠ アンカーも置換も 1 行に収める ══ */
const MUTATIONS = {
  nocarry: { expect: ['(0b)', '(Xa)'], why: '⭐ 罠 A: plaza-hours.js がクエリ (?plazaclock / ?plazanight=0) を sessionStorage へ写さない (その場の変数だけ)',
    edits: [['js/plaza-hours.js', 'sessionStorage.setItem(CLOCK_KEY, String(Number(c)));', 'global.__mutLocalClock = Number(c); /* mut-nocarry */'],
            ['js/plaza-hours.js', 'if (v !== null && /^\\d{1,2}$/.test(v)) return Number(v);',
             'if (global.__mutLocalClock !== undefined) return global.__mutLocalClock; /* mut-nocarry */ if (v !== null && /^\\d{1,2}$/.test(v)) return Number(v);'],
            ['js/plaza-hours.js', 'if (n === "0") sessionStorage.setItem(OFF_KEY, "1");', 'if (n === "0") global.__mutLocalOff = true; /* mut-nocarry */'],
            ['js/plaza-hours.js', 'try { return sessionStorage.getItem(OFF_KEY) !== "1"; }', 'try { if (global.__mutLocalOff) return false; /* mut-nocarry */ return sessionStorage.getItem(OFF_KEY) !== "1"; }']] },
  overrideonly: { expect: ['(0c)', '(1b)'], why: 'hourNow が上書き無しのとき常に 21 を返す (実時計の経路が死ぬ)',
    edits: [['js/plaza-hours.js', 'return new Date().getHours();', 'return 21; /* mut-overrideonly */']] },
  closeoff: { expect: ['(1a)', '(1b)'], why: 'CLOSE_HOUR の比較を h <= 1 にする (01:00 台も開く)',
    edits: [['js/plaza-hours.js', 'h < CLOSE_HOUR', 'h <= CLOSE_HOUR']] },
  daysign: { expect: ['(1b)', '(2a)'], why: 'town.html の時刻の 1 行を外す (昼も看板を作る)',
    edits: [['town.html', '        if (f.requiresPlazaUnlock && window.PLAZA_HOURS && !PLAZA_HOURS.isOpen()) return;', '        /* mut-daysign */']] },
  notap: { expect: ['(4a)', '(4b)'], why: 'onTapPlazaDoor の入る瞬間の再判定 (if (!plazaOpenNowTV())) を外す',
    edits: [['tavern.html', '      if (!plazaOpenNowTV()) { await playPlazaClosed(); updatePlazaDoor(); return; }', '      /* mut-notap */']] },
  notick: { expect: ['(5a)', '(5b)'], why: 'tavern / town の 30 秒 tick を立てない (tavern は中身を空に・town は IIFE を先に return)',
    edits: [['tavern.html', '        if (now !== lastOpen) { lastOpen = now; updatePlazaDoor(); }', '        /* mut-notick */'],
            ['town.html', '      var lastOpen = PH.isOpen();', '      return; /* mut-notick */ var lastOpen;']] },
  stilldisguise: { expect: ['(3a)', '(3b)'], why: '夜の分岐を外す (旧の門番のまま = 変装が要る)',
    edits: [['tavern.html', '      /* ★[#102] 夜なら誰でも通れる。変装 (杖・習得) は見ない・杖を消費しない。',
             '      } if (false) { /* mut-stilldisguise ★[#102] 夜なら誰でも通れる。変装 (杖・習得) は見ない・杖を消費しない。']] },
  kickout: { expect: ['(6a)'], why: 'tick で開閉が変わったら closePlaza() も呼ぶ (中に居る人を追い出す)',
    edits: [['tavern.html', '        if (now !== lastOpen) { lastOpen = now; updatePlazaDoor(); }', '        if (now !== lastOpen) { lastOpen = now; updatePlazaDoor(); closePlaza(); /* mut-kickout */ }']] },
  stillstock: { expect: ['(7a)'], why: '杖の常設 push を無条件に戻す',
    edits: [['tavern.html', '    if (!plazaNightOnTV()) stock.push({ itemId: "wand_polymorph"', '    if (true /* mut-stillstock */) stock.push({ itemId: "wand_polymorph"']] },
  dropalive: { expect: ['(7b)'], why: 'maybeGrantPolymorphWand の先頭の return を外す (夜の関門でも杖が落ちる)',
    edits: [['index.html', 'if (window.PLAZA_HOURS && PLAZA_HOURS.on()) return;', '/* mut-dropalive */']] },
  rewriteline: { expect: ['(9a)'], why: '⭐ 罠 B: 11398 の行を (!plazaUnlocked() || !plazaOpenNowTV()) に書き換え、直後の 1 行を消す',
    edits: [['tavern.html', TRAP_B_LINE, '        if (d.requiresPlazaUnlock && (!plazaUnlocked() || !plazaOpenNowTV())) return;'],
            ['tavern.html', '        if (d.requiresPlazaUnlock && !plazaOpenNowTV()) return;', '        /* mut-rewriteline */']] },
  retiredone: { expect: ['(7c)'], why: 'tavern.html 側だけに retired: true (index.html の杖のカタログから外す)',
    edits: [['index.html', '        consumeTrigger: "onPlazaEnter", alwaysInStock: true, retired: true,', '        consumeTrigger: "onPlazaEnter", alwaysInStock: true, /* mut-retiredone */']] },
};
const MUT_ORDER = ['nocarry', 'overrideonly', 'closeoff', 'daysign', 'notap', 'notick', 'stilldisguise', 'kickout', 'stillstock', 'dropalive', 'rewriteline', 'retiredone'];

/* 起動時の検算 (素の走行でも必ず) */
for (const k of MUT_ORDER) {
  for (const [file, anchor, patch] of MUTATIONS[k].edits) {
    const hits = PRISTINE[file].split(anchor).length - 1;
    if (hits !== 1) {
      console.error('[driver] 負のコントロール ' + k + ' の注入点が ' + file + ' に ' + hits + ' 箇所 (期待 1)。変異は無効です: ' + anchor.slice(0, 160));
      process.exit(3);
    }
    if (anchor === patch || /[\r\n]/.test(anchor + patch)) {
      console.error('[driver] ' + k + ' は置換前後が同一 / 改行を含みます'); process.exit(3);
    }
    if (PRISTINE[file].indexOf(patch) >= 0) { console.error('[driver] ' + k + ' の置換文字列が原本に既に在る'); process.exit(3); }
  }
}
for (const k of ONLY) if (!MUTATIONS[k]) { console.error('[driver] 未知の --only: ' + k + '  (' + MUT_ORDER.join(',') + ')'); process.exit(3); }

const SNAP = Object.assign({}, PRISTINE);   // 配信はここから
function inject(tag) {
  const m = MUTATIONS[tag];
  for (const [file, anchor, patch] of m.edits) {
    const now = SNAP[file].split(anchor).length - 1;
    if (now !== 1) { console.error('[driver] ' + tag + ': 先行の置換の後で注入点が ' + now + ' 箇所 (期待 1)'); process.exit(3); }
    SNAP[file] = SNAP[file].split(anchor).join(patch);
  }
  console.log('[driver] ★ 負のコントロール ' + tag + ' を注入しました (' + m.why + ' / 置換 ' + m.edits.length + ' 本)');
}

/* ══ --negative 一括 = 子プロセスを直列・同 port ══ */
if (NEGATIVE && !ONLY.length) {
  const bad = [], summary = [];
  console.log('[driver] --negative (一括): ' + MUT_ORDER.join(',') + ' を 1 本ずつ順に走らせます (port ' + PORT + ' を順に使う)');
  for (const tag of MUT_ORDER) {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT)];
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const t1 = Date.now();
    const r = spawnSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    const m = (r.stdout || '').match(/\[driver\] --negative \S+: 担当=([^\s]*) \/ 実際に赤くなった=([^\n]*)/);
    summary.push(tag + ': exit ' + r.status + ' (' + Math.round((Date.now() - t1) / 1000) + ' 秒)' + (m ? '  担当=' + m[1] + '  赤=' + m[2].trim() : ''));
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  }
  console.log('\n[driver] ── --negative 総括 (' + Math.round((Date.now() - T0) / 1000) + ' 秒) ──');
  summary.forEach((s) => console.log('   ' + s));
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + MUT_ORDER.length + '/' + MUT_ORDER.length + ' 本すべて担当の節が赤くなりました (空振り 0)');
  process.exit(0);
}
if (NEGATIVE) {
  if (ONLY.length !== 1) { console.error('[driver] --only には変異を 1 つ: ' + MUT_ORDER.join(',')); process.exit(1); }
  inject(ONLY[0]);
}

/* ══ 器 (サーバ・ブラウザ) ══ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/town.html';
        const rel = u.replace(/^\/+/, '');
        rs.setHeader('Cache-Control', 'no-store');
        if (Object.prototype.hasOwnProperty.call(SNAP, rel)) {
          rs.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          rs.end(SNAP[rel]);
          return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, '127.0.0.1', () => res(s));
  });
}

/* ══ 判定の記録。label = 節 ((2c) など)、scr = 腕の印 (town / tavern / index / null) ══ */
const results = [];
function check(label, scr, name, cond, detail) {
  const ok = !!cond;
  const d = detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
  results.push({ label, scr, name, ok, detail: d });
  console.log((ok ? '  PASS ' : '  FAIL ') + label + (scr ? ' [' + scr + ']' : '') + ' ' + name + (d ? '  -- ' + d.slice(0, 700) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* その日のローカル時刻 HH:MM:SS (ドライバ = 同じ端末のローカル時刻) */
function localMs(HH, MM, SS) { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), HH, MM, SS || 0).getTime(); }
const hhmm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); };

const pageErrors = [];
let browser = null;
const VP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const URL0 = 'http://127.0.0.1:' + PORT;

/* 新しいタブ (= 新しい browser context・storage は空) を開く。
 *   seed: { cls, wands, gateSeen, everEntered, unlocked, wandDrop, known, clock (文字列 | null), enterVia, fakeAt (ms | null) }
 *   ⚠ 種まきは 1 タブ 1 回 (__phSeeded)。同じタブで別ページへ移ってもまき直さない (遷移またぎを測るため)。
 *   ⚠ Date の差し替えは evaluateOnNewDocument = ページの JS より先。ページを移ると基準 (fakeAt) から数え直す。 */
async function openTab(seed) {
  const sd = Object.assign({ cls: 'warrior', wands: null, gateSeen: true, everEntered: true, unlocked: true, wandDrop: false,
    known: null, clock: null, enterVia: null, fakeAt: null, tag: '' }, seed || {});
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push((sd.tag || '?') + ' :: ' + e.message));
  await page.setViewport(VP);
  if (sd.fakeAt !== null) {
    await page.evaluateOnNewDocument((startMs) => {
      const RealDate = Date; let base = startMs, realAt = RealDate.now();
      const now = () => base + (RealDate.now() - realAt);
      class FakeDate extends RealDate {
        constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
        static now() { return now(); }
      }
      window.Date = FakeDate;
      window.__fakeNow = (ms) => { base = ms; realAt = RealDate.now(); };
    }, sd.fakeAt);
  }
  await page.evaluateOnNewDocument((s) => {
    try {
      if (sessionStorage.getItem('__phSeeded')) return;
      sessionStorage.setItem('__phSeeded', '1');
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify([s.cls]));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.plazaState', JSON.stringify({ unlocked: s.unlocked, everEntered: s.everEntered,
        gatekeeperEventSeen: s.gateSeen, wandDropEnabled: s.wandDrop }));
      if (s.wands) localStorage.setItem('dragonfighters.plazaInventory', JSON.stringify({ wand_polymorph: s.wands }));
      if (s.known) localStorage.setItem('dragonfighters.knownSpells', JSON.stringify(s.known));
      if (s.clock !== null) sessionStorage.setItem('dragonfighters.plazaClock', s.clock);
      if (s.enterVia) sessionStorage.setItem('dragonfighters.enterVia', s.enterVia);
    } catch (e) {}
  }, sd);
  return { page, ctx, close: async () => { try { await ctx.close(); } catch (e) {} } };
}
async function waitFn(page, fn, ms, a) { try { await page.waitForFunction(fn, { timeout: ms || 15000, polling: 100 }, a); return true; } catch (e) { return false; } }
async function gotoTown(page, qs) {
  await page.goto(URL0 + '/town.html' + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction("window.__town && typeof window.__town.heroTile === 'function'", { timeout: 30000 });
  await sleep(400);
}
async function gotoTavern(page, qs) {
  await page.goto(URL0 + '/tavern.html' + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__plazaTV && typeof window.__plazaTV.onTapPlazaDoor === 'function', { timeout: 60000 });
  await sleep(600);
}
/* 白紙のページ (同じ origin の 404) — 新しいタブで index.html を開く前に sessionStorage を書く足場 */
async function gotoBlank(page) { await page.goto(URL0 + '/__blank', { waitUntil: 'load', timeout: 30000 }).catch(() => null); }
async function gotoIndex(page) {
  /* index.html を開く前に冒険の種 (verify_plaza_srd の openIndex と同じ) を同じタブの sessionStorage へ置く */
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify([
        { classKey: 'warrior', isHero: true, zone: 'front', name: null, trait: null, line: null }]));
    } catch (e) {}
  });
  await page.goto(URL0 + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__plaza && typeof window.__plaza.maybeGrantPolymorphWand === 'function', { timeout: 90000 });
  await sleep(1500);
}

const PH_FN = () => window.PLAZA_HOURS ? { has: true, open: PLAZA_HOURS.OPEN_HOUR, close: PLAZA_HOURS.CLOSE_HOUR, h: PLAZA_HOURS.hourNow(),
  on: PLAZA_HOURS.on(), isOpen: PLAZA_HOURS.isOpen(), ss: sessionStorage.getItem('dragonfighters.plazaClock') } : { has: false };
const TOWN_DOM = () => ({ sign: !!document.getElementById('townSign_plaza'), hud: !!document.getElementById('townHudBtn_plaza'),
  n: document.querySelectorAll('[data-facility="plaza"]').length });
const TAV_DOM = () => { const d = document.getElementById('plazaDoor');
  return { door: !!document.getElementById('tavernDoor_plaza'), oldDoor: d ? getComputedStyle(d).display : null }; };
const isOpenFn = () => window.__plazaTV.plazaOpen() && !!document.querySelector('#plazaViewport .mwStage');
/* #prologueOverlay が一度でも表示されたかを記録する (MutationObserver)。tap の前に仕掛ける */
const WATCH_OVERLAY = () => {
  window.__ovSeen = false;
  const o = document.getElementById('prologueOverlay');
  if (!o) return false;
  const f = () => { if (getComputedStyle(o).display !== 'none') window.__ovSeen = true; };
  f(); new MutationObserver(f).observe(o, { attributes: true, attributeFilter: ['style', 'class'] });
  return true;
};
const overlayShown = () => { const o = document.getElementById('prologueOverlay'); return !!o && getComputedStyle(o).display !== 'none'; };
const overlayHidden = () => { const o = document.getElementById('prologueOverlay'); return !!o && getComputedStyle(o).display === 'none'; };
/* 札を押す: 中心が画面内で elementFromPoint が札自身なら実クリック、そうでなければ el.click() (verify_plaza_map と同じ) */
async function pressSign(page, id) {
  const pt = await page.evaluate((sid) => {
    const s = document.getElementById(sid); if (!s) return { missing: true };
    const b = s.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
    if (x >= 2 && y >= 2 && x < innerWidth - 2 && y < innerHeight - 2) {
      const e = document.elementFromPoint(x, y); if (e && (e === s || s.contains(e))) return { x, y };
    }
    s.click(); return { elClick: true };
  }, id);
  if (pt && pt.x !== undefined) await page.mouse.click(pt.x, pt.y);
  return pt;
}
/* index.html の検証ブリッジで (7b) の条件を作って杖のドロップを 1 回引く */
const DROP_FN = () => {
  const P = window.__plaza;
  const st = P.reloadState();
  const before = (P.inv().wand_polymorph || []).length;
  const R = Math.random; Math.random = () => 0;
  try { P.maybeGrantPolymorphWand({ def: { isBoss: true } }); } finally { Math.random = R; }
  return { wandDropEnabled: st.wandDropEnabled, lowTier: P.isLowTierRun(), on: window.PLAZA_HOURS ? window.PLAZA_HOURS.on() : null,
    before, after: (P.inv().wand_polymorph || []).length };
};

/* §2-5 の表 (⭐ isOpenAt の写しにしない = 固定の期待値) */
const OPEN_TABLE = (h) => h === 20 || h === 21 || h === 22 || h === 23 || h === 0;

/* ══ §0 装置 + §1 (1a) ══ */
async function sec0() {
  console.log('\n--- §0 装置 / (1a) ---');
  /* (0a) tavern / town (index は §7 の (7b) と同じタブで見る) */
  const t = await openTab({ clock: '21', tag: '0a' });
  try {
    await gotoTown(t.page);
    const a = await t.page.evaluate(PH_FN);
    check('(0a)', 'town', 'town.html に window.PLAZA_HOURS が在り OPEN_HOUR === 20 && CLOSE_HOUR === 1', a.has && a.open === 20 && a.close === 1, a);
    /* (1a) */
    const tbl = await t.page.evaluate(() => { const o = []; for (let h = 0; h < 24; h++) o.push(PLAZA_HOURS.isOpenAt(h)); return o; });
    const want = []; for (let h = 0; h < 24; h++) want.push(OPEN_TABLE(h));
    check('(1a)', null, 'PLAZA_HOURS.isOpenAt(0..23) == §2-5 の表 (20〜23・0 が true、他は false)', eq(tbl, want),
      { opens: tbl.map((v, h) => v ? h : null).filter((x) => x !== null), diff: tbl.map((v, h) => v === want[h] ? null : h).filter((x) => x !== null) });
    await gotoTavern(t.page);
    const b = await t.page.evaluate(PH_FN);
    check('(0a)', 'tavern', 'tavern.html に window.PLAZA_HOURS が在り OPEN_HOUR === 20 && CLOSE_HOUR === 1', b.has && b.open === 20 && b.close === 1, b);
  } finally { await t.close(); }

  /* (0b) 上書きが遷移をまたぐ。⚠ 実時計は 12:00 に固定 (上書きが落ちたら 12 = 必ず赤) */
  const u = await openTab({ fakeAt: localMs(12, 0), tag: '0b' });
  try {
    await gotoTown(u.page, '?plazaclock=21');
    const a = await u.page.evaluate(PH_FN);
    await gotoTavern(u.page, '');
    const b = await u.page.evaluate(PH_FN);
    check('(0b)', null, '?plazaclock=21 の town.html で hourNow() === 21、同じタブで (クエリ無しの) tavern.html へ移った後も 21 (実時計は 12:00)',
      a.h === 21 && b.h === 21, { town: a, tavern: b });
  } finally { await u.close(); }

  /* (0c) 実時計の経路 (上書きなし) */
  const v = await openTab({ fakeAt: localMs(21, 30), tag: '0c' });
  try {
    await gotoTown(v.page);
    const a = await v.page.evaluate(PH_FN);
    await v.page.evaluate((ms) => window.__fakeNow(ms), localMs(12, 0));
    const b = await v.page.evaluate(PH_FN);
    check('(0c)', null, '上書きなし・Date 21:30 → hourNow() === 21 / __fakeNow 12:00 → 12 (sessionStorage の上書きは null)',
      a.h === 21 && b.h === 12 && a.ss === null && b.ss === null, { at2130: a, at1200: b });
  } finally { await v.close(); }
}

/* ══ §1 (1b) DOM 経路 ══ */
async function sec1b() {
  console.log('\n--- §1 (1b) DOM 経路 (上書きなし・Date を差し替え) ---');
  const PTS = [[19, 59], [20, 0], [23, 59], [0, 0], [0, 59], [1, 0], [12, 0]];
  for (const [H, M] of PTS) {
    const label = String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0');
    const want = OPEN_TABLE(H);
    const [tw, tv] = await Promise.all([
      (async () => { const t = await openTab({ fakeAt: localMs(H, M, 5), tag: '1b town ' + label });
        try { await gotoTown(t.page); return Object.assign(await t.page.evaluate(TOWN_DOM), { at: hhmm(await t.page.evaluate(() => Date.now())) }); } finally { await t.close(); } })(),
      (async () => { const t = await openTab({ fakeAt: localMs(H, M, 5), tag: '1b tavern ' + label });
        try { await gotoTavern(t.page); return Object.assign(await t.page.evaluate(TAV_DOM), { at: hhmm(await t.page.evaluate(() => Date.now())) }); } finally { await t.close(); } })(),
    ]);
    check('(1b)', 'town', label + ' → #townSign_plaza / #townHudBtn_plaza が' + (want ? '在る' : '無い') + ' (§2-5 の表)',
      tw.sign === want && tw.hud === want, tw);
    check('(1b)', 'tavern', label + ' → #tavernDoor_plaza が' + (want ? '在る' : '無い') + ' (§2-5 の表)', tv.door === want, tv);
  }
}

/* ══ §2 昼は消える / 解禁は残る ══ */
async function sec2() {
  console.log('\n--- §2 昼は消える / 解禁は残る ---');
  const arms = [
    { lab: '(2a)', clock: '12', unlocked: true, want: false, wantOld: 'none', name: '昼 (plazaClock = 12)・unlocked: true' },
    { lab: '(2b)', clock: '21', unlocked: false, want: false, wantOld: 'none', name: '夜 (21)・unlocked: false (5 回クリアの解禁は残る)' },
    { lab: '(2c)', clock: '21', unlocked: true, want: true, wantOld: 'flex', name: '夜 (21)・unlocked: true ((2a)(2b) の空振り防止)' },
  ];
  for (const A of arms) {
    const t = await openTab({ clock: A.clock, unlocked: A.unlocked, tag: A.lab });
    try {
      await gotoTown(t.page);
      const tw = await t.page.evaluate(TOWN_DOM);
      await gotoTavern(t.page);
      const tv = await t.page.evaluate(TAV_DOM);
      await gotoTavern(t.page, '?tavernmap=0');
      const old = await t.page.evaluate(TAV_DOM);
      check(A.lab, null, A.name + ' → 港町の看板・HUD ボタン・酒場の石段の札が' + (A.want ? '在る' : ' DOM に無い') + '・?tavernmap=0 の旧扉 #plazaDoor は display === "' + A.wantOld + '"',
        tw.sign === A.want && tw.hud === A.want && tv.door === A.want && old.oldDoor === A.wantOld, { town: tw, tavern: tv, oldDoor: old.oldDoor });
    } finally { await t.close(); }
  }
}

/* ══ §3 夜は誰でも入れる ══ */
async function sec3() {
  console.log('\n--- §3 夜は誰でも入れる ---');
  /* (3a) 戦士・杖 0・習得なし・gatekeeperEventSeen false */
  {
    const t = await openTab({ clock: '21', cls: 'warrior', wands: null, gateSeen: false, tag: '3a' });
    try {
      await gotoTavern(t.page);
      await t.page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
      const ok = await waitFn(t.page, isOpenFn, 20000);
      const r = await t.page.evaluate(() => ({ cls: window.__plazaTV.heroClass(), gate: window.__plazaTV.state().gatekeeperEventSeen,
        innate: window.__plazaTV.hasInnateDisguise(), wands: window.__plazaTV.inv().wand_polymorph || null }));
      check('(3a)', null, '夜・戦士・杖 0・習得なし → onTapPlazaDoor() で #plazaScreen が開き #plazaViewport .mwStage が在る・gatekeeperEventSeen は false のまま',
        ok && r.cls === 'warrior' && !r.innate && r.wands === null && r.gate === false, Object.assign({ opened: ok }, r));
    } finally { await t.close(); }
  }
  /* (3b) 港町から入る (enterVia = "plaza") */
  {
    const t = await openTab({ clock: '21', cls: 'warrior', wands: null, gateSeen: false, enterVia: 'plaza', tag: '3b' });
    try {
      await gotoTavern(t.page);
      const ok = await waitFn(t.page, isOpenFn, 20000);
      const tile = ok ? await t.page.evaluate(() => window.__plazaTV.map.heroTile()) : null;
      const gate = await t.page.evaluate(() => window.__plazaTV.state().gatekeeperEventSeen);
      check('(3b)', null, '夜・戦士・杖 0 → 港町から入る (sessionStorage enterVia = "plaza" を置いて tavern.html) → 開く・(2,9) に立つ',
        ok && !!tile && tile.c === 2 && tile.r === 9 && gate === false, { opened: ok, tile, gate });
    } finally { await t.close(); }
  }
  /* (3c) 杖 [3,3] は消費しない・消えない */
  {
    const t = await openTab({ clock: '21', cls: 'warrior', wands: [3, 3], tag: '3c' });
    try {
      await gotoTavern(t.page);
      await t.page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
      const ok = await waitFn(t.page, isOpenFn, 20000);
      const r = await t.page.evaluate(() => ({ mem: window.__plazaTV.inv().wand_polymorph || null,
        ls: (JSON.parse(localStorage.getItem('dragonfighters.plazaInventory') || '{}').wand_polymorph) || null }));
      check('(3c)', null, '夜・戦士・杖 [3,3] → 入った後も plazaInventory.wand_polymorph が [3,3] のまま (メモリと localStorage)',
        ok && eq(r.mem, [3, 3]) && eq(r.ls, [3, 3]), Object.assign({ opened: ok }, r));
    } finally { await t.close(); }
  }
  /* (3d) 魔法使い + polymorph 習得 → 「本物の術師か」を挟まない (オーバーレイが出ないまま開く) */
  {
    const t = await openTab({ clock: '21', cls: 'mage', known: { mage: ['polymorph'] }, tag: '3d' });
    try {
      await gotoTavern(t.page);
      const armed = await t.page.evaluate(WATCH_OVERLAY);
      await t.page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
      const ok = await waitFn(t.page, isOpenFn, 20000);
      await sleep(800);
      const r = await t.page.evaluate(() => ({ cls: window.__plazaTV.heroClass(), innate: window.__plazaTV.hasInnateDisguise(), ovSeen: window.__ovSeen }));
      check('(3d)', null, '夜・魔法使い + polymorph 習得 → 入れる・オーバーレイ (#prologueOverlay) が一度も出ないまま開く (「本物の術師か」を挟まない)',
        armed && ok && r.cls === 'mage' && r.innate === true && r.ovSeen === false, Object.assign({ armed, opened: ok }, r));
    } finally { await t.close(); }
  }
}

/* ══ §4 入る瞬間の再判定 ══ */
async function sec4() {
  console.log('\n--- §4 入る瞬間の再判定 ---');
  /* (4a) 実時計の経路: 00:59 で開く → 札が在る → 01:00:10 へ → tap → 開かない・店じまいを経る・札が消える */
  {
    const t = await openTab({ fakeAt: localMs(0, 59, 0), cls: 'warrior', tag: '4a' });
    try {
      await gotoTavern(t.page);
      const pre = await t.page.evaluate(() => ({ door: !!document.getElementById('tavernDoor_plaza'), h: window.PLAZA_HOURS.hourNow() }));
      const armed = await t.page.evaluate(WATCH_OVERLAY);
      await t.page.evaluate((ms) => window.__fakeNow(ms), localMs(1, 0, 10));
      await t.page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
      const ovSeen = await waitFn(t.page, () => window.__ovSeen === true, 20000);
      const ovDone = await waitFn(t.page, overlayHidden, 40000);
      const gone = await waitFn(t.page, () => !document.getElementById('tavernDoor_plaza'), 10000);
      const r = await t.page.evaluate(() => ({ open: window.__plazaTV.plazaOpen(), stage: !!document.querySelector('#plazaViewport .mwStage'),
        door: !!document.getElementById('tavernDoor_plaza'), h: window.PLAZA_HOURS.hourNow() }));
      check('(4a)', null, 'Date 00:59 で tavern.html → 石段の札が在る → __fakeNow 01:00:10 → onTapPlazaDoor() → #plazaScreen は開かない・店じまいのオーバーレイを経る・その後 #tavernDoor_plaza が DOM から消える',
        pre.door && pre.h === 0 && armed && ovSeen && ovDone && gone && !r.open && !r.stage && !r.door && r.h === 1, { pre, armed, ovSeen, ovDone, gone, after: r });
    } finally { await t.close(); }
  }
  /* (4b) 港町経由・昼 (plazaClock = 12) */
  {
    const t = await openTab({ clock: '12', cls: 'warrior', gateSeen: false, enterVia: 'plaza', tag: '4b' });
    try {
      await gotoTavern(t.page);
      const ovSeen = await waitFn(t.page, overlayShown, 20000);
      await sleep(1500);
      const r = await t.page.evaluate(() => ({ open: window.__plazaTV.plazaOpen(), stage: !!document.querySelector('#plazaViewport .mwStage'),
        gate: window.__plazaTV.state().gatekeeperEventSeen, h: window.PLAZA_HOURS.hourNow() }));
      check('(4b)', null, '港町経由: plazaClock = 12 で enterVia = "plaza" を置いて tavern.html → 開かない (店じまいのオーバーレイを経る・門番の追い返しは経ない)',
        ovSeen && !r.open && !r.stage && r.gate === false && r.h === 12, Object.assign({ ovSeen }, r));
    } finally { await t.close(); }
  }
}

/* ══ §5 開いたまま境界をまたぐ + §6 中に居れば 1 時を過ぎても居られる (40 秒の待ちを並べて回す) ══ */
const WAIT_MS = 40000;    // TICK_MS 30 秒 + 余裕 10 秒
const TOWN_FAC = () => [...document.querySelectorAll('.townSign')].map((s) => s.getAttribute('data-facility'));
async function townCross(fromMs, toMs, wantAfter, tag) {
  const t = await openTab({ fakeAt: fromMs, tag });
  try {
    await gotoTown(t.page);
    const pre = await t.page.evaluate(TOWN_DOM);
    const preFac = await t.page.evaluate(TOWN_FAC);
    await t.page.evaluate((ms) => window.__fakeNow(ms), toMs);
    const t1 = Date.now();
    const changed = await waitFn(t.page, (w) => !!document.getElementById('townSign_plaza') === w, WAIT_MS, wantAfter);
    const sec = Math.round((Date.now() - t1) / 100) / 10;
    await sleep(300);
    const post = await t.page.evaluate(TOWN_DOM);
    const postFac = await t.page.evaluate(TOWN_FAC);
    return { pre, post, changed, sec, preFac, postFac };
  } finally { await t.close(); }
}
async function tavernCross(fromMs, toMs, wantAfter, tag) {
  const t = await openTab({ fakeAt: fromMs, tag });
  try {
    await gotoTavern(t.page);
    const pre = await t.page.evaluate(TAV_DOM);
    await t.page.evaluate((ms) => window.__fakeNow(ms), toMs);
    const t1 = Date.now();
    const changed = await waitFn(t.page, (w) => !!document.getElementById('tavernDoor_plaza') === w, WAIT_MS, wantAfter);
    const sec = Math.round((Date.now() - t1) / 100) / 10;
    const post = await t.page.evaluate(TAV_DOM);
    return { pre, post, changed, sec };
  } finally { await t.close(); }
}
async function stayInside() {
  const t = await openTab({ fakeAt: localMs(0, 59, 0), cls: 'warrior', tag: '6a' });
  try {
    await gotoTavern(t.page);
    await t.page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
    const opened = await waitFn(t.page, isOpenFn, 20000);
    await t.page.evaluate((ms) => window.__fakeNow(ms), localMs(1, 0, 30));
    await sleep(WAIT_MS);
    const mid = await t.page.evaluate(() => ({ open: window.__plazaTV.plazaOpen(), stage: !!document.querySelector('#plazaViewport .mwStage'),
      h: window.PLAZA_HOURS.hourNow(), door: !!document.getElementById('tavernDoor_plaza') }));
    let stall = null, press = null;
    if (mid.open) {
      press = await pressSign(t.page, 'plazaSign_potion');
      const arrived = await waitFn(t.page, () => window.__plazaTV.map.openStall() === 'potion' && !window.__plazaTV.map.isMoving(), 25000);
      stall = { arrived, openStall: await t.page.evaluate(() => window.__plazaTV.map.openStall()) };
    }
    return { opened, mid, press, stall };
  } finally { await t.close(); }
}
async function sec5and6() {
  console.log('\n--- §5 開いたまま境界をまたぐ / §6 中に居れば居られる (40 秒の待ちを並べて回す) ---');
  const [a5t, a5v, b5t, b5v, s6] = await Promise.all([
    townCross(localMs(19, 59, 0), localMs(20, 0, 10), true, '5a town'),
    tavernCross(localMs(19, 59, 0), localMs(20, 0, 10), true, '5a tavern'),
    townCross(localMs(0, 59, 0), localMs(1, 0, 10), false, '5b town'),
    tavernCross(localMs(0, 59, 0), localMs(1, 0, 10), false, '5b tavern'),
    stayInside(),
  ]);
  check('(5a)', 'town', 'Date 19:59 で town.html → 看板なし → __fakeNow 20:00:10 → 40 秒以内に #townSign_plaza が現れる',
    !a5t.pre.sign && a5t.changed && a5t.post.sign, { pre: a5t.pre, post: a5t.post, changed: a5t.changed, sec: a5t.sec });
  check('(5a)', 'tavern', 'Date 19:59 で tavern.html → 札なし → __fakeNow 20:00:10 → 40 秒以内に #tavernDoor_plaza が現れる',
    !a5v.pre.door && a5v.changed && a5v.post.door, a5v);
  check('(5b)', 'town', 'Date 00:59 で town.html → 看板あり → __fakeNow 01:00:10 → 40 秒以内に #townSign_plaza が消える (HUD も)',
    b5t.pre.sign && b5t.changed && !b5t.post.sign && !b5t.post.hud, { pre: b5t.pre, post: b5t.post, changed: b5t.changed, sec: b5t.sec });
  check('(5b)', 'tavern', 'Date 00:59 で tavern.html → 札あり → __fakeNow 01:00:10 → 40 秒以内に #tavernDoor_plaza が消える',
    b5v.pre.door && b5v.changed && !b5v.post.door, b5v);
  const dup = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);
  check('(5c)', null, '港町で作り直した後も plaza は [data-facility="plaza"] がちょうど 2 個 (看板 1 + HUD 1)・他の看板も二重になっていない (5a の後 / 5b の後は 0 個)',
    a5t.changed && a5t.post.n === 2 && dup(a5t.postFac).length === 0 && a5t.postFac.length === a5t.preFac.length + 1
      && b5t.changed && b5t.post.n === 0 && dup(b5t.postFac).length === 0 && b5t.postFac.length === b5t.preFac.length - 1,
    { after5a: { n: a5t.post.n, fac: a5t.postFac, before: a5t.preFac.length }, after5b: { n: b5t.post.n, fac: b5t.postFac, before: b5t.preFac.length } });
  check('(6a)', null, '00:59 に入る → __fakeNow 01:00:30 → 40 秒待つ → #plazaScreen は開いたまま・露店の札 (plazaSign_potion) を押して歩ける (openStall が立つ)',
    s6.opened && s6.mid.open && s6.mid.stage && s6.mid.h === 1 && !!s6.stall && s6.stall.arrived && s6.stall.openStall === 'potion', s6);
}

/* ══ §7 杖の供給が止まる (7a)(7c) + (0a) index + (7b) ══ */
function wandDefOf(src) {
  const ms = [...src.matchAll(/wand_polymorph:\s*\{\s*name:[\s\S]*?\}\s*,/g)];
  return ms.length === 1 ? { n: 1, body: ms[0][0] } : { n: ms.length, body: null };
}
async function sec7() {
  console.log('\n--- §7 杖の供給が止まる ---');
  /* (7a) */
  {
    const t = await openTab({ clock: '21', tag: '7a' });
    try {
      await gotoTavern(t.page);
      const r = await t.page.evaluate(() => {
        let wand = 0, heal = 0;
        for (let i = 0; i < 50; i++) {
          window.__plazaTV.refreshPlazaStock();
          const s = window.__plazaTV.getStock();
          if (s.some((x) => x.itemId === 'wand_polymorph')) wand++;
          if (s.some((x) => x.itemId === 'potion_healing' && x.kind === 'always')) heal++;
        }
        return { wand, heal, nightOn: window.__plazaTV.nightOn() };
      });
      check('(7a)', null, '夜の関門 (撤退なし) で refreshPlazaStock() を 50 回 → 在庫に wand_polymorph が 0 回 (母集団: potion_healing (always) は 50 回)',
        r.nightOn === true && r.wand === 0 && r.heal === 50, r);
    } finally { await t.close(); }
  }
  /* (7c) ソースのバイト + 実行時 */
  {
    const tv = wandDefOf(SNAP['tavern.html']), ix = wandDefOf(SNAP['index.html']);
    const okDef = (d) => d.n === 1 && /\bretired:\s*true\b/.test(d.body) && d.body.indexOf('入場') < 0;
    const t = await openTab({ clock: '21', tag: '7c' });
    let rt = null;
    try {
      await gotoTavern(t.page);
      rt = await t.page.evaluate(() => (typeof PLAZA_ITEMS_TV !== 'undefined' && PLAZA_ITEMS_TV.wand_polymorph) ? PLAZA_ITEMS_TV.wand_polymorph.retired : null);
    } finally { await t.close(); }
    check('(7c)', null, '配信した tavern.html / index.html の wand_polymorph の定義 (各 1 個) に retired: true・効果文に「入場」の語が無い・実行時 PLAZA_ITEMS_TV.wand_polymorph.retired === true',
      okDef(tv) && okDef(ix) && rt === true, { tavern: tv.body && tv.body.replace(/\s+/g, ' '), index: ix.body && ix.body.replace(/\s+/g, ' '), nT: tv.n, nI: ix.n, runtimeRetired: rt });
  }
  /* (0a) index + (7b) */
  {
    const t = await openTab({ clock: '21', wandDrop: true, tag: '7b index' });
    try {
      await gotoBlank(t.page);
      await gotoIndex(t.page);
      const a = await t.page.evaluate(PH_FN);
      check('(0a)', 'index', 'index.html に window.PLAZA_HOURS が在り OPEN_HOUR === 20 && CLOSE_HOUR === 1', a.has && a.open === 20 && a.close === 1, a);
      const r = await t.page.evaluate(DROP_FN);
      check('(7b)', null, 'index.html で plazaState.wandDropEnabled = true・Math.random = () => 0・ボス ({ def: { isBoss: true } }) で maybeGrantPolymorphWand → 杖が増えない',
        r.wandDropEnabled === true && r.on === true && r.before === 0 && r.after === 0, r);
    } finally { await t.close(); }
  }
}

/* ══ §8 恒等 / §9 罠 B ══ */
async function sec8and9(fetchText) {
  console.log('\n--- §8 恒等 / §9 罠 B ---');
  for (const f of ['js/plaza-map.js', 'js/town-map.js', 'js/tavern-map.js']) {
    const blobHash = git(['rev-parse', BASE_REV + ':' + f]).trim();
    const wtHash = git(['hash-object', '--path', f, path.join(ROOT, f)]).trim();
    const baseBytes = git(['show', BASE_REV + ':' + f], null);
    const served = Buffer.from(await (await fetch(URL0 + '/' + f)).arrayBuffer());
    const servedLF = Buffer.from(served.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    check('(8a)', null, f + ' のバイトが ' + BASE_REV + ' と一致 (hash-object --path == rev-parse・配信バイトの CRLF→LF == git show)',
      blobHash === wtHash && Buffer.compare(servedLF, baseBytes) === 0, { blobHash: blobHash.slice(0, 10), wtHash: wtHash.slice(0, 10), served: served.length, base: baseBytes.length });
  }
  for (const f of ['tavern.html', 'index.html']) {
    const src = await fetchText(f);
    const m = [...src.matchAll(/const PLAZA_UNLOCK_QUEST_COUNT = (\d+);/g)].map((x) => x[1]);
    check('(8b)', null, '配信 ' + f + ' のソースに PLAZA_UNLOCK_QUEST_COUNT = 5 がちょうど 1 個', eq(m, ['5']), m);
  }
  const tv = await fetchText('tavern.html');
  const hits = tv.split(TRAP_B_LINE + '\r\n').length - 1;
  const hitsAny = tv.split(TRAP_B_LINE).length - 1;
  check('(9a)', null, '配信中の tavern.html のバイトに「' + TRAP_B_LINE.trim() + '」(行頭の空白 8 個・行末まで) がちょうど 1 回在る', hits === 1 && hitsAny === 1, { lineHits: hits, substrHits: hitsAny });
}

/* ══ §X 撤退 ══ */
async function secX() {
  console.log('\n--- §X 撤退 (?plazanight=0) ---');
  /* (Xa) */
  {
    const t = await openTab({ clock: '12', tag: 'Xa' });
    try {
      await gotoTown(t.page, '?plazanight=0');
      const tw = await t.page.evaluate(TOWN_DOM);
      await gotoTavern(t.page, '');
      const tv = await t.page.evaluate(TAV_DOM);
      const ph = await t.page.evaluate(PH_FN);
      check('(Xa)', null, 'town.html?plazanight=0・昼 (12)・unlocked: true → 看板が在る → 同じタブで (クエリ無しの) tavern.html へ → 石段の札が在る (遷移をまたぐ)',
        tw.sign && tv.door && ph.on === false && ph.h === 12, { town: tw, tavern: tv, ph });
    } finally { await t.close(); }
  }
  /* (Xb) */
  {
    const t = await openTab({ clock: '12', cls: 'warrior', wands: null, gateSeen: false, tag: 'Xb' });
    try {
      await gotoTavern(t.page, '?plazanight=0');
      await t.page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
      const flipped = await waitFn(t.page, () => window.__plazaTV.state().gatekeeperEventSeen === true, 20000);
      await waitFn(t.page, overlayHidden, 40000);
      await sleep(500);
      const r = await t.page.evaluate(() => ({ open: window.__plazaTV.plazaOpen(), gate: window.__plazaTV.state().gatekeeperEventSeen, nightOn: window.__plazaTV.nightOn() }));
      check('(Xb)', null, '撤退・戦士・杖 0 → onTapPlazaDoor() → 開かない・gatekeeperEventSeen false → true (#101 までの追い返し)',
        flipped && !r.open && r.gate === true && r.nightOn === false, Object.assign({ flipped }, r));
    } finally { await t.close(); }
  }
  /* (Xc) */
  {
    const t = await openTab({ clock: '12', cls: 'warrior', wands: [3], wandDrop: true, tag: 'Xc' });
    try {
      await gotoTavern(t.page, '?plazanight=0');
      await t.page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
      const ok = await waitFn(t.page, isOpenFn, 20000);
      const r = await t.page.evaluate(() => {
        const inv = (window.__plazaTV.inv().wand_polymorph || null);
        window.__plazaTV.refreshPlazaStock();
        const s = window.__plazaTV.getStock();
        return { inv: inv && inv.slice(), always: s.some((x) => x.itemId === 'wand_polymorph' && x.kind === 'always') };
      });
      await gotoIndex(t.page);
      const d = await t.page.evaluate(DROP_FN);
      check('(Xc)', null, '撤退・杖 [3] → 入れる・杖が [2] に減る・refreshPlazaStock() の在庫に wand_polymorph (always) が在る・同じタブの index.html で (7b) と同じ条件 → 杖が 1 本増える',
        ok && eq(r.inv, [2]) && r.always && d.on === false && d.wandDropEnabled === true && d.after === d.before + 1, { opened: ok, tavern: r, index: d });
    } finally { await t.close(); }
  }
  /* (Xd) */
  {
    const t = await openTab({ clock: '12', tag: 'Xd' });
    try {
      await gotoTown(t.page, '?plazanight=0');
      const a = await t.page.evaluate(TOWN_DOM);
      await gotoTown(t.page, '?plazanight=1');
      const b = await t.page.evaluate(TOWN_DOM);
      const ph = await t.page.evaluate(PH_FN);
      const off = await t.page.evaluate(() => sessionStorage.getItem('dragonfighters.plazaNightOff'));
      await gotoTavern(t.page, '');
      const tv = await t.page.evaluate(TAV_DOM);
      check('(Xd)', null, '?plazanight=0 (看板あり) → ?plazanight=1 で夜の関門へ戻る (昼 12 は看板なし・同じタブの tavern.html も札なし・plazaNightOff が消える)',
        a.sign && !b.sign && !b.hud && ph.on === true && off === null && !tv.door, { night0: a, night1: b, ph, off, tavern: tv });
    } finally { await t.close(); }
  }
}

/* ══ 本体 ══ */
(async () => {
  if (NEGATIVE) console.log('[driver] 変異 ' + ONLY[0] + ' で走行');
  console.log('[driver] 実時刻 ' + hhmm(Date.now()) + ' (⭐ 結果はこの時刻に依らない: 全腕で plazaClock か Date の差し替えで時刻を固定)');
  let server;
  try { server = await startServer(); }
  catch (e) { console.error('[driver] port ' + PORT + ' を開けません (' + e.code + ')。孤児の node が掴んでいないか確認'); process.exit(2); }
  const fetchText = async (rel) => (await fetch(URL0 + '/' + rel)).text();

  const pptr = loadPuppeteer();
  try { browser = await pptr.launch({ executablePath: findBrowser(), headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); }
  catch (e) { console.error('[driver] ブラウザ起動に失敗: ' + e.message); try { server.close(); } catch (x) {} process.exit(2); }
  try {
    await sec8and9(fetchText);
    await sec0();
    await sec1b();
    await sec2();
    await sec3();
    await sec4();
    await sec5and6();
    await sec7();
    await secX();
    check('(err)', null, 'pageerror (捕まらなかった例外) 0 件', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | ') || '(なし)');
  } catch (e) {
    console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
    results.push({ label: '(fatal)', scr: null, name: String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) {}
  }

  /* ══ 集計 ══ */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const labels = Array.from(new Set(results.map((r) => r.label)));
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   節 ' + labels.length + '   (' + Math.round((Date.now() - T0) / 1000) + ' 秒)');
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.label + (r.scr ? ' [' + r.scr + ']' : '') + ' ' + r.name.slice(0, 100) + '  -- ' + String(r.detail).slice(0, 300)));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = MUTATIONS[tag].expect;
    const bad = results.filter((r) => !r.ok);
    const redKeys = new Set();
    bad.forEach((r) => { redKeys.add(r.label); if (r.scr) redKeys.add(r.label + '@' + r.scr); });
    const red = Array.from(new Set(bad.map((r) => r.label + (r.scr ? '@' + r.scr : ''))));
    const miss = want.filter((w) => !w.split('|').some((alt) => redKeys.has(alt)));
    const wantBase = new Set(want.join('|').split('|').map((w) => w.split('@')[0]));
    const extra = Array.from(new Set(bad.map((r) => r.label))).filter((l) => !wantBase.has(l));
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)'));
    console.log('[driver]   担当外の巻き込み: ' + (extra.length ? extra.join(',') : 'なし'));
    if (miss.length) { console.error('[driver] ✗ ' + tag + ' の担当の節が赤くなりませんでした (空振り): ' + miss.join(',')); process.exit(1); }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
