/*
 * tools/verify_title_screen.js — タイトル画面 title.html の検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-20_title-screen.md` の受入条件を測る。
 *
 *   node tools/verify_title_screen.js [--headful] [--port N]
 *
 * ── 実装状況 (段階的に足していく骨組み) ────────────────────────────────────
 *   ✅ 受入条件 6.  : hero-classes.js の zone と tavern.html の PARTY_ZONES の突き合わせ  ← 本ファイルの現状
 *   ⬜ 受入条件 1.〜4.: title.html のスロット選択 / 名乗り / 続き / 2 段タップ  (項目 2〜3 が追加)
 *   ⬜ 受入条件 5. 7. : tavern.html のクラス変更封印 と ?herolock=0 の装置 assert (項目 4 が追加)
 *   ⬜ 受入条件 8.    : ?title=0 の装置 assert                                   (項目 4 が追加)
 *   ⬜ 受入条件 9. 10.: 390px / 横長デスクトップの両方 と GameAudio.unlock       (項目 4 が追加)
 *   ⬜ 受入条件 11.   : 既存 golden ドライバの非退行 (本ドライバの外で回す)
 *   足す場所は下の「■ SECTION」コメントに印を付けてある。共通の道具は
 *   openPage() / check() / results / pageErrors。新しいセクションはそれを使い回すこと。
 *
 * ── ★ 受入条件 6. の設計: 「片方の写経」にしないための 2 経路 ────────────────
 *   依頼書は「片方の写経ではなく **2 経路の突き合わせ**」を要求している。
 *     経路 A = ブラウザで /tavern.html を開き、本番のスクリプトが評価した PARTY_ZONES を読む
 *     経路 B = ブラウザで js/hero-classes.js を読み込み、window.HERO_CLASSES を読む
 *   → ドライバのソースに期待値を 1 文字も書かない。書いていないことは (6z0) が
 *     **自分自身のソースを走査して**機械的に証明する。
 *
 * ── ⚠⚠⚠ PARTY_ZONES の読み方 (ここで必ず転ぶ) ──────────────────────────────
 *   PARTY_ZONES は tavern.html の classic script **直下の const**。したがって
 *     window.PARTY_ZONES は **常に undefined** → これで読むと偽の赤になる
 *     page.evaluate(() => PARTY_ZONES) のように **裸の識別子**なら読める
 *   過去に window.dungeonCleared で実際に踏んでいる罠。(6z1) が読み取り自体の成否を分けて測る
 *   ので、「読めなかったのか」「値が違うのか」がログで区別できる。
 *
 * ── ⚠ 突き合わせ相手が空でも緑になる穴 ─────────────────────────────────────
 *   依頼書が名指しで塞げと言っている穴。3 段で塞ぐ:
 *     (6z2) PARTY_ZONES が実際に 6 キーを持つ            ← 母集団が空でない
 *     (6z4)(6z6) zone の値が 2 種類以上ある              ← 全部同値なら一致は自明で無意味
 *     (6z9) 同じ comparator に空を通すと **落ちる**      ← comparator 自身が空を緑にしない
 *   さらに (6z8) が「1 職だけ zone を入れ替えた」入力で落ちることを測る = 恒真ではない証明。
 *   ⭐ 負のコントロールは (6) 本体と **同じ compareZones() を共有**して当てる。
 *      判定式を書き直すと「別々に書いた 2 つの assert が両方とも間違っている」事故を防げない。
 *
 * ── ⚠ 踏みやすい罠 (verify_save_slots.js から引き継ぎ) ──────────────────────
 *  - same-origin の localStorage は **ページ遷移をまたいで生き残る**。openPage() が
 *    document-start で 2 つの接頭辞を purge する。⚠ その 2 つをブロックコメント内で
 *    スラッシュ区切りで並べて書くとコメントが閉じて SyntaxError になる (実際に踏んだ)。
 *  - ROOT は必ず path.resolve を通す。区切り文字のまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない。
 *  - MIME テーブルを持たせ忘れると全 500 でページが空になる (シームが undefined に見える)。
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
const PORT = parseInt(arg('port', '8893'), 10);
const HEADFUL = argv.includes('--headful');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core'));
}
function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  throw new Error('no browser');
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* 経路 B 用の「素の宿主ページ」。リポジトリに捨てファイルを作らずに
   js/hero-classes.js を **ブラウザに実際に評価させる**ためだけの 3 行。
   ⚠ ここでファイルを読んで JSON.parse する等の「Node 側で解釈する」方式は取らない。
      本番と同じ classic script の読み込み経路を通すことに意味がある。 */
const PROBE_HOST = '/__probe/hero-classes-host.html';
const PROBE_HOST_HTML = '<!doctype html><meta charset="utf-8"><title>hero-classes probe</title>'
  + '<script src="/js/hero-classes.js"></script>';

function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === PROBE_HOST) {
          rs.setHeader('Content-Type', MIME['.html']); rs.end(PROBE_HOST_HTML); return;
        }
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
  results.push({ name, ok: !!cond });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * 判定本体 (Node 側・純関数)。受入条件 6. の本番判定と 2 本の負のコントロールが
 * **この 1 つの関数を共有**する。判定式を 3 回書き直さないのが要点。
 * ⚠ 両方向を見る。HERO_CLASSES 側だけを走査すると、PARTY_ZONES に余分な職が
 *   増えたときに気づけない。
 * ══════════════════════════════════════════════════════════════════════════ */
function compareZones(partyZones, heroClasses) {
  const pz = partyZones || {};
  const hc = heroClasses || [];
  const zoneKeys = Object.keys(pz).sort();
  const heroKeys = hc.map(c => c.classKey).sort();
  const diffs = [];
  hc.forEach(c => {                                     // 方向 1: 名乗りカード → 隊列表
    const z = pz[c.classKey];
    if (z !== c.zone) diffs.push({ classKey: c.classKey, hero: c.zone, party: z === undefined ? '(キーなし)' : z });
  });
  zoneKeys.forEach(k => {                               // 方向 2: 隊列表 → 名乗りカード
    if (heroKeys.indexOf(k) < 0) diffs.push({ classKey: k, hero: '(キーなし)', party: pz[k] });
  });
  return {
    ok: diffs.length === 0 && heroKeys.length > 0 && zoneKeys.length > 0
        && zoneKeys.join(',') === heroKeys.join(','),
    diffs, nParty: zoneKeys.length, nHero: heroKeys.length,
  };
}

/* 負のコントロール用: **zone のリテラルを 1 つも書かずに** 1 職だけ zone を差し替える。
   配列の中に実在する別の zone を借りてくるので、値を知らなくても変異が作れる。 */
function mutateOneZone(heroClasses) {
  const clone = heroClasses.map(c => Object.assign({}, c));
  const first = clone[0];
  const other = clone.find(c => c.zone !== first.zone);
  if (!other) return null;                              // 全部同じ zone = (6z6) が先に赤くなる
  first.zone = other.zone;
  return clone;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 観測 (ページ側)。判定を 1 つも持たない。
 * ══════════════════════════════════════════════════════════════════════════ */
function probePartyZones() {
  var out = { threw: '', ranToEnd: false, href: location.href };
  try {
    // classic script 直下の const は window に載らない。その事実そのものを記録に残す。
    out.onWindow = typeof window.PARTY_ZONES;
    out.zones = JSON.parse(JSON.stringify(PARTY_ZONES));   // ← ★裸の識別子でしか読めない
    out.allClassKeys = ALL_CLASS_KEYS.slice();             // tavern.html 内の独立した別データ
    out.ranToEnd = true;
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
}

function probeHeroClasses() {
  var out = { threw: '', ranToEnd: false, href: location.href };
  try {
    out.onWindow = typeof window.HERO_CLASSES;             // こちらは明示代入なので window に載る
    out.isArray = Array.isArray(window.HERO_CLASSES);
    out.classes = (window.HERO_CLASSES || []).map(function (c) {
      return {
        classKey: c.classKey, name: c.name, zone: c.zone,
        hasTagline: typeof c.tagline === 'string' && c.tagline.length > 0,
        hasRole:    typeof c.role    === 'string' && c.role.length    > 0,
        hasNote:    typeof c.note    === 'string' && c.note.length    > 0,
        // 依頼書の「⚠ 数値 (HP / AC / 命中) を書かない」を機械化するための観測
        numericFields: Object.keys(c).filter(function (k) { return typeof c[k] === 'number'; }),
      };
    });
    out.ranToEnd = true;
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  const profile = require('./_pptr_profile')('df_titlescreen_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  /* ⚠⚠ same-origin の localStorage はページ遷移をまたいで生き残る。
        前のセクションの残骸が次のセクションへ漏れて偽の赤/偽の緑になる (実際に踏んだ)。
        → **document-start** で毎回 purge する。ページ内スクリプトより前に走るのが要点。
     opts.prologueSeen  既定 true = 前口上を出さない。⚠ 受入条件 2. を測るときだけ false にする
                        (項目 2 の担当。前口上が出ることそのものが受入条件なので)
     opts.viewport      受入条件 9. で 390px と横長デスクトップの両方を測るための口 (項目 4 の担当) */
  async function openPage(pathQuery, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    if (opts.viewport) await page.setViewport(opts.viewport);
    page.on('pageerror', e => pageErrors.push(pathQuery + ' :: ' + e.message));
    await page.evaluateOnNewDocument((seen) => {
      try {
        var kill = function (store) {
          Object.keys(store).forEach(function (k) {
            if (k.indexOf('df.') === 0) store.removeItem(k);
            if (k.indexOf('dragonfighters.') === 0) store.removeItem(k);
          });
        };
        kill(localStorage); kill(sessionStorage);
        if (seen) localStorage.setItem('dragonfighters.prologueSeen', '1');
      } catch (e) {}
    }, opts.prologueSeen !== false);
    await page.goto('http://localhost:' + PORT + pathQuery, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(opts.settle || 800);
    return page;
  }

  /* ■ SECTION 受入条件 6 ─────────────────────────────────────────────────
     hero-classes.js の zone と tavern.html の PARTY_ZONES を 2 経路で突き合わせる */
  console.log('\n--- 受入条件 6. : hero-classes.js の zone と tavern.html の PARTY_ZONES の一致 ---');
  {
    // (6z0) 静的: 本ドライバのソースに期待値 (zone の文字列リテラル) が 1 つも無い
    //   ⚠ この正規表現は **自分自身にヒットしないよう** 分割して組み立てている。
    //      ソースに zone のリテラルをそのまま書くと、この装置 assert が自分を検出して永久に赤になる。
    const ZONE_WORDS = ['fr' + 'ont', 'm' + 'id', 're' + 'ar'];
    const zoneLiteralSrc = '["\'](' + ZONE_WORDS.join('|') + ')["\']';
    const selfSrc = fs.readFileSync(__filename, 'utf8');
    const selfHits = selfSrc.match(new RegExp(zoneLiteralSrc, 'g')) || [];
    check('(6z0) [装置・静的] ドライバのソースに期待値 (zone のリテラル) を書き写していない',
      selfHits.length === 0, 'hits=' + JSON.stringify(selfHits));
    // 上の走査が空振りしていないことの装置 assert: 実データには当然ヒットする
    const heroSrcHits = (fs.readFileSync(path.join(ROOT, 'js', 'hero-classes.js'), 'utf8')
      .match(new RegExp(zoneLiteralSrc, 'g')) || []).length;
    check('(6z0b) [装置] その走査は空振りしていない (js/hero-classes.js には 6 件以上ヒットする)',
      heroSrcHits >= 6, 'hits=' + heroSrcHits);

    // ── 経路 A: 本番の tavern.html をブラウザで開いて PARTY_ZONES を読む ──────
    const pageA = await openPage('/tavern.html');
    const obsA = await pageA.evaluate(probePartyZones);
    await pageA.close();

    // ── 経路 B: js/hero-classes.js をブラウザに読み込ませて HERO_CLASSES を読む ─
    const pageB = await openPage(PROBE_HOST);
    const obsB = await pageB.evaluate(probeHeroClasses);
    await pageB.close();

    console.log('  [経路A] ' + obsA.href);
    console.log('          PARTY_ZONES     = ' + JSON.stringify(obsA.zones));
    console.log('          ALL_CLASS_KEYS  = ' + JSON.stringify(obsA.allClassKeys));
    console.log('          window.PARTY_ZONES の型 = ' + obsA.onWindow + '  (classic script 直下の const なので undefined が正常)');
    console.log('  [経路B] ' + obsB.href);
    console.log('          HERO_CLASSES の zone = ' +
      JSON.stringify((obsB.classes || []).reduce((m, c) => (m[c.classKey] = c.zone, m), {})));

    // ── 装置 assert: 読み取りと母集団の健全性 ────────────────────────────
    check('(6z1) [装置] 経路A: tavern.html で PARTY_ZONES を **裸の識別子**で読めた (例外なし)',
      obsA.threw === '' && obsA.ranToEnd === true && !!obsA.zones,
      JSON.stringify({ threw: obsA.threw, ranToEnd: obsA.ranToEnd }));
    check('(6z2) [装置] 経路A: PARTY_ZONES が実際に 6 キーを持つ (突き合わせ相手が空ではない)',
      Object.keys(obsA.zones || {}).length === 6, 'nKeys=' + Object.keys(obsA.zones || {}).length);
    check('(6z3) [装置] 経路A: PARTY_ZONES のキー集合が ALL_CLASS_KEYS と一致 (tavern.html 内の別データとも整合)',
      Object.keys(obsA.zones || {}).sort().join(',') === (obsA.allClassKeys || []).slice().sort().join(','),
      JSON.stringify({ zones: Object.keys(obsA.zones || {}).sort(), all: (obsA.allClassKeys || []).slice().sort() }));
    check('(6z4) [装置] 経路A: zone の値が 2 種類以上ある (全部同値なら一致は自明で無意味)',
      new Set(Object.values(obsA.zones || {})).size >= 2, 'distinct=' + new Set(Object.values(obsA.zones || {})).size);

    check('(6z5) [装置] 経路B: hero-classes.js がブラウザで実際に読み込まれた (配列・6 件・全件に zone がある)',
      obsB.threw === '' && obsB.ranToEnd === true && obsB.isArray === true
        && (obsB.classes || []).length === 6
        && (obsB.classes || []).every(c => typeof c.zone === 'string' && c.zone.length > 0),
      JSON.stringify({ threw: obsB.threw, isArray: obsB.isArray, n: (obsB.classes || []).length }));
    check('(6z6) [装置] 経路B: zone の値が 2 種類以上ある',
      new Set((obsB.classes || []).map(c => c.zone)).size >= 2,
      'distinct=' + new Set((obsB.classes || []).map(c => c.zone)).size);
    check('(6z7) [装置] 2 経路が **別々のドキュメント**由来である (同じページを 2 回読んでいない)',
      !!obsA.href && !!obsB.href && obsA.href !== obsB.href, obsA.href + '  vs  ' + obsB.href);

    // ── ★ 受入条件 6. 本体 ────────────────────────────────────────────
    const cmp = compareZones(obsA.zones, obsB.classes);

    /* ── 負のコントロール: 同じ compareZones() が **落ちる**ことを実測 ──────
       ⚠ 装置 assert は「実装が壊れた」ときに **道連れで赤くならない** ように書く。
         道連れになると「検出器が壊れた」のか「実装が壊れた」のかログで区別できなくなる。
         (実際に踏んだ: diffs.length === 1 と決め打ちしていたら、hero-classes.js を
          1 箇所壊した負のコントロール実験で (6z8) まで一緒に赤くなった)
         → 絶対数ではなく **本番比較との差分** (+1 件) で測る。 */
    const mutated = mutateOneZone(obsB.classes || []);
    const negMut = compareZones(obsA.zones, mutated);
    check('(6z8) [負のコントロール] 1 職だけ zone を入れ替えると同じ comparator の差分が 1 件増える (恒真ではない)',
      mutated !== null && negMut.ok === false && negMut.diffs.length === cmp.diffs.length + 1,
      JSON.stringify({ ok: negMut.ok, nDiffsBase: cmp.diffs.length, nDiffsMutated: negMut.diffs.length }));
    const negEmpty = compareZones({}, obsB.classes || []);
    check('(6z9) [負のコントロール] 突き合わせ相手が空 {} だと同じ comparator が **落ちる** (空でも緑になる穴を塞いだ)',
      negEmpty.ok === false && negEmpty.diffs.length === (obsB.classes || []).length && negEmpty.diffs.length > 0,
      JSON.stringify({ ok: negEmpty.ok, nDiffs: negEmpty.diffs.length }));

    check('(6) ★受入条件6: hero-classes.js の zone が PARTY_ZONES と 6 職すべてで一致する',
      cmp.ok === true && cmp.nParty === 6 && cmp.nHero === 6,
      JSON.stringify({ nParty: cmp.nParty, nHero: cmp.nHero, diffs: cmp.diffs }));

    // ── おまけ (依頼書の設計ルールの機械化) ───────────────────────────
    //    「⚠ 数値 (HP / AC / 命中) を書かない。CLASS_DEFS と二重管理になり必ず腐る」
    const numeric = (obsB.classes || []).filter(c => c.numericFields.length > 0);
    check('(6h1) [設計ルール] hero-classes.js が数値フィールドを 1 つも持たない (CLASS_DEFS との二重管理を作らない)',
      numeric.length === 0, JSON.stringify(numeric.map(c => ({ classKey: c.classKey, fields: c.numericFields }))));
    check('(6h2) [設計ルール] 6 職すべてが tagline / role / note を持つ (カードが空欄にならない)',
      (obsB.classes || []).length === 6 && (obsB.classes || []).every(c => c.hasTagline && c.hasRole && c.hasNote),
      JSON.stringify((obsB.classes || []).filter(c => !(c.hasTagline && c.hasRole && c.hasNote)).map(c => c.classKey)));

    // ── title.html が出来たら、経路 B を **本番のページ**でも測る ──────────
    //    ⚠ 項目 2 が title.html を作った瞬間にここが自動で 1 本増える。
    //      「hero-classes.js を title.html が実際に読み込んでいるか」は 1.〜2. とは別の性質。
    if (fs.existsSync(path.join(ROOT, 'title.html'))) {
      const pageT = await openPage('/title.html');
      const obsT = await pageT.evaluate(probeHeroClasses);
      await pageT.close();
      const cmpT = compareZones(obsA.zones, obsT.classes);
      check('(6t) title.html も同じ hero-classes.js を読み込み、zone が PARTY_ZONES と一致する',
        obsT.threw === '' && obsT.isArray === true && cmpT.ok === true,
        JSON.stringify({ threw: obsT.threw, n: (obsT.classes || []).length, diffs: cmpT.diffs }));
    } else {
      console.log('  --  title.html はまだ存在しない → (6t) はスキップ (項目 2 が作ると自動で有効になる)');
    }
  }

  /* ■ SECTION 受入条件 1.〜4.  ← 項目 2〜3 がここに足す ───────────────────
     1. title.html がスロットを 3 枚描く (全消し状態では 3 枚とも「記録なし」+「はじめから」)
     2. 新規の一周: スロット1「はじめから」→ 名乗りで rogue → 確定 → tavern.html に着き、
        localStorage["dragonfighters.partyComposition"] === '["rogue"]' かつ #prologueOverlay が表示
        ⚠ openPage('/title.html', { prologueSeen: false }) で開くこと。既定は true なので前口上が出ない
        ⚠⚠ #prologueOverlay は前口上 / 受注 / 闇市の 3 用途で共用の器 (tavern.html の該当コメント参照)。
           「表示されている」だけで測ると別用途でも緑になる。前口上であることまで測る
        ⚠ partyComposition は localStorage と sessionStorage の両方に同名キーがある。読む側は **localStorage**
     3. 続きの一周: スロット1 に進行を作り、スロット2 で別主人公の新規 → title に戻って
        スロット1 の「つづきから」→ スロット1 の xp と主人公が戻る
     4. 埋まっているスロットの「はじめから」は 1 タップでは消えない (確認行が出るだけ)。2 タップ目で消える
     ── 道具: openPage() / DFSlots (js/save-slots.js) ─────────────────── */

  /* ■ SECTION 受入条件 5. 7. 8. 9. 10.  ← 項目 4 がここに足す ────────────
     5.  tavern.html で非主人公のクラスタイルをクリックしても partyComposition が変わらない
     7.  [装置] ?herolock=0 を付けると 5. が **落ちる**
         ⭐ 5. と 7. は **同じ assert 本体**を共有すること。別々に書くと空振りする
            (実測済み: verify_save_slots.js の (7) 群と同じ作法)
     8.  [装置] title.html?title=0 は即座に tavern.html へ抜ける。かつ 1.〜4. が **落ちる**
     9.  幅 390px (compact) と横長デスクトップの **両方**で横スクロールが出ない
         → openPage(path, { viewport: {...} }) を使う。⚠ 片方だけで測って欠陥を 2 つ見逃した前例あり
     10. 最初のタップで GameAudio.unlock() が呼ばれる / BGM は鳴らない */

  check('(Z) pageerror ゼロ', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 5)));

  await browser.close();
  srv.close();
  const ok = results.filter(r => r.ok).length;
  console.log('\n[title-screen] RESULT: ' + ok + '/' + results.length + ' passed');
  if (ok !== results.length) {
    console.log('[title-screen] NG: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(3); });
