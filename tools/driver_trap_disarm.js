#!/usr/bin/env node
/*
 * driver_trap_disarm.js — Phase 1 罠解除(disarm)コア の回帰ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * index.html 単独の罠解除 MVP を検証する。メモリ「ゲーム変更のヘッドレス検証手順」準拠:
 *   実 Chrome を puppeteer-core でヘッドレス直駆動 (--no-sandbox + 毎回新規プロファイル)。
 *   http サーバ経由で index.html を読み、ゲーム内関数/グローバルを bare 参照で叩く。
 *
 * 検証項目:
 *   (1) disarmDC/runTrapDisarmCheck/applyDisarmResult/showDisarmFloat が定義済み
 *   (2) disarmDC() クランプ: pDC12→11 / 14→12 / 15→13(=chestLockDC-1) / 20→16 / 11→11(floor)
 *   (3) spawnTraps の trap リテラルに disarmed/rearmed/owner/_disarmRolled が載っている(源泉)
 *   (4) 決定論: 対象罠が無ければ resolveSkillCheck を一切呼ばない(RNG不消費)
 *       ↔ 対照群: 隣接 found 罠が有れば呼ぶ
 *   (5) 成功 → disarmed=true / .disarmed クラス付与 / XP+25 / triggered のまま false
 *   (6) クリ成功 → disarmed=true
 *   (7) 通常失敗 → 起爆させない(triggered=false・found維持・hp不変)・_disarmRolled=true
 *       ↔ 対照(8)
 *   (8) ファンブル → triggerTrapOnPlayer が呼ばれ triggered=true・hp減・spy count=1
 *   (9) 迂回(showChoice=false) → 判定を呼ばず _disarmRolled=true・disarmed=false
 *   (10) checkTrapTrigger の disarmed ガード: disarmed罠(found=false)を踏んでも無害
 *        ↔ 対照: 非disarmed罠(found=false)は踏むと起爆
 *   (11) index.html 読込〜全操作で pageerror 0
 *
 * 使い方:  node tools/driver_trap_disarm.js [--headful] [--browser <path>] [--port N]
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
const PORT = parseInt(arg('port', '8793'), 10);

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
    () => typeof disarmDC === 'function' && typeof runTrapDisarmCheck === 'function'
       && typeof applyDisarmResult === 'function' && typeof currentScenario !== 'undefined',
    { timeout: 20000 });
  mark('index.html booted, disarm fns present');

  // ライブ game loop (heroAI→heroSlide→runTrapDisarmCheck) が evaluate 間で hero を動かし
  // 注入した罠が隣接でなくなる race を封じる: rAF を凍結 + 各テスト冒頭で環境を同期リセット。
  await page.evaluate(() => {
    window.requestAnimationFrame = function () { return 0; };   // 凍結 (論理テストに描画不要)
    // 各テスト evaluate の冒頭で同期的に呼ぶ環境リセッタ (bare 参照でゲームの global へ書く)
    window.__tdReset = function () {
      gameStarted = true; gameOver = false;
      encounterActive = false; encounterRunning = false;
      skillCheckActive = false; dialogPaused = false;
      camX = 0; camY = 0;
      // プレイヤーはタイル(6,13)。floor((576+48)/96)=6, floor((1248+58)/96)=13
      playerX = 6 * 96; playerY = 13 * 96;
      hp = 30;
      traps.length = 0;
    };
  });

  // (1) 関数定義
  const defs = await page.evaluate(() => ({
    disarmDC: typeof disarmDC, run: typeof runTrapDisarmCheck,
    apply: typeof applyDisarmResult, float: typeof showDisarmFloat,
  }));
  check('(1) disarmDC 定義', defs.disarmDC === 'function', defs.disarmDC);
  check('(1) runTrapDisarmCheck 定義', defs.run === 'function', defs.run);
  check('(1) applyDisarmResult 定義', defs.apply === 'function', defs.apply);
  check('(1) showDisarmFloat 定義', defs.float === 'function', defs.float);

  // (2) disarmDC クランプ (currentScenario.perceptionDC を差し替えて確認)
  const dc = await page.evaluate(() => {
    const orig = currentScenario.perceptionDC;
    const at = (p) => { currentScenario.perceptionDC = p; return { d: disarmDC(), c: chestLockDC() }; };
    const r12 = at(12), r14 = at(14), r15 = at(15), r20 = at(20), r11 = at(11);
    currentScenario.perceptionDC = orig;
    return { r12, r14, r15, r20, r11 };
  });
  check('(2) pDC12 → disarmDC 11', dc.r12.d === 11, JSON.stringify(dc.r12));
  check('(2) pDC14 → disarmDC 12', dc.r14.d === 12, JSON.stringify(dc.r14));
  check('(2) pDC15 → disarmDC 13 (= chestLockDC-1)', dc.r15.d === 13 && dc.r15.d === dc.r15.c - 1, JSON.stringify(dc.r15));
  check('(2) pDC20 → disarmDC 16 (上限クランプ)', dc.r20.d === 16, JSON.stringify(dc.r20));
  check('(2) pDC11 → disarmDC 11 (下限クランプ)', dc.r11.d === 11, JSON.stringify(dc.r11));
  mark('disarmDC clamp verified');

  // (3) trap リテラル源泉に4フィールド
  const litFields = await page.evaluate(() => {
    const s = spawnTraps.toString();
    return ['disarmed', 'rearmed', 'owner', '_disarmRolled'].map(f => ({ f, has: s.indexOf(f) >= 0 }));
  });
  litFields.forEach(x => check('(3) spawnTraps リテラルに ' + x.f, x.has));


  // ── 統合テストランナー: リセット→stub差込→autoplay/choice→罠設置→runTrapDisarmCheck→アサート
  //    を「1 evaluate 内」で完結させ、evaluate 間の async gap(ライブ処理割り込み)を完全排除する。
  //    outcome: resolveSkillCheck の戻り値を固定。opts: { autoplay, choice(null=既定), trapTx, trapTy }
  async function runDisarm(outcome, opts) {
    opts = Object.assign({ autoplay: true, choice: null, trapTx: 6, trapTy: 13 }, opts || {});
    return page.evaluate(async (o, op) => {
      __tdReset();   // 同期リセット (flags/pos/traps)。この後 runTrapDisarmCheck まで await 無し
      SkillCheck.__origResolve = SkillCheck.__origResolve || SkillCheck.resolveSkillCheck;
      window.__scCalls = 0;
      SkillCheck.resolveSkillCheck = function () { window.__scCalls++; return Promise.resolve(o); };
      window.__autoplay = op.autoplay;   // showChoice の autoplay 即決 (true=はい/解除する)
      // showChoice 上書き (迂回テスト用に false を返す)
      let origChoice = null, choiceInterceptable = false;
      if (op.choice !== null) {
        choiceInterceptable = (typeof window.showChoice === 'function');
        origChoice = window.showChoice;
        if (choiceInterceptable) window.showChoice = function () { return Promise.resolve(op.choice); };
      }
      // triggerTrapOnPlayer を wrap-spy (元挙動を保ちつつ呼出回数を数える)
      window.__ttp = 0;
      const origTTP = window.triggerTrapOnPlayer;
      const ttpSpyable = (typeof origTTP === 'function');
      if (ttpSpyable) window.triggerTrapOnPlayer = function (t) { window.__ttp++; return origTTP(t); };

      const el = document.createElement('div'); el.className = 'trap found';
      const t = { tx: op.trapTx, ty: op.trapTy, type: 'damage', damageDice: '1d6',
                  found: true, triggered: false, disarmed: false, rearmed: false,
                  owner: null, _disarmRolled: false, el };
      traps.push(t);
      const xpBefore = currentTotalXp, hpBefore = hp;
      await runTrapDisarmCheck();

      if (ttpSpyable) window.triggerTrapOnPlayer = origTTP;
      if (op.choice !== null && choiceInterceptable) window.showChoice = origChoice;
      if (SkillCheck.__origResolve) SkillCheck.resolveSkillCheck = SkillCheck.__origResolve;
      window.__autoplay = false;

      return {
        disarmed: t.disarmed, triggered: t.triggered, found: t.found, rolled: t._disarmRolled,
        cls: el.classList.contains('disarmed'),
        xpDelta: currentTotalXp - xpBefore, hpDelta: hp - hpBefore,
        scCalls: window.__scCalls, ttp: window.__ttp, ttpSpyable, choiceInterceptable,
        sca: skillCheckActive, dp: dialogPaused,
      };
    }, outcome, opts);
  }
  const OK = { success: true, crit: false, total: 18, dc: 11, rep: { name: 'リーザ' } };

  // (4) 決定論: 対象なし(離れた位置の罠) → resolveSkillCheck を呼ばない
  const noTarget = await runDisarm(OK, { trapTx: 0, trapTy: 0 });
  check('(4) 対象なし: resolveSkillCheck 未呼出 (RNG不消費)', noTarget.scCalls === 0, 'calls=' + noTarget.scCalls);
  check('(4) 対象なし: skillCheckActive を立てない', noTarget.sca === false, 'sca=' + noTarget.sca);
  // (4-対照) 隣接 found 罠あり → 呼ぶ
  const hasTarget = await runDisarm(OK, { trapTx: 6, trapTy: 13 });
  check('(4-対照) 隣接found罠あり: resolveSkillCheck を呼ぶ', hasTarget.scCalls === 1, 'calls=' + hasTarget.scCalls);
  mark('determinism (no-RNG-when-no-target) verified');

  // (5) 成功
  const succ = await runDisarm({ success: true, crit: false, total: 18, dc: 11, rep: { name: 'リーザ' } });
  check('(5) 成功: disarmed=true', succ.disarmed === true, JSON.stringify(succ));
  check('(5) 成功: .disarmed クラス付与', succ.cls === true);
  check('(5) 成功: triggered のまま false (起爆しない)', succ.triggered === false);
  check('(5) 成功: XP +25', succ.xpDelta === 25, 'delta=' + succ.xpDelta);
  check('(5) 成功: _disarmRolled=true', succ.rolled === true);

  // (6) クリ成功
  const crit = await runDisarm({ success: true, crit: true, total: 20, dc: 11, rep: { name: 'リーザ' } });
  check('(6) クリ成功: disarmed=true', crit.disarmed === true, JSON.stringify(crit));
  check('(6) クリ成功: 起爆しない', crit.triggered === false);
  mark('success / crit branches verified');

  // (7) 通常失敗 → 起爆させない
  const nfail = await runDisarm({ success: false, crit: false, fumble: false, total: 5, dc: 11, rep: { name: 'リーザ' } });
  check('(7) 通常失敗: triggered=false (二重処罰しない)', nfail.triggered === false, JSON.stringify(nfail));
  check('(7) 通常失敗: disarmed=false', nfail.disarmed === false);
  check('(7) 通常失敗: found 維持 (避けられる)', nfail.found === true);
  check('(7) 通常失敗: hp 不変', nfail.hpDelta === 0, 'delta=' + nfail.hpDelta);
  check('(7) 通常失敗: _disarmRolled=true (再挑戦1回制限)', nfail.rolled === true);

  // (8) ファンブル → triggerTrapOnPlayer 呼出 (spy) + 対照(7)
  const fumble = await runDisarm({ success: false, crit: false, fumble: true, total: 1, dc: 11, rep: { name: 'リーザ' } });
  check('(8) ファンブル: triggered=true (起動)', fumble.triggered === true, JSON.stringify(fumble));
  check('(8) ファンブル: hp 減少', fumble.hpDelta < 0, 'delta=' + fumble.hpDelta);
  check('(8) ファンブル: triggerTrapOnPlayer spy=1', fumble.ttp === 1, 'ttp=' + fumble.ttp + ' spyable=' + fumble.ttpSpyable);
  check('(8) ファンブル: _disarmRolled=true', fumble.rolled === true);
  mark('normal-fail (no trigger) vs fumble (trigger) verified');

  // (9) 迂回 (showChoice=false) → 判定を呼ばない (autoplay=false + choice 上書きで迂回)
  const bypass = await runDisarm({ success: true, crit: false, total: 20, dc: 11, rep: { name: 'リーザ' } },
    { autoplay: false, choice: false });
  check('(9) 迂回: 判定(resolveSkillCheck)を呼ばない', bypass.scCalls === 0, 'calls=' + bypass.scCalls + ' interceptable=' + bypass.choiceInterceptable);
  check('(9) 迂回: disarmed=false (無害化しない)', bypass.disarmed === false);
  check('(9) 迂回: _disarmRolled=true (同ターン再提示しない)', bypass.rolled === true);
  check('(9) 迂回: skillCheckActive を残さない', bypass.sca === false);
  mark('bypass branch verified');

  // (10) checkTrapTrigger の disarmed ガード (found=false で踏んでも無害) + 対照
  const guard = await page.evaluate(() => {
    __tdReset();   // 同期リセット (この後 checkTrapTrigger まで await 無し)
    // disarmed=true, found=false, 踏むタイル(6,13)。ガードが無いと found=false で起爆する
    traps.push({ tx: 6, ty: 13, type: 'damage', damageDice: '1d6', found: false, triggered: false,
                 disarmed: true, rearmed: false, owner: null, _disarmRolled: false, el: null });
    const hpBefore = hp;
    checkTrapTrigger();
    return { triggered: traps[0].triggered, hpDelta: hp - hpBefore };
  });
  check('(10) disarmedガード: 踏んでも triggered=false', guard.triggered === false);
  check('(10) disarmedガード: hp 不変', guard.hpDelta === 0, 'delta=' + guard.hpDelta);

  const guardCtrl = await page.evaluate(() => {
    __tdReset();
    // 対照: 非disarmed・found=false を踏む → 起爆する
    traps.push({ tx: 6, ty: 13, type: 'damage', damageDice: '1d6', found: false, triggered: false,
                 disarmed: false, rearmed: false, owner: null, _disarmRolled: false, el: null });
    const hpBefore = hp;
    checkTrapTrigger();
    return { triggered: traps[0].triggered, hpDelta: hp - hpBefore };
  });
  check('(10-対照) 非disarmed: 踏むと triggered=true', guardCtrl.triggered === true);
  check('(10-対照) 非disarmed: hp 減少', guardCtrl.hpDelta < 0, 'delta=' + guardCtrl.hpDelta);
  mark('checkTrapTrigger disarmed guard verified');

  // (11) pageerror 0
  check('(11) 全操作で pageerror 0', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (pageErrors.length) console.log('[driver] pageerrors: ' + pageErrors.join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
