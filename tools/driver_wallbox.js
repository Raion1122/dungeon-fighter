#!/usr/bin/env node
/*
 * driver_wallbox.js — 壁の当たり判定の箱を体に合わせる (2026-08-21)
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 入れたもの (実装依頼書/2026-08-20_wallbox-hardcoded-72px.md)
 *   40x40 の箱が **原点 +(16,18)** に直書きされていた (72px スプライト専用の値)。
 *   STEP1 = 3 箇所の直書きを unitWallBox(def, originX, originY) の 1 本へ畳む (値は不変)。
 *   STEP2 = 大型 12 体の def に実測比率を入れ、箱の **中心** を体の中心へ移す。
 *     ⚠ 動かすのは位置だけ。**大きさは 40x40 のまま**。体の実寸へ広げると 360px の
 *       ハイドラで箱が 3.4 タイルになり、狭い部屋で一歩も弾かれなくなる。
 *
 * ■ 測り方の方針
 *   ⭐ (2a) の期待値は **スプライト PNG そのものから採る** (def に書いた数字の写経にしない)。
 *      ページ内で シートを canvas に描いて alpha bbox を測り、unitWallBox の返す箱と
 *      突き合わせる。def の数字が間違っていればここで落ちる。
 *   ⭐ (2c) は「箱が壁の中に居る床タイルの割合」を **盤面まるごと** 数える。これは
 *      §2b が言う「常にブロック = 全く動かない」の直接の物差し。旧箱との対で出す。
 *   ⭐ 恒等 (§1) は **比率を持たない 49 体** で測る。母集団の本数も一緒に出す
 *      (母集団が空だと「不一致 0 本」で無条件に緑になるため)。
 *   ⚠ 敵の移動そのものは wouldOverlapWall を通らない (通るのは押し出しとノックバックだけ)。
 *     よって「今まで通れた隙間が通れなくなる」は原理的に起きない。実プレイの非退行は
 *     既存の完走ドライバ (graph_run / graph_kinds / grid_p9 / mine_wall) に任せる。
 *
 * ── 負のコントロール (配信をメモリ上で差し替える) ──────────────────────────────
 *   port   | mutate    | 注入する欠陥                                   | 赤くなるべき節
 *   PORT   | (素)      | —                                              | —
 *   PORT+1 | oldbox    | 全 def を旧 40x40 直書きへ戻す                 | §2a §2c
 *   PORT+2 | symx      | bodyOffX を無視して左右対称を仮定              | §2a (ハイドラ)
 *   PORT+3 | noclamp   | 縦のクランプを外す (絵の中心をそのまま追う)   | §2a §2c-2
 *   PORT+4 | ratioall  | 比率を持たない def にも新しい箱を当てる        | §1a
 *
 * 使い方:
 *   node tools/driver_wallbox.js
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
/* ⚠ ポートは既存ドライバと空ける。9080-9085=driver_mine_wall / 9090-9093=driver_bgm_mine。 */
const PORT = parseInt(arg('port', '9100'), 10);
const SCENARIOS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  oldbox: { file: 'index.html',
    from: '      if (WALLBOX_OFF || !rx || !ry) {   // 比率を持たない def = 72px スプライト前提の旧箱のまま',
    to:   '      if (true) {   /* mut-oldbox 全 def を旧 40x40 直書きへ戻す */' },
  symx: { file: 'index.html',
    from: '      const ox = (typeof def.bodyOffX === "number") ? def.bodyOffX : (1 - rx) / 2;',
    to:   '      const ox = (1 - rx) / 2;   /* mut-symx bodyOffX を無視して左右対称を仮定 */' },
  noclamp: { file: 'index.html',
    from: '      const cy = originY + S / 2 + Math.max(-M, Math.min(M, (oy + ry / 2 - 0.5) * S));',
    to:   '      const cy = originY + (oy + ry / 2) * S;   /* mut-noclamp 縦のクランプを外す */' },
  ratioall: { file: 'index.html',
    from: '        return { left: originX + 16, top: originY + 18, right: originX + 56, bottom: originY + 58 };',
    to:   '        const S0 = (def && def.displaySize) || 72; return { left: originX + S0 / 2 - 20, top: originY + S0 / 2 - 20, right: originX + S0 / 2 + 20, bottom: originY + S0 / 2 + 20 };   /* mut-ratioall */' },
};
const MUT_ORDER = ['oldbox', 'symx', 'noclamp', 'ratioall'];
const PORT_OF = {};
MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

const SRC = { 'index.html': fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') };
const MUT_SRC = {};
for (const k of MUT_ORDER) {
  const m = MUTATIONS[k];
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  const n = SRC[m.file].split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: SRC[m.file].split(m.from).join(m.to) };
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置くこと。helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて **全 500** になり、症状は「シームが undefined」に見える。 */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (mutKey && u === '/' + MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()]);
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function bootPage(browser, port, query, errs, scen) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => errs.push('[:' + port + query + '] PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('[:' + port + query + '] CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((s) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', s);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
    } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, scen || 'goblin-mine');
  await page.goto('http://localhost:' + port + '/index.html' + query,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof ENEMY_TYPES !== 'undefined' && typeof CLASS_DEFS !== 'undefined'",
    { timeout: 25000 });
  return page;
}

async function closeDialogs(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) return true;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
      if (btns.length) btns[btns.length - 1].click();
      const ov = document.getElementById('skillCheckOverlay');
      if (ov && ov.classList.contains('show')) {
        const rb = document.getElementById('scRollBtn');
        if (rb) rb.click();
        ov.click();
      }
      document.body.click();
    });
    await sleep(320);
  }
  return await page.evaluate(() => !skillCheckActive && !dialogPaused);
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定
// ══════════════════════════════════════════════════════════════════════════════

/* §1 恒等。**比率を持たない def** で新旧の箱が 4 辺とも一致するか。
 * ⚠ 原点には小数と負値を混ぜる (整数だけだと丸めの差が見えない)。 */
async function identityProbe(page) {
  return page.evaluate(() => {
    const all = [];
    for (const k in ENEMY_TYPES) all.push({ key: 'enemy:' + k, def: ENEMY_TYPES[k] });
    for (const k in CLASS_DEFS) all.push({ key: 'class:' + k, def: CLASS_DEFS[k] });
    all.push({ key: '(def=null)', def: null });
    all.push({ key: '(def={})', def: {} });
    const plain = all.filter(d => !(d.def && d.def.bodyRatioX && d.def.bodyRatioY));
    const ratio = all.filter(d => (d.def && d.def.bodyRatioX && d.def.bodyRatioY));
    const origins = [[0, 0], [13, 29], [-7.5, 101.25], [960, 704], [1234.5, -88.25], [-333, -777]];
    const bad = [];
    for (const d of plain) {
      for (const o of origins) {
        const got = unitWallBox(d.def, o[0], o[1]);
        const want = { left: o[0] + 16, top: o[1] + 18, right: o[0] + 56, bottom: o[1] + 58 };
        for (const side of ['left', 'top', 'right', 'bottom']) {
          if (got[side] !== want[side]) bad.push(d.key + ' ' + side + ' ' + got[side] + '!=' + want[side]);
        }
      }
    }
    return { nPlain: plain.length, nRatio: ratio.length, nOrigins: origins.length,
             badN: bad.length, bad: bad.slice(0, 6),
             ratioKeys: ratio.map(d => d.key.replace('enemy:', '')).sort() };
  });
}

/* §2a の期待値を **スプライト PNG そのもの** から採る。
 * ⚠ row 2 = state chase/search/returning = 移動中の行 (index.html:11347)。壁に当たるのはこの姿勢。
 *   歩き以外の行を測ると値が変わる (戦車は row0=164px / row2=173px)。 */
async function measureSheets(page) {
  return page.evaluate(async () => {
    const out = {};
    const keys = Object.keys(ENEMY_TYPES).filter(k => ENEMY_TYPES[k].displaySize >= 176);
    for (const k of keys) {
      const d = ENEMY_TYPES[k];
      const img = new Image();
      img.src = d.sprite;
      try { await img.decode(); } catch (e) { out[k] = { err: 'decode: ' + e.message }; continue; }
      const fw = d.frameW, fh = d.frameH, cols = d.cols, row = 2 + (d.rowOffset || 0);
      const cv = document.createElement('canvas');
      cv.width = cols * fw; cv.height = fh;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, row * fh, cols * fw, fh, 0, 0, cols * fw, fh);
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      let L = 1e9, T = 1e9, R = -1, B = -1, n = 0;
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < cv.width; x++) {
          if (px[(y * cv.width + x) * 4 + 3] === 0) continue;
          n++;
          const fx = x % fw;
          if (fx < L) L = fx;
          if (fx + 1 > R) R = fx + 1;
          if (y < T) T = y;
          if (y + 1 > B) B = y + 1;
        }
      }
      out[k] = (n === 0) ? { err: 'row2 が空' }
        : { L: L, T: T, R: R, B: B, fw: fw, fh: fh, S: d.displaySize, opaque: n };
    }
    return out;
  });
}

/* 箱の中心 (原点からの px) を新旧それぞれで返す。 */
async function boxCenters(page) {
  return page.evaluate(() => {
    const out = {};
    for (const k of Object.keys(ENEMY_TYPES)) {
      const d = ENEMY_TYPES[k];
      if (d.displaySize < 176) continue;
      const b = unitWallBox(d, 0, 0);
      out[k] = { cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2,
                 w: b.right - b.left, h: b.bottom - b.top,
                 oldCx: 36, oldCy: 38, S: d.displaySize };
    }
    out.__const = { maxOff: (typeof WALLBOX_MAX_OFF === 'number') ? WALLBOX_MAX_OFF : null,
                    boxSize: (typeof WALLBOX_SIZE === 'number') ? WALLBOX_SIZE : null,
                    tile: TILE_SIZE };
    return out;
  });
}

/* ドライバ側が持つ **仕様**: 箱の中心は「内容 bbox の中心」へ寄せる。ただしスプライトの
 * 中心から ±M を超えない (M = タイル/2 − 箱/2 = 28px)。
 * ⚠ 実装の写経ではなく、シートの実測値からこの規則で期待値を組み立てる。
 *   実装側の定数が変わったら (2a-装置2) が落ちて気づける。 */
const SPEC_M = 28;
function expectedCenter(sheet, S) {
  const bx = (sheet.L + sheet.R) / 2 / sheet.fw * S;   // 原点からの内容 bbox の中心
  const by = (sheet.T + sheet.B) / 2 / sheet.fh * S;
  const cl = (v) => S / 2 + Math.max(-SPEC_M, Math.min(SPEC_M, v - S / 2));
  return { cx: cl(bx), cy: cl(by), bx: bx, by: by };
}

/* §2c 盤面まるごと: 床タイルに立ったとき箱が壁と重なる割合 (新 / 旧)。
 * ⭐ これが「箱が岩の中 → 常にブロック = 全く動かない」の直接の物差し。
 * ⚠ 立ち位置のモデルは createEnemy と同じ「スプライトの中心がタイルの中心」(index.html:11305)。 */
async function wallOverlapRate(page) {
  return page.evaluate(() => {
    const out = {};
    for (const k of Object.keys(ENEMY_TYPES)) {
      const d = ENEMY_TYPES[k];
      if (d.displaySize < 176) continue;
      const S = d.displaySize;
      let floor = 0, badNew = 0, badOld = 0;
      for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
          if (isTileWall(tx, ty)) continue;
          floor++;
          const ox = tx * TILE_SIZE + TILE_SIZE / 2 - S / 2;
          const oy = ty * TILE_SIZE + TILE_SIZE / 2 - S / 2;
          const b = unitWallBox(d, ox, oy);
          if (wouldOverlapWall(b.left, b.top, b.right, b.bottom)) badNew++;
          if (wouldOverlapWall(ox + 16, oy + 18, ox + 56, oy + 58)) badOld++;
        }
      }
      out[k] = { floor: floor, badNew: badNew, badOld: badOld };
    }
    return out;
  });
}

/* §2d 壁際の挙動。開けた床では 4 方向へ動け、壁側へ大きく動かすと止まる。
 * ⚠ 「動かない」で緑にしないこと。両方を 1 つの assert にまとめて出す。 */
async function wallEdgeProbe(page) {
  return page.evaluate(() => {
    const out = {};
    const inWall = (d, ox, oy) => {
      const b = unitWallBox(d, ox, oy);
      return wouldOverlapWall(b.left, b.top, b.right, b.bottom);
    };
    for (const k of Object.keys(ENEMY_TYPES)) {
      const d = ENEMY_TYPES[k];
      if (d.displaySize < 176) continue;
      const S = d.displaySize;
      const org = (tx, ty) => [tx * TILE_SIZE + TILE_SIZE / 2 - S / 2, ty * TILE_SIZE + TILE_SIZE / 2 - S / 2];
      let open = null, edge = null;
      for (let ty = 2; ty < MAP_H - 2 && (!open || !edge); ty++) {
        for (let tx = 2; tx < MAP_W - 2 && (!open || !edge); tx++) {
          if (isTileWall(tx, ty)) continue;
          let allFloor = true;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
            if (isTileWall(tx + dx, ty + dy)) allFloor = false;
          const o = org(tx, ty);
          if (allFloor && !open && !inWall(d, o[0], o[1])) open = { tx: tx, ty: ty, o: o };
          // 右へ 2 マス先が壁で、手前 2 マスは床 = 「右へ進むと必ず壁」
          if (!edge && !isTileWall(tx + 1, ty) && isTileWall(tx + 2, ty) && !inWall(d, o[0], o[1])) {
            edge = { tx: tx, ty: ty, o: o };
          }
        }
      }
      const r = { openTile: open ? (open.tx + ',' + open.ty) : null,
                  edgeTile: edge ? (edge.tx + ',' + edge.ty) : null };
      if (open) {
        r.freeDirs = [[8, 0], [-8, 0], [0, 8], [0, -8]]
          .filter(v => !inWall(d, open.o[0] + v[0], open.o[1] + v[1])).length;
      }
      if (edge) {
        // 右へ 1px ずつ進めて、止まる位置があるか (= 壁へめり込まない)
        let stopped = -1;
        for (let dx = 1; dx <= 3 * TILE_SIZE; dx++) {
          if (inWall(d, edge.o[0] + dx, edge.o[1])) { stopped = dx; break; }
        }
        r.stopAt = stopped;
      }
      out[k] = r;
    }
    return out;
  });
}

/* 書き換えたノックバック 2 行が実プレイで実際に走ることを踏む。 */
async function knockbackProbe(page) {
  const dirs = [[10, 0], [-10, 0], [0, 10], [0, -10]];
  const seen = [];
  for (const d of dirs) {
    const before = await page.evaluate((vx, vy) => {
      const e = enemies.find(x => x.alive && !x.inactive && !x.passiveNpc && !x.def.isObjective);
      if (!e) return null;
      e.hitStun = 8; e.knockbackVX = vx; e.knockbackVY = vy;
      return { x: e.x, y: e.y, name: e.def.name, size: e.def.displaySize };
    }, d[0], d[1]);
    if (!before) return { moved: false, why: '生きた敵がいない', seen: seen };
    await sleep(500);
    const after = await page.evaluate(() => {
      const e = enemies.find(x => x.alive && !x.inactive && !x.passiveNpc && !x.def.isObjective);
      return e ? { x: e.x, y: e.y } : null;
    });
    const dx = after ? Math.abs(after.x - before.x) : 0;
    const dy = after ? Math.abs(after.y - before.y) : 0;
    seen.push('(' + d[0] + ',' + d[1] + ')=' + dx.toFixed(1) + '/' + dy.toFixed(1));
    if (dx > 0.5 || dy > 0.5) return { moved: true, name: before.name, size: before.size, seen: seen };
  }
  return { moved: false, why: '4 方向すべてで動かなかった', seen: seen };
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_wallbox_');
  const browserPath = findBrowser();
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   ' + MUT_ORDER.map(k => k + ':' + PORT_OF[k]).join(' / '));

  const servers = [await startServer(PORT, null)];
  for (const k of MUT_ORDER) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required'],
  });
  const errs = [];
  try {
    // ══ §1 恒等 (比率を持たない def は 1px も変わらない) ═══════════════════════
    mark('§1 恒等: 比率を持たない def は旧直書きと 1px も違わない');
    const page = await bootPage(browser, PORT, '?diag=1&intel=0', errs);
    {
      const r = await identityProbe(page);
      check('(1a) 比率を持たない def x 6 原点で新旧の箱が 4 辺とも一致する',
        r.badN === 0, r.nPlain + ' def x ' + r.nOrigins + ' 原点 / 不一致 ' + r.badN
          + (r.bad.length ? ' 例: ' + r.bad.join(' | ') : ''));
      check('(1a-装置) 母集団が実在する (比率なし 40 本以上 / 比率あり ちょうど 12 本)',
        r.nPlain >= 40 && r.nRatio === 12,
        '比率なし=' + r.nPlain + ' 比率あり=' + r.nRatio + ' [' + r.ratioKeys.join(',') + ']');
    }

    // ══ §2 効果 ═══════════════════════════════════════════════════════════════
    mark('§2a 箱の中心が体へ寄っている (期待値は PNG の alpha bbox から組み立てる)');
    const sheets = await measureSheets(page);
    const centers = await boxCenters(page);
    {
      const keys = Object.keys(centers).filter(k => k !== '__const').sort();
      const off = [], resNew = [], resOld = [], badSpec = [], outside = [], notBetter = [];
      const errKeys = keys.filter(k => !sheets[k] || sheets[k].err);
      for (const k of keys) {
        const sh = sheets[k], c = centers[k];
        if (!sh || sh.err) continue;
        const e = expectedCenter(sh, c.S);
        if (Math.abs(c.cx - e.cx) > 0.5 || Math.abs(c.cy - e.cy) > 0.5) {
          badSpec.push(k + ' 実(' + c.cx.toFixed(1) + ',' + c.cy.toFixed(1) + ')!=仕様('
            + e.cx.toFixed(1) + ',' + e.cy.toFixed(1) + ')');
        }
        const dN = Math.hypot(c.cx - e.bx, c.cy - e.by);
        const dO = Math.hypot(c.oldCx - e.bx, c.oldCy - e.by);
        resNew.push(k + '=' + dN.toFixed(1)); resOld.push(k + '=' + dO.toFixed(1));
        if (!(dN < dO / 2 && dN <= 40)) notBetter.push(k + ' 新' + dN.toFixed(1) + ' 旧' + dO.toFixed(1));
        const bl = sh.L / sh.fw * c.S, br = sh.R / sh.fw * c.S;
        const bt = sh.T / sh.fh * c.S, bb = sh.B / sh.fh * c.S;
        if (c.cx - 20 < bl || c.cx + 20 > br || c.cy - 20 < bt || c.cy + 20 > bb) {
          outside.push(k + ' 箱(' + (c.cx - 20).toFixed(0) + '..' + (c.cx + 20).toFixed(0) + ','
            + (c.cy - 20).toFixed(0) + '..' + (c.cy + 20).toFixed(0) + ') 体(' + bl.toFixed(0) + '..'
            + br.toFixed(0) + ',' + bt.toFixed(0) + '..' + bb.toFixed(0) + ')');
        }
        off.push(k + '=' + (c.cx - c.S / 2).toFixed(0) + ',' + (c.cy - c.S / 2).toFixed(0));
      }
      check('(2a) 箱の中心が「体の中心へ寄せる・ただしスプライト中心から ±28px まで」を満たす',
        badSpec.length === 0 && errKeys.length === 0 && resNew.length === 12,
        (errKeys.length ? 'シート測定不能=' + errKeys.join(',') + ' / ' : '')
          + (badSpec.length ? badSpec.join(' | ') : '12 体一致 / ズレ(スプライト中心比) ' + off.join(' ')));
      check('(2a-装置1) シートの alpha bbox が非退化 (12 体すべてで不透明画素と幅高さがある)',
        keys.length === 12 && keys.every(k => sheets[k] && !sheets[k].err
          && sheets[k].R > sheets[k].L && sheets[k].B > sheets[k].T && sheets[k].opaque > 1000),
        keys.map(k => k + ':' + (sheets[k].err || ((sheets[k].R - sheets[k].L) + 'x' + (sheets[k].B - sheets[k].T)))).join(' '));
      check('(2a-装置2) 実装側の定数がドライバの仕様と一致 (箱 40px / 上限 28px / タイル 96px)',
        centers.__const && centers.__const.boxSize === 40 && centers.__const.maxOff === SPEC_M
          && centers.__const.tile === 96, JSON.stringify(centers.__const));
      check('(2a-2) 体の中心との残差が旧箱の半分以下、かつ 40px 以内',
        notBetter.length === 0,
        notBetter.length ? notBetter.join(' | ') : '新 ' + resNew.join(' '));
      check('(2a-3) 箱 40x40 が体の外接矩形の内側に完全に収まる',
        outside.length === 0, outside.join(' | ') || '12 体すべて内側');
      check('(2b) 旧箱では 12 体すべてが体の中心から 16px を超えてずれていた (= 直す価値が実在した)',
        resOld.length === 12 && resOld.every(t => parseFloat(t.split('=')[1]) > 16), resOld.join(' '));
      check('(2b-装置) 箱の大きさは 40x40 のまま (通れた隙間が通れなくなる危険を作らない)',
        keys.every(k => Math.abs(centers[k].w - 40) < 1e-6 && Math.abs(centers[k].h - 40) < 1e-6),
        keys.map(k => k + ':' + centers[k].w.toFixed(3) + 'x' + centers[k].h.toFixed(3)).slice(0, 3).join(' ') + ' ...');
    }

    mark('§2c 盤面まるごと: 床タイルに立ったとき箱が壁の中に居る割合 (新 vs 旧)');
    {
      const lines = [];
      let worse = [], overThreshold = [];
      for (const scen of SCENARIOS) {
        const p = await bootPage(browser, PORT, '?diag=1&intel=0', errs, scen);
        const r = await wallOverlapRate(p);
        for (const k of Object.keys(r).sort()) {
          const v = r[k];
          const rn = v.floor ? v.badNew / v.floor : 0;
          const ro = v.floor ? v.badOld / v.floor : 0;
          lines.push(scen + '/' + k + ' 新' + (rn * 100).toFixed(1) + '% 旧' + (ro * 100).toFixed(1) + '%');
          if (rn > ro + 1e-9) worse.push(scen + '/' + k + ' ' + (rn * 100).toFixed(1) + '>' + (ro * 100).toFixed(1));
          if (rn > 0) overThreshold.push(scen + '/' + k + ' ' + (rn * 100).toFixed(1) + '%');
        }
        await p.close();
      }
      check('(2c) 全 6 シナリオ x 12 体で、箱が壁の中に居る割合が旧箱より悪化していない',
        worse.length === 0, worse.length ? worse.slice(0, 6).join(' | ') : (lines.length + ' 組を測定'));
      /* ⭐ 「箱はスプライト中心から ±28px」= 箱は必ず 1 タイルの正方形の内側 → 床タイルに
       *   立っている限り箱が壁に入ることは**原理的に**ない。0 件を要求できる。 */
      check('(2c-2) 新しい箱では箱が壁の中に居る床タイルが 1 つも無い (= 「常にブロック」を作らない)',
        overThreshold.length === 0, overThreshold.slice(0, 8).join(' | ') || '全 ' + lines.length + ' 組で 0 件');
      console.log('       ' + lines.slice(0, 12).join('\n       '));
    }

    mark('§2d 壁際の挙動: 開けた床では動け、壁へは入らない');
    {
      const r = await wallEdgeProbe(page);
      const keys = Object.keys(r).sort();
      const stuck = keys.filter(k => r[k].openTile && r[k].freeDirs !== 4);
      const noStop = keys.filter(k => r[k].edgeTile && !(r[k].stopAt > 0));
      const noSite = keys.filter(k => !r[k].openTile || !r[k].edgeTile);
      check('(2d-1) 開けた床 (5x5 すべて床) では 4 方向すべてへ動ける (= 全く動かないでない)',
        stuck.length === 0 && noSite.length < 12,
        stuck.length ? stuck.map(k => k + ':' + r[k].freeDirs + '方向').join(' ')
          : keys.filter(k => r[k].openTile).length + ' 体で確認');
      check('(2d-2) 壁へ向かって進めると必ず止まる位置がある (= 壁へめり込まない)',
        noStop.length === 0,
        noStop.length ? noStop.join(' ')
          : keys.filter(k => r[k].edgeTile).map(k => k + '@' + r[k].stopAt + 'px').slice(0, 6).join(' '));
    }
    await page.close();

    // ══ §3 配線 (ソース側) ════════════════════════════════════════════════════
    mark('§3 3 つの呼び口が 1 本を通り、旧直書きが 1 つも残っていない');
    {
      const s = SRC['index.html'];
      check('(3a) makeOverlapUnit の wallBox が unitWallBox を通る',
        s.indexOf('wallBox: (cx, cy) => unitWallBox(obj.def, cx - size / 2, cy - size / 2),') >= 0);
      check('(3b) ノックバック X が unitWallBox を通る',
        s.indexOf('const kbX = unitWallBox(enemy.def, newEX, enemy.y);') >= 0);
      check('(3c) ノックバック Y が unitWallBox を通る (enemy.x は更新後を読む順序のまま)',
        s.indexOf('const kbY = unitWallBox(enemy.def, enemy.x, newEY);') >= 0);
      const leftovers = ['newEX+16', 'newEY+18', 'cx - size / 2 + 16', 'cx - size / 2 + 56'];
      const found = leftovers.filter(t => s.indexOf(t) >= 0);
      check('(3d) 40x40 の直書きが呼び口に 1 つも残っていない', found.length === 0, found.join(' / ') || '残り 0');
      const playerLines = s.split(/\r?\n/).filter(l =>
        l.indexOf('wouldOverlapWall') >= 0 && /28/.test(l) && /34/.test(l) && /68/.test(l) && /82/.test(l));
      check('(3e-装置) プレイヤーの箱 28/34/68/82 が手つかずで残っている (5 呼び口 + wallBox 1)',
        playerLines.length === 5 && s.indexOf('cx - 48 + 28') >= 0,
        'wouldOverlapWall 行=' + playerLines.length + ' / player wallBox=' + (s.indexOf('cx - 48 + 28') >= 0));
      // bodyOffX を unitBodyTiles が読まない = footprint 判定はビット不変
      const bt = s.slice(s.indexOf('function unitBodyTiles'), s.indexOf('function isBodyClear'));
      check('(3f-装置) unitBodyTiles は bodyOffX を読まない (戦車の footprint 判定がビット不変)',
        bt.length > 200 && bt.indexOf('bodyOffX') < 0, 'unitBodyTiles 本文 ' + bt.length + ' 文字');
    }

    // ══ §4 書き換えた行が実プレイで走る ═══════════════════════════════════════
    mark('§4 書き換えたノックバック 2 行が実プレイで実際に走る');
    {
      const p = await bootPage(browser, PORT, '?diag=1&intel=0', errs);
      await p.evaluate(() => { try { startGame(); } catch (e) {} });
      for (let i = 0; i < 60 && !(await p.evaluate(() =>
        typeof enemies !== 'undefined' && enemies.some(e => e.alive))); i++) await sleep(150);
      await closeDialogs(p);
      const kb = await knockbackProbe(p);
      check('(4a) 敵に hitStun + knockbackV を与えると実際に動く (= 書き換えた行が例外なく走る)',
        kb.moved, kb.moved ? (kb.name + ' size=' + kb.size + ' ' + kb.seen.join(' '))
                           : (kb.why + ' / ' + kb.seen.join(' ')));
      await p.close();
    }

    // ══ §5 撤退スイッチ ═══════════════════════════════════════════════════════
    mark('§5 ?wallbox=0 で全 def が旧 40x40 直書きへ戻る');
    {
      const p = await bootPage(browser, PORT, '?diag=1&intel=0&wallbox=0', errs);
      const c = await boxCenters(p);
      const keys = Object.keys(c).filter(k => k !== '__const');
      check('(5a) ?wallbox=0 では大型 12 体も箱の中心が原点 +(36,38) に戻る',
        keys.length === 12 && keys.every(k => c[k].cx === 36 && c[k].cy === 38),
        keys.map(k => k + ':' + c[k].cx + ',' + c[k].cy).slice(0, 3).join(' ') + ' ...');
      await p.close();
    }

    // ══ §6 負のコントロール ═══════════════════════════════════════════════════
    mark('§6 負のコントロール (欠陥を注入すると該当節が赤くなる)');
    {
      const p = await bootPage(browser, PORT_OF['oldbox'], '?diag=1&intel=0', errs);
      const sh = await measureSheets(p);
      const c = await boxCenters(p);
      const over = Object.keys(c).filter(k => k !== '__const').filter(k => {
        const e = expectedCenter(sh[k], c[k].S);
        return Math.abs(c[k].cx - e.cx) > 0.5 || Math.abs(c[k].cy - e.cy) > 0.5;
      });
      const rate = await wallOverlapRate(p);
      const anyWall = Object.keys(rate).some(k => rate[k].badNew > 0);
      check('(6-oldbox) 全 def を旧箱へ戻すと §2a が赤くなる (12 体すべて仕様と不一致)',
        over.length === 12, '不一致 = ' + over.length + ' 体');
      check('(6-oldbox-2) 旧箱では箱が壁の中に居る床タイルが実在する (§2c の物差しが効いている)',
        anyWall, Object.keys(rate).map(k => k + ':' + rate[k].badNew + '/' + rate[k].floor).slice(0, 4).join(' '));
      await p.close();
    }
    {
      const p = await bootPage(browser, PORT_OF['symx'], '?diag=1&intel=0', errs);
      const sh = await measureSheets(p);
      const c = await boxCenters(p);
      const over = Object.keys(c).filter(k => k !== '__const').filter(k => {
        const e = expectedCenter(sh[k], c[k].S);
        return Math.abs(c[k].cx - e.cx) > 0.5 || Math.abs(c[k].cy - e.cy) > 0.5;
      });
      check('(6-symx) bodyOffX を無視すると §2a が赤くなる (体の左右は対称ではない)',
        over.length > 0, '仕様と不一致 = ' + (over.join(',') || 'なし'));
      await p.close();
    }
    {
      const p = await bootPage(browser, PORT_OF['noclamp'], '?diag=1&intel=0', errs);
      const sh = await measureSheets(p);
      const c = await boxCenters(p);
      const bad = Object.keys(c).filter(k => k !== '__const').filter(k => {
        const e = expectedCenter(sh[k], c[k].S);
        return Math.abs(c[k].cx - e.cx) > 0.5 || Math.abs(c[k].cy - e.cy) > 0.5;
      });
      const rate = await wallOverlapRate(p);
      const inWall = Object.keys(rate).filter(k => rate[k].badNew > 0);
      check('(6-noclamp) 縦のクランプを外すと §2a が赤くなる',
        bad.length > 0, '仕様と不一致 = ' + (bad.join(',') || 'なし'));
      check('(6-noclamp-2) 縦のクランプを外すと §2c-2 が赤くなる (箱が下隣のタイルへ出る)',
        inWall.length > 0,
        inWall.map(k => k + ':' + (rate[k].badNew / rate[k].floor * 100).toFixed(1) + '%').slice(0, 6).join(' ') || 'なし');
      await p.close();
    }
    {
      const p = await bootPage(browser, PORT_OF['ratioall'], '?diag=1&intel=0', errs);
      const r = await identityProbe(p);
      check('(6-ratioall) 比率なしの def にも新しい箱を当てると §1a が赤くなる',
        r.badN > 0 && r.nPlain >= 40, '不一致 ' + r.badN + ' / 比率なし ' + r.nPlain + ' 体');
      await p.close();
    }

    // ══ §7 ページエラー ═══════════════════════════════════════════════════════
    mark('§7 ページエラーが出ていないこと');
    check('(7a) 測定ページで pageerror / console.error が出ていない',
      errs.length === 0, errs.slice(0, 6).join(' | '));
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const bad = results.filter(r => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + (results.length - bad.length) + '/' + results.length + ' PASS');
  if (bad.length) {
    console.log('  FAIL:');
    for (const b of bad) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(bad.length ? 1 : 0);
})();
