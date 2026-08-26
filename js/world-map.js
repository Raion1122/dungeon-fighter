/*
 * js/world-map.js — 地方全景 (ワールドマップ) の **ルートグラフと立ち位置** v1
 * ------------------------------------------------------------------
 * 実装依頼書 `実装依頼書/2026-08-25_world-map-entry.md` の §4-2 / §5。
 *
 * ★ 何のためのデータか
 *   world.html が「どこに拠点があるか」「どこを歩けるか」「ワールドマップに出た時
 *   どこに立つか」を決めるための唯一の出所。⚠ **world.html 側に写しを作らないこと**
 *   (js/town-map.js・js/save-slots.js・js/hero-classes.js と同じ作法)。
 *
 * ★ 共有モジュール / クラシックスクリプト (ES module ではない)
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      よって公開データは末尾で **明示的に window へ代入**している。
 *
 * ★ 座標系 — **原寸 px**。⛔ タイル格子を作らない (依頼書 §2-4 の罠 C)
 *   assets/world_region.jpg は 1536x1024。24x16 マス / 1 マス 64px にちょうど乗るが、
 *   **街道の描き幅が 1 マス 64px に対して実測 ~10px しかない**ので、64px マスへ量子化すると
 *   「絵では道なのにマスが塞ぐ / 絵では原野なのにマスが通す」が大量に出る。
 *   → 通行マスクは作らず、**ノードとエッジのルートグラフ**を持つ。
 *
 * ★⭐⭐⭐ 画面に描く点線と、歩けるデータは **EDGES ただ 1 つ**から生成すること。
 *   2 つ持つと必ずズレる (依頼書 §2-4 の罠 C = 負のコントロール maskdrift の対象)。
 *
 * ★ 札の文言 (label) の唯一の正は **tavern.html の `place:`** (`:2221` 廃坑 ほか)。
 *   world.html から 6,800 行の tavern.html は読めないので **意図的に重複させている**。
 *   ⚠⚠ このドリフトは tools/verify_world_map.js の (7a) が
 *      **配信中の tavern.html の実体と機械照合**して止める。⛔ 文言を勝手に言い換えない。
 *
 * ★ 説明文 (desc) の唯一の正は **ここ**。⛔ world.html にもドライバにも写さない。
 *
 * ★ 水の上を通らないこと
 *   全ノード / 全エッジは (1a) が「周囲 32px 角の水率 40% 未満」で機械的に縛る。
 *   実測 (assets/world_region.jpg・依頼書 §2-6 の式) では最悪でも pier の 6.1%。
 *   ⚠ 道の色は東半分 (岩山・溶岩荒地) で機械判定できないので受入条件にしない (依頼書 §2-6)。
 */
(function (global) {
  "use strict";

  var W = 1536, H = 1024;              // ★assets/world_region.jpg の実寸。座標は全部この px 系

  /* ── ノード ───────────────────────────────────────────────────────
   *  kind: "site" … 拠点 (札が出る。ちょうど 7 つ)
   *        "way"  … 中継点 (札は出ない。線の折れ目)
   *  enter: 入ると遷移するページ。⛔ クエリを足さない (#6 / #12 の確定作法)。
   *         ⭐ v1 で enter を持つのは phlan ただ 1 つ (依頼書 §12-3 のユーザー決定)。
   *            他の 6 枚は地名を見せるだけで、押しても歩いて行くだけ。
   *  signDx: **札 (.worldSign) だけ**を左右へ逃がす原寸 px (省略 = 0)。
   *     ⛔ ノード座標 (x/y) も当たり判定 (.worldNode 44px 角) も動かさない。
   *     ⭐ 2026-08-26 実測 (1440x900 / zoom 0.8125): cross_n に立つと主人公 (world-x
   *        432〜528) が phlan の札 (337〜495) の**右端 63 x 47px = 面積の 39.9%** を隠す。
   *        地図全体でこの規模の重なりは **この 1 組だけ**。次点は mine に立ったときの
   *        temple の左端 4.5px (2.7%) = 枠線 1 本ぶんなので直さない。
   *     ⚠ だから逃がすのは phlan の 1 枚だけ。全体に効くオフセットにしない
   *        (他の 6 枚は今どこにも重なっていないので、動かすと理由なく中心からズレる)。
   *  ⚠⚠⚠ 絵に描かれているのは「村」であって、砦も神殿も坑口も描かれていない。
   *     だから 6 つの拠点は **描かれた集落を避け、地形が合う場所**へ置いてある
   *     (北の農村 / 東の湖畔村 / 南の森の村 の 3 つは札を出さない中継点のまま)。
   *  ⚠ 行を縦に揃え直さないこと。tools/verify_world_map.js の変異アンカーが
   *     mine / swamp / temple の **1 行まるごと**を文字列で握っている (0 件ヒットで exit 3)。 */
  var NODES = {
    phlan:     { kind: "site", x:  416, y: 544, label: "港町フラン", desc: "船着き場と酒場。旅の起点", enter: "town.html", signDx: -72 },
    forest:    { kind: "site", x:  416, y: 352, label: "町外れの森", desc: "港町の北に広がる針葉樹林" },
    swamp:     { kind: "site", x:  544, y: 672, label: "沼地", desc: "湖の西に沈む湿地" },
    fort:      { kind: "site", x:  928, y: 736, label: "廃墟の砦", desc: "湖の南、岩がちな高地の廃墟" },
    mine:      { kind: "site", x: 1056, y: 352, label: "廃坑", desc: "雪山の麓に口を開けた坑道" },
    temple:    { kind: "site", x: 1184, y: 416, label: "地下神殿", desc: "雪山の谷あいに埋もれた神殿" },
    dragon:    { kind: "site", x: 1312, y: 672, label: "ドラゴンの巣", desc: "溶岩の荒地。火口が煙を上げる" },

    /* 中継点。⚠ pier は桟橋の上 = 図の中で唯一わずかに水が掛かる (実測 6.1%)。 */
    pier:      { kind: "way",  x:  352, y: 608 },
    cross_n:   { kind: "way",  x:  480, y: 480 },
    farm_n:    { kind: "way",  x:  608, y: 224 },
    pass_n:    { kind: "way",  x:  736, y:  96 },
    lake_n:    { kind: "way",  x:  736, y: 288 },
    village_s: { kind: "way",  x:  736, y: 864 },
    lakeside:  { kind: "way",  x: 1056, y: 544 }
  };

  /* ── エッジ ───────────────────────────────────────────────────────
   *  ⭐⭐⭐ **画面に描く点線と、歩けるデータは この配列ただ 1 つから生成する。**
   *  ⚠ 依頼書 §5-2 は「12 本」と書いているが、同じ節が並べている 6 本の連なりを
   *     数えると **14 本**になる (連なりの側が本体なので 14 本で実装した)。 */
  var EDGES = [
    ["pier", "phlan"], ["phlan", "cross_n"],
    ["cross_n", "forest"], ["forest", "farm_n"], ["farm_n", "pass_n"],
    ["farm_n", "lake_n"], ["lake_n", "lakeside"],
    ["cross_n", "swamp"], ["swamp", "village_s"], ["village_s", "fort"], ["fort", "lakeside"],
    ["lakeside", "mine"], ["mine", "temple"],
    ["lakeside", "dragon"]
  ];

  function has(id) { return Object.prototype.hasOwnProperty.call(NODES, id); }

  /* 隣接。⛔ 別表を作らない (EDGES から毎回引く = 線とデータが同一である担保)。 */
  function neighbors(id) {
    var out = [];
    for (var i = 0; i < EDGES.length; i++) {
      var e = EDGES[i];
      if (e[0] === id && out.indexOf(e[1]) < 0) out.push(e[1]);
      else if (e[1] === id && out.indexOf(e[0]) < 0) out.push(e[0]);
    }
    return out;
  }

  function dist(a, b) {
    var na = NODES[a], nb = NODES[b];
    return Math.sqrt((na.x - nb.x) * (na.x - nb.x) + (na.y - nb.y) * (na.y - nb.y));
  }

  /* ── 経路探索 (グラフ上のダイクストラ / 重み = 画面上の距離 px) ─────────
   *  ⚠ 戻り値は js/town-map.js の findPath と同じ契約:
   *      **始点を含まないノード id の列** / 同じノードなら [] / 到達できなければ null。
   *  ⚠⚠ 検証ドライバはこの関数を **ブラウザで呼ぶ**こと。自前で BFS を書くと、
   *     近傍の定義が違うだけで「歩けない道」を永久に緑と報告する (恒久教訓)。 */
  function findPath(fromId, toId) {
    if (!has(fromId) || !has(toId)) return null;
    if (fromId === toId) return [];
    var g = {}, prev = {}, done = {}, open = [fromId];
    g[fromId] = 0;
    while (open.length > 0) {
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (g[open[i]] < g[open[bi]]) bi = i;
      var cur = open.splice(bi, 1)[0];
      if (done[cur]) continue;
      done[cur] = true;
      if (cur === toId) {
        var path = [], k = cur;
        while (k !== fromId) { path.unshift(k); k = prev[k]; }
        return path;
      }
      var ns = neighbors(cur);
      for (var j = 0; j < ns.length; j++) {
        var n = ns[j];
        if (done[n]) continue;
        var cand = g[cur] + dist(cur, n);
        if (!(n in g) || cand < g[n]) { g[n] = cand; prev[n] = cur; if (open.indexOf(n) < 0) open.push(n); }
      }
    }
    return null;
  }

  /* ── シナリオ id → 拠点ノード id ─────────────────────────────────
   *  ⚠⚠⚠ 依頼書 §5-3 / §8 (4a) の表は `mtn_foot` / `farm` / `volcano` という
   *     **存在しないノード id** を指している (§12-3「6 シナリオの地にも札を置く」が
   *     決まる前の旧稿の残り。orc-fort → village_s / undead-temple → lakeside も
   *     中継点を指してしまっている)。
   *  ⭐ 正しい対応は「各シナリオ → そのシナリオ自身の拠点ノード」= §5-1 の表そのもの。
   *     根拠 = §5-3 の規則「ワールドマップに出るときは、直前に居た場所に立つ」+
   *     §12-3 で 6 シナリオそれぞれに札 (拠点ノード) を立てると決めたこと。
   *  ⚠ 6 つのキーは index.html:3204 / tavern.html の scenarios[].id と同じ。
   *     tools/verify_world_map.js の (4s) が **tavern.html の実体**と機械照合する。 */
  var SITES = {
    "goblin-mine":    "mine",
    "bandits-forest": "forest",
    "lizard-swamp":   "swamp",
    "orc-fort":       "fort",
    "undead-temple":  "temple",
    "dragon-lair":    "dragon"
  };

  /* ── 解放の鎖 (依頼書 #23 §2-5) ─────────────────────────────
   *  ⭐⭐⭐ **唯一の正は tavern.html:2218 の scenarios[] の locked / unlockAfter。**
   *     world から 6,802 行の tavern は読めないので #21 の label と同じく
   *     **意図的に重複させ、ドライバが配信中の実体と機械照合する**
   *     (tools/verify_quest_walk.js の (2z) / verify_world_map.js の (7a) が前例)。
   *  ⚠ null = 最初から解放済み (goblin-mine だけ locked: false)。
   *  ⛔ ここへ「クリア済みか」を持たせない。状態の出所は localStorage の 1 キーだけ。 */
  var UNLOCK = {
    "goblin-mine":    null,
    "bandits-forest": "goblin-mine",
    "lizard-swamp":   "bandits-forest",
    "orc-fort":       "lizard-swamp",
    "undead-temple":  "orc-fort",
    "dragon-lair":    "undead-temple"
  };

  /* シナリオが地図に出るか。cleared は localStorage["dragonfighters.cleared"] の配列そのもの。
   * ⚠ 契約は tavern.html:4179 の isUnlocked() と同一 — 前提が無ければ常に true。 */
  function isRevealed(scenarioId, cleared) {
    if (!Object.prototype.hasOwnProperty.call(UNLOCK, scenarioId)) return true;
    var need = UNLOCK[scenarioId];
    if (!need) return true;
    return Array.isArray(cleared) && cleared.indexOf(need) >= 0;
  }

  /* ノード id → シナリオ id (SITES の逆引き)。⛔ 別表を作らず SITES から毎回引く。 */
  function scenarioOfNode(nodeId) {
    var ks = Object.keys(SITES);
    for (var i = 0; i < ks.length; i++) if (SITES[ks[i]] === nodeId) return ks[i];
    return null;
  }

  /* ── 立ち位置 ─────────────────────────────────────────────────────
   *  規則は 1 本: **ワールドマップに出るときは、直前に居た場所に立つ。**
   *
   *   | 入口                 | 出所                               | 湧く場所                  |
   *   |----------------------|------------------------------------|---------------------------|
   *   | キャラ選択の後       | title.html から来た (exitVia 無し)  | pier — 船で上陸したところ |
   *   | ダンジョンからの帰還 | exitVia === "dungeon"              | SITES[currentScenario]    |
   *   | 未知の値 / 欠損      | —                                  | **phlan** (fail-safe)     |
   *
   *  ⛔ exitVia を removeItem しない (依頼書 §2-2 の罠 A)。読むだけ。消費するのは town.html。
   *  ⛔ lastResult / enterVia には一切触れない。
   *  ⚠ 戻り値は **ノード id の文字列**。未知の値 / 欠損では必ず "phlan" へ落とす。 */
  function spawnFor(via, scenarioId) {
    if (via === "title") return "pier";
    if (via === "dungeon") {
      var n = SITES[scenarioId];
      if (n && has(n)) return n;
      return "phlan";
    }
    return "phlan";
  }

  global.WORLD_MAP = {
    W: W, H: H,
    NODES: NODES, EDGES: EDGES, SITES: SITES, UNLOCK: UNLOCK,
    has: has, neighbors: neighbors, findPath: findPath, spawnFor: spawnFor,
    isRevealed: isRevealed, scenarioOfNode: scenarioOfNode
  };
})(typeof window !== "undefined" ? window : this);
