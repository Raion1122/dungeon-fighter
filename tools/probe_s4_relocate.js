#!/usr/bin/env node
/*
 * probe_s4_relocate.js — 調査用プローブ (2026-08-22)
 * 実装依頼書 #10 の「案 2 = s4 を西寄りへ動かす」の**移動先候補を実測で絞る**ための道具。
 * PASS/FAIL は出さない (ドライバではない)。結論が依頼書へ書き込まれたら消してよい。
 *
 * 測るもの (すべて **本番の aStar / isTileWall** をそのまま呼ぶ):
 *   ① 候補タイルが床で、外周 1 タイルを禁止しても入場地点から届くか
 *   ② s3 (43,7) → 候補 の経路が、玉座の護衛の **霧 (dx^2+dy^2 <= 37)** に入るか
 *   ③ 同経路が玉座から **チェビシェフ 8 マスの帯**を何マス通るか
 *   ④ 同経路が護衛にどこまで近づくか (敵の索敵 12.5 タイルとの比較用)
 *   ⑤ 本道 (入場 → 玉座) からどれだけ離れているか
 * ⚠ 自前 BFS を書かないこと。aStar は 4 方向しか踏まないので、8 方向 BFS は
 *   「斜めでしか繋がらない道」を歩けると誤報する (P8 で実測済み)。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const PORT = parseInt(arg('port', '9077'), 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[probe] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const cands = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[probe] Chrome が見つかりません'); process.exit(2);
}
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
async function bootPage(browser, port, query) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => console.log('[probe] PAGEERROR ' + e.message));
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  });
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function' && typeof isTileWall === 'function'",
    { timeout: 25000 });
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await sleep(300);
  return page;
}
async function closeDialogs(page) {
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) return true;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
      if (btns.length) btns[btns.length - 1].click();
      const ov = document.getElementById('skillCheckOverlay');
      if (ov && ov.classList.contains('show')) {
        const rb = document.getElementById('scRollBtn'); if (rb) rb.click();
        ov.click();
      }
      document.body.click();
    });
    await sleep(350);
  }
  return await page.evaluate(() => !skillCheckActive && !dialogPaused);
}
async function kickEnter(page, toId, viaDir) {
  await page.evaluate((to, dir) => {
    window.__p9enter = window.__graphRun.enter(to, dir).then(() => {});
  }, toId, viaDir);
}
async function waitNode(page, id, ms) {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate((n) => window.__graphRun.nodeId() === n, id)) return true;
    if (Date.now() - t0 >= ms) return false;
    await sleep(80);
  }
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_s4reloc_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: true,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  try {
    const page = await bootPage(browser, PORT, '?diag=1&intel=0');
    await closeDialogs(page);
    await kickEnter(page, 'n1', 'right');
    if (!await waitNode(page, 'n1', 15000)) { console.error('[probe] n1 へ入れませんでした'); process.exit(3); }
    await closeDialogs(page);

    const R = await page.evaluate((rowLo, rowHi, colLo, colHi) => {
      const d = window.__graphRun.detour();
      const room = window.__graphRun.graph().nodes.find(n => n.id === 'n1').mapDef.rooms[0];
      const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
      const ring = new Set();
      for (let x = c1; x <= c2; x++) { ring.add(x + ',' + r1); ring.add(x + ',' + r2); }
      for (let y = r1; y <= r2; y++) { ring.add(c1 + ',' + y); ring.add(c2 + ',' + y); }

      const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      const tileOf = (e) => ({ tx: Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE),
                               ty: Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE) });
      const boss = enemies.find(e => e.def && e.def.isBoss && e.alive);
      const bt = tileOf(boss);
      const guards = enemies.filter(e => e.alive && !(e.def && e.def.isBoss))
        .map(tileOf).filter(t => Math.max(Math.abs(t.tx - bt.tx), Math.abs(t.ty - bt.ty)) <= 4);

      const FOG_R2 = 6 * 6 + 1;
      const DET_TILES = 1200 / TILE_SIZE;
      const BAND = 8;

      const pathOf = (a, b) => aStar(a.tx, a.ty, b.tx, b.ty, ring, null);
      const measure = (a, b) => {
        const p = pathOf(a, b);
        if (!p) return null;
        const tiles = [{ tx: a.tx, ty: a.ty }].concat(p.map(t => ({ tx: t.tx, ty: t.ty })));
        let fog2 = Infinity, fogN = 0, band = 0;
        for (const t of tiles) {
          let m = Infinity;
          for (const g of guards) { const dd = (t.tx - g.tx) * (t.tx - g.tx) + (t.ty - g.ty) * (t.ty - g.ty); if (dd < m) m = dd; }
          if (m < fog2) fog2 = m;
          if (m <= FOG_R2) fogN++;
          if (Math.max(Math.abs(t.tx - bt.tx), Math.abs(t.ty - bt.ty)) <= BAND) band++;
        }
        return { steps: p.length, fog2: fog2, fogN: fogN, band: band, detMin: +Math.sqrt(fog2).toFixed(2) };
      };

      const road = pathOf(start, bt) || [];
      const roadSet = road.map(t => ({ tx: t.tx, ty: t.ty }));
      const offRoad = (t) => {
        let m = Infinity;
        for (const rt of roadSet) {
          const dd = Math.max(Math.abs(t.tx - rt.tx), Math.abs(t.ty - rt.ty));
          if (dd < m) m = dd;
        }
        return m;
      };

      const s3 = d.spots.find(s => s.key === 's3');
      const s3t = { tx: s3.tx, ty: s3.ty };
      const cands = [];
      for (let ty = rowLo; ty <= rowHi; ty++) {
        for (let tx = colLo; tx <= colHi; tx++) {
          if (tx <= c1 || tx >= c2 || ty <= r1 || ty >= r2) continue;
          if (isTileWall(tx, ty)) continue;
          const c = { tx: tx, ty: ty };
          const fromEntry = measure(start, c);
          if (!fromEntry) continue;
          cands.push({ tx: tx, ty: ty, off: offRoad(c), entry: fromEntry, s3: measure(s3t, c) });
        }
      }
      const cur = d.spots.find(s => s.key === 's4');
      const curT = { tx: cur.tx, ty: cur.ty };
      return {
        rect: room.rect, start: start, boss: bt, guards: guards,
        fogR2: FOG_R2, detTiles: +DET_TILES.toFixed(2), band: BAND, roadLen: road.length,
        spots: d.spots.map(s => ({ key: s.key, name: s.name, tx: s.tx, ty: s.ty })),
        current: { tx: curT.tx, ty: curT.ty, off: offRoad(curT),
                   entry: measure(start, curT), s3: measure(s3t, curT) },
        curPath: { s3: (pathOf(s3t, curT) || []).map(t => t.tx + ',' + t.ty),
                   entry: (pathOf(start, curT) || []).map(t => t.tx + ',' + t.ty) },
        cands: cands,
      };
    }, parseInt(arg('rowlo', '14'), 10), parseInt(arg('rowhi', '24'), 10),
       parseInt(arg('collo', '18'), 10), parseInt(arg('colhi', '48'), 10));

    const P = (s, n) => String(s).padStart(n);
    console.log('[probe] rect=' + JSON.stringify(R.rect) + '  entry=' + R.start.tx + ',' + R.start.ty +
                '  throne=' + R.boss.tx + ',' + R.boss.ty +
                '  guards=' + R.guards.map(g => g.tx + ',' + g.ty).join(' / '));
    console.log('[probe] fog r2=' + R.fogR2 + ' (radius 6) / enemy detection=' + R.detTiles +
                ' tiles / band=' + R.band + ' / main road (entry->throne)=' + R.roadLen + ' steps');
    console.log('[probe] spots: ' + R.spots.map(s => s.key + '(' + s.tx + ',' + s.ty + ')').join(' '));
    const fmt = (m) => m ? ('steps=' + P(m.steps, 3) + ' inFog=' + P(m.fogN, 2) +
                            ' nearest=' + P(m.detMin, 5) + ' band=' + P(m.band, 2)) : 'UNREACHABLE';
    console.log('');
    console.log('-- current s4 (' + R.current.tx + ',' + R.current.ty + ') offRoad=' + R.current.off);
    console.log('     entry->s4 : ' + fmt(R.current.entry));
    console.log('     s3   ->s4 : ' + fmt(R.current.s3) + '   <== defect if inFog > 0');

    console.log('     s3->s4 path : ' + R.curPath.s3.join(' '));
    console.log('     entry->s4   : ' + R.curPath.entry.join(' '));
    const ok = R.cands.filter(c => c.s3 && c.entry &&
      c.s3.fogN === 0 && c.entry.fogN === 0 && c.s3.band === 0 && c.entry.band === 0 && c.off >= 6);
    console.log('');
    console.log('-- ' + R.cands.length + ' candidate tiles; ' + ok.length + ' satisfy every condition');
    console.log('   cond: BOTH s3->cand and entry->cand have inFog=0 and band=0, and offRoad >= 6');
    ok.sort((a, b) => (b.ty - a.ty) || (b.off - a.off) || (a.tx - b.tx));
    for (const c of ok.slice(0, parseInt(arg('top', '30'), 10))) {
      console.log('   (' + P(c.tx, 2) + ',' + P(c.ty, 2) + ') offRoad=' + P(c.off, 2) +
                  ' | entry-> ' + fmt(c.entry) + ' | s3-> ' + fmt(c.s3));
    }
    const n = (f) => R.cands.filter(f).length;
    console.log('');
    console.log('   breakdown: s3 inFog=0 : ' + n(c => c.s3 && c.s3.fogN === 0) +
                ' / +band=0 : ' + n(c => c.s3 && c.s3.fogN === 0 && c.s3.band === 0) +
                ' / +entry clean : ' + n(c => c.s3 && c.entry && c.s3.fogN === 0 && c.s3.band === 0 &&
                                              c.entry.fogN === 0 && c.entry.band === 0) +
                ' / +offRoad>=6 : ' + ok.length);

    /* ══ 護衛の配置ごとに「経路のどれだけが暴かれるか」を測る ══════════════════
     * ⚠ 敵の発見条件は距離だけではない: DETECTION_RANGE かつ **hasLineOfSight**。
     *   距離だけで語ると案 1 (護衛を東へ) の可否を読み違える。 */
    const PLACE = JSON.parse(arg('places', '[[[46,20],[46,22]],[[48,20],[48,22]],[[50,20],[50,22]],[[49,19],[49,23]],[[51,20],[51,22]]]'));
    const G = await page.evaluate((places, s4) => {
      const room = window.__graphRun.graph().nodes.find(n => n.id === 'n1').mapDef.rooms[0];
      const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
      const ring = new Set();
      for (let x = c1; x <= c2; x++) { ring.add(x + ',' + r1); ring.add(x + ',' + r2); }
      for (let y = r1; y <= r2; y++) { ring.add(c1 + ',' + y); ring.add(c2 + ',' + y); }
      const start = { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) };
      const d = window.__graphRun.detour();
      const s3 = d.spots.find(s => s.key === 's3');
      const legs = {
        's3->s4': aStar(s3.tx, s3.ty, s4[0], s4[1], ring, null),
        'entry->s4': aStar(start.tx, start.ty, s4[0], s4[1], ring, null),
      };
      const DET = 1200, C = (t) => t * TILE_SIZE + TILE_SIZE / 2;
      const out = [];
      for (const gs of places) {
        const row = { guards: gs, floor: gs.map(g => !isTileWall(g[0], g[1])), legs: {} };
        for (const k of Object.keys(legs)) {
          const p = legs[k] || [];
          let seen = 0, fog = 0, firstSeen = null, minD = Infinity;
          for (let i = 0; i < p.length; i++) {
            const t = p[i];
            for (const g of gs) {
              const dpx = Math.hypot(C(t.tx) - C(g[0]), C(t.ty) - C(g[1]));
              const dt = dpx / TILE_SIZE;
              if (dt < minD) minD = dt;
              const los = hasLineOfSight(C(g[0]), C(g[1]), C(t.tx), C(t.ty));
              if (dpx < DET && los) { seen++; if (firstSeen === null) firstSeen = t.tx + ',' + t.ty; break; }
            }
            for (const g of gs) {
              const dd = (t.tx - g[0]) * (t.tx - g[0]) + (t.ty - g[1]) * (t.ty - g[1]);
              if (dd <= 37) { fog++; break; }
            }
          }
          row.legs[k] = { len: p.length, seen: seen, fog: fog, firstSeen: firstSeen, minD: +minD.toFixed(2) };
        }
        out.push(row);
      }
      return { losIsFn: typeof hasLineOfSight === 'function', rows: out };
    }, PLACE, [R.current.tx, R.current.ty]);
    console.log('');
    console.log('-- guard placement sweep (detection = dist<12.5 tiles AND hasLineOfSight)  losFn=' + G.losIsFn);
    for (const row of G.rows) {
      const tag = row.guards.map(g => g[0] + ',' + g[1]).join('/');
      const parts = Object.keys(row.legs).map(k => {
        const L = row.legs[k];
        return k + ': seen=' + P(L.seen, 3) + '/' + P(L.len, 3) + ' fog=' + P(L.fog, 2) +
               ' minDist=' + P(L.minD, 5) + ' firstSeen=' + (L.firstSeen || '-');
      });
      console.log('   [' + tag + '] floor=' + JSON.stringify(row.floor));
      for (const s of parts) console.log('        ' + s);
    }
    const out = path.join(os.tmpdir(), 'probe_s4_relocate.json');
    fs.writeFileSync(out, JSON.stringify(R, null, 1));
    console.log('');
    console.log('[probe] raw: ' + out);
  } finally {
    await browser.close(); srv.close();
  }
})();
