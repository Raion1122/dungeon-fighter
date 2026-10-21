/*
 * js/plaza-map.js — 闇市ポドルプラザの地下街 **データと経路探索** v1
 * ------------------------------------------------------------------
 * 実装依頼書 `実装依頼書/2026-10-21_plaza-undercity-map.md` (#98) §4-2。
 * 形と作法は js/town-map.js (港町フラン) にそろえてある。
 *
 * ★ 何のためのデータか
 *   tavern.html の闇市の画面が「どこを歩けるか」「露店・掲示板・出口がどこにあるか」
 *   「地下街に入ったときどこに立つか」「どの品がどの露店に並ぶか」を決める唯一の出所。
 *   ⚠ **tavern.html 側に写しを作らないこと** (js/town-map.js・js/tavern-map.js と同じ作法)。
 *
 * ★ 共有モジュール / クラシックスクリプト (ES module ではない)
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      よって公開データは末尾で **明示的に window へ代入**している。
 *
 * ★ 座標系
 *   assets/plaza_undercity.jpg は **23 x 15 マス / 1 マス 64px** (1472x960) で焼いてある。
 *   焼き込みグリッドの実測値と焼き直しの手順は tools/make_grid_map.py の GRIDS["plaza-undercity"]。
 *   ⚠ 素材を差し替えたら **マスクも作り直す**。マスクは絵に貼り付いたデータであって設定ではない。
 *   目視の道具 = tools/probe_plaza_mask.js (本番の絵に本番のマスクを重ねて PNG に出す)。
 *
 * ★ なぜ記号が `.` と `#` の 2 種類ではないのか (js/town-map.js と同じ理由)
 *   **歩けない理由を 1 語でまとめない**。壁 / 階段 / 扉 / 露店 / 木箱 / 水路 / 対岸を
 *   別の文字にしておくと、probe の色分けで「どこを読み違えたか」が一目で分かる。
 *   `.` = 歩ける。**`.` 以外はすべて塞ぐ**。
 *   ⚠ 「塞ぐ理由」を判定に使わないこと。通行可否は isWalkable() ただ 1 本。
 *
 * ★ 作法 (js/town-map.js と同じ。出所は index.html の ROOM_PAINTINGS_DEF のコメント)
 *   ① 地面に平置きの物 (敷物・魔法陣・排水の格子・小石) は塞がない。
 *   ② 塞ぐのは樽・木箱・天幕・柵・燭台・卓のような「立っている物」だけ。
 *   ③ 迷ったら塞がない。ただし **孤立の禁止** が対になる (歩けるのに届かないマスは 0 件)。
 *
 * ★ 経路探索は **4 近傍** (js/town-map.js と同じ形 = index.html の aStar と同じ)
 *   ⚠ マスク側で「斜めにしか抜けられない隘路」を作らない。
 *   ⚠⚠ 検証ドライバはこの関数を **ブラウザで呼ぶ**こと (自前で BFS を書かない)。
 *
 * ★ 品と露店 (依頼書 §2-4 罠 C)
 *   どの品がどの露店に並ぶかは **STALLS[].items (品の id の列) だけ**に持つ。
 *   ⛔ 品の表 (index.html の PLAZA_ITEMS / tavern.html の _TV の写し) に stall 欄を足さない
 *      (verify_plaza_srd (0b) が定義を丸ごと突き合わせている)。
 *   ⛔ ここに品の名前・値段を写さない。持つのは id だけ。
 *   ⭐ 品を足したら、ちょうど 1 つの露店の items に足すこと (verify_plaza_map (2a) が見張る)。
 */
(function (global) {
  "use strict";

  var COLS = 23, ROWS = 15;
  var TILE = 64;                       // ★assets/plaza_undercity.jpg = GRIDS["plaza-undercity"] の 1 マスの px

  /* ── 通行マスク ────────────────────────────────────────────────────────────
   *   `.` 歩ける / `W` 石壁・柱・柵の内側 / `S` 階段 / `D` 扉 / `s` 露店・天幕
   *   `c` 木箱・樽・燭台・卓 / `~` 地下水路 / `x` 対岸の通路 (橋の柱で塞がれて渡れない)
   *
   *        0         1         2
   *        01234567890123456789012
   */
  var MASK = [
    /* row  0 */ "WSDWWWWWWWWWWWWWWWWWWWW",   // (1,0)-(1,2) 酒場への木の階段 / (2,0) 扉
    /* row  1 */ "WS.cc.....cWWWc...cW~xW",   // (2,1) = 扉の前 / (11,1)-(13,1) 北の壁の掲示板 / (7,1)-(9,1) 樽と木箱は壁ぎわの上半分だけ = 歩ける
    /* row  2 */ "WS....sssss..ssss..W~xW",   // 薬屋 (6-10) / 杖屋 (13-16)
    /* row  3 */ "Wc....sssss..ssss..W~xW",
    /* row  4 */ "WWW...sssss.cssss..W~xW",   // (0-2,4) 張り出しの北の石垣 / (12,4) 杖屋の左の木箱
    /* row  5 */ "W.Wc..ss.s...s..s..W~xW",   // (1,5) 張り出しの床 / (2,5) 柵 / (8,5) 薬屋の敷物の前 / (14,5)(15,5) 杖屋の敷物 = 平置きなので歩ける
    /* row  6 */ "W..................W~xW",   // (1,6)(2,6) 張り出しの床。柵の切れ目 (2,6) から入れる
    /* row  7 */ "WcW...................W",   // (19,7)-(21,7) 東の小橋 (行き止まりの眺め)
    /* row  8 */ "Wcc...ssss...ssss..W~xW",   // 召喚屋 (6-9/6-10) / 古物商 (13-16)
    /* row  9 */ "Wc....sssss..ssss..W~xW",   // (2,9) 石段の上の踊り場
    /* row 10 */ "W..Wc.sssss..ssss..W~xW",   // (1,10)(2,10) 港町への石段の最上段 / (10,9)-(10,11) 召喚屋の右の鎧
    /* row 11 */ "WSSWc.sssss..ssss..W~xW",
    /* row 12 */ "WSSWcc............cW~xW",
    /* row 13 */ "WSSWcc............cW~xW",
    /* row 14 */ "WWWWWWWWWWWWWWWWWWWWWWW"
  ];

  /* 塞ぐ理由のラベル。⚠ 判定には使わない。目視補助 (tools/probe_plaza_mask.js) の色分け専用 */
  var LEGEND = {
    ".": { label: "歩ける",             color: "rgba(80,220,120,0.00)" },
    "W": { label: "石壁・柱・柵",       color: "rgba(255,80,80,0.45)"  },
    "S": { label: "階段",               color: "rgba(190,120,255,0.45)" },
    "D": { label: "扉",                 color: "rgba(255,120,200,0.50)" },
    "s": { label: "露店・天幕",         color: "rgba(255,190,60,0.45)" },
    "c": { label: "木箱・樽・燭台・卓", color: "rgba(255,255,255,0.40)" },
    "~": { label: "地下水路",           color: "rgba(60,150,255,0.45)" },
    "x": { label: "対岸の通路",         color: "rgba(40,40,40,0.55)"   }
  };

  function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
  function tileAt(c, r) { return inBounds(c, r) ? MASK[r].charAt(c) : "#"; }
  function isWalkable(c, r) { return tileAt(c, r) === "."; }

  /* ── 経路探索 (A*) ────────────────────────────────────────────────────────
   *  ⚠ js/town-map.js の findPath と **同じ形**: 4 近傍 / マンハッタン距離 /
   *    戻り値は「始点を含まない」タイル列。到達できないときは null。 */
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

  /* ── 露店 ─────────────────────────────────────────────────────────────────
   *  enter … そこまで歩いてから品の板を開くタイル (札クリックの行き先)。⚠ `.` であること
   *  sign  … 札を浮かせるタイル (天幕の上でよい)
   *  desc  … 札の 2 行目。⭐ 文言の**唯一の正はここ**。tavern.html に写さない
   *  items … この露店に並ぶ品の id (罠 C)。⛔ 名前・値段は写さない
   *  ⚠ 札どうしは重ねない。札の幅 240px 前後 ⇒ 同じ行なら 3.75 タイル以上あける
   *    (js/town-map.js の「町の外へ」のコメントの実測)。 */
  var STALLS = [
    { key: "potion", name: "薬屋",   enter: [8, 6],  sign: [8, 3],
      desc: "薬瓶と油。煮え立つ釜の匂い",
      items: ["potion_healing", "potion_greater_healing", "potion_fire_resistance", "potion_invisibility",
              "oil_of_sharpness", "potion_shadow"] },
    { key: "wand",   name: "杖屋",   enter: [14, 6], sign: [15, 3],
      desc: "杖と真珠。蝋燭の下の秘蔵品",
      items: ["wand_polymorph", "wand_magic_missiles", "pearl_of_power"] },
    { key: "summon", name: "召喚屋", enter: [8, 12], sign: [8, 9],
      desc: "巻物と骨。魔法陣の上の取引",
      items: ["scroll_create_golem", "scroll_animate_dead"] },
    { key: "curio",  name: "古物商", enter: [14, 12], sign: [14, 9],
      desc: "曰く付きの品。出所は聞くな",
      items: ["ring_spell_turning", "dust_sneezing_choking", "fang_charm", "cursed_blade", "medusa_mirror"] }
  ];

  /* ── 掲示板 (闇クエスト) ── */
  var BOARD = { key: "board", name: "闇クエスト掲示板", enter: [12, 2], sign: [12, 1],
                desc: "表に出せない依頼が貼られる" };

  /* ── 出口 ─────────────────────────────────────────────────────────────────
   *  ⭐ town だけ to を持つ。to があるものはページを移る (exitVia = "plaza" を書いてから)。
   *  ⛔ enterVia を書かない (酒場が消費する一回性キー)。⛔ 遷移先にクエリを足さない。
   *  ⚠ ?town=0 (window.__townOff) では town の札を DOM に作らない (tavern.html 側の責務)。 */
  var EXITS = [
    { key: "tavern", name: "銀の鹿亭へ",   enter: [2, 1],  sign: [3, 2],
      desc: "木の階段を上って酒場へ戻る" },
    { key: "town",   name: "港町への石段", enter: [2, 10], sign: [2, 12],
      desc: "石段を上れば港町フランの広場", to: "town.html" }
  ];

  /* ── 立ち位置 ─────────────────────────────────────────────────────────────
   *  規則は js/town-map.js と 1 本: **入るときは、直前に居た場所の前に立つ。**
   *  ⚠ 未知の値 / 欠損では必ず "tavern" へ落とす (fail-safe)。 */
  var SPAWNS = {
    tavern: [2, 2],     // 酒場からの扉の前
    town:   [2, 9]      // 港町からの石段を下りきった踊り場
  };
  function spawnFor(via) {
    var s = (via && SPAWNS[via]) || SPAWNS.tavern;
    return { c: s[0], r: s[1] };
  }

  /* 品の id → 露店の key。どの露店にも無ければ null。 */
  function stallOf(itemId) {
    for (var i = 0; i < STALLS.length; i++) {
      if (STALLS[i].items.indexOf(itemId) >= 0) return STALLS[i].key;
    }
    return null;
  }

  global.PLAZA_MAP = {
    COLS: COLS, ROWS: ROWS, TILE: TILE,
    MASK: MASK, LEGEND: LEGEND,
    STALLS: STALLS, BOARD: BOARD, EXITS: EXITS, SPAWNS: SPAWNS,
    inBounds: inBounds, tileAt: tileAt, isWalkable: isWalkable,
    findPath: findPath, spawnFor: spawnFor, stallOf: stallOf
  };
})(typeof window !== "undefined" ? window : this);
