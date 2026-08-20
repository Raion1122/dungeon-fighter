#!/usr/bin/env node
/*
 * driver_grid_p8.js — 卓上グリッド P8「廃坑を 2 つの大部屋へ畳む」の検証ドライバ (2026-08-20)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 何を入れたか
 *   廃坑を **n0 (33x22) → n1 (39x23) の 2 ノードだけ**へ畳んだ。旧 n4 (掘削場) / n5 (湧き水の間) /
 *   n7 (玉座の間) は 7x6・9x6 の小部屋で、部屋の最大チェビシェフ距離が 6 / 8 しかなく、
 *   P5 の移動 6 マスも P6 の射程の梯子も**原理的に効かない**(旧射程 6 の弓が既に部屋を
 *   100% カバーしていた)。3 つの中身を、既に codex1 の絵がある n1 の中へ移した。
 *   新規の絵は 0 枚。あわせてボス部屋化 (専用 BGM + 到達ナレ) を「入室」から
 *   「玉座へ 8 タイル以内の接近」へ遅らせた (大部屋のときだけ)。
 *
 * ■ ⭐⭐⭐ この作業で実際に踏んだ制約 = §4 / §8 が測るもの
 *   **EV-5「捕らわれた従者」を寄り道に置くことは原理的に不可能**だった。
 *   1 ノード = 1 部屋なので heroAI の ③「未訪問の部屋へ」(findNextRoomGoal) が永久に -1 を
 *   返し、④「霧を無視して最寄り敵へ」に落ちる = **AI は敵へ一直線にしか歩かない**。
 *   羊皮紙 (出口選択) が消えた時点で、寄り道はオートバトルでは到達不能になる。
 *   → EV-5 は泉の間 (玉座) へ下る**唯一の隘路 (歯車の間)** の上に置いた。§8 の autoplay が
 *     「実プレイで本当に発火するか」を目的そのもので測る。
 *
 * ■ 測る順序の方針
 *   §1 母集団ガード (畳み込みが本当に効いているか) → §2 配置が絵と矛盾しないか →
 *   §3 交戦距離 (入った瞬間に乱戦/ボス戦にならない) → §4 外周を禁止した到達可能性 →
 *   §5 イベントのアンカー → §6 ボス部屋化が接近で起きる → §7 撤退スイッチ →
 *   §9 負のコントロール → §8 autoplay 完走 (目的)。
 *
 *   ⭐ §2 は「実装の戻り値どうしを突き合わせる」形にしない。**敵スロット (データ) を
 *     絵の blocked マスク (別の作者が書いた別のデータ)** と突き合わせる。両方が同じ誤りを
 *     共有しようがないので、片方の写経より強い。
 *   ⭐ §4 は **外周 1 タイルを禁止した BFS** で測る。1 枚絵の作法①で外周は必ず空くので、
 *     素の BFS は内部を全部塞いでも外周でぐるり繋がり**永久に緑**になる (P4 で実測済み)。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate        | 注入する欠陥                                    | 赤くなるべき節
 *   PORT   | (素)          | —                                               | —
 *   PORT+1 | nofold        | MINE_FOLD_OFF を常に真 (畳み込みが起きない)     | §1
 *   PORT+2 | noapproach    | ボス部屋化を firstEntry へ戻す                  | §6
 *   PORT+3 | nogrixfold    | EV-9 のアンカーを旧 dx=2 (部屋の西の果て) へ    | §5
 *   PORT+4 | noservantfold | EV-5 のアンカーを旧 dx=4 (入場地点の目の前) へ  | §5
 *   PORT+5 | guardwest     | 護衛を col46 → col42 (EV-9 より手前) へ         | §3
 *   PORT+6 | slotinwall    | 乱戦の 1 体を絵の岩盤の中 (40,15) へ            | §2
 *   PORT+7 | sealgear      | 降口 (36,16)/(37,16) を塞ぎ戻す              | §4
 *
 * 使い方:
 *   node tools/driver_grid_p8.js
 *   node tools/driver_grid_p8.js --no-full        (§8 の autoplay 完走だけ飛ばす)
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
/* --pair: 旧 5 ノード (?minefold=0) とのペア比較を追加で走らせる。
 * ⚠ autoplay が 1 本増える (実時間 +5 分) ので既定は off。テンポを測る日だけ使う。 */
const PAIR = flag('pair');
/* ⚠ ポートは既存ドライバと 4 以上空ける。本ドライバは PORT..PORT+7 の **8 本**を掴む。
 *   9050-9057 が未使用であることは既存ドライバの --port 既定値一覧で実測 (2026-08-20)。 */
const PORT = parseInt(arg('port', '9050'), 10);
const FULL_TIMEOUT_MS = parseInt(arg('fulltimeout', '300000'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
// ⚠ 置換後の長さを 1 文字以上ずらすこと ((0b) がバイト長で「同じ物を 2 回測っていない」を見る)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  nofold: [
    '      try { return new URLSearchParams(window.location.search).get("minefold") === "0"; }',
    '      try { return true; /* mut-nofold */ }'],
  noapproach: [
    '          const bossGate = bigRoom ? bossApproachReachedNow() : firstEntry;',
    '          const bossGate = firstEntry;   /* mut-noapproach */'],
  nogrixfold: [
    '        : nodeEventSpot(SCE1_GRIX_FOLD_DX, SCE1_GRIX_FOLD_DY);',
    '        : nodeEventSpot(SCE1_GRIX_OFFSET_TX, 0);   /* mut-nogrixfold */'],
  noservantfold: [
    '        : nodeEventSpot(SCE1_SERVANT_FOLD_DX, SCE1_SERVANT_FOLD_DY);',
    '        : nodeEventSpot(SCE1_SERVANT_NODE_DX, 0);   /* mut-noservantfold */'],
  guardwest: [
    '      const N1_GUARD_SLOTS = [[46, 20, "hobgoblin"], [46, 22, "hobgoblin"]];',
    '      const N1_GUARD_SLOTS = [[42, 20, "hobgoblin"], [42, 22, "hobgoblin"]];  /* mut-guardwest */'],
  slotinwall: [
    '        [32,  9, "goblin"],       // 一段奥                11',
    '        [40, 15, "goblin"],       /* mut-slotinwall = 絵の岩盤の中 */'],
  /* ★P8 で開けた降口を塞ぎ戻す。行14 の col19-20 (= global (36,16)/(37,16)) の 2 マスを塞ぐと
   *   北半 (主通路) と南半 (泉の間 = 玉座) が 4 方向で切れ、§4 の「外周を使わずに
   *   玉座へ届く」が赤くなる (実プレイは外周を 12 歩余計に大回りする)。
   * ⚠ P8 の降口は幅 2 タイルなので、1 マスだけ塞いでも繋がったまま = 空振りする。 */
  sealgear: [
    '               ".#########...####....#################.",   // 14  col17-19 = 歯車の間の床 / col20 = ★荷車の軒下 (P8 で開けた) / col21-22 = 梁',
    '               ".#########...####..###################.",   // 14 mut-sealgear'],
};
const MUT_ORDER = ['nofold', 'noapproach', 'nogrixfold', 'noservantfold', 'guardwest',
                   'slotinwall', 'sealgear'];
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
  await page.setViewport({ width: 1280, height: 900 });
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
    "typeof mapData !== 'undefined' && typeof buildNode === 'function' && typeof sce1WatchSpot === 'function'",
    { timeout: 25000 });
  /* ⚠⚠ **startGame() を通さないと検出器が丸ごと沈黙する**。tryInteractNodeEvent も
   *   applyNodeZoom も gameStarted / 開始画面の後ろにあり、通さないと camZ=1 のままになる
   *   (P7 で実際に誤読しかけた)。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  if (opts.freezeChoice) {
    /* ⚠ 出口選択 UI を止めないとイベントが測れない (nodeBusy が下りない)。?autoplay には掛けない。 */
    await page.evaluate(() => {
      window.__p8freeze = setInterval(() => { nodeChoiceCooldownUntil = Date.now() + 60000; }, 150);
      nodeChoiceCooldownUntil = Date.now() + 60000;
    });
  }
  await sleep(300);
  return page;
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
/* ノードへ入る。⚠⚠ **await しない** (enterNode は到着直後のイベントを await するので、
 *   イベントのあるノードでは「ダイアログに答えるまで」解決しない)。 */
async function kickEnter(page, toId, viaDir) {
  await page.evaluate((to, dir) => {
    window.__p8enterDone = false;
    window.__p8enter = window.__graphRun.enter(to, dir).then(() => { window.__p8enterDone = true; });
  }, toId, viaDir);
}
async function closeAnyDialog(page) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    if (btns.length) btns[btns.length - 1].click();   // 末尾 = キャンセル (Esc と同じ経路)
  });
  await sleep(250);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_gridp8_');
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
  /* ★ autoplay の実プレイページ専用の受け皿。§1 の測定用ページは 10 分間開きっぱなしに
   *   するので、ゲーム内蔵の自動デバッグ [DIAG] が stall / run-timeout を必ず鳴らす。
   *   それはドライバ側の事情なので、**実プレイと混ぜない**。 */
  const baseErrs = [];

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

    // ══ §1 母集団ガード: 廃坑が 2 ノードの大部屋 2 枚で立ち上がる ══════════════
    mark('§1 廃坑が n0 → n1 の 2 ノードで立ち上がる');
    const page = await bootPage(browser, PORT, '?diag=1&intel=0', errs, { freezeChoice: true });
    await closeAnyDialog(page);   // n0 冒頭の EV-2 (3 択) を閉じる

    const G = await page.evaluate(() => {
      const g = window.__graphRun.graph();
      return {
        nodes: g.nodes.map(n => n.id + ':' + n.kind),
        boss: window.__graphRun.bossNodeId(),
        exits: g.nodes.reduce((a, n) => { a[n.id] = n.exits.map(e => e.to + '@' + e.dir); return a; }, {}),
        rects: g.nodes.reduce((a, n) => { a[n.id] = n.mapDef.rooms[0].rect; return a; }, {}),
        paint: g.nodes.reduce((a, n) => {
          const p = n.mapDef.rooms[0].painting; a[n.id] = p ? p.theme + '/' + p.key : null; return a; }, {}),
        tb: ROOM_PAINTINGS_DEF['goblin-mine'].n1.tileBounds,
      };
    });
    check('(1a) ★廃坑は n0 (start) と n1 (boss) の 2 ノードだけ',
      G.nodes.join(',') === 'n0:start,n1:boss', G.nodes.join(','));
    check('(1b) boss ノードは n1', G.boss === 'n1', String(G.boss));
    check('(1c) n0 の出口は n1 の 1 本だけ / n1 は行き止まり',
      G.exits.n0.join(',') === 'n1@right' && G.exits.n1.length === 0,
      JSON.stringify(G.exits));
    check('(1d) ★1 枚絵は n0 / n1 の 2 枚とも参照されている (新規の絵は 0 枚)',
      G.paint.n0 === 'goblin-mine/n0' && G.paint.n1 === 'goblin-mine/n1',
      JSON.stringify(G.paint));
    /* ⚠⚠ rect と tileBounds が同じでないと paintingAspectFits が鳴るだけでなく、
     *   敵スロットの「global = 絵ローカル + (c1,r1)」という恒等写像が成り立たなくなる。
     *   §2 の前提そのものなので、ここで先に測る。 */
    check('(1e) ★★n1 の rect と絵の tileBounds が完全一致 (§2 の恒等写像の前提)',
      JSON.stringify(G.rects.n1) === JSON.stringify(G.tb) &&
      G.rects.n1[3] - G.rects.n1[1] + 1 === 39 && G.rects.n1[2] - G.rects.n1[0] + 1 === 23,
      'rect=' + JSON.stringify(G.rects.n1) + ' tileBounds=' + JSON.stringify(G.tb));

    // n1 へ入る (以降ずっと n1 に居る)
    await kickEnter(page, 'n1', 'right');
    if (!await waitNode(page, 'n1', 12000)) check('(1x) n1 へ遷移できた', false, 'timeout');
    await sleep(700);

    const Z = await page.evaluate(() => ({
      size: window.__largeRoomSize(), camZ: window.__camZoom(),
      used: { w: MAP_USED.c1 - MAP_USED.c0 + 1, h: MAP_USED.r1 - MAP_USED.r0 + 1 },
    }));
    check('(1f) ★n1 は大部屋判定 = P7 のズームがここから効く',
      !!Z.size && Z.camZ < 1, JSON.stringify(Z));
    check('(1g) ★★部屋の最大チェビシェフ距離が 8 (旧ボス部屋) より遥かに大きい = 射程の梯子が効く母集団',
      Math.max(Z.used.w, Z.used.h) - 1 >= 22,
      '最大チェビシェフ=' + (Math.max(Z.used.w, Z.used.h) - 1) + ' (旧 BOSSR は 8)');

    // ══ §2 敵配置が「絵の blocked マスク」で床が空いている ══════════════════════
    mark('§2 敵とイベントの位置が、絵に描かれた障害物と矛盾しない');
    const S = await page.evaluate(() => {
      const g = window.__graphRun.graph();
      const n1 = g.nodes.find(n => n.id === 'n1');
      const room = n1.mapDef.rooms[0];
      const def = ROOM_PAINTINGS_DEF['goblin-mine'].n1;
      const r1 = def.tileBounds[0], c1 = def.tileBounds[1];
      const mask = def.blocked;
      const openAt = (tx, ty) => {
        const lr = ty - r1, lc = tx - c1;
        if (lr < 0 || lr >= mask.length) return null;
        const row = mask[lr];
        if (lc < 0 || lc >= row.length) return null;
        return row[lc] === '.';
      };
      const slots = room.enemySlots.map(s => ({ tx: s[0], ty: s[1], type: s[2], open: openAt(s[0], s[1]) }));
      const boss = room.bossSlot
        ? { tx: room.bossSlot[0], ty: room.bossSlot[1], type: room.bossSlot[2],
            open: openAt(room.bossSlot[0], room.bossSlot[1]) } : null;
      const servant = sce1ServantSpot(), grix = sce1GrixSpot();
      let blockedCells = 0, totalCells = 0;
      for (const row of mask) for (const ch of row) { totalCells++; if (ch === '#') blockedCells++; }
      return {
        slots: slots, boss: boss, maskRows: mask.length, maskCols: mask[0].length,
        blockedCells: blockedCells, totalCells: totalCells,
        servant: { tx: servant.tx, ty: servant.ty, open: openAt(servant.tx, servant.ty) },
        grix: { tx: grix.tx, ty: grix.ty, open: openAt(grix.tx, grix.ty) },
      };
    });
    const types = S.slots.map(s => s.type).sort().join(',');
    check('(2a) ★敵は 9 体 + ボス 1 = 旧 n4 (7) と旧 n7 (2+ボス) の合計と同じ',
      S.slots.length === 9 && !!S.boss && S.boss.type === 'goblinKing',
      'slots=' + S.slots.length + ' boss=' + (S.boss ? S.boss.type : 'none'));
    check('(2a2) ★種類の内訳も旧 2 部屋と同じ (弱体化も強化もしていない)',
      types === 'goblin,goblinArcher,goblinBrute,goblinRider,goblinShaman,hobgoblin,hobgoblin,hobgoblin,hobgoblin',
      types);
    check('(2b) ★★全スロットが絵の blocked マスクで床 (岩盤や樽の中に湧かない)',
      S.slots.every(s => s.open === true) && S.boss.open === true,
      S.slots.filter(s => s.open !== true).map(s => s.type + '@' + s.tx + ',' + s.ty).join(' ') || 'all-open');
    check('(2c) ★EV-5 / EV-9 のアンカーも床',
      S.servant.open === true && S.grix.open === true,
      'EV5=' + S.servant.tx + ',' + S.servant.ty + ':' + S.servant.open +
      ' EV9=' + S.grix.tx + ',' + S.grix.ty + ':' + S.grix.open);
    /* ⚠ 装置。マスクが 39x23 で、しかも実際に '#' を持っていることを測る。これが無いと
     *   「マスクが空 (全部 '.') なので何を置いても緑」を検出できない。 */
    check('(2d-装置) マスクは 39x23 で、実際に塞いだ区画を持っている',
      S.maskRows === 23 && S.maskCols === 39 && S.blockedCells > 200,
      S.maskCols + 'x' + S.maskRows + ' blocked=' + S.blockedCells + '/' + S.totalCells);

    // ══ §3 交戦距離 — 入った瞬間に乱戦にならない / 玉座の交渉が戦闘に潰されない ══
    mark('§3 交戦距離 (入場即の乱戦・EV-9 の潰れ を防ぐ)');
    const D = await page.evaluate(() => {
      const g = window.__graphRun.graph();
      const room = g.nodes.find(n => n.id === 'n1').mapDef.rooms[0];
      const grix = sce1GrixSpot();
      const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      /* ⚠⚠ 交戦距離は **その敵自身の射程キー**で決まる (detectEnemiesEngagedByRange は
       *   getRange(e.def.range || "melee").engagePx しか見ない)。全キーの最大値で測ると、
       *   射程の梯子を上げた日に盤面を 1 タイルも動かしていないのに赤くなる。 */
      const engageOf = (typeKey) => {
        const d = ENEMY_TYPES[typeKey];
        return getRange((d && d.range) || 'melee').engagePx;
      };
      const px = (a, b) => Math.hypot((a.tx - b.tx) * TILE_SIZE, (a.ty - b.ty) * TILE_SIZE);
      const guards = room.enemySlots.filter(s => s[0] >= 40).map(s => ({ tx: s[0], ty: s[1], type: s[2] }));
      const melee = room.enemySlots.filter(s => s[0] < 40).map(s => ({ tx: s[0], ty: s[1], type: s[2] }));
      return {
        start: start,
        fromStart: melee.map(m => ({ type: m.type, d: Math.round(px(start, m)), e: engageOf(m.type) })),
        fromGrix: guards.map(gd => ({ type: gd.type, d: Math.round(px(grix, gd)), e: engageOf(gd.type) })),
        bossFromGrix: Math.round(px(grix, { tx: room.bossSlot[0], ty: room.bossSlot[1] })),
        bossEngage: engageOf(room.bossSlot[2]),
        guardCount: guards.length,
        encounter: encounterActive || encounterRunning,
      };
    });
    check('(3a) ★入場した時点では戦闘が始まっていない', D.encounter === false, String(D.encounter));
    check('(3b) ★★乱戦の全員が、入場地点から自分の交戦距離より遠い',
      D.fromStart.length === 7 && D.fromStart.every(o => o.d > o.e),
      D.fromStart.map(o => o.type + ':' + o.d + '>' + o.e).join(' / '));
    check('(3c) ★★玉座の護衛 2 体は、EV-9 のアンカーから自分の交戦距離より遠い (交渉が戦闘に潰されない)',
      D.guardCount === 2 && D.fromGrix.every(o => o.d > o.e) && D.bossFromGrix > D.bossEngage,
      D.fromGrix.map(o => o.type + ':' + o.d + '>' + o.e).join(' / ') +
      ' / boss:' + D.bossFromGrix + '>' + D.bossEngage);

    // ══ §4 外周を禁止した BFS ═══════════════════════════════════════════════════
    mark('§4 外周を禁止したとき、本番の経路探索が本道を見つける');
    const B = await page.evaluate(() => {
      const g = window.__graphRun.graph();
      const room = g.nodes.find(n => n.id === 'n1').mapDef.rooms[0];
      const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
      const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      const servant = sce1ServantSpot(), grix = sce1GrixSpot();
      const boss = { tx: room.bossSlot[0], ty: room.bossSlot[1] };
      /* ⭐⭐⭐ **本番の経路探索 `aStar` をそのまま呼ぶ**。自前で BFS を書くと 8 方向で
       *   繋いでしまい「実際には歩けない道」を繋がっていると報告する
       *   (2026-08-20 実測: aStar は :15984 で **4 方向しか踏まない**のに、8 方向 BFS の
       *   (4a) は緑のままで、実プレイは外周を 20 タイル大回りしていた)。
       * ⭐⭐⭐ **外周 1 タイルは avoidTiles で禁止する**。1 枚絵の作法①で外周は必ず空くので、
       *   禁止しないと内部を全部塞いでも外周でぐるり繋がり永久に緑になる。 */
      const ring = new Set();
      for (let x = c1; x <= c2; x++) { ring.add(x + ',' + r1); ring.add(x + ',' + r2); }
      for (let y = r1; y <= r2; y++) { ring.add(c1 + ',' + y); ring.add(c2 + ',' + y); }
      const leg = (a, b, avoid) => {
        const path = aStar(a.tx, a.ty, b.tx, b.ty, avoid, null);
        return path ? path.length : null;
      };
      return {
        start: start, servant: servant, grix: grix, boss: boss,
        noRing: { toServant: leg(start, servant, ring), toGrix: leg(servant, grix, ring),
                  toBoss: leg(grix, boss, ring) },
        withRing: { direct: leg(start, boss, null), noRingDirect: leg(start, boss, ring) },
      };
    });
    check('(4a) ★★外周を使わずに 入場 → EV-5 (歯車の間) → EV-9 (泉の間) → 玉座 が本番の経路探索で繋がる',
      B.noRing.toServant !== null && B.noRing.toGrix !== null && B.noRing.toBoss !== null,
      JSON.stringify(B.noRing) + ' start=' + JSON.stringify(B.start));
    /* ⭐⭐ 目的は「繋がる」だけではない。**外周を使う経路より本道の方が短い**ことまで測らないと、
     *   A* は外周を選び、EV-5 も EV-9 も素通りされる (2026-08-20 に実際に起きた)。 */
    check('(4b) ★★本道の方が外周経由より短い (A* が本道を選ぶ = イベントを素通りしない)',
      B.withRing.noRingDirect !== null && B.withRing.direct !== null &&
      B.withRing.noRingDirect <= B.withRing.direct,
      '外周禁止=' + B.withRing.noRingDirect + '歩 / 外周可=' + B.withRing.direct + '歩');

    // ══ §5 イベントのアンカー ═══════════════════════════════════════════════════
    mark('§5 EV-5 / EV-9 のアンカーが 1 枚絵の中の狙った場所にある');
    const E = await page.evaluate(() => {
      const evs = window.__graphRun.events();
      const servant = sce1ServantSpot(), grix = sce1GrixSpot();
      const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      const px = (a, b) => Math.hypot((a.tx - b.tx) * TILE_SIZE, (a.ty - b.ty) * TILE_SIZE);
      const evServant = evs.find(e => e.key === 'captive_servant') || {};
      const evGrix = evs.find(e => e.key === 'grix_parley') || {};
      return {
        here: window.__graphRun.eventsHere().sort().join(','),
        owner: evServant.nodeId, grixOwner: evGrix.nodeId, radius: evServant.radius,
        servant: servant, grix: grix,
        dServant: Math.round(px(start, servant)), dGrix: Math.round(px(start, grix)),
      };
    });
    check('(5a) ★EV-5 も EV-9 も n1 に紐づいている (畳み込みで迷子になっていない)',
      E.owner === 'n1' && E.grixOwner === 'n1' && E.here === 'captive_servant,grix_parley',
      'EV5=' + E.owner + ' EV9=' + E.grixOwner + ' here=' + E.here);
    check('(5b) ★EV-5 のアンカーは歯車の間 (35,16) = 泉の間へ下る唯一の隘路',
      E.servant.tx === 35 && E.servant.ty === 16, JSON.stringify(E.servant));
    check('(5c) ★EV-9 のアンカーは泉の間の入口 (40,21)',
      E.grix.tx === 40 && E.grix.ty === 21, JSON.stringify(E.grix));
    check('(5d) ★★どちらも入場地点から発火半径より遠い (部屋に入った瞬間に開かない)',
      E.dServant > E.radius && E.dGrix > E.radius,
      'EV5=' + E.dServant + ' EV9=' + E.dGrix + ' > radius=' + E.radius);

    // ══ §6 ボス部屋化は「入室」ではなく「玉座への接近」で起きる ═════════════════
    mark('§6 ボス部屋化 (専用 BGM + 到達ナレ) が接近で起きる');
    const A0 = await page.evaluate(() => {
      const a = window.__graphRun.bossApproach();
      return { inBoss: window.__graphRun.inBossRoom(), bgm: currentBgmId(),
               bigRoom: a.bigRoom, latched: a.latched, reached: a.reached, tiles: a.tiles };
    });
    check('(6a) ★★n1 に入った直後は「ボス部屋」ではない (乱戦をボス曲で戦わない)',
      A0.bigRoom === true && A0.inBoss === false && A0.latched === false && A0.reached === false,
      JSON.stringify(A0));
    check('(6a2) ★そのとき BGM はシーン曲のまま', A0.bgm === 'dungeon_normal', String(A0.bgm));
    /* 玉座の 5 タイル手前へワープする。⚠ 護衛が生きていると交戦して heroAI の
     *   `!encounterActive` 枝に入らないので、**ボス以外を先に伏せてから**測る
     *   (測りたいのは「接近でフラグが立つか」であって戦闘の可否ではない)。 */
    /* ⚠⚠⚠ **「玉座へ詰めたらボス部屋になる」は、ここでは測れない**。
     *   ヘッドレスの非 autoplay ページでは heroAI が冒頭の早期 return
     *   (`heroSliding` / `exploreAllyTurnRunning`) を抜けられず、**入室検出のループが
     *   一度も走らない** (2026-08-20 に実測: 13 秒たっても visitedRooms.size === 0)。
     *   playerX/Y を直接ワープさせるとタイル離散スライドが途中で固まり、さらに悪化する。
     *   → 遷移そのものは **§8 の autoplay (実プレイ) の中で観測する** ((8d)(8e))。
     *     手段 (フラグを直に叩く) ではなく目的 (実際の潜行で切り替わるか) で測ることになるので、
     *     測定としてもこちらの方が強い。 */
    check('(6c-装置) 閾値は 8 タイル (旧ボス部屋 BOSSR の最大チェビシェフ距離と同値)',
      A0.tiles === 8, String(A0.tiles));

    // 他シナリオ (n7 = 9x6 の小部屋) は入室即 = 1 ミリも変わっていない
    const pageF = await bootPage(browser, PORT, '?diag=1&intel=0', errs,
      { scen: 'bandits-forest', freezeChoice: true });
    await kickEnter(pageF, 'n7', 'right');
    if (!await waitNode(pageF, 'n7', 12000)) check('(6x) 森の n7 へ遷移できた', false, 'timeout');
    await sleep(600);
    const AF = await pageF.evaluate(() => {
      const a = window.__graphRun.bossApproach();
      return { inBoss: window.__graphRun.inBossRoom(), size: window.__largeRoomSize(), bigRoom: a.bigRoom };
    });
    check('(6d) ★★他 5 シナリオの n7 (9x6) は大部屋ではないので入室即ボス部屋 = 恒等',
      AF.bigRoom === false && AF.size === null && AF.inBoss === true, JSON.stringify(AF));
    await pageF.close();

    // ══ §7 撤退スイッチ ═════════════════════════════════════════════════════════
    mark('§7 撤退スイッチ ?minefold=0 / ?bossapproach=0');
    {
      const pOld = await bootPage(browser, PORT, '?diag=1&intel=0&minefold=0', errs, { freezeChoice: true });
      const GO = await pOld.evaluate(() => {
        const g = window.__graphRun.graph();
        return { nodes: g.nodes.map(n => n.id + ':' + n.kind), boss: window.__graphRun.bossNodeId() };
      });
      check('(7a) ★?minefold=0 で旧 5 ノード構成へ戻る (既存ドライバのピン留め先)',
        GO.nodes.join(',') === 'n0:start,n1:event,n4:combat,n5:rest,n7:boss' && GO.boss === 'n7',
        GO.nodes.join(',') + ' boss=' + GO.boss);
      await pOld.close();
    }
    {
      const pBA = await bootPage(browser, PORT, '?diag=1&intel=0&bossapproach=0', errs, { freezeChoice: true });
      await closeAnyDialog(pBA);
      await kickEnter(pBA, 'n1', 'right');
      if (!await waitNode(pBA, 'n1', 12000)) check('(7x) n1 へ遷移できた', false, 'timeout');
      await sleep(600);
      const AB = await pBA.evaluate(() => {
        const a = window.__graphRun.bossApproach();
        return { inBoss: window.__graphRun.inBossRoom(), bigRoom: a.bigRoom };
      });
      check('(7b) ★?bossapproach=0 で入室即ボス部屋へ戻る (P8-2 が無かった頃と同じ)',
        AB.bigRoom === false && AB.inBoss === true, JSON.stringify(AB));
      await pBA.close();
    }

    // ══ §9 負のコントロール ═════════════════════════════════════════════════════
    mark('§9 負のコントロール — 壊すと狙った節だけが赤くなる');
    {
      const p1 = await bootPage(browser, PORT_OF.nofold, '?diag=1&intel=0', errs, { freezeChoice: true });
      const g1 = await p1.evaluate(() => window.__graphRun.graph().nodes.map(n => n.id).join(','));
      check('(9a) ★nofold → 畳み込みが起きず 5 ノードのまま = §1 が赤くなる', g1 !== 'n0,n1', g1);
      await p1.close();
    }
    /* ⚠ noapproach の負のコントロールも autoplay でしか測れない (上の (6b) と同じ理由)。
     *   → §8 の (8e) が「素は玉座の手前で、変異は入場した所で」切り替わることを比べる。 */
    {
      const p3 = await bootPage(browser, PORT_OF.nogrixfold, '?diag=1&intel=0', errs, { freezeChoice: true });
      await closeAnyDialog(p3);
      await kickEnter(p3, 'n1', 'right');
      await waitNode(p3, 'n1', 12000);
      await sleep(500);
      const a3 = await p3.evaluate(() => ({ grix: sce1GrixSpot() }));
      check('(9c) ★nogrixfold → EV-9 が部屋の西の果てへ戻り (5c) が赤くなる',
        !(a3.grix.tx === 40 && a3.grix.ty === 21), JSON.stringify(a3));
      await p3.close();
    }
    {
      const p4 = await bootPage(browser, PORT_OF.noservantfold, '?diag=1&intel=0', errs, { freezeChoice: true });
      await closeAnyDialog(p4);
      await kickEnter(p4, 'n1', 'right');
      await waitNode(p4, 'n1', 12000);
      await sleep(500);
      const a4 = await p4.evaluate(() => {
        const sv = sce1ServantSpot();
        const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
        return { servant: sv, d: Math.round(Math.hypot((sv.tx - start.tx) * TILE_SIZE, (sv.ty - start.ty) * TILE_SIZE)) };
      });
      check('(9d) ★noservantfold → EV-5 が入場地点の目の前へ戻り (5b)(5d) が赤くなる',
        !(a4.servant.tx === 35 && a4.servant.ty === 16) && a4.d < 240, JSON.stringify(a4));
      await p4.close();
    }
    {
      const p5 = await bootPage(browser, PORT_OF.guardwest, '?diag=1&intel=0', errs, { freezeChoice: true });
      await closeAnyDialog(p5);
      await kickEnter(p5, 'n1', 'right');
      await waitNode(p5, 'n1', 12000);
      await sleep(500);
      const a5 = await p5.evaluate(() => {
        const g = window.__graphRun.graph();
        const room = g.nodes.find(n => n.id === 'n1').mapDef.rooms[0];
        const gx = sce1GrixSpot();
        return room.enemySlots.filter(s => s[0] >= 40).map(s => ({
          type: s[2],
          d: Math.round(Math.hypot((s[0] - gx.tx) * TILE_SIZE, (s[1] - gx.ty) * TILE_SIZE)),
          e: getRange((ENEMY_TYPES[s[2]] || {}).range || 'melee').engagePx,
        }));
      });
      check('(9e) ★guardwest → 護衛が EV-9 の交戦距離内に入り (3c) が赤くなる',
        a5.length === 2 && a5.some(o => o.d <= o.e),
        a5.map(o => o.type + ':' + o.d + ' vs ' + o.e).join(' / '));
      await p5.close();
    }
    {
      /* ⚠⚠ 2026-08-20 (廃坑の壁抜け): 絵の外周 1 タイルを sealRing で塞いだので、
       *   素の盤面では withRing も null になり (9g) の後半が成立しなくなった。この負の
       *   コントロールは「**外周が歩ける盤面**で降口を塞ぐと内側の道が消える」ことを
       *   測るものなので、**期待値を書き換えずに旧経路へ固定**する (?paintring=0)。
       *   スイッチが効かなくなったら (9g-装置) が声を上げる。 */
      const p7 = await bootPage(browser, PORT_OF.sealgear, '?diag=1&intel=0&paintring=0', errs, { freezeChoice: true });
      await closeAnyDialog(p7);
      await kickEnter(p7, 'n1', 'right');
      await waitNode(p7, 'n1', 12000);
      await sleep(500);
      const a7 = await p7.evaluate(() => {
        const g = window.__graphRun.graph();
        const room = g.nodes.find(n => n.id === 'n1').mapDef.rooms[0];
        const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
        const boss = { tx: room.bossSlot[0], ty: room.bossSlot[1] };
        const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
        const ring = new Set();
        for (let x = c1; x <= c2; x++) { ring.add(x + ',' + r1); ring.add(x + ',' + r2); }
        for (let y = r1; y <= r2; y++) { ring.add(c1 + ',' + y); ring.add(c2 + ',' + y); }
        const p = aStar(start.tx, start.ty, boss.tx, boss.ty, ring, null);
        const q = aStar(start.tx, start.ty, boss.tx, boss.ty, null, null);
        let ringWalk = 0;
        for (const k of ring) { const t = k.split(','); if (!isTileWall(+t[0], +t[1])) ringWalk++; }
        return { noRing: p ? p.length : null, withRing: q ? q.length : null, ringWalk: ringWalk };
      });
      check('(9g-装置) ?paintring=0 で外周が実際に歩ける (旧経路へ固定できている)',
        a7.ringWalk > 50, 'ringWalk=' + a7.ringWalk);
      check('(9g) ★sealgear → 降口を塞ぐと外周なしで玉座へ届かなくなり (4a) が赤くなる',
        a7.noRing === null && a7.withRing !== null, JSON.stringify(a7));
      await p7.close();
    }
    {
      const p6 = await bootPage(browser, PORT_OF.slotinwall, '?diag=1&intel=0', errs, { freezeChoice: true });
      const a6 = await p6.evaluate(() => {
        const g = window.__graphRun.graph();
        const room = g.nodes.find(n => n.id === 'n1').mapDef.rooms[0];
        const def = ROOM_PAINTINGS_DEF['goblin-mine'].n1;
        const r1 = def.tileBounds[0], c1 = def.tileBounds[1];
        return room.enemySlots.map(s => ({
          type: s[2], tx: s[0], ty: s[1], open: def.blocked[s[1] - r1][s[0] - c1] === '.',
        })).filter(o => !o.open);
      });
      check('(9f) ★slotinwall → 敵が絵の岩盤の中に湧き (2b) が赤くなる',
        a6.length === 1 && a6[0].tx === 40 && a6[0].ty === 15, JSON.stringify(a6));
      await p6.close();
    }

    // ══ §8 autoplay 完走 — EV-5 が本道で発火し、ボス撃破まで届く ════════════════
    if (!NO_FULL) {
      mark('§8 ?autoplay 完走 + ボス部屋化の切り替わり地点 (最大 ' +
        Math.round(FULL_TIMEOUT_MS / 1000) + '秒)');
      /* ⭐⭐⭐ **実プレイの中で観測する**。「ボス部屋になった瞬間に、ボスまで何タイルだったか」を
       *   記録すれば、手段 (フラグの立て方) ではなく目的 (玉座の手前まで来て切り替わったか) で
       *   測れる。⚠ 固定時間窓ではなく「立つまでポーリングして、立った時刻と距離を残す」形に
       *   すること (共有キューがあると固定窓は原理的にフレークする)。 */
      const watch = async (port, stopOnFlip, timeoutMs, extraQuery, ownErrs) => {
        /* ⚠⚠ 速度は **?autoplay=30** で揃える。?autoplay=N は N 倍速で (=1 だけ例外で 5 倍)、
         *   既存の driver_graph_sce1 / driver_graph_run が 30 / 25 を使っている。3 倍速で測ると
         *   ゲーム内蔵の DIAG 4 分ハード上限に引っ掛かり、**旧構成でさえ完走しない**
         *   (2026-08-20 に実測して誤読しかけた)。 */
        const pa = await bootPage(browser, port, '?autoplay=30&intel=0' + (extraQuery || ''),
                                  ownErrs || errs, {});
        const t0 = Date.now();
        let flip = null, last = null, sawFar = false;
        const trace = [];
        for (;;) {
          last = await pa.evaluate(() => {
            const pTX = Math.floor((playerX + 48) / TILE_SIZE);
            const pTY = Math.floor((playerY + 58) / TILE_SIZE);
            let dist = null;
            /* ⚠ **生きているボスだけ**を見る。alive を見ないと死体との距離を測り、
             *   「ボスの目の前なのに戦っていない」という偽の症状に見える。 */
            for (const e of enemies) {
              if (!e.def || !e.def.isBoss || !e.alive) continue;
              const sz = e.def.displaySize || 96;
              const eTX = Math.floor((e.x + sz / 2) / TILE_SIZE);
              const eTY = Math.floor((e.y + sz / 2) / TILE_SIZE);
              const d = Math.max(Math.abs(pTX - eTX), Math.abs(pTY - eTY));
              if (dist === null || d < dist) dist = d;
            }
            const aliveList = enemies.filter(e => e.alive && !e.passiveNpc && !e.inactive)
              .map(e => e.type + '@' + Math.floor((e.x + (e.def.displaySize || 96) / 2) / TILE_SIZE)
                        + ',' + Math.floor((e.y + (e.def.displaySize || 96) / 2) / TILE_SIZE));
            return {
              node: window.__graphRun.nodeId(), dist: dist, tx: pTX, ty: pTY, alive: aliveList,
              enc: !!(encounterActive || encounterRunning),
              inBoss: window.__graphRun.inBossRoom(),
              /* ⚠⚠⚠ **`window.` を付けてはいけない**。index.html は classic script なので
               *   直下の `let dungeonCleared` は **window に載らない** (レキシカルグローバル)。
               *   `window.dungeonCleared` は永久に undefined = **偽の赤**になる
               *   (2026-08-20 に実際に踏んだ: 生存敵 0 体なのに cleared=false)。 */
              cleared: !!dungeonCleared, over: !!gameOver,
              captive: (typeof sce1CaptiveState !== 'undefined') ? sce1CaptiveState : null,
              rescued: !!(typeof sceneFlags !== 'undefined' && sceneFlags.servant_rescued),
            };
          });
          trace.push({ t: Math.round((Date.now() - t0) / 1000), tx: last.tx, ty: last.ty,
                       enc: last.enc, node: last.node, dist: last.dist });
          if (last.node === 'n1' && !last.inBoss && last.dist !== null && last.dist > 8) sawFar = true;
          if (!flip && last.inBoss && last.node === 'n1') {
            flip = { dist: last.dist, at: Math.round((Date.now() - t0) / 1000) };
            if (stopOnFlip) break;
          }
          if (last.cleared || last.over) break;
          if (Date.now() - t0 >= timeoutMs) break;
          /* ⚠⚠ **ポーリングを細かくしすぎないこと**。150ms ごとの page.evaluate は
           *   ページのメインループを圧迫し、同じグラフでも driver_graph_sce1 (1 秒間隔) は
           *   183 秒で完走するのにこちらだけ 300 秒で完走しなかった (2026-08-20 実測)。
           *   = 測定器が測定対象を遅くしていた。 */
          await sleep(1000);
        }
        const secs = Math.round((Date.now() - t0) / 1000);
        await pa.close();
        /* (参考) 時間の内訳。道中が長いときに「歩いているのか戦っているのか」を
         * 分けられないと、部屋の広さと敵の数のどちらを直すべきか判断できない。 */
        const dt = 1.0;
        const encSec = Math.round(trace.filter(o => o.enc).length * dt);
        const still = [];
        for (let i = 1; i < trace.length; i++) {
          if (trace[i].tx === trace[i - 1].tx && trace[i].ty === trace[i - 1].ty) continue;
          still.push(trace[i].t + 's@' + trace[i].tx + ',' + trace[i].ty + (trace[i].enc ? '*' : ''));
        }
        console.log('[drv]   (参考) :' + port + ' 末尾の生存敵 ' + (last.alive || []).length +
          ' 体: ' + (last.alive || []).join(' '));
        console.log('[drv]   (参考) :' + port + ' 全' + secs + 's / 戦闘' + encSec +
          's / 探索' + (secs - encSec) + 's / 移動の足跡 ' + still.length + '歩');
        console.log('[drv]   (参考) ' + still.filter((_, i) => i % 6 === 0).join(' '));
        return { flip: flip, last: last, sawFar: sawFar, secs: secs, encSec: encSec };
      };

      const base = await watch(PORT, false, FULL_TIMEOUT_MS, '', baseErrs);
      check('(8a) ★★autoplay がボスを撃破してクリアまで到達する (1 枚絵の中で経路が詰まない)',
        base.last.cleared === true && base.last.over === false,
        JSON.stringify(base.last) + ' ' + base.secs + 's');
      /* ⭐ 目的そのもの: EV-5 は「寄り道」ではなく本道の隘路に置いたので、
       *   オートプレイでも必ず通りかかり、人形の状態が初期の tunnel から先へ進む。 */
      check('(8b) ★★EV-5 が実プレイで発火している (従者の状態が初期の tunnel から動いた)',
        base.last.captive !== 'tunnel' && base.last.captive !== 'none', String(base.last.captive));
      check('(8c-装置) 途中で「n1 に居るのにボスから 8 タイルより遠い」時間帯が実在した',
        base.sawFar === true, String(base.sawFar));
      check('(8d) ★★ボス部屋になった瞬間、ボスまで 8 タイル以内だった (入室即ではない)',
        !!base.flip && base.flip.dist !== null && base.flip.dist <= 8,
        JSON.stringify(base.flip));

      /* (参考) ★★ **旧構成とのペア比較**。非決定論のオートプレイでは、単体の秒数を
       *   見ても「長い」とは言えない。同じドライバ・同じ速度で ?minefold=0 を走らせ、
       *   差分で見る (戦闘の時間は敵の数が同じなのでほぼ一定のはず)。 */
      if (PAIR) {
        const oldRun = await watch(PORT, false, FULL_TIMEOUT_MS, '&minefold=0');
        console.log('[drv]   (参考) ペア比較  畳み込み: 全' + base.secs + 's (戦闘' + base.encSec +
          's / 探索' + (base.secs - base.encSec) + 's) cleared=' + base.last.cleared +
          '  旧 5 ノード: 全' + oldRun.secs + 's (戦闘' + oldRun.encSec +
          's / 探索' + (oldRun.secs - oldRun.encSec) + 's) cleared=' + oldRun.last.cleared);
      }

      const mut = await watch(PORT_OF.noapproach, true, 90000, '', []);
      check('(8e) ★noapproach → 玉座から遠いまま入室しただけでボス部屋になり (8d) が赤くなる',
        !!mut.flip && mut.flip.dist !== null && mut.flip.dist > 8,
        '素=' + JSON.stringify(base.flip) + ' / 変異=' + JSON.stringify(mut.flip));
    }

    // ══ §E エラーゼロ ═══════════════════════════════════════════════════════════
    mark('§E ページ例外 / console.error');
    /* ⚠ [DIAG] はゲーム内蔵の**自動デバッグチャネル**で、JS の例外ではない。
     *   §1 の測定用ページを 10 分開けっ持なしにするドライバの都合で
     *   stall / combat-stall / run-timeout が必ず出るので、ここでは除く。
     *   ⭐ ただし**黙って見逃すのではなく**、実プレイ (autoplay) ページだけを
     *   (E2) で別に厳しく見る (こちらは 226 秒でクリアして閉じるので上限に掛からない)。 */
    const hardErrs = errs.filter(e => e.indexOf('[DIAG]') < 0);
    check('(E1) 全ページで pageerror / console.error が 0 ([DIAG] の自動デバッグ記録を除く)',
      hardErrs.length === 0, hardErrs.slice(0, 4).join(' | ') || 'none');
    if (errs.length !== hardErrs.length) {
      console.log('[drv]   (参考) 除外した [DIAG] 記録 ' + (errs.length - hardErrs.length) + ' 件: ' +
        errs.filter(e => e.indexOf('[DIAG]') >= 0).slice(0, 3).join(' | '));
    }
    if (!NO_FULL) {
      check('(E2) ★実プレイ (autoplay) のページは DIAG も含めて記録ゼロで完走した',
        baseErrs.length === 0, baseErrs.slice(0, 3).join(' | ') || 'none');
    }

    await page.close();
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
