#!/usr/bin/env node
/*
 * observe_affinity_live.js — ★#121 (B3) 相性ペアの掛け合いが「通常プレイ相当の実機ブラウザで実際に画面表示される」ことの観察
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/observe_affinity_live.js                 # 既定: 遭遇を止めない自然プレイを最長 240 秒観察
 *   node tools/observe_affinity_live.js --secs 180 --headful
 *
 * ■ なぜ別スクリプトか
 *   受入ドライバ verify_companion_affinity.js の (3a) は tryStartEncounter を無効化して「恒常 explore」で
 *   観測する (= 探索窓が永遠に続く特殊条件)。2026-11-25 の真因 (starvation) は「戦闘が長く探索窓が短い実プレイ」
 *   でのみ再現するため、ここでは **遭遇を止めない** = 戦闘と探索を自然に繰り返すオートプレイで観察する。
 *
 * ■ 「実際に画面表示された」の判定 = speechLog の meta.scene==='banter' エントリ。
 *   これは index.html の _renderBubble() が <div class="speechBubble"> を enemyLayer に append した
 *   その瞬間に push される行 = 予約 (speechQueue) ではなく「描画済み」の記録。あわせて描画の瞬間に
 *   生きている .speechBubble DOM のテキストも拾い、同じ文が実際に画面に出ていることを二重確認する。
 *
 * ⛔ 本番ファイルは 1 バイトも変えない (pristine をそのまま配信)。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const SECS = parseInt(arg('secs', '240'), 10);
const PORT = parseInt(arg('port', '10940'), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const I = 'index.html';
const CC = 'js/companion-cast.js';
const PRISTINE_CC = fs.readFileSync(path.join(ROOT, CC), 'utf8');

/* companion-cast.js を node 側で評価して DFCast を得る (人物データ作成用) */
const NODE_CAST = (() => {
  const sandbox = { location: { search: '' } };
  new Function('window', PRISTINE_CC)(sandbox);
  return sandbox.DFCast;
})();

/* ── サーバ (pristine をそのまま配信) ── */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        res.on('error', () => {});
        let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (rel === '') rel = I;
        res.setHeader('Cache-Control', 'no-store');
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { try { res.statusCode = 500; res.end('500'); } catch (e2) {} }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[env] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[env] Chrome/Edge が見つかりません'); process.exit(2);
}

/* ── 編成: 相性ペアを 2 組ぶん積む (揃いやすくする)。遭遇ありでも持つよう Lv を上げる ── */
const ZONE = { warrior: 'front', dwarf: 'front', rogue: 'mid', elf: 'mid', cleric: 'mid', mage: 'rear' };
/* irena↔mira (規律と跳ねっ返り) + gawain↔bernt (気難しい老人) = 2 ペア。hero は warrior。 */
const CAST_IDS = ['irena', 'mira', 'gawain', 'bernt'];
function members() {
  const out = [{ classKey: 'warrior', name: 'あなた', isHero: true, zone: ZONE.warrior, variant: 0, level: 8 }];
  for (const id of CAST_IDS) {
    const c = NODE_CAST.byId(id);
    if (!c) { console.error('[env] DFCast.byId(' + id + ') 無し'); process.exit(2); }
    out.push({ classKey: c.classKey, name: c.name, isHero: false, zone: ZONE[c.classKey], variant: c.variant,
      trait: c.trait, line: c.line, castId: c.id, level: 8 });
  }
  return out;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const exe = findBrowser();
  const srv = await startServer(PORT);
  const browser = await puppeteer.launch({ headless: !HEADFUL, executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const BASE = 'http://127.0.0.1:' + PORT + '/';
  const QS = '?diag=1&scen=goblin-mine&graph=0&autoplay=15';
  const pageErrs = [];

  async function open() {
    const page = await browser.newPage();
    page.on('pageerror', (e) => pageErrs.push(String(e.message).slice(0, 160)));
    await page.setViewport({ width: 1280, height: 900 });
    const mem = members();
    await page.evaluateOnNewDocument((spec) => {
      try {
        [localStorage, sessionStorage].forEach((st) => {
          const k = []; for (let i = 0; i < st.length; i++) if (st.key(i).indexOf('dragonfighters.') === 0) k.push(st.key(i));
          k.forEach((x) => st.removeItem(x));
        });
        localStorage.setItem('dragonfighters.xp', '45000');
        localStorage.setItem('dragonfighters.prologueSeen', '1');
        sessionStorage.setItem('dragonfighters.plazaClock', '21');
        sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(spec.mem));
        sessionStorage.setItem('dragonfighters.partyComposition', JSON.stringify([spec.mem[0].classKey]));
      } catch (e) {}
    }, { mem });
    await page.goto(BASE + I + QS, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => { try { return typeof allies !== 'undefined' && allies.length > 0 && typeof startGame === 'function' && !!window.__affinity; } catch (e) { return false; } }, { timeout: 60000 });
    await sleep(400);
    /* ⚠ ここでは tryStartEncounter を止めない = 戦闘と探索を自然に繰り返す「通常プレイ相当」 */
    await page.evaluate(() => { try { if (!gameStarted) startGame(); } catch (e) {} });
    await page.waitForFunction(() => { try { return gameStarted; } catch (e) { return false; } }, { timeout: 30000 });
    return page;
  }

  let page = await open();
  const started = Date.now();
  const seen = new Set();       // speechLog の at で重複排除
  const banter = [];            // 実表示された掛け合い { sec, phase, castId, with, text, domSeen }
  const phaseHist = {};         // 観測した phase の分布 (戦闘が本当に起きているかの傍証)
  let reopens = 0;

  while ((Date.now() - started) < SECS * 1000 && banter.length < 12) {
    await sleep(700);
    let snap;
    try {
      snap = await page.evaluate(() => {
        const log = (typeof speechLog !== 'undefined') ? speechLog : [];
        const b = [];
        for (const r of log) if (r && r.meta && r.meta.scene === 'banter')
          b.push({ at: r.at, text: r.text, castId: r.castId || null, withWho: r.meta.with || null });
        const dom = Array.from(document.querySelectorAll('.speechBubble')).map((e) => e.textContent);
        return {
          banter: b, dom,
          phase: (typeof currentPhase !== 'undefined') ? currentPhase : '?',
          over: (typeof gameOver !== 'undefined') ? !!gameOver : false,
          nAlly: (typeof allies !== 'undefined') ? allies.filter((a) => a && a.alive).length : 0,
        };
      });
    } catch (e) { snap = null; }
    if (!snap) { await sleep(300); continue; }

    phaseHist[snap.phase] = (phaseHist[snap.phase] || 0) + 1;
    for (const r of snap.banter) {
      if (seen.has(r.at)) continue;
      seen.add(r.at);
      const domSeen = snap.dom.indexOf(r.text) >= 0;   // 描画直後なら生きた吹き出し DOM にも同じ文がある
      const row = { sec: ((r.at - started) / 1000).toFixed(1), phase: snap.phase, castId: r.castId, with: r.withWho, text: r.text, domSeen };
      banter.push(row);
      console.log('  🗨  +' + row.sec + 's [' + row.phase + '] ' + (row.castId || '?') + '→' + (row.with || '?') +
        (domSeen ? '  (DOM✓)' : '') + '  「' + String(row.text).slice(0, 34) + '」');
    }
    /* 全滅したら(= 敵が強い) すぐ開き直して観察を続ける (通常プレイでも全滅はあり得るため) */
    if (snap.over || snap.nAlly === 0) {
      reopens++;
      try { await page.close(); } catch (e) {}
      if ((Date.now() - started) < SECS * 1000 && reopens <= 6) { page = await open(); }
      else break;
    }
  }

  const dur = ((Date.now() - started) / 1000).toFixed(0);
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  観察 ' + dur + 's / 再起動 ' + reopens + ' 回 / phase 分布 ' + JSON.stringify(phaseHist));
  console.log('  画面表示された掛け合い: ' + banter.length + ' 行' + (banter.some((b) => b.domSeen) ? ' (うち DOM 実在を直接確認した行あり)' : ''));
  const combatSeen = (phaseHist.combat || 0) > 0;
  console.log('  戦闘フェーズを観測したか (= 通常プレイ相当): ' + (combatSeen ? 'はい' : 'いいえ'));
  if (pageErrs.length) console.log('  ⚠ pageerror: ' + pageErrs.slice(0, 4).join(' || '));
  console.log('══════════════════════════════════════════════════════════');

  try { await browser.close(); } catch (e) {}
  try { srv.close(); } catch (e) {}

  /* 合否: 戦闘を観測した自然プレイで、掛け合いが 1 行以上実表示されていること */
  const ok = banter.length >= 1 && combatSeen;
  console.log(ok ? '\n✅ 通常プレイ相当(戦闘あり)の実機ブラウザで掛け合いの画面表示を観測' :
                   '\n❌ 掛け合いの実表示を観測できず (banter=' + banter.length + ' combat=' + combatSeen + ')');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('[fatal] ' + String((e && e.stack) || e).slice(0, 500)); process.exit(2); });
