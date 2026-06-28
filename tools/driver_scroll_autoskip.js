#!/usr/bin/env node
/*
 * driver_scroll_autoskip.js — 休憩スクロールプロンプトの自動スキップ(6.27版修正指示書 項目1)検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 検証手順はメモリ「ゲーム変更のヘッドレス検証手順」準拠:
 *   - エンジン単体: about:blank に addScriptTag で js/skill-check.js を注入し定数公開を確認。
 *   - 統合: http サーバ経由で index.html を読み、グローバル showCharChoice の自動スキップ挙動を確認。
 *   - 実 Chrome/Edge を puppeteer-core でヘッドレス駆動 (--no-sandbox + 毎回新規プロファイル)。
 *
 * 検証項目:
 *   (1) SkillCheck.AUTO_ROLL_MS === 2000 (定数を公開API経由で参照可能・index.html 側が共有参照できる)
 *   (2a) showCharChoice(..., {autoSkipMs:300}) は約300ms後に null で解決 (放置→使用しない)
 *   (2b) autoSkipMs 設定後、タイムアウト前にボタンclick → その index で解決し、ダイアログが閉じる (入力でキャンセル)
 *   (2c) 既定 (opts 省略 or autoSkipMs:0) はタイマー起動せず、400ms経過しても未解決 (従来=無期限待ち不変)
 *
 * 使い方:  node tools/driver_scroll_autoskip.js [--headful] [--browser <path>]
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
const PORT = parseInt(arg('port', '8793'), 10);

function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
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

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_scroll_skip_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--mute-audio', '--user-data-dir=' + profile],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  // ── (1) エンジン単体: about:blank に注入して定数公開を確認 ──
  await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(ROOT, 'js', 'skill-check.js') });
  const autoMs = await page.evaluate(() => (window.SkillCheck || {}).AUTO_ROLL_MS);
  check('(1) SkillCheck.AUTO_ROLL_MS === 2000 (公開API経由で共有参照可)', autoMs === 2000, 'AUTO_ROLL_MS=' + autoMs);

  // ── index.html フルロード: グローバル showCharChoice の自動スキップ挙動 ──
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));   // インラインスクリプトが showCharChoice を定義するまで待つ
  const hasFn = await page.evaluate(() => typeof window.showCharChoice === 'function');
  check('showCharChoice がグローバル関数として存在', hasFn);

  // (2a) autoSkipMs:300 → 約300ms後に null へ自動スキップ
  const a = await page.evaluate(async () => {
    window.__autoplay = 0;   // autoplay 分岐を避け、手動プレイ経路を通す
    const t0 = performance.now();
    const res = await window.showCharChoice('テスト', [{ label: 'A を使う' }], 'やめる (Esc)', { autoSkipMs: 300 });
    const dt = performance.now() - t0;
    const dlg = document.getElementById('choiceDialog');
    return { res, dt, closed: !!dlg && !dlg.classList.contains('show'),
            paused: (typeof dialogPaused !== 'undefined' ? dialogPaused : window.dialogPaused) };
  });
  check('(2a) autoSkipMs で null へ自動解決 (使用しない)', a.res === null, 'res=' + JSON.stringify(a.res));
  check('(2a) 自動スキップは概ね設定時間後 (260〜900ms)', a.dt >= 260 && a.dt <= 900, 'dt=' + Math.round(a.dt) + 'ms');
  check('(2a) スキップ後にダイアログが閉じる', a.closed, 'closed=' + a.closed);

  // (2b) タイムアウト前にボタンclick → その index で解決し、タイマーはキャンセルされる
  const b = await page.evaluate(async () => {
    window.__autoplay = 0;
    const p = window.showCharChoice('テスト2', [{ label: '先頭' }, { label: '2番目' }], 'やめる (Esc)', { autoSkipMs: 600 });
    await new Promise(r => setTimeout(r, 80));   // タイムアウト(600ms)前
    const btn = document.querySelector('#choiceDialog .choiceButtons button.choiceYes');
    const hadBtn = !!btn;
    if (btn) btn.click();
    const res = await p;
    await new Promise(r => setTimeout(r, 700));   // 元タイムアウトを超過して待ち、遅延副作用が無いことを確認
    const dlg = document.getElementById('choiceDialog');
    return { res, hadBtn, closed: !!dlg && !dlg.classList.contains('show'),
            paused: (typeof dialogPaused !== 'undefined' ? dialogPaused : window.dialogPaused) };
  });
  check('(2b) click でその index に解決 (入力優先)', b.hadBtn && b.res === 0, 'res=' + JSON.stringify(b.res));
  check('(2b) click 後ダイアログ閉・dialogPaused=false (タイマー解除)', b.closed && b.paused === false,
    'closed=' + b.closed + ' paused=' + b.paused);

  // (2c) 既定 (opts 省略) はタイマー起動せず、400ms経過しても未解決
  const c = await page.evaluate(async () => {
    window.__autoplay = 0;
    let settled = false;
    const p = window.showCharChoice('テスト3', [{ label: 'A' }], 'やめる (Esc)');   // opts 省略=既定
    p.then(() => { settled = true; });
    await new Promise(r => setTimeout(r, 400));
    const stillPending = settled === false;
    // 後始末: キャンセルボタンで解決して閉じる
    const cancel = document.querySelector('#choiceDialog .choiceButtons button.choiceNo');
    if (cancel) cancel.click();
    const res = await p;
    return { stillPending, res };
  });
  check('(2c) 既定は自動スキップ無効 (400ms経過しても未解決=従来挙動)', c.stillPending, 'stillPending=' + c.stillPending);
  check('(2c) キャンセルで null 解決 (後始末)', c.res === null, 'res=' + JSON.stringify(c.res));

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
