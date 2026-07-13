#!/usr/bin/env node
/*
 * driver_speech_boss.js — セリフ吹き出し STEP3 ボス系フック + ライフサイクル検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * ボス戦はオートプレイで到達するのに数分かかるため、各フックを *実関数の直叩き* で
 * 決定論的に踏む (1 テスト = 1 page.goto で state 汚染を避ける)。
 *
 * 検証項目 (計画書 STOP ゲート 3):
 *   (1) boss.appear が出現し kind === "enemy" (ボス本人が喋る・血赤スタイル)
 *   (2) boss.rage が出現し kind === "enemy" (HP50% = 既存の激怒ラッチを流用)
 *   (3) boss.defeat が出現し kind !== "enemy" (死んだボスは喋らない = 生存味方が歓声)
 *   (4) quest.clear が制覇の瞬間に出る + #resultOverlay 表示後は .speechBubble が 0 件
 *   (5) pageerror ゼロ / __diag critical ゼロ
 *
 * 使い方:  node tools/driver_speech_boss.js [--headful] [--browser <path>] [--port N] [--scen <id>]
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
const PORT = parseInt(arg('port', '8798'), 10);
const SCEN = arg('scen', 'goblin-mine');

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
  console.log((cond ? '  ✅' : '  ❌') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const allPageErrors = [];

// 1 テスト = 1 page.goto (前テストの戦闘 state が次を汚さないように)
async function freshPage(browser) {
  const page = await browser.newPage();
  page.on('pageerror', e => allPageErrors.push(e.message));
  await page.evaluateOnNewDocument((id) => {
    sessionStorage.setItem('dragonfighters.currentScenario', id);
  }, SCEN);
  await page.goto('http://localhost:' + PORT + '/index.html?autoplay=30&diag=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    'window.__speech && typeof gameStarted !== "undefined" && gameStarted && typeof enemies !== "undefined" && enemies.length',
    { timeout: 40000 });
  await sleep(400);
  return page;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT + '  (scen=' + SCEN + ')');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_speechboss_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  // ══ (1) boss.appear — runEncounter([bossIdx]) の先頭で同期発火する ══
  {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => {
      // runEncounter のボス判定は def.maxSummons > 0 (def.isBoss ではない)
      const bi = enemies.findIndex(e => e.def.maxSummons > 0);
      if (bi < 0) return { noBoss: true };
      window.__speech.clear();
      runEncounter([bi]);   // await しない (sayLine は try の前で同期発火する)
      return { bi, bossName: enemies[bi].def.name };
    });
    await sleep(700);
    const got = await page.evaluate(() => {
      const s = window.__speech;
      const el = document.querySelector('.speechBubble');
      const hit = s.log.filter(e => e.key === 'boss.appear');
      return {
        n: hit.length,
        kind: hit.length ? hit[0].kind : '',
        text: hit.length ? hit[0].text : '',
        enemyStyle: el ? el.classList.contains('enemySpeech') : null,
        inMaster: hit.length ? s.lines['boss.appear'].includes(hit[0].text) : false,
      };
    });
    await page.evaluate(() => { gameOver = true; });   // 走り出した戦闘ループを止める
    check('(1) boss.appear が出現する (' + (r.bossName || '?') + ')', got.n >= 1 && got.inMaster,
      'n=' + got.n + ' text="' + got.text + '"');
    check('(1) boss.appear の話者はボス本人 (kind=enemy)', got.kind === 'enemy', 'kind=' + got.kind);
    check('(1) ボスの吹き出しは血赤 (enemySpeech クラス)', got.enemyStyle === true);
    await page.close();
  }

  // ══ (2) boss.rage — HP を 40% に落として enemyAttackTurn を直叩き ══
  {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => {
      // 激怒ゲートは def.isBoss && !def.multiHead (ハイドラは除外)
      const bi = enemies.findIndex(e => e.def.isBoss && !e.def.multiHead);
      if (bi < 0) return { noBoss: true };
      const b = enemies[bi];
      sleepMs = () => Promise.resolve();          // 演出待ちを潰す (時間短縮)
      b.hp = Math.floor(b.maxHp * 0.4);           // ragePhaseHpRatio (既定 0.5) を下回らせる
      window.__speech.clear();
      enemyAttackTurn(bi);                        // await しない (激怒ゲートは関数先頭近くで同期発火)
      return { bi, bossName: b.def.name, ratio: b.def.ragePhaseHpRatio || 0.5 };
    });
    await sleep(800);
    const got = await page.evaluate(() => {
      const s = window.__speech;
      const hit = s.log.filter(e => e.key === 'boss.rage');
      const bi = enemies.findIndex(e => e.def.isBoss && !e.def.multiHead);
      return {
        n: hit.length,
        kind: hit.length ? hit[0].kind : '',
        text: hit.length ? hit[0].text : '',
        inMaster: hit.length ? s.lines['boss.rage'].includes(hit[0].text) : false,
        latched: bi >= 0 ? !!enemies[bi].ragePhaseEntered : false,
      };
    });
    check('(2) boss.rage が出現する (' + (r.bossName || '?') + ', 閾値 ' + (r.ratio || '?') + ')',
      got.n >= 1 && got.inMaster, 'n=' + got.n + ' text="' + got.text + '" latched=' + got.latched);
    check('(2) boss.rage の話者はボス本人 (kind=enemy)', got.kind === 'enemy', 'kind=' + got.kind);
    // 既存の ragePhaseEntered ラッチを流用しているので 2 回目は鳴らない。
    // ※ clearSpeech() は「表示中の吹き出しとキュー」を消すが speechLog (表示履歴) は残す仕様なので、
    //   「log が空になる」ではなく「件数が増えない」で判定する。
    const twice = await page.evaluate(async () => {
      const bi = enemies.findIndex(e => e.def.isBoss && !e.def.multiHead);
      const before = window.__speech.log.filter(e => e.key === 'boss.rage').length;
      window.__speech.clear();
      enemyAttackTurn(bi);   // 既に ragePhaseEntered=true なので激怒ゲートを通らないはず
      await new Promise(r => setTimeout(r, 600));
      const after = window.__speech.log.filter(e => e.key === 'boss.rage').length;
      return { before, after };
    });
    check('(2) 激怒は一度だけ (ragePhaseEntered ラッチ流用・2回目は鳴らない)',
      twice.after === twice.before, 'before=' + twice.before + ' after=' + twice.after);
    await page.evaluate(() => { gameOver = true; });
    await page.close();
  }

  // ══ (3)(4) boss.defeat → quest.clear → resultOverlay で一掃 ══
  {
    const page = await freshPage(browser);
    // (3) ボスを defeatEnemy で倒す → 生存味方が歓声を上げる
    await page.evaluate(() => {
      const bi = enemies.findIndex(e => e.def.isBoss);
      window.__speech.clear();
      defeatEnemy(bi);
    });
    await sleep(700);
    const d = await page.evaluate(() => {
      const s = window.__speech;
      const hit = s.log.filter(e => e.key === 'boss.defeat');
      return {
        n: hit.length,
        kind: hit.length ? hit[0].kind : '',
        text: hit.length ? hit[0].text : '',
        inMaster: hit.length ? s.lines['boss.defeat'].includes(hit[0].text) : false,
      };
    });
    check('(3) boss.defeat が出現する', d.n >= 1 && d.inMaster, 'n=' + d.n + ' text="' + d.text + '"');
    check('(3) 死んだボスは喋らない (kind ≠ enemy = 生存味方の歓声)',
      d.n >= 1 && d.kind !== 'enemy', 'kind=' + d.kind);

    // __diag はここで読む (この後の force-clear は既知の result-double-fire を誘発しうるため)
    const diag = await page.evaluate(() => {
      if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
      const r = window.__diag.getReport();
      return { criticals: (r.totals && r.totals.criticals) || 0,
               violIds: Object.keys((r.current || {}).violations || {}) };
    });
    check('(5) __diag: critical ゼロ (ボスフック直叩き後)',
      !diag.noDiag && diag.criticals === 0,
      diag.noDiag ? 'no __diag' : ('criticals=' + diag.criticals + ' viol=[' + diag.violIds.join(',') + ']'));

    // (4) force-clear → checkDungeonClear をゲームループに任せる (手動呼びは result-double-fire を招く)
    await page.evaluate(() => {
      window.__speech.clear();
      enemies.forEach(e => { e.alive = false; e.hp = 0; });
      for (let i = 0; i < ROOMS.length; i++) visitedRooms.add(i);
    });
    let sawQuestClear = false, questKind = '';
    for (let i = 0; i < 40; i++) {   // 制覇検知 → sayLine("quest.clear") を待つ
      const q = await page.evaluate(() => {
        const hit = window.__speech.log.filter(e => e.key === 'quest.clear');
        return { n: hit.length, kind: hit.length ? hit[0].kind : '' };
      }).catch(() => ({ n: 0, kind: '' }));
      if (q.n > 0) { sawQuestClear = true; questKind = q.kind; break; }
      await sleep(150);
    }
    check('(4) quest.clear が制覇の瞬間に表示される (resultOverlay に隠れない)',
      sawQuestClear, 'kind=' + questKind);
    check('(4) quest.clear の話者はパーティ', questKind === 'player' || questKind === 'ally',
      'kind=' + questKind);

    // showResult (resultOverlay, z=200) が出たら吹き出しは 0 件
    let overlayShown = false, bubblesAtOverlay = -1;
    for (let i = 0; i < 60; i++) {
      const s = await page.evaluate(() => {
        const ov = document.getElementById('resultOverlay');
        const shown = !!(ov && (ov.classList.contains('show') || getComputedStyle(ov).display !== 'none'));
        return { shown, bubbles: document.querySelectorAll('.speechBubble').length,
                 rs: (typeof resultShown !== 'undefined') ? resultShown : false };
      }).catch(() => null);
      if (!s) break;
      if (s.shown || s.rs) { overlayShown = true; bubblesAtOverlay = s.bubbles; break; }
      await sleep(150);
    }
    check('(4) リザルト画面が表示された', overlayShown, 'bubbles=' + bubblesAtOverlay);
    check('(4) リザルト表示後、吹き出しは 0 件 (clearSpeech で一掃)',
      overlayShown && bubblesAtOverlay === 0, 'bubbles=' + bubblesAtOverlay);
    await page.close();
  }

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const realErrs = allPageErrors.filter(m => !/Failed to load resource|favicon/i.test(m));
  check('(5) pageerror ゼロ', realErrs.length === 0, realErrs.join(' | '));

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
