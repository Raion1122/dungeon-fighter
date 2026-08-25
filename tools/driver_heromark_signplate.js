#!/usr/bin/env node
/*
 * driver_heromark_signplate.js — 依頼書 #15 の受入条件を機械的に測る
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-23_heromark-and-town-signplates.md` の §6。
 *
 * ■ 何を測るか
 *   (Z1)(Z2)(Z3) 装置    … 母集団を先に確かめる。⭐⭐ 特に (Z2)「主人公が後衛の編成を
 *                          **実際に作れた**」を確かめずに (A3) を測ると、永久に
 *                          「頭だけ」を測って緑になる。
 *   (A1)〜(A7)  ▽ マーカー … 街の追従 / ダンジョンの追従先 / 頭昇格後の生存 / 消える条件
 *   (B1)〜(B7)  羊皮紙の札 … name+desc / 絵文字ゼロ / 押せる / 帯に潜らない / 文字高 / 重なり
 *   (C2)(C3)(C5) 撤退・例外 … ?heromark=0 / ?signplate=0
 *
 * ■ ここで測らないもの (別コマンドで回す)
 *   (C1) node tools/verify_town_map.js          → 85/85 のまま
 *   (C4) node tools/driver_graph_p6.js (244) / driver_grid_p8.js (56) / driver_doors_p8.js
 *
 * ■ ⭐⭐⭐ 空振りを防ぐ仕掛け
 *   - **負のコントロールを道具に内蔵する**。`--negative` は 4 つの変異を順に回し、
 *     「その変異で赤くなるはずの assert」が実際に FAIL しなければ **exit 1**。
 *   - 幾何は本番の値 (__town.heroMarkGeom / __heroMark.geom) と **実描画の矩形**を
 *     突き合わせる。CSS と JS に同じ数値を写経したズレを装置 assert が殺す。
 *   - ▽ は CSS アニメで上下に揺れる。1 フレームの読みでは (A5) が間欠フレークするので
 *     **1 周期ぶんサンプリングして最悪値**を採る。⭐ 相対量 (ラベル上端 − ▽ 下端) で
 *     見るので、サンプリング中にパーティが動いても壊れない。
 *   - 撤退は「?…=0 で緑」ではなく **同じ conjunction を両モードへ当てて崩れる**ことを見る。
 *   - ⭐ 配信するバイトは起動時に 1 回だけ読んで**凍結**する (別窓が本体を保存しても
 *     走行中に混合ビルドにならない)。
 *
 * ■ 使い方
 *     node tools/driver_heromark_signplate.js
 *     node tools/driver_heromark_signplate.js --negative           (4 変異の自己検査)
 *     node tools/driver_heromark_signplate.js --mutate markhead    (変異を手回し)
 *     node tools/driver_heromark_signplate.js --only town|dungeon --headful --port 9451
 * exit 0=全 PASS / 1=FAIL あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

/* ⚠ path.resolve 必須。'/' 区切りのままだと startsWith が必ず false で全 404 になり、
   症状はタイムアウトだけになる。 */
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const HEADFUL = argv.includes('--headful');
const NEGATIVE = argv.includes('--negative');
const PORT = parseInt(arg('port', '9451'), 10);
const MUTATE = arg('mutate', null);
const ONLY = arg('only', null);              // town / dungeon

/* ══ 負のコントロール ═══════════════════════════════════════════════════════
 *  ⚠ 置換前後で**長さを変える**こと。同じ長さだと「当たったのに何も変わらない」を
 *    検出できない。⚠ 置換文字列は 1 行に閉じる (CRLF/LF 混在で複数行は必ず空振りする)。 */
const MUT_TARGETS = ['town.html', 'index.html', 'js/town-map.js'];
const MUTATIONS = {
  /* ▽ の追従先を**常に頭**へ固定する → (A3) が赤くなる。
     ⭐ 「heroRef を null にする」ではダメ。それだと ▽ が消えるだけで、
       「頭に付いてしまう」という本チケットの真のリスクを測っていない。 */
  markhead: [
    ['index.html',
     '      if (heroIsHead) {',
     '      if (true) {   /* \u2605\u5909\u7570markhead: \u5e38\u306b\u982d\u3078\u4ed8\u3051\u308b */'],
  ],
  /* ▽ を頭上から体へ落とす → 街は (A1)、ダンジョンは (A5) が赤くなる。
     ⚠ 街とダンジョンは**別の定数**を持つので両方を落とす (片方だけだと片肺で緑)。 */
  marklow: [
    ['index.html',
     '    const HERO_MARK_DY = -50;',
     '    const HERO_MARK_DY = 40;    /* \u2605\u5909\u7570marklow */'],
    ['town.html',
     '    var HEAD_TOP = 32, HM_GAP = 8, HM_W = 9, HM_H = 13;',
     '    var HEAD_TOP = 32, HM_GAP = -74, HM_W = 9, HM_H = 13;  /* \u2605\u5909\u7570marklow */'],
  ],
  // 札から説明行を出さない → (B1) が赤くなる
  plateflat: [
    ['town.html',
     '          if (f.desc) {',
     '          if (false) {   /* \u2605\u5909\u7570plateflat */'],
  ],
  // 札を #townTitle の下へ潜らせる → (B4) が赤くなる
  /* \u26a0\u26a0 \u6700\u521d\u306f CSS \u306e `transform: translate(-50%, -50%);` \u3092\u30a2\u30f3\u30ab\u30fc\u306b\u3057\u305f\u304c\u3001(Z3) \u304c
       **index.html \u306b\u3082\u540c\u3058\u884c\u304c\u3042\u308b**\u3068\u5831\u305b\u3066\u6b62\u3081\u305f\u3002\u914d\u4fe1\u306f\u30d5\u30a1\u30a4\u30eb\u5225\u306a\u306e\u3067\u5b9f\u5bb3\u306f
       \u7121\u304b\u3063\u305f\u304c\u3001\u30a2\u30f3\u30ab\u30fc\u306f\u300c\u3069\u306e\u30d5\u30a1\u30a4\u30eb\u306e\u8a71\u304b\u66d6\u6627\u3067\u306a\u3044\u884c\u300d\u3092\u9078\u3076\u3002
       \u7f6e\u304d\u5834\u6240\u305d\u306e\u3082\u306e\u3092\u4e0a\u3078\u305a\u3089\u3059\u65b9\u304c\u300c\u6f5c\u308b\u300d\u3068\u3044\u3046\u6b20\u9665\u306b\u8fd1\u3044\u3002 */
  platehide: [
    ['town.html',
     '        s.style.top  = p.y + "px";',
     '        s.style.top  = (p.y - 96) + "px";   /* \u2605\u5909\u7570platehide */'],
  ],
};
const MUT_ORDER = ['markhead', 'marklow', 'plateflat', 'platehide'];
/* その変異で **赤くなるべき** assert の接頭辞。⭐ ここが「負のコントロールが空振りしていない」
   ことの唯一の判定基準になる (--negative がこれを見る)。 */
const MUT_EXPECT = {
  markhead:  ['(A3'],
  marklow:   ['(A1', '(A5'],
  plateflat: ['(B1'],
  platehide: ['(B4'],
};
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}

/* ⭐ 配信バイトの凍結。起動時に 1 回だけ読む。別窓が本体を保存しても走行中に混ざらない。 */
const FROZEN = {};
for (const rel of MUT_TARGETS) FROZEN[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ══ (Z3) 変異アンカーの検算 ═══════════════════════════════════════════════
 *  ⛔ --mutate の有無に関わらず**毎回**回す。0 件ヒットの変異を放置すると、
 *    負のコントロールが静かに空振りして「全部緑」になる。 */
function auditMutations() {
  let bad = 0;
  for (const key of MUT_ORDER) {
    for (const pair of MUTATIONS[key]) {
      const rel = pair[0], from = pair[1], to = pair[2];
      if (from.indexOf('\n') >= 0) { console.error('[drv] ⛔ ' + key + ': 置換文字列が複数行'); bad++; continue; }
      if (from.length === to.length) { console.error('[drv] ⛔ ' + key + ': 置換前後が同じ長さ'); bad++; continue; }
      const n = FROZEN[rel].split(from).length - 1;
      // 他ファイルにも同じ行が無いこと (ファイルを取り違えた変異は別物を測る)
      const elsewhere = MUT_TARGETS.filter(r => r !== rel && FROZEN[r].indexOf(from) >= 0);
      if (n !== 1 || elsewhere.length) {
        console.error('[drv] ⛔ 変異 ' + key + ' のアンカーが ' + rel + ' に ' + n + ' 箇所'
          + (elsewhere.length ? ' / 他ファイルにも: ' + elsewhere.join(',') : '')
          + ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 70)));
        bad++;
      }
    }
  }
  return bad === 0;
}
function mutatedSource(rel) {
  let s = FROZEN[rel];
  if (!MUTATE) return s;
  for (const pair of MUTATIONS[MUTATE]) if (pair[0] === rel) s = s.split(pair[1]).join(pair[2]);
  return s;
}

// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/town.html';
        const rel = u.replace(/^\/+/, '');
        if (MUT_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSource(rel)); return;
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
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (detail !== undefined ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function rectsOverlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return (w > 0 && h > 0) ? Math.round(w * h) : 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// 街 (town.html)
// ══════════════════════════════════════════════════════════════════════════════
async function openTown(browser, base, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;   // ⚠ 除外は favicon の 1 本だけ (404 を一括で握り潰さない)
    errs.push('console: ' + m.text());
  });
  await page.setViewport({ width: opts.w || 1440, height: opts.h || 900,
                           isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      if (sessionStorage.getItem('__drvSeeded')) return;
      sessionStorage.setItem('__drvSeeded', '1');
      [localStorage, sessionStorage].forEach(function (st) {
        const kill = [];
        for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
        kill.forEach(k => st.removeItem(k));
      });
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
      localStorage.setItem('dragonfighters.plazaState',
        JSON.stringify({ unlocked: true, everEntered: true, gatekeeperEventSeen: true }));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  });
  await page.goto(base + (opts.url || '/town.html'), { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction("window.__town && typeof window.__town.heroMarkGeom === 'function'", { timeout: 15000 });
  } catch (e) { return { page: page, errs: errs, ready: false }; }
  await sleep(400);
  return { page: page, errs: errs, ready: true };
}

/* 街の 1 フレーム分の観測。⚠ ワールド px へ戻すのは **同じ stage rect と同じ zoom** から
   (別式で書き直すと実装とドライバが同じ間違いを共有して両方緑になる)。 */
const TOWN_SNAP = () => {
  const z = __town.zoom();
  const st = document.getElementById('townStage').getBoundingClientRect();
  const toW = (sx, sy) => ({ x: (sx - st.left) / z, y: (sy - st.top) / z });
  const mk = document.getElementById('townHeroMark');
  const mr = mk ? mk.getBoundingClientRect() : null;
  const g = __town.heroMarkGeom();
  const hp = __town.heroPx();
  const title = document.getElementById('townTitle').getBoundingClientRect();
  const clickable = (el) => {
    const b = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    if (b.width < 8 || b.height < 8) return false;
    if (b.right <= 0 || b.bottom <= 0 || b.left >= vw || b.top >= vh) return false;
    const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    return !!hit && (hit === el || el.contains(hit));
  };
  const signs = Array.prototype.slice.call(document.querySelectorAll('.townSign')).map(s => {
    const b = s.getBoundingClientRect();
    const nm = s.querySelector('.townSignName'), ds = s.querySelector('.townSignDesc');
    return { id: s.id, key: s.getAttribute('data-facility'),
             left: b.left, top: b.top, right: b.right, bottom: b.bottom,
             w: b.width, h: b.height,
             name: nm ? nm.textContent : null,
             desc: ds ? ds.textContent : null,
             descFs: ds ? parseFloat(getComputedStyle(ds).fontSize) : null,
             text: s.textContent, clickable: clickable(s) };
  });
  return {
    zoom: z, markOn: __town.heroMarkOn(), plateOn: __town.signPlateOn(),
    markExists: !!mk,
    mark: mr ? { left: mr.left, top: mr.top, right: mr.right, bottom: mr.bottom, w: mr.width, h: mr.height } : null,
    markWTop: mr ? toW(mr.left, mr.top).y : null,
    markWBottom: mr ? toW(mr.left, mr.bottom).y : null,
    markWCx: mr ? toW(mr.left + mr.width / 2, 0).x : null,
    geom: g, heroPx: hp,
    headTopW: hp.y - g.sprite * g.foot + g.headTop,
    titleBottom: title.bottom,
    hudClickable: Array.prototype.slice.call(document.querySelectorAll('#townHud button')).filter(clickable).length,
    hudCount: document.querySelectorAll('#townHud button').length,
    facilities: window.TOWN_MAP.FACILITIES.map(f => ({ key: f.key, name: f.name, desc: f.desc || null, icon: f.icon })),
    signs: signs,
  };
};

/* ▽ は CSS アニメで上下に揺れる。⭐ 1 周期 (1.2s) を跨いでサンプルし、最悪値で判定する。 */
async function sampleTown(page, ms, n) {
  const out = [];
  for (let i = 0; i < (n || 14); i++) {
    out.push(await page.evaluate(TOWN_SNAP));
    await sleep(Math.round((ms || 1400) / (n || 14)));
  }
  return out;
}

async function runTown(browser, base) {
  console.log('\n══════ §1 街 town.html ══════');
  const o = await openTown(browser, base, { w: 1440, h: 900 });
  check('(Z1a) [装置] town.html が起動し検証シームが載っている', o.ready);
  if (!o.ready) { await o.page.close(); return; }

  const snaps = await sampleTown(o.page, 1500, 15);
  const s0 = snaps[0];

  // 装置: CSS の --hm-w/--hm-h と JS の HM_W/HM_H が一致している (写経ズレの検出)
  const drawnW = s0.mark ? s0.mark.w / s0.zoom : -1;
  const drawnH = s0.mark ? s0.mark.h / s0.zoom : -1;
  check('(Z1b) [装置] ▽ の実描画が JS の幾何と一致 (CSS と JS の写経ズレが無い)',
        s0.markExists && Math.abs(drawnW - s0.geom.w * 2) < 1.5 && Math.abs(drawnH - s0.geom.h) < 1.5,
        'drawn=' + drawnW.toFixed(1) + 'x' + drawnH.toFixed(1) + ' geom=' + (s0.geom.w * 2) + 'x' + s0.geom.h);
  // 装置: 4 施設ぶんの desc がデータ側に実在する (0 件なら (B1) は空振りする)
  const descOk = s0.facilities.filter(f => typeof f.desc === 'string' && f.desc.length > 0).length;
  check('(Z1c) [装置] FACILITIES の 4 施設すべてに desc がある',
        descOk === 4 && s0.facilities.length === 4, descOk + '/' + s0.facilities.length);

  // (A1) ▽ が頭の天辺より上、かつ頭から 32px 以内
  const bots = snaps.filter(s => s.markWBottom !== null).map(s => s.markWBottom);
  const worstBottom = bots.length ? Math.max.apply(null, bots) : NaN;
  const bestBottom = bots.length ? Math.min.apply(null, bots) : NaN;
  check('(A1a) 街: ▽ が主人公の頭の天辺より上にある (揺れの最下点でも)',
        s0.markExists && worstBottom <= s0.headTopW + 0.5,
        'markBottom(worst)=' + worstBottom.toFixed(1) + ' headTop=' + s0.headTopW.toFixed(1));
  check('(A1b) 街: ▽ が頭から 32px 以内 (浮きすぎていない)',
        s0.markExists && (s0.headTopW - bestBottom) <= 32,
        'gap(max)=' + (s0.headTopW - bestBottom).toFixed(1) + 'px');

  // (A2) 3 マス歩いても同じ相対位置に居る
  const before = Math.min.apply(null, snaps.map(s => s.markWTop - s.heroPx.y));
  const beforeX = s0.markWCx - s0.heroPx.x;
  const moved = await o.page.evaluate(() => {
    const t = __town.heroTile();
    return __town.walkTo(t.c + 3, t.r);      // 東へ 3 マス (鹿亭前 (10,3) → (13,3) は石畳)
  });
  check('(Z1d) [装置] 主人公が 3 マス歩ける行き先を押せた', moved === true, String(moved));
  for (let i = 0; i < 60; i++) {
    if (!(await o.page.evaluate(() => __town.isMoving()))) break;
    await sleep(120);
  }
  await sleep(200);
  const snaps2 = await sampleTown(o.page, 1500, 15);
  const after = Math.min.apply(null, snaps2.map(s => s.markWTop - s.heroPx.y));
  const afterX = snaps2[0].markWCx - snaps2[0].heroPx.x;
  const tileMoved = await o.page.evaluate(() => __town.heroTile());
  check('(Z1e) [装置] 実際に歩いて位置が変わった',
        Math.abs(snaps2[0].heroPx.x - s0.heroPx.x) > 100,
        'dx=' + (snaps2[0].heroPx.x - s0.heroPx.x).toFixed(0) + ' tile=' + JSON.stringify(tileMoved));
  check('(A2) 街: 歩いたあとも ▽ が同じ相対位置に居る (±2px)',
        Math.abs(after - before) <= 2 && Math.abs(afterX - beforeX) <= 2,
        'dy=' + (after - before).toFixed(2) + ' dx=' + (afterX - beforeX).toFixed(2));

  // ── 羊皮紙の札 ──
  const st = snaps2[0];
  const byKey = {};
  st.signs.forEach(s => { byKey[s.key] = s; });
  const facs = st.facilities;
  let b1 = facs.length === 4 && st.signs.length === 4;
  const b1detail = [];
  facs.forEach(f => {
    const s = byKey[f.key];
    const ok = !!s && s.name === f.name && s.desc === f.desc;
    if (!ok) b1 = false;
    b1detail.push(f.key + ':' + (s ? JSON.stringify([s.name, s.desc]) : 'なし'));
  });
  check('(B1) 4 施設の札に name と desc の両方が出ている (FACILITIES と一致)', b1, b1detail.join(' '));

  const EMOJI = /\p{Extended_Pictographic}/u;
  const emojiSigns = st.signs.filter(s => EMOJI.test(s.text || ''));
  check('(B2) 札に絵文字が 1 文字も含まれていない', emojiSigns.length === 0,
        emojiSigns.map(s => s.id + '=' + JSON.stringify(s.text)).join(' ') || '0 件');

  check('(B3) 札の中心の elementFromPoint が自分自身か子孫 (= 押せる)',
        st.signs.length === 4 && st.signs.every(s => s.clickable),
        st.signs.filter(s => s.clickable).length + '/4');

  check('(B4) desktop 1440x900: 札の上端がタイトル帯の下端より下 (帯に潜っていない)',
        st.signs.length === 4 && st.signs.every(s => s.top > st.titleBottom),
        'titleBottom=' + st.titleBottom.toFixed(0) + ' tops=' + st.signs.map(s => s.top.toFixed(0)).join(','));

  const effFs = st.signs.map(s => (s.descFs || 0) * st.zoom);
  check('(B5) desktop 1440x900: 説明文の実効文字高が 10px 以上',
        effFs.length === 4 && effFs.every(v => v >= 10),
        'zoom=' + st.zoom.toFixed(4) + ' eff=' + effFs.map(v => v.toFixed(2)).join(','));

  let overlap = 0;
  for (let i = 0; i < st.signs.length; i++)
    for (let j = i + 1; j < st.signs.length; j++) overlap += rectsOverlap(st.signs[i], st.signs[j]);
  check('(B6) 4 枚の札が互いに重なっていない', overlap === 0, '交差面積=' + overlap + 'px²');

  check('(C5a) 街で pageerror / console error が 0 件', o.errs.length === 0, JSON.stringify(o.errs.slice(0, 3)));
  await o.page.close();

  // (B7) compact 390x844 で HUD ボタンが 4 つとも押せる
  {
    const c = await openTown(browser, base, { w: 390, h: 844, mobile: true });
    if (!c.ready) { check('(B7) compact 390x844 の #townHud ボタンが 4 つとも押せる', false, '起動できず'); }
    else {
      const cs = await c.page.evaluate(TOWN_SNAP);
      const isCompact = await c.page.evaluate(() => __town.compact());
      check('(Z1f) [装置] compact 判定になっている', isCompact === true, String(isCompact));
      check('(B7a) compact 390x844 の #townHud ボタンが 4 つとも押せる',
            cs.hudCount === 4 && cs.hudClickable === 4, cs.hudClickable + '/' + cs.hudCount);
      const hudEmoji = await c.page.evaluate(() =>
        Array.prototype.slice.call(document.querySelectorAll('#townHud button'))
          .every(b => /\p{Extended_Pictographic}/u.test(b.textContent)));
      check('(B7b) compact の HUD ボタンは絵文字付きのまま (依頼書 §8)', hudEmoji === true);
    }
    await c.page.close();
  }

  /* ── (C2)(C3) 撤退 ─────────────────────────────────────────────────────
   *  ⭐⭐⭐ 「?…=0 で緑」ではなく、**同じ conjunction を両モードへ当てて崩れる**ことを見る。 */
  const conjOf = (s) => ({
    markExists: !!s.markExists,
    markAboveHead: !!(s.markWBottom !== null && s.markWBottom <= s.headTopW + 0.5),
    plateHasDesc: s.signs.length === 4 && s.signs.every(x => typeof x.desc === 'string' && x.desc.length > 0),
    plateNoEmoji: s.signs.length === 4 && s.signs.every(x => !EMOJI.test(x.text || '')),
    plateClickable: s.signs.length === 4 && s.signs.every(x => x.clickable),
    signCount: s.signs.length,
  });
  const allTrue = (c) => c.markExists && c.markAboveHead && c.plateHasDesc && c.plateNoEmoji
                      && c.plateClickable && c.signCount === 4;
  const onC = conjOf(st);
  check('(C3a) 既定 (両方 ON) で 6 つの状態がすべて成立する', allTrue(onC), JSON.stringify(onC));
  {
    const m0 = await openTown(browser, base, { url: '/town.html?heromark=0' });
    const ms = m0.ready ? await m0.page.evaluate(TOWN_SNAP) : null;
    const c1 = ms ? conjOf(ms) : null;
    check('(C2a) ?heromark=0 で ▽ が DOM に無い',
          !!ms && ms.markExists === false && ms.markOn === false, JSON.stringify(c1));
    check('(C3b) ★?heromark=0 で同じ conjunction が崩れる (空振りしていない)', !!c1 && !allTrue(c1));
    check('(C3c) ?heromark=0 でも札は無事 (スイッチが互いを汚さない)',
          !!c1 && c1.plateHasDesc && c1.plateClickable && c1.signCount === 4);
    await m0.page.close();
  }
  {
    const p0 = await openTown(browser, base, { url: '/town.html?signplate=0' });
    const ps = p0.ready ? await p0.page.evaluate(TOWN_SNAP) : null;
    const c2 = ps ? conjOf(ps) : null;
    const circles = ps ? ps.signs.filter(s => Math.abs(s.w / ps.zoom - 64) < 1.5 && EMOJI.test(s.text || '')).length : -1;
    check('(C2b) ?signplate=0 で看板が今日と同じ丸アイコン (64px + 絵文字) に戻る',
          circles === 4, circles + '/4');
    check('(C3d) ★?signplate=0 で同じ conjunction が崩れる (空振りしていない)', !!c2 && !allTrue(c2));
    check('(C3e) ?signplate=0 でも ▽ は無事 (スイッチが互いを汚さない)',
          !!c2 && c2.markExists && c2.markAboveHead);
    await p0.page.close();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ダンジョン (index.html)
// ══════════════════════════════════════════════════════════════════════════════
/* 主人公を**後衛 (僧侶)** に置いた編成。⭐⭐ これを作れたことを (Z2b) が先に確かめる。
   ⚠ 検証は index.html の `pm.every(m => m && m.classKey && PARTY_ZONES[m.classKey])`。 */
const REAR_PARTY = [
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ロルフ', level: 1, variant: 0 },
  { classKey: 'cleric',  isHero: true,  zone: 'mid' },
];

async function openDungeon(browser, base, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument((party) => {
    try {
      [localStorage, sessionStorage].forEach(function (st) {
        const kill = [];
        for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
        kill.forEach(k => st.removeItem(k));
      });
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.removeItem('dragonfighters.generatedScenario');
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(party));
      sessionStorage.setItem('dragonfighters.partyComposition', JSON.stringify(party.map(m => m.classKey)));
      localStorage.setItem('dragonfighters.xp', '45000');
    } catch (e) {}
  }, REAR_PARTY);
  await page.goto(base + '/index.html?diag=1&intel=0' + (opts.qs ? '&' + opts.qs : ''),
                  { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction("typeof startGame === 'function' && window.__heroMark", { timeout: 25000 });
  } catch (e) { return { page: page, errs: errs, ready: false }; }
  await page.evaluate(() => { try { startGame(); } catch (e) {} });
  await sleep(1200);
  return { page: page, errs: errs, ready: true };
}

/* ダンジョンの 1 フレーム分の観測。⚠ 位置は **DOM の矩形**で採る
   (SX/SY を写経すると実装と同じ間違いを共有して両方緑になる)。 */
const DUN_SNAP = () => {
  const mk = document.getElementById('heroMark');
  const mr = mk ? mk.getBoundingClientRect() : null;
  const shown = !!mk && getComputedStyle(mk).display !== 'none';
  const pl = document.getElementById('player').getBoundingClientRect();
  const wl = document.getElementById('warriorLabel');
  const wlr = (wl && getComputedStyle(wl).display !== 'none') ? wl.getBoundingClientRect() : null;
  const h = heroIsHead ? null : (heroRef || allies.find(a => a && a.isHero) || null);
  const hr = (h && h.el) ? h.el.getBoundingClientRect() : null;
  const hlr = (h && h.nameLabelEl && getComputedStyle(h.nameLabelEl).display !== 'none')
    ? h.nameLabelEl.getBoundingClientRect() : null;
  return {
    exists: !!mk, shown: shown,
    mark: mr ? { left: mr.left, top: mr.top, right: mr.right, bottom: mr.bottom, w: mr.width, h: mr.height } : null,
    markCx: mr ? mr.left + mr.width / 2 : null,
    headCx: pl.left + pl.width / 2, headTop: pl.top,
    allyCx: hr ? hr.left + hr.width / 2 : null,
    labelTop: hlr ? hlr.top : (wlr ? wlr.top : null),
    labelWhich: hlr ? 'ally' : (wlr ? 'head' : null),
    heroIsHead: !!heroIsHead, allyCount: allies.length,
    gameOver: !!gameOver, errs: window.__heroMarkErr || 0,
    geom: window.__heroMark.geom(),
    target: (function () { const t = window.__heroMark.target(); return t ? { isHead: t.isHead, size: t.size } : null; })(),
  };
};

async function sampleDun(page, ms, n) {
  const out = [];
  for (let i = 0; i < (n || 14); i++) {
    out.push(await page.evaluate(DUN_SNAP));
    await sleep(Math.round((ms || 1400) / (n || 14)));
  }
  return out;
}

async function runDungeon(browser, base) {
  console.log('\n══════ §2 ダンジョン index.html ══════');
  const o = await openDungeon(browser, base, {});
  check('(Z2a) [装置] index.html が起動し検証シームが載っている', o.ready);
  if (!o.ready) { await o.page.close(); return; }

  const boot = await o.page.evaluate(DUN_SNAP);
  /* ⭐⭐ 母集団ガード。ここが false のまま (A3) を測ると、永久に「頭だけ」を測って緑になる。 */
  check('(Z2b) [装置] ★主人公が後衛の編成を実際に作れた (heroIsHead === false)',
        boot.heroIsHead === false && boot.allyCount >= 1,
        'heroIsHead=' + boot.heroIsHead + ' allies=' + boot.allyCount);
  if (boot.heroIsHead !== false) { await o.page.close(); return; }   // 装置不成立 → 以降は測れない

  check('(Z2c) [装置] ▽ の実描画が JS の幾何と一致 (CSS と JS の写経ズレが無い)',
        boot.exists && !!boot.mark && Math.abs(boot.mark.w - boot.geom.halfW * 2) < 1.5,
        'drawn=' + (boot.mark ? boot.mark.w : '-') + ' geom=' + (boot.geom.halfW * 2));

  /* ── (A3) 頭ではなく「主人公 ally」に付く ────────────────────────────────
   *  ⚠ 頭と主人公 ally が同じ x に居ると、markhead 変異でも緑になってしまう。
   *    測る前に**必ず横へ引き離し**、引き離せたことを装置 assert で押さえる。 */
  const A3_TOL = 2;          // (A3a) 一致とみなす幅
  const A3_APART = 20;       // (A3b) 「頭とは一致しない」の下限
  const a3 = await o.page.evaluate(() => {
    const h = heroRef || allies.find(a => a && a.isHero);
    /* ⚠⚠ **ワールド px と画面 px を取り違えない。** 廃坑は卓上グリッドで引いて描くので
       camZ ≈ 0.35 (実測)。ワールド 240px 離しても画面では 83px しか離れない。
       ここは 480 = 5 タイルぶん離す (描画だけを測るので壁でも構わない)。 */
    h.x = playerX + 480; h.y = playerY;
    renderWorld();
    const el = document.getElementById('heroMark');
    const mk = el.getBoundingClientRect();
    const pl = document.getElementById('player').getBoundingClientRect();
    const al = h.el.getBoundingClientRect();
    return { markCx: mk.left + mk.width / 2, headCx: pl.left + pl.width / 2,
             allyCx: al.left + al.width / 2, shown: getComputedStyle(el).display };
  });
  /* ⭐ 装置の閾値は (A3b) の下限から導く (2 つが別々に漂わないように)。
     引き離しが (A3b) の下限より狭いと、markhead 変異でも「一致しない」が成立して
     **偽の緑**になる。余裕を 2 倍取る。 */
  check('(Z2d) [装置] 頭と主人公 ally を横に引き離せた (≥ ' + (A3_APART * 2) + 'px)',
        Math.abs(a3.allyCx - a3.headCx) >= A3_APART * 2,
        'Δ=' + Math.abs(a3.allyCx - a3.headCx).toFixed(0) + 'px');
  check('(A3a) ダンジョン: ▽ の中心 x が主人公 ally の中心 x と一致する (±' + A3_TOL + 'px)',
        a3.shown !== 'none' && Math.abs(a3.markCx - a3.allyCx) <= A3_TOL,
        'mark=' + a3.markCx.toFixed(1) + ' ally=' + a3.allyCx.toFixed(1));
  check('(A3b) ダンジョン: ▽ の中心 x が頭の中心 x とは一致しない',
        Math.abs(a3.markCx - a3.headCx) > A3_APART,
        'mark=' + a3.markCx.toFixed(1) + ' head=' + a3.headCx.toFixed(1));

  /* ── (A5a) 名前ラベルと重ならない (揺れの最下点でも) ───────────────────── */
  {
    const ss = (await sampleDun(o.page, 1400, 14))
      .filter(s => s.shown && s.mark && s.labelTop !== null);
    const gaps = ss.map(s => s.labelTop - s.mark.bottom);
    check('(Z2e) [装置] 揺れ 1 周期ぶんのサンプルが 8 点以上採れた', ss.length >= 8, ss.length + '/14');
    check('(A5a) ダンジョン (主人公=ally): ▽ の下端が名前ラベルの上端より上',
          ss.length >= 8 && Math.min.apply(null, gaps) > 0,
          'gap(min)=' + (gaps.length ? Math.min.apply(null, gaps).toFixed(1) : '-') + 'px which='
          + (ss[0] ? ss[0].labelWhich : '-'));
  }

  /* ── (A4) NPC 頭が死んで主人公が頭へ昇格したあとも ▽ が生きている ────────
   *  ⚠⚠ ここが本チケットの核心。ally に ▽ を持たせていると DOM ごと消える。 */
  const a4 = await o.page.evaluate(() => {
    const before = !!document.getElementById('heroMark');
    const ok = tryPromoteNewHead('drv');
    renderWorld();
    const mk = document.getElementById('heroMark');
    const mr = mk ? mk.getBoundingClientRect() : null;
    const pl = document.getElementById('player').getBoundingClientRect();
    return { before: before, promoted: !!ok, heroIsHead: !!heroIsHead,
             exists: !!mk, shown: mk ? getComputedStyle(mk).display : null,
             markCx: mr ? mr.left + mr.width / 2 : null, headCx: pl.left + pl.width / 2,
             errs: window.__heroMarkErr || 0 };
  });
  check('(Z2f) [装置] 頭の委譲が実際に起きた (主人公が頭へ昇格)',
        a4.before && a4.promoted && a4.heroIsHead === true, JSON.stringify(a4));
  check('(A4a) ★頭昇格のあとも ▽ が DOM に居て表示されている',
        a4.exists && a4.shown === 'block', 'exists=' + a4.exists + ' display=' + a4.shown);
  check('(A4b) 頭昇格のあと ▽ が新しい頭 (= 主人公) に付いている (±2px)',
        a4.markCx !== null && Math.abs(a4.markCx - a4.headCx) <= 2,
        'mark=' + (a4.markCx === null ? '-' : a4.markCx.toFixed(1)) + ' head=' + a4.headCx.toFixed(1));

  /* ── (A5b) 昇格後も名前ラベルと重ならない ───────────────────────────────── */
  {
    const ss = (await sampleDun(o.page, 1400, 14))
      .filter(s => s.shown && s.mark && s.labelTop !== null);
    const gaps = ss.map(s => s.labelTop - s.mark.bottom);
    check('(A5b) ダンジョン (主人公=頭): ▽ の下端が名前ラベルの上端より上',
          ss.length >= 8 && Math.min.apply(null, gaps) > 0,
          'gap(min)=' + (gaps.length ? Math.min.apply(null, gaps).toFixed(1) : '-') + 'px n=' + ss.length);
  }

  /* ── (A6) 主人公が死ぬ / gameOver で消える ─────────────────────────────── */
  const a6 = await o.page.evaluate(() => {
    const mk = document.getElementById('heroMark');
    const keepHp = hp, keepGo = gameOver;
    hp = 0; renderWorld();
    const onDeath = getComputedStyle(mk).display;
    hp = keepHp; gameOver = true; renderWorld();
    const onGo = getComputedStyle(mk).display;
    gameOver = keepGo; renderWorld();
    const restored = getComputedStyle(mk).display;
    return { onDeath: onDeath, onGo: onGo, restored: restored, errs: window.__heroMarkErr || 0 };
  });
  check('(A6a) 主人公が死ぬと ▽ が消える', a6.onDeath === 'none', 'display=' + a6.onDeath);
  check('(A6b) gameOver で ▽ が消える', a6.onGo === 'none', 'display=' + a6.onGo);
  check('(Z2g) [装置] 元に戻すと ▽ が復帰する (測定が片道でない)',
        a6.restored === 'block', 'display=' + a6.restored);

  check('(A7) window.__heroMarkErr が 0 (try-catch が一度も発火していない)',
        a6.errs === 0, String(a6.errs));
  check('(C5b) ダンジョンで pageerror が 0 件', o.errs.length === 0, JSON.stringify(o.errs.slice(0, 3)));
  await o.page.close();

  /* ── (C2)(C3) 撤退 ───────────────────────────────────────────────────── */
  const conjOf = (s) => ({ exists: !!s.exists, shown: !!s.shown,
                           onHero: !!(s.markCx !== null && s.target) });
  const allTrue = (c) => c.exists && c.shown && c.onHero;
  {
    const d = await openDungeon(browser, base, { qs: 'heromark=0' });
    const ds = d.ready ? await d.page.evaluate(DUN_SNAP) : null;
    check('(C2c) ?heromark=0 で ▽ が DOM に無い',
          !!ds && ds.exists === false, ds ? JSON.stringify(conjOf(ds)) : 'ページが起動せず');
    check('(C3f) ★?heromark=0 で同じ conjunction が崩れる (空振りしていない)',
          !!ds && !allTrue(conjOf(ds)));
    check('(C5c) ?heromark=0 のダンジョンで pageerror が 0 件', d.errs.length === 0,
          JSON.stringify(d.errs.slice(0, 3)));
    if (d.page) await d.page.close();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// --negative : 4 変異を自分で回し、赤くならなければ exit 1
// ══════════════════════════════════════════════════════════════════════════════
function runNegative() {
  console.log('══════ 負のコントロール (--negative) ══════');
  console.log('  ⭐ 「その変異で赤くなるはずの assert」が実際に FAIL するかを見る。');
  let bad = 0;
  MUT_ORDER.forEach((key, i) => {
    const port = PORT + 1 + i;
    let out = '';
    try {
      out = execFileSync(process.execPath, [__filename, '--mutate', key, '--port', String(port)],
                         { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: ROOT });
    } catch (e) {
      out = (e.stdout || '') + (e.stderr || '');   // FAIL があると exit 1 で来る = 正常
    }
    const want = MUT_EXPECT[key];
    const lines = out.split(/\r?\n/);
    const missing = want.filter(pfx => !lines.some(l => l.indexOf('FAIL ' + pfx) >= 0));
    const ok = missing.length === 0;
    if (!ok) bad++;
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' 変異 ' + key + ' で ' + want.join(' / ')
      + ' が赤くなる' + (ok ? '' : '  — 赤くならなかった: ' + missing.join(' ')));
    if (!ok) {
      const tail = lines.filter(l => /PASS|FAIL/.test(l)).slice(-40).join('\n');
      console.log('    ---- 変異 ' + key + ' の出力 (末尾) ----\n' + tail);
    }
  });
  console.log('════════════════════════════════════════════');
  console.log(bad === 0 ? '  負のコントロール ' + MUT_ORDER.length + ' 本すべて赤くなった'
                        : '  ⛔ ' + bad + ' 本が空振り = 検出器が壊れている');
  console.log('════════════════════════════════════════════');
  process.exit(bad === 0 ? 0 : 1);
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  if (!auditMutations()) {
    console.error('[drv] ⛔ (Z3) 変異アンカーの検算に失敗 → 測定不能');
    process.exit(3);
  }
  console.log('  PASS (Z3) [装置] 変異アンカー ' + MUT_ORDER.length + ' 種がそれぞれ 1 ファイル 1 箇所にヒットする');
  results.push({ name: '(Z3) [装置] 変異アンカーが 1 箇所にヒット', ok: true });

  if (NEGATIVE) return runNegative();

  const pptr = loadPuppeteer();
  const exe = findBrowser();
  const srv = await startServer(PORT);
  const base = 'http://localhost:' + PORT;
  console.log('[drv] ' + base + '  browser=' + path.basename(exe)
    + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
  const browser = await pptr.launch({ executablePath: exe, headless: HEADFUL ? false : 'new',
                                      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    if (ONLY !== 'dungeon') await runTown(browser, base);
    if (ONLY !== 'town') await runDungeon(browser, base);
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
