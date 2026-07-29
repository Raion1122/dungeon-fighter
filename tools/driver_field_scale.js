#!/usr/bin/env node
/*
 * driver_field_scale.js — 屋外フィールドの「縮尺」回帰ガード
 * ═══════════════════════════════════════════════════════════════════════════════
 * ■ 直した欠陥 (2026-07-30)
 *   屋外シナリオ「隊商護衛」(themeId: caravan-road) の地面が **キャラ等身大の物で埋まっていた**。
 *   物差し = 味方6職の 96px セル / インク体高 **57px**。これを身長 1.70m と置くと 1px ≒ 2.98cm。
 *
 *   (1) 散布物 (SCENERY_SHEETS.displayMax) — 実測:
 *         赤キノコ/茶キノコ/シダ/頭骨 = 60px = **179cm 相当 (体高比 1.05x)**
 *         草の房 = 80px = 239cm (1.40x) / 倒木の**太さ** = 51〜58px = **174cm** (キャラの全身と同じ太さ)
 *   (2) 床テクスチャ (caravan_road_floor.png 1254² を createPattern で **等倍**敷き) — Pillow 実測:
 *         落ち葉 40px = **119cm** (実物 10〜15cm → 8〜12倍) / 枯れ草の房 83〜136px = **248〜406cm**
 *         (体高比 1.46〜2.39x) / 明るい岩 最大 66px = 197cm (7個中2個がキャラより大きい)
 *
 * ■ 修正
 *   (1) grass 80→40 / log 200→130 / detail 60→**variant別配列** [26,28,16,16,22,28,14,24]
 *       (detail は苔石・キノコ・シダ・頭骨・枝束の混載シートで実物の寸法が10倍違う = 単一値では不可能)
 *   (2) SCENARIO_TEX["caravan-road"].floorScale = 0.45 を新設。読み込み時にオフスクリーン canvas へ
 *       焼いてからパターン化する (周期 1254 → 564px)。**屋内6シナリオは floorScale を持たない = 等倍のまま**。
 *   (3) 焚火の薪 CW 130→56 (log の 130 と別値に保つ = 倒木と薪を見分けられるように)
 *
 * ■ ⚠️⚠️ この欠陥が「素朴な測定では絶対に見つからない」ことの記録 (同じ轍を踏まないため)
 *   ・FFT の radial power peak は **9.2px** を返す。これは支配的な「筆致のノイズ」で、
 *     疎に散る大きなモチーフ (落ち葉・枯れ草) を構造的に拾わない。
 *   ・緑判定 (G>R+6 && G>B+18) は床に対し **0.0%** を返す。落ち葉はオレンジ・枯れ草はタンなので
 *     **原理的に検出不可能**。この 0% を見て一度「床は問題なし」と誤結論した。
 *   → 等倍敷きテクスチャの縮尺は「1画面ぶん切り出してキャラを並べ、目で見る」しかない。
 *     本ドライバは *それを数値化した後* の回帰ガードであって、発見器ではない。
 *
 * ■ ⚠️ displayMax は当たり判定に**一切**関与しない (F でそれ自体を実証する)
 *   衝突は blocking[variant] が obstacleTileMask に立てるタイル単位の旗だけで決まる (index.html:3665-3684)。
 *   よって本変更はゲームプレイに影響しない。負のコントロールで F が**不変**であることがその証拠。
 *
 * ■ 負のコントロール (必須)
 *     git worktree add %TEMP%\df_wt_scale HEAD --detach
 *     node tools/driver_field_scale.js --port 8860 --root %TEMP%\df_wt_scale --label HEAD
 *     git worktree remove --force %TEMP%\df_wt_scale
 *   修正前は B1/B2/B3/B4 と D1〜D5 が FAIL へ反転し、A/E/F/G の一部は PASS のまま残る
 *   (= 物差しと屋内非退行は変更の影響外であることを同時に示す)。
 *   ⚠️ ポートは本番と 4 以上離す (このプロジェクトの既知の地雷: field ドライバは port+1 も掴む個体がある)。
 *
 * 使い方: node tools/driver_field_scale.js [--port N] [--root DIR] [--label NAME] [--browser PATH]
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.join(__dirname, '..')));
const PORT = parseInt(arg('port', '8856'), 10);
const LABEL = arg('label', 'working');

// ── 判定の物差し ─────────────────────────────────────────────────────────────
const CHAR_H_MIN = 55, CHAR_H_MAX = 58;   // 味方6職のインク体高 (実測 57px。codex1 差替後も 55〜56 に揃っている)
const CHAR_H_REF = 57;
const CM_PER_PX = 170 / CHAR_H_REF;       // ≒ 2.98cm
// 上限は「現実の寸法から逆算した値」ではなく **「キャラ等身大に見えない」ための天井**。
//   草の房  : 人の腰より低く見えるべき → 0.75x
//   小物    : 人の膝より低く見えるべき → 0.55x
//   倒木の太さ: またげる太さに見えるべき → 0.75x (長さは制限しない = 倒木は長くて自然)
const CAP_GRASS_LONG  = 0.75;
const CAP_DETAIL_LONG = 0.55;
const CAP_LOG_THICK   = 0.75;
const MIN_ANY_LONG_PX = 10;               // これ未満は「何の物体か読めない粒」= 縮めすぎ
const EXPECT_FLOOR_SCALE = 0.45;
const FLOOR_SRC_NATURAL  = 1254;
const CAP_FLOOR_LEAF     = 0.35;          // 落ち葉の実効寸法の天井 (源 40px × floorScale)
const FLOOR_LEAF_SRC_PX  = 40;            // Pillow 実測: 床に描き込まれた落ち葉の長辺 (源画素)

const INDOOR = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];

const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
  waves: [{ count: 3, pool: ['goblin', 'goblinArcher'] }],
  wagonSpawns: [{ tx: 9, ty: 14 }],
};

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const ex = arg('browser', null);
  if (ex) return ex;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, root) {
  return new Promise((res2, rej) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const fp = path.join(root, u);
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
      res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(fp).pipe(res);
    });
    srv.on('error', rej);
    srv.listen(port, () => res2(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(m) { console.log('\n[drv] ' + (++step) + ' ' + m); }

function prelude(cfg) {
  try {
    if (cfg.payload) {
      sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
      sessionStorage.removeItem('dragonfighters.currentScenario');
    } else {
      sessionStorage.removeItem('dragonfighters.generatedScenario');
      sessionStorage.setItem('dragonfighters.currentScenario', cfg.scenarioId);
    }
    sessionStorage.removeItem('dragonfighters.questFlags');
  } catch (e) {}
  const FIXED = 1750000000000;
  try { Date.now = function () { return FIXED; }; } catch (e) {}
  let s = 123456789 >>> 0;
  try { Math.random = function () { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 1) / 2147483648; }; } catch (e) {}
  // Pass 1b.6 の scenery drawImage を記録する (実描画寸法の実測用)。
  // ⚠️ ページ読込**前**に prototype を差し替える。後差しでも renderMap は毎回 prototype 経由で
  //    解決するので効くが、初回描画を取りこぼす。
  window.__dwLog = [];
  const D = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img) {
    if (window.__dwOn && arguments.length === 9) {
      const src = (img && img.src) ? String(img.src) : '';
      if (src) window.__dwLog.push({ src: src.split('/').pop(), dw: arguments[7], dh: arguments[8] });
    }
    return D.apply(this, arguments);
  };
}

async function boot(browser, url, cfg, vp) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, cfg);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof renderMap === 'function' && !!mapData && !!mapCanvas && tilesetLoaded && !!floorPattern; }
    catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
  return { page, pageErrors };
}

// ── ページ内プローブ群 ───────────────────────────────────────────────────────

function probeRuler() {
  const el = document.getElementById('player');
  const r = el ? el.getBoundingClientRect() : null;
  const cs = el ? getComputedStyle(el) : null;
  return {
    playerW: r ? Math.round(r.width) : null,
    playerH: r ? Math.round(r.height) : null,
    bgSize: cs ? cs.backgroundSize : null,
    tile: TILE_SIZE,
  };
}

// warrior_walk.png の row3 のインク体高を、ページ内で実画素から測る。
function probeCharInk() {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      try {
        const cols = 6, rows = 4;
        const fw = im.naturalWidth / cols, fh = im.naturalHeight / rows;
        const c = document.createElement('canvas');
        c.width = fw; c.height = fh;
        const g = c.getContext('2d', { willReadFrequently: true });
        const out = [];
        for (let col = 0; col < cols; col++) {
          g.clearRect(0, 0, fw, fh);
          g.drawImage(im, col * fw, 3 * fh, fw, fh, 0, 0, fw, fh);
          const d = g.getImageData(0, 0, fw, fh).data;
          let top = -1, bot = -1;
          for (let y = 0; y < fh; y++) {
            let any = false;
            for (let x = 0; x < fw; x++) { if (d[(y * fw + x) * 4 + 3] > 64) { any = true; break; } }
            if (any) { if (top < 0) top = y; bot = y; }
          }
          out.push(top < 0 ? 0 : bot - top + 1);
        }
        resolve({ frameW: fw, frameH: fh, inkHeights: out });
      } catch (e) { resolve({ err: String(e) }); }
    };
    im.onerror = () => resolve({ err: 'load failed' });
    im.src = 'assets/warrior_walk.png?v=8';
  });
}

function probeScenery() {
  const out = { sheets: {}, recipeKinds: [], placements: 0, blockingPlacements: 0, obstacleOnes: 0 };
  for (const [k, s] of Object.entries(SCENERY_SHEETS)) {
    const frames = SCENERY_FRAMES[k];
    out.sheets[k] = {
      displayMax: s.displayMax,
      isArray: Array.isArray(s.displayMax),
      loaded: !!s.loaded,
      variants: frames.map((f, i) => {
        const dmax = Array.isArray(s.displayMax) ? s.displayMax[i] : s.displayMax;
        const sc = dmax / Math.max(f.w, f.h);
        return { i, dispW: Math.round(f.w * sc), dispH: Math.round(f.h * sc) };
      }),
    };
  }
  const rec = SCENERY_RECIPES[_scenIdForTex];
  if (rec) {
    const kinds = new Set();
    for (const key of Object.keys(rec)) for (const k of Object.keys(rec[key].counts)) kinds.add(k);
    out.recipeKinds = [...kinds].sort();
  }
  out.placements = sceneryPlacements.length;
  out.blockingPlacements = sceneryPlacements.filter(p => p.blocking).length;
  let n = 0;
  for (let i = 0; i < obstacleTileMask.length; i++) if (obstacleTileMask[i] === 1) n++;
  out.obstacleOnes = n;
  return out;
}

function probeDrawn() {
  window.__dwLog = [];
  window.__dwOn = true;
  renderMap();
  window.__dwOn = false;
  const byFile = {};
  for (const e of window.__dwLog) {
    const f = e.src.split('?')[0];
    if (!byFile[f]) byFile[f] = { n: 0, maxLong: 0, maxShort: 0, minLong: 1e9 };
    const b = byFile[f];
    b.n++;
    const lo = Math.max(e.dw, e.dh), sh = Math.min(e.dw, e.dh);
    if (lo > b.maxLong) b.maxLong = Math.round(lo);
    if (sh > b.maxShort) b.maxShort = Math.round(sh);
    if (lo < b.minLong) b.minLong = Math.round(lo);
  }
  return byFile;
}

// live な floorPattern を自前 canvas に敷いて **実効周期** を測る。
// ⚠️ 合成後の mapCanvas を読むのは不可 (scenery / 雲の影 / 焚火のブルームが x 依存で乗るため)。
//    floorPattern オブジェクト自身を敷けば、実際にインストールされている物を直接測れる。
function probeFloorPeriod(cands) {
  const W = 2600, H = 48;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = floorPattern;
  g.fillRect(0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const matchRatio = (shift) => {
    let same = 0, tot = 0;
    for (let y = 0; y < H; y += 4) {
      for (let x = 0; x + shift < W; x += 3) {
        const a = (y * W + x) * 4, b = (y * W + x + shift) * 4;
        tot++;
        if (d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2]) same++;
      }
    }
    return tot ? same / tot : 0;
  };
  const out = { declaredScale: (typeof _texSet !== 'undefined' && _texSet.floorScale) || null, ratios: {} };
  for (const s of cands) out.ratios[s] = +matchRatio(s).toFixed(4);
  try {
    out.srcNatural = floorTex1.naturalWidth;
    if (typeof makeFloorPatternSource === 'function') {
      const src = makeFloorPatternSource(floorTex1);
      out.patternSourceW = src.width || src.naturalWidth || null;
    } else out.patternSourceW = 'fn-absent';
  } catch (e) { out.patternSourceW = 'err:' + e; }
  return out;
}

function probeCampfireSrc() {
  const src = String(renderMap).replace(/\/\/[^\n]*/g, '');   // ⚠️ コメントを剥ぐ (自分の注記に引っかかる)
  const m = src.match(/const\s+CW\s*=\s*(\d+)/);
  return { cw: m ? parseInt(m[1], 10) : null, logMax: SCENERY_SHEETS.log.displayMax };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer(PORT, ROOT);
  console.log(`[drv] label=${LABEL}  serve ${ROOT}  :${PORT}`);
  console.log(`[drv] 物差し: キャラ体高 ${CHAR_H_REF}px = 170cm → 1px = ${CM_PER_PX.toFixed(2)}cm`);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' +
      path.join(os.tmpdir(), 'df_pptr_profile_' + Date.now())],
    protocolTimeout: 240000,
  });
  const URL = 'http://localhost:' + PORT + '/index.html';

  // ═══ 屋外 (caravan-road) ═══
  const { page, pageErrors } = await boot(browser, URL, { payload: CARAVAN_PAYLOAD },
    { width: 1440, height: 900 });

  mark('A. 物差しの実在確認 (ここが崩れると以降の assert は別のものを測る)');
  const ruler = await page.evaluate(probeRuler);
  const ink = await page.evaluate(probeCharInk);
  console.log('   ' + JSON.stringify(ruler) + '  ink=' + JSON.stringify(ink.inkHeights || ink));
  check('A1 主人公のセルが 96x96 (TILE_SIZE と一致)',
    ruler.playerW === 96 && ruler.playerH === 96 && ruler.tile === 96,
    `${ruler.playerW}x${ruler.playerH} / TILE=${ruler.tile}`);
  check('A2 walk シートが等倍表示 (bgSize がファイル寸法 576x384 と一致)',
    ruler.bgSize === '576px 384px', String(ruler.bgSize));
  const inks = ink.inkHeights || [];
  const inkOk = inks.length === 6 && inks.every(h => h >= CHAR_H_MIN && h <= CHAR_H_MAX);
  check(`A3 walk row3 の全6コマのインク体高が ${CHAR_H_MIN}〜${CHAR_H_MAX}px`,
    inkOk, JSON.stringify(inks));
  check('A4 コマ寸法が 96x96 (=セルと一致 / 縮小拡大が挟まっていない)',
    ink.frameW === 96 && ink.frameH === 96, `${ink.frameW}x${ink.frameH}`);

  mark('B. 散布物の displayMax がキャラ等身大の天井を下回る');
  const sc = await page.evaluate(probeScenery);
  const capG = CAP_GRASS_LONG * CHAR_H_REF, capD = CAP_DETAIL_LONG * CHAR_H_REF, capL = CAP_LOG_THICK * CHAR_H_REF;
  const gV = sc.sheets.grass.variants, dV = sc.sheets.detail.variants, lV = sc.sheets.log.variants;
  const gMax = Math.max(...gV.map(v => Math.max(v.dispW, v.dispH)));
  const dMax = Math.max(...dV.map(v => Math.max(v.dispW, v.dispH)));
  const lThick = Math.max(...lV.map(v => Math.min(v.dispW, v.dispH)));
  const allLong = [...gV, ...dV, ...lV].map(v => Math.max(v.dispW, v.dispH));
  console.log(`   grass 長辺max=${gMax}px(${(gMax * CM_PER_PX).toFixed(0)}cm) / ` +
              `detail 長辺max=${dMax}px(${(dMax * CM_PER_PX).toFixed(0)}cm) / ` +
              `log 太さmax=${lThick}px(${(lThick * CM_PER_PX).toFixed(0)}cm)`);
  console.log('   detail variants = ' + JSON.stringify(dV.map(v => `${v.dispW}x${v.dispH}`)));
  check(`B1 草の房の長辺 <= ${capG.toFixed(1)}px (体高比 ${CAP_GRASS_LONG})`,
    gMax <= capG, `実測 ${gMax}px = 体高比 ${(gMax / CHAR_H_REF).toFixed(2)}x`);
  check(`B2 小物の長辺 <= ${capD.toFixed(1)}px (体高比 ${CAP_DETAIL_LONG})`,
    dMax <= capD, `実測 ${dMax}px = 体高比 ${(dMax / CHAR_H_REF).toFixed(2)}x`);
  check(`B3 倒木の太さ <= ${capL.toFixed(1)}px (体高比 ${CAP_LOG_THICK})`,
    lThick <= capL, `実測 ${lThick}px = 体高比 ${(lThick / CHAR_H_REF).toFixed(2)}x`);
  check('B4 detail の displayMax が variant 別配列 (混載シートに単一値を戻していない)',
    sc.sheets.detail.isArray === true && sc.sheets.detail.displayMax.length === dV.length,
    JSON.stringify(sc.sheets.detail.displayMax));
  // ⚠️ 上限だけの assert は「0 にすれば通る」ので下限も置く (縮めすぎの検出)
  check(`B5 全 variant の長辺 >= ${MIN_ANY_LONG_PX}px (何の物体か読めない粒まで縮めていない)`,
    Math.min(...allLong) >= MIN_ANY_LONG_PX, `最小 ${Math.min(...allLong)}px`);
  check('B6 屋外のレシピが grass/detail/log の3種のみ (reed/rubble/cart/rail を巻き込んでいない)',
    JSON.stringify(sc.recipeKinds) === JSON.stringify(['detail', 'grass', 'log']),
    JSON.stringify(sc.recipeKinds));

  mark('C. 実描画寸法が宣言値と一致する (drawImage を実測)');
  const drawn = await page.evaluate(probeDrawn);
  for (const f of ['grass_tufts.png', 'swamp_detail.png', 'fallen_logs.png']) {
    const b = drawn[f];
    console.log(`   ${f}: ${b ? `n=${b.n} 長辺max=${b.maxLong} 短辺max=${b.maxShort} 長辺min=${b.minLong}` : '(未描画)'}`);
  }
  const dg = drawn['grass_tufts.png'], dd = drawn['swamp_detail.png'], dl = drawn['fallen_logs.png'];
  check('C1 3シート全てが実際に描画された (カリングで空振りしていない)',
    !!dg && !!dd && !!dl && dg.n > 0 && dd.n > 0 && dl.n > 0,
    `grass=${dg ? dg.n : 0} detail=${dd ? dd.n : 0} log=${dl ? dl.n : 0}`);
  check(`C2 実描画の草の長辺 <= ${capG.toFixed(1)}px`, !!dg && dg.maxLong <= capG,
    dg ? `${dg.maxLong}px` : 'n/a');
  check(`C3 実描画の小物の長辺 <= ${capD.toFixed(1)}px`, !!dd && dd.maxLong <= capD,
    dd ? `${dd.maxLong}px` : 'n/a');
  // ⚠️ log は焚火の薪 (56px) も同じシートを使うので、太さの max は倒木側で決まる
  check(`C4 実描画の倒木の太さ <= ${capL.toFixed(1)}px`, !!dl && dl.maxShort <= capL,
    dl ? `${dl.maxShort}px` : 'n/a');

  mark('D. 床パターンが縮小されて敷かれている (等倍敷きの解消)');
  const P = Math.round(FLOOR_SRC_NATURAL * EXPECT_FLOOR_SCALE);
  const fp = await page.evaluate(probeFloorPeriod, [P, FLOOR_SRC_NATURAL]);
  console.log('   ' + JSON.stringify(fp));
  check(`D1 floorScale が宣言されている (=${EXPECT_FLOOR_SCALE})`,
    fp.declaredScale === EXPECT_FLOOR_SCALE, String(fp.declaredScale));
  check(`D2 パターン源の寸法が ${P}px (源 ${FLOOR_SRC_NATURAL}px から焼き直されている)`,
    fp.patternSourceW === P, String(fp.patternSourceW));
  check(`D3 live な床パターンが ${P}px 周期で一致する (>=0.99)`,
    fp.ratios[P] >= 0.99, `一致率 ${fp.ratios[P]}`);
  check(`D4 ${FLOOR_SRC_NATURAL}px 周期では一致しない (<0.95 = 等倍敷きに戻っていない)`,
    fp.ratios[FLOOR_SRC_NATURAL] < 0.95, `一致率 ${fp.ratios[FLOOR_SRC_NATURAL]}`);
  // ⚠️⚠️ D5 は初版で **定数 EXPECT_FLOOR_SCALE から leafPx を計算していたため、負のコントロール
  //    (HEAD) でも PASS する空振り assert だった**(恒久教訓4「assert は改修前に必ず FAIL する
  //    ことを先に確認する」の実例)。→ **実測値** patternSourceW / srcNatural から倍率を導く。
  //    HEAD には makeFloorPatternSource が無い = 縮小機構が存在しない = 倍率 1.0 として扱う。
  const liveScale = (typeof fp.patternSourceW === 'number' && fp.srcNatural)
    ? fp.patternSourceW / fp.srcNatural : 1.0;
  const leafPx = FLOOR_LEAF_SRC_PX * liveScale;
  check(`D5 床の落ち葉の実効寸法 <= ${(CAP_FLOOR_LEAF * CHAR_H_REF).toFixed(1)}px (実測倍率から導出)`,
    leafPx <= CAP_FLOOR_LEAF * CHAR_H_REF,
    `実測倍率 ${liveScale.toFixed(3)} → 落ち葉 ${leafPx.toFixed(0)}px = ` +
    `${(leafPx * CM_PER_PX).toFixed(0)}cm (源 ${FLOOR_LEAF_SRC_PX}px = ${(FLOOR_LEAF_SRC_PX * CM_PER_PX).toFixed(0)}cm)`);

  mark('F. 当たり判定の非退行 (displayMax が衝突に無関係であることの実証値)');
  console.log(`   placements=${sc.placements} / blocking=${sc.blockingPlacements} / obstacleTileMask の 1 = ${sc.obstacleOnes}`);
  check('F1 blocking な placement が存在する (=衝突の指標が生きている)',
    sc.blockingPlacements > 0, String(sc.blockingPlacements));
  check('F2 obstacleTileMask に 1 が立っている', sc.obstacleOnes > 0, String(sc.obstacleOnes));
  console.log('   ⚠️ F1/F2 の**数値**が負のコントロール (HEAD) と一致することが、');
  console.log('      「displayMax を変えても当たり判定は 1 ビットも動かない」の証拠になる。');

  mark('G. 焚火の薪が倒木と別サイズに保たれている');
  const cf = await page.evaluate(probeCampfireSrc);
  console.log('   ' + JSON.stringify(cf));
  check('G1 renderMap 内の焚火の薪幅 CW が読み取れる', typeof cf.cw === 'number', String(cf.cw));
  check('G2 薪 CW < 倒木 displayMax (倒木と薪を見分けられる)',
    typeof cf.cw === 'number' && cf.cw < cf.logMax, `CW=${cf.cw} vs log=${cf.logMax}`);
  check(`G3 薪 CW <= ${(CAP_GRASS_LONG * CHAR_H_REF + 20).toFixed(0)}px (薪束としての天井)`,
    typeof cf.cw === 'number' && cf.cw <= CAP_GRASS_LONG * CHAR_H_REF + 20,
    `CW=${cf.cw}px = ${(cf.cw * CM_PER_PX).toFixed(0)}cm`);

  check('H1 屋外でページ例外なし', pageErrors.length === 0, pageErrors.join(' | ') || 'なし');
  await page.close();

  // ═══ 屋内6シナリオ 非退行 ═══
  mark('E. 屋内6シナリオが完全に影響外である (構造的な証明)');
  for (const id of INDOOR) {
    const b = await boot(browser, URL, { scenarioId: id }, { width: 1024, height: 720 });
    const info = await b.page.evaluate(() => {
      const rec = SCENERY_RECIPES[_scenIdForTex];
      const kinds = new Set();
      if (rec) for (const k of Object.keys(rec)) for (const kk of Object.keys(rec[k].counts)) kinds.add(kk);
      let psw = 'fn-absent';
      if (typeof makeFloorPatternSource === 'function') {
        const s = makeFloorPatternSource(floorTex1);
        psw = s.width || s.naturalWidth || null;
      }
      return {
        scen: _scenIdForTex,
        floorScale: (typeof _texSet !== 'undefined')
          ? (_texSet.floorScale === undefined ? 'undefined' : _texSet.floorScale) : 'n/a',
        srcNatural: floorTex1.naturalWidth,
        patternSourceW: psw,
        kinds: [...kinds].sort(),
      };
    });
    const touched = info.kinds.filter(k => ['grass', 'detail', 'log'].includes(k));
    console.log(`   ${id}: floorScale=${info.floorScale} 源=${info.srcNatural} ` +
                `パターン源=${info.patternSourceW} kinds=${JSON.stringify(info.kinds)}`);
    check(`E-${id} floorScale 未宣言 (=等倍のまま)`, info.floorScale === 'undefined', String(info.floorScale));
    // ⚠️ 'fn-absent' (= 縮小機構そのものが無い HEAD) は「縮小されていない」と同義。
    //    ここを「関数が在ること」の検査にすると、E が測りたい **屋内の非退行** ではなく
    //    「機構が新設されたか」を測ることになり、負のコントロールで無意味に FAIL する
    //    (初版で実際にそうなった。E の価値は A/B で**不変**であることそれ自体にある)。
    const indoorUnscaled = (info.patternSourceW === 'fn-absent') || (info.patternSourceW === info.srcNatural);
    check(`E-${id} 床パターンが縮小されていない (屋内は等倍のまま)`,
      indoorUnscaled, `${info.patternSourceW} vs 源 ${info.srcNatural}`);
    check(`E-${id} 変更した3種 (grass/detail/log) を1つも使っていない`,
      touched.length === 0, JSON.stringify(touched));
    check(`E-${id} ページ例外なし`, b.pageErrors.length === 0, b.pageErrors.join(' | ') || 'なし');
    await b.page.close();
  }

  await browser.close();
  srv.close();

  const pass = results.filter(r => r.ok).length;
  console.log(`\n[drv] ${LABEL}: ${pass}/${results.length} PASS`);
  if (pass !== results.length) {
    console.log('  FAIL 一覧:');
    for (const r of results) if (!r.ok) console.log('    - ' + r.name);
  }
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
