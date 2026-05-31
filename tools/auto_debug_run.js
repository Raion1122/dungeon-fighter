#!/usr/bin/env node
/*
 * 自動デバッグ巡回ランナー (auto_debug_run.js)
 * ───────────────────────────────────────────────
 * ローカル静的サーバを立て、ヘッドレス Edge/Chrome で index.html?autodebug=N を
 * 走らせ、ゲーム内の不変条件ウォッチドッグ (localStorage["dragonfighters.debugReport"])
 * を回収して要約する。フリーズ時は ?autodebug=resume で次ランへ自動復帰し、
 * 静的アセットの 404/読込失敗も併せて収集する (これは in-game 診断では拾えない軸)。
 *
 * 依存: puppeteer-core のみ (repo には入れない)。初回セットアップは tools/README.md の
 *       「自動デバッグ巡回ランナー」節を参照。
 *
 * 使い方:
 *   node tools/auto_debug_run.js                 # 全6シナリオ x6 ラン (速度x15)
 *   node tools/auto_debug_run.js --runs 12       # 12 ラン
 *   node tools/auto_debug_run.js --scen goblin-mine --runs 3   # 1シナリオ固定
 *   node tools/auto_debug_run.js --headful       # ブラウザ画面を表示
 *   node tools/auto_debug_run.js --browser "C:/path/to/chrome.exe"
 *
 * オプション: --runs N | --speed N | --scen <id> | --cycle all|impl | --port P
 *            --out <file> | --headful | --timeout-min N | --browser <path>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');   // プロジェクトルート (index.html の場所)

// ── 引数 ──
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : def; };
const flag = (name) => argv.includes('--' + name);
const RUNS = parseInt(arg('runs', '6'), 10);
const SPEED = parseInt(arg('speed', '15'), 10);
const SCEN = arg('scen', null);
const CYCLE = arg('cycle', null);
const PORT = parseInt(arg('port', '8765'), 10);
const OUT = arg('out', path.join(os.tmpdir(), 'df_auto_debug_report.json'));
const HEADFUL = flag('headful');
const RUN_TIMEOUT_MIN = parseInt(arg('timeout-min', '5'), 10);

// ── puppeteer-core 解決 (repo に node_modules を持たないため複数候補を探す) ──
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('require("puppeteer-core")'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[runner] puppeteer-core が見つかりません。scratch dir で `npm i puppeteer-core` 後、');
  console.error('         PPTR_DIR=<scratch dir> を指定して再実行してください (tools/README.md 参照)。');
  console.error('         試行: ' + tried.join(' / '));
  process.exit(2);
}

// ── ブラウザ自動検出 (Edge 優先、Chrome フォールバック) ──
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[runner] Edge/Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

// ── 簡易静的サーバ (依存なし) ──
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp',
};
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[runner] serving ' + ROOT + ' @ http://localhost:' + PORT);

  let url = 'http://localhost:' + PORT + '/index.html?autodebug=' + RUNS + '&autoplay=' + SPEED;
  if (SCEN) url += '&scen=' + encodeURIComponent(SCEN);
  if (CYCLE) url += '&cycle=' + encodeURIComponent(CYCLE);

  const profile = path.join(os.tmpdir(), 'df_runner_profile');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--user-data-dir=' + profile],
  });
  const page = await browser.newPage();
  const resourceErrors = new Set();
  const strip = (u) => { try { return u.replace('http://localhost:' + PORT, ''); } catch (e) { return u; } };
  page.on('requestfailed', r => { try { resourceErrors.add(strip(r.url()) + ' (' + (r.failure() && r.failure().errorText) + ')'); } catch (e) {} });
  page.on('response', r => { if (r.status() === 404) resourceErrors.add(strip(r.url()) + ' (404)'); });
  page.on('pageerror', e => console.log('[page error]', e.message));

  console.log('[runner] navigating: ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 巡回完了までポーリング (レポート停止 = フリーズ疑い → resume で復帰)
  const overallDeadline = Date.now() + RUNS * RUN_TIMEOUT_MIN * 60000 + 60000;
  let lastLive = null, stuckMs = 0, complete = false, lastDone = -1;
  while (Date.now() < overallDeadline) {
    await sleep(2000);
    let st = null;
    try { st = await page.evaluate("({c:!!window.__autodebugComplete, r:(window.__diag?window.__diag.getReport():null)})"); } catch (e) {}
    if (st && st.c) { complete = true; break; }
    const r = st && st.r;
    if (r && r.runs && r.runs.length !== lastDone) { lastDone = r.runs.length; console.log('[runner] 進捗: ' + lastDone + '/' + RUNS + ' ラン完了'); }
    // 生存判定は heartbeat (500ms 毎に進む。違反ゼロの健全ランでも進む)。無ければ lastUpdated。
    const live = r ? (r.heartbeat != null ? r.heartbeat : r.lastUpdated) : null;
    if (live != null && live === lastLive) stuckMs += 2000; else { stuckMs = 0; lastLive = live; }
    if (stuckMs >= 30000) {
      console.log('[runner] レポート30秒停止 → フリーズ疑い、resume で次ランへ復帰');
      try { await page.goto('http://localhost:' + PORT + '/index.html?autodebug=resume', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) {}
      stuckMs = 0;
    }
  }

  // レポート回収
  let report = null;
  try { report = await page.evaluate("window.__diag?window.__diag.getReport():JSON.parse(localStorage.getItem('dragonfighters.debugReport')||'null')"); } catch (e) {}
  if (!report) { try { report = await page.evaluate("JSON.parse(localStorage.getItem('dragonfighters.debugReport')||'null')"); } catch (e) {} }

  // 要約
  console.log('\n========== 自動デバッグ巡回 サマリ ==========');
  console.log('完了: ' + complete + '  実行ラン: ' + (report ? report.runs.length : '?') + '/' + RUNS);
  if (report) {
    console.log('critical: ' + report.totals.criticals + '   warn: ' + report.totals.warns);
    if (Object.keys(report.totals.byId).length) { console.log('違反集計 (byId):'); try { console.table(report.totals.byId); } catch (e) { console.log(report.totals.byId); } }
    console.log('ラン別:');
    for (const r of report.runs) {
      const v = Object.keys(r.violations || {}).map(k => k + '×' + r.violations[k].count).join(', ') || '(なし)';
      console.log('  #' + r.idx + ' ' + r.scenarioId + ' [' + r.outcome + ', ' + Math.round((r.durationMs || 0) / 1000) + 's, R' + r.rounds + '] HP=' + r.finalLeaderHp + ' 生存=' + r.partyAlive + ' :: ' + v);
    }
  }
  if (resourceErrors.size) { console.log('\n[404 / 読込失敗リソース] (in-game 診断では拾えない軸)'); for (const e of resourceErrors) console.log('  ' + e); }
  try { fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); console.log('\nレポート保存: ' + OUT); } catch (e) {}

  await browser.close();
  srv.close();
  process.exit(complete ? 0 : 1);
})().catch(e => { console.error('RUNNER FAIL:', e.stack || e.message); process.exit(1); });
