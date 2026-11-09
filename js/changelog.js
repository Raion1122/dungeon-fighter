/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>赤い卵を持ち帰った後の巣穴は ★ が増える</b> — 危険が増したことが酒場の札で分かる。集まる仲間も主人公のレベルに近づく。",
  "<b>コボルドの巣穴に新しい秘密</b> — 祭壇の赤い卵を持ち帰った者がもう一度巣穴を訪れると、何かが待っている。",
  "<b>地図は 1 回押せば着くまで歩く</b> — 道中の出来事では立ち止まり、選んだら続きを歩く。札は受けた依頼の行き先と港町だけに。",
  "<b>伝承の品は酒場の装身具の欄で紫に</b> — 「伝承」の札と、どの依頼で手に入れた品かが分かる。マジックアイテムは青。伝承の品は闇市の古物商には並ばなくなった(ガントレットオブオーガパワーも霜の巨人の砦の伝承の品になった)。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
