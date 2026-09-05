/*
 * probe_swamp_map.js — 実装依頼書 #53「蛇神の参道」STEP2 の調査プローブ
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ これは**調査の道具**であって検出器ではない (受入条件は tools/verify_swamp_novice.js)。
 *
 * ⭐ なぜ probe_bandit_map.js で足りないか
 *   あちらは --places / --grid / --ai を持ち、--scen lizard-swamp --node n4 でそのまま使える
 *   (本件でも実際に使った)。足りないのは **4 近傍 BFS の連結検査**だけなので、本ファイルは
 *   それだけを足す。⛔ 既存プローブへ枝を足して #11 の道具を #53 の都合で汚さない。
 *
 * モード:
 *   --bfs        本番の isTileWall を rect の範囲で読み、start から 4 近傍 BFS を回す。
 *                歩けるマス / 到達できるマス / 孤立したマスを出す。
 *                ⚠⚠ 斜めを数えない。本番の aStar が斜めを踏まないので、8 近傍で測ると
 *                   「繋がっているつもりで実は繋がっていない」を見逃す。
 *   --cut <col>  同じ BFS を、指定した **global 列を丸ごと塞いだ盤面**でもう一度回す。
 *                参道が唯一の東西の渡りなら 2 つに割れるはず = 「唯一」の裏取り。
 *
 * 共通オプション: --scen (既定 lizard-swamp) / --node (既定 n4) / --port / --headful / --qs
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
const PORT = parseInt(arg('port', '9360'), 10);
const SCEN = arg('scen', 'lizard-swamp');
const NODE = arg('node', 'n4');

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

(async () => {
  if (!process.argv.includes('--bfs')) {
    console.error('[probe] --bfs を指定してください (任意で --cut <global col>)'); process.exit(3);
  }
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_probe_swamp_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });
  const qs = arg('qs', '');
  const page = await bootPage(browser, 'http://localhost:' + PORT + (qs ? '?' + qs : ''), SCEN);
  const cut = parseInt(arg('cut', '-1'), 10);

  /* ★実プレイの入口関数を通す。⚠⚠ buildNode(nd.mapDef) を直に呼ぶのは**間違い**
   *   (probe_bandit_map.js の注記と同じ理由 = MAPDEF.isCustom が付かず旧在庫の絵が貼られる)。 */
  const out = await page.evaluate((nodeId, via, cutCol) => {
    if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) {
      return { err: 'RUN に ' + nodeId + ' が無い' };
    }
    resetNodeState();
    currentNodeId = nodeId;
    buildNode(resolveNodeMapDef(nodeId), nodeId);
    try { restoreNodeState(nodeId); } catch (e) {}
    try { placeNodeParty(via); } catch (e) {}
    const md = RUN.byId[nodeId].mapDef;
    const room = (md.rooms || [])[0] || {};
    const rect = room.rect;
    const start = md.start || {};
    const res = { rect: rect, start: start, name: md.name,
                  paint: room.painting ? room.painting.key : null, cutCol: cutCol };
    /* 盤面を 1 度だけ読み取る。⚠ 判定は本番の isTileWall ただ 1 本 (自前に写さない)。 */
    const H = rect[2] - rect[0] + 1, W = rect[3] - rect[1] + 1;
    const walk = [];
    for (let r = 0; r < H; r++) {
      const row = [];
      for (let c = 0; c < W; c++) {
        const tx = rect[1] + c, ty = rect[0] + r;
        let w = false; try { w = !isTileWall(tx, ty); } catch (e) { w = false; }
        if (cutCol >= 0 && tx === cutCol) w = false;      // 反実仮想: この列を丸ごと塞ぐ
        row.push(w);
      }
      walk.push(row);
    }
    /* 4 近傍で連結成分を数える。⚠⚠ 斜めを数えない (本番の aStar が踏まないため)。 */
    const comp = walk.map(row => row.map(() => -1));
    const sizes = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!walk[r][c] || comp[r][c] >= 0) continue;
      const id = sizes.length; let n = 0;
      const st = [[r, c]]; comp[r][c] = id;
      while (st.length) {
        const cur = st.pop(); const cr = cur[0], cc = cur[1]; n++;
        const nb = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
        for (const t of nb) {
          const nr = t[0], nc = t[1];
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          if (!walk[nr][nc] || comp[nr][nc] >= 0) continue;
          comp[nr][nc] = id; st.push([nr, nc]);
        }
      }
      sizes.push(n);
    }
    res.walkable = sizes.reduce(function (a, b) { return a + b; }, 0);
    res.components = sizes;
    const sr = start.ty - rect[0], sc = start.tx - rect[1];
    res.startComp = (sr >= 0 && sr < H && sc >= 0 && sc < W) ? comp[sr][sc] : null;
    res.reachable = (res.startComp != null && res.startComp >= 0) ? sizes[res.startComp] : 0;
    /* 起点の成分に入っていない歩けるマス = 孤立。global 座標で列挙する。 */
    res.isolated = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (walk[r][c] && comp[r][c] !== res.startComp) res.isolated.push([rect[1] + c, rect[0] + r]);
    }
    /* ★屋外フラグ (ROOM_PAINTINGS_DEF の outdoor) が**実際に効いたか**を、実装が持つ
     *   検証シーム 1 本から取る。⛔ 「outdoor: true と書いたから効いたはず」で済ませない。 */
    try { res.outdoor = (typeof window.__outdoorRevealProbe === 'function')
                        ? window.__outdoorRevealProbe() : null; }
    catch (e) { res.outdoor = 'THREW ' + e.message; }
    /* スロットが「歩ける・起点から到達できる」ことを本番の aStar で見る。 */
    res.slotCheck = [];
    for (const s of (room.enemySlots || [])) {
      let wall = null, steps = null;
      try { wall = isTileWall(s[0], s[1]); } catch (e) { wall = 'THREW'; }
      try { const p = aStar(start.tx, start.ty, s[0], s[1]); steps = Array.isArray(p) ? p.length : null; }
      catch (e) { steps = 'THREW'; }
      res.slotCheck.push({ tx: s[0], ty: s[1], type: s[2], wall: wall, steps: steps });
    }
    return res;
  }, NODE, arg('via', 'right'), cut);

  if (out.err) { console.error('[probe] ' + out.err); await browser.close(); srv.close(); process.exit(3); }
  console.log('[probe] ' + SCEN + '/' + NODE + '  name=' + out.name + '  paint=' + out.paint +
              '  rect=' + JSON.stringify(out.rect) + '  start=' + JSON.stringify(out.start) +
              (cut >= 0 ? '   ★反実仮想: global col ' + cut + ' を塞いだ盤面' : ''));
  console.log('  歩けるマス = ' + out.walkable + ' / 起点から到達 = ' + out.reachable +
              ' / 連結成分 = ' + out.components.length + ' ' + JSON.stringify(out.components));
  console.log('  孤立したマス (' + out.isolated.length + '): ' +
              (out.isolated.length ? JSON.stringify(out.isolated) : 'なし'));
  console.log('  屋外めくり (__outdoorRevealProbe) = ' + JSON.stringify(out.outdoor));
  if (cut >= 0) {
    console.log('  ⚠ 下の slot 行の aStar は**反実仮想を適用しない実盤面**で測っている' +
                ' (aStar は本番の盤面を読むため)。割れたかどうかは上の連結成分で見ること。');
  }
  for (const s of out.slotCheck) {
    console.log('    slot ' + String(s.type).padEnd(14) + ' (' + s.tx + ',' + s.ty + ')  isTileWall=' +
                s.wall + '  起点からの aStar 歩数=' + (s.steps === null ? '到達不能' : s.steps));
  }
  if (page.__errs.length) console.log('[probe] ⚠ page errors: ' + JSON.stringify(page.__errs));
  await browser.close(); srv.close();
  process.exit(0);
})().catch(function (e) { console.error('[probe] ' + ((e && e.stack) || e)); process.exit(3); });
