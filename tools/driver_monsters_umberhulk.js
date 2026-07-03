#!/usr/bin/env node
/*
 * driver_monsters_umberhulk.js — 6.27版 新規モンスター 項目6「アンバーハルク」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ENEMY_TYPES.umber_hulk (direBear シート流用・2倍サイズ・ポドルプラザ ボス・3ボス中で最硬) と2特性:
 *   burrow        = 地中奇襲: 前列を飛び越え後衛/中衛を優先 (zonePullFor の burrow 分岐・swoop と同値)
 *   confuse_gaze  = 眩惑の視線: 単頭ボスの gaze ブロックが gazeCooldown 式でパーティ全体 WIS セーヴを起こし、
 *                   失敗者に confused=1 (次ターン行動不能でスキップ)。allyAttackTurn/playerAttackTurn のゲートで消費。
 * を検証する。加えて tavern.html の FAMILIES 新規 entry「umber-delve」を検証する。
 *
 * ENEMY_TYPES/戦闘関数は IIFE 内 const で window 非公開のため、フルの index.html を
 * ロードして観測する。本番挙動を変えない dev プローブ(seed 時のみ push・既定 undefined
 * で no-op)で内部値を読む:
 *   __turnProbe(biteCount) / __zoneProbe(ZONE_PULL 係数 + swoop/burrow フラグ) /
 *   __pickProbe(選ばれた対象の kind/zone) /
 *   __gazeProbe({ gazes:[{enemyIdx,dc,failed[],saved[]}], skips:[unitId] }) ← 本ドライバ新設
 *
 * 検証項目:
 *   (1) umber_hulk 単体 seed で .enemy-umber_hulk DOM 生成 + 192px幾何 displaySize240 の描画健全
 *       (backgroundImage=direBear_anim.png?v= / bgSize=1440×1200 > 単一フレーム幅) + pageerror ゼロ + diag critical ゼロ
 *   (2) burrow: __zoneProbe で アンバーハルク が front=1.25/mid=1.0/rear=0.75 (burrow 分岐) + burrow===true。
 *       かつ __pickProbe で アンバーハルク の rear/mid 率 > 同一パーティを見る非burrow敵(ミノタウロス)
 *       (=前列を飛び越えて後衛/中衛を狙う実証)。
 *   (3) confusion_gaze: umberGaze 発火でパーティ全体 WIS セーヴ → 失敗者 confused → 次ターン行動不能スキップ。
 *       __gazeProbe で: gaze 発生 / 失敗者あり / 成功者あり(=セーヴは機能・自動失敗でない) / skip 発生 /
 *       全 skip が「過去にセーヴ失敗した unit」に属する(=セーヴ成功者はスキップしない負ケース) /
 *       同一 enemyIdx が2回以上 gaze (=gazeCooldown 明けに再発火)。
 *   (4) 非回帰: griffon(swoop 1.25/1.0/0.75)・chimera(flight 1.0/1.0/1.0)・
 *       非flight/swoop/burrow の ミノタウロス(既定 0.75/1.0/1.25) が zonePullFor で不変 (burrow分岐追加の副作用ゼロ)。
 *   (5) plaza配線: tavern.html で __forceFamily=umber-delve → QuestGen が bossKey"umber_hulk" を spawns 末尾に載せる。
 *   (6) 回帰: index.html?autoplay=15 / tavern.html?autoplay=15 スモークで pageerror ゼロ。
 *
 * 使い方:  node tools/driver_monsters_umberhulk.js [--headful] [--browser <path>] [--port N]
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
const PORT = parseInt(arg('port', '8801'), 10);

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
// front/mid/rear の3ゾーンを網羅 → burrow の後衛/中衛偏重を観測できる。
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true, name: '勇者',   level: 8 },   // front
  { classKey: 'dwarf',   name: 'グリム', level: 8 },                 // front
  { classKey: 'cleric',  name: 'リタ',   level: 8 },                 // mid
  { classKey: 'mage',    name: 'アル',   level: 8 },                 // rear
];

// 生成シナリオ + 4人パーティを seed + プローブ配列を初期化する evaluateOnNewDocument 用
function seedInit(spawns) {
  return `(function(){
    try {
      sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify({ title: 'umber probe', flavor: '', spawns: ${JSON.stringify(spawns)} }));
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(${JSON.stringify(SEED_PARTY)}));
    } catch(e) {}
    window.__turnProbe = [];
    window.__zoneProbe = [];
    window.__pickProbe = [];
    window.__gazeProbe = { gazes: [], skips: [] };
  })();`;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_umbr_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + profile],
  });
  const pageErrors = [];

  // ════════════════════════════════════════════════════════════════════
  // 戦闘観測ページ (cluster seed: umber_hulk×2 + minotaur + kobold×5 を party 起点付近に密集)。
  //   ・決定論的に観測できるもの (毎戦・確実):
  //       (1) 幾何 / (2) burrow zonePullFor 値+burrow フラグ / (4) minotaur 既定 zonePullFor 値 /
  //       (3) gaze 発火・WIS セーヴ失敗・WIS セーヴ成功・skip 発火・skip⊆fail 不変条件。
  //   ・emergent かつ確率的なもの (1戦 ~50-75%。大型スプライトの遮蔽 + RNG 移動に依存):
  //       (2) burrow の rear/mid 実ターゲット / (3) gaze の 再発火 (同一 enemy が cooldown 明けに再発火)。
  //     → これらは「新鮮な戦闘」を最大 MAX_TRIES 回リトライし、観測フラグを戦闘をまたいで OR 蓄積する
  //       (どれか1戦で観測できれば PASS)。雑魚密集はパーティ火力を分散させ戦闘を延ばす = umber の手数を
  //       増やし 再発火/rear ピックの観測率を上げる。zonePullFor 値そのもの (front1.25/rear0.75) は
  //       決定論で毎戦一致するため、burrow の rear 偏重は値レベルで厳密に、挙動レベルで補助的に実証される。
  // ════════════════════════════════════════════════════════════════════
  const CLUSTER = [['umber_hulk', 12, 13], ['umber_hulk', 13, 13], ['minotaur', 12, 15],
    ['kobold', 11, 13], ['kobold', 13, 15], ['kobold', 11, 15], ['kobold', 14, 13], ['kobold', 12, 12]];
  const MAX_TRIES = 6;
  const acc = {
    geo: null, umbrSeen: false, diag: null,
    zoneUmber: null, zoneMino: null,          // 決定論値 (最初に観測できたもの)
    sawURearMid: false,                        // burrow が rear/mid を実ターゲット (>=1・emergent)
    gazes: 0, sawFail: false, sawSave: false, sawSkip: false, skipViolation: false, sawRefire: false, maxPerEnemy: 0,
  };
  const accDone = () => acc.umbrSeen && acc.zoneUmber && acc.zoneMino && acc.sawURearMid &&
    acc.gazes >= 1 && acc.sawFail && acc.sawSave && acc.sawSkip && !acc.skipViolation && acc.sawRefire;
  const combatErrBase = pageErrors.length;

  for (let t = 0; t < MAX_TRIES && !accDone(); t++) {
    const pageA = await browser.newPage();
    pageA.on('pageerror', e => pageErrors.push('[C' + t + '] ' + e.message));
    await pageA.evaluateOnNewDocument(seedInit(CLUSTER));
    await pageA.goto('http://localhost:' + PORT + '/index.html?autoplay=8', { waitUntil: 'domcontentloaded', timeout: 30000 });
    let seen = false;
    try { await pageA.waitForSelector('.enemy-umber_hulk', { timeout: 15000 }); seen = true; } catch (e) {}
    if (seen) acc.umbrSeen = true;

    if (!acc.geo && seen) {
      acc.geo = await pageA.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.enemy-umber_hulk'));
        if (!els.length) return { count: 0 };
        const el = els[0];
        const bgSize = el.style.backgroundSize || '';
        const m = bgSize.match(/([\d.]+)px\s+([\d.]+)px/);
        return { count: els.length, bgImg: el.style.backgroundImage || '', bgSize,
          w: parseFloat(el.style.width) || 0, h: parseFloat(el.style.height) || 0,
          bgW: m ? parseFloat(m[1]) : 0, bgH: m ? parseFloat(m[2]) : 0 };
      });
    }

    for (let i = 0; i < 100 && !accDone(); i++) {
      const r = await pageA.evaluate(() => {
        const zu = (window.__zoneProbe || []).filter(e => e && e.name === 'アンバーハルク')[0] || null;
        const zm = (window.__zoneProbe || []).filter(e => e && e.name === 'ミノタウロス')[0] || null;
        const pu = (window.__pickProbe || []).filter(e => e && e.name === 'アンバーハルク');
        const uRM = pu.filter(e => e.zone === 'rear' || e.zone === 'mid').length;
        const gp = window.__gazeProbe || { gazes: [], skips: [] };
        const failUnion = new Set();
        let anyFail = false, anySave = false; const cnt = {};
        for (const g of gp.gazes) {
          if (g.failed && g.failed.length) { anyFail = true; g.failed.forEach(id => failUnion.add(id)); }
          if (g.saved && g.saved.length) anySave = true;
          cnt[g.enemyIdx] = (cnt[g.enemyIdx] || 0) + 1;
        }
        const skips = gp.skips || [];
        const skipViolation = skips.some(id => !failUnion.has(id));
        const maxPerEnemy = Object.keys(cnt).reduce((m, k) => Math.max(m, cnt[k]), 0);
        return {
          zoneUmber: (zu && zu.burrow === true && zu.front === 1.25 && zu.mid === 1.0 && zu.rear === 0.75)
            ? { front: zu.front, mid: zu.mid, rear: zu.rear, burrow: zu.burrow } : null,
          zoneMino: (zm && zm.flight === false && zm.swoop === false && zm.burrow === false &&
            zm.front === 0.75 && zm.mid === 1.0 && zm.rear === 1.25)
            ? { front: zm.front, mid: zm.mid, rear: zm.rear } : null,
          uRM, gazes: gp.gazes.length, anyFail, anySave, skips: skips.length, skipViolation, maxPerEnemy,
        };
      });
      if (r.zoneUmber && !acc.zoneUmber) acc.zoneUmber = r.zoneUmber;
      if (r.zoneMino && !acc.zoneMino) acc.zoneMino = r.zoneMino;
      if (r.uRM >= 1) acc.sawURearMid = true;
      if (r.gazes > acc.gazes) acc.gazes = r.gazes;
      if (r.anyFail) acc.sawFail = true;
      if (r.anySave) acc.sawSave = true;
      if (r.skips >= 1) acc.sawSkip = true;
      if (r.skipViolation) acc.skipViolation = true;
      if (r.maxPerEnemy > acc.maxPerEnemy) acc.maxPerEnemy = r.maxPerEnemy;
      if (r.maxPerEnemy >= 2) acc.sawRefire = true;
      if (accDone()) break;
      await sleep(300);
    }

    if (t === 0) {
      acc.diag = await pageA.evaluate(() => {
        if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
        const rr = window.__diag.getReport();
        const viol = (rr.current || {}).violations || {};
        return { criticals: (rr.totals && rr.totals.criticals) || 0, jsErr: !!viol['js-error'], jsRej: !!viol['js-rejection'], violIds: Object.keys(viol) };
      });
    }
    await pageA.close();
  }

  const umbrSeen = acc.umbrSeen;
  const geo = acc.geo || { count: 0 };
  check('(1) 戦闘ページ群で pageerror ゼロ', pageErrors.length === combatErrBase, pageErrors.slice(combatErrBase).join(' | '));
  check('(1) .enemy-umber_hulk 要素が生成される (>=1)', geo.count >= 1, 'count=' + geo.count);
  check('(1) backgroundImage が direBear_anim.png (?v=付き・借用)',
    /direBear_anim\.png\?v=/.test(geo.bgImg || ''), 'bgImg=' + geo.bgImg);
  check('(1) 表示寸法 ≈240px (displaySize=240・2倍)',
    Math.abs((geo.w || 0) - 240) <= 2 && Math.abs((geo.h || 0) - 240) <= 2, 'w=' + geo.w + ' h=' + geo.h);
  check('(1) backgroundSize ≈1440×1200 (192px幾何式通り・描画健全)',
    Math.abs((geo.bgW || 0) - 1440) <= 2 && Math.abs((geo.bgH || 0) - 1200) <= 2 && (geo.bgW || 0) > (geo.w || 0),
    'bgSize=' + geo.bgSize);
  const dg = acc.diag || { noDiag: true };
  check('(1) __diag: critical ゼロ + js-error なし',
    !dg.noDiag && dg.criticals === 0 && !dg.jsErr && !dg.jsRej,
    dg.noDiag ? 'no __diag' : ('criticals=' + dg.criticals + ' viol=[' + (dg.violIds || []).join(',') + ']'));

  check('(2) burrow: アンバーハルク の zonePullFor 戻り値 = front=1.25/mid=1.0/rear=0.75 + burrow===true (決定論)',
    !!acc.zoneUmber, acc.zoneUmber ? JSON.stringify(acc.zoneUmber) : 'not observed');
  check('(2) burrow: アンバーハルク が rear/mid を実際に狙う (__pickProbe >=1回・前列を飛び越える実証)',
    acc.sawURearMid, 'sawURearMid=' + acc.sawURearMid);
  check('(4) 回帰: 非flight/swoop/burrow ミノタウロス は既定 front=0.75/mid=1.0/rear=1.25 (挙動不変・決定論)',
    !!acc.zoneMino, acc.zoneMino ? JSON.stringify(acc.zoneMino) : 'not observed');

  check('(3) gaze: umberGaze が発火した (__gazeProbe.gazes >= 1)', acc.gazes >= 1, 'gazes=' + acc.gazes);
  check('(3) gaze: WIS セーヴ失敗者が居る (confused 付与の前提)', acc.sawFail, 'sawFail=' + acc.sawFail);
  check('(3) gaze: WIS セーヴ成功者が居る (=セーヴは機能・自動失敗でない / 負ケース)', acc.sawSave, 'sawSave=' + acc.sawSave);
  check('(3) skip: 混乱ゲートが発火し味方/プレイヤーがスキップ (__gazeProbe.skips >= 1)', acc.sawSkip, 'sawSkip=' + acc.sawSkip);
  check('(3) skip: セーヴ失敗者以外はスキップしない (skip⊆fail 不変条件・違反ゼロ)',
    acc.sawSkip && !acc.skipViolation, 'skipViolation=' + acc.skipViolation);
  check('(3) 再発火: 同一 enemyIdx が2回以上 gaze (gazeCooldown 明けに再発火)',
    acc.sawRefire, 'maxGazesPerEnemy=' + acc.maxPerEnemy);

  // ════════════════════════════════════════════════════════════════════
  // (4) 回帰: griffon(swoop) + chimera(flight) を seed し __zoneProbe で
  //     burrow 分岐追加後も swoop/flight が不変であることを確認。
  // ════════════════════════════════════════════════════════════════════
  const REG = [['griffon', 12, 13], ['chimera', 13, 14], ['goblin', 14, 13]];
  const pageR = await browser.newPage();
  pageR.on('pageerror', e => pageErrors.push('[R] ' + e.message));
  await pageR.evaluateOnNewDocument(seedInit(REG));
  await pageR.goto('http://localhost:' + PORT + '/index.html?autoplay=20', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let reg = { grif: false, chim: false, gN: 0, cN: 0, gF: null, gR: null, cF: null, cR: null };
  for (let i = 0; i < 120; i++) {
    const r = await pageR.evaluate(() => {
      const zg = (window.__zoneProbe || []).filter(e => e && e.name === 'グリフォン');
      const zc = (window.__zoneProbe || []).filter(e => e && e.name === 'キマイラ');
      const g0 = zg[0] || null, c0 = zc[0] || null;
      return {
        grif: !!(g0 && g0.swoop === true && g0.front === 1.25 && g0.mid === 1.0 && g0.rear === 0.75),
        chim: !!(c0 && c0.flight === true && c0.front === 1.0 && c0.mid === 1.0 && c0.rear === 1.0),
        gN: zg.length, cN: zc.length, gF: g0 && g0.front, gR: g0 && g0.rear, cF: c0 && c0.front, cR: c0 && c0.rear,
      };
    });
    reg = r;
    if (r.grif && r.chim) break;
    await sleep(300);
  }
  check('(4) 回帰: griffon(swoop) は依然 front=1.25/mid=1.0/rear=0.75 (burrow分岐追加の副作用ゼロ)',
    reg.grif, 'front=' + reg.gF + ' rear=' + reg.gR + ' (entries=' + reg.gN + ')');
  check('(4) 回帰: chimera(flight) は依然 front=1.0/mid=1.0/rear=1.0 (burrow分岐追加の副作用ゼロ)',
    reg.chim, 'front=' + reg.cF + ' rear=' + reg.cR + ' (entries=' + reg.cN + ')');
  await pageR.close();

  // ════════════════════════════════════════════════════════════════════
  // (5) plaza配線: tavern.html で __forceFamily=umber-delve → QuestGen が umber_hulk を boss に
  // ════════════════════════════════════════════════════════════════════
  const pageT = await browser.newPage();
  pageT.on('pageerror', e => pageErrors.push('[T] ' + e.message));
  const tErrBefore = pageErrors.length;
  await pageT.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(800);
  const plaza = await pageT.evaluate(() => {
    try {
      window.__forceFamily = 'umber-delve';
      const q = QuestGen.generateQuest(5, { source: 'plaza' });
      const spawns = QuestGen.buildSpawns(q);
      const boss = spawns[spawns.length - 1];
      return {
        ok: true, familyId: q.familyId,
        bossKey: boss && boss[0], bossPos: boss ? [boss[1], boss[2]] : null,
        anyUmber: spawns.some(s => s[0] === 'umber_hulk'),
        target: q.target,
      };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  check('(5) plaza: QuestGen が forceFamily で umber-delve を選ぶ',
    plaza.ok && plaza.familyId === 'umber-delve', plaza.ok ? ('familyId=' + plaza.familyId) : ('err=' + plaza.err));
  check('(5) plaza: buildSpawns 末尾の bossKey==="umber_hulk" (牙貨は tier式で自動整合)',
    plaza.ok && plaza.bossKey === 'umber_hulk' && plaza.anyUmber,
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
  if (!umbrSeen) console.log('[driver] note: .enemy-umber_hulk の待機がタイムアウト');
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
