/* ============================================================================
 * js/ui-feel.js — UI の重厚感 Phase3 D(動きと音)
 *   「卓に広げた写本」の手触りを、画面遷移の動きと音で補う。純粋な追加レイヤ。
 *
 *   - 動き: 画面に入るたび、羊皮紙色の幕がふわりと左へめくれて退き、画面が現れる
 *           (= どの画面も「ページをめくって開いた」感触)。
 *   - 音  : 遷移を起こす操作(ページ内リンク / data-ui-turn を付けた操作)で、
 *           柔らかな羊皮紙のめくり音を鳴らす(audio.js の合成音 "pageTurn" 経由)。
 *
 *   方針:
 *   - 音は必ず GameAudio 経由 = 既存の効果音バス(ミュート/音量/ナレ中ダッキング)に従う。
 *     新しい音源ファイルは足さない(全て合成・容量ゼロ・BGM/既存SFXと競合しない)。
 *   - 動きは控えめ・短く。prefers-reduced-motion の環境では幕(動き)を出さない。
 *   - ?uifeel=0 で丸ごと無効(動き・音とも停止)。
 *   - 既存のレイアウト・z-index・機能には触れない。幕は pointer-events:none で
 *     操作を一切ブロックせず、~0.9s で自ら DOM から消える。
 * ========================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;
  if (!doc) return;

  // ===== OFF スイッチ(?uifeel=0 で全無効) ==================================
  var OFF = false;
  try { OFF = new global.URLSearchParams(global.location.search).get("uifeel") === "0"; } catch (e) {}
  if (OFF) { global.UIFeel = { off: true, turn: function () {}, reveal: function () {} }; return; }

  // 動きを控える設定(OS/ブラウザ)。真なら幕(動き)は出さず、音だけ残す。
  var reduceMotion = false;
  try { reduceMotion = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}

  // ===== 音: 羊皮紙のめくり音 ===============================================
  function turnSound() {
    try {
      if (global.GameAudio && GameAudio.playSfx) {
        if (GameAudio.unlock) GameAudio.unlock();   // iOS: 操作中に AudioContext を解錠
        GameAudio.playSfx("pageTurn");               // 無ければ audio.js 側で no-op
      }
    } catch (e) {}
  }

  // 遷移を起こす操作か?(同一ページ内リンク or 明示 opt-in の data-ui-turn)
  function isTurnTarget(el) {
    if (!el || !el.closest) return false;
    try {
      return !!el.closest(
        'a[href]:not([href^="#"]):not([href^="http"]):not([href^="mailto"]):not([target="_blank"]),'
        + '[data-ui-turn]'
      );
    } catch (e) { return false; }
  }
  // pointerdown=押した瞬間に鳴らす(遷移が走る前に発音を始める)。capture でページ側の
  // stopPropagation に先んじる。遷移しない操作(タブ切替等)には付けないので誤発音しない。
  doc.addEventListener("pointerdown", function (e) {
    try { if (isTurnTarget(e.target)) turnSound(); } catch (err) {}
  }, true);

  // ===== 動き: 到着時の「羊皮紙めくり」(幕が左へ退いて画面が現れる) =========
  function playReveal() {
    if (reduceMotion || !doc.body) return;
    var sheet = doc.createElement("div");
    sheet.setAttribute("aria-hidden", "true");
    sheet.className = "uiFeelTurn";
    sheet.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483000", "pointer-events:none",
      // 羊皮紙色。左上から光が差し、左へめくれて退く見立て。
      "background:linear-gradient(104deg,#e3c98c 0%,#efe2bd 46%,#e7d19a 100%)",
      "opacity:1", "transform-origin:left center",
      "will-change:opacity,transform",
      "transition:opacity .4s ease-out, transform .4s ease-out"
    ].join(";") + ";";
    doc.body.appendChild(sheet);
    // 2 フレーム後に退かせる(初期スタイルを確実に適用してから遷移を起こす)。
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        sheet.style.opacity = "0";
        sheet.style.transform = "translateX(-7%) skewX(-3deg)";
      });
    });
    var done = function () { if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet); };
    sheet.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 900);   // 保険: transitionend 取りこぼし時も必ず撤去
  }

  function start() { try { playReveal(); } catch (e) {} }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  // 任意の操作から呼べる薄い公開口(将来の opt-in 用。既存コードは変更不要)。
  global.UIFeel = { off: false, turn: turnSound, reveal: playReveal };
})(typeof window !== "undefined" ? window : this);
