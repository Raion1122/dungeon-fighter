/*
 * js/save-slots.js — セーブスロット基盤 (3スロット・アーカイブ方式) v1
 * ------------------------------------------------------------------
 * 実装依頼書 `実装依頼書/2026-08-20_save-slots.md` の STEP 1〜2 (API のみ・UI なし)。
 *
 * ★ 共有モジュール: tavern.html / index.html (将来は title.html も) が
 *      <script src="js/save-slots.js"></script>
 *   で読み込む。js/skill-check.js・js/df-mapdef.js と同じ作法で、HTML 側に写しを作らない。
 *
 * ★ クラシックスクリプト (ES module ではない)。
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      公開 API は必ずファイル末尾で明示的に `global.DFSlots = { ... }` と代入すること。
 *
 * ── 方式: ライブ名前空間 + アーカイブ ─────────────────────────────
 *   dragonfighters.*  … いま遊んでいるスロットの実体 (= ライブ)。**常に真**。
 *                       既存の 164 箇所のキー参照を 1 文字も変えずに 3 スロットを作るための土台。
 *                       ブラウザが落ちても、いま遊んでいるスロットは絶対に失われない。
 *   df.activeSlot     … ライブが「どのスロットのものか」 ("1" / "2" / "3")
 *   df.slot1/2/3      … 非アクティブなスロットの JSON スナップショット 1 キー
 *
 * スナップショットの形:
 *   { "meta": { "hero":"warrior", "level":5, "gold":340, "clearedCount":2, "savedAt":"...Z" },
 *     "data": { "dragonfighters.xp":"10000", "dragonfighters.gold":"340" } }
 *   - data は dragonfighters. で始まる localStorage キーの**丸ごとコピー**。値は文字列のまま
 *     (JSON.parse しない = 型を推測しないので、どんなキーが増えても壊れない)
 *   - meta は**一覧の表示専用**。復元せずに読めることが目的
 *   - KEEP の 2 キー (settings / panelCollapsed) はスロットに含めない = 設定と UI 状態は全スロット共通
 *
 * 公開API: window.DFSlots
 *   LIVE_PREFIX / KEEP / SLOT_COUNT / enabled() / active() / list() / snapshot()
 *   switchTo() / newGame() / wipeLive() / sizeReport()          ← STEP4 で switchTo/newGame/sizeReport を追加
 *
 * ★ 撤退スイッチ ?slots=0 の効き方 (3 段に分かれる。混ぜないこと)
 *   - 無効化する (新設のスロット *機能*)      … active()/list()/snapshot()/switchTo()/newGame()
 *   - 無効化しない (既存機能が載っている)     … wipeLive()  ← 設定モーダル『冒険の記録を消す』が依存
 *   - 無効化しない (機能ではなく計測器)       … sizeReport()
 *
 * ⚠ 本モジュールは「読み込んだだけでは localStorage / sessionStorage に一切書き込まない」。
 *   active() の遅延書き込みも **呼ばれた時だけ**。これが「配線だけの段」の核心で、
 *   script タグを足した時点で挙動が 1 ミリも変わらないことの根拠になっている。
 */
(function (global) {
  "use strict";

  var LIVE_PREFIX = "dragonfighters.";
  // ⚠ tavern.html の WIPE_KEEP と同じ 2 キー。設定と UI 状態はスロットを跨いで共通。
  var KEEP = { "dragonfighters.settings": 1, "dragonfighters.panelCollapsed": 1 };
  var SLOT_COUNT = 3;
  var ACTIVE_KEY = "df.activeSlot";
  var SLOT_KEY_PREFIX = "df.slot";

  // レベル算出テーブル。⚠ tavern.html の XP_THRESHOLDS と同期。
  //    (tavern 側は IIFE の中にあり外から呼べないので、ここに同じ値を持つ。片方を触ったら両方直す)
  var XP_THRESHOLDS = [0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000];
  function getLevelFromXP(xp) {
    var lv = 1;
    for (var i = 0; i < XP_THRESHOLDS.length; i++) {
      if (xp >= XP_THRESHOLDS[i]) lv = i + 1;
    }
    return lv;
  }

  // ── ストレージの薄いラッパ (プライベートモード等で例外を投げる環境でもスクリプトを道連れにしない) ──
  function stores() {
    var out = [];
    try { if (global.localStorage) out.push(global.localStorage); } catch (e) {}
    try { if (global.sessionStorage) out.push(global.sessionStorage); } catch (e) {}
    return out;
  }
  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function slotKey(n) { return SLOT_KEY_PREFIX + n; }
  function isSlotNo(n) { n = n | 0; return n >= 1 && n <= SLOT_COUNT; }

  /* ライブのキー一覧 (KEEP は除く)。
     ⚠⚠ **キーをハードコード列挙しない**。tavern.html には `localStorage.setItem("dragonfighters." + mk, ...)`
        のように**動的にキーを組む**箇所が実在するため、列挙式は原理的に取りこぼす。
        prefix 総なめだけが正しい (既存 wipeAdventureRecord() が同じ理由で prefix 走査になっている)。 */
  function keysOf(store) {
    var out = [];
    try {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf(LIVE_PREFIX) === 0 && !KEEP[k]) out.push(k);
      });
    } catch (e) {}
    return out;
  }

  /* ライブの中身を丸ごとコピー。値は文字列のまま (JSON.parse しない)。 */
  function liveData() {
    var data = {};
    try {
      keysOf(global.localStorage).forEach(function (k) {
        var v = lsGet(k);
        if (v !== null) data[k] = v;
      });
    } catch (e) {}
    return data;
  }

  function liveHasData() {
    try { return keysOf(global.localStorage).length > 0; } catch (e) { return false; }
  }

  /* meta は一覧の表示専用。get(key) 経由にしてあるので、ライブでもアーカイブの data でも同じ式が使える。
     savedAt はこの meta を作った瞬間 (= ライブから算出したなら「今の状態」であることを表す)。 */
  function buildMeta(get) {
    var hero = null;
    try {
      var pc = JSON.parse(get(LIVE_PREFIX + "partyComposition") || "null");
      // 先頭 = 主人公 (tavern.html の partyComposition 読み出しと同じ規則)
      if (Array.isArray(pc) && pc.length >= 1) hero = pc[0];
    } catch (e) {}
    var clearedCount = 0;
    try {
      // dragonfighters.cleared は「クリア済シナリオ id の配列」を JSON.stringify したもの
      var cl = JSON.parse(get(LIVE_PREFIX + "cleared") || "null");
      if (Array.isArray(cl)) clearedCount = cl.length;
    } catch (e) {}
    var xp = Number(get(LIVE_PREFIX + "xp")) || 0;
    return {
      hero: hero,
      level: getLevelFromXP(xp),
      gold: Number(get(LIVE_PREFIX + "gold")) || 0,
      clearedCount: clearedCount,
      savedAt: new Date().toISOString(),
    };
  }
  function liveMeta() { return buildMeta(lsGet); }

  /* アーカイブ 1 枠を読む。無い / 壊れている / 形が違うものは「空スロット」として扱う。
     ⚠ ここで例外を投げると一覧が丸ごと死ぬので、必ず null に落とす。 */
  function readSlot(n) {
    var raw = lsGet(slotKey(n));
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (o && typeof o === "object" && o.data && typeof o.data === "object") return o;
    } catch (e) {}
    return null;
  }

  /* アーカイブが「中身のあるセーブ」かどうか。
     ⚠⚠ **アーカイブが存在すること == セーブがあること、ではない**。
        STEP4 で switchTo()/newGame() が入ったことで、次の状態が日常的に起きるようになった:
          newGame(2) → (スロット2 でまだ何もしていない) → switchTo(1)
        switchTo は必ず先に snapshot() するので、**中身が空の df.slot2 が焼かれる**。
        存在だけで判定すると、まっさらなスロットが一覧に「Lv1 / 0G のセーブ」として並ぶ。
     判定は active スロット側の liveHasData() と**同じ規則**にする
        (= KEEP を除いた dragonfighters.* が 1 件でもあるか)。
        active と非 active で「空」の意味が食い違うと、切り替えた瞬間に一覧の表示が変わる。 */
  function slotHasData(snap) {
    try { return !!(snap && snap.data && Object.keys(snap.data).length > 0); } catch (e) { return false; }
  }

  // ── 公開 API 本体 ────────────────────────────────────────────────

  /* 撤退スイッチ ?slots=0。
     ⚠ URLSearchParams が無い環境で例外を投げ、スクリプト全体を道連れにしないよう try/catch で包む。
        catch した場合の既定は **true (機能 ON)**。理由: URL でスイッチを渡せない環境では
        そもそも撤退の意思表示ができないので、出荷時の姿 = ON に倒すのが正しい。
        ここを false に倒すと「古いブラウザでだけ黙ってスロットが無効」という握り潰しになる。 */
  function enabled() {
    try { return new URLSearchParams(global.location.search).get("slots") !== "0"; }
    catch (e) { return true; }
  }

  /* ライブがどのスロットのものか (1..SLOT_COUNT)。
     未設定なら 1 を **書いて** 1 を返す = 既存プレイヤーのセーブが自動的にスロット1 になる (救済)。
     ⚠ この書き込みは「呼ばれた時だけ」。読み込みだけでは走らない。
     ?slots=0 のとき: スロット機能として無効 → df.activeSlot を **書かずに** 1 を返す
        (撤退した状態で df.* だけが生えるのを防ぐ)。 */
  function active() {
    if (!enabled()) return 1;
    var n = parseInt(lsGet(ACTIVE_KEY), 10);
    if (isSlotNo(n)) return n;
    lsSet(ACTIVE_KEY, "1");
    return 1;
  }

  /* スロット一覧。常に SLOT_COUNT 件返す。
       [{ slot:1, active:true, empty:false, meta:{...} }, ...]
     active なスロットの meta は **ライブから今その場で算出** する。
     アーカイブは古い可能性があるため (= snapshot() を挟まなくても最新が読めることが目的)。
     ?slots=0 のとき: スロット機能として無効 → 全件 empty:true / meta:null
        (呼び出し側は「一覧を出す意味が無い」と読める)。 */
  function list() {
    var out = [];
    var on = enabled();
    var cur = on ? active() : 0;
    for (var n = 1; n <= SLOT_COUNT; n++) {
      if (!on) { out.push({ slot: n, active: false, empty: true, meta: null }); continue; }
      if (n === cur) {
        var has = liveHasData();
        out.push({ slot: n, active: true, empty: !has, meta: has ? liveMeta() : null });
        continue;
      }
      var snap = readSlot(n);
      // ⚠ 存在ではなく **中身** で判定する (slotHasData のコメント参照)。
      var full = slotHasData(snap);
      out.push({ slot: n, active: false, empty: !full, meta: full ? (snap.meta || null) : null });
    }
    return out;
  }

  /* ライブ → active スロットへ書き戻し (meta 更新込み)。書けたら payload、書けなければ null。
     ?slots=0 のとき: スロット機能として無効 → 何もせず null を返す (df.* を一切生やさない)。 */
  function snapshot() {
    if (!enabled()) return null;
    var payload = { meta: liveMeta(), data: liveData() };
    var json;
    try { json = JSON.stringify(payload); } catch (e) { return null; }
    return lsSet(slotKey(active()), json) ? payload : null;
  }

  /* ライブ (dragonfighters.*) を localStorage / sessionStorage の両方から prefix 総なめで削除する。
     KEEP の 2 キーは残す。戻り値は消したキー数。
     ⚠⚠ **?slots=0 でもここだけは必ず動く**。設定モーダルの『冒険の記録を消す』という
        *既存機能* がこの API に載るため、ここをゲートすると撤退スイッチを入れた瞬間に
        既存機能が壊れる。撤退スイッチが止めてよいのは「新しく足したスロット機能」だけ。
     ⚠ 画面遷移 (location.replace) は **しない**。呼び出し側の責任。
        再読込が要るのは「消えた状態を画面へ反映する」というモーダル側の都合であって、
        API に混ぜると STEP4 の newGame() がこれを呼べなくなる。 */
  function wipeLive() {
    var removed = 0;
    stores().forEach(function (store) {
      keysOf(store).forEach(function (k) {
        try { store.removeItem(k); removed++; } catch (e) {}
      });
    });
    return removed;
  }

  /* ライブを active スロットから **スロット n** へ切り替える。
     戻り値: 実際に入れ替えたら true / 何もしなかったら false (n===active の no-op、範囲外、?slots=0)。
             切り替え後の状態を知りたい呼び出し側は active() を読む。

     ⚠⚠ **順序がこの方式の安全性の根拠**。必ずこの 4 手順、この順番で行うこと:
        ① snapshot()  … いまのライブを *いまの* active スロットへ焼く
        ② wipeLive()  … ライブを空にする
        ③ slot n の data をライブへ流し込む (空スロットなら何も入らない = まっさらな状態)
        ④ df.activeSlot = n
     ① を後回しにすると (= 先にライブを消すと) **直前まで遊んでいたスロットの進行がそのまま消える**。
     逆に ① を先に済ませておけば、②〜④ の途中でブラウザが落ちても直前の進行はアーカイブ側に残る。

     ⚠ KEEP の 2 キー (settings / panelCollapsed) は全スロット共通なので、
        流し込みでも上書きしない (そもそも snapshot の data に入っていないが、
        手で編集された df.slotN が紛れ込んでも設定を壊さないよう、流し込み側でも弾く)。 */
  function switchTo(n) {
    if (!enabled()) return false;
    n = n | 0;
    if (!isSlotNo(n)) return false;
    var cur = active();
    if (n === cur) return false;          // no-op (すでにそのスロットで遊んでいる)
    snapshot();                           // ① 先に焼く。ここを飛ばすと進行が消える
    wipeLive();                           // ② ライブを空に
    var snap = readSlot(n);               // ③ 流し込む
    if (snap && snap.data) {
      Object.keys(snap.data).forEach(function (k) {
        if (k.indexOf(LIVE_PREFIX) !== 0 || KEEP[k]) return;
        var v = snap.data[k];
        if (typeof v === "string") lsSet(k, v);
      });
    }
    lsSet(ACTIVE_KEY, String(n));         // ④
    return true;
  }

  /* スロット n を **新規ゲーム**にして、そこへ移る。
     戻り値: true / 何もしなかったら false (範囲外、?slots=0)。

     ① snapshot()   … 直前まで遊んでいたスロットの進行を守る (n === active でも先に焼く。
                       分岐させないのは「順序が安全性の根拠」を 1 本に保つため。
                       n === active のときは ④ で消えるので実害はない)
     ② wipeLive()   … ライブを空に (KEEP の 2 キーは残る = 音量設定は新規ゲームでも維持)
     ③ activeSlot=n … 以後ライブは n のもの
     ④ df.slotN を削除 … n のアーカイブも空に。これが無いと「新規にしたのに switchTo で古い進行が戻る」

     ⚠ location.replace はここでも **しない**。画面へ反映するのは呼び出し側の責任
        (wipeLive() と同じ理由。API に混ぜると UI 側の都合が API を縛る)。 */
  function newGame(n) {
    if (!enabled()) return false;
    n = n | 0;
    if (!isSlotNo(n)) return false;
    snapshot();                           // ①
    wipeLive();                           // ②
    lsSet(ACTIVE_KEY, String(n));         // ③
    try { global.localStorage.removeItem(slotKey(n)); } catch (e) {}   // ④
    return true;
  }

  /* quota 検証用のサイズ実測。{ live, slot1, slot2, slot3, total } (単位: バイト)。
     ライブ + 3 スロットで最大 4 倍になるので、通す前に必ず実測する (依頼書 受入条件 8.)。

     ⚠ バイトの定義: Chrome / Safari の localStorage は **UTF-16 コードユニット単位**で
        quota を数えるため、1 エントリ = (キー長 + 値長) × 2 バイトとする。
        UTF-8 換算より必ず大きく出る = 安全側に倒れる。日本語が多いデータで UTF-8 換算すると
        quota を下に見積もってしまい「測ったのに溢れる」が起きる。
     ⚠ live には KEEP の 2 キー (settings / panelCollapsed) も含める。
        スロットには入らないが localStorage の容量は実際に食っているため、quota の見積りには要る。
     ⚠ **ゲートしない (?slots=0 でも動く)**。これは計測器であって機能ではない。
        撤退スイッチを入れた状態で「いま何バイト残っているか」を測れないと調査そのものができない。
        wipeLive() と同じ扱い (撤退スイッチが止めてよいのは新設のスロット *機能* だけ)。 */
  function sizeReport() {
    var rep = { live: 0, total: 0 };
    var n;
    for (n = 1; n <= SLOT_COUNT; n++) rep["slot" + n] = 0;
    try {
      Object.keys(global.localStorage).forEach(function (k) {
        var v = lsGet(k);
        var b = (k.length + (v === null ? 0 : v.length)) * 2;
        if (k.indexOf(LIVE_PREFIX) === 0) { rep.live += b; return; }
        for (var i = 1; i <= SLOT_COUNT; i++) {
          if (k === slotKey(i)) { rep["slot" + i] += b; return; }
        }
      });
    } catch (e) {}
    rep.total = rep.live;
    for (n = 1; n <= SLOT_COUNT; n++) rep.total += rep["slot" + n];
    return rep;
  }

  // ⚠ classic script 直下の関数は window に載らない。ここで明示的に生やすこと。
  global.DFSlots = {
    LIVE_PREFIX: LIVE_PREFIX,
    KEEP: KEEP,
    SLOT_COUNT: SLOT_COUNT,
    enabled: enabled,
    active: active,
    list: list,
    snapshot: snapshot,
    switchTo: switchTo,
    newGame: newGame,
    wipeLive: wipeLive,
    sizeReport: sizeReport,
    // テスト/内部用
    _ACTIVE_KEY: ACTIVE_KEY,
    _slotKey: slotKey,
    _readSlot: readSlot,
    _liveKeys: function () { try { return keysOf(global.localStorage); } catch (e) { return []; } },
    _liveData: liveData,
    _liveMeta: liveMeta,
    _getLevelFromXP: getLevelFromXP,
    _XP_THRESHOLDS: XP_THRESHOLDS,
  };
})(window);
