#!/usr/bin/env node
/*
 * driver_graph_sce1.js — [P5] シナリオ1「廃坑」の分岐版 + EV-2/EV-5/EV-9 の再アンカー
 * ══════════════════════════════════════════════════════════════════════════════
 * P5 の主張は 6 つ:
 *
 *   ① 廃坑 (goblin-mine) が **既定で分岐版になる**。出所は index.html 内蔵の
 *      buildGoblinMineRun() で、生成クエストのペイロードにも dev シームにも依存しない。
 *   ② グラフが企画どおりの形をしている = **行き止まりありの木** / boss へ到達可能 /
 *      1枚絵は n4/n7 の 2 ノードだけ (★P7 で null → ノード専用の絵へ言い直した) /
 *      lintRun が **error 0 かつ warning 0**。
 *   ③ EV-2 / EV-5 / EV-9 が **ノードへ再アンカー**されている。
 *      旧アンカーは「ROOMS[0] の西端から東へ +N」= 西から進入する前提で、分岐版では成立しない。
 *   ④ **旧経路 (SCE1_EVENTS + tryInteractSce1Event) は分岐版で完全に死んでいる**。
 *      生きていると 400ms tick が入室のたびにモーダルを開き、出口選択が永久に止まって詰む。
 *   ⑤ 「縛られた従者」の**状態はノードを跨いで持ち越し、DOM はノードごとに作り直す**。
 *      横穴 (n6) では bound / 玉座 (n7) では hanging / 他のノードには 1 要素も無い。
 *   ⑥ `?graph=0` で従来の単一マップへ完全に戻り、**他の 5 シナリオと生成クエストは
 *      分岐しない** (内蔵グラフが themeId 経由で他所へ漏れていない)。
 *
 * ⭐ **本命は §7**: ボス部屋は 9 列しかなく、入場地点 (col34) から最寄りの護衛 (col39) まで
 *    5 タイル = 480px に対し近接の交戦距離 engagePx は 400px。400ms tick を待つ間に heroAI が
 *    前進すると**先に戦闘が始まり、EV-9 が永久に開かない**。enterNode 末尾の
 *    `await tryInteractNodeEvent()` (rAF が 1 フレームも回らない同期の続き) がそれを潰している
 *    ことを、変異 noimmediate との対比で実測する。
 *
 * ■ 負のコントロールは **同一 run に内包**する。PORT に素、PORT+1..PORT+5 に
 *   「1 箇所だけ潰した変異版」を**同時に**配り、同じ検出器を両方へ当てる。
 *
 *     port  | mutate       | 注入する欠陥                                  | 赤くなるべき検出器
 *     ------|--------------|-----------------------------------------------|-------------------
 *     +1    | noscen       | buildScenarioRun が廃坑を引き当てない          | (N1) 分岐が立たない
 *     +2    | oldtick      | 旧 tryInteractSce1Event の RUN ゲートを外す    | (N2) 旧経路が n0 で暴発
 *     +3    | noimmediate  | enterNode 末尾の即時イベント判定を殺す         | (N3) EV-9 が戦闘前に開かない
 *     +4    | nocarry      | 遷移で sce1CaptiveState を毎回落とす           | (N4) 玉座に人影が無い
 *     +5    | noowner      | 「そのノードに居るか」の判定を外す             | (N5) 全ノードに人影が湧く
 *
 * ⚠ 変異は**ディスクを書き換えず配信をメモリ上で差し替える** (復元漏れが原理的に起きない)。
 * ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
 * ⚠⚠ **enterNode は「到着直後のイベント」を await する**ので、イベントのあるノードへ入ると
 *   `g.enter()` の Promise は**ダイアログに答えるまで解決しない**。ドライバは await せず
 *   `window.__p5enter` に握ってポーリングすること (この性質そのものが (7a) の検出器)。
 *
 * 使い方:
 *   node tools/driver_graph_sce1.js
 *   node tools/driver_graph_sce1.js --no-full      (§10 の autoplay 完走だけ飛ばす)
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
/* ⚠ ポートは既存ドライバと 4 以上空ける。本ドライバは PORT..PORT+5 の **6 本**を掴む。
 *   8910-8915 が未使用であることは `grep -rn "891[0-9]" tools/*.js` が 0 件で実測 (2026-08-08)。 */
const PORT = parseInt(arg('port', '8910'), 10);
const FULL_TIMEOUT_MS = parseInt(arg('fulltimeout', '260000'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  noscen: [
    '      if (scenId === "goblin-mine") return buildGoblinMineRun();',
    '      if (scenId === "goblin-mine-disabled") return buildGoblinMineRun();'],
  oldtick: [
    '      if (RUN) return;',
    '      if (0) return;'],
  noimmediate: [
    '      await tryInteractNodeEvent();',
    '      await Promise.resolve(0);'],
  nocarry: [
    '      if (!RUN) sce1CaptiveState = "none";',
    '      if (RUN || 1) sce1CaptiveState = "none";'],
  /* ⚠ 置換後の長さを**必ず 1 文字以上ずらす**こと。素の `return;` + 空白 11 と
   *   `{ /*off* /}` + 空白 7 が偶然どちらも 18 文字で、(0b) 「素と変異でバイト長が違う」が
   *   HEAD 時点から赤かった (2026-08-08 実測。P4.7 の nogate と同じ罠の再演)。 */
  noowner: [
    '      if (currentNodeId !== sce1CaptiveOwnerNode()) return;           // 他のノードには居ない',
    '      if (currentNodeId !== sce1CaptiveOwnerNode()) { /*off*/ }      // 他のノードには居ない'],
};
const MUT_ORDER = ['noscen', 'oldtick', 'noimmediate', 'nocarry', 'noowner'];
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

/* ページを起動する。⚠ evaluateOnNewDocument は全ナビゲーションで再実行されるので、
 *   ここには「毎回同じ形へ整える」ものだけを置く (破壊系は置かない = 最頻ハマり)。 */
async function bootPage(browser, port, query, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('[:' + port + '] PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('[:' + port + '] CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((scen, genJson) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', scen);
      if (genJson) sessionStorage.setItem('dragonfighters.generatedScenario', genJson);
      else sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    // Lv10 相当。検証中の全滅で止まらないようにする (勝率ではなく機構を測るため)
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, opts.scen || 'goblin-mine', opts.gen || null);
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function' && typeof sce1WatchSpot === 'function'",
    { timeout: 25000 });
  /* ⚠⚠ **これを忘れると検出器が丸ごと沈黙する**。tryInteractNodeEvent は
   *   `if (!gameStarted …) return;` で始まるが、ドライバは開始画面をタップしないので
   *   gameStarted は false のまま = **イベントが 1 件も発火せず、しかもエラーも出ない**。
   *   2026-08-08 に実際に踏み、「EV が壊れている」と誤読しかけた。startGame() を通すのが
   *   最も本編に忠実 (開始画面を隠し setPhase("explore") まで同じ経路を踏む)。
   *   ⚠ 前提が整っていることは (G0) が毎回検算する (前提を assert しないと同じ罠に再び落ちる)。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  /* ⚠⚠ **出口選択 UI を止めないとイベントが 1 件も測れない**。ノードが片付いていると
   *   400ms tick が chooseExit → showExitArrows を開き、その間ずっと `nodeBusy = true` になる。
   *   矢印は「タップされるまで」解決しないので、ドライバでは**永久に nodeBusy が下りず**、
   *   tryInteractNodeEvent が冒頭で早期 return し続ける (= 検出器が全部沈黙する)。
   *   2026-08-08 に実際に踏み、EV-2/5/9 の 12 件が「実装が壊れている」ように見えた。
   *   → 到着猶予 (nodeChoiceCooldownUntil) を常に未来へ押し続けて選択を止める。
   *   ⚠ ?autoplay のページには掛けない (§10 は出口選択そのものを走らせる必要がある)。
   *   ⚠ これは**ドライバ側の隔離装置**であって実装のバグ回避ではない。本編では到着直後の
   *     即時判定 (enterNode 末尾) がイベントを先に開くので、矢印と競合しない。 */
  if (opts.freezeChoice) {
    await page.evaluate(() => {
      window.__p5freeze = setInterval(() => { nodeChoiceCooldownUntil = Date.now() + 60000; }, 150);
      nodeChoiceCooldownUntil = Date.now() + 60000;
    });
  }
  return page;
}

// #choiceDialog の観測 / 操作 (driver_sce1_events の作法をそのまま写す)
async function readDialog(page) {
  return page.evaluate(() => {
    const d = document.getElementById('choiceDialog');
    if (!d || !d.classList.contains('show')) return null;
    return { msg: (d.querySelector('.choiceMessage') || {}).textContent || '',
             labels: Array.from(d.querySelectorAll('.choiceButtons button')).map(b => b.textContent) };
  });
}
async function waitDialog(page, ms) {
  const t0 = Date.now();
  for (;;) {
    const info = await readDialog(page);
    if (info) return info;
    if (Date.now() - t0 >= ms) return null;
    await sleep(100);
  }
}
// idx 0..2 = 候補 / -1 = キャンセル (Esc と同じ resolve(null) 経路)
async function clickChoice(page, idx) {
  await page.evaluate((i) => {
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    const b = (i < 0) ? btns[btns.length - 1] : btns[i];
    if (b) b.click();
  }, idx);
}
/* ノードへ入る。⚠⚠ **await しない**。enterNode は到着直後のイベントを await するので、
 *   イベントのあるノードでは「ダイアログに答えるまで」解決しない。 */
async function kickEnter(page, toId, viaDir) {
  /* ⚠ 「解決した瞬間にダイアログが開いていたか」は**ページ側で同期に**採る。ドライバから
   *   ポーリングで見ると 100ms の隙に 400ms tick が開けてしまい、変異側の判定がフレークする
   *   (2026-08-08 に実測: enterDone=true / dialogAtResolve=open で N3 が落ちた)。 */
  await page.evaluate((to, dir) => {
    window.__p5enterDone = false;
    window.__p5dlgAtResolve = null;
    window.__p5enter = window.__graphRun.enter(to, dir).then(() => {
      const d = document.getElementById('choiceDialog');
      window.__p5dlgAtResolve = !!(d && d.classList.contains('show'));
      window.__p5enterDone = true;
    });
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
async function captiveDom(page) {
  return page.evaluate(() => {
    const nl = document.getElementById('nodeLayer');
    const els = nl ? Array.from(nl.querySelectorAll('.sce1Captive')) : [];
    return { count: els.length, cls: els.map(e => e.className).join('|'),
             state: (typeof sce1CaptiveState !== 'undefined') ? sce1CaptiveState : '(absent)' };
  });
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 http://localhost:' + PORT +
    '   変異 ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const profile = require('./_pptr_profile')('df_graph_sce1_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });
  const errs = [], errsMut = [];

  // ══ §0 変異が本当に配信へ載っているか (空振り検出) ══════════════════════════
  mark('変異の配信検算');
  {
    /* ⚠ **Buffer で受けてから 1 度だけ decode する**。チャンク境界で日本語 (3 バイト) が
     *   割れると、チャンクごとの toString が置換文字を挟んで**文字数を変えてしまう**。
     *   2026-08-08 に実際に踏み、(0b-nocarry) が「素と変異のバイト長が同じ」と誤報した
     *   (実際は ASCII 4 文字ぶん必ず違う)。長さの比較は Buffer の**バイト長**で行う。 */
    const get = (p) => new Promise((res, rej) => {
      http.get('http://localhost:' + p + '/index.html', r => {
        const cs = []; r.on('data', d => cs.push(d));
        r.on('end', () => { const buf = Buffer.concat(cs);
          res({ s: buf.toString('utf8'), bytes: buf.length }); });
      }).on('error', rej);
    });
    const pure = await get(PORT);
    for (const k of MUT_ORDER) {
      const b = await get(PORT_OF[k]);
      const from = MUTATIONS[k][0], to = MUTATIONS[k][1];
      check('(0-' + k + ') 変異が :' + PORT_OF[k] + ' の配信にだけ乗っている',
        (pure.s.split(from).length - 1) === 1 && pure.s.indexOf(to) < 0 &&
        b.s.indexOf(from) < 0 && (b.s.split(to).length - 1) === 1,
        'pure{from:' + (pure.s.split(from).length - 1) + ',to:' + (pure.s.indexOf(to) >= 0) + '} ' +
        'mut{from:' + (b.s.indexOf(from) >= 0) + ',to:' + (b.s.split(to).length - 1) + '}');
      check('(0b-' + k + ') 素と変異でバイト長が違う (同じ物を 2 回測っていない)',
        pure.bytes !== b.bytes, '素=' + pure.bytes + 'B / 変異=' + b.bytes + 'B');
    }
  }

  // ══ §1 廃坑が既定で分岐版になる ═══════════════════════════════════════════
  mark('内蔵グラフ (goblin-mine) が既定で立ち上がる');
  const page = await bootPage(browser, PORT, '?diag=1&intel=0', errs, { freezeChoice: true });
  const G = await page.evaluate(() => {
    const g = window.__graphRun, gr = g.graph();
    return {
      active: g.active(), nodeId: g.nodeId(), boss: g.bossNodeId(), parent: g.parent(),
      scenarioId: scenarioId,
      nodes: gr.nodes.map(n => n.id + ':' + n.kind),
      rects: gr.nodes.map(n => n.id + '=' + JSON.stringify(n.mapDef.rooms[0].rect)),
      /* ★P7: 「絵を貼るのはどのノードか」と「その絵が伸縮なしで載るか」を分けて採る。
       *   ⚠ same は tileBounds と部屋 rect の**完全一致**で見る (比率一致より強い条件だが、
       *     ノード用の絵は部屋ぴったりに作る約束なので、緩めると座標のズレを取り逃がす)。 */
      paintKeys: gr.nodes.map(n => { const p = n.mapDef.rooms[0].painting;
                                     return p ? p.key : 'null'; }),
      paintFit: gr.nodes.filter(n => n.mapDef.rooms[0].painting).map(n => {
        const rm = n.mapDef.rooms[0], p = rm.painting;
        const b = DFMapDef.paintingBoundsFor(p.theme, p.key);
        return { node: n.id, key: p.key, src: DFMapDef.paintingSrcFor(p.theme, p.key),
                 same: !!b && JSON.stringify(b) === JSON.stringify(rm.rect) };
      }),
      objectives: gr.nodes.map(n => n.mapDef.objective.kind),
      themes: gr.nodes.map(n => n.mapDef.themeId),
      slotCounts: gr.nodes.map(n => n.id + ':' + (n.mapDef.rooms[0].enemySlots || []).length +
                                    (n.mapDef.rooms[0].bossSlot ? '+B' : '')),
      lint: (() => { const l = DFMapDef.lintRun(gr);
        return { ok: l.ok, e: l.errors.map(x => x.code), w: l.warnings.map(x => x.code + '@' + (x.nodeId || '')) }; })(),
      board: (() => { const b = g.board(); delete b.mapDataText; return b; })(),
      start: [START_TX, START_TY],
      rooms: JSON.parse(JSON.stringify(ROOMS)),
    };
  });
  check('(1a) RUN が立ち、現在ノードが entry (n0)', G.active === true && G.nodeId === 'n0',
    'active=' + G.active + ' node=' + G.nodeId);
  check('(1b) ★scenarioId は "goblin-mine" のまま (生成クエストに化けていない)',
    G.scenarioId === 'goblin-mine', G.scenarioId);
  check('(1c) ノードは 8 件で kind が企画どおり',
    G.nodes.join(',') === 'n0:start,n1:event,n2:search,n3:loot,n4:combat,n5:rest,n6:event,n7:boss',
    G.nodes.join(','));
  check('(1d) boss ノードは n7', G.boss === 'n7', String(G.boss));
  check('(1e) ★行き止まりありの「木」 (親が 1 つずつ / entry に親なし)',
    G.parent.n1 === 'n0' && G.parent.n2 === 'n0' && G.parent.n3 === 'n0' &&
    G.parent.n4 === 'n1' && G.parent.n5 === 'n1' && G.parent.n6 === 'n2' &&
    G.parent.n7 === 'n4' && G.parent.n0 === undefined, JSON.stringify(G.parent));
  check('(1f) 全ノードの themeId が goblin-mine', G.themes.every(t => t === 'goblin-mine'),
    G.themes.join(','));
  check('(1g) 全ノードの objective が defeatBoss (クリア条件がボス撃破)',
    G.objectives.every(o => o === 'defeatBoss'), G.objectives.join(','));
  /* ★P7 (2026-08-12) で母集団 (「全ノード painting:null」) が仕様ごと消えたので、
   *   期待値を書き換えるのではなく**不変条件を言い直した**。P5 が守りたかったのは
   *   「7x6 の部屋に載らない絵が無言で貼られていないこと」であって null そのものではない。
   *   新しい言い方 = 絵を貼るノードは n4 (山場) / n7 (ボス) のちょうど 2 つで、
   *   その参照は必ずカタログから引け、覆う矩形が部屋の rect と**同一**であること
   *   (同一なら 5引数 drawImage は 1 ピクセルも伸縮しない)。 */
  check('(1h) ★1枚絵は n4 / n7 のちょうど 2 ノード (残り 6 つは null)',
    G.paintKeys.join(',') === 'null,null,null,null,n4,null,null,n7', G.paintKeys.join(','));
  check('(1h2) ★その 2 枚はカタログから引け、覆う矩形が部屋の rect と完全一致 (伸縮ゼロ)',
    G.paintFit.length === 2 && G.paintFit.every(p => p.src && p.same === true),
    JSON.stringify(G.paintFit));
  check('(1i) 道中 7 ノードは 7 列 x 6 行 [11,33,16,39]',
    G.rects.filter(s => s.indexOf('n7=') !== 0).every(s => s.indexOf('[11,33,16,39]') > 0),
    G.rects.join(' '));
  check('(1j) ボスノードだけ 9 列 x 6 行 [11,32,16,40]',
    G.rects.filter(s => s.indexOf('n7=') === 0)[0] === 'n7=[11,32,16,40]',
    G.rects.filter(s => s.indexOf('n7=') === 0)[0]);
  check('(1k) 起点は部屋の中心 (36,13)', G.start.join(',') === '36,13', G.start.join(','));
  check('(1l) ★lintRun が error 0 / warning 0 (graph-painting-aspect も出ない)',
    G.lint.ok === true && G.lint.e.length === 0 && G.lint.w.length === 0,
    'e=' + JSON.stringify(G.lint.e) + ' w=' + JSON.stringify(G.lint.w));

  // ── 母集団ガード (真空 PASS 対策) ─────────────────────────────────────────
  mark('母集団ガード');
  /* ⚠⚠ (G0) が無いと、以降のイベント検出器 (§4/§5/§7) が**全部沈黙したまま緑に見える**
   *   ことはないが、逆に「全部赤い」原因が実装なのか前提なのか切り分けられない。
   *   2026-08-08 に実際に gameStarted=false で 12 件が赤くなり、実装を疑って時間を溶かした。 */
  check('(G0) ★前提: gameStarted が true (イベントの発火条件が整っている)',
    (await page.evaluate(() => gameStarted)) === true, '');
  check('(G1) ★entry (kind:"start") は敵 0 体 = 開幕ナレを戦闘で潰さない',
    G.board.enemies === 0 && G.board.spawns === 0,
    'enemies=' + G.board.enemies + ' spawns=' + G.board.spawns);
  check('(G2) entry には罠も宝箱も 0 個 (P4: 罠=search / 玄室宝箱=loot だけ)',
    G.board.traps === 0 && G.board.chests === 0,
    'traps=' + G.board.traps + ' chests=' + G.board.chests);
  check('(G3) ノードの部屋は 1 つ (1 ノード = 1 部屋)',
    G.board.rooms === 1 && G.board.bossRoomIdx === 0,
    'rooms=' + G.board.rooms + ' bossRoomIdx=' + G.board.bossRoomIdx);
  check('(G4) ★敵スロットが「event / rest / start は 0 体」「combat と boss には居る」',
    G.slotCounts.join(' ') === 'n0:0 n1:0 n2:3 n3:2 n4:7 n5:0 n6:0 n7:2+B', G.slotCounts.join(' '));
  check('(G5) mapData が実体を持つ 72x28 (床と岩盤が両方ある)',
    await page.evaluate(() => mapData.length === 28 && mapData[0].length === 72 &&
      mapData.some(r => r.some(v => v === 0)) && mapData.some(r => r.some(v => v === 2))), '');

  // ══ §2 出口タイルが部屋の縁から導出されている ═══════════════════════════════
  mark('出口タイルの幾何');
  const EX = await page.evaluate(() => {
    const gr = window.__graphRun.graph(), out = {};
    for (const n of gr.nodes) out[n.id] = n.exits.map(e => e.to + ':' + e.dir + '@' + e.at.join(','));
    return out;
  });
  check('(2a) n0 の 3 本が 右[39,13] / 上[36,11] / 下[36,16]',
    EX.n0.join(' ') === 'n1:right@39,13 n2:up@36,11 n3:down@36,16', EX.n0.join(' '));
  check('(2b) 行き止まりは n3 / n5 / n6 / n7 の 4 つ',
    EX.n3.length === 0 && EX.n5.length === 0 && EX.n6.length === 0 && EX.n7.length === 0,
    JSON.stringify({ n3: EX.n3.length, n5: EX.n5.length, n6: EX.n6.length, n7: EX.n7.length }));
  check('(2c) ★前進の向きが「引き返す向き」と衝突していない (right で入った先は left へ戻る)',
    EX.n1.every(s => s.indexOf(':left@') < 0) && EX.n4.every(s => s.indexOf(':left@') < 0),
    EX.n1.join(' ') + ' / ' + EX.n4.join(' '));
  check('(2d) 出口タイルは全て床 (lint の graph-gate-not-floor が鳴っていない)',
    G.lint.e.indexOf('graph-gate-not-floor') < 0, JSON.stringify(G.lint.e));

  // ══ §3 EV の再アンカー ═══════════════════════════════════════════════════
  mark('EV-2 / EV-5 / EV-9 の再アンカー');
  const A = await page.evaluate(() => ({
    events: NODE_EVENTS.map(e => ({ key: e.key, nodeId: e.nodeId, kind: e.kind, radius: e.radius })),
    ids: window.__graphRun.graph().nodes.map(n => n.id),
    boss: window.__graphRun.bossNodeId(),
    watch: sce1WatchSpot(), servant: sce1ServantSpot(), grix: sce1GrixSpot(),
    legacyLen: SCE1_EVENTS.length,
    gateOffsets: [SCE1_WATCH_OFFSET_TX, SCE1_SERVANT_NODE_DX, SCE1_GRIX_OFFSET_TX],
    entryInset: NODE_ENTRY_INSET,
    radiusConst: SCE1_EVENT_RADIUS,
  }));
  check('(3a) NODE_EVENTS に 3 件 (mine_watch / captive_servant / grix_parley)',
    A.events.map(e => e.key).join(',') === 'mine_watch,captive_servant,grix_parley',
    A.events.map(e => e.key).join(','));
  check('(3b) ★どの nodeId も実在するノード id (食い違うとイベントが静かに消える)',
    A.events.every(e => A.ids.indexOf(e.nodeId) >= 0),
    A.events.map(e => e.key + '@' + e.nodeId).join(' '));
  check('(3c) 割り当ては EV-2=n1 / EV-5=n6 / EV-9=bossNodeId',
    A.events[0].nodeId === 'n1' && A.events[1].nodeId === 'n6' && A.events[2].nodeId === A.boss,
    A.events.map(e => e.nodeId).join(','));
  check('(3d) 半径は旧 SCE1_EVENT_RADIUS(240) を引き継いでいる (新しい数字を発明していない)',
    A.events.every(e => e.radius === A.radiusConst) && A.radiusConst === 240,
    A.events.map(e => e.radius).join(',') + ' const=' + A.radiusConst);
  check('(3e) ★spot が「現在ノードの部屋」から導出される (n0 の部屋 c1=33 基準)',
    A.watch.tx === 33 + A.gateOffsets[0] && A.servant.tx === 33 + A.gateOffsets[1] &&
    A.grix.tx === 33 + A.gateOffsets[2] &&
    A.watch.ty === 13 && A.servant.ty === 13 && A.grix.ty === 13,
    JSON.stringify([A.watch, A.servant, A.grix]));
  check('(3f) ★EV-9 のオフセット(2) と NODE_ENTRY_INSET(2) が同値 = 入場地点にちょうど落ちる',
    A.gateOffsets[2] === A.entryInset, A.gateOffsets[2] + ' vs ' + A.entryInset);
  check('(3g) 旧台帳 SCE1_EVENTS は 3 行のまま残っている (器を作り替えていない)',
    A.legacyLen === 3, String(A.legacyLen));

  // ── 旧経路が死んでいること ────────────────────────────────────────────────
  mark('旧経路 (tryInteractSce1Event) が分岐版で死んでいる');
  const legacyFire = await page.evaluate(() => {
    const s = sce1WatchSpot();                       // 分岐版では n0 の部屋の中 (36,13)
    playerX = s.tx * TILE_SIZE + TILE_SIZE / 2 - 48;
    playerY = s.ty * TILE_SIZE + TILE_SIZE / 2 - 58;
    tryInteractSce1Event();                          // ★await しない (発火すると解決しない)
    return { fired: SCE1_EVENTS[0].fired, busy: SCE1_EVENTS[0].busy };
  });
  await sleep(600);
  const legacyDlg = await readDialog(page);
  check('(3h) ★旧 400ms tick は分岐版で 1 件も発火しない (出口選択が永久に止まる詰みの解消)',
    legacyFire.fired === false && legacyFire.busy === false && legacyDlg === null,
    JSON.stringify(legacyFire) + ' dialog=' + (legacyDlg ? legacyDlg.msg.slice(0, 20) : 'none'));
  const cap0 = await captiveDom(page);
  check('(3i) 起動直後は縛られた従者の DOM がどこにも無い (n0 は所有ノードではない)',
    cap0.count === 0 && cap0.state === 'tunnel', JSON.stringify(cap0));

  // ══ §4 EV-2 が n1 で発火する ═════════════════════════════════════════════
  mark('EV-2 「廃坑の入口の見張り」 @ n1');
  await kickEnter(page, 'n1', 'right');
  const d2 = await waitDialog(page, 8000);
  const st2 = await page.evaluate(() => ({
    node: window.__graphRun.nodeId(), enterDone: window.__p5enterDone,
    encounter: encounterActive || encounterRunning, enemies: enemies.length,
    spot: sce1WatchSpot(),
  }));
  check('(4a) n1 へ遷移し、到着直後に EV-2 のダイアログが開く',
    st2.node === 'n1' && !!d2 && d2.msg.indexOf('坑道の入口に見張りが二匹') >= 0,
    st2.node + ' / ' + (d2 ? d2.msg.slice(0, 24) : 'none'));
  check('(4b) ★文面と選択肢は旧実装のまま (再アンカーで文面を触っていない)',
    !!d2 && d2.labels.length === 4 &&
    d2.labels[0].indexOf('静かに近づく') >= 0 && d2.labels[1].indexOf('骨笛を狙って射る') >= 0 &&
    d2.labels[2].indexOf('わざと姿を見せて誘い出す') >= 0,
    d2 ? d2.labels.join(' | ') : 'none');
  check('(4c) event ノードは敵 0 体 = 戦闘が始まらないのでイベントが必ず開く',
    st2.enemies === 0 && st2.encounter === false,
    'enemies=' + st2.enemies + ' encounter=' + st2.encounter);
  check('(4d) EV-2 のアンカーが n1 の部屋から導出されている (36,13)',
    st2.spot.tx === 36 && st2.spot.ty === 13, JSON.stringify(st2.spot));
  check('(4e) ★enterNode はイベントを await している (答えるまで解決しない)',
    st2.enterDone === false, String(st2.enterDone));
  await clickChoice(page, 2);                     // 「誘い出す」= 判定なし枠 (ダイス演出が出ない)
  await sleep(800);
  const after2 = await page.evaluate(() => ({
    enterDone: window.__p5enterDone, fired: window.__graphRun.eventFired('mine_watch'),
    alerted: sceneFlags.mine_alerted, skill: skillCheckActive,
  }));
  check('(4f) 選ぶと enterNode が解決し、発火が nodeState.eventsFired へ焼かれる',
    after2.enterDone === true && after2.fired === true && after2.skill === false,
    JSON.stringify(after2));
  check('(4g) 判定なし枠なので mine_alerted は立たない (結果の分岐が旧実装のまま)',
    after2.alerted === false, String(after2.alerted));

  // ══ §5 EV-5 が n6 で発火する + 縛られた従者の DOM ══════════════════════════
  mark('EV-5 「捕らわれた従者」 @ n6');
  await kickEnter(page, 'n6', 'right');
  const d5 = await waitDialog(page, 8000);
  const cap5 = await captiveDom(page);
  const st5 = await page.evaluate(() => ({
    node: window.__graphRun.nodeId(), spot: sce1ServantSpot(), enemies: enemies.length,
  }));
  check('(5a) n6 へ遷移し、到着直後に EV-5 のダイアログが開く',
    st5.node === 'n6' && !!d5 && d5.msg.indexOf('横穴の奥から、くぐもった呻き声') >= 0,
    st5.node + ' / ' + (d5 ? d5.msg.slice(0, 24) : 'none'));
  check('(5b) ★文面と選択肢は旧実装のまま',
    !!d5 && d5.labels[0].indexOf('声の方向を調べる') >= 0 &&
    d5.labels[1].indexOf('すぐ助けに向かう') >= 0 && d5.labels[2].indexOf('敵の罠だと見て迂回する') >= 0,
    d5 ? d5.labels.join(' | ') : 'none');
  check('(5c) ★横穴には縛られた姿 (.sce1Captive.bound) がちょうど 1 つある',
    cap5.count === 1 && cap5.cls.indexOf('bound') >= 0 && cap5.state === 'tunnel',
    JSON.stringify(cap5));
  check('(5d) EV-5 のアンカーが n6 の部屋の西端 +4 = (37,13)',
    st5.spot.tx === 37 && st5.spot.ty === 13, JSON.stringify(st5.spot));
  await clickChoice(page, 2);                     // 「迂回する」= 判定なし枠 → 玉座へ運ばれる
  await sleep(900);
  const after5 = await captiveDom(page);
  check('(5e) 「迂回する」で状態が throne へ移り、姿が hanging になる',
    after5.state === 'throne' && after5.cls.indexOf('hanging') >= 0 && after5.count === 1,
    JSON.stringify(after5));
  check('(5f) 救出していないので servant_rescued は false のまま',
    (await page.evaluate(() => sceneFlags.servant_rescued)) === false, '');

  // ══ §6 状態はノードを跨いで持ち越す ═══════════════════════════════════════
  mark('縛られた従者の状態がノードを跨ぐ');
  await kickEnter(page, 'n2', 'up');              // 一度まったく関係ないノードを挟む
  await waitNode(page, 'n2', 10000);
  await sleep(400);
  const capMid = await captiveDom(page);
  check('(6a) ★別のノードでは姿は 1 つも無いが、状態 (throne) は保たれている',
    capMid.count === 0 && capMid.state === 'throne', JSON.stringify(capMid));

  // ══ §7 ★本命 — EV-9 がボス部屋で「戦闘が始まる前に」開く ═══════════════════
  mark('EV-9 「玉座のグリクス」 @ n7 — 戦闘前に開くこと');
  await kickEnter(page, 'n7', 'right');
  const d9 = await waitDialog(page, 10000);
  const st9 = await page.evaluate(() => ({
    node: window.__graphRun.nodeId(), enterDone: window.__p5enterDone,
    encounter: encounterActive || encounterRunning,
    enemies: enemies.length, alive: enemies.filter(e => e.alive).length,
    types: enemies.map(e => e.type).join(','),
    px: playerX / TILE_SIZE, spot: sce1GrixSpot(),
    nearest: Math.min.apply(null, enemies.map(e =>
      Math.abs((e.x + (e.def.displaySize || 96) / 2) - (playerX + 48)))),
    inBoss: !!window.__inBossRoom,
  }));
  const cap9 = await captiveDom(page);
  check('(7a) ★★n7 へ入った直後に EV-9 が開き、**まだ戦闘は始まっていない**',
    st9.node === 'n7' && !!d9 && st9.encounter === false && st9.enterDone === false,
    'node=' + st9.node + ' dialog=' + (d9 ? 'yes' : 'no') + ' encounter=' + st9.encounter);
  check('(7b) 見出しは「未救出」側 (柱に縛りつけられた人影)',
    !!d9 && d9.msg.indexOf('柱に縛りつけられた人影') >= 0, d9 ? d9.msg.slice(0, 30) : 'none');
  check('(7c) ★選択肢は 3 + Esc で 1 つも消えていない (§4.1 原則)',
    !!d9 && d9.labels.length === 4 && d9.labels[0].indexOf('従者の解放を要求する') >= 0 &&
    d9.labels[1].indexOf('積荷を渡すふりをする') >= 0 && d9.labels[2].indexOf('問答無用で突撃する') >= 0,
    d9 ? d9.labels.join(' | ') : 'none');
  check('(7d) ★玉座にはボス + 護衛 2 が居る (敵が居るのにイベントが開いた = 猶予が本当にある)',
    st9.enemies === 3 && st9.alive === 3 && st9.types.indexOf('goblinKing') >= 0,
    st9.enemies + '体 ' + st9.types);
  check('(7e) 入場地点から最寄りの敵まで交戦距離 400px より遠い (§7a が成立する幾何的な理由)',
    st9.nearest > 400, Math.round(st9.nearest) + 'px');
  check('(7f) EV-9 のアンカーが入場地点にちょうど落ちる (西端 32 + 2 = 34)',
    st9.spot.tx === 34 && st9.spot.ty === 13 && Math.round(st9.px) === 34,
    JSON.stringify(st9.spot) + ' player=' + st9.px);
  check('(7g) ★玉座に人影がある = 横穴の帰結がノードを跨いで届いている',
    cap9.count === 1 && cap9.cls.indexOf('hanging') >= 0 && cap9.state === 'throne',
    JSON.stringify(cap9));
  check('(7h) __inBossRoom が kind から引き直されている', st9.inBoss === true, String(st9.inBoss));
  await clickChoice(page, 2);                     // 「突撃」= 判定なし枠
  await sleep(1000);
  const after9 = await page.evaluate(() => ({
    enterDone: window.__p5enterDone, outcome: sce1GrixOutcome, armed: hostageRedirectArmed,
    fired: window.__graphRun.eventFired('grix_parley'),
  }));
  check('(7i) 突撃で decide し、人質の肩代わりが仕掛けられる (ボス戦への接続が生きている)',
    after9.enterDone === true && after9.outcome === 'charge' && after9.armed === true &&
    after9.fired === true, JSON.stringify(after9));

  /* ⚠ ここで**必ず閉じる**。出口選択を凍結したページを開いたまま残すと、パーティが
   *   何分も同じタイルに立ち続け、?diag のウォッチドッグが `[DIAG][stall] 探索停滞`
   *   (console.error) を吐いて (E1) が赤くなる。実装の欠陥ではなくドライバの居残りが原因
   *   (2026-08-08 に実測: PORT=素のページ / (34,13) = §7 が置き去りにしたボス部屋の入口)。 */
  await page.close();

  // ══ §8 ?graph=0 で従来の単一マップへ完全に戻る ════════════════════════════
  mark('?graph=0 の撤退スイッチ');
  const pg0 = await bootPage(browser, PORT, '?diag=1&intel=0&graph=0', errs);
  const Z = await pg0.evaluate(() => ({
    active: window.__graphRun.active(), nodeId: window.__graphRun.nodeId(),
    rooms: JSON.parse(JSON.stringify(ROOMS)), start: [START_TX, START_TY],
    nodeEvents: NODE_EVENTS.length, legacy: SCE1_EVENTS.length,
    watch: sce1WatchSpot(), servant: sce1ServantSpot(), grix: sce1GrixSpot(),
    captiveState: sce1CaptiveState,
    captiveCount: document.querySelectorAll('.sce1Captive').length,
    spawns: ENEMY_SPAWNS.length, enemies: enemies.length,
    scenarioId: scenarioId, objectiveRooms: OBJECTIVE_ROOMS,
  }));
  check('(8a) RUN が立たない / currentNodeId が null', Z.active === false && Z.nodeId === null,
    'active=' + Z.active + ' node=' + Z.nodeId);
  check('(8b) ★既定幾何へ完全に戻る (山場 [7,24,20,43] + ボス [5,47,22,68] の 2 部屋)',
    JSON.stringify(Z.rooms) === '[[7,24,20,43],[5,47,22,68]]' && Z.start.join(',') === '24,13',
    JSON.stringify(Z.rooms) + ' start=' + Z.start.join(','));
  check('(8c) ★旧アンカーへ戻る (見張り 27,13 / 従者 40,13 / グリクス 49,13)',
    Z.watch.tx === 27 && Z.watch.ty === 13 && Z.servant.tx === 40 && Z.servant.ty === 13 &&
    Z.grix.tx === 49 && Z.grix.ty === 13,
    JSON.stringify([Z.watch, Z.servant, Z.grix]));
  check('(8d) ノード台帳は 1 件も登録されず、旧台帳 3 行がそのまま生きる',
    Z.nodeEvents === 0 && Z.legacy === 3, 'node=' + Z.nodeEvents + ' legacy=' + Z.legacy);
  check('(8e) ★縛られた従者が従来どおり起動時に 1 体だけ置かれる',
    Z.captiveState === 'tunnel' && Z.captiveCount === 1,
    Z.captiveState + ' / ' + Z.captiveCount);
  check('(8f) 旧 spawns 13 体がそのまま湧く', Z.spawns === 13 && Z.enemies === 13,
    'spawns=' + Z.spawns + ' enemies=' + Z.enemies);
  check('(8g) scenarioId と OBJECTIVE_ROOMS が従来値',
    Z.scenarioId === 'goblin-mine' && Z.objectiveRooms === 1,
    Z.scenarioId + ' / ' + Z.objectiveRooms);
  await pg0.close();

  /* ══ §9 内蔵グラフが他所へ漏れていない ═════════════════════════════════════
   * ⚠⚠ 2026-08-12 (P6) に**測り方を張り替えた**。旧 §9 は「他 5 シナリオは分岐しない
   *   = 従来の 2 部屋のまま」を見ていたが、P6 で 5 本とも自分の内蔵グラフを持つように
   *   なり、**母集団そのものが消滅**した (実装のバグではない)。
   * ⭐ この節が守りたい不変条件は「他所が分岐しないこと」ではなく
   *   **「廃坑の間取りとイベントが他のシナリオへ漏れないこと」**。P6 後もそのまま
   *   意味を持つ形へ書き直す:
   *     (9a-*) そのシナリオは**自分の**グラフで立つ (ノードの mapDef.id が "<sid>/…")
   *     (9b-*) 廃坑の EV-2/5/9 (NODE_EVENTS) が**1 件も載らない**
   *     (9c-*) ★装置: ?graph=0 なら従来の 2 部屋へ戻る ← 旧 assert の中身をここへ保存
   *   ⚠ assert は 1 つも消していない (5 ケース x 1 件 → 5 ケース x 3 件へ増やした)。 */
  mark('内蔵グラフが他所へ漏れていない (各シナリオは自分のグラフで立つ)');
  for (const sid of ['bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair']) {
    const p = await bootPage(browser, PORT, '?diag=1&intel=0', errs, { scen: sid });
    const r = await p.evaluate(() => {
      const g = window.__graphRun.graph();
      return { active: window.__graphRun.active(), scen: scenarioId, rooms: ROOMS.length,
               ids: g ? g.nodes.map(n => (n.mapDef && n.mapDef.id) || '?') : [],
               nodeEvents: NODE_EVENTS.length };
    });
    check('(9a-' + sid + ') 自分の内蔵グラフで立つ (ノードの mapDef.id が "' + sid + '/…")',
      r.active === true && r.scen === sid && r.ids.length > 0 &&
      r.ids.every(x => x.indexOf(sid + '/') === 0),
      'active=' + r.active + ' scen=' + r.scen + ' ids=' + r.ids.slice(0, 3).join(',') + '…');
    check('(9b-' + sid + ') ★廃坑の EV-2/5/9 が載らない (NODE_EVENTS=0)',
      r.nodeEvents === 0, 'nodeEvents=' + r.nodeEvents);
    await p.close();

    const p0 = await bootPage(browser, PORT, '?diag=1&intel=0&graph=0', errs, { scen: sid });
    const r0 = await p0.evaluate(() => ({ active: window.__graphRun.active(), scen: scenarioId,
                                          rooms: ROOMS.length }));
    check('(9c-' + sid + ') ★装置: ?graph=0 なら分岐せず従来の 2 部屋のまま',
      r0.active === false && r0.scen === sid && r0.rooms === 2,
      'active=' + r0.active + ' scen=' + r0.scen + ' rooms=' + r0.rooms);
    await p0.close();
  }
  {
    /* ⚠⚠ ここが「themeId で引き当てると壊れる」ことの検出器。生成クエストは themeId に
     *   "goblin-mine" を持ちうるので、_scenIdForTex を使うと廃坑の分岐グラフが勝手に載る。 */
    const gen = JSON.stringify({ title: '検証用の依頼', flavor: 'driver_graph_sce1',
      themeId: 'goblin-mine', perceptionDC: 12, trapCount: 2, hiddenChestCount: 1, clearXp: 100,
      spawns: [['goblin', 30, 13], ['goblin', 31, 13]] });
    const p = await bootPage(browser, PORT, '?diag=1&intel=0', errs, { gen: gen });
    const r = await p.evaluate(() => ({ active: window.__graphRun.active(), scen: scenarioId,
                                        rooms: ROOMS.length }));
    check('(9-gen) ★themeId:"goblin-mine" の生成クエストに廃坑の分岐グラフが載らない',
      r.active === false && r.scen === 'generated-quest',
      'active=' + r.active + ' scen=' + r.scen + ' rooms=' + r.rooms);
    await p.close();
  }

  // ══ §N 負のコントロール (同一 run に内包) ═════════════════════════════════
  mark('負のコントロール N1 noscen');
  {
    const p = await bootPage(browser, PORT_OF.noscen, '?diag=1&intel=0', errsMut);
    const r = await p.evaluate(() => ({ active: window.__graphRun.active(), rooms: ROOMS.length,
                                        nodeEvents: NODE_EVENTS.length }));
    check('(N1) 変異 noscen: 内蔵グラフが引き当てられず分岐が立たない',
      r.active === false && r.rooms === 2 && r.nodeEvents === 0, JSON.stringify(r));
    await p.close();
  }
  mark('負のコントロール N2 oldtick');
  {
    const p = await bootPage(browser, PORT_OF.oldtick, '?diag=1&intel=0', errsMut, { freezeChoice: true });
    const pre = await p.evaluate(() => ({ active: window.__graphRun.active() }));
    await p.evaluate(() => {
      const s = sce1WatchSpot();
      playerX = s.tx * TILE_SIZE + TILE_SIZE / 2 - 48;
      playerY = s.ty * TILE_SIZE + TILE_SIZE / 2 - 58;
      tryInteractSce1Event();
    });
    const dlg = await waitDialog(p, 4000);
    check('(N2) 変異 oldtick: 旧経路が生き返り、entry ノードで EV-2 が暴発する',
      pre.active === true && !!dlg && dlg.msg.indexOf('坑道の入口に見張りが二匹') >= 0,
      'active=' + pre.active + ' dialog=' + (dlg ? dlg.msg.slice(0, 20) : 'none'));
    await p.close();
  }
  mark('負のコントロール N3 noimmediate');
  {
    const p = await bootPage(browser, PORT_OF.noimmediate, '?diag=1&intel=0', errsMut, { freezeChoice: true });
    await kickEnter(p, 'n7', 'right');
    // 到着 (暗転 600ms) を十分に待ってから「enter が解決したか」を見る
    const t0 = Date.now();
    let done = false;
    while (Date.now() - t0 < 6000) {
      done = await p.evaluate(() => !!window.__p5enterDone);
      if (done) break;
      await sleep(100);
    }
    const dlgAtResolve = await p.evaluate(() => window.__p5dlgAtResolve);
    check('(N3) ★変異 noimmediate: enterNode がイベントを待たずに解決する (即時判定が死んだ)',
      done === true && dlgAtResolve === false,
      'enterDone=' + done + ' dialogAtResolve=' + dlgAtResolve);
    /* 参考値: この後 400ms tick が開けるか、heroAI が先に交戦するかは実時間の競合。
     * ⚠ assert にはしない (フレークするため)。上の「解決してしまう」ことが確定的な検出器。 */
    let raced = null;
    for (let k = 0; k < 40; k++) {
      raced = await p.evaluate(() => {
        const d = document.getElementById('choiceDialog');
        return { enc: !!(encounterActive || encounterRunning),
                 dlg: !!(d && d.classList.contains('show')) };
      });
      if (raced.enc || raced.dlg) break;
      await sleep(100);
    }
    console.log('[drv]   (参考) noimmediate の競合結果: ' + JSON.stringify(raced));
    await p.close();
  }
  mark('負のコントロール N4 nocarry');
  {
    const p = await bootPage(browser, PORT_OF.nocarry, '?diag=1&intel=0', errsMut, { freezeChoice: true });
    await kickEnter(p, 'n6', 'right');
    const d = await waitDialog(p, 8000);
    check('(N4a) [前提] 変異 nocarry でも横穴の EV-5 は開く (壊したのは持ち越しだけ)',
      !!d && d.msg.indexOf('横穴の奥から') >= 0, d ? d.msg.slice(0, 18) : 'none');
    await clickChoice(p, 2);                       // 迂回 → throne
    await sleep(900);
    await kickEnter(p, 'n7', 'right');
    await waitNode(p, 'n7', 10000);
    await sleep(800);
    const cap = await captiveDom(p);
    check('(N4b) 変異 nocarry: 玉座に人影が 1 つも無い (状態がノード遷移で落ちた)',
      cap.count === 0, JSON.stringify(cap));
    await p.close();
  }
  mark('負のコントロール N5 noowner');
  {
    const p = await bootPage(browser, PORT_OF.noowner, '?diag=1&intel=0', errsMut, { freezeChoice: true });
    const cap = await captiveDom(p);
    check('(N5) 変異 noowner: 所有ノードでない entry にも人影が湧く',
      cap.count === 1, JSON.stringify(cap));
    await p.close();
  }

  // ══ §10 ?autoplay で完走 (n0 → n1 → n4 → n7 → 撃破 → クリア) ═════════════
  if (!NO_FULL) {
    mark('?autoplay 完走 (最大 ' + Math.round(FULL_TIMEOUT_MS / 1000) + '秒)');
    const pf = await bootPage(browser, PORT, '?autoplay=30&intel=0&diag=1', errs);
    const t0 = Date.now();
    let last = null, cleared = false;
    while (Date.now() - t0 < FULL_TIMEOUT_MS) {
      last = await pf.evaluate(() => ({
        node: window.__graphRun.nodeId(), cleared: !!dungeonCleared,
        bossDefeated: window.__graphRun.bossDefeated(),
        alive: enemies.filter(e => e.alive).length, over: !!gameOver,
      })).catch(() => last);
      if (last && (last.cleared || last.over)) { cleared = !!last.cleared; break; }
      await sleep(1500);
    }
    const fin = await pf.evaluate(() => ({
      node: window.__graphRun.nodeId(), cleared: !!dungeonCleared, over: !!gameOver,
      bossDefeated: window.__graphRun.bossDefeated(), settled: window.__graphRun.questSettled(),
      grixOutcome: sce1GrixOutcome, armed: hostageRedirectArmed,
      alerted: sceneFlags.mine_alerted, rescued: sceneFlags.servant_rescued,
    })).catch(() => ({}));
    check('(10a) ★autoplay がボスを撃破してクリアまで到達する (経路が詰まない)',
      cleared === true && fin.bossDefeated === true && fin.node === 'n7',
      JSON.stringify(fin) + ' ' + Math.round((Date.now() - t0) / 1000) + 's');
    check('(10b) クエスト決着の述語も真 (判定式が 2 本になっていない)',
      fin.settled === true, String(fin.settled));
    check('(10c) ★道中で EV-9 が実際に走っている (autoplay でも玉座の交渉を通る)',
      fin.grixOutcome !== null && fin.grixOutcome !== undefined, String(fin.grixOutcome));
    await pf.close();
  }

  // ══ §E エラーゼロ ════════════════════════════════════════════════════════
  mark('エラーゼロ');
  check('(E1) 素の側: 起動〜全操作で pageerror / console.error が 0', errs.length === 0,
    errs.slice(0, 5).join(' | '));
  check('(E2) 変異側でも JS エラーは出ない (壊したのは 1 箇所だけ = 外科的)',
    errsMut.length === 0, errsMut.slice(0, 5).join(' | '));

  await browser.close();
  for (const s of servers) s.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n[drv] ' + pass + '/' + results.length + ' PASS' + (NO_FULL ? '   (--no-full)' : ''));
  if (pass !== results.length) {
    console.log('[drv] FAILED:');
    for (const r of results) if (!r.ok) console.log('   - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
    process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
