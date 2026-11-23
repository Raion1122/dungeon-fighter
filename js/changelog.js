/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>撤退ラインと蘇生費を追加</b> — 出発前の仲間集めの画面で「HP がこの割合を切ったら自動で引き上げる」ラインを選べる。全滅すると酒場で倒れた仲間の蘇生に金貨がかかる。",
  "<b>呪文スロットがラン単位の希少資源に</b> — 戦闘ごとの自動回復をやめ、酒場で休んで出発し直すと全回復する方式へ。残りスロットはサイドバーで色が変わり、尽きると休息の案内が出る。",
  "<b>ダンジョンに技能判定イベントを追加</b> — 砦の碑文(知識)・神殿の崩れた足場(運動)・竜の巣の岩陰(知覚)で、出目とDCを見ながら挑める。調べない選択も、失敗も、進行は止まらない。",
  "<b>会心の一撃に“時が止まる”一瞬の演出</b> — クリティカルとボス撃破で画面がきらめいて数字がより大きく弾け、空振り(ファンブル)は冷たく閃く。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
