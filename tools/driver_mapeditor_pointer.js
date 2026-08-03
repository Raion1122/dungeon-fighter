#!/usr/bin/env node
/*
 * driver_mapeditor_pointer.js — 「クリックした位置」と「実際に効くタイル」が一致することの恒久回帰検出器
 * ═════════════════════════════════════════════════════════════════════════════
 * 対象: map-editor.html の **実マウス経路** (mousedown → localPos() → screenToTile())
 *       と、その前提である「state.css == #stage の実寸」。
 *
 * ■ なぜ 5 本目が要るのか (既存 4 本がすり抜けた理由)
 *   driver_mapeditor / driver_mapdef_step1〜3 は編集を**すべて検証シーム
 *   `E.dragTile([tx,ty], …)` = タイル座標**で叩いている。つまり
 *   「画面のどこをクリックしたらどのタイルになるか」を**一度も通っていない**。
 *   2026-08-03 のユーザー報告「床を塗るときだけ 1 個下のマスを指定しないといけない。
 *   モンスター配置ではズレない」は、まさにこの未検査の経路で起きていた。
 *
 * ■ 真因 (このドライバが守るもの)
 *   #editbar / #filebar / #lintbar / 下部 HUD はすべて flex-wrap:wrap。
 *   中の文字が伸びると**折り返して 1 行増える**:
 *     ・自由タイルのバッジ「⬜ 自由タイル OFF」→「🟩 自由タイル ON (1156 文字)」
 *       で 1024×768 のとき #editbar が 81px → 117px (実測)
 *     ・#hudMsg / #hudInfo は :not(:empty) で枠ごと出るので拒否理由が出ると +4px
 *   → #stage だけが縮む。canvas は CSS で width/height:100% なので**表示だけ**追随し、
 *     state.css と backing store は古いまま = ブラウザが絵を縮めて表示する。
 *     クリック座標は古い座標系で解釈される → **見えているマスより上が塗られる**。
 *   → window resize は起きないので **ResizeObserver でしか捕まえられない**。
 *   ⚠ 塗りツールだけの不具合に見えるが原因はツールに無い。敵スロットが無事だったのは
 *     「敵を置いてもバーの高さが変わらない」からで、経路は完全に共通。
 *
 * ■ 何を測るか
 *   §0 装置    公開シーム / ツールの実在 (assert が空振りしない前提)
 *   §1 レイアウト同期  ★9 viewport × 5 操作で state.css == canvas の実 CSS ボックス
 *   §2 実マウス (塗り) ★**見た目の位置**をクリックして狙ったマスが塗れる (行ズレ 0)
 *   §3 実マウス (敵)   ★同じ検査を敵スロットでも行う (経路が共通であることの確認)
 *   §4 実マウス (筆)   mousedown→move→up のドラッグで両端が狙い通りになる
 *   §E 実行中に pageerror / console.error / 404 が 1 件も出ていないこと
 *
 * ■ 変異負制御 (--mutate <kind>) ★「assert が空振りでない」ことの直接証明
 *     kind          | 注入する欠陥                                  | 落ちるべき節
 *     --------------|-----------------------------------------------|--------------
 *     noresizeobs   | ★ResizeObserver の登録を殺す (= 修正前の状態) | §1 §2 §3 §4
 *     syncnoop      | syncCanvasSize() を初回以降 no-op にする      | §1 §2 §3 §4
 *   ⚠ 置換対象が 0 件 / 2 件以上 なら exit 3 (空振りしたまま PASS を防ぐ)。
 *
 * ■ 作法 (プロジェクト規約)
 *   ⭐ Chrome プロファイルは必ず require('./_pptr_profile') (戻り値は**文字列**)
 *   ⚠ file:// 直開きは不可 → 内蔵 http サーバ
 *   ⚠ /favicon.ico の 404 は URL 単位で除外する
 *   ⚠⚠ **クリック位置は「内部座標」ではなく「見た目の位置」から作る**。
 *     内部座標 (worldToScreen の戻り) をそのまま使うと、壊れた実装でも自己整合して
 *     しまい負のコントロールが空振りする。実際に人が見てクリックする点は
 *       visual = internal * (canvas の実 CSS 寸 / state.css)
 *     ここがこのドライバの心臓部。
 *
 * ■ 使い方
 *     node tools/driver_mapeditor_pointer.js [--headful] [--port N] [--browser <path>]
 *                                            [--mutate noresizeobs|syncnoop]
 *   exit 0 = 全 PASS / 1 = FAIL あり / 2 = 環境不備 / 3 = 変異の置換が空振り
 *            4 = 変異を入れたのに全 PASS (= 負のコントロールが死んでいる)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8955'), 10);
const MUTATE = arg('mutate', null);

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ★本命。ResizeObserver の登録だけを殺す = 2026-08-03 の修正を入れる前と同じ状態。 */
  noresizeobs: [
    ['  if (typeof ResizeObserver === "function") {\n    new ResizeObserver(function () { resizeCanvas(); }).observe(stage);',
     '  if (false) {\n    new ResizeObserver(function () { resizeCanvas(); }).observe(stage);'],
  ],
  /* 寸法の再測定そのものを殺す (fitToView 側の測り直しも同時に無効化される)。 */
  syncnoop: [
    ['    if (w === state.css.w && h === state.css.h && dpr === state.css.dpr) return false;',
     '    if (state.css.w > 0) return false;'],
  ],
};
const MUTATE_TARGETS = ['map-editor.html'];
let _mutatedCache = null;
function mutatedSources() {
  if (_mutatedCache) return _mutatedCache;
  const rules = MUTATIONS[MUTATE];
  if (!rules) {
    console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
    process.exit(3);
  }
  const orig = {}, out = {};
  for (const rel of MUTATE_TARGETS) orig[rel] = out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of rules) {
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    if (hits.length !== 1) {
      console.error('[drv] ⛔ 変異の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイルに重複') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
  }
  console.log('[drv] ★変異負制御 --mutate ' + MUTATE + ' を注入して配信します');
  _mutatedCache = out;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
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
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const IGNORED_URL_RE = /\/favicon\.ico(\?|$)/;

function startServer(port, root) {
  const rec = { notFound: [] };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (MUTATE && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]); return;
        }
        const fp = path.join(root, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          if (!IGNORED_URL_RE.test(u)) rec.notFound.push(u);
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve({ srv, rec }));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const fails = [];
function mark(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 60 - t.length))); }
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '   [' + detail + ']' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
  return ok;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function bootPage(browser, url, W, H) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.setViewport({ width: W, height: H });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__mapEditor, { timeout: 20000, polling: 50 });
  await sleep(400);                                   // カタログ fetch / パレット描画の落ち着き待ち
  return { page, errs };
}

/* 内部寸法 (state.css) と canvas の実 CSS ボックスを両方読む。 */
const readGeom = (page) => page.evaluate(() => {
  const E = window.__mapEditor, r = E.canvas.getBoundingClientRect();
  return { cssW: E.state.css.w, cssH: E.state.css.h,
           rectW: +r.width.toFixed(2), rectH: +r.height.toFixed(2),
           editbar: +document.getElementById('editbar').getBoundingClientRect().height.toFixed(1) };
});

/* ★心臓部: 人が「見て」クリックする点 (viewport 座標) を返す。
 *   internal = worldToScreen(...)                 ← エディタが自分の座標系で思っている位置
 *   visual   = internal * (実 CSS 寸 / state.css) ← backing store が伸縮して見える位置
 *   実装が正しければ両者は一致する。壊れていると一致しない = ここで差が出る。 */
const visualPointOfTile = (page, tx, ty) => page.evaluate((tx, ty) => {
  const E = window.__mapEditor, r = E.canvas.getBoundingClientRect();
  const t = E.state.mapDef.grid.tile;
  const p = E.worldToScreen((tx + 0.5) * t, (ty + 0.5) * t);
  const sx = r.width / E.state.css.w, sy = r.height / E.state.css.h;
  return { x: r.left + p.x * sx, y: r.top + p.y * sy,
           inside: (p.x * sx >= 0 && p.x * sx < r.width && p.y * sy >= 0 && p.y * sy < r.height) };
}, tx, ty);

const readTiles = (page) => page.evaluate(() => {
  const E = window.__mapEditor;
  const m = E.MapDef.expandTiles(E.getMapDef());
  return m ? m.map(row => row.join('')).join('\n') : null;
});
function diffTiles(a, b) {
  if (!a || !b) return null;
  const A = a.split('\n'), B = b.split('\n'), out = [];
  for (let r = 0; r < B.length; r++)
    for (let c = 0; c < B[r].length; c++)
      if (!A[r] || A[r][c] !== B[r][c]) out.push([c, r]);
  return out;
}
const readSlots = (page) => page.evaluate(() =>
  window.__mapEditor.getMapDef().rooms.map(r => r.enemySlots.map(s => s[0] + ',' + s[1])));

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
const SIZES = [[1920, 1080], [1536, 864], [1440, 900], [1366, 768], [1280, 800],
               [1200, 800], [1100, 800], [1024, 768], [960, 800]];

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = makeProfile('df_ptr_');

  let srv = null, browser = null, rec = null;
  const allErrs = [];
  try {
    const a = await startServer(PORT, ROOT);
    srv = a.srv; rec = a.rec;
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] root=' + ROOT + '  ' + BASE);
    console.log('[drv] mutate=' + (MUTATE || 'なし'));

    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: HEADFUL ? false : 'new',
      userDataDir: profile,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    // ══════════════════════════════════════════════════════════════════════
    mark('§0 装置の前提 (assert が空振りしないこと)');
    {
      const b = await bootPage(browser, BASE + '/map-editor.html', 1024, 768);
      allErrs.push(...b.errs);
      const keys = await b.page.evaluate(() => Object.keys(window.__mapEditor));
      check('§0 0a 検証シーム window.__mapEditor がある', keys.length > 0, keys.length + ' キー');
      for (const need of ['setTool', 'worldToScreen', 'canvas', 'state', 'getMapDef', 'MapDef', 'bakeTiles'])
        check('§0 0b シーム ' + need + ' がある', keys.indexOf(need) >= 0);
      const tools = await b.page.evaluate(() =>
        Array.prototype.map.call(document.querySelectorAll('#toolBtns button'), el => el.textContent));
      check('§0 0c ツールに「タイルを塗る」と「敵スロット」がある (§2/§3 の母集団)',
        tools.indexOf('タイルを塗る') >= 0 && tools.indexOf('敵スロット') >= 0, tools.join('/'));
      await b.page.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§1 レイアウト同期 — state.css が #stage の実寸と常に一致する');
    /* ⚠⚠ ここがズレると「見えている位置」と「クリックが効く位置」が食い違う。
     *   バーの高さを変える操作を順に行い、そのたびに一致を要求する。 */
    for (const [W, H] of SIZES) {
      const b = await bootPage(browser, BASE + '/map-editor.html', W, H);
      allErrs.push(...b.errs);
      const page = b.page;
      const ops = [];
      ops.push(['起動直後', await readGeom(page)]);

      await page.evaluate(() => window.__mapEditor.setTool('brush'));
      await sleep(80);
      ops.push(['brush 選択', await readGeom(page)]);

      // 一筆 = 焼き固め → バッジ文言が伸びて #editbar が折り返しうる
      await page.evaluate(() => window.__mapEditor.dragTile([20, 20], [24, 20]));
      await sleep(140);
      ops.push(['一筆塗る', await readGeom(page)]);

      await page.evaluate(() => { const el = document.getElementById('btnLint'); if (el) el.click(); });
      await sleep(160);
      ops.push(['出発前チェック', await readGeom(page)]);

      // HUD の拒否理由 (:not(:empty) で枠ごと出る)
      await page.evaluate(() => { window.__mapEditor.state.lastReason = 'テスト: マップの外は塗れません'; });
      await page.evaluate(() => window.__mapEditor.dragTile([21, 21], [21, 21]));
      await sleep(140);
      ops.push(['HUD にメッセージ', await readGeom(page)]);

      const bad = ops.filter(([, g]) => Math.abs(g.cssH - g.rectH) > 0.5 || Math.abs(g.cssW - g.rectW) > 0.5);
      check('§1 ' + W + '×' + H + ' 5 操作すべてで state.css == canvas 実寸',
        bad.length === 0,
        bad.length ? bad.map(([n, g]) => n + ' Δh=' + (g.cssH - g.rectH).toFixed(1)).join(' / ')
                   : 'editbar ' + ops[0][1].editbar + '→' + ops[4][1].editbar + 'px でも一致');
      await page.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§2 実マウス経路 (塗り) — 見た目の位置をクリックして狙ったマスが塗れる');
    /* ⚠ 1024×768 は #editbar が実際に折り返す幅 (81px→117px を実測済み)。
     *   ここで測らないと、修正前の欠陥が再現しないサイズだけ見て PASS してしまう。 */
    {
      const b = await bootPage(browser, BASE + '/map-editor.html', 1024, 768);
      allErrs.push(...b.errs);
      const page = b.page;

      // 先に焼き固めておく = バッジが伸びてレイアウトが動いた**後**の状態で測る
      await page.evaluate(() => { window.__mapEditor.setTool('brush'); window.__mapEditor.bakeTiles(); });
      await sleep(250);
      await page.evaluate(() => { window.__mapEditor.setTileBrushValue(1); window.__mapEditor.setTileBrushSize(1); });
      await sleep(80);

      const g = await readGeom(page);
      console.log('  [ref] editbar=' + g.editbar + 'px / cssH=' + g.cssH + ' rectH=' + g.rectH);

      /* 対象タイル: 現在 壁(2) の所を レア床(1) で塗る = 必ず値が変わる。
       * ⚠ 行を上下に散らす。canvas 上端では欠陥があってもズレ量が 0 に近く、
       *   上端だけ見ると壊れた実装でも PASS してしまう。 */
      const targets = await page.evaluate(() => {
        const E = window.__mapEditor;
        const m = E.MapDef.expandTiles(E.getMapDef());
        const out = [];
        if (!m) return out;
        for (const row of [3, 8, 13, 18, 24])
          for (let c = 6; c < 66; c++) if (m[row][c] === 2) { out.push([c, row]); break; }
        return out;
      });
      check('§2 2a 対象タイルが 5 個そろっている (母集団が空でない)', targets.length === 5,
        JSON.stringify(targets));

      for (const [tx, ty] of targets) {
        const before = await readTiles(page);
        const pt = await visualPointOfTile(page, tx, ty);
        if (!pt.inside) {
          check('§2 見た目 tile(' + tx + ',' + ty + ') をクリック → そのマスだけが塗れる', false,
            '見た目の点が canvas の外に出た'); continue;
        }
        await page.mouse.click(pt.x, pt.y);
        await sleep(130);
        const d = diffTiles(before, await readTiles(page));
        const ok = !!d && d.length === 1 && d[0][0] === tx && d[0][1] === ty;
        check('§2 見た目 tile(' + tx + ',' + ty + ') をクリック → そのマスだけが塗れる', ok,
          ok ? '行ズレ 0 / 列ズレ 0'
             : (d && d.length ? '実際は ' + JSON.stringify(d[0]) + ' (行ズレ ' + (d[0][1] - ty) + ')'
                              : '1 マスも塗れていない'));
      }
      await page.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§3 実マウス経路 (敵スロット) — 塗りと同じ経路であることの確認');
    {
      const b = await bootPage(browser, BASE + '/map-editor.html', 1024, 768);
      allErrs.push(...b.errs);
      const page = b.page;
      // 塗りと同じ条件にする (焼き固め後 = バーが伸びた状態)
      await page.evaluate(() => { window.__mapEditor.setTool('brush'); window.__mapEditor.bakeTiles(); });
      await sleep(250);
      await page.evaluate(() => window.__mapEditor.setTool('enemySlot'));
      await sleep(80);

      /* 部屋の中で、まだスロットが無いタイルを 3 つ選ぶ (敵スロットは部屋の中にしか置けない)。 */
      const targets = await page.evaluate(() => {
        const d = window.__mapEditor.getMapDef(), out = [];
        for (const room of d.rooms) {
          const r0 = room.rect[0], c0 = room.rect[1], r1 = room.rect[2], c1 = room.rect[3];
          const used = {};
          for (const s of room.enemySlots) used[s[0] + ',' + s[1]] = 1;
          for (let r = r0 + 1; r < r1 && out.length < 3; r++)
            for (let c = c0 + 1; c < c1; c++)
              if (!used[c + ',' + r]) { out.push([c, r]); break; }
          if (out.length >= 3) break;
        }
        return out;
      });
      check('§3 3a 対象タイルが 3 個そろっている (母集団が空でない)', targets.length === 3,
        JSON.stringify(targets));

      for (const [tx, ty] of targets) {
        const before = await readSlots(page);
        const pt = await visualPointOfTile(page, tx, ty);
        if (!pt.inside) {
          check('§3 見た目 tile(' + tx + ',' + ty + ') をクリック → そのマスに敵スロットが乗る', false,
            '見た目の点が canvas の外に出た'); continue;
        }
        await page.mouse.click(pt.x, pt.y);
        await sleep(150);
        const after = await readSlots(page);
        const added = [];
        for (let i = 0; i < after.length; i++)
          for (const s of after[i]) if (!before[i] || before[i].indexOf(s) < 0) added.push(s);
        const ok = added.length === 1 && added[0] === tx + ',' + ty;
        check('§3 見た目 tile(' + tx + ',' + ty + ') をクリック → そのマスに敵スロットが乗る', ok,
          ok ? '行ズレ 0 / 列ズレ 0' : '実際は ' + JSON.stringify(added));
      }
      await page.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§4 実マウス経路 (ドラッグ) — 押した点と離した点が狙い通り');
    {
      const b = await bootPage(browser, BASE + '/map-editor.html', 1024, 768);
      allErrs.push(...b.errs);
      const page = b.page;
      await page.evaluate(() => { window.__mapEditor.setTool('brush'); window.__mapEditor.bakeTiles(); });
      await sleep(250);
      await page.evaluate(() => { window.__mapEditor.setTileBrushValue(1); window.__mapEditor.setTileBrushSize(1); });
      await sleep(80);

      const A = [8, 4], B = [8, 24];                  // ★縦のドラッグ = 行ズレが最も出る向き
      const before = await readTiles(page);
      const pa = await visualPointOfTile(page, A[0], A[1]);
      const pb = await visualPointOfTile(page, B[0], B[1]);
      await page.mouse.move(pa.x, pa.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++)
        await page.mouse.move(pa.x + (pb.x - pa.x) * i / 8, pa.y + (pb.y - pa.y) * i / 8);
      await page.mouse.up();
      await sleep(180);
      const d = diffTiles(before, await readTiles(page));
      const rows = d ? d.map(p => p[1]) : [];
      const ok = !!d && d.length > 0 &&
                 Math.min.apply(null, rows) === A[1] && Math.max.apply(null, rows) === B[1] &&
                 d.every(p => p[0] === A[0]);
      check('§4 縦ドラッグ (8,4)→(8,24) の塗り範囲が狙い通り (端が 1 行もはみ出さない)', ok,
        d && d.length ? ('列=' + Object.keys(d.reduce((o, p) => (o[p[0]] = 1, o), {})).join(',') +
                         ' / 行 ' + Math.min.apply(null, rows) + '〜' + Math.max.apply(null, rows) +
                         ' (狙い ' + A[1] + '〜' + B[1] + ')') : '1 マスも塗れていない');
      await page.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§E コンソール健全性');
    check('§E pageerror / console.error が 0 件', allErrs.length === 0,
      allErrs.length ? allErrs.slice(0, 4).join(' | ') : 'なし');
    check('§E 404 が 0 件 (favicon 除く)', rec.notFound.length === 0,
      rec.notFound.length ? rec.notFound.slice(0, 4).join(' | ') : 'なし');

  } catch (e) {
    console.error('\n[drv] 例外: ' + ((e && e.stack) || e));
    fail++; fails.push('driver exception');
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }

  console.log('\n' + '═'.repeat(72));
  console.log('  PASS ' + pass + ' / FAIL ' + fail + '  (合計 ' + (pass + fail) + ')');
  if (fail) console.log('  落ちた assert:\n    - ' + fails.join('\n    - '));
  console.log('═'.repeat(72));

  if (MUTATE && fail === 0) {
    console.error('[drv] ⛔ 変異 ' + MUTATE + ' を入れたのに全 PASS = 負のコントロールが死んでいる');
    process.exit(4);
  }
  process.exit(fail ? 1 : 0);
})();
