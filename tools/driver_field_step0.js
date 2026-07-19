#!/usr/bin/env node
/*
 * driver_field_step0.js — 「地平線ビュー STEP0 = 受動カメラレコーダ」計測ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 計画書: dev-meetings/2026-07-19_隊商護衛の地平線ビュー.md  §4 STEP 0
 *
 * ■ このドライバが存在する理由 (これを読まずに数字を使わないこと)
 *   屋外景観の過去2回の全損 (1849dd6 / f8a89ec) は、可視性を `__probe.setCam` で
 *   **強制したカメラ**でしか測っていなかったことに起因する。強制カメラは
 *   cameraFollowTick の lerp [index.html:3662] も renderWorldWithShake の shake 加算
 *   [index.html:3684-3688] も飛ばしているので、**実際に描画へ使われた camX/camY を
 *   これまで一度も観測していない**。
 *   STEP0 はそれだけを直す。よって本ドライバは driver_field_step1.js と決定的に違う:
 *
 *     ⚠️ freeze しない  … rAF を止めない (lerp を生かす)
 *     ⚠️ quiesce しない … renderWorld/renderWorldWithShake を潰さない (実描画を観測する)
 *     ⚠️ setCam しない  … カメラを一切強制しない (受動レコーダに徹する)
 *     ⚠️ ?autoplay を使わない
 *          → window.__autoplay が truthy だと index.html 側で
 *            ・triggerScreenShake が即 return [L3698]      = shake サンプルが永久に 0
 *            ・claimCameraTrack が即 false [L3792]         = cameraTightFocus が永久に false
 *            になり、母集団健全性 (測定項目2) が**構造的に**満たせなくなる。
 *            速度が要るときは --speed N (window.sleepMs のドライバ側ラップ) を使う。
 *
 * ■ 本体側の変更 (これ1本だけ・no-op)
 *   index.html renderWorld() 冒頭:
 *       if (window.__camTrace) { try { window.__camTrace.push({camX,camY,focus,tight,phase}); } … }
 *   renderWorldWithShake は shake=0 のとき renderWorld() を早期直呼びするので、
 *   シームを向こうに置くと無シェイクのフレームを丸ごと落とす。必ず renderWorld 側。
 *
 * ■ 測るもの (計画書 §4 の6項目)
 *   (1) skyPx = HORIZON_Y - camY の**全サンプル最小値** (平均/中央値は禁止)
 *   (2) 母集団健全性: phase==="combat" / focus:true / tight:true / shake の各件数 ≥1
 *       → 0 件なら「測定自体が無効」として FAIL を立てる (黙って PASS にしない)
 *   (3) 遮蔽コスト: 歩行帯 {2,3,5}行 × HUD {据置,奪還} で、交戦中の生存ユニットと
 *       馬車が画面外/HUD下に入る割合
 *   (4) ★馬車の占有タイル数 (計画書 §7-6 の未解決リスク)
 *   (5) 帯の切断率: 帯の各列で全行が getUnitOccupiedTiles に含まれるフレーム比率
 *   (6) bottomHud の再計算箇所が同値を返すか (単一ソース化漏れ検出)
 *
 * ■ シナリオ注入
 *   `?scenario=` というクエリは**存在しない**。tavern.html buildPlazaSynthetic [L4975-5028]
 *   が組む __generated ペイロードを sessionStorage["dragonfighters.generatedScenario"] へ
 *   evaluateOnNewDocument で直接注入する (familyId=caravan-escort 相当)。
 *
 * 使い方:
 *   node tools/driver_field_step0.js [--headful] [--browser <path>] [--port N]
 *                                    [--speed N] [--budget-ms N] [--vp iphone_land,...]
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
const PORT = parseInt(arg('port', '8797'), 10);
// --speed: window.sleepMs をドライバ側でラップして進行を速める。1 = 実プレイ実尺 (既定・最も忠実)。
//   ⚠️ ?autoplay とは別物。__autoplay を立てないので shake / cameraTightFocus は生きたまま。
//   ⚠️ >1 にすると rAF(lerp) とゲーム進行の時間比が変わり camY 分布が動く。数字を出すときは 1 を使う。
const SPEED = Math.max(1, parseFloat(arg('speed', '1')) || 1);
const BUDGET_MS = parseInt(arg('budget-ms', '900000'), 10);   // 1ビューポートあたりの実行上限

const OUT_DIR = arg('out',
  path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
            'd59476b7-452d-4dab-a2e8-62026a9fc308', 'scratchpad'));

// ── 幾何定数 (計画書 §2-2 と一致させること) ────────────────────────────────
const TILE_SIZE = 96;
const BAND_TOP_ROW = 13;
const BAND_TOP = BAND_TOP_ROW * TILE_SIZE;   // 1248
const VERGE_H = 16;
const HORIZON_Y = BAND_TOP - VERGE_H;        // 1232
const BAND_ROWS_SET = [2, 3, 5];
const HUD_MODES = ['keep', 'reclaim'];

const ALL_VIEWPORTS = [
  { name: 'iphone_land', width: 844, height: 390 },
  { name: 'iphone_port', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
const VP_FILTER = arg('vp', null);
const VIEWPORTS = VP_FILTER ? ALL_VIEWPORTS.filter(v => VP_FILTER.split(',').includes(v.name)) : ALL_VIEWPORTS;

// ── 隊商護衛の生成クエストペイロード ────────────────────────────────────────
// tavern.html buildPlazaSynthetic() [L4975-5028] の isCaravan 分岐が組む gen と同形。
// ⚠️ waves と wagonSpawns は必ずセット (waves だけだと湧き中心が主人公足元へ退避する)。
// ⚠️ 敵キーは index.html ENEMY_TYPES 実在のもののみ。未知キーは無言消去され spawns が空になると
//    goblin-mine へフォールバックする (= 別シナリオを測ることになる)。
// ⚠️ themeId:"caravan-road" が FIELD_THEMES に入っている唯一のキー = 屋外判定の入口。
const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600,
  trapCount: 0,
  hiddenChestCount: 0,
  perceptionDC: 14,
  themeId: 'caravan-road',
  questLevel: 3,
  tierKey: 'T2',
  source: 'plaza',
  fangReward: 0,
  waves: [
    { count: 3, pool: ['goblin', 'goblinArcher'] },
    { count: 3, pool: ['goblin', 'hobgoblin'] },
    { count: 3, pool: ['hobgoblin', 'goblinRider'] },
  ],
  wagonSpawns: [{ tx: 9, ty: 13 }],
};

// ── puppeteer / Chrome の解決 (driver_field_step1.js と同じ作法) ────────────
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

// ── 静的サーバ (file:// は音声等が壊れるので http 必須) ──────────────────────
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

// ── 結果集計 ────────────────────────────────────────────────────────────────
// ⚠️ 2種類を区別する。混ぜると「既知の欠陥があるので測定が失敗した」という誤読が生まれ、
//    STEP1 以降このドライバをグリーンゲートとして使えなくなる。
//    check()   = 測定そのものの妥当性 (母集団が健全か / シナリオが正しいか)。exit code を左右する。
//    finding() = 測定の結果みつかった本体側の欠陥。STEP1 で直す対象であって、
//                「今 FAIL していること」自体が正しい状態。exit code には影響させない。
const results = [];
const findings = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
function finding(name, clean, detail) {
  findings.push({ name, clean: !!clean, detail: detail || '' });
  console.log((clean ? '  CLEAN  ' : '  FINDING') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }

// ── プレリュード (goto 前に走る) ────────────────────────────────────────────
// ⚠️ ここで __camTrace を配列にしておくのが肝。ページ最初の1フレーム目から記録される。
//    freeze も quiesce もしない (実プレイのカメラを観測するのが本ドライバの唯一の目的)。
function prelude(cfg) {
  try {
    sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
    sessionStorage.removeItem('dragonfighters.currentScenario');
    sessionStorage.removeItem('dragonfighters.questFlags');
  } catch (e) {}

  window.__camTrace = [];
  window.__camTraceErr = 0;
  window.__waveProbe = [];

  // Math.random だけ固定シード。時刻 (Date.now / performance.now) と rAF は**実物のまま**。
  //   ⚠️ 実尺で走らせる以上、run 全体がビット決定論になることはない (updateShake が毎フレーム
  //      乱数を引くので、フレームレートが揺れれば戦闘ロールの消費位置もずれる)。
  //      それでもマップ生成/情景配置は固定できるので構図の再現性は上がる。
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
  console.warn('[drv] 画像ロード待ちがタイムアウト: ' + label);
  return prev;
}

// ── in-page 計測キット ──────────────────────────────────────────────────────
// page.evaluate(fn) はグローバルスコープでコンパイルされるので、index.html の
// script top-level の let/const (camX / mapData / enemies / UI_LOG_HEIGHT …) に
// bare 名で到達できる (driver_field_step1.js が実証済みの作法)。
async function installStep0Probe(page, cfg) {
  await page.evaluate((C) => {
    const TILE = C.TILE_SIZE, HORIZON_Y = C.HORIZON_Y, VERGE_H = C.VERGE_H;
    const BAND_TOP_ROW = C.BAND_TOP_ROW, ROWS = C.BAND_ROWS_SET, HUDS = C.HUD_MODES;

    // ── (a) shake フレームのタグ付け ─────────────────────────────────────
    // renderWorldWithShake は camX/camY へ shake を一時加算してから renderWorld() を呼ぶ
    // [index.html:3684-3688]。シームは renderWorld 内なので camX/camY は「shake 込みの実値」。
    // どのサンプルが shake 中だったかは shakeX/shakeY を見ないと分からないが、これは
    // top-level の let なので window 経由では見えない。→ renderWorld を包んで印を付ける。
    // ⚠️ 本体は 1 バイトも変えない。これはドライバ側のテストダブル。
    if (!window.__step0RWWrapped) {
      const _rw = window.renderWorld;
      window.renderWorld = function () {
        const i0 = window.__camTrace ? window.__camTrace.length : -1;
        const r = _rw.apply(this, arguments);
        if (i0 >= 0 && window.__camTrace.length > i0) {
          try { window.__camTrace[i0].shake = (shakeX !== 0 || shakeY !== 0); } catch (e) {}
        }
        return r;
      };
      window.__step0RWWrapped = true;
    }
    // triggerScreenShake の発火回数も独立に数える (shake フレーム 0 件だったときの切り分け用)
    window.__shakeCalls = 0;
    if (!window.__step0TSWrapped) {
      const _ts = window.triggerScreenShake;
      window.triggerScreenShake = function () { window.__shakeCalls++; return _ts.apply(this, arguments); };
      window.__step0TSWrapped = true;
    }
    // --speed: sleepMs をラップして進行を速める (?autoplay とは別物 = __autoplay を立てない)
    if (C.speed > 1 && !window.__step0SleepWrapped) {
      const _sl = window.sleepMs;
      window.sleepMs = function (ms) { return _sl(Math.max(4, Math.floor(ms / C.speed))); };
      window.__step0SleepWrapped = true;
    }

    // ── (b) 幾何ヘルパー ─────────────────────────────────────────────────
    // STEP1 が入れる予定のカメラ縦固定式。計画書 §2-2:
    //   skyPx = clamp(56, 0.32*usableH, usableH - VERGE_H - BAND_H)
    //   camY  = HORIZON_Y - skyPx
    // ⚠️ 「56 の下限」は「そもそも空を置く余地があるか」の上限に必ず負ける。
    //    横持ち HUD 据置 (usableH=217, 3行帯 BAND_H=288) では余地が -87px なので空は 0。
    //    ここを Math.max(56, …) の一本槍で書くと 56px の嘘が出る。0 でクランプすること。
    const fieldSkyPx = function (usableH, bandRows) {
      const BAND_H = bandRows * TILE;
      const want = Math.max(56, 0.32 * usableH);
      const room = usableH - VERGE_H - BAND_H;
      return Math.max(0, Math.min(want, room));
    };
    const bottomHudPx = function () { return UI_LOG_HEIGHT + UI_MINIBAR_H; };
    const usableHFor = function (hud) {
      return window.innerHeight - (hud === 'keep' ? bottomHudPx() : 0);
    };

    // ── (c) 集計器 ───────────────────────────────────────────────────────
    const A = {
      trace: { n: 0, err: 0, camYmin: Infinity, camYmax: -Infinity,
               camXmin: Infinity, camXmax: -Infinity,
               phases: {}, nFocus: 0, nTight: 0, nShake: 0,
               topCamY: [],                       // 上位10件 (skyPx 最小のサンプル)
               camYHist: {} },                    // 64px バケット
      samples: 0, combatSamples: 0,
      occl: {}, cut: {}, wagon: null, wagonSeries: [],
      rowsSeen: {},                               // ユニットが実際に居た行のヒストグラム
      waves: [],
    };
    for (const n of ROWS) for (const h of HUDS) {
      A.occl[n + '/' + h] = { units: 0, unitsHidden: 0, unitsOffTop: 0, unitsOffBottom: 0,
                              wagon: 0, wagonHidden: 0 };
    }
    for (const n of ROWS) A.cut['rows' + n] = { frames: 0, framesWithCut: 0, cutCols: 0,
                                                localFrames: 0, localFramesWithCut: 0, localCutCols: 0 };

    // ── (d) __camTrace の畳み込み (メモリを無限に食わせない) ─────────────
    const drain = function () {
      const t = window.__camTrace;
      if (!t || !t.length) return;
      const T = A.trace;
      for (let i = 0; i < t.length; i++) {
        const s = t[i];
        T.n++;
        if (s.camY < T.camYmin) T.camYmin = s.camY;
        if (s.camY > T.camYmax) T.camYmax = s.camY;
        if (s.camX < T.camXmin) T.camXmin = s.camX;
        if (s.camX > T.camXmax) T.camXmax = s.camX;
        T.phases[s.phase] = (T.phases[s.phase] || 0) + 1;
        if (s.focus) T.nFocus++;
        if (s.tight) T.nTight++;
        if (s.shake) T.nShake++;
        const b = Math.floor(s.camY / 64) * 64;
        T.camYHist[b] = (T.camYHist[b] || 0) + 1;
        // camY 最大 = skyPx 最小。最悪ケースのサンプルだけ素で保存しておく。
        T.topCamY.push({ camY: +s.camY.toFixed(2), camX: +s.camX.toFixed(2),
                         phase: s.phase, focus: !!s.focus, tight: !!s.tight, shake: !!s.shake });
        if (T.topCamY.length > 400) {
          T.topCamY.sort(function (a, b2) { return b2.camY - a.camY; });
          T.topCamY.length = 10;
        }
      }
      t.length = 0;
      T.err = window.__camTraceErr || 0;
    };

    // ── (e) 位置サンプル ─────────────────────────────────────────────────
    const wagonIdx = function () {
      try {
        for (let i = 0; i < wagonIndices.length; i++) {
          if (enemies[wagonIndices[i]]) return wagonIndices[i];
        }
      } catch (e) {}
      return -1;
    };

    const sample = function () {
      drain();
      A.samples++;
      const inCombat = (currentPhase === 'combat');
      if (inCombat) A.combatSamples++;

      // ── 交戦中の生存ユニット一覧 (中心座標) ──
      const units = [];
      if (hp > 0 && !gameOver) units.push({ x: playerX + 48, y: playerY + 48, k: 'player' });
      if (typeof allies !== 'undefined') {
        for (const a of allies) {
          if (!a || !a.alive) continue;
          const s = (a.def && a.def.displaySize) || 96;
          units.push({ x: a.x + s / 2, y: a.y + s / 2, k: 'ally' });
        }
      }
      if (typeof encounterEnemyIndices !== 'undefined' && encounterEnemyIndices) {
        for (const ei of encounterEnemyIndices) {
          const e = enemies[ei];
          if (!e || !e.alive || e.def.isObjective) continue;
          const s = (e.def && e.def.displaySize) || 96;
          units.push({ x: e.x + s / 2, y: e.y + s / 2, k: 'enemy' });
        }
      }
      for (const u of units) {
        const ty = Math.floor(u.y / TILE);
        A.rowsSeen[ty] = (A.rowsSeen[ty] || 0) + 1;
      }

      // ── 馬車 ──
      const wi = wagonIdx();
      let wagon = null;
      if (wi >= 0) {
        const w = enemies[wi];
        const size = (w.def && w.def.displaySize) || 96;
        wagon = { x: w.x, y: w.y, size: size, alive: !!w.alive,
                  cx: w.x + size / 2, cy: w.y + size / 2 };
      }

      // ── (3) 遮蔽コスト: 帯行 × HUD の各構成で、STEP1 が据える予定の camY を使う ──
      //    camX は観測値 (STEP1 は横のカメラ挙動を変えない契約なので実測をそのまま使う)。
      //    ⚠️ ユニットの y は「現行28行マップで実際に居た位置」。STEP1 では帯 N 行に
      //       閉じ込められるので、この数字は**悲観側の上界**。帯内に居た割合は rowsSeen で別掲。
      if (inCombat) {
        for (const n of ROWS) for (const h of HUDS) {
          const key = n + '/' + h;
          const uH = usableHFor(h);
          const camYh = HORIZON_Y - fieldSkyPx(uH, n);
          const o = A.occl[key];
          for (const u of units) {
            const sx = u.x - camX, sy = u.y - camYh;
            o.units++;
            const offTop = sy < 0;
            const offBottom = sy > uH;
            const offSide = (sx < UI_MENU_WIDTH || sx > window.innerWidth);
            if (offTop) o.unitsOffTop++;
            if (offBottom) o.unitsOffBottom++;
            if (offTop || offBottom || offSide) o.unitsHidden++;
          }
          if (wagon && wagon.alive) {
            const sx = wagon.cx - camX, sy = wagon.cy - camYh;
            o.wagon++;
            if (sy < 0 || sy > uH || sx < UI_MENU_WIDTH || sx > window.innerWidth) o.wagonHidden++;
          }
        }
      }

      // ── (5) 帯の切断率 ──
      //   帯の各列 tx について、帯の全行 ty が getUnitOccupiedTiles に含まれる = その列は切断。
      //   ⚠️ 現行マップは帯化されていないので、帯行に壁がある列は「構造的に通れない」だけで
      //      ユニット由来の切断ではない。よって壁を含む列は母数から外す (STEP1 の帯は
      //      全行 walkable になるので、これが正しい前借り測定になる)。
      const occ = getUnitOccupiedTiles(null);
      const wagonTx = wagon ? Math.floor(wagon.cx / TILE) : -1;
      for (const n of ROWS) {
        const rec = A.cut['rows' + n];
        let cut = 0, localCut = 0, localCols = 0;
        for (let tx = 0; tx < MAP_W; tx++) {
          let wallish = false, allOcc = true;
          for (let r = 0; r < n; r++) {
            const ty = BAND_TOP_ROW + r;
            if (ty >= MAP_H) { wallish = true; break; }
            if (mapData[ty][tx] === 2 || obstacleTileMask[ty * MAP_W + tx] === 1) { wallish = true; break; }
            if (!occ.has(tx + ',' + ty)) allOcc = false;
          }
          if (wallish) continue;
          const isLocal = (wagonTx >= 0 && Math.abs(tx - wagonTx) <= 8);
          if (isLocal) localCols++;
          if (allOcc) { cut++; if (isLocal) localCut++; }
        }
        rec.frames++;
        if (cut > 0) rec.framesWithCut++;
        rec.cutCols += cut;
        if (localCols > 0) {
          rec.localFrames++;
          if (localCut > 0) rec.localFramesWithCut++;
          rec.localCutCols += localCut;
        }
      }

      // ── (4) 馬車の占有タイル数 ──
      if (wagon && wagon.alive) {
        const w = enemies[wi];
        const size = wagon.size;
        const tx0 = Math.floor(w.x / TILE), tx1 = Math.floor((w.x + size - 1) / TILE);
        const ty0 = Math.floor(w.y / TILE), ty1 = Math.floor((w.y + size - 1) / TILE);
        // 論理占有 (getUnitOccupiedTiles が馬車由来で増やすタイル数)。
        //   getUnitOccupiedTiles は displaySize を無視して**中心1タイル**しか積まない [L11498-11502]
        //   → 経路探索の上では馬車は 1 タイルしか塞がない。ここを実測で固定する。
        const occAll = getUnitOccupiedTiles(null).size;
        const occNoWagon = getUnitOccupiedTiles(w).size;
        const rec = { logicalTiles: occAll - occNoWagon,
                      hitboxTx: [tx0, tx1], hitboxTy: [ty0, ty1],
                      hitboxCols: tx1 - tx0 + 1, hitboxRows: ty1 - ty0 + 1,
                      hitboxTiles: (tx1 - tx0 + 1) * (ty1 - ty0 + 1),
                      centerTile: [Math.floor(wagon.cx / TILE), Math.floor(wagon.cy / TILE)],
                      displaySize: size, x: +w.x.toFixed(1), y: +w.y.toFixed(1) };
        // 帯行のうち何行を塞ぐか
        rec.bandRowsBlocked = {};
        for (const n of ROWS) {
          let blocked = 0;
          for (let r = 0; r < n; r++) {
            const ty = BAND_TOP_ROW + r;
            if (ty >= ty0 && ty <= ty1) blocked++;
          }
          rec.bandRowsBlocked['rows' + n] = blocked;
        }
        A.wagon = rec;
        if (A.wagonSeries.length < 5) A.wagonSeries.push(rec);
      }

      // ウェーブ進捗
      if (window.__waveProbe && window.__waveProbe.length > A.waves.length) {
        A.waves = window.__waveProbe.slice();
      }
      return {
        samples: A.samples, traceN: A.trace.n, waves: A.waves.length,
        phase: currentPhase, gameOver: gameOver, hp: hp,
        aliveFoes: (typeof encounterEnemyIndices !== 'undefined' && encounterEnemyIndices)
          ? encounterEnemyIndices.filter(function (i) { return enemies[i] && enemies[i].alive && !enemies[i].def.isObjective; }).length : 0,
        enemiesLen: enemies.length,
        wagonAlive: !!(wagon && wagon.alive),
      };
    };

    // ── (6) bottomHud の再計算箇所が同値を返すか ─────────────────────────
    //   意味論で同定した4箇所 (行番号は動くので式で照合する):
    //     computeCameraTarget  … const bottomHud = UI_LOG_HEIGHT + UI_MINIBAR_H
    //     isInComfortZone      … const bottomHud = UI_LOG_HEIGHT + UI_MINIBAR_H
    //     offscreenAmountAt    … innerHeight - (UI_LOG_HEIGHT + UI_MINIBAR_H)
    //     speechOnScreen       … sy < vh - UI_LOG_HEIGHT     ★ UI_MINIBAR_H が入っていない
    const hudSites = function () {
      return {
        UI_LOG_HEIGHT: UI_LOG_HEIGHT,
        UI_MINIBAR_H: UI_MINIBAR_H,
        UI_MENU_WIDTH: UI_MENU_WIDTH,
        innerW: window.innerWidth, innerH: window.innerHeight,
        computeCameraTarget: UI_LOG_HEIGHT + UI_MINIBAR_H,
        isInComfortZone: UI_LOG_HEIGHT + UI_MINIBAR_H,
        offscreenAmountAt: UI_LOG_HEIGHT + UI_MINIBAR_H,
        speechOnScreen: UI_LOG_HEIGHT,
        usableH_keep: window.innerHeight - (UI_LOG_HEIGHT + UI_MINIBAR_H),
        usableH_reclaim: window.innerHeight,
      };
    };

    window.__step0 = {
      sample: sample,
      drain: drain,
      hudSites: hudSites,
      predict: function () {
        const out = {};
        for (const h of HUDS) {
          const uH = usableHFor(h);
          out[h] = { usableH: uH, rows: {} };
          for (const n of ROWS) {
            const sky = fieldSkyPx(uH, n);
            out[h].rows['rows' + n] = { skyPx: +sky.toFixed(1),
                                        skyPct: +(uH > 0 ? sky / uH * 100 : 0).toFixed(1),
                                        camY: +(HORIZON_Y - sky).toFixed(1),
                                        bandScreenTop: +(BAND_TOP_ROW * TILE - (HORIZON_Y - sky)).toFixed(1) };
          }
        }
        return out;
      },
      fieldMode: function () { try { return FIELD_MODE; } catch (e) { return '<unreadable>'; } },
      isFieldTheme: function () { try { return IS_FIELD_THEME; } catch (e) { return '<unreadable>'; } },
      dump: function () {
        drain();
        const T = A.trace;
        T.topCamY.sort(function (a, b) { return b.camY - a.camY; });
        T.topCamY.length = Math.min(10, T.topCamY.length);
        return { agg: A, shakeCalls: window.__shakeCalls || 0,
                 traceErr: window.__camTraceErr || 0,
                 mapW: MAP_W, mapH: MAP_H,
                 scenarioTitle: currentScenario && currentScenario.title,
                 hasWaves: !!(currentScenario && currentScenario.waves),
                 hasWagonSpawns: !!(currentScenario && currentScenario.wagonSpawns) };
      },
    };
  }, cfg);
}

// ── 1ビューポート分の実走 ────────────────────────────────────────────────────
async function runViewport(browser, base, vp) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, { payload: CARAVAN_PAYLOAD });
  // ⚠️ ?autoplay は使わない (shake / cameraTightFocus が構造的に死ぬ)。
  //    ?intel=0 は隠し中ボスの fail-open を封じて母集団を隊商護衛だけに保つため。
  await page.goto(base + '/index.html?intel=0', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof startGame === 'function' && !!mapData && typeof getUnitOccupiedTiles === 'function'; }
    catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await waitImages(page, vp.name);

  await installStep0Probe(page, {
    TILE_SIZE, HORIZON_Y, VERGE_H, BAND_TOP_ROW,
    BAND_ROWS_SET, HUD_MODES, speed: SPEED,
  });

  const pre = await page.evaluate(() => ({
    fieldMode: window.__step0.fieldMode(),
    isFieldTheme: window.__step0.isFieldTheme(),
    hud: window.__step0.hudSites(),
    predict: window.__step0.predict(),
    autoplay: window.__autoplay || 0,
    traceLenBeforeStart: (window.__camTrace || []).length,
  }));

  await page.evaluate(() => { try { startGame(); } catch (e) {} });

  // ── ポーリング: 実プレイを止めずに 200ms ごとにサンプルを1件取る ──
  const t0 = Date.now();
  let last = null, done = false, reason = 'budget-exhausted';
  let quietSince = 0, lastLog = 0;
  while (Date.now() - t0 < BUDGET_MS) {
    await new Promise(r => setTimeout(r, 200));
    try { last = await page.evaluate(() => window.__step0.sample()); }
    catch (e) { reason = 'evaluate-failed: ' + e.message; break; }
    if (last.gameOver) { done = true; reason = 'gameOver'; break; }
    // 3ウェーブ完走 = spawnWave が3回発火し、かつ交戦中の生存敵が居なくなった状態が続いた
    if (last.waves >= CARAVAN_PAYLOAD.waves.length && last.aliveFoes === 0) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince > 3000) { done = true; reason = 'waves-cleared'; break; }
    } else quietSince = 0;
    if (Date.now() - lastLog > 30000) {
      lastLog = Date.now();
      console.log('    [' + vp.name + '] ' + Math.round((Date.now() - t0) / 1000) + 's  ' +
        'trace=' + last.traceN + ' samples=' + last.samples + ' wave=' + last.waves +
        '/' + CARAVAN_PAYLOAD.waves.length + ' foes=' + last.aliveFoes +
        ' phase=' + last.phase + ' hp=' + last.hp + ' wagon=' + (last.wagonAlive ? 'alive' : 'LOST'));
    }
  }

  const dump = await page.evaluate(() => window.__step0.dump());
  await page.close();
  return { vp: vp.name, viewport: vp, pre, dump, last, done, reason,
           elapsedMs: Date.now() - t0, pageErrors };
}

// ── 静的スキャン: bottomHud 各箇所を「意味論」で同定して行番号と式を出す ────
function scanHudSites() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split(/\r?\n/);
  const sites = [];
  src.forEach((line, i) => {
    if (/UI_LOG_HEIGHT\s*\+\s*UI_MINIBAR_H/.test(line)) sites.push({ line: i + 1, kind: 'log+minibar', text: line.trim() });
    else if (/vh\s*-\s*UI_LOG_HEIGHT/.test(line)) sites.push({ line: i + 1, kind: 'log-only(LEAK)', text: line.trim() });
  });
  return sites;
}

// ── 人間が読む用のサマリ ────────────────────────────────────────────────────
function printSummary(report) {
  console.log('\n════════ STEP0 実測サマリ ════════');
  console.log('HORIZON_Y = ' + HORIZON_Y + ' (BAND_TOP ' + BAND_TOP + ' - VERGE_H ' + VERGE_H + ')  TILE=' + TILE_SIZE);

  console.log('\n─── (1) skyPx = HORIZON_Y - camY  ★最小値のみが意味を持つ ───');
  console.log('  viewport      samples   camY(min..max)          skyPx最小   skyPx最大');
  for (const r of report.viewports) {
    const T = r.dump.agg.trace;
    console.log('  ' + r.vp.padEnd(13) + String(T.n).padEnd(9) +
      (T.camYmin.toFixed(1) + '..' + T.camYmax.toFixed(1)).padEnd(24) +
      (HORIZON_Y - T.camYmax).toFixed(1).padStart(9) + 'px' +
      (HORIZON_Y - T.camYmin).toFixed(1).padStart(10) + 'px');
  }
  console.log('  ※ 最悪サンプル (camY 最大 = 空が一番狭い瞬間) の内訳:');
  for (const r of report.viewports) {
    const t = r.dump.agg.trace.topCamY[0];
    if (t) console.log('    ' + r.vp.padEnd(13) + JSON.stringify(t));
  }

  console.log('\n─── (2) 母集団健全性 (0件があれば測定自体が無効) ───');
  console.log('  viewport      trace   combat   focus   tight   shakeFrames  shakeCalls  waves');
  for (const r of report.viewports) {
    const T = r.dump.agg.trace;
    console.log('  ' + r.vp.padEnd(13) + String(T.n).padEnd(8) +
      String(T.phases['combat'] || 0).padEnd(9) + String(T.nFocus).padEnd(8) +
      String(T.nTight).padEnd(8) + String(T.nShake).padEnd(13) +
      String(r.dump.shakeCalls).padEnd(12) + r.dump.agg.waves.length + '/3');
  }

  console.log('\n─── (3) 遮蔽コスト: 帯行 × HUD (STEP1 の camY を前借りして観測位置に当てた値) ───');
  console.log('  ⚠️ ユニット y は現行28行マップの実測位置。STEP1 では帯 N 行に閉じ込められるので');
  console.log('     この数字は悲観側の上界。帯内に居た割合は下の rowsSeen を参照。');
  for (const r of report.viewports) {
    console.log('  [' + r.vp + ']  usableH keep=' + r.pre.hud.usableH_keep + ' reclaim=' + r.pre.hud.usableH_reclaim);
    console.log('    構成          予測skyPx  予測camY   ユニット遮蔽        (上外/下外)      馬車遮蔽');
    for (const n of BAND_ROWS_SET) for (const h of HUD_MODES) {
      const k = n + '/' + h;
      const o = r.dump.agg.occl[k];
      const p = r.pre.predict[h].rows['rows' + n];
      if (!o) continue;
      const pct = o.units ? (o.unitsHidden / o.units * 100) : 0;
      const wp = o.wagon ? (o.wagonHidden / o.wagon * 100) : 0;
      console.log('    ' + (n + '行/' + h).padEnd(14) +
        (p.skyPx + 'px').padStart(9) + String(p.camY).padStart(10) + '   ' +
        (pct.toFixed(1) + '% (' + o.unitsHidden + '/' + o.units + ')').padEnd(20) +
        (o.unitsOffTop + '/' + o.unitsOffBottom).padEnd(17) +
        wp.toFixed(1) + '% (' + o.wagonHidden + '/' + o.wagon + ')');
    }
    const rs = r.dump.agg.rowsSeen;
    const rows = Object.keys(rs).map(Number).sort((a, b) => a - b);
    const tot = rows.reduce((s, k) => s + rs[k], 0);
    console.log('    rowsSeen (ユニットが実際に居た行): ' +
      rows.map(k => k + ':' + rs[k]).join(' ') + '  (計 ' + tot + ')');
    for (const n of BAND_ROWS_SET) {
      const inBand = rows.filter(k => k >= BAND_TOP_ROW && k < BAND_TOP_ROW + n).reduce((s, k) => s + rs[k], 0);
      console.log('      → 帯' + n + '行(row ' + BAND_TOP_ROW + '..' + (BAND_TOP_ROW + n - 1) + ')内に居た割合: ' +
        (tot ? (inBand / tot * 100).toFixed(1) : '0') + '% (' + inBand + '/' + tot + ')');
    }
  }

  console.log('\n─── (4) ★馬車の占有タイル数 (計画書 §7-6 の未解決リスク) ───');
  for (const r of report.viewports) {
    const w = r.dump.agg.wagon;
    if (!w) { console.log('  ' + r.vp + ': 馬車サンプルなし'); continue; }
    console.log('  [' + r.vp + '] displaySize=' + w.displaySize +
      '  中心タイル=(' + w.centerTile + ')  world=(' + w.x + ',' + w.y + ')');
    console.log('    論理占有 (getUnitOccupiedTiles が馬車由来で増やすタイル数) = ' + w.logicalTiles + ' タイル');
    console.log('    当たり判定フットプリント = ' + w.hitboxCols + '列 x ' + w.hitboxRows + '行 = ' +
      w.hitboxTiles + ' タイル  (tx ' + w.hitboxTx.join('..') + ' / ty ' + w.hitboxTy.join('..') + ')');
    console.log('    帯を塞ぐ行数: ' + JSON.stringify(w.bandRowsBlocked));
  }

  console.log('\n─── (5) 帯の切断率 (帯の1列でも全行が占有されているフレームの比率) ───');
  console.log('  viewport      帯行  全域: 切断フレーム率        平均切断列  馬車±8列: 切断フレーム率');
  for (const r of report.viewports) {
    for (const n of BAND_ROWS_SET) {
      const c = r.dump.agg.cut['rows' + n];
      if (!c || !c.frames) continue;
      console.log('  ' + r.vp.padEnd(13) + String(n).padEnd(6) +
        ((c.framesWithCut / c.frames * 100).toFixed(2) + '% (' + c.framesWithCut + '/' + c.frames + ')').padEnd(26) +
        (c.cutCols / c.frames).toFixed(2).padStart(10) + '   ' +
        (c.localFrames ? (c.localFramesWithCut / c.localFrames * 100).toFixed(2) + '% (' +
          c.localFramesWithCut + '/' + c.localFrames + ')' : 'n/a'));
    }
  }

  console.log('\n─── (6) bottomHud の再計算箇所 (単一ソース化漏れ) ───');
  for (const s of report.hudSitesStatic) console.log('  L' + String(s.line).padEnd(6) + '[' + s.kind + '] ' + s.text.slice(0, 96));
  console.log('  実行時の値:');
  for (const r of report.viewports) {
    const H = r.pre.hud;
    console.log('  ' + r.vp.padEnd(13) + 'UI_LOG_HEIGHT=' + H.UI_LOG_HEIGHT + ' UI_MINIBAR_H=' + H.UI_MINIBAR_H +
      ' → computeCameraTarget/isInComfortZone/offscreenAmountAt=' + H.computeCameraTarget +
      ' / speechOnScreen=' + H.speechOnScreen +
      (H.speechOnScreen === H.computeCameraTarget ? '  (一致)' : '  ★不一致 ' + (H.computeCameraTarget - H.speechOnScreen) + 'px'));
  }

  console.log('\n─── STEP1 が据える予定の camY (予測・参考) ───');
  for (const r of report.viewports) {
    for (const h of HUD_MODES) {
      const p = r.pre.predict[h];
      console.log('  ' + r.vp.padEnd(13) + h.padEnd(9) + 'usableH=' + String(p.usableH).padEnd(6) +
        BAND_ROWS_SET.map(n => n + '行:空' + p.rows['rows' + n].skyPx + 'px(' + p.rows['rows' + n].skyPct + '%)').join('  '));
    }
  }
}

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv = null, browser = null;
  const report = { generatedAt: new Date().toISOString(), speed: SPEED, budgetMs: BUDGET_MS, viewports: [] };

  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    srv = await startServer(PORT);
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] http サーバ: ' + BASE + ' (root=' + ROOT + ')');
    console.log('[drv] speed=' + SPEED + (SPEED > 1 ? '  ⚠️ 実尺ではない (数字を出すときは --speed 1)' : ' (実プレイ実尺)'));

    const profile = path.join(os.tmpdir(), 'df_pptr_profile_step0');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + profile],
    });

    // ── (6) 静的スキャン ────────────────────────────────────────────────
    mark('bottomHud 再計算箇所の静的スキャン');
    const hudSites = scanHudSites();
    report.hudSitesStatic = hudSites;
    for (const s of hudSites) console.log('    L' + s.line + '  [' + s.kind + ']  ' + s.text.slice(0, 100));

    for (const vp of VIEWPORTS) {
      mark('実プレイ計測: ' + vp.name + ' (' + vp.width + 'x' + vp.height + ')');
      const r = await runViewport(browser, BASE, vp);
      report.viewports.push(r);

      const T = r.dump.agg.trace;
      const skyMin = HORIZON_Y - T.camYmax;
      const skyMax = HORIZON_Y - T.camYmin;
      console.log('    → ' + r.reason + ' / ' + Math.round(r.elapsedMs / 1000) + 's / trace=' + T.n +
        ' / samples=' + r.dump.agg.samples + ' / waves=' + r.dump.agg.waves.length);

      // ── 測定の前提 ──
      check('(P-' + vp.name + ') 隊商護衛が実際にロードされている (FIELD_MODE / waves / wagonSpawns)',
        r.pre.isFieldTheme === true && r.pre.fieldMode === true && r.dump.hasWaves && r.dump.hasWagonSpawns,
        'IS_FIELD_THEME=' + r.pre.isFieldTheme + ' FIELD_MODE=' + r.pre.fieldMode +
        ' waves=' + r.dump.hasWaves + ' wagonSpawns=' + r.dump.hasWagonSpawns +
        ' title="' + r.dump.scenarioTitle + '"');
      check('(P2-' + vp.name + ') ?autoplay を使っていない (shake / tight が構造的に死んでいない)',
        !r.pre.autoplay, '__autoplay=' + r.pre.autoplay);
      check('(P3-' + vp.name + ') シームが例外を出していない (__camTraceErr === 0)',
        r.dump.traceErr === 0, '__camTraceErr=' + r.dump.traceErr);
      check('(P4-' + vp.name + ') pageerror 0', r.pageErrors.length === 0,
        r.pageErrors.length ? r.pageErrors.slice(0, 4).join(' | ') : 'none');

      // ── (1) skyPx 最小値 ──
      check('(1-' + vp.name + ') 実描画カメラを 1 件以上記録できた', T.n > 0, 'trace=' + T.n + ' 件');
      console.log('    (1) skyPx = HORIZON_Y - camY :  最小 ' + skyMin.toFixed(1) + 'px' +
        '  最大 ' + skyMax.toFixed(1) + 'px  (camY ' + T.camYmin.toFixed(1) + '..' + T.camYmax.toFixed(1) + ')');

      // ── (2) 母集団健全性 ──
      const nCombat = T.phases['combat'] || 0;
      check('(2a-' + vp.name + ') phase==="combat" のサンプルが 1 件以上', nCombat > 0,
        'combat=' + nCombat + ' / phases=' + JSON.stringify(T.phases));
      check('(2b-' + vp.name + ') focus:true のサンプルが 1 件以上', T.nFocus > 0, 'focus=' + T.nFocus);
      check('(2c-' + vp.name + ') tight:true のサンプルが 1 件以上', T.nTight > 0,
        'tight=' + T.nTight + ' (cameraTightFocus = 遠距離弾の追従中のみ true)');
      check('(2d-' + vp.name + ') shake フレームが 1 件以上', T.nShake > 0,
        'shakeFrames=' + T.nShake + ' / triggerScreenShake 呼び出し=' + r.dump.shakeCalls);
      check('(2e-' + vp.name + ') 3 ウェーブ完走 (母集団がクエスト全体を覆っている)',
        r.dump.agg.waves.length >= 3, 'waves=' + r.dump.agg.waves.length + '/3 reason=' + r.reason);

      // ── (6) 単一ソース ──
      const H = r.pre.hud;
      check('(6-' + vp.name + ') bottomHud を再計算する3箇所が同値',
        H.computeCameraTarget === H.isInComfortZone && H.isInComfortZone === H.offscreenAmountAt,
        'computeCameraTarget=' + H.computeCameraTarget + ' isInComfortZone=' + H.isInComfortZone +
        ' offscreenAmountAt=' + H.offscreenAmountAt);
      // ★ 測定項目6の本体。speechOnScreen [index.html:6921] だけ UI_MINIBAR_H を足し忘れている。
      //   compact (モバイル) でのみ顕在化し、desktop では UI_MINIBAR_H=0 なので沈黙する。
      //   計画書 STEP1 が cameraBottomHud() へ通す5箇所のうち、ここが唯一の実在する漏れ。
      finding('(6b-' + vp.name + ') speechOnScreen の下端が他3箇所と同値か [STEP1 で修正予定]',
        H.speechOnScreen === H.computeCameraTarget,
        'speechOnScreen=' + H.speechOnScreen + ' (UI_LOG_HEIGHT のみ) vs 他=' + H.computeCameraTarget +
        ' → 差 ' + (H.computeCameraTarget - H.speechOnScreen) + 'px (= UI_MINIBAR_H)');
    }

    // ── レポート出力 ────────────────────────────────────────────────────
    const outFile = path.join(OUT_DIR, 'field_step0_metrics.json');
    fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
    console.log('\n[drv] 実測値 JSON: ' + outFile);

    printSummary(report);

  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n=== 測定妥当性 ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('--- FAILED (測定が無効) ---'); failed.forEach(f => console.log('  ' + f.name + ' — ' + f.detail)); }

  const dirty = findings.filter(f => !f.clean);
  console.log('=== 本体側の欠陥 ' + dirty.length + '/' + findings.length + ' 件検出 (STEP1 で修正する対象) ===');
  dirty.forEach(f => console.log('  ' + f.name + ' — ' + f.detail));

  // exit code は「測定が妥当だったか」だけを表す。欠陥の検出は成果であって失敗ではない。
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('[driver] 例外: ' + (e && e.stack || e));
  process.exit(3);
});
