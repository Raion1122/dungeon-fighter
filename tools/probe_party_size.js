#!/usr/bin/env node
/*
 * tools/probe_party_size.js — 実装依頼書 #14「パーティ 5 人以上の可否調査」の測定装置
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ これは **調査チケットの装置**。本番の挙動は 1 ビットも変えない。
 *   `tavern.html` の devPartySizeOverride() は ?party 無指定では **恒等**で、
 *   このファイルの受入条件 1. がそれを 6 シナリオぶん機械的に検査する。
 *
 *   node tools/probe_party_size.js              # 本番 (受入条件 1. / 3. + 装置)
 *   node tools/probe_party_size.js --negative   # 負のコントロール (受入条件 2.)
 *   オプション: --port N --browser <exe> --headful
 *   exit 0=期待どおり / 1=assert が落ちた or 負のコントロールが空回り / 2=環境不足 / 3=装置の故障
 *
 * ── 実装状況 (STEP ごとに足していく骨組み) ──────────────────────────────────
 *   ✅ 受入条件 1. 既定が本番と 1 ビットも変わらない            … §2   (STEP1 = 本ファイルの初版)
 *   ✅ 受入条件 2. 負のコントロールを道具に内蔵 (--negative)     … §4   (STEP1)
 *   ✅ 受入条件 3. 母集団ガード (実体の配列長 + 到達数)          … §3   (STEP1)
 *   ⬜ 受入条件 4. スポーンタイル                               … §5   (STEP2)
 *   ⬜ 受入条件 5. 隊列順と zone                                … §6   (STEP2)
 *   ⬜ 受入条件 6. 下部 HP ミニバーの枠                          … §7   (STEP2)
 *   ⬜ 受入条件 7. カメラ / 主人公が画面外のフレーム率           … §8   (STEP3)
 *   ⬜ 受入条件 8. カメラ / クランプ区間が空に落ちた率           … §9   (STEP3)
 *   ⬜ 受入条件 9. 置き去りと救済                               … §10  (STEP3)
 *   ⬜ 受入条件 10. 描画コスト                                  … §11  (STEP3)
 *   ⬜ 受入条件 11. 既存 golden の非退行                        … §12  (STEP4)
 *   ⬜ 受入条件 12. 依頼書への「実装結果」節                     … §13  (STEP4)
 *
 * ── ⛔⛔ 測定台の作り方 (#8 が実際に踏んだ罠) ───────────────────────────────
 *   index.html を直接開く測定台を作らないこと。isRecruitOn() / recruitCountOf() /
 *   devPartySizeOverride() は **tavern.html にしか無い**ので、index 直起動の腕は
 *   人数の指定が一切効かず全部 4 人になる = 腕が割れない (「差が出なかった」ではなく
 *   「同じものを 2 回測った」)。
 *   → 正しい腕は「酒場を本番どおり通して departToScenario() まで走らせる」。
 *     腕の起動部は tools/sweep_recruit_balance.js から流用した (作り直していない)。
 *
 * ── ⭐⭐⭐ 判定本体は 1 本だけ (受入条件 1. と 2. が共有する) ─────────────────
 *   「シームが恒等でなくなったら赤くなる」は、**assert 本体を共有しないと空振りする**
 *   (OFF 用に別の判定を書くと、両方が同じ誤りのとき永久に緑)。
 *   → 判定は judgeIdentity() ただ 1 本。本番モードは ok===true を、--negative は
 *     **同じ関数の** ok===false を要求する。緑のままなら exit 1。
 *
 * ── ⚠⚠⚠ 母集団ガード (受入条件 3.) ─────────────────────────────────────────
 *   「違反 0 件」は母集団が 0 でも 0 件になる (2026-08-23 に ?doors=0 の腕が対象ノードへ
 *   一度も到達せず、空振りを緑と読み違えた)。→ **到達数をログの先頭に出す**。
 *   到達 = departToScenario() が sessionStorage["dragonfighters.partyMembers"] へ
 *   **実体の配列**を書いた走行。ドライバは配列長を写経せず本番に書かせる。
 *
 * ── ⚠ 踏みやすい罠 (既存ドライバから引き継ぎ) ──────────────────────────────
 *  - window.<名前> で classic script 直下の let/const/function を読まない (常に undefined)。
 *    page.evaluate の中の **裸の識別子**なら読める。
 *  - same-origin の storage はページ遷移をまたいで生き残る → document-start で purge。
 *    ⚠ purge は 1 タブ 1 回だけ (evaluateOnNewDocument は遷移のたびに再実行される)。
 *  - ROOT は必ず path.resolve を通す (区切り文字のままだと全 404。症状はタイムアウトだけ)。
 *  - MIME テーブルを落とすと全 500 でページが空になる (シームが undefined に見える)。
 *  - 変異は**ディスクを書き換えず配信を差し替える** (復元漏れが原理的に起きない)。
 *    置換は 1 行に収める (tavern.html は CRLF なので複数行アンカーは行末で外れる)。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

/* ⚠ path.resolve 必須 (でないと全 404) */
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const has  = (n) => argv.includes('--' + n);

const PORT     = parseInt(arg('port', '9345'), 10);
const HEADFUL  = has('headful');
const NEGATIVE = has('negative');

/* ══════════════════════════════════════════════════════════════════════════
 * 負のコントロールの変異 — 「シームが恒等でなくなる」を作る
 *   devPartySizeOverride() の「?party 未指定 = そのまま返す」枝だけを +1 にする。
 *   ⭐ 条件を裏返さない (=== を !== にする類は別物を測ってしまう)。ここは戻り値だけを変える。
 *   ⚠ アンカーが 1 箇所ちょうどでなければ装置の故障として exit 3 (黙って空振りさせない)。
 * ══════════════════════════════════════════════════════════════════════════ */
const MUT_FROM = '    if (raw === null) return n;   // 未指定 = 恒等。本番が必ず通る枝 (負のコントロールのアンカー: 揃えるな)';
const MUT_TO   = '    if (raw === null) return n + 1;   // [negative] 恒等でなくする (配信のみ・ディスクは無傷)';

/* ══════════════════════════════════════════════════════════════════════════
 * 期待表 — 依頼書 #7 の表そのもの。⚠ tavern.html の clamp を写経したものではない。
 *   ★の数はページから読んだ sc.difficulty と突き合わせるので、仕様を変えれば赤くなる。
 * ══════════════════════════════════════════════════════════════════════════ */
const SCENARIO_IDS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const EXPECTED_NPC = {
  'goblin-mine':    1,   /* 星 1        */
  'bandits-forest': 2,   /* 星 2        */
  'lizard-swamp':   2,   /* 星 2        */
  'orc-fort':       3,   /* 星 3        */
  'undead-temple':  3,   /* 星 3        */
  'dragon-lair':    3,   /* 星 4 だが clamp(n,1,3) */
};
const EXPECTED_STARS = {
  'goblin-mine': 1, 'bandits-forest': 2, 'lizard-swamp': 2,
  'orc-fort': 3, 'undead-temple': 3, 'dragon-lair': 4,
};

/* 調査シームで指定する人数 (装置の対照群)。⚠ これは本番の上限ではない (clamp は無改修)。 */
const PROBE_N = 5;

/* ══════════════════════════════════════════════════════════════════════════
 * ⭐⭐⭐ 判定本体 (Node 側・純関数)。受入条件 1. と 受入条件 2. が **これ 1 本を共有**する。
 *   rows      : observeDepart() の戻り値 (経路 A = 実際に起きた側 = sessionStorage の実体)
 *   expected  : { id: 期待 NPC 数 }
 *   ok は「6 件すべてが期待どおり」。母集団が空 (rows=[]) のときは **false**
 *   (空で緑になる測定器を作らない)。
 * ══════════════════════════════════════════════════════════════════════════ */
function judgeIdentity(rows, expected) {
  const ids = Object.keys(expected);
  const diffs = [];
  ids.forEach((id) => {
    const r = (rows || []).find((x) => x.id === id);
    if (!r)               { diffs.push(id + ': 観測なし'); return; }
    if (r.wrote !== true) { diffs.push(id + ': 出発処理が partyMembers を書いていない'); return; }
    if (!r.isArray)       { diffs.push(id + ': partyMembers が配列でない'); return; }
    if (r.npc !== expected[id]) diffs.push(id + ': NPC ' + r.npc + ' (期待 ' + expected[id] + ')');
  });
  return { ok: ids.length > 0 && (rows || []).length === ids.length && diffs.length === 0, diffs };
}

/* 「N 人ちょうどで出発した」の判定 (装置の対照群 = シームが生きている証明)。 */
function judgeFixedTotal(rows, total) {
  const bad = (rows || []).filter((r) => !(r.wrote && r.isArray && r.total === total))
    .map((r) => r.id + ':計' + r.total + '人');
  return { ok: (rows || []).length > 0 && bad.length === 0, bad };
}

/* ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[probe] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[probe] ブラウザが見つかりません'); process.exit(2);
}

/* ⚠ MIME を落とすと try/catch に飲まれて全 500 = 白紙になる */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        /* 変異は配信の差し替えで行う (ディスクは 1 バイトも触らない) */
        if (NEGATIVE && u === '/tavern.html') {
          const body = fs.readFileSync(fp, 'utf8').replace(MUT_FROM, MUT_TO);
          res.end(body); return;
        }
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * ページ側の観測本体。**本番の関数だけ**を呼ぶ (写経しない):
 *   prepScenario = sc          ← openPrep(sc) が最初にやることと同じ
 *   regeneratePartyMembers()   ← 本番の再抽選 (この中に調査シームが 1 行入っている)
 *   departToScenario()         ← 本番の出発処理 (sessionStorage へ書くのはこの中)
 * ⚠ 「sessionStorage へ 2 行書く」をドライバに写経すると、出発処理を一度も通さないまま
 *   緑になる。書き込みは必ず本番に書かせ、ドライバは**書かれた実体**だけを読む。
 * ══════════════════════════════════════════════════════════════════════════ */
const OBSERVE = (idList) => {
  const out = { rows: [], threw: '', partySize: null, seam: {} };
  try {
    /* ── 裸の識別子でしか読めない (window.<名前> は常に undefined) ── */
    out.seam = {
      scenarios:            typeof scenarios,
      PARTY_SIZE:           typeof PARTY_SIZE,
      recruitCountOf:       typeof recruitCountOf,
      isRecruitOn:          typeof isRecruitOn,
      devPartySizeOverride: typeof devPartySizeOverride,
      regenerate:           typeof regeneratePartyMembers,
      departToScenario:     typeof departToScenario,
      onWindowSeam:         typeof window.devPartySizeOverride,
      recruitOn:            (typeof isRecruitOn === 'function') ? isRecruitOn() : null,
      search:               location.search,
    };
    out.partySize = (typeof PARTY_SIZE === 'number') ? PARTY_SIZE : null;
    for (const id of idList) {
      const sc = (typeof scenarios !== 'undefined') ? scenarios.find((s) => s.id === id) : null;
      if (!sc) { out.rows.push({ id, missing: true, wrote: false, isArray: false, total: -1, npc: -1 }); continue; }
      prepScenario = sc;
      regeneratePartyMembers();
      sessionStorage.removeItem('dragonfighters.partyMembers');   /* 前周の値を残さない */
      departToScenario();
      const raw = sessionStorage.getItem('dragonfighters.partyMembers');
      let arr = null;
      try { arr = JSON.parse(raw); } catch (e) {}
      const okArr = Array.isArray(arr);
      out.rows.push({
        id,
        wrote:   raw !== null,
        isArray: okArr,
        total:   okArr ? arr.length : -1,
        npc:     okArr ? arr.length - 1 : -1,
        heroes:  okArr ? arr.filter((m) => m && m.isHero).length : -1,
        zones:   okArr ? arr.map((m) => m && m.zone).join('>') : '',
        stars:   (String(sc.difficulty || '').match(/★/g) || []).length,
        decided: (typeof recruitCountOf === 'function') ? recruitCountOf(sc) : null,   /* 経路 B */
      });
    }
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
};

const dump = (rows) => rows.map((r) => r.id + '(星' + r.stars + ')=計' + r.total + '人/NPC' + r.npc).join('  ');

/* ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  /* ── 装置の故障は先に落とす: 変異アンカーが 1 箇所ちょうどか ── */
  const tavSrc = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
  const anchorHits = tavSrc.split(MUT_FROM).length - 1;
  if (anchorHits !== 1) {
    console.error('[probe] 装置の故障: 変異アンカーが ' + anchorHits + ' 箇所 (1 でなければ負のコントロールが空回りする)');
    console.error('        アンカー: ' + MUT_FROM);
    process.exit(3);
  }

  const puppeteer = loadPuppeteer();
  const srv = await startServer(PORT);
  console.log('[probe] serving ' + ROOT + '  :' + PORT
    + (NEGATIVE ? '   ★負のコントロール (シームを恒等でなくして配信)' : ''));

  const profile = require('./_pptr_profile')('df_partysize_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
    defaultViewport: { width: 1280, height: 900 },
  });

  /* ⚠ purge は「1 タブにつき 1 回だけ」。evaluateOnNewDocument は新しい document ができるたびに
     走るので、無条件だと遷移先で前ページの書き込みを消してしまう。 */
  const PURGE_MARK = '__dfProbePartyPurged';
  async function openTavern(query) {
    const page = await browser.newPage();
    const navBlocked = [];
    const consoleLines = [];
    page.__navBlocked = navBlocked;
    page.__console = consoleLines;
    page.on('pageerror', (e) => pageErrors.push(query + ' :: ' + e.message));
    page.on('console', (m) => { consoleLines.push(m.text()); });
    await page.evaluateOnNewDocument((mark) => {
      try {
        if (sessionStorage.getItem(mark)) return;
        const kill = (store) => Object.keys(store).forEach((k) => {
          if (k.indexOf('df.') === 0) store.removeItem(k);
          if (k.indexOf('dragonfighters.') === 0) store.removeItem(k);
        });
        kill(localStorage); kill(sessionStorage);
        localStorage.setItem('dragonfighters.prologueSeen', '1');
        sessionStorage.setItem(mark, '1');
      } catch (e) {}
    }, PURGE_MARK);

    /* index.html への遷移だけ abort する。departToScenario() は本番のまま完走し、
       tavern.html のページ (と JS 状態) が生き残るので 6 シナリオを 1 タブで測れる。 */
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      try {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame() && /\/index\.html/.test(r.url())) {
          navBlocked.push(r.url()); r.abort('aborted'); return;
        }
        r.continue();
      } catch (e) { try { r.continue(); } catch (e2) {} }
    });

    await page.goto('http://localhost:' + PORT + '/tavern.html' + query,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && typeof devPartySizeOverride === 'function'"
      + " && typeof selection !== 'undefined' && selection && Array.isArray(selection.partyComposition)",
      { timeout: 30000 });
    await sleep(500);
    return page;
  }

  let exitCode = 0;
  try {
    /* ══════════════════════════════════════════════════════════════════════
     * 観測 (判定より先に全部採る。母集団の行をログの先頭に出すため)
     * ══════════════════════════════════════════════════════════════════════ */
    const pageDefault = await openTavern('');                          /* 既定 = 本番と同じ URL */
    const obsDefault  = await pageDefault.evaluate(OBSERVE, SCENARIO_IDS);
    /* ⚠ location.href への代入は同期では飛ばない。evaluate が返った直後に navBlocked を読むと
         0 件になり (1e) が「横取りが空振り」という偽の赤を出す。ネットワーク層へ届くまで待つ。 */
    await sleep(900);

    const pageFixed   = await openTavern('?party=' + PROBE_N);         /* 対照群: シームが生きているか */
    const obsFixed    = await pageFixed.evaluate(OBSERVE, SCENARIO_IDS);

    const pageBad     = await openTavern('?party=abc');                /* 不正値 = 恒等 + [DIAG] */
    const cBadBefore  = pageBad.__console.length;
    const obsBad      = await pageBad.evaluate(OBSERVE, SCENARIO_IDS);
    await sleep(150);
    const diagBad     = pageBad.__console.slice(cBadBefore).filter((l) => /\[DIAG\] party override: ignored/.test(l));

    const pageOOR     = await openTavern('?party=9');                  /* 2〜8 の外 = 恒等 + [DIAG] */
    const cOorBefore  = pageOOR.__console.length;
    const obsOOR      = await pageOOR.evaluate(OBSERVE, SCENARIO_IDS);
    await sleep(150);
    const diagOOR     = pageOOR.__console.slice(cOorBefore).filter((l) => /\[DIAG\] party override: ignored/.test(l));

    const arms = [
      { key: '既定 (?party 無し)', obs: obsDefault },
      { key: '?party=' + PROBE_N,  obs: obsFixed },
      { key: '?party=abc',         obs: obsBad },
      { key: '?party=9',           obs: obsOOR },
    ];

    /* ══════════════════════════════════════════════════════════════════════
     * §3 受入条件 3. 母集団ガード — ⚠⚠⚠ 到達数を必ずログの先頭に出す
     *   到達 = departToScenario() が partyMembers へ**実体の配列**を書いた走行。
     *   「違反 0 件」は母集団が 0 でも 0 件になるので、件数を出さない集計は禁止。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('');
    console.log('====== 母集団ガード (受入条件 3.) ======');
    let reachedTotal = 0, expectTotal = 0;
    for (const a of arms) {
      const reached = a.obs.rows.filter((r) => r.wrote && r.isArray && r.total > 0);
      reachedTotal += reached.length; expectTotal += SCENARIO_IDS.length;
      console.log('  到達 ' + reached.length + '/' + SCENARIO_IDS.length + '  腕=' + a.key
        + '  出発人数=[' + a.obs.rows.map((r) => r.total).join(',') + ']');
      const miss = a.obs.rows.filter((r) => !(r.wrote && r.isArray && r.total > 0));
      if (miss.length) console.log('    NG 未到達: ' + miss.map((r) => r.id).join(' , '));
      if (a.obs.threw) console.log('    NG 例外: ' + a.obs.threw);
    }
    console.log('  合計 到達 ' + reachedTotal + '/' + expectTotal + ' 走行');
    console.log('');

    check('(3a) 4 腕 x 6 シナリオ = 24 走行すべてが departToScenario() で実体の配列を書いた',
      reachedTotal === expectTotal, '到達 ' + reachedTotal + '/' + expectTotal);
    check('(3b) 既定腕は 6 シナリオすべてで主人公がちょうど 1 人 (実体を読めている証明)',
      obsDefault.rows.length === SCENARIO_IDS.length && obsDefault.rows.every((r) => r.heroes === 1),
      'heroes=[' + obsDefault.rows.map((r) => r.heroes).join(',') + ']');
    check('(3c) 判定本体は空の観測で **落ちる** (母集団 0 件で緑にならない)',
      judgeIdentity([], EXPECTED_NPC).ok === false && judgeFixedTotal([], PROBE_N).ok === false);

    /* ══════════════════════════════════════════════════════════════════════
     * §1 装置 assert — シームが実在し、期待表が潰れていないか
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('====== §1 装置 ======');
    const seam = obsDefault.seam;
    check('(1a) 本番の関数が裸の識別子で読める (scenarios / recruitCountOf / regenerate / depart)',
      seam.scenarios === 'object' && seam.recruitCountOf === 'function'
      && seam.regenerate === 'function' && seam.departToScenario === 'function',
      JSON.stringify({ scenarios: seam.scenarios, recruitCountOf: seam.recruitCountOf,
        regenerate: seam.regenerate, depart: seam.departToScenario }));
    check('(1b) 調査シーム devPartySizeOverride が実在する (function 宣言)',
      seam.devPartySizeOverride === 'function', 'typeof=' + seam.devPartySizeOverride);
    check('(1c) 期待表が 1 種類の値に潰れていない (一致が自明にならない)',
      new Set(Object.values(EXPECTED_NPC)).size >= 2,
      '値の種類=' + new Set(Object.values(EXPECTED_NPC)).size);
    check('(1d) ページの星の数が期待表と一致する (仕様を変えればここが赤くなる)',
      obsDefault.rows.every((r) => r.stars === EXPECTED_STARS[r.id]),
      obsDefault.rows.map((r) => r.id + ':' + r.stars).join(' '));
    /* ⚠ 「6 シナリオ踏んだから横取りも 6 件」ではない。departToScenario() の末尾は
         window.location.href = target で、1 回の同期 evaluate 内で 6 回代入しても
         **保留中の遷移は 1 本に畳まれる** (実測 1 件)。回数は手段であって不変条件ではない。
         守りたいのは「出発処理が遷移の行まで到達し、横取りで酒場に留まった」こと。
         6 件それぞれが出発処理を通ったことは (3a) の wrote/isArray が別途押さえている。
       ⚠ location.href への代入は同期では飛ばないので、読む前に必ず待つ
         (verify_recruit_size の (Az3) が同じ理由で 900ms 待っている)。 */
    check('(1e) departToScenario() が実際に index.html へ遷移しようとし、横取りで酒場に留まった',
      pageDefault.__navBlocked.length >= 1 && /\/tavern\.html/.test(pageDefault.url()),
      '横取り ' + pageDefault.__navBlocked.length + ' 件 / 現在地 = ' + pageDefault.url());
    check('(1f) 既定腕は募集 ON のまま (?recruit を触っていない)',
      seam.recruitOn === true, 'isRecruitOn()=' + seam.recruitOn + ' search=' + JSON.stringify(seam.search));

    /* ══════════════════════════════════════════════════════════════════════
     * §2 受入条件 1. — 既定が本番と 1 ビットも変わらない
     *   判定は judgeIdentity() ただ 1 本。--negative が同じ関数に同じ観測を通す。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('====== §2 受入条件 1. 既定が本番と 1 ビットも変わらない ======');
    const vDefault = judgeIdentity(obsDefault.rows, EXPECTED_NPC);
    console.log('  既定腕: ' + dump(obsDefault.rows));
    if (!NEGATIVE) {
      check('(2a) ?party 無指定で 6 シナリオの formation 人数が #7 と一致する',
        vDefault.ok, vDefault.diffs.length ? vDefault.diffs.join(' / ') : '差分なし');
    } else {
      console.log('  (2a) は §4 の負のコントロールで判定する (同じ judgeIdentity を ok===false で要求)');
    }
    check('(2b) 経路 B (recruitCountOf の戻り値) とも一致する — 2 経路の突き合わせ',
      obsDefault.rows.every((r) => r.decided === EXPECTED_NPC[r.id]),
      obsDefault.rows.map((r) => r.id + ':' + r.decided).join(' '));

    /* 対照群 (装置): シームが死んでいたら「既定が恒等」は自明に緑になる。
       「無いこと」の assert には必ず対照群を置く。 */
    const vFixed = judgeFixedTotal(obsFixed.rows, PROBE_N);
    console.log('  ?party=' + PROBE_N + ' 腕: ' + dump(obsFixed.rows));
    check('(2z1) 対照群: ?party=' + PROBE_N + ' で 6 シナリオとも計 ' + PROBE_N + ' 人 (シームは生きている)',
      vFixed.ok, vFixed.bad.length ? vFixed.bad.join(' / ') : '全件一致');
    check('(2z2) 既定腕と ?party=' + PROBE_N + ' 腕は実際に別物 (腕が割れている)',
      obsDefault.rows.some((r, i) => r.total !== obsFixed.rows[i].total),
      '既定=[' + obsDefault.rows.map((r) => r.total).join(',') + '] / 指定=['
        + obsFixed.rows.map((r) => r.total).join(',') + ']');
    check('(2z3) 不正値 (?party=abc) は恒等に戻り、silent fail-open にならない ([DIAG] が出る)',
      judgeIdentity(obsBad.rows, EXPECTED_NPC).ok && diagBad.length > 0,
      '[DIAG] ' + diagBad.length + ' 行 / 例: ' + (diagBad[0] || '(なし)'));
    check('(2z4) 範囲外 (?party=9) は恒等に戻り、[DIAG] が出る',
      judgeIdentity(obsOOR.rows, EXPECTED_NPC).ok && diagOOR.length > 0,
      '[DIAG] ' + diagOOR.length + ' 行 / 例: ' + (diagOOR[0] || '(なし)'));
    check('(2z5) ページエラーが 0 件',
      pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'なし');

    /* ══════════════════════════════════════════════════════════════════════
     * §4 受入条件 2. — 負のコントロールを道具に内蔵
     *   --negative では **同じ judgeIdentity** が ok===false になることを要求する。
     *   ⚠ 母集団に届いていない赤は「別の理由の赤」なので成功に数えない。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('====== §4 受入条件 2. 負のコントロール ======');
    if (!NEGATIVE) {
      console.log('  (--negative を付けたときだけ判定する。ここでは変異が配信できることだけ確かめる)');
      check('(4z0) 変異アンカーが tavern.html にちょうど 1 箇所ある',
        anchorHits === 1, 'hits=' + anchorHits);
    } else {
      const servedTav = await httpGet('http://localhost:' + PORT + '/tavern.html');
      const mutServed = servedTav.indexOf(MUT_TO) >= 0 && servedTav.indexOf(MUT_FROM) < 0;
      const reachedDefault = obsDefault.rows.filter((r) => r.wrote && r.isArray && r.total > 0).length;
      console.log('  変異が配信に載った: ' + mutServed);
      console.log('  既定腕の到達: ' + reachedDefault + '/' + SCENARIO_IDS.length);
      console.log('  judgeIdentity(既定腕) = ' + (vDefault.ok ? '緑' : '赤')
        + (vDefault.diffs.length ? ' -- ' + vDefault.diffs.join(' / ') : ''));
      check('(4a) 変異が実際に配信された (ディスクは無傷のまま)', mutServed,
        'MUT_TO=' + (servedTav.indexOf(MUT_TO) >= 0) + ' MUT_FROM残=' + (servedTav.indexOf(MUT_FROM) >= 0));
      check('(4b) 母集団に到達している (赤の理由が「測れていない」ではない)',
        reachedDefault === SCENARIO_IDS.length, reachedDefault + '/' + SCENARIO_IDS.length);
      check('(4c) 受入条件 1. の判定本体 (judgeIdentity) が **赤くなった**',
        vDefault.ok === false, vDefault.diffs.join(' / ') || '(緑のまま = assert が空回りしている)');
      check('(4d) ?party 指定の枝は変異の影響を受けない (変異が恒等の枝だけを狙えている)',
        vFixed.ok, vFixed.bad.join(' / ') || '計' + PROBE_N + '人のまま');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * ここから下は後続 STEP の担当。見出しだけ置いて中身は譲る。
     * ⚠ 空セクションは results に 1 件も積まない (未実装が緑に数えられないように)。
     * ══════════════════════════════════════════════════════════════════════ */
    const todo = (title, owner) => {
      console.log('====== ' + title + ' ======');
      console.log('  -- 未実装 (' + owner + ' の担当) --');
    };
    todo('§5 受入条件 4. スポーンタイル (N=5 / N=6 で別タイル・壁でない・頭に重ねる枝 0 人)', 'STEP2');
    todo('§6 受入条件 5. 隊列順と zone (front->mid->rear / [0] が front / zone が欠けていない)', 'STEP2');
    todo('§7 受入条件 6. 下部 HP ミニバーの枠 (390x844 でチップ実寸 / 横スクロールに落ちない N の上限)', 'STEP2');
    todo('§8 受入条件 7. カメラ / 主人公が画面外のフレーム率 (N=4 と N=5 のペア比較)', 'STEP3');
    todo('§9 受入条件 8. カメラ / クランプ区間が空に落ちた率 (loCx<=hiCx が偽になった回数)', 'STEP3');
    todo('§10 受入条件 9. 置き去りと救済 (MAX_LAG 超の待ち / ワープ救済の発動回数)', 'STEP3');
    todo('§11 受入条件 10. 描画コスト (performance.now の 1 フレーム実測)', 'STEP3');
    todo('§12 受入条件 11. 既存 golden の非退行', 'STEP4');
    todo('§13 受入条件 12. 依頼書へ「実装結果」節', 'STEP4');

  } catch (e) {
    console.error('[probe] FATAL ' + ((e && e.stack) || e));
    exitCode = 3;
  } finally {
    try { await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }

  const pass = results.filter((r) => r.ok).length;
  console.log('');
  console.log('== 結果: ' + pass + '/' + results.length + (pass === results.length ? ' PASS ==' : ' FAIL =='));
  if (pass !== results.length) {
    results.filter((r) => !r.ok).forEach((r) => console.log('  FAILED: ' + r.name + '  -- ' + r.detail));
  }
  if (exitCode === 3) process.exit(3);
  if (NEGATIVE) {
    /* 負のコントロールは「赤くなること」が成功。判定は道具が自分で下す (人間の目視に委ねない)。 */
    const ok = results.every((r) => r.ok);
    console.log(ok
      ? '[negative] OK シームを恒等でなくすと受入条件 1. の判定が赤くなった (assert は空回りしていない)'
      : '[negative] NG 赤くならなかった / 母集団に届かなかった = assert が測定装置を守れていない');
    process.exit(ok ? 0 : 1);
  }
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(3); });
