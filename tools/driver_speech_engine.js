#!/usr/bin/env node
/*
 * driver_speech_engine.js — セリフ吹き出し (speech-bubble v1) STEP1 エンジン検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * index.html の SPEECH_LINES / キュー / sayLine / updateSpeechBubbles を、
 * フックを介さず window.__speech から直叩きして検証する (STEP1 時点ではフックゼロ)。
 *
 * 検証項目 (計画書 flickering-sparking-rivest.md の STOP ゲート 1):
 *   (1) say("find.chest") → 吹き出しが 1 件出て、文言が SPEECH_LINES["find.chest"] に含まれる
 *   (2) 約 2.0s 後に自動撤去され 0 件になる
 *   (3) 3 連投しても同時存在は常に 1 件以下 (単一キュー)
 *   (4) カメラ追従: 吹き出しの x が話者の頭上に張り付き続ける (カメラが動く中で ±8px 以内)
 *       ← 「表示時の座標に固定」方式なら必ず落ちる回帰ゲート
 *   (5) updateSpeechBubbles にレイアウト読み取り (offsetWidth 等) が含まれない
 *       ← camera-perf の禁忌 (毎フレームの強制同期レイアウト) の機械ゲート
 *   (6) 死亡した話者では出ず、生存した話者では出る
 *   (7) pageerror ゼロ / __diag の critical・js-error ゼロ
 *
 * 使い方:  node tools/driver_speech_engine.js [--headful] [--browser <path>] [--port N]
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
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', MUTATE ? '10627' : '8796'), 10);
const T_START = Date.now();

/* ══════════════════════════════════════════════════════════════════════════════
 * [#91 §8 §2] 配信スナップショット + 変異 (負のコントロール)。
 *   形は verify_mage_hand.js の変異表と判定を写した: 起動時に index.html を 1 回だけ読んで凍結し、
 *   変異はその文字列へ実行時に注入して配る (⛔ 本番ファイルは書き換えない)。
 *   --negative = 素の基準 1 回 + 変異ごとに子プロセス 1 本 (port 10627〜)。担当と**完全一致**・
 *   注入行の到達 > 0・担当外の赤 0 を要求する。
 * ══════════════════════════════════════════════════════════════════════════════ */
const PRISTINE_INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
/* 印はコンソールではなくページの変数へ数える (updateSpeechBubbles は毎フレーム呼ばれるので console は溢れる) */
const HITVAR = (k) => 'window.__MUTHIT__' + k;
const MUTATIONS = {
  /* 吹き出しの left を最初に書いた座標に固定する (= 「表示時の座標に固定」方式の回帰)。印は固定値を使ったフレーム */
  bubblepin: [
    { from: 'b.el.style.left = SX(a.x) + "px";',
      to: 'b.el.style.left = (b.__pinX === undefined ? (b.__pinX = SX(a.x)) : (' + HITVAR('bubblepin') + ' = (' + HITVAR('bubblepin') + ' || 0) + 1, b.__pinX)) + "px";   /* ★変異bubblepin */' }],
};
const MUT_PORT = { bubblepin: 10627 };
/* 変異 → 赤くなるべき check (担当)。check の名前で引く */
const L4_SPAN = '(4) カメラが実際に動いた (テストが空回りしていない)';
const L4_FOLLOW = '(4) カメラ追従: 吹き出しが話者の頭上に張り付き続ける (±8px)';
const L4_EXPLORE = '(4-装置) 探索中・戦闘外で測った (全サンプル phase=explore)';
const NEG_EXPECT = {
  bubblepin: [L4_FOLLOW],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
if (countOf(PRISTINE_INDEX, '__MUTHIT__') !== 0) vetFail('原本に __MUTHIT__ が在る');
{
  /* ⭐ #89 の教訓: 自分のアンカーが他の tools の文字列に出てこないこと (同じ行を測る本と衝突しない) */
  const self = path.basename(__filename);
  const peers = fs.readdirSync(__dirname).filter((f) => /\.(js|mjs|py|ps1)$/.test(f) && f !== self);
  for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
    const c = countOf(PRISTINE_INDEX, e.from);
    if (c !== 1) vetFail('変異 ' + k + ' の注入点が 1 箇所ではない (index.html に ' + c + ' 件)');
    if (countOf(PRISTINE_INDEX, e.to) !== 0) vetFail('変異 ' + k + ' の注入文字列が原本に既に在る');
    if (e.to.indexOf('__MUTHIT__' + k) < 0) vetFail('変異 ' + k + ' に実行の印が無い');
    const core = e.from.trim();
    const clash = peers.filter((f) => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8').indexOf(core) >= 0; } catch (x) { return false; } });
    if (clash.length) vetFail('変異 ' + k + ' のアンカーが他の tools に出てくる: ' + clash.join(','));
  }
}
function servedIndex(key) {
  if (!key) return PRISTINE_INDEX;
  let s = PRISTINE_INDEX;
  for (const e of MUTATIONS[key]) s = s.split(e.from).join(e.to);
  if (s === PRISTINE_INDEX) vetFail('変異 ' + key + ' が何も変えていない');
  if (s.split('\n').length !== PRISTINE_INDEX.split('\n').length) vetFail('変異 ' + key + ' が行数を変えた');
  return s;
}
const SERVED_INDEX = servedIndex(MUTATE);

/* --negative: 自分を子プロセスで 1 本ずつ起こし、最後の 1 行 (__RESULT__{json}) で判定する */
if (NEGATIVE) {
  const { spawnSync } = require('child_process');
  const runChild = (extra, label) => {
    console.log('\n[vet] ════════ ' + label + ' ════════');
    const r = spawnSync(process.execPath, [__filename].concat(extra).concat(HEADFUL ? ['--headful'] : []),
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
    const out = (r.stdout || '') + (r.stderr || '');
    process.stdout.write(out.split('\n').filter((l) => l.indexOf('__RESULT__') !== 0).map((l) => '    ' + l).join('\n') + '\n');
    const line = out.split('\n').reverse().find((l) => l.indexOf('__RESULT__') === 0);
    if (!line) return null;
    try { return JSON.parse(line.slice('__RESULT__'.length)); } catch (e) { return null; }
  };
  let exitCode = 0;
  const R0 = runChild(['--port', String(PORT)], '(素・基準) port ' + PORT);
  const red0 = R0 ? R0.results.filter((x) => !x.ok).map((x) => x.name) : null;
  if (!R0 || red0.length || Object.keys(R0.hits).length) {
    console.error('[vet] ⛔ 素の基準で FAIL がある / 結果が取れない / 変異の印が出た (' + JSON.stringify(R0 && R0.hits) + ') — 先にそれを直すこと (変異は走らせない)'
      + (red0 && red0.length ? '  赤=' + red0.join(' | ') : ''));
    exitCode = 1;
  } else {
    const names0 = R0.results.map((x) => x.name);
    const report = [];
    for (const key of MUT_ORDER) {
      const R = runChild(['--mutate', key, '--port', String(MUT_PORT[key])], '[変異 ' + key + '] port ' + MUT_PORT[key]);
      const want = NEG_EXPECT[key] || [];
      const red = R ? R.results.filter((x) => !x.ok).map((x) => x.name) : [];
      const hit = R ? (R.hits[key] || 0) : 0;
      const bootOk = !!R && R.results.filter((x) => /^\(0\)/.test(x.name)).every((x) => x.ok);
      const absent = R ? names0.filter((n) => !R.results.some((x) => x.name === n)) : names0;
      const miss = want.filter((w) => red.indexOf(w) < 0);
      const leak = red.filter((x) => want.indexOf(x) < 0);
      const ok = !!R && bootOk && hit > 0 && want.length > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
      console.log('[vet] --negative ' + key + ': 担当=' + want.join(' | ') + ' / 実際に赤くなった=' + (red.join(' | ') || '(なし)')
        + ' / 注入行の実行 ' + hit + ' 回 / 起動確認 ' + (bootOk ? 'OK' : 'NG') + ' → ' + (ok ? '✓ OK' : '✗ '
        + (!R ? '結果が取れない ' : '') + (!bootOk ? '起動確認 NG ' : '') + (hit ? '' : '注入行が実行されていない ')
        + (miss.length ? '空振り ' + miss.join(' | ') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(' | ') + ' ' : '')
        + (absent.length ? '判定が出ていない ' + absent.join(' | ') : '')));
      report.push({ key, ok });
      if (!ok) exitCode = 1;
    }
    console.log('\n[vet] 負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (赤 = 担当に完全一致)');
  }
  console.log('[vet] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
}

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
        if (u === '/index.html') {   // [#91] 凍結したスナップショット (変異時は注入済み) を配る
          res.setHeader('Content-Type', MIME['.html']); res.setHeader('Cache-Control', 'no-store');
          res.end(Buffer.from(SERVED_INDEX, 'utf8')); return;
        }
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

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = require('./_pptr_profile')('df_speech_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  // ⚠ 母集団は **?graph=0 (従来の単一マップ) へ固定する**。(4) はカメラが実際に動くことを前提に
  //   吹き出しの追従を測るが、分岐マップ (P5) の entry ノードは可視域が狭く
  //   **カメラ可動域が 152px しかない** (従来マップは 3705px・2026-08-11 実測)。
  //   オートプレイで端へ寄ると camX が 1px も動かず、(4) が丸ごと空回りする。
  //   測っているのは「カメラ追従エンジン」でありマップではないので旧経路へ固定するのが正しい。
  //   ⚠ スイッチが黙って無効化されても緑にならないよう、(4-装置) で外した側を対で実測する。
  const Q = '/index.html?scen=goblin-mine&autoplay=15&autodebug=1';
  /* ★[#91 §4-2] 待つ間に全滅しないよう Lv10 (probe_boss_latch と同じ種)。(4) は「探索中」を待って測るが、
   *   Lv1 は 40 秒前後で全滅し以後は探索へ戻らない (「探索を待つだけ」の素直な案は 3/3 失敗・依頼書 §2-2)。
   *   (1)〜(6) の check はどれも勝敗に依存しない。⚠ (7) への副作用は (7) の注記を見ること。 */
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {} });
  if (MUTATE) console.log('[drv] 変異 ' + MUTATE + ' を注入した index.html を配信 (port ' + PORT + ')');
  await page.goto('http://localhost:' + PORT + Q + '&graph=0',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  // ゲームループ (renderWorld → updateSpeechBubbles) が回り始めるのを待つ
  await page.waitForFunction(
    'window.__speech && typeof gameStarted !== "undefined" && gameStarted && typeof camX !== "undefined"',
    { timeout: 30000 });
  await sleep(600);
  console.log('[drv] game started');

  // ── (0) API サーフェス ──
  const api = await page.evaluate(() => {
    const s = window.__speech;
    return {
      hasSay: typeof s.say === 'function',
      hasUpdate: typeof s.update === 'function',
      hasClear: typeof s.clear === 'function',
      lineKeys: Object.keys(s.lines).length,
      chestLines: s.lines['find.chest'] || [],
      // 表示関数が renderWorld から実際に呼ばれる配線になっているか (関数ソースに 1 行入っている)
      wiredInRenderWorld: /updateSpeechBubbles\(\)/.test(String(window.renderWorld || '')),
    };
  });
  check('(0) __speech API (say/update/clear) が公開されている',
    api.hasSay && api.hasUpdate && api.hasClear, 'lineKeys=' + api.lineKeys);
  check('(0) renderWorld() から updateSpeechBubbles() を呼んでいる', api.wiredInRenderWorld);

  // ── (1) say("find.chest") → 1 件出る / 文言がマスタに含まれる ──
  await page.evaluate(() => { window.__speech.clear(); window.__speech.say('find.chest'); });
  await sleep(250);
  const r1 = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.speechBubble'));
    const s = window.__speech;
    return {
      n: els.length,
      text: els.length ? els[0].textContent : '',
      inMaster: els.length ? s.lines['find.chest'].includes(els[0].textContent) : false,
      isEnemyStyle: els.length ? els[0].classList.contains('enemySpeech') : null,
      logKind: s.log.length ? s.log[s.log.length - 1].kind : '',
      z: els.length ? getComputedStyle(els[0]).zIndex : '',
      pe: els.length ? getComputedStyle(els[0]).pointerEvents : '',
    };
  });
  check('(1) say("find.chest") で吹き出しが 1 件出る', r1.n === 1, 'n=' + r1.n + ' text="' + r1.text + '"');
  check('(1) 文言が SPEECH_LINES["find.chest"] に含まれる', r1.inMaster, '"' + r1.text + '"');
  check('(1) パーティ台詞は羊皮紙風 (enemySpeech クラスなし)', r1.isEnemyStyle === false,
    'kind=' + r1.logKind);
  check('(1) z-index=45 / pointer-events:none', r1.z === '45' && r1.pe === 'none',
    'z=' + r1.z + ' pe=' + r1.pe);

  // ── (2) 約 2.0s 後に自動撤去 ──
  // このドライバは autoplay 付きで走るので、STEP2/3 のフックが入った後は待機中に
  // ゲーム自身が sayLine することがある。「画面上の吹き出しが全部で 0 件」だと
  // それを拾って偽陰性になる → (1) で出した吹き出し本体が DOM から外れたかを見る。
  await page.evaluate(() => {
    window.__speech._probe = window.__speech.active.length ? window.__speech.active[0].el : null;
  });
  await sleep(2100);
  const r2 = await page.evaluate(() => ({
    had: !!window.__speech._probe,
    gone: !!window.__speech._probe && !window.__speech._probe.isConnected,
    others: Array.from(document.querySelectorAll('.speechBubble')).map(e => e.textContent),
  }));
  check('(2) 約 2.0s 後に自動撤去される', r2.had && r2.gone,
    'gone=' + r2.gone + (r2.others.length
      ? ' / 別の吹き出しあり(ゲーム側フック由来): ' + JSON.stringify(r2.others)
      : ' / 残存なし'));

  // ── (3) 3 連投しても同時存在は常に 1 件以下 ──
  await page.evaluate(() => {
    window.__speech.clear();
    window.__speech.say('find.chest');
    window.__speech.say('find.trap');
    window.__speech.say('phase.rest');
  });
  let maxConcurrent = 0;
  for (let i = 0; i < 30; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('.speechBubble').length);
    if (n > maxConcurrent) maxConcurrent = n;
    await sleep(100);
  }
  check('(3) 3 連投しても同時存在は常に 1 件以下 (単一キュー)', maxConcurrent <= 1,
    'maxConcurrent=' + maxConcurrent);
  await page.evaluate(() => window.__speech.clear());

  // ── (4) カメラ追従 (最重要の回帰ゲート) ──
  // 話者をリーダー固定にし、プレイヤーを動かしてカメラを動かす。
  // 吹き出しの style.left が毎フレーム (playerX + 48 - camX) に追従し続けることを見る。
  /* ★[#91 §4-2] 探索中・戦闘外を見つけたら**同じ evaluate の中で** dialogPaused = true にして時間を止める
   *   (moveEnemies 先頭で heroAI・敵の移動・tryStartEncounter が止まる。描画 renderWorld → updateSpeechBubbles は回る)。
   *   ⚠ 見つける evaluate と止める evaluate を分けると、その間に戦闘が始まる隙ができる。
   *   ⚠ 戦闘中に測ると camFocus がカメラを握り (camXレンジの赤)、戦闘の前進が playerX を書き戻す (±8px の赤)。 */
  let explored = true;
  {
    const t0 = Date.now();
    for (;;) {
      const ok = await page.evaluate(() => {
        if (gameOver || currentPhase !== 'explore' || encounterActive || camFocus || dialogPaused || skillCheckActive) return false;
        dialogPaused = true; return true;
      });
      if (ok) break;
      if (Date.now() - t0 > 120000) { explored = false; break; }
      await sleep(100);
    }
  }
  const pausedAt = Date.now();
  console.log('[drv] (4) 一時停止 ' + new Date(pausedAt).toISOString() + ' explored=' + explored);
  await page.waitForFunction('!heroSliding', { polling: 'raf', timeout: 10000 }).catch(() => {});
  await page.evaluate(() => { window.__speech.clear(); window.__speech.say('find.chest', 'player'); });
  await sleep(200);
  // ⚠ 向きを右に決め打ちすると、測定開始時点で **カメラ可動域の右端にクランプ**していた場合に
  //   playerX をいくら足しても camX が 1px も動かず、この節が丸ごと空回りする
  //   (2026-08-11 実測: 分岐マップの entry ノードは可視域が狭く camX=camTarget=3040 に張り付いた)。
  //   → 「カメラが動く母集団」へ確実に到達するため、右で動かなければ左でも測る。
  //     ⚠ assert (camSpan > 20 / ±8px) は緩めない。動く向きを探すだけ。
  const span = (xs) => xs.length ? Math.max(...xs.map(s => s.camX)) - Math.min(...xs.map(s => s.camX)) : 0;
  async function collect(dir) {
    const out = [];
    for (let i = 0; i < 6; i++) {
    // ★ 世界を動かす操作と測定は必ず別 evaluate に分ける。
    //   同じ evaluate 内で playerX を動かして直後に style.left を読むと、
    //   「1 フレーム前に書かれた left」と「更新後の playerX」を比べることになり、
    //   追従できていてもナッジ量ぶんの誤差 (=45px) が必ず出る (偽陰性)。
    // [#91] moveEnemies が止まっている (中の updatePositions も止まる) ので、本番の入口を自分で叩く
    await page.evaluate((d) => { playerX += d; updatePositions(); }, dir * 45);   // カメラを確実に動かす
    await sleep(220);                                // renderWorld が新しい camX で再配置するのを待つ
    const s = await page.evaluate(() => {
      const el = document.querySelector('.speechBubble');
      if (!el) return null;
      return {
        left: parseFloat(el.style.left),
        expect: playerX + 48 - camX,   // speechAnchor("player").x - camX
        camX: camX,
        // ⚠ camSpan=0 を見たときに「クランプで端に張り付いた」のか「追従ループが止まっている」のか
        //   「戦闘でターゲットが別へ移った」のかを *その場で* 切り分けるための実測値。
        camTargetX: (typeof camTargetX !== 'undefined') ? camTargetX : null,
        follow: (typeof cameraFollowActive !== 'undefined') ? cameraFollowActive : null,
        phase: (typeof currentPhase !== 'undefined') ? currentPhase : '',
        over: (typeof gameOver !== 'undefined') ? gameOver : null,
        playerX: playerX,
      };
    });
      if (s) out.push(s);
    }
    return out;
  }
  let dir = +1;
  let samples = await collect(dir);
  if (span(samples) <= 20) {                 // 右端クランプ → 逆向きで測り直す
    await page.evaluate(() => { playerX -= 45 * 6; updatePositions(); });   // 元の位置へ戻す
    await sleep(300);
    const alt = await collect(-1);
    if (span(alt) > span(samples)) { samples = alt; dir = -1; }
  }
  const pausedMs = Date.now() - pausedAt;
  if (explored) await page.evaluate(() => { dialogPaused = false; });   // [#91] 時間を戻す
  console.log('[drv] (4) 再開 ' + new Date().toISOString() + ' (一時停止 ' + pausedMs + 'ms)');
  check(L4_EXPLORE, explored && samples.length > 0 && samples.every(s => s.phase === 'explore'),
    'explored=' + explored + ' phases=' + samples.map(s => (s.phase || '?')[0]).join('') + ' 一時停止 ' + pausedMs + 'ms');
  const diffs = samples.map(s => Math.abs(s.left - s.expect));
  const maxDiff = diffs.length ? Math.max(...diffs) : 999;
  const camSpan = span(samples);
  check(L4_SPAN, camSpan > 20,
    'dir=' + (dir > 0 ? '右' : '左') + ' camXレンジ=' + camSpan.toFixed(1) + 'px / samples=' + samples.length +
    ' / camX=[' + samples.map(s => Math.round(s.camX)).join(',') + ']' +
    ' camTarget=[' + samples.map(s => s.camTargetX === null ? '?' : Math.round(s.camTargetX)).join(',') + ']' +
    ' playerX=[' + samples.map(s => Math.round(s.playerX)).join(',') + ']' +
    ' follow=' + samples.map(s => s.follow ? 1 : 0).join('') +
    ' phase=' + (samples.length ? samples[samples.length - 1].phase : '?') +
    ' over=' + (samples.length ? samples[samples.length - 1].over : '?'));
  check(L4_FOLLOW,
    samples.length >= 5 && maxDiff <= 8,
    'maxDiff=' + maxDiff.toFixed(1) + 'px (samples=' + samples.length + ')');

  // ── (4-装置) 撤退スイッチ ?graph=0 が本当に効いているか (外した側を対で実測) ──
  //   これが無いと「スイッチが黙って無効化されても緑」になり、(4) は再び空回りへ戻る。
  {
    const camRange = () => `(() => {
      const W = mapData[0].length * TILE_SIZE, saved = playerX;
      let lo = Infinity, hi = -Infinity;
      for (let x = 0; x <= W; x += 48) { playerX = x; computeCameraTarget();
        if (camTargetX < lo) lo = camTargetX; if (camTargetX > hi) hi = camTargetX; }
      playerX = saved; computeCameraTarget();
      return { isCustom: !!(typeof MAPDEF !== 'undefined' && MAPDEF && MAPDEF.isCustom),
               span: Math.round(hi - lo) };
    })()`;
    const onSpan = await page.evaluate(camRange());
    console.log('[drv] (4-装置) p2 を開く ' + new Date().toISOString());
    const p2 = await browser.newPage();
    await p2.goto('http://localhost:' + PORT + Q, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p2.waitForFunction(
      'typeof gameStarted !== "undefined" && gameStarted && typeof camX !== "undefined"', { timeout: 30000 });
    await sleep(600);
    const offSpan = await p2.evaluate(camRange());
    await p2.close();
    console.log('[drv] (4-装置) p2 を閉じた ' + new Date().toISOString() + ' 主ページ visibility=' + await page.evaluate(() => document.visibilityState));
    // ⚠ 判定軸は isCustom の対比だけにする。可動域は **測定時のフェーズで大きく振れる**
    //   (?graph=0 実測: 探索中 3705px / 戦闘中 546px) ので assert に混ぜるとフレークになる。
    //   → 数値は detail にだけ残し、「(4) が空回りしていないか」は (4) 本体が受け持つ。
    check('(4-装置) ?graph=0 が効いている (外すと分岐版 isCustom=true になる)',
      onSpan.isCustom === false && offSpan.isCustom === true,
      'graph=0: isCustom=' + onSpan.isCustom + ' 可動域=' + onSpan.span + 'px / ' +
      '既定: isCustom=' + offSpan.isCustom + ' 可動域=' + offSpan.span + 'px');
  }
  await page.evaluate(() => window.__speech.clear());

  // ── (5) updateSpeechBubbles にレイアウト読み取りが無い (camera-perf の禁忌) ──
  const layoutRead = await page.evaluate(() => {
    const src = String(window.__speech.update);
    const m = src.match(/offsetWidth|offsetHeight|clientWidth|clientHeight|getBoundingClientRect|getComputedStyle|offsetTop|offsetLeft/);
    return m ? m[0] : null;
  });
  check('(5) updateSpeechBubbles にレイアウト読み取りが無い (強制同期レイアウト禁止)',
    layoutRead === null, layoutRead ? ('禁止 API を検出: ' + layoutRead) : 'クリーン');

  // ── (6) 死亡した話者では出ない / 生存した話者では出る ──
  // ⚠ 全体件数で数えてはいけない: autoplay 中はゲーム自身が喋る (v2 の敵の鳴き声で更に増えた)。
  // 「我々が渡したスタブ話者の吹き出しが出ていないこと」を identity (b.unit === stub) で見る。
  const dead6 = await page.evaluate(async () => {
    const s = window.__speech;
    s.clear();
    const stub = { alive: false, x: 300, y: 300, classKey: 'warrior', def: { displaySize: 96 } };
    s.say('find.chest', stub);
    await new Promise(r => setTimeout(r, 400));
    return {
      mine: s.active.filter(b => b.unit === stub).length,   // ← 本命: 0 でなければならない
      strays: s.active.filter(b => b.unit !== stub).map(b => b.el.textContent),   // 背景のゲーム発話 (無罪)
    };
  });
  check('(6) 死亡した話者では吹き出しが出ない', dead6.mine === 0,
    'mine=' + dead6.mine + (dead6.strays.length ? ' / 背景の発話(無罪): ' + dead6.strays.join(',') : ''));

  await page.evaluate(() => {
    window.__speech.clear();
    window.__speech.say('find.chest', { alive: true, x: 300, y: 300, classKey: 'warrior', def: { displaySize: 96 } });
  });
  await sleep(400);
  const alive6 = await page.evaluate(() => {
    const els = document.querySelectorAll('.speechBubble');
    const s = window.__speech;
    return { n: els.length, kind: s.log.length ? s.log[s.log.length - 1].kind : '' };
  });
  check('(6) 生存した話者では吹き出しが出る (kind=ally)', alive6.n === 1 && alive6.kind === 'ally',
    'n=' + alive6.n + ' kind=' + alive6.kind);

  // 表示中に話者が死んだら即撤去される (ライフサイクル)
  const died = await page.evaluate(async () => {
    const s = window.__speech;
    s.clear();
    const stub = { alive: true, x: 300, y: 300, classKey: 'warrior', def: { displaySize: 96 } };
    s.say('find.chest', stub);
    await new Promise(r => setTimeout(r, 300));
    const before = document.querySelectorAll('.speechBubble').length;
    stub.alive = false;   // 表示中に死亡
    await new Promise(r => setTimeout(r, 300));
    const after = document.querySelectorAll('.speechBubble').length;
    return { before, after };
  });
  check('(6) 表示中に話者が死んだら即撤去される', died.before === 1 && died.after === 0,
    'before=' + died.before + ' after=' + died.after);
  await page.evaluate(() => window.__speech.clear());

  // ── (7) pageerror / __diag ──
  const diag = await page.evaluate(() => {
    if (!window.__diag || !window.__diag.getReport) return { noDiag: true };
    const r = window.__diag.getReport();
    const viol = (r.current || {}).violations || {};
    return {
      criticals: (r.totals && r.totals.criticals) || 0,
      jsErr: !!viol['js-error'], jsRej: !!viol['js-rejection'],
      noRound: !!(viol['combat-no-round'] && viol['combat-no-round'].sev === 'critical'),
      violIds: Object.keys(viol),
      // [#91] critical の中身 (いつ・何ラウンド目) を detail に残す (切り分け用)
      critDetail: Object.keys(viol).filter(k => viol[k] && viol[k].sev === 'critical').map(k => k + ':' + JSON.stringify({ first: viol[k].firstTs, last: viol[k].lastTs, n: viol[k].count, d: viol[k].detail })),
      nowTs: new Date().toISOString(),
    };
  });
  const realErrs = pageErrors.filter(m => !/Failed to load resource|favicon/i.test(m));
  check('(7) pageerror ゼロ', realErrs.length === 0, realErrs.join(' | '));
  /* ★[#91 依頼書 §12-1 K2] combat-no-round (「1 ラウンドが実時間 15 秒進まない」の critical) だけは数えない。
   *   §4-2 の Lv10 の種で 1 ラウンドが長くなり (この機械の実測で最大 17.0 秒)、**ドライバ無しの素のページでも**
   *   8 回中 1 回鳴った (= 吹き出しエンジンとも一時停止とも無関係な、種と機械速度の産物)。ドライバ込みでは 9 回中 2 回。
   *   ⚠ 無限ループの実体は combat-runaway (100 ラウンド) と run-timeout が critical のまま測る。
   *   ⚠ 外すのはこの 1 種だけ。js-error / js-rejection / 他の critical はそのまま赤にする。 */
  const critOther = diag.noDiag ? -1 : diag.criticals - (diag.noRound ? 1 : 0);
  check('(7) __diag: critical ゼロ + js-error なし',
    !diag.noDiag && critOther === 0 && !diag.jsErr && !diag.jsRej,
    diag.noDiag ? 'no __diag' : ('criticals=' + diag.criticals + ' (combat-no-round を除くと ' + critOther + ') viol=[' + diag.violIds.join(',') + ']' +
      (diag.critDetail.length ? ' ' + diag.critDetail.join(' ') + ' (読んだ時刻 ' + diag.nowTs + ')' : '')));

  // [#91] 変異の印 (ページの変数に数えた) を閉じる前に読む
  const hits = {};
  if (MUTATE) { try { hits[MUTATE] = await page.evaluate((k) => window['__MUTHIT__' + k] || 0, MUTATE); } catch (e) { hits[MUTATE] = 0; } }
  else { try { Object.assign(hits, await page.evaluate(() => { const o = {}; for (const k of Object.keys(window)) if (k.indexOf('__MUTHIT__') === 0) o[k.slice(10)] = window[k]; return o; })); } catch (e) {} }
  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  if (MUTATE) console.log('[driver] 変異 ' + MUTATE + ' の注入行の実行 ' + (hits[MUTATE] || 0) + ' 回');
  console.log('__RESULT__' + JSON.stringify({ results: results.map(r => ({ name: r.name, ok: r.ok })), hits: hits }));
  if (MUTATE) process.exit(0);
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
