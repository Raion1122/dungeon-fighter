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
 *   §3 引き出しの中身                              … 実装済 (STEP2 = 項目2)
 *   §4 同職 2 人 / レイアウト                      … 実装済 (STEP2 = 項目2)
 *   §5 恒等 (非退行)                               … 実装済 (STEP3 = 項目3)
 *   §6 撤退スイッチ ?pmsetup=0 / ?actionpri=0      … 実装済 (STEP3 = 項目3)
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
    /* ⚠⚠ finishReveal が付ける印。「全カラムが filled」= まだ待機フェーズとは限らない
       (最後の 1 枚が埋まってからさらに PM_REVEAL_INTERVAL 720ms 経ってから finishReveal)。 */
    hintWait:   !!(q('pmHint') && q('pmHint').classList.contains('pmWait')),
    nCols:      cols.length,
    nFilled:    cols.filter((c) => c.dataset.state === 'filled').length,
    nOpen:      cols.filter((c) => c.classList.contains('pmOpen')).length,
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

/* セレクタ版。先に見つかったものの中心を実マウスで叩く。
   ⚠ 引き出しを開けば #pmInner の高さが変わり、align-items:center なのでカードの中心も動く。
     座標を使い回さず、叩く直前に毎回測り直すこと。 */
async function clickCenterOfSel(page, selectors) {
  const rc = await page.evaluate((sels) => {
    let e = null;
    for (const s of sels) { e = document.querySelector(s); if (e) break; }
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x: x, y: y, hit: hit ? String(hit.id || hit.className || hit.tagName) : '(なし)' };
  }, selectors);
  if (!rc) return null;
  await page.mouse.click(Math.round(rc.x), Math.round(rc.y));
  return rc;
}

/* 同職 2 人を含む【決定論的な】編成で演出だけを開く。
 * ⚠⚠ openPrep は毎回 regeneratePartyMembers() を呼んで顔ぶれを作り直すので、
 *   openPrep 経由では編成を固定できない (4a-0 の母集団が乱数任せになる)。
 *   → 既存の検証シーム window.__pmTest.play で演出だけを直接開く。
 * ⚠ NPC に level:10 を与える = スキル枠 5。主人公 (xp 10000 = Lv5) は 3 枠のままなので
 *   「枠が埋まっている職」と「空きがある職」が同じ盤面に並ぶ。 */
async function playForcedCinema(page, scId, wants) {
  await page.evaluate((id, want) => {
    const mk = (ck, isHero, name) => ({
      classKey: ck, isHero: !!isHero, name: name,
      zone: PARTY_ZONES[ck], variant: 0, level: 10,
    });
    selection.partyComposition = ['warrior'];
    selection.partyMembers = [mk('warrior', true, '')]
      .concat(want.map((ck, i) => mk(ck, false, '仲間' + (i + 1))));
    const sc = scenarios.find((s) => s.id === id);
    Promise.resolve(window.__pmTest.play(sc)).catch(() => {});
  }, scId, wants);
  for (let i = 0; i < 240; i++) {
    const s = await page.evaluate(PROBE, VIS_FN);
    if (s.depVis) return s;
    await sleep(50);
  }
  return await page.evaluate(PROBE, VIS_FN);
}

/* 引き出しを開いた直後の状態を 1 回で採る。 */
const DRAWER_SNAP = (n) => {
  const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
  const d = document.getElementById('pmDrawer');
  const rows = d ? Array.prototype.slice.call(d.querySelectorAll('.apRow')) : [];
  const opts = [];
  (d ? Array.prototype.slice.call(d.querySelectorAll('select.apSel')) : []).forEach((s) => {
    Array.prototype.slice.call(s.options).forEach((o) => { if (o.value) opts.push(o.value); });
  });
  const travel = rows.filter((r) => r.dataset.sit === 'travel');
  const note = d ? d.querySelector('.pmDrawerNote') : null;
  const title = d ? d.querySelector('.pmDrawerTitle') : null;
  return {
    classKey:   cols[n] ? cols[n].dataset.classKey : null,
    drawerVis:  !!(d && !d.hidden),
    nOpen:      cols.filter((c) => c.classList.contains('pmOpen')).length,
    openIsMe:   !!(cols[n] && cols[n].classList.contains('pmOpen')),
    title:      title ? title.textContent : '',
    hasNote:    !!note,
    noteText:   note ? note.textContent : '',
    nSkillItem: d ? d.querySelectorAll('.skillItem').length : 0,
    nSel:       d ? d.querySelectorAll('select.apSel').length : 0,
    apOptions:  opts,
    travelRows: travel.length,
    travelShown: travel.length === 1 && travel[0].style.display !== 'none',
    cardSkills: cols.map((c) => { const v = c.querySelector('.pmSkillsVal'); return v ? v.textContent : null; }),
  };
};

/* ══════════════════════════════════════════════════════════════════════════
 * §5 / §6 (STEP3) 用のヘルパー
 * ══════════════════════════════════════════════════════════════════════════ */

/* (5a) の物差し。selection の全文と、dragonfighters.* の全キー/全値を 1 本の文字列へ畳む。
   ⚠ 「1 バイトも変わっていない」を主張するので、キーの取りこぼしを作らない
     (前置詞の総なめ + キー名でソート = 列挙順の揺れを持ち込まない)。 */
const STATE_SNAP = () => {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('dragonfighters.') === 0) out.push([k, localStorage.getItem(k)]);
    }
  } catch (e) {}
  out.sort((a, b) => (a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0)));
  return { sel: JSON.stringify(selection), ls: JSON.stringify(out), nKeys: out.length };
};

/* (X-d) 用: 「保存済みの値」を本番の入り口 (saveSelections) で作る。
   ⚠⚠ でたらめな ID を書いてはいけない。引き出しも準備画面も「今の候補に無い ID は
     おまかせへ戻す」正規化を持っているので、消えたのか正規化されたのか区別が付かなくなる。
   ⭐ apEquippedIdsFor が返す【今まさに枠に入っている ID】だけを書く。 */
const AP_SEED = () => {
  const slot = PARTY_SLOTS.find((s) => s && s.classKey === 'rogue');
  if (!slot) return null;
  let ids = [];
  try { ids = apEquippedIdsFor(slot, 'rogue') || []; } catch (e) { ids = []; }
  if (!ids.length) return null;
  if (!selection.actionPriority) selection.actionPriority = {};
  const row = selection.actionPriority['rogue'] ||
              (selection.actionPriority['rogue'] = { general: null, mob: null, boss: null, travel: null });
  row.general = ids[0];
  row.boss = ids[ids.length - 1];
  saveSelections();
  return { general: ids[0], boss: ids[ids.length - 1],
           skills: JSON.stringify(selection.partySkills['rogue'] || []) };
};
/* 仕込んだ値を 2 経路 (メモリ上の selection と localStorage) で読み返す。 */
const AP_READ = () => {
  let ap = null, sk = null;
  try { ap = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
  try { sk = JSON.parse(localStorage.getItem('dragonfighters.partySkills') || 'null'); } catch (e) {}
  return {
    sel: ((selection.actionPriority || {})['rogue']) || null,
    ls:  ((ap || {})['rogue']) || null,
    skills:    JSON.stringify(((sk || {})['rogue']) || []),
    selSkills: JSON.stringify((selection.partySkills || {})['rogue'] || []),
  };
};

/* 既に仕込んである編成のまま演出だけを開き、出発の口が出るまで待つ。
   ⚠ playForcedCinema と違い selection を書き換えない ((5a) の前後比較を汚さないため)。 */
async function playCinemaOnly(page, scId) {
  await page.evaluate((id) => {
    const sc = scenarios.find((s) => s.id === id);
    Promise.resolve(window.__pmTest.play(sc)).catch(() => {});
  }, scId);
  for (let i = 0; i < 240; i++) {
    const s = await page.evaluate(PROBE, VIS_FN);
    if (s.depVis) return true;
    await sleep(50);
  }
  return false;
}

/* ?pmsetup=0 では #pmDepart が出ないので「出発の口が見えた」では待てない。
   ⚠⚠⚠ 「全カラムが filled」で待つのは **間違い** (2026-08-29 に実測して 1 度赤くした)。
     step() は最後の 1 枚を埋めた後もう一度 720ms のタイマを積み、その次の呼び出しで
     ようやく finishReveal する。filled + 750ms の時点ではまだ phase==="reveal" なので、
     背景を叩くと close ではなく **skipRest** に落ちて画面が閉じない。
   → finishReveal が付ける .pmWait を待ってから PM_TAP_GATE (500ms) を越える。 */
async function waitAllFilled(page, budgetMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (budgetMs || 25000)) {
    const s = await page.evaluate(PROBE, VIS_FN);
    if (s.nCols > 0 && s.nFilled === s.nCols && s.hintWait === true) { await sleep(700); return true; }
    await sleep(60);
  }
  return false;
}

/* 座標を直接叩く (カードでもボタンでもない「背景」を叩くのはこれだけ)。命中先も返す。 */
async function clickPoint(page, x, y) {
  const hit = await page.evaluate((px, py) => {
    const e = document.elementFromPoint(px, py);
    return e ? String(e.id || e.className || e.tagName) : '(なし)';
  }, x, y);
  await page.mouse.click(x, y);
  return hit;
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

    /* ── §2 伝播 ────────────────────────────────
       ⚠⚠ STEP2 で中身が入ったので、**本物の .skillItem / <select> の上**で測る。
         STEP1 では装置側が空の器を開いて叩いていた = 中身のイベントを 1 つも通していなかった。
       ⭐ 「#prep が出ない」だけだと #35 以後は onTap が閉じないので自明に緑になる。
          そこで overlay まで **イベントが上がったか**を数える spy を併置する (M2 の担当)。 */
    console.log('\n-- §2 伝播 (引き出しの中身の上のタップを飲み込む) --');
    const openA = await clickCenterOfSel(page, ['#pmColumns .pmColumn']);
    await sleep(220);
    const sOpenA = await page.evaluate(DRAWER_SNAP, 0);
    check('(2z) [母集団] カードを押して開いた引き出しに、本物のスキル項目と <select> が両方ある',
      sOpenA.drawerVis === true && sOpenA.nSkillItem >= 1 && sOpenA.nSel >= 1,
      '命中先=' + (openA ? openA.hit : '(取れず)') + ' / 引き出し可視=' + sOpenA.drawerVis
      + ' / skillItem ' + sOpenA.nSkillItem + ' / select ' + sOpenA.nSel + ' / 見出し="' + sOpenA.title + '"');

    await page.evaluate(() => {
      window.__pmSpy = { click: 0, touchend: 0 };
      const ov = document.getElementById('partyMatchOverlay');
      // ⚠ バブリング相で張る。capture で張ると引き出しの stopPropagation より先に走って永久に数える。
      ov.addEventListener('click',    () => { window.__pmSpy.click++; });
      ov.addEventListener('touchend', () => { window.__pmSpy.touchend++; });
    });
    /* ⭐ 枠が埋まっている職の .full な項目を選ぶと、押しても中身が変わらない
       (上限で早期 return する) = 伝播だけを分離して測れる。 */
    const hit2a = await clickCenterOfSel(page,
      ['#pmDrawer .skillItem.full:not(.selected)', '#pmDrawer .skillItem']);
    await sleep(700);
    const s2a = await page.evaluate(PROBE, VIS_FN);
    check('(2a) 引き出しのスキル項目を click しても #prep が出ない',
      hit2a !== null && s2a.prepVis === false && s2a.display === 'flex' && s2a.fading === false,
      '命中先=' + (hit2a ? hit2a.hit : '(取れず)') + ' -> prep=' + s2a.prepVis + ' display=' + s2a.display);
    check('(2a-2) その click は #partyMatchOverlay まで上がっていない (引き出しが飲み込んでいる)',
      !!s2a.spy && s2a.spy.click === 0, 'overlay が受けた click = ' + (s2a.spy ? s2a.spy.click : '(spy なし)'));

    /* ⚠⚠ iOS の <select> は指を離した瞬間に touchend が overlay まで上がる。
       本物の <select> の上でディスパッチする。 */
    const tgt2b = await page.evaluate(() => {
      const d = document.getElementById('pmDrawer');
      const sels = d ? Array.prototype.slice.call(d.querySelectorAll('select.apSel')) : [];
      const vis = sels.filter((s) => s.parentElement && s.parentElement.style.display !== 'none');
      const s = vis[0] || sels[0];
      if (!s) return null;
      let ev;
      try { ev = new TouchEvent('touchend', { bubbles: true, cancelable: true }); }
      catch (e) { ev = new Event('touchend', { bubbles: true, cancelable: true }); }
      s.dispatchEvent(ev);
      return s.id;
    });
    await sleep(700);
    const s2b = await page.evaluate(PROBE, VIS_FN);
    check('(2b) ⚠⚠ 引き出しの <select> の上で touchend をディスパッチしても #prep が出ない (iOS 対策)',
      tgt2b !== null && s2b.prepVis === false && s2b.display === 'flex' && s2b.fading === false,
      '対象=' + tgt2b + ' prep=' + s2b.prepVis + ' display=' + s2b.display + ' fading=' + s2b.fading);
    check('(2b-2) ⚠⚠ その touchend は #partyMatchOverlay まで上がっていない (click だけ止めた実装はここで赤)',
      !!s2b.spy && s2b.spy.touchend === 0, 'overlay が受けた touchend = ' + (s2b.spy ? s2b.spy.touchend : '(spy なし)'));

    /* 引き出しを閉じてから (1b) へ。desktop でも開けたままだと #pmDepart が下へ押されて
       実マウスの座標が取りにくい。閉じるボタンの動作確認も兼ねる。 */
    await page.evaluate(() => { const b = document.getElementById('pmDrawerClose'); if (b) b.click(); });
    await sleep(200);

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
      pending('(5b) 引き出しを開いたまま出発しても、その後の準備画面でスキル選択が正しく更新される', '腕B が演出まで到達しなかった');
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
        pending('(5b) 引き出しを開いたまま出発しても、その後の準備画面でスキル選択が正しく更新される', '出発の口が可視にならなかった');
      } else {
        /* ⭐ ここで (5b) の母集団も作る —— 引き出しを【開いたまま】出発する。
           設定し終えてそのまま出発する = 実プレイで最も起きる終わり方なので、
           (2c) の一撃と兼ねる。⚠ 開いた分 #pmDepart は下へ動くが、dispatch は
           id 指定なので座標には影響されない。 */
        const openB = await clickCenterOfSel(pageB, ['#pmColumns .pmColumn']);
        await sleep(250);
        const bOpen = await pageB.evaluate(PROBE, VIS_FN);
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

        /* ── (5b) 引き出しを開いたまま出発した後、準備画面のスキル選択が生きているか ──
           ⚠⚠ pmLoadoutRepaint はモジュール変数で window に載っていない = 直接は読めない。
             **挙動で測る**: 準備画面のスキル項目を 1 つ押し、selection だけでなく
             #skillList / #skillSlotCounter が実際に描き直されるかを見る。
             close() が pmCloseDrawer() を呼ばないと描き直し先が引き出しのまま残り、
             selection は変わるのに準備画面が 1px も動かない —— 負のコントロール M5。
           ⭐ 「押した項目が 1 つ」だけでは弱い。selection の本数・選択中の項目数・
             残量表示の 3 つが【全部】動いたことを見る (どれか 1 つは偶然でも動きうる)。 */
        const r5b = (reachedB && b3.prepVis) ? await pageB.evaluate(() => {
          const list = document.getElementById('skillList');
          const counter = document.getElementById('skillSlotCounter');
          if (!list || !counter) return null;
          const items = Array.prototype.slice.call(list.querySelectorAll('.skillItem'));
          // .full な未選択項目は上限で早期 return する = 押しても何も起きない。それ以外を選ぶ。
          const t = items.filter((x) => !x.classList.contains('full'))[0];
          if (!t) return null;
          const ck = (typeof activeCharTab !== 'undefined' && activeCharTab)
            ? activeCharTab : ((selection.partyComposition || ['warrior'])[0]);
          const snap = () => ({
            n: (((selection.partySkills || {})[ck]) || []).length,
            sel: list.querySelectorAll('.skillItem.selected').length,
            counter: counter.textContent,
          });
          const before = snap();
          const nm = (t.querySelector('.sName') || {}).textContent || '';
          t.click();
          return { ck: ck, name: nm, before: before, after: snap() };
        }) : null;
        check('(5b) 引き出しを開いたまま出発しても、その後の準備画面でスキル選択が正しく更新される',
          bOpen.drwHidden === false && bOpen.nOpen === 1 && reachedB === true && !!r5b
          && r5b.after.n !== r5b.before.n
          && r5b.after.sel !== r5b.before.sel
          && r5b.after.counter !== r5b.before.counter,
          '出発時の引き出し hidden=' + bOpen.drwHidden + ' pmOpen=' + bOpen.nOpen
          + ' (カードの命中先=' + (openB ? openB.hit : '(取れず)') + ') → 準備画面で "'
          + (r5b ? r5b.name : '(項目が取れず)') + '" を押した結果 '
          + (r5b ? (r5b.ck + ': selection ' + r5b.before.n + '→' + r5b.after.n
              + ' / 選択中の項目 ' + r5b.before.sel + '→' + r5b.after.sel
              + ' / 残量 "' + r5b.before.counter + '"→"' + r5b.after.counter + '"') : '(採れず)'));
      }
    }
    await pageB.close();

    /* ══════════════════════════════════════════════════════════════════
     * §3〜§6 — STEP2 / STEP3 で埋める枠 (⛔ 黙って緑にしない)
     * ══════════════════════════════════════════════════════════════════ */
    /* ═══════════════════════════════════════════════════════════
     * 腕 C (desktop 1280x900 / 同職 2 人を含む決定論的な編成) —— §3 / §4a / §4b
     * ═══════════════════════════════════════════════════════════ */
    console.log('\n-- armC: drawer contents --');
    const pageC = await openTavern(browser, { name: 'drawer', width: 1280, height: 900 }, '');
    const c0 = await playForcedCinema(pageC, SCENARIO, ['rogue', 'rogue', 'mage']);

    /* 実体側の真実 (カードの写経ではなく PARTY_SLOTS / apEquippedIdsFor から引く) */
    const truthC = await pageC.evaluate(() => {
      const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
      return cols.map((c) => {
        const ck = c.dataset.classKey;
        const slot = PARTY_SLOTS.find((s) => s && s.classKey === ck);
        let eq = [];
        try { eq = slot ? (apEquippedIdsFor(slot, ck) || []) : []; } catch (e) { eq = []; }
        const all = slot ? slot.skillPool.map((s) => s.id) : [];
        return {
          classKey: ck,
          equipped: eq,
          nFree: all.filter((id) => eq.indexOf(id) < 0).length,
          travel: eq.filter((id) => TRAVEL_CASTABLE_IDS.indexOf(id) >= 0),
          same: (selection.partyMembers || []).filter((x) => x && x.classKey === ck).length,
        };
      });
    });
    const nCards = truthC.length;

    /* 全カードを順に押して引き出しを開き、その都度状態を採る。 */
    const snaps = [];
    for (let ci = 0; ci < nCards; ci++) {
      const hit = await clickCenterOfSel(pageC, ['#pmColumns .pmColumn:nth-child(' + (ci + 1) + ')']);
      await sleep(200);
      const s = await pageC.evaluate(DRAWER_SNAP, ci);
      snaps.push({ i: ci, hit: hit ? hit.hit : '(取れず)', s: s });
    }

    check('(0e) [装置] 仕込んだ編成で演出が開き、全員確定して出発の口が出た',
      c0.overlayVis === true && c0.depVis === true && nCards >= 3,
      'カード ' + nCards + ' 枚 = ' + JSON.stringify(truthC.map((t) => t.classKey))
      + ' / 出発の口可視=' + c0.depVis);

    check('(3a) カードを押すと #pmDrawer が可視になり、.pmColumn.pmOpen がちょうど 1 枚',
      snaps.length === nCards && nCards >= 3
      && snaps.every((x) => x.s.drawerVis === true && x.s.nOpen === 1 && x.s.openIsMe === true),
      snaps.map((x) => '#' + x.i + '(' + x.s.classKey + ') vis=' + x.s.drawerVis + ' pmOpen=' + x.s.nOpen
        + ' self=' + x.s.openIsMe).join(' , '));

    /* (3b) 傾向の候補は apEquippedIdsFor の部分集合 */
    const badOpt = [];
    snaps.forEach((x) => {
      const eq = truthC[x.i].equipped;
      x.s.apOptions.forEach((v) => { if (eq.indexOf(v) < 0) badOpt.push(x.s.classKey + ':' + v); });
    });
    const popFree = truthC.filter((t) => t.nFree >= 1 && t.equipped.length >= 1);
    const nOptTotal = snaps.reduce((a, x) => a + x.s.apOptions.length, 0);
    check('(3b) 傾向の候補に「枠に入れていない技」が 1 つも無い (apEquippedIdsFor を流用している証明)',
      popFree.length >= 1 && nOptTotal >= 1 && badOpt.length === 0,
      '母集団 ' + popFree.length + ' 職 / 候補総数 ' + nOptTotal + ' / はみ出した候補 = '
      + (badOpt.length ? badOpt.join(',') : 'なし'));

    /* (3c) 2 経路突合: データ由来の職の集合 vs 実際に行が出た職の集合 */
    const uniq = (a) => Array.from(new Set(a)).sort().join(',');
    const travelByData = uniq(truthC.filter((t) => t.travel.length > 0).map((t) => t.classKey));
    const travelByUi   = uniq(snaps.filter((x) => x.s.travelShown).map((x) => x.s.classKey));
    const noTravelData = uniq(truthC.filter((t) => t.travel.length === 0).map((t) => t.classKey));
    check('(3c) 「道中」の行が出るのは 枠 ∩ TRAVEL_CASTABLE_IDS が非空の職だけ (2 経路突合)',
      travelByData !== '' && noTravelData !== '' && travelByData === travelByUi
      && snaps.every((x) => x.s.travelRows === 1),
      'data={' + travelByData + '} / ui={' + travelByUi + '} / travel空の職={' + noTravelData + '}');

    /* (4b) 同職 2 人のときだけ注記 */
    const noteMismatch = snaps.filter((x) => x.s.hasNote !== (truthC[x.i].same >= 2));
    const hasDup = truthC.filter((t) => t.same >= 2).length >= 1;
    const hasSolo = truthC.filter((t) => t.same === 1).length >= 1;
    const dupNoteSnap = snaps.filter((x) => truthC[x.i].same >= 2)[0];
    const dupNote = dupNoteSnap ? dupNoteSnap.s.noteText : '';
    check('(4b) 同職 2 人のとき引き出しに共通適用の注記が出る / 1 人だけのときは出ない',
      hasDup && hasSolo && noteMismatch.length === 0 && dupNote.indexOf('2') >= 0,
      '注記="' + dupNote + '" / 食い違い ' + noteMismatch.length + ' 件 / dup=' + hasDup + ' solo=' + hasSolo);

    /* ── (4a) 同職 2 枚の同期 ── */
    const dupRow = truthC.filter((t) => t.same >= 2)[0];
    const dupClass = dupRow ? dupRow.classKey : null;
    const dupIdxs  = truthC.map((t, k) => (t.classKey === dupClass ? k : -1)).filter((k) => k >= 0);
    check('(4a-0) [母集団] 同じ職が 2 人いる編成を作れている',
      dupClass !== null && dupIdxs.length >= 2,
      'dupClass=' + dupClass + ' / カード番号=' + JSON.stringify(dupIdxs));

    if (!dupClass || dupIdxs.length < 2) {
      pending('(3d) スキル項目を押すと selection.partySkills と localStorage の両方が変わり、引き出しの表示も更新される', '同職 2 人の母集団が作れなかった');
      pending('(3e) 傾向の select を変えると selection.actionPriority と localStorage の両方が変わる', '同上');
      pending('(3f) change の直後も select が同じ DOM ノードのまま (作り直されていない)', '同上');
      pending('(4a) 片方のカードで技を足すと、もう片方のカードの表示も同じ値になる', '同上');
    } else {
      await clickCenterOfSel(pageC, ['#pmColumns .pmColumn:nth-child(' + (dupIdxs[0] + 1) + ')']);
      await sleep(200);
      const before = await pageC.evaluate(DRAWER_SNAP, dupIdxs[0]);
      /* ⭐ 選択済みを 1 つ外す -> 枠に空きができる -> 別の 1 つを足す。
         「足す」を測るには先に空きを作らないと、上限で早期 return されて永久に緑になる。 */
      const step1 = await pageC.evaluate((ck) => {
        const d = document.getElementById('pmDrawer');
        const items = Array.prototype.slice.call(d.querySelectorAll('.skillItem'));
        const t = items.filter((x) => x.classList.contains('selected'))[0];
        if (!t) return null;
        const nm = (t.querySelector('.sName') || {}).textContent || '';
        const headBefore = (document.getElementById('pmDrawerSkillHead') || {}).textContent || '';
        const nBefore = (selection.partySkills[ck] || []).length;
        t.click();
        let ls = null;
        try { ls = JSON.parse(localStorage.getItem('dragonfighters.partySkills') || 'null'); } catch (e) {}
        return {
          name: nm, headBefore: headBefore,
          headAfter: (document.getElementById('pmDrawerSkillHead') || {}).textContent || '',
          nBefore: nBefore, nAfter: (selection.partySkills[ck] || []).length,
          ls: (ls && ls[ck]) ? ls[ck].length : null,
          lsEqualsSel: !!(ls && JSON.stringify(ls[ck]) === JSON.stringify(selection.partySkills[ck])),
        };
      }, dupClass);
      const after1 = await pageC.evaluate(DRAWER_SNAP, dupIdxs[0]);
      check('(3d) スキル項目を押すと selection.partySkills と localStorage の両方が変わり、引き出しの表示も更新される',
        !!step1 && step1.nAfter === step1.nBefore - 1 && step1.ls === step1.nAfter
        && step1.lsEqualsSel === true && step1.headAfter !== step1.headBefore,
        !step1 ? '選択済みのスキル項目が無かった'
        : '外した技="' + step1.name + '" / selection ' + step1.nBefore + '->' + step1.nAfter
          + ' / localStorage ' + step1.ls + ' / 見出し "' + step1.headBefore + '"->"' + step1.headAfter + '"');

      const step2 = await pageC.evaluate((ck) => {
        const d = document.getElementById('pmDrawer');
        const items = Array.prototype.slice.call(d.querySelectorAll('.skillItem'));
        const t = items.filter((x) => !x.classList.contains('selected') && !x.classList.contains('full'))[0];
        if (!t) return null;
        const nm = (t.querySelector('.sName') || {}).textContent || '';
        const nBefore = (selection.partySkills[ck] || []).length;
        t.click();
        return { name: nm, nBefore: nBefore, nAfter: (selection.partySkills[ck] || []).length };
      }, dupClass);
      const after2 = await pageC.evaluate(DRAWER_SNAP, dupIdxs[0]);
      const pick = (snap) => dupIdxs.map((k) => snap.cardSkills[k]);
      const v0 = pick(before), v1 = pick(after1), v2 = pick(after2);
      const allSame = (a) => a.every((x) => x === a[0]);
      check('(4a) 片方のカードで技を足すと、もう片方のカードの表示も同じ値になる',
        !!step2 && step2.nAfter === step2.nBefore + 1
        && allSame(v0) && allSame(v1) && allSame(v2)
        && v1[0] !== v0[0] && v2[0] !== v1[0] && v0[0] !== null,
        'before=' + JSON.stringify(v0) + ' -> 外した後=' + JSON.stringify(v1)
        + ' -> 足した後=' + JSON.stringify(v2)
        + ' (足した技="' + (step2 ? step2.name : 'なし') + '")');

      /* ── (3e)(3f) 傾向の <select> ── */
      const ap = await pageC.evaluate(() => {
        const d = document.getElementById('pmDrawer');
        const sels = Array.prototype.slice.call(d.querySelectorAll('select.apSel'))
          .filter((s) => s.options.length >= 2 && s.parentElement && s.parentElement.style.display !== 'none');
        const s = sels[0];
        if (!s) return null;
        window.__pmSelRef = s;                       // (3f) 同一ノード判定用
        const parts = s.id.split('_');               // pmApSel_<classKey>_<sit>
        const ck = parts[1], sit = parts[2];
        const was = s.value;
        const want = Array.prototype.slice.call(s.options).map((o) => o.value)
          .filter((v) => v && v !== was)[0];
        if (!want) return { id: s.id, want: null };
        s.value = want;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        let ls = null;
        try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
        const now = document.getElementById(s.id);
        return {
          id: s.id, ck: ck, sit: sit, was: was, want: want,
          sel: (selection.actionPriority && selection.actionPriority[ck]) ? selection.actionPriority[ck][sit] : null,
          ls:  (ls && ls[ck]) ? ls[ck][sit] : null,
          sameNode: now === window.__pmSelRef,
          valueNow: now ? now.value : null,
        };
      });
      check('(3e) 傾向の select を変えると selection.actionPriority と localStorage の両方が変わる',
        !!ap && ap.want !== null && ap.sel === ap.want && ap.ls === ap.want && ap.want !== ap.was,
        !ap ? '候補 2 件以上の <select> が無かった'
        : ap.id + ' : "' + ap.was + '" -> "' + ap.want + '" / selection=' + ap.sel + ' / localStorage=' + ap.ls);
      check('(3f) change の直後も select が同じ DOM ノードのまま (作り直されていない)',
        !!ap && ap.sameNode === true && ap.valueNow === ap.want,
        !ap ? '(3e) と同じ理由で採れず' : 'sameNode=' + ap.sameNode + ' / value=' + ap.valueNow);
    }
    await pageC.close();

    /* ═══════════════════════════════════════════════════════════
     * 腕 D (compact 390x844) —— §4c / §4d
     *   ⚠⚠ #partyMatchOverlay は align-items:center の固定オーバーレイ。中身が伸びると
     *     上下とも画面外へ逃げる = 出発の口が押せなくなる。
     * ═══════════════════════════════════════════════════════════ */
    console.log('\n-- armD: compact 390x844 --');
    const pageD = await openTavern(browser, { name: 'compact', width: 390, height: 844 }, '');
    await playForcedCinema(pageD, SCENARIO, ['rogue', 'rogue', 'mage']);
    const hitD = await clickCenterOfSel(pageD, ['#pmColumns .pmColumn:nth-child(2)']);
    await sleep(300);
    const geo = await pageD.evaluate(() => {
      const dep = document.getElementById('pmDepart');
      const drw = document.getElementById('pmDrawer');
      const inr = document.getElementById('pmInner');
      const r = dep ? dep.getBoundingClientRect() : null;
      const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return {
        drawerVis: !!(drw && !drw.hidden),
        nOpen: document.querySelectorAll('#pmColumns .pmColumn.pmOpen').length,
        rect: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } : null,
        hitId: hit ? String(hit.id || hit.className || hit.tagName) : '(なし)',
        vw: window.innerWidth, vh: window.innerHeight,
        drwScrollW: drw ? drw.scrollWidth : 0,
        drwClientW: drw ? drw.clientWidth : 0,
        drwH: drw ? Math.round(drw.getBoundingClientRect().height) : 0,
        drwScrollH: drw ? drw.scrollHeight : 0,
        innerH: inr ? Math.round(inr.getBoundingClientRect().height) : 0,
      };
    });
    check('(4c) ⚠ compact (390x844) で引き出しを開いても #pmDepart が画面内に残っている',
      geo.drawerVis === true && geo.nOpen === 1 && !!geo.rect
      && geo.rect.top >= 0 && geo.rect.bottom <= geo.vh
      && geo.rect.left >= 0 && geo.rect.right <= geo.vw
      && geo.hitId === 'pmDepart',
      'drawer ' + geo.drwH + 'px (中身 ' + geo.drwScrollH + 'px) / #pmInner ' + geo.innerH + 'px / viewport '
      + geo.vw + 'x' + geo.vh + ' / #pmDepart rect=' + JSON.stringify(geo.rect) + ' 命中先=' + geo.hitId
      + ' (カードの命中先=' + (hitD ? hitD.hit : '(取れず)') + ')');
    check('(4d) compact で #pmDrawer が横スクロールを起こさない',
      geo.drawerVis === true && geo.drwScrollW <= geo.drwClientW,
      'scrollWidth ' + geo.drwScrollW + ' <= clientWidth ' + geo.drwClientW);
    await pageD.close();

    /* ═══════════════════════════════════════════════════════════
     * 腕 E (desktop 1280x900) —— §5 (5a) と §6 の母集団 (X-a)
     *   ⚠⚠ (5a) を openPrep 経由で測ってはいけない。openPrep は毎回
     *     regeneratePartyMembers() を通り selection を書き換えるので、
     *     「1 バイトも変わらない」は原理的に成立しない (自明に赤い検出器になる)。
     *     測るのは【演出を開いて出発するまでの一往復】= 既存の検証シーム __pmTest.play。
     * ═══════════════════════════════════════════════════════════ */
    console.log('\n-- armE: identity (5a) / population for section6 (X-a) --');
    const pageE = await openTavern(browser, { name: 'ident', width: 1280, height: 900 }, '');
    /* 編成の仕込み = 装置側の書き込み。⭐ スナップショットはこの【後】で採る
       (装置が書いた分を「本番が壊した」と読み違えないため)。 */
    await pageE.evaluate((want) => {
      const mk = (ck, isHero, name) => ({
        classKey: ck, isHero: !!isHero, name: name,
        zone: PARTY_ZONES[ck], variant: 0, level: 10,
      });
      selection.partyComposition = ['warrior'];
      selection.partyMembers = [mk('warrior', true, '')]
        .concat(want.map((ck, i) => mk(ck, false, '仲間' + (i + 1))));
      saveSelections();
    }, ['rogue', 'cleric', 'mage']);
    const eBefore = await pageE.evaluate(STATE_SNAP);
    const eReady = await playCinemaOnly(pageE, SCENARIO);
    const eMid = await pageE.evaluate(PROBE, VIS_FN);          // ⚠ 引き出しは一度も開かない
    await clickCenterOf(pageE, 'pmDepart');
    await sleep(1000);
    const eEnd = await pageE.evaluate(PROBE, VIS_FN);
    const eAfter = await pageE.evaluate(STATE_SNAP);
    check('(5a) 引き出しを一度も開かずに出発したとき、selection と localStorage が 1 バイトも変わっていない',
      eReady === true && eMid.drwHidden === true && eMid.nOpen === 0 && eEnd.display === 'none'
      && eBefore.nKeys >= 3 && eBefore.sel.length > 200        // ← 空同士を比べていない証明
      && eBefore.sel === eAfter.sel && eBefore.ls === eAfter.ls,
      '比べた母集団 = selection ' + eBefore.sel.length + ' 文字 / localStorage ' + eBefore.nKeys + ' キー'
      + ' / 出発前の引き出し hidden=' + eMid.drwHidden + ' pmOpen=' + eMid.nOpen
      + ' → selection 一致=' + (eBefore.sel === eAfter.sel)
      + ' localStorage 一致=' + (eBefore.ls === eAfter.ls) + ' / 閉じた display=' + eEnd.display);

    /* 同じページで演出を開き直し、スイッチ無しなら引き出しが開くことを確かめる。
       ⭐⭐ これが (X-b)/(X-c) の母集団。これが無いと「出なかった」が自明に緑になる。 */
    const eReady2 = await playCinemaOnly(pageE, SCENARIO);
    const hitXa = await clickCenterOfSel(pageE, ['#pmColumns .pmColumn:nth-child(2)']);
    await sleep(250);
    const xa = await pageE.evaluate(DRAWER_SNAP, 1);
    check('(X-a) [母集団] スイッチが無ければ、カードを押すと引き出しが開きスキル段も傾向段も出る',
      eReady2 === true && xa.drawerVis === true && xa.nOpen === 1
      && xa.nSkillItem >= 1 && xa.nSel >= 1,
      '命中先=' + (hitXa ? hitXa.hit : '(取れず)') + ' / 職=' + xa.classKey
      + ' 可視=' + xa.drawerVis + ' pmOpen=' + xa.nOpen
      + ' / スキル項目 ' + xa.nSkillItem + ' / 傾向の select ' + xa.nSel);
    const xaSel = xa.nSel;
    await pageE.close();

    /* ═══════════════════════════════════════════════════════════
     * 腕 G (?pmsetup=0) —— (X-b) と (X-d) の片側
     *   ⚠ 「従来どおり出発する」は #prep が出るところまで見たいので、ここだけは
     *     受注からの実導線 (advanceToCinema) を通す。
     * ═══════════════════════════════════════════════════════════ */
    console.log('\n-- armG: ?pmsetup=0 --');
    const pageG = await openTavern(browser, { name: 'pmsetup0', width: 1280, height: 900 }, 'pmsetup=0');
    const gSeed = await pageG.evaluate(AP_SEED);
    const advG = await advanceToCinema(pageG, SCENARIO);
    const gFilled = await waitAllFilled(pageG, 25000);
    const g0 = await pageG.evaluate(PROBE, VIS_FN);
    /* ⛔ カードではなく overlay の余白を叩く —— これが「背景タップ」の定義そのもの。 */
    const gHit = await clickPoint(pageG, 6, 6);
    await sleep(1000);
    const g1 = await pageG.evaluate(PROBE, VIS_FN);
    const reachedG = await settleToPrep(pageG, 40000);
    const g2 = await pageG.evaluate(PROBE, VIS_FN);
    /* 「カードも押せない」= ?pmsetup=0 ではカードは背景の一部。準備画面から 🎴 で開き直し、
       カードを叩いて【引き出しが開かず、背景と同じく閉じる】ことを見る。
       ⚠ 先に背景を叩いてしまうと閉じるので、順番はこの通りでないと測れない。 */
    console.log('       ?pmsetup=0: 到達=' + advG.reached + ' 全確定=' + gFilled
      + ' / 背景 (' + gHit + ') を叩く前 hint="' + g0.hint + '" 引き出し hidden=' + g0.drwHidden
      + ' 出発の口 可視=' + g0.depVis + ' → 直後 display=' + g1.display
      + ' / settleToPrep=' + reachedG + ' prep=' + g2.prepVis);
    let gCard = null;
    if (await pageG.evaluate(() => !!document.getElementById('btnPartyView'))) {
      /* ⚠ puppeteer の page.click は「画面内で可視かつクリック可能」を要求し、そうでないと
         「Node is either not clickable or not an Element」で run ごと落ちる (2026-08-29 実測)。
         ここで測りたいのはボタンの押しやすさではなく **カードが押せないこと** なので、
         開き直しは DOM の click() で済ませる (押しやすさは driver_party_view_reopen の担当)。 */
      await pageG.evaluate(() => {
        const b = document.getElementById('btnPartyView');
        if (b && b.scrollIntoView) b.scrollIntoView({ block: 'center' });
        if (b) b.click();
      });
      await sleep(950);                       // review は即確定 + PM_TAP_GATE 500ms
      const gr0 = await pageG.evaluate(PROBE, VIS_FN);
      const grHit = await clickCenterOfSel(pageG, ['#pmColumns .pmColumn']);
      await sleep(1000);
      const gr1 = await pageG.evaluate(PROBE, VIS_FN);
      gCard = { opened: gr0.overlayVis, dep: gr0.depVis, hit: grHit ? grHit.hit : '(取れず)',
                drwAfter: gr1.drwHidden, nOpen: gr1.nOpen, display: gr1.display };
    }
    const gKept = await pageG.evaluate(AP_READ);
    check('(X-b) ?pmsetup=0 で #pmDrawer も #pmDepart も出ず、背景タップで従来どおり出発する (カードも押せない)',
      advG.reached === true && gFilled === true
      && g0.drwHidden === true && g0.drwVis === false
      && g0.depHidden === true && g0.depVis === false
      && g0.hint === 'タップして出発'
      && g1.display === 'none' && reachedG === true && g2.prepVis === true
      && !!gCard && gCard.opened === true && gCard.dep === false
      && gCard.drwAfter === true && gCard.nOpen === 0 && gCard.display === 'none',
      '全確定=' + gFilled + ' / 引き出し hidden=' + g0.drwHidden + ' 出発の口 可視=' + g0.depVis
      + ' hint="' + g0.hint + '" / 背景 (' + gHit + ') を叩く → display=' + g1.display
      + ' 準備画面=' + g2.prepVis + ' / 開き直してカード ('
      + (gCard ? gCard.hit : '-') + ') を叩く → 引き出し hidden=' + (gCard ? gCard.drwAfter : '-')
      + ' pmOpen=' + (gCard ? gCard.nOpen : '-') + ' display=' + (gCard ? gCard.display : '-'));
    await pageG.close();

    /* ═══════════════════════════════════════════════════════════
     * 腕 H (?actionpri=0) —— (X-c) と (X-d) のもう片側
     *   ⭐ ?pmsetup=0 とは別物: 引き出しは出るが【傾向段だけ】無い。
     * ═══════════════════════════════════════════════════════════ */
    console.log('\n-- armH: ?actionpri=0 --');
    const pageH = await openTavern(browser, { name: 'actionpri0', width: 1280, height: 900 }, 'actionpri=0');
    const hSeed = await pageH.evaluate(AP_SEED);
    const h0 = await playForcedCinema(pageH, SCENARIO, ['rogue', 'cleric', 'mage']);
    const hitXc = await clickCenterOfSel(pageH, ['#pmColumns .pmColumn:nth-child(2)']);
    await sleep(250);
    const xc = await pageH.evaluate(DRAWER_SNAP, 1);
    const xcDom = await pageH.evaluate(() => ({
      apSec:  !!document.getElementById('pmDrawerAp'),
      apRows: document.querySelectorAll('#pmDrawer .apRow').length,
      apSel:  document.querySelectorAll('#pmDrawer select.apSel').length,
      skill:  document.querySelectorAll('#pmDrawer .skillItem').length,
      head:   !!document.getElementById('pmDrawerSkillHead'),
    }));
    const hKept = await pageH.evaluate(AP_READ);
    check('(X-c) ?actionpri=0 で引き出しは出るがスキル段だけ (傾向段が無い)',
      h0.depVis === true && xc.drawerVis === true && xc.nOpen === 1
      && xcDom.skill >= 1 && xcDom.head === true
      && xcDom.apSec === false && xcDom.apRows === 0 && xcDom.apSel === 0
      && xaSel >= 1,                       // ← 素の盤面には傾向段が実在した (2 経路突合)
      '命中先=' + (hitXc ? hitXc.hit : '(取れず)') + ' / 引き出し可視=' + xc.drawerVis
      + ' / スキル項目 ' + xcDom.skill + ' 見出し=' + xcDom.head
      + ' / 傾向段 apSec=' + xcDom.apSec + ' apRow ' + xcDom.apRows + ' select ' + xcDom.apSel
      + ' (素の盤面では select ' + xaSel + ' 本)');
    await pageH.close();

    /* (X-d) —— どちらのスイッチでも「保存済みの値」が消えない。
       ⚠ 撤退スイッチは表示を消すだけで、保存の中身には触ってはいけない
         (外せばそのまま戻ることが撤退路の条件)。 */
    const keptOk = (sd, rd) => !!sd && !!rd && !!rd.sel && !!rd.ls
      && rd.sel.general === sd.general && rd.sel.boss === sd.boss
      && rd.ls.general  === sd.general && rd.ls.boss  === sd.boss
      && rd.skills === sd.skills && rd.selSkills === sd.skills;
    check('(X-d) どちらのスイッチでも保存済みの値は消えていない',
      !!gSeed && !!hSeed && !!gSeed.general && !!hSeed.general
      && keptOk(gSeed, gKept) && keptOk(hSeed, hKept),
      '?pmsetup=0: 仕込み ' + JSON.stringify(gSeed) + ' → 読み返し ' + JSON.stringify(gKept)
      + '  /  ?actionpri=0: 仕込み ' + JSON.stringify(hSeed) + ' → 読み返し ' + JSON.stringify(hKept));

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
