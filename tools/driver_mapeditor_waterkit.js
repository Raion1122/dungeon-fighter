#!/usr/bin/env node
/*
 * driver_mapeditor_waterkit.js — 「つながる水路 (waterKit) = 水の流れ」の恒久回帰検出器
 *                                = マップエディタ Phase 6 STEP 3
 * ═════════════════════════════════════════════════════════════════════════════
 * ■ 何を守るのか
 *   STEP 2.5 で入れた「プラレールみたいに上下左右つなげれる構造」を、**種を 1 つ足すだけ**で
 *   もう 1 系統 (川・水路) に広げたのが STEP 3。したがってこの検出器の主眼は 2 つ:
 *     ① 水路そのものが敷ける / つながる / 消える / 戻せる (§1〜§5 §8 §G)
 *     ② ★**線路と水路が互いに影響しない**(§6)。ここが STEP 3 で新しく生まれた壊れ方で、
 *        しかも「隣り合ったときだけ」「絵だけが」静かに壊れる = 例外が 1 つも出ない。
 *
 * ■ 対象 (3 ファイルにまたがる 1 本の鎖)
 *   index.html        … SCENERY_SHEETS.waterKit (src / blocking / displayMax:96 / flat)
 *                       SCENERY_FRAMES.waterKit (512 角セル 6 個)。★SCENERY_RECIPES からは
 *                       参照しない = 既定 6 シナリオは 1 ドットも変わらない (§7)
 *   js/df-mapdef.js   … 接続規則の**唯一の正**。CONNECT_KIT_KINDS / isConnectKit /
 *                       connectKitVariantForMask / connectKitMaskAt / connectKitRelinkAt /
 *                       connectKitRelinkAround (すべて純関数・kind パラメータ化済み)
 *   map-editor.html   … autoLinkRails(tx,ty,kind) が唯一の呼び口 (置く/動かす/消す/種を
 *                       差し替える の 4 経路)、「線路・水路を自動でつなぐ」チェック (既定 ON)
 *
 * ■ 何を測るか
 *   §0 装置   公開 API / 検証シーム / DOM (assert が空振りしない前提)
 *   §1 カタログ ★identity で測る (件数ではない)。★displayMax が grid.tile でなければ赤くなる。
 *             ★パレットの data-thumb = "ok" = **絵が本当に読めている**
 *   §2 純関数 ★mask 0〜15 の**全 16 通り** + 変な入力 + 冪等性 (waterKit で測る)
 *   §3 実地   ★★**実マウス** (mousedown/move/up) だけで敷く。直線 / L 字 / T 字・十字 /
 *             ドラッグ移動 / チェック OFF / 他種は無関係
 *   §4 実キー ★**実キーボード** Delete と Ctrl+Z 一発で近傍の化けごと戻る
 *   §5 pickProp ★★**パレットの実クリック**で種類を差し替えても自動接続が走る (判断B)
 *   §6 混在   ★★★**線路と水路は互いを近傍として数えない**。STEP 3 固有の壊れ方。
 *             ⚠ ここは**故意に純関数だけ**で測る。編集経路を混ぜると自動接続を殺す変異
 *               (nolink / kindlist) でも落ちてしまい、「種の分離が壊れた」ことの
 *               専用検出器にならなくなる (負のコントロール crosslink を §6 単独に着弾させる設計)。
 *   §7 非退行 ★既定 6 シナリオは waterKit を 1 個も持たない (レシピにも本編にも) + 本編 canvas
 *   §8 往復   export→import で 1 バイトも変わらない / ★矛盾する variant を矯正しない
 *   §G 絵     ★golden 方式 (tools/_golden.js)。敷いた水路の見た目 5 シーンの SHA-256
 *   §E pageerror / console.error / 意図しない 404 が 0 件
 *
 * ■ ⚠⚠ ベースラインに 2 役を兼務させない (2026-08-03 の恒久教訓)
 *   非退行 = **golden** (`--update-golden` で更新 → git diff に載る → commit でレビュー)。
 *   負のコントロール = **変異注入** (--mutate)。固定コミットとの絵の比較は、幾何を
 *   意図的に動かした瞬間に自己失効して「赤いまま安定」する = 何も検出しなくなる。
 *
 * ■ 変異負制御 (--mutate <kind>) — ★着弾する節の**広さ**をわざとばらけさせた 6 種
 *     kind      | 注入する欠陥                                  | 落ちるべき節
 *     ----------|-----------------------------------------------|-------------------------
 *     nolink    | autoLinkRails() を常に 0 で返す               | §3 §4 §5 §G   (編集経路が全滅)
 *     crosslink | 種の一致判定を isConnectKit へ緩める          | ★**§6 単独** (種の分離だけ)
 *     dispmax   | waterKit の displayMax を 96 → 128            | §1 §G
 *     kindlist  | CONNECT_KIT_KINDS から waterKit を外す        | ★**水路だけ全滅・線路は生存**
 *     recipe    | 既定 6 シナリオのレシピに waterKit を混ぜる   | ★**§7 単独**
 *     label     | PROP_KIND_LABELS.waterKit の呼び名を変える    | ★**§1 単独** (最も細い)
 *   ⚠ 置換対象が 0 件 / 2 件以上なら exit 3 (空振りしたまま PASS を防ぐ)。
 *   ⚠⚠ **置換文字列は必ず 1 行に収めること**。作業ツリーは index.html = CRLF、
 *      js/df-mapdef.js と map-editor.html = LF の**混在**で、"\n" を含む複数行の
 *      置換は CRLF 側で原理的に一致せず exit 3 で空振りする (2026-08-04 に実際に踏んだ)。
 *   ⚠ 変異は**ディスクを書き換えず配信をメモリ上で差し替える** = 復元漏れが原理的に起きない。
 *      ただし fs で作業ツリーを直接読む assert には効かない → §7 は**ブラウザ側**で
 *      SCENERY_RECIPES を読む (作業ツリーを読むだけだと recipe 変異が空振りする)。
 *
 * ■ 使い方
 *     node tools/driver_mapeditor_waterkit.js [--headful] [--port N] [--browser <path>]
 *          [--mutate nolink|crosslink|dispmax|kindlist|recipe|label] [--update-golden]
 *          [--shots <dir>]   ← 目視用の PNG を書き出す (assert には使わない)
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
 *   8941 が空いていることは `grep -rn "arg('port'" tools/*.js` の数え上げで実測済み
 *   (2026-08-04)。マップエディタ系の実使用は 8861 / 8901(+8902) / 8921 / 8931 / 8951 /
 *   8955 / 8965 / 8985(props と painting が重複)。 */
const PORT = parseInt(arg('port', '8941'), 10);
const MUTATE = arg('mutate', null);
const SHOTS = arg('shots', null);

const UPDATE_GOLDEN = flag('update-golden');
const G = require('./_golden')('mapeditor_waterkit',
  { update: UPDATE_GOLDEN, driver: 'driver_mapeditor_waterkit' });

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ① 自動接続そのものを殺す。→ パレットで選んだ形が置きっぱなしになり「つながらない」。
   *    ⚠ 1 行に収める (関数の中身を消すのではなく、条件行の後ろに無条件 return を足す)。
   *    ⚠ §6 は純関数だけで測るのでここは**落ちない** = 節の切り分けの証明。 */
  nolink: [
    ['    if (!state.propAutoLink) return 0;',
     '    if (!state.propAutoLink) return 0; return 0;   /* ★変異: 自動接続を殺す */'],
  ],
  /* ② ★STEP 3 固有の壊れ方。「同じ種か」の判定 (p.kind === kind) を「つながる種か」
   *    (isConnectKit) へ緩めると、**線路と水路が互いを近傍として数え始める**。
   *    → 川のそばに線路を敷いた瞬間に両方の形が化ける。例外は 1 つも出ない。
   *    ⭐ §6 だけに着弾するはず (§2 は接続キット以外 = pillar / 散布 rail しか隣に置かない)。 */
  crosslink: [
    ['    return !!p && p.kind === kind && (p.tx | 0) === tx && (p.ty | 0) === ty;',
     '    return !!p && isConnectKit(p.kind) && (p.tx | 0) === tx && (p.ty | 0) === ty;   /* ★変異 */'],
  ],
  /* ③ 描画サイズをマス (96) からずらす。→ 絵はそのままだが接続点がマスの境界に来なくなり、
   *    敷いても線がつながって見えない。**数値では例外が 1 つも出ない**種類の欠陥。
   *    ⚠ railKit 側と src の綴りが違うので、両方とも 1 行で一意に狙える。 */
  dispmax: [
    ['      waterKit: { src: "assets/water_kit.png?v=2", displayMax: 96, flat: true,',
     '      waterKit: { src: "assets/water_kit.png?v=2", displayMax: 128, flat: true,   /* ★変異 */'],
  ],
  /* ④ ★「つながる種の一覧」から水路だけを外す = STEP 3 の登録を取り消す。
   *    → **水路だけが全滅し、線路は生きたまま**。§6 6f/6h (線路側) が PASS のまま
   *      残ることで「水路だけが死んだ」と読み取れる = 種ごとの独立性の裏面の証明。 */
  kindlist: [
    ['  var CONNECT_KIT_KINDS = [RAIL_KIT_KIND, WATER_KIT_KIND];',
     '  var CONNECT_KIT_KINDS = [RAIL_KIT_KIND];   /* ★変異: 水路を接続キットから外す */'],
  ],
  /* ⑤ 既定 6 シナリオのレシピに waterKit を混ぜる。→ 廃坑の山場に散布水路が湧く =
   *    「mapDef.props 専用の別種」という設計が崩れ、既存マップの見た目が変わる。
   *    ⚠ 作業ツリーを fs で読むだけの assert には効かないので、§7 は**ブラウザ側**で
   *      SCENERY_RECIPES と sceneryPlacements を読む。 */
  recipe: [
    ['counts: { rubble: 18, rail: 7, cart: 4 }', 'counts: { rubble: 18, rail: 7, cart: 4, waterKit: 6 }'],
  ],
  /* ⑥ 呼び名だけを変える**最も細い**変異。パレットの見出しと propEntries().label にしか
   *    出ないので §1 単独に着弾する = identity assert が本当に文言を見ている証明。 */
  label: [
    ['    waterKit: "水の流れ",', '    waterKit: "水路",   /* ★変異: 呼び名を変える */'],
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

// 目視用スクリーンショット (assert には使わない。--shots <dir> のときだけ書く)
function saveShot(name, dataUrl) {
  if (!SHOTS) return;
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(b64, 'base64'));
    console.log('  [shot] ' + path.join(SHOTS, name + '.png'));
  } catch (e) { console.log('  [shot] 書き出し失敗: ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
// Node 側で index.html を**独立に**パースして期待値を作る
//   ★df-mapdef.js の実装を通さずに素の index.html から読む。
//   ⚠ 読むのは**作業ツリーのファイル** = --mutate で配信を差し替えても、ここは元のまま。
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
//     実マウス経路を一度も通していなかった」こと。§3 〜 §5 は必ずここを通す。
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
//   ★brush は「つながった結果と**違う**形」を選んである = 自動接続が死ぬと絵が必ず変わる。
// ══════════════════════════════════════════════════════════════════════════════
const CROP = { w: 600, h: 480 };
const SCENES = [
  { key: 'V', label: '縦の流れ', brush: 1, autoLink: true, zoom: 1,
    vx: 27.5 * 96, vy: 9 * 96,
    lay: [[30, 10], [30, 11], [30, 12]],
    expect: [0, 0, 0] },
  { key: 'L', label: 'L 字 (カーブ)', brush: 0, autoLink: true, zoom: 1,
    vx: 27 * 96, vy: 9 * 96,
    lay: [[28, 10], [29, 10], [30, 10], [30, 11], [30, 12]],
    expect: [1, 1, 4, 0, 0] },
  { key: 'X', label: '十字', brush: 2, autoLink: true, zoom: 1,
    vx: 31 * 96, vy: 13 * 96,
    lay: [[33, 14], [33, 16], [32, 15], [34, 15], [33, 15]],
    expect: [0, 0, 1, 1, 0] },
  { key: 'T', label: 'T 字', brush: 2, autoLink: true, zoom: 1,
    vx: 36 * 96, vy: 14 * 96,
    lay: [[38, 15], [38, 17], [39, 16], [38, 16]],
    expect: [0, 0, 1, 0] },
  /* ★6 ピースの絵そのものの非退行。自動接続 OFF なので隣り合っていても化けない。
   *   ⚠ このシーンだけは nolink / kindlist で**落ちない** (元から relink しない) =
   *     「絵が変わったのか / つながり方が変わったのか」を切り分ける物差しになる。 */
  { key: 'P6', label: '6 ピース素貼り', brush: null, autoLink: false, zoom: 1,
    vx: 25.7 * 96, vy: 10 * 96,
    lay: [[26, 12, 0], [27, 12, 1], [28, 12, 2], [29, 12, 3], [30, 12, 4], [31, 12, 5]],
    expect: [0, 1, 2, 3, 4, 5] },
];

// ══════════════════════════════════════════════════════════════════════════════
// §7 用: 本編 (index.html) を決定論で立ち上げる
// ══════════════════════════════════════════════════════════════════════════════
const GAME_T0 = 1780000000000;   // 固定時刻 (雲/明滅など時刻依存の演出を止める)
const GAME_SEED = 20260804;
function gamePreload(cfg) {
  try {
    sessionStorage.setItem('dragonfighters.currentScenario', cfg.scen);
    sessionStorage.removeItem('dragonfighters.generatedScenario');
    sessionStorage.removeItem('dragonfighters.questFlags');
  } catch (e) {}
  // 時刻を凍結 (⚠ 屋外で drawImage を数えるときの定石。canvas の SHA も時刻で揺れる)
  const T0 = cfg.t0;
  const OrigDate = Date;
  window.Date = function (a) { return arguments.length ? new OrigDate(a) : new OrigDate(T0); };
  window.Date.now = function () { return T0; };
  window.Date.prototype = OrigDate.prototype;
  // Math.random を固定シードの LCG へ (罠/宝箱の座標が毎回変わると canvas SHA が揺れる)
  let _s = (cfg.seed || 1) >>> 0;
  Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  // 画像ロード待ち用に Image を追跡 (未ロードのまま toDataURL を取るとフォールバック同士の比較になる)
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
async function waitImages(page) {
  const snap = () => page.evaluate(() => {
    const a = (window.__imgs || []).concat(Array.prototype.slice.call(document.images || []));
    let done = 0;
    for (const i of a) { if (!i.src || i.complete) done++; }
    return { total: a.length, done };
  });
  const t0 = Date.now();
  let prev = { total: -1, done: -1 }, stable = 0;
  while (Date.now() - t0 < 40000) {
    const s = await snap();
    if (s.total > 0 && s.done === s.total && s.total === prev.total) { stable++; if (stable >= 3) return s; }
    else stable = 0;
    prev = s;
    await sleep(250);
  }
  console.warn('[drv] 画像ロード待ちがタイムアウト');
  return prev;
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = makeProfile('df_waterkit_');
  const IDX = readIndex();

  let srv = null, browser = null, rec = null;
  const allErrs = [];
  const BASE = 'http://127.0.0.1:' + PORT;
  try {
    const a = await startServer(PORT, ROOT);
    srv = a.srv; rec = a.rec;
    console.log('[drv] root=' + ROOT + '  ' + BASE);
    console.log('[drv] mutate=' + (MUTATE || 'なし') + '  golden=' + (UPDATE_GOLDEN ? '★記録モード' : G.rel));
    console.log('[drv] index.html から独立に読んだ waterKit: 枠 ' +
      (IDX.frames.waterKit || []).length + ' 個 / displayMax=' +
      (IDX.sheets.waterKit || {}).displayMax);

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

    // ページ側の共通ヘルパ (★既定の種は waterKit)
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
        lay(list, v, kind) {     // シーム経路 (§1/§2/§6/§8/§G の下ごしらえ用。§3〜§5 は実マウス)
          const out = [];
          for (const item of list) {
            const tx = item[0], ty = item[1];
            const vv = (item.length > 2) ? item[2] : v;
            E.setPropBrush(kind || 'waterKit', vv);
            out.push(E.placeProp(tx, ty).ok);
          }
          return out;
        },
        items() { return E.propInfo().items.map(i => ({ kind: i.kind, variant: i.variant, tx: i.tx, ty: i.ty })); },
        at(tx, ty) { const f = this.items().filter(i => i.tx === tx && i.ty === ty); return f.length ? f[0].variant : null; },
        variants() { return this.items().map(i => i.variant); },
        kinds() { return this.items().map(i => i.kind); },
      };
    });

    // ══════════════════════════════════════════════════════════════════════
    mark('§0 装置 — assert が空振りしない前提');
    {
      const d0 = await page.evaluate(() => {
        const E = window.__mapEditor, M = E.MapDef;
        const q = (id) => document.getElementById(id);
        return {
          fnMissing: ['isConnectKit', 'connectKitVariantForMask', 'connectKitMaskAt',
                      'connectKitRelinkAt', 'connectKitRelinkAround',
                      'propEntries', 'propDrawSize', 'propFootprint', 'propBlocking']
                     .filter(k => typeof M[k] !== 'function'),
          seamMissing: ['setPropBrush', 'placeProp', 'moveProp', 'deleteProp', 'selectPropAt',
                        'propInfo', 'propPaletteInfo', 'setPropAutoLink', 'getPropAutoLink',
                        'exportJSON', 'importJSON', 'lint', 'undo', 'texInfo', 'hoverTile']
                       .filter(k => typeof E[k] !== 'function'),
          waterKind: M.WATER_KIT_KIND, railKind: M.RAIL_KIT_KIND, masks: M.RAIL_VARIANT_MASKS,
          tools: E.TOOLS.map(t => t.key),
          dom: { link: !!q('propLinkRow'), chk: !!q('propLinkChk'), hist: !!q('histBtns'),
                 undo: !!q('btnUndo'), redo: !!q('btnRedo'), tool: !!q('toolBtns'),
                 canvas: !!q('editorCanvas'), list: !!q('propList') },
          chkLabel: q('propLinkRow') ? q('propLinkRow').textContent.trim() : '',
          lintShape: (function () { const r = E.lint(); return [typeof r, Array.isArray(r.errors), Array.isArray(r.warnings)]; })(),
        };
      });
      check('§0 0a DFMapDef に kind パラメータ化した接続 API 5 本 + 情景 4 本がある',
        d0.fnMissing.length === 0, '欠け=' + J(d0.fnMissing));
      check('§0 0b __mapEditor に必要な検証シーム 15 本がある',
        d0.seamMissing.length === 0, '欠け=' + J(d0.seamMissing));
      check('§0 0c WATER_KIT_KIND = "waterKit" / RAIL_KIT_KIND = "railKit" / ' +
        'RAIL_VARIANT_MASKS = [5,10,3,6,12,9] (6 ピースの並びは全キット共通)',
        d0.waterKind === 'waterKit' && d0.railKind === 'railKit' &&
        J(d0.masks) === J([5, 10, 3, 6, 12, 9]),
        d0.waterKind + ' / ' + d0.railKind + ' / ' + J(d0.masks));
      check('§0 0d ツール "prop" が TOOLS の末尾 (数字キーの割当を既存ツールから奪っていない)',
        d0.tools[d0.tools.length - 1] === 'prop' && d0.tools.length === 9, J(d0.tools));
      check('§0 0e 自動接続の DOM 2 要素 + 履歴/ツール/canvas/パレットの DOM がある',
        Object.keys(d0.dom).every(k => d0.dom[k]), J(d0.dom));
      /* ⚠ STEP 3 で水路が同じ機構に乗ったので文言が「線路・水路」に広がった。
       *   ここは**文言そのもの**を見る assert なので、UI を直したらここも直す (2026-08-04)。 */
      check('§0 0f チェックボックスの文言が「線路・水路を自動でつなぐ」 (線路限定のままでない)',
        /線路・水路を自動でつなぐ/.test(d0.chkLabel), d0.chkLabel);
      check('§0 0g lint() は配列ではなく { errors, warnings } を返す (取り違え防止)',
        d0.lintShape[0] === 'object' && d0.lintShape[1] === true && d0.lintShape[2] === true, J(d0.lintShape));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§1 カタログ — ★identity で測る (件数ではない)');
    {
      // パレットのサムネが実際に描き終わるまで待つ (「絵が読めていない」を golden 前に検出する)
      await page.evaluate(() => { window.__t.reset(true); });
      await page.waitForFunction(() => {
        const its = document.querySelectorAll('#propList .propItem[data-kind="waterKit"]');
        return its.length === 6 &&
          Array.prototype.every.call(its, e => e.getAttribute('data-thumb') !== 'pending');
      }, { timeout: 20000, polling: 100 }).catch(() => {});

      const c1 = await page.evaluate(() => {
        const E = window.__mapEditor, M = E.MapDef;
        const sheets = M.getScenerySheets(), frames = M.getSceneryFrames();
        const es = M.propEntries();
        const wk = es.filter(e => e.kind === 'waterKit');
        const pal = Array.prototype.map.call(
          document.querySelectorAll('#propList .propItem[data-kind="waterKit"]'),
          e => [+e.getAttribute('data-variant'), e.getAttribute('data-thumb'),
                e.getAttribute('data-blocking')]);
        return {
          kinds: Array.from(new Set(es.map(e => e.kind))),
          wk: wk.map(e => [e.variant, e.src, e.frame, Math.round(e.dw * 100) / 100,
                           Math.round(e.dh * 100) / 100, e.blocking, e.tw, e.th, e.sizeLabel, e.label]),
          sheet: { src: sheets.waterKit.src, blocking: sheets.waterKit.blocking,
                   displayMax: sheets.waterKit.displayMax, flat: sheets.waterKit.flat },
          frames: frames.waterKit,
          tile: M.DEFAULT_DUNGEON.grid.tile,
          label: M.PROP_KIND_LABELS ? M.PROP_KIND_LABELS.waterKit : null,
          kitKinds: M.CONNECT_KIT_KINDS ? M.CONNECT_KIT_KINDS.slice() : null,
          isKit: [M.isConnectKit('waterKit'), M.isConnectKit('railKit')],
          railKit: { n: es.filter(e => e.kind === 'railKit').length, src: sheets.railKit.src,
                     displayMax: sheets.railKit.displayMax, flat: sheets.railKit.flat },
          oob: M.propDrawSize('waterKit', 6),
          pal,
        };
      });
      /* ⚠ 恒久教訓: グローバルな件数でなく **identity** (キーの明示リスト) で測る。
       *   種を 1 つ足すとここも直す = カタログの identity をコミットに書き残す装置。
       *   ⚠ 同じ identity assert が driver_mapeditor_props §1 1b / painting §1 1i・§6 6a /
       *     railkit §1 1a にもある (**4 ファイル 5 箇所**)。1 つ足すと全部が追随を要求する。 */
      check('§1 1a 種が 13 (既存 7 + Phase6 STEP2 の 4 + STEP2.5 の railKit + STEP3 の waterKit)',
        J(c1.kinds) === J(['grass', 'reed', 'log', 'detail', 'rubble', 'cart', 'rail',
                           'pillar', 'chair', 'table', 'wreck', 'railKit', 'waterKit']), J(c1.kinds));
      check('§1 1b waterKit が 6 ピース / variant が 0..5 で欠番なし',
        c1.wk.length === 6 && J(c1.wk.map(e => e[0])) === J([0, 1, 2, 3, 4, 5]),
        J(c1.wk.map(e => e[0])));
      check('§1 1c 枠が 512 角セル 6 個 (x = 0/512/1024/1536/2048/2560, y = 0)',
        J(c1.frames) === J([0, 512, 1024, 1536, 2048, 2560].map(x => ({ x: x, y: 0, w: 512, h: 512 }))),
        J((c1.frames || []).map(f => f.x + 'x' + f.w)));
      /* ⚠ ?v=2 まで含めて見る。2026-08-04 に **同名で中身を差し替えた** ので、
       *   キャッシュバスターが外れると実機が旧「管」の水を表示し続ける (気づけない欠陥)。 */
      check('§1 1d 画像は assets/water_kit.png?v=2 (線路の使い回しでなく ?v= も付いている)',
        c1.sheet.src === 'assets/water_kit.png?v=2' &&
        c1.wk.every(e => e[1] === 'assets/water_kit.png?v=2'),
        c1.sheet.src);
      check('§1 1e blocking が 6 変種すべて false / flat が true (浅い流れ = 上を渡れる)',
        J(c1.sheet.blocking) === J([false, false, false, false, false, false]) &&
        c1.sheet.flat === true && c1.wk.every(e => e[5] === false),
        J(c1.sheet.blocking) + ' flat=' + c1.sheet.flat);
      /* ★★1f = この節の心臓部。displayMax がマス (96) からずれると、絵は出るのに
       *   接続点がマス境界に来なくなり「敷いてもつながらない」。数値は例外を出さない。
       *   ⚠ 96 は **TILE_SIZE そのもの**なので、grid.tile から引いて突き合わせる
       *     (「96」を写経して両方いっしょに書き換わる事故を避ける)。 */
      check('§1 1f ★★displayMax が 1 マス (grid.tile = ' + c1.tile + ') ちょうど / 6 変種とも dw=dh=1マス',
        c1.sheet.displayMax === c1.tile &&
        c1.wk.every(e => near(e[3], c1.tile, 0.001) && near(e[4], c1.tile, 0.001)),
        'displayMax=' + c1.sheet.displayMax + ' 実寸=' + J(c1.wk.map(e => e[3] + 'x' + e[4])[0]) +
        ' ← ずれると接続点がマス境界から外れて「つながらない」');
      check('§1 1g 作業ツリーの index.html を独立に読んだ値も同じ (displayMax 96 / 枠 512角×6 / blocking / flat)',
        IDX.sheets.waterKit.displayMax === 96 && IDX.sheets.waterKit.flat === true &&
        (IDX.frames.waterKit || []).length === 6 &&
        IDX.frames.waterKit.every(f => f.w === 512 && f.h === 512) &&
        J(IDX.sheets.waterKit.blocking) === J([false, false, false, false, false, false]),
        'index.html: displayMax=' + IDX.sheets.waterKit.displayMax + ' 枠=' +
        (IDX.frames.waterKit || []).length + ' 個');
      check('§1 1h 塞ぐマスが 1×1 / 実寸ラベルが全件 "2.9m × 2.9m" (接続タイルなので仕様どおり)',
        c1.wk.every(e => e[6] === 1 && e[7] === 1 && e[8] === '2.9m × 2.9m'),
        J(c1.wk.map(e => e[8])[0]) + ' ' + J(c1.wk.map(e => e[6] + 'x' + e[7])[0]));
      check('§1 1i 呼び名が「水の流れ」/ ラベルが「水の流れ 1」..「水の流れ 6」形式',
        c1.label === '水の流れ' && /^水の流れ 1$/.test(c1.wk[0][9]) &&
        /^水の流れ 6$/.test(c1.wk[5][9]), c1.label + ' / ' + J(c1.wk.map(e => e[9])));
      check('§1 1j ★waterKit が「つながる種」として登録されている ' +
        '(CONNECT_KIT_KINDS = ["railKit","waterKit"] / isConnectKit が両方 true)',
        J(c1.kitKinds) === J(['railKit', 'waterKit']) && J(c1.isKit) === J([true, true]),
        J(c1.kitKinds) + ' isConnectKit=' + J(c1.isKit));
      /* ★既存 railKit に手を入れていないこと。variant は保存値なので、ピースを足したり
       *   並びを変えたりすると**保存済みの線路マップが化ける**。 */
      check('§1 1k ★既存 railKit が無傷 (6 ピース / mine_rail_kit.png / displayMax 96 / flat)',
        c1.railKit.n === 6 && c1.railKit.src === 'assets/mine_rail_kit.png' &&
        c1.railKit.displayMax === 96 && c1.railKit.flat === true, J(c1.railKit));
      check('§1 1l 枠の外の variant は null (配列外アクセスで落ちない)', c1.oob === null, String(c1.oob));
      /* ★★1m = 「絵が本当に読めているか」。src の綴り違いや PNG 欠損は data-thumb が
       *   "fallback" になるだけで例外を出さない = 画面を見ないと気づけない種類の欠陥。 */
      check('§1 1m ★★パレットに waterKit が 6 個並び、サムネが全部 "ok" (絵が実際に読めている)',
        c1.pal.length === 6 && J(c1.pal.map(p => p[0])) === J([0, 1, 2, 3, 4, 5]) &&
        c1.pal.every(p => p[1] === 'ok') && c1.pal.every(p => p[2] !== '1'),
        J(c1.pal.map(p => p[0] + ':' + p[1])));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§2 純関数 — ★mask 0〜15 の全 16 通り (接続規則の唯一の正)');
    {
      /* 期待表は**ドライバ側に literal で書く** = 実装を読んで作らない。
       * 0 は null (孤立 = 変更しない) で、これがユーザーの「カーブを 1 個だけ置きたい」を守る。
       * ⚠ この節では waterKit の隣に**接続キットを置かない** (pillar / 散布 rail / cart だけ) =
       *   crosslink 変異では落ちない = §6 との切り分けが成立する。 */
      const EXPECT = { 0: null, 1: 0, 2: 1, 3: 2, 4: 0, 5: 0, 6: 3, 7: 0,
                       8: 1, 9: 5, 10: 1, 11: 1, 12: 4, 13: 0, 14: 1, 15: 0 };
      const NAME = (m) => (['N', 'E', 'S', 'W'].filter((_, i) => m & (1 << i)).join('+') || '(孤立)');
      const c2 = await page.evaluate(() => {
        const M = window.__mapEditor.MapDef;
        const W = 'waterKit';
        const table = [];
        for (let m = 0; m <= 15; m++) table.push(M.connectKitVariantForMask(m));
        const back = M.RAIL_VARIANT_MASKS.map(mk => M.connectKitVariantForMask(mk));
        const weird = [M.connectKitVariantForMask(null), M.connectKitVariantForMask(NaN),
                       M.connectKitVariantForMask('3'), M.connectKitVariantForMask(16),
                       M.connectKitVariantForMask(21)];
        const solo = [{ kind: W, variant: 0, tx: 10, ty: 10 }];
        const cross = [{ kind: W, variant: 0, tx: 10, ty: 10 },
                       { kind: W, variant: 0, tx: 10, ty: 9 },
                       { kind: W, variant: 0, tx: 11, ty: 10 },
                       { kind: W, variant: 0, tx: 10, ty: 11 },
                       { kind: W, variant: 0, tx: 9, ty: 10 }];
        // ★接続キットでない隣人 (石柱 / 散布 rail / トロッコ) は 1 つも数えない
        const other = [{ kind: W, variant: 0, tx: 10, ty: 10 },
                       { kind: 'rail', variant: 0, tx: 10, ty: 9 },
                       { kind: 'pillar', variant: 0, tx: 11, ty: 10 },
                       { kind: 'cart', variant: 0, tx: 10, ty: 11 }];
        // 冪等性: 2 回目は 0 件しか書き換わらない
        const idem = cross.map(p => ({ kind: p.kind, variant: p.variant, tx: p.tx, ty: p.ty }));
        const n1 = M.connectKitRelinkAround(idem, 10, 10, W);
        const n2 = M.connectKitRelinkAround(idem, 10, 10, W);
        // 孤立したカーブは書き換えない (ユーザーが 1 個だけ意図して置いた形を守る)
        const lone = [{ kind: W, variant: 3, tx: 20, ty: 20 }];
        const nLone = M.connectKitRelinkAround(lone, 20, 20, W);
        return {
          table, back, weird,
          maskSolo: M.connectKitMaskAt(solo, 10, 10, W),
          maskCross: M.connectKitMaskAt(cross, 10, 10, W),
          maskOther: M.connectKitMaskAt(other, 10, 10, W),
          maskNotArr: M.connectKitMaskAt(null, 10, 10, W),
          maskNoKind: [M.connectKitMaskAt(cross, 10, 10, ''), M.connectKitMaskAt(cross, 10, 10, null)],
          relinkNone: M.connectKitRelinkAt(solo, 44, 44, W),
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
      check('§2 2e connectKitMaskAt は**自分のマスを見ない** (1 個だけなら mask 0)',
        c2.maskSolo === 0, String(c2.maskSolo));
      check('§2 2f 上下左右 4 方向すべてを見る (十字なら mask 15)', c2.maskCross === 15, String(c2.maskCross));
      check('§2 2g ★つながる種でない隣人 (散布 rail / 石柱 / トロッコ) は 1 つも数えない',
        c2.maskOther === 0, String(c2.maskOther));
      check('§2 2h props が配列でなければ 0 (落ちない)', c2.maskNotArr === 0, String(c2.maskNotArr));
      check('§2 2i kind が空文字 / null なら 0 (種を渡し忘れても暴走しない)',
        J(c2.maskNoKind) === J([0, 0]), J(c2.maskNoKind));
      check('§2 2j そのタイルに waterKit が無ければ 0 件しか書き換えない',
        c2.relinkNone === 0, String(c2.relinkNone));
      check('§2 2k ★冪等 — 2 回目の relink は 0 件 (何度呼んでも同じ)',
        c2.n1 > 0 && c2.n2 === 0, '1回目=' + c2.n1 + ' 2回目=' + c2.n2 + ' 形=' + J(c2.idem));
      check('§2 2l ★孤立したカーブ (variant 3) は relink しても 3 のまま',
        c2.nLone === 0 && c2.loneV === 3, 'n=' + c2.nLone + ' variant=' + c2.loneV);
    }

    // ══════════════════════════════════════════════════════════════════════
    // §3 — ★★実マウスだけで敷く
    //   ⚠ 既存 4 本が不具合を素通しした真因は「dragTile シームしか叩いていない」こと。
    // ══════════════════════════════════════════════════════════════════════
    mark('§3 実地 — ★★実マウス経路で水路を敷く / 曲がる / 動かす');
    {
      // ── 3-1 直線 (パレットで選んだ向きと逆に敷いても、つながる向きへ化ける) ──
      await page.evaluate(() => { window.__t.reset(true); window.__mapEditor.setPropBrush('waterKit', 0); });
      const aim0 = await mouseClickTile(page, 28, 10);
      check('§3 3a [装置] canvas が実マウスを打てる大きさで、狙った位置に届いている',
        aim0.fits === true && aim0.cw >= 640 && aim0.ch >= 520, 'canvas=' + aim0.cw + 'x' + aim0.ch);
      await page.evaluate(() => window.__mapEditor.setPropBrush('waterKit', 0));
      await mouseClickTile(page, 29, 10);
      await page.evaluate(() => window.__mapEditor.setPropBrush('waterKit', 0));
      await mouseClickTile(page, 30, 10);
      const s31 = await page.evaluate(() => ({ items: window.__t.items(), kinds: window.__t.kinds() }));
      check('§3 3b ★実マウスで横 3 連を「縦」の筆で置いた → 3 個とも 1 (横) に化けた',
        s31.items.length === 3 && s31.items.every(i => i.variant === 1) &&
        s31.kinds.every(k => k === 'waterKit'), show(s31.items));

      // ── 3-2 L 字 = 南へ 1 個足した瞬間に角がカーブへ化ける ──
      const before32 = await page.evaluate(() => window.__t.at(30, 10));
      await page.evaluate(() => window.__mapEditor.setPropBrush('waterKit', 0));
      await mouseClickTile(page, 30, 11);
      const s32 = await page.evaluate(() => ({ corner: window.__t.at(30, 10), items: window.__t.items() }));
      check('§3 3c ★★実マウスで南へ 1 個足すと角 (30,10) が 1 (横) → 4 (南西カーブ) に化ける',
        before32 === 1 && s32.corner === 4, before32 + ' -> ' + s32.corner + '  ' + show(s32.items));
      await page.evaluate(() => window.__mapEditor.setPropBrush('waterKit', 0));
      await mouseClickTile(page, 30, 12);
      const s32b = await page.evaluate(() => window.__t.variants());
      check('§3 3d L 字 5 個の形が [1,1,4,0,0] (横-横-カーブ-縦-縦)',
        J(s32b) === J([1, 1, 4, 0, 0]), J(s32b));

      // ── 3-3 既存の物の上をクリックすると掴む (二重に置かない) ──
      await mouseClickTile(page, 30, 11);
      const sel33 = await page.evaluate(() => ({ sel: window.__mapEditor.getPropSelection(),
                                                 n: window.__t.items().length }));
      check('§3 3e 既存の物の上を実マウスでクリックすると**掴む** (二重に置かない)',
        sel33.sel !== null && typeof sel33.sel.index === 'number' && sel33.n === 5,
        J(sel33.sel) + ' n=' + sel33.n);

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
      check('§3 3f 移動前: 角 (30,10)=4 / 尾 (30,11)=0 / (36,11)=0',
        pre34.corner === 4 && pre34.tail === 0 && pre34.v11 === 0, J(pre34));
      check('§3 3g ★実マウスのドラッグで移動できた / 移動元のマスは空になった',
        post34.gone === null && post34.n === 6, 'at(30,11)=' + post34.gone + ' n=' + post34.n);
      check('§3 3h ★★移動**元**の隣 (30,10) が 4 (カーブ) → 1 (横の終端) に選び直された',
        post34.corner === 1, '4 -> ' + post34.corner);
      check('§3 3i ★★移動**先**の隣 (36,11) が 0 (縦) → 2 (北東カーブ) に選び直された',
        post34.v11 === 2, '0 -> ' + post34.v11);
      check('§3 3j 移動した本人 (37,11) も 0 (縦) → 1 (横の終端) になった',
        post34.moved === 1, '0 -> ' + post34.moved);

      // ── 3-5 T 字 / 十字 = フォールバック表どおり ──
      //   ★筆は 2 (北東カーブ) = 表が効かないと 2 のまま残る
      const s35 = await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t, M = E.MapDef;
        T.reset(true);
        T.lay([[33, 14], [33, 16], [32, 15], [34, 15], [33, 15]], 2);   // 十字 (mask 15)
        const cross = { v: T.at(33, 15), mask: M.connectKitMaskAt(E.getMapDef().props, 33, 15, 'waterKit'),
                        all: T.variants() };
        T.reset(true);
        T.lay([[38, 15], [38, 17], [39, 16], [38, 16]], 2);             // T 字 N+E+S (mask 7)
        const t7 = { v: T.at(38, 16), mask: M.connectKitMaskAt(E.getMapDef().props, 38, 16, 'waterKit'),
                     all: T.variants() };
        T.reset(true);
        T.lay([[27, 10], [29, 10], [28, 11], [28, 10]], 2);             // T 字 E+S+W (mask 14)
        const t14 = { v: T.at(28, 10), mask: M.connectKitMaskAt(E.getMapDef().props, 28, 10, 'waterKit') };
        return { cross, t7, t14 };
      });
      check('§3 3k 十字 (mask 15) → 0 (縦)。筆は 2 なので表が効かないと 2 のまま残る',
        s35.cross.mask === 15 && s35.cross.v === 0 && J(s35.cross.all) === J([0, 0, 1, 1, 0]),
        'mask=' + s35.cross.mask + ' variant=' + s35.cross.v + ' 全体=' + J(s35.cross.all));
      check('§3 3l T 字 北+東+南 (mask 7) → 0 (縦)',
        s35.t7.mask === 7 && s35.t7.v === 0 && J(s35.t7.all) === J([0, 0, 1, 0]),
        'mask=' + s35.t7.mask + ' variant=' + s35.t7.v + ' 全体=' + J(s35.t7.all));
      check('§3 3m T 字 東+南+西 (mask 14) → 1 (横)',
        s35.t14.mask === 14 && s35.t14.v === 1, 'mask=' + s35.t14.mask + ' variant=' + s35.t14.v);

      // ── 3-6 OFF (実チェックボックスのクリック) ──
      await page.evaluate(() => { window.__t.reset(true); window.__mapEditor.setPropBrush('waterKit', 0); });
      await mouseClickTile(page, 28, 10);
      await page.evaluate(() => window.__mapEditor.setPropBrush('waterKit', 0));
      await mouseClickTile(page, 29, 10);
      const on36 = await page.evaluate(() => window.__t.variants());
      await page.click('#propLinkChk');                       // ★実マウスでチェックを外す
      await sleep(80);
      const off36state = await page.evaluate(() => ({ info: window.__mapEditor.propInfo().autoLink,
                                                      get: window.__mapEditor.getPropAutoLink(),
                                                      pal: window.__mapEditor.propPaletteInfo().autoLink }));
      await page.evaluate(() => window.__mapEditor.setPropBrush('waterKit', 2));   // 北東カーブ
      await mouseClickTile(page, 30, 10);                     // 本来なら横に化ける位置
      const off36 = await page.evaluate(() => ({ v: window.__t.variants(), neighbor: window.__t.at(29, 10) }));
      await page.click('#propLinkChk');                       // 戻す
      await sleep(80);
      const back36 = await page.evaluate(() => window.__mapEditor.getPropAutoLink());
      check('§3 3n ON のうちは 2 個とも 1 (横)', J(on36) === J([1, 1]), J(on36));
      check('§3 3o ★実マウスでチェックを外すと 3 つの読み口すべてが false',
        off36state.info === false && off36state.get === false && off36state.pal === false, J(off36state));
      check('§3 3p ★★OFF で置いた北東カーブ (variant 2) がそのまま残る', off36.v[2] === 2, J(off36.v));
      check('§3 3q ★★OFF では近傍 (29,10) も 1 のまま書き換わらない',
        off36.neighbor === 1, String(off36.neighbor));
      check('§3 3r チェックを戻すと ON へ復帰', back36 === true, String(back36));

      // ── 3-7 つながる種でない物 (石柱) は水路に無関係 ──
      const s37 = await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10], [30, 11]], 0);
        const before = T.variants();
        E.setPropBrush('pillar', 0);
        const r = [E.placeProp(29, 9), E.placeProp(29, 11), E.placeProp(27, 10), E.placeProp(31, 10)];
        const waters = T.items().filter(i => i.kind === 'waterKit').map(i => i.variant);
        const kinds = T.kinds();
        return { before, waters, ok: r.every(x => x.ok),
                 nWater: kinds.filter(k => k === 'waterKit').length,
                 nPillar: kinds.filter(k => k === 'pillar').length };
      });
      check('§3 3s ★水路の四方に石柱を置いても水路の形は 1 個も変わらない',
        s37.ok === true && J(s37.before) === J(s37.waters) && s37.nWater === 4 && s37.nPillar === 4,
        J(s37.before) + ' -> ' + J(s37.waters) + ' (waterKit ' + s37.nWater + ' / pillar ' + s37.nPillar + ')');
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§4 実キーボード — ★Delete で終端へ戻る / Ctrl+Z 一発で近傍の化けごと戻る');
    {
      // ── 4-1 Delete (実キーボード) ──
      await page.evaluate(() => {
        const T = window.__t; T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10], [30, 11], [30, 12]], 0);   // L 字 [1,1,4,0,0]
      });
      const pre41 = await page.evaluate(() => ({ v: window.__t.variants(),
        snap: JSON.stringify(window.__mapEditor.getMapDef()) }));
      await mouseClickTile(page, 30, 11);          // 実マウスで掴む
      await pressDelete(page);                     // ★実キーボード
      const s41 = await page.evaluate(() => ({ n: window.__t.items().length, corner: window.__t.at(30, 10),
        tail: window.__t.at(30, 12), v: window.__t.variants() }));
      check('§4 4a [装置] L 字が [1,1,4,0,0] で始まっている',
        J(pre41.v) === J([1, 1, 4, 0, 0]), J(pre41.v));
      check('§4 4b ★実キーボードの Delete で 1 個消えた (5 → 4)', s41.n === 4, 'n=' + s41.n);
      check('§4 4c ★★カーブだった角 (30,10) が 1 (横の終端) へ戻った',
        s41.corner === 1, '4 -> ' + s41.corner + '  ' + J(s41.v));
      check('§4 4d 切り離された (30,12) は孤立 → 今の形 0 (縦) を保つ (勝手に化けない)',
        s41.tail === 0, String(s41.tail));
      await pressCtrlZ(page);
      const undo41 = await page.evaluate((snap) => ({ v: window.__t.variants(),
        n: window.__t.items().length,
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap }), pre41.snap);
      check('§4 4e ★★Delete の Ctrl+Z 一発で消えた 1 個も近傍の形も丸ごと戻る (1 バイト一致)',
        undo41.same === true && undo41.n === 5 && J(undo41.v) === J([1, 1, 4, 0, 0]),
        'deep-equal=' + undo41.same + ' 形=' + J(undo41.v));

      // ── 4-2 配置の Ctrl+Z (1 手で「新規 1 個」+「近傍の化け」) ──
      const pre42 = await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10]], 0);
        return { snap: JSON.stringify(E.getMapDef()), v: T.variants() };
      });
      await page.evaluate(() => window.__mapEditor.setPropBrush('waterKit', 0));
      await mouseClickTile(page, 30, 11);
      const mid42 = await page.evaluate(() => ({ v: window.__t.variants(), corner: window.__t.at(30, 10),
        undoDisabled: document.getElementById('btnUndo').disabled }));
      check('§4 4f 1 手で新規 1 個 + 近傍 1 個の書き換えが起きた ([1,1,1] → [1,1,4,0])',
        J(pre42.v) === J([1, 1, 1]) && J(mid42.v) === J([1, 1, 4, 0]) && mid42.corner === 4,
        J(pre42.v) + ' -> ' + J(mid42.v));
      check('§4 4g ↶ 元に戻す ボタンが有効になった (可視の合図)',
        mid42.undoDisabled === false, 'disabled=' + mid42.undoDisabled);
      await pressCtrlZ(page);
      const post42 = await page.evaluate((snap) => ({ v: window.__t.variants(), n: window.__t.items().length,
        corner: window.__t.at(30, 10),
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap }), pre42.snap);
      check('§4 4h ★実キーボード Ctrl+Z 一発で置いた物が消えた (4 → 3)', post42.n === 3, 'n=' + post42.n);
      check('§4 4i ★★近傍 (30,10) も 4 (カーブ) → 1 (横) へ巻き戻った',
        post42.corner === 1, '4 -> ' + post42.corner + '  形=' + J(post42.v));
      check('§4 4j ★★mapDef が置く前と 1 バイトも変わらない (自動接続が同じ 1 段に乗っている証拠)',
        post42.same === true, 'deep-equal=' + post42.same);
      // ★実マウスで #btnUndo を押しても同じこと
      await page.evaluate(() => window.__mapEditor.setPropBrush('waterKit', 0));
      await mouseClickTile(page, 30, 11);
      const mid43 = await page.evaluate(() => window.__t.variants());
      await page.click('#btnUndo');
      await sleep(120);
      const post43 = await page.evaluate((snap) => ({ n: window.__t.items().length,
        corner: window.__t.at(30, 10),
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap }), pre42.snap);
      check('§4 4k ★#btnUndo を実マウスでクリックしても同じ 1 段が戻る',
        J(mid43) === J([1, 1, 4, 0]) && post43.n === 3 && post43.corner === 1 && post43.same === true,
        J(mid43) + ' -> n=' + post43.n + ' corner=' + post43.corner + ' deep-equal=' + post43.same);
    }

    // ══════════════════════════════════════════════════════════════════════
    // §5 — ★★パレットで**種類を差し替えた**ときも自動接続が走る (判断B の機構が水路でも効く)
    //   ⚠⚠ ここは必ず**パレットの実クリック** (page.click) を通す。setPropBrush シームを
    //     叩くと pickProp を一度も通らず、既存 4 本と同じ「実経路を踏まない素通し」になる。
    // ══════════════════════════════════════════════════════════════════════
    mark('§5 pickProp — ★パレットの実クリックで種類を差し替えても水路がつながる');
    {
      const PAL = (k, v) => '#propList .propItem[data-kind="' + k + '"][data-variant="' + v + '"]';
      await page.evaluate(() => { window.__t.reset(true); });
      await sleep(80);
      const d5 = await page.evaluate((sW, sP, sR) => {
        const pi = window.__mapEditor.propPaletteInfo();
        return { water: !!document.querySelector(sW), pillar: !!document.querySelector(sP),
                 rail: !!document.querySelector(sR),
                 visible: pi.visible, propMode: pi.propMode, n: pi.n };
      }, PAL('waterKit', 1), PAL('pillar', 0), PAL('railKit', 1));
      check('§5 5a [装置] propMode でパレットが見えており waterKit#1 / railKit#1 / pillar#0 が実在する',
        d5.water === true && d5.pillar === true && d5.rail === true &&
        d5.visible === true && d5.propMode === true && d5.n > 0, J(d5));

      // ── 5-1 縦 3 連の中央を選択 → パレットで「横」を実クリック → 自動接続で縦へ戻る ──
      //   ★下ごしらえは自動接続 OFF で「隣接と矛盾する [2,2,2]」を作る。こうすると差し替えの
      //     結果 ([0,0,0]) が下ごしらえと**別物**になるので Ctrl+Z の 1 段が実測できる。
      await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(false);                                        // 自動接続 OFF で下ごしらえ
        T.lay([[10, 5], [10, 6], [10, 7]], 2);                 // 縦 3 連だが全部 2 (北東カーブ)
        E.setPropAutoLink(true);                               // ★ここから ON
      });
      const pre51 = await page.evaluate(() => ({ v: window.__t.variants(),
        link: window.__mapEditor.getPropAutoLink(),
        snap: JSON.stringify(window.__mapEditor.getMapDef()) }));
      await mouseClickTile(page, 10, 6);                       // ★実マウスで中央を掴む
      const sel51 = await page.evaluate(() => window.__mapEditor.getPropSelection());
      await page.click(PAL('waterKit', 1));                    // ★★パレットの実クリック
      await sleep(80);
      const post51 = await page.evaluate(() => ({ v: window.__t.variants(), mid: window.__t.at(10, 6),
        brush: window.__mapEditor.getPropBrush(), n: window.__t.items().length,
        undoDisabled: document.getElementById('btnUndo').disabled,
        palSel: window.__mapEditor.propPaletteInfo().items
                  .filter(i => i.sel).map(i => i.kind + '#' + i.variant) }));
      check('§5 5b [装置] 隣接と矛盾する [2,2,2] を作り、ON に戻し、実マウスで中央 (添字 1) を掴めた',
        J(pre51.v) === J([2, 2, 2]) && pre51.link === true &&
        sel51 !== null && sel51.index === 1, J(pre51.v) + ' sel=' + J(sel51));
      check('§5 5c ★パレットの実クリックが pickProp を通った (筆が waterKit#1 / 見た目も選択状態)',
        post51.brush && post51.brush.kind === 'waterKit' && post51.brush.variant === 1 &&
        J(post51.palSel) === J(['waterKit#1']), J(post51.brush) + ' 画面=' + J(post51.palSel));
      check('§5 5d ★★横 (1) を選んだのに自動接続で 0 (縦) へ戻り、上下の隣も [0,0,0] へ揃う',
        post51.mid === 0 && J(post51.v) === J([0, 0, 0]) && post51.n === 3, J(post51.v));
      check('§5 5e 差し替えで ↶ 元に戻す が有効になった (履歴が 1 段積まれた)',
        post51.undoDisabled === false, 'disabled=' + post51.undoDisabled);
      await pressCtrlZ(page);
      const undo51 = await page.evaluate((snap) => ({ v: window.__t.variants(),
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap }), pre51.snap);
      check('§5 5f ★★Ctrl+Z **一発**で差し替え前 ([2,2,2]) と 1 バイトも変わらない状態に戻る',
        undo51.same === true && J(undo51.v) === J([2, 2, 2]),
        'deep-equal=' + undo51.same + ' 形=' + J(undo51.v));

      // ── 5-2 水路 → 石柱 (旧 kind 側の relink)。残った角が終端の直線へ戻る ──
      await page.evaluate(() => { const T = window.__t; T.reset(true);
        T.lay([[28, 10], [29, 10], [30, 10], [30, 11]], 0); });   // L 字 [1,1,4,0]
      const pre52 = await page.evaluate(() => ({ v: window.__t.variants(), corner: window.__t.at(30, 10),
        snap: JSON.stringify(window.__mapEditor.getMapDef()) }));
      await mouseClickTile(page, 30, 11);                      // ★実マウスで尾を掴む
      await page.click(PAL('pillar', 0));                      // ★★パレットの実クリックで石柱へ
      await sleep(80);
      const post52 = await page.evaluate(() => ({ corner: window.__t.at(30, 10),
        kinds: window.__t.kinds(), v: window.__t.variants(), tail: window.__t.items()[3] }));
      check('§5 5g [装置] L 字が [1,1,4,0] で角 (30,10) がカーブ (4)',
        J(pre52.v) === J([1, 1, 4, 0]) && pre52.corner === 4, J(pre52.v));
      check('§5 5h ★尾だけが石柱に差し替わった (waterKit×3 + pillar×1 / 座標は動かない)',
        J(post52.kinds) === J(['waterKit', 'waterKit', 'waterKit', 'pillar']) &&
        post52.tail.tx === 30 && post52.tail.ty === 11, J(post52.kinds));
      check('§5 5i ★★残った角 (30,10) が 4 (カーブ) → 1 (横の終端) へ戻る = **旧 kind 側**の relink',
        post52.corner === 1, '4 -> ' + post52.corner + '  ' + J(post52.v));
      await pressCtrlZ(page);
      const undo52 = await page.evaluate((snap) => ({ v: window.__t.variants(), kinds: window.__t.kinds(),
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap }), pre52.snap);
      check('§5 5j ★★Ctrl+Z 一発で種も近傍の形も丸ごと戻る (pushHistory が 1 回だけ)',
        undo52.same === true && J(undo52.v) === J([1, 1, 4, 0]),
        'deep-equal=' + undo52.same + ' 形=' + J(undo52.v) + ' 種=' + J(undo52.kinds));

      // ── 5-3 石柱 → 水路 (新 kind 側の relink)。**動かさずに**つながる ──
      await page.evaluate(() => {
        const E = window.__mapEditor, T = window.__t;
        T.reset(true);
        T.lay([[30, 11], [30, 12]], 0);            // 縦 2 連 [0,0]
        E.setPropBrush('pillar', 0);
        E.placeProp(31, 11);                       // その東隣に石柱
      });
      const pre53 = await page.evaluate(() => ({ v11: window.__t.at(30, 11), kinds: window.__t.kinds(),
        snap: JSON.stringify(window.__mapEditor.getMapDef()) }));
      await mouseClickTile(page, 31, 11);                      // ★実マウスで石柱を掴む
      await page.click(PAL('waterKit', 1));                    // ★★水路へ差し替え
      await sleep(80);
      const post53 = await page.evaluate(() => ({ head: window.__t.at(31, 11), v11: window.__t.at(30, 11),
        kinds: window.__t.kinds(), v: window.__t.variants() }));
      check('§5 5k [装置] 縦 2 連 [0,0] の東隣に石柱がある',
        pre53.v11 === 0 && J(pre53.kinds) === J(['waterKit', 'waterKit', 'pillar']), J(pre53.kinds));
      check('§5 5l ★石柱が水路になった (waterKit×3)',
        J(post53.kinds) === J(['waterKit', 'waterKit', 'waterKit']), J(post53.kinds));
      check('§5 5m ★★**動かさずに**隣 (30,11) が 0 (縦) → 3 (東南カーブ) へつながった = 新 kind 側の relink',
        post53.v11 === 3 && post53.head === 1, '0 -> ' + post53.v11 + '  ' + J(post53.v));
      await pressCtrlZ(page);
      const undo53 = await page.evaluate((snap) => ({
        same: JSON.stringify(window.__mapEditor.getMapDef()) === snap,
        kinds: window.__t.kinds(), v: window.__t.variants() }), pre53.snap);
      check('§5 5n ★Ctrl+Z 一発で石柱に戻り、隣の形も 0 (縦) へ巻き戻る',
        undo53.same === true && J(undo53.kinds) === J(['waterKit', 'waterKit', 'pillar']),
        'deep-equal=' + undo53.same + ' 形=' + J(undo53.v));

      // ── 5-4 「自動でつなぐ」OFF (実チェックボックス) では pickProp でも relink しない ──
      await page.evaluate(() => { const T = window.__t; T.reset(true); T.lay([[10, 5], [10, 6], [10, 7]], 0); });
      await page.click('#propLinkChk');                        // ★実マウスで OFF
      await sleep(80);
      const off5s = await page.evaluate(() => window.__mapEditor.getPropAutoLink());
      await mouseClickTile(page, 10, 6);
      await page.click(PAL('waterKit', 1));
      await sleep(80);
      const off5 = await page.evaluate(() => ({ v: window.__t.variants(), mid: window.__t.at(10, 6) }));
      await page.click('#propLinkChk');                        // 戻す
      await sleep(80);
      const back5 = await page.evaluate(() => window.__mapEditor.getPropAutoLink());
      check('§5 5o [装置] 実マウスでチェックを外せた', off5s === false, String(off5s));
      check('§5 5p ★★OFF なら pickProp で選んだ横 (1) がそのまま残り、近傍も書き換わらない',
        off5.mid === 1 && J(off5.v) === J([0, 1, 0]), J(off5.v));
      check('§5 5q チェックを戻すと ON へ復帰', back5 === true, String(back5));

      // ── 5-5 孤立 (mask 0) は選んだ形をそのまま保つ ──
      await page.evaluate(() => { const T = window.__t; T.reset(true); T.lay([[10, 5]], 0); });
      await mouseClickTile(page, 10, 5);
      await page.click(PAL('waterKit', 3));                    // 東南カーブ
      await sleep(80);
      const s55 = await page.evaluate(() => ({ v: window.__t.at(10, 5), n: window.__t.items().length,
        mask: window.__mapEditor.MapDef.connectKitMaskAt(window.__mapEditor.getMapDef().props, 10, 5, 'waterKit'),
        link: window.__mapEditor.getPropAutoLink() }));
      check('§5 5r ★孤立 (mask 0) の水路は ON でも選んだ 3 (東南カーブ) のまま = 勝手に化けない',
        s55.link === true && s55.mask === 0 && s55.v === 3 && s55.n === 1,
        'mask=' + s55.mask + ' variant=' + s55.v + ' autoLink=' + s55.link);
    }

    // ══════════════════════════════════════════════════════════════════════
    // §6 — ★★★線路と水路は互いを近傍として数えない (STEP 3 で新しく生まれた壊れ方)
    //   ⚠⚠ この節は**故意に純関数だけ**で測る。編集経路 (placeProp 等) を混ぜると
    //     「自動接続を殺す変異」でも落ちてしまい、種の分離の専用検出器でなくなる。
    //     編集経路が本当にこの純関数を呼んでいることは §3〜§5 が別途保証している。
    // ══════════════════════════════════════════════════════════════════════
    mark('§6 混在 — ★★★線路と水路が交差しても互いに影響しない (種の分離)');
    {
      const c6 = await page.evaluate(() => {
        const M = window.__mapEditor.MapDef;
        const W = 'waterKit', R = 'railKit';
        /* 十字の交差点。中心 (25,10) が水路で、北/東/西が線路、南だけが水路。
         *   水路として見れば mask = S のみ = 4、線路として見れば北の (25,9) は
         *   南に水しか無いので mask = 0。 */
        const mk = () => [
          { kind: W, variant: 3, tx: 25, ty: 10 },
          { kind: W, variant: 3, tx: 25, ty: 11 },
          { kind: R, variant: 3, tx: 25, ty: 9 },
          { kind: R, variant: 3, tx: 24, ty: 10 },
          { kind: R, variant: 3, tx: 26, ty: 10 },
        ];
        const props = mk();
        // 逆向き: 線路 1 個を水路が四方から囲む
        const rev = [
          { kind: R, variant: 3, tx: 30, ty: 10 },
          { kind: W, variant: 3, tx: 30, ty: 9 }, { kind: W, variant: 3, tx: 31, ty: 10 },
          { kind: W, variant: 3, tx: 30, ty: 11 }, { kind: W, variant: 3, tx: 29, ty: 10 },
        ];
        // relink: 線路側を回しても水は 1 個も変わらない
        const aR = mk();
        const nR = M.connectKitRelinkAround(aR, 25, 10, R);
        // relink: 水路側を回しても線路は 1 個も変わらない
        const aW = mk();
        const nW = M.connectKitRelinkAround(aW, 25, 10, W);
        // [母集団ガード] 線路だけの並びなら線路の relink は確かに効く (= 全滅していない)
        const railOnly = [{ kind: R, variant: 3, tx: 40, ty: 10 }, { kind: R, variant: 3, tx: 41, ty: 10 }];
        const nRailOnly = M.connectKitRelinkAround(railOnly, 40, 10, R);
        return {
          neighbors: props.filter(p => Math.abs(p.tx - 25) + Math.abs(p.ty - 10) === 1)
                          .map(p => p.kind + '@' + p.tx + ',' + p.ty),
          maskWater: M.connectKitMaskAt(props, 25, 10, W),
          maskRailN: M.connectKitMaskAt(props, 25, 9, R),
          maskRailW: M.connectKitMaskAt(props, 24, 10, R),
          revRail: M.connectKitMaskAt(rev, 30, 10, R),
          revWater: M.connectKitMaskAt(rev, 30, 10, W),
          nR, railsAfterR: aR.filter(p => p.kind === R).map(p => p.variant),
          watersAfterR: aR.filter(p => p.kind === W).map(p => p.variant),
          nW, railsAfterW: aW.filter(p => p.kind === R).map(p => p.variant),
          watersAfterW: aW.filter(p => p.kind === W).map(p => p.variant),
          nRailOnly, railOnlyV: railOnly.map(p => p.variant),
          notKit: [M.isConnectKit('pillar'), M.isConnectKit('rail'), M.isConnectKit('cart'),
                   M.isConnectKit('toString'), M.isConnectKit('constructor'),
                   M.isConnectKit(''), M.isConnectKit(null), M.isConnectKit(123)],
        };
      });
      check('§6 6a [装置] 交差点 (25,10) の四方に線路 3 個 + 水路 1 個が実際に隣接している',
        c6.neighbors.length === 4 &&
        c6.neighbors.filter(s => s.indexOf('railKit') === 0).length === 3 &&
        c6.neighbors.filter(s => s.indexOf('waterKit') === 0).length === 1, J(c6.neighbors));
      check('§6 6b ★★水路として数えると mask 4 (南の水路だけ) — 線路 3 個を 1 つも数えない',
        c6.maskWater === 4, 'mask=' + c6.maskWater + ' (線路も数えると 15 になる)');
      check('§6 6c ★★線路 (25,9) として数えると mask 0 — 南隣の水路を数えない',
        c6.maskRailN === 0, 'mask=' + c6.maskRailN);
      check('§6 6d ★線路 (24,10) も mask 0 (東隣の水路を数えない)',
        c6.maskRailW === 0, 'mask=' + c6.maskRailW);
      check('§6 6e ★★逆向き — 線路 1 個を水路が四方から囲んでも線路の mask は 0 / ' +
        'その位置を水路として数えれば 15',
        c6.revRail === 0 && c6.revWater === 15, 'rail=' + c6.revRail + ' water=' + c6.revWater);
      /* ⭐ 6f と 6h は kindlist 変異 (水路を接続キットから外す) では **PASS のまま**残る。
       *   ここが緑で 6g が赤なら「水路だけが死に、線路は生きている」と読める。 */
      check('§6 6f ★線路側の relink を回しても水路は 1 個も書き換わらない ' +
        '(線路自身も水を隣と見ないので 0 件)',
        c6.nR === 0 && J(c6.watersAfterR) === J([3, 3]) && J(c6.railsAfterR) === J([3, 3, 3]),
        'n=' + c6.nR + ' 水=' + J(c6.watersAfterR) + ' 線路=' + J(c6.railsAfterR));
      check('§6 6g ★★水路側の relink を回すと水路 2 個だけが揃い、線路は 3 個とも 3 のまま',
        c6.nW === 2 && J(c6.watersAfterW) === J([0, 0]) && J(c6.railsAfterW) === J([3, 3, 3]),
        'n=' + c6.nW + ' 水=' + J(c6.watersAfterW) + ' 線路=' + J(c6.railsAfterW));
      check('§6 6h [母集団ガード] 線路だけの 2 連なら線路の relink は確かに効く ' +
        '(6f の 0 件が「relink 全滅」ではない証明)',
        c6.nRailOnly === 2 && J(c6.railOnlyV) === J([1, 1]),
        'n=' + c6.nRailOnly + ' 形=' + J(c6.railOnlyV));
      check('§6 6i つながる種でないものは全部 false (prototype 汚染 / 非文字列にも耐える)',
        J(c6.notKit) === J([false, false, false, false, false, false, false, false]), J(c6.notKit));
    }

    // ══════════════════════════════════════════════════════════════════════
    // §7 — ★既定 6 シナリオは waterKit を 1 個も持たない
    //   ⚠⚠ レシピは**ブラウザ側**で読む。作業ツリーを fs で読むだけだと --mutate recipe が
    //     配信だけを書き換えるため空振りする (railkit で実際に 1 本しか落ちなかった)。
    // ══════════════════════════════════════════════════════════════════════
    mark('§7 非退行 — ★既定 6 シナリオに waterKit が 1 個も湧かない (本編 canvas も golden)');
    {
      const gp = await browser.newPage();
      const gErrs = [];
      gp.on('pageerror', e => gErrs.push('pageerror(game): ' + ((e && e.message) || e)));
      gp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text()))
        gErrs.push('console.error(game): ' + m.text()); });
      await gp.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
      await gp.evaluateOnNewDocument(gamePreload, { scen: 'goblin-mine', t0: GAME_T0, seed: GAME_SEED });
      await gp.goto(BASE + '/index.html?diag=1', { waitUntil: 'domcontentloaded' });
      await gp.waitForFunction(
        "typeof sceneryPlacements !== 'undefined' && typeof MAPDEF !== 'undefined' && " +
        "typeof SCENERY_RECIPES !== 'undefined' && typeof renderMap === 'function' && " +
        "typeof mapCanvas !== 'undefined' && typeof computeCameraTarget === 'function'",
        { timeout: 30000 });
      await waitImages(gp);

      const gm = await gp.evaluate(() => {
        // ★レシピは**配信された index.html** から読む (作業ツリーではない)
        const recipeKinds = [], themes = [];
        let rooms = 0;
        for (const scen of Object.keys(SCENERY_RECIPES)) {
          themes.push(scen);
          for (const room of Object.keys(SCENERY_RECIPES[scen])) {
            rooms++;
            for (const k of Object.keys(SCENERY_RECIPES[scen][room].counts || {}))
              if (recipeKinds.indexOf(k) < 0) recipeKinds.push(k);
          }
        }
        const kinds = {};
        for (const s of sceneryPlacements) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
        let url = '<none>', cw = -1, ch = -1, err = null, pat = [false, false];
        try {
          try { pat = [wallPattern !== null && wallPattern !== undefined,
                       floorPattern !== null && floorPattern !== undefined]; } catch (e) {}
          window.requestAnimationFrame = function () { return 0; };   // 以後の自動再描画を止める
          computeCameraTarget(); camX = camTargetX; camY = camTargetY;
          renderMap();
          url = mapCanvas.toDataURL('image/png');
          cw = mapCanvas.width; ch = mapCanvas.height;
        } catch (e) { err = String((e && e.message) || e); }
        return {
          recipeKinds, themes, rooms,
          isCustom: !!MAPDEF.isCustom, props: MAPDEF.props === undefined ? null : MAPDEF.props,
          total: sceneryPlacements.length, kinds,
          hasSheet: !!(SCENERY_SHEETS && SCENERY_SHEETS.waterKit),
          hasFrames: !!(SCENERY_FRAMES && SCENERY_FRAMES.waterKit),
          url, cw, ch, err, pat,
        };
      });
      allErrs.push(...gErrs);

      check('§7 7a ★配信された SCENERY_RECIPES が参照する種は 6 つちょうど (waterKit を足していない)',
        J(gm.recipeKinds.slice().sort()) === J(['cart', 'detail', 'grass', 'log', 'rail', 'rubble']),
        J(gm.recipeKinds));
      check('§7 7b [母集団ガード] レシピは 2 テーマ・5 部屋を実際に持っている (真空 PASS でない)',
        J(gm.themes) === J(['goblin-mine', 'caravan-road']) && gm.rooms === 5,
        J(gm.themes) + ' 部屋=' + gm.rooms);
      check('§7 7c ★既定シナリオ (廃坑) の散布は rubble/rail/cart の 3 種ちょうど — waterKit は 0 件',
        J(Object.keys(gm.kinds).sort()) === J(['cart', 'rail', 'rubble']) && gm.total > 0,
        '散布=' + J(gm.kinds));
      check('§7 7d 既定シナリオは props:null (mapDef.props の経路を 1 度も通らない)',
        gm.isCustom === false && gm.props === null, 'isCustom=' + gm.isCustom + ' props=' + J(gm.props));
      check('§7 7e [母集団ガード] それでも本編は waterKit をカタログとして持っている ' +
        '(「見つからないから 0 件」ではない)',
        gm.hasSheet === true && gm.hasFrames === true, J([gm.hasSheet, gm.hasFrames]));
      check('§7 7f [前提] 本編 canvas が実体を持ち、床/壁テクスチャが効いている ' +
        '(フォールバック同士の一致を golden に焼かない)',
        gm.err === null && gm.cw > 0 && gm.ch > 0 && gm.url.length > 5000 &&
        gm.pat[0] === true && gm.pat[1] === true,
        'canvas=' + gm.cw + 'x' + gm.ch + ' dataURL長=' + gm.url.length +
        ' pattern=' + J(gm.pat) + (gm.err ? ' err=' + gm.err : ''));
      /* ⚠⚠ golden の呼び出しは最終サマリより前に置くこと (後ろだと「N/M PASS なのに
       *   FAILED 一覧が空」という不可解な出方をする)。check() は即時加算なのでここで OK。 */
      G.check(check, '§7 7g ★既定シナリオ (廃坑) の本編 mapCanvas SHA-256 が golden と一致',
        'game-goblin-mine', sha256(gm.url));
      await gp.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§8 往復 — export → import で 1 バイトも変わらない / 矯正しない');
    {
      const c8 = await page.evaluate(() => {
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
         *   import で自動接続が走っていたら [5,5] は [1,1] に矯正されてしまう。 */
        const bad = JSON.parse(text);
        bad.props = [{ kind: 'waterKit', variant: 5, tx: 10, ty: 10 },
                     { kind: 'waterKit', variant: 5, tx: 11, ty: 10 }];
        const r2 = E.importJSON(JSON.stringify(bad));
        const kept = E.getMapDef().props.map(p => p.variant);
        const round2 = JSON.stringify(JSON.parse(E.exportJSON()).props) === JSON.stringify(bad.props);
        /* 「矯正されない」が単に relink が壊れているだけ、という取り違えを潰す母集団ガード:
         *   同じ [5,5] を **編集経路** (relinkAround) に通せば [1,1] になる。 */
        const arr = JSON.parse(JSON.stringify(bad.props));
        E.MapDef.connectKitRelinkAround(arr, 10, 10, 'waterKit');
        return { same: JSON.stringify(before) === JSON.stringify(after), cleared,
                 importOk: r.ok, importOk2: r2.ok, exported, kept, round2,
                 forced: arr.map(p => p.variant), len: JSON.stringify(before).length,
                 keys: Object.keys(exported[0] || {}),
                 kinds: exported.map(p => p.kind) };
      });
      check('§8 8a [装置] 別プリセットへ切り替えると props が消える (往復の検出力を担保)',
        c8.cleared === null || (Array.isArray(c8.cleared) && c8.cleared.length === 0), J(c8.cleared));
      check('§8 8b prop レコードは { kind, variant, tx, ty } の 4 キーだけ / 種は waterKit',
        J(c8.keys) === J(['kind', 'variant', 'tx', 'ty']) &&
        c8.kinds.every(k => k === 'waterKit'), J(c8.keys) + ' ' + J(c8.kinds[0]));
      check('§8 8c ★export → import → getMapDef が 1 バイトも変わらない',
        c8.importOk === true && c8.same === true, 'JSON長=' + c8.len);
      check('§8 8d ★★隣接と矛盾する variant [5,5] を読み込んでも矯正されない (import で走らない証拠)',
        c8.importOk2 === true && J(c8.kept) === J([5, 5]), J(c8.kept));
      check('§8 8e その状態を書き出しても [5,5] のまま', c8.round2 === true, String(c8.round2));
      check('§8 8f [母集団ガード] 同じ [5,5] を編集経路に通せば [1,1] になる ' +
        '(8d が「relink が死んでいるだけ」ではない証明)',
        J(c8.forced) === J([1, 1]), J(c8.forced));
    }

    // ══════════════════════════════════════════════════════════════════════
    // §G — ★絵の非退行は golden 方式 (固定コミット比較は自己失効して赤いまま安定する)
    // ══════════════════════════════════════════════════════════════════════
    mark('§G 絵 — ★golden 方式で敷いた水路の見た目を 5 シーン');
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
        /* ★★絵が「落ち着く」まで撮り直す (2026-08-04 に実際に踏んだ罠)。
         *   propRects().drew は**情景物の絵**しか見ていないので、Phase 4 の部屋 1 枚絵や
         *   床/壁テクスチャが遅れて届くと **最初のシーンだけ** 別の SHA になる
         *   (golden 記録時の 1 回だけ V が別値になり、以後 3 回は安定 = 記録側が汚染される)。
         *   内部シームを増やさずに済む一般解として「同じ切り出しが 3 回連続で一致するまで待つ」。 */
        let g = null, h = null, prevH = null, stable = 0, tries = 0;
        for (; tries < 40; tries++) {
          g = await page.evaluate((crop) => {
            const E = window.__mapEditor;
            E.render();                              // ★遅れて届いた画像をここで拾う
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
                     texActive: E.texInfo().active === true,
                     variants: E.propInfo().items.map(i => i.variant) };
          }, CROP);
          h = sha256(g.url);
          if (h === prevH && g.texActive) { stable++; if (stable >= 2) break; } else stable = 0;
          prevH = h;
          await sleep(200);
        }
        const settled = stable >= 2;
        saveShot('waterkit_' + sc.key, g.url);
        /* ⚠⚠ golden の呼び出しは最終サマリより前に置くこと。 */
        G.check(check, '§G G2-' + sc.key + ' ' + sc.label + ' の描画 SHA-256 が golden と一致',
          'canvas-' + sc.key, h);
        check('§G G3-' + sc.key + ' [前提] 絵が実際に貼られている / ★描画が落ち着いた / ' +
          '切り出し領域が canvas に収まる / dpr=1',
          g.fits === true && g.dpr === 1 && g.n === sc.lay.length && g.drew === g.n &&
          settled === true && g.texActive === true && isHex64(h) && g.url.length > 5000,
          'canvas=' + g.cw + 'x' + g.ch + ' 物=' + g.n + ' 絵あり=' + g.drew +
          ' 1個目の幅=' + g.w0 + 'px dataURL長=' + g.url.length +
          ' 収束=' + settled + '(' + (tries + 1) + '回目) tex=' + g.texActive);
        check('§G G4-' + sc.key + ' 形が期待どおり ' + J(sc.expect) + ' (SHA が一致しても形が違えば別物)',
          J(g.variants) === J(sc.expect), J(g.variants));
      }

      /* ★目視用の「線路 × 水路の交差」シーン。⚠ **golden には入れない**
       *   (入れると crosslink 変異が §G にも着弾して「§6 単独」という切り分けが崩れる)。
       *   絵として交差が破綻していないかは人間が見る。 */
      if (SHOTS) {
        const mix = await page.evaluate((crop) => {
          const E = window.__mapEditor, T = window.__t;
          T.reset(true);
          T.lay([[28, 12], [29, 12], [30, 12], [31, 12], [32, 12]], 0, 'waterKit');   // 横に流れる川
          T.lay([[30, 10], [30, 11], [30, 13], [30, 14]], 0, 'railKit');              // 縦に走る線路
          E.setPropBrush(null); E.selectPropAt(-9, -9); E.setPropScaleRef(false); E.hoverTile(null);
          E.state.view.zoom = 1; E.state.view.x = 27 * 96; E.state.view.y = 9 * 96;
          E.render();
          const cv = document.getElementById('editorCanvas');
          const dpr = E.state.css.dpr || 1;
          const off = document.createElement('canvas');
          off.width = crop.w; off.height = crop.h;
          off.getContext('2d').drawImage(cv, 0, 0, crop.w * dpr, crop.h * dpr, 0, 0, crop.w, crop.h);
          return { url: off.toDataURL('image/png'),
                   water: E.propInfo().items.filter(i => i.kind === 'waterKit').map(i => i.variant),
                   rail: E.propInfo().items.filter(i => i.kind === 'railKit').map(i => i.variant) };
        }, CROP);
        saveShot('waterkit_MIX', mix.url);
        console.log('  [shot] MIX 交差: 水路=' + J(mix.water) + ' 線路=' + J(mix.rail));
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
