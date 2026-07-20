#!/usr/bin/env node
/*
 * driver_log_compact.js — 「出荷前の大掃除」フェーズ2 (④UI) 検証ドライバ
 *
 *   node tools/driver_log_compact.js [--headful] [--browser <path>] [--port N]
 *
 * 対象は index.html 単独の 1 点:
 *   body.ui-compact (スマホ) 限定で戦闘ログの line-height を 1.5 → 1.3 に詰め、
 *   ::before「戦闘ログ」見出しを (消さずに) 圧縮する。
 *
 * ⚠️ 本ドライバの本体は「行が詰まったか」ではなく **枠が広がっていないか** の監視である。
 *    ログ枠を広げると index.html:3884 が毎フレーム評価する fieldHasSkyRoom(usableH >= 440) を割り、
 *    屋外フィールドの地平線ビューがプレイ中に黙って崩壊する。iPhone SE(h=667) は
 *    667 - (120 + 64) = 483 でギリギリ通過しているだけ。desktop は UI_MINIBAR_H=0 のため
 *    絶対に再現せず、目視では一生気づけない種類の事故なので機械で押さえる。
 *
 * ⚠️ 枠高の不変量は getComputedStyle(#combatLog).height === '120px' **だけ**。
 *    clientHeight / getBoundingClientRect().height は padding を含むので、
 *    正しい実装が FAIL し誤実装が PASS する。
 *
 * ⚠️ 倍率・比率は assert に書かない。「1.7倍」のような目標値を追うと、誰かが必ず height に手を出す。
 *    測るのは defect そのもの = **枠に収まる行数** と、実測の行ボックス高。
 *
 * ⚠️ UI_LOG_HEIGHT / fieldHasSkyRoom / cameraBottomHud は classic script 直下の let/const/function
 *    であり window プロパティではない。window.X は undefined で両側 PASS になるので bare 名で読む。
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
const PORT    = parseInt(arg('port', '8821'), 10);

// iPhone SE 縦持ち = 現行で最も余裕の無い出荷対象 (usableH=483 vs 閾値 440)。
const VP_COMPACT = { width: 375, height: 667 };
const VP_DESKTOP = { width: 1280, height: 800 };

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

// ⚠️ ビューポートは goto の**前**に確定させる。computeUiMetrics() の初回適用はスクリプト
//    評価中 (3763) に走るので、後から resize すると compact 判定の初期値とフォグ解像度
//    (camera-perf STEP7) がズレた状態を測ることになる。
async function freshPage(browser, viewport) {
  const page = await browser.newPage();
  page.on('pageerror', e => allPageErrors.push(e.message));
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
  });
  await page.goto('http://localhost:' + PORT + '/index.html?autoplay=30&diag=1',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    'typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
    { timeout: 45000 });
  await sleep(400);
  return page;
}

// 戦闘の自走がログを追記して測定を汚さないよう、敵を遠ざけて静穏化する。
// gameOver は立てない (立てると updateInfo 経路の一部が早期 return する)。
const QUIET = `
  try { enemies.forEach(e => { e.x = -999999; e.y = -999999; }); } catch (e) {}
  try { encounterActive = false; } catch (e) {}
`;

// 枠に収まる行数と実測の行ボックス高を測る共通ルーチン。
// 行の高さは rect.height ではなく **隣接 2 行の top 差** で測る (1 行が実際に消費する
// 垂直方向の量そのもの = padding や margin の扱い方に依存しない)。
const MEASURE = `(() => {
  const el = document.getElementById('combatLog');
  const cs = getComputedStyle(el);
  for (let i = 0; i < 12; i++) appendLog('計測' + i);   // 測定用に十分な行数を積む
  const lines = [].slice.call(el.querySelectorAll('.logLine'));
  const step = lines[1].getBoundingClientRect().top - lines[0].getBoundingClientRect().top;
  const contentH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return {
    frameH:     cs.height,                    // ← 枠高の不変量はこれだけ
    lineHeight: cs.lineHeight,
    step: step,                               // 1 行が消費する高さ
    rectH:      lines[0].getBoundingClientRect().height,
    contentH: contentH,
    visible:    Math.floor(contentH / step),  // 完全に見える行数 = defect そのもの
    beforeFont:    getComputedStyle(el, '::before').fontSize,
    beforeContent: getComputedStyle(el, '::before').content,
    compact:    document.body.classList.contains('ui-compact'),
  };
})()`;

(async () => {
  const puppeteer   = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_logcompact_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  let compactM = null, desktopM = null;

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (A) compact (iPhone SE 375x667): 行が詰まり、枠は変わらない ---');
  {
    const page = await freshPage(browser, VP_COMPACT);
    await page.evaluate(QUIET);
    const m = compactM = await page.evaluate(MEASURE);

    check('(A0/前提) body.ui-compact が付いている (これが無いと以降は全て空振り)',
      m.compact === true, JSON.stringify({ compact: m.compact, vp: VP_COMPACT }));
    check('(A1) 枠高の不変量: getComputedStyle(#combatLog).height が "120px" のまま',
      m.frameH === '120px', 'height=' + m.frameH);
    check('(A2) compact の line-height が 1.3 相当 (13px x 1.3 = 16.9px)',
      m.lineHeight === '16.9px', 'line-height=' + m.lineHeight);
    check('(A3) ::before 見出しが「消えていない」(意匠の維持)',
      /戦闘ログ/.test(m.beforeContent), 'content=' + m.beforeContent);
    check('(A4) ::before が圧縮されている (11px → 10px)',
      m.beforeFont === '10px', 'font-size=' + m.beforeFont);

    // ── ★ defect を直接測る: 「行間を戻す」と可視行数が減ることを同一ページで確認する。
    //    比率や目標値ではなく、同じ枠に何行入るかという体験そのものを測る。
    const revert = await page.evaluate(`(() => {
      const el = document.getElementById('combatLog');
      el.style.lineHeight = '1.5';          // 変更前 (desktop 既定) を compact に再現
      const cs = getComputedStyle(el);
      const lines = [].slice.call(el.querySelectorAll('.logLine'));
      const step = lines[1].getBoundingClientRect().top - lines[0].getBoundingClientRect().top;
      const contentH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const out = { step: step, visible: Math.floor(contentH / step), frameH: cs.height };
      el.style.lineHeight = '';             // 復帰
      return out;
    })()`);
    check('(A5/負のコントロール) line-height を 1.5 に戻すと 1 行が消費する高さが増える',
      revert.step > m.step, 'compact=' + m.step + 'px vs 変更前=' + revert.step + 'px');
    check('(A6) 同じ 120px 枠に収まる行数が増えている (defect の直接測定)',
      m.visible > revert.visible, '改善後=' + m.visible + '行 / 変更前=' + revert.visible + '行');
    check('(A6b/負のコントロール) 行間を戻しても枠高は変わらない = A6 は枠ではなく行を測っている',
      revert.frameH === '120px', 'height=' + revert.frameH);

    // ── 追従しきい値 10px が compact の行高より内側に居ること (フェーズ1 の前提の維持)
    check('(A7) appendLog のしきい値 10px が compact の行高 (' + m.step + 'px) より小さい',
      10 < m.step, 'threshold=10 step=' + m.step);

    // ── 遡り読みが compact でも生きている (フェーズ1 B3b の compact 版)
    const scrollR = await page.evaluate(`(() => {
      const el = document.getElementById('combatLog');
      for (let i = 0; i < 30; i++) appendLog('充填' + i);
      const max = el.scrollHeight - el.clientHeight;
      if (max < 40) return { skipped: true, max: max };
      el.scrollTop = max - 20;              // 1 行ぶん上へ = 最小のジェスチャ
      const before = el.scrollTop;
      for (let i = 0; i < 3; i++) appendLog('遡り中' + i);
      const after = el.scrollTop;
      el.scrollTop = el.scrollHeight;      // 最下部では従来どおり追従
      for (let i = 0; i < 3; i++) appendLog('最下部' + i);
      const bottomAfter = el.scrollTop, bottomMax = el.scrollHeight - el.clientHeight;
      return { skipped: false, max: max, before: before, after: after,
               bottomAfter: bottomAfter, bottomMax: bottomMax };
    })()`);
    check('(A8/前提) compact でもログ枠が実際にスクロール可能',
      scrollR.skipped !== true, JSON.stringify(scrollR));
    if (!scrollR.skipped) {
      check('(A9) compact でも 1 行ぶん遡ればスクロール位置を奪われない',
        scrollR.after === scrollR.before, 'before=' + scrollR.before + ' after=' + scrollR.after);
      check('(A10) compact でも最下部に居るときは追従する',
        scrollR.bottomAfter === scrollR.bottomMax,
        'after=' + scrollR.bottomAfter + ' max=' + scrollR.bottomMax);
    }

    // ══════════════════════════════════════════════════════════════
    console.log('\n--- (C) 負のコントロール: 枠を広げると地平線ビューが実際に死ぬ ---');
    // ★ baseline が PASS することでは空振りを検出できない。「不可侵」と書いた不変量が
    //    本当に監視として機能するのか、意図的に壊して確かめる。
    const negCss = await page.evaluate(`(() => {
      const root = document.documentElement;
      root.style.setProperty('--ui-log-h', '40vh');
      const h = getComputedStyle(document.getElementById('combatLog')).height;
      root.style.setProperty('--ui-log-h', UI_LOG_HEIGHT + 'px');   // 復帰
      return h;
    })()`);
    check('(C1/負のコントロール) --ui-log-h:40vh を注入すると A1 の不変量が崩れる',
      negCss !== '120px', 'height=' + negCss + ' (40vh of 667 = 266.8px を期待)');

    const negJs = await page.evaluate(`(() => {
      // bare 名で読む/書く (classic script 直下の let は window に載らない)
      const baseUsable = window.innerHeight - cameraBottomHud();
      const baseOk = fieldHasSkyRoom(baseUsable);
      UI_LOG_HEIGHT += 44;                       // ← 「枠をちょっと広げた」だけの誤実装を再現
      const badUsable = window.innerHeight - cameraBottomHud();
      const badOk = fieldHasSkyRoom(badUsable);
      computeUiMetrics();                        // 復帰 (h から再計算されるので元に戻る)
      const restored = window.innerHeight - cameraBottomHud();
      return { baseUsable: baseUsable, baseOk: baseOk, badUsable: badUsable, badOk: badOk,
               restored: restored, restoredOk: fieldHasSkyRoom(restored) };
    })()`);
    check('(C2/前提) 現状の usableH が地平線ビューの成立条件を満たしている',
      negJs.baseOk === true && negJs.baseUsable === 483,
      'usableH=' + negJs.baseUsable + ' (閾値 440) skyRoom=' + negJs.baseOk);
    check('(C3/負のコントロール) UI_LOG_HEIGHT を +44 すると fieldHasSkyRoom が false へ落ちる',
      negJs.badOk === false, 'usableH=' + negJs.badUsable + ' skyRoom=' + negJs.badOk);
    check('(C4) computeUiMetrics() で復帰し、地平線ビューが元どおり成立する',
      negJs.restored === 483 && negJs.restoredOk === true,
      'usableH=' + negJs.restored + ' skyRoom=' + negJs.restoredOk);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (B) desktop (1280x800): 副作用ゼロの対照 ---');
  {
    const page = await freshPage(browser, VP_DESKTOP);
    await page.evaluate(QUIET);
    const m = desktopM = await page.evaluate(MEASURE);

    check('(B0/前提) desktop では ui-compact が付かない',
      m.compact === false, 'compact=' + m.compact);
    check('(B1) desktop の line-height は 1.5 のまま (13px x 1.5 = 19.5px)',
      m.lineHeight === '19.5px', 'line-height=' + m.lineHeight);
    check('(B2) desktop の ::before は 11px のまま',
      m.beforeFont === '11px', 'font-size=' + m.beforeFont);
    check('(B3) desktop の枠高は 170px のまま',
      m.frameH === '170px', 'height=' + m.frameH);
    check('(B4) desktop の行が消費する高さが変わっていない (compact 側の変更が漏れていない)',
      Math.abs(m.step - 21.5) < 0.01, 'step=' + m.step + 'px');
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (D) ソース静的検査: 稼ぎ方が「行間のみ」であること ---');
  {
    const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const lines = src.split(/\r?\n/);
    const codeLines = lines.filter(l => !/^\s*(\/\/|\*|\/\*|-)/.test(l));   // コメント行を除外
    const code = codeLines.join('\n');

    const rule = codeLines.filter(l => /body\.ui-compact\s+#combatLog\s*\{[^}]*line-height:\s*1\.3/.test(l)).length;
    check('(D1) body.ui-compact 限定の line-height ルールが 1 本ある', rule === 1, 'hits=' + rule);

    // 不可侵リストが本当に無傷か (誰かが「ついでに」広げていないか)
    const logPad  = /#combatLog\s*\{[\s\S]*?padding:\s*10px 24px;/.test(code);
    const linePad = /#combatLog \.logLine\s*\{\s*\n?\s*padding:\s*1px 0;\s*\n?\s*\}/.test(code);
    const boxSize = /#combatLog[^{]*\{[^}]*box-sizing/.test(code);
    check('(D2/不可侵) #combatLog の padding が 10px 24px のまま', logPad, 'ok=' + logPad);
    check('(D3/不可侵) .logLine の padding が 1px 0 のまま (13px 日本語の融着を防ぐ)',
      linePad, 'ok=' + linePad);
    check('(D4/不可侵) #combatLog に box-sizing が足されていない (内容高 120→97px の事故)',
      !boxSize, 'hasBoxSizing=' + boxSize);

    // 枠高の単一ソースが素のまま (compact=最大120 / desktop=170) であること
    const logH = /UI_LOG_HEIGHT = compact \? Math\.max\(96, Math\.min\(120, Math\.round\(h \* 0\.28\)\)\) : 170;/.test(code);
    check('(D5/不可侵) UI_LOG_HEIGHT の式が変更されていない', logH, 'ok=' + logH);

    // ::before は「消さずに圧縮」 (display:none で殴っていないこと)
    const beforeKilled = /body\.ui-compact\s+#combatLog::before\s*\{[^}]*display:\s*none/.test(code);
    check('(D6) ::before を display:none で消していない', !beforeKilled, 'killed=' + beforeKilled);

    // フェーズ1 のコメントが compact の行高にも言及するよう更新されているか
    const iAppend = src.indexOf('function appendLog');
    const near = iAppend > 0 ? src.slice(iAppend, iAppend + 1200) : '';
    check('(D7) appendLog 直上のコメントが compact の行高 16.9px に言及している',
      /16\.9px/.test(near) && /ui-compact/.test(near), 'ok=' + /16\.9px/.test(near));
  }

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const realErrs = allPageErrors.filter(m => !/Failed to load resource|favicon|decodeAudioData|Unable to decode/i.test(m));
  check('(Z) pageerror ゼロ', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  if (compactM && desktopM) {
    console.log('\n[driver] 実測: compact step=' + compactM.step + 'px 可視' + compactM.visible + '行 / ' +
      'desktop step=' + desktopM.step + 'px 可視' + desktopM.visible + '行');
  }

  const passed = results.filter(r => r.ok).length;
  const total  = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
