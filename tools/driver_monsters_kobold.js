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
 *          node tools/driver_monsters_kobold.js --negative   (素 + 変異 nopack:10623 / allyside:10624 を子プロセスで)
 *
 * [#91 §5-1] (d)(e) の配置は HP 999 に吊り上げる (先に倒されて隣が空く/窓が閉じる揺れを根から止める)。
 *   装置 assert (d0)(e0) で「吊り上げが効いた」「仲間側の攻撃の口を実際に観測した」を測る。
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
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const T_START = Date.now();

/* ══════════════════════════════════════════════════════════════════════════════
 * [#91 §8 §2] 配信スナップショット + 変異 (負のコントロール)。形は driver_speech_engine.js の --negative を写した:
 *   起動時に index.html を 1 回だけ読んで凍結し、変異はその文字列へ実行時に注入して配る (⛔ 本番ファイルは書き換えない)。
 *   --negative = 素の基準 1 回 + 変異ごとに子プロセス 1 本。担当と**完全一致**・注入行の到達 > 0・担当外の赤 0 を要求する。
 *   注入行の到達は window.__MUTHIT__<key> に数え、各ページを閉じる前に回収して合算する。
 * ══════════════════════════════════════════════════════════════════════════════ */
const PRISTINE_INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
const HITVAR = (k) => 'window.__MUTHIT__' + k;
const HIT = (k) => '(' + HITVAR(k) + ' = (' + HITVAR(k) + ' || 0) + 1)';
const MUTATIONS = {
  /* nearbyAlliedEnemies が誰も数えない (= pack_tactics が永久に付かない)。印は数え損ねた 1 体ごと */
  nopack: [
    { from: 'if (tileChebyshev(cx, cy, oCX, oCY) <= tiles) n++;',
      to: 'if ((' + HIT('nopack') + ', false)) n++;   /* ★変異nopack */' }],
  /* 仲間を狙う攻撃だけ「対象の隣に味方の敵」を見ずに常に +2 (孤立でも pack が付く)。印は判定 1 回ごと */
  allyside: [
    { from: 'nearbyAlliedEnemies(enemyIdx, tCX, tCY, 1) > 0',
      to: '(' + HIT('allyside') + ', true) /* ★変異allyside */' }],
};
const MUT_PORT = { nopack: 10623, allyside: 10624 };
const PORT = parseInt(arg('port', MUTATE ? String(MUT_PORT[MUTATE] || 10623) : '8798'), 10);
/* 変異 → 赤くなるべき check (担当)。check の名前で引く */
const D_PACK = '(d) 密集配置で pack ボーナス +2 が命中内訳に出る';
const E_ZERO = '(e) 孤立では pack/disc が常に 0 (対象隣接に味方の敵なし)';
const NEG_EXPECT = {
  nopack: [D_PACK],
  allyside: [E_ZERO],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
if (countOf(PRISTINE_INDEX, '__MUTHIT__') !== 0) vetFail('原本に __MUTHIT__ が在る');
{
  /* ⭐ #89 の教訓: 自分のアンカーが他の tools の文字列に出てこないこと (同じ行を測る本と衝突しない) */
  const self = path.basename(__filename);
  const peers = fs.readdirSync(__dirname).filter((f) => /\.(js|mjs|py|ps1)$/.test(f) && f !== self);
  for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
    const c = countOf(PRISTINE_INDEX, e.from);
    if (c !== 1) vetFail('変異 ' + k + ' の注入点が 1 箇所ではない (index.html に ' + c + ' 件)');
    if (countOf(PRISTINE_INDEX, e.to) !== 0) vetFail('変異 ' + k + ' の注入文字列が原本に既に在る');
    if (e.to.indexOf('__MUTHIT__' + k) < 0) vetFail('変異 ' + k + ' に実行の印が無い');
    const core = e.from.trim();
    const clash = peers.filter((f) => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8').indexOf(core) >= 0; } catch (x) { return false; } });
    if (clash.length) vetFail('変異 ' + k + ' のアンカーが他の tools に出てくる: ' + clash.join(','));
  }
}
function servedIndex(key) {
  if (!key) return PRISTINE_INDEX;
  let s = PRISTINE_INDEX;
  for (const e of MUTATIONS[key]) s = s.split(e.from).join(e.to);
  if (s === PRISTINE_INDEX) vetFail('変異 ' + key + ' が何も変えていない');
  if (s.split('\n').length !== PRISTINE_INDEX.split('\n').length) vetFail('変異 ' + key + ' が行数を変えた');
  return s;
}
const SERVED_INDEX = servedIndex(MUTATE);

/* --negative: 自分を子プロセスで 1 本ずつ起こし、最後の 1 行 (__RESULT__{json}) で判定する */
if (NEGATIVE) {
  const { spawnSync } = require('child_process');
  const runChild = (extra, label) => {
    console.log('\n[vet] ════════ ' + label + ' ════════');
    const r = spawnSync(process.execPath, [__filename].concat(extra).concat(HEADFUL ? ['--headful'] : []),
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
    const out = (r.stdout || '') + (r.stderr || '');
    process.stdout.write(out.split('\n').filter((l) => l.indexOf('__RESULT__') !== 0).map((l) => '    ' + l).join('\n') + '\n');
    const line = out.split('\n').reverse().find((l) => l.indexOf('__RESULT__') === 0);
    if (!line) return null;
    try { return JSON.parse(line.slice('__RESULT__'.length)); } catch (e) { return null; }
  };
  let exitCode = 0;
  const R0 = runChild(['--port', String(PORT)], '(素・基準) port ' + PORT);
  const red0 = R0 ? R0.results.filter((x) => !x.ok).map((x) => x.name) : null;
  if (!R0 || red0.length || Object.keys(R0.hits).length) {
    console.error('[vet] ⛔ 素の基準で FAIL がある / 結果が取れない / 変異の印が出た (' + JSON.stringify(R0 && R0.hits) + ') — 先にそれを直すこと (変異は走らせない)'
      + (red0 && red0.length ? '  赤=' + red0.join(' | ') : ''));
    exitCode = 1;
  } else {
    const names0 = R0.results.map((x) => x.name);
    const report = [];
    for (const key of MUT_ORDER) {
      const R = runChild(['--mutate', key, '--port', String(MUT_PORT[key])], '[変異 ' + key + '] port ' + MUT_PORT[key]);
      const want = NEG_EXPECT[key] || [];
      const red = R ? R.results.filter((x) => !x.ok).map((x) => x.name) : [];
      const hit = R ? (R.hits[key] || 0) : 0;
      const bootOk = !!R && R.results.filter((x) => /^\(a\)/.test(x.name)).every((x) => x.ok);
      const absent = R ? names0.filter((n) => !R.results.some((x) => x.name === n)) : names0;
      const miss = want.filter((w) => red.indexOf(w) < 0);
      const leak = red.filter((x) => want.indexOf(x) < 0);
      const ok = !!R && bootOk && hit > 0 && want.length > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
      console.log('[vet] --negative ' + key + ': 担当=' + want.join(' | ') + ' / 実際に赤くなった=' + (red.join(' | ') || '(なし)')
        + ' / 注入行の実行 ' + hit + ' 回 / 起動確認 ' + (bootOk ? 'OK' : 'NG') + ' → ' + (ok ? '✓ OK' : '✗ '
        + (!R ? '結果が取れない ' : '') + (!bootOk ? '起動確認 NG ' : '') + (hit ? '' : '注入行が実行されていない ')
        + (miss.length ? '空振り ' + miss.join(' | ') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(' | ') + ' ' : '')
        + (absent.length ? '判定が出ていない ' + absent.join(' | ') : '')));
      report.push({ key, ok });
      if (!ok) exitCode = 1;
    }
    console.log('\n[vet] 負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (赤 = 担当に完全一致)');
  }
  console.log('[vet] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
}

/* [#91 §5-1] 配置した敵の HP を 999 へ吊り上げる注入 (evaluateOnNewDocument の中で呼ぶ)。
 *   hp5 の下位ミニオンは開戦直後に仲間の手番で倒れ、隣が空いたまま窓が閉じる (依頼書 §2-3) ⇒ 先に倒されないようにする。
 *   HP 999 はスリープの HP プールにも掛からない。裸の enemies は index.html の let (注入関数から読める)。 */
function pumpEnemyHp() {
  const iv = setInterval(() => { try { if (enemies.length) {
    for (const e of enemies) { e.hp = e.maxHp = 999; }
    window.__pumped = enemies.length; clearInterval(iv); } } catch (e) {} }, 10);
}
/* 変異の印 (ページの変数) を閉じる前に回収して合算する */
const hits = {};
async function harvestHits(page) {
  try {
    const o = await page.evaluate(() => { const r = {}; for (const k of Object.keys(window)) if (k.indexOf('__MUTHIT__') === 0) r[k.slice(10)] = window[k]; return r; });
    for (const k of Object.keys(o)) hits[k] = (hits[k] || 0) + (o[k] || 0);
  } catch (e) {}
}

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
        if (u === '/index.html') {   // [#91] 凍結したスナップショット (変異時は注入済み) を配る
          res.setHeader('Content-Type', MIME['.html']); res.setHeader('Cache-Control', 'no-store');
          res.end(Buffer.from(SERVED_INDEX, 'utf8')); return;
        }
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
    let maxPack = 0, maxDisc = 0, allZero = true, leaderN = 0, allyN = 0;
    for (const e of p) {
      if (e.pack > maxPack) maxPack = e.pack;
      if (e.disc > maxDisc) maxDisc = e.disc;
      if (e.pack !== 0 || e.disc !== 0) allZero = false;
      if (e.site === 'leader') leaderN++; else if (e.site === 'ally') allyN++;   // [#91] 攻撃の口 (隊長 36107 / 仲間 36349) 別
    }
    return { n: p.length, maxPack, maxDisc, allZero, leaderN, allyN };
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
  await page2.evaluateOnNewDocument(pumpEnemyHp);   // ★[#91 §5-1] 先に倒されない (隣が空かない)
  if (MUTATE) console.log('[drv] 変異 ' + MUTATE + ' を注入した index.html を配信 (port ' + PORT + ')');
  await page2.goto('http://localhost:' + PORT + '/index.html?autoplay=30', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let cAgg = { n: 0, maxPack: 0, maxDisc: 0, allZero: true };
  for (let i = 0; i < 320; i++) {   // 最大 ~96s
    cAgg = await aggProbe(page2);
    if (cAgg.maxPack === 2) break;
    await sleep(300);
  }
  const cPumped = await page2.evaluate(() => window.__pumped || 0);
  check('(d0) 装置: 配置した全敵の HP を吊り上げた (__pumped === 配置数)', cPumped === CLUSTER.length,
    '__pumped=' + cPumped + ' / 配置 ' + CLUSTER.length + ' 体');
  check('(d) 密集配置で kobold が攻撃した (probe 記録あり)', cAgg.n >= 1, 'entries=' + cAgg.n + ' (隊長 ' + cAgg.leaderN + ' / 仲間 ' + cAgg.allyN + ')');
  check('(d) 密集配置で pack ボーナス +2 が命中内訳に出る', cAgg.maxPack === 2, 'maxPack=' + cAgg.maxPack);
  check('(d) 密集配置でも disciplined は付かない (kobold は非規律・maxDisc=0)',
    cAgg.maxDisc === 0, 'maxDisc=' + cAgg.maxDisc);
  await harvestHits(page2);
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
  /* ★[#91 §5-1] 孤立配置も HP 999 にし、**仲間を狙う攻撃 (site=ally) を 1 回以上**観測するまで待つ。
   *   pack の判定は攻撃の口ごとに別の行 (隊長 36107 / 仲間 36349)。旧版は最初の 1 撃 (どちらの口か不定) で抜けていたので、
   *   仲間側の口が壊れても (変異 allyside) 観測し損ねることがあった。実測: HP 999 の孤立コボルドは 3 秒で仲間を殴り始める。
   *   ⚠ 単体スポーン = 隣接する味方の敵が居ない、という孤立の条件は HP を変えても同じ。 */
  const ISOLATED = [['kobold', 26, 13]];
  let iAgg = { n: 0, maxPack: 0, maxDisc: 0, allZero: true, leaderN: 0, allyN: 0 };
  let iAttacked = false, iPumped = 0;
  for (let t = 0; t < 8 && !iAttacked; t++) {
    const page3 = await browser.newPage();
    page3.on('pageerror', e => pageErrors.push('[isolated] ' + e.message));
    await page3.evaluateOnNewDocument((spawns) => {
      try { sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'trait probe isolated', flavor: '', spawns })); } catch (e) {}
      window.__traitProbe = [];
    }, ISOLATED);
    await page3.evaluateOnNewDocument(pumpEnemyHp);   // ★[#91 §5-1]
    await page3.goto('http://localhost:' + PORT + '/index.html?autoplay=30', { waitUntil: 'domcontentloaded', timeout: 30000 });
    let a = { n: 0, maxPack: 0, maxDisc: 0, allZero: true, leaderN: 0, allyN: 0 };
    /* ⚠ 「1 体戦は短い」という理由で 24 (≈7.2s) にしていたが、**接敵前に観測窓が閉じる**。
     *   密集 (d) が最大 96s 掛けて捕捉しているのに孤立だけ 7.2s では母集団へ届かない
     *   (2026-08-11 実測: 8 回とも entries=0)。→ 18s/回 へ延ばす (8 回で最大 ~144s)。 */
    for (let i = 0; i < 60; i++) {   // 最大 ~18s/回
      a = await aggProbe(page3);
      if (a.n >= 1 && a.allyN >= 1) break;
      await sleep(300);
    }
    if (a.n >= 1 && a.allyN >= 1) { iAttacked = true; iAgg = a; } else { iAgg = a; }
    iPumped = await page3.evaluate(() => window.__pumped || 0);
    await harvestHits(page3);
    await page3.close();
  }
  check('(e0) 装置: 孤立配置の敵の HP を吊り上げた (__pumped === 配置数)', iPumped === ISOLATED.length,
    '__pumped=' + iPumped + ' / 配置 ' + ISOLATED.length + ' 体');
  check('(e0) 装置: 孤立 kobold が仲間を狙った攻撃 (site=ally) を観測した (仲間側の口を測っている)', iAgg.allyN >= 1,
    '隊長 ' + iAgg.leaderN + ' / 仲間 ' + iAgg.allyN);
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
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  if (!kobSeen) console.log('[driver] note: .enemy-kobold の待機がタイムアウト');
  if (MUTATE) console.log('[driver] 変異 ' + MUTATE + ' の注入行の実行 ' + (hits[MUTATE] || 0) + ' 回');
  console.log('[driver] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒');
  console.log('__RESULT__' + JSON.stringify({ results: results.map(r => ({ name: r.name, ok: r.ok })), hits: hits }));
  if (MUTATE) process.exit(0);
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
