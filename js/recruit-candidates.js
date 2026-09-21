/*
 * js/recruit-candidates.js — 同行候補 (実装依頼書 #54 STEP3) v1
 * ------------------------------------------------------------------
 * 同行 NPC は今日まで **出発ボタンを押した瞬間に勝手に決まって**いた。名簿 (#38) に顔は
 * 残るのに、プレイヤーは「この人を連れて行く」と指名できない。本モジュールは酒場で
 * 声を掛けた相手を「次の潜行の同行候補」として保管する **保管庫**。
 *
 * ★ 共有モジュール: tavern.html が
 *      <script src="js/recruit-candidates.js"></script>
 *   で読み込む。js/mercenary-roster.js と同じ作法で、HTML 側に写しを作らない。
 *
 * ★ クラシックスクリプト (ES module ではない)。
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      公開 API は必ずファイル末尾で明示的に `global.DFRecruits = { ... }` と代入すること。
 *
 * ── ⛔⛔ 前置詞 "dragonfighters." を変えないこと ────────────────────────────
 *   js/save-slots.js の keysOf() は "dragonfighters." の前置詞総なめなので、この前置詞の
 *   ままなら snapshot / wipeLive / switchTo が **コードを 1 行も書かずに正しくなる**
 *   (js/mercenary-roster.js の冒頭が同じ理由を詳述している)。
 *
 * ── ⛔ 上限をここに持たない (意図的) ───────────────────────────────────────
 *   同行できる人数の権威は tavern.html の RECRUIT_MAX (= recruitCountOf の clamp 上限)。
 *   ここに 3 を焼くと **2 つ目の正**ができ、片方だけ動かしたときに黙ってズレる。
 *   → add(member, cap) は **cap を呼び出し側から受け取る**。
 *
 * ── 持たないもの (意図的) ──────────────────────────────────────────────────
 *   ⛔ 装備        … 権威は tavern.html の allyEquip[classKey]
 *   ⛔ Lv の確定   … assignCompanionLevels() が確定する唯一の口 (#38)。
 *     ⚠ [#72 で更新] 新顔の Lv は出発時ではなくマッチング画面で振る
 *     (fixCompanionLevelsEarly がこれを呼ぶ・出発では振り直さない)
 *   ⛔ 新顔の生成  … 呼び出し側 (tavern.html の pickCompanion / makeNpcMember) の仕事
 *
 * ── ⚠ 「同一人物」の判定は name ──────────────────────────────────────────
 *   名簿から来た人は mercId を持つが、新顔は持たない。両方を 1 つの器で扱うため、
 *   一意キーは **name** にする。⭐ tavern.html の pickUniqueName() は 1 回の抽選内で名前を重複させず、
 *   さらに [#72 で更新] 新顔には **名簿と同行の約束に居る名前を使わない** (namesTakenTV / pickClassNameTV・
 *   名前は職ごとの表 NPC_NAMES_BY_CLASS から) ので、新しく作られる顔は卓の 4 人の中だけでなく
 *   名簿・約束の人とも name で一意になる。
 *   ⚠ 例外 = #72 より前に名簿へ入った同名の 2 人 (移行しない決定) どうしは name で区別できない。
 *
 * 公開API: window.DFRecruits
 *   KEY / enabled() / load() / save(list) / all() / has(name) /
 *   add(member, cap) / remove(name) / clear() / count()
 */
(function (global) {
  "use strict";

  var KEY = "dragonfighters.recruitCandidates";

  /* ⚠ 呼ぶたびに読む。モジュール直下の const に畳むと、URL を後から変えた検証で
     腕が割れなくなる (DFRoster.enabled() と同じ作法)。 */
  function enabled() {
    try { return new URLSearchParams(global.location.search).get("recruittalk") !== "0"; }
    catch (e) { return true; }
  }

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { global.localStorage.removeItem(k); return true; } catch (e) { return false; } }

  /* 壊れた JSON / 手書き改変への耐性。⛔ 読めないときに例外を投げない
     (酒場の描画が止まるより、候補ゼロで従来どおり歩けるほうがよい)。 */
  function load() {
    var raw = lsGet(KEY);
    if (!raw) return [];
    var v = null;
    try { v = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(v)) return [];
    return v.filter(function (m) {
      return m && typeof m === "object" && typeof m.classKey === "string" && typeof m.name === "string";
    });
  }

  function save(list) {
    if (!Array.isArray(list)) return false;
    if (!list.length) return lsDel(KEY);
    return lsSet(KEY, JSON.stringify(list));
  }

  function all() { return enabled() ? load() : []; }
  function count() { return all().length; }
  function has(name) {
    return all().some(function (m) { return m.name === name; });
  }

  /* 追加。⭐ cap は呼び出し側の権威 (tavern.html の RECRUIT_MAX) を受け取る。
     戻り値 = { ok, reason } — ⛔ 黙って false を返さない (呼び出し側が理由を出せるように)。 */
  function add(member, cap) {
    if (!enabled()) return { ok: false, reason: "disabled" };
    if (!member || typeof member.classKey !== "string" || typeof member.name !== "string") {
      return { ok: false, reason: "invalid" };
    }
    var list = load();
    if (list.some(function (m) { return m.name === member.name; })) {
      return { ok: false, reason: "already" };
    }
    var lim = (typeof cap === "number" && cap > 0) ? cap : list.length + 1;   /* cap 未指定なら制限しない */
    if (list.length >= lim) return { ok: false, reason: "full" };
    list.push(member);
    return save(list) ? { ok: true, reason: "added" } : { ok: false, reason: "storage" };
  }

  function remove(name) {
    var list = load();
    var before = list.length;
    list = list.filter(function (m) { return m.name !== name; });
    if (list.length === before) return false;
    return save(list);
  }

  /* 解散。⚠ ゲートしない (?recruittalk=0 でも消せる) — 撤退したのに古い候補が
     localStorage に残り続けると、スイッチを戻したときに幽霊が復活する。 */
  function clear() { return lsDel(KEY); }

  // ⚠ classic script 直下の関数は window に載らない。ここで明示的に生やすこと。
  global.DFRecruits = {
    KEY: KEY,
    enabled: enabled,
    load: load,
    save: save,
    all: all,
    has: has,
    add: add,
    remove: remove,
    clear: clear,
    count: count,
  };
})(window);
