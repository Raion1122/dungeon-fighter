#!/usr/bin/env node
/*
 * driver_speech_v2.js — セリフ吹き出し v2 (戦闘系フック + 敵の鳴き声) 検証ドライバ
 *
 *   node tools/driver_speech_v2.js [--headful] [--browser <path>] [--port N]
 *
 * v2 の中核は「単一キューを鳴き声で埋めない」こと。優先度 (0=鳴き声 / 1=通常 / 2=重要) と
 * 発話側クールダウンで頻度を絞る設計なので、その 2 つを機械ゲートとして固定するのが主目的。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT    = parseInt(arg('port', '8799'), 10);

function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
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
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const allPageErrors = [];

async function freshPage(browser, scen) {
  const page = await browser.newPage();
  page.on('pageerror', e => allPageErrors.push(e.message));
  await page.evaluateOnNewDocument((id) => {
    sessionStorage.setItem('dragonfighters.currentScenario', id);
  }, scen || 'goblin-mine');
  await page.goto('http://localhost:' + PORT + '/index.html?autoplay=30&diag=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    'window.__speech && typeof gameStarted !== "undefined" && gameStarted && typeof enemies !== "undefined" && enemies.length',
    { timeout: 45000 });
  await sleep(400);
  return page;
}

// 戦闘を止めずに「敵が寄ってこない・遭遇が起きない」静穏状態を作る。
// gameOver は立てない (checkPartySpeech が gameOver で早期 return するため)。
const QUIET = `
  try { enemies.forEach(e => { e.x = -999999; e.y = -999999; }); } catch (e) {}
  try { encounterActive = false; } catch (e) {}
  try { sleepMs = () => Promise.resolve(); } catch (e) {}
  window.__speech.clear();
`;

(async () => {
  const puppeteer   = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_speechv2_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (A) データ: 鳴き声の文言が全敵種に揃っているか ---');
  {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => {
      const L = window.__speech.lines;
      const types = Object.keys(ENEMY_TYPES);
      const missing = types.filter(t => !Array.isArray(L['enemy.cry.' + t]) || !L['enemy.cry.' + t].length);
      return {
        nTypes: types.length,
        missing,
        hasFallback: Array.isArray(L['enemy.cry']) && L['enemy.cry'].length > 0,
        goblin:   window.__speech.resolve('enemy.cry', 'goblin'),
        minotaur: window.__speech.resolve('enemy.cry', 'minotaur'),
        unknown:  window.__speech.resolve('enemy.cry', 'no_such_enemy_xyz'),
        koboldEnc: Array.isArray(L['encounter.kobold']),
        koboldMsg: typeof ENEMY_FAMILY_MSG.kobold === 'string' && ENEMY_FAMILY_MSG.kobold.length > 0,
      };
    });
    check('(A1) 全 ' + r.nTypes + ' 敵種に enemy.cry.<type> がある', r.missing.length === 0, r.missing.join(','));
    check('(A2) 汎用フォールバック enemy.cry がある', r.hasFallback);
    check('(A3) ゴブリンは「キー! キー!」を持つ', !!r.goblin && r.goblin.includes('キー! キー!'), JSON.stringify(r.goblin));
    check('(A4) ミノタウロスは「ブモー! ブモー!」を持つ', !!r.minotaur && r.minotaur.includes('ブモー! ブモー!'), JSON.stringify(r.minotaur));
    check('(A5) 未知 type は汎用へフォールバック', Array.isArray(r.unknown) && r.unknown.includes('グアアッ!'), JSON.stringify(r.unknown));
    check('(A6) kobold 族が新設された (encounter 台詞 + DM メッセージ)', r.koboldEnc && r.koboldMsg);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (B) 優先度: 鳴き声が重要セリフを押し出さない (v2 の核心) ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    const r = await page.evaluate(() => {
      const s = window.__speech;
      const prio = { cry: s.prio('enemy.cry'), crit: s.prio('combat.crit'),
                     enc: s.prio('encounter.goblinoid'), down: s.prio('combat.allydown') };
      // 重要セリフ (prio 2) でキューを満杯にする
      s.clear();
      s.say('encounter.goblinoid'); s.say('find.trap'); s.say('find.chest');
      const qBefore = s.queue.map(e => e.key);
      // 環境音の鳴き声を 50 回試みる → 1件も入ってはならない
      const e0 = enemies[0];
      let accepted = 0;
      for (let i = 0; i < 50; i++) {
        e0.crySpokeAt = 0;                                 // 個体クールダウンを外して最悪条件にする
        if (s.cry(e0)) accepted++;
      }
      const qAfter = s.queue.map(e2 => e2.key);
      // 逆に、重要セリフ (prio 2) は満杯のキューに割り込める (最も軽いものを捨てる)
      s.clear();
      s.say('phase.rest'); s.say('phase.rest'); s.say('phase.rest');   // prio 1 で満杯
      const pushedImportant = s.say('boss.defeat');                     // prio 2 → 割り込める
      const qImportant = s.queue.map(e2 => e2.key);
      return { prio, qBefore, accepted, qAfter, pushedImportant, qImportant };
    });
    check('(B1) 優先度: 鳴き声=0 / 通常=1 / 重要=2',
      r.prio.cry === 0 && r.prio.crit === 1 && r.prio.enc === 2 && r.prio.down === 2, JSON.stringify(r.prio));
    check('(B2) キューが埋まっている時、鳴き声は 50回試みても 1件も入らない', r.accepted === 0, 'accepted=' + r.accepted);
    check('(B3) 重要セリフ 3件がキューに残っている (押し出されていない)',
      JSON.stringify(r.qBefore) === JSON.stringify(r.qAfter), r.qAfter.join(','));
    check('(B4) 重要セリフは満杯のキューに割り込める (軽いものを捨てる)',
      r.pushedImportant === true && r.qImportant.includes('boss.defeat') && r.qImportant.length === 3, r.qImportant.join(','));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (C) 鳴き声のクールダウン ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    const r = await page.evaluate(() => {
      const s = window.__speech;
      const e1 = enemies[0], e2 = enemies[1] || enemies[0];
      s.clear(); e1.crySpokeAt = 0; e2.crySpokeAt = 0;
      // force で 1 回鳴かせる → 以降は全体クールダウン (5.2s) で誰も鳴けない
      const first = s.cry(e1, { force: true });
      let others = 0;
      for (let i = 0; i < 40; i++) { e2.crySpokeAt = 0; if (s.cry(e2)) others++; }
      return { first, others, cryInQueue: s.queue.filter(x => x.key === 'enemy.cry').length };
    });
    check('(C1) force 指定の鳴き声は必ず鳴く', r.first === true);
    check('(C2) 直後は全体クールダウンで他の敵も鳴かない (40回試行)', r.others === 0, 'others=' + r.others);
    check('(C3) 鳴き声はキューに 1 件だけ', r.cryInQueue === 1, 'n=' + r.cryInQueue);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (D) 見た目: 鳴き声=crySpeech / ボスの台詞=enemySpeech (血赤) ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    const cry = await page.evaluate(() => {
      const s = window.__speech;
      s.clear();
      document.querySelectorAll('.speechBubble').forEach(el => el.remove());
      const e = enemies[0];
      e.x = playerX + 120; e.y = playerY; e.crySpokeAt = 0;
      s.cry(e, { force: true });
      s.update();
      const el = document.querySelector('.speechBubble');
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      return { found: true, cry: el.classList.contains('crySpeech'),
               enemy: el.classList.contains('enemySpeech'),
               fontSize: cs.fontSize, italic: cs.fontStyle, z: cs.zIndex, text: el.textContent };
    });
    check('(D1) 鳴き声が表示される', cry.found === true, cry.text || '');
    check('(D2) 鳴き声は .crySpeech で、血赤 .enemySpeech ではない', cry.cry === true && cry.enemy === false,
      'cry=' + cry.cry + ' enemy=' + cry.enemy);
    check('(D3) 鳴き声は小さめ・斜体', cry.fontSize === '12px' && cry.italic === 'italic', cry.fontSize + '/' + cry.italic);
    check('(D4) 鳴き声も z-index:45 (暗闇に沈まない)', cry.z === '45', String(cry.z));

    const boss = await page.evaluate(() => {
      const s = window.__speech;
      s.clear();
      document.querySelectorAll('.speechBubble').forEach(el => el.remove());
      const e = enemies[0];
      e.x = playerX + 120; e.y = playerY;
      s.say('boss.appear', e, { eventKey: e.type });
      s.update();
      const el = document.querySelector('.speechBubble');
      if (!el) return { found: false };
      return { found: true, cry: el.classList.contains('crySpeech'), enemy: el.classList.contains('enemySpeech') };
    });
    check('(D5) ボスの台詞は血赤 .enemySpeech のまま (鳴き声スタイルに侵食されない)',
      boss.found && boss.enemy === true && boss.cry === false, JSON.stringify(boss));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (E) クリティカル: 配線 + helpless 除外 + 連発の抑制 ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    const wired = await page.evaluate(() => {
      // 味方の攻撃 12 関数すべてで sayCritLine が「!helpless && isThreat」ガードの内側にあること (機械ゲート)。
      // helpless (Sleep 中の敵) への自動クリで喋り散らかす事故を、ソースレベルで固定する。
      const allyFns = ['performAllyCounter','allyBasicAttack','allyFireBolt','allyPowerAttack','allyThrowingAxe',
                       'allyAxeStorm','allyEarthShatter','allyAimedShot','allyLightningArrow','allyShadowStep',
                       'allyThrownDagger','allyPoisonBlade'];
      const bad = [];
      for (const fn of allyFns) {
        let src = '';
        try { src = String(eval(fn)); } catch (e) { bad.push(fn + ':missing'); continue; }
        if (!/sayCritLine\(ally\)/.test(src)) { bad.push(fn + ':no-hook'); continue; }
        // sayCritLine の直前に !helpless && isThreat のガードがあるか (窓 260 文字)
        if (!/!helpless\s*&&\s*isThreat[\s\S]{0,260}?sayCritLine\(ally\)/.test(src)) bad.push(fn + ':unguarded');
      }
      const psrc = String(playerSingleAttack);
      const playerOk = /sayCritLine\("player"\)/.test(psrc)
                    && /クリティカル成功[\s\S]{0,140}?sayCritLine\("player"\)/.test(psrc);
      const enemySrc = String(enemyAttackAllyTarget) + String(enemyAttackEnemyTarget) + String(enemyAttackTurn);
      return { bad, playerOk, enemyClean: !/sayCritLine/.test(enemySrc) };
    });
    check('(E1) 味方の攻撃 12 関数すべてで sayCritLine が !helpless && isThreat の内側', wired.bad.length === 0, wired.bad.join(' | '));
    check('(E2) プレイヤーの確定クリ分岐に sayCritLine("player")', wired.playerOk === true);
    check('(E3) 敵の攻撃関数に combat.crit は混入していない', wired.enemyClean === true);

    const cd = await page.evaluate(() => {
      const s = window.__speech;
      s.clear();
      let said = 0;
      for (let i = 0; i < 200; i++) if (s.crit('player')) said++;   // AoE で 200 回踏んでも
      return { said, q: s.queue.filter(e => e.key === 'combat.crit').length };
    });
    check('(E4) クリ台詞は 200 回踏んでもクールダウンで 1 件に潰れる', cd.said === 1 && cd.q === 1,
      'said=' + cd.said + ' queued=' + cd.q);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (F) 低HP / 仲間ダウン: updateInfo 経由の配線とラッチ ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    const wired = await page.evaluate(() => ({
      inUpdateInfo: /checkPartySpeech\(\)/.test(String(updateInfo)),
      // 毎回呼ばれる関数なので、強制同期レイアウトを持ち込んでいないことを固定する (camera-perf の禁忌)
      noLayoutRead: !/offsetWidth|offsetHeight|getBoundingClientRect|getComputedStyle|clientWidth/.test(String(window.__speech.checkParty)),
    }));
    check('(F1) updateInfo (全ダメージ経路の合流点) から checkPartySpeech が呼ばれる', wired.inUpdateInfo === true);
    check('(F2) checkPartySpeech は強制同期レイアウトを起こさない', wired.noLayoutRead === true);

    const low = await page.evaluate(() => {
      const s = window.__speech;
      const n = () => s.log.filter(e => e.key === 'combat.lowhp').length;
      const flush = () => { s.clear(); for (let i = 0; i < 5; i++) s.update(); };
      s.clear();
      hp = Math.floor(maxHp * 0.20);            // 25% 未満へ
      updateInfo('test');                        // ← 実フック経由
      s.update();
      const after1 = n();
      const kind1 = s.log.filter(e => e.key === 'combat.lowhp').map(e => e.kind).pop();
      flush();
      updateInfo('test'); updateInfo('test'); s.update();   // ラッチ: 増えない
      const after2 = n();
      flush();
      hp = maxHp;                                // 全快 → 再武装
      updateInfo('test'); s.update();
      const after3 = n();
      flush();
      hp = Math.floor(maxHp * 0.20);            // また瀕死 → もう一度だけ喋る
      updateInfo('test'); s.update();
      const after4 = n();
      hp = maxHp;
      return { after1, kind1, after2, after3, after4 };
    });
    check('(F3) HP が 25% を切ると本人が喋る', low.after1 === 1 && low.kind1 === 'player', JSON.stringify(low));
    check('(F4) ラッチ: 瀕死のまま何度 updateInfo しても増えない', low.after2 === 1, 'n=' + low.after2);
    check('(F5) 全快しても喋らない', low.after3 === 1, 'n=' + low.after3);
    check('(F6) 回復 → 再度瀕死 でラッチが再武装し、もう一度だけ喋る', low.after4 === 2, 'n=' + low.after4);

    const down = await page.evaluate(() => {
      const s = window.__speech;
      const n = () => s.log.filter(e => e.key === 'combat.allydown').length;
      s.clear();
      const a = allies.find(x => x && x.alive);
      if (!a) return { skip: true };
      a.alive = false;
      updateInfo('test'); s.update();
      const after1 = n();
      const kind1 = s.log.filter(e => e.key === 'combat.allydown').map(e => e.kind).pop();
      s.clear(); for (let i = 0; i < 5; i++) s.update();
      updateInfo('test'); updateInfo('test'); s.update();
      const after2 = n();
      a.alive = true;
      return { skip: false, after1, after2, kind1 };
    });
    check('(F7) 仲間が倒れると生存パーティが反応する', !down.skip && down.after1 === 1 && down.kind1 !== 'enemy', JSON.stringify(down));
    check('(F8) ラッチ: 倒れたままでは繰り返さない', !down.skip && down.after2 === 1, 'n=' + down.after2);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (G) 遭遇の第一声: 敵が吠え → パーティが応える ---');
  {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => {
      const s = window.__speech;
      try { sleepMs = () => Promise.resolve(); } catch (e) {}
      s.clear();
      const idxs = [];
      for (let i = 0; i < enemies.length && idxs.length < 3; i++) {
        if (enemies[i].alive && !enemies[i].def.isBoss) idxs.push(i);
      }
      if (!idxs.length) return { skip: true };
      runEncounter(idxs);                       // await しない: 台詞は関数先頭で同期に積まれる
      const q = s.queue.map(e => ({ key: e.key, prio: e.prio,
        speakerIsEnemy: !!(e.speaker && typeof e.speaker === 'object' && e.speaker.type) }));
      gameOver = true;                          // 走り出した戦闘ループを止める
      return { skip: false, q };
    });
    check('(G1) 遭遇で 2 件積まれる (敵の第一声 + パーティの反応)', !r.skip && r.q.length === 2, JSON.stringify(r.q));
    check('(G2) 先に敵が鳴く (呼びかけ → 応答の順)',
      !r.skip && r.q[0] && r.q[0].key === 'enemy.cry' && r.q[0].speakerIsEnemy === true, JSON.stringify(r.q && r.q[0]));
    check('(G3) 遭遇の第一声は優先度 2 (環境音に降格せず、確実に鳴る)',
      !r.skip && r.q[0] && r.q[0].prio === 2, String(r.q && r.q[0] && r.q[0].prio));
    check('(G4) 次にパーティが応える', !r.skip && r.q[1] && /^encounter\./.test(r.q[1].key), JSON.stringify(r.q && r.q[1]));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (H) detectEnemyFamily の穴埋め ---');
  {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => {
      const saved = enemies.slice();
      const fam = (t) => { enemies.length = 0; enemies.push({ type: t, def: {} }); return detectEnemyFamily([0]); };
      const out = {
        kobold: fam('kobold'), ghostFlame: fam('ghostFlame'), direBear: fam('direBear'),
        plagueFrog: fam('plagueFrog'), ruinSpider: fam('ruinSpider'),
        goblin: fam('goblin'), lizardWarrior: fam('lizardWarrior'), minotaur: fam('minotaur'),
        skeleton: fam('skeleton'), pharaxus: fam('pharaxus'), rat: fam('rat'), bandit: fam('bandit'),
      };
      enemies.length = 0; saved.forEach(e => enemies.push(e));
      const L = window.__speech.lines;
      out.allFamsHaveLines = Object.keys(ENEMY_FAMILY_MSG).every(f => Array.isArray(L['encounter.' + f]));
      return out;
    });
    check('(H1) kobold → kobold 族 (従来 generic)', r.kobold === 'kobold', r.kobold);
    check('(H2) ghostFlame → undead (従来 generic)', r.ghostFlame === 'undead', r.ghostFlame);
    check('(H3) direBear / plagueFrog / ruinSpider → beast (従来 generic)',
      r.direBear === 'beast' && r.plagueFrog === 'beast' && r.ruinSpider === 'beast',
      [r.direBear, r.plagueFrog, r.ruinSpider].join(','));
    check('(H4) 既存の族判定は回帰していない',
      r.goblin === 'goblinoid' && r.lizardWarrior === 'lizardman' && r.minotaur === 'orc'
      && r.skeleton === 'undead' && r.pharaxus === 'dragon' && r.rat === 'beast' && r.bandit === 'bandit',
      JSON.stringify(r));
    check('(H5) 全 DM 族メッセージに対応する encounter 台詞がある', r.allFamsHaveLines === true);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (I) 実走: 鳴き声が出て、かつ重要セリフを潰していない ---');
  {
    const page = await freshPage(browser);
    const seen = new Set();
    let maxConcurrent = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      let done = false;
      try {
        const snap = await page.evaluate(() => ({
          log: window.__speech.log.map(e => e.key + '|' + e.kind + '|' + (e.cry ? 'cry' : '-')),
          n: document.querySelectorAll('.speechBubble').length,
          over: (typeof gameOver !== 'undefined' && gameOver) || (typeof dungeonCleared !== 'undefined' && dungeonCleared),
        }));
        snap.log.forEach(k => seen.add(k));
        if (snap.n > maxConcurrent) maxConcurrent = snap.n;
        done = snap.over;
      } catch (e) { /* 遷移中 */ }
      if (done) break;
      if ([...seen].some(k => k.startsWith('enemy.cry')) && [...seen].some(k => k.startsWith('encounter.'))) break;
      await sleep(700);
    }
    const keys = [...seen];
    const cries = keys.filter(k => k.startsWith('enemy.cry'));
    check('(I1) 実走で敵の鳴き声が実際に表示された', cries.length > 0, cries.join(' / '));
    check('(I2) 鳴き声の話者は敵で、cry フラグが立っている',
      cries.length > 0 && cries.every(k => k.indexOf('|enemy|cry') >= 0), cries.join(' / '));
    check('(I3) 鳴き声が出ても遭遇セリフは押し出されていない',
      keys.some(k => k.startsWith('encounter.')), keys.join(' / '));
    check('(I4) 同時表示は常に 1 件以下 (単一キュー維持)', maxConcurrent <= 1, 'max=' + maxConcurrent);

    const diag = await page.evaluate(() => {
      try {
        const r = window.dumpDebugReport ? window.dumpDebugReport() : null;
        return r ? { crit: r.totals.criticals, ids: (r.violations || []).map(v => v.id) } : { crit: -1, ids: [] };
      } catch (e) { return { crit: -1, ids: [] }; }
    });
    // combat-stall は約20ラウンド超の長期戦で必ず出る既存事象 (変更の有無に無関係) → 無罪リストに入れる
    const guilty = (diag.ids || []).filter(id => id !== 'combat-stall' && id !== 'run-timeout' && id !== 'result-double-fire');
    check('(I5) 診断 critical に新規のものが無い (combat-stall 等の既存事象は除外)',
      guilty.length === 0, 'criticals=' + diag.crit + ' ids=' + (diag.ids || []).join(','));
    await page.close();
  }

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const realErrs = allPageErrors.filter(m => !/Failed to load resource|favicon|decodeAudioData|Unable to decode/i.test(m));
  check('(Z) pageerror ゼロ', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  const passed = results.filter(r => r.ok).length;
  const total  = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
