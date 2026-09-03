#!/usr/bin/env node
/*
 * probe_paint_overlay.js — 「1 枚絵の上に isTileWall を赤で重ねた全景」を出す目視補助 (2026-08-20)
 * ════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ **assert を持たない**。非退行ドライバ (driver_*.js) とは別扱いで、CI の色には関与しない。
 *   当たり判定のズレは「絵を単体で眺めても」「数値 assert が全部緑でも」見えないことがある
 *   (透過 PNG に白い矩形が焼き込まれていた 2026-08-16 の扉と同じ性質) ので、
 *   **本番の絵の上で**目で確かめるための道具として残す。
 *
 * 何が見えるか (★2026-08-22 理由別の塗り分けへ):
 *   ・赤   … 絵の blocked マスクが塞いだマス。**このチケットで直せるのはここだけ**。
 *   ・橙   … sealRing が塞いだ外周 1 周 (mine-wall-clipping #1 の担当。触らない)。
 *   ・青紫 … 元から岩盤 (mapData===2)。マスクとは無関係なので直せない。
 *   ・黄   … 閉じた/施錠された扉 (isDoorBlocking)。歩けないが正常。⚠ 出口の扉は
 *            ノードを片付けるまで閉じているので、黄枠のゲートが黄で塗られるのは**正常**。
 *   ・黄枠 … nodeGateTile が返す出口タイル。
 *   ・水色/桃の丸 … 敵スロット (桃=ボス)。⚠ 縁が赤い丸 = そのマスが塞がっている =
 *            受入条件 (c) 違反 (樽に埋まった敵が残りクエストがクリアしなくなる)。
 *   ・緑枠 … パーティ起点 (太) と現在地 (細)。
 *   ・水色の面 … 戦車の乱入位置と、その体が覆うタイル (unitBodyTiles)。
 *   ・目盛り … グローバルなタイル座標 (5 タイルごと)。「(43,9) を空けて」と指せる。
 *
 * ★[#46 §4-1 STEP A / 2026-09-03] 「絵が読めない」を直す 3 つのオプションを足した。
 *   塗りつぶし (rgba 0.42) だと絵が隠れて「そこに何が描かれているか」が読めず、
 *   マスクへ 1 マス足す候補を人が指せなかった。
 *     --outline              … 塗りつぶしをやめ、通行不能マスは**枠だけ** (width 3)、
 *                              床は**中心に緑の点**。絵はそのまま見える。
 *     --region <c0,r0,c1,r1> … グローバルタイル座標で領域を切り出す (部屋の rect でクランプ)。
 *     --scale <n>            … 出力を n 倍 (既定 1)。
 *   ⚠ 依頼書 §4-1 は「2 倍にすると 1 タイル 128px」と書いているが、**現行の 1 タイルは
 *     32px** なので 2 倍 = 64px。128px が欲しければ `--scale 4`。
 *   ⚠⚠ **判定の出所は現行と同じ 3 述語** (mapData===2 → isDoorBlocking → obstacleTileMask)
 *     のまま = whyOf() 1 本。⛔ blocked の行文字列をここで解釈し直さない (出所を 2 つ持たない)。
 *   ⚠ このツールは **assert を持たない目視補助**なので、拡張しても CI の色には関与しない。
 *   ⭐ tally / gates / foes の**数え上げは常に部屋の全域**で行う (--region は描画だけを切る)。
 *     こうすると領域を変えてもコンソールの数字が動かず、切り出し図と全景を混同しない。
 *   ⭐ 目盛りは領域が 20 タイル以下のとき **1 タイルごと**に出す (1 マスを指すため)。
 *
 * 使い方:
 *   node tools/probe_paint_overlay.js                 (goblin-mine の n0 と n1 を出す)
 *   node tools/probe_paint_overlay.js --out <dir>
 *   node tools/probe_paint_overlay.js --node n1
 *   node tools/probe_paint_overlay.js --node n1 --outline --region 29,6,40,13 --scale 4
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const PORT = parseInt(arg('port', '9098'), 10);
const OUT = arg('out', path.join(os.tmpdir(), 'df_paint_overlay'));
const ONLY = arg('node', null);
/* ★[#46 §4-1 STEP A] 目視の 3 オプション。⛔ 判定 (whyOf の 3 述語) には一切触らない。 */
const OUTLINE = argv.includes('--outline');
const SCALE = Math.max(1, Math.min(8, parseFloat(arg('scale', '1')) || 1));
const REGION = (() => {
  const s = arg('region', null);
  if (!s) return null;
  const v = s.split(',').map(t => parseInt(t.trim(), 10));
  if (v.length !== 4 || v.some(n => !isFinite(n))) {
    console.error('[probe] --region は c0,r0,c1,r1 の 4 つ (グローバルタイル座標)');
    process.exit(2);
  }
  return v;
})();

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ページ内で「絵 + 壁の理由で塗り分けたマス」を 1 枚の canvas に描いて dataURL で返す。
 * ⚠ 絵は roomPaintings[i].img (フェザー済みの canvas ではなく元画像) を使う。
 *   フェザーは描画の演出で、当たり判定とは無関係だから。
 * ⭐ [2026-08-22] 赤 1 色だと「このチケットで直せるマス (絵のマスク)」と
 *   「直せないマス (岩盤・閉じた扉)」が見分けられなかったので理由別に塗り分ける。
 *   判定の出所は isTileWall と同じ 3 つの述語そのもの (規則を写経しない)。 */
function RENDER(O) {
  O = O || {};
  const OUTLINE = !!O.outline;
  const SCALE = O.scale || 1;
  const room = MAPDEF.rooms[0];
  const r1 = room.rect[0], c1 = room.rect[1], r2 = room.rect[2], c2 = room.rect[3];
  const w = c2 - c1 + 1, h = r2 - r1 + 1;
  const CELL = 32 * SCALE, PAD = 24 * SCALE;
  /* ★[#46 §4-1 STEP A] 表示域。⭐ **数え上げは常に部屋の全域**で、ここは描画の窓だけを決める。
   *  ⚠ 座標式 (ox + (x - c1) * CELL) は 1 つも書き換えない — 原点 ox/oy を左上へずらすだけで、
   *    窓の外のタイルは canvas の外へ落ちて自動的にクリップされる (式を 2 通り持たない)。 */
  let vc1 = c1, vr1 = r1, vc2 = c2, vr2 = r2;
  if (O.region) {
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    vc1 = cl(Math.min(O.region[0], O.region[2]), c1, c2);
    vr1 = cl(Math.min(O.region[1], O.region[3]), r1, r2);
    vc2 = cl(Math.max(O.region[0], O.region[2]), c1, c2);
    vr2 = cl(Math.max(O.region[1], O.region[3]), r1, r2);
  }
  const vw = vc2 - vc1 + 1, vh = vr2 - vr1 + 1;
  const cv = document.createElement('canvas');
  cv.width = vw * CELL + PAD; cv.height = vh * CELL + PAD;
  const g = cv.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
  const ox = PAD - (vc1 - c1) * CELL, oy = PAD - (vr1 - r1) * CELL;
  const p = roomPaintings.find(q => q.tx === c1 && q.ty === r1);
  if (p && p.img && p.img.naturalWidth) g.drawImage(p.img, ox, oy, w * CELL, h * CELL);

  /* 壁の「理由」。isTileWall と同じ順で見る (岩盤 → 扉 → obstacleTileMask)。 */
  const COLORS = { rock: 'rgba(90,110,200,0.52)', door: 'rgba(255,215,60,0.58)',
                   ring: 'rgba(255,140,20,0.46)', mask: 'rgba(220,30,30,0.42)' };
  /* ★[#46 --outline] 枠だけモードの色。⭐ 塗りと**同じ理由分け** (whyOf) を不透明にしただけ。 */
  const STROKE = { rock: 'rgba(120,150,255,0.95)', door: 'rgba(255,215,60,0.95)',
                   ring: 'rgba(255,150,30,0.95)', mask: 'rgba(255,50,50,0.95)' };
  const tally = { rock: 0, door: 0, ring: 0, mask: 0, floor: 0 };
  const whyOf = (x, y) => {
    if (mapData[y] && mapData[y][x] === 2) return 'rock';
    if (isDoorBlocking(x, y)) return 'door';
    if (obstacleTileMask[y * MAP_W + x] === 1)
      return (y === r1 || y === r2 || x === c1 || x === c2) ? 'ring' : 'mask';
    return null;
  };
  for (let y = r1; y <= r2; y++) {
    for (let x = c1; x <= c2; x++) {
      const why = whyOf(x, y);
      const px = ox + (x - c1) * CELL, py = oy + (y - r1) * CELL;
      if (!why) {
        tally.floor++;
        /* ★[#46 --outline] 床は中心の緑の点だけ = 絵を 1 ピクセルも隠さない。 */
        if (OUTLINE) {
          g.beginPath();
          g.arc(px + CELL / 2, py + CELL / 2, Math.max(1.5, CELL * 0.07), 0, Math.PI * 2);
          g.fillStyle = 'rgba(70,240,110,0.92)'; g.fill();
        }
        continue;
      }
      tally[why]++;
      if (OUTLINE) {
        g.strokeStyle = STROKE[why]; g.lineWidth = 3;
        g.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
      } else {
        g.fillStyle = COLORS[why];
        g.fillRect(px, py, CELL, CELL);
      }
    }
  }
  // 格子 (5 タイルごとに濃く)
  for (let x = 0; x <= w; x++) {
    g.strokeStyle = ((c1 + x) % 5 === 0) ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(ox + x * CELL, oy); g.lineTo(ox + x * CELL, oy + h * CELL); g.stroke();
  }
  for (let y = 0; y <= h; y++) {
    g.strokeStyle = ((r1 + y) % 5 === 0) ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(ox, oy + y * CELL); g.lineTo(ox + w * CELL, oy + y * CELL); g.stroke();
  }
  /* 目盛りは **グローバルなタイル座標**。ユーザーが「(43,9) を空けて」と指せるように。 */
  /* ★[#46] 表示域が狭いときは 1 タイルごとに振る (「(35,8) を塞いで」と 1 マスを指すため)。 */
  const every = (vw <= 20 && vh <= 20) ? 1 : 5;
  g.font = 'bold ' + Math.round(11 * Math.min(SCALE, 2.4)) + 'px monospace'; g.textBaseline = 'middle';
  g.fillStyle = '#9fd8ff';
  for (let x = vc1; x <= vc2; x++) if (x % every === 0) g.fillText(String(x), ox + (x - c1) * CELL + 3, PAD * 0.5);
  for (let y = vr1; y <= vr2; y++) if (y % every === 0) g.fillText(String(y), 2, oy + (y - r1) * CELL + CELL / 2);

  // 黄枠 = 出口タイル (門番が必ず通すマス。扉が閉じている間は door 色になるのが正常)
  const gates = [];
  g.lineWidth = 3;
  for (const dir of ['up', 'down', 'left', 'right']) {
    try {
      const t = nodeGateTile(MAPDEF, dir);
      if (!t) continue;
      gates.push(dir + '(' + t.tx + ',' + t.ty + ')=' + (whyOf(t.tx, t.ty) || 'floor'));
      g.strokeStyle = '#ffdd33';
      g.strokeRect(ox + (t.tx - c1) * CELL + 1.5, oy + (t.ty - r1) * CELL + 1.5, CELL - 3, CELL - 3);
    } catch (e) {}
  }
  /* 印 = 敵スロット。⚠ 受入条件 (c)「敵スロットを 1 つも塞がない」を目で見るための印。
   *   塞ぐと「樽に埋まった敵が alive で残り、ボスを倒してもクエストがクリアしない」になる。 */
  const foes = [];
  try {
    for (const e of enemies) {
      if (!e || !e.def) continue;
      const tx = Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE);
      const ty = Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE);
      const why = whyOf(tx, ty);
      foes.push({ tx: tx, ty: ty, key: e.def.key || e.def.name || '?', boss: !!e.def.isBoss, why: why });
      const cx = ox + (tx - c1) * CELL + CELL / 2, cy = oy + (ty - r1) * CELL + CELL / 2;
      g.beginPath(); g.arc(cx, cy, CELL * 0.30, 0, Math.PI * 2);
      g.fillStyle = e.def.isBoss ? 'rgba(255,60,220,0.95)' : 'rgba(60,200,255,0.95)'; g.fill();
      g.strokeStyle = why ? '#ff2020' : '#003040'; g.lineWidth = why ? 3 : 2; g.stroke();
    }
  } catch (e) {}
  // 緑 = パーティ起点 / 現在地
  try {
    g.strokeStyle = '#5f5'; g.lineWidth = 3;
    g.strokeRect(ox + (START_TX - c1) * CELL + 2, oy + (START_TY - r1) * CELL + 2, CELL - 4, CELL - 4);
    const ptx = Math.floor((playerX + TILE_SIZE / 2) / TILE_SIZE), pty = Math.floor((playerY + TILE_SIZE / 2) / TILE_SIZE);
    g.strokeStyle = '#5f5'; g.lineWidth = 1;
    g.strokeRect(ox + (ptx - c1) * CELL + 6, oy + (pty - r1) * CELL + 6, CELL - 12, CELL - 12);
  } catch (e) {}
  // 水色 = 戦車の乱入位置と体
  let chariot = null;
  try {
    const def = ENEMY_TYPES.goblinChariot;
    const boss = enemies.find(e => e.def && e.def.isBoss);
    if (boss) {
      const bTX = Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE);
      const bTY = Math.floor((boss.y + boss.def.displaySize / 2) / TILE_SIZE);
      const s = findChariotSpawnTile(bTX, bTY);
      if (s) {
        const body = unitBodyTiles(def, s.tx, s.ty);
        g.fillStyle = 'rgba(60,200,255,0.28)';
        for (const t of body) g.fillRect(ox + (t.tx - c1) * CELL, oy + (t.ty - r1) * CELL, CELL, CELL);
        g.strokeStyle = '#3cf'; g.lineWidth = 2;
        g.strokeRect(ox + (s.tx - c1) * CELL + 2, oy + (s.ty - r1) * CELL + 2, CELL - 4, CELL - 4);
        chariot = { spot: s, bodyN: body.length,
                    walls: body.filter(t => isTileWall(t.tx, t.ty)).length,
                    boss: { tx: bTX, ty: bTY } };
      }
    }
  } catch (e) {}
  const pb = window.__paintBlockProbe();
  return { png: cv.toDataURL('image/png'), rect: room.rect, gates: gates, chariot: chariot,
           tally: tally, foes: foes,
           /* ★[#46] 「どこを / どの倍率で / どの描き方で」撮ったかを記録に残す。 */
           view: [vc1, vr1, vc2, vr2], cell: CELL, outline: OUTLINE,
           node: window.__graphRun ? window.__graphRun.nodeId() : null,
           probe: { ring: pb.ring, skipGate: pb.skipGate, applied: pb.applied, ringOff: pb.ringOff } };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_overlay_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: true,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });
  fs.mkdirSync(OUT, { recursive: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(() => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
            sessionStorage.removeItem('dragonfighters.generatedScenario'); } catch (e) {}
      try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    });
    await page.goto('http://localhost:' + PORT + '/index.html?diag=1&intel=0',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction("typeof isTileWall === 'function'", { timeout: 25000 });
    await page.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(1200);                      // 絵の読み込みを待つ (目視用なので待ってよい)
    const closeDialogs = async () => {
      for (let i = 0; i < 12; i++) {
        if (await page.evaluate(() => !skillCheckActive && !dialogPaused)) return;
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
          if (b.length) b[b.length - 1].click();
          const ov = document.getElementById('skillCheckOverlay');
          if (ov && ov.classList.contains('show')) { const r = document.getElementById('scRollBtn'); if (r) r.click(); ov.click(); }
          document.body.click();
        });
        await sleep(320);
      }
    };
    await closeDialogs();

    const shoot = async (label) => {
      const r = await page.evaluate(RENDER, { outline: OUTLINE, scale: SCALE, region: REGION });
      /* ★[#46] 全景と切り出し図が同じ名前で上書きし合わないよう、指定をファイル名へ残す。 */
      const suffix = (OUTLINE ? '_outline' : '')
        + (REGION ? '_r' + REGION.join('-') : '')
        + (SCALE !== 1 ? '_x' + SCALE : '');
      const file = path.join(OUT, 'paint_overlay_' + label + suffix + '.png');
      fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
      console.log('[probe] ' + file);
      console.log('        rect=' + JSON.stringify(r.rect) + ' node=' + r.node +
                  ' 表示域=' + JSON.stringify(r.view) + ' 1タイル=' + r.cell + 'px'
                  + (r.outline ? ' [枠だけ]' : ' [塗りつぶし]') +
                  ' ring=' + r.probe.ring + ' skipGate=' + r.probe.skipGate);
      console.log('        tally=' + JSON.stringify(r.tally));
      console.log('        gates=' + r.gates.join(' '));
      /* ⚠ why が null 以外の敵スロットは受入条件 (c) 違反。0 件が正常。 */
      const bad = r.foes.filter(f => f.why);
      console.log('        foes=' + r.foes.length + ' blocked=' + bad.length +
                  (bad.length ? ' ' + JSON.stringify(bad) : ''));
      console.log('        foeTiles=' + r.foes.map(f => f.key + '(' + f.tx + ',' + f.ty + ')').join(' '));
      console.log('        chariot=' + JSON.stringify(r.chariot));
    };
    if (!ONLY || ONLY === 'n0') await shoot('n0');
    if (!ONLY || ONLY === 'n1') {
      await page.evaluate(() => { window.__ov = window.__graphRun.enter('n1', 'right'); });
      for (let i = 0; i < 160; i++) {
        if (await page.evaluate(() => window.__graphRun.nodeId() === 'n1')) break;
        await sleep(120);
      }
      await closeDialogs();
      await sleep(1200);
      await shoot('n1');
    }
  } catch (e) {
    console.error('[probe] ' + e.message + '\n' + (e.stack || ''));
  }
  await browser.close();
  srv.close();
})();
