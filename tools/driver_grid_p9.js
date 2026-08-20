#!/usr/bin/env node
/*
 * driver_grid_p9.js — 卓上グリッド P9「大部屋の中の行かない小部屋へ寄り道」の検証ドライバ (2026-08-20)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 何を入れたか
 *   廃坑 n1「坑道の奥」(39x23 = 床 488 マス) は、入場 (21,11) → 玉座 (49,21) の実経路が
 *   **40 歩 / 41 マス**しかなく、床の 58% が本道から 4 マス超はなれていた。
 *   4 方向で孤立している床は 0 マス = 物理的には全部歩けるので、原因は経路探索ではなく
 *   **目標決定** (1 ノード = 1 部屋 → heroAI の「未訪問の部屋へ」が永久に -1)。
 *   → 既存の出口矢印 UI へ**同じノード内の目的地**を 4 つ渡し、
 *     「◆ 4 本 + ▶ 奥へ進む」の 5 本を出す。**行っても行かなくてもよい**(強制巡回にしない)。
 *     各スポットには宝箱を 1 個ずつ置いた (廃坑は 2026-08-19 の n2/n3 撤去以来 宝箱 0 個だった)。
 *
 * ■ ⭐⭐⭐ この作業で実際に踏んだ罠 = §3 の (3z) が測るもの
 *   `findNearestDrop()` は **未開封で見えている roomChests もナビ目標に含む**。
 *   これは heroAI の ②「敵なし → まずドロップを回収」の目標決定そのものなので、
 *   hidden:false の宝箱を素で置くと **矢印を出す前にパーティが 4 個とも自動で回収しにいく**
 *   = ユーザーが明示的に却下した「強制巡回」になり、企画が丸ごと消える。
 *   さらに isNodeSettled() / hasPendingDetour() も「落し物あり」で永久に偽になるので、
 *   **寄り道の選択肢も出口も一度も出ない**。→ 寄り道の箱に detourSpot の印を付け、
 *   findNearestDrop から外した。負のコントロール navchest がこの 1 行を殺す。
 *
 * ■ 測る順序の方針
 *   §0 装置 → §1 台帳が実タイルか (本番の aStar で測る) → §5a ボス早鳴りの幾何 →
 *   §3 矢印 UI → §2 恒等 (撤退スイッチ / 旧経路 / 他シナリオ / 旧単一マップ / dev シーム) →
 *   §4+§5b 1 周が詰まないか (autoplay。目的そのもの) → §6 再入場 (その周回結果を使う)。
 *
 * ■ ⚠⚠ 「4 か所すべて回れる」は要求しない
 *   s4 (南の操車場) へ下る道は**玉座の間の口を最接近 10 マスで横切る**。帯 (8 マス) の外なので
 *   ボス到達ナレは鳴らないが、グリクスが自分から出てきて交戦が始まることがある
 *   (2026-08-20 実測。巡回順 16 通りを全部測っても消えない経路の性質)。欠陥ではなく創発なので
 *   s4 の羊皮紙にその旨を書いてある。§4a は「回れなかった理由がそれか」を測る。
 *   「構造的に届くか」は §1c/§1e が本番の aStar で決定論的に押さえている。
 *
 *   ⭐ §1 は **本番の `aStar` をそのまま呼ぶ**。自前 BFS を書くと 8 方向で繋いでしまい
 *     「実際には歩けない道」を繋がっていると報告する (P8 で実測済み)。さらに
 *     **外周 1 タイルを avoidTiles で禁止**する — 1 枚絵の作法①で外周は必ず空くので、
 *     禁止しないと内部を全部塞いでも外周でぐるり繋がり永久に緑になる。
 *   ⭐ §3 の位置は「式を写経しない」。矢印と羊皮紙が **viewRect の中に収まっている**
 *     (= 縁クランプの目的そのもの) と **羊皮紙どうしが重なっていない**
 *     (= 下敷きになった選択肢が押せない、という欠陥の不在) を測る。
 *   ⭐ §4 の「詰まない」は手段ではなく **目的 (dungeonCleared に到達したか)** で測る。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate    | 注入する欠陥                                          | 赤くなるべき節
 *   PORT   | (素)      | —                                                     | —
 *   PORT+1 | nodetour  | detourNodeDef を常に null (寄り道が丸ごと死ぬ)        | §1 §3
 *   PORT+2 | foldleak  | ?minefold=0 でも寄り道を出す (旧経路の母集団が動く)   | §2
 *   PORT+3 | navchest  | 寄り道の箱を findNearestDrop へ戻す (自動巡回に戻る)  | §3
 *   PORT+4 | spotsouth | s3 を (43,7) → (44,13) = 玉座から 8 マスの帯の中      | §1e §5a
 *
 * 使い方:
 *   node tools/driver_grid_p9.js
 *   node tools/driver_grid_p9.js --no-full     (§4 の autoplay 1 周と、その結果を使う §6 を飛ばす)
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
const NO_FULL = flag('no-full');
/* ⚠ ポートは既存ドライバと 4 以上空ける。本ドライバは PORT..PORT+4 の **5 本**を掴む。
 *   9060-9064 が未使用であることは既存ドライバの --port 既定値一覧で実測 (2026-08-20。
 *   9050-9057 は driver_grid_p8 が掴む)。 */
const PORT = parseInt(arg('port', '9060'), 10);
/* ⚠ §4 は 4 か所を全部回るので **直行 (P8 実測 184s) の 3 倍近くかかる**
 *   (2026-08-20 実測: 4 か所を全部回って玉座へ着くまで **約 510s**、撃破まで含めて 560s 前後)。
 *   上限を短くすると「詰んだ」ではなく「まだ歩いている」で赤くなる = 測りたいものと
 *   別の理由で色が決まる。
 * ⚠ ゲーム内蔵の自動デバッグは 240s で run-timeout を critical に記録するが、
 *   window.__autodebug が無い単発 ?autoplay では **advanceCampaignAndNavigate が
 *   即 return する = ランは止まらない** (2026-08-20 に実測)。記録だけ残る。 */
const FULL_TIMEOUT_MS = parseInt(arg('fulltimeout', '780000'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
// ⚠ 置換後の長さを 1 文字以上ずらすこと ((0b) がバイト長で「同じ物を 2 回測っていない」を見る)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  nodetour: [
    '      if (DETOUR_OFF || MINE_FOLD_OFF) return null;',
    '      if (true) return null;   /* mut-nodetour */'],
  foldleak: [
    '      if (DETOUR_OFF || MINE_FOLD_OFF) return null;',
    '      if (DETOUR_OFF) return null;   /* mut-foldleak */'],
  navchest: [
    '          if (chest.detourSpot) continue;',
    '          if (false) continue;   /* mut-navchest */'],
  /* s3 を **玉座から 8 マスの帯の中** (44,13) へ動かす。①スポット自身の距離 (§5a) と
   * ②そこへ至る経路が帯を通らないこと (§1e) の**両方**を赤くする。
   * ⚠ (44,13) は絵のマスクで床。壁へ動かすと「届かない」で赤くなってしまい、
   *   測りたい「近すぎる」とは別の理由で緑/赤が決まる。 */
  spotsouth: [
    '              { key: "s3", name: "北の横穴",     at: [43, 7],  dir: "right",',
    '              { key: "s3", name: "北の横穴",     at: [44, 13],  dir: "right",  /* mut-spotsouth */'],
};
const MUT_ORDER = ['nodetour', 'foldleak', 'navchest', 'spotsouth'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const SRC_INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MUT_SRC = {};
for (const k of MUT_ORDER) {
  const from = MUTATIONS[k][0], to = MUTATIONS[k][1];
  if (from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  const n = SRC_INDEX.split(from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + n + ' 箇所 → 負のコントロールが空振りする: '
      + JSON.stringify(from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = SRC_INDEX.split(from).join(to);
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

async function bootPage(browser, port, query, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: opts.vw || 1280, height: opts.vh || 900 });
  page.on('pageerror', e => errs.push('[:' + port + '] PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('[:' + port + '] CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((scen) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', scen);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, opts.scen || 'goblin-mine');
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function' && typeof isTileWall === 'function'",
    { timeout: 25000 });
  /* ⚠⚠ **startGame() を通さないと検出器が丸ごと沈黙する**。tickNodeChoice も applyNodeZoom も
   *   gameStarted / 開始画面の後ろにあり、通さないと camZ=1 のままになる (P7 で誤読しかけた)。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await sleep(300);
  return page;
}
/* 開いているダイアログ / 判定パネルを閉じる。
 * ⚠ n1 到着直後は EV-5 / 出口ヒントの知覚判定が開くので、これを通さないと
 *   tickNodeChoice が dialogPaused で早期 return し続け、**矢印が永久に 0 本**に見える。 */
async function closeDialogs(page) {
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) return true;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
      if (btns.length) btns[btns.length - 1].click();   // 末尾 = キャンセル (Esc と同じ経路)
      /* ⚠⚠ 技能判定は **#skillCheckOverlay** で、閉じるのはオーバーレイ自身の click ハンドラ
       *   (js/skill-check.js:447)。#choiceDialog だけを閉じていると、寄り道の宝箱が施錠
       *   (CHEST_LOCK_CHANCE=0.8) だったときにパネルが開きっぱなしになり、
       *   dialogPaused で heroAI ごと止まって**到達検出が永久に走らない** (2026-08-20 に踏んだ)。 */
      const ov = document.getElementById('skillCheckOverlay');
      if (ov && ov.classList.contains('show')) {
        const rb = document.getElementById('scRollBtn');
        if (rb) rb.click();
        ov.click();
      }
      document.body.click();
    });
    await sleep(350);
  }
  return await page.evaluate(() => !skillCheckActive && !dialogPaused);
}
/* ノードへ入る。⚠⚠ **await しない** (enterNode は到着直後のイベントを await するので、
 *   イベントのあるノードでは「ダイアログに答えるまで」解決しない)。 */
async function kickEnter(page, toId, viaDir) {
  await page.evaluate((to, dir) => {
    window.__p9enterDone = false;
    window.__p9enter = window.__graphRun.enter(to, dir).then(() => { window.__p9enterDone = true; });
  }, toId, viaDir);
}
async function waitNode(page, id, ms) {
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate((n) => window.__graphRun.nodeId() === n, id);
    if (ok) return true;
    if (Date.now() - t0 >= ms) return false;
    await sleep(80);
  }
}
/* n1 の乱戦だけを「倒した」ことにする (玉座の護衛とボスは残す)。
 * ⚠ defeatEnemy を呼ばない = 落し物も XP も出ない。ここで測りたいのは
 *   「乱戦が片付いた直後の窓」だけで、ドロップ回収を待つと測定が長くなるだけ。
 * ⚠ 「玉座からチェビシェフ 8 超」で選ぶ = ボス個体の実座標を基準にする本番の
 *   bossApproachReachedNow と同じ物差し (mapDef の bossSlot を写経しない)。 */
async function killMelee(page) {
  return await page.evaluate(() => {
    const boss = enemies.find(e => e.def && e.def.isBoss);
    if (!boss) return -1;
    const bTX = Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE);
    const bTY = Math.floor((boss.y + boss.def.displaySize / 2) / TILE_SIZE);
    let n = 0;
    for (const e of enemies) {
      if (!e.alive || e.def.isBoss) continue;
      const tx = Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE);
      const ty = Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE);
      if (Math.max(Math.abs(tx - bTX), Math.abs(ty - bTY)) > 8) { e.alive = false; e.hp = 0; n++; }
    }
    nodeChoiceCooldownUntil = 0;
    return n;
  });
}
async function waitArrows(page, ms) {
  const t0 = Date.now();
  for (;;) {
    const a = await page.evaluate(() => window.__graphRun.arrows());
    if (a.length) return a;
    if (Date.now() - t0 >= ms) return a;
    await sleep(200);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_gridp9_');
  const browserPath = findBrowser();
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   ' +
    MUT_ORDER.map(k => 'mutate ' + k + ':' + PORT_OF[k]).join(' / '));

  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const errs = [];
  /* ★ autoplay の実プレイページ専用の受け皿。§1〜§6 の測定用ページは長く開きっぱなしに
   *   するので、ゲーム内蔵の自動デバッグ [DIAG] が stall / run-timeout を必ず鳴らす。
   *   それはドライバ側の事情なので、**実プレイと混ぜない**。 */
  const playErrs = [];

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
    }

    // ══ §1 台帳の実測 (本番の aStar で測る) ════════════════════════════════════
    mark('§1 寄り道スポットが実タイルで、入場地点から本番の経路探索で届く');
    const page = await bootPage(browser, PORT, '?diag=1&intel=0', errs);
    await closeDialogs(page);                      // n0 冒頭の EV-2 (3 択) を閉じる
    await kickEnter(page, 'n1', 'right');
    check('(1z) 装置: n1 へ入れた', await waitNode(page, 'n1', 15000), '');
    await closeDialogs(page);

    const A = await page.evaluate(() => {
      const d = window.__graphRun.detour();
      const room = window.__graphRun.graph().nodes.find(n => n.id === 'n1').mapDef.rooms[0];
      const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
      /* ⭐⭐⭐ **外周 1 タイルを禁止する**。1 枚絵の作法①で外周は必ず空くので、禁止しないと
       *   内部を全部塞いでも外周でぐるり繋がり**永久に緑**になる (P4 で実測済み)。 */
      const ring = new Set();
      for (let x = c1; x <= c2; x++) { ring.add(x + ',' + r1); ring.add(x + ',' + r2); }
      for (let y = r1; y <= r2; y++) { ring.add(c1 + ',' + y); ring.add(c2 + ',' + y); }
      const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      /* ⭐⭐⭐ **本番の経路探索 `aStar` をそのまま呼ぶ**。自前 BFS を書くと 8 方向で繋いで
       *   しまい「実際には歩けない道」を繋がっていると報告する (P8 で実測)。 */
      const leg = (b) => { const p = aStar(start.tx, start.ty, b.tx, b.ty, ring, null); return p ? p.length : null; };
      return {
        start: start, rect: room.rect, spots: d.spots, advance: d.advance,
        aStarIsFn: typeof aStar === 'function',
        floors: d.spots.map(s => !isTileWall(s.tx, s.ty)),
        legs: d.spots.map(s => leg({ tx: s.tx, ty: s.ty })),
        // 装置: 岩盤の中 (絵ローカル (30,2) = 居住区の岩) は届かない = aStar が何でも通す訳ではない
        rockTile: { tx: 47, ty: 4, wall: isTileWall(47, 4), leg: leg({ tx: 47, ty: 4 }) },
        chests: roomChests.map(c => ({ tx: c.tx, ty: c.ty, hidden: c.hidden, spot: c.detourSpot || null })),
      };
    });
    check('(1a) 台帳が 4 スポット + 「奥へ進む」を返す',
      A.spots.length === 4 && !!A.advance,
      A.spots.map(s => s.key + '(' + s.tx + ',' + s.ty + ')').join(' ') +
      ' / adv=' + JSON.stringify(A.advance));
    check('(1b) 4 スポットとも本番の歩行判定 (isTileWall) で床',
      A.floors.every(Boolean), JSON.stringify(A.floors));
    check('(1c) ★★外周を禁止しても、入場地点から 4 スポットすべてへ本番の aStar が届く',
      A.legs.every(v => v !== null),
      'start=' + JSON.stringify(A.start) + ' legs=' + JSON.stringify(A.legs));
    check('(1z2) 装置: aStar が関数で、岩盤の中へは届かない (何でも通す訳ではない)',
      A.aStarIsFn && A.rockTile.wall && A.rockTile.leg === null, JSON.stringify(A.rockTile));
    check('(1d) 宝箱が 4 スポットのタイルにちょうど 1 個ずつあり、**hidden:false**',
      A.chests.filter(c => c.spot).length === 4 &&
      A.chests.filter(c => c.spot).every(c => c.hidden === false) &&
      A.spots.every(s => A.chests.some(c => c.spot === s.key && c.tx === s.tx && c.ty === s.ty)),
      JSON.stringify(A.chests));
    /* ⭐⭐⭐ ここが P9 でいちばん高くついた assert。**スポット自身の距離だけでは足りない**。
     *   最初の案 (s2=(51,5) 居住区 / s3=(53,12) 東の袋小路) は玉座から 16 / 9 マス離れて
     *   いたのに、そこへ至る**経路**が玉座から 8 行の通路 (global row 13) を必ず横切るため、
     *   実プレイ 215 秒地点・(45,13) で**寄り道の途中にボス曲とボス到達ナレが鳴った**。
     *   さらに s3 → s4 の最短が玉座の間を貫通して護衛と交戦し、**s4 へ一度も行けなかった**。
     *   → 「入場 → s1 → s2 → s3 → s4」の 4 区間が、本番の aStar で帯を **1 マスも通らない**
     *     ことを測る。⚠ 帯へ入ってよいのは s4 → 玉座 の最終区間だけ (それがボス到達の意味)。 */
    const LEG = await page.evaluate(() => {
      const d = window.__graphRun.detour();
      const ba = window.__graphRun.bossApproach();
      const boss = enemies.find(e => e.def && e.def.isBoss);
      const bTX = Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE);
      const bTY = Math.floor((boss.y + boss.def.displaySize / 2) / TILE_SIZE);
      const inBox = (tx, ty) => Math.max(Math.abs(tx - bTX), Math.abs(ty - bTY)) <= ba.tiles;
      const room = window.__graphRun.graph().nodes.find(n => n.id === 'n1').mapDef.rooms[0];
      const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
      /* ⚠⚠ **外周 1 タイルを禁止する**。作法①で外周は空いているので、禁止しないと
       *   「外周をぐるり回れば帯を避けられる」経路が見つかり、帯を横切るスポットが
       *   緑に見えてしまう (2026-08-20 に実際に 1 回誤判定した)。 */
      const ring = new Set();
      for (let x = c1; x <= c2; x++) { ring.add(x + ',' + r1); ring.add(x + ',' + r2); }
      for (let y = r1; y <= r2; y++) { ring.add(c1 + ',' + y); ring.add(c2 + ',' + y); }
      const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      const pts = [start].concat(d.spots.map(sp => ({ tx: sp.tx, ty: sp.ty })));
      const out = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const p = aStar(a.tx, a.ty, b.tx, b.ty, ring, null);
        // ⚠ aStar の戻り値は {tx,ty} の配列で、**始点を含まない** (= 歩数そのもの)。
        out.push({ from: a, to: b, steps: p ? p.length : null,
                   hits: p ? p.filter(t => inBox(t.tx, t.ty)).length : -1 });
      }
      // 最終区間は帯へ入ってよい (= 入るのが正しい)
      const last = pts[pts.length - 1];
      const pf = aStar(last.tx, last.ty, bTX, bTY, ring, null);
      return { boss: { tx: bTX, ty: bTY }, tiles: ba.tiles, legs: out,
               toThrone: { steps: pf ? pf.length : null,
                           hits: pf ? pf.filter(t => inBox(t.tx, t.ty)).length : -1 } };
    });
    check('(1e) ★★★寄り道の 4 区間が、本番の aStar で玉座から ' + LEG.tiles + ' マスの帯を 1 マスも通らない',
      LEG.legs.every(l => l.steps !== null && l.hits === 0),
      LEG.legs.map(l => '(' + l.from.tx + ',' + l.from.ty + ')→(' + l.to.tx + ',' + l.to.ty + ')' +
                        l.steps + '歩/帯' + l.hits).join(' '));
    check('(1z3) 装置: 最終区間 (最後のスポット → 玉座) は帯を**通る** (帯の検出器が生きている)',
      LEG.toThrone.steps !== null && LEG.toThrone.hits > 0, JSON.stringify(LEG.toThrone));


    // ══ §5a ボス早鳴りの幾何 (周回の前に、静的に測れる分をここで潰す) ══════════
    mark('§5a どのスポットも玉座から BOSS_APPROACH_TILES より遠い');
    const T = await page.evaluate(() => {
      const d = window.__graphRun.detour();
      const ba = window.__graphRun.bossApproach();
      /* ⚠ 玉座の位置は **ボス個体の実座標**から採る (本番の bossApproachReachedNow と
       *   同じ物差し)。mapDef の bossSlot を写経すると、ノックバックや激怒フェーズで
       *   位置が動いた後にずれる。 */
      const boss = enemies.find(e => e.def && e.def.isBoss);
      const bTX = Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE);
      const bTY = Math.floor((boss.y + boss.def.displaySize / 2) / TILE_SIZE);
      const cheb = (t) => Math.max(Math.abs(t.tx - bTX), Math.abs(t.ty - bTY));
      return { tiles: ba.tiles, boss: { tx: bTX, ty: bTY },
               spots: d.spots.map(s => ({ key: s.key, d: cheb(s) })),
               advance: { key: d.advance.key, d: cheb({ tx: d.advance.tx, ty: d.advance.ty }) } };
    });
    check('(5a) ★★4 スポットと「奥へ進む」の矢印位置が、玉座から閾値より遠い (寄り道の途中でボス曲が鳴らない)',
      T.spots.every(s => s.d > T.tiles) && T.advance.d > T.tiles,
      '閾値=' + T.tiles + ' 玉座=' + JSON.stringify(T.boss) + ' ' +
      T.spots.map(s => s.key + ':' + s.d).join(' ') + ' adv:' + T.advance.d);

    // ══ §3 矢印 UI ════════════════════════════════════════════════════════════
    mark('§3 乱戦を片付けると「スポット 4 + 奥へ進む」の 5 本が出る');
    const killed = await killMelee(page);
    check('(3z) 装置: 乱戦だけを倒せた (玉座の護衛とボスは残っている)', killed === 7,
      '倒した数=' + killed);
    const arrows = await waitArrows(page, 12000);
    check('(3a) ★矢印が 5 本 (寄り道 4 + 奥へ進む 1)', arrows.length === 5,
      arrows.map(a => a.spot).join(','));
    check('(3b) 4 本が寄り道・1 本が「奥へ進む」で、to は 1 本も持たない (ノード遷移しない)',
      arrows.filter(a => a.spot && !a.advance).length === 4 &&
      arrows.filter(a => a.advance).length === 1 &&
      arrows.every(a => a.to === null),
      JSON.stringify(arrows.map(a => ({ s: a.spot, adv: a.advance, to: a.to }))));
    check('(3c) 矢印の指すタイルが台帳どおり',
      A.spots.every(s => arrows.some(a => a.spot === s.key && a.at.tx === s.tx && a.at.ty === s.ty)),
      arrows.map(a => a.spot + '(' + a.at.tx + ',' + a.at.ty + ')').join(' '));
    check('(3d) 羊皮紙の文が台帳の名前とヒントを載せている',
      A.spots.every(s => { const a = arrows.find(x => x.spot === s.key);
                           return a && a.hintText.indexOf(s.name) >= 0 && a.hintText.indexOf(s.hint) >= 0; }),
      arrows.map(a => a.hintText).join(' | ').slice(0, 200));
    /* ⭐ 位置は式を写経せず**目的**で測る: 縁クランプの仕事は「可視域の中に収める」ことで、
     *   羊皮紙の重なり解消の仕事は「下敷きになった選択肢が押せない、を起こさない」こと。 */
    const V = await page.evaluate(() => ({ view: window.__graphRun.viewRect(), cam: window.__graphRun.cam() }));
    const inView = (r) => r.x >= V.view.x - 1 && r.y >= V.view.y - 1 &&
                          r.x + r.w <= V.view.x + V.view.w + 1 && r.y + r.h <= V.view.y + V.view.h + 1;
    check('(3e) ★5 本の矢印がすべてダンジョン可視域の中にある (縁クランプの目的)',
      arrows.every(a => inView(a.rect)),
      'view=' + JSON.stringify(V.view) + ' camZ=' + V.cam.camZ.toFixed(3) + ' ' +
      arrows.map(a => a.spot + ':' + Math.round(a.rect.x) + ',' + Math.round(a.rect.y)).join(' '));
    check('(3f) ★5 枚の羊皮紙がすべて可視域の中にあり、どれも重なっていない (押せない選択肢を作らない)',
      arrows.every(a => inView(a.hintRect)) &&
      arrows.every((a, i) => arrows.every((b, j) => i >= j ||
        !(a.hintRect.x < b.hintRect.x + b.hintRect.w && a.hintRect.x + a.hintRect.w > b.hintRect.x &&
          a.hintRect.y < b.hintRect.y + b.hintRect.h && a.hintRect.y + a.hintRect.h > b.hintRect.y))),
      arrows.map(a => a.spot + ':' + Math.round(a.hintRect.x) + ',' + Math.round(a.hintRect.y) +
                      '+' + Math.round(a.hintRect.w) + 'x' + Math.round(a.hintRect.h)).join(' '));
    /* タップ (実 DOM の click)。⚠ ARROW_TAP_GATE (500ms) を跨いでから押すこと。 */
    await sleep(await page.evaluate(() => window.__graphRun.arrowGate()) + 250);
    await page.evaluate(() => { document.querySelector('.exitArrow[data-spot="s4"]').click(); });
    await sleep(400);
    const TAP = await page.evaluate(() => ({
      goal: window.__graphRun.forcedGoal(), arrows: window.__graphRun.arrows().length,
    }));
    const s4 = A.spots.find(x => x.key === 's4');
    check('(3g) ★タップで heroForcedGoal がそのスポットのタイルになり、矢印が閉じる',
      !!TAP.goal && TAP.goal.tx === s4.tx && TAP.goal.ty === s4.ty && TAP.arrows === 0,
      JSON.stringify(TAP.goal) + ' 台帳=' + s4.tx + ',' + s4.ty + ' arrows=' + TAP.arrows);

    await page.close();

    // ══ §2 恒等: 撤退スイッチ / 旧経路 / 他シナリオ / 旧単一マップ ══════════════
    mark('§2 撤退スイッチ・旧 5 ノード・他シナリオ・旧単一マップでは寄り道が 1 つも出ない');
    {
      /* ⚠ どのケースにも **dev ゲート (?diag=1) を必ず付ける**。__graphRun は
       *   __dfDevUnlocked() の内側にしか生えないので、付け忘れるとシームが undefined になり
       *   「恒等だった」ではなく **TypeError でドライバごと落ちる** (2026-08-20 に踏んだ)。 */
      const cases = [
        { name: '?detour=0 (撤退スイッチ)', port: PORT, q: '?diag=1&detour=0&intel=0', scen: 'goblin-mine',
          go: 'n1', probe: (d, x) => d.off === true },
        { name: '?minefold=0 (旧 5 ノード)', port: PORT, q: '?diag=1&minefold=0&intel=0', scen: 'goblin-mine',
          go: 'n1', probe: (d, x) => x.nodes === 5 },
        { name: '他シナリオ (bandits-forest)', port: PORT, q: '?diag=1&intel=0', scen: 'bandits-forest',
          go: null, probe: (d, x) => x.nodes > 1 },
        { name: '?graph=0 (旧単一マップ)', port: PORT, q: '?diag=1&graph=0&intel=0', scen: 'goblin-mine',
          go: null, probe: (d, x) => x.active === false },
        /* ⭐⭐⭐ 2026-08-20 に実際に踏んだ漏れ。台帳を「シナリオ id + ノード id」で引くと、
         *   dev シーム ?graphtest=1 の**内蔵テストグラフにも "n1" がある**ので寄り道 4 本と
         *   宝箱 4 個がそこへ湧き、driver_graph_kinds の (1c)「n1 の宝箱は 0 個」など
         *   既存ドライバ 7 本が黙って赤くなる。→ RUN.scenarioId (内蔵グラフから来たときだけ
         *   値を持つ) で引くように直した。ここはその再発防止。 */
        { name: '?graphtest=1 (内蔵テストグラフ)', port: PORT, q: '?diag=1&graphtest=1&intel=0',
          scen: 'goblin-mine', go: 'n1', probe: (d, x) => x.nodes >= 5 && x.node === 'n1' },
      ];
      for (const c of cases) {
        const p2 = await bootPage(browser, c.port, c.q, errs, { scen: c.scen });
        const hasSeam = await p2.evaluate(() => !!window.__graphRun);
        check('(2z0-' + c.name + ') 装置: 検証シームが生えている (dev ゲートを通っている)', hasSeam, c.q);
        if (!hasSeam) { await p2.close(); continue; }
        await closeDialogs(p2);
        if (c.go) { await kickEnter(p2, c.go, 'right'); await waitNode(p2, c.go, 15000); await closeDialogs(p2); }
        const D = await p2.evaluate(() => ({
          d: window.__graphRun.detour(),
          x: { active: window.__graphRun.active(),
               nodes: window.__graphRun.graph() ? window.__graphRun.graph().nodes.length : 0,
               node: window.__graphRun.nodeId() },
          detourChests: roomChests.filter(ch => ch.detourSpot).length,
          arrows: window.__graphRun.arrows().length,
          spotArrows: window.__graphRun.arrows().filter(a => a.spot).length,
        }));
        /* ⚠⚠ **スイッチを外すと落ちる装置 assert を必ず添える**。母集団ガードが仕様変更で
         *   空振りすると「常に緑」になり、恒等の主張が意味を失う。 */
        check('(2z-' + c.name + ') 装置: その母集団に本当に居る', c.probe(D.d, D.x),
          JSON.stringify(D.x) + ' off=' + D.d.off);
        /* ⚠⚠ 「矢印が 0 本」で測ってはいけない。他シナリオの入口ノードは**通常の出口矢印**を
         *   正しく 3 本出すので、0 本を要求すると**タイミング次第で赤くなる**フレークになる
         *   (2026-08-20 に実測: bandits-forest で arrows=3)。測るべきは
         *   「出ている矢印の中に**寄り道のものが 1 本も無い**」こと。 */
        check('(2a-' + c.name + ') 寄り道の台帳が空・提示不可・寄り道の宝箱 0 個・寄り道の矢印 0 本',
          D.d.spots.length === 0 && D.d.advance === null && D.d.canOffer === false &&
          D.detourChests === 0 && D.spotArrows === 0,
          'spots=' + D.d.spots.length + ' adv=' + JSON.stringify(D.d.advance) +
          ' canOffer=' + D.d.canOffer + ' chests=' + D.detourChests +
          ' 矢印=' + D.arrows + ' (うち寄り道 ' + D.spotArrows + ')');
        await p2.close();
      }
    }

    // ══ §4 + §5b 1 周が詰まないか (目的そのもの) ══════════════════════════════
    if (NO_FULL) {
      console.log('[drv] --no-full: §4 の autoplay 1 周を飛ばしました');
    } else {
      mark('§4+§5b ?detour=tour の autoplay で 4 か所を回り、ボスを早鳴りさせずにクリアする');
      /* ⚠ 実プレイページは **playErrs** で受ける ([DIAG] の stall/run-timeout をここへ混ぜない)。
       * ⚠ ポーリングは **1 秒間隔**。150ms の evaluate は測定対象そのものを遅くする
       *   (同じグラフが 183 秒で完走したり 300 秒で未完走になったりする)。 */
      const play = await bootPage(browser, PORT, '?autoplay=30&detour=tour&intel=0', playErrs);
      const t0 = Date.now();
      let last = null, early = null, cleared = false;
      for (;;) {
        await sleep(1000);
        const st = await play.evaluate(() => {
          const d = window.__graphRun.detour();
          const ba = window.__graphRun.bossApproach();
          return { node: window.__graphRun.nodeId(), cleared: dungeonCleared, over: gameOver,
                   visited: d.visited, done: d.done, pending: d.pending,
                   chests: roomChests.filter(c => c.detourSpot)
                     .map(c => c.detourSpot + ':' + (c.opened ? 'O' : c.found ? 'F' : '.')).join(' '),
                   latched: ba.latched, narrated: ba.narrated,
                   /* ★ボスの**現在位置**も採る。ボスが自分から寄ってきて閾値に入ったのか、
                    *   パーティが玉座へ踏み込んだのかを (5b) が区別するため。 */
                   boss: (() => { const b = enemies.find(e => e.def && e.def.isBoss);
                     return b ? (Math.floor((b.x + b.def.displaySize / 2) / TILE_SIZE) + ',' +
                                 Math.floor((b.y + b.def.displaySize / 2) / TILE_SIZE)) : null; })(),
                   p: Math.floor((playerX + 48) / TILE_SIZE) + ',' + Math.floor((playerY + 58) / TILE_SIZE) };
        });
        /* ★ボスが「鳴った瞬間」の状態を残す。⭐ 固定時間窓で 1 回だけ覗くと共有キューで
         *   必ずフレークするので、**出た瞬間を記録する**方式にしてある。 */
        if (!early && (st.latched || st.narrated)) {
          early = { t: ((Date.now() - t0) / 1000).toFixed(1), visited: st.visited.slice(),
                    pending: st.pending.slice(), p: st.p, boss: st.boss };
        }
        const line = JSON.stringify(st);
        if (line !== last) { console.log('      ' + ((Date.now() - t0) / 1000).toFixed(1) + 's ' + line); last = line; }
        if (st.cleared) { cleared = true; break; }
        if (st.over) break;
        if (Date.now() - t0 > FULL_TIMEOUT_MS) break;
      }
      const F = await play.evaluate(() => {
        const d = window.__graphRun.detour();
        return { visited: d.visited, pending: d.pending, cleared: dungeonCleared,
                 chests: roomChests.filter(c => c.detourSpot).map(c => ({
                   k: c.detourSpot, found: c.found, opened: c.opened, lockTried: !!c.lockTried })) };
      });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const SLOT0 = await play.evaluate(() => {
        const r = window.__graphRun.graph().nodes.find(n => n.id === 'n1').mapDef.rooms[0];
        return r.bossSlot[0] + ',' + r.bossSlot[1];
      }).catch(() => null);
      /* ⭐⭐⭐ 「4 か所すべて」を要求してはいけない。s4 (南の操車場) へ下る道は**玉座の間の口を
       *   最接近 10 マスで横切る**ので、グリクスが自分から出てきて交戦が始まり、周回の途中で
       *   決着することがある (2026-08-20 実測。巡回順 16 通りを全部測っても消えない経路の性質)。
       *   これは欠陥ではなく創発で、s4 の羊皮紙にもその旨を書いてある。
       *   → 測るべきは **「行けなかった理由がそれか」**。未訪問が残ったなら、
       *     ボスが玉座を離れて (early.boss !== bossSlot) 決着していること、を要求する。
       *   ⚠ 「構造的に行けるか」は §1c/§1e が本番の aStar で決定論的に測っている。
       *     ここを緩めても「届かないスポット」は必ず §1 で赤くなる。 */
      const missed = F.pending;
      const bossSortied = !!(early && early.boss && early.boss !== SLOT0);
      check('(4a) ★★★?detour=tour で 4 スポットを回る。回れなかったならボスが玉座を離れたときだけ',
        (F.visited.length === 4 && missed.length === 0) || (bossSortied && cleared && missed.length <= 1),
        'visited=' + JSON.stringify(F.visited) + ' 未訪問=' + JSON.stringify(missed) +
        ' ボス出撃=' + bossSortied + ' (玉座=' + SLOT0 + ' 初出時=' + (early ? early.boss : '-') + ')');
      /* ⚠ 「opened」ではなく **「found」** で測る。施錠は CHEST_LOCK_CHANCE=0.8 で開錠判定にも
       *   失敗しうるので、opened を要求すると**サイコロでフレークする**。到着したかどうかを
       *   決定論的に表すのは found (tryDiscoverChest が接近で立てる)。 */
      check('(4b) ★訪問したスポットの宝箱にはすべて到達している (found)',
        F.chests.length === 4 &&
        F.visited.every(k => { const c = F.chests.find(x => x.k === k); return c && c.found; }),
        JSON.stringify(F.chests));
      check('(4d) ★寄り道が崩れていない (少なくとも 3 か所は回れる)',
        F.visited.length >= 3, 'visited=' + F.visited.length + ' / 4');
      check('(4c) ★★★詰まない = 目的そのもの (dungeonCleared に到達した)', cleared,
        '所要 ' + secs + 's / 上限 ' + (FULL_TIMEOUT_MS / 1000) + 's');
      console.log('      [周回量の判断材料] 寄り道 ' + F.visited.length + ' か所を回った 1 周 = ' +
        secs + 's (P8 の直行 autoplay 実測は 184s。歩数は本番の aStar で 40 → 116 歩)');
      /* ⭐⭐ 「寄り道の途中で鳴らない」を **パーティ側の落ち度に限って**測る。
       *   ボス個体は自分から動くので、寄り道の最中にボスが近づいてきて閾値に入ることは
       *   ありうる (それは仕様どおり = ボスが見つけに来た)。判別は「鳴った瞬間にボスが
       *   まだ玉座 (mapDef の bossSlot) に居たか」。居たなら**パーティが踏み込んだ**ので赤。
       * ⚠ 静的な保証は §1e (4 区間が帯を 1 マスも通らない) が持つ。ここはその実プレイ版。 */
      const SLOT = await play.evaluate(() => {
        const r = window.__graphRun.graph().nodes.find(n => n.id === 'n1').mapDef.rooms[0];
        return r.bossSlot[0] + ',' + r.bossSlot[1];
      }).catch(() => null);
      check('(5b) ★★★寄り道の途中でボスが早鳴りしない (回り終える前に鳴るのは、ボスが動いた時だけ)',
        !early || early.pending.length === 0 || (early.boss && early.boss !== SLOT),
        early ? ('初出 ' + early.t + 's パーティ=' + early.p + ' ボス=' + early.boss +
                 ' (玉座=' + SLOT + ') pending=' + JSON.stringify(early.pending))
              : 'ボス到達フラグが最後まで立たなかった (= ボスに到達していない: 4c を見よ)');

      // ══ §6 再入場: n0 へ引き返して戻っても訪問済みが復活しない ══════════════
      /* ⭐ **周回し終えた実プレイページをそのまま使う**。ここで測りたいのは nodeState の
       *   保存/復元だけで、歩きも到達検出も §4 が既に本物で通している。
       * ⚠⚠ パーティを目標タイルへ「置く」やり方は採らない。heroAI は冒頭で
       *   isBacklineInPosition() / スタック検知 (20tick でウィグル・60tick でワープ) を
       *   通るので、主人公だけ瞬間移動させると**到達検出が走らないことがある**
       *   (2026-08-20 に 3 回赤くして切り分けた)。実際に歩かせた結果を使うのが唯一確実。 */
      mark('§6 n0 へ引き返して n1 へ戻っても、訪問済みのスポットは復活しない');
      const before6 = await play.evaluate(() => ({
        visited: window.__graphRun.detour().visited,
        chests: roomChests.filter(c => c.detourSpot)
          .map(c => c.detourSpot + ':' + (c.opened ? 'O' : c.found ? 'F' : '.')).join(' '),
      }));
      check('(6z0) 装置: 再入場の前に訪問済みが 1 つ以上ある (これが無いと §6 は測れない)',
        before6.visited.length > 0, JSON.stringify(before6));
      await kickEnter(play, 'n0', 'left');
      const back0 = await waitNode(play, 'n0', 20000);
      await kickEnter(play, 'n1', 'right');
      const back1 = await waitNode(play, 'n1', 20000);
      check('(6z) 装置: n0 → n1 と往復できた', back0 && back1, 'n0=' + back0 + ' n1=' + back1);
      const R6 = await play.evaluate(() => ({
        d: window.__graphRun.detour(),
        chests: roomChests.filter(c => c.detourSpot)
          .map(c => c.detourSpot + ':' + (c.opened ? 'O' : c.found ? 'F' : '.')).join(' '),
      }));
      check('(6a) ★再入場しても訪問済みが残り、残りだけが提示対象になる',
        before6.visited.every(k => R6.d.visited.indexOf(k) >= 0) &&
        before6.visited.every(k => R6.d.pending.indexOf(k) < 0),
        '前=' + JSON.stringify(before6.visited) + ' 後=' + JSON.stringify(R6.d.visited) +
        ' pending=' + JSON.stringify(R6.d.pending));
      check('(6b) 再入場しても寄り道の宝箱の状態 (発見/開封) が復元される',
        R6.chests === before6.chests, '前=' + before6.chests + ' / 後=' + R6.chests);
      await play.close();
    }
  } finally {
    for (const s of servers) { try { s.close(); } catch (e) {} }
    try { await browser.close(); } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 集計
  // ══════════════════════════════════════════════════════════════════════════
  /* ⚠ 実プレイページの [DIAG] stall / run-timeout は**赤に数えない**が、必ず出す。
   *   黙って握り潰すと「長くなりすぎている」ことに気づけない。 */
  if (playErrs.length) {
    console.log('[drv] 実プレイページの警告 (赤には数えない):');
    for (const e of playErrs.slice(0, 8)) console.log('        ' + e);
  }
  check('(E) 測定ページで JS エラー / console.error が出ていない', errs.length === 0,
    errs.slice(0, 6).join(' | '));

  const fail = results.filter(r => !r.ok);
  console.log('');
  console.log('[drv] ' + (results.length - fail.length) + '/' + results.length + ' PASS');
  if (fail.length) {
    console.log('[drv] FAIL:');
    for (const r of fail) console.log('   - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('[drv] 例外: ' + (e && e.stack || e)); process.exit(3); });
