/*
 * js/town-map.js — 港町フランの街マップ **データと経路探索** v1
 * ------------------------------------------------------------------
 * 実装依頼書 `実装依頼書/2026-08-22_town-map-phlan.md` の「新規作成 2」。
 *
 * ★ 何のためのデータか
 *   town.html が「どこを歩けるか」「どの扉がどこにあるか」「街に入った時どこに立つか」を
 *   決めるための唯一の出所。⚠ **town.html 側に写しを作らないこと**
 *   (js/save-slots.js・js/hero-classes.js と同じ作法)。
 *
 * ★ 共有モジュール / クラシックスクリプト (ES module ではない)
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      よって公開データは末尾で **明示的に window へ代入**している。
 *
 * ★ 座標系
 *   assets/town_phlan.jpg は **23 x 15 マス / 1 マス 64px** (1472x960) で焼いてある。
 *   焼き込みグリッドの実測値と焼き直しの手順は tools/make_grid_map.py の GRIDS["phlan-harbor"]。
 *   ⚠ 素材を差し替えたら **マスクも作り直す**。マスクは絵に貼り付いたデータであって設定ではない。
 *
 * ★ なぜ記号が `.` と `#` の 2 種類ではないのか  ⚠ 依頼書 §6 からの意図的な逸脱
 *   依頼書 §6 は「ROOM_PAINTINGS_DEF の blocked と同じ記号 (`.` / `#`)」と書いているが、
 *   同じ依頼書の STEP2-4 が「**歩けない理由を 1 語でまとめない**。水 / 建物 / 露店 / 瓦礫 / 岩を
 *   色分けして出す」と要求している。両立させるため、**塞ぐ側だけを理由ごとの文字に割った**。
 *   `.` = 歩ける はそのまま。**`.` 以外はすべて塞ぐ**ので、`#` 作法の上位互換になっている。
 *   ⭐ 理由を別ファイルに持つと 2 つのデータが必ずズレる。1 枚のマスクに畳むのが正しい。
 *   ⚠ 「塞ぐ理由」を判定に使わないこと。通行可否は isWalkable() ただ 1 本。
 *
 * ★ 作法 (ROOM_PAINTINGS_DEF と同じ。index.html:4640 付近のコメントが出所)
 *   ① 地面に平置きの物 (板・鎖・布・小石) は塞がない。跨げる物を塞ぐと理不尽になる。
 *   ② 塞ぐのは樽・木箱・天幕・柵・足場のような「立っている物」だけ。
 *   ③ 迷ったら塞がない。すり抜けは見た目の粗だが、塞ぎすぎは詰みを生む。
 *   ⚠ ただし ③ には **孤立の禁止** が対になる。塞ぎすぎて「そこへ行けないマス」を作ると
 *     tools/verify_town_map.js の受入条件 2 が赤くなる (歩けるのに到達できないマスは 0 件)。
 *
 * ★ 経路探索は **4 近傍**  ⚠ 依頼書 §6 の「index.html の aStar は 8 近傍」は誤り
 *   着手前に実測した: index.html:16246 の近傍は `[[1,0],[-1,0],[0,1],[0,-1]]` = **4 近傍**。
 *   8 近傍のリスト (CHARIOT_DIRS8 など) は別用途。本番と揃えるため、ここも 4 近傍にする。
 *   ⭐ 依頼書が心配していた「絵では通れるのに斜めに抜けられない」は、
 *     **マスク側で斜めしか通れない隘路を作らない**ことで解く (受入条件 2 が機械的に検出する)。
 */
(function (global) {
  "use strict";

  var COLS = 23, ROWS = 15;
  var TILE = 64;                       // ★assets/town_phlan.jpg を焼いた 1 マスの px

  /* ── 通行マスク ────────────────────────────────────────────────────────────
   *   `.` 歩ける / `~` 水 (運河・ムーンシー湖) / `B` 建物 (屋根・外壁・船体)
   *   `s` 露店・天幕・木箱の山 / `r` 瓦礫・足場 (西の再建現場) / `^` 岩・樹・植栽
   *
   *        0         1         2
   *        01234567890123456789012
   * ⚠ 運河は cols 12-13。渡れるのは **北橋 row 3** と **南橋 row 10** の 2 本だけ。
   * ⚠⚠ 南橋は絵が半マスずれている。画素で実測すると橋板は row 9 の下半分と row 10 の
   *     上半分にまたがる (水の割合 row9 = 26.7% / row10 = 28.3%)。依頼書の決定どおり
   *     **row 10 だけ**を歩けるようにする。⭐ スプライトの足元をタイル中心に置くので、
   *     体は row 10 の上半分 = 橋板の上に乗る (town.html の描画規則と対になっている)。
   */
  var MASK = [
    /* row  0 */ "Br.rr..rrBBB~~BBBs^.sBB",
    /* row  1 */ "Br.rrr.rrBBB~~BBBs^.sBB",
    /* row  2 */ "rr.rrr.rr..B~~..sss.sBB",   // (9,2)(10,2) = 鹿亭の張り出しデッキ / (14,2)(15,2) = 武器防具屋の店先
    /* row  3 */ "r...............ss..sBB",   // ★北橋 (12,3)(13,3)。東西を貫く目抜き通り
    /* row  4 */ "..rrrr.rr.r.~~.sss.ssBB",
    /* row  5 */ "rrrr...rr.r.~~.ss..ssBB",
    /* row  6 */ "..rrr..rr.r.~~.sss.ssBB",
    /* row  7 */ ".......rrrr.~~.sss.ssBB",
    /* row  8 */ ".BBBr.......~~.sss.ssBB",   // (1,8)-(3,9) = 半ば再建された石造りの家 (闇市の上)
    /* row  9 */ "^BBBr.rr.r..~~.....sss^",
    /* row 10 */ "^r..r..rr..........sss^",   // ★南橋 (12,10)(13,10) / (2,10)(3,10) = 闇市の石段
    /* row 11 */ "^..........^~~......^^^",   // 湖岸の遊歩道 (東西に抜ける第 2 の道)
    /* row 12 */ "^^..........~~~~...^^^^",   // 桟橋 (木の板)。★title から街へ入る時ここに立つ
    /* row 13 */ "^^~~.~BBBBBB~~BB..~~~~^",
    /* row 14 */ "^~~~~~BBBBB~~~BB~~~~~~^"
  ];

  /* 塞ぐ理由のラベル。⚠ 判定には使わない。目視補助 (tools/probe_town_mask.js) の色分け専用 */
  var LEGEND = {
    ".": { label: "歩ける",       color: "rgba(80,220,120,0.00)" },
    "~": { label: "水 (運河・湖)", color: "rgba(60,150,255,0.45)" },
    "B": { label: "建物・船体",   color: "rgba(255,80,80,0.45)"  },
    "s": { label: "露店・木箱",   color: "rgba(255,190,60,0.45)" },
    "r": { label: "瓦礫・足場",   color: "rgba(190,120,255,0.45)" },
    "^": { label: "岩・樹・植栽", color: "rgba(255,255,255,0.40)" }
  };

  function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
  function tileAt(c, r) { return inBounds(c, r) ? MASK[r].charAt(c) : "#"; }
  function isWalkable(c, r) { return tileAt(c, r) === "."; }

  /* ── 経路探索 (A*) ────────────────────────────────────────────────────────
   *  ⚠ index.html:16205 の aStar と **同じ形**にしてある: 4 近傍 / マンハッタン距離 /
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

  /* ── 施設 ─────────────────────────────────────────────────────────────────
   *  enter … そこまで歩いてから中へ入るタイル (看板クリックの行き先)
   *  sign  … 看板を浮かせるタイル (絵の上の位置。歩けなくてよい)
   *  desc  … 立て札の 2 行目 (「何ができる場所か」の一行)。⭐ 文言の**唯一の正はここ**。
   *           town.html には 1 文字も写さない (依頼書 #15 §5 B-1)。
   *  via   … tavern.html へ「どの扉から入ったか」を渡す値 (sessionStorage の 1 キー)
   *  ⛔ 遷移先にクエリを足さない。依頼書 #6 title-screen が名指しで禁じている。 */
  var FACILITIES = [
    { key: "tavern", icon: "🦌", name: "銀の鹿亭",   enter: [10, 2], sign: [10, 1], via: "tavern",
      desc: "宿と酒。仲間を募り、依頼を受ける" },
    { key: "shop",   icon: "🛡️", name: "武器防具屋", enter: [15, 2], sign: [15, 1], via: "shop",
      desc: "剣・鎧・弓。旅装を整える" },
    { key: "plaza",  icon: "🌑", name: "怪しい石段", enter: [3, 10], sign: [2, 10], via: "plaza",
      desc: "下りれば闇市。牙貨だけが物を言う",
      /* 闇市は通常クエスト 5 回クリアで常設化。⚠ 判定の出所は tavern.html と同じ
         localStorage["dragonfighters.plazaState"].unlocked ただ 1 つ (写しを作らない) */
      requiresPlazaUnlock: true }
  ];

  /* ── 立ち位置 ─────────────────────────────────────────────────────────────
   *  規則は 1 本: **町へ入るときは、直前に居た場所の前に立つ。**
   *  ⚠ 未知の値 / 欠損では必ず "tavern" の (10,3) へ落とす (fail-safe)。
   *  ⚠⚠ title からの出現は依頼書 §5 が (8,11) と書いていたが **(8,12) が正しい**。
   *     画素で実測すると row 11 は上半分が石畳・下半分が護岸の壁面で、
   *     木の板の桟橋そのものは **row 12**。依頼書は (8,11) を ⚠概測 とし
   *     「桟橋が実際に歩けることを確認してから確定」と指示していた。 */
  var SPAWNS = {
    title:   [8, 12],   // 船で街に着いたところ (桟橋の板の上)
    tavern:  [10, 3],   // 鹿亭のデッキの前
    shop:    [15, 3],   // 武器防具屋の店先の前
    plaza:   [3, 11],   // 闇市の石段の南の広場
    dungeon: [10, 3]    // index.html から帰還 = 依頼を受けた場所へ帰る
  };
  function spawnFor(via) {
    var s = (via && SPAWNS[via]) || SPAWNS.tavern;
    return { c: s[0], r: s[1] };
  }

  global.TOWN_MAP = {
    COLS: COLS, ROWS: ROWS, TILE: TILE,
    MASK: MASK, LEGEND: LEGEND,
    FACILITIES: FACILITIES, SPAWNS: SPAWNS,
    inBounds: inBounds, tileAt: tileAt, isWalkable: isWalkable,
    findPath: findPath, spawnFor: spawnFor
  };
})(typeof window !== "undefined" ? window : this);
