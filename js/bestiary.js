/*
 * js/bestiary.js — 魔物図鑑 (敵情報の段階開示) v1  ★[B2 縮小版]
 * ------------------------------------------------------------------
 * 開発会議 2026-11-23「D&D らしさを濃くするギミック 10 案」§B2 の縮小版の結論:
 *   「遭遇で埋まる図鑑 = 既存データ(#75/#76) + localStorage 累積 + 一覧 UI」。
 *   初遭遇 = 姿と名前 (基本情報) / 伝承判定(#76)の成功 = 弱点・耐性・脅威度を開示。
 *
 * ★ 共有モジュール: index.html (記録する側) / tavern.html (読んで描く側) が
 *      <script src="js/bestiary.js"></script>
 *   で読み込む。js/save-slots.js・js/mercenary-roster.js と同じ作法で、HTML 側に写しを作らない。
 *   弱点/耐性・脅威度・分類という「規則」は index.html の ENEMY_TRAITS(#75)・LORE_*(#76) が唯一の正。
 *   この図鑑は index 側で**算出済みの表示用テキストを受け取って貯めるだけ**で、第二の規則を持たない。
 *
 * ★ クラシックスクリプト (ES module ではない)。公開 API は末尾で global.DFBestiary に代入する。
 *
 * ── 保存先 ────────────────────────────────────────────────────────
 *   dragonfighters.bestiary … 遭遇記録 1 キー (JSON)。
 *   ⛔ 前置詞 "dragonfighters." を変えない。js/save-slots.js の keysOf() が LIVE_PREFIX で
 *      総なめしているので、この前置詞のままならセーブスロットごとの焼き分け (snapshot) と
 *      新規ゲームでの消去 (wipeLive) がこちらのコードを 1 行も書かずに正しくなる (記録棚 #37 と同じ理由)。
 *   ⛔ KEEP (settings / panelCollapsed) には載せない — 図鑑はスロット (= 主人公) ごとに分かれるべきもの。
 *
 * ── 記録の形 ──────────────────────────────────────────────────────
 *   { "<敵キー>": { name, flavor, por, seen, slain, lore, cr, traits, skill } }
 *     name   … 敵の表示名 (初遭遇で入る)
 *     flavor … 1 行の説明 (基本情報。初遭遇で入る)
 *     por    … 姿を描くためのスプライト 1 コマの幾何 {sprite,frameW,frameH,cols,rowOffset,sheetW,sheetH}
 *     seen   … 遭遇した戦闘の回数 (戦うたびに増える = 「少しずつ埋まる」実感)
 *     slain  … 討伐した数
 *     lore   … 伝承判定に成功して弱点/耐性を開示したか (段階開示の第2段)
 *     cr     … 脅威度の表示テキスト ("1/4" 等。lore 成功時に入る・SRD に無ければ "")
 *     traits … 弱点/耐性の短文 (loreTraitText の結果。lore 成功時に入る)
 *     skill  … 伝承の分類 (歴史/宗教/魔法学。lore 成功時に入る)
 *
 * ★ 撤退スイッチ ?bestiary=0 … enabled() が false を返す ⇒ 記録も一覧 UI も出ない (従来どおり図鑑無し)。
 *
 * ⚠ この module のどのメソッドも**絶対に例外を投げない**。記録は戦闘の集約点 (defeatEnemy 等) から
 *   呼ばれるので、ここで throw すると戦闘そのものが壊れる。read/write は try/catch で必ず握り潰す。
 */
(function (global) {
  "use strict";

  var KEY = "dragonfighters.bestiary";

  /* 撤退スイッチ ?bestiary=0。URLSearchParams が無い環境でも道連れにしない (既定 = ON)。 */
  function enabled() {
    try { return new URLSearchParams(global.location.search).get("bestiary") !== "0"; }
    catch (e) { return true; }
  }

  function read() {
    try {
      var raw = global.localStorage.getItem(KEY);
      var o = raw ? JSON.parse(raw) : null;
      return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }
  }
  function write(map) {
    try { global.localStorage.setItem(KEY, JSON.stringify(map)); return true; }
    catch (e) { return false; }
  }

  function entryOf(map, type) {
    return map[type] || (map[type] = { seen: 0, slain: 0, lore: false });
  }
  /* 基本情報 (姿と名前・説明) を補完する。name は最新で上書き、por/flavor は無ければ入れる。 */
  function fillBasic(e, info) {
    if (!info) return;
    if (info.name) e.name = info.name;
    if (info.flavor != null && e.flavor == null) e.flavor = info.flavor;
    if (info.por && !e.por) e.por = info.por;
  }

  /* 初遭遇/再遭遇 (戦闘開始・増援合流で 1 戦 1 回 / 種)。seen を 1 増やし基本情報を入れる。 */
  function sighted(type, info) {
    if (!enabled() || !type) return false;
    var m = read();
    var e = entryOf(m, type);
    e.seen = (e.seen | 0) + 1;
    fillBasic(e, info);
    return write(m);
  }

  /* 討伐。slain を 1 増やす。遭遇を取りこぼしていても最低 1 遭遇にする (撃破は遭遇を含意)。 */
  function slew(type, info) {
    if (!enabled() || !type) return false;
    var m = read();
    var e = entryOf(m, type);
    if (!(e.seen > 0)) e.seen = 1;
    e.slain = (e.slain | 0) + 1;
    fillBasic(e, info);
    return write(m);
  }

  /* 伝承判定(#76)の成功で弱点/耐性/脅威度/分類を開示 (段階開示の第2段)。
     info = {name, flavor, por, cr, traits, skill}。cr/traits/skill は index 側で算出済みの表示用。 */
  function learned(type, info) {
    if (!enabled() || !type) return false;
    var m = read();
    var e = entryOf(m, type);
    if (!(e.seen > 0)) e.seen = 1;
    e.lore = true;
    if (info) {
      if (info.cr != null) e.cr = info.cr;
      if (info.traits != null) e.traits = info.traits;
      if (info.skill) e.skill = info.skill;
    }
    fillBasic(e, info);
    return write(m);
  }

  /* 一覧 (tavern.html が描く)。遭遇の多い順 → 名前順。?bestiary=0 なら空配列。 */
  function all() {
    if (!enabled()) return [];
    var m = read();
    var out = [];
    Object.keys(m).forEach(function (type) {
      var e = m[type];
      if (!e) return;
      out.push({
        type: type,
        name: e.name || type,
        flavor: e.flavor || "",
        seen: e.seen | 0,
        slain: e.slain | 0,
        lore: !!e.lore,
        cr: e.cr || "",
        traits: e.traits || "",
        skill: e.skill || "",
        por: e.por || null,
      });
    });
    out.sort(function (a, b) {
      if (b.seen !== a.seen) return b.seen - a.seen;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return out;
  }

  /* 記録した種類数 (シェルフを出すかの判定に使う)。 */
  function count() {
    if (!enabled()) return 0;
    try { return Object.keys(read()).length; } catch (e) { return 0; }
  }
  /* 正体を解明した (lore 成功) 種類数。 */
  function knownCount() {
    if (!enabled()) return 0;
    var m = read(), n = 0;
    Object.keys(m).forEach(function (t) { if (m[t] && m[t].lore) n++; });
    return n;
  }

  // ⚠ classic script 直下の関数は window に載らない。ここで明示的に生やす。
  global.DFBestiary = {
    KEY: KEY,
    enabled: enabled,
    sighted: sighted,
    slew: slew,
    learned: learned,
    all: all,
    count: count,
    knownCount: knownCount,
    // テスト/内部用
    _read: read,
    _write: write,
  };
})(window);
