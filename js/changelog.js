/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>気の合う仲間が酒場に連れ立って現れる</b> — 相性のいい2人がそろって卓につくので、一緒に誘えば探索中に2人の掛け合いが聞ける。",
  "<b>討伐した依頼が世界地図で「受注中」のまま残らないように</b> — クリア直後に世界地図へ戻っても、倒し終えた依頼が「受注中」の表示で残らなくなった。",
  "<b>仲間どうしの掛け合いが探索中に出るように</b> — 相性の良い二人を同じ一行に入れると、ダンジョン探索の合間にときどき専用のやり取りを交わす。",
  "<b>仲間どうしの掛け合い</b> — 気の合う二人が同じパーティにいると、探索中にときどき二人で言葉を交わすようになった。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
