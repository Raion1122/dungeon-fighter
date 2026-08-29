#!/usr/bin/env node
/*
 * verify_tavern_map.js — 銀の鹿亭 tavern.html / js/tavern-map.js の検証ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-08-26_stag-tavern-dnd-map.md` の §9 受入条件を機械的に測る。
 * 流用元は tools/verify_town_map.js (http 自前配信 + puppeteer-core で実 Chrome 直駆動) と
 * tools/verify_quest_walk.js (PASSED / FAILED / **PENDING** の 3 値表示 + --negative)。
 *
 * ■ 出力は 3 値。完了条件 = **PENDING 0**
 *     PASSED / FAILED / **PENDING**
 *   exit コードは FAILED が 0 件なら 0 (PENDING は 0 のまま通す)。
 *   → 後続項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認できる。
 *
 * ■ ⭐⭐⭐ なぜ「素のスタブページ」を配って測るのか (逃げではなく **2 経路の分離**)
 *   §0(0b)(0c) と §1 が測るのは **データ層**で、これは
 *       js/tavern-map.js + assets/tavern_map.jpg
 *   の 2 つだけで決まる。tavern.html が何を読み込んでいるかとは独立している。
 *   そこでドライバは、ディスクに残さないメモリ上のスタブ
 *       <!doctype html><meta charset="utf-8"><title>probe</title>
 *       <script src="js/tavern-map.js"></script>
 *   を配って、そこで window.TAVERN_MAP を読む。
 *   ⭐ 「tavern.html がそれを実際に読み込んでいるか」は **(0a) が別途**見る。
 *      (0a) は項目 3 で実装する。両方が揃って初めて「載っていて、正しい」が言える。
 *   ⛔ (0a) をデータ層の測定で代用しないこと。#23 で js/world-map.js の <script src> を
 *      書き忘れ、5 本の assert が「何も起きないのに全部緑」になった事故がある。
 *
 * ■ 実装状況 (依頼書 #25 の項目 3 で **PENDING 0** に到達した)
 *     §0 (0a)(0b)(0c) / §1 (1a)(1b)(1c) / §2〜§7 の 20 本すべて + 装置 assert
 *     (0z1)(0z2)(0m-*)(1z1)(1z2)(3z)(6z) を実装済。負のコントロールも 10 本すべて実装済。
 *
 * ■ ⚠⚠⚠ 依頼書 §9 からの逸脱 (項目 3 で実測して分かったこと。§13 の材料)
 *   (a) **(3b) は「420ms x 6 回」だけでは変異 reclick が空振りする** — 2026-08-27 実測。
 *       goToTable のガードを外しても、クリック間隔 420ms > MS_PER_TILE 340ms なので
 *       1 タイルは毎回完走し、7 マスを ~2.9 秒で歩き切ってしまう (依頼書の 5 秒以内に収まる)。
 *       ⭐ 罠 A が実際に牙を剥くのは **クリック間隔 < MS_PER_TILE** のとき。walkPath() は
 *         「現在位置 → 次のタイル中心」を毎回 MS_PER_TILE で引き直すので、間隔が短いと
 *         残距離が幾何級数で縮むだけで **永久に 1 マスも完了しない**。
 *       → (3b) は **2 本の走行の AND** にした:
 *           (1) golden 準拠 … 420ms x 6 回 (verify_recruit_size 等と同じ叩き方)
 *           (2) 罠 A の実証 … MS_PER_TILE x 0.55 の間隔で **到達するまで連打し続ける**
 *         ⭐ 間隔は geom().msPerTile から引く (⛔ 340 を直書きしない)。(2) の間隔が本当に
 *           MS_PER_TILE より速かったかは装置 assert (3z) が毎回証明する。
 *   (b) **(5a) の上限は 1.5 ではなく「1 マス 96px」** — 項目 2 の layout() が
 *       Math.min(96 / TILE, ...) を天井にしている (港町 TILE 64 x 1.5 = 96px と同じ天井を
 *       px で表現したもの)。TILE が 96 なので zoom の上限は 1.0。
 *       → 判定は zoom ではなく **1 マスの実表示 px (34〜96)** で書く。下限 34px は依頼書のまま。
 *   (c) **(6b) の「HEAD と比較」は採らない** — 恒久教訓「負のコントロールの基準に HEAD を
 *       使うな」。目的は「js/world-map.js の label と機械照合している 6 件が壊れていないこと」
 *       なので、**verify_world_map.js の (7a) と同じ照合**を tavern のページ内で行う
 *       (WORLD_MAP.SITES → NODES[].label  vs  scenarios[].place の実体どうし)。
 *   (d) **(6c) の比較基準は明示した固定コミット** DOM_BASE = 638b479 (= 項目 1 完了時点 =
 *       tavern.html が地図改修を受ける前)。⛔ HEAD ではない (HEAD は改修後なので恒等の基準に
 *       ならない)。git show <DOM_BASE>:tavern.html の実体と、配信中の実体の
 *       **タグ構造の署名**を突き合わせる。
 *   (e) **ポートを 9170 → 9200 へ移した** — 項目 1 の「9161-9179 は 1 本も使われていない」は
 *       誤り。verify_quest_walk.js は変異ポートを 9160+1+i で採るので **9161-9170 を実際に
 *       使う** (同ファイルの表に明記されている)。9192-9239 が空いていることを数え上げた。
 *
 * ■ ⚠⚠ 寸法の数は 1 つも直書きしない
 *   ROWS / COLS の期待値 … tools/make_grid_map.py の GRIDS["stag-tavern"]["cells"] から引く
 *   TILE                 … window.TAVERN_MAP.TILE から引く (= 96。⚠ 依頼書 §9 の「64」は
 *                          STEP1 で 96 へ逸脱済みなので誤り。理由は js/tavern-map.js 冒頭)
 *   ⭐ 台帳の tile と TAVERN_MAP.TILE が一致することは (0z2) が 2 経路で突き合わせる。
 *
 * ■ ⚠⚠⚠ (1a) は make_grid_map.py --check ではなく check_grid_alignment.py を使う
 *   2026-08-27 実測: `py tools/make_grid_map.py --check assets/tavern_map.jpg --tile 96` は
 *       NG 縦線: 累積ドリフト 1.22 (許容 4.0) / 位相ズレ 47.50 (許容 2.0) / score比 86.2%
 *       NG 横線: 累積ドリフト 1.46 (許容 4.0) / 位相ズレ 24.50 (許容 2.0) / score比 79.7%
 *   を返す。⭐ ドリフトも score 比も許容内で、落ちているのは **位相ズレだけ**。
 *   これは #24 の罠 H そのもの = 銀の鹿亭の床は板の継ぎ目が 24px (= 1/4 マス) 間隔で走るので、
 *   周期 96 の櫛が位相 0 / 24 / 48 / 72 に等しく当たり、指標が構造的に誤報する。
 *   → #24 でこの誤報のために作られた tools/check_grid_alignment.py を使う。
 *      判定は「位相 0 の相対位置 >= 70%」を縦横の AND。2026-08-27 実測 縦 78.0% / 横 82.5% で OK。
 *   ⭐ --check の測定値も (1a) の detail に出す (ドリフトと score 比は生きた指標なので捨てない)。
 *   ⚠ 子プロセスには PYTHONIOENCODING=utf-8 を渡すこと。cp932 のままだと成功行の "⭐" で
 *     UnicodeEncodeError になり、**両軸 OK なのに exit 1** になる (2026-08-27 実測)。
 *   ⭐ (1z2) が「--shift TILE/4 で NG になる」= 道具が生きていることを毎回証明する。
 *
 * ■ ⭐⭐ 配信バイトの凍結を内蔵している (別窓の並走で測定が汚れない)
 *   起動時に js/tavern-map.js / tavern.html / assets/tavern_map.jpg をディスクから 1 回だけ
 *   読み、以降の配信はそのスナップショットから返す。他のファイルも初回アクセス時に凍結する。
 *   ⭐ 変異も「ディスクを書き換える」のではなく「**配信を差し替える**」(作業ツリーを汚さない)。
 *
 * ■ 使い方
 *     node tools/verify_tavern_map.js
 *     node tools/verify_tavern_map.js --negative        # 負のコントロール (空振り 1 本で exit 1)
 *     node tools/verify_tavern_map.js --mutate gatetable
 *     node tools/verify_tavern_map.js --port 9170 --headful
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

/* ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
 *   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える。 */
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const NEGATIVE = flag('negative');
const HEADFUL  = flag('headful');
const MUTATE   = arg('mutate', null);
/* ⚠⚠ ポートは既存ドライバと空ける。**項目 1 の数え上げは誤りだった** (2026-08-27 再実測):
 *   verify_quest_walk.js は変異ポートを 9160+1+i で採るので **9161-9170 を実際に使う**
 *   (同ファイル冒頭の表に port 9161〜9170 と明記されている)。直書きの grep では見えない。
 *   → 素 9200 / 変異 9201-9210 へ移した。9191 の次は 9240 なので 9192-9239 が空いている。 */
const PORT = parseInt(arg('port', '9200'), 10);

const MAP_JS      = 'js/tavern-map.js';
const TAVERN_HTML = 'tavern.html';
const MAP_JPG     = 'assets/tavern_map.jpg';
const LEDGER_PY   = 'tools/make_grid_map.py';
const LEDGER_KEY  = 'stag-tavern';

/* データ層だけを載せた素のスタブ。⛔ ディスクに残さない (作業ツリーを汚さない)。 */
const STUB_REL  = '__tavern_map_probe.html';
const STUB_HTML = '<!doctype html><meta charset="utf-8"><title>probe</title>\n'
  + '<script src="' + MAP_JS + '"></script>\n';

// ══════════════════════════════════════════════════════════════════════════════
// 台帳 (tools/make_grid_map.py の GRIDS) から寸法を引く
// ⚠⚠ ドライバに 15 / 10 / 96 / 64 を **1 つも直書きしない**。
//    直書きすると「絵と台帳とマスクが食い違っている」を永久に緑と報告する。
// ══════════════════════════════════════════════════════════════════════════════
function readLedger() {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, LEDGER_PY), 'utf8'); } catch (e) { return null; }
  const i = src.indexOf('"' + LEDGER_KEY + '": {');
  if (i < 0) return null;
  let j = src.indexOf('\n    },', i);
  if (j < 0) j = src.length;
  const body = src.slice(i, j);
  const mc = body.match(/"cells"\s*:\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  const mt = body.match(/"tile"\s*:\s*(\d+)/);
  if (!mc || !mt) return null;
  return { cols: parseInt(mc[1], 10), rows: parseInt(mc[2], 10), tile: parseInt(mt[1], 10) };
}
const LEDGER = readLedger();

// ══════════════════════════════════════════════════════════════════════════════
// 負のコントロール (依頼書 §9 の変異 10 本)
// ⚠ 置換文字列は必ず 1 行に閉じる (CRLF/LF 混在で複数行は原理的に一致しない)。
// ⚠ 置換前後でバイト長を変える (同じ長さだと「当たったのに何も変わらない」を検出できない)。
//
// 各エントリ:
//   impl      … false = **PENDING** (まだ実装していない)。項目 3 が埋める。
//   file/from/to … 配信スナップショットへの 1 行置換。⚠ ちょうど 1 箇所ヒットが起動時の条件。
//   targets   … 依頼書 §9 の表。**ここが赤くならなければ空振り = exit 1**。
//   evaluable … 変異ポートの測定で **実際に評価できる** assert。
//               ⛔ 測っていない節をここへ書かない (述語が例外 → 一律 false = 偽陽性)。
//   allowRed  … targets 以外で **赤くなるのが正しい**節 (依頼書の表は最小限しか書いていない)。
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ tavern.html を実際に開く測定は重い (1 フェーズ 2〜10 秒)。変異ごとに **要る
 *   フェーズだけ**を回す。⛔ 採っていないフェーズの節を evaluable へ書かない
 *   (述語が例外 → 一律 false = 「巻き込んだ」の偽陽性になる)。
 *   フェーズ名: base / compact / walk1 / walk6 / walkbad / door / back / off */
const MUTATIONS = {
  nomapjs: { impl: true, file: TAVERN_HTML, targets: ['0a'], phases: ['base'],
    from: '  <script src="js/tavern-map.js"></script>',
    to:   '  <!-- mut-nomapjs: <script src> を書き忘れた状態 -->',
    evaluable: ['0a', '2a', '2b', '2c', '2d', '4c', '6a', '6b', '6c'],
    allowRed: ['2a', '2b', '2c', '2d', '4c'],
    /* ⭐ TAVERN_MAP が無いと initTavernMap が 1 枚絵へ落ちるので、札を見る節は全部道連れ。
       それでも (6a)(6b)(6c) は緑のまま = 「効きすぎていない」ことがここで見える。 */
    why: '⭐ #23 で実際に起きた「<script src> を書き忘れて、読み込んでいないのに全部緑」の再現。' },
  reclick: { impl: true, file: TAVERN_HTML, targets: ['3b'], phases: ['walk1', 'walk6'],
    from: '      if (walkingTo === t.key) return;',
    to:   '      /* mut-reclick: 罠 A のガードを外す */',
    evaluable: ['3a', '3b'], allowRed: [],
    /* ⚠⚠⚠ 依頼書の「420ms x 6 回」だけでは **この変異は空振りする** (間隔 420 > 340 なので
       1 タイルは毎回完走してしまう)。(3b) は MS_PER_TILE より速い連打の走行も AND で見る。 */
    why: '⭐⭐⭐ 依頼書 §2-2 罠 A の機械証明。goToTable の "if (walkingTo === t.key) return;" を'
      + '消すと、MS_PER_TILE より短い間隔の再クリックで walkPath が毎回 stopWalk して t0 を'
      + '打ち直し、残距離が幾何級数で縮むだけで **1 マスも完了しない**。' },
  instant: { impl: true, file: TAVERN_HTML, targets: ['3a'], phases: ['walk1', 'walk6'],
    from: '    function goToTable(t) {',
    to:   '    function goToTable(t) { var _sc = scenarios.find(function (s) { return s.id === t.scenarioId; }); if (_sc) { openDialog(_sc, isUnlocked(_sc)); return; }  /* mut-instant: 歩かずに即 openDialog */',
    evaluable: ['3a', '3b'], allowRed: ['3b'],
    /* ⚠ アンカーを "var ok = walkTo(ec, er, function () {" にすると goToDoor と 2 ヒットして
       exit 3 になる (項目 2 の実測)。関数の頭で早期 return させるのが 1 ヒットで済む唯一の形。 */
    why: '卓のクリックで歩かずに即 openDialog にする =「歩いてから開く」が死ぬ。' },
  gatetable: { impl: true, file: MAP_JS, targets: ['1b', '1c'], phases: [],
    from: '    { key: "t1", scenarioId: "goblin-mine",    enter: [4, 4], sign: [4, 1] },',
    to:   '    { key: "t1", scenarioId: "goblin-mine", enter: [0, 0], sign: [4, 1] },  /* mut-gatetable: enter を外壁 W へずらす */',
    evaluable: ['0z1', '0b', '0c', '1z1', '1b', '1c'], allowRed: [],
    why: '⚠ 扉システムで踏んだ「出口ゲートタイルに置くと壁に埋まって詰む」の同型。'
      + 'TABLES[0].enter を (0,0) = 外壁 W へずらす。' },
  dropscen: { impl: true, file: TAVERN_HTML, targets: ['6a', '4b'], phases: ['base', 'back'],
    from: '  function isUnlocked(sc) {',
    to:   '  scenarios.length = 3;  /* mut-dropscen: シナリオ4〜6 を配列ごと削る */  function isUnlocked(sc) {',
    evaluable: ['0a', '2a', '2b', '2c', '2d', '4b', '4c', '6a', '6b', '6c'],
    allowRed: ['6b'],
    /* ⭐ (6b) が道連れになるのは欠陥の性質そのもの: WORLD_MAP.SITES の 6 件に対し
       scenarios が 3 件しか無いので、後半 3 件の place が引けなくなる。 */
    why: '卓を 3 つにするために scenarios から 4〜6 を配列ごと削る誘惑。'
      + '⚠ 配列リテラルは複数行なので、1 行アンカーで **後から length を切り詰める**形にした。' },
  hidelock: { impl: true, file: TAVERN_HTML, targets: ['2d'], phases: ['base'],
    from: '        var unlocked = isUnlocked(sc);',
    to:   '        var unlocked = isUnlocked(sc); if (!unlocked) return;  /* mut-hidelock: 未解放の卓を DOM に作らない */',
    evaluable: ['0a', '2a', '2b', '2c', '2d', '4c', '6a', '6b', '6c'], allowRed: ['2a'],
    why: '未解放の卓を DOM に作らない =「次がある」が見えなくなる。' },
  copyplace: { impl: true, file: MAP_JS, targets: ['2c'], phases: ['base'],
    from: '  var TABLES = [',
    to:   '  var TABLES_PLACE_COPY = { t1: "廃坑", t2: "町外れの森", t3: "沼地" }; (function () { function paint() { TABLES.forEach(function (t) { var el = document.getElementById("questTable_" + t.scenarioId); if (!el) return; var n = el.querySelector(".tavernSignName"); if (n && n.textContent !== "???") n.textContent = TABLES_PLACE_COPY[t.key]; }); } var _r = null; try { Object.defineProperty(window, "__tavernRefreshSigns", { configurable: true, set: function (f) { _r = function () { f(); paint(); }; }, get: function () { return _r; } }); } catch (e) {} document.addEventListener("DOMContentLoaded", paint); })();  /* mut-copyplace: place の写しを持ち、札をそこから描く */  var TABLES = [',
    evaluable: ['0a', '2a', '2b', '2c', '2d', '4c', '6a', '6b', '6c'], allowRed: [],
    /* ⚠⚠ この変異だけは **2 ファイルに跨る欠陥**を 1 ファイルで作る必要がある
       (装置は「1 ファイル 1 箇所ヒット」で検算するので、tavern.html 側は触れない)。
       → js/tavern-map.js の中に place の写しを置き、__tavernRefreshSigns を包んで
         「札を写しから描く」状態を作る。⭐ (2c) は静的な文字列比較ではなく
         **「place を書き換えると札も変わるか」という振る舞い**で測っているので、
         写しを持った瞬間に赤くなる (依頼書 §9 (2c) の文言そのもの)。 */
    why: 'js/tavern-map.js に place の文字列を写して札をそこから描く = 二重管理のドリフト。' },
  gridsize: { impl: true, file: MAP_JS, targets: ['0b'], phases: [],
    from: '    /* row 5 */ "WC.......TT..CW",',
    to:   '    /* mut-gridsize: row 5 を落として ROWS と食い違わせる */',
    evaluable: ['0z1', '0b', '0c', '1z1', '1b', '1c'], allowRed: ['1b', '1c'],
    /* ⭐ MASK を 1 行削ると行が繰り上がるので、(0b) 以外に (1b)(1c) も必ず赤くなる:
       enter [4,8] と spawn [7,8] が旧 row 9 の外壁へ落ちる。依頼書の表は最小限しか
       書いていないので allowRed で明示的に許可し、証拠へ出す。 */
    why: '絵とマスクの寸法ズレ。MASK を 1 行削って ROWS と食い違わせる。' },
  plazashow: { impl: true, file: TAVERN_HTML, targets: ['4c'], phases: ['base'],
    from: '        if (d.requiresPlazaUnlock && !plazaUnlocked()) return;',
    to:   '        if (d.requiresPlazaUnlock && !plazaUnlocked()) { setTimeout(function () { var _e = document.getElementById("tavernDoor_" + d.key); if (_e) _e.style.display = "none"; }, 0); }  /* mut-plazashow: display:none で DOM に残す */',
    evaluable: ['0a', '2a', '2b', '2c', '2d', '4c', '6a', '6b', '6c'], allowRed: [],
    why: '闇市の石段を display:none で DOM に残す = 押せてしまう事故の芽。' },
  noretreat: { impl: true, file: TAVERN_HTML, targets: ['7a', '7b'], phases: ['base', 'off'],
    from: '      try { return new URLSearchParams(location.search).get("tavernmap") !== "0"; } catch (e) { return true; }',
    to:   '      return true;  /* mut-noretreat: ?tavernmap=0 の分岐を握り潰す */',
    evaluable: ['0a', '2a', '6a', '7a', '7b', '7c'], allowRed: ['7c'],
    /* ⭐ (7c) が道連れになるのは正しい: OFF 側が ON と同じ姿になるので「ON/OFF で崩れる」が
       成立しなくなる。⛔ ここを targets にしてしまうと (7a)(7b) の空振りを見逃す。 */
    why: '?tavernmap=0 の分岐を握り潰す = 撤退スイッチが死ぬ。' },
};
const MUT_ORDER  = ['nomapjs', 'reclick', 'instant', 'gatetable', 'dropscen',
                    'hidelock', 'copyplace', 'gridsize', 'plazashow', 'noretreat'];
const MUT_IMPL   = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_TODO   = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING): ' + MUTATIONS[MUTATE].why);
  process.exit(3);
}

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ 配信バイトの凍結 (依頼書 §9 冒頭)
//   別窓が同じリポジトリを触っても測定が汚れないよう、ディスクから 1 回読んだバイトを保持し、
//   以降の配信はそのスナップショットから返す。⛔ リクエストのたびに読み直さない。
// ══════════════════════════════════════════════════════════════════════════════
const SNAP = new Map();
function frozen(rel) {
  if (SNAP.has(rel)) return SNAP.get(rel);
  let buf = null;
  try {
    const fp = path.join(ROOT, rel);
    if (fp.startsWith(ROOT) && fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) buf = fs.readFileSync(fp);
  } catch (e) { buf = null; }
  SNAP.set(rel, buf);
  return buf;
}
// 起動時に凍結する (= 測定の途中で別窓が書き換えても影響を受けない)
for (const rel of [MAP_JS, TAVERN_HTML, MAP_JPG]) frozen(rel);

/* 変異ソースを先に組み立てる。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。 */
const MUT_SRC = {};
for (const k of MUT_IMPL) {
  const m = MUTATIONS[k];
  const body = frozen(m.file);
  if (body === null) {
    console.error('[drv] ⛔ 変異 ' + k + ' の対象 ' + m.file + ' が読めない'); process.exit(3);
  }
  const src = body.toString('utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する');
    process.exit(3);
  }
  const n = src.split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: src.split(m.from).join(m.to) };
}
const PORT_OF = {};
MUT_IMPL.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });

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
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると startServer の
 *   try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '');
        if (rel === STUB_REL) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(STUB_HTML); return;
        }
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        const buf = frozen(rel);
        if (buf === null) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buf);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uniqNums = (a) => Array.from(new Set(a || []));

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

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ① データ層 — 素のスタブページに js/tavern-map.js だけを載せて読む
//   ⭐ tavern.html を開かないのは「まだ読み込んでいないから」ではなく、
//     **データ層とページの結線を別々に測る**ため (結線は (0a) の担当)。
// ══════════════════════════════════════════════════════════════════════════════
async function probeStub(browser, base) {
  const out = { pageErrs: [] };
  const page = await browser.newPage();
  page.on('pageerror', e => out.pageErrs.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    let url = '';
    try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ favicon の 404 だけは除く (この 1 本に絞る)
    out.pageErrs.push('console: ' + m.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  await page.goto(base + '/' + STUB_REL, { waitUntil: 'load', timeout: 30000 });

  /* ⚠⚠⚠ 到達可能性は **自前で BFS を書かない**。本番の TAVERN_MAP.findPath をブラウザで呼ぶ
   *   (js/tavern-map.js 冒頭の指示)。近傍の数が違うだけで「歩けない道」を永久に緑と報告する。
   * ⚠ 変異 gridsize は MASK と ROWS を食い違わせるので tileAt が例外を投げうる。
   *   区画ごとに try/catch を分けて、1 か所の例外が他の測定を巻き込まないようにする。 */
  const d = await page.evaluate(() => {
    const o = { has: false, errors: [] };
    const TM = window.TAVERN_MAP;
    if (!TM) return o;
    o.has = true;
    try {
      o.COLS = TM.COLS; o.ROWS = TM.ROWS; o.TILE = TM.TILE;
      o.maskLen = TM.MASK.length;
      o.rowLens = TM.MASK.map(function (s) { return String(s).length; });
    } catch (e) { o.errors.push('dims: ' + e.message); }
    try {
      o.enters = [];
      TM.TABLES.forEach(function (t) {
        o.enters.push({ kind: 'table', key: t.key, sid: t.scenarioId || '', c: t.enter[0], r: t.enter[1] });
      });
      TM.DOORS.forEach(function (dr) {
        o.enters.push({ kind: 'door', key: dr.key, sid: '', c: dr.enter[0], r: dr.enter[1] });
      });
      o.enters.forEach(function (e) {
        try { e.walkable = !!TM.isWalkable(e.c, e.r); }
        catch (ex) { e.walkable = false; e.err = ex.message; }
      });
    } catch (e) { o.errors.push('enters: ' + e.message); }
    try {
      const sp = TM.spawnFor('door');
      o.spawn = [sp.c, sp.r];
      try { o.spawnWalkable = !!TM.isWalkable(sp.c, sp.r); } catch (ex) { o.spawnWalkable = false; }
      const reach = {};
      let walk = 0;
      for (let r = 0; r < TM.ROWS; r++) {
        for (let c = 0; c < TM.COLS; c++) {
          let w = false;
          try { w = !!TM.isWalkable(c, r); } catch (ex) { w = false; }
          if (!w) continue;
          walk++;
          let p = null;
          try { p = TM.findPath(sp.c, sp.r, c, r); } catch (ex) { p = null; }
          if (p !== null) reach[c + ',' + r] = true;
        }
      }
      o.walkable = walk;
      o.reachable = Object.keys(reach).length;
      o.unreached = (o.enters || []).filter(function (e) { return !reach[e.c + ',' + e.r]; })
        .map(function (e) { return e.kind + ':' + e.key + '(' + e.c + ',' + e.r + ')'; });
    } catch (e) { o.errors.push('flood: ' + e.message); }
    return o;
  });

  /* 絵の実寸は **ブラウザに読ませる** (配信できていること自体も同時に測れる)。 */
  const img = await page.evaluate((rel) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res({ ok: false, w: 0, h: 0 });
    im.src = rel + '?t=' + Date.now();
  }), MAP_JPG);

  await page.close();
  return Object.assign(out, d, { img: img });
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ② 焼き込み格子 — py の 2 本を child_process で回す
//   ⚠ `python` は Windows ストアのスタブで exit 49 になる。必ず `py`。
//   ⚠ PYTHONIOENCODING=utf-8 を渡す。cp932 のままだと成功行の "⭐" で UnicodeEncodeError に
//     なり、**両軸 OK なのに exit 1** になる (2026-08-27 実測)。
// ══════════════════════════════════════════════════════════════════════════════
function runPy(args) {
  const env = Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' });
  try {
    const out = execFileSync('py', args, { cwd: ROOT, encoding: 'utf8', env: env });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: (e && typeof e.status === 'number') ? e.status : -1,
             out: String((e && e.stdout) || '') + String((e && e.stderr) || '') };
  }
}
function measureGrid(tile) {
  const t = String(tile);
  const align = runPy(['tools/check_grid_alignment.py', MAP_JPG, '--tile', t]);
  const shift = runPy(['tools/check_grid_alignment.py', MAP_JPG, '--tile', t,
                       '--shift', String(Math.round(tile / 4))]);
  const drift = runPy(['tools/make_grid_map.py', '--check', MAP_JPG, '--tile', t]);
  /* ⚠⚠ 正規表現は **リテラル**で書く。new RegExp('...' + name + '...') の形だと
   *   バックスラッシュが 1 段食われて黙って (OK|NG)s+ になり、**永久にマッチしない検出器**になる
   *   (2026-08-27 に 1 回踏んだ。症状は「縦 ? / 横 ? で (1a) と (1z2) が同時に赤」)。 */
  const grab = (s, name) => {
    const RE = { '縦線': /(OK|NG)\s+縦線:[^\r\n]*相対位置\s*([0-9.]+)%/, '横線': /(OK|NG)\s+横線:[^\r\n]*相対位置\s*([0-9.]+)%/ };
    const m = s.match(RE[name]);
    return m ? { ok: m[1] === 'OK', pct: parseFloat(m[2]) } : null;
  };
  const grabDrift = (s, name) => {
    const RE = { '縦線': /縦線:[^\r\n]*累積ドリフト\s*([0-9.]+)world-px[^\r\n]*score比\s*([0-9.]+)%/, '横線': /横線:[^\r\n]*累積ドリフト\s*([0-9.]+)world-px[^\r\n]*score比\s*([0-9.]+)%/ };
    const m = s.match(RE[name]);
    return m ? { drift: parseFloat(m[1]), score: parseFloat(m[2]) } : null;
  };
  return {
    tile: tile,
    v: grab(align.out, '縦線'), h: grab(align.out, '横線'), code: align.code, out: align.out,
    shiftV: grab(shift.out, '縦線'), shiftH: grab(shift.out, '横線'), shiftCode: shift.code,
    dv: grabDrift(drift.out, '縦線'), dh: grabDrift(drift.out, '横線'), driftOut: drift.out,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ③ tavern.html を **実際に開く** (§0(0a) と §2〜§7)
//   ⭐ フェーズごとに 1 タブ。⛔ 1 枚のタブで全部を測らない (卓を押した後の状態が
//     次の測定を汚す。#12 で「同じタブで測って撤退が緑になった」空振りの前例がある)。
//   ⚠⚠ このブロックには **バックスラッシュを 1 つも書かない**。この環境の書き込み経路は
//     エスケープを 1 段食うことがあり、黙って別の正規表現になる (項目 1 が 1 回踏んだ)。
//     → 文字列判定は indexOf / endsWith、URL は new URL() で分解する。
// ══════════════════════════════════════════════════════════════════════════════
const TAVERN_PATH  = '/' + TAVERN_HTML;
const VIEW_DESKTOP = { width: 1440, height: 900 };
const VIEW_COMPACT = { width: 390, height: 844 };
/* 素の実行はこの順に全部回す。⚠ 負のコントロールは MUTATIONS[k].phases だけを回す
   (全部回すと 10 変異 x 8 フェーズで終わらない)。 */
const ALL_PHASES = ['base', 'compact', 'off', 'walk1', 'walk6', 'walkbad', 'door', 'back'];
/* (5a) の許容。⚠ 依頼書の「zoom 1.5 以下」は港町 (TILE 64) の天井を zoom で書いたもの。
   項目 2 の layout() は Math.min(96 / TILE, ...) なので、不変量は **1 マスの実表示 px**。
   ⛔ zoom で書くと TILE を変えた瞬間に意味が変わる。 */
const MIN_TILE_PX = 34;   // 依頼書 §9 (5a) の下限そのまま
const MAX_TILE_PX = 96;   // 項目 2 の天井 (港町 TILE 64 x 1.5 = 96px と同じ)
/* (6c) の比較基準。⛔ HEAD ではない (HEAD は地図改修後なので「恒等」の基準にならない)。
   638b479 = 依頼書 #25 項目 1 完了時点 = tavern.html が地図改修を受ける **前**。 */
const DOM_BASE  = '638b479';
const DOM_ROOTS = ['dialog', 'prep', 'shopScreen', 'plazaScreen'];

/* ── (6c) の「宣言済みの差分」 ────────────────────────────────────────────────
 * DOM_BASE 以後に **意図して足した**タグを、画面ごとに出現順で並べる。
 * ⛔⛔ DOM_BASE を新しいコミットへ動かして緑にするのは禁止 — 基準が改修後になると
 *    「自分自身との比較」に化けて (6c) は永久に緑になる (恒久教訓: 基準に HEAD を使うな)。
 * ⭐ 代わりに **足した分だけを列挙して差し引く**。閾値で緩めるのではなく不変条件を
 *    言い直す形なので、ここに書いていない構造変化 (削除・並べ替え・class 変更) は
 *    今までどおり全部赤になる (memory ⑧: 別要因は列挙して差し引く)。
 * ⚠ 追加のたびにここへ 1 行足す。空配列 = DOM_BASE と完全一致が期待値。
 *
 *   2026-08-29 準備画面から マッチング画面 を開き直す 🎴 編成を見る:
 *     パーティ欄のヘッダで 2 つのボタンを span で包み、その中へ #btnPartyView を足した。
 *     → 増えたタグは span 1 つと button#btnPartyView.equipToggleBtn 1 つ (#btnReroll は不動)。
 */
const DOM_ADDED = {
  dialog:      [],
  prep:        ['span', 'button#btnPartyView.equipToggleBtn'],
  shopScreen:  [],
  plazaScreen: [],
};

/* 現在の署名が「基準の署名 + 宣言済みの追加タグ (順序どおり)」ちょうどかを調べる。
 * 許すのは **挿入だけ**。基準側のタグが 1 つでも消えたり並べ替わったら差分が合わずに赤。
 * 返り値: { ok, used, why } — used = 実際に消費した追加タグ数 (宣言と一致しなければ赤)。 */
function domDeltaOk(curKey, baseKey, added) {
  const cur  = curKey  ? curKey.split('|')  : [];
  const base = baseKey ? baseKey.split('|') : [];
  const want = added || [];
  let i = 0, j = 0, k = 0;
  while (i < cur.length && j < base.length) {
    if (cur[i] === base[j]) { i++; j++; continue; }
    if (k < want.length && cur[i] === want[k]) { i++; k++; continue; }   // 宣言済みの追加
    return { ok: false, used: k, why: '基準 "' + base[j] + '" に対し実体 "' + cur[i] + '"' };
  }
  while (i < cur.length && k < want.length && cur[i] === want[k]) { i++; k++; }   // 末尾の追加
  if (j < base.length) return { ok: false, used: k, why: '基準の残り ' + (base.length - j) + ' タグが実体に無い' };
  if (i < cur.length)  return { ok: false, used: k, why: '宣言に無い余分なタグ ' + (cur.length - i) + ' 件: ' + cur.slice(i, i + 3).join('|') };
  if (k !== want.length) return { ok: false, used: k, why: '宣言した追加のうち ' + (want.length - k) + ' 件が実体に無い' };
  return { ok: true, used: k, why: '' };
}

async function settle(page) {
  try {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  } catch (e) { /* 遷移中は無視 */ }
  await sleep(180);
}

async function newTavPage(browser, o) {
  const opts = o || {};
  const page = await browser.newPage();
  const errs = [], reqs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    let url = '';
    try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (url.indexOf('favicon.ico') >= 0) return;
    errs.push('console: ' + m.text());
  });
  page.on('request', r => { try { reqs.push(r.url()); } catch (e) {} });
  /* ⚠ 前口上 #prologueOverlay は全画面の暗幕。消しておかないと席札を押せない
       (手本 = verify_quest_walk.js の measureDepart)。⛔ 他のゲーム状態は仕込まない
       — 未解放の卓が「??? のまま出ている」ことを (2d) が見るので cleared は空のまま。 */
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('dragonfighters.prologueSeen', '1'); } catch (e) {}
  });
  await page.setViewport(opts.view || VIEW_DESKTOP);
  return { page: page, errs: errs, reqs: reqs };
}

async function gotoTavern(ctx, port, query) {
  await ctx.page.goto('http://localhost:' + port + TAVERN_PATH + (query || ''),
    { waitUntil: 'load', timeout: 30000 });
  await ctx.page.waitForFunction("typeof scenarios !== 'undefined'", { timeout: 20000 });
  await settle(ctx.page);
}

/* ページ 1 枚から静的な姿を全部読む。⛔ 期待値はここに書かない (述語だけが判定する)。 */
function pageSnapshot() {
  const o = { err: [] };
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const rc = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; };
  try {
    o.mapOn    = window.__tavernMapOn === true;
    o.hasTM    = typeof window.TAVERN_MAP;
    o.hasTV    = typeof window.__TAVERN_TV;
    o.mapClass = document.body.classList.contains('tavernMapOn');
    o.viewport = !!$('#tavernViewport');
    o.stage    = !!$('#tavernStage');
    o.search   = location.search;
  } catch (e) { o.err.push('dom: ' + e.message); }
  try {
    o.scenIds    = scenarios.map(function (s) { return s.id; });
    o.scenPlaces = scenarios.map(function (s) { return s.place; });
    o.scenLen    = scenarios.length;
    o.unlocked   = scenarios.map(function (s) { return !!isUnlocked(s); });
  } catch (e) { o.err.push('scenarios: ' + e.message); }
  try {
    const TM = window.TAVERN_MAP;
    o.tableSids = TM ? TM.TABLES.map(function (t) { return t.scenarioId; }) : null;
    o.doorKeys  = TM ? TM.DOORS.map(function (d) { return d.key; }) : null;
  } catch (e) { o.err.push('TAVERN_MAP: ' + e.message); }
  try {
    o.signs = $$('#tavernStage [data-scenario]').map(function (el) {
      const r = el.getBoundingClientRect();
      const nm = el.querySelector('.tavernSignName'), ds = el.querySelector('.tavernSignDesc');
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id: el.id, sid: el.getAttribute('data-scenario'),
               cls: String(el.className).split(' ').filter(function (x) { return x; }),
               name: nm ? nm.textContent : null, desc: ds ? ds.textContent : null,
               pos: getComputedStyle(el).position, rect: rc(el),
               hitSelf: !!(hit && (hit === el || el.contains(hit))) };
    });
    o.signAll   = $$('#tavernStage .tavernSign').length;
    o.doorSigns = $$('#tavernStage [data-door]').map(function (el) { return el.id; });
    o.plazaSign = !!document.getElementById('tavernDoor_plaza');
  } catch (e) { o.err.push('signs: ' + e.message); }
  try { o.plazaUnlocked = (typeof plazaStateTV !== 'undefined') ? !!plazaStateTV.unlocked : null; }
  catch (e) { o.plazaUnlocked = null; }
  try { o.titleRect = $('#title') ? rc($('#title')) : null; }
  catch (e) { o.err.push('title: ' + e.message); }
  try {
    const ta = $('#tableArea');
    o.tableCount      = $$('#tableArea .table').length;
    o.tableAreaShown  = ta ? ta.getClientRects().length > 0 : null;
    o.tavernBg        = $('#tavern') ? getComputedStyle($('#tavern')).backgroundImage : null;
  } catch (e) { o.err.push('tableArea: ' + e.message); }
  try {
    const TV = window.__TAVERN_TV;
    o.zoom     = TV ? TV.zoom() : null;
    o.compact  = TV ? TV.compact() : null;
    o.geom     = TV ? TV.geom() : null;
    o.signKeys = TV ? TV.signKeys() : null;
    o.heroTile = TV ? TV.heroTile() : null;
  } catch (e) { o.err.push('TV: ' + e.message); }
  try {
    /* ⭐ (6b): verify_world_map.js の (7a) と **同じ照合**を、tavern のページの中で行う。
       js/world-map.js は tavern.html も読み込んでいるので、別ファイルの実体どうしを
       写経なしで突き合わせられる。 */
    const W = window.WORLD_MAP;
    o.world = (W && W.SITES) ? Object.keys(W.SITES).map(function (k) {
      const n = W.NODES[W.SITES[k]] || {};
      const sc = scenarios.filter(function (s) { return s.id === k; })[0];
      return { sid: k, node: W.SITES[k],
               label: (n.label === undefined) ? null : n.label,
               place: sc ? sc.place : null };
    }) : null;
  } catch (e) { o.err.push('world: ' + e.message); }
  return o;
}

/* ⭐ (2c) は静的な文字列比較では測れない (写しを持っていても初期値は一致するので必ず緑)。
 *   **place を書き換えて札が追随するか**という振る舞いで測る = 依頼書 §9 (2c) の文言そのもの。
 *   ⚠ 書き換えたら必ず戻す (同じタブの後続測定を汚さない)。 */
function placeLinkProbe() {
  const o = { ok: false, why: '' };
  try {
    if (!window.TAVERN_MAP) { o.why = 'TAVERN_MAP が無い'; return o; }
    if (typeof window.__tavernRefreshSigns !== 'function') { o.why = '__tavernRefreshSigns が無い'; return o; }
    const tb = window.TAVERN_MAP.TABLES.filter(function (t) {
      const sc = scenarios.filter(function (s) { return s.id === t.scenarioId; })[0];
      return sc && isUnlocked(sc);
    })[0];
    if (!tb) { o.why = '解放済みの卓が 1 つも無い (母集団が空)'; return o; }
    const sc = scenarios.filter(function (s) { return s.id === tb.scenarioId; })[0];
    const nameOf = function () {
      const e = document.getElementById('questTable_' + tb.scenarioId);
      if (!e) return null;
      const n = e.querySelector('.tavernSignName');
      return n ? n.textContent : null;
    };
    o.sid = tb.scenarioId;
    o.orig = sc.place;
    o.before = nameOf();
    o.mark = '★測定用の書き換え★';
    sc.place = o.mark;
    window.__tavernRefreshSigns();
    o.after = nameOf();
    sc.place = o.orig;
    window.__tavernRefreshSigns();
    o.restored = nameOf();
    o.ok = (o.before === o.orig) && (o.after === o.mark) && (o.restored === o.orig);
    if (!o.ok) o.why = '札が scenarios[].place を追随していない (写しを持っている)';
  } catch (e) { o.why = '例外: ' + e.message; }
  return o;
}

/* ── フェーズ: 静的な姿 (base / compact / off) ─────────────────────────────── */
async function tavSnap(browser, port, o) {
  const out = { tag: o.tag, err: null };
  const ctx = await newTavPage(browser, { view: o.view });
  try {
    await gotoTavern(ctx, port, o.query || '');
    out.snap = await ctx.page.evaluate(pageSnapshot);
    out.sawMapJs = ctx.reqs.some(function (u) { return u.indexOf('/' + MAP_JS) >= 0; });
    if (o.place) out.place = await ctx.page.evaluate(placeLinkProbe);
  } catch (e) { out.err = String(e && e.message); }
  finally { try { await ctx.page.close(); } catch (e) {} }
  out.pageErrs = ctx.errs;
  return out;
}

/* ── フェーズ: 卓へ歩く (walk1 / walk6 / walkTrap) ──────────────────────────
 *  intervalMs: null = 1 回だけ押す / 数値 = その間隔で押し続ける /
 *              'trap' = geom().msPerTile x 0.55 (⭐ 罠 A が牙を剥く速さ) */
async function tavWalk(browser, port, o) {
  const out = { tag: o.tag, err: null, clicks: 0, gaps: [], tiles: [], arrivedMs: null };
  const ctx = await newTavPage(browser, {});
  try {
    await gotoTavern(ctx, port, '');
    const pre = await ctx.page.evaluate(() => {
      const TV = window.__TAVERN_TV, TM = window.TAVERN_MAP;
      if (!TV || !TM) return null;
      const t = TM.TABLES[0], h = TV.heroTile();
      const p = TM.findPath(h.c, h.r, t.enter[0], t.enter[1]);
      return { sel: '#questTable_' + t.scenarioId, enter: t.enter, key: t.key,
               spawn: h, msPerTile: TV.geom().msPerTile, pathLen: p === null ? -1 : p.length };
    });
    if (!pre) { out.err = '__TAVERN_TV / TAVERN_MAP が無い (地図が立ち上がっていない)'; return out; }
    Object.assign(out, pre);
    const iv = (o.intervalMs === 'trap')
      ? Math.max(50, Math.round(pre.msPerTile * 0.55)) : o.intervalMs;
    out.interval = iv;
    const READ = () => ({
      dlg: getComputedStyle(document.getElementById('dialog')).display,
      tile: window.__TAVERN_TV.heroTile(),
      moving: window.__TAVERN_TV.isMoving(),
      walkingTo: window.__TAVERN_TV.walkingTo() });
    let last = 0;
    const push = (st) => {
      const k = st.tile.c + ',' + st.tile.r;
      if (out.tiles[out.tiles.length - 1] !== k) out.tiles.push(k);
    };
    const t0 = Date.now();
    const doClick = async () => {
      await ctx.page.click(pre.sel);
      if (out.clicks > 0) out.gaps.push(Date.now() - last);
      last = Date.now(); out.clicks++;
    };
    await doClick();
    out.justAfter = await ctx.page.evaluate(READ);
    push(out.justAfter);
    while (Date.now() - t0 < o.budgetMs) {
      const st = await ctx.page.evaluate(READ);
      push(st); out.final = st;
      if (st.dlg === 'flex') { out.arrivedMs = Date.now() - t0; break; }
      if (iv !== null && (o.maxClicks === undefined || out.clicks < o.maxClicks)
          && Date.now() - last >= iv) {
        try { await doClick(); } catch (e) { out.clickErr = String(e && e.message); }
      }
      await sleep(35);
    }
    out.maxGap = out.gaps.length ? Math.max.apply(null, out.gaps) : null;
  } catch (e) { out.err = String(e && e.message); }
  finally { try { await ctx.page.close(); } catch (e) {} }
  out.pageErrs = ctx.errs;
  return out;
}

/* ── フェーズ: 歩けないタイルを押す (walkbad) ───────────────────────────────
 *  ⭐⭐ 「動かない」だけでは **押せていないだけ**と区別できない。同じタブで直後に
 *    歩けるタイルを押して **動くこと** (陽性対照) まで見る。 */
async function tavWalkBad(browser, port) {
  const out = { err: null };
  const ctx = await newTavPage(browser, {});
  try {
    await gotoTavern(ctx, port, '');
    const pick = await ctx.page.evaluate(() => {
      const TV = window.__TAVERN_TV, TM = window.TAVERN_MAP;
      if (!TV || !TM) return null;
      const res = { hero: TV.heroTile(), bad: null, good: null };
      const usable = function (p) {
        if (p.x < 6 || p.y < 6 || p.x > innerWidth - 6 || p.y > innerHeight - 6) return null;
        const el = document.elementFromPoint(p.x, p.y);
        if (!el) return null;
        if (el.closest && el.closest('.tavernSign')) return null;
        const vp = document.getElementById('tavernViewport');
        if (!vp || !(vp === el || vp.contains(el))) return null;
        return el;
      };
      for (let r = 0; r < TM.ROWS && !res.bad; r++) {
        for (let c = 0; c < TM.COLS; c++) {
          if (TM.isWalkable(c, r)) continue;
          const p = TV.clientFromTile(c, r), el = usable(p);
          if (!el) continue;
          res.bad = { c: c, r: r, x: p.x, y: p.y, tile: TM.tileAt(c, r),
                      hit: el.id || el.tagName };
          break;
        }
      }
      let best = null;
      for (let r = 0; r < TM.ROWS; r++) {
        for (let c = 0; c < TM.COLS; c++) {
          if (!TM.isWalkable(c, r)) continue;
          const p = TV.clientFromTile(c, r);
          if (!usable(p)) continue;
          const path = TM.findPath(res.hero.c, res.hero.r, c, r);
          if (path === null || path.length < 2) continue;
          if (!best || path.length > best.len) best = { c: c, r: r, x: p.x, y: p.y, len: path.length };
        }
      }
      res.good = best;
      return res;
    });
    out.pick = pick;
    if (!pick) { out.err = '__TAVERN_TV / TAVERN_MAP が無い'; return out; }
    if (!pick.bad) { out.err = '押せる歩けないタイルが 1 つも見つからない (母集団が空)'; return out; }
    out.before = pick.hero;
    await ctx.page.mouse.click(pick.bad.x, pick.bad.y);
    await sleep(700);
    out.after = await ctx.page.evaluate(() => ({
      tile: window.__TAVERN_TV.heroTile(),
      moving: window.__TAVERN_TV.isMoving(),
      goal: String(document.getElementById('tavernGoal').className).indexOf('show') >= 0 }));
    if (pick.good) {
      await ctx.page.mouse.click(pick.good.x, pick.good.y);
      await sleep(700);
      out.ctrl = await ctx.page.evaluate(() => ({
        tile: window.__TAVERN_TV.heroTile(), moving: window.__TAVERN_TV.isMoving() }));
    }
  } catch (e) { out.err = String(e && e.message); }
  finally { try { await ctx.page.close(); } catch (e) {} }
  out.pageErrs = ctx.errs;
  return out;
}

/* ── フェーズ: 「町へ出る」(door) ────────────────────────────────────────────
 *  ⭐ town.html への遷移だけを横取りして中止する。中止した **リクエスト URL の search が、
 *    着地していたはずの location.search そのもの** = (4a)「クエリが 1 文字も付かない」を
 *    街を起動せずに直接測れる (手本 = verify_quest_walk.js の measureDepart)。 */
async function tavDoor(browser, port) {
  const out = { err: null, blocked: [] };
  const ctx = await newTavPage(browser, {});
  try {
    await ctx.page.setRequestInterception(true);
    ctx.page.on('request', (r) => {
      try {
        const u = r.url();
        const nav = (typeof r.isNavigationRequest === 'function')
          ? (r.isNavigationRequest() && r.frame() === ctx.page.mainFrame())
          : (r.resourceType() === 'document');
        if (nav && u.indexOf('/town.html') >= 0) {
          /* ⚠ 'aborted' を明示する。既定の abort() は net::ERR_FAILED で console.error が 1 本出る。 */
          out.blocked.push(u); r.abort('aborted'); return;
        }
        r.continue();
      } catch (e) { try { r.continue(); } catch (e2) {} }
    });
    await gotoTavern(ctx, port, '');
    const has = await ctx.page.$('#tavernDoor_town');
    if (!has) { out.err = '#tavernDoor_town が無い'; return out; }
    await ctx.page.click('#tavernDoor_town');
    const t0 = Date.now();
    while (Date.now() - t0 < 12000 && out.blocked.length === 0) await sleep(60);
    out.ms = Date.now() - t0;
    out.exitVia = await ctx.page.evaluate(() => {
      try { return sessionStorage.getItem('dragonfighters.exitVia'); }
      catch (e) { return '⛔' + e.message; } });
    if (out.blocked.length) {
      const u = new URL(out.blocked[0]);
      out.path = u.pathname; out.search = u.search; out.hash = u.hash;
    }
  } catch (e) { out.err = String(e && e.message); }
  finally { try { await ctx.page.close(); } catch (e) {} }
  out.pageErrs = ctx.errs;
  return out;
}

/* ── フェーズ: 「奥の間へ」(back) ⚠⚠ 暫定 — #26 で扉ごと消える節 ────────────── */
async function tavBack(browser, port) {
  const out = { err: null };
  const ctx = await newTavPage(browser, {});
  try {
    await gotoTavern(ctx, port, '');
    const has = await ctx.page.$('#tavernDoor_back');
    if (!has) { out.err = '#tavernDoor_back が無い'; return out; }
    await ctx.page.click('#tavernDoor_back');
    const READ = () => {
      const ta = document.getElementById('tableArea');
      const bar = document.getElementById('backroomBar');
      return {
        open: !!(ta && ta.classList.contains('backroomOpen')),
        bodyOn: document.body.classList.contains('backroomOn'),
        bar: !!(bar && bar.getClientRects().length > 0),
        tables: ta ? ta.querySelectorAll('.table').length : -1,
        artIds: Array.prototype.slice.call(document.querySelectorAll('#tableArea .table img.clientArt'))
          .map(function (im) {
            const s = im.getAttribute('src') || '';
            const i = s.lastIndexOf('client_');
            return i < 0 ? s : s.slice(i + 7).replace('.png', '');
          }),
        expected: scenarios.slice(3).map(function (s) { return s.id; }),
        tile: window.__TAVERN_TV.heroTile() };
    };
    const t0 = Date.now();
    while (Date.now() - t0 < 14000) {
      out.state = await ctx.page.evaluate(READ);
      if (out.state.open) { out.ms = Date.now() - t0; break; }
      await sleep(80);
    }
    /* 閉じるボタンで 6 卓へ戻ること (⚠ 暫定の節なので detail 止まり) */
    if (out.state && out.state.open) {
      await ctx.page.click('#backroomClose');
      await sleep(300);
      out.closed = await ctx.page.evaluate(READ);
    }
  } catch (e) { out.err = String(e && e.message); }
  finally { try { await ctx.page.close(); } catch (e) {} }
  out.pageErrs = ctx.errs;
  return out;
}

async function measureTavern(browser, port, phases, label) {
  const want = (p) => phases.indexOf(p) >= 0;
  const t = { phases: phases.slice() };
  if (!phases.length) return t;
  const say = (s) => console.log('[drv]   ' + (label || '') + ' フェーズ ' + s);
  if (want('base'))    { say('base (1440x900)');       t.base    = await tavSnap(browser, port, { tag: 'base', view: VIEW_DESKTOP, query: '', place: true }); }
  if (want('compact')) { say('compact (390x844)');     t.compact = await tavSnap(browser, port, { tag: 'compact', view: VIEW_COMPACT, query: '' }); }
  if (want('off'))     { say('off (?tavernmap=0)');    t.off     = await tavSnap(browser, port, { tag: 'off', view: VIEW_DESKTOP, query: '?tavernmap=0' }); }
  if (want('walk1'))   { say('walk1 (1 回押す)');      t.walk1   = await tavWalk(browser, port, { tag: 'walk1', intervalMs: null, budgetMs: 9000 }); }
  if (want('walk6'))   {
    say('walk6 (420ms x 6 = golden 準拠)');
    t.walk6 = await tavWalk(browser, port, { tag: 'walk6', intervalMs: 420, maxClicks: 6, budgetMs: 5000 });
    say('walkTrap (MS_PER_TILE x 0.55 で連打 = 罠 A の実証)');
    t.walkTrap = await tavWalk(browser, port, { tag: 'walkTrap', intervalMs: 'trap', budgetMs: 5000 });
  }
  if (want('walkbad')) { say('walkbad (壁を押す + 陽性対照)'); t.walkbad = await tavWalkBad(browser, port); }
  if (want('door'))    { say('door (町へ出る)');       t.door    = await tavDoor(browser, port); }
  if (want('back'))    { say('back (奥の間へ)');       t.back    = await tavBack(browser, port); }
  return t;
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ④ (6c) — 4 つの画面の **タグ構造の署名** を配信中の実体と DOM_BASE で突き合わせる
//   ⚠⚠ バックスラッシュを使わない走査器 (正規表現を組み立てるとエスケープが食われる)。
//   ⭐ 比較するのは「タグ名 + id + class の並び」。文言の変更は許し、構造の変化だけを捕まえる。
// ══════════════════════════════════════════════════════════════════════════════
const CH = { LT: 60, GT: 62, SLASH: 47, SP: 32, TAB: 9, CR: 13, LF: 10 };
const isSpaceCh = (c) => c === CH.SP || c === CH.TAB || c === CH.CR || c === CH.LF;
const isAlphaCh = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
function readTagName(src, at) {
  let e = at + 1, t = '';
  while (e < src.length) {
    const c = src.charCodeAt(e);
    if (isSpaceCh(c) || c === CH.GT || c === CH.SLASH) break;
    t += src[e]; e++;
  }
  return t;
}
function subtreeOf(src, id) {
  const i = src.indexOf('id="' + id + '"');
  if (i < 0) return null;
  const s = src.lastIndexOf('<', i);
  if (s < 0) return null;
  const tag = readTagName(src, s).toLowerCase();
  if (!tag) return null;
  let depth = 0, p = s;
  while (p < src.length) {
    const q = src.indexOf('<', p);
    if (q < 0) return null;
    if (src.charCodeAt(q + 1) === CH.SLASH) {
      if (readTagName(src, q + 1).toLowerCase() === tag) {
        depth--;
        if (depth === 0) { const g = src.indexOf('>', q); return src.slice(s, g + 1); }
      }
      p = q + 1; continue;
    }
    if (isAlphaCh(src.charCodeAt(q + 1)) && readTagName(src, q).toLowerCase() === tag) depth++;
    p = q + 1;
  }
  return null;
}
function attrOf(attrs, name) {
  const k = name + '="';
  const i = attrs.indexOf(k);
  if (i < 0) return null;
  const j = attrs.indexOf('"', i + k.length);
  return j < 0 ? null : attrs.slice(i + k.length, j);
}
function domSig(src, id) {
  const sub = subtreeOf(src, id);
  if (sub === null) return null;
  let s = '';
  for (let p = 0; p < sub.length;) {                       // HTML コメントを落とす
    const c = sub.indexOf('<!--', p);
    if (c < 0) { s += sub.slice(p); break; }
    s += sub.slice(p, c);
    const e = sub.indexOf('-->', c);
    if (e < 0) break;
    p = e + 3;
  }
  const tags = [];
  for (let p = 0; p < s.length;) {
    const q = s.indexOf('<', p);
    if (q < 0) break;
    if (!isAlphaCh(s.charCodeAt(q + 1))) { p = q + 1; continue; }
    const g = s.indexOf('>', q);
    if (g < 0) break;
    const tag = readTagName(s, q).toLowerCase();
    const attrs = s.slice(q + 1 + tag.length, g);
    const eid = attrOf(attrs, 'id'), ecl = attrOf(attrs, 'class');
    tags.push(tag + (eid ? '#' + eid : '')
      + (ecl ? '.' + ecl.trim().split(' ').filter(function (x) { return x; }).join('.') : ''));
    p = g + 1;
  }
  return { n: tags.length, key: tags.join('|') };
}
let _domBaseSrc = null, _domBaseErr = null;
function domBaseSource() {
  if (_domBaseSrc !== null || _domBaseErr !== null) return _domBaseSrc;
  try {
    _domBaseSrc = execFileSync('git', ['show', DOM_BASE + ':' + TAVERN_HTML],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  } catch (e) { _domBaseErr = String((e && e.message) || e); _domBaseSrc = null; }
  return _domBaseSrc;
}
/* 配信中の実体 (= 変異が当たっていればその後の姿) と DOM_BASE を比べる。 */
function domPair(servedSrc) {
  const base = domBaseSource();
  const out = { baseErr: _domBaseErr, roots: {} };
  for (const id of DOM_ROOTS) {
    out.roots[id] = { cur: domSig(servedSrc, id), base: base === null ? null : domSig(base, id) };
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件の表 (依頼書 §9 の §0〜§7 を **全部宣言**する)
//   形: [id, 文面, 述語 (m -> [bool, detail]) or null, PENDING の理由 or undefined]
//   ⭐ 未実装は 4 番目の要素に理由を持たせる → emit() が **PENDING** で出す。
//   ⭐ 完了条件は「PENDING 0」。⛔ 数合わせで緑にしない。
// ══════════════════════════════════════════════════════════════════════════════
const S = (m) => (m && m.stub) || {};
const kinds = (m, k) => ((S(m).enters) || []).filter(e => e.kind === k);
/* tavern.html を開いた測定。⚠ フェーズを採っていなければ null。⛔ null を緑にしない。 */
const TAV = (m) => (m && m.tav) || {};
const TB  = (m) => TAV(m).base || null;         // base フェーズ (1440x900)
const TC  = (m) => TAV(m).compact || null;      // compact フェーズ (390x844)
const TO  = (m) => TAV(m).off || null;          // ?tavernmap=0
const snapOf = (ph) => (ph && ph.snap) || {};
/* 席札 <-> シナリオの対応表 (data-scenario とページ内の scenarios[] だけから作る)。 */
function tableRows(s) {
  return (s.tableSids || []).map(function (sid) {
    const i = (s.scenIds || []).indexOf(sid);
    return { sid: sid, idx: i, unlocked: i >= 0 ? s.unlocked[i] : null,
             place: i >= 0 ? s.scenPlaces[i] : null,
             sign: (s.signs || []).filter(function (x) { return x.sid === sid; })[0] || null };
  });
}
const rectHit = (a, b) => !!(a && b) && !(a.l + a.w <= b.l || b.l + b.w <= a.l
                                       || a.t + a.h <= b.t || b.t + b.h <= a.t);
/* (7c) 用。ON / OFF の両方へ当てる **同じ 5 つの条件**。⛔ 片側だけ見て緑にしない。 */
function retreatFacts(ph) {
  const s = snapOf(ph);
  return {
    viewport: s.viewport === true,
    tv: s.hasTV === 'object',
    mapClass: s.mapClass === true,
    bgPainting: String(s.tavernBg || '').indexOf('tavern_bg.png') >= 0,
    tableAreaShown: s.tableAreaShown === true,
  };
}

const ASSERT_OF = {};
[
  /* ── §0 装置 (先に母集団を確かめる) ──────────────────────────────────────── */
  ['0z1', '[装置] スタブページに window.TAVERN_MAP が載っている (データ層の母集団ガード)',
    (m) => [!!S(m).has, S(m).has ? 'COLS=' + S(m).COLS + ' ROWS=' + S(m).ROWS + ' TILE=' + S(m).TILE
      : '⛔ undefined — 以下 §0/§1 は全部空振りになる'
      + (S(m).pageErrs && S(m).pageErrs.length ? ' / ページのエラー: ' + S(m).pageErrs.slice(0, 2).join(' | ') : '')]],
  ['0z2', '[装置] 台帳 GRIDS["' + LEDGER_KEY + '"].tile と TAVERN_MAP.TILE が一致 (2 経路の突き合わせ)',
    (m) => [!!(m.ledger && S(m).has && m.ledger.tile === S(m).TILE),
      m.ledger ? ('台帳 tile=' + m.ledger.tile + ' cells(' + m.ledger.cols + ',' + m.ledger.rows + ')'
        + ' / TAVERN_MAP.TILE=' + S(m).TILE) : '⛔ ' + LEDGER_PY + ' の GRIDS を読めない']],
  ['0a', 'window.TAVERN_MAP が tavern.html に実際に載っている'
    + ' (① 配信で js/tavern-map.js を要求した ② ページで TAVERN_MAP と __TAVERN_TV が生きている)',
    (m) => {
      const b = TB(m);
      if (!b) return [false, '⛔ base フェーズを測っていない'];
      if (b.err) return [false, '⛔ 測定が失敗: ' + b.err];
      const s = b.snap || {};
      const ok = b.sawMapJs === true && s.hasTM === 'object' && s.hasTV === 'object'
        && s.viewport === true && s.mapClass === true;
      return [ok, '/' + MAP_JS + ' を要求した=' + b.sawMapJs
        + ' / typeof TAVERN_MAP=' + s.hasTM + ' / typeof __TAVERN_TV=' + s.hasTV
        + ' / #tavernViewport=' + s.viewport + ' / body.tavernMapOn=' + s.mapClass
        + (ok ? '' : '  ⛔ この状態では §2〜§4 が全部空振りで永久緑になる (#23 の再発)')];
    }],
  ['0b', 'TAVERN_MAP.MASK.length === ROWS かつ全行の長さ === COLS',
    (m) => {
      const s = S(m);
      if (!s.has) return [false, '⛔ TAVERN_MAP が無い'];
      if (!m.ledger) return [false, '⛔ 台帳 ' + LEDGER_PY + ' の cells を読めない'];
      const dimOk = s.COLS === m.ledger.cols && s.ROWS === m.ledger.rows;
      const maskOk = s.maskLen === s.ROWS;
      const lens = uniqNums(s.rowLens);
      const rowsOk = lens.length === 1 && lens[0] === s.COLS;
      return [dimOk && maskOk && rowsOk,
        'MASK ' + s.maskLen + ' 行 (ROWS=' + s.ROWS + ') / 行長 ' + lens.join(',') + ' (COLS=' + s.COLS + ')'
        + ' / 台帳 cells(' + m.ledger.cols + ',' + m.ledger.rows + ')'
        + (dimOk ? '' : '  ⛔ 台帳と食い違い') + (maskOk ? '' : '  ⛔ MASK の行数が ROWS と違う')
        + (rowsOk ? '' : '  ⛔ 行の長さが COLS と違う')];
    }],
  ['0c', 'assets/tavern_map.jpg の実寸が COLS*TILE x ROWS*TILE と一致',
    (m) => {
      const s = S(m);
      if (!s.has) return [false, '⛔ TAVERN_MAP が無い'];
      const im = s.img || {};
      const w = s.COLS * s.TILE, h = s.ROWS * s.TILE;
      return [!!im.ok && im.w === w && im.h === h,
        (im.ok ? im.w + 'x' + im.h : '⛔ 画像を読めない') + ' / 期待 ' + w + 'x' + h
        + ' (COLS ' + s.COLS + ' x TILE ' + s.TILE + ', ROWS ' + s.ROWS + ' x TILE ' + s.TILE + ')'];
    }],

  /* ── §1 マップと絵が食い違っていない ─────────────────────────────────────── */
  ['1z1', '[装置] 母集団 — TABLES 3 卓 + DOORS 3 扉の enter があり、歩ける床が 2 マス以上ある',
    (m) => {
      const s = S(m);
      const nt = kinds(m, 'table').length, nd = kinds(m, 'door').length;
      return [nt >= 3 && nd >= 3 && (s.walkable || 0) >= 2,
        '卓 ' + nt + ' 件 / 扉 ' + nd + ' 件 / 歩ける床 ' + (s.walkable || 0) + ' マス'
        + '  ⭐ ここが 0 だと (1b)(1c) が空振りで永久緑になる'];
    }],
  ['1z2', '[装置] check_grid_alignment は --shift TILE/4 で NG になる (検出器が生きている証拠)',
    (m) => {
      const g = m.grid;
      const v = g.shiftV, h = g.shiftH;
      /* ⚠ 横は 24px (= 1/4 マス) 間隔の板の継ぎ目があるので、ずらしても OK に見えることがある
         (check_grid_alignment.py の冒頭に実測 70.9% として明記されている)。
         ⭐ 縦は板と直交するので格子線しか無く、必ず落ちる。判定は「どちらかが NG」。 */
      return [g.shiftCode !== 0 && !!(v && h) && (!v.ok || !h.ok),
        '--shift ' + Math.round(g.tile / 4) + ' で 縦 ' + (v ? (v.ok ? 'OK' : 'NG') + ' ' + v.pct + '%' : '?')
        + ' / 横 ' + (h ? (h.ok ? 'OK' : 'NG') + ' ' + h.pct + '%' : '?') + ' / exit ' + g.shiftCode];
    }],
  ['1a', '焼き込み格子がタイル境界に乗っている (縦横とも OK)',
    (m) => {
      const g = m.grid;
      const v = g.v, h = g.h;
      const ok = g.code === 0 && !!(v && h) && v.ok && h.ok;
      /* ⚠⚠ 依頼書 §9 は make_grid_map.py --check を指定しているが、この絵では
         **位相ズレが構造的に誤報する** (床の板目が 24px = 1/4 マス周期で走るため)。
         2026-08-27 実測 縦 47.50 / 横 24.50 world-px で NG。周期側 (累積ドリフト) と
         score 比は許容内。→ #24 でこの誤報のために作られた check_grid_alignment.py で判定し、
         --check の生きた指標 (ドリフト / score 比) は detail に残す。 */
      const d = (x) => x ? ('ドリフト ' + x.drift + ' / score比 ' + x.score + '%') : '?';
      return [ok,
        'check_grid_alignment: 縦 ' + (v ? (v.ok ? 'OK' : 'NG') + ' ' + v.pct + '%' : '?')
        + ' / 横 ' + (h ? (h.ok ? 'OK' : 'NG') + ' ' + h.pct + '%' : '?')
        + ' (許容 70% 以上, tile=' + g.tile + ', exit ' + g.code + ')'
        + '  [参考 make_grid_map --check: 縦 ' + d(g.dv) + ' / 横 ' + d(g.dh)
        + ' — ⚠ 位相ズレは板目 24px の倍音で構造的に誤報するので判定に使わない]'];
    }],
  ['1b', 'TABLES と DOORS の enter タイルが全件 isWalkable (0 件の例外)',
    (m) => {
      const es = S(m).enters || [];
      if (!es.length) return [false, '⛔ 母集団が空 ((1z1) を見よ)'];
      const bad = es.filter(e => !e.walkable);
      return [bad.length === 0,
        es.length + ' 件中 歩けない ' + bad.length + ' 件'
        + (bad.length ? ' ⛔ ' + bad.map(e => e.kind + ':' + e.key + '(' + e.c + ',' + e.r + ')'
            + (e.err ? '[例外 ' + e.err + ']' : '')).join(' ') : '')];
    }],
  ['1c', 'spawnFor("door") から 3 卓すべてと全ての扉へ findPath が通る',
    (m) => {
      const s = S(m);
      const es = s.enters || [];
      if (!es.length) return [false, '⛔ 母集団が空 ((1z1) を見よ)'];
      /* ⭐⭐⭐ 1 つずつ試して緑では足りない (#23「街道網は環状なので単体テストでは永久に緑」)。
         spawn から本番の findPath で到達できるタイルを **塗りつぶし**、6 件が全部その集合に
         入ることを見る。⚠⚠ findPath はブラウザで呼ぶ (自前 BFS は近傍の数が違うだけで誤報)。 */
      const un = s.unreached || [];
      return [un.length === 0 && (s.reachable || 0) > 0,
        'spawn(' + (s.spawn || []).join(',') + ')' + (s.spawnWalkable ? '' : ' ⛔歩けない')
        + ' から到達 ' + (s.reachable || 0) + '/' + (s.walkable || 0) + ' マス'
        + ' / 未到達の enter ' + un.length + ' 件' + (un.length ? ' ⛔ ' + un.join(' ') : '')];
    }],
].forEach(a => { ASSERT_OF[a[0]] = a; });

/* ── §2〜§7 (項目 3 で実装) ────────────────────────────────────────────────
 *  ⭐ 文面は依頼書 §9 のもの。逸脱した 2 本 ((3b) と (5a)) は文面にも理由を書いた。
 *  ⛔ 数合わせで緑にしない。母集団が採れていない場合は必ず **赤** にする
 *    (「測っていないから緑」は #23 の事故そのもの)。 */
[
  /* ── §2 卓が 3 つで、シナリオ1〜3 に対応している ─────────────────────────── */
  ['2a', '#tavernStage 上の席札がちょうど 3 枚 / id が questTable_<scenarioId> / 中心の elementFromPoint が自分自身',
    (m) => {
      const b = TB(m);
      if (!b) return [false, '⛔ base フェーズを測っていない'];
      const s = snapOf(b);
      const want = (s.tableSids || []).map(x => 'questTable_' + x);
      const got  = (s.signs || []).map(x => x.id);
      const cls  = (s.signs || []).every(x => (x.cls || []).indexOf('questTableSign') >= 0);
      const hit  = (s.signs || []).every(x => x.hitSelf === true);
      const ok = want.length === 3 && got.length === 3 && want.join(',') === got.join(',') && cls && hit;
      return [ok, '席札 ' + got.length + ' 枚 ' + JSON.stringify(got)
        + ' / TABLES から期待 ' + JSON.stringify(want)
        + ' / class に questTableSign=' + cls + ' / 中心が自分自身=' + hit
        + '  ⚠ .tavernSign だけで数えると扉札こみで ' + s.signAll + ' 枚になる'];
    }],
  ['2b', '⭐ 2 経路の突き合わせ: TAVERN_MAP.TABLES[].scenarioId の 3 件が tavern.html の scenarios[].id の先頭 3 件と完全一致',
    (m) => {
      const b = TB(m);
      if (!b) return [false, '⛔ base フェーズを測っていない'];
      const s = snapOf(b);
      const a1 = s.tableSids || [], a2 = (s.scenIds || []).slice(0, 3);
      const ok = a1.length === 3 && a2.length === 3 && a1.join(',') === a2.join(',');
      return [ok, 'TABLES=' + JSON.stringify(a1) + ' / scenarios[0..2]=' + JSON.stringify(a2)
        + '  ⭐ どちらも同じページから読んでいる (⛔ ドライバに写経しない)'];
    }],
  ['2c', '席札の文言が scenarios[].place から生成されている (place を書き換えると札も変わる = 写しを持っていない)',
    (m) => {
      const b = TB(m);
      if (!b) return [false, '⛔ base フェーズを測っていない'];
      const p = b.place;
      if (!p) return [false, '⛔ place の追随を測れていない'];
      return [p.ok === true,
        '卓 ' + p.sid + ': 初期 "' + p.before + '" (place="' + p.orig + '")'
        + ' → place を "' + p.mark + '" へ書き換えると札は "' + p.after + '"'
        + ' → 戻すと "' + p.restored + '"' + (p.ok ? '' : '  ⛔ ' + p.why)];
    }],
  ['2d', '未解放の卓は DOM に在り、かつ ??? 表示である (⛔ 隠していない)',
    (m) => {
      const b = TB(m);
      if (!b) return [false, '⛔ base フェーズを測っていない'];
      const s = snapOf(b);
      const rows = tableRows(s);
      const locked = rows.filter(r => r.unlocked === false);
      if (!rows.length) return [false, '⛔ 卓の母集団が空 ((0a) を見よ)'];
      if (!locked.length) return [false, '⛔ 未解放の卓が 1 つも無い = この assert は空振り'];
      const bad = locked.filter(r => !r.sign || r.sign.name !== '???'
        || (r.sign.cls || []).indexOf('locked') < 0);
      return [bad.length === 0,
        '未解放 ' + locked.length + ' 件 ' + JSON.stringify(locked.map(r => r.sid))
        + ' / DOM に無い or ??? でない ' + bad.length + ' 件'
        + (bad.length ? ' ⛔ ' + JSON.stringify(bad.map(r => ({ sid: r.sid, name: r.sign && r.sign.name })))
                      : ' (札の文言 ' + JSON.stringify(locked.map(r => r.sign.name + '/' + r.sign.desc)) + ')')];
    }],

  /* ── §3 歩いて着いてから開く ─────────────────────────────────────────────── */
  ['3z', '[装置] (3b) の 2 本の走行が成立している — 経路が 2 マス以上 / golden 走行はちょうど 6 回押した / 罠走行の実測間隔が MS_PER_TILE より速い',
    (m) => {
      const t = TAV(m), g = t.walk6, tr = t.walkTrap, w1 = t.walk1;
      if (!g || !tr) return [false, '⛔ walk6 フェーズを測っていない'];
      const ms = g.msPerTile || 0;
      const gapOk = tr.maxGap !== null && tr.maxGap !== undefined && tr.maxGap < ms;
      const pathOk = (g.pathLen || 0) >= 2 && (!w1 || (w1.pathLen || 0) >= 2);
      const clicksOk = g.clicks === 6;
      return [pathOk && clicksOk && gapOk && tr.interval < ms,
        'MS_PER_TILE=' + ms + ' / 経路 ' + g.pathLen + ' マス'
        + ' / golden 走行 ' + g.clicks + ' 回 (間隔 ' + g.interval + 'ms, 実測 max ' + g.maxGap + 'ms)'
        + ' / 罠走行 ' + tr.clicks + ' 回 (間隔 ' + tr.interval + 'ms, 実測 max ' + tr.maxGap + 'ms)'
        + (gapOk ? '' : '  ⛔ 罠走行の実測間隔が MS_PER_TILE 以上 = この機械では罠 A を再現できない')];
    }],
  ['3a', '卓を 1 回押すと、押した直後は #dialog が閉じたままで、TABLES[0].enter へ到達した後に開く',
    (m) => {
      const w = TAV(m).walk1;
      if (!w) return [false, '⛔ walk1 フェーズを測っていない'];
      if (w.err) return [false, '⛔ 測定が失敗: ' + w.err];
      const f = w.final || {};
      const at = !!(f.tile && w.enter && f.tile.c === w.enter[0] && f.tile.r === w.enter[1]);
      const ok = w.justAfter && w.justAfter.dlg === 'none' && w.arrivedMs !== null
        && f.dlg === 'flex' && at && w.tiles.length >= 2;
      return [ok, '押した直後 #dialog=' + (w.justAfter && w.justAfter.dlg)
        + ' 主人公=' + JSON.stringify(w.justAfter && w.justAfter.tile)
        + ' → 到達 ' + w.arrivedMs + 'ms 後 #dialog=' + f.dlg
        + ' 主人公=' + JSON.stringify(f.tile) + ' (期待 enter=' + JSON.stringify(w.enter) + ')'
        + ' / 通ったタイル ' + w.tiles.length + ' 個 ' + JSON.stringify(w.tiles)];
    }],
  ['3b', '⭐ 罠 A の対策が効いている: (1) 420ms x 6 回の連打で 5 秒以内に到達 かつ'
    + ' (2) MS_PER_TILE より速い連打を到達まで続けても 5 秒以内に到達する'
    + ' (⚠ 依頼書は (1) だけだが、実測すると (1) は間隔 420ms > MS_PER_TILE 340ms なので'
    + ' ガードを外しても通ってしまう = 変異 reclick が空振りする)',
    (m) => {
      const t = TAV(m), g = t.walk6, tr = t.walkTrap;
      if (!g || !tr) return [false, '⛔ walk6 フェーズを測っていない'];
      const judge = (w) => {
        if (w.err) return { ok: false, s: '⛔ 測定が失敗: ' + w.err };
        const f = w.final || {};
        const at = !!(f.tile && w.enter && f.tile.c === w.enter[0] && f.tile.r === w.enter[1]);
        const ok = w.arrivedMs !== null && w.arrivedMs <= 5000 && f.dlg === 'flex'
          && at && w.tiles.length >= 2;
        return { ok: ok, s: w.clicks + ' 回押下 (間隔 ' + w.interval + 'ms) / 到達 '
          + (w.arrivedMs === null ? '⛔ 5 秒以内に着かない' : w.arrivedMs + 'ms')
          + ' / 主人公 ' + JSON.stringify(f.tile) + ' / 通ったタイル ' + w.tiles.length
          + ' 個 ' + JSON.stringify(w.tiles) + ' / #dialog=' + f.dlg };
      };
      const a = judge(g), b = judge(tr);
      return [a.ok && b.ok, '(1) golden 準拠 420ms: ' + a.s + '  ||  (2) 罠 A の実証 '
        + tr.interval + 'ms: ' + b.s];
    }],
  ['3c', '歩けないタイルを押しても動かない (隣接まで寄せる救済を入れない) — ⭐ 直後に歩けるタイルを押して動くことまで見る (陽性対照)',
    (m) => {
      const w = TAV(m).walkbad;
      if (!w) return [false, '⛔ walkbad フェーズを測っていない'];
      if (w.err) return [false, '⛔ 測定が失敗: ' + w.err];
      const b0 = w.before || {}, a0 = w.after || {}, c0 = w.ctrl || {};
      const still = !!(a0.tile && a0.tile.c === b0.c && a0.tile.r === b0.r) && a0.moving === false;
      const ctrlMoved = !!(c0.tile && (c0.moving === true || c0.tile.c !== b0.c || c0.tile.r !== b0.r));
      return [still && ctrlMoved,
        '壁 (' + w.pick.bad.c + ',' + w.pick.bad.r + ')="' + w.pick.bad.tile + '" を押した'
        + ' (当たった要素 ' + w.pick.bad.hit + ') → 主人公 ' + JSON.stringify(b0)
        + ' のまま=' + still + ' (moving=' + a0.moving + ', goal 表示=' + a0.goal + ')'
        + ' / 陽性対照: 歩ける (' + (w.pick.good && w.pick.good.c) + ',' + (w.pick.good && w.pick.good.r)
        + ') を押すと動いた=' + ctrlMoved + ' ' + JSON.stringify(c0)];
    }],

  /* ── §4 扉 ───────────────────────────────────────────────────────────────── */
  ['4a', '「町へ出る」で exitVia === "tavern" が書かれ town.html へ遷移する / ⛔ URL にクエリが 1 文字も付かない',
    (m) => {
      const d = TAV(m).door;
      if (!d) return [false, '⛔ door フェーズを測っていない'];
      if (d.err) return [false, '⛔ 測定が失敗: ' + d.err];
      const ok = d.blocked.length >= 1 && String(d.path || '').indexOf('/town.html') >= 0
        && d.search === '' && d.hash === '' && d.exitVia === 'tavern';
      return [ok, '横取りした遷移 ' + d.blocked.length + ' 件 / path=' + d.path
        + ' search=' + JSON.stringify(d.search) + ' hash=' + JSON.stringify(d.hash)
        + ' / sessionStorage[exitVia]=' + JSON.stringify(d.exitVia) + ' / ' + d.ms + 'ms'];
    }],
  ['4b', '「奥の間へ」で #tableArea が開き、シナリオ4〜6 の 3 卓だけが並ぶ (⚠ 暫定 — #26 で扉ごと消える節)',
    (m) => {
      const b = TAV(m).back;
      if (!b) return [false, '⛔ back フェーズを測っていない'];
      if (b.err) return [false, '⛔ 測定が失敗: ' + b.err];
      const st = b.state || {};
      const ids = st.artIds || [], exp = st.expected || [];
      const ok = st.open === true && st.bodyOn === true && st.bar === true
        && st.tables === 3 && ids.length === 3 && exp.length === 3 && ids.join(',') === exp.join(',');
      return [ok, 'backroomOpen=' + st.open + ' body.backroomOn=' + st.bodyOn + ' #backroomBar=' + st.bar
        + ' / .table ' + st.tables + ' 枚 ' + JSON.stringify(ids)
        + ' / 期待 (ページの scenarios.slice(3)) ' + JSON.stringify(exp)
        + ' / ' + b.ms + 'ms かけて歩いた (主人公 ' + JSON.stringify(st.tile) + ')'
        + (b.closed ? ' / 閉じると .table ' + b.closed.tables + ' 枚へ戻る (backroomOpen=' + b.closed.open + ')' : '')];
    }],
  ['4c', '闇市の石段は plazaState.unlocked === false のとき DOM に存在しない (⛔ display:none で残っていたら赤)',
    (m) => {
      const b = TB(m);
      if (!b) return [false, '⛔ base フェーズを測っていない'];
      const s = snapOf(b);
      /* ⚠ 母集団ガード: 「札が 1 枚も出ていないから plaza も無い」を緑にしない。
         DOORS には plaza を含む 3 つがあり、そのうち 2 つは必ず出ているはず。 */
      const guard = s.plazaUnlocked === false && (s.doorSigns || []).length >= 2
        && (s.doorKeys || []).indexOf('plaza') >= 0;
      const ok = guard && s.plazaSign === false && (s.signKeys || []).indexOf('plaza') < 0;
      return [ok, 'plazaState.unlocked=' + s.plazaUnlocked
        + ' / DOORS=' + JSON.stringify(s.doorKeys) + ' / DOM の扉札=' + JSON.stringify(s.doorSigns)
        + ' / #tavernDoor_plaza=' + (s.plazaSign ? '⛔ 在る' : '無い')
        + ' / signKeys=' + JSON.stringify(s.signKeys)
        + (guard ? '' : '  ⛔ 母集団ガードが立たない (扉札そのものが出ていない)')];
    }],

  /* ── §5 compact (縦画面) ─────────────────────────────────────────────────── */
  ['5a', '390x844 で 1 マスの実表示が ' + MIN_TILE_PX + 'px 以上 ' + MAX_TILE_PX + 'px 以下'
    + ' (⚠ 依頼書の「34/64 以上・zoom 1.5 以下」は港町 TILE 64 前提。TILE と zoom から px で測る)',
    (m) => {
      const c = TC(m);
      if (!c) return [false, '⛔ compact フェーズを測っていない'];
      const s = snapOf(c);
      const tile = (s.geom && s.geom.tile) || 0;
      const z = s.zoom;
      if (!tile || typeof z !== 'number') return [false, '⛔ zoom / TILE を読めない (地図が立ち上がっていない)'];
      const px = z * tile;
      const ok = s.compact === true && px >= MIN_TILE_PX - 1e-6 && px <= MAX_TILE_PX + 1e-6;
      return [ok, 'compact=' + s.compact + ' / zoom=' + z.toFixed(4) + ' x TILE ' + tile
        + ' = 1 マス ' + px.toFixed(2) + 'px (許容 ' + MIN_TILE_PX + '〜' + MAX_TILE_PX + 'px'
        + ' = zoom ' + (MIN_TILE_PX / tile).toFixed(3) + '〜' + (MAX_TILE_PX / tile).toFixed(3) + ')'];
    }],
  ['5b', '#title の下に席札が潜っていない (#title の矩形と 3 枚の席札の矩形が交差 0 件)',
    (m) => {
      const c = TC(m);
      if (!c) return [false, '⛔ compact フェーズを測っていない'];
      const s = snapOf(c);
      if (!s.titleRect) return [false, '⛔ #title が無い'];
      if ((s.signs || []).length !== 3) return [false, '⛔ 席札が 3 枚ない (' + (s.signs || []).length + ' 枚) = 空振り'];
      const bad = s.signs.filter(x => rectHit(s.titleRect, x.rect));
      return [bad.length === 0,
        '#title ' + JSON.stringify(s.titleRect) + ' / 交差 ' + bad.length + ' 件'
        + (bad.length ? ' ⛔ ' + JSON.stringify(bad.map(x => ({ id: x.id, rect: x.rect })))
                      : ' ' + JSON.stringify(s.signs.map(x => x.id + '@' + Math.round(x.rect.t))))];
    }],
  ['5c', '@media (max-width:560px) の 2 列グリッドが席札へ効いていない (#questTable_* の position が relative ではない)',
    (m) => {
      const c = TC(m);
      if (!c) return [false, '⛔ compact フェーズを測っていない'];
      const s = snapOf(c);
      if ((s.signs || []).length !== 3) return [false, '⛔ 席札が 3 枚ない = 空振り'];
      const bad = s.signs.filter(x => x.pos === 'relative');
      return [bad.length === 0,
        '席札の position=' + JSON.stringify(s.signs.map(x => x.id + ':' + x.pos))
        + ' / relative ' + bad.length + ' 件'
        + '  ⚠ 括ってよい @media (max-width:560px) は卓のグリッドの 1 つだけ (他に #title 側と所持品カード側がある)'];
    }],

  /* ── §6 恒等 (非退行) ────────────────────────────────────────────────────── */
  ['6z', '[装置] (6c) の母集団 — 4 つの画面が配信中の実体と DOM_BASE (' + DOM_BASE + ') の両方で見つかり、10 タグ以上ある',
    (m) => {
      const d = m.dom;
      if (!d) return [false, '⛔ DOM 署名を採っていない'];
      if (d.baseErr) return [false, '⛔ git show ' + DOM_BASE + ':' + TAVERN_HTML + ' が読めない: ' + d.baseErr];
      const bad = DOM_ROOTS.filter(id => !d.roots[id].cur || !d.roots[id].base
        || d.roots[id].cur.n < 10 || d.roots[id].base.n < 10);
      return [bad.length === 0,
        DOM_ROOTS.map(id => id + ' cur=' + (d.roots[id].cur ? d.roots[id].cur.n : 'null')
          + '/base=' + (d.roots[id].base ? d.roots[id].base.n : 'null')).join(' ')
        + (bad.length ? '  ⛔ 抽出できていない: ' + bad.join(',') : '')];
    }],
  ['6a', 'scenarios は 6 件のまま (⛔ 卓を 3 つにするために配列を削らない)',
    (m) => {
      const b = TB(m);
      if (!b) return [false, '⛔ base フェーズを測っていない'];
      const s = snapOf(b);
      const nw = (s.world || []).length;
      /* ⭐ 「6」は依頼書の数だが、js/world-map.js の SITES 件数とも突き合わせる
         (片方だけ削られたら必ず気づく)。 */
      const ok = s.scenLen === 6 && nw === 6;
      return [ok, 'scenarios ' + s.scenLen + ' 件 ' + JSON.stringify(s.scenIds)
        + ' / WORLD_MAP.SITES ' + nw + ' 件'];
    }],
  ['6b', 'place の 6 件が js/world-map.js の label と 1 文字も違わない'
    + ' (⭐ verify_world_map.js の (7a) と同じ照合を tavern のページの中で行う。⛔ HEAD とは比べない)',
    (m) => {
      const b = TB(m);
      if (!b) return [false, '⛔ base フェーズを測っていない'];
      const s = snapOf(b);
      const w = s.world;
      if (!w || !w.length) return [false, '⛔ WORLD_MAP が tavern.html から見えない = 空振り'];
      const bad = w.filter(x => x.label === null || x.place === null || x.label !== x.place);
      return [w.length === 6 && bad.length === 0,
        w.length + ' 件照合 / 不一致 ' + bad.length + ' 件'
        + (bad.length ? ' ⛔ ' + JSON.stringify(bad) : ' ' + JSON.stringify(w.map(x => x.sid + ':' + x.place)))];
    }],
  ['6c', '#dialog / #prep / #shopScreen / #plazaScreen の DOM 構造が DOM_BASE (' + DOM_BASE + ') + DOM_ADDED の宣言分'
    + ' ちょうど (タグ名 + id + class の並びで比較。文言の変更は許す / 宣言に無い構造変化は赤)',
    (m) => {
      const d = m.dom;
      if (!d) return [false, '⛔ DOM 署名を採っていない'];
      if (d.baseErr) return [false, '⛔ git show が読めない: ' + d.baseErr];
      const bad = [], detail = [];
      for (const id of DOM_ROOTS) {
        const r = d.roots[id];
        const want = DOM_ADDED[id] || [];
        if (!r.cur || !r.base) { bad.push(id); detail.push(id + ' ⛔署名が採れない'); continue; }
        const v = domDeltaOk(r.cur.key, r.base.key, want);
        if (!v.ok) bad.push(id);
        detail.push(id + ' ' + r.cur.n + '/' + r.base.n
          + (want.length ? '(+宣言 ' + want.length + ')' : '')
          + (v.ok ? ' 一致' : ' ⛔不一致: ' + v.why));
      }
      return [bad.length === 0, detail.join(' / ')];
    }],
  /* ⭐ (6c) が「宣言済みの差分」を許すようになった以上、**その許しが効きすぎていない**ことを
     別 assert で押さえる。宣言に 1 件でっち上げを混ぜたら赤くなる = 差し引きが素通しでない証拠。
     ⚠ これが無いと DOM_ADDED に何を書いても緑になり、(6c) が骨抜きになったことに気づけない。 */
  ['6c2', '[装置] (6c) の差し引きが素通しでない — 宣言に実在しないタグを混ぜると不一致になる',
    (m) => {
      const d = m.dom;
      if (!d || d.baseErr) return [false, '⛔ DOM 署名を採っていない'];
      const r = d.roots['prep'];
      if (!r || !r.cur || !r.base) return [false, '⛔ #prep の署名が採れない'];
      const fake = (DOM_ADDED.prep || []).concat(['div#__df_no_such_tag__']);
      const v = domDeltaOk(r.cur.key, r.base.key, fake);
      const real = domDeltaOk(r.cur.key, r.base.key, DOM_ADDED.prep || []);
      return [v.ok === false && real.ok === true,
        '偽の宣言を足すと ok=' + v.ok + ' (' + v.why + ') / 本物の宣言では ok=' + real.ok];
    }],

  /* ── §7 撤退 ─────────────────────────────────────────────────────────────── */
  ['7a', 'tavern.html?tavernmap=0 で #tavernViewport が DOM に存在しない (⛔ display:none で残さない)',
    (m) => {
      const o = TO(m);
      if (!o) return [false, '⛔ off フェーズを測っていない'];
      if (o.err) return [false, '⛔ 測定が失敗: ' + o.err];
      const s = snapOf(o);
      if (!(s.scenLen > 0)) return [false, '⛔ OFF のページが立ち上がっていない = 空振り'];
      const ok = s.viewport === false && s.hasTV === 'undefined' && s.mapClass === false;
      return [ok, 'search=' + JSON.stringify(s.search) + ' / #tavernViewport=' + s.viewport
        + ' / typeof __TAVERN_TV=' + s.hasTV + ' / body.tavernMapOn=' + s.mapClass
        + ' / #tavernStage=' + s.stage];
    }],
  ['7b', '同 URL で #tableArea .table が scenarios と同数 (6 枚) 並び、assets/tavern_bg.png が敷かれている',
    (m) => {
      const o = TO(m);
      if (!o) return [false, '⛔ off フェーズを測っていない'];
      if (o.err) return [false, '⛔ 測定が失敗: ' + o.err];
      const s = snapOf(o);
      if (!(s.scenLen > 0)) return [false, '⛔ OFF のページが立ち上がっていない = 空振り'];
      const bg = String(s.tavernBg || '').indexOf('tavern_bg.png') >= 0;
      /* ⭐ 「6 枚」は直書きせずページの scenarios から引く (件数そのものは (6a) の担当)。 */
      const ok = s.tableCount === s.scenLen && s.tableAreaShown === true && bg;
      return [ok, '#tableArea .table ' + s.tableCount + ' 枚 (scenarios ' + s.scenLen + ' 件)'
        + ' / #tableArea が見えている=' + s.tableAreaShown
        + ' / #tavern の background-image=' + JSON.stringify(String(s.tavernBg || '').slice(0, 70))];
    }],
  ['7c', '⭐ 撤退の受入は「OFF で緑」ではなく、同じ 5 条件を ON/OFF 両方へ当てて崩れること',
    (m) => {
      const on = TB(m), off = TO(m);
      if (!on || !off) return [false, '⛔ base / off の両方を測っていない (片側だけでは判定しない)'];
      if (on.err || off.err) return [false, '⛔ 測定が失敗: ' + (on.err || off.err)];
      const a = retreatFacts(on), b = retreatFacts(off);
      const wantOn  = { viewport: true,  tv: true,  mapClass: true,  bgPainting: false, tableAreaShown: false };
      const wantOff = { viewport: false, tv: false, mapClass: false, bgPainting: true,  tableAreaShown: true };
      const ks = Object.keys(wantOn);
      const badOn  = ks.filter(k => a[k] !== wantOn[k]);
      const badOff = ks.filter(k => b[k] !== wantOff[k]);
      return [badOn.length === 0 && badOff.length === 0,
        'ON  ' + JSON.stringify(a) + (badOn.length ? ' ⛔ ' + badOn.join(',') : ' ✓')
        + '  /  OFF ' + JSON.stringify(b) + (badOff.length ? ' ⛔ ' + badOff.join(',') : ' ✓')
        + '  ⭐ 5 条件が ON/OFF で全部反転することが受入 (⛔ 片側だけ見ない)'];
    }],
].forEach(a => { ASSERT_OF[a[0]] = a; });

const SECTIONS = [
  ['§0 装置 — 先に母集団を確かめる',            ['0z1', '0z2', '0a', '0b', '0c']],
  ['§1 マップと絵が食い違っていない',            ['1z1', '1z2', '1a', '1b', '1c']],
  ['§2 卓が 3 つで、シナリオ1〜3 に対応している', ['2a', '2b', '2c', '2d']],
  ['§3 歩いて着いてから開く',                    ['3z', '3a', '3b', '3c']],
  ['§4 扉',                                      ['4a', '4b', '4c']],
  ['§5 compact (縦画面)',                        ['5a', '5b', '5c']],
  ['§6 恒等 (非退行)',                           ['6z', '6a', '6b', '6c', '6c2']],
  ['§7 撤退',                                    ['7a', '7b', '7c']],
];

/* ⭐ 出口は 1 本。PENDING の理由を持っている assert はここで PENDING になる。 */
function emit(id, m) {
  const a = ASSERT_OF[id];
  if (!a) { check('(' + id + ') ⛔ 未宣言の assert', false, 'ASSERT_OF に無い'); return; }
  if (a[3]) { pending('(' + a[0] + ') ' + a[1], a[3]); return; }
  let r;
  try { r = a[2](m); } catch (e) { r = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_tavern_map — 銀の鹿亭 歩ける D&D マップ (依頼書 #25 §9) '
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] ROOT=' + ROOT + '  PORT=' + PORT
    + (NEGATIVE ? '  変異ポート=' + MUT_IMPL.map(k => k + ':' + PORT_OF[k]).join(' ') : ''));

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_tavmap_');
  const servers = [await startServer(PORT, MUTATE)];
  if (NEGATIVE) for (const k of MUT_IMPL) servers.push(await startServer(PORT_OF[k], k));
  const base = 'http://localhost:' + PORT;
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  try {
    mark('装置 — 台帳と変異アンカー');
    check('(0m-台帳) [装置] ' + LEDGER_PY + ' の GRIDS["' + LEDGER_KEY + '"] から cells / tile を引けた',
      !!LEDGER, LEDGER ? 'cells(' + LEDGER.cols + ',' + LEDGER.rows + ') tile ' + LEDGER.tile
        : '⛔ 読めない — (0b)(0c) の期待値をドライバに直書きしてはいけないので、ここが赤なら実装を直す');
    for (const k of MUT_IMPL) {
      check('(0m-' + k + ') [装置] 変異アンカーが ' + MUTATIONS[k].file + ' の 1 箇所にヒットする',
        !!MUT_SRC[k], '置換 ' + MUTATIONS[k].from.length + ' → ' + MUTATIONS[k].to.length + ' bytes');
    }

    mark('測定 — 焼き込み格子 (py) とデータ層 (素のスタブページ)');
    /* ⭐ TILE は TAVERN_MAP から引くのが正だが、py は先に回す必要がある。
       → 先にスタブを読んで TILE を得てから、その値で py を回す。⛔ 96 を直書きしない。 */
    let stub = await probeStub(browser, base);
    const tile = (stub && stub.has && stub.TILE) ? stub.TILE : (LEDGER ? LEDGER.tile : 0);
    console.log('[drv]   TAVERN_MAP.TILE=' + (stub.has ? stub.TILE : '(無し)')
      + ' → py の --tile に ' + tile + ' を渡す');
    const grid = tile > 0 ? measureGrid(tile)
      : { tile: 0, code: -1, out: '', shiftCode: 0, v: null, h: null, shiftV: null, shiftH: null,
          dv: null, dh: null, driftOut: '' };
    if (stub.pageErrs && stub.pageErrs.length) {
      console.log('[drv]   ⚠ スタブページのエラー ' + stub.pageErrs.length + ' 件: '
        + stub.pageErrs.slice(0, 3).join(' | '));
    }

    mark('測定 — tavern.html を実際に開く (§0(0a) と §2〜§7)');
    const tav = await measureTavern(browser, PORT, ALL_PHASES, '素');
    const M = { ledger: LEDGER, grid: grid, stub: stub, tav: tav,
                dom: domPair(frozen(TAVERN_HTML).toString('utf8')) };
    for (const k of ALL_PHASES.concat(['walkTrap'])) {
      const ph = tav[k];
      if (ph && ph.pageErrs && ph.pageErrs.length) {
        console.log('[drv]   ⚠ ' + k + ' のページエラー ' + ph.pageErrs.length + ' 件: '
          + ph.pageErrs.slice(0, 2).join(' | '));
      }
    }

    for (const sec of SECTIONS) {
      mark(sec[0]);
      for (const id of sec[1]) emit(id, M);
    }

    /* ── 負のコントロール ────────────────────────────────────────────────────
     *  ⭐ 各変異について「赤くなるべき節」が実際に赤くなったかを数える。
     *    赤くならなかった変異が 1 本でもあれば **空振り** = exit 1。
     *  ⚠ PENDING の変異は母集団から外して明示的に PENDING 表示する。 */
    if (NEGATIVE) {
      for (const k of MUT_IMPL) {
        mark('負のコントロール — 変異 ' + k + ' (' + MUTATIONS[k].file + ' の配信を差し替え) → ('
          + MUTATIONS[k].targets.join(')(') + ') が赤くなる');
        const ms = await probeStub(browser, 'http://localhost:' + PORT_OF[k]);
        const mt = await measureTavern(browser, PORT_OF[k], MUTATIONS[k].phases || [], '変異 ' + k);
        /* ⚠ 変異が tavern.html を差し替えているなら (6c) も差し替え後の実体で測る */
        const src = (MUT_SRC[k] && MUT_SRC[k].file === TAVERN_HTML)
          ? MUT_SRC[k].body : frozen(TAVERN_HTML).toString('utf8');
        const mm = { ledger: LEDGER, grid: grid, stub: ms, tav: mt, dom: domPair(src) };
        const ev = MUTATIONS[k].evaluable || [];
        const res = {};
        for (const id of ev) {
          try { res[id] = ASSERT_OF[id][2](mm); }
          catch (e) { res[id] = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
        }
        for (const id of MUTATIONS[k].targets) {
          const r = res[id] || [true, '⛔ evaluable に載っていない = この変異では測っていない'];
          check('(neg-' + k + '-' + id + ') 変異 ' + k + ' で (' + id + ') が赤くなる — '
            + ASSERT_OF[id][1].slice(0, 46),
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        const red = ev.filter(id => res[id][0] === false);
        const extra = red.filter(id => MUTATIONS[k].targets.indexOf(id) < 0);
        const unexpected = extra.filter(id => (MUTATIONS[k].allowRed || []).indexOf(id) < 0);
        /* ⭐ 「効きすぎていないこと」まで見る。依頼書 §9 の表は赤くなるべき節を最小限しか
           書いていないので、余分に赤くなる節は allowRed で明示的に許可して証拠へ出す。 */
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない (見た節=' + ev.join('/') + ')',
          unexpected.length === 0,
          '赤=' + (red.length ? red.join(',') : '(無し)')
          + '  担当=' + MUTATIONS[k].targets.join(',')
          + '  想定内の巻き添え=' + ((MUTATIONS[k].allowRed || []).length ? MUTATIONS[k].allowRed.join(',') : '(無し)')
          + '  緑のまま=' + (ev.filter(x => red.indexOf(x) < 0).join(',') || '(無し)')
          + (unexpected.length ? '  ⛔ 想定外の巻き込み=' + unexpected.join(',') : ''));
      }
      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⭐ 項目 3 の完了条件 = ここが 0 件)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → ' + MUTATIONS[k].targets.map(t => '(' + t + ')').join('')
            + ' が赤くなる  [' + MUTATIONS[k].file + ']', MUTATIONS[k].why);
        }
      } else {
        mark('変異の実装漏れ');
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, (e && e.message) + '\n' + ((e && e.stack) || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend   = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length
    + (NEGATIVE ? '   [負のコントロール]' : (MUTATE ? '   [変異 ' + MUTATE + ']' : '')));
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (完了条件 = ここが 0 件。項目 3 が埋める):');
    for (const b of pend) console.log('    - ' + b.name);
  }
  console.log('──────────────────────────────────────────────');
  process.exit(failed.length ? 1 : 0);
})();
