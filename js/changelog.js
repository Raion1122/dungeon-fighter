/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>新しい行き先「街道の襲撃者の野営地」を追加</b> — 丘の崩れた物見櫓を塒にする盗賊団を討つ、街道沿いの寄り道。頭目は略奪した鎧を纏う大男。",
  "<b>仲間のレベルが主人公に連動</b> — 同行する仲間の強さが主人公レベルの ±2 に収まるようになった。久しぶりに誘った古株も置いていかれない。",
  "<b>細かな表示の不具合を修正</b> — 罠の解除ダイアログに別の選択ボタンが紛れ込む/画面端でダイスの数字が見切れる/依頼を受けた時の語りが二重に流れる、の3点を直した。",
  "<b>崩れた塔のボス戦前に「魔力の暴発」の語りが必ず出るように</b> — リッチと対峙する直前、書斎の術式がほころんで魔力が暴発する一幕を見逃さなくなった。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
