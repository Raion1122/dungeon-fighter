/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>闇市は夜だけ開くように</b> — 20時〜深夜1時なら、変装なしで誰でもポドルプラザへ入れる。昼は入り口が消える。",
  "<b>港町フランにも更新情報</b> — 街の右上の「📜 更新情報」をタップすると、最近の変更が読める。",
  "<b>闇市の地下街に住人</b> — ゴブリン・ホブゴブリン・リザードフォークが通路を行き交う。押すと一言。",
  "<b>古物商で装備品が買えるように</b> — 闇市の地下街の古物商に、ボスの落とし物の装備品が来るたび 1〜2 品並ぶ(牙貨 25〜30)。独自の名前だった装備品 19 品は D&amp;D の品の名前に(強さはそのまま)。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
