#!/usr/bin/env node
/*
 * driver_graph_arrows.js — [P3 矢印 UI + ヒント文] 分岐マップの出口選択 UI 検証
 * ══════════════════════════════════════════════════════════════════════════════
 * 「ゲームブック風 分岐マップ」企画 P3 + P5 前段の完了条件を測る。主張は 7 つ:
 *
 *   ① 出口の矢印が **at タイルの真上**に出て、**カメラを動かしても追従する**
 *   ② 矢印も羊皮紙も **タップできる** (pointer-events: auto)
 *   ③ 羊皮紙は画面端でクランプされ、**必ず画面内に残る**
 *   ④ 知覚判定の 4 結果でヒントの解像度が変わり、**ファンブルでも boss 出口には嘘を出さない**
 *   ⑤ ★[P5 前段] 狭幅端末 (390x844 / 844x390) **でも矢印が出る**。寸法を詰め、可視域の縁で
 *      クランプして **1 本残らず画面内**に収める (旧: 狭幅は #choiceDialog へ落としていた)
 *   ⑥ `?autoplay` では矢印を **1 つも作らない** (既存ドライバ 49 本を止めない保証)
 *   ⑦ ★[P5 前段] 部屋を可視域サイズへ縮めたので、**広い画面では矢印が 1 本もクランプされず
 *      at タイルの真上に立ち、4 本すべてが画面内に入る** (= この改修の目的そのもの)
 *
 * ⭐ **負のコントロールを同一 run に内包**する。ポート P に素の index.html を、
 *    P+1 に「機構を 1 箇所だけ潰した変異版」を配り、同じ手順を両方に流す。
 *    素の側で「効いている」、変異側で「壊れる」が両方出て初めて、この検出器が本当に
 *    その機構を見ていることの証明になる。
 * ⭐ ⑤⑦ は **同一 run の中で 1280x800 → 390x844 → 1280x800 と往復**して測る。
 *    「広い画面では素のまま / 狭い画面ではクランプ + 縮小」の両方が 1 回の実行で出るので、
 *    片方だけ測って誤読することがない。
 *
 * 変異 (--mutate、既定 nope):
 *   nope          … .exitArrow の pointer-events を none へ → 矢印がタップできない
 *   noclamp       … 羊皮紙のクランプを殺す                 → 狭幅で画面外へ出て読めない
 *   noarrowclamp  … ★矢印の縁クランプを殺す               → 狭幅で矢印が画面外へ消える
 *   nofollow      … renderWorld の追従ブロックを殺す        → カメラを振ると矢印が置き去り
 *   compactdialog … ★狭幅を旧仕様 (ダイアログ) へ戻す      → 390x844 で矢印が 0 本になる
 *   noautoguard   … chooseExit の ?autoplay ガードを外す    → autoplay で矢印が生える
 *   nogatetap     … ARROW_TAP_GATE を 0 へ                  → 表示直後の連打が貫通する
 *   bosslie       … boss 出口の誤情報ガードを外す           → ファンブルでボスに嘘が出る
 *
 * ⚠ 変異は**ディスクを書き換えず配信をメモリ上で差し替える** (復元漏れが原理的に起きない)。
 * ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
 * ⚠⚠ **ドライバは rAF を凍結する**ので .exitArrow のパルス (CSS animation) は測れない。
 *   「矢印と羊皮紙が読めるか」「重なり順が崩れていないか」はライブのスクショで別途見ること。
 *
 * 使い方:
 *   node tools/driver_graph_arrows.js
 *   node tools/driver_graph_arrows.js --mutate bosslie --port 8900
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8900'), 10);   // ⚠ 変異側は PORT+1。並列時はポート間隔 4 以上

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
/* ⚠⚠ アンカーは「1 ファイル 1 箇所」でなければならない。pointer-events:auto は .exitArrow と
 *   .exitHint の**両方**にあるので、実装側の .exitArrow の行に行末コメントを付けて一意化してある
 *   (「変異の一致は部分一致 → 行末コメントを一致キーにする」という確立済みの作法)。 */
const MUTATIONS = {
  nope: ['      pointer-events: auto;   /* ★矢印は必ず auto (.sce1Captive を写して none にしない) */',
         '      pointer-events: none;   /* ★変異nope */'],
  noclamp: ['        hx = Math.max(padL, Math.min(hx, vw - hw - 8));',
            '        hx = hx + 0;   /* ★変異noclamp */'],
  /* ★[P5 前段] 矢印の縁クランプ。fit は computeCameraTarget にも同名の物があるが、
   *   あちらは空区間で中点へ落とす別式なので、この 1 行は index.html 内で一意 (grep -c で検算済)。 */
  noarrowclamp: ['      const fit = (v, lo, hi) => (lo <= hi) ? Math.max(lo, Math.min(v, hi)) : v;',
                 '      const fit = (v, lo, hi) => v;   /* ★変異noarrowclamp */'],
  nofollow: ['      if (exitArrowEls.length) updateExitArrowPositions();',
             '      if (false) updateExitArrowPositions();   /* ★変異nofollow */'],
  /* ★[P5 前段] 旧 nocompact (useCompactChoice を常に false へ) を置き換えた。旧仕様
   *   「狭幅ではダイアログへ落とす」を**そのまま復活させる**変異にしてある = 今回直した
   *   欠陥 (iPhone で矢印が一度も出ない) を再現するので、負のコントロールとして直球。 */
  compactdialog: ['      if (!window.__autoplay) return await showExitArrows(node, opts);',
                  '      if (!window.__autoplay && !useCompactArrows()) return await showExitArrows(node, opts);   /* ★変異compactdialog */'],
  noautoguard: ['      if (!window.__autoplay) return await showExitArrows(node, opts);',
                '      if (true) return await showExitArrows(node, opts);   /* ★変異noautoguard */'],
  nogatetap: ['    const ARROW_TAP_GATE = 500;',
              '    const ARROW_TAP_GATE = 0;   /* ★変異nogatetap */'],
  bosslie: ['      if (tier === "fumble" && kind !== "boss") {',
            '      if (tier === "fumble") {   /* ★変異bosslie */'],
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
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
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

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ★実効可視域 (HUD を差し引いた後・TILE_SIZE=96) の実測値。部屋サイズはこの表から決めてある:
 *   desktop 1280x800 … 1000 x 630 px = 10.42 x 6.56 タイル
 *   iPad    1024x768 …  744 x 598 px =  7.75 x 6.23 タイル  ← ★基準端末 (道中の部屋 7x6)
 *   iPhone横 844x390 …  844 x 217 px =  8.79 x **2.26**
 *   iPhone縦 390x844 …  390 x 660 px = **4.06** x 6.88      */
const DESKTOP     = { width: 1280, height: 800 };
const IPAD        = { width: 1024, height: 768 };
const IPHONE      = { width: 390,  height: 844 };
const IPHONE_LAND = { width: 844,  height: 390 };

async function bootPage(browser, url, warns, errs, viewport, pre) {
  const page = await browser.newPage();
  await page.setViewport(viewport || DESKTOP);
  // ★pre = 生成クエストのペイロード注入 (本番と同じ入口)。§11 が使う
  if (pre) await page.evaluateOnNewDocument(pre);
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'warn' || m.type() === 'warning') warns.push(t);
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
  });
  /* ⚠ evaluateOnNewDocument は**全ナビゲーションで再実行される**。ここには「毎回同じ形へ
   *   整える」ものだけを置く (removeItem 等の破壊系は置かない = 最頻ハマり)。 */
  await page.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine'); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && window.__graphRun && window.__graphRun.active()", { timeout: 25000 });
  return page;
}

/* 出口選択を**本番と同じ入口** (chooseExit) で開き、resolve を待たずに戻る。
 * ⚠ await すると「タップ待ち」で永久に返らない。promise は window に預けて後から覗く。 */
const OPEN_CHOICE = `(() => {
  window.__pickDone = false; window.__pick = undefined;
  window.__graphRun.choose().then(v => { window.__pick = v; window.__pickDone = true; });
  return true;
})()`;

const QT = '/index.html?diag=1&graphtest=1';

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srvPure = await startServer(PORT, false);
  const srvMut = await startServer(PORT + 1, true);
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素        http://localhost:' + PORT);
  console.log('[drv]   変異(' + MUTATE + ')  http://localhost:' + (PORT + 1));

  const profile = require('./_pptr_profile')('df_graph_arrows_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  const warns = [], errs = [];

  // ── §0 変異が本当に配信へ載っているか (空振り検出) ────────────────────────
  mark('変異の配信検算');
  {
    const get = (p) => new Promise((res, rej) => {
      http.get('http://localhost:' + p + '/index.html', r => {
        let b = ''; r.on('data', d => b += d); r.on('end', () => res(b));
      }).on('error', rej);
    });
    const a = await get(PORT), b = await get(PORT + 1);
    const [from, to] = MUTATIONS[MUTATE];
    check('(0a) 素の配信に変異前の文字列が 1 箇所ある', a.split(from).length - 1 === 1,
      '件数=' + (a.split(from).length - 1));
    check('(0b) 素の配信に変異後の文字列が 0 箇所', a.indexOf(to) < 0, '');
    check('(0c) 変異の配信に変異前の文字列が 0 箇所', b.indexOf(from) < 0, '');
    check('(0d) 変異の配信に変異後の文字列が 1 箇所', b.split(to).length - 1 === 1,
      '件数=' + (b.split(to).length - 1));
    check('(0e) 2 つの配信のバイト長が違う (同じ物を 2 回測っていない)', a.length !== b.length,
      '素=' + a.length + 'B / 変異=' + b.length + 'B');
  }

  const page = await bootPage(browser, 'http://localhost:' + PORT + QT, warns, errs, DESKTOP);

  // ══ §G 母集団ガード (真空 PASS 対策) ═══════════════════════════════════════
  mark('母集団ガード');
  const G = await page.evaluate(() => {
    const g = window.__graphRun;
    return { active: g.active(), node: g.nodeId(), compact: g.compact(),
             exits: g.exits().map(o => o.to + '/' + o.dir),
             boss: g.bossNodeId(), autoplay: !!window.__autoplay,
             arrows: document.querySelectorAll('.exitArrow').length };
  });
  check('(G1) 分岐が立ち上がっていて entry に出口が 3 本ある (測る母集団がある)',
    G.active === true && G.node === 'n0' && G.exits.length === 3, G.exits.join(' '));
  check('(G2) 1280x800 は compact ではない (= 矢印が出るべき条件)', G.compact === false,
    'compact=' + G.compact);
  check('(G3) 起動直後は矢印が 1 つも無い (選択を開くまで生えない)', G.arrows === 0,
    'arrows=' + G.arrows);
  check('(G4) ?autoplay ではない素のページである (§7 と取り違えていない)', G.autoplay === false, '');

  // ══ §1 矢印が出る / タップできる ═══════════════════════════════════════════
  mark('矢印の生成と属性 (1280x800)');
  await page.evaluate(() => window.__graphRun.reveal('success'));   // ヒントを確定させてから開く
  await page.evaluate(OPEN_CHOICE);
  await sleep(120);
  const A1 = await page.evaluate(() => ({
    arrows: window.__graphRun.arrows(),
    dom: document.querySelectorAll('#nodeLayer .exitArrow').length,
    domHint: document.querySelectorAll('#nodeLayer .exitHint').length,
    outside: document.querySelectorAll('.exitArrow').length -
             document.querySelectorAll('#nodeLayer .exitArrow').length,
    done: window.__pickDone,
    paused: dialogPaused,
    cam: window.__graphRun.cam(),
  }));
  check('(1a) 出口の本数だけ矢印が出る', A1.arrows.length === 3, '本数=' + A1.arrows.length);
  check('(1b) 矢印も羊皮紙も **#nodeLayer の中**に作られる (遷移時に一掃される保証)',
    A1.dom === 3 && A1.domHint === 3 && A1.outside === 0,
    'arrow=' + A1.dom + ' hint=' + A1.domHint + ' 外=' + A1.outside);
  check('(1c) ★矢印の pointer-events が auto (.sce1Captive の none を写していない)',
    A1.arrows.length > 0 && A1.arrows.every(a => a.pe === 'auto'),
    A1.arrows.map(a => a.to + ':' + a.pe).join(' '));
  check('(1d) 羊皮紙の pointer-events も auto (矢印が画面外でも押せる実体になる)',
    A1.arrows.length > 0 && A1.arrows.every(a => a.hintPe === 'auto'),
    A1.arrows.map(a => a.to + ':' + a.hintPe).join(' '));
  check('(1e) z-index はフォグ暗幕 (9) より上 = 暗がりの出口でも沈まない',
    A1.arrows.every(a => parseInt(a.z, 10) > 9), A1.arrows.map(a => a.z).join(' '));
  /* ⚠ rect (getBoundingClientRect) は CSS の脈動 (transform:scale 0.92〜1.10) が乗るので
   *   フレームごとに揺れる。当たり判定の大きさは **offsetWidth = レイアウト寸法**で測る。 */
  check('(1f) 広い画面では矢印が 96px 角 (指で押せる最小 44px を超える)',
    A1.arrows.every(a => a.box.w === 96 && a.box.h === 96),
    A1.arrows.map(a => a.box.w + 'x' + a.box.h).join(' '));
  check('(1g) 選ぶまで promise は解決しない', A1.done === false, 'done=' + A1.done);
  check('(1h) 選んでいる間は世界を止める (dialogPaused=true)', A1.paused === true, '');
  check('(1i) 方向ごとのグリフが出ている',
    JSON.stringify(A1.arrows.map(a => a.dir)) === '["up","right","down"]',
    A1.arrows.map(a => a.dir).join(' '));
  check('(1j) 羊皮紙に知覚判定で確定したヒント文が載っている',
    A1.arrows.some(a => a.hintText.indexOf('荒々しい声が聞こえる') >= 0),
    A1.arrows.map(a => a.hintText).join(' | ').slice(0, 120));

  // ══ §2 座標が at タイルと一致 / カメラ追従 ═════════════════════════════════
  /* ⚠⚠ 2026-08-07 (P5 前段) に**契約を 1 段強くした**。
   *   旧: 「矢印の画面座標 == at タイルの式」 (矢印は一切クランプされない前提)
   *   新: 「矢印の画面座標 == **clamp(at タイルの式, ダンジョン可視域)**」
   *   クランプは自然位置が可視域の外へ出るときだけ効く恒等操作なので、部屋が画面に収まる
   *   広い画面では旧契約と**完全に同じ値**になる。狭幅で初めて差が出る。
   * ⚠ 半分の値を 48 で直書きしない。compact では矢印が 64px になるので box.w/2 を使う
   *   (直書きすると狭幅で 16px ずれ、しかも「実装が間違っている」ように見える)。 */
  mark('矢印の座標と カメラ追従');
  const natural = (a, cam) => ({
    left: a.at.tx * cam.tile + cam.tile / 2 - a.box.w / 2 - cam.camX,
    top:  a.at.ty * cam.tile + cam.tile / 2 - a.box.h / 2 - cam.camY,
  });
  const clampv = (v, lo, hi) => (lo <= hi) ? Math.max(lo, Math.min(v, hi)) : v;
  // 実装と同じ「可視域へ収める」式。⚠ padL/padB はページ側の viewRect から採る (自前に写さない)
  const expect = (a, cam, view) => {
    const n = natural(a, cam);
    return { left: clampv(n.left, view.x + 8, view.x + view.w - 8 - a.box.w),
             top:  clampv(n.top, 8, view.h - 8 - a.box.h),
             clamped: false, n };
  };
  const fits = (a, cam, view) => {
    const n = natural(a, cam), e = expect(a, cam, view);
    return Math.abs(n.left - e.left) < 0.51 && Math.abs(n.top - e.top) < 0.51;
  };
  {
    const view0 = await page.evaluate(() => window.__graphRun.viewRect());
    const okStatic = A1.arrows.every(a => {
      const e = expect(a, A1.cam, view0);
      return Math.abs(a.left - e.left) < 0.51 && Math.abs(a.top - e.top) < 0.51;
    });
    check('(2a) 矢印のスクリーン座標が at タイル (tx*96+48-w/2-cam) と一致',
      okStatic, A1.arrows.map(a => a.to + ' L' + Math.round(a.left) + '/' +
        Math.round(expect(a, A1.cam, view0).left)).join(' '));
    /* ★[P5 前段] この改修の目的そのもの: 広い画面ではクランプが 1 本も効いていない
     *   = 矢印はどれも「その扉の真上」に立っている。旧 (3a) の「1 本以上が画面外」の**反転**。 */
    check('(2a2) ★1280x800 では矢印が 1 本もクランプされない (全部 at タイルの真上に立つ)',
      A1.arrows.length > 0 && A1.arrows.every(a => fits(a, A1.cam, view0)),
      A1.arrows.map(a => a.dir + ':' + (fits(a, A1.cam, view0) ? '素' : 'clamp')).join(' '));

    /* ⚠⚠ 静止画で一致していても「たまたまカメラが動いていない」だけかもしれない → 振って検算する。
     * ⚠⚠ **1280x800 ではカメラを振れなくなった** (P5 前段)。部屋 7x6 が可視域 10.4x6.6 に収まる
     *   ので MAP_USED クランプがカメラを 1 点へ固定するためで、これは仕様どおり
     *   (だからこそ矢印 4 本が常に画面内に居られる)。→ **追従の検算は 390x844 で行う**。
     *   縦は部屋が収まる (576 < 660) が横は収まらない (672 > 390) ので camX に 282px の
     *   可動域があり、しかも上下の矢印は tx=36 (部屋の中央列) なので両端でクランプに掛からない。 */
    const savedVp = page.viewport() || DESKTOP;
    await page.setViewport(IPHONE);
    await sleep(250);
    const moved = await page.evaluate(() => {
      const g = window.__graphRun;
      const [r1, c1, r2, c2] = ROOMS[0];
      // 部屋の西端 → 東端へ主人公を飛ばし、カメラを追従させる (幾何から採る = 直書きしない)
      playerX = c1 * TILE_SIZE; playerY = Math.floor((r1 + r2) / 2) * TILE_SIZE;
      for (const a of allies) { a.x = playerX; a.y = playerY; }
      snapCamera();
      const midCam = g.cam(), mid = g.arrows();
      playerX = c2 * TILE_SIZE;
      for (const a of allies) { a.x = playerX; a.y = playerY; }
      snapCamera();
      return { midCam, mid, afterCam: g.cam(), after: g.arrows(), view: g.viewRect(),
               room: [r1, c1, r2, c2] };
    });
    check('(2b) ★カメラが実際に動いた (追従の検算が空振りでない証明)',
      Math.abs(moved.afterCam.camX - moved.midCam.camX) > 100,
      'camX ' + Math.round(moved.midCam.camX) + ' → ' + Math.round(moved.afterCam.camX) +
      ' / 部屋=' + JSON.stringify(moved.room));
    const okMid = moved.mid.every(a => {
      const e = expect(a, moved.midCam, moved.view);
      return Math.abs(a.left - e.left) < 0.51 && Math.abs(a.top - e.top) < 0.51;
    });
    const okAfter = moved.after.every(a => {
      const e = expect(a, moved.afterCam, moved.view);
      return Math.abs(a.left - e.left) < 0.51 && Math.abs(a.top - e.top) < 0.51;
    });
    check('(2c) カメラを振った後も矢印が at タイルへ追従している (両地点で clamp 込みの式が成立)',
      okMid && okAfter, 'mid=' + okMid + ' after=' + okAfter);
    /* 追従の「量」も測る: 画面座標の変化は カメラ移動量の符号反転とちょうど一致する。
     * ⚠ **クランプに掛かっていない矢印だけ**で測る (クランプされた矢印は動かないのが正しい)。 */
    const dCam = moved.afterCam.camX - moved.midCam.camX;
    const freeIdx = moved.mid.map((a, i) => i).filter(i =>
      fits(moved.mid[i], moved.midCam, moved.view) && fits(moved.after[i], moved.afterCam, moved.view));
    check('(2d0) ★母集団: 両端ともクランプに掛からない矢印が 1 本以上ある (Δ を測る対象がある)',
      freeIdx.length >= 1, '自由=' + freeIdx.length + '/' + moved.mid.length +
      ' [' + freeIdx.map(i => moved.mid[i].dir).join(' ') + ']');
    const okDelta = freeIdx.length >= 1 && freeIdx.every(i =>
      Math.abs((moved.after[i].left - moved.mid[i].left) + dCam) < 0.51);
    check('(2d) 画面座標の変化量が -Δcam とちょうど一致する (別要因で動いていない)',
      okDelta, 'Δcam=' + Math.round(dCam) + ' Δarrow=' +
      freeIdx.map(i => Math.round(moved.after[i].left - moved.mid[i].left)).join('/'));
    /* ★[P5 前段] 狭幅でクランプが**実際に効いている**こと (母集団ガード)。ここが 0 だと
     *   (2c) は「クランプが一度も発動しない状況で恒等式を確かめただけ」になる。 */
    /* ⚠ **両方の視点を合わせて数える**。西端では東の矢印が、東端では西の矢印がクランプされるので、
     *   片方だけ見ると「たまたまその位置では全部収まっていた」で 0 になる (実際に踏んだ)。 */
    const clampedMid = moved.mid.filter(a => !fits(a, moved.midCam, moved.view)).length;
    const clampedAft = moved.after.filter(a => !fits(a, moved.afterCam, moved.view)).length;
    check('(2e) ★狭幅ではクランプが実際に発動している (恒等式だけを見ていない証明)',
      clampedMid + clampedAft >= 1,
      'クランプされた矢印: 西端=' + clampedMid + '/' + moved.mid.length +
      ' 東端=' + clampedAft + '/' + moved.after.length);
    await page.setViewport(savedVp);
    await sleep(250);
    await page.evaluate(() => { snapCamera(); window.__graphRun.reposition(); });
  }

  // ══ §3 矢印と羊皮紙が可視域に収まる ═══════════════════════════════════════
  /* ⚠⚠ 2026-08-07 (P5 前段) に (3a) を**反転**した。旧 (3a) は「この視点では矢印が 1 つ以上
   *   画面外にある (クランプを測る母集団がある)」で、当時は部屋 20x14 に対し可視域が
   *   6.5 タイルしかなく**上下の矢印は常に画面外**だったことを前提にしていた。
   *   部屋を可視域サイズへ縮めた今、広い画面で矢印が画面外に出るのは**欠陥**なので、
   *   同じ場所で逆向きに測る (= assert を消さずに、新しい正しい挙動へ書き直す)。
   *   クランプが実際に効くこと自体は §2 (2e) と §6 が狭幅で測っている。 */
  mark('矢印と羊皮紙が可視域に収まる (1280x800)');
  const C3 = await page.evaluate(() => {
    const g = window.__graphRun;
    return { cam: g.cam(), arrows: g.arrows(), view: g.viewRect(), padL: UI_MENU_WIDTH + 8 };
  });
  {
    const off = C3.arrows.filter(a =>
      a.left < C3.view.x - 0.6 || a.left + a.box.w > C3.view.x + C3.view.w + 0.6 ||
      a.top  < C3.view.y - 0.6 || a.top  + a.box.h > C3.view.y + C3.view.h + 0.6);
    check('(3a) ★1280x800 では矢印が 1 本も画面外に無い (部屋を可視域サイズへ縮めた目的そのもの)',
      C3.arrows.length > 0 && off.length === 0, '画面外=' + off.length + '/' + C3.arrows.length +
      ' view=' + JSON.stringify(C3.view) + ' hud=' + C3.cam.hud);
    const inside = C3.arrows.every(a =>
      a.hintRect.x >= -0.6 && a.hintRect.x + a.hintRect.w <= C3.cam.vw + 0.6 &&
      a.hintRect.y >= -0.6 && a.hintRect.y + a.hintRect.h <= C3.cam.vh + 0.6);
    check('(3b) 羊皮紙は全部が画面の中に収まっている (矢印が画面外でも選択肢を失わない)',
      inside, C3.arrows.map(a => Math.round(a.hintRect.x) + ',' + Math.round(a.hintRect.y)).join(' '));
    const aboveHud = C3.arrows.every(a => a.hintRect.y + a.hintRect.h <= C3.cam.vh - C3.cam.hud + 0.6);
    check('(3c) 羊皮紙が下部 HUD (ログ枠 + HP ミニバー) の下へ潜らない',
      aboveHud, 'hud=' + C3.cam.hud + ' 底=' +
      C3.arrows.map(a => Math.round(a.hintRect.y + a.hintRect.h)).join('/'));
    const rightOfPanel = C3.arrows.every(a => a.hintRect.x >= C3.padL - 0.6);
    check('(3d) 羊皮紙が左のステータスパネルの下へ潜らない',
      rightOfPanel, 'padL=' + C3.padL + ' 左端=' +
      C3.arrows.map(a => Math.round(a.hintRect.x)).join('/'));
  }

  // ══ §4 知覚判定によるヒントの出し分け ══════════════════════════════════════
  mark('ヒントの解像度 (crit / 成功 / 失敗 / ファンブル)');
  const H = await page.evaluate(async () => {
    const g = window.__graphRun;
    const out = {};
    for (const t of ['crit', 'success', 'fail', 'fumble']) {
      g.clearHints();
      await g.reveal(t);
      out[t] = JSON.parse(JSON.stringify(g.hints()));
    }
    out.dc = { one: g.hintDc(1), two: g.hintDc(2), three: g.hintDc(3), four: g.hintDc(4) };
    return out;
  });
  check('(4a) クリティカル: sure 文 + アイコン + **体数**まで出る',
    H.crit.tier === 'crit' && H.crit.byExit.n1.icon === '⚔' && H.crit.byExit.n1.count > 0 &&
    /体ばかり/.test(H.crit.byExit.n1.text),
    'n1="' + H.crit.byExit.n1.text + '" count=' + H.crit.byExit.n1.count);
  check('(4b) 成功: sure 文 + アイコン (体数は出ない)',
    H.success.byExit.n1.icon === '⚔' && H.success.byExit.n1.count === 0 &&
    H.success.byExit.n1.text.indexOf('荒々しい声が聞こえる') >= 0,
    'n1="' + H.success.byExit.n1.text + '"');
  check('(4c) 成功: 著者が明示した hint.text が既定表に勝つ',
    H.success.byExit.n2.text === '金属の匂いがする' && H.success.byExit.n4.text === '先は暗くて見えない',
    'n2="' + H.success.byExit.n2.text + '" n4="' + H.success.byExit.n4.text + '"');
  check('(4d) 失敗: vague 文だけ (アイコンも出さない = 分からなかったことが絵でも分かる)',
    H.fail.byExit.n1.icon === '' && H.fail.byExit.n1.kind === null &&
    H.fail.byExit.n1.text === '何かの気配がする',
    'n1="' + H.fail.byExit.n1.text + '" icon="' + H.fail.byExit.n1.icon + '"');
  check('(4e) ファンブル: **別 kind の sure 文**を掴まされる (誤情報)',
    H.fumble.byExit.n1.wrong === true && H.fumble.byExit.n1.kind !== 'combat' &&
    H.fumble.byExit.n1.text !== H.success.byExit.n1.text,
    'n1 kind=' + H.fumble.byExit.n1.kind + ' "' + H.fumble.byExit.n1.text + '"');
  check('(4f) ファンブルの誤情報に boss を騙らせない (ボス警告だけは常に本物)',
    ['n1', 'n2', 'n4'].every(k => H.fumble.byExit[k].kind !== 'boss'),
    ['n1', 'n2', 'n4'].map(k => k + ':' + H.fumble.byExit[k].kind).join(' '));
  check('(4g) DC は perceptionDC 基準 + 出口本数で +0/+2/+4',
    H.dc.two - H.dc.one === 2 && H.dc.three - H.dc.one === 4 && H.dc.four === H.dc.three,
    JSON.stringify(H.dc));

  mark('★boss 出口には誤情報を出さない (n1 → n3)');
  const HB = await page.evaluate(async () => {
    const g = window.__graphRun;
    await g.enter('n1', 'up');                    // boss (n3) への出口を 1 本だけ持つノードへ
    g.clearHints();
    await g.reveal('fumble');
    const f = JSON.parse(JSON.stringify(g.hints()));
    g.clearHints();
    await g.reveal('success');
    const s = JSON.parse(JSON.stringify(g.hints()));
    return { node: g.nodeId(), fumble: f, success: s };
  });
  check('(4h) 前提: n1 に居て boss (n3) への出口を持つ',
    HB.node === 'n1' && !!HB.fumble.byExit.n3, 'node=' + HB.node);
  check('(4i) ★ファンブルでも boss 出口は嘘をつかない (wrong=false)',
    HB.fumble.byExit.n3.wrong === false, 'wrong=' + HB.fumble.byExit.n3.wrong +
    ' "' + HB.fumble.byExit.n3.text + '"');
  check('(4j) boss 出口のファンブルは「何も分からない」= vague へ落ちる',
    HB.fumble.byExit.n3.text === '空気が冷たい' && HB.fumble.byExit.n3.icon === '',
    '"' + HB.fumble.byExit.n3.text + '"');
  check('(4k) 成功なら boss 出口はちゃんと警告する (4i が「常に無言」で通っていない証明)',
    HB.success.byExit.n3.text.indexOf('重い足音') >= 0 && HB.success.byExit.n3.icon === '☠',
    '"' + HB.success.byExit.n3.text + '"');

  mark('ヒントは 1 ノード 1 回きり (再入場で振り直さない)');
  const HR = await page.evaluate(async () => {
    const g = window.__graphRun;
    const first = JSON.stringify(g.hints('n1'));
    await g.reveal();                              // forcedTier 無しで再度呼ぶ
    const second = JSON.stringify(g.hints('n1'));
    await g.enter('n0', 'down');                   // 親へ戻る
    await g.enter('n1', 'up');                     // もう一度 n1 へ
    const third = JSON.stringify(g.hints('n1'));
    return { first, second, third, node: g.nodeId() };
  });
  check('(4l) 同じノードで reveal を呼び直しても結果が変わらない',
    HR.first === HR.second && HR.first !== 'null', HR.first.slice(0, 70));
  check('(4m) ★引き返して入り直しても振り直さない (無限リロールにならない)',
    HR.first === HR.third && HR.node === 'n1', 'node=' + HR.node);

  // ══ §5 タップ (click / touchend / gate / 二重発火) ════════════════════════
  mark('タップ受付 (click + touchend / 連打貫通 / 二重発火)');
  await page.evaluate(() => window.__graphRun.enter('n0', 'down'));
  await sleep(1000);   // enterNode は暗転 300ms x2 を挟むので待つ
  await page.evaluate(() => window.__graphRun.reveal('success'));
  await page.evaluate(OPEN_CHOICE);
  await sleep(60);
  const T1 = await page.evaluate(() => {
    // 表示直後 (gate 内) の click は貫通しないこと
    document.querySelector('.exitArrow[data-to="n2"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { done: window.__pickDone, arrows: document.querySelectorAll('.exitArrow').length,
             gate: window.__graphRun.arrowGate(), node: window.__graphRun.nodeId() };
  });
  check('(5a) ★表示直後 (gate 内) の click は選択にならない (直前操作の連打が貫通しない)',
    T1.done === false && T1.arrows === 3 && T1.node === 'n0',
    'done=' + T1.done + ' gate=' + T1.gate + 'ms node=' + T1.node);
  await sleep(T1.gate + 200);
  const T2 = await page.evaluate(() => {
    const el = document.querySelector('.exitArrow[data-to="n2"]');
    // iOS の 1 タップ = touchend → (合成) click の 2 発。1 回の選択として扱われること
    const te = new Event('touchend', { bubbles: true, cancelable: true });
    el.dispatchEvent(te);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { defaultPrevented: te.defaultPrevented };
  });
  await sleep(80);
  const T3 = await page.evaluate(() => ({
    done: window.__pickDone, pick: window.__pick, arrows: document.querySelectorAll('.exitArrow').length,
    hints: document.querySelectorAll('.exitHint').length, paused: dialogPaused,
  }));
  check('(5b) gate 経過後の touchend で選択が確定する (click 非発火端末でも詰まない)',
    T3.done === true && !!T3.pick && T3.pick.to === 'n2', 'pick=' + JSON.stringify(T3.pick));
  check('(5c) touchend が preventDefault される (合成 click の二重発火を一次防御で止める)',
    T2.defaultPrevented === true, 'prevented=' + T2.defaultPrevented);
  check('(5d) 選択後は矢印も羊皮紙も残らない', T3.arrows === 0 && T3.hints === 0,
    'arrow=' + T3.arrows + ' hint=' + T3.hints);
  check('(5e) 選択後に dialogPaused が下りる (世界が止まったままにならない)',
    T3.paused === false, 'paused=' + T3.paused);

  mark('羊皮紙のタップでも選べる / Esc で「留まる」');
  await page.evaluate(OPEN_CHOICE);
  await sleep(800);
  await page.evaluate(() => {
    document.querySelector('.exitHint[data-to="n4"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await sleep(80);
  const T5 = await page.evaluate(() => ({ done: window.__pickDone, pick: window.__pick }));
  check('(5f) 羊皮紙のクリックでも同じ出口が選ばれる (画面外の矢印の代わりになる)',
    T5.done === true && !!T5.pick && T5.pick.to === 'n4', 'pick=' + JSON.stringify(T5.pick));
  await page.evaluate(OPEN_CHOICE);
  await sleep(800);
  await page.keyboard.press('Escape');
  await sleep(80);
  const T6 = await page.evaluate(() => ({ done: window.__pickDone, pick: window.__pick,
                                          arrows: document.querySelectorAll('.exitArrow').length,
                                          paused: dialogPaused }));
  check('(5g) Esc で「留まる」= null が返り、矢印が片付く',
    T6.done === true && T6.pick === null && T6.arrows === 0 && T6.paused === false,
    'pick=' + JSON.stringify(T6.pick) + ' arrows=' + T6.arrows);

  // ══ §6 狭幅のコンパクト矢印レイアウト (同一 run に負のコントロールを内包) ══
  /* ⚠⚠ 2026-08-07 (P5 前段) に**丸ごと書き直した**。旧 §6 は「狭幅では矢印を 1 つも作らず
   *   #choiceDialog へ落とす」を測っていたが、iPhone は縦 (390x844 → w<=560) も
   *   横 (844x390 → h<=480) も compact 判定に入るため、**実機では矢印が一度も出なかった**。
   *   ユーザー決定で「狭幅でも矢印を出す」へ変えたので、ここも同じ場所で新仕様を測る。
   *   ⚠ assert は 1 つも減らしていない (6 本 → 7 本)。
   * ⚠ ダイアログ経路は死んでいない。生存条件は **?autoplay** になり §7 が測っている。 */
  mark('狭幅のコンパクト矢印 1280x800 → 390x844 → 844x390 → 1280x800');
  await page.setViewport(IPHONE);
  await sleep(250);
  const F1 = await page.evaluate(() => ({ compact: window.__graphRun.compact(),
                                          cls: document.body.className }));
  check('(6a) 390x844 で body.ui-compact が付き useCompactArrows が true',
    F1.compact === true && /ui-compact/.test(F1.cls), 'compact=' + F1.compact);
  await page.evaluate(OPEN_CHOICE);
  await sleep(150);
  const F2 = await page.evaluate(() => {
    const g = window.__graphRun, dlg = document.getElementById('choiceDialog');
    const view = g.viewRect(), arrows = g.arrows();
    const outA = arrows.filter(a => a.left < view.x - 0.6 || a.left + a.box.w > view.x + view.w + 0.6 ||
                                    a.top < view.y - 0.6 || a.top + a.box.h > view.y + view.h + 0.6);
    const outH = arrows.filter(a => a.hintRect.x < view.x - 0.6 ||
                                    a.hintRect.x + a.hintRect.w > view.x + view.w + 0.6 ||
                                    a.hintRect.y < view.y - 0.6 ||
                                    a.hintRect.y + a.hintRect.h > view.y + view.h + 0.6);
    let ov = 0;
    for (let i = 0; i < arrows.length; i++) for (let j = i + 1; j < arrows.length; j++) {
      const A = arrows[i].hintRect, B = arrows[j].hintRect;
      if (A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y) ov++;
    }
    return { arrows: arrows.length, view, outA: outA.length, outH: outH.length, overlap: ov,
             dlgShown: !!(dlg && dlg.classList.contains('show')),
             boxes: arrows.map(a => a.box.w + 'x' + a.box.h).join(' '),
             hintW: arrows.map(a => Math.round(a.hintRect.w)).join('/'),
             texts: arrows.map(a => a.hintText),
             pos: arrows.map(a => a.dir + '(' + Math.round(a.left) + ',' + Math.round(a.top) + ')').join(' ') };
  });
  check('(6b) ★狭幅でも矢印が出る (旧: 1 つも作らずダイアログへ落としていた = 実機で矢印ゼロ)',
    F2.arrows === 3 && F2.dlgShown === false, 'arrows=' + F2.arrows + ' dialog=' + F2.dlgShown);
  check('(6c) ★矢印も羊皮紙も 1 つ残らず「ダンジョンが見えている矩形」の中にある (縁クランプ)',
    F2.arrows > 0 && F2.outA === 0 && F2.outH === 0,
    '矢印の画面外=' + F2.outA + ' 羊皮紙の画面外=' + F2.outH + ' view=' + JSON.stringify(F2.view) +
    ' / ' + F2.pos);
  check('(6d) ★コンパクト寸法へ切り替わる (矢印 96→64px / 羊皮紙 <=166px) = レイアウトが本当に別物',
    F2.boxes === '64x64 64x64 64x64' &&
    F2.hintW.split('/').every(w => parseInt(w, 10) <= 166),
    '矢印=' + F2.boxes + ' 羊皮紙幅=' + F2.hintW);
  check('(6e) 羊皮紙どうしが重ならない (下敷きになって押せない選択肢が生まれない)',
    F2.overlap === 0, '重なり=' + F2.overlap + ' 組');
  check('(6f) 狭幅の羊皮紙にも知覚判定のヒントが載る (広幅と情報が食い違わない)',
    F2.texts.some(t => t.indexOf('荒々しい声が聞こえる') >= 0 && t.indexOf('⚔') >= 0),
    F2.texts.join(' | ').slice(0, 140));
  // ── iPhone 横持ち (844x390): 可視域の**縦が 217px しかない**最悪ケース ──────────
  await page.setViewport({ width: 844, height: 390 });
  await sleep(250);
  await page.evaluate(() => window.__graphRun.reposition());
  const F2L = await page.evaluate(() => {
    const g = window.__graphRun, view = g.viewRect(), arrows = g.arrows();
    const out = arrows.filter(a => a.left < view.x - 0.6 || a.left + a.box.w > view.x + view.w + 0.6 ||
                                   a.top < view.y - 0.6 || a.top + a.box.h > view.y + view.h + 0.6 ||
                                   a.hintRect.y < view.y - 0.6 ||
                                   a.hintRect.y + a.hintRect.h > view.y + view.h + 0.6);
    return { compact: g.compact(), arrows: arrows.length, out: out.length, view,
             pos: arrows.map(a => a.dir + '(' + Math.round(a.left) + ',' + Math.round(a.top) + ')').join(' ') };
  });
  check('(6g) ★iPhone 横持ち (844x390 = 可視域の縦 217px) でも矢印と羊皮紙が全部画面内',
    F2L.compact === true && F2L.arrows === 3 && F2L.out === 0,
    'compact=' + F2L.compact + ' 画面外=' + F2L.out + '/' + F2L.arrows +
    ' view=' + JSON.stringify(F2L.view) + ' / ' + F2L.pos);
  await page.setViewport(IPHONE);
  await sleep(250);
  await page.evaluate(() => {
    document.querySelector('.exitHint').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await sleep(80);
  const F3 = await page.evaluate(() => ({ done: window.__pickDone, pick: window.__pick }));
  check('(6h) 狭幅でも羊皮紙のタップで出口が選べる (縮めた見た目が飾りでない)',
    F3.done === true && !!F3.pick && !!F3.pick.to, 'pick=' + JSON.stringify(F3.pick));
  await page.setViewport(DESKTOP);
  await sleep(250);
  await page.evaluate(OPEN_CHOICE);
  await sleep(150);
  const F4 = await page.evaluate(() => {
    const dlg = document.getElementById('choiceDialog');
    return { compact: window.__graphRun.compact(),
             arrows: document.querySelectorAll('.exitArrow').length,
             boxes: window.__graphRun.arrows().map(a => a.box.w).join('/'),
             dlg: !!(dlg && dlg.classList.contains('show')) };
  });
  check('(6i) ★1280x800 へ戻すと広幅レイアウト (96px) に戻る (同一 run の中で両方が出た証明)',
    F4.compact === false && F4.arrows === 3 && F4.dlg === false && F4.boxes === '96/96/96',
    'compact=' + F4.compact + ' arrows=' + F4.arrows + ' 寸法=' + F4.boxes + ' dlg=' + F4.dlg);
  await page.keyboard.press('Escape');
  await sleep(80);

  // ══ §7 ?autoplay では矢印を 1 つも作らない ═════════════════════════════════
  mark('?autoplay ガード (既存ドライバを止めない保証)');
  const pAuto = await bootPage(browser, 'http://localhost:' + PORT + QT + '&autoplay=30',
                               warns, errs, DESKTOP);
  const AP = await pAuto.evaluate(async () => {
    const g = window.__graphRun;
    const before = g.exits().map(o => o.to);
    // ★ヒントの知覚判定も autoplay では UI を出さず即決すること (ここで止まると全ドライバが死ぬ)
    const t0 = Date.now();
    await g.reveal();
    const rolledMs = Date.now() - t0;
    const h = JSON.parse(JSON.stringify(g.hints()));
    const pick = await g.choose();     // ★await できる = ダイアログ経路で即決している
    return { before, pick, rolledMs, tier: h.tier, rolled: h.rolled,
             arrows: document.querySelectorAll('.exitArrow').length,
             hints: document.querySelectorAll('.exitHint').length };
  });
  check('(7a) ★?autoplay では矢印を 1 つも作らない', AP.arrows === 0 && AP.hints === 0,
    'arrow=' + AP.arrows + ' hint=' + AP.hints);
  check('(7b) choose() が await で即決する (showCharChoice の候補 0 即返しに乗っている)',
    !!AP.pick && AP.pick.to === AP.before[0], 'pick=' + (AP.pick && AP.pick.to));
  check('(7c) 知覚判定も UI を出さず即決する (パネル待ちで固まらない)',
    AP.rolledMs < 2000 && AP.rolled === true &&
    ['crit', 'success', 'fail', 'fumble'].indexOf(AP.tier) >= 0,
    AP.rolledMs + 'ms tier=' + AP.tier);
  await pAuto.close();

  // ══ §8 遷移で矢印が残らない (P1 の一掃にちゃんと乗っている) ════════════════
  mark('ノード遷移で矢印が残らない');
  const L = await page.evaluate(async () => {
    const g = window.__graphRun;
    g.reveal('success');
    g.choose();                                    // 矢印を出したまま…
    await new Promise(r => setTimeout(r, 80));
    const opened = document.querySelectorAll('#nodeLayer .exitArrow').length;
    await g.enter('n2', 'right');                  // …遷移させる (最悪ケース)
    return { opened, after: document.querySelectorAll('#nodeLayer .exitArrow').length,
             node: g.nodeId(), hints: document.querySelectorAll('.exitHint').length };
  });
  check('(8a) 前提: 遷移前に矢印が出ていた', L.opened === 3, 'opened=' + L.opened);
  check('(8b) 遷移後に矢印も羊皮紙も 1 つも残らない (#nodeLayer の一掃に乗っている)',
    L.after === 0 && L.hints === 0 && L.node === 'n2',
    'after=' + L.after + ' hint=' + L.hints + ' node=' + L.node);

  /* ══ §11 ★4 方向すべてに矢印が出るノードで「4 本とも画面内」を測る ══════════════
   * ⚠⚠ 内蔵テストグラフの最大は entry (n0) の **3 本**で、しかも entry には親が無いので
   *   「引き返す」が生えない = **4 本の状況が一度も作れない**。今回の依頼が求めているのは
   *   まさに「矢印 4 本が実際に画面内に入る」ことなので、**本番と同じ入口 (生成クエストの
   *   ペイロード) で 4 本の状況を作って測る**。
   * ⚠ 幾何は testRun() の mapDef をそのまま流用して**部屋の rect から出口を導く**
   *   (直書きしない = 部屋サイズを次に動かしたときも自動で追従する)。
   * ⚠ nA へは 'right' で入るので「引き返す」は 'left'。前進 up/right/down と合わせて全 4 方向。 */
  mark('★4 方向 (上/下/左/右) すべてに矢印が出るノード');
  {
    const wQ = [], eQ = [];
    const testRunJson = await page.evaluate(() => JSON.stringify(window.__graphRun.testRun()));
    const src = JSON.parse(testRunJson), byId = {};
    for (const n of src.nodes) byId[n.id] = n;
    const cp = (o) => JSON.parse(JSON.stringify(o));
    const rc = byId.n0.mapDef.rooms[0].rect;                 // [r1,c1,r2,c2]
    const midC = Math.floor((rc[1] + rc[3]) / 2), midR = Math.floor((rc[0] + rc[2]) / 2);
    const UP = [midC, rc[0]], DOWN = [midC, rc[2]], RIGHT = [rc[3], midR];
    const four = {
      entry: 'n0',
      nodes: [
        { id: 'n0', kind: 'start',  mapDef: cp(byId.n0.mapDef),
          exits: [{ to: 'nA', dir: 'right', at: RIGHT }] },
        { id: 'nA', kind: 'combat', mapDef: cp(byId.n1.mapDef),
          exits: [{ to: 'nU', dir: 'up',    at: UP },
                  { to: 'nR', dir: 'right', at: RIGHT },
                  { to: 'nB', dir: 'down',  at: DOWN }] },
        { id: 'nU', kind: 'loot',   mapDef: cp(byId.n2.mapDef), exits: [] },
        { id: 'nR', kind: 'loot',   mapDef: cp(byId.n2.mapDef), exits: [] },
        { id: 'nB', kind: 'boss',   mapDef: cp(byId.n3.mapDef), exits: [] },
      ],
    };
    const pre = 'sessionStorage.setItem("dragonfighters.generatedScenario", ' +
      JSON.stringify(JSON.stringify({
        title: '4 方向テスト', flavor: '', themeId: 'goblin-mine', perceptionDC: 14,
        trapCount: 3, hiddenChestCount: 2, clearXp: 0, spawns: [], run: four,
      })) + ');';
    // ⚠ ?graphtest を付けない = ペイロードだけで RUN が立つ本番の入口を通す
    const pQ = await bootPage(browser, 'http://localhost:' + PORT + '/index.html?diag=1',
                              wQ, eQ, DESKTOP, pre);
    const measure = async (label) => await pQ.evaluate(() => {
      const g = window.__graphRun;
      g.reposition();
      const view = g.viewRect(), arrows = g.arrows();
      const outA = arrows.filter(a => a.left < view.x - 0.6 || a.left + a.box.w > view.x + view.w + 0.6 ||
                                      a.top < view.y - 0.6 || a.top + a.box.h > view.y + view.h + 0.6);
      const outH = arrows.filter(a => a.hintRect.x < view.x - 0.6 ||
                                      a.hintRect.x + a.hintRect.w > view.x + view.w + 0.6 ||
                                      a.hintRect.y < view.y - 0.6 ||
                                      a.hintRect.y + a.hintRect.h > view.y + view.h + 0.6);
      let ov = 0;
      for (let i = 0; i < arrows.length; i++) for (let j = i + 1; j < arrows.length; j++) {
        const A = arrows[i].hintRect, B = arrows[j].hintRect;
        if (A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y) ov++;
      }
      return { n: arrows.length, dirs: arrows.map(a => a.dir).sort().join(','),
               back: arrows.filter(a => a.back).length, view,
               outA: outA.length, outH: outH.length, overlap: ov,
               pos: arrows.map(a => a.dir + '(' + Math.round(a.left) + ',' + Math.round(a.top) + ')').join(' ') };
    });
    await pQ.evaluate(async () => {
      const g = window.__graphRun;
      await g.enter('nA', 'right');                        // ★親 n0 から右へ = 引き返すは左
      await g.reveal('success');
      window.__pickDone = false;
      g.choose().then(v => { window.__pick = v; window.__pickDone = true; });
    });
    await sleep(250);
    const Q1 = await measure('desktop');
    check('(11a) ★4 方向すべてに矢印が出る (前進 up/right/down + 自動生成の引き返す left)',
      Q1.n === 4 && Q1.dirs === 'down,left,right,up' && Q1.back === 1,
      'n=' + Q1.n + ' dirs=' + Q1.dirs + ' back=' + Q1.back);
    check('(11b) ★1280x800 で矢印 4 本と羊皮紙 4 枚が**全部画面内** (この改修の目的そのもの)',
      Q1.n === 4 && Q1.outA === 0 && Q1.outH === 0,
      '矢印の画面外=' + Q1.outA + ' 羊皮紙の画面外=' + Q1.outH +
      ' view=' + JSON.stringify(Q1.view) + ' / ' + Q1.pos);
    check('(11c) 羊皮紙 4 枚が重ならない (下敷きになって押せない選択肢が無い)',
      Q1.overlap === 0, '重なり=' + Q1.overlap + ' 組');
    await pQ.setViewport(IPAD);
    await sleep(250);
    const Q2 = await measure('ipad');
    check('(11d) ★iPad 1024x768 (基準端末) でも 4 本と 4 枚が全部画面内',
      Q2.n === 4 && Q2.outA === 0 && Q2.outH === 0,
      '矢印の画面外=' + Q2.outA + ' 羊皮紙の画面外=' + Q2.outH +
      ' view=' + JSON.stringify(Q2.view) + ' / ' + Q2.pos);
    await pQ.setViewport(IPHONE);
    await sleep(250);
    const Q3 = await measure('iphone');
    check('(11e) ★iPhone 縦 390x844 でも 4 本と 4 枚が全部画面内 (縁クランプ + コンパクト寸法)',
      Q3.n === 4 && Q3.outA === 0 && Q3.outH === 0 && Q3.overlap === 0,
      '矢印の画面外=' + Q3.outA + ' 羊皮紙の画面外=' + Q3.outH + ' 重なり=' + Q3.overlap +
      ' view=' + JSON.stringify(Q3.view) + ' / ' + Q3.pos);
    await pQ.setViewport(IPHONE_LAND);
    await sleep(250);
    const Q4 = await measure('iphone-land');
    check('(11f) ★iPhone 横 844x390 (可視域の縦 217px) でも 4 本と 4 枚が全部画面内',
      Q4.n === 4 && Q4.outA === 0 && Q4.outH === 0 && Q4.overlap === 0,
      '矢印の画面外=' + Q4.outA + ' 羊皮紙の画面外=' + Q4.outH + ' 重なり=' + Q4.overlap +
      ' view=' + JSON.stringify(Q4.view) + ' / ' + Q4.pos);
    check('(11g) 4 方向グラフ自体が壊れていない (pageerror / console.error が 0)',
      eQ.length === 0, eQ.slice(0, 3).join(' | '));
    await pQ.close();
  }

  // ══ §9 エラーゼロ ═════════════════════════════════════════════════════════
  mark('エラーゼロ');
  check('(9a) 素の側: 起動〜全操作で pageerror / console.error が 0', errs.length === 0,
    errs.slice(0, 5).join(' | '));

  // ══ §10 負のコントロール (変異側で同じ手順を流す) ═════════════════════════
  mark('負のコントロール (--mutate ' + MUTATE + ')');
  {
    const eM = [], wM = [];
    const pM = await bootPage(browser, 'http://localhost:' + (PORT + 1) + QT, wM, eM, DESKTOP);
    if (MUTATE === 'nope' || MUTATE === 'noclamp' || MUTATE === 'noarrowclamp' ||
        MUTATE === 'nofollow' || MUTATE === 'nogatetap') {
      await pM.evaluate(() => window.__graphRun.reveal('success'));
      await pM.evaluate(OPEN_CHOICE);
      await sleep(150);
    }
    if (MUTATE === 'nope') {
      const R = await pM.evaluate(() => window.__graphRun.arrows().map(a => a.pe));
      check('(10) 変異側では矢印の pointer-events が auto でない (= タップできない)',
        R.length > 0 && R.every(v => v !== 'auto'), R.join(' '));
    } else if (MUTATE === 'noclamp') {
      /* ⚠ 2026-08-07 (P5 前段): **測る画面を 390x844 へ、しかも「左へはみ出す状況」へ移した**。
       *   ① 部屋を可視域サイズへ縮めた結果、1280x800 では羊皮紙の自然位置が最初から画面内に
       *      収まり、クランプが**恒等操作**になる = 殺しても差が出ない (負のコントロールが静かに死ぬ)。
       *   ⚠⚠ ② **右へのはみ出しは幾何では検出できない**。.exitHint は position:absolute で
       *      width 指定が無いため、右側は shrink-to-fit で**幅が縮んで折り返す**だけで
       *      rect は画面内に留まる (実測: 幅 133 → 80 に潰れて right=390 ちょうど)。
       *      → **左端 (負の left) へはみ出す状況を作る**のが唯一確実な測り方。
       *   ③ そのために n4 へ **'right' で入って「引き返す」を西向きにし**、カメラを部屋の東端へ
       *      振る。西の矢印は縁クランプで x=8 に留まるが、羊皮紙は中央合わせなので
       *      x = 8 + 32 - 幅/2 が負になる。 */
      await pM.setViewport(IPHONE);
      await sleep(250);
      await pM.evaluate(async () => {
        const g = window.__graphRun;
        await g.enter('n4', 'right');                 // ★引き返す = 西 (部屋の西端)
        await g.reveal('success');
        g.choose();
      });
      await sleep(250);
      await pM.evaluate(() => {
        const [r1, c1, r2, c2] = ROOMS[0];
        playerX = c2 * TILE_SIZE; playerY = Math.floor((r1 + r2) / 2) * TILE_SIZE;
        for (const a of allies) { a.x = playerX; a.y = playerY; }
        snapCamera();
        window.__graphRun.reposition();
      });
      const R = await pM.evaluate(() => ({ a: window.__graphRun.arrows(), view: window.__graphRun.viewRect() }));
      /* ⚠ 判定は「クランプが保証する左端 (padL = view.x + 8) より左へ出たか」で見る。
       *   素の側は必ず padL ちょうどに置かれるので差は 12px 前後、画面外そのもの (view.x) で
       *   測るより余裕がある。実測: 素=8px / 変異=-4px (= 4px は本当に画面外)。 */
      const padL = R.view.x + 8;
      const escaped = R.a.filter(x => x.hintRect.x < padL - 0.6 ||
                                      x.hintRect.x + x.hintRect.w > R.view.x + R.view.w + 0.6);
      const offScreen = R.a.filter(x => x.hintRect.x < R.view.x - 0.6);
      check('(10) 変異側では狭幅で羊皮紙が左のクランプ境界を割り、画面外へはみ出す',
        escaped.length > 0 && offScreen.length > 0,
        'クランプ境界(padL=' + padL + ')より外=' + escaped.length + ' / 画面外=' + offScreen.length +
        ' / ' + R.a.length + ' view=' + JSON.stringify(R.view) +
        ' [' + R.a.map(x => x.dir + ' arrow@' + Math.round(x.left) + ' hint@' +
          Math.round(x.hintRect.x) + '+' + Math.round(x.hintRect.w)).join(' | ') + ']');
    } else if (MUTATE === 'noarrowclamp') {
      /* ★[P5 前段] 矢印の縁クランプを殺すと、狭幅で矢印が画面外へ消える (= 直した欠陥の再現)。 */
      await pM.setViewport(IPHONE);
      await sleep(250);
      await pM.evaluate(() => window.__graphRun.reposition());
      const R = await pM.evaluate(() => ({ a: window.__graphRun.arrows(), view: window.__graphRun.viewRect() }));
      const escaped = R.a.filter(x => x.left < R.view.x - 0.6 ||
                                      x.left + x.box.w > R.view.x + R.view.w + 0.6 ||
                                      x.top < R.view.y - 0.6 ||
                                      x.top + x.box.h > R.view.y + R.view.h + 0.6);
      check('(10) 変異側では狭幅で矢印が画面外へ消える (縁クランプが効いていない)',
        escaped.length > 0, 'はみ出し=' + escaped.length + '/' + R.a.length +
        ' view=' + JSON.stringify(R.view) +
        ' [' + escaped.map(x => x.dir + '@' + Math.round(x.left) + ',' + Math.round(x.top)).join(' ') + ']');
    } else if (MUTATE === 'nofollow') {
      /* ⚠ 2026-08-07 (P5 前段): 素の側 (§2) と**同じ画面 (390x844)・同じ振り方**にした。
       *   1280x800 では部屋が可視域に収まり MAP_USED クランプがカメラを 1 点へ固定するので、
       *   そもそもカメラが動かず「置き去り」を測れない (Δcam=0 で空振り)。 */
      await pM.setViewport(IPHONE);
      await sleep(250);
      const R = await pM.evaluate(() => {
        const g = window.__graphRun;
        const [r1, c1, r2, c2] = ROOMS[0];
        playerX = c1 * TILE_SIZE; playerY = Math.floor((r1 + r2) / 2) * TILE_SIZE;
        for (const a of allies) { a.x = playerX; a.y = playerY; }
        snapCamera();
        const cA = g.cam(), aA = g.arrows();
        playerX = c2 * TILE_SIZE;
        for (const a of allies) { a.x = playerX; a.y = playerY; }
        snapCamera();
        return { c1: cA, a1: aA, c2: g.cam(), a2: g.arrows() };
      });
      // ★上向きの矢印 (部屋の中央列 = 両端でクランプに掛からない) で測る
      const iUp = R.a1.findIndex(a => a.dir === 'up');
      check('(10) 変異側ではカメラを振っても矢印が置き去りになる',
        iUp >= 0 && Math.abs(R.c2.camX - R.c1.camX) > 100 &&
        Math.abs(R.a2[iUp].left - R.a1[iUp].left) < 0.51,
        'Δcam=' + Math.round(R.c2.camX - R.c1.camX) +
        ' Δarrow=' + (iUp >= 0 ? Math.round(R.a2[iUp].left - R.a1[iUp].left) : 'n/a'));
    } else if (MUTATE === 'nogatetap') {
      const R = await pM.evaluate(() => {
        document.querySelector('.exitArrow[data-to="n2"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return { gate: window.__graphRun.arrowGate() };
      });
      await sleep(120);
      const R2 = await pM.evaluate(() => ({ done: window.__pickDone }));
      check('(10) 変異側では表示直後の click が貫通して選択が確定してしまう',
        R2.done === true && R.gate === 0, 'gate=' + R.gate + ' done=' + R2.done);
    } else if (MUTATE === 'compactdialog') {
      /* ★[P5 前段] 旧 nocompact を置き換えた。旧仕様 (狭幅ならダイアログ) を 1 行で復活させると、
       *   390x844 で矢印が 0 本になる = **今回直した欠陥そのもの**が再現する。 */
      await pM.setViewport(IPHONE);
      await sleep(250);
      await pM.evaluate(() => window.__graphRun.reveal('success'));
      await pM.evaluate(OPEN_CHOICE);
      await sleep(150);
      const R = await pM.evaluate(() => {
        const dlg = document.getElementById('choiceDialog');
        return { compact: window.__graphRun.compact(),
                 arrows: document.querySelectorAll('.exitArrow').length,
                 dlg: !!(dlg && dlg.classList.contains('show')) };
      });
      check('(10) 変異側では 390x844 で矢印が 0 本になり #choiceDialog へ落ちる (= 直した欠陥の再現)',
        R.compact === true && R.arrows === 0 && R.dlg === true,
        'compact=' + R.compact + ' arrows=' + R.arrows + ' dialog=' + R.dlg);
    } else if (MUTATE === 'noautoguard') {
      const pMA = await bootPage(browser, 'http://localhost:' + (PORT + 1) + QT + '&autoplay=30',
                                 wM, eM, DESKTOP);
      const R = await pMA.evaluate(async () => {
        window.__graphRun.choose();                 // ★await しない (矢印なら永久に返らない)
        await new Promise(r => setTimeout(r, 200));
        return { arrows: document.querySelectorAll('.exitArrow').length };
      });
      check('(10) 変異側では ?autoplay でも矢印が生える (= 既存ドライバが選択で止まる)',
        R.arrows > 0, 'arrows=' + R.arrows);
      await pMA.close();
    } else if (MUTATE === 'bosslie') {
      const R = await pM.evaluate(async () => {
        const g = window.__graphRun;
        await g.enter('n1', 'up');
        g.clearHints();
        await g.reveal('fumble');
        return JSON.parse(JSON.stringify(g.hints()));
      });
      check('(10) 変異側ではファンブル時に boss 出口へ誤情報が出る',
        R.byExit.n3.wrong === true, 'wrong=' + R.byExit.n3.wrong + ' "' + R.byExit.n3.text + '"');
    }
    check('(10z) 変異側でも JS エラーは出ない (壊したのは 1 箇所だけ = 外科的)',
      eM.length === 0, eM.slice(0, 3).join(' | '));
    await pM.close();
  }

  await page.close();
  await browser.close();
  srvPure.close(); srvMut.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n[drv] ' + pass + '/' + results.length + ' PASS   (--mutate ' + MUTATE + ')');
  if (pass !== results.length) {
    console.log('[drv] FAILED:');
    for (const r of results) if (!r.ok) console.log('   - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
    process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
