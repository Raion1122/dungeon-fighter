#!/usr/bin/env node
/*
 * driver_room_search_roll.js — 探索判定「1 部屋につき 1 チェック 1 ロール」の回帰ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-08-10 の変更 (知覚(罠) + 捜査(宝箱/ミミック) → runRoomSearchCheck 1 本) を守る検出器。
 * 検証手順はメモリ「ゲーム変更のヘッドレス検証手順」準拠 (実 Chrome/Edge を puppeteer-core で駆動)。
 *
 * ⚠ このドライバが golden 方式ではなく**性質を直接測る**のはわざと。golden は
 *   「最初から間違った絵」を永久に緑にする。ここで守りたいのは絵ではなく
 *   「1 部屋で resolveSkillCheck が何回呼ばれたか」という数そのもの。
 *
 * ⚠ 主要アサートには**負のコントロール**を付けてある。roomSearchRolled を空にすると
 *   ちゃんと 2 回目が振れることまで確かめないと、「実は skillCheckActive に弾かれて
 *   いただけ」で緑になる (= 何も検出しない検出器) 事故が起きる。
 *
 * 検証項目:
 *   (1) 関数定義と**統合の唯一性** (旧 runPerceptionCheck / runInvestigationCheck が消えている)
 *   (2) 同じ部屋で何度呼んでもロールは 1 回 + 負のコントロール
 *   (3) 別の部屋へ移ると 1 回増える
 *   (4) 元の部屋へ戻っても増えない (再入場で振り直さない)
 *   (5) どの部屋にも属さないタイル (通路) では振らない
 *   (6) 取りこぼしゼロ: 全床タイルが nearestRoomIdxTo でちょうど 1 つの部屋に割り当たる
 *   (7) 1 ロールで罠と隠し宝箱が**同時に**発見される (統合の実体)
 *   (8) 振り手: 盗賊→investigation / ドワーフ→perception / 同点→perception
 *   (9) DC: 罠が絡む部屋は perceptionDC、宝箱だけの部屋は max(5, perceptionDC-2)
 *  (10) 全操作で pageerror 0
 *
 * 使い方:  node tools/driver_room_search_roll.js [--headful] [--browser <path>]
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
const PORT = parseInt(arg('port', '8807'), 10);

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
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
function mark(s) { console.log('[drv] ' + s); }

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = require('./_pptr_profile')('df_roomsearch_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check',
           '--mute-audio', '--disable-extensions', '--user-data-dir=' + profile],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine'); } catch (e) {}
  });
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof runRoomSearchCheck === 'function' && typeof nearestRoomIdxTo === 'function'
       && typeof currentScenario !== 'undefined' && typeof ROOMS !== 'undefined',
    { timeout: 20000 });
  mark('index.html booted, room-search fns present');

  /* ライブ game loop が evaluate の合間に hero を動かすと、注入した罠が別部屋に化ける。
   * rAF を凍結し、各テスト冒頭で環境を同期リセットする (driver_trap_disarm と同じ作法)。 */
  await page.evaluate(() => {
    window.requestAnimationFrame = function () { return 0; };
    window.__rsRooms0 = ROOMS.map(r => r.slice());   // 実マップの部屋 (復元用)
    /* ⚠ 分岐マップのノードは **部屋がちょうど 1 つ**。「部屋をまたぐ」挙動はそれでは測れないので、
     *   ROOMS を合成の 2 部屋へ差し替えて実関数 (heroRoomIdx / nearestRoomIdxTo /
     *   runRoomSearchCheck) をそのまま走らせる。判定式を driver 側へ写さないのが肝
     *   (写すと実装と driver が同じ間違いを共有して両方緑になる)。 */
    window.__rsUseSynthRooms = function () { ROOMS = [[2, 2, 6, 10], [2, 20, 6, 28]]; };
    window.__rsReset = function (opts) {
      const o = opts || {};
      ROOMS = __rsRooms0.map(r => r.slice());
      gameStarted = true; gameOver = false;
      encounterActive = false; encounterRunning = false;
      skillCheckActive = false; dialogPaused = false;
      camX = 0; camY = 0; hp = 30;
      traps.length = 0; roomChests.length = 0; mimicChest = null;
      roomSearchRolled.clear();
      window.__rsCalls = 0; window.__rsLast = null;
      // resolveSkillCheck を差し替えて「何回・どの技能で・DC いくつで」呼ばれたかを記録する。
      SkillCheck.__orig = SkillCheck.__orig || SkillCheck.resolveSkillCheck;
      SkillCheck.resolveSkillCheck = function (key, dc, party, op) {
        window.__rsCalls++;
        window.__rsLast = { key: key, dc: dc, title: op && op.title, icon: op && op.iconContext,
                            extra: op && op.extraBonus, n: (party || []).length };
        const succeed = (o.succeed !== false);
        return Promise.resolve({ success: succeed, crit: false, fumble: false,
          roll: succeed ? 18 : 2, bonus: 0, total: succeed ? 18 : 2, dc: dc,
          rep: (party && party[0]) || null, helper: null });
      };
    };
    window.__rsAt = function (tx, ty) { playerX = tx * TILE_SIZE; playerY = ty * TILE_SIZE; };
    window.__rsTick = () => new Promise(r => setTimeout(r, 0));
    // 部屋 rect の中心タイル
    window.__rsCenterOf = function (i) {
      const r = ROOMS[i];
      return { tx: Math.floor((r[1] + r[3]) / 2), ty: Math.floor((r[0] + r[2]) / 2) };
    };
    window.__rsAddTrap = function (tx, ty) {
      const t = { tx, ty, type: 'damage', damageDice: '1d6', found: false, triggered: false,
                  disarmed: false, rearmed: false, owner: null, _disarmRolled: false, _percRolled: false, el: null };
      traps.push(t); return t;
    };
    window.__rsAddChest = function (tx, ty) {
      const c = { tx, ty, hidden: true, found: false, opened: false, locked: false,
                  unlocked: true, _invRolled: false, el: null, loot: null };
      roomChests.push(c); return c;
    };
  });

  // ── (1) 関数定義 + 統合の唯一性 ──────────────────────────────────────────
  const defs = await page.evaluate(() => ({
    run: typeof runRoomSearchCheck, apply: typeof applyRoomSearchResult,
    room: typeof heroRoomIdx, near: typeof nearestRoomIdxTo, pick: typeof pickSearchCheckKey,
    oldPerc: typeof runPerceptionCheck, oldInv: typeof runInvestigationCheck,
    radius: typeof TRAP_PERCEPTION_RADIUS,
    rooms: ROOMS.length,
  }));
  check('(1) runRoomSearchCheck 定義', defs.run === 'function', defs.run);
  check('(1) applyRoomSearchResult 定義', defs.apply === 'function', defs.apply);
  check('(1) heroRoomIdx 定義', defs.room === 'function', defs.room);
  check('(1) nearestRoomIdxTo 定義', defs.near === 'function', defs.near);
  check('(1) pickSearchCheckKey 定義', defs.pick === 'function', defs.pick);
  check('(1) 旧 runPerceptionCheck が消えている (ロール経路は 1 本)', defs.oldPerc === 'undefined', defs.oldPerc);
  check('(1) 旧 runInvestigationCheck が消えている (ロール経路は 1 本)', defs.oldInv === 'undefined', defs.oldInv);
  check('(1) TRAP_PERCEPTION_RADIUS が消えている (半径で絞る経路が残っていない)', defs.radius === 'undefined', defs.radius);
  // 分岐マップのノードは部屋 1 つ。1 以上あることだけ確かめ、部屋またぎは合成 ROOMS で測る。
  check('(1) ROOMS が 1 部屋以上', defs.rooms >= 1, 'ROOMS=' + defs.rooms);
  mark('1 definitions / single-roll-path verified');

  // ── (2) 同じ部屋で何度呼んでもロールは 1 回 (+ 負のコントロール) ────────────
  const r2 = await page.evaluate(async () => {
    __rsReset();
    const c = __rsCenterOf(0); __rsAt(c.tx, c.ty);
    const r = ROOMS[0];
    // 部屋 0 の中に、離れた位置へ罠を 3 個。旧実装ならバラバラに半径へ入って複数回振っていた形。
    __rsAddTrap(r[1] + 1, r[0] + 1);
    __rsAddTrap(r[3] - 1, r[0] + 1);
    __rsAddTrap(r[3] - 1, r[2] - 1);
    for (let i = 0; i < 20; i++) { runRoomSearchCheck(); await __rsTick(); }
    const after = window.__rsCalls;
    // 負のコントロール: 部屋の済印と対象の済印を戻せば、ちゃんともう 1 回振れる
    roomSearchRolled.clear();
    traps.forEach(t => { t._percRolled = false; t.found = false; });
    skillCheckActive = false; dialogPaused = false;
    runRoomSearchCheck(); await __rsTick();
    return { after, ctrl: window.__rsCalls, roomIdx: heroRoomIdx(c.tx, c.ty), rolled: roomSearchRolled.size };
  });
  check('(2) 同じ部屋で 20 回呼んでもロールは 1 回', r2.after === 1, 'calls=' + r2.after);
  check('(2-負) 済印を戻せば 2 回目が振れる (弾いていたのが済印である証明)', r2.ctrl === 2, 'calls=' + r2.ctrl);
  check('(2) 主人公は部屋 0 に居る', r2.roomIdx === 0, 'roomIdx=' + r2.roomIdx);
  mark('2 one-roll-per-room verified (with negative control)');

  // ── (3)(4) 部屋をまたぐ / 戻る ────────────────────────────────────────────
  const r34 = await page.evaluate(async () => {
    __rsReset();
    __rsUseSynthRooms();                       // 合成 2 部屋 (実マップのノードは 1 部屋しかない)
    const a = __rsCenterOf(0), b = __rsCenterOf(1);
    const ra = ROOMS[0], rb = ROOMS[1];
    __rsAddTrap(ra[1] + 1, ra[0] + 1);
    __rsAddTrap(rb[1] + 1, rb[0] + 1);
    __rsAt(a.tx, a.ty); runRoomSearchCheck(); await __rsTick();
    const c1 = window.__rsCalls;
    __rsAt(b.tx, b.ty); runRoomSearchCheck(); await __rsTick();
    const c2 = window.__rsCalls;
    __rsAt(a.tx, a.ty);
    for (let i = 0; i < 5; i++) { runRoomSearchCheck(); await __rsTick(); }
    const c3 = window.__rsCalls;
    const out = { c1, c2, c3, idxA: heroRoomIdx(a.tx, a.ty), idxB: heroRoomIdx(b.tx, b.ty) };
    __rsReset();                               // 実マップの ROOMS へ戻す
    return out;
  });
  check('(3) 別の部屋では別のキー = 部屋 2 つで 2 ロール', r34.c1 === 1 && r34.c2 === 2, 'c1=' + r34.c1 + ' c2=' + r34.c2);
  check('(4) 元の部屋へ戻っても増えない (再入場で振り直さない)', r34.c3 === 2, 'c3=' + r34.c3);
  check('(3) 使った 2 部屋は別部屋 (0 と 1)', r34.idxA === 0 && r34.idxB === 1, 'idxA=' + r34.idxA + ' idxB=' + r34.idxB);
  mark('3-4 cross-room / re-entry verified');

  // ── (5) 通路 (どの部屋にも属さないタイル) では振らない ─────────────────────
  const r5 = await page.evaluate(async () => {
    __rsReset();
    // どの部屋にも属さないタイルを探す (壁リング / 通路)
    let spot = null;
    for (let ty = 0; ty < MAP_H && !spot; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (heroRoomIdx(tx, ty) < 0) { spot = { tx, ty }; break; }
      }
    }
    if (!spot) return { found: false };
    __rsAddTrap(spot.tx, spot.ty);
    __rsAt(spot.tx, spot.ty);
    for (let i = 0; i < 5; i++) { runRoomSearchCheck(); await __rsTick(); }
    return { found: true, calls: window.__rsCalls, rolled: roomSearchRolled.size, spot };
  });
  check('(5) 部屋外タイルが存在する (テストの前提)', r5.found === true);
  check('(5) 通路では 1 回も振らない', r5.calls === 0, 'calls=' + r5.calls + ' @' + JSON.stringify(r5.spot));
  check('(5) 通路では済印も立てない (部屋へ入ってから振る)', r5.rolled === 0, 'rolled=' + r5.rolled);
  mark('5 corridor guard verified');

  // ── (6) 取りこぼしゼロ: 全床タイルがちょうど 1 つの部屋に割り当たる ─────────
  const r6 = await page.evaluate(() => {
    let floors = 0, unassigned = 0, outOfRange = 0, outsideRooms = 0;
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (mapData[ty][tx] !== 0) continue;      // 床だけ (罠が湧きうるタイル)
        floors++;
        const i = nearestRoomIdxTo(tx, ty);
        if (i < 0) unassigned++;
        else if (i >= ROOMS.length) outOfRange++;
        if (heroRoomIdx(tx, ty) < 0) outsideRooms++;   // 部屋の外の床 = 通路 (救済が要る対象)
      }
    }
    return { floors, unassigned, outOfRange, outsideRooms };
  });
  check('(6) 床タイルが存在する (テストの前提)', r6.floors > 0, 'floors=' + r6.floors);
  check('(6) 未割り当ての床が 0 (永久に発見不能な罠が生まれない)', r6.unassigned === 0, 'unassigned=' + r6.unassigned);
  check('(6) 割り当て先が全て有効な部屋 index', r6.outOfRange === 0, 'outOfRange=' + r6.outOfRange);
  mark('6 no-orphan-tile assignment verified (部屋外の床 ' + r6.outsideRooms + ' 枚)');

  /* (6b) 実マップのこのノードは部屋が盤面を覆っていて「部屋外の床」がゼロになりうる。
   * それだと救済経路が一度も踏まれず、上の (6) は**何も検出していない**。合成 2 部屋で
   * 部屋と部屋の隙間 (=通路) に罠を置き、近い側の部屋の 1 ロールで拾われることまで確かめる。 */
  const r6b = await page.evaluate(async () => {
    __rsReset();
    __rsUseSynthRooms();
    const gapTx = 15, gapTy = 4;                      // ROOMS[0](c2..10) と ROOMS[1](c20..) の隙間
    const outside = heroRoomIdx(gapTx, gapTy) < 0;
    const owner = nearestRoomIdxTo(gapTx, gapTy);     // 距離: 部屋0→5 / 部屋1→5 … 同距離は若い index
    const t = __rsAddTrap(gapTx, gapTy);
    const far = __rsCenterOf(1); __rsAt(far.tx, far.ty);
    runRoomSearchCheck(); await __rsTick(); await __rsTick();
    const pickedByFar = t._percRolled;                // 担当でない部屋では拾わない
    const near = __rsCenterOf(owner); __rsAt(near.tx, near.ty);
    runRoomSearchCheck(); await __rsTick(); await __rsTick();
    const out = { outside, owner, pickedByFar, pickedByOwner: t._percRolled, found: t.found,
                  calls: window.__rsCalls };
    __rsReset();
    return out;
  });
  check('(6b) 隙間タイルはどの部屋にも属さない (救済が要る形になっている)', r6b.outside === true);
  check('(6b) 隙間の罠は担当部屋がちょうど 1 つに決まる', r6b.owner === 0 || r6b.owner === 1, 'owner=' + r6b.owner);
  check('(6b) 担当でない部屋のロールでは拾わない', r6b.pickedByFar === false, 'pickedByFar=' + r6b.pickedByFar);
  check('(6b) 担当部屋のロールで必ず拾う (通路の罠が取り残されない)', r6b.pickedByOwner === true && r6b.found === true,
        'rolled=' + r6b.pickedByOwner + ' found=' + r6b.found);
  mark('6b corridor-trap rescue verified');

  // ── (7) 1 ロールで罠と隠し宝箱が同時に発見される (統合の実体) ───────────────
  const r7 = await page.evaluate(async () => {
    __rsReset({ succeed: true });
    const c = __rsCenterOf(0); const r = ROOMS[0];
    __rsAt(c.tx, c.ty);
    const t1 = __rsAddTrap(r[1] + 1, r[0] + 1);
    const t2 = __rsAddTrap(r[3] - 1, r[2] - 1);
    const ch = __rsAddChest(c.tx, c.ty);
    runRoomSearchCheck(); await __rsTick(); await __rsTick();
    return { calls: window.__rsCalls, t1: t1.found, t2: t2.found, chest: ch.found,
             last: window.__rsLast };
  });
  check('(7) 統合: 罠と宝箱を 1 回のロールで処理', r7.calls === 1, 'calls=' + r7.calls);
  check('(7) 罠 2 件とも発見', r7.t1 === true && r7.t2 === true, 't1=' + r7.t1 + ' t2=' + r7.t2);
  check('(7) 隠し宝箱も同じロールで発見', r7.chest === true, 'chest=' + r7.chest);
  check('(7) パネル表題は「探索判定」', r7.last && r7.last.title === '探索判定', JSON.stringify(r7.last));
  mark('7 unified discovery verified');

  // ── (8) 振り手の選択 ─────────────────────────────────────────────────────
  const r8 = await page.evaluate(() => {
    const p = (classKey, skillBonus) => [{ classKey, name: classKey, skillBonus: skillBonus || null }];
    // 戦士は perception=WIS10→0(習熟なし) / investigation=INT9→0(習熟なし) で**同点**になる。
    const w = { classKey: 'warrior', skillBonus: null };
    return {
      rogue: pickSearchCheckKey(p('rogue')),
      dwarf: pickSearchCheckKey(p('dwarf')),
      tie: pickSearchCheckKey([w]),
      tieScores: [SkillCheck.checkScore(w, SkillCheck.CHECKS.perception),
                  SkillCheck.checkScore(w, SkillCheck.CHECKS.investigation)],
      empty: pickSearchCheckKey([]),
    };
  });
  check('(8) 盗賊が居れば捜査で振る (投資した習熟が死なない)', r8.rogue === 'investigation', r8.rogue);
  check('(8) ドワーフが居れば知覚で振る', r8.dwarf === 'perception', r8.dwarf);
  check('(8) 同点は知覚 (罠の見落としを既定で避ける)', r8.tie === 'perception', r8.tie + ' scores=' + JSON.stringify(r8.tieScores));
  check('(8) 同点テストが本当に同点', r8.tieScores[0] === r8.tieScores[1], JSON.stringify(r8.tieScores));
  check('(8) 空パーティでも落ちず perception へ', r8.empty === 'perception', r8.empty);
  mark('8 roller selection verified');

  // ── (9) DC の出し分け ────────────────────────────────────────────────────
  const r9 = await page.evaluate(async () => {
    const base = currentScenario.perceptionDC || 14;
    // (a) 罠が絡む部屋 → perceptionDC
    __rsReset();
    let c = __rsCenterOf(0); __rsAt(c.tx, c.ty);
    __rsAddTrap(c.tx, c.ty);
    runRoomSearchCheck(); await __rsTick();
    const withTrap = window.__rsLast;
    // (b) 宝箱だけの部屋 → max(5, perceptionDC-2)
    __rsReset();
    c = __rsCenterOf(0); __rsAt(c.tx, c.ty);
    __rsAddChest(c.tx, c.ty);
    runRoomSearchCheck(); await __rsTick();
    const chestOnly = window.__rsLast;
    return { base, withTrap, chestOnly };
  });
  check('(9) 罠が絡む部屋の DC = perceptionDC', r9.withTrap && r9.withTrap.dc === r9.base,
        'dc=' + (r9.withTrap && r9.withTrap.dc) + ' base=' + r9.base);
  check('(9) 宝箱だけの部屋の DC = max(5, perceptionDC-2) (盗賊不在の救済を維持)',
        r9.chestOnly && r9.chestOnly.dc === Math.max(5, r9.base - 2),
        'dc=' + (r9.chestOnly && r9.chestOnly.dc));
  check('(9) 罠が絡むときだけ罠アイコンを出す', r9.withTrap && r9.withTrap.icon === 'trap',
        'icon=' + (r9.withTrap && r9.withTrap.icon));
  check('(9) 宝箱だけの判定に罠アイコンを出さない', r9.chestOnly && !r9.chestOnly.icon,
        'icon=' + JSON.stringify(r9.chestOnly && r9.chestOnly.icon));
  mark('9 DC / icon split verified');

  // ── (10) pageerror ───────────────────────────────────────────────────────
  check('(10) 全操作で pageerror 0', pageErrors.length === 0, pageErrors.join(' | '));

  await page.evaluate(() => { try { SkillCheck.resolveSkillCheck = SkillCheck.__orig; } catch (e) {} });
  await browser.close();
  srv.close();

  const pass = results.filter(r => r.ok).length;
  console.log('\n[driver] RESULT: ' + pass + '/' + results.length + ' passed');
  if (pass !== results.length) {
    console.log('[driver] 失敗:');
    results.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name + (r.detail ? '  (' + r.detail + ')' : '')));
  }
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(3); });
