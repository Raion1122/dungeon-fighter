/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>闇市の地下街に住人</b> — ゴブリン・ホブゴブリン・リザードフォークが通路を行き交う。押すと一言。",
  "<b>古物商で装備品が買えるように</b> — 闇市の地下街の古物商に、ボスの落とし物の装備品が来るたび 1〜2 品並ぶ(牙貨 25〜30)。独自の名前だった装備品 19 品は D&amp;D の品の名前に(強さはそのまま)。",
  "<b>闇市が歩ける地下街に</b> — 薬屋・杖屋・召喚屋・古物商の露店を灯りを手に巡れる。港町の石段からも出入りできる。",
  "<b>闇市に薬屋と杖屋</b> — 回復のポーションやワンドオブマジックミサイルなど、D&D の品が並ぶ。HP が減った仲間は自分でポーションを飲む。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
