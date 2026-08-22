#!/usr/bin/env node
/*
 * probe_rest_premature.js — 「手前の敵を倒しただけで休憩フェーズに入る」件の調査プローブ
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ これは**調査の道具**であって検出器ではない (受入条件を持たない)。
 *
 * 測るもの: setPhase("rest") が走った**その瞬間**に
 *   ① そのエンカウントは何ラウンドで終わったか (encounterRound)
 *   ② 交戦していた敵は何体だったか / 何体倒したか
 *   ③ **未参戦のまま生きている敵**が近くに何体いるか
 *       - detectReinforcements() … 本番の増援判定そのもの (engagePx + 160px, LOS, 視界)
 *       - 素の距離テーブル …「なぜ増援に入らなかったか」を理由別に見るため
 *   ④ 休憩明けに再戦闘が始まるまで何秒かかったか (= 休憩演出が無駄挟みだったか)
 *
 * ⚠ 判定ロジックは**再実装しない**。detectReinforcements / getRange / hasLineOfSight /
 *   isEnemyVisibleToParty は本番の関数をそのまま呼ぶ。生の値だけを出す。
 *
 * 使い方:
 *   node tools/probe_rest_premature.js                       # 廃坑を 1 周
 *   node tools/probe_rest_premature.js --scen bandits-forest --runs 2
 *   node tools/probe_rest_premature.js --speed 15 --max 400
 * オプション: --scen --speed --runs --max --port --qs --headful --browser
 * exit 0=観測できた / 1=休憩が 1 度も起きなかった / 2=環境不足
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');   /* ⚠ path.resolve 必須 (でないと全 404) */
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i + 1] : dflt;
}
const HEADFUL = process.argv.includes('--headful');
const PORT  = parseInt(arg('port', '9412'), 10);
const SCEN  = arg('scen', 'goblin-mine');
const SPEED = parseInt(arg('speed', '15'), 10);
const RUNS  = parseInt(arg('runs', '1'), 10);
const MAXS  = parseInt(arg('max', '420'), 10);
const QS    = arg('qs', '');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) {}
  console.error('[prb] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[prb] Chrome が見つかりません'); process.exit(2);
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ★ ページ内 50ms 監視。setPhase("rest") が走った**瞬間**を掴む。
 *   ⚠ 1 秒サンプルの 1 点読みでは「休憩に入った瞬間の周囲」を取り逃す
 *     (休憩は数秒で明けるうえ、その間にパーティが動く)。 */
const WATCH = () => {
  window.__rp = { events: [], lastPhase: null };
  window.__rpTimer = setInterval(() => {
    try {
      const ph = (typeof currentPhase !== 'undefined') ? currentPhase : null;
      const prev = window.__rp.lastPhase;
      window.__rp.lastPhase = ph;
      if (ph === 'rest' && prev !== 'rest') {
        const pCX = playerX + 48, pCY = playerY + 58;
        const parts = encounterEnemyIndices.slice();
        /* ⚠ 本番の増援判定そのものを呼ぶ。encounterEnemyIndices は runEncounter の
         *   finally (= setPhase("rest") よりずっと後) で空にされるので、この時点では
         *   まだ「今の戦闘の参加者」が入っている = 除外集合として正しい。 */
        const reinf = detectReinforcements();
        const survey = [];
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (!e || !e.alive || e.inactive) continue;
          if (e.def && e.def.isObjective) continue;
          const ex = e.x + e.def.displaySize / 2, ey = e.y + e.def.displaySize / 2;
          const d = Math.hypot(pCX - ex, pCY - ey);
          if (d > 96 * 14) continue;
          const R = getRange((e.def && e.def.range) || 'melee');
          survey.push({ i: i, name: e.def.name, d: Math.round(d),
                        tiles: Math.round(d / 96 * 10) / 10, engagePx: R.engagePx,
                        los: !!hasLineOfSight(pCX, pCY, ex, ey),
                        vis: !!isEnemyVisibleToParty(e),
                        part: parts.indexOf(i) >= 0 });
        }
        survey.sort((a, b) => a.d - b.d);
        let node = null;
        try { node = window.__graphRun ? window.__graphRun.nodeId() : null; } catch (e) {}
        window.__rp.events.push({
          t: Math.round(performance.now()), node: node,
          round: (typeof encounterRound !== 'undefined') ? encounterRound : null,
          participants: parts.length, reinfCount: reinf.length,
          reinf: reinf.map(i => enemies[i].def.name),
          survey: survey.slice(0, 8), nextEncAfterMs: null,
        });
      }
      const ev = window.__rp.events[window.__rp.events.length - 1];
      if (ev && ev.nextEncAfterMs === null && ph === 'combat' && prev !== 'combat') {
        ev.nextEncAfterMs = Math.round(performance.now()) - ev.t;
      }
    } catch (e) {}
  }, 50);
};

const TICK = () => {
  let node = null;
  try { node = window.__graphRun ? window.__graphRun.nodeId() : null; } catch (e) {}
  return { n: window.__rp ? window.__rp.events.length : 0, node: node,
           over: (typeof gameOver !== 'undefined' && gameOver) ||
                 (typeof dungeonCleared !== 'undefined' && dungeonCleared) };
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_restprem_');
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  let url = 'http://localhost:' + PORT + '/index.html?autoplay=' + SPEED + '&diag=1';
  if (QS) url += '&' + QS.replace(/^[?&]+/, '');
  console.log('[probe] ' + url + '   scen=' + SCEN + '  runs=' + RUNS + '  上限=' + MAXS + '秒');

  const all = [];
  for (let run = 1; run <= RUNS; run++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await page.evaluateOnNewDocument((sid) => {
      try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
      try { localStorage.setItem('dragonfighters.xp', '10000'); } catch (e) {}
    }, SCEN);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof currentPhase !== 'undefined' && typeof detectReinforcements === 'function' && typeof enemies !== 'undefined'",
      { timeout: 25000 });
    await page.evaluate(WATCH);
    console.log('\n[probe] === run ' + run + '/' + RUNS + ' (' + SCEN + ') ===');

    const t0 = Date.now();
    let lastN = 0, lastNode = null;
    while ((Date.now() - t0) / 1000 < MAXS) {
      await sleep(1000);   /* ⭐ 1 秒間隔。短い evaluate はゲームを実測で遅くする */
      let k = null;
      try { k = await page.evaluate(TICK); } catch (e) { break; }
      if (!k) continue;
      if (k.node !== lastNode) {
        console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's] node=' + k.node);
        lastNode = k.node;
      }
      if (k.n !== lastN) { lastN = k.n; }
      if (k.over) { console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's] ラン終了'); break; }
    }
    let evs = [];
    try { evs = await page.evaluate(() => window.__rp.events); } catch (e) {}
    all.push({ run: run, evs: evs, errs: errs });
    await page.close();
  }
  await browser.close(); srv.close();

  let total = 0, bad = 0;
  for (const r of all) {
    console.log('\n══════ run ' + r.run + ': 休憩 ' + r.evs.length + ' 回 ══════');
    for (let n = 0; n < r.evs.length; n++) {
      const e = r.evs[n];
      total++;
      const others = e.survey.filter(s => !s.part);
      const near = others.filter(s => s.d < s.engagePx);
      if (others.length) bad++;
      console.log('\n  [休憩 #' + (n + 1) + '] node=' + e.node + '  終了ラウンド=' + e.round +
                  '  交戦していた敵=' + e.participants + ' 体');
      console.log('    本番 detectReinforcements() が返した数 = ' + e.reinfCount +
                  (e.reinf.length ? ' (' + e.reinf.join('、') + ')' : ''));
      console.log('    休憩明けに再戦闘まで = ' +
                  (e.nextEncAfterMs == null ? '(観測窓内に無し)' : (e.nextEncAfterMs / 1000).toFixed(1) + ' 秒'));
      if (!others.length) { console.log('    → 周囲 14 タイルに未参戦の生存敵は 0 体 (正常な決着)'); continue; }
      console.log('    ⚠ 未参戦のまま生きている敵 ' + others.length + ' 体' +
                  (near.length ? ' (うち ' + near.length + ' 体は engagePx の内側 = 目の前)' : ''));
      console.log('      名前              距離px  タイル  engagePx  視線  視界');
      for (const s of others) {
        console.log('      ' + String(s.name).padEnd(16) + String(s.d).padStart(6) +
                    String(s.tiles).padStart(8) + String(s.engagePx).padStart(10) +
                    '  ' + (s.los ? ' o ' : ' x ') + '  ' + (s.vis ? ' o ' : ' x ') +
                    (s.d < s.engagePx ? '   ← 交戦距離の内側' : ''));
      }
    }
    if (r.errs.length) console.log('\n  ⚠ page errors: ' + JSON.stringify(r.errs.slice(0, 3)));
  }
  console.log('\n[probe] 休憩 ' + total + ' 回中、周囲に未参戦の生存敵がいたのは ' + bad + ' 回');
  process.exit(total > 0 ? 0 : 1);
})().catch(e => { console.error('PROBE FAIL: ' + (e.stack || e.message)); process.exit(2); });
