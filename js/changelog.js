/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>港の倉庫街に新しい依頼「消えた積み荷」</b> — 廃坑を片づけると、船着き場の倉庫の床下に潜む疫病の教団を追える(推奨 Lv4)。",
  "<b>新しい行き先「コボルドの巣穴」</b> — 湖の南の村から、家畜をさらわれたという依頼が駆け出しの冒険者の卓に並ぶ。罠だらけの巣の奥で待つ族長は、何かを崇めているらしい。",
  "<b>闇市は夜だけ開くように</b> — 20時〜深夜1時なら、変装なしで誰でもポドルプラザへ入れる。昼は入り口が消える。",
  "<b>港町フランにも更新情報</b> — 街の右上の「📜 更新情報」をタップすると、最近の変更が読める。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
