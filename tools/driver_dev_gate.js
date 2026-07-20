#!/usr/bin/env node
/*
 * driver_dev_gate.js — 「出荷前の大掃除」フェーズ3 検証ドライバ
 *
 *   node tools/driver_dev_gate.js [--headful] [--browser <path>] [--port N] [--baseline <path>]
 *
 * 対象は tavern.html + audio.js の 2 点:
 *   ④(1) デバッグ 5 ボタンを localStorage['df.devMode'] ゲート配下へ (既定で非表示)
 *   ④(2) 設定モーダルに『冒険の記録を消す』(本体は酒場側 = 潜行中には出ない)
 *
 * ⚠️ 本ドライバの肝は 2 つ:
 *
 *   (1) **負のコントロールを同一 run に内包する**。baseline (HEAD) を /__baseline/ で同時に配信し、
 *       「baseline では 5 ボタンが display:flex で見えている」を *正の assert* として測る。
 *       別 run で FAIL を目視する方式だと空振り (assert が何も測っていない) を検出できない。
 *
 *   (2) **インライン display:flex のソース静的検査**。CSS ゲートはインライン style に無条件で負けるため、
 *       「CSS は書いたのに何も起きない」まま計算値だけ見て PASS する事故が起こりうる。
 *       ゲート対象 div の生ソースに display:flex が残っていないことを直接読む。
 *
 * ⚠️ getComputedStyle(el).display は *その要素自身* の計算値を返す (祖先が非表示でも 'flex' のまま)。
 *    準備画面を開かずに測れるのはこの性質のおかげ。offsetParent で測ると祖先の都合で両側 null になる。
 *
 * ⛔ index.html:2701- の autoplay / autodebug 解析は **ゲート対象外**。ここを塞ぐと検証ドライバ 29 本が
 *    全滅するため、(D9) で window.__autoplay が生きていることを毎回確かめる。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL  = flag('headful');
const PORT     = parseInt(arg('port', '8831'), 10);
// ⚠ path.resolve を通す。生の '/' 区切りのまま持つと path.join が返す '\' 区切りと
//    startsWith 比較が食い違い、baseline 側が丸ごと 404 になる (負のコントロールが静かに死ぬ)。
const BASELINE = path.resolve(arg('baseline', 'C:/Users/PC_User/AppData/Local/Temp/df_devgate_baseline'));

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

// 作業ツリーを / で、baseline (HEAD) を /__baseline/ で同時に配信する。
// 同一 run の中で「変更後」と「変更前」を測れるので、空振り assert が構造的に検出できる。
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        let base = ROOT;
        if (u.startsWith('/__baseline/')) { base = BASELINE; u = u.slice('/__baseline'.length); }
        if (u === '/') u = '/index.html';
        const fp = path.join(base, u);
        if (!fp.startsWith(base) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
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

const DEBUG_BTNS = ['btnDebugEvadeAll', 'btnDebugEvadeArrow',
                    'btnDepartAutoplay', 'btnDepartAutoplayFast', 'btnDepartAutoDebug'];

// 酒場を開く。prologueSeen を先に立てて前口上オーバーレイを飛ばす (設定モーダルのクリックを塞ぐため)。
async function openTavern(browser, query, seedSrc) {
  const page = await browser.newPage();
  page.on('pageerror', e => allPageErrors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('dragonfighters.prologueSeen', '1'); } catch (e) {}
  });
  await page.goto('http://localhost:' + PORT + (query || '/tavern.html'),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(700);
  return page;
}

// (F) 専用。消去の前後を測るページは evaluateOnNewDocument を使わず「開く → 種を蒔く → 再読込」で作る。
//   ⚠ evaluateOnNewDocument は **リロードのたび** に走るので、消去後の再読込で種が蒔き直されてしまう。
//   ⚠ localStorage は **オリジン単位で全ページ共有**。前セクションの残骸を掴まないよう最初に全消しする。
async function openTavernSeeded(browser, seedSrc) {
  const page = await browser.newPage();
  page.on('pageerror', e => allPageErrors.push(e.message));
  await page.goto('http://localhost:' + PORT + '/tavern.html',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((src) => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    (new Function(src))();
  }, seedSrc);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(700);
  return page;
}
// 行 + 各ボタンの「自分自身の」計算 display を読む
const READ_GATE = () => {
  const ids = ['btnDebugEvadeAll', 'btnDebugEvadeArrow',
               'btnDepartAutoplay', 'btnDepartAutoplayFast', 'btnDepartAutoDebug'];
  const disp = (e) => e ? getComputedStyle(e).display : '(missing)';
  // ⚠ baseline のオートプレイ行は **無名 div** (id を付けたのは今回の変更)。id 引きだと baseline 側が
  //    常に '(missing)' になり、負のコントロールが測れない。両方で引けるボタンの親から取る。
  const btnParent = (id) => { const b = document.getElementById(id); return b ? b.parentNode : null; };
  return {
    evadeRow:    disp(document.getElementById('debugEvadeRow')),
    autoplayRow: disp(btnParent('btnDepartAutoplay')),
    devClass:    document.body.classList.contains('dev-mode'),
    btnsPresent: ids.filter(id => !!document.getElementById(id)).length,
    devFlag:     (function () { try { return localStorage.getItem('df.devMode'); } catch (e) { return '(err)'; } })(),
  };
};

(async () => {
  const puppeteer   = loadPuppeteer();
  const browserPath = findBrowser();
  if (!fs.existsSync(path.join(BASELINE, 'tavern.html'))) {
    console.error('[driver] baseline worktree がありません: ' + BASELINE);
    console.error('[driver]   git worktree add "' + BASELINE + '" HEAD --detach');
    process.exit(2);
  }
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  (baseline: ' + BASELINE + ') @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_devgate_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (A) 出荷版 (?dev 無し): デバッグ 5 ボタンが 1 つも見えない ---');
  {
    const page = await openTavern(browser, '/tavern.html');
    const g = await page.evaluate(READ_GATE);
    check('(A1) #debugEvadeRow の計算 display が none', g.evadeRow === 'none', 'display=' + g.evadeRow);
    check('(A2) #debugAutoplayRow の計算 display が none', g.autoplayRow === 'none', 'display=' + g.autoplayRow);
    check('(A3) body に dev-mode クラスが付いていない', g.devClass === false);
    check('(A4) 5 ボタンは DOM に実在する (消したのではなく隠している)',
      g.btnsPresent === 5, 'present=' + g.btnsPresent + '/5');
    // 各ボタン自身も非表示側に落ちていること (行だけ none でボタンが浮くことがない)
    const each = await page.evaluate((ids) => ids.map(id => {
      const e = document.getElementById(id);
      return { id, rects: e ? e.getClientRects().length : null };
    }), DEBUG_BTNS);
    check('(A5) 5 ボタンいずれもレイアウト矩形を持たない (実測で不可視)',
      each.every(e => e.rects === 0), JSON.stringify(each.filter(e => e.rects !== 0)));
    check('(A6) 🚪 開発モード終了ボタンも隠れている',
      await page.evaluate(() => { const e = document.getElementById('btnExitDevMode');
        return !!e && e.getClientRects().length === 0; }));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (B) 負のコントロール: baseline (HEAD) では同じ assert が成立しない ---');
  {
    const page = await openTavern(browser, '/__baseline/tavern.html');
    const g = await page.evaluate(READ_GATE);
    check('(B1) baseline の回避行は display:flex で見えている (= (A1) は本当に測っている)',
      g.evadeRow === 'flex', 'display=' + g.evadeRow);
    check('(B2) baseline のオートプレイ行も見えている (= (A2) は本当に測っている)',
      g.autoplayRow === 'flex', 'display=' + g.autoplayRow);
    check('(B3) baseline にも 5 ボタンが揃っている (比較対象として妥当)',
      g.btnsPresent === 5, 'present=' + g.btnsPresent + '/5');
    check('(B4) baseline に 🚪 終了ボタンは存在しない (今回の新規追加であることの確認)',
      await page.evaluate(() => !document.getElementById('btnExitDevMode')));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (C) ?dev=1 / ?dev=0 / 🚪終了 の往復 ---');
  {
    const page = await openTavern(browser, '/tavern.html?dev=1');
    let g = await page.evaluate(READ_GATE);
    check('(C1) ?dev=1 で body.dev-mode が付く', g.devClass === true);
    check('(C2) ?dev=1 で 2 行とも display:flex',
      g.evadeRow === 'flex' && g.autoplayRow === 'flex', JSON.stringify([g.evadeRow, g.autoplayRow]));
    check('(C3) df.devMode が localStorage に焼かれている', g.devFlag === '1', 'df.devMode=' + g.devFlag);

    // ?dev を外して素で開き直しても dev のままであること (毎回 URL を付ける必要が無い)
    await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(600);
    g = await page.evaluate(READ_GATE);
    check('(C4) ?dev 無しで開き直しても dev モードが持続する',
      g.devClass === true && g.evadeRow === 'flex', JSON.stringify(g));

    // 🚪 終了ボタン → OFF
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      page.evaluate(() => document.getElementById('btnExitDevMode').click()),
    ]);
    await sleep(600);
    g = await page.evaluate(READ_GATE);
    check('(C5) 🚪 終了ボタンで dev が解除され 5 ボタンが再び消える',
      g.devClass === false && g.evadeRow === 'none' && g.devFlag === null, JSON.stringify(g));

    // ON からの ?dev=0 遷移
    await page.goto('http://localhost:' + PORT + '/tavern.html?dev=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(400);
    await page.goto('http://localhost:' + PORT + '/tavern.html?dev=0', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(400);
    g = await page.evaluate(READ_GATE);
    check('(C6) ?dev=0 で ON から OFF に戻る', g.devClass === false && g.devFlag === null, JSON.stringify(g));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (D) ソース静的検査 + autoplay 解析の無傷確認 ---');
  {
    const tav = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
    const aud = fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf8');
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

    // ⚠ CSS ゲートはインライン style に無条件で負ける。生ソースで 0 件を確認する。
    const rowLines = tav.split('\n').filter(l => /id="debugEvadeRow"|id="debugAutoplayRow"/.test(l));
    check('(D1) ゲート対象 2 行がソースに存在する', rowLines.length === 2, 'found=' + rowLines.length);
    check('(D2) その 2 行にインライン display:flex が 0 件',
      rowLines.every(l => !/display\s*:\s*flex/.test(l)),
      rowLines.filter(l => /display\s*:\s*flex/.test(l)).join(' || '));
    check('(D3) CSS ゲートの既定 none と dev-mode の flex が両方書かれている',
      /#debugEvadeRow,\s*\n?\s*#debugAutoplayRow\s*\{\s*display:\s*none/.test(tav) &&
      /body\.dev-mode\s+#debugEvadeRow/.test(tav));
    check('(D4) dev キーは "dragonfighters." prefix の外 (記録消去に巻き込まれない)',
      /"df\.devMode"/.test(tav) && !/dragonfighters\.devMode/.test(tav));
    check('(D5) 消去は Object.keys 走査 (キーのハードコード列挙をしていない)',
      /Object\.keys\(store\)/.test(tav) && /indexOf\("dragonfighters\."\)\s*===\s*0/.test(tav));
    check('(D6) native confirm() を使っていない (プロジェクト全体で前例 0 件)',
      !/[^.\w]confirm\s*\(/.test(tav));
    check('(D7) closeSettings が後始末ループを持つ (8 秒タイマーの取り残し防止)',
      /function closeSettings\(\)\s*\{[\s\S]{0,300}_settingsCleanup\[i\]\(\)/.test(aud));
    check('(D8) 既存の openSettings 呼び出し 2 箇所が引数無しのまま (opts を足していない)',
      (idx.match(/GameAudio\.openSettings\(\)/g) || []).length === 1 &&
      (tav.match(/GameAudio\.openSettings\(\)/g) || []).length === 1);
    check('(D9) 記録消去のロジックが index.html 側に無い (潜行中に出せない構造)',
      !/wipeAdventureRecord|registerSettingsExtra/.test(idx));

    // ⛔ ここをゲートすると検証ドライバが全滅する
    const page = await browser.newPage();
    page.on('pageerror', e => allPageErrors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
    });
    await page.goto('http://localhost:' + PORT + '/index.html?autoplay=10&diag=1',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
    const ap = await page.evaluate(() => ({ autoplay: window.__autoplay, hasDiag: !!window.__diag }));
    check('(D10) index.html の autoplay 解析が無傷 (window.__autoplay > 0)',
      ap.autoplay > 0, JSON.stringify(ap));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (E) 設定モーダル: 酒場だけに『冒険の記録を消す』が出る ---');
  {
    // (E-a) 潜行中 (index.html) には出ない — 登録していないので構造的に不可能
    const dungeon = await browser.newPage();
    dungeon.on('pageerror', e => allPageErrors.push(e.message));
    await dungeon.evaluateOnNewDocument(() => {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
    });
    await dungeon.goto('http://localhost:' + PORT + '/index.html?autoplay=10&diag=1',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
    const dOut = await dungeon.evaluate(() => {
      GameAudio.openSettings();
      const has   = !!document.getElementById('wipeSaveSection');
      const modal = !!document.getElementById('gameSettingsOverlay');
      GameAudio.closeSettings();
      return { has, modal };
    });
    check('(E1) 潜行中も設定モーダル自体は開く (回帰していない)', dOut.modal === true);
    check('(E2) 潜行中の設定に『冒険の記録を消す』が出ない', dOut.has === false);
    await dungeon.close();

    // (E-b) 酒場では出る + 2 段タップ + やめるが左
    const page = await openTavern(browser, '/tavern.html');
    const stage1 = await page.evaluate(() => {
      GameAudio.openSettings();
      return { has: !!document.getElementById('wipeSaveSection'),
               btn: !!document.getElementById('btnWipeSave'),
               confirmShown: !!document.getElementById('btnWipeConfirm') };
    });
    check('(E3) 酒場の設定に『冒険の記録を消す』が出る', stage1.has && stage1.btn, JSON.stringify(stage1));
    check('(E4) 1 段目では『消す』が出ていない (誤爆防止)', stage1.confirmShown === false);

    const stage2 = await page.evaluate(() => {
      document.getElementById('btnWipeSave').click();
      const row = document.getElementById('btnWipeCancel').parentNode;
      return { kids: Array.from(row.children).map(b => b.id),
               cancel:  !!document.getElementById('btnWipeCancel'),
               confirm: !!document.getElementById('btnWipeConfirm'),
               wipeGone: !document.getElementById('btnWipeSave') };
    });
    check('(E5) 2 段目で『やめる』と『消す』が出る', stage2.cancel && stage2.confirm && stage2.wipeGone);
    // ⚠ iOS のゴーストクリックは直前のタップ位置に落ちる → 非破壊側 (やめる) が左でなければならない
    check('(E6) 『やめる』が左・『消す』が右 (iOS ゴーストクリック対策)',
      stage2.kids[0] === 'btnWipeCancel' && stage2.kids[1] === 'btnWipeConfirm', JSON.stringify(stage2.kids));

    const back = await page.evaluate(() => {
      document.getElementById('btnWipeCancel').click();
      return { stage1: !!document.getElementById('btnWipeSave'),
               confirmGone: !document.getElementById('btnWipeConfirm') };
    });
    check('(E7) 『やめる』で 1 段目に戻る', back.stage1 && back.confirmGone);

    // ctx.onClose の後始末契約が実際に走ることをプローブで確認 (8 秒タイマー取り残し防止の根拠)
    const probe = await page.evaluate(() => {
      window.__probeClosed = 0;
      GameAudio.closeSettings();
      GameAudio.registerSettingsExtra(function (ctx) { ctx.onClose(function () { window.__probeClosed++; }); return null; });
      GameAudio.openSettings();
      const during = window.__probeClosed;
      GameAudio.closeSettings();
      return { during, after: window.__probeClosed };
    });
    check('(E8) closeSettings が ctx.onClose の後始末を必ず実行する',
      probe.during === 0 && probe.after === 1, JSON.stringify(probe));

    // 8 秒無操作で 1 段目へ自動復帰
    const armed = await page.evaluate(() => {
      GameAudio.openSettings();
      document.getElementById('btnWipeSave').click();
      return !!document.getElementById('btnWipeConfirm');
    });
    check('(E9) 再度開いて 2 段目にできる', armed === true);
    await sleep(8600);
    const lapsed = await page.evaluate(() => ({
      stage1: !!document.getElementById('btnWipeSave'),
      confirmGone: !document.getElementById('btnWipeConfirm'),
    }));
    check('(E10) 8 秒無操作で 1 段目へ自動復帰する', lapsed.stage1 && lapsed.confirmGone, JSON.stringify(lapsed));
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (F) 消去の実挙動: KEEP 2 件が生き、それ以外の dragonfighters.* が両ストレージから消える ---');
  {
    // アプリが書き戻さない固有キーで種を蒔く (アプリ由来のキーだとリロードで復活して測れない)
    const SEED = `
      localStorage.setItem('dragonfighters.settings', JSON.stringify({master:0.42,bgm:0.5,sfx:0.5,voice:0.5,muted:false,screenShake:true,textSpeed:40}));
      localStorage.setItem('dragonfighters.panelCollapsed', '1');
      localStorage.setItem('dragonfighters.__probeGold', '9999');
      localStorage.setItem('dragonfighters.__probeSpells', '["magicMissile"]');
      localStorage.setItem('df.devMode', '1');
      localStorage.setItem('someOtherApp.keep', 'yes');
      sessionStorage.setItem('dragonfighters.__probeParty', '[{"classKey":"fighter"}]');
      sessionStorage.setItem('someOtherApp.sessKeep', 'yes');
    `;
    const page = await openTavernSeeded(browser, SEED);
    const before = await page.evaluate(() => ({
      probeGold: localStorage.getItem('dragonfighters.__probeGold'),
      sessParty: sessionStorage.getItem('dragonfighters.__probeParty'),
      prologue:  localStorage.getItem('dragonfighters.prologueSeen'),
    }));
    check('(F1) 種が実際に蒔けている (測定の前提)',
      before.probeGold === '9999' && !!before.sessParty && before.prologue === '1', JSON.stringify(before));

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      page.evaluate(() => {
        GameAudio.openSettings();
        document.getElementById('btnWipeSave').click();
        document.getElementById('btnWipeConfirm').click();
      }),
    ]);
    await sleep(900);

    const after = await page.evaluate(() => {
      const L = (k) => localStorage.getItem(k);
      const S = (k) => sessionStorage.getItem(k);
      let st = null;
      try { st = JSON.parse(L('dragonfighters.settings') || 'null'); } catch (e) {}
      return {
        settingsMaster: st && st.master,
        panelCollapsed: L('dragonfighters.panelCollapsed'),
        probeGold:      L('dragonfighters.__probeGold'),
        probeSpells:    L('dragonfighters.__probeSpells'),
        prologueSeen:   L('dragonfighters.prologueSeen'),
        devMode:        L('df.devMode'),
        otherApp:       L('someOtherApp.keep'),
        sessParty:      S('dragonfighters.__probeParty'),
        sessOther:      S('someOtherApp.sessKeep'),
        search:         location.search,
      };
    });
    check('(F2) KEEP: dragonfighters.settings が値ごと生き残る (音量 0.42)',
      after.settingsMaster === 0.42, 'master=' + after.settingsMaster);
    check('(F3) KEEP: dragonfighters.panelCollapsed が生き残る',
      after.panelCollapsed === '1', 'panelCollapsed=' + after.panelCollapsed);
    check('(F4) localStorage の他の dragonfighters.* が消えている',
      after.probeGold === null && after.probeSpells === null,
      JSON.stringify([after.probeGold, after.probeSpells]));
    check('(F5) prologueSeen も消える (次回起動でプロローグが流れる = 「最初から」)',
      after.prologueSeen === null, 'prologueSeen=' + after.prologueSeen);
    check('(F6) sessionStorage 側の dragonfighters.* も消えている',
      after.sessParty === null, 'sessParty=' + after.sessParty);
    check('(F7) df.devMode は prefix の外なので生存する',
      after.devMode === '1', 'df.devMode=' + after.devMode);
    check('(F8) 無関係な名前空間のキーは local/session とも無傷',
      after.otherApp === 'yes' && after.sessOther === 'yes',
      JSON.stringify([after.otherApp, after.sessOther]));
    check('(F9) 消去後にクエリ無しへ再読込されている (location.replace 到達)',
      after.search === '', 'search=' + JSON.stringify(after.search));
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
