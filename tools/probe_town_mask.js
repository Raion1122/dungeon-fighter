#!/usr/bin/env node
/*
 * probe_town_mask.js — 「港町フランの絵の上に通行マスクを理由別で重ねた全景」を出す目視補助
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-22_town-map-phlan.md` の STEP2-2 が
 * 「起草時に使った道具を tools/probe_town_mask.js として残すこと」と指定したもの。
 * 先例 = tools/probe_paint_overlay.js (同じ役目をダンジョン側で果たす)。
 *
 * ⚠⚠ **assert を持たない**。非退行ドライバ (driver_*.js / verify_*.js) とは別扱いで、
 *   CI の色には関与しない。マスクのズレは「絵を単体で眺めても」「数値 assert が全部緑でも」
 *   見えないことがあるので、**本番の絵の上で**目で確かめるための道具として残す。
 *
 * ⭐⭐⭐ **写経しない**。マスクも絵も、ブラウザに **本番のファイルをそのまま読ませて**いる
 *   (`<script src="/js/town-map.js">` と `<img src="/assets/town_phlan.jpg">`)。
 *   道具の中にマスクを書き写すと、両方同じ誤りだったときに永久に気づけない。
 *
 * 何が見えるか (⚠ 歩けない理由を 1 語でまとめない — 依頼書 STEP2-4):
 *   ・青   … 水 (運河・ムーンシー湖)          `~`
 *   ・赤   … 建物・船体                        `B`
 *   ・橙   … 露店・天幕・木箱の山              `s`
 *   ・紫   … 瓦礫・足場 (西の再建現場)         `r`
 *   ・白   … 岩・樹・植栽                      `^`
 *   ・無色 … 歩ける                            `.`
 *   ・緑の二重枠 … 施設の入場タイル (そこまで歩いて中へ入る)
 *   ・緑の細枠   … 施設の看板を浮かせるタイル
 *   ・水色の枠   … 街に入ったとき立つタイル (SPAWNS)
 *   ・目盛り     … 全マスにタイル座標。「(12,10) を空けて」と指せるようにするため
 *
 * 使い方:
 *   node tools/probe_town_mask.js
 *   node tools/probe_town_mask.js --out <dir> --cell 64
 *   node tools/probe_town_mask.js --no-labels          (絵の粗を見たいとき)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');     // ⚠ path.resolve 必須 (`/` 区切りだと全 404)
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const has = (n) => argv.indexOf('--' + n) >= 0;
const PORT = parseInt(arg('port', '9101'), 10);
const OUT = arg('out', path.join(os.tmpdir(), 'df_town_mask'));
const CELL = parseInt(arg('cell', '64'), 10);
const LABELS = !has('no-labels');

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* 合成ページ。⚠ 中身を持たせないこと — マスクも絵も本番のファイルから読ませる。 */
const PROBE_HTML = `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#111">
<img id="pic" src="/assets/town_phlan.jpg">
<script src="/js/town-map.js"></script>
<script>
  window.__picReady = new Promise(function (res) {
    var im = document.getElementById('pic');
    if (im.complete && im.naturalWidth) res(true);
    else { im.onload = function () { res(true); }; im.onerror = function () { res(false); }; }
  });
</script>
</body>`;

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/__probe_town.html') {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(PROBE_HTML); return;
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
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[probe] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[probe] Chrome が見つかりません'); process.exit(2);
}

/* ページ内で「絵 + 理由別に塗ったマス + 目盛り」を 1 枚の canvas に描いて dataURL で返す。
 * ⚠ 塗る色も理由のラベルも TOWN_MAP.LEGEND から取る。道具の中に色表を持たない。 */
function RENDER(cell, labels) {
  const TM = window.TOWN_MAP;
  const PAD = 26;
  const cv = document.createElement('canvas');
  cv.width = TM.COLS * cell + PAD;
  cv.height = TM.ROWS * cell + PAD + 30;         // 下 30px = 凡例
  const g = cv.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
  const ox = PAD, oy = PAD;
  const pic = document.getElementById('pic');
  if (pic && pic.naturalWidth) g.drawImage(pic, ox, oy, TM.COLS * cell, TM.ROWS * cell);

  const tally = {};
  for (let r = 0; r < TM.ROWS; r++) {
    for (let c = 0; c < TM.COLS; c++) {
      const t = TM.tileAt(c, r);
      tally[t] = (tally[t] || 0) + 1;
      const leg = TM.LEGEND[t];
      if (!leg || t === '.') continue;
      g.fillStyle = leg.color;
      g.fillRect(ox + c * cell, oy + r * cell, cell, cell);
    }
  }
  // 格子 (5 マスごとに濃く)
  for (let c = 0; c <= TM.COLS; c++) {
    g.strokeStyle = (c % 5 === 0) ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.12)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(ox + c * cell, oy); g.lineTo(ox + c * cell, oy + TM.ROWS * cell); g.stroke();
  }
  for (let r = 0; r <= TM.ROWS; r++) {
    g.strokeStyle = (r % 5 === 0) ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.12)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(ox, oy + r * cell); g.lineTo(ox + TM.COLS * cell, oy + r * cell); g.stroke();
  }
  // 出現タイル (水色の枠)
  Object.keys(TM.SPAWNS).forEach(function (k) {
    const s = TM.SPAWNS[k];
    g.strokeStyle = 'rgba(90,230,255,0.95)'; g.lineWidth = 3;
    g.strokeRect(ox + s[0] * cell + 3, oy + s[1] * cell + 3, cell - 6, cell - 6);
  });
  // 施設 (入場タイル = 緑の二重枠 / 看板 = 緑の細枠 + アイコン)
  TM.FACILITIES.forEach(function (f) {
    g.strokeStyle = 'rgba(90,255,140,0.95)'; g.lineWidth = 4;
    g.strokeRect(ox + f.enter[0] * cell + 2, oy + f.enter[1] * cell + 2, cell - 4, cell - 4);
    g.lineWidth = 1;
    g.strokeRect(ox + f.enter[0] * cell + 8, oy + f.enter[1] * cell + 8, cell - 16, cell - 16);
    g.strokeStyle = 'rgba(90,255,140,0.7)'; g.lineWidth = 2;
    g.strokeRect(ox + f.sign[0] * cell + 5, oy + f.sign[1] * cell + 5, cell - 10, cell - 10);
    g.font = 'bold ' + Math.round(cell * 0.42) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillText(f.icon, ox + f.sign[0] * cell + cell / 2 + 1, oy + f.sign[1] * cell + cell / 2 + 1);
    g.fillStyle = '#fff';
    g.fillText(f.icon, ox + f.sign[0] * cell + cell / 2, oy + f.sign[1] * cell + cell / 2);
  });
  // 目盛り = 全マスのタイル座標 (「ここ」と指せるようにするため)
  if (labels) {
    g.font = 'bold 10px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    for (let r = 0; r < TM.ROWS; r++) {
      for (let c = 0; c < TM.COLS; c++) {
        const s = c + ',' + r;
        g.fillStyle = 'rgba(0,0,0,0.62)';
        g.fillRect(ox + c * cell + 1, oy + r * cell + 1, s.length * 6 + 4, 12);
        g.fillStyle = TM.isWalkable(c, r) ? '#9f9' : '#ff6';
        g.fillText(s, ox + c * cell + 3, oy + r * cell + 2);
      }
    }
  }
  // 外周の目盛り
  g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ccc';
  for (let c = 0; c < TM.COLS; c++) g.fillText(String(c), ox + c * cell + cell / 2, oy / 2);
  g.textAlign = 'right';
  for (let r = 0; r < TM.ROWS; r++) g.fillText(String(r), ox - 4, oy + r * cell + cell / 2);
  // 凡例
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = 'bold 12px monospace';
  let lx = ox, ly = oy + TM.ROWS * cell + 15;
  Object.keys(TM.LEGEND).forEach(function (t) {
    const leg = TM.LEGEND[t];
    g.fillStyle = (t === '.') ? 'rgba(120,255,160,0.85)' : leg.color.replace(/0\.\d+\)$/, '0.95)');
    g.fillRect(lx, ly - 6, 12, 12);
    g.fillStyle = '#ddd';
    const s = " '" + t + "' " + leg.label + ' ' + (tally[t] || 0);
    g.fillText(s, lx + 14, ly);
    lx += 16 + s.length * 7.2;
  });

  /* ★受入条件 2 と同じ問い (ただしここは目視補助なので assert しない。数だけ出す)。
   *  ⚠ 自前で BFS を書かない。本番の TOWN_MAP.findPath をそのまま呼ぶ。 */
  const isolated = [];
  for (let r = 0; r < TM.ROWS; r++) {
    for (let c = 0; c < TM.COLS; c++) {
      if (!TM.isWalkable(c, r)) continue;
      for (let i = 0; i < TM.FACILITIES.length; i++) {
        const f = TM.FACILITIES[i];
        if (TM.findPath(c, r, f.enter[0], f.enter[1]) === null) { isolated.push(c + ',' + r + '->' + f.key); break; }
      }
    }
  }
  return { png: cv.toDataURL('image/png'), tally: tally, isolated: isolated,
           picOk: !!(pic && pic.naturalWidth), picSize: pic ? (pic.naturalWidth + 'x' + pic.naturalHeight) : '-' };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_townmask_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: true,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });
  fs.mkdirSync(OUT, { recursive: true });
  let code = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1100 });
    await page.goto('http://localhost:' + PORT + '/__probe_town.html', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction("window.TOWN_MAP && typeof window.TOWN_MAP.findPath === 'function'", { timeout: 20000 });
    const picOk = await page.evaluate(() => window.__picReady);
    if (!picOk) { console.error('[probe] assets/town_phlan.jpg を読めませんでした'); code = 3; }
    const r = await page.evaluate(RENDER, CELL, LABELS);
    const file = path.join(OUT, 'town_mask.png');
    fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
    console.log('[probe] ' + file);
    console.log('        絵      = ' + r.picSize + ' (読み込み ' + (r.picOk ? 'OK' : 'NG') + ')');
    console.log('        内訳    = ' + JSON.stringify(r.tally));
    console.log('        到達できないマス = ' + r.isolated.length + ' 件' +
                (r.isolated.length ? ' : ' + r.isolated.join(' ') : ' (0 件が正常)'));
  } catch (e) {
    console.error('[probe] ' + e.message + '\n' + (e.stack || ''));
    code = 3;
  }
  await browser.close();
  srv.close();
  process.exit(code);
})();
