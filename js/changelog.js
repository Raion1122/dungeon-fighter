/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>見出しと語りに写本の装飾を</b> — ダンジョンマスターの語りに金の飾り文字と封蝋の飾り罫、看板や依頼人名に彫り込みの陰影を添えた。",
  "<b>画面に奥行きと灯りを</b> — 羊皮紙の札や地図が卓に置かれたように影を落とし、ワールドマップにも温かな灯りを添えた。",
  "<b>酒場の表示の重なりを修正</b> — 画面右上の更新情報が武器防具屋の扉に重なって押せないことがあったのを直した。",
  "<b>画面の質感を一段深く</b> — 羊皮紙に細かな紙目、HPバーに艶とまとまり(味方=緑・敵=赤は据え置き)、会話窓がふわりと開くように。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
