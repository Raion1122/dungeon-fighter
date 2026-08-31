/*
 * js/mercenary-roster.js — 傭兵名簿 (実装依頼書 #38 STEP1) v1
 * ------------------------------------------------------------------
 * 同行 NPC は今日まで **クエストごとに使い捨て**だった。名前も性格も口癖も、帰った瞬間に消えて
 * 次の依頼には二度と来ない。本モジュールは「一度共に戦った冒険者」を名簿に残し、
 * 次の依頼にも同じ顔が名乗り出るようにするための **保管庫**。
 *
 * ★ 共有モジュール: tavern.html が
 *      <script src="js/mercenary-roster.js"></script>
 *   で読み込む。js/save-slots.js と同じ作法で、HTML 側に写しを作らない。
 *
 * ★ クラシックスクリプト (ES module ではない)。
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      公開 API は必ずファイル末尾で明示的に `global.DFRoster = { ... }` と代入すること。
 *
 * ── ⛔⛔ 前置詞 "dragonfighters." を変えないこと ────────────────────────────
 *   js/save-slots.js の keysOf() は **"dragonfighters." の前置詞総なめ** で、
 *   ハードコード列挙ではない (列挙式は原理的に取りこぼす、と向こうのコメントが明記)。
 *   この前置詞のままなら、こちらのコードを 1 行も書かずに次の 3 つが正しくなる:
 *     - snapshot()  … スロットへ自動的に焼かれる (liveData() → keysOf)
 *     - wipeLive()  … 新規ゲームで自動的に消える (newGame() → wipeLive())
 *     - switchTo()  … スロットごとに別の名簿になる
 *   前置詞を変えると **3 つとも黙って壊れる**。
 *   → tools/verify_mercenary_roster.js の負のコントロール `badprefix` が機械検査する。
 *
 * ── 持たないもの (意図的に) ────────────────────────────────────────────────
 *   ⛔ 装備      … 権威は tavern.html の allyEquip[classKey] (職業別)。名簿は「誰が来るか」だけ
 *   ⛔ alive/dead… 今回は仲間を死なせない (依頼書 §1 のユーザー決定)。後続チケット(候補③「冒険の賭け金」)が足す
 *   ⛔ 日時      … スロット一覧の savedAt は js/save-slots.js が既に持つ
 *   ⛔ init({names,traits,lines}) … 新顔の生成は呼び出し側 (tavern.html の makeNpcMember) の仕事。
 *      ここに名前表を持つと NPC_NAMES の **3 本目の複製**ができる。本モジュールは
 *      「受け取った人物を保管して返すだけ」に徹する。
 *
 * ── 上限が 12 人である理由 ─────────────────────────────────────────────────
 *   NPC_NAMES は 16 要素しかなく、pickUniqueName() は 50 回引き直しても駄目なら
 *   **重複したまま返す**。12 < 16 なので、名簿が満杯でも名前が衝突しない。
 *   ⭐ この 12 を tavern.html 側やドライバへ写経しないこと (CAP を実体から読む)。
 *
 * 公開API: window.DFRoster
 *   CAP / enabled() / load() / save(r) / all() / enroll(member) /
 *   recordRun(ids, survived) / release(id) / _wipe()
 *
 * ⚠ 本モジュールは「読み込んだだけでは localStorage に一切書き込まない」。
 *   書くのは enroll() / recordRun() / release() / save() / _wipe() を **呼ばれた時だけ**。
 *   script タグを足した時点で挙動が 1 ミリも変わらないことの根拠になっている。
 *
 * ⛔ どの API も例外を投げない。名簿の失敗が「出発できない」「酒場が開かない」に化けてはいけない。
 */
(function (global) {
  "use strict";

  /* ⛔ 前置詞を変えるな (ファイル冒頭の注意書き参照)。 */
  var KEY = "dragonfighters.mercRoster";
  var VERSION = 1;
  /* 在籍の上限。⭐ NPC_NAMES = 16 より小さいことが「名前が衝突しない」の根拠。 */
  var CAP = 12;
  /* レベルの上限。⚠ 主人公 Lv による clamp は **ここではやらない** —
     clamp は tavern.html の assignCompanionLevels() 1 箇所に集約する。
     名簿には主人公 Lv を超えた値を保存してよい (主人公が育てば追いつく)。 */
  var LEVEL_MAX = 10;
  /* 生還 RUNS_PER_LEVEL 回ごとに Lv+1。⚠ この「3」は遊んで調整する余地を残す数値。
     受入条件が測るのは「生還で増え、敗北で増えない」という **向き**だけ。 */
  var RUNS_PER_LEVEL = 3;

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { global.localStorage.removeItem(k); return true; } catch (e) { return false; } }

  /* 撤退スイッチ ?roster=0。
     ⚠ URLSearchParams が無い環境で例外を投げ、スクリプト全体を道連れにしないよう try/catch で包む。
        catch した場合の既定は **true (機能 ON)**。理由は js/save-slots.js:enabled() と同じ —
        URL でスイッチを渡せない環境ではそもそも撤退の意思表示ができないので、
        出荷時の姿 = ON に倒すのが正しい。false に倒すと「古いブラウザでだけ黙って名簿が無効」
        という握り潰しになる。
     ⚠⚠ 呼び出し側はこれを **呼ぶたびに読む**こと。モジュール直下の const に畳むと
        tavern.html 側で TDZ に当たる (isRecruitOn() / isHeroLockOff() が同じ理由でそう書かれている)。 */
  function enabled() {
    try { return new URLSearchParams(global.location.search).get("roster") !== "0"; }
    catch (e) { return true; }
  }

  function emptyRoster() { return { v: VERSION, next: 1, list: [] }; }

  function clampLevel(n) {
    var v = Math.floor(Number(n));
    if (!isFinite(v)) return 1;
    return Math.max(1, Math.min(LEVEL_MAX, v));
  }

  /* 1 人ぶんの正規化。壊れた要素は null にして捨てる (**例外を投げない**)。
     ⭐ 文字列 (name / trait / line) はそのまま保持する。添字方式にすると
        NPC_TRAITS の並び順が変わっただけで性格が入れ替わり、「愛着」という目的そのものが壊れる。
        容量は実測で 12 人 = 2,712 B・ライブ + 3 スロットで 10.8 KB しかない (依頼書 §2-10)。 */
  function normMember(m) {
    if (!m || typeof m !== "object") return null;
    var id = Math.floor(Number(m.id));
    if (!isFinite(id) || id < 1) return null;
    if (typeof m.classKey !== "string" || !m.classKey) return null;
    if (typeof m.name !== "string" || !m.name) return null;
    var runs = Math.floor(Number(m.runs));
    if (!isFinite(runs) || runs < 0) runs = 0;
    var variant = Math.floor(Number(m.variant));
    if (!isFinite(variant) || variant < 0) variant = 0;
    return {
      id: id,
      classKey: m.classKey,
      name: m.name,
      trait: (typeof m.trait === "string") ? m.trait : "",
      line: (typeof m.line === "string") ? m.line : "",
      variant: variant,
      level: clampLevel(m.level),
      runs: runs,
    };
  }

  /* 名簿を読む。壊れていたら **空の名簿に落とす** (⛔ 例外を投げない・⛔ 消さない)。
     ⚠ ここはゲートしない。?roster=0 は「読まず書かず」を **all()/enroll()/recordRun()/release()**
        の側で実現する。低レベルの入出力までゲートすると、撤退中に名簿が残っていることを
        調べる手段がなくなる (js/save-slots.js の sizeReport() が同じ理由でゲートされていない)。 */
  function load() {
    var raw = lsGet(KEY);
    if (!raw) return emptyRoster();
    var o = null;
    try { o = JSON.parse(raw); } catch (e) { return emptyRoster(); }
    if (!o || typeof o !== "object" || !Array.isArray(o.list)) return emptyRoster();
    var list = [];
    var seen = {};
    for (var i = 0; i < o.list.length && list.length < CAP; i++) {
      var m = normMember(o.list[i]);
      if (!m) continue;
      if (seen[m.id]) continue;      // id は一意鍵。重複していたら先に出たほうを残す
      seen[m.id] = 1;
      list.push(m);
    }
    var next = Math.floor(Number(o.next));
    if (!isFinite(next) || next < 1) next = 1;
    /* next は **単調増加**。壊れたファイルで next が既存 id 以下に戻っていたら押し上げる
       (これをしないと release() 済みの id が再利用され、別人が同じ id を名乗る)。 */
    for (var j = 0; j < list.length; j++) if (list[j].id >= next) next = list[j].id + 1;
    return { v: VERSION, next: next, list: list };
  }

  /* 名簿を書く。書けたら true。⛔ 例外を投げない (quota 超過でも呼び出し側を巻き込まない)。 */
  function save(r) {
    if (!r || typeof r !== "object") return false;
    var norm = { v: VERSION, next: 1, list: [] };
    var src = Array.isArray(r.list) ? r.list : [];
    for (var i = 0; i < src.length && norm.list.length < CAP; i++) {
      var m = normMember(src[i]);
      if (m) norm.list.push(m);
    }
    var next = Math.floor(Number(r.next));
    if (!isFinite(next) || next < 1) next = 1;
    for (var j = 0; j < norm.list.length; j++) if (norm.list[j].id >= next) next = norm.list[j].id + 1;
    norm.next = next;
    var json;
    try { json = JSON.stringify(norm); } catch (e) { return false; }
    return lsSet(KEY, json);
  }

  /* 在籍者の配列 (表示用 / 抽選用)。**複製を返す** ので、呼び出し側が触っても名簿は変わらない。
     ?roster=0 のとき: 名簿を読まない → 空配列。呼び出し側は「新顔だけ」に落ちる。 */
  function all() {
    if (!enabled()) return [];
    return load().list.map(function (m) {
      return { id: m.id, classKey: m.classKey, name: m.name, trait: m.trait,
               line: m.line, variant: m.variant, level: m.level, runs: m.runs };
    });
  }

  /* 新顔を登録して **発行した id** を返す。満杯 / 撤退中 / 保存失敗なら null。
     ⚠ 受け取るのは tavern.html の makeNpcMember() が作った人物そのもの。
        ここで名前や性格を作り直さない (名前表の 3 本目の複製を作らないため)。
     ⚠ 呼び出し側は null が返ったら **mercId を付けない** = その回だけの使い捨てになる。 */
  function enroll(member) {
    if (!enabled()) return null;
    if (!member || typeof member !== "object") return null;
    if (typeof member.classKey !== "string" || !member.classKey) return null;
    if (typeof member.name !== "string" || !member.name) return null;
    var r = load();
    if (r.list.length >= CAP) return null;      // 満杯。⛔ 誰かを押し出さない (見送るのは人が決める)
    var id = r.next;
    var m = normMember({
      id: id, classKey: member.classKey, name: member.name,
      trait: member.trait, line: member.line, variant: member.variant,
      level: member.level, runs: 0,
    });
    if (!m) return null;
    r.list.push(m);
    r.next = id + 1;
    return save(r) ? id : null;
  }

  /* 帰還後の成長。survived が true のときだけ runs を増やし、RUNS_PER_LEVEL 回ごとに Lv+1。
     戻り値 = 実際に更新した人数。
       survived === false → **何も変えない** (今回は仲間を死なせない = 敗北の罰は名簿に無い)
     ⚠ 主人公 Lv による clamp は **ここではやらない** (出発時の assignCompanionLevels 1 箇所に集約)。 */
  function recordRun(ids, survived) {
    if (!enabled()) return 0;
    if (survived !== true) return 0;
    if (!Array.isArray(ids) || !ids.length) return 0;
    var want = {};
    for (var i = 0; i < ids.length; i++) {
      var v = Math.floor(Number(ids[i]));
      if (isFinite(v) && v >= 1) want[v] = 1;
    }
    var r = load();
    var n = 0;
    for (var j = 0; j < r.list.length; j++) {
      var m = r.list[j];
      if (!want[m.id]) continue;
      m.runs = m.runs + 1;
      if (m.runs % RUNS_PER_LEVEL === 0) m.level = Math.min(m.level + 1, LEVEL_MAX);
      n++;
    }
    if (!n) return 0;
    return save(r) ? n : 0;
  }

  /* 「見送る」= 名簿から外す。外せたら true。
     ⛔ next は巻き戻さない。巻き戻すと、次に登録した別人が同じ id を名乗り、
        帰還時の書き戻し (mercId で引く) が別人に当たる。 */
  function release(id) {
    if (!enabled()) return false;
    var v = Math.floor(Number(id));
    if (!isFinite(v) || v < 1) return false;
    var r = load();
    var before = r.list.length;
    r.list = r.list.filter(function (m) { return m.id !== v; });
    if (r.list.length === before) return false;   // 居なかった
    return save(r);
  }

  /* テスト用。⚠ ゲートしない (?roster=0 でも消せる)。これは機能ではなく道具。 */
  function _wipe() { return lsDel(KEY); }

  // ⚠ classic script 直下の関数は window に載らない。ここで明示的に生やすこと。
  global.DFRoster = {
    KEY: KEY,
    CAP: CAP,
    LEVEL_MAX: LEVEL_MAX,
    RUNS_PER_LEVEL: RUNS_PER_LEVEL,
    enabled: enabled,
    load: load,
    save: save,
    all: all,
    enroll: enroll,
    recordRun: recordRun,
    release: release,
    _wipe: _wipe,
  };
})(window);
