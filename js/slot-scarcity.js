/**
 * js/slot-scarcity.js — A1「呪文スロット希少性」の撤退スイッチの唯一の正。
 *   既定 = ON (毎勝利 25% 自動補充を止める希少性ルール。実際に補充を止めるのは
 *   index.html の SLOT_SCARCITY_ON がこの on() を読んで判断する)。
 *
 *   撤退スイッチ ?slotscarcity=0 → sessionStorage へ写す (ページ遷移をまたいで効かせる)。
 *     ?slotscarcity=1 で消す (既定の希少性 ON へ戻す)。
 *   ⚠ 酒場 (tavern) → 世界地図 (world) → ダンジョン (index) をまたいでも効かせるため、
 *      ?plazanight=0 / ?town=0 と同じ sessionStorage の作法 (URL に 1 度でも現れたら保存し、
 *      以降の各ページは sessionStorage を読む)。URL のクエリは遷移で消えるが session は残る。
 *   ⚠ どのページでも例外を投げない (localStorage/sessionStorage が塞がれた環境でも既定 ON へ退避)。
 */
(function (global) {
  "use strict";
  var OFF_KEY = "dragonfighters.slotScarcityOff";
  try {
    var v = new URLSearchParams(global.location.search).get("slotscarcity");
    if (v === "0") sessionStorage.setItem(OFF_KEY, "1");
    else if (v === "1") sessionStorage.removeItem(OFF_KEY);
  } catch (e) {}
  /** 希少性ルールが有効か。false = 撤退中 (従来どおり毎勝利 25% 補充へ戻す)。 */
  function on() {
    try { return sessionStorage.getItem(OFF_KEY) !== "1"; }
    catch (e) { return true; }
  }
  global.SLOT_SCARCITY = { OFF_KEY: OFF_KEY, on: on };
})(window);
