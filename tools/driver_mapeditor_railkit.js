#!/usr/bin/env node
/*
 * driver_mapeditor_railkit.js — 「つながる線路 (railKit) + Undo ボタンの可視化」の恒久回帰検出器
 *                               = マップエディタ Phase 6 STEP 2.5
 * ═════════════════════════════════════════════════════════════════════════════
 * ■ ユーザーが名指しした要望は 2 つ (逐語)
 *   ①「線路の情景物で、現状は縦しかないけど、横や曲がる部分なども欲しい
 *      (**プラレールみたいに上下左右つなげれる構造**)」
 *   ②「一個、タイルをセットしたあと、など行動をしたあと、**１個戻るボタン**が欲しいです」
 *   → ① は §1〜§5 と §G、② は §7 が守る。どちらも「壊れても気づけない」形で壊れる:
 *      ① は displayMax がマス (96) からずれると絵の接続点が合わず「つながらない」
 *         (数値は 1 つも例外を出さない。見た目だけが静かに壊れる) → §1 1f と §G。
 *      ② は #editbar が flex-wrap なので、CSS の order 1 つ / 要素 1 個の挿入で
 *         最終行へ押し出され、DOM 順は正しいまま**画面では埋もれる** → §7。
 *
 * ■ 対象 (3 ファイルにまたがる 1 本の鎖)
 *   index.html        … SCENERY_SHEETS.railKit (src / blocking / displayMax:96 / flat)
 *                       SCENERY_FRAMES.railKit (512 角セル 6 個)。★SCENERY_RECIPES からは
 *                       参照しない = 既定 6 シナリオは 1 ドットも変わらない (§6)
 *   js/df-mapdef.js   … 接続規則の**唯一の正**。railVariantForMask / railKitMaskAt /
 *                       railKitRelinkAt / railKitRelinkAround (すべて純関数)
 *   map-editor.html   … autoLinkRails() が唯一の呼び口 (置く/動かす/消す/種を差し替える の
 *                       4 経路 6 箇所)、「線路・水路を自動でつなぐ」チェック (既定 ON)、#histBtns の位置
 *
 * ■ 何を測るか
 *   §0 装置   公開 API / 検証シーム / DOM / 定数 (assert が空振りしない前提)
 *   §1 カタログ ★identity で測る (件数ではない)。★displayMax が 96 でなければ赤くなる
 *   §2 純関数 ★mask 0〜15 の**全 16 通り** + variant 往復 + 変な入力 + 冪等性
 *   §3 実地   ★★**実マウス** (mousedown/move/up) と**実キーボード**だけで敷く。
 *             直線 / L 字 / 削除 / 移動 / T 字・十字 / OFF / 他種 の 7 本立て
 *   §4 Undo   ★実キーボード Ctrl+Z 一発で「置いた物」も「近傍の化け」も戻る
 *   §5 往復   export→import で 1 バイトも変わらない / ★矛盾する variant を矯正しない
 *   §6 非退行 ★既定 6 シナリオは railKit を 1 個も持たない (レシピにも本編にも)
 *   §7 Undo ボタン ★ユーザー要望②。#editbar の先頭・先頭行・前に 0 個 (3 viewport)
 *   §8 pickProp ★★**パレットの実クリック**で種類を差し替えても自動接続が走る (判断B)
 *   §G 絵     ★golden 方式 (tools/_golden.js)。敷いた線路の見た目 5 シーンの SHA-256
 *   §E pageerror / console.error / 意図しない 404 が 0 件
 *
 * ■ ⚠⚠ ベースラインに 2 役を兼務させない (2026-08-03 の恒久教訓)
 *   非退行 = **golden** (`--update-golden` で更新 → git diff に載る → commit でレビュー)。
 *   負のコントロール = **変異注入** (--mutate)。固定コミットとの絵の比較は、幾何を
 *   意図的に動かした瞬間に自己失効して「赤いまま安定」する = 何も検出しなくなる。
 *
 * ■ 変異負制御 (--mutate <kind>) — ★狙う節をずらして 5 種
 *     kind        | 注入する欠陥                                  | 落ちるべき節
 *     ------------|-----------------------------------------------|--------------
 *     nolink      | autoLinkRails() を常に 0 で返す (自動接続を殺す)| §3 (+§4 §8 §G)
 *     nofallback  | 純関数の②「北南を含む→縦」を消す              | §2 §3 (T字/十字だけ)
 *     dispmax     | railKit の displayMax を 96 → 128             | §1 §G
 *     historder   | #histBtns に CSS order:99 (画面上だけ最後尾へ) | §7
 *     recipe      | 既定 6 シナリオのレシピに railKit を混ぜる     | §6
 *   ⚠ 置換対象が 0 件 / 2 件以上なら exit 3 (空振りしたまま PASS を防ぐ)。
 *   ⚠⚠ **置換文字列は必ず 1 行に収めること**。作業ツリーは index.html = CRLF、
 *      js/df-mapdef.js と map-editor.html = LF の**混在**で、"\n" を含む複数行の
 *      置換は CRLF 側で原理的に一致せず exit 3 で空振りする (2026-08-04 に実際に踏んだ)。
 *
 * ■ 使い方
 *     node tools/driver_mapeditor_railkit.js [--headful] [--port N] [--browser <path>]
 *          [--mutate nolink|nofallback|dispmax|historder|recipe] [--update-golden]
 *   exit 0 = 全 PASS / 1 = FAIL / 2 = 環境不備 / 3 = 変異の空振り / 4 = 変異したのに全 PASS
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
/* ⚠ ポートは既存ドライバと 4 以上空ける (baseline 用に port+1 を掴む本がある)。
 *   ⚠ 2026-08-04 実測で修正: 旧コメントは 8911 / 8941 / 8991 / 8995 を「使用済み」と書いていたが、
 *     `grep -rn "arg('port'" tools/*.js` で数え上げると**どれも実体が無い**空き番だった。
 *     空いている番号を「埋まっている」と書くと、新しいドライバが理由もなく遠くへ追いやられる。
 *   マップエディタ系の実使用: 8861 (mapeditor) / 8901(+8902) (mapdef_step1) / 8921 (mapdef_step2) /
 *     8931 (本ドライバ) / 8941 (mapeditor_waterkit) / 8951 (mapdef_step3) / 8955 (pointer) /
 *     8965 (texture) / 8985 (props と painting が**重複**。並列時は片方へ --port を渡すこと) */
const PORT = parseInt(arg('port', '8931'), 10);
const MUTATE = arg('mutate', null);

const UPDATE_GOLDEN = flag('update-golden');
const G = require('./_golden')('mapeditor_railkit',
  { update: UPDATE_GOLDEN, driver: 'driver_mapeditor_railkit' });

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ① 自動接続そのものを殺す。→ パレットで選んだ形が置きっぱなしになり「つながらない」。
   *    ⚠ 1 行に収める (関数の中身を消すのではなく、条件行の後ろに無条件 return を足す)。 */
  nolink: [
    ['    if (!state.propAutoLink) return 0;',
     '    if (!state.propAutoLink) return 0; return 0;   /* ★変異: 自動接続を殺す */'],
  ],
  /* ② フォールバック表の②「北と南を両方含む → 縦」だけを消す。
   *    → mask 7 / 13 / 15 (T 字 3 種と十字) が null = 「変更しない」に落ちる。
   *    ⭐ nolink より**狭く**効く = 節の切り分けができていることの証明。 */
  nofallback: [
    ['    if ((m & (RAIL_N | RAIL_S)) === (RAIL_N | RAIL_S)) return 0;   // ② 7 / 13 / 15',
     '    /* ★変異: フォールバック② を削除 (T 字/十字が null に落ちる) */'],
  ],
  /* ③ 描画サイズをマス (96) からずらす。→ 絵はそのままだが接続点がマスの境界に来なくなり、
   *    敷いても線がつながって見えない。**数値では例外が 1 つも出ない**種類の欠陥。 */
  /*    ⚠⚠ STEP 3 で waterKit が同じ書式で並んだので、素の 'displayMax: 96, flat: true,' は
   *      **2 件ヒットして exit 3 (空振り)** になる。→ index.html 側で各キットの displayMax を
   *      **種キー + src と同じ行**に置いて一意にし、ここは **railKit 限定の 1 行**を狙う。 */
  dispmax: [
    ['      railKit: { src: "assets/mine_rail_kit.png", displayMax: 96, flat: true,',
     '      railKit: { src: "assets/mine_rail_kit.png", displayMax: 128, flat: true,   /* ★変異 */'],
  ],
  /* ④ ユーザー要望② の破壊。DOM 順は正しいまま、CSS の order だけで最後尾へ送る。
   *    → 「DOM を見て安心する」assert では捕まらず、**実描画位置**を測る assert だけが落ちる。 */
  historder: [
    ['    flex: 0 0 auto; white-space: nowrap;',
     '    flex: 0 0 auto; white-space: nowrap; order: 99;   /* ★変異: 画面上だけ最後尾へ */'],
  ],
  /* ⑤ 既定 6 シナリオのレシピに railKit を混ぜる。→ 廃坑の山場に散布線路が湧く =
   *    「mapDef.props 専用の別種」という設計が崩れる。既存マップの見た目が変わる。 */
  recipe: [
    ['counts: { rubble: 18, rail: 7, cart: 4 }', 'counts: { rubble: 18, rail: 7, cart: 4, railKit: 6 }'],
  ],
};
const MUTATE_TARGETS = ['index.html', 'js/df-mapdef.js', 'map-editor.html'];
let _mutatedCache = null;
function mutatedSources() {
  if (_mutatedCache) return _mutatedCache;
  const rules = MUTATIONS[MUTATE];
  if (!rules) {
    console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
    process.exit(3);
  }
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of rules) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
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
  const rec = { notFound: [], served: 0 };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (MUTATE && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          rec.served++;
          res.end(mutatedSources()[rel]); return;
        }
        const fp = path.join(root, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          if (!IGNORED_URL_RE.test(u)) rec.notFound.push(u);
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        rec.served++;
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
function mark(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 66 - t.length))); }
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '   [' + detail + ']' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
  return ok;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const J = (v) => JSON.stringify(v);
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const isHex64 = (s) => /^[0-9a-f]{64}$/.test(String(s));
// variant を目で読める記号に (0 縦 / 1 横 / 2 北東 / 3 東南 / 4 南西 / 5 西北)
const GLYPH = ['|', '-', 'NE', 'ES', 'SW', 'WN'];
const show = (items) => items.map(i => i.tx + ',' + i.ty + '=' + i.variant + (GLYPH[i.variant] || '?')).join(' ');

// ══════════════════════════════════════════════════════════════════════════════
// Node 側で index.html を**独立に**パースして期待値を作る
//   ★df-mapdef.js の実装を通さずに素の index.html から読む。
//   ⚠ 読むのは**作業ツリーのファイル** = --mutate で配信を差し替えても、ここは元のまま。
//     よって dispmax 変異では「素の index.html の 96」対「ブラウザの 128」で必ず食い違う。
// ══════════════════════════════════════════════════════════════════════════════
function sliceBraces(text, from) {
  const i = text.indexOf('{', from);
  if (i < 0) return null;
  let d = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return text.slice(i, j + 1); }
  }
  return null;
}
function evalLiteral(src) {
  // SCENERY_SHEETS のリテラルは new Image() を含む = ブラウザ前提。Node 用に stub する。
  // eslint-disable-next-line no-new-func
  return new Function('Image', 'return (' + src + ');')(function () { return {}; });
}
function readIndex() {
  const text = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const iS = text.indexOf('const SCENERY_SHEETS = {');
  const iF = text.indexOf('const SCENERY_FRAMES = {');
  const iR = text.indexOf('const SCENERY_RECIPES = {');
  if (iS < 0 || iF < 0 || iR < 0) {
    console.error('[drv] index.html に SCENERY_SHEETS / FRAMES / RECIPES が揃っていない'); process.exit(2);
  }
  return {
    text,
    sheets: evalLiteral(sliceBraces(text, iS)),
    frames: evalLiteral(sliceBraces(text, iF)),
    recipes: evalLiteral(sliceBraces(text, iR)),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 実マウス / 実キーボードのヘルパ
//   ⚠⚠ 既存 4 本が不具合を素通しした真因は「編集を全部 dragTile シームで叩き、
//     実マウス経路を一度も通していなかった」こと。§3 と §4 は必ずここを通す。
// ══════════════════════════════════════════════════════════════════════════════
const HOT = { sx: 300, sy: 250 };     // クリックする canvas 内の固定位置 (css px)
const CLICK_ZOOM = 0.5;

/* タイル (tx,ty) の中心が canvas の (HOT.sx, HOT.sy) に来るように view を寄せ、
 * その点の client 座標を返す。★view を動かすのはユーザーのパンと同じ操作なので
 * 「実マウス経路を通していない」ことにはならない (押す→離すは必ず実マウス)。 */
async function aimTile(page, tx, ty) {
  return page.evaluate((tx, ty, hot, zoom) => {
    const E = window.__mapEditor;
    const t = E.state.mapDef.grid.tile;
    E.state.view.zoom = zoom;
    E.state.view.x = (tx + 0.5) * t - hot.sx / zoom;
    E.state.view.y = (ty + 0.5) * t - hot.sy / zoom;
    E.render();
    const c = document.getElementById('editorCanvas').getBoundingClientRect();
    return { x: c.left + hot.sx, y: c.top + hot.sy,
             fits: c.width >= hot.sx + 40 && c.height >= hot.sy + 40,
             cw: Math.round(c.width), ch: Math.round(c.height) };
  }, tx, ty, HOT, CLICK_ZOOM);
}
async function mouseClickTile(page, tx, ty) {
  const p = await aimTile(page, tx, ty);
  if (!p.fits) throw new Error('canvas が小さすぎて実マウスが打てない: ' + p.cw + 'x' + p.ch);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(20);
  return p;
}
/* 実マウスのドラッグ移動: (fx,fy) を掴んで (tx,ty) で離す。
 * ⚠ 掴んだあとに view を動かすと掴んだ点がずれるので、先に移動元を狙ってから
 *   移動先の screen 座標を**同じ view のまま**計算する。 */
async function mouseDragTile(page, fx, fy, tx, ty) {
  const p = await aimTile(page, fx, fy);
  if (!p.fits) throw new Error('canvas が小さすぎる');
  const q = await page.evaluate((tx, ty) => {
    const E = window.__mapEditor;
    const t = E.state.mapDef.grid.tile, v = E.state.view;
    const c = document.getElementById('editorCanvas').getBoundingClientRect();
    const sx = ((tx + 0.5) * t - v.x) * v.zoom, sy = ((ty + 0.5) * t - v.y) * v.zoom;
    return { x: c.left + sx, y: c.top + sy, inside: sx >= 0 && sy >= 0 && sx < c.width && sy < c.height };
  }, tx, ty);
  if (!q.inside) throw new Error('移動先が画面外: ' + tx + ',' + ty);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2);
  await page.mouse.move(q.x, q.y);
  await page.mouse.up();
  await sleep(20);
  return q;
}
async function pressCtrlZ(page) {
  await page.evaluate(() => { document.getElementById('editorCanvas').focus(); });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await sleep(80);
}
async function pressDelete(page) {
  await page.evaluate(() => { document.getElementById('editorCanvas').focus(); });
  await page.keyboard.press('Delete');
  await sleep(80);
}

// ══════════════════════════════════════════════════════════════════════════════
// §G 用のシーン定義 (すべて既定ダンジョンの部屋 r0 = rect [7,24,20,43] = row 7-20 / col 24-43)
//   ⭐ view を明示的に決めて canvas の (0,0) から 600x480 を切り出す。
//     worldToScreen は view だけで決まり canvas の大きさに依存しないので、
//     切り出し内容は**エディタバーの折り返し具合に左右されない**。
// ══════════════════════════════════════════════════════════════════════════════
const CROP = { w: 600, h: 480 };
const SCENES = [
  { key: 'L', label: 'L 字', brush: 0, autoLink: true, zoom: 1,
    vx: 27 * 96, vy: 9 * 96,
    lay: [[28, 10], [29, 10], [30, 10], [30, 11], [30, 12]],
    expect: [1, 1, 4, 0, 0] },
  { key: 'S', label: 'S 字', brush: 0, autoLink: true, zoom: 1,
    vx: 32 * 96, vy: 8 * 96,
    lay: [[33, 9], [34, 9], [35, 9], [35, 10], [35, 11], [36, 11], [37, 11]],
    expect: [1, 1, 4, 0, 2, 1, 1] },
  /* ★brush を 2 (北東カーブ) にしてある = フォールバック表が効かないと形が変わる。
   *   これで --mutate nofallback が §G でも赤くなる (T 字/十字は②に落ちるので)。 */
  { key: 'X', label: '十字', brush: 2, autoLink: true, zoom: 1,
    vx: 31 * 96, vy: 13 * 96,
    lay: [[33, 14], [33, 16], [32, 15], [34, 15], [33, 15]],
    expect: [0, 0, 1, 1, 0] },
  { key: 'T', label: 'T 字', brush: 2, autoLink: true, zoom: 1,
    vx: 36 * 96, vy: 14 * 96,
    lay: [[38, 15], [38, 17], [39, 16], [38, 16]],
    expect: [0, 0, 1, 0] },
  /* ★6 ピースの絵そのものの非退行。自動接続 OFF なので隣り合っていても化けない。 */
  { key: 'P6', label: '6 ピース素貼り', brush: null, autoLink: false, zoom: 1,
    vx: 25.7 * 96, vy: 10 * 96,
    lay: [[26, 12, 0], [27, 12, 1], [28, 12, 2], [29, 12, 3], [30, 12, 4], [31, 12, 5]],
    expect: [0, 1, 2, 3, 4, 5] },
];

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = makeProfile('df_railkit_');
  const IDX = readIndex();

  let srv = null, browser = null, rec = null;
  const allErrs = [];
  const BASE = 'http://127.0.0.1:' + PORT;
  try {
    const a = await startServer(PORT, ROOT);
    srv = a.srv; rec = a.rec;
    console.log('[drv] root=' + ROOT + '  ' + BASE);
    console.log('[drv] mutate=' + (MUTATE || 'なし') + '  golden=' + (UPDATE_GOLDEN ? '★記録モード' : G.rel));
    console.log('[drv] index.html から独立に読んだ railKit: 枠 ' +
      (IDX.frames.railKit || []).length + ' 個 / displayMax=' + IDX.sheets.railKit.displayMax);

    browser = await puppeteer.launch({
      executablePath: browserPath, headless: HEADFUL ? false : 'new',
      userDataDir: profile, args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    page.on('pageerror', e => allErrs.push('pageerror: ' + ((e && e.message) || e)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text()))
      allErrs.push('console.error: ' + m.text()); });
    // ⚠ deviceScaleFactor は必ず 1 (dpr が変わると canvas の裏バッファが変わり golden が揺れる)
    await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1 });
    await page.goto(BASE + '/map-editor.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__mapEditor && window.__mapEditor.MapDef),
      { timeout: 20000, polling: 50 });
    await page.waitForFunction(() => {
      const M = window.__mapEditor.MapDef;
      return !!(M.getScenerySheets && M.getScenerySheets() && M.getSceneryFrames());
    }, { timeout: 20000, polling: 50 });
    await sleep(300);

    // ページ側の共通ヘルパ
    await page.evaluate(() => {
      const E = window.__mapEditor;
      window.__t = {
        reset(autoLink) {
          E.loadPreset('dungeon');
          E.setTool('prop');
          E.setPropAutoLink(autoLink === undefined ? true : !!autoLink);
          E.setPropScaleRef(false);
          E.hoverTile(null);
        },
        lay(list, v) {          // シーム経路 (§1/§2/§5/§G 用。§3・§4 は実マウス)
          const out = [];
          for (const item of list) {
            const tx = item[0], ty = item[1];
            const vv = (item.length > 2) ? item[2] : v;
            E.setPropBrush('railKit', vv);
            out.push(E.placeProp(tx, ty).ok);
          }
          return out;
        },
        items() { return E.propInfo().items.map(i => ({ kind: i.kind, variant: i.variant, tx: i.tx, ty: i.ty })); },
        at(tx, ty) { const f = this.items().filter(i => i.tx === tx && i.ty === ty); return f.length ? f[0].variant : null; },
        variants() { return this.items().map(i => i.variant); },
      };
    });

    // ══════════════════════════════════════════════════════════════════════
    mark('§0 装置 — assert が空振りしない前提');
    {
      const d0 = await page.evaluate(() => {
        const E = window.__mapEditor, M = E.MapDef;
        const q = (id) => document.getElementById(id);
        return {
          fnMissing: ['railVariantForMask', 'railKitMaskAt', 'railKitRelinkAt', 'railKitRelinkAround',
                      'propEntries', 'propDrawSize', 'propFootprint', 'propBlocking']
                     .filter(k => typeof M[k] !== 'function'),
          seamMissing: ['setPropBrush', 'placeProp', 'moveProp', 'deleteProp', 'selectPropAt',
                        'propInfo', 'propPaletteInfo', 'setPropAutoLink', 'getPropAutoLink',
                        'exportJSON', 'importJSON', 'lint', 'undo', 'texInfo', 'hoverTile']
                       .filter(k => typeof E[k] !== 'function'),
          kind: M.RAIL_KIT_KIND, masks: M.RAIL_VARIANT_MASKS,
          label: M.PROP_KIND_LABELS ? M.PROP_KIND_LABELS.railKit : null,
          tools: E.TOOLS.map(t => t.key),
          dom: { link: !!q('propLinkRow'), chk: !!q('propLinkChk'), hist: !!q('histBtns'),
                 undo: !!q('btnUndo'), redo: !!q('btnRedo'), tool: !!q('toolBtns'),
                 canvas: !!q('editorCanvas'), list: !!q('propList') },
          chkLabel: q('propLinkRow') ? q('propLinkRow').textContent.trim() : '',
          lintShape: (function () { const r = E.lint(); return [typeof r, Array.isArray(r.errors), Array.isArray(r.warnings)]; })(),
        };
      });
      check('§0 0a DFMapDef に STEP 2.5 の純関数 4 本 + Phase 6 の 4 本がある',
        d0.fnMissing.length === 0, '欠け=' + J(d0.fnMissing));
      check('§0 0b __mapEditor に必要な検証シーム 15 本がある',
        d0.seamMissing.length === 0, '欠け=' + J(d0.seamMissing));
      check('§0 0c RAIL_KIT_KIND = "railKit" / RAIL_VARIANT_MASKS = [5,10,3,6,12,9]',
        d0.kind === 'railKit' && J(d0.masks) === J([5, 10, 3, 6, 12, 9]), d0.kind + ' ' + J(d0.masks));
      check('§0 0d PROP_KIND_LABELS.railKit = "線路(つなぐ)"', d0.label === '線路(つなぐ)', String(d0.label));
      check('§0 0e ツール "prop" が TOOLS の末尾 (数字キーの割当を既存ツールから奪っていない)',
        d0.tools[d0.tools.length - 1] === 'prop' && d0.tools.length === 9, J(d0.tools));
      check('§0 0f 「線路・水路を自動でつなぐ」の DOM 2 要素 + 履歴/ツール/canvas の DOM がある',
        Object.keys(d0.dom).every(k => d0.dom[k]), J(d0.dom));
      /* ⚠ STEP 3 で waterKit が同じ機構に乗ったので文言が「線路・水路」に広がった。
       *   ここは**文言そのもの**を見る assert なので、UI を直したらここも直す (2026-08-04)。 */
      check('§0 0g チェックボックスの文言が「線路・水路を自動でつなぐ」',
        /線路・水路を自動でつなぐ/.test(d0.chkLabel), d0.chkLabel);
      check('§0 0h lint() は配列ではなく { errors, warnings } を返す (取り違え防止)',
        d0.lintShape[0] === 'object' && d0.lintShape[1] === true && d0.lintShape[2] === true, J(d0.lintShape));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§1 カタログ — ★identity で測る (件数ではない)');
    {
      const c1 = await page.evaluate(() => {
        const E = window.__mapEditor, M = E.MapDef;
        const sheets = M.getScenerySheets(), frames = M.getSceneryFrames();
        const es = M.propEntries();
        const rk = es.filter(e => e.kind === 'railKit');
        return {
          kinds: Array.from(new Set(es.map(e => e.kind))),
          rk: rk.map(e => [e.variant, e.src, e.frame, Math.round(e.dw * 100) / 100,
                           Math.round(e.dh * 100) / 100, e.blocking, e.tw, e.th, e.sizeLabel, e.label]),
          sheet: { src: sheets.railKit.src, blocking: sheets.railKit.blocking,
                   displayMax: sheets.railKit.displayMax, flat: sheets.railKit.flat },
          frames: frames.railKit,
          tile: M.DEFAULT_DUNGEON.grid.tile,
          oldRail: es.filter(e => e.kind === 'rail').map(e => [e.variant, Math.round(e.dw), Math.round(e.dh)]),
          oldRailSheet: { src: sheets.rail.src, displayMax: sheets.rail.displayMax, flat: sheets.rail.flat },
          oob: M.propDrawSize('railKit', 6),
        };
      });
      /* ⚠ 恒久教訓: グローバルな件数でなく **identity** (キーの明示リスト) で測る。
       *   種を 1 つ足すとここも直す = カタログの identity をコミットに書き残す装置。
       *   ⚠ 同じ identity assert が driver_mapeditor_props §1 1b にもある (2 ファイル 3 箇所)。 */
      check('§1 1a 種が 13 (既存 7 + Phase6 STEP2 の 4 + STEP2.5 の railKit + STEP3 の waterKit)',
        J(c1.kinds) === J(['grass', 'reed', 'log', 'detail', 'rubble', 'cart', 'rail',
                           'pillar', 'chair', 'table', 'wreck', 'railKit', 'waterKit']), J(c1.kinds));
      check('§1 1b railKit が 6 ピース / variant が 0..5 で欠番なし',
        c1.rk.length === 6 && J(c1.rk.map(e => e[0])) === J([0, 1, 2, 3, 4, 5]),
        J(c1.rk.map(e => e[0])));
      check('§1 1c 枠が 512 角セル 6 個 (x = 0/512/1024/1536/2048/2560, y = 0)',
        J(c1.frames) === J([0, 512, 1024, 1536, 2048, 2560].map(x => ({ x: x, y: 0, w: 512, h: 512 }))),
        J((c1.frames || []).map(f => f.x + 'x' + f.w)));
      check('§1 1d 画像は assets/mine_rail_kit.png (既存 mine_rail.png ではない)',
        c1.sheet.src === 'assets/mine_rail_kit.png' && c1.rk.every(e => e[1] === 'assets/mine_rail_kit.png'),
        c1.sheet.src);
      check('§1 1e blocking が 6 変種すべて false / flat が true (床に貼り付く = 上を歩ける)',
        J(c1.sheet.blocking) === J([false, false, false, false, false, false]) &&
        c1.sheet.flat === true && c1.rk.every(e => e[5] === false),
        J(c1.sheet.blocking) + ' flat=' + c1.sheet.flat);
      /* ★★1f = この節の心臓部。displayMax がマス (96) からずれると、絵は出るのに
       *   接続点がマス境界に来なくなり「敷いてもつながらない」。数値は例外を出さない。
       *   ⚠ 96 は **TILE_SIZE そのもの**なので、grid.tile から引いて突き合わせる
       *     (「96」を写経して両方いっしょに書き換わる事故を避ける)。 */
      check('§1 1f ★★displayMax が 1 マス (grid.tile = ' + c1.tile + ') ちょうど / 6 変種とも dw=dh=1マス',
        c1.sheet.displayMax === c1.tile &&
        c1.rk.every(e => near(e[3], c1.tile, 0.001) && near(e[4], c1.tile, 0.001)),
        'displayMax=' + c1.sheet.displayMax + ' 実寸=' + J(c1.rk.map(e => e[3] + 'x' + e[4])[0]) +
        ' ← ずれると接続点がマス境界から外れて「つながらない」');
      check('§1 1g 作業ツリーの index.html を独立に読んだ値とも一致 (displayMax / 枠 / blocking / flat)',
        IDX.sheets.railKit.displayMax === 96 && IDX.sheets.railKit.flat === true &&
        (IDX.frames.railKit || []).length === 6 &&
        IDX.frames.railKit.every(f => f.w === 512 && f.h === 512) &&
        J(IDX.sheets.railKit.blocking) === J([false, false, false, false, false, false]),
        'index.html: displayMax=' + IDX.sheets.railKit.displayMax + ' 枠=' +
        (IDX.frames.railKit || []).length + ' 個');
      check('§1 1h 塞ぐマスが 1×1 / 実寸ラベルが全件 "2.9m × 2.9m" (接続タイルなので仕様どおり)',
        c1.rk.every(e => e[6] === 1 && e[7] === 1 && e[8] === '2.9m × 2.9m'),
        J(c1.rk.map(e => e[8])[0]) + ' ' + J(c1.rk.map(e => e[6] + 'x' + e[7])[0]));
      check('§1 1i ラベルが「線路(つなぐ) 1」形式 (日本語の呼び名 + 連番)',
        /^線路\(つなぐ\) 1$/.test(c1.rk[0][9]), J(c1.rk.map(e => e[9])));
      /* ★既存 rail に変種を足していないこと。足すと散布の variant = hash % frames.length が
       *   動いて**廃坑の既存マップの見た目が変わる** (STEP 2.5 で新種にした唯一の理由)。 */
      check('§1 1j ★既存 rail が無傷 (3 変種 / mine_rail.png / displayMax 130 / flat)',
        c1.oldRail.length === 3 && c1.oldRailSheet.src === 'assets/mine_rail.png' &&
        c1.oldRailSheet.displayMax === 130 && c1.oldRailSheet.flat === true,
        J(c1.oldRail) + ' ' + J(c1.oldRailSheet));
      check('§1 1k 枠の外の variant は null (配列外アクセスで落ちない)', c1.oob === null, String(c1.oob));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§2 純関数 — ★mask 0〜15 の全 16 通り (接続規則の唯一の正)');
    {
      /* 期待表は**ドライバ側に literal で書く** = 実装を読んで作らない。
       * 0 は null (孤立 = 変更しない) で、これがユーザーの「カーブを 1 個だけ置きたい」を守る。 */
      const EXPECT = { 0: null, 1: 0, 2: 1, 3: 2, 4: 0, 5: 0, 6: 3, 7: 0,
                       8: 1, 9: 5, 10: 1, 11: 1, 12: 4, 13: 0, 14: 1, 15: 0 };
      const NAME = (m) => (['N', 'E', 'S', 'W'].filter((_, i) => m & (1 << i)).join('+') || '(孤立)');
      const c2 = await page.evaluate(() => {
        const M = window.__mapEditor.MapDef;
        const table = [];
        for (let m = 0; m <= 15; m++) table.push(M.railVariantForMask(m));
        const back = M.RAIL_VARIANT_MASKS.map(mk => M.railVariantForMask(mk));
        const weird = [M.railVariantForMask(null), M.railVariantForMask(NaN),
                       M.railVariantForMask('3'), M.railVariantForMask(16), M.railVariantForMask(21)];
        // railKitMaskAt: 自分のマスは見ない / kind 違いは数えない / 配列でなければ 0
        const solo = [{ kind: 'railKit', variant: 0, tx: 10, ty: 10 }];
        const cross = [{ kind: 'railKit', variant: 0, tx: 10, ty: 10 },
                       { kind: 'railKit', variant: 0, tx: 10, ty: 9 },
                       { kind: 'railKit', variant: 0, tx: 11, ty: 10 },
                       { kind: 'railKit', variant: 0, tx: 10, ty: 11 },
                       { kind: 'railKit', variant: 0, tx: 9, ty: 10 }];
        const other = [{ kind: 'railKit', variant: 0, tx: 10, ty: 10 },
                       { kind: 'rail', variant: 0, tx: 10, ty: 9 },
                       { kind: 'pillar', variant: 0, tx: 11, ty: 10 }];
        // 冪等性: 2 回目は 0 件しか書き換わらない
        const idem = cross.map(p => ({ kind: p.kind, variant: p.variant, tx: p.tx, ty: p.ty }));
        const n1 = M.railKitRelinkAround(idem, 10, 10);
        const n2 = M.railKitRelinkAround(idem, 10, 10);
        // 孤立したカーブは書き換えない (ユーザーが 1 個だけ意図して置いた形を守る)
        const lone = [{ kind: 'railKit', variant: 3, tx: 20, ty: 20 }];
        const nLone = M.railKitRelinkAround(lone, 20, 20);
        return {
          table, back, weird,
          maskSolo: M.railKitMaskAt(solo, 10, 10),
          maskCross: M.railKitMaskAt(cross, 10, 10),
          maskOther: M.railKitMaskAt(other, 10, 10),
          maskNotArr: M.railKitMaskAt(null, 10, 10),
          relinkNone: M.railKitRelinkAt(solo, 44, 44),
          n1, n2, idem: idem.map(p => p.variant),
          nLone, loneV: lone[0].variant,
        };
      });
      for (let m = 0; m <= 15; m++) {
        check('§2 2a mask ' + String(m).padStart(2) + ' (' + NAME(m).padEnd(6) + ') → ' +
          (EXPECT[m] === null ? 'null (変更しない)' : EXPECT[m] + ' ' + GLYPH[EXPECT[m]]),
          c2.table[m] === EXPECT[m], 'got=' + c2.table[m]);
      }
      check('§2 2b ★mask 0 だけが null = 「孤立した 1 個は勝手に化けない」',
        c2.table.filter(v => v === null).length === 1 && c2.table[0] === null, J(c2.table));
      check('§2 2c variant → mask → variant の往復が 6 種すべて自分自身へ戻る',
        J(c2.back) === J([0, 1, 2, 3, 4, 5]), J(c2.back));
      check('§2 2d 変な入力 (null/NaN/"3"/16/21) が例外を出さず null|0 に落ちる',
        J(c2.weird) === J([null, null, null, null, 0]), J(c2.weird));
      check('§2 2e railKitMaskAt は**自分のマスを見ない** (1 個だけなら mask 0)',
        c2.maskSolo === 0, String(c2.maskSolo));
      check('§2 2f 上下左右 4 方向すべてを見る (十字なら mask 15)', c2.maskCross === 15, String(c2.maskCross));
      check('§2 2g ★railKit 以外 (既存 rail / 石柱) は近傍として数えない',
        c2.maskOther === 0, String(c2.maskOther));
      check('§2 2h props が配列でなければ 0 (落ちない)', c2.maskNotArr === 0, String(c2.maskNotArr));
      check('§2 2i そのタイルに railKit が無ければ 0 件しか書き換えない',
        c2.relinkNone === 0, String(c2.relinkNone));
      check('§2 2j ★冪等 — 2 回目の relink は 0 件 (何度呼んでも同じ)',
        c2.n1 > 0 && c2.n2 === 0, '1回目=' + c2.n1 + ' 2回目=' + c2.n2 + ' 形=' + J(c2.idem));
      check('§2 2k ★孤立したカーブ (variant 3) は relink しても 3 のまま',
        c2.nLone === 0 && c2.loneV === 3, 'n=' + c2.nLone + ' variant=' + c2.loneV);
    }

    // ══════════════════════════════════════════════════════════════════════
    // §3 — ★★実マウス / 実キーボードだけで敷く
    //   ⚠ 既存 4 本が不具合を素通しした真因は「dragTile シームしか叩いていない」こと。
    // ══════════════════════════════════════════════════════════════════════
    mark('§3 実地 — ★★実マウス経路で敷く / 曲がる / 消す / 動かす');
    {
      // ── 3-1 直線 (パレットで選んだ向きと逆に敷いても、つながる向きへ化ける) ──
      await page.evaluate(() => { window.__t.reset(true); window.__mapEditor.setPropBrush('railKit', 0); });
      const aim0 = await mouseClickTile(page, 28, 10);
      check('§3 3a [装置] canvas が実マウスを打てる大きさで、狙った位置に届いている',
        aim0.fits === true && aim0.cw >= 640 && aim0.ch >= 520, 'canvas=' + aim0.cw + 'x' + aim0.ch);
      await page.evaluate(() => window.__mapEditor.setPropBrush('railKit', 0));
      await mouseClickTile(page, 29, 10);
      await page.evaluate(() => window.__mapEditor.setPropBrush('railKit', 0));
      await mouseClickTile(page, 30, 10);
      const s31 = await page.evaluate(() => ({ items: window.__t.items(), n: window.__t.items().length }));
      check('§3 3b ★実マウスで横 3 連を「縦」の筆で置いた → 3 個とも 1 (横) に化けた',
        s31.n === 3 && s31.items.every(i => i.variant === 1), show(s31.items));

      // ── 3-2 L 字 = 南へ 1 個足した瞬間に角がカーブへ化ける ──
      const before32 = await page.evaluate(() => window.__t.at(30, 10));
      await page.evaluate(() => window.__mapEditor.setPropBrush('railKit', 0));
      await mouseClickTile(page, 30, 11);
      const s32 = await page.evaluate(() => ({ corner: window.__t.at(30, 10), items: window.__t.items() }));
      check('§3 3c ★★実マウスで南へ 1 個足すと角 (30,10) が 1 (横) → 4 (南西カーブ) に化ける',
        before32 === 1 && s32.corner === 4, before32 + ' -> ' + s32.corner + '  ' + show(s32.items));
      await page.evaluate(() => window.__mapEditor.setPropBrush('railKit', 0));
      await mouseClickTile(page, 30, 12);
      const s32b = await page.evaluate(() => window.__t.variants());
      check('§3 3d L 字 5 個の形が [1,1,4,0,0] (横-横-カーブ-縦-縦)',
        J(s32b) === J([1, 1, 4, 0, 0]), J(s32b));

      // ── 3-3 削除 (実マウスで掴んで実キーボードの Delete) ──
      await mouseClickTile(page, 30, 11);          // 既存の物の上 = 掴む (置き直しではない)
      const sel33 = await page.evaluate(() => window.__mapEditor.getPropSelection());
      const n33before = await page.evaluate(() => window.__t.items().length);
      await pressDelete(page);
      const s33 = await page.evaluate(() => ({ n: window.__t.items().length, corner: window.__t.at(30, 10),
                                               tail: window.__t.at(30, 12), v: window.__t.variants() }));
      check('§3 3e 既存の物の上を実マウスでクリックすると**掴む** (二重に置かない)',
        sel33 !== null && typeof sel33.index === 'number' && n33before === 5,
        J(sel33) + ' n=' + n33before);
      check('§3 3f ★実キーボードの Delete で 1 個消えた (5 → 4)', s33.n === 4, 'n=' + s33.n);
      check('§3 3g ★★カーブだった角 (30,10) が 1 (横の終端) へ戻った', s33.corner === 1,
        '4 -> ' + s33.corner + '  ' + J(s33.v));
      check('§3 3h 切り離された (30,12) は孤立 → 今の形 0 (縦) を保つ (勝手に化けない)',
        s33.tail === 0, String(s33.tail));

      // ── 3-4 移動 (実マウスのドラッグ) ──
      await page.evaluate(() => {
        const T = window.__t; T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10], [30, 11]], 0);   // L 字 (角 = 30,10)
        T.lay([[36, 10], [36, 11]], 0);                       // 別の縦 2 連
      });
      const pre34 = await page.evaluate(() => ({ corner: window.__t.at(30, 10), tail: window.__t.at(30, 11),
                                                 v10: window.__t.at(36, 10), v11: window.__t.at(36, 11) }));
      await mouseDragTile(page, 30, 11, 37, 11);              // 尾を (36,11) の東隣へ引っ越す
      const post34 = await page.evaluate(() => ({ corner: window.__t.at(30, 10), gone: window.__t.at(30, 11),
                                                  moved: window.__t.at(37, 11), v11: window.__t.at(36, 11),
                                                  n: window.__t.items().length }));
      check('§3 3i 移動前: 角 (30,10)=4 / 尾 (30,11)=0 / (36,11)=0',
        pre34.corner === 4 && pre34.tail === 0 && pre34.v11 === 0, J(pre34));
      check('§3 3j ★実マウスのドラッグで移動できた / 移動元のマスは空になった',
        post34.gone === null && post34.n === 6, 'at(30,11)=' + post34.gone + ' n=' + post34.n);
      check('§3 3k ★★移動**元**の隣 (30,10) が 4 (カーブ) → 1 (横の終端) に選び直された',
        post34.corner === 1, '4 -> ' + post34.corner);
      check('§3 3l ★★移動**先**の隣 (36,11) が 0 (縦) → 2 (北東カーブ) に選び直された',
        post34.v11 === 2, '0 -> ' + post34.v11);
      check('§3 3m 移動した本人 (37,11) も 0 (縦) → 1 (横の終端) になった',
        post34.moved === 1, '0 -> ' + post34.moved);

      // ── 3-5 T 字 / 十字 = フォールバック表どおり ──
      //   ★筆は 2 (北東カーブ) = 表が効かないと 2 のまま残る = nofallback 変異が必ず捕まる
      const s35 = await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t, M = E.MapDef;
        T.reset(true);
        T.lay([[33, 14], [33, 16], [32, 15], [34, 15], [33, 15]], 2);   // 十字 (mask 15)
        const cross = { v: T.at(33, 15), mask: M.railKitMaskAt(E.getMapDef().props, 33, 15) };
        T.reset(true);
        T.lay([[38, 15], [38, 17], [39, 16], [38, 16]], 2);             // T 字 N+E+S (mask 7)
        const t7 = { v: T.at(38, 16), mask: M.railKitMaskAt(E.getMapDef().props, 38, 16) };
        T.reset(true);
        T.lay([[27, 10], [29, 10], [28, 11], [28, 10]], 2);             // T 字 E+S+W (mask 14)
        const t14 = { v: T.at(28, 10), mask: M.railKitMaskAt(E.getMapDef().props, 28, 10) };
        return { cross, t7, t14 };
      });
      check('§3 3n 十字 (mask 15) → 0 (縦)。筆は 2 なので表が効かないと 2 のまま残る',
        s35.cross.mask === 15 && s35.cross.v === 0, 'mask=' + s35.cross.mask + ' variant=' + s35.cross.v);
      check('§3 3o T 字 北+東+南 (mask 7) → 0 (縦)',
        s35.t7.mask === 7 && s35.t7.v === 0, 'mask=' + s35.t7.mask + ' variant=' + s35.t7.v);
      check('§3 3p T 字 東+南+西 (mask 14) → 1 (横)',
        s35.t14.mask === 14 && s35.t14.v === 1, 'mask=' + s35.t14.mask + ' variant=' + s35.t14.v);

      // ── 3-6 OFF (実チェックボックスのクリック) ──
      await page.evaluate(() => { window.__t.reset(true); window.__mapEditor.setPropBrush('railKit', 0); });
      await mouseClickTile(page, 28, 10);
      await page.evaluate(() => window.__mapEditor.setPropBrush('railKit', 0));
      await mouseClickTile(page, 29, 10);
      const on36 = await page.evaluate(() => window.__t.variants());
      await page.click('#propLinkChk');                       // ★実マウスでチェックを外す
      await sleep(80);
      const off36state = await page.evaluate(() => ({ info: window.__mapEditor.propInfo().autoLink,
                                                      get: window.__mapEditor.getPropAutoLink(),
                                                      pal: window.__mapEditor.propPaletteInfo().autoLink }));
      await page.evaluate(() => window.__mapEditor.setPropBrush('railKit', 2));   // 北東カーブ
      await mouseClickTile(page, 30, 10);                     // 本来なら横に化ける位置
      const off36 = await page.evaluate(() => ({ v: window.__t.variants(), neighbor: window.__t.at(29, 10) }));
      await page.click('#propLinkChk');                       // 戻す
      await sleep(80);
      const back36 = await page.evaluate(() => window.__mapEditor.getPropAutoLink());
      check('§3 3q ON のうちは 2 個とも 1 (横)', J(on36) === J([1, 1]), J(on36));
      check('§3 3r ★実マウスでチェックを外すと 3 つの読み口すべてが false',
        off36state.info === false && off36state.get === false && off36state.pal === false, J(off36state));
      check('§3 3s ★★OFF で置いた北東カーブ (variant 2) がそのまま残る',
        off36.v[2] === 2, J(off36.v));
      check('§3 3t ★★OFF では近傍 (29,10) も 1 のまま書き換わらない',
        off36.neighbor === 1, String(off36.neighbor));
      check('§3 3u チェックを戻すと ON へ復帰', back36 === true, String(back36));

      // ── 3-7 railKit 以外は無関係 ──
      const s37 = await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10], [30, 11]], 0);
        const before = T.variants();
        E.setPropBrush('pillar', 0);
        const r = [E.placeProp(29, 9), E.placeProp(29, 11), E.placeProp(27, 10), E.placeProp(31, 10)];
        const rails = T.items().filter(i => i.kind === 'railKit').map(i => i.variant);
        const kinds = T.items().map(i => i.kind);
        return { before, rails, ok: r.every(x => x.ok),
                 nRail: kinds.filter(k => k === 'railKit').length,
                 nPillar: kinds.filter(k => k === 'pillar').length };
      });
      check('§3 3v ★線路の四方に石柱を置いても線路の形は 1 個も変わらない',
        s37.ok === true && J(s37.before) === J(s37.rails) && s37.nRail === 4 && s37.nPillar === 4,
        J(s37.before) + ' -> ' + J(s37.rails) + ' (railKit ' + s37.nRail + ' / pillar ' + s37.nPillar + ')');
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§4 Undo — ★実キーボード Ctrl+Z 一発で近傍の化けごと戻る');
    {
      const pre = await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10]], 0);
        return { snap: JSON.stringify(E.getMapDef()), v: T.variants() };
      });
      await page.evaluate(() => window.__mapEditor.setPropBrush('railKit', 0));
      await mouseClickTile(page, 30, 11);            // ★1 手で「新規1個」+「(30,10) の化け」
      const mid = await page.evaluate(() => ({ v: window.__t.variants(), corner: window.__t.at(30, 10),
                                               undoDisabled: document.getElementById('btnUndo').disabled }));
      check('§4 4a 1 手で新規 1 個 + 近傍 1 個の書き換えが起きた ([1,1,1] → [1,1,4,0])',
        J(pre.v) === J([1, 1, 1]) && J(mid.v) === J([1, 1, 4, 0]) && mid.corner === 4,
        J(pre.v) + ' -> ' + J(mid.v));
      check('§4 4b ↶ 元に戻す ボタンが有効になった (ユーザー要望②の可視の合図)',
        mid.undoDisabled === false, 'disabled=' + mid.undoDisabled);
      await pressCtrlZ(page);
      const post = await page.evaluate((snap) => {
        const E = window.__mapEditor, T = window.__t;
        return { v: T.variants(), n: T.items().length, corner: T.at(30, 10),
                 same: JSON.stringify(E.getMapDef()) === snap };
      }, pre.snap);
      check('§4 4c ★実キーボード Ctrl+Z 一発で置いた物が消えた (4 → 3)', post.n === 3, 'n=' + post.n);
      check('§4 4d ★★近傍 (30,10) も 4 (カーブ) → 1 (横) へ巻き戻った', post.corner === 1,
        '4 -> ' + post.corner + '  形=' + J(post.v));
      check('§4 4e ★★mapDef が置く前と 1 バイトも変わらない (自動接続が同じ 1 段に乗っている証拠)',
        post.same === true, 'deep-equal=' + post.same);
      // ★実マウスで #btnUndo を押しても同じこと (項目1 のボタンが実際に働く)
      await page.evaluate(() => window.__mapEditor.setPropBrush('railKit', 0));
      await mouseClickTile(page, 30, 11);
      const mid2 = await page.evaluate(() => window.__t.variants());
      await page.click('#btnUndo');
      await sleep(120);
      const post2 = await page.evaluate((snap) => ({ n: window.__t.items().length,
        corner: window.__t.at(30, 10), same: JSON.stringify(window.__mapEditor.getMapDef()) === snap }), pre.snap);
      check('§4 4f ★#btnUndo を実マウスでクリックしても同じ 1 段が戻る (ユーザー要望②の本体)',
        J(mid2) === J([1, 1, 4, 0]) && post2.n === 3 && post2.corner === 1 && post2.same === true,
        J(mid2) + ' -> n=' + post2.n + ' corner=' + post2.corner + ' deep-equal=' + post2.same);
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§5 往復 — export → import で 1 バイトも変わらない / 矯正しない');
    {
      const c5 = await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10], [30, 11], [30, 12]], 0);   // L 字 [1,1,4,0,0]
        const before = E.getMapDef();
        const text = E.exportJSON();
        E.loadPreset('field');                          // いったん捨てる (往復の検出力を担保)
        const cleared = E.getMapDef().props;
        const r = E.importJSON(text);
        const after = E.getMapDef();
        const exported = JSON.parse(text).props;
        /* ★本命: 隣接と**矛盾する** variant を手で書いた JSON を読み込ませる。
         *   import で自動接続が走っていたら [2,2,2] は [1,1,1] に矯正されてしまう。 */
        const bad = JSON.parse(text);
        bad.props = [{ kind: 'railKit', variant: 2, tx: 10, ty: 10 },
                     { kind: 'railKit', variant: 2, tx: 11, ty: 10 },
                     { kind: 'railKit', variant: 2, tx: 12, ty: 10 }];
        const r2 = E.importJSON(JSON.stringify(bad));
        const kept = E.getMapDef().props.map(p => p.variant);
        const round2 = JSON.stringify(JSON.parse(E.exportJSON()).props) === JSON.stringify(bad.props);
        /* 「矯正されない」が単に relink が壊れているだけ、という取り違えを潰す母集団ガード:
         *   同じ [2,2,2] を **編集経路** (relinkAround) に通せば [1,1,1] になる。 */
        const arr = JSON.parse(JSON.stringify(bad.props));
        E.MapDef.railKitRelinkAround(arr, 11, 10);
        return { same: JSON.stringify(before) === JSON.stringify(after), cleared,
                 importOk: r.ok, importOk2: r2.ok, exported, kept, round2,
                 forced: arr.map(p => p.variant), len: JSON.stringify(before).length,
                 keys: Object.keys(exported[0] || {}) };
      });
      check('§5 5a [装置] 別プリセットへ切り替えると props が消える (往復の検出力を担保)',
        c5.cleared === null || (Array.isArray(c5.cleared) && c5.cleared.length === 0), J(c5.cleared));
      check('§5 5b prop レコードは { kind, variant, tx, ty } の 4 キーだけ (余計な物を書き出さない)',
        J(c5.keys) === J(['kind', 'variant', 'tx', 'ty']), J(c5.keys));
      check('§5 5c ★export → import → getMapDef が 1 バイトも変わらない',
        c5.importOk === true && c5.same === true, 'JSON長=' + c5.len);
      check('§5 5d ★★隣接と矛盾する variant [2,2,2] を読み込んでも矯正されない (import で走らない証拠)',
        c5.importOk2 === true && J(c5.kept) === J([2, 2, 2]), J(c5.kept));
      check('§5 5e その状態を書き出しても [2,2,2] のまま', c5.round2 === true, String(c5.round2));
      check('§5 5f [母集団ガード] 同じ [2,2,2] を編集経路に通せば [1,1,1] になる ' +
        '(5d が「relink が死んでいるだけ」ではない証明)',
        J(c5.forced) === J([1, 1, 1]), J(c5.forced));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§6 非退行 — ★既定 6 シナリオは railKit を 1 個も持たない');
    {
      /* ① 静的: SCENERY_RECIPES が参照する種を **identity** で列挙する。
       *    件数でなく「この 6 種ちょうど」で測る = railKit が混ざった瞬間に落ちる。 */
      const recipeKinds = [];
      for (const scen of Object.keys(IDX.recipes))
        for (const room of Object.keys(IDX.recipes[scen]))
          for (const k of Object.keys(IDX.recipes[scen][room].counts || {}))
            if (recipeKinds.indexOf(k) < 0) recipeKinds.push(k);
      check('§6 6a ★SCENERY_RECIPES が参照する種は 6 つちょうど (railKit を足していない)',
        J(recipeKinds.slice().sort()) === J(['cart', 'detail', 'grass', 'log', 'rail', 'rubble']),
        J(recipeKinds));
      check('§6 6b [母集団ガード] レシピは 2 テーマ・5 部屋を実際に持っている (真空 PASS でない)',
        J(Object.keys(IDX.recipes)) === J(['goblin-mine', 'caravan-road']) &&
        Object.keys(IDX.recipes).reduce((a, s) => a + Object.keys(IDX.recipes[s]).length, 0) === 5,
        J(Object.keys(IDX.recipes).map(s => s + ':' + Object.keys(IDX.recipes[s]).length)));

      // ② 実地: 既定シナリオ (廃坑) を本編で起動して、散布に railKit が 1 個も無いこと
      const gp = await browser.newPage();
      const gErrs = [];
      gp.on('pageerror', e => gErrs.push('pageerror(game): ' + ((e && e.message) || e)));
      gp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text()))
        gErrs.push('console.error(game): ' + m.text()); });
      await gp.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
      await gp.evaluateOnNewDocument(() => {
        try {
          sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
          sessionStorage.removeItem('dragonfighters.generatedScenario');
        } catch (e) {}
      });
      /* ⚠⚠ **`&graph=0` は 2026-08-08 (P5) に足した**。廃坑 (goblin-mine) が既定で分岐版に
       *   なったので、付けないとこの「既定シナリオ」対照が **isCustom=true の分岐ノード**に
       *   なり、散布の種類も mapCanvas も別物になる。計画書どおり `?graph=0` を恒久的な
       *   退避口として使い、旧幾何の対照として生かし続ける。⚠ assert は 1 つも消していない。 */
      await gp.goto(BASE + '/index.html?diag=1&graph=0', { waitUntil: 'domcontentloaded' });
      await gp.waitForFunction("typeof sceneryPlacements !== 'undefined' && typeof MAPDEF !== 'undefined'",
        { timeout: 30000 });
      const gm = await gp.evaluate(() => {
        const kinds = {};
        for (const s of sceneryPlacements) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
        return { isCustom: !!MAPDEF.isCustom, props: MAPDEF.props === undefined ? null : MAPDEF.props,
                 total: sceneryPlacements.length, kinds: kinds,
                 hasSheet: !!(SCENERY_SHEETS && SCENERY_SHEETS.railKit),
                 hasFrames: !!(SCENERY_FRAMES && SCENERY_FRAMES.railKit) };
      });
      allErrs.push(...gErrs);
      check('§6 6c ★既定シナリオ (廃坑) の散布は rubble/rail/cart の 3 種ちょうど — railKit は 0 件',
        J(Object.keys(gm.kinds).sort()) === J(['cart', 'rail', 'rubble']) && gm.total > 0,
        '散布=' + J(gm.kinds));
      check('§6 6d 既定シナリオは props:null (mapDef.props の経路を 1 度も通らない)',
        gm.isCustom === false && gm.props === null, 'isCustom=' + gm.isCustom + ' props=' + J(gm.props));
      check('§6 6e [母集団ガード] それでも本編は railKit をカタログとして持っている ' +
        '(「見つからないから 0 件」ではない)',
        gm.hasSheet === true && gm.hasFrames === true, J([gm.hasSheet, gm.hasFrames]));
      await gp.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    // §7 — ユーザー要望②「1 個戻るボタンが欲しい」の**画面上の**位置
    //   ⚠ DOM 順だけ見ても駄目。#editbar は flex-wrap なので CSS 1 行で最終行へ沈む。
    // ══════════════════════════════════════════════════════════════════════
    mark('§7 Undo ボタン — ★編集バーの先頭 (真の左端・ツールより前) に見えていること');
    {
      /* 物差し: 「↶ より前 (読む順で先) に何個の操作子があるか」。
       *   ツールボタン群 (#toolBtns) は正規の置き場なので勘定に入れない。
       *   0 = 「履歴はツールの次 = すぐ目に入る」。大きいほど埋もれている。 */
      const measure = (p) => p.evaluate(() => {
        const barEl = document.getElementById('editbar');
        const bar = barEl.getBoundingClientRect();
        const u = document.getElementById('btnUndo').getBoundingClientRect();
        const r = document.getElementById('btnRedo').getBoundingClientRect();
        const kids = Array.prototype.slice.call(barEl.children).filter(k => k.getBoundingClientRect().width > 0);
        const tops = kids.map(k => Math.round(k.getBoundingClientRect().top - bar.top));
        const firstRowTop = Math.min.apply(null, tops);
        const before = [];
        for (const k of kids) {
          if (k.id === 'toolBtns') continue;
          if (k.contains(document.getElementById('btnUndo'))) continue;
          const b = k.getBoundingClientRect();
          if (b.top < u.top - 2 || (Math.abs(b.top - u.top) <= 6 && b.left < u.left))
            before.push(k.id ? '#' + k.id : (k.className ? '.' + k.className : k.tagName.toLowerCase()));
        }
        return {
          rows: Array.from(new Set(tops)).sort((a, b) => a - b), firstRowTop,
          undoTop: +(u.top - bar.top).toFixed(1), undoLeft: +(u.left - bar.left).toFixed(1),
          sameRow: Math.abs(u.top - r.top) < 1,
          onFirstRow: Math.abs((u.top - bar.top) - firstRowTop) <= u.height * 0.6,
          beforeCount: before.length, before,
          visible: u.right <= window.innerWidth + 0.5 && u.bottom <= window.innerHeight + 0.5 && u.left >= -0.5,
        };
      });
      // DOM 順 (これは historder 変異では落ちない = 「DOM を見て安心する」assert の限界を示す)
      const d7 = await page.evaluate(() => {
        const bar = document.getElementById('editbar');
        const kids = Array.prototype.slice.call(bar.children);
        const q = (id) => document.getElementById(id);
        return { iTool: kids.indexOf(q('toolBtns')), iHist: kids.indexOf(q('histBtns')),
                 histKids: Array.prototype.map.call(q('histBtns').children, c => c.id),
                 undoText: q('btnUndo').textContent, redoText: q('btnRedo').textContent };
      });
      check('§7 7a #histBtns が #editbar の先頭 (DOM 順) / #toolBtns がその次',
        d7.iHist === 0 && d7.iTool === 1, 'histBtns=' + d7.iHist + ' toolBtns=' + d7.iTool);
      check('§7 7b btnUndo / btnRedo がこの順で #histBtns の中にある / ラベル据え置き',
        J(d7.histKids) === J(['btnUndo', 'btnRedo']) &&
        d7.undoText === '↶ 元に戻す' && d7.redoText === '↷ やり直し',
        J(d7.histKids) + ' ' + d7.undoText + '/' + d7.redoText);
      const s7 = await page.evaluate(() => {
        const cs = (el) => getComputedStyle(el);
        const hist = document.getElementById('histBtns');
        const u = document.getElementById('btnUndo'), other = document.getElementById('btnUnbake');
        return { bw: cs(hist).borderTopWidth, bg: cs(hist).backgroundColor,
                 rad: cs(hist).borderTopLeftRadius, shrink: cs(hist).flexShrink,
                 ws: cs(hist).whiteSpace, uBg: cs(u).backgroundColor, oBg: cs(other).backgroundColor,
                 uW: cs(u).fontWeight, oW: cs(other).fontWeight };
      });
      check('§7 7c #histBtns に枠 + 背景 + 角丸があり、flex-shrink:0 + nowrap で分断されない',
        parseFloat(s7.bw) > 0 && s7.bg !== 'rgba(0, 0, 0, 0)' && parseFloat(s7.rad) > 0 &&
        s7.shrink === '0' && s7.ws === 'nowrap', J(s7));
      check('§7 7d 履歴ボタンの配色/太さが隣のふつうのボタンと違う (強調されている)',
        s7.uBg !== s7.oBg && s7.uW !== s7.oW, s7.uBg + ' vs ' + s7.oBg + ' / ' + s7.uW + ' vs ' + s7.oW);
      /* ★★ここが本命 = **実描画位置**。3 つの viewport で、かつ
       *   「バッジ文言が伸びて #editbar が折り返す」条件 (焼き固め後) でも測る。 */
      for (const [W, H] of [[1920, 1080], [1280, 800], [1024, 768]]) {
        const p = await browser.newPage();
        p.on('pageerror', e => allErrs.push('pageerror(§7): ' + ((e && e.message) || e)));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text()))
          allErrs.push('console.error(§7): ' + m.text()); });
        await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
        await p.goto(BASE + '/map-editor.html', { waitUntil: 'load' });
        await p.waitForFunction(() => !!window.__mapEditor, { timeout: 20000, polling: 50 });
        await sleep(400);
        const m1 = await measure(p);
        await p.evaluate(() => { window.__mapEditor.setTool('brush'); window.__mapEditor.bakeTiles(); });
        await sleep(300);
        const m2 = await measure(p);
        const ok = (m) => m.onFirstRow && m.sameRow && m.visible && m.beforeCount === 0;
        check('§7 7e ' + W + 'x' + H + ' 起動直後: 先頭行 / 同一行 / 全可視 / ★前に 0 個',
          ok(m1), 'top=' + m1.undoTop + ' left=' + m1.undoLeft + ' 行=' + J(m1.rows) +
          ' 前=' + m1.beforeCount + J(m1.before));
        check('§7 7f ' + W + 'x' + H + ' 焼き固め後 (バーが折り返す条件): 同上',
          ok(m2), 'top=' + m2.undoTop + ' left=' + m2.undoLeft + ' 行=' + J(m2.rows) +
          ' 前=' + m2.beforeCount + J(m2.before));
        await p.close();
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // §8 — ★★パレットで**種類を差し替えた**ときも自動接続が走る (判断B・2026-08-04 承認)
    //   ⚠ pickProp() だけが autoLinkRails を呼んでいなかった = 「石柱 → 線路」に変えても
    //     **動かすまでつながらない**という取りこぼしがあった。
    //   ⚠⚠ ここは必ず**パレットの実クリック** (page.click) を通す。setPropBrush シームを
    //     叩くと pickProp を一度も通らず、既存 4 本と同じ「実経路を踏まない素通し」になる。
    //   ★旧 kind でも relink を呼ぶ (線路 → 石柱で残った両隣を終端へ戻す) のが判断B の要。
    // ══════════════════════════════════════════════════════════════════════
    mark('§8 pickProp — ★パレットの実クリックで種類を差し替えても線路がつながる');
    {
      const PAL = (k, v) => '#propList .propItem[data-kind="' + k + '"][data-variant="' + v + '"]';
      // ── 8-0 装置: パレットが実クリックできる状態か (真空 PASS を防ぐ) ──
      await page.evaluate(() => { window.__t.reset(true); });
      await sleep(80);
      const d8 = await page.evaluate((sR, sP) => {
        const pi = window.__mapEditor.propPaletteInfo();
        return { rail: !!document.querySelector(sR), pillar: !!document.querySelector(sP),
                 visible: pi.visible, propMode: pi.propMode, n: pi.n };
      }, PAL('railKit', 1), PAL('pillar', 0));
      check('§8 8a [装置] propMode でパレットが見えており railKit#1 / pillar#0 のボタンが実在する',
        d8.rail === true && d8.pillar === true && d8.visible === true && d8.propMode === true && d8.n > 0,
        J(d8));

      // ── 8-1 縦 3 連の中央を選択 → パレットで「横」を実クリック → 自動接続で縦へ戻る ──
      //   ★下ごしらえは自動接続 OFF で「隣接と矛盾する [2,2,2]」を作る。こうすると差し替えの
      //     結果 ([0,0,0]) が下ごしらえと**別物**になるので、Ctrl+Z の 1 段が実測できる。
      //     (ON で作ると最初から [0,0,0] で、差し替えの前後が同一 = pushHistory が
      //      「変化なしなら積まない」を通り、undo が 1 段手前まで戻ってしまう。)
      await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(false);                                        // 自動接続 OFF で下ごしらえ
        T.lay([[10, 5], [10, 6], [10, 7]], 2);                 // 縦 3 連だが全部 2 (北東カーブ)
        E.setPropAutoLink(true);                               // ★ここから ON
      });
      const pre81 = await page.evaluate(() => ({ v: window.__t.variants(),
        link: window.__mapEditor.getPropAutoLink(),
        snap: JSON.stringify(window.__mapEditor.getMapDef()) }));
      await mouseClickTile(page, 10, 6);                       // ★実マウスで中央を掴む
      const sel81 = await page.evaluate(() => window.__mapEditor.getPropSelection());
      await page.click(PAL('railKit', 1));                     // ★★パレットの実クリック
      await sleep(80);
      const post81 = await page.evaluate(() => ({ v: window.__t.variants(), mid: window.__t.at(10, 6),
        brush: window.__mapEditor.getPropBrush(), n: window.__t.items().length,
        undoDisabled: document.getElementById('btnUndo').disabled,
        palSel: window.__mapEditor.propPaletteInfo().items
                  .filter(i => i.sel).map(i => i.kind + '#' + i.variant) }));
      check('§8 8b [装置] 隣接と矛盾する [2,2,2] を作り、ON に戻し、実マウスで中央 (添字 1) を掴めた',
        J(pre81.v) === J([2, 2, 2]) && pre81.link === true &&
        sel81 !== null && sel81.index === 1, J(pre81.v) + ' sel=' + J(sel81));
      check('§8 8c ★パレットの実クリックが pickProp を通った (筆が railKit#1 / 見た目も選択状態)',
        post81.brush && post81.brush.kind === 'railKit' && post81.brush.variant === 1 &&
        J(post81.palSel) === J(['railKit#1']), J(post81.brush) + ' 画面=' + J(post81.palSel));
      check('§8 8d ★★横 (1) を選んだのに自動接続で 0 (縦) へ戻り、上下の隣も [0,0,0] へ揃う',
        post81.mid === 0 && J(post81.v) === J([0, 0, 0]) && post81.n === 3, J(post81.v));
      check('§8 8e 差し替えで ↶ 元に戻す が有効になった (履歴が 1 段積まれた)',
        post81.undoDisabled === false, 'disabled=' + post81.undoDisabled);
      await pressCtrlZ(page);                                   // ★実キーボード
      const undo81 = await page.evaluate((snap) => ({ v: window.__t.variants(),
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap }), pre81.snap);
      check('§8 8f ★★Ctrl+Z **一発**で差し替え前 ([2,2,2]) と 1 バイトも変わらない状態に戻る',
        undo81.same === true && J(undo81.v) === J([2, 2, 2]),
        'deep-equal=' + undo81.same + ' 形=' + J(undo81.v));

      // ── 8-2 線路 → 石柱 (旧 kind 側の relink)。残った角が終端の直線へ戻る ──
      await page.evaluate(() => { const T = window.__t; T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10], [30, 11]], 0); });   // L 字 [1,1,4,0]
      const pre82 = await page.evaluate(() => ({ v: window.__t.variants(), corner: window.__t.at(30, 10),
        snap: JSON.stringify(window.__mapEditor.getMapDef()) }));
      await mouseClickTile(page, 30, 11);                      // ★実マウスで尾を掴む
      await page.click(PAL('pillar', 0));                      // ★★パレットの実クリックで石柱へ
      await sleep(80);
      const post82 = await page.evaluate(() => ({ corner: window.__t.at(30, 10),
        kinds: window.__t.items().map(i => i.kind), v: window.__t.variants(),
        tail: window.__t.items()[3] }));
      check('§8 8g [装置] L 字が [1,1,4,0] で角 (30,10) がカーブ (4)',
        J(pre82.v) === J([1, 1, 4, 0]) && pre82.corner === 4, J(pre82.v));
      check('§8 8h ★尾だけが石柱に差し替わった (railKit×3 + pillar×1 / 座標は動かない)',
        J(post82.kinds) === J(['railKit', 'railKit', 'railKit', 'pillar']) &&
        post82.tail.tx === 30 && post82.tail.ty === 11, J(post82.kinds));
      check('§8 8i ★★残った角 (30,10) が 4 (カーブ) → 1 (横の終端) へ戻る = **旧 kind 側**の relink',
        post82.corner === 1, '4 -> ' + post82.corner + '  ' + J(post82.v));
      await pressCtrlZ(page);
      const undo82 = await page.evaluate((snap) => ({ v: window.__t.variants(),
        kinds: window.__t.items().map(i => i.kind),
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap }), pre82.snap);
      check('§8 8j ★★Ctrl+Z 一発で種も近傍の形も丸ごと戻る (pushHistory が 1 回だけ)',
        undo82.same === true && J(undo82.v) === J([1, 1, 4, 0]),
        'deep-equal=' + undo82.same + ' 形=' + J(undo82.v) + ' 種=' + J(undo82.kinds));

      // ── 8-3 石柱 → 線路 (新 kind 側の relink)。★ユーザーが報告した取りこぼしそのもの ──
      await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(true);
        T.lay([[30, 11], [30, 12]], 0);            // 縦 2 連 [0,0]
        E.setPropBrush('pillar', 0);
        E.placeProp(31, 11);                       // その東隣に石柱
      });
      const pre83 = await page.evaluate(() => ({ v11: window.__t.at(30, 11),
        kinds: window.__t.items().map(i => i.kind),
        snap: JSON.stringify(window.__mapEditor.getMapDef()) }));
      await mouseClickTile(page, 31, 11);                      // ★実マウスで石柱を掴む
      await page.click(PAL('railKit', 1));                     // ★★線路へ差し替え
      await sleep(80);
      const post83 = await page.evaluate(() => ({ head: window.__t.at(31, 11), v11: window.__t.at(30, 11),
        kinds: window.__t.items().map(i => i.kind), v: window.__t.variants() }));
      check('§8 8k [装置] 縦 2 連 [0,0] の東隣に石柱がある',
        pre83.v11 === 0 && J(pre83.kinds) === J(['railKit', 'railKit', 'pillar']), J(pre83.kinds));
      check('§8 8l ★石柱が線路になった (railKit×3)',
        J(post83.kinds) === J(['railKit', 'railKit', 'railKit']), J(post83.kinds));
      check('§8 8m ★★**動かさずに**隣 (30,11) が 0 (縦) → 3 (東南カーブ) へつながった = 新 kind 側の relink',
        post83.v11 === 3 && post83.head === 1, '0 -> ' + post83.v11 + '  ' + J(post83.v));
      await pressCtrlZ(page);
      const undo83 = await page.evaluate((snap) => ({
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap,
        kinds: window.__t.items().map(i => i.kind), v: window.__t.variants() }), pre83.snap);
      check('§8 8n ★Ctrl+Z 一発で石柱に戻り、隣の形も 0 (縦) へ巻き戻る',
        undo83.same === true && J(undo83.kinds) === J(['railKit', 'railKit', 'pillar']),
        'deep-equal=' + undo83.same + ' 形=' + J(undo83.v));

      // ── 8-4 「自動でつなぐ」OFF (実チェックボックス) では pickProp でも relink しない ──
      await page.evaluate(() => { const T = window.__t; T.reset(true); T.lay([[10, 5], [10, 6], [10, 7]], 0); });
      await page.click('#propLinkChk');                        // ★実マウスで OFF
      await sleep(80);
      const off8s = await page.evaluate(() => window.__mapEditor.getPropAutoLink());
      await mouseClickTile(page, 10, 6);
      await page.click(PAL('railKit', 1));
      await sleep(80);
      const off8 = await page.evaluate(() => ({ v: window.__t.variants(), mid: window.__t.at(10, 6) }));
      await page.click('#propLinkChk');                        // 戻す
      await sleep(80);
      const back8 = await page.evaluate(() => window.__mapEditor.getPropAutoLink());
      check('§8 8o [装置] 実マウスでチェックを外せた', off8s === false, String(off8s));
      check('§8 8p ★★OFF なら pickProp で選んだ横 (1) がそのまま残り、近傍も書き換わらない',
        off8.mid === 1 && J(off8.v) === J([0, 1, 0]), J(off8.v));
      check('§8 8q チェックを戻すと ON へ復帰', back8 === true, String(back8));

      // ── 8-5 孤立 (mask 0) は選んだ形をそのまま保つ (「カーブを 1 個だけ置きたい」を守る) ──
      await page.evaluate(() => { const T = window.__t; T.reset(true); T.lay([[10, 5]], 0); });
      await mouseClickTile(page, 10, 5);
      await page.click(PAL('railKit', 3));                     // 東南カーブ
      await sleep(80);
      const s85 = await page.evaluate(() => ({ v: window.__t.at(10, 5), n: window.__t.items().length,
        mask: window.__mapEditor.MapDef.railKitMaskAt(window.__mapEditor.getMapDef().props, 10, 5),
        link: window.__mapEditor.getPropAutoLink() }));
      check('§8 8r ★孤立 (mask 0) の線路は ON でも選んだ 3 (東南カーブ) のまま = 勝手に化けない',
        s85.link === true && s85.mask === 0 && s85.v === 3 && s85.n === 1,
        'mask=' + s85.mask + ' variant=' + s85.v + ' autoLink=' + s85.link);

      // ── 8-6 選択が無ければ筆が変わるだけ (履歴も mapDef も動かさない) ──
      const s86 = await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(true); T.lay([[10, 5], [10, 6]], 0);
        E.selectPropAt(-9, -9);                                 // 選択解除
        const before = JSON.stringify(E.getMapDef());
        const sel = E.getPropSelection();
        return { sel, before };
      });
      await page.click(PAL('railKit', 2));
      await sleep(80);
      const post86 = await page.evaluate((before) => ({
        same: JSON.stringify(window.__mapEditor.getMapDef()) === before,
        brush: window.__mapEditor.getPropBrush(), v: window.__t.variants() }), s86.before);
      check('§8 8s 選択中の物が無ければ筆が変わるだけで mapDef は 1 バイトも動かない',
        s86.sel === null && post86.same === true && post86.brush.variant === 2,
        'deep-equal=' + post86.same + ' 筆=' + J(post86.brush) + ' 形=' + J(post86.v));
    }

    // ══════════════════════════════════════════════════════════════════════
    // §G — ★絵の非退行は golden 方式 (固定コミット比較は自己失効して赤いまま安定する)
    // ══════════════════════════════════════════════════════════════════════
    mark('§G 絵 — ★golden 方式で敷いた線路の見た目を 5 シーン');
    {
      // まず前提: テクスチャが実際に効いていること (単色描画を golden に焼き付けない)
      await page.waitForFunction(() => window.__mapEditor.texInfo().active === true,
        { timeout: 20000, polling: 100 }).catch(() => {});
      const t0 = await page.evaluate(() => window.__mapEditor.texInfo());
      check('§G G1 [前提] 本編テクスチャが効いている (ready && active) — 単色を golden に焼かない',
        t0.ready === true && t0.active === true, J([t0.ready, t0.active, t0.themeId, t0.missing]));

      for (const sc of SCENES) {
        await page.evaluate((sc) => {
          const E = window.__mapEditor, T = window.__t;
          T.reset(sc.autoLink);
          T.lay(sc.lay, sc.brush === null ? 0 : sc.brush);
          E.setPropBrush(null);
          E.selectPropAt(-9, -9);                  // 選択リング / キャラのシルエットを消す
          E.setPropScaleRef(false);
          E.hoverTile(null);
          E.state.view.zoom = sc.zoom;
          E.state.view.x = sc.vx; E.state.view.y = sc.vy;
          E.render();
        }, sc);
        // 絵が実際に届くまで待つ (未読み込みの破線の箱を golden に焼き付けない)
        await page.waitForFunction(() => {
          const E = window.__mapEditor;
          E.render();
          const rs = E.propRects();
          return rs.length > 0 && rs.every(r => r.drew);
        }, { timeout: 20000, polling: 120 }).catch(() => {});
        const g = await page.evaluate((crop) => {
          const E = window.__mapEditor;
          const cv = document.getElementById('editorCanvas');
          const dpr = E.state.css.dpr || 1;
          const off = document.createElement('canvas');
          off.width = crop.w; off.height = crop.h;
          const c = off.getContext('2d');
          c.drawImage(cv, 0, 0, crop.w * dpr, crop.h * dpr, 0, 0, crop.w, crop.h);
          const rs = E.propRects();
          return { url: off.toDataURL('image/png'), dpr: dpr,
                   cw: cv.width, ch: cv.height,
                   fits: cv.width >= crop.w * dpr && cv.height >= crop.h * dpr,
                   n: rs.length, drew: rs.filter(r => r.drew).length,
                   w0: rs.length ? Math.round(rs[0].w * 100) / 100 : null,
                   variants: E.propInfo().items.map(i => i.variant) };
        }, CROP);
        const h = sha256(g.url);
        /* ⚠⚠ golden の呼び出しは最終サマリより前に置くこと (後ろだと「N/M PASS なのに
         *   FAILED 一覧が空」という不可解な出方をする)。check() は即時加算なのでここで OK。 */
        G.check(check, '§G G2-' + sc.key + ' ' + sc.label + ' の描画 SHA-256 が golden と一致',
          'canvas-' + sc.key, h);
        check('§G G3-' + sc.key + ' [前提] 絵が実際に貼られている / 切り出し領域が canvas に収まる / dpr=1',
          g.fits === true && g.dpr === 1 && g.n === sc.lay.length && g.drew === g.n &&
          isHex64(h) && g.url.length > 5000,
          'canvas=' + g.cw + 'x' + g.ch + ' 物=' + g.n + ' 絵あり=' + g.drew +
          ' 1個目の幅=' + g.w0 + 'px dataURL長=' + g.url.length);
        check('§G G4-' + sc.key + ' 形が期待どおり ' + J(sc.expect) + ' (SHA が一致しても形が違えば別物)',
          J(g.variants) === J(sc.expect), J(g.variants));
      }
      /* ★golden の空振り防止 (tools/_golden.js の「危険と封じ方」(1)(2))。
       *   G5 = 5 シーンの SHA が**相互に異なる**。描画が死んで一様になった状態を
       *        golden に焼き付けたら即座に落ちる。⚠ 件数でなく identity で測る。
       *   G0 = golden のキー集合と今回の実行が完全一致 (assert をこっそり消していない)。 */
      G.distinct(check, '§G G5 5 シーンの SHA が相互に異なる (描画が死んで一様になっていない)', 'canvas-');
      G.finish(check);
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§E コンソール健全性');
    check('§E Ea pageerror / console.error が 0 件', allErrs.length === 0,
      allErrs.length ? allErrs.slice(0, 4).join(' | ') : 'なし');
    check('§E Eb 意図しない 404 が 0 件 (favicon を除く)', rec.notFound.length === 0,
      rec.notFound.length ? rec.notFound.slice(0, 4).join(' | ') : 'なし');
    check('§E Ec [母集団ガード] サーバが実際に配信している (真空 PASS でない)',
      rec.served > 20, rec.served + ' 本');

  } catch (e) {
    console.error('\n[drv] 例外: ' + ((e && e.stack) || e));
    fail++; fails.push('driver exception');
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }

  console.log('\n' + '═'.repeat(74));
  console.log('  PASS ' + pass + ' / FAIL ' + fail + '  (合計 ' + (pass + fail) + ')');
  if (fail) {
    // ★「どの節が何件落ちたか」を必ず出す (変異負制御の読み取りはここが本体)
    const bySec = {};
    for (const f of fails) {
      const m = /^(§[0-9A-Z])/.exec(f);
      const k = m ? m[1] : '(その他)';
      (bySec[k] = bySec[k] || []).push(f);
    }
    console.log('  落ちた節: ' + Object.keys(bySec).sort()
      .map(k => k + ' ×' + bySec[k].length).join(' / '));
    console.log('  落ちた assert:\n    - ' + fails.join('\n    - '));
  }
  console.log('═'.repeat(74));

  if (MUTATE && fail === 0) {
    console.error('[drv] ⛔ 変異 ' + MUTATE + ' を入れたのに全 PASS = 負のコントロールが死んでいる');
    process.exit(4);
  }
  process.exit(fail ? 1 : 0);
})();
