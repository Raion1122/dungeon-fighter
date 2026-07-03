#!/usr/bin/env node
/*
 * driver_monsters_griffon.js — 6.27版 新規モンスター 項目5「グリフォン」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ENEMY_TYPES.griffon (direBear シート流用・2倍サイズ・ポドルプラザ ボス) と、その3特性:
 *   attacksPerTurn:2 = 嘴+爪の2連撃 (既存の多攻撃ループがそのまま2回発火)
 *   flight           = 飛行 (zonePullFor の flight 分岐)
 *   swoop            = 急降下: 前列を飛び越え後衛/中衛を優先 (zonePullFor の swoop 分岐・flight より先に評価)
 * を検証する。加えて tavern.html の FAMILIES 新規 entry「griffon-aerie」を検証する。
 *
 * ★最重要: griffon は flight:true かつ swoop:true の両持ち。zonePullFor で swoop 分岐が
 * flight 分岐より“先”に評価されねばならない (さもなくば flight の等倍 1.0 が勝つ)。
 * (3) がこれを __zoneProbe (戻り値=swoop の 1.25/1.0/0.75) で実証する。
 *
 * ENEMY_TYPES/戦闘関数は IIFE 内 const で window 非公開のため、フルの index.html を
 * ロードして観測する。本番挙動を変えない dev プローブ(seed 時のみ push・既定 undefined
 * で no-op)で内部値を読む: __turnProbe(biteCount) / __zoneProbe(ZONE_PULL 係数) /
 * __pickProbe(選ばれた対象の kind/zone)。
 *
 * 検証項目:
 *   (1) griffon 単体 seed で .enemy-griffon DOM 生成 + 192px幾何 displaySize240 の描画健全
 *       (backgroundImage=direBear_anim.png?v= / bgSize=1440×1200) + pageerror ゼロ + diag critical ゼロ
 *   (2) attacksPerTurn:2: __turnProbe に グリフォン biteCount===2 (多攻撃ループが2回発火)
 *   (3) swoop: __zoneProbe で グリフォン が front=1.25/mid=1.0/rear=0.75 を返す
 *       (=swoop 分岐が flight より先に評価され勝つ実証)。かつ __pickProbe で グリフォン の
 *       ターゲットが同一パーティを見る非swoop敵(ミノタウロス)より rear/mid 寄り
 *       (=前列を飛び越えて後衛/中衛を狙う実証)。
 *   (4) 非回帰: chimera(flight only) が依然 front=1.0/mid=1.0/rear=1.0、非flight/非swoop の
 *       ミノタウロス が既定 front=0.75/mid=1.0/rear=1.25 (zonePullFor 分岐順の副作用ゼロ)。
 *   (5) plaza配線: tavern.html で __forceFamily=griffon-aerie → QuestGen が bossKey"griffon" を
 *       spawns に載せる (buildSpawns 末尾)。familyId===griffon-aerie。
 *   (6) 回帰: index.html?autoplay=15 / tavern.html?autoplay=15 スモークで pageerror ゼロ。
 *
 * 使い方:  node tools/driver_monsters_griffon.js [--headful] [--browser <path>] [--port N]
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
const PORT = parseInt(arg('port', '8800'), 10);

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

// レベル8の4人パーティ (戦士頭=front / ドワーフ=front / 僧侶=mid / 魔法使い=rear)。
// front/mid/rear の3ゾーンを網羅 → swoop の後衛/中衛偏重を観測できる。
// 標準の Lv1 デフォルトだと2連撃ボスに即全滅してボスのターン数が足りず観測不能。
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true, name: '勇者',   level: 8 },   // front
  { classKey: 'dwarf',   name: 'グリム', level: 8 },                 // front
  { classKey: 'cleric',  name: 'リタ',   level: 8 },                 // mid
  { classKey: 'mage',    name: 'アル',   level: 8 },                 // rear
];

// 生成シナリオ + 4人パーティを seed + 3プローブ配列を初期化する evaluateOnNewDocument 用
function seedInit(spawns) {
  return `(function(){
    try {
      sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'griffon probe', flavor: '', spawns: ${JSON.stringify(spawns)} }));
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(${JSON.stringify(SEED_PARTY)}));
    } catch(e) {}
    window.__turnProbe = [];
    window.__zoneProbe = [];
    window.__pickProbe = [];
  })();`;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_grif_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + profile],
  });
  const pageErrors = [];

  // ════════════════════════════════════════════════════════════════════
  // pageA: 近接 seed (griffon + minotaur を party 起点付近に) → 幾何 + attacksPerTurn:2 +
  //   swoop(__zoneProbe/__pickProbe) + 既定回帰(minotaur) を捕捉。
  //   griffon と minotaur は同一の party 候補集合を見る (双方 非beast=互いを狙わない) ため、
  //   __pickProbe の rear/mid 率の差が「swoop が前列を飛び越える」ことを直接実証する。
  //   非flight代表は minotaur(hp45=数ラウンド生存) → その turn が確実に発火し既定 ZONE_PULL を観測。
  // ════════════════════════════════════════════════════════════════════
  const NEAR = [['griffon', 12, 13], ['minotaur', 13, 13]];
  const pageA = await browser.newPage();
  pageA.on('pageerror', e => pageErrors.push('[A] ' + e.message));
  const aErrBefore = pageErrors.length;
  await pageA.evaluateOnNewDocument(seedInit(NEAR));
  await pageA.goto('http://localhost:' + PORT + '/index.html?autoplay=20',
    { waitUntil: 'domcontentloaded', timeout: 30000 });

  let grifSeen = false;
  try { await pageA.waitForSelector('.enemy-griffon', { timeout: 15000 }); grifSeen = true; } catch (e) {}
  const aNewErrs = pageErrors.slice(aErrBefore);
  check('(1) griffon seed ロードで pageerror ゼロ', aNewErrs.length === 0, aNewErrs.join(' | '));

  // (1) 幾何: displaySize=240 → scale=240/192=1.25 → w=240, bgSize=round(1152*s)×round(960*s)=1440×1200
  const geo = await pageA.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.enemy-griffon'));
    if (!els.length) return { count: 0 };
    const el = els[0];
    const bgImg = el.style.backgroundImage || '';
    const bgSize = el.style.backgroundSize || '';
    const w = parseFloat(el.style.width) || 0;
    const h = parseFloat(el.style.height) || 0;
    const m = bgSize.match(/([\d.]+)px\s+([\d.]+)px/);
    return { count: els.length, bgImg, bgSize, w, h, bgW: m ? parseFloat(m[1]) : 0, bgH: m ? parseFloat(m[2]) : 0 };
  });
  check('(1) .enemy-griffon 要素が生成される (>=1)', geo.count >= 1, 'count=' + geo.count);
  check('(1) backgroundImage が direBear_anim.png (?v=付き・借用)',
    /direBear_anim\.png\?v=/.test(geo.bgImg), 'bgImg=' + geo.bgImg);
  const wOk = Math.abs(geo.w - 240) <= 2 && Math.abs(geo.h - 240) <= 2;
  check('(1) 表示寸法 ≈240px (displaySize=240・2倍)', wOk, 'w=' + geo.w + ' h=' + geo.h);
  const bgOk = Math.abs(geo.bgW - 1440) <= 2 && Math.abs(geo.bgH - 1200) <= 2 && geo.bgW > geo.w;
  check('(1) backgroundSize ≈1440×1200 (192px幾何式通り・描画健全)', bgOk,
    'bgSize=' + geo.bgSize + ' (単一フレーム幅 ' + geo.w + 'px より大)');

  // (2)(3)(4) attacksPerTurn:2 + swoop(zonePullFor/pick) + minotaur既定 を最大 ~60s ポール
  let turn = { bite2: false, maxBite: 0, n: 0 };
  let zone = { grifSwoop: false, minoDefault: false, grifN: 0, minoN: 0, grifF: null, grifM: null, grifR: null, minoF: null, minoR: null };
  let pick = { grifTotal: 0, grifRearMid: 0, minoTotal: 0, minoRearMid: 0, grifRearMidRate: 0, minoRearMidRate: 0 };
  for (let i = 0; i < 200; i++) {
    const r = await pageA.evaluate(() => {
      const tp = (window.__turnProbe || []).filter(e => e && e.name === 'グリフォン');
      let maxBite = 0, bite2 = false;
      for (const e of tp) { if (e.biteCount > maxBite) maxBite = e.biteCount; if (e.biteCount === 2) bite2 = true; }
      const zg = (window.__zoneProbe || []).filter(e => e && e.name === 'グリフォン');
      const zm = (window.__zoneProbe || []).filter(e => e && e.name === 'ミノタウロス');
      const g0 = zg[0] || null, m0 = zm[0] || null;
      const pg = (window.__pickProbe || []).filter(e => e && e.name === 'グリフォン');
      const pm = (window.__pickProbe || []).filter(e => e && e.name === 'ミノタウロス');
      const isRM = z => (z === 'rear' || z === 'mid');
      const gRM = pg.filter(e => isRM(e.zone)).length, mRM = pm.filter(e => isRM(e.zone)).length;
      return {
        n: tp.length, bite2, maxBite,
        grifN: zg.length, minoN: zm.length,
        grifSwoop: !!(g0 && g0.front === 1.25 && g0.mid === 1.0 && g0.rear === 0.75),
        minoDefault: !!(m0 && m0.flight === false && m0.front === 0.75 && m0.mid === 1.0 && m0.rear === 1.25),
        grifF: g0 && g0.front, grifM: g0 && g0.mid, grifR: g0 && g0.rear, minoF: m0 && m0.front, minoR: m0 && m0.rear,
        grifTotal: pg.length, grifRearMid: gRM, minoTotal: pm.length, minoRearMid: mRM,
      };
    });
    turn = r; zone = r; pick = r;
    // 十分なサンプルが集まり かつ 全アサートの前提が揃ったら早期終了
    if (r.bite2 && r.grifSwoop && r.minoDefault && r.grifTotal >= 6 && r.minoTotal >= 4) break;
    await sleep(300);
  }
  pick.grifRearMidRate = pick.grifTotal ? pick.grifRearMid / pick.grifTotal : 0;
  pick.minoRearMidRate = pick.minoTotal ? pick.minoRearMid / pick.minoTotal : 0;

  check('(2) attacksPerTurn:2: __turnProbe に グリフォン biteCount===2 (2連撃ループ発火)',
    turn.bite2, 'entries=' + turn.n + ' maxBite=' + turn.maxBite);
  check('(3) swoop: グリフォン の zonePullFor 戻り値 = front=1.25/mid=1.0/rear=0.75 (swoop が flight より先に評価され勝つ)',
    zone.grifSwoop, 'front=' + zone.grifF + ' mid=' + zone.grifM + ' rear=' + zone.grifR + ' (entries=' + zone.grifN + ')');
  // swoop の実挙動: グリフォンは前列を飛び越え rear/mid を狙う。同一パーティを見る非swoop敵より rear/mid 率が高いこと。
  check('(3) swoop: グリフォン が rear/mid を実際に狙う (>=1回)',
    pick.grifRearMid >= 1, 'grifRearMid=' + pick.grifRearMid + '/' + pick.grifTotal);
  check('(3) swoop: グリフォン の rear/mid 率 > 非swoop ミノタウロス (前列を飛び越える実証)',
    pick.grifTotal >= 3 && pick.minoTotal >= 1 && pick.grifRearMidRate > pick.minoRearMidRate,
    'grif=' + pick.grifRearMid + '/' + pick.grifTotal + '(' + pick.grifRearMidRate.toFixed(2) + ') vs mino=' +
    pick.minoRearMid + '/' + pick.minoTotal + '(' + pick.minoRearMidRate.toFixed(2) + ')');
  check('(4) 回帰: 非flight/非swoop ミノタウロス は既定 (front=0.75/mid=1.0/rear=1.25 = 挙動不変)',
    zone.minoDefault, 'front=' + zone.minoF + ' rear=' + zone.minoR + ' (entries=' + zone.minoN + ')');

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
  // (4) flight-only 回帰: chimera を seed し __zoneProbe で flight 分岐 (1.0/1.0/1.0) が
  //     swoop 分岐追加後も不変であることを確認 (swoop:false → flight が勝つ)。
  // ════════════════════════════════════════════════════════════════════
  const CHIM = [['chimera', 12, 13], ['goblin', 13, 13]];
  const pageC = await browser.newPage();
  pageC.on('pageerror', e => pageErrors.push('[C] ' + e.message));
  await pageC.evaluateOnNewDocument(seedInit(CHIM));
  await pageC.goto('http://localhost:' + PORT + '/index.html?autoplay=20', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let chimFlight = { off: false, n: 0, f: null, m: null, r: null };
  for (let i = 0; i < 80; i++) {
    const r = await pageC.evaluate(() => {
      const zc = (window.__zoneProbe || []).filter(e => e && e.name === 'キマイラ');
      const c0 = zc[0] || null;
      return { off: !!(c0 && c0.flight === true && c0.front === 1.0 && c0.mid === 1.0 && c0.rear === 1.0),
               n: zc.length, f: c0 && c0.front, m: c0 && c0.mid, r: c0 && c0.rear };
    });
    chimFlight = r;
    if (r.off) break;
    await sleep(300);
  }
  check('(4) 回帰: chimera(flight only) は依然 front=1.0/mid=1.0/rear=1.0 (swoop分岐追加の副作用ゼロ)',
    chimFlight.off, 'front=' + chimFlight.f + ' mid=' + chimFlight.m + ' rear=' + chimFlight.r + ' (entries=' + chimFlight.n + ')');
  await pageC.close();

  // ════════════════════════════════════════════════════════════════════
  // (5) plaza配線: tavern.html で __forceFamily=griffon-aerie → QuestGen が griffon を boss に
  // ════════════════════════════════════════════════════════════════════
  const pageT = await browser.newPage();
  pageT.on('pageerror', e => pageErrors.push('[T] ' + e.message));
  const tErrBefore = pageErrors.length;
  await pageT.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(800);
  const plaza = await pageT.evaluate(() => {
    try {
      window.__forceFamily = 'griffon-aerie';
      const q = QuestGen.generateQuest(5, { source: 'plaza' });
      const spawns = QuestGen.buildSpawns(q);
      const boss = spawns[spawns.length - 1];
      return {
        ok: true, familyId: q.familyId,
        bossKey: boss && boss[0], bossPos: boss ? [boss[1], boss[2]] : null,
        anyGriffon: spawns.some(s => s[0] === 'griffon'),
        target: q.target,
      };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  check('(5) plaza: QuestGen が forceFamily で griffon-aerie を選ぶ',
    plaza.ok && plaza.familyId === 'griffon-aerie', plaza.ok ? ('familyId=' + plaza.familyId) : ('err=' + plaza.err));
  check('(5) plaza: buildSpawns 末尾の bossKey==="griffon" (牙貨は tier式で自動整合)',
    plaza.ok && plaza.bossKey === 'griffon' && plaza.anyGriffon,
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
  if (!grifSeen) console.log('[driver] note: .enemy-griffon の待機がタイムアウト');
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
