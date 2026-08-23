/*
 * probe_s2_fold.js — 「シナリオ2 を 1 枚マップ 1 部屋へ畳む」案の着手前調査プローブ
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ これは**調査の道具**であって検出器ではない (受入条件は別途ドライバを作る)。
 *   既存ドライバ (driver_graph_p6 / driver_grid_s2) に調査用の枝を足さないための別ファイル。
 *
 * 測る 2 点:
 *   --kinds  8 ノードを**実プレイと同じ入場手順**で巡り、kind ごとに実際に何が湧くかを数える
 *            (罠 / 玄室宝箱 / 檻 / 敵)。「畳むと何を失うか」を推測でなく実測で出す。
 *            ⚠ buildNode(mapDef) を直に呼ばない — MAPDEF.isCustom が付かず別の絵のマスクを測る
 *              (依頼書 #11 実装結果 §7 で実際に踏んだ罠)。
 *   --lint   1 ノードだけのグラフ (entry == boss) を本番の DFMapDef.lintRun へ通す。
 *            この案の生死を分ける唯一の構造リスク。
 *
 * 共通オプション: --port / --headful / --qs <クエリ> / --browser <exe> / --scen <id>
 * exit 0=完走 / 2=環境不足 / 3=使い方の誤り
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

/* ⚠⚠ path.resolve 必須。'/' 区切りのままだと startsWith が必ず false で全部 404 になる。 */
const ROOT = path.resolve(__dirname, '..');
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}
const HEADFUL = process.argv.includes('--headful');
/* ⚠ 9320〜9327 は driver_grid_s2 が 8 本掴む (素 + 変異 7)。ぶつからない帯を既定にする。 */
const PORT = parseInt(arg('port', '9350'), 10);
const SCEN = arg('scen', 'bandits-forest');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[probe] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[probe] Chrome が見つかりません'); process.exit(2);
}
/* ⚠ MIME は helper 切り出しで落としやすい。落とすと try/catch に飲まれて**全 500** = 白紙。 */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
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

async function bootPage(browser, url, scen) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  page.__errs = errs;
  return page;
}

/* ── --kinds ────────────────────────────────────────────────────────────────
 * ⚠⚠ 入場は**実プレイと同じ順序**で通す。buildNode(mapDef) を直に呼ぶと MAPDEF.isCustom が
 *   付かず、loadRoomPaintings が旧在庫の絵を貼ったままの盤面を測る (#11 §7 の実測)。 */
async function runKinds(page) {
  const rows = await page.evaluate(() => {
    if (typeof RUN === 'undefined' || !RUN || !RUN.graph) return { err: 'RUN が立っていない' };
    const out = [];
    for (const nd of RUN.graph.nodes) {
      resetNodeState();
      currentNodeId = nd.id;
      buildNode(resolveNodeMapDef(nd.id), nd.id);
      try { restoreNodeState(nd.id); } catch (e) {}
      try { spawnNodeEntities(); } catch (e) {}
      try { placeNodeParty('right'); } catch (e) {}
      const md = RUN.byId[nd.id].mapDef;
      const rm = (md.rooms || [])[0] || {};
      const rect = rm.rect || null;
      const tiles = rect ? (rect[2] - rect[0] + 1) * (rect[3] - rect[1] + 1) : null;
      out.push({
        id: nd.id, kind: nd.kind, name: md.name, rect: rect, tiles: tiles,
        paint: rm.painting ? rm.painting.key : null,
        enemies: (typeof enemies !== 'undefined' ? enemies.length : -1),
        traps: (typeof traps !== 'undefined' ? traps.length : -1),
        chests: (typeof roomChests !== 'undefined' ? roomChests.length : -1),
        cages: (typeof cages !== 'undefined' ? cages.length : -1),
        exits: (nd.exits || []).map(e => e.to + '/' + e.dir),
      });
    }
    return { out };
  });
  if (rows.err) { console.error('[probe] ' + rows.err); process.exit(3); }
  console.log('[probe] ' + SCEN + ' の全ノードを実プレイと同じ手順で入場して数えた');
  console.log('  id   kind    部屋        マス  絵       敵  罠 玄室宝箱  檻   出口');
  for (const r of rows.out) {
    console.log('  ' + r.id.padEnd(4) + ' ' + String(r.kind).padEnd(7) +
                ' ' + String(r.name).padEnd(11) +
                String(r.tiles).padStart(5) + '  ' + String(r.paint || '-').padEnd(7) +
                String(r.enemies).padStart(4) + String(r.traps).padStart(4) +
                String(r.chests).padStart(8) + String(r.cages).padStart(5) + '   ' +
                (r.exits.length ? r.exits.join(',') : '(行き止まり)'));
  }
  const tot = rows.out.reduce((a, r) => ({
    traps: a.traps + r.traps, chests: a.chests + r.chests,
    cages: a.cages + r.cages, enemies: a.enemies + r.enemies }),
    { traps: 0, chests: 0, cages: 0, enemies: 0 });
  console.log('  ── 合計: 敵 ' + tot.enemies + ' / 罠 ' + tot.traps +
              ' / 玄室宝箱 ' + tot.chests + ' / 檻 ' + tot.cages);
  console.log('  ⚠ 畳むと、この行のうち**残すノードの kind が拾わないもの**が無言でゼロになる');
}

/* ── --lint ─────────────────────────────────────────────────────────────────
 * 1 ノードだけのグラフ (entry がそのままボス) を本番の lintRun へ通す。 */
async function runLint(page) {
  const res = await page.evaluate(() => {
    if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId.n7) return { err: 'RUN/n7 が無い' };
    const L = window.DFMapDef;
    const md = JSON.parse(JSON.stringify(RUN.byId.n7.mapDef));
    const cases = [];
    const mk = (label, kind, mapDef, exits) => {
      const g = { entry: 'nf', nodes: [{ id: 'nf', kind: kind, mapDef: mapDef, exits: exits || [] }] };
      let r = null;
      try { r = L.lintRun(g); } catch (e) { cases.push({ label: label, err: String(e) }); return; }
      cases.push({ label: label, kind: kind,
                   errors: r.errors.map(x => x.code + ': ' + x.msg),
                   warnings: r.warnings.map(x => x.code + ': ' + x.msg) });
    };
    mk('1 ノード / kind:"boss" (本命)', 'boss', md);
    mk('1 ノード / kind:"search" (罠だけ拾える形)', 'search', md);
    mk('1 ノード / kind:"loot" (玄室宝箱だけ拾える形)', 'loot', md);
    /* 対照: 今の 8 ノードのグラフそのもの (器が正しく動いていることの母集団ガード) */
    let base = null;
    try { const r = L.lintRun(RUN.graph);
          base = { errors: r.errors.map(x => x.code), warnings: r.warnings.map(x => x.code) };
    } catch (e) { base = { err: String(e) }; }
    return { cases: cases, base: base, start: md.start,
             rect: (md.rooms || [])[0] && md.rooms[0].rect };
  });
  if (res.err) { console.error('[probe] ' + res.err); process.exit(3); }
  console.log('[probe] 1 ノードのグラフを本番の DFMapDef.lintRun へ通した');
  console.log('  素材 = 今の n7 の mapDef (rect=' + JSON.stringify(res.rect) +
              ' / start=' + JSON.stringify(res.start) + ')');
  console.log('  ── 対照 (今の 8 ノード): error ' + JSON.stringify(res.base.errors) +
              ' / warning ' + JSON.stringify(res.base.warnings));
  for (const c of res.cases) {
    if (c.err) { console.log('  ⛔ ' + c.label + ' … THREW ' + c.err); continue; }
    const ok = c.errors.length === 0;
    console.log('  ' + (ok ? '⭕' : '⛔') + ' ' + c.label);
    for (const e of c.errors)   console.log('        error   ' + e);
    for (const w of c.warnings) console.log('        warning ' + w);
    if (ok && !c.warnings.length) console.log('        (error 0 / warning 0)');
  }
}

(async () => {
  const mode = process.argv.includes('--kinds') ? 'kinds'
             : process.argv.includes('--lint') ? 'lint' : null;
  if (!mode) { console.error('[probe] --kinds / --lint のどちらかを指定'); process.exit(3); }
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_probe_s2fold_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });
  const qs = arg('qs', '');
  const page = await bootPage(browser, 'http://localhost:' + PORT + (qs ? '?' + qs : ''), SCEN);
  if (mode === 'kinds') await runKinds(page);
  else await runLint(page);
  if (page.__errs.length) console.log('[probe] ⚠ page errors: ' + JSON.stringify(page.__errs));
  await browser.close(); srv.close();
  process.exit(0);
})().catch(e => { console.error('[probe] ' + ((e && e.stack) || e)); process.exit(3); });
