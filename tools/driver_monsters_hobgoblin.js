#!/usr/bin/env node
/*
 * driver_monsters_hobgoblin.js — 6.27版 新規モンスター 項目2「ホブゴブリン」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ENEMY_TYPES.hobgoblin (goblin シート流用, disciplined + packTactics) と、新規共有
 * ヘルパー nearbyAlliedEnemies / effectiveEnemyAc の disciplined 拡張、攻撃ツイン2箇所
 * (leader/ally) に加えた pack(+2) / disciplined(+1) 命中ボーナスを検証する。
 *
 * ENEMY_TYPES/戦闘関数は IIFE 内 const で window 非公開のため、フルの index.html を
 * ロードして観測する。命中ボーナスの内訳は本番挙動を変えない dev プローブ
 * window.__traitProbe(seed 時のみ push・既定 undefined で no-op)で読む。
 *
 * 検証項目:
 *   (a) ?scen=goblin-mine で pageerror ゼロ + .enemy-hobgoblin DOM 生成 (>=1)
 *   (b) backgroundImage=goblin_anim.png?v= / 幾何健全: displaySize=74 →
 *       width≈74, backgroundSize=round(480*74/96)=370 ×370 (単一フレーム幅より大)
 *   (c) __diag: critical / js-error ゼロ
 *   (d) 密集配置 (2x2 の hobgoblin 4体) で pack=+2 かつ disc=+1 が内訳に出る
 *   (e) 孤立配置 (単体 hobgoblin, 遠方に非隣接の1体) で pack/disc が常に 0
 *   (f) 回帰: index.html?autoplay=15 スモークで pageerror ゼロ
 *
 * 使い方:  node tools/driver_monsters_hobgoblin.js [--headful] [--browser <path>] [--port N]
 *          node tools/driver_monsters_hobgoblin.js --negative   (素 + 変異 discac:10625 を子プロセスで)
 *
 * [#91 §5-2] (d) 密集・(e) 孤立の両配置を HP 999 に吊り上げる (AC を参照しない手段で先に倒され、記録 0 件になる揺れを止める)。
 *   装置 assert (d0)(e0)。(e) の pack/disc=0 は「反撃記録 ≥ 1」を AND (記録 0 件で緑になる空振りを塞ぐ)。
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
  /* disciplined の AC+1 が「≤2 タイルに味方の敵」を見ずに常に付く (孤立でも AC 17)。印は付けた 1 回ごと */
  discac: [
    { from: 'if (nearbyAlliedEnemies(idx, cx, cy, 2) > 0) ac += 1;',
      to: 'if ((' + HIT('discac') + ', true)) ac += 1;   /* ★変異discac */' }],
};
const MUT_PORT = { discac: 10625 };
const PORT = parseInt(arg('port', MUTATE ? String(MUT_PORT[MUTATE] || 10625) : '8796'), 10);
/* 変異 → 赤くなるべき check (担当)。check の名前で引く */
const E_AC16 = '(e) 孤立配置では実効AC=16 のみ (disciplined +1AC が出ない)';
const NEG_EXPECT = {
  discac: [E_AC16],
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

/* [#91 §5-2] 配置した敵の HP を 999 へ吊り上げる注入 (page.evaluateOnNewDocument へ渡す)。
 *   __acProbe はパーティが攻撃ロールを振った時だけ積まれる。盗賊のシャドウステップ CRIT・魔法使いのマジックミサイル (必中) で
 *   開戦直後に倒されると記録 0 件になる (依頼書 §2-4) ⇒ 先に倒されないようにする。
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

// __traitProbe(命中内訳) を集計 (ホブゴブリン分のみ)
async function aggProbe(page) {
  return page.evaluate(() => {
    const p = (window.__traitProbe || []).filter(e => e && e.name === 'ホブゴブリン');
    let maxPack = 0, maxDisc = 0, allZero = true, leaderN = 0, allyN = 0;
    for (const e of p) {
      if (e.pack > maxPack) maxPack = e.pack;
      if (e.disc > maxDisc) maxDisc = e.disc;
      if (e.pack !== 0 || e.disc !== 0) allZero = false;
      if (e.site === 'leader') leaderN++; else if (e.site === 'ally') allyN++;   // [#91] 攻撃の口別 (detail 用)
    }
    return { n: p.length, maxPack, maxDisc, allZero, leaderN, allyN };
  });
}

// __acProbe(実効AC) を集計 (ホブゴブリン分のみ)。パーティが敵を攻撃する度に記録され、
// 敵が撃破される前=ラウンド1から確実に発火するため、命中プローブより堅牢。
async function aggAc(page) {
  return page.evaluate(() => {
    const p = (window.__acProbe || []).filter(e => e && e.name === 'ホブゴブリン');
    let maxAc = 0, minAc = 999;
    for (const e of p) { if (e.ac > maxAc) maxAc = e.ac; if (e.ac < minAc) minAc = e.ac; }
    return { n: p.length, maxAc, minAc: p.length ? minAc : 0 };
  });
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = require('./_pptr_profile')('df_hob_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + profile],
  });
  const pageErrors = [];

  // ── (a)-(c) goblin-mine (spawns に hobgoblin) をロード ──
  const page1 = await browser.newPage();
  page1.on('pageerror', e => pageErrors.push('[render] ' + e.message));
  const rErrBefore = pageErrors.length;
  // ⚠ 母集団は **?graph=0 (従来の単一マップ) へ固定する**。分岐マップ (P5) 以降、廃坑の既定は
  //   分岐版になり entry ノードにはゴブリン 2 体しか居ない = **ホブゴブリンが 1 体も湧かない**
  //   (2026-08-11 実測: 旧マップは 13 体でホブゴブリン 4 体を含む)。
  //   このドライバが測るのは ENEMY_TYPES.hobgoblin の幾何と命中内訳であってマップではないので、
  //   旧経路へ戻す撤退スイッチで母集団を取り返すのが正しい。
  //   ⚠ スイッチが黙って無効化されても緑にならないよう、(a-装置) で外した側を対で実測する。
  await page1.goto('http://localhost:' + PORT + '/index.html?scen=goblin-mine&autoplay=15&autodebug=1&graph=0',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  let hobSeen = false;
  try { await page1.waitForSelector('.enemy-hobgoblin', { timeout: 15000 }); hobSeen = true; } catch (e) {}
  const rNewErrs = pageErrors.slice(rErrBefore);
  check('(a) goblin-mine ロードで pageerror ゼロ', rNewErrs.length === 0, rNewErrs.join(' | '));

  const geo = await page1.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.enemy-hobgoblin'));
    if (!els.length) return { count: 0 };
    const el = els[0];
    const bgImg = el.style.backgroundImage || '';
    const bgSize = el.style.backgroundSize || '';
    const w = parseFloat(el.style.width) || 0;
    const h = parseFloat(el.style.height) || 0;
    const m = bgSize.match(/([\d.]+)px\s+([\d.]+)px/);
    return { count: els.length, bgImg, bgSize, w, h, bgW: m ? parseFloat(m[1]) : 0, bgH: m ? parseFloat(m[2]) : 0 };
  });
  check('(a) .enemy-hobgoblin 要素が生成される (>=1)', geo.count >= 1, 'count=' + geo.count);
  /* ⚠⚠ 旧 assert は `/goblin_anim\.png\?v=/` で「goblin シートを借用している」を測っていたが、
   *   ホブゴブリンは b3f0eed (2026-07-03) で **専用シートへ移行済み**。そして
   *   `hobgoblin_anim.png` は `goblin_anim.png` を**部分文字列として含む**ため、
   *   移行後もこの assert は緑のまま通り続けていた = **1 ヶ月以上、何も検出していなかった**。
   *   → 先頭を固定して厳格化する (緩めるのではなく締める方向の修正)。 */
  check('(b) backgroundImage が hobgoblin_anim.png (?v=付き・専用シート)',
    /(^|\/)hobgoblin_anim\.png\?v=/.test(geo.bgImg), 'bgImg=' + geo.bgImg);
  const wOk = Math.abs(geo.w - 74) <= 2 && Math.abs(geo.h - 74) <= 2;
  check('(b) 表示寸法 ≈74px (displaySize=74)', wOk, 'w=' + geo.w + ' h=' + geo.h);
  /* ⚠⚠ 旧 assert は `370×370` の**直書き**だった。これは goblin シートが 480×480 (5列) だった
   *   頃の値で、6 フレーム統一 (sheetW 576×480) への差し替えで **自己失効**した (実測 444×370)。
   *   ⭐ 期待値を今の実測へ書き換えるのは母集団のすり替えなので、
   *     **借用元シートの実寸から算出する自己校正**へ移す。こうすればシートの列数が変わっても
   *     陳腐化せず、しかも「拡大率が壊れた」欠陥は従来どおり捕まえる。
   *   ⚠ 空振り防止: シートが読めなかった (nw=0) 場合は FAIL させる。 */
  const sheet = await page1.evaluate(() => new Promise((resolve) => {
    const el = document.querySelector('.enemy-hobgoblin');
    const m = ((el && el.style.backgroundImage) || '').match(/url\(["']?([^"')]+)["']?\)/);
    if (!m) { resolve({ nw: 0, nh: 0, src: '' }); return; }
    const img = new Image();
    img.onload = () => resolve({ nw: img.naturalWidth, nh: img.naturalHeight, src: m[1] });
    img.onerror = () => resolve({ nw: 0, nh: 0, src: m[1] });
    img.src = m[1];
  }));
  const FRAME = 96;   // 借用元 goblin の 1 コマ (frameW = frameH = 96)
  const expW = Math.round(sheet.nw * geo.w / FRAME), expH = Math.round(sheet.nh * geo.w / FRAME);
  const bgOk = sheet.nw > 0 && Math.abs(geo.bgW - expW) <= 2 && Math.abs(geo.bgH - expH) <= 2 && geo.bgW > geo.w;
  check('(b) backgroundSize が借用元シート実寸から算出した値に一致 (破綻なし)', bgOk,
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

  // ── (d) 密集配置: 2x2 の hobgoblin 4体 → pack=+2 かつ disc=+1 が出るか ──
  /* ⚠⚠ **絶対タイル座標の直書きは、部屋の起点を動かす変更のたびに黙って無意味になる。**
   *   ダンジョン短縮 (cdb081a「山場+ボスの2部屋」) で歩行可能域が x>=24 へ寄り、旧座標
   *   [7,13][8,13][7,14][8,14] は **全部 tile2 (岩盤)** になっていた (2026-08-11 実測)。
   *   敵は DOM としては生成されるのでパッと見は動いて見えるが、パーティ (25,13) から
   *   11〜18 タイル離れた壁の中に湧くだけで **戦闘が一度も起きない** = probe が空のまま。
   *   → パーティ起点近傍の床へ移す。⚠ 同じ罠の再発は (d-母集団) が即座に FAIL させる。 */
  /* ⚠ pack_tactics の条件は「**対象(隊長)から 1 タイル以内に自分以外の味方の敵**」であって
   *   「敵同士が密集していること」ではない (実装:
   *   `nearbyAlliedEnemies(idx, playerX+48, playerY+58, 1) > 0`)。
   *   敵を離れた場所で 2x2 に固めても disciplined(+1) しか出ない (実測 maxPack=0)。
   *   → **隊長 (25,13) の隣接タイルに 2 体**置き、残り 2 体を 1 マス外に置く。 */
  const CLUSTER = [['hobgoblin', 26, 12], ['hobgoblin', 26, 13], ['hobgoblin', 27, 12], ['hobgoblin', 27, 13]];
  const page2 = await browser.newPage();
  page2.on('pageerror', e => pageErrors.push('[cluster] ' + e.message));
  await page2.evaluateOnNewDocument((spawns) => {
    try { sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'trait probe cluster', flavor: '', spawns })); } catch (e) {}
    window.__traitProbe = [];
    window.__acProbe = [];
  }, CLUSTER);
  await page2.evaluateOnNewDocument(pumpEnemyHp);   // ★[#91 §5-2] 密集配置: 先に倒されない
  if (MUTATE) console.log('[drv] 変異 ' + MUTATE + ' を注入した index.html を配信 (port ' + PORT + ')');
  await page2.goto('http://localhost:' + PORT + '/index.html?autoplay=20', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let cAgg = { n: 0, maxPack: 0, maxDisc: 0, allZero: true };
  let cAc = { n: 0, maxAc: 0, minAc: 0 };
  for (let i = 0; i < 240; i++) {   // 最大 ~72s
    cAgg = await aggProbe(page2);
    cAc = await aggAc(page2);
    if (cAgg.maxPack === 2 && cAgg.maxDisc === 1 && cAc.maxAc === 17) break;
    await sleep(300);
  }
  const cPumped = await page2.evaluate(() => window.__pumped || 0);
  check('(d0) 装置: 密集配置の全敵の HP を吊り上げた (__pumped === 配置数)', cPumped === CLUSTER.length,
    '__pumped=' + cPumped + ' / 配置 ' + CLUSTER.length + ' 体');
  check('(d) 密集配置で hobgoblin が攻撃/被攻撃した (probe 記録あり)', cAgg.n >= 1 || cAc.n >= 1,
    'atk=' + cAgg.n + ' (隊長 ' + cAgg.leaderN + ' / 仲間 ' + cAgg.allyN + ') ac=' + cAc.n);
  check('(d) 密集配置で pack ボーナス +2 が命中内訳に出る', cAgg.maxPack === 2, 'maxPack=' + cAgg.maxPack);
  check('(d) 密集配置で disciplined +1命中 が命中内訳に出る', cAgg.maxDisc === 1, 'maxDisc=' + cAgg.maxDisc);
  check('(d) 密集配置で disciplined +1AC が実効ACに出る (16→17)', cAc.maxAc === 17,
    'maxAc=' + cAc.maxAc + ' (base 16 +1)');
  await harvestHits(page2);
  await page2.close();

  // ── (e) 孤立配置: 単体 hobgoblin → 味方の敵が皆無なので pack/disc は常に 0、実効AC=16 ──
  //     パーティが敵を攻撃する度に __acProbe が発火 (撃破前=ラウンド1から確実) するため、
  //     敵が反撃前に倒れても負のケースを確定的に観測できる。
  const ISOLATED = [['hobgoblin', 31, 12]];   // ⚠ 旧 [9,13] は岩盤。上の CLUSTER のコメント参照。
  const page3 = await browser.newPage();
  page3.on('pageerror', e => pageErrors.push('[isolated] ' + e.message));
  await page3.evaluateOnNewDocument((spawns) => {
    try { sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'trait probe isolated', flavor: '', spawns })); } catch (e) {}
    window.__traitProbe = [];
    window.__acProbe = [];
  }, ISOLATED);
  await page3.evaluateOnNewDocument(pumpEnemyHp);   // ★[#91 §5-2] 孤立配置: 先に倒されない (反撃まで生き残る)
  await page3.goto('http://localhost:' + PORT + '/index.html?autoplay=20', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let iAc = { n: 0, maxAc: 0, minAc: 0 };
  let iAgg = { n: 0, maxPack: 0, maxDisc: 0, allZero: true };
  for (let i = 0; i < 160; i++) {   // 最大 ~48s
    iAc = await aggAc(page3);
    iAgg = await aggProbe(page3);
    if (iAc.n >= 3 && iAgg.n >= 1) break;   // ★[#91 §5-2] 反撃記録も待つ (上限 160 回 ≈ 48 秒は維持)
    await sleep(300);
  }
  const iPumped = await page3.evaluate(() => window.__pumped || 0);
  check('(e0) 装置: 孤立配置の敵の HP を吊り上げた (__pumped === 配置数)', iPumped === ISOLATED.length,
    '__pumped=' + iPumped + ' / 配置 ' + ISOLATED.length + ' 体');
  check('(e) 孤立配置でパーティが hobgoblin を攻撃した (acProbe 記録あり)', iAc.n >= 1, 'entries=' + iAc.n);
  check('(e) 孤立配置では実効AC=16 のみ (disciplined +1AC が出ない)',
    iAc.n >= 1 && iAc.minAc === 16 && iAc.maxAc === 16, 'minAc=' + iAc.minAc + ' maxAc=' + iAc.maxAc);
  /* ★[#91 §5-2] 旧版は「反撃したなら」の条件付きで、**反撃記録 0 件でも緑** (空振りで緑) だった。
   *   HP 999 で反撃まで生き残るので「反撃記録 ≥ 1」を AND して塞ぐ (実測: 孤立ホブは 12 秒前後で隊長を殴る)。 */
  check('(e) 孤立配置で hobgoblin が反撃し (記録 ≥ 1)、pack/disc は常に 0',
    iAgg.n >= 1 && iAgg.allZero, 'atkN=' + iAgg.n + ' (隊長 ' + iAgg.leaderN + ' / 仲間 ' + iAgg.allyN + ') maxPack=' + iAgg.maxPack + ' maxDisc=' + iAgg.maxDisc);
  await harvestHits(page3);
  await page3.close();

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
  if (!hobSeen) console.log('[driver] note: .enemy-hobgoblin の待機がタイムアウト');
  if (MUTATE) console.log('[driver] 変異 ' + MUTATE + ' の注入行の実行 ' + (hits[MUTATE] || 0) + ' 回');
  console.log('[driver] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒');
  console.log('__RESULT__' + JSON.stringify({ results: results.map(r => ({ name: r.name, ok: r.ok })), hits: hits }));
  if (MUTATE) process.exit(0);
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
