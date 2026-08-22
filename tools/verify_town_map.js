#!/usr/bin/env node
/*
 * verify_town_map.js — 港町フランの街 town.html / js/town-map.js の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-22_town-map-phlan.md` の「受入条件」を機械的に測る。
 *
 * ■ 何を測るか (依頼書の受入条件の番号と対応)
 *    1. 格子が乗っている            … py tools/make_grid_map.py --check が両軸 OK
 *    2. 孤立した歩けるマスが 0 件    … ★本番の TOWN_MAP.findPath を**ブラウザで呼ぶ**
 *    3. 運河が渡れない              … マスク × **絵の画素** の 2 経路
 *    4. クリックしたタイルに立つ
 *    5. 歩けないタイルでは動かない
 *    6. 看板から施設へ入れる        … 遷移先の **画面が開いているか** まで
 *   10. 前口上が二重に出ない      … 後回しになっただけ (次に鹿亭へ入ると出る)
 *    7. 入口が 2 種類になっていない  … 遷移後の location.search が空文字
 *    8. 闇市は解禁前に出ない
 *    9. 立ち位置の規則              … 5 経路 + 未知の値 + 欠損 (fail-safe の直接検査)
 *   11. compact でも遊べる          … 390 / 720 / 1440 の 3 点
 *   12. 撤退で赤くなる              … ?town=0 で 6 つの**状態**が崩れる
 *   13. 装置 assert                 … §0 の変異アンカーと、各所の母集団ガード
 *
 * ■ 受入条件 14 (既存の赤を期待値を緩めずに回収) は別ファイルで測る
 *    tools/verify_title_screen.js の受入条件 2 / 3 / 4c / 8 はこの変更で必ず赤くなる
 *    (依頼書 §10 の予告は 2 本だったが、実測では **9 本** だった)。
 *    回収は「期待文字列を書き換える」ではなく **arriveTavern() で測定点を
 *    「街を通り抜けた後」へ移し**、(TZ) が「本当に通り抜けたか」を装置 assert で押さえた。
 *
 * ■ ⭐⭐⭐ 空振りを防ぐ仕掛け
 *   - 到達可能性は **自前で BFS を書かない**。TOWN_MAP.findPath をブラウザで呼ぶ。
 *     近傍の数が違うだけで「歩けない道」を永久に緑と報告する (恒久教訓)。
 *   - 運河は「人が書いたマスク」と「codex1 が描いた画素」の **別々の作者のデータ**で突き合わせる。
 *   - 撤退 (受入条件 12) は「?town=0 で緑」ではなく、**同じ measureTownState を両モードに当てて**
 *     状態の conjunction が崩れることを見る (#5 save-slots が「何も起きないので結果的に一致」
 *     という空振りを実際に踏んだ)。
 *   - §0 が変異アンカーの 1 箇所ヒットを先に確かめる (0 件ヒットは exit 3 でドライバごと死ぬ)。
 *
 * ■ 使い方
 *     node tools/verify_town_map.js
 *     node tools/verify_town_map.js --mutate canalopen      (負のコントロールを手回し)
 *     node tools/verify_town_map.js --mutate isolate | snapnear | addquery | hidebehind
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

// ⚠ path.resolve 必須。区切り文字のまま持つと配信が全 404 になり、症状はタイムアウトだけになる。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const PORT = parseInt(arg('port', '8897'), 10);
const MUTATE = arg('mutate', null);

/* ══ 負のコントロール ═══════════════════════════════════════════════════════
 *  ⚠ 置換前後で**長さを変える**こと。同じ長さだと「当たったのに何も変わらない」を
 *    検出できない。⚠ 置換文字列は 1 行に閉じる (CRLF/LF 混在で複数行は必ず空振りする)。 */
const MUTATE_TARGETS = ['js/town-map.js', 'town.html', 'tavern.html'];
const MUTATIONS = {
  // 運河に穴を開ける → 受入条件 3 が赤くなる
  canalopen: [
    ['    /* row  5 */ "rrrr...rr.r.~~.ss..ssBB",',
     '    /* row  5 */ "rrrr...rr.r...ss..ssBB",  /* \u2605\u5909\u7570canalopen */'],
  ],
  /* (2,0) の唯一の隣 (2,1) を塞いで **1 マスだけ孤立させる** → 受入条件 2 が赤くなる。
     ⚠⚠ 最初は「湖岸の遊歩道 (row 11) を塞ぐ」を変異にしたが **空振りした** (67/67 のまま)。
       実測すると桟橋 (row 12) が第 2 の迂回路になっていて孤立しなかった。
       ⭐ 負のコントロールは「塞げば孤立するはず」という**思い込みで選ばない**。
         1 マスだけを外科的に切り離すのが、地形の繋がり方に依存しない唯一の作り方。 */
  isolate: [
    ['    /* row  1 */ "Br.rrr.rrBBB~~BBBs^.sBB",',
     '    /* row  1 */ "Brrrrr.rrBBB~~BBBs^.sBB",  /* ★変異isolate: (2,0) の唯一の隣を塞ぐ */'],
  ],
  /* 依頼書が ⛔ で禁じた「隣接まで寄せる救済」を入れる → 受入条件 5 が赤くなる。
     ⚠⚠ 最初は「walkTo の isWalkable ガードを消す」を変異にしたが **空振りした**。
       town.html のガードは findPath 内のガードと**冗長**で、外しても findPath が null を返す。
       ⭐ 受入条件 5 の真のリスクは「ガードが無いこと」ではなく
         **押した場所と違う所へ行くこと**。負のコントロールはその挙動そのものを作る。 */
  snapnear: [
    ['      if (!TM.isWalkable(c, r)) return false;',
     '      if (!TM.isWalkable(c, r)) { var _n = [[1,0],[-1,0],[0,1],[0,-1]].map(function (d) { return [c + d[0], r + d[1]]; }).filter(function (p) { return TM.isWalkable(p[0], p[1]); }); if (!_n.length) return false; c = _n[0][0]; r = _n[0][1]; }  /* ★変異snapnear */'],
  ],
  /* 「街へ出る」を **実際に踏んだ壊れ方** へ戻す → (R2) が赤くなる。
     ⭐ この欠陥は目視でしか見つからなかった。矩形の重なり比較では見えず、
       #btnDrawQuest が上に来て押せないだけ = 「在るのに押せない」。
     ⚠ 位置を戻すだけなので、要素は在るし画面内にも居る ((R1) は緑のまま)。
       だからこそ (R2) が「押せるか」を見ていないと素通りする。 */
  hidebehind: [
    ['      position: absolute; left: 18px; top: 18px; z-index: 13;',
     '      position: absolute; left: 18px; bottom: 18px; z-index: 12;  /* ★変異hidebehind */'],
  ],
  // 遷移先にクエリを足す → 受入条件 7 が赤くなる
  addquery: [
    ['      location.href = "tavern.html";',
     '      location.href = "tavern.html?via=" + f.via;  /* \u2605\u5909\u7570addquery */'],
  ],
};
const MUT_ORDER = ['canalopen', 'isolate', 'snapnear', 'addquery', 'hidebehind'];
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const targets = [];
  for (const pair of MUTATIONS[key]) {
    const from = pair[0], to = pair[1];
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行'); process.exit(3);
    }
    if (from.length === to.length) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → §0 が誤報する'); process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
    targets.push(hits[0]);
  }
  _mutCache[key] = { files: out, targets: targets };
  return _mutCache[key];
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/town.html';
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey).files[rel]); return;
        }
        const fp = path.join(ROOT, rel);
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

const results = [];
function check(name, cond, detail) {
  results.push({ name: name, ok: !!cond });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ══ ページを開く共通手順 ═══════════════════════════════════════════════════
 *  ⚠⚠ same-origin の localStorage / sessionStorage は **ページ遷移をまたいで生き残る**。
 *    document-start で dragonfighters 接頭辞を purge してから、この試験が要る値だけを置く。
 *  ⚠ evaluateOnNewDocument は遷移のたびに再実行されるので、purge は 1 タブ 1 回に絞る
 *    (絞らないと town → tavern の遷移で enterVia を自分で消してしまい、受入条件 6 が測れない)。 */
async function openTown(browser, base, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  /* ⚠ /favicon.ico の 404 だけは除く。リポジトリに favicon が無いのは index.html /
     tavern.html でも同じで、この機能の欠陥ではない。
     ⛔ ただし **404 を一括では握り潰さない**。除外はこの 1 本の URL だけに絞る
        (本文には URL が入らないので m.location().url で見る。text だけで弾こうとすると
         「全部の 404 を見逃す」か「favicon で永久に赤」のどちらかになる)。 */
  page.on('console', m => {
    if (m.type() !== 'error') return;
    let url = '';
    try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push('console: ' + m.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: opts.w || 1440, height: opts.h || 900,
                           isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try {
      if (sessionStorage.getItem('__drvSeeded')) return;
      sessionStorage.setItem('__drvSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('dragonfighters.') === 0) kill.push(k);
      }
      kill.forEach(k => localStorage.removeItem(k));
      const kill2 = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.indexOf('dragonfighters.') === 0) kill2.push(k);
      }
      kill2.forEach(k => sessionStorage.removeItem(k));
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify([seed.cls]));
      if (seed.plazaUnlocked) {
        /* ⚠ 闇市は「解禁 (5 回クリア)」と「門番 (変装手段)」の **2 段**。
           受入条件 6 は看板から中へ入れることを測るので、門番を通れる状態まで作る。
           everEntered / gatekeeperEventSeen を立てるのは初回ナレを挟ませないため
           (ナレは受入条件 6 の対象ではないし、待ちが伸びると測定が不安定になる)。 */
        localStorage.setItem('dragonfighters.plazaState',
          JSON.stringify({ unlocked: true, everEntered: true, gatekeeperEventSeen: true }));
        if (seed.plazaWand) localStorage.setItem('dragonfighters.plazaInventory',
          JSON.stringify({ wand_polymorph: [3] }));
      }
      if (seed.prologueSeen) localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (seed.exitVia !== null) sessionStorage.setItem('dragonfighters.exitVia', seed.exitVia);
    } catch (e) {}
  }, { cls: opts.cls || 'warrior', plazaUnlocked: opts.plazaUnlocked !== false,
       plazaWand: opts.plazaWand !== false, prologueSeen: !!opts.prologueSeen,
       exitVia: (opts.exitVia === undefined || opts.exitVia === null) ? null : opts.exitVia });
  await page.goto(base + (opts.url || '/town.html'), { waitUntil: 'load', timeout: 30000 });
  return { page: page, errs: errs };
}
async function waitTownReady(page, ms) {
  try {
    await page.waitForFunction("window.__town && typeof window.__town.heroTile === 'function'", { timeout: ms || 15000 });
    return true;
  } catch (e) { return false; }
}
/* 「歩き終わるまで待つ」。⚠ 押した直後は moving がまだ false なので、
   止まっている **かつ** 2 回続けて同じタイル、を両方見る。 */
async function settle(page, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 9000)) {
    const st = await page.evaluate(() => ({ moving: __town.isMoving(), tile: __town.heroTile() }));
    if (!st.moving) {
      await sleep(160);
      const st2 = await page.evaluate(() => ({ moving: __town.isMoving(), tile: __town.heroTile() }));
      if (!st2.moving && eqStr(st.tile, st2.tile)) return st2.tile;
    }
    await sleep(120);
  }
  return await page.evaluate(() => __town.heroTile());
  function eqStr(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
}
async function clickTile(page, c, r) {
  const p = await page.evaluate((cc, rr) => __town.clientFromTile(cc, rr), c, r);
  await page.mouse.click(p.x, p.y);
}

/* ══ 受入条件 12 のための共通の「状態」 ═══════════════════════════════════════
 *  ⭐⭐⭐ 撤退で赤くなることを「同じ本体」で測るための 1 本。
 *    ?town=0 のときは町ごと消えるので、この 6 つの状態が**すべて**崩れる。
 *  ⚠ 戻り値の AND ではなく **状態の conjunction** を返す (何も起きないと結果的に一致、を防ぐ)。 */
async function measureTownState(browser, base, url) {
  const st = { townAlive: false, reachAllZero: false, clickLands: false,
               signCount: 0, spawnRule: false, noQuery: false };
  const o = await openTown(browser, base, { url: url, plazaUnlocked: true, exitVia: 'shop' });
  const page = o.page;
  st.townAlive = await waitTownReady(page, 8000);
  if (st.townAlive) {
    const r = await page.evaluate(() => {
      const TM = window.TOWN_MAP;
      let bad = 0;
      for (let y = 0; y < TM.ROWS; y++) for (let x = 0; x < TM.COLS; x++) {
        if (!TM.isWalkable(x, y)) continue;
        for (const f of TM.FACILITIES) if (TM.findPath(x, y, f.enter[0], f.enter[1]) === null) { bad++; break; }
      }
      return { bad: bad, signs: __town.signKeys().length, tile: __town.heroTile() };
    });
    st.reachAllZero = (r.bad === 0);
    st.signCount = r.signs;
    st.spawnRule = eq(r.tile, { c: 15, r: 3 });          // exitVia:"shop" → 店先の前
    await clickTile(page, 6, 3);
    const t = await settle(page);
    st.clickLands = eq(t, { c: 6, r: 3 });
    st.noQuery = (await page.evaluate(() => location.search)) === '';
  }
  await page.close();
  return st;
}

(async () => {
  console.log('=== verify_town_map.js' + (MUTATE ? '  [変異 ' + MUTATE + ']' : '') + ' ===\n');

  /* ── §0 装置: 変異アンカーが実際に 1 箇所ヒットする (受入条件 13) ───────────── */
  console.log('--- §0 装置: 変異アンカー ---');
  for (const key of MUT_ORDER) {
    const m = mutatedSources(key);                      // 見つからなければ中で exit 3
    check('(0-' + key + ') [装置] 変異アンカーが 1 ファイル 1 箇所にヒットする', true, m.targets.join(','));
  }

  /* ── 受入条件 1: 焼き込み格子がタイル境界に乗っている ─────────────────────── */
  console.log('\n--- 受入条件 1. 格子が乗っている ---');
  let gridOut = '';
  try {
    // ⚠ `python` は Windows Store のスタブで何もせず exit 0 になる。必ず `py`。
    gridOut = execFileSync('py', ['tools/make_grid_map.py', '--check', 'assets/town_phlan.jpg', '--tile', '64'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { gridOut = String((e && e.stdout) || '') + String((e && e.message) || ''); }
  const okV = /OK\s*縦線/.test(gridOut), okH = /OK\s*横線/.test(gridOut);
  check('(1a) 縦線が 64px 格子に乗る', okV);
  check('(1b) 横線が 64px 格子に乗る', okH);
  check('(1c) [装置] --check が実際に走った (NG 判定が出る余地がある)',
        /縦線/.test(gridOut) && /横線/.test(gridOut));

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_town_');
  const srv = await startServer(PORT, MUTATE);
  const base = 'http://localhost:' + PORT;
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: true,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  try {
    /* ── 受入条件 2: 孤立した歩けるマスが 0 件 ───────────────────────────────
     *  ⚠⚠⚠ 自前で BFS を書かない。本番の TOWN_MAP.findPath をブラウザで呼ぶ。 */
    console.log('\n--- 受入条件 2. 孤立した歩けるマスが 0 件 ---');
    {
      const o = await openTown(browser, base, { plazaUnlocked: true });
      const ready = await waitTownReady(o.page);
      check('(2z0) [装置] town.html が起動しシームが載っている', ready);
      const r = await o.page.evaluate(() => {
        const TM = window.TOWN_MAP;
        const bad = [];
        let walkable = 0;
        for (let y = 0; y < TM.ROWS; y++) for (let x = 0; x < TM.COLS; x++) {
          if (!TM.isWalkable(x, y)) continue;
          walkable++;
          for (const f of TM.FACILITIES) {
            if (TM.findPath(x, y, f.enter[0], f.enter[1]) === null) { bad.push(x + ',' + y + '->' + f.key); break; }
          }
        }
        return { bad: bad, walkable: walkable, total: TM.COLS * TM.ROWS,
                 facilities: TM.FACILITIES.map(f => f.key),
                 usesProd: typeof TM.findPath === 'function' };
      });
      check('(2z1) [装置] 母集団が空でない (歩けるマスが 100 以上)', r.walkable >= 100, r.walkable + '/' + r.total);
      check('(2z2) [装置] 施設が 3 つある', r.facilities.length === 3, r.facilities.join(','));
      check('(2z3) [装置] 判定に本番の TOWN_MAP.findPath を使っている', r.usesProd);
      check('(2) ★受入条件2: 3 施設のどれかへ到達できない歩けるマスが 0 件',
            r.bad.length === 0, r.bad.length + ' 件 ' + r.bad.slice(0, 12).join(' '));
      check('(2e) ページエラーが 0 件', o.errs.length === 0, o.errs.join(' | '));
      await o.page.close();
    }

    /* ── 受入条件 3: 運河が渡れない (マスク × 画素の 2 経路) ────────────────── */
    console.log('\n--- 受入条件 3. 運河が渡れない ---');
    {
      const o = await openTown(browser, base, {});
      await waitTownReady(o.page);
      const r = await o.page.evaluate(async () => {
        const TM = window.TOWN_MAP;
        /* (a) マスク: (12,r)(13,r) は r=3 と r=10 以外すべて塞がる */
        const maskBad = [];
        for (let y = 0; y < TM.ROWS; y++) for (const x of [12, 13]) {
          const walk = TM.isWalkable(x, y), expect = (y === 3 || y === 10);
          if (walk !== expect) maskBad.push(x + ',' + y + ' walk=' + walk);
        }
        /* (b) 画素: 絵そのものから水の割合を測る。⭐ 突き合わせる相手は「別の作者が書いた別のデータ」
               (マスク = 人が書いた / 画素 = codex1 が描いた)。写経の突き合わせは両方同じ誤りだと永久に緑。 */
        const img = await new Promise((res) => {
          const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
          im.src = 'assets/town_phlan.jpg';
        });
        if (!img) return { maskBad: maskBad, pixOk: false };
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        const waterFrac = (c, r2) => {
          const d = g.getImageData(c * 64, r2 * 64, 64, 64).data;
          let w = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 2] > d[i] + 12 && d[i + 1] > d[i] + 4) w++;
          }
          return w / (d.length / 4);
        };
        /* 橋の袂 (row 2/4/9/11) は橋桁が写り込むので除く。純粋な水面の行だけを見る。 */
        const pureRows = [0, 1, 5, 6, 7, 8, 12, 13, 14];
        const wet = pureRows.map(y => Math.min(waterFrac(12, y), waterFrac(13, y)));
        return {
          maskBad: maskBad, pixOk: true,
          minWet: Math.min.apply(null, wet),
          bridgeNorthWet: Math.max(waterFrac(12, 3), waterFrac(13, 3)),
          landWet: waterFrac(3, 3),
          southWet: [waterFrac(12, 9), waterFrac(12, 10)].map(v => Math.round(v * 1000) / 1000)
        };
      });
      check('(3a) ★マスク: 運河 (12,r)(13,r) は row 3 と row 10 以外すべて塞がる',
            r.maskBad.length === 0, r.maskBad.join(' '));
      check('(3z0) [装置] 絵の画素を実際に読めた', r.pixOk);
      check('(3b) ★画素: 塞いだ運河タイル (橋の袂を除く) はどれも水が 60% 以上',
            r.pixOk && r.minWet >= 0.60, '最小 ' + Math.round((r.minWet || 0) * 100) + '%');
      check('(3c) ★画素: 歩ける北橋 (12,3)(13,3) は水 0%',
            r.pixOk && r.bridgeNorthWet === 0, Math.round((r.bridgeNorthWet || 0) * 100) + '%');
      check('(3z1) [装置] 水の判定が陸を水と誤らない ((3,3) の石畳が 5% 以下)',
            r.pixOk && r.landWet <= 0.05, Math.round((r.landWet || 0) * 100) + '%');
      /* ⚠ 記録用: 南橋は絵が半マスずれている。row 9 と row 10 で水の割合はほぼ同じ。
         歩けるのは row 10 だけ、は依頼書の決定 (足元をタイル中心に置くので体が橋板に乗る)。 */
      console.log('       [記録] 南橋の水の割合 row9/row10 = ' + JSON.stringify(r.southWet));
      await o.page.close();
    }

    /* ── 受入条件 4/5: クリックの挙動 ─────────────────────────────────────── */
    console.log('\n--- 受入条件 4. クリックしたタイルに立つ / 5. 歩けないタイルでは動かない ---');
    {
      const o = await openTown(browser, base, {});
      await waitTownReady(o.page);
      const spots = [[6, 3], [11, 3], [15, 3], [15, 10], [8, 12]];
      let hit = 0;
      for (const s of spots) {
        await clickTile(o.page, s[0], s[1]);
        const t = await settle(o.page);
        const ok = eq(t, { c: s[0], r: s[1] });
        if (ok) hit++;
        check('(4-' + s[0] + ',' + s[1] + ') クリックしたタイルに立つ', ok, JSON.stringify(t));
      }
      check('(4z) [装置] 5 か所すべて試した', spots.length === 5, hit + '/' + spots.length);

      const before = await o.page.evaluate(() => __town.heroTile());
      await clickTile(o.page, 12, 6);                        // 運河のど真ん中
      await sleep(900);
      const after = await settle(o.page, 2500);
      check('(5) ★受入条件5: 歩けないタイル (12,6) をクリックしても 1 マスも動かない',
            eq(before, after), JSON.stringify(before) + ' -> ' + JSON.stringify(after));
      check('(5z) [装置] (12,6) は本当に歩けないタイル',
            await o.page.evaluate(() => !window.TOWN_MAP.isWalkable(12, 6)));
      await o.page.close();
    }

    /* ── 受入条件 6/7: 看板 → 施設 / クエリを足していない ──────────────────
     *  ⚠⚠ enterVia は tavern.html の受け口が **読んだ瞬間に消す** (一回性)。
     *    よって「着いた後に enterVia が残っているか」で測ると必ず赤くなる。
     *  ⭐ 測定点を **効果の側** へ移す: どの画面が開いたか + キーが消費されているか。 */
    console.log('\n--- 受入条件 6. 看板から施設へ入れる / 7. 入口が 2 種類になっていない ---');
    for (const cse of [['tavern', { shop: false, plaza: false }],
                       ['shop',   { shop: true,  plaza: false }],
                       ['plaza',  { shop: false, plaza: true  }]]) {
      const key = cse[0], want = cse[1];
      const o = await openTown(browser, base, { plazaUnlocked: true, prologueSeen: true });
      await waitTownReady(o.page);
      const present = await o.page.evaluate((k) => !!document.getElementById('townSign_' + k), key);
      check('(6z-' + key + ') [装置] 看板が実在する', present);
      await o.page.evaluate((k) => document.getElementById('townSign_' + k).click(), key);
      try { await o.page.waitForFunction("location.pathname.indexOf('/tavern.html') >= 0", { timeout: 20000 }); } catch (e) {}
      await sleep(900);
      const loc = await o.page.evaluate(() => {
        const vis = (id) => {
          const el = document.getElementById(id);
          if (!el) return false;
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden';
        };
        return { path: location.pathname, search: location.search,
                 shop: vis('shopScreen'), plaza: vis('plazaScreen'),
                 tavernVis: getComputedStyle(document.getElementById('tavern')).visibility,
                 hold: document.documentElement.classList.contains('enterViaHold'),
                 leftover: sessionStorage.getItem('dragonfighters.enterVia') };
      });
      check('(6-' + key + ') ★看板から tavern.html へ着く', /\/tavern\.html$/.test(loc.path), loc.path);
      check('(6s-' + key + ') ★★着いた先の画面が正しい (shop=' + want.shop + ' / plaza=' + want.plaza + ')',
            loc.shop === want.shop && loc.plaza === want.plaza,
            JSON.stringify({ shop: loc.shop, plaza: loc.plaza }));
      check('(6c-' + key + ') [装置] enterVia は一回性 (受け口が読んで消している)',
            loc.leftover === null, String(loc.leftover));
      check('(6h-' + key + ') ★幕 (enterViaHold) が外れ、酒場が visible に戻っている',
            loc.hold === false && loc.tavernVis === 'visible',
            JSON.stringify({ hold: loc.hold, vis: loc.tavernVis }));
      check('(7-' + key + ') ★受入条件7: 遷移後の location.search が空文字 (クエリを 1 つも足していない)',
            loc.search === '', JSON.stringify(loc.search));
      await o.page.close();
    }

    /* ── 受入条件 10: 前口上が二重に出ない ─────────────────────────────────
     *  ⭐ 「消えた」のではなく「後回しになった」ことまで測る。
     *    🛡️ から入ったときは出ず、その直後に 🦌 から入ると **出る**。
     *  ⚠ 母集団ガード: prologueSeen を仕込まない (仕込むとどちらでも出ないので常に緑)。 */
    console.log('\n--- 受入条件 10. 前口上が二重に出ない ---');
    {
      const o = await openTown(browser, base, { plazaUnlocked: true, prologueSeen: false });
      await waitTownReady(o.page);
      const seed = await o.page.evaluate(() => localStorage.getItem('dragonfighters.prologueSeen'));
      check('(10z) [装置] prologueSeen が未設定 (前口上が出る条件を作れている)', seed === null, String(seed));

      await o.page.evaluate(() => document.getElementById('townSign_shop').click());
      try { await o.page.waitForFunction("location.pathname.indexOf('/tavern.html') >= 0", { timeout: 20000 }); } catch (e) {}
      await sleep(1500);
      const viaShop = await o.page.evaluate(() => {
        const ov = document.getElementById('prologueOverlay');
        return { overlay: !!ov && getComputedStyle(ov).display !== 'none',
                 shop: getComputedStyle(document.getElementById('shopScreen')).display !== 'none',
                 seen: localStorage.getItem('dragonfighters.prologueSeen') };
      });
      check('(10a) ★🛡️ から入ったときは前口上が出ない', viaShop.overlay === false, JSON.stringify(viaShop));
      check('(10z2) [装置] そのとき店はちゃんと開いている (何も起きずに緑ではない)', viaShop.shop === true);
      check('(10z3) [装置] prologueSeen は立っていない (消したのではなく後回し)',
            viaShop.seen === null, String(viaShop.seen));

      /* 街へ出て、今度は 🦌 からくぐる */
      await o.page.evaluate(() => {
        const s = document.getElementById('shopScreen'); if (s) s.style.display = 'none';
        document.getElementById('townExit').click();
      });
      try { await o.page.waitForFunction("window.__town && typeof window.__town.heroTile === 'function'", { timeout: 20000 }); } catch (e) {}
      await o.page.evaluate(() => document.getElementById('townSign_tavern').click());
      try { await o.page.waitForFunction("location.pathname.indexOf('/tavern.html') >= 0", { timeout: 25000 }); } catch (e) {}
      try {
        await o.page.waitForFunction(() => {
          const ov = document.getElementById('prologueOverlay');
          return !!ov && getComputedStyle(ov).display !== 'none';
        }, { timeout: 20000 });
      } catch (e) {}
      const viaTavern = await o.page.evaluate(() => {
        const ov = document.getElementById('prologueOverlay');
        return { overlay: !!ov && getComputedStyle(ov).display !== 'none', path: location.pathname };
      });
      check('(10b) ★その直後に 🦌 から入ると前口上が **出る** (消えたのではなく後回しだった)',
            viaTavern.overlay === true, JSON.stringify(viaTavern));
      await o.page.close();
    }

    /* ── 受入条件 8: 闇市は解禁前に出ない ─────────────────────────────────── */
    console.log('\n--- 受入条件 8. 闇市は解禁前に出ない ---');
    {
      const o = await openTown(browser, base, { plazaUnlocked: false });
      await waitTownReady(o.page);
      const r = await o.page.evaluate(() => ({
        sign: !!document.getElementById('townSign_plaza'),
        hud:  !!document.getElementById('townHudBtn_plaza'),
        keys: __town.signKeys(),
        stored: localStorage.getItem('dragonfighters.plazaState')
      }));
      check('(8z) [装置] plazaState が未設定 (解禁前の状態を作れている)', r.stored === null, String(r.stored));
      check('(8a) ★解禁前は 🌑 の看板が DOM に無い', r.sign === false);
      check('(8b) ★解禁前は 🌑 の HUD ボタンも DOM に無い', r.hud === false);
      check('(8c) ★解禁前でも 🦌 と 🛡️ は出る (母集団が空で緑になっていない)',
            r.keys.length === 2 && r.keys.indexOf('tavern') >= 0 && r.keys.indexOf('shop') >= 0, r.keys.join(','));
      await clickTile(o.page, 3, 10);                    // 石段の位置をクリックしても遷移しない
      await sleep(1500);
      check('(8d) ★石段をクリックしても遷移しない',
            /\/town\.html$/.test(await o.page.evaluate(() => location.pathname)));
      await o.page.close();
    }

    /* ── 受入条件 9: 立ち位置の規則 (fail-safe の直接検査つき) ───────────────── */
    console.log('\n--- 受入条件 9. 立ち位置の規則 ---');
    {
      const cases = [
        ['title',   { c: 8, r: 12 }],
        ['tavern',  { c: 10, r: 3 }],
        ['shop',    { c: 15, r: 3 }],
        ['plaza',   { c: 3, r: 11 }],
        ['dungeon', { c: 10, r: 3 }],
        ['__unknown__', { c: 10, r: 3 }],   // ⚠ 知らない値 → fail-safe
      ];
      for (const cse of cases) {
        const via = cse[0], want = cse[1];
        const o = await openTown(browser, base, { exitVia: via });
        await waitTownReady(o.page);
        const got = await o.page.evaluate(() => __town.heroTile());
        check('(9-' + via + ') ' + via + ' から街へ入ると (' + want.c + ',' + want.r + ') に立つ',
              eq(got, want), JSON.stringify(got));
        await o.page.close();
      }
      // 欠損 (キーそのものが無い)
      const o2 = await openTown(browser, base, {});
      await waitTownReady(o2.page);
      const got = await o2.page.evaluate(() => ({ tile: __town.heroTile(), via: __town.spawnVia() }));
      check('(9-none) exitVia が欠損なら (10,3) 酒場の前へ落とす',
            eq(got.tile, { c: 10, r: 3 }) && got.via === null, JSON.stringify(got));
      // 一回性: 読んだら消す (再読込で前回の入口が復活しない)
      await o2.page.reload({ waitUntil: 'load' });
      await waitTownReady(o2.page);
      const again = await o2.page.evaluate(() => __town.spawnVia());
      check('(9z) [装置] exitVia は一回性 (再読込で残っていない)', again === null, String(again));
      await o2.page.close();
    }

    /* ── 街 ⇄ 酒場の往復 (依頼書 §5 の対) ──────────────────────────────────
     *  ⚠⚠⚠ **「そこに在る」と「押せる」は別物。** #townExit を #shopEntry と同じ
     *    bottom:18px に置いたら、#btnDrawQuest (依頼を引く) が上に来て押せなかった。
     *    矩形の重なり比較では **見えない** (別々の親の中にいると rect が交差しない)。
     *    効くのは「その点で elementFromPoint が何を返すか」だけ。目視で見つけた欠陥なので、
     *    同じ型を二度と通さないようにここで機械化する。
     *  ⚠ 母集団は画面の向きでも割れるので compact 390 と desktop 1440 の両方で測る。 */
    console.log('\n--- 街 ⇄ 酒場の往復 (街へ出る導線が実際に押せるか) ---');
    for (const vp of [['compact390', 390, 844, true], ['desktop1440', 1440, 900, false]]) {
      const label = vp[0], w = vp[1], h = vp[2], mobile = vp[3];
      const o = await openTown(browser, base, { w: w, h: h, mobile: mobile, prologueSeen: true });
      await waitTownReady(o.page);
      await o.page.evaluate(() => document.getElementById('townSign_tavern').click());
      try { await o.page.waitForFunction("location.pathname.indexOf('/tavern.html') >= 0", { timeout: 25000 }); } catch (e) {}
      await sleep(1200);
      const r = await o.page.evaluate(() => {
        const el = document.getElementById('townExit');
        if (!el) return { exists: false };
        const b = el.getBoundingClientRect();
        const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        const name = !hit ? 'null' : (hit.id ? '#' + hit.id : hit.tagName);
        return { exists: true, w: Math.round(b.width), h: Math.round(b.height),
                 inView: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
                 hitSelf: !!hit && (hit === el || el.contains(hit)), hitName: name };
      });
      check('(R1-' + label + ') [装置] 酒場に「街へ出る」導線がある', r.exists === true);
      check('(R2-' + label + ') ★★その導線が **実際に押せる** (その点で拾われるのが自分自身)',
            r.hitSelf === true && r.inView === true, JSON.stringify(r));
      if (r.hitSelf) {
        await o.page.evaluate(() => document.getElementById('townExit').click());
        try { await o.page.waitForFunction("window.__town && typeof window.__town.heroTile === 'function'", { timeout: 25000 }); } catch (e) {}
        const back = await o.page.evaluate(() => ({ tile: __town.heroTile(), path: location.pathname, search: location.search }));
        check('(R3-' + label + ') ★押すと街の (10,3) 酒場の前に戻る (クエリ無し)',
              eq(back.tile, { c: 10, r: 3 }) && /\/town\.html$/.test(back.path) && back.search === '',
              JSON.stringify(back));
      } else {
        check('(R3-' + label + ') ★押すと街の (10,3) 酒場の前に戻る (クエリ無し)', false, '押せないので測れなかった');
      }
      await o.page.close();
    }

    /* ── 受入条件 11: compact でも遊べる (⚠ 母集団は画面の向きでも割れる) ───── */
    console.log('\n--- 受入条件 11. compact でも遊べる ---');
    for (const vp of [['compact390', 390, 844, true],
                      ['boundary720', 720, 900, false],
                      ['desktop1440', 1440, 900, false]]) {
      const label = vp[0], w = vp[1], h = vp[2], mobile = vp[3];
      const o = await openTown(browser, base, { w: w, h: h, mobile: mobile, plazaUnlocked: true });
      await waitTownReady(o.page);
      await sleep(300);
      const r = await o.page.evaluate(() => {
        const hero = document.getElementById('townHero').getBoundingClientRect();
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        const btns = Array.prototype.slice.call(document.querySelectorAll('#townHud button'));
        const signs = Array.prototype.slice.call(document.querySelectorAll('.townSign'));
        const clickable = (el) => {
          const b = el.getBoundingClientRect();
          if (b.width < 8 || b.height < 8) return false;
          if (b.right <= 0 || b.bottom <= 0 || b.left >= vw || b.top >= vh) return false;
          const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
          return !!hit && (hit === el || el.contains(hit));
        };
        return {
          compact: __town.compact(),
          heroIn: hero.left >= 0 && hero.top >= 0 && hero.right <= vw && hero.bottom <= vh,
          scrollW: document.documentElement.scrollWidth, clientW: vw,
          btnCount: btns.length, signCount: signs.length,
          reachable: (__town.compact() ? btns : signs).filter(clickable).length
        };
      });
      check('(11a-' + label + ') 主人公が画面内に居る', r.heroIn, JSON.stringify(r));
      check('(11b-' + label + ') 3 施設が押せる (compact=HUD ボタン / それ以外=看板)',
            r.reachable === 3, r.reachable + '/3 btn=' + r.btnCount + ' sign=' + r.signCount);
      check('(11c-' + label + ') 横スクロールバーが出ない',
            r.scrollW <= r.clientW, r.scrollW + ' vs ' + r.clientW);
      check('(11z-' + label + ') [装置] compact 判定が期待どおり (' + (w <= 560 ? 'true' : 'false') + ')',
            r.compact === (w <= 560), String(r.compact));
      await o.page.close();
    }

    /* ── 受入条件 12: 撤退で赤くなる ────────────────────────────────────────
     *  ⭐⭐⭐ 「?town=0 で緑」ではなく、**同じ measureTownState を両モードへ当てて**
     *    状態の conjunction が崩れることを見る。 */
    console.log('\n--- 受入条件 12. 撤退 ?town=0 で赤くなる ---');
    {
      const on  = await measureTownState(browser, base, '/town.html');
      const off = await measureTownState(browser, base, '/town.html?town=0');
      const conj = (s) => s.townAlive && s.reachAllZero && s.clickLands && s.spawnRule && s.noQuery && s.signCount === 3;
      check('(12a) 既定 (街 ON) では 6 つの状態がすべて成立する', conj(on), JSON.stringify(on));
      check('(12b) ★?town=0 では同じ 6 つの状態が崩れる (空振りしていない)', !conj(off), JSON.stringify(off));
      check('(12c) ★?town=0 は街が 1 枚も描かれない', off.townAlive === false && off.signCount === 0, JSON.stringify(off));
      const o = await openTown(browser, base, { url: '/town.html?town=0' });
      await sleep(1500);
      check('(12d) ★?town=0 の行き先が tavern.html',
            /\/tavern\.html$/.test(await o.page.evaluate(() => location.pathname)));
      await o.page.close();
    }
  } catch (e) {
    console.error('\n[drv] 例外: ' + e.message + '\n' + (e.stack || ''));
    results.push({ name: '例外なく完走', ok: false });
  }

  await browser.close();
  srv.close();

  const ok = results.filter(r => r.ok).length;
  console.log('\n════════════════════════════════════════════');
  console.log('  ' + ok + ' / ' + results.length + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
  const ng = results.filter(r => !r.ok);
  if (ng.length) { console.log('  NG:'); ng.forEach(r => console.log('    - ' + r.name)); }
  console.log('════════════════════════════════════════════');
  process.exit(ng.length ? 1 : 0);
})();
