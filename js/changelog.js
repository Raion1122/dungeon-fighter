/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>仲間が 12 人の決まった顔ぶれに</b> — 酒場で出会う仲間が、名前と性格と口ぐせを持った 12 人になった。ダンジョンを歩いている間、ときどき独り言も言う。",
  "<b>エルフの新呪文「グッドベリー」</b> — 最初の部屋で木の実を 10 個作り、HP が半分を切った仲間が戦いながら 1 個ずつ食べて回復する。森の書は酒場の巻物の棚で買える。",
  "<b>先頭に立った仲間が弱くならないように</b> — 先頭が倒れて次の仲間が前に出たとき、レベルで伸びた HP・命中・ダメージが消えていた不具合を直した。",
  "<b>不意打ちの一撃に見せ場を</b> — 奇襲に成功すると、第 1 ラウンドの間は敵が無防備に。盗賊の一撃は「暗殺!」と響く。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
