#!/usr/bin/env node
/*
 * probe_p9_tour.js — 調査用プローブ (2026-08-22)
 * driver_grid_p9 の §4/§5b (?detour=tour の 1 周) だけを **N 回** 回して、
 *   ① s4 へ着けない頻度 (= 赤がフレークか決定的か)
 *   ② 着けなかった走行で **何に引かれたか** (heroForcedGoal / 見えている最寄り敵)
 * を測る。⚠ ドライバではない (PASS/FAIL を出さない)。結論が出たら消してよい。
 *
 * ⚠ ポーリングは 1 秒間隔 (150ms にすると測定対象そのものが遅くなる = 既知の罠)。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const PORT = parseInt(arg('port', '9076'), 10);
const RUNS = parseInt(arg('runs', '4'), 10);
const TIMEOUT_MS = parseInt(arg('timeout', '780000'), 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/* --mutate spotsouth … driver_grid_p9 の負のコントロールと**同じ 1 行**を注入して配信する。
 *   s3 を (43,7) → (44,13) = 玉座から 8 マスの帯の中へ動かす = 「パーティの行き先そのものが
 *   帯の中」という欠陥。新しい (5b) がこれを赤くできるかを手で確かめるための口。 */
const MUTATIONS = {
  spotsouth: [
    '              { key: "s3", name: "北の横穴",     at: [43, 7],  dir: "right",',
    '              { key: "s3", name: "北の横穴",     at: [44, 13],  dir: "right",  /* mut-spotsouth */'],
};
const MUT = arg('mutate', null);
let MUT_BODY = null;
if (MUT) {
  const pair = MUTATIONS[MUT];
  if (!pair) { console.error('[probe] 未知の変異: ' + MUT); process.exit(3); }
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const n = src.split(pair[0]).length - 1;
  if (n !== 1) { console.error('[probe] 変異の置換対象が ' + n + ' 箇所 → 空振り'); process.exit(3); }
  MUT_BODY = src.split(pair[0]).join(pair[1]);
  console.log('[probe] ⚠ 変異 ' + MUT + ' を注入して配信します');
}

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
        if (MUT_BODY && u === '/index.html') {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_BODY); return;
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

/* 1 周ぶんの観測。⚠ evaluate は**軽く**保つ (重いと autoplay そのものが遅くなる)。 */
async function oneRun(browser, idx) {
  const page = await bootPage(browser, PORT, '?autoplay=30&detour=tour&intel=0');
  const t0 = Date.now();
  let early = null, divert = null, last = null, cleared = false, over = false;
  try {
    for (;;) {
      await sleep(1000);
      const st = await page.evaluate(() => {
        const d = window.__graphRun.detour();
        const ba = window.__graphRun.bossApproach();
        const fg = window.__graphRun.forcedGoal();
        const tile = (e) => Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE) + ',' +
                            Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE);
        const ne = findNearestAliveEnemy();
        const b = enemies.find(e => e.def && e.def.isBoss && e.alive);
        return { node: window.__graphRun.nodeId(), cleared: dungeonCleared, over: gameOver,
                 visited: d.visited, pending: d.pending, canOffer: d.canOffer, done: d.done,
                 latched: ba.latched, narrated: ba.narrated,
                 fg: fg ? (fg.tx + ',' + fg.ty) : null,
                 ne: ne ? ((ne.def.name || ne.def.key || '?') + '@' + tile(ne)) : null,
                 boss: b ? ((b.alive ? 'A' : 'D') + tile(b)) : null,
                 /* ★ボス曲が本当に鳴ったか。__inBossRoom と currentBgmId の両方を採る。 */
                 bgm: (() => { const g = window.__graphRun.bgm();
                               return (g.id || '-') + (g.inBossRoom ? '/inBoss' : ''); })(),
                 enc: (encounterActive ? 'A' : '') + (encounterRunning ? 'R' : '') || '-',
                 /* ★玉座側 (帯の中に**今**居る生存個体) の顔ぶれ。持ち場を離れたかを目で追う。 */
                 th: enemies.filter(e => e.def && e.alive && !e.def.isBoss &&
                       Math.max(Math.abs(Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE) - 49),
                                Math.abs(Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE) - 21)) <= 12)
                     .map(e => (e.def.name || '?').slice(0, 4) + '@' + tile(e)).join(' '),
                 p: Math.floor((playerX + 48) / TILE_SIZE) + ',' + Math.floor((playerY + 58) / TILE_SIZE) };
      });
      const t = ((Date.now() - t0) / 1000).toFixed(1);
      if (!early && (st.latched || st.narrated)) {
        early = { t: t, visited: st.visited.slice(), pending: st.pending.slice(),
                  p: st.p, boss: st.boss, fg: st.fg, ne: st.ne };
      }
      /* ★「s4 へ向かっていたのに敵に引かれた」瞬間を残す = 逸れた理由そのもの。 */
      if (!divert && st.node === 'n1' && st.pending.length && st.ne && st.fg) {
        divert = { t: t, p: st.p, fg: st.fg, ne: st.ne, pending: st.pending.slice() };
      }
      const line = JSON.stringify(st);
      if (line !== last) { console.log('   [' + idx + '] ' + t + 's ' + line); last = line; }
      if (st.cleared) { cleared = true; break; }
      if (st.over) { over = true; break; }
      if (Date.now() - t0 > TIMEOUT_MS) break;
    }
    const F = await page.evaluate(() => {
      const d = window.__graphRun.detour();
      return { visited: d.visited, pending: d.pending, done: d.done };
    });
    return { idx: idx, secs: ((Date.now() - t0) / 1000).toFixed(1), cleared: cleared, over: over,
             visited: F.visited, pending: F.pending, early: early, divert: divert };
  } finally { await page.close().catch(() => {}); }
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_probe_tour_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: 'new',
    userDataDir: profile, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const out = [];
  try {
    for (let i = 1; i <= RUNS; i++) {
      console.log('[probe] ── run ' + i + '/' + RUNS + ' ──');
      out.push(await oneRun(browser, i));
    }
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
  console.log('\n[probe] ══ まとめ ══');
  for (const r of out) {
    console.log('  run' + r.idx + ' ' + r.secs + 's cleared=' + r.cleared + ' over=' + r.over +
      ' visited=' + JSON.stringify(r.visited) + ' 未訪問=' + JSON.stringify(r.pending));
    if (r.early) console.log('        ボス初出 ' + r.early.t + 's パーティ=' + r.early.p +
      ' ボス=' + r.early.boss + ' pending=' + JSON.stringify(r.early.pending) +
      ' forcedGoal=' + r.early.fg + ' 見えている最寄り敵=' + r.early.ne);
    if (r.divert) console.log('        初めて「未訪問あり + 敵が見えている」' + r.divert.t + 's パーティ=' +
      r.divert.p + ' forcedGoal=' + r.divert.fg + ' 敵=' + r.divert.ne);
  }
  const full = out.filter(r => r.pending.length === 0).length;
  console.log('  → 4 か所すべて回れた: ' + full + ' / ' + out.length);
})();
