#!/usr/bin/env node
/*
 * driver_monsters_chimera.js — 6.27版 新規モンスター 項目4「キメラ (キマイラ)」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ENEMY_TYPES.chimera (hydra シート流用・2倍サイズ・ポドルプラザ ボス) と、その3trait:
 *   three_heads = attacksPerTurn:3 (既存の多攻撃ループがそのまま3連撃)
 *   fire_breath = 竜頭のブレス (単頭ボスのブレスブロックが isBoss+breath 系フィールドで発火)
 *   flight      = 新規ヘルパー zonePullFor(def) が前列バイアスを無効化 (真の最近接)
 * を検証する。加えて tavern.html の FAMILIES 新規 entry「chimera-beast」を検証する。
 *
 * ENEMY_TYPES/戦闘関数は IIFE 内 const で window 非公開のため、フルの index.html を
 * ロードして観測する。本番挙動を変えない dev プローブ(seed 時のみ push・既定 undefined
 * で no-op)で内部値を読む: __turnProbe(biteCount) / __breathProbe(hitCount,savedCount) /
 * __zoneProbe(ZONE_PULL 係数)。
 *
 * 検証項目:
 *   (1) chimera 単体 seed で .enemy-chimera DOM 生成 + 192px幾何 displaySize260 の描画健全
 *       (backgroundImage=chimera_anim.png?v= / bgSize=1560×1300) + pageerror ゼロ + diag critical ゼロ
 *   (2) three_heads: __turnProbe に キマイラ biteCount===3 (多攻撃ループが3回発火)
 *   (3) fire_breath: __breathProbe に キマイラ の 🔥ブレスが記録され、hitCount>=2 (複数の味方に
 *       AoE) かつ savedCount>=0 (DEX セーヴ半減の解決) が起きる。isBoss+breath で発火することを実証。
 *   (4) flight: __zoneProbe で キマイラ の前列バイアスが無効 (front===1.0 && rear===1.0)。
 *       同時に非flightの ゴブリン は既定 (front===0.75 && rear===1.25) = 回帰(挙動不変)。
 *   (5) plaza配線: tavern.html で __forceFamily=chimera-beast → QuestGen が bossKey"chimera" を
 *       spawns に載せる (buildSpawns 末尾)。familyId===chimera-beast。
 *   (6) 回帰: index.html?autoplay=15 / tavern.html?autoplay=15 スモークで pageerror ゼロ。
 *
 * 使い方:  node tools/driver_monsters_chimera.js [--headful] [--browser <path>] [--port N]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8799'), 10);

function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
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
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(PORT, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✅' : '  ❌') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// レベル8の4人パーティ (戦士頭 + ドワーフ/僧侶/魔法使い)。標準の Lv1 デフォルトだと
// 3連撃ボスに即全滅してボスのターン数が足りず、ブレス発火機会/非flight敵の行動が不足する。
// 高HPの隊列は「複数ラウンド生存 (=ボスが複数回ブレス機会を得る)」+「開始時に密集 (=3x3が複数命中)」を保証。
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true, name: '勇者',   level: 8 },
  { classKey: 'dwarf',   name: 'グリム', level: 8 },
  { classKey: 'cleric',  name: 'リタ',   level: 8 },
  { classKey: 'mage',    name: 'アル',   level: 8 },
];

// 生成シナリオ + 4人パーティを seed + 3プローブ配列を初期化する evaluateOnNewDocument 用
function seedInit(spawns) {
  return `(function(){
    try {
      sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'chimera probe', flavor: '', spawns: ${JSON.stringify(spawns)} }));
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(${JSON.stringify(SEED_PARTY)}));
    } catch(e) {}
    window.__turnProbe = [];
    window.__breathProbe = [];
    window.__zoneProbe = [];
  })();`;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_chim_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + profile],
  });
  const pageErrors = [];

  // ════════════════════════════════════════════════════════════════════
  // pageA: 近接 seed (chimera + minotaur を party 起点付近に) → 幾何 + three_heads + flight を捕捉。
  //   非flight代表は goblin(hp8=即死)でなく minotaur(hp45=数ラウンド生存) を採用し、
  //   その turn (pickEnemyTarget) が確実に発火 → 既定 ZONE_PULL の回帰を観測する。
  // ════════════════════════════════════════════════════════════════════
  const NEAR = [['chimera', 12, 13], ['minotaur', 14, 13]];
  const pageA = await browser.newPage();
  pageA.on('pageerror', e => pageErrors.push('[A] ' + e.message));
  const aErrBefore = pageErrors.length;
  await pageA.evaluateOnNewDocument(seedInit(NEAR));
  await pageA.goto('http://localhost:' + PORT + '/index.html?autoplay=20',
    { waitUntil: 'domcontentloaded', timeout: 30000 });

  let chimSeen = false;
  try { await pageA.waitForSelector('.enemy-chimera', { timeout: 15000 }); chimSeen = true; } catch (e) {}
  const aNewErrs = pageErrors.slice(aErrBefore);
  check('(1) chimera seed ロードで pageerror ゼロ', aNewErrs.length === 0, aNewErrs.join(' | '));

  // (1) 幾何: displaySize=260 → scale=260/192=1.35417 → w=260, bgSize=round(1152*s)×round(960*s)=1560×1300
  const geo = await pageA.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.enemy-chimera'));
    if (!els.length) return { count: 0 };
    const el = els[0];
    const bgImg = el.style.backgroundImage || '';
    const bgSize = el.style.backgroundSize || '';
    const w = parseFloat(el.style.width) || 0;
    const h = parseFloat(el.style.height) || 0;
    const m = bgSize.match(/([\d.]+)px\s+([\d.]+)px/);
    return { count: els.length, bgImg, bgSize, w, h, bgW: m ? parseFloat(m[1]) : 0, bgH: m ? parseFloat(m[2]) : 0 };
  });
  check('(1) .enemy-chimera 要素が生成される (>=1)', geo.count >= 1, 'count=' + geo.count);
  check('(1) backgroundImage が chimera_anim.png (?v=付き・専用)',
    /chimera_anim\.png\?v=/.test(geo.bgImg), 'bgImg=' + geo.bgImg);
  const wOk = Math.abs(geo.w - 260) <= 2 && Math.abs(geo.h - 260) <= 2;
  check('(1) 表示寸法 ≈260px (displaySize=260・2倍)', wOk, 'w=' + geo.w + ' h=' + geo.h);
  const bgOk = Math.abs(geo.bgW - 1560) <= 2 && Math.abs(geo.bgH - 1300) <= 2 && geo.bgW > geo.w;
  check('(1) backgroundSize ≈1560×1300 (192px幾何式通り・描画健全)', bgOk,
    'bgSize=' + geo.bgSize + ' (単一フレーム幅 ' + geo.w + 'px より大)');

  // (2)(4) three_heads(biteCount===3) + flight(zonePullFor) を最大 ~36s ポール
  let turn = { n: 0, bite3: false, maxBite: 0 };
  let zone = { chimFlightOff: false, minoDefault: false, chimN: 0, minoN: 0, chimFront: null, chimRear: null, minoFront: null, minoRear: null };
  for (let i = 0; i < 120; i++) {
    const r = await pageA.evaluate(() => {
      const tp = (window.__turnProbe || []).filter(e => e && e.name === 'キマイラ');
      let maxBite = 0, bite3 = false;
      for (const e of tp) { if (e.biteCount > maxBite) maxBite = e.biteCount; if (e.biteCount === 3) bite3 = true; }
      const zc = (window.__zoneProbe || []).filter(e => e && e.name === 'キマイラ');
      const zm = (window.__zoneProbe || []).filter(e => e && e.name === 'ミノタウロス');
      const c0 = zc[0] || null, m0 = zm[0] || null;
      return {
        n: tp.length, bite3, maxBite,
        chimN: zc.length, minoN: zm.length,
        chimFlightOff: !!(c0 && c0.flight === true && c0.front === 1.0 && c0.mid === 1.0 && c0.rear === 1.0),
        minoDefault: !!(m0 && m0.flight === false && m0.front === 0.75 && m0.mid === 1.0 && m0.rear === 1.25),
        chimFront: c0 && c0.front, chimRear: c0 && c0.rear, minoFront: m0 && m0.front, minoRear: m0 && m0.rear,
      };
    });
    turn = r; zone = r;
    if (r.bite3 && r.chimFlightOff && r.minoDefault) break;
    await sleep(300);
  }
  check('(2) three_heads: __turnProbe に キマイラ biteCount===3 (3連撃ループ発火)',
    turn.bite3, 'entries=' + turn.n + ' maxBite=' + turn.maxBite);
  check('(4) flight: キマイラ の前列バイアス無効 (front=1.0/mid=1.0/rear=1.0)',
    zone.chimFlightOff, 'front=' + zone.chimFront + ' rear=' + zone.chimRear + ' (entries=' + zone.chimN + ')');
  check('(4) 回帰: 非flight ミノタウロス は既定 (front=0.75/mid=1.0/rear=1.25 = 挙動不変)',
    zone.minoDefault, 'front=' + zone.minoFront + ' rear=' + zone.minoRear + ' (entries=' + zone.minoN + ')');

  const diag = await pageA.evaluate(() => {
    if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
    const r = window.__diag.getReport();
    const viol = (r.current || {}).violations || {};
    return { criticals: (r.totals && r.totals.criticals) || 0, jsErr: !!viol['js-error'], jsRej: !!viol['js-rejection'], violIds: Object.keys(viol) };
  });
  check('(1) __diag: critical ゼロ + js-error なし',
    !diag.noDiag && diag.criticals === 0 && !diag.jsErr && !diag.jsRej,
    diag.noDiag ? 'no __diag' : ('criticals=' + diag.criticals + ' viol=[' + diag.violIds.join(',') + ']'));
  await pageA.close();

  // ════════════════════════════════════════════════════════════════════
  // (3) fire_breath: 近接 seed (chimera を party 起点付近に) → 開始直後から密集した4人に
  //     ブレスが着弾 (3x3 が複数命中)。Lv8隊列で複数ラウンド生存 → ボスが毎ターン ~0.22 で
  //     ブレス抽選。新規 RNG で最大6回リロード再試行し、hitCount>=2 を確定的に捕捉。
  // ════════════════════════════════════════════════════════════════════
  const CLOSE = [['chimera', 12, 13], ['goblin', 13, 13]];
  let breath = { fired: false, maxHit: 0, entries: 0, sawSaved: false };
  for (let attempt = 0; attempt < 6 && !(breath.fired && breath.maxHit >= 2); attempt++) {
    const pageB = await browser.newPage();
    pageB.on('pageerror', e => pageErrors.push('[B' + attempt + '] ' + e.message));
    await pageB.evaluateOnNewDocument(seedInit(CLOSE));
    await pageB.goto('http://localhost:' + PORT + '/index.html?autoplay=30', { waitUntil: 'domcontentloaded', timeout: 30000 });
    for (let i = 0; i < 120; i++) {   // 最大 ~36s / attempt
      const r = await pageB.evaluate(() => {
        const bp = (window.__breathProbe || []).filter(e => e && e.name === 'キマイラ');
        let maxHit = 0, sawSaved = false;
        for (const e of bp) { if (e.hitCount > maxHit) maxHit = e.hitCount; if (e.savedCount >= 0) sawSaved = true; }
        // 戦闘終了検出 (勝敗いずれも #resultOverlay.show → これ以上ブレス機会なし)
        const over = !!document.querySelector('#resultOverlay.show');
        return { fired: bp.length > 0, maxHit, entries: bp.length, sawSaved, over };
      });
      breath = { fired: r.fired || breath.fired, maxHit: Math.max(breath.maxHit, r.maxHit), entries: Math.max(breath.entries, r.entries), sawSaved: r.sawSaved || breath.sawSaved };
      if (r.fired && r.maxHit >= 2) break;
      if (r.over && i > 6) break;   // 決着済 → リロードで再試行
      await sleep(300);
    }
    await pageB.close();
    if (breath.fired && breath.maxHit >= 2) break;
    console.log('  … fire_breath attempt ' + attempt + ': fired=' + breath.fired + ' maxHit=' + breath.maxHit + ' (retry)');
  }
  check('(3) fire_breath: 🔥ブレスが発火 (__breathProbe にキマイラ記録)', breath.fired, 'entries=' + breath.entries);
  check('(3) fire_breath: 複数の味方に AoE (hitCount>=2)', breath.maxHit >= 2, 'maxHit=' + breath.maxHit);
  check('(3) fire_breath: DEX セーヴ解決が走る (savedCount 記録)', breath.sawSaved, 'sawSaved=' + breath.sawSaved);

  // ════════════════════════════════════════════════════════════════════
  // (5) plaza配線: tavern.html で __forceFamily=chimera-beast → QuestGen が chimera を boss に
  // ════════════════════════════════════════════════════════════════════
  const pageT = await browser.newPage();
  pageT.on('pageerror', e => pageErrors.push('[T] ' + e.message));
  const tErrBefore = pageErrors.length;
  await pageT.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(800);
  const plaza = await pageT.evaluate(() => {
    try {
      window.__forceFamily = 'chimera-beast';
      const q = QuestGen.generateQuest(5, { source: 'plaza' });
      const spawns = QuestGen.buildSpawns(q);
      const boss = spawns[spawns.length - 1];
      return {
        ok: true, familyId: q.familyId,
        bossKey: boss && boss[0], bossPos: boss ? [boss[1], boss[2]] : null,
        anyChimera: spawns.some(s => s[0] === 'chimera'),
        target: q.target,
      };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  check('(5) plaza: QuestGen が forceFamily で chimera-beast を選ぶ',
    plaza.ok && plaza.familyId === 'chimera-beast', plaza.ok ? ('familyId=' + plaza.familyId) : ('err=' + plaza.err));
  check('(5) plaza: buildSpawns 末尾の bossKey==="chimera" (牙貨は tier式で自動整合)',
    plaza.ok && plaza.bossKey === 'chimera' && plaza.anyChimera,
    plaza.ok ? ('boss=' + plaza.bossKey + ' pos=' + JSON.stringify(plaza.bossPos) + ' target=' + plaza.target) : '');
  const tNewErrs = pageErrors.slice(tErrBefore);
  check('(5) tavern.html ロードで pageerror ゼロ', tNewErrs.length === 0, tNewErrs.join(' | '));
  await pageT.close();

  // ════════════════════════════════════════════════════════════════════
  // (6) 回帰スモーク: 素の index.html?autoplay + tavern.html?autoplay
  // ════════════════════════════════════════════════════════════════════
  const pageS = await browser.newPage();
  pageS.on('pageerror', e => pageErrors.push('[smoke-idx] ' + e.message));
  const sIdxBefore = pageErrors.length;
  await pageS.goto('http://localhost:' + PORT + '/index.html?autoplay=15&autodebug=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  check('(6) index.html?autoplay スモーク pageerror ゼロ (回帰)', pageErrors.slice(sIdxBefore).length === 0, pageErrors.slice(sIdxBefore).join(' | '));
  await pageS.close();

  const pageS2 = await browser.newPage();
  pageS2.on('pageerror', e => pageErrors.push('[smoke-tav] ' + e.message));
  const sTavBefore = pageErrors.length;
  await pageS2.goto('http://localhost:' + PORT + '/tavern.html?autoplay=15', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  check('(6) tavern.html?autoplay スモーク pageerror ゼロ (回帰)', pageErrors.slice(sTavBefore).length === 0, pageErrors.slice(sTavBefore).join(' | '));
  await pageS2.close();

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  if (!chimSeen) console.log('[driver] note: .enemy-chimera の待機がタイムアウト');
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
