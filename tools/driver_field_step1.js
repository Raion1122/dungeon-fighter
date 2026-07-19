#!/usr/bin/env node
/*
 * driver_field_step1.js — 「屋外フィールド景観 STEP1」 機械証明ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 現在の STEP1 の中身 = ① 屋外テーマで床グリッド線を引かない  ② 雲の影が地面を流れる
 *   (空 + 遠景パララックスは「通常プレイのカメラに一度も入らない」と実測されたため撤去済み。
 *    その実測値は index.html の drawCloudShadows 上のコメントに恒久保存してある。)
 *
 * 背骨の主張: 「マップ幾何・戦闘エンジン・タイルデータ構造を1バイトも変えていない。
 *              変わったのは renderMap() の描画パスと屋外テーマ分岐だけ」
 * → 既存6シナリオの mapCanvas.toDataURL() が変更前と完全一致 で証明する。
 *
 * 検証項目:
 *   (0) 測定基盤の健全性: 固定時刻で renderMap() が冪等 (描画中に RNG を引いていない)
 *   (1) 既存6シナリオで FIELD_MODE === false
 *   (2) 既存6シナリオの mapCanvas.toDataURL() が HEAD 版と SHA-256 一致       ★本丸
 *   (3) caravan-road で FIELD_MODE === true / ?field=0 で false
 *   (4) 床グリッド線が消えている (対照群つき)
 *   (5) caravan-road ?field=0 の描画が baseline と SHA-256 一致 (撤退スイッチ)
 *   (6) pageerror 0 / スモーク完走
 *   (7) 雲の影が「実際に描かれている」ことを画素で証明 (大きく柔らかい塊であること)
 *   (8) 雲が流れていること (重心の水平移動量が CLOUD_DRIFT_PXS の予測と一致)
 *   (9) 既存6シナリオでは drawCloudShadows が1回も呼ばれない (スパイ)
 *  ★(12) 小数カメラでの 96px シーム検査 (v2 で新設・本丸)                    ★最重要
 *
 * ── ★v2 で新設した (12) について ────────────────────────────────────────────
 * v1 のドライバはカメラを**整数**で明示代入して測っていたため、「グリッド線を消したら
 * 格子が消えた」と誤認していた。実プレイの camX/camY は cameraFollowTick の指数平滑が
 * 吐く小数で、そこでは床 fillRect の AA が別機構で同じ 96px 格子を再生産する。
 * (12) は camX だけ小数 / camY だけ小数 / 両方小数 の3通りで床画素を 96px 周期に
 * 畳み込み、シーム位相の局所的な落ち込み (ΔL) を測る。
 * ⚠️ 「無いこと」の assert には必ず対照群を置く。本ドライバは2種類を同一カメラで走らせる:
 *      対照群1 = index_inf0_tmp.html (INF=0.5→0 に潰したテストダブル。grid 線は消えたまま)
 *                → 膨張が無いと AA 由来の筋が出ることを、同じ検査器が検出する
 *      対照群2 = ?field=0 (grid 線が実際に描かれる)
 *                → 検査器が「本物の線」を検出できることの独立な裏取り
 *    片側だけの否定 assert は証明ではなく願望なので、対照群が沈黙したら検査自体を FAIL 扱いにする。
 *
 * ── 測定の要: window.drawCloudShadows がスタブ可能 ──────────────────────────
 * index.html の大スクリプトは IIFE ではなく <script> 直下 (script top-level) なので、
 * 関数宣言 drawCloudShadows はグローバルオブジェクトのプロパティになる。よって
 * window.drawCloudShadows を差し替えると renderMap 内の呼び出しがスタブに解決される
 * (本ドライバ内で実証済み: check(0c))。
 * これが効くおかげで **同一ページ・同一カメラ・同一時刻で「雲あり」「雲なし」の2枚**が撮れる。
 *   → 雲だけを完全分離できる  = (7) が grid 線と混ざらない
 *   → grid 線だけを完全分離できる = (4) が雲の multiply と混ざらない
 * ⚠️ スタブは「実装を通すための改変」ではなく測定用のテストダブル。index.html は一切変更しない。
 *
 * ── 雲の濃さを地形非依存で測る ─────────────────────────────────────────────
 * 影は globalCompositeOperation="multiply" + 黒。multiply で黒を重ねた結果は
 *     Cr = (1-as)*Cb + as*(Cb*0) = Cb*(1-as)
 * つまり **下地の明るさに比例した一様な倍率**。よって
 *     shadowAlpha(px) = 1 - lum(雲あり) / lum(雲なし)
 * は下地の地形に依存しない純粋な影のプロファイルになる。重心も濃さもこれで測る。
 * (生の輝度差で重心を取ると「明るい地形の上ほど重い」バイアスが乗る。必ず比で取ること。)
 *
 * 決定論の作り方:
 *   ・goto 前に evaluateOnNewDocument で Date.now を window.__T0 参照の関数に差し替える。
 *     __T0 を書き換えれば **リロード無しで時刻を動かせる** (雲の流れの測定に必須)。
 *     __T0 = null のときだけ実時計 (スクショの実プレイ用)。
 *   ・performance.now を 0 固定 → dt=0 でワールドが進まない
 *   ・Math.random を固定シード LCG → マップ生成/湧きが両ページで一致
 *   ・window.Image を全追跡してロード完了待ち
 *   ・スナップ直前に rAF を凍結し camX/camY を明示代入してから renderMap() を直呼び
 *
 * 使い方:  node tools/driver_field_step1.js [--headful] [--browser <path>] [--port N] [--skip-smoke]
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_NAME = 'index_baseline_tmp.html';
const BASELINE_PATH = path.join(ROOT, BASELINE_NAME);
// ── 対照群フィクスチャ: 床 fillRect の膨張 (INF) だけを 0 に潰した index.html ──
// 「膨張が無ければ小数カメラで筋が出る」ことを同じ検査器で実証するために使う。
// ⚠️ これはテストダブルであって実装の改変ではない。index.html には一切触らない。
//    ?field=0 も対照群になるが、あちらは grid 線が描かれるので「AA 由来の筋」ではなく
//    「描かれた線」を検出する。膨張の効果そのものを分離するにはこちらが要る。
const INF0_NAME = 'index_inf0_tmp.html';
const INF0_PATH = path.join(ROOT, INF0_NAME);
const INF0_FROM = 'const INF = FIELD_MODE ? 0.5 : 0;';
const INF0_TO   = 'const INF = FIELD_MODE ? 0   : 0;';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const SKIP_SMOKE = flag('skip-smoke');
const PORT = parseInt(arg('port', '8796'), 10);

const SHOT_DIR = arg('shots',
  'C:/Users/PC_User/AppData/Local/Temp/claude/c--Users-PC-User-Desktop------------/a657825e-7c35-4e51-835e-11566be45066/scratchpad');

const LEGACY_SCENARIOS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const FIELD_SCENARIO = 'caravan-road';

// ── [地平線ビュー STEP1] caravan-road は常に「従来の幾何」で開く ──────────────
// 本ドライバの検証対象は屋外の**描画パス** (雲の影 / 96px シーム / 床グリッド線) であり、
// baseline は屋外実装が入る前のコミット。STEP1 で入った帯幾何 (row 13-15 マスク +
// カメラ地平線ロック) はそれとは別の層で、baseline 側には存在しない。幾何を有効にしたまま
// 比べると、雲でもシームでもなく「マップの形が違う」ことを検出して軒並み FAIL する
// (実測: STEP1 前 91/91 PASS → STEP1 後 80/89)。よって caravan-road のページは
// ?fieldgeo=0 で幾何だけを止め、描画だけを比較する。
// ⚠️ ?fieldgeo=0 (幾何のみ無効) と ?field=0 (描画のみ無効) は**独立**。取り違えると
//    A/B 比較が「別ゲーム同士の比較」に化けて検証全体が無意味になる。
// ⚠️ 幾何そのものの検証は tools/driver_field_step1_geo.js の担当 (計画書 §4 STEP1 assert 1-7)。
const GEO0 = 'fieldgeo=0';

const HASH_VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };
const SHOT_VIEWPORTS = [
  { name: 'iphone_land', width: 844, height: 390 },
  { name: 'iphone_port', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const T_BASE_MS = 1700000000000;   // 決定論ページの初期時刻

// ── puppeteer / Chrome の解決 ───────────────────────────────────────────────
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
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

// ── 静的サーバ ──────────────────────────────────────────────────────────────
// ⚠️ ROOT は path.resolve 済み (= OS 区切り文字) でなければならない。'C:/...' の
//    スラッシュ表記のまま startsWith 比較すると path.join の '\' 出力と一致せず全部 404 になる。
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
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── プレリュード (goto 前) ──────────────────────────────────────────────────
// freeze=true  … 時刻/乱数を凍結 (ハッシュ比較・画素測定用)
// freeze=false … 実時計で普通に遊ばせる (スクショ用)。__T0 を後から入れれば途中で凍結できる。
function prelude(cfg) {
  try { sessionStorage.setItem('dragonfighters.currentScenario', cfg.scen); } catch (e) {}

  // Date.now は常に __T0 経由にしておく。__T0=null なら実時計。
  // これで「遊ばせてから任意の時刻に固定して雲を好きな位置へ持ってくる」ができる。
  const realNow = Date.now.bind(Date);
  window.__T0 = cfg.freeze ? cfg.t0 : null;
  try { Date.now = function () { return window.__T0 === null ? realNow() : window.__T0; }; } catch (e) {}

  if (cfg.freeze) {
    try { performance.now = function () { return 0; }; } catch (e) {}
    let _s = 123456789 >>> 0;
    Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  }

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

// ── in-page 測定キット ──────────────────────────────────────────────────────
// page.evaluate(fn) の fn はグローバルスコープでコンパイルされるので、script top-level の
// let/const (camX, CLOUDS, TILE_SIZE …) に bare 名で到達できる。window.* では見えない。
async function installProbe(page) {
  await page.evaluate(() => {
    window.__origDCS = window.drawCloudShadows;      // 既存6シナリオでも関数自体は存在する

    const P = {};
    P.freeze = function () { window.requestAnimationFrame = function () { return 0; }; };

    // ⚠️ rAF を止めるだけでは canvas は静止しない。renderMap() は
    //    renderWorld() ← renderWorldWithShake() ← ゲームロジック (index.html:9725 付近)
    //    という経路からも呼ばれ、そこで camX/camY がパーティ追従値に戻される。
    //    実際これを止めずに撮ったスクショは「強制したカメラではなく実プレイのカメラ」に
    //    なっていた (雲が1枚も写らない絵ができる)。撮影前に必ず quiesce すること。
    P.quiesce = function () {
      P.freeze();
      if (!window.__origRW) {
        window.__origRW = window.renderWorld;
        window.__origRWS = window.renderWorldWithShake;
      }
      window.renderWorld = function () {};
      window.renderWorldWithShake = function () {};
    };
    P.setTime = function (ms) { window.__T0 = ms; };
    P.dims = function () { return { W: mapCanvas.width, H: mapCanvas.height }; };
    P.natCam = function () { computeCameraTarget(); camX = camTargetX; camY = camTargetY; return { camX: camX, camY: camY }; };
    P.setCam = function (x, y) { camX = x; camY = y; return { camX: camX, camY: camY }; };
    P.fieldMode = function () { try { return FIELD_MODE; } catch (e) { return '<unreadable>'; } };

    // 雲あり / 雲なし を撮り分ける。noClouds=true のときだけ no-op スタブを噛ませる。
    P.render = function (noClouds) {
      if (noClouds) window.drawCloudShadows = function () {};
      else window.drawCloudShadows = window.__origDCS;
      renderMap();
      window.drawCloudShadows = window.__origDCS;
    };
    // 呼び出し回数スパイ (既存6シナリオで 0 であることの証明に使う)
    P.spy = function () {
      let n = 0;
      const o = window.drawCloudShadows;
      window.drawCloudShadows = function () { n++; };
      renderMap();
      window.drawCloudShadows = o;
      return n;
    };
    P.grab = function () {
      const c = mapCanvas.getContext('2d', { willReadFrequently: true });
      return c.getImageData(0, 0, mapCanvas.width, mapCanvas.height).data;
    };
    P.hash = function () { return mapCanvas.toDataURL('image/png'); };

    P.consts = function () {
      return { TILE: CLOUD_TILE_PX, ALPHA: CLOUD_ALPHA, DRIFT: CLOUD_DRIFT_PXS,
               PERIOD: CLOUD_PERIOD_X, N: CLOUDS.length,
               clouds: CLOUDS.map(function (c) { return { x: c.x, y: c.y, s: c.s, v: c.v }; }) };
    };

    // 現カメラの中心に「一番よく被る雲」を持ってくる時刻 (ms) を解く。
    //   wx = (c.x + t*DRIFT*c.v) mod PERIOD  を画面中心に合わせる
    // targetScreenY を渡すと「画面中央」ではなく「その走査線」に一番よく掛かる雲を選ぶ。
    // ⚠️ 雲を小さくすると (CLOUDS の s は 2.2〜3.9 → 1.6〜2.8 → 現行 1.3〜2.1 と縮めてきた)、画面中央に
    //    置いた雲が grid 判定用の走査線 (床の連続 run が最長の行。画面上端寄りになりがち)
    //    に届かなくなる。実際 (4g0) が「雲で輝度が変わった列=0」で FAIL した。
    //    走査線を狙って選べば、雲の大きさに関係なく空振りしない。
    P.pickCloudTime = function (targetScreenY) {
      const W = mapCanvas.width, H = mapCanvas.height;
      const cxT = camX + W / 2;
      const cyT = camY + (targetScreenY === undefined || targetScreenY === null ? H / 2 : targetScreenY);
      let best = null;
      for (let i = 0; i < CLOUDS.length; i++) {
        const c = CLOUDS[i], r = CLOUD_TILE_PX * c.s / 2;
        const score = Math.abs(c.y - cyT) / r;     // 半径で正規化した縦ずれ
        if (!best || score < best.score) best = { i: i, score: score, c: c };
      }
      const c = best.c;
      let dx = (cxT - c.x) % CLOUD_PERIOD_X; if (dx < 0) dx += CLOUD_PERIOD_X;
      const t = dx / (CLOUD_DRIFT_PXS * c.v);
      return { t0ms: Math.round(t * 1000), cloudIndex: best.i, cloudY: c.y,
               dyFromCenter: Math.round(c.y - cyT), radius: Math.round(CLOUD_TILE_PX * c.s / 2) };
    };

    // 画面に「ちょうど1つだけ」雲が入り、かつ t0 と t0+dt の両方で画面内に完全収容される
    // カメラ/時刻/雲 を探す。重心移動を測るとき、雲が画面端で切れていると重心がバイアスする。
    P.pickIsolatedCloud = function (dtSec) {
      const W = mapCanvas.width, H = mapCanvas.height;
      const drift = function (c, t) {
        let wx = (c.x + t * CLOUD_DRIFT_PXS * c.v) % CLOUD_PERIOD_X;
        if (wx < 0) wx += CLOUD_PERIOD_X;
        return wx;
      };
      for (let i = 0; i < CLOUDS.length; i++) {
        const c = CLOUDS[i], size = CLOUD_TILE_PX * c.s, half = size / 2;
        const shift = dtSec * CLOUD_DRIFT_PXS * c.v;
        if (size + shift + 40 > W || size + 40 > H) continue;      // 収まらない
        const t0 = 100;                                            // 適当な基準時刻(秒)
        const wx0 = drift(c, t0);
        // t0 と t0+dt の中点を画面中心に置く
        const cX = wx0 + shift / 2 - W / 2;
        const cY = c.y - H / 2;
        // 他の雲 (巻き戻し複製も含む) が両時刻で画面に入らないこと
        let clean = true;
        for (const tt of [t0, t0 + dtSec]) {
          for (let j = 0; j < CLOUDS.length; j++) {
            if (j === i) continue;
            const o = CLOUDS[j], osz = CLOUD_TILE_PX * o.s;
            const owx = drift(o, tt);
            for (const dupe of [0, -CLOUD_PERIOD_X, CLOUD_PERIOD_X]) {
              const sx = owx + dupe - cX - osz / 2, sy = o.y - cY - osz / 2;
              if (sx + osz < 0 || sx > W) continue;
              if (sy + osz < 0 || sy > H) continue;
              clean = false;
            }
          }
          // 自分自身の巻き戻し複製も画面に来てはいけない
          const swx = drift(c, tt);
          for (const dupe of [-CLOUD_PERIOD_X, CLOUD_PERIOD_X]) {
            const sx = swx + dupe - cX - half, sy = c.y - cY - half;
            if (sx + size < 0 || sx > W) continue;
            if (sy + size < 0 || sy > H) continue;
            clean = false;
          }
        }
        if (!clean) continue;
        // 両時刻で完全収容されているか
        const okIn = function (t) {
          const sx = drift(c, t) - cX - half, sy = c.y - cY - half;
          return sx >= 0 && sy >= 0 && sx + size <= W && sy + size <= H;
        };
        if (!okIn(t0) || !okIn(t0 + dtSec)) continue;

        // ⚠️ 幾何だけで選ぶと重心測定が壊れる。影プロファイル alpha は「下地が暗すぎる画素
        //    (lum<25 = 天井/盤外の黒)」をマスクで捨てるので、雲が掃く帯にマスク外の領域が
        //    混じっていると、雲が動くにつれ **マスクとの重なりが変わって重心が引きずられる**。
        //    初回実行で実際にこれが起き、影の重み weight が 1304 → 4806 と 3.7倍に増えて
        //    Δx が 191px (予測 242px) に、Δy が 12px に化けた (実装ではなく測定の誤り)。
        //    よって雲が t0〜t0+dt で通る矩形の中が「ほぼ全部が明るい地形」である構図だけを採る。
        const bx0 = Math.max(0, Math.floor(drift(c, t0) - cX - half));
        const bx1 = Math.min(W, Math.ceil(drift(c, t0 + dtSec) - cX + half));
        const by0 = Math.max(0, Math.floor(c.y - cY - half));
        const by1 = Math.min(H, Math.ceil(c.y - cY + half));
        if (bx1 - bx0 < 50 || by1 - by0 < 50) continue;
        P.setCam(cX, cY);   // ⚠️ 下地を測る前に候補カメラを実際に据える (これが無いと別構図を測る)
        P.render(true);     // 雲なしの下地。カメラ固定なら時刻に依らず同じ
        const dd = mapCanvas.getContext('2d', { willReadFrequently: true })
          .getImageData(bx0, by0, bx1 - bx0, by1 - by0).data;
        let bright = 0, tot = 0;
        for (let q = 0; q < dd.length; q += 4) {
          tot++;
          if (0.2126 * dd[q] + 0.7152 * dd[q + 1] + 0.0722 * dd[q + 2] >= 25) bright++;
        }
        const brightFrac = bright / tot;
        if (brightFrac < 0.97) continue;   // マスク境界が重心を汚す構図は捨てる

        return { cloudIndex: i, v: c.v, s: c.s, size: size, camX: cX, camY: cY,
                 t0Sec: t0, dtSec: dtSec, predictedShiftPx: shift,
                 sweepRect: [bx0, by0, bx1, by1], brightFrac: +brightFrac.toFixed(4) };
      }
      return null;
    };

    // 影プロファイル shadowAlpha = 1 - lum(雲あり)/lum(雲なし) を作って統計を返す。
    // 下地の地形に依存しない (multiply の性質)。mask = 下地が暗すぎる画素は比が不安定なので除外。
    P.analyze = function (opts) {
      opts = opts || {};
      P.freeze();
      if (opts.t0ms !== undefined && opts.t0ms !== null) P.setTime(opts.t0ms);
      if (opts.camX !== undefined && opts.camX !== null) P.setCam(opts.camX, opts.camY);
      const W = mapCanvas.width, H = mapCanvas.height;

      P.render(true);  const A = P.grab();     // 雲なし
      P.render(false); const B = P.grab();     // 雲あり

      const LUM = function (d, i) { return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
      const alpha = new Float32Array(W * H);
      const lumA = new Float32Array(W * H);      // 下地(雲なし)の輝度。量子化ノイズの重み付けに使う
      const MASK_MIN = 25;
      let nMask = 0, nShadow = 0, maxA = 0, maxIdx = -1, sumA = 0;
      let sx = 0, sy = 0, sw = 0;
      for (let p = 0, i = 0; p < W * H; p++, i += 4) {
        const la = LUM(A, i);
        lumA[p] = la;
        if (la < MASK_MIN) { alpha[p] = 0; continue; }
        nMask++;
        const lb = LUM(B, i);
        let a = 1 - lb / la;
        if (a < 0) a = 0; if (a > 1) a = 1;
        alpha[p] = a;
        if (a > 0.02) {
          nShadow++; sumA += a;
          const x = p % W, y = (p / W) | 0;
          sx += a * x; sy += a * y; sw += a;
          if (a > maxA) { maxA = a; maxIdx = p; }
        }
      }
      const out = {
        W: W, H: H, maskedPx: nMask, shadowPx: nShadow,
        shadowFrac: +(nShadow / (W * H)).toFixed(4),
        maxAlpha: +maxA.toFixed(4),
        meanAlpha: nShadow ? +(sumA / nShadow).toFixed(4) : 0,
        centroid: sw > 0 ? { x: +(sx / sw).toFixed(2), y: +(sy / sw).toFixed(2) } : null,
      };
      if (maxIdx >= 0) {
        const i = maxIdx * 4;
        out.darkest = {
          x: maxIdx % W, y: (maxIdx / W) | 0,
          rgbNoCloud: [A[i], A[i + 1], A[i + 2]],
          rgbWithCloud: [B[i], B[i + 1], B[i + 2]],
          lumNoCloud: +LUM(A, i).toFixed(1), lumWithCloud: +LUM(B, i).toFixed(1),
          darkenPct: +((1 - LUM(B, i) / LUM(A, i)) * 100).toFixed(2),
        };
        // 影の外 (同じ行で alpha≈0 の代表点)
        const yRow = (maxIdx / W) | 0;
        for (let x = 0; x < W; x++) {
          const p = yRow * W + x;
          if (alpha[p] < 0.001) {
            const j = p * 4;
            if (LUM(A, j) >= MASK_MIN) {
              out.outside = { x: x, y: yRow, rgbNoCloud: [A[j], A[j + 1], A[j + 2]],
                              rgbWithCloud: [B[j], B[j + 1], B[j + 2]],
                              identical: A[j] === B[j] && A[j + 1] === B[j + 1] && A[j + 2] === B[j + 2] };
              break;
            }
          }
        }
      }
      if (opts.shape && maxIdx >= 0) {
        // ── 「大きく柔らかい塊」であることの測定 ──
        // 1) 滑らかさ: 隣接画素の alpha 段差。
        //    ⚠️ alpha = 1 - lumB/lumA は下地が暗いほど量子化ノイズが暴れる。lum=25 の画素では
        //       8bit の 1 LSB が alpha 0.04 に相当するので、暗い地形の縁を1つ跨いだだけで
        //       「0.2 の段差」が出て細線と誤判定する (実測: x=580,y=288 で隣が lum=201→25)。
        //       これは測定側のノイズであって雲の構造ではない。よって
        //       **両隣とも十分明るい画素ペアだけ**で測る。lum>=100 なら 1 LSB = alpha 0.008。
        //    実測の残差 (p99 ≈ 0.007) はちょうどこの量子化下限に一致する = 高周波構造は無い。
        //    比較対象: grid 線は rgba(0,0,0,0.22) なので 1px で 0.22 級の段差を作る。
        const BRIGHT = 100;
        let maxGrad = 0, maxGradAt = null;
        const stepsArr = [];
        for (let y = 0; y < H; y += 2) {
          const row = y * W;
          for (let x = 1; x < W; x++) {
            const p = row + x, q = row + x - 1;
            if (lumA[p] < BRIGHT || lumA[q] < BRIGHT) continue;
            const d = Math.abs(alpha[p] - alpha[q]);
            stepsArr.push(d);
            if (d > maxGrad) { maxGrad = d; maxGradAt = { x: x, y: y, lum: +lumA[p].toFixed(1) }; }
          }
        }
        stepsArr.sort((a, b) => a - b);
        out.smoothness = {
          brightMaskLum: BRIGHT,
          pairs: stepsArr.length,
          maxAdjacentAlphaStep: +maxGrad.toFixed(5),
          p999: +(stepsArr[Math.floor(stepsArr.length * 0.999)] || 0).toFixed(5),
          p99: +(stepsArr[Math.floor(stepsArr.length * 0.99)] || 0).toFixed(5),
          at: maxGradAt,
          quantFloor: +(1 / BRIGHT).toFixed(5),   // この下は測れない (8bit の 1 LSB)
        };
        out.maxAdjacentAlphaStep = +maxGrad.toFixed(5);

        // 2) 連結成分 (step=4 で間引き) の個数と最大塊の bbox
        const S = 4, GW = Math.floor(W / S), GH = Math.floor(H / S);
        const bin = new Uint8Array(GW * GH);
        for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++)
          bin[gy * GW + gx] = alpha[(gy * S) * W + gx * S] > 0.03 ? 1 : 0;
        const seen = new Uint8Array(GW * GH);
        const blobs = [];
        const stack = [];
        for (let p0 = 0; p0 < GW * GH; p0++) {
          if (!bin[p0] || seen[p0]) continue;
          stack.length = 0; stack.push(p0); seen[p0] = 1;
          let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
          while (stack.length) {
            const p = stack.pop(); n++;
            const gx = p % GW, gy = (p / GW) | 0;
            if (gx < x0) x0 = gx; if (gx > x1) x1 = gx;
            if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
            const nb = [p - 1, p + 1, p - GW, p + GW];
            for (let k = 0; k < 4; k++) {
              const q = nb[k];
              if (q < 0 || q >= GW * GH) continue;
              if (k < 2 && Math.abs((q % GW) - gx) !== 1) continue;   // 行跨ぎ防止
              if (!bin[q] || seen[q]) continue;
              seen[q] = 1; stack.push(q);
            }
          }
          blobs.push({ areaPx: n * S * S, wPx: (x1 - x0 + 1) * S, hPx: (y1 - y0 + 1) * S });
        }
        blobs.sort((a, b) => b.areaPx - a.areaPx);
        out.blobCount = blobs.length;
        out.blobs = blobs.slice(0, 5);

        // 3) 最も濃い行の「連続して暗い画素」の最長ラン。
        //    96px 格子や 1px 細線ならランは 1〜2px にしかならない。
        const yR = (maxIdx / W) | 0;
        let run = 0, best = 0;
        for (let x = 0; x < W; x++) {
          if (alpha[yR * W + x] > 0.03) { run++; if (run > best) best = run; } else run = 0;
        }
        out.longestRunPx = best;
        out.probeRowY = yR;
      }
      return out;
    };

    // 床の輝度を 96px 周期で畳み込み、タイル継ぎ目の残存振幅を測る。
    // 1本の走査線ではなく画面内の全床画素を使うので、grid 線が「画面全体として」
    // 消えているかを代表性のある形で言える (走査線1本だと床テクスチャの局所模様に振られる)。
    // 期待: ?field=0 は phase0 が大きく凹む (描かれた線)。FIELD_MODE は凹まない。
    P.foldSeam = function () {
      P.quiesce();
      computeCameraTarget(); camX = camTargetX; camY = camTargetY;
      P.render(false);
      const W = mapCanvas.width, H = mapCanvas.height;
      const d = mapCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
      const sum = new Float64Array(96), cnt = new Float64Array(96);
      for (let y = 0; y < H; y++) {
        const ty = Math.floor((y + camY) / TILE_SIZE);
        if (ty < 0 || ty >= MAP_H) continue;
        const yph = (((y + Math.round(camY)) % 96) + 96) % 96;
        if (yph < 3 || yph > 93) continue;          // 横罫線の行は除外 (縦線だけを見る)
        for (let x = 0; x < W; x++) {
          const tx = Math.floor((x + camX) / TILE_SIZE);
          if (tx < 0 || tx >= MAP_W) continue;
          if (!mapData[ty] || mapData[ty][tx] === 2) continue;
          const i = (y * W + x) * 4;
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (l < 25) continue;
          const ph = (((x + Math.round(camX)) % 96) + 96) % 96;
          sum[ph] += l; cnt[ph]++;
        }
      }
      const prof = []; let all = 0, n = 0;
      for (let p = 0; p < 96; p++) {
        const v = cnt[p] ? sum[p] / cnt[p] : 0;
        prof.push(+v.toFixed(2));
        if (cnt[p]) { all += v; n++; }
      }
      const mean = all / n;
      return { mean: +mean.toFixed(2), seam: prof[0],
               seamDipPct: +(((mean - prof[0]) / mean) * 100).toFixed(2),
               profile0to5: prof.slice(0, 6) };
    };

    // 人間が目で確かめるための一次資料を3枚作る。
    //  on   = 雲あり / off = 雲なし (同一カメラ・同一時刻・スタブのみが違う) → パラパラ比較用
    //  diff = 影プロファイル alpha を 3倍に増幅したグレースケール → 影の形が一目で分かる
    // 24% の緩い階調は地形の模様に紛れて肉眼判断が難しいので、増幅画像を必ず添える。
    P.proof = function (opts) {
      opts = opts || {};
      P.quiesce();
      if (opts.t0ms !== undefined && opts.t0ms !== null) P.setTime(opts.t0ms);
      if (opts.camX !== undefined && opts.camX !== null) P.setCam(opts.camX, opts.camY);
      const W = mapCanvas.width, H = mapCanvas.height;
      P.render(true);  const offUrl = P.hash(); const A = P.grab();
      P.render(false); const onUrl = P.hash();  const B = P.grab();
      const LUM = function (d, i) { return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      const im = x.createImageData(W, H);
      const AMP = 3;
      for (let p = 0, i = 0; p < W * H; p++, i += 4) {
        const la = LUM(A, i);
        let a = 0;
        if (la >= 25) { a = 1 - LUM(B, i) / la; if (a < 0) a = 0; }
        const v = Math.min(255, Math.round(a * 255 * AMP));
        im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      return { on: onUrl, off: offUrl, diff: c.toDataURL('image/png'), amp: AMP,
               camX: camX, camY: camY, W: W, H: H };
    };

    // 重心だけを高速に (雲の流れの測定用)
    // ── 雲の流れを測る構図を選ぶ (v2 で全面的に作り直し) ────────────────────
    // v1 は「雲が画面に完全収容され、かつ単独であること」を条件にしていた。雲を小さく
    // した変更 (s 2.2〜3.9 → 1.6〜2.8) の後もこれ自体は成立するが、**重心測定が壊れる**。
    // 影プロファイルは下地が暗い画素 (天井/盤外の黒) をマスクで捨てるため、雲がマスク境界を
    // またぐと「マスクとの重なり」の変化が重心を引きずる (実測: weight 1304→4806、
    // Δx 191px/予測 242px、Δy 12px)。かといって「雲全体が明るい地形の上」を要求すると、
    // 道の帯 (数タイル高) より雲の直径 (410〜717px) の方が大きいので候補が消える。
    //
    // 正しい構図: **全幅が床の「道の帯」を丸ごと含む矩形**を測定領域にする。
    //   ・矩形内はマスクが 100% → マスク境界バイアスがそもそも発生しない
    //   ・雲は縦にはみ出してよい。切り取りは両時刻で同一で、雲は水平にしか動かないので
    //     「縦に切った横向きプロファイル」は剛体平行移動のまま = Δx も Δy も正しく出る
    //   ・要求は「雲が矩形内に水平に収まっていること」だけ (両時刻)
    P.pickDriftSetup = function (dtSecList) {
      const W = mapCanvas.width, H = mapCanvas.height;
      const MAPW = MAP_W * TILE_SIZE, MAPH = MAP_H * TILE_SIZE;
      // ⚠️ 「全幅が床の行」を要求してはいけない。caravan-road の道は 72 列中 67 列で、
      //    端が壁なので該当行が 1 本も無く、構図探索が空振りする (実際に FAIL した)。
      //    正しくは **連続する行たちが共有する床の連続区間** を採る。
      const isFloor = function (tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
        if (!mapData[ty] || mapData[ty][tx] === 2) return false;
        if (typeof isPaintedAndLoaded === 'function' && isPaintedAndLoaded(tx, ty)) return false;
        return true;
      };
      const rowRun = [];
      for (let ty = 0; ty < MAP_H; ty++) {
        let run = 0, s = -1, bs = -1, be = -1;
        for (let tx = 0; tx < MAP_W; tx++) {
          if (isFloor(tx, ty)) { if (run === 0) s = tx; run++; if (run > be - bs + 1) { bs = s; be = tx; } }
          else run = 0;
        }
        rowRun.push(bs >= 0 ? [bs, be] : null);
      }
      // 帯の高さを最大化しつつ、共通区間が最低 6 タイル (576px) 残るものを採る
      const MIN_TILES = 6;
      let top = -1, bot = -1, ix0 = 0, ix1 = -1, bestH = 0;
      for (let ty0 = 0; ty0 < MAP_H; ty0++) {
        if (!rowRun[ty0]) continue;
        let a = rowRun[ty0][0], b = rowRun[ty0][1];
        for (let ty1 = ty0; ty1 < MAP_H; ty1++) {
          if (!rowRun[ty1]) break;
          const na = Math.max(a, rowRun[ty1][0]), nb = Math.min(b, rowRun[ty1][1]);
          if (nb - na + 1 < MIN_TILES) break;
          a = na; b = nb;
          const h = ty1 - ty0 + 1;
          if (h > bestH || (h === bestH && (b - a) > (ix1 - ix0))) { bestH = h; top = ty0; bot = ty1; ix0 = a; ix1 = b; }
        }
      }
      if (top < 0) return { fail: '床が ' + MIN_TILES + ' タイル幅×複数行で連続する帯が無い' };
      const bandY0 = top * TILE_SIZE, bandY1 = (bot + 1) * TILE_SIZE;
      const bandX0 = ix0 * TILE_SIZE, bandX1 = (ix1 + 1) * TILE_SIZE;
      const drift = function (c, t) {
        let wx = (c.x + t * CLOUD_DRIFT_PXS * c.v) % CLOUD_PERIOD_X;
        if (wx < 0) wx += CLOUD_PERIOD_X;
        return wx;
      };
      const rej = { needW: 0, band: 0, rectH: 0, rectW: 0, notIn: 0, dirty: 0, dark: 0, tried: 0 };
      for (const dtSec of dtSecList) {
        for (let i = 0; i < CLOUDS.length; i++) {
          rej.tried++;
          const c = CLOUDS[i], size = CLOUD_TILE_PX * c.s, half = size / 2;
          const shift = dtSec * CLOUD_DRIFT_PXS * c.v;
          const needW = size + shift + 8;
          // ── ⚠️ 順序が命 ──────────────────────────────────────────────────
          // 「t を先に決めて雲の位置にカメラを合わせる」と、カメラが道の帯の外へ飛ぶ。
          // (rectW で 36 件が落ちたのがまさにこれ。showcase 撮影が同じ罠を踏んで
          //  コメントを残しているのと同型の誤り。) 正しい順序は逆:
          //   ① カメラを帯の内側に据える ② そこへ雲が来る t を解く
          // さらに測定矩形は **雲1つぶんの帯** に絞る。画面いっぱいの矩形にすると
          // 雲が 14 枚もあるので他の雲が必ず侵入し、単独性が永久に成立しない (dirty 8件)。
          if (bandX1 - bandX0 < W || bandY1 - bandY0 < H) { rej.band++; continue; }
          const cX = Math.max(0, Math.min(MAPW - W, Math.min(bandX1 - W, Math.max(bandX0, bandX0))));
          if (cX < bandX0 || cX + W > bandX1) { rej.band++; continue; }
          // 縦: 対象の雲の中心を画面中央に。画面全体が帯の内側に収まる範囲でクランプ。
          const cY = Math.max(bandY0, Math.min(bandY1 - H, Math.max(0, Math.min(MAPH - H, c.y - H / 2))));
          if (cY < bandY0 || cY + H > bandY1) { rej.band++; continue; }
          // 測定矩形: 雲の縦の広がり ∩ 画面、横は「雲1つ + 移動量」だけ
          const ry0 = Math.max(2, Math.floor(c.y - cY - half));
          const ry1 = Math.min(H - 2, Math.ceil(c.y - cY + half));
          if (ry1 - ry0 < 40) { rej.rectH++; continue; }
          const rx0 = 20, rx1 = 20 + Math.ceil(needW);
          if (rx1 > W - 20) { rej.rectW++; continue; }
          // t0: 雲の左端を rx0+4 に置く時刻を解く (wx = cX + rx0 + 4 + half)
          const wxWant = cX + rx0 + 4 + half;
          let dxw = (wxWant - c.x) % CLOUD_PERIOD_X; if (dxw < 0) dxw += CLOUD_PERIOD_X;
          const t0 = dxw / (CLOUD_DRIFT_PXS * c.v);
          const t1 = t0 + dtSec;
          const okIn = function (t) {
            const sx = drift(c, t) - cX - half;
            return sx >= rx0 && sx + size <= rx1;
          };
          if (!okIn(t0) || !okIn(t1)) { rej.notIn++; continue; }
          // 他の雲 (巻き戻し複製込み) が測定矩形に入らないこと
          let clean = true;
          for (const tt of [t0, t1]) {
            for (let j = 0; j < CLOUDS.length; j++) {
              const o = CLOUDS[j], osz = CLOUD_TILE_PX * o.s;
              const owx = drift(o, tt);
              for (const dupe of [0, -CLOUD_PERIOD_X, CLOUD_PERIOD_X]) {
                if (j === i && dupe === 0) continue;
                const sx = owx + dupe - cX - osz / 2, sy = o.y - cY - osz / 2;
                if (sx + osz < rx0 || sx > rx1) continue;
                if (sy + osz < ry0 || sy > ry1) continue;
                clean = false;
              }
            }
          }
          if (!clean) { rej.dirty++; continue; }
          // 矩形内が本当に 100% 明るい地形かを実測で確かめる (mapData だけを信じない)
          P.setCam(cX, cY); P.render(true);
          const dd = mapCanvas.getContext('2d', { willReadFrequently: true })
            .getImageData(rx0, ry0, rx1 - rx0, ry1 - ry0).data;
          let bright = 0, tot = 0;
          for (let q = 0; q < dd.length; q += 4) {
            tot++;
            if (0.2126 * dd[q] + 0.7152 * dd[q + 1] + 0.0722 * dd[q + 2] >= 25) bright++;
          }
          const brightFrac = bright / tot;
          if (brightFrac < 0.999) { rej.dark++; continue; }
          return { cloudIndex: i, v: c.v, s: c.s, size: size, camX: cX, camY: cY,
                   t0Sec: t0, dtSec: dtSec, predictedShiftPx: shift, reject: rej,
                   rect: [rx0, ry0, rx1, ry1], brightFrac: +brightFrac.toFixed(5),
                   bandTilesY: [top, bot], bandTilesX: [ix0, ix1] };
        }
      }
      return { fail: 'どの dt でも「道の帯に水平収容 + 単独 + 全面明るい」構図が無い', reject: rej,
               band: { tilesY: [top, bot], tilesX: [ix0, ix1], px: [bandX0, bandY0, bandX1, bandY1], W: W, H: H } };
    };

    // rect = [x0,y0,x1,y1] を渡すとその矩形内だけで重心を取る。雲が掃く帯に限定することで、
    // 画面隅の暗い地形 (マスク外) の出入りが重心を引きずるのを防ぐ。
    P.centroid = function (t0ms, cx, cy, rect) {
      P.freeze(); P.setTime(t0ms); P.setCam(cx, cy);
      const W = mapCanvas.width, H = mapCanvas.height;
      P.render(true);  const A = P.grab();
      P.render(false); const B = P.grab();
      const LUM = function (d, i) { return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
      const x0 = rect ? Math.max(0, rect[0]) : 0, y0 = rect ? Math.max(0, rect[1]) : 0;
      const x1 = rect ? Math.min(W, rect[2]) : W, y1 = rect ? Math.min(H, rect[3]) : H;
      let sx = 0, sy = 0, sw = 0, n = 0, masked = 0, tot = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        tot++;
        const la = LUM(A, i);
        if (la < 25) { masked++; continue; }
        const a = 1 - LUM(B, i) / la;
        if (a > 0.02) { sx += a * x; sy += a * y; sw += a; n++; }
      }
      return sw > 0 ? { x: sx / sw, y: sy / sw, px: n, weight: sw,
                        maskedFrac: +(masked / tot).toFixed(4) } : null;
    };

    // ════════════════════════════════════════════════════════════════════════
    // ── ★小数カメラでの 96px シーム検査 (v2 の本丸) ────────────────────────
    // ════════════════════════════════════════════════════════════════════════
    // なぜ必要か (v1 が踏んだ罠の恒久記録):
    //   v1 のドライバは camX/camY に**整数**を明示代入して測っていた。整数カメラでは
    //   床の fillRect が画素境界にぴったり乗るので被覆率が 100% になり、Pass 1.2 の
    //   グリッド線を消すと格子は本当に 0 本になる。だから「格子は消えた」と結論した。
    //   ところが実プレイの camX/camY は cameraFollowTick の指数平滑が吐く**小数**
    //   (camX=202.37 のような値)。小数カメラでは隣接 fillRect の境界画素がどちらも
    //   被覆率 100% 未満になり、source-over で合成しても 100% に届かず、renderMap 冒頭の
    //   背景 #0a0a0a が 1px の筋として透ける。= グリッド線を消しても格子は残っていた。
    //   ⇒ **小数カメラで測らない検査は、この不具合に対して構造的に盲目である。**
    //
    // 測り方:
    //   床画素の輝度を「ワールド座標 mod 96」で畳み込み、96 個のバケツの平均輝度を作る。
    //   シームは 1px 幅の局所的な落ち込みなので、そのバケツと ±3,±4 バケツ平均との差
    //   (= localDip, 単位は 8bit 輝度 ΔL) で測る。全体平均との差ではなく**局所**差を使うのは、
    //   床テクスチャ自身が 96px 周期の濃淡を持っており (floorPattern はワールド座標
    //   アンカー)、全体平均比だとテクスチャの模様を線と誤認するため。
    //
    // シームが出るバケツの導出 (ハードコードしない):
    //   タイル境界のワールド座標 = k*96。それを含む画面画素は floor(k*96 - camX)。
    //   その画素の位相 = ((floor(k*96-camX) + camX) mod 96) = 95 + frac(camX)。
    //   ⇒ frac(camX) > 0 なら必ずバケツ 95、frac(camX) == 0 ならバケツ 0 (かつ筋は出ない)。
    //
    // ⚠️ 「無いこと」の assert は単独では成立しない。必ず対照群 (INF=0 に潰した
    //    index_inf0_tmp.html / grid 線が描かれる ?field=0) を同一カメラ・同一時刻で走らせ、
    //    **同じ検査器が実際に筋を検出する**ことを対で示すこと。片側だけの否定は願望でしかない。
    P.seamProfile = function (o) {
      P.quiesce();
      if (o.t0ms !== undefined && o.t0ms !== null) P.setTime(o.t0ms);
      P.setCam(o.camX, o.camY);
      P.render(!!o.noClouds);
      const W = mapCanvas.width, H = mapCanvas.height;
      const d = mapCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
      const cX = camX, cY = camY;

      // 床であることの判定。壁 (=2) と 1枚絵タイルは別パスで塗られるので混ぜてはいけない。
      const isFloor = function (tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
        if (!mapData[ty] || mapData[ty][tx] === 2) return false;
        if (typeof isPaintedAndLoaded === 'function' && isPaintedAndLoaded(tx, ty)) return false;
        return true;
      };
      const fr = function (v) { const f = v - Math.floor(v); return f; };
      const seamBucket = function (c) { return fr(c) > 0 ? 95 : 0; };
      const bX = seamBucket(cX), bY = seamBucket(cY);
      // ⚠️ Pass 1.2 の grid 線は Math.round(tx*96 - camX)+0.5 に引かれる = **AA シームとは
      //    別のバケツに乗りうる**。境界のオフセットを a = frac(tx*96-camX) とすると、
      //    a < 0.5 なら round は floor と同じ (バケツ95) だが、a >= 0.5 では floor+1 =
      //    バケツ0 にずれる。ここを 95 決め打ちで測ると、?field=0 の対照群で「描かれた線」
      //    ではなく「?field=0 側の AA シーム」を測ってしまい、対照群の意味が消える
      //    (実際 fx=0.1158 の回で ΔL=3.1 しか出ず FAIL した)。
      const gridBucket = function (c) { return Math.floor(((((Math.round(-c) + c) % 96) + 96) % 96)); };
      const gX = gridBucket(cX), gY = gridBucket(cY);

      const sumX = new Float64Array(96), cntX = new Float64Array(96);
      const sumY = new Float64Array(96), cntY = new Float64Array(96);
      for (let y = 0; y < H; y++) {
        const wy = y + cY, ty = Math.floor(wy / TILE_SIZE);
        const phy = Math.floor((((wy % 96) + 96) % 96));
        for (let x = 0; x < W; x++) {
          const wx = x + cX, tx = Math.floor(wx / TILE_SIZE);
          // 3x3 近傍がすべて床の画素だけを使う。壁際・1枚絵際の暗がりや、隣が壁のときの
          // 「そもそも塗られていない」列を筋と取り違えないため。
          if (!isFloor(tx, ty) || !isFloor(tx - 1, ty) || !isFloor(tx + 1, ty) ||
              !isFloor(tx, ty - 1) || !isFloor(tx, ty + 1)) continue;
          const i = (y * W + x) * 4;
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (l < 25) continue;          // 松明の落とす極端な陰。比が不安定になるので除外
          const phx = Math.floor((((wx % 96) + 96) % 96));
          // 縦シーム(x畳み込み)は横シームの行を除外して測る。逆も同じ。
          // 混ぜても x バケツには一様に散るので偏らないが、除外した方が S/N が良い。
          if (phy !== bY) { sumX[phx] += l; cntX[phx]++; }
          if (phx !== bX) { sumY[phy] += l; cntY[phy]++; }
        }
      }
      const mk = function (sum, cnt, b, gb) {
        const prof = [], n = [];
        for (let p = 0; p < 96; p++) { prof.push(cnt[p] ? sum[p] / cnt[p] : NaN); n.push(cnt[p]); }
        const at = function (k) { return prof[(((b + k) % 96) + 96) % 96]; };
        const nb = (at(-4) + at(-3) + at(3) + at(4)) / 4;
        const dip = nb - at(0);
        // 参考: 全バケツで同じ局所差を出し、シーム以外の最大値も見る (テクスチャ由来の上限)
        let worst = -Infinity, worstAt = -1;
        for (let p = 0; p < 96; p++) {
          const a = function (k) { return prof[(((p + k) % 96) + 96) % 96]; };
          const dd = (a(-4) + a(-3) + a(3) + a(4)) / 4 - a(0);
          if (isFinite(dd) && p !== b && dd > worst) { worst = dd; worstAt = p; }
        }
        let tot = 0, totN = 0;
        for (let p = 0; p < 96; p++) if (cnt[p]) { tot += sum[p]; totN += cnt[p]; }
        const atG = function (k) { return prof[(((gb + k) % 96) + 96) % 96]; };
        const nbG = (atG(-4) + atG(-3) + atG(3) + atG(4)) / 4;
        return {
          bucket: b, samples: n[b], value: +at(0).toFixed(3), neighborMean: +nb.toFixed(3),
          dipL: +dip.toFixed(3), meanFloorL: totN ? +(tot / totN).toFixed(2) : null,
          gridBucket: gb, gridDipL: +(nbG - atG(0)).toFixed(3), gridSamples: n[gb],
          otherWorstDipL: isFinite(worst) ? +worst.toFixed(3) : null, otherWorstBucket: worstAt,
          around: [at(-2), at(-1), at(0), at(1), at(2)].map(function (v) { return +v.toFixed(2); }),
        };
      };
      return {
        camX: cX, camY: cY, fracX: +fr(cX).toFixed(4), fracY: +fr(cY).toFixed(4),
        W: W, H: H, vertical: mk(sumX, cntX, bX, gX), horizontal: mk(sumY, cntY, bY, gY),
      };
    };

    // 比較する3ページ (現行 / INF=0 / ?field=0) が同じ地形を見ていることの証明。
    // 地形が違えば「同一カメラで比べた」という主張が崩れ、ΔL の差は地形差かもしれなくなる。
    P.mapFingerprint = function () {
      let h = 2166136261 >>> 0;
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        h ^= mapData[y][x]; h = Math.imul(h, 16777619) >>> 0;
      }
      return { hash: h.toString(16), MAP_W: MAP_W, MAP_H: MAP_H, TILE: TILE_SIZE };
    };

    // 画面内で「完全に床だけ」の矩形を探す (before/after クロップ用)。
    // 端に壁が入ると、筋ではなく壁の輪郭を見て「消えた/残った」を判断してしまう。
    P.findFloorRect = function (w, h) {
      const W = mapCanvas.width, H = mapCanvas.height;
      const isFloor = function (tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
        if (!mapData[ty] || mapData[ty][tx] === 2) return false;
        if (typeof isPaintedAndLoaded === 'function' && isPaintedAndLoaded(tx, ty)) return false;
        return true;
      };
      for (let sy = 0; sy + h <= H; sy += 8) {
        for (let sx = 0; sx + w <= W; sx += 8) {
          const t0x = Math.floor((sx + camX) / TILE_SIZE), t1x = Math.floor((sx + w - 1 + camX) / TILE_SIZE);
          const t0y = Math.floor((sy + camY) / TILE_SIZE), t1y = Math.floor((sy + h - 1 + camY) / TILE_SIZE);
          let ok = true;
          for (let ty = t0y; ty <= t1y && ok; ty++) for (let tx = t0x; tx <= t1x && ok; tx++) if (!isFloor(tx, ty)) ok = false;
          // 少なくとも縦2本・横1本のタイル境界を含む構図でないと before/after が読めない
          if (ok && (t1x - t0x) >= 2 && (t1y - t0y) >= 1) return { sx: sx, sy: sy, w: w, h: h, tiles: [t0x, t0y, t1x, t1y] };
        }
      }
      return null;
    };

    // 指定矩形を等倍サンプリング (imageSmoothingEnabled=false) で z 倍に拡大して返す。
    // 補間を掛けると 1px の筋がぼけて「消えたように見える」嘘の絵になるので必ず nearest。
    P.cropZoom = function (o) {
      P.quiesce();
      if (o.t0ms !== undefined && o.t0ms !== null) P.setTime(o.t0ms);
      P.setCam(o.camX, o.camY);
      P.render(!!o.noClouds);
      const c = document.createElement('canvas');
      c.width = o.w * o.z; c.height = o.h * o.z;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.mozImageSmoothingEnabled = false; x.webkitImageSmoothingEnabled = false;
      x.drawImage(mapCanvas, o.sx, o.sy, o.w, o.h, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    };

    window.__probe = P;
    return true;
  });
}

// 実プレイのカメラが本当に小数かを、凍結していないページで実測する。
// これが整数だったら小数カメラでの検査そのものに意味が無くなるので、検査の前提として測る。
async function sampleLiveCamera(browser, base, scen) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, { scen: scen, freeze: false, t0: null });
  // ⚠️ ?fieldgeo=0: この関数は「実プレイのカメラが小数か」を測るためだけのもの。STEP1 の
  //    カメラ地平線ロックが効くと camY が定数になり、小数カメラの前提そのものが消える。
  //    本ドライバは従来の幾何での描画パスを見る契約なので幾何は止める (GEO0 の解説を参照)。
  await page.goto(base + '/index.html?autoplay=15&' + GEO0, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => { try { return typeof startGame === 'function'; } catch (e) { return false; } }, { timeout: 30000, polling: 100 });
  await waitImages(page, 'livecam');
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  const samples = await page.evaluate(() => new Promise((resolve) => {
    const out = [];
    let n = 0;
    const tick = function () {
      out.push([camX, camY]);
      if (++n >= 180) resolve(out); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  await page.close();
  const fracX = samples.filter(s => s[0] % 1 !== 0);
  const fracY = samples.filter(s => s[1] % 1 !== 0);
  // 代表値は「両方が小数」のサンプルから採る (無ければ null を返して呼び出し側でフォールバック)
  const both = samples.find(s => s[0] % 1 !== 0 && s[1] % 1 !== 0);
  return {
    n: samples.length, fracXCount: fracX.length, fracYCount: fracY.length,
    example: both || null, errs,
    head: samples.slice(0, 6).map(s => [+s[0].toFixed(3), +s[1].toFixed(3)]),
  };
}

async function bootPage(browser, url, scenarioId, viewport, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, { scen: scenarioId, freeze: opts.freeze !== false, t0: T_BASE_MS });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof renderMap === 'function' && !!mapData && !!mapCanvas && typeof computeCameraTarget === 'function'; }
    catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await waitImages(page, url);
  await installProbe(page);
  return { page, pageErrors };
}

async function snapMap(page) {
  return page.evaluate(() => {
    window.requestAnimationFrame = function () { return 0; };
    computeCameraTarget();
    camX = camTargetX; camY = camTargetY;
    renderMap();
    return {
      dataUrl: mapCanvas.toDataURL('image/png'),
      camX: camX, camY: camY,
      w: mapCanvas.width, h: mapCanvas.height,
      fieldMode: (function () { try { return FIELD_MODE; } catch (e) { return '<unreadable>'; } })(),
    };
  });
}

async function diffPixels(page, urlA, urlB) {
  return page.evaluate(async (a, b) => {
    const load = (u) => new Promise((res, rej) => { const i = new window.Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: true, a: [ia.width, ia.height], b: [ib.width, ib.height] };
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0, maxDelta = 0, first = null;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) + Math.abs(da[i + 3] - db[i + 3]);
      if (d) { n++; if (d > maxDelta) maxDelta = d; if (!first) first = [(i / 4) % c.width, Math.floor((i / 4) / c.width)]; }
    }
    return { diffPixels: n, maxDelta, first, total: c.width * c.height };
  }, urlA, urlB);
}

// ── グリッド線プローブ ──────────────────────────────────────────────────────
// ⚠️ 雲の影 (multiply) は広い低周波の暗がりを作るので、ON/OFF の生の輝度差をそのまま
//    「grid 線の差」として読むと必ず誤判定する。よって noClouds=true (スタブで雲を止めた
//    レンダ) で測る。これで差分は grid 線だけになり、旧版の厳格な assert がそのまま使える。
//    雲を止めない「実物」に対しては別途 (4g) で局所ディップ法を当てる。
async function gridProbe(page, noClouds, t0ms) {
  return page.evaluate((noClouds, t0ms) => {
    const P = window.__probe;
    P.freeze();
    if (t0ms !== undefined && t0ms !== null) P.setTime(t0ms);
    computeCameraTarget();
    camX = camTargetX; camY = camTargetY;
    P.render(!!noClouds);
    const W = mapCanvas.width, H = mapCanvas.height;
    const startTX = Math.max(0, Math.floor(camX / TILE_SIZE));
    const endTX = Math.min(MAP_W - 1, Math.ceil((camX + W) / TILE_SIZE));
    const startTY = Math.max(0, Math.floor(camY / TILE_SIZE));
    const endTY = Math.min(MAP_H - 1, Math.ceil((camY + H) / TILE_SIZE));

    let best = null;
    for (let ty = startTY; ty <= endTY; ty++) {
      const sy = Math.round(ty * TILE_SIZE - camY) + Math.floor(TILE_SIZE / 2);
      if (sy < 2 || sy > H - 3) continue;
      let run = 0, runStart = -1, bRun = 0, bStart = -1;
      for (let tx = startTX; tx <= endTX; tx++) {
        const ok = mapData[ty] && mapData[ty][tx] !== 2 && !(typeof isPaintedAndLoaded === 'function' && isPaintedAndLoaded(tx, ty));
        if (ok) { if (run === 0) runStart = tx; run++; if (run > bRun) { bRun = run; bStart = runStart; } }
        else run = 0;
      }
      if (bRun >= 5 && (!best || bRun > best.run)) best = { ty, sy, run: bRun, txStart: bStart };
    }
    if (!best) return { ok: false, reason: '床の連続 run が見つからない' };

    const ctx2 = mapCanvas.getContext('2d', { willReadFrequently: true });
    const row = ctx2.getImageData(0, best.sy, W, 1).data;
    const lum = new Array(W);
    for (let x = 0; x < W; x++) lum[x] = 0.2126 * row[x * 4] + 0.7152 * row[x * 4 + 1] + 0.0722 * row[x * 4 + 2];

    // Pass 1.2 に忠実な grid x 候補。左端セルの左辺も引かれるので tx は txStart から。
    const gridSet = {};
    for (let tx = best.txStart; tx < best.txStart + best.run; tx++) {
      const gx = Math.round(tx * TILE_SIZE - camX);
      if (gx >= 5 && gx < W - 5) gridSet[gx] = 1;
      const isRightEdge = (tx === endTX) || !(mapData[best.ty] && mapData[best.ty][tx + 1] !== 2);
      if (isRightEdge) {
        const rx = gx + TILE_SIZE;
        if (rx >= 5 && rx < W - 5) gridSet[rx] = 1;
      }
    }
    const gridXs = Object.keys(gridSet).map(Number).sort((a, b) => a - b);
    const spanX0 = Math.max(0, Math.round(best.txStart * TILE_SIZE - camX));
    const spanX1 = Math.min(W - 1, Math.round((best.txStart + best.run) * TILE_SIZE - camX));

    return { ok: true, ty: best.ty, sy: best.sy, run: best.run, txStart: best.txStart,
             W, lum, gridXs, spanX0, spanX1, camX: camX, camY: camY };
  }, noClouds, t0ms);
}

async function dumpCanvas(page, outPath) {
  const dataUrl = await page.evaluate(() => mapCanvas.toDataURL('image/png'));
  fs.writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return outPath;
}

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();

  // ── baseline の解決 ───────────────────────────────────────────────────────
  // ⚠️ 「HEAD と一致」を非退行の根拠にしてはいけない。屋外実装がコミットされた瞬間に
  //    HEAD 自身が屋外版になり、比較が「現在 vs 現在」になって **assert が何も検証しなく
  //    なる** (実際にセッション中のコミット 1849dd6 でこれが起き、逆に ?field=0 が HEAD と
  //    食い違って FAIL した)。基準は常に **屋外実装が入る前のコミット** でなければならない。
  //    index.html を触ったコミットを新しい順に辿り、FIELD_MODE を含まない最初のものを採る。
  mark('baseline コミットを解決 (屋外実装が入る前の index.html を探す)');
  const BASELINE_REF = (function () {
    const explicit = arg('baseline-ref', null);
    if (explicit) return explicit;
    const log = execFileSync('git', ['log', '--format=%H', '-40', '--', 'index.html'],
      { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const sha of log) {
      const src = execFileSync('git', ['show', sha + ':index.html'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' });
      if (src.indexOf('FIELD_MODE') < 0) return sha;
    }
    return null;
  })();
  if (!BASELINE_REF) {
    console.error('[driver] FIELD_MODE を含まない index.html のコミットが直近40件に無い。--baseline-ref <sha> で指定してください。');
    process.exit(2);
  }
  const baseSubject = execFileSync('git', ['log', '-1', '--format=%h %s', BASELINE_REF], { cwd: ROOT, encoding: 'utf8' }).trim();
  mark('baseline を書き出し: ' + BASELINE_NAME + '  ← ' + baseSubject);
  const baseBuf = execFileSync('git', ['show', BASELINE_REF + ':index.html'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(BASELINE_PATH, baseBuf);
  const baselineIsPreField = Buffer.from(baseBuf).toString('utf8').indexOf('FIELD_MODE') < 0;

  mark('対照群フィクスチャを書き出し: ' + INF0_NAME + ' (INF=0.5 → 0)');
  const curSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const infHits = curSrc.split(INF0_FROM).length - 1;
  fs.writeFileSync(INF0_PATH, curSrc.split(INF0_FROM).join(INF0_TO));
  // 置換が 1 箇所ちょうどでなければ、対照群が「INF だけが違うページ」である保証が消える。
  // (0 箇所 = 実装のリテラルが変わった / 2 箇所以上 = 別の何かも巻き込んでいる)
  const inf0Ready = infHits === 1;

  let srv = null, browser = null;
  const allPageErrors = [];
  const shots = [];
  const metrics = {};
  try {
    srv = await startServer(PORT);
    const BASE = 'http://localhost:' + PORT;
    console.log('[driver] serving ' + ROOT + ' @ ' + BASE);

    const profile = path.join(os.tmpdir(), 'df_pptr_profile_' + Date.now());
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--user-data-dir=' + profile],
    });

    const hashRows = [];

    // baseline が本当に「屋外実装前」であることを先に固める。ここが崩れると (2)(5) の
    // 全ハッシュ assert が「現在 vs 現在」になり、PASS しても何も証明しない。
    check('(B) baseline が屋外実装前のコミットである (非退行 assert が空振りしない前提)',
      baselineIsPreField, 'ref=' + baseSubject + ' / FIELD_MODE を含まない');

    // ── (0) 測定基盤の健全性 ────────────────────────────────────────────────
    // これが崩れていると (7)(8) の全ての数値が無意味になるので最初に確かめる。
    mark('測定基盤の健全性チェック');
    {
      const p = await bootPage(browser, BASE + '/index.html?' + GEO0, FIELD_SCENARIO, HASH_VIEWPORT);
      // ⚠️ (0c) は「雲が画面に入っている時刻」で測らないと必ず false FAIL する。
      //    既定のプレイヤー初期位置 (マップ西端) には雲が1枚も掛かっておらず、
      //    そこでは雲あり/なしの描画が本当に一致してしまう (下の可視率表を参照)。
      //    よって pickCloudTime() で雲を画面中央へ持ってきてから比較する。
      const idem = await p.page.evaluate(() => {
        const P = window.__probe;
        P.freeze(); P.natCam();
        const pick = P.pickCloudTime();
        P.setTime(pick.t0ms);
        P.render(false); const h1 = P.hash();
        P.render(false); const h2 = P.hash();
        P.render(true);  const n1 = P.hash();
        P.render(true);  const n2 = P.hash();
        return { withA: h1, withB: h2, noA: n1, noB: n2, pick: pick };
      });
      check('(0a) 固定時刻で renderMap() が冪等 (雲あり2連射が一致)',
        sha256(idem.withA) === sha256(idem.withB),
        '描画中に RNG/実時計を引いていない証拠。sha=' + sha256(idem.withA).slice(0, 16));
      check('(0b) 固定時刻で renderMap() が冪等 (雲なし2連射が一致)',
        sha256(idem.noA) === sha256(idem.noB), 'sha=' + sha256(idem.noA).slice(0, 16));
      check('(0c) window.drawCloudShadows スタブが renderMap の呼び出しに効く',
        sha256(idem.withA) !== sha256(idem.noA),
        'スタブ有無で描画が変わる = 測定手段として成立 (これが同値だと (7)(8) は全て無意味)');

      const consts = await p.page.evaluate(() => window.__probe.consts());
      metrics.consts = consts;
      console.log('[drv] 雲の定数: ' + JSON.stringify({ TILE: consts.TILE, ALPHA: consts.ALPHA,
        DRIFT: consts.DRIFT, PERIOD: consts.PERIOD, N: consts.N }));
      allPageErrors.push(...p.pageErrors.map(m => 'sanity: ' + m));
      await p.page.close();
    }

    // ── (1)(2)(9) 既存6シナリオ ────────────────────────────────────────────
    for (const scen of LEGACY_SCENARIOS) {
      mark('legacy: ' + scen);
      const cur = await bootPage(browser, BASE + '/index.html', scen, HASH_VIEWPORT);
      const curSnap = await snapMap(cur.page);
      check('(1) ' + scen + ': FIELD_MODE === false', curSnap.fieldMode === false, 'FIELD_MODE=' + curSnap.fieldMode);

      // (9) 雲が1枚も描かれない = drawCloudShadows が呼ばれない
      const calls = await cur.page.evaluate(() => window.__probe.spy());
      check('(9) ' + scen + ': drawCloudShadows が呼ばれない', calls === 0, '呼び出し回数=' + calls);

      const base = await bootPage(browser, BASE + '/' + BASELINE_NAME, scen, HASH_VIEWPORT);
      const baseSnap = await snapMap(base.page);

      const hCur = sha256(curSnap.dataUrl), hBase = sha256(baseSnap.dataUrl);
      const same = hCur === hBase;
      let detail = 'sha=' + hCur.slice(0, 16) + ' cam=(' + Math.round(curSnap.camX) + ',' + Math.round(curSnap.camY) + ') ' + curSnap.w + 'x' + curSnap.h;
      if (!same) {
        const d = await diffPixels(cur.page, curSnap.dataUrl, baseSnap.dataUrl);
        detail = 'cur=' + hCur.slice(0, 16) + ' base=' + hBase.slice(0, 16) + ' diff=' + JSON.stringify(d);
      }
      check('(2) ' + scen + ': mapCanvas 描画が HEAD と完全一致', same, detail);
      hashRows.push({ scen, hCur, hBase, same, cam: [Math.round(curSnap.camX), Math.round(curSnap.camY)] });

      check('(2b) ' + scen + ': 比較カメラ/canvas が同一',
        curSnap.camX === baseSnap.camX && curSnap.camY === baseSnap.camY && curSnap.w === baseSnap.w && curSnap.h === baseSnap.h,
        'cur=(' + curSnap.camX + ',' + curSnap.camY + ',' + curSnap.w + 'x' + curSnap.h + ') base=(' + baseSnap.camX + ',' + baseSnap.camY + ',' + baseSnap.w + 'x' + baseSnap.h + ')');

      allPageErrors.push(...cur.pageErrors.map(m => scen + '(cur): ' + m));
      allPageErrors.push(...base.pageErrors.map(m => scen + '(base): ' + m));
      await cur.page.close(); await base.page.close();
    }

    // ── (3)(4)(5) caravan-road ─────────────────────────────────────────────
    mark('field: ' + FIELD_SCENARIO);
    const fOn = await bootPage(browser, BASE + '/index.html?' + GEO0, FIELD_SCENARIO, HASH_VIEWPORT);
    const fOff = await bootPage(browser, BASE + '/index.html?field=0&' + GEO0, FIELD_SCENARIO, HASH_VIEWPORT);
    const fBase = await bootPage(browser, BASE + '/' + BASELINE_NAME + '?' + GEO0, FIELD_SCENARIO, HASH_VIEWPORT);

    const sOn = await snapMap(fOn.page), sOff = await snapMap(fOff.page), sBase = await snapMap(fBase.page);
    check('(3) caravan-road: FIELD_MODE === true', sOn.fieldMode === true, 'FIELD_MODE=' + sOn.fieldMode);
    check('(3b) caravan-road ?field=0: FIELD_MODE === false', sOff.fieldMode === false, 'FIELD_MODE=' + sOff.fieldMode);

    const offCalls = await fOff.page.evaluate(() => window.__probe.spy());
    check('(9b) caravan-road ?field=0: drawCloudShadows が呼ばれない', offCalls === 0, '呼び出し回数=' + offCalls);
    const onCalls = await fOn.page.evaluate(() => window.__probe.spy());
    check('(9c) caravan-road: drawCloudShadows が毎フレーム1回呼ばれる (陽性対照)', onCalls === 1, '呼び出し回数=' + onCalls);

    const hOff = sha256(sOff.dataUrl), hFBase = sha256(sBase.dataUrl);
    let d5 = 'sha=' + hOff.slice(0, 16);
    if (hOff !== hFBase) {
      const d = await diffPixels(fOff.page, sOff.dataUrl, sBase.dataUrl);
      d5 = 'field0=' + hOff.slice(0, 16) + ' base=' + hFBase.slice(0, 16) + ' diff=' + JSON.stringify(d);
    }
    check('(5) caravan-road ?field=0 が HEAD と完全一致', hOff === hFBase, d5);
    hashRows.push({ scen: 'caravan-road(?field=0)', hCur: hOff, hBase: hFBase, same: hOff === hFBase, cam: [Math.round(sOff.camX), Math.round(sOff.camY)] });

    const hOn = sha256(sOn.dataUrl);
    check('(3c) caravan-road field ON は HEAD と異なる (描画が実際に効いている)', hOn !== hFBase,
      'on=' + hOn.slice(0, 16) + ' base=' + hFBase.slice(0, 16));

    // ── (4) グリッド線 ─────────────────────────────────────────────────────
    // 雲を止めたレンダで測る (雲の multiply が混ざると grid の判定が壊れるため)
    const pOn = await gridProbe(fOn.page, true), pOff = await gridProbe(fOff.page, true);
    if (!pOn.ok || !pOff.ok) {
      check('(4) 床グリッド線プローブが成立', false, JSON.stringify({ pOn: pOn.reason, pOff: pOff.reason }));
    } else {
      const sameSetup = pOn.sy === pOff.sy && pOn.W === pOff.W && pOn.camX === pOff.camX && pOn.camY === pOff.camY;
      check('(4a) プローブ条件が両者同一 (同 scanline/同カメラ)', sameSetup,
        'ON sy=' + pOn.sy + ' cam=' + Math.round(pOn.camX) + ' / OFF sy=' + pOff.sy + ' cam=' + Math.round(pOff.camX));

      const gridSet = new Set(pOff.gridXs);
      const diffXs = [];
      for (let x = pOn.spanX0; x <= pOn.spanX1; x++) if (Math.abs(pOn.lum[x] - pOff.lum[x]) > 0.5) diffXs.push(x);
      const strayXs = diffXs.filter(x => !gridSet.has(x));

      check('(4b) 対照群: ?field=0 側には grid x に暗い線がある (差分 > 0)', diffXs.length > 0,
        'diff列数=' + diffXs.length + ' / grid候補=' + pOff.gridXs.length +
        ' (ty=' + pOff.ty + ' sy=' + pOff.sy + ' span=' + pOn.spanX0 + '..' + pOn.spanX1 + ')');
      check('(4c) 差分は全て grid x 上にしか無い (床の絵そのものは不変)', strayXs.length === 0,
        'grid外差分=' + strayXs.length + (strayXs.length ? ' 例:' + strayXs.slice(0, 12).join(',') : ''));

      // 線の寄与を「同じ列で OFF が ON より暗い量」として差し引いて測る。
      // 床テクスチャ自体の暗い縦列を線と誤認しないための設計。
      let offDark = 0, contribOK = 0, onNeverDarker = 0;
      let minContrib = Infinity;
      for (const gx of pOff.gridXs) {
        const nb = (arr) => (arr[gx - 4] + arr[gx - 3] + arr[gx + 3] + arr[gx + 4]) / 4;
        const dipOff = nb(pOff.lum) - pOff.lum[gx];
        const dipOn = nb(pOn.lum) - pOn.lum[gx];
        const contrib = dipOff - dipOn;
        if (dipOff > 4) offDark++;
        if (contrib > 4) contribOK++;
        if (pOn.lum[gx] >= pOff.lum[gx]) onNeverDarker++;
        if (contrib < minContrib) minContrib = contrib;
      }
      const n = pOff.gridXs.length;
      check('(4d) 対照群: ?field=0 は grid x の過半が周囲より暗い (=線が在る)', offDark > n * 0.5,
        offDark + '/' + n + ' が暗い');
      check('(4e) FIELD_MODE では grid x の暗さが全て「線の寄与ぶん」だけ消えている',
        contribOK === n, contribOK + '/' + n + ' で線の寄与を検出 (最小寄与=' + minContrib.toFixed(1) + ')');
      check('(4f) FIELD_MODE 側が grid x で OFF より暗いことは一度も無い', onNeverDarker === n,
        onNeverDarker + '/' + n);
    }

    // (4g) 雲を止めない「実物」でも grid 線が無いこと。
    // ⚠️ ここで「dip の絶対値が小さいこと」を assert してはいけない。床テクスチャ自体が
    //    grid x に暗い縦列を偶然乗せていることがあり (実測: gx=812 は雲を止めても dip=14.2)、
    //    それを線と誤認して false FAIL する。これは前版が踏んだのと同じ罠である。
    //    正しい instrument は差分:
    //      ① dipReal − dipStub ≈ 0  → 雲は局所(±4px)の線状構造を一切足していない
    //      ② dipField0 − dipReal > 0 → 対照群にだけ線の寄与がある = 線は本当に消えている
    //    ①②とも地形由来の dip が両辺で相殺されるので、テクスチャに騙されない。
    // ⚠️ この測定は「雲が実際にその走査線に掛かっている時刻」で行わなければ無意味になる。
    //    既定時刻 (プレイヤー初期位置=マップ西端) では雲が1枚も画面に無く、dipReal と dipStub が
    //    ビット単位で一致してしまい、assert が「何も検証していないのに PASS」する (実際に一度そうなった)。
    //    よって pickCloudTime() で雲を呼び込み、さらに下の (4g0) で雲の存在自体を先に証明する。
    // ⚠️ 雲は「grid 判定に使う走査線」に掛けなければならない (画面中央ではない)。
    //    走査線 sy は mapData とカメラだけで決まり時刻に依存しないので、先に一度プローブして
    //    sy を知り、その高さを狙って雲を呼び込む。
    const syProbe = await gridProbe(fOn.page, true);
    const gridPick = await fOn.page.evaluate((sy) => {
      const P = window.__probe; P.freeze(); P.natCam(); return P.pickCloudTime(sy);
    }, syProbe.ok ? syProbe.sy : null);
    const pOnReal = await gridProbe(fOn.page, false, gridPick.t0ms);   // 雲ON  (実物)
    const pOnStub = await gridProbe(fOn.page, true, gridPick.t0ms);    // 雲OFF (スタブ)
    const pOffC = await gridProbe(fOff.page, true, gridPick.t0ms);     // 対照群 ?field=0
    if (pOnReal.ok && pOnStub.ok && pOffC.ok && pOnReal.sy === pOffC.sy && pOnStub.sy === pOffC.sy) {
      // (4g0) 走査線上に雲が本当に掛かっていることを先に示す = 以降の assert が空振りでない保証
      let cloudCols = 0, maxCloudLum = 0;
      for (let x = pOnReal.spanX0; x <= pOnReal.spanX1; x++) {
        const d = Math.abs(pOnReal.lum[x] - pOnStub.lum[x]);
        if (d > 1) cloudCols++;
        if (d > maxCloudLum) maxCloudLum = d;
      }
      check('(4g0) grid 判定に使う走査線に雲が実際に掛かっている (空振り防止の前提)',
        cloudCols > 50,
        '雲で輝度が変わった列=' + cloudCols + ' (最大 ' + maxCloudLum.toFixed(1) + ' 輝度) / t=' + gridPick.t0ms + 'ms');

      let maxCloudEffect = 0, minLineGap = Infinity, nGap = 0;
      const rows = [];
      for (const gx of pOffC.gridXs) {
        const nb = (arr) => (arr[gx - 4] + arr[gx - 3] + arr[gx + 3] + arr[gx + 4]) / 4;
        const dReal = nb(pOnReal.lum) - pOnReal.lum[gx];   // 雲ON  (FIELD_MODE 実物)
        const dStub = nb(pOnStub.lum) - pOnStub.lum[gx];   // 雲OFF (FIELD_MODE, スタブ)
        const dOff = nb(pOffC.lum) - pOffC.lum[gx];        // 対照群 (?field=0)
        const cloudEffect = Math.abs(dReal - dStub);
        const lineGap = dOff - dReal;
        if (cloudEffect > maxCloudEffect) maxCloudEffect = cloudEffect;
        if (lineGap < minLineGap) minLineGap = lineGap;
        if (lineGap > 4) nGap++;
        rows.push({ gx, dReal: +dReal.toFixed(2), dStub: +dStub.toFixed(2), dOff: +dOff.toFixed(2),
                    cloudEffect: +cloudEffect.toFixed(3) });
      }
      metrics.gridDips = rows;
      metrics.gridPick = gridPick;
      const n = pOffC.gridXs.length;
      check('(4g) 雲は grid x に線状構造を足していない (|dipReal−dipStub| < 3)',
        maxCloudEffect < 3,
        '最大の雲の影響=' + maxCloudEffect.toFixed(2) + ' (地形由来の dip は両辺で相殺される)');
      check('(4h) 対照群 ?field=0 にだけ線の寄与がある (全 grid x で dipField0 − dipReal > 4)',
        nGap === n, nGap + '/' + n + ' (最小の差=' + minLineGap.toFixed(2) + ')');
    } else {
      check('(4g) 雲ONの実描画での grid プローブが成立', false, 'scanline 不一致 or プローブ失敗');
    }

    // (4i) 画面内の全床画素を 96px 周期で畳み込んだ「継ぎ目の落ち込み」。
    //      走査線1本ではなくフレーム全体を代表する指標なので、「格子が画面から消えたか」を
    //      これで結論づける。残る数 % は床テクスチャ自身の継ぎ目 (描画では消せない)。
    const foldOn = await fOn.page.evaluate(() => window.__probe.foldSeam());
    const foldOff = await fOff.page.evaluate(() => window.__probe.foldSeam());
    metrics.fold = { on: foldOn, off: foldOff };
    check('(4i) FIELD_MODE では 96px 継ぎ目の落ち込みが 5% 未満 (対照 ?field=0 は 15% 超)',
      foldOn.seamDipPct < 5 && foldOff.seamDipPct > 15,
      'ON=' + foldOn.seamDipPct + '% / OFF=' + foldOff.seamDipPct + '%' +
      ' (低減率 ' + (foldOff.seamDipPct / Math.max(foldOn.seamDipPct, 0.01)).toFixed(1) + '倍)' +
      ' — 残余は床テクスチャ自身の継ぎ目');

    // ════════════════════════════════════════════════════════════════════════
    // ── ★(12) 小数カメラでの 96px シーム検査 ───────────────────────────────
    // ════════════════════════════════════════════════════════════════════════
    mark('★小数カメラでの 96px シーム検査 (対照群つき)');
    {
      check('(12·前提) 対照群フィクスチャの置換が 1 箇所ちょうど', inf0Ready,
        'INF リテラルのヒット数=' + infHits + ' (期待 1)。0 なら実装側の書き方が変わっている');

      // ── (12a) 実プレイのカメラが本当に小数であることの実測 ──
      // これが偽なら「小数カメラで測る」という検査設計自体の前提が崩れる。
      const live = await sampleLiveCamera(browser, BASE, FIELD_SCENARIO);
      metrics.liveCamera = live;
      allPageErrors.push(...live.errs.map(m => 'livecam: ' + m));
      console.log('[drv] 実プレイのカメラ標本 (先頭6): ' + JSON.stringify(live.head));
      check('(12a) 実プレイの camX/camY は小数である (検査設計の前提)',
        live.fracXCount > 0 && live.fracYCount > 0,
        live.n + ' フレーム中 camX が小数=' + live.fracXCount + ' / camY が小数=' + live.fracYCount +
        ' 例=' + JSON.stringify(live.example));

      // 実測できた小数部を採用する。幾何 (どの町並みを見るか) は凍結ページの自然カメラから
      // 採り、**サブピクセル位相だけ**を実プレイから移植する。こうしないと live 側の
      // カメラ座標が凍結ページの地形では床の外に落ちうる。
      let FX = live.example ? (live.example[0] % 1) : 0;
      let FY = live.example ? (live.example[1] % 1) : 0;
      let fracSource = '実プレイ実測';
      if (!(FX > 0) || !(FY > 0)) { FX = 0.37; FY = 0.87; fracSource = 'フォールバック(実測が整数だった)'; }
      console.log('[drv] 採用する小数部: fx=' + FX.toFixed(4) + ' fy=' + FY.toFixed(4) + ' (' + fracSource + ')');
      metrics.seamFrac = { FX, FY, fracSource };

      // 凍結ページの自然カメラ + 雲が掛かる時刻 (雲込みの実物条件で測るため)
      const seamBase = await fOn.page.evaluate(() => {
        const P = window.__probe; P.quiesce(); P.natCam();
        const pick = P.pickCloudTime();
        return { camX: camX, camY: camY, t0ms: pick.t0ms };
      });
      const IX = Math.floor(seamBase.camX), IY = Math.floor(seamBase.camY);

      // ── 隙間の大きさは小数部で決まる (解析モデル) ──────────────────────────
      // タイル境界を含む1画素は、手前のタイルが a、次のタイルが (1-a) だけ被覆する
      // (a = 1 - frac(cam))。source-over の合成は out = a + (1-a)² なので、
      //     隙間 = 1 - out = a(1-a) = frac(cam) · (1 - frac(cam))
      // ⇒ **frac=0.5 で最大 25%、frac→0 または 1 で 0 に落ちる。**
      // ⇒ 予測される筋の深さ ΔL ≈ frac(1-frac) × (床の平均輝度)
      // ⚠️ これは検査設計上きわめて重要。実プレイで観測した camY の小数部は 0.979 で、
      //    そこでは隙間が 0.979×0.021 = 2% しか無く、INF=0 の対照群ですら ΔL 1.75 しか
      //    出ない (初回実行で実際にこれが起き、対照群 assert が FAIL した)。
      //    「対照群が沈黙した」のは検査器の失敗ではなく、その位相では欠陥が物理的に
      //    ほぼ存在しないから。よって **最悪位相 frac=0.5 を主検査とし**、実プレイ実測位相は
      //    副検査として解析モデルとの一致で正当性を担保する。
      const gap = (f) => f * (1 - f);
      const WORST = 0.5;
      const CAMS = [
        { name: 'camXのみ小数(最悪位相)', camX: IX + WORST, camY: IY,         fx: WORST, fy: 0 },
        { name: 'camYのみ小数(最悪位相)', camX: IX,         camY: IY + WORST, fx: 0,     fy: WORST },
        { name: '両方小数(最悪位相)',     camX: IX + WORST, camY: IY + WORST, fx: WORST, fy: WORST },
        { name: '両方小数(実プレイ実測位相)', camX: IX + FX, camY: IY + FY,   fx: FX,    fy: FY },
      ];

      // 対照群ページを起こす (現行と同一シナリオ・同一ビューポート・同一プレリュード)
      const fInf0 = await bootPage(browser, BASE + '/' + INF0_NAME + '?' + GEO0, FIELD_SCENARIO, HASH_VIEWPORT);
      allPageErrors.push(...fInf0.pageErrors.map(m => 'caravan-road(inf0): ' + m));

      // 比較の正当性: 3ページが同じ地形を見ていること
      const fpOn = await fOn.page.evaluate(() => window.__probe.mapFingerprint());
      const fpI0 = await fInf0.page.evaluate(() => window.__probe.mapFingerprint());
      const fpF0 = await fOff.page.evaluate(() => window.__probe.mapFingerprint());
      check('(12b) 現行 / INF=0 / ?field=0 の3ページが同一地形 (比較の正当性)',
        fpOn.hash === fpI0.hash && fpOn.hash === fpF0.hash,
        'on=' + fpOn.hash + ' inf0=' + fpI0.hash + ' field0=' + fpF0.hash +
        ' (' + fpOn.MAP_W + 'x' + fpOn.MAP_H + ' tile=' + fpOn.TILE + ')');
      check('(12c) 対照群 INF=0 ページも FIELD_MODE === true (grid 線は消えたまま)',
        (await fInf0.page.evaluate(() => window.__probe.fieldMode())) === true,
        '= 対照群と現行の違いは INF だけ。grid 線の有無は混ざらない');

      // ── 閾値の根拠 ──────────────────────────────────────────────────────
      //   下限 (統計/量子化): バケツ平均は 1 バケツあたり 10^4〜10^5 画素の平均なので、
      //     8bit 量子化 (1 LSB = ΔL 1.0) の効果は SE = σ/√N でほぼ消える (σ≈40, N≈5e4 → 0.2)。
      //     ±3,±4 の 4 バケツ平均を引くのでその 1.25 倍として実効下限 ≈ 0.25 ΔL。
      //   上限 (実際に見える線): 消したグリッド線 rgba(0,0,0,0.22) の寄与が実測 ΔL 24.4。
      //   ⇒ 閾値 = 幾何中間 √(0.25 × 24.4) ≈ 2.5 ΔL。
      //     知覚側からも裏が取れる: 2.5/255 ≈ 1% の輝度差で、模様のある地面に乗った 1px の線が
      //     見えるのに要る Weber コントラスト (概ね 2%) の半分。= 知覚下限より下。
      const SEAM_MAX_L = 2.5;
      const seamRows = [];
      for (const cam of CAMS) {
        const o = { camX: cam.camX, camY: cam.camY, t0ms: seamBase.t0ms, noClouds: false };
        const now = await fOn.page.evaluate((a) => window.__probe.seamProfile(a), o);
        const i0  = await fInf0.page.evaluate((a) => window.__probe.seamProfile(a), o);
        const f0  = await fOff.page.evaluate((a) => window.__probe.seamProfile(a), o);
        const row = { cam: cam.name, camX: cam.camX, camY: cam.camY,
          v: { now: now.vertical.dipL,   inf0: i0.vertical.dipL,   field0: f0.vertical.dipL,
               bucket: now.vertical.bucket, samples: now.vertical.samples,
               otherWorst: now.vertical.otherWorstDipL },
          h: { now: now.horizontal.dipL, inf0: i0.horizontal.dipL, field0: f0.horizontal.dipL,
               bucket: now.horizontal.bucket, samples: now.horizontal.samples,
               otherWorst: now.horizontal.otherWorstDipL },
          fx: cam.fx, fy: cam.fy,
          meanFloorL: now.vertical.meanFloorL,
          predV: +(gap(cam.fx) * now.vertical.meanFloorL).toFixed(2),
          predH: +(gap(cam.fy) * now.horizontal.meanFloorL).toFixed(2) };
        seamRows.push(row);
        console.log('[drv] シーム ' + cam.name + ' cam=(' + cam.camX.toFixed(3) + ',' + cam.camY.toFixed(3) + ')' +
          '  縦 ΔL: 現行=' + row.v.now + ' / INF=0=' + row.v.inf0 + ' / ?field=0=' + row.v.field0 +
          '  横 ΔL: 現行=' + row.h.now + ' / INF=0=' + row.h.inf0 + ' / ?field=0=' + row.h.field0);

        // ① 本命: 現行実装は小数カメラでも筋を出さない
        check('(12·' + cam.name + '·縦) 現行の縦シーム ΔL < ' + SEAM_MAX_L,
          Math.abs(row.v.now) < SEAM_MAX_L,
          'ΔL=' + row.v.now + ' (バケツ' + row.v.bucket + ' / 標本' + row.v.samples + 'px' +
          ' / シーム以外の最大局所差=' + row.v.otherWorst + ' ← 床テクスチャ由来の上限)');
        check('(12·' + cam.name + '·横) 現行の横シーム ΔL < ' + SEAM_MAX_L,
          Math.abs(row.h.now) < SEAM_MAX_L,
          'ΔL=' + row.h.now + ' (バケツ' + row.h.bucket + ' / 標本' + row.h.samples + 'px)');

        // ② 対照群1: INF=0 だと同じ検査器が「解析モデルが予測した深さの筋」を検出する
        //    ⚠️ ここが本検査の心臓。単に「何か検出した」ではなく **予測値と一致すること**を
        //       見るので、検査器が校正済みであることまで同時に示せる。
        //       予測 ΔL = frac(1-frac) × 床の平均輝度。frac=0 の軸は予測 0 = 筋が物理的に無い。
        const axis = (ax, lab) => {
          const pred = gap(ax.frac) * ax.meanL;
          const label = '(12·' + cam.name + '·' + lab + '·対照) INF=0 の筋が解析モデル ' +
            'frac(1-frac)×L̄ と一致する';
          const detail = '予測 ΔL=' + pred.toFixed(2) + ' (frac=' + ax.frac.toFixed(4) +
            ' L̄=' + ax.meanL + ') / INF=0 実測 ΔL=' + ax.inf0 + ' / 現行 ΔL=' + ax.now;
          if (pred >= SEAM_MAX_L * 2) {
            // 筋が十分深いはずの位相: 検出できることと、予測と 35% 以内で一致することの両方
            check(label + ' + 実際に検出できる',
              ax.inf0 > SEAM_MAX_L * 2 && Math.abs(ax.inf0 - pred) < pred * 0.35,
              detail + ' (低減 ' + (ax.inf0 / Math.max(Math.abs(ax.now), 0.01)).toFixed(1) + '倍)');
          } else {
            // 筋が物理的にほぼ無い位相: 対照群も沈黙するのが正しい。予測と 1.5ΔL 以内で一致。
            check(label + ' (予測が微小 = この位相では欠陥が物理的にほぼ無い)',
              Math.abs(ax.inf0 - pred) < 1.5,
              detail + ' ← 対照群の沈黙が検査器の失敗でないことの根拠');
          }
        };
        axis({ frac: cam.fx, meanL: now.vertical.meanFloorL, inf0: row.v.inf0, now: row.v.now }, '縦');
        axis({ frac: cam.fy, meanL: now.horizontal.meanFloorL, inf0: row.h.inf0, now: row.h.now }, '横');

        // ③ 対照群2: ?field=0 に「描かれた grid 線」があることを、AA とは独立な機序で検出する。
        //    ⚠️ 測るバケツは AA シームのそれ (95) ではなく **線が乗るバケツ** (gridBucket)。
        //       線は Math.round で位置決めされるので小数部によって 95/0 のどちらにも乗る。
        //    現行 (FIELD_MODE) は同じバケツで沈黙していなければならない = 線が本当に消えた証拠。
        const ctl2 = (fld, cur, lab) => {
          check('(12·' + cam.name + '·' + lab + '·対照2) ?field=0 の描かれた grid 線を検出し、現行は同じ位置で沈黙',
            fld.gridDipL > SEAM_MAX_L * 2 && Math.abs(cur.gridDipL) < SEAM_MAX_L,
            '?field=0 ΔL=' + fld.gridDipL + ' / 現行 ΔL=' + cur.gridDipL +
            ' (線バケツ=' + fld.gridBucket + ' 標本' + fld.gridSamples + 'px, AAシームバケツ=' + fld.bucket + ')');
        };
        ctl2(f0.vertical, now.vertical, '縦');
        ctl2(f0.horizontal, now.horizontal, '横');
      }
      metrics.seam = { thresholdL: SEAM_MAX_L, base: seamBase, rows: seamRows };

      // ── (12z) before/after クロップ (人間の目で確認するための一次資料) ──
      // 同一カメラ・同一時刻・同一構図で INF=0 と現行を撮り、4倍 nearest 拡大する。
      // ⚠️ 位相は最悪値 (frac=0.5) を使う。実プレイで到達しうる値の中で隙間が最大 (25%) になる
      //    位相で、修正の効果が最もはっきり見える。実測位相 0.979 で撮ると before ですら
      //    隙間 2% しか無く、「元から筋なんて無かった」ようにしか見えない絵になる。
      const cropCam = { camX: IX + WORST, camY: IY + WORST, t0ms: seamBase.t0ms };
      const rect = await fOn.page.evaluate((c) => {
        const P = window.__probe; P.quiesce(); P.setTime(c.t0ms); P.setCam(c.camX, c.camY); P.render(false);
        return P.findFloorRect(240, 192);
      }, cropCam);
      metrics.seamCrop = { cam: cropCam, rect: rect, zoom: 4 };
      if (!rect) {
        check('(12z) before/after クロップ用の「床だけ」矩形が取れる', false, '240x192 の純床矩形が見つからない');
      } else {
        const shot = async (page, name) => {
          const url = await page.evaluate((a) => window.__probe.cropZoom(a),
            { camX: cropCam.camX, camY: cropCam.camY, t0ms: cropCam.t0ms,
              sx: rect.sx, sy: rect.sy, w: rect.w, h: rect.h, z: 4, noClouds: false });
          const fp = path.join(SHOT_DIR, name);
          fs.writeFileSync(fp, Buffer.from(url.split(',')[1], 'base64'));
          shots.push(fp);
          return sha256(url);
        };
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        const hBefore = await shot(fInf0.page, 'v2_seam_before.png');
        const hAfter = await shot(fOn.page, 'v2_seam_after.png');
        check('(12z) before(INF=0) と after(現行) が別画像になっている',
          hBefore !== hAfter,
          'before=' + hBefore.slice(0, 16) + ' after=' + hAfter.slice(0, 16) +
          ' / 矩形=' + JSON.stringify(rect) + ' cam=(' + cropCam.camX.toFixed(3) + ',' + cropCam.camY.toFixed(3) + ') 4倍 nearest');
      }
      await fInf0.page.close();
    }

    // ── (7) 雲の影が実際に描かれていること ─────────────────────────────────
    mark('雲の影の実測 (在ることを測る)');
    {
      // 自然カメラのまま、雲が画面中央に来る時刻を解いて測る
      const pick = await fOn.page.evaluate(() => {
        const P = window.__probe; P.freeze(); P.natCam();
        return Object.assign(P.pickCloudTime(), P.dims(), { camX: camX, camY: camY });
      });
      metrics.pick = pick;
      const an = await fOn.page.evaluate((t0) => window.__probe.analyze({ t0ms: t0, shape: true }), pick.t0ms);
      metrics.analyze = an;
      console.log('[drv] 影プロファイル: ' + JSON.stringify({
        shadowPx: an.shadowPx, shadowFrac: an.shadowFrac, maxAlpha: an.maxAlpha, meanAlpha: an.meanAlpha,
        blobCount: an.blobCount, blobs: an.blobs, longestRunPx: an.longestRunPx,
        maxAdjacentAlphaStep: an.maxAdjacentAlphaStep }));
      console.log('[drv] 影の内外 RGB: ' + JSON.stringify({ darkest: an.darkest, outside: an.outside }));

      check('(7a) 雲の影が画素として存在する (雲あり/雲なしの差が出る)', an.shadowPx > 0,
        '影画素=' + an.shadowPx + ' (' + (an.shadowFrac * 100).toFixed(1) + '% of frame)');
      check('(7b) 影が画面の意味のある面積を占める (>3%)', an.shadowFrac > 0.03,
        (an.shadowFrac * 100).toFixed(1) + '%');
      check('(7c) 影の濃さが CLOUD_ALPHA(' + metrics.consts.ALPHA + ') の範囲に収まる',
        an.maxAlpha > 0.05 && an.maxAlpha <= metrics.consts.ALPHA + 0.02,
        '最大 ' + (an.maxAlpha * 100).toFixed(1) + '% 暗くなる / 平均 ' + (an.meanAlpha * 100).toFixed(1) + '%');
      // 閾値 0.05 の根拠: 実測の残差は 8bit 量子化の下限 (lum>=100 で 1 LSB = alpha 0.01) に
      // 張り付いており、grid 線が作る段差 0.22 とは 20 倍以上離れている。0.05 はその中間。
      check('(7d) 影は「柔らかい」(明るい画素対での隣接段差が微小 = 細線ではない)',
        an.smoothness && an.smoothness.maxAdjacentAlphaStep < 0.05,
        an.smoothness ? '隣接段差 最大=' + an.smoothness.maxAdjacentAlphaStep +
          ' / p99=' + an.smoothness.p99 + ' (量子化下限=' + an.smoothness.quantFloor +
          ', lum>=' + an.smoothness.brightMaskLum + ' の ' + an.smoothness.pairs + ' 対で測定)' +
          ' ← grid線なら 0.22 級' : 'smoothness 未計測');
      check('(7e) 影は「大きい塊」(最大塊の幅・高さがともに 200px 超)',
        an.blobs && an.blobs.length > 0 && an.blobs[0].wPx > 200 && an.blobs[0].hPx > 200,
        an.blobs && an.blobs[0] ? '最大塊 ' + an.blobs[0].wPx + 'x' + an.blobs[0].hPx + 'px area=' + an.blobs[0].areaPx : 'なし');
      check('(7f) 96px 格子ではない (最も濃い行の連続ランが TILE_SIZE を大きく超える)',
        an.longestRunPx > 96 * 2,
        '最長ラン=' + an.longestRunPx + 'px (96px 格子なら 1〜2px にしかならない)');
      check('(7g) 塊の個数が少数 (格子状の多数の小片ではない)', an.blobCount > 0 && an.blobCount <= 40,
        '塊の個数=' + an.blobCount);
      check('(7h) 影の外では雲あり/なしが完全に同一 RGB', an.outside ? an.outside.identical === true : false,
        an.outside ? JSON.stringify(an.outside) : '影の外の代表点が取れなかった');

      // 指定どおり ?field=0 (雲なし) と 既定 (雲あり) を同一カメラ・同一時刻で比較した diff も出す。
      // ⚠️ この差分には grid 線の消失も混ざる。混ざったままだと「雲の証明」にならないので、
      //    grid x を除外した残差が雲であることを面積で示す。
      const camPair = { camX: pick.camX, camY: pick.camY, t0ms: pick.t0ms };
      const rawOn = await fOn.page.evaluate((c) => {
        const P = window.__probe; P.freeze(); P.setTime(c.t0ms); P.setCam(c.camX, c.camY);
        P.render(false); return P.hash();
      }, camPair);
      const rawOff = await fOff.page.evaluate((c) => {
        const P = window.__probe; P.freeze(); P.setTime(c.t0ms); P.setCam(c.camX, c.camY);
        P.render(false); return P.hash();
      }, camPair);
      const rawDiff = await fOn.page.evaluate(async (a, b, tile) => {
        const load = (u) => new Promise((res) => { const i = new window.Image(); i.onload = () => res(i); i.src = u; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
        x.clearRect(0, 0, c.width, c.height);
        x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
        let total = 0, onGrid = 0, offGrid = 0;
        for (let p = 0, i = 0; p < c.width * c.height; p++, i += 4) {
          const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
          if (!d) continue;
          total++;
          const gx = ((p % c.width) + Math.round(camX)) % tile;
          const gy = (((p / c.width) | 0) + Math.round(camY)) % tile;
          if (gx <= 1 || gx >= tile - 1 || gy <= 1 || gy >= tile - 1) onGrid++; else offGrid++;
        }
        return { total, onGrid, offGrid, frame: c.width * c.height };
      }, rawOn, rawOff, 96);
      metrics.rawDiff = rawDiff;
      check('(7i) field ON vs ?field=0 の生差分のうち、grid 線に載らない画素 (=雲) が大多数',
        rawDiff.offGrid > rawDiff.onGrid,
        '差分計=' + rawDiff.total + ' / grid線上=' + rawDiff.onGrid + ' / grid外(雲)=' + rawDiff.offGrid);
    }

    // ── (8) 雲が流れていること ─────────────────────────────────────────────
    mark('雲の流れの実測');
    {
      const iso = await fOn.page.evaluate(() => {
        const P = window.__probe; P.quiesce();
        return P.pickDriftSetup([20, 14, 10, 7]);
      });
      metrics.iso = iso;
      const DT = iso && iso.dtSec;
      if (!iso || iso.fail) {
        check('(8) 雲の流れを測れる構図が見つかる', false, JSON.stringify(iso));
      } else {
        console.log('[drv] 単独雲: ' + JSON.stringify(iso));
        // 重心は「雲が掃く帯」に限定して取る (マスク境界バイアスの排除。rect の由来は
        // pickDriftSetup のコメント参照)。両時刻とも同じ矩形・同じカメラ・同じ下地。
        const c1 = await fOn.page.evaluate((o) => window.__probe.centroid(o.t0Sec * 1000, o.camX, o.camY, o.rect), iso);
        const c2 = await fOn.page.evaluate((o) => window.__probe.centroid((o.t0Sec + o.dtSec) * 1000, o.camX, o.camY, o.rect), iso);
        metrics.drift = { c1, c2 };
        const dx = c2 && c1 ? c2.x - c1.x : NaN;
        const dy = c2 && c1 ? c2.y - c1.y : NaN;
        const pred = iso.predictedShiftPx;
        const err = Math.abs(dx - pred);
        console.log('[drv] 重心: t0=' + JSON.stringify(c1) + '  t0+' + DT + 's=' + JSON.stringify(c2));
        check('(8a) 影の重心が水平に移動している', isFinite(dx) && dx > 1,
          'Δx=' + (isFinite(dx) ? dx.toFixed(1) : 'NaN') + 'px / Δy=' + (isFinite(dy) ? dy.toFixed(1) : 'NaN') + 'px');
        check('(8b) 移動量が CLOUD_DRIFT_PXS からの予測と一致 (誤差 < 3px)',
          isFinite(err) && err < 3,
          '実測 Δx=' + (isFinite(dx) ? dx.toFixed(2) : 'NaN') + 'px / 予測=' + pred.toFixed(2) +
          'px (= ' + DT + 's × ' + metrics.consts.DRIFT + 'px/s × v' + iso.v + ') / 誤差=' + (isFinite(err) ? err.toFixed(2) : 'NaN') + 'px');
        check('(8c) 垂直方向には流れない (Δy ≈ 0)', isFinite(dy) && Math.abs(dy) < 3,
          'Δy=' + (isFinite(dy) ? dy.toFixed(2) : 'NaN') + 'px');
      }
    }

    // ── 雲の可視率 (assert ではなく設計判断の材料) ─────────────────────────
    // 空 + 遠景は「自然カメラで 0/67 列」だったので撤去された。雲がその轍を踏んでいないかを測る。
    mark('自然カメラでの雲の可視率');
    const visRows = [];
    for (const vp of SHOT_VIEWPORTS) {
      const p = await bootPage(browser, BASE + '/index.html?' + GEO0, FIELD_SCENARIO, vp);
      const v = await p.page.evaluate(() => {
        const P = window.__probe; P.freeze();
        const W = mapCanvas.width, H = mapCanvas.height;
        const ox = playerX, oy = playerY;
        let cols = 0, withCloud = 0, firstTen = 0, firstTenWith = 0;
        const t = Date.now() * 0.001;
        for (let tx = 0; tx < MAP_W; tx++) {
          let top = -1, bot = -1;
          for (let y = 0; y < MAP_H; y++) if (mapData[y][tx] !== 2) { if (top < 0) top = y; bot = y; }
          if (top < 0) continue;
          playerX = tx * TILE_SIZE + TILE_SIZE / 2;
          playerY = Math.floor((top + bot) / 2) * TILE_SIZE + TILE_SIZE / 2;
          computeCameraTarget();
          const cX = camTargetX, cY = camTargetY;
          let n = 0;
          for (const c of CLOUDS) {
            const size = CLOUD_TILE_PX * c.s;
            let wx = (c.x + t * CLOUD_DRIFT_PXS * c.v) % CLOUD_PERIOD_X; if (wx < 0) wx += CLOUD_PERIOD_X;
            for (const dupe of [0, -CLOUD_PERIOD_X]) {
              const sx = wx + dupe - cX - size / 2, sy = c.y - cY - size / 2;
              if (sx + size < 0 || sx > W) continue;
              if (sy + size < 0 || sy > H) continue;
              n++;
            }
          }
          cols++; if (n > 0) withCloud++;
          if (cols <= 10) { firstTen++; if (n > 0) firstTenWith++; }
        }
        playerX = ox; playerY = oy;
        return { cols, withCloud, firstTen, firstTenWith, canvas: W + 'x' + H };
      });
      visRows.push({ vp: vp.name, v });
      allPageErrors.push(...p.pageErrors.map(m => 'vis ' + vp.name + ': ' + m));
      await p.page.close();
    }
    metrics.visibility = visRows;

    await fOn.page.close(); await fOff.page.close(); await fBase.page.close();
    allPageErrors.push(...fOn.pageErrors.map(m => 'caravan-road(on): ' + m));
    allPageErrors.push(...fOff.pageErrors.map(m => 'caravan-road(field0): ' + m));
    allPageErrors.push(...fBase.pageErrors.map(m => 'caravan-road(base): ' + m));

    // ── スクリーンショット ──────────────────────────────────────────────────
    // ⚠️ 「撮ったが雲がいなかった」を防ぐため、決定論ページで pickCloudTime() を解いて
    //    雲を画面中央に持ってきた固定時刻で撮る (その旨は報告に明記する)。
    //    ON/OFF は同一プレイヤー位置・同一カメラ・同一時刻なので厳密な before/after になる。
    mark('スクリーンショット撮影');
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const shotMeta = [];
    const stability = [];

    // 撮影直前に canvas が本当に静止しているかを確かめてから撮る。
    // (quiesce 前は renderWorld 経由でパーティ追従カメラに描き直され、強制したカメラが消える)
    async function stableShot(page, outPath, label) {
      const h1 = await page.evaluate(() => window.__probe.hash());
      await new Promise(r => setTimeout(r, 500));
      const h2 = await page.evaluate(() => window.__probe.hash());
      const stable = sha256(h1) === sha256(h2);
      stability.push({ label, stable });
      await page.screenshot({ path: outPath });
      return stable;
    }

    for (const vp of SHOT_VIEWPORTS) {
      // 先に field ON 側で「雲が中央に来る時刻」と natural カメラを決める
      const on = await bootPage(browser, BASE + '/index.html?' + GEO0, FIELD_SCENARIO, vp);
      await on.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1500));
      // ★ quiesce → 保留中の rAF が1回発火して自滅するのを待つ → それから構図を作る
      await on.page.evaluate(() => window.__probe.quiesce());
      await new Promise(r => setTimeout(r, 400));
      // ⚠️ カメラは**実プレイと同じ小数のまま**にする。整数へ丸めると床 fillRect の被覆率が
      //    100% になり、そもそも存在しうるシームが消える = 実機では見えない「嘘の絵」になる。
      //    幾何は natCam、サブピクセル位相は (12a) で実測した小数部を移植する。
      const setup = await on.page.evaluate((f) => {
        const P = window.__probe; P.quiesce(); P.natCam();
        camX = Math.floor(camX) + f.FX; camY = Math.floor(camY) + f.FY;
        const pick = P.pickCloudTime();
        P.setTime(pick.t0ms); P.render(false);
        return Object.assign(pick, { camX: camX, camY: camY });
      }, metrics.seamFrac);
      // ⚠️ 「雲が入る構図を組んだ」で終わらせない。組んだ結果その画面に影が何%あるかを
      //    **実測**する。構図の作り方を信じて撮り、後から「雲が写っていなかった」と分かるのが
      //    このプロジェクトで一番起きている事故 (空+遠景の撤去がまさにそれ)。
      const shotShadow = await on.page.evaluate((s) => {
        const a = window.__probe.analyze({ t0ms: s.t0ms, camX: s.camX, camY: s.camY });
        return { frac: a.shadowFrac, maxAlpha: a.maxAlpha, meanAlpha: a.meanAlpha };
      }, setup);
      // 撮影構図を作り直す (analyze が雲なしレンダで終わっている可能性を潰す)
      await on.page.evaluate((s) => {
        const P = window.__probe; P.quiesce(); P.setTime(s.t0ms); P.setCam(s.camX, s.camY); P.render(false);
      }, setup);
      const outOn = path.join(SHOT_DIR, 'v2_' + vp.name + '.png');
      await stableShot(on.page, outOn, 'v2_' + vp.name);
      shots.push(outOn);
      shotMeta.push({ vp: vp.name, t0ms: setup.t0ms, cloudIndex: setup.cloudIndex,
                      cam: [Math.round(setup.camX), Math.round(setup.camY)],
                      shadowFracOfFrame: shotShadow.frac, peakDarkenPct: +(shotShadow.maxAlpha * 100).toFixed(2),
                      meanDarkenPct: +(shotShadow.meanAlpha * 100).toFixed(2) });
      check('(10s) ' + vp.name + ': 撮影した画面に雲の影が実際に写っている (>3% of frame)',
        shotShadow.frac > 0.03,
        '影の面積=' + (shotShadow.frac * 100).toFixed(1) + '% / 最大 ' + (shotShadow.maxAlpha * 100).toFixed(1) +
        '% 暗化 / 平均 ' + (shotShadow.meanAlpha * 100).toFixed(1) + '%');
      allPageErrors.push(...on.pageErrors.map(m => 'shot ' + vp.name + ': ' + m));
      await on.page.close();

      // OFF 側を同じ座標・同じ時刻で
      const off = await bootPage(browser, BASE + '/index.html?field=0&' + GEO0, FIELD_SCENARIO, vp);
      await off.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1500));
      await off.page.evaluate(() => window.__probe.quiesce());
      await new Promise(r => setTimeout(r, 400));
      await off.page.evaluate((s) => {
        const P = window.__probe; P.quiesce(); P.setTime(s.t0ms); P.setCam(s.camX, s.camY); P.render(false);
      }, setup);
      const outOff = path.join(SHOT_DIR, 'v2_' + vp.name + '_field0.png');
      await stableShot(off.page, outOff, 'v2_' + vp.name + '_field0');
      shots.push(outOff);
      allPageErrors.push(...off.pageErrors.map(m => 'shot ' + vp.name + ' field0: ' + m));
      await off.page.close();
    }
    metrics.shotMeta = shotMeta;
    metrics.stability = stability;
    check('(10) スクショ撮影時に canvas が静止している (強制したカメラ/時刻が生きている)',
      stability.every(s => s.stable),
      stability.map(s => s.label + '=' + (s.stable ? 'stable' : 'MOVED')).join(' '));

    // showcase: 一番大きい雲を画面中央に置いて canvas を直接書き出す (HUD 無し)
    mark('showcase 撮影');
    {
      const p = await bootPage(browser, BASE + '/index.html?' + GEO0, FIELD_SCENARIO, { width: 1440, height: 900 });
      await p.page.evaluate(() => { try { startGame(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 1500));
      await p.page.evaluate(() => window.__probe.quiesce());
      await new Promise(r => setTimeout(r, 400));
      const info = await p.page.evaluate((f) => {
        const P = window.__probe; P.quiesce();
        const W = mapCanvas.width, H = mapCanvas.height;
        // ① 道 (床) が横いっぱいに続く行 = 影が地面に落ちているのが分かる構図
        let bestTy = -1, bestRun = 0;
        for (let ty = 0; ty < MAP_H; ty++) {
          let run = 0;
          for (let tx = 0; tx < MAP_W; tx++) if (mapData[ty][tx] !== 2) run++;
          if (run > bestRun) { bestRun = run; bestTy = ty; }
        }
        const roadCenterY = bestTy * TILE_SIZE;
        const MAPW = MAP_W * TILE_SIZE, MAPH = MAP_H * TILE_SIZE;
        // ② ⚠️ 雲の選定は「推測」ではなく**実測**で行う。
        //    v1 は「道の高さに一番近い雲」で選んでいたが、それだと小さい雲 (s=1.7) が
        //    当たって影がほとんど写らない絵になった (実際 v2 の初回 showcase がそれ)。
        //    影の濃さは globalAlpha だけでなく焼き込みタイルの α プロファイルにも依るので、
        //    机上で最良を当てるのは無理。全候補を実際に描いて影の総量を測り、最大を採る。
        const MAPW0 = MAP_W * TILE_SIZE, MAPH0 = MAP_H * TILE_SIZE;
        const LUMF = function (d, i) { return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
        const scoreOf = function (idx) {
          const cc = CLOUDS[idx];
          const camXw = Math.max(0, Math.min(MAPW0 - W, MAPW0 / 2 - W / 2)) + f.FX;
          let ddx = (camXw + W / 2 - cc.x) % CLOUD_PERIOD_X; if (ddx < 0) ddx += CLOUD_PERIOD_X;
          const tt = ddx / (CLOUD_DRIFT_PXS * cc.v);
          const cyw = Math.max(0, Math.min(MAPH0 - H, cc.y - H / 2)) + f.FY;
          P.setTime(Math.round(tt * 1000)); P.setCam(camXw, cyw);
          P.render(true);  const A0 = P.grab();
          P.render(false); const B0 = P.grab();
          let w = 0, peak = 0;
          for (let q = 0, i2 = 0; q < W * H; q++, i2 += 4) {
            const la = LUMF(A0, i2);
            if (la < 25) continue;
            const av = 1 - LUMF(B0, i2) / la;
            if (av > 0.02) { w += av; if (av > peak) peak = av; }
          }
          return { idx: idx, weight: w, peak: peak, tSec: tt, camX: camXw, camY: cyw };
        };
        let best = null;
        for (let i = 0; i < CLOUDS.length; i++) {
          const sc = scoreOf(i);
          if (!best || sc.weight > best.weight) best = sc;
        }
        const bi = best.idx;
        const c = CLOUDS[bi];
        // ③ ⚠️ 「t を先に決めて雲の位置にカメラを合わせる」とマップ外に出る。
        //    (v1 の最初の試行は camX=6305 + 1440 > 6912 で画面の大半が盤外の黒になった)
        //    正しい順序は逆: **カメラを盤内に置いてから、そこへ雲が来る t を解く**。
        //    scoreOf が既にその順序で解いた値を持っているので、勝った構図をそのまま採用する。
        // ⚠️ 実プレイと同じ小数カメラで撮る (整数に丸めるとシームが消えて嘘の画になる)
        const t = best.tSec;
        P.setTime(Math.round(t * 1000)); P.setCam(best.camX, best.camY); P.render(false);
        return { cloudIndex: bi, s: c.s, tSec: +t.toFixed(1), camX: best.camX, camY: best.camY,
                 floorRow: bestTy, floorRun: bestRun,
                 shadowWeight: Math.round(best.weight), peakDarkenPct: +(best.peak * 100).toFixed(2),
                 selectedBy: '全14候補を実描画して影の総量が最大のものを採用',
                 cloudYOffsetFromCenter: Math.round(c.y - (best.camY + H / 2)),
                 cloudRadius: Math.round(CLOUD_TILE_PX * c.s / 2) };
      }, metrics.seamFrac);
      metrics.showcase = info;
      const out = path.join(SHOT_DIR, 'v2_showcase.png');
      await dumpCanvas(p.page, out);
      shots.push(out);

      // 同じ構図で on / off / 増幅差分 の3枚を出す (人間が影の有無を確定できる一次資料)
      const proof = await p.page.evaluate((o) => window.__probe.proof(o),
        { t0ms: Math.round(info.tSec * 1000), camX: info.camX, camY: info.camY });
      const writeUrl = (url, name) => {
        const fp = path.join(SHOT_DIR, name);
        fs.writeFileSync(fp, Buffer.from(url.split(',')[1], 'base64'));
        shots.push(fp);
        return fp;
      };
      writeUrl(proof.on, 'v2_proof_on.png');
      writeUrl(proof.off, 'v2_proof_off.png');
      writeUrl(proof.diff, 'v2_proof_diff_x' + proof.amp + '.png');
      metrics.proof = { camX: proof.camX, camY: proof.camY, amp: proof.amp,
                        onOffIdentical: sha256(proof.on) === sha256(proof.off) };
      check('(11) proof 画像: 雲あり/雲なしが実際に別画像になっている',
        sha256(proof.on) !== sha256(proof.off),
        'on=' + sha256(proof.on).slice(0, 16) + ' off=' + sha256(proof.off).slice(0, 16));

      allPageErrors.push(...p.pageErrors.map(m => 'showcase: ' + m));
      await p.page.close();
    }

    // ── (6) スモーク ────────────────────────────────────────────────────────
    if (!SKIP_SMOKE) {
      mark('スモーク ?autoplay=15&diag=1');
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument(prelude, { scen: FIELD_SCENARIO, freeze: false, t0: null });
      await page.goto(BASE + '/index.html?autoplay=15&diag=1', { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForFunction(() => { try { return typeof startGame === 'function'; } catch (e) { return false; } }, { timeout: 30000, polling: 100 });
      await waitImages(page, 'smoke');
      const before = await page.evaluate(() => { try { startGame(); } catch (e) {} return { x: playerX, y: playerY }; });
      await new Promise(r => setTimeout(r, 25000));
      const after = await page.evaluate(() => ({
        x: playerX, y: playerY, started: gameStarted, over: gameOver,
        diag: (window.__diag && window.__diag.getReport) ? (function () {
          try { const r = window.__diag.getReport(); return r && r.totals ? Object.keys(r.totals.byId || {}) : []; } catch (e) { return ['<err>']; }
        })() : null,
      }));
      const moved = Math.abs(after.x - before.x) + Math.abs(after.y - before.y) > 1;
      check('(6a) スモーク: ゲームが開始し進行した', after.started === true && moved,
        'started=' + after.started + ' moved=' + moved + ' from(' + Math.round(before.x) + ',' + Math.round(before.y) + ')→(' + Math.round(after.x) + ',' + Math.round(after.y) + ')');
      const critical = (after.diag || []).filter(id => id === 'js-error' || id === 'js-rejection' || id.indexOf('nan-') === 0 || id === 'leader-oob');
      check('(6b) スモーク: __diag に critical 記録が無い', critical.length === 0,
        'byId=' + JSON.stringify(after.diag));
      allPageErrors.push(...errs.map(m => 'smoke: ' + m));
      await page.close();
    }

    check('(6c) 全ケースで pageerror 0', allPageErrors.length === 0,
      allPageErrors.length ? allPageErrors.slice(0, 8).join(' | ') : 'none');

    // ── サマリ ──────────────────────────────────────────────────────────────
    console.log('\n─── ハッシュ表 (sha256 先頭16) ───');
    for (const r of hashRows) {
      console.log('  ' + (r.same ? 'MATCH' : 'DIFF ') + '  ' + r.scen.padEnd(24) +
        ' cur=' + r.hCur.slice(0, 16) + ' base=' + r.hBase.slice(0, 16) + ' cam=' + JSON.stringify(r.cam));
    }
    console.log('\n─── 自然カメラでの雲の可視率 (設計判断の材料) ───');
    for (const r of metrics.visibility) {
      console.log('  ' + r.vp.padEnd(12) + ' canvas=' + r.v.canvas.padEnd(10) +
        ' 雲が入る列 ' + r.v.withCloud + '/' + r.v.cols +
        '  (マップ西端10列では ' + r.v.firstTenWith + '/' + r.v.firstTen + ')');
    }
    console.log('\n─── スクショの撮影条件 ───');
    for (const m of metrics.shotMeta) console.log('  ' + JSON.stringify(m));
    console.log('  showcase: ' + JSON.stringify(metrics.showcase));
    console.log('\n─── SHOTS ───');
    for (const s of shots) console.log('  ' + s);

    try {
      fs.writeFileSync(path.join(SHOT_DIR, 'v2_metrics.json'), JSON.stringify(metrics, null, 1));
      console.log('\n[drv] 実測値 JSON: ' + path.join(SHOT_DIR, 'v2_metrics.json'));
    } catch (e) {}

  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
    for (const [p, n] of [[BASELINE_PATH, BASELINE_NAME], [INF0_PATH, INF0_NAME]]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); console.log('[drv] 一時ファイル削除: ' + n); }
      catch (e) { console.error('[drv] ⚠️ 一時ファイル削除に失敗: ' + p); }
    }
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n=== ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('--- FAILED ---'); failed.forEach(f => console.log('  ' + f.name + ' — ' + f.detail)); }
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('[driver] 例外: ' + (e && e.stack || e));
  try { if (fs.existsSync(BASELINE_PATH)) fs.unlinkSync(BASELINE_PATH); } catch (_) {}
  try { if (fs.existsSync(INF0_PATH)) fs.unlinkSync(INF0_PATH); } catch (_) {}
  process.exit(3);
});
