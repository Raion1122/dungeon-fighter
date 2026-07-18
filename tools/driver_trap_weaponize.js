#!/usr/bin/env node
/*
 * driver_trap_weaponize.js — Phase 2 罠武器化(rearmed・敵専用) の検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * index.html 単独の「解除が特大成功なら罠を敵側へ付け替える」機構を検証する。
 * メモリ「ゲーム変更のヘッドレス検証手順」準拠: 実 Chrome を puppeteer-core でヘッドレス
 * 直駆動 (--no-sandbox + 毎回新規プロファイル)。http サーバ経由で index.html を読み、
 * ゲーム内関数/グローバルを bare 参照で叩く (top-level scope = window プロパティ)。
 *
 * 検証項目 (すべて対照群付き):
 *   (W1) parseDice / TRAP_TYPES / showWeaponizeFloat / triggerTrapOnEnemy が定義済み。
 *        TRAP_TYPES.damage = {damageDice:1d6, weaponizeDice:2d6, disarmXP:25}。parseDice('2d6')∈[2,12]。
 *   (W2) 特大成功=crit → rearmed=true / owner='party' / disarmed=false / triggered=false / .rearmed / XP+25 / _disarmRolled
 *   (W3) 特大成功=total≧DC+5(非crit) → 同上 rearmed
 *   (W4) 通常成功=total∈[DC,DC+4] → disarmed=true / rearmed=false / .disarmed / XP+25 (境界: DC+4=disarm ↔ DC+5=rearm)
 *   (W5) checkTrapTrigger 敵ループ: rearmed罠タイルに敵 → triggerTrapOnEnemy発火 (hp減・triggered=true・非致死は生存)
 *   (W6) 敵専用/FF無し: rearmed罠タイルに player+ally を置いても不発 (ttp=0/tta=0/hp不変) ↔ 対照(同タイルに敵)は発火
 *   (W7) 決定論: rearmed罠に敵ゼロ→checkTrapTrigger は Math.random 増分0 ↔ 対照(敵あり)は増分>0
 *   (W8) defeatEnemy副作用: 致死武器化 → defeatEnemy(idx)呼出 / alive=false / __diagDead / XP += def.xp
 *   (W9) pageerror 0
 *
 * 使い方:  node tools/driver_trap_weaponize.js [--headful] [--browser <path>] [--port N]
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
const PORT = parseInt(arg('port', '8795'), 10);

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
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome が見つかりません。--browser <path> で指定してください。');
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
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = path.join(os.tmpdir(), 'df_pptr_profile_' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine'); } catch (e) {}
  });
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof applyDisarmResult === 'function' && typeof checkTrapTrigger === 'function'
       && typeof parseDice === 'function' && typeof triggerTrapOnEnemy === 'function'
       && typeof createEnemy === 'function' && typeof ENEMY_TYPES !== 'undefined',
    { timeout: 20000 });
  mark('index.html booted, weaponize fns present');

  // ライブ game loop が evaluate 間で hero/enemy を動かし注入配置が崩れる race を封じる:
  //   rAF 凍結 + 各テスト冒頭で環境を同期リセット (bare 参照でゲームの global へ書く)。
  await page.evaluate(() => {
    window.requestAnimationFrame = function () { return 0; };
    // 検証用の非boss grunt 型キーを1つ確定 (createEnemy 用)。実 def を使うので defeatEnemy の drop fn も安全。
    window.__twType = (function () {
      if (typeof enemies !== 'undefined' && enemies.length && enemies[0].type) return enemies[0].type;
      const keys = Object.keys(ENEMY_TYPES);
      for (const k of keys) { const d = ENEMY_TYPES[k]; if (d && !d.boss && !d.isBoss && !d.multiHead) return k; }
      return keys[0];
    })();
    window.__twReset = function () {
      gameStarted = true; gameOver = false;
      encounterActive = false; encounterRunning = false;
      skillCheckActive = false; dialogPaused = false;
      camX = 0; camY = 0;
      playerX = 0; playerY = 0;   // 既定はタイル(0,0)=罠から離す (テストが必要なら上書き)
      hp = 30;
      traps.length = 0;
    };
    // 罠タイル(6,13)に rearmed(敵専用)罠を1つ注入して返す
    window.__twAddRearmed = function () {
      const el = document.createElement('div'); el.className = 'trap found rearmed';
      const t = { tx: 6, ty: 13, type: 'damage', found: true, triggered: false,
                  disarmed: false, rearmed: true, owner: 'party', _disarmRolled: true, el };
      traps.push(t); return t;
    };
    // enemies を制御下に置く (実敵を退避し、createEnemy で(6,13)中央に1体だけ立てる)
    window.__twSoloEnemyAt6_13 = function (hpVal) {
      enemies.length = 0;
      const en = createEnemy(window.__twType, 6, 13);   // 中央 = tx*96+48 → floor→(6,13)
      en.alive = true; en.hp = hpVal; if (hpVal > (en.maxHp || 0)) en.maxHp = hpVal;
      en.__diagDead = false;
      enemies.push(en);
      return en;
    };
  });

  // (W1) 定義 + テーブル値 + parseDice レンジ
  const w1 = await page.evaluate(() => {
    const tt = (typeof TRAP_TYPES !== 'undefined') ? TRAP_TYPES : null;
    const d = tt && tt.damage;
    let lo = 99, hi = -1, badLen = 0;
    for (let i = 0; i < 200; i++) { const r = parseDice('2d6'); if (r.rolls.length !== 2) badLen++; lo = Math.min(lo, r.total); hi = Math.max(hi, r.total); }
    return {
      parseDice: typeof parseDice, tte: typeof triggerTrapOnEnemy, wf: typeof showWeaponizeFloat,
      ttType: typeof tt, damageDice: d && d.damageDice, weaponizeDice: d && d.weaponizeDice, disarmXP: d && d.disarmXP,
      lo, hi, badLen,
    };
  });
  check('(W1) parseDice 定義', w1.parseDice === 'function', w1.parseDice);
  check('(W1) triggerTrapOnEnemy 定義', w1.tte === 'function', w1.tte);
  check('(W1) showWeaponizeFloat 定義', w1.wf === 'function', w1.wf);
  check('(W1) TRAP_TYPES はテーブル', w1.ttType === 'object', w1.ttType);
  check('(W1) TRAP_TYPES.damage.damageDice=1d6', w1.damageDice === '1d6', String(w1.damageDice));
  check('(W1) TRAP_TYPES.damage.weaponizeDice=2d6', w1.weaponizeDice === '2d6', String(w1.weaponizeDice));
  check('(W1) TRAP_TYPES.damage.disarmXP=25', w1.disarmXP === 25, String(w1.disarmXP));
  check('(W1) parseDice("2d6") ∈ [2,12] かつ 2ダイス', w1.lo >= 2 && w1.hi <= 12 && w1.badLen === 0, `lo=${w1.lo} hi=${w1.hi} badLen=${w1.badLen}`);
  mark('defs + TRAP_TYPES + parseDice verified');

  // applyDisarmResult 直叩きヘルパ (リセット→罠注入→適用→状態返却)
  async function applyRes(res) {
    return page.evaluate((r) => {
      __twReset();
      const el = document.createElement('div'); el.className = 'trap found';
      const t = { tx: 6, ty: 13, type: 'damage', damageDice: '1d6', found: true, triggered: false,
                  disarmed: false, rearmed: false, owner: null, _disarmRolled: false, el };
      traps.push(t);
      const xpBefore = currentTotalXp;
      applyDisarmResult(r, t);
      return {
        disarmed: t.disarmed, rearmed: t.rearmed, owner: t.owner, triggered: t.triggered, rolled: t._disarmRolled,
        clsRearmed: el.classList.contains('rearmed'), clsDisarmed: el.classList.contains('disarmed'),
        xpDelta: currentTotalXp - xpBefore,
      };
    }, res);
  }
  const REP = { name: 'リーザ' };

  // (W2) 特大成功 = crit (total は DC+5 未満でも crit なら武器化)
  const w2 = await applyRes({ success: true, crit: true, fumble: false, total: 12, dc: 11, rep: REP });
  check('(W2) crit: rearmed=true', w2.rearmed === true, JSON.stringify(w2));
  check('(W2) crit: owner="party" (敵専用)', w2.owner === 'party', String(w2.owner));
  check('(W2) crit: disarmed=false (別終端状態)', w2.disarmed === false);
  check('(W2) crit: triggered=false (この場では起爆しない)', w2.triggered === false);
  check('(W2) crit: .rearmed クラス付与', w2.clsRearmed === true);
  check('(W2) crit: XP+25 (二重付与なし)', w2.xpDelta === 25, 'delta=' + w2.xpDelta);
  check('(W2) crit: _disarmRolled=true', w2.rolled === true);

  // (W3) 特大成功 = total ≧ DC+5 (非crit)
  const w3 = await applyRes({ success: true, crit: false, fumble: false, total: 16, dc: 11, rep: REP });
  check('(W3) total=DC+5(16≥16): rearmed=true', w3.rearmed === true, JSON.stringify(w3));
  check('(W3) total=DC+5: owner="party"', w3.owner === 'party');
  check('(W3) total=DC+5: disarmed=false', w3.disarmed === false);
  check('(W3) total=DC+5: XP+25', w3.xpDelta === 25, 'delta=' + w3.xpDelta);

  // (W4) 境界: 通常成功 total∈[DC,DC+4] は無害化(disarmed) — 対照
  const w4 = await applyRes({ success: true, crit: false, fumble: false, total: 15, dc: 11, rep: REP });
  check('(W4) total=DC+4(15<16): disarmed=true (武器化しない)', w4.disarmed === true, JSON.stringify(w4));
  check('(W4) total=DC+4: rearmed=false', w4.rearmed === false);
  check('(W4) total=DC+4: owner=null', w4.owner === null);
  check('(W4) total=DC+4: .disarmed クラス', w4.clsDisarmed === true);
  check('(W4) total=DC+4: XP+25 (二重付与なし)', w4.xpDelta === 25, 'delta=' + w4.xpDelta);
  mark('applyDisarmResult 武器化/通常成功 分岐 verified (crit・DC+5=rearm ↔ DC+4=disarm)');

  // (W5) checkTrapTrigger 敵ループ: rearmed罠タイルに非致死の敵 → 武器化発火
  const w5 = await page.evaluate(() => {
    __twReset();
    if (typeof allies !== 'undefined') allies.length = 0;   // 味方を排除 (敵専用ロジックのみ検証)
    const en = __twSoloEnemyAt6_13(100);   // 十分な HP = 非致死
    __twAddRearmed();
    const hpBefore = en.hp;
    checkTrapTrigger();
    return { hpBefore, hpAfter: en.hp, dmg: hpBefore - en.hp, triggered: traps[0].triggered, alive: en.alive };
  });
  check('(W5) 敵が rearmed 罠に乗る → 発火 (triggered=true)', w5.triggered === true, JSON.stringify(w5));
  check('(W5) 敵 HP 減少 (2d6 ∈ [2,12])', w5.dmg >= 2 && w5.dmg <= 12, 'dmg=' + w5.dmg);
  check('(W5) 非致死なので敵は生存', w5.alive === true);
  mark('enemy-loop weaponize fire verified');

  // (W6) 敵専用 / フレンドリーファイア無し ↔ 対照(敵)
  const w6 = await page.evaluate(() => {
    // ---- (a) player + ally を rearmed 罠タイルに置く / 敵ゼロ → 不発 ----
    __twReset();
    enemies.length = 0;   // 敵ゼロ
    window.__ttp = 0; const oP = window.triggerTrapOnPlayer;
    window.triggerTrapOnPlayer = function (t) { window.__ttp++; return oP(t); };
    window.__tta = 0; const oA = window.triggerTrapOnAlly;
    const aSpyable = typeof oA === 'function';
    if (aSpyable) window.triggerTrapOnAlly = function (t, a) { window.__tta++; return oA(t, a); };
    let savedAllies = [];
    if (typeof allies !== 'undefined') { savedAllies = allies.slice(); allies.length = 0;
      allies.push({ alive: true, x: 6 * 96, y: 13 * 96, hp: 20, buffs: {}, equippedSkills: [],
                    def: { displaySize: 96, name: 'テスト仲間' } }); }
    playerX = 6 * 96; playerY = 13 * 96;   // player 中心 (6*96+48,13*96+58) → タイル(6,13)
    __twAddRearmed();
    const hpBefore = hp; const allyHpBefore = (typeof allies !== 'undefined' && allies[0]) ? allies[0].hp : 0;
    checkTrapTrigger();
    const a = { ttp: window.__ttp, tta: window.__tta, aSpyable, triggered: traps[0].triggered,
                hpDelta: hp - hpBefore, allyHpDelta: (typeof allies !== 'undefined' && allies[0]) ? allies[0].hp - allyHpBefore : 0 };
    window.triggerTrapOnPlayer = oP; if (aSpyable) window.triggerTrapOnAlly = oA;

    // ---- (b) 対照: 同じ rearmed 罠タイルに player も居るが、敵も居る → 敵にだけ発火 ----
    __twReset();
    if (typeof allies !== 'undefined') allies.length = 0;   // (a) の合成 ally を除去 (敵発火時の updateInfo→renderPartyStatuses が触るため)
    playerX = 6 * 96; playerY = 13 * 96;   // player も同タイル (FF せぬことの証明)
    window.__ttp2 = 0; const oP2 = window.triggerTrapOnPlayer;
    window.triggerTrapOnPlayer = function (t) { window.__ttp2++; return oP2(t); };
    const en = __twSoloEnemyAt6_13(100);   // 非致死
    __twAddRearmed();
    const enHpBefore = en.hp;
    checkTrapTrigger();
    const b = { ttp: window.__ttp2, triggered: traps[0].triggered, enemyHit: enHpBefore - en.hp };
    window.triggerTrapOnPlayer = oP2;

    if (typeof allies !== 'undefined') { allies.length = 0; for (const x of savedAllies) allies.push(x); }
    return { a, b };
  });
  check('(W6a) 味方のみ: triggerTrapOnPlayer 未呼出 (FF無し)', w6.a.ttp === 0, 'ttp=' + w6.a.ttp);
  check('(W6a) 味方のみ: triggerTrapOnAlly 未呼出 (FF無し)', w6.a.tta === 0, 'tta=' + w6.a.tta + ' spyable=' + w6.a.aSpyable);
  check('(W6a) 味方のみ: 罠は不発 (triggered=false)', w6.a.triggered === false);
  check('(W6a) 味方のみ: player HP 不変', w6.a.hpDelta === 0, 'hpDelta=' + w6.a.hpDelta);
  check('(W6a) 味方のみ: ally HP 不変', w6.a.allyHpDelta === 0, 'allyHpDelta=' + w6.a.allyHpDelta);
  check('(W6b-対照) player 同タイル + 敵 → 敵にだけ発火 (triggered=true)', w6.b.triggered === true, JSON.stringify(w6.b));
  check('(W6b-対照) player 同タイルでも triggerTrapOnPlayer 未呼出', w6.b.ttp === 0, 'ttp=' + w6.b.ttp);
  check('(W6b-対照) 敵 HP は減少', w6.b.enemyHit >= 2 && w6.b.enemyHit <= 12, 'hit=' + w6.b.enemyHit);
  mark('enemy-only (no friendly-fire) verified with control');

  // (W7) 決定論: 敵ゼロで RNG 不消費 ↔ 敵ありで消費
  const w7 = await page.evaluate(() => {
    const orig = Math.random;
    // (a) 敵ゼロ
    __twReset(); enemies.length = 0; if (typeof allies !== 'undefined') allies.length = 0;
    __twAddRearmed();
    let c1 = 0; Math.random = function () { c1++; return orig(); };
    checkTrapTrigger();
    Math.random = orig;
    const noEnemy = c1;
    // (b) 敵あり (非致死 = defeatEnemy の drop RNG を混ぜない)
    __twReset(); if (typeof allies !== 'undefined') allies.length = 0;
    __twSoloEnemyAt6_13(100);
    __twAddRearmed();
    let c2 = 0; Math.random = function () { c2++; return orig(); };
    checkTrapTrigger();
    Math.random = orig;
    return { noEnemy, withEnemy: c2 };
  });
  check('(W7) 敵ゼロ: checkTrapTrigger は Math.random を引かない (増分0)', w7.noEnemy === 0, 'count=' + w7.noEnemy);
  check('(W7-対照) 敵あり: Math.random を引く (2d6=2回)', w7.withEnemy >= 2, 'count=' + w7.withEnemy);
  mark('determinism (no-RNG-without-enemy) verified with control');

  // (W8) defeatEnemy 副作用: 致死武器化で XP/撃破処理が回る
  const w8 = await page.evaluate(() => {
    __twReset(); if (typeof allies !== 'undefined') allies.length = 0;
    const en = __twSoloEnemyAt6_13(1);   // HP1 = 2d6 で確実に致死
    const defXp = (en.def && en.def.xp) || 0;
    window.__de = -1; const oDE = window.defeatEnemy;
    const deSpyable = typeof oDE === 'function';
    if (deSpyable) window.defeatEnemy = function (i) { window.__de = i; return oDE(i); };
    __twAddRearmed();
    const xpBefore = currentTotalXp;
    checkTrapTrigger();
    if (deSpyable) window.defeatEnemy = oDE;
    return { alive: en.alive, hp: en.hp, diagDead: en.__diagDead, xpDelta: currentTotalXp - xpBefore,
             defXp, deIdx: window.__de, deSpyable, triggered: traps[0].triggered };
  });
  check('(W8) 致死武器化: triggered=true', w8.triggered === true, JSON.stringify(w8));
  check('(W8) 致死武器化: enemy.alive=false', w8.alive === false);
  check('(W8) 致死武器化: defeatEnemy(idx=0) 呼出', w8.deIdx === 0, 'deIdx=' + w8.deIdx + ' spyable=' + w8.deSpyable);
  check('(W8) defeatEnemy副作用: __diagDead=true (撃破確定マーカー)', w8.diagDead === true);
  check('(W8) defeatEnemy副作用: XP += def.xp (' + w8.defXp + ')', w8.xpDelta === w8.defXp && w8.defXp > 0, 'xpDelta=' + w8.xpDelta + ' defXp=' + w8.defXp);
  mark('defeatEnemy side-effects on non-attack kill verified');

  // (W9) pageerror 0
  check('(W9) 全操作で pageerror 0', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
