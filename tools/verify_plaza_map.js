/* verify_plaza_map.js — #98 闇市の地下街 (歩ける地図・露店 4 軒・掲示板・出口 2 つ・灯りの輪) の受入
 *
 *   node tools/verify_plaza_map.js                         ← 素の受入 (依頼書 §8 の全 assert)
 *   node tools/verify_plaza_map.js --negative              ← 負のコントロール 10 本 (1 本ずつ子プロセスで順に)
 *   node tools/verify_plaza_map.js --negative --only reclick
 *
 * 依頼書: 実装依頼書/2026-10-21_plaza-undercity-map.md §8。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 本番の tavern.html を実 Chrome (puppeteer-core) で開く。配信バイトは起動時に凍結する
 *    (tavern.html / js/map-walk.js / js/plaza-map.js ほかは起動時、残りは初回アクセス時)。
 *  - 種 = 解禁済み + 変装の杖 (warrior)。闇市へは**酒場の地図の石段の札 tavernDoor_plaza を押して**入る
 *    ((4a)。押せなければ el.click で押し、その旨を detail に書く)。2 回目以降は __plazaTV.onTapPlazaDoor()。
 *  - 札とタイルは clientFromTile → page.mouse.click で実際に押す。画面外の札 (compact) だけ el.click。
 *    経路はブラウザの PLAZA_MAP.findPath を呼ぶ (⛔ 自前の BFS を書かない)。
 *  - desktop 1440x900 / compact 390x844 (isMobile + hasTouch) の 2 つで見る。
 *  - ⭐ (0a) が赤なら以降は測らず、全ラベルを赤で記録する (空振りの永久緑を作らない)。
 *  - ⛔ 灯りの半径・濃さ・色 / fps / 札の文言 / 歩く速さの数値は測らない (依頼書 §8 ⛔)。
 *
 * ── 依頼書 §8 からの言い直し (notes98_item3.md に同じ記録) ──────────────────
 *  (1d) 「主人公が見える・1 マス 34〜96px」だけでは変異 nolayout が空振りする
 *       (layout() を呼ばないと zoom は初期値 1 = 1 マス 64px で、範囲に入ってしまう)。
 *       ⇒ 「layout() が走った証拠」を AND で足す: desktop = 地図全体が viewport に収まり、縦か横が
 *          ちょうど viewport に一致 / compact = 縦か横が可視域に一致するか、1 マスが下限 34 / 上限 96。
 *  (1e) 立ち位置 (2,2) から薬屋で測る (古物商は 22 マス = 7.5 秒で 5 秒に収まらない)。desktop で実クリック。
 *  (3c) 暗幕は pointer-events:none なので elementFromPoint は暗幕を素通りする = 札が暗幕の**下**に
 *       描かれていても札が返る (変異 signunder が空振りする)。⇒ 2 腕の AND にした:
 *         (i)  そのままの elementFromPoint が札 (= 押せる)
 *         (ii) 測る間だけ暗幕を当たり判定に入れて (inline の pointer-events を auto → 直後に戻す)、
 *              それでも札が返る (= 札が暗幕より上に描かれている = 暗がりでも見える)
 *       compact は「歩いて寄りながら、画面内に入った札を測る」。立ち位置 → (5,6) → (11,7) → (17,7) で
 *       7 枚の和集合が全部になること自体も assert に含める。
 *       「灯りの外に居る札」= 主人公から 7 マス以上離れた札 (灯りの初期値 外 384px = 6 マス) を 1 枚以上含む。
 *  (3d) 札の矩形は全部 (画面外も) 比べる。どの札も同じ舞台の transform に乗るので交差は camera によらない。
 *  (4a) 酒場の石段 = tavernDoor_plaza を押して歩いて入る経路で測った (依頼書どおり)。
 *  (4e) ★[#102] 言い直し: 「昼 (sessionStorage plazaClock = 12) は港町から来ても開かない」= 店じまいの一言
 *       (#prologueOverlay) を経て、#plazaScreen は閉じたまま・gatekeeperEventSeen は false のまま (門番の追い返しを経ない)。
 *       #101 までの「杖 0・戦士 → 門番の追い返し (gatekeeperEventSeen false → true)」は夜の関門では仕様どおり開くので、
 *       その検査は verify_plaza_hours.js の撤退節 (Xb) (?plazanight=0) が引き継ぐ。
 *  ★[#102] 種まきで sessionStorage plazaClock = 21 (夜) に固定する (時刻で結果が揺れないため・依頼書 §2-2 罠 A)。
 *  (5a)〜(5c) は git show c310d8c:<file> と CRLF→LF に揃えてから比べる (作業ツリーは CRLF・blob は LF)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 *  - 1 本ずつ子プロセスで順に回す (同時注入は互いを覆い隠す)。port は 10637 だけを順に使う。
 *  - アンカーは**手つかずの原本**で 1 件ちょうどを起動時に確かめる (素の走行でも)。0 件 / 2 件以上 /
 *    置換前後が同じ長さ / 改行を含む / 他の tools/*.js のソースに同じ文字列がある (罠E) なら exit 3。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は一覧に出す。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 (puppeteer / ブラウザ / ポート / git) / 3 = 変異アンカーの腐敗
 * port: 10637 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
 * ⚠ git が要る (c310d8c を git show で読む)。走行中に本番を編集しないこと (起動時に凍結)。
 * ⛔ timeout コマンドで包まない (孤児の node がポートを掴む)。長い走行は PowerShell の背景実行で。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10637'), 10);
/* #98 の基準 (#97 完了・push 済)。⛔ HEAD にしない (commit した瞬間に自分との比較になる) */
const BASE_REV = 'c310d8c';
const LEDGER_PY  = 'tools/make_grid_map.py';
const LEDGER_KEY = 'plaza-undercity';

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
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
const KEY_FILES = ['tavern.html', 'js/map-walk.js', 'js/plaza-map.js', 'town.html', 'js/town-map.js',
                   'js/tavern-map.js', 'js/npc-crowd.js', 'index.html', LEDGER_PY];
for (const rel of KEY_FILES) {
  if (!frozen(rel)) { console.error('[driver] ' + rel + ' が読めません'); process.exit(2); }
}
const PRISTINE = {};
for (const rel of ['tavern.html', 'js/map-walk.js', 'js/plaza-map.js']) PRISTINE[rel] = frozen(rel).toString('utf8');

/* 基準の木 (c310d8c) のバイト ((5a)〜(5c))。⚠ blob は LF・作業ツリーは CRLF ⇒ 比較は LF に揃えてから */
const BASE = {};
for (const rel of ['tavern.html', 'js/tavern-map.js', 'js/town-map.js', 'town.html', 'index.html', 'js/npc-crowd.js']) {
  try { BASE[rel] = execFileSync('git', ['show', BASE_REV + ':' + rel], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { console.error('[driver] git show ' + BASE_REV + ':' + rel + ' が読めません: ' + String(e.message || e).slice(0, 200)); process.exit(2); }
}

/* 変異 (依頼書 §8 の表)。edits = [[file, anchor, patch], ...]。⚠ アンカーも置換も 1 行に収める */
const MUTATIONS = {
  filteridx: { expect: ['(2c)'], why: '⭐ 罠 B: renderPlazaShop が開いた露店の行だけを描き、data-idx を露店の中で 0 から振る (openStall で描き直す)',
    edits: [
      ['tavern.html', 'stock.forEach((s, i) => {',
       'let _mutJ = 0; stock.forEach((s, i) => { if (plazaOpenStallTV && window.PLAZA_MAP.stallOf(s.itemId) !== plazaOpenStallTV) return; i = _mutJ++;  /* mut-filteridx */'],
      ['tavern.html', 'shop.setAttribute("data-open-stall", key);',
       'shop.setAttribute("data-open-stall", key); plazaOpenStallTV = key; renderPlazaShop();  /* mut-filteridx */'],
    ] },
  missingitem: { expect: ['(2a)'], why: 'STALLS から pearl_of_power を 1 つ外す',
    edits: [['js/plaza-map.js', '"wand_polymorph", "wand_magic_missiles", "pearl_of_power"]', '"wand_polymorph", "wand_magic_missiles"]  /* mut-missingitem */']] },
  reclick: { expect: ['(1e)'], why: '⭐ 罠 A: 同じ行き先の再クリックを吸収しない',
    edits: [['js/map-walk.js', 'if (k !== null && walkingTo === k) return true;', '/* mut-reclick: 再クリックを吸収しない */']] },
  nolayout: { expect: ['(1d)'], why: 'openPlazaScreen の後の layout() を呼ばない (隠れていたときの寸法のまま)',
    edits: [['tavern.html', '    plazaWalkTV.layout();', '    /* mut-nolayout */']] },
  lightblock: { expect: ['(1c)', '(3a)'], why: '暗幕の pointer-events を auto にする',
    edits: [['js/map-walk.js', 'elLight.style.pointerEvents = "none";', 'elLight.style.pointerEvents = "auto";  /* mut-lightblock */']] },
  signunder: { expect: ['(3c)'], why: '札の z-index を暗幕 (5) より下にする',
    edits: [['js/map-walk.js', 's.style.zIndex = "6";', 's.style.zIndex = "4";  /* mut-signunder */']] },
  wrongvia: { expect: ['(4b)'], why: '港町への石段で exitVia に "tavern" を書く',
    edits: [['tavern.html', 'sessionStorage.setItem("dragonfighters.exitVia", "plaza");', 'sessionStorage.setItem("dragonfighters.exitVia", "tavern");  /* mut-wrongvia */']] },
  townleak: { expect: ['(4c)'], why: '?town=0 でも石段の札を作る',
    edits: [['tavern.html', 'if (ex.to && window.__townOff) return;', '/* mut-townleak */']] },
  blockenter: { expect: ['(1b)'], why: 'マスクの (14,6) を s にする (杖屋に入れない)',
    edits: [['js/plaza-map.js', '"W..................W~xW"', '"W.............s....W~xW" /* mut-blockenter */']] },
  noretreat: { expect: ['(6a)'], why: 'isUndercityOnTV() が常に true',
    edits: [['tavern.html', 'return new URLSearchParams(location.search).get("undercity") !== "0";', 'return true;  /* mut-noretreat */']] },
};
const MUT_ORDER = ['filteridx', 'missingitem', 'reclick', 'nolayout', 'lightblock', 'signunder', 'wrongvia', 'townleak', 'blockenter', 'noretreat'];

/* 起動時の検算 (素の走行でも必ず): 原本で 1 件ちょうど / 置換前後で長さが違う / 改行なし / 他ドライバのソースに無い */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self)
    .map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  for (const k of MUT_ORDER) {
    for (const [file, anchor, patch] of MUTATIONS[k].edits) {
      const hits = PRISTINE[file].split(anchor).length - 1;
      if (hits !== 1) {
        console.error('[driver] 負のコントロール ' + k + ' の注入点が ' + file + ' に ' + hits + ' 箇所 (期待 1)。変異は無効です: ' + anchor.slice(0, 160));
        process.exit(3);
      }
      if (anchor === patch || anchor.length === patch.length || /[\r\n]/.test(anchor + patch)) {
        console.error('[driver] ' + k + ' は置換前後が同一 / 同じバイト長 / 改行を含みます'); process.exit(3);
      }
      if (PRISTINE[file].indexOf(patch) >= 0) { console.error('[driver] ' + k + ' の置換文字列が原本に既に在る'); process.exit(3); }
      const clash = peers.filter((x) => x.s.indexOf(anchor.trim()) >= 0).map((x) => x.f);
      if (clash.length) { console.error('[driver] 変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(',')); process.exit(3); }
    }
  }
}
for (const k of ONLY) if (!MUTATIONS[k]) { console.error('[driver] 未知の --only: ' + k + '  (' + MUT_ORDER.join(',') + ')'); process.exit(3); }

const INJECTED = [];
function inject(tag) {
  const m = MUTATIONS[tag];
  const work = {};
  for (const [file, anchor, patch] of m.edits) {
    const s = work[file] !== undefined ? work[file] : PRISTINE[file];
    const now = s.split(anchor).length - 1;
    if (now !== 1) { console.error('[driver] ' + tag + ': 先行の置換の後で注入点が ' + now + ' 箇所 (期待 1)'); process.exit(3); }
    work[file] = s.split(anchor).join(patch);
  }
  for (const file of Object.keys(work)) SNAP.set(file, Buffer.from(work[file], 'utf8'));
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + tag + ' を注入しました (' + m.why + ' / 置換 ' + m.edits.length + ' 本)');
}

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const bad = [], summary = [];
  const t0 = Date.now();
  console.log('[driver] --negative (一括): ' + MUT_ORDER.join(',') + ' を 1 本ずつ順に走らせます (port ' + PORT + ' を順に使う)');
  for (const tag of MUT_ORDER) {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const t1 = Date.now();
    const r = spawnSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    const m = (r.stdout || '').match(/\[driver\] --negative \S+: 担当=([^\s]*) \/ 実際に赤くなった=([^\n]*)/);
    summary.push(tag + ': exit ' + r.status + ' (' + Math.round((Date.now() - t1) / 1000) + ' 秒)' + (m ? '  担当=' + m[1] + '  赤=' + m[2].trim() : ''));
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  }
  console.log('\n[driver] ── --negative 総括 (' + Math.round((Date.now() - t0) / 1000) + ' 秒) ──');
  summary.forEach((s) => console.log('   ' + s));
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + MUT_ORDER.length + ' 本すべて担当の節が赤くなりました (空振り 0)');
  process.exit(0);
}
if (NEGATIVE) {
  if (ONLY.length !== 1) { console.error('[driver] --only には変異を 1 つ: ' + MUT_ORDER.join(',')); process.exit(1); }
  inject(ONLY[0]);
}

/* ══════════════════════════════════════════════════════════════════════════
 * 器 (サーバ・ブラウザ)
 * ══════════════════════════════════════════════════════════════════════════ */
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
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        const buf = frozen(rel);
        if (!buf) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        rs.setHeader('Cache-Control', 'no-store');
        rs.end(buf);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 判定の記録
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  const ok = !!cond;
  const d = detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
  results.push({ name, ok, detail: d });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (d ? '  -- ' + d.slice(0, 700) : ''));
}
const ALL_LABELS = ['(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)', '(2d)', '(2e)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(4b)', '(4c)', '(4d)', '(4e)', '(5a)', '(5b)', '(5c)', '(6a)', '(9a)'];
const ALL_SIGNS = ['board', 'curio', 'potion', 'summon', 'tavern', 'town', 'wand'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pageErrors = [];
function watchErrors(page, tag) {
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    if (/\[DIAG\]/.test(m.text())) return;
    pageErrors.push(tag + ' :: CONSOLE ' + m.text() + ' ' + url);
  });
}
const VP = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  compact: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
/* 種: 解禁済み・初回のナレ済み + 変装の杖 (seed.wands)。sessionStorage の印で 1 回だけまく (港町へ移ってもまき直さない) */
async function openTavern(browser, vpName, qs, seed) {
  const page = await browser.newPage();
  watchErrors(page, vpName + ' tavern' + (qs || '') + (seed && seed.tag ? ' [' + seed.tag + ']' : ''));
  await page.setViewport(VP[vpName]);
  await page.evaluateOnNewDocument((sd) => {
    try {
      if (sessionStorage.getItem('__pmSeeded')) return;
      sessionStorage.setItem('__pmSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
      kill.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify([sd.cls]));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.plazaState', JSON.stringify({ unlocked: true, everEntered: true, gatekeeperEventSeen: sd.gateSeen }));
      sessionStorage.setItem('dragonfighters.plazaClock', sd.clock);   /* ★[#102] 闇市は夜だけ開く。時計で揺れないよう夜 (21) に固定。(4e) だけ昼 (12) */
      if (sd.wands) localStorage.setItem('dragonfighters.plazaInventory', JSON.stringify({ wand_polymorph: sd.wands }));
      if (sd.enterVia) sessionStorage.setItem('dragonfighters.enterVia', sd.enterVia);
    } catch (e) {}
  }, Object.assign({ cls: 'warrior', wands: [3, 3, 3, 3, 3, 3], gateSeen: true, enterVia: null, clock: '21' }, seed || {}));
  await page.goto('http://localhost:' + PORT + '/tavern.html' + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__plazaTV && typeof window.__plazaTV.onTapPlazaDoor === 'function', { timeout: 60000 });
  await sleep(600);
  return page;
}
async function waitFn(page, fn, ms, a) { try { await page.waitForFunction(fn, { timeout: ms || 15000, polling: 50 }, a); return true; } catch (e) { return false; } }
const isOpenFn = () => window.__plazaTV.plazaOpen() && !!document.querySelector('#plazaViewport .mwStage');
async function enterByBridge(page) {
  await page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
  const ok = await waitFn(page, isOpenFn, 15000);
  await sleep(200);
  return ok;
}
/* 札を押す: 中心が画面内で elementFromPoint が札自身なら実クリック、そうでなければ el.click() */
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
/* 地図のタイル (c,r) へ実クリックで歩く。画面外なら findPath の経路上で画面内の一番先のタイルを押して寄る (繰り返す)。
   返す: { ok, hops, unders (押した点の要素の class), bad (押せる点が無い等) } */
async function walkByClicks(page, c, r) {
  const out = { ok: false, hops: 0, unders: [], bad: null };
  for (let hop = 0; hop < 14; hop++) {
    const pick = await page.evaluate((tc, tr) => {
      const m = window.__plazaTV.map, PM = window.PLAZA_MAP;
      const h = m.heroTile();
      if (h.c === tc && h.r === tr) return { done: true };
      const p = PM.findPath(h.c, h.r, tc, tr);
      if (!p) return { err: 'findPath null ' + JSON.stringify(h) };
      const stage = document.querySelector('#plazaViewport .mwStage');
      for (let i = p.length - 1; i >= 0; i--) {
        const q = m.clientFromTile(p[i].c, p[i].r);
        if (q.x < 8 || q.y < 8 || q.x > innerWidth - 8 || q.y > innerHeight - 8) continue;
        const e = document.elementFromPoint(q.x, q.y);
        if (!e || !stage.contains(e) || e.closest('.mwSign')) continue;
        /* ★[#100] 住人の近く (矩形 +24px) は押さない。住人は押すと伝播を止める = 主人公が歩かない。
           動いているので選んだ瞬間と押す瞬間の差 (数 ms) を 24px で吸う。 */
        if ([].some.call(document.querySelectorAll('.mwNpc'), function (n) { const b = n.getBoundingClientRect();
              return q.x > b.left - 24 && q.x < b.right + 24 && q.y > b.top - 24 && q.y < b.bottom + 24; })) continue;
        return { t: p[i], x: q.x, y: q.y, under: String(e.className || e.tagName) };
      }
      return { err: '画面内に押せる経路のタイルが無い ' + JSON.stringify(h) };
    }, c, r);
    if (pick.done) { out.ok = true; return out; }
    if (pick.err) { out.bad = pick.err; return out; }
    await page.mouse.click(pick.x, pick.y);      // ⭐ pick と click の間に何も挟まない
    out.hops++; out.unders.push(pick.under);
    const arrived = await waitFn(page, (t) => { const m = window.__plazaTV.map; const h = m.heroTile(); return h.c === t.c && h.r === t.r && !m.isMoving(); }, 20000, pick.t);
    if (!arrived) { out.bad = '着かない ' + JSON.stringify(pick.t); return out; }
  }
  out.bad = 'hop 上限'; return out;
}

/* (3c) 画面内の札それぞれ: (i) そのままの elementFromPoint / (ii) 暗幕を当たり判定に入れても札が返るか */
function signProbe() {
  const m = window.__plazaTV.map;
  const light = document.querySelector('#plazaViewport .mwLight');
  const h = m.heroTile();
  const out = [];
  for (const k of m.signKeys()) {
    const s = document.getElementById('plazaSign_' + k); if (!s) continue;
    const b = s.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
    if (x < 4 || y < 4 || x > innerWidth - 4 || y > innerHeight - 4) continue;
    const e1 = document.elementFromPoint(x, y);
    const prev = light ? light.style.pointerEvents : null;
    if (light) light.style.pointerEvents = 'auto';
    const e2 = document.elementFromPoint(x, y);
    if (light) light.style.pointerEvents = prev;
    const t = window.PLAZA_MAP.STALLS.concat([window.PLAZA_MAP.BOARD], window.PLAZA_MAP.EXITS).find((f) => f.key === k);
    const dist = t ? Math.hypot(t.sign[0] - h.c, t.sign[1] - h.r) : null;
    out.push({ k, i: !!e1 && (e1 === s || s.contains(e1)), ii: !!e2 && (e2 === s || s.contains(e2)),
      e1: e1 ? String(e1.className || e1.tagName) : null, e2: e2 ? String(e2.className || e2.tagName) : null, dist: dist && Math.round(dist * 10) / 10 });
  }
  return out;
}
function signRects() {
  const rs = [...document.querySelectorAll('#plazaViewport .mwSign')].map((s) => { const b = s.getBoundingClientRect(); return { k: s.getAttribute('data-key'), l: b.left, t: b.top, r: b.right, b: b.bottom }; });
  const hits = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], c = rs[j];
    if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) hits.push(a.k + 'x' + c.k);
  }
  return { n: rs.length, hits, zeroSize: rs.filter((x) => x.r - x.l < 4 || x.b - x.t < 4).map((x) => x.k) };
}
function lightFootGap() {
  const m = window.__plazaTV.map;
  const lc = m.lightCenter();
  const hr = document.querySelector('#plazaViewport .mwHero').getBoundingClientRect();
  const foot = { x: hr.left + hr.width / 2, y: hr.top + hr.height * window.MAP_WALK.FOOT };
  const t = m.heroTile(); const tc = m.clientFromTile(t.c, t.r);
  const r2 = (v) => Math.round(v * 100) / 100;
  return { dx: r2(Math.abs(lc.x - foot.x)), dy: r2(Math.abs(lc.y - foot.y)), dtx: r2(Math.abs(lc.x - tc.x)), dty: r2(Math.abs(lc.y - tc.y)), tile: t };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1 つの viewport の通し (酒場の石段から入る → 地図・灯り・札・露店・出口)
 * ══════════════════════════════════════════════════════════════════════════ */
async function mainFlow(browser, vpName) {
  const L = '[' + vpName + '] ';
  const page = await openTavern(browser, vpName, '');
  /* ── (4a) 酒場の地図の石段の札を押して入る ── */
  const pre = await page.evaluate(() => ({ TV: !!window.__TAVERN_TV, door: !!document.getElementById('tavernDoor_plaza'),
    PM: !!window.PLAZA_MAP, MW: !!window.MAP_WALK && typeof window.MAP_WALK.create === 'function', mapOn: !!(window.__plazaTV.map && window.__plazaTV.map.on) }));
  const doorPress = pre.door ? await pressSign(page, 'tavernDoor_plaza') : { missing: true };
  const opened = await waitFn(page, isOpenFn, 30000);
  await sleep(300);
  const st = await page.evaluate(() => {
    const m = window.__plazaTV.map;
    const vp = document.getElementById('plazaViewport');
    return { tile: m.heroTile && m.heroTile(), tvTile: window.__TAVERN_TV ? window.__TAVERN_TV.heroTile() : null,
      stage: !!(vp && vp.querySelector('.mwStage')), hero: !!(vp && vp.querySelector('.mwHero')),
      lights: vp ? vp.querySelectorAll('.mwLight').length : 0, signs: vp ? [...vp.querySelectorAll('.mwSign')].map((s) => s.getAttribute('data-key')).sort() : [],
      first: (document.getElementById('plazaScreen').firstElementChild || {}).id || null };
  });
  check('(0a) ' + L + 'PLAZA_MAP / MAP_WALK が tavern.html から見える。闇市を開くと #plazaViewport (#plazaScreen の最初の子) の中に舞台・主人公・暗幕 1 枚・札 7 枚',
    pre.PM && pre.MW && pre.mapOn && opened && st.stage && st.hero && st.lights === 1 && st.signs.join() === ALL_SIGNS.join() && st.first === 'plazaViewport',
    { pre, opened, st });
  if (!results[results.length - 1].ok) { await page.close(); return { fatal: true }; }
  check('(4a) ' + L + '酒場の地図の石段 (tavernDoor_plaza) から入ると (2,2) に立つ (押し方: ' + (doorPress.elClick ? 'el.click = 画面外/覆われ' : '実クリック') + ')',
    st.tile && st.tile.c === 2 && st.tile.r === 2, { tile: st.tile, tvTile: st.tvTile, press: doorPress });
  const tvTileBefore = st.tvTile;

  /* ── (1d) 開いた直後: 主人公が viewport 内・1 マス 34〜96px・layout() が走った証拠 ── */
  const g = await page.evaluate(() => {
    const m = window.__plazaTV.map;
    const vr = document.getElementById('plazaViewport').getBoundingClientRect();
    const hr = document.querySelector('#plazaViewport .mwHero').getBoundingClientRect();
    const sr = document.querySelector('#plazaViewport .mwStage').getBoundingClientRect();
    return { px: m.zoom() * m.geom().tile, vw: vr.width, vh: vr.height, sw: sr.width, sh: sr.height,
      heroIn: hr.left >= vr.left - 1 && hr.right <= vr.right + 1 && hr.top >= vr.top - 1 && hr.bottom <= vr.bottom + 1 && hr.width > 0 };
  });
  const near = (a, b) => Math.abs(a - b) <= 1.5;
  const laidOut = vpName === 'desktop'
    ? (g.sw <= g.vw + 1 && g.sh <= g.vh + 1 && (near(g.sw, g.vw) || near(g.sh, g.vh)))
    : (near(g.sw, g.vw) || near(g.sh, g.vh) || near(g.px, 34) || near(g.px, 96));
  check('(1d) ' + L + '開いた直後に主人公が viewport の内側・1 マス 34〜96px・layout() が走った (' + (vpName === 'desktop' ? '地図全体が収まり縦か横が一致' : '縦か横が可視域に一致 / 下限 / 上限') + ')',
    g.heroIn && g.px >= 34 && g.px <= 96 && laidOut, g);

  /* ── (3a) 暗幕 ── */
  const a3 = await page.evaluate(() => {
    const sc = document.getElementById('plazaScreen');
    const lights = sc.querySelectorAll('.mwLight'); const li = lights[0]; const stg = sc.querySelector('.mwStage');
    const cs = (e) => { const c = getComputedStyle(e); return [c.filter, c.backdropFilter || c.webkitBackdropFilter || 'none', c.mixBlendMode]; };
    return { n: lights.length, pe: li ? getComputedStyle(li).pointerEvents : null, canvas: sc.querySelectorAll('canvas').length,
      light: li ? cs(li) : null, stage: stg ? cs(stg) : null };
  });
  const fx = (v) => !!v && v[0] === 'none' && v[1] === 'none' && v[2] === 'normal';
  check('(3a) ' + L + '暗幕 .mwLight は闇市の中に 1 枚・pointer-events none・canvas 0・暗幕と舞台の filter / backdrop-filter / mix-blend-mode = none / none / normal',
    a3.n === 1 && a3.pe === 'none' && a3.canvas === 0 && fx(a3.light) && fx(a3.stage), a3);
  /* ── (3d) 札の矩形の交差 0 (全 7 枚。画面外も同じ舞台の transform に乗るので camera によらない) ── */
  const d3 = await page.evaluate(signRects);
  check('(3d) ' + L + '札 7 枚の矩形が 1 組も交差しない', d3.n === 7 && d3.hits.length === 0 && d3.zeroSize.length === 0, d3);
  const b3a = await page.evaluate(lightFootGap);

  /* ── (3c) 札の中心で elementFromPoint が札 (i) / 暗幕を当たり判定に入れても札 (ii) ── */
  const probes = {};
  const takeProbe = async (where) => {
    for (const p of await page.evaluate(signProbe)) {
      if (!probes[p.k]) probes[p.k] = Object.assign({ where }, p);
      else if (!(p.i && p.ii)) probes[p.k + '@' + where] = Object.assign({ where }, p);
    }
  };
  await takeProbe('spawn');

  /* ── (1e) desktop: 立ち位置 (2,2) から薬屋の札を MS_PER_TILE x 0.55 の間隔で連打 → 5 秒以内に (8,6) へ着き板が開く ── */
  if (vpName === 'desktop') {
    const ms = await page.evaluate(() => window.__plazaTV.map.geom().msPerTile);
    const gap = Math.round(ms * 0.55);
    const t0 = Date.now(); let clicks = 0, arrived = false; const presses = [];
    while (Date.now() - t0 < 5000) {
      const p = await pressSign(page, 'plazaSign_potion'); clicks++; if (presses.length < 2) presses.push(p);
      arrived = await page.evaluate(() => window.__plazaTV.map.openStall() === 'potion' && !window.__plazaTV.map.isMoving());
      if (arrived) break;
      await sleep(gap);
    }
    const el = Date.now() - t0;
    const r = await page.evaluate(() => ({ tile: window.__plazaTV.map.heroTile(), board: window.__plazaTV.map.board(), stall: window.__plazaTV.map.openStall() }));
    check('(1e) ' + L + '薬屋の札を ' + gap + 'ms (= MS_PER_TILE ' + ms + ' x 0.55) 間隔で連打しても 5 秒以内に (8,6) へ着いて品の板が開く (実クリック・間隔 < MS_PER_TILE)',
      arrived && gap < ms && el <= 5000 && r.tile.c === 8 && r.tile.r === 6 && r.board === 'shop' && r.stall === 'potion' && presses.every((q) => q && q.x !== undefined),
      { arrived, ms: el, clicks, gap, r, presses });
    await page.evaluate(() => { const b = document.getElementById('btnPlazaBackToMap'); if (b) b.click(); });
  }

  /* ── (1c) タイル 3 か所 (暗がりの奥を含む) を実際に押すと着く。押した点は暗幕ではない ── */
  const c1 = [];
  const tiles = vpName === 'desktop' ? [[5, 6], [17, 12], [21, 7]] : [[5, 6], [11, 7], [17, 7]];
  for (const [tc, tr] of tiles) {
    const w = await walkByClicks(page, tc, tr);
    const h = await page.evaluate(() => window.__plazaTV.map.heroTile());
    c1.push({ to: [tc, tr], ok: w.ok && h.c === tc && h.r === tr, hops: w.hops, unders: w.unders, bad: w.bad });
    if (vpName === 'compact') await takeProbe('(' + tc + ',' + tr + ')');
  }
  check('(1c) ' + L + 'タイル 3 か所 ' + JSON.stringify(tiles) + ' を実クリックで押すと着く (暗がりの奥を含む)・押した点の elementFromPoint は暗幕ではない',
    c1.every((x) => x.ok && x.hops >= 1 && x.unders.every((u) => !/mwLight/.test(u))), c1);
  const b3b = await page.evaluate(lightFootGap);
  check('(3b) ' + L + '暗幕の中心 = 主人公の足元 (主人公の矩形から出した足元 / heroTile の clientFromTile) の差 1px 以内 (開いた直後と歩いた後)',
    [b3a, b3b].every((q) => q.dx <= 1 && q.dy <= 1 && q.dtx <= 1 && q.dty <= 1), { open: b3a, walked: b3b });

  const pv = Object.values(probes);
  const seen = Array.from(new Set(pv.map((p) => p.k.split('@')[0]))).sort();
  check('(3c) ' + L + '札 7 枚それぞれの中心で (i) elementFromPoint が札 (ii) 暗幕を当たり判定に入れても札 (= 暗幕より上)。' + (vpName === 'compact' ? '歩いて寄りながら画面内の札を測り、和集合が 7 枚。' : '') + '灯りの外 (7 マス以上) の札を含む',
    seen.join() === ALL_SIGNS.join() && pv.every((p) => p.i && p.ii) && pv.some((p) => p.dist >= 7), probes);

  /* ── (2a) 実行時の STALLS: 16 個の id がちょうど 1 つの露店に・余り 0 (ソース経路は本体で) ── */
  const a2 = await page.evaluate(() => {
    const ids = Object.keys(PLAZA_ITEMS_TV).concat(Object.keys(PLAZA_ITEMS_COMMON_TV));
    const cnt = {}; const extra = [];
    for (const st of window.PLAZA_MAP.STALLS) for (const id of st.items) { cnt[id] = (cnt[id] || 0) + 1; if (ids.indexOf(id) < 0) extra.push(id); }
    return { ids, bad: ids.filter((id) => cnt[id] !== 1).map((id) => id + ':' + (cnt[id] || 0)), extra };
  });

  /* ── §2 在庫を 4 露店すべてに 1 行以上ある形に仕込む ── */
  await page.evaluate(() => {
    const T = window.__plazaTV; T.setFang(999);
    const s = T.getStock(); s.length = 0;
    s.push({ itemId: 'potion_healing', price: 3, kind: 'always' }, { itemId: 'wand_polymorph', price: 10, kind: 'always' },
      { itemId: 'potion_greater_healing', price: 5, kind: 'common' }, { itemId: 'pearl_of_power', price: 8, kind: 'featured' },
      { itemId: 'scroll_create_golem', price: 9, kind: 'featured' }, { itemId: 'ring_spell_turning', price: 12, kind: 'featured' },
      { itemId: 'dust_sneezing_choking', price: 4, kind: 'common' });
    T.renderPlazaShop();
    const b = document.getElementById('btnPlazaBackToMap'); if (b) b.click();
  });
  const b2 = {}, c2 = {};
  for (const key of ['potion', 'wand', 'summon', 'curio']) {
    const press = await pressSign(page, 'plazaSign_' + key);
    const arrived = await waitFn(page, (k) => window.__plazaTV.map.openStall() === k && !window.__plazaTV.map.isMoving(), 25000, key);
    const r = await page.evaluate((k) => {
      const T = window.__plazaTV, PM = window.PLAZA_MAP; const rows = T.shopRows();
      const all = Object.assign({}, PLAZA_ITEMS_TV, PLAZA_ITEMS_COMMON_TV);
      /* ★[#99] 古物商の装備品の行 (data-gear 付き) は闇市の品の表に無い品なので、ここでは数えない
       *   (装備品の行そのものは verify_plaza_curio が見る)。除くのは data-gear の行だけ = 在庫の行の捕捉は着手前と同じ。 */
      const vis = [...document.querySelectorAll('#plazaShop .pshopItem')].filter((e) => e.offsetParent !== null && !e.hasAttribute('data-gear'));
      /* 見えている行の品 = 行に描かれた名前 → 品の表 (data-idx を信じない) */
      const visIds = vis.map((e) => { const n = e.querySelector('.pshopName'); const nm = n ? n.textContent : null; return Object.keys(all).find((x) => all[x].name === nm) || null; });
      const want = rows.filter((s) => PM.stallOf(s.itemId) === k).map((s) => s.itemId);
      const qb = document.getElementById('plazaQuestBoard'); const en = PM.STALLS.find((s) => s.key === k).enter;
      return { visIds, want, questVis: !!qb && qb.offsetParent !== null, tile: T.map.heroTile(), enter: en, board: T.map.board() };
    }, key);
    b2[key] = Object.assign({ arrived, press: press.elClick ? 'el.click' : 'real' }, r);
    /* (2c) 見えている「購入」を実クリック → 押した行の品だけ +1 */
    const b = await page.evaluate(() => {
      const T = window.__plazaTV;
      const btn = [...document.querySelectorAll('#plazaShop .pbuy')].find((e) => e.offsetParent !== null && !e.disabled);
      if (!btn) return null;
      btn.scrollIntoView({ block: 'center' });
      const rc = btn.getBoundingClientRect(); const row = btn.closest('.pshopItem');
      const name = row ? row.querySelector('.pshopName').textContent : null;
      const inv = {}; for (const k of Object.keys(T.inv())) inv[k] = T.inv()[k].length;
      /* 押した行の品 = 行に描かれた名前 → 品の表 (ドライバは data-idx を信じない = 罠 B を素通りさせない) */
      const all = Object.assign({}, PLAZA_ITEMS_TV, PLAZA_ITEMS_COMMON_TV);
      const id = Object.keys(all).find((x) => all[x].name === name) || null;
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2, id, name, inv };
    });
    if (!b) { c2[key] = { err: '見えている購入ボタンが無い' }; continue; }
    await page.mouse.click(b.x, b.y);
    await sleep(200);
    const after = await page.evaluate(() => { const T = window.__plazaTV; const o = {}; for (const k of Object.keys(T.inv())) o[k] = T.inv()[k].length; return o; });
    const keys = Array.from(new Set(Object.keys(b.inv).concat(Object.keys(after))));
    const changed = keys.filter((k) => (after[k] || 0) !== (b.inv[k] || 0)).map((k) => k + ':' + (b.inv[k] || 0) + '->' + (after[k] || 0));
    c2[key] = { pressed: b.id, name: b.name, changed, ok: !!b.id && (after[b.id] || 0) === (b.inv[b.id] || 0) + 1 && changed.length === 1 };
    await page.evaluate(() => { const x = document.getElementById('btnPlazaBackToMap'); if (x) x.click(); });
  }
  check('(2b) ' + L + '露店ごとに札を押す → enter へ歩いて着く → 品の板が開く: 見えている行は全部その露店の品・その露店の在庫は全部見える・闇クエストの板は見えない',
    Object.values(b2).length === 4 && Object.values(b2).every((r) => r.arrived && r.tile.c === r.enter[0] && r.tile.r === r.enter[1] && r.board === 'shop'
      && r.visIds.length > 0 && r.visIds.every((id) => id && r.want.indexOf(id) >= 0) && r.want.every((id) => r.visIds.indexOf(id) >= 0) && r.visIds.length === r.want.length && !r.questVis), b2);
  check('(2c) ' + L + '⭐ 4 露店それぞれで、見えている行の「購入」を押すと押した行の品 (行の名前から引く) だけが持ち物に 1 増える (罠 B)',
    ['potion', 'wand', 'summon', 'curio'].every((k) => c2[k] && c2[k].ok), c2);

  /* ── (2d) 召喚屋の品を在庫から抜いて開く → 「今日は何も並んでいない」・購入ボタン 0 ── */
  await page.evaluate(() => {
    const T = window.__plazaTV, PM = window.PLAZA_MAP; const s = T.getStock();
    for (let i = s.length - 1; i >= 0; i--) if (PM.stallOf(s[i].itemId) === 'summon') s.splice(i, 1);
    T.renderPlazaShop();
  });
  await pressSign(page, 'plazaSign_summon');
  const d2ok = await waitFn(page, () => window.__plazaTV.map.openStall() === 'summon' && !window.__plazaTV.map.isMoving(), 25000);
  const d2 = await page.evaluate(() => {
    const n = document.getElementById('plazaStallEmpty');
    return { noteVis: !!n && n.offsetParent !== null, text: n ? n.textContent : null,
      buys: [...document.querySelectorAll('#plazaShop .pbuy')].filter((e) => e.offsetParent !== null).length };
  });
  check('(2d) ' + L + '召喚屋の品を在庫から抜いて開くと「今日は何も並んでいない」が見え、見えている購入ボタンは 0',
    d2ok && d2.noteVis && /今日は何も並んでいない/.test(d2.text || '') && d2.buys === 0, Object.assign({ arrived: d2ok }, d2));
  await page.evaluate(() => { const x = document.getElementById('btnPlazaBackToMap'); if (x) x.click(); });

  /* ── (2e) 掲示板 → 闇クエストの板・品の板は見えない ── */
  await pressSign(page, 'plazaSign_board');
  const e2ok = await waitFn(page, () => window.__plazaTV.map.board() === 'quest' && !window.__plazaTV.map.isMoving(), 25000);
  const e2 = await page.evaluate(() => ({ board: window.__plazaTV.map.board(), q: document.getElementById('plazaQuestBoard').offsetParent !== null,
    s: document.getElementById('plazaShop').offsetParent !== null, tile: window.__plazaTV.map.heroTile() }));
  check('(2e) ' + L + '掲示板の札 → (12,2) へ歩いて闇クエストの板が開き、品の板は見えない',
    e2ok && e2.board === 'quest' && e2.q && !e2.s && e2.tile.c === 12 && e2.tile.r === 2, Object.assign({ arrived: e2ok }, e2));
  await page.evaluate(() => { const x = document.getElementById('btnPlazaBackToMap'); if (x) x.click(); });

  /* ── (4d) 銀の鹿亭への札 → (2,1) へ歩く → 閉じる・酒場の主人公のタイルは入る前と同じ・rAF 停止 ── */
  await pressSign(page, 'plazaSign_tavern');
  const closed = await waitFn(page, () => !window.__plazaTV.plazaOpen(), 30000);
  const d4a = await page.evaluate(() => ({ px: window.__plazaTV.map.heroPx(), tile: window.__plazaTV.map.heroTile(), moving: window.__plazaTV.map.isMoving(),
    tv: window.__TAVERN_TV ? window.__TAVERN_TV.heroTile() : null }));
  await sleep(450);
  const d4b = await page.evaluate(() => window.__plazaTV.map.heroPx());
  check('(4d) ' + L + '銀の鹿亭への札 → (2,1) に着いて #plazaScreen が閉じる・酒場の地図の主人公のタイルは入る前と同じ・isMoving false で 450ms 後も位置不変',
    closed && d4a.tile.c === 2 && d4a.tile.r === 1 && d4a.moving === false && d4b.x === d4a.px.x && d4b.y === d4a.px.y
      && !!tvTileBefore && !!d4a.tv && d4a.tv.c === tvTileBefore.c && d4a.tv.r === tvTileBefore.r,
    { closed, d4a, d4b, tvTileBefore });

  /* ── (4b) 入り直して港町への石段 → town.html の (3,11) ── */
  const re = await enterByBridge(page);
  await pressSign(page, 'plazaSign_town');
  let moved = false;
  try { await page.waitForFunction("location.pathname.indexOf('/town.html') >= 0 && !!window.__town", { timeout: 40000 }); moved = true; } catch (e) {}
  await sleep(800);
  const tw = moved ? await page.evaluate(() => ({ via: window.__town.spawnVia(), tile: window.__town.heroTile(), search: location.search,
    enterVia: sessionStorage.getItem('dragonfighters.enterVia') })) : null;
  check('(4b) ' + L + '港町への石段の札 → (2,10) へ歩いて town.html へ移り、spawnVia "plaza"・主人公が (3,11)・クエリ無し・enterVia 書かない',
    re && moved && tw.via === 'plaza' && tw.tile.c === 3 && tw.tile.r === 11 && tw.search === '' && tw.enterVia === null, { reEnter: re, tw });
  await page.close();
  return { a2 };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const T0 = Date.now();
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_plazamap_');
  const server = await startServer().catch((e) => { console.error('[driver] サーバを立てられません (port ' + PORT + '): ' + e.message); process.exit(2); });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile, '--mute-audio', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 300000 });
  try {
    console.log('[driver] serving ' + ROOT + ' :' + PORT + (INJECTED.length ? '  (変異 ' + INJECTED.join(',') + ')' : '') + '  基準の木 = ' + BASE_REV);

    /* ══ desktop の通し ══ */
    const D = await mainFlow(browser, 'desktop');
    if (D.fatal) {
      for (const l of ALL_LABELS) check(l + ' (0a) が赤なので測らない = 赤で記録', false, '装置が立っていない');
      throw { skipRest: true };
    }
    /* ══ §0 (0b)(0c) / §1 (1a)(1b) / §2 (2a) — 地図と品のデータ (tavern.html の上で PLAZA_MAP を読む) ══ */
    const p0 = await openTavern(browser, 'desktop', '', { tag: 'data' });
    await enterByBridge(p0);
    await waitFn(p0, () => { const i = document.querySelector('#plazaViewport .mwMapImg'); return !!i && i.complete && i.naturalWidth > 0; }, 15000);
    const data = await p0.evaluate(() => {
      const PM = window.PLAZA_MAP;
      const img = document.querySelector('#plazaViewport .mwMapImg');
      const walk = [];
      for (let r = 0; r < PM.ROWS; r++) for (let c = 0; c < PM.COLS; c++) if (PM.isWalkable(c, r)) walk.push([c, r]);
      const unreached = {};
      for (const k of Object.keys(PM.SPAWNS)) {
        const s = PM.SPAWNS[k];
        unreached[k] = walk.filter(([c, r]) => PM.findPath(s[0], s[1], c, r) === null).map((x) => x.join(','));
      }
      const pts = PM.STALLS.map((s) => [s.key, s.enter]).concat([[PM.BOARD.key, PM.BOARD.enter]], PM.EXITS.map((e) => [e.key, e.enter]),
        Object.keys(PM.SPAWNS).map((k) => ['spawn:' + k, PM.SPAWNS[k]]));
      return { rows: PM.MASK.length, lens: Array.from(new Set(PM.MASK.map((s) => s.length))), COLS: PM.COLS, ROWS: PM.ROWS, TILE: PM.TILE,
        nat: img ? [img.naturalWidth, img.naturalHeight, img.complete] : null, walk: walk.length, unreached,
        enters: pts.map(([k, t]) => [k, t.join(','), PM.tileAt(t[0], t[1])]),
        ids: Object.keys(PLAZA_ITEMS_TV).concat(Object.keys(PLAZA_ITEMS_COMMON_TV)) };
    });
    await p0.close();
    const led = (() => {
      const src = frozen(LEDGER_PY).toString('utf8');
      const i = src.indexOf('"' + LEDGER_KEY + '": {'); if (i < 0) return null;
      let j = src.indexOf('\n    },', i); if (j < 0) j = src.length;
      const body = src.slice(i, j);
      const mc = body.match(/"cells"\s*:\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/); const mt = body.match(/"tile"\s*:\s*(\d+)/);
      return (mc && mt) ? { cols: +mc[1], rows: +mc[2], tile: +mt[1] } : null;
    })();
    check('(0b) マスクが ' + (led ? led.rows + ' 行 x ' + led.cols + ' 桁' : '?') + '・TILE が台帳 (' + LEDGER_PY + ' の GRIDS["' + LEDGER_KEY + '"] をソースのバイトから) と一致・絵の実寸 = COLS*TILE x ROWS*TILE',
      !!led && data.rows === led.rows && data.lens.length === 1 && data.lens[0] === led.cols && data.COLS === led.cols && data.ROWS === led.rows
        && data.TILE === led.tile && !!data.nat && data.nat[0] === led.cols * led.tile && data.nat[1] === led.rows * led.tile,
      { led, rows: data.rows, lens: data.lens, COLS: data.COLS, ROWS: data.ROWS, TILE: data.TILE, nat: data.nat });
    check('(0c) [装置] 品の母集団 = PLAZA_ITEMS_TV ∪ PLAZA_ITEMS_COMMON_TV の id が 16 個', data.ids.length === 16 && new Set(data.ids).size === 16, data.ids);
    check('(1a) 歩けるマス全部 (' + data.walk + ') へ 2 つの立ち位置の両方から PLAZA_MAP.findPath が届く (孤立 0)',
      data.walk > 0 && Object.keys(data.unreached).length === 2 && Object.values(data.unreached).every((u) => u.length === 0), { walk: data.walk, unreached: data.unreached });
    check('(1b) 露店 4・掲示板・出口 2 の enter と立ち位置 2 つ (計 9) が全部 "."',
      data.enters.length === 9 && data.enters.every((e) => e[2] === '.'), data.enters);
    /* (2a) 2 経路: 実行時の STALLS (desktop の通しで採った) + js/plaza-map.js のソースのバイトの items: の列 */
    const pmSrc = frozen('js/plaza-map.js').toString('utf8');
    const srcLists = []; const re2 = /items:\s*\[([^\]]*)\]/g; let mm;
    while ((mm = re2.exec(pmSrc))) srcLists.push((mm[1].match(/"([a-z_]+)"/g) || []).map((x) => x.slice(1, -1)));
    const srcCnt = {}; srcLists.forEach((l) => l.forEach((id) => { srcCnt[id] = (srcCnt[id] || 0) + 1; }));
    const srcBad = data.ids.filter((id) => srcCnt[id] !== 1).map((id) => id + ':' + (srcCnt[id] || 0));
    const srcExtra = Object.keys(srcCnt).filter((id) => data.ids.indexOf(id) < 0);
    check('(2a) 16 個の id がそれぞれちょうど 1 つの露店に属す・余り 0 (実行時の PLAZA_MAP.STALLS / js/plaza-map.js のソースの items: ' + srcLists.length + ' 列)',
      D.a2.ids.length === 16 && D.a2.bad.length === 0 && D.a2.extra.length === 0 && srcLists.length === 4 && srcBad.length === 0 && srcExtra.length === 0,
      { runtime: D.a2, source: { lists: srcLists.length, bad: srcBad, extra: srcExtra } });

    /* ══ compact の通し ══ */
    const C = await mainFlow(browser, 'compact');
    if (C.fatal) for (const l of ALL_LABELS) check(l + ' [compact] (0a) が赤なので compact は測らない = 赤で記録', false, '装置が立っていない');

    /* ══ (4a) 港町から入る = (2,9) (desktop / compact) ══ */
    for (const vpName of ['desktop', 'compact']) {
      const p = await openTavern(browser, vpName, '', { enterVia: 'plaza', tag: 'fromTown' });
      const ok = await waitFn(p, isOpenFn, 20000);
      const t = ok ? await p.evaluate(() => window.__plazaTV.map.heroTile()) : null;
      check('(4a) [' + vpName + '] 港町から入る (sessionStorage enterVia = "plaza" を置いて tavern.html を開く) と (2,9) に立つ',
        ok && t && t.c === 2 && t.r === 9, { opened: ok, tile: t });
      await p.close();
    }
    /* ══ (4e) ★[#102] 昼 (plazaClock = 12) は港町から来ても地図が開かない (店じまいの一言を経る) ══
       ⚠ #101 までの (4e) =「杖 0・戦士 → 門番の追い返し」は、夜の関門では仕様どおり開くので言い直した。
         追い返しの検査は verify_plaza_hours.js の撤退節 (Xb) (?plazanight=0) が引き継ぐ。ラベル (4e) と ALL_LABELS の並びは変えない。 */
    {
      const p = await openTavern(browser, 'desktop', '', { enterVia: 'plaza', wands: null, gateSeen: false, clock: '12', tag: 'dayFromTown' });
      const closedSeen = await waitFn(p, () => { const o = document.getElementById('prologueOverlay'); return !!o && getComputedStyle(o).display !== 'none'; }, 20000);
      await sleep(1500);
      const r = await p.evaluate(() => ({ open: window.__plazaTV.plazaOpen(), stage: !!document.querySelector('#plazaViewport .mwStage'),
        nightOn: window.__plazaTV.nightOn(), openNow: window.__plazaTV.openNow(), hour: window.PLAZA_HOURS.hourNow(),
        door: !!document.getElementById('tavernDoor_plaza'),
        cls: window.__plazaTV.heroClass(), gate: window.__plazaTV.state().gatekeeperEventSeen }));
      check('(4e) 昼 (plazaClock = 12)・杖 0・戦士で港町から来ても地図が開かない (#plazaScreen 閉・舞台なし)・店じまいの一言を経る (#prologueOverlay が出た)・石段の札は DOM に無い・門番の追い返しは経ない (gatekeeperEventSeen false のまま)',
        closedSeen && !r.open && !r.stage && r.nightOn === true && r.openNow === false && r.hour === 12 && !r.door && r.gate === false && r.cls === 'warrior',
        Object.assign({ closedSeen }, r));
      await p.close();
    }
    /* ══ (4c) ?town=0 では石段の札が DOM に無い ══ */
    {
      const p = await openTavern(browser, 'desktop', '?town=0', { tag: 'town0' });
      const ok = await enterByBridge(p);
      const r = await p.evaluate(() => ({ town: !!document.getElementById('plazaSign_town'), keys: window.__plazaTV.map.signKeys().slice().sort(), off: !!window.__townOff }));
      check('(4c) tavern.html?town=0 では石段の札 plazaSign_town が DOM に無い (札は 6 枚)',
        ok && r.off && !r.town && r.keys.length === 6 && r.keys.indexOf('town') < 0, Object.assign({ opened: ok }, r));
      await p.close();
    }
    /* ══ (6a) ?undercity=0 → #97 と同じ姿 ══ */
    {
      const p = await openTavern(browser, 'desktop', '?undercity=0', { tag: 'off' });
      await p.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
      const ok = await waitFn(p, () => window.__plazaTV.plazaOpen(), 15000);
      await sleep(200);
      const r = await p.evaluate(() => {
        window.__plazaTV.refreshPlazaStock(); window.__plazaTV.renderPlazaShop();
        const panels = [...document.querySelectorAll('#plazaScreen .plazaPanel')].map((x) => x.offsetParent !== null);
        return { vp: !!document.getElementById('plazaViewport'), body: document.body.classList.contains('plazaMapOn'),
          stall: (document.getElementById('plazaShop').innerHTML.match(/data-stall/g) || []).length, rows: document.querySelectorAll('#plazaShop .pshopItem').length,
          panels, map: window.__plazaTV.map, signs: document.querySelectorAll('.mwSign').length };
      });
      check('(6a) tavern.html?undercity=0 → #plazaViewport が DOM に無い・body.plazaMapOn 無し・renderPlazaShop の HTML に data-stall 0・パネル 2 枚が見えている',
        ok && !r.vp && !r.body && r.stall === 0 && r.rows > 0 && r.panels.length === 2 && r.panels.every(Boolean) && r.signs === 0 && !!r.map && r.map.on === false,
        Object.assign({ opened: ok }, r));
      await p.close();
    }

    /* ══ §5 恒等 (git show c310d8c と、CRLF→LF に揃えて比べる) ══ */
    const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
    /* ★[#102] 夜の関門 (依頼書 2026-10-27_plaza-night-hours.md §5) で足した/書き換えた行**だけ**を #102 以前の姿へ戻してから比べる:
     *   tavern.html ① 地図の札の時刻の 1 行 (+ コメント) ② 杖のカタログの retired と効果文 ③ refreshPlazaStock の杖の常設 push
     *   town.html   ④ js/plaza-hours.js の script 1 行 ⑤ buildSigns の時刻の 1 行 (+ コメント) ⑥ 30 秒 tick の IIFE
     *   それ以外の変化は今までどおり赤。各パターンは 0 回 (= #102 以前) か 1 回だけ当てる (2 回以上は戻さない = 赤)。
     *   ⚠ 正規表現にしてあるのは、後続の変異ドライバのアンカー文字列と字面で重ねないため (罠E: 他の tools/*.js に同じ文字列 → exit 3)。 */
    const UNDO102_TV = [
      [/\n        \/\* ★\[#102\] 昼は闇市の石段を DOM に作らない[^\n]*\n        if \(d\.requiresPlazaUnlock && !plazaOpenNowTV\(\)\) return;(?=\n)/g, ''],
      [/(consumeTrigger: "onPlazaEnter", alwaysInStock: true), retired: true,\n(      effect: "パーティ全員をモンスターの姿に変える。)" \},/g, '$1,\n$2ポドルプラザへの入場に必要。" },'],
      [/\n    \/\/ ポリモーフの杖の常設在庫は #101 までの門番のため。★\[#102\][^\n]*\n    if \(!plazaNightOnTV\(\)\) (stock\.push\(\{ itemId: "wand_polymorph")/g, '\n    // ポリモーフの杖は常設在庫 (供給ループ維持・仕様書 §3.3)\n    $1'],
    ];
    const UNDO102_TOWN = [
      [/\n  <script src="js\/plaza-hours\.js"><\/script>[^\n]*(?=\n)/g, ''],
      [/\n        \/\* ★\[#102\] 昼は闇市の石段を DOM に作らない[^\n]*\n        if \(f\.requiresPlazaUnlock && window\.PLAZA_HOURS && !PLAZA_HOURS\.isOpen\(\)\) return;(?=\n)/g, ''],
      [/\n    \/\* ★\[#102\] ページを開いたまま[\s\S]*?\n    \}\)\(\);(?=\n)/g, ''],
    ];
    /* ★[#103] コボルドの巣穴 (依頼書 2026-10-28_kobold-warren.md §5-6) が initTavernMap に足したブロック**だけ**を外してから比べる:
     *   ⑦ 検証シーム __TAVERN_TV.redEgg (読み取り専用) ⑧ 赤い卵を初めて持ち帰った回の酒場の主人の一言。それ以外の変化は今までどおり赤。 */
    const UNDO103_TV = [
      [/\n      \},\n      \/\* ★\[#103\] 卵の印 — 読み取り専用[\s\S]*?\n                 scene: redEggSceneLog\.map\([^\n]*(?=\n)/g, ''],
      [/\n      \/\* ★\[#103\] 赤い卵を初めて持ち帰った回だけ[\s\S]*?\n        \}, REUNION_FIRST_MS\);\n      \}(?=\n)/g, ''],
    ];
    const undo102 = (s, list) => {
      for (const [re, to] of list) { const m = s.match(re); if (m && m.length === 1) s = s.replace(re, to); }
      return s;
    };
    const tvNow = undo102(undo102(lf(frozen('tavern.html')), UNDO102_TV), UNDO103_TV), tvBase = lf(BASE['tavern.html']);
    const sliceTo = (s, startStr, endStr) => { const a = s.indexOf(startStr); if (a < 0) return null; const b = s.indexOf(endStr, a); return b < 0 ? null : s.slice(a, b + endStr.length); };
    const itmNow = sliceTo(tvNow, '(function initTavernMap() {', '\n  })();'), itmBase = sliceTo(tvBase, '(function initTavernMap() {', '\n  })();');
    check('(5a) 配信中の tavern.html の initTavernMap ("(function initTavernMap() {" 〜 次の "})();") が ' + BASE_REV + ' とバイト一致 (LF に揃えて・#102 の時刻の 1 行と #103 の卵の 2 ブロックを除いて)',
      !!itmNow && itmNow.length > 20000 && itmNow === itmBase,
      { now: itmNow && itmNow.length, base: itmBase && itmBase.length, lines: itmNow && itmNow.split('\n').length, crlfServed: (frozen('tavern.html').toString('utf8').match(/\r\n/g) || []).length });
    /* ★[#99] index.html は (5b) の対象から外した。理由 = #99 で装備の名前を変えた (独自品 19 品を SRD の名前へ・
     *   旧名の移し替え DF_GATED_RENAME)。index の恒等は verify_plaza_curio が 54f6409 との差で見る。 */
    /* ★[#100] js/npc-crowd.js は #100 で地下街の住人の配列 PLAZA (冒頭コメント付きの 1 ブロック) と公開行の
     *   " PLAZA: PLAZA," を**足した** (依頼書 §5-1)。その 2 つだけを取り除いた残りが基準とバイト一致 =
     *   TAVERN / TOWN / REUNION / validate は 1 バイトも動いていない、を見る (足した以外の変化は今までどおり赤)。 */
    const drop100 = (rel, s) => rel !== 'js/npc-crowd.js' ? s
      : s.replace(/\n  \/\* ★\[#100\][^\n]*\n(?:   \*[^\n]*\n)*  var PLAZA = \[\n[\s\S]*?\n  \];\n/, '').replace(' PLAZA: PLAZA,', '');
    /* ★[#101] town.html は #101 で「📜 更新情報」の窓を**足した** (依頼書 2026-10-26_town-changelog.md §5):
     *   ① :root の CSS 変数 4 つ (★[#101] コメント付き) ② #changelogBox の CSS 1 ブロック ③ 箱の HTML ④ js/changelog.js の
     *   script 1 行 ⑤ 撤退 ?townlog=0 の IIFE。その 5 つだけを取り除いた残りが基準とバイト一致 = 港町の他の部分は
     *   1 バイトも動いていない、を見る (足した以外の変化は今までどおり赤)。窓そのものは verify_town_changelog が見る。
     *   ⚠ 各ブロックは 0 回 (= #101 以前の姿) か 1 回だけ取り除く。2 回以上当たったら取り除かない (= 赤になる)。 */
    const DROP101 = [
      /\n      \/\* ★\[#101\][^\n]*\n[^\n]*\*\/\n      --parchment-bg:[^\n]*\n      --parchment-ink-soft:[^\n]*\n      --parchment-border:[^\n]*\n      --parchment-shadow:[^\n]*(?=\n)/g,
      /\n    \/\* ── ★\[#101\] 更新情報[\s\S]*?\n    #changelogBox\.collapsed \.changelogList \{ display: none; \}\n(?=\n)/g,
      /\n  <!-- ★\[#101\] 更新情報[\s\S]*?\n  <div id="changelogBox" class="collapsed">\n[^\n]*\n    <ul class="changelogList"><\/ul>\n  <\/div>\n(?=\n)/g,
      /\n  <script src="js\/changelog\.js"><\/script>[^\n]*(?=\n)/g,
      /\n    \/\* ★\[#101\] 更新情報 — 撤退 \?townlog=0[^\n]*\n    \(function \(\) \{\n[\s\S]*?\n    \}\)\(\);\n(?=\n)/g,
    ];
    const drop101 = (rel, s) => {
      if (rel !== 'town.html') return s;
      for (const re of DROP101) { const m = s.match(re); if (m && m.length === 1) s = s.replace(re, ''); }
      return s;
    };
    const b5 = ['js/tavern-map.js', 'js/town-map.js', 'town.html', 'js/npc-crowd.js'].map((rel) => {
      const now = frozen(rel), base = BASE[rel];
      const n102 = (r, s) => r === 'town.html' ? undo102(s, UNDO102_TOWN) : s;   // ★[#102]
      return { rel, same: n102(rel, drop101(rel, drop100(rel, lf(now)))) === lf(base), raw: Buffer.compare(now, base) === 0, bytes: now.length };
    });
    check('(5b) js/tavern-map.js / js/town-map.js / town.html / js/npc-crowd.js (#100 の PLAZA・#101 の更新情報の窓・#102 の夜の関門を除いて) が ' + BASE_REV + ' とバイト一致 (LF に揃えて)', b5.every((x) => x.same), b5);
    const parts5c = [['const PLAZA_ITEMS_TV = {', '\n  };'], ['const PLAZA_ITEMS_COMMON_TV = {', '\n  };'], ['function refreshPlazaStock(', '\n  }\n']].map(([a, z]) => {
      const n = sliceTo(tvNow, a, z), bb = sliceTo(tvBase, a, z);
      return { from: a, len: n && n.length, same: !!n && n.length > 200 && n === bb };
    });
    check('(5c) tavern.html の品の表 2 つ (宣言 〜 閉じ括弧) と refreshPlazaStock の関数本体が ' + BASE_REV + ' とバイト一致 (LF に揃えて・#102 の杖の 2 か所を除いて)', parts5c.every((x) => x.same), parts5c);

    await sleep(500);
    check('(9a) pageerror / console error 0 件 (酒場・港町。favicon の 404 と [DIAG] は除外)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
  } catch (e) {
    if (!(e && e.skipRest)) {
      console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
      results.push({ name: '(fatal) ' + String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
    }
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) {}
  }

  /* ══ 集計 ══ */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const labels = Array.from(new Set(results.map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0]).filter(Boolean)));
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   節 ' + labels.length + '   (' + Math.round((Date.now() - T0) / 1000) + ' 秒)');
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.name.slice(0, 120) + '  -- ' + String(r.detail).slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = MUTATIONS[tag].expect;
    const red = Array.from(new Set(results.filter((r) => !r.ok).map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0])));
    const miss = want.filter((w) => red.indexOf(w) < 0);
    const extra = red.filter((w) => want.indexOf(w) < 0);
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + red.join(','));
    console.log('[driver]   担当外の巻き込み: ' + (extra.length ? extra.join(',') : 'なし'));
    if (miss.length) { console.error('[driver] ✗ ' + tag + ' の担当の節が赤くなりませんでした (空振り): ' + miss.join(',')); process.exit(1); }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
