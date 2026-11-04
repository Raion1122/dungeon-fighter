/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>雪山に新しい行き先「霜の巨人の砦」</b> — 地下神殿の奥の雪の峠に、霜の巨人が住みついた。大斧を振るい岩を投げる巨人と、冷気を吐く番犬の冬狼に挑め(神殿のクリア後・推奨 Lv8)。",
  "<b>湖畔の集落に新しい依頼「霧の中の魔女の小屋」</b> — 沼地を片づけると、霧の森の魔女から子どもを取り戻しに行ける。戦うか、礼金で取り引きするかは君しだい(推奨 Lv6)。",
  "<b>湖の北の島に新しい依頼「沈黙の墓所」</b> — 森を片づけると、罠と動く鎧に守られた古の魔法使いの墓へ渡れる。墓の主の眼に気をつけろ(推奨 Lv5)。",
  "<b>港の倉庫街に新しい依頼「消えた積み荷」</b> — 廃坑を片づけると、船着き場の倉庫の床下に潜む疫病の教団を追える(推奨 Lv4)。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
