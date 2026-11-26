/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>画面めくりの手触りを足した</b> — 画面が切り替わるとき羊皮紙がふわりとめくれて現れ、めくり音とボタンの打鍵を少し重く沈めた。",
  "<b>羊皮紙の質感を調整</b> — 紙面に繊維の筋が通常の距離でもはっきり見えるようにした。右上の操作ヒントが設定ボタンと重ならないよう位置も整えた。",
  "<b>羊皮紙の手触りを強調</b> — 依頼票や酒場の紙面に、古びた繊維の質感が通常の距離でもはっきり出るようにした。",
  "<b>羊皮紙と木の卓に本物の手触り</b> — 紙面の繊維と経年のムラ、卓の黒樫の木目を描き込み、画面の質感を一段深くした。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
