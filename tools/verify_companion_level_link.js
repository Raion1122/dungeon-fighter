#!/usr/bin/env node
/*
 * verify_companion_level_link.js — [決定 2026-11-27] 仲間 Lv が主人公 Lv に ±2 で連動することの検証。
 *
 * 決定事項:
 *   - 仲間 Lv は主人公 Lv に **連動** (必須)・幅 = 主人公 Lv ±2・絶対下限 Lv1・絶対上限 Lv10。
 *   - ⇒ 仲間 Lv ∈ [max(1, hero-2), min(10, hero+2)] に必ず収まる。
 *
 * 何を測るか (本番の tavern.html の関数を **直叩き** して確かめる・数値は写経しない):
 *   1. clampCompanionLevel(raw, hero)      … 唯一の clamp 口。全 hero Lv × 幅広い raw で範囲検査。
 *   2. assignCompanionLevels(members,…)    … 出発時に m.level を焼く口。
 *        - 新顔 (level/mercId 無し) を全ティア帯 (quest Lv 1..10) で多数サンプル。
 *        - 名簿の低 Lv 古参 (mercId + level 1)  → h-2 まで **底上げ** されるか (= 今回の修正点)。
 *        - 名簿の高 Lv 古参 (mercId + level 10) → h+2 まで **頭打ち** されるか。
 *   3. levelOfMember(m)                     … 準備画面・引き出しが引く表示 Lv (inventory.xp 由来)。
 *
 * 使い方: node tools/verify_companion_level_link.js [--port 10973] [--headful]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
function arg(name, def) { const i = argv.indexOf('--' + name); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : def; }
const PORT = parseInt(arg('port', '10973'), 10);
const HEADFUL = argv.indexOf('--headful') >= 0;

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  if (process.env.PPTR_DIR) { try { return require(path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core')); } catch (e) {} }
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] ブラウザが見つかりません'); process.exit(2);
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
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  NG ' + name + (detail ? '\n       ' + detail : '')); }
}

(async () => {
  const puppeteer = loadPuppeteer();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] 仲間 Lv ±2 連動の検証 (port ' + PORT + ')');

  const profile = makeProfile('df_lvlink_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  let pageErrors = 0;
  page.on('pageerror', (e) => { pageErrors++; console.log('  [pageerror] ' + e.message); });
  await page.setViewport({ width: 1280, height: 860 });

  // 掃除した状態で素の酒場を開く (遷移しない = 関数直叩きだけ)。
  await page.evaluateOnNewDocument(() => {
    try {
      [localStorage, sessionStorage].forEach((s) => Object.keys(s).forEach((k) => {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      }));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  });
  await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof clampCompanionLevel==='function' && typeof assignCompanionLevels==='function' && typeof levelOfMember==='function' && typeof getLevelFromXP==='function'",
    { timeout: 30000 });
  await sleep(150);

  const SAMPLES = 40;
  const res = await page.evaluate((SAMPLES) => {
    const out = { rows: [], errs: [] };
    const RANGE = (h) => [Math.max(1, h - 2), Math.min(10, h + 2)];
    const XP = (typeof XP_THRESHOLDS !== 'undefined') ? XP_THRESHOLDS : null;
    for (let h = 1; h <= 10; h++) {
      const r0 = RANGE(h); const lo = r0[0], hi = r0[1];
      const row = { h: h, lo: lo, hi: hi, clamp: {}, vetLow: null, vetHigh: null, fresh: { min: 99, max: 0, bad: 0, n: 0 }, display: {} };
      try {
        // 1. clampCompanionLevel 直叩き — 代表 raw
        [1, 2, 5, 9, 10, 0, -3, NaN].forEach((raw) => { row.clamp[String(raw)] = clampCompanionLevel(raw, h); });
        // 2a. 名簿の低 Lv 古参 (mercId + level 1)  → 底上げ
        const vl = { classKey: 'warrior', name: 'vetLow', isHero: false, mercId: 1, level: 1 };
        assignCompanionLevels([vl], h, h); row.vetLow = vl.level;
        // 2b. 名簿の高 Lv 古参 (mercId + level 10) → 頭打ち
        const vh = { classKey: 'warrior', name: 'vetHigh', isHero: false, mercId: 2, level: 10 };
        assignCompanionLevels([vh], h, h); row.vetHigh = vh.level;
        // 2c. 新顔 (level 無し) を全ティア帯 (quest Lv 1..10) で多数サンプル
        for (let ql = 1; ql <= 10; ql++) {
          for (let s = 0; s < SAMPLES; s++) {
            const f = { classKey: 'warrior', name: 'fresh', isHero: false };
            assignCompanionLevels([f], ql, h);
            row.fresh.n++;
            if (f.level < row.fresh.min) row.fresh.min = f.level;
            if (f.level > row.fresh.max) row.fresh.max = f.level;
            if (f.level < lo || f.level > hi || f.level < 1 || f.level > 10) row.fresh.bad++;
          }
        }
        // 3. levelOfMember 表示 Lv (inventory.xp 由来)。xp を Lv h の閾値に合わせて確かめる。
        if (XP) {
          const savedXp = inventory.xp;
          inventory.xp = XP[h - 1];
          try {
            row.display.heroLv = getLevelFromXP(inventory.xp);
            row.display.vetLow = levelOfMember({ classKey: 'warrior', name: 'd', isHero: false, level: 1 });
            row.display.vetHigh = levelOfMember({ classKey: 'warrior', name: 'd', isHero: false, level: 10 });
            row.display.hero = levelOfMember({ classKey: 'warrior', name: 'd', isHero: true });
          } finally { inventory.xp = savedXp; }
        }
      } catch (e) { out.errs.push('h=' + h + ': ' + String((e && e.message) || e)); }
      out.rows.push(row);
    }
    return out;
  }, SAMPLES);

  await page.close();
  await browser.close();
  srv.close();

  console.log('\n--- 実測 (本番 tavern.html の関数を直叩き) ---');
  res.errs.forEach((e) => console.log('  [err] ' + e));

  // 全行の全ケースが範囲内か
  let allClampOk = true, allFreshOk = true, allVetOk = true, allDisplayOk = true;
  let fixDemonstrated = false, capDemonstrated = false;
  res.rows.forEach((r) => {
    const inRange = (v) => (typeof v === 'number' && v >= r.lo && v <= r.hi && v >= 1 && v <= 10);
    Object.keys(r.clamp).forEach((k) => { if (!inRange(r.clamp[k])) allClampOk = false; });
    if (!inRange(r.vetLow) || !inRange(r.vetHigh)) allVetOk = false;
    if (r.fresh.bad > 0 || !inRange(r.fresh.min) || !inRange(r.fresh.max)) allFreshOk = false;
    if (r.display.heroLv != null) {
      if (!inRange(r.display.vetLow) || !inRange(r.display.vetHigh)) allDisplayOk = false;
      if (r.display.hero !== r.h) allDisplayOk = false;   // 主人公は永続 Lv そのまま
    }
    // 低 Lv 古参が h-2 まで底上げされる (h>=4 で lo>1 のとき観測可能)
    if (r.lo > 1 && r.vetLow === r.lo) fixDemonstrated = true;
    // 高 Lv 古参が h+2 で頭打ち (h<=8 で hi<10 のとき観測可能)
    if (r.hi < 10 && r.vetHigh === r.hi) capDemonstrated = true;
    console.log('  hero Lv' + r.h + ' 範囲[' + r.lo + ',' + r.hi + ']: '
      + 'vetLow(生1)=' + r.vetLow + ' vetHigh(生10)=' + r.vetHigh
      + ' fresh=[' + r.fresh.min + ',' + r.fresh.max + '] bad=' + r.fresh.bad
      + ' display{vetLow=' + r.display.vetLow + ',vetHigh=' + r.display.vetHigh + ',hero=' + r.display.hero + '}');
  });

  // 代表例: hero Lv7 で生 Lv1 古参が 5 (=hero-2) になる (崩れた塔 検証4 の修正点)
  const lv7 = res.rows.find((r) => r.h === 7);
  console.log('\n--- 判定 ---');
  check('clampCompanionLevel: 全 hero Lv × 代表 raw が ±2 範囲 (下限1/上限10) に収まる', allClampOk);
  check('assignCompanionLevels 新顔: 全ティア帯 × ' + (SAMPLES * 10 * 10) + ' サンプルが ±2 範囲 (bad=0)', allFreshOk);
  check('assignCompanionLevels 名簿古参: 低Lv1 は底上げ・高Lv10 は頭打ち = ±2 範囲', allVetOk);
  check('levelOfMember 表示 Lv も同じ ±2 範囲 (主人公は永続 Lv 据置)', allDisplayOk);
  check('[修正点] 低 Lv 古参が hero-2 まで **底上げ** されるのを実際に観測 (旧: Lv1 のまま残った)', fixDemonstrated,
    '底上げの観測行なし');
  check('高 Lv 古参が hero+2 で **頭打ち** されるのを実際に観測', capDemonstrated, '頭打ちの観測行なし');
  check('代表: 主人公 Lv7 + 名簿 Lv1 古参 → Lv5 (hero-2) / 名簿 Lv10 古参 → Lv9 (hero+2)',
    !!lv7 && lv7.vetLow === 5 && lv7.vetHigh === 9,
    lv7 ? ('vetLow=' + lv7.vetLow + ' vetHigh=' + lv7.vetHigh) : 'Lv7 行なし');
  check('page エラー 0', pageErrors === 0, 'pageerror=' + pageErrors);

  console.log('\n[結果] ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('[drv] 例外: ' + (e && e.stack || e)); process.exit(3); });
