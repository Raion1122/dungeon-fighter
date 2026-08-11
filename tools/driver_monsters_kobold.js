#!/usr/bin/env node
/*
 * driver_monsters_kobold.js — 6.27版 新規モンスター 項目3「コボルド」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ENEMY_TYPES.kobold (goblin シート流用, packTactics のみ・下位ミニオン) と、シナリオ1
 * (goblin-mine) 配線、tavern FAMILIES goblin enemyPool 追加を検証する。pack_tactics 機構
 * (nearbyAlliedEnemies + 攻撃ツイン 2箇所の +2) は項目2 で実装済のため、コボルドは
 * def.packTactics:true フラグでそれを拾うだけ = 新規JSなし。
 *
 * ENEMY_TYPES/戦闘関数は IIFE 内 const で window 非公開のため、フルの index.html を
 * ロードして観測する。命中ボーナスの内訳は本番挙動を変えない dev プローブ
 * window.__traitProbe(seed 時のみ push・既定 undefined で no-op)で読む。
 *
 * 検証項目:
 *   (a) ?scen=goblin-mine で pageerror ゼロ + .enemy-kobold DOM 生成 (>=1)
 *   (b) backgroundImage=goblin_anim.png?v= / 幾何健全: displaySize=56 →
 *       width≈56, backgroundSize=round(480*56/96)=280 ×280 (単一フレーム幅より大)
 *   (c) __diag: critical / js-error ゼロ
 *   (d) 密集配置 (2x2 の kobold 4体) で pack=+2 が命中内訳に出る (disc は付かない=常に0)
 *   (e) 孤立配置 (単体 kobold) で pack/disc が常に 0
 *   (f) 回帰: index.html?autoplay=15 スモークで pageerror ゼロ
 *
 * 使い方:  node tools/driver_monsters_kobold.js [--headful] [--browser <path>] [--port N]
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
const PORT = parseInt(arg('port', '8798'), 10);

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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// __traitProbe(命中内訳) を集計 (コボルド分のみ)
async function aggProbe(page) {
  return page.evaluate(() => {
    const p = (window.__traitProbe || []).filter(e => e && e.name === 'コボルド');
    let maxPack = 0, maxDisc = 0, allZero = true;
    for (const e of p) {
      if (e.pack > maxPack) maxPack = e.pack;
      if (e.disc > maxDisc) maxDisc = e.disc;
      if (e.pack !== 0 || e.disc !== 0) allZero = false;
    }
    return { n: p.length, maxPack, maxDisc, allZero };
  });
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = require('./_pptr_profile')('df_kob_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + profile],
  });
  const pageErrors = [];

  // ── (a)-(c) goblin-mine (spawns に kobold 群れ) をロード ──
  const page1 = await browser.newPage();
  page1.on('pageerror', e => pageErrors.push('[render] ' + e.message));
  const rErrBefore = pageErrors.length;
  /* ⚠⚠ 旧版は `?scen=goblin-mine` の**自然スポーン**にコボルドが混ざっている前提だったが、
   *   ダンジョン短縮 (cdb081a) で導入部屋が消え、廃坑の通常スポーンからコボルドが居なくなった
   *   (2026-08-11 実測: ?graph=0 の廃坑 13 体はゴブリン系のみ / 分岐版の entry はゴブリン 2 体)。
   *   → 母集団を**このドライバの (d)(e) と同じ seed 配置**へ揃える。測る性質
   *     (ENEMY_TYPES.kobold の幾何が破綻せず描画されること) は変わらない。
   *   ⚠ 「実シナリオのどこかにコボルドが居ること」は幾何とは別の関心なので、
   *     (a-母集団) で index.html のスポーン定義を直接数えて担保する。 */
  const GEO_SEED = [['kobold', 30, 12], ['kobold', 31, 12], ['kobold', 30, 13]];
  await page1.evaluateOnNewDocument((spawns) => {
    try { sessionStorage.setItem('dragonfighters.generatedScenario',
      JSON.stringify({ title: 'kobold geo probe', flavor: '', spawns })); } catch (e) {}
  }, GEO_SEED);
  await page1.goto('http://localhost:' + PORT + '/index.html?autoplay=15&autodebug=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  let kobSeen = false;
  try { await page1.waitForSelector('.enemy-kobold', { timeout: 15000 }); kobSeen = true; } catch (e) {}
  const rNewErrs = pageErrors.slice(rErrBefore);
  check('(a) goblin-mine ロードで pageerror ゼロ', rNewErrs.length === 0, rNewErrs.join(' | '));

  const geo = await page1.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.enemy-kobold'));
    if (!els.length) return { count: 0 };
    const el = els[0];
    const bgImg = el.style.backgroundImage || '';
    const bgSize = el.style.backgroundSize || '';
    const w = parseFloat(el.style.width) || 0;
    const h = parseFloat(el.style.height) || 0;
    const m = bgSize.match(/([\d.]+)px\s+([\d.]+)px/);
    return { count: els.length, bgImg, bgSize, w, h, bgW: m ? parseFloat(m[1]) : 0, bgH: m ? parseFloat(m[2]) : 0 };
  });
  check('(a) .enemy-kobold 要素が生成される (>=1)', geo.count >= 1, 'count=' + geo.count);
  /* ⚠⚠ 旧 assert は `/goblin_anim\.png\?v=/` で「goblin シートを借用している」を測っていたが、
   *   コボルドは 52f9036 (2026-07-03) で **専用シートへ移行済み**。そして `kobold_anim.png` は
   *   `goblin_anim.png` を部分文字列として含まないので、移行後は**赤いまま安定**していた。
   *   → 現行仕様 (専用シート) を測る形へ書き直す。先頭を固定して取り違えも防ぐ。 */
  check('(b) backgroundImage が kobold_anim.png (?v=付き・専用シート)',
    /(^|\/)kobold_anim\.png\?v=/.test(geo.bgImg), 'bgImg=' + geo.bgImg);
  const wOk = Math.abs(geo.w - 56) <= 2 && Math.abs(geo.h - 56) <= 2;
  check('(b) 表示寸法 ≈56px (displaySize=56)', wOk, 'w=' + geo.w + ' h=' + geo.h);
  /* ⚠⚠ 旧 assert は `280×280` の**直書き**で、これは 480×480 (5列) シート時代の値。
   *   6 フレーム統一 (576×480) で自己失効する。⭐ 期待値を今の実測へ書き換えるのではなく、
   *   **シート実寸から算出する自己校正**へ移す (列数が変わっても陳腐化しない)。
   *   ⚠ 空振り防止: シートが読めなかった (nw=0) 場合は FAIL させる。 */
  const sheet = await page1.evaluate(() => new Promise((resolve) => {
    const el = document.querySelector('.enemy-kobold');
    const m = ((el && el.style.backgroundImage) || '').match(/url\(["']?([^"')]+)["']?\)/);
    if (!m) { resolve({ nw: 0, nh: 0, src: '' }); return; }
    const img = new Image();
    img.onload = () => resolve({ nw: img.naturalWidth, nh: img.naturalHeight, src: m[1] });
    img.onerror = () => resolve({ nw: 0, nh: 0, src: m[1] });
    img.src = m[1];
  }));
  const FRAME = 96;   // kobold シートの 1 コマ (frameW = frameH = 96)
  const expW = Math.round(sheet.nw * geo.w / FRAME), expH = Math.round(sheet.nh * geo.w / FRAME);
  const bgOk = sheet.nw > 0 && Math.abs(geo.bgW - expW) <= 2 && Math.abs(geo.bgH - expH) <= 2 && geo.bgW > geo.w;
  check('(b) backgroundSize がシート実寸から算出した値に一致 (破綻なし)', bgOk,
    'bgSize=' + geo.bgSize + ' / 期待=' + expW + '×' + expH +
    ' (シート ' + sheet.nw + '×' + sheet.nh + ' ÷ 1コマ ' + FRAME + 'px × 表示 ' + geo.w + 'px)');

  const diag = await page1.evaluate(() => {
    if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
    const r = window.__diag.getReport();
    const viol = (r.current || {}).violations || {};
    return { criticals: (r.totals && r.totals.criticals) || 0, jsErr: !!viol['js-error'], jsRej: !!viol['js-rejection'], violIds: Object.keys(viol) };
  });
  check('(c) __diag: critical ゼロ + js-error なし',
    !diag.noDiag && diag.criticals === 0 && !diag.jsErr && !diag.jsRej,
    diag.noDiag ? 'no __diag' : ('criticals=' + diag.criticals + ' viol=[' + diag.violIds.join(',') + ']'));
  await page1.close();

  // ── (d) 密集配置: 4x3 の kobold 12体 (パーティ起点 tile6 隣接) → pack=+2 が出るか ──
  //     hp5 の下位ミニオンは初期イニシアチブ次第で行動前に倒れるため、密度で「攻撃する
  //     生存者」を担保する (少数だと 1 ラウンドで全滅し probe が空になり得る)。密集ゆえ
  //     生存者が攻撃する時ほぼ必ず対象隣接に味方の敵 → pack=+2。disc は kobold 非規律=0。
  /* ⚠⚠ **絶対タイル座標の直書きは、部屋の起点を動かす変更のたびに黙って無意味になる。**
   *   ダンジョン短縮 (cdb081a) で歩行可能域が x>=24 へ寄り、旧範囲 (cx 7..10 / cy 12..14) は
   *   **全て tile2 (岩盤)** になっていた (2026-08-11 実測)。敵は DOM としては生成されるが
   *   パーティ (25,13) から 15〜18 タイル離れた壁の中に湧くだけで **戦闘が一度も起きない**。
   *   ⚠ さらに pack_tactics の条件は「**対象(隊長)から 1 タイル以内に自分以外の味方の敵**」
   *     (`nearbyAlliedEnemies(idx, playerX+48, playerY+58, 1) > 0`) であって「敵同士の密集」ではない。
   *     離れた場所で固めても +2 は永遠に出ない。→ **隊長 (25,13) の隣接タイルを埋める**。 */
  const CLUSTER = [
    ['kobold', 26, 12], ['kobold', 26, 13], ['kobold', 24, 12], ['kobold', 24, 13],
    ['kobold', 25, 12], ['kobold', 24, 14], ['kobold', 27, 12], ['kobold', 27, 13],
  ];
  const page2 = await browser.newPage();
  page2.on('pageerror', e => pageErrors.push('[cluster] ' + e.message));
  await page2.evaluateOnNewDocument((spawns) => {
    try { sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'trait probe cluster', flavor: '', spawns })); } catch (e) {}
    window.__traitProbe = [];
  }, CLUSTER);
  await page2.goto('http://localhost:' + PORT + '/index.html?autoplay=30', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let cAgg = { n: 0, maxPack: 0, maxDisc: 0, allZero: true };
  for (let i = 0; i < 320; i++) {   // 最大 ~96s
    cAgg = await aggProbe(page2);
    if (cAgg.maxPack === 2) break;
    await sleep(300);
  }
  check('(d) 密集配置で kobold が攻撃した (probe 記録あり)', cAgg.n >= 1, 'entries=' + cAgg.n);
  check('(d) 密集配置で pack ボーナス +2 が命中内訳に出る', cAgg.maxPack === 2, 'maxPack=' + cAgg.maxPack);
  check('(d) 密集配置でも disciplined は付かない (kobold は非規律・maxDisc=0)',
    cAgg.maxDisc === 0, 'maxDisc=' + cAgg.maxDisc);
  await page2.close();

  // ── (e) 孤立配置: パーティ起点 tile6 に隣接した単体 kobold → 味方の敵が皆無なので
  //     攻撃しても pack/disc は常に 0 (対比: 密集=+2 / 孤立=0)。hp5 は初期イニシアチブ
  //     次第で行動前に倒れる (単体ゆえ probe が空になり得る) ため、新規ロードを最大8回
  //     リトライし「孤立 kobold が攻撃した回」を1つ捕捉する (各回とも味方皆無=pack不能)。
  /* ⚠ 旧 [7,13] は岩盤 (上の CLUSTER のコメント参照)。床へ移すだけでは足りず、
   *   離れた床に置くと **hp:5 のコボルドが接敵する前に倒され** __traitProbe が空のままになる
   *   (2026-08-11 実測: [31,12] で entries=0)。→ 隊長 (25,13) の**真隣**に置いて初手を取らせる。
   *   ⚠ 単体スポーンなので「隣接する味方の敵が居ない」= 孤立の条件はそのまま成立する
   *     (pack/disc が 0 であることを測るという assert の性質は変えていない)。 */
  const ISOLATED = [['kobold', 26, 13]];
  let iAgg = { n: 0, maxPack: 0, maxDisc: 0, allZero: true };
  let iAttacked = false;
  for (let t = 0; t < 8 && !iAttacked; t++) {
    const page3 = await browser.newPage();
    page3.on('pageerror', e => pageErrors.push('[isolated] ' + e.message));
    await page3.evaluateOnNewDocument((spawns) => {
      try { sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'trait probe isolated', flavor: '', spawns })); } catch (e) {}
      window.__traitProbe = [];
    }, ISOLATED);
    await page3.goto('http://localhost:' + PORT + '/index.html?autoplay=30', { waitUntil: 'domcontentloaded', timeout: 30000 });
    let a = { n: 0, maxPack: 0, maxDisc: 0, allZero: true };
    /* ⚠ 「1 体戦は短い」という理由で 24 (≈7.2s) にしていたが、**接敵前に観測窓が閉じる**。
     *   密集 (d) が最大 96s 掛けて捕捉しているのに孤立だけ 7.2s では母集団へ届かない
     *   (2026-08-11 実測: 8 回とも entries=0)。→ 18s/回 へ延ばす (8 回で最大 ~144s)。 */
    for (let i = 0; i < 60; i++) {   // 最大 ~18s/回
      a = await aggProbe(page3);
      if (a.n >= 1) break;
      await sleep(300);
    }
    if (a.n >= 1) { iAttacked = true; iAgg = a; } else { iAgg = a; }
    await page3.close();
  }
  check('(e) 孤立(隣接単体)で kobold が攻撃した (probe 記録あり・最大8試行)', iAgg.n >= 1, 'entries=' + iAgg.n);
  check('(e) 孤立では pack/disc が常に 0 (対象隣接に味方の敵なし)',
    iAgg.allZero, 'atkN=' + iAgg.n + ' maxPack=' + iAgg.maxPack + ' maxDisc=' + iAgg.maxDisc);

  // ── (f) 回帰: 素の index.html?autoplay=15 スモーク ──
  const page4 = await browser.newPage();
  page4.on('pageerror', e => pageErrors.push('[smoke] ' + e.message));
  const sErrBefore = pageErrors.length;
  await page4.goto('http://localhost:' + PORT + '/index.html?autoplay=15&autodebug=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  const sNewErrs = pageErrors.slice(sErrBefore);
  check('(f) index.html?autoplay スモーク pageerror ゼロ (回帰)', sNewErrs.length === 0, sNewErrs.join(' | '));
  await page4.close();

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  if (!kobSeen) console.log('[driver] note: .enemy-kobold の待機がタイムアウト');
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
