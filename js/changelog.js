/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>羊皮紙と木の卓に本物の手触り</b> — 紙面の繊維と経年のムラ、卓の黒樫の木目を描き込み、画面の質感を一段深くした。",
  "<b>羊皮紙UIの重厚感を微調整</b> — タイトルと語りの区切りに赤い封蝋、ワールドマップの余白を温かい木の卓に、看板や依頼人名の彫りを深めた。",
  "<b>見出しと語りに写本の装飾を</b> — ダンジョンマスターの語りに金の飾り文字と封蝋の飾り罫、看板や依頼人名に彫り込みの陰影を添えた。",
  "<b>画面に奥行きと灯りを</b> — 羊皮紙の札や地図が卓に置かれたように影を落とし、ワールドマップにも温かな灯りを添えた。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
