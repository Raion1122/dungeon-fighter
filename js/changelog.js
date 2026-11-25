/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>闇市に専用の不気味なBGM</b> — 夜のポドルプラザ(闇市)に入ると、酒場の曲から低く妖しいダークアンビエントへ切り替わるようになった。外へ戻ると元の曲に戻る。",
  "<b>装備欄に種別アイコン / 雑魚に個体差</b> — 武器・防具・盾の装備欄に種別が一目で分かるアイコンが付き、ゴブリンやオークなど数の多い敵は個体ごとに少し色みが変わって見えるようになった。",
  "<b>気の合う仲間が酒場に連れ立って現れる</b> — 相性のいい2人がそろって卓につくので、一緒に誘えば探索中に2人の掛け合いが聞ける。",
  "<b>討伐した依頼が世界地図で「受注中」のまま残らないように</b> — クリア直後に世界地図へ戻っても、倒し終えた依頼が「受注中」の表示で残らなくなった。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
