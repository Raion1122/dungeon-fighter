#!/usr/bin/env node
/*
 * probe_plaza_mask.js — 「闇市の地下街の絵の上に通行マスクを理由別で重ねた全景」を出す目視補助
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-10-21_plaza-undercity-map.md` (#98) §4-3。
 * tools/probe_town_mask.js (港町フラン) をそのまま写した形。
 *
 * ⚠⚠ **assert を持たない**。非退行ドライバ (driver_*.js / verify_*.js) とは別扱いで、
 *   CI の色には関与しない。マスクのズレは「絵を単体で眺めても」「数値 assert が全部緑でも」
 *   見えないことがあるので、**本番の絵の上で**目で確かめるための道具として残す。
 *   受入の assert は tools/verify_plaza_map.js が持つ。
 *
 * ⭐⭐⭐ **写経しない**。マスクも絵も、ブラウザに **本番のファイルをそのまま読ませて**いる
 *   (`<script src="/js/plaza-map.js">` と `<img src="/assets/plaza_undercity.jpg">`)。
 *   道具の中にマスクを書き写すと、両方同じ誤りだったときに永久に気づけない。
 *   ⭐ 経路も自前で BFS を書かず、本番の PLAZA_MAP.findPath (4 近傍) を呼ぶ。
 *
 * 何が見えるか (⚠ 歩けない理由を 1 語でまとめない):
 *   ・色の内訳は PLAZA_MAP.LEGEND が唯一の正 (道具の中に色表を持たない)
 *   ・緑の二重枠 … 露店・掲示板・出口の入場タイル (enter。そこまで歩いて板を開く / 出る)
 *   ・緑の細枠   … 札を浮かせるタイル (sign) + key の頭文字
 *   ・水色の枠   … 地下街に入ったとき立つタイル (SPAWNS)
 *   ・赤の × 印  … enter / 立ち位置なのに `.` でないタイル (永久に入れない)
 *   ・目盛り     … 全マスにタイル座標。「(8,5) を空けて」と指せるようにするため
 *
 * 標準出力:
 *   ・内訳 (記号ごとのマス数) / 歩けるマスの数
 *   ・enter と立ち位置のうち `.` でないもの
 *   ・2 つの立ち位置の**どちらか**から findPath が届かない歩けるマス (= 孤立)
 *   ・立ち位置から届かない enter
 *
 * 使い方:
 *   node tools/probe_plaza_mask.js
 *   node tools/probe_plaza_mask.js --out <dir> --cell 64
 *   node tools/probe_plaza_mask.js --no-labels          (絵の粗を見たいとき)
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
const PORT = parseInt(arg('port', '9103'), 10);
const OUT = arg('out', path.join(os.tmpdir(), 'df_plaza_mask'));
const CELL = parseInt(arg('cell', '64'), 10);
const LABELS = !has('no-labels');

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* 合成ページ。⚠ 中身を持たせないこと — マスクも絵も本番のファイルから読ませる。 */
const PROBE_HTML = `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#111">
<img id="pic" src="/assets/plaza_undercity.jpg">
<script src="/js/plaza-map.js"></script>
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
        if (u === '/__probe_plaza.html') {
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
 * ⚠ 塗る色も理由のラベルも PLAZA_MAP.LEGEND から取る。道具の中に色表を持たない。 */
function RENDER(cell, labels) {
  const PM = window.PLAZA_MAP;
  const PAD = 26;
  const cv = document.createElement('canvas');
  cv.width = PM.COLS * cell + PAD;
  cv.height = PM.ROWS * cell + PAD + 30;         // 下 30px = 凡例
  const g = cv.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
  const ox = PAD, oy = PAD;
  const pic = document.getElementById('pic');
  if (pic && pic.naturalWidth) g.drawImage(pic, ox, oy, PM.COLS * cell, PM.ROWS * cell);

  const tally = {};
  for (let r = 0; r < PM.ROWS; r++) {
    for (let c = 0; c < PM.COLS; c++) {
      const t = PM.tileAt(c, r);
      tally[t] = (tally[t] || 0) + 1;
      const leg = PM.LEGEND[t];
      if (!leg || t === '.') continue;
      g.fillStyle = leg.color;
      g.fillRect(ox + c * cell, oy + r * cell, cell, cell);
    }
  }
  // 格子 (5 マスごとに濃く)
  for (let c = 0; c <= PM.COLS; c++) {
    g.strokeStyle = (c % 5 === 0) ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.12)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(ox + c * cell, oy); g.lineTo(ox + c * cell, oy + PM.ROWS * cell); g.stroke();
  }
  for (let r = 0; r <= PM.ROWS; r++) {
    g.strokeStyle = (r % 5 === 0) ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.12)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(ox, oy + r * cell); g.lineTo(ox + PM.COLS * cell, oy + r * cell); g.stroke();
  }
  const bad = [];
  function cross(c, r) {
    g.strokeStyle = 'rgba(255,40,40,0.95)'; g.lineWidth = 4;
    g.beginPath();
    g.moveTo(ox + c * cell + 8, oy + r * cell + 8); g.lineTo(ox + (c + 1) * cell - 8, oy + (r + 1) * cell - 8);
    g.moveTo(ox + (c + 1) * cell - 8, oy + r * cell + 8); g.lineTo(ox + c * cell + 8, oy + (r + 1) * cell - 8);
    g.stroke();
  }
  // 立ち位置 (水色の枠)
  Object.keys(PM.SPAWNS).forEach(function (k) {
    const s = PM.SPAWNS[k];
    g.strokeStyle = 'rgba(90,230,255,0.95)'; g.lineWidth = 3;
    g.strokeRect(ox + s[0] * cell + 3, oy + s[1] * cell + 3, cell - 6, cell - 6);
    if (!PM.isWalkable(s[0], s[1])) { bad.push('spawn:' + k + '(' + s + ')'); cross(s[0], s[1]); }
  });
  // 施設 = 露店 + 掲示板 + 出口 (入場タイル = 緑の二重枠 / 札 = 緑の細枠 + key の頭文字)
  const places = PM.STALLS.concat([PM.BOARD]).concat(PM.EXITS);
  places.forEach(function (f) {
    g.strokeStyle = 'rgba(90,255,140,0.95)'; g.lineWidth = 4;
    g.strokeRect(ox + f.enter[0] * cell + 2, oy + f.enter[1] * cell + 2, cell - 4, cell - 4);
    g.lineWidth = 1;
    g.strokeRect(ox + f.enter[0] * cell + 8, oy + f.enter[1] * cell + 8, cell - 16, cell - 16);
    g.strokeStyle = 'rgba(90,255,140,0.7)'; g.lineWidth = 2;
    g.strokeRect(ox + f.sign[0] * cell + 5, oy + f.sign[1] * cell + 5, cell - 10, cell - 10);
    const tag = f.key.slice(0, 2).toUpperCase();
    g.font = 'bold ' + Math.round(cell * 0.34) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.8)';
    g.fillText(tag, ox + f.sign[0] * cell + cell / 2 + 1, oy + f.sign[1] * cell + cell / 2 + 1);
    g.fillStyle = '#fff';
    g.fillText(tag, ox + f.sign[0] * cell + cell / 2, oy + f.sign[1] * cell + cell / 2);
    g.fillStyle = 'rgba(0,0,0,0.8)';
    g.fillText(tag.toLowerCase(), ox + f.enter[0] * cell + cell / 2 + 1, oy + f.enter[1] * cell + cell / 2 + 1);
    g.fillStyle = '#9f9';
    g.fillText(tag.toLowerCase(), ox + f.enter[0] * cell + cell / 2, oy + f.enter[1] * cell + cell / 2);
    if (!PM.isWalkable(f.enter[0], f.enter[1])) { bad.push('enter:' + f.key + '(' + f.enter + ')'); cross(f.enter[0], f.enter[1]); }
  });
  // 目盛り = 全マスのタイル座標 (「ここ」と指せるようにするため)
  if (labels) {
    g.font = 'bold 10px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    for (let r = 0; r < PM.ROWS; r++) {
      for (let c = 0; c < PM.COLS; c++) {
        const s = c + ',' + r;
        g.fillStyle = 'rgba(0,0,0,0.62)';
        g.fillRect(ox + c * cell + 1, oy + r * cell + 1, s.length * 6 + 4, 12);
        g.fillStyle = PM.isWalkable(c, r) ? '#9f9' : '#ff6';
        g.fillText(s, ox + c * cell + 3, oy + r * cell + 2);
      }
    }
  }
  // 外周の目盛り
  g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ccc';
  for (let c = 0; c < PM.COLS; c++) g.fillText(String(c), ox + c * cell + cell / 2, oy / 2);
  g.textAlign = 'right';
  for (let r = 0; r < PM.ROWS; r++) g.fillText(String(r), ox - 4, oy + r * cell + cell / 2);
  // 凡例
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = 'bold 12px monospace';
  let lx = ox, ly = oy + PM.ROWS * cell + 15;
  Object.keys(PM.LEGEND).forEach(function (t) {
    const leg = PM.LEGEND[t];
    g.fillStyle = (t === '.') ? 'rgba(120,255,160,0.85)' : leg.color.replace(/0\.\d+\)$/, '0.95)');
    g.fillRect(lx, ly - 6, 12, 12);
    g.fillStyle = '#ddd';
    const s = " '" + t + "' " + leg.label + ' ' + (tally[t] || 0);
    g.fillText(s, lx + 14, ly);
    lx += 16 + s.length * 9;
  });

  /* ★受入 (1a)(1b) と同じ問い (ただしここは目視補助なので assert しない。数だけ出す)。
   *  ⚠ 自前で BFS を書かない。本番の PLAZA_MAP.findPath をそのまま呼ぶ。 */
  const spawns = Object.keys(PM.SPAWNS).map(function (k) { return { key: k, c: PM.SPAWNS[k][0], r: PM.SPAWNS[k][1] }; });
  const isolated = [];
  let walkable = 0;
  for (let r = 0; r < PM.ROWS; r++) {
    for (let c = 0; c < PM.COLS; c++) {
      if (!PM.isWalkable(c, r)) continue;
      walkable++;
      for (let i = 0; i < spawns.length; i++) {
        if (PM.findPath(spawns[i].c, spawns[i].r, c, r) === null) { isolated.push(c + ',' + r + '<-' + spawns[i].key); break; }
      }
    }
  }
  const unreachable = [];
  places.forEach(function (f) {
    spawns.forEach(function (s) {
      if (PM.findPath(s.c, s.r, f.enter[0], f.enter[1]) === null) unreachable.push(f.key + '<-' + s.key);
    });
  });
  return { png: cv.toDataURL('image/png'), tally: tally, walkable: walkable, isolated: isolated,
           bad: bad, unreachable: unreachable,
           picOk: !!(pic && pic.naturalWidth), picSize: pic ? (pic.naturalWidth + 'x' + pic.naturalHeight) : '-' };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_plazamask_');
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
    await page.goto('http://localhost:' + PORT + '/__probe_plaza.html', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction("window.PLAZA_MAP && typeof window.PLAZA_MAP.findPath === 'function'", { timeout: 20000 });
    const picOk = await page.evaluate(() => window.__picReady);
    if (!picOk) { console.error('[probe] assets/plaza_undercity.jpg を読めませんでした'); code = 3; }
    const r = await page.evaluate(RENDER, CELL, LABELS);
    const file = path.join(OUT, 'plaza_mask.png');
    fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
    console.log('[probe] ' + file);
    console.log('        絵      = ' + r.picSize + ' (読み込み ' + (r.picOk ? 'OK' : 'NG') + ')');
    console.log('        内訳    = ' + JSON.stringify(r.tally) + ' / 歩ける ' + r.walkable + ' マス');
    console.log('        `.` でない enter / 立ち位置 = ' + r.bad.length + ' 件' +
                (r.bad.length ? ' : ' + r.bad.join(' ') : ' (0 件が正常)'));
    console.log('        立ち位置から届かない歩けるマス = ' + r.isolated.length + ' 件' +
                (r.isolated.length ? ' : ' + r.isolated.join(' ') : ' (0 件が正常)'));
    console.log('        立ち位置から届かない enter = ' + r.unreachable.length + ' 件' +
                (r.unreachable.length ? ' : ' + r.unreachable.join(' ') : ' (0 件が正常)'));
  } catch (e) {
    console.error('[probe] ' + e.message + '\n' + (e.stack || ''));
    code = 3;
  }
  await browser.close();
  srv.close();
  process.exit(code);
})();
