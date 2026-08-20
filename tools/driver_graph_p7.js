/*
 * driver_graph_p7.js — ★P7「分岐マップのノードに 1 枚絵を貼る」配線の検出器
 * ═══════════════════════════════════════════════════════════════════════════════
 * P7 の主張は 5 つ:
 *   ① ROOM_PAINTINGS_DEF に **キー "n4" / "n7"** が 6 テーマぶん (計 12 枚) あり、
 *      tileBounds がノードの部屋 rect (7x6 = [11,33,16,39] / 9x6 = [11,32,16,40]) と**同一**。
 *   ② 縦横比の判定 (paintingAspectFits) が「在庫一覧のどれかに当たるか」ではなく
 *      **指定したその絵**と比べる。⚠⚠ ここが P7 で新しく開いた穴で、在庫のアスペクトが
 *      2 種 → 4 種へ増えた瞬間、旧判定では **「9x6 の部屋に 7:6 の絵」が無警告で通る**
 *      (部屋の比が一覧のどれかに当たれば緑になるだけで、貼る絵を一度も見ていなかった)。
 *   ③ 従来経路 (単一マップ = ?graph=0 / 生成クエスト) は node:true の絵を**貼らない**。
 *      n4 の tileBounds [11,33,16,39] は旧山場 [5,24,20,43] の**内側**なので、ここが漏れると
 *      「分岐を切ったら山場に 7x6 の絵が重なる」という気づきにくい退化になる。
 *   ④ 分岐版では n4 / n7 でだけ絵が 1 枚積まれ、その矩形が部屋 rect と一致する。
 *      絵の PNG がまだ無い間は **isPaintedAndLoaded が false = タイル描画のまま**
 *      (paintedTileMask だけ立って黒い穴になる、が起きない)。
 *   ⑤ 旧在庫 12 枚 (キー 1 / 2) は今も HTTP 200 で引ける (絵を消した退化の検出)。
 *
 * ── 負のコントロール (同一 run に内包。配信をメモリ上で差し替える) ──────────────
 *   port      | mutate       | 注入する欠陥                             | 赤くなるべき節
 *   PORT      | (素)         | —                                        | —
 *   PORT+1    | nonodeskip   | 従来経路の node:true スキップを外す        | §3 (単一マップに 4 枚貼られる)
 *   PORT+2    | oldaspect    | 縦横比の判定を旧式 (在庫一覧) へ戻す       | §2 (9x6 に 7:6 が無警告)
 *   PORT+3    | n0aspect     | n0 の tileBounds を 33x22 → 31x22 へずらす | §5 (5c: 実画素と宣言が不一致)
 *
 * ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので \n を含むと原理的に一致しない)。
 * ⚠ 置換前後で**バイト長を必ずずらす** (同じ長さだと (0e) が誤報する)。
 *
 * 使い方:
 *   node tools/driver_graph_p7.js
 *   node tools/driver_graph_p7.js --mutate oldaspect --headful
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

/* ⚠⚠ path.resolve 必須。'/' 区切りのままだと下の startsWith が必ず false になり
 *   全部 404 (症状はタイムアウトだけで原因が見えない)。 */
const ROOT = path.resolve(__dirname, '..');
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}
const HEADFUL = process.argv.includes('--headful');
/* ⚠ ポートは既存ドライバと 4 以上空ける。本ドライバは PORT..PORT+3 の **4 本**を掴む
 *   (★P3 で n0aspect を足したので 1 本増えた。既存の最大は driver_graph_p6 の 8992..8996)。 */
const PORT = parseInt(arg('port', '9000'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 測る対象 (ドライバ側が持つ「契約」。実装から読み取ると実装の誤りを一緒に信じてしまう)
// ══════════════════════════════════════════════════════════════════════════════
const THEMES = ['goblin-mine', 'bandits-forest', 'lizard-swamp',
                'orc-fort', 'undead-temple', 'dragon-lair'];
// ノード部屋の矩形 (index.html の MID / BOSSR / P6_MID / P6_BOSSR と同じ値を書くのが契約)
const MID_RECT  = [11, 33, 16, 39];      // 道中 7 列 x 6 行
const BOSS_RECT = [11, 32, 16, 40];      // ボス   9 列 x 6 行
// 旧単一マップの在庫 (キー 1 / 2) が覆う矩形。§3 が使う
const OLD_BOUNDS = { '1': [5, 24, 20, 43], '2': [5, 47, 22, 68] };
// §4 の巡回に使うシナリオ。⚠ 廃坑は n1 が event でダイアログ待ちに入るので使わない
const TOUR_SCEN = 'orc-fort';

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js'];
const MUTATIONS = {
  nonodeskip: [
    '          if (def.node) continue;          // ← 分岐ノード専用の絵 (mapDef 経路でだけ貼る)',
    '          if (0) continue;   /* ★変異nonodeskip */'],
  oldaspect: [
    '    var b = painting ? paintingBoundsFor(painting.theme, painting.key) : null;',
    '    var b = null;   /* ★変異oldaspect */'],
  /* ★[卓上グリッド P3] (5c) は「絵の実画素 ÷ その絵の tileBounds」を測るように書き直したので、
   *   **それが赤くなれること**をここで示す。n0 の宣言を 33x22 → 31x22 へずらすと、
   *   2112x1408 (3:2) と 31:22 が食い違うので (5c) が噛む。
   *   ⚠ 旧版はドライバ側に「ファイル名 → タイル数」の表を持っており、表に無いファイルを
   *     無条件 bad にしていた = **在庫が増えるたびに嘘の赤を出す**状態だった。 */
  n0aspect: [
    '        n0: { src: "assets/room_goblin-mine_n0.jpg", tileBounds: [3, 20, 24, 52], node: true,',
    '        n0: { src: "assets/room_goblin-mine_n0.jpg", tileBounds: [3, 20, 24, 50], node: true,  /* ★変異n0aspect */'],
};
const MUT_ORDER = ['nonodeskip', 'oldaspect', 'n0aspect'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const [from, to] = MUTATIONS[key];
  if (from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (from.length === to.length) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → (0e) が誤報する');
    process.exit(3);
  }
  const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
  const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
  if (hits.length !== 1 || n !== 1) {
    console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
      (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
      ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
    process.exit(3);
  }
  out[hits[0]] = out[hits[0]].split(from).join(to);
  _mutCache[key] = { files: out, target: hits[0] };
  return _mutCache[key];
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
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          /* ⚠ 変異対象は index.html だけではない (js/df-mapdef.js もある) ので、
           *   MIME は拡張子から引く。text/html 固定で返すと JS が実行されず全損する。 */
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey).files[rel]); return;
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
function httpStatus(port, p) {
  return new Promise((res) => {
    http.get({ host: 'localhost', port: port, path: p }, r => { r.resume(); res(r.statusCode); })
      .on('error', () => res(0));
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

async function bootPage(browser, url, scen, errs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* 積まれた 1 枚絵のスナップショット。★「何枚積まれたか」と「どの矩形を覆うか」を分けて採る。
 * ⚠ rect は [r1,c1,r2,c2] (行が先) へ組み直す = tileBounds / 部屋 rect と同じ並びにする。 */
const PAINT_SNAP = `roomPaintings.map(p => ({
  src: (p.img && p.img.getAttribute('src')) || '',
  rect: [p.ty, p.tx, p.ty + p.th - 1, p.tx + p.tw - 1],
  loaded: !!p.loaded,
}))`;

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素 http://localhost:' + PORT +
              '   変異 ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const profile = require('./_pptr_profile')('df_graph_p7_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  const PURE = 'http://localhost:' + PORT;
  const errsAll = [];

  // ── §0 変異が本当に配信へ載っているか (空振り検出) ──────────────────────────
  mark('§0 変異の配信検算');
  {
    const get = (port, p) => new Promise((res, rej) => {
      /* ⚠ Buffer で受けてから 1 度だけ decode する。チャンク境界で日本語 (3 バイト) が
       *   割れると文字数が変わり (0e) が誤報する。 */
      http.get({ host: 'localhost', port: port, path: p }, r => {
        const bufs = []; r.on('data', d => bufs.push(d));
        r.on('end', () => res(Buffer.concat(bufs)));
      }).on('error', rej);
    });
    for (const k of MUT_ORDER) {
      const rel = '/' + mutatedSources(k).target.replace(/\\/g, '/');
      const a = await get(PORT, rel), aS = a.toString('utf8');
      const b = await get(PORT_OF[k], rel), bS = b.toString('utf8');
      const [from, to] = MUTATIONS[k];
      check('(0a-' + k + ') 素の配信に変異前の文字列が 1 箇所',
        aS.split(from).length - 1 === 1, rel + ' 件数=' + (aS.split(from).length - 1));
      check('(0b-' + k + ') 素の配信に変異後の文字列が 0 箇所', aS.indexOf(to) < 0, '');
      check('(0c-' + k + ') 変異の配信に変異前の文字列が 0 箇所', bS.indexOf(from) < 0, '');
      check('(0d-' + k + ') 変異の配信に変異後の文字列が 1 箇所',
        bS.split(to).length - 1 === 1, '件数=' + (bS.split(to).length - 1));
      check('(0e-' + k + ') 2 つの配信のバイト長が違う (同じ物を 2 回測っていない)',
        a.length !== b.length, '素=' + a.length + 'B / 変異=' + b.length + 'B');
    }
  }

  const base = MUTATE ? 'http://localhost:' + PORT_OF[MUTATE] : PURE;
  const basePort = MUTATE ? PORT_OF[MUTATE] : PORT;
  if (MUTATE) console.log('[drv] ★本体は変異 ' + MUTATE + ' の配信で測ります');

  // ── §1 カタログ (12 エントリ) ─────────────────────────────────────────────
  mark('§1 ノード用 1 枚絵カタログ');
  const errs1 = [];
  /* ★[2026-08-20 測定点の修正] 旧実装は 'goblin-mine' を台にしていたが、P8 で廃坑が
   *   n0 → n1 の **2 大部屋**へ畳まり n4 / n7 が消えたので、§2 が undefined を踏んで落ちる。
   * ⭐⭐ §2 が測っているのは **lintRun / paintingAspectFits の判定**であって廃坑ではない。
   *   台にすべきなのは「7x6 の道中 + 9x6 のボス」を持つ分岐グラフ = §4 と同じ TOUR_SCEN。
   *   §1 は ROOM_PAINTINGS_DEF を 6 テーマ分読むだけなのでシナリオに依存しない。
   * ⚠ 台が成り立っていることは (2z) が測る (装置 assert)。 */
  const page1 = await bootPage(browser, base + '/index.html?diag=1&intel=0', TOUR_SCEN, errs1);
  const CAT = await page1.evaluate((themes) => {
    const out = { themes: {}, catalogSet: !!DFMapDef.getPaintingCatalog() };
    for (const t of themes) {
      const per = ROOM_PAINTINGS_DEF[t] || {};
      out.themes[t] = { keys: Object.keys(per).join(',') };
      for (const k of ['n4', 'n7']) {
        const e = per[k];
        out.themes[t][k] = e ? { src: e.src, tileBounds: e.tileBounds, node: !!e.node } : null;
      }
    }
    return out;
  }, THEMES);
  check('(1a) ★カタログがページ全体で登録済み (経路によらず lint が絵を引ける)',
    CAT.catalogSet === true, String(CAT.catalogSet));
  for (const t of THEMES) {
    const e4 = CAT.themes[t].n4, e7 = CAT.themes[t].n7;
    check('(1b-' + t + ') n4 / n7 の 2 エントリがある', !!e4 && !!e7, 'keys=' + CAT.themes[t].keys);
    check('(1c-' + t + ') tileBounds が部屋 rect と同一 (7x6 / 9x6)',
      !!e4 && !!e7 &&
      JSON.stringify(e4.tileBounds) === JSON.stringify(MID_RECT) &&
      JSON.stringify(e7.tileBounds) === JSON.stringify(BOSS_RECT),
      (e4 ? JSON.stringify(e4.tileBounds) : 'なし') + ' / ' + (e7 ? JSON.stringify(e7.tileBounds) : 'なし'));
    check('(1d-' + t + ') node:true が立っている (従来経路で貼られない印)',
      !!e4 && !!e7 && e4.node === true && e7.node === true, '');
    check('(1e-' + t + ') src がテーマ名を含む (別テーマの絵を指していない)',
      !!e4 && !!e7 && e4.src.indexOf(t + '_n4') >= 0 && e7.src.indexOf(t + '_n7') >= 0,
      (e4 ? e4.src : '') + ' / ' + (e7 ? e7.src : ''));
  }

  // ── §2 縦横比の判定が「指定したその絵」を見る ──────────────────────────────
  mark('§2 縦横比の判定 (graph-painting-aspect)');
  const ASP = await page1.evaluate(() => {
    const gr = window.__graphRun.graph();
    const clone = () => JSON.parse(JSON.stringify(gr));
    const at = (g, id) => g.nodes.filter(n => n.id === id)[0];
    const run = (g) => { const L = DFMapDef.lintRun(g);
      return { w: L.warnings.map(x => x.code), e: L.errors.map(x => x.code), ok: L.ok }; };
    const out = {};
    /* ★装置: 台のグラフが n1 (道中 7x6) / n4 (山場) / n7 (ボス 9x6) を持っているか。
     * ⚠ 持っていない日に undefined を踏んで**ドライバごと落ちる**のを防ぐ
     *   (2026-08-20 に実際に踏んだ: FATAL "Cannot read properties of undefined")。 */
    out.ids = gr.nodes.map(n => n.id);
    if (['n1', 'n4', 'n7'].some(id => !at(gr, id))) return out;
    out.pristine = run(clone());
    { const g = clone(); at(g, 'n1').mapDef.rooms[0].painting = { theme: 'goblin-mine', key: '1' };
      out.oldOnMid = run(g); }                       // 7x6 の部屋に旧在庫 20x16 (5:4)
    { const g = clone(); at(g, 'n7').mapDef.rooms[0].painting = { theme: 'goblin-mine', key: 'n4' };
      out.midOnBoss = run(g); }                      // ★9x6 の部屋に 7:6 の絵 (P7 で開いた穴)
    { const g = clone(); at(g, 'n4').mapDef.rooms[0].painting = { theme: 'goblin-mine', key: 'n7' };
      out.bossOnMid = run(g); }                      // ★7x6 の部屋に 3:2 の絵 (逆向き)
    { const g = clone(); at(g, 'n4').mapDef.rooms[0].painting = { theme: 'goblin-mine', key: 'zzz' };
      out.missing = run(g); }                        // 在庫に無いキー
    out.fits = {
      midOnMid:   DFMapDef.paintingAspectFits([11, 33, 16, 39], { theme: 'goblin-mine', key: 'n4' }),
      bossOnBoss: DFMapDef.paintingAspectFits([11, 32, 16, 40], { theme: 'goblin-mine', key: 'n7' }),
      midOnBoss:  DFMapDef.paintingAspectFits([11, 32, 16, 40], { theme: 'goblin-mine', key: 'n4' }),
      bossOnMid:  DFMapDef.paintingAspectFits([11, 33, 16, 39], { theme: 'goblin-mine', key: 'n7' }),
    };
    return out;
  });
  /* ⚠ 上の母集団ガードで早期離脱したとき、以下の detail 文字列は **先に評価される**ので
   *   undefined を触ってドライバごと落ちる。空の値を埋めて「赤くなるが落ちない」にする。 */
  for (const k of ['pristine', 'oldOnMid', 'midOnBoss', 'bossOnMid', 'missing'])
    if (!ASP[k]) ASP[k] = { w: ['(台が組めていない)'], e: ['(台が組めていない)'], ok: false };
  if (!ASP.fits) ASP.fits = {};
  const hasAsp = (r) => !!r && r.w.indexOf('graph-painting-aspect') >= 0;
  check('(2z) ★装置: 台の分岐グラフ (' + TOUR_SCEN + ') が n1 / n4 / n7 を持っている',
    !!ASP.pristine && ['n1', 'n4', 'n7'].every(id => (ASP.ids || []).indexOf(id) >= 0),
    'ids=' + (ASP.ids || []).join(','));
  check('(2a) ★素のグラフは警告 0 (n4 / n7 の絵が伸縮なしで載る)',
    !hasAsp(ASP.pristine) && ASP.pristine.w.length === 0 && ASP.pristine.e.length === 0,
    'w=' + ASP.pristine.w.join(',') + ' e=' + ASP.pristine.e.join(','));
  check('(2b) 7x6 の部屋に旧在庫 (20x16) → 警告',
    hasAsp(ASP.oldOnMid) && ASP.oldOnMid.ok === true, 'w=' + ASP.oldOnMid.w.join(','));
  check('(2c) ★9x6 の部屋に 7:6 の絵 → 警告 (旧判定では無警告で通っていた穴)',
    hasAsp(ASP.midOnBoss) && ASP.midOnBoss.ok === true, 'w=' + ASP.midOnBoss.w.join(','));
  check('(2d) ★7x6 の部屋に 3:2 の絵 → 警告 (逆向きも塞がっている)',
    hasAsp(ASP.bossOnMid) && ASP.bossOnMid.ok === true, 'w=' + ASP.bossOnMid.w.join(','));
  check('(2e) 判定式そのものも同じ答えを返す (lint 越しと直呼びで食い違わない)',
    ASP.fits.midOnMid === true && ASP.fits.bossOnBoss === true &&
    ASP.fits.midOnBoss === false && ASP.fits.bossOnMid === false, JSON.stringify(ASP.fits));
  check('(2f) 在庫に無いキーは在庫一覧へ落ちる (カタログを引けない時に誤報しない)',
    !hasAsp(ASP.missing), 'w=' + ASP.missing.w.join(','));

  for (const e of errs1) errsAll.push('§1§2: ' + e);
  await page1.close();

  // ── §3 従来経路 (?graph=0) は node:true の絵を貼らない ─────────────────────
  mark('§3 単一マップ (?graph=0) に node:true が漏れない');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?graph=0&diag=1&intel=0',
                                'goblin-mine', errs);
    const P = await page.evaluate('(' + PAINT_SNAP + ')');
    check('(3a) ★積まれた絵はちょうど 2 枚 (旧在庫の山場 + ボスだけ)',
      P.length === 2, '枚数=' + P.length + ' ' + P.map(p => p.src.split('/').pop()).join(' / '));
    check('(3b) その 2 枚の矩形が旧 tileBounds と一致 (ノード用が混ざっていない)',
      P.length === 2 &&
      JSON.stringify(P[0].rect) === JSON.stringify(OLD_BOUNDS['1']) &&
      JSON.stringify(P[1].rect) === JSON.stringify(OLD_BOUNDS['2']),
      P.map(p => JSON.stringify(p.rect)).join(' '));
    check('(3c) src に "_n4" / "_n7" が 1 つも無い',
      P.every(p => p.src.indexOf('_n4') < 0 && p.src.indexOf('_n7') < 0),
      P.map(p => p.src).join(' '));
    for (const e of errs) errsAll.push('§3: ' + e);
    await page.close();
  }

  // ── §4 分岐版では n4 / n7 でだけ絵が積まれる ───────────────────────────────
  mark('§4 分岐版の巡回 (' + TOUR_SCEN + ')');
  {
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?diag=1&intel=0', TOUR_SCEN, errs);
    const T = await page.evaluate(`(async () => {
      const g = window.__graphRun, snap = () => ({
        at: g.nodeId(),
        rect: MAPDEF.rooms[0].rect,
        paint: MAPDEF.rooms[0].painting ? MAPDEF.rooms[0].painting.key : null,
        paintings: ${PAINT_SNAP},
        centerSkipped: isPaintedAndLoaded(36, 13),
      });
      const out = {};
      out.n0 = snap();
      await g.enter('n1', 'right'); out.n1 = snap();
      await g.enter('n4', 'right'); out.n4 = snap();
      await g.enter('n7', 'right'); out.n7 = snap();
      return out;
    })()`);
    check('(4a) ★巡回が n0 → n1 → n4 → n7 に届いた (母集団への到達)',
      T.n0.at === 'n0' && T.n1.at === 'n1' && T.n4.at === 'n4' && T.n7.at === 'n7',
      [T.n0.at, T.n1.at, T.n4.at, T.n7.at].join('→'));
    check('(4b) 絵を積むのは n4 / n7 だけ (n0 / n1 は 0 枚)',
      T.n0.paintings.length === 0 && T.n1.paintings.length === 0 &&
      T.n4.paintings.length === 1 && T.n7.paintings.length === 1,
      [T.n0, T.n1, T.n4, T.n7].map(s => s.at + ':' + s.paintings.length).join(' '));
    check('(4c) n4 の絵が部屋 rect (7x6) をちょうど覆う',
      T.n4.paintings.length === 1 &&
      JSON.stringify(T.n4.paintings[0].rect) === JSON.stringify(MID_RECT) &&
      JSON.stringify(T.n4.rect) === JSON.stringify(MID_RECT),
      JSON.stringify(T.n4.paintings.map(p => p.rect)));
    check('(4d) n7 の絵が部屋 rect (9x6) をちょうど覆う',
      T.n7.paintings.length === 1 &&
      JSON.stringify(T.n7.paintings[0].rect) === JSON.stringify(BOSS_RECT) &&
      JSON.stringify(T.n7.rect) === JSON.stringify(BOSS_RECT),
      JSON.stringify(T.n7.paintings.map(p => p.rect)));
    check('(4e) 参照が自テーマの n4 / n7 を指している',
      T.n4.paint === 'n4' && T.n7.paint === 'n7' &&
      T.n4.paintings.length === 1 && T.n7.paintings.length === 1 &&
      T.n4.paintings[0].src.indexOf(TOUR_SCEN + '_n4') >= 0 &&
      T.n7.paintings[0].src.indexOf(TOUR_SCEN + '_n7') >= 0,
      (T.n4.paintings[0] || {}).src + ' / ' + (T.n7.paintings[0] || {}).src);
    /* ★絵の PNG がまだ無い間の安全性。paintedTileMask は読込前から立つので、描画側が
     *   isPaintedAndLoaded を見ていないと**部屋の中央が黒い穴**になる。
     *   ⚠ 絵を作った後は loaded=true になるので「読込状態と一致する」という形で書く
     *     (「常に false」と書くと、絵を足した日に嘘の赤になる)。 */
    check('(4f) ★描画スキップ判定が読込状態と一致する (絵が無い間は黒い穴を作らない)',
      T.n4.paintings.length === 1 && T.n7.paintings.length === 1 &&
      T.n4.centerSkipped === T.n4.paintings[0].loaded &&
      T.n7.centerSkipped === T.n7.paintings[0].loaded,
      'n4 loaded=' + (T.n4.paintings[0] || {}).loaded + '/skip=' + T.n4.centerSkipped +
      ' n7 loaded=' + (T.n7.paintings[0] || {}).loaded + '/skip=' + T.n7.centerSkipped);
    for (const e of errs) errsAll.push('§4: ' + e);
    await page.close();
  }

  // ── §5 素材ファイルの実在 (旧在庫は必ず 200 / ノード用は枚数を報告) ─────────
  mark('§5 素材ファイルの実在');
  {
    /* src はページから引く (ここへ書き写すと本編の差し替えに追従しない)。 */
    const errs = [];
    const page = await bootPage(browser, base + '/index.html?graph=0&diag=1&intel=0',
                                'goblin-mine', errs);
    /* ★[卓上グリッド P3] src だけでなく **その絵が名乗る tileBounds** も一緒に持ち帰る。
     *   (5c) が「ファイル名 → 何タイル用か」の表をドライバ側に写経していたため、
     *   在庫に新しいキー (n0) が 1 つ増えただけで表から漏れ、**正しい絵を NG と報告した**
     *   (2112x1408 = 3:2 / tileBounds 33x22 = 3:2 で実際は一致していた)。
     *   ⚠ 在庫の一覧と突き合わせる装置は在庫が変わるたびに腐る。**指定したその物と比べる**。 */
    const SRCS = await page.evaluate((themes) => {
      const o = { old: [], node: [] };
      for (const t of themes) {
        const per = ROOM_PAINTINGS_DEF[t] || {};
        for (const k of Object.keys(per)) {
          const e = per[k], b = e.tileBounds || [];
          (e.node ? o.node : o.old).push({
            src: e.src, theme: t, key: k,
            tw: (b[3] - b[1] + 1) || 0, th: (b[2] - b[0] + 1) || 0,
          });
        }
      }
      return o;
    }, THEMES);
    for (const e of errs) errsAll.push('§5: ' + e);
    await page.close();
    const old = [], node = [];
    for (const e of SRCS.old)  old.push(Object.assign({ st: await httpStatus(basePort, '/' + e.src) }, e));
    for (const e of SRCS.node) node.push(Object.assign({ st: await httpStatus(basePort, '/' + e.src) }, e));
    const oldNg = old.filter(x => x.st !== 200);
    check('(5a) ★旧在庫 12 枚がすべて HTTP 200 (絵を消した退化の検出)',
      old.length === 12 && oldNg.length === 0,
      '枚数=' + old.length + ' NG=' + oldNg.map(x => x.src + ':' + x.st).join(' '));
    /* ★[卓上グリッド P3] 旧: `node.length === 12` という総数。テーマが 1 つでも
     *   ノード用の絵を増やすと (goblin-mine に n0 を足した) 総数がずれて赤くなるが、
     *   守りたいのは「**どのテーマからも n4/n7 の配線が消えていない**」ほう。
     *   総数で測ると「あるテーマが n4 を失い、別のテーマが 1 枚増えた」を相殺して見逃す。 */
    const missing = [];
    for (const t of THEMES) for (const k of ['n4', 'n7'])
      if (!node.some(x => x.theme === t && x.key === k)) missing.push(t + '/' + k);
    check('(5b) ★6 テーマすべてに n4 / n7 のノード用参照がある (配線の欠落検出)',
      missing.length === 0 && node.length >= 12,
      '欠落=' + (missing.join(' ') || 'なし') + ' / 総数=' + node.length +
      ' [' + node.map(x => x.theme + '/' + x.key).join(' ') + ']');
    const nodeOk = node.filter(x => x.st === 200);
    console.log('[drv]   ▸ ノード用の絵の実在: ' + nodeOk.length + '/' + node.length + ' 枚' +
      (nodeOk.length < node.length ? '  (未作成のぶんはタイル描画へ落ちる = (4f) が担保)' : ''));

    /* ★実画素の縦横比。⚠⚠ lint (graph-painting-aspect) が見ているのは
     *   「tileBounds と部屋 rect」だけで、**JPEG/PNG そのものの寸法は誰も見ていない**。
     *   比率の違うファイルを置くと 5 引数 drawImage が黙って伸ばすので、絵の側も測る。
     *   ⚠ 母集団は「実在する絵」= 旧在庫 12 枚は常にここに居るので、ノード用が 0 枚でも
     *     この assert は空振りしない (件数を detail に必ず出す)。 */
    const errs2 = [];
    const page2 = await bootPage(browser, base + '/index.html?graph=0&diag=1&intel=0',
                                 'goblin-mine', errs2);
    const DIM = await page2.evaluate(async (srcs) => {
      const out = [];
      for (const s of srcs) {
        const d = await new Promise((res) => {
          const im = new Image();
          im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => res(null);
          im.src = s;
        });
        out.push({ src: s, dim: d });
      }
      return out;
    }, old.concat(node).filter(x => x.st === 200).map(x => x.src));
    for (const e of errs2) errsAll.push('§5: ' + e);
    await page2.close();
    /* ⚠⚠ 旧版はここに `wantOf(src)` = ファイル名 → タイル数 の**写経テーブル**があった。
     *   在庫に n0 が増えた瞬間に表から漏れ、null → 無条件 bad で**正しい絵を赤にした**。
     *   いまは各エントリが自分で名乗る tileBounds と比べる (表を持たない = 腐らない)。 */
    const byName = new Map(old.concat(node).map(x => [x.src, x]));
    const bad = DIM.filter(x => {
      const e = byName.get(x.src);
      if (!e || !e.tw || !e.th || !x.dim) return true;
      return x.dim.w * e.th !== x.dim.h * e.tw;
    });
    check('(5c) ★実在する絵の**実画素**が tileBounds と同じ縦横比 (drawImage が伸ばさない)',
      DIM.length > 0 && bad.length === 0,
      '母集団=' + DIM.length + ' 枚 NG=' +
      (bad.map(x => {
        const e = byName.get(x.src) || {};
        return x.src.split('/').pop() + ':' +
          (x.dim ? x.dim.w + 'x' + x.dim.h : '読込失敗') + ' vs ' + e.tw + 'x' + e.th;
      }).join(' ') || 'なし'));
  }

  // ── 例外 ────────────────────────────────────────────────────────────────
  mark('例外・console.error');
  check('(E1) ページ例外 / console.error が 0 件', errsAll.length === 0,
    errsAll.slice(0, 6).join(' | '));

  await browser.close();
  for (const s of servers) s.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n══ 結果: ' + pass + '/' + results.length + ' PASS ══');
  if (pass !== results.length) {
    console.log('FAILED:');
    for (const r of results) if (!r.ok) console.log('  - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('[drv] FATAL ' + e.stack); process.exit(9); });
