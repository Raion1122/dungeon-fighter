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
const PORT = parseInt(arg('port', '8796'), 10);

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
    await page.evaluate((d) => { playerX += d; }, dir * 45);   // カメラを確実に動かす
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
    await page.evaluate(() => { playerX -= 45 * 6; });   // 元の位置へ戻す
    await sleep(300);
    const alt = await collect(-1);
    if (span(alt) > span(samples)) { samples = alt; dir = -1; }
  }
  const diffs = samples.map(s => Math.abs(s.left - s.expect));
  const maxDiff = diffs.length ? Math.max(...diffs) : 999;
  const camSpan = span(samples);
  check('(4) カメラが実際に動いた (テストが空回りしていない)', camSpan > 20,
    'dir=' + (dir > 0 ? '右' : '左') + ' camXレンジ=' + camSpan.toFixed(1) + 'px / samples=' + samples.length +
    ' / camX=[' + samples.map(s => Math.round(s.camX)).join(',') + ']' +
    ' camTarget=[' + samples.map(s => s.camTargetX === null ? '?' : Math.round(s.camTargetX)).join(',') + ']' +
    ' playerX=[' + samples.map(s => Math.round(s.playerX)).join(',') + ']' +
    ' follow=' + samples.map(s => s.follow ? 1 : 0).join('') +
    ' phase=' + (samples.length ? samples[samples.length - 1].phase : '?') +
    ' over=' + (samples.length ? samples[samples.length - 1].over : '?'));
  check('(4) カメラ追従: 吹き出しが話者の頭上に張り付き続ける (±8px)',
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
    const p2 = await browser.newPage();
    await p2.goto('http://localhost:' + PORT + Q, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p2.waitForFunction(
      'typeof gameStarted !== "undefined" && gameStarted && typeof camX !== "undefined"', { timeout: 30000 });
    await sleep(600);
    const offSpan = await p2.evaluate(camRange());
    await p2.close();
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
      violIds: Object.keys(viol),
    };
  });
  const realErrs = pageErrors.filter(m => !/Failed to load resource|favicon/i.test(m));
  check('(7) pageerror ゼロ', realErrs.length === 0, realErrs.join(' | '));
  check('(7) __diag: critical ゼロ + js-error なし',
    !diag.noDiag && diag.criticals === 0 && !diag.jsErr && !diag.jsRej,
    diag.noDiag ? 'no __diag' : ('criticals=' + diag.criticals + ' viol=[' + diag.violIds.join(',') + ']'));

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
