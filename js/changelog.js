/* 更新情報 (📜) の文面の唯一の正 (#101)。銀の鹿亭 (tavern.html) と港町 (town.html) の両方がここから描く。
   ⛔ 手で書き換えない — 追記は  py tools/add_changelog.py "<b>見出し</b> — 説明文"
   ⛔ BEGIN / END の 2 行は tools/add_changelog.py と scripts/hooks/check_changelog.py が目印にしている。
      綴りを変えるとチェックが止まる (#101 §2-2)。
   ⚠ 文面はプレイヤー向けの日本語要約。<b> と &amp; を含む HTML 断片 (自前の文なので innerHTML で入れる)。 */
window.DF_CHANGELOG = [
/* CHANGELOG:BEGIN */
  "<b>崩れた塔のボス戦前に「魔力の暴発」の語りが必ず出るように</b> — リッチと対峙する直前、書斎の術式がほころんで魔力が暴発する一幕を見逃さなくなった。",
  "<b>崩れた魔術師の塔の検証用スイッチを追加(開発者向け)</b> — 塔が掲示板に出て最後まで遊べることを確実に確認できるようにした。通常の冒険や他の依頼・セーブには影響しません。",
  "<b>新しい行き先「崩れた魔術師の塔」を追加</b> — 砦のクリア後に受けられる本筋外の依頼。構造物の番人を抜け、禁じられた術で不死を得た塔の主に挑む。入口では魔法学の判定で封印の術式を読み解ける。",
  "<b>戦いの画面にも羊皮紙の繊維を</b> — ダンジョンマスターの語りや仲間のステータス札にも、通常の距離で繊維の筋が見えるようにした。",
/* CHANGELOG:END */
];
window.dfFillChangelog = function (ul) {
  if (!ul) return;
  ul.innerHTML = window.DF_CHANGELOG.map(function (s) { return "<li>" + s + "</li>"; }).join("");
};
