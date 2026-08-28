/*
 * js/abilities.js — D&D 5e 6 能力値の唯一の正 v1
 * ------------------------------------------------------------------
 * 実装依頼書 #28。
 *
 * ★ 何のためのデータか
 *   このゲームの「そのキャラが何者か」を決める 6 能力の生スコア(3〜18)。
 *   技能判定 (js/skill-check.js) はここだけを読む。
 *
 * ★ 出自: js/skill-check.js:41 CLASS_ABILITIES を **1 マスも変えずに** 移設したもの。
 *   移設であって改変ではない。値を動かすのは別チケット。
 *
 * ★ 共有モジュール / classic script。**5 ページ全部**が読む
 *   (index / tavern / town / world / title)。
 *   ⚠ skill-check.js は index / tavern しか読んでいない (2026-08-28 実測)。
 *      「skill-check があるから見える」は town/world/title で false。
 *
 * ★ 修正値は 5e 式 floor((score-10)/2)。B/X 式ではない。
 *   ⛔ 戦闘用の修正値 (index.html の CLASS_DEFS.str 等・0〜4) とは **まだ別物**。
 *      両者の統合は第 2 段 = 別チケット。ここで index.html を触らないこと。
 *
 * 公開API: window.DFAbilities
 *   - CLASS_ABILITIES / ABILITY_KEYS / ABILITY_ABBR / ABILITY_LABEL
 *   - abilityMod(score) -> number   (撤退スイッチに従って 5e / B/X を切り替える唯一の入口)
 *   - mod5e(score) / modBX(score)   (式そのもの。切り替えを通さない)
 *   - scoresFor(classKey) -> {str,dex,con,int,wis,cha} | null
 *   - use5e() -> boolean
 */
(function (global) {
  "use strict";

  // 撤退スイッチ: ?ability5e=0 で修正値だけ従来の B/X 式へ戻る。
  // ⚠ ページ単位で完結する (クエリは遷移をまたがない)。?heromark=0 と同じ作法。
  var USE_5E = true;
  try {
    USE_5E = new URLSearchParams(global.location.search).get("ability5e") !== "0";
  } catch (e) { USE_5E = true; }

  // === 職業固定の 6 能力スコア (生値 3〜18)。js/skill-check.js:41 からの移設 ===
  // ⛔ 36 マスの数値を 1 つも変えないこと。移設であって改変ではない。
  var CLASS_ABILITIES = {
    warrior: { str: 15, dex: 11, con: 14, int: 9,  wis: 10, cha: 11 },
    dwarf:   { str: 14, dex: 9,  con: 15, int: 10, wis: 13, cha: 9  },
    rogue:   { str: 10, dex: 15, con: 11, int: 13, wis: 12, cha: 12 },
    elf:     { str: 10, dex: 14, con: 10, int: 14, wis: 13, cha: 12 },
    cleric:  { str: 12, dex: 9,  con: 13, int: 11, wis: 15, cha: 13 },
    mage:    { str: 9,  dex: 11, con: 10, int: 15, wis: 13, cha: 11 },
  };

  var ABILITY_KEYS  = ["str", "dex", "con", "int", "wis", "cha"];
  var ABILITY_ABBR  = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
  var ABILITY_LABEL = {
    str: "筋力", dex: "敏捷力", con: "耐久力",
    int: "知力", wis: "判断力", cha: "魅力",
  };

  // 5e 式。Math.floor は負数でも下方向 (floor(-0.5) === -1) なので式のままでよい。
  function mod5e(score) { return Math.floor((score - 10) / 2); }

  // 旧 B/X 式 (撤退スイッチ専用。通常経路からは呼ばない)
  function modBX(score) {
    if (score <= 3)  return -3;
    if (score <= 5)  return -2;
    if (score <= 8)  return -1;
    if (score <= 12) return 0;
    if (score <= 15) return 1;
    if (score <= 17) return 2;
    return 3;
  }

  function abilityMod(score) {
    var s = (typeof score === "number" && isFinite(score)) ? score : 10;
    return USE_5E ? mod5e(s) : modBX(s);
  }

  function scoresFor(classKey) { return CLASS_ABILITIES[classKey] || null; }

  global.DFAbilities = {
    CLASS_ABILITIES: CLASS_ABILITIES,
    ABILITY_KEYS: ABILITY_KEYS,
    ABILITY_ABBR: ABILITY_ABBR,
    ABILITY_LABEL: ABILITY_LABEL,
    abilityMod: abilityMod,
    mod5e: mod5e,
    modBX: modBX,
    scoresFor: scoresFor,
    use5e: function () { return USE_5E; },
  };
})(typeof window !== "undefined" ? window : this);
