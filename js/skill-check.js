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
 *   - checkScore(member, checkDef) -> number
 *   - abilityModifier(score) -> number
 *   - CLASS_ABILITIES / CLASS_PROFICIENCIES / CHECKS / DC_TIERS / PROFICIENCY_BONUS
 *
 * outcome = { success, roll, total, dc, bonus, rep, crit, fumble }
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

  // === §7 代表者自動選出（formationソート方針流用・classKey参照） ======
  function checkScore(member, checkDef) {
    if (!member || !checkDef) return 0;
    var ab = CLASS_ABILITIES[member.classKey];
    if (!ab) return 0;
    var mod = abilityModifier(ab[checkDef.ability]);
    var profs = CLASS_PROFICIENCIES[member.classKey] || [];
    var prof = profs.indexOf(checkDef.profKey) >= 0 ? PROFICIENCY_BONUS : 0;
    return mod + prof;
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
      "#skillCheckCard .scTitle{font-size:18px;font-weight:700;letter-spacing:.04em;}",
      "#skillCheckCard .scFlavor{font-size:13px;margin:6px 0 10px;color:#5a3a16;line-height:1.5;}",
      "#skillCheckCard .scMeta{font-size:14px;margin-bottom:12px;color:#4a2c0c;}",
      "#skillCheckCard .scMeta b{font-size:16px;}",
      "#scDie{width:96px;height:96px;margin:4px auto 8px;border-radius:12px;",
      "  background:radial-gradient(circle at 38% 32%,#fff 0%,#e9e2cf 55%,#c9bb95 100%);",
      "  border:4px solid #6a4010;display:flex;align-items:center;justify-content:center;",
      "  font-size:46px;font-weight:800;color:#3a2208;transform:rotate(0) scale(1);",
      "  transition:transform .18s cubic-bezier(.25,.46,.45,.94);image-rendering:auto;}",
      "#scDie.spin{transform:rotate(-6deg) scale(1.04);}",
      "#scDie.win{border-color:#1f7a2e;color:#125b22;box-shadow:0 0 14px rgba(34,160,60,.7);}",
      "#scDie.lose{border-color:#9a2222;color:#7a1414;box-shadow:0 0 14px rgba(170,40,40,.6);}",
      "#scDie.crit{border-color:#caa21a;color:#8a6a00;box-shadow:0 0 18px rgba(220,180,30,.9);}",
      "#scDie.fumble{border-color:#5a5a5a;color:#444;}",
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
        '<div class="scTitle"></div>' +
        '<div class="scFlavor"></div>' +
        '<div class="scMeta"></div>' +
        '<div id="scDie">?</div>' +
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

  function showPanelAndRoll(checkDef, dcNum, rep, bonus, opts) {
    return new Promise(function (resolve) {
      ensureStyles();
      var ov = ensurePanel();
      var card = ov.querySelector("#skillCheckCard");
      var dieEl = ov.querySelector("#scDie");
      var titleEl = card.querySelector(".scTitle");
      var flavorEl = card.querySelector(".scFlavor");
      var metaEl = card.querySelector(".scMeta");
      var resultEl = card.querySelector(".scResult");
      var hintEl = card.querySelector(".scHint");
      var btn = ov.querySelector("#scRollBtn");

      titleEl.textContent = opts.title || (checkDef.label + "判定");
      flavorEl.textContent = opts.flavor || "";
      flavorEl.style.display = opts.flavor ? "" : "none";
      var sign = bonus >= 0 ? "+" + bonus : String(bonus);
      metaEl.innerHTML = checkDef.label + " <b>DC " + dcNum + "</b> ／ 代表 " +
        (rep.name || "—") + " ／ ボーナス " + sign;
      dieEl.className = "";
      dieEl.textContent = "?";
      resultEl.textContent = "";
      resultEl.className = "scResult";
      hintEl.textContent = "";
      btn.style.display = "";
      ov.classList.add("show");

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
      }
      function onAct() {
        if (phase === 0) { roll(); }
        else if (phase === 2) { var o = ov._outcome; cleanup(); resolve(o); }
      }
      function roll() {
        phase = 1;
        btn.style.display = "none";
        hintEl.textContent = "";
        var finalVal = d20();
        animateD20(dieEl, finalVal).then(function () {
          var outcome = computeOutcome(finalVal, bonus, dcNum);
          ov._outcome = outcome;
          // 出目の色分け
          if (outcome.crit) dieEl.classList.add("crit", "win");
          else if (outcome.fumble) dieEl.classList.add("fumble", "lose");
          else dieEl.classList.add(outcome.success ? "win" : "lose");
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
    var bonus = checkScore(rep, checkDef) + (opts.extraBonus || 0);

    // autoplay / headless: UIを出さず即ロールで解決（showChoice と同じ方針）
    if (global.__autoplay || opts.auto) {
      var o = computeOutcome(d20(), bonus, dcNum);
      o.rep = rep;
      try { console.log("[AUTOPLAY] skillCheck", checkKey, "dc", dcNum, "->", o.success ? "成功" : "失敗"); } catch (e) {}
      return Promise.resolve(o);
    }
    return showPanelAndRoll(checkDef, dcNum, rep, bonus, opts).then(function (o) {
      if (o) o.rep = rep;
      return o;
    });
  }

  global.SkillCheck = {
    abilityModifier: abilityModifier,
    CLASS_ABILITIES: CLASS_ABILITIES,
    CLASS_PROFICIENCIES: CLASS_PROFICIENCIES,
    PROFICIENCY_BONUS: PROFICIENCY_BONUS,
    CHECKS: CHECKS,
    DC_TIERS: DC_TIERS,
    checkScore: checkScore,
    selectRepresentative: selectRepresentative,
    resolveSkillCheck: resolveSkillCheck,
    // テスト/内部用
    _computeOutcome: computeOutcome,
    _resolveDc: resolveDc,
    _d20: d20,
  };
})(window);
