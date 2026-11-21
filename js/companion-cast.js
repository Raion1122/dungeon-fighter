/*
 * js/companion-cast.js — 固定キャスト 12 人 (実装依頼書 #117 §4 / §5-1) v1
 * ------------------------------------------------------------------
 * 同行の仲間を「90 人の名前の表からの抽選」ではなく、各職 2 人・計 12 人の決まった人物にする。
 * 一人ひとりが 名前 / 性格 (trait) / ひと言 (line) / 絵 (variant) / 歩いている間の独り言 (idle) を持つ。
 *
 * ★ 共有モジュール: tavern.html と index.html が
 *      <script src="js/companion-cast.js"></script>
 *   で読み込む。⚠ tavern.html では js/mercenary-roster.js より **前** (名簿の切り替えが DFCast を読む)。
 *
 * ★ クラシックスクリプト (ES module ではない)。
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      公開 API は必ずファイル末尾で明示的に `global.DFCast = { ... }` と代入すること。
 *
 * ⛔⛔ 12 人の文面 (名前・性格・ひと言・独り言) はユーザー承認済み (依頼書 §4)。1 文字も変えないこと。
 *
 * ── 使い方の約束 ──────────────────────────────────────────────────────────
 *   - enabled() = 撤退スイッチ ?cast=0 以外は true。**呼ぶたびに URL を読む** (TDZ 回避・isRecruitOn と同じ)。
 *   - ⛔ all() / byId() / ofClass() / idOfName() の中で enabled() を見ない。
 *       データはいつでも読める。ON/OFF の判定は呼び出し側 (酒場の pickCompanion / 名簿の切り替え) の仕事。
 *   - ⚠ 本体 (index.html) は enabled() を **読まない**。酒場が ON のときだけ人物に castId を付け、
 *       本体は castId があるときだけキャストとして扱う (依頼書 §2-7 罠 B / §7)。
 *       ⛔ 本体で npcName からキャストを引かない (?cast=0 の 90 人の表には同名の「ダグ」「ヨナ」がいる)。
 *   - variant: 1 人目 = 1 (いまの NPC の絵)、2 人目 = 2 (codex1 の納品までは 1 人目と同じ絵)。
 *
 * 公開API: window.DFCast
 *   enabled() / all() / byId(id) / ofClass(classKey) / idOfName(name)
 *
 * ⛔ どの API も例外を投げない。localStorage にも一切触らない (読み出し専用のデータ)。
 */
(function (global) {
  "use strict";

  /* 並び = 職ごとに 1 人目 → 2 人目 (ofClass はこの順のまま返す)。 */
  var CAST = [
    /* 戦士 */
    { id: "irena", classKey: "warrior", name: "イレーナ", variant: 1,
      trait: "生真面目で責任感が強い",
      line: "「衛兵隊のイレーナです。足並みを揃えて参りましょう。」",
      idle: ["隊列を乱さないでください。", "この先、見通しが悪いですね。", "皆さん、怪我はありませんか。"] },
    { id: "mira", classKey: "warrior", name: "ミラ", variant: 2,
      trait: "血の気が多くすぐ突っ込む",
      line: "「あたしが前に出る。あんたは後ろで見てな!」",
      idle: ["退屈だね。早く何か出てこないかな。", "隊長の真似して歩くの、疲れるんだよ。", "腕がなまっちまう。"] },
    /* ドワーフ (ラスムーゼン = 黒い鎧・ユーザー指定) */
    { id: "rasmussen", classKey: "dwarf", name: "ラスムーゼン", variant: 1,
      trait: "無口で何を考えているか読めない",
      line: "「……ラスムーゼンだ。……行くぞ。」",
      idle: ["……。", "……岩の匂いが変わった。", "……気を抜くな。"] },
    { id: "dag", classKey: "dwarf", name: "ダグ", variant: 2,
      trait: "酒好きで宵越しの金を持たない",
      line: "「ガハハ! 稼いだら一杯やろうじゃわい!」",
      idle: ["帰ったら樽ごと飲むんじゃわい。", "ガハハ、こういう穴蔵は落ち着くのう。", "腹が減ったのう……。"] },
    /* 僧侶 */
    { id: "jona", classKey: "cleric", name: "ヨナ", variant: 1,
      trait: "信心深く事あるごとに祈る",
      line: "「神のご加護がありますように。よろしくお願いします。」",
      idle: ["神よ、どうか皆をお守りください。", "先生なら、ここでどうされるでしょう。", "暗いところは、少し苦手です。"] },
    { id: "gawain", classKey: "cleric", name: "ガウェイン", variant: 2,
      trait: "元騎士の厳格な老司祭",
      line: "「傷を負ったら言うがよい。癒やすのが我が務めであろう。」",
      idle: ["若いの、足元を見て歩け。", "昔は剣を振るっておったものだ。", "焦るでない。道は逃げぬ。"] },
    /* 魔法使い */
    { id: "oz", classKey: "mage", name: "オズ", variant: 1,
      trait: "理屈っぽいが頼りになる",
      line: "「伝承によれば、この依頼は危険だ。だからこそ興味深いね。」",
      idle: ["この石組み、かなり古い時代のものだね。", "理屈で考えれば、出口はあっちのはずだ。", "先生に見せたい書物が増えたよ。"] },
    { id: "bernt", classKey: "mage", name: "ベルント", variant: 2,
      trait: "皮肉屋だが腕は確か",
      line: "「ふん、若造の子守りか。報酬が良ければ構わんだろうよ。」",
      idle: ["ふん、湿気で巻物が傷む。", "年寄りに階段を歩かせるとはな。", "急いだところで、罠が増えるだけだろうよ。"] },
    /* エルフ */
    { id: "falke", classKey: "elf", name: "ファルケ", variant: 1,
      trait: "慎重で石橋を叩いて渡る",
      line: "「ファルケだ。音を立てずに歩け。それだけ守ってくれ。」",
      idle: ["静かに。……気のせいか。", "風が止んだ。用心しろ。", "ブラン、はしゃぐな。"] },
    { id: "bran", classKey: "elf", name: "ブラン", variant: 2,
      trait: "夢見がちで英雄譚に憧れている",
      line: "「この冒険はきっと歌になるさ! よろしくね!」",
      idle: ["この話、帰ったら歌にしようかな。", "ねえ、英雄ってこういう道を歩くんだよね?", "ファルケはいつも怖い顔してるなあ。"] },
    /* 盗賊 */
    { id: "rolf", classKey: "rogue", name: "ロルフ", variant: 1,
      trait: "皮肉屋だが面倒見はいい",
      line: "「へっ、またお守り役か。まあいい、ついて来な。」",
      idle: ["へっ、静かすぎて逆に気味が悪いぜ。", "鍵があったら俺に任せな。", "クヌートの奴、また借金増やしてねえだろうな。"] },
    { id: "knut", classKey: "rogue", name: "クヌート", variant: 2,
      trait: "金にがめついが約束は守る",
      line: "「ひっ、分け前はちゃんと貰うっすよ! 約束は守るっすから!」",
      idle: ["お宝の匂いがするっす……たぶん。", "ひっ、今なんか動いたっすよね?", "ロルフさん、借りはそのうち返すっすから。"] },
  ];

  /* 撤退スイッチ ?cast=0。⚠ 呼ぶたびに読む。URLSearchParams が無い環境では ON (出荷時の姿) に倒す
     (js/mercenary-roster.js の enabled() と同じ理由)。 */
  function enabled() {
    try { return new URLSearchParams(global.location.search).get("cast") !== "0"; }
    catch (e) { return true; }
  }

  /* 1 人ぶんの複製 (呼び出し側が触っても表が変わらない)。 */
  function copyOf(c) {
    return { id: c.id, classKey: c.classKey, name: c.name, trait: c.trait, line: c.line,
             variant: c.variant, idle: c.idle.slice() };
  }
  function all() { return CAST.map(copyOf); }
  function byId(id) {
    for (var i = 0; i < CAST.length; i++) if (CAST[i].id === id) return copyOf(CAST[i]);
    return null;
  }
  function ofClass(classKey) {
    var out = [];
    for (var i = 0; i < CAST.length; i++) if (CAST[i].classKey === classKey) out.push(copyOf(CAST[i]));
    return out;
  }
  /* 名前 → id。キャストの名前は 12 人の中で重ならない (依頼書 §2-7 罠 A)。無ければ null。 */
  function idOfName(name) {
    for (var i = 0; i < CAST.length; i++) if (CAST[i].name === name) return CAST[i].id;
    return null;
  }

  // ⚠ classic script 直下の関数は window に載らない。ここで明示的に生やすこと。
  global.DFCast = {
    enabled: enabled,
    all: all,
    byId: byId,
    ofClass: ofClass,
    idOfName: idOfName,
  };
})(window);
