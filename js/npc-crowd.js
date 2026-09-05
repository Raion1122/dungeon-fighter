/*
 * js/npc-crowd.js — 酒場と街に立つ NPC の **配置データと不変条件** v1
 * ------------------------------------------------------------------
 * 実装依頼書 実装依頼書/2026-09-01_town-tavern-npc-crowd.md
 *
 * ★ 不変条件 (⛔ ここを破ると受入条件が赤くなる。破りたくなったら依頼書 §2-3/§2-5 を読む)
 *   (I1) stand の tile は **歩けないタイル** でなければならない (マスクを 1 文字も変えないため)
 *   (I2) stand の tile は マンハッタン距離 2 以内に歩けるマスを持つ (家具に埋まらないため)
 *   (I3) dx / dy は ±TILE/2 まで (隣のタイル中心を越えない)
 *   (I4) stroll の経路上の全マスが歩ける
 *   (I5) stand / stroll の **どのマスのスプライト矩形も、どの札の矩形とも交差しない**
 *        ⚠⚠⚠ 既存 golden 4 本が「札の中心の elementFromPoint が自分自身」を測っている。
 *             さらに 街の札は 242px = 3.8 タイル幅。端点だけ見ると巡回で取りこぼす。
 *
 * ★ スプライトは **右向き 1 行 6 コマしか無い** (576x384 の 33 枚すべて実測済)。
 *   静止コマも上下向きも存在しない。左は scaleX(-1)。⛔ 正面向きの設計を足さないこと。
 *
 * ★ sprite: は 2026-09-02 の STEP4 で **町人 12 種へ差し替え済** (このファイルの sprite: だけを
 *   14 箇所書き換え、他は 1 行も変えていない)。内訳 = codex1 へ新規発注した 6 種
 *   (town_keeper / town_stall / town_fisher / town_mason / town_guard / town_commoner) と、
 *   2026-07-17 に納品済みだが台帳に載らず眠っていた 6 種 (villager_man / _woman / _boy /
 *   _girl / _oldman / _oldwoman)。⭐ **街からは冒険者が 1 人も居なくなった**。
 *   酒場の客 4 人 (patronA-D) と drunk だけは「客が冒険者なのは正しい」ので据え置き。
 *   ⚠ 同じ画面内で同じシートを 2 人に当てていない (酒場 8 / 街 11 とも全員別人)。
 *   ⛔ index.html の SPRITE_VARIANTS / tavern.html の PARTY_PORTRAIT_SPRITES へ写しを作らない。
 */
(function (global) {
  "use strict";

  var SPRITE = 96;      /* 歩行シートのセル。⚠ tavern.html / town.html と同じ値 */
  var FOOT   = 0.93;    /* 接地比。⚠ 同上。⛔ ここで独自の値にしない */

  /* face: "right" | "left"  … 右向きシートを scaleX(-1) するかどうか
     hold: 立ち止まりに使うコマ番号 (0..5)。⚠ 静止コマは無いので歩行の 1 コマを止める
     say : クリックしたときの一言 (プレーンテキスト。⛔ HTML を入れない) */
  var TAVERN = [
    { key: "keeper",  kind: "stand", tile: [11, 1], dx:   0, dy:  18, face: "left",
      sprite: "assets/town_keeper_walk.png", hold: 0,
      say: "いらっしゃい。奥の卓が空いてるよ。" },
    { key: "patronA", kind: "stand", tile: [ 3, 3], dx: -14, dy:  -6, face: "right",
      sprite: "assets/dwarf_warrior_walk.png", hold: 2,
      say: "廃坑か……。俺は二度と潜らんぞ。" },
    { key: "patronB", kind: "stand", tile: [ 4, 3], dx:  14, dy:   6, face: "left",
      sprite: "assets/rogue_male_walk.png", hold: 4,
      say: "宝は先に見つけた者のものだ。異論は?" },
    { key: "patronC", kind: "stand", tile: [ 9, 5], dx: -14, dy:  -6, face: "right",
      sprite: "assets/cleric_npcmale_walk.png", hold: 1,
      say: "無事の帰還を祈っておこう。" },
    { key: "patronD", kind: "stand", tile: [10, 5], dx:  14, dy:   6, face: "left",
      sprite: "assets/elf_male_walk.png", hold: 3,
      say: "次の潜りは、腕の立つ連れが要るな。" },
    { key: "drunk",   kind: "stand", tile: [ 1, 5], dx:  16, dy:   0, face: "right",
      sprite: "assets/warrior_npcfemale_walk.png", hold: 5,
      say: "……もう一杯だけ。もう一杯だけだ。" },
    { key: "porter",  kind: "stand", tile: [11, 8], dx:   0, dy: -14, face: "left",
      sprite: "assets/villager_man_walk.png", hold: 0,
      say: "この樽、どけておいてくれると助かるんだがね。" },
    /* ⚠ 巡回。経路は (7,3)..(7,6) の 4 マス。⛔ 列 8 にすると (8,3) が席札と交差する (依頼書 §2-3) */
    { key: "server",  kind: "stroll", from: [7, 3], to: [7, 6], face: "right",
      sprite: "assets/villager_woman_walk.png",
      say: "お待たせしました、エールをどうぞ。" }
  ];

  var TOWN = [
    { key: "stallA",   kind: "stand", tile: [16, 3], dx:   0, dy:  10, face: "right",
      sprite: "assets/town_stall_walk.png", hold: 0, say: "干し魚だよ、干し魚。安いよ。" },
    { key: "stallB",   kind: "stand", tile: [19, 6], dx: -10, dy:   0, face: "left",
      sprite: "assets/villager_oldman_walk.png", hold: 2, say: "その値では買えん。半分にしろ。" },
    { key: "stallC",   kind: "stand", tile: [17, 8], dx:   0, dy:  10, face: "right",
      sprite: "assets/town_commoner_walk.png", hold: 4, say: "薬草だ。傷にも腹にも効く。" },
    { key: "customer", kind: "stand", tile: [15, 5], dx:  12, dy:   0, face: "left",
      sprite: "assets/villager_oldwoman_walk.png", hold: 1, say: "麦の値がまた上がった……。" },
    { key: "mason",    kind: "stand", tile: [ 4, 4], dx:   0, dy:   8, face: "right",
      sprite: "assets/town_mason_walk.png", hold: 3, say: "この壁を積み直すのに、あと半年だな。" },
    { key: "carpenter",kind: "stand", tile: [ 8, 7], dx: -10, dy:   0, face: "left",
      sprite: "assets/villager_man_walk.png", hold: 5, say: "足場に近づくな。落ちても知らんぞ。" },
    { key: "fisher",   kind: "stand", tile: [ 7,13], dx:   0, dy: -20, face: "right",
      sprite: "assets/town_fisher_walk.png", hold: 0, say: "湖の魚が減った。何かが居るのさ。" },
    { key: "dockhand", kind: "stand", tile: [15,13], dx:   0, dy: -20, face: "left",
      sprite: "assets/villager_boy_walk.png", hold: 2, say: "北からの荷はまだ来ん。橋がな。" },
    /* 巡回 3 本。⭐ strollA は北橋 (12,3)(13,3) を渡る = 街が生きて見える一番の絵
       ⚠⚠⚠ (I6) 経路は **既存 golden が固定座標で押す 7 タイルの中心を覆ってはならない**。
         #41 項目 3 で吹き出しに ev.stopPropagation() を足した瞬間、NPC が「タップを食う板」に
         なった。tools/verify_town_map.js は (6,3)(11,3)(15,3)(15,10)(8,12)(12,6)(3,10) を
         **タイル中心の実座標で押す**ので、そこに巡回が立つと (4-…) が間欠的に赤くなる。
         2026-09-02 実測 = strollA が (15,3) を 38% / (11,3) を 15%、strollB が (15,10) を 8% の
         時間だけ覆っていた (12 秒 x 100ms 標本)。
       ⭐ 直したのは **経路の端点だけ**。strollA は北橋 (12,3)(13,3) を渡る絵を保っている。
         ⛔ 受入条件の期待値も golden の押し口も 1 つも触っていない。
       ⚠ スプライトは足元タイルより **左右 ±48px はみ出す** (SPRITE 96 > 街の TILE 64) ので、
         「隣の列に居れば安全」ではない。列 11 を避けるには **列 12 から**始める必要がある
         (col 11 の中心 x=736 に対し col 12 のスプライトは x=752 から)。
       → (1f) が毎回この 7 点を機械的に測る。動かしたくなったら先に (1f) を読むこと。 */
    { key: "strollA", kind: "stroll", from: [12, 3], to: [14, 3], face: "right",
      sprite: "assets/town_guard_walk.png", say: "橋の向こうは市場だよ。" },
    { key: "strollB", kind: "stroll", from: [16,11], to: [19,11], face: "right",
      sprite: "assets/villager_girl_walk.png", say: "湖岸は風が気持ちいいね。" },
    { key: "strollC", kind: "stroll", from: [18, 4], to: [18, 9], face: "right",
      sprite: "assets/villager_woman_walk.png", say: "……見ない顔だな。" }
  ];

  /* ── 不変条件の検査 (⭐ ドライバはこれを **呼ぶ**。自前で書き直さないこと) ─────────
   *  map  … TAVERN_MAP か TOWN_MAP (isWalkable / inBounds / TILE を持つもの)
   *  signs… [{ key, cx, cy, w, h }] を **実 DOM から測って**渡す
   *          ⛔ 定数表を渡さない。札の幅は画面幅で変わる (酒場 128 → 55)。
   *  戻り値 … { ok, problems: [{ key, why, detail }] }  ⚠ 例外を投げない (握り潰しでもない)
   */
  function cellsOf(n) {
    if (n.kind === "stroll") {
      var a = n.from, b = n.to, out = [], x, y;
      if (a[0] === b[0]) { for (y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) out.push([a[0], y]); }
      else               { for (x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) out.push([x, a[1]]); }
      return out;
    }
    return [n.tile];
  }
  function boxOf(c, r, TILE, dx, dy) {
    var cx = c * TILE + TILE / 2 + (dx || 0), cy = r * TILE + TILE / 2 + (dy || 0);
    return { l: cx - SPRITE / 2, t: cy - SPRITE * FOOT, r: cx + SPRITE / 2, b: cy + SPRITE * (1 - FOOT) };
  }
  function hitSign(a, s) {
    var l = s.cx - s.w / 2, t = s.cy - s.h / 2, r = s.cx + s.w / 2, b = s.cy + s.h / 2;
    return !(a.r <= l || r <= a.l || a.b <= t || b <= a.t);
  }
  function validate(list, map, signs) {
    var probs = [];
    (list || []).forEach(function (n) {
      var T = map.TILE;
      if (n.kind === "stand") {
        var c = n.tile[0], r = n.tile[1];
        if (map.isWalkable(c, r)) probs.push({ key: n.key, why: "I1", detail: "歩けるタイルに立っている" });
        var vis = false, dc, dr;
        for (dc = -2; dc <= 2 && !vis; dc++) for (dr = -2; dr <= 2; dr++) {
          if (Math.abs(dc) + Math.abs(dr) > 2 || (!dc && !dr)) continue;
          if (map.inBounds(c + dc, r + dr) && map.isWalkable(c + dc, r + dr)) { vis = true; break; }
        }
        if (!vis) probs.push({ key: n.key, why: "I2", detail: "2 マス以内に歩けるマスが無い" });
        if (Math.abs(n.dx || 0) > T / 2 || Math.abs(n.dy || 0) > T / 2)
          probs.push({ key: n.key, why: "I3", detail: "dx/dy が ±TILE/2 を超えている" });
      } else {
        cellsOf(n).forEach(function (p) {
          if (!map.isWalkable(p[0], p[1]))
            probs.push({ key: n.key, why: "I4", detail: "経路上 (" + p + ") が歩けない" });
        });
      }
      cellsOf(n).forEach(function (p) {
        var bx = boxOf(p[0], p[1], map.TILE, n.dx, n.dy);
        (signs || []).forEach(function (s) {
          if (hitSign(bx, s)) probs.push({ key: n.key, why: "I5",
            detail: "(" + p + ") が札 " + s.key + " と交差" });
        });
      });
    });
    return { ok: probs.length === 0, problems: probs };
  }

  global.NPC_CROWD = {
    SPRITE: SPRITE, FOOT: FOOT,
    TAVERN: TAVERN, TOWN: TOWN,
    cellsOf: cellsOf, boxOf: boxOf, validate: validate
  };
})(typeof window !== "undefined" ? window : this);
