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
        // 生の文言も持ち帰る。受入条件 2. が「カードの表示が元データそのものか」を
        // **写経なしで**突き合わせるのに使う (期待値は元データから組み立てる)。
        tagline: c.tagline, role: c.role, note: c.note,
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

/* title.html の画面 1 (スロット選択) を丸ごと写し取る。判定は 1 つも持たない。
   ⚠ DOM 側 (.slotCard) と API 側 (DFSlots.list()) の **両方**を採る。
      片方だけだと「描画は正しいが API が別物を返している」「その逆」が区別できない。 */
function probeTitleSlots() {
  var out = { threw: '', ranToEnd: false, href: location.href, search: location.search };
  var vis = function (e) { return !!e && getComputedStyle(e).display !== 'none'; };
  try {
    var ss = document.getElementById('screenSlots');
    var sn = document.getElementById('screenNaming');
    out.screenSlots  = !!ss && ss.classList.contains('active');
    out.screenNaming = !!sn && sn.classList.contains('active');
    out.errorShown = vis(document.getElementById('slotError'));
    out.cards = [].slice.call(document.querySelectorAll('#slotList .slotCard')).map(function (c) {
      return {
        slot: c.getAttribute('data-slot'),
        empty: c.getAttribute('data-empty') === '1',
        emptyLabel: ((c.querySelector('.slotEmptyLabel') || {}).textContent || ''),
        metaFields: [].slice.call(c.querySelectorAll('.slotMetaRow')).map(function (r) {
          return { field: r.getAttribute('data-field'), value: ((r.querySelector('.v') || {}).textContent || '') };
        }),
        acts: [].slice.call(c.querySelectorAll('button[data-act]')).map(function (b) {
          return { act: b.getAttribute('data-act'), label: b.textContent };
        }),
      };
    });
    out.list = (window.DFSlots ? DFSlots.list() : null);   // 別経路 (API 側の実際の答え)
    out.hasDFSlots = !!window.DFSlots;
    out.ranToEnd = true;
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
}

/* title.html の画面 2 (名乗り) を写し取る。判定は 1 つも持たない。
   ⚠ .classDetail は選択されたカードでだけ表示されるが、textContent は非表示でも読める。
      「開いているか」は display で、「中身が正しいか」は textContent で別々に測る。 */
function probeNaming() {
  var out = { threw: '', ranToEnd: false };
  var vis = function (e) { return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; };
  var txt = function (e) { return (e && e.textContent) || ''; };
  try {
    var sn = document.getElementById('screenNaming');
    var ss = document.getElementById('screenSlots');
    out.namingActive = !!sn && sn.classList.contains('active');
    out.slotsActive  = !!ss && ss.classList.contains('active');
    out.heading = txt(document.getElementById('namingTitle'));
    var warn = document.getElementById('classWarn');
    out.warnText = txt(warn);
    out.warnVisible = vis(warn);
    var dep = document.getElementById('btnDepart');
    out.departDisabled = !!dep && dep.disabled;
    out.departLabel = txt(dep);
    out.cards = [].slice.call(document.querySelectorAll('#classCards .classCard')).map(function (c) {
      var det = c.querySelector('.classDetail');
      return {
        classKey: c.getAttribute('data-class-key'),
        selected: c.classList.contains('selected'),
        detailOpen: !!det && getComputedStyle(det).display !== 'none',
        name:    txt(c.querySelector('.className')),
        tagline: txt(c.querySelector('.classTagline')),
        zone:    txt(c.querySelector('.classZone')),
        role:    txt(c.querySelector('.classRole')),
        note:    txt(c.querySelector('.classNote')),
      };
    });
    out.ranToEnd = true;
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
}

/* tavern.html に着いた瞬間の状態。判定は 1 つも持たない。
   ⚠⚠ #prologueOverlay は 前口上 / 受注 / 闇市 / 準備画面オンボーディング の **共用器**。
      「表示されている」だけを採ると別用途でも緑になるので、用途を切り分けられる材料
      (quest-accept の有無 / dmHint の show / dmBody の実文 / prologueSeen) を全部採る。
   ⚠ dragonfighters.partyComposition は localStorage と sessionStorage の **両方**に同名で存在する
      (session 側は tavern.html:5179/5233 が出発時に書く別物)。両方採って取り違えを防ぐ。 */
function probeTavernArrival() {
  var out = { threw: '', ranToEnd: false, href: location.href, pathname: location.pathname, search: location.search };
  try {
    out.pcLocal      = localStorage.getItem('dragonfighters.partyComposition');
    out.pcSession    = sessionStorage.getItem('dragonfighters.partyComposition');
    out.xp           = localStorage.getItem('dragonfighters.xp');
    out.gold         = localStorage.getItem('dragonfighters.gold');
    out.prologueSeen = localStorage.getItem('dragonfighters.prologueSeen');
    out.activeSlot   = localStorage.getItem('df.activeSlot');
    var ov = document.getElementById('prologueOverlay');
    out.hasOverlay     = !!ov;
    out.overlayVisible = !!ov && getComputedStyle(ov).display !== 'none';
    out.questAccept    = !!ov && ov.classList.contains('quest-accept');
    var hint = document.getElementById('dmHint');
    out.hintShown = !!hint && hint.classList.contains('show');
    out.bodyText  = (document.getElementById('dmBody') || {}).textContent || '';
    // 本番の前口上テキスト。classic script 直下の const なので **裸の識別子**でしか読めない
    try { out.prologueParas = PROLOGUE_NARRATION.slice(); }
    catch (e2) { out.prologueThrew = String((e2 && e2.message) || e2); }
    // 酒場が **実際に採用した**主人公 (loadSelections() を通った後の値)。キーの存在より一段強い
    try { out.heroInTavern = selection.partyComposition[0]; }
    catch (e3) { out.heroThrew = String((e3 && e3.message) || e3); }
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
        → **document-start** で purge する。ページ内スクリプトより前に走るのが要点。

     ⚠⚠⚠ **purge は「1 タブにつき 1 回だけ」**。ここは素直に書くと必ず転ぶ:
        evaluateOnNewDocument は goto の時だけでなく **そのタブで新しい document が
        できるたび** (= location.href による遷移でも) 再実行される。毎回 purge すると
        title.html が書いた dragonfighters.partyComposition を、遷移先 tavern.html の
        document-start が消してしまい、受入条件 2./3. が **原理的に測れなくなる**
        (しかも「title が書いていない」ように見える偽の赤になる)。
        → 2 つの接頭辞のどちらにも当たらないマーカーを sessionStorage に置いて 1 回に絞る。
          sessionStorage はタブ単位なので、openPage() のたびに新しいタブ = 必ず 1 回は purge される。
          ⚠ DFSlots.wipeLive() が消すのは dragonfighters.* だけなのでマーカーは巻き添えにならない。

     opts.prologueSeen  既定 true = 前口上を出さない。⚠ 受入条件 2. を測るときだけ false にする
                        (前口上が出ることそのものが受入条件なので)
     opts.seed          purge の直後に localStorage へ書く { key: value }。
                        「進行のある状態」を人工的に作る口 (受入条件 1. の負のコントロール等)
     opts.viewport      受入条件 9. で 390px と横長デスクトップの両方を測るための口 (項目 4 の担当) */
  const PURGE_MARK = '__dfPurgedOnce';
  async function openPage(pathQuery, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    if (opts.viewport) await page.setViewport(opts.viewport);
    page.on('pageerror', e => pageErrors.push(pathQuery + ' :: ' + e.message));
    await page.evaluateOnNewDocument((cfg) => {
      try {
        if (sessionStorage.getItem(cfg.mark)) return;   // ★ このタブでは purge 済み。遷移先を荒らさない
        var kill = function (store) {
          Object.keys(store).forEach(function (k) {
            if (k.indexOf('df.') === 0) store.removeItem(k);
            if (k.indexOf('dragonfighters.') === 0) store.removeItem(k);
          });
        };
        kill(localStorage); kill(sessionStorage);
        if (cfg.seen) localStorage.setItem('dragonfighters.prologueSeen', '1');
        Object.keys(cfg.seed || {}).forEach(function (k) { localStorage.setItem(k, cfg.seed[k]); });
        sessionStorage.setItem(cfg.mark, '1');
      } catch (e) {}
    }, { mark: PURGE_MARK, seen: opts.prologueSeen !== false, seed: opts.seed || {} });
    await page.goto('http://localhost:' + PORT + pathQuery, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(opts.settle || 800);
    return page;
  }

  const URL_OF = (p) => 'http://localhost:' + PORT + p;

  /* クリックして **遷移が完了するまで** 待つ。
     ⚠ 固定 sleep で代用しない。遷移や描画の所要時間は端末速度で伸び縮みするので、
        固定時間窓は健全な分布が窓をまたいだ瞬間に間欠フレークになる (実測済みの罠)。 */
  async function clickAndNavigate(page, selector) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click(selector),
    ]);
    await sleep(600);   // 遷移先の同期スクリプト完走ぶん。以降の待ちは全てポーリング
  }

  /* 受入条件 6. でブラウザから読み取った HERO_CLASSES の実体。受入条件 1.〜3. が
     **期待値をドライバに書き写さない**ために借りる (職業の日本語名・tagline・role・note・zone)。
     ⭐ 期待値は「実装が書いた数字」ではなく **元データ**から組み立てるのが規則。 */
  let heroClassesObs = null;

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
    heroClassesObs = obsB.classes || null;   // 受入条件 1.〜3. が期待値を借りる元データ

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

  /* ■ SECTION 受入条件 1.〜3. ─────────────────────────────────────────────
     ⬜ 4. (埋まったスロットの 2 段タップ確認) は **項目 3 がこの下に足す**。
        1 タップ目で .slotConfirm に確認行が出て消えない / 2 タップ目で消える、を測ること。
        ⚠ 下の (3) の一周は **空のスロット2** の「はじめから」しか押していないので、
          項目 3 が「埋まったスロットだけ 2 段タップ」を足しても壊れない (意図的にそう組んである)。 */

  /* ══════════════════════════════════════════════════════════════════════
   * 受入条件 1. : 全消し状態で スロット 3 枚が「記録なし」+「はじめから」だけ
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 受入条件 1. : title.html が全消し状態でスロット 3 枚を描く ---');
  {
    /* ⚠⚠⚠ **`{ prologueSeen: false }` は飾りではない。外すとこのテストは赤くなる。**
       openPage() の既定は dragonfighters.prologueSeen = "1" を仕込む。ところが
       DFSlots が「空スロット」を判定する規則は *KEEP を除いた dragonfighters.* が 1 件でもあるか*
       (js/save-slots.js の liveHasData / slotHasData のコメントに明記) なので、
       **prologueSeen が 1 件あるだけで active スロットは empty:false になる**。
       つまり「全消し状態」を作るには前口上フラグも置いてはいけない。
       この結合そのものは下の (1n3) が機械的に押さえてある (外した人がログで理由に辿り着けるように)。 */
    const p1 = await openPage('/title.html', { prologueSeen: false });
    const o1 = await p1.evaluate(probeTitleSlots);
    await p1.close();

    console.log('  [DOM] ' + JSON.stringify((o1.cards || []).map(c =>
      ({ slot: c.slot, empty: c.empty, acts: c.acts.map(a => a.label) }))));
    console.log('  [API] DFSlots.list() = ' + JSON.stringify(o1.list));

    check('(1z0) [装置] title.html が例外なく描き終えた (スロット画面が active・エラー表示なし・DFSlots が居る)',
      o1.threw === '' && o1.ranToEnd === true && o1.screenSlots === true
        && o1.screenNaming === false && o1.errorShown === false && o1.hasDFSlots === true,
      JSON.stringify({ threw: o1.threw, screenSlots: o1.screenSlots, errorShown: o1.errorShown, hasDFSlots: o1.hasDFSlots }));

    check('(1z1) [装置] 前提の「全消し」が実際に成立している (DFSlots.list() が 3 件とも empty)',
      Array.isArray(o1.list) && o1.list.length === 3 && o1.list.every(r => r.empty === true),
      JSON.stringify(o1.list && o1.list.map(r => ({ slot: r.slot, empty: r.empty, active: r.active }))));

    check('(1) ★受入条件1: スロットを 3 枚描き、3 枚とも「記録なし」+「はじめから」だけ',
      (o1.cards || []).length === 3
        && o1.cards.every(c => c.empty === true)
        && o1.cards.every(c => c.emptyLabel.indexOf('記録なし') >= 0)
        && o1.cards.every(c => c.metaFields.length === 0)
        && o1.cards.every(c => c.acts.length === 1 && c.acts[0].act === 'new' && c.acts[0].label === 'はじめから'),
      JSON.stringify({ n: (o1.cards || []).length,
                       labels: (o1.cards || []).map(c => c.emptyLabel),
                       acts: (o1.cards || []).map(c => c.acts.map(a => a.act + ':' + a.label)) }));

    check('(1b) スロット番号が 1 / 2 / 3 の 3 枚 (重複も欠番もない)',
      (o1.cards || []).map(c => c.slot).join(',') === '1,2,3',
      JSON.stringify((o1.cards || []).map(c => c.slot)));

    /* ── 負のコントロール ─────────────────────────────────────────────
       「記録なし」も「はじめから 1 個だけ」も **固定文言ではない**ことの証明。
       ライブ名前空間に進行を仕込んで開くと active スロットだけが埋まり、
       「つづきから」が生えて meta 5 行が出るはず。ここが緑にならないなら (1) は何も測っていない。 */
    const SEED_GOLD = '777';
    const NEG_HERO = 'rogue';
    const p1n = await openPage('/title.html', { seed: {
      'dragonfighters.xp': '12345',
      'dragonfighters.gold': SEED_GOLD,
      'dragonfighters.partyComposition': JSON.stringify([NEG_HERO]),
    } });
    const o1n = await p1n.evaluate(probeTitleSlots);
    await p1n.close();

    const filled  = (o1n.cards || []).filter(c => !c.empty);
    const stillEmpty = (o1n.cards || []).filter(c => c.empty);
    check('(1n1) [負のコントロール] 進行を仕込むと 1 枚だけ埋まり「つづきから」+「はじめから(上書き)」が生える',
      (o1n.cards || []).length === 3 && filled.length === 1 && stillEmpty.length === 2
        && filled[0].acts.map(a => a.act).sort().join(',') === 'continue,new'
        && filled[0].emptyLabel === ''
        && filled[0].metaFields.length === 5
        && stillEmpty.every(c => c.acts.length === 1 && c.acts[0].act === 'new'),
      JSON.stringify({ filled: filled.map(c => ({ slot: c.slot, acts: c.acts.map(a => a.label) })),
                       meta: (filled[0] || {}).metaFields }));

    /* 埋まったカードの中身が **仕込んだ値そのもの** かを、期待値を書き写さずに測る。
       職業の日本語名は hero-classes.js (heroClassesObs) から借りる。 */
    const mv = ((filled[0] || {}).metaFields || []).reduce((m, f) => (m[f.field] = f.value, m), {});
    const negName = ((heroClassesObs || []).find(c => c.classKey === NEG_HERO) || {}).name;
    check('(1n2) [負のコントロール] 埋まったカードの主人公名 / 所持金が仕込んだ値と一致 (プレースホルダではない)',
      !!negName && mv.hero === negName && (mv.gold || '').indexOf(SEED_GOLD) >= 0
        && (mv.savedAt || '').length > 1 && (mv.level || '').length > 1 && (mv.cleared || '').length > 0,
      JSON.stringify({ expectHero: negName, got: mv }));

    /* ── ⚠ 罠の明文化 (項目 3 / 4 が同じところで転ばないように) ────────────
       DFSlots の「空」の規則は *KEEP を除いた dragonfighters.* が 1 件でもあるか* なので、
       **前口上フラグ 1 個だけでも active スロットは「記録あり」になる**。
       openPage() の既定はそのフラグを仕込むため、上の (1) は必ず { prologueSeen: false } で
       開かなければならない。この 1 本があると、誰かがそれを外したときに
       「(1) が赤い理由」がログの中で自己完結する。 */
    const p1s = await openPage('/title.html');   // ← 既定 = prologueSeen を仕込む
    const o1s = await p1s.evaluate(probeTitleSlots);
    await p1s.close();
    const activeRow = ((o1s.list || []).find(r => r.active) || {});
    check('(1n3) [罠の明文化] 前口上フラグだけでも active スロットは「記録あり」になる (= 全消しは prologueSeen も無い状態)',
      Array.isArray(o1s.list) && o1s.list.length === 3 && activeRow.empty === false
        && (o1s.list || []).filter(r => !r.active).every(r => r.empty === true),
      JSON.stringify((o1s.list || []).map(r => ({ slot: r.slot, active: r.active, empty: r.empty }))));
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 受入条件 2. : 新規の一周 (スロット1「はじめから」→ 名乗り → 確定 → 酒場 + 前口上)
   * ⚠ 内部関数を直接呼ばない。**実際にクリックして遷移した先の状態**だけを測る。
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 受入条件 2. : 新規の一周 (はじめから → 名乗り → 旅立つ → 酒場 + 前口上) ---');
  {
    const HERO_KEY = 'rogue';   // 依頼書が名指ししている職業
    const src = (heroClassesObs || []).find(c => c.classKey === HERO_KEY) || null;

    // ⚠ 前口上が出ることそのものが受入条件なので prologueSeen を仕込まない
    const p2 = await openPage('/title.html', { prologueSeen: false });

    // ── ① スロット1 の「はじめから」を押す ──────────────────────────
    await p2.click('#slotList .slotCard[data-slot="1"] button[data-act="new"]');
    await p2.waitForFunction(() => {
      var e = document.getElementById('screenNaming'); return !!e && e.classList.contains('active');
    }, { timeout: 10000 });
    const nam0 = await p2.evaluate(probeNaming);

    check('(2a) 名乗り画面が開き、カードが 6 枚出て、未選択では「この者として旅立つ」が押せない',
      nam0.threw === '' && nam0.namingActive === true && nam0.slotsActive === false
        && (nam0.cards || []).length === 6 && nam0.departDisabled === true
        && nam0.heading.indexOf('汝は何者か') >= 0,
      JSON.stringify({ n: (nam0.cards || []).length, departDisabled: nam0.departDisabled, heading: nam0.heading }));

    check('(2b) 1 タップ前は どのカードの zone / role / note も開いていない (詩だけが見えている)',
      (nam0.cards || []).length === 6
        && nam0.cards.every(c => c.detailOpen === false && c.selected === false)
        && nam0.cards.every(c => c.tagline.length > 0),
      JSON.stringify((nam0.cards || []).map(c => ({ k: c.classKey, open: c.detailOpen, sel: c.selected }))));

    // ── ② 1 タップ目: rogue を選ぶ ────────────────────────────────
    await p2.click('#classCards .classCard[data-class-key="' + HERO_KEY + '"]');
    await p2.waitForFunction((k) => {
      var c = document.querySelector('#classCards .classCard[data-class-key="' + k + '"]');
      return !!c && c.classList.contains('selected');
    }, { timeout: 10000 }, HERO_KEY);
    const nam1 = await p2.evaluate(probeNaming);
    const picked = (nam1.cards || []).find(c => c.classKey === HERO_KEY) || {};
    const others = (nam1.cards || []).filter(c => c.classKey !== HERO_KEY);

    check('(2c) 1 タップ目で押したカードだけが選択状態になり zone / role / note が開く。確定ボタンが有効化される',
      picked.selected === true && picked.detailOpen === true
        && picked.zone.length > 0 && picked.role.length > 0 && picked.note.length > 0
        && others.length === 5 && others.every(c => c.selected === false && c.detailOpen === false)
        && nam1.departDisabled === false,
      JSON.stringify({ picked: { sel: picked.selected, open: picked.detailOpen, zone: picked.zone, role: picked.role },
                       othersOpen: others.filter(c => c.detailOpen).map(c => c.classKey),
                       departDisabled: nam1.departDisabled }));

    check('(2d) カード群の下の「後から変えられません」の 1 行が **常時** 出ている (選択後も消えない)',
      nam1.warnVisible === true && nam0.warnVisible === true
        && nam1.warnText.indexOf('後から変えられません') >= 0
        && nam1.warnText.indexOf('はじめから') >= 0,
      JSON.stringify({ visibleBefore: nam0.warnVisible, visibleAfter: nam1.warnVisible, text: nam1.warnText }));

    /* zone の表示ラベルが HERO_CLASSES の zone と 1 対 1 で対応しているか。
       ⚠ 期待値 (「前衛」等) をここに書き写さない。同じ zone のカードは同じ表示、
          違う zone のカードは違う表示、という **構造だけ**で測る。
       ⚠⚠ zone の英語リテラルは (6z0) が禁じているので、値は heroClassesObs から借りる。 */
    const zoneLabelOf = {};
    let zoneMapOk = (nam1.cards || []).length === 6;
    (nam1.cards || []).forEach(c => {
      const s = (heroClassesObs || []).find(h => h.classKey === c.classKey);
      if (!s || !c.zone) { zoneMapOk = false; return; }
      if (zoneLabelOf[s.zone] === undefined) zoneLabelOf[s.zone] = c.zone;
      else if (zoneLabelOf[s.zone] !== c.zone) zoneMapOk = false;
    });
    const zoneLabels = Object.keys(zoneLabelOf).map(k => zoneLabelOf[k]);
    check('(2e) 6 枚の zone 表示が hero-classes.js の zone と 1 対 1 対応 (同 zone は同表示・異 zone は異表示)',
      zoneMapOk && zoneLabels.length >= 2 && zoneLabels.length === new Set(zoneLabels).size,
      JSON.stringify({ nGroups: zoneLabels.length, labels: zoneLabels }));

    /* カードの文言が hero-classes.js の値 **そのもの** か。title.html に写しを作っていない証明。 */
    const textDiffs = (nam1.cards || []).filter(c => {
      const s = (heroClassesObs || []).find(h => h.classKey === c.classKey);
      return !s || s.name !== c.name || s.tagline !== c.tagline || s.role !== c.role || s.note !== c.note;
    }).map(c => c.classKey);
    check('(2f) カードの name / tagline / role / note が hero-classes.js の値そのもの (title.html に写しが無い)',
      (nam1.cards || []).length === 6 && textDiffs.length === 0, JSON.stringify({ diffs: textDiffs }));

    // ── ③ 2 タップ目: 「この者として旅立つ」で確定 → 酒場へ ───────────
    await clickAndNavigate(p2, '#btnDepart');

    /* 前口上が出るまで **ポーリング**する。⚠ 固定 sleep に頼らない */
    let overlayCameUp = true;
    try {
      await p2.waitForFunction(() => {
        var o = document.getElementById('prologueOverlay');
        return !!o && getComputedStyle(o).display !== 'none';
      }, { timeout: 20000 });
    } catch (e) { overlayCameUp = false; }
    const o2 = await p2.evaluate(probeTavernArrival);

    console.log('  [到着] ' + o2.href);
    console.log('         localStorage  partyComposition = ' + JSON.stringify(o2.pcLocal));
    console.log('         sessionStorage partyComposition = ' + JSON.stringify(o2.pcSession) + '  (別物。読み違えると偽の緑/赤)');
    console.log('         酒場が採用した主人公 selection.partyComposition[0] = ' + JSON.stringify(o2.heroInTavern));
    console.log('         df.activeSlot = ' + JSON.stringify(o2.activeSlot) + ' / prologueSeen = ' + JSON.stringify(o2.prologueSeen));

    check('(2) ★受入条件2: 素の tavern.html に着き localStorage の partyComposition が選んだ職 1 人だけになっている',
      /\/tavern\.html$/.test(o2.pathname) && o2.search === ''
        && o2.pcLocal === JSON.stringify([HERO_KEY])
        && o2.heroInTavern === HERO_KEY && o2.activeSlot === '1',
      JSON.stringify({ pathname: o2.pathname, search: o2.search, pcLocal: o2.pcLocal,
                       heroInTavern: o2.heroInTavern, heroThrew: o2.heroThrew, activeSlot: o2.activeSlot }));

    check('(2g) [設計] 遷移先にクエリを足していない (酒場の入口を 2 種類にしない)',
      o2.search === '', JSON.stringify({ href: o2.href }));

    check('(2p) ★受入条件2: 前口上が出ている。共用器の別用途ではない (quest-accept 無し + 開始ヒント表示 + prologueSeen 未設定)',
      overlayCameUp === true && o2.overlayVisible === true && o2.questAccept === false
        && o2.hintShown === true && o2.prologueSeen === null,
      JSON.stringify({ cameUp: overlayCameUp, visible: o2.overlayVisible, questAccept: o2.questAccept,
                       hintShown: o2.hintShown, prologueSeen: o2.prologueSeen }));

    /* ★ 共用器の 4 用途を確実に切り分ける最後の一手:
         オーバーレイをクリックして、実際に語り出した本文が本番の PROLOGUE_NARRATION[0] の頭かを見る。
       ⚠ 期待文をドライバに書き写さない。tavern.html から **裸の識別子**で読んだ値と比べる。 */
    let typed = '';
    try {
      await p2.click('#prologueOverlay');
      await p2.waitForFunction(() =>
        ((document.getElementById('dmBody') || {}).textContent || '').length >= 8, { timeout: 30000 });
      typed = await p2.evaluate(() => (document.getElementById('dmBody') || {}).textContent || '');
    } catch (e) { typed = ''; }
    const para0 = (o2.prologueParas || [])[0] || '';
    check('(2q) ★受入条件2: 語り出した本文が本番 PROLOGUE_NARRATION[0] の頭 (受注/闇市/準備オンボーディングではない)',
      para0.length > 0 && typed.length >= 8 && para0.indexOf(typed) === 0,
      JSON.stringify({ nParas: (o2.prologueParas || []).length, prologueThrew: o2.prologueThrew,
                       typed: typed.slice(0, 24), expectHead: para0.slice(0, 24) }));
    await p2.close();

    /* ── 負のコントロール ─────────────────────────────────────────────
       「#prologueOverlay が見えている」が固定の真ではないことの証明。
       prologueSeen を立てて **同じ入口**を踏むと、同じ器は出ない。 */
    const p2n = await openPage('/tavern.html', { prologueSeen: true });
    const o2n = await p2n.evaluate(probeTavernArrival);
    await p2n.close();
    check('(2n) [負のコントロール] prologueSeen を立てた酒場では同じ器が出ない (器は在るが非表示)',
      o2n.hasOverlay === true && o2n.overlayVisible === false && o2n.prologueSeen === '1',
      JSON.stringify({ hasOverlay: o2n.hasOverlay, visible: o2n.overlayVisible, seen: o2n.prologueSeen }));
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 受入条件 3. : 続きの一周
   *   スロット1 に進行を作り → スロット2 で別主人公の新規 → title へ戻って
   *   スロット1 の「つづきから」→ スロット1 の xp と主人公が戻る
   * ⚠ 全部 **同じタブ**で、実際のクリックと遷移だけで進める (内部関数を直接呼ばない)。
   *   openPage() の purge は 1 タブ 1 回なので、この往復の途中で記録が消えることはない。
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 受入条件 3. : 続きの一周 (スロット1 に進行 → スロット2 で別主人公 → スロット1 へ戻る) ---');
  {
    const HERO_A = 'warrior', HERO_B = 'mage';
    const XP_A = '23456', GOLD_A = '4321';
    const nameA = ((heroClassesObs || []).find(c => c.classKey === HERO_A) || {}).name;
    const nameB = ((heroClassesObs || []).find(c => c.classKey === HERO_B) || {}).name;

    const p3 = await openPage('/title.html');

    // ── ① スロット1 で HERO_A の新規 → 酒場 → そこに進行 (xp / gold) を作る ──
    await p3.click('#slotList .slotCard[data-slot="1"] button[data-act="new"]');
    await p3.waitForFunction(() => {
      var e = document.getElementById('screenNaming'); return !!e && e.classList.contains('active');
    }, { timeout: 10000 });
    await p3.click('#classCards .classCard[data-class-key="' + HERO_A + '"]');
    await clickAndNavigate(p3, '#btnDepart');
    await p3.evaluate((xp, g) => {
      localStorage.setItem('dragonfighters.xp', xp);
      localStorage.setItem('dragonfighters.gold', g);
    }, XP_A, GOLD_A);
    const s1 = await p3.evaluate(probeTavernArrival);

    check('(3z1) [装置] 1 周目: スロット1 で新規を始めて酒場に着き、そこへ進行を作れた',
      /\/tavern\.html$/.test(s1.pathname) && s1.pcLocal === JSON.stringify([HERO_A])
        && s1.heroInTavern === HERO_A && s1.activeSlot === '1',
      JSON.stringify({ pathname: s1.pathname, pcLocal: s1.pcLocal, hero: s1.heroInTavern, slot: s1.activeSlot }));

    // ── ② title へ戻る。スロット1 が埋まり HERO_A が出ているはず ──────
    await p3.goto(URL_OF('/title.html'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(600);
    const t1 = await p3.evaluate(probeTitleSlots);
    const c1 = (t1.cards || []).find(c => c.slot === '1') || {};
    const heroOf = (card) => (((card.metaFields || []).find(f => f.field === 'hero') || {}).value || '');

    check('(3z2) [装置] title に戻るとスロット1 だけが埋まり、1 周目の主人公が一覧に出る',
      (t1.cards || []).length === 3 && c1.empty === false && !!nameA && heroOf(c1) === nameA
        && c1.acts.some(a => a.act === 'continue')
        && (t1.cards || []).filter(c => !c.empty).length === 1,
      JSON.stringify({ slot1: { empty: c1.empty, hero: heroOf(c1), acts: (c1.acts || []).map(a => a.act) },
                       expectHero: nameA }));

    // ── ③ スロット2 で HERO_B の新規 → 酒場 ───────────────────────────
    //    ⚠ スロット2 は **空** なので 1 タップで進む。項目 3 が「埋まったスロットだけ 2 段タップ」を
    //      足してもこの経路は影響を受けない (意図的にそう組んである)
    await p3.click('#slotList .slotCard[data-slot="2"] button[data-act="new"]');
    await p3.waitForFunction(() => {
      var e = document.getElementById('screenNaming'); return !!e && e.classList.contains('active');
    }, { timeout: 10000 });
    await p3.click('#classCards .classCard[data-class-key="' + HERO_B + '"]');
    await clickAndNavigate(p3, '#btnDepart');
    const s2 = await p3.evaluate(probeTavernArrival);

    /* ★ ここが無いと (3) は空振りする。切り替えが起きていなければ「戻った」も自明に緑になる。 */
    check('(3z3) [装置] スロット2 の新規でライブが入れ替わった (1 周目の xp が消え・主人公が変わり・active が 2)',
      s2.activeSlot === '2' && s2.xp === null && s2.pcLocal === JSON.stringify([HERO_B])
        && s2.heroInTavern === HERO_B,
      JSON.stringify({ activeSlot: s2.activeSlot, xp: s2.xp, pcLocal: s2.pcLocal, hero: s2.heroInTavern }));

    // ── ④ title へ戻る。2 枚とも埋まり、別々の主人公が並ぶ ────────────
    await p3.goto(URL_OF('/title.html'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(600);
    const t2 = await p3.evaluate(probeTitleSlots);
    const a1 = (t2.cards || []).find(c => c.slot === '1') || {};
    const a2 = (t2.cards || []).find(c => c.slot === '2') || {};

    check('(3z4) [装置] 一覧にスロット1 / スロット2 が別々の主人公で並ぶ (アーカイブが上書きされていない)',
      a1.empty === false && a2.empty === false && !!nameA && !!nameB
        && heroOf(a1) === nameA && heroOf(a2) === nameB
        && a1.acts.some(x => x.act === 'continue'),
      JSON.stringify({ slot1: heroOf(a1), slot2: heroOf(a2), expect: [nameA, nameB] }));

    // ── ⑤ スロット1 の「つづきから」 ────────────────────────────────
    await clickAndNavigate(p3, '#slotList .slotCard[data-slot="1"] button[data-act="continue"]');
    const s3 = await p3.evaluate(probeTavernArrival);
    await p3.close();

    console.log('  [復帰] xp=' + JSON.stringify(s3.xp) + ' gold=' + JSON.stringify(s3.gold)
      + ' hero=' + JSON.stringify(s3.heroInTavern) + ' activeSlot=' + JSON.stringify(s3.activeSlot));

    check('(3) ★受入条件3: スロット1 の「つづきから」で xp と主人公が戻る',
      /\/tavern\.html$/.test(s3.pathname) && s3.search === ''
        && s3.xp === XP_A && s3.gold === GOLD_A
        && s3.pcLocal === JSON.stringify([HERO_A]) && s3.heroInTavern === HERO_A
        && s3.activeSlot === '1',
      JSON.stringify({ xp: s3.xp, expectXp: XP_A, gold: s3.gold, pcLocal: s3.pcLocal,
                       hero: s3.heroInTavern, activeSlot: s3.activeSlot, search: s3.search }));
  }

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
