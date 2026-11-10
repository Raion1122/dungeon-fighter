/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>不意打ちの一撃に見せ場を</b> — 奇襲に成功すると、第 1 ラウンドの間は敵が無防備に。盗賊の一撃は「暗殺!」と響く。",
  "<b>主人公が先頭に立っても最大HPが減らないように</b> — 仲間が倒れて主人公が隊の先頭に立ったとき、レベルや装身具で増えた最大HPが失われていた不具合を直した。",
  "<b>魔法の装身具をシートと出発画面で着脱</b> — ガントレットなどをキャラクターシートと出発前の画面で付け外しできるように。後衛の主人公が着けた品も本人に効くようになった。",
  "<b>赤い卵を持ち帰った後の巣穴は ★ が増える</b> — 危険が増したことが酒場の札で分かる。集まる仲間も主人公のレベルに近づく。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
