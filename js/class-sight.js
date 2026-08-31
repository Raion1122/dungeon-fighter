/*
 * js/class-sight.js — 職業ごとの視界の唯一の正 (実装依頼書 #39) v1
 * ------------------------------------------------------------------
 * ★ なぜこのファイルがあるのか
 *   視界 (CLASS_SIGHT) は index.html の中だけにあり、フォグオブウォーの濃さと
 *   敵の可視判定を毎フレーム決めている。ところが **プレイヤーには 1 文字も出ていなかった**。
 *   名乗り・傭兵名簿・マッチング画面・キャラシートの 4 箇所へ出すために、
 *   4 ページから読める場所へ「唯一の正」を移す。
 *
 * ⛔ 数値をここから **写さない**。js/hero-classes.js のヘッダが禁じているのは「写し」であって
 *   「移設」ではない。写しを作った瞬間、片方だけ古くなって嘘の数字がプレイヤーに出る。
 *   → tools/verify_darkvision.js の負のコントロール `shadowsight` が機械検査する。
 *
 * ⚠ index.html は今までどおり自分の const CLASS_SIGHT / CLASS_SIGHT_LEGACY / getSight を持つ。
 *   既存ドライバ 3 本 (driver_grid_p5 / driver_speech_boss / driver_wall_face) が
 *   **裸の識別子**でそれを読んでいるため。ここは「基の表」を供給するだけ。
 *
 * ⚠ classic script 直下の let/const/function は window に載らない。公開は末尾の global 代入だけ。
 */
(function (global) {
  "use strict";

  /* 1 タイル = 5 ft。⭐ 出所 = index.html の CLASS_SIGHT 注記
   *   「松明の明域 20ft + 薄暮域 20ft = 40ft」= 8 タイル / 「暗視 60ft」= 12 タイル。
   * ⚠ TILE_SIZE (96px) とは無関係。あれは画面の px。 */
  var FT_PER_TILE = 5;

  /* tiles = 視界半径 (タイル) / inner・outer = 放射光半径 (px, drawLight 用)
   * term  = プレイヤーに見せる語。⚠ elf を「暗視」と書かないこと —— 本作のエルフは
   *         10 タイル (50ft) で、5.1 SRD の Elf (Darkvision 60ft) とは違う。 */
  var BASE = {
    mage:    { tiles: 8,  inner: 300, outer: 660, term: "松明の灯り" },
    warrior: { tiles: 8,  inner: 300, outer: 660, term: "松明の灯り" },
    cleric:  { tiles: 8,  inner: 300, outer: 660, term: "松明の灯り" },
    rogue:   { tiles: 8,  inner: 300, outer: 660, term: "松明の灯り" },
    elf:     { tiles: 10, inner: 375, outer: 825, term: "低光視力" },
    dwarf:   { tiles: 12, inner: 450, outer: 990, term: "暗視" },
  };

  /* ★退避スイッチ ?dndrange=0 の旧値。⚠ 必ず一緒に持つこと ——
   *   driver_speech_boss (warriorSight===4) と driver_wall_face (pinOuter===330) は
   *   この旧値を期待して走っている。 */
  var LEGACY = {
    mage:    [3, 120, 260], warrior: [4, 150, 330], cleric: [4, 150, 330],
    rogue:   [4, 150, 330], elf:     [5, 180, 400], dwarf:  [6, 210, 470],
  };

  function sightOf(classKey) { return BASE[classKey] || BASE.warrior; }
  function feetOf(classKey)  { return sightOf(classKey).tiles * FT_PER_TILE; }

  /* 表示文字列の唯一の正。⛔ 4 箇所の画面がそれぞれ組み立てないこと。
   *   short=true … 狭い器 (マッチングカード / 名簿の 1 行) 用 */
  function sightLabel(classKey, short) {
    var s = sightOf(classKey);
    if (short) return "視界 " + s.tiles;
    return "視界 " + s.tiles + " マス (" + feetOf(classKey) + " ft)・" + s.term;
  }

  global.DFSight = {
    FT_PER_TILE: FT_PER_TILE, BASE: BASE, LEGACY: LEGACY,
    sightOf: sightOf, feetOf: feetOf, sightLabel: sightLabel,
    /* ★撤退スイッチ ?darkvision=0 — 表示だけを #39 以前へ戻す。
     * ⚠ 判定はページごとに独立 (?chronicle=0 / ?slots=0 と同じ方式)。遷移はまたがない。
     * ⚠ index.html の視界の値には **一切効かない** (表示の撤退であって挙動の撤退ではない)。 */
    enabled: function () {
      try { return !/[?&]darkvision=0(&|$)/.test(global.location.search); }
      catch (e) { return true; }
    },
  };
})(typeof window !== "undefined" ? window : this);
