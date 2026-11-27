#!/usr/bin/env node
/*
 * probe_arcane_levels.js — 仲間 Lv / スキル数の「カード表示 ↔ 出発で焼く値 ↔ ゲーム内」の食い違いを実測する調査台
 *   (ブリッジ依頼 問題2(b) / 問題1(a))。数値は一切変えない (計測のみ)。
 *
 * 流れ (本番の受注→出発を関数直叩きで再現):
 *   1. Lv7 主人公 + 掃除済みの localStorage を仕込む
 *   2. tavern を forcequest=arcane-tower で開く (recruittalk 既定 ON)
 *   3. DFRecruits に「酒場で声を掛けた」体の新顔を注入 (level/mercId 無し = castSeatMember 相当)
 *   4. openPrep 相当 (regeneratePartyMembers) → マッチング相当 (fixCompanionLevelsEarly) →
 *      カードの Lv/スキル数を shownLevelOf / skillLimitForClass で読む
 *   5. departToScenario で sessionStorage へ焼いた Lv を読む (=BAKED)
 *   6. index.html へ遷移し、createAlly 後の ally.level / equippedSkills (=INGAME) を読む
 *   7. CARD / BAKED / INGAME を名前ごとに並べて差分を出す
 *
 * 使い方: node tools/probe_arcane_levels.js [--xp 22200] [--recruittalk 1|0] [--port 10945]
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
const XP = parseInt(arg('xp', '22200'), 10);       // Lv7
const RECRUITTALK = arg('recruittalk', '1');        // 1=本番(声掛け) / 0=buildParty(ティア帯)
const PORT = parseInt(arg('port', '10945'), 10);
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
const CLEARED = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort'];

function SEED(cfg) {
  try {
    // ⚠ evaluateOnNewDocument は index.html への遷移でも走る。index 側で再実行すると
    //   departToScenario が焼いた sessionStorage を消してしまう → 一度だけに絞る
    //   (guard キーは 'dragonfighters.' 接頭ではないので下の全消しで消えない)。
    if (sessionStorage.getItem('__dfArcaneLvPurged')) return;
    [localStorage, sessionStorage].forEach(function (s) {
      Object.keys(s).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
      });
    });
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.cleared', JSON.stringify(cfg.cleared));
    localStorage.setItem('dragonfighters.xp', String(cfg.xp));
    sessionStorage.setItem('__dfArcaneLvPurged', '1');
  } catch (e) {}
}

(async () => {
  const puppeteer = loadPuppeteer();
  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[drv] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }
  console.log('[drv] 仲間Lv計測  xp=' + XP + '  recruittalk=' + RECRUITTALK);

  const profile = makeProfile('df_arcane_lv_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.log('  [pageerror] ' + e.message); });
  await page.setViewport({ width: 1280, height: 860 });
  await page.evaluateOnNewDocument(SEED, { cleared: CLEARED, xp: XP });

  const TAVURL = '/tavern.html?dev=1&forcequest=arcane-tower&recruittalk=' + RECRUITTALK;
  await page.goto('http://localhost:' + PORT + TAVURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof scenarios!=='undefined' && typeof regeneratePartyMembers==='function' && typeof departToScenario==='function'", { timeout: 30000 });
  await sleep(200);

  const cardResult = await page.evaluate((recruittalk) => {
    const out = { steps: [], card: [], baked: [], heroLvTavern: null };
    try {
      const sc = scenarios.find(s => s.id === 'arcane-tower');
      out.sc = sc ? { id: sc.id, recommendedLevel: sc.recommendedLevel, difficulty: sc.difficulty } : null;
      out.heroLvTavern = (typeof getLevelFromXP === 'function') ? getLevelFromXP(inventory.xp) : null;
      // (3) 声掛け = DFRecruits へ新顔を注入 (level/mercId 無し = fresh patron)。recruittalk=0 では使わない。
      if (recruittalk !== '0' && window.DFRecruits) {
        try { DFRecruits.clear(); } catch (e) {}
        const PZ = (typeof PARTY_ZONES !== 'undefined') ? PARTY_ZONES : {};
        [['dwarf','ベルント'], ['rogue','ダグ'], ['warrior','イレーナ']].forEach(p => {
          DFRecruits.add({ classKey: p[0], name: p[1], zone: PZ[p[0]], trait: '剛毅', line: '…' }, 3);
        });
        out.recruitsInjected = DFRecruits.all().map(m => ({ name: m.name, classKey: m.classKey, level: m.level == null ? null : m.level }));
      }
      // (4) openPrep 相当
      prepScenario = sc;
      activeCharTab = selection.partyComposition[0] || 'warrior';
      regeneratePartyMembers();
      out.afterRegen = (selection.partyMembers || []).map(m => ({ name: m.name, classKey: m.classKey, isHero: !!m.isHero, level: (m.level == null ? null : m.level) }));
      // マッチング相当: カードを描く直前に Lv を決める
      if (typeof fixCompanionLevelsEarly === 'function') fixCompanionLevelsEarly(sc);
      // カードが出す値 = shownLevelOf(m) / スキル数 = skillLimitForClass(classKey)
      out.card = (selection.partyMembers || []).map(m => ({
        name: m.name, classKey: m.classKey, isHero: !!m.isHero,
        rawLevel: (m.level == null ? null : m.level),
        shownLevel: (typeof shownLevelOf === 'function') ? shownLevelOf(m) : null,
        skillLimit: (typeof skillLimitForClass === 'function') ? skillLimitForClass(m.classKey) : null,
      }));
      // (5) 出発 = sessionStorage へ焼く
      departToScenario();
      const pm = JSON.parse(sessionStorage.getItem('dragonfighters.partyMembers') || '[]');
      out.baked = pm.map(m => ({ name: m.name, classKey: m.classKey, isHero: !!m.isHero, level: (m.level == null ? null : m.level) }));
      out.ok = true;
    } catch (e) { out.ok = false; out.err = String((e && e.message) || e); }
    return out;
  }, RECRUITTALK);

  // (6) index.html へ遷移 (同一オリジン = sessionStorage 継続)。createAlly 後の ally.level / スキルを読む
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForFunction("typeof allies!=='undefined' && allies && allies.length>=1", { timeout: 30000 }); } catch (e) {}
  await sleep(400);
  const ingame = await page.evaluate(() => {
    const out = { allies: [], heroLvIndex: null };
    try {
      out.heroLvIndex = (typeof getLevelFromXP === 'function' && typeof currentTotalXp !== 'undefined') ? getLevelFromXP(currentTotalXp) : null;
      out.allyLvXp = out.heroLvIndex;
      (allies || []).forEach(a => {
        out.allies.push({
          name: a.name || a.classKey, classKey: a.classKey, isHero: !!a.isHero,
          level: (a.level == null ? null : a.level),
          skills: Array.isArray(a.equippedSkills) ? a.equippedSkills.length : null,
        });
      });
    } catch (e) { out.err = String((e && e.message) || e); }
    return out;
  });

  // ── レポート ──
  console.log('\n═══ 仲間 Lv の三者比較 (recruittalk=' + RECRUITTALK + ') ═══');
  console.log('主人公Lv: tavern=' + cardResult.heroLvTavern + ' / index=' + ingame.heroLvIndex);
  if (cardResult.recruitsInjected) console.log('注入した声掛け: ' + JSON.stringify(cardResult.recruitsInjected));
  if (!cardResult.ok) { console.log('  [ERR] tavern 側: ' + cardResult.err); }
  console.log('\n名前          職      | カード(Lv/スキル) | 焼いた(Lv) | ゲーム内(Lv/スキル)');
  const byName = {};
  (cardResult.card || []).forEach(c => { byName[c.name] = byName[c.name] || {}; byName[c.name].card = c; });
  (cardResult.baked || []).forEach(b => { byName[b.name] = byName[b.name] || {}; byName[b.name].baked = b; });
  (ingame.allies || []).forEach(g => { byName[g.name] = byName[g.name] || {}; byName[g.name].ingame = g; });
  Object.keys(byName).forEach(nm => {
    const r = byName[nm];
    const c = r.card, b = r.baked, g = r.ingame;
    const cl = (c && c.classKey) || (b && b.classKey) || (g && g.classKey) || '?';
    const cardStr = c ? ((c.shownLevel == null ? '-' : 'Lv' + c.shownLevel) + '/' + (c.skillLimit == null ? '-' : c.skillLimit + 'sk')) : '—';
    const bakeStr = b ? (b.level == null ? '-' : 'Lv' + b.level) : '—';
    const gameStr = g ? ((g.level == null ? '-' : 'Lv' + g.level) + '/' + (g.skills == null ? '-' : g.skills + 'sk')) : '—';
    const flag = (c && g && c.shownLevel != null && g.level != null && c.shownLevel !== g.level) ? '  ⚠Lv食違い' : '';
    console.log('  ' + (nm + '            ').slice(0, 12) + ' ' + (cl + '      ').slice(0, 7) + '| ' + (cardStr + '          ').slice(0, 16) + '| ' + (bakeStr + '      ').slice(0, 10) + '| ' + gameStr + flag);
  });

  try { await browser.close(); } catch (e) {}
  srv.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(3); });
