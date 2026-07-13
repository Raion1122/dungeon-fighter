#!/usr/bin/env node
/*
 * driver_speech_hooks.js — セリフ吹き出し STEP2 探索系フック検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * オートプレイを実走させ、実際のゲーム進行で「遭遇 / 休憩 / 罠 / 宝箱」の
 * セリフが *表示された* ことを window.__speech.log から確認する。
 * (log は実際に描画された時にだけ push される → 「キューに積んだが捨てられた」台詞は入らない)
 *
 * 検証項目 (計画書 STOP ゲート 2):
 *   (1) goblin-mine のオートプレイで encounter.goblinoid が出現する
 *   (2) goblin-mine のオートプレイで phase.rest が出現する
 *   (3) 遭遇/休憩の話者はパーティ (kind が player か ally。敵が喋っていない)
 *   (4) find.trap / find.chest は判定成功依存なので必須にしない。出た場合のみ kind を検証
 *   (5) lizard-swamp で encounter.lizardman が出現する (detectEnemyFamily の穴埋め確認)
 *   (6) 同時表示は常に 1 件以下 / pageerror ゼロ / __diag critical ゼロ
 *
 * 使い方:  node tools/driver_speech_hooks.js [--headful] [--browser <path>] [--port N] [--budget 150]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8797'), 10);
const BUDGET_S = parseInt(arg('budget', '150'), 10);   // 1 シナリオあたりの観測上限 (秒)

function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(PORT, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✅' : '  ❌') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1 シナリオを autoplay で走らせ、__speech.log を貯めながら同時表示数を監視する
async function runScenario(browser, scenarioId, wantKeys) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  // scenarioId は sessionStorage 経由でしか固定できない (?scen= は autodebug 経由のみ)
  await page.evaluateOnNewDocument((id) => {
    sessionStorage.setItem('dragonfighters.currentScenario', id);
  }, scenarioId);
  await page.goto('http://localhost:' + PORT + '/index.html?autoplay=30&diag=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__speech && typeof gameStarted !== "undefined" && gameStarted',
    { timeout: 40000 });
  console.log('[drv] ' + scenarioId + ': game started, observing up to ' + BUDGET_S + 's');

  let maxConcurrent = 0;
  const seen = new Set();
  const byKey = {};
  const deadline = Date.now() + BUDGET_S * 1000;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => ({
      n: document.querySelectorAll('.speechBubble').length,
      log: window.__speech.log.map(e => ({ key: e.key, kind: e.kind, at: e.at })),
      over: !!(typeof gameOver !== 'undefined' && gameOver),
    })).catch(() => null);
    if (!snap) break;
    if (snap.n > maxConcurrent) maxConcurrent = snap.n;
    // log は上限 50 件のリングバッファなので、毎ポーリングで拾って蓄積する (取りこぼし防止)
    for (const e of snap.log) {
      seen.add(e.key);
      const bucket = (byKey[e.key] = byKey[e.key] || new Map());
      bucket.set(e.at, e.kind);   // at をキーに重複排除
    }
    if (wantKeys.every(k => seen.has(k))) { console.log('[drv] ' + scenarioId + ': 目標キーが全て出現、観測終了'); break; }
    if (snap.over) { console.log('[drv] ' + scenarioId + ': gameOver、観測終了'); break; }
    await sleep(250);
  }

  const diag = await page.evaluate(() => {
    if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
    const r = window.__diag.getReport();
    const viol = (r.current || {}).violations || {};
    return { criticals: (r.totals && r.totals.criticals) || 0, violIds: Object.keys(viol) };
  }).catch(() => ({ noDiag: true }));

  const kinds = {};
  for (const k of Object.keys(byKey)) kinds[k] = [...byKey[k].values()];
  await page.close();
  return { seen, byKey: kinds, maxConcurrent, diag,
    pageErrors: pageErrors.filter(m => !/Failed to load resource|favicon/i.test(m)) };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_speechhk_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  const partyKinds = (kinds) => kinds.length > 0 && kinds.every(k => k === 'player' || k === 'ally');

  // ── goblin-mine: 遭遇 (ゴブリン) + 休憩 ──
  const gm = await runScenario(browser, 'goblin-mine', ['encounter.goblinoid', 'phase.rest']);
  check('(1) goblin-mine で encounter.goblinoid が表示された', gm.seen.has('encounter.goblinoid'),
    'seen=[' + [...gm.seen].join(', ') + ']');
  check('(2) goblin-mine で phase.rest が表示された', gm.seen.has('phase.rest'));
  check('(3) encounter.goblinoid の話者はパーティ (敵が喋っていない)',
    partyKinds(gm.byKey['encounter.goblinoid'] || []),
    'kinds=[' + (gm.byKey['encounter.goblinoid'] || []).join(',') + ']');
  check('(3) phase.rest の話者はパーティ',
    partyKinds(gm.byKey['phase.rest'] || []),
    'kinds=[' + (gm.byKey['phase.rest'] || []).join(',') + ']');

  // (4) 罠/宝箱は知覚・捜査判定の成功依存なので必須にしない。出た場合のみ話者を検証。
  for (const k of ['find.trap', 'find.chest']) {
    const kinds = gm.byKey[k] || [];
    if (kinds.length) {
      check('(4) ' + k + ' の話者はパーティ (出現時のみ検証)', partyKinds(kinds), 'kinds=[' + kinds.join(',') + ']');
    } else {
      console.log('  ○ (4) ' + k + ' は今回出現せず (判定成功依存のためスキップ)');
    }
  }
  check('(6) goblin-mine: 同時表示は常に 1 件以下', gm.maxConcurrent <= 1, 'max=' + gm.maxConcurrent);
  check('(6) goblin-mine: pageerror ゼロ', gm.pageErrors.length === 0, gm.pageErrors.join(' | '));
  check('(6) goblin-mine: __diag critical ゼロ',
    !gm.diag.noDiag && gm.diag.criticals === 0,
    gm.diag.noDiag ? 'no __diag' : ('criticals=' + gm.diag.criticals + ' viol=[' + (gm.diag.violIds || []).join(',') + ']'));

  // ── lizard-swamp: detectEnemyFamily の穴埋め確認 (従来 generic に落ちていた) ──
  const ls = await runScenario(browser, 'lizard-swamp', ['encounter.lizardman']);
  check('(5) lizard-swamp で encounter.lizardman が表示された (穴埋め確認)',
    ls.seen.has('encounter.lizardman'), 'seen=[' + [...ls.seen].join(', ') + ']');
  check('(5) encounter.lizardman の話者はパーティ',
    partyKinds(ls.byKey['encounter.lizardman'] || []),
    'kinds=[' + (ls.byKey['encounter.lizardman'] || []).join(',') + ']');
  check('(6) lizard-swamp: 同時表示は常に 1 件以下', ls.maxConcurrent <= 1, 'max=' + ls.maxConcurrent);
  check('(6) lizard-swamp: pageerror ゼロ', ls.pageErrors.length === 0, ls.pageErrors.join(' | '));
  check('(6) lizard-swamp: __diag critical ゼロ',
    !ls.diag.noDiag && ls.diag.criticals === 0,
    ls.diag.noDiag ? 'no __diag' : ('criticals=' + ls.diag.criticals + ' viol=[' + (ls.diag.violIds || []).join(',') + ']'));

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
