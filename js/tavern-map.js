/*
 * js/tavern-map.js — 銀の鹿亭 1 階ホールの **データと経路探索** v1
 * ------------------------------------------------------------------
 * 実装依頼書 `実装依頼書/2026-08-26_stag-tavern-dnd-map.md` の STEP2。
 *
 * ★ 何のためのデータか
 *   tavern.html が「どこを歩けるか」「どの卓がどのシナリオか」「酒場へ入った時どこに立つか」を
 *   決めるための唯一の出所。⚠ **tavern.html 側に写しを作らないこと**
 *   (js/town-map.js・js/save-slots.js と同じ作法)。
 *
 * ★ 共有モジュール / クラシックスクリプト (ES module ではない)
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      よって公開データは末尾で **明示的に window へ代入**している。
 *   ⚠⚠ tavern.html に <script src="js/tavern-map.js"></script> を書き忘れると、
 *      window.TAVERN_MAP が undefined のまま「何も起きないのに assert が全部緑」になる
 *      (#23 で js/world-map.js を読み込み忘れて実際に起きた事故)。
 *      → tools/verify_tavern_map.js の (0a) が母集団ガードとして毎回これを見る。
 *
 * ★ 座標系  ⚠ town-map.js と **1 マスの px が違う** (あちらは 64)
 *   assets/tavern_map.jpg は **15 x 10 マス / 1 マス 96px** (1440x960) で焼いてある。
 *   焼き込みグリッドの実測値と焼き直しの手順は tools/make_grid_map.py の GRIDS["stag-tavern"]。
 *   ⭐ 96px にした理由は台帳のコメントが唯一の正 (素材の格子が 99.8 x 97.5px あるので
 *      96px で焼いても拡大にならない。64px だと表示時に 1.31 倍へ拡大されてぼける)。
 *   ⚠ 素材を差し替えたら **マスクも作り直す**。マスクは絵に貼り付いたデータであって設定ではない。
 *
 * ★ 記号を `.` と `#` の 2 種類にしない理由 (town-map.js と同じ作法)
 *   歩けない理由を 1 語にまとめると、目視ツールで色分けできず絵とのズレが見えなくなる。
 *   `.` = 歩ける はそのままで、**塞ぐ側だけを理由ごとの文字に割る**。
 *   ⚠ 「塞ぐ理由」を判定に使わないこと。通行可否は isWalkable() ただ 1 本。
 *
 * ★ 経路探索は **4 近傍** (town-map.js / index.html の aStar と同じ)。
 *   ⛔ 8 近傍にしない (#12 で「index.html は 8 近傍」という前提が実測で崩れている)。
 */
(function (global) {
  "use strict";

  var COLS = 15, ROWS = 10;
  var TILE = 96;                       // ★assets/tavern_map.jpg を焼いた 1 マスの px

  /* ── 通行マスク ────────────────────────────────────────────────────────────
   *   `.` 歩ける / `W` 石壁・羽目板・仕切り / `T` 円卓と椅子 / `F` 暖炉
   *   `C` カウンター・酒樽・長椅子・木箱 / `S` 地下への石段 / `D` 扉 (閉じている)
   *
   *        0         1
   *        012345678901234
   * ⚠ 外周 1 マスはすべて外壁。⭐ 焼き上がりに外壁が**入っている**ので、
   *   絵の端 = マップの端 = 壁 になっている (捨てたのは壁のさらに外側の帯だけ)。
   * ⚠⚠ (13,1) の扉は北東の壁に嵌っており、その南 (13,2) は **一段上がった木の踊り場**。
   *   踊り場は歩ける。⭐ (13,3) → (13,2) → 扉 という導線を残すために (13,2) を `.` にしている。
   *   ⛔ ここを塞ぐと「奥の間へ」の扉が絵の中で孤立して見える。
   * ⚠ (4,1) は暖炉の左の空き床。**(5,1) を塞ぐと孤立する**ので (5,1) は歩けるままにする
   *   (小樽はセルの左上隅にあり、足元を置くタイル中心は床)。
   */
  var MASK = [
    /* row 0 */ "WWWWWWFFWWWWWWW",
    /* row 1 */ "WCCC..FF.CCCCDW",
    /* row 2 */ "W..TT....CCCC.W",
    /* row 3 */ "WC.TT.........W",
    /* row 4 */ "WC.......TT..CW",
    /* row 5 */ "WC.......TT..CW",
    /* row 6 */ "WC..TT.......CW",
    /* row 7 */ "WSS.TT........W",
    /* row 8 */ "WSS.......CCCCW",
    /* row 9 */ "WWWWWWDDWWWWWWW"
  ];

  /* 塞ぐ理由のラベル。⚠ 判定には使わない。目視補助の色分け専用 */
  var LEGEND = {
    ".": { label: "歩ける",         color: "rgba(80,220,120,0.00)" },
    "W": { label: "石壁・羽目板",   color: "rgba(255,255,255,0.40)" },
    "T": { label: "円卓と椅子",     color: "rgba(255,190,60,0.45)" },
    "F": { label: "暖炉",           color: "rgba(255,90,40,0.45)"  },
    "C": { label: "カウンター・樽", color: "rgba(190,120,255,0.45)" },
    "S": { label: "地下への石段",   color: "rgba(60,150,255,0.45)" },
    "D": { label: "扉",             color: "rgba(255,80,80,0.45)"  }
  };

  function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
  function tileAt(c, r) { return inBounds(c, r) ? MASK[r].charAt(c) : "#"; }
  function isWalkable(c, r) { return tileAt(c, r) === "."; }

  /* ── 経路探索 (A*) ────────────────────────────────────────────────────────
   *  ⚠ js/town-map.js の findPath と **同じ形**: 4 近傍 / マンハッタン距離 /
   *    戻り値は「始点を含まない」タイル列。到達できないときは null。
   *  ⚠⚠ 検証ドライバはこの関数を **ブラウザで呼ぶ**こと。自前で BFS を書くと、
   *     近傍の数が違うだけで「歩けない道」を永久に緑と報告する (恒久教訓)。 */
  function findPath(sc, sr, gc, gr) {
    if (!isWalkable(sc, sr) || !isWalkable(gc, gr)) return null;
    if (sc === gc && sr === gr) return [];
    var key = function (c, r) { return r * COLS + c; };
    var h = function (c, r) { return Math.abs(c - gc) + Math.abs(r - gr); };
    var startK = key(sc, sr), goalK = key(gc, gr);
    var gScore = new Map([[startK, 0]]);
    var fScore = new Map([[startK, h(sc, sr)]]);
    var cameFrom = new Map();
    var pos = new Map([[startK, { c: sc, r: sr }]]);
    var openArr = [startK], inOpen = new Set([startK]);
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (openArr.length > 0) {
      var minIdx = 0, minF = fScore.get(openArr[0]);
      for (var i = 1; i < openArr.length; i++) {
        var f = fScore.get(openArr[i]);
        if (f < minF) { minF = f; minIdx = i; }
      }
      var curK = openArr[minIdx];
      openArr.splice(minIdx, 1); inOpen.delete(curK);
      if (curK === goalK) {
        var path = [], k = curK;
        while (cameFrom.has(k)) { path.unshift(pos.get(k)); k = cameFrom.get(k); }
        return path;
      }
      var cur = pos.get(curK);
      for (var d = 0; d < DIRS.length; d++) {
        var nc = cur.c + DIRS[d][0], nr = cur.r + DIRS[d][1];
        if (!isWalkable(nc, nr)) continue;
        var nk = key(nc, nr);
        var tentG = gScore.get(curK) + 1;
        if (tentG < (gScore.has(nk) ? gScore.get(nk) : Infinity)) {
          cameFrom.set(nk, curK);
          gScore.set(nk, tentG);
          fScore.set(nk, tentG + h(nc, nr));
          pos.set(nk, { c: nc, r: nr });
          if (!inOpen.has(nk)) { openArr.push(nk); inOpen.add(nk); }
        }
      }
    }
    return null;
  }

  /* ── 卓 (= 依頼人の席) ─────────────────────────────────────────────────────
   *  ⭐⭐⭐ scenarioId の唯一の正は **tavern.html の scenarios[].id**。
   *    ここには id だけを持ち、place / difficulty / client は **1 文字も写さない**
   *    (同じページに両方あるのだから、重複させる理由が無い)。
   *    → 変異 `copyplace` が「写しを持った状態」を作って (2c) を赤くする。
   *  enter … そこまで歩いてから話しかけるタイル (⚠ 必ず MASK が "." であること)
   *  sign  … 席札を浮かせるタイル (歩けなくてよい)
   *  ⚠ 席札どうしが絵の中で潰れないよう、同じ行に置くなら 3 タイル以上あける
   *    (#22 で港町の立て札が 3 タイル差で交差した実測がある)。 */
  var TABLES = [
    { key: "t1", scenarioId: "goblin-mine",    enter: [4, 4], sign: [4, 1] },
    { key: "t2", scenarioId: "bandits-forest", enter: [4, 8], sign: [4, 5] },
    { key: "t3", scenarioId: "lizard-swamp",   enter: [9, 6], sign: [9, 3] }
  ];

  /* ── 扉 ────────────────────────────────────────────────────────────────────
   *  town  … 表通りへ出る (exitVia="tavern" を書いて town.html へ)
   *          ⛔ 遷移先にクエリを足さない (#6 / #12 の確定作法)
   *  back  … ⚠⚠ **暫定**。シナリオ4〜6 の受け口。
   *          #26 で復興評議会館ができたら **この扉ごと撤去する**。
   *          ⭐ 新しい画面を作らず、既存の #tableArea を 3 件だけで描き直して重ねる。
   *  plaza … 闇市への石段。⚠ 解禁前は **DOM に作らない**
   *          (display:none で残すと押せてしまう事故の芽になる。town.html と同じ作法)。 */
  var DOORS = [
    { key: "town",  name: "町へ出る",     enter: [7, 8],  sign: [7, 7],
      desc: "港町フランの通りへ", to: "town.html" },
    { key: "back",  name: "奥の間へ",     enter: [13, 2], sign: [13, 3],
      desc: "格の違う依頼はこの奥で", provisional: true },
    { key: "plaza", name: "地下への石段", enter: [3, 7],  sign: [2, 8],
      desc: "下りれば闇市。牙貨だけが物を言う", requiresPlazaUnlock: true }
  ];

  /* ── 立ち位置 ──────────────────────────────────────────────────────────────
   *  規則は town-map.js と 1 本: **酒場へ入るときは、直前に居た場所の前に立つ。**
   *  ⚠ 未知の値 / 欠損では必ず "door" (表口の内側) へ落とす (fail-safe)。 */
  var SPAWNS = {
    door:    [7, 8],
    town:    [7, 8],
    dungeon: [7, 8],
    back:    [13, 3],
    plaza:   [3, 7]
  };
  function spawnFor(via) {
    var s = (via && SPAWNS[via]) || SPAWNS.door;
    return { c: s[0], r: s[1] };
  }

  global.TAVERN_MAP = {
    COLS: COLS, ROWS: ROWS, TILE: TILE,
    MASK: MASK, LEGEND: LEGEND,
    TABLES: TABLES, DOORS: DOORS, SPAWNS: SPAWNS,
    inBounds: inBounds, tileAt: tileAt, isWalkable: isWalkable,
    findPath: findPath, spawnFor: spawnFor
  };
})(typeof window !== "undefined" ? window : this);
