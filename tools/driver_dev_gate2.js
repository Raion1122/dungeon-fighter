#!/usr/bin/env node
/*
 * driver_dev_gate2.js — 「出荷前の大掃除」第2弾 検証ドライバ
 *
 *   node tools/driver_dev_gate2.js [--headful] [--browser <path>] [--port N] [--baseline <path>]
 *
 * 対象 (driver_dev_gate.js が扱った tavern.html の 5 ボタンとは別件):
 *   ① index.html の開始画面デバッグ 2 ボタンを localStorage['df.devMode'] ゲート配下へ (既定で非表示)
 *   ② tavern.html の DF_DEV_MAGIC_SHOP (gated 装備 1G 陳列) を常時 true → dev モード連動へ
 *   ③ URL チート 5 種 (?evade / ?intel / ?wagonchance / ?givemagic / ?unlockall) を dev ゲート配下へ
 *
 * ⚠️ 本ドライバの肝は 4 つ:
 *
 *   (1) **負のコントロールを同一 run に内包する**。baseline (HEAD) を /__baseline/ で同時に配信し、
 *       「baseline では 2 ボタンが見えている / チートが効く」を *正の assert* として測る。
 *       別 run で FAIL を目視する方式だと空振り (assert が何も測っていない) を検出できない。
 *
 *   (2) **localStorage はオリジン単位で全ページ共有**。work と baseline は同じ localhost:PORT から
 *       配信されるので df.devMode が相互に漏れる。測定のたびに必ず全消し → 必要なら種を蒔く、の順で作る。
 *       ⚠ evaluateOnNewDocument は **リロードのたび** に走るため、この用途では使わない。
 *
 *   (3) **インライン display:flex のソース静的検査**。CSS ゲートはインライン style に無条件で負けるため、
 *       「CSS は書いたのに何も起きない」まま計算値だけ見て PASS する事故が起こりうる。
 *
 *   (4) **?autoplay / ?autodebug は dev 扱いにする救済がある**ことを測る。ヘッドレス検証ドライバ群は
 *       URL 直指定に依存しており、dev モード必須にすると「チートが黙って効かない」= fail-open で
 *       測定値が壊れる静かな失敗になる (例: 勝率計測の ?intel=0)。
 *
 * ⚠️ getComputedStyle(el).display は *その要素自身* の計算値を返す (祖先が非表示でも 'flex' のまま)。
 *    開始画面を進めずに測れるのはこの性質のおかげ。
 *
 * ⛔ ?autoplay / ?autodebug / ?scen / ?diag 自体は **ゲート対象外**。(D6)(I14) で毎回生存を確かめる。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT    = parseInt(arg('port', '8841'), 10);
// ⚠ path.resolve を通す。生の '/' 区切りのまま持つと path.join が返す '\' 区切りと
//    startsWith 比較が食い違い、baseline 側が丸ごと 404 になる (負のコントロールが静かに死ぬ)。
const BASELINE = path.resolve(arg('baseline', path.join(os.tmpdir(), 'df_cleanup2_base')));
// ⚠⚠ baseline は **cdb43f5^ = 0c06067** (df.devMode ゲートが入る直前)。歴史的事実へのピン留めなので
//    陳腐化しない = 負のコントロール専用の基準 (_golden.js ヘッダ参照)。
//    ⚠ 旧実装は「既に在るディレクトリ」を前提に exit 3 していた。%TEMP% 掃除で消えると
//      **ドライバごと起動しなくなる** (2026-08-06 に実際に EXIT=3)。
//      → driver_field_step2/step3 と同じく **rev から自分で作る**。
const BASELINE_REV = arg('baseline-rev', '0c06067');

function prepareBaseline() {
  const marker = path.join(BASELINE, 'index.html');
  if (fs.existsSync(marker)) {
    let head = '';
    try { head = execFileSync('git', ['-C', BASELINE, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) {}
    if (head && (BASELINE_REV.indexOf(head) === 0 || head.indexOf(BASELINE_REV) === 0)) {
      console.log('[driver] baseline worktree 再利用: ' + BASELINE + ' @ ' + head);
      return;
    }
    console.log('[driver] baseline worktree が別リビジョン (' + head + ') なので作り直す');
    try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', BASELINE], { encoding: 'utf8' }); } catch (e) {}
  }
  console.log('[driver] baseline worktree を作成: ' + BASELINE + ' @ ' + BASELINE_REV);
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', BASELINE, BASELINE_REV],
               { encoding: 'utf8', stdio: 'pipe' });
}

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
        let base = ROOT;
        if (u.startsWith('/__baseline/')) { base = BASELINE; u = u.slice('/__baseline'.length); }
        if (u === '/') u = '/index.html';
        const fp = path.join(base, u);
        if (!fp.startsWith(base) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
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
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const workErrors = [];
const baseErrors = [];

// 測定用ページを作る。⚠ localStorage はオリジン共有なので、まず軽いページを開いて全消し →
//    必要なら種 (df.devMode) を蒔く → 本命 URL へ、の順にする。
async function openClean(browser, urlPath, opts) {
  const o = opts || {};
  const isBase = urlPath.startsWith('/__baseline/');
  const page = await browser.newPage();
  page.on('pageerror', e => (isBase ? baseErrors : workErrors).push(e.message));
  // dev パラメータを無視したときの console.warn を拾う (silent fail-open 検出の要)
  const warns = [];
  page.__warns = warns;
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'warn') warns.push(m.text()); });
  // 同一オリジンの軽量ファイルで localStorage ハンドルを得る (index/tavern を開くと副作用が乗る)
  await page.goto('http://localhost:' + PORT + '/js/skill-check.js', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((dev) => {
    try {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');   // 前口上を飛ばす
      if (dev) localStorage.setItem('df.devMode', '1');
    } catch (e) {}
  }, !!o.dev);
  await page.goto('http://localhost:' + PORT + urlPath, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(o.wait || 800);
  return page;
}

const PROBE_INDEX = () => {
  const row = document.getElementById('debugEvadeRow');
  const btn = document.querySelector('.debugBtn');
  return {
    rowExists:   !!row,
    rowDisplay:  row ? getComputedStyle(row).display : null,
    // baseline には #debugEvadeRow が無いので、ボタンの親 div を直接測る (両側を同じ物差しで比べる)
    parentDisplay: btn ? getComputedStyle(btn.parentElement).display : null,
    btnCount:    document.querySelectorAll('.debugBtn').length,
    devClass:    document.body.classList.contains('dev-mode'),
    devMode:     window.__dfDevMode,
    devUnlocked: (typeof window.__dfDevUnlocked === 'function') ? window.__dfDevUnlocked() : '(absent)',
    evadeAlways: !!window.__evadeAlways,
    evadeArrows: !!window.__evadeArrowsOnly,
    autoplay:    window.__autoplay,
    lsDev:       (function () { try { return localStorage.getItem('df.devMode'); } catch (e) { return '(err)'; } })(),
  };
};

const PROBE_TAVERN = () => {
  const L = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return null; } };
  const row = document.getElementById('debugEvadeRow');
  const arow = document.getElementById('debugAutoplayRow');
  return {
    accIds:      L('dragonfighters.accessoryIds', '[]') || [],
    cleared:     L('dragonfighters.cleared', '[]') || [],
    devClass:    document.body.classList.contains('dev-mode'),
    devMode:     window.__dfDevMode,
    devUnlocked: (typeof window.__dfDevUnlocked === 'function') ? window.__dfDevUnlocked() : '(absent)',
    evadeRow:    row ? getComputedStyle(row).display : null,
    autoRow:     arow ? getComputedStyle(arow).display : null,
    lsDev:       (function () { try { return localStorage.getItem('df.devMode'); } catch (e) { return '(err)'; } })(),
  };
};

const MAIN6 = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const has6 = (arr) => MAIN6.every(id => (arr || []).includes(id));
const hasRing = (arr) => (arr || []).includes('ring-free-action');

(async () => {
  try { prepareBaseline(); } catch (e) {
    console.error('[driver] baseline worktree を用意できません: ' + BASELINE + ' @ ' + BASELINE_REV);
    console.error('         ' + (e && e.message ? e.message : e));
    process.exit(3);
  }
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  baseline=' + BASELINE + '  :' + PORT);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    // ─────────── (A) index.html 素の配布物 = dev OFF ───────────
    console.log('\n── (A) index.html 素の配布物 (dev OFF) ──');
    {
      const p = await openClean(browser, '/index.html');
      const g = await p.evaluate(PROBE_INDEX);
      check('(A1) #debugEvadeRow が存在する (消したのではなく隠した)', g.rowExists === true);
      check('(A2) デバッグ行が display:none で非表示', g.rowDisplay === 'none', 'display=' + g.rowDisplay);
      check('(A3) body に dev-mode クラスが付いていない', g.devClass === false);
      check('(A4) デバッグボタンは DOM に 2 個残っている', g.btnCount === 2, 'count=' + g.btnCount);
      check('(A5) window.__dfDevMode === false', g.devMode === false, 'devMode=' + g.devMode);
      check('(A6) window.__dfDevUnlocked() === false', g.devUnlocked === false, 'unlocked=' + g.devUnlocked);
      check('(A7) df.devMode が localStorage に焼かれていない', g.lsDev === null, 'lsDev=' + g.lsDev);
      await p.close();
    }

    // ─────────── (B) 負のコントロール: baseline (HEAD) では見えている ───────────
    console.log('\n── (B) 負のコントロール: baseline(HEAD) ──');
    {
      const p = await openClean(browser, '/__baseline/index.html');
      const g = await p.evaluate(PROBE_INDEX);
      check('(B1) baseline には #debugEvadeRow が存在しない (= 改修前)', g.rowExists === false);
      check('(B2) baseline ではデバッグ行が display:flex で見えている',
        g.parentDisplay === 'flex', 'parentDisplay=' + g.parentDisplay);
      check('(B3) baseline には window.__dfDevMode が無い', g.devMode === undefined, 'devMode=' + g.devMode);
      check('(B4) baseline には window.__dfDevUnlocked が無い', g.devUnlocked === '(absent)');
      check('(B5) baseline にもボタンは 2 個 (同じ物差しで比べている)', g.btnCount === 2, 'count=' + g.btnCount);
      await p.close();
    }

    // ─────────── (C) dev ON (?dev=1) で従来どおり使える ───────────
    console.log('\n── (C) dev ON (?dev=1) ──');
    {
      const p = await openClean(browser, '/index.html?dev=1');
      const g = await p.evaluate(PROBE_INDEX);
      check('(C1) ?dev=1 で body.dev-mode が付く', g.devClass === true);
      check('(C2) デバッグ行が display:flex で現れる', g.rowDisplay === 'flex', 'display=' + g.rowDisplay);
      check('(C3) df.devMode が localStorage に焼かれている', g.lsDev === '1', 'lsDev=' + g.lsDev);
      check('(C4) window.__dfDevUnlocked() === true', g.devUnlocked === true);
      // 焼き込み済みなので、URL パラメータ無しでも維持されるはず
      await p.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(700);
      const g2 = await p.evaluate(PROBE_INDEX);
      check('(C5) 焼き込み後は素の URL でも表示が続く (毎回 ?dev を付けなくてよい)',
        g2.rowDisplay === 'flex' && g2.devClass === true, 'display=' + g2.rowDisplay);
      // ?dev=0 で解除
      await p.goto('http://localhost:' + PORT + '/index.html?dev=0', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(700);
      const g3 = await p.evaluate(PROBE_INDEX);
      check('(C6) ?dev=0 で OFF に戻り行が隠れる',
        g3.rowDisplay === 'none' && g3.lsDev === null, 'display=' + g3.rowDisplay + ' lsDev=' + g3.lsDev);
      await p.close();
    }

    // ─────────── (D) URL チート ?evade のゲート (挙動) ───────────
    console.log('\n── (D) ?evade のゲート (挙動で測る) ──');
    {
      const p = await openClean(browser, '/index.html?evade=all');
      const g = await p.evaluate(PROBE_INDEX);
      check('(D1) dev OFF では ?evade=all が効かない', g.evadeAlways === false, 'evadeAlways=' + g.evadeAlways);
      // ★ silent fail-open 防止: 無視したことが必ず痕跡として残る
      check('(D1b) 無視した旨の console.warn が出ている',
        p.__warns.some(t => t.indexOf('?evade') >= 0 && t.indexOf('無視') >= 0),
        p.__warns.slice(0, 2).join(' | ') || '(warn なし)');
      await p.close();
    }
    {
      const p = await openClean(browser, '/__baseline/index.html?evade=all');
      const g = await p.evaluate(PROBE_INDEX);
      check('(D2) 負のコントロール: baseline では ?evade=all が効く',
        g.evadeAlways === true, 'evadeAlways=' + g.evadeAlways);
      await p.close();
    }
    {
      const p = await openClean(browser, '/index.html?evade=all', { dev: true });
      const g = await p.evaluate(PROBE_INDEX);
      check('(D3) dev ON なら ?evade=all は従来どおり効く', g.evadeAlways === true);
      await p.close();
    }
    {
      const p = await openClean(browser, '/index.html?evade=arrow', { dev: true });
      const g = await p.evaluate(PROBE_INDEX);
      check('(D4) dev ON なら ?evade=arrow も効く', g.evadeArrows === true);
      await p.close();
    }
    {
      // ★ 検証ハーネス救済: dev OFF でも ?autoplay があればチートが効く
      const p = await openClean(browser, '/index.html?autoplay=3&evade=all');
      const g = await p.evaluate(PROBE_INDEX);
      check('(D5) dev OFF でも ?autoplay 併用ならチートが効く (ドライバ fail-open 防止)',
        g.evadeAlways === true, 'evadeAlways=' + g.evadeAlways);
      check('(D6) ?autoplay 自体はゲートされず生きている', g.autoplay === 3, 'autoplay=' + g.autoplay);
      check('(D6b) 効いたときは警告を出さない', p.__warns.every(t => t.indexOf('無視') < 0),
        p.__warns.slice(0, 2).join(' | ') || '(warn なし)');
      await p.close();
    }
    {
      // ★ ?diag 救済: %TEMP%/df_pptr のドライバに多い ?diag=1&intel=0 形式 (autoplay 無し) を守る
      const p = await openClean(browser, '/index.html?diag=1&evade=all');
      const g = await p.evaluate(PROBE_INDEX);
      check('(D7) dev OFF でも ?diag 併用ならチートが効く (?diag=1&intel=0 形式のドライバ救済)',
        g.evadeAlways === true, 'evadeAlways=' + g.evadeAlways);
      await p.close();
    }

    // ─────────── (E) tavern: DF_DEV_MAGIC_SHOP (1G 陳列) の dev 連動 ───────────
    // 観測は accessoryIds への自動付与 (gated 指輪) を代理指標にする。
    // 同じ `GIVEMAGIC || DF_DEV_MAGIC_SHOP` 条件から書かれるので、常時 true が消えたことを直接測れる。
    console.log('\n── (E) tavern: 1G 陳列 (DF_DEV_MAGIC_SHOP) の dev 連動 ──');
    {
      const p = await openClean(browser, '/tavern.html');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(E1) dev OFF では gated アクセが自動付与されない', hasRing(g.accIds) === false,
        'accIds=' + JSON.stringify(g.accIds));
      await p.close();
    }
    {
      const p = await openClean(browser, '/__baseline/tavern.html');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(E2) 負のコントロール: baseline では dev OFF でも自動付与される',
        hasRing(g.accIds) === true, 'accIds=' + JSON.stringify(g.accIds));
      await p.close();
    }
    {
      const p = await openClean(browser, '/tavern.html', { dev: true });
      const g = await p.evaluate(PROBE_TAVERN);
      check('(E3) dev ON なら従来どおり自動付与される', hasRing(g.accIds) === true);
      await p.close();
    }

    // ─────────── (F) tavern: ?givemagic のゲート ───────────
    console.log('\n── (F) tavern: ?givemagic のゲート ──');
    {
      const p = await openClean(browser, '/tavern.html?givemagic');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(F1) dev OFF では ?givemagic が効かない', hasRing(g.accIds) === false,
        'accIds=' + JSON.stringify(g.accIds));
      await p.close();
    }
    {
      const p = await openClean(browser, '/__baseline/tavern.html?givemagic');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(F2) 負のコントロール: baseline では ?givemagic が効く', hasRing(g.accIds) === true);
      await p.close();
    }
    {
      const p = await openClean(browser, '/tavern.html?givemagic', { dev: true });
      const g = await p.evaluate(PROBE_TAVERN);
      check('(F3) dev ON なら ?givemagic は従来どおり効く', hasRing(g.accIds) === true);
      await p.close();
    }

    // ─────────── (G) tavern: ?unlockall のゲート ───────────
    console.log('\n── (G) tavern: ?unlockall のゲート ──');
    {
      const p = await openClean(browser, '/tavern.html?unlockall=1');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(G1) dev OFF では ?unlockall=1 が効かない (段階解放が守られる)',
        has6(g.cleared) === false, 'cleared=' + JSON.stringify(g.cleared));
      await p.close();
    }
    {
      const p = await openClean(browser, '/__baseline/tavern.html?unlockall=1');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(G2) 負のコントロール: baseline では ?unlockall=1 で 6 本クリア扱いになる',
        has6(g.cleared) === true, 'cleared=' + JSON.stringify(g.cleared));
      await p.close();
    }
    {
      const p = await openClean(browser, '/tavern.html?unlockall=1', { dev: true });
      const g = await p.evaluate(PROBE_TAVERN);
      check('(G3) dev ON なら ?unlockall=1 は従来どおり効く', has6(g.cleared) === true);
      await p.close();
    }
    {
      const p = await openClean(browser, '/tavern.html?autoplay=3&unlockall=1');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(G4) dev OFF でも ?autoplay 併用なら効く (ドライバ救済・tavern 側)',
        has6(g.cleared) === true, 'cleared=' + JSON.stringify(g.cleared));
      await p.close();
    }
    {
      const p = await openClean(browser, '/tavern.html?diag=1&givemagic');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(G5) dev OFF でも ?diag 併用なら ?givemagic が効く (tavern 側の ?diag 救済)',
        hasRing(g.accIds) === true, 'accIds=' + JSON.stringify(g.accIds));
      await p.close();
    }
    {
      const p = await openClean(browser, '/tavern.html?givemagic');
      check('(G6) tavern でも無視時に console.warn が出る',
        p.__warns.some(t => t.indexOf('?givemagic') >= 0 && t.indexOf('無視') >= 0),
        p.__warns.slice(0, 2).join(' | ') || '(warn なし)');
      await p.close();
    }

    // ─────────── (H) 回帰: tavern の既存 5 ボタンゲート (第1弾) が壊れていない ───────────
    console.log('\n── (H) 回帰: tavern 既存ゲート (第1弾) ──');
    {
      const p = await openClean(browser, '/tavern.html');
      const g = await p.evaluate(PROBE_TAVERN);
      check('(H1) tavern デバッグ行は dev OFF で非表示のまま',
        g.evadeRow === 'none' && g.autoRow === 'none', 'evade=' + g.evadeRow + ' auto=' + g.autoRow);
      await p.close();
    }
    {
      const p = await openClean(browser, '/tavern.html', { dev: true });
      const g = await p.evaluate(PROBE_TAVERN);
      check('(H2) tavern デバッグ行は dev ON で表示される',
        g.evadeRow === 'flex' && g.autoRow === 'flex', 'evade=' + g.evadeRow + ' auto=' + g.autoRow);
      await p.close();
    }

    // ─────────── (I) 静的ソース検査 ───────────
    console.log('\n── (I) 静的ソース検査 ──');
    {
      const idx  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const tav  = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
      const bIdx = fs.readFileSync(path.join(BASELINE, 'index.html'), 'utf8');
      const bTav = fs.readFileSync(path.join(BASELINE, 'tavern.html'), 'utf8');

      const rowTag = (idx.match(/<div id="debugEvadeRow"[^>]*>/) || [''])[0];
      check('(I1) #debugEvadeRow の div が存在する', !!rowTag, rowTag.slice(0, 80));
      check('(I2) その div のインライン style に display:flex が無い',
        !!rowTag && !/display\s*:\s*flex/.test(rowTag), rowTag.slice(0, 80));
      check('(I3) 負のコントロール: baseline の同じ div にはインライン display:flex がある',
        /<div style="margin-top:14px;display:flex;/.test(bIdx));
      check('(I4) CSS ゲートの既定 none と dev-mode の flex が両方書かれている',
        /#debugEvadeRow\s*\{\s*display:\s*none;\s*\}/.test(idx) &&
        /body\.dev-mode\s+#debugEvadeRow\s*\{\s*display:\s*flex;\s*\}/.test(idx));
      check('(I5) index.html のキーは "df.devMode" (dragonfighters. prefix の外)',
        /"df\.devMode"/.test(idx) && !/dragonfighters\.devMode/.test(idx));
      check('(I6) index.html に __dfDevUnlocked が定義されている',
        /window\.__dfDevUnlocked\s*=\s*function/.test(idx));
      check('(I7) tavern.html に __dfDevUnlocked が定義されている',
        /window\.__dfDevUnlocked\s*=\s*function/.test(tav));
      check('(I8) ?intel が __dfDevCheat ゲート配下にある',
        /_p\.has\("intel"\)\s*&&\s*window\.__dfDevCheat\("intel"\)/.test(idx));
      check('(I9) 負のコントロール: baseline の ?intel は無ゲート',
        /_p\.has\("intel"\)\)\s*__intelOverride/.test(bIdx));
      check('(I10) ?wagonchance が __dfDevCheat ゲート配下にある',
        /_pw\.has\("wagonchance"\)\s*&&\s*window\.__dfDevCheat\("wagonchance"\)/.test(idx));
      check('(I11) 負のコントロール: baseline の ?wagonchance は無ゲート',
        /_pw\.has\("wagonchance"\)\)\s*\{/.test(bIdx));
      check('(I12) DF_DEV_MAGIC_SHOP が dev 連動 (常時 true ではない)',
        /const DF_DEV_MAGIC_SHOP\s*=\s*!!window\.__dfDevMode;/.test(tav) &&
        !/const DF_DEV_MAGIC_SHOP\s*=\s*true;/.test(tav));
      check('(I13) 負のコントロール: baseline の DF_DEV_MAGIC_SHOP は常時 true',
        /const DF_DEV_MAGIC_SHOP\s*=\s*true;/.test(bTav));
      check('(I14) ?autoplay / ?autodebug はゲートしていない (検証基盤の動力源)',
        /p\.get\("autoplay"\)/.test(idx) && /p\.get\("autodebug"\)/.test(idx) &&
        !/get\("autoplay"\)[\s\S]{0,40}__dfDevUnlocked/.test(idx));
      check('(I15) 撤退スイッチ (?field / ?sky / ?escort) は残してある',
        /get\("field"\)/.test(idx) && /get\("sky"\)/.test(idx) && /get\("escort"\)/.test(idx));
      check('(I16) 観測シーム (__narr / __speech / __camProbe) は残してある',
        /window\.__narr\s*=/.test(idx) && /window\.__speech\s*=/.test(idx) && /window\.__camProbe\s*=/.test(idx));
      check('(I17) tavern の観測シーム __pmTest は残してある', /window\.__pmTest\s*=/.test(tav));
      check('(I18) 救済条件に ?diag が入っている (index/tavern 両方)',
        /s\.has\("autoplay"\)\s*\|\|\s*s\.has\("autodebug"\)\s*\|\|\s*s\.has\("diag"\)/.test(idx) &&
        /s\.has\("autoplay"\)\s*\|\|\s*s\.has\("autodebug"\)\s*\|\|\s*s\.has\("diag"\)/.test(tav));
      check('(I19) __dfDevCheat が index/tavern 両方に定義されている',
        /window\.__dfDevCheat\s*=\s*function/.test(idx) && /window\.__dfDevCheat\s*=\s*function/.test(tav));
      check('(I20) ゲート 5 種すべてが __dfDevCheat 経由 (書き漏れ検出)',
        /__dfDevCheat\("intel"\)/.test(idx) && /__dfDevCheat\("wagonchance"\)/.test(idx) &&
        /__dfDevCheat\("evade"\)/.test(idx) && /__dfDevCheat\("givemagic"\)/.test(tav) &&
        /__dfDevCheat\("unlockall"\)/.test(tav));
    }

    // ─────────── (J) 回帰: JS エラーゼロ ───────────
    console.log('\n── (J) 回帰 ──');
    check('(J1) 作業ツリー側で JS エラーが出ていない', workErrors.length === 0,
      workErrors.slice(0, 3).join(' | '));
    console.log('       (参考) baseline 側 JS エラー数 = ' + baseErrors.length +
      (baseErrors.length ? ' [' + baseErrors.slice(0, 2).join(' | ') + ']' : ''));

  } catch (e) {
    console.error('\n[driver] 例外: ' + (e && e.stack || e));
    results.push({ name: '(FATAL) ドライバが例外で停止', ok: false, detail: String(e && e.message || e) });
  } finally {
    await browser.close();
    srv.close();
  }

  const ok = results.filter(r => r.ok).length;
  const ng = results.filter(r => !r.ok);
  console.log('\n══════════ 結果: ' + ok + '/' + results.length + ' PASS ══════════');
  if (ng.length) {
    console.log('NG 一覧:');
    for (const r of ng) console.log('  - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  process.exit(ng.length ? 1 : 0);
})();
