/* verify_world_autowalk.js — #109 ワールドマップ: 1 回押せば着くまで歩く + 札は受注中の行き先と街だけ の受入
 *
 *   node tools/verify_world_autowalk.js                        ← 素の受入 (依頼書 §8 の全節)
 *   node tools/verify_world_autowalk.js --negative             ← 負のコントロール 8 本 (1 本ずつ子プロセスで順に)
 *   node tools/verify_world_autowalk.js --negative --only staletoken
 *
 * 依頼書: 実装依頼書/2026-11-06_world-autowalk-quest-signs.md §8 (§12-4 に結果)。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 本番の world.html を実 Chrome (puppeteer-core) で開く。world.html と js/*.js の配信バイトは起動時に凍結する
 *    (残りは初回アクセス時)。
 *  - ✅ ユーザー決定 (§12-2 (1)): __world に窓を足さない。押し口 = __world.goToNode (刻み点 id も受ける) と
 *    拠点 el の実クリック (page.mouse)。観測 = 既存の arrivalCount() / lastArrival() / heroNode() / isMoving() /
 *    askOpen() / revealed() / roadEvent() と DOM の .worldSign / .worldSeal / #worldEventBox。
 *    撤退は URL と sessionStorage (dragonfighters.autoWalkOff / dragonfighters.questSignOff) で見る。
 *  - 1 腕 = 1 タブ (browser.newPage)。sessionStorage はタブごとに独立 = 撤退の腕が素の腕へ漏れない。
 *    ⚠ localStorage はタブ間で共有なので、腕ごとに dragonfighters.* を消してから cleared を撒き直す。
 *  - 出来事は ?roadseed=N で決定論。(0b) は **?autowalk=0 の腕で押し直しながら** 出来事が開く種を探す
 *    (自動歩行そのものを壊す変異の下でも種探しが空振りしないため)。見つからなければ exit 3。
 *  - ⛔ 本番に検証専用の行を足さない。⛔ 歩く速さ・カメラ・点ごとの一瞬の止まり・札の見た目は測らない (§8 ⛔)。
 *
 * ── 依頼書 §8 からの言い直し (§12-4 に同じ記録) ─────────────────────────────
 *  - 「__world.goToPoint」→ __world.goToNode (§12-1 (2)-B。中身は goToPoint そのもの)。
 *  - 「signed() / autoWalkOn() / walkToken()」→ 窓は無い。札は .worldSign の親の data-node、撤退は sessionStorage。
 *  - (1d) は 2 腕: ① ?roadevent=0 で歩行中に別の拠点を押す ② 罠 B の本丸 = 出来事で立ち止まる →
 *    器を開いたまま goToNode(別の拠点) → 新しい歩きの途中で『先へ進む』(古い続きが新しい行き先を奪わない)。
 *    ⚠ ① だけだと変異 staletoken は空振りする (walkPath の pendingArrive 差し替えが古い続きを先に殺す・§12-2 (6))。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 *  - アンカーは手つかずの原本で 1 件ちょうどを起動時に確かめる (素の走行でも)。0 件 / 2 件以上 /
 *    置換前後が同じ長さ / 改行を含む / 置換文字列が原本に既に在る / 他の tools/*.js に同じ文字列がある なら exit 3。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は一覧に出す。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 / 3 = 変異アンカーの腐敗 または (0b) 空振り
 * port: 10720 (このチケットの割当)。⛔ timeout コマンドで包まない (孤児の node がポートを掴む)。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10720'), 10);
const SEED_MAX = 40;

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
for (const rel of ['world.html'].concat(JS_FILES)) {
  if (!frozen(rel)) { console.error('[driver] ' + rel + ' が読めません'); process.exit(2); }
}
const PRISTINE = { 'world.html': frozen('world.html').toString('utf8') };

/* 変異 (依頼書 §8 の表 + §12-2 (6) / §12-3 (6) の注入先)。edits = [[file, anchor, patch], ...]。1 行に収める。 */
const MUTATIONS = {
  onehop: { expect: ['(1a)', '(2b)'], why: '自動の続きを呼ばない (#40 の 1 タップ = 1 ホップ)',
    edits: [['world.html', '        if (last === id || walkStepOff || !AUTO_WALK_ON) return;', '        return; /* mut-onehop */']] },
  staletoken: { expect: ['(1d)'], why: '⭐ 罠 B: 続きでトークンを見ない (番号検査 2 か所 + goToPoint の autoResume = null をまとめて外す)',
    edits: [['world.html', '      if (my !== walkSeq) return;                           /* 古い続きは捨てる (罠 B) */', '      /* mut-staletoken-1 */'],
            ['world.html', '        if (my !== walkSeq) return;', '        /* mut-staletoken-2 */'],
            ['world.html', '      autoResume = null;', '      /* mut-staletoken-3 */']] },
  passenter: { expect: ['(1c)'], why: '⭐ 罠 C: 続きのホップで destId を次の 1 点へ書き換える',
    edits: [['world.html', '        var opened = onArriveStep(last, id);', '        var opened = onArriveStep(last, last); /* mut-passenter */']] },
  noresume: { expect: ['(2b)'], why: '⭐ 罠 A: 街道の出来事の showResult の onDone を null のまま',
    edits: [['world.html', 'RE.showResult(ev, text, resumeAutoWalk, boon);', 'RE.showResult(ev, text, null, boon); /* mut-noresume */']] },
  noeventstop: { expect: ['(2a)'], why: '出来事が開いても止まらず歩き続ける',
    edits: [['world.html', '        if (opened) { autoResume = function () { stepToward(id, my); }; return; }', '        void opened; /* mut-noeventstop */']] },
  allsigns: { expect: ['(3a)', '(3b)'], why: '札の条件を isNodeRevealed のまま (解放済み全部に札)',
    edits: [['world.html', '        var shown = isSignShown(id);           /* ★[#109] 札は受注中の行き先と街だけ */', '        var shown = isNodeRevealed(id); /* mut-allsigns */']] },
  nophlan: { expect: ['(3a)', '(0c)'], why: '街 (SITES に居ない拠点) も受注判定にかける',
    edits: [['world.html', '      if (!sc) return true;                              /* 街 = phlan */', '      if (!sc) return false; /* mut-nophlan */']] },
  deadnode: { expect: ['(3c)'], why: '札の無い拠点の当たり判定を消す',
    edits: [['world.html', '        el.setAttribute("data-kind", n.kind);', '        el.setAttribute("data-kind", n.kind); if (n.kind === "site" && !shown) el.style.pointerEvents = "none"; /* mut-deadnode */']] },
};
const MUT_ORDER = ['onehop', 'staletoken', 'passenter', 'noresume', 'noeventstop', 'allsigns', 'nophlan', 'deadnode'];

/* 起動時の検算 (素の走行でも必ず) */
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
  for (const file of Object.keys(work)) SNAPSHOT.set(file, Buffer.from(work[file], 'utf8'));
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
    const r = spawnSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    process.stdout.write(r.stderr || '');
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
        let u = decodeURIComponent(rq.url.split('?')[0].split('#')[0]);
        if (u === '/') u = '/world.html';
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

const CLEARED_ALL = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const TOWN = { 'dragonfighters.exitVia': 'town' };   /* 港町から出た = phlan に立つ */
const QUIET = '?roadevent=0&ambush=0';

/* 1 腕 = 1 タブ。localStorage の dragonfighters.* を消して cleared を撒き、sessionStorage を撒く (タブごとに 1 回)。 */
async function openWorld(browser, o) {
  const page = await browser.newPage();
  watchErrors(page, 'world' + (o.qs || '') + ' [' + o.tag + ']');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((sd) => {
    try {
      if (sessionStorage.getItem('__vwaSeeded')) return;
      sessionStorage.setItem('__vwaSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
      kill.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('dragonfighters.cleared', JSON.stringify(sd.cleared));
      for (const k of Object.keys(sd.ss)) sessionStorage.setItem(k, sd.ss[k]);
    } catch (e) {}
  }, { cleared: o.cleared || [], ss: o.ss || {} });
  await page.goto('http://localhost:' + PORT + '/world.html' + (o.qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__world && !!window.WORLD_MAP && typeof window.__world.goToNode === 'function', { timeout: 60000 });
  await sleep(350);
  return page;
}
async function reload(page, qs) {
  await page.goto('http://localhost:' + PORT + '/world.html' + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__world && !!window.WORLD_MAP, { timeout: 60000 });
  await sleep(350);
}
async function waitFor(page, pred, ms, arg1) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let v = false;
    try { v = await page.evaluate(pred, arg1); } catch (e) { return 'err:' + e.message; }
    if (v) return true;
    await sleep(100);
  }
  return false;
}
const ST = (page) => page.evaluate(() => ({
  at: __world.heroNode(), moving: __world.isMoving(), n: __world.arrivalCount(), last: __world.lastArrival(),
  ask: __world.askOpen(), box: !!document.querySelector('#worldEventBox.show'), path: location.pathname,
  btns: Array.from(document.querySelectorAll('#worldEventBox .worldEventBtn')).map((b) => b.textContent),
}));
const signsOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.worldSign')).map((s) => s.parentElement && s.parentElement.getAttribute('data-node')).sort());
const sealsOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.worldSeal')).map((s) => { const n = s.closest('[data-node]'); return n && n.getAttribute('data-node'); }).sort());
const revealedOf = (page) => page.evaluate(() => __world.revealed().slice().sort());
const ssOf = (page) => page.evaluate(() => ({ aw: sessionStorage.getItem('dragonfighters.autoWalkOff'), qs: sessionStorage.getItem('dragonfighters.questSignOff') }));
/* 拠点 el の中心を実クリックする (当たり判定 = elementFromPoint を先に採る)。⚠ 採ってから押すまで何も挟まない */
async function clickNode(page, id) {
  const pt = await page.evaluate((nid) => {
    const el = document.querySelector('[data-node="' + nid + '"]'); if (!el) return null;
    const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const h = document.elementFromPoint(x, y); const n = h && h.closest('[data-node]');
    return { x, y, hit: n ? n.getAttribute('data-node') : (h ? (h.id || h.tagName) : null) };
  }, id);
  if (pt) await page.mouse.click(pt.x, pt.y);
  return pt;
}
/* 器 (#worldEventBox) の判定なしの枝を押し、「先へ進む」が出るまで待つ。押したら true */
async function chooseNoCheck(page) {
  const k = await page.evaluate(() => {
    const RE = window.ROAD_EVENTS; const btns = Array.from(document.querySelectorAll('#worldEventBox .worldEventBtn'));
    const labels = btns.map((b) => b.textContent);
    const isAmb = !!(RE.AMBUSH && (RE.AMBUSH.choices || []).some((c) => labels.indexOf(c.label) >= 0));
    const E = isAmb ? RE.AMBUSH : RE.byId(__world.roadEvent().last.event);
    let idx = (E && E.choices || []).findIndex((c) => !c.check);
    if (idx < 0) idx = 0;
    if (!btns[idx]) return null;
    btns[idx].click();
    return { kind: isAmb ? 'ambush' : 'event', idx, label: labels[idx] };
  });
  if (!k) return null;
  const shown = await waitFor(page, () => Array.from(document.querySelectorAll('#worldEventBox .worldEventBtn')).some((b) => b.textContent === '先へ進む'), 15000);
  return shown === true ? k : null;
}
const clickProceed = (page) => page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('#worldEventBox .worldEventBtn')).find((x) => x.textContent === '先へ進む');
  if (b) b.click(); return !!b;
});
/* 目的地まで見守る。器が開いたら記録 (開いた瞬間 + 1.2 秒後) → 判定なしの枝 →「先へ進む」。
 * ⛔ goToNode をもう一度呼ばない (= 1 回押しただけで着くか)。止まったまま 5 秒動かなければ打ち切り。 */
async function watchWalk(page, dest, maxMs) {
  const opens = [], asksBefore = [];
  let idleSince = null, arrived = false;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    let s;
    try { s = await ST(page); } catch (e) { return { arrived: false, opens, asksBefore, err: String(e.message || e), final: null }; }
    if (s.path !== '/world.html') return { arrived: false, opens, asksBefore, left: s.path, final: s };
    if (s.ask && s.at !== dest) asksBefore.push(s.at);
    if (s.at === dest && !s.moving && !s.box) { arrived = true; break; }
    if (s.box) {
      await sleep(1200);
      const s2 = await ST(page);
      const ch = await chooseNoCheck(page);
      opens.push({ s, s2, choice: ch });
      if (!ch) break;
      await sleep(500);
      await clickProceed(page);
      await sleep(200);
      idleSince = null;
      continue;
    }
    if (!s.moving) { if (idleSince === null) idleSince = Date.now(); else if (Date.now() - idleSince > 5000) break; }
    else idleSince = null;
    await sleep(100);
  }
  let final = null; try { final = await ST(page); } catch (e) {}
  return { arrived, opens, asksBefore, final };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const T0 = Date.now();
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_worldautowalk_');
  const server = await startServer().catch((e) => { console.error('[driver] サーバを立てられません (port ' + PORT + '): ' + e.message); process.exit(2); });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profile, '--mute-audio', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 300000 });
  let exit3 = null;
  try {
    console.log('[driver] serving ' + ROOT + ' :' + PORT + (INJECTED.length ? '  (変異 ' + INJECTED.join(',') + ')' : ''));

    /* ══ W0: §0 (0a)(0c) / (1a) 実クリック 1 回で temple まで / (3a)(3d) 受注なし・未クリア ══ */
    let LEN_T = 0, PATH_T = [], REV_NONE = null;
    {
      const p = await openWorld(browser, { qs: QUIET, ss: TOWN, tag: 'W0' });
      const r0 = await p.evaluate(() => ({ at: __world.heroNode(), path: WORLD_MAP.findWalkPath('phlan', 'temple'), n0: __world.arrivalCount() }));
      LEN_T = r0.path ? r0.path.length : 0; PATH_T = r0.path || [];
      check('(0a) [装置] phlan → temple の findWalkPath が 2 ホップ以上 (' + LEN_T + ')・主人公は phlan に立つ', r0.at === 'phlan' && LEN_T >= 2, r0);
      const sg = await signsOf(p);
      check('(0c) [装置] .worldSign が 1 枚以上ある (phlan): ' + JSON.stringify(sg), sg.length >= 1 && sg.indexOf('phlan') >= 0, sg);
      REV_NONE = await revealedOf(p);
      const s0 = await sealsOf(p);
      check('(3a) 受注なし (questDest 無し・未クリア) → .worldSign は phlan の 1 枚だけ・封蝋 0', JSON.stringify(sg) === '["phlan"]' && s0.length === 0, { sg, s0 });
      const pt = await clickNode(p, 'temple');
      const w = await watchWalk(p, 'temple', 90000);
      const n1 = w.final ? w.final.n : -1;
      check('(1a) ?roadevent=0 で phlan から temple を 1 回だけ実クリック (中心の命中 = ' + (pt && pt.hit) + ') → heroNode = temple・arrivalCount の増分 = findWalkPath の長さ (' + LEN_T + ')',
        !!pt && pt.hit === 'temple' && w.arrived && w.final.at === 'temple' && n1 - r0.n0 === LEN_T && w.opens.length === 0,
        { hit: pt && pt.hit, arrived: w.arrived, final: w.final && { at: w.final.at, n: w.final.n, path: w.final.path }, d: n1 - r0.n0, opens: w.opens.length });
      check('(1b) 受注先でない temple に着いた後 askOpen() は false (途中でも開かない)', w.arrived && w.final.ask === false && w.asksBefore.length === 0, { ask: w.final && w.final.ask, asksBefore: w.asksBefore });
      await p.close();
    }

    /* ══ W1: (1b) 受注先 (questDest = undead-temple) は着いたら入場ダイアログ・途中では開かない (押し口 = __world.goToNode) ══ */
    {
      const p = await openWorld(browser, { qs: QUIET, ss: Object.assign({ 'dragonfighters.questDest': 'undead-temple' }, TOWN), cleared: CLEARED_ALL, tag: 'W1' });
      const n0 = await p.evaluate(() => __world.arrivalCount());
      await p.evaluate(() => __world.goToNode('temple'));
      const w = await watchWalk(p, 'temple', 90000);
      await sleep(300);
      const ask = await p.evaluate(() => __world.askOpen());
      check('(1b) questDest = undead-temple で goToNode(temple) 1 回 → temple に着いて askOpen() = true・途中の点では開かない・arrivalCount の増分 = ' + LEN_T,
        w.arrived && ask === true && w.asksBefore.length === 0 && w.final.n - n0 === LEN_T, { arrived: w.arrived, ask, asksBefore: w.asksBefore, d: w.final && w.final.n - n0 });
      await p.close();
    }

    /* ══ W2: (1c) pier → forest は phlan を通っても world.html のまま (罠 C) ══ */
    {
      const p = await openWorld(browser, { qs: QUIET, ss: {}, tag: 'W2' });
      const r0 = await p.evaluate(() => ({ at: __world.heroNode(), path: WORLD_MAP.findWalkPath('pier', 'forest'), n0: __world.arrivalCount() }));
      await p.evaluate(() => __world.goToNode('forest'));
      const w = await watchWalk(p, 'forest', 60000);
      let url = ''; try { url = p.url(); } catch (e) {}
      check('(1c) pier から forest を 1 回押す (経路に phlan を含む: ' + (r0.path || []).indexOf('phlan') + ') → forest に着き location.pathname は /world.html のまま',
        r0.at === 'pier' && (r0.path || []).indexOf('phlan') >= 0 && w.arrived && !w.left && /\/world\.html/.test(url) && w.final.n - r0.n0 === r0.path.length,
        { at0: r0.at, arrived: w.arrived, left: w.left || null, url: url.replace(/^https?:\/\/[^/]+/, ''), d: w.final && w.final.n - r0.n0, len: r0.path && r0.path.length });
      await p.close();
    }

    /* ══ W3: (1d) ① 歩いている途中に別の拠点を押す → 最後に着いたのは後から押した点 ══ */
    {
      const p = await openWorld(browser, { qs: QUIET, ss: TOWN, tag: 'W3' });
      await p.evaluate(() => __world.goToNode('temple'));
      await sleep(2500);
      const mid = await ST(p);
      await p.evaluate(() => __world.goToNode('pier'));
      const w = await watchWalk(p, 'pier', 60000);
      await sleep(2500);
      const fin = await ST(p);
      check('(1d) ① ?roadevent=0 で temple へ歩く途中 (' + mid.at + '・moving ' + mid.moving + ') に pier を押す → pier に着いて留まる・lastArrival.dest = pier',
        mid.moving && mid.at !== 'temple' && w.arrived && fin.at === 'pier' && !fin.moving && fin.last && fin.last.dest === 'pier' && fin.path === '/world.html',
        { mid: { at: mid.at, moving: mid.moving }, fin: { at: fin.at, moving: fin.moving, last: fin.last } });
      await p.close();
    }

    /* ══ (0b) 出来事が開く種を探す — ?autowalk=0 の腕で押し直しながら (自動歩行を壊す変異の下でも空振りしない) ══ */
    let SEED = null, SEED_AT = null;
    for (let seed = 1; seed <= SEED_MAX && SEED === null; seed++) {
      const p = await openWorld(browser, { qs: '?ambush=0&autowalk=0&roadseed=' + seed, ss: TOWN, tag: 'seed' + seed });
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
        const s = await ST(p);
        if (s.box) { SEED = seed; SEED_AT = s.at; break; }
        if (s.at === 'temple' && !s.moving) break;
        if (!s.moving) { await p.evaluate(() => __world.goToNode('temple')); await sleep(250); }
        await sleep(100);
      }
      await p.close();
    }
    check('(0b) [装置] 出来事が少なくとも 1 回開く種がある (?roadseed=' + SEED + '・最初に開く点 ' + SEED_AT + '・?autowalk=0 で押し直して探した)', SEED !== null, { SEED, SEED_AT });
    if (SEED === null) { exit3 = '(0b) ?roadseed=1..' + SEED_MAX + ' のどれでも phlan → temple の途中で出来事が開かない (空振り)'; throw new Error(exit3); }

    /* ══ W4: §2 (2a)(2b)(2c) 出来事で止まって続く — 1 回だけ押す ══ */
    {
      const p = await openWorld(browser, { qs: '?ambush=0&roadseed=' + SEED, ss: TOWN, tag: 'W4' });
      const n0 = await p.evaluate(() => __world.arrivalCount());
      await p.evaluate(() => __world.goToNode('temple'));
      const w = await watchWalk(p, 'temple', 150000);
      const re = await p.evaluate(() => __world.roadEvent());
      const stops = w.opens.map((o) => ({ at: o.s.at, mv: o.s.moving, at2: o.s2.at, mv2: o.s2.moving, n: o.s.n, n2: o.s2.n, ch: o.choice && o.choice.label }));
      check('(2a) 出来事が開いた時点で isMoving() = false・heroNode() は経路の途中 (temple でない・findWalkPath に載る点)・1.2 秒後も同じ点で arrivalCount 不変 (' + w.opens.length + ' 回)',
        w.opens.length >= 1 && w.opens.every((o) => !o.s.moving && !o.s2.moving && o.s.at !== 'temple' && PATH_T.indexOf(o.s.at) >= 0 && o.s2.at === o.s.at && o.s2.n === o.s.n),
        stops);
      check('(2b) 判定なしの枝 →「先へ進む」→ もう 1 回押さずに temple まで歩いて着く (arrivalCount の増分 = ' + LEN_T + ')',
        w.opens.length >= 1 && w.opens.every((o) => !!o.choice) && w.arrived && w.final.at === 'temple' && w.final.n - n0 === LEN_T,
        { arrived: w.arrived, at: w.final && w.final.at, d: w.final && w.final.n - n0, opens: w.opens.length });
      const ats = w.opens.map((o) => o.s.at);
      const dupOpen = ats.filter((a, i) => ats.indexOf(a) !== i);
      const dupVis = re.visited.filter((a, i) => re.visited.indexOf(a) !== i);
      check('(2c) 1 本の歩きの中で同じ点で 2 回開かない (開いた点 ' + JSON.stringify(ats) + '・roadEvent().fired = ' + re.fired + ')',
        w.opens.length >= 1 && dupOpen.length === 0 && dupVis.length === 0 && re.fired === w.opens.length, { ats, fired: re.fired, visited: re.visited });
      await p.close();
    }

    /* ══ W5: (1d) ② 罠 B の本丸 — 出来事で立ち止まる → 器を開いたまま goToNode(別の拠点) → 新しい歩きの途中で「先へ進む」 ══ */
    {
      const p = await openWorld(browser, { qs: '?ambush=0&roadseed=' + SEED, ss: TOWN, tag: 'W5' });
      await p.evaluate(() => __world.goToNode('temple'));
      const opened = await waitFor(p, () => !!document.querySelector('#worldEventBox.show'), 90000);
      const s0 = await ST(p);
      let detail = { opened, at: s0.at };
      let pass = false;
      if (opened === true && s0.at !== 'temple') {
        await sleep(500);
        const ch = await chooseNoCheck(p);
        /* 別の拠点 B = phlan / temple / いま立つ点 / いまから temple への経路上 以外で、いま立つ点から 2 ホップ以上の拠点
           (着いても何も開かない = questDest 無し。経路外なので「古い続きが temple へ連れ去る」と B に居ないことが必ず見える) */
        const B = await p.evaluate(() => {
          const N = WORLD_MAP.NODES, here = __world.heroNode(), ahead = WORLD_MAP.findWalkPath(here, 'temple') || [];
          const c = Object.keys(N).filter((id) => N[id].kind === 'site' && !N[id].enter && id !== 'temple' && id !== here && ahead.indexOf(id) < 0)
            .map((id) => ({ id, len: (WORLD_MAP.findWalkPath(here, id) || []).length })).filter((x) => x.len >= 2)
            .sort((a, b) => a.len - b.len || (a.id < b.id ? -1 : 1));
          return c.length ? c[0].id : null;
        });
        await p.evaluate((b) => __world.goToNode(b), B);
        await sleep(250);
        const mv = await ST(p);
        const proceeded = await clickProceed(p);
        const w = await watchWalk(p, B, 120000);
        await sleep(2500);
        const fin = await ST(p);
        detail = { at0: s0.at, choice: ch && ch.label, B, movingWhenProceed: mv.moving, boxStillOpen: mv.box, proceeded, arrived: w.arrived, fin: { at: fin.at, moving: fin.moving, last: fin.last } };
        pass = !!ch && !!B && mv.moving && mv.box && proceeded && w.arrived && fin.at === B && !fin.moving && fin.last && fin.last.dest === B;
      }
      check('(1d) ② 出来事で立ち止まり (器を開いたまま) 別の拠点を goToNode → 新しい歩きの途中で「先へ進む」→ 古い行き先 temple へは戻らず後から押した拠点に着いて留まる',
        pass, detail);
      await p.close();
    }

    /* ══ W6: §3 (3a)(3b)(3c)(3d) 札 — 全部クリア (解放済みの拠点 13) ══ */
    let REV_ALL = null, REV_Q = null, SITE_REV_ALL = null;
    {
      const p = await openWorld(browser, { qs: QUIET, ss: TOWN, cleared: CLEARED_ALL, tag: 'W6a' });
      const sg = await signsOf(p);
      REV_ALL = await revealedOf(p);
      SITE_REV_ALL = await p.evaluate(() => __world.revealed().filter((id) => WORLD_MAP.NODES[id].kind === 'site').sort());
      const sl = await sealsOf(p);
      check('(3a) 受注なし・全部クリア (解放済みの拠点 ' + SITE_REV_ALL.length + ') → .worldSign は phlan の 1 枚だけ・封蝋 0', SITE_REV_ALL.length >= 3 && JSON.stringify(sg) === '["phlan"]' && sl.length === 0, { sg, sl, sites: SITE_REV_ALL.length });
      await p.close();
    }
    {
      const p = await openWorld(browser, { qs: QUIET, ss: Object.assign({ 'dragonfighters.questDest': 'goblin-mine' }, TOWN), cleared: CLEARED_ALL, tag: 'W6b' });
      const sg = await signsOf(p), sl = await sealsOf(p);
      REV_Q = await revealedOf(p);
      check('(3b) questDest = goblin-mine → 札は phlan と mine の 2 枚・封蝋 (.worldSeal) は mine の札だけ', JSON.stringify(sg) === '["mine","phlan"]' && JSON.stringify(sl) === '["mine"]', { sg, sl });
      /* (3c) 札の無い解放済みの拠点 forest */
      const geo = await p.evaluate(() => {
        const el = document.querySelector('[data-node="forest"]'); const q = document.querySelector('[data-node="phlan"]');
        const r = el.getBoundingClientRect(), rq = q.getBoundingClientRect();
        return { kind: el.getAttribute('data-kind'), cls: el.className, title: el.title, css: getComputedStyle(el).width, cssH: getComputedStyle(el).height,
          w: Math.round(r.width), h: Math.round(r.height), pw: Math.round(rq.width), sign: !!el.querySelector('.worldSign'), revealed: __world.revealed().indexOf('forest') >= 0 };
      });
      const n0 = await p.evaluate(() => __world.arrivalCount());
      const pt = await clickNode(p, 'forest');
      const w = await watchWalk(p, 'forest', 60000);
      await sleep(400);
      const after = await ST(p);
      check('(3c) 札の無い解放済みの forest: data-kind=site・worldNode-way・title なし・当たり判定 CSS 44px (札のある phlan と同じ実寸) → 実クリック (中心の命中 = ' + (pt && pt.hit) + ') で歩いて着く・入場ダイアログは開かない・world.html のまま',
        geo.revealed && !geo.sign && geo.kind === 'site' && /worldNode-way/.test(geo.cls) && !geo.title && geo.css === '44px' && geo.cssH === '44px' && geo.w === geo.pw &&
        !!pt && pt.hit === 'forest' && w.arrived && after.at === 'forest' && after.n > n0 && after.ask === false && after.path === '/world.html',
        { geo, hit: pt && pt.hit, arrived: w.arrived, after: { at: after.at, ask: after.ask, path: after.path } });
      await p.close();
    }

    /* ══ W7: §4 (Xb) ?questsign=0 → 解放済み全部に札 (別タブ) ══ */
    let REV_OFF = null;
    {
      const p = await openWorld(browser, { qs: QUIET + '&questsign=0', ss: TOWN, cleared: CLEARED_ALL, tag: 'W7' });
      const sg = await signsOf(p); const ss = await ssOf(p);
      REV_OFF = await revealedOf(p);
      await reload(p, QUIET);
      const sg2 = await signsOf(p);
      check('(Xb) ?questsign=0 → 札 = 解放済みの拠点全部 (' + sg.length + ' 枚 = revealed の site)・sessionStorage questSignOff = "1"・クエリ無しの再読込でも撤退のまま',
        sg.length >= 3 && JSON.stringify(sg) === JSON.stringify(SITE_REV_ALL) && ss.qs === '1' && JSON.stringify(sg2) === JSON.stringify(sg), { n: sg.length, sg, ss, n2: sg2.length });
      await p.close();
    }
    check('(3d) revealed() は札の規則で変わらない: 受注なし = 受注あり = ?questsign=0 (全部クリア・' + (REV_ALL || []).length + ' 件)・未クリア (' + (REV_NONE || []).length + ' 件) はその真部分集合 (解放の鎖が効いている)',
      !!REV_ALL && JSON.stringify(REV_ALL) === JSON.stringify(REV_Q) && JSON.stringify(REV_ALL) === JSON.stringify(REV_OFF) &&
      REV_NONE.length < REV_ALL.length && REV_NONE.every((id) => REV_ALL.indexOf(id) >= 0),
      { all: (REV_ALL || []).length, q: (REV_Q || []).length, off: (REV_OFF || []).length, none: (REV_NONE || []).length });

    /* ══ W8: §4 (Xa) ?autowalk=0 → 1 タップ = 1 ホップ (別タブ) ══ */
    {
      const p = await openWorld(browser, { qs: QUIET + '&autowalk=0', ss: TOWN, tag: 'W8' });
      const n0 = await p.evaluate(() => __world.arrivalCount());
      await p.evaluate(() => __world.goToNode('temple'));
      await sleep(4000);
      const r = await ST(p); const ss = await ssOf(p);
      await reload(p, QUIET);
      const m0 = await p.evaluate(() => __world.arrivalCount());
      await p.evaluate(() => __world.goToNode('temple'));
      await sleep(4000);
      const r2 = await ST(p);
      check('(Xa) ?autowalk=0 → goToNode(temple) 1 回で arrivalCount が 1 だけ増えて止まる・sessionStorage autoWalkOff = "1"・クエリ無しの再読込でも 1 ホップ',
        r.n - n0 === 1 && r.at !== 'temple' && !r.moving && ss.aw === '1' && r2.n - m0 === 1 && r2.at !== 'temple' && !r2.moving,
        { d: r.n - n0, at: r.at, aw: ss.aw, d2: r2.n - m0, at2: r2.at });
      await p.close();
    }

    /* ══ W9: §4 (Xc) 2 本は独立 (別タブ 2 つ) ══ */
    {
      const p = await openWorld(browser, { qs: QUIET + '&questsign=0', ss: TOWN, tag: 'W9a' });
      const r0 = await p.evaluate(() => ({ n0: __world.arrivalCount(), len: WORLD_MAP.findWalkPath('phlan', 'swamp').length }));
      await p.evaluate(() => __world.goToNode('swamp'));
      const w = await watchWalk(p, 'swamp', 60000);
      const ss = await ssOf(p);
      await p.close();
      const q = await openWorld(browser, { qs: QUIET + '&autowalk=0', ss: TOWN, cleared: CLEARED_ALL, tag: 'W9b' });
      const sg = await signsOf(q); const ss2 = await ssOf(q);
      await q.close();
      check('(Xc) ?questsign=0 だけ → 自動歩行は生きている (goToNode(swamp) 1 回で ' + r0.len + ' ホップ)・autoWalkOff は立たない / ?autowalk=0 だけ → 札は新しい姿 (全部クリアでも phlan 1 枚)・questSignOff は立たない',
        r0.len >= 2 && w.arrived && w.final.n - r0.n0 === r0.len && ss.aw === null && ss.qs === '1' &&
        JSON.stringify(sg) === '["phlan"]' && ss2.qs === null && ss2.aw === '1',
        { len: r0.len, arrived: w.arrived, d: w.final && w.final.n - r0.n0, ss, sg, ss2 });
    }

    check('(9a) pageerror / console error 0 件 (favicon の 404 と [DIAG] は除外)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
  } catch (e) {
    if (!exit3) {
      console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
      results.push({ name: '(fatal) ' + String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
    }
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) {}
  }
  if (exit3) { console.error('[driver] ' + exit3 + ' — 測りません (exit 3)'); process.exit(3); }

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
    if (miss.length) { console.error('[driver] ✗ ' + tag + ' の担当の節が赤くならなかった (空振り): ' + miss.join(',')); process.exit(1); }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
