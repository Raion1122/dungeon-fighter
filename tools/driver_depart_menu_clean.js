#!/usr/bin/env node
/*
 * driver_depart_menu_clean.js — 「クエスト出発時に開発用メニューが出ない」実地検証ドライバ
 *
 *   node tools/driver_depart_menu_clean.js [--headful] [--browser <path>] [--port N]
 *
 * driver_dev_gate / driver_dev_gate2 との違い:
 *   既存 2 本は **ページを開いた直後** の getComputedStyle を測る (祖先が非表示でも要素自身の計算値は
 *   取れる、という性質を利用した省コスト測定)。本ドライバはそこを疑い、**実際に UI をクリックで辿って
 *   出発準備画面まで到達し**、そこで「目に見えているか」を checkVisibility() で測る。
 *   ユーザー報告は「クエスト出発時に出る」という *到達後* の話なので、到達後に測る一本が要る。
 *
 * ⚠️ 本ドライバの肝は 4 つ:
 *
 *   (1) **到達したことを assert する**。#prep が見えていない状態で「デバッグ行も見えていない」を測ると
 *       全アサートが自動的に通る空振りになる。(A1) で到達を、(A2) で既存 UI (出発するボタン) の可視を
 *       先に取り、物差しが生きていることを確かめてから dev 行の不在を測る。
 *
 *   (2) **正のコントロールを同一 run に内包する**。dev ON (?dev=1) で同じ経路を辿り、同じセレクタで
 *       「今度は見えている」を測る。これが無いとセレクタの打ち間違いで永遠に PASS する。
 *
 *   (3) **localStorage はオリジン単位で全ページ共有**。測定のたびに必ず全消し → 必要なら種を蒔く。
 *       evaluateOnNewDocument はリロードのたびに走るのでこの用途では使わない。
 *
 *   (4) **🔮 召喚同行 (#summonSection) は正規のゲーム機能**。闇市の召喚スクロール所持時のみ出る仕様で、
 *       既定で display:none なのは dev ゲートではない。消していないことを (D) で毎回確かめる。
 *
 * 出発準備画面までの導線は 前口上 → 依頼人ダイアログ → 受注ナレ → パーティ編成シネマ → 準備画面 と
 * 多段で、途中に共有オーバーレイ (#prologueOverlay) とシネマ (#partyMatchOverlay) が挟まる。
 * 個別に手順を書くと演出変更のたびに壊れるので、「見えているオーバーレイがあれば押す」汎用ループで進む。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT    = parseInt(arg('port', '8893'), 10);

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
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(PORT, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];

async function openClean(browser, urlPath, opts) {
  const o = opts || {};
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  // 同一オリジンの軽量ファイルで localStorage ハンドルを得る (index/tavern を開くと副作用が乗る)
  await page.goto('http://localhost:' + PORT + '/js/skill-check.js', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((o2) => {
    try {
      localStorage.clear(); sessionStorage.clear();
      // ⚠ 前口上 (初回来訪の長い語り) だけは飛ばす。音声ペースのナレーションは **クリックでスキップできない**
      //    (playNarration の durMs>0 分岐は while で尺を待ち切る) ため、素だと数分待たされて測定にならない。
      //    このキーは「前口上を見たか」だけを持ち、df.devMode とは無関係。(A6) で dev が焼かれていない
      //    ことを別途 assert しているので、dev ゲートの測定は汚れない。
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (o2.seedDev) localStorage.setItem('df.devMode', '1');
      // index.html の測定用。開始画面を実際に見られるシナリオを指定する ((E) の解説を参照)
      if (o2.scen) sessionStorage.setItem('dragonfighters.currentScenario', o2.scen);
    } catch (e) {}
  }, { seedDev: !!o.seedDev, scen: o.scen || null });
  await page.goto('http://localhost:' + PORT + urlPath, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(o.wait || 900);
  return page;
}

/* 可視判定の本体。checkVisibility は祖先の display:none / visibility / opacity をまとめて見てくれるので、
   「要素自身は flex だが親が none」という取りこぼしが起きない (既存 2 本との差分はここ)。 */
const VIS_FN = `(function(el){
  if (!el) return false;
  if (typeof el.checkVisibility === 'function')
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  return el.getClientRects().length > 0;
})`;

/* 出発準備画面まで進む汎用ループ。見えているオーバーレイ/ボタンを上から順に押していく。
   ⚠ 受注ナレは **音声ペースだとクリックで飛ばせない** (playNarration が while で尺を待ち切る)。
      実測で テーブル→受注→ナレ(約20秒)→編成シネマ→準備画面 に **約26秒** かかるので、
      待ち budget は余裕を持って 130 step × 500ms = 65 秒とる。ここをケチると (A1) が落ちて、
      「何も見えていないから dev 行も見えない」という空振り PASS に化ける。 */
async function advanceToPrep(page, maxSteps) {
  const steps = [];
  for (let i = 0; i < (maxSteps || 130); i++) {
    const st = await page.evaluate((visSrc) => {
      const vis = eval(visSrc);
      const q = (id) => document.getElementById(id);
      if (vis(q('prep'))) return { done: true, at: 'prep' };
      // 1) パーティ編成シネマ (タップ待ち)
      if (vis(q('partyMatchOverlay'))) { q('partyMatchOverlay').click(); return { done: false, at: 'partyMatchOverlay' }; }
      // 2) 共有オーバーレイ (前口上 / 受注ナレ / 準備画面オンボーディング)
      if (vis(q('prologueOverlay'))) { q('prologueOverlay').click(); return { done: false, at: 'prologueOverlay' }; }
      // 3) 依頼人ダイアログの「引き受ける」
      const acc = q('btnAccept');
      if (vis(acc) && !acc.disabled) { acc.click(); return { done: false, at: 'btnAccept' }; }
      // 4) 酒場のテーブル (依頼人) — 最初の1件を押す
      const t = document.querySelector('#tableArea .table');
      if (t && vis(t)) { t.click(); return { done: false, at: 'table' }; }
      return { done: false, at: '(待機)' };
    }, VIS_FN);
    if (steps[steps.length - 1] !== st.at) steps.push(st.at);   // 連続する同じ段階は畳む (ログ可読性)
    if (st.done) return { reached: true, steps };
    await sleep(420);
  }
  return { reached: false, steps };
}

/* 準備画面に見えている操作系を全部拾う (「他にも dev メニューが残っていないか」の棚卸し用)。 */
const PROBE_PREP = (visSrc) => {
  const vis = eval(visSrc);
  const q = (id) => document.getElementById(id);
  const prep = q('prep');
  const buttons = [];
  if (prep) {
    prep.querySelectorAll('button').forEach(b => {
      if (vis(b)) buttons.push((b.id || '(no-id)') + ' : ' + (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30));
    });
  }
  const panels = [];
  if (prep) {
    prep.querySelectorAll('.prepPanel, .equipGroup').forEach(p => {
      if (!vis(p)) return;
      const h = p.querySelector('.ph, .equipLabel');
      panels.push((p.id || '(no-id)') + ' : ' + ((h && h.textContent) || '').trim().replace(/\s+/g, ' ').slice(0, 30));
    });
  }
  return {
    prepVisible:    vis(prep),
    evadeRowVis:    vis(q('debugEvadeRow')),
    autoRowVis:     vis(q('debugAutoplayRow')),
    evadeRowExists: !!q('debugEvadeRow'),
    autoRowExists:  !!q('debugAutoplayRow'),
    summonExists:   !!q('summonSection'),
    summonVis:      vis(q('summonSection')),
    departVis:      vis(q('btnDepart')),
    devClass:       document.body.classList.contains('dev-mode'),
    lsDev:          (function () { try { return localStorage.getItem('df.devMode'); } catch (e) { return '(err)'; } })(),
    buttons, panels,
  };
};

const PROBE_START = (visSrc) => {
  const vis = eval(visSrc);
  const q = (id) => document.getElementById(id);
  const ss = q('startScreen');
  const buttons = [];
  if (ss) ss.querySelectorAll('button').forEach(b => {
    if (vis(b)) buttons.push((b.id || '(no-id)') + ' : ' + (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30));
  });
  return {
    startVisible:   vis(ss),
    startDisplay:   ss ? getComputedStyle(ss).display : null,
    evadeRowVis:    vis(q('debugEvadeRow')),
    evadeRowExists: !!q('debugEvadeRow'),
    btnCount:       document.querySelectorAll('#debugEvadeRow button').length,
    devClass:       document.body.classList.contains('dev-mode'),
    lsDev:          (function () { try { return localStorage.getItem('df.devMode'); } catch (e) { return '(err)'; } })(),
    buttons,
  };
};

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  :' + PORT);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    // ── (A) 既定状態 (localStorage まっさら) で 出発準備画面まで進む ──
    console.log('\n── (A) 既定状態: 酒場 → 出発準備画面 (実クリック導線) ──');
    let page = await openClean(browser, '/tavern.html', {});
    let adv = await advanceToPrep(page);
    check('(A1) 出発準備画面まで到達した (これが無いと以下は空振り)', adv.reached,
      'steps=' + adv.steps.join('>').slice(0, 110));
    let p = await page.evaluate(PROBE_PREP, VIS_FN);
    check('(A2) 物差し確認: 「出発する」ボタンが見えている', p.departVis === true);
    check('(A3) 🛡🏹 デバッグ回避行が見えていない', p.evadeRowVis === false, 'visible=' + p.evadeRowVis);
    check('(A4) ⚡ オートプレイ行が見えていない', p.autoRowVis === false, 'visible=' + p.autoRowVis);
    check('(A5) body に dev-mode クラスが付いていない', p.devClass === false);
    check('(A6) df.devMode が localStorage に焼かれていない', p.lsDev === null, 'lsDev=' + p.lsDev);
    check('(A7) 行は DOM に残っている (消したのではなく隠した)', p.evadeRowExists && p.autoRowExists);
    console.log('       [棚卸し] 見えているパネル: ' + JSON.stringify(p.panels, null, 0));
    console.log('       [棚卸し] 見えているボタン: ' + JSON.stringify(p.buttons, null, 0));
    const devish = p.buttons.filter(s => /debug|autoplay|evade|dev|unlock|givemagic|🐞|⚡/i.test(s));
    check('(A8) 準備画面に dev 由来のボタンが1つも見えていない', devish.length === 0,
      devish.length ? JSON.stringify(devish) : '(0件)');
    await page.close();

    // ── (B) 正のコントロール: dev ON なら同じセレクタで見える ──
    console.log('\n── (B) 正のコントロール: dev ON (?dev=1) で同じ導線 ──');
    page = await openClean(browser, '/tavern.html?dev=1', {});
    adv = await advanceToPrep(page);
    check('(B1) dev ON でも出発準備画面まで到達する', adv.reached, 'steps=' + adv.steps.join('>').slice(0, 110));
    let pb = await page.evaluate(PROBE_PREP, VIS_FN);
    check('(B2) dev ON では 🛡🏹 デバッグ回避行が見えている (物差しが生きている証明)', pb.evadeRowVis === true);
    check('(B3) dev ON では ⚡ オートプレイ行が見えている', pb.autoRowVis === true);
    check('(B4) dev ON で body.dev-mode が付く', pb.devClass === true);
    const devish2 = pb.buttons.filter(s => /debug|autoplay|evade|Dev|🐞|⚡/i.test(s));
    check('(B5) dev ON のときだけ dev ボタンが現れる (差分が実在する)', devish2.length >= 4,
      devish2.length + '件');
    await page.close();

    // ── (C) 端末に df.devMode が焼き残っている想定 → ?dev=0 で解除できる ──
    console.log('\n── (C) 焼き残り解除: 種を蒔いてから ?dev=0 ──');
    page = await openClean(browser, '/tavern.html', { seedDev: true });
    let pc0 = await page.evaluate(PROBE_PREP, VIS_FN);
    check('(C1) 種が効いている (測定の前提): dev-mode が付いている', pc0.devClass === true, 'lsDev=' + pc0.lsDev);
    await page.goto('http://localhost:' + PORT + '/tavern.html?dev=0', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(900);
    let pc1 = await page.evaluate(PROBE_PREP, VIS_FN);
    check('(C2) ?dev=0 で localStorage の df.devMode が消える', pc1.lsDev === null, 'lsDev=' + pc1.lsDev);
    check('(C3) ?dev=0 で body.dev-mode が外れる', pc1.devClass === false);
    adv = await advanceToPrep(page);
    check('(C4) 解除後に準備画面まで進める', adv.reached, 'steps=' + adv.steps.join('>').slice(0, 110));
    let pc2 = await page.evaluate(PROBE_PREP, VIS_FN);
    check('(C5) 解除後の準備画面で 🛡🏹 行が見えない', pc2.evadeRowVis === false);
    check('(C6) 解除後の準備画面で ⚡ 行が見えない', pc2.autoRowVis === false);
    // 焼き込みが URL 無しでも継続しないこと (次回起動も OFF)
    await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(700);
    let pc3 = await page.evaluate(PROBE_PREP, VIS_FN);
    check('(C7) 素の URL で再訪しても OFF のまま (毎回 ?dev=0 が要らない)', pc3.devClass === false && pc3.lsDev === null);
    await page.close();

    // ── (D) 🔮 召喚同行 は正規機能: 消していないこと ──
    console.log('\n── (D) 回帰: 🔮 召喚同行 (正規のゲーム機能) を消していない ──');
    page = await openClean(browser, '/tavern.html', {});
    adv = await advanceToPrep(page);
    let pd = await page.evaluate(PROBE_PREP, VIS_FN);
    check('(D1) #summonSection が DOM に存在する', pd.summonExists === true);
    check('(D2) 召喚スクロール未所持なので既定では非表示 (仕様どおり)', pd.summonVis === false);
    const summonInSrc = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
    check('(D3) 召喚同行が dev ゲート (body.dev-mode) 配下に入っていない',
      !/body\.dev-mode[^{]*#summonSection/.test(summonInSrc));
    check('(D4) 🔮 召喚同行のラベルがソースに残っている', /🔮 召喚同行/.test(summonInSrc));
    await page.close();

    // ── (E) ダンジョン側 開始画面 (index.html) ──
    /* ⚠ シナリオを選ばずに index.html を開いても開始画面は測れない。initScenarioNarration が
       開幕で startScreen.style.display="none" にし、語り終わりに startGame() が **もう一度** none に
       するため、SCENARIO_NARRATIONS を持つシナリオでは開始画面は一度も現れない。
       ナレーションを持たない caravan-road を指定した時だけ早期 return して開始画面が残る。
       ここを踏まないと startScreen ごと非表示のまま「dev 行も見えない」を測る空振りになる。 */
    console.log('\n── (E) ダンジョン開始画面 (index.html / caravan-road) ──');
    page = await openClean(browser, '/index.html', { scen: 'caravan-road', wait: 2600 });
    let pe = await page.evaluate(PROBE_START, VIS_FN);
    check('(E1) 開始画面が実際に見えている (到達の証明)', pe.startVisible === true, 'display=' + pe.startDisplay);
    check('(E2) 🛡🏹 デバッグ回避行が見えていない', pe.evadeRowVis === false, 'visible=' + pe.evadeRowVis);
    check('(E3) 行と 2 ボタンは DOM に残っている', pe.evadeRowExists && pe.btnCount === 2, 'btn=' + pe.btnCount);
    check('(E4) body に dev-mode クラスが付いていない', pe.devClass === false);
    check('(E5) df.devMode が焼かれていない', pe.lsDev === null, 'lsDev=' + pe.lsDev);
    console.log('       [棚卸し] 開始画面に見えているボタン: ' + JSON.stringify(pe.buttons));
    check('(E6) 開始画面に dev 由来のボタンが1つも見えていない',
      pe.buttons.filter(s => /debug|evade|回避|🛡|🏹/i.test(s)).length === 0, JSON.stringify(pe.buttons));
    await page.close();

    // 正のコントロール (index 側): 同じシナリオ・同じセレクタで dev ON なら見える
    page = await openClean(browser, '/index.html?dev=1', { scen: 'caravan-road', wait: 2600 });
    let pf = await page.evaluate(PROBE_START, VIS_FN);
    check('(E7) 正のコントロール: 開始画面自体は dev ON でも同じく見えている', pf.startVisible === true);
    check('(E8) 正のコントロール: dev ON では 🛡🏹 行が見えている (物差しが生きている証明)', pf.evadeRowVis === true);
    check('(E9) 正のコントロール: dev ON では 2 ボタンが列挙される',
      pf.buttons.filter(s => /🛡|🏹/.test(s)).length === 2, JSON.stringify(pf.buttons));
    await page.close();

    // 本編 6 シナリオ側の二重の安全: そもそも開始画面ごと出ない (dev 行の露出面が無い)
    page = await openClean(browser, '/index.html', { scen: 'goblin-mine', wait: 2600 });
    let pg = await page.evaluate(PROBE_START, VIS_FN);
    check('(E10) 本編シナリオでは開始画面自体が出ない (語り→startGame で二重に none)',
      pg.startVisible === false, 'display=' + pg.startDisplay);
    check('(E11) 当然 🛡🏹 行も見えない', pg.evadeRowVis === false);
    await page.close();

    // ── (F) 静的検査: インライン display が復活していないか ──
    console.log('\n── (F) 静的検査: インライン display の再混入 ──');
    const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const tavSrc = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
    const rowTag = (src, id) => (src.match(new RegExp('<div id="' + id + '"[^>]*>')) || [''])[0];
    const iRow = rowTag(idxSrc, 'debugEvadeRow');
    const tRow = rowTag(tavSrc, 'debugEvadeRow');
    const aRow = rowTag(tavSrc, 'debugAutoplayRow');
    check('(F1) index #debugEvadeRow のインライン style に display が無い', !!iRow && !/display\s*:/.test(iRow), iRow.slice(0, 70));
    check('(F2) tavern #debugEvadeRow のインライン style に display が無い', !!tRow && !/display\s*:/.test(tRow), tRow.slice(0, 70));
    check('(F3) tavern #debugAutoplayRow のインライン style に display が無い', !!aRow && !/display\s*:/.test(aRow), aRow.slice(0, 70));
    check('(F4) index に CSS ゲート (既定 none + dev-mode flex) が両方ある',
      /#debugEvadeRow\s*\{\s*display:\s*none/.test(idxSrc) && /body\.dev-mode\s+#debugEvadeRow\s*\{\s*display:\s*flex/.test(idxSrc));
    check('(F5) tavern に CSS ゲート (既定 none + dev-mode flex) が両方ある',
      /#debugAutoplayRow\s*\{\s*display:\s*none/.test(tavSrc) && /body\.dev-mode\s+#debugEvadeRow/.test(tavSrc));

    check('(Z) JS エラーが出ていない', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } catch (e) {
    check('(FATAL) ドライバが例外で停止', false, e && e.message);
  } finally {
    await browser.close();
    srv.close();
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n══════════ 結果: ' + pass + '/' + results.length + ' PASS ══════════');
  if (pass !== results.length) {
    console.log('NG 一覧:');
    results.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name + (r.detail ? '  — ' + r.detail : '')));
  }
  process.exit(pass === results.length ? 0 : 1);
})();
