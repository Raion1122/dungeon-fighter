/* verify_clear_chests.js — #108 クリア時の宝箱 3 つ + 伝承の品 (青 / 紫の色分け) の受入
 *
 *   node tools/verify_clear_chests.js                       ← 素の受入 (依頼書 §8 の全 assert)
 *   node tools/verify_clear_chests.js --negative            ← 負のコントロール 7 本 + 装置の検算 1 本 (1 本ずつ子プロセスで順に)
 *   node tools/verify_clear_chests.js --negative --only grantall
 *
 * 依頼書: 実装依頼書/2026-11-04_clear-chests.md §8 (§12-4 に結果と言い直しの記録)。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 本番の index.html / tavern.html を実 Chrome (puppeteer-core) で開く。配信バイトは起動時に凍結する
 *    (index.html / tavern.html / js/*.js は起動時、残りは初回アクセス時)。
 *  - showResult(true) を直接呼ぶ既存の作法 (driver_sce1_events) にならい、箱の中身は clearChestBoxes
 *    (let) を page.evaluate から差し替えて決め打ちする。付与は openClearChest(k) (箱のタップの呼び口) /
 *    resultBtn の click / 実際の .rcBox の click の 3 経路。
 *  - 付与の痕跡は localStorage (gold / accessoryIds / accessoryState / ownedGatedNames / 装備の保存キー) と
 *    sessionStorage の lastResult の 2 経路で見る。
 *  - 1 ページ = 1 タブ = まっさらな dragonfighters.* (sessionStorage の印で 1 回だけまく)。
 *  - 乱数を固定する節 ((2c)(Xa)(Xb)) は「showResult が**直接**引く 1 回 (= clearHit)」だけ値を決め打ちし、
 *    それ以外は LCG。⚠ (2c) は 1% に当たらない値でしか成り立たない (依頼書 §12-2 (4))。
 *  - ⛔ 本番に検証専用の行を足さない。⛔ 確率・金貨の額・揺れの時間・伝承の品の数値は測らない (§8 ⛔)。
 *
 * ── 依頼書 §8 からの言い直し (§12-4 に同じ記録) ─────────────────────────────
 *  (0a) 伝承の品が 12 件でなければ、ブラウザを立てる前に exit 3 (配信中の index のソースの表を数える)。
 *       実行時の accessories[] でも数え直し、違えば exit 3。
 *  (3d) 「relicP = 1 に決め打ち」= Math.random を常に 0 にして rollClearChests() (relicP は定数なので乱数側で 1 にする)。
 *  (4b) 2 回目の付与の口 = 箱のタップの呼び口 openClearChest(別の k) + resultBtn の 2 つ。
 *       (resultBtn の click は自前で clearChestOpened を見ているので、変異 dblgrant が届くのは前者)
 *  (5a) 酒場には「所持アクセサリーの一覧」が無い (§12-3 決めたこと 1) ⇒ 準備画面の装身具チップ
 *       (#equipEquippedSummary の「装身具1/2」) で、伝承の品 = rarity-epic +「伝承」の札 + 下の行「効果 ・ 行き先」/
 *       ゲート付き = rarity-rare を見る。ダンジョン側は宝箱の名前 (.rcName) を実際の .rcBox の click で開けて見る。
 *  (5b) 素の要素の算出色 (color + text-shadow) と :root の 2 変数を index と比べる + 酒場に規則が実在する
 *       (クラス無しの要素と色が違う・styleSheets に .rarity-epic / .rarity-rare の規則がある)。
 *       ⚠ #pmDrawer の中は明るい文字に上書きされるので測らない (§12-3 決めたこと 2)。
 *  (Xb) 追加: 宝箱が有効な腕は、clearHit が当たる乱数でも ✨ 宝物発見 を出さない (罠 B の 3 = 1 回引いて捨てる)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 *  - 1 本ずつ子プロセスで順に回す (同時注入は互いを覆い隠す)。port は --port の 1 本だけを順に使う。
 *  - アンカーは**手つかずの原本**で 1 件ちょうどを起動時に確かめる (素の走行でも)。0 件 / 2 件以上 /
 *    置換前後が同じ長さ / 改行を含む / 置換文字列が原本に既に在る / 他の tools/*.js のソースに同じ文字列がある
 *    (罠E) なら exit 3。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は一覧に出す。
 *  - 装置の検算 relic11 (伝承の品を 11 件にする) は exit 3 で止まることを親が確かめる (exit 3 以外なら NG)。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 (puppeteer / ブラウザ / ポート) /
 *       3 = 変異アンカーの腐敗 または 伝承の品が 12 件でない (全 assert が空振りになるので測らない)
 * port: 10706 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
 * ⛔ timeout コマンドで包まない (孤児の node がポートを掴む)。長い走行は PowerShell から。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const vm   = require('vm');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10706'), 10);
const RELIC_N  = 12;   // 依頼書 §4-2: 新規 11 + 既存のガントレットオブオーガパワー 1
const SID      = 'goblin-mine';

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
const SNAPSHOT = new Map();
function frozen(rel) {
  if (SNAPSHOT.has(rel)) return SNAPSHOT.get(rel);
  let buf = null;
  try {
    const fp = path.join(ROOT, rel);
    if (fp.startsWith(ROOT) && fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) buf = fs.readFileSync(fp);
  } catch (e) { buf = null; }
  SNAPSHOT.set(rel, buf);
  return buf;
}
const JS_FILES = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /\.js$/.test(f)).map((f) => 'js/' + f).sort();
for (const rel of ['index.html', 'tavern.html'].concat(JS_FILES)) {
  if (!frozen(rel)) { console.error('[driver] ' + rel + ' が読めません'); process.exit(2); }
}
const PRISTINE = {};
for (const rel of ['index.html', 'tavern.html']) PRISTINE[rel] = frozen(rel).toString('utf8');

/* 変異 (依頼書 §8 の表)。edits = [[file, anchor, patch], ...]。⚠ アンカーも置換も 1 行に収める。
 *   exit3: true = 装置の検算 (担当の節ではなく exit 3 で止まるのが正解) */
const MUTATIONS = {
  grantall: { expect: ['(1b)'], why: '⭐ 罠 A: openClearChest が 3 箱とも付与する',
    edits: [['index.html', '      const g = grantClearChestBox(box);',
      '      const g = (clearChestBoxes.forEach((b2, j2) => { if (j2 !== k) grantClearChestBox(b2); }), grantClearChestBox(box));  /* mut-grantall */']] },
  goldmix: { expect: ['(2a)'], why: '⭐ 罠 B: 宝箱の金貨を lastResult.reward.gold にも足す',
    edits: [['index.html', '      if (persistent && typeof persistent.gold === "number") persistent.gold += n;',
      '      if (persistent && typeof persistent.gold === "number") persistent.gold += n; try { const L = JSON.parse(sessionStorage.getItem("dragonfighters.lastResult")); if (L && L.reward) { L.reward.gold += n; sessionStorage.setItem("dragonfighters.lastResult", JSON.stringify(L)); } } catch (e) {}  /* mut-goldmix */']] },
  relicleak: { expect: ['(3a)'], why: '⭐ 罠 D: buildMagicItemPool の relic 除外を外す',
    edits: [['index.html', '        if (!acc || !acc.gated || acc.relic) continue;', '        if (!acc || !acc.gated) continue;  /* mut-relicleak */']] },
  noequip: { expect: ['(3b)'], why: '⭐ 罠 C: relic を装備枠に着けない (保存と在庫の数え直しだけ走る)',
    edits: [['index.html', '        if (rcp.kind === "player") currentAccessoryIndices[rcp.slot] = box.idx;',
      '        if (rcp.kind === "player") void 0;  /* mut-noequip */']] },
  tworelic: { expect: ['(3d)'], why: '「伝承の品は 3 箱で最大 1 つ」の旗を外す',
    edits: [['index.html', '          boxes.push({ kind: "relic", idx: relicIdx }); relicPlaced = true; continue;',
      '          boxes.push({ kind: "relic", idx: relicIdx }); relicPlaced = false; continue;  /* mut-tworelic */']] },
  dblgrant: { expect: ['(4b)'], why: 'openClearChest の clearChestOpened の旗を外す (二重付与)',
    edits: [['index.html', '      if (!clearChestBoxes || clearChestOpened) return null;', '      if (!clearChestBoxes) return null;  /* mut-dblgrant (旗なし) */']] },
  namedrift: { expect: ['(3f)'], why: '酒場の ACCESSORIES_TV の relic-goblin-mine の name を 1 文字変える (防護 → 防具)',
    edits: [['tavern.html', '    { id: "relic-goblin-mine", name: "アイウーンストーン(防護)",',
      '    { id: "relic-goblin-mine", name: "アイウーンストーン(防具)", /* mut-namedrift */']] },
  relic11: { exit3: true, expect: [], why: '[装置の検算] 沼の伝承の品から relic を外す (伝承の品 11 件 → (0a) が exit 3 で止まるべき)',
    edits: [['index.html', '        hpBonus: 6, gated: true, relic: "lizard-swamp", rarity: "special" },',
      '        hpBonus: 6, gated: true, rarity: "special" },  /* mut-relic11 */']] },
};
const MUT_ORDER = ['grantall', 'goldmix', 'relicleak', 'noequip', 'tworelic', 'dblgrant', 'namedrift'];
const ALL_MUT = MUT_ORDER.concat(['relic11']);

/* 起動時の検算 (素の走行でも必ず) */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self)
    .map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  for (const k of ALL_MUT) {
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
for (const k of ONLY) if (!MUTATIONS[k]) { console.error('[driver] 未知の --only: ' + k + '  (' + ALL_MUT.join(',') + ')'); process.exit(3); }

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
  for (const file of Object.keys(work)) SNAPSHOT.set(file, Buffer.from(work[file], 'utf8'));
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + tag + ' を注入しました (' + m.why + ' / 置換 ' + m.edits.length + ' 本)');
}

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const bad = [], summary = [];
  const t0 = Date.now();
  console.log('[driver] --negative (一括): ' + ALL_MUT.join(',') + ' を 1 本ずつ順に走らせます (port ' + PORT + ' を順に使う)');
  for (const tag of ALL_MUT) {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const t1 = Date.now();
    const r = spawnSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    process.stdout.write(r.stderr || '');
    const want = MUTATIONS[tag].exit3 ? 3 : 0;
    const m = (r.stdout || '').match(/\[driver\] --negative \S+: 担当=([^\s]*) \/ 実際に赤くなった=([^\n]*)/);
    summary.push(tag + ': exit ' + r.status + ' (期待 ' + want + '・' + Math.round((Date.now() - t1) / 1000) + ' 秒)' + (m ? '  担当=' + m[1] + '  赤=' + m[2].trim() : ''));
    if (r.status !== want) bad.push(tag + ' (exit ' + r.status + ' / 期待 ' + want + ')');
  }
  console.log('\n[driver] ── --negative 総括 (' + Math.round((Date.now() - t0) / 1000) + ' 秒) ──');
  summary.forEach((s) => console.log('   ' + s));
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + MUT_ORDER.length + ' 本すべて担当の節が赤くなりました (空振り 0)・装置の検算 relic11 = exit 3');
  process.exit(0);
}
if (NEGATIVE) {
  if (ONLY.length !== 1) { console.error('[driver] --only には変異を 1 つ: ' + ALL_MUT.join(',')); process.exit(1); }
  inject(ONLY[0]);
}

/* ══════════════════════════════════════════════════════════════════════════
 * ソースの表 (配信中のバイト)
 * ══════════════════════════════════════════════════════════════════════════ */
const lf = (b) => (Buffer.isBuffer(b) ? b.toString('utf8') : String(b)).replace(/\r\n/g, '\n');
/* `const <name> = [ ... ];` のリテラルを vm で評価する。宣言が 1 つちょうどでなければ err (verify_plaza_curio の作法) */
function evalDecl(src, name) {
  const re = new RegExp('\\n([ \\t]*)const ' + name + ' = ([\\[{])');
  const m = re.exec(src); if (!m) return { err: 'not found' };
  const cnt = src.split(new RegExp('\\n[ \\t]*const ' + name + ' = ')).length - 1;
  if (cnt !== 1) return { err: 'decl x' + cnt };
  const close = '\n' + m[1] + (m[2] === '[' ? '];' : '};');
  const a = m.index + m[0].length - 1; const b = src.indexOf(close, a);
  if (b < 0) return { err: 'no close' };
  try { return { v: vm.runInNewContext('(' + src.slice(a, b + close.length - 1) + ')', {}) }; }
  catch (e) { return { err: 'eval ' + e.message }; }
}
const KEYS5 = ['id', 'name', 'gated', 'rarity', 'relic'];
const pick5 = (a) => { const o = {}; KEYS5.forEach((k) => { o[k] = a ? a[k] : undefined; }); return o; };

const SRC_IDX = evalDecl(lf(frozen('index.html')), 'accessories');
const SRC_TV  = evalDecl(lf(frozen('tavern.html')), 'ACCESSORIES_TV');
if (SRC_IDX.err || SRC_TV.err) {
  console.error('[driver] (0a) 装置: 表を読めません index accessories=' + (SRC_IDX.err || 'ok') + ' / tavern ACCESSORIES_TV=' + (SRC_TV.err || 'ok'));
  process.exit(3);
}
const SRC_RELIC = SRC_IDX.v.filter((a) => a && a.relic);
if (SRC_RELIC.length !== RELIC_N) {
  console.error('[driver] (0a) 伝承の品 (accessories[] で relic を持つ品) が ' + SRC_RELIC.length + ' 件 (期待 ' + RELIC_N + ')。全 assert が空振りになるので測りません: ' + SRC_RELIC.map((a) => a.id).join(','));
  process.exit(3);
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
        let u = decodeURIComponent(rq.url.split('?')[0].split('#')[0]);
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
const LABEL_RE = /^\([0-9A-Za-z-]+\)/;
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
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
}
const PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
];
/* ダンジョン: dragonfighters.* を全部消してから種をまく (タブごとに 1 回) */
async function openIndex(browser, qs, tag, extraWait) {
  const page = await browser.newPage();
  watchErrors(page, 'index' + (qs || '') + ' [' + tag + ']');
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((sd) => {
    try {
      if (sessionStorage.getItem('__vccSeeded')) return;
      sessionStorage.setItem('__vccSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
      kill.forEach((k) => localStorage.removeItem(k));
      sessionStorage.setItem('dragonfighters.currentScenario', sd.sid);
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(sd.party));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.gold', '1000');
    } catch (e) {}
  }, { sid: SID, party: PARTY });
  await page.goto('http://localhost:' + PORT + '/index.html' + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction("typeof allies !== 'undefined' && allies.length > 0 && typeof showResult === 'function' && !!mapData && typeof openClearChest === 'function'" +
    (extraWait ? ' && ' + extraWait : ''), { timeout: 90000 });
  await sleep(300);
  return page;
}
/* 酒場: 伝承の品 (relic-goblin-mine) + ゲート付き (ring-protection) を装身具 1 / 2 に着けたセーブ */
async function openTavern(browser, tag, ls) {
  const page = await browser.newPage();
  watchErrors(page, 'tavern [' + tag + ']');
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((sd) => {
    try {
      if (sessionStorage.getItem('__vccSeeded')) return;
      sessionStorage.setItem('__vccSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
      kill.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('dragonfighters.xp', '6000');
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
      sessionStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
      sessionStorage.setItem('dragonfighters.plazaClock', '21');   /* ★[#102] 闇市は夜だけ開く。時計で揺れないよう夜に固定 */
      for (const k of Object.keys(sd)) localStorage.setItem(k, sd[k]);
    } catch (e) {}
  }, ls || {});
  await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__equipTV && typeof window.__equipTV.accDef === 'function', { timeout: 60000 });
  await sleep(600);
  return page;
}

/* ページ内の道具 (各 evaluate の頭で文字列として埋め込む) */
const PAGE_LIB = `
  var __snap = function () {
    var g = function (k) { return localStorage.getItem(k); };
    return { gold: Number(g('dragonfighters.gold')) || 0, accIds: g('dragonfighters.accessoryIds'), accState: g('dragonfighters.accessoryState'),
      scrolls: g('dragonfighters.scrollStock'), gatedNames: g('dragonfighters.ownedGatedNames'),
      eqW: g('dragonfighters.equipWeaponIdx'), eqA: g('dragonfighters.equipArmorIdx'), allyEquip: g('dragonfighters.allyEquip'),
      acc1: g('dragonfighters.equipAccessory1'), acc2: g('dragonfighters.equipAccessory2') };
  };
  var __lr = function () { var r = sessionStorage.getItem('dragonfighters.lastResult'); return r ? JSON.parse(r) : null; };
  /* 所持 = ownedGatedNames ∪ accessoryIds の名前 / 装備 = リーダーの武器・鎧 + 全員の装身具の名前 */
  var __owned = function () {
    var out = [];
    try { (JSON.parse(localStorage.getItem('dragonfighters.ownedGatedNames') || '[]') || []).forEach(function (n) { out.push(n); }); } catch (e) {}
    try { (JSON.parse(localStorage.getItem('dragonfighters.accessoryIds') || '[]') || []).forEach(function (id) { var a = accessories.find(function (x) { return x.id === id; }); if (a && a.id !== 'none') out.push(a.name); }); } catch (e) {}
    return out;
  };
  var __equipped = function () {
    var out = [];
    var lw = getLeaderWeapons(), la = getLeaderArmors();
    if (lw[currentWeaponIndex]) out.push(lw[currentWeaponIndex].name);
    if (la[currentArmorIndex]) out.push(la[currentArmorIndex].name);
    currentAccessoryIndices.forEach(function (i) { if (accessories[i] && accessories[i].id !== 'none') out.push(accessories[i].name); });
    allies.forEach(function (a) { if (a && Array.isArray(a.accessoryIndices)) a.accessoryIndices.forEach(function (i) { if (accessories[i] && accessories[i].id !== 'none') out.push(accessories[i].name); }); });
    return out;
  };
  var __diffKeys = function (a, b) { return Object.keys(a).filter(function (k) { return a[k] !== b[k]; }); };
  var __win = function () { gameOver = true; resultShown = false; showResult(true); };
  /* 乱数の決め打ち: showResult が**直接**引く 1 回 (clearHit) だけ hit を返す。それ以外は LCG */
  var __pin = function (hit, seed) {
    var orig = Math.random, s = seed >>> 0, hits = 0, calls = 0;
    Math.random = function pinnedRandom() {
      calls++;
      var st = (new Error().stack || '').split('\\n');
      if (st[2] && /\\bshowResult\\b/.test(st[2])) { hits++; return hit; }
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296;
    };
    return { restore: function () { Math.random = orig; }, hits: function () { return hits; }, calls: function () { return calls; } };
  };
`;
const ev = (page, body) => page.evaluate('(() => {' + PAGE_LIB + body + '})()');

const COLOR_PROBE = `(() => {
  const out = {};
  for (const c of ['rarity-epic', 'rarity-rare', '']) {
    const d = document.createElement('div'); d.className = c; d.textContent = 'x'; document.body.appendChild(d);
    const cs = getComputedStyle(d); out[c || 'none'] = { color: cs.color, textShadow: cs.textShadow }; d.remove();
  }
  const rs = getComputedStyle(document.documentElement);
  out.vars = { rare: rs.getPropertyValue('--rarity-rare').trim(), epic: rs.getPropertyValue('--rarity-epic').trim() };
  const rules = { epic: false, rare: false };
  for (const sh of Array.from(document.styleSheets)) {
    let rl = []; try { rl = Array.from(sh.cssRules || []); } catch (e) {}
    for (const r of rl) { const s = r.selectorText || ''; if (/(^|[\\s,])\\.rarity-epic(\\s*$|\\s*,)/.test(s)) rules.epic = true; if (/(^|[\\s,])\\.rarity-rare(\\s*$|\\s*,)/.test(s)) rules.rare = true; }
  }
  out.rules = rules;
  return out;
})()`;

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const T0 = Date.now();
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_clearchests_');
  const server = await startServer().catch((e) => { console.error('[driver] サーバを立てられません (port ' + PORT + '): ' + e.message); process.exit(2); });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profile, '--mute-audio', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 300000 });
  try {
    console.log('[driver] serving ' + ROOT + ' :' + PORT + (INJECTED.length ? '  (変異 ' + INJECTED.join(',') + ')' : '') + '  伝承の品 (ソース) = ' + SRC_RELIC.length);

    /* ══ P1: §0 装置 / (3a) / (1a)(1b) / (3d) ══ */
    let INDEX_COLORS = null, IDX_RELIC_RT = null;
    {
      const p = await openIndex(browser, '', 'P1');
      const r = await ev(p, `
        const out = {};
        out.relicRows = accessories.filter(a => a && a.relic).map(a => ({ id: a.id, name: a.name, gated: a.gated, rarity: a.rarity, relic: a.relic }));
        out.leader = leaderClassKey;
        const pool = buildMagicItemPool();
        out.poolLen = pool.length;
        out.poolKinds = pool.map(q => q.kind);
        out.poolRelic = pool.filter(q => q.kind === 'accessory' && accessories[q.idx] && accessories[q.idx].relic).map(q => accessories[q.idx].id);
        out.questRelic = (() => { const i = questRelicFor('${SID}'); return i >= 0 ? accessories[i].id : null; })();
        __win();
        const lr0 = __lr();
        out.chest0 = lr0 ? ('chest' in lr0) : 'nolr';
        out.nBoxes = document.querySelectorAll('#resultChests .rcBox').length;
        out.after = !!document.querySelector('#resultReward + #resultChests');
        /* 決め打ち: magic (武器) / magic (装身具) / relic */
        const pw = pool.find(q => q.kind === 'weapon') || pool[0];
        const pa = pool.find(q => q.kind === 'accessory' && q !== pw) || pool.find(q => q !== pw);
        const ri = questRelicFor('${SID}');
        clearChestBoxes = [{ kind: 'magic', pick: pw }, { kind: 'magic', pick: pa }, { kind: 'relic', idx: ri }];
        out.names = clearChestBoxes.map(clearChestBoxName);
        out.kinds = [pw && pw.kind, pa && pa.kind, 'relic'];
        out.own0 = __owned(); out.eq0 = __equipped(); out.s0 = __snap();
        out.g = openClearChest(0);
        out.own1 = __owned(); out.eq1 = __equipped(); out.s1 = __snap();
        const lr1 = __lr(); out.chest = lr1 && lr1.chest;
        /* (3d) relicP = 1 相当 (Math.random を常に 0): 3 箱で relic は最大 1 つ */
        const orig = Math.random;
        try { Math.random = () => 0; const bx = rollClearChests(); out.d3 = { n: bx.length, relic: bx.filter(b => b.kind === 'relic').length, kinds: bx.map(b => b.kind) }; }
        catch (e) { out.d3 = { err: String(e) }; }
        finally { Math.random = orig; }
        return out;
      `);
      IDX_RELIC_RT = r.relicRows;
      if (r.relicRows.length !== RELIC_N) {
        console.error('[driver] (0a) 実行時の accessories[] の伝承の品が ' + r.relicRows.length + ' 件 (期待 ' + RELIC_N + ')。測りません');
        try { await browser.close(); } catch (e) {} try { server.close(); } catch (e) {}
        process.exit(3);
      }
      check('(0a) [装置] accessories[] で relic を持つ品 = ' + RELIC_N + ' 件 (ソース ' + SRC_RELIC.length + '・実行時 ' + r.relicRows.length + ')・ガントレットオブオーガパワー = frost-hold・残り 11 品 = relic-<scenarioId>',
        r.relicRows.some((x) => x.id === 'gauntlets-ogre-power' && x.relic === 'frost-hold') &&
        r.relicRows.filter((x) => x.id !== 'gauntlets-ogre-power').every((x) => x.id === 'relic-' + x.relic) && r.questRelic === 'relic-' + SID,
        r.relicRows.map((x) => x.id + '=' + x.relic).join(','));
      check('(0b) [装置] buildMagicItemPool() が戦士リーダー既定のセーブで 1 件以上 (' + r.poolLen + ' 件・武器 ' + r.poolKinds.filter((k) => k === 'weapon').length + '・装身具 ' + r.poolKinds.filter((k) => k === 'accessory').length + ')・宝箱 3 つが #resultReward の直後に描かれ・開ける前の lastResult に chest が無い',
        r.leader === 'warrior' && r.poolLen >= 2 && r.nBoxes === 3 && r.after && r.chest0 === false, { leader: r.leader, nBoxes: r.nBoxes, after: r.after, chest0: r.chest0 });
      check('(3a) buildMagicItemPool() に伝承の品 (relic) が 1 つも無い', r.poolLen > 0 && r.poolRelic.length === 0, r.poolRelic);
      const got = r.names[0], not1 = r.names[1], not2 = r.names[2];
      const addOwn = r.own1.filter((x) => r.own0.indexOf(x) < 0), addEq = r.eq1.filter((x) => r.eq0.indexOf(x) < 0);
      check('(1a) 1 箱目 (' + r.kinds[0] + ': ' + got + ') だけ開ける → 所持 (ownedGatedNames ∪ accessoryIds) と装備にちょうどその 1 品だけ増える・lastResult.chest = opened 0 / granted 同名',
        !!r.g && r.g.granted === got && JSON.stringify(addOwn) === JSON.stringify([got]) && JSON.stringify(addEq) === JSON.stringify([got]) &&
        !!r.chest && r.chest.opened === 0 && r.chest.granted === got && r.chest.boxes.length === 3,
        { g: r.g, addOwn, addEq, chest: r.chest });
      check('(1b) 開けなかった 2 箱 (' + r.kinds[1] + ': ' + not1 + ' / relic: ' + not2 + ') は所持にも装備にも無い・accessoryIds / accessoryState にも無い・金貨は不変',
        !!not1 && !!not2 && r.own1.indexOf(not1) < 0 && r.own1.indexOf(not2) < 0 && r.eq1.indexOf(not1) < 0 && r.eq1.indexOf(not2) < 0 &&
        String(r.s1.accState).indexOf('relic-' + SID) < 0 && String(r.s1.accIds).indexOf('relic-' + SID) < 0 && r.s1.gold === r.s0.gold,
        { own1: r.own1, eq1: r.eq1, gold: [r.s0.gold, r.s1.gold] });
      check('(3d) relicP = 1 相当 (Math.random を常に 0) で rollClearChests() → 3 箱のうち relic はちょうど 1 つ',
        !!r.d3 && r.d3.n === 3 && r.d3.relic === 1, r.d3);
      INDEX_COLORS = await p.evaluate(COLOR_PROBE);
      await p.close();
    }

    /* ══ P2: (2a)(2b) 金貨の箱 ══ */
    {
      const p = await openIndex(browser, '', 'P2');
      const r = await ev(p, `
        __win();
        const rw0 = JSON.stringify((__lr() || {}).reward);
        const ri = questRelicFor('${SID}');
        clearChestBoxes = [{ kind: 'gold', amount: 37 }, { kind: 'relic', idx: ri }, { kind: 'gold', amount: 44 }];
        const s0 = __snap(); const g = openClearChest(0); const s1 = __snap();
        const lr = __lr();
        return { rw0, rw1: JSON.stringify(lr.reward), chest: lr.chest, s0, s1, g, keys: __diffKeys(s0, s1) };
      `);
      check('(2a) 宝箱 (金貨) を開ける前と後で lastResult.reward が完全一致 (JSON 文字列)・reward は実在 (gold を持つ)',
        r.rw0 === r.rw1 && /"gold":\d+/.test(r.rw0), { before: r.rw0, after: r.rw1 });
      check('(2b) 金貨 37 の箱 → dragonfighters.gold が +37 だけ (変わったキーは gold だけ)・lastResult.chest.granted = 37 / grantedKind gold',
        r.s1.gold - r.s0.gold === 37 && r.keys.join() === 'gold' && !!r.chest && r.chest.granted === 37 && r.chest.grantedKind === 'gold' && r.chest.fallback === false,
        { gold: [r.s0.gold, r.s1.gold], keys: r.keys, chest: r.chest });
      await p.close();
    }

    /* ══ P3: (3b) 伝承の品の箱 → 空き枠に着く ══ */
    {
      const p = await openIndex(browser, '', 'P3');
      const r = await ev(p, `
        __win();
        const ri = questRelicFor('${SID}'); const id = accessories[ri].id, nm = accessories[ri].name;
        clearChestBoxes = [{ kind: 'gold', amount: 37 }, { kind: 'relic', idx: ri }, { kind: 'gold', amount: 44 }];
        const s0 = __snap(); const eq0 = __equipped(); const g = openClearChest(1); const s1 = __snap(); const eq1 = __equipped();
        const holders = [];
        if (currentAccessoryIndices.indexOf(ri) >= 0) holders.push('player');
        allies.forEach(a => { if (a && a.classKey && Array.isArray(a.accessoryIndices) && a.accessoryIndices.indexOf(ri) >= 0) holders.push(a.classKey); });
        let st = null; try { st = JSON.parse(s1.accState); } catch (e) {}
        const inState = !!st && ((st.player || []).indexOf(id) >= 0 || Object.keys(st.allies || {}).some(k => (st.allies[k] || []).indexOf(id) >= 0));
        return { id, nm, g, s0, s1, holders, inState, inIds: String(s1.accIds).indexOf(id) >= 0, chest: (__lr() || {}).chest,
          addEq: eq1.filter(x => eq0.indexOf(x) < 0) };
      `);
      check('(3b) 伝承の品 (' + r.nm + ') の箱 → 空き枠の誰か 1 人に着く (' + r.holders.join(',') + ')・savePersistentAccessoryStock の JSON (accessoryState) と accessoryIds に id・金貨は不変・chest.grantedKind relic',
        !!r.g && r.g.kind === 'relic' && r.holders.length === 1 && r.inState && r.inIds && r.s1.gold === r.s0.gold &&
        JSON.stringify(r.addEq) === JSON.stringify([r.nm]) && !!r.chest && r.chest.grantedKind === 'relic' && r.chest.granted === r.nm,
        { g: r.g, holders: r.holders, inState: r.inState, inIds: r.inIds, addEq: r.addEq });
      await p.close();
    }

    /* ══ P4: (3c) 全員の枠が埋まっている → 金貨 50G ══ */
    {
      const p = await openIndex(browser, '', 'P4');
      const r = await ev(p, `
        const ri = questRelicFor('${SID}'); const id = accessories[ri].id;
        const fill = accessories.findIndex(a => a && a.id !== 'none' && !a.relic && !a.classReq);
        currentAccessoryIndices = currentAccessoryIndices.map(() => fill);
        allies.forEach(a => { if (a && Array.isArray(a.accessoryIndices)) a.accessoryIndices = a.accessoryIndices.map(() => fill); });
        const rcpBefore = findAccessoryRecipient(id);
        __win();
        clearChestBoxes = [{ kind: 'gold', amount: 37 }, { kind: 'relic', idx: ri }, { kind: 'gold', amount: 44 }];
        const s0 = __snap(); const eq0 = __equipped(); const g = openClearChest(1); const s1 = __snap(); const eq1 = __equipped();
        return { fill: accessories[fill] && accessories[fill].id, rcpBefore, g, gold: [s0.gold, s1.gold], chest: (__lr() || {}).chest,
          relicEq: eq1.indexOf(accessories[ri].name) >= 0, relicSaved: String(s1.accState).indexOf(id) >= 0 };
      `);
      check('(3c) 全員の装身具の枠が埋まっている (' + r.fill + ' で埋めた・受け取り手 = ' + JSON.stringify(r.rcpBefore) + ') → 伝承の品の箱は金貨 50G (+50・chest.fallback true)・品はどこにも着かない',
        r.rcpBefore === null && !!r.g && r.g.kind === 'gold' && r.g.granted === 50 && r.g.fallback === true && r.gold[1] - r.gold[0] === 50 &&
        !!r.chest && r.chest.fallback === true && r.chest.granted === 50 && !r.relicEq && !r.relicSaved, r);
      await p.close();
    }

    /* ══ P5: (3e) 隠し要素を倒した印 → relicP の切り替え ══ */
    {
      const p = await openIndex(browser, '', 'P5', "typeof enemies !== 'undefined' && enemies.length > 1");
      const r = await ev(p, `
        const out = { consts: [CLEAR_CHEST_RELIC_P, CLEAR_CHEST_RELIC_P_HIDDEN] };
        out.f0 = runHiddenFoeSlain; out.p0 = clearChestRelicP();
        runHiddenFoeSlain = true;  out.pT = clearChestRelicP();
        runHiddenFoeSlain = false; out.pF = clearChestRelicP();
        /* 既存の撃破フック経由 (defeatEnemy → markHiddenFoeSlain) */
        const iH = enemies.findIndex((x, i) => i > 0 && x && x.alive !== false && !(x.def && x.def.multiHead));
        enemies[iH].type = 'goblinChariot';
        defeatEnemy(iH);
        out.fK = runHiddenFoeSlain; out.pK = clearChestRelicP();
        return out;
      `);
      check('(3e) runHiddenFoeSlain の false / true で clearChestRelicP() が CLEAR_CHEST_RELIC_P / _HIDDEN (' + r.consts.join(' / ') + ') に切り替わる・素のラン = false・隠し要素 (goblinChariot) を defeatEnemy で倒すと立つ',
        r.consts[0] === 0.04 && r.consts[1] === 0.20 && r.f0 === false && r.p0 === r.consts[0] && r.pT === r.consts[1] && r.pF === r.consts[0] &&
        r.fK === true && r.pK === r.consts[1], r);
      await p.close();
    }

    /* ══ P6: (4a)(4b) 選ばずに帰る / 二重付与なし ══ */
    {
      const p = await openIndex(browser, '', 'P6');
      const r = await ev(p, `
        window.__navGold = null; window.__navN = 0;
        dfReturnPage = () => { window.__navN++; window.__navGold = Number(localStorage.getItem('dragonfighters.gold')) || 0; return '#stay'; };
        __win();
        clearChestBoxes = [{ kind: 'gold', amount: 21 }, { kind: 'gold', amount: 22 }, { kind: 'gold', amount: 23 }];
        const s0 = __snap(); const rw0 = JSON.stringify((__lr() || {}).reward);
        document.getElementById('resultBtn').click();
        const s1 = __snap(); const lr1 = __lr(); const nav1 = [window.__navN, window.__navGold];
        /* 2 回目: 別の箱のタップの呼び口 + resultBtn */
        const again = openClearChest(lr1 && lr1.chest ? (lr1.chest.opened + 1) % 3 : 1);
        document.getElementById('resultBtn').click();
        const s2 = __snap(); const lr2 = __lr();
        return { s0, s1, s2, chest1: lr1 && lr1.chest, chest2: lr2 && lr2.chest, again, nav1, nav2: window.__navN,
          same: rw0 === JSON.stringify(lr1.reward), keys: __diffKeys(s1, s2) };
      `);
      const d = r.s1.gold - r.s0.gold;
      check('(4a) 箱を開けずに resultBtn → ちょうど 1 箱ぶん (21/22/23 のどれか = +' + d + ') 付与してから遷移 (遷移の瞬間の金貨 = 付与後)・lastResult.chest.opened が 0-2 で granted が同じ額・reward 不変',
        [21, 22, 23].indexOf(d) >= 0 && r.nav1[0] === 1 && r.nav1[1] === r.s1.gold && !!r.chest1 && r.chest1.opened >= 0 && r.chest1.opened <= 2 &&
        r.chest1.granted === d && r.chest1.granted === 21 + r.chest1.opened && r.same, { d, nav1: r.nav1, chest1: r.chest1, same: r.same });
      check('(4b) 開けた後に別の箱を開けようとしても (openClearChest = 箱のタップの呼び口) resultBtn を押しても二重に付与しない (localStorage 不変・chest 不変)',
        r.again === null && r.keys.length === 0 && JSON.stringify(r.chest1) === JSON.stringify(r.chest2) && r.nav2 === 2,
        { again: r.again, keys: r.keys, gold: [r.s1.gold, r.s2.gold], chest2: r.chest2 });
      await p.close();
    }

    /* ══ P7: (5a) ダンジョン側の色 (実際の .rcBox の click) ══ */
    {
      const p = await openIndex(browser, '', 'P7');
      await ev(p, `
        __win();
        const pool = buildMagicItemPool();
        const pa = pool.find(q => q.kind === 'accessory') || pool[0];
        clearChestBoxes = [{ kind: 'magic', pick: pa }, { kind: 'gold', amount: 30 }, { kind: 'relic', idx: questRelicFor('${SID}') }];
        document.querySelectorAll('#resultChests .rcBox')[0].click();
        return true;
      `);
      await sleep(1100);
      const ui = await p.evaluate(() => Array.from(document.querySelectorAll('#resultChests .rcBox')).map((b) => {
        const n = b.querySelector('.rcName'); const t = n && n.querySelector('.rcTag');
        return { box: b.className, cls: n ? n.className : null, text: n ? n.textContent : null, tag: t ? t.textContent : null, color: n ? getComputedStyle(n).color : null };
      }));
      const lr = await p.evaluate(() => JSON.parse(sessionStorage.getItem('dragonfighters.lastResult') || 'null'));
      const [u0, u1, u2] = ui;
      check('(5a) ダンジョン: 箱を実際に click → マジックアイテムの名前 = .rarity-rare (青)・伝承の品の名前 = .rarity-epic (紫) +「伝承」の札・金貨 = .rarity-common・算出色が素の .rarity-* と同じ',
        ui.length === 3 && /\brarity-rare\b/.test(u0.cls) && /\bpicked\b/.test(u0.box) && /\brarity-epic\b/.test(u2.cls) && u2.tag === '伝承' && /\brarity-common\b/.test(u1.cls) &&
        u0.color === INDEX_COLORS['rarity-rare'].color && u2.color === INDEX_COLORS['rarity-epic'].color && u2.color !== INDEX_COLORS.none.color &&
        !!lr && !!lr.chest && lr.chest.opened === 0, { ui, idx: INDEX_COLORS });
      await p.close();
    }

    /* ══ P8-P11: (2c) resultReward の恒等 / (Xa) 撤退 / (Xb) 宝箱が有効なら 1% を付与しない ══ */
    const pinned = async (qs, hit, tag) => {
      const p = await openIndex(browser, qs, tag);
      const r = await ev(p, `
        window.__navN = 0; dfReturnPage = () => { window.__navN++; return '#stay'; };
        const own0 = __owned();
        const pin = __pin(${hit}, 12345);
        try { __win(); } finally { pin.restore(); }
        const html = document.getElementById('resultReward').innerHTML;
        const hasChests = !!document.getElementById('resultChests');
        const own1 = __owned();
        document.getElementById('resultBtn').click();
        const lr = __lr();
        return { html, hasChests, hits: pin.hits(), calls: pin.calls(), on: CLEAR_CHEST_ON, boxesNull: clearChestBoxes === null,
          chestKey: !!lr && ('chest' in lr), addOwn: own1.filter(x => own0.indexOf(x) < 0), nav: window.__navN };
      `);
      await p.close();
      return r;
    };
    const offMiss = await pinned('?clearchest=0', 0.5, 'P8 off/miss');
    const onMiss  = await pinned('', 0.5, 'P9 on/miss');
    check('(2c) 同じ乱数の列 (clearHit = 0.5 で 1% に当たらない) で resultReward.innerHTML が ?clearchest=0 と 1 バイトも同じ・金貨の行が実在・決め打ちが効いた (showResult の直接の 1 回 = ' + onMiss.hits + ' / ' + offMiss.hits + ')',
      onMiss.html === offMiss.html && /金貨 <b>\+\d+<\/b> 獲得/.test(onMiss.html) && onMiss.hits === 1 && offMiss.hits === 1 && onMiss.hasChests && !offMiss.hasChests,
      { on: onMiss.html, off: offMiss.html });
    const offHit = await pinned('?clearchest=0', 0.005, 'P10 off/hit');
    const onHit  = await pinned('', 0.005, 'P11 on/hit');
    const mOff = /✨ 宝物発見: <b>([^<]+)<\/b>/.exec(offHit.html);
    check('(Xa) ?clearchest=0 → #resultChests が無い・clearChestBoxes = null・resultBtn の後も lastResult.chest が無い・clearMagicItem の 1% (clearHit = 0.005) は今どおり付与 (✨ 宝物発見: ' + (mOff ? mOff[1] : '-') + ' が所持に増える)',
      offHit.on === false && !offHit.hasChests && offHit.boxesNull && !offHit.chestKey && offHit.nav === 1 && offHit.hits === 1 &&
      !!mOff && JSON.stringify(offHit.addOwn) === JSON.stringify([mOff[1]]) && !offMiss.chestKey,
      { on: offHit.on, hasChests: offHit.hasChests, chestKey: offHit.chestKey, addOwn: offHit.addOwn, html: offHit.html });
    check('(Xb) 宝箱が有効なら同じ乱数 (clearHit = 0.005) でも ✨ 宝物発見 を出さず何も付与しない (1 回引いて捨てる = 罠 B の 3)・resultBtn で宝箱 1 つを開けて chest が付く',
      onHit.on === true && onHit.hasChests && onHit.hits === 1 && !/宝物発見/.test(onHit.html) && onHit.addOwn.length === 0 && onHit.chestKey && onHit.nav === 1,
      { html: onHit.html, addOwn: onHit.addOwn, chestKey: onHit.chestKey });

    /* ══ T1: (3f) 酒場の表との一致 / (5a) 酒場の装身具チップ / (5b) 酒場の色 ══ */
    {
      const RELIC_ID = 'relic-' + SID;
      const pt = await openTavern(browser, 'T1', {
        'dragonfighters.accessoryIds': JSON.stringify([RELIC_ID, 'ring-protection']),
        'dragonfighters.equipAccessory1': RELIC_ID,
        'dragonfighters.equipAccessory2': 'ring-protection',
      });
      const ids = IDX_RELIC_RT.map((x) => x.id);
      const tvRt = await pt.evaluate((list, keys) => list.map((id) => { const a = window.__equipTV.accDef(id); const o = {}; keys.forEach((k) => { o[k] = a ? a[k] : undefined; }); return o; }), ids, KEYS5);
      /* ソースの表 (配信中のバイト): index の relic 12 行 ↔ 酒場の同じ id の行 / 酒場の relic 行の集合 = index の集合 */
      const srcMism = SRC_RELIC.map((a) => ({ i: pick5(a), t: pick5(SRC_TV.v.find((x) => x && x.id === a.id)) })).filter((x) => JSON.stringify(x.i) !== JSON.stringify(x.t));
      const tvRelicIds = SRC_TV.v.filter((x) => x && x.relic).map((x) => x.id).sort();
      const rtMism = IDX_RELIC_RT.filter((x, i) => JSON.stringify(pick5(x)) !== JSON.stringify(tvRt[i]));
      check('(3f) 伝承の品 ' + RELIC_N + ' 品の id / name / gated / rarity / relic が index accessories[] と酒場 ACCESSORIES_TV で完全一致 (ソースの表 ' + (SRC_RELIC.length - srcMism.length) + '/' + RELIC_N + '・実行時 accDef ' + (IDX_RELIC_RT.length - rtMism.length) + '/' + RELIC_N + ')・酒場で relic を持つ行の集合も同じ',
        srcMism.length === 0 && rtMism.length === 0 && tvRt.length === RELIC_N && JSON.stringify(tvRelicIds) === JSON.stringify(SRC_RELIC.map((a) => a.id).sort()),
        { srcMism: srcMism.slice(0, 3), rtMism: rtMism.slice(0, 3), tvRelicIds });
      const tvColors = await pt.evaluate(COLOR_PROBE);
      const chips = await pt.evaluate(() => {
        window.__equipTV.setTab('warrior');
        window.__equipTV.render();
        return Array.from(document.querySelectorAll('#equipEquippedSummary .equipSlotChip')).filter((d) => /装身具/.test((d.querySelector('.slotLabel') || {}).textContent || '')).map((d) => {
          const v = d.querySelector('.slotVal'); const sub = d.querySelector('.slotSub'); const tg = v && v.querySelector('.relicTag');
          return { label: d.querySelector('.slotLabel').textContent, cls: v ? v.className : null, text: v ? v.textContent : null, color: v ? getComputedStyle(v).color : null,
            tag: tg ? tg.textContent : false, sub: sub ? sub.textContent : null };
        });
      });
      const c1 = chips[0] || {}, c2 = chips[1] || {};
      check('(5a) 酒場: 準備画面の装身具チップ (所持品が出る唯一の場所 = §12-3 決めたこと 1) で 伝承の品 = .rarity-epic・紫・「伝承」の札・下の行「AC +1 ・ ゴブリンの巣窟」/ ゲート付き (ring-protection) = .rarity-rare・青・札なし',
        chips.length === 2 && /\brarity-epic\b/.test(c1.cls) && c1.color === tvColors['rarity-epic'].color && c1.tag === '伝承' && c1.sub === 'AC +1 ・ ゴブリンの巣窟' &&
        /\brarity-rare\b/.test(c2.cls) && c2.color === tvColors['rarity-rare'].color && c2.tag === false && c2.sub === null, chips);
      check('(5b) 酒場に .rarity-epic / .rarity-rare の規則が実在し (styleSheets・クラス無しの要素と色が違う)、素の要素の算出色 (color + text-shadow) と :root の --rarity-rare / --rarity-epic が index と同じ・チップの算出色も index の色',
        tvColors.rules.epic && tvColors.rules.rare && INDEX_COLORS.rules.epic && INDEX_COLORS.rules.rare &&
        tvColors['rarity-epic'].color !== tvColors.none.color && tvColors['rarity-rare'].color !== tvColors.none.color &&
        JSON.stringify(tvColors['rarity-epic']) === JSON.stringify(INDEX_COLORS['rarity-epic']) && JSON.stringify(tvColors['rarity-rare']) === JSON.stringify(INDEX_COLORS['rarity-rare']) &&
        JSON.stringify(tvColors.vars) === JSON.stringify(INDEX_COLORS.vars) && !!tvColors.vars.epic && !!tvColors.vars.rare &&
        c1.color === INDEX_COLORS['rarity-epic'].color && c2.color === INDEX_COLORS['rarity-rare'].color,
        { tv: tvColors, idx: INDEX_COLORS });
      await pt.close();
    }

    check('(9a) pageerror / console error 0 件 (ダンジョン・酒場。favicon の 404 と [DIAG] は除外)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
  } catch (e) {
    console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
    results.push({ name: '(fatal) ' + String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) {}
  }

  /* ══ 集計 ══ */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const labels = Array.from(new Set(results.map((r) => (r.name.match(LABEL_RE) || [''])[0]).filter(Boolean)));
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
    const red = Array.from(new Set(results.filter((r) => !r.ok).map((r) => (r.name.match(LABEL_RE) || [''])[0])));
    const miss = want.filter((w) => red.indexOf(w) < 0);
    const extra = red.filter((w) => want.indexOf(w) < 0);
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + red.join(','));
    console.log('[driver]   担当外の巻き込み: ' + (extra.length ? extra.join(',') : 'なし'));
    if (MUTATIONS[tag].exit3) { console.error('[driver] ✗ ' + tag + ' は装置の検算 (exit 3 で止まるべき) なのに最後まで測れてしまった'); process.exit(1); }
    if (miss.length) { console.error('[driver] ✗ ' + tag + ' の担当の節が赤くなりませんでした (空振り): ' + miss.join(',')); process.exit(1); }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
