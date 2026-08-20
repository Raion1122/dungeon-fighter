#!/usr/bin/env node
/*
 * driver_diag_watchdog.js — 自動デバッグの「詰み検出」の検証ドライバ (2026-08-20)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 何を直したか
 *   index.html の自動デバッグ (setupDiagnostics) は、ランの打ち切りを
 *   **実時間 4 分の固定上限** (`manageCampaign` の `nowMs() - startMs > 240000`) で
 *   判定していた。廃坑が P8/P9 (2026-08-20) で 33x22 + 39x23 の大部屋 2 枚へ畳まれてから、
 *   健全なランでも **181〜286 秒**かかる (実測 6 本: 168/181/191/213/264/286) ため、
 *   分布が上限をまたいで **同じツリーで鳴ったり鳴らなかったり**していた
 *   (driver_grid_p8 の (E2) の既存の赤)。さらに巡回 (?autodebug) では廃坑が毎回
 *   4 分で abort され、シナリオ1 のクリアを一度も観測できなかった。
 *
 *   ⭐⭐⭐ 窓を伸ばすのではなく、**何を測りたかったのか**へ言い直した:
 *     - `run-timeout` (critical) = 「**進行が止まった**」。進行 = タイル / 生存敵数 /
 *       ラウンド / ノード / XP / 金貨 のいずれかが動くこと。対話・ナレ・結果表示の間は
 *       時計を止める (ゲーム時間そのものが止まっているので「進んでいない」ではない)。
 *     - 絶対上限は「**巡回が次のランへ進めること**」だけの装置なので巡回中だけ効かせ、
 *       欠陥ではなく予算切れなので `run-budget` (warn) として記録する。
 *
 * ■ このドライバが測るもの (目的 = 「遅い」と「詰んだ」を取り違えないこと)
 *   §1 素        : 廃坑の実プレイが critical 0 件で完走する      (目的そのもの)
 *   §2 oldwindow : 実時間で測った瞬間に鳴る                      (直したのが測り方であることの証明)
 *   §3 freeze    : 本当に止めたら鳴る                            (詰みを今も捕まえる)
 *   §4 slowloop  : 詰みの窓の何倍も長く走っても、進行している限り鳴らない
 *   §5 budgetfast: 巡回の予算超過は warn であって critical ではない
 *   §6 combatfast: 長い戦闘 (combat-stall) も warn であって critical ではない
 *   §7 runawayfast: ただし「終わらない戦闘」はラウンド数で critical になる
 *
 *   ⭐ combat-stall も **45 秒の固定窓**で「無限ループ疑い」を critical にしていた。
 *     卓上グリッドの大部屋では健全な戦闘でも 45 秒を超え、廃坑 8 本中 1〜2 本で鳴って
 *     (E2) を**間欠的に**赤くしていた (2026-08-20 実測)。同じ作法で warn へ降ろした。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate     | 注入する欠陥                                   | 赤くなるべき節
 *   PORT   | (素)       | —                                              | —
 *   PORT+1 | oldwindow  | 詰み判定の分母を lastProgressMs → startMs へ   | §2 (旧実装の再現)
 *   PORT+2 | freeze     | moveEnemies を常に早期 return (ゲーム時間停止)  | §3
 *   PORT+3 | slowloop   | ゲームループを 1 ティックおきに間引き半速へ     | §4
 *   PORT+4 | combatfast | 「戦闘が長い」の目安 45 秒 → 5 秒               | §6
 *   PORT+5 | runawayfast| 「終わらない戦闘」の目安 100 ラウンド → 2       | §7
 *   PORT+6 | budgetfast | 巡回の予算 10 分 → 15 秒                        | §5
 *
 * 使い方:
 *   node tools/driver_diag_watchdog.js
 *   node tools/driver_diag_watchdog.js --quick   (§1 と §4 の長い実プレイを飛ばす)
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
const QUICK = flag('quick');
/* ⚠ ポートは既存ドライバと 4 以上空ける。本ドライバは PORT..PORT+6 の 7 本を掴む。
 *   9070-9076 が未使用であることは既存ドライバの --port 既定値一覧で実測 (2026-08-20)。 */
const PORT = parseInt(arg('port', '9070'), 10);
const SCEN = arg('scen', 'goblin-mine');
/* ⚠ 旧実装のハード上限。ここは「跨いだか」を測るためだけに使う定数で、実装からは既に消えている。 */
const OLD_CAP_MS = 240000;

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
// ⚠ 置換後の長さを 1 文字以上ずらすこと ((0b) がバイト長で「同じ物を 2 回測っていない」を見る)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ★旧実装の再現。分母を「最後に進行した時刻」から「ラン開始時刻」へ戻すと、
   *   同じ閾値がそのまま **実時間の固定上限**になる (= 直す前の測り方)。 */
  oldwindow: [
    '        const stuckMs = nowMs() - beats.lastProgressMs;',
    '        const stuckMs = nowMs() - report.current.startMs;   /* mut-oldwindow = 旧: 実時間の固定上限 */'],
  /* ★ゲーム時間を完全に止める = 凍結の再現。beat("tick") はこの行より前にあるので、
   *   診断側の時計は動いたまま「何も進まない」状態になる。 */
  freeze: [
    '      if (dialogPaused || narrationHold || narrationPlaying) return;   // 対話/ナレ表示中はゲーム時間停止',
    '      if (true) return;   /* mut-freeze = ゲーム時間を止める (凍結の再現) */'],
  /* ★ゲームループを 1 ティックおきに間引く = 「長いが進行はしている」ランを決定論的に作る。
   * ⚠⚠⚠ **歩行速度 (mouseMoveSpeed) は実時間のレバーではない** (2026-08-20 に 2 度空振り)。
   *   2.4 → 1.0 で 169s → 210s (+24% だけ)、2.4 → 0.3 では逆に **165s と短くなった**
   *   (mouseMoveSpeed はリーダー専用で、仲間と戦闘の進行はそのままだから)。
   *   → 測りたいのは「実時間が長いラン」なので、**ゲーム時間そのものを半速**にする。
   *   ⚠ beat("tick") はこの行の**前**にあるので、診断側の時計は等速のまま (frame-lag は鳴らない)。 */
  slowloop: [
    '      if (window.__diag) window.__diag.beat("tick");   // 自動デバッグ: フレーム落ち計測',
    '      if (window.__diag) window.__diag.beat("tick"); if ((window.__slowloop = (window.__slowloop | 0) + 1) % 2) return;   /* mut-slowloop = ゲーム時間を半速へ */'],
  /* ★「戦闘が長い」の目安を 45 秒 → 5 秒へ。廃坑は最初の戦闘に 30 秒ほどで入るので、
   *   combat-stall を**決定論的に**発火させられる (素の 45 秒では 8 本に 1〜2 本しか鳴らない)。 */
  combatfast: [
    '      const COMBAT_LONG_MS = 45000;',
    '      const COMBAT_LONG_MS = 5000;   /* mut-combatfast */'],
  /* ★「戦闘が終わらない」の目安を 100 ラウンド → 2 ラウンドへ。廃坑の最初の戦闘で
   *   必ず 3 ラウンド目に入るので、combat-runaway を決定論的に発火させられる。 */
  runawayfast: [
    '      const COMBAT_RUNAWAY_ROUNDS = 100;',
    '      const COMBAT_RUNAWAY_ROUNDS = 2;   /* mut-runawayfast */'],
  budgetfast: [
    '      const RUN_BUDGET_MS = 600000;',
    '      const RUN_BUDGET_MS = 15000;   /* mut-budgetfast */'],
};
const MUT_ORDER = ['oldwindow', 'freeze', 'slowloop', 'combatfast', 'runawayfast', 'budgetfast'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const SRC_INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MUT_SRC = {};
for (const k of MUT_ORDER) {
  const from = MUTATIONS[k][0], to = MUTATIONS[k][1];
  if (from.indexOf('\n') >= 0) {
    console.error('[drv] 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  const n = SRC_INDEX.split(from).length - 1;
  if (n !== 1) {
    console.error('[drv] 変異 ' + k + ' の置換対象が ' + n + ' 箇所 → 負のコントロールが空振りする: '
      + JSON.stringify(from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = SRC_INDEX.split(from).join(to);
}
/* ★閾値は**実装から読む** (ドライバが写経すると、実装だけ変わったときに黙って空振りする)。
 *   読めなければ装置の故障として落とす。 */
const STUCK_M = SRC_INDEX.match(/const STUCK_ABORT_MS = (\d+);/);
if (!STUCK_M) {
  console.error('[drv] index.html から STUCK_ABORT_MS を読めない (実装の名前が変わった?)');
  process.exit(3);
}
const STUCK_MS = parseInt(STUCK_M[1], 10);

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
  const cands = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置くこと。helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて **全 500** になり、症状は「シームが undefined」に見える。 */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (mutKey && u === '/index.html') {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey]); return;
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
  results.push({ name: name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmt = (recs) => recs.map(r => r.t + 's:' + r.sev[0] + ':' + r.id).join(' ') || 'なし';

// ══════════════════════════════════════════════════════════════════════════════
// 実プレイの観測 (1 ページ = 1 ラン)
//  ⚠⚠ ポーリングは **1 秒間隔**。150ms ごとの page.evaluate はページのメインループを
//    圧迫し、同じ構成でも完走しなくなる (2026-08-20 実測。= 測定器が測定対象を遅くする)。
// ══════════════════════════════════════════════════════════════════════════════
async function watch(browser, port, query, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const recs = [];
  const t0 = Date.now();
  const at = () => Math.round((Date.now() - t0) / 1000);
  page.on('pageerror', e => recs.push({ t: at(), sev: 'critical', id: 'js-error', text: e.message.slice(0, 140) }));
  page.on('console', m => {
    const t = m.text();
    if (/Failed to load resource/i.test(t)) return;
    const mm = t.match(/\[DIAG\]\[([^\]]+)\]/);
    if (mm) recs.push({ t: at(), sev: (m.type() === 'error' ? 'critical' : 'warn'), id: mm[1], text: t.slice(0, 140) });
    else if (m.type() === 'error') recs.push({ t: at(), sev: 'critical', id: 'console-error', text: t.slice(0, 140) });
  });
  await page.evaluateOnNewDocument((scen) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', scen);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    /* ⚠ 前のランのレポート/巡回状態を持ち越さない (totals が混ざると読めなくなる)。 */
    try { localStorage.removeItem('dragonfighters.debugReport'); } catch (e) {}
    try { localStorage.removeItem('dragonfighters.debugCampaign'); } catch (e) {}
  }, opts.scen || SCEN);
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  /* ⚠⚠ startGame() を通さないと gameStarted が立たず、runChecks が丸ごと沈黙する。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });

  const tiles = new Set();
  let last = null, moves = 0, prevKey = null;
  /* ★「無進行の最長」も一緒に採る。これが詰みの窓より短いことを見せられれば、
   *   「鳴らなかった」の理由が**機構として**説明できる (たまたま鳴らなかった、ではない)。
   * ⚠ 1 秒ポーリングなので実装 (500ms 刻み) より粗い = 上振れしない安全側の見積り。 */
  let gapStart = Date.now(), maxGapMs = 0, prevProg = null;
  for (;;) {
    try {
      last = await page.evaluate(() => ({
        tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE),
        alive: enemies.filter(e => e.alive).length,
        /* ⚠⚠⚠ `window.` を付けてはいけない。index.html は classic script なので直下の
         *   `let dungeonCleared` は window に載らない (= 永久に undefined で偽の赤)。 */
        cleared: !!dungeonCleared, over: !!gameOver,
      }));
    } catch (e) { break; }   // 巡回のページ遷移中は evaluate が落ちる (想定内)
    const key = last.tx + ',' + last.ty;
    const progKey = key + '/' + last.alive;
    tiles.add(key);
    if (prevKey !== null && key !== prevKey) moves++;
    if (prevProg === null || progKey !== prevProg) {
      const gap = Date.now() - gapStart;
      if (prevProg !== null && gap > maxGapMs) maxGapMs = gap;
      gapStart = Date.now(); prevProg = progKey;
    } else if (Date.now() - gapStart > maxGapMs) {
      maxGapMs = Date.now() - gapStart;
    }
    prevKey = key;
    if (last.cleared || last.over) break;
    if (opts.until && opts.until(recs, at())) break;
    if (Date.now() - t0 >= opts.timeoutMs) break;
    await sleep(1000);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  await page.close().catch(() => {});
  console.log('[drv]   (参考) :' + port + ' ' + secs + 's / 踏んだタイル ' + tiles.size +
    ' 種 / タイルが変わった回数 ' + moves + ' / 無進行の最長 ' + Math.round(maxGapMs / 1000) +
    's / cleared=' + (last && last.cleared) + ' / 記録 ' + fmt(recs));
  return { secs: secs, recs: recs, last: last, tiles: tiles.size, moves: moves, maxGapMs: maxGapMs };
}
const hasId = (recs, id) => recs.filter(r => r.id === id);
const criticals = (recs) => recs.filter(r => r.sev === 'critical');

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_diagwd_');
  const browserPath = findBrowser();
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   ' +
    MUT_ORDER.map(k => 'mutate ' + k + ':' + PORT_OF[k]).join(' / '));
  console.log('[drv]   実装から読んだ STUCK_ABORT_MS = ' + STUCK_MS + 'ms / 旧ハード上限 = ' + OLD_CAP_MS + 'ms');

  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  try {
    // ══ §0 装置: 変異が素の配信に無く、変異ポートにだけ載っている ══════════════
    mark('§0 変異が素の配信に無く、変異ポートにだけ載っていること');
    {
      const get = (port) => new Promise((res, rej) => {
        http.get('http://localhost:' + port + '/index.html', r => {
          let b = ''; r.setEncoding('utf8');
          r.on('data', c => b += c); r.on('end', () => res(b));
        }).on('error', rej);
      });
      const pure = await get(PORT);
      for (const k of MUT_ORDER) {
        const from = MUTATIONS[k][0], to = MUTATIONS[k][1];
        const body = await get(PORT_OF[k]);
        check('(0a-' + k + ') 素には注入文字列が無く、変異側にはちょうど 1 つある',
          pure.indexOf(to) < 0 && body.indexOf(from) < 0 && body.split(to).length - 1 === 1,
          'pure{to:' + (pure.indexOf(to) >= 0) + '} mut{from:' + (body.indexOf(from) >= 0) +
          ',to:' + (body.split(to).length - 1) + '}');
        check('(0b-' + k + ') 素と変異でバイト長が違う (同じ物を 2 回測っていない)',
          pure.length !== body.length, '素=' + pure.length + 'B / 変異=' + body.length + 'B');
      }
      check('(0c-装置) 詰みの窓は旧ハード上限より短い (詰みをより速く捕まえる)',
        STUCK_MS < OLD_CAP_MS, STUCK_MS + 'ms < ' + OLD_CAP_MS + 'ms');
    }

    // ══ §3 freeze: 本当に止めたら鳴る ════════════════════════════════════════
    /* ⚠ 先に短い節から回す。長い実プレイ (§1/§4) で時間を使い切っても、
     *   検出器そのものが生きていることは先に分かる。 */
    mark('§3 freeze → ゲーム時間を止めたら詰みとして鳴る (最大 ' +
      Math.round((STUCK_MS + 45000) / 1000) + '秒)');
    const fr = await watch(browser, PORT_OF.freeze, '?autoplay=30&intel=0',
      { timeoutMs: STUCK_MS + 45000, until: (recs) => hasId(recs, 'run-timeout').length > 0 });
    const frRT = hasId(fr.recs, 'run-timeout');
    check('(3a) 凍結させたら run-timeout が critical で鳴る',
      frRT.length > 0 && frRT[0].sev === 'critical', fmt(fr.recs));
    check('(3b) 鳴った時刻が詰みの窓 (' + Math.round(STUCK_MS / 1000) + '秒) の前後 20 秒に収まる',
      frRT.length > 0 && Math.abs(frRT[0].t - STUCK_MS / 1000) <= 20,
      frRT.length ? frRT[0].t + 's' : 'なし');
    check('(3c-装置) 凍結では探索停滞 stall も鳴っている (本当に止まっている)',
      hasId(fr.recs, 'stall').length > 0, fmt(fr.recs));
    check('(3d-装置) 主人公は 1 度もタイルを移っていない',
      fr.moves === 0 && fr.tiles === 1, 'タイル ' + fr.tiles + ' 種 / 移動 ' + fr.moves + ' 回');

    // ══ §2 oldwindow: 実時間で測った瞬間に鳴る ═══════════════════════════════
    mark('§2 oldwindow → 分母を実時間へ戻すと、健全なランでも鳴る (最大 ' +
      Math.round((STUCK_MS + 45000) / 1000) + '秒)');
    const ow = await watch(browser, PORT_OF.oldwindow, '?autoplay=30&intel=0',
      { timeoutMs: STUCK_MS + 45000, until: (recs) => hasId(recs, 'run-timeout').length > 0 });
    const owRT = hasId(ow.recs, 'run-timeout');
    check('(2a) ★実時間で測ると、進行しているランでも run-timeout が鳴る',
      owRT.length > 0, fmt(ow.recs));
    check('(2b-装置) その間ランは進行していた (止まったから鳴ったのではない)',
      ow.moves >= 5 && ow.tiles >= 5, 'タイル ' + ow.tiles + ' 種 / 移動 ' + ow.moves + ' 回');

    // ══ §5 budgetfast: 巡回の予算超過は warn ═════════════════════════════════
    mark('§5 budgetfast → 巡回の予算超過は critical ではなく warn (最大 60 秒)');
    const bf = await watch(browser, PORT_OF.budgetfast,
      '?autodebug=2&scen=' + SCEN + '&autoplay=30&intel=0',
      { timeoutMs: 60000, until: (recs) => hasId(recs, 'run-budget').length > 0 });
    const bfRB = hasId(bf.recs, 'run-budget');
    check('(5a) ★巡回の予算超過は run-budget として記録される',
      bfRB.length > 0, fmt(bf.recs));
    check('(5b) ★それは warn であって critical ではない (遅いことは欠陥ではない)',
      bfRB.length > 0 && bfRB.every(r => r.sev === 'warn'), fmt(bf.recs));
    check('(5c-装置) 予算超過だけで critical は 1 件も出ていない',
      criticals(bf.recs).length === 0, fmt(bf.recs));

    // ══ §6 combatfast: 長い戦闘は critical ではない ══════════════════════════
    /* ⭐ run-timeout と**同じ形の罠**が combat-stall にもあった (45 秒の固定窓で
     *   「無限ループ疑い」を critical にしていた)。大部屋の戦闘は健全でも 45 秒を超える。 */
    mark('§6 combatfast → 長い戦闘は warn であって critical ではない (最大 90 秒)');
    const cf = await watch(browser, PORT_OF.combatfast, '?autoplay=30&intel=0',
      { timeoutMs: 90000, until: (recs) => hasId(recs, 'combat-stall').length > 0 });
    const cfCS = hasId(cf.recs, 'combat-stall');
    check('(6a-装置) 目安を 5 秒へ縮めたら combat-stall が記録される (検出器は生きている)',
      cfCS.length > 0, fmt(cf.recs));
    check('(6b) ★長い戦闘は warn であって critical ではない',
      cfCS.length > 0 && cfCS.every(r => r.sev === 'warn'), fmt(cf.recs));
    check('(6c-装置) その間 critical は 1 件も出ていない',
      criticals(cf.recs).length === 0, fmt(cf.recs));

    // ══ §7 runawayfast: 終わらない戦闘はラウンド数で critical ════════════════
    /* ⭐ §6 で combat-stall を warn へ降ろしたぶんの穴埋めが効いていることを見る。
     *   ⚠ ここは**実時間ではなくラウンド数**で測る (機械の速さに依存しない物差し)。 */
    mark('§7 runawayfast → 終わらない戦闘はラウンド数で critical になる (最大 90 秒)');
    const rw = await watch(browser, PORT_OF.runawayfast, '?autoplay=30&intel=0',
      { timeoutMs: 90000, until: (recs) => hasId(recs, 'combat-runaway').length > 0 });
    const rwCR = hasId(rw.recs, 'combat-runaway');
    check('(7a) ★終わらない戦闘は combat-runaway として critical で鳴る',
      rwCR.length > 0 && rwCR.every(r => r.sev === 'critical'), fmt(rw.recs));

    if (!QUICK) {
      // ══ §4 slowhero: 長いだけでは鳴らない ══════════════════════════════════
      /* ⭐⭐⭐ ここで測るのは「**詰みの窓より遥かに長く走っても、進行している限り鳴らない**」。
       * ⚠⚠ 初版は「旧ハード上限 240 秒を跨いだか」を装置 assert にしていたが、**2 度空振りした**
       *   (歩行速度 8 倍遅く → 165s、ゲームループ半速 → 205s。廃坑の実時間は主ループの歩行が
       *   支配していない)。そもそも 240 という閾値は**実装からもう消えている**ので、跨いだ跨がない
       *   は現在の実装について何も測っていなかった。「旧実装ならここで鳴った」は §2 (oldwindow) が
       *   90 秒で決定論的に証明している。→ 期待値ではなく**測定点**を実装の物差し (詰みの窓) へ移す。 */
      mark('§4 slowloop → 詰みの窓 (' + Math.round(STUCK_MS / 1000) +
        '秒) の何倍も長く走っても、進行している限り鳴らない (最大 360 秒)');
      const sh = await watch(browser, PORT_OF.slowloop, '?autoplay=30&intel=0',
        { timeoutMs: 360000 });
      check('(4a-装置) ランは詰みの窓の 1.5 倍以上の実時間を走った',
        sh.secs * 1000 >= STUCK_MS * 1.5, sh.secs + 's >= ' + (STUCK_MS * 1.5 / 1000) + 's');
      /* ⚠ 全滅で早く終わると (4a) が落ちるが、真因は別 (母集団の故障)。
       *   どちらなのかが出力から読めるように、全滅していないことを別の assert で持つ。 */
      check('(4d-装置) 全滅で早く終わったのではない',
        !!(sh.last && sh.last.over === false), JSON.stringify(sh.last));
      check('(4b-装置) その間ずっと進行していた (タイルが動き続けた)',
        sh.moves >= 20, 'タイル ' + sh.tiles + ' 種 / 移動 ' + sh.moves + ' 回');
      /* ★「鳴らなかった」の理由を機構として示す: 無進行の最長が窓より短かったから。 */
      check('(4e-装置) 観測した無進行の最長が詰みの窓より短い',
        sh.maxGapMs < STUCK_MS, Math.round(sh.maxGapMs / 1000) + 's < ' + (STUCK_MS / 1000) + 's');
      check('(4c) ★★長いだけのランでは run-timeout が鳴らない',
        hasId(sh.recs, 'run-timeout').length === 0, fmt(sh.recs));

      // ══ §1 素: 目的そのもの ════════════════════════════════════════════════
      mark('§1 素 → 廃坑の実プレイが critical 0 件で完走する (最大 360 秒)');
      const base = await watch(browser, PORT, '?autoplay=30&intel=0', { timeoutMs: 360000 });
      check('(1a) ★★実プレイがクリアまで到達する',
        !!(base.last && base.last.cleared), JSON.stringify(base.last) + ' ' + base.secs + 's');
      check('(1b) ★★critical の記録が 0 件 (driver_grid_p8 の (E2) と同じ目的)',
        criticals(base.recs).length === 0, fmt(base.recs));
      check('(1c-装置) 素のランは 150 秒以上かかった (短くて当たり前の母集団ではない)',
        base.secs >= 150, base.secs + 's');
    }
  } catch (e) {
    check('(FATAL) ドライバが例外なく完走する', false, e && e.message);
  } finally {
    await browser.close().catch(() => {});
    for (const s of servers) s.close();
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n════════════════════════════════════════');
  console.log('  PASS ' + pass + ' / FAIL ' + (results.length - pass));
  console.log('════════════════════════════════════════');
  if (pass !== results.length) {
    console.log('FAILED:');
    for (const r of results) if (!r.ok) console.log('   - ' + r.name + '  — ' + r.detail);
  }
  process.exit(pass === results.length ? 0 : 1);
})();
