#!/usr/bin/env node
/*
 * probe_paint_overlay.js — 「1 枚絵の上に isTileWall を赤で重ねた全景」を出す目視補助 (2026-08-20)
 * ════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ **assert を持たない**。非退行ドライバ (driver_*.js) とは別扱いで、CI の色には関与しない。
 *   当たり判定のズレは「絵を単体で眺めても」「数値 assert が全部緑でも」見えないことがある
 *   (透過 PNG に白い矩形が焼き込まれていた 2026-08-16 の扉と同じ性質) ので、
 *   **本番の絵の上で**目で確かめるための道具として残す。
 *
 * 何が見えるか:
 *   ・赤い半透明のマス … isTileWall(tx,ty) が真 (= 歩けない)。1 枚絵の外周 1 周が赤くなって
 *     いれば sealRing が効いている。内側の赤は blocked マスクの '#'。
 *   ・黄色の枠       … nodeGateTile が返す出口タイル (= 門番が必ず通す = 赤くならないマス)。
 *   ・水色の点       … 戦車の乱入位置と、その体が覆うタイル (unitBodyTiles)。
 *
 * 使い方:
 *   node tools/probe_paint_overlay.js                 (goblin-mine の n0 と n1 を出す)
 *   node tools/probe_paint_overlay.js --out <dir>
 *   node tools/probe_paint_overlay.js --node n1
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const PORT = parseInt(arg('port', '9098'), 10);
const OUT = arg('out', path.join(os.tmpdir(), 'df_paint_overlay'));
const ONLY = arg('node', null);

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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ページ内で「絵 + 赤いマス」を 1 枚の canvas に描いて dataURL で返す。
 * ⚠ 絵は roomPaintings[i].img (フェザー済みの canvas ではなく元画像) を使う。
 *   フェザーは描画の演出で、当たり判定とは無関係だから。 */
function RENDER() {
  const room = MAPDEF.rooms[0];
  const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
  const w = c2 - c1 + 1, h = r2 - r1 + 1;
  const CELL = 24;
  const cv = document.createElement('canvas');
  cv.width = w * CELL; cv.height = h * CELL;
  const g = cv.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
  const p = roomPaintings.find(q => q.tx === c1 && q.ty === r1);
  if (p && p.img && p.img.naturalWidth) g.drawImage(p.img, 0, 0, cv.width, cv.height);
  // 赤 = 歩けないマス
  for (let y = r1; y <= r2; y++) {
    for (let x = c1; x <= c2; x++) {
      if (!isTileWall(x, y)) continue;
      g.fillStyle = 'rgba(220,30,30,0.42)';
      g.fillRect((x - c1) * CELL, (y - r1) * CELL, CELL, CELL);
    }
  }
  // 格子
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
  for (let x = 0; x <= w; x++) { g.beginPath(); g.moveTo(x * CELL, 0); g.lineTo(x * CELL, cv.height); g.stroke(); }
  for (let y = 0; y <= h; y++) { g.beginPath(); g.moveTo(0, y * CELL); g.lineTo(cv.width, y * CELL); g.stroke(); }
  // 黄 = 出口タイル (門番が必ず通すので赤くならないのが正しい)
  g.strokeStyle = '#ffdd33'; g.lineWidth = 3;
  const gates = [];
  for (const dir of ['up', 'down', 'left', 'right']) {
    try {
      const t = nodeGateTile(MAPDEF, dir);
      if (!t) continue;
      gates.push(dir + '(' + t.tx + ',' + t.ty + ')' + (isTileWall(t.tx, t.ty) ? ' ⛔壁' : ''));
      g.strokeRect((t.tx - c1) * CELL + 1.5, (t.ty - r1) * CELL + 1.5, CELL - 3, CELL - 3);
    } catch (e) {}
  }
  // 水色 = 戦車の乱入位置と体
  let chariot = null;
  try {
    const def = ENEMY_TYPES.goblinChariot;
    const boss = enemies.find(e => e.def && e.def.isBoss);
    if (boss) {
      const bTX = Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE);
      const bTY = Math.floor((boss.y + boss.def.displaySize / 2) / TILE_SIZE);
      const s = findChariotSpawnTile(bTX, bTY);
      if (s) {
        const body = unitBodyTiles(def, s.tx, s.ty);
        g.fillStyle = 'rgba(60,200,255,0.40)';
        for (const t of body) g.fillRect((t.tx - c1) * CELL, (t.ty - r1) * CELL, CELL, CELL);
        g.strokeStyle = '#3cf'; g.lineWidth = 2;
        g.strokeRect((s.tx - c1) * CELL + 2, (s.ty - r1) * CELL + 2, CELL - 4, CELL - 4);
        chariot = { spot: s, bodyN: body.length,
                    walls: body.filter(t => isTileWall(t.tx, t.ty)).length,
                    boss: { tx: bTX, ty: bTY } };
      }
    }
  } catch (e) {}
  const pb = window.__paintBlockProbe();
  return { png: cv.toDataURL('image/png'), rect: room.rect, gates: gates, chariot: chariot,
           node: window.__graphRun ? window.__graphRun.nodeId() : null,
           probe: { ring: pb.ring, skipGate: pb.skipGate, applied: pb.applied, ringOff: pb.ringOff } };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_overlay_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: true,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });
  fs.mkdirSync(OUT, { recursive: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(() => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
            sessionStorage.removeItem('dragonfighters.generatedScenario'); } catch (e) {}
      try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    });
    await page.goto('http://localhost:' + PORT + '/index.html?diag=1&intel=0',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof isTileWall === 'function'", { timeout: 25000 });
    await page.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(1200);                      // 絵の読み込みを待つ (目視用なので待ってよい)
    const closeDialogs = async () => {
      for (let i = 0; i < 12; i++) {
        if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) return;
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
          if (b.length) b[b.length - 1].click();
          const ov = document.getElementById('skillCheckOverlay');
          if (ov && ov.classList.contains('show')) { const r = document.getElementById('scRollBtn'); if (r) r.click(); ov.click(); }
          document.body.click();
        });
        await sleep(320);
      }
    };
    await closeDialogs();

    const shoot = async (label) => {
      const r = await page.evaluate(RENDER);
      const file = path.join(OUT, 'paint_overlay_' + label + '.png');
      fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
      console.log('[probe] ' + file);
      console.log('        rect=' + JSON.stringify(r.rect) + ' node=' + r.node +
                  ' ring=' + r.probe.ring + ' skipGate=' + r.probe.skipGate);
      console.log('        gates=' + r.gates.join(' '));
      console.log('        chariot=' + JSON.stringify(r.chariot));
    };
    if (!ONLY || ONLY === 'n0') await shoot('n0');
    if (!ONLY || ONLY === 'n1') {
      await page.evaluate(() => { window.__ov = window.__graphRun.enter('n1', 'right'); });
      for (let i = 0; i < 160; i++) {
        if (await page.evaluate(() => window.__graphRun.nodeId() === 'n1')) break;
        await sleep(120);
      }
      await closeDialogs();
      await sleep(1200);
      await shoot('n1');
    }
  } catch (e) {
    console.error('[probe] ' + e.message + '\n' + (e.stack || ''));
  }
  await browser.close();
  srv.close();
})();
