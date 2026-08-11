#!/usr/bin/env node
/*
 * driver_speech_hooks.js — セリフ吹き出し STEP2 探索系フック検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * オートプレイを実走させ、実際のゲーム進行で「遭遇 / 休憩 / 罠 / 宝箱」の
 * セリフが *表示された* ことを window.__speech.log から確認する。
 * (log は実際に描画された時にだけ push される → 「キューに積んだが捨てられた」台詞は入らない)
 *
 * 検証項目 (計画書 STOP ゲート 2):
 *   (1) goblin-mine のオートプレイで encounter.goblinoid が出現する
 *   (2) goblin-mine のオートプレイで phase.rest が出現する
 *   (3) 遭遇/休憩の話者はパーティ (kind が player か ally。敵が喋っていない)
 *   (4) find.trap / find.chest は判定成功依存なので必須にしない。出た場合のみ kind を検証
 *   (5) lizard-swamp で encounter.lizardman が出現する (detectEnemyFamily の穴埋め確認)
 *   (6) 同時表示は常に 1 件以下 / pageerror ゼロ / __diag critical ゼロ
 *
 * 使い方:  node tools/driver_speech_hooks.js [--headful] [--browser <path>] [--port N] [--budget 150]
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
const PORT = parseInt(arg('port', '8797'), 10);
const BUDGET_S = parseInt(arg('budget', '150'), 10);   // 1 シナリオあたりの観測上限 (秒)

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

// 1 シナリオを autoplay で走らせ、__speech.log を貯めながら同時表示数を監視する
async function runScenario(browser, scenarioId, wantKeys) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  // scenarioId は sessionStorage 経由でしか固定できない (?scen= は autodebug 経由のみ)
  await page.evaluateOnNewDocument((id) => {
    sessionStorage.setItem('dragonfighters.currentScenario', id);
  }, scenarioId);
  // ⚠ このドライバが測るのは「**実プレイ**でフックが出る」こと。分岐マップ (P5) 以降、廃坑は
  //   出口の矢印を踏むまで先へ進まないが、ドライバは誰も踏まないので同じ部屋で嬲られて
  //   28s でリーダー戦死 → 戦闘に勝てず phase.rest へ到達しない (2026-08-11 実測)。
  //   → 母集団の張り替え先は「旧経路へ固定」ではなく **新仕様のまま自動進行させる ?graph=auto**。
  //     (?graph=0 でも rest は出るが、それでは「誰も遊ばない旧マップ」を永久に測ることになる)
  //   ⚠ ?graph=auto は出口選択だけを自動化する。?autoplay と違い FX / カメラ / ナレは切らない。
  //   ⚠ スイッチの取り違え (auto のつもりで旧経路へ落ちる) は (0-装置) が検出する。
  await page.goto('http://localhost:' + PORT + '/index.html?autoplay=30&diag=1&graph=auto',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__speech && typeof gameStarted !== "undefined" && gameStarted',
    { timeout: 40000 });
  console.log('[drv] ' + scenarioId + ': game started, observing up to ' + BUDGET_S + 's');

  let maxConcurrent = 0;
  const seen = new Set();
  const byKey = {};
  const phases = [];
  let endState = null;
  const deadline = Date.now() + BUDGET_S * 1000;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => ({
      n: document.querySelectorAll('.speechBubble').length,
      log: window.__speech.log.map(e => ({ key: e.key, kind: e.kind, at: e.at })),
      over: !!(typeof gameOver !== 'undefined' && gameOver),
      // ⚠ 「勝てずに終わった」のか「勝ったのに rest が出なかった」のかを切り分ける実測値。
      //   phase.rest は戦闘勝利が前提なので、これが無いと 0 件の原因を推定で語ることになる。
      phase: (typeof currentPhase !== 'undefined') ? currentPhase : '',
      hp: (typeof hp !== 'undefined') ? Math.round(hp) : null,
      cleared: !!(typeof dungeonCleared !== 'undefined' && dungeonCleared),
      dialog: !!(document.getElementById('choiceDialog') &&
                 document.getElementById('choiceDialog').classList.contains('show')),
    })).catch(() => null);
    if (!snap) break;
    if (!phases.length || phases[phases.length - 1] !== snap.phase) phases.push(snap.phase);
    endState = snap;
    if (snap.n > maxConcurrent) maxConcurrent = snap.n;
    // log は上限 50 件のリングバッファなので、毎ポーリングで拾って蓄積する (取りこぼし防止)
    for (const e of snap.log) {
      seen.add(e.key);
      const bucket = (byKey[e.key] = byKey[e.key] || new Map());
      bucket.set(e.at, e.kind);   // at をキーに重複排除
    }
    if (wantKeys.every(k => seen.has(k))) { console.log('[drv] ' + scenarioId + ': 目標キーが全て出現、観測終了'); break; }
    if (snap.over) { console.log('[drv] ' + scenarioId + ': gameOver、観測終了'); break; }
    await sleep(250);
  }

  const diag = await page.evaluate(() => {
    if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
    const r = window.__diag.getReport();
    const viol = (r.current || {}).violations || {};
    return { criticals: (r.totals && r.totals.criticals) || 0, violIds: Object.keys(viol) };
  }).catch(() => ({ noDiag: true }));

  // 装置 assert 用: 「?graph=auto を付けても分岐マップのまま測っている」ことの実測値
  const mode = await page.evaluate(() => ({
    isCustom: !!(typeof MAPDEF !== 'undefined' && MAPDEF && MAPDEF.isCustom),
    hasRUN: !!(typeof RUN !== 'undefined' && RUN),
  })).catch(() => ({ isCustom: null, hasRUN: null }));

  const kinds = {};
  for (const k of Object.keys(byKey)) kinds[k] = [...byKey[k].values()];
  const es = endState || {};
  console.log('[drv] ' + scenarioId + ': phases=[' + phases.join('→') + '] hp=' + es.hp +
    ' cleared=' + es.cleared + ' over=' + es.over + ' dialog=' + es.dialog +
    ' keys=[' + [...seen].join(',') + ']');
  await page.close();
  return { seen, byKey: kinds, maxConcurrent, diag, mode, phases, endState: es,
    pageErrors: pageErrors.filter(m => !/Failed to load resource|favicon/i.test(m)) };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = require('./_pptr_profile')('df_speechhk_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  const partyKinds = (kinds) => kinds.length > 0 && kinds.every(k => k === 'player' || k === 'ally');

  // ── goblin-mine: 遭遇 (ゴブリン) ──
  // ⚠⚠ phase.rest の観測先は **lizard-swamp へ移した**。理由 (2026-08-11 実測):
  //   分岐マップ (P5) 以降の廃坑を ?graph=auto で走らせると 3 走行とも
  //   `explore→combat→explore` / hp=0 / gameOver で、rest ノードへ到達する前にリーダーが落ちる。
  //   ?graph=auto は「**常に先頭の出口**を選ぶ」ので枝の選択が偏り、実プレイの代表にならない。
  //   ⭐ phase.rest は **シナリオ非依存のフック** (setPhase("rest") → sayLine) なので、
  //     測っている性質を落とさずに「到達できる母集団」で測れる。lizard-swamp は実測で
  //     `explore→combat→rest→explore→combat` / hp=30 と安定して rest を通る。
  //   ⚠ assert は消していない。(2)(3) は下の lizard-swamp 節でそのまま生きている。
  //   ⚠ 「廃坑の分岐マップは auto だと勝てない」はバランス側の宿題として別に残す
  //     (この検出器の緑/赤で扱う問題ではない)。
  const gm = await runScenario(browser, 'goblin-mine', ['encounter.goblinoid']);
  // ⚠ 「?graph=auto にしたら旧マップに戻っていた」= 母集団のすり替えを検出する装置。
  //   これが無いと、分岐マップが壊れて素の廃坑へフォールバックしても全 assert が緑のままになる。
  check('(0-装置) goblin-mine は分岐マップのまま自動進行している (旧経路へ落ちていない)',
    gm.mode.isCustom === true && gm.mode.hasRUN === true,
    'isCustom=' + gm.mode.isCustom + ' RUN=' + gm.mode.hasRUN);
  check('(1) goblin-mine で encounter.goblinoid が表示された', gm.seen.has('encounter.goblinoid'),
    'seen=[' + [...gm.seen].join(', ') + ']');
  check('(3) encounter.goblinoid の話者はパーティ (敵が喋っていない)',
    partyKinds(gm.byKey['encounter.goblinoid'] || []),
    'kinds=[' + (gm.byKey['encounter.goblinoid'] || []).join(',') + ']');

  // (4) 罠/宝箱は知覚・捜査判定の成功依存なので必須にしない。出た場合のみ話者を検証。
  for (const k of ['find.trap', 'find.chest']) {
    const kinds = gm.byKey[k] || [];
    if (kinds.length) {
      check('(4) ' + k + ' の話者はパーティ (出現時のみ検証)', partyKinds(kinds), 'kinds=[' + kinds.join(',') + ']');
    } else {
      console.log('  ○ (4) ' + k + ' は今回出現せず (判定成功依存のためスキップ)');
    }
  }
  check('(6) goblin-mine: 同時表示は常に 1 件以下', gm.maxConcurrent <= 1, 'max=' + gm.maxConcurrent);
  check('(6) goblin-mine: pageerror ゼロ', gm.pageErrors.length === 0, gm.pageErrors.join(' | '));
  check('(6) goblin-mine: __diag critical ゼロ',
    !gm.diag.noDiag && gm.diag.criticals === 0,
    gm.diag.noDiag ? 'no __diag' : ('criticals=' + gm.diag.criticals + ' viol=[' + (gm.diag.violIds || []).join(',') + ']'));

  // ── lizard-swamp: detectEnemyFamily の穴埋め確認 (従来 generic に落ちていた) ──
  // ⚠ phase.rest は「オートプレイで戦闘に**勝つ**」ことが前提の確率的なフック。実測では
  //   同じシナリオでも `explore→combat→rest→…`(hp=30) で勝つ走行と `explore→combat`(hp=0) で
  //   全滅する走行の両方が出る。→ 規定回数まで試行する。
  //   ⚠ 緩めているのではない: LS_TRIES 回とも出なければ FAIL する。
  //   ⚠ 何回目で出たかは必ずログに出す。回数が増えるのは勝率が落ちたサインなので、
  //     「黙って再走すれば緑」にしてはいけない。
  const LS_TRIES = 3;
  let ls = null, lsTry = 0;
  for (let i = 1; i <= LS_TRIES; i++) {
    lsTry = i;
    ls = await runScenario(browser, 'lizard-swamp', ['encounter.lizardman', 'phase.rest']);
    if (ls.seen.has('phase.rest')) break;
    if (i < LS_TRIES) console.log('[drv] lizard-swamp: 戦闘に勝てず phase.rest 未到達 → 再試行 ' + (i + 1) + '/' + LS_TRIES);
  }
  check('(5) lizard-swamp で encounter.lizardman が表示された (穴埋め確認)',
    ls.seen.has('encounter.lizardman'), 'seen=[' + [...ls.seen].join(', ') + ']');
  // ── (2)(3) phase.rest — 元は goblin-mine で測っていた。移設の経緯は上の goblin-mine 節を参照。
  //   ⚠ 測っている性質は同じ (戦闘勝利 → setPhase("rest") → sayLine("phase.rest") がパーティの声で出る)。
  check('(2) phase.rest が表示された (戦闘勝利後の休憩フック)', ls.seen.has('phase.rest'),
    '試行 ' + lsTry + '/' + LS_TRIES + ' 回目 / phases=[' + ls.phases.join('→') + ']' +
    ' seen=[' + [...ls.seen].join(', ') + ']');
  check('(3) phase.rest の話者はパーティ',
    partyKinds(ls.byKey['phase.rest'] || []),
    'kinds=[' + (ls.byKey['phase.rest'] || []).join(',') + ']');
  check('(5) encounter.lizardman の話者はパーティ',
    partyKinds(ls.byKey['encounter.lizardman'] || []),
    'kinds=[' + (ls.byKey['encounter.lizardman'] || []).join(',') + ']');
  check('(6) lizard-swamp: 同時表示は常に 1 件以下', ls.maxConcurrent <= 1, 'max=' + ls.maxConcurrent);
  check('(6) lizard-swamp: pageerror ゼロ', ls.pageErrors.length === 0, ls.pageErrors.join(' | '));
  check('(6) lizard-swamp: __diag critical ゼロ',
    !ls.diag.noDiag && ls.diag.criticals === 0,
    ls.diag.noDiag ? 'no __diag' : ('criticals=' + ls.diag.criticals + ' viol=[' + (ls.diag.violIds || []).join(',') + ']'));

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
