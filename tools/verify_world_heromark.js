#!/usr/bin/env node
/*
 * verify_world_heromark.js — ワールドマップの頭上マーカー ▽ (#43) の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-03_world-heromark.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§4 + §9 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる
 *   (手本 = tools/verify_world_steps.js / tools/verify_world_map.js)。
 *
 * ■ 項目 1 (このコミット) で実際に測れるもの — **装置だけ**
 *     (0a) 装置   … #worldHeroMark が DOM に実在し、__world.heroMarkOn() が true、
 *                   __world.heroMarkGeom() が {w,h,gap,headTop,sprite,foot} の 6 キーを
 *                   **すべて有限の数値** (かつ 0 でない) で返す
 *                   ⭐⭐⭐ これが無いと §1〜§2 が全部空振りで永久緑になる
 *                   ⚠ キー集合だけでなく **型と値** まで見る (#38 の教訓 =
 *                     「キー集合だけの恒等 assert は変異を検出できない」)
 *     (0b) 2 経路 … #worldHeroMark の getBoundingClientRect() の実寸を __world.zoom() で
 *                   割った値が heroMarkGeom() の w*2 / h と 0.5px 以内で一致
 *                   ⭐ 左辺 = ブラウザのレイアウト結果 / 右辺 = JS の値 の **2 経路**。
 *                     CSS (--hm-w / --hm-h) と JS (HM_W / HM_H) へ同じ数値を写経した
 *                     ズレを殺すのがこの 1 本の役目 (負のコントロール markwide が証明する)
 *                   ⛔ 9 / 13 をドライバへ直書きしない
 *     (0c) 2 経路 … 主人公の幾何も __world.heroGeom() から採る (sprite / foot が有限で正)。
 *                   さらに #worldHero の実寸 / zoom が sprite と 0.5px 以内で一致する
 *                   ⛔ 96 / 0.93 をドライバへ写経しない (verify_world_map.js:511 と同じ作法)
 *     (0d) 装置   … 変異アンカーの実装漏れが 0 件 (⛔ 件数から隠さない = 項目 4 の担当)
 *     (9a) 事故   … 測定ページで pageerror / console.error が出ていない
 *                   ⭐ **素と撤退 (?heromark=0) の両アーム**を同じ errs へ流し込む
 *                     (依頼書 §8 (9a) が「両アーム」と明記している)
 *
 * ■ 項目 2 以降が埋めるもの (今は PENDINGS)
 *   §1 追従と収まり
 *     (1a) 初期位置で ▽ の見た目の中心 x が主人公の中心 x と 1px 以内、
 *          下端 y が heroRect.top + (headTop - gap) * zoom と 1px 以内
 *          ⭐ 右辺は __world.heroPx() + heroGeom() + heroMarkGeom() から **ドライバが独立に計算**
 *          ⛔ elMark.style.top の文字列を読んで比べない (実装の写経になる)
 *     (1b) ★ ▽ の矩形が #worldHero の矩形に **完全に含まれる** (4 辺すべて)。
 *          bob は margin-top を 0→4px 動かすので **1 周期 (1.2s) を 12 点サンプリングして最悪値**
 *          ⭐⭐⭐ これが verify_world_map の (7f)「駒が札を 10% 以上隠さない」を
 *            ▽ にも継承させる **唯一の条件** (依頼書 §2-2)
 *     (1c) 実クリックで 3 ホップ歩かせた後も (1a) が成り立つ
 *          ⚠ 母集団ガード: heroNode() が押す前と変わっていること
 *          ⛔ 行き先に phlan (enter を持つ唯一のノード) を選ばない
 *     (1d) 移動中 (isMoving() === true のサンプル) でも中心 x が 2px 以内
 *          ⚠ 母集団ガード: isMoving() が true のサンプルが 1 件以上あること
 *     (1e) 全 14 ノードに立った場合の ▽ の矩形が 7 枚の .worldSign と 1px も交差しない
 *          ⭐ (7f) と同じ手口で **実際には歩かせず計算で出す**
 *          ⛔ 期待値 19.72px をドライバへ書かない。縛るのは「交差 0」だけ
 *          ⚠ 母集団: 照合した組が 14 x 7 = 98 件あること
 *     (1f) computed の zIndex が #worldHero より **大きい**
 *          ⛔ 6 という数値そのものは書かない (§2-4 の「並びが違う」を関係で縛る)
 *   §2 非干渉
 *     (2a) ★ 全 14 ノード + 全刻み点マーカーの **中心 + 四隅の内側 8px の 5 点** を
 *          elementFromPoint し、返る要素が #worldHeroMark でもその子孫でもない
 *          ⚠ 母集団ガード: 検査した点の数が (14 + STEPS 件数) x 5 と一致し 0 でないこと
 *          ⭐⭐⭐ 「矩形が交差しない」ではなく **「その 1 点を奪わない」** を測る
 *            (#42 の教訓 — 押し込む向きで奪う隅が変わるので中心 1 点では捕まらない)
 *          ⚠⚠ ▽ は pointer-events: none なので「▽ が返らない」だけでは **自明に緑**。
 *            変異 markhit を赤にできることを --negative で担保する
 *     (2b) .worldStep の DOM 件数が WORLD_MAP.STEPS と一致し .worldNode が 14 件。
 *          かつ #worldHeroMark が .worldNode も .worldStep も着ていない (classList.length === 0)
 *          ⚠ 着せると verify_world_map.js:736/:1187 と verify_quest_walk.js:547 が誤爆する
 *   §3 恒等 (非退行)
 *     (3a) Object.keys(window.__world) が #42 時点のキー集合をすべて含み、
 *          増えたのは heroMarkOn / heroMarkGeom の 2 つだけ。
 *          ⭐ 2 つとも typeof === 'function' で、呼んで boolean / 有限値が返ることまで見る
 *     (3b) .worldSign が 7 枚、点線 <line> が EDGES.length 本のまま
 *   §4 撤退 ?heromark=0
 *     (4a) document.getElementById('worldHeroMark') === null (**DOM に無い**)
 *     (4b) ★ 素のアームを同じ assert に同居させる — (1a) && (1b) && (2a) の conjunction を
 *          両アームへ当て、素では全部真、?heromark=0 では (1a) が偽で崩れる
 *          ⭐⭐ 撤退アームだけを見ると永久緑になる (#39 の教訓)
 *     (4c) 撤退のしすぎも測る — .worldStep 件数 / .worldSign 7 枚 / heroPx() / heroNode() /
 *          zoom() が素のアームと一致する
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   ▽ の色 #ffd24a / drop-shadow の強さ / bob の速さ (1.2s) と振幅 (4px) /
 *   compact (iPhone) での見かけの大きさ / **z-index の数値 6 そのもの** /
 *   .worldSign の bottom: calc(100% + 76px)。
 *   ⭐ どれも §9 の実機体感で判断する項目であって、機械では縛らない。
 *
 * ■ ⭐⭐⭐ 測定は **本番で配信される `/world.html` の上で行う**
 *   ⛔ 自前ハーネスに #worldHeroMark だけを載せない — 本番ページだけが壊れているケースを
 *      永久に緑と報告するため。
 *
 * ■ ⭐⭐⭐ 配信バイトは **起動時に 1 回だけ読んで凍結する** (下の SRC / MUT_SRC)。
 *   別窓が world.html を保存しても、走行中に混合ビルドにならない。
 *   ⭐ 変異の対象は **world.html の 1 枚だけ** でよい (▽ は world.html で完結する)。
 *     変異アンカーが index.html / town.html の同名行と衝突する心配は無い (配信しないので)。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   ⚠⚠ 項目 1 (このコミット) では **7 本すべて器だけ** (impl: false)。中身は項目 4 が入れる。
 *     ⭐ 器でも MUT_ORDER には全部並べる = --negative が PENDING で 7 本ぶん出すので、
 *       「実装を忘れた変異」が件数から消えない。
 *
 *   mutate      | 注入する欠陥                                                | 赤くなるべき節
 *   markbox     | HM_GAP を 8 → 30 へ (▽ が 96px セルの外へ出る)               | (1b)
 *   markstill   | placeHero の elMark.style.top を定数へ固定 (取り残される)     | (1a)(1c)
 *   markhit     | #worldHeroMark を pointer-events: auto にする                | (2a)
 *   markwide    | CSS --hm-w だけ 9px → 16px (JS の HM_W は 9 のまま=写経ズレ)   | (0b)
 *   marklow     | #worldHeroMark の z-index: 6 → 1                            | (1f)
 *   markalways  | 撤退の HERO_MARK_ON = false を潰す                            | (4a)(4b)
 *   marksign    | .worldSign の bottom を calc(100% + 20px) へ (札が降りてくる)  | (1e)
 *
 *   ⭐ §2-2 の罠を再現する変異 = markbox。これが赤くならないなら (1b) は書かれていない
 *     = verify_world_map (7f) の保証が ▽ へ届いていない。
 *   ⭐ marksign は「▽ 側は正しいのに札のほうが降りてきた」ケースを (1e) が捕まえる証明。
 *
 *   ⚠ 変異アンカーは **部分文字列一致**で、配信スナップショット中に **ちょうど 1 箇所**
 *     ヒットしなければ **exit 3 でドライバごと死ぬ** (0 件でも 2 件以上でも空振りするため)。
 *   ⚠ 置換文字列は **1 行に閉じる** (world.html は CRLF なので複数行アンカーは必ず空振りする)。
 *   ⚠ 置換前後で **長さを変える** (同じ長さだと「当たったのに何も変わらない」を検出できない)。
 *   ⭐ アンカーに選んだ行は **整形し直さない**。
 *   ⭐ 変異が空振りしたら、**変異のほうを直す** (受入条件を弱めない = #38 の教訓)。
 *   ⭐ 下の from / to は 2026-09-03 に項目 1 が world.html 実物へ grep -cF して
 *     **7 本とも 1 件ヒット**を確認済み。⚠ ただし「当たること」と「赤くなること」は別。
 *     項目 4 が --negative を 1 回回して、空振りがあれば変異のほうを直すこと。
 *
 * ⚠ ポート **9490** (+1..+10 が --negative 用 = 9491〜9500)。
 *   2026-09-03 実測の使用中: 9412 / 9440 / 9451(+4) / 9460 / 9470 / 9480 /
 *   9530 / 9540 / 9573(#41 は 9586 まで) / 9600(#42 は 9615 まで)。⇒ 9490 番台は空き。
 *   ⛔ 他のドライバのポートは触らない。
 *
 * 使い方:
 *   node tools/verify_world_heromark.js               # 受入条件 (素の配信)
 *   node tools/verify_world_heromark.js --negative    # 負のコントロール (赤くならなければ exit 1)
 *   node tools/verify_world_heromark.js --mutate markbox   # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '9490'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (項目 4 が中身を入れる。⚠ 今は器だけ = 全部 impl: false)
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
// ⚠⚠ world.html は **ディスク上 CRLF** (2026-09-03 実測: 1156 CRLF / LF 単独 0)、
//    tools/*.js は LF。アンカーは行内文字列にすること (改行をまたがない)。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  /* ⭐ 依頼書 §2-2 の罠そのもの = ▽ を主人公の 96px セルの **外** へ押し出す。
     HM_GAP + HM_H = 30 + 13 = 43 > HEAD_TOP = 32 なので、▽ の上端が箱の上端を突き抜ける。
     ⚠⚠⚠ (7f)/(1b) が無ければ **誰も気づかない** 種類の欠陥 = この変異が (1b) の存在証明。 */
  markbox: { impl: false, file: 'world.html', targets: ['1b'],
    why: 'HM_GAP を 8 → 30 へ (▽ が主人公の 96px セルの外へ出る)',
    from: 'var HEAD_TOP = 32, HM_GAP = 8,',
    to: 'var HEAD_TOP = 32, HM_GAP = 30,  /* MUT markbox */' },
  /* ⭐ 「位置の出所を 2 つ持つと歩くと ▽ だけ取り残される」(依頼書 §2-5) の再現。
     ⚠ left は残して top だけ固定する = 「x は追うのに y だけ死ぬ」= (1a) の y 側が赤くなる。 */
  markstill: { impl: false, file: 'world.html', targets: ['1a', '1c'],
    why: 'placeHero の elMark.style.top を定数へ固定する (歩いても ▽ が取り残される)',
    from: 'elMark.style.top  = (cy - SPRITE * FOOT + HEAD_TOP - HM_GAP - HM_H) + "px";',
    to: 'elMark.style.top = "300px";  /* MUT markstill */' },
  /* ⭐ 依頼書 §2-6 の罠 = ▽ が誰かの当たり判定を奪う。
     ⚠⚠ アンカーに `pointer-events: none;` の行そのものは使えない (world.html 内に複数ある)。
       ⇒ 同じルールの **後ろ** へ pointer-events: auto を足す (同一ルール内は後勝ち)。
       `animation: heroMarkBob ...` の行は 2026-09-03 実測で world.html 内に 1 件だけ。 */
  markhit: { impl: false, file: 'world.html', targets: ['2a'],
    why: '#worldHeroMark を pointer-events: auto にする (札 / ノード / 刻み点の点を奪う)',
    from: '      animation: heroMarkBob 1.2s ease-in-out infinite;',
    to: '      pointer-events: auto; animation: heroMarkBob 1.2s ease-in-out infinite;  /* MUT markhit */' },
  /* ⭐⭐⭐ (0b) の存在証明 = **CSS だけ**を動かして JS の HM_W は 9 のまま残す。
     ⚠ CSS と JS の両方を動かすと (0b) は緑のまま通ってしまう (写経ズレを再現できない)。
       ⇒ 触るのは --hm-w の 1 行だけ。 */
  markwide: { impl: false, file: 'world.html', targets: ['0b'],
    why: 'CSS --hm-w だけ 9px → 16px へ (JS の HM_W は 9 のまま = 写経ズレ)',
    from: '--hm-w: 9px;',
    to: '--hm-w: 16px;  /* MUT markwide */' },
  marklow: { impl: false, file: 'world.html', targets: ['1f'],
    why: '#worldHeroMark の z-index を 6 → 1 へ (主人公 5 の下へ潜る)',
    from: '      z-index: 6;',
    to: '      z-index: 1;  /* MUT marklow */' },
  markalways: { impl: false, file: 'world.html', targets: ['4a', '4b'],
    why: '撤退 ?heromark=0 を無視する (HERO_MARK_ON を落とさない)',
    from: 'if (new URLSearchParams(location.search).get("heromark") === "0") HERO_MARK_ON = false;',
    to: 'HERO_MARK_ON = true;  /* MUT markalways */',
    /* ⚠ この変異だけ **撤退アームの観測**が要る。片方だけにすると「撤退の観測が無い」で
       機械的に赤くなり、欠陥を検出したのか装置が欠けたのか読めなくなる。 */
    needsRetreat: true },
  /* ⭐ 「▽ 側は正しいのに札のほうが降りてきた」ケース。(1e) だけが捕まえる。
     ⚠⚠ ▽ を動かす変異ではないので (1a)(1b) は緑のまま = (1e) が独立に要る証明になる。 */
  marksign: { impl: false, file: 'world.html', targets: ['1e'],
    why: '.worldSign の bottom を calc(100% + 20px) へ (札が ▽ の高さまで降りてくる)',
    from: 'left: 50%; bottom: calc(100% + 76px);',
    to: 'left: 50%; bottom: calc(100% + 20px);  /* MUT marksign */' },
};
const MUT_ORDER = ['markbox', 'markstill', 'markhit', 'markwide', 'marklow', 'markalways', 'marksign'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_SERVED = MUT_IMPL.filter(k => !MUTATIONS[k].driver);
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING): ' + MUTATIONS[MUTATE].why);
  process.exit(3);
}

/* ⭐⭐⭐ 配信バイトの凍結。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。
 *  ⛔ リクエストのたびに fs.readFileSync しない — 別窓が world.html を保存すると
 *     走行中に「素の行」と「変異後の行」が混ざったビルドを配ってしまう。 */
const SRC = {};
const MUT_SRC = {};
for (const k of MUT_SERVED) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する');
    process.exit(3);
  }
  const n = SRC[m.file].split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: SRC[m.file].split(m.from).join(m.to) };
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

const PAGE_PATH = '/world.html';
/* ⭐ 撤退のクエリ。§4 (項目 4) が本番で使い、項目 1 では (9a) の「両アーム」だけに使う。 */
const RETREAT_QUERY = '?heromark=0';

function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/* 書体 + 画像が届いて layout() が落ち着くまで待つ。⛔ 固定時間だけに頼らない。 */
async function settle(page) {
  try { await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null); } catch (e) {}
  await sleep(260);
}
function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定 (PASSED / FAILED / PENDING の 3 値)
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + name + (detail ? '  — ' + detail : ''));
}
function pending(name, why) {
  results.push({ name: name, state: 'PENDING', detail: why || '' });
  console.log('  **PENDING** ' + name + (why ? '  — ' + why : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

/* (0b)(0c) 「実描画の矩形 ÷ zoom」と「JS の値」の許容差。
 *  ⭐ 本来はぴったり一致する。0.5px は getBoundingClientRect のサブピクセル丸めぶんだけ。
 *  ⛔ ここを緩めない — 9px → 16px の写経ズレは zoom 込みでも 5.7px の差になるので、
 *     0.5px でも 5px でも markwide は赤くなるが、緩めると **小さいズレを見逃す**。 */
const GEOM_EPS = 0.5;
/* ▽ の 6 キー。⛔ 値は書かない (存在と型と「0 でないこと」だけを縛る)。 */
const MARK_GEOM_KEYS = ['w', 'h', 'gap', 'headTop', 'sprite', 'foot'];

const isFiniteNum = (v) => typeof v === 'number' && isFinite(v);

// ══════════════════════════════════════════════════════════════════════════════
// 観測 — ⛔ 返すのは **本番のデータ / 本番の関数 / ブラウザのレイアウト結果**だけ。
//        期待値を混ぜない (assert 側が突き合わせる)。
// ══════════════════════════════════════════════════════════════════════════════
async function measure(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.query || '') + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:' + port + PAGE_PATH + (opts.query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP && !!window.__world', { timeout: 20000 });
  await settle(page);

  const m = await page.evaluate(() => {
    const W = window.__world;
    const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
    };
    const elMark = document.getElementById('worldHeroMark');
    const elHero = document.getElementById('worldHero');
    const zi = (el) => el ? getComputedStyle(el).zIndex : null;
    return {
      /* ── シームの姿 (⭐ 型まで持ち帰る = キー集合だけの恒等 assert を避ける) ── */
      seamKeys: Object.keys(W).slice().sort(),
      seamTypes: {
        heroMarkOn: typeof W.heroMarkOn,
        heroMarkGeom: typeof W.heroMarkGeom,
        heroGeom: typeof W.heroGeom,
        zoom: typeof W.zoom,
        heroPx: typeof W.heroPx,
      },
      /* ── 本番の関数が返した値 (⛔ ドライバは 9 / 13 / 32 / 8 / 96 / 0.93 を持たない) ── */
      markOn: safe(() => (typeof W.heroMarkOn === 'function') ? W.heroMarkOn() : null, null),
      markGeom: safe(() => (typeof W.heroMarkGeom === 'function') ? W.heroMarkGeom() : null, null),
      heroGeom: safe(() => (typeof W.heroGeom === 'function') ? W.heroGeom() : null, null),
      heroPx: safe(() => W.heroPx(), null),
      heroNode: safe(() => W.heroNode(), null),
      zoom: safe(() => W.zoom(), null),
      compact: safe(() => W.compact(), null),
      /* ── ブラウザのレイアウト結果 (⭐ JS の値とは **別経路**) ── */
      markPresent: !!elMark,
      markRect: rectOf(elMark),
      markCls: elMark ? elMark.className : null,
      markClsLen: elMark ? elMark.classList.length : null,
      markZ: zi(elMark),
      markPointerEvents: elMark ? getComputedStyle(elMark).pointerEvents : null,
      heroPresent: !!elHero,
      heroRect: rectOf(elHero),
      heroZ: zi(elHero),
      /* ── 参考 (§1〜§4 が使う母集団。項目 1 では [記録] に出すだけ) ── */
      signCount: document.querySelectorAll('.worldSign').length,
      stepElCount: document.querySelectorAll('.worldStep').length,
      nodeElCount: document.querySelectorAll('.worldNode').length,
    };
  });
  m.port = port;
  m.query = opts.query || '';
  await page.close();
  return m;
}

/* 装置: 測定タブへ「6 シナリオ クリア済み」を焼くための材料。
   ⚠⚠ world.html を開く箇所は 1 つではないので **browser.newPage を 1 回だけ包む**
     (1 箇所だけ仕込むと札の枚数だけが割れる = verify_world_map.js で実際に踏んだ)。 */
async function readScenarioIds(browser, port) {
  const page = await browser.newPage();
  await page.goto('http://localhost:' + port + PAGE_PATH, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.WORLD_MAP', { timeout: 20000 });
  const ids = await page.evaluate(() => Object.keys(window.WORLD_MAP.SITES));
  await page.close();
  return ids;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 (実装済み)  ⭐ [key, 見出し, m => [bool, detail]]
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  // ── §0 装置 ────────────────────────────────────────────────────────────────
  ['0a', '[装置] #worldHeroMark が DOM に実在し、heroMarkOn() が true、'
    + 'heroMarkGeom() が {w,h,gap,headTop,sprite,foot} の 6 キーすべてを **有限の数値** で返す'
    + ' ⭐⭐⭐ これが無いと §1〜§2 が全部空振りで永久緑になる',
    m => {
      const g = m.markGeom;
      const keys = (g && typeof g === 'object') ? Object.keys(g).slice().sort() : null;
      const wantKeys = MARK_GEOM_KEYS.slice().sort();
      const keysOk = keys !== null && JSON.stringify(keys) === JSON.stringify(wantKeys);
      /* ⚠ キー集合だけでは変異を検出できない (#38)。**型と値** まで見る。
         ⛔ 期待値そのものは書かない — 「有限の数値で 0 でない」だけを縛る。 */
      const bad = [];
      if (keysOk) {
        for (const k of MARK_GEOM_KEYS) {
          if (!isFiniteNum(g[k])) { bad.push(k + '=' + JSON.stringify(g[k]) + '(' + typeof g[k] + ')'); continue; }
          if (g[k] === 0) bad.push(k + '=0');
        }
      }
      const fnOk = m.seamTypes.heroMarkOn === 'function' && m.seamTypes.heroMarkGeom === 'function';
      const ok = m.markPresent && fnOk && m.markOn === true && keysOk && bad.length === 0;
      return [ok,
        '#worldHeroMark=' + (m.markPresent ? 'あり' : '⛔ 無い')
        + '  heroMarkOn()=' + JSON.stringify(m.markOn) + ' (' + m.seamTypes.heroMarkOn + ')'
        + '  heroMarkGeom()=' + JSON.stringify(g) + ' (' + m.seamTypes.heroMarkGeom + ')'
        + (keysOk ? '' : '  ⛔ キー集合違い want=' + JSON.stringify(wantKeys) + ' got=' + JSON.stringify(keys))
        + (bad.length ? '  ⛔ 数値でない/0 のキー: ' + bad.join(' ') : '')];
    }],
  ['0b', '[2 経路] #worldHeroMark の実描画の矩形 ÷ zoom が heroMarkGeom() の w*2 / h と'
    + ' ' + GEOM_EPS + 'px 以内で一致する'
    + ' ⭐ 左辺=ブラウザのレイアウト結果 / 右辺=JS の値 → CSS と JS の写経ズレを殺す'
    + ' ⛔ 9 / 13 をドライバへ直書きしない',
    m => {
      if (!m.markPresent || !m.markRect) return [false, '⛔ #worldHeroMark が無い (0a を先に見ること)'];
      const g = m.markGeom;
      if (!g || !isFiniteNum(g.w) || !isFiniteNum(g.h)) return [false, '⛔ heroMarkGeom() が数値を返さない: ' + JSON.stringify(g)];
      if (!isFiniteNum(m.zoom) || m.zoom <= 0) return [false, '⛔ zoom() が正の数でない: ' + JSON.stringify(m.zoom)];
      /* ⭐ 三角は width:0 の border 三角 = 見た目の幅は border-left + border-right = w * 2。
         ⚠ 高さは border-top のみ = h。bob (margin-top 0→4px) は寸法を変えないので安定。 */
      const gotW = m.markRect.w / m.zoom, gotH = m.markRect.h / m.zoom;
      const wantW = g.w * 2, wantH = g.h;
      const dW = Math.abs(gotW - wantW), dH = Math.abs(gotH - wantH);
      return [dW <= GEOM_EPS && dH <= GEOM_EPS,
        '実描画 ' + m.markRect.w.toFixed(2) + 'x' + m.markRect.h.toFixed(2) + 'px'
        + ' ÷ zoom ' + m.zoom.toFixed(4) + ' = ' + gotW.toFixed(3) + 'x' + gotH.toFixed(3)
        + '  / JS の w*2 x h = ' + wantW + 'x' + wantH
        + '  差 ' + dW.toFixed(3) + ' / ' + dH.toFixed(3) + 'px (許容 ' + GEOM_EPS + ')'];
    }],
  ['0c', '[2 経路] 主人公の幾何を heroGeom() から採れる (sprite / foot が有限で正)。'
    + ' かつ #worldHero の実描画の幅 ÷ zoom が sprite と ' + GEOM_EPS + 'px 以内で一致'
    + ' ⛔ 96 / 0.93 をドライバへ写経しない (verify_world_map.js:511 と同じ作法)',
    m => {
      const hg = m.heroGeom;
      if (!hg || typeof hg !== 'object') return [false, '⛔ heroGeom() が object を返さない: ' + JSON.stringify(hg)];
      const sOk = isFiniteNum(hg.sprite) && hg.sprite > 0;
      const fOk = isFiniteNum(hg.foot) && hg.foot > 0;
      if (!m.heroPresent || !m.heroRect) return [false, '⛔ #worldHero が無い  heroGeom()=' + JSON.stringify(hg)];
      if (!isFiniteNum(m.zoom) || m.zoom <= 0) return [false, '⛔ zoom() が正の数でない: ' + JSON.stringify(m.zoom)];
      const gotW = m.heroRect.w / m.zoom;
      const d = sOk ? Math.abs(gotW - hg.sprite) : Infinity;
      return [sOk && fOk && d <= GEOM_EPS,
        'heroGeom()=' + JSON.stringify(hg)
        + '  #worldHero 実描画 ' + m.heroRect.w.toFixed(2) + 'x' + m.heroRect.h.toFixed(2) + 'px'
        + ' ÷ zoom = ' + gotW.toFixed(3) + '  / sprite = ' + hg.sprite
        + '  差 ' + (isFinite(d) ? d.toFixed(3) : '—') + 'px (許容 ' + GEOM_EPS + ')'
        + (sOk ? '' : '  ⛔ sprite が正の有限数でない')
        + (fOk ? '' : '  ⛔ foot が正の有限数でない')];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// まだ実装されていない受入条件 (⛔ 件数から隠さない = pending() で必ず出す)
//   ⭐ 項目 2〜4 がここを 1 行ずつ ASSERTS へ移す。最終項目の完了条件 = PENDING 0。
//   ⛔ ここに置いたキーは ASSERT_OF に無いので、実装したら必ず PENDINGS から外して
//     本体の配線 (['1a','1b', …] の並び) へキーを足すこと (両方やらないと数が合わない)。
//   ⛔ 空になっても配列ごと削除しないこと (削ると PENDING という 3 値そのものが消える)。
// ══════════════════════════════════════════════════════════════════════════════
const PENDINGS = [
  ['§1 追従と収まり — ⭐ ▽ が主人公に付いてきて、96px セルの内側に収まる', [
    ['1a', '初期位置で ▽ の見た目の中心 x が主人公の中心 x と 1px 以内、'
      + '下端 y が heroRect.top + (headTop - gap) * zoom と 1px 以内',
      '⭐ 右辺は heroPx() + heroGeom() + heroMarkGeom() からドライバが独立に計算する。'
      + ' ⛔ elMark.style.top の文字列を読んで比べない → 項目 2 の担当'],
    ['1b', '★ ▽ の矩形が #worldHero の矩形に **完全に含まれる** (4 辺すべて / '
      + 'bob の 1 周期 1.2s を 12 点サンプリングして最悪値)',
      '⭐⭐⭐ verify_world_map (7f)「駒が札を 10% 以上隠さない」を ▽ に継承させる唯一の条件'
      + ' (依頼書 §2-2)。負のコントロール markbox が機械証明する → 項目 2 の担当'],
    ['1c', '実クリックで 3 ホップ歩かせた後も (1a) が成り立つ',
      '⚠ 母集団ガード = heroNode() が押す前と変わっていること。'
      + ' ⛔ 行き先に phlan (enter を持つ唯一のノード) を選ばない → 項目 3 の担当'],
    ['1d', '移動中 (isMoving() === true のサンプル) でも ▽ の中心 x と主人公の中心 x が 2px 以内',
      '⚠ 母集団ガード = isMoving() が true のサンプルが 1 件以上あること'
      + ' (0 件なら空振り → FAIL) → 項目 3 の担当'],
    ['1e', '全 14 ノードに立った場合の ▽ の矩形が 7 枚の .worldSign と 1px も交差しない',
      '⭐ (7f) と同じ手口で **実際には歩かせず計算で出す**。⛔ 期待値 19.72px を書かない。'
      + ' ⚠ 母集団 = 14 x 7 = 98 件 → 項目 2 の担当'],
    ['1f', 'computed の zIndex が #worldHeroMark > #worldHero',
      '⛔ 6 という数値そのものは書かない (§2-4 の「並びが違う」を関係で縛る) → 項目 2 の担当'],
  ]],
  ['§2 非干渉 — ⭐ ▽ が誰の当たり判定も奪わない', [
    ['2a', '★ 全 14 ノード + 全刻み点マーカーの **中心 + 四隅の内側 8px の 5 点** を '
      + 'elementFromPoint し、返る要素が #worldHeroMark でもその子孫でもない',
      '⚠ 母集団ガード = 検査した点が (14 + STEPS 件数) x 5 と一致し 0 でないこと。'
      + ' ⚠⚠ ▽ は pointer-events: none なので自明に緑 → 変異 markhit で担保する → 項目 2 の担当'],
    ['2b', '.worldStep の DOM 件数が WORLD_MAP.STEPS と一致し .worldNode が 14 件。'
      + 'かつ #worldHeroMark が .worldNode も .worldStep も着ていない (classList.length === 0)',
      '⚠ 着せると verify_world_map.js:736/:1187 と verify_quest_walk.js:547 が誤爆する'
      + ' (#40 §2-4 の既知の罠) → 項目 2 の担当'],
  ]],
  ['§3 恒等 (非退行) — ⛔ 既存のシームを 1 バイトも汚していないこと', [
    ['3a', 'Object.keys(window.__world) が #42 時点のキー集合をすべて含み、'
      + '増えたのは heroMarkOn / heroMarkGeom の 2 つだけ',
      '⭐ キー集合だけの恒等 assert は変異を検出できない (#38) ので、2 つとも'
      + ' typeof === "function" で呼んで boolean / 有限値が返ることまで見る → 項目 3 の担当'],
    ['3b', '.worldSign が 7 枚、点線 <line> が EDGES.length 本のまま',
      '▽ が経路や札の枚数に触っていないこと → 項目 3 の担当'],
  ]],
  ['§4 撤退 ' + RETREAT_QUERY + ' — ⭐ 撤退アームと素のアームを **対で**測る', [
    ['4a', RETREAT_QUERY + ' → document.getElementById("worldHeroMark") === null',
      '**DOM に無い**こと。display:none で残っていたら FAIL (town.html:471 と同じ作法) → 項目 4 の担当'],
    ['4b', '★ 素のアームを同じ assert に同居させる — (1a) && (1b) && (2a) の conjunction を '
      + '両アームへ当て、素では全部真、' + RETREAT_QUERY + ' では (1a) が偽で崩れる',
      '⭐⭐ 撤退アームだけを見ると永久緑になる (#39 の教訓) → 項目 4 の担当'],
    ['4c', '撤退のしすぎも測る — .worldStep 件数 / .worldSign 7 枚 / heroPx() / heroNode() / '
      + 'zoom() が素のアームと一致する',
      '消えるのは ▽ だけ、を縛る → 項目 4 の担当'],
  ]],
];

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_worldheromark_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  MUT_SERVED.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

  console.log('=== verify_world_heromark.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (変異は 1 本も実装されていない = 項目 4 の担当)'));

  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  const errs = [];

  try {
    /* ══ 装置: 測定タブへ「6 シナリオ クリア済み」を焼く ══════════════════════
       ⚠⚠ world.html を開く箇所は 1 つではないので **browser.newPage を 1 回だけ包む**。 */
    const CLEARED_ALL = await readScenarioIds(browser, PORT);
    const CLEARED_KEY = 'dragonfighters.cleared';
    const _newPage = browser.newPage.bind(browser);
    browser.newPage = async function () {
      const p = await _newPage();
      await p.evaluateOnNewDocument((k, v) => {
        try { localStorage.setItem(k, v); } catch (e) {}
      }, CLEARED_KEY, JSON.stringify(CLEARED_ALL));
      return p;
    };
    console.log('[drv]   [装置] 測定タブへ ' + CLEARED_KEY + '=' + JSON.stringify(CLEARED_ALL)
      + ' を仕込む (札 7 枚の母集団を復元)');

    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      mark('§0 装置 — 母集団と 2 経路');
      const m = await measure(browser, PORT, errs, {});
      /* ⭐ (9a) は依頼書 §8 で「素・撤退の **両アーム**」と明記されている。
         ⛔ 素のアームだけ見ると「撤退したときだけ落ちる」を永久に見逃す。
         ⚠ ここで採るのは errs (事故) と [記録] だけ。§4 の assert は項目 4 の担当。 */
      const mOff = await measure(browser, PORT, errs, { query: RETREAT_QUERY });

      for (const key of ['0a', '0b', '0c']) {
        const a = ASSERT_OF[key]; const r = a[2](m);
        check('(' + a[0] + ') ' + a[1], r[0], r[1]);
      }
      if (MUT_TODO.length === 0) {
        check('(0d) [装置] 変異アンカーの実装漏れが 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      } else {
        pending('(0d) [装置] 変異アンカーの実装漏れが 0 件 (' + MUT_ORDER.length + ' 本)',
          '⛔ 未実装=' + MUT_TODO.join(' / ') + ' → 項目 4 の担当');
      }

      console.log('       [記録] 素のアーム (⛔ 期待値ではない。読み解き用):');
      console.log('         zoom=' + (m.zoom !== null ? m.zoom.toFixed(4) : '?')
        + '  compact=' + JSON.stringify(m.compact)
        + '  heroNode=' + JSON.stringify(m.heroNode)
        + '  heroPx=' + JSON.stringify(m.heroPx));
      console.log('         ▽ rect=' + (m.markRect
        ? ('(' + m.markRect.l.toFixed(1) + ', ' + m.markRect.t.toFixed(1) + ') '
          + m.markRect.w.toFixed(1) + 'x' + m.markRect.h.toFixed(1) + 'px') : '⛔ 無い')
        + '  class="' + m.markCls + '" (' + m.markClsLen + ' 個)'
        + '  z-index=' + m.markZ + '  pointer-events=' + m.markPointerEvents);
      console.log('         主人公 rect=' + (m.heroRect
        ? ('(' + m.heroRect.l.toFixed(1) + ', ' + m.heroRect.t.toFixed(1) + ') '
          + m.heroRect.w.toFixed(1) + 'x' + m.heroRect.h.toFixed(1) + 'px') : '⛔ 無い')
        + '  z-index=' + m.heroZ);
      console.log('         札 ' + m.signCount + ' 枚 / 刻み点 ' + m.stepElCount
        + ' 枚 / .worldNode ' + m.nodeElCount + ' 枚');
      console.log('       [記録] 撤退アーム ' + RETREAT_QUERY + ' (⛔ §4 の assert は項目 4 の担当):');
      console.log('         ▽ =' + (mOff.markPresent ? '⚠ まだ DOM に居る' : 'DOM に無い')
        + '  heroMarkOn()=' + JSON.stringify(mOff.markOn)
        + '  heroNode=' + JSON.stringify(mOff.heroNode)
        + '  札 ' + mOff.signCount + ' 枚 / 刻み点 ' + mOff.stepElCount + ' 枚');

      for (const [title, rows] of PENDINGS) {
        mark(title);
        for (const p of rows) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      mark('§9 ページエラー');
      check('(9a) 測定ページで pageerror / console.error が出ていない (素・撤退の両アーム)',
        errs.length === 0, errs.slice(0, 6).join(' | '));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
            pure.body.split(MUTATIONS[k].to).length - 1 === 0 && mut.body.split(MUTATIONS[k].to).length - 1 === 1, f);
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length, '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }

        mark('欠陥を注入すると担当の節が赤くなること');
        for (const k of MUT_IMPL) {
          const negErrs = [];
          const port = MUTATIONS[k].driver ? PORT : PORT_OF[k];
          const m = await measure(browser, port, negErrs, {});
          /* ⭐ §4 を狙う変異 (markalways) は撤退の観測が要る。⛔ 片方だけにすると
             「撤退の観測が無い」で機械的に赤くなり、欠陥を検出したのか装置が欠けたのか
             読めなくなる (verify_world_steps の needsRetreat と同じ理屈)。 */
          if (MUTATIONS[k].needsRetreat) {
            m.off = await measure(browser, port, negErrs, { query: RETREAT_QUERY });
          }
          for (const key of MUTATIONS[k].targets) {
            const a = ASSERT_OF[key];
            if (!a) {
              pending('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる',
                '⛔ (' + key + ') はまだ ASSERTS に無い (後続項目が実装する)');
              continue;
            }
            const r = a[2](m);
            check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
              r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
          }
        }
      }

      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⛔ 件数から隠さない)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → '
            + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
            MUTATIONS[k].why + '  [予定の配信先 ' + MUTATIONS[k].file + ']');
        }
      } else {
        mark('変異の実装漏れ');
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length);
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (最終項目の完了条件 = ここが 0 件):');
    for (const b of pend) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(failed.length ? 1 : 0);
})();
