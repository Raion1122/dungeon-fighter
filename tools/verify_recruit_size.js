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
 *                    ⭐ **STEP2 (項目2) で既定 ON になった**ので (A) は URL 無指定で測る。
 *                       = 「実プレイヤーが踏む URL でそうなる」を直接の物差しにしている。
 *   ✅ 受入条件 2. : どのクエストでもパーティが 4 人を超えない
 *   ✅ 受入条件 7. : `?recruit=0` (撤退スイッチ) を付けると 6 件とも従来どおり PARTY_SIZE 人。
 *                    ⭐⭐⭐ 予告どおり STEP2 で (C) が赤へ反転したので、**期待値ではなく
 *                       測定点 (URL) を張り替えた**。legacyExpectation / EXPECTED_NPC_RECRUIT は
 *                       STEP1 から 1 文字も変えていない。
 *                       「?recruit=0 で緑」だけでは何も証明しないので、(Cz3)(Cz4)(Cz6) が
 *                       「同じ判定関数」「同じ観測」で **スイッチを外すと期待値が変わる** を測る。
 *   ✅ 受入条件 8. : STEP1 完了時点 (既定 OFF) で既存 golden 全緑 — 項目1 で実測済み。
 *                    STEP2 の非退行は golden 側 (tools/_golden.js) と triage 一覧が担当。
 *   ✅ 受入条件 3. : 生成クエスト (闇市) の NPC 3 人 + `[DIAG] recruit: fallback used` の実在 → (F)
 *                    ⭐⭐ 「ログが出た」は件数の絶対値では測らない。観測の直前に consoleLines の
 *                       件数を採り、**差分だけ**を見る (「X したから今の状態」と「元から同じ状態」は
 *                       区別できない)。区間を 3 つに割って「どの操作が出したか」まで確定させる。
 *   ✅ 受入条件 4. : `recruit:` の個別上書きが効く → (G) は **bandits-forest** で測る
 *                    ⚠⚠ [#8 で測定点を移した] 旧: goblin-mine で測っていた。#8 が
 *                       goblin-mine のソースへ `recruit: 3` を書いたので、そこで注入しても
 *                       「元から 3 だった」と区別できず (Gz1) も原理的に赤くなる。
 *                       → **期待値を緩めず、まだ recruit: を持たない bandits-forest へ移した**。
 *                       goblin-mine 側は (G4)(G5) が「ソースの値が効いている」を別途押さえる。
 *   ✅ 受入条件 5. : 隊列順が front → mid → rear のまま → (H)
 *                    ⚠ 全員 front の隊列は自明にソート済 = 何も証明しない。(Hz1) が
 *                       「zone が 2 種類以上ある行が実在する」を装置 assert で押さえる。
 *   ✅ 受入条件 6. : 「募集をかけ直す」で顔ぶれが変わり人数は変わらない → (D6a)(D6b)
 *                    ⭐ 顔ぶれが変わるは乱数依存なので 1 回では測れない。10 回押して
 *                       11 サンプル中に 2 種類以上の顔ぶれがあることで測る (全同一の確率 (1/48)^10)。
 *   ✅ 項目3 の UI  : ボタンのラベル (D1) / 「この依頼に応じた冒険者: N 人」(D2)(D3)(D4)
 *                    / #pmSub の人数出し分け (E1)(E2)(E3)(E4)(E5)
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
 * 期待表 (依頼書「受入条件」の表そのもの)。⚠ ここは STEP2 でも 1 文字も変えなかった。
 * 変えたのは「どの URL でこの表を当てるか」だけ (STEP1: ?recruit=1 / STEP2: 無指定)。
 * ══════════════════════════════════════════════════════════════════════════ */
const SCENARIO_IDS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const EXPECTED_NPC_RECRUIT = {
  /* ⚠ ★☆☆ だが #8 で `recruit: 3` を個別上書きした (tavern.html の goblin-mine 定義)。
     期待値を緩めたのではなく **本番の仕様が変わった**。80 走行のペア比較でクリア率
     55% → 15% と一方向に出たため (依頼書 #8 §9-2 / §9-4)。連動は他 5 シナリオで保つ。 */
  'goblin-mine':    3,   // ★☆☆ + recruit: 3 の個別上書き
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

    /* ★ 酒場から出ていく遷移を abort する。departToScenario() は本番のまま完走させ、
         tavern.html のページ (と JS 状態) を生かしたまま何度も測る。
       ⚠⚠⚠ **world.html を含めること** (実測 2026-08-26 / 実装依頼書 #23 項目 2)。
         #23 以降、本筋 6 シナリオの出発は **地方全景 (world.html)** を 1 段挟む。
         index.html だけを abort していると酒場のタブが本当に地図へ遷移し、
         以降の evaluate が全部 "Execution context was destroyed" /
         "QuestGen is not defined" で倒れる (実測: 82/82 → 57/66 + FATAL)。
       ⭐ ここで ?questwalk=0 (#23 の撤退スイッチ) へ逃げない。本ドライバが測るのは
         人数だけで行き先は何でもよい → **既定の本番導線のまま**測る方が強い。 */
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      try {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame() && /\/(index|world)\.html/.test(r.url())) {
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
        /* #35: 全確定後の「背景タップ = 出発」は廃止され、出発の口は #pmDepart になった。
           ⚠ 開示中 (reveal) はスキップのために背景を叩く必要が残るので **2 段**にする。
           ⭐ フォールバックを残すのは ?pmsetup=0 / 旧版でも同じ手順で突破できるようにするため。 */
        if (vis(q('partyMatchOverlay'))) {
          const dep = q('pmDepart');
          if (dep && vis(dep)) { dep.click(); return { done: false, at: 'pmDepart' }; }
          q('partyMatchOverlay').click(); return { done: false, at: 'partyMatchOverlay' };
        }
        if (vis(q('prologueOverlay')))   { q('prologueOverlay').click();   return { done: false, at: 'prologueOverlay' }; }
        const acc = q('btnAccept');
        if (vis(acc) && !acc.disabled) { acc.click(); return { done: false, at: 'btnAccept' }; }
        /* ⭐ #25 で酒場が歩ける地図になり、卓は床の上の席札 (#questTable_<scenarioId>) になった。
           地図 ON では body.tavernMapOn #tableArea { display:none } なので vis() が false → 一度も押されず (待機) で打ち切られた。
           カンマ区切りの querySelector は「セレクタ順」でなく **文書順** で 1 件返す。
           #tavernViewport (席札) は #tableArea より前にあるので席札が勝ち、撤退 ?tavernmap=0 では
           席札が存在しないので #tableArea .table が返る (両方の経路を測る)。 */
        const t = document.querySelector('#questTable_goblin-mine, #tableArea .table');
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
    const pageS = await openPage('/tavern.html');
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
    check('(S4) URL 無指定で isRecruitOn() が true (STEP2: 既定 ON になっている)',
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
    /* ⚠⚠ [#8 で測定点を移した] 旧: 「recruit: の具体値を入れていない」(= #7 は器だけ作る)。
       #8 が値を入れたので旧条件は原理的に赤。**期待値を緩めるのではなく**、
       「値がどこに何件あるか」を固定する検査へ移す = 他シナリオへ勝手に増えたら赤になる。
       どのシナリオが持っているかはランタイム側の (G5) が押さえる (2 経路)。 */
    const recruitLits = tavSrc.match(/^\s*recruit:\s*\d+/mg) || [];
    check('(S9) recruit: の具体値は 1 件だけ・値は 3 (#8 で goblin-mine に入れたぶん)',
      recruitLits.length === 1 && /^\s*recruit:\s*3$/.test(recruitLits[0]),
      '件数=' + recruitLits.length + ' / ' + JSON.stringify(recruitLits));
    /* (S10) 項目3: ボタン名とナレの言い回しを揃えた。揃えないと「仲間を引き直す」と
       語りかけるナレの先に「募集をかけ直す」ボタンがある、という食い違いが残る。 */
    check('(S10) tavern.html に旧「仲間を引き直す」が 1 箇所も残っていない (ナレ文を含む)',
      !/仲間を引き直す/.test(tavSrc) && /「募集をかけ直す」/.test(tavSrc),
      '旧文言の残存 = ' + (tavSrc.match(/仲間を引き直す/g) || []).length + ' 件');
    await pageS.close();

    /* ══════════════════════════════════════════════════════════════════════
     * (A) 受入条件 1. / 2. : **URL 無指定** (= 実プレイヤーが踏む経路) で 6 シナリオの出発人数
     *   ⭐ STEP2 で既定 ON になったので ?recruit=1 を外した。期待表は据え置き。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (A) 受入条件 1. 2. : URL 無指定 (既定 ON) で 6 シナリオの出発人数 ---');
    const pageA = await openPage('/tavern.html');
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
    console.log('\n--- (B) 本番導線: 実クリックで goblin-mine に出発 (URL 無指定 = 既定 ON) ---');
    const pageB = await openPage('/tavern.html');
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
    /* ⚠ #8 で goblin-mine に recruit: 3 が入り総数は 4。数字を直書きすると期待表と
       二重管理になる → EXPECTED_NPC_RECRUIT から導いて出所を 1 本にする。 */
    const B_NPC   = EXPECTED_NPC_RECRUIT['goblin-mine'];
    const B_TOTAL = B_NPC + 1;   // 主人公 1 + NPC
    check('(B) 実クリック導線でも goblin-mine は主人公1 + NPC' + B_NPC + ' = ' + B_TOTAL + ' 人 (近道と一致)',
      obsB.npc === B_NPC && obsB.total === B_TOTAL,
      '計' + obsB.total + '人 / NPC' + obsB.npc);
    check('(B2) 準備画面のプレビュー行数も ' + B_TOTAL + ' (UI が同じ人数を見ている)',
      obsB.previewRows === B_TOTAL, 'previewRows=' + obsB.previewRows);
    await pageB.close();

    /* ══════════════════════════════════════════════════════════════════════
     * (C) 受入条件 7. : 撤退スイッチ ?recruit=0 を付けると従来どおり PARTY_SIZE 人へ戻る
     *   ⭐⭐⭐ STEP1 ではここが「URL 無指定 = 受入条件 8 (挙動不変)」だった。予告どおり
     *      STEP2 で赤へ反転したので、**期待値ではなく測定点 (URL) を張り替えた**。
     *      legacyExpectation は 1 文字も変えていない = 「赤を機械的に緩める」経路が原理的に無い。
     *   ⚠ 「?recruit=0 で緑」だけでは何も証明しない (何も起きなくても一致する)。
     *      (Cz3)(Cz4) が **判定関数の共有**を、(Cz6) が **数値そのものが動くこと**を押さえる。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (C) 受入条件 7. : ?recruit=0 (撤退スイッチ) = 従来どおり ---');
    const pageC = await openPage('/tavern.html?recruit=0');
    const obsC = await observeDepartSizes(pageC, SCENARIO_IDS);
    console.log('       観測: ' + dump(obsC.rows));
    check('(Cz0) [装置] 観測中に例外が出ていない', obsC.threw === '', obsC.threw || 'なし');
    check('(Cz1) [装置] 6 シナリオを実際に踏んだ (母集団が空でない)',
      obsC.sawIds.length === 6, '踏んだ id = ' + obsC.sawIds.join(', '));
    check('(Cz2) [装置] ?recruit=0 では isRecruitOn() が false (撤退スイッチが効いている)',
      obsC.seam.recruitOn === false, 'isRecruitOn()=' + obsC.seam.recruitOn);

    const legacy = legacyExpectation(SCENARIO_IDS, obsC.partySize);
    const vC = judgePartySizes(obsC.rows, legacy);
    check('(C) ★受入条件7: ?recruit=0 なら 6 シナリオ全部が従来どおり ' + obsC.partySize + ' 人',
      vC.ok, vC.diffs.length ? vC.diffs.join(' / ') : '差分なし');
    const nC = judgeNoOverflow(obsC.rows, 4);
    check('(C2) 受入条件2 は ?recruit=0 でも成り立つ (4 人を超えない)',
      nC.ok, nC.over.length ? '超過: ' + nC.over.join(' ') : '超過なし');

    /* ⭐⭐⭐ 共有が空振りしていない証明:
       **同じ judgePartySizes に (A) の期待表を通すと (C) の観測は落ちる**。
       これが緑にならない = 「どんな入力でも true を返す壊れた関数」を掴んでいる、ということ。 */
    const vCwrong = judgePartySizes(obsC.rows, EXPECTED_NPC_RECRUIT);
    /* ⚠⚠ [#8 で測定点を移した] 旧: diffs.length >= 3 (件数の直書き)。#8 で goblin-mine が
       既定 3 / 撤退 3 と揃って差分から抜け、2 件に減って原理的に赤くなった。
       **件数を緩めるのではなく**、期待表と legacyExpectation から「食い違うはずの id」を
       導出して**集合ごと**突き合わせる = どの id が動くかまで固定するので厳しくなる。
       ⚠ C_SHOULD_DIFFER.length > 0 が母集団ガード (全シナリオが揃うと空振りで緑になるのを防ぐ)。 */
    const C_LEGACY_NPC    = obsA.partySize - 1;
    const C_SHOULD_DIFFER = SCENARIO_IDS.filter(id => EXPECTED_NPC_RECRUIT[id] !== C_LEGACY_NPC);
    check('(Cz3) [装置] 同じ判定関数に募集ONの期待表を通すと ?recruit=0 の観測は落ちる (恒真でない証明)',
      vCwrong.ok === false && C_SHOULD_DIFFER.length > 0
        && vCwrong.diffs.length === C_SHOULD_DIFFER.length
        && C_SHOULD_DIFFER.every(id => vCwrong.diffs.some(d => d.indexOf(id + ':') === 0)),
      '差分 ' + vCwrong.diffs.length + ' 件 (期待 ' + C_SHOULD_DIFFER.length + ' 件 = ['
        + C_SHOULD_DIFFER.join(',') + ']): ' + vCwrong.diffs.slice(0, 3).join(' / '));
    check('(Cz4) [装置] 同じ判定関数が (A) では true を返していた (共有が空振りでない)',
      PROD_VERDICT === true, 'PROD_VERDICT=' + PROD_VERDICT);
    check('(Cz5) [装置] 空の観測を通すと落ちる (母集団が空でも緑になる測定器ではない)',
      judgePartySizes([], EXPECTED_NPC_RECRUIT).ok === false && judgeNoOverflow([], 4).ok === false);
    /* ★受入条件 7. の本体: 「?recruit=0 で緑」ではなく **スイッチを外すと期待値が変わる** を数値で測る */
    const flipped = SCENARIO_IDS.filter(id => {
      const a = (obsA.rows.find(r => r.id === id) || {}).npc;
      const c = (obsC.rows.find(r => r.id === id) || {}).npc;
      return a !== c;
    });
    check('(Cz6) [装置] ?recruit=0 の有無で人数が変わる id が、期待表から導いた集合とちょうど一致 (スイッチが飾りでない)',
      C_SHOULD_DIFFER.length > 0 && flipped.length === C_SHOULD_DIFFER.length
        && C_SHOULD_DIFFER.every(id => flipped.indexOf(id) >= 0),
      '変わった id = [' + flipped.join(', ') + '] / 期待 = [' + C_SHOULD_DIFFER.join(', ') + ']');
    await pageC.close();


    /* ══════════════════════════════════════════════════════════════════════
     * (D) 受入条件 6. + 項目3 で足した UI
     *   ・「募集をかけ直す」ボタンのラベル
     *   ・「この依頼に応じた冒険者: N 人」の 1 行
     *   ⭐⭐ N は **画面の文字列** と **実体の配列長** の 2 経路で突き合わせる。
     *      片方の写経にすると「定数を書いただけ」でも緑になる。
     *   ⚠ ★1 (NPC1) と ★3 (NPC3) の 2 シナリオで測る。1 シナリオだけだと
     *      「N を直書きした実装」と区別できない ((Dz6) がそれを押さえる)。
     *   ⚠⚠ この行は #partyPreview の **外側** にある必要がある (中に入れると (B2) が赤くなる)。
     *      (Dz4) が「実際に外側にある」を測るので、内側へ移した瞬間にここで落ちる。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (D) 受入条件 6. + 応募人数の行 / ボタンのラベル ---');

    /* 「募集をかけ直す」を PRESSES 回押しながら、押すたびに
         ・実体 selection.partyMembers の 顔ぶれ署名 / 人数
         ・画面の #recruitCountLine の文字列
       を採る。⚠ 本番のボタンを **実際に click** する (ハンドラを写経しない)。 */
    const REROLL_PRESSES = 10;
    /* ⭐ 「顔ぶれが変わる」は乱数依存なので **1 回では測れない**。
       goblin-mine は NPC 1 人で、名前は NPC_NAMES 16 個から一様 (usedNames は buildParty ごとに新規)、
       職業は mid の 3 職から一様 → 1 回のかけ直しで **まったく同じ NPC** が出る確率は 1/48。
       10 回押して 11 サンプルすべてが同一になる確率は (1/48)^10 ≒ 6e-17。
       → 「11 サンプル中に 2 種類以上の顔ぶれがある」なら実質フレークしない。
       (NPC 3 人の orc-fort はさらに小さいので同じ閾値で足りる) */
    async function probeRecruitUi(page, scId, presses) {
      return page.evaluate((cfg) => {
        const out = { threw: '', id: cfg.scId || '(現状のまま)', samples: [], clicked: 0,
                      btnLabel: '', lineOutsidePreview: null, lineN: null, seam: {} };
        try {
          const btn    = document.getElementById('btnReroll');
          const lineEl = document.getElementById('recruitCountLine');
          const prevEl = document.getElementById('partyPreview');
          out.seam = { btn: !!btn, lineEl: !!lineEl, prevEl: !!prevEl,
                       renderRecruitCountLine: typeof renderRecruitCountLine,
                       renderPartyPreview: typeof renderPartyPreview };
          if (cfg.scId) {
            const sc = scenarios.find(s => s.id === cfg.scId);
            prepScenario = sc;            // openPrep(sc) が最初にやることと同じ
            regeneratePartyMembers();     // ★本番の再抽選
            renderPartyPreview();         // ★本番の描画 (この中で応募人数の行も更新される)
          }
          const snap = () => {
            const ms = selection.partyMembers || [];
            return {
              npc:   ms.filter(m => m && !m.isHero).length,
              total: ms.length,
              sig:   ms.map(m => (m && m.isHero ? '★' + m.classKey : (m && m.name) + '|' + (m && m.classKey))).join(','),
              line:  lineEl ? (lineEl.textContent || '') : '(要素なし)',
              rows:  document.querySelectorAll('#partyPreview > div').length,
            };
          };
          out.samples.push(snap());
          for (let i = 0; i < cfg.presses; i++) {
            if (!btn) break;
            btn.click();                  // ★本番の「募集をかけ直す」を実際に押す
            out.clicked++;
            out.samples.push(snap());
          }
          out.btnLabel = btn ? (btn.textContent || '').trim() : '(ボタンなし)';
          out.lineOutsidePreview = !!(lineEl && prevEl && !prevEl.contains(lineEl));
          const last = out.samples[out.samples.length - 1];
          const m = /(\d+)\s*人/.exec(last.line);
          out.lineN = m ? parseInt(m[1], 10) : null;   // 経路A: 画面の文字列から読んだ N
        } catch (e) { out.threw = String((e && e.message) || e); }
        return out;
      }, { scId: scId, presses: presses });
    }
    /* 受入条件 6. の判定本体。⚠ サンプルが 1 個以下なら false (空で緑にならない)。 */
    function judgeReroll(samples) {
      const counts = new Set((samples || []).map(s => s.npc));
      const sigs   = new Set((samples || []).map(s => s.sig));
      return { ok: (samples || []).length >= 2 && counts.size === 1 && sigs.size >= 2,
               counts: [...counts], sigKinds: sigs.size };
    }

    const pageD = await openPage('/tavern.html');
    const advD = await advanceToPrep(pageD);
    check('(Dz1) [装置] 実クリック導線で出発準備画面まで到達した (これが無いと以下は空振り)',
      advD.reached, 'steps=' + advD.steps.join('>'));
    // ★1 = goblin-mine。実クリック導線が確定させた状態をそのまま使う (scId=null で上書きしない)。
    const probeD1 = await probeRecruitUi(pageD, null, REROLL_PRESSES);
    /* ⚠⚠ [#8 で測定点を移した] 旧: ★3 = orc-fort。#8 で goblin-mine が NPC3 になり
       orc-fort と同数 = (Dz7)「2 つの対象で N が実際に違う」が原理的に赤くなった。
       → **期待値を緩めず、期待表で値の異なる ★2 = bandits-forest へ相手を移す**。
       「★3 が 3 人」自体は (A) が 6 シナリオぶん測っているので失われない。
       準備画面の DOM は生きているので prepScenario を差し替えて本番描画を通す。 */
    const probeD2 = await probeRecruitUi(pageD, 'bandits-forest', REROLL_PRESSES);
    const showP = (p) => p.id + ': ラベル"' + p.btnLabel + '" / 行"' + (p.samples[p.samples.length - 1] || {}).line
      + '" / 実体NPC' + (p.samples[p.samples.length - 1] || {}).npc + ' / 顔ぶれ' + new Set(p.samples.map(s => s.sig)).size + '種';
    console.log('       ' + showP(probeD1));
    console.log('       ' + showP(probeD2));
    console.log('       seam = ' + JSON.stringify(probeD1.seam));

    check('(Dz2) [装置] (D) の観測中に例外が出ていない',
      probeD1.threw === '' && probeD2.threw === '', (probeD1.threw || '') + (probeD2.threw || '') || 'なし');
    check('(Dz3) [装置] 「募集をかけ直す」ボタンを実際に ' + REROLL_PRESSES + ' 回ずつ押せた',
      probeD1.clicked === REROLL_PRESSES && probeD2.clicked === REROLL_PRESSES,
      '押した回数 = ' + probeD1.clicked + ' / ' + probeD2.clicked);
    check('(Dz4) [装置] 応募人数の行は #partyPreview の **外側** にある ((B2) の行数 assert を壊さない)',
      probeD1.lineOutsidePreview === true && probeD2.lineOutsidePreview === true,
      'outside=' + probeD1.lineOutsidePreview + '/' + probeD2.lineOutsidePreview);
    check('(Dz5) [装置] #partyPreview の行数は依然としてパーティ総人数と一致 (母集団が壊れていない)',
      probeD1.samples.every(s => s.rows === s.total) && probeD2.samples.every(s => s.rows === s.total),
      '★1: rows/total=' + probeD1.samples[0].rows + '/' + probeD1.samples[0].total
      + '  ★2: rows/total=' + probeD2.samples[0].rows + '/' + probeD2.samples[0].total);

    check('(D1) 「募集をかけ直す」ボタン: ラベルに「募集」が入り、旧「引き直」が残っていない',
      /募集/.test(probeD1.btnLabel) && !/引き直/.test(probeD1.btnLabel), 'ラベル = "' + probeD1.btnLabel + '"');

    /* ★受入条件 6: 押すと顔ぶれが変わり、人数は変わらない */
    const vR1 = judgeReroll(probeD1.samples);
    const vR2 = judgeReroll(probeD2.samples);
    check('(D6a) ★受入条件6: ★1 goblin-mine で ' + REROLL_PRESSES + ' 回かけ直しても人数は変わらず、顔ぶれは変わる',
      vR1.ok, '人数の種類=' + JSON.stringify(vR1.counts) + ' / 顔ぶれ ' + vR1.sigKinds + ' 種 (11 サンプル中)');
    check('(D6b) ★受入条件6: ★3 orc-fort でも同じ (人数不変 / 顔ぶれ可変)',
      vR2.ok, '人数の種類=' + JSON.stringify(vR2.counts) + ' / 顔ぶれ ' + vR2.sigKinds + ' 種 (11 サンプル中)');
    check('(Dz6) [装置] judgeReroll は空/単一サンプルでは false (空で緑になる測定器ではない)',
      judgeReroll([]).ok === false && judgeReroll([{ npc: 1, sig: 'a' }]).ok === false
      && judgeReroll([{ npc: 1, sig: 'a' }, { npc: 1, sig: 'a' }]).ok === false,
      '顔ぶれが 1 種類だけでも false になる');

    /* ★★ 2 経路の突き合わせ: 画面の文字列 N ⇔ 実体 selection.partyMembers の NPC 数 */
    const lastD1 = probeD1.samples[probeD1.samples.length - 1];
    const lastD2 = probeD2.samples[probeD2.samples.length - 1];
    check('(D2) 「この依頼に応じた冒険者: N 人」の N が実体と一致 (★1 goblin-mine)',
      probeD1.lineN !== null && probeD1.lineN === lastD1.npc
      && lastD1.npc === EXPECTED_NPC_RECRUIT['goblin-mine'],
      '画面 N=' + probeD1.lineN + ' / 実体 NPC=' + lastD1.npc + ' / 行 = "' + lastD1.line + '"');
    check('(D3) 「この依頼に応じた冒険者: N 人」の N が実体と一致 (★2 bandits-forest)',
      probeD2.lineN !== null && probeD2.lineN === lastD2.npc
      && lastD2.npc === EXPECTED_NPC_RECRUIT['bandits-forest'],
      '画面 N=' + probeD2.lineN + ' / 実体 NPC=' + lastD2.npc + ' / 行 = "' + lastD2.line + '"');
    /* ⭐ 期待表の側でも 2 つが違う値であることを要求する。そうしないと「たまたま両方が
       同じ値に動いた」ときに、この装置 assert ごと空振りしていることに気づけない。 */
    check('(Dz7) [装置] 2 つの対象で N が実際に違う (N を直書きした実装では緑にならない)',
      probeD1.lineN !== probeD2.lineN
        && EXPECTED_NPC_RECRUIT['goblin-mine'] !== EXPECTED_NPC_RECRUIT['bandits-forest'],
      'goblin-mine N=' + probeD1.lineN + ' / bandits-forest N=' + probeD2.lineN);
    check('(D4) 応募人数の行は「募集をかけ直す」のたびに更新されている (押した後も実体と一致)',
      probeD1.samples.every(s => { const m = /(\d+)\s*人/.exec(s.line); return m && parseInt(m[1], 10) === s.npc; })
      && probeD2.samples.every(s => { const m = /(\d+)\s*人/.exec(s.line); return m && parseInt(m[1], 10) === s.npc; }),
      '★1 ' + probeD1.samples.length + ' サンプル / ★2 ' + probeD2.samples.length + ' サンプル すべて一致');
    await pageD.close();

    /* ══════════════════════════════════════════════════════════════════════
     * (E) #pmSub をマッチング演出の応募人数で出し分ける (依頼書「#pmSub の文言」表)
     *   ⚠ 表の「人数」は **募集に応じた NPC の数**。NPC 1人 = パーティ計 2人。
     *   ⭐ 「期待した文言そのもの」と一致することも測るが、**★1 と ★3 で違う文字列である**
     *      ことを別 assert で押さえる。こちらは表の文面を書き換えても腐らない。
     *   ⚠ playPartyMatchCinematic() の Promise は「タップして出発」のタップまで resolve しない。
     *      await すると永久に返らないので、意図的に await しない。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (E) #pmSub が応募人数で切り替わる ---');
    async function probePmSub(page, scId) {
      return page.evaluate((id) => {
        const out = { threw: '', id, npc: null, before: '', after: '', overlayShown: null, direct: {}, seam: {} };
        try {
          const el = document.getElementById('pmSub');
          out.seam = { pmSub: !!el, pmSubTextFor: typeof pmSubTextFor,
                       play: typeof playPartyMatchCinematic };
          out.before = el ? (el.textContent || '') : '(要素なし)';   // HTML 直書きの既定値
          const sc = scenarios.find(s => s.id === id);
          prepScenario = sc;
          regeneratePartyMembers();                       // ★本番の再抽選
          out.npc = (selection.partyMembers || []).filter(m => m && !m.isHero).length;
          playPartyMatchCinematic(sc);                    // ★本番の演出 (await しない)
          out.after = el ? (el.textContent || '') : '(要素なし)';
          const ov = document.getElementById('partyMatchOverlay');
          out.overlayShown = !!(ov && ov.style.display === 'flex');
          out.direct = { one: pmSubTextFor(1), two: pmSubTextFor(2), three: pmSubTextFor(3),
                         zero: pmSubTextFor(0), four: pmSubTextFor(4), nan: pmSubTextFor(undefined) };
        } catch (e) { out.threw = String((e && e.message) || e); }
        return out;
      }, scId);
    }
    // ⚠ 演出は「タップ待ち」で止まるので、1 シナリオにつき 1 ページ使う (状態を持ち越さない)。
    const pageE1 = await openPage('/tavern.html');
    /* ⚠⚠⚠ [#8 で測定点を移した] 旧: goblin-mine を素で使えば NPC1 だった。
       #8 で recruit: 3 が入り、本番 6 シナリオの NPC 最小値は 2 =
       **「NPC1」は実プレイでは発生しなくなった**。文面表の 1 人ぶんを腐らせないため、
       (G3) と同じ手法で recruit: 0 を注入し clamp 下限の NPC1 を作って測る。
       ⚠ 期待値 (pmE1.npc === 1 / 文面) は 1 文字も緩めていない。作り方だけを変えた。 */
    const e1Inj = await pageE1.evaluate(() => {
      const sc = (typeof scenarios !== 'undefined') ? scenarios.find(s => s.id === 'goblin-mine') : null;
      if (!sc) return { found: false, now: null };
      sc.recruit = 0;                    // recruitCountOf の clamp(n,1,3) が 1 へ持ち上げる
      return { found: true, now: sc.recruit };
    });
    const pmE1 = await probePmSub(pageE1, 'goblin-mine');
    await pageE1.close();
    const pageE2 = await openPage('/tavern.html');
    const pmE2 = await probePmSub(pageE2, 'orc-fort');
    await pageE2.close();
    console.log('       ★1 goblin-mine: NPC' + pmE1.npc + ' 直書き前"' + pmE1.before + '" → 演出後"' + pmE1.after + '"');
    console.log('       ★3 orc-fort   : NPC' + pmE2.npc + ' 直書き前"' + pmE2.before + '" → 演出後"' + pmE2.after + '"');
    console.log('       pmSubTextFor 直呼び = ' + JSON.stringify(pmE1.direct));

    check('(Ez1) [装置] pmSubTextFor / playPartyMatchCinematic を裸の識別子で読めた + 例外なし',
      pmE1.seam.pmSubTextFor === 'function' && pmE1.seam.play === 'function'
      && pmE1.threw === '' && pmE2.threw === '',
      'seam=' + JSON.stringify(pmE1.seam) + ' threw=' + (pmE1.threw || pmE2.threw || 'なし'));
    check('(Ez2) [装置] マッチング演出が実際に開いた (開いていないと #pmSub を読む意味がない)',
      pmE1.overlayShown === true && pmE2.overlayShown === true,
      '★1=' + pmE1.overlayShown + ' / ★3=' + pmE2.overlayShown);
    check('(Ez5) [装置] NPC1 は recruit: 0 の注入で作れている (#8 以後この人数は本番に無いので、注入が効かないと以下は全部空振り)',
      e1Inj.found === true && e1Inj.now === 0, JSON.stringify(e1Inj));
    check('(Ez3) [装置] 観測した人数が期待どおり (注入 NPC1 / ★3 NPC3)',
      pmE1.npc === 1 && pmE2.npc === 3, '注入側 NPC' + pmE1.npc + ' / ★3 NPC' + pmE2.npc);
    check('(Ez4) [装置] NPC1 側では HTML 直書きの既定値から実際に書き換わった (直書きを読んでいるだけではない)',
      pmE1.before !== pmE1.after && pmE1.before !== '(要素なし)',
      '"' + pmE1.before + '" → "' + pmE1.after + '"');

    check('(E1) ★受入条件: NPC1 (recruit:0 注入 = clamp 下限) の #pmSub が「応じたのは、ただ一人 ――」',
      pmE1.after === '応じたのは、ただ一人 ――', '実際 = "' + pmE1.after + '"');
    check('(E2) ★受入条件: NPC3 (★3 orc-fort) の #pmSub が「共に挑む仲間が集う ――」',
      pmE2.after === '共に挑む仲間が集う ――', '実際 = "' + pmE2.after + '"');
    check('(E3) NPC1 と NPC3 で #pmSub が違う文字列になる (表の文面を書き換えても腐らない物差し)',
      pmE1.after !== pmE2.after && pmE1.after.length > 0 && pmE2.after.length > 0,
      '"' + pmE1.after + '" ≠ "' + pmE2.after + '"');
    check('(E4) 表の 3 人数ぶんの文言がすべて別物 (どれかが同じ文面に潰れていない)',
      new Set([pmE1.direct.one, pmE1.direct.two, pmE1.direct.three]).size === 3,
      JSON.stringify([pmE1.direct.one, pmE1.direct.two, pmE1.direct.three]));
    check('(E5) 表に無い人数のフォールバックが黙って壊れない (0人 / 4人以上 / undefined)',
      pmE1.direct.zero.length > 0 && pmE1.direct.zero !== pmE1.direct.one
      && pmE1.direct.four === pmE1.direct.three
      && pmE1.direct.nan === pmE1.direct.zero,
      '0人="' + pmE1.direct.zero + '" / 4人="' + pmE1.direct.four + '" (=3人の文言) / undefined="' + pmE1.direct.nan + '"');

    /* ══════════════════════════════════════════════════════════════════════
     * (F) 受入条件 3. : 生成クエスト (闇市ポドルプラザ) は NPC 3 人。
     *     かつ `[DIAG] recruit: fallback used ...` が **この観測で** 実際に出た。
     *
     * ⭐⭐ 「ログが出た」を件数の絶対値で測ると『元から出ていた』と区別できない
     *    (このリポジトリの恒久知見:「X したから今の状態」と「元から同じ状態」は区別できない)。
     *    → **観測の直前に consoleLines の件数を採り、その差分だけ**を見る。
     *    さらに区間を 3 つに割って「どの操作が出したのか」まで確定させる:
     *      区間1 = 生成クエストを **作るだけ**            → 0 行 (作っただけでは出ない)
     *      区間2 = 本番の再抽選 + 出発処理               → **ちょうど 1 行**
     *      区間3 = 経路B (recruitCountOf の直呼び)        → 1 行
     * ⭐ 負のコントロールは **difficulty を持つ固定シナリオ**。同じページ・同じ観測関数で
     *    DIAG が 1 行も出ないことを見て、「無条件に出しているだけ」ではないと確定させる。
     * ⭐ 依頼書「なぜフォールバックで黙らないのか」の眼目は
     *    **将来 difficulty を持つ生成クエストが増えた時に気づけること**。
     *    (Fz1) が「buildPlazaSynthetic の戻り値は difficulty を持たない」を前提として測るので、
     *    持つようになった日にここが赤くなる = DIAG の存在意義そのものを守る。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (F) 受入条件 3. : 生成クエスト (闇市) は NPC 3 人 + [DIAG] の実在 ---');
    /* ⚠ 先頭固定で照合する。部分一致にすると別の [DIAG] 行を拾って永久に緑になる。 */
    const DIAG_PREFIX = '[DIAG] recruit: fallback used';
    const DIAG_EXPECT = '[DIAG] recruit: fallback used (no difficulty) id=generated-quest -> 3';
    const diagSince = (from) => consoleLines.slice(from)
      .map(s => String(s).trim()).filter(s => s.indexOf(DIAG_PREFIX) === 0);

    const pageF = await openPage('/tavern.html');

    // ── 負のコントロール: difficulty を持つ固定シナリオでは DIAG が出ないこと ──
    const baseFneg = consoleLines.length;
    const obsFneg  = await observeDepartSizes(pageF, ['goblin-mine']);
    await sleep(500);
    const diagFneg = diagSince(baseFneg);

    // ── 区間1: 生成クエストを **作るだけ** (人数はまだ決めない) ──
    const baseF1 = consoleLines.length;
    const buildF = await pageF.evaluate(() => {
      const out = { threw: '', seam: {}, probes: [], keys: [] };
      try {
        out.seam = {
          QuestGen:            typeof QuestGen,
          buildPlazaSynthetic: typeof buildPlazaSynthetic,
          recruitCountOf:      typeof recruitCountOf,
          generateQuest:       (typeof QuestGen === 'object' && QuestGen) ? typeof QuestGen.generateQuest : 'なし',
        };
        // ⭐ 1 件だけだと家系の引き当て運に左右されるので、レベル 1..6 で 6 件掃いて
        //    「生成クエストは difficulty を持たない」を母集団で押さえる。
        for (let lv = 1; lv <= 6; lv++) {
          const q = QuestGen.generateQuest(lv, { source: 'plaza' });
          q._sentence = QuestGen.buildSentence(q);
          const s = buildPlazaSynthetic(q);          // ★本番の 生成クエスト → シナリオ 変換
          out.probes.push({
            lv,
            id: s.id,
            familyId: q.familyId || (q.family && q.family.id) || '(不明)',
            hasDifficulty: Object.prototype.hasOwnProperty.call(s, 'difficulty'),
            hasRecruit:    Object.prototype.hasOwnProperty.call(s, 'recruit'),
            generated:     !!s.__generated,
          });
          if (lv === 3) { window.__synthTV = s; out.keys = Object.keys(s); }
        }
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    });
    await sleep(500);
    const diagF1 = diagSince(baseF1);

    // ── 区間2: 本番の再抽選 + 出発処理 (人数を決めるのはここ) ──
    const baseF2 = consoleLines.length;
    const departF = await pageF.evaluate(() => {
      const out = { threw: '', row: null };
      try {
        const s = window.__synthTV;
        prepScenario = s;                     // openPrep(synthetic) が最初にやることと同じ
        regeneratePartyMembers();             // ★本番の再抽選 (ここで recruitCountOf が走る)
        sessionStorage.removeItem('dragonfighters.partyMembers');
        departToScenario();                   // ★本番の出発処理
        const raw = sessionStorage.getItem('dragonfighters.partyMembers');
        let arr = null; try { arr = JSON.parse(raw); } catch (e) {}
        const ok = Array.isArray(arr);
        out.row = {
          id: s.id,
          wrote:  raw !== null,
          total:  ok ? arr.length : -1,
          npc:    ok ? arr.length - 1 : -1,
          heroes: ok ? arr.filter(m => m && m.isHero).length : -1,
          zones:  ok ? arr.map(m => m && m.zone).join('>') : '',
          wroteGenerated: sessionStorage.getItem('dragonfighters.generatedScenario') !== null,
          wroteScenario:  sessionStorage.getItem('dragonfighters.currentScenario'),
        };
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    });
    await sleep(600);
    const diagF2 = diagSince(baseF2);

    // ── 区間3: 経路B (決める関数そのもの) ──
    const baseF3 = consoleLines.length;
    const decideF = await pageF.evaluate(() => {
      try { return { threw: '', decided: recruitCountOf(window.__synthTV) }; }
      catch (e) { return { threw: String((e && e.message) || e), decided: null }; }
    });
    await sleep(500);
    const diagF3 = diagSince(baseF3);

    console.log('       生成クエスト 6 件の掃き = ' + JSON.stringify(buildF.probes));
    console.log('       seam = ' + JSON.stringify(buildF.seam));
    console.log('       出発観測 = ' + JSON.stringify(departF.row) + '  経路B decided=' + decideF.decided);
    console.log('       DIAG 行数: 負のコントロール=' + diagFneg.length + ' / 作るだけ=' + diagF1.length
      + ' / 出発=' + diagF2.length + ' / 経路B=' + diagF3.length);
    if (diagF2.length) console.log('       DIAG 実文 = "' + diagF2[0] + '"');

    check('(Fz0) [装置] QuestGen / buildPlazaSynthetic を裸の識別子で読めた + 例外なし',
      buildF.seam.QuestGen === 'object' && buildF.seam.buildPlazaSynthetic === 'function'
      && buildF.threw === '' && departF.threw === '' && decideF.threw === '',
      'seam=' + JSON.stringify(buildF.seam) + ' threw=' + (buildF.threw || departF.threw || decideF.threw || 'なし'));
    check('(Fz1) [装置] 生成クエストは 6 件とも id=generated-quest で difficulty も recruit も持たない (フォールバックの前提が実在する)',
      buildF.probes.length === 6
      && buildF.probes.every(p => p.id === 'generated-quest' && p.hasDifficulty === false
                                  && p.hasRecruit === false && p.generated === true),
      '前提を満たさない件数 = ' + buildF.probes.filter(p => p.hasDifficulty || p.hasRecruit).length
      + ' / 家系 = ' + buildF.probes.map(p => p.familyId).join(', '));
    check('(Fz2) [装置] 負のコントロール: difficulty を持つ固定シナリオでは DIAG が 1 行も出ない (無条件に出しているのではない)',
      diagFneg.length === 0 && obsFneg.rows.length === 1 && obsFneg.rows[0].wrote === true,
      'DIAG=' + diagFneg.length + ' 行 / goblin-mine NPC=' + (obsFneg.rows[0] || {}).npc);
    check('(Fz3) [装置] 生成クエストを 6 件 **作っただけ** では DIAG は出ない (人数を決めた時だけ出る)',
      diagF1.length === 0, 'DIAG=' + diagF1.length + ' 行');

    check('(F) ★受入条件3: 生成クエスト (闇市) の出発パーティが 主人公1 + NPC3 = 4 人',
      departF.row && departF.row.wrote === true && departF.row.npc === 3
      && departF.row.total === 4 && departF.row.heroes === 1,
      departF.row ? ('計' + departF.row.total + '人 / NPC' + departF.row.npc + ' / 主人公' + departF.row.heroes) : '観測なし');
    check('(F2) ★受入条件3: 出発の再抽選で DIAG が **ちょうど 1 行** 出た + 文面が依頼書の指定どおり',
      diagF2.length === 1 && diagF2[0] === DIAG_EXPECT,
      '出た行 = ' + JSON.stringify(diagF2) + ' / 期待 = "' + DIAG_EXPECT + '"');
    check('(F3) 経路B (recruitCountOf 直呼び) も 3 を返し、同じく DIAG を 1 行出す',
      decideF.decided === 3 && diagF3.length === 1 && diagF3[0] === DIAG_EXPECT,
      'decided=' + decideF.decided + ' / DIAG=' + diagF3.length + ' 行');
    check('(F4) 受入条件2 は生成クエストでも成り立つ (4 人を超えない)',
      judgeNoOverflow(departF.row ? [departF.row] : [], 4).ok,
      '計 ' + (departF.row ? departF.row.total : '-') + ' 人');
    check('(Fz4) [装置] 出発処理が生成クエストとして書いた (__generated が index.html へ渡っている)',
      !!(departF.row && departF.row.wroteGenerated === true && departF.row.wroteScenario === 'generated-quest'),
      'generatedScenario=' + (departF.row && departF.row.wroteGenerated)
      + ' / currentScenario=' + (departF.row && departF.row.wroteScenario));
    await pageF.close();

    /* ══════════════════════════════════════════════════════════════════════
     * (G) 受入条件 4. : シナリオ定義に `recruit: 3` を注入すると goblin-mine でも NPC 3 人
     *
     * ⛔⛔ **ソース編集で測ってはいけない。** (S9) が「シナリオ表に recruit: の具体値を
     *    入れていない」(= 値は依頼書 D の担当) を静的検査しているので、テスト用に
     *    `recruit: 3` を書き足すと (S9) が赤くなる。
     *    → **ランタイムで scenarios のオブジェクトへ注入**する。測り終えたら delete で戻す。
     * ⭐ 「注入したら 3 になった」だけでは『元から 3 だった』と区別できない。
     *    同じ run・同じページ・同じ観測関数で **注入前 1 → 注入後 3 → 撤去後 1** の
     *    3 点を採り、往復することまで見る。
     * ⭐ ついでに **上書きでも clamp(n,1,3) を外せない**ことを測る (依頼書 D が値を入れる器なので、
     *    器の側で 5 人パーティを作れないことを保証しておく)。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (G) 受入条件 4. : recruit の個別上書き (ランタイム注入) ---');
    const pageG = await openPage('/tavern.html');
    /* ⚠⚠ [#8 で測定点を移した] goblin-mine は素で既に 3 なので、そこで注入しても
       「注入で 3 になった」と「元から 3 だった」を区別できない (= 空振り)。
       まだ recruit: を持たない bandits-forest へ移す。素の期待値も期待表から導く。 */
    const G_ID   = 'bandits-forest';
    const G_BASE = EXPECTED_NPC_RECRUIT[G_ID];   // 素の NPC 数 (★★☆ = 2)
    async function setRecruit(page, id, value) {
      return page.evaluate((cfg) => {
        const sc = scenarios.find(s => s.id === cfg.id);
        if (!sc) return { found: false };
        const had = Object.prototype.hasOwnProperty.call(sc, 'recruit');
        if (cfg.value === null) delete sc.recruit; else sc.recruit = cfg.value;
        return { found: true, hadBefore: had,
                 hasNow: Object.prototype.hasOwnProperty.call(sc, 'recruit'),
                 now: sc.recruit };
      }, { id, value });
    }
    const gPre   = await setRecruit(pageG, G_ID, null);          // 注入前の状態を読むだけ (delete は no-op)
    const gObs0  = await observeDepartSizes(pageG, [G_ID]);      // (1) 素のまま
    await setRecruit(pageG, G_ID, 3);
    const gObs3  = await observeDepartSizes(pageG, [G_ID]);      // (2) recruit: 3
    await setRecruit(pageG, G_ID, 9);
    const gObs9  = await observeDepartSizes(pageG, [G_ID]);      // (3) recruit: 9 (clamp 上限)
    await setRecruit(pageG, G_ID, 0);
    const gObs0v = await observeDepartSizes(pageG, [G_ID]);      // (4) recruit: 0 (clamp 下限)
    const gDel   = await setRecruit(pageG, G_ID, null);
    const gObsD  = await observeDepartSizes(pageG, [G_ID]);      // (5) 撤去して元へ戻る

    const gAll  = [gObs0, gObs3, gObs9, gObs0v, gObsD];
    const gNpc  = gAll.map(o => (o.rows[0] || {}).npc);
    const gDec  = gAll.map(o => (o.rows[0] || {}).decided);
    console.log('       注入前の recruit プロパティ = ' + JSON.stringify(gPre));
    console.log('       NPC 数 (素/3/9/0/撤去) = ' + JSON.stringify(gNpc));
    console.log('       経路B recruitCountOf     = ' + JSON.stringify(gDec));

    check('(Gz0) [装置] 5 回の観測すべてで例外なし・実際に踏んだ・出発処理が書いた',
      gAll.every(o => o.threw === '' && o.sawIds.length === 1
                      && o.rows.length === 1 && o.rows[0].wrote === true),
      gAll.map((o, i) => '#' + (i + 1) + ':' + (o.threw || 'ok')).join(' '));
    check('(Gz1) [装置] 注入前の ' + G_ID + ' は recruit プロパティを持っていない (#8 で値を入れたのは goblin-mine だけ = (G5) と 2 経路で一致)',
      gPre.found === true && gPre.hadBefore === false,
      'found=' + gPre.found + ' / hadBefore=' + gPre.hadBefore);
    check('(G) ★受入条件4: recruit: 3 を注入すると ' + G_ID + ' の NPC が ' + G_BASE + ' → 3 になる (個別上書きが効く)',
      gNpc[0] === G_BASE && gNpc[1] === 3,
      '注入前 NPC' + gNpc[0] + ' → 注入後 NPC' + gNpc[1]);
    check('(G2) 上書きでも clamp(n,1,3) は外れない: recruit: 9 でも NPC 3 止まり (器が 5 人パーティを作れない)',
      gNpc[2] === 3, 'recruit:9 → NPC' + gNpc[2]);
    check('(G3) 上書きでも clamp の下限が効く: recruit: 0 でも NPC 1 (0 人パーティにならない)',
      gNpc[3] === 1, 'recruit:0 → NPC' + gNpc[3]);
    check('(Gz2) [装置] recruit を撤去すると NPC ' + G_BASE + ' へ戻る (『元から 3 だった』でも『ページが壊れた』でもない)',
      gDel.hasNow === false && gNpc[4] === G_BASE,
      '撤去後 hasRecruit=' + gDel.hasNow + ' / NPC' + gNpc[4]);
    check('(Gz3) [装置] 経路B (recruitCountOf) も 5 回すべてで経路A と同じ値を返す',
      gNpc.length === 5 && gNpc.every((n, i) => n === gDec[i]),
      '経路A=' + JSON.stringify(gNpc) + ' / 経路B=' + JSON.stringify(gDec));
    check('(Gz4) [装置] 注入で観測値が実際に動いた (注入が飾りでない)',
      new Set(gNpc).size >= 2, 'NPC の種類 = ' + JSON.stringify([...new Set(gNpc)]));

    /* ★[#8] (G) を bandits-forest へ移したぶん、goblin-mine 側の確認をここが受け持つ。
       ⭐ 「ソースに書いた」だけでは効いている証明にならない → 本番の出発処理まで通して測る。
       ⭐ (S9) は静的・(G5) はランタイム = 2 経路で「値は goblin-mine だけ」を突き合わせる。 */
    const gMine    = await observeDepartSizes(pageG, ['goblin-mine']);
    const gMineRow = gMine.rows[0] || {};
    check('(G4) ★#8: goblin-mine はソースの recruit: 3 が効いて素で NPC 3 (★1 の 1 ではない)',
      gMine.threw === '' && gMineRow.wrote === true
        && gMineRow.npc === 3 && gMineRow.decided === 3,
      'NPC' + gMineRow.npc + ' / recruitCountOf=' + gMineRow.decided + ' / ' + (gMine.threw || 'ok'));
    const gOwners = await pageG.evaluate(() =>
      scenarios.filter(s => Object.prototype.hasOwnProperty.call(s, 'recruit'))
               .map(s => s.id + ':' + s.recruit));
    check('(G5) ★#8: recruit: を持つシナリオは goblin-mine ただ 1 つ (他 5 本は ★の数のまま)',
      Array.isArray(gOwners) && gOwners.length === 1 && gOwners[0] === 'goblin-mine:3',
      'recruit を持つ = ' + JSON.stringify(gOwners));

    /* ══════════════════════════════════════════════════════════════════════
     * (H) 受入条件 5. : 隊列順が front → mid → rear のまま (orderFormation を壊していない)
     * ⚠ **母集団が空でも緑にならないようにする。** 全員 front の隊列は "front" 1 語なので
     *   自明にソート済み = 何も証明しない。→ (Hz1) が「zone が 2 種類以上ある行が実在する」を測る。
     * ⭐ 判定本体 judgeFormation() は 1 本きり。(A) 既定 ON / (C) 撤退 ON / (F) 生成クエストの
     *   3 つの観測に同じ関数を当てる。恒真でないことは (Hz2) が逆順を落として示す。
     * ⭐⭐ さらに 2 経路: 本番の orderFormation() に **わざと崩した配列**を渡して並べ直させ、
     *   ソート結果と **安定性** (同 zone 内で元の順序が保たれる) まで見る。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (H) 受入条件 5. : 隊列順 front → mid → rear ---');
    const gOrd = await pageG.evaluate(() => {
      const out = { threw: '', seam: typeof orderFormation, before: '', after: '', zones: '' };
      try {
        // わざと崩した並び (rear が先頭・front が真ん中・同 zone が 2 人ずつ)
        const src = [
          { classKey: 'mage',    zone: 'rear',  name: 'R1' },
          { classKey: 'warrior', zone: 'front', name: 'F1' },
          { classKey: 'rogue',   zone: 'mid',   name: 'M1' },
          { classKey: 'dwarf',   zone: 'front', name: 'F2' },
          { classKey: 'cleric',  zone: 'mid',   name: 'M2' },
        ];
        out.before = src.map(m => m.name).join('>');
        const sorted = orderFormation(src.slice());      // ★本番の並べ替え
        out.after = sorted.map(m => m.name).join('>');
        out.zones = sorted.map(m => m.zone).join('>');
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    });
    await pageG.close();

    const ZONE_RANK = { front: 0, mid: 1, rear: 2 };
    /* 判定本体 (Node 側・純関数)。rows は observeDepartSizes / (F) の row が持つ zones 文字列を読む。
       空の rows は false (空で緑になる測定器を作らない)。 */
    function judgeFormation(rows) {
      const bad = [];
      let maxDistinct = 0, multiZoneRows = 0;
      (rows || []).forEach(r => {
        const zs = String((r && r.zones) || '').split('>').filter(Boolean);
        if (!zs.length) { bad.push(((r && r.id) || '(id なし)') + ': zone 情報なし'); return; }
        const unknown = zs.filter(z => ZONE_RANK[z] === undefined);
        if (unknown.length) { bad.push(r.id + ': 未知の zone ' + unknown.join(',')); return; }
        const kinds = new Set(zs).size;
        maxDistinct = Math.max(maxDistinct, kinds);
        if (kinds >= 2) multiZoneRows++;
        for (let i = 1; i < zs.length; i++) {
          if (ZONE_RANK[zs[i]] < ZONE_RANK[zs[i - 1]]) { bad.push(r.id + ': ' + r.zones); break; }
        }
      });
      return { ok: (rows || []).length > 0 && bad.length === 0, bad, maxDistinct, multiZoneRows };
    }

    const fA = judgeFormation(obsA.rows);
    const fC = judgeFormation(obsC.rows);
    const fF = judgeFormation(departF.row ? [departF.row] : []);
    console.log('       (A) 既定ON の隊列 = ' + obsA.rows.map(r => r.id + ':' + r.zones).join('  '));
    console.log('       (C) ?recruit=0 の隊列 = ' + obsC.rows.map(r => r.id + ':' + r.zones).join('  '));
    console.log('       (F) 生成クエストの隊列 = ' + (departF.row ? departF.row.zones : '(観測なし)'));
    console.log('       orderFormation 直呼び: ' + gOrd.before + ' → ' + gOrd.after + ' (' + gOrd.zones + ')');

    check('(H) ★受入条件5: 既定 ON の 6 シナリオすべてで隊列が front → mid → rear 順',
      fA.ok, fA.bad.length ? '崩れ: ' + fA.bad.join(' / ') : '崩れなし (' + obsA.rows.length + ' 件)');
    check('(Hz1) [装置] zone が 2 種類以上ある行が実在する (全員 front なら自明にソート済み = 何も証明しない)',
      fA.maxDistinct >= 2 && fA.multiZoneRows >= 3,
      'zone 最大種類=' + fA.maxDistinct + ' / 2 種類以上の行=' + fA.multiZoneRows + '/' + obsA.rows.length);
    check('(Hz2) [装置] judgeFormation は逆順と空を落とす (恒真でない証明)',
      judgeFormation([{ id: 'x', zones: 'mid>front' }]).ok === false
      && judgeFormation([{ id: 'x', zones: 'rear>mid>front' }]).ok === false
      && judgeFormation([{ id: 'x', zones: 'front>rear>mid' }]).ok === false
      && judgeFormation([]).ok === false
      && judgeFormation([{ id: 'x', zones: '' }]).ok === false
      && judgeFormation([{ id: 'x', zones: 'front>mid>rear' }]).ok === true);
    check('(H2) ★受入条件5: 撤退スイッチ ?recruit=0 の 6 件でも隊列順は front → mid → rear',
      fC.ok && fC.maxDistinct >= 2,
      fC.bad.length ? '崩れ: ' + fC.bad.join(' / ') : '崩れなし (' + obsC.rows.length + ' 件 / 最大 ' + fC.maxDistinct + ' 種類)');
    check('(H3) ★受入条件5: 生成クエスト (闇市) の隊列も front → mid → rear',
      fF.ok && fF.maxDistinct >= 2,
      fF.bad.length ? '崩れ: ' + fF.bad.join(' / ') : '隊列 = ' + (departF.row ? departF.row.zones : '(なし)'));
    check('(Hz3) [装置] 2 経路: 本番の orderFormation() に崩した配列を渡すと front→mid→rear へ並べ直し、同 zone 内の順序は保つ (安定ソート)',
      gOrd.threw === '' && gOrd.seam === 'function'
      && gOrd.after === 'F1>F2>M1>M2>R1' && gOrd.zones === 'front>front>mid>mid>rear',
      '入力 ' + gOrd.before + ' → 出力 ' + gOrd.after + ' (' + gOrd.zones + ') threw=' + (gOrd.threw || 'なし'));

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
