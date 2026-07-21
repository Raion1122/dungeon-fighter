/*
 * js/skill-check.js — 技能判定（知覚チェック等）エンジン v2
 * ------------------------------------------------------------------
 * skill-check-spec.md v2 の実装。d20 + 能力修正値 + 習熟ボーナス ≧ DC。
 *
 * ★ 共有モジュール: index.html / tavern.html の両方から
 *      <script src="js/skill-check.js"></script>
 *   で読み込む。インライン重複させず、変更は本ファイル1か所で済ませる。
 *   （旧来の「両HTMLに同一定義あり・変更時は両方同期」を本ファイルへ集約）
 *
 * DOM/ゲーム状態に非依存のコア（§1〜§8）+ 薄い d20 パネルUI（§9〜§10）。
 * ゲーム側からは party 配列・dc・opts を渡すだけ。voice() 等は存在チェックで呼ぶ。
 *
 * 公開API: window.SkillCheck
 *   - resolveSkillCheck(checkKey, dc, party, opts) -> Promise<outcome|null>
 *   - selectRepresentative(party, checkDef) -> member|null
 *   - selectHelper(party, checkDef, rep) -> member|null   （代表者を除く補助役1名・Help用）
 *   - checkScore(member, checkDef) -> number
 *   - abilityModifier(score) -> number
 *   - CLASS_ABILITIES / CLASS_PROFICIENCIES / CHECKS / DC_TIERS / PROFICIENCY_BONUS / HELP_BONUS
 *
 * outcome = { success, roll, total, dc, bonus, rep, helper, crit, fumble }
 */
(function (global) {
  "use strict";

  // === §2 能力修正値（B/X準拠。5e式 (値-10)/2 は使わない） =============
  function abilityModifier(score) {
    if (score <= 3) return -3;
    if (score <= 5) return -2;
    if (score <= 8) return -1;
    if (score <= 12) return 0;
    if (score <= 15) return 1;
    if (score <= 17) return 2;
    return 3; // 18
  }

  // === §3 職業固定能力値（生値 3〜18・全6能力） =======================
  // これが本システム唯一の新規キャラデータ。index.html の CLASS_DEFS が持つ
  // 「戦闘用の修正値（str:3 等・CHA無し）」とは別物なので混同しないこと。
  var CLASS_ABILITIES = {
    warrior: { str: 15, dex: 11, con: 14, int: 9,  wis: 10, cha: 11 },
    dwarf:   { str: 14, dex: 9,  con: 15, int: 10, wis: 13, cha: 9  },
    rogue:   { str: 10, dex: 15, con: 11, int: 13, wis: 12, cha: 12 },
    elf:     { str: 10, dex: 14, con: 10, int: 14, wis: 13, cha: 12 },
    cleric:  { str: 12, dex: 9,  con: 13, int: 11, wis: 15, cha: 13 },
    mage:    { str: 9,  dex: 11, con: 10, int: 15, wis: 13, cha: 11 },
  };

  // === §4 クラス別習熟（race = class）・習熟ボーナス一律 +2 ============
  var PROFICIENCY_BONUS = 2;
  // Help（手伝い）固定加算。5e Help アクション翻案。代表者以外から最大1名分のみ付与し、
  // 人数が何人いても1名分で頭打ち（クランプ）＝人数インフレ防止。値は習熟ボーナスと同スケール。
  var HELP_BONUS = 2;
  var CLASS_PROFICIENCIES = {
    warrior: ["athletics", "intimidation"],
    dwarf:   ["perception", "constitution"],
    rogue:   ["sleightOfHand", "stealth", "investigation"],
    elf:     ["perception", "arcana"],
    cleric:  ["insight", "religion"],
    mage:    ["arcana", "history"],
  };

  // === §5 判定種別マスタ ==============================================
  var CHECKS = {
    perception:    { label: "知覚",       ability: "wis", profKey: "perception" },
    investigation: { label: "捜査",       ability: "int", profKey: "investigation" },
    sleightOfHand: { label: "手先の早業", ability: "dex", profKey: "sleightOfHand" },
    stealth:       { label: "隠密",       ability: "dex", profKey: "stealth" },
    athletics:     { label: "運動",       ability: "str", profKey: "athletics" },
    arcana:        { label: "魔法学",     ability: "int", profKey: "arcana" },
    history:       { label: "歴史",       ability: "int", profKey: "history" },
    religion:      { label: "宗教",       ability: "wis", profKey: "religion" },
    insight:       { label: "看破",       ability: "wis", profKey: "insight" },
    persuasion:    { label: "説得",       ability: "cha", profKey: "persuasion" },
    intimidation:  { label: "威圧",       ability: "cha", profKey: "intimidation" },
    deception:     { label: "ペテン",     ability: "cha", profKey: "deception" },
  };

  // === §6 DC段階表（5e標準・5刻み） ==================================
  var DC_TIERS = { veryEasy: 5, easy: 10, medium: 15, hard: 20, veryHard: 25 };

  // 技能判定パネル表示後、タップ無しで自動ロールするまでの待機(ms)。オートバトルのハンズフリー化用。
  var AUTO_ROLL_MS = 2000;

  // === §7 代表者自動選出（formationソート方針流用・classKey参照） ======
  // 装備由来の技能ボーナス。member.skillBonus = { <checkKey>: N }（呼び出し側が装備から合算して渡す）。
  // ★ opts.extraBonus と違い「持ち主にしか乗らない」。これが重要で、extraBonus は代表者へ無条件に
  //   加算されるため「装備していない者が代表になると、その人にボーナスが乗る」嘘が起きる。
  //   個人に持たせることで ①持ち主だけ上がる ②代表者の選出そのものが装備で変わる の両方が成立する。
  function itemBonus(member, checkDef) {
    if (!member || !checkDef || !member.skillBonus) return 0;
    var v = member.skillBonus[checkDef.profKey];
    return (typeof v === "number" && isFinite(v)) ? v : 0;
  }
  function checkScore(member, checkDef) {
    if (!member || !checkDef) return 0;
    var ab = CLASS_ABILITIES[member.classKey];
    if (!ab) return 0;
    var mod = abilityModifier(ab[checkDef.ability]);
    var profs = CLASS_PROFICIENCIES[member.classKey] || [];
    var prof = profs.indexOf(checkDef.profKey) >= 0 ? PROFICIENCY_BONUS : 0;
    return mod + prof + itemBonus(member, checkDef);
  }

  // 修正値の内訳（パネルの代表行で内訳表示するため）。total（extra=0,help=0）は checkScore と一致。
  // 第4引数 helpBonus は省略可（既存3引数呼び出しは help=0 で従来通り＝後方互換）。
  var ABILITY_ABBR = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
  function checkScoreBreakdown(member, checkDef, extraBonus, helpBonus) {
    var ab = member ? CLASS_ABILITIES[member.classKey] : null;
    var abilityMod = (ab && checkDef) ? abilityModifier(ab[checkDef.ability]) : 0;
    var profs = (member && CLASS_PROFICIENCIES[member.classKey]) || [];
    var prof = (checkDef && profs.indexOf(checkDef.profKey) >= 0) ? PROFICIENCY_BONUS : 0;
    var item = ab ? itemBonus(member, checkDef) : 0;   // checkScore と同じく未知クラスは 0 で揃える
    var extra = extraBonus || 0;
    var help = helpBonus || 0;
    return {
      abilityKey: checkDef ? checkDef.ability : "",
      abilityAbbr: (checkDef && ABILITY_ABBR[checkDef.ability]) || "",
      abilityMod: abilityMod, prof: prof, item: item, extra: extra, help: help,
      total: abilityMod + prof + item + extra + help,
    };
  }

  // party: [{classKey, name, isHero?}]（隊列順）。該当能力の最大を自動選出。
  // 同点は配列順（既存 orderFormation の安定ソート挙動に一致）。
  function selectRepresentative(party, checkDef) {
    if (!party || !party.length) return null;
    return party
      .map(function (m, i) { return { m: m, i: i }; })
      .sort(function (a, b) {
        var diff = checkScore(b.m, checkDef) - checkScore(a.m, checkDef);
        return diff !== 0 ? diff : a.i - b.i;
      })[0].m;
  }

  // 代表者(rep)を除く最良メンバー1名を補助役(Help)に選ぶ。該当能力の checkScore 最大、
  // 同点は配列順（> 比較で先頭優先＝selectRepresentative のタイブレークに一致）。party 2名未満なら null。
  // ★ ここで1名だけ返すことが「Help は最大1名分でクランプ」の構造的担保（人数が増えても加算は1回）。
  function selectHelper(party, checkDef, rep) {
    if (!party || party.length < 2) return null;
    var best = null, bestScore = -Infinity;
    for (var k = 0; k < party.length; k++) {
      var m = party[k];
      if (m === rep) continue;
      var s = checkScore(m, checkDef);
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  // === §8 判定フロー =================================================
  function d20() { return 1 + Math.floor(Math.random() * 20); }

  function resolveDc(dc) {
    if (typeof dc === "number" && isFinite(dc)) return dc;
    if (typeof dc === "string" && DC_TIERS[dc] != null) return DC_TIERS[dc];
    return DC_TIERS.medium; // フォールバック=15
  }

  // クリティカル/ファンブル規則: ナチュ20=自動成功、ナチュ1=自動失敗。
  function computeOutcome(roll, bonus, dcNum) {
    var total = roll + bonus;
    var crit = roll === 20;
    var fumble = roll === 1;
    var success = crit || (!fumble && total >= dcNum);
    return { roll: roll, bonus: bonus, total: total, dc: dcNum,
             success: success, crit: crit, fumble: fumble };
  }

  function pickVoiceId(voiceIds, outcome) {
    if (!voiceIds) return null;
    if (outcome.crit && voiceIds.crit) return voiceIds.crit;
    if (outcome.fumble && voiceIds.fumble) return voiceIds.fumble;
    return outcome.success ? (voiceIds.success || null) : (voiceIds.fail || null);
  }
  function playVoice(id) {
    try {
      if (id && global.GameAudio && global.GameAudio.playVoice) global.GameAudio.playVoice(id);
    } catch (e) {}
  }

  // === §8.5 コンテキストアイコン・マスタ（表示層のみ・判定ロジック非関与） ====
  // opts.iconContext（"treasure"/"trap" 等）で引き、パネル上部に対象物のサムネを出す。
  // mechanics（checkKey）ではなく「何を相手にしているか」で分離する設計＝相手が宝箱なら
  // 開錠でも捜査でも同じ treasure を再利用できる。ただし v1 の配線は開錠(→treasure)と
  // 知覚/罠探知(→trap)の2箇所のみで、捜査判定には意図的に出さない（ユーザー決定）。
  // 未登録・未指定・ロード失敗 → アイコン領域ごと非表示（判定は必ず進行）。
  // 既存アセット（背景不透明）を枠付きサムネ化して肖像として見せる。将来 door/perception 等は
  // ここへエントリ追加＋画像を置くだけで拡張可（呼び出し側は iconContext を1つ渡すのみ）。
  var SKILL_CHECK_ICONS = {
    treasure: { src: "assets/chest.png", alt: "宝箱" },
    trap:     { src: "assets/trap.png",  alt: "罠" },
  };

  // === §9 出目アニメ + パネルUI（CSS/Canvas 2D・iOS Safari配慮・3D不使用） ==
  var STYLE_ID = "skillCheckStyles";
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = [
      "#skillCheckOverlay{position:fixed;inset:0;z-index:105;display:none;",
      "  align-items:center;justify-content:center;background:rgba(8,6,2,0.55);",
      "  font-family:'Noto Serif JP',serif;-webkit-tap-highlight-color:transparent;}",
      "#skillCheckOverlay.show{display:flex;}",
      "#skillCheckCard{width:min(420px,90vw);background:linear-gradient(180deg,#f5e8c8 0%,#e8d4a0 55%,#dcc68e 100%);",
      "  border:6px solid #6a4010;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.6);",
      "  padding:18px 20px 16px;text-align:center;color:#3a2208;}",
      // コンテキストアイコン（対象物のサムネ・上部中央）。既定 display:none、
      //   iconContext があれば showPanelAndRoll が block 表示。.scDie と同系の茶枠+角丸でトンマナ統一。
      "#skillCheckCard .scIcon{display:none;width:56px;height:56px;margin:2px auto 10px;",
      "  border:3px solid #6a4010;border-radius:8px;object-fit:contain;",
      "  background:rgba(106,64,16,.10);box-shadow:0 2px 6px rgba(0,0,0,.35);}",
      "#skillCheckCard .scTitle{font-size:18px;font-weight:700;letter-spacing:.04em;}",
      "#skillCheckCard .scFlavor{font-size:13px;margin:6px 0 10px;color:#5a3a16;line-height:1.5;}",
      "#skillCheckCard .scMeta{font-size:14px;margin-bottom:12px;color:#4a2c0c;}",
      "#skillCheckCard .scMeta b{font-size:16px;}",
      // パーティ全員ロール表示のロスター（代表=判定行 / 参考行=非rep・グレー）
      "#skillCheckCard .scRoster{display:flex;flex-direction:column;gap:6px;margin:8px 0 12px;}",
      "#skillCheckCard .scRow{display:grid;grid-template-columns:1fr auto 38px 46px;align-items:center;",
      "  gap:8px;padding:5px 8px;border-radius:6px;background:rgba(106,64,16,.06);}",
      "#skillCheckCard .scRow.rep{background:rgba(220,180,30,.18);border:1px solid #caa21a;font-weight:700;}",
      "#skillCheckCard .scRow.ref{opacity:.6;color:#6a5a3a;}",
      // 補助役（Help）行: 参考行よりやや明るく、緑系でわずかに強調（.ref より後に置き opacity/色を上書き）
      "#skillCheckCard .scRow.helper{opacity:.88;color:#3a4a32;background:rgba(40,120,80,.12);border:1px solid rgba(40,120,80,.35);}",
      "#skillCheckCard .scName{text-align:left;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      "#skillCheckCard .scMod{font-size:11px;color:#5a3a16;white-space:nowrap;}",
      "#skillCheckCard .scRow.ref .scMod{color:#7a6a4a;}",
      ".scDie{width:34px;height:34px;border-radius:7px;justify-self:center;",
      "  background:radial-gradient(circle at 38% 32%,#fff 0%,#e9e2cf 55%,#c9bb95 100%);",
      "  border:3px solid #6a4010;display:flex;align-items:center;justify-content:center;",
      "  font-size:18px;font-weight:800;color:#3a2208;transform:rotate(0) scale(1);",
      "  transition:transform .18s cubic-bezier(.25,.46,.45,.94);image-rendering:auto;}",
      ".scDie.spin{transform:rotate(-6deg) scale(1.08);}",
      ".scDie.win{border-color:#1f7a2e;color:#125b22;box-shadow:0 0 10px rgba(34,160,60,.7);}",
      ".scDie.lose{border-color:#9a2222;color:#7a1414;box-shadow:0 0 10px rgba(170,40,40,.6);}",
      ".scDie.crit{border-color:#caa21a;color:#8a6a00;box-shadow:0 0 14px rgba(220,180,30,.9);}",
      ".scDie.fumble{border-color:#5a5a5a;color:#444;}",
      "#skillCheckCard .scTotal{font-size:15px;font-weight:700;text-align:right;}",
      "#skillCheckCard .scRow.ref .scTotal{color:#8a7a5a;font-weight:600;}",
      "#skillCheckCard .scResult{font-size:15px;min-height:22px;font-weight:700;margin-bottom:6px;}",
      "#skillCheckCard .scResult.win{color:#137a26;}",
      "#skillCheckCard .scResult.lose{color:#8a1717;}",
      "#skillCheckCard .scHint{font-size:12px;color:#6a4a22;margin-top:4px;}",
      "#scRollBtn{margin-top:8px;padding:8px 22px;font-family:inherit;font-size:15px;font-weight:700;",
      "  background:#6a4010;color:#f5e8c8;border:none;border-radius:6px;cursor:pointer;}",
      "#scRollBtn:hover{background:#7d4d14;}",
    ].join("\n");
    document.head.appendChild(st);
  }

  function ensurePanel() {
    var ov = document.getElementById("skillCheckOverlay");
    if (ov) return ov;
    ov = document.createElement("div");
    ov.id = "skillCheckOverlay";
    ov.innerHTML =
      '<div id="skillCheckCard">' +
        '<img class="scIcon" alt="">' +
        '<div class="scTitle"></div>' +
        '<div class="scFlavor"></div>' +
        '<div class="scMeta"></div>' +
        '<div class="scRoster"></div>' +
        '<div class="scResult"></div>' +
        '<button id="scRollBtn" type="button">ロール (タップ / Enter)</button>' +
        '<div class="scHint"></div>' +
      '</div>';
    document.body.appendChild(ov);
    return ov;
  }

  // d20 を高速切替→停止。最終出目は1回だけ確定し、表示と一致させる。
  function animateD20(dieEl, finalVal) {
    return new Promise(function (resolve) {
      var ticks = 0;
      var totalTicks = 16 + Math.floor(Math.random() * 6); // 16〜21
      dieEl.classList.add("spin");
      var iv = setInterval(function () {
        ticks++;
        if (ticks >= totalTicks) {
          clearInterval(iv);
          dieEl.textContent = String(finalVal); // 確定値を表示
          dieEl.classList.remove("spin");
          setTimeout(resolve, 180);
        } else {
          dieEl.textContent = String(1 + Math.floor(Math.random() * 20));
        }
      }, 60);
    });
  }

  // 修正値の表示文字列。代表行は内訳（例 WIS+1 習+2 助+2 技+2 (+7)）、参考行は (+N) のみ。
  function fmtMod(bd, isRep) {
    var sgn = function (n) { return (n >= 0 ? "+" : "") + n; };
    var totalStr = "(" + sgn(bd.total) + ")";
    if (!isRep) return totalStr;
    var parts = [];
    if (bd.abilityAbbr) parts.push(bd.abilityAbbr + sgn(bd.abilityMod));
    if (bd.prof) parts.push("習" + sgn(bd.prof));
    if (bd.item) parts.push("装" + sgn(bd.item));   // 装備由来 (軽業師の革装束など)
    if (bd.help) parts.push("助" + sgn(bd.help));   // 補助役からの Help ボーナス
    if (bd.extra) parts.push("技" + sgn(bd.extra));
    return (parts.length ? parts.join(" ") + " " : "") + totalStr;
  }
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // roster: [{member, name, isRep, isHelper, breakdown}]（隊列順）。全行が d20 を振る演出を出すが、
  // 成否は rep（isRep=true）の1ロールのみで決まる。非rep の出目は表示専用で contract 非関与。
  // isHelper=true は補助役（Help・最大1名）。バッジ表示のみで、Help ボーナスは rep の breakdown に乗る。
  function showPanelAndRoll(checkDef, dcNum, rep, bonus, roster, opts) {
    return new Promise(function (resolve) {
      ensureStyles();
      var ov = ensurePanel();
      var card = ov.querySelector("#skillCheckCard");
      var iconEl = card.querySelector(".scIcon");
      var titleEl = card.querySelector(".scTitle");
      var flavorEl = card.querySelector(".scFlavor");
      var metaEl = card.querySelector(".scMeta");
      var rosterEl = card.querySelector(".scRoster");
      var resultEl = card.querySelector(".scResult");
      var hintEl = card.querySelector(".scHint");
      var btn = ov.querySelector("#scRollBtn");

      // コンテキストアイコン（表示層のみ）。iconContext がマスタにあれば上部に肖像を出し、
      //   無指定・未登録・ロード失敗（onerror）は領域ごと非表示。判定進行は絶対にブロックしない。
      //   パネルは使い回されるため、毎回 display を明示リセットして前回の残像を防ぐ。
      if (iconEl) {
        var iconDef = (opts.iconContext && SKILL_CHECK_ICONS[opts.iconContext]) || null;
        if (iconDef && iconDef.src) {
          iconEl.onerror = function () { iconEl.style.display = "none"; };
          iconEl.alt = iconDef.alt || "";
          iconEl.src = iconDef.src;
          iconEl.style.display = "block";
        } else {
          iconEl.onerror = null;
          iconEl.removeAttribute("src");
          iconEl.alt = "";
          iconEl.style.display = "none";
        }
      }
      titleEl.textContent = opts.title || (checkDef.label + "判定");
      flavorEl.textContent = opts.flavor || "";
      flavorEl.style.display = opts.flavor ? "" : "none";
      var sign = bonus >= 0 ? "+" + bonus : String(bonus);
      var helperRow = (roster || []).filter(function (r) { return r.isHelper; })[0];
      var helperPart = helperRow ? " ／ 補助 " + escHtml(helperRow.name) : "";
      metaEl.innerHTML = checkDef.label + " <b>DC " + dcNum + "</b> ／ 代表 " +
        escHtml(rep.name || "—") + helperPart + " ／ ボーナス " + sign;
      // ロスター行を生成（人数可変・隊列順）。空なら代表のみの1行へフォールバック。
      if (!roster || !roster.length) {
        roster = [{ member: rep, name: (rep && rep.name) || "—", isRep: true, isHelper: false,
          breakdown: { abilityAbbr: "", abilityMod: 0, prof: 0, item: 0, extra: 0, help: 0, total: bonus } }];
      }
      rosterEl.innerHTML = "";
      roster.forEach(function (r) {
        var row = document.createElement("div");
        row.className = "scRow " + (r.isRep ? "rep" : (r.isHelper ? "ref helper" : "ref"));
        row.innerHTML =
          '<span class="scName">' + (r.isRep ? "★ " : (r.isHelper ? "🤝 " : "")) + escHtml(r.name) + "</span>" +
          '<span class="scMod">' + fmtMod(r.breakdown, r.isRep) + "</span>" +
          '<span class="scDie">?</span>' +
          '<span class="scTotal"></span>';
        rosterEl.appendChild(row);
        r.dieEl = row.querySelector(".scDie");
        r.totalEl = row.querySelector(".scTotal");
      });
      resultEl.textContent = "";
      resultEl.className = "scResult";
      hintEl.textContent = "";
      btn.style.display = "";
      ov.classList.add("show");
      // オートバトル: タップ無しでも一定時間後に自動ロール開始（phase0のままなら）。
      ov._autoRollTimer = setTimeout(function () {
        if (phase === 0) { onAct(); }
      }, AUTO_ROLL_MS);

      var phase = 0; // 0=待ロール 1=演出中 2=結果表示
      var keyHandler = function (ev) {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
          ev.preventDefault(); ev.stopPropagation(); onAct();
        }
      };
      function cleanup() {
        ov.classList.remove("show");
        ov.removeEventListener("click", onAct);
        document.removeEventListener("keydown", keyHandler, true);
        btn.onclick = null;
        if (ov._dismissTimer) { clearTimeout(ov._dismissTimer); ov._dismissTimer = null; }
        if (ov._autoRollTimer) { clearTimeout(ov._autoRollTimer); ov._autoRollTimer = null; }
      }
      function onAct() {
        if (ov._autoRollTimer) { clearTimeout(ov._autoRollTimer); ov._autoRollTimer = null; }
        if (phase === 0) { roll(); }
        else if (phase === 2) { var o = ov._outcome; cleanup(); resolve(o); }
      }
      function roll() {
        phase = 1;
        btn.style.display = "none";
        hintEl.textContent = "";
        // ★ 代表の確定値だけが成否を決める。非rep は表示専用に別途 d20 を振る。
        var repFinal = d20();
        roster.forEach(function (r) {
          r.refRoll = r.isRep ? repFinal : d20();
          r.refTotal = r.refRoll + r.breakdown.total;
        });
        // 全行のダイスを一斉アニメ（並列なので尺は行数に依らず一定）。
        Promise.all(roster.map(function (r) {
          return animateD20(r.dieEl, r.refRoll);
        })).then(function () {
          var outcome = computeOutcome(repFinal, bonus, dcNum);  // ★ 引数は rep のみ
          ov._outcome = outcome;
          roster.forEach(function (r) {
            if (r.totalEl) r.totalEl.textContent = String(r.refTotal);
            if (!r.isRep || !r.dieEl) return;
            // 代表行のダイスのみ成否で色分け（参考行は無色）。
            if (outcome.crit) r.dieEl.classList.add("crit", "win");
            else if (outcome.fumble) r.dieEl.classList.add("fumble", "lose");
            else r.dieEl.classList.add(outcome.success ? "win" : "lose");
          });
          var head = outcome.crit ? "クリティカル成功!" :
                     outcome.fumble ? "ファンブル…" :
                     outcome.success ? "成功" : "失敗";
          resultEl.textContent = head + "　（" + outcome.roll + (bonus >= 0 ? "+" : "") + bonus +
            " = " + outcome.total + " vs DC " + dcNum + "）";
          resultEl.classList.add(outcome.success ? "win" : "lose");
          playVoice(pickVoiceId(opts.voiceIds, outcome));
          phase = 2;
          hintEl.textContent = "タップで閉じる";
          // 自動でも閉じる保険（タップ無しでも進む）
          ov._dismissTimer = setTimeout(function () {
            if (phase === 2) { var o = ov._outcome; cleanup(); resolve(o); }
          }, 2200);
        });
      }
      ov.addEventListener("click", onAct);
      document.addEventListener("keydown", keyHandler, true);
      btn.onclick = function (e) { e.stopPropagation(); onAct(); };
    });
  }

  // === エントリ: resolveSkillCheck ===================================
  // checkKey: CHECKS のキー / dc: 数値 or DC_TIERS のキー / party: [{classKey,name}]
  // opts: { extraBonus, voiceIds:{success,fail,crit,fumble}, title, flavor, auto }
  function resolveSkillCheck(checkKey, dc, party, opts) {
    opts = opts || {};
    var checkDef = CHECKS[checkKey];
    if (!checkDef) { try { console.warn("[SkillCheck] unknown check:", checkKey); } catch (e) {} return Promise.resolve(null); }
    var dcNum = resolveDc(dc);
    var rep = selectRepresentative(party, checkDef);
    if (!rep) return Promise.resolve(null);
    // 代表者以外から最大1名の補助役（Help）を選び、いれば固定 +HELP_BONUS を代表の判定へ加算。
    // selectHelper が1名しか返さないため、人数が何人いても Help は1名分で頭打ち（クランプ）。
    var helper = selectHelper(party, checkDef, rep);
    var helpBonus = helper ? HELP_BONUS : 0;
    var bonus = checkScore(rep, checkDef) + (opts.extraBonus || 0) + helpBonus;

    // 表示専用ロスター（成否には一切関与しない）。隊列順を保持。
    // extraBonus（例: 知覚の find-traps +2）と helpBonus は代表行だけに乗せる（参考行に乗せると誤解を生む）。
    var roster = (party || []).map(function (m) {
      var isRep = (m === rep);
      var isHelper = (m === helper);
      var bd = checkScoreBreakdown(m, checkDef, isRep ? (opts.extraBonus || 0) : 0, isRep ? helpBonus : 0);
      return { member: m, name: m.name || "—", isRep: isRep, isHelper: isHelper, breakdown: bd };
    });

    // autoplay / headless: UIを出さず即ロールで解決（showChoice と同じ方針）
    if (global.__autoplay || opts.auto) {
      var o = computeOutcome(d20(), bonus, dcNum);
      o.rep = rep;
      o.helper = helper || null;
      try { console.log("[AUTOPLAY] skillCheck", checkKey, "dc", dcNum, "->", o.success ? "成功" : "失敗"); } catch (e) {}
      return Promise.resolve(o);
    }
    return showPanelAndRoll(checkDef, dcNum, rep, bonus, roster, opts).then(function (o) {
      if (o) { o.rep = rep; o.helper = helper || null; }
      return o;
    });
  }

  global.SkillCheck = {
    abilityModifier: abilityModifier,
    CLASS_ABILITIES: CLASS_ABILITIES,
    CLASS_PROFICIENCIES: CLASS_PROFICIENCIES,
    PROFICIENCY_BONUS: PROFICIENCY_BONUS,
    HELP_BONUS: HELP_BONUS,
    CHECKS: CHECKS,
    DC_TIERS: DC_TIERS,
    AUTO_ROLL_MS: AUTO_ROLL_MS,   // 自動ロール待機(ms)。休憩スクロールプロンプトの自動スキップ等が共有参照する。
    checkScore: checkScore,
    selectRepresentative: selectRepresentative,
    selectHelper: selectHelper,
    resolveSkillCheck: resolveSkillCheck,
    // テスト/内部用
    checkScoreBreakdown: checkScoreBreakdown,
    _checkScoreBreakdown: checkScoreBreakdown,
    _itemBonus: itemBonus,
    _computeOutcome: computeOutcome,
    _resolveDc: resolveDc,
    _d20: d20,
  };
})(window);
