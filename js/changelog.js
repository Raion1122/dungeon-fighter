/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>序盤の戦闘を調整</b> — ゴブリンが少し手強くなり、倒した敵から金貨も手に入るようになった。",
  "<b>ダンジョンに目標表示とこまめな保存</b> — 画面上部に討伐目標(クリア条件)を表示し、部屋を片付けるたびに装備・経験値・金貨を記録するようにした。",
  "<b>酒場に遊び方ガイド / 導入スキップ</b> — 左下「❓遊び方」で操作を確認でき、長い前口上をスキップできるようになった。",
  "<b>酒場の依頼が 3 件に</b> — 空いていた卓にも依頼人が座るようになった。戻るたびに 3 件が入れ替わる。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
