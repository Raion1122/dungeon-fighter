/**
 * js/plaza-hours.js — 闇市ポドルプラザが開いている時間の唯一の正 (#102)。
 *   20:00〜24:59 (端末のローカル時刻) だけ開く。判定は「入る瞬間」だけ (中に居る間は追い出さない)。
 *   tavern.html / town.html / index.html の 3 ページが読む。⛔ 時刻の数字を各ページへ写さない。
 *
 * 時刻の上書き (検証・dev 用): ?plazaclock=<0-23> → sessionStorage へ写す (ページ遷移をまたぐ)。
 *   ?plazaclock=real で消す。⚠ 端末の時計を変えれば同じことができるので、チートの口として塞がない。
 * 撤退: ?plazanight=0 → sessionStorage へ写す (#101 までの「変装の門番」へ戻る)。?plazanight=1 で消す。
 *   ⚠ 港町 → 酒場 → 冒険 (index) をまたいで効かせるため、?town=0 と同じ sessionStorage の作法。
 */
(function (global) {
  "use strict";
  var OPEN_HOUR = 20, CLOSE_HOUR = 1;          // [20:00, 25:00)
  var CLOCK_KEY = "dragonfighters.plazaClock";
  var OFF_KEY = "dragonfighters.plazaNightOff";
  try {
    var q = new URLSearchParams(location.search);
    var c = q.get("plazaclock");
    if (c === "real") sessionStorage.removeItem(CLOCK_KEY);
    else if (c !== null && /^\d{1,2}$/.test(c) && Number(c) < 24) sessionStorage.setItem(CLOCK_KEY, String(Number(c)));
    var n = q.get("plazanight");
    if (n === "0") sessionStorage.setItem(OFF_KEY, "1");
    else if (n === "1") sessionStorage.removeItem(OFF_KEY);
  } catch (e) {}
  function on() {
    try { return sessionStorage.getItem(OFF_KEY) !== "1"; } catch (e) { return true; }
  }
  function hourNow() {
    try {
      var v = sessionStorage.getItem(CLOCK_KEY);
      if (v !== null && /^\d{1,2}$/.test(v)) return Number(v);
    } catch (e) {}
    return new Date().getHours();
  }
  function isOpenAt(h) { return h >= OPEN_HOUR || h < CLOSE_HOUR; }
  global.PLAZA_HOURS = {
    OPEN_HOUR: OPEN_HOUR, CLOSE_HOUR: CLOSE_HOUR, TICK_MS: 30000,
    on: on,                    // false = 撤退中 (時刻の関門なし・変装の門番)
    hourNow: hourNow,
    isOpenAt: isOpenAt,
    /** 時刻の関門を通れるか。⚠ 撤退中は常に true (= 旧来どおり時刻を見ない) */
    isOpen: function () { return !on() || isOpenAt(hourNow()); }
  };
})(window);
