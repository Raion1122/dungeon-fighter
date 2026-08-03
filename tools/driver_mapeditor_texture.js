#!/usr/bin/env node
/*
 * driver_mapeditor_texture.js — 「エディタが本編と同じ見た目で描く」ことの恒久回帰検出器
 * ═════════════════════════════════════════════════════════════════════════════
 * 対象: map-editor.html の本編テクスチャ表示 (2026-08-03) と
 *       js/df-mapdef.js のテクスチャカタログ (index.html の SCENARIO_TEX を実行時に読む)
 *
 * ■ なぜ要るのか
 *   ユーザー報告「床を塗ると、エディタ上は塗れているが、試遊したときにどう変わっているのか
 *   分からない」への対処。本編のカメラは 72×28 の地図を 14×8 タイルほどの覗き穴で見る
 *   (index.html:4257 = compact では約 4 タイル) うえパーティを追うので、塗った地形の全体は
 *   試遊では**原理的に確認できない**。→ エディタ側を本編と同じ絵にするのが確認手段。
 *
 * ■ この機能の生死を分ける一点
 *   ★**エディタと本編が違う絵を出したら、この機能は存在意義ごと無意味になる。**
 *   だからテクスチャ表は index.html から実行時に読む (写経しない)。§2 がその直接の検出器で、
 *   実装ファイルの中に本編のテクスチャ画像名が 1 つでも出てきたら赤くなる。
 *
 * ■ 何を測るか
 *   §0 装置   公開シームの実在 (assert が空振りしない前提)
 *   §1 カタログ ★SCENARIO_TEX を index.html から読めている / 全テーマに floor+wall /
 *              未登録テーマのフォールバックが本編 index.html:2976 と同じ式 / SPR_CEILING
 *   §2 非写経  ★★実装 2 ファイルに本編のテクスチャ画像名が 1 つも出てこない
 *   §3 描画    既定 ON でテクスチャ経路を通る / 単色より色数が桁違いに多い / OFF で単色へ戻る
 *   §4 テーマ  themeId を変えると読む画像も変わる (本編の選び方に追随する)
 *   §5 PNG     ★exportPNG がテクスチャを焼き込まない (ON でも OFF でも同一 PNG)
 *   §6 退化    画像が読めないときは**丸ごと単色へ退化**し、かつ**無言にしない**
 *   §E 実行中に pageerror / console.error / 404 が 1 件も出ていないこと
 *
 * ■ 変異負制御 (--mutate <kind>)
 *     kind         | 注入する欠陥                                   | 落ちるべき節
 *     -------------|------------------------------------------------|--------------
 *     notexdraw    | テクスチャ描画の呼び出しを殺す (単色のまま)    | §3
 *     nopngtexoff  | exportPNG の texPreview=false を殺す           | §5
 *     nohalfguard  | 片方の画像が欠けても ready にしてしまう        | §6
 *   ⚠ 置換対象が 0 件 / 2 件以上 なら exit 3 (空振りしたまま PASS を防ぐ)。
 *
 * ■ 使い方
 *     node tools/driver_mapeditor_texture.js [--headful] [--port N] [--browser <path>]
 *                                            [--mutate notexdraw|nopngtexoff|nohalfguard]
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
const PORT = parseInt(arg('port', '8965'), 10);
const MUTATE = arg('mutate', null);

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  notexdraw: [
    ['    state.drewTextured = texActive();     // ★検証シーム: どちらの経路を通ったかを残す',
     '    state.drewTextured = false;           // ★検証シーム: どちらの経路を通ったかを残す'],
  ],
  nopngtexoff: [
    ['      state.texPreview = false;\n      state.selection = null; state.slotSelection = null;',
     '      state.selection = null; state.slotSelection = null;'],
  ],
  nohalfguard: [
    ['      tex.ready = !!(tex.floorPattern && tex.ceilPattern);',
     '      tex.ready = true;'],
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
/* ⚠ favicon は Chrome が勝手に取りに行くもの。除外は **URL 単位**で行う
 *   (本文「404」で一括除外すると本物の 404 検出器まで死ぬ)。
 * ⚠ __missing_on_purpose__ は §6 (退化) がわざと 404 させるための URL。 */
const IGNORED_URL_RE = /\/favicon\.ico(\?|$)|__missing_on_purpose__/;

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
function mark(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length))); }
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '   [' + detail + ']' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
  return ok;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* テクスチャが実際に**画面へ出た**ことを色数で測る。単色表示は数色しかない。 */
const countColors = (page) => page.evaluate(() => {
  const E = window.__mapEditor, cv = E.canvas;
  const g = cv.getContext('2d');
  const w = Math.min(240, cv.width), h = Math.min(160, cv.height);
  const x = Math.max(0, Math.floor((cv.width - w) / 2));
  const y = Math.max(0, Math.floor((cv.height - h) / 2));
  const d = g.getImageData(x, y, w, h).data;
  const seen = Object.create(null); let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
    if (seen[k] === undefined) { seen[k] = 1; n++; }
  }
  return n;
});

async function bootPage(browser, url) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.setViewport({ width: 1366, height: 850 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__mapEditor, { timeout: 20000, polling: 50 });
  // テクスチャの到着待ち。届かなくても先へ進み、§3 が理由付きで落ちる。
  await page.waitForFunction(() => {
    const i = window.__mapEditor.texInfo();
    return i.ready || (i.status && !i.status.ok) || !!i.missing;
  }, { timeout: 8000, polling: 100 }).catch(() => {});
  await sleep(250);
  return { page, errs };
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = makeProfile('df_tex_');

  let srv = null, browser = null, rec = null;
  const allErrs = [];
  try {
    const a = await startServer(PORT, ROOT);
    srv = a.srv; rec = a.rec;
    const BASE = 'http://127.0.0.1:' + PORT;
    console.log('[drv] root=' + ROOT + '  ' + BASE);
    console.log('[drv] mutate=' + (MUTATE || 'なし'));

    browser = await puppeteer.launch({
      executablePath: browserPath, headless: HEADFUL ? false : 'new',
      userDataDir: profile, args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const b = await bootPage(browser, BASE + '/map-editor.html');
    allErrs.push(...b.errs);
    const page = b.page;

    // ══════════════════════════════════════════════════════════════════════
    mark('§0 装置の前提');
    {
      const keys = await page.evaluate(() => Object.keys(window.__mapEditor));
      for (const need of ['setTexPreview', 'texInfo', 'reloadTextures'])
        check('§0 0a シーム ' + need + ' がある', keys.indexOf(need) >= 0);
      const mk = await page.evaluate(() => Object.keys(window.DFMapDef).filter(k =>
        /^(loadTextureCatalog|texSetFor|getCeilingSprite|setTextureCatalog|getTextureCatalog)$/.test(k)));
      check('§0 0b DFMapDef にテクスチャ API が 5 本ある', mk.length === 5, mk.join(','));
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§1 テクスチャ表を index.html から実行時に読めている');
    const cat = await page.evaluate(() => {
      const M = window.DFMapDef;
      const c = M.getTextureCatalog();
      return { ok: !!c, keys: c ? Object.keys(c) : [], err: M.getTextureCatalogError(),
               ceiling: M.getCeilingSprite(), fallbackId: M.TEX_FALLBACK_ID,
               known: c ? M.texSetFor('goblin-mine') : null,
               unknown: c ? M.texSetFor('__no_such_theme__') : null };
    });
    check('§1 1a SCENARIO_TEX を取得できた', cat.ok, cat.ok ? cat.keys.length + ' テーマ' : ('error=' + cat.err));
    check('§1 1b テーマが 6 種以上ある (母集団が空でない)', cat.keys.length >= 6, cat.keys.join(','));
    const shape = await page.evaluate(() => {
      const c = window.DFMapDef.getTextureCatalog(); if (!c) return null;
      return Object.keys(c).every(k => typeof c[k].floor === 'string' && typeof c[k].wall === 'string');
    });
    check('§1 1c 全テーマが floor / wall を持つ', shape === true);
    check('§1 1d ★未登録テーマは "' + cat.fallbackId + '" へ落ちる (本編 index.html:2976 と同じ式)',
      !!cat.unknown && !!cat.known && cat.unknown.floor === cat.known.floor,
      JSON.stringify(cat.unknown));
    check('§1 1e SPR_CEILING [sx,sy,sw,sh] を読めた (壁セルの天井)',
      !!cat.ceiling && cat.ceiling.length === 4, JSON.stringify(cat.ceiling));

    // ══════════════════════════════════════════════════════════════════════
    mark('§2 ★★写経していない (実装ファイルに本編のテクスチャ画像名が出てこない)');
    /* ⚠ ここがこの機能の生命線。写経した瞬間に「エディタでは正しいのに本編では違う絵」が
     *   起こりうるようになり、機能の存在意義そのものが消える。 */
    {
      const names = [];
      for (const k of cat.keys) {
        const v = await page.evaluate((k) => window.DFMapDef.getTextureCatalog()[k], k);
        names.push(String(v.floor).split('?')[0], String(v.wall).split('?')[0]);
      }
      const uniq = Array.from(new Set(names));
      check('§2 2a 検査対象のファイル名が 6 個以上ある (母集団が空でない)', uniq.length >= 6,
        uniq.length + ' 個');
      for (const rel of ['map-editor.html', 'js/df-mapdef.js']) {
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const hit = uniq.filter(n => n && text.indexOf(n) >= 0);
        check('§2 2b ' + rel + ' に本編のテクスチャ画像名が 1 つも無い', hit.length === 0,
          hit.length ? '写経を検出: ' + hit.join(' / ') : uniq.length + ' 個すべて不在');
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§3 描画 — 既定 ON で本編テクスチャ、OFF で従来の単色');
    const infoOn = await page.evaluate(() => window.__mapEditor.texInfo());
    console.log('  [ref] texInfo=' + JSON.stringify({ on: infoOn.on, ready: infoOn.ready,
      themeId: infoOn.themeId, floorSrc: infoOn.floorSrc, floorScale: infoOn.floorScale,
      missing: infoOn.missing }));
    check('§3 3a 既定でテクスチャ表示が ON', infoOn.on === true);
    check('§3 3b テクスチャが揃っている (ready)', infoOn.ready === true,
      infoOn.missing ? '読めない画像: ' + infoOn.missing : 'ok');
    check('§3 3c 直近の render がテクスチャ経路を通った', infoOn.drewTextured === true);
    const colorsOn = await countColors(page);
    await page.evaluate(() => window.__mapEditor.setTexPreview(false));
    await sleep(200);
    const infoOff = await page.evaluate(() => window.__mapEditor.texInfo());
    const colorsOff = await countColors(page);
    check('§3 3d OFF にすると単色経路へ戻る', infoOff.drewTextured === false && infoOff.on === false);
    check('§3 3e ★テクスチャ表示の色数が単色表示より桁違いに多い (実際に絵が出ている)',
      colorsOn > colorsOff * 10 && colorsOn > 200, 'ON=' + colorsOn + '色 / OFF=' + colorsOff + '色');
    await page.evaluate(() => window.__mapEditor.setTexPreview(true));
    await sleep(200);
    check('§3 3f ON へ戻せる',
      (await page.evaluate(() => window.__mapEditor.texInfo())).drewTextured === true);

    // ══════════════════════════════════════════════════════════════════════
    mark('§4 テーマ追随 — themeId を変えると読む画像も変わる');
    {
      const themes = await page.evaluate(() => {
        const c = window.DFMapDef.getTextureCatalog();
        return Object.keys(c).filter(k => c[k].floor);
      });
      const other = themes.find(t => t !== infoOn.themeId);
      check('§4 4a 別テーマが 1 つ以上ある (母集団が空でない)', !!other, String(other));
      if (other) {
        await page.evaluate((t) => {
          const E = window.__mapEditor, d = E.getMapDef();
          d.themeId = t; E.setMapDef(d);
        }, other);
        await page.waitForFunction((t) => window.__mapEditor.texInfo().themeId === t,
          { timeout: 8000, polling: 100 }, other).catch(() => {});
        await sleep(250);
        const after = await page.evaluate(() => window.__mapEditor.texInfo());
        check('§4 4b テーマを変えると読む床画像が変わる', after.floorSrc !== infoOn.floorSrc,
          infoOn.floorSrc + ' → ' + after.floorSrc);
        check('§4 4c 変更後もテクスチャで描けている',
          after.ready === true && after.drewTextured === true,
          after.missing ? '読めない画像: ' + after.missing : 'ok');
        await page.evaluate((t) => { const E = window.__mapEditor, d = E.getMapDef(); d.themeId = t; E.setMapDef(d); },
          infoOn.themeId);
        await sleep(500);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§5 ★exportPNG がテクスチャを焼き込まない');
    /* ⚠ 画像は非同期に届くので、焼き込むと「読み込み前と後で PNG が変わる」= 再現性が消える。
     *   ON と OFF で PNG が完全一致することがその証明になる。 */
    {
      const r = await page.evaluate(() => {
        const E = window.__mapEditor;
        E.setTexPreview(true);
        const a = E.exportPNG();
        const onAfter = E.texInfo().on;                 // ★書き出し後に元へ戻っているか
        E.setTexPreview(false);
        const bb = E.exportPNG();
        E.setTexPreview(true);
        return { same: a === bb, len: a.length, onAfter, drewAfter: E.texInfo().drewTextured };
      });
      check('§5 5a テクスチャ ON/OFF で PNG が完全に同一 (焼き込まれていない)', r.same === true,
        'len=' + r.len);
      check('§5 5b 書き出し後に texPreview が元へ戻っている', r.onAfter === true);
      check('§5 5c 書き出し後の画面はテクスチャ表示に戻っている', r.drewAfter === true);
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§6 退化 — 画像が読めないときは丸ごと単色へ / かつ無言にしない');
    {
      const deg = await page.evaluate(async () => {
        const M = window.DFMapDef, E = window.__mapEditor;
        // ★存在しない床画像を差し込む (天井は本物のまま = 「片方だけ欠けた」状態)
        M.setTextureCatalog({ "goblin-mine": { floor: "__missing_on_purpose__.png", wall: "__x__.png" } },
                            M.getCeilingSprite());
        const d = E.getMapDef(); d.themeId = "goblin-mine"; E.setMapDef(d);
        E.reloadTextures();
        await new Promise(r => setTimeout(r, 1000));
        const i = E.texInfo();
        return { ready: i.ready, drew: i.drewTextured, missing: i.missing,
                 note: document.getElementById('texNote').textContent,
                 noteNg: document.getElementById('texNote').classList.contains('ng') };
      });
      check('§6 6a 片方でも読めなければ ready にしない (半端に混ぜない)', deg.ready === false,
        'ready=' + deg.ready + ' missing=' + deg.missing);
      check('§6 6b 単色経路へ丸ごと退化する', deg.drew === false);
      check('§6 6c ★無言にしない (#texNote に理由が出る)', !!deg.note && deg.noteNg === true,
        JSON.stringify(deg.note));
      const colorsDeg = await countColors(page);
      check('§6 6d 退化後の色数が単色レベルまで落ちている', colorsDeg <= Math.max(40, colorsOff * 3),
        '退化後=' + colorsDeg + '色 / 単色=' + colorsOff + '色');
    }

    // ══════════════════════════════════════════════════════════════════════
    mark('§E コンソール健全性');
    check('§E pageerror / console.error が 0 件', allErrs.length === 0,
      allErrs.length ? allErrs.slice(0, 4).join(' | ') : 'なし');
    check('§E 404 が 0 件 (favicon / §6 の意図的な欠損を除く)', rec.notFound.length === 0,
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
