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
 *   ⚠ [#72 で訂正] 旧文面「NPC_NAMES は 16 要素しかなく … 12 < 16 なので、名簿が満杯でも
 *   名前が衝突しない」は **#72 の着手前から成り立っていなかった**: 旧 pickUniqueName() が避けて
 *   いたのは「その編成で使った名前」だけで、名簿に居る名前は新顔にも使っていた (実測 = 名簿 8 人 +
 *   約束 2 人の盤面で新顔 21,217 人中 11,777 人が同名 / 実装依頼書 #72 §12-0 追補 2c)。
 *   #72 からは tavern.html が新顔の名前を **職ごとの表 NPC_NAMES_BY_CLASS (1 職 15 名)** から引き、
 *   **名簿と同行の約束に居る名前を使わない** (namesTakenTV / pickClassNameTV)。名前が衝突しない
 *   根拠は 12 < 16 ではなく、この除外。⇒ 12 という値は名前の数からは決まっていない。
 *   ⚠ 逆向きの依存はある: 1 職 15 名 = CAP - 1 + RECRUIT_MAX + 1 (名簿 11 人と約束 3 人が同じ職でも
 *     1 名残る数)。CAP を増やすなら tavern.html の NPC_NAMES_BY_CLASS の 1 職の数も増やすこと。
 *   ⭐ この 12 を tavern.html 側やドライバへ写経しないこと (CAP を実体から読む)。
 *
 * 公開API: window.DFRoster
 *   CAP / enabled() / load() / save(r) / all() / enroll(member) /
 *   recordRun(ids, survived) / release(id) / _wipe()
 *
 * ⚠ 本モジュールは「script タグを読み込んだだけでは localStorage に一切書き込まない」。
 *   書くのは load() / enroll() / recordRun() / release() / save() / _wipe() を **呼ばれた時だけ**。
 *   ★[#117 §5-3 で訂正] 旧文面は「load() も書かない」だったが、#117 から load() は
 *   **固定キャストへの切り替えを 1 回だけ**行い、そのとき写し PRECAST_KEY (と、元の名簿があれば
 *   名簿・同行の約束・知らせの印) を書く。条件 = キャスト ON (window.DFCast && DFCast.enabled())
 *   かつ 名簿 ON (?roster=0 でない) かつ 写しが無い。写しは名簿が空でも書く (= 切り替え済みの印)。
 *   ⇒ 2 回目以降の load() は従来どおり読むだけ。
 *
 * ── #117 固定キャストへの切り替え (依頼書 §5-3 / §7) ─────────────────────────
 *   - 写し PRECAST_KEY = "dragonfighters.mercRosterPreCast" に **元の生の文字列をそのまま** 残す。
 *   - 職ごとにキャスト 2 人へ枠を割り当てる: ① 名前 (と職) が一致する人をそのキャストへ (罠 D) /
 *     ② 残り枠へ残りの人を Lv → runs → id の順で。引き継ぐのは id / level / runs だけ。
 *   - ⛔ normMember の保存形は変えない = castId は名簿に保存しない (罠 A。酒場が名前から付ける)。
 *   - ⛔ _wipe() は写しを消さない (消すと _wipe → enroll で仕込むドライバで切り替えが再発する = 罠 C)。
 *   - 撤退 ?cast=0: 切り替えない。写しがあれば **写しを読み書きする** (activeKey())。
 *     ⚠ 撤退中に写しへ書いた変化は、スイッチを戻してもキャストの名簿には反映されない (別々に進む)。
 *
 * ⛔ どの API も例外を投げない。名簿の失敗が「出発できない」「酒場が開かない」に化けてはいけない。
 */
(function (global) {
  "use strict";

  /* ⛔ 前置詞を変えるな (ファイル冒頭の注意書き参照)。 */
  var KEY = "dragonfighters.mercRoster";
  /* ★#117: 切り替え前の名簿の写し。⚠ 名前は依頼書 §5-3 のまま (項目 1 の罠 F = verify_mercenary_roster の
     部分一致 'mercRoster' に当たるのは想定内・テストの言い直しは項目 4)。 */
  var PRECAST_KEY = "dragonfighters.mercRosterPreCast";
  var RECRUIT_KEY = "dragonfighters.recruitCandidates";   // js/recruit-candidates.js の KEY (読み込み順に依存しないよう直書き)
  var NOTICE_KEY = "dragonfighters.castNotice";           // 酒場の名簿パネルで 1 回だけ知らせる印 (§5-4)
  var VERSION = 1;
  /* 在籍の上限。⚠ [#72 で訂正] 「NPC_NAMES = 16 より小さいことが名前が衝突しない根拠」は成り立っていなかった
     (冒頭の「上限が 12 人である理由」参照。衝突しない根拠は tavern.html の除外 = namesTakenTV)。 */
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
  /* ★#117: キャスト ON か (読み込み順に依存しないよう呼ぶたびに見る)。DFCast の無いページでは false。 */
  function castOn() {
    try { return !!(global.DFCast && typeof global.DFCast.enabled === "function" && global.DFCast.enabled()); }
    catch (e) { return false; }
  }
  /* ★#117 §7: いま読み書きする名簿のキー。キャスト ON = 本体の KEY。
     撤退 ?cast=0 で写しがあれば写し (切り替え前の名簿で遊べる)。無ければ KEY のまま。 */
  function activeKey() {
    if (!castOn() && global.DFCast && lsGet(PRECAST_KEY) != null) return PRECAST_KEY;
    return KEY;
  }

  /* ★#117 §5-3: 固定キャストへの切り替え。**写しが無いときに 1 回だけ** (罠 C)。
     ⛔ 例外を投げない (失敗しても通常の読み込みへ落ちる)。 */
  function migrateToCastOnce() {
    if (!castOn() || !enabled()) return;           // ?cast=0 / ?roster=0 / DFCast 無し → 何もしない
    if (lsGet(PRECAST_KEY) != null) return;         // 切り替え済み
    try {
      var raw = lsGet(KEY);
      /* 1. 写し。⭐ 元の生の文字列を 1 バイトも変えずに。名簿が無ければ空の名簿 = 切り替え済みの印。 */
      if (!lsSet(PRECAST_KEY, raw != null ? raw : JSON.stringify(emptyRoster()))) return;
      if (raw == null) return;                      // 元が無い = 書き換えるものが無い (⛔ 空の名簿を KEY へ書かない)
      var cur = parseRoster(raw);
      var cast = global.DFCast.all();
      var byClass = {};
      cast.forEach(function (c) { (byClass[c.classKey] = byClass[c.classKey] || []).push(c); });
      var keep = {};                                // 元の id → 割り当てたキャスト
      var moved = 0;
      Object.keys(byClass).forEach(function (ck) {
        var slots = byClass[ck];
        var pool = cur.list.filter(function (m) { return m.classKey === ck; });
        var taken = {};
        var filled = [];
        /* ① 名前 (と職) が一致する在籍者を、同じ名前のキャストへ (罠 D)。同名が複数いれば Lv の高い人。 */
        slots.forEach(function (c, si) {
          var best = null;
          pool.forEach(function (m) {
            if (taken[m.id] || m.name !== c.name) return;
            if (!best || better(m, best)) best = m;
          });
          if (best) { taken[best.id] = 1; filled[si] = best; }
        });
        /* ② 残りの枠へ、残りの在籍者を Lv → runs → id の順で。 */
        var rest = pool.filter(function (m) { return !taken[m.id]; }).sort(function (a, b) { return better(a, b) ? -1 : 1; });
        slots.forEach(function (c, si) {
          if (filled[si] || !rest.length) return;
          filled[si] = rest.shift();
        });
        slots.forEach(function (c, si) { if (filled[si]) keep[filled[si].id] = c; });
      });
      /* 元の並び順のまま、枠に入った人だけを残す (入らなかった人は写しにだけ残る)。 */
      var list = [];
      cur.list.forEach(function (m) {
        var c = keep[m.id];
        if (!c) return;
        list.push({ id: m.id, classKey: m.classKey, name: c.name, trait: c.trait, line: c.line,
                    variant: c.variant, level: m.level, runs: m.runs });
        moved++;
      });
      save({ v: VERSION, next: cur.next, list: list });   // ⛔ next は元の値を保つ (save が押し上げるだけ)
      /* 3. 同行の約束からキャストにいない名前の人を外す。⚠ 名前の置き換えはしない (外すだけ)。 */
      var rraw = lsGet(RECRUIT_KEY);
      if (rraw) {
        var rv = null;
        try { rv = JSON.parse(rraw); } catch (e) { rv = null; }
        if (Array.isArray(rv)) {
          var kept = rv.filter(function (m) {
            return m && typeof m.name === "string" && global.DFCast.idOfName(m.name) != null;
          });
          if (kept.length !== rv.length) {
            if (kept.length) lsSet(RECRUIT_KEY, JSON.stringify(kept)); else lsDel(RECRUIT_KEY);
          }
        }
      }
      /* 4. 引き継いだ人が 1 人以上いたら、酒場の名簿パネルで 1 回だけ知らせる (§5-4)。 */
      if (moved > 0) lsSet(NOTICE_KEY, "1");
    } catch (e) { /* ⛔ 投げない。写しが書けていれば以降は通常の読み込み */ }
  }
  /* 引き継ぎの順位: Lv → runs → id (小さいほうが先)。a が b より先なら true。 */
  function better(a, b) {
    if (a.level !== b.level) return a.level > b.level;
    if (a.runs !== b.runs) return a.runs > b.runs;
    return a.id < b.id;
  }

  function load() {
    migrateToCastOnce();
    return parseRoster(lsGet(activeKey()));
  }
  function parseRoster(raw) {
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
    return lsSet(activeKey(), json);   // ★#117: ?cast=0 で写しがあれば写しへ (§7)
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
  /* ★#117: ⛔ 写し PRECAST_KEY は消さない (罠 C — 消すと _wipe → enroll で仕込むドライバで切り替えが再発する)。
     キャスト ON では従来どおり KEY を消すだけ。?cast=0 で写しを読み書きしているときは、
     写しを「空の名簿」で上書きする (写し = 切り替え済みの印は残したまま、いま見ている名簿を空にする)。 */
  function _wipe() {
    if (activeKey() === PRECAST_KEY) return lsSet(PRECAST_KEY, JSON.stringify(emptyRoster()));
    return lsDel(KEY);
  }

  // ⚠ classic script 直下の関数は window に載らない。ここで明示的に生やすこと。
  global.DFRoster = {
    KEY: KEY,
    PRECAST_KEY: PRECAST_KEY,   // ★#117
    NOTICE_KEY: NOTICE_KEY,     // ★#117
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
