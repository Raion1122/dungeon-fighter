#!/usr/bin/env node
/*
 * driver_cleanup_phase1.js — 「出荷前の大掃除」フェーズ1 検証ドライバ
 *
 *   node tools/driver_cleanup_phase1.js [--headful] [--browser <path>] [--port N]
 *
 * 対象は index.html 単独の 2 点:
 *   (1) appendLog の scrollTop 追従を「最下部から 24px 以内」に条件化 (遡り読みを奪わない)
 *   (2) 敗北文言の定数化 + 世界観語化 + 「(更新でやり直し)」削除。分類 .sys の維持
 *
 * ⚠️ 本ドライバの肝は **負のコントロール**。baseline が PASS することは空振りを検出できない
 *    (過去に 3 回踏んだ既知パターン) ので、
 *      - 旧実装 (無条件 scrollTop 固定) を再現して同じ条件が崩れることを確認する
 *      - autoClassifyLog に拾われない文言が sys にならないことを確認する
 *    の 2 本を必ず通す。
 *
 * ⚠️ MSG_DEFEAT_* / COMBAT_LOG_MAX は classic script 直下の const で **window プロパティではない**。
 *    window.X で読むと undefined === undefined の両側 PASS になるので **bare 名で読む**。
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
const PORT    = parseInt(arg('port', '8811'), 10);

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

async function freshPage(browser) {
  const page = await browser.newPage();
  page.on('pageerror', e => allPageErrors.push(e.message));
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

(async () => {
  const puppeteer   = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_cleanup1_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (A) 敗北文言: 定数の実体と分類 .sys の維持 ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);

    // ⚠️ bare 名で読む (classic script 直下の const は window に載らない)
    const consts = await page.evaluate(() => ({
      party: MSG_DEFEAT_PARTY,
      you:   MSG_DEFEAT_YOU,
      clsParty: autoClassifyLog(MSG_DEFEAT_PARTY),
      clsYou:   autoClassifyLog(MSG_DEFEAT_YOU),
      heroConstGone: (typeof MSG_DEFEAT_HERO === 'undefined'),
    }));
    check('(A1) MSG_DEFEAT_* の 2 定数が実在し空でない',
      !!consts.party && !!consts.you, JSON.stringify(consts));
    check('(A2) 2 定数のいずれにも「更新でやり直し」が無い',
      ![consts.party, consts.you].some(s => s.includes('更新でやり直し')));
    check('(A3) 2 定数のいずれにも「ラン」(ローグライク語) が無い',
      ![consts.party, consts.you].some(s => /ラン/.test(s)));
    check('(A4) autoClassifyLog が 2 定数とも "sys" に分類する',
      consts.clsParty === 'sys' && consts.clsYou === 'sys',
      JSON.stringify([consts.clsParty, consts.clsYou]));

    // 実 DOM で確認: updateInfo 経由で流し、最終行の className に sys が入るか
    const dom = await page.evaluate(() => {
      const out = [];
      for (const m of [MSG_DEFEAT_PARTY, MSG_DEFEAT_YOU]) {
        updateInfo(m);
        const lines = document.querySelectorAll('#combatLog .logLine');
        const last  = lines[lines.length - 1];
        out.push({ msg: m, cls: last ? last.className : '(none)', text: last ? last.textContent : '' });
      }
      return out;
    });
    dom.forEach((d, i) => {
      check('(A5.' + (i + 1) + ') 敗北行の className に sys が含まれる: 「' + d.msg + '」',
        /\bsys\b/.test(d.cls) && d.text === d.msg, 'className="' + d.cls + '"');
    });

    // ★ 負のコントロール: 分類に拾われない文言なら sys にならないこと
    //   (= A4/A5 が「常に true」ではなく本当に正規表現を測っていることの証明)
    const neg = await page.evaluate(() => ({
      bare: autoClassifyLog('冒険はここで潰えた'),
      cls:  (() => {
        appendLog('冒険はここで潰えた');
        const lines = document.querySelectorAll('#combatLog .logLine');
        const last = lines[lines.length - 1];
        return last ? last.className : '(none)';
      })(),
    }));
    check('(A6/負のコントロール) 「全滅」「倒れた」を含まない文言は sys にならない',
      neg.bare !== 'sys' && !/\bsys\b/.test(neg.cls),
      'autoClassify="' + neg.bare + '" className="' + neg.cls + '"');

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (B) appendLog: 遡り読み中はスクロール位置を奪わない ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);

    const r = await page.evaluate(() => {
      const el = document.getElementById('combatLog');
      // 枠を満杯にして実際にスクロール可能な状態を作る
      for (let i = 0; i < 30; i++) appendLog('ログ充填 ' + i);
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll < 100) return { skipped: true, maxScroll, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };

      // ── B1: 上へ 100px 遡った状態で 10 回叩く → 位置は不変であるべき
      el.scrollTop = maxScroll - 100;
      const before = el.scrollTop;
      for (let i = 0; i < 10; i++) appendLog('遡り読み中の追記 ' + i);
      const afterUp = el.scrollTop;

      // ── B2: 最下部に居るときは従来どおり追従するべき
      el.scrollTop = el.scrollHeight;
      for (let i = 0; i < 10; i++) appendLog('最下部での追記 ' + i);
      const afterBottom = el.scrollTop;
      const bottomMax = el.scrollHeight - el.clientHeight;

      // ── B3: 最下部から 10px 以内 (しきい値の内側) も追従するべき
      el.scrollTop = bottomMax - 6;
      for (let i = 0; i < 3; i++) appendLog('しきい値内の追記 ' + i);
      const afterNear = el.scrollTop;

      // ── B3b: 1 行だけ上へスクロール (19.5px) は「遡り読み中」と判定されるべき。
      //    しきい値を line-height 以上にすると、この最小のジェスチャが黙って無効化される。
      el.scrollTop = bottomMax - 20;
      const oneLineBefore = el.scrollTop;
      for (let i = 0; i < 3; i++) appendLog('1行上での追記 ' + i);
      const oneLineAfter = el.scrollTop;

      // ── B4/負のコントロール: 旧実装 (無条件固定) を再現すると B1 の条件は必ず崩れる
      el.scrollTop = bottomMax - 100;
      const negBefore = el.scrollTop;
      for (let i = 0; i < 10; i++) { appendLog('旧実装の再現 ' + i); el.scrollTop = el.scrollHeight; }
      const negAfter = el.scrollTop;

      // ── B5: 行の折り返しで scrollHeight が「縮む」場合でも最下部へ飛ばされない。
      //    長文 (折り返して 2 行以上になる) で満杯にしてから短文を流し込み、上から長文を押し出す。
      //    stick を代入後に測る実装だと、ここで clamp 済みの値を読んで誤判定する。
      for (let i = 0; i < 20; i++) appendLog('長い行 ' + i + ' ' + 'あ'.repeat(120));
      const tallMax = el.scrollHeight - el.clientHeight;
      el.scrollTop = 40;
      const shrinkBefore = el.scrollTop;
      for (let i = 0; i < 7; i++) appendLog('短' + i);
      const shrinkMax   = el.scrollHeight - el.clientHeight;
      const shrinkAfter = el.scrollTop;

      return { skipped: false, maxScroll, before, afterUp, afterBottom, bottomMax,
               afterNear, oneLineBefore, oneLineAfter,
               negBefore, negAfter, tallMax, shrinkBefore, shrinkMax, shrinkAfter };
    });

    check('(B0) 前提: ログ枠が実際にスクロール可能 (maxScroll >= 100px)',
      r.skipped !== true, JSON.stringify(r));
    if (!r.skipped) {
      check('(B1) 上へ 100px 遡った状態で appendLog を 10 回叩いても scrollTop が不変',
        r.afterUp === r.before, 'before=' + r.before + ' after=' + r.afterUp);
      check('(B2) 最下部に居るときは従来どおり最下部へ追従する',
        r.afterBottom === r.bottomMax, 'after=' + r.afterBottom + ' max=' + r.bottomMax);
      check('(B3) 最下部から 10px 以内 (6px) でも追従する',
        r.afterNear === r.bottomMax, 'after=' + r.afterNear + ' max=' + r.bottomMax);
      check('(B3b) 1 行ぶん (20px) 上へスクロールしただけで遡り読みと判定される',
        r.oneLineAfter === r.oneLineBefore && r.oneLineAfter !== r.bottomMax,
        'before=' + r.oneLineBefore + ' after=' + r.oneLineAfter + ' max=' + r.bottomMax);
      check('(B4/負のコントロール) 旧実装 (無条件固定) を再現すると同じ条件が崩れる',
        r.negAfter !== r.negBefore && r.negAfter === r.bottomMax,
        'before=' + r.negBefore + ' after=' + r.negAfter + ' max=' + r.bottomMax);
      check('(B5/前提) 長文→短文の入れ替えで scrollHeight が実際に縮んだ',
        r.shrinkMax < r.tallMax && r.shrinkMax > r.shrinkBefore,
        'tallMax=' + r.tallMax + ' shrinkMax=' + r.shrinkMax + ' pos=' + r.shrinkBefore);
      check('(B5) scrollHeight が縮んでも遡り読み位置を保つ (最下部へ飛ばない)',
        r.shrinkAfter === r.shrinkBefore && r.shrinkAfter !== r.shrinkMax,
        'before=' + r.shrinkBefore + ' after=' + r.shrinkAfter + ' max=' + r.shrinkMax);
    }
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (C) 初回描画: 空ログからの追記は従来どおり最下部に居る ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    const r = await page.evaluate(() => {
      const el = document.getElementById('combatLog');
      // 枠より短い状態 (scrollHeight <= clientHeight) から始めても追従が死なないこと
      el.scrollTop = 0;
      for (let i = 0; i < 30; i++) appendLog('初回からの追記 ' + i);
      return { scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight };
    });
    check('(C1) 空ログから積み上げても最下部に到達する (初回追従が死んでいない)',
      r.scrollTop === r.max && r.max > 0, JSON.stringify(r));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (D) ソース静的検査: 旧文言の残骸ゼロ / 全 9 サイトが定数参照 ---');
  {
    const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const lines = src.split(/\r?\n/);
    const codeLines = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));   // コメント行を除外

    const oldParty = codeLines.filter(l => l.includes('パーティは全滅した… ゲームオーバー')).length;
    const oldHero  = codeLines.filter(l => l.includes('主人公が倒れた… ゲームオーバー')).length;
    const oldRetry = codeLines.filter(l => l.includes('更新でやり直し')).length;
    check('(D1) 旧敗北文言のリテラルが 0 件', oldParty === 0 && oldHero === 0,
      'party=' + oldParty + ' hero=' + oldHero);
    check('(D2) 「更新でやり直し」が非コメント行に 0 件', oldRetry === 0, 'hits=' + oldRetry);

    // ⚠️ コメント行を除外して数える。定数ブロックの解説コメントが定数名に言及しているため、
    //    src 全体で数えると実参照と混ざって「14 のはずが 15」になる (実装ではなく assert の不備)。
    const code = codeLines.join('\n');
    const defs = (code.match(/const MSG_DEFEAT_(PARTY|YOU)\s*=/g) || []).length;
    const uses = (code.match(/MSG_DEFEAT_(PARTY|YOU)/g) || []).length - defs;
    const heroLeft = (code.match(/MSG_DEFEAT_HERO/g) || []).length;
    check('(D3) 定数定義が 2 本', defs === 2, 'defs=' + defs);
    check('(D4) 参照が 14 出現 (三項式 5 行 x2 + 単文 4 行)', uses === 14, 'uses=' + uses);
    check('(D4b) MSG_DEFEAT_HERO の残骸が 0 件 (MSG_DEFEAT_YOU へ統合済み)',
      heroLeft === 0, 'hits=' + heroLeft);

    // player-facing な「ラン」= 文字列リテラル内のローグライク語としての用法だけを拾う
    // (フラン=町名 / プラン編 / ランダム / クランプ 等の正当な語は対象外)
    const runWord = codeLines.filter(l => /["'`][^"'`]*(このラン|前ラン|今回のラン|ランで拾|ランの初期化)/.test(l));
    check('(D5) player-facing な「ラン」(ローグライク語) が 0 件',
      runWord.length === 0, runWord.slice(0, 3).join(' // '));

    // scrollTop 追従の条件化が実際にソースに入っているか (無条件代入が残っていないこと)
    const uncond = codeLines.filter(l => /^\s*el\.scrollTop\s*=\s*el\.scrollHeight;\s*$/.test(l)).length;
    const cond   = codeLines.filter(l => /el\.scrollTop\s*=\s*stick\s*\?\s*el\.scrollHeight\s*:\s*prev;/.test(l)).length;
    check('(D6) 無条件の scrollTop 固定が残っていない', uncond === 0, 'hits=' + uncond);
    check('(D7) stick による分岐 (追従 or 位置の書き戻し) が 1 箇所ある', cond === 1, 'hits=' + cond);

    // prev / stick の読み取りが innerHTML 代入より前にあること (順序が逆だと追従が死ぬ)
    const iPrev  = src.indexOf('const prev  = el.scrollTop;');
    const iStick = src.indexOf('const stick =');
    const iHtml  = src.indexOf('el.innerHTML = combatLogLines.map');
    check('(D8) prev / stick の読み取りが innerHTML 代入より前にある',
      iPrev > 0 && iStick > 0 && iHtml > 0 && iPrev < iHtml && iStick < iHtml,
      'prev@' + iPrev + ' stick@' + iStick + ' innerHTML@' + iHtml);
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (E) 回帰: 通常プレイで診断 critical / pageerror が出ない ---');
  {
    const page = await freshPage(browser);
    await sleep(9000);   // 自走させて実戦のログ経路を通す
    const diag = await page.evaluate(() => {
      try {
        const r = window.dumpDebugReport ? window.dumpDebugReport() : null;
        return r ? { crit: r.totals.criticals, ids: (r.violations || []).map(v => v.id) } : { crit: -1, ids: [] };
      } catch (e) { return { crit: -1, ids: [] }; }
    });
    const guilty = (diag.ids || []).filter(id => id !== 'combat-stall' && id !== 'run-timeout' && id !== 'result-double-fire');
    check('(E1) 診断 critical に新規のものが無い', guilty.length === 0,
      'criticals=' + diag.crit + ' ids=' + (diag.ids || []).join(','));

    const logState = await page.evaluate(() => {
      const el = document.getElementById('combatLog');
      const n = document.querySelectorAll('#combatLog .logLine').length;
      return { n, scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight };
    });
    check('(E2) 自走中もログが積まれ、追従が効いている (最下部に居る)',
      logState.n > 0 && logState.scrollTop === logState.max, JSON.stringify(logState));
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
