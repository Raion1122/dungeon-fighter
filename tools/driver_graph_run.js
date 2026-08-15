#!/usr/bin/env node
/*
 * driver_graph_run.js — [P2 グラフ + 遷移] 分岐マップのランタイム検証
 * ══════════════════════════════════════════════════════════════════════════════
 * 「ゲームブック風 分岐マップ」企画 P2 の完了条件を測る。P2 の主張は 5 つ:
 *
 *   ① 分岐グラフ (run) が **2 つの入口**から立ち上がる
 *      = 生成クエストのペイロード (sessionStorage.generatedScenario.run) と dev シーム ?graphtest
 *   ② **行き止まりへ入って引き返しても盤面が壊れない**
 *      = 倒した敵が生き返らない / 開けた宝箱が閉じない / 踏んだ罠が戻らない / フォグが残る
 *   ③ 同じノードへ入り直すと **同じ盤面が組み上がる** (スポーンがノード id 由来で決定論)
 *   ④ `?autoplay` で **決定論的にボスへ到達 → 撃破 → クリア完走**する
 *   ⑤ `?graph=0` で **従来の単一マップへ完全に戻る** (撤退スイッチ)
 *
 * ⭐ **負のコントロールを同一 run に内包**する。ポート P に素の index.html を、
 *    P+1 に「機構を 1 箇所だけ潰した変異版」を配り、同じ手順を両方に流す。
 *    素の側で「保たれる」、変異側で「壊れる」が両方出て初めて、この検出器が本当に
 *    保存/復元を見ていることの証明になる (片側だけでは検出器が死んでいても PASS する)。
 *
 * 変異 (--mutate、既定 nosave):
 *   nosave    … saveNodeState の「倒した敵の記録」を殺す → 引き返すと敵が復活する
 *   norestore … restoreNodeState の「開けた宝箱の復元」を殺す → 戻ると宝箱が閉じている
 *   nofog     … フォグの復元を殺す                        → 戻ると部屋が真っ暗に戻る
 *   noseed    … withNodeRng の RUN ゲートを外して素通し   → 再入場のたびに盤面が振り直される
 *   nogate    … heroAI の「出口へ歩く」注入を殺す          → 出口へ着かず分岐が詰む
 *
 * ⚠ 変異は**ディスクを書き換えず配信をメモリ上で差し替える** (復元漏れが原理的に起きない)。
 * ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
 * ⚠ #nodeFade は CSS transition なので**見え方は測れない**。ここで測れるのは
 *   「クラスが付いて外れたか」まで。暗転の見た目はライブのスクショで別途見る。
 *
 * 使い方:
 *   node tools/driver_graph_run.js
 *   node tools/driver_graph_run.js --mutate norestore --port 8896
 *   node tools/driver_graph_run.js --no-full      (§11 の autoplay 完走だけ飛ばす)
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NO_FULL = flag('no-full');
const PORT = parseInt(arg('port', '8892'), 10);   // ⚠ 変異側は PORT+1。並列時はポート間隔 4 以上
const FULL_TIMEOUT_MS = parseInt(arg('fulltimeout', '240000'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  nosave: ['      for (let i = 0; i < enemies.length; i++) if (!enemies[i].alive) st.deadSlots.add(i);',
           '      void 0;   /* ★変異nosave */'],
  norestore: ['      for (const i of st.openedChests) if (roomChests[i]) { roomChests[i].opened = true; roomChests[i].found = true; roomChests[i].hidden = false; }',
              '      void 0;   /* ★変異norestore */'],
  nofog: ['        for (let y = 0; y < MAP_H && y < st.explored.length; y++) exploredTiles[y].set(st.explored[y]);',
          '        void 0;   /* ★変異nofog */'],
  noseed: ['      if (!RUN) return fn();',
           '      /* ★変異noseed */ return fn();'],
  /* ⚠ nogate を `void 0` にすると goalTX/goalTY が undefined のまま aStar → mapData[undefined]
   *   で **TypeError** になり、ドライバが FATAL で落ちて「何も測れない」。負のコントロールは
   *   「壊れているが動く」状態でなければ比較できない → 起点へ歩く形へ差し替える
   *   (欠陥の姿は「出口へ向かわない」であって「例外を投げる」ではない)。 */
  /* ⚠ 2026-08-07: 差替文字列の**長さ**を 1 文字増やした (「変異nogate」→「変異 nogate」)。
   *   偶然にも置換前後がどちらも 65 文字ちょうどで、(0e)「2 つの配信のバイト長が違う」が
   *   `--mutate nogate` のときだけ必ず FAIL していた (HEAD から存在した空振り検出の誤警報)。
   *   ⚠ 検出力には無関係な見た目の差なので、変異の意味は 1bit も変えていない。 */
  nogate: ['          goalTX = heroForcedGoal.tx; goalTY = heroForcedGoal.ty;',
           '          goalTX = START_TX; goalTY = START_TY;   /* ★変異 nogate */'],
};
const MUTATE = arg('mutate', 'nosave');
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
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

async function bootPage(browser, url, warns, errs, pre) {
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'warn' || m.type() === 'warning') warns.push(t);
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
  });
  /* ⚠ evaluateOnNewDocument は**全ナビゲーションで再実行される**。ここには「毎回同じ形へ
   *   整える」ものだけを置く (removeItem 等の破壊系は置かない = 最頻ハマり)。 */
  await page.evaluateOnNewDocument((preSrc) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine'); } catch (e) {}
    // パーティを Lv10 相当にして検証中の全滅で止まらないようにする (勝率ではなく機構を測るため)
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    if (preSrc) { try { (new Function(preSrc))(); } catch (e) { console.error('pre failed ' + e.message); } }
  }, pre || '');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

const QT = '/index.html?diag=1&graphtest=1';

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srvPure = await startServer(PORT, false);
  const srvMut = await startServer(PORT + 1, true);
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素        http://localhost:' + PORT);
  console.log('[drv]   変異(' + MUTATE + ')  http://localhost:' + (PORT + 1));

  const profile = require('./_pptr_profile')('df_graph_run_');
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

  // ══ §1 グラフが立ち上がる (dev シーム経路) ══════════════════════════════════
  mark('分岐グラフの起動 (?graphtest)');
  const page = await bootPage(browser, 'http://localhost:' + PORT + QT, warns, errs);
  const G1 = await page.evaluate(() => {
    const g = window.__graphRun;
    return {
      active: g.active(), nodeId: g.nodeId(), boss: g.bossNodeId(),
      nodes: g.graph().nodes.map(n => n.id + ':' + n.kind),
      parent: g.parent(),
      exits: g.exits().map(o => ({ to: o.to, dir: o.dir, at: o.at, back: o.back, label: o.label })),
      board: (() => { const b = g.board(); delete b.mapDataText; return b; })(),
      bossDefeated: g.bossDefeated(), questSettled: g.questSettled(),
      fadeExists: !!document.getElementById('nodeFade'),
      fadeOn: g.fadeOn(),
    };
  });
  const mapText0 = await page.evaluate(() => window.__graphRun.board().mapDataText);
  check('(1a) RUN が立っている / 現在ノードが entry', G1.active === true && G1.nodeId === 'n0',
    'active=' + G1.active + ' node=' + G1.nodeId);
  /* ⚠ 2026-08-07 (P4) に更新。内蔵テストグラフを **1 ノード = 1 部屋**へ戻し、
   *   kind の配り方を「P4 の配線を測れる形」へ変えた (n4 を event → search、n5 rest を追加)。
   *   ⚠⚠ **assert は 1 つも消していない**。期待値を新しい正しい形へ書き直しただけで、
   *     ノード数はむしろ 5 → 6 に増えている (検出力は落ちていない)。 */
  check('(1b) ノードが 6 件 (start / combat / loot / search / rest / boss)',
    G1.nodes.join(',') === 'n0:start,n1:combat,n2:loot,n4:search,n5:rest,n3:boss', G1.nodes.join(','));
  check('(1c) 親の対応が木になっている (n1,n2,n4→n0 / n3→n1 / n5→n4 / entry に親なし)',
    G1.parent.n1 === 'n0' && G1.parent.n2 === 'n0' && G1.parent.n4 === 'n0' &&
    G1.parent.n3 === 'n1' && G1.parent.n5 === 'n4' && G1.parent.n0 === undefined,
    JSON.stringify(G1.parent));
  check('(1d) boss ノードが n3', G1.boss === 'n3', String(G1.boss));
  check('(1e) entry の出口は 3 本 / 親への「引き返す」は生えない (entry に親が無いので)',
    G1.exits.length === 3 && G1.exits.every(e => !e.back),
    G1.exits.map(e => e.to + '/' + e.dir).join(' '));
  /* ⚠ 2026-08-07 (P5 前段) に期待値を更新。ノードの部屋を**可視域サイズ** (道中 7 列 x 6 行 =
   *   [11,33,16,39]) へ縮めたので縁のタイルが移動した (midC=36 / midR=13)。
   *   ⚠⚠ assert は消していない。「出口タイルが部屋の縁から導出されている」という**測る対象は同じ**で、
   *     期待値を新しい幾何へ書き直しただけ (直書き座標は幾何を動かすたびに黙って無意味化する)。 */
  check('(1f) 出口タイルが部屋の縁から導出されている (上=[36,11] 右=[39,13] 下=[36,16])',
    JSON.stringify(G1.exits.map(e => [e.at.tx, e.at.ty])) === '[[36,11],[39,13],[36,16]]',
    JSON.stringify(G1.exits.map(e => [e.at.tx, e.at.ty])));
  check('(1g) 出口ラベルに著者のヒント文が載っている',
    G1.exits[0].label.indexOf('荒々しい声が聞こえる') >= 0, G1.exits[0].label);
  check('(1h) #nodeFade が存在し、既定では暗転していない',
    G1.fadeExists === true && G1.fadeOn === false, 'exists=' + G1.fadeExists + ' on=' + G1.fadeOn);
  check('(1i) 起動直後はボス未撃破 = クエスト未決着 (道中ノードで勝手にクリアしない)',
    G1.bossDefeated === false && G1.questSettled === false,
    'boss=' + G1.bossDefeated + ' settled=' + G1.questSettled);

  // ── §G 母集団ガード (真空 PASS 対策) ──────────────────────────────────────
  mark('母集団ガード');
  check('(G1) entry ノードに敵が 1 体以上いる', G1.board.enemies > 0 && G1.board.alive === G1.board.enemies,
    'enemies=' + G1.board.enemies + ' alive=' + G1.board.alive);
  /* ⚠ 2026-08-07 (P4) に書き直した。P2/P3 では **entry ノードにも罠と宝箱が湧いていた**
   *   (部屋 index からの推測で、控えの間があるおかげで本間が候補に残っていたため)。
   *   P4 で除外集合が kind 由来になり、罠は search / 玄室宝箱は loot **だけ**になったので、
   *   kind:"start" の entry は 0 個が正しい。母集団ガード (「本当に湧く場所がある」証明) は
   *   §2 の (2G1)(2G2) が n4 (search) と n2 (loot) で受け持つ。 */
  check('(G2) ★entry (kind:"start") には罠が 0 個 (P4: 罠が湧くのは kind:"search" だけ)',
    G1.board.traps === 0, 'traps=' + G1.board.traps);
  check('(G3) ★entry (kind:"start") には宝箱が 0 個 (P4: 玄室宝箱は loot / 隠し宝箱は search だけ)',
    G1.board.chests === 0, 'chests=' + G1.board.chests);
  check('(G4) ★ノードの部屋は 1 つ (P4 で「控えの間」の仮の器が不要になった = 1ノード=1部屋)',
    G1.board.rooms === 1 && G1.board.bossRoomIdx === 0,
    'rooms=' + G1.board.rooms + ' bossRoomIdx=' + G1.board.bossRoomIdx);
  check('(G5) mapData が実体を持つ 72x28 (真っ白を測っていない)',
    await page.evaluate(() => mapData.length === 28 && mapData[0].length === 72 &&
      mapData.some(r => r.some(v => v === 0)) && mapData.some(r => r.some(v => v === 2))),
    'sha=' + sha256(mapText0).slice(0, 16));

  /* ══ §2 行き止まりへ入って引き返す (P2 の芯) ════════════════════════════════
   * ⚠ 2026-08-07 (P4): 往復の**起点を n0 → n4 (kind:"search") へ移した**。P4 以降、罠と
   *   隠し宝箱が湧くのは search ノードだけなので、n0 を起点にすると roomChests[0] /
   *   traps[0] が undefined になり「宝箱が閉じない」を測る母集団が消える (= 真空 PASS)。
   * ⚠ 行き止まり側は n2 (loot) のまま。n2 の親は n0 なので「引き返す」の行き先は n0 で正しい
   *   (g.enter は生のシームなので、どのノードからでも直接飛べる)。 */
  mark('行き止まり往復 n4(search) → n2(loot 行き止まり) → n4');
  const T = await page.evaluate(async () => {
    const g = window.__graphRun;
    await g.enter('n4', 'down');                        // ★罠と隠し宝箱が湧く唯一の kind へ
    // n4 で「敵を 1 体倒し / 宝箱を 1 つ開け / 罠を 1 つ踏み / フォグを広く開ける」
    const beforeAlive = enemies.filter(e => e.alive).length;
    enemies[0].alive = false; enemies[0].hp = 0;
    roomChests[0].found = true; roomChests[0].hidden = false; roomChests[0].opened = true;
    traps[0].found = true; traps[0].triggered = true;
    /* ★フォグは 3x4 タイルの**特定領域**だけを人工的に開ける (グローバル合計では測らない)。
     * ⚠⚠ 2026-08-07 (P4) に踏んだ罠: 旧版は y8-12 / x26-36 を開けて「探索済タイルの**総数**」で
     *   測っていたが、往復の起点を n4 へ移したところ **パーティの入場位置がその矩形の真ん中**に
     *   なり、フォグを復元しなくても視界が自然に開いて総数が増えた
     *   (負のコントロールが「出発前 84 → 戻り 95」で沈黙した)。
     *   → **パーティの視界 (半径 4〜6 タイル) が届かない場所を選び、その領域だけを数える**。
     * ⚠ 2026-08-07 (P5 前段) に**成立の理由が変わった**。部屋が [11,33,16,39] (7 列 x 6 行) へ
     *   縮み、入場位置 (36,13) から部屋の隅まで 3 タイルしか無い = **部屋の中には視界外が存在しない**。
     *   この矩形 (row18-20 / col24-27) は今や**部屋の外の岩盤**で、入場位置から 9〜12 タイル離れて
     *   いるので永久に自然探索されない。saveNodeState / restoreNodeState は exploredTiles を
     *   **丸ごと**複製・復元するので、岩盤上の記憶でも保存/復元の検出器として正しく働く。
     *   (矩形を部屋の中へ戻すと、視界が自然に開いて負のコントロールがまた沈黙する) */
    const FOG = { y0: 18, y1: 20, x0: 24, x1: 27 };
    for (let y = FOG.y0; y <= FOG.y1; y++) for (let x = FOG.x0; x <= FOG.x1; x++) exploredTiles[y][x] = 1;
    const fogRegion = () => {
      let n = 0;
      for (let y = FOG.y0; y <= FOG.y1; y++) for (let x = FOG.x0; x <= FOG.x1; x++) n += exploredTiles[y][x];
      return n;
    };
    const snap = () => ({
      alive: enemies.filter(e => e.alive).length, enemies: enemies.length,
      chests: roomChests.length, opened: roomChests.filter(c => c.opened).length,
      found: roomChests.filter(c => c.found).length,
      traps: traps.length, sprung: traps.filter(t => t.triggered).length,
      fogRegion: fogRegion(),
      explored: exploredTiles.reduce((a, r) => a + r.reduce((b, v) => b + v, 0), 0),
      chestTiles: roomChests.map(c => c.tx + ',' + c.ty).join(' '),
      trapTiles: traps.map(t => t.tx + ',' + t.ty).join(' '),
      spawns: JSON.stringify(ENEMY_SPAWNS),
      map: mapData.map(r => r.join('')).join('\n'),
      openedTile: (roomChests.find(c => c.opened) || {}).tx + ',' + (roomChests.find(c => c.opened) || {}).ty,
      sprungTile: (traps.find(t => t.triggered) || {}).tx + ',' + (traps.find(t => t.triggered) || {}).ty,
    });
    const n0Before = snap();
    await g.enter('n2', 'right');                       // 行き止まり (loot) へ
    const atDead = { nodeId: g.nodeId(), enemies: enemies.length,
                     chests: roomChests.length, traps: traps.length,
                     deadEnd: g.deadEnd(), arrival: g.arrivalText(),
                     exits: g.exits().map(o => o.to + (o.back ? '(back)' : '')) };
    await g.enter('n4', 'left');                        // 引き返す
    const n0After = Object.assign({ nodeId: g.nodeId() }, snap());
    return { beforeAlive, n0Before, atDead, n0After, state: g.stateOf('n4'),
             excluded: g.excluded(), chestExcluded: g.chestExcluded(), kind: g.kindOf('n4') };
  });
  check('(2G1) ★母集団: n4 (kind:"search") には罠と隠し宝箱が湧く (P4 の唯一のノード種)',
    T.n0Before.traps > 0 && T.n0Before.chests > 0 && T.kind === 'search',
    'kind=' + T.kind + ' traps=' + T.n0Before.traps + ' chests=' + T.n0Before.chests);
  check('(2G2) ★母集団: n2 (kind:"loot") には玄室宝箱が湧き、罠は 0 個',
    T.atDead.chests > 0 && T.atDead.traps === 0,
    'chests=' + T.atDead.chests + ' traps=' + T.atDead.traps);
  check('(2G3) ★search ノードの除外集合は空 / 玄室宝箱側は全部屋除外 (2 系統が別々に効いている)',
    T.excluded.length === 0 && T.chestExcluded.join(',') === '0',
    'excluded=[' + T.excluded.join(',') + '] chestExcluded=[' + T.chestExcluded.join(',') + ']');
  check('(2G4) ★行き止まりの loot は「当たり」の到着文になる (未開封の宝が実際にある)',
    T.atDead.deadEnd === 'hit' && /打ち捨てられた荷/.test(T.atDead.arrival || ''),
    'deadEnd=' + T.atDead.deadEnd + ' 到着文="' + T.atDead.arrival + '"');
  check('(2a) 行き止まりノードへ入れた / 親への「引き返す」が自動生成される',
    T.atDead.nodeId === 'n2' && T.atDead.exits.length === 1 && T.atDead.exits[0] === 'n0(back)',
    T.atDead.nodeId + ' exits=' + T.atDead.exits.join(','));
  check('(2b) 行き止まり (loot) には敵が 0 体 (ノード別スポーンが効いている)',
    T.atDead.enemies === 0, 'enemies=' + T.atDead.enemies);
  check('(2c) ★倒した敵が復活しない', T.n0After.alive === T.n0Before.alive &&
    T.n0After.enemies === T.n0Before.enemies && T.n0After.alive < T.beforeAlive,
    '出発前 alive=' + T.beforeAlive + ' → 倒して ' + T.n0Before.alive + ' → 戻って ' + T.n0After.alive);
  check('(2d) ★開けた宝箱が閉じない (件数)', T.n0After.opened === T.n0Before.opened && T.n0After.opened > 0,
    '出発前=' + T.n0Before.opened + ' 戻り=' + T.n0After.opened);
  check('(2e) ★開けた宝箱が「同じ宝箱」である (件数ではなく identity で測る)',
    T.n0After.openedTile === T.n0Before.chestTiles.split(' ')[0],
    '開いている宝箱=' + T.n0After.openedTile + ' / 期待=' + T.n0Before.chestTiles.split(' ')[0]);
  check('(2f) ★踏んだ罠が戻らない', T.n0After.sprung === T.n0Before.sprung && T.n0After.sprung > 0 &&
    T.n0After.sprungTile === T.n0Before.trapTiles.split(' ')[0],
    '出発前=' + T.n0Before.sprung + ' 戻り=' + T.n0After.sprung + ' tile=' + T.n0After.sprungTile);
  check('(2g) ★フォグが残る (パーティの視界外に開けた 3x4 領域が戻っても開いたまま)',
    T.n0After.fogRegion === T.n0Before.fogRegion && T.n0Before.fogRegion === 12,
    '出発前=' + T.n0Before.fogRegion + '/12 戻り=' + T.n0After.fogRegion +
    '/12 (総数 ' + T.n0Before.explored + ' → ' + T.n0After.explored + ')');
  check('(2h) nodeState に n4 の記録が残っている (deadSlots / openedChests / sprungTraps)',
    T.state && T.state.visited === true && T.state.deadSlots.length === 1 &&
    T.state.openedChests.length === 1 && T.state.sprungTraps.length === 1,
    JSON.stringify(T.state && { d: T.state.deadSlots, o: T.state.openedChests, s: T.state.sprungTraps }));

  // ══ §3 決定論: 同じノードは同じ盤面になる ══════════════════════════════════
  mark('決定論 (ノード id 由来の種)');
  check('(3a) 戻った n4 の mapData が出発前と 1 bit も違わない',
    sha256(T.n0After.map) === sha256(T.n0Before.map),
    sha256(T.n0After.map).slice(0, 12) + ' vs ' + sha256(T.n0Before.map).slice(0, 12));
  check('(3b) 戻った n4 の敵スポーン表が出発前と同一', T.n0After.spawns === T.n0Before.spawns,
    T.n0After.spawns);
  check('(3c) ★戻った n4 の宝箱が同じ座標に同じ数だけ湧く (乱数がノード id で固定されている)',
    T.n0After.chestTiles === T.n0Before.chestTiles && T.n0After.chests === T.n0Before.chests,
    '出発前=[' + T.n0Before.chestTiles + '] 戻り=[' + T.n0After.chestTiles + ']');
  check('(3d) ★戻った n4 の罠が同じ座標に同じ数だけ湧く',
    T.n0After.trapTiles === T.n0Before.trapTiles && T.n0After.traps === T.n0Before.traps,
    '出発前=[' + T.n0Before.trapTiles + '] 戻り=[' + T.n0After.trapTiles + ']');
  /* ⚠ 2026-08-07 (P4): 再入場の決定論を測る「別ノード」を n1 (combat) → n4 (search) へ移した。
   *   combat ノードは P4 以降 罠 0 / 宝箱 0 なので、(3f) の母集団ガードが原理的に立たない。 */
  const D3 = await page.evaluate(async () => {
    const g = window.__graphRun;
    const snap = () => ({
      chests: roomChests.map(c => c.tx + ',' + c.ty + (c.locked ? 'L' : '')).join(' '),
      traps: traps.map(t => t.tx + ',' + t.ty).join(' '),
      enemies: enemies.map(e => e.type + '@' + Math.round(e.x) + ',' + Math.round(e.y)).join(' '),
    });
    const a = snap();                                  // ← 既に n4 に居る (§2 の帰着点)
    await g.enter('n3', 'up');
    /* ★[P5 前段] ゴブリン戦車の乱入位置。旧実装は CHARIOT_SPAWN_TX=68 の**直書き**で、
     *   ボス部屋を [11,32,16,40] へ縮めた瞬間に **col 63〜68 が全部岩盤**になり、
     *   探索に失敗したフォールバックが岩盤 (68,13) を返して**到達できない敵が残り、
     *   潜行が永久にクリアしなくなっていた** (実際に踏んだ)。 */
    const bossRect = ROOMS[BOSS_ROOM_IDX];
    const chSpot = findChariotSpawnTile(Math.floor((bossRect[0] + bossRect[2]) / 2));
    const bossBoard = { enemies: enemies.length, types: enemies.map(e => e.type).join(','),
                        rooms: ROOMS.length, bossRoomIdx: BOSS_ROOM_IDX,
                        traps: traps.length, chests: roomChests.length,
                        excluded: g.excluded(), chestExcluded: g.chestExcluded(),
                        bossRect: bossRect.slice(), chariotBaseTx: chariotSpawnBaseTx(),
                        chariot: chSpot, chariotWall: isTileWall(chSpot.tx, chSpot.ty),
                        chariotInRoom: chSpot.ty >= bossRect[0] && chSpot.ty <= bossRect[2] &&
                                       chSpot.tx >= bossRect[1] && chSpot.tx <= bossRect[3] };
    await g.enter('n4', 'down');
    const b = snap();
    await g.enter('n0', 'up');
    return { a, b, bossBoard, nodeId: g.nodeId() };
  });
  check('(3e) 別ノードを経由して戻っても盤面が完全一致 (宝箱/罠/敵の座標まで)',
    D3.a.chests === D3.b.chests && D3.a.traps === D3.b.traps && D3.a.enemies === D3.b.enemies,
    'chests一致=' + (D3.a.chests === D3.b.chests) + ' traps一致=' + (D3.a.traps === D3.b.traps) +
    ' enemies一致=' + (D3.a.enemies === D3.b.enemies));
  check('(3f) 母集団ガード: n4 の宝箱/罠/敵が空でない (真空一致ではない)',
    D3.a.chests.length > 0 && D3.a.traps.length > 0 && D3.a.enemies.length > 0,
    'chests=[' + D3.a.chests + '] enemies=[' + D3.a.enemies + ']');
  check('(3g) boss ノードにはボスが湧く (bossSlot からノード別スポーンが作られている)',
    D3.bossBoard.enemies > 0 && D3.bossBoard.types.indexOf('goblinKing') >= 0,
    'types=' + D3.bossBoard.types);
  check('(3h) ★boss ノードは 1 部屋で BOSS_ROOM_IDX=0 / 罠も宝箱も 0 個 (P4: boss は両方除外)',
    D3.bossBoard.bossRoomIdx === 0 && D3.bossBoard.rooms === 1 &&
    D3.bossBoard.traps === 0 && D3.bossBoard.chests === 0 &&
    D3.bossBoard.excluded.join(',') === '0' && D3.bossBoard.chestExcluded.join(',') === '0',
    'idx=' + D3.bossBoard.bossRoomIdx + ' rooms=' + D3.bossBoard.rooms +
    ' traps=' + D3.bossBoard.traps + ' chests=' + D3.bossBoard.chests);
  check('(3i) 元のノードへ戻れている (往復 4 回で状態機械が壊れない)', D3.nodeId === 'n0', D3.nodeId);
  /* ⚠⚠ [P5 前段 2026-08-07] ゴブリン戦車の乱入位置は**ボス部屋の東端から導出**する。
   *   直書き (旧 CHARIOT_SPAWN_TX=68) のままボス部屋を縮めると、探索が全部岩盤に当たって
   *   フォールバックが盤外同然の岩盤を返し、**倒せない敵が残って潜行が永久にクリアしない**。
   *   しかも encounterActive は静かに false へ落ちるので**画面では異常に見えない**
   *   (?autoplay 完走が 4 分のハード上限で落ちて初めて分かった)。 */
  check('(3j) ★戦車の乱入起点がボス部屋の東端から導出されている (絶対座標の直書きでない)',
    D3.bossBoard.chariotBaseTx === D3.bossBoard.bossRect[3],
    'base=' + D3.bossBoard.chariotBaseTx + ' / ボス部屋=' + JSON.stringify(D3.bossBoard.bossRect));
  check('(3k) ★戦車の湧き先が歩けるタイルで、しかもボス部屋の中 (岩盤に湧いて倒せなくならない)',
    D3.bossBoard.chariotWall === false && D3.bossBoard.chariotInRoom === true,
    '湧き先=' + JSON.stringify(D3.bossBoard.chariot) + ' 壁=' + D3.bossBoard.chariotWall +
    ' 部屋の中=' + D3.bossBoard.chariotInRoom);

  // ══ §4 クリア条件 defeatBoss ═══════════════════════════════════════════════
  mark('クリア条件 (defeatBoss)');
  const C4 = await page.evaluate(async () => {
    const g = window.__graphRun;
    const out = {};
    for (const e of enemies) { e.alive = false; e.hp = 0; }
    out.atMidAllDead = g.bossDefeated();
    out.settledAtMid = g.questSettled();
    await g.enter('n1', 'up');
    await g.enter('n3', 'up');
    out.atBossBefore = g.bossDefeated();
    for (const e of enemies) { e.alive = false; e.hp = 0; }
    out.atBossAfter = g.bossDefeated();
    out.settledAtBoss = g.questSettled();
    out.node = g.nodeId();
    return out;
  });
  check('(4a) ★道中ノードの敵を全滅させても「ボス撃破」にならない (単一マップ案の最大の地雷を踏まない)',
    C4.atMidAllDead === false && C4.settledAtMid === false,
    'bossDefeated=' + C4.atMidAllDead + ' questSettled=' + C4.settledAtMid);
  check('(4b) boss ノードでも撃破前は false', C4.atBossBefore === false, String(C4.atBossBefore));
  check('(4c) ★boss ノードの敵を倒すと bossDefeated / questSettled が両方 true',
    C4.atBossAfter === true && C4.settledAtBoss === true,
    'boss=' + C4.atBossAfter + ' settled=' + C4.settledAtBoss);

  // ══ §5 lint (純関数。ブラウザ内で直接叩く) ════════════════════════════════
  mark('lintRun の codes');
  const L = await page.evaluate(() => {
    const base = () => JSON.parse(JSON.stringify(window.__graphRun.testRun()));
    /* ⚠⚠ 2026-08-07 (P4): 変異の当て先を**添字から id 引き**へ変えた。旧版は `g.nodes[4]` が
     *   boss である前提で書かれており、P4 でノードを 1 件足した瞬間に (5f) だけが静かに
     *   別のノードを壊して赤くなった。**添字は並べ替えで意味が変わる** = run のスキーマが
     *   「id が安定識別子」と決めているのと同じ理由で、テスト側も id で引くべき。 */
    const at = (g, id) => g.nodes.find(n => n.id === id);
    const r = (g) => { const x = DFMapDef.lintRun(g);
      return { e: x.errors.map(i => i.code), w: x.warnings.map(i => i.code), ok: x.ok }; };
    const out = {};
    out.pristine = r(base());
    out.unspecified = r(null);
    out.bad = r({ nodes: [] });
    /* ⚠ 2026-08-07 (P5 前段): 出口タイルの直書き [33,7] をやめ、**部屋の rect から導出**した。
     *   部屋を可視域サイズへ縮めた瞬間 [33,7] は岩盤になり、この変異が graph-not-tree に加えて
     *   graph-gate-not-floor まで出す「2 つの欠陥を混ぜた変異」に化けていた (assert は
     *   前者しか見ないので**緑のまま静かに濁る**)。 */
    const topMid = (g) => { const rc = at(g, 'n0').mapDef.rooms[0].rect;
                            return [Math.floor((rc[1] + rc[3]) / 2), rc[0]]; };
    { const g = base(); at(g, 'n2').exits.push({ to: 'n1', dir: 'up', at: topMid(g) }); out.notTree = r(g); }
    { const g = base(); const n0 = at(g, 'n0');
      n0.exits = n0.exits.filter(e => e.to !== 'n4'); out.unreach = r(g); }
    { const g = base(); at(g, 'n3').kind = 'combat'; out.noBoss = r(g); }
    { const g = base(); at(g, 'n0').exits[0].at = [0, 0]; out.gateWall = r(g); }
    { const g = base(); at(g, 'n0').mapDef.start = { tx: 2, ty: 2 }; out.entryStart = r(g); }
    { const g = base(); at(g, 'n0').exits[0].dir = 'down'; out.dirMismatch = r(g); }
    { const g = base(); at(g, 'n2').kind = 'search'; out.deadEnd = r(g); }
    { const g = base(); at(g, 'n2').kind = 'boss'; out.kindRole = r(g); }
    /* ★[P5 前段] ノードの部屋 (7x6 / 9x6) に 1枚絵を指定したら警告する。
     *   部屋を可視域サイズへ縮めた結果、在庫 12 枚 (20x16 = 5:4 / 22x18 = 11:9) は**もう載らない**。
     *   ⚠ これを測らないと「装置を足しただけで一度も発火しない」= 無いのと同じになる。
     *   ⚠ **error にしない** (歪んで貼るのも卓用としては選択肢) ので ok === true も見る。 */
    { const g = base(); at(g, 'n1').mapDef.rooms[0].painting = { theme: 'goblin-mine', key: '1' };
      out.paintAspect = r(g); }
    /* 負のコントロール: 在庫と**同じ比率** (5:4) の部屋なら警告は出ない。
     *   これが無いと「painting を書けば必ず警告する」だけの装置と区別できない。 */
    { const g = base(); const rm = at(g, 'n1').mapDef.rooms[0];
      rm.rect = [4, 26, 19, 45];                       // 20 列 x 16 行 = 5:4
      rm.painting = { theme: 'goblin-mine', key: '1' };
      at(g, 'n1').exits[0].at = [36, 4];                // 出口も新しい縁へ (別の error を混ぜない)
      out.paintAspectOk = r(g); }
    out.info = {
      none: DFMapDef.graphInfo(null),
      broken: DFMapDef.graphInfo({ entry: 'x', nodes: [{ id: 'a' }] }),
      good: (() => { const g = DFMapDef.graphInfo(base());
                     return { present: g.present, ok: !!g.graph, reason: g.reason }; })(),
    };
    return out;
  });
  check('(5a) ★空振り検出: 素のテストグラフは error 0 / warning 0',
    L.pristine.ok === true && L.pristine.e.length === 0 && L.pristine.w.length === 0,
    'e=[' + L.pristine.e.join(',') + '] w=[' + L.pristine.w.join(',') + ']');
  check('(5b) graph 未指定は何も言わない (既存 6 シナリオが赤くならない)',
    L.unspecified.ok === true && L.unspecified.e.length === 0, JSON.stringify(L.unspecified));
  check('(5c) graph-bad (壊れた graph)', L.bad.e.indexOf('graph-bad') >= 0, L.bad.e.join(','));
  check('(5d) graph-not-tree (親が 2 つ = 枝が合流)', L.notTree.e.indexOf('graph-not-tree') >= 0,
    L.notTree.e.join(','));
  check('(5e) graph-unreachable-node', L.unreach.e.indexOf('graph-unreachable-node') >= 0,
    L.unreach.e.join(','));
  check('(5f) graph-no-boss', L.noBoss.e.indexOf('graph-no-boss') >= 0, L.noBoss.e.join(','));
  check('(5g) graph-gate-not-floor (出口が岩盤の上)', L.gateWall.e.indexOf('graph-gate-not-floor') >= 0,
    L.gateWall.e.join(','));
  check('(5h) graph-entry-start (起点が部屋の外)', L.entryStart.e.indexOf('graph-entry-start') >= 0,
    L.entryStart.e.join(','));
  check('(5i) graph-dir-mismatch は **warning** (error ではない)',
    L.dirMismatch.w.indexOf('graph-dir-mismatch') >= 0 && L.dirMismatch.ok === true,
    'w=' + L.dirMismatch.w.join(',') + ' ok=' + L.dirMismatch.ok);
  check('(5j) graph-dead-end-empty は warning',
    L.deadEnd.w.indexOf('graph-dead-end-empty') >= 0 && L.deadEnd.ok === true,
    'w=' + L.deadEnd.w.join(',') + ' ok=' + L.deadEnd.ok);
  check('(5k) graph-kind-role は warning',
    L.kindRole.w.indexOf('graph-kind-role') >= 0 && L.kindRole.ok === true,
    'w=' + L.kindRole.w.join(',') + ' ok=' + L.kindRole.ok);
  check('(5m) ★graph-painting-aspect は warning (可視域サイズの部屋に在庫の1枚絵を指定した)',
    L.paintAspect.w.indexOf('graph-painting-aspect') >= 0 && L.paintAspect.ok === true,
    'w=' + L.paintAspect.w.join(',') + ' ok=' + L.paintAspect.ok);
  check('(5m2) 負のコントロール: 在庫と同じ比率 (20x16 = 5:4) の部屋なら警告しない',
    L.paintAspectOk.w.indexOf('graph-painting-aspect') < 0 && L.paintAspectOk.ok === true,
    'w=[' + L.paintAspectOk.w.join(',') + '] e=[' + L.paintAspectOk.e.join(',') + ']');
  check('(5l) ★graphInfo が「未指定」と「壊れている」を厳密に区別する (silent fail-open にしない)',
    L.info.none.present === false && L.info.none.graph === null &&
    L.info.broken.present === true && L.info.broken.graph === null && !!L.info.broken.reason &&
    L.info.good.present === true && L.info.good.ok === true && L.info.good.reason === null,
    '未指定=' + JSON.stringify(L.info.none) + ' / 壊れ理由=' + L.info.broken.reason);

  // ══ §6 スキーマの非退行 (graph:null が往復同一性を壊していないこと) ════════
  mark('スキーマ非退行 (graph:null)');
  const S = await page.evaluate(() => {
    const deep = (a, b) => {
      if (a === b) return true;
      if (typeof a !== typeof b || a === null || b === null) return false;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      if (typeof a !== 'object') return false;
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      if (ka.join(',') !== kb.join(',')) return false;
      return ka.every(k => deep(a[k], b[k]));
    };
    const D = DFMapDef;
    const rt = (o) => D.sanitize(JSON.parse(JSON.stringify(o)), o);
    return {
      dunHasGraph: 'graph' in D.DEFAULT_DUNGEON, dunGraph: D.DEFAULT_DUNGEON.graph,
      fldHasGraph: 'graph' in D.DEFAULT_FIELD, fldGraph: D.DEFAULT_FIELD.graph,
      dunRound: deep(rt(D.DEFAULT_DUNGEON), D.DEFAULT_DUNGEON),
      fldRound: deep(rt(D.DEFAULT_FIELD), D.DEFAULT_FIELD),
      dunValid: D.validate(D.DEFAULT_DUNGEON).ok,
      fldValid: D.validate(D.DEFAULT_FIELD).ok,
      badCodes: D.validate(Object.assign({}, D.DEFAULT_DUNGEON, { graph: { nodes: [] } })).issues.map(i => i.code),
      nullCodes: D.validate(Object.assign({}, D.DEFAULT_DUNGEON, { graph: null })).issues.map(i => i.code),
      noKeyCodes: (() => { const c = JSON.parse(JSON.stringify(D.DEFAULT_DUNGEON)); delete c.graph;
                           return D.validate(c).issues.map(i => i.code); })(),
      negDeep: deep(D.DEFAULT_DUNGEON, D.DEFAULT_FIELD),
    };
  });
  check('(6a) 既定プリセット 2 種が graph:null を持つ',
    S.dunHasGraph && S.dunGraph === null && S.fldHasGraph && S.fldGraph === null,
    'dungeon=' + S.dunGraph + ' field=' + S.fldGraph);
  check('(6b) ★往復同一性: sanitize(DEFAULT_*) が DEFAULT_* と deep-equal (driver_mapeditor §4 2c/2d の前提)',
    S.dunRound === true && S.fldRound === true, 'dungeon=' + S.dunRound + ' field=' + S.fldRound);
  check('(6c) 負のコントロール: この deep-equal は DEFAULT_DUNGEON と DEFAULT_FIELD を同一と言わない',
    S.negDeep === false, String(S.negDeep));
  check('(6d) validate: 既定プリセット 2 種はエラー 0', S.dunValid && S.fldValid,
    'dungeon=' + S.dunValid + ' field=' + S.fldValid);
  check('(6e) ★validate: graph が**壊れているときだけ** graph-bad を積む (未指定/キー無しは積まない)',
    S.badCodes.indexOf('graph-bad') >= 0 && S.nullCodes.length === 0 && S.noKeyCodes.length === 0,
    '壊れ=[' + S.badCodes.join(',') + '] null=[' + S.nullCodes.join(',') + '] キー無し=[' + S.noKeyCodes.join(',') + ']');

  // ══ §7 出口選択の 3 経路 (auto / 実ダイアログ / autoplay) ═════════════════
  mark('出口選択の経路');
  {
    const wA = [], eA = [];
    const pA = await bootPage(browser, 'http://localhost:' + PORT + QT + '&graph=auto', wA, eA);
    const rA = await pA.evaluate(async () => {
      const o = await window.__graphRun.choose();
      const dlg = document.getElementById('choiceDialog');
      return { auto: window.__graphRun.auto(), to: o && o.to,
               dialogShown: !!(dlg && dlg.classList.contains('show')) };
    });
    check('(7a) ?graph=auto: 矢印もダイアログも出さず先頭の出口を自動選択',
      rA.auto === true && rA.to === 'n1' && rA.dialogShown === false,
      'auto=' + rA.auto + ' to=' + rA.to + ' dialog=' + rA.dialogShown);
    check('(7a2) ?graph=auto 経路で pageerror / console.error が 0', eA.length === 0, eA.slice(0, 3).join(' | '));
    await pA.close();

    /* ⚠⚠ **2026-08-07 (P5 前段) に 2 度目の書き直し**。経緯を残す (どちらも陳腐化であって回帰ではない):
     *   P3 … 広い画面の既定が矢印 UI になり、旧「素の起動では #choiceDialog が開く」が陳腐化
     *         → **狭幅端末ならダイアログ**を測る形へ
     *   P5 … iPhone は縦 (390x844) も横 (844x390) も compact 判定に入るため、その条件では
     *         **実機で矢印が一度も出ない**ことが分かり、狭幅も矢印 (コンパクトレイアウト) へ変更
     *         → ここも「狭幅でも矢印が出て、しかも**全部が可視域に収まる**」を測る形へ
     * ⚠⚠ assert は 1 つも消していない (3 本のまま)。測る対象を新しい正しい挙動へ差し替えただけ。
     * ⚠ ダイアログ経路は死んでいない。今の生存条件は **?autoplay** で、そこは §7 (7a) と
     *   driver_graph_arrows §7 が測っている (候補 0 即返し = 既存ドライバ全部の生命線)。 */
    const savedVp = page.viewport() || { width: 800, height: 600 };
    await page.setViewport({ width: 390, height: 844 });   // iPhone 縦持ち = body.ui-compact
    await new Promise(r => setTimeout(r, 250));
    const rB = await page.evaluate(() => {
      window.__graphRun.choose().then(o => { window.__chosen = o ? o.to : null; });
      return new Promise(res => setTimeout(() => {
        const dlg = document.getElementById('choiceDialog');
        const btns = dlg ? [...dlg.querySelectorAll('button')].map(b => b.textContent) : [];
        const view = window.__graphRun.viewRect();
        const arrows = window.__graphRun.arrows();
        // ★矢印の**レイアウト矩形**で測る (getBoundingClientRect は脈動 transform 込みで揺れる)
        const outside = arrows.filter(a =>
          a.left < view.x - 0.6 || a.left + a.box.w > view.x + view.w + 0.6 ||
          a.top  < view.y - 0.6 || a.top  + a.box.h > view.y + view.h + 0.6);
        res({ shown: !!(dlg && dlg.classList.contains('show')), btns,
              compact: document.body.classList.contains('ui-compact'),
              // ⚠ 本数は直書きしない。ここへ来るまでの遷移でどのノードに居るかが変わるため
              //   (実際 §4 でボスを倒すので現在ノードは n3 = 出口は「引き返す」1 本だけ)。
              exits: window.__graphRun.exits().length,
              arrows: arrows.length, outside: outside.length, view,
              boxes: arrows.map(a => a.box.w + 'x' + a.box.h).join(' ') });
      }, 250));
    });
    check('(7b) ★狭幅端末 (390x844) でも矢印が出る (旧: ダイアログへ落としていた = 実機で矢印ゼロ)',
      rB.compact === true && rB.exits > 0 && rB.arrows === rB.exits && rB.shown === false,
      'compact=' + rB.compact + ' arrows=' + rB.arrows + '/' + rB.exits + ' dialog=' + rB.shown);
    check('(7b2) ★その矢印が 1 本残らず「ダンジョンが見えている矩形」の中にある (縁クランプ)',
      rB.arrows > 0 && rB.outside === 0,
      '画面外=' + rB.outside + '/' + rB.arrows + ' view=' + JSON.stringify(rB.view) +
      ' 矢印寸法=' + rB.boxes);
    const rB2 = await page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 500));          // ★ARROW_TAP_GATE を越えてから押す
      document.querySelector('.exitArrow').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 80));
      return { chosen: window.__chosen, arrows: document.querySelectorAll('.exitArrow').length };
    });
    check('(7c) 矢印をタップすると chooseExit がその出口を返し、矢印が片付く (狭幅でも選べる)',
      !!rB2.chosen && rB2.arrows === 0, 'chosen=' + rB2.chosen + ' arrows=' + rB2.arrows);
    await page.setViewport(savedVp);
    await new Promise(r => setTimeout(r, 250));
  }

  // ══ §8 ペイロード経路 (本番と同じ入口: generatedScenario.run) ═════════════
  mark('生成クエストのペイロード経路');
  const testRunJson = await page.evaluate(() => JSON.stringify(window.__graphRun.testRun()));
  {
    const wP = [], eP = [];
    /* ⚠ dev シームを**使わない** URL で開く (?graphtest を付けない)。ペイロードだけで
     *   RUN が立つことを測るのが目的 (P5 が使う本番の入口)。__graphRun は ?diag で生える観測窓。 */
    const pre = 'sessionStorage.setItem("dragonfighters.generatedScenario", ' +
      JSON.stringify(JSON.stringify({
        title: '分岐テスト', flavor: '', themeId: 'goblin-mine', perceptionDC: 14,
        trapCount: 3, hiddenChestCount: 2, clearXp: 0, spawns: [],
        run: JSON.parse(testRunJson),
      })) + ');';
    const pP = await bootPage(browser, 'http://localhost:' + PORT + '/index.html?diag=1', wP, eP, pre);
    const rP = await pP.evaluate(() => ({
      active: window.__graphRun.active(), nodeId: window.__graphRun.nodeId(),
      boss: window.__graphRun.bossNodeId(), scen: scenarioId,
      enemies: enemies.length, chests: roomChests.length, traps: traps.length,
      exits: window.__graphRun.exits().length,
    }));
    check('(8a) ★ペイロード (sessionStorage.generatedScenario.run) だけで分岐グラフが立つ',
      rP.active === true && rP.nodeId === 'n0' && rP.boss === 'n3' && rP.exits === 3,
      'active=' + rP.active + ' node=' + rP.nodeId + ' exits=' + rP.exits);
    /* ⚠ 2026-08-07 (P4): entry は kind:"start" なので罠も宝箱も 0 個が正しい。
     *   「盤面が組み上がる」の証明は敵で取り、罠/宝箱の母集団は (8b2) が n4/n2 で取る。 */
    check('(8b) 生成クエスト扱い (scenarioId=generated-quest) でも盤面が正しく組み上がる',
      rP.scen === 'generated-quest' && rP.enemies > 0 && rP.traps === 0 && rP.chests === 0,
      'scen=' + rP.scen + ' e=' + rP.enemies + ' t=' + rP.traps + ' c=' + rP.chests);
    const rP2 = await pP.evaluate(async () => {
      const g = window.__graphRun;
      await g.enter('n4', 'down');
      const search = { traps: traps.length, chests: roomChests.length, kind: g.kindOf('n4') };
      await g.enter('n2', 'right');
      const loot = { traps: traps.length, chests: roomChests.length, kind: g.kindOf('n2') };
      return { search, loot };
    });
    check('(8b2) ★ペイロード経路でも kind 由来の配線が効く (search=罠+隠し宝箱 / loot=玄室宝箱のみ)',
      rP2.search.traps > 0 && rP2.search.chests > 0 && rP2.search.kind === 'search' &&
      rP2.loot.traps === 0 && rP2.loot.chests > 0 && rP2.loot.kind === 'loot',
      'search{t=' + rP2.search.traps + ',c=' + rP2.search.chests + '} ' +
      'loot{t=' + rP2.loot.traps + ',c=' + rP2.loot.chests + '}');
    check('(8c) ペイロード経路で pageerror / console.error が 0', eP.length === 0, eP.slice(0, 3).join(' | '));
    await pP.close();
  }

  // ══ §9 撤退スイッチ ?graph=0 (従来の単一マップへ完全に戻る) ═══════════════
  mark('撤退スイッチ ?graph=0');
  {
    const w0 = [], e0 = [];
    const p0 = await bootPage(browser, 'http://localhost:' + PORT + QT + '&graph=0', w0, e0);
    const r0 = await p0.evaluate(() => ({
      active: window.__graphRun.active(), nodeId: window.__graphRun.nodeId(),
      rooms: ROOMS.length, roomRects: JSON.stringify(ROOMS),
      bossRoomIdx: BOSS_ROOM_IDX, objectiveRooms: OBJECTIVE_ROOMS,
      excluded: [...EXCLUDED_ROOMS].join(','), chestExcluded: [...ROOM_CHEST_EXCLUDED_ROOMS].join(','),
      isCustom: !!MAPDEF.isCustom, start: MAPDEF.start.tx + ',' + MAPDEF.start.ty,
      spawns: ENEMY_SPAWNS.length, enemies: enemies.length,
      map: mapData.map(r => r.join('')).join('\n'),
      seam: typeof window.__graphRun,
    }));
    check('(9a) ★?graph=0 で RUN が null (分岐が 1 命令も走らない)',
      r0.active === false && r0.nodeId === null, 'active=' + r0.active + ' node=' + r0.nodeId);
    check('(9b) 幾何が従来の単一マップ (山場 [7,24,20,43] + ボス [5,47,22,68] の 2 部屋)',
      r0.rooms === 2 && r0.roomRects === '[[7,24,20,43],[5,47,22,68]]', r0.roomRects);
    check('(9c) 派生定数が従来値 (bossRoomIdx=1 / 除外集合 {1} と {0,1} が割れている)',
      r0.bossRoomIdx === 1 && r0.excluded === '1' && r0.chestExcluded === '0,1',
      'boss=' + r0.bossRoomIdx + ' excluded={' + r0.excluded + '} chest={' + r0.chestExcluded + '}');
    check('(9d) isCustom=false / 起点 24,13 (既定幾何そのもの)',
      r0.isCustom === false && r0.start === '24,13', 'isCustom=' + r0.isCustom + ' start=' + r0.start);
    /* ★[P5 前段] 戦車の乱入起点を「直書き 68」から「ボス部屋の東端」へ変えた分の**恒等性**。
     *   既定幾何では ROOMS[1] = [5,47,22,68] なので必ず 68 に戻る = 既存 6 シナリオの
     *   乱入位置は 1 タイルも動かない。ここが 68 でなくなったら、それは既定幾何を壊した合図。 */
    const ch0 = await p0.evaluate(() => ({
      base: chariotSpawnBaseTx(), rect: ROOMS[BOSS_ROOM_IDX].slice(),
      spot: findChariotSpawnTile(13), wall: (() => { const s = findChariotSpawnTile(13);
        return isTileWall(s.tx, s.ty); })(),
    }));
    check('(9j) ★?graph=0 では戦車の乱入起点が従来どおり col 68 (導出化が恒等な書き換えである証明)',
      ch0.base === 68 && ch0.rect[3] === 68 && ch0.spot.tx === 68 && ch0.wall === false,
      'base=' + ch0.base + ' ボス部屋=' + JSON.stringify(ch0.rect) +
      ' 湧き先=' + JSON.stringify(ch0.spot) + ' 壁=' + ch0.wall);
    check('(9e) 敵が廃坑の spawns 表から湧いている (ノード別スポーンが効いていない)',
      r0.spawns > 8 && r0.enemies === r0.spawns, 'spawns=' + r0.spawns + ' enemies=' + r0.enemies);
    check('(9f) ★負のコントロール: 分岐版の mapData と ?graph=0 の mapData が違う (同じ物を 2 回測っていない)',
      sha256(r0.map) !== sha256(mapText0),
      'graph=0 ' + sha256(r0.map).slice(0, 10) + ' / 分岐 ' + sha256(mapText0).slice(0, 10));
    check('(9g) 観測シームは ?graph=0 でも生える (シームの有無で分岐の有無を判定させない)',
      r0.seam === 'object', 'typeof=' + r0.seam);
    const r0b = await p0.evaluate(() => {
      for (const e of enemies) { e.alive = false; e.hp = 0; }
      visitedRooms.clear();
      checkDungeonClear();
      const before = dungeonCleared;
      for (let i = 0; i < ROOMS.length; i++) visitedRooms.add(i);
      checkDungeonClear();
      return { before, after: dungeonCleared, objective: OBJECTIVE_ROOMS };
    });
    check('(9h) ★?graph=0 では従来の「visitedRooms.size >= OBJECTIVE_ROOMS」判定が生きている',
      r0b.before === false && r0b.after === true,
      '部屋未踏破=' + r0b.before + ' 踏破後=' + r0b.after + ' (OBJECTIVE_ROOMS=' + r0b.objective + ')');
    check('(9i) ?graph=0 経路で pageerror / console.error が 0', e0.length === 0, e0.slice(0, 3).join(' | '));
    await p0.close();
  }

  // ══ §10 dev ゲート (silent fail-open を作らない) ═══════════════════════════
  mark('dev ゲート');
  {
    const gw = [], ge = [];
    const gate = await browser.newPage();
    gate.on('pageerror', e => ge.push(e.message));
    /* ⚠ この puppeteer-core は console.warn を type()==='warn' で通知する ('warning' ではない)。 */
    gate.on('console', m => { if (m.type() === 'warn' || m.type() === 'warning') gw.push(m.text()); });
    await gate.evaluateOnNewDocument(() => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine'); } catch (e) {}
      try { localStorage.removeItem('df.devMode'); } catch (e) {}
    });
    // ⚠ ?diag / ?autoplay / ?autodebug を一切付けない = 素のプレイヤーと同じ条件
    await gate.goto('http://localhost:' + PORT + '/index.html?graphtest=1',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await gate.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'",
      { timeout: 25000 });
    const g = await gate.evaluate(() => ({
      seam: typeof window.__graphRun, rooms: ROOMS.length, enemies: enemies.length,
      roomRects: JSON.stringify(ROOMS),
    }));
    check('(10a) dev モードでない素の起動では観測シームが生えない', g.seam === 'undefined', 'typeof=' + g.seam);
    /* ⚠⚠ 2026-08-08 (P5) に**期待値を書き直した**。廃坑 (goblin-mine) が既定で分岐版になったので、
     *   dev ゲートで ?graphtest が弾かれた後に立ち上がるのは「従来の単一マップ」ではなく
     *   **廃坑の内蔵グラフの entry ノード** (7 列 x 6 行 の 1 部屋・敵 0 体) になった。
     *   ⭐ 測る対象は変えていない =「?graphtest の内蔵テストグラフが載っていないこと」。
     *     テストグラフの n0 は**敵 2 体**を持つので `enemies === 0` で両者を区別できる
     *     (部屋 rect は両者とも [11,33,16,39] なので rect だけでは区別できない)。
     *   ⚠ assert は消していない。「無視したこと」の直接の証拠は (10c) の console.warn。 */
    check('(10b) 同上: ?graphtest は無視され、廃坑の内蔵グラフ (テストグラフではない) で立ち上がる',
      g.rooms === 1 && g.roomRects === '[[11,33,16,39]]' && g.enemies === 0,
      'rooms=' + g.rooms + ' rects=' + g.roomRects + ' enemies=' + g.enemies);
    check('(10c) 無視したことを console.warn で必ず知らせる (silent fail-open にしない)',
      gw.some(w => w.indexOf('?graphtest') >= 0),
      gw.filter(w => w.indexOf('graphtest') >= 0).join(' | ') || '<warn なし>');
    check('(10d) ゲート経路で pageerror 0', ge.length === 0, ge.slice(0, 3).join(' | '));
    await gate.close();
  }

  // ══ §11 ?autoplay 完走 (ボス到達 → 撃破 → クリア) ══════════════════════════
  if (!NO_FULL) {
    mark('?autoplay 完走 (最大 ' + Math.round(FULL_TIMEOUT_MS / 1000) + 's)');
    const wF = [], eF = [];
    const pF = await bootPage(browser,
      'http://localhost:' + PORT + '/index.html?autoplay=25&diag=1&graphtest=1', wF, eF);
    const t0 = Date.now();
    const visited = [];
    let lastNode = null, cleared = false, over = false;
    while (Date.now() - t0 < FULL_TIMEOUT_MS) {
      const s = await pF.evaluate(() => ({
        node: window.__graphRun.nodeId(), cleared: dungeonCleared, over: gameOver,
      }));
      if (s.node && s.node !== lastNode) { visited.push(s.node); lastNode = s.node; console.log('[drv]     → ノード ' + s.node); }
      if (s.cleared) { cleared = true; break; }
      if (s.over) { over = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    const fin = await pF.evaluate(() => ({
      node: window.__graphRun.nodeId(), bossDefeated: window.__graphRun.bossDefeated(),
    }));
    const secs = Math.round((Date.now() - t0) / 1000);
    console.log('[drv]   通ったノード: ' + visited.join(' → ') + '  (' + secs + 's)');
    check('(11a) ★?autoplay がボスノードまで到達した (選択 → 歩き → 到達検出 → 遷移 が全部つながっている)',
      visited.indexOf('n3') >= 0, '通過=' + visited.join(',') + ' gameOver=' + over);
    check('(11b) ★決定論的な深さ優先: n0 → n1 → n3 の順に進む (未踏の枝が候補 0 に来る並び)',
      visited.join(',') === 'n0,n1,n3', visited.join(','));
    check('(11c) ★ボスを撃破してクリアまで完走した', cleared === true && fin.bossDefeated === true,
      'cleared=' + cleared + ' bossDefeated=' + fin.bossDefeated + ' gameOver=' + over + ' ' + secs + 's');
    check('(11d) 完走中に pageerror / console.error が 0', eF.length === 0, eF.slice(0, 4).join(' | '));
    await pF.close();
  }

  // ══ §12 負のコントロール (同一 run に内包) ═════════════════════════════════
  mark('負のコントロール --mutate ' + MUTATE);
  {
    const wM = [], eM = [];
    const pM = await bootPage(browser, 'http://localhost:' + (PORT + 1) + QT, wM, eM);
    // ⚠ 2026-08-07 (P4): 素の側 (§2) と**同じ往復**にすること。起点を揃えないと
    //   「素では保たれ、変異では壊れる」という対比が成立しない (別の物を 2 つ測るだけになる)。
    const M = await pM.evaluate(async () => {
      const g = window.__graphRun;
      await g.enter('n4', 'down');                      // ★罠と隠し宝箱が湧く唯一の kind へ
      enemies[0].alive = false; enemies[0].hp = 0;
      roomChests[0].found = true; roomChests[0].hidden = false; roomChests[0].opened = true;
      traps[0].found = true; traps[0].triggered = true;
      // ⚠ §2 と**同じ領域**を開けること (上の注記を参照。総数で測ると負のコントロールが沈黙する)
      const FOG = { y0: 18, y1: 20, x0: 24, x1: 27 };
      for (let y = FOG.y0; y <= FOG.y1; y++) for (let x = FOG.x0; x <= FOG.x1; x++) exploredTiles[y][x] = 1;
      const fogRegion = () => {
        let n = 0;
        for (let y = FOG.y0; y <= FOG.y1; y++) for (let x = FOG.x0; x <= FOG.x1; x++) n += exploredTiles[y][x];
        return n;
      };
      const snap = () => ({
        alive: enemies.filter(e => e.alive).length, opened: roomChests.filter(c => c.opened).length,
        sprung: traps.filter(t => t.triggered).length,
        fogRegion: fogRegion(),
        explored: exploredTiles.reduce((a, r) => a + r.reduce((b, v) => b + v, 0), 0),
        chestTiles: roomChests.map(c => c.tx + ',' + c.ty).join(' '),
      });
      const before = snap();
      await g.enter('n2', 'right');
      await g.enter('n4', 'left');
      return { before, after: snap() };
    });
    console.log('[drv]   変異側 出発前=' + JSON.stringify(M.before));
    console.log('[drv]   変異側 戻り  =' + JSON.stringify(M.after));
    /* ⚠ 変異ごとに「欠陥の姿」が違う。単一の物差しを使い回すと空振りする。 */
    if (MUTATE === 'nosave') {
      check('(12) 変異側では倒した敵が復活する (= この検出器は保存を本当に見ている)',
        M.after.alive > M.before.alive, '出発前 alive=' + M.before.alive + ' → 戻り=' + M.after.alive);
      check('(12b) 素の側の同じ指標は保たれる (外科的な差である証明)',
        T.n0After.alive === T.n0Before.alive, '素: ' + T.n0Before.alive + ' → ' + T.n0After.alive);
    } else if (MUTATE === 'norestore') {
      check('(12) 変異側では開けた宝箱が閉じている', M.after.opened < M.before.opened,
        '出発前 opened=' + M.before.opened + ' → 戻り=' + M.after.opened);
      check('(12b) 素の側の同じ指標は保たれる', T.n0After.opened === T.n0Before.opened,
        '素: ' + T.n0Before.opened + ' → ' + T.n0After.opened);
    } else if (MUTATE === 'nofog') {
      check('(12) 変異側ではフォグが戻る (視界外に開けた 3x4 領域が閉じる)',
        M.after.fogRegion < M.before.fogRegion && M.before.fogRegion === 12,
        '出発前=' + M.before.fogRegion + '/12 → 戻り=' + M.after.fogRegion + '/12');
      check('(12b) 素の側の同じ指標は保たれる', T.n0After.fogRegion === T.n0Before.fogRegion,
        '素: ' + T.n0Before.fogRegion + '/12 → ' + T.n0After.fogRegion + '/12');
    } else if (MUTATE === 'noseed') {
      check('(12) 変異側では戻ったノードの宝箱が別の座標に湧く (乱数が固定されていない)',
        M.after.chestTiles !== M.before.chestTiles,
        '出発前=[' + M.before.chestTiles + '] 戻り=[' + M.after.chestTiles + ']');
      check('(12b) 素の側は同じ座標に湧く', T.n0After.chestTiles === T.n0Before.chestTiles,
        '素: [' + T.n0Before.chestTiles + ']');
    } else if (MUTATE === 'nogate') {
      /* ⚠ nogate は「歩かない」欠陥なので、enter() を直接叩く往復テストでは差が出ない。
       *   測るべきは **heroForcedGoal が heroAI の目標決定へ届いているか**。1 tick 回して見る。
       * ⚠⚠ heroAI は目標決定に**辿り着く前に 6 箇所で早期 return する**。素の側でも空振りしないよう
       *   全部畳んでおくこと (最初の版はこれを怠り、素の側で pathGoal=null になって
       *   「変異側も素の側も同じ理由で null」= 検出力ゼロの比較になった):
       *     ・プレイヤーを**そのノードの起点**へ置く … 前ノードの座標のままだと岩盤の上に立ち、
       *       A* が空を返して pathGoal が null になる (ボスノードで実際に踏んだ)
       *     ・仲間をプレイヤーの隣へ寄せる … isBacklineInPosition() が false だと
       *       heroAI は目標決定まで進まず rally して return する (MAX_LAG=480px)
       *     ・敵の生死とドロップ … 生きた敵 / 落ちている戦利品があると①②が先に勝つ
       *     ・encounterActive / heroSliding / heroTurnPause … どれも先頭のガードで return する */
      const probe = `(async () => {
        const g = window.__graphRun;
        for (const e of enemies) { e.alive = false; e.hp = 0;
          e.coinVisible = false; e.weaponVisible = false; e.armorVisible = false; }
        encounterActive = false; encounterRunning = false;
        gameStarted = true; gameOver = false;
        playerX = START_TX * TILE_SIZE + SNAP_X_OFFSET;
        playerY = START_TY * TILE_SIZE + SNAP_Y_OFFSET;
        for (const a of allies) { a.x = playerX; a.y = playerY; }
        const ex = g.exits()[0];
        await g.pick(ex.to);        /* ⚠ [P5] pick は async (施錠扉なら判定を挟む) */
        const goal = g.forcedGoal();
        heroPath = []; heroPathGoal = null; heroPathTTL = 0;
        heroSliding = false; heroTurnPause = 0; heroStuckTicks = 0; heroWiggleUntil = 0;
        heroAI();
        return { goal, pathGoal: heroPathGoal, node: g.nodeId(), to: ex.to };
      })()`;
      const R = await pM.evaluate(probe);
      const P = await page.evaluate(probe);
      check('(12) 変異側では出口タイルを目標にしない (heroForcedGoal が heroAI に届いていない)',
        !R.pathGoal || R.pathGoal.tx !== R.goal.tx || R.pathGoal.ty !== R.goal.ty,
        R.node + '→' + R.to + ' goal=' + JSON.stringify(R.goal) + ' pathGoal=' + JSON.stringify(R.pathGoal));
      check('(12b) ★素の側は出口タイルをそのまま目標にする (空振りでない証明)',
        !!P.pathGoal && P.pathGoal.tx === P.goal.tx && P.pathGoal.ty === P.goal.ty,
        P.node + '→' + P.to + ' goal=' + JSON.stringify(P.goal) + ' pathGoal=' + JSON.stringify(P.pathGoal));
    }
    check('(12c) 変異側でも JS エラーは出ない (壊したのは 1 箇所だけ = 外科的)',
      eM.length === 0, eM.slice(0, 3).join(' | '));
    await pM.close();
  }

  // ══ §13 エラーゼロ ════════════════════════════════════════════════════════
  mark('エラーゼロ');
  check('(13a) 素の側: 起動〜全操作で pageerror / console.error が 0', errs.length === 0,
    errs.slice(0, 5).join(' | '));

  await page.close();
  await browser.close();
  srvPure.close(); srvMut.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n[drv] ' + pass + '/' + results.length + ' PASS   (--mutate ' + MUTATE +
    (NO_FULL ? ' / --no-full' : '') + ')');
  if (pass !== results.length) {
    console.log('[drv] FAILED:');
    for (const r of results) if (!r.ok) console.log('   - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
    process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
