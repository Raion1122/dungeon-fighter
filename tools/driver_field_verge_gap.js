#!/usr/bin/env node
/*
 * driver_field_verge_gap.js — 「地平線直下の路肩帯に開いた純黒の穴」修正の検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ■ 直したバグ
 *   屋外シナリオ「隊商護衛」(themeId: caravan-road) で、地平線直下の石垣(路肩)の帯の
 *   西端 2 タイル (192x96) と東端 3 タイル (288x96) が **純黒の矩形** になっていた。
 *
 * ■ 真因の鎖 (本ドライバの A がこの鎖を1本ずつ実在確認する = 空振り防止)
 *   ROOMS[0]=[8,2,19,20] が col 2 始まり → buildMap 後も mapData[13][tx] は tx=0,1,69,70,71 で 2 (wall)
 *   → isNorthWall(tx,12) がその5列だけ false
 *   → renderMap Pass 2 (路肩) が `if (!isNorthWall(...)) continue;` で弾く
 *   → Pass 1a の SPR_CEILING=[160,16,16,16] が残る。tileset.png のその 16x16 は**全画素 (0,0,0,255)**
 *   → 純黒矩形が露出。canvas 背景 #0a0a0a=(10,10,10) とは別物なので「純黒か否か」で判別できる。
 *
 * ■ 修正 (index.html / renderMap 内)
 *   const isVergeCell = FIELD_DRAW ? (tx,ty) => (ty === FIELD_HORIZON_ROW) || isNorthWall(tx,ty)
 *                                  : isNorthWall;
 *   を Pass 2 の 4 箇所 (fillRect枝 gate / フォールバック枝 gate / west・eastIsWall) に適用。
 *   屋内 (FIELD_DRAW=false) では **同一関数参照**に落ちるので既存6シナリオは不変。
 *
 * ■ 検査の骨格 (A/B の対照実験)
 *   working tree (修正後) と baseline worktree (c7d18eb = 修正前) を **別ポートで同時に serve** し、
 *   同一条件で描画して比較する。baseline で黒が出ること (B/D2) が「検査が空振りでない」証拠、
 *   working で黒が消えること (C/D1) が「直った」証拠、屋内6シナリオの画素完全一致 (E1) が非退行。
 *
 * ⚠️ **デスクトップ幅 (1440x900) で測ること。** 幅 430px 級のスマホ縦持ちでは UI_MENU_WIDTH=0 かつ
 *    camX=+409 まで押し出されるので tx=0,1 が画面外に出て「直った」と誤判定する。
 * ⚠️ ポート間隔は 4 以上空ける (このプロジェクトの既知の地雷)。working=8790 / baseline=8794。
 * ⚠️ camX は直接代入するが **camY は絶対に触らない** (drawFieldSky の空タイル確保サイズが camY 依存で
 *    青天井になる、と index.html が警告している)。
 *
 * 使い方: node tools/driver_field_verge_gap.js [--headful] [--browser <path>] [--port N] [--baseline <dir>]
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT_W = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT_W = parseInt(arg('port', '8790'), 10);
const PORT_B = PORT_W + 4;                       // ⚠️ 間隔 4 以上 (ドライバは baseline 用に port+1 も掴む慣習)
const ROOT_B = arg('baseline', path.join(os.tmpdir(), 'df_verge_baseline'));
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
  '82046c3b-f626-4667-8eba-78e0b40d3a45', 'scratchpad', 'verge_gap_shots'));

const VP = { width: 1440, height: 900 };
const EXPECT_GAP_COLS = [0, 1, 69, 70, 71];      // 路肩が敷かれない列 (= 純黒が出る列)
const BLACK_MIN = 1000;                          // baseline で「黒が出ている」と言い切る下限 (実測は 192x96 / 288x96)
const VERGE_COLORS_MIN = 20;                     // 石垣テクスチャらしさの下限 (単色の穴なら 1)
// ⚠️⚠️ 「路肩帯の純黒画素が 0 件」は **成立しない assert** である。初版でそう書いて FAIL し、
//    切り分けた結果:  assets/caravan_road_verge.png (1024x96 = 路肩ストリップそのもの) が
//    **自前で純黒 (0,0,0,255) を 40px 含む** (painterly な陰影の最暗部、row 26-34 に散在) と判明した。
//    Pillow 実測: verge=40px / floor=0 / field_mid_trees=0 / field_far_hills=0。
//    つまり「路肩が正しく敷かれている列」にも純黒は出る (baseline の tx=2..11 が実際にそうなっている
//    = A6 でそれを assert している)。よって画素単位の 0 件検査は**修正が正しくても永久に FAIL する**。
//    → 指標を「バグの正体そのもの」へ置き換える。バグは *96x96 が丸ごと黒い矩形* なので
//      (1) タイル単位の黒被覆率 (穴 = ~100%、テクスチャのノイズ = ~0.05%。4 桁離れている)
//      (2) 16x16 の全黒ブロック数 (穴 = 72 個/タイル、ノイズ = 構造的に 0 個)
//      の 2 本で測る。緩めたのではなく、**測る対象を defect に合わせた**。
const HOLE_RATIO = 0.5;                          // 帯のそのタイルの 50% 以上が純黒 = 「穴」
const NOISE_RATIO = 0.01;                        // 正常なタイルの黒被覆率の上限 (実測 ~0.0005)

const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
  waves: [{ count: 3, pool: ['goblin', 'goblinArcher'] }],
  wagonSpawns: [{ tx: 9, ty: 14 }],
};

const INDOOR_SCENARIOS = ['goblin-mine', 'bandits-forest', 'lizard-swamp',
                          'orc-fort', 'undead-temple', 'dragon-lair'];

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, root) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const fp = path.join(root, u);
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
      res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(fp).pipe(res);
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
let step = 0;
function mark(m) { console.log('\n[drv] ' + (++step) + ' ' + m); }

// ── ページ生成前に走らせる注入 ────────────────────────────────────────────────
// cfg.payload があれば生成クエスト (屋外)、無ければ cfg.scenarioId で既存シナリオ (屋内)。
// cfg.freeze=true のときは Date.now と Math.random を固定する。E1 の画素完全一致にはこれが必須:
//   ・松明の加算ブルームが `Math.sin(Date.now()/140 + ...)` で半径をゆらしている (index.html)
//   ・decorations / scenery の配置が Math.random に依存する
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
  if (cfg.freeze) {
    const FIXED = 1750000000000;
    try { Date.now = function () { return FIXED; }; } catch (e) {}
    let s = 123456789 >>> 0;
    try {
      Math.random = function () {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        return (s >>> 1) / 2147483648;
      };
    } catch (e) {}
  }
}

async function boot(browser, url, cfg) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: VP.width, height: VP.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, cfg);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof renderMap === 'function' && !!mapData && !!mapCanvas && tilesetLoaded; } catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await new Promise(r => setTimeout(r, 2500));
  // 1 フレームに固定 (rAF を潰す)。以降の描画は evaluate 内の renderMap() 直呼びだけになる。
  await page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
  return { page, pageErrors };
}

// ── ページ内に検査器を仕込む ─────────────────────────────────────────────────
function installProbe() {
  const P = {};
  const px = (c) => c.getContext('2d', { willReadFrequently: true });

  // 純黒 = R=G=B=0 かつ alpha>0。canvas 背景 #0a0a0a=(10,10,10) と確実に区別できる。
  const isBlack = (d, i) => d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0 && d[i + 3] > 0;

  P.facts = function () {
    const o = {};
    o.MAP_W = MAP_W; o.MAP_H = MAP_H; o.TILE = TILE_SIZE;
    o.row12 = []; o.row13Wall = []; o.northFalse = [];
    for (let tx = 0; tx < MAP_W; tx++) {
      o.row12.push(mapData[12][tx]);
      if (mapData[13][tx] === 2) o.row13Wall.push(tx);
      if (!isNorthWall(tx, 12)) o.northFalse.push(tx);
    }
    o.row12AllWall = o.row12.every(v => v === 2);
    o.isFieldTheme = IS_FIELD_THEME; o.fieldMode = FIELD_MODE; o.geo = FIELD_GEO_ACTIVE;
    o.wallPattern = !!wallPattern;
    o.horizonRow = FIELD_HORIZON_ROW; o.horizonY = FIELD_HORIZON_Y; o.vergeH = FIELD_VERGE_H;
    o.uiMenuW = UI_MENU_WIDTH;
    o.canvasW = mapCanvas.width; o.canvasH = mapCanvas.height;
    return o;
  };

  // SPR_CEILING の 16x16 を等倍で切り出して純黒かを直接確かめる (= 黒の出どころの実在証明)
  P.ceilingPurity = function () {
    const sx = SPR_CEILING[0], sy = SPR_CEILING[1], sw = SPR_CEILING[2], sh = SPR_CEILING[3];
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const cc = px(c);
    cc.clearRect(0, 0, sw, sh);
    cc.drawImage(tileset, sx, sy, sw, sh, 0, 0, sw, sh);
    const d = cc.getImageData(0, 0, sw, sh).data;
    let pure = 0;
    const seen = {};
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0 && d[i + 3] === 255) pure++;
      seen[d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]] = 1;
    }
    return { rect: [sx, sy, sw, sh], pure: pure, total: sw * sh, colors: Object.keys(seen) };
  };

  // camX を直接置いて 1 フレーム描く。⚠️ camY は触らない (drawFieldSky の空タイル確保が camY 依存)。
  P.renderAt = function (where) {
    const minCamX = -UI_MENU_WIDTH;
    const maxCamX = Math.max(minCamX, MAP_W * TILE_SIZE - window.innerWidth);
    camX = (where === 'east') ? maxCamX : minCamX;
    camTargetX = camX;
    renderMap();
    return { camX: camX, minCamX: minCamX, maxCamX: maxCamX,
             horizonSY: Math.round(FIELD_HORIZON_Y - camY), camY: camY };
  };

  // 路肩帯 (screen y = horizonSY .. +FIELD_VERGE_H) の純黒画素を、**ワールド tx ごとに**数える。
  // ⚠️ 生の画素数ではなく **タイルあたりの被覆率** を見るのが正しい。理由は下の HOLE_RATIO 参照。
  P.scanBand = function () {
    const hy = Math.round(FIELD_HORIZON_Y - camY);
    const y0 = Math.max(0, hy), y1 = Math.min(mapCanvas.height, hy + FIELD_VERGE_H);
    const H = Math.max(0, y1 - y0);
    const out = { hy: hy, y0: y0, y1: y1, H: H, W: mapCanvas.width, black: 0,
                  xmin: -1, xmax: -1, txs: [], perTile: {}, area: {} };
    if (H <= 0) return out;
    const d = px(mapCanvas).getImageData(0, y0, mapCanvas.width, H).data;
    const txSet = {};
    // 画面に写っている各 tx の帯面積 (端のタイルは一部しか写らないので実測する)
    for (let x = 0; x < mapCanvas.width; x++) {
      const tx = Math.floor((x + camX) / TILE_SIZE);
      out.area[tx] = (out.area[tx] || 0) + H;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < mapCanvas.width; x++) {
        const i = (y * mapCanvas.width + x) * 4;
        if (!isBlack(d, i)) continue;
        out.black++;
        if (out.xmin < 0 || x < out.xmin) out.xmin = x;
        if (x > out.xmax) out.xmax = x;
        const tx = Math.floor((x + camX) / TILE_SIZE);
        txSet[tx] = 1;
        out.perTile[tx] = (out.perTile[tx] || 0) + 1;
      }
    }
    out.txs = Object.keys(txSet).map(Number).sort(function (a, b) { return a - b; });
    return out;
  };

  // 純黒の**矩形**を数える。バグの正体は「96x96 のタイルが丸ごと (0,0,0)」なので、
  // 16x16 の全黒ブロック数で測るのが直球。painterly テクスチャの単発黒画素は
  // 16x16 を全黒で埋めることが構造的にできないので、この指標にはノイズが乗らない。
  P.solidBlackBlocks = function () {
    const BS = 16, W = mapCanvas.width, H = mapCanvas.height;
    const d = px(mapCanvas).getImageData(0, 0, W, H).data;
    let blocks = 0, black = 0;
    const list = [];
    const bbox = { x0: -1, y0: -1, x1: -1, y1: -1 };
    for (let i = 0; i < d.length; i += 4) if (isBlack(d, i)) black++;
    for (let by = 0; by + BS <= H; by += BS) {
      for (let bx = 0; bx + BS <= W; bx += BS) {
        let all = true;
        for (let y = 0; y < BS && all; y++) {
          for (let x = 0; x < BS; x++) {
            if (!isBlack(d, ((by + y) * W + (bx + x)) * 4)) { all = false; break; }
          }
        }
        if (all) {
          blocks++;
          if (list.length < 6) list.push(bx + ',' + by);
          if (bbox.x0 < 0) { bbox.x0 = bx; bbox.y0 = by; bbox.x1 = bx + BS; bbox.y1 = by + BS; }
          else {
            bbox.x0 = Math.min(bbox.x0, bx); bbox.y0 = Math.min(bbox.y0, by);
            bbox.x1 = Math.max(bbox.x1, bx + BS); bbox.y1 = Math.max(bbox.y1, by + BS);
          }
        }
      }
    }
    return { blocks: blocks, blockSize: BS, sample: list, bbox: bbox, black: black, total: W * H };
  };

  // 指定ワールド tx 範囲の、路肩帯の中央スキャンラインの色数
  P.bandColors = function (tx0, tx1) {
    const hy = Math.round(FIELD_HORIZON_Y - camY);
    const y = Math.round(hy + FIELD_VERGE_H / 2);
    if (y < 0 || y >= mapCanvas.height) return { y: y, colors: 0, n: 0, oob: true };
    const sx0 = Math.max(0, Math.round(tx0 * TILE_SIZE - camX));
    const sx1 = Math.min(mapCanvas.width, Math.round((tx1 + 1) * TILE_SIZE - camX));
    const n = Math.max(0, sx1 - sx0);
    if (n <= 0) return { y: y, colors: 0, n: 0, oob: true };
    const d = px(mapCanvas).getImageData(sx0, y, n, 1).data;
    const s = {};
    for (let i = 0; i < d.length; i += 4) s[d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]] = 1;
    return { y: y, sx0: sx0, n: n, colors: Object.keys(s).length, oob: false };
  };

  P.shot = function () { return mapCanvas.toDataURL('image/png'); };

  // 屋内の非退行比較用: カメラを固定して 2 視点を描き、それぞれの画素を dataURL 化
  P.indoorViews = function () {
    const views = [];
    const spots = [{ x: 0, y: 384 }, { x: 96 * 45, y: 384 }];
    for (let k = 0; k < spots.length; k++) {
      camX = spots[k].x; camY = spots[k].y;
      camTargetX = spots[k].x; camTargetY = spots[k].y;
      renderMap();
      views.push(mapCanvas.toDataURL('image/png'));
    }
    return views;
  };

  window.__vp = P;
  return true;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
function saveShot(dataUrl, file) {
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  if (!fs.existsSync(path.join(ROOT_B, 'index.html'))) {
    console.error('[drv] baseline worktree が見つかりません: ' + ROOT_B); process.exit(2);
  }
  let srvW = null, srvB = null, browser = null;
  const shots = [];
  const allPageErrors = [];
  try {
    srvW = await startServer(PORT_W, ROOT_W);
    srvB = await startServer(PORT_B, ROOT_B);
    const BASE_W = 'http://127.0.0.1:' + PORT_W;
    const BASE_B = 'http://127.0.0.1:' + PORT_B;
    console.log('[drv] working  ' + BASE_W + '  (' + ROOT_W + ')');
    console.log('[drv] baseline ' + BASE_B + '  (' + ROOT_B + ')');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + path.join(os.tmpdir(), 'df_pptr_profile_verge')],
    });

    const fieldCfg = { payload: CARAVAN_PAYLOAD, freeze: false };

    // 屋外 1 ページを開いて、西端・東端の両方を測って畳む共通ルーチン
    const measureField = async (base, tag) => {
      const p = await boot(browser, base + '/index.html?intel=0', fieldCfg);
      await p.page.evaluate(installProbe);
      const facts = await p.page.evaluate(() => window.__vp.facts());
      const ceil = await p.page.evaluate(() => window.__vp.ceilingPurity());
      const out = { facts: facts, ceil: ceil, pageErrors: p.pageErrors };
      for (const where of ['west', 'east']) {
        const cam = await p.page.evaluate((w) => window.__vp.renderAt(w), where);
        const band = await p.page.evaluate(() => window.__vp.scanBand());
        const all = await p.page.evaluate(() => window.__vp.solidBlackBlocks());
        // 帯の各タイルの黒被覆率 → 「穴」と「テクスチャのノイズ」を分ける
        band.holes = []; band.maxNoise = 0; band.noiseTiles = [];
        for (const k of Object.keys(band.perTile)) {
          const tx = Number(k), r = band.perTile[k] / band.area[k];
          if (r >= HOLE_RATIO) band.holes.push(tx);
          else { band.maxNoise = Math.max(band.maxNoise, r); band.noiseTiles.push(tx); }
        }
        band.holes.sort((a, b) => a - b); band.noiseTiles.sort((a, b) => a - b);
        const colGap = await p.page.evaluate((a, b) => window.__vp.bandColors(a, b),
          where === 'west' ? 0 : 69, where === 'west' ? 1 : 71);
        const colRef = await p.page.evaluate((a, b) => window.__vp.bandColors(a, b),
          where === 'west' ? 3 : 66, where === 'west' ? 4 : 67);
        const du = await p.page.evaluate(() => window.__vp.shot());
        const f = path.join(SHOT_DIR, tag + '_' + where + '.png');
        saveShot(du, f); shots.push(f);
        out[where] = { cam: cam, band: band, all: all, colGap: colGap, colRef: colRef, shot: f };
        console.log('    [' + tag + '/' + where + '] camX=' + cam.camX + ' horizonSY=' + cam.horizonSY
          + ' band=' + band.y0 + '..' + band.y1 + ' black=' + band.black + 'px'
          + ' holes=[' + band.holes.join(',') + ']'
          + ' noise=[' + band.noiseTiles.join(',') + '] maxNoise=' + (band.maxNoise * 100).toFixed(3) + '%'
          + ' solidBlk=' + all.blocks + ' canvasBlack=' + all.black
          + ' colors gap=' + colGap.colors + ' ref=' + colRef.colors);
      }
      await p.page.close();
      allPageErrors.push.apply(allPageErrors, p.pageErrors.map(m => tag + ': ' + m));
      return out;
    };

    // ══ working tree (修正後) / baseline (修正前) ═════════════════════════════
    mark('working tree (修正後) の屋外フィールドを測定');
    const W = await measureField(BASE_W, 'working');

    mark('baseline worktree (修正前 c7d18eb) の屋外フィールドを測定');
    const B = await measureField(BASE_B, 'baseline');

    // ══ A: 空振り防止 — 前提が実在すること (working tree) ══════════════════════
    mark('A: 前提の実在確認 (この検査が空振りでない証拠)');
    check('(A1) mapData[12] が全 72 列 2 (wall)',
      W.facts.row12AllWall && W.facts.row12.length === 72,
      'len=' + W.facts.row12.length + ' allWall=' + W.facts.row12AllWall);
    check('(A2) mapData[13] で 2 のまま残る列が [' + EXPECT_GAP_COLS.join(',') + ']',
      W.facts.row13Wall.join(',') === EXPECT_GAP_COLS.join(','),
      '[' + W.facts.row13Wall.join(',') + ']');
    check('(A3) isNorthWall(tx,12) が false の列が [' + EXPECT_GAP_COLS.join(',') + ']',
      W.facts.northFalse.join(',') === EXPECT_GAP_COLS.join(','),
      '[' + W.facts.northFalse.join(',') + ']');
    check('(A4) tileset の SPR_CEILING (160,16)-(176,32) が全画素 (0,0,0,255) の純黒',
      W.ceil.pure === W.ceil.total && W.ceil.total === 256,
      'pure=' + W.ceil.pure + '/' + W.ceil.total + ' distinct=' + JSON.stringify(W.ceil.colors));
    check('(A5) IS_FIELD_THEME / FIELD_MODE / FIELD_GEO_ACTIVE が true・wallPattern が非 null',
      W.facts.isFieldTheme === true && W.facts.fieldMode === true
      && W.facts.geo === true && W.facts.wallPattern === true,
      'theme=' + W.facts.isFieldTheme + ' mode=' + W.facts.fieldMode
      + ' geo=' + W.facts.geo + ' wallPattern=' + W.facts.wallPattern);
    // ⚠️ 指標が「画素 0 件」ではなく「全黒ブロック / タイル被覆率」でなければならない理由の実証。
    //    baseline の tx=2..11 は **路肩が正しく敷かれている** 列 (isNorthWall が true) なのに
    //    純黒画素を含む。= 純黒 1px の存在はバグの証拠にならない。
    check('(A6) 正しく路肩が敷かれた列にも純黒画素は出る (∴ 指標は全黒ブロック/被覆率)',
      B.west.band.noiseTiles.length > 0 && B.west.band.maxNoise < NOISE_RATIO
      && B.west.band.noiseTiles.every(tx => EXPECT_GAP_COLS.indexOf(tx) < 0),
      'baseline 西端の正常列 [' + B.west.band.noiseTiles.join(',') + '] に黒あり, 最大被覆率='
      + (B.west.band.maxNoise * 100).toFixed(4) + '% '
      + '(出どころ: assets/caravan_road_verge.png 自身が純黒 40px を含む — Pillow 実測)');

    // ══ B: baseline では黒が出る ═════════════════════════════════════════════
    mark('B: baseline (修正前) の西端で純黒が実際に出ること');
    check('(B1) baseline 西端の路肩帯に純黒が ' + BLACK_MIN + 'px 以上',
      B.west.band.black >= BLACK_MIN,
      'black=' + B.west.band.black + 'px / 帯 ' + (B.west.band.W * B.west.band.H) + 'px'
      + ' (期待 ≒ 192x96=18432)');
    check('(B2) その黒が「穴」として現れる tx が [0,1] (被覆率 >=' + (HOLE_RATIO * 100) + '%)',
      B.west.band.holes.join(',') === '0,1',
      'holes=[' + B.west.band.holes.join(',') + '] screenX ' + B.west.band.xmin + '..' + B.west.band.xmax
      + ' (camX=' + B.west.cam.camX + ', 他の列はテクスチャ由来のノイズ最大 '
      + (B.west.band.maxNoise * 100).toFixed(4) + '%)');
    // ⚠️ ブロック数を「>= N 個」で当てにいくのは筋が悪い (初版でそれをやって FAIL した)。
    //    16x16 グリッドは canvas 原点に揃うが帯は y=horizonSY(=234) から始まるので、
    //    帯に完全に収まる整列ブロックの個数は camY 次第で変わる。数ではなく **位置** を測る:
    //    「全黒ブロックが 1 個以上あり、その外接矩形が穴タイルの矩形に完全に収まる」。
    //    これは真因の理論 (穴 = 路肩が敷かれなかったタイルそのもの) からの厳密な予測であり、
    //    実測に合わせて閾値を調整したものではない。
    const holeRect = (band, cam, tile) => {
      const lo = Math.min.apply(null, band.holes), hi = Math.max.apply(null, band.holes);
      return { x0: lo * tile - cam.camX, x1: (hi + 1) * tile - cam.camX, y0: band.y0, y1: band.y1 };
    };
    const inside = (bb, r) => bb.x0 >= r.x0 && bb.x1 <= r.x1 && bb.y0 >= r.y0 && bb.y1 <= r.y1;
    const rW = holeRect(B.west.band, B.west.cam, W.facts.TILE);
    check('(B3) baseline 西端の全黒ブロックが 1 個以上・全部が穴タイル矩形の内側',
      B.west.all.blocks > 0 && inside(B.west.all.bbox, rW),
      'solidBlocks=' + B.west.all.blocks + ' bbox=' + JSON.stringify(B.west.all.bbox)
      + ' ⊆ 穴矩形 ' + JSON.stringify(rW) + ' 例: ' + B.west.all.sample.join(' '));

    // ══ C: working tree — 西端で黒が消える ═══════════════════════════════════
    mark('C: working tree (修正後) の西端で純黒の矩形が消えていること');
    check('(C1) working 西端の路肩帯に「穴」タイルが 0 件 (全タイルの黒被覆率 < '
      + (NOISE_RATIO * 100) + '%)',
      W.west.band.holes.length === 0 && W.west.band.maxNoise < NOISE_RATIO,
      'holes=[' + W.west.band.holes.join(',') + '] maxNoise=' + (W.west.band.maxNoise * 100).toFixed(4)
      + '% black=' + W.west.band.black + 'px (baseline は ' + B.west.band.black + 'px)'
      + ' camX=' + W.west.cam.camX + ' horizonSY=' + W.west.cam.horizonSY);
    check('(C2) working 西端フレームの mapCanvas 全域に 16x16 の全黒ブロックが 0 件',
      W.west.all.blocks === 0,
      'solidBlocks=' + W.west.all.blocks + ' (baseline=' + B.west.all.blocks + ')'
      + ' 素の黒画素は ' + W.west.all.black + '/' + W.west.all.total + 'px = テクスチャ由来');
    check('(C3) tx=0,1 の路肩帯中央スキャンラインが石垣テクスチャ相当の多色 (>=' + VERGE_COLORS_MIN + ')',
      W.west.colGap.colors >= VERGE_COLORS_MIN && !W.west.colGap.oob,
      'tx0-1 colors=' + W.west.colGap.colors + '/' + W.west.colGap.n + 'px'
      + '  (対照: baseline tx=3-4 = ' + B.west.colRef.colors + '色 / working tx=3-4 = '
      + W.west.colRef.colors + '色 / baseline tx=0-1 = ' + B.west.colGap.colors + '色)');

    // ══ D: working tree — 東端も塞がっている ═════════════════════════════════
    mark('D: 東端 (tx=69,70,71) も塞がっていること');
    check('(D1) working 東端の路肩帯に「穴」タイルが 0 件',
      W.east.band.holes.length === 0 && W.east.band.maxNoise < NOISE_RATIO,
      'holes=[' + W.east.band.holes.join(',') + '] maxNoise=' + (W.east.band.maxNoise * 100).toFixed(4)
      + '% black=' + W.east.band.black + 'px (baseline は ' + B.east.band.black + 'px)'
      + ' camX=' + W.east.cam.camX + '=maxCamX horizonSY=' + W.east.cam.horizonSY);
    check('(D2) baseline 東端の路肩帯には純黒が ' + BLACK_MIN + 'px 以上 (東端も同じバグだった証拠)',
      B.east.band.black >= BLACK_MIN,
      'black=' + B.east.band.black + 'px (期待 ≒ 288x96=27648)');
    check('(D2b) baseline 東端の「穴」タイルが [69,70,71]',
      B.east.band.holes.join(',') === '69,70,71',
      'holes=[' + B.east.band.holes.join(',') + '] (ノイズ列=[' + B.east.band.noiseTiles.join(',') + '])');
    const rE = holeRect(B.east.band, B.east.cam, W.facts.TILE);
    check('(D2c) baseline 東端の全黒ブロックが 1 個以上・全部が穴タイル矩形の内側',
      B.east.all.blocks > 0 && inside(B.east.all.bbox, rE),
      'solidBlocks=' + B.east.all.blocks + ' bbox=' + JSON.stringify(B.east.all.bbox)
      + ' ⊆ 穴矩形 ' + JSON.stringify(rE));
    check('(D3) working 東端フレームの mapCanvas 全域に 16x16 の全黒ブロックが 0 件',
      W.east.all.blocks === 0,
      'solidBlocks=' + W.east.all.blocks + ' (baseline=' + B.east.all.blocks + ')'
      + ' 素の黒画素は ' + W.east.all.black + '/' + W.east.all.total + 'px = テクスチャ由来');

    // ══ E: 屋内6シナリオの非退行 ═════════════════════════════════════════════
    mark('E: 屋内6シナリオが baseline と画素完全一致 (Date.now / Math.random を固定)');
    for (const sid of INDOOR_SCENARIOS) {
      const cfg = { scenarioId: sid, freeze: true };
      const grab = async (base, tag) => {
        const p = await boot(browser, base + '/index.html?intel=0', cfg);
        await p.page.evaluate(installProbe);
        const facts = await p.page.evaluate(() => window.__vp.facts());
        const views = await p.page.evaluate(() => window.__vp.indoorViews());
        await p.page.close();
        allPageErrors.push.apply(allPageErrors, p.pageErrors.map(m => tag + '/' + sid + ': ' + m));
        return { views: views, facts: facts };
      };
      const w = await grab(BASE_W, 'working');
      const b = await grab(BASE_B, 'baseline');
      const same = w.views.length === b.views.length && w.views.every((v, i) => v === b.views[i]);
      const hw = w.views.map(sha).join('/'), hb = b.views.map(sha).join('/');
      check('(E1:' + sid + ') mapCanvas が baseline と完全一致 (2視点)',
        same && w.facts.isFieldTheme === false,
        'working=' + hw + ' baseline=' + hb + ' isFieldTheme=' + w.facts.isFieldTheme);
    }
    check('(E2) pageerror が working / baseline とも 0 件',
      allPageErrors.length === 0, allPageErrors.slice(0, 5).join(' | ') || 'none');

    // ══ F: 見た目の証跡 ══════════════════════════════════════════════════════
    mark('F: スクリーンショット (人間の目視用)');
    check('(F1) 西端・東端 × baseline/working の 4 枚を保存',
      shots.length === 4 && shots.every(f => fs.existsSync(f) && fs.statSync(f).size > 1000),
      shots.map(f => path.basename(f) + '(' + fs.statSync(f).size + 'B)').join(' '));
    for (const f of shots) console.log('    shot: ' + f);
  } catch (e) {
    console.error('[drv] 例外: ' + (e && e.stack || e));
    check('DRIVER 例外なし', false, String(e && e.message || e));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srvW) { try { srvW.close(); } catch (e) {} }
    if (srvB) { try { srvB.close(); } catch (e) {} }
  }
  const pass = results.filter(r => r.ok).length;
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  RESULT: ' + pass + '/' + results.length + (pass === results.length ? '  ALL PASS' : '  ** FAIL **'));
  for (const r of results) if (!r.ok) console.log('   FAIL  ' + r.name + '  — ' + r.detail);
  console.log('  shots: ' + SHOT_DIR);
  console.log('════════════════════════════════════════════════════════');
  process.exit(pass === results.length ? 0 : 1);
})();
