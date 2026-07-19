#!/usr/bin/env node
/*
 * driver_field_step05_hud.js — 「地平線ビュー STEP0.5 = HUD可読性モック」判定ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 計画書: dev-meetings/2026-07-19_隊商護衛の地平線ビュー.md  §4 STEP 0.5
 *
 * ■ 何を決めるドライバか
 *   iPhone 横持ち 844x390 では bottomHud=173 → usableH=217px = 2.26タイル。
 *   ここに空を入れると数学的に 0px (STEP0 実測で確定)。
 *   よって横持ちを出荷するには HUD の 173px を「奪還」するしかないが、
 *   奪還した 173px は **HUD が占有をやめるだけで消えはしない**
 *   (#combatLog / #hpMiniBar は z10、DOMスプライトは z1-7 で満杯 → レイヤ順で逃げられない)。
 *   → HUD はゲーム画面に重なる。**重ねて読めるのか**を L規模の STEP1 の前に確定する。
 *
 * ■ index.html は 1 バイトも変更しない
 *   既存ビルドに page.addStyleTag で CSS を被せるだけ。JS 定数
 *   (UI_LOG_HEIGHT / UI_MINIBAR_H / --ui-log-h) には一切触れない
 *   (0 にするとログが消えミニバーが重なる。STEP1 の設計は cameraBottomHud() 側で奪還する)。
 *
 * ■ 撮影カメラ = STEP1 が据える予定の値 (自然カメラではない)
 *   camY = HORIZON_Y - skyPx = 1232 - 86 = 1146  (横持ち・HUD奪還・帯3行)
 *   このとき帯 row13-15 は screen y = 102..390。**帯の最下行 row15 は 294..390** で
 *   HUD 帯にちょうど飲まれる = 判定したい最悪ケースそのもの。
 *   自然カメラ (usableH=217) だとユニットが y~108 に寄って**重ならず、判定にならない**。
 *
 *   ⚠️ renderWorld() [index.html:9789] は canvas と全DOMスプライトを同時に再配置する
 *      唯一の合流点。camX/camY を書いてから renderWorld() を呼べば絵とスプライトがズレない。
 *      camera glide [L3660] は rAF 駆動なので rAF を殺せばカメラは動かない。
 *
 * ■ 測るもの (主観判定に数値を添える)
 *   (a) WCAG コントラスト比: ログ文字色 vs **実際に合成された背後の画素**
 *       → 文字を color:transparent にした同構図をもう1枚撮り、その画素を背景として使う。
 *         パネルが半透明なので「背景 = ゲーム画面 × (1-α) + パネル × α」であり、
 *         CSS の色だけからは計算できない。実測でしか出ない値。
 *       → 明るい文字なので **最悪ケース = 背景の最も明るい画素**。p95 と最大を両方出す。
 *   (b) キャラ透過率 transmission = 最小二乗の傾き cov(パネル越し, 素の画面)/var(素の画面)
 *       同構図で HUD を display:none にした参照フレームを撮り、HUD 帯で回帰する。
 *       1.0 = 完全に見える / 0.0 = 完全に潰れている。相関係数も併記 (形が保たれているか)。
 *       ⚠️ std 比では駄目 (オーバーレイ自身の文字・チップが分散源になり 344% 等が出る)。
 *       ⚠️ 文字ありフレームでは駄目 (明るい文字が支配して傾きが潰れる)。文字なし版を使う。
 *   (c) HUD が覆う面積比 と 帯最下行の被覆率 (幾何)
 *
 * 使い方:
 *   node tools/driver_field_step05_hud.js [--headful] [--browser <path>] [--port N]
 *                                         [--out <dir>] [--vp iphone_land,...]
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
const PORT = parseInt(arg('port', '8798'), 10);
const BUDGET_MS = parseInt(arg('budget-ms', '240000'), 10);

const OUT_DIR = arg('out',
  path.join(os.tmpdir(), 'claude', 'c--Users-PC-User-Desktop------------',
            'd59476b7-452d-4dab-a2e8-62026a9fc308', 'scratchpad', 'step05_hud'));

// ── 幾何定数 (計画書 §2-2 / driver_field_step0.js と一致させること) ──────────
const TILE_SIZE = 96;
const BAND_TOP_ROW = 13;
const BAND_ROWS = 3;
const BAND_TOP = BAND_TOP_ROW * TILE_SIZE;          // 1248
const BAND_BOTTOM = (BAND_TOP_ROW + BAND_ROWS) * TILE_SIZE;  // 1536
// 計画書 §2-2 の表は VERGE を横持ち=16 / 縦持ち・desktop=96 で使い分けている。
// 取り違えると camY が 80px ずれて別構図を測ることになるので明示引数にする。
const VERGE_H = parseInt(arg('verge', '16'), 10);
const HORIZON_Y = BAND_TOP - VERGE_H;               // 横=1232 / 縦=1152

// STEP1 のカメラ式: skyPx = clamp(0, max(56, 0.32*usableH), usableH - VERGE_H - BAND_H)
function fieldSkyPx(usableH, bandRows) {
  const BAND_H = bandRows * TILE_SIZE;
  return Math.max(0, Math.min(Math.max(56, 0.32 * usableH), usableH - VERGE_H - BAND_H));
}

const ALL_VIEWPORTS = [
  { name: 'iphone_land', width: 844, height: 390 },
  { name: 'iphone_port', width: 390, height: 844 },
];
const VP_FILTER = arg('vp', 'iphone_land');
const VIEWPORTS = ALL_VIEWPORTS.filter(v => VP_FILTER.split(',').includes(v.name));

// ── 隊商護衛ペイロード (driver_field_step0.js からそのまま流用) ──────────────
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
  wagonSpawns: [{ tx: 9, ty: 13 }],
};

// ── HUD 案 ───────────────────────────────────────────────────────────────────
// ⚠️ すべて `body.field-hud` スコープ = STEP1 が新設する予定のクラスと同じ形。
//    #combatLog は (1,0,0)、CSS は head 末尾に足すので同specificityでも後勝ちで効く。
//    #hpMiniBar の既存規則は `body.ui-collapsed #hpMiniBar` (1,1,1) なので
//    `body.field-hud.ui-collapsed #hpMiniBar` (1,2,1) で確実に上書きする。
// ⚠️ ミニバーの bottom は既存が var(--ui-log-h)=109px。ログを縮めたら bottom も
//    明示的に下げないと**ログとの間に隙間が空く**。--ui-log-h 自体は変えない契約なので
//    body.field-hud 側で px 直書きする (これは STEP1 でもそのまま必要になる)。
// ⚠️ #combatLog / #hpMiniBar は box-sizing:content-box のまま。height:72px と書いても
//    padding 10+10 と border 3 が外側に積まれて**実寸 132px** になる (初回実測で確認)。
//    body.field-hud では border-box に切り替え、「書いた px = 実寸」を保証する。
//    これは STEP1 の CSS にもそのまま必要 (数字の意味が変わってしまうため)。
const BORDER_BOX = `
  body.field-hud #combatLog, body.field-hud.ui-collapsed #hpMiniBar { box-sizing:border-box; }
`;

const CHIP_SHRINK = (barH, chipH, nameSize) => `
  body.field-hud .hpChip { min-height:${chipH}px; padding:2px 5px; gap:2px; border-width:1px; }
  body.field-hud .hpChip .chipName { font-size:${nameSize}px; }
  body.field-hud .hpChip .chipBar  { height:${barH}px; border-radius:4px; }
`;

// ログ文字の縁取り (半透明パネルの上で細い明朝体を立たせる唯一の手段)
const TEXT_ARMOR = `
  body.field-hud #combatLog .logLine {
    text-shadow: 0 0 3px rgba(0,0,0,0.98), 0 1px 0 rgba(0,0,0,0.95),
                 1px 0 0 rgba(0,0,0,0.75), -1px 0 0 rgba(0,0,0,0.75),
                 0 -1px 0 rgba(0,0,0,0.75);
  }
  /* miss 行だけ極端に暗い (#9098a0 + italic) ので底上げする */
  body.field-hud #combatLog .logLine.miss { color:#c2c9d2; font-style:normal; }
`;

const VARIANTS = [
  {
    key: 'V0_current',
    label: 'V0 現行HUD据置 (log 109px 不透明 + minibar 64px 不透明 = 173px)',
    css: '',                           // 何も被せない = 現行ビルドそのもの
  },
  {
    key: 'V1_planA',
    label: 'V1 計画書の目安 (半透明log 72px + minibar 44px = 116px / 縁取りなし)',
    css: `
      body.field-hud #combatLog {
        height:72px; padding:6px 12px; font-size:12px; line-height:1.34;
        background:linear-gradient(180deg, rgba(20,15,10,0.00) 0%, rgba(20,15,10,0.50) 26%, rgba(13,10,8,0.74) 100%);
        border-top:none; box-shadow:none;
      }
      body.field-hud #combatLog::before { display:none; }
      body.field-hud.ui-collapsed #hpMiniBar {
        bottom:72px; height:44px; padding:3px calc(6px + env(safe-area-inset-right)) 3px calc(6px + env(safe-area-inset-left));
        background:linear-gradient(180deg, rgba(36,26,16,0.58), rgba(21,16,10,0.70));
        border-top:1px solid rgba(200,160,70,0.45);
      }
      ${BORDER_BOX}
      ${CHIP_SHRINK(12, 36, 9)}
    `,
  },
  {
    key: 'V2_planB',
    label: 'V2 A + 文字armor + backdrop-blur + 下地floor引き上げ (116px)',
    css: `
      body.field-hud #combatLog {
        height:72px; padding:6px 12px; font-size:12px; line-height:1.34;
        background:linear-gradient(180deg, rgba(16,12,8,0.10) 0%, rgba(16,12,8,0.62) 24%, rgba(10,8,6,0.86) 100%);
        -webkit-backdrop-filter:blur(3px) saturate(0.75) brightness(0.72);
        backdrop-filter:blur(3px) saturate(0.75) brightness(0.72);
        border-top:none; box-shadow:none;
      }
      body.field-hud #combatLog::before { display:none; }
      body.field-hud.ui-collapsed #hpMiniBar {
        bottom:72px; height:44px; padding:3px calc(6px + env(safe-area-inset-right)) 3px calc(6px + env(safe-area-inset-left));
        background:linear-gradient(180deg, rgba(30,22,14,0.72), rgba(16,12,8,0.86));
        -webkit-backdrop-filter:blur(3px) brightness(0.75);
        backdrop-filter:blur(3px) brightness(0.75);
        border-top:1px solid rgba(200,160,70,0.55);
      }
      ${BORDER_BOX}
      ${CHIP_SHRINK(12, 36, 9)}
      ${TEXT_ARMOR}
    `,
  },
  {
    key: 'V3_planC',
    label: 'V3 最小面積 (log 48px=2行 + minibar 40px = 88px / armor + blur)',
    css: `
      body.field-hud #combatLog {
        height:48px; padding:4px 12px; font-size:11px; line-height:1.30;
        background:linear-gradient(180deg, rgba(16,12,8,0.14) 0%, rgba(16,12,8,0.66) 30%, rgba(10,8,6,0.88) 100%);
        -webkit-backdrop-filter:blur(3px) saturate(0.75) brightness(0.70);
        backdrop-filter:blur(3px) saturate(0.75) brightness(0.70);
        border-top:none; box-shadow:none;
      }
      body.field-hud #combatLog::before { display:none; }
      body.field-hud.ui-collapsed #hpMiniBar {
        bottom:48px; height:40px; padding:2px calc(6px + env(safe-area-inset-right)) 2px calc(6px + env(safe-area-inset-left));
        background:linear-gradient(180deg, rgba(30,22,14,0.74), rgba(16,12,8,0.88));
        -webkit-backdrop-filter:blur(3px) brightness(0.75);
        backdrop-filter:blur(3px) brightness(0.75);
        border-top:1px solid rgba(200,160,70,0.55);
      }
      ${BORDER_BOX}
      ${CHIP_SHRINK(11, 33, 9)}
      ${TEXT_ARMOR}
    `,
  },
  {
    key: 'V4_planD',
    label: 'V4 不透明短縮 (log 56px 実体 + minibar 44px 実体 = 100px / 透過ゼロ)',
    css: `
      body.field-hud #combatLog {
        height:56px; padding:5px 12px; font-size:12px; line-height:1.32;
        background:linear-gradient(180deg, #231b11 0%, #181210 55%, #0d0a08 100%);
        border-top:2px solid rgba(200,160,70,0.75); box-shadow:0 -3px 10px rgba(0,0,0,0.8);
      }
      body.field-hud #combatLog::before { display:none; }
      body.field-hud.ui-collapsed #hpMiniBar {
        bottom:56px; height:44px; padding:3px calc(6px + env(safe-area-inset-right)) 3px calc(6px + env(safe-area-inset-left));
        background:linear-gradient(180deg, #241a10, #15100a);
        border-top:1px solid rgba(200,160,70,0.6);
      }
      ${BORDER_BOX}
      ${CHIP_SHRINK(12, 36, 9)}
    `,
  },
  {
    // ★ 帯最下行 (96px) を HUD が**丸ごと**飲まないよう総高を 96px 未満に抑える案。
    //   V0-V4 はいずれも総高 > 96px なので row15 のキャラが 100% HUD 下に沈む。
    //   64px なら 32px (キャラの頭上 1/3) が必ず素で見える。
    key: 'V5_lowprofile',
    label: 'V5 低背 (半透明log 40px=2行 + ミニバー24px バーのみ = 64px / 帯最下行を飲み切らない)',
    css: `
      body.field-hud #combatLog {
        height:40px; padding:3px 12px; font-size:11px; line-height:1.28;
        background:linear-gradient(180deg, rgba(14,10,7,0.20) 0%, rgba(12,9,6,0.72) 40%, rgba(8,6,4,0.88) 100%);
        -webkit-backdrop-filter:blur(3px) saturate(0.7) brightness(0.66);
        backdrop-filter:blur(3px) saturate(0.7) brightness(0.66);
        border-top:none; box-shadow:none;
      }
      body.field-hud #combatLog::before { display:none; }
      body.field-hud.ui-collapsed #hpMiniBar {
        bottom:40px; height:24px; padding:2px calc(6px + env(safe-area-inset-right)) 2px calc(6px + env(safe-area-inset-left));
        background:linear-gradient(180deg, rgba(28,20,13,0.70), rgba(14,10,7,0.86));
        -webkit-backdrop-filter:blur(3px) brightness(0.72);
        backdrop-filter:blur(3px) brightness(0.72);
        border-top:1px solid rgba(200,160,70,0.5);
      }
      /* 24px に名前は入らない。HPバーだけに割り切る (名前は上部パーティ枠にある) */
      body.field-hud .hpChip { min-height:20px; padding:0 4px; gap:0; border-width:1px; justify-content:center; }
      body.field-hud .hpChip .chipName { display:none; }
      body.field-hud .hpChip .chipBar  { height:14px; border-radius:4px; }
      ${BORDER_BOX}
      ${TEXT_ARMOR}
    `,
  },
  {
    // ★ 究極: パネル背景をほぼ捨て、縁取りだけで文字を立たせる。ゲーム画面の遮蔽を最小化。
    //   読めなければ「半透明化そのものが無理」という反証になるので、下限として必ず測る。
    key: 'V6_floating',
    label: 'V6 フローティング (背景ほぼ無し log 36px + ミニバー24px = 60px / 縁取りのみ)',
    css: `
      body.field-hud #combatLog {
        height:36px; padding:2px 12px; font-size:11px; line-height:1.28;
        background:linear-gradient(180deg, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.18) 100%);
        border-top:none; box-shadow:none;
      }
      body.field-hud #combatLog::before { display:none; }
      body.field-hud.ui-collapsed #hpMiniBar {
        bottom:36px; height:24px; padding:2px calc(6px + env(safe-area-inset-right)) 2px calc(6px + env(safe-area-inset-left));
        background:rgba(0,0,0,0.22); border-top:none;
      }
      body.field-hud .hpChip { min-height:20px; padding:0 4px; gap:0; border-width:1px; justify-content:center; }
      body.field-hud .hpChip .chipName { display:none; }
      body.field-hud .hpChip .chipBar  { height:14px; border-radius:4px; }
      ${BORDER_BOX}
      ${TEXT_ARMOR}
    `,
  },
];

// ── puppeteer / Chrome 解決 (driver_field_step0.js と同じ作法) ───────────────
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

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }

// ── プレリュード ────────────────────────────────────────────────────────────
function prelude(cfg) {
  try {
    sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
    sessionStorage.removeItem('dragonfighters.currentScenario');
    sessionStorage.removeItem('dragonfighters.questFlags');
  } catch (e) {}
  let _s = 20260719 >>> 0;
  Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  const NativeImage = window.Image;
  window.__imgs = [];
  function TrackedImage(w, h) {
    const i = (w === undefined) ? new NativeImage() : new NativeImage(w, h);
    window.__imgs.push(i); return i;
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

// ── in-page キット ──────────────────────────────────────────────────────────
async function installKit(page) {
  await page.evaluate(() => {
    const P = {};
    // rAF を殺す = cameraFollowTick [index.html:3660] の指数平滑が止まる = カメラが固定される
    P.freeze = function () { window.requestAnimationFrame = function () { return 0; }; };
    // ⚠️ rAF だけでは足りない。setInterval(moveEnemies,30) [L11705] と戦闘の await 連鎖が
    //    走り続けると、文字あり/文字なしの2枚で**背後の絵が変わってしまい**、
    //    差分でコントラストを測る手法が成立しない。撮影前に完全静止させる。
    P.hardFreeze = function () {
      P.freeze();
      const maxId = setTimeout(function () {}, 0);
      for (let i = 1; i <= maxId; i++) { try { clearTimeout(i); clearInterval(i); } catch (e) {} }
    };
    P.setCam = function (x, y) { camX = x; camY = y; return { camX: camX, camY: camY }; };
    // renderWorld() [index.html:9789] = canvas と全DOMスプライトを同時に再配置する唯一の合流点
    P.render = function () { try { renderWorld(); } catch (e) { return String(e); } return 'ok'; };
    P.state = function () {
      let foes = 0;
      try {
        foes = (encounterEnemyIndices || []).filter(function (i) {
          return enemies[i] && enemies[i].alive && !enemies[i].def.isObjective;
        }).length;
      } catch (e) {}
      return {
        phase: (typeof currentPhase !== 'undefined') ? currentPhase : '?',
        hp: (typeof hp !== 'undefined') ? hp : -1,
        gameOver: (typeof gameOver !== 'undefined') ? gameOver : false,
        foes: foes,
        logLines: document.querySelectorAll('#combatLog .logLine').length,
        camX: camX, camY: camY,
        UI_LOG_HEIGHT: UI_LOG_HEIGHT, UI_MINIBAR_H: UI_MINIBAR_H, UI_MENU_WIDTH: UI_MENU_WIDTH,
        collapsed: document.body.classList.contains('ui-collapsed'),
        compact: document.body.classList.contains('ui-compact'),
        isFieldTheme: (function () { try { return IS_FIELD_THEME; } catch (e) { return '<n/a>'; } })(),
        fieldMode: (function () { try { return FIELD_MODE; } catch (e) { return '<n/a>'; } })(),
        title: (typeof currentScenario !== 'undefined' && currentScenario) ? currentScenario.title : '?',
      };
    };
    // HUD の実測 rect (CSS を被せた後の実寸を確定させる)
    P.hudRects = function () {
      const r = function (sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return null;
        return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, z: cs.zIndex };
      };
      return { log: r('#combatLog'), bar: r('#hpMiniBar'),
               innerW: window.innerWidth, innerH: window.innerHeight };
    };
    // ログ文字が実際に載っている行の rect (背景サンプル領域をここに限定する)
    // ⚠️ #combatLog は overflow-y:auto で常に最下部へスクロールしている [index.html:1998]。
    //    スクロールで流れ去った .logLine も getBoundingClientRect() は**クリップ前の座標**を返すので、
    //    そのまま使うとパネルより上 = ゲーム画面の生の画素を「文字の背景」として拾ってしまう。
    //    (実際これで不透明な V0 ですら CR p95=1.10 という嘘の値が出た)
    //    → 必ずログ本体の可視矩形と交差させ、はみ出した行は捨てる。
    P.logLineRects = function () {
      const log = document.querySelector('#combatLog');
      if (!log) return [];
      const L = log.getBoundingClientRect();
      const cs0 = getComputedStyle(log);
      // padding の内側だけが文字の載る領域
      const padT = parseFloat(cs0.paddingTop) || 0, padB = parseFloat(cs0.paddingBottom) || 0;
      const padL = parseFloat(cs0.paddingLeft) || 0, padR = parseFloat(cs0.paddingRight) || 0;
      const clip = { x0: L.x + padL, x1: L.right - padR, y0: L.y + padT, y1: L.bottom - padB };
      const out = [];
      document.querySelectorAll('#combatLog .logLine').forEach(function (el) {
        const b = el.getBoundingClientRect();
        if (b.height <= 0 || b.width <= 0) return;
        const x = Math.max(b.x, clip.x0), y = Math.max(b.y, clip.y0);
        const w = Math.min(b.right, clip.x1) - x, h = Math.min(b.bottom, clip.y1) - y;
        if (w <= 1 || h <= 1) return;                 // 完全にスクロールアウトした行
        if (h < b.height * 0.5) return;               // 半分以上切れている行も捨てる (端の滲みを避ける)
        const cs = getComputedStyle(el);
        out.push({ x: x, y: y, w: w, h: h,
                   color: cs.color, text: (el.textContent || '').slice(0, 40) });
      });
      return out;
    };
    // ★ 空帯 (画面上端 skyPx) を**既存の上部UI**がどれだけ食っているか。
    //   横持ちで奪還して得られる空は 86px しかないが、そこには既に
    //   ☰メニュー / フェーズ表示 / ⚙ / アイテム欄 が住んでいる。
    //   「空が入った」と「空が見える」は別問題なので、被覆率を union 面積で実測する。
    //   ⚠️ z順ではなく「HUD レイヤ (position:fixed/absolute かつ z>=8)」で拾う。
    //      DOMスプライトは z1-7 なので混入しない。
    P.topUiCoverage = function (skyPx) {
      const W = window.innerWidth, H = Math.round(skyPx);
      if (H <= 0) return null;
      const grid = new Uint8Array(W * H);
      const boxes = [];
      document.querySelectorAll('body *').forEach(function (el) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        if (parseFloat(cs.opacity) < 0.05) return;
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
        const z = parseInt(cs.zIndex, 10);
        if (!(z >= 8)) return;                       // HUD レイヤのみ
        if (el.id === 'combatLog' || el.id === 'hpMiniBar') return;  // 下部HUDは別勘定
        const b = el.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0) return;
        // ⚠️ ここを入れないと fxCanvas / lightingCanvas / drawerBackdrop のような
        //    **透明な全画面レイヤ**を拾って被覆率が問答無用で 100% になる (初回実測でそうなった)。
        //    実際に絵を隠すのはビューポートの一部しか占めない不透明チップだけ。
        if (b.width >= window.innerWidth * 0.8 && b.height >= window.innerHeight * 0.8) return;
        if (el.tagName === 'CANVAS') return;
        if (b.top >= H || b.bottom <= 0 || b.left >= W || b.right <= 0) return;
        boxes.push({ id: el.id || el.className || el.tagName, x: Math.round(b.x), y: Math.round(b.y),
                     w: Math.round(b.width), h: Math.round(b.height) });
        const x0 = Math.max(0, Math.floor(b.left)), x1 = Math.min(W, Math.ceil(b.right));
        const y0 = Math.max(0, Math.floor(b.top)), y1 = Math.min(H, Math.ceil(b.bottom));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[y * W + x] = 1;
      });
      let covered = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i]) covered++;
      return { skyPx: H, stripArea: W * H, coveredPx: covered,
               coveredPct: +(covered / (W * H) * 100).toFixed(1), boxes: boxes };
    };

    window.__k = P;
  });
}

// ── PNG 解析: 別タブでデコードして getImageData する (Node 側に依存を足さない) ──
async function makeAnalyzer(browser) {
  const p = await browser.newPage();
  await p.goto('about:blank');
  await p.evaluate(() => {
    window.__load = function (b64) {
      return new Promise(function (res, rej) {
        const im = new Image();
        im.onload = function () {
          const c = document.createElement('canvas');
          c.width = im.width; c.height = im.height;
          const cx = c.getContext('2d', { willReadFrequently: true });
          cx.drawImage(im, 0, 0);
          window.__cur = { d: cx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
          res({ w: c.width, h: c.height });
        };
        im.onerror = function () { rej(new Error('decode failed')); };
        im.src = 'data:image/png;base64,' + b64;
      });
    };
    window.__stash = function (name) { window['__img_' + name] = window.__cur; };

    // sRGB → 相対輝度 (WCAG 2.x)
    window.__lum = function (r, g, b) {
      const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    // 指定 rect 群の輝度分布
    window.__lumStats = function (name, rects) {
      const im = window['__img_' + name]; if (!im) return null;
      const L = [];
      for (const R of rects) {
        const x0 = Math.max(0, Math.round(R.x)), x1 = Math.min(im.w, Math.round(R.x + R.w));
        const y0 = Math.max(0, Math.round(R.y)), y1 = Math.min(im.h, Math.round(R.y + R.h));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * im.w + x) * 4;
          L.push(window.__lum(im.d[i], im.d[i + 1], im.d[i + 2]));
        }
      }
      if (!L.length) return null;
      L.sort(function (a, b) { return a - b; });
      const q = function (p) { return L[Math.min(L.length - 1, Math.floor(p * (L.length - 1)))]; };
      let s = 0; for (const v of L) s += v;
      return { n: L.length, mean: s / L.length, p50: q(0.5), p90: q(0.90), p95: q(0.95), p99: q(0.99), max: L[L.length - 1], min: L[0] };
    };
    // 2枚の rect 内での 透過率(std比) と 相関
    window.__transmission = function (aName, bName, rect) {
      const A = window['__img_' + aName], B = window['__img_' + bName];
      if (!A || !B || A.w !== B.w || A.h !== B.h) return null;
      const x0 = Math.max(0, Math.round(rect.x)), x1 = Math.min(A.w, Math.round(rect.x + rect.w));
      const y0 = Math.max(0, Math.round(rect.y)), y1 = Math.min(A.h, Math.round(rect.y + rect.h));
      let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * A.w + x) * 4;
        const a = window.__lum(A.d[i], A.d[i + 1], A.d[i + 2]);
        const b = window.__lum(B.d[i], B.d[i + 1], B.d[i + 2]);
        n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
      }
      if (n < 4) return null;
      const ma = sa / n, mb = sb / n;
      const va = saa / n - ma * ma, vb = sbb / n - mb * mb;
      const cov = sab / n - ma * mb;
      const sda = Math.sqrt(Math.max(0, va)), sdb = Math.sqrt(Math.max(0, vb));
      // ⚠️ 透過率に std 比を使ってはいけない。オーバーレイ自身の構造 (文字・HPチップ) が
      //    分散を持ち込むので 100% を超える無意味な値が出る (初回実測で 344% が出た)。
      //    合成は A = t*B + panel + noise。panel/noise は B と無相関なので、
      //    最小二乗の傾き slope = cov(A,B)/var(B) が **t の不偏推定量**になる。
      //    corr は「形がどれだけ保たれているか」の補助指標として併記する。
      return { n: n, stdA: sda, stdB: sdb,
               slope: vb > 1e-12 ? cov / vb : 0,
               stdRatio: sdb > 1e-9 ? sda / sdb : 0,
               corr: (sda > 1e-9 && sdb > 1e-9) ? cov / (sda * sdb) : 0,
               meanA: ma, meanB: mb };
    };
  });
  return p;
}

function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function hexLum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f((v >> 16) & 255) + 0.7152 * f((v >> 8) & 255) + 0.0722 * f(v & 255);
}

// ── 本体 ────────────────────────────────────────────────────────────────────
async function runViewport(browser, analyzer, base, vp) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, { payload: CARAVAN_PAYLOAD });
  await page.goto(base + '/index.html?intel=0', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof startGame === 'function' && !!mapData && typeof renderWorld === 'function'; }
    catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await waitImages(page, vp.name);
  await installKit(page);

  const pre = await page.evaluate(() => window.__k.state());
  console.log('    起動時: ' + JSON.stringify(pre));

  await page.evaluate(() => { try { startGame(); } catch (e) {} });

  // ── 交戦中かつログが溜まった瞬間まで実プレイを進める ──
  const t0 = Date.now();
  let st = null, reached = false;
  while (Date.now() - t0 < BUDGET_MS) {
    await new Promise(r => setTimeout(r, 250));
    try { st = await page.evaluate(() => window.__k.state()); } catch (e) { break; }
    if (st.gameOver) break;
    if (st.phase === 'combat' && st.foes >= 2 && st.logLines >= 10) { reached = true; break; }
  }
  console.log('    到達: ' + (reached ? 'OK' : 'NG') + ' ' + JSON.stringify(st) +
              ' (' + Math.round((Date.now() - t0) / 1000) + 's)');

  // ── 完全静止 → STEP1 のカメラを据える ──
  const usableH_reclaim = vp.height;           // HUD 奪還後 (cameraBottomHud()=0)
  const usableH_keep = vp.height - (st.UI_LOG_HEIGHT + st.UI_MINIBAR_H);
  const skyReclaim = fieldSkyPx(usableH_reclaim, BAND_ROWS);
  const camYStep1 = HORIZON_Y - skyReclaim;

  const camInfo = await page.evaluate((cy) => {
    window.__k.hardFreeze();
    // アニメーション/トランジションも止める (2枚の差分測定を成立させる)
    const s = document.createElement('style');
    s.id = '__stabilizer';
    s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;}';
    document.head.appendChild(s);
    const before = { camX: camX, camY: camY };
    window.__k.setCam(camX, cy);
    const r = window.__k.render();
    return { before: before, after: { camX: camX, camY: camY }, render: r };
  }, camYStep1);
  console.log('    カメラ: 自然 camY=' + camInfo.before.camY.toFixed(1) +
              ' → STEP1 camY=' + camInfo.after.camY + ' (render=' + camInfo.render + ')');

  // ★ 奪還して得た空 86px を、既存の上部UI がどれだけ潰しているか
  const topUi = await page.evaluate((s) => window.__k.topUiCoverage(s), skyReclaim);
  if (topUi) {
    console.log('    空帯 ' + topUi.skyPx + 'px を既存上部UIが被覆: ' + topUi.coveredPct + '% (' +
      topUi.boxes.map(b => b.id + ' ' + b.w + 'x' + b.h).join(', ') + ')');
  }

  // 帯 row13-15 の screen 座標
  const bandScreenTop = BAND_TOP - camYStep1;
  const bandScreenBottom = BAND_BOTTOM - camYStep1;
  const lastRowTop = (BAND_TOP_ROW + BAND_ROWS - 1) * TILE_SIZE - camYStep1;

  const shot = async (name) => {
    const b64 = await page.screenshot({ encoding: 'base64' });
    await analyzer.evaluate((s) => window.__load(s), b64);
    await analyzer.evaluate((n) => window.__stash(n), name);
    return Buffer.from(b64, 'base64');
  };

  const outDir = path.join(OUT_DIR, vp.name);
  fs.mkdirSync(outDir, { recursive: true });
  const saved = [];

  // ── 参照フレーム: HUD 完全非表示 (= ゲーム画面そのもの) ──
  let tag = await page.addStyleTag({ content: '#combatLog,#hpMiniBar{display:none!important;}' });
  const bufNoHud = await shot('nohud');
  { const p = path.join(outDir, 'REF_nohud.png'); fs.writeFileSync(p, bufNoHud); saved.push(p); }
  await tag.evaluate(el => el.remove());

  const variantOut = [];
  for (const V of VARIANTS) {
    // body.field-hud を付けた上で案の CSS を被せる
    const tags = [];
    await page.evaluate(() => document.body.classList.add('field-hud'));
    if (V.css) tags.push(await page.addStyleTag({ content: V.css }));
    // レイアウト確定 (rAF を殺しているので明示的に1フレーム待つ)
    await new Promise(r => setTimeout(r, 120));
    await page.evaluate(() => { void document.body.offsetHeight; window.__k.render(); });

    const rects = await page.evaluate(() => window.__k.hudRects());
    const lines = await page.evaluate(() => window.__k.logLineRects());

    // (i) 通常フレーム
    const buf = await shot('v_' + V.key);
    { const p = path.join(outDir, V.key + '.png'); fs.writeFileSync(p, buf); saved.push(p); }

    // (ii) 文字だけ透明 = 「文字の背後に実際に合成されている画素」
    const tt = await page.addStyleTag({ content:
      '#combatLog .logLine,#combatLog .logLine *,#combatLog::before{color:transparent!important;text-shadow:none!important;}' });
    await new Promise(r => setTimeout(r, 60));
    const bufBg = await shot('bg_' + V.key);
    { const p = path.join(outDir, V.key + '_textless.png'); fs.writeFileSync(p, bufBg); saved.push(p); }
    await tt.evaluate(el => el.remove());

    for (const t of tags) await t.evaluate(el => el.remove());
    await page.evaluate(() => document.body.classList.remove('field-hud'));

    // ── 測定 ──
    const logH = rects.log ? rects.log.h : 0;
    const barH = rects.bar ? rects.bar.h : 0;
    const hudTop = Math.min(rects.log ? rects.log.y : vp.height, rects.bar ? rects.bar.y : vp.height);
    const hudH = vp.height - hudTop;

    // (a) コントラスト: 文字行 rect の背景輝度 vs 文字色輝度
    const lineRects = lines.filter(l => l.h > 0);
    const bgStats = lineRects.length
      ? await analyzer.evaluate((a) => window.__lumStats(a.n, a.r), { n: 'bg_' + V.key, r: lineRects })
      : null;

    const FG_MAIN = '#e8d8b8';   // #combatLog の既定文字色
    const FG_DIM = (V.css && V.css.indexOf('#c2c9d2') >= 0) ? '#c2c9d2' : '#9098a0';  // miss 行 (最も暗い)
    const lumMain = hexLum(FG_MAIN), lumDim = hexLum(FG_DIM);
    const cr = bgStats ? {
      fgMain: FG_MAIN, fgDim: FG_DIM,
      main_median: contrastRatio(lumMain, bgStats.p50),
      main_p95: contrastRatio(lumMain, bgStats.p95),
      main_worst: contrastRatio(lumMain, bgStats.max),
      dim_median: contrastRatio(lumDim, bgStats.p50),
      dim_p95: contrastRatio(lumDim, bgStats.p95),
      dim_worst: contrastRatio(lumDim, bgStats.max),
    } : null;

    // (b) キャラ透過率: HUD 帯の画素を「文字なしフレーム」で比較する
    //     ⚠️ 文字ありフレームを使うと、明るい文字自体が巨大な分散源になって
    //        傾きも相関も潰れる。測りたいのは**パネルがゲーム画面をどれだけ通すか**なので
    //        bg_<key> (文字だけ transparent にした同構図) を使うのが正しい。
    const strip = { x: 0, y: hudTop, w: vp.width, h: hudH };
    const trans = hudH > 2
      ? await analyzer.evaluate((a) => window.__transmission(a.a, a.b, a.r),
          { a: 'bg_' + V.key, b: 'nohud', r: strip })
      : null;
    // ログ帯だけ (最下段 = 帯最下行のキャラが来る場所) を別掲。HPチップは不透明なので混ぜない。
    const logStrip = rects.log ? { x: 0, y: rects.log.y, w: vp.width, h: rects.log.h } : null;
    const transLog = logStrip
      ? await analyzer.evaluate((a) => window.__transmission(a.a, a.b, a.r),
          { a: 'bg_' + V.key, b: 'nohud', r: logStrip })
      : null;

    // (c) 幾何: 帯最下行 (row15) が HUD 下に入る割合
    const lastRowBottom = lastRowTop + TILE_SIZE;
    const visLastTop = Math.max(0, lastRowTop), visLastBot = Math.min(vp.height, lastRowBottom);
    const lastRowVisibleH = Math.max(0, visLastBot - visLastTop);
    const lastRowUnderHud = Math.max(0, Math.min(visLastBot, vp.height) - Math.max(visLastTop, hudTop));
    // 帯全体 (row13-15)
    const bandVisTop = Math.max(0, bandScreenTop), bandVisBot = Math.min(vp.height, bandScreenBottom);
    const bandVisH = Math.max(0, bandVisBot - bandVisTop);
    const bandUnderHud = Math.max(0, Math.min(bandVisBot, vp.height) - Math.max(bandVisTop, hudTop));

    const rec = {
      key: V.key, label: V.label,
      logH: +logH.toFixed(1), barH: +barH.toFixed(1), hudH: +hudH.toFixed(1), hudTop: +hudTop.toFixed(1),
      hudAreaPct: +(hudH / vp.height * 100).toFixed(1),
      skyPx: +skyReclaim.toFixed(1), skyPct: +(skyReclaim / vp.height * 100).toFixed(1),
      logLines: lineRects.length,
      contrast: cr, bgLum: bgStats,
      transmissionHud: trans, transmissionLog: transLog,
      geom: {
        bandScreenTop: +bandScreenTop.toFixed(1), bandScreenBottom: +bandScreenBottom.toFixed(1),
        lastRowTop: +lastRowTop.toFixed(1),
        lastRowUnderHudPct: +(lastRowVisibleH ? lastRowUnderHud / lastRowVisibleH * 100 : 0).toFixed(1),
        bandUnderHudPct: +(bandVisH ? bandUnderHud / bandVisH * 100 : 0).toFixed(1),
      },
    };
    variantOut.push(rec);

    console.log('  [' + V.key + '] log=' + rec.logH + ' bar=' + rec.barH + ' hud=' + rec.hudH +
      'px(' + rec.hudAreaPct + '%)  行数=' + rec.logLines +
      (cr ? '  CR(主/中央値)=' + cr.main_median.toFixed(2) + ' (主/p95)=' + cr.main_p95.toFixed(2) +
            ' (主/最悪)=' + cr.main_worst.toFixed(2) + ' (暗行/p95)=' + cr.dim_p95.toFixed(2) : '  CR=n/a') +
      (trans ? '  透過=' + (trans.slope * 100).toFixed(1) + '% corr=' + trans.corr.toFixed(3) : ''));
  }

  await page.close();
  return { vp: vp.name, viewport: vp, pre, st, reached, pageErrors, saved, topUi,
           usableH_keep, usableH_reclaim, skyReclaim, camYStep1,
           camInfo, variants: variantOut,
           bandScreenTop, bandScreenBottom, lastRowTop };
}

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  let srv = null, browser = null;
  const report = { generatedAt: new Date().toISOString(), viewports: [] };

  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    srv = await startServer(PORT);
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] http サーバ: ' + BASE + ' (root=' + ROOT + ')');
    console.log('[drv] 出力: ' + OUT_DIR);

    const profile = path.join(os.tmpdir(), 'df_pptr_profile_step05');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
             '--user-data-dir=' + profile],
    });
    const analyzer = await makeAnalyzer(browser);

    for (const vp of VIEWPORTS) {
      mark('HUD可読性モック: ' + vp.name + ' (' + vp.width + 'x' + vp.height + ')');
      const r = await runViewport(browser, analyzer, BASE, vp);
      report.viewports.push(r);

      check('(P1-' + vp.name + ') 隊商護衛がロードされている',
        r.pre.isFieldTheme === true && r.pre.fieldMode === true,
        'IS_FIELD_THEME=' + r.pre.isFieldTheme + ' FIELD_MODE=' + r.pre.fieldMode + ' title="' + r.pre.title + '"');
      check('(P2-' + vp.name + ') 交戦中フレームを撮れた (phase=combat / 敵2体以上 / ログ10行以上)',
        r.reached, JSON.stringify(r.st));
      check('(P3-' + vp.name + ') STEP1 カメラが据わった (camY === HORIZON_Y - skyPx)',
        Math.abs(r.camInfo.after.camY - r.camYStep1) < 0.001,
        'camY=' + r.camInfo.after.camY + ' 期待=' + r.camYStep1);
      check('(P4-' + vp.name + ') pageerror 0', r.pageErrors.length === 0,
        r.pageErrors.length ? r.pageErrors.slice(0, 3).join(' | ') : 'none');
      // ⚠️ P5/P6 は横持ち固有の主張 (空 86px / 据置なら 0px)。縦持ちに当てると必ず落ちるので
      //    ビューポートでゲートする。ゲートしないと「縦持ちでも計画が中止」という誤読を生む。
      if (vp.name === 'iphone_land') {
        check('(P5-' + vp.name + ') STEP0 実測との整合 (奪還・帯3行で空 86px / 22.1%)',
          Math.abs(r.skyReclaim - 86) < 1.0 && Math.abs(r.skyReclaim / r.viewport.height * 100 - 22.1) < 0.3,
          'skyPx=' + r.skyReclaim.toFixed(1) + 'px (' + (r.skyReclaim / r.viewport.height * 100).toFixed(1) + '%)');
        check('(P6-' + vp.name + ') 現行HUD据置では空が 0px (= 計画中止と同義)',
          fieldSkyPx(r.usableH_keep, BAND_ROWS) === 0,
          'usableH_keep=' + r.usableH_keep + ' → skyPx=' + fieldSkyPx(r.usableH_keep, BAND_ROWS));
      } else {
        // 縦持ちの主張はむしろ逆: HUD を据え置いたままでも空が出て、かつ帯が HUD に届かない。
        check('(P5-' + vp.name + ') HUD据置のままでも空が出る (奪還不要)',
          fieldSkyPx(r.usableH_keep, BAND_ROWS) > 0,
          'usableH_keep=' + r.usableH_keep + ' → skyPx=' + fieldSkyPx(r.usableH_keep, BAND_ROWS).toFixed(1) +
          'px (' + (fieldSkyPx(r.usableH_keep, BAND_ROWS) / r.viewport.height * 100).toFixed(1) + '%)');
        const worstBand = Math.max.apply(null, r.variants.map(v => v.geom.lastRowUnderHudPct));
        check('(P6-' + vp.name + ') 帯最下行が HUD に飲まれない (全案で被覆 < 10%)',
          worstBand < 10, '最大被覆=' + worstBand + '%');
      }
    }

    const outFile = path.join(OUT_DIR, 'field_step05_hud.json');
    fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
    console.log('\n[drv] 実測 JSON: ' + outFile);

    // ── サマリ ──
    for (const r of report.viewports) {
      console.log('\n════════ STEP0.5 HUD可読性 サマリ [' + r.vp + ' ' + r.viewport.width + 'x' + r.viewport.height + '] ════════');
      console.log('usableH: 据置=' + r.usableH_keep + ' (空 ' + fieldSkyPx(r.usableH_keep, BAND_ROWS) + 'px)  ' +
                  '奪還=' + r.usableH_reclaim + ' (空 ' + r.skyReclaim.toFixed(1) + 'px = ' +
                  (r.skyReclaim / r.viewport.height * 100).toFixed(1) + '%)');
      console.log('STEP1 camY=' + r.camYStep1 + '  帯 row13-15 = screen ' +
                  r.bandScreenTop.toFixed(0) + '..' + r.bandScreenBottom.toFixed(0) +
                  '  帯最下行(row15) = ' + r.lastRowTop.toFixed(0) + '..' + (r.lastRowTop + TILE_SIZE).toFixed(0));
      console.log('');
      console.log('案            HUD高  面積%  行数  CR主中央 CR主p95 CR主最悪 CR暗p95  透過%(log帯) 相関   帯最下行被覆%');
      for (const v of r.variants) {
        const c = v.contrast;
        console.log('  ' + v.key.padEnd(12) +
          String(v.hudH).padStart(5) + String(v.hudAreaPct).padStart(7) +
          String(v.logLines).padStart(6) +
          (c ? c.main_median.toFixed(2).padStart(9) + c.main_p95.toFixed(2).padStart(8) +
               c.main_worst.toFixed(2).padStart(9) + c.dim_p95.toFixed(2).padStart(8) : '  n/a'.padStart(34)) +
          (v.transmissionLog ? (v.transmissionLog.slope * 100).toFixed(1).padStart(12) +
               v.transmissionLog.corr.toFixed(3).padStart(7) : '         n/a   n/a') +
          String(v.geom.lastRowUnderHudPct).padStart(14));
      }
      console.log('\n  CR = WCAG コントラスト比 (実際に合成された背後画素から算出)。');
      console.log('     4.5:1 = WCAG AA 通常テキスト / 3.0:1 = AA 大テキスト の下限');
      console.log('  透過% = 最小二乗の傾き cov(パネル越し, 素のゲーム画面)/var(素のゲーム画面)。');
      console.log('     キャラのコントラストが何%残るか。0% = 完全に潰れて見えない。');
      console.log('  相関 = 形が保たれているか (1.0 = 完全に同じ形が透けている)。');
    }

  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n=== 測定妥当性 ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('--- FAILED ---'); failed.forEach(f => console.log('  ' + f.name + ' — ' + f.detail)); }
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('[driver] 例外: ' + (e && e.stack || e));
  process.exit(3);
});
