#!/usr/bin/env node
/*
 * tools/verify_mercenary_roster.js — 傭兵名簿 (実装依頼書 #38) の検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_mercenary_roster.js [--headful] [--port N]
 *   node tools/verify_mercenary_roster.js --negative              ← 負のコントロール (1 本ずつ)
 *   node tools/verify_mercenary_roster.js --negative --only badprefix
 *
 * ⚠ ポートの既定は **8931**。既存 golden (8891 前後) と当たらないようにしてある。
 *
 * ── 担当表 (どの節が何を守っているか) ─────────────────────────────────────
 *   §0 装置  … 母集団。⭐⭐⭐ (0a) が無いと「名簿から引けていないのに全部緑」になる
 *   §1 再登板… 同じ顔が返ってくる。2 経路 (名簿の実体 / 出発が焼いた partyMembers) で突き合わせ
 *   §2 成長  … 生還で増え、敗北で増えない。主人公 Lv による clamp は出発時 1 箇所
 *   §3 器    … 前置詞・スロット・上限・見送り
 *   §5 恒等  … 名簿が空なら従来と 1 バイトも変わらない / 装備 3 キーが動かない
 *   §4 (パネル) は **項目3**、§5 の (5c) と §6 (撤退) は **項目2 / 項目4** の担当。
 *   ⛔ この窓のスコープ外の受入条件は **ドライバにまだ書かない** (PENDING を残さない)。
 *
 * ── ⛔ 測らないこと (依頼書 §9 の末尾) ────────────────────────────────────
 *   パネルの配色・文言・行の並び順 / 「何回の生還で Lv+1 か」という数値 / 名簿から引く確率。
 *   ⭐ 測るのは「生還で増え、敗北で増えない」という **向き** と、
 *      「引かれることがある」「空なら必ず新顔」の 2 点だけ。
 *
 * ── ⚠⚠ 名簿は「本番の関数で」育てる ──────────────────────────────────────
 *   ⛔ localStorage へ手で JSON を書いて名簿を作らない (実装とドライバが同じ間違いを共有する)。
 *   本番の regeneratePartyMembers() → departToScenario() を実際に走らせて育てる。
 *   ⚠ departToScenario() は最後に location.href を書くので **遷移を横取りする**
 *     (setRequestInterception で tavern.html 以外の main-frame ナビゲーションを abort。
 *      verify_quest_walk / probe_party_size と同じ作法)。
 *
 * ── ⛔⛔⛔ 計測シームは本番ファイルに置かない ────────────────────────────
 *   (0a) は pickCompanion() の **どの枝を通ったか** を数える必要がある。しかし本番ファイルへ
 *   計測シームを置く設計は、このリポジトリでは原理的にコミットできない
 *   (changelog ガード / --no-verify のハードブロック。probe_party_size.js の冒頭に実測記録)。
 *   ⭐ 結論 = **シームは検証ツール側へ寄せる**。起動時に凍結した配信スナップショットへ注入し、
 *     ディスクの tavern.html は 1 バイトも変えない。(0z1) が両側で機械検査する。
 *
 * ── ⚠ 踏みやすい罠 (既存ドライバから引き継ぎ) ────────────────────────────
 *  - classic script 直下の let/const/function は window に載らない。evaluate の中の
 *    **裸の識別子**なら読める (scenarios / selection / prepScenario / NPC_NAMES …)。
 *  - evaluateOnNewDocument は **全ナビゲーションで再実行される**。purge は 1 タブ 1 回だけ。
 *  - tavern.html はディスク上 **CRLF**。アンカーは **1 行に収める** (改行を生成しない)。
 *  - 変異はディスクを書き換えず **配信を差し替える** (復元漏れが原理的に起きない)。
 *  - 「変異を入れたのに緑」は受入条件が何も検出していない証拠。空振りしたら exit 1。
 *
 * exit 0 = 期待どおり / 1 = assert が落ちた or 負のコントロールが空回り
 *        / 2 = 環境不足 / 3 = 装置の故障 (アンカーが腐った等)
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
/* ⚠ 既定 8931。orchestrator が既存 golden を 8891 前後で回すので当てない。 */
const PORT     = parseInt(arg('port', '8931'), 10);
const HEADFUL  = argv.includes('--headful');
const NEGATIVE = argv.includes('--negative');
const ONLY     = (arg('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);

/* 名簿を育てる腕。orc-fort = ★3 → NPC 3 人 (recruitCountOf)。
   ⭐ 人数はドライバが写経せず、本番が焼いた partyMembers の実体から数える。 */
const GROW_SCEN  = 'orc-fort';
const GROW_MAIN  = 14;   /* §0 §1 §3d 用の最低周回数 */
const GROW_MAX   = 40;   /* 同・上限。⭐ 名簿が満杯になるまで回す (必要周回数は抽選運でばらつく) */
const GROW_SMALL = 6;    /* §2 §3 用 */

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結
 *   起動時に 1 回だけ読んでメモリへ載せ、以後はそこからだけ返す = **1 起動 = 1 ビルド**。
 *   走行中に別窓が tavern.html を保存しても、前半と後半で別ビルドを測ることが起きない。
 *   ⭐ 変異 (--negative) と計測シームの注入は、どちらも **このスナップショットにだけ**掛かる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {};
(function freezeAll() {
  ['index.html', 'tavern.html', 'world.html', 'town.html', 'title.html', 'audio.js'].forEach((f) => {
    const fp = path.join(ROOT, f);
    if (fs.existsSync(fp)) FROZEN['/' + f] = fs.readFileSync(fp, 'utf8');
  });
  const jsDir = path.join(ROOT, 'js');
  fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).forEach((f) => {
    FROZEN['/js/' + f] = fs.readFileSync(path.join(jsDir, f), 'utf8');
  });
})();

/* ── 置換の共通口。アンカーが期待した数だけ当たらなければ **走らせる前に exit 3**。
      腐ったアンカーで「注入したつもり」のまま緑になるのを防ぐ。 */
function patch(kind, label, key, from, to, wantHits) {
  const src = FROZEN[key];
  if (src === undefined) {
    console.error('[driver] ' + kind + ' ' + label + ': 配信スナップショットに ' + key + ' がありません');
    process.exit(3);
  }
  const want = (wantHits === undefined) ? 1 : wantHits;
  const hits = src.split(from).length - 1;
  if (hits !== want) {
    console.error('[driver] ' + kind + ' ' + label + ' の注入点が ' + hits + ' 箇所 (期待 ' + want + ')。'
      + 'アンカーが腐っています:');
    console.error('         ' + JSON.stringify(from.slice(0, 160)));
    process.exit(3);
  }
  FROZEN[key] = src.split(from).join(to);
  return hits;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 計測シームの実行時注入 — pickCompanion() の **枝カウンタ**
 *   ⭐⭐⭐ (0a) の本体。「名簿から引いたのか / 新顔を作ったのか」を、返り値の mercId ではなく
 *     **通った枝そのもの**で数える (mercId で数えると、書き戻し側と同じ間違いを共有する)。
 *   ⚠ 改行を 1 つも生成しない = tavern.html が CRLF でも LF でも当たり方が変わらない。
 *   ⚠ window.__rosterSeam が無い間は何もしない (ReferenceError を作らない)。
 * ══════════════════════════════════════════════════════════════════════════ */
const BUMP = (k) => ' if (window.__rosterSeam) { window.__rosterSeam.calls++; window.__rosterSeam.'
  + k + '++; }';
const SEAM_INJECTIONS = [
  { label: '(a) 名簿 OFF の枝',
    from: '    if (!(window.DFRoster && DFRoster.enabled())) return makeNpcMember(classKey, usedNames);   // 名簿 OFF の枝',
    to:   '    if (!(window.DFRoster && DFRoster.enabled())) {' + BUMP('off')
        + ' return makeNpcMember(classKey, usedNames); }   // 名簿 OFF の枝' },
  { label: '(b) 満杯かつその職が 0 人の枝',
    from: '    if (n <= 0) return makeNpcMember(classKey, usedNames);   // 満杯かつその職が名簿に 0 人の枝',
    to:   '    if (n <= 0) {' + BUMP('fullMiss') + BUMP('fromNew')
        + ' return makeNpcMember(classKey, usedNames); }   // 満杯かつその職が名簿に 0 人の枝' },
  { label: '(c) 新顔を作る枝',
    from: '    if (i >= vets.length) return makeNpcMember(classKey, usedNames);   // 新顔を作る枝',
    to:   '    if (i >= vets.length) {' + BUMP('fromNew')
        + ' return makeNpcMember(classKey, usedNames); }   // 新顔を作る枝' },
  { label: '(d) 名簿から引く枝',
    from: '    const v = vets[i];                                                 // 名簿から引く枝',
    to:   '    const v = vets[i];' + BUMP('fromRoster') + '   // 名簿から引く枝' },
];
SEAM_INJECTIONS.forEach((inj) => patch('計測シーム', inj.label, '/tavern.html', inj.from, inj.to, 1));

/* ══════════════════════════════════════════════════════════════════════════
 * 負のコントロール (--negative)
 *   ⛔⛔ 本番ファイルは 1 バイトも書き換えない。**配信バイトだけ**を変異させて配る。
 *   ⚠⚠ 変異は **1 本ずつ**注入する。全部同時に入れると互いを覆い隠す
 *      (#34 / #37 で実測)。素の --negative は自分自身を子プロセスで 1 タグずつ呼び直す。
 *
 *   ⭐ 本窓 (項目1) が用意したのは **badprefix 1 本 + 注入機構**。
 *      残り 8 本 (noclamp / defeatgrows / nocap / alwaysroster / reuseid / switchleak /
 *      noretreatswitch / fadeclose) は **項目4 の仕事**。⛔ 表に嘘の行を足さないこと。
 * ══════════════════════════════════════════════════════════════════════════ */
const NEG_EXPECT = {
  /* キーの前置詞を dragonfighters. から外す = js/save-slots.js の keysOf() (前置詞総なめ) が
     黙って効かなくなる。依頼書 §2-3 の罠そのもの。 */
  badprefix: ['(3a)', '(3b)', '(3c)'],
};
const NEG_MUTATE = {
  badprefix: () => patch('負のコントロール', 'badprefix (キーの前置詞を外す)',
    '/js/mercenary-roster.js',
    'var KEY = "dragonfighters.mercRoster";',
    'var KEY = "df.mercRoster";   /* badprefix */', 1),
};
const INJECTED = [];

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const tags = Object.keys(NEG_EXPECT);
  const bad  = [];
  console.log('[driver] --negative (一括): ' + tags.join(',') + ' を 1 本ずつ順に走らせます');
  console.log('[driver] ⚠ 変異表は現在 ' + tags.length + '/9 本 (残り 8 本は項目4 の仕事)。'
    + '緑でも「9 本すべてが赤くなった」とは読まないこと。');
  tags.forEach((tag, i) => {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT + 1 + i)];
    if (HEADFUL) a.push('--headful');
    const r = spawnSync(process.execPath, a, { stdio: 'inherit' });
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  });
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + tags.length + ' 本とも担当ラベルが赤くなりました (空振り 0)');
  process.exit(0);
}
if (NEGATIVE) {
  ONLY.forEach((tag) => {
    if (!NEG_MUTATE[tag]) {
      console.error('[driver] 未知の変異タグ: ' + tag + ' (在るのは ' + Object.keys(NEG_MUTATE).join(',') + ')');
      process.exit(3);
    }
    NEG_MUTATE[tag]();
    INJECTED.push(tag);
    console.log('[driver] ★ 負のコントロール ' + tag + ' を注入しました (配信のみ・ディスクは無傷)');
  });
}

/* ══════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[driver] ブラウザが見つかりません'); process.exit(2);
}
/* ⚠ MIME を落とすと全 500 = 白紙になり、シームが undefined に見える */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u] !== undefined) {
          rs.setHeader('Content-Type', MIME[path.extname(u).toLowerCase()] || 'text/plain');
          rs.setHeader('Cache-Control', 'no-store');
          rs.end(FROZEN[u]);
          return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          rs.statusCode = 404; rs.end('404'); return;
        }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, state: cond ? 'PASS' : 'FAIL' });
  console.log((cond ? '  OK   ' : '  NG   ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * ページ側で走らせる本番の 1 周 (= 1 回の出発)。
 *   ⭐ ドライバは sessionStorage へ 1 行も書かない。書くのは本番の departToScenario()。
 *   ⭐ 「名簿から引いたか」は **抽選直後 (departToScenario の前)** にしか現れない
 *     (出発処理が新顔にも mercId を書き戻すため)。だから pre / post を両方採る。
 * ══════════════════════════════════════════════════════════════════════════ */
const ROUND_FN = function (sid) {
  const snapMember = (m) => ({
    isHero: !!m.isHero, classKey: m.classKey, name: m.name, trait: m.trait,
    line: m.line, variant: m.variant, level: m.level,
    mercId: (m.mercId === undefined || m.mercId === null) ? null : m.mercId,
    keys: Object.keys(m),
  });
  const out = { err: '' };
  try {
    const sc = scenarios.find((s) => s.id === sid);
    if (!sc) { out.err = 'シナリオが見つからない: ' + sid; return out; }
    prepScenario = sc;
    if (window.__rosterSeam) {
      window.__rosterSeam.calls = 0; window.__rosterSeam.off = 0;
      window.__rosterSeam.fromNew = 0; window.__rosterSeam.fromRoster = 0;
      window.__rosterSeam.fullMiss = 0;
    }
    out.rosterBefore = (window.DFRoster ? DFRoster.all() : []).length;
    regeneratePartyMembers();
    out.seam = window.__rosterSeam ? JSON.parse(JSON.stringify(window.__rosterSeam)) : null;
    out.pre = selection.partyMembers.map(snapMember);
    sessionStorage.removeItem('dragonfighters.partyMembers');   /* 前周の値を残さない */
    departToScenario();                                          /* ★本番。ここで名簿へ登録される */
    const raw = sessionStorage.getItem('dragonfighters.partyMembers');
    out.wrote = raw !== null;
    let arr = null;
    try { arr = JSON.parse(raw); } catch (e) {}
    out.post = Array.isArray(arr) ? arr.map(snapMember) : null;
    out.persist = {
      allyEquip:      localStorage.getItem('dragonfighters.allyEquip'),
      partySkills:    localStorage.getItem('dragonfighters.partySkills'),
      actionPriority: localStorage.getItem('dragonfighters.actionPriority'),
    };
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* 名簿の実体と、名簿キーの在り処。⭐ 前置詞は DFSlots.LIVE_PREFIX から読む (写経しない)。 */
const PROBE_FN = function () {
  const out = { err: '' };
  try {
    out.livePrefix = (window.DFSlots && DFSlots.LIVE_PREFIX) || null;
    out.cap        = (window.DFRoster && DFRoster.CAP) || null;
    out.namePool   = (typeof NPC_NAMES !== 'undefined') ? NPC_NAMES.length : null;
    out.roster     = window.DFRoster ? DFRoster.load() : null;
    out.allLen     = window.DFRoster ? DFRoster.all().length : null;
    out.lsKeys     = Object.keys(localStorage).filter((k) => k.indexOf('mercRoster') >= 0);
    out.band       = null;
    try {
      const tier = QuestGen.qGetTier(6);
      out.band = { tier: tier, BAND: { tier1: [2, 4], tier2: [5, 8], tier3: [9, 10], tier4: [10, 10] }[tier] };
    } catch (e) {}
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  const profile = require('./_pptr_profile')('df_mercroster_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
    defaultViewport: { width: 1280, height: 900 },
  });

  /* ⚠ purge は「1 タブにつき 1 回だけ」。evaluateOnNewDocument は新しい document ができる
     たびに走るので、無条件だとページ自身が書いた値を潰す。
     ⭐ 枠 (__rosterSeam) の初期化だけは毎回やる (ページ側スクリプトより先に必要)。 */
  const PURGE_MARK = '__dfMercPurged';
  const BOOT = (o) => {
    try {
      window.__rosterSeam = { calls: 0, off: 0, fromNew: 0, fromRoster: 0, fullMiss: 0 };
      if (sessionStorage.getItem(o.mark)) return;
      const kill = (store) => Object.keys(store).forEach((k) => {
        if (k.indexOf('df.') === 0 || k.indexOf('dragonfighters.') === 0) store.removeItem(k);
      });
      kill(localStorage); kill(sessionStorage);
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (o.xp) localStorage.setItem('dragonfighters.xp', String(o.xp));
      sessionStorage.setItem(o.mark, '1');
    } catch (e) {}
  };

  /* 酒場を開く共通口。⚠ departToScenario() は location.href を書くので、
     tavern.html 以外の main-frame ナビゲーションを **abort** して 1 タブに留める。 */
  async function openTavern(query, xp) {
    const page = await browser.newPage();
    const tag = 'tavern' + (query || '');
    page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
    await page.evaluateOnNewDocument(BOOT, { mark: PURGE_MARK, xp: xp || null });
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      try {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame()
            && !/\/tavern\.html/.test(r.url())) { r.abort('aborted'); return; }
        r.continue();
      } catch (e) { try { r.continue(); } catch (e2) {} }
    });
    await page.goto('http://localhost:' + PORT + '/tavern.html' + (query || ''),
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && typeof pickCompanion === 'function'"
      + " && typeof selection !== 'undefined' && selection && Array.isArray(selection.partyComposition)",
      { timeout: 30000 });
    await sleep(400);
    return page;
  }
  /* 本番の出発処理を n 周させる。⭐ 名簿は必ずこれで育てる (手で JSON を書かない)。 */
  async function grow(page, n) {
    const rounds = [];
    for (let i = 0; i < n; i++) {
      rounds.push(await page.evaluate(ROUND_FN, GROW_SCEN));
      await sleep(40);
    }
    return rounds;
  }
  /* (3d) は「満杯に達した状態」でしか何も測れないので、**達するまで回す**。
     ⚠ 固定周回数にすると、抽選運が悪い日だけ満杯に届かず (3d) が偽の赤になる
       (新顔が出る確率は在籍が増えるほど下がるので、必要周回数は run ごとにばらつく)。
     ⛔ 無限には回さない。届かなかったら **届かなかったことを (3d) の詳細に出す**
       (黙って打ち切って緑にしない)。 */
  async function growUntilFull(page, minRounds, maxRounds, cap) {
    const rounds = [];
    for (let i = 0; i < maxRounds; i++) {
      const r = await page.evaluate(ROUND_FN, GROW_SCEN);
      rounds.push(r);
      await sleep(40);
      if (rounds.length >= minRounds && r.rosterBefore >= cap) break;
    }
    return rounds;
  }

  let exitCode = 0;
  try {
    // ══════════════════════════════════════════════════════════════════
    // §0 装置 — 先に母集団を確かめる
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §0 装置 (母集団) ---');
    {
      const served = FROZEN['/tavern.html'];
      const disk   = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
      const diskJs = fs.readFileSync(path.join(ROOT, 'js', 'mercenary-roster.js'), 'utf8');
      const servedHits = served.split('__rosterSeam').length - 1;
      check('(0z0) [装置] 配信の tavern.html が空でない', served.length > 100000, served.length + ' 文字');
      check('(0z1) [装置] 枝カウンタ ' + SEAM_INJECTIONS.length + ' 点が配信バイトに在り、'
          + '**ディスクの tavern.html / js/mercenary-roster.js には 1 つも無い**',
        servedHits >= SEAM_INJECTIONS.length
          && disk.indexOf('__rosterSeam') < 0 && diskJs.indexOf('__rosterSeam') < 0,
        '配信 ' + servedHits + ' 箇所 / ディスク tavern='
          + (disk.indexOf('__rosterSeam') < 0 ? '0 件 (無改修)' : '★汚している')
          + ' / ディスク js=' + (diskJs.indexOf('__rosterSeam') < 0 ? '0 件 (無改修)' : '★汚している'));
    }

    const p1 = await openTavern('');
    /* ⭐ CAP は実体から読む (12 を直書きしない)。満杯に届くまで回す条件にも使う。 */
    const cap0 = await p1.evaluate(() => (window.DFRoster && window.DFRoster.CAP) || 0);
    const r1 = await growUntilFull(p1, GROW_MAIN, GROW_MAX, cap0);
    const probe1 = await p1.evaluate(PROBE_FN);
    console.log('  [装置] ' + r1.length + ' 周まわして名簿を育てた (CAP=' + cap0
      + ' に達したら打ち切り / 上限 ' + GROW_MAX + ' 周)');
    const errs1 = r1.map((r, i) => r.err ? ('#' + (i + 1) + ' ' + r.err) : '').filter(Boolean);
    if (errs1.length) console.log('  [!] 走行中の例外: ' + errs1.join(' / '));

    const npc1 = (r1[0].post || []).filter((m) => !m.isHero).length;
    check('(0a) まっさらなプロファイルでは名簿が空で、pickCompanion が makeNpcMember へ 100% 落ちる '
        + '(1 周目 fromRoster=0 / fromNew=NPC 人数 / 抽選直後に mercId 持ちが 0 人)',
      r1[0] && !r1[0].err && r1[0].rosterBefore === 0 && r1[0].seam
        && r1[0].seam.fromRoster === 0 && r1[0].seam.fromNew === npc1 && npc1 > 0
        && (r1[0].pre || []).every((m) => m.mercId === null),
      '1 周目: 名簿 ' + (r1[0] && r1[0].rosterBefore) + ' 人 / seam='
        + JSON.stringify(r1[0] && r1[0].seam) + ' / NPC ' + npc1 + ' 人 / 抽選直後の mercId 持ち '
        + (r1[0].pre || []).filter((m) => m.mercId !== null).length + ' 人');

    check('(0b) 本番の出発処理を ' + r1.length + ' 周させたあと、名簿に 1 人以上いる',
      !!(probe1.roster && probe1.roster.list.length >= 1),
      '在籍 ' + (probe1.roster ? probe1.roster.list.length : 'null') + ' 人 / next='
        + (probe1.roster ? probe1.roster.next : '-'));

    check('(0c) 上限を写経していない — DFRoster.CAP を実体から読み、それが NPC_NAMES (実体) より小さい '
        + '(= 名簿が満杯でも名前が衝突しない、の根拠)',
      typeof probe1.cap === 'number' && probe1.cap >= 1
        && typeof probe1.namePool === 'number' && probe1.cap < probe1.namePool,
      'CAP=' + probe1.cap + ' / NPC_NAMES=' + probe1.namePool + ' 要素');

    // ══════════════════════════════════════════════════════════════════
    // §1 同じ顔が返ってくる
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §1 同じ顔が返ってくる ---');
    const rosterIds = new Set((probe1.roster ? probe1.roster.list : []).map((m) => m.id));
    const postCount = new Map();     /* id -> 出た周の数 */
    const preIds    = new Set();     /* 抽選の時点で名簿から引いた id */
    const byId      = new Map();     /* id -> [{round, name, trait, line, variant}] */
    r1.forEach((r, i) => {
      (r.pre || []).forEach((m) => { if (m.mercId !== null) preIds.add(m.mercId); });
      const seen = new Set();
      (r.post || []).forEach((m) => {
        if (m.mercId === null || seen.has(m.mercId)) return;
        seen.add(m.mercId);
        postCount.set(m.mercId, (postCount.get(m.mercId) || 0) + 1);
        if (!byId.has(m.mercId)) byId.set(m.mercId, []);
        byId.get(m.mercId).push({ round: i + 1, name: m.name, trait: m.trait,
                                  line: m.line, variant: m.variant });
      });
    });
    const outside = Array.from(postCount.keys()).filter((id) => !rosterIds.has(id));
    const repeats = Array.from(postCount.entries()).filter((kv) => kv[1] >= 2);
    const fromRosterTotal = r1.reduce((a, r) => a + ((r.seam && r.seam.fromRoster) || 0), 0);

    check('(1z1) [母集団] 名簿から引く枝を実際に通っている (通っていなければ §1 は全部空振り)',
      fromRosterTotal >= 1 && preIds.size >= 1,
      '枝 fromRoster 合計 ' + fromRosterTotal + ' 回 / 抽選時に名簿から来た人 ' + preIds.size + ' 人');

    check('(1a) 2 経路が一致する — 出発が焼いた mercId の集合が名簿の id 集合の部分集合で、'
        + 'かつ 2 回以上出た id が 1 つ以上ある (= 再登板が実在する)',
      postCount.size > 0 && outside.length === 0 && repeats.length >= 1,
      '名簿 ' + rosterIds.size + ' 人 / 出発に出た id ' + postCount.size + ' 種 / 名簿外 '
        + outside.length + ' 件 / 2 回以上 ' + repeats.length + ' 人 (最多 '
        + Math.max.apply(null, [0].concat(Array.from(postCount.values()))) + ' 周)');

    const drift = [];
    byId.forEach((list, id) => {
      if (list.length < 2) return;
      const a = list[0];
      list.slice(1).forEach((b) => {
        if (a.name !== b.name || a.trait !== b.trait || a.line !== b.line || a.variant !== b.variant) {
          drift.push('id=' + id + ' 周' + a.round + ' vs 周' + b.round);
        }
      });
      const rec = ((probe1.roster && probe1.roster.list) || []).find((m) => m.id === id);
      if (rec && (rec.name !== a.name || rec.trait !== a.trait
                  || rec.line !== a.line || rec.variant !== a.variant)) {
        drift.push('id=' + id + ' 名簿の記録と食い違う');
      }
    });
    check('(1b) 再登板した人物の name / trait / line / variant が 1 文字も変わっていない '
        + '(周をまたいだ比較 + 名簿の記録との比較の 2 経路)',
      repeats.length >= 1 && drift.length === 0,
      '再登板 ' + repeats.length + ' 人 / 食い違い ' + drift.length + ' 件'
        + (drift.length ? ' -- ' + drift.slice(0, 4).join(' , ') : ''));

    const dupRounds = [];
    r1.forEach((r, i) => {
      const ids = (r.post || []).filter((m) => m.mercId !== null).map((m) => m.mercId);
      if (new Set(ids).size !== ids.length) dupRounds.push('周' + (i + 1) + ' id 重複 [' + ids.join(',') + ']');
      const names = (r.post || []).filter((m) => !m.isHero).map((m) => m.name);
      if (new Set(names).size !== names.length) dupRounds.push('周' + (i + 1) + ' 名前重複 [' + names.join(',') + ']');
    });
    check('(1c) 1 回の編成に同じ mercId (と同じ名前) が 2 回入らない',
      r1.length > 0 && dupRounds.length === 0,
      dupRounds.length ? dupRounds.slice(0, 4).join(' / ') : r1.length + ' 周とも重複なし');

    // ══════════════════════════════════════════════════════════════════
    // §3d 上限 (§1 と同じ走行から読む)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §3 名簿の器 (上限は §1 の走行から) ---');
    const over  = r1.filter((r) => r.rosterBefore > probe1.cap).length;
    const sizes = r1.map((r) => (r.post || []).length);
    const expectSize = sizes[0];
    check('(3d) 上限 CAP に達したら在籍数が増えない。かつ **その状態でも編成が完成する** '
        + '(人数が足りない編成にならない)',
      !!(probe1.roster) && probe1.roster.list.length === probe1.cap && over === 0
        && expectSize > 1 && sizes.every((n) => n === expectSize),
      '在籍 ' + (probe1.roster ? probe1.roster.list.length : '-') + '/' + probe1.cap
        + ' 人 (' + r1.length + ' 周) / 超過周 ' + over + ' 件 / 各周の編成人数 '
        + JSON.stringify(sizes)
        + (probe1.roster && probe1.roster.list.length < probe1.cap
            ? '  ★' + GROW_MAX + ' 周まわしても満杯に届かなかった = (3d) の母集団に未到達' : ''));

    // §5 の (5a) 名簿 ON 側 と (5b) は §1 の走行から読む
    const persists = r1.map((r) => JSON.stringify(r.persist));
    const persistStable = persists.every((s) => s === persists[0])
      && r1[0].persist && r1[0].persist.allyEquip !== null
      && r1[0].persist.partySkills !== null && r1[0].persist.actionPriority !== null;

    await p1.close();

    // ══════════════════════════════════════════════════════════════════
    // §2 成長
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §2 成長 ---');
    const p2 = await openTavern('');
    await grow(p2, GROW_SMALL);
    const g = await p2.evaluate(() => {
      const out = { err: '' };
      try {
        const snap = (r) => r.list.map((m) => ({ id: m.id, level: m.level, runs: m.runs }));
        const base = DFRoster.load();
        out.base = snap(base);
        out.ids  = base.list.map((m) => m.id);
        /* (2a) 生還 3 回 → runs +3 / Lv +1 */
        for (let i = 0; i < 3; i++) DFRoster.recordRun(out.ids, true);
        out.afterWin = snap(DFRoster.load());
        /* (2b) 敗北 5 回 → 何も動かない */
        for (let i = 0; i < 5; i++) DFRoster.recordRun(out.ids, false);
        out.afterLose = snap(DFRoster.load());
        /* (2d) 上限 10 */
        for (let i = 0; i < 30; i++) DFRoster.recordRun(out.ids, true);
        out.afterMany = snap(DFRoster.load());
        /* (3e) 見送り → その id は二度と配られない */
        const before = DFRoster.load();
        out.relId      = before.list[0].id;
        out.nextBefore = before.next;
        out.beforeN    = before.list.length;
        out.released   = DFRoster.release(out.relId);
        const afterRel = DFRoster.load();
        out.afterRel = { n: afterRel.list.length, next: afterRel.next,
                         has: afterRel.list.some((m) => m.id === out.relId) };
        /* 空いた枠へ登録し直しても、外した id は配られない (next は巻き戻らない) */
        out.newId = DFRoster.enroll({ classKey: 'warrior', name: '__reissue_probe__',
                                      trait: 't', line: 'l', variant: 1, level: 1 });
        const afterAdd = DFRoster.load();
        out.afterAdd = { n: afterAdd.list.length, next: afterAdd.next };
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    if (g.err) console.log('  [!] §2 の走行で例外: ' + g.err);

    check('(2z1) [母集団] §2 の名簿に 1 人以上いる',
      !g.err && !!g.base && g.base.length >= 1, '在籍 ' + ((g.base || []).length) + ' 人');
    {
      const bad = (g.base || []).map((b, i) => {
        const a = g.afterWin[i];
        const want = Math.min(b.level + 1, 10);
        return (a.runs === b.runs + 3 && a.level === want) ? null
          : ('id=' + b.id + ' Lv' + b.level + '→' + a.level + '(期待 ' + want + ') runs '
             + b.runs + '→' + a.runs + '(期待 ' + (b.runs + 3) + ')');
      }).filter(Boolean);
      check('(2a) recordRun(ids, true) を 3 回 → runs が +3 で Lv が +1',
        !g.err && (g.base || []).length >= 1 && bad.length === 0,
        bad.length ? bad.slice(0, 4).join(' / ') : (g.base || []).length + ' 人とも成立');
    }
    {
      const bad = (g.afterWin || []).map((b, i) => {
        const a = g.afterLose[i];
        return (a.runs === b.runs && a.level === b.level) ? null
          : ('id=' + b.id + ' Lv' + b.level + '→' + a.level + ' runs ' + b.runs + '→' + a.runs);
      }).filter(Boolean);
      check('(2b) recordRun(ids, false) を 5 回 → runs も level も 1 も動かない',
        !g.err && (g.afterWin || []).length >= 1 && bad.length === 0,
        bad.length ? bad.slice(0, 4).join(' / ') : (g.afterWin || []).length + ' 人とも不変');
    }
    {
      const lv = (g.afterMany || []).map((m) => m.level);
      check('(2d) level の上限が 10 (生還を積み増しても 10 を超えない)',
        !g.err && lv.length >= 1 && lv.every((v) => v <= 10)
          && Math.max.apply(null, lv) === 10,
        'Lv=' + JSON.stringify(lv));
    }
    check('(3e) release(id) で 1 人減り、**その id は二度と配られない** (next は減らない)',
      !g.err && g.released === true && !!g.afterRel && g.afterRel.n === g.beforeN - 1
        && g.afterRel.has === false && g.afterRel.next === g.nextBefore
        && g.newId !== null && g.newId !== g.relId && g.newId >= g.nextBefore
        && !!g.afterAdd && g.afterAdd.n === g.afterRel.n + 1,
      '外した id=' + g.relId + ' / 在籍 ' + g.beforeN + '→' + (g.afterRel && g.afterRel.n)
        + '→' + (g.afterAdd && g.afterAdd.n) + ' / next ' + g.nextBefore + '→'
        + (g.afterRel && g.afterRel.next) + ' / 次に配った id=' + g.newId);
    await p2.close();

    // ── (2c) 主人公 Lv による clamp が **出発時に** 効く ────────────────────
    //   ⭐ 2 本の腕で挟む。orc-fort は推奨 Lv 6 = tier2 で帯 [5,8] なので、
    //     名簿の Lv 9 は **帯の外**。主人公 Lv 10 の腕で 9 のまま出れば
    //     「振り直していない」、主人公 Lv 3 の腕で 3 になれば「clamp が効いている」。
    //   ⚠⚠ 観測の母集団は **Lv を書き換えた当人だけ** に絞る。2 度目の grow 中に
    //     新しく登録された顔は、その時の帯 / cap で決まった Lv を持つのが **正しい**
    //     (名簿が満杯でなければ必ず起きる)。絞らずに測ると、その正常な値を欠陥と読み違える
    //     ——実際 1 回目の実行で Lv3 側の名簿が [9,…,9,3] になって偽の赤が出た。
    async function clampArm(xp, forceLevel) {
      const page = await openTavern('', xp);
      await grow(page, GROW_SMALL);
      const set = await page.evaluate((lv) => {
        /* ⚠ localStorage へ手で JSON を書かない。名簿自身の load()/save() を往復させる。 */
        const r = DFRoster.load();
        r.list.forEach((m) => { m.level = lv; });
        return { saved: DFRoster.save(r), n: r.list.length, ids: r.list.map((m) => m.id) };
      }, forceLevel);
      const forced = new Set(set.ids || []);
      const rounds = await grow(page, GROW_SMALL);
      const after  = await page.evaluate(PROBE_FN);
      const heroLv = await page.evaluate(() => {
        try { return getLevelFromXP(inventory.xp); } catch (e) { return null; }
      });
      await page.close();
      const seenLv = [];
      rounds.forEach((r) => {
        /* 「抽選の時点で名簿から来た」かつ「Lv を 9 に書き換えた当人」だけを数える */
        const known = new Set((r.pre || []).filter((m) => m.mercId !== null && forced.has(m.mercId))
          .map((m) => m.mercId));
        (r.post || []).forEach((m) => { if (known.has(m.mercId)) seenLv.push(m.level); });
      });
      const rosterLv = ((after.roster && after.roster.list) || [])
        .filter((m) => forced.has(m.id)).map((m) => m.level);
      return { set, heroLv, seenLv, band: after.band, forced: forced.size, rosterLv: rosterLv };
    }
    const armHi = await clampArm(45000, 9);   /* 主人公 Lv10 */
    const armLo = await clampArm(3000, 9);    /* 主人公 Lv3  */
    console.log('  帯 (orc-fort 推奨 Lv6): ' + JSON.stringify(armHi.band)
      + ' / 名簿の Lv を 9 に固定 (帯の外)');
    check('(2z2) [母集団] 両腕とも「Lv を書き換えた当人が名簿から引かれた」ところを実際に観測した',
      armHi.seenLv.length >= 1 && armLo.seenLv.length >= 1
        && armHi.rosterLv.length >= 1 && armLo.rosterLv.length >= 1,
      '主人公 Lv' + armHi.heroLv + ' 側 ' + armHi.seenLv.length + ' 人 (書き換え対象 '
        + armHi.forced + ' 人) / Lv' + armLo.heroLv + ' 側 ' + armLo.seenLv.length
        + ' 人 (書き換え対象 ' + armLo.forced + ' 人)');
    check('(2c) 主人公 Lv による clamp が出発時に効く — 主人公 Lv10 では名簿の Lv9 がそのまま出て '
        + '(帯 [5,8] の外 = 振り直していない証拠)、主人公 Lv3 では 3 に落ちる。'
        + 'かつ **名簿側の 9 は保存されたまま**',
      armHi.heroLv === 10 && armLo.heroLv === 3
        && armHi.seenLv.length >= 1 && armHi.seenLv.every((v) => v === 9)
        && armLo.seenLv.length >= 1 && armLo.seenLv.every((v) => v === 3)
        && armLo.rosterLv.length >= 1 && armLo.rosterLv.every((v) => v === 9),
      'Lv10 側の出発 Lv=' + JSON.stringify(armHi.seenLv) + ' / Lv3 側の出発 Lv='
        + JSON.stringify(armLo.seenLv) + ' / Lv3 側の名簿 Lv=' + JSON.stringify(armLo.rosterLv));

    // ══════════════════════════════════════════════════════════════════
    // §3 名簿の器 (前置詞 / スロット / 新規ゲーム)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §3 名簿の器 (前置詞・スロット) ---');
    const p4 = await openTavern('');
    await grow(p4, GROW_SMALL);
    const slot = await p4.evaluate(() => {
      const out = { err: '' };
      try {
        const hit = (o) => Object.keys(o).filter((k) => k.indexOf('mercRoster') >= 0);
        out.livePrefix  = DFSlots.LIVE_PREFIX;
        out.lsKeys      = hit(localStorage);
        out.before      = DFRoster.all().length;
        const snap      = DFSlots.snapshot();
        out.snapKeys    = (snap && snap.data) ? hit(snap.data) : [];
        out.snapAllKeys = (snap && snap.data) ? Object.keys(snap.data).length : 0;
        DFSlots.wipeLive();
        out.afterWipeLs  = hit(localStorage);
        out.afterWipeAll = DFRoster.all().length;
      } catch (e) { out.err = String((e && e.message) || e); }
      return out;
    });
    if (slot.err) console.log('  [!] §3 の走行で例外: ' + slot.err);
    check('(3a) 名簿のキーが localStorage にちょうど 1 本あり、その前置詞が DFSlots.LIVE_PREFIX と'
        + '一致する (= 前置詞総なめで拾われる形になっているか)',
      !slot.err && !!slot.lsKeys && slot.lsKeys.length === 1
        && typeof slot.livePrefix === 'string' && slot.livePrefix.length > 0
        && slot.lsKeys[0].indexOf(slot.livePrefix) === 0 && slot.before >= 1,
      'キー=' + JSON.stringify(slot.lsKeys) + ' / LIVE_PREFIX=' + JSON.stringify(slot.livePrefix)
        + ' / 在籍 ' + slot.before + ' 人');
    check('(3c) DFSlots.snapshot() の data に名簿が含まれる (= スロットごとに別の名簿になる)',
      !slot.err && !!slot.snapKeys && slot.snapKeys.length === 1
        && slot.snapKeys[0].indexOf(slot.livePrefix) === 0,
      'snapshot.data の名簿キー=' + JSON.stringify(slot.snapKeys)
        + ' (data 全体 ' + slot.snapAllKeys + ' キー)');
    check('(3b) DFSlots.wipeLive() の後、名簿が消える (= 新規ゲームで消える)。'
        + '⭐ 「dragonfighters.mercRoster が null」だけでは前置詞違いを見逃すので、'
        + 'DFRoster.all() と localStorage の両方で測る',
      !slot.err && !!slot.afterWipeLs && slot.afterWipeLs.length === 0 && slot.afterWipeAll === 0,
      '残ったキー=' + JSON.stringify(slot.afterWipeLs) + ' / DFRoster.all()='
        + slot.afterWipeAll + ' 人 (wipe 前は ' + slot.before + ' 人)');
    await p4.close();

    // ══════════════════════════════════════════════════════════════════
    // §5 恒等 (非退行)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n--- §5 恒等 (非退行) ---');
    const p5 = await openTavern('?roster=0');
    const r5 = await grow(p5, 3);
    await p5.close();

    const keyset = (rounds) => {
      const s = new Set();
      rounds.forEach((r) => (r.post || []).forEach((m) => {
        if (!m.isHero) m.keys.forEach((k) => s.add(k));
      }));
      return s;
    };
    const legacyKeys = keyset(r5);
    const rosterKeys = keyset([r1[0]]);            /* 名簿が空だった 1 周目 */
    const rosterMinusMerc = new Set(Array.from(rosterKeys).filter((k) => k !== 'mercId'));
    const same = legacyKeys.size > 0 && rosterMinusMerc.size === legacyKeys.size
      && Array.from(legacyKeys).every((k) => rosterMinusMerc.has(k));
    const legacyHasMerc = Array.from(legacyKeys).indexOf('mercId') >= 0;
    check('(5a) 名簿が空のとき partyMembers の形が従来と完全に一致する '
        + '(キー集合が mercId を除いて同一。?roster=0 の腕を基準にする)',
      same && !legacyHasMerc && r5.every((r) => !r.err) && !r1[0].err,
      '従来=' + JSON.stringify(Array.from(legacyKeys).sort())
        + ' / 名簿 ON 1 周目=' + JSON.stringify(Array.from(rosterKeys).sort()));

    check('(5b) allyEquip / partySkills / actionPriority の 3 キーが出発の前後で 1 バイトも変わらない '
        + '(' + r1.length + ' 周ぶん)',
      persistStable,
      persistStable ? '3 キーとも ' + r1.length + ' 周ぜんぶ同一'
        : '★変化した -- 差分のあった周 ' + persists.filter((s) => s !== persists[0]).length + ' 件');

    check('(Z) pageerror ゼロ', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 5)));

  } catch (e) {
    console.error('[driver] FATAL ' + ((e && e.stack) || e));
    exitCode = 3;
  } finally {
    try { await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }

  const pass = results.filter((r) => r.state === 'PASS').length;
  const fail = results.filter((r) => r.state === 'FAIL').length;
  const pend = results.filter((r) => r.state === 'PENDING').length;
  console.log('\n[mercenary-roster] ' + pass + ' PASSED / ' + fail + ' FAILED / ' + pend + ' PENDING'
    + '  (' + pass + '/' + results.length + ')');
  if (fail > 0) {
    console.log('[mercenary-roster] NG: ' + results.filter((r) => r.state === 'FAIL')
      .map((r) => r.name.split(' ')[0]).join(' | '));
  }
  if (exitCode === 3) process.exit(3);

  if (NEGATIVE) {
    /* 変異を入れたのに担当ラベルが緑のまま = 空振り。⛔ 黙って成功させない。 */
    const red  = new Set(results.filter((r) => r.state === 'FAIL').map((r) => r.name.split(' ')[0]));
    const miss = [];
    INJECTED.forEach((tag) => (NEG_EXPECT[tag] || []).forEach((lab) => {
      if (!red.has(lab)) miss.push(tag + '→' + lab);
    }));
    console.log('[driver] --negative: 注入=' + (INJECTED.join(',') || 'なし')
      + ' / 赤くなったラベル=' + (Array.from(red).join(',') || '(なし)'));
    if (!INJECTED.length) { console.error('[driver] 変異を 1 つも注入していません'); process.exit(1); }
    if (miss.length) { console.error('[driver] 空振り: ' + miss.join(' , ')); process.exit(1); }
    console.log('[driver] --negative OK (担当ラベルが全部赤くなりました)');
    process.exit(0);
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
