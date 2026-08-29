/*
 * js/player-sheet.js — プレイヤーシート v1 (閲覧専用) + 言語マスタ
 * ------------------------------------------------------------------
 * 実装依頼書 #29 (`実装依頼書/2026-08-28_player-sheet-v1.md`) の STEP1/STEP2。
 *
 * ★ 何のためのモジュールか
 *   「主人公が何者なのか」を腰を据えて見る場所が、このゲームにはどこにも無かった。
 *   能力値は判定パネルの内訳に一瞬映るだけ、レベルと XP は酒場の準備画面にしか出ない。
 *   → **いつでも開ける 1 枚のシート**を、5 ページ (index / tavern / town / world / title)
 *     共通の共有モジュールとして持つ。
 *
 * ★ classic script (ES module ではない)
 *   ⚠ classic script 直下の var/function は window に載らない。
 *      公開 API は必ずファイル末尾で明示的に `global.DFSheet = { ... }` と代入すること。
 *   ⚠ 依存: js/abilities.js (window.DFAbilities)。**本ファイルより前**に読み込むこと。
 *      無くても落ちない (能力値区画が行ごと消えるだけ) が、それは「壊れて見える」状態。
 *
 * ★ v1 は閲覧専用。装備欄は出さない (依頼書 §2-3)
 *   装備テーブル 41 定義が index.html / tavern.html へ手作業ミラーされており、
 *   localStorage に入っているのは索引だけ。よって town/world/title では
 *   「今どの武器を持っているか」を**原理的に表示できない**。装備欄は #30。
 *
 * ★ 取れなかった区画は「空文字で描く」のではなく **行ごと DOM から消す** (依頼書 §2-4)
 *   HP/AC は index.html のランタイム変数で、他 4 ページには存在しない。
 *   `—` や `0` を出すと「HP 0 = 死んでいる」に見える。伏せるのが正しい。
 *   ⭐ 「空文字を描いた」と「行ごと消した」の区別は __state() の avail / inDom で機械検査する。
 *
 * ★ #36 で 5E キャラクターシートの体裁へ (区画 5 -> 11 / 3 段組)
 *   区画の割り付けは SECTION_DEFS_V2 の col が唯一の正。空欄枠は BLANK_* のホワイトリスト。
 *   ⚠ 「取れなかった区画」と「空欄枠」は別物。__state() は avail / blank / inDom の 3 値を返し、
 *     規則は inDom === (avail || blank)。⛔ #29 の規律 (取れない区画は行ごと消す) は緩めない。
 *
 * ★ 撤退スイッチ ?sheet=0
 *   IIFE 先頭で location.search を 1 回読み、真なら **ボタンもオーバーレイも注入せず、
 *   window.DFSheet も生やさずに** return する。ページ単位で完結する (?ability5e=0 と同じ作法)。
 *
 * 公開API: window.DFSheet
 *   - LANGUAGES              [{id,label,tier}] 14 件
 *   - CLASS_LANGUAGES        {classKey:{fixed:[id...], picks:N}} 6 職
 *   - open() / close() / toggle() / isOpen()
 *   - render()               中身だけ描き直す
 *   - languagesOf(classKey)  固定 + 保存済み選択 をマージ (表示の唯一の入口)
 *   - heroClassKey()         partyComposition の先頭 (未知 / 未保存なら warrior)
 *   - classLabel(classKey)   職業の表示名
 *   - setBodyProvider(fn)    HP/AC の供給口。index.html だけが登録する
 *   - __state()              ⭐ 検証用シーム: 何を取れて何を伏せたかを本番の描画結果から返す
 */
(function (global) {
  "use strict";

  /* ══ 撤退スイッチ ?sheet=0 ═══════════════════════════════════════════════
   *  ⛔ ここより下は 1 行も走らない = window.DFSheet も生えない。
   *     「注入だけ止めて API は残す」にすると (5a) が「ボタンは無いが器はある」で
   *     曖昧になるので、丸ごと居なかったことにする。 */
  var ENABLED = true;
  try {
    ENABLED = new URLSearchParams(global.location.search).get("sheet") !== "0";
  } catch (e) { ENABLED = true; }
  if (!ENABLED) return;

  /* ══ 撤退スイッチ ?sheet5e=0 (依頼書 #36 §7-2) ═══════════════════════════
   *  既定 (真)  … 5E キャラクターシートの体裁 (11 区画・3 段組)
   *  ?sheet5e=0 … #29 の v1 (5 区画・flex 折り返し) の姿へ丸ごと戻る
   *  ⛔ ?sheet=0 (モジュールごと止める) と混ぜない。2 本を独立に残す。
   *  ⚠ ページ遷移はまたがない (?ability5e=0 と同じ、ページ単位で完結)。 */
  var SHEET5E = true;
  try {
    SHEET5E = new URLSearchParams(global.location.search).get("sheet5e") !== "0";
  } catch (e) { SHEET5E = true; }

  // ══ localStorage キー ══════════════════════════════════════════════════
  var LANG_KEY  = "dragonfighters.languages";        // ⭐ 本モジュールが増やす唯一のキー
  var XP_KEY    = "dragonfighters.xp";
  var PARTY_KEY = "dragonfighters.partyComposition";

  // ══ 言語マスタ (D&D 5.1 SRD / CC-BY 4.0 = 商用可・Product Identity 抵触なし) ══
  //  ⚠ 実在 SRD 品はカタカナ音写、という既存方針 (マジックアイテム) は言語には適用しない。
  //    アイテム名は固有名詞だが言語名は普通名詞で、日本語 TRPG の慣例も「ドワーフ語」。
  var LANGUAGES = [
    { id: "common",      label: "共通語",         tier: "standard" },
    { id: "dwarvish",    label: "ドワーフ語",     tier: "standard" },
    { id: "elvish",      label: "エルフ語",       tier: "standard" },
    { id: "giant",       label: "巨人語",         tier: "standard" },
    { id: "gnomish",     label: "ノーム語",       tier: "standard" },
    { id: "goblin",      label: "ゴブリン語",     tier: "standard" },
    { id: "halfling",    label: "ハーフリング語", tier: "standard" },
    { id: "orc",         label: "オーク語",       tier: "standard" },
    { id: "draconic",    label: "竜語",           tier: "exotic" },
    { id: "undercommon", label: "地下共通語",     tier: "exotic" },
    { id: "sylvan",      label: "森語",           tier: "exotic" },
    { id: "celestial",   label: "天上語",         tier: "exotic" },
    { id: "infernal",    label: "地獄語",         tier: "exotic" },
    { id: "primordial",  label: "原初語",         tier: "exotic" },
  ];

  /* 配り方 (5e の「共通語 + 種族言語 + 選択」を、本作の 種族=職業 へ翻案)
   * ⛔ fixed は localStorage に保存しない。保存するのは picks で選ばれた分だけ (依頼書 §2-5)。
   *    混ぜると、後で職の固定言語を直したとき **既存セーブだけ古い言語を持ち続ける**。 */
  var CLASS_LANGUAGES = {
    warrior: { fixed: ["common"],                picks: 1 },
    dwarf:   { fixed: ["common", "dwarvish"],    picks: 1 },
    elf:     { fixed: ["common", "elvish"],      picks: 1 },
    rogue:   { fixed: ["common"],                picks: 2 },
    cleric:  { fixed: ["common", "celestial"],   picks: 1 },
    mage:    { fixed: ["common", "draconic"],    picks: 1 },
  };

  /* 職業の表示名。
   * ⚠ js/hero-classes.js (HERO_CLASSES) は **title / town / world の 3 枚にしか載っていない**
   *   (2026-08-28 実測。同ファイルの冒頭コメント「title と tavern が読む」は実物とズレている)。
   *   シートは 5 ページ全部で職業名を出すので、ここに最小の表を持つ。
   * ⭐ ただし HERO_CLASSES が在るページでは **そちらを優先**する = 写しではなく fallback。
   *   両者がズレたら tools/verify_player_sheet.js が赤くなる (2 経路照合)。 */
  var CLASS_LABELS = {
    warrior: "戦士", dwarf: "ドワーフ", cleric: "僧侶",
    mage: "魔法使い", elf: "エルフ", rogue: "盗賊",
  };

  /* レベル算出テーブル。⚠ index.html:11782 の const XP_THRESHOLDS と同一でなければ嘘になる。
   *   写しであることは承知の上 (index.html の中にしか無く、外から呼べない)。
   *   tools/verify_player_sheet.js (4b) が 10 要素すべてを機械照合する。 */
  var XP_THRESHOLDS = [0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000];

  // ══ 区画 (section) の宣言 ═════════════════════════════════════════════
  //  ⭐ 「取れなかったら行ごと消す」の単位。id はドライバが名指しする契約なので変えない。

  /* #29 の v1 (5 区画)。⭐ ?sheet5e=0 のときの姿そのもの。⛔ 1 文字も変えない。 */
  var SECTION_DEFS_V1 = [
    { id: "dfSheetSecHeader",    label: "" },
    { id: "dfSheetSecAbilities", label: "能力値" },
    { id: "dfSheetSecSkills",    label: "技能" },
    { id: "dfSheetSecLanguages", label: "言語" },
    { id: "dfSheetSecBody",      label: "体" },
  ];

  /* #36 の 5E キャラクターシート (11 区画)。
   * ⛔ v1 の 5 つの id は 1 文字も変えない (ドライバとの契約)。新しい区画は **足すだけ**。
   * col   … 実物のシートの段。A=左 / B=中 / C=右。見出しだけ全幅 (col:"full")。
   *   ⭐ 3 段組の割り付けを **この表 1 箇所** で決める。CSS 側は列の器しか持たない。
   * blank … 実データを 1 つも持たない「空の枠」(依頼書 #36 §2-4 の 3 値契約)。 */
  var SECTION_DEFS_V2 = [
    { id: "dfSheetSecHeader",      label: "",                   col: "full" },
    { id: "dfSheetSecAbilities",   label: "能力値",             col: "A" },
    { id: "dfSheetSecProficiency", label: "習熟",               col: "A" },
    { id: "dfSheetSecSaves",       label: "セーヴィングスロー", col: "A" },
    { id: "dfSheetSecSkills",      label: "技能",               col: "A" },
    { id: "dfSheetSecCombat",      label: "",                   col: "B" },
    { id: "dfSheetSecBody",        label: "ヒット・ポイント",   col: "B" },
    { id: "dfSheetSecAttacks",     label: "攻撃 & 呪文発動",    col: "B" },
    { id: "dfSheetSecPersona",     label: "人物",               col: "C", blank: true },
    { id: "dfSheetSecTraits",      label: "特徴 & 特性",        col: "C" },
    { id: "dfSheetSecLanguages",   label: "その他の習熟と言語", col: "C" },
  ];

  var SECTION_DEFS = SHEET5E ? SECTION_DEFS_V2 : SECTION_DEFS_V1;
  var SECTION_IDS  = SECTION_DEFS.map(function (s) { return s.id; });
  var COL_ORDER    = ["A", "B", "C"];
  var SECTION_COLS = (function () {
    var m = {};
    for (var ci = 0; ci < SECTION_DEFS.length; ci++) {
      m[SECTION_DEFS[ci].id] = SECTION_DEFS[ci].col || "full";
    }
    return m;
  })();

  /* 空欄枠のホワイトリスト (依頼書 #36 §5-3)。
   * ⭐ ここに無い id で data-blank を名乗ったら契約違反 = ドライバ (6a) が赤くなる。
   * ⛔ 「まだ実装していない」ではなく「本作にその概念が原理的に無い」ものだけを載せる。
   * ⭐ #37 で人物欄に文章が入ったら、trait/ideal/bond/flaw を **この表から外すだけ** で流し込める。 */
  var BLANK_SECTION_IDS = SHEET5E ? ["dfSheetSecPersona"] : [];
  var BLANK_FIELD_IDS = SHEET5E ? [
    "background",   // 背景                 — 見出し帯
    "alignment",    // 属性                 — 見出し帯
    "inspiration",  // インスピレーション   — 習熟の区画
    "tempHp",       // 一時ヒット・ポイント — HP の区画
    "hitDice",      // ヒットダイス         — HP の区画
    "deathSaves",   // 死亡セーヴ           — HP の区画
    "trait",        // 性格的特徴  ┐
    "ideal",        // 理想        │ 人物の区画 (= BLANK_SECTION_IDS)
    "bond",         // 絆          │
    "flaw",         // 欠点        ┘
  ] : [];

  var BTN_ID     = "dfSheetBtn";
  var OVERLAY_ID = "dfSheetOverlay";
  var BODY_ID    = "dfSheetBody";
  var STYLE_ID   = "dfSheetStyle";

  // ══ 小道具 ════════════════════════════════════════════════════════════
  function lsGet(k) {
    try { return global.localStorage.getItem(k); } catch (e) { return null; }
  }
  function isDisplayed(el) {
    if (!el) return false;
    try { return global.getComputedStyle(el).display !== "none"; } catch (e) { return true; }
  }
  function signed(n) { return (n >= 0 ? "+" : "") + n; }

  /* ★#36 セーヴィングスローの 5 行。
   * ⛔ 魅力 (cha) の行は作らない — index.html の playerStats に cha が無い (依頼書 §2-2)。
   *    ⚠ 6 能力の並び (ABILITY_KEYS) とは別物。混ぜると「魅力セーヴ +0」という嘘が出る。 */
  var SAVE_KEYS  = ["str", "dex", "con", "int", "wis"];
  var SAVE_LABEL = { str: "筋力", dex: "敏捷力", con: "耐久力", int: "知力", wis: "判断力" };
  /* HERO_CLASSES.zone の和訳。PARTY_ZONES (index/tavern) と同じ 3 値。 */
  var ZONE_LABEL = { front: "前衛", mid: "中衛", rear: "後衛" };

  function langById(id) {
    for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].id === id) return LANGUAGES[i];
    return null;
  }

  function normalizeClassKey(key) {
    /* ⚠ 知らない classKey で表を引くと undefined 参照で落ちる。
       town.html:406 heroClassKey() と同じ作法で warrior へ落とす (黙って壊れないための保険)。 */
    return (key && Object.prototype.hasOwnProperty.call(CLASS_LANGUAGES, key)) ? key : "warrior";
  }

  function heroClassKey() {
    var key = null;
    try {
      var pc = JSON.parse(lsGet(PARTY_KEY) || "[]");
      if (Array.isArray(pc) && typeof pc[0] === "string") key = pc[0];
    } catch (e) { key = null; }
    return normalizeClassKey(key);
  }

  function classLabel(classKey) {
    var key = normalizeClassKey(classKey);
    var hc = global.HERO_CLASSES;
    if (hc && hc.length) {
      for (var i = 0; i < hc.length; i++) {
        if (hc[i] && hc[i].classKey === key && hc[i].name) return hc[i].name;
      }
    }
    return CLASS_LABELS[key] || key;
  }

  /** 保存済みの「選んだ言語」。⚠ キー無し / 壊れた JSON / 配列でない → 必ず [] (例外を投げない)。 */
  function pickedLanguages() {
    var raw = lsGet(LANG_KEY);
    if (!raw) return [];
    var arr = null;
    try { arr = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var id = arr[i];
      /* ⚠ 未知の id は捨てる。壊れたセーブが読めない文字列として画面に出るのを防ぐ。 */
      if (typeof id === "string" && langById(id) && out.indexOf(id) < 0) out.push(id);
    }
    return out;
  }

  /**
   * 表示の唯一の入口。固定分 + 保存済み選択分 を **重複を除いて** 返す。
   * ⛔ この関数は localStorage へ 1 バイトも書かない (fixed を保存に混ぜない・依頼書 §2-5)。
   * @param {string} classKey
   * @returns {string[]} 言語 id の配列 (固定分が先・保存順で選択分)
   */
  function languagesOf(classKey) {
    var def = CLASS_LANGUAGES[normalizeClassKey(classKey)];
    var out = [];
    var fixed = (def && def.fixed) || [];
    for (var i = 0; i < fixed.length; i++) if (out.indexOf(fixed[i]) < 0) out.push(fixed[i]);
    var picked = pickedLanguages();
    for (var j = 0; j < picked.length; j++) if (out.indexOf(picked[j]) < 0) out.push(picked[j]);
    return out;
  }

  function levelFromXp(xp) {
    var lv = 1;
    for (var i = 0; i < XP_THRESHOLDS.length; i++) if (xp >= XP_THRESHOLDS[i]) lv = i + 1;
    return lv;
  }
  function nextThreshold(lv) {
    if (lv >= XP_THRESHOLDS.length) return null;   // カンスト = 「次」が無い
    return XP_THRESHOLDS[lv];                      // lv は 1-index なので [lv] が次の閾値
  }

  /* ── 体 (HP / AC) の供給口 ────────────────────────────────────────────
   *  ⚠ hp / maxHp / playerStats は index.html の**モジュールスコープ変数**で window に載らない
   *    (classic script 直下の const/let は window 非搭載)。よって外から勝手には読めない。
   *  ⭐ index.html 側が setBodyProvider() で明示的に渡す。渡されないページでは体区画が
   *    行ごと消える = 依頼書 §2-4 の「取れない所は伏せる」がそのまま成立する。 */
  var BODY_PROVIDER = null;
  function setBodyProvider(fn) { BODY_PROVIDER = (typeof fn === "function") ? fn : null; }
  function bodyStats() {
    var s = null;
    if (BODY_PROVIDER) { try { s = BODY_PROVIDER(); } catch (e) { s = null; } }
    if (!s) {
      // 供給口が未登録でも、明示的に window へ出ていれば拾う (将来の保険)。
      try {
        var ps = global.playerStats;
        if (ps && typeof ps.ac === "number") s = { hp: global.hp, maxHp: global.maxHp, ac: ps.ac };
      } catch (e) { s = null; }
    }
    if (!s) return null;
    var ac = s.ac, mx = s.maxHp, hp = (typeof s.hp === "number") ? s.hp : mx;
    if (typeof ac !== "number" || !isFinite(ac)) return null;
    if (typeof mx !== "number" || !isFinite(mx) || mx <= 0) return null;
    var out = { hp: (typeof hp === "number" && isFinite(hp)) ? hp : mx, maxHp: mx, ac: ac };
    /* ★#36: 5E シート用の材料を素通しする。⛔ 無い項目を勝手に作らない
       (作ると「供給口が渡していない」と「0 だった」が見分けられなくなる)。
       ⚠ 既存 3 つ (hp/maxHp/ac) の契約は 1 文字も変えていない。 */
    if (s.saves && typeof s.saves === "object") {
      var sv = {}, okAll = true;
      for (var sk = 0; sk < SAVE_KEYS.length; sk++) {
        var kk = SAVE_KEYS[sk];
        if (typeof s.saves[kk] === "number" && isFinite(s.saves[kk])) sv[kk] = s.saves[kk];
        else okAll = false;
      }
      if (okAll) out.saves = sv;
    }
    out.saveBonus  = (typeof s.saveBonus === "number" && isFinite(s.saveBonus)) ? s.saveBonus : 0;
    out.initiative = (typeof s.initiative === "number" && isFinite(s.initiative)) ? s.initiative : null;
    out.speedTiles = (typeof s.speedTiles === "number" && isFinite(s.speedTiles)) ? s.speedTiles : null;
    out.weaponName = s.weaponName || null;
    out.armorName  = s.armorName || null;
    out.atkBonus   = (typeof s.atkBonus === "number") ? s.atkBonus : null;
    out.dmgDice    = s.dmgDice || null;
    out.dmgBonus   = (typeof s.dmgBonus === "number") ? s.dmgBonus : 0;
    out.critRange  = (typeof s.critRange === "number") ? s.critRange : null;
    out.critMult   = (typeof s.critMult === "number") ? s.critMult : null;
    out.weaponRange = s.weaponRange || null;
    out.skillNames = Array.isArray(s.skillNames) ? s.skillNames.slice() : [];
    return out;
  }

  // ══ データ採取 ════════════════════════════════════════════════════════
  //  ⭐ 「描けるか」の判断はここ 1 箇所。render() も __state() も同じ結果を見る。
  function collect() {
    var classKey = heroClassKey();
    var d = { classKey: classKey, className: classLabel(classKey) };

    var xp = parseInt(lsGet(XP_KEY) || "0", 10);
    if (!isFinite(xp) || xp < 0) xp = 0;
    d.xp = xp;
    d.level = levelFromXp(xp);
    d.nextXp = nextThreshold(d.level);

    // ── 能力値: js/abilities.js が唯一の正。
    //    ⛔ Math.floor((s-10)/2) をここに書かないこと。書くと #28 の撤退 ?ability5e=0 が効かなくなる。
    d.abilities = null;
    var A = global.DFAbilities;
    if (A && A.CLASS_ABILITIES && A.CLASS_ABILITIES[classKey] && A.abilityMod) {
      var sc = A.CLASS_ABILITIES[classKey];
      var keys = A.ABILITY_KEYS || ["str", "dex", "con", "int", "wis", "cha"];
      var rows = [];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (typeof sc[k] !== "number") continue;
        rows.push({
          key: k,
          abbr: (A.ABILITY_ABBR && A.ABILITY_ABBR[k]) || k.toUpperCase(),
          label: (A.ABILITY_LABEL && A.ABILITY_LABEL[k]) || k,
          score: sc[k],
          mod: A.abilityMod(sc[k]),
        });
      }
      if (rows.length) d.abilities = rows;
    }

    // ── 技能: js/skill-check.js は index / tavern にしか載っていない (2026-08-28 実測)。
    //    載っていないページでは技能区画を **行ごと伏せる** (5 ページへ載せる案は採らない。
    //    skill-check.js は判定 UI ごと引き連れてくるので、閲覧専用シートには重すぎる)。
    d.skills = null;
    var SC = global.SkillCheck;
    if (SC && SC.CHECKS && typeof SC.checkScore === "function") {
      var member = { classKey: classKey, name: d.className };
      var profs = (SC.CLASS_PROFICIENCIES && SC.CLASS_PROFICIENCIES[classKey]) || [];
      var srows = [];
      for (var ck in SC.CHECKS) {
        if (!Object.prototype.hasOwnProperty.call(SC.CHECKS, ck)) continue;
        var def = SC.CHECKS[ck];
        var val = null;
        try { val = SC.checkScore(member, def); } catch (e) { val = null; }
        if (typeof val !== "number") continue;
        srows.push({
          key: ck, label: def.label || ck, score: val,
          prof: profs.indexOf(def.profKey) >= 0,
        });
      }
      if (srows.length) d.skills = srows;
    }

    // ── 言語: 固定 + 選択。⭐ 常に固定分があるので、この区画が消えることは無い。
    var ids = languagesOf(classKey);
    var fixedIds = (CLASS_LANGUAGES[classKey] || {}).fixed || [];
    d.languages = [];
    for (var m = 0; m < ids.length; m++) {
      var L = langById(ids[m]);
      if (!L) continue;
      d.languages.push({ id: L.id, label: L.label, tier: L.tier, fixed: fixedIds.indexOf(L.id) >= 0 });
    }

    // ── 習熟ボーナスと受動知覚 (5e 標準 10 + 知覚の値)。
    //    ⭐ SkillCheck が唯一の正なので index / tavern だけ。⛔ ここに 10 + wis 等を書かない。
    d.prof = null;
    if (SC && SC.CHECKS && SC.CHECKS.perception && typeof SC.checkScore === "function"
        && typeof SC.PROFICIENCY_BONUS === "number") {
      var pv = null;
      try { pv = SC.checkScore({ classKey: classKey, name: d.className }, SC.CHECKS.perception); }
      catch (e) { pv = null; }
      if (typeof pv === "number" && isFinite(pv)) d.prof = { bonus: SC.PROFICIENCY_BONUS, passive: 10 + pv };
    }

    // ── 特徴 & 特性: js/hero-classes.js (HERO_CLASSES) が唯一の共有データ。
    //    ⚠ 載っていないページでは区画ごと伏せる (数値を写して腐らせない、が同ファイルの規律)。
    d.traits = null;
    var HC = global.HERO_CLASSES;
    if (HC && HC.length) {
      for (var h = 0; h < HC.length; h++) {
        if (HC[h] && HC[h].classKey === classKey) {
          d.traits = { zone: HC[h].zone, role: HC[h].role, note: HC[h].note };
          break;
        }
      }
    }

    // ── 体: index.html だけが供給できる。
    d.body = bodyStats();
    return d;
  }

  // ══ DOM ═══════════════════════════════════════════════════════════════
  var OPEN = false;
  var LAST_AVAIL = null;      // ⭐ 直近の render が「描ける」と判断した区画 (本番の描画経路そのもの)
  var LAST_CLASS = null;

  /* ⭐ 3 段組の導入で紙の CSS だけが v1 と v2 で分かれる。
     ボタン / オーバーレイ / 見出し / チップは **共通**なので 1 本にまとめてある。
     ⚠ ?sheet5e=0 のときに足すのは CSS_PAPER_V1 だけ = #29 と 1px も変わらない。 */
  var CSS_BASE = [
    '#' + BTN_ID + ' {',
    '  display: inline-flex; align-items: center; justify-content: center; gap: 6px;',
    '  min-height: 40px; padding: 8px 14px; box-sizing: border-box;',
    '  font-family: "MedievalSharp", "Cinzel", serif; font-size: 15px; line-height: 1;',
    '  color: #f5e8c8; background: linear-gradient(to bottom, #6b4f2a, #3a2a15);',
    '  border: 2px solid #c9a961; border-radius: 8px; cursor: pointer;',
    '  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;',
    '}',
    '#' + BTN_ID + '.dfSheetBtn-fixed { position: fixed; left: 18px; bottom: 18px; z-index: 62; }',
    '#' + BTN_ID + ':active { transform: translateY(1px); }',
    '#' + OVERLAY_ID + ' {',
    '  position: fixed; inset: 0; z-index: 220; display: none;',
    '  align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;',
    '  background: rgba(6, 4, 2, 0.72);',
    '}',
    '#' + OVERLAY_ID + '.open { display: flex; }',
    '#' + OVERLAY_ID + ' .dfSheetClose {',
    '  position: absolute; top: 8px; right: 10px; width: 34px; height: 34px;',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-size: 18px; line-height: 1; color: #2a2118; background: rgba(255, 255, 255, 0.35);',
    '  border: 1px solid #7a5a2c; border-radius: 6px; cursor: pointer; user-select: none;',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetSec { margin: 0 0 14px; }',
    '#' + OVERLAY_ID + ' .dfSheetSec h3 {',
    '  margin: 0 0 6px; font-size: 13px; letter-spacing: 2px; color: #6b4f2a;',
    '  border-bottom: 1px solid rgba(122, 90, 44, 0.45); padding-bottom: 3px;',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetName { font-size: 22px; margin: 0 0 2px; }',
    '#' + OVERLAY_ID + ' .dfSheetMeta { font-size: 13px; color: #5a4630; }',
    '#' + OVERLAY_ID + ' .dfSheetGrid { display: flex; flex-wrap: wrap; gap: 6px; }',
    '#' + OVERLAY_ID + ' .dfSheetCell {',
    '  flex: 1 1 88px; min-width: 88px; padding: 6px 8px; box-sizing: border-box;',
    '  background: rgba(255, 255, 255, 0.34); border: 1px solid rgba(122, 90, 44, 0.4);',
    '  border-radius: 6px; font-size: 13px;',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetCell b { display: block; font-size: 11px; color: #6b4f2a; letter-spacing: 1px; }',
    '#' + OVERLAY_ID + ' .dfSheetCell .v { font-size: 17px; }',
    '#' + OVERLAY_ID + ' .dfSheetChip {',
    '  display: inline-block; margin: 0 5px 5px 0; padding: 3px 9px; font-size: 13px;',
    '  border: 1px solid rgba(122, 90, 44, 0.55); border-radius: 11px;',
    '  background: rgba(255, 255, 255, 0.34);',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetChip.fixed { background: rgba(201, 169, 97, 0.42); }',
  ];

  /* #29 の紙 (v1)。⛔ 1 文字も変えない — ?sheet5e=0 のときの姿そのもの。 */
  var CSS_PAPER_V1 = [
    '#' + OVERLAY_ID + ' .dfSheetPaper {',
    '  position: relative; width: min(620px, 100%); max-height: min(86vh, 860px); overflow: auto;',
    '  padding: 28px 26px 26px; box-sizing: border-box;',
    /* ⚠ assets/sheet_frame.png はまだ存在しない (#29 STEP4 = codex1 納品)。
       404 でも background-image が外れるだけで、下の background-color でシートは読める。 */
    '  background-color: #efe2c0; background-image: url("assets/sheet_frame.png");',
    '  background-size: 100% 100%; background-repeat: no-repeat;',
    '  border: 2px solid #7a5a2c; border-radius: 10px;',
    '  color: #2a2118; font-family: "Noto Serif JP", "MedievalSharp", serif;',
    '  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);',
    '}',
  ];

  /* ★#36 5E キャラクターシートの紙と 3 段組 (v2)。
   * ⚠⚠ 紙地は **タイル**なので background-size は 512px 固定で repeat。
   *    100% 100% にすると、区画数がページごとに違って紙の高さが変わるぶんだけ絵が歪む。
   * ⭐ assets/character-sheet/*.png は codex1 の納品待ち。
   *    404 でも background-color / border / border-image のフォールバックで**読める**。 */
  var CSS_V2 = [
    '#' + OVERLAY_ID + ' .dfSheetPaper {',
    '  position: relative; width: min(1040px, 100%); max-height: min(90vh, 1180px); overflow: auto;',
    '  padding: 30px 28px 26px; box-sizing: border-box;',
    '  background-color: #efe2c0;',
    '  background-image: url("assets/character-sheet/parchment.png");',
    '  background-size: 512px 512px; background-repeat: repeat;',
    '  border: 2px solid #7a5a2c; border-radius: 10px;',
    '  color: #2a2118; font-family: "Noto Serif JP", "Cinzel", serif;',
    '  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);',
    '  overflow-wrap: anywhere;',
    '}',
    /* 3 段 -> 2 段 -> 1 段。⚠ 判定はビューポート幅 (紙幅ではない)。 */
    '#' + OVERLAY_ID + ' .dfSheetCols {',
    '  display: grid; gap: 4px 18px; grid-template-columns: 1fr; align-items: start;',
    '}',
    '@media (min-width: 640px) { #' + OVERLAY_ID + ' .dfSheetCols { grid-template-columns: repeat(2, 1fr); } }',
    '@media (min-width: 920px) { #' + OVERLAY_ID + ' .dfSheetCols { grid-template-columns: repeat(3, 1fr); } }',
    '#' + OVERLAY_ID + ' .dfSheetCol { min-width: 0; }',
    '#' + OVERLAY_ID + ' .dfSheetHead { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }',
    '#' + OVERLAY_ID + ' .dfSheetHead .dfSheetName { flex: 0 0 auto; margin-right: 10px; font-size: 26px; }',
    /* ── 能力値ボックス: 実物と同じ「小さな見出し / 特大の修正値 / 下端の丸に生スコア」 ── */
    '#' + OVERLAY_ID + ' .dfSheetAbilBox {',
    '  display: block; position: relative; box-sizing: border-box;',
    '  margin: 0 0 20px; padding: 7px 6px 20px; text-align: center;',
    '  background: rgba(255, 255, 255, 0.30);',
    '  border: 2px solid rgba(122, 90, 44, 0.55); border-radius: 8px;',
    /* ⛔ fill を付けない — 付けると中央スライスも塗られて紙地が透けなくなる。 */
    '  border-image: url("assets/character-sheet/box_frame.png") 48 stretch;',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetAbilBox .ab {',
    '  display: block; font-size: 11px; letter-spacing: 2px; color: #6b4f2a;',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetAbilBox .mod { display: block; font-size: 30px; line-height: 1.1; }',
    '#' + OVERLAY_ID + ' .dfSheetAbilBox .sc {',
    '  position: absolute; left: 50%; bottom: -13px; transform: translateX(-50%);',
    '  min-width: 36px; height: 26px; line-height: 24px; box-sizing: border-box;',
    '  font-size: 13px; color: #2a2118; background: #efe2c0;',
    '  border: 1px solid rgba(122, 90, 44, 0.7); border-radius: 13px;',
    '}',
    /* ── 行リスト (セーヴ / 技能 / 攻撃 / 特徴) ── */
    '#' + OVERLAY_ID + ' .dfSheetRow {',
    '  display: flex; flex-wrap: wrap; align-items: baseline; gap: 7px; padding: 3px 4px; font-size: 13px;',
    '  border-bottom: 1px dotted rgba(122, 90, 44, 0.4);',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetRow .rp { flex: 0 0 12px; text-align: center; color: #6b4f2a; font-size: 12px; }',
    '#' + OVERLAY_ID + ' .dfSheetRow .rl { flex: 1 1 auto; min-width: 0; }',
    '#' + OVERLAY_ID + ' .dfSheetRow .rv { flex: 0 0 auto; margin-left: auto; font-size: 16px; }',
    '#' + OVERLAY_ID + ' .dfSheetRow .rs { flex: 0 0 100%; font-size: 11px; color: #6b4f2a; }',
    /* ── 数値の小箱 (AC / 先制 / 移動 / HP / 習熟) ── */
    '#' + OVERLAY_ID + ' .dfSheetStatBox {',
    '  display: inline-block; box-sizing: border-box; max-width: 100%;',
    '  min-width: 76px; margin: 0 6px 6px 0; padding: 6px 8px; text-align: center;',
    '  background: rgba(255, 255, 255, 0.30);',
    '  border: 1px solid rgba(122, 90, 44, 0.45); border-radius: 6px;',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetStatBox b { display: block; font-size: 11px; letter-spacing: 1px; color: #6b4f2a; }',
    '#' + OVERLAY_ID + ' .dfSheetStatBox .v { display: block; font-size: 19px; }',
    '#' + OVERLAY_ID + ' .dfSheetStatBox .s { display: block; font-size: 11px; color: #6b4f2a; }',
    /* ── 空の枠: まだ書き込んでいない紙。⛔ — や 0 を書かない (伏せたように見える) ── */
    '#' + OVERLAY_ID + ' .dfSheetBlank {',
    '  box-sizing: border-box; margin: 0 0 8px; padding: 6px 8px 12px;',
    '  background: rgba(255, 255, 255, 0.16);',
    '  border: 1px dashed rgba(122, 90, 44, 0.5); border-radius: 6px;',
    '}',
    '#' + OVERLAY_ID + ' .dfSheetBlank.inline { display: inline-block; min-width: 116px; margin-right: 6px; }',
    '#' + OVERLAY_ID + ' .dfSheetBlank b { display: block; font-size: 11px; letter-spacing: 1px; color: #6b4f2a; }',
    '#' + OVERLAY_ID + ' .dfSheetBlank .ln {',
    '  display: block; height: 0; margin-top: 10px;',
    '  border-bottom: 1px dotted rgba(122, 90, 44, 0.55);',
    '}',
  ].join('\n');

  var CSS = CSS_BASE.join('\n') + '\n' + (SHEET5E ? CSS_V2 : CSS_PAPER_V1.join('\n'));

  /* ★#36 §2-6 罠 E: 紙の CSS が "Noto Serif JP" を指しているのに、その <link> を持っているのは
   *   index.html だけだった (= 同じシートが 5 ページで違う書体で出ていた)。
   * ⭐ HTML を 1 枚も触らず、モジュール側から 1 本だけ注入して直す。
   *   既に在るページ (index) では何もしない。ページが増えても勝手に効く。
   * ⚠ 読めなくても serif へ落ちるだけ。⛔ ここで例外を投げてシートを道連れにしない。 */
  function ensureFont() {
    try {
      if (document.querySelector('link[href*="Noto+Serif+JP"]')) return;
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&display=swap";
      (document.head || document.documentElement).appendChild(l);
    } catch (e) { /* noop */ }
  }

  function ensureStyle() {
    ensureFont();
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* click 非発火端末が実在した (パーティ・マッチング演出のとき) ので touchend も併用する。
     ⚠ 両方発火する端末で 2 回開かないよう、touchend の直後の click は握り潰す。 */
  function onTap(el, fn) {
    var last = 0;
    el.addEventListener("click", function (ev) {
      if (Date.now() - last < 700) return;
      fn(ev);
    });
    el.addEventListener("touchend", function (ev) {
      last = Date.now();
      if (ev.cancelable) ev.preventDefault();
      fn(ev);
    }, { passive: false });
  }

  /* 置き場所は **ページ名ではなく「その DOM が在るか」** で決める (依頼書 §4-1)。
   *   1) #partyPanel が在る            → その中 (index.html。上下左右すべて既存 HUD が占有)
   *   2) #townHud が在り、表示中        → その中 (town.html の compact。下端全幅を HUD が占有)
   *   3) どちらでもない                 → body へ fixed (left:18px; bottom:18px; z-index:62)
   * ⚠ 2) に「表示中」の条件が要る: #townHud は body.compact のときだけ display:flex で、
   *   デスクトップでは display:none (town.html:270/291 実測)。中へ入れると押せなくなる。
   *   デスクトップの town は下端が空くので 3) が正しい。 */
  function pickHost() {
    var pp = document.getElementById("partyPanel");
    if (pp) return { host: pp, fixed: false, via: "partyPanel" };
    var hud = document.getElementById("townHud");
    if (hud && isDisplayed(hud)) return { host: hud, fixed: false, via: "townHud" };
    return { host: document.body, fixed: true, via: "body" };
  }

  var btnEl = null;
  var mountVia = null;

  function rehome() {
    if (!btnEl || !document.body) return;
    var pick = pickHost();
    if (!pick.host) return;
    if (btnEl.parentNode !== pick.host) pick.host.appendChild(btnEl);
    if (pick.fixed) btnEl.classList.add("dfSheetBtn-fixed");
    else btnEl.classList.remove("dfSheetBtn-fixed");
    mountVia = pick.via;
  }

  function ensureButton() {
    if (btnEl && btnEl.parentNode) { rehome(); return btnEl; }
    /* ⚠⚠ <button> にしないこと。tools/verify_town_map.js:661 (11b) が
       `#townHud button` を数えて「4 施設が押せる」を見ているので、HUD の中へ
       5 本目の <button> を足すとその golden が赤くなる (2026-08-28 実測)。 */
    btnEl = document.createElement("div");
    btnEl.id = BTN_ID;
    btnEl.setAttribute("role", "button");
    btnEl.setAttribute("tabindex", "0");
    btnEl.setAttribute("aria-label", "キャラクターシートを開く");
    btnEl.textContent = "📜 シート";
    onTap(btnEl, function () { toggle(); });
    btnEl.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
        ev.preventDefault(); toggle();
      }
    });
    rehome();
    return btnEl;
  }

  function ensureOverlay() {
    var ov = document.getElementById(OVERLAY_ID);
    if (ov) return ov;
    if (!document.body) return null;
    ov = document.createElement("div");
    ov.id = OVERLAY_ID;
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");

    var paper = document.createElement("div");
    paper.id = "dfSheetPaper";     // ★#36 (7d)(7e) が幅ごとに測る取っ手。見た目は変わらない
    paper.className = "dfSheetPaper";

    var closeEl = document.createElement("div");
    closeEl.className = "dfSheetClose";
    closeEl.setAttribute("role", "button");
    closeEl.setAttribute("tabindex", "0");
    closeEl.setAttribute("aria-label", "閉じる");
    closeEl.textContent = "✕";
    onTap(closeEl, function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); close(); });

    var bodyEl = document.createElement("div");
    bodyEl.id = BODY_ID;

    paper.appendChild(closeEl);
    paper.appendChild(bodyEl);
    ov.appendChild(paper);
    // 背景タップで閉じる (紙の上のタップでは閉じない)
    onTap(ov, function (ev) { if (ev && ev.target === ov) close(); });
    document.body.appendChild(ov);
    return ov;
  }

  function sectionEl(def, inner) {
    var sec = document.createElement("section");
    sec.id = def.id;
    sec.className = "dfSheetSec";
    if (def.label) {
      var h = document.createElement("h3");
      h.textContent = def.label;
      sec.appendChild(h);
    }
    sec.appendChild(inner);
    return sec;
  }
  function defOf(id) {
    for (var i = 0; i < SECTION_DEFS.length; i++) if (SECTION_DEFS[i].id === id) return SECTION_DEFS[i];
    return { id: id, label: "" };
  }
  function cell(title, value, sub) {
    var c = document.createElement("div");
    c.className = "dfSheetCell";
    var b = document.createElement("b"); b.textContent = title; c.appendChild(b);
    var v = document.createElement("div"); v.className = "v"; v.textContent = value; c.appendChild(v);
    if (sub) { var s = document.createElement("div"); s.textContent = sub; c.appendChild(s); }
    return c;
  }

  /* ★#36 5E シートの部品。⭐ どれも「data-* を名乗るのは 1 要素だけ」を守る
     (probeRealPage が document 全体から拾うので、二重に名乗ると母集団が汚れる)。 */
  function statBox(title, value, sub, statKey) {
    var c = document.createElement("div");
    c.className = "dfSheetStatBox";
    if (statKey) c.setAttribute("data-stat", statKey);
    var b = document.createElement("b"); b.textContent = title; c.appendChild(b);
    var v = document.createElement("div"); v.className = "v"; v.textContent = value; c.appendChild(v);
    if (sub) { var s = document.createElement("div"); s.className = "s"; s.textContent = sub; c.appendChild(s); }
    return c;
  }
  function rowEl(mark, label, value, sub) {
    var r = document.createElement("div");
    r.className = "dfSheetRow";
    if (mark !== null) { var p = document.createElement("span"); p.className = "rp"; p.textContent = mark; r.appendChild(p); }
    var l = document.createElement("span"); l.className = "rl"; l.textContent = label; r.appendChild(l);
    var v = document.createElement("span"); v.className = "rv"; v.textContent = value; r.appendChild(v);
    if (sub) { var s = document.createElement("span"); s.className = "rs"; s.textContent = sub; r.appendChild(s); }
    return r;
  }
  /* 空の枠。⛔ 中身に "—" / "0" / "-" を書かない (「取れなかった」に見える。依頼書 §5-3)。
     ⚠ id は BLANK_FIELD_IDS のホワイトリストに在るものだけ。無いものを名乗ると (6a) が赤。 */
  function blankBox(fieldId, title, inline) {
    var w = document.createElement("div");
    w.className = "dfSheetBlank" + (inline ? " inline" : "");
    w.setAttribute("data-blank", fieldId);
    var b = document.createElement("b"); b.textContent = title; w.appendChild(b);
    var n = inline ? 1 : 2;
    for (var i = 0; i < n; i++) {
      var ln = document.createElement("span"); ln.className = "ln"; w.appendChild(ln);
    }
    return w;
  }
  function wrapDiv(cls) {
    var e = document.createElement("div");
    if (cls) e.className = cls;
    return e;
  }

  /**
   * 中身だけ描き直す。
   * ⭐ 取れなかった区画は **appendChild しない** = 行ごと DOM に存在しない。
   *    空文字の要素を置くのは禁止 (依頼書 §2-4 / 負のコントロール blankrow)。
   * ★#36 ?sheet5e=0 のときは v1 (5 区画) をそのまま描く。
   */
  function render() { return SHEET5E ? renderV2() : renderV1(); }

  function renderV1() {
    var host = document.getElementById(BODY_ID);
    if (!host) return null;
    var d = collect();
    LAST_CLASS = d.classKey;
    var avail = {
      dfSheetSecHeader: true,
      dfSheetSecAbilities: !!d.abilities,
      dfSheetSecSkills: !!d.skills,
      dfSheetSecLanguages: !!(d.languages && d.languages.length),
      dfSheetSecBody: !!d.body,
    };

    while (host.firstChild) host.removeChild(host.firstChild);

    // ── 見出し
    if (avail.dfSheetSecHeader) {
      var head = document.createElement("div");
      var nm = document.createElement("div");
      nm.className = "dfSheetName";
      nm.textContent = d.className;
      head.appendChild(nm);
      var meta = document.createElement("div");
      meta.className = "dfSheetMeta";
      meta.textContent = "Lv " + d.level + "   累積 XP " + d.xp
        + (d.nextXp === null ? "   (最高位)" : "   次のレベルまで " + Math.max(0, d.nextXp - d.xp));
      head.appendChild(meta);
      host.appendChild(sectionEl(defOf("dfSheetSecHeader"), head));
    }

    // ── 能力値 (6 能力。CHA を含む)
    if (avail.dfSheetSecAbilities) {
      var g = document.createElement("div");
      g.className = "dfSheetGrid";
      for (var i = 0; i < d.abilities.length; i++) {
        var a = d.abilities[i];
        var c = cell(a.abbr, String(a.score), a.label + " " + signed(a.mod));
        c.setAttribute("data-ability", a.key);
        c.setAttribute("data-score", String(a.score));
        c.setAttribute("data-mod", String(a.mod));
        g.appendChild(c);
      }
      host.appendChild(sectionEl(defOf("dfSheetSecAbilities"), g));
    }

    // ── 技能 (SkillCheck が載っているページだけ)
    if (avail.dfSheetSecSkills) {
      var sg = document.createElement("div");
      sg.className = "dfSheetGrid";
      for (var j = 0; j < d.skills.length; j++) {
        var s = d.skills[j];
        var sc2 = cell(s.label + (s.prof ? " ◆" : ""), signed(s.score), "");
        sc2.setAttribute("data-skill", s.key);
        sc2.setAttribute("data-score", String(s.score));
        sc2.setAttribute("data-prof", s.prof ? "1" : "0");
        sg.appendChild(sc2);
      }
      host.appendChild(sectionEl(defOf("dfSheetSecSkills"), sg));
    }

    // ── 言語
    if (avail.dfSheetSecLanguages) {
      var lw = document.createElement("div");
      for (var k = 0; k < d.languages.length; k++) {
        var L = d.languages[k];
        var chip = document.createElement("span");
        chip.className = "dfSheetChip" + (L.fixed ? " fixed" : "");
        chip.setAttribute("data-lang", L.id);
        chip.setAttribute("data-fixed", L.fixed ? "1" : "0");
        chip.textContent = L.label;
        lw.appendChild(chip);
      }
      host.appendChild(sectionEl(defOf("dfSheetSecLanguages"), lw));
    }

    // ── 体 (index.html だけ)
    if (avail.dfSheetSecBody) {
      var bg = document.createElement("div");
      bg.className = "dfSheetGrid";
      bg.appendChild(cell("HP", d.body.hp + " / " + d.body.maxHp, ""));
      bg.appendChild(cell("AC", String(d.body.ac), ""));
      host.appendChild(sectionEl(defOf("dfSheetSecBody"), bg));
    }

    LAST_AVAIL = avail;
    return d;
  }

  /**
   * ★#36 5E キャラクターシート (11 区画 / 3 段組)。
   * ⭐ 「どの区画がどの段か」は SECTION_DEFS_V2 の col が唯一の正。ここは器を組むだけ。
   * ⚠ 中身が 1 つも無い段は **DOM に置かない** (置くと title/town/world で右に幅ぶんの余白が出る)。
   */
  function renderV2() {
    var host = document.getElementById(BODY_ID);
    if (!host) return null;
    var d = collect();
    LAST_CLASS = d.classKey;
    var b = d.body;                       // 供給口 (index だけが登録している)
    var avail = {
      dfSheetSecHeader:      true,
      dfSheetSecAbilities:   !!d.abilities,
      dfSheetSecProficiency: !!d.prof,
      dfSheetSecSaves:       !!(b && b.saves),
      dfSheetSecSkills:      !!d.skills,
      dfSheetSecCombat:      !!b,
      dfSheetSecBody:        !!b,
      dfSheetSecAttacks:     !!b,
      /* ⭐ 人物欄は **実データが 1 つも無い**。avail は false のまま置く。
         DOM には blank として出る = __state() の inDom === (avail || blank) を通る。 */
      dfSheetSecPersona:     false,
      dfSheetSecTraits:      !!d.traits,
      dfSheetSecLanguages:   !!(d.languages && d.languages.length),
    };

    while (host.firstChild) host.removeChild(host.firstChild);

    var inner = {};

    // ── 見出し帯 (全幅): 名前 = 職業名 / クラス & レベル / 背景 (空) / 属性 (空) / 経験点
    //    ⛔ 主人公に名前は無い。⛔ 種族の欄は作らない (本作に種族は無く、職業名を二度書くだけになる)。
    if (avail.dfSheetSecHeader) {
      var head = wrapDiv("dfSheetHead");
      var nm = wrapDiv("dfSheetName");
      nm.textContent = d.className;
      head.appendChild(nm);
      head.appendChild(statBox("クラス & レベル", d.className + " " + d.level, null, "level"));
      head.appendChild(blankBox("background", "背景", true));
      head.appendChild(blankBox("alignment", "属性", true));
      head.appendChild(statBox("経験点", String(d.xp),
        d.nextXp === null ? "最高位" : "次まで " + Math.max(0, d.nextXp - d.xp), "xp"));
      inner.dfSheetSecHeader = head;
    }

    // ── 能力値: 6 個を **縦 1 列** に積む (5E シートの顔)
    if (avail.dfSheetSecAbilities) {
      var ag = wrapDiv("");
      for (var i = 0; i < d.abilities.length; i++) {
        var a = d.abilities[i];
        var box = wrapDiv("dfSheetAbilBox");
        box.setAttribute("data-ability", a.key);
        box.setAttribute("data-score", String(a.score));
        box.setAttribute("data-mod", String(a.mod));
        var ab = document.createElement("span"); ab.className = "ab"; ab.textContent = a.label; box.appendChild(ab);
        var md = document.createElement("span"); md.className = "mod"; md.textContent = signed(a.mod); box.appendChild(md);
        var sc = document.createElement("span"); sc.className = "sc"; sc.textContent = String(a.score); box.appendChild(sc);
        ag.appendChild(box);
      }
      inner.dfSheetSecAbilities = ag;
    }

    // ── 習熟: インスピレーション (空) / 習熟ボーナス / 受動知覚
    if (avail.dfSheetSecProficiency) {
      var pg = wrapDiv("");
      pg.appendChild(blankBox("inspiration", "インスピレーション", false));
      pg.appendChild(statBox("習熟ボーナス", signed(d.prof.bonus), null, "profBonus"));
      pg.appendChild(statBox("受動知覚", String(d.prof.passive), "知覚", "passivePerception"));
      inner.dfSheetSecProficiency = pg;
    }

    // ── セーヴィングスロー: 実際に振られている値 (playerStats + 装備) が唯一の正。
    //    ⛔ DFAbilities.abilityMod() から出さない (依頼書 #36 §2-2 罠 A)。
    if (avail.dfSheetSecSaves) {
      var sg = wrapDiv("");
      for (var v = 0; v < SAVE_KEYS.length; v++) {
        var vk = SAVE_KEYS[v];
        var total = b.saves[vk] + b.saveBonus;
        var row = rowEl(null, SAVE_LABEL[vk], signed(total), b.saveBonus ? "装備 " + signed(b.saveBonus) : null);
        row.setAttribute("data-save", vk);
        row.setAttribute("data-mod", String(total));
        sg.appendChild(row);
      }
      inner.dfSheetSecSaves = sg;
    }

    // ── 技能: 行リスト。⚠ data-skill / data-score / data-prof は #29 の契約なので変えない。
    if (avail.dfSheetSecSkills) {
      var kg = wrapDiv("");
      for (var j = 0; j < d.skills.length; j++) {
        var s = d.skills[j];
        var srow = rowEl(s.prof ? "\u25CF" : "\u25CB", s.label, signed(s.score), null);
        srow.setAttribute("data-skill", s.key);
        srow.setAttribute("data-score", String(s.score));
        srow.setAttribute("data-prof", s.prof ? "1" : "0");
        kg.appendChild(srow);
      }
      inner.dfSheetSecSkills = kg;
    }

    // ── AC / 先制 / 移動速度。⛔ 移動を「30 フィート」と書かない (本作に距離単位は無い)。
    if (avail.dfSheetSecCombat) {
      var cg = wrapDiv("");
      cg.appendChild(statBox("アーマー・クラス", String(b.ac), null, "ac"));
      cg.appendChild(statBox("イニシアチブ",
        (typeof b.initiative === "number") ? signed(b.initiative) : "?", "d20 に加算", "initiative"));
      cg.appendChild(statBox("移動速度",
        (typeof b.speedTiles === "number") ? (b.speedTiles + " マス") : "1 マス", "1 手番あたり", "speed"));
      inner.dfSheetSecCombat = cg;
    }

    // ── ヒット・ポイント: 現在 / 最大 + 一時 HP・ヒットダイス・死亡セーヴ (全部 空)
    if (avail.dfSheetSecBody) {
      var bg = wrapDiv("");
      bg.appendChild(statBox("現在ヒット・ポイント", String(b.hp), null, "hp"));
      bg.appendChild(statBox("最大ヒット・ポイント", String(b.maxHp), null, "maxHp"));
      bg.appendChild(blankBox("tempHp", "一時ヒット・ポイント", false));
      bg.appendChild(blankBox("hitDice", "ヒットダイス", false));
      bg.appendChild(blankBox("deathSaves", "死亡セーヴ", false));
      inner.dfSheetSecBody = bg;
    }

    // ── 攻撃 & 呪文発動
    if (avail.dfSheetSecAttacks) {
      var xg = wrapDiv("");
      var wrow = rowEl(null, "武器", b.weaponName || "素手", b.armorName ? "防具 " + b.armorName : null);
      wrow.setAttribute("data-stat", "weapon");
      xg.appendChild(wrow);
      var arow = rowEl(null, "命中", (typeof b.atkBonus === "number") ? signed(b.atkBonus) : "?",
        (b.weaponRange === "ranged") ? "射程あり" : "近接");
      arow.setAttribute("data-stat", "atkBonus");
      xg.appendChild(arow);
      var dmg = (b.dmgDice || "?") + (b.dmgBonus ? signed(b.dmgBonus) : "");
      var crit = (typeof b.critRange === "number")
        ? ("クリティカル " + (b.critRange >= 20 ? "20" : b.critRange + "\u301C20")
           + (b.critMult ? " \u00D7" + b.critMult : ""))
        : null;
      var drow = rowEl(null, "ダメージ", dmg, crit);
      drow.setAttribute("data-stat", "damage");
      xg.appendChild(drow);
      inner.dfSheetSecAttacks = xg;
    }

    // ── 人物: 4 枠すべて空。⭐ #37 で文章が入ったら BLANK_FIELD_IDS から外すだけで済む形。
    var pergroup = wrapDiv("");
    pergroup.appendChild(blankBox("trait", "性格的特徴", false));
    pergroup.appendChild(blankBox("ideal", "理想", false));
    pergroup.appendChild(blankBox("bond", "絆", false));
    pergroup.appendChild(blankBox("flaw", "欠点", false));
    inner.dfSheetSecPersona = pergroup;

    // ── 特徴 & 特性: 立ち位置 / 役割 / 持ち味 / 構えている技 (index だけ)
    if (avail.dfSheetSecTraits) {
      var tg = wrapDiv("");
      var zrow = rowEl(null, "立ち位置", ZONE_LABEL[d.traits.zone] || d.traits.zone, null);
      zrow.setAttribute("data-stat", "zone"); tg.appendChild(zrow);
      var rrow = rowEl(null, "役割", d.traits.role || "", null);
      rrow.setAttribute("data-stat", "role"); tg.appendChild(rrow);
      var nrow = rowEl(null, "持ち味", d.traits.note || "", null);
      nrow.setAttribute("data-stat", "note"); tg.appendChild(nrow);
      if (b && b.skillNames && b.skillNames.length) {
        var krow = rowEl(null, "構えている技", b.skillNames.join(" / "), null);
        krow.setAttribute("data-stat", "skills"); tg.appendChild(krow);
      }
      inner.dfSheetSecTraits = tg;
    }

    // ── その他の習熟と言語: 言語チップ + 習熟している技能
    if (avail.dfSheetSecLanguages) {
      var lw = wrapDiv("");
      for (var k = 0; k < d.languages.length; k++) {
        var L = d.languages[k];
        var chip = document.createElement("span");
        chip.className = "dfSheetChip" + (L.fixed ? " fixed" : "");
        chip.setAttribute("data-lang", L.id);
        chip.setAttribute("data-fixed", L.fixed ? "1" : "0");
        chip.textContent = L.label;
        lw.appendChild(chip);
      }
      if (d.skills) {
        var profNames = [];
        for (var q = 0; q < d.skills.length; q++) if (d.skills[q].prof) profNames.push(d.skills[q].label);
        if (profNames.length) lw.appendChild(rowEl(null, "習熟している技能", profNames.join(" / "), null));
      }
      inner.dfSheetSecLanguages = lw;
    }

    // ── 器へ流し込む: 全幅の見出し帯 -> 3 段
    if (inner.dfSheetSecHeader) {
      host.appendChild(sectionEl(defOf("dfSheetSecHeader"), inner.dfSheetSecHeader));
    }
    var cols = wrapDiv("dfSheetCols");
    var placed = 0;
    for (var c = 0; c < COL_ORDER.length; c++) {
      var colId = COL_ORDER[c];
      var members = [];
      for (var m = 0; m < SECTION_DEFS.length; m++) {
        var def = SECTION_DEFS[m];
        if (def.col === colId && inner[def.id]) members.push(def);
      }
      if (!members.length) continue;      // ⭐ 中身が 0 の段は DOM に置かない (依頼書 §7 (7b))
      var colEl = wrapDiv("dfSheetCol");
      colEl.setAttribute("data-col", colId);
      for (var n = 0; n < members.length; n++) colEl.appendChild(sectionEl(members[n], inner[members[n].id]));
      cols.appendChild(colEl);
      placed++;
    }
    if (placed) host.appendChild(cols);

    LAST_AVAIL = avail;
    return d;
  }

  // ══ 開閉 ══════════════════════════════════════════════════════════════
  function open() {
    ensureStyle();
    var ov = ensureOverlay();
    if (!ov) return false;
    render();
    ov.classList.add("open");
    OPEN = true;
    return true;
  }
  function close() {
    var ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.classList.remove("open");
    OPEN = false;
    return true;
  }
  function isOpen() { return !!OPEN; }
  function toggle() { return isOpen() ? close() : open(); }

  /**
   * ⭐ 検証用シーム。**本番の描画結果から作る**。
   *   avail  … render() が「描ける」と判断したか (データ採取の結果そのもの)
   *   inDom  … 実際に DOM に居るか (描画の結果そのもの)
   *   ⭐ この 2 つを別々に返すことが肝。同じ値を 2 回返すと「空文字で描いた」欠陥を
   *     ドライバが原理的に検出できなくなる ((2c) が永久緑になる)。
   */
  function __state() {
    var host = document.getElementById(BODY_ID);
    var secs = [];
    for (var i = 0; i < SECTION_IDS.length; i++) {
      var id = SECTION_IDS[i];
      var el = host ? host.querySelector("#" + id) : null;
      secs.push({
        id: id,
        avail: !!(LAST_AVAIL && LAST_AVAIL[id]),
        /* ★#36: 「実データが原理的に無い」と **宣言済み** の空欄枠。avail とは排他。
           ⛔ (2c) を緩めるのではなく 3 値へ **広げる** ためのフラグ (依頼書 §2-4)。 */
        blank: BLANK_SECTION_IDS.indexOf(id) >= 0,
        inDom: !!el,
        textLen: el ? String(el.textContent || "").replace(/\s+/g, "").length : 0,
        /* ★#36: 「実データのセル」と「空欄枠のセル」を **別々に** 数える。
           これが無いと「実データのある区画を空欄枠へすり替えた」欠陥を検出できない。 */
        dataCells:  el ? el.querySelectorAll("[data-ability],[data-skill],[data-lang],[data-save],[data-stat]").length : 0,
        blankCells: el ? el.querySelectorAll("[data-blank]").length : 0,
      });
    }
    var shown = [], hidden = [], mismatch = [];
    for (var j = 0; j < secs.length; j++) {
      if (secs[j].inDom) shown.push(secs[j].id); else hidden.push(secs[j].id);
      /* ★#36: 規則は inDom === (avail || blank)。⛔ 緩めるのではなく広げる。
         avail と blank が **同時に真** = 「実データがあるのに空欄枠を名乗った」= 契約違反。 */
      var s3 = secs[j];
      if (s3.avail && s3.blank) mismatch.push(s3.id + "(avail&blank)");
      else if (s3.inDom !== (s3.avail || s3.blank)) mismatch.push(s3.id);
    }
    return {
      classKey: LAST_CLASS || heroClassKey(),
      open: isOpen(),
      rendered: LAST_AVAIL !== null,
      mountVia: mountVia,
      sectionIds: SECTION_IDS.slice(),
      sections: secs,
      shown: shown,
      hidden: hidden,
      mismatch: mismatch,
    };
  }

  // ══ 起動 ══════════════════════════════════════════════════════════════
  function mount() {
    if (!document.body) return;
    ensureStyle();
    ensureButton();
    ensureOverlay();
  }
  function boot() {
    mount();
    /* #townHud は town.html 側の JS が後から中身を入れ、compact 判定も後で決まる。
       レイアウトが落ち着いたところで置き場所を測り直す。 */
    try { global.setTimeout(rehome, 0); } catch (e) {}
    try { global.addEventListener("load", rehome); } catch (e) {}
    try { global.addEventListener("resize", rehome); } catch (e) {}
    try { global.addEventListener("orientationchange", rehome); } catch (e) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("keydown", function (ev) {
    if (isOpen() && (ev.key === "Escape" || ev.key === "Esc")) { ev.preventDefault(); close(); }
  });

  global.DFSheet = {
    LANGUAGES: LANGUAGES,
    CLASS_LANGUAGES: CLASS_LANGUAGES,
    CLASS_LABELS: CLASS_LABELS,
    XP_THRESHOLDS: XP_THRESHOLDS,
    SECTION_IDS: SECTION_IDS,
    SECTION_COLS: SECTION_COLS,            // ★#36 3 段組の割り付け表 (id -> full/A/B/C)
    BLANK_SECTION_IDS: BLANK_SECTION_IDS,  // ★#36 空欄枠のホワイトリスト (区画)
    BLANK_FIELD_IDS: BLANK_FIELD_IDS,      // ★#36 空欄枠のホワイトリスト (セル)
    SHEET5E: SHEET5E,                      // ★#36 撤退スイッチの現在値
    LANG_KEY: LANG_KEY,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    render: render,
    languagesOf: languagesOf,
    heroClassKey: heroClassKey,
    classLabel: classLabel,
    levelFromXp: levelFromXp,
    setBodyProvider: setBodyProvider,
    __body: bodyStats,                     // ★#36 検証シーム: 供給口を通した「体」の生値
    __state: __state,
    __rehome: rehome,
  };
})(typeof window !== "undefined" ? window : this);
