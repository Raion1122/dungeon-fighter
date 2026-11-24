/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>仲間への指示に「作戦」を追加</b> — 出発の準備で「ボス戦は大技を優先」「手負いの味方を早めに回復」を選べる。オートバトルの戦い方にプレイヤーの意図を反映できる。",
  "<b>魔物図鑑をはじめから開けるように</b> — 酒場の魔物図鑑の入口を最初から表示するようにした。まだ魔物と戦っていなくても開けて、これから何が記録されていくか確かめられる。",
  "<b>受注画面の風景帯の崩れを修正</b> — 風景画が用意されていない依頼で、受注のときに一瞬出ていた画像の崩れを解消した。",
  "<b>表示まわりの小さな不具合を修正</b> — 受注した依頼の名前が酒場上部にすぐ反映されるようにし、罠解除の確認が戦闘開始や画面切り替えの後に残らないように直した。依頼人の立ち絵が用意されていないときに崩れて見える問題も解消。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
