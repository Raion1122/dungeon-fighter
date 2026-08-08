#!/usr/bin/env node
/*
 * driver_graph_reentry.js — [P1 再入可能化] リーク検出ドライバ
 * ══════════════════════════════════════════════════════════════════════════════
 * 「ゲームブック風 分岐マップ」企画 P1 の完了条件を測る。P1 の主張は 2 つ:
 *
 *   ① 同じノードへ何度出入りしても **DOM / 配列 / タイマーが増えない**
 *      (単調増加 = リーク。2 ノード目以降でしか出ないので既存ドライバでは絶対に捕まらない)
 *   ② 再入場後の **mapData が初回と 1 bit も違わない** (幾何の再構築が冪等)
 *
 * ⭐ **負のコントロールを同一 run に内包**する。ポート P に素の index.html を、
 *    ポート P+1 に「撤去点を潰した変異版」を配り、同じ手順を両方に流す。
 *    素の側で「一定」、変異側で「単調増加」が両方出て初めて、この検出器が
 *    本当にリークを見ていることの証明になる (片側だけでは検出器が死んでいても PASS する)。
 *
 * 変異 (--mutate、既定 nodom):
 *   nodom    … nodeLayer.replaceChildren(enemyLayer) を殺す → 宝箱/罠/檻の DOM が積み上がる
 *   noenemy  … enemyLayer.replaceChildren() を殺す        → 敵スプライト等の DOM が積み上がる
 *   noarrays … clearNodeArrays() を殺す                    → enemies/roomChests 等の配列が伸びる
 *   notimers … clearNodeTimers() を殺す                    → 登録タイマーが残る
 *
 * ⚠ 変異は**ディスクを書き換えず配信をメモリ上で差し替える** (復元漏れが原理的に起きない)。
 * ⚠ 置換文字列は必ず 1 行。index.html は CRLF なので複数行は原理的に一致しない。
 *
 * 決定論のしかけ:
 *   ・宝箱の出現は乱数 (CHEST_SPAWN_CHANCE=0.5)。そのままだとサイクルごとに件数が揺れて
 *     「一定であること」を測れない → Math.random を LCG に差し替え、**各サイクルの直前に
 *     同じ種を蒔く**。これで「同じ入力 → 同じ盤面」になり、厳密な相等で測れる。
 *   ・mapData は乱数を一切使わないので、素の起動 (種を蒔く前) とも SHA-256 が一致すべき。
 *   ・ゲームは開始しない (?autoplay を付けない)。moveEnemies 等の tick は gameStarted で
 *     早期 return するので、盤面はサイクル間で動かない。
 *
 * 使い方:
 *   node tools/driver_graph_reentry.js
 *   node tools/driver_graph_reentry.js --mutate noarrays --port 8880
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8876'), 10);   // ⚠ 変異側は PORT+1 を掴む (並列時は 4 以上あける)
const CYCLES = Math.max(2, parseInt(arg('cycles', '5'), 10));
const SEED = parseInt(arg('seed', '12345'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  nodom: ['      nodeLayer.replaceChildren(enemyLayer);   // 宝箱 / 罠 / 檻 / 捕虜 / 祭壇グロウ',
          '      void 0;   /* ★変異nodom */'],
  noenemy: ['      enemyLayer.replaceChildren();            // 敵スプライト / HPバー / 吹き出し / 地面FX',
            '      void 0;   /* ★変異noenemy */'],
  noarrays: ['      clearNodeArrays();',
             '      void 0;   /* ★変異noarrays */'],
  notimers: ['      clearNodeTimers();',
             '      void 0;   /* ★変異notimers */'],
};
const MUTATE = arg('mutate', 'nodom');
if (!Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
  process.exit(3);
}
let _mutCache = null;
function mutatedSources() {
  if (_mutCache) return _mutCache;
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const [from, to] = MUTATIONS[MUTATE];
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
  _mutCache = out;
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
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutate) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutate && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]); return;
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

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/* サイクル間で「一定であるべき」計数フィールド。
 * ⚠ 母集団が空だと「全部 0 で一定」= 真空 PASS になるので、下の (G*) で 0 でないことを別に測る。 */
const COUNT_KEYS = ['nodeChildren', 'enemyChildren', 'vfxChildren', 'bodyChildren', 'timers',
  'enemies', 'enemyElements', 'roomChests', 'traps', 'cages', 'decorations',
  'roomPaintings', 'sceneryPlacements', 'domChest', 'domTrap', 'domCage', 'domCaptive',
  'bodyStrayChest', 'bodyStrayTrap'];

// ページ内で 1 サイクル分の統計を採る。__nodeReentry.stats() に DOM 側の実測を足す。
const SNAP = `(() => {
  const nl = document.getElementById('nodeLayer');
  const s = window.__nodeReentry ? window.__nodeReentry.stats() : {};
  s.domChest   = nl ? nl.querySelectorAll('.roomChest').length : -1;
  s.domTrap    = nl ? nl.querySelectorAll('.trap').length : -1;
  s.domCage    = nl ? nl.querySelectorAll('.roomCage').length : -1;
  s.domCaptive = nl ? nl.querySelectorAll('.sce1Captive').length : -1;
  s.bodyStrayChest = document.querySelectorAll('body > .roomChest').length;
  s.bodyStrayTrap  = document.querySelectorAll('body > .trap').length;
  return s;
})()`;

async function bootPage(browser, url, warns, errs) {
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'warn' || m.type() === 'warning') warns.push(t);
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine'); } catch (e) {}
    /* 決定論の種。⚠ evaluateOnNewDocument は全ナビゲーションで再実行されるので、
     *   ここには「毎回同じ形に整える」ものだけを置く (removeItem 等の破壊系は置かない)。 */
    let lcg = 1;
    window.__seedRand = (s) => { lcg = (s >>> 0) || 1; };
    Math.random = () => { lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0; return lcg / 4294967296; };
    // rAF は凍結しない: ?autoplay を付けないので startGame() が走らず盤面は動かない。
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof mapData !== 'undefined' && typeof buildNode === 'function' && typeof resetNodeState === 'function'",
    { timeout: 20000 });
  return page;
}

// 1 ページぶんの「起動 → N サイクル」を回して統計列を返す
async function runSeries(page, cycles, seed) {
  const series = [];
  const s0 = await page.evaluate(SNAP);
  s0.mapSha = sha256(s0.mapDataText); delete s0.mapDataText;
  series.push(s0);
  for (let i = 0; i < cycles; i++) {
    await page.evaluate((sd) => { window.__seedRand(sd); window.__nodeReentry.cycle(); }, seed);
    const s = await page.evaluate(SNAP);
    s.mapSha = sha256(s.mapDataText); delete s.mapDataText;
    series.push(s);
  }
  return series;
}

const fmt = (series, k) => series.map(s => s[k]).join(',');
const constantFrom1 = (series, k) => series.slice(1).every(s => s[k] === series[1][k]);
const monotonicUp = (series, k) => {
  for (let i = 2; i < series.length; i++) if (!(series[i][k] > series[i - 1][k])) return false;
  return true;
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srvPure = await startServer(PORT, false);
  const srvMut = await startServer(PORT + 1, true);
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   素        http://localhost:' + PORT);
  console.log('[drv]   変異(' + MUTATE + ')  http://localhost:' + (PORT + 1));

  const profile = require('./_pptr_profile')('df_graph_reentry_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  const warns = [], errs = [];
  /* renode=0 = シームだけ生やして 0 回。
   * ⚠⚠ **?graph=0 は 2026-08-08 (P5) に足した**。廃坑 (goblin-mine) が既定で分岐版になり、
   *   付けないと entry ノード (kind:"start" / 敵 0 / 罠 0 / 1枚絵なし) を測ってしまい、
   *   母集団ガード (G1)(G2)(G3) が「敵も罠も 0 個」で落ちる = **リーク検出器が真空になる**。
   *   P1 の主題は「従来の単一マップで同じノードへ入り直してもリークしない」ことなので、
   *   計画書どおり `?graph=0` を付けて**負のコントロールとして生かし続ける**のが正しい。
   *   ⚠ assert は 1 つも消していない (測る対象を元の主題へ固定し直しただけ)。 */
  const Q = '/index.html?diag=1&renode=0&graph=0';

  // ── §0 変異が本当に配信へ載っているか (空振り検出) ────────────────────────
  mark('変異の配信検算');
  {
    const get = (p) => new Promise((res, rej) => {
      http.get('http://localhost:' + p + '/index.html', r => {
        let b = ''; r.on('data', d => b += d); r.on('end', () => res(b));
      }).on('error', rej);
    });
    const a = await get(PORT), b = await get(PORT + 1);
    const [from, to] = MUTATIONS[MUTATE];
    check('(0a) 素の配信に変異前の文字列が 1 箇所ある', a.split(from).length - 1 === 1,
      '件数=' + (a.split(from).length - 1));
    check('(0b) 素の配信に変異後の文字列が 0 箇所', a.indexOf(to) < 0, '');
    check('(0c) 変異の配信に変異前の文字列が 0 箇所', b.indexOf(from) < 0, '');
    check('(0d) 変異の配信に変異後の文字列が 1 箇所', b.split(to).length - 1 === 1,
      '件数=' + (b.split(to).length - 1));
    check('(0e) 2 つの配信のバイト長が違う (同じ物を 2 回測っていない)', a.length !== b.length,
      '素=' + a.length + 'B / 変異=' + b.length + 'B');
  }

  // ── §1 素の側: 起動 → N サイクル ─────────────────────────────────────────
  mark('素の側で ' + CYCLES + ' 回 再入場');
  const pagePure = await bootPage(browser, 'http://localhost:' + PORT + Q, warns, errs);
  const P = await runSeries(pagePure, CYCLES, SEED);
  console.log('[drv]   素の計数列 (起動直後, サイクル1..' + CYCLES + '):');
  for (const k of COUNT_KEYS) console.log('           ' + k.padEnd(18) + ' ' + fmt(P, k));

  // ── §G 母集団ガード (真空 PASS 対策) ──────────────────────────────────────
  mark('母集団ガード');
  check('(G1) 起動直後に敵が 1 体以上いて DOM も同数の配列に載っている',
    P[0].enemies > 0 && P[0].enemyElements === P[0].enemies,
    'enemies=' + P[0].enemies + ' enemyElements=' + P[0].enemyElements);
  check('(G2) 起動直後に罠が 1 個以上ある (罠の DOM も同数)',
    P[0].traps > 0 && P[0].domTrap === P[0].traps,
    'traps=' + P[0].traps + ' domTrap=' + P[0].domTrap);
  check('(G3) 起動直後に 1 枚絵と情景と装飾がすべて 1 件以上ある',
    P[0].roomPaintings > 0 && P[0].sceneryPlacements > 0 && P[0].decorations > 0,
    'paintings=' + P[0].roomPaintings + ' scenery=' + P[0].sceneryPlacements +
    ' decorations=' + P[0].decorations);
  check('(G4) #enemyLayer に敵まわりの DOM が数十個ある (層が実際に使われている)',
    P[0].enemyChildren >= P[0].enemies * 8,
    'enemyChildren=' + P[0].enemyChildren + ' (敵 1 体につき 10 要素)');
  check('(G5) #nodeLayer の第 1 子が #enemyLayer (撤去時に残す前提が成立している)',
    await pagePure.evaluate(() => document.getElementById('nodeLayer').firstElementChild.id === 'enemyLayer'),
    '');
  check('(G6) 検証シームは dev ゲートの内側にある (?renode があるので生えている)',
    await pagePure.evaluate(() => typeof window.__nodeReentry === 'object'), '');

  // ── §2 集約: ノード寿命 DOM が body 直下へ逃げていない ────────────────────
  mark('DOM 集約');
  check('(2a) 宝箱の DOM は全部 #nodeLayer の中 (body 直下に 0 個)',
    P.every(s => s.bodyStrayChest === 0), 'body直下の宝箱: ' + fmt(P, 'bodyStrayChest'));
  check('(2b) 罠の DOM は全部 #nodeLayer の中 (body 直下に 0 個)',
    P.every(s => s.bodyStrayTrap === 0), 'body直下の罠: ' + fmt(P, 'bodyStrayTrap'));
  check('(2c) 宝箱は DOM と配列が常に同数 (取りこぼしも二重生成も無い)',
    P.every(s => s.domChest === s.roomChests), 'dom=' + fmt(P, 'domChest') + ' / arr=' + fmt(P, 'roomChests'));
  check('(2d) 罠は DOM と配列が常に同数', P.every(s => s.domTrap === s.traps),
    'dom=' + fmt(P, 'domTrap') + ' / arr=' + fmt(P, 'traps'));
  check('(2e) 檻は DOM と配列が常に同数', P.every(s => s.domCage === s.cages),
    'dom=' + fmt(P, 'domCage') + ' / arr=' + fmt(P, 'cages'));
  check('(2f) 敵は DOM 配列と実体配列が常に同数',
    P.every(s => s.enemyElements === s.enemies),
    'el=' + fmt(P, 'enemyElements') + ' / en=' + fmt(P, 'enemies'));
  check('(2g) #vfxLayer が存在する (起動シーケンスで body へ挿さっている)',
    P.every(s => s.vfxChildren >= 0), 'vfxChildren=' + fmt(P, 'vfxChildren'));

  // ── §3 リークゼロ: サイクル 1..N で全計数が一定 ───────────────────────────
  mark('リークゼロ (計数が一定)');
  for (const k of COUNT_KEYS) {
    check('(3) ' + k + ' がサイクル間で一定', constantFrom1(P, k), fmt(P, k));
  }
  check('(3z) body の子要素数が起動直後から増えない (層の外へも漏れていない)',
    P.every(s => s.bodyChildren === P[0].bodyChildren), fmt(P, 'bodyChildren'));

  // ── §4 mapData の冪等性 ──────────────────────────────────────────────────
  mark('mapData の冪等性');
  check('(4a) 再入場後の mapData が初回と SHA-256 で一致',
    P.every(s => s.mapSha === P[0].mapSha),
    P.map(s => s.mapSha.slice(0, 10)).join(' / '));
  check('(4b) その SHA が空でも定数でもない (実体のある 72x28 を測っている)',
    await pagePure.evaluate(() => mapData.length === 28 && mapData[0].length === 72 &&
      mapData.some(r => r.some(v => v === 0)) && mapData.some(r => r.some(v => v === 2))),
    'sha=' + P[0].mapSha.slice(0, 16));

  // ── §5 タイマーの撤去 (陽性対照つき) ─────────────────────────────────────
  mark('ノード寿命タイマーの撤去');
  {
    const t = await pagePure.evaluate(() => {
      window.__timerFired = 0;
      // ノード寿命タイマーを 3 本仕掛ける (発火は十分先 = 自然には落ちない)
      nodeTimeout(() => { window.__timerFired++; }, 600000);
      nodeTimeout(() => { window.__timerFired++; }, 600000);
      nodeInterval(() => { window.__timerFired++; }, 600000);
      const before = window.__nodeReentry.stats().timers;
      window.__seedRand(1); window.__nodeReentry.cycle();
      return { before, after: window.__nodeReentry.stats().timers, fired: window.__timerFired };
    });
    check('(5a) 陽性対照: nodeTimeout/nodeInterval で 3 本が登録簿に載る', t.before === 3, 'before=' + t.before);
    check('(5b) resetNodeState で登録簿が 0 になる', t.after === 0, 'after=' + t.after);
    check('(5c) 仕掛けたコールバックは 1 度も発火していない (clear が本物)', t.fired === 0, 'fired=' + t.fired);
  }

  // ── §6 dev ゲート (silent fail-open を作らない) ──────────────────────────
  mark('dev ゲート');
  {
    const gwarns = [], gerrs = [];
    const gate = await browser.newPage();
    gate.on('pageerror', e => gerrs.push(e.message));
    /* ⚠ この puppeteer-core は console.warn を **type()==='warn'** で通知する ('warning' ではない)。
     *   'warning' だけを見ていると「警告が出ていない」と誤判定する (実際に 1 度踏んだ)。両方拾う。 */
    gate.on('console', m => { if (m.type() === 'warn' || m.type() === 'warning') gwarns.push(m.text()); });
    await gate.evaluateOnNewDocument(() => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine'); } catch (e) {}
      try { localStorage.removeItem('df.devMode'); } catch (e) {}
    });
    /* ⚠ ?diag / ?autoplay / ?autodebug を一切付けない = 素のプレイヤーと同じ条件
     * ⚠ ?graph=0 は上の Q と同じ理由 (P5 で廃坑が既定で分岐版になったため)。
     *   (6d)「ゲートで止めても盤面は正常に立ち上がる」は敵が湧く盤面でしか意味を持たない。 */
    await gate.goto('http://localhost:' + PORT + '/index.html?renode=5&graph=0',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await gate.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 20000 });
    const g = await gate.evaluate(() => ({
      seam: typeof window.__nodeReentry,
      cycles: typeof window.__renodeCycles,
      chests: roomChests.length, enemies: enemies.length,
      domChest: document.getElementById('nodeLayer').querySelectorAll('.roomChest').length,
    }));
    check('(6a) dev モードでない素の起動では検証シームが生えない', g.seam === 'undefined', 'typeof=' + g.seam);
    check('(6b) 同上: 再入場は 1 度も走らない', g.cycles === 'undefined', 'typeof=' + g.cycles);
    check('(6c) 無視したことを console.warn で必ず知らせる (silent fail-open にしない)',
      gwarns.some(w => w.indexOf('?renode') >= 0),
      gwarns.filter(w => w.indexOf('renode') >= 0).join(' | ') || '<warn なし>');
    check('(6d) ゲートで止めても盤面は正常に立ち上がる', g.enemies > 0 && g.domChest === g.chests,
      'enemies=' + g.enemies + ' chests=' + g.chests + ' domChest=' + g.domChest);
    check('(6e) ゲート経路で pageerror 0', gerrs.length === 0, gerrs.slice(0, 3).join(' | '));
    await gate.close();
  }

  // ── §7 負のコントロール (同一 run に内包) ────────────────────────────────
  mark('負のコントロール --mutate ' + MUTATE);
  const mwarns = [], merrs = [];
  const pageMut = await bootPage(browser, 'http://localhost:' + (PORT + 1) + Q, mwarns, merrs);
  if (MUTATE === 'notimers') {
    // notimers は「登録簿が残る」だけなので、母集団 0 のままだと空振りする → 先に仕掛ける
    await pageMut.evaluate(() => { nodeTimeout(() => {}, 600000); nodeTimeout(() => {}, 600000); });
  }
  const M = await runSeries(pageMut, CYCLES, SEED);
  console.log('[drv]   変異側の計数列:');
  for (const k of COUNT_KEYS) console.log('           ' + k.padEnd(18) + ' ' + fmt(M, k));
  /* ⚠ 「単調増加」で測れるのは DOM と配列だけ。タイマーは 1 サイクルで新規登録が発生しない
   *   (戦闘していないので nodeTimeout を踏まない) ので、**増える**のではなく**残る**のが欠陥の姿。
   *   → 変異ごとに「欠陥の形」を分けて書く。単一の物差しを使い回すと空振りする。 */
  const LEAK_KEYS = {
    nodom:    ['domChest', 'domTrap', 'nodeChildren'],
    noenemy:  ['enemyChildren'],
    // ⚠ enemies はここに入らない。spawnNodeEnemies() 自身が冒頭で length=0 する
    //   **二重の安全網**があるため、clearNodeArrays を殺しても伸びない (下の (7c) で明示)。
    noarrays: ['roomChests', 'traps', 'enemyElements'],
    notimers: [],
  }[MUTATE];
  for (const k of LEAK_KEYS) {
    check('(7) 変異側では ' + k + ' が単調増加する (= この検出器はリークを本当に見ている)',
      monotonicUp(M, k), fmt(M, k));
    check('(7b) 素の側の同じ指標は一定 (外科的な差である証明): ' + k,
      constantFrom1(P, k), fmt(P, k));
  }
  if (MUTATE === 'noarrays') {
    check('(7c) enemies だけは変異側でも増えない — spawnNodeEnemies() 自身の length=0 が二重の安全網',
      constantFrom1(M, 'enemies') && M[M.length - 1].enemies === P[0].enemies, fmt(M, 'enemies'));
  }
  if (MUTATE === 'notimers') {
    // 事前に 2 本仕掛けてある (bootPage 直後)。欠陥の姿は「増える」ではなく「消えずに残る」。
    check('(7) 変異側では登録タイマーが resetNodeState を跨いで残り続ける',
      M.every(s => s.timers >= 2), fmt(M, 'timers'));
    check('(7b) 素の側は同じ手順で必ず 0 になる (§5 の 5b と同じ性質を系列でも確認)',
      P.every(s => s.timers === 0), fmt(P, 'timers'));
  }
  check('(7d) 変異側でも mapData の SHA は素の側と同じ (壊したのは撤去点だけ = 外科的)',
    M[0].mapSha === P[0].mapSha, M[0].mapSha.slice(0, 12) + ' vs ' + P[0].mapSha.slice(0, 12));

  // ── §8 エラーゼロ ────────────────────────────────────────────────────────
  mark('エラーゼロ');
  check('(8a) 素の側: 起動〜' + CYCLES + ' 回再入場で pageerror / console.error が 0',
    errs.length === 0, errs.slice(0, 5).join(' | '));
  check('(8b) 変異側も JS エラーは出ない (壊したのは撤去点だけで例外は起きない)',
    merrs.length === 0, merrs.slice(0, 5).join(' | '));

  await browser.close();
  srvPure.close(); srvMut.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n[drv] ' + pass + '/' + results.length + ' PASS   (--mutate ' + MUTATE +
    ' / cycles=' + CYCLES + ')');
  if (pass !== results.length) {
    console.log('[drv] FAILED:');
    for (const r of results) if (!r.ok) console.log('   - ' + r.name + (r.detail ? '  — ' + r.detail : ''));
    process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(2); });
