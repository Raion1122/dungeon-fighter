#!/usr/bin/env node
/*
 * probe_arcane_draw.js — 「崩れた魔術師の塔」(arcane-tower) が orc-fort クリア後に
 *   酒場の卓 (walkable tavern map の盤面) へどのくらいの確率で出るかを実測する調査ツール。
 *
 *   ⭐ 本番コードは 1 バイトも触らない。tavern.html を本番の関数ごとそのまま開き、
 *      ① __TAVERN_TV.boardFacts() で「解放済みプール・本筋・次の未解放」を読む
 *      ② localStorage の盤面鍵を消して __tavernRefreshSigns() を呼ぶ = 酒場へ戻るたびの引き直しを再現
 *      ③ __TAVERN_TV.board() の seats に arcane-tower が居るか数える
 *   を N 回まわして経験確率を出す。
 *
 *   node tools/probe_arcane_draw.js                 # cleared=[goblin,bandits,lizard,orc]・N=3000
 *   node tools/probe_arcane_draw.js --n 5000
 *   exit 0=実測できた / 2=puppeteer / Chrome が無い・例外
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const N = parseInt(arg('n', '3000'), 10);
const PORT = parseInt(arg('port', '10940'), 10);
const CLEARED = (arg('cleared', 'goblin-mine,bandits-forest,lizard-swamp,orc-fort') || '').split(',').map((s) => s.trim()).filter(Boolean);
const ARCANE = 'arcane-tower';
const BOARD_KEY = 'dragonfighters.questBoard';
const CLEARED_KEY = 'dragonfighters.cleared';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[probe] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[probe] Chrome/Edge が見つかりません (--browser <path>)'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.md': 'text/markdown;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === '__blank.html') { res.setHeader('Content-Type', MIME['.html']); res.end('<!doctype html><title>blank</title>'); return; }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const srv = await startServer(PORT);
  const base = 'http://127.0.0.1:' + PORT + '/';
  const errs = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push(String((e && e.message) || e).slice(0, 200)));
    await page.setViewport({ width: 1440, height: 900 });
    // 種まき
    await page.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
    await page.evaluate((cl, CK) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      sessionStorage.setItem('dragonfighters.plazaClock', '21');
      localStorage.setItem(CK, JSON.stringify(cl));
    }, CLEARED, CLEARED_KEY);
    // 本番ページを開く
    await page.goto(base + 'tavern.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => { try { return !!window.__TAVERN_TV && typeof window.__tavernRefreshSigns === 'function'; } catch (e) { return false; } }, { timeout: 30000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(150);

    const facts = await page.evaluate(() => window.__TAVERN_TV.boardFacts());
    const sampled = await page.evaluate(async (n, BK, arc) => {
      let hit = 0; const sizes = {};
      const counts = {};
      for (let i = 0; i < n; i++) {
        localStorage.removeItem(BK);
        window.__tavernRefreshSigns();
        const b = window.__TAVERN_TV.board();
        const ids = b && b.seats ? Object.values(b.seats) : [];
        const sz = ids.length; sizes[sz] = (sizes[sz] || 0) + 1;
        ids.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
        if (ids.indexOf(arc) >= 0) hit++;
      }
      return { hit, sizes, counts };
    }, N, BOARD_KEY, ARCANE);

    const p = sampled.hit / N;
    const rest = facts.unlocked.filter((id) => id !== facts.frontier);
    const theoretical = facts.frontier ? (2 / rest.length) : null; // frontier固定 + 残り2枠
    console.log('══════════════════════════════════════════════════════════');
    console.log('  arcane-tower 卓出現 実測 (cleared = ' + JSON.stringify(CLEARED) + ')');
    console.log('══════════════════════════════════════════════════════════');
    console.log('  frontier (本筋・必ず1枠)      : ' + facts.frontier);
    console.log('  nextLocked (次の未解放)       : ' + facts.nextLocked);
    console.log('  unlocked (抽選プール) 件数     : ' + facts.unlocked.length);
    console.log('  unlocked 一覧                 : ' + facts.unlocked.join(', '));
    console.log('  arcane-tower は unlocked に居るか: ' + (facts.unlocked.indexOf(ARCANE) >= 0));
    console.log('  自由枠の母集団 (frontier除く)   : ' + rest.length + ' 件 → ' + rest.join(', '));
    console.log('  盤面件数の分布                 : ' + JSON.stringify(sampled.sizes));
    console.log('  --------------------------------------------------------');
    console.log('  実測: ' + sampled.hit + '/' + N + ' = ' + (p * 100).toFixed(2) + '%  arcane-tower が卓に出た');
    if (theoretical != null) console.log('  理論値 (2/' + rest.length + ')                 : ' + (theoretical * 100).toFixed(2) + '%');
    console.log('  --------------------------------------------------------');
    console.log('  各シナリオの出現率 (参考):');
    Object.keys(sampled.counts).sort((a, b) => sampled.counts[b] - sampled.counts[a]).forEach((id) => {
      console.log('    ' + id.padEnd(18) + ' ' + (sampled.counts[id] / N * 100).toFixed(1) + '%');
    });
    console.log('  pageerror: ' + errs.length + (errs.length ? '  ' + errs.join(' | ') : ''));
    console.log('══════════════════════════════════════════════════════════');
  } finally {
    try { await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }
})().catch((e) => { console.error('[probe] 例外', e); process.exit(2); });
