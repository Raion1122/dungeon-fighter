#!/usr/bin/env node
/*
 * driver_field_wagon.js — 「護衛対象(馬車)の画面内保持」計測 + 回帰ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 発端: 地平線ビュー STEP0 の実プレイ実測で、隊商護衛クエストなのに護衛対象の馬車が
 *       iphone_port(390x844) で **74.9% の時間 画面外** に居ることが判明した。
 *       (iphone_land 10.4% / desktop 0.0%)
 *
 * ■ なぜ driver_field_step0.js をそのまま使わないか
 *   step0 の遮蔽コスト計測 (3) は「帯 N 行 × HUD 2 モード」の**予測 camY** を当てた
 *   前借り測定であり、camX は実測だが camY は仮定値だった (STEP1 出荷前なので当然)。
 *   STEP1 で camY は fieldCamY(usableH) に固定されたので、いまは
 *   **実際に描画へ使われた camX/camY をそのまま使って測れる**。本ドライバはそれだけを測る。
 *   さらに step0 は馬車の「中心」しか見ておらず、240px フットプリントの部分可視を
 *   「見えている」と数えられない。ここでは中心/矩形交差/可視面積の3定義を同時に出す。
 *   ⚠️ driver_field_step0.js は 33 チェックの回帰ゲートなので、計測定義を足すために
 *      あちらを書き換えない (ゲートの意味が変わってしまう)。
 *
 * ■ 測定の作法 (step0 を踏襲)
 *   ⚠️ freeze しない / quiesce しない / setCam しない / ?autoplay を使わない
 *   ⚠️ --speed 1 が既定。数字を出すときは 1 以外を使わない
 *   ⚠️ ?intel=0 で隠し中ボスの fail-open を封じ、母集団を隊商護衛だけに保つ
 *   シナリオは sessionStorage["dragonfighters.generatedScenario"] へ evaluateOnNewDocument で注入
 *   (`?scenario=` というクエリは存在しない)。ペイロードは tavern.html buildPlazaSynthetic の
 *   isCaravan 分岐と同形 — ⚠️ wagonSpawns は ty:14 (帯 row13-15 に 3x3 を収めるため tavern も 14)。
 *
 * ■ 出す数字 (★が主指標)
 *   ★ offCenterPct   : 馬車の中心が可視矩形の外に居たサンプル比率   ← STEP0 の 74.9% と同じ定義
 *     offBoxPct      : 馬車の 240px 矩形が可視矩形と 1px も交差しない比率 (完全不可視)
 *     visAreaMeanPct : 馬車矩形のうち画面内に入っていた面積の平均比率
 *     ptGapTilesP95  : 主人公と馬車の距離 (タイル) の p95 — 原因側の指標
 *   ★ hitOffPct      : **馬車が実際に被弾した瞬間**に画面外だった比率。
 *                      オートバトルではプレイヤーは介入できないので、馬車の画素そのものより
 *                      「護衛対象が削られていることを知れるか」が本質。ここが本当の主指標。
 *     indicatorPct   : 馬車が画面外のとき、画面外インジケータが出ていたサンプル比率 (修正後の検証)
 *
 * ■ 終了条件 (⚠️ ここを間違えると数字が壊れる)
 *   「3ウェーブ完走」だけを待つと、runEncounter の round>40 安全ブレーキ [index.html:14953] に
 *   引っ掛かった回で永久にサンプリングし続け、母集団が**戦闘後の探索フェーズ**に食い荒らされる
 *   (実測: 452s 以降は PT が西へ戻り offCenter が凍る = 見かけ上の改善に化ける)。
 *   よって「戦闘が始まり、かつ終わった」までを窓とする: waves 完走 / 戦闘後に敵0が QUIET_MS 継続 /
 *   ハード上限、のいずれか。窓の定義は before/after で必ず同一に保つこと。
 *
 * 出力: %TEMP%/claude/.../scratchpad/field_wagon_<tag>.json (+ --shots で PNG)
 *   ⚠️ assets/ には絶対に置かない (既に 142MB・GitHub Free 枠)
 *
 * 使い方:
 *   node tools/driver_field_wagon.js [--headful] [--browser <path>] [--port N]
 *        [--vp iphone_port,desktop] [--speed 1] [--budget-ms N] [--shots] [--tag before]
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);

const HEADFUL = flag('headful');
const SHOTS = flag('shots');
const ESCORT_OFF = flag('escort-off');   // ?escort=0 を当てる (撤退スイッチ + assert 有効性の確認用)
const TAG = arg('tag', 'run');
const PORT = parseInt(arg('port', '8801'), 10);
const SPEED = Math.max(1, parseFloat(arg('speed', '1')) || 1);
// ⚠️ 既定 420s。runEncounter の round>40 安全ブレーキ [index.html:14953] に掛かると
//    3ウェーブ完走に到達しない回があるので、必ずハード上限を置く。
const BUDGET_MS = parseInt(arg('budget-ms', '420000'), 10);
const QUIET_MS = parseInt(arg('quiet-ms', '8000'), 10);
const OUT_DIR = arg('out',
  path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
            'd59476b7-452d-4dab-a2e8-62026a9fc308', 'scratchpad'));

const ALL_VIEWPORTS = [
  { name: 'iphone_port', width: 390, height: 844 },
  { name: 'iphone_land', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];
const VP_FILTER = arg('vp', null);
const VIEWPORTS = VP_FILTER ? ALL_VIEWPORTS.filter(v => VP_FILTER.split(',').includes(v.name)) : ALL_VIEWPORTS;

// tavern.html buildPlazaSynthetic() の isCaravan 分岐と同形 (wagonSpawns は ty:14)
const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
  waves: [
    { count: 3, pool: ['goblin', 'goblinArcher'] },
    { count: 3, pool: ['goblin', 'hobgoblin'] },
    { count: 3, pool: ['hobgoblin', 'goblinRider'] },
  ],
  wagonSpawns: [{ tx: 9, ty: 14 }],
};

function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[driver] puppeteer-core が見つかりません: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}

function prelude(cfg) {
  try {
    sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
    sessionStorage.removeItem('dragonfighters.currentScenario');
    sessionStorage.removeItem('dragonfighters.questFlags');
  } catch (e) {}
  // ⚠️ __waveProbe を配列にしておかないと index.html [L23884] の `if (window.__waveProbe)` が
  //    偽になり、ウェーブが実際に湧いていても 1 件も記録されない (= 「waves 0/3」という嘘の観測)。
  //    step0 の prelude から移植する際にここを落として実際に踏んだ。
  window.__waveProbe = [];
  window.__wagonProbe = [];
  // ⚠️ __camTrace は**定義しない**。定義すると renderWorld [L10264] が毎フレーム push し、
  //    本ドライバは drain しないので配列が無限に伸びる (155s で約1万件)。camX/camY は
  //    ポーリング時に top-level から直接読むので、このシームは本ドライバには不要。
  let _s = 20260719 >>> 0;
  Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  const NativeImage = window.Image;
  window.__imgs = [];
  function TrackedImage(w, h) {
    const i = (w === undefined) ? new NativeImage() : new NativeImage(w, h);
    window.__imgs.push(i);
    return i;
  }
  TrackedImage.prototype = NativeImage.prototype;
  window.Image = TrackedImage;
}

async function waitImages(page, label) {
  const snapshot = () => page.evaluate(() => {
    const a = (window.__imgs || []).concat(Array.prototype.slice.call(document.images || []));
    let done = 0;
    for (const i of a) { if (!i.src || i.complete) done++; }
    return { total: a.length, done };
  });
  const t0 = Date.now();
  let prev = { total: -1, done: -1 }, stable = 0;
  while (Date.now() - t0 < 40000) {
    const s = await snapshot();
    if (s.total > 0 && s.done === s.total && s.total === prev.total) { stable++; if (stable >= 3) return s; }
    else stable = 0;
    prev = s;
    await new Promise(r => setTimeout(r, 250));
  }
  console.warn('[drv] 画像ロード待ちタイムアウト: ' + label);
  return prev;
}

async function installProbe(page, speed) {
  await page.evaluate((C) => {
    if (C.speed > 1 && !window.__wgSleepWrapped) {
      const _sl = window.sleepMs;
      window.sleepMs = function (ms) { return _sl(Math.max(4, Math.floor(ms / C.speed))); };
      window.__wgSleepWrapped = true;
    }
    const A = {
      samples: 0, combatSamples: 0,
      offCenter: 0, offCenterCombat: 0,
      offBox: 0, offBoxCombat: 0,
      visAreaSum: 0, visAreaSumCombat: 0,
      gapTiles: [], camXmin: Infinity, camXmax: -Infinity,
      wagonX: null, wagonY: null, wagonDS: null,
      wagonLostAt: -1, waves: 0, worst: [],
      // ★ 被弾の瞬間の可視性 (本当の主指標)。hp の減少をポーリングで検出する。
      //   ⚠️ 200ms ポーリングなので「被弾フレームちょうど」ではなく「被弾を検出した直後」を見る。
      //      カメラは lerp で追従するため、被弾演出が終わるまでに寄る場合も拾えるよう
      //      検出後 hitWindow サンプルぶんを追跡して「その間に一度でも見えたか」で判定する。
      lastWagonHp: null, hitEvents: 0, hitOffCenter: 0, hitOffBox: 0,
      pendingHit: 0, pendingSeen: false, hitWindow: 5,
      indicatorShown: 0, offAndIndicator: 0, offBoxAndIndicator: 0, offBoxNoIndicator: 0,
    };
    const wagonIdx = function () {
      try { for (let i = 0; i < wagonIndices.length; i++) if (enemies[wagonIndices[i]]) return wagonIndices[i]; }
      catch (e) {}
      return -1;
    };
    window.__wg = {
      sample: function () {
        A.samples++;
        const inCombat = (currentPhase === 'combat');
        if (inCombat) A.combatSamples++;
        if (camX < A.camXmin) A.camXmin = camX;
        if (camX > A.camXmax) A.camXmax = camX;

        // 可視矩形 (ダンジョン領域): x ∈ [UI_MENU_WIDTH, innerWidth] / y ∈ [0, innerH - bottomHud]
        const bottom = (typeof cameraBottomHud === 'function') ? cameraBottomHud() : (UI_LOG_HEIGHT + UI_MINIBAR_H);
        const vx0 = UI_MENU_WIDTH, vx1 = window.innerWidth;
        const vy0 = 0, vy1 = window.innerHeight - bottom;

        const wi = wagonIdx();
        let rec = null;
        if (wi >= 0 && enemies[wi] && enemies[wi].alive) {
          const w = enemies[wi];
          const ds = (w.def && w.def.displaySize) || 96;
          A.wagonX = +w.x.toFixed(1); A.wagonY = +w.y.toFixed(1); A.wagonDS = ds;
          const sx0 = w.x - camX, sy0 = w.y - camY;
          const sx1 = sx0 + ds, sy1 = sy0 + ds;
          const cx = sx0 + ds / 2, cy = sy0 + ds / 2;
          const offCenter = (cx < vx0 || cx > vx1 || cy < vy0 || cy > vy1);
          const ix = Math.max(0, Math.min(sx1, vx1) - Math.max(sx0, vx0));
          const iy = Math.max(0, Math.min(sy1, vy1) - Math.max(sy0, vy0));
          const visArea = (ix * iy) / (ds * ds);
          const offBox = (ix <= 0 || iy <= 0);
          if (offCenter) { A.offCenter++; if (inCombat) A.offCenterCombat++; }
          if (offBox) { A.offBox++; if (inCombat) A.offBoxCombat++; }
          A.visAreaSum += visArea; if (inCombat) A.visAreaSumCombat += visArea;
          const gap = Math.abs((playerX + 48) - (w.x + ds / 2)) / 96;
          A.gapTiles.push(+gap.toFixed(2));
          rec = { camX: +camX.toFixed(1), camY: +camY.toFixed(1), sx0: +sx0.toFixed(1),
                  cx: +cx.toFixed(1), visArea: +visArea.toFixed(3), gap: +gap.toFixed(2),
                  phase: currentPhase, vx0: vx0, vx1: vx1 };
          if (offCenter && A.worst.length < 8) A.worst.push(rec);

          // ── ★ 被弾の瞬間に見えていたか ──
          if (A.lastWagonHp !== null && w.hp < A.lastWagonHp) {
            A.hitEvents++;
            A.pendingHit = A.hitWindow;      // 以降 hitWindow サンプル追跡する
            A.pendingSeen = false;
          }
          A.lastWagonHp = w.hp;
          if (A.pendingHit > 0) {
            if (!offCenter) A.pendingSeen = true;
            A.pendingHit--;
            if (A.pendingHit === 0 && !A.pendingSeen) A.hitOffCenter++;
          }

          // ── 画面外インジケータ (修正後にだけ存在する) ──
          //   ⚠️ 未実装リビジョンでは undefined = 0 件。before/after で同じコードが走る。
          if (window.__fieldOffscreenMarker && window.__fieldOffscreenMarker.shown) {
            A.indicatorShown++;
            if (offCenter) A.offAndIndicator++;
            if (offBox) A.offBoxAndIndicator++;
          }
          // ★ 正味の合格条件: 馬車が **完全に不可視** (offBox) なのにマーカーも出ていない = 取りこぼし。
          //   offCenter を分母にすると「中心は外だが 64px 以上見えている」= マーカーを意図的に出さない
          //   正常ケースまで不合格に数えてしまう (マーカーの表示条件は中心ではなく可視面積)。
          if (offBox && !(window.__fieldOffscreenMarker && window.__fieldOffscreenMarker.shown)) {
            A.offBoxNoIndicator++;
          }
        } else if (wi >= 0 && A.wagonLostAt < 0) {
          A.wagonLostAt = A.samples;
        }
        if (window.__waveProbe && window.__waveProbe.length > A.waves) A.waves = window.__waveProbe.length;
        return {
          samples: A.samples, waves: A.waves, phase: currentPhase, gameOver: gameOver, hp: hp,
          aliveFoes: (typeof encounterEnemyIndices !== 'undefined' && encounterEnemyIndices)
            ? encounterEnemyIndices.filter(function (i) { return enemies[i] && enemies[i].alive && !enemies[i].def.isObjective; }).length : 0,
          wagonAlive: !!rec, offCenter: A.offCenter,
        };
      },
      dump: function () {
        A.gapTiles.sort(function (a, b) { return a - b; });
        const p = function (q) { return A.gapTiles.length ? A.gapTiles[Math.min(A.gapTiles.length - 1, Math.floor(A.gapTiles.length * q))] : null; };
        return { agg: A, gapP50: p(0.5), gapP95: p(0.95), gapMax: A.gapTiles.length ? A.gapTiles[A.gapTiles.length - 1] : null,
                 wagonSamples: A.gapTiles.length,
                 fieldMode: (function () { try { return FIELD_MODE; } catch (e) { return null; } })(),
                 isFieldTheme: (function () { try { return IS_FIELD_THEME; } catch (e) { return null; } })(),
                 scenarioTitle: currentScenario && currentScenario.title,
                 hasWagonSpawns: !!(currentScenario && currentScenario.wagonSpawns),
                 // updateEscortMarker が renderWorld 内 try で握り潰した回数。TDZ の起動フレーム以外で
                 // 増えていたら「マーカーが静かに死んでいる」ということ = 必ず 0 を assert する。
                 escortErr: window.__escortMarkerErr || 0,
                 wagonProbe: (window.__wagonProbe || []).slice() };
      },
    };
  }, { speed });
}

async function runViewport(browser, base, vp) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, { payload: CARAVAN_PAYLOAD });
  // --escort-off: 撤退スイッチ ?escort=0 を当てて走らせる。用途は2つ:
  //   (1) 撤退スイッチが実際に効くことの確認
  //   (2) P6 assert の**有効性**の確認 — マーカーが無い状態では必ず FAIL しなければならない。
  //       (assert が常に PASS する「腐った鏡」でないことを、修正後のツリーのまま証明できる)
  await page.goto(base + '/index.html?intel=0' + (ESCORT_OFF ? '&escort=0' : ''),
                  { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof startGame === 'function' && !!mapData; } catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await waitImages(page, vp.name);
  await installProbe(page, SPEED);
  await page.evaluate(() => { try { startGame(); } catch (e) {} });

  const shots = [];
  const t0 = Date.now();
  let last = null, reason = 'budget-exhausted', quietSince = 0, lastLog = 0, shotAt = 0;
  let sawCombat = false;
  while (Date.now() - t0 < BUDGET_MS) {
    await new Promise(r => setTimeout(r, 200));
    try { last = await page.evaluate(() => window.__wg.sample()); }
    catch (e) { reason = 'evaluate-failed: ' + e.message; break; }
    if (SHOTS && last.phase === 'combat' && shots.length < 3 && Date.now() - shotAt > 25000) {
      shotAt = Date.now();
      const f = path.join(OUT_DIR, 'wagon_' + TAG + '_' + vp.name + '_' + shots.length + '.png');
      try { await page.screenshot({ path: f }); shots.push(f); } catch (e) {}
    }
    if (last.phase === 'combat') sawCombat = true;
    if (last.gameOver) { reason = 'gameOver'; break; }
    // ⚠️ 「3ウェーブ完走」だけを待つと round>40 の安全ブレーキに掛かった回で永久に回り、
    //    母集団が戦闘後の探索フェーズ (PT が西へ戻る = 見かけ上の改善) に食い荒らされる。
    //    戦闘を1度でも見たあと、敵0が QUIET_MS 続いたらそこで窓を閉じる。
    const cleared = (last.waves >= CARAVAN_PAYLOAD.waves.length && last.aliveFoes === 0);
    const settled = (sawCombat && last.phase !== 'combat' && last.aliveFoes === 0);
    if (cleared || settled) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince > QUIET_MS) { reason = cleared ? 'waves-cleared' : 'combat-settled'; break; }
    } else quietSince = 0;
    if (Date.now() - lastLog > 30000) {
      lastLog = Date.now();
      console.log('    [' + vp.name + '] ' + Math.round((Date.now() - t0) / 1000) + 's  samples=' + last.samples +
        ' wave=' + last.waves + '/3 foes=' + last.aliveFoes + ' phase=' + last.phase +
        ' hp=' + last.hp + ' wagon=' + (last.wagonAlive ? 'alive' : 'LOST') + ' offCenter=' + last.offCenter);
    }
  }
  const dump = await page.evaluate(() => window.__wg.dump());
  await page.close();
  return { vp: vp.name, viewport: vp, dump, last, reason, elapsedMs: Date.now() - t0, pageErrors, shots };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv = null, browser = null;
  const report = { generatedAt: new Date().toISOString(), tag: TAG, speed: SPEED, viewports: [] };
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    srv = await startServer(PORT);
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] http: ' + BASE + '  tag=' + TAG + '  speed=' + SPEED +
      (SPEED > 1 ? '  ⚠️ 実尺ではない' : ' (実プレイ実尺)'));
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + path.join(os.tmpdir(), 'df_pptr_profile_wagon')],
    });
    for (const vp of VIEWPORTS) {
      console.log('[drv] 実プレイ計測: ' + vp.name + ' (' + vp.width + 'x' + vp.height + ')');
      const r = await runViewport(browser, BASE, vp);
      report.viewports.push(r);
      const A = r.dump.agg;
      console.log('    → ' + r.reason + ' / ' + Math.round(r.elapsedMs / 1000) + 's / samples=' + A.samples +
        ' / wagonSamples=' + r.dump.wagonSamples + ' / waves=' + A.waves);
      check('(P-' + vp.name + ') 隊商護衛がロードされている',
        r.dump.isFieldTheme === true && r.dump.hasWagonSpawns === true,
        'IS_FIELD_THEME=' + r.dump.isFieldTheme + ' wagonSpawns=' + r.dump.hasWagonSpawns +
        ' title="' + r.dump.scenarioTitle + '"');
      check('(P2-' + vp.name + ') pageerror 0', r.pageErrors.length === 0,
        r.pageErrors.slice(0, 3).join(' | ') || 'none');
      check('(P3-' + vp.name + ') 馬車のサンプルが十分 (>=100)', r.dump.wagonSamples >= 100,
        'wagonSamples=' + r.dump.wagonSamples);
      check('(P4-' + vp.name + ') 3ウェーブ完走', A.waves >= 3, 'waves=' + A.waves + '/3 reason=' + r.reason);
      check('(P5-' + vp.name + ') updateEscortMarker が例外で握り潰されていない',
        r.dump.escortErr === 0, '__escortMarkerErr=' + r.dump.escortErr);
      // ★ 本命の合格条件。馬車が完全に不可視のフレームは 1 枚残らずマーカーで補われていること。
      //   ⚠️ 修正前のリビジョンでは A.offBox>0 かつ indicatorShown=0 なので必ず FAIL する
      //      (= この assert が「効いている」ことの確認になる)。
      check('(P6-' + vp.name + ') 馬車が完全に画面外のフレームは全てマーカーで補われている',
        A.offBoxNoIndicator === 0,
        '完全に画面外=' + A.offBox + ' / うちマーカー無し=' + A.offBoxNoIndicator +
        ' / マーカー表示=' + A.indicatorShown);
    }
    const outFile = path.join(OUT_DIR, 'field_wagon_' + TAG + '.json');
    fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
    console.log('\n[drv] JSON: ' + outFile);

    console.log('\n════════ ★ 馬車の画面外率 (tag=' + TAG + ') ════════');
    console.log('  viewport      n(wagon)  ★中心が画面外        矩形が完全に画面外    可視面積平均   PT距離 p50/p95/max');
    for (const r of report.viewports) {
      const A = r.dump.agg, n = r.dump.wagonSamples || 1;
      console.log('  ' + r.vp.padEnd(13) + String(r.dump.wagonSamples).padEnd(10) +
        ((A.offCenter / n * 100).toFixed(1) + '% (' + A.offCenter + '/' + n + ')').padEnd(21) +
        ((A.offBox / n * 100).toFixed(1) + '% (' + A.offBox + '/' + n + ')').padEnd(22) +
        ((A.visAreaSum / n * 100).toFixed(1) + '%').padEnd(15) +
        r.dump.gapP50 + ' / ' + r.dump.gapP95 + ' / ' + r.dump.gapMax);
    }
    console.log('\n  ─ 戦闘中のみ (phase==="combat") ─');
    for (const r of report.viewports) {
      const A = r.dump.agg, n = A.combatSamples || 1;
      console.log('  ' + r.vp.padEnd(13) + 'combatSamples=' + String(A.combatSamples).padEnd(8) +
        '中心外 ' + (A.offCenterCombat / n * 100).toFixed(1) + '%  完全外 ' + (A.offBoxCombat / n * 100).toFixed(1) + '%');
    }
    console.log('\n  ─ ★ 馬車が被弾した瞬間の可視性 (オートバトルでの本質指標) ─');
    for (const r of report.viewports) {
      const A = r.dump.agg;
      const n = A.hitEvents || 0;
      console.log('  ' + r.vp.padEnd(13) + '被弾イベント=' + String(n).padEnd(6) +
        'そのうち一度も見えなかった: ' + (n ? (A.hitOffCenter / n * 100).toFixed(1) + '% (' + A.hitOffCenter + '/' + n + ')' : 'n/a (被弾なし)'));
    }
    console.log('\n  ─ 画面外インジケータ (修正後のみ非0) ─');
    for (const r of report.viewports) {
      const A = r.dump.agg, n = r.dump.wagonSamples || 1;
      console.log('  ' + r.vp.padEnd(13) + '表示=' + String(A.indicatorShown).padEnd(6) +
        '★完全に不可視のとき補われた率: ' +
        (A.offBox ? (A.offBoxAndIndicator / A.offBox * 100).toFixed(1) + '% (' + A.offBoxAndIndicator + '/' + A.offBox + ')  取りこぼし=' + A.offBoxNoIndicator
                  : 'n/a (完全不可視なし)') +
        '   [参考] 中心が外のとき: ' +
        (A.offCenter ? (A.offAndIndicator / A.offCenter * 100).toFixed(1) + '%' : 'n/a'));
    }
    console.log('\n  ─ 最悪サンプル (中心が画面外だった瞬間の内訳) ─');
    for (const r of report.viewports) {
      const w = r.dump.agg.worst[0];
      console.log('  ' + r.vp.padEnd(13) + (w ? JSON.stringify(w) : '(なし = 常に画面内)'));
    }
    console.log('\n  ─ camX レンジ / 馬車 world 座標 / spawnWagon の結果 ─');
    for (const r of report.viewports) {
      const A = r.dump.agg;
      console.log('  ' + r.vp.padEnd(13) + 'camX ' + A.camXmin.toFixed(0) + '..' + A.camXmax.toFixed(0) +
        '  wagon=(' + A.wagonX + ',' + A.wagonY + ') ds=' + A.wagonDS +
        '  probe=' + JSON.stringify(r.dump.wagonProbe.map(p => ({ raw: p.raw, tx: p.tx, ty: p.ty, o: p.outcome }))));
    }
    for (const r of report.viewports) for (const f of r.shots) console.log('  shot: ' + f);
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }
  const pass = results.filter(r => r.ok).length;
  console.log('\n=== 測定妥当性 ' + pass + '/' + results.length + ' PASS ===');
  results.filter(r => !r.ok).forEach(f => console.log('  FAILED: ' + f.name + ' — ' + f.detail));
  process.exit(results.some(r => !r.ok) ? 1 : 0);
})().catch(e => { console.error('[driver] 例外: ' + (e && e.stack || e)); process.exit(3); });
