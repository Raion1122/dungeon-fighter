#!/usr/bin/env node
/*
 * driver_mapeditor_props.js — 「情景物を 1 個ずつ置く (mapDef.props)」の恒久回帰検出器
 * ═════════════════════════════════════════════════════════════════════════════
 * 対象 (3 ファイルにまたがる 1 本の鎖):
 *   js/df-mapdef.js   … SCENERY_FRAMES の実行時抽出 / 実寸(cm)換算 / props の
 *                       sanitize / propDrawSize / propFootprint / propBlockedTiles / lint 4 件
 *   map-editor.html   … ツール "prop" / 情景物パレット (キャラを並べたサムネ) / 配置・移動・削除
 *   index.html        … props を sceneryPlacements へ流し、blocking を obstacleTileMask へ積む
 *
 * ■ ユーザーが名指しした要件は 2 つ。どちらも「壊れても気づけない」形で壊れる
 *   ① ★「こだわりは、キャラの大きさとスケールがあっている事。これだけは、こだわってほしい」
 *      → §2 が物差し (キャラ体高 57px = 1.70m = 1px≒2.98cm) を測り、
 *        §1 1d が「エディタの大きさ = 本編の描画式」であることを **index.html を独立に
 *        パースして計算した値との一致**で証明する。
 *      ⚠ 恒久教訓13: 縮尺の狂いは数値では見つからない (FFT も色分布も外した)。
 *        見つかるのは「キャラを並べて目で見る」ときだけ → その装置がパレットのサムネで、
 *        §5 がそれが実際に描かれていることを drawImage フックで確定する。
 *   ② ★「柱や、テーブルを配置した際には、キャラがそこに入れないように」
 *      → §6 (lint) と §7 (本編) が両側から測る。**§7 7e の isTileWall が真の合否**。
 *
 * ■ 何を測るか
 *   §0 装置   公開 API / 検証シーム / DOM / ツールの実在 (assert が空振りしない前提)
 *   §1 カタログ SCENERY_FRAMES を index.html から読めている / ★描画式が本編と同一
 *   §2 縮尺   ★物差しの定数と往復 / 全エントリの実寸が人間スケールに収まる
 *   §3 非写経 ★実装 2 ファイルに情景の画像名・枠座標が 1 つも出てこない
 *   §4 編集   置く/掴む/動かす/消す/undo/往復同一性 (空なら props は null のまま)
 *   §5 描画   ★propRects が propDrawSize×zoom と一致 / 実 drawImage / PNG の焼き込み境界
 *   §6 lint   ★★通行不能な物が通り道を塞いだら検出する (+ 塞がなければ出ない負の対照)
 *   §7 本編   ★★obstacleTileMask が立ち isTileWall が true = キャラが入れない
 *   §8 退化   カタログが取れないときは 0 件 + 理由を必ず出す (silent fail-open にしない)
 *   §E 実行中に pageerror / console.error / 404 が 1 件も出ていないこと
 *
 * ■ 変異負制御 (--mutate <kind>)
 *     kind          | 注入する欠陥                                     | 落ちるべき節
 *     --------------|--------------------------------------------------|--------------
 *     nogameblock   | 本編で props の通行不能マスを積むのをやめる      | §7
 *     nogameprops   | 本編で props を sceneryPlacements へ流さない     | §7
 *     nolintwalk    | lint の flood fill を情景物ぬきの地図で行う      | §6
 *     propboxtile   | エディタの占有矩形を 1 タイル固定にする          | §5
 *   ⚠ 置換対象が 0 件 / 2 件以上 なら exit 3 (空振りしたまま PASS を防ぐ)。
 *   ⚠⚠ **置換文字列は必ず 1 行に収めること**。core.autocrlf=true のため作業ツリーの
 *      index.html は **CRLF**、js/df-mapdef.js は **LF** と混在しており、"\n" を含む
 *      複数行の置換は index.html 側で原理的に一致しない (2026-08-04 に実際に踏んだ:
 *      nogameprops が exit 3 で空振りした)。行をまたぎたくなったら、その挙動を
 *      1 行で殺せる別の場所を探す方が速い。
 *
 * ■ 使い方
 *     node tools/driver_mapeditor_props.js [--headful] [--port N] [--browser <path>]
 *          [--mutate nogameblock|nogameprops|nolintwalk|propboxtile]
 *   exit 0 = 全 PASS / 1 = FAIL / 2 = 環境不備 / 3 = 変異の空振り / 4 = 変異したのに全 PASS
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
const PORT = parseInt(arg('port', '8985'), 10);
const MUTATE = arg('mutate', null);

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ① 本編で通行不能マスを積むのをやめる。→ 置いた柱をキャラがすり抜ける。 */
  nogameblock: [
    ['        for (const k of DFMapDef.propBlockedTiles(MAPDEF)) obstacleTileMask[k] = 1;',
     '        for (const k of []) obstacleTileMask[k] = 1;'],
  ],
  /* ② 本編で props を描画リストへ流さない。→ 置いた物が丸ごと消える。 */
  nogameprops: [
    ['      for (const p of mapProps) {', '      for (const p of []) {'],
  ],
  /* ③ lint の到達可能性を「情景物ぬき」の地図で行う。→ 柱で分断しても気づけない。
   *   ⚠ mapWalk の**生成そのもの**ではなく flood fill の入力だけを差し替える
   *     (propBlockedSet は残す = prop-on-slot / prop-blocks-start は生きたまま =
   *      「過剰に効く負制御」にしない。§6 の到達性の節だけが落ちる)。 */
  nolintwalk: [
    ['      var reach = reachableFrom(mapWalk, W, H, startTx, startTy);',
     '      var reach = reachableFrom(map, W, H, startTx, startTy);'],
  ],
  /* ④ エディタの占有矩形を 1 タイル固定に。→ 「キャラとスケールが合う」表示が壊れる。 */
  propboxtile: [
    ['    return { x: cx - sz.dw * k / 2, y: cy - sz.dh * k / 2, w: sz.dw * k, h: sz.dh * k, known: true };',
     '    return { x: cx - t / 2, y: cy - t / 2, w: t, h: t, known: true };  /* k は未使用になる */'],
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
/* ⚠ 除外は **URL 単位**で行う (本文「404」で一括除外すると本物の検出器まで死ぬ)。 */
const IGNORED_URL_RE = /\/favicon\.ico(\?|$)|__no_such_scenery__/;

function startServer(port, root) {
  const rec = { notFound: [] };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (MUTATE && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || MIME['.html']);
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
function mark(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '   [' + detail + ']' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
  return ok;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const J = (v) => JSON.stringify(v);
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);

// ══════════════════════════════════════════════════════════════════════════════
// Node 側で index.html を**独立に**パースして期待値を作る
//   ★ここが §1 1d の心臓部。df-mapdef.js の実装を通さずに素の index.html から
//     dw/dh を計算し、ブラウザ側 propDrawSize() の戻りと突き合わせる。
//     写経・式のドリフト・displayMax の書き換え漏れが、すべてここで赤くなる。
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
function expectedCatalog() {
  const text = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const iS = text.indexOf('const SCENERY_SHEETS = {');
  const iF = text.indexOf('const SCENERY_FRAMES = {');
  if (iS < 0 || iF < 0) { console.error('[drv] index.html に SCENERY_SHEETS / SCENERY_FRAMES が無い'); process.exit(2); }
  const sheets = evalLiteral(sliceBraces(text, iS));
  const frames = evalLiteral(sliceBraces(text, iF));
  const out = [];
  for (const kind of Object.keys(sheets)) {
    const arr = frames[kind] || [];
    for (let v = 0; v < arr.length; v++) {
      const fr = arr[v];
      const dm = Array.isArray(sheets[kind].displayMax) ? sheets[kind].displayMax[v] : sheets[kind].displayMax;
      const s = dm / Math.max(fr.w, fr.h);          // ← index.html:5686 と同じ式 (1e で存在も assert)
      out.push({ kind, variant: v, dw: fr.w * s, dh: fr.h * s,
                 blocking: !!(sheets[kind].blocking && sheets[kind].blocking[v]),
                 src: sheets[kind].src });
    }
  }
  return { entries: out, sheets, frames, text };
}

// ══════════════════════════════════════════════════════════════════════════════
// 検証用のカスタム mapDef
//   幾何は 1 本道: 部屋0 [3,3,18,22] ─ 廊下 [13,22,15,30] ─ 部屋1(ボス) [5,30,22,51]
//   ★廊下は **row 13-15 の 3 行しかない**。そこへ 3 行ぶんを塞ぐ物を置けば必ず分断される =
//     「たまたま塞がらなかった」で PASS しない (Phase 4 で確立した作法)。
// ══════════════════════════════════════════════════════════════════════════════
const ROOM0 = [3, 3, 18, 22];
const ROOM1 = [5, 30, 22, 51];
const CORR  = [13, 22, 15, 30];
function mkMapDef(props) {
  return {
    schema: 'df-map/1', id: 'p6-drv', name: 'Phase6 情景物 検証マップ',
    grid: { w: 72, h: 28, tile: 96 },
    themeId: 'goblin-mine',
    rooms: [
      { id: 'r0', role: 'start', rect: ROOM0.slice(), enemySlots: [[8, 10], [12, 8]],
        bossSlot: null, painting: null, scenery: null },
      { id: 'r1', role: 'boss', rect: ROOM1.slice(), enemySlots: [],
        bossSlot: [40, 13], painting: null, scenery: null },
    ],
    corridors: [CORR.slice()],
    start: { tx: 5, ty: 13 },
    objective: { kind: 'visitRooms', count: null },
    tiles: null, props: props || null, flags: { bandMask: false },
  };
}
function mkPayload(props) {
  return { title: 'Phase6 検証', flavor: '', themeId: 'goblin-mine',
           spawns: [['goblin', 8, 10], ['goblin', 12, 8]], clearXp: 0, mapDef: mkMapDef(props) };
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = makeProfile('df_mapedit_props_');
  const EXP = expectedCatalog();

  let srv = null, browser = null, rec = null;
  const allErrs = [];
  const BASE = 'http://127.0.0.1:' + PORT;
  try {
    const a = await startServer(PORT, ROOT);
    srv = a.srv; rec = a.rec;
    console.log('[drv] root=' + ROOT + '  ' + BASE);
    console.log('[drv] mutate=' + (MUTATE || 'なし'));
    console.log('[drv] index.html から独立に読んだ情景: ' + EXP.entries.length + ' 件 / ' +
                Object.keys(EXP.sheets).length + ' 種');

    browser = await puppeteer.launch({
      executablePath: browserPath, headless: HEADFUL ? false : 'new',
      userDataDir: profile, args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    page.on('pageerror', e => allErrs.push('pageerror: ' + ((e && e.message) || e)));
    /* ⚠ "Failed to load resource" は §8 が**わざと** 404 させたときに必ず出る。
     *   これを数えると §8 と §E が原理的に両立しない。404 の検出は内蔵サーバ側の
     *   rec.notFound (= URL 単位の除外) が担当する = 本物の 404 検出器は死んでいない。 */
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text()))
      allErrs.push('console.error: ' + m.text()); });
    await page.setViewport({ width: 1500, height: 900 });
    await page.goto(BASE + '/map-editor.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__mapEditor, { timeout: 20000, polling: 50 });
    await page.evaluate(() => window.__mapEditor.sceneryReady).catch(() => {});
    await sleep(400);

    // ══════════════════════════════════════════════════════════════════════
    mark('§0 装置 — assert が空振りしない前提');
    {
      const d0 = await page.evaluate(() => {
        const E = window.__mapEditor, M = window.DFMapDef;
        const q = (id) => document.getElementById(id);
        return {
          apiMissing: ['propEntries', 'propDrawSize', 'propFootprint', 'propBlocking',
                       'propBlockedTiles', 'propKindLabel', 'pxToCm', 'cmToPx', 'cmLabel',
                       'getSceneryFrames'].filter(k => typeof M[k] !== 'function'),
          consts: { ink: M.CHAR_INK_H_PX, cm: M.CHAR_H_CM, per: M.CM_PER_PX, mark: M.SCENERY_FRAME_MARK },
          seamMissing: ['setPropBrush', 'getPropBrush', 'placeProp', 'moveProp', 'deleteProp',
                        'selectPropAt', 'getPropSelection', 'setPropScaleRef', 'propInfo',
                        'propPaletteInfo', 'propRects'].filter(k => typeof E[k] !== 'function'),
          tools: E.TOOLS.map(function (t) { return t.key; }),
          dom: { wrap: !!q('propWrap'), list: !!q('propList'), chk: !!q('propScaleChk'),
                 cnt: !!q('propCount'), note: !!q('propNote'), brush: !!q('propBrushLine'),
                 sel: !!q('propSelLine') },
        };
      });
      check('§0 0a DFMapDef に Phase 6 の公開 API 10 本がある', d0.apiMissing.length === 0, '欠け=' + J(d0.apiMissing));
      check('§0 0b __mapEditor に検証シーム 11 本がある', d0.seamMissing.length === 0, '欠け=' + J(d0.seamMissing));
      check('§0 0c ツール "prop" が TOOLS の末尾にある (数字キーの割当を既存ツールから奪わない)',
        Array.isArray(d0.tools) && d0.tools[d0.tools.length - 1] === 'prop' && d0.tools.length === 9, J(d0.tools));
      check('§0 0d 情景物パレットの DOM 7 要素がある',
        Object.keys(d0.dom).every(k => d0.dom[k]), J(d0.dom));
      check('§0 0e SCENERY_FRAME_MARK が index.html の宣言と同じ文字列',
        d0.consts.mark === 'const SCENERY_FRAMES = {' && EXP.text.indexOf(d0.consts.mark) >= 0,
        String(d0.consts.mark));
      check('§0 0f 物差しの定数が公開されている (57px / 170cm)',
        d0.consts.ink === 57 && d0.consts.cm === 170 && near(d0.consts.per, 170 / 57, 1e-9),
        J(d0.consts));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§1 カタログ — ★描画の大きさが本編と同一であること');
    {
      const c1 = await page.evaluate(() => {
        const M = window.DFMapDef;
        const es = M.propEntries();
        return {
          n: es.length,
          kinds: Array.from(new Set(es.map(e => e.kind))),
          sizes: es.map(e => [e.kind, e.variant, e.dw, e.dh, e.blocking, e.tw, e.th]),
          framesKeys: Object.keys(M.getSceneryFrames() || {}),
          unknownDraw: M.propDrawSize('__no_such_kind__', 0),
          unknownFoot: M.propFootprint('__no_such_kind__', 0),
          unknownBlock: M.propBlocking('__no_such_kind__', 0),
          oob: M.propDrawSize('grass', 999),
          labels: es.slice(0, 3).map(e => e.label),
          sizeLabels: es.map(e => e.sizeLabel),
        };
      });
      check('§1 1a propEntries() が index.html の実数と一致 (' + EXP.entries.length + ' 件)',
        c1.n === EXP.entries.length, 'n=' + c1.n + ' 期待=' + EXP.entries.length);
      /* ⚠ ここは**明示リスト**であって件数ではない (恒久教訓: グローバルな件数で assert するな)。
       *   種を足したらここも直す = カタログの identity をコミットに書き残すための装置。
       *   pillar/chair/table/wreck は Phase 6 STEP 2 で追加した mapDef.props 専用の 4 種。
       *   railKit は STEP 2.5 で追加した「つながる線路」(既存 rail とは**別種**。rail に変種を
       *   足すと散布の variant = hash % frames.length が動いて廃坑の見た目が変わるため)。 */
      check('§1 1b 種が 12 (grass/reed/log/detail/rubble/cart/rail + pillar/chair/table/wreck + railKit)',
        J(c1.kinds) === J(['grass', 'reed', 'log', 'detail', 'rubble', 'cart', 'rail',
                           'pillar', 'chair', 'table', 'wreck', 'railKit']), J(c1.kinds));
      check('§1 1c SCENERY_FRAMES を実行時に読めている (シートと同じキー)',
        J(c1.framesKeys) === J(Object.keys(EXP.sheets)), J(c1.framesKeys));
      /* ★★1d = この節の心臓部。df-mapdef の実装を通さず index.html を独立に計算した
       *   dw/dh と、ブラウザ側 propDrawSize() の戻りが**全件一致**することを見る。 */
      const bad = [];
      for (const e of EXP.entries) {
        const got = c1.sizes.find(s => s[0] === e.kind && s[1] === e.variant);
        if (!got || !near(got[2], e.dw, 0.001) || !near(got[3], e.dh, 0.001) || got[4] !== e.blocking)
          bad.push(e.kind + '#' + e.variant + ' 期待=' + e.dw.toFixed(2) + 'x' + e.dh.toFixed(2) +
                   ' 実測=' + (got ? got[2].toFixed(2) + 'x' + got[3].toFixed(2) : 'なし'));
      }
      check('§1 1d ★★全 ' + EXP.entries.length + ' 件の描画サイズ・blocking が index.html の独立計算と一致',
        bad.length === 0, bad.length ? bad.slice(0, 3).join(' | ') : '差分0件');
      check('§1 1e ★本編の描画式が変わっていない (index.html に scale = dispMax / max(fr.w,fr.h) が実在)',
        EXP.text.indexOf('const scale = dispMax / Math.max(fr.w, fr.h);') >= 0,
        '見つからなければ df-mapdef の propDrawSize を追随させること');
      check('§1 1f 未知の種は draw=null / footprint 1×1 / blocking=false (落ちずに縮退する)',
        c1.unknownDraw === null && c1.unknownFoot.tw === 1 && c1.unknownFoot.th === 1 &&
        c1.unknownBlock === false, J([c1.unknownDraw, c1.unknownFoot, c1.unknownBlock]));
      check('§1 1g 枠の外の variant も null (配列外アクセスで落ちない)', c1.oob === null, String(c1.oob));
      check('§1 1h ラベルが日本語の呼び名 + 連番 (「草の房 1」形式)',
        /^草の房 1$/.test(c1.labels[0]), J(c1.labels));
      check('§1 1i 実寸ラベルが全件 "A × B" 形式で ? を含まない',
        c1.sizeLabels.every(s => / × /.test(s) && s.indexOf('?') < 0),
        c1.sizeLabels.filter(s => s.indexOf('?') >= 0).slice(0, 3).join(' | ') || 'すべて正常');
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§2 縮尺 — ★ユーザーが最優先に挙げた条件の物差し');
    {
      const c2 = await page.evaluate(() => {
        const M = window.DFMapDef;
        const es = M.propEntries();
        return {
          roundTrip: [M.pxToCm(57), M.cmToPx(170), M.pxToCm(M.cmToPx(123)), M.pxToCm(1)],
          tileCm: M.pxToCm(96),
          labels: [M.cmLabel(45), M.cmLabel(170), M.cmLabel(1200), M.cmLabel(0), M.cmLabel(NaN)],
          minCm: Math.min.apply(null, es.map(e => Math.min(e.wcm, e.hcm))),
          maxCm: Math.max.apply(null, es.map(e => Math.max(e.wcm, e.hcm))),
          worst: es.slice().sort((a, b) => Math.max(b.wcm, b.hcm) - Math.max(a.wcm, a.hcm))
                   .slice(0, 4).map(e => e.label + ' ' + e.sizeLabel),
          footOk: es.every(e => e.tw >= 1 && e.th >= 1 &&
                                e.tw === Math.max(1, Math.round(e.dw / 96)) &&
                                e.th === Math.max(1, Math.round(e.dh / 96))),
        };
      });
      check('§2 2a キャラ体高 57px = 170cm の往復が誤差ゼロ',
        near(c2.roundTrip[0], 170, 1e-9) && near(c2.roundTrip[1], 57, 1e-9) &&
        near(c2.roundTrip[2], 123, 1e-9), J(c2.roundTrip.map(v => Math.round(v * 1000) / 1000)));
      check('§2 2b 1px ≒ 2.98cm', near(c2.roundTrip[3], 2.982, 0.001), c2.roundTrip[3].toFixed(4) + ' cm/px');
      check('§2 2c 1 タイル 96px ≒ 2.86m (キャラ 1.7 人ぶん)', near(c2.tileCm, 286.3, 0.5),
        (c2.tileCm / 100).toFixed(2) + 'm');
      check('§2 2d cmLabel の書式 (45cm / 1.7m / 12m / 不正は ?)',
        J(c2.labels) === J(['45cm', '1.7m', '12m', '?', '?']), J(c2.labels));
      /* ★全エントリが「人間と同じ地面に立つ物」として読める寸法に収まっているか。
       *  ⚠ これは合格ラインであって最適解ではない。数値が範囲内でも絵として大きすぎる
       *    ことはある (恒久教訓16) → だからパレットにキャラを並べて目で見る。 */
      check('§2 2e 全エントリの実寸が 10cm〜700cm に収まる (人間 1.70m と桁が合っている)',
        c2.minCm >= 10 && c2.maxCm <= 700,
        '最小=' + Math.round(c2.minCm) + 'cm 最大=' + Math.round(c2.maxCm) + 'cm');
      check('§2 2f 塞ぐマス数が描画サイズから導出されている (別入力になっていない)',
        c2.footOk === true);
      console.log('  [縮尺] 大きい順 4 件: ' + c2.worst.join(' / '));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§3 非写経 — 実装に情景の絵の情報が焼き付いていないこと');
    {
      const srcs = {};
      for (const rel of ['map-editor.html', 'js/df-mapdef.js'])
        srcs[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const pngNames = Array.from(new Set(Object.keys(EXP.sheets)
        .map(k => String(EXP.sheets[k].src).split('/').pop().split('?')[0])));
      const hitPng = [];
      for (const rel of Object.keys(srcs))
        for (const n of pngNames) if (srcs[rel].indexOf(n) >= 0) hitPng.push(rel + ':' + n);
      // 枠座標 (x:75,y:460 …) が写経されていないか — 各種の先頭コマで探す
      const frameProbes = [];
      for (const k of Object.keys(EXP.frames))
        frameProbes.push('x:' + EXP.frames[k][0].x + ',y:' + EXP.frames[k][0].y);
      const hitFrame = [];
      for (const rel of Object.keys(srcs))
        for (const p of frameProbes) if (srcs[rel].indexOf(p) >= 0) hitFrame.push(rel + ':' + p);
      check('§3 3a ★実装 2 ファイルに情景シートの画像名が 1 つも出てこない (' + pngNames.length + ' 種を検査)',
        hitPng.length === 0, hitPng.join(' | ') || '不在');
      check('§3 3b ★枠座標 (SCENERY_FRAMES の値) が写経されていない',
        hitFrame.length === 0, hitFrame.join(' | ') || '不在');
      check('§3 3c マーカー定数だけは持つ (抽出できないと機能しないので、これは写経ではない)',
        srcs['js/df-mapdef.js'].indexOf('const SCENERY_FRAMES = {') >= 0);
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§4 編集 — 置く / 掴む / 動かす / 消す / undo / 往復同一性');
    {
      const c4 = await page.evaluate(() => {
        const E = window.__mapEditor, M = window.DFMapDef;
        const out = {};
        E.loadPreset('dungeon');
        out.initial = E.getMapDef().props;                 // null であるべき
        E.setPropBrush(null);
        out.noBrush = E.placeProp(30, 12);                 // 筆が無いので拒否 + 理由
        E.setTool('prop');
        E.setPropBrush('rubble', 4);                       // 大型の崩落 (blocking)
        out.brush = E.getPropBrush();
        out.placed = E.placeProp(30, 12);
        out.after1 = E.propInfo();
        out.hit = E.selectPropAt(30, 12);
        out.miss = E.selectPropAt(2, 2);
        E.selectPropAt(30, 12);
        out.moved = E.moveProp(31, 13);
        out.afterMove = E.propInfo().items[0];
        E.undo();
        out.undo1 = E.propInfo().items[0];                 // 移動が戻る
        E.selectPropAt(30, 12);
        E.deleteProp();
        out.afterDel = { count: E.propInfo().count, props: E.getMapDef().props };
        E.undo();
        out.undo2 = E.propInfo().count;                    // 削除も戻る
        // 往復同一性: export → import → export
        E.setPropBrush('cart', 0);
        E.placeProp(35, 10);
        const a = JSON.parse(E.exportJSON());
        E.importJSON(JSON.stringify(a));
        const b = JSON.parse(E.exportJSON());
        out.roundTrip = JSON.stringify(a) === JSON.stringify(b);
        out.roundProps = b.props;
        // 既定プリセットは props を足しても 1 バイトも動かない
        E.loadPreset('dungeon');
        out.presetProps = JSON.parse(E.exportJSON()).props;
        out.presetSame = JSON.stringify(M.sanitize(M.DEFAULT_DUNGEON, M.DEFAULT_DUNGEON)) ===
                         JSON.stringify(M.DEFAULT_DUNGEON);
        out.presetSameField = JSON.stringify(M.sanitize(M.DEFAULT_FIELD, M.DEFAULT_FIELD)) ===
                              JSON.stringify(M.DEFAULT_FIELD);
        // 壊れた prop は sanitize が落とす / 未知の種は残す / 座標はクランプ
        const s = M.sanitize({ schema: 'df-map/1', grid: { w: 72, h: 28, tile: 96 },
          themeId: 'goblin-mine', rooms: M.DEFAULT_DUNGEON.rooms, corridors: [], start: { tx: 5, ty: 5 },
          props: [ { kind: 'rubble', variant: 1, tx: 5, ty: 5 },
                   { kind: '', variant: 0, tx: 1, ty: 1 },
                   { kind: 'rubble', tx: 'x', ty: 1 },
                   { kind: '__unknown__', variant: 2, tx: 4, ty: 4 },
                   { kind: 'rubble', variant: 0, tx: 9999, ty: -5 } ] }, M.DEFAULT_DUNGEON);
        out.sanitized = s.props;
        const empty = M.sanitize({ schema: 'df-map/1', grid: { w: 72, h: 28, tile: 96 },
          themeId: 'goblin-mine', rooms: M.DEFAULT_DUNGEON.rooms, corridors: [],
          start: { tx: 5, ty: 5 }, props: [] }, M.DEFAULT_DUNGEON);
        out.emptyProps = empty.props;
        return out;
      });
      check('§4 4a 既定プリセットの props は null (空配列ではない = 往復同一性を壊さない)',
        c4.initial === null && c4.presetProps === null && c4.emptyProps === null,
        J([c4.initial, c4.presetProps, c4.emptyProps]));
      check('§4 4b 筆を選ばずに置くと**理由付きで**拒否される (無言の失敗にしない)',
        c4.noBrush.ok === false && /パレット/.test(c4.noBrush.reason || ''), J(c4.noBrush));
      check('§4 4c 筆を選んで置ける / 座標と種類が保たれる',
        c4.placed.ok === true && c4.after1.count === 1 &&
        c4.after1.items[0].kind === 'rubble' && c4.after1.items[0].variant === 4 &&
        c4.after1.items[0].tx === 30 && c4.after1.items[0].ty === 12, J(c4.after1.items[0]));
      check('§4 4d 置いた物を掴める / 何も無い所では null',
        c4.hit === 0 && c4.miss === null, J([c4.hit, c4.miss]));
      check('§4 4e 移動で座標だけが変わる',
        c4.moved.ok === true && c4.afterMove.tx === 31 && c4.afterMove.ty === 13, J(c4.afterMove));
      check('§4 4f undo で移動が戻る', c4.undo1.tx === 30 && c4.undo1.ty === 12, J(c4.undo1));
      check('§4 4g 削除で props が **null へ戻る** (空配列を残さない)',
        c4.afterDel.count === 0 && c4.afterDel.props === null, J(c4.afterDel));
      check('§4 4h undo で削除も戻る', c4.undo2 === 1, String(c4.undo2));
      check('§4 4i export→import→export が 1 バイトも変わらない (props 込み)',
        c4.roundTrip === true && Array.isArray(c4.roundProps) && c4.roundProps.length === 2,
        J(c4.roundProps));
      check('§4 4j ★既定プリセット 2 種は sanitize を通しても完全一致 (props 追加の非退行)',
        c4.presetSame === true && c4.presetSameField === true,
        J([c4.presetSame, c4.presetSameField]));
      check('§4 4k sanitize が壊れた prop を落とし、未知の種は**残す** / 座標はクランプ',
        c4.sanitized.length === 3 && c4.sanitized[1].kind === '__unknown__' &&
        c4.sanitized[2].tx === 71 && c4.sanitized[2].ty === 0, J(c4.sanitized));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§5 描画 — ★エディタが本編と同じ大きさで描いているか');
    {
      const c5 = await page.evaluate(async () => {
        const E = window.__mapEditor, M = window.DFMapDef;
        E.loadPreset('dungeon');
        E.setTool('prop');
        E.setPropBrush('cart', 0);
        E.placeProp(30, 12);
        const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
        const hits = [];
        proto.drawImage = function (src) {
          try {
            const s = (src && src.src) ? String(src.src) : '';
            if (/mine_cart\.png/.test(s)) hits.push(Array.prototype.slice.call(arguments, 5)
              .map(v => Math.round(v * 1000) / 1000));
          } catch (e) {}
          return orig.apply(this, arguments);
        };
        E.fitToView();
        E.render();
        await new Promise(r => setTimeout(r, 500));
        E.render();
        proto.drawImage = orig;
        const rects = E.propRects();
        const sz = M.propDrawSize('cart', 0);
        const zoom = E.state.view.zoom;
        const pngWith = E.exportPNG().length;
        E.selectPropAt(30, 12);
        const pngSel = E.exportPNG().length;
        E.deleteProp();
        const pngNone = E.exportPNG().length;
        return { rects, sz, zoom, hits: hits.length, hitSample: hits[hits.length - 1] || null,
                 pngWith, pngSel, pngNone, palette: E.propPaletteInfo() };
      });
      check('§5 5a propRects が 1 件で、幅高が propDrawSize × zoom と一致 (別式で描いていない)',
        c5.rects.length === 1 &&
        near(c5.rects[0].w, c5.sz.dw * c5.zoom, 0.05) &&
        near(c5.rects[0].h, c5.sz.dh * c5.zoom, 0.05),
        '実測=' + (c5.rects[0] ? c5.rects[0].w.toFixed(2) + 'x' + c5.rects[0].h.toFixed(2) : 'なし') +
        ' 期待=' + (c5.sz.dw * c5.zoom).toFixed(2) + 'x' + (c5.sz.dh * c5.zoom).toFixed(2));
      check('§5 5b ★シート画像への drawImage が実際に呼ばれている (箱だけで済ませていない)',
        c5.hits > 0 && !!c5.hitSample, '回数=' + c5.hits + ' 最新=' + J(c5.hitSample));
      check('§5 5c drawImage の描画寸法が propRects と一致',
        !!c5.hitSample && near(c5.hitSample[2], c5.rects[0].w, 0.1) &&
        near(c5.hitSample[3], c5.rects[0].h, 0.1), J(c5.hitSample));
      check('§5 5d exportPNG は物の有無で変わる (置いた物が PNG に載る)',
        c5.pngWith !== c5.pngNone, 'あり=' + c5.pngWith + ' なし=' + c5.pngNone);
      check('§5 5e ★選択しても exportPNG は 1 バイトも変わらない (リング/⛔/キャラ影が焼き込まれない)',
        c5.pngWith === c5.pngSel, 'あり=' + c5.pngWith + ' 選択中=' + c5.pngSel);
      check('§5 5f パレットが ' + EXP.entries.length + ' 件を DOM に出している / サムネが解決済み',
        c5.palette.n === EXP.entries.length && c5.palette.thumbPending === 0,
        'n=' + c5.palette.n + ' ok=' + c5.palette.thumbOk + ' fb=' + c5.palette.thumbFallback +
        ' pending=' + c5.palette.thumbPending);
      check('§5 5g ツール "prop" のときはパレットが情景物モードになる',
        c5.palette.propMode === true && c5.palette.visible === true,
        J([c5.palette.propMode, c5.palette.visible]));
    }
    {
      const c5b = await page.evaluate(() => {
        const E = window.__mapEditor;
        E.setTool('select');
        const off = E.propPaletteInfo();
        E.setTool('prop');
        const on = E.propPaletteInfo();
        E.setPropScaleRef(false);
        const noRef = E.propInfo().scaleRef;
        E.setPropScaleRef(true);
        return { off: off.propMode, offVis: off.visible, on: on.propMode, noRef, ref: E.propInfo().scaleRef };
      });
      check('§5 5h ★負の対照: 別ツールでは情景物パレットが出ない (常時表示にしただけではない)',
        c5b.off === false && c5b.offVis === false && c5b.on === true, J(c5b));
      check('§5 5i キャラのシルエット表示は ON/OFF できる (既定 ON)',
        c5b.noRef === false && c5b.ref === true, J([c5b.noRef, c5b.ref]));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§6 lint — ★★通行不能な物が通り道を塞いだら検出する');
    {
      const c6 = await page.evaluate((base) => {
        const M = window.DFMapDef;
        const mk = (props) => Object.assign({}, base, { props: props || null });
        const codes = (d) => {
          const r = M.lintMapDef(d);
          return { err: r.errors.map(e => e.code), warn: r.warnings.map(e => e.code),
                   msg: r.errors.map(e => e.message).join(' / ') };
        };
        /* ★廊下は row13-15 の 3 行。1 個の物では塞ぎきれない (在庫の最大は 2 マス) ので
         *   同じ列に 3 個積んで**原理的に**分断する = 「たまたま塞がらなかった」で PASS しない。
         *   rubble#4 は 2×1 なので col26-27 × row13-15 が塞がり、廊下が完全に断たれる。 */
        const blockCorr = [{ kind: 'rubble', variant: 4, tx: 26, ty: 13 },
                           { kind: 'rubble', variant: 4, tx: 26, ty: 14 },
                           { kind: 'rubble', variant: 4, tx: 26, ty: 15 }];
        /* 負の対照 = **位置も個数も同じで種だけ違う** (通行できる草)。 */
        const grassCorr = [{ kind: 'grass', variant: 0, tx: 26, ty: 13 },
                           { kind: 'grass', variant: 0, tx: 26, ty: 14 },
                           { kind: 'grass', variant: 0, tx: 26, ty: 15 }];
        return {
          none:    codes(mk(null)),
          grass:   codes(mk(grassCorr)),
          block:   codes(mk(blockCorr)),
          onSlot:  codes(mk([{ kind: 'rubble', variant: 4, tx: 8, ty: 10 }])),
          onStart: codes(mk([{ kind: 'rubble', variant: 4, tx: 5, ty: 13 }])),
          onWall:  codes(mk([{ kind: 'grass', variant: 0, tx: 60, ty: 2 }])),
          unknown: codes(mk([{ kind: '__nope__', variant: 0, tx: 10, ty: 10 }])),
          tiles: {
            grass: M.propBlockedTiles(mk(grassCorr)).length,
            block: M.propBlockedTiles(mk(blockCorr)).length,
            tall:  M.propBlockedTiles(mk([{ kind: 'rubble', variant: 5, tx: 26, ty: 14 }])).length,
            rail:  M.propBlockedTiles(mk([{ kind: 'rail', variant: 0, tx: 26, ty: 14 }])).length,
          },
          foot: { rubble4: M.propFootprint('rubble', 4), rubble5: M.propFootprint('rubble', 5) },
        };
      }, mkMapDef(null));
      check('§6 6a ★母集団ガード: 物が無い状態ではこのマップの lint は error なし',
        c6.none.err.length === 0, J(c6.none.err));
      check('§6 6b ★通行できる物 (草) は 1 マスも塞がず error も出ない',
        c6.tiles.grass === 0 && c6.grass.err.length === 0,
        'tiles=' + c6.tiles.grass + ' err=' + J(c6.grass.err));
      check('§6 6c ★★通行不能な物で廊下を塞ぐと到達不能を検出する',
        c6.block.err.indexOf('unreachable-room') >= 0, J(c6.block.err));
      check('§6 6d ★原因を「情景物」と名指しする (廊下が繋がっていない と取り違えない)',
        /情景物/.test(c6.block.msg) && /情景物が無ければ到達できます/.test(c6.block.msg),
        c6.block.msg.slice(0, 130));
      check('§6 6e 敵スロットの上に置くと prop-on-slot (8519138 と同じ壊れ方の予防)',
        c6.onSlot.err.indexOf('prop-on-slot') >= 0, J(c6.onSlot.err));
      check('§6 6f 起点の上に置くと prop-blocks-start',
        c6.onStart.err.indexOf('prop-blocks-start') >= 0, J(c6.onStart.err));
      check('§6 6g 壁の上の物は **warning** (出発は止めない)',
        c6.onWall.warn.indexOf('prop-on-wall') >= 0 && c6.onWall.err.length === 0,
        J([c6.onWall.warn, c6.onWall.err]));
      check('§6 6h 未知の種は warning prop-unknown-kind (error にはしない)',
        c6.unknown.warn.indexOf('prop-unknown-kind') >= 0 && c6.unknown.err.length === 0,
        J([c6.unknown.warn, c6.unknown.err]));
      /* ★横に広い物 (rubble#4 = 2×1) と縦に高い物 (rubble#5 = 1×2) の**両軸**で効いていること。
       *   片方だけだと tw/th の取り違え (行と列の入れ替え) を素通しする。 */
      check('§6 6i フットプリントが縦横の両軸で効いている (rubble#4 は横 2 / rubble#5 は縦 2)',
        c6.tiles.block === 3 * c6.foot.rubble4.tw * c6.foot.rubble4.th &&
        c6.foot.rubble4.tw === 2 && c6.foot.rubble4.th === 1 &&
        c6.tiles.tall === c6.foot.rubble5.tw * c6.foot.rubble5.th &&
        c6.foot.rubble5.tw === 1 && c6.foot.rubble5.th === 2,
        'rubble4×3=' + c6.tiles.block + J(c6.foot.rubble4) + ' rubble5=' + c6.tiles.tall + J(c6.foot.rubble5));
      check('§6 6j 通行できる種 (線路) はマス数がいくら大きくても 0 マス',
        c6.tiles.rail === 0, String(c6.tiles.rail));
    }

    // ══════════════════════════════════════════════════════════════════════
    // 本編側 (§7) — ★★ここが「キャラが入れない」の真の合否
    // ══════════════════════════════════════════════════════════════════════
    mark('§7 本編 — ★★置いた物でキャラが通れなくなること');
    async function openGame(payload) {
      const p = await browser.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push('pageerror: ' + ((e && e.message) || e)));
      p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text()))
        errs.push('console.error: ' + m.text()); });
      await p.setViewport({ width: 1400, height: 900 });
      await p.evaluateOnNewDocument((pl) => {
        try {
          sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
          if (pl) sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(pl));
          else sessionStorage.removeItem('dragonfighters.generatedScenario');
        } catch (e) {}
      }, payload);
      await p.goto(BASE + '/index.html?diag=1', { waitUntil: 'domcontentloaded' });
      await p.waitForFunction("typeof sceneryPlacements !== 'undefined' && typeof obstacleTileMask !== 'undefined'",
        { timeout: 30000 });
      return { p, errs };
    }
    {
      /* ★rubble#4 は 2×1 マスを塞ぐ = 「中心 1 マスだけ」実装とも「周囲を塗りつぶす」実装とも
       *   分離できる。偶数幅は右/下へ伸びるので、塞がるのは (26,14)(27,14) の 2 マスだけ。 */
      const PROPS = [
        { kind: 'rubble', variant: 4, tx: 26, ty: 14 },   // blocking / 2×1
        { kind: 'grass',  variant: 0, tx: 10, ty: 10 },   // 通行できる
        { kind: '__nope__', variant: 0, tx: 12, ty: 10 }, // 未知 = 飛ばされる
      ];
      const g = await openGame(mkPayload(PROPS));
      const m = await g.p.evaluate(() => {
        const props = MAPDEF.props || [];
        const placed = sceneryPlacements.filter(s => s.jx === 0 && s.jy === 0);
        let maskCount = 0;
        for (let i = 0; i < obstacleTileMask.length; i++) if (obstacleTileMask[i]) maskCount++;
        const expect = DFMapDef.propBlockedTiles(MAPDEF);
        return {
          isCustom: !!MAPDEF.isCustom,
          nProps: props.length,
          nPlaced: placed.length,
          placedAt: placed.map(s => [s.kind, s.variant, s.tx, s.ty, s.blocking]),
          maskCount,
          wallAtProp: isTileWall(26, 14),
          // 2×1 の内側 2 マス / すぐ外側 3 マス (過剰に塞いでいないことの対照)
          footIn: [isTileWall(26, 14), isTileWall(27, 14)],
          footOut: [isTileWall(25, 14), isTileWall(26, 13), isTileWall(26, 15)],
          wallAtGrass: isTileWall(10, 10),
          expectBlocked: expect.length,
          maskMatches: expect.every(k => obstacleTileMask[k] === 1),
          scenTotal: sceneryPlacements.length,
        };
      });
      allErrs.push(...g.errs);
      check('§7 7a カスタム幾何として認識されている (この節の前提)', m.isCustom === true);
      check('§7 7b props が 3 件、うち描ける 2 件が sceneryPlacements へ入る (未知の種は飛ばす)',
        m.nProps === 3 && m.nPlaced === 2, 'props=' + m.nProps + ' placed=' + m.nPlaced + ' ' + J(m.placedAt));
      check('§7 7c ★位置がタイル中央 (jx=jy=0) = エディタで見た位置と本編がずれない',
        m.placedAt.length === 2 &&
        m.placedAt.some(a => a[0] === 'rubble' && a[2] === 26 && a[3] === 14) &&
        m.placedAt.some(a => a[0] === 'grass' && a[2] === 10 && a[3] === 10), J(m.placedAt));
      check('§7 7d blocking フラグが本編側でも立っている',
        m.placedAt.some(a => a[0] === 'rubble' && a[4] === true) &&
        m.placedAt.some(a => a[0] === 'grass' && a[4] === false), J(m.placedAt));
      check('§7 7e ★★置いた物のマスで isTileWall が true = キャラが入れない',
        m.wallAtProp === true, String(m.wallAtProp));
      check('§7 7f ★★通行できる物 (草) のマスは isTileWall が false (何でも塞いでいるのではない)',
        m.wallAtGrass === false, String(m.wallAtGrass));
      check('§7 7g obstacleTileMask が propBlockedTiles と完全一致 (エディタの lint と同じ 1 本)',
        m.maskMatches === true && m.expectBlocked > 1 && m.maskCount >= m.expectBlocked,
        '期待=' + m.expectBlocked + ' マスク総数=' + m.maskCount);
      check("§7 7h ★2×1 の内側 2 マスが塞がり、すぐ外側 3 マスは塞がらない (中心1マスでも塗りつぶしでもない)",
        m.footIn.every(v => v === true) && m.footOut.every(v => v === false),
        '内側=' + J(m.footIn) + ' 外側=' + J(m.footOut));
      await g.p.close();
    }
    {
      // ★母集団ガード: 既定の 6 シナリオ (props 無し) は 1 度もこの経路を通らない
      const g = await openGame(null);
      const m = await g.p.evaluate(() => ({
        isCustom: !!MAPDEF.isCustom,
        props: MAPDEF.props === undefined ? null : MAPDEF.props,
        zeroJitter: sceneryPlacements.filter(s => s.jx === 0 && s.jy === 0).length,
        total: sceneryPlacements.length,
      }));
      allErrs.push(...g.errs);
      check('§7 7i ★既定シナリオは props:null で、この経路を 1 度も通らない (非退行)',
        m.isCustom === false && m.props === null && m.total > 0,
        'isCustom=' + m.isCustom + ' props=' + J(m.props) + ' 情景=' + m.total);
      check('§7 7j ★既定シナリオの情景は全件ジッタ付き (props が混ざっていない)',
        m.zeroJitter === 0, 'jx=jy=0 の件数=' + m.zeroJitter + ' / 全' + m.total);
      await g.p.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§8 退化 — カタログが取れないときに無言にしない');
    {
      const c8 = await page.evaluate(async () => {
        const E = window.__mapEditor;
        E.setTool('prop');
        const r = await E.reloadSceneryCatalog('/__no_such_scenery__.html');
        await new Promise(res => setTimeout(res, 250));
        const info = E.propPaletteInfo();
        const place = E.placeProp(30, 12);
        const back = await E.reloadSceneryCatalog();
        await new Promise(res => setTimeout(res, 250));
        return { ok: r.ok, n: info.n, note: info.note, ng: info.noteNg,
                 place: place, backOk: back.ok, backN: E.propPaletteInfo().n };
      });
      check('§8 8a 取得失敗でパレットが 0 件になる (退化が再現している)',
        c8.ok === false && c8.n === 0, 'ok=' + c8.ok + ' n=' + c8.n);
      check('§8 8b ★理由が #propNote に .ng 付きで出る (silent fail-open にしない)',
        c8.ng === true && !!c8.note && c8.note.length > 4, J(c8.note));
      check('§8 8c 置こうとすると理由付きで拒否される',
        c8.place.ok === false && /情景カタログ/.test(c8.place.reason || ''), J(c8.place));
      check('§8 8d 再取得で ' + EXP.entries.length + ' 件へ戻る (再取得の契約)',
        c8.backOk === true && c8.backN === EXP.entries.length, 'n=' + c8.backN);
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§E コンソール健全性');
    check('§E pageerror / console.error が 0 件', allErrs.length === 0,
      allErrs.length ? allErrs.slice(0, 4).join(' | ') : 'なし');
    check('§E 意図しない 404 が 0 件 (favicon / §8 の意図的な欠損を除く)', rec.notFound.length === 0,
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
