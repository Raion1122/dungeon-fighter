#!/usr/bin/env node
/*
 * driver_choice_logslot.js — 選択ダイアログを「戦闘ログ枠と同じ帯」へ移設した件の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 直した欠陥 (2026-08-08 ユーザー報告 + スクショ実測):
 *   選択肢が出るたびに #choiceDialog が画面中央 (left/top:50%) に開き、主人公と仲間が
 *   ダイアログの裏へ完全に隠れて「誰がどこに居るか」を見ながら選べなかった。
 *   さらに max-width:500px + .choiceButtons が nowrap のため、4 択だと各ボタンが
 *   ~105px の縦棒に潰れて文字が 1 列に並んでいた。
 *
 * 直した後の不変条件 (= ここで測るもの):
 *   (1x) desktop … 帯の矩形が #combatLog と一致し、世界 (キャラが描かれる領域) に 1px も入らない
 *   (2x) compact … 帯は上限まで伸びても HP ミニバーの上端で止まり、やはり世界に入らない
 *   (3x) ログの伏せ … 開いている間だけ body.choice-open が付き #combatLog が visibility:hidden、
 *                     閉じたら必ず戻る (外し忘れると「ログが永久に読めない」= 画面上は正常に見える)
 *   (4x) 縦棒潰れの解消 … 4 択でも各ボタンが 1 行の高さに収まり、幅が確保される
 *   (5x) 実キャラとの非交差 … #player / .ally / .enemy の可視 DOM と帯の矩形が交差しない
 *
 * ⚠ 判定は全て getBoundingClientRect の実測であって「見た目」ではない。
 *   ⭐ 実際の色/質感/アニメはライブのスクショで別途見ること
 *      (メモリ「ゲーム変更のヘッドレス検証手順」)。
 *
 * 負のコントロール (--mutate、既定 nope = 無改変で本番を測る):
 *   center  … 帯を画面中央付近へ戻す      → 「世界を覆わない」を実際に測れている証明
 *   nohide  … 下部 HUD を伏せる CSS を無効化 → 伏せ判定が本当に効いている証明
 *   squeeze … 折り返し停止 + 器を 380px へ  → 縦棒潰れを実際に測れている証明
 *
 * 使い方:
 *   node tools/driver_choice_logslot.js
 *   node tools/driver_choice_logslot.js --mutate center --port 8940
 *   node tools/driver_choice_logslot.js --headful
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8940'), 10);   // ⚠ 変異側は PORT+1。並列時はポート間隔 4 以上

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える。ディスクは 1 バイトも書き換えない)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
/* ⚠⚠ アンカーは「1 ファイル 1 箇所」でなければ空振りする。`bottom: 0;` も `flex-wrap: wrap;` も
 *   index.html に何十箇所とあるので、実装側の行に**行末コメント**を付けて一意化してある。
 * ⚠⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。 */
const MUTATIONS = {
  nope: ['      bottom: 0;                   /* ★ログ枠と同じ下端 (choice-logslot) */',
         '      bottom: 0;   /* ★変異nope = 無改変 */'],
  center: ['      bottom: 0;                   /* ★ログ枠と同じ下端 (choice-logslot) */',
           '      bottom: 38%;   /* ★変異center = 旧仕様の画面中央へ戻す */'],
  nohide: ['    body.choice-open #combatLog, body.choice-open #hpMiniBar { visibility: hidden; }   /* ★選択中は下部HUDを伏せる (choice-logslot) */',
           '    body.choice-open #combatLog, body.choice-open #hpMiniBar { visibility: visible; }   /* ★変異nohide */'],
  /* ⚠ 縦棒潰れの真因は「nowrap **かつ** 器が狭い」の合わせ技だった。帯化で幅の制約が消えたため
   *   nowrap だけ戻しても desktop 1000px では 1 度も再現しない (実測で確認済)。
   *   ゆえに変異は 1 行の中で **両方**を戻す (旧 max-width:500px 相当まで絞る)。 */
  squeeze: ['      flex-wrap: wrap;       /* 4 択以上でも折り返して受ける (旧 nowrap = 縦棒潰れの原因) */',
            '      flex-wrap: nowrap; max-width: 380px;   /* ★変異squeeze = 旧仕様の縦棒潰れを再現 */'],
};
const MUTATE = arg('mutate', 'nope');
if (!Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
  process.exit(3);
}
let _mutCache = null;
function mutatedSources() {
  if (_mutCache) return _mutCache;
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const [from, to] = MUTATIONS[MUTATE];
  if (from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
  const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
  if (hits.length !== 1 || n !== 1) {
    console.error('[drv] ⛔ 変異の置換対象が ' +
      (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
      ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
    process.exit(3);
  }
  out[hits[0]] = out[hits[0]].split(from).join(to);
  _mutCache = out;
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
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutate) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutate && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]); return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
function mark(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 70 - t.length))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const DESKTOP = { width: 1280, height: 800 };
const IPHONE  = { width: 390,  height: 844 };

// 4 択 = スクショで潰れていたのと同じ長さの候補。ここを短くすると欠陥が再現しない。
const MSG4 = '坑道の入口に見張りが二匹。片方は舟を漕ぎ、もう片方の腰に骨笛が下がっている。';
const OPTS4 = ['静かに近づく', '骨笛を狙って射る', 'わざと姿を見せて誘い出す'];

async function bootPage(browser, url, vp, errs) {
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport(vp);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  // インラインスクリプトが showCharChoice を定義するまで待つ
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => typeof window.showCharChoice === 'function')) break;
    await sleep(150);
  }
  await page.evaluate(() => { window.__autoplay = 0; });   // autoplay 分岐を避け手動プレイ経路へ
  await sleep(400);   // キャラ DOM が body へ append されるまで
  return page;
}

/* 帯を開いて、判定に要る寸法を**ページ側で同期に**まとめて採る。
 * ⚠ 「世界の下端」は JS の cameraBottomHud() (= UI_LOG_HEIGHT + UI_MINIBAR_H) が単一ソース。
 *   ここで innerHeight から CSS 変数を読み直して式を写すと二重定義になり、片方だけ直したときに
 *   黙ってズレる (index.html の各所に同型の罠が明記されている)。 */
async function openAndMeasure(page, msg, opts) {
  return page.evaluate(async (m, o) => {
    window.__autoplay = 0;
    // 未解決のまま置いて測る (autoSkipMs 無し = 従来どおり無期限待ち)
    window.__clsPromise = window.showCharChoice(m, o.map(l => ({ label: l })), '引き返す (Esc)');
    await new Promise(r => setTimeout(r, 300));   // transition 0.2s の完了を待つ
    const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
                        return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const dlg = document.getElementById('choiceDialog');
    const log = document.getElementById('combatLog');
    const mini = document.getElementById('hpMiniBar');
    const miniOn = !!(mini && getComputedStyle(mini).display !== 'none');
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    const chars = Array.from(document.querySelectorAll('#player, .ally, .enemy'))
      .filter(el => { const s = getComputedStyle(el);
                      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
                      const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
      .map(el => Object.assign({ who: el.id || el.className }, R(el)));
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      hud: (typeof cameraBottomHud === 'function') ? cameraBottomHud() : null,
      compact: document.body.classList.contains('ui-compact'),
      shown: !!(dlg && dlg.classList.contains('show')),
      bodyOpen: document.body.classList.contains('choice-open'),
      logVis: log ? getComputedStyle(log).visibility : null,
      miniOn, miniVis: miniOn ? getComputedStyle(mini).visibility : null,
      dlg: R(dlg), log: R(log), mini: miniOn ? R(mini) : null,
      dlgScroll: dlg ? { sh: dlg.scrollHeight, ch: dlg.clientHeight, oy: getComputedStyle(dlg).overflowY } : null,
      btnN: btns.length,
      btnH: btns.map(b => Math.round(b.getBoundingClientRect().height)),
      btnW: btns.map(b => Math.round(b.getBoundingClientRect().width)),
      btnRows: Array.from(new Set(btns.map(b => Math.round(b.getBoundingClientRect().top)))).length,
      chars,
    };
  }, msg, opts);
}

async function closeDialog(page) {
  return page.evaluate(async () => {
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    const last = btns[btns.length - 1];
    if (last) last.click();
    const res = await (window.__clsPromise || Promise.resolve('nopromise'));
    await new Promise(r => setTimeout(r, 300));
    const log = document.getElementById('combatLog');
    const mini = document.getElementById('hpMiniBar');
    const dlg = document.getElementById('choiceDialog');
    const miniOn = !!(mini && getComputedStyle(mini).display !== 'none');
    return { res, bodyOpen: document.body.classList.contains('choice-open'),
             logVis: log ? getComputedStyle(log).visibility : null,
             miniVis: miniOn ? getComputedStyle(mini).visibility : null,
             shown: !!(dlg && dlg.classList.contains('show')),
             paused: (typeof dialogPaused !== 'undefined' ? dialogPaused : null) };
  });
}

// 2 矩形が交差するか (辺の接触は交差としない)
const overlaps = (a, b) => !!(a && b) && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const errs = [];
  const srvA = await startServer(PORT, false);          // 作業ツリーそのまま
  const srvB = await startServer(PORT + 1, true);       // 変異を配信
  console.log('[drv] 本番       http://localhost:' + PORT);
  console.log('[drv] 変異(' + MUTATE + ')  http://localhost:' + (PORT + 1));

  const profile = require('./_pptr_profile')('df_choice_logslot_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--mute-audio', '--user-data-dir=' + profile],
  });

  // ════════════════════════════════════════════════════════════════════════════
  mark('(1) desktop 1280x800 — 帯がログ枠と同寸で、世界に 1px も入らない');
  // ════════════════════════════════════════════════════════════════════════════
  const pD = await bootPage(browser, 'http://localhost:' + PORT + '/index.html', DESKTOP, errs);
  const D = await openAndMeasure(pD, MSG4, OPTS4);

  check('(0) 前提: 帯が開き、世界の下端 cameraBottomHud() が読める',
    D.shown === true && typeof D.hud === 'number' && D.hud > 0,
    'shown=' + D.shown + ' hud=' + D.hud + ' compact=' + D.compact);

  const dEq = !!(D.dlg && D.log) &&
    Math.abs(D.dlg.x - D.log.x) <= 1 && Math.abs(D.dlg.r - D.log.r) <= 1 &&
    Math.abs(D.dlg.b - D.log.b) <= 1;
  check('(1a) 帯の左右と下端が #combatLog と一致 (横位置の単一ソースが共有されている)', dEq,
    'dlg=' + JSON.stringify(D.dlg) + ' log=' + JSON.stringify(D.log));

  const worldBottomD = D.vh - D.hud;
  /* ★これが本命の不変条件: 帯の高さ = cameraBottomHud() ちょうど。
   * ⚠ #combatLog は content-box なので実寸 193px = 170 + padding20 + border3 で、ログ枠自体が
   *   世界へ 23px 食い込んでいる (元からの状態で今回は触らない)。帯はそれに**合わせず**
   *   世界の下端で止めるので、ここは >= ではなく **一致** で締められる。 */
  check('(1b) ★帯の上端が世界の下端と一致 (キャラが描かれる領域を 1px も覆わない)',
    !!D.dlg && Math.abs(D.dlg.y - worldBottomD) <= 1,
    'dlgTop=' + Math.round((D.dlg || {}).y) + ' worldBottom=' + Math.round(worldBottomD) +
    ' (vh=' + D.vh + ' hud=' + D.hud + ') logTop=' + Math.round((D.log || {}).y));

  check('(1c) 帯は左メニューを覆わない (left が --ui-menu-w ぶん右へ寄っている)',
    !!D.dlg && D.dlg.x >= 1, 'left=' + Math.round((D.dlg || {}).x));

  check('(1d) 通常の 4 択なら帯の中でスクロールが起きない (収まっている)',
    !!D.dlgScroll && D.dlgScroll.sh <= D.dlgScroll.ch + 1,
    'scrollHeight=' + (D.dlgScroll || {}).sh + ' clientHeight=' + (D.dlgScroll || {}).ch);
  check('(1e) 溢れたときの逃げ道は残っている (overflow-y:auto)',
    !!D.dlgScroll && D.dlgScroll.oy === 'auto', 'overflowY=' + (D.dlgScroll || {}).oy);

  // ════════════════════════════════════════════════════════════════════════════
  mark('(3) ログの伏せ / 復帰 (desktop)');
  // ════════════════════════════════════════════════════════════════════════════
  check('(3a) 開いている間は body.choice-open が付く', D.bodyOpen === true, 'bodyOpen=' + D.bodyOpen);
  check('(3b) 開いている間は #combatLog が visibility:hidden', D.logVis === 'hidden', 'logVis=' + D.logVis);

  const Dc = await closeDialog(pD);
  check('(3c) 閉じたら body.choice-open が外れ、ログが visible へ戻る',
    Dc.bodyOpen === false && Dc.logVis === 'visible',
    'bodyOpen=' + Dc.bodyOpen + ' logVis=' + Dc.logVis);
  check('(3d) 閉じたらダイアログ非表示・dialogPaused=false (従来の後始末は不変)',
    Dc.shown === false && Dc.paused === false, 'shown=' + Dc.shown + ' paused=' + Dc.paused);
  check('(3e) キャンセルボタンは従来どおり null を返す (返り値の契約は不変)',
    Dc.res === null, 'res=' + JSON.stringify(Dc.res));

  // ════════════════════════════════════════════════════════════════════════════
  mark('(4)(5) 4 択の潰れ / 実キャラとの非交差 (desktop)');
  // ════════════════════════════════════════════════════════════════════════════
  const D2 = await openAndMeasure(pD, MSG4, OPTS4);
  check('(4a) ボタンは 候補 3 + キャンセル = 4 個', D2.btnN === 4, 'n=' + D2.btnN);
  check('(4b) ★どのボタンも 1 行の高さ (<= 60px。旧仕様の実測は 213px)',
    D2.btnH.length === 4 && D2.btnH.every(h => h <= 60), 'heights=' + D2.btnH.join('/'));
  check('(4c) 各ボタンの幅が確保されている (>= 120px。旧仕様の実測は ~105px の縦棒)',
    D2.btnW.length === 4 && D2.btnW.every(w => w >= 120), 'widths=' + D2.btnW.join('/'));
  check('(4d) 広い画面なら 4 個が 1 行に並ぶ', D2.btnRows === 1, 'rows=' + D2.btnRows);

  const hitD = (D2.chars || []).filter(c => overlaps(c, D2.dlg));
  check('(5a) ★#player / .ally / .enemy の可視 DOM と帯が 1 つも交差しない',
    (D2.chars || []).length > 0 && hitD.length === 0,
    'chars=' + (D2.chars || []).length + ' overlap=' + hitD.length +
    (hitD.length ? ' 例: ' + JSON.stringify(hitD[0]) : ''));
  await closeDialog(pD);
  await pD.close();

  // ════════════════════════════════════════════════════════════════════════════
  mark('(2) compact 390x844 (iPhone 縦) — 上限は HP ミニバーの上端まで');
  // ════════════════════════════════════════════════════════════════════════════
  const pM = await bootPage(browser, 'http://localhost:' + PORT + '/index.html', IPHONE, errs);
  const M = await openAndMeasure(pM, MSG4, OPTS4);

  check('(2a) 前提: compact 判定に入っている (body.ui-compact)', M.compact === true, 'compact=' + M.compact);
  check('(2b) 帯は画面幅いっぱい (左メニューが 0 幅なので left=0)',
    !!M.dlg && M.dlg.x <= 0.5 && Math.abs(M.dlg.r - M.vw) <= 0.5,
    'left=' + Math.round((M.dlg || {}).x) + ' right=' + Math.round((M.dlg || {}).r) + ' vw=' + M.vw);
  check('(2c) 帯の下端が画面の下端', !!M.dlg && Math.abs(M.dlg.b - M.vh) <= 0.5,
    'bottom=' + Math.round((M.dlg || {}).b) + ' vh=' + M.vh);

  const worldBottomM = M.vh - M.hud;
  check('(2d) ★帯の上端が世界の下端と一致 (height の 64px の写しがズレたらここが赤くなる)',
    !!M.dlg && Math.abs(M.dlg.y - worldBottomM) <= 1,
    'dlgTop=' + Math.round((M.dlg || {}).y) + ' worldBottom=' + Math.round(worldBottomM) +
    ' (vh=' + M.vh + ' hud=' + M.hud + ')');
  check('(2e) 前提: HP ミニバーが出ている狭幅である', M.miniOn === true && !!M.mini, 'miniOn=' + M.miniOn);
  /* ⚠ #hpMiniBar も content-box (height:64 + padding8 + border2 = 実寸 74px) なので、その箱自体は
   *   世界の下端より 10px 上まで伸びている。帯はそこへは合わせず世界の下端で止めるため、
   *   「チップが半分だけ覗く」問題は幾何ではなく **(2j) の visibility:hidden** で潰している。
   *   ここで測るのは「+64px が実際にミニバーの帯へ届いているか」= 高さの写しが生きている証拠。 */
  check('(2f) ★帯が HP ミニバーの帯まで届いている (+64px が効いている)',
    !!(M.dlg && M.mini) && M.dlg.y <= M.mini.b - 1 && M.dlg.y >= M.mini.y - 1,
    'dlgTop=' + Math.round((M.dlg || {}).y) + ' mini=' + Math.round((M.mini || {}).y) + '..' + Math.round((M.mini || {}).b));
  check('(2g) 帯はログ枠より高い (下部 HUD ぜんぶを引き受けている)',
    !!(M.dlg && M.log) && M.dlg.h > M.log.h,
    'dlgH=' + Math.round((M.dlg || {}).h) + ' logH=' + Math.round((M.log || {}).h));
  check('(2h) スマホでも各ボタンが 1 行の高さ (<= 60px)',
    M.btnH.length === 4 && M.btnH.every(h => h <= 60), 'heights=' + M.btnH.join('/'));
  check('(2i) スマホでは帯の中でスクロールが起きない (4 択が収まる)',
    !!M.dlgScroll && M.dlgScroll.sh <= M.dlgScroll.ch + 1,
    'scrollHeight=' + (M.dlgScroll || {}).sh + ' clientHeight=' + (M.dlgScroll || {}).ch);
  check('(2j) スマホではログと HP ミニバーの両方が伏せられる',
    M.bodyOpen === true && M.logVis === 'hidden' && M.miniVis === 'hidden',
    'bodyOpen=' + M.bodyOpen + ' logVis=' + M.logVis + ' miniVis=' + M.miniVis);

  const hitM = (M.chars || []).filter(c => overlaps(c, M.dlg));
  check('(5b) ★スマホでもキャラ DOM と帯が交差しない',
    (M.chars || []).length > 0 && hitM.length === 0,
    'chars=' + (M.chars || []).length + ' overlap=' + hitM.length +
    (hitM.length ? ' 例: ' + JSON.stringify(hitM[0]) : ''));

  const Mc = await closeDialog(pM);
  check('(2k) 閉じたらログも HP ミニバーも visible へ戻る (伏せっぱなしにしない)',
    Mc.bodyOpen === false && Mc.logVis === 'visible' && Mc.miniVis === 'visible',
    'bodyOpen=' + Mc.bodyOpen + ' logVis=' + Mc.logVis + ' miniVis=' + Mc.miniVis);
  await pM.close();

  // ════════════════════════════════════════════════════════════════════════════
  mark('負のコントロール (--mutate ' + MUTATE + ')');
  // ════════════════════════════════════════════════════════════════════════════
  const pX = await bootPage(browser, 'http://localhost:' + (PORT + 1) + '/index.html', DESKTOP, errs);
  const X = await openAndMeasure(pX, MSG4, OPTS4);
  const worldBottomX = X.vh - X.hud;
  const xHit = (X.chars || []).filter(c => overlaps(c, X.dlg));

  if (MUTATE === 'nope') {
    check('(N-nope) 無改変の配信でも本番と同じ結論 (= 変異機構そのものの空振り検出)',
      !!X.dlg && Math.abs(X.dlg.y - worldBottomX) <= 1 && xHit.length === 0,
      'dlgTop=' + Math.round((X.dlg || {}).y) + ' worldBottom=' + Math.round(worldBottomX) + ' overlap=' + xHit.length);
  } else if (MUTATE === 'center') {
    check('(N-center) 変異側では帯が世界へせり上がる (= (1b)(2d) が本物の測定である証明)',
      !!X.dlg && X.dlg.y < worldBottomX - 20,
      'dlgTop=' + Math.round((X.dlg || {}).y) + ' worldBottom=' + Math.round(worldBottomX));
    check('(N-center) 変異側ではキャラ DOM と帯が交差する (= (5a)(5b) が本物の測定である証明)',
      xHit.length > 0, 'chars=' + (X.chars || []).length + ' overlap=' + xHit.length);
  } else if (MUTATE === 'nohide') {
    check('(N-nohide) 変異側ではログが伏せられない (= (3b)(2j) が本物の測定である証明)',
      X.bodyOpen === true && X.logVis === 'visible',
      'bodyOpen=' + X.bodyOpen + ' logVis=' + X.logVis);
  } else if (MUTATE === 'squeeze') {
    check('(N-squeeze) 変異側ではボタンが縦棒に潰れる (= (4b)(4c) が本物の測定である証明)',
      X.btnH.some(h => h > 60) || X.btnW.some(w => w < 120),
      'heights=' + X.btnH.join('/') + ' widths=' + X.btnW.join('/'));
  }
  await closeDialog(pX);
  await pX.close();

  await browser.close();
  srvA.close(); srvB.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const pass = results.filter(r => r.ok).length;
  console.log('\n[drv] ' + pass + '/' + results.length + ' PASS   (--mutate ' + MUTATE + ')');
  if (pass !== results.length) {
    console.log('[drv] FAILED:');
    results.filter(r => !r.ok).forEach(r => console.log('   - ' + r.name + '  ' + r.detail));
  }
  if (errs.length) console.log('[drv] pageerrors: ' + errs.slice(0, 5).join(' | '));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(3); });
