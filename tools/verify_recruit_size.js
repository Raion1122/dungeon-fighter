#!/usr/bin/env node
/*
 * tools/verify_recruit_size.js — 「依頼の重さ (★の数) で応募人数が変わる」の検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-20_quest-recruit-size.md` (#7) の受入条件を測る。
 *
 *   node tools/verify_recruit_size.js [--headful] [--port N]
 *
 * ── 実装状況 (段階的に足していく骨組み) ────────────────────────────────────
 *   ✅ 受入条件 1. : 固定 6 シナリオの出発時パーティ人数 = 1 + 期待値
 *                    ⚠ **STEP1 (項目1) の時点では既定 OFF** なので `?recruit=1` を付けて測る。
 *                       STEP2 で既定 ON になったら (A) の URL から `?recruit=1` を外し、
 *                       (C) の URL を `?recruit=0` に変える。**期待値の表は 1 文字も変えない**。
 *   ✅ 受入条件 2. : どのクエストでもパーティが 4 人を超えない
 *   ✅ 受入条件 8. : 既定 OFF (URL 無指定) では 6 シナリオ全部が従来どおり PARTY_SIZE 人
 *                    = 「挙動が 1 ミリも変わっていない」の直接の物差し。
 *                    ⭐ **STEP2 で既定 ON にした瞬間に (C) は赤へ反転するのが正しい。**
 *                       反転したら (C) の URL を `?recruit=0` に張り替える = 受入条件 7. になる。
 *                       期待値 (legacyExpectation) は据え置き。張り替え先が用意されているので
 *                       「赤を機械的に緩める」必要が原理的に無い。
 *   ⬜ 受入条件 3. : 生成クエスト (闇市) の NPC 3 人 + `[DIAG] recruit: fallback used` の実在
 *   ⬜ 受入条件 4. : `recruit: 3` の個別上書きが goblin-mine にも効く
 *   ⬜ 受入条件 5. : 隊列順が front → mid → rear のまま
 *   ⬜ 受入条件 6. : 「募集をかけ直す」で顔ぶれが変わり人数は変わらない
 *   ⬜ 受入条件 7. : `?recruit=0` の装置 assert (= STEP2 で (C) を張り替えたもの)
 *   共通の道具は openPage() / observeDepartSizes() / check() / results / pageErrors。
 *
 * ── ⭐⭐⭐ 判定本体の共有 (受入条件 1. と 8. の要) ──────────────────────────
 *   「スイッチを外すと期待値が変わる」は **assert 本体を共有しないと空振りする**。
 *   判定式をその場に直書きすると「たまたま両方 false」で何も証明できない (依頼書 #5 で実測)。
 *     → 判定は judgePartySizes() **ただ 1 本**。(A) と (C) が同じ関数オブジェクトに
 *       違う期待表を渡すだけ。共有が空振りしていないことは (Cz3)(Cz4) が
 *       「同じ関数に (A) の期待表を通すと (C) の観測は落ちる」「(A) では true を返していた」で証明する。
 *
 * ── ⭐⭐ 2 経路で突き合わせる ───────────────────────────────────────────────
 *   経路 A =「実際に起きた側」: 本番の departToScenario() が書いた
 *            sessionStorage["dragonfighters.partyMembers"] の**配列長**
 *   経路 B =「決める関数そのもの」: recruitCountOf(sc) の戻り値
 *   赤が出たとき「実装が壊れた」のか「測定器が別のものを見ている」のかが、その場で分かれる。
 *
 * ── ⚠⚠ 母集団が空でも緑になる穴を塞ぐ (装置 assert) ───────────────────────
 *   (S1) scenarios / recruitCountOf / departToScenario を **裸の識別子**で読めた
 *   (S3) 固定 6 シナリオの id が実在する (期待表のキーと過不足なく一致)
 *   (Az1)(Cz1) 6 件を **実際に踏んだ** (踏んだ id を一覧で出す)
 *   (Az2)      departToScenario() が 6 件すべてで実際に書いた (wrote=true)
 *   (Sz)       期待表そのものが 1 種類の値に潰れていない (全部同値なら一致は自明で無意味)
 *   (Cz5)      空の観測を通すと判定関数が落ちる
 *
 * ── ⚠⚠⚠ 踏みやすい罠 (既存ドライバから引き継ぎ) ──────────────────────────
 *  - **window.<名前> で classic script 直下の let/const/function を読まない**。常に undefined
 *    = 偽の赤になる。page.evaluate(() => PARTY_SIZE) のように **裸の識別子**なら読める。
 *  - same-origin の localStorage / sessionStorage は **ページ遷移をまたいで生き残る**。
 *    openPage() が document-start で purge する。⚠ その接頭辞をブロックコメント内で
 *    スラッシュ区切りで並べて書くとコメントが閉じて SyntaxError になる (実際に踏んだ)。
 *  - ROOT は必ず path.resolve を通す。区切り文字のまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない。
 *  - MIME テーブルを持たせ忘れると全 500 でページが空になる (シームが undefined に見える)。
 *  - **同じ結果が 2 回続いても「フレークでない」証明にならない**。緑は同じツリーで 3 回見る。
 *
 * ── ⚠ departToScenario() は index.html へ遷移する ───────────────────────────
 *   遷移させると tavern.html の JS 状態が消えて次のシナリオが測れない。かといって
 *   「sessionStorage への書き込み 2 行」をドライバに写経すると、本番の出発処理を
 *   **一度も通さないまま緑**になる (本末転倒)。
 *   → **リクエストを横取りして index.html への遷移だけ abort する**。本番の
 *     departToScenario() はそのまま完走し、tavern.html のページは生き残る。
 *     横取りが空振りしていないことは (Az3) が「遷移が実際に試みられた」で押さえる。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ⚠ path.resolve 必須。区切り文字のまま持つと全 404 になり、症状はタイムアウトだけになる。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const PORT = parseInt(arg('port', '8897'), 10);
const HEADFUL = argv.includes('--headful');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core'));
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  throw new Error('Chrome / Edge が見つかりません (--browser <path> で指定してください)');
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];
const consoleLines = [];

/* ══════════════════════════════════════════════════════════════════════════
 * 期待表 (依頼書「受入条件」の表そのもの)。⚠ ここは STEP2 でも 1 文字も変えない。
 * 変えるのは「どの URL でこの表を当てるか」だけ。
 * ══════════════════════════════════════════════════════════════════════════ */
const SCENARIO_IDS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const EXPECTED_NPC_RECRUIT = {
  'goblin-mine':    1,   // ★☆☆
  'bandits-forest': 2,   // ★★☆
  'lizard-swamp':   2,   // ★★☆
  'orc-fort':       3,   // ★★★
  'undead-temple':  3,   // ★★★
  'dragon-lair':    3,   // ★★★★ だが clamp(n,1,3)
};
/* 従来動作 (募集人数が効いていない状態) の期待表。partySize はドライバに直書きせず
   ブラウザから読んだ PARTY_SIZE を渡す = 「実装が書いた数字」でなく元データから組み立てる。 */
function legacyExpectation(ids, partySize) {
  const o = {};
  ids.forEach(id => { o[id] = partySize - 1; });
  return o;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ⭐⭐⭐ 判定本体 (Node 側・純関数)。受入条件 1. と 受入条件 8. が **これ 1 本を共有**する。
 *   rows      : observeDepartSizes() の戻り値 (経路 A = 実際に起きた側)
 *   expected  : { id: 期待 NPC 数 }
 *   戻り値 .ok は「6 件すべてが期待どおり」。母集団が空 (rows=[]) のときは **false**
 *   (空で緑になる測定器を作らない)。
 * ══════════════════════════════════════════════════════════════════════════ */
function judgePartySizes(rows, expected) {
  const ids = Object.keys(expected);
  const diffs = [];
  ids.forEach(id => {
    const r = (rows || []).find(x => x.id === id);
    if (!r)               { diffs.push(id + ': 観測なし'); return; }
    if (r.wrote !== true) { diffs.push(id + ': 出発処理が partyMembers を書いていない'); return; }
    if (r.npc !== expected[id]) diffs.push(id + ': NPC ' + r.npc + ' (期待 ' + expected[id] + ')');
  });
  return { ok: ids.length > 0 && (rows || []).length === ids.length && diffs.length === 0, diffs };
}

/* 受入条件 2. の判定本体。「4 人を超えない」。⚠ これも共有する (ON / OFF の両方で当てる)。 */
function judgeNoOverflow(rows, cap) {
  const over = (rows || []).filter(r => r.total > cap).map(r => r.id + ':' + r.total);
  return { ok: (rows || []).length > 0 && over.length === 0, over };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  :' + PORT);

  const profile = require('./_pptr_profile')('df_recruit_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
    defaultViewport: { width: 1280, height: 900 },
  });

  /* ⚠⚠ same-origin の localStorage / sessionStorage はページ遷移をまたいで生き残る。
        → document-start で purge する。⚠ purge は「1 タブにつき 1 回だけ」。
          evaluateOnNewDocument は新しい document ができるたびに走るので、無条件だと
          遷移先で前ページの書き込みを消してしまう。
          2 つの接頭辞のどちらにも当たらないマーカーで 1 回に絞る。 */
  const PURGE_MARK = '__dfPurgedOnce';
  async function openPage(pathQuery, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    const navBlocked = [];
    page.__navBlocked = navBlocked;
    page.on('pageerror', e => pageErrors.push(pathQuery + ' :: ' + e.message));
    page.on('console', m => { consoleLines.push(m.text()); });
    await page.evaluateOnNewDocument((cfg) => {
      try {
        if (sessionStorage.getItem(cfg.mark)) return;   // このタブでは purge 済み
        var kill = function (store) {
          Object.keys(store).forEach(function (k) {
            if (k.indexOf('df.') === 0) store.removeItem(k);
            if (k.indexOf('dragonfighters.') === 0) store.removeItem(k);
          });
        };
        kill(localStorage); kill(sessionStorage);
        // 前口上 (音声ペースで数分) は測定対象外なので飛ばす。dev ゲートとは無関係のキー。
        if (cfg.seen) localStorage.setItem('dragonfighters.prologueSeen', '1');
        sessionStorage.setItem(cfg.mark, '1');
      } catch (e) {}
    }, { mark: PURGE_MARK, seen: opts.prologueSeen !== false });

    /* ★ index.html への遷移だけ abort する。departToScenario() は本番のまま完走させ、
         tavern.html のページ (と JS 状態) を生かしたまま何度も測る。 */
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      try {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame() && /\/index\.html/.test(r.url())) {
          navBlocked.push(r.url());
          r.abort('aborted');
          return;
        }
        r.continue();
      } catch (e) { try { r.continue(); } catch (e2) {} }
    });

    await page.goto('http://localhost:' + PORT + pathQuery, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(opts.settle || 900);
    return page;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 観測本体。**本番の関数だけ**を呼ぶ:
   *   prepScenario = sc            ← openPrep(sc) が最初にやることと同じ
   *   regeneratePartyMembers()     ← openPrep がその後に呼ぶ本番の再抽選
   *   departToScenario()           ← 本番の出発処理 (sessionStorage へ書くのはこの中)
   * ⚠ 「sessionStorage へ 2 行書く」をドライバに写経すると、出発処理を一度も
   *    通さないまま緑になる。書き込みは必ず本番に書かせる。
   * ══════════════════════════════════════════════════════════════════════ */
  async function observeDepartSizes(page, ids) {
    return page.evaluate((idList) => {
      const out = { rows: [], threw: '', partySize: null, sawIds: [], seam: {} };
      try {
        // ── 裸の識別子でしか読めない (window.<名前> は常に undefined) ──
        out.seam = {
          scenarios:          typeof scenarios,
          PARTY_SIZE:         typeof PARTY_SIZE,
          recruitCountOf:     typeof recruitCountOf,
          isRecruitOn:        typeof isRecruitOn,
          buildParty:         typeof buildParty,
          buildPartyArity:    (typeof buildParty === 'function') ? buildParty.length : -1,
          regenerate:         typeof regeneratePartyMembers,
          departToScenario:   typeof departToScenario,
          onWindowPARTY_SIZE: typeof window.PARTY_SIZE,
          recruitOn:          (typeof isRecruitOn === 'function') ? isRecruitOn() : null,
          allIds:             scenarios.map(s => s.id),
        };
        out.partySize = PARTY_SIZE;
        for (const id of idList) {
          const sc = scenarios.find(s => s.id === id);
          if (!sc) { out.rows.push({ id, wrote: false, total: -1, npc: -1, missing: true }); continue; }
          prepScenario = sc;                 // openPrep(sc) 相当 (人数を決める入力を確定させる)
          regeneratePartyMembers();          // ★本番の再抽選
          sessionStorage.removeItem('dragonfighters.partyMembers');   // 前周の値を残さない
          departToScenario();                // ★本番の出発処理 (index.html への遷移は横取りで abort)
          const raw = sessionStorage.getItem('dragonfighters.partyMembers');
          let arr = null;
          try { arr = JSON.parse(raw); } catch (e) {}
          const ok = Array.isArray(arr);
          out.rows.push({
            id,
            wrote:   raw !== null,
            total:   ok ? arr.length : -1,
            npc:     ok ? arr.length - 1 : -1,
            heroes:  ok ? arr.filter(m => m && m.isHero).length : -1,
            zones:   ok ? arr.map(m => m && m.zone).join('>') : '',
            decided: (typeof recruitCountOf === 'function') ? recruitCountOf(sc) : null,  // 経路 B
            difficulty: sc.difficulty === undefined ? '(なし)' : sc.difficulty,
            wroteScenario: sessionStorage.getItem('dragonfighters.currentScenario'),
          });
          out.sawIds.push(id);
        }
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    }, ids);
  }

  const dump = (rows) => rows.map(r => r.id + '(' + r.difficulty + ')=計' + r.total + '人/NPC' + r.npc + '/決定' + r.decided).join('  ');

  /* 出発準備画面まで進む汎用ループ (driver_depart_menu_clean.js の作法を踏襲)。
     ⚠ 受注ナレは音声ペースだとクリックで飛ばせないので待ち budget を大きく取る。 */
  const VIS_FN = `(function(el){
    if (!el) return false;
    if (typeof el.checkVisibility === 'function')
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    return el.getClientRects().length > 0;
  })`;
  async function advanceToPrep(page, maxSteps) {
    const steps = [];
    for (let i = 0; i < (maxSteps || 150); i++) {
      const st = await page.evaluate((visSrc) => {
        const vis = eval(visSrc);
        const q = (id) => document.getElementById(id);
        if (vis(q('prep'))) return { done: true, at: 'prep' };
        if (vis(q('partyMatchOverlay'))) { q('partyMatchOverlay').click(); return { done: false, at: 'partyMatchOverlay' }; }
        if (vis(q('prologueOverlay')))   { q('prologueOverlay').click();   return { done: false, at: 'prologueOverlay' }; }
        const acc = q('btnAccept');
        if (vis(acc) && !acc.disabled) { acc.click(); return { done: false, at: 'btnAccept' }; }
        const t = document.querySelector('#tableArea .table');
        if (t && vis(t)) { t.click(); return { done: false, at: 'table' }; }
        return { done: false, at: '(待機)' };
      }, VIS_FN);
      if (steps[steps.length - 1] !== st.at) steps.push(st.at);
      if (st.done) return { reached: true, steps };
      await sleep(420);
    }
    return { reached: false, steps };
  }

  let PROD_VERDICT = null;   // (A) が judgePartySizes で true を得た記録 (共有が空振りしていない証明)

  try {
    /* ══════════════════════════════════════════════════════════════════════
     * (S) シーム: 本番の識別子が読めること + 期待表そのものの健全性
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (S) シームと期待表の健全性 ---');
    const pageS = await openPage('/tavern.html?recruit=1');
    const obsS = await observeDepartSizes(pageS, []);
    console.log('       seam = ' + JSON.stringify(obsS.seam));
    check('(S1) [装置] scenarios / recruitCountOf / departToScenario を裸の識別子で読めた',
      obsS.seam.scenarios === 'object' && obsS.seam.recruitCountOf === 'function'
      && obsS.seam.departToScenario === 'function' && obsS.seam.regenerate === 'function'
      && obsS.threw === '', 'threw=' + (obsS.threw || 'なし'));
    check('(S2) [装置] window.PARTY_SIZE は undefined (classic script 直下の const なので正常)',
      obsS.seam.onWindowPARTY_SIZE === 'undefined', 'typeof=' + obsS.seam.onWindowPARTY_SIZE);
    check('(S3) [装置] 期待表の 6 つの id が scenarios に過不足なく実在する',
      SCENARIO_IDS.every(id => (obsS.seam.allIds || []).indexOf(id) >= 0)
      && SCENARIO_IDS.length === Object.keys(EXPECTED_NPC_RECRUIT).length,
      'scenarios=' + JSON.stringify(obsS.seam.allIds));
    const distinct = new Set(Object.values(EXPECTED_NPC_RECRUIT));
    check('(Sz) [装置] 期待表が 1 種類の値に潰れていない (全部同値なら一致は自明で無意味)',
      distinct.size >= 2, '期待値の種類=' + JSON.stringify([...distinct]));
    check('(S4) ?recruit=1 で isRecruitOn() が true (段階スイッチが読めている)',
      obsS.seam.recruitOn === true, 'isRecruitOn()=' + obsS.seam.recruitOn);
    // tavern.html / index.html のソース側の静的検査
    const tavSrc = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
    const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    check('(S5) isRecruitOn がモジュール直下の const ではなく function 宣言 (TDZ 回避の作法)',
      /function isRecruitOn\s*\(/.test(tavSrc) && !/const\s+isRecruitOn/.test(tavSrc));
    check('(S6) PARTY_SIZE 定数を消していない (既定値としてのみ残す)',
      /const PARTY_SIZE\s*=\s*4;/.test(tavSrc));
    check('(S7) buildParty の第2引数の既定値が PARTY_SIZE',
      /function buildParty\(heroClassKey,\s*partySize\s*=\s*PARTY_SIZE\)/.test(tavSrc));
    check('(S8) index.html を 1 行も触っていない (依頼書「触らないと決めたファイル」)',
      /const PARTY_SIZE\s*=\s*4;/.test(idxSrc) && /function buildParty\(heroClassKey\)\s*\{/.test(idxSrc),
      'index.html の buildParty(heroClassKey) は 1 引数のまま');
    check('(S9) シナリオ表に recruit: の具体値を入れていない (器だけ。値は依頼書 D の担当)',
      !/^\s*recruit:\s*\d/m.test(tavSrc));
    await pageS.close();

    /* ══════════════════════════════════════════════════════════════════════
     * (A) 受入条件 1. / 2. : ?recruit=1 で 6 シナリオの出発人数
     *   ⚠ STEP2 (既定 ON) になったらこの URL から ?recruit=1 を外すこと。期待表は据え置き。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (A) 受入条件 1. 2. : ?recruit=1 で 6 シナリオの出発人数 ---');
    const pageA = await openPage('/tavern.html?recruit=1');
    const obsA = await observeDepartSizes(pageA, SCENARIO_IDS);
    /* ⚠ location.href への代入は **同期では飛ばない**。evaluate が返った直後に
       navBlocked を読むと必ず 0 件になり、(Az3) が「横取りが空振り」と偽の赤を出す
       (実測で踏んだ)。遷移が実際にネットワーク層へ届くまで待ってから読む。 */
    await sleep(900);
    console.log('       PARTY_SIZE = ' + obsA.partySize);
    console.log('       観測: ' + dump(obsA.rows));
    check('(Az0) [装置] 観測中に例外が出ていない', obsA.threw === '', obsA.threw || 'なし');
    check('(Az1) [装置] 6 シナリオを実際に踏んだ (母集団が空でない)',
      obsA.sawIds.length === 6, '踏んだ id = ' + obsA.sawIds.join(', '));
    check('(Az2) [装置] 6 件すべてで本番の出発処理が partyMembers を書いた',
      obsA.rows.length === 6 && obsA.rows.every(r => r.wrote === true),
      obsA.rows.map(r => r.id + ':' + r.wrote).join(' '));
    check('(Az3) [装置] departToScenario() が実際に index.html へ遷移しようとし、横取りで酒場に留まった',
      pageA.__navBlocked.length >= 1 && /\/tavern\.html/.test(pageA.url()),
      'abort した遷移 = ' + pageA.__navBlocked.length + ' 件 / 現在地 = ' + pageA.url());
    check('(Az4) [装置] 経路A(実際に起きた側) と 経路B(recruitCountOf) が 6 件とも一致する',
      obsA.rows.length === 6 && obsA.rows.every(r => r.npc === r.decided),
      obsA.rows.map(r => r.id + ' npc' + r.npc + '/決定' + r.decided).join(' '));

    const vA = judgePartySizes(obsA.rows, EXPECTED_NPC_RECRUIT);
    PROD_VERDICT = vA.ok;
    check('(A) ★受入条件1: 6 シナリオの出発パーティが 1 + 期待値 になる',
      vA.ok, vA.diffs.length ? vA.diffs.join(' / ') : '差分なし');
    const nA = judgeNoOverflow(obsA.rows, 4);
    check('(A2) ★受入条件2: どのクエストでもパーティが 4 人を超えない',
      nA.ok, nA.over.length ? '超過: ' + nA.over.join(' ')
        : '超過なし (最大 ' + Math.max.apply(null, obsA.rows.map(r => r.total)) + ' 人)');
    check('(A3) 主人公はどのクエストでもちょうど 1 人 (NPC だけが増減している)',
      obsA.rows.every(r => r.heroes === 1), obsA.rows.map(r => r.id + ':' + r.heroes).join(' '));
    check('(A4) ★4 の dragon-lair が clamp されて NPC 3 (上限 3 を外していない)',
      (obsA.rows.find(r => r.id === 'dragon-lair') || {}).npc === 3,
      'difficulty=' + (obsA.rows.find(r => r.id === 'dragon-lair') || {}).difficulty);
    await pageA.close();

    /* ══════════════════════════════════════════════════════════════════════
     * (B) 本番導線: 実クリックで酒場 → 出発準備 → 出発 (近道と一致するか)
     *   ⭐ (A) は prepScenario を直接置いて測る近道なので、その近道が
     *      **実プレイの導線と同じ結果になる**ことを 1 本だけ実測で押さえる。
     *   ⚠ 既定で解放されているのは goblin-mine (テーブル1) だけなので 1 件で測る。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (B) 本番導線: 実クリックで goblin-mine に出発 (?recruit=1) ---');
    const pageB = await openPage('/tavern.html?recruit=1');
    const advB = await advanceToPrep(pageB);
    check('(Bz1) [装置] 実クリック導線で出発準備画面まで到達した (これが無いと以下は空振り)',
      advB.reached, 'steps=' + advB.steps.join('>'));
    const obsB = await pageB.evaluate(() => {
      sessionStorage.removeItem('dragonfighters.partyMembers');
      const btn = document.getElementById('btnDepart');
      const clicked = !!btn;
      if (btn) btn.click();                       // ★本番の「出発する」ボタン
      const raw = sessionStorage.getItem('dragonfighters.partyMembers');
      let arr = null; try { arr = JSON.parse(raw); } catch (e) {}
      return {
        clicked,
        prepId: (typeof prepScenario === 'object' && prepScenario) ? prepScenario.id : null,
        total: Array.isArray(arr) ? arr.length : -1,
        npc:   Array.isArray(arr) ? arr.length - 1 : -1,
        previewRows: document.querySelectorAll('#partyPreview > div').length,
      };
    });
    console.log('       観測: ' + JSON.stringify(obsB));
    check('(Bz2) [装置] 「出発する」ボタンを実際に押した + 受注したのは goblin-mine',
      obsB.clicked === true && obsB.prepId === 'goblin-mine', 'prepScenario=' + obsB.prepId);
    check('(B) 実クリック導線でも goblin-mine は主人公1 + NPC1 = 2 人 (近道と一致)',
      obsB.npc === EXPECTED_NPC_RECRUIT['goblin-mine'] && obsB.total === 2,
      '計' + obsB.total + '人 / NPC' + obsB.npc);
    check('(B2) 準備画面のプレビュー行数も 2 (UI が同じ人数を見ている)',
      obsB.previewRows === 2, 'previewRows=' + obsB.previewRows);
    await pageB.close();

    /* ══════════════════════════════════════════════════════════════════════
     * (C) 受入条件 8. : 既定 OFF (URL 無指定) で挙動が 1 ミリも変わっていない
     *   ⭐⭐⭐ STEP2 で既定 ON にした瞬間、(C) は **赤へ反転する**のが正しい。
     *      反転を見たら URL を '/tavern.html?recruit=0' に張り替える = 受入条件 7. になる。
     *      期待値 (legacyExpectation) は据え置き。「赤を機械的に緩める」必要が原理的に無い。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (C) 受入条件 8. : URL 無指定 = 従来どおり (挙動不変の直接の物差し) ---');
    const pageC = await openPage('/tavern.html');
    const obsC = await observeDepartSizes(pageC, SCENARIO_IDS);
    console.log('       観測: ' + dump(obsC.rows));
    check('(Cz0) [装置] 観測中に例外が出ていない', obsC.threw === '', obsC.threw || 'なし');
    check('(Cz1) [装置] 6 シナリオを実際に踏んだ (母集団が空でない)',
      obsC.sawIds.length === 6, '踏んだ id = ' + obsC.sawIds.join(', '));
    check('(Cz2) [装置] URL 無指定では isRecruitOn() が false (段階スイッチが効いている)',
      obsC.seam.recruitOn === false, 'isRecruitOn()=' + obsC.seam.recruitOn);

    const legacy = legacyExpectation(SCENARIO_IDS, obsC.partySize);
    const vC = judgePartySizes(obsC.rows, legacy);
    check('(C) ★受入条件8: URL 無指定なら 6 シナリオ全部が従来どおり ' + obsC.partySize + ' 人',
      vC.ok, vC.diffs.length ? vC.diffs.join(' / ') : '差分なし');
    const nC = judgeNoOverflow(obsC.rows, 4);
    check('(C2) 受入条件2 は既定 OFF でも成り立つ (4 人を超えない)',
      nC.ok, nC.over.length ? '超過: ' + nC.over.join(' ') : '超過なし');

    /* ⭐⭐⭐ 共有が空振りしていない証明:
       **同じ judgePartySizes に (A) の期待表を通すと (C) の観測は落ちる**。
       これが緑にならない = 「どんな入力でも true を返す壊れた関数」を掴んでいる、ということ。 */
    const vCwrong = judgePartySizes(obsC.rows, EXPECTED_NPC_RECRUIT);
    check('(Cz3) [装置] 同じ判定関数に募集ONの期待表を通すと (C) の観測は落ちる (恒真でない証明)',
      vCwrong.ok === false && vCwrong.diffs.length >= 3,
      '差分 ' + vCwrong.diffs.length + ' 件: ' + vCwrong.diffs.slice(0, 3).join(' / '));
    check('(Cz4) [装置] 同じ判定関数が (A) では true を返していた (共有が空振りでない)',
      PROD_VERDICT === true, 'PROD_VERDICT=' + PROD_VERDICT);
    check('(Cz5) [装置] 空の観測を通すと落ちる (母集団が空でも緑になる測定器ではない)',
      judgePartySizes([], EXPECTED_NPC_RECRUIT).ok === false && judgeNoOverflow([], 4).ok === false);
    /* スイッチを外すと期待値が変わる、を数値そのもので言い直す (依頼書の受入条件 7. の先取り) */
    const flipped = SCENARIO_IDS.filter(id => {
      const a = (obsA.rows.find(r => r.id === id) || {}).npc;
      const c = (obsC.rows.find(r => r.id === id) || {}).npc;
      return a !== c;
    });
    check('(Cz6) [装置] ?recruit=1 の有無で実際に人数が変わる id が 3 件以上ある (スイッチが飾りでない)',
      flipped.length >= 3, '変わった id = ' + flipped.join(', '));
    await pageC.close();

    check('(Z) JS エラーが 1 件も出ていない', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } catch (e) {
    check('(FATAL) ドライバが例外で停止', false, (e && e.stack) || String(e));
  } finally {
    await browser.close();
    srv.close();
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n══════════ 結果: ' + pass + '/' + results.length + ' PASS ══════════');
  if (pass !== results.length) {
    console.log('NG 一覧:');
    results.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name + (r.detail ? '  -- ' + r.detail : '')));
  }
  process.exit(pass === results.length ? 0 : 1);
})();
