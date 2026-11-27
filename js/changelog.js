/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>戦闘のあと入口の選択肢が押せなくなる不具合を修正</b> — 近海の難破船などで、戦いを終えたあとに出入口の判断の選択肢がもう一度きちんと押せるようになった。",
  "<b>近海の難破船の表示を調整</b> — 判定パネルで仲間の名前が切れず全部出るように。依頼説明の地名の重複をなくし、罠の選択が戦闘開始後に残らないよう直した。",
  "<b>近海の難破船を追加</b> — 沼地クリア後、酒場に海の依頼が並ぶ。浸水した難破船と海蝕洞を抜け、鱗の魔物の長を討て。",
  "<b>街道の野営地で入口の知覚判定が出るように</b> — 野営地を観察して略奪品の手がかりを読む判定が、戦闘に遮られて一度も出なかったのを修正。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
