#!/usr/bin/env node
/*
 * driver_party_view_reopen.js — 「準備画面から マッチング画面 を開き直せる」実地検証ドライバ
 *
 *   node tools/driver_party_view_reopen.js [--headful] [--browser <path>] [--port N]
 *   node tools/driver_party_view_reopen.js --negative              ← 変異 5 本を同時注入
 *   node tools/driver_party_view_reopen.js --negative --only N4    ← 1 本だけ注入 (担当の確定用)
 *
 * ── 何を測るか ────────────────────────────────────────────────────────────────
 * ユーザー報告: 「受注直後のマッチング画面から装備変更の画面へ移ると、酒場に戻るか断るか
 * しかできない。もう一度あの画面に戻ってこられるようにしてほしい」
 *   → 準備画面 (#prep) の パーティ欄に 🎴 編成を見る (#btnPartyView) を足し、
 *     #partyMatchOverlay を **review モード** (全員確定済み・開示アニメ無し) で開き直す。
 *
 * ⚠⚠ このドライバの肝は「開いた」ではなく **「開いて、閉じて、準備画面に居る」** を測ること。
 *   マッチング画面の既存の待ち文言は「タップして出発」で、そのまま流用すると
 *   *押したら潜れる* という嘘の導線になる。閉じた先が #prep のままであること (§2) と
 *   文言が「タップして準備へ戻る」であること (1d) は、同じ 1 つの主張の両面。
 *
 * ⚠ 到達を必ず assert する。#prep に着いていない状態で「オーバーレイが閉じている」を測ると
 *   全部が自明に真になる空振り (memory ⑤: 母集団はカメラの置き方だけで消える)。→ (0a)(0b)。
 *
 * ── 負のコントロール (--negative) ──────────────────────────────────────────
 * 配信する tavern.html のバイト列へ変異を注入し、**下記が赤くなること**で物差しの生存を証明する。
 *   N1: finishReveal の待ち文言の三項を "タップして出発" 固定へ
 *       → (1d) が赤。閉じたら準備画面へ戻るのに「出発」と言う = 嘘の導線が復活する。
 *   N2: `if (m.isHero || review)` を `if (m.isHero)` へ (review でも仲間を伏せる)
 *       → (1b)(1c) が赤。開き直すたびに ？？？ から始まる茶番の再生になる。
 *   N3: `if (review) finishReveal();` を `if (false) ...` へ (待機フェーズへ即入らない)
 *       → (1e) が赤。720ms のあいだ「開いたのに何も言わない」死に時間が出る。
 *   N4: PM_TAP_GATE を 0 へ
 *       → (2a) が赤。iOS の touchend→click ゴーストクリックが overlay へ落ちて即閉じる。
 *   N5: 呼び口 `playPartyMatchCinematic(prepScenario, { review: true })` から opts を落とす
 *       → (1b)(1d) が赤。関数側が review を持っていても、渡していなければ何も起きない。
 * ⭐⭐⭐ 実測 (2026-08-29): **同時注入だけで済ませると N4 が空振りする**。N5 が review を
 *   丸ごと殺すと開いた 300ms 後は「開示フェーズ」なので、タップが close ではなく skipRest に
 *   落ち、猶予 0 の証拠が消えて (2a) が緑になる → `--only <label>` で 1 本ずつ確定させること。
 *   1 本ずつ注入した時の担当表 (これが腐ったら物差しが死んでいる):
 *     N1 → (1d)                       N2 → (1b)(1c)(3b)
 *     N3 → (1e)(3b)                   N4 → (2a)
 *     N5 → (1b)(1c)(1d)(1e)(3b)
 *   5 本同時 (--negative) では上記に §5 の (5e)(5f) が加わり 計 7 本が赤 = 35 中 28 PASSED。
 *   素 (2026-08-29 実測) = **35/35 PASSED / 0 FAILED / 0 PENDING**。
 * ⚠ §4 (非退行) はどの変異でも緑のままであることが期待値 = 変異が的を外していない証拠。
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
/* ⭐⭐⭐ 変異を全部同時に入れると **互いを覆い隠す**。実測: N5 (呼び口が review を渡さない) を
 *   入れると review モードが丸ごと死に、開いた 300ms 後は「開示フェーズ」なので
 *   タップが close ではなく skipRest に落ち、**N4 (猶予 0) の証拠 (2a) が消えて緑になる**。
 *   → `--only N4` で 1 本だけ注入し、変異ごとの担当を確定させる (§担当表はヘッダの表)。 */
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '9480'), 10);

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 *   ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = { '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')) };

/* アンカーがちょうど 1 箇所でなければ **走らせる前に exit 3**。
   腐ったアンカーで「注入したつもり」のまま緑になるのを防ぐ (memory: 変異アンカーの 2 ヒット事故)。 */
function mutate(label, anchor, patch) {
  // --only N4 のように 1 本だけ注入する時は、名指しされていない変異を飛ばす。
  // ⚠ アンカーの生存確認だけは飛ばした側でも行う (腐ったアンカーを見逃さない)。
  const tag = label.split(' ')[0];
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
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました');
}
if (NEGATIVE) {
  mutate('N1 (待ち文言を「出発」固定へ)',
    'review ? "タップして準備へ戻る" : "タップして出発"',
    '"タップして出発"');
  mutate('N2 (review でも仲間を伏せる)',
    'if (m.isHero || review) cols[i].fill(false); else revealQueue.push(i);',
    'if (m.isHero) cols[i].fill(false); else revealQueue.push(i);');
  mutate('N3 (待機フェーズへ即入らない)',
    'if (review) finishReveal();',
    'if (false) finishReveal();');
  mutate('N4 (タップ猶予を 0 へ)',
    'const PM_TAP_GATE = 500;',
    'const PM_TAP_GATE = 0;');
  mutate('N5 (呼び口が review を渡さない)',
    'playPartyMatchCinematic(prepScenario, { review: true });',
    'playPartyMatchCinematic(prepScenario);');
}

/* ══════════════════════════════════════════════════════════════════════════
 * ブラウザ / サーバ
 * ══════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u]) { rs.setHeader('Content-Type', MIME['.html']); rs.end(FROZEN[u]); return; }
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];

/* 可視判定。checkVisibility は祖先の display:none までまとめて見てくれる。 */
const VIS_FN = `(function(el){
  if (!el) return false;
  if (typeof el.checkVisibility === 'function')
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  return el.getClientRects().length > 0;
})`;

/* ══════════════════════════════════════════════════════════════════════════
 * 観測プローブ
 * ══════════════════════════════════════════════════════════════════════════ */
const PROBE = (visSrc) => {
  const vis = eval(visSrc);
  const q = (id) => document.getElementById(id);
  const ov = q('partyMatchOverlay');
  const hint = q('pmHint');
  const cols = Array.prototype.slice.call(document.querySelectorAll('#pmColumns .pmColumn'));
  const txt = (el) => (el && el.textContent ? el.textContent.trim() : '');
  const heroCol = document.querySelector('#pmColumns .pmHeroCol') || cols[0] || null;
  let heroWeapon = '(列なし)';
  if (heroCol) {
    const rows = Array.prototype.slice.call(heroCol.querySelectorAll('.pmEquipRow'));
    const r = rows.filter((x) => txt(x.querySelector('.pmEquipLabel')) === '武器')[0];
    heroWeapon = r ? txt(r.querySelector('.pmEquipVal')) : '(武器行なし)';
  }
  const btn = q('btnPartyView');
  let btnHitTest = '(ボタンなし)';
  if (btn) {
    const rc = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
    if (!hit) btnHitTest = '(点に何もない)';
    else if (hit === btn || btn.contains(hit)) btnHitTest = 'self';
    else btnHitTest = String(hit.id || hit.className || hit.tagName || '?');
  }
  return {
    prepVis:    vis(q('prep')),
    btnExists:  !!btn,
    btnVis:     vis(btn),
    btnText:    txt(btn),
    btnHitTest,
    overlayVis: vis(ov),
    display:    ov ? ov.style.display : '(なし)',
    /* ⚠⚠⚠ close() は「fading クラス → 520ms 後に display:none」の 2 段。フェードの最中は
       display も flex のままで opacity も 0 ではないので、checkVisibility は **true を返す**。
       閉じ始めたのに「まだ開いている」と読める窓が 520ms あり、そこで (2a) を採ると
       N4 (猶予 0) を入れても緑になる = 永久緑 (2026-08-29 に --only N4 で実測)。
       → 閉じ判定は必ず「フェードが終わり切った後」に採るか、この fading を見る。 */
    fading:     !!(ov && ov.classList.contains('fading')),
    hint:       txt(hint),
    hintWait:   !!(hint && hint.classList.contains('pmWait')),
    nCols:      cols.length,
    nFilled:    cols.filter((c) => c.dataset.state === 'filled').length,
    names:      cols.map((c) => txt(c.querySelector('.pmName'))),
    heroWeapon,
    departVis:  vis(q('btnDepart')),
    path:       location.pathname,
  };
};

/* 出発準備画面まで進む汎用ループ (driver_depart_menu_clean と同型)。
   ⚠ 受注ナレは音声ペースだとクリックで飛ばせず、実測で 20 秒超かかる。budget をケチると
      (0a) が落ちて「何も見えていないから何も出ない」という空振り PASS に化ける。 */
async function advanceToPrep(page, maxSteps) {
  const steps = [];
  for (let i = 0; i < (maxSteps || 150); i++) {
    const st = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      if (vis(q('prep'))) return { done: true, at: 'prep' };
      if (vis(q('partyMatchOverlay'))) { q('partyMatchOverlay').click(); return { done: false, at: 'partyMatchOverlay' }; }
      if (vis(q('prologueOverlay'))) { q('prologueOverlay').click(); return { done: false, at: 'prologueOverlay' }; }
      const acc = q('btnAccept');
      if (vis(acc) && !acc.disabled) { acc.click(); return { done: false, at: 'btnAccept' }; }
      const t = document.querySelector('#questTable_goblin-mine, #tableArea .table');
      if (t && vis(t)) { t.click(); return { done: false, at: 'table' }; }
      return { done: false, at: '(待機)' };
    }, VIS_FN);
    if (steps[steps.length - 1] !== st.at) steps.push(st.at);
    if (st.done) return { reached: true, steps };
    await sleep(420);
  }
  return { reached: false, steps };
}

async function openClean(browser, urlPath) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // 同一オリジンの軽量ファイルで localStorage ハンドルを得る (tavern を開くと副作用が乗る)
  await page.goto('http://localhost:' + PORT + '/js/skill-check.js', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    try {
      localStorage.clear(); sessionStorage.clear();
      // 前口上だけ飛ばす (音声ペースのナレはクリックで飛ばせず数分待たされる)。dev とは無関係のキー。
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  });
  await page.goto('http://localhost:' + PORT + urlPath, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(900);
  return page;
}

/* 実クリックで 🎴 編成を見る を押す。⚠ page.click は座標クリックなので、ボタンが
   画面外だと黙って別の要素を押す → scrollIntoView してから押す。 */
async function pressPartyView(page) {
  await page.evaluate(() => {
    const b = document.getElementById('btnPartyView');
    if (b && b.scrollIntoView) b.scrollIntoView({ block: 'center' });
  });
  await sleep(150);
  await page.click('#btnPartyView');
}

/* オーバーレイの地をタップする (実プレイの指と同じ経路)。 */
async function tapOverlay(page) {
  await page.evaluate(() => {
    const ov = document.getElementById('partyMatchOverlay');
    if (ov) ov.click();
  });
}

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  :' + PORT + (NEGATIVE ? '   [NEGATIVE]' : ''));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    /* ══════════════════════════════════════════════════════════════════
     * §0 装置 — 準備画面まで実クリックで到達し、物差しが生きていることを先に取る
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- §0 装置: 酒場 → 出発準備画面 (実クリック導線) --');
    const page = await openClean(browser, '/tavern.html');
    const adv = await advanceToPrep(page);
    check('(0a) [装置] 出発準備画面まで到達した (これが無いと以下は全部空振り)',
      adv.reached, 'steps=' + adv.steps.join('>').slice(0, 120));
    const p = await page.evaluate(PROBE, VIS_FN);
    check('(0b) [装置] 🎴 編成を見る が準備画面で見えている', p.btnVis === true,
      'exists=' + p.btnExists + ' text="' + p.btnText + '"');
    check('(0c) [装置] 押す前はマッチング画面が閉じている (開きっぱなしを「開いた」と誤読しない)',
      p.overlayVis === false, 'display=' + p.display);
    check('(0d) 押し間違いの導線ではない: ボタン文言に「出発」が入っていない',
      p.btnText.indexOf('出発') < 0, '"' + p.btnText + '"');

    const party = await page.evaluate(() =>
      (selection.partyMembers || []).map((m) => ({ name: m.name, isHero: !!m.isHero, cls: m.classKey })));
    check('(0e) [母集団ガード] パーティが 2 人以上いる (1 人だとカラム比較が自明になる)',
      party.length >= 2, party.length + ' 人: ' + party.map((m) => (m.isHero ? '★' : '') + m.cls).join(','));

    /* ══════════════════════════════════════════════════════════════════
     * §1 開く — review モードは「見るだけ」= 全員確定済み・開示アニメ無し
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- §1 🎴 編成を見る でマッチング画面が開き直せる --');
    await pressPartyView(page);
    await sleep(300);                       // ⚠ 開示アニメ 1 コマ (720ms) より **短く** 採る
    const o1 = await page.evaluate(PROBE, VIS_FN);
    console.log('       開いた直後(300ms): display=' + o1.display + ' hint="' + o1.hint
      + '" wait=' + o1.hintWait + ' cols=' + o1.nFilled + '/' + o1.nCols
      + ' names=' + JSON.stringify(o1.names));
    check('(1a) ★受入条件: 押すとマッチング画面が開く', o1.overlayVis === true, 'display=' + o1.display);
    check('(1b) ★受入条件: 開いた 300ms 後には全員が確定表示 (開示アニメを 1 コマも通らない)',
      o1.nCols > 0 && o1.nFilled === o1.nCols, o1.nFilled + '/' + o1.nCols);
    check('(1c) 「？？？」の伏せ札が 1 枚も無い',
      o1.names.length > 0 && o1.names.filter((n) => n.indexOf('？') >= 0).length === 0,
      JSON.stringify(o1.names));
    check('(1d) ★受入条件: 待ち文言が「タップして準備へ戻る」(閉じた先は出発ではない)',
      o1.hint === 'タップして準備へ戻る', '実際 = "' + o1.hint + '"');
    check('(1e) 300ms 以内に待機フェーズへ入っている (.pmWait が付く = 死に時間が無い)',
      o1.hintWait === true, 'pmWait=' + o1.hintWait);
    check('(1f) カラム数がパーティ人数と一致', o1.nCols === party.length,
      o1.nCols + ' 列 / ' + party.length + ' 人');
    check('(1g) 開いている間は 🎴 編成を見る が overlay の下に隠れる (二重に開けない)',
      o1.btnHitTest !== 'self', 'ボタン中心の elementFromPoint = ' + o1.btnHitTest);

    /* ══════════════════════════════════════════════════════════════════
     * §2 閉じる — 戻る先は【準備画面】であって出発ではない
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- §2 タップで閉じると準備画面へ戻る (出発しない) --');
    await tapOverlay(page);                 // 開いてから約 300ms = PM_TAP_GATE(500ms) の内側
    // ⚠ 200ms で採ってはいけない。close() のフェードは 520ms 続き、その間 display は flex の
    //   まま = 「閉じ始めたのに開いている」と読める。フェードが終わる時刻を越えてから採る。
    //   ⚠ ここで待っても猶予明けに勝手には閉じない (閉じる唯一の経路は onTap)。
    await sleep(750);
    const o2a = await page.evaluate(PROBE, VIS_FN);
    check('(2a) 猶予 (PM_TAP_GATE) 内のタップでは閉じない (iOS のゴーストクリック対策が生きている)',
      o2a.display === 'flex' && o2a.fading === false,
      'display=' + o2a.display + ' fading=' + o2a.fading);

    await sleep(100);                       // 猶予はとうに明けている
    await tapOverlay(page);
    await sleep(900);                       // フェード 520ms + 余裕
    const o2b = await page.evaluate(PROBE, VIS_FN);
    check('(2b) ★受入条件: 猶予明けのタップで閉じる (フェードも終わり切って display:none)',
      o2b.display === 'none' && o2b.overlayVis === false,
      'display=' + o2b.display + ' vis=' + o2b.overlayVis);
    check('(2c) ★受入条件: 閉じた先が準備画面 (#prep が見えている)', o2b.prepVis === true);
    check('(2d) ★受入条件: 出発していない (tavern.html のまま / 出発ボタンも健在)',
      /tavern\.html$/.test(o2b.path) && o2b.departVis === true,
      'path=' + o2b.path + ' departVis=' + o2b.departVis);
    check('(2e) 閉じた後、🎴 編成を見る が再び押せる位置に戻っている',
      o2b.btnHitTest === 'self', 'ボタン中心の elementFromPoint = ' + o2b.btnHitTest);

    /* ══════════════════════════════════════════════════════════════════
     * §3 中身は「いま」を映す — キャッシュした古い絵を出していない
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- §3 開き直すたびに現在の装備・顔ぶれを映す --');
    const eq = await page.evaluate(() => {
      const heroKey = (selection.partyComposition && selection.partyComposition[0]) || 'warrior';
      const pool = ((CHAR_EQUIP[heroKey] || {}).weapons) || [];
      const cur = getEquipSelection(heroKey).weapon | 0;
      const next = pool.length > 1 ? ((cur + 1) % pool.length) : cur;
      const applied = pool.length > 1 ? dfEquip(heroKey, 'weapon', next) : false;
      try { renderCharLoadout(); } catch (e) {}
      return { heroKey, poolLen: pool.length, cur, next, applied,
               curName: pool[cur] ? pool[cur].name : '(なし)',
               nextName: pool[next] ? pool[next].name : '(なし)' };
    });
    console.log('       主人公=' + eq.heroKey + ' 武器プール ' + eq.poolLen + ' 本: "'
      + eq.curName + '" → "' + eq.nextName + '"');
    if (!(eq.poolLen > 1 && eq.applied && eq.curName !== eq.nextName)) {
      pending('(3a) 装備を替えてから開き直すとカラムに反映される',
        '母集団なし: プール ' + eq.poolLen + ' 本 / applied=' + eq.applied);
      pending('(3a0) [装置] 替える前に開いた列は古い方の武器名だった', '(3a) の母集団が無いため未測定');
      pending('(3z) [装置] 2 度目も開けている', '(3a) の母集団が無いため未測定');
    } else {
      await pressPartyView(page);
      await sleep(300);
      const o3 = await page.evaluate(PROBE, VIS_FN);
      check('(3z) [装置] 2 度目も開けている (1 回きりの導線ではない)', o3.overlayVis === true, 'display=' + o3.display);
      /* ⚠ (3a) だけだと「たまたま今の武器名を出しているだけ」と区別できない。
         §1 で開いた **替える前** の列が古い方の名前だったことを併せて見て、
         列が装備に追随していることを 2 点で押さえる (片方だけでは永久緑になりうる)。 */
      check('(3a0) [装置] 替える前に開いた列は古い方の武器名だった (追随の前後 2 点)',
        o1.heroWeapon === eq.curName, '1 回目の列 = "' + o1.heroWeapon + '" / 替える前 "' + eq.curName + '"');
      check('(3a) ★受入条件: 装備を替えてから開き直すと、主人公カラムの武器が更新後の名前になる',
        o3.heroWeapon === eq.nextName, '列の武器 = "' + o3.heroWeapon + '" / 期待 "' + eq.nextName + '"');
      await sleep(500); await tapOverlay(page); await sleep(900);
    }

    // 募集をかけ直してから開き直す → 古い顔ぶれを出さない
    const beforeNames = JSON.stringify(party.filter((m) => !m.isHero).map((m) => m.name));
    let rr = null;
    for (let i = 0; i < 8; i++) {
      rr = await page.evaluate((bj) => {
        const before = JSON.parse(bj);
        document.getElementById('btnReroll').click();
        const after = (selection.partyMembers || []).filter((m) => !m.isHero).map((m) => m.name);
        return { before, after, changed: JSON.stringify(before) !== JSON.stringify(after) };
      }, beforeNames);
      if (rr.changed) break;
      await sleep(60);
    }
    if (!rr || !rr.changed) {
      pending('(3b) 募集をかけ直してから開き直すと新しい顔ぶれが出る', '8 回引き直しても顔ぶれが変わらなかった');
      pending('(3c) 引き直しで顔ぶれが実際に変わった', '(3b) の母集団が無いため未測定');
      pending('(3d) 3 度目も開いて閉じられた', '(3b) の母集団が無いため未測定');
    } else {
      await pressPartyView(page);
      await sleep(300);
      const o4 = await page.evaluate(PROBE, VIS_FN);
      const shown = o4.names.filter((n) => n.indexOf('（あなた）') < 0);
      check('(3b) ★受入条件: 募集をかけ直してから開き直すと、カラムが新しい顔ぶれになる',
        JSON.stringify(shown) === JSON.stringify(rr.after),
        '列 = ' + JSON.stringify(shown) + ' / 実体 = ' + JSON.stringify(rr.after));
      check('(3c) 引き直しで顔ぶれが実際に変わった (このテストが自明でないことの証明)',
        JSON.stringify(rr.before) !== JSON.stringify(rr.after),
        JSON.stringify(rr.before) + ' -> ' + JSON.stringify(rr.after));
      await sleep(500); await tapOverlay(page); await sleep(900);
      const o5 = await page.evaluate(PROBE, VIS_FN);
      check('(3d) 3 度目も開いて閉じられた (何度でも往復できる)',
        o5.overlayVis === false && o5.prepVis === true,
        'overlay=' + o5.overlayVis + ' prep=' + o5.prepVis);
    }
    await page.close();

    /* ══════════════════════════════════════════════════════════════════
     * §4 非退行 — review を持たない従来の呼び方は 1 ミリも変わらない
     *   ⚠ 実クリック導線は受注ナレで 20 秒超かかるので、ここは既存の検証シーム
     *     window.__pmTest (verify_recruit_size.js と同じ入口) で本番関数を直に駆動する。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- §4 既存の受注直後の演出が非退行 (opts 無しの呼び方) --');
    const page2 = await openClean(browser, '/tavern.html');
    const n1 = await page2.evaluate(() => {
      const out = { threw: '', seam: typeof (window.__pmTest && window.__pmTest.play) };
      try {
        window.__pmTest.ensureParty();
        const sc = scenarios.filter((s) => s.id === 'orc-fort')[0];
        prepScenario = sc;
        window.__pmTest.play(sc);          // ⚠ opts を渡さない = 従来どおりの呼び方。await しない
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    });
    await sleep(250);
    const n1a = await page2.evaluate(PROBE, VIS_FN);
    check('(4z) [装置] 検証シーム __pmTest.play が呼べた + 例外なし',
      n1.seam === 'function' && n1.threw === '' && n1a.overlayVis === true,
      'seam=' + n1.seam + ' threw=' + (n1.threw || 'なし') + ' overlay=' + n1a.overlayVis);
    check('(4a) 従来の呼び方では開示アニメが生きている (直後は主人公 1 人だけが確定)',
      n1a.nCols > 1 && n1a.nFilled === 1, n1a.nFilled + '/' + n1a.nCols);
    check('(4b) 従来の呼び方の初期文言は「タップでスキップ」のまま',
      n1a.hint === 'タップでスキップ', '実際 = "' + n1a.hint + '"');
    await sleep(720 * 4 + 900);            // 全開示 + PM_TAP_GATE
    const n1b = await page2.evaluate(PROBE, VIS_FN);
    check('(4c) 全開示後の文言は「タップして出発」のまま (review の文言が漏れていない)',
      n1b.hint === 'タップして出発' && n1b.nFilled === n1b.nCols,
      '"' + n1b.hint + '" / ' + n1b.nFilled + '/' + n1b.nCols);
    await page2.close();

    /* ══════════════════════════════════════════════════════════════════
     * §5 iPhone 幅 (390px) — ボタンが 2 つ並んだせいで潰れていないか
     *   ⚠ .prepPanel .ph は compact で flex-wrap:wrap になる。折り返すのは正しいが、
     *     「横にはみ出す」「2 つが重なる」「片方が画面外」は全部欠陥。目視でなく数で押さえる。
     * ══════════════════════════════════════════════════════════════════ */
    console.log('\n-- §5 iPhone 幅 (390x844) でボタン 2 つが潰れない --');
    const page3 = await openClean(browser, '/tavern.html');
    await page3.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page3.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(900);
    const adv3 = await advanceToPrep(page3);
    check('(5z) [装置] iPhone 幅でも準備画面まで到達した', adv3.reached,
      'steps=' + adv3.steps.join('>').slice(0, 120));
    const c1 = await page3.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const view = document.getElementById('btnPartyView');
      const roll = document.getElementById('btnReroll');
      const ph = view ? view.closest('.ph') : null;
      const rc = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; };
      const a = view ? rc(view) : null, b = roll ? rc(roll) : null;
      const overlap = (a && b) && !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
      return {
        w: window.innerWidth,
        viewVis: vis(view), rollVis: vis(roll),
        a, b, overlap: !!overlap,
        phScroll: ph ? ph.scrollWidth : -1, phClient: ph ? ph.clientWidth : -1,
        bodyScroll: document.documentElement.scrollWidth, bodyClient: document.documentElement.clientWidth,
        inView: !!(a && a.l >= 0 && a.r <= window.innerWidth),
      };
    }, VIS_FN);
    console.log('       幅=' + c1.w + ' 編成を見る=' + JSON.stringify(c1.a) + ' 募集=' + JSON.stringify(c1.b));
    check('(5a) iPhone 幅でも 🎴 編成を見る と 📣 募集をかけ直す が両方見えている',
      c1.viewVis === true && c1.rollVis === true, 'view=' + c1.viewVis + ' reroll=' + c1.rollVis);
    check('(5b) 2 つのボタンが重なっていない (折り返しても潰れない)', c1.overlap === false,
      'overlap=' + c1.overlap);
    check('(5c) 🎴 編成を見る が画面幅の内側に収まっている', c1.inView === true,
      'left=' + (c1.a ? c1.a.l : '?') + ' right=' + (c1.a ? c1.a.r : '?') + ' / 幅 ' + c1.w);
    check('(5d) ヘッダ行が横スクロールを起こさない', c1.phScroll > 0 && c1.phScroll <= c1.phClient,
      c1.phScroll + ' <= ' + c1.phClient);
    await pressPartyView(page3);
    await sleep(300);
    const c2 = await page3.evaluate(PROBE, VIS_FN);
    check('(5e) iPhone 幅でも押せば開き、全員が確定表示になる',
      c2.overlayVis === true && c2.nCols > 0 && c2.nFilled === c2.nCols,
      'display=' + c2.display + ' ' + c2.nFilled + '/' + c2.nCols);
    await sleep(500); await tapOverlay(page3); await sleep(900);
    const c3 = await page3.evaluate(PROBE, VIS_FN);
    check('(5f) iPhone 幅でもタップで閉じて準備画面へ戻る',
      c3.display === 'none' && c3.prepVis === true, 'display=' + c3.display + ' prep=' + c3.prepVis);
    await page3.close();

    check('(Z) JS エラーが出ていない', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } catch (e) {
    check('(FATAL) ドライバが例外で停止', false, (e && e.message) || String(e));
  } finally {
    await browser.close();
    srv.close();
  }

  const pass = results.filter((r) => r.ok).length;
  const pend = results.filter((r) => r.pending).length;
  const fail = results.filter((r) => !r.ok && !r.pending).length;
  console.log('\n========== 結果: ' + pass + '/' + results.length + ' PASSED / '
    + fail + ' FAILED / ' + pend + ' PENDING ==========');
  if (fail || pend) {
    results.filter((r) => !r.ok).forEach((r) =>
      console.log('  ' + (r.pending ? '[PENDING] ' : '[FAILED]  ') + r.name + (r.detail ? '  -- ' + r.detail : '')));
  }
  process.exit(pass === results.length ? 0 : 1);
})();
