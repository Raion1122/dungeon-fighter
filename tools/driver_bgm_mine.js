#!/usr/bin/env node
/*
 * driver_bgm_mine.js — 廃坑の BGM を 3 曲へ分けた配線の検証ドライバ (2026-08-21)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 入れたもの (実装依頼書/完了/2026-08-20_bgm-mine-swap.md)
 *   廃坑を場面ごとに 3 曲へ分ける。
 *     n0「坑道の入口」  → mine_entrance (d1.mp3)
 *     n1「坑道の奥」    → mine_depths   (haikou.mp3)
 *     グリクス戦        → mine_boss     (boss01.mp3)
 *
 * ■ 測り方の方針
 *   ⭐ 音は headless で聴けない。**「どのキーを渡したか」で測る**。
 *      観測は 2 経路を突き合わせる (片方の写経にしない):
 *        ① 実際に鳴った側 … GameAudio.playBgm を包んで呼ばれた ID を記録する
 *        ② 決める側       … dev シーム __graphRun.bgm() が currentBgmId() **そのもの**を呼ぶ
 *      ドライバが NODE_BGM の表を写経すると、実装とドライバが同じ間違いを共有して両方緑になる。
 *   ⭐ 恒等 (§2) は他 5 シナリオ + 生成クエストで測る。**boss_battle は 5 シナリオ共有**なので、
 *      廃坑のボス曲を足したせいで他が巻き添えになっていないかがこのチケットの本当の危険。
 *   ⚠ mp3 の読み込み失敗は**静かに無音になるだけ**で画面には何も出ない。§3 で src の実在を測る。
 *
 * ■ ボス曲が鳴り始める瞬間について
 *   畳み込み後の廃坑は **n1 が「坑道の奥」と「玉座の間」を兼ねる**。mine_depths → mine_boss の
 *   切替を作っているのは syncBossRoomFlag の「玉座へ 8 タイル以内」(P8-2) で、**入室では鳴らない**。
 *   → (1c) は退避口 ?bossapproach=0 (= 入室で即ボス部屋) で production 経路のまま測り、
 *     (1c2) が素のページで「入室直後はまだ mine_depths」= 切替点がラッチ側にあることを測る。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate      | 注入する欠陥                                   | 赤くなるべき節
 *   PORT   | (素)        | —                                              | —
 *   PORT+1 | nonodebgm   | NODE_BGM を常に空 (ノード別の枝を殺す)         | §1a
 *   PORT+2 | bossglobal  | ボス曲をシナリオ別にせず mine_boss 固定        | §2c
 *   PORT+3 | badsrc      | mine_depths の src を存在しないパスへ          | §3a
 *
 * 使い方:
 *   node tools/driver_bgm_mine.js
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
/* ⚠ ポートは既存ドライバと空ける。9080-9085 は driver_mine_wall が 6 本掴む。
 *   本ドライバは PORT..PORT+3 の 4 本。 */
const PORT = parseInt(arg('port', '9090'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
// ⚠ 置換後の長さを 1 文字以上ずらすこと ((0b) がバイト長で「同じ物を 2 回測っていない」を見る)。
// ⚠ badsrc だけ差し替え先が audio.js。file を持たせて配信側で振り分ける。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  nonodebgm: { file: 'index.html',
    from: '      const nb = MINE_BGM_OFF ? null : (NODE_BGM[scenarioId] || {})[currentNodeId];',
    to:   '      const nb = null;   /* mut-nonodebgm ノード別の枝を殺す */' },
  bossglobal: { file: 'index.html',
    from: '        return (MINE_BGM_OFF ? null : SCENARIO_BOSS_BGM[scenarioId]) || "boss_battle";',
    to:   '        return "mine_boss";   /* mut-bossglobal 全シナリオのボス曲を廃坑のものへ */' },
  badsrc: { file: 'audio.js',
    from: '    mine_depths:    { src: "assets/bgm/haikou.mp3",               loop: true, volume: 0.43, credit: "魔王魂" },',
    to:   '    mine_depths: { src: "assets/bgm/__no_such_file.mp3", loop: true, volume: 0.43, credit: "" },   /* mut-badsrc */' },
};
const MUT_ORDER = ['nonodebgm', 'bossglobal', 'badsrc'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const SRC = {
  'index.html': fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
  'audio.js':   fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf8'),
};
const MUT_SRC = {};
for (const k of MUT_ORDER) {
  const m = MUTATIONS[k];
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  const n = SRC[m.file].split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: SRC[m.file].split(m.from).join(m.to) };
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
        if (mutKey && u === '/' + MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()]);
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
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
function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
}
function httpStatus(url) {
  return new Promise((res) => {
    const r = http.get(url, (resp) => { resp.resume(); res(resp.statusCode); });
    r.on('error', () => res(0));
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

/* ページを起こす。
 * ⚠⚠ **playBgm の包み込みは startGame() の前**。startGame → setPhase("explore") が n0 の
 *   1 発目を鳴らすので、後から包むと (1a) の母集団が丸ごと消える。 */
async function bootPage(browser, port, query, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => errs.push('[:' + port + query + '] PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('[:' + port + query + '] CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((scen, payload) => {
    try {
      if (payload) {
        sessionStorage.setItem('dragonfighters.generatedScenario', payload);
      } else {
        sessionStorage.setItem('dragonfighters.currentScenario', scen);
        sessionStorage.removeItem('dragonfighters.generatedScenario');
      }
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, opts.scen || 'goblin-mine', opts.payload || null);
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && !!window.GameAudio && !!window.__graphRun",
    { timeout: 25000 });
  await page.evaluate(() => {
    window.__bgmLog = [];
    const orig = window.GameAudio.playBgm;
    window.GameAudio.playBgm = function (n) {
      try { window.__bgmLog.push({ id: n, node: window.__graphRun ? window.__graphRun.nodeId() : null }); } catch (e) {}
      return orig.apply(this, arguments);
    };
  });
  /* ⚠⚠ **startGame() を通さないと検出器が丸ごと沈黙する** (P7 で誤読しかけた)。 */
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  /* ⚠ 固定待ち (sleep) にしない。1 発目が来るまでポーリングする — 固定時間窓は
   *   健全な分布が窓をまたいだ瞬間に間欠フレークになる。 */
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.__bgmLog.length > 0)); i++) await sleep(120);
  return page;
}
/* 開いているダイアログ / 判定パネルを閉じる。
 * ⚠ 通さないと dialogPaused で heroAI ごと止まり、ノード遷移が永久に走らない。 */
async function closeDialogs(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) return true;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
      if (btns.length) btns[btns.length - 1].click();   // 末尾 = キャンセル (Esc と同じ経路)
      const ov = document.getElementById('skillCheckOverlay');
      if (ov && ov.classList.contains('show')) {
        const rb = document.getElementById('scRollBtn');
        if (rb) rb.click();
        ov.click();
      }
      document.body.click();
    });
    await sleep(320);
  }
  return await page.evaluate(() => !skillCheckActive && !dialogPaused);
}
async function gotoNode(page, id, viaDir, ms) {
  await page.evaluate((to, dir) => { window.__bgEnter = window.__graphRun.enter(to, dir); }, id, viaDir);
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate((n) => window.__graphRun.nodeId() === n, id)) { await closeDialogs(page); return true; }
    if (Date.now() - t0 >= (ms || 20000)) return false;
    await sleep(120);
  }
}
// 「今どのキーを渡したか」= playBgm ログの末尾 (実際に鳴った側)
const lastPlayed = (page) => page.evaluate(() =>
  (window.__bgmLog.length ? window.__bgmLog[window.__bgmLog.length - 1] : null));
/* ⚠⚠ **ノード遷移の直後に読むと 1 ノード前の記録が返る** (2026-08-21 に実測)。
 *   enterNode は currentNodeId を先に書き換え、曲を鳴らす setPhase("explore") は
 *   placeNodeParty → snapCamera → 明転 300ms の**後**なので、nodeId() の一致だけを
 *   合図にすると「まだ n0 の mine_entrance」を読んでしまう。
 *   → **そのノードでの記録が出るまでポーリングする**。固定時間窓にしないのは、
 *     健全な分布が窓をまたいだ瞬間に間欠フレークになるため。 */
async function waitPlayedAt(page, nodeId, ms) {
  const t0 = Date.now();
  for (;;) {
    const hit = await page.evaluate((n) => {
      for (let i = window.__bgmLog.length - 1; i >= 0; i--) if (window.__bgmLog[i].node === n) return window.__bgmLog[i];
      return null;
    }, nodeId);
    if (hit) return hit;
    if (Date.now() - t0 >= (ms || 15000)) return await lastPlayed(page);   // ⚠ 諦めた時も「何を見たか」を返す
    await sleep(150);
  }
}
// 「今どのキーを渡すべきか」= currentBgmId() そのもの (決める側)
const seamBgm = (page) => page.evaluate(() => window.__graphRun.bgm());
/* ボス部屋での決定を測る。⚠ __inBossRoom は syncBossRoomFlag が持つ状態なので、
 *   **読んだ直後に必ず元へ戻す** (applyRoomClearHeal など他の判定が同じ旗を見る)。 */
const seamBossBgm = (page) => page.evaluate(() => {
  const prev = window.__inBossRoom;
  window.__inBossRoom = true;
  const r = window.__graphRun.bgm();
  window.__inBossRoom = prev;
  return r;
});

/* 生成クエストのペイロード。⚠ themeId を **goblin-mine** にしてあるのが肝 — テーマが廃坑でも
 *   scenarioId は generated-quest なので、NODE_BGM/SCENARIO_BOSS_BGM に落ちてはいけない。 */
const GEN_PAYLOAD = JSON.stringify({
  title: 'BGM 恒等テスト', flavor: '', themeId: 'goblin-mine', tierKey: 'tier1',
  questLevel: 3, perceptionDC: 14, trapCount: 3, hiddenChestCount: 2, clearXp: 0, spawns: [],
});

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_bgmmine_');
  const browserPath = findBrowser();
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const errs = [];

  try {
    // ══ §0 装置 ═══════════════════════════════════════════════════════════════
    mark('§0 変異が素の配信に無く、変異ポートにだけ載っていること');
    for (const k of MUT_ORDER) {
      const f = '/' + MUT_SRC[k].file;
      const pure = await httpGet('http://localhost:' + PORT + f);
      const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
      check('(0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
        pure.body.split(MUTATIONS[k].to).length - 1 === 0 && mut.body.split(MUTATIONS[k].to).length - 1 === 1,
        f);
      check('(0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
        pure.body.length !== mut.body.length, '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
    }

    // ══ §1 廃坑 ═══════════════════════════════════════════════════════════════
    mark('§1 廃坑が n0=入口 / n1=坑内 / グリクス戦=ボス曲 で鳴る');
    const page = await bootPage(browser, PORT, '?diag=1&intel=0', errs);
    await closeDialogs(page);
    const p0 = await lastPlayed(page);
    const s0 = await seamBgm(page);
    check('(0c) 装置: playBgm ラッパが 1 回以上 ID を捉えている (検出器が空振りしていない)',
      !!p0 && typeof p0.id === 'string',
      'log=' + JSON.stringify(await page.evaluate(() => window.__bgmLog.slice(0, 4))));
    check('(1a) n0 に居る間、渡される ID が mine_entrance (鳴った側と決める側の両方)',
      p0 && p0.id === 'mine_entrance' && s0.id === 'mine_entrance' && s0.nodeId === 'n0',
      '鳴った=' + JSON.stringify(p0) + ' 決める=' + JSON.stringify(s0));

    check('(1z) 装置: n1 へ入れた', await gotoNode(page, 'n1', 'right', 25000), '');
    const p1 = await waitPlayedAt(page, 'n1', 15000);
    const s1 = await seamBgm(page);
    check('(1b) n1 へ遷移した直後、渡される ID が mine_depths',
      p1 && p1.id === 'mine_depths' && s1.id === 'mine_depths' && s1.nodeId === 'n1',
      '鳴った=' + JSON.stringify(p1) + ' 決める=' + JSON.stringify(s1));
    /* ⭐ 「入室ではまだボス曲でない」= 切替点が **玉座への接近ラッチ**にあることの証拠。
     *   ここを測らないと、(1c) が ?bossapproach=0 だけで緑になり「入室で即ボス曲」という
     *   別の欠陥を温存したまま通ってしまう。 */
    const ba = await page.evaluate(() => window.__graphRun.bossApproach());
    check('(1c2) ★n1 は入室しただけではボス曲にならない (切替点は玉座への接近ラッチ側)',
      s1.inBossRoom === false && ba.latched === false && ba.bigRoom === true,
      'inBossRoom=' + s1.inBossRoom + ' approach=' + JSON.stringify(ba));
    const sb1 = await seamBossBgm(page);
    check('(1c3) その n1 でボス部屋になった瞬間の決定は mine_boss',
      sb1.id === 'mine_boss', JSON.stringify(sb1));

    // ── (1c) production 経路: ?bossapproach=0 は「入室で即ボス部屋」 ──────────
    const pageBA = await bootPage(browser, PORT, '?diag=1&intel=0&bossapproach=0', errs);
    await closeDialogs(pageBA);
    check('(1z2) 装置: ?bossapproach=0 で n1 へ入れた', await gotoNode(pageBA, 'n1', 'right', 25000), '');
    const pBA = await waitPlayedAt(pageBA, 'n1', 15000);
    check('(1c) ★グリクス戦になった時に **実際に鳴らした** ID が mine_boss',
      pBA && pBA.id === 'mine_boss', '鳴った=' + JSON.stringify(pBA));
    await pageBA.close();

    // ── (1d) ?minefold=0 の旧 5 ノード構成 ────────────────────────────────────
    mark('§1d 旧 5 ノード構成 (?minefold=0) でも n0 だけ入口曲・残りは坑内曲');
    const pageOld = await bootPage(browser, PORT, '?diag=1&intel=0&minefold=0', errs);
    await closeDialogs(pageOld);
    const old0 = await lastPlayed(pageOld);
    check('(1d-n0) 旧構成の n0 が mine_entrance',
      old0 && old0.id === 'mine_entrance' && old0.node === 'n0', JSON.stringify(old0));
    const oldSeq = {};
    for (const [id, dir] of [['n1', 'right'], ['n4', 'right'], ['n5', 'up'], ['n7', 'right']]) {
      const ok = await gotoNode(pageOld, id, dir, 25000);
      oldSeq[id] = ok ? await waitPlayedAt(pageOld, id, 15000) : null;
      oldSeq[id + '_seam'] = ok ? await seamBgm(pageOld) : null;
    }
    check('(1d-mid) 旧構成の n1 / n4 / n5 が全部 mine_depths',
      ['n1', 'n4', 'n5'].every(k => oldSeq[k] && oldSeq[k].id === 'mine_depths'),
      JSON.stringify({ n1: oldSeq.n1, n4: oldSeq.n4, n5: oldSeq.n5 }));
    check('(1d-n7) 旧構成の n7 (玉座の間) が mine_boss',
      oldSeq.n7 && oldSeq.n7.id === 'mine_boss',
      '鳴った=' + JSON.stringify(oldSeq.n7) + ' 決める=' + JSON.stringify(oldSeq.n7_seam));
    await pageOld.close();

    // ══ §2 恒等 (他シナリオに副作用ゼロ) ══════════════════════════════════════
    mark('§2 他 5 シナリオ + 生成クエストの割当が 1 つも変わっていない');
    /* ⚠⚠ boss_battle は 5 シナリオ共有。廃坑にボス曲を足した副作用が出るとしたらここ。 */
    const SCEN = [
      { id: 'bandits-forest', explore: 'dungeon_normal', boss: 'boss_battle' },
      { id: 'lizard-swamp',   explore: 'dungeon_normal', boss: 'boss_battle' },
      { id: 'orc-fort',       explore: 'dungeon_climax', boss: 'boss_battle' },
      { id: 'undead-temple',  explore: 'dungeon_climax', boss: 'boss_battle' },
      // 竜の巣は道中→ボス戦「通し」= 切替なしが仕様
      { id: 'dragon-lair',    explore: 'pharaxus_stage', boss: 'pharaxus_stage' },
    ];
    for (const sc of SCEN) {
      const p = await bootPage(browser, PORT, '?diag=1&intel=0', errs, { scen: sc.id });
      await closeDialogs(p);
      const played = await lastPlayed(p);
      const ex = await seamBgm(p);
      const bo = await seamBossBgm(p);
      check('(2a/2b-' + sc.id + ') 探索が ' + sc.explore + ' のまま',
        played && played.id === sc.explore && ex.id === sc.explore && ex.scenarioId === sc.id,
        '鳴った=' + JSON.stringify(played) + ' 決める=' + JSON.stringify(ex));
      check('(2c/2d-' + sc.id + ') ボス部屋が ' + sc.boss + ' のまま',
        bo.id === sc.boss, JSON.stringify(bo));
      await p.close();
    }
    {
      // (2e) 生成クエスト
      const p = await bootPage(browser, PORT, '?diag=1&intel=0', errs, { payload: GEN_PAYLOAD });
      await closeDialogs(p);
      const ex = await seamBgm(p);
      const bo = await seamBossBgm(p);
      check('(2e) 生成クエスト (themeId=goblin-mine / tier1) が tier どおり dungeon_normal のまま',
        ex.scenarioId === 'generated-quest' && ex.id === 'dungeon_normal' && ex.scene === 'dungeon_normal',
        JSON.stringify(ex));
      check('(2e2) 生成クエストのボス部屋が boss_battle のまま (廃坑テーマに引っぱられない)',
        bo.id === 'boss_battle', JSON.stringify(bo));
      await p.close();
    }
    {
      // (2f) 撤退スイッチ
      const p = await bootPage(browser, PORT, '?diag=1&intel=0&minebgm=0', errs);
      await closeDialogs(p);
      const a = await seamBgm(p);
      const b = await seamBossBgm(p);
      const ok1 = await gotoNode(p, 'n1', 'right', 25000);
      const c = await seamBgm(p);
      check('(2f) ?minebgm=0 で廃坑が dungeon_normal / boss_battle に戻る',
        a.off === true && a.id === 'dungeon_normal' && b.id === 'boss_battle'
        && ok1 && c.id === 'dungeon_normal',
        'n0=' + JSON.stringify(a) + ' boss=' + JSON.stringify(b) + ' n1=' + JSON.stringify(c));
      await p.close();
    }

    // ══ §3 素材 ═══════════════════════════════════════════════════════════════
    mark('§3 BGM_FILES の src が全部実在する (404 で無音にならない)');
    const files = await page.evaluate(() => window.GameAudio.__bgmFiles());
    check('(3z) 装置: BGM_FILES を実体から引けている (表を写経していない)',
      Array.isArray(files) && files.length >= 7, 'n=' + (files ? files.length : -1)
        + ' ids=' + JSON.stringify((files || []).map(f => f.id)));
    const statuses = [];
    for (const f of files) statuses.push({ id: f.id, src: f.src, st: await httpStatus('http://localhost:' + PORT + '/' + f.src) });
    check('(3a) BGM_FILES の全エントリの src が 200 で返る',
      statuses.every(s => s.st === 200), JSON.stringify(statuses));
    const vol = (id) => (files.find(f => f.id === id) || {}).volume;
    check('(3b) 廃坑の 3 曲が実測どおりの volume を持ち、既存 4 曲の volume が変わっていない',
      vol('mine_entrance') === 0.74 && vol('mine_depths') === 0.43 && vol('mine_boss') === 0.52
      && vol('dungeon_normal') === 0.60 && vol('dungeon_climax') === 0.60
      && vol('boss_battle') === 0.65 && vol('pharaxus_stage') === 0.55,
      JSON.stringify(files.map(f => f.id + '=' + f.volume)));
    await page.close();

    // ══ §4 負のコントロール ═══════════════════════════════════════════════════
    mark('§4 負のコントロール (欠陥を注入すると該当節が赤くなる)');
    {
      const p = await bootPage(browser, PORT_OF['nonodebgm'], '?diag=1&intel=0', errs);
      await closeDialogs(p);
      const a = await lastPlayed(p);
      const s = await seamBgm(p);
      check('(4-nonodebgm) NODE_BGM を殺すと §1a が赤くなる (n0 が入口曲でなくなる)',
        a && a.id !== 'mine_entrance' && s.id !== 'mine_entrance',
        '鳴った=' + JSON.stringify(a) + ' 決める=' + JSON.stringify(s));
      await p.close();
    }
    {
      const p = await bootPage(browser, PORT_OF['bossglobal'], '?diag=1&intel=0', errs,
        { scen: 'bandits-forest' });
      await closeDialogs(p);
      const b = await seamBossBgm(p);
      check('(4-bossglobal) ボス曲を固定にすると §2c が赤くなる (森のボスが mine_boss になる)',
        b.id === 'mine_boss', JSON.stringify(b));
      await p.close();
    }
    {
      const p = await bootPage(browser, PORT_OF['badsrc'], '?diag=1&intel=0', errs);
      await closeDialogs(p);
      const fl = await p.evaluate(() => window.GameAudio.__bgmFiles());
      const bad = fl.find(f => f.id === 'mine_depths');
      const st = await httpStatus('http://localhost:' + PORT_OF['badsrc'] + '/' + bad.src);
      check('(4-badsrc) src を存在しないパスにすると §3a が赤くなる',
        st !== 200, 'src=' + bad.src + ' status=' + st);
      await p.close();
    }

    // ══ §5 ページエラー ═══════════════════════════════════════════════════════
    mark('§5 ページエラーが出ていないこと');
    check('(5a) 測定ページで pageerror / console.error が出ていない',
      errs.length === 0, errs.slice(0, 6).join(' | '));
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const bad = results.filter(r => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + (results.length - bad.length) + '/' + results.length + ' PASS');
  if (bad.length) {
    console.log('  FAIL:');
    for (const b of bad) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(bad.length ? 1 : 0);
})();
