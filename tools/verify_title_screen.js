/*
 * tools/verify_title_screen.js — タイトル画面 title.html の検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/完了/2026-08-20_title-screen.md` の受入条件を測る。
 *
 *   node tools/verify_title_screen.js [--headful] [--port N]
 *
 * ── 実装状況 (段階的に足していく骨組み) ────────────────────────────────────
 *   ✅ 受入条件 6.  : hero-classes.js の zone と tavern.html の PARTY_ZONES の突き合わせ
 *   ✅ 受入条件 1.〜3.: title.html のスロット選択 / 名乗り / 続きの一周
 *   ✅ 受入条件 4.    : 埋まったスロットの 2 段タップ確認 + 8 秒で安全側へ自動復帰
 *   ✅ 受入条件 5. 7. : tavern.html のクラス変更封印 と ?herolock=0 の装置 assert
 *   ✅ 受入条件 8.    : ?title=0 の装置 assert (1.〜4. の判定関数を共有して落とす)
 *   ✅ 実装ステップ 5.: ゲームを起動.vbs の飛び先が /title.html で、実際に立つこと
 *   ✅ 受入条件 9.    : 390px / 横長デスクトップ / 境界 720px の 3 幅 × 3 状態で横スクロールなし
 *   ✅ 受入条件 10.   : 最初のタップで GameAudio.unlock() が 1 回 / BGM は title で 1 回 (#20 で反転)
 *   ⬜ 受入条件 11.   : 既存 golden ドライバの非退行 (**本ドライバの外**で回す)
 *      → driver_dev_gate / driver_depart_menu_clean / verify_save_slots / driver_grid_p8 ほか。
 *        tavern.html の DOM を触っているが canvas の SHA しか見ない golden では検出できないので、
 *        タイルの class と click リスナは 5b / 7b が直接測っている。
 *   共通の道具は openPage() / check() / results / pageErrors。新しいセクションはそれを使い回すこと。
 *
 * ── ⭐⭐⭐ 判定本体の共有 (受入条件 7. / 8. の要) ────────────────────────────
 *   「スイッチを外すと赤」は **assert 本体を共有しないと空振りする**。判定式をその場に
 *   直書きすると「要素が無い → false → たまたま赤」になり、何も証明できない (依頼書 #5 で実測)。
 *     受入条件 1.〜4. → judgeSlotsScreen / judgeNewGameRound / judgeContinueRound / judgeConfirmArmed
 *     受入条件 5. 7.  → judgeHeroUnchanged (+ 手順そのものも runHeroTileClick で共有)
 *   本番セクションは戻り値を PROD_VERDICT に残し、?title=0 のセクションが
 *   **同じ関数・同じ入力** で false を得る。conjunction (AND) と (8z1) が対で証明する。
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
 * 受入条件 1. / 2. / 3. / 4. の **判定本体** (Node 側・純関数)
 * ══════════════════════════════════════════════════════════════════════════
 * ⭐⭐⭐ ここが受入条件 8. の要。**「スイッチを外すと赤」は assert 本体を共有しないと空振りする。**
 *   ?title=0 では title.html の要素が 1 つも無いので、判定を **その場に直書き**すると
 *   「要素が無い → false → たまたま赤」になり、**何も証明できない**。
 *   (依頼書 #5 で実測済み: 別々に書いた結果 keysEqual:true の空振りを踏み、
 *    conjunction にして初めて 4/4 赤になった)
 *
 *   → 1.〜4. の判定式をこの 4 本に括り出し、
 *       本番のセクション と ?title=0 のセクション が **同じ関数オブジェクト**を呼ぶ。
 *       さらに 8. は 4 本の戻り値の **AND (状態の conjunction)** で測る。
 *   → 「共有が空振りしていない」ことは (8z1) が押さえる:
 *       同じ 4 本が **本番では true を返した**という記録 (PROD_VERDICT) と突き合わせる。
 *       全部 false を返すだけの壊れた関数なら (8z1) が赤くなる。
 *
 * ⚠ 判定に使う期待値 (職業名など) は呼び出し側が渡す。ここに書き写さない。
 */

/* 受入条件 1. : 全消しの title.html がスロット 3 枚を「記録なし」+「はじめから」だけで描く */
function judgeSlotsScreen(o) {
  if (!o) return false;
  const cards = o.cards || [];
  return o.threw === '' && o.ranToEnd === true
    && o.screenSlots === true && o.screenNaming === false && o.errorShown === false
    && cards.length === 3
    && cards.every(c => c.empty === true)
    && cards.every(c => (c.emptyLabel || '').indexOf('記録なし') >= 0)
    && cards.every(c => (c.metaFields || []).length === 0)
    && cards.every(c => (c.acts || []).length === 1 && c.acts[0].act === 'new' && c.acts[0].label === 'はじめから');
}

/* 受入条件 2. : 新規の一周が素の tavern.html に着き、選んだ職 1 人だけが localStorage に入る */
function judgeNewGameRound(o, heroKey) {
  if (!o) return false;
  return /\/tavern\.html$/.test(o.pathname || '') && o.search === ''
    && o.pcLocal === JSON.stringify([heroKey])
    && o.heroInTavern === heroKey && o.activeSlot === '1';
}

/* 受入条件 3. : スロット1 の「つづきから」で xp / gold / 主人公 が戻る
   ⚠⚠⚠ **`pressedContinue` を必ず要求する。** 「つづきから」を押していないのに
     たまたま同じ値が入っている状態 (例: ライブに同じ進行を仕込んで酒場を直接開いた)
     と区別できないと、受入条件 8. の負のコントロールが偽の赤になる (実測で踏んだ)。
     ボタンを押したという事実は runContinueRound() が観測値として載せてくる。 */
function judgeContinueRound(o, heroKey, xp, gold) {
  if (!o) return false;
  return o.pressedContinue === true
    && /\/tavern\.html$/.test(o.pathname || '') && o.search === ''
    && o.xp === xp && o.gold === gold
    && o.pcLocal === JSON.stringify([heroKey]) && o.heroInTavern === heroKey
    && o.activeSlot === '1';
}

/* 受入条件 4. : 埋まったスロットの「はじめから」1 タップ目 = 確認行が出るだけで、記録は無傷
   ⚠ 「確認行が出た」だけでは足りない。**名乗りへ進んでいない** ことと
      **保存領域が 1 バイトも変わっていない** ことを同じ判定に畳む
      (見た目だけ確認行で、裏で消えていたら赤にしたい)。
   live0 = 1 タップ目の直前に採った live のスナップショット。 */
function judgeConfirmArmed(o, slot, live0) {
  if (!o || !live0) return false;
  const card = (o.cards || []).find(c => c.slot === String(slot));
  if (!card) return false;
  const cf = card.confirm || {};
  const acts = (cf.btns || []).map(b => b.act).sort().join(',');
  return o.threw === ''
    && o.screenSlots === true && o.screenNaming === false     // ★ 名乗りへ進んでいない
    && card.empty === false
    && cf.visible === true
    && (cf.text || '').indexOf('このスロットの記録を消して最初から始めます') >= 0
    && acts === 'confirm-cancel,confirm-yes'
    // ★ 記録が無傷 (1 タップでは消えない)
    && o.live.xp === live0.xp && o.live.gold === live0.gold
    && o.live.pc === live0.pc && o.live.activeSlot === live0.activeSlot;
}

/* 受入条件 5. / 7. : 非主人公タイルをクリックしても主人公が変わらない
   ⭐ 5. (通常時 = true であること) と 7. (?herolock=0 では false になること) が
      **この 1 本を共有**する。別々に書くと「両方とも間違っている」事故を防げない。
   ⚠ selection (酒場が実際に採用した値) と localStorage の両方を見る。
      selectHero() は selection を書いてから saveSelections() を呼ぶので、
      片方だけだと「途中で落ちた」状態を取りこぼす。 */
function judgeHeroUnchanged(pre, post) {
  if (!pre || !post) return false;
  return pre.threw === '' && post.threw === ''
    && typeof pre.hero === 'string' && pre.hero.length > 0
    && post.hero === pre.hero && post.pc === pre.pc;
}

/* 受入条件 9. : 横スクロールが出ていない
   ⚠⚠ 条件は「**横**スクロールを出さずに」。**縦スクロールは禁じない**
      (390x844 では実測で縦 892px = わずかに出るが、これは可)。→ scrollHeight を一切見ない。
   ⭐ 3 つの物差しを AND で束ねる。1 本だけだと「見え方の一部」しか測れない:
        ① documentElement.scrollWidth <= clientWidth   … 依頼書の文言そのもの
        ② body.scrollWidth <= clientWidth              … 器が違えば別の答えが出る
        ③ #titleRoot 配下に「端をはみ出した要素」が 1 つも無い … 赤のとき原因が特定できる
      ③ を入れないと「総量は収まっているが 1 要素だけ画面外」が緑になる。
   ⚠⚠⚠ **`window.scrollTo(9999,y)` 後の scrollX は判定に使わない (使ってはいけない)。**
      「実際に横へスクロールできてしまうか」は一見いちばん体感に近い物差しに見えるが、
      puppeteer の `isMobile: true` (= iPhone 相当のエミュレーション) では
      **200px のスクロール可能な溢れがあっても scrollX が 0 のまま**になる (実測)。
      モバイル側では原理的に一度も反応しない = AND に混ぜると「永久に緑の飾り」になる。
      → 観測値としては採って **ログには出す**が、judge には入れない。
      (この事実は (9n) の負のコントロールが compact 390 で赤を出したことで発覚した)
   ⭐ この 1 本を **全ビューポート × 全画面 と 負のコントロールが共有**する。 */
function judgeNoHScroll(o) {
  if (!o) return false;
  return o.threw === '' && o.ranToEnd === true
    && o.clientWidth > 0
    && o.scrollWidth <= o.clientWidth
    && o.bodyScrollWidth <= o.clientWidth
    && (o.overflowers || []).length === 0;
}

/* ⚠ 「空っぽのページには横スクロールが出ない」で緑になる穴を塞ぐ装置判定。
   測りたいのは「スロット 3 枚とクラスカード 6 枚が収まる」ことなので、
   **その 3 枚 / 6 枚が本当にそこに在る**ことを状態ごとに要求する。
     'slots'  … 画面 1 / 空 3 枚
     'armed'  … 画面 1 / 埋 3 枚 + 確認行が開いている (いちばん横幅が要る状態)
     'naming' … 画面 2 / カード 6 枚 + 1 枚だけ詳細が開いている */
function judgeLayoutPopulated(o, kind) {
  if (!o) return false;
  if (kind === 'slots')  return o.screenSlots === true && o.nSlotCards === 3 && o.nFilledCards === 0;
  if (kind === 'armed')  return o.screenSlots === true && o.nSlotCards === 3
                             && o.nFilledCards === 3 && o.nConfirmBtns === 2;
  if (kind === 'naming') return o.screenNaming === true && o.nClassCards === 6 && o.nOpenDetails === 1;
  return false;
}

/* 受入条件 10. : 最初のタップで GameAudio.unlock() が 1 回 / BGM が title でちょうど 1 回
   ⚠⚠ 「playBgm の回数」は **スパイの掛け損ね**でも辻褄が合ってしまう。ここは 3 段で塞ぐ:
       ① installed.playBgm === true      … 実際に包めた (関数が存在した)
       ② unlockAfter === 1               … **同じスパイ機構**が数えられている
       ③ 呼び出し側が最後に手で playBgm を叩き、その 1 本が数えられる (負のコントロール)
     ③ は呼び出し側の別 assert。ここでは ①② と回数/ID を束ねる。

   ⚠⚠⚠ 【依頼書 #20 で反転】Phase 1 の「BGM は 0 回」は仕様ごと変わった。
     タイトルは assets/bgm/opening.mp3 を鳴らす (BGM_FILES.title)。
     ⭐ **`=== 1` であって `>= 1` ではない。** このスパイは openPage() の **後**に掛かるので、
       title.html の **ロード時の呼び口 (pendingBgm へ落ちる 1 本) は原理的に見えず**、
       最初の pointerdown の中の 1 本だけを数える。
     ⚠ さらに unlock() が pendingBgm を鳴らす経路は **モジュール内部の playBgm** を通るので、
       GameAudio.playBgm を包んだこのスパイからは**永久に見えない** (audio.js:119)。
       「実際に mp3 を掴んで鳴っているか」は tools/driver_bgm_title.js の (2b) が
       __bgmFileState() で測る。ここは「渡した ID」だけを見る。 */
function judgeTitleAudio(o) {
  if (!o) return false;
  const ins = o.installed || {};
  const bgm = o.bgmCalls || [];
  return o.threw === '' && o.hasGameAudio === true
    && ins.unlock === true && ins.playBgm === true
    && o.unlockBefore === 0                     // ★ ロードだけでは解錠しない (タップが引き金)
    && o.unlockAfter === 1                      // ★ once:true なのでちょうど 1 回
    && bgm.length === 1                         // ★ #20: タイトル専用 BGM がちょうど 1 回
    && bgm[0][0] === 'title';                   // ★ #20: 渡した ID は title
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
        /* ⚠ **`.slotActs` に限定する。** 2 段タップ確認の「やめる / 消して始める」も
              data-act を持つので、カード全体から拾うと armed のときだけ acts が 4 個に化ける。
              確認行は下の `confirm` で別に採る (別の性質は別の器で測る)。 */
        acts: [].slice.call(c.querySelectorAll('.slotActs button[data-act]')).map(function (b) {
          return { act: b.getAttribute('data-act'), label: b.textContent };
        }),
        confirm: (function () {
          var box = c.querySelector('.slotConfirm');
          return {
            exists: !!box,
            // :empty の CSS で畳まれるので、display が「確認行が出ているか」そのもの
            visible: !!box && getComputedStyle(box).display !== 'none',
            text: (box && box.textContent) || '',
            btns: box ? [].slice.call(box.querySelectorAll('button[data-act]')).map(function (b) {
              return { act: b.getAttribute('data-act'), label: b.textContent };
            }) : [],
          };
        })(),
      };
    });
    out.list = (window.DFSlots ? DFSlots.list() : null);   // 別経路 (API 側の実際の答え)
    out.hasDFSlots = !!window.DFSlots;
    /* ライブ名前空間の生値。受入条件 4. が「1 タップ目で記録が **消えていない**」を
       DOM ではなく保存領域そのもので測るのに使う (見た目が残っていても中身が消えていたら赤)。 */
    out.live = {
      xp:   localStorage.getItem('dragonfighters.xp'),
      gold: localStorage.getItem('dragonfighters.gold'),
      pc:   localStorage.getItem('dragonfighters.partyComposition'),
      activeSlot: localStorage.getItem('df.activeSlot'),
    };
    out.ranToEnd = true;
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
}

/* tavern.html の「主人公をえらぶ」タイル (#partyComp) を写し取る。判定は 1 つも持たない。
   ⚠ selection は classic script 直下の変数なので **裸の識別子**でしか読めない。 */
function probeTavernHeroTiles() {
  var out = { threw: '', ranToEnd: false, search: location.search };
  try {
    out.hero  = selection.partyComposition[0];
    out.pc    = localStorage.getItem('dragonfighters.partyComposition');
    var host  = document.getElementById('partyComp');
    out.hasHost = !!host;
    out.tiles = host ? [].slice.call(host.querySelectorAll('.partyMemberToggle')).map(function (t) {
      return {
        name:      ((t.querySelector('.memberName') || {}).textContent || ''),
        role:      ((t.querySelector('.memberRole') || {}).textContent || ''),
        isHero:    t.classList.contains('active'),
        lockedOut: t.classList.contains('locked-out'),
        title:     t.getAttribute('title') || '',
      };
    }) : [];
    /* パネルの見出し。⚠ タイルの押せる/押せないと **同じ heroLockOff** で切り替わるので、
       「押せないのに『えらぶ』と書いてある」矛盾をここで拾える。 */
    out.head    = ((document.getElementById('partyCompHead')    || {}).textContent || '');
    out.headSub = ((document.getElementById('partyCompHeadSub') || {}).textContent || '');
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

/* 受入条件 9. のレイアウト観測。判定は 1 つも持たない。
   ⭐ **はみ出した要素を列挙して持ち帰る**のが要点。総量 (scrollWidth) だけを採ると、
      赤になったときに「どこが悪いのか」が分からず CSS を当てずっぽうで触ることになる。
   ⚠ 縦 (scrollHeight) は参考として採るだけで、判定には一切使わない (縦スクロールは可)。 */
function probeLayout() {
  var out = { threw: '', ranToEnd: false, href: location.href };
  try {
    var de = document.documentElement;
    out.clientWidth     = de.clientWidth;
    out.scrollWidth     = de.scrollWidth;
    out.bodyScrollWidth = document.body.scrollWidth;
    out.innerWidth      = window.innerWidth;
    out.clientHeight    = de.clientHeight;      // 参考のみ (縦は禁じない)
    out.scrollHeight    = de.scrollHeight;      // 参考のみ (縦は禁じない)

    /* 実際に横へスクロールできてしまうか。⚠⚠ **judge には使わない** (judgeNoHScroll の
       コメント参照)。isMobile エミュレーションでは溢れがあっても 0 のままなので、
       ログに出す診断値としてだけ採る。 */
    var sx0 = window.scrollX, sy0 = window.scrollY;
    window.scrollTo(9999, sy0);
    out.scrolledX = window.scrollX;
    window.scrollTo(sx0, sy0);

    /* 母集団 (装置 assert 用)。空のページで緑になる穴を塞ぐ材料。 */
    var cards = [].slice.call(document.querySelectorAll('#slotList .slotCard'));
    out.nSlotCards   = cards.length;
    out.nFilledCards = cards.filter(function (c) { return c.getAttribute('data-empty') === '0'; }).length;
    out.nConfirmBtns = document.querySelectorAll('#slotList .slotConfirm button[data-act]').length;
    out.nClassCards  = document.querySelectorAll('#classCards .classCard').length;
    out.nOpenDetails = [].slice.call(document.querySelectorAll('#classCards .classCard .classDetail'))
      .filter(function (d) { return getComputedStyle(d).display !== 'none'; }).length;
    var ss = document.getElementById('screenSlots'), sn = document.getElementById('screenNaming');
    out.screenSlots  = !!ss && ss.classList.contains('active');
    out.screenNaming = !!sn && sn.classList.contains('active');

    /* どの要素が右 (または左) へはみ出しているか。⚠ 1px の丸め誤差は許す。 */
    var cw = de.clientWidth;
    var bad = [].slice.call(document.querySelectorAll('#titleRoot *')).filter(function (e) {
      var r = e.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) return false;          // 畳まれている器は対象外
      return r.right > cw + 1 || r.left < -1;
    });
    out.overflowers = bad.slice(0, 8).map(function (e) {
      var r = e.getBoundingClientRect();
      return { tag: e.tagName.toLowerCase(), id: e.id || '', cls: String(e.className || '').slice(0, 40),
               left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
    });
    out.nOverflowers = bad.length;
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

    /* ── opts.spyTimers: setTimeout / clearTimeout を **透過的に**包んで台帳を採る ──
       受入条件 4. の「8 秒無操作で安全側へ自動復帰」を **実時間に頼らず**測るための道具。
       ⚠ 実時間 8 秒を待つだけの測り方は、健全な分布が窓をまたいだ瞬間に間欠フレークになる。
         → ここでは「8000ms のタイマーが 1 本仕込まれたか」「それを **今すぐ発火**させると
           安全側へ戻るか」「やめるを押すと **解除**されるか」を決定論的に測る。
         実時間の側は別に 1 本だけ用意し (4w)、この台帳が嘘をついていないことを裏取りする。
       ⚠ 包むだけで挙動は変えない (元の setTimeout をそのまま呼ぶ)。 */
    if (opts.spyTimers) {
      await page.evaluateOnNewDocument(() => {
        try {
          var oST = window.setTimeout, oCT = window.clearTimeout;
          var pending = {};
          var spy = { scheduled: [], cleared: [] };
          window.__dfTimers = spy;
          window.setTimeout = function (fn, ms) {
            var rest = Array.prototype.slice.call(arguments, 2);
            var id = oST.call(window, function () {
              delete pending[id];
              if (typeof fn === 'function') fn.apply(null, rest);
            }, ms);
            spy.scheduled.push(ms);
            pending[id] = { ms: ms, fn: fn, rest: rest };
            return id;
          };
          window.clearTimeout = function (id) {
            if (pending[id]) { spy.cleared.push(pending[id].ms); delete pending[id]; }
            return oCT.call(window, id);
          };
          /* 指定 delay の **保留中**タイマーを今すぐ発火させる (仮想時間)。戻り値 = 発火本数 */
          window.__dfFireTimers = function (ms) {
            var hit = Object.keys(pending).filter(function (k) { return pending[k].ms === ms; });
            hit.forEach(function (k) {
              var p = pending[k];
              oCT.call(window, Number(k));
              delete pending[k];
              try { if (typeof p.fn === 'function') p.fn.apply(null, p.rest); } catch (e) {}
            });
            return hit.length;
          };
          window.__dfPendingCount = function (ms) {
            return Object.keys(pending).filter(function (k) { return pending[k].ms === ms; }).length;
          };
        } catch (e) {}
      });
    }

    /* ⚠ opts.allowRedirect: ページ自身が読み込み中に location.replace() する場合
       (= 撤退スイッチ ?title=0)、goto は「別の遷移に割り込まれた」で reject し得る。
       そこだけ握って、遷移先が落ち着くのを **ポーリング**で待つ。
       ⚠⚠ 既定では握らない。無条件に try/catch すると、ただの読み込み失敗まで
          静かに緑になる (silent fail-open)。理由のある 1 箇所でだけ許す。 */
    let navThrew = '';
    try {
      await page.goto('http://localhost:' + PORT + pathQuery, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      if (!opts.allowRedirect) throw e;
      navThrew = String((e && e.message) || e).split('\n')[0];
      await page.waitForFunction(() => document.readyState !== 'loading', { timeout: 20000 }).catch(() => {});
    }
    page.__navThrew = navThrew;
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

  /* ══ 依頼書 #12 town-map-phlan: 着地点が town.html (港町フラン) へ移った ═══════════
     タイトルから「つづきから/旅立つ」を押すと、酒場ではなく **街** に着き、
     そこで 🦌 の看板をくぐって初めて酒場へ入る。

     ⛔ (2)(3)(4c)(8) の期待文字列を tavern.html → town.html へ書き換えて終わりにしない。
        それは検出器を「手段」に縛り直すだけで、次の仕様変更でまた腐る。
     ⭐ 代わりに **測定点を「街を通り抜けた後」へ移す**。判定関数 (judgeNewGameRound /
        judgeContinueRound / judgeConfirmArmed) の式と期待値は **1 文字も変えていない**。
     ⚠ 通り抜けたかどうかは観測値として持ち帰る。0 回のまま全部緑になったら
        「街を一度も通っていないのに通ったつもり」= 空振りなので (TZ) が弾く。
     ⚠ 街に居ないとき (直接 /tavern.html を開いた等) は素通り。素通り回数も数える。 */
  const townTrip = { legs: 0, skips: 0, firstSearch: [] };

  /* ══ 依頼書 #21 world-map-entry: 街の**前**にワールドマップが 1 段挟まった ═══════════
     タイトルから「つづきから/旅立つ」を押すと、まず **地方全景 world.html** に着き、
     主人公の駒で港町フランの札まで歩いて初めて街 town.html に入る。

     ⛔ ここでも (2)(3)(4c)(8) の期待文字列を書き換えて終わりにしない。#12 と**同じ手**で
        **測定点をワールドマップも通り抜けた後へ移す**。判定関数 (judgeNewGameRound /
        judgeContinueRound / judgeConfirmArmed) の式と期待値は 1 文字も変えていない。
     ⚠ 通り抜けたことは観測値として持ち帰り、(WZ) が「0 回のまま全部緑」を弾く。
     ⚠ 札を押すと駒が街道を歩いてから遷移するので、遷移待ちは **waitForNavigation**
       (固定 sleep で代用しない。経路の長さは走行ごとに違う)。 */
  const worldTrip = { legs: 0, skips: 0, firstSearch: [] };
  async function passWorld(page) {
    try {
      const at = await page.evaluate(() => ({ path: location.pathname, search: location.search }));
      if (!/\/world\.html$/.test(at.path)) { worldTrip.skips++; return false; }
      worldTrip.firstSearch.push(at.search);
      await page.waitForFunction(
        "!!window.__world && !!document.getElementById('worldNode_phlan')", { timeout: 20000 });
      const pt = await page.evaluate(() => window.__world.clientFromNode('phlan'));
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 40000 }),
        page.mouse.click(Math.round(pt.x), Math.round(pt.y)),
      ]);
      await sleep(700);
      worldTrip.legs++;
      return true;
    } catch (e) {
      worldTrip.skips++;
      return false;
    }
  }

  async function arriveTavern(page) {
    await passWorld(page);          // ★ #21: 街の前に地方全景を 1 段通り抜ける
    try {
      const at = await page.evaluate(() => ({ path: location.pathname, search: location.search }));
      if (/\/town\.html$/.test(at.path)) {
        townTrip.firstSearch.push(at.search);
        await page.waitForFunction(
          "window.__town && !!document.getElementById('townSign_tavern')", { timeout: 20000 });
        await page.evaluate(() => document.getElementById('townSign_tavern').click());
        await page.waitForFunction("location.pathname.indexOf('/tavern.html') >= 0", { timeout: 30000 });
        await sleep(700);
        townTrip.legs++;
      } else {
        townTrip.skips++;
      }
    } catch (e) {
      townTrip.skips++;
    }
    return await page.evaluate(probeTavernArrival);
  }

  /* 「はじめから」を押して名乗り画面まで進む共通手順。
     ⚠⚠ **埋まっているスロットは 2 段タップ確認を挟む** (受入条件 4.)。実プレイと同じ手順を
        踏むためここで吸収するが、**どちらを通ったかを戻り値で申告**する。
        黙って両方を受け入れる「逃げ道つき」にすると、確認が出るべきでない所で出ても緑になる
        (その穴自体は (4n) と下の (3z0) が別に塞いでいる)。
     ⚠⚠⚠ openPage() の既定は dragonfighters.prologueSeen を仕込む。DFSlots の空判定は
        「KEEP 以外の dragonfighters.* が 1 件でもあるか」なので、**既定では active スロットが
        既に「記録あり」= 2 段タップになる** ((1n3) が明文化している罠)。 */
  async function startNewGame(page, slot) {
    const selNew = '#slotList .slotCard[data-slot="' + slot + '"] button[data-act="new"]';
    const selYes = '#slotList .slotCard[data-slot="' + slot + '"] .slotConfirm button[data-act="confirm-yes"]';
    await page.click(selNew);
    /* 名乗りが開くか確認行が出るか、**どちらかが起きるまでポーリング**する (固定 sleep を使わない) */
    await page.waitForFunction((sy) => {
      var n = document.getElementById('screenNaming');
      return (!!n && n.classList.contains('active')) || !!document.querySelector(sy);
    }, { timeout: 10000 }, selYes);
    let usedConfirm = false;
    if (await page.$(selYes)) { usedConfirm = true; await page.click(selYes); }
    await page.waitForFunction(() => {
      var e = document.getElementById('screenNaming'); return !!e && e.classList.contains('active');
    }, { timeout: 10000 });
    return { usedConfirm };
  }

  /* 「つづきから」を押して酒場に着くまでの共通手順。⚠ 受入条件 3. と 8. が共有する。
     押せなかった場合も **観測値として** pressedContinue:false を載せて返す
     (ドライバ側で分岐して false を返す「隠れた逃げ道」を作らない。判定は必ず共有関数が下す)。 */
  async function runContinueRound(page, slot) {
    let pressed = true;
    try {
      await clickAndNavigate(page, '#slotList .slotCard[data-slot="' + slot + '"] button[data-act="continue"]');
    } catch (e) { pressed = false; }
    const obs = await arriveTavern(page);
    obs.pressedContinue = pressed;
    return obs;
  }

  /* 受入条件 6. でブラウザから読み取った HERO_CLASSES の実体。受入条件 1.〜3. が
     **期待値をドライバに書き写さない**ために借りる (職業の日本語名・tagline・role・note・zone)。
     ⭐ 期待値は「実装が書いた数字」ではなく **元データ**から組み立てるのが規則。 */
  let heroClassesObs = null;

  /* ★ 受入条件 8. のための記録: 1.〜4. の **共有判定関数**が本番で返した値。
     ?title=0 のセクションが同じ 4 本を呼び、ここが true / あちらが false を突き合わせる。
     ⚠ 「共有しているつもりで実は常に false を返す関数」を作ってしまう事故は
        (8z1) がここを読むことで機械的に落ちる。 */
  const PROD_VERDICT = { j1: null, j2: null, j3: null, j4: null };

  /* 受入条件 2. / 3. が使う入力。⚠ 受入条件 8. は **同じ判定関数**に **同じ入力**を渡すので、
     ここを 1 箇所にしておかないと「入力が違うから false になっただけ」になり証明にならない。 */
  const CASE2 = { hero: 'rogue' };                                  // 依頼書が名指ししている職業
  const CASE3 = { hero: 'warrior', other: 'mage', xp: '23456', gold: '4321' };

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

    /* ★ 判定は judgeSlotsScreen() に括り出してある。受入条件 8. の ?title=0 版が
       **この同じ関数**を呼んで false になることを測る (その場に直書きすると空振りする)。 */
    PROD_VERDICT.j1 = judgeSlotsScreen(o1);
    check('(1) ★受入条件1: スロットを 3 枚描き、3 枚とも「記録なし」+「はじめから」だけ',
      PROD_VERDICT.j1 === true,
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
    const HERO_KEY = CASE2.hero;   // ⚠ 受入条件 8. が同じ入力で同じ判定関数を呼ぶ (CASE2 が唯一の正)
    const src = (heroClassesObs || []).find(c => c.classKey === HERO_KEY) || null;

    // ⚠ 前口上が出ることそのものが受入条件なので prologueSeen を仕込まない
    const p2 = await openPage('/title.html', { prologueSeen: false });

    // ── ① スロット1 の「はじめから」を押す ──────────────────────────
    //    prologueSeen も無い全消し状態なのでスロット1 は **空** = 1 タップで名乗りへ
    const step2 = await startNewGame(p2, 1);
    const nam0 = await p2.evaluate(probeNaming);

    check('(2z0) [装置] スロット1 は空なので 2 段タップ確認を通らずに名乗りへ進んだ',
      step2.usedConfirm === false, JSON.stringify(step2));

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

    /* ⚠⚠ [依頼書 #12 town-map-phlan] 前口上は **街をくぐって酒場に入った後**に出る。
       town.html には #prologueOverlay が無いので、ここで先に待つと必ずタイムアウトして
       (2p) が偽の赤になる (実測で踏んだ)。→ **先に街を通り抜けてから**ポーリングする。
       ⚠ 固定 sleep に頼らないのは従来どおり。 */
    let o2 = await arriveTavern(p2);
    let overlayCameUp = true;
    try {
      await p2.waitForFunction(() => {
        var o = document.getElementById('prologueOverlay');
        return !!o && getComputedStyle(o).display !== 'none';
      }, { timeout: 20000 });
    } catch (e) { overlayCameUp = false; }
    o2 = await p2.evaluate(probeTavernArrival);   // ★オーバーレイが出た後の状態で採り直す

    console.log('  [到着] ' + o2.href);
    console.log('         localStorage  partyComposition = ' + JSON.stringify(o2.pcLocal));
    console.log('         sessionStorage partyComposition = ' + JSON.stringify(o2.pcSession) + '  (別物。読み違えると偽の緑/赤)');
    console.log('         酒場が採用した主人公 selection.partyComposition[0] = ' + JSON.stringify(o2.heroInTavern));
    console.log('         df.activeSlot = ' + JSON.stringify(o2.activeSlot) + ' / prologueSeen = ' + JSON.stringify(o2.prologueSeen));

    /* ★ 判定は judgeNewGameRound() の共有本体。受入条件 8. が同じ関数を呼ぶ */
    PROD_VERDICT.j2 = judgeNewGameRound(o2, HERO_KEY);
    check('(2) ★受入条件2: 素の tavern.html に着き localStorage の partyComposition が選んだ職 1 人だけになっている',
      PROD_VERDICT.j2 === true,
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
    const o2n = await arriveTavern(p2n);
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
    // ⚠ 受入条件 8. が同じ入力で同じ判定関数を呼ぶ (CASE3 が唯一の正)
    const HERO_A = CASE3.hero, HERO_B = CASE3.other;
    const XP_A = CASE3.xp, GOLD_A = CASE3.gold;
    const nameA = ((heroClassesObs || []).find(c => c.classKey === HERO_A) || {}).name;
    const nameB = ((heroClassesObs || []).find(c => c.classKey === HERO_B) || {}).name;

    const p3 = await openPage('/title.html');

    // ── ① スロット1 で HERO_A の新規 → 酒場 → そこに進行 (xp / gold) を作る ──
    //    ⚠ openPage の既定は prologueSeen を仕込む → スロット1 は「記録あり」= 2 段タップになる
    const step3a = await startNewGame(p3, 1);
    await p3.click('#classCards .classCard[data-class-key="' + HERO_A + '"]');
    await clickAndNavigate(p3, '#btnDepart');
    await p3.evaluate((xp, g) => {
      localStorage.setItem('dragonfighters.xp', xp);
      localStorage.setItem('dragonfighters.gold', g);
    }, XP_A, GOLD_A);
    const s1 = await arriveTavern(p3);

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
    const step3b = await startNewGame(p3, 2);
    check('(3z0) [装置] 2 段タップ確認は **埋まったスロットだけ**に出た (① スロット1=埋 は確認あり / ③ スロット2=空 は確認なし)',
      step3a.usedConfirm === true && step3b.usedConfirm === false,
      JSON.stringify({ slot1: step3a, slot2: step3b }));
    await p3.click('#classCards .classCard[data-class-key="' + HERO_B + '"]');
    await clickAndNavigate(p3, '#btnDepart');
    const s2 = await arriveTavern(p3);

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

    // ── ⑤ スロット1 の「つづきから」 (受入条件 8. と同じ手順を共有) ──────
    const s3 = await runContinueRound(p3, 1);
    await p3.close();

    console.log('  [復帰] xp=' + JSON.stringify(s3.xp) + ' gold=' + JSON.stringify(s3.gold)
      + ' hero=' + JSON.stringify(s3.heroInTavern) + ' activeSlot=' + JSON.stringify(s3.activeSlot));

    /* ★ 判定は judgeContinueRound() の共有本体。受入条件 8. が同じ関数を呼ぶ */
    PROD_VERDICT.j3 = judgeContinueRound(s3, HERO_A, XP_A, GOLD_A);
    check('(3) ★受入条件3: スロット1 の「つづきから」で xp と主人公が戻る',
      PROD_VERDICT.j3 === true,
      JSON.stringify({ pressedContinue: s3.pressedContinue, xp: s3.xp, expectXp: XP_A, gold: s3.gold,
                       pcLocal: s3.pcLocal, hero: s3.heroInTavern, activeSlot: s3.activeSlot, search: s3.search }));
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 受入条件 4. : 埋まっているスロットの「はじめから」は 1 タップでは消えない
   *   1 タップ目 = 確認行が出るだけ (記録は無傷) / 2 タップ目 = 実行
   *   + 8 秒 無操作で安全側 (未確認) へ自動復帰
   *
   * ── ⚠ 8 秒をどう測るか ──────────────────────────────────────────────
   *   時間そのものが仕様なので、時間を測らないと測ったことにならない。ただし
   *   「実時間を待って見に行く」だけの測り方は、健全な分布が窓をまたいだ瞬間に
   *   間欠フレークになる (このリポジトリで何度も踏んでいる)。→ 2 段構えにする:
   *     (4t1)(4t2)(4t3) = **仮想時間**。setTimeout の台帳を採り、8000ms の
   *        タイマーが 1 本仕込まれたことを確認し、それを **今すぐ発火**させて畳まれるか見る。
   *        時計に一切依存しないので原理的にフレークしない。
   *     (4w)            = **実時間 1 本だけ**。台帳が嘘 (例: 仕込むだけで本物は動かない) を
   *        ついていないことの裏取り。下限 7 秒・上限 25 秒の広い窓で、
   *        「即座に戻る」でも「永久に戻らない」でもないことだけを言う。
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 受入条件 4. : 埋まったスロットの 2 段タップ確認 + 8 秒で安全側へ復帰 ---');
  {
    const CONFIRM_MS = 8000;                 // 見本 (tavern.html の btnWipeSave) と同じ 8 秒
    const SEED_HERO = 'cleric', NEW_HERO = 'dwarf';
    const SEED = {
      'dragonfighters.xp': '31000',
      'dragonfighters.gold': '2468',
      'dragonfighters.partyComposition': JSON.stringify([SEED_HERO]),
    };
    const SEL_NEW    = '#slotList .slotCard[data-slot="1"] button[data-act="new"]';
    const SEL_YES    = '#slotList .slotCard[data-slot="1"] .slotConfirm button[data-act="confirm-yes"]';
    const SEL_CANCEL = '#slotList .slotCard[data-slot="1"] .slotConfirm button[data-act="confirm-cancel"]';
    const waitArmed    = (pg) => pg.waitForFunction((s) => !!document.querySelector(s), { timeout: 10000 }, SEL_YES);
    const waitDisarmed = (pg) => pg.waitForFunction(() => {
      var b = document.querySelector('#slotList .slotCard[data-slot="1"] .slotConfirm');
      return !!b && getComputedStyle(b).display === 'none';
    }, { timeout: 30000 });
    const card1 = (o) => ((o.cards || []).find(c => c.slot === '1') || { confirm: {}, acts: [], metaFields: [] });
    const stableMeta = (o) => JSON.stringify((card1(o).metaFields || [])
      .filter(f => f.field !== 'savedAt')     // ⚠ savedAt は読むたび動き得るので比較から外す
      .map(f => f.field + '=' + f.value));

    const p4 = await openPage('/title.html', { seed: SEED, spyTimers: true });
    const before = await p4.evaluate(probeTitleSlots);
    const live0 = before.live;

    check('(4z0) [装置] 前提: スロット1 が埋まり「はじめから(上書き)」が居て、確認行はまだ出ていない',
      before.threw === '' && card1(before).empty === false
        && (card1(before).acts || []).map(a => a.act).sort().join(',') === 'continue,new'
        && card1(before).confirm.exists === true && card1(before).confirm.visible === false
        && live0.xp === SEED['dragonfighters.xp'],
      JSON.stringify({ acts: (card1(before).acts || []).map(a => a.label),
                       confirmVisible: card1(before).confirm.visible, live: live0 }));

    const sched0 = await p4.evaluate((ms) => (window.__dfTimers || { scheduled: [] }).scheduled.filter(x => x === ms).length, CONFIRM_MS);

    // ── ① 1 タップ目 ────────────────────────────────────────────────
    await p4.click(SEL_NEW);
    await waitArmed(p4);
    const armed = await p4.evaluate(probeTitleSlots);

    /* ★ 判定は judgeConfirmArmed() の共有本体。受入条件 8. が同じ関数を呼ぶ */
    PROD_VERDICT.j4 = judgeConfirmArmed(armed, 1, live0);
    check('(4) ★受入条件4: 1 タップでは消えない (確認行が出るだけ・名乗りへ進まない・保存領域が無傷)',
      PROD_VERDICT.j4 === true,
      JSON.stringify({ screenNaming: armed.screenNaming, confirmVisible: card1(armed).confirm.visible,
                       btns: (card1(armed).confirm.btns || []).map(b => b.act + ':' + b.label),
                       msgHead: (card1(armed).confirm.text || '').slice(0, 22),
                       liveBefore: live0, liveAfter: armed.live }));

    check('(4a) [装置] 1 タップ目でカードの表示 (主人公 / Lv / 所持金 / クリア) も変わっていない',
      stableMeta(before) === stableMeta(armed) && stableMeta(armed).length > 10,
      JSON.stringify({ before: stableMeta(before), after: stableMeta(armed) }));

    const sched1 = await p4.evaluate((ms) => (window.__dfTimers || { scheduled: [] }).scheduled.filter(x => x === ms).length, CONFIRM_MS);
    const pend1  = await p4.evaluate((ms) => window.__dfPendingCount(ms), CONFIRM_MS);
    check('(4t1) [装置・仮想時間] 1 タップ目で 8000ms のタイマーがちょうど 1 本仕込まれ、保留中である',
      sched1 - sched0 === 1 && pend1 === 1,
      JSON.stringify({ scheduledDelta: sched1 - sched0, pending: pend1 }));

    // ── ② そのタイマーを **今すぐ発火** → 安全側へ戻るか (時計に依存しない) ──
    const fired = await p4.evaluate((ms) => window.__dfFireTimers(ms), CONFIRM_MS);
    await waitDisarmed(p4);
    const reverted = await p4.evaluate(probeTitleSlots);
    check('(4t2) ★受入条件4[仮想時間]: 8 秒タイマーの発火で安全側 (未確認) へ戻る。同じ判定関数が false になる',
      fired === 1 && judgeConfirmArmed(reverted, 1, live0) === false
        && card1(reverted).confirm.visible === false
        && (card1(reverted).acts || []).map(a => a.act).sort().join(',') === 'continue,new'
        && reverted.screenNaming === false
        && reverted.live.xp === live0.xp && reverted.live.pc === live0.pc,
      JSON.stringify({ fired, confirmVisible: card1(reverted).confirm.visible,
                       acts: (card1(reverted).acts || []).map(a => a.act), live: reverted.live }));

    // ── ③ 「やめる」で畳むと 8 秒タイマーが **解除**される (detached ノード対策) ──
    await p4.click(SEL_NEW);
    await waitArmed(p4);
    const clr0 = await p4.evaluate((ms) => (window.__dfTimers || { cleared: [] }).cleared.filter(x => x === ms).length, CONFIRM_MS);
    await p4.click(SEL_CANCEL);
    await waitDisarmed(p4);
    const clr1  = await p4.evaluate((ms) => (window.__dfTimers || { cleared: [] }).cleared.filter(x => x === ms).length, CONFIRM_MS);
    const pend2 = await p4.evaluate((ms) => window.__dfPendingCount(ms), CONFIRM_MS);
    const afterCancel = await p4.evaluate(probeTitleSlots);
    check('(4t3) [装置] 「やめる」で確認行が畳まれ、8 秒タイマーが **解除**される (detached ノードを掴み続けない)',
      clr1 - clr0 === 1 && pend2 === 0
        && judgeConfirmArmed(afterCancel, 1, live0) === false
        && afterCancel.live.xp === live0.xp,
      JSON.stringify({ clearedDelta: clr1 - clr0, pendingAfter: pend2, live: afterCancel.live }));

    // ── ④ 2 タップ目 = 実行 (名乗りへ進む → 確定すると実際に消える) ──────
    await p4.click(SEL_NEW);
    await waitArmed(p4);
    await p4.click(SEL_YES);
    await p4.waitForFunction(() => {
      var e = document.getElementById('screenNaming'); return !!e && e.classList.contains('active');
    }, { timeout: 10000 });
    const nam4 = await p4.evaluate(probeNaming);
    check('(4b) ★受入条件4: 2 タップ目で先へ進む (名乗り画面が開く)',
      nam4.namingActive === true && nam4.slotsActive === false && (nam4.cards || []).length === 6,
      JSON.stringify({ naming: nam4.namingActive, n: (nam4.cards || []).length }));

    await p4.click('#classCards .classCard[data-class-key="' + NEW_HERO + '"]');
    await clickAndNavigate(p4, '#btnDepart');
    const arr4 = await arriveTavern(p4);
    await p4.close();
    check('(4c) ★受入条件4: 確定まで進むと記録が実際に消える (旧 xp / 旧所持金が消え、主人公が入れ替わる)',
      arr4.xp === null && arr4.gold === null
        && arr4.pcLocal === JSON.stringify([NEW_HERO]) && arr4.heroInTavern === NEW_HERO,
      JSON.stringify({ xpWas: SEED['dragonfighters.xp'], xpNow: arr4.xp, goldNow: arr4.gold,
                       heroWas: SEED_HERO, heroNow: arr4.heroInTavern }));

    /* ── 負のコントロール: **空**のスロットには確認を出さない ────────────
       ここが緑にならないと、受入条件 2./3. の「空スロットは 1 タップで名乗りへ」が壊れる。 */
    /* ⚠ startNewGame() を通す。直接 click + 「名乗りが開くまで待つ」だと、確認行が出る変異を
       当てたときに **タイムアウトでドライバごと死ぬ** (赤ではなく exit 3 になり原因が読めない)。
       共通手順なら「確認を通ったか」を戻り値で受け取れるので、ちゃんと赤にできる。 */
    const p4n = await openPage('/title.html', { seed: SEED });
    const step4n = await startNewGame(p4n, 2);
    const n4 = await p4n.evaluate(probeTitleSlots);
    await p4n.close();
    const c2 = (n4.cards || []).find(c => c.slot === '2') || { confirm: {} };
    check('(4n) [負のコントロール] **空**のスロットは 1 タップで名乗りへ進む (確認行を出さない)',
      step4n.usedConfirm === false
        && n4.screenNaming === true && c2.empty === true
        && c2.confirm.exists === true && c2.confirm.visible === false && (c2.confirm.btns || []).length === 0,
      JSON.stringify({ usedConfirm: step4n.usedConfirm, naming: n4.screenNaming, slot2Confirm: c2.confirm }));

    /* ── 実時間の裏取り (1 本だけ) ────────────────────────────────────
       台帳 (仮想時間) が「仕込んだふり」をしていないことの証明。
       ⚠ 窓は 7 秒〜25 秒と広く取る。狙いは「即座でも永久でもない」ことだけで、
         8 秒ちょうどを当てにいくと端末速度でフレークする。 */
    const p4w = await openPage('/title.html', { seed: SEED });
    await p4w.click(SEL_NEW);
    await waitArmed(p4w);
    const t0 = Date.now();
    let wallOk = true;
    try { await waitDisarmed(p4w); } catch (e) { wallOk = false; }
    const elapsed = Date.now() - t0;
    const w4 = await p4w.evaluate(probeTitleSlots);
    await p4w.close();
    check('(4w) ★受入条件4[実時間]: 実際に放置すると 8 秒前後で安全側へ戻る (7000〜25000ms の窓)',
      wallOk === true && elapsed >= 7000 && elapsed <= 25000
        && judgeConfirmArmed(w4, 1, live0) === false && w4.live.xp === live0.xp,
      JSON.stringify({ elapsedMs: elapsed, confirmVisible: card1(w4).confirm.visible, live: w4.live }));
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 受入条件 5. / 7. : tavern.html のクラス変更封印 と 撤退スイッチ ?herolock=0
   * ⭐ 5. と 7. は **同じ assert 本体** judgeHeroUnchanged() と、
   *    **同じ手順** runHeroTileClick() を共有する。クエリ文字列だけが違う。
   *    別々に書くと「両方とも間違っている」事故を防げない。
   * ⚠ #partyComp は「出発の準備」画面の中。クエスト選択の導線を通らずに、
   *   本番の renderPartyComposition() を直接呼んで器を埋める。測りたいのは画面遷移ではなく
   *   「タイルにクリックリスナが付いているか」なので、これで十分かつ決定論的。
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 受入条件 5. / 7. : 酒場のクラス変更封印 と ?herolock=0 ---');
  {
    const LOCK_HERO = 'cleric';
    const LOCK_SEED = { 'dragonfighters.partyComposition': JSON.stringify([LOCK_HERO]) };

    async function runHeroTileClick(query) {
      const pg = await openPage('/tavern.html' + query, { seed: LOCK_SEED });
      const built = await pg.evaluate(() => {
        // renderPartyComposition は classic script 直下の関数宣言 → 裸の識別子で呼べる
        try { renderPartyComposition(); return { threw: '' }; }
        catch (e) { return { threw: String((e && e.message) || e) }; }
      });
      const pre = await pg.evaluate(probeTavernHeroTiles);
      /* 非主人公タイルを 1 枚クリックする。
         ⚠ 準備画面は非表示なので page.click (実座標クリック) は使えない。
            本番のリスナを実際に発火させるため要素の click() を呼ぶ。 */
      const clicked = await pg.evaluate(() => {
        var host = document.getElementById('partyComp');
        var tiles = host ? [].slice.call(host.querySelectorAll('.partyMemberToggle')) : [];
        var t = tiles.filter(function (x) { return !x.classList.contains('active'); })[0];
        if (!t) return { ok: false, name: '' };
        var nm = ((t.querySelector('.memberName') || {}).textContent || '');
        t.click();
        return { ok: true, name: nm };
      });
      await sleep(400);
      const post = await pg.evaluate(probeTavernHeroTiles);
      await pg.close();
      return { built, pre, clicked, post, verdict: judgeHeroUnchanged(pre, post) };
    }

    const lockOn  = await runHeroTileClick('');              // 本番 (封印されている)
    const lockOff = await runHeroTileClick('?herolock=0');   // 撤退スイッチ (従来どおり変わる)

    console.log('  [封印]   hero ' + JSON.stringify(lockOn.pre.hero) + ' → ' + JSON.stringify(lockOn.post.hero)
      + ' / 押したタイル = ' + JSON.stringify(lockOn.clicked.name));
    console.log('  [解除]   hero ' + JSON.stringify(lockOff.pre.hero) + ' → ' + JSON.stringify(lockOff.post.hero)
      + ' / 押したタイル = ' + JSON.stringify(lockOff.clicked.name));

    check('(5z0) [装置] 両方で 6 枚のタイルが本番の関数で描かれ、主人公が 1 枚だけ active・非主人公を実際に押せた',
      lockOn.built.threw === '' && lockOff.built.threw === ''
        && lockOn.pre.hasHost === true && (lockOn.pre.tiles || []).length === 6
        && (lockOff.pre.tiles || []).length === 6
        && (lockOn.pre.tiles || []).filter(t => t.isHero).length === 1
        && (lockOff.pre.tiles || []).filter(t => t.isHero).length === 1
        && lockOn.clicked.ok === true && lockOff.clicked.ok === true
        && lockOn.clicked.name === lockOff.clicked.name    // ★ 同じタイルを押している
        && lockOn.pre.hero === LOCK_HERO && lockOff.pre.hero === LOCK_HERO,
      JSON.stringify({ builtThrew: [lockOn.built.threw, lockOff.built.threw],
                       nTiles: [(lockOn.pre.tiles || []).length, (lockOff.pre.tiles || []).length],
                       clicked: [lockOn.clicked.name, lockOff.clicked.name],
                       preHero: [lockOn.pre.hero, lockOff.pre.hero] }));

    check('(5) ★受入条件5: 非主人公のクラスタイルをクリックしても partyComposition が変わらない',
      lockOn.verdict === true,
      JSON.stringify({ hero: [lockOn.pre.hero, lockOn.post.hero], pc: [lockOn.pre.pc, lockOn.post.pc] }));

    check('(7) ★受入条件7[装置]: ?herolock=0 を付けると **同じ判定関数**が false になる (= クラスが変わる)',
      lockOff.verdict === false
        && lockOff.post.hero !== lockOff.pre.hero
        && lockOn.verdict === true,       // ★ 対で見る。両方 false なら検出器が壊れている
      JSON.stringify({ lockOn: lockOn.verdict, lockOff: lockOff.verdict,
                       heroOff: [lockOff.pre.hero, lockOff.post.hero] }));

    /* 見た目の側 (依頼書が名指しした表示要件)。⚠ リスナを付けないのが本体で、
       これはそれをプレイヤーに見せる部分。両方測らないと「押せるのに何も起きない」を見逃す。 */
    const lockedTiles   = (lockOn.pre.tiles || []).filter(t => !t.isHero);
    const unlockedTiles = (lockOff.pre.tiles || []).filter(t => !t.isHero);
    check('(5b) 封印時は非主人公タイルに locked-out と説明の title 属性が付く / 主人公タイルには付かない',
      lockedTiles.length === 5 && lockedTiles.every(t => t.lockedOut === true)
        && lockedTiles.every(t => t.title.indexOf('主人公は変更できません') >= 0)
        && (lockOn.pre.tiles || []).filter(t => t.isHero).every(t => t.lockedOut === false),
      JSON.stringify(lockedTiles.map(t => ({ name: t.name, lockedOut: t.lockedOut, title: t.title }))));

    check('(7b) [装置] ?herolock=0 では locked-out が 1 枚も付かない (見た目も従来どおり)',
      unlockedTiles.length === 5 && unlockedTiles.every(t => t.lockedOut === false && t.title === ''),
      JSON.stringify(unlockedTiles.map(t => ({ name: t.name, lockedOut: t.lockedOut, title: t.title }))));

    /* ★ 見出しの文言が **タイルの押せる/押せない と食い違っていない** こと。
       ⚠ 項目 3 は「主人公をえらぶ (残りはランダムな仲間で埋まる)」を据え置いたため、
         封印後は「押せないタイルに『えらぶ』と書いてある」状態だった (title 属性は
         hover しないと出ないので、初見は押し続けることになる)。項目 4 で実態に合わせた。
       ⚠⚠ 文言を静的に書き換えるだけだと ?herolock=0 で今度は逆に嘘になる。
         → **リスナと同じ heroLockOff** で両方向に切り替え、ここで対にして測る。
         片側だけ測ると「常にこの文言」でも緑になる。 */
    check('(5d) 封印中の見出しは「えらぶ」と言わない / 変更手段 (新規ゲーム) を案内している',
      lockOn.pre.head === '主人公'
        && lockOn.pre.head.indexOf('えらぶ') < 0
        && lockOn.pre.headSub.indexOf('新規ゲーム') >= 0
        && lockOn.pre.headSub.indexOf('ランダムな仲間') >= 0,
      JSON.stringify({ head: lockOn.pre.head, sub: lockOn.pre.headSub }));

    check('(7c) [装置] ?herolock=0 では見出しが従来どおり「主人公をえらぶ」に戻る (静的な文言ではない)',
      lockOff.pre.head === '主人公をえらぶ'
        && lockOff.pre.headSub.indexOf('新規ゲーム') < 0
        && lockOff.pre.head !== lockOn.pre.head           // ★ 対で見る。同じなら切り替わっていない
        && lockOff.pre.headSub !== lockOn.pre.headSub,
      JSON.stringify({ lockOn: lockOn.pre.head, lockOff: lockOff.pre.head, sub: lockOff.pre.headSub }));

    /* 依頼書の「selectHero() は残す (削除しない)」を機械化。
       ⚠ 消してしまうと ?herolock=0 経路が黙って死ぬ (しかも (7) は false のまま緑に見える)。 */
    const pgFn = await openPage('/tavern.html');
    const fnKinds = await pgFn.evaluate(() => {
      var out = {};
      try { out.selectHero = typeof selectHero; } catch (e) { out.selectHero = 'threw'; }
      try { out.renderPartyComposition = typeof renderPartyComposition; } catch (e) { out.renderPartyComposition = 'threw'; }
      try { out.isHeroLockOff = typeof isHeroLockOff; } catch (e) { out.isHeroLockOff = 'threw'; }
      try { out.btnReroll = !!document.getElementById('btnReroll'); } catch (e) { out.btnReroll = false; }
      return out;
    });
    await pgFn.close();
    check('(5c) [設計] selectHero() は削除せず残っている / 「仲間を引き直す」も残っている',
      fnKinds.selectHero === 'function' && fnKinds.renderPartyComposition === 'function'
        && fnKinds.isHeroLockOff === 'function' && fnKinds.btnReroll === true,
      JSON.stringify(fnKinds));
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 受入条件 8. : 撤退スイッチ ?title=0
   *   即座に tavern.html へ抜ける。かつ 1.〜4. のテストが **落ちる**。
   * ⭐⭐⭐ 「落ちる」は **判定本体を共有**して初めて意味を持つ。ここでは
   *   judgeSlotsScreen / judgeNewGameRound / judgeContinueRound / judgeConfirmArmed の
   *   4 本を、本番セクションと **同じ関数・同じ入力**で呼び、
   *   さらに **戻り値の AND (状態の conjunction)** で測る。
   *   別々に判定式を書くと「要素が無いから false = たまたま赤」で何も証明できない。
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 受入条件 8. : 撤退スイッチ ?title=0 ---');
  {
    /* ⚠⚠⚠ **測定点を間違えると (8b) は空振りする。** 実際に踏んだ:
       j1 を「クリックを試した後」の状態で採っていたため、スイッチを殺す変異を当てても
       (スイッチが死ねばタイトルが出て 1 タップで名乗りへ進むので) screenSlots が false になり、
       j1 が false のまま = (8b) が緑で通ってしまった。
       → j1 は **何も触る前** の状態で採る。以下、各判定の測定点を明示して並べる。
       ⚠ さらに j3 / j4 は「進行のあるスロット」でしか true になり得ないので、
         全消しのページ A とは **別のページ B** を用意する。同じページで両方は測れない
         (j1 は 3 枚とも空を要求し、j3 / j4 は埋まっていることを要求する = 排他)。 */

    // ── ページ A: 全消し。j1 (触る前) と j2 (新規の一周を試みる) ─────────
    const p8 = await openPage('/title.html?title=0', { prologueSeen: false, allowRedirect: true, settle: 1200 });
    const arrived8 = await p8.evaluate(probeTavernArrival);
    const t8 = await p8.evaluate(probeTitleSlots);   // ★ j1 の測定点 = **何も触る前**

    console.log('  [到着] ' + arrived8.href + '  (goto の例外 = ' + JSON.stringify(p8.__navThrew) + ')');

    /* ⚠ tavern.html も js/save-slots.js を読み込むので DFSlots は **居る**。
       「タイトルが描かれていない」は screenSlots と .slotCard の不在で測る
       (最初 hasDFSlots===false で書いて偽の赤を踏んだ = 測定点の誤り)。 */
    /* ⭐⭐⭐ 受入条件 8 の **不変条件は「タイトルが 1 枚も描かれない」**。行き先のページ名は
       手段でしかなく、依頼書 #12 town-map-phlan §11 の組み合わせ表が決める。
       ⛔ 期待文字列を tavern.html → town.html へ書き換えて終わりにしない
          (それは検出器を手段に縛り直すだけで、次の仕様変更でまた腐る)。
       ⭐ そこで行き先は **1 点ではなく 2x2 の表そのもの**を (8t) で測る。こうすると
          「?title=0 と ?town=0 が 1 つのスイッチに相乗りしていない」ことも同時に守れる。 */
    check('(8) ★受入条件8: title.html?title=0 は即座に次のページへ抜ける (タイトルは 1 枚も描かれない)',
      arrived8.search === ''
        && t8.screenSlots === false && t8.screenNaming === false && (t8.cards || []).length === 0,
      JSON.stringify({ pathname: arrived8.pathname, search: arrived8.search,
                       screenSlots: t8.screenSlots, nSlotCards: (t8.cards || []).length }));

    /* (8t) 依頼書 #12 §11 の組み合わせ表。⚠ ?title=0 の行き先を tavern.html に据え置くと
       「タイトルを飛ばすと街も飛ぶ」= 2 機能が 1 スイッチに相乗りし、赤が出たときに
       どちらを撤退したのか切り分けられなくなる。表の 2 行を実測して独立を証明する。 */
    {
      const pTbl = await openPage('/title.html?title=0&town=0',
        { prologueSeen: false, allowRedirect: true, settle: 1200 });
      const tbl = await pTbl.evaluate(() => ({ path: location.pathname, search: location.search }));
      await pTbl.close();
      /* ⚠ 依頼書 #21: ?title=0 単独の着地点は **world.html (地方全景)** へ 1 段移った。
         ⛔ 期待値 town.html を world.html へ書き換えて終わりにしない。#12 と同じく
            **測定点を「地方全景を通り抜けた後」へ移す** (通り抜けたことは (WZ) が押さえる)。
         ⭐ こうすると「?title=0 単独は街へ着く」という主張も期待値も 1 文字も変わらない。
         ⚠ ここで p8 は world.html → town.html まで進む。以降の流れ (flow2 が名乗り画面を
            探して失敗し、arriveTavern が街の看板をくぐる) は #21 以前とまったく同じ。 */
      const wentThroughWorld = await passWorld(p8);
      const t8town = await p8.evaluate(() => ({ path: location.pathname, search: location.search }));
      check('(8t) ★?title=0 単独は街へ / ?title=0&town=0 は街を足す前とまったく同じ酒場へ '
            + '(2 つのスイッチが相乗りしていない)',
        /\/town\.html$/.test(t8town.path || '') && t8town.search === ''
          && /\/tavern\.html$/.test(tbl.path || '') && tbl.search === '',
        JSON.stringify({ titleOffOnly: t8town.path, 着地直後: arrived8.pathname,
                         地方全景を通った: wentThroughWorld,
                         titleOffTownOff: tbl.path,
                         search: [t8town.search, tbl.search] }));
    }

    /* ── ★ 1.〜4. と **同じ判定関数**を、同じ手順を踏んだ結果に対して呼ぶ ──────
       踏めない (要素が無い) ことも記録に残す。⚠ 例外を握るのは「踏めなかった」を
       観測値にするためで、判定そのものは必ず共有関数に通す。 */
    const j1 = judgeSlotsScreen(t8);                   // ★ 触る前の状態で判定

    // 受入条件 2. と同じ手順 (スロット1 の はじめから → 名乗りで CASE2.hero → 旅立つ)
    let flow2Threw = '';
    try {
      await startNewGame(p8, 1);
      await p8.click('#classCards .classCard[data-class-key="' + CASE2.hero + '"]');
      await clickAndNavigate(p8, '#btnDepart');
    } catch (e) { flow2Threw = String((e && e.message) || e).split('\n')[0].slice(0, 60); }
    const a8 = await arriveTavern(p8);
    const j2 = judgeNewGameRound(a8, CASE2.hero);

    /* location.replace を使っている証明。href だと履歴に title.html が残り、
       酒場で「戻る」を押すと撤退したはずのタイトルへ戻ってしまう。
       ⚠ history.back() を evaluate の中で待つと遷移で実行コンテキストごと壊れる (実測)。
          page.goBack() で遷移を **puppeteer 側に待たせる**。 */
    let backHref = '(戻り先なし)';
    try {
      await p8.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
      await sleep(400);
      backHref = await p8.evaluate(() => location.href);
    } catch (e) { backHref = '(戻れなかった: ' + String((e && e.message) || e).split('\n')[0].slice(0, 40) + ')'; }
    await p8.close();
    check('(8a) [設計] location.replace で抜けている (「戻る」でタイトルへ戻らない)',
      !/title\.html/.test(backHref), JSON.stringify({ afterBack: backHref }));

    /* ── ページ B: 進行のあるスロット。j4 (2 段タップ確認) と j3 (つづきから) ──
       ⚠ j1 (3 枚とも空) とは排他なので、別ページで測る。 */
    const p8b = await openPage('/title.html?title=0', {
      allowRedirect: true, settle: 1200,
      seed: {
        'dragonfighters.xp': CASE3.xp,
        'dragonfighters.gold': CASE3.gold,
        'dragonfighters.partyComposition': JSON.stringify([CASE3.hero]),
      },
    });
    const tB0 = await p8b.evaluate(probeTitleSlots);
    let flow4Threw = '';
    try { await p8b.click('#slotList .slotCard[data-slot="1"] button[data-act="new"]'); }
    catch (e) { flow4Threw = String((e && e.message) || e).split('\n')[0].slice(0, 60); }
    await sleep(400);
    const tB1 = await p8b.evaluate(probeTitleSlots);
    const j4 = judgeConfirmArmed(tB1, 1, tB0.live);

    /* ⚠ ここは受入条件 3. と **同じ runContinueRound()** を通す。
       ライブに CASE3 の進行を仕込んであるので、?title=0 で酒場に直行すると
       xp も gold も主人公も「つづきから」が復元したものと **区別が付かない**。
       区別を付けているのが観測値 pressedContinue で、判定側 (judgeContinueRound) が要求している。 */
    const aB = await runContinueRound(p8b, 1);
    await p8b.close();
    const j3 = judgeContinueRound(aB, CASE3.hero, CASE3.xp, CASE3.gold);

    const conj = j1 && j2 && j3 && j4;

    check('(8b) ★受入条件8[装置]: 1.〜4. と **同じ判定関数**が ?title=0 では 4 本とも false (conjunction も false)',
      conj === false && j1 === false && j2 === false && j3 === false && j4 === false,
      JSON.stringify({ conjunction: conj, j1, j2, j3, j4,
                       pressedContinue: aB.pressedContinue,
                       threw: { flow2: flow2Threw.length > 0, flow4: flow4Threw.length > 0 } }));

    check('(8z1) [装置] その 4 本は本番では 4 本とも true を返していた (共有が空振りしていない = 常に false を返す関数ではない)',
      PROD_VERDICT.j1 === true && PROD_VERDICT.j2 === true
        && PROD_VERDICT.j3 === true && PROD_VERDICT.j4 === true
        && (PROD_VERDICT.j1 && PROD_VERDICT.j2 && PROD_VERDICT.j3 && PROD_VERDICT.j4) === true,
      JSON.stringify(PROD_VERDICT));

    /* ── 負のコントロール 2 本: スイッチが「スイッチ」であること ────────── */
    const p8n = await openPage('/title.html', { prologueSeen: false });
    const o8n = await p8n.evaluate(probeTitleSlots);
    await p8n.close();
    check('(8z2) [負のコントロール] クエリを外した **同じ入口** では同じ judgeSlotsScreen が true になる',
      judgeSlotsScreen(o8n) === true,
      JSON.stringify({ screenSlots: o8n.screenSlots, n: (o8n.cards || []).length }));

    const p8x = await openPage('/title.html?title=1', { prologueSeen: false });
    const o8x = await p8x.evaluate(probeTitleSlots);
    await p8x.close();
    check('(8z3) [装置] ?title=1 のような別の値では素通りしない (has() ではなく ==="0" で判定している)',
      judgeSlotsScreen(o8x) === true && /\/title\.html$/.test((o8x.href || '').split('?')[0]),
      JSON.stringify({ href: o8x.href, screenSlots: o8x.screenSlots }));
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 実装ステップ 5. : ゲームを起動.vbs の飛び先
   * ⚠ VBS の GUI 起動 (WScript) はヘッドレスから回せない。代わりに
   *   「VBS が指すパスが実際に配信され、title.html として立つ」ところまでを機械で測る。
   *   ⭐ 実機でのダブルクリック起動 (新規 / 続き 両方) は **人間の宿題**として残る。
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 実装ステップ 5. : ゲームを起動.vbs の飛び先 ---');
  {
    const VBS_NAME = 'ゲームを起動.vbs';
    const vbsSrc = fs.readFileSync(path.join(ROOT, VBS_NAME), 'utf8');
    /* url = "http://localhost:" & port & "/xxx.html"  の末尾のパスを取り出す。
       ⚠ 行番号で切らない (動く)。`url =` の代入行を識別子で拾う。 */
    const urlLines = vbsSrc.split(/\r?\n/).filter(l => /^\s*url\s*=/.test(l));
    const m = urlLines.length === 1 ? urlLines[0].match(/"(\/[^"]+)"\s*$/) : null;
    const urlPath = m ? m[1] : null;

    check('(v0) [装置] ' + VBS_NAME + ' から飛び先のパスをちょうど 1 本取り出せた (走査が空振りしていない)',
      urlLines.length === 1 && !!urlPath,
      JSON.stringify({ nUrlLines: urlLines.length, urlPath }));

    check('(v1) ★STEP5: ' + VBS_NAME + ' の飛び先が /title.html になっている',
      urlPath === '/title.html', JSON.stringify({ urlPath, line: (urlLines[0] || '').trim() }));

    check('(v2) [装置] ポートと起動コマンドは無改修 (飛び先だけ差し替えた)',
      /port\s*=\s*"8765"/.test(vbsSrc) && /http\.server/.test(vbsSrc) && /shell\.Run url/.test(vbsSrc),
      JSON.stringify({ hasPort: /port\s*=\s*"8765"/.test(vbsSrc), hasServer: /http\.server/.test(vbsSrc) }));

    /* ★ 「そのパスが実際に配信されて title.html として開ける」ところまで測る。
       文字列比較だけだと、綴り間違いや未配置のファイルを指していても緑になる。 */
    let vOpened = null;
    if (urlPath) {
      const pv = await openPage(urlPath, { prologueSeen: false });
      vOpened = await pv.evaluate(probeTitleSlots);
      await pv.close();
    }
    check('(v3) ★STEP5: VBS が指すパスを実際に開くとタイトル画面が立つ (同じ judgeSlotsScreen が true)',
      !!vOpened && judgeSlotsScreen(vOpened) === true,
      JSON.stringify({ urlPath, screenSlots: vOpened && vOpened.screenSlots,
                       n: vOpened ? (vOpened.cards || []).length : 0 }));
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 受入条件 9. : 幅 390px (compact) と 横長デスクトップの **両方**で、
   *   スロット 3 枚とクラスカード 6 枚が **横スクロールを出さずに**収まる
   *
   * ── ⚠⚠ 母集団は「画面の向き」でも割れる ──────────────────────────────
   *   compact 390 だけで測って横長デスクトップの欠陥を 2 つ見逃した前例がある (P7)。
   *   → 390 / 1440 を **どちらも ★ の本チェックとして別々に**立てる。
   *     さらに 1 列 ⇄ 3 列 が切り替わる境界 720px も足す (切り替わり際が最も危ない)。
   *
   * ── ⚠⚠ 「いちばん横幅が要る状態」を必ず踏む (項目 3 からの申し送り) ────
   *   確認行が開くと .confirmRow にボタンが 2 個増えて幅が変わる。**空 3 枚だけで測ると
   *   その状態を一度も踏まない**。→ 3 状態を全ビューポートで測る:
   *     A: 画面 1 / 空 3 枚
   *     B: 画面 1 / 埋 3 枚 + 確認行が開いている   ← 最大幅
   *     C: 画面 2 / 名乗り 6 枚 + 1 枚の詳細が開いている
   *   ⚠ 画面 2 だけを測っていたら当時の欠陥を見逃していた、という実績があるので画面 1 も測る。
   *
   * ── ⚠ 縦スクロールは禁じない ──────────────────────────────────────────
   *   依頼書の条件は「**横**スクロールを出さずに」。390x844 では実測で縦がわずかに出るが可。
   *   judgeNoHScroll() は scrollHeight を一切見ない。
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 受入条件 9. : 390px と横長デスクトップの両方で横スクロールが出ない ---');
  {
    const L9_PICK = 'mage';           // 詳細を開くカード (どれでもよい)
    const SEL_NEW1 = '#slotList .slotCard[data-slot="1"] button[data-act="new"]';
    const SEL_YES1 = '#slotList .slotCard[data-slot="1"] .slotConfirm button[data-act="confirm-yes"]';
    const L9_LIVE = {
      'dragonfighters.xp': '31000',
      'dragonfighters.gold': '2468',
      'dragonfighters.partyComposition': JSON.stringify(['cleric']),
    };

    /* ⚠ df.slotN の JSON 形式を **ドライバに書き写さない**。本番の DFSlots.snapshot() に
       1 枚作らせて、その実物を 2 枚目・3 枚目の種にする (形式が変わっても腐らない)。
       ⭐ 3 枚とも埋めるのは、横長で 3 列に並んだときの最大量を踏むため。 */
    let SLOT_JSON = null;
    {
      const pb = await openPage('/title.html', { seed: L9_LIVE });
      SLOT_JSON = await pb.evaluate(() => {
        try { DFSlots.snapshot(); return localStorage.getItem(DFSlots._slotKey(1)); }
        catch (e) { return null; }
      });
      await pb.close();
    }
    check('(9z0) [装置] 本番の DFSlots.snapshot() から「埋まったスロット」の実データを 1 枚採れた',
      typeof SLOT_JSON === 'string' && SLOT_JSON.length > 20 && SLOT_JSON.indexOf('"meta"') >= 0,
      JSON.stringify({ len: SLOT_JSON ? SLOT_JSON.length : 0, head: (SLOT_JSON || '').slice(0, 60) }));

    const L9_SEED = Object.assign({}, L9_LIVE, {
      'df.activeSlot': '1', 'df.slot2': SLOT_JSON || '', 'df.slot3': SLOT_JSON || '',
    });

    const VIEWPORTS = [
      { key: 'compact390', label: '幅 390px (compact)',
        vp: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
      { key: 'desktop1440', label: '横長デスクトップ 1440x900',
        vp: { width: 1440, height: 900, deviceScaleFactor: 1 } },
      { key: 'break720', label: '境界 720px (1 列 ⇄ 3 列 の切り替わり点)',
        vp: { width: 720, height: 900, deviceScaleFactor: 1 } },
    ];

    const waitNaming = (pg) => pg.waitForFunction(() => {
      var e = document.getElementById('screenNaming'); return !!e && e.classList.contains('active');
    }, { timeout: 10000 });

    async function measureAt(vp) {
      /* A: 空 3 枚。⚠ openPage の既定は prologueSeen を仕込む = active スロットが
         「記録あり」になってしまうので、ここだけ false にして 3 枚とも空にする。 */
      const pA = await openPage('/title.html', { viewport: vp, prologueSeen: false });
      const oA = await pA.evaluate(probeLayout);
      await pA.close();

      // B: 埋 3 枚 + 確認行が開いた状態 (最大幅) → そのまま C: 名乗りへ進む
      const pB = await openPage('/title.html', { viewport: vp, seed: L9_SEED });
      await pB.click(SEL_NEW1);
      await pB.waitForFunction((s) => !!document.querySelector(s), { timeout: 10000 }, SEL_YES1);
      await sleep(250);
      const oB = await pB.evaluate(probeLayout);

      await pB.click(SEL_YES1);
      await waitNaming(pB);
      await pB.click('#classCards .classCard[data-class-key="' + L9_PICK + '"]');
      await sleep(250);
      const oC = await pB.evaluate(probeLayout);
      await pB.close();
      return { A: oA, B: oB, C: oC };
    }

    const fmt = (o) => o.clientWidth + 'w scroll=' + o.scrollWidth + '/body=' + o.bodyScrollWidth
      + ' scrolledX=' + o.scrolledX + ' over=' + o.nOverflowers + ' (縦 ' + o.scrollHeight + '/' + o.clientHeight + ')';

    for (const V of VIEWPORTS) {
      const m = await measureAt(V.vp);
      console.log('  [' + V.label + ']');
      console.log('      A 空3枚          : ' + fmt(m.A));
      console.log('      B 埋3枚+確認行   : ' + fmt(m.B));
      console.log('      C 名乗り6枚+詳細 : ' + fmt(m.C));
      if (m.B.nOverflowers) console.log('      ⚠ はみ出し(B): ' + JSON.stringify(m.B.overflowers));
      if (m.C.nOverflowers) console.log('      ⚠ はみ出し(C): ' + JSON.stringify(m.C.overflowers));

      /* ★ 装置を先に立てる。「空っぽのページには横スクロールが出ない」で緑になる穴を塞ぐ。 */
      check('(9z-' + V.key + ') [装置] ' + V.label + ' で 3 状態が実際に「空3枚 / 埋3枚+確認行 / 名乗り6枚+詳細」だった',
        judgeLayoutPopulated(m.A, 'slots') && judgeLayoutPopulated(m.B, 'armed')
          && judgeLayoutPopulated(m.C, 'naming'),
        JSON.stringify({ A: { slots: m.A.nSlotCards, filled: m.A.nFilledCards },
                         B: { slots: m.B.nSlotCards, filled: m.B.nFilledCards, confirmBtns: m.B.nConfirmBtns },
                         C: { cards: m.C.nClassCards, openDetails: m.C.nOpenDetails } }));

      check('(9-' + V.key + ') ★受入条件9: ' + V.label + ' で 3 状態すべて横スクロールが出ない (縦は可)',
        judgeNoHScroll(m.A) && judgeNoHScroll(m.B) && judgeNoHScroll(m.C),
        JSON.stringify({ A: fmt(m.A), B: fmt(m.B), C: fmt(m.C),
                         over: [].concat(m.A.overflowers, m.B.overflowers, m.C.overflowers).slice(0, 4) }));
    }

    /* ── 負のコントロール: 検出器が空振りしていないこと ──────────────────
       わざと画面より広い要素を 1 つ差し込み、**同じ judgeNoHScroll** が false になるか見る。
       ⚠ これが無いと「常に true を返す測定器」を永久に緑のまま持ち続けられる。
       ⚠⚠ **全ビューポートで回す。** compact だけ isMobile エミュレーションが効いており、
          モード次第で死ぬ物差しが実在する (scrollX がまさにそれで、ここで発覚した)。
          「両方で測る」は本チェックだけでなく **検出器そのもの**にも要る。
       ⭐ 判定に使う 3 本 (scrollWidth / body.scrollWidth / はみ出し要素) が
          **どれも**反応することまで個別に書き出す。1 本しか効いていない測定器を見逃さない。 */
    for (const V of VIEWPORTS) {
      const pN = await openPage('/title.html', { viewport: V.vp, prologueSeen: false });
      const clean = await pN.evaluate(probeLayout);
      await pN.evaluate(() => {
        var host = document.getElementById('titleRoot');
        var d = document.createElement('div');
        d.id = '__dfWideProbe';
        d.style.cssText = 'width:' + (document.documentElement.clientWidth + 400) + 'px;height:6px;flex:none;';
        host.appendChild(d);
      });
      await sleep(250);
      const dirty = await pN.evaluate(probeLayout);
      await pN.close();
      check('(9n-' + V.key + ') [負のコントロール] ' + V.label + ' で広すぎる要素を 1 つ差し込むと **同じ judgeNoHScroll** が false になる',
        judgeNoHScroll(clean) === true && judgeNoHScroll(dirty) === false
          && dirty.scrollWidth > dirty.clientWidth          // ① 反応した
          && dirty.bodyScrollWidth > dirty.clientWidth      // ② 反応した
          && dirty.nOverflowers >= 1                        // ③ 反応した
          && (dirty.overflowers || []).some(e => e.id === '__dfWideProbe'),
        JSON.stringify({ clean: fmt(clean), dirty: fmt(dirty),
                         hit: (dirty.overflowers || []).map(e => e.id || e.cls) }));
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 受入条件 10. : 最初のタップで GameAudio.unlock() が呼ばれる / BGM は鳴らない
   *
   * ── ⚠⚠⚠ スパイは「最初のクリックより前」に仕掛ける ────────────────────
   *   title.html の解錠は pointerdown の { once:true }。**先に 1 回踏むと二度と発火しない**
   *   ので、後から仕込むと永久に 0 回のまま = 偽の赤になる (項目 2 からの申し送り)。
   *   → openPage() 直後・どのクリックよりも前に installAudioSpy() を通す。
   *
   * ── ⚠⚠ 「playBgm 0 回」はスパイの掛け損ねでも緑になる ────────────────
   *   0 回を主張するには「掛かっていた」証拠が要る。3 段で塞ぐ:
   *     ① installed.playBgm === true … 実際に関数を包めた
   *     ② unlockAfter === 1          … **同じスパイ機構**が別の関数で 1 回数えている
   *     ③ (10n)                      … その playBgm を手で 1 回叩くと確かに数が増える
   *   ⚠ ③ で渡す名前は **存在しないトラック名**にする。実在の曲名だと playBgm が
   *      mp3 の取得まで進み、測定のために音を鳴らすことになる (副作用を持ち込まない)。
   * ══════════════════════════════════════════════════════════════════════ */
  console.log('\n--- 受入条件 10. : 最初のタップで GameAudio.unlock() / BGM は鳴らさない ---');
  {
    /* ⚠ 透過ラッパ。元の関数をそのまま呼び、挙動を一切変えない。 */
    const installAudioSpy = (pg) => pg.evaluate(() => {
      var out = { threw: '', hasGameAudio: false, installed: {} };
      try {
        var G = window.GameAudio;
        out.hasGameAudio = !!G;
        var spy = { unlock: 0, bgmCalls: [], sfxCalls: [] };
        window.__dfAudio = spy;
        ['unlock', 'playBgm', 'playSfx'].forEach(function (k) {
          if (!G || typeof G[k] !== 'function') { out.installed[k] = false; return; }
          var orig = G[k];
          G[k] = function () {
            var a = Array.prototype.slice.call(arguments).map(String);
            if (k === 'unlock') spy.unlock++;
            else if (k === 'playBgm') spy.bgmCalls.push(a);
            else spy.sfxCalls.push(a);
            return orig.apply(this, arguments);
          };
          out.installed[k] = true;
        });
      } catch (e) { out.threw = String((e && e.message) || e); }
      return out;
    });
    const readSpy = (pg) => pg.evaluate(() => {
      var s = window.__dfAudio || { unlock: 0, bgmCalls: [], sfxCalls: [] };
      return { unlock: s.unlock, bgmCalls: s.bgmCalls.slice(), sfxCalls: s.sfxCalls.slice() };
    });

    const p10 = await openPage('/title.html', { prologueSeen: false });
    const ins = await installAudioSpy(p10);
    const spy0 = await readSpy(p10);                       // ★ どのクリックよりも前

    /* ★ 実座標クリック。page.click は pointerdown → mousedown → mouseup → click を出すので、
       本番と同じく { once:true } の pointerdown リスナが発火する。 */
    await p10.click('#slotList .slotCard[data-slot="1"] button[data-act="new"]');
    await p10.waitForFunction(() => {
      var e = document.getElementById('screenNaming'); return !!e && e.classList.contains('active');
    }, { timeout: 10000 });
    const spy1 = await readSpy(p10);

    // タイトルに居る間ずっと BGM が鳴らないこと。名乗りまで進めてもう一度読む。
    await p10.click('#classCards .classCard[data-class-key="rogue"]');
    await sleep(300);
    const spy2 = await readSpy(p10);

    const verdict = Object.assign({}, ins, {
      unlockBefore: spy0.unlock, unlockAfter: spy2.unlock, bgmCalls: spy2.bgmCalls,
    });

    console.log('  [スパイ] installed=' + JSON.stringify(ins.installed)
      + ' / unlock 0回目→' + spy0.unlock + ' 1タップ後→' + spy1.unlock + ' 名乗りまで→' + spy2.unlock
      + ' / sfx=' + spy2.sfxCalls.length + ' / bgm=' + spy2.bgmCalls.length);

    check('(10z0) [装置] スパイが 3 本とも実際に掛かっていて、タップ前は unlock 0 回だった',
      ins.threw === '' && ins.hasGameAudio === true
        && ins.installed.unlock === true && ins.installed.playBgm === true && ins.installed.playSfx === true
        && spy0.unlock === 0 && spy0.bgmCalls.length === 0,
      JSON.stringify({ installed: ins.installed, before: spy0.unlock }));

    check('(10) ★受入条件10: 最初のタップで GameAudio.unlock() がちょうど 1 回呼ばれ、BGM が title でちょうど 1 回鳴る',
      judgeTitleAudio(verdict) === true && spy1.unlock === 1,
      JSON.stringify({ unlockBefore: spy0.unlock, afterFirstTap: spy1.unlock, afterNaming: spy2.unlock,
                       bgm: spy2.bgmCalls }));

    check('(10a) [装置] 同じスパイ機構が **効果音は数えている** (「何も鳴らない実装」で緑になっていない)',
      spy2.sfxCalls.length >= 1 && spy2.sfxCalls.every(a => a[0] === 'button'),
      JSON.stringify({ n: spy2.sfxCalls.length, ids: spy2.sfxCalls.map(a => a[0]) }));

    /* ── 負のコントロール: その playBgm スパイは本当に数えられるのか ──────
       ⚠ 存在しないトラック名を渡す。playBgm は TRACKS/BGM_FILES のどちらにも無い名前なら
         早期 return するので、**測定のために音を鳴らさずに**ラッパだけを通せる。 */
    const NO_SUCH = '__df_probe_no_such_track';
    /* ⚠ #20 で反転: タイトルが自分で title を 1 本鳴らしているので **開始点は 0 でなく 1**。 */
    const bgmBefore = (await readSpy(p10)).bgmCalls.length;
    await p10.evaluate((n) => { try { GameAudio.playBgm(n); } catch (e) {} }, NO_SUCH);
    const spy3 = await readSpy(p10);
    await p10.close();
    check('(10n) [負のコントロール] playBgm を手で 1 回叩くと **同じスパイ**が 1 本増える (回数の一致は掛け損ねではない)',
      bgmBefore === 1 && spy3.bgmCalls.length === 2 && spy3.bgmCalls[1][0] === NO_SUCH
        && judgeTitleAudio(Object.assign({}, verdict, { bgmCalls: spy3.bgmCalls })) === false,
      JSON.stringify({ before: bgmBefore, after: spy3.bgmCalls }));
  }

  /* 受入条件 11. (既存 golden ドライバの非退行) は **本ドライバの外**で回す。
     ⚠ 受入条件 5. で tavern.html の DOM に .locked-out と title 属性が増えている。
       canvas の SHA しか見ない golden では検出できないので、5b / 7b が直接測っている。 */

  /* ══ 装置 assert: 測定点が本当に「街を通り抜けた後」へ移ったか (依頼書 #12 受入条件 14) ══
     ⚠⚠⚠ これが無いと、街が丸ごと壊れて誰も town.html に着かなくなっても
       arriveTavern が毎回「素通り」に落ちて **全部緑のまま**になる。
       移せたことを 1 本の assert で押さえるのが、期待値を緩めない張り替えの条件。
     ⚠ 街の側でクエリを足していないことも、通り抜けたときの search で見る。 */
  check('(TZ) [装置] 受入条件 2/3/4 の観測が **実際に街を通り抜けた後**で採られている '
        + '(素通りだけで緑になっていない)',
    townTrip.legs >= 3 && townTrip.firstSearch.every(s => s === ''),
    JSON.stringify({ 街を通った回数: townTrip.legs, 素通り: townTrip.skips,
                     街に着いた時のsearch: townTrip.firstSearch }));

  /* ══ 装置 assert: 測定点が「地方全景 (world.html) も通り抜けた後」へ移ったか (依頼書 #21) ══
     ⚠⚠⚠ これが無いと、ワールドマップが丸ごと壊れて誰も world.html に着かなくなっても
       passWorld() が毎回「素通り」に落ちて **全部緑のまま**になる。(TZ) と同じ役目。
     ⚠ 地方全景の側でクエリを足していないことも、着いたときの search で見る
       (足すと「タイトルから来た」と「ダンジョンから帰った」で入口が 2 種類になる)。 */
  check('(WZ) [装置] 受入条件 2/3/4/8 の観測が **実際に地方全景を通り抜けた後**で採られている '
        + '(素通りだけで緑になっていない)',
    worldTrip.legs >= 3 && worldTrip.firstSearch.every(s => s === ''),
    JSON.stringify({ 地方全景を通った回数: worldTrip.legs, 素通り: worldTrip.skips,
                     地方全景に着いた時のsearch: worldTrip.firstSearch }));

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
