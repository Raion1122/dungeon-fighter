#!/usr/bin/env node
/*
 * driver_graph_arrows.js — [P3 矢印 UI + ヒント文] 分岐マップの出口選択 UI 検証
 * ══════════════════════════════════════════════════════════════════════════════
 * 「ゲームブック風 分岐マップ」企画 P3 の完了条件を測る。P3 の主張は 6 つ:
 *
 *   ① 出口の矢印が **at タイルの真上**に出て、**カメラを動かしても追従する**
 *   ② 矢印も羊皮紙も **タップできる** (pointer-events: auto)
 *   ③ 羊皮紙は画面端でクランプされ、**必ず画面内に残る** (矢印が画面外へ出ても詰まない)
 *   ④ 知覚判定の 4 結果でヒントの解像度が変わり、**ファンブルでも boss 出口には嘘を出さない**
 *   ⑤ 狭幅端末 (390x844) では矢印を出さず #choiceDialog へフォールバックする
 *   ⑥ `?autoplay` では矢印を **1 つも作らない** (既存ドライバを止めない保証)
 *
 * ⭐ **負のコントロールを同一 run に内包**する。ポート P に素の index.html を、
 *    P+1 に「機構を 1 箇所だけ潰した変異版」を配り、同じ手順を両方に流す。
 *    素の側で「効いている」、変異側で「壊れる」が両方出て初めて、この検出器が本当に
 *    その機構を見ていることの証明になる。
 * ⭐ ⑤ は **同一 run の中で 1280x800 → 390x844 → 1280x800 と往復**して測る。
 *    「広い画面では矢印 / 狭い画面ではダイアログ」の両方が 1 回の実行で出るので、
 *    片方だけ測って「フォールバックしている」と誤読することがない。
 *
 * 変異 (--mutate、既定 nope):
 *   nope         … .exitArrow の pointer-events を none へ → 矢印がタップできない
 *   noclamp      … 羊皮紙のクランプを殺す                 → 画面外へ出て読めない
 *   nofollow     … renderWorld の追従ブロックを殺す        → カメラを振ると矢印が置き去り
 *   nocompact    … useCompactChoice を常に false へ        → 390x844 でも矢印が出る
 *   noautoguard  … chooseExit の ?autoplay ガードを外す    → autoplay で矢印が生える
 *   nogatetap    … ARROW_TAP_GATE を 0 へ                  → 表示直後の連打が貫通する
 *   bosslie      … boss 出口の誤情報ガードを外す           → ファンブルでボスに嘘が出る
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
  noclamp: ['        a.hintEl.style.left = Math.max(padL, Math.min(hx, vw - hw - 8)) + "px";',
            '        a.hintEl.style.left = hx + "px";   /* ★変異noclamp */'],
  nofollow: ['      if (exitArrowEls.length) updateExitArrowPositions();',
             '      if (false) updateExitArrowPositions();   /* ★変異nofollow */'],
  nocompact: ['      return !!(document.body && document.body.classList.contains("ui-compact"));',
              '      return false;   /* ★変異nocompact */'],
  noautoguard: ['      if (!window.__autoplay && !useCompactChoice()) return await showExitArrows(node, opts);',
                '      if (!useCompactChoice()) return await showExitArrows(node, opts);   /* ★変異noautoguard */'],
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

const DESKTOP = { width: 1280, height: 800 };
const IPHONE  = { width: 390,  height: 844 };

async function bootPage(browser, url, warns, errs, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport || DESKTOP);
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
  check('(1f) 矢印は 96px 角 (指で押せる最小 44px を超える)',
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
  mark('矢印の座標と カメラ追従');
  const expect = (a, cam) => ({
    left: a.at.tx * cam.tile + cam.tile / 2 - 48 - cam.camX,
    top:  a.at.ty * cam.tile + cam.tile / 2 - 48 - cam.camY,
  });
  {
    const okStatic = A1.arrows.every(a => {
      const e = expect(a, A1.cam);
      return Math.abs(a.left - e.left) < 0.51 && Math.abs(a.top - e.top) < 0.51;
    });
    check('(2a) 矢印のスクリーン座標が at タイル (tx*96+48-48-cam) と一致',
      okStatic, A1.arrows.map(a => a.to + ' L' + a.left + '/' + Math.round(expect(a, A1.cam).left)).join(' '));
    // ⚠ 静止画で一致していても「たまたまカメラが 0 だった」だけかもしれない → カメラを振って検算する
    const moved = await page.evaluate(() => {
      const g = window.__graphRun;
      // 部屋 [7,24,20,43] の西寄り → 東寄りへ主人公を飛ばし、カメラを追従させる
      playerX = 26 * TILE_SIZE; playerY = 13 * TILE_SIZE;
      for (const a of allies) { a.x = playerX; a.y = playerY; }
      snapCamera();
      const midCam = g.cam(), mid = g.arrows();
      playerX = 42 * TILE_SIZE; playerY = 18 * TILE_SIZE;
      for (const a of allies) { a.x = playerX; a.y = playerY; }
      snapCamera();
      return { midCam, mid, afterCam: g.cam(), after: g.arrows() };
    });
    check('(2b) ★カメラが実際に動いた (追従の検算が空振りでない証明)',
      Math.abs(moved.afterCam.camX - moved.midCam.camX) > 100,
      'camX ' + Math.round(moved.midCam.camX) + ' → ' + Math.round(moved.afterCam.camX));
    const okMid = moved.mid.every(a => Math.abs(a.left - expect(a, moved.midCam).left) < 0.51 &&
                                       Math.abs(a.top - expect(a, moved.midCam).top) < 0.51);
    const okAfter = moved.after.every(a => Math.abs(a.left - expect(a, moved.afterCam).left) < 0.51 &&
                                           Math.abs(a.top - expect(a, moved.afterCam).top) < 0.51);
    check('(2c) カメラを振った後も矢印が at タイルへ追従している (両地点で式が成立)',
      okMid && okAfter, 'mid=' + okMid + ' after=' + okAfter);
    // 追従の「量」も測る: 画面座標の変化は カメラ移動量の符号反転とちょうど一致する
    const dCam = moved.afterCam.camX - moved.midCam.camX;
    const dArr = moved.after[0].left - moved.mid[0].left;
    check('(2d) 画面座標の変化量が -Δcam とちょうど一致する (別要因で動いていない)',
      Math.abs(dArr + dCam) < 0.51, 'Δarrow=' + Math.round(dArr) + ' Δcam=' + Math.round(dCam));
  }

  // ══ §3 羊皮紙のクランプ ════════════════════════════════════════════════════
  mark('羊皮紙のクランプ (画面外へ出ない)');
  const C3 = await page.evaluate(() => {
    const g = window.__graphRun;
    return { cam: g.cam(), arrows: g.arrows(), padL: UI_MENU_WIDTH + 8 };
  });
  {
    const off = C3.arrows.filter(a => a.rect.y + a.rect.h < 0 || a.rect.y > C3.cam.vh ||
                                      a.rect.x + a.rect.w < 0 || a.rect.x > C3.cam.vw);
    check('(3a) ★この視点では矢印が 1 つ以上「画面外」にある (クランプを測る母集団がある)',
      off.length >= 1, '画面外=' + off.length + '/' + C3.arrows.length +
      ' vh=' + C3.cam.vh + ' hud=' + C3.cam.hud);
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

  // ══ §6 狭幅フォールバック (同一 run に負のコントロールを内包) ══════════════
  mark('狭幅フォールバック 1280x800 → 390x844 → 1280x800');
  await page.setViewport(IPHONE);
  await sleep(250);
  const F1 = await page.evaluate(() => ({ compact: window.__graphRun.compact(),
                                          cls: document.body.className }));
  check('(6a) 390x844 で body.ui-compact が付き useCompactChoice が true',
    F1.compact === true && /ui-compact/.test(F1.cls), 'compact=' + F1.compact);
  await page.evaluate(OPEN_CHOICE);
  await sleep(150);
  const F2 = await page.evaluate(() => {
    const dlg = document.getElementById('choiceDialog');
    return { arrows: document.querySelectorAll('.exitArrow').length,
             dlgShown: !!(dlg && dlg.classList.contains('show')),
             btns: dlg ? [].slice.call(dlg.querySelectorAll('button')).map(b => b.textContent) : [] };
  });
  check('(6b) ★狭幅では矢印を 1 つも作らない', F2.arrows === 0, 'arrows=' + F2.arrows);
  check('(6c) 代わりに #choiceDialog が開く', F2.dlgShown === true, 'shown=' + F2.dlgShown);
  check('(6d) ダイアログのラベルにも知覚判定のヒントが載る (矢印と情報が食い違わない)',
    F2.btns.some(t => t.indexOf('荒々しい声が聞こえる') >= 0 && t.indexOf('⚔') >= 0),
    F2.btns.join(' | ').slice(0, 140));
  await page.evaluate(() => {
    document.getElementById('choiceDialog').querySelectorAll('button')[0].click();
  });
  await sleep(80);
  const F3 = await page.evaluate(() => ({ done: window.__pickDone, pick: window.__pick }));
  check('(6e) ダイアログでも出口が選べる (フォールバックが飾りでない)',
    F3.done === true && !!F3.pick && !!F3.pick.to, 'pick=' + JSON.stringify(F3.pick));
  await page.setViewport(DESKTOP);
  await sleep(250);
  await page.evaluate(OPEN_CHOICE);
  await sleep(150);
  const F4 = await page.evaluate(() => {
    const dlg = document.getElementById('choiceDialog');
    return { compact: window.__graphRun.compact(),
             arrows: document.querySelectorAll('.exitArrow').length,
             dlg: !!(dlg && dlg.classList.contains('show')) };
  });
  check('(6f) ★1280x800 へ戻すと矢印に戻る (同一 run の中で両方の分岐が出た証明)',
    F4.compact === false && F4.arrows === 3 && F4.dlg === false,
    'compact=' + F4.compact + ' arrows=' + F4.arrows + ' dlg=' + F4.dlg);
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

  // ══ §9 エラーゼロ ═════════════════════════════════════════════════════════
  mark('エラーゼロ');
  check('(9a) 素の側: 起動〜全操作で pageerror / console.error が 0', errs.length === 0,
    errs.slice(0, 5).join(' | '));

  // ══ §10 負のコントロール (変異側で同じ手順を流す) ═════════════════════════
  mark('負のコントロール (--mutate ' + MUTATE + ')');
  {
    const eM = [], wM = [];
    const pM = await bootPage(browser, 'http://localhost:' + (PORT + 1) + QT, wM, eM, DESKTOP);
    if (MUTATE === 'nope' || MUTATE === 'noclamp' || MUTATE === 'nofollow' || MUTATE === 'nogatetap') {
      await pM.evaluate(() => window.__graphRun.reveal('success'));
      await pM.evaluate(OPEN_CHOICE);
      await sleep(150);
    }
    if (MUTATE === 'nope') {
      const R = await pM.evaluate(() => window.__graphRun.arrows().map(a => a.pe));
      check('(10) 変異側では矢印の pointer-events が auto でない (= タップできない)',
        R.length > 0 && R.every(v => v !== 'auto'), R.join(' '));
    } else if (MUTATE === 'noclamp') {
      const R = await pM.evaluate(() => ({ a: window.__graphRun.arrows(), cam: window.__graphRun.cam() }));
      const escaped = R.a.filter(x => x.hintRect.x < -0.6 || x.hintRect.x + x.hintRect.w > R.cam.vw + 0.6);
      check('(10) 変異側では羊皮紙が画面外へはみ出す', escaped.length > 0,
        'はみ出し=' + escaped.length + '/' + R.a.length);
    } else if (MUTATE === 'nofollow') {
      const R = await pM.evaluate(() => {
        const g = window.__graphRun;
        playerX = 26 * TILE_SIZE; playerY = 13 * TILE_SIZE;
        for (const a of allies) { a.x = playerX; a.y = playerY; }
        snapCamera();
        const c1 = g.cam(), a1 = g.arrows();
        playerX = 42 * TILE_SIZE; playerY = 18 * TILE_SIZE;
        for (const a of allies) { a.x = playerX; a.y = playerY; }
        snapCamera();
        return { c1, a1, c2: g.cam(), a2: g.arrows() };
      });
      check('(10) 変異側ではカメラを振っても矢印が置き去りになる',
        Math.abs(R.c2.camX - R.c1.camX) > 100 && Math.abs(R.a2[0].left - R.a1[0].left) < 0.51,
        'Δcam=' + Math.round(R.c2.camX - R.c1.camX) + ' Δarrow=' + Math.round(R.a2[0].left - R.a1[0].left));
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
    } else if (MUTATE === 'nocompact') {
      await pM.setViewport(IPHONE);
      await sleep(250);
      await pM.evaluate(() => window.__graphRun.reveal('success'));
      await pM.evaluate(OPEN_CHOICE);
      await sleep(150);
      const R = await pM.evaluate(() => ({ compact: window.__graphRun.compact(),
                                           arrows: document.querySelectorAll('.exitArrow').length }));
      check('(10) 変異側では 390x844 でも矢印が出てしまう (フォールバックが死んでいる)',
        R.compact === false && R.arrows === 3, 'compact=' + R.compact + ' arrows=' + R.arrows);
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
