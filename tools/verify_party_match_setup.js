#!/usr/bin/env node
/*
 * verify_party_match_setup.js — 実装依頼書 #35「マッチング画面で全員分のスキルと傾向を設定する」
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_party_match_setup.js [--headful] [--port N] [--browser <path>]
 *   node tools/verify_party_match_setup.js --negative            ← 負のコントロール
 *   node tools/verify_party_match_setup.js --negative --only M1  ← 1 本だけ注入
 *
 * ── セクションと実装状況 ─────────────────────────────────────────────────
 *   §0 装置 (母集団 / 出発の口が開く順番)          … 実装済 (STEP1 = 項目1)
 *   §1 出発の口 #pmDepart                          … 実装済 (STEP1 = 項目1)
 *   §2 伝播 (click / touchend を飲み込む)          … 実装済 (STEP1 = 項目1)
 *   §3 引き出しの中身                              … PENDING (STEP2 = 項目2)
 *   §4 同職 2 人 / レイアウト                      … PENDING (STEP2〜3)
 *   §5 恒等 (非退行)                               … PENDING (STEP2)
 *   §6 撤退スイッチ ?pmsetup=0 / ?actionpri=0      … PENDING (STEP3 = 項目3)
 *
 *   ⛔ PENDING は **黙って緑にしない**。RESULT 行に PASSED / FAILED / PENDING の
 *      3 つの数を必ず出し、「まだ測っていない」を数で見えるようにする。
 *
 * ── ⚠ この装置が測る「本丸」 ───────────────────────────────────────────
 *   #19 はこの画面へ設定 UI を置くのを **明示的に不採用**にしていた。理由は
 *   「閉じる経路が onTap ただ 1 つ = 画面のどこを叩いても出発する」。#35 はその判断を
 *   覆すので、**背景タップ = 出発が本当に廃止されたか**が最重要 = (1a)。
 *
 * ── ⚠ 計測機構 (踏みやすい罠) ───────────────────────────────────────────
 *  - ROOT は必ず path.resolve を通す。区切りのまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない。
 *  - **openPrep() を await してはいけない**。マッチング演出はタップを待って止まるので
 *    headless では永久に固まる。発火だけさせてポーリングする
 *    (手本 = driver_action_priority.js の openPrepScreen)。
 *  - ⚠⚠ **page.mouse.click(画面中央) で演出を進めてはいけない**。4 列のカードが並ぶ
 *    画面の中央はカードの上か隙間で、#35 以後そこを叩いても何も起きない
 *    (= この装置が測ろうとしている罠そのものを踏む)。進めるのは #pmDepart だけ。
 *  - ⭐⭐ 配信バイトは起動時に凍結する。別窓が同じリポを触っても、この run が読むのは 1 枚。
 *  - ⚠ close() のフェードは 520ms 続き、その間 display は flex のまま = 「閉じ始めたのに
 *    開いている」と読める窓がある。閉じ判定はフェードが終わり切ってから採る。
 *  - ⚠ classic script 直下の let/const/function は window に載らない。
 *    page.evaluate(() => PARTY_SLOTS) のように **裸の識別子**で読む。
 *  - ⚠ 開示フェーズ (reveal) は 720ms × (人数-1) しか無い。ここで測る (1d)(1e) は
 *    「全確定してしまってから測る」と永久緑になるので、必ず **母集団ガード**
 *    (叩く直前に nFilled < nCols だったこと) を併せて出す。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *   ⚠ 依頼書 §8 の変異表は M1〜M7 だが、M3〜M7 は STEP2 / STEP3 の実装 (引き出しの
 *     中身・再描画点の一本化・撤退スイッチの完成) が入ってからでないと注入点が無い。
 *     STEP1 の時点で成立する **M1 / M2 の 2 本だけ**をここに置く (残りは項目4)。
 *   M1 ⭐: onTap に「全確定後の背景タップ = 閉じる」を戻す (#19 が警告した誤爆の再現)
 *          → **(1a) が赤くなる**こと。
 *   M2 ⭐: pmSwallowTaps から touchend の行だけ削る (依頼書 §2-3 の罠)
 *          → **(2b-2) が赤くなる**こと。
 *          ⚠ (2b) の本文 (#prep が出ない) は #35 以後 onTap が閉じないので M2 だけでは
 *            動かない。だから「イベントが overlay まで上がったか」を数える (2b-2) を
 *            併置している。⛔ (2b) を消して (2b-2) だけにしない (受入条件の文面は (2b))。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
/* ⭐⭐⭐ 変異を全部同時に入れると互いを覆い隠す (M1 が入ると背景タップで閉じてしまい、
 *   M2 の証拠である「touchend が overlay へ上がったか」を採る前に画面が消える)。
 *   → `--only M2` で 1 本ずつ確定させられるようにしておく。 */
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '9530'), 10);
const SCENARIO = 'goblin-mine';

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 *   ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = { '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')) };
const INJECTED = [];

/* アンカーがちょうど 1 箇所でなければ **走らせる前に exit 3**。
   腐ったアンカーで「注入したつもり」のまま緑になるのを防ぐ。 */
function mutate(label, anchor, patch) {
  const tag   = label.split(' ')[0];
  const src   = FROZEN['/tavern.html'].toString('utf8');
  const parts = src.split(anchor);
  const hits  = parts.length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + anchor);
    process.exit(3);
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) {
    console.log('[driver]   (' + tag + ' はアンカー健在・--only 指定により注入せず)');
    return;
  }
  FROZEN['/tavern.html'] = Buffer.from(parts.join(patch), 'utf8');
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました');
}
/* 変異 → 赤くなるべきラベルの担当表。--negative で空振りしたら exit 1。 */
const NEG_EXPECT = { M1: ['(1a)'], M2: ['(2b-2)'] };
if (NEGATIVE) {
  mutate('M1 (全確定後の背景タップで閉じる挙動を戻す)',
    'if (!setupOn && gateOpen) close();',
    'if (gateOpen) close();');
  mutate('M2 (伝播止めから touchend の行だけ削る)',
    '    el.addEventListener("touchend", (ev) => { ev.stopPropagation(); });',
    '');
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません');
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)');
  process.exit(2);
}
// ⚠ MIME テーブルを持たせ忘れると全 500 でページが空になる (シームが undefined に見える)
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u]) {                                     // ← 凍結済み (+ 変異済み) を優先
          rs.setHeader('Content-Type', MIME['.html']);
          rs.end(FROZEN[u]);
          return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 集計 (PASSED / FAILED / PENDING の 3 値)
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, pending: false, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, ok: false, pending: true, detail: why || '' });
  console.log('  --  ' + name + '   [PENDING] ' + (why || ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

/* 可視判定。checkVisibility は祖先の display:none までまとめて見てくれる。 */
const VIS_FN = `(function(el){
  if (!el) return false;
  if (typeof el.checkVisibility === 'function')
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  return el.getClientRects().length > 0;
})`;

/* ══════════════════════════════════════════════════════════════════════════
 * 観測プローブ (1 回の evaluate で必要な値を全部採る)
 * ══════════════════════════════════════════════════════════════════════════ */
const PROBE = (visSrc) => {
  const vis = eval(visSrc);
  const q = (id) => document.getElementById(id);
  const txt = (el) => (el && el.textContent ? el.textContent.trim() : '');
  const ov  = q('partyMatchOverlay');
  const dep = q('pmDepart');
  const drw = q('pmDrawer');
  const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
  return {
    t: Date.now(),
    prepVis:    vis(q('prep')),
    overlayVis: vis(ov),
    display:    ov ? ov.style.display : '(なし)',
    /* ⚠ フェード中 (520ms) は display も flex のままなので、閉じたかは fading も併せて見る。 */
    fading:     !!(ov && ov.classList.contains('fading')),
    hint:       txt(q('pmHint')),
    nCols:      cols.length,
    nFilled:    cols.filter((c) => c.dataset.state === 'filled').length,
    names:      cols.map((c) => txt(c.querySelector('.pmName'))),
    classesJa:  cols.map((c) => txt(c.querySelector('.pmClass'))),
    depExists:  !!dep,
    depHidden:  dep ? !!dep.hidden : null,
    depVis:     vis(dep),
    depText:    txt(dep),
    drwExists:  !!drw,
    drwHidden:  drw ? !!drw.hidden : null,
    drwVis:     vis(drw),
    spy:        window.__pmSpy ? { click: window.__pmSpy.click, touchend: window.__pmSpy.touchend } : null,
    path:       location.pathname,
  };
};

/* localStorage / sessionStorage を purge してから最低限だけ焼く。
   ⚠ prologueSeen / prepOnboardingSeen は #35 と無関係な初回ナレ。立てておかないと
      演出の前後で語りが挟まり、測っているものが分からなくなる (手本 = driver_action_priority)。 */
function seed() {
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

async function openTavern(browser, viewport, qs) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(viewport.name + ' :: ' + e.message));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  const url = 'http://localhost:' + PORT + '/tavern.html' + (qs ? ('?' + qs) : '');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(seed);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 25000 });
  return page;
}

/* 受注 → マッチング演出が【開いた瞬間】まで進める。
 * ⚠ openPrep は await しない (演出がタップ待ちで止まるため)。
 * ⚠ 受注ナレ (#prologueOverlay) は音声ペースで 20 秒近くかかる。クリックの間隔は 400ms の
 *    ままにしつつ、演出の検知だけ 60ms で回す (開示フェーズは 720ms 刻みしか無いので、
 *    420ms 間隔のループだと最初の 1〜2 コマを取り逃がす)。
 * ⛔ #partyMatchOverlay も #pmColumns も叩かない (それが測定対象そのもの)。 */
async function advanceToCinema(page, scId, budgetMs) {
  await page.evaluate((id) => {
    const sc = scenarios.find((s) => s.id === id);
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch(() => {});
  }, scId);
  const t0 = Date.now();
  let lastClick = 0;
  const seen = [];
  while (Date.now() - t0 < (budgetMs || 90000)) {
    const st = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      const ov = q('partyMatchOverlay');
      return {
        cinema: !!(ov && ov.style.display === 'flex' && !ov.classList.contains('fading')),
        prep:   vis(q('prep')),
        prol:   vis(q('prologueOverlay')),
      };
    }, VIS_FN);
    if (st.cinema) { seen.push('cinema'); return { reached: true, steps: seen, ms: Date.now() - t0 }; }
    if (st.prep)   { seen.push('prep');   return { reached: false, steps: seen, ms: Date.now() - t0 }; }
    if (st.prol && Date.now() - lastClick > 400) {
      if (seen[seen.length - 1] !== 'prologueOverlay') seen.push('prologueOverlay');
      await page.evaluate(() => { const o = document.getElementById('prologueOverlay'); if (o) o.click(); });
      lastClick = Date.now();
    }
    await sleep(60);
  }
  return { reached: false, steps: seen, ms: Date.now() - t0 };
}

/* 演出が閉じた後、#prep が出るまで #prologueOverlay だけを送る。
   ⛔ #partyMatchOverlay は絶対に叩かない。 */
async function settleToPrep(page, budgetMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (budgetMs || 40000)) {
    const st = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      if (vis(q('prep'))) return { done: true };
      const o = q('prologueOverlay');
      if (vis(o)) { o.click(); return { done: false }; }
      return { done: false };
    }, VIS_FN);
    if (st.done) return true;
    await sleep(250);
  }
  return false;
}

/* 要素の中心を実マウスで叩く (指の当たり方に一番近い経路)。命中先も返す。 */
async function clickCenterOf(page, id) {
  const rc = await page.evaluate((elId) => {
    const e = document.getElementById(elId);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x: x, y: y, hit: hit ? String(hit.id || hit.className || hit.tagName) : '(なし)' };
  }, id);
  if (!rc) return null;
  await page.mouse.click(Math.round(rc.x), Math.round(rc.y));
  return rc;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  :' + PORT + (NEGATIVE ? '   [NEGATIVE ' + (INJECTED.join(',') || 'なし') + ']' : ''));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    /* ══════════════════════════════════════════════════════════════════
     * 腕 A (desktop 1280x900 / 素の tavern.html)
     *   §0 装置 → (1e)(1c)(0d) → (1a) → §2 伝播 → (1b) → (1f) review
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- 腕A: 受注 → マッチング演出 --');
    const page = await openTavern(browser, { name: 'desktop', width: 1280, height: 900 }, '');
    const adv = await advanceToCinema(page, SCENARIO);
    const s0 = await page.evaluate(PROBE, VIS_FN);
    check('(0z) [装置] 受注からマッチング演出まで到達した (ここが偽なら以下は全部空振り)',
      adv.reached === true && s0.overlayVis === true,
      'steps=' + adv.steps.join('>') + ' ' + adv.ms + 'ms  display=' + s0.display);

    /* 実体側の顔ぶれ (カードの写経ではなく selection から引く) */
    const truth = await page.evaluate(() => {
      const ms = (selection.partyMembers || []);
      const ja = (k) => { const s = PARTY_SLOTS.find((x) => x && x.classKey === k); return s ? s.name : k; };
      return {
        keys:   ms.map((m) => m.classKey),
        classJa: ms.map((m) => ja(m.classKey)),
        nHero:  ms.filter((m) => m.isHero).length,
        nNpc:   ms.filter((m) => !m.isHero).length,
      };
    });
    const sorted = (a) => a.slice().sort().join(',');

    check('(0a) [母集団] カードが 2 枚以上あり、そのうち少なくとも 1 枚が NPC',
      s0.nCols >= 2 && truth.nNpc >= 1,
      s0.nCols + ' 枚 / 主人公 ' + truth.nHero + ' + 仲間 ' + truth.nNpc + ' = ' + JSON.stringify(truth.keys));
    /* ⚠ (0b) はここでは採らない。演出が開いた直後は主人公以外が「？？？」の空スロットで
       .pmClass が空文字なので、必ず食い違う (2026-08-29 に実測して 1 度赤くした)。
       全員が確定してから採る (下の (0b) 参照)。 */

    /* (0c) 引き出しで使う母集団。⚠ STEP1 では引き出しを開かないので、
           「カードに出ている職のうち、枠に入れている技と入れていない技が両方ある職が
             1 つ以上ある」で宣言する。項目3 はここで挙がった職を開いて (3b) を測ること。 */
    const pop = await page.evaluate(() => {
      const out = []; const seen = {};
      (selection.partyMembers || []).forEach((m) => {
        if (!m || seen[m.classKey]) return; seen[m.classKey] = 1;
        const slot = PARTY_SLOTS.find((s) => s && s.classKey === m.classKey);
        if (!slot) return;
        let eq = [];
        try { eq = apEquippedIdsFor(slot, m.classKey) || []; } catch (e) { eq = []; }
        const all = slot.skillPool.map((s) => s.id);
        out.push({ classKey: m.classKey, isHero: !!m.isHero, nEquipped: eq.length, nFree: all.length - eq.length });
      });
      return out;
    });
    const popOk = pop.filter((p) => p.nEquipped >= 1 && p.nFree >= 1);
    check('(0c) [母集団] カードの職のうち「枠に入れている技」と「入れていない技」が両方 1 つ以上ある職が実在する',
      popOk.length >= 1,
      pop.map((p) => p.classKey + (p.isHero ? '★' : '') + ' 入=' + p.nEquipped + '/外=' + p.nFree).join(' , '));

    /* ── (1e) 開示中にカードを叩く ────────────────────────────────────
       ⚠ 母集団 = 叩く直前に nFilled < nCols であること。全確定後に叩いたら永久緑。
       ⭐ 依頼書 §4-2 / §5-1: 開示中のカードは「何もしない = 伝播も止めない」ので、
          背景の skipRest へ通る = **スキップが優先**。引き出しは開かない。 */
    const beforeCard = await page.evaluate(PROBE, VIS_FN);
    let afterCard = null;
    if (beforeCard.nFilled < beforeCard.nCols) {
      await page.evaluate(() => {
        const c = document.querySelector('#pmColumns .pmColumn');
        if (c) c.click();
      });
      await sleep(180);
      afterCard = await page.evaluate(PROBE, VIS_FN);
      check('(1e) 開示中にカードを叩いても引き出しは開かず、スキップが優先される (残りが即確定)',
        afterCard.drwHidden === true && afterCard.drwVis === false && afterCard.nFilled === afterCard.nCols,
        '叩く前 ' + beforeCard.nFilled + '/' + beforeCard.nCols + ' → 直後 ' + afterCard.nFilled + '/' + afterCard.nCols
        + '  引き出し hidden=' + afterCard.drwHidden);
    } else {
      pending('(1e) 開示中にカードを叩いても引き出しは開かない (スキップが優先)',
        '母集団が取れなかった (検知した時点で既に全確定 ' + beforeCard.nFilled + '/' + beforeCard.nCols + ')');
      afterCard = beforeCard;
    }

    /* ── (1c)(0d) 出発の口が開く「順番」 ───────────────────────────── */
    const tFill = afterCard.t;
    let sawHiddenWhileFilled = false, graceProbe = null, tDepart = null, lastSnap = afterCard;
    for (let i = 0; i < 120; i++) {
      const s = await page.evaluate(PROBE, VIS_FN);
      lastSnap = s;
      if (s.nFilled === s.nCols && !s.depVis) {
        sawHiddenWhileFilled = true;
        if (graceProbe === null) {
          // 猶予中にプログラムから押しても閉じない (指では hidden なので押せない)
          await page.evaluate(() => { const d = document.getElementById('pmDepart'); if (d) d.click(); });
          await sleep(80);
          const s2 = await page.evaluate(PROBE, VIS_FN);
          graceProbe = { hidden: s.depHidden, prepVis: s2.prepVis, display: s2.display, fading: s2.fading };
        }
      }
      if (s.depVis) { tDepart = s.t; break; }
      await sleep(40);
    }
    check('(1c) #pmDepart は猶予明け前は押せない (hidden のまま / その間にプログラムから押しても閉じない)',
      sawHiddenWhileFilled === true && !!graceProbe && graceProbe.hidden === true
      && graceProbe.prepVis === false && graceProbe.display === 'flex' && graceProbe.fading === false,
      '全確定後に hidden を観測=' + sawHiddenWhileFilled + ' / 猶予中に押した結果=' + JSON.stringify(graceProbe));
    check('(0d) [装置] #pmDepart が見えるようになった時刻は、最後のカードが確定した後',
      tDepart !== null && tDepart > tFill,
      tDepart === null ? '出発の口が出なかった (depVis=' + lastSnap.depVis + ' hidden=' + lastSnap.depHidden + ')'
                       : '確定 → 出発の口まで +' + (tDepart - tFill) + 'ms (PM_TAP_GATE=500ms)');

    const sReady = await page.evaluate(PROBE, VIS_FN);
    const normalLabel = sReady.depText;
    check('(0b) [装置] 全確定後のカードの職業の並びが selection.partyMembers の職業と一致 (表を写経していない証明)',
      sorted(sReady.classesJa) === sorted(truth.classJa) && sReady.nCols === truth.keys.length
      && sReady.nFilled === sReady.nCols,
      'カード=' + JSON.stringify(sReady.classesJa) + ' / 実体=' + JSON.stringify(truth.classJa)
      + ' / 確定 ' + sReady.nFilled + '/' + sReady.nCols);

    /* ── (1a) ★本丸: 全確定後に背景 (#pmColumns の中心) を叩いても出発しない ── */
    const hit1a = await clickCenterOf(page, 'pmColumns');
    await sleep(900);
    const s1a = await page.evaluate(PROBE, VIS_FN);
    check('(1a) ★本丸: 全確定後に #pmColumns の中心を叩いても #prep が出ない (背景タップ = 出発の廃止)',
      s1a.prepVis === false && s1a.display === 'flex' && s1a.fading === false,
      '叩いた点の命中先=' + (hit1a ? hit1a.hit : '(取れず)') + ' → prep=' + s1a.prepVis
      + ' display=' + s1a.display + ' fading=' + s1a.fading);

    /* ── §2 伝播 ────────────────────────────────────────────────────
       ⚠ STEP1 の #pmDrawer は空の器。指で押せる大きさが無いので、
         **装置側で器だけ開いて**その上を叩く。中身 (スキル項目 / <select>) は STEP2。
       ⭐ 「#prep が出ない」だけだと #35 以後は onTap が閉じないので自明に緑になる。
          そこで overlay まで **イベントが上がったか**を数える spy を併置する (M2 の担当)。 */
    console.log('\n-- §2 伝播 (引き出しの上のタップを飲み込む) --');
    await page.evaluate(() => {
      window.__pmSpy = { click: 0, touchend: 0 };
      const ov = document.getElementById('partyMatchOverlay');
      // ⚠ バブリング相で張る。capture で張ると引き出しの stopPropagation より先に走って永久に数える。
      ov.addEventListener('click',    () => { window.__pmSpy.click++; });
      ov.addEventListener('touchend', () => { window.__pmSpy.touchend++; });
      const d = document.getElementById('pmDrawer');
      d.hidden = false;
      d.textContent = '(装置) 引き出しの器';
      d.style.minHeight = '60px';
      d.style.padding = '18px';
    });
    await sleep(120);
    const hit2a = await clickCenterOf(page, 'pmDrawer');
    await sleep(700);
    const s2a = await page.evaluate(PROBE, VIS_FN);
    check('(2a) 引き出しの上で click しても #prep が出ない',
      s2a.prepVis === false && s2a.display === 'flex' && s2a.fading === false,
      '命中先=' + (hit2a ? hit2a.hit : '(取れず)') + ' → prep=' + s2a.prepVis + ' display=' + s2a.display);
    check('(2a-2) その click は #partyMatchOverlay まで上がっていない (引き出しが飲み込んでいる)',
      !!s2a.spy && s2a.spy.click === 0, 'overlay が受けた click = ' + (s2a.spy ? s2a.spy.click : '(spy なし)'));

    await page.evaluate(() => {
      const d = document.getElementById('pmDrawer');
      let ev;
      try { ev = new TouchEvent('touchend', { bubbles: true, cancelable: true }); }
      catch (e) { ev = new Event('touchend', { bubbles: true, cancelable: true }); }
      d.dispatchEvent(ev);
    });
    await sleep(700);
    const s2b = await page.evaluate(PROBE, VIS_FN);
    check('(2b) ⚠⚠ 引き出しの上で touchend をディスパッチしても #prep が出ない (iOS の <select> 対策)',
      s2b.prepVis === false && s2b.display === 'flex' && s2b.fading === false,
      'prep=' + s2b.prepVis + ' display=' + s2b.display + ' fading=' + s2b.fading);
    check('(2b-2) ⚠⚠ その touchend は #partyMatchOverlay まで上がっていない (click だけ止めた実装はここで赤)',
      !!s2b.spy && s2b.spy.touchend === 0, 'overlay が受けた touchend = ' + (s2b.spy ? s2b.spy.touchend : '(spy なし)'));

    // 器を元に戻す (以降の測定に装置の細工を持ち越さない)
    await page.evaluate(() => {
      const d = document.getElementById('pmDrawer');
      d.hidden = true; d.textContent = ''; d.style.minHeight = ''; d.style.padding = '';
    });

    /* ── (1b) #pmDepart を押すと出発する (= 演出が閉じて準備画面へ) ── */
    const hit1b = await clickCenterOf(page, 'pmDepart');
    await sleep(900);
    const s1bClose = await page.evaluate(PROBE, VIS_FN);
    const reached1b = await settleToPrep(page, 40000);
    const s1b = await page.evaluate(PROBE, VIS_FN);
    check('(1b) ★受入条件: #pmDepart を押すとマッチング画面が閉じ、準備画面 (#prep) が出る',
      s1bClose.display === 'none' && reached1b === true && s1b.prepVis === true,
      '押した点の命中先=' + (hit1b ? hit1b.hit : '(取れず)') + ' → 900ms 後 display=' + s1bClose.display
      + ' / 準備画面 prep=' + s1b.prepVis);

    /* ── (1f) review モード: 同じ #pmDepart のラベルが「準備へ戻る」 ──
       ⚠ 依頼書は review モード (準備画面の「🎴 編成を見る」) を知らない。
          orchestrator 補正: 通常 = 「出発する」/ review = 「準備へ戻る」。close() は共通。 */
    console.log('\n-- (1f) review モード (編成を見る) --');
    const hasBtn = await page.evaluate(() => !!document.getElementById('btnPartyView'));
    if (!hasBtn) {
      pending('(1f) review モードでは #pmDepart が「準備へ戻る」になり、押すと準備画面へ戻る',
        '#btnPartyView が無い (review 導線そのものが存在しない)');
    } else {
      await page.evaluate(() => { const b = document.getElementById('btnPartyView'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'center' }); });
      await sleep(150);
      await page.click('#btnPartyView');
      await sleep(320);
      const r1 = await page.evaluate(PROBE, VIS_FN);
      let rDep = null;
      for (let i = 0; i < 40; i++) {
        const s = await page.evaluate(PROBE, VIS_FN);
        if (s.depVis) { rDep = s; break; }
        await sleep(60);
      }
      let r2 = r1;
      if (rDep) { await clickCenterOf(page, 'pmDepart'); await sleep(1100); r2 = await page.evaluate(PROBE, VIS_FN); }
      check('(1f) review モードでは #pmDepart が「準備へ戻る」になり、押すと準備画面へ戻る (通常は「出発する」)',
        normalLabel === '出発する' && r1.overlayVis === true && r1.depText === '準備へ戻る'
        && !!rDep && r2.display === 'none' && r2.prepVis === true,
        '通常の文言="' + normalLabel + '" / review の文言="' + r1.depText + '" / 開けた=' + r1.overlayVis
        + ' 猶予明け=' + !!rDep + ' → 閉じた後 display=' + r2.display + ' prep=' + r2.prepVis);
    }
    await page.close();

    /* ══════════════════════════════════════════════════════════════════
     * 腕 B — 開示中の背景タップ (1d) と、出発の口の touchend (2c)
     *   ⚠ (1d) は開示フェーズが要る。腕 A では (1e) で使い切っているので別ページで採る。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- 腕B: 開示中の背景タップ / 出発の口の touchend --');
    const pageB = await openTavern(browser, { name: 'desktopB', width: 1280, height: 900 }, '');
    const advB = await advanceToCinema(pageB, SCENARIO);
    const b0 = await pageB.evaluate(PROBE, VIS_FN);
    if (!advB.reached) {
      pending('(1d) 開示中に背景を叩くと残りが即確定する', '腕B が演出まで到達しなかった (steps=' + advB.steps.join('>') + ')');
      pending('(2c) #pmDepart の touchend で出発する (iOS で詰まない)', '腕B が演出まで到達しなかった');
    } else {
      if (b0.nFilled < b0.nCols) {
        await pageB.evaluate(() => { const o = document.getElementById('partyMatchOverlay'); if (o) o.click(); });
        await sleep(180);
        const b1 = await pageB.evaluate(PROBE, VIS_FN);
        check('(1d) 開示中に背景を叩くと残りが即確定する (従来の「タップでスキップ」が生きている)',
          b1.nFilled === b1.nCols && b1.display === 'flex' && b1.fading === false && b1.prepVis === false,
          '叩く前 ' + b0.nFilled + '/' + b0.nCols + ' → 直後 ' + b1.nFilled + '/' + b1.nCols
          + '  display=' + b1.display + ' prep=' + b1.prepVis);
      } else {
        pending('(1d) 開示中に背景を叩くと残りが即確定する',
          '母集団が取れなかった (検知した時点で既に全確定 ' + b0.nFilled + '/' + b0.nCols + ')');
      }
      // 猶予明けを待ってから touchend だけで出発する
      let bDep = null;
      for (let i = 0; i < 60; i++) {
        const s = await pageB.evaluate(PROBE, VIS_FN);
        if (s.depVis) { bDep = s; break; }
        await sleep(50);
      }
      if (!bDep) {
        pending('(2c) #pmDepart の touchend で出発する (iOS で詰まない)', '出発の口が可視にならなかった');
      } else {
        await pageB.evaluate(() => {
          const d = document.getElementById('pmDepart');
          let ev;
          try { ev = new TouchEvent('touchend', { bubbles: true, cancelable: true }); }
          catch (e) { ev = new Event('touchend', { bubbles: true, cancelable: true }); }
          d.dispatchEvent(ev);
        });
        await sleep(900);
        const b2 = await pageB.evaluate(PROBE, VIS_FN);
        const reachedB = await settleToPrep(pageB, 40000);
        const b3 = await pageB.evaluate(PROBE, VIS_FN);
        check('(2c) ⚠ #pmDepart の touchend では出発する (click 非発火の端末で詰まない)',
          b2.display === 'none' && reachedB === true && b3.prepVis === true,
          'touchend 900ms 後 display=' + b2.display + ' → 準備画面 prep=' + b3.prepVis);
      }
    }
    await pageB.close();

    /* ══════════════════════════════════════════════════════════════════
     * §3〜§6 — STEP2 / STEP3 で埋める枠 (⛔ 黙って緑にしない)
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- §3〜§6 (STEP2 / STEP3 で実装) --');
    const TODO2 = 'STEP2 (引き出しの中身) 未実装';
    const TODO3 = 'STEP3 (見た目 / 撤退スイッチの完成) 未実装';
    pending('(3a) カードを押すと #pmDrawer が可視になり、.pmColumn.pmOpen がちょうど 1 枚', TODO2);
    pending('(3b) 傾向の候補に「枠に入れていない技」が 1 つも無い (apEquippedIdsFor を流用している証明)', TODO2);
    pending('(3c) 「道中」の行が出るのは 枠 ∩ TRAVEL_CASTABLE_IDS が非空の職だけ (2 経路突合)', TODO2);
    pending('(3d) スキル項目を押すと selection.partySkills と localStorage の両方が変わり、引き出しの表示も更新される', TODO2);
    pending('(3e) 傾向の select を変えると selection.actionPriority と localStorage の両方が変わる', TODO2);
    pending('(3f) change の直後も select が同じ DOM ノードのまま (作り直されていない)', TODO2);
    pending('(4a-0) [母集団] 同じ職が 2 人いる編成を作れている', TODO2);
    pending('(4a) 片方のカードで技を足すと、もう片方のカードの表示も同じ値になる', TODO2);
    pending('(4b) 同職 2 人のとき引き出しに共通適用の注記が出る / 1 人だけのときは出ない', TODO2);
    pending('(4c) compact (390x844) で引き出しを開いても #pmDepart が画面内に残っている', TODO3);
    pending('(4d) compact で #pmDrawer が横スクロールを起こさない', TODO3);
    pending('(5a) 引き出しを一度も開かずに出発したとき、selection と localStorage が 1 バイトも変わっていない', TODO2);
    pending('(5b) 引き出しを開いたまま出発しても、その後の準備画面でスキル選択が正しく更新される', TODO2);
    pending('(X-a) [母集団] スイッチが無ければ引き出しが開いた盤面', TODO3);
    pending('(X-b) ?pmsetup=0 で #pmDrawer も #pmDepart も出ず、背景タップで従来どおり出発する', TODO3);
    pending('(X-c) ?actionpri=0 で引き出しは出るがスキル段だけ (傾向段が無い)', TODO3);
    pending('(X-d) どちらのスイッチでも保存済みの値は消えていない', TODO3);

    check('(Z) JS エラーが出ていない', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } catch (e) {
    check('(FATAL) ドライバが最後まで走った', false, (e && e.message) || String(e));
  } finally {
    await browser.close();
    srv.close();
  }

  const pass = results.filter((r) => r.ok).length;
  const pend = results.filter((r) => r.pending).length;
  const fail = results.filter((r) => !r.ok && !r.pending).length;
  console.log('\n[driver] RESULT: PASSED ' + pass + ' / FAILED ' + fail + ' / PENDING ' + pend
    + '   (合計 ' + results.length + ')');
  if (fail || pend) {
    results.filter((r) => !r.ok).forEach((r) =>
      console.log('  ' + (r.pending ? '[PENDING] ' : '[FAILED]  ') + r.name + (r.detail ? '  -- ' + r.detail : '')));
  }

  if (NEGATIVE) {
    /* 変異を入れたのに担当ラベルが緑のまま = 空振り。⛔ 黙って成功させない。 */
    const red = new Set(results.filter((r) => !r.ok && !r.pending).map((r) => r.name.split(' ')[0]));
    const miss = [];
    INJECTED.forEach((tag) => (NEG_EXPECT[tag] || []).forEach((lab) => { if (!red.has(lab)) miss.push(tag + '→' + lab); }));
    console.log('[driver] --negative: 注入=' + (INJECTED.join(',') || 'なし')
      + ' / 赤くなったラベル=' + (Array.from(red).join(',') || '(なし)'));
    if (!INJECTED.length) { console.error('[driver] 変異を 1 つも注入していません'); process.exit(1); }
    if (miss.length) { console.error('[driver] 空振り: ' + miss.join(' , ')); process.exit(1); }
    console.log('[driver] --negative OK (担当ラベルが全部赤くなりました)');
    process.exit(0);
  }
  process.exit(fail === 0 ? 0 : 1);
})();
