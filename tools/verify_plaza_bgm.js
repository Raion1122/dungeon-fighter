#!/usr/bin/env node
/*
 * verify_plaza_bgm.js — ①闇市ダークアンビエント (2026-11-26 開発会議) の受入
 *
 * 測るもの (実 Chrome + OfflineAudioContext・経路 B = __bgmTrack で「実際に鳴っている合成曲」):
 *   §0 方針P  (0a) __bgmTrackIds() に 'plaza' が在る (12 曲) / (0b) __renderBgmOffline('plaza',12) が resolve・無音でない
 *             (-40dBFS 超) / (0c) plaza の lead が他の全曲と不一致 (流用取り違え検出) / (0d) /assets/bgm/ を要求しない
 *   §1 切替   tavern.html で pointerdown → (1a) tavern / __plazaTV.openPlazaScreen() → (1b) plaza /
 *             __plazaTV.closePlaza() → (1c) tavern (経路 B __bgmTrack().name)
 *   §2 撤退   ?plazabgm=0 で開いても (2a) 闇市でも tavern のまま (メタルバラードへ戻す)
 *   §9        (9a) pageerror 0
 *
 * ⚠ headless で経路 B を取るため autoplay 解除 + mute (index の既存ドライバと同じ)。
 *   ⚠ unlock() は pointerdown でしか true にならない (K3)。openPlazaScreen を pointerdown の後に呼ぶ。
 *   exit: 0 = 全緑 / 1 = 赤あり / 2 = puppeteer/Chrome 無し
 *
 * 使い方: node tools/verify_plaza_bgm.js   [--headful] [--port 10607] [--browser <chrome>]
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
const PORT = parseInt(arg('port', '10607'), 10);

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
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};
function startServer(port) {
  return new Promise((resolve, reject) => {
    const ctx = { port, bgmReqs: [], srv: null };
    ctx.srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
        if (u.indexOf('/assets/bgm/') >= 0) ctx.bgmReqs.push(u);
        let rel = u.replace(/^\/+/, '');
        if (rel === '') rel = 'index.html';
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    ctx.srv.on('error', reject);
    ctx.srv.listen(port, () => resolve(ctx));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ ok, name });
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
}

async function openTavern(browser, sv, query) {
  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:' + sv.port + '/tavern.html' + (query || ''), { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction('!!window.GameAudio', { timeout: 30000 });
  return { page, errs };
}

(async () => {
  const t0 = Date.now();
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_plazabgm_');
  const browserPath = findBrowser();
  console.log('=== verify_plaza_bgm.js ===');
  console.log('[drv] serving ' + ROOT + '  port:' + PORT);
  let sv = null, browser = null;
  try {
    sv = await startServer(PORT);
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
        '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    });

    // ── §0 / §1: 素の tavern.html ──
    sv.bgmReqs.length = 0;
    const { page, errs } = await openTavern(browser, sv, '');
    const tracks = await page.evaluate(async () => {
      const ga = window.GameAudio;
      const ids = ga.__bgmTrackIds();
      const leads = {}; for (const id of ids) leads[id] = ga.__bgmTrackLead(id);
      let render = { ok: false };
      try {
        const d = await ga.__renderBgmOffline('plaza', 12);
        const s0 = Math.floor(d.length * 0.1); let ss = 0;
        for (let i = s0; i < d.length; i++) ss += d[i] * d[i];
        const rms = Math.sqrt(ss / Math.max(1, d.length - s0));
        render = { ok: true, len: d.length, rmsDb: rms > 0 ? +(20 * Math.log10(rms)).toFixed(2) : -999 };
      } catch (e) { render = { ok: false, err: String(e) }; }
      return { ids, leads, render };
    });
    // pointerdown → tavern、openPlazaScreen → plaza、closePlaza → tavern
    const seq = await page.evaluate(async () => {
      const w = (ms) => new Promise(r => setTimeout(r, ms));
      const ga = window.GameAudio;
      const name = () => (ga.__bgmTrack() || {}).name;
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await w(900); const afterDown = name();
      window.__plazaTV.openPlazaScreen(); await w(900); const afterOpen = name();
      const plazaOpen = window.__plazaTV.plazaOpen();
      window.__plazaTV.closePlaza(); await w(900); const afterClose = name();
      return { afterDown, afterOpen, afterClose, plazaOpen };
    });
    await page.close();

    // ── §2: 撤退 ?plazabgm=0 ──
    const r2 = await openTavern(browser, sv, '?plazabgm=0');
    const seq2 = await r2.page.evaluate(async () => {
      const w = (ms) => new Promise(r => setTimeout(r, ms));
      const ga = window.GameAudio;
      const name = () => (ga.__bgmTrack() || {}).name;
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await w(900);
      window.__plazaTV.openPlazaScreen(); await w(900); const afterOpen = name();
      return { afterOpen };
    });
    await r2.page.close();

    const J = (v) => JSON.stringify(v);
    console.log('\n── §0 方針P (合成エンジンの非メタル拡張 = plaza)');
    check('(0a) __bgmTrackIds() に plaza が在る (12 曲)', tracks.ids.indexOf('plaza') >= 0 && tracks.ids.length === 12, J(tracks.ids));
    check('(0b) __renderBgmOffline("plaza",12) が resolve・無音でない (RMS > -40 dBFS)',
      tracks.render.ok && tracks.render.len > 0 && tracks.render.rmsDb > -40, J(tracks.render));
    {
      const L = tracks.leads, p = L.plaza;
      let dup = [];
      for (const id of Object.keys(L)) if (id !== 'plaza' && J(L[id]) === J(p)) dup.push(id);
      check('(0c) plaza の lead が他の全曲と不一致 (流用の取り違え検出)', Array.isArray(p) && p.length > 0 && dup.length === 0, '一致=' + J(dup));
    }
    check('(0d) 合成なので /assets/bgm/ を要求しない', sv.bgmReqs.length === 0, J(sv.bgmReqs));
    console.log('\n── §1 闇市の開閉で切り替わる (経路 B __bgmTrack)');
    check('(1a) pointerdown 直後は tavern (メタルバラード)', seq.afterDown === 'tavern', 'name=' + seq.afterDown);
    check('(1b) 闇市を開くと plaza (ダークアンビエント) へ切替', seq.afterOpen === 'plaza' && seq.plazaOpen === true, 'name=' + seq.afterOpen + ' open=' + seq.plazaOpen);
    check('(1c) 闇市を閉じると tavern へ戻る', seq.afterClose === 'tavern', 'name=' + seq.afterClose);
    console.log('\n── §2 撤退 ?plazabgm=0');
    check('(2a) ?plazabgm=0 では闇市でも tavern のまま', seq2.afterOpen === 'tavern', 'name=' + seq2.afterOpen);
    console.log('\n── §9 ページエラー');
    check('(9a) pageerror 0 件', errs.length === 0 && r2.errs.length === 0, [...errs, ...r2.errs].slice(0, 6).join(' | '));
    console.log('\n       [記録] plaza RMS = ' + (tracks.render.rmsDb) + ' dBFS');
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    if (browser) await browser.close();
    if (sv) sv.srv.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + (results.length - failed.length) + '/' + results.length + ' PASSED   FAILED ' + failed.length
    + '   (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(failed.length ? 1 : 0);
})();
