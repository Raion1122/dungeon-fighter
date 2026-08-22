/*
 * probe_bandit_map.js — 実装依頼書 #11「盗賊団のアジト」着手前調査プローブ
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ これは**調査の道具**であって検出器ではない (受入条件は tools/driver_grid_s2.js)。
 *   既存ドライバに調査用の枝を足さないための別ファイル (依頼書「道具」節)。
 *
 * モード:
 *   --mapdefs   6 シナリオの mapDef を JSON.stringify して **baseline と突き合わせる**
 *               (STEP3「配線だけ」の段が挙動不変であることの証明)
 *               baseline は既定で `git show HEAD:index.html`。--baseline <file> で差替可
 *   --places    候補タイルの表 (本番の isTileWall / 本番の aStar での歩数)
 *               ⚠ 到達可能性は自前 BFS で書かない。本番の aStar を呼ぶ (4 方向)
 *   --ai        入場直後 (t=0) に heroAI が誰を狙うか / 索敵の距離と LOS
 *
 * 共通オプション: --scen <id> (既定 bandits-forest) / --node <id> (既定 n7) / --port / --headful
 *                 --qs <クエリ> (例 banditmap=0) / --entry <tx,ty> / --tiles "tx,ty;tx,ty"
 * exit 0=完走 / 2=環境不足 / 3=使い方の誤り
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

/* ⚠⚠ path.resolve 必須。'/' 区切りのままだと startsWith が必ず false で全部 404 になる。 */
const ROOT = path.resolve(__dirname, '..');
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}
const HEADFUL = process.argv.includes('--headful');
const PORT = parseInt(arg('port', '9310'), 10);
const SCEN = arg('scen', 'bandits-forest');
const NODE = arg('node', 'n7');

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

/* override = { '<rel>': '<内容>' } を配ると、その 1 ファイルだけ差し替わる。
 * ⭐ 別版 index.html を worktree 展開なしで配れる = 決定論プローブの定石 (P9 の教訓)。 */
function startServer(port, override) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (override && Object.prototype.hasOwnProperty.call(override, rel)) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(override[rel]); return;
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

const SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp',
               'orc-fort', 'undead-temple', 'dragon-lair'];

async function dumpRuns(page) {
  return page.evaluate((scens) => {
    const out = {};
    for (const s of scens) {
      let run = null;
      try { run = buildScenarioRun(s); } catch (e) { out[s] = 'THREW ' + e.message; continue; }
      if (!run) { out[s] = null; continue; }
      out[s] = {};
      for (const nd of run.nodes) out[s][nd.id] = JSON.stringify(nd.mapDef);
    }
    return out;
  }, SCENS);
}

async function runMapdefs(puppeteer, browserPath, profile) {
  const baseFile = arg('baseline', null);
  const baseSrc = baseFile
    ? fs.readFileSync(baseFile, 'utf8')
    : execFileSync('git', ['show', 'HEAD:index.html'],
                   { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const srvA = await startServer(PORT, null);
  const srvB = await startServer(PORT + 1, { 'index.html': baseSrc });
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });
  const pA = await bootPage(browser, 'http://localhost:' + PORT, SCEN);
  const pB = await bootPage(browser, 'http://localhost:' + (PORT + 1), SCEN);
  const A = await dumpRuns(pA), B = await dumpRuns(pB);
  console.log('[probe] 作業ツリー vs baseline (' + (baseFile || 'git show HEAD:index.html') + ')');
  let same = 0, diff = 0;
  for (const s of SCENS) {
    if (A[s] === null && B[s] === null) { console.log('  ' + s.padEnd(16) + ' 両方 null (グラフ無し)'); continue; }
    if (!A[s] || !B[s] || typeof A[s] === 'string' || typeof B[s] === 'string') {
      console.log('  ' + s.padEnd(16) + ' ⛔ 片方だけ null / THREW: ' +
                  JSON.stringify([A[s], B[s]]).slice(0, 160));
      diff++; continue;
    }
    const ids = Array.from(new Set(Object.keys(A[s]).concat(Object.keys(B[s]))));
    const bad = ids.filter(id => A[s][id] !== B[s][id]);
    same += ids.length - bad.length; diff += bad.length;
    console.log('  ' + s.padEnd(16) + (bad.length === 0
      ? '完全一致 (' + ids.length + ' ノード)'
      : '⚠ ' + bad.length + '/' + ids.length + ' ノードが不一致: ' + bad.join(',')));
    for (const id of bad) {
      const a = A[s][id] || '(無い)', b = B[s][id] || '(無い)';
      let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
      console.log('      ' + id + ' 先頭差分 @' + i);
      console.log('        cur : …' + a.slice(Math.max(0, i - 40), i + 110));
      console.log('        base: …' + b.slice(Math.max(0, i - 40), i + 110));
    }
  }
  console.log('[probe] 一致 ' + same + ' ノード / 不一致 ' + diff + ' ノード');
  const errs = pA.__errs.concat(pB.__errs);
  if (errs.length) console.log('[probe] ⚠ page errors: ' + JSON.stringify(errs));
  await browser.close(); srvA.close(); srvB.close();
}

async function runInGame(puppeteer, browserPath, profile, mode) {
  const srv = await startServer(PORT, null);
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });
  const qs = arg('qs', '');
  const page = await bootPage(browser, 'http://localhost:' + PORT + (qs ? '?' + qs : ''), SCEN);

  /* ★★実プレイの入口関数を通す。⚠⚠ `buildNode(nd.mapDef)` を直に呼ぶのは**間違い**
   *   (2026-08-22 に実際に踏んだ)。あれは MAPDEF.isCustom が付かないので loadRoomPaintings が
   *   旧在庫 (キー "1" / "2" のベルトスクロール絵) を貼ったままになり、**別の絵のマスクが
   *   効いた盤面**を測ってしまう (n7big のマスクは一度も適用されない)。
   *   実プレイと同じ順序 = resetNodeState → buildNode(resolveNodeMapDef(id), id)
   *                        → restoreNodeState → placeNodeParty → applyNodeZoom。 */
  const built = await page.evaluate((scen, nodeId, via) => {
    if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) {
      return { err: 'RUN に ' + nodeId + ' が無い (シナリオ ' + scen + ' のグラフが立っていない)' };
    }
    resetNodeState();
    currentNodeId = nodeId;
    buildNode(resolveNodeMapDef(nodeId), nodeId);
    try { restoreNodeState(nodeId); } catch (e) {}
    try { placeNodeParty(via); } catch (e) {}
    try { applyNodeZoom(); } catch (e) {}
    try { snapCamera(); } catch (e) {}
    const md = RUN.byId[nodeId].mapDef;
    const r = (md.rooms || [])[0] || {};
    return { rect: r.rect, start: md.start, name: md.name,
             paint: r.painting ? r.painting.key : null,
             density: r.scenery ? r.scenery.density : null,
             slots: r.enemySlots || [], boss: r.bossSlot || null,
             isCustom: !!(typeof MAPDEF !== 'undefined' && MAPDEF && MAPDEF.isCustom),
             paintings: (typeof roomPaintings !== 'undefined' ? roomPaintings : [])
               .map(p => ({ src: (p.img && p.img.getAttribute('src')) || '',
                            tx: p.tx, ty: p.ty, tw: p.tw, th: p.th, seal: !!p.sealRing })) };
  }, SCEN, NODE, arg('via', 'right'));
  if (built.err) { console.error('[probe] ' + built.err); await browser.close(); srv.close(); process.exit(3); }
  console.log('[probe] ' + SCEN + '/' + NODE + '  name=' + built.name +
              '  rect=' + JSON.stringify(built.rect) + '  start=' + JSON.stringify(built.start) +
              '  paint=' + built.paint + '  density=' + built.density +
              '  isCustom=' + built.isCustom);
  console.log('[probe]   slots=' + JSON.stringify(built.slots) + '  boss=' + JSON.stringify(built.boss));
  /* ⚠ 「どの絵が実際に貼られたか」を必ず出す。ここを見ずに壁だけ数えると、
   *   別の絵のマスクを測っていても気づけない。 */
  for (const p of (built.paintings || [])) {
    console.log('[probe]   貼られた絵: ' + p.src + '  tile(' + p.tx + ',' + p.ty + ') ' +
                p.tw + 'x' + p.th + (p.seal ? '  sealRing' : ''));
  }

  if (mode === 'places') {
    const spec = arg('tiles', null);
    /* 既定の候補 = 依頼書が座標を書いている場所すべて。⚠ 書く前に 1 回測るのが目的。 */
    const tiles = spec
      ? spec.split(';').map(s => s.split(',').map(Number))
      : [[10, 15], [12, 15], [19, 15], [29, 15], [30, 15], [31, 15], [30, 16], [31, 16], [32, 15],
         [44, 15], [47, 15], [48, 15], [49, 15], [48, 16], [50, 15], [52, 14], [53, 14],
         [54, 14], [55, 13], [56, 13], [57, 12], [58, 12], [57, 13], [55, 15], [56, 16]];
    const ENTRY = (arg('entry', '12,15')).split(',').map(Number);
    const rows = await page.evaluate((tiles, rect, entry) => {
      const out = [];
      for (const t of tiles) {
        const tx = t[0], ty = t[1];
        let wall = null; try { wall = isTileWall(tx, ty); } catch (e) { wall = 'THREW'; }
        const inRect = rect ? (ty >= rect[0] && ty <= rect[2] && tx >= rect[1] && tx <= rect[3]) : null;
        let steps = null;
        try { const p = aStar(entry[0], entry[1], tx, ty); steps = Array.isArray(p) ? p.length : null; }
        catch (e) { steps = 'THREW'; }
        out.push({ tx, ty, wall, inRect, steps });
      }
      return out;
    }, tiles, built.rect, ENTRY);
    console.log('   tx  ty  isTileWall  rect内   入場(' + ENTRY.join(',') + ')からの aStar 歩数');
    for (const r of rows) {
      console.log('  ' + String(r.tx).padStart(3) + String(r.ty).padStart(4) +
                  '   ' + String(r.wall).padEnd(10) + '  ' + String(r.inRect).padEnd(6) +
                  ' ' + (r.steps === null ? '到達不能' : r.steps));
    }
  }

  if (mode === 'grid') {
    /* 実マップ (isTileWall) と 絵のマスクを並べて出す。⚠ 実装の戻り値どうしを突き合わせない。
     *   マスクは ROOM_PAINTINGS_DEF の生エントリから読む = 元データ側。 */
    const g = await page.evaluate((theme, key, rect) => {
      const def = (ROOM_PAINTINGS_DEF[theme] || {})[key] || {};
      const rows = [];
      for (let r = rect[0]; r <= rect[2]; r++) {
        let line = '';
        for (let c = rect[1]; c <= rect[3]; c++) line += isTileWall(c, r) ? '#' : '.';
        rows.push(line);
      }
      return { actual: rows, mask: def.blocked || [], seal: !!def.sealRing };
    }, SCEN, built.paint, built.rect);
    console.log('  実マップ (isTileWall) と 絵のマスク。左=絵ローカル row / 右=global row');
    console.log('        ' + Array.from({ length: built.rect[3] - built.rect[1] + 1 },
                                        (_, i) => String(i % 10)).join(''));
    let holes = 0, extra = 0;
    for (let r = 0; r < g.actual.length; r++) {
      const a = g.actual[r], m = g.mask[r] || '';
      let mark = '';
      for (let c = 0; c < a.length; c++) {
        const onRing = (r === 0 || r === g.actual.length - 1 || c === 0 || c === a.length - 1);
        const want = (m[c] === '#') || (g.seal && onRing);
        if (want && a[c] === '.') { mark += 'o'; holes++; }        // 塞ぐはずが歩ける = 穴
        else if (!want && a[c] === '#') { mark += 'x'; extra++; }  // 塞がないはずが壁
        else mark += ' ';
      }
      console.log('  ' + String(r).padStart(2) + ' ' + String(r + built.rect[0]).padStart(3) +
                  ' ' + a + (mark.trim() ? '   差分:' + mark : ''));
    }
    console.log('  穴 (塞ぐはずが歩ける) = ' + holes + ' / 余分 (塞がないはずが壁) = ' + extra);
  }

  if (mode === 'ai') {
    const info = await page.evaluate(() => {
      const out = { detectionRange: (typeof DETECTION_RANGE !== 'undefined' ? DETECTION_RANGE : null),
                    tile: (typeof TILE_SIZE !== 'undefined' ? TILE_SIZE : null), enemies: [] };
      try {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          out.enemies.push({ i, type: e.type, tx: Math.round(e.x / TILE_SIZE),
                             ty: Math.round(e.y / TILE_SIZE), alive: e.hp > 0, boss: !!e.isBoss });
        }
      } catch (err) { out.err = String(err); }
      /* ⚠ `player` は DOM 要素。パーティの座標は playerX / playerY (裸の識別子)。
       *   ここを間違えると findNearestAliveEnemy が undefined 起点で答えを返す = 偽の観測。 */
      try {
        out.player = { x: Math.round(playerX), y: Math.round(playerY),
                       tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 48) / TILE_SIZE) };
      } catch (err) { out.playerErr = String(err); }
      try {
        const t = findNearestAliveEnemy();   // ★引数なし。中で playerX/playerY を読む
        out.nearest = t ? { type: t.type,
                            tx: Math.floor((t.x + t.def.displaySize / 2) / TILE_SIZE),
                            ty: Math.floor((t.y + t.def.displaySize / 2) / TILE_SIZE),
                            tiles: +(Math.hypot(playerX + 48 - (t.x + t.def.displaySize / 2),
                                                playerY + 48 - (t.y + t.def.displaySize / 2)) / TILE_SIZE).toFixed(2) } : null;
      } catch (err) { out.nearestErr = String(err); }
      return out;
    });
    console.log('  DETECTION_RANGE = ' + info.detectionRange + 'px (' +
                (info.detectionRange / (info.tile || 96)).toFixed(2) + ' タイル) / TILE_SIZE=' + info.tile);
    console.log('  player  = ' + JSON.stringify(info.player));
    console.log('  ★入場直後の heroAI 最寄り目標 = ' + JSON.stringify(info.nearest) +
                (info.nearestErr ? '  ⚠ ' + info.nearestErr : ''));
    console.log('  敵 ' + info.enemies.length + ' 体:');
    for (const e of info.enemies) {
      console.log('    #' + e.i + ' ' + String(e.type).padEnd(14) + ' tile(' + e.tx + ',' + e.ty + ')' +
                  (e.boss ? '  ★BOSS' : ''));
    }
    /* ⚠ 融合の判定は 距離 **AND** hasLineOfSight。距離だけで語らない (#10 の教訓)。 */
    const pairs = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
          const a = enemies[i], b = enemies[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          let los = null; try { los = hasLineOfSight(a.x, a.y, b.x, b.y); } catch (e) { los = 'THREW'; }
          out.push({ i, j, ai: a.type, bj: b.type, tiles: +(d / TILE_SIZE).toFixed(2), los });
        }
      }
      return out;
    });
    console.log('  敵どうしの距離と LOS (融合の判定材料。⚠ 距離 AND LOS):');
    for (const p of pairs) {
      console.log('    #' + p.i + ' ' + String(p.ai).padEnd(13) + ' ↔ #' + p.j + ' ' +
                  String(p.bj).padEnd(13) + ' ' + String(p.tiles).padStart(6) + ' タイル  LOS=' + p.los);
    }
  }

  if (page.__errs.length) console.log('[probe] ⚠ page errors: ' + JSON.stringify(page.__errs));
  await browser.close(); srv.close();
}

(async () => {
  const mode = process.argv.includes('--mapdefs') ? 'mapdefs'
             : process.argv.includes('--places') ? 'places'
             : process.argv.includes('--grid') ? 'grid'
             : process.argv.includes('--ai') ? 'ai' : null;
  if (!mode) { console.error('[probe] --mapdefs / --places / --grid / --ai のどれかを指定'); process.exit(3); }
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_probe_bandit_');
  if (mode === 'mapdefs') await runMapdefs(puppeteer, browserPath, profile);
  else await runInGame(puppeteer, browserPath, profile, mode);
  process.exit(0);
})().catch(e => { console.error('[probe] ' + ((e && e.stack) || e)); process.exit(3); });
