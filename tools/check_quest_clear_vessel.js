#!/usr/bin/env node
/*
 * check_quest_clear_vessel.js — ★付随#4「討伐済み依頼が世界地図で『受注中』のまま残る」の index 側修正の直接駆動確認
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/check_quest_clear_vessel.js
 *
 * ■ 確かめること (49424a0 の付随#4 修正)
 *   - クリア(win=true) を書いた瞬間に index 側が localStorage['dragonfighters.activeQuest'] を消す。
 *     → クリア直後に世界地図(world.html)へ戻っても討伐済み依頼が「受注中」で残らない。
 *   - 敗北(win=false) では消さない (再挑戦の導線として器を残す。従来どおり酒場 consumeResult が消す)。
 *
 * ■ 駆動 = 既設の診断フック window.__plaza.awardResult(win) (index.html の showResult(win) を直呼び)。
 *   showResult は resultShown ガードで 1 ページ 1 回しか走らないので、win / loss を別ページで検証する。
 * ⛔ 本番ファイルは 1 バイトも変えない。localStorage は合成値のみ。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const I = 'index.html';
const PORT = 10950;

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        res.on('error', () => {});
        let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (rel === '') rel = I;
        res.setHeader('Cache-Control', 'no-store');
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { try { res.statusCode = 500; res.end('500'); } catch (e2) {} }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[env] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[env] Chrome/Edge が見つかりません'); process.exit(2);
}

const SEED_QUEST = JSON.stringify({ scenarioId: 'goblin-mine', title: '（検証用）受注中の依頼' });

(async () => {
  const puppeteer = loadPuppeteer();
  const exe = findBrowser();
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({ headless: true, executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const BASE = 'http://127.0.0.1:' + PORT + '/';
  const QS = '?diag=1&scen=goblin-mine&graph=0&autoplay=15';

  async function drive(win) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('dragonfighters.xp', '45000');
        localStorage.setItem('dragonfighters.prologueSeen', '1');
        sessionStorage.setItem('dragonfighters.plazaClock', '21');
      } catch (e) {}
    });
    await page.goto(BASE + I + QS, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => { try { return typeof startGame === 'function' && !!window.__plaza && typeof allies !== 'undefined' && allies.length > 0; } catch (e) { return false; } }, { timeout: 60000 });
    await sleep(300);
    await page.evaluate(() => { try { tryStartEncounter = function () {}; } catch (e) {} try { if (!gameStarted) startGame(); } catch (e) {} });
    await page.waitForFunction(() => { try { return gameStarted; } catch (e) { return false; } }, { timeout: 30000 });
    await sleep(300);
    const r = await page.evaluate((seed, w) => {
      localStorage.setItem('dragonfighters.activeQuest', seed);   // 受注中の器を置く
      const before = localStorage.getItem('dragonfighters.activeQuest');
      window.__plaza.awardResult(w);                              // = showResult(win)
      const after = localStorage.getItem('dragonfighters.activeQuest');
      return { before: before, after: after };
    }, SEED_QUEST, win);
    await page.close();
    return r;
  }

  const wonR = await drive(true);
  const lostR = await drive(false);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  クリア(win) : before=' + (wonR.before ? '器あり' : 'なし') + ' → after=' + (wonR.after === null ? '器なし(消えた)' : '器残存'));
  console.log('  敗北(loss)  : before=' + (lostR.before ? '器あり' : 'なし') + ' → after=' + (lostR.after === null ? '器なし' : '器残存(維持)'));
  console.log('══════════════════════════════════════════════════════════');

  try { await browser.close(); } catch (e) {}
  try { srv.close(); } catch (e) {}

  const ok = wonR.before && wonR.after === null && lostR.before && lostR.after !== null;
  console.log(ok ? '\n✅ #4: クリアで器が消え・敗北で器が残る (討伐済み依頼は世界地図で受注中に残らない)' :
                   '\n❌ #4: 期待どおりでない ' + JSON.stringify({ won: wonR, lost: lostR }));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('[fatal] ' + String((e && e.stack) || e).slice(0, 500)); process.exit(2); });
