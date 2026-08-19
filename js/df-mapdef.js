/*
 * js/df-mapdef.js — DFMapDef: マップ定義スキーマ df-map/1 の純粋関数群
 * ------------------------------------------------------------------
 * ★ 共有モジュール: map-editor.html / index.html の両方から
 *      <script src="js/df-mapdef.js"></script>
 *   で読み込む。インライン重複させず、変更は本ファイル1か所で済ませる。
 *   (js/skill-check.js と同じ流儀。classic script + IIFE + window.DFMapDef)
 *
 * ⚠ DOM・エディタ状態・canvas に一切依存させないこと。index.html は幾何の
 *   既定値 (DEFAULT_DUNGEON / DEFAULT_FIELD) をここから受け取って ROOMS を
 *   組み立てるため、依存を足した瞬間にゲーム側が壊れる。
 *
 * ⚠ 本ファイルが 404 になると index.html の幾何が作れず全シナリオ即死する。
 *   index.html 側に MAPDEF_INLINE_FALLBACK (現行値の最小リテラル) を置いてある。
 *   js/skill-check.js は失敗しても判定が死ぬだけだが、幾何は死ぬとゲーム全損 —
 *   同じ扱いにしない。
 *
 * 座標の約束 (既存コードとコピペで往復できることが最優先):
 *   rect       = [r1, c1, r2, c2]  ← **行が先**。index.html の ROOMS / CORRIDORS と同一順序
 *   enemySlots = [tx, ty]          ← **列が先**。tavern.html の ROOM_SLOTS と同一順序
 *   新しい順序を発明すると必ず事故る。UI 側だけが (x, y) に翻訳する。
 */
(function (global) {
  "use strict";

  var SCHEMA = "df-map/1";

  // index.html:2904-2906 の TILE_SIZE / MAP_W / MAP_H と一致させること。
  // Phase 3 までは 72/28/96 固定を validate で強制する。
  var GRID_W = 72, GRID_H = 28, GRID_TILE = 96;

  // タイル値 (index.html buildMap() と同義)。0=床 / 1=レア床 / 2=壁・void
  var T_FLOOR = 0, T_RARE = 1, T_WALL = 2;

  // 屋外の帯マスク行 (index.html:3027-3029 FIELD_BAND_TOP_ROW / BOTTOM_ROW)
  var BAND_TOP_ROW = 13, BAND_BOTTOM_ROW = 15;

  // 既存 SCENARIO_TEX のキー。themeId はこの中から選ぶ。
  var THEMES = [
    { id: "goblin-mine",    name: "廃坑 (goblin-mine)" },
    { id: "bandits-forest", name: "森 (bandits-forest)" },
    { id: "lizard-swamp",   name: "沼地 (lizard-swamp)" },
    { id: "orc-fort",       name: "砦 (orc-fort)" },
    { id: "undead-temple",  name: "神殿 (undead-temple)" },
    { id: "dragon-lair",    name: "竜の巣 (dragon-lair)" },
    { id: "caravan-road",   name: "屋外・街道 (caravan-road)" },
  ];
  var THEME_IDS = THEMES.map(function (t) { return t.id; });

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function clampInt(v, lo, hi) { v = Math.round(isNum(v) ? v : lo); return v < lo ? lo : (v > hi ? hi : v); }

  /* ══════════════════════════════════════════════════════════════════════════
   * 敵カタログ (Phase 0.5 項目1) — 「おまかせ」に加えて敵の種類を指定できるようにする土台
   * ══════════════════════════════════════════════════════════════════════════
   * ★カタログを**エディタ側に写経しない**。実行時に index.html を fetch して
   *   ENEMY_TYPES を抽出する = 二重管理ゼロ。ゲーム側で敵が増減してもエディタは
   *   何もせず追従し、逆に index.html の書式が変わったら**ここ 1 箇所で落ちる**
   *   (= ドリフト検出器が 1 点に集約される。写経すると必ず腐り、腐っても誰も気づけない)。
   *
   * ⚠ 抽出範囲が「純データ」であることは実読で確認済み (2026-07-31):
   *     index.html 5702-6840 / 49050 bytes / キー 50 個
   *     関数定義 0 / アロー 0 / テンプレートリテラル 0 / 値の位置の素の識別子 0
   *   → new Function で安全に評価できる。将来ゲーム側が関数や外部変数を混ぜたら
   *     eval が ReferenceError で落ち、loadEnemyCatalog() は **silent fail-open せず**
   *     reason 付きで失敗する (console.warn + UI 1 行)。
   *
   * ⚠ caravanWagon は敵ではなく隊商護衛の**護衛対象の馬車** (index.html:6820) → 除外する。
   * ────────────────────────────────────────────────────────────────────────── */
  var ENEMY_CATALOG_URL  = "index.html";
  var ENEMY_CATALOG_MARK = "const ENEMY_TYPES = {";
  var ENEMY_NON_COMBAT   = { caravanWagon: 1 };      // 敵ではないので除外する
  var ENEMY_KEY_MAX      = 40;                        // キー文字列の長さ上限 (防御的)
  // パレット (項目2) が 1 コマ切り出しと表示に必要とする最小フィールド。
  // ドライバはこれが**全種そろう**ことを assert する (抽出の取りこぼし検出)。
  var ENEMY_REQUIRED_FIELDS = ["name", "sprite", "frameW", "frameH", "cols", "hp", "xp"];

  /* 系統グループ。パレットの並び順そのもの。
   * ⚠⚠ **どのグループにも入らないキーは自動的に "other" (その他) へ落ちる**。
   *    ゲーム側で敵が増えてもパレットから消えないことが不変条件 = 取りこぼしゼロ。
   *    そのため分類は「明示列挙」だけにせず **接頭辞** を併用する
   *    (goblinXxx / orcXxx が増えたら勝手に正しいグループへ入る)。
   * ⚠ "other" は**必ず最後**に置く (受け皿)。 */
  var ENEMY_GROUPS = [
    { id: "goblin", label: "ゴブリン系",     prefixes: ["goblin"],   keys: ["hobgoblin", "kobold"] },
    { id: "bandit", label: "山賊系",         prefixes: ["bandit"],   keys: ["scar"] },
    { id: "lizard", label: "リザード系",     prefixes: ["lizard"],   keys: [] },
    { id: "orc",    label: "オーク系",       prefixes: ["orc"],      keys: ["garrock"] },
    { id: "undead", label: "アンデッド系",   prefixes: ["skeleton"],
      keys: ["zombie", "wraith", "lich", "caelum", "ghostFlame"] },
    { id: "large",  label: "ドラゴン・大型", prefixes: [],
      keys: ["pharaxus", "hydra", "chimera", "griffon", "umber_hulk", "direBear",
             "minotaur", "shadowBeast", "sovereignEye", "stoneGolem"] },
    { id: "other",  label: "その他",         prefixes: [], keys: [] },   // ★受け皿。常に最後
  ];

  // 取得済みカタログ (null = 未取得)。★lint はこれが null のとき未知キー検査を**スキップ**する。
  var enemyCatalog = null;
  var enemyCatalogError = null;      // 直近の失敗理由 (null = 失敗していない)
  var enemyCatalogPromise = null;    // 二重 fetch 防止のメモ

  /* 敵キーの防御的な正規化。
   * ⚠ **未知のキーは落とさない**。ゲーム側で敵が増えたときに古いエディタが黙って
   *   種類指定を消してしまうのが最悪の事故 (無言のデータ欠損)。ここは
   *   「文字種と長さ」だけを見る = カタログとの照合は lint の warning が担当する。
   * 数値 / null / 空文字 / 記号だけの文字列 → null (= スロットは 2 要素のまま)。 */
  function normEnemyKey(v) {
    if (typeof v !== "string") return null;
    var s = v.replace(/[^A-Za-z0-9_]/g, "");        // trim も記号落としもこれ 1 本で済む
    if (!s) return null;
    return (s.length > ENEMY_KEY_MAX) ? s.slice(0, ENEMY_KEY_MAX) : s;
  }
  // スロット ([tx,ty] | [tx,ty,key]) の敵種キー。おまかせ (2 要素) なら null。
  function enemyKindOf(slot) {
    return (Array.isArray(slot) && slot.length >= 3) ? normEnemyKey(slot[2]) : null;
  }

  function groupIdOfEnemy(key) {
    if (typeof key !== "string" || !key) return "other";
    var i, j;
    for (i = 0; i < ENEMY_GROUPS.length; i++)            // ① 明示列挙が最優先
      for (j = 0; j < ENEMY_GROUPS[i].keys.length; j++)
        if (ENEMY_GROUPS[i].keys[j] === key) return ENEMY_GROUPS[i].id;
    for (i = 0; i < ENEMY_GROUPS.length; i++)            // ② 接頭辞
      for (j = 0; j < ENEMY_GROUPS[i].prefixes.length; j++)
        if (key.indexOf(ENEMY_GROUPS[i].prefixes[j]) === 0) return ENEMY_GROUPS[i].id;
    return "other";                                       // ★③ 受け皿 (未分類は必ずここ)
  }
  /* カタログを系統グループへ振り分ける。パレット (項目2) はこの戻り値をそのまま描く。
   * ★戻り値の keys の総和 = 入力キー数 (取りこぼしゼロ) をドライバが assert する。 */
  function groupEnemyCatalog(cat) {
    var src = (cat === undefined) ? enemyCatalog : cat;
    var out = [], byId = {}, i;
    for (i = 0; i < ENEMY_GROUPS.length; i++) {
      out.push({ id: ENEMY_GROUPS[i].id, label: ENEMY_GROUPS[i].label, keys: [] });
      byId[ENEMY_GROUPS[i].id] = out[i];
    }
    var keys = src ? Object.keys(src) : [];
    for (i = 0; i < keys.length; i++) (byId[groupIdOfEnemy(keys[i])] || byId.other).keys.push(keys[i]);
    return out;
  }

  /* 対応する閉じ括弧まで切り出す。**文字列・行コメント・ブロックコメントの中の { } は数えない**
   * (index.html の ENEMY_TYPES には日本語コメントが大量に入っており、素朴な括弧数えは必ず壊れる)。 */
  function sliceBalancedBrace(s, openIdx) {
    var depth = 0, k = openIdx, n = s.length, ch, q;
    while (k < n) {
      ch = s.charAt(k);
      if (ch === '"' || ch === "'" || ch === "`") {
        q = ch; k++;
        while (k < n) {
          if (s.charAt(k) === "\\") { k += 2; continue; }
          if (s.charAt(k) === q) { k++; break; }
          k++;
        }
        continue;
      }
      if (ch === "/" && s.charAt(k + 1) === "/") { while (k < n && s.charAt(k) !== "\n") k++; continue; }
      if (ch === "/" && s.charAt(k + 1) === "*") {
        k += 2;
        while (k < n && !(s.charAt(k) === "*" && s.charAt(k + 1) === "/")) k++;
        k += 2; continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) return s.slice(openIdx, k + 1); }
      k++;
    }
    return null;
  }

  // index.html のテキストから ENEMY_TYPES を取り出す。失敗は**必ず throw** する
  // (戻り値 null で握り潰すと silent fail-open になり、カタログ欠損に気づけない)。
  function parseEnemyCatalog(text) {
    if (typeof text !== "string" || !text) throw new Error("index.html の中身が空です");
    var i = text.indexOf(ENEMY_CATALOG_MARK);
    if (i < 0) throw new Error('index.html に "' + ENEMY_CATALOG_MARK + '" が見つかりません (書式が変わった可能性)');
    var body = sliceBalancedBrace(text, i + ENEMY_CATALOG_MARK.length - 1);
    if (!body) throw new Error("ENEMY_TYPES の { } が閉じていません");
    var obj = new Function("return (" + body + ");")();
    if (!obj || typeof obj !== "object") throw new Error("ENEMY_TYPES がオブジェクトになりません");
    var out = {}, keys = Object.keys(obj), n = 0;
    for (var k = 0; k < keys.length; k++) {
      if (ENEMY_NON_COMBAT[keys[k]]) continue;      // ★馬車は敵ではないので除外
      out[keys[k]] = obj[keys[k]]; n++;
    }
    if (n === 0) throw new Error("ENEMY_TYPES から敵を 1 種も取り出せませんでした");
    return out;
  }

  /* 実行時に取得する。**同一オリジンの index.html を読むだけ**でゲームは 1 行も動かさない。
   * 戻り Promise は必ず resolve する ({ ok, count, error, url }) = 呼び出し側で握り潰さなくてよい。
   * ⚠ 失敗しても throw で止めない: カタログ無しでも「おまかせ」だけで通常どおり編集できる
   *   (= 退化するが壊れない)。ただし **silent fail-open にはしない** (console.warn + UI 1 行)。 */
  function loadEnemyCatalog(url) {
    if (enemyCatalogPromise) return enemyCatalogPromise;
    var u = url || ENEMY_CATALOG_URL;
    enemyCatalogPromise = Promise.resolve()
      .then(function () {
        if (typeof fetch !== "function") throw new Error("この環境に fetch がありません");
        return fetch(u, { cache: "no-store" });
      })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " (" + u + ")");
        return res.text();
      })
      .then(function (text) {
        enemyCatalog = parseEnemyCatalog(text);
        enemyCatalogError = null;
        return { ok: true, count: Object.keys(enemyCatalog).length, error: null, url: u };
      })
      .catch(function (e) {
        enemyCatalog = null;
        enemyCatalogError = (e && e.message) ? e.message : String(e);
        try {
          console.warn("[map-editor] 敵カタログ (index.html の ENEMY_TYPES) を取得できませんでした: " + enemyCatalogError);
        } catch (_) {}
        return { ok: false, count: 0, error: enemyCatalogError, url: u };
      });
    return enemyCatalogPromise;
  }
  function getEnemyCatalog()      { return enemyCatalog; }          // null = 未取得
  function getEnemyCatalogError() { return enemyCatalogError; }
  function enemyDef(key)          { return (enemyCatalog && enemyCatalog[key]) || null; }
  function isKnownEnemyKey(key)   { return !!(enemyCatalog && enemyCatalog[key]); }
  // 差し替え (検証 / 将来カタログを別経路から与える場合)。null でクリア + 次回 load を再実行させる。
  function setEnemyCatalog(cat) {
    enemyCatalog = (cat && typeof cat === "object") ? cat : null;
    enemyCatalogError = null;
    enemyCatalogPromise = null;
    return enemyCatalog;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * テクスチャカタログ (2026-08-03) — エディタで「本編と同じ見た目」を出すための土台
   * ══════════════════════════════════════════════════════════════════════════
   * ★敵カタログと**まったく同じ思想**: index.html の SCENARIO_TEX を実行時に読む。
   *   エディタ側へ写経すると、ゲーム側でテクスチャを差し替えたときに黙って腐り、
   *   「エディタでは正しいのに本編では違う絵」という最も気づきにくい食い違いになる。
   *   ユーザーが望んだのは「エディタで本編の見た目を確かめる」ことなので、
   *   **食い違いはこの機能の存在意義そのものを壊す**。写経は選択肢にない。
   * ⚠⚠ 未登録テーマのフォールバックは index.html:2976 と**同じ式**にすること
   *       SCENARIO_TEX[themeId] || SCENARIO_TEX["goblin-mine"]
   *     ここだけ別の式にすると、未登録テーマでエディタと本編が違う絵になる。
   * ⚠ 壁セル (値2) の天井スプライト座標も同じ理由で実行時に読む (index.html の SPR_CEILING)。
   *   こちらは**無くても致命ではない** (壁が単色へ退化するだけ) ので null を許す。
   * ⚠ 敵カタログとは fetch を共有しない。loadEnemyCatalog は setEnemyCatalog(null) で
   *   再取得できる契約になっており、本文をメモ化して共有するとその契約が壊れる。
   * ────────────────────────────────────────────────────────────────────────── */
  var TEX_CATALOG_URL  = "index.html";
  var TEX_CATALOG_MARK = "const SCENARIO_TEX = {";
  var TEX_FALLBACK_ID  = "goblin-mine";               // ★index.html:2976 と同じフォールバック先
  var CEILING_MARK     = "const SPR_CEILING = ";
  var texCatalog = null, texCeiling = null, texCatalogError = null, texCatalogPromise = null;

  // index.html のテキストから SCENARIO_TEX を取り出す。失敗は**必ず throw**する
  // (戻り値 null で握り潰すと silent fail-open になり、書式変更に気づけない)。
  function parseTextureCatalog(text) {
    if (typeof text !== "string" || !text) throw new Error("index.html の中身が空です");
    var i = text.indexOf(TEX_CATALOG_MARK);
    if (i < 0) throw new Error('index.html に "' + TEX_CATALOG_MARK + '" が見つかりません (書式が変わった可能性)');
    var body = sliceBalancedBrace(text, i + TEX_CATALOG_MARK.length - 1);
    if (!body) throw new Error("SCENARIO_TEX の { } が閉じていません");
    var obj = new Function("return (" + body + ");")();
    if (!obj || typeof obj !== "object") throw new Error("SCENARIO_TEX がオブジェクトになりません");
    if (!obj[TEX_FALLBACK_ID]) throw new Error('SCENARIO_TEX に既定テーマ "' + TEX_FALLBACK_ID + '" がありません');
    var keys = Object.keys(obj), k, v;
    if (!keys.length) throw new Error("SCENARIO_TEX が空です");
    for (k = 0; k < keys.length; k++) {
      v = obj[keys[k]];
      if (!v || typeof v.floor !== "string" || typeof v.wall !== "string")
        throw new Error('SCENARIO_TEX["' + keys[k] + '"] に floor / wall (文字列) がありません');
    }
    return obj;
  }

  /* SPR_CEILING = [sx, sy, sw, sh] (tileset.png 内のピクセル座標)。
   * ⚠ 見つからなくても throw しない。壁が単色へ退化するだけで編集は続けられる。 */
  function parseCeilingSprite(text) {
    if (typeof text !== "string") return null;
    var i = text.indexOf(CEILING_MARK);
    if (i < 0) return null;
    var j = text.indexOf("]", i);
    if (j < 0) return null;
    var arr;
    try { arr = new Function("return (" + text.slice(i + CEILING_MARK.length, j + 1) + ");")(); }
    catch (e) { return null; }
    if (!arr || arr.length !== 4) return null;
    for (var k = 0; k < 4; k++) if (typeof arr[k] !== "number") return null;
    return arr;
  }

  /* 実行時に取得する。**同一オリジンの index.html を読むだけ**でゲームは 1 行も動かさない。
   * 戻り Promise は必ず resolve する ({ ok, count, error, url, ceiling })。
   * ⚠ 失敗しても throw で止めない (テクスチャ無しでも単色表示で編集は続けられる) が、
   *   **silent fail-open にはしない** (console.warn + 呼び出し側が UI に出す)。 */
  function loadTextureCatalog(url) {
    if (texCatalogPromise) return texCatalogPromise;
    var u = url || TEX_CATALOG_URL;
    texCatalogPromise = Promise.resolve()
      .then(function () {
        if (typeof fetch !== "function") throw new Error("この環境に fetch がありません");
        return fetch(u, { cache: "no-store" });
      })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " (" + u + ")");
        return res.text();
      })
      .then(function (text) {
        texCatalog = parseTextureCatalog(text);
        texCeiling = parseCeilingSprite(text);        // null 可 (壁が単色へ退化するだけ)
        texCatalogError = null;
        return { ok: true, count: Object.keys(texCatalog).length, error: null, url: u,
                 ceiling: texCeiling };
      })
      .catch(function (e) {
        texCatalog = null; texCeiling = null;
        texCatalogError = (e && e.message) ? e.message : String(e);
        try {
          console.warn("[map-editor] テクスチャ表 (index.html の SCENARIO_TEX) を取得できませんでした: "
            + texCatalogError);
        } catch (_) {}
        return { ok: false, count: 0, error: texCatalogError, url: u, ceiling: null };
      });
    return texCatalogPromise;
  }
  function getTextureCatalog()      { return texCatalog; }        // null = 未取得
  function getTextureCatalogError() { return texCatalogError; }
  function getCeilingSprite()       { return texCeiling; }        // null = 取得できなかった
  /* ★index.html:2976 と同じ式。未登録テーマは廃坑テクスチャへ落ちる。 */
  function texSetFor(themeId) {
    if (!texCatalog) return null;
    return texCatalog[themeId] || texCatalog[TEX_FALLBACK_ID] || null;
  }
  // 差し替え (検証用)。null でクリア + 次回 load を再実行させる。
  function setTextureCatalog(cat, ceiling) {
    texCatalog = (cat && typeof cat === "object") ? cat : null;
    texCeiling = (ceiling && ceiling.length === 4) ? ceiling : null;
    texCatalogError = null;
    texCatalogPromise = null;
    return texCatalog;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 1枚絵カタログ / 情景カタログ (Phase 4 項目1) — 自作マップに本編の絵と情景を乗せる土台
   * ══════════════════════════════════════════════════════════════════════════
   * ★敵カタログ・テクスチャカタログと**まったく同じ機構**: index.html を実行時に fetch し、
   *   ROOM_PAINTINGS_DEF / SCENERY_RECIPES / SCENERY_SHEETS をテキスト抽出する。
   *
   * ⚠⚠ **写経しないこと**。エディタ側にテーブルをコピーした瞬間、ゲーム側で絵を差し替えた
   *   ときに黙って腐り、「エディタでは正しいのに本編では違う絵」という最も気づきにくい
   *   食い違いになる。ユーザーが望んだのは「エディタで本編の見た目を確かめる」ことなので、
   *   **食い違いはこの機能の存在意義そのものを壊す**。写経は選択肢にない。
   *   実例: 山場 6 枚は room_<theme>_1.png → room_<theme>_1_bs.jpg へ実際に差し替わっている
   *   (ベルトスクロール化)。写経していたらエディタだけ旧 PNG を指し続けていた。
   *
   * ⚠ 1枚絵は **src 直書きではなく参照 (theme + key)** で持つ (Phase 4 の設計判断)。
   *   src を保存済みマップに焼くと、上記の差し替えで黙って 404 → onerror でタイル描画へ
   *   落ちるため「絵が消えたことに気づけない」。参照方式なら本編の差し替えに自動追従する。
   *
   * ⚠⚠ paintingSrcFor の未知参照は **null**。テクスチャ (texSetFor) と違い既定テーマへ
   *   フォールバックさせない。テクスチャは「何かで塗らないと編集できない」ので既定へ落とすが、
   *   絵は「無い」が正しい状態。勝手に別テーマの絵を返すと、指定ミスが**別の絵として成立して
   *   しまい**永久に気づけない (lint の painting-missing = 項目2 が知らせる役)。
   *
   * ⚠ 敵カタログ / テクスチャカタログと fetch を共有しない。それぞれ setXxxCatalog(null) で
   *   再取得できる契約になっており、本文をメモ化して共有するとその契約が壊れる。
   *   1枚絵と情景も互いに独立した promise を持つ (情景だけは 1 fetch で 2 マーカーを読む)。
   *
   * ⚠ SCENERY_SHEETS のリテラルには `img: new Image()` が入っている = **評価にブラウザが要る**。
   *   エディタは常にブラウザなので実害はないが、Node で parse すると ReferenceError で throw
   *   する (= silent fail-open せず理由付きで落ちる。これは仕様どおりの挙動)。
   * ────────────────────────────────────────────────────────────────────────── */
  var PAINTING_CATALOG_URL  = "index.html";
  var PAINTING_CATALOG_MARK = "const ROOM_PAINTINGS_DEF = {";
  var SCENERY_CATALOG_URL   = "index.html";
  var SCENERY_RECIPE_MARK   = "const SCENERY_RECIPES = {";
  var SCENERY_SHEET_MARK    = "const SCENERY_SHEETS = {";
  /* ★Phase 6 (情景物の個別配置): 絵の切り出し枠。SCENERY_SHEETS / SCENERY_RECIPES と
   *   **同じ 1 fetch** で読む (3 つは常にセットで要る = 片方だけ取れた状態を作らない)。 */
  var SCENERY_FRAME_MARK    = "const SCENERY_FRAMES = {";

  /* ══════════════════════════════════════════════════════════════════════════
   * ⭐ 縮尺の物差し (Phase 6) — 「キャラの大きさとスケールが合っている」ための唯一の基準
   * ══════════════════════════════════════════════════════════════════════════
   * ユーザーが名指しで最優先に挙げた条件。**推測で px を決めない**ための土台を 1 箇所に置く。
   *
   *   ・味方 6 職の walk シートは全員 96px セル / **インク体高 57px** (warrior_walk.png の
   *     row3 全 6 コマで一致。2026-07-30 の屋外景観リデザインで実測済み)
   *   ・その体高を人間 1.70m と置く → **1px ≒ 2.98cm**、1 タイル 96px ≒ 一辺 2.9m
   *
   * ⚠⚠ **数値だけでは縮尺の狂いは見つからない** (恒久教訓13)。屋外景観のときは FFT の
   *   支配ピークも緑画素率も的外れな答えを返し、一度「床は問題なし」と誤結論した。
   *   最終的に効いたのは「1 画面ぶん切り出してキャラを並べて目で見る」ことだけ。
   *   → だからエディタのパレットは **cm 表示 + キャラのシルエットを実寸で並べて描く**。
   *   数値 (cm) は誤りを**防ぎ**、並べた絵は誤りを**見つける**。両方要る。
   *
   * ⚠ 恒久教訓16: 「数値上の欠陥」と「絵としての欠陥」は別物。ただし今回置く物
   *   (石柱・椅子・テーブル・馬車) は**キャラと同じ地面に立つ**ので、例外なく実寸が正しい。
   *   (例外だったのは路肩の石垣・並木・丘のような「立たない物」)
   * ────────────────────────────────────────────────────────────────────────── */
  var CHAR_INK_H_PX = 57;                              // 味方6職の walk インク体高 (実測)
  var CHAR_H_CM     = 170;                             // それを人間 1.70m と置く
  var CM_PER_PX     = CHAR_H_CM / CHAR_INK_H_PX;       // ≒ 2.982 cm/px
  function pxToCm(px) { return (isNum(px) ? px : 0) * CM_PER_PX; }
  function cmToPx(cm) { return (isNum(cm) ? cm : 0) / CM_PER_PX; }
  /* 実寸を「m 表記の短い文字列」へ。UI に出す唯一の書式 (2 箇所で書き分けない)。 */
  function cmLabel(cm) {
    if (!isNum(cm) || cm <= 0) return "?";
    return (cm >= 100) ? ((cm / 100).toFixed(cm >= 1000 ? 0 : 1) + "m") : (Math.round(cm) + "cm");
  }

  /* 部屋キー → 日本語の呼び名。ROOM_PAINTINGS_DEF / SCENERY_RECIPES のキー (0/1/2) は
   * ROOMS の index ではなく「導入 / 山場 / ボス」という**ラベル**である (index.html:3755 の注記)。
   * ⚠ ここは絵の内容ではなく**キーの呼び名**なので写経には当たらない (絵が増減しても腐らない)。
   *   未知キーは "部屋<key>" へ落ちる = 取りこぼしゼロ。 */
  var PAINTING_KEY_LABELS = { "0": "導入", "1": "山場", "2": "ボス",
                              // ★P7: 分岐マップのノード用 (n4 = 山場ノード / n7 = ボスノード)
                              "n4": "ノード山場", "n7": "ノードボス" };

  /* 情景レシピのフォールバック先。SCENERY_RECIPES は goblin-mine と caravan-road の
   * **2 テーマしかない**ので、残り 5 テーマは必ずどちらかへ落ちる。
   * ⚠⚠ この判断を sceneryRecipeFor に閉じ込め、本編 (項目4) とエディタ (項目3) が同じ式を使う。
   *   2 箇所に式を持つと、エディタのプレビューと実プレイで生える種が変わる。 */
  var SCENERY_FALLBACK_FIELD   = "caravan-road";     // 屋外テーマ (FIELD_THEME_IDS) の既定
  var SCENERY_FALLBACK_DUNGEON = "goblin-mine";      // それ以外の既定

  /* rooms[i].scenery.density の上限 (★Phase 4 項目2 の normalize が使う)。
   * UI (項目3) は 0.5 / 1 / 1.8 の 3 択だが、手書き JSON も受け入れるので
   * 「0 < density <= 4」を schema として確定させる。4 を超える密度は面積比スケール
   * (項目4) と掛け算になって配置が破綻する = 受け取った時点で null へ潰す。 */
  var SCENERY_DENSITY_MAX = 4;

  var paintingCatalog = null, paintingCatalogError = null, paintingCatalogPromise = null;
  var sceneryRecipes  = null, scenerySheets = null, sceneryFrames = null;
  var sceneryCatalogError = null, sceneryCatalogPromise = null;

  // [r1, c1, r2, c2] (行が先) → { tw, th }。tileBounds / floorBounds 共通。
  function boundsWH(b) {
    return { tw: b[3] - b[1] + 1, th: b[2] - b[0] + 1 };
  }
  function isBounds4(b) {
    if (!Array.isArray(b) || b.length !== 4) return false;
    for (var i = 0; i < 4; i++) if (typeof b[i] !== "number" || !isFinite(b[i])) return false;
    return true;
  }

  /* index.html のテキストから ROOM_PAINTINGS_DEF を取り出す。失敗は**必ず throw**する
   * (戻り値 null で握り潰すと silent fail-open になり、書式変更に気づけない)。 */
  function parsePaintingCatalog(text) {
    if (typeof text !== "string" || !text) throw new Error("index.html の中身が空です");
    var i = text.indexOf(PAINTING_CATALOG_MARK);
    if (i < 0) throw new Error('index.html に "' + PAINTING_CATALOG_MARK + '" が見つかりません (書式が変わった可能性)');
    var body = sliceBalancedBrace(text, i + PAINTING_CATALOG_MARK.length - 1);
    if (!body) throw new Error("ROOM_PAINTINGS_DEF の { } が閉じていません");
    var obj = new Function("return (" + body + ");")();
    if (!obj || typeof obj !== "object") throw new Error("ROOM_PAINTINGS_DEF がオブジェクトになりません");
    var themes = Object.keys(obj), t, per, ks, k, e, n = 0, where;
    if (!themes.length) throw new Error("ROOM_PAINTINGS_DEF が空です");
    for (t = 0; t < themes.length; t++) {
      per = obj[themes[t]];
      if (!per || typeof per !== "object")
        throw new Error('ROOM_PAINTINGS_DEF["' + themes[t] + '"] がオブジェクトではありません');
      ks = Object.keys(per);
      for (k = 0; k < ks.length; k++) {
        e = per[ks[k]];
        where = 'ROOM_PAINTINGS_DEF["' + themes[t] + '"][' + ks[k] + ']';
        if (!e || typeof e.src !== "string" || !e.src)
          throw new Error(where + " に src (文字列) がありません");
        if (!isBounds4(e.tileBounds))
          throw new Error(where + " の tileBounds が [r1,c1,r2,c2] (数値4つ) ではありません");
        n++;
      }
    }
    if (n === 0) throw new Error("ROOM_PAINTINGS_DEF から 1 枚も取り出せませんでした");
    return obj;
  }

  /* index.html のテキストから SCENERY_SHEETS + SCENERY_RECIPES を取り出す。
   * 戻り = { sheets, recipes }。失敗は**必ず throw**する (理由は上と同じ)。
   * ⚠ counts に SCENERY_SHEETS 未登録の種が混じっていたら throw する。これはゲーム側でも
   *   描画不能な壊れた状態なので、黙って通すと「エディタでは置けるのに本編で消える」になる。 */
  function parseSceneryCatalog(text) {
    if (typeof text !== "string" || !text) throw new Error("index.html の中身が空です");

    // ① SCENERY_SHEETS (種の一覧)。⚠ リテラルに new Image() を含む = ブラウザ前提。
    var i = text.indexOf(SCENERY_SHEET_MARK);
    if (i < 0) throw new Error('index.html に "' + SCENERY_SHEET_MARK + '" が見つかりません (書式が変わった可能性)');
    var sBody = sliceBalancedBrace(text, i + SCENERY_SHEET_MARK.length - 1);
    if (!sBody) throw new Error("SCENERY_SHEETS の { } が閉じていません");
    var sheets = new Function("return (" + sBody + ");")();
    if (!sheets || typeof sheets !== "object") throw new Error("SCENERY_SHEETS がオブジェクトになりません");
    var kinds = Object.keys(sheets), k;
    if (!kinds.length) throw new Error("SCENERY_SHEETS が空です");
    for (k = 0; k < kinds.length; k++) {
      if (!sheets[kinds[k]] || typeof sheets[kinds[k]].src !== "string")
        throw new Error('SCENERY_SHEETS["' + kinds[k] + '"] に src (文字列) がありません');
    }

    // ② SCENERY_RECIPES (テーマ × 部屋キー ごとの配置レシピ)
    var j = text.indexOf(SCENERY_RECIPE_MARK);
    if (j < 0) throw new Error('index.html に "' + SCENERY_RECIPE_MARK + '" が見つかりません (書式が変わった可能性)');
    var rBody = sliceBalancedBrace(text, j + SCENERY_RECIPE_MARK.length - 1);
    if (!rBody) throw new Error("SCENERY_RECIPES の { } が閉じていません");
    var recipes = new Function("return (" + rBody + ");")();
    if (!recipes || typeof recipes !== "object") throw new Error("SCENERY_RECIPES がオブジェクトになりません");
    var themes = Object.keys(recipes), t, per, ks, kk, e, ck, c, where, n = 0;
    if (!themes.length) throw new Error("SCENERY_RECIPES が空です");
    for (t = 0; t < themes.length; t++) {
      per = recipes[themes[t]];
      if (!per || typeof per !== "object")
        throw new Error('SCENERY_RECIPES["' + themes[t] + '"] がオブジェクトではありません');
      ks = Object.keys(per);
      for (kk = 0; kk < ks.length; kk++) {
        e = per[ks[kk]];
        where = 'SCENERY_RECIPES["' + themes[t] + '"][' + ks[kk] + ']';
        if (!e || typeof e !== "object") throw new Error(where + " がオブジェクトではありません");
        if (!isBounds4(e.floorBounds))
          throw new Error(where + " の floorBounds が [r1,c1,r2,c2] (数値4つ) ではありません");
        if (!e.counts || typeof e.counts !== "object") throw new Error(where + " に counts がありません");
        ck = Object.keys(e.counts);
        if (!ck.length) throw new Error(where + " の counts が空です");
        for (c = 0; c < ck.length; c++) {
          if (typeof e.counts[ck[c]] !== "number" || !isFinite(e.counts[ck[c]]))
            throw new Error(where + '.counts["' + ck[c] + '"] が数値ではありません');
          if (!sheets[ck[c]])
            throw new Error(where + '.counts に SCENERY_SHEETS 未登録の種 "' + ck[c] + '" があります');
        }
        n++;
      }
    }
    if (n === 0) throw new Error("SCENERY_RECIPES から 1 件も取り出せませんでした");

    /* ③ ★Phase 6: SCENERY_FRAMES (種ごとの切り出し枠)。個別配置の UI とプレビューに要る。
     * ⚠ シートに登録が無い種の枠は throw する。エディタで置けるのに本編で描けない状態
     *   ("エディタでは正しいのに本編では違う" の一形態) を silent に通さない。
     * ⚠ 逆 (シートにあるのに枠が無い) も throw。描画式が frames[variant] を無条件で引くため。 */
    var f = text.indexOf(SCENERY_FRAME_MARK);
    if (f < 0) throw new Error('index.html に "' + SCENERY_FRAME_MARK + '" が見つかりません (書式が変わった可能性)');
    var fBody = sliceBalancedBrace(text, f + SCENERY_FRAME_MARK.length - 1);
    if (!fBody) throw new Error("SCENERY_FRAMES の { } が閉じていません");
    var frames = new Function("return (" + fBody + ");")();
    if (!frames || typeof frames !== "object") throw new Error("SCENERY_FRAMES がオブジェクトになりません");
    var fk = Object.keys(frames), fi, arr, ai, fr;
    if (!fk.length) throw new Error("SCENERY_FRAMES が空です");
    for (fi = 0; fi < fk.length; fi++) {
      if (!sheets[fk[fi]])
        throw new Error('SCENERY_FRAMES["' + fk[fi] + '"] に対応する SCENERY_SHEETS の登録がありません');
      arr = frames[fk[fi]];
      if (!Array.isArray(arr) || !arr.length)
        throw new Error('SCENERY_FRAMES["' + fk[fi] + '"] が空でない配列ではありません');
      for (ai = 0; ai < arr.length; ai++) {
        fr = arr[ai];
        if (!fr || !isNum(fr.x) || !isNum(fr.y) || !(fr.w > 0) || !(fr.h > 0))
          throw new Error('SCENERY_FRAMES["' + fk[fi] + '"][' + ai + '] が {x,y,w,h} ではありません');
      }
    }
    for (k = 0; k < kinds.length; k++) {
      if (!frames[kinds[k]])
        throw new Error('SCENERY_SHEETS["' + kinds[k] + '"] に対応する SCENERY_FRAMES の枠がありません');
    }

    return { sheets: sheets, recipes: recipes, frames: frames };
  }

  /* 実行時に取得する。**同一オリジンの index.html を読むだけ**でゲームは 1 行も動かさない。
   * 戻り Promise は必ず resolve する ({ ok, count, error, url }) = 呼び出し側で握り潰さなくてよい。
   * ⚠ 失敗しても throw で止めない (絵なしでも編集は続けられる) が、**silent fail-open にはしない**
   *   (console.warn + 呼び出し側が UI に「取得失敗」を出す)。 */
  function loadPaintingCatalog(url) {
    if (paintingCatalogPromise) return paintingCatalogPromise;
    var u = url || PAINTING_CATALOG_URL;
    paintingCatalogPromise = Promise.resolve()
      .then(function () {
        if (typeof fetch !== "function") throw new Error("この環境に fetch がありません");
        return fetch(u, { cache: "no-store" });
      })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " (" + u + ")");
        return res.text();
      })
      .then(function (text) {
        paintingCatalog = parsePaintingCatalog(text);
        paintingCatalogError = null;
        return { ok: true, count: paintingEntries().length, error: null, url: u };
      })
      .catch(function (e) {
        paintingCatalog = null;
        paintingCatalogError = (e && e.message) ? e.message : String(e);
        try {
          console.warn("[map-editor] 1枚絵カタログ (index.html の ROOM_PAINTINGS_DEF) を取得できませんでした: "
            + paintingCatalogError);
        } catch (_) {}
        return { ok: false, count: 0, error: paintingCatalogError, url: u };
      });
    return paintingCatalogPromise;
  }

  /* 情景 (レシピ + シート) を **1 回の fetch で両方**読む。両者は必ずセットで要る
   * (レシピの counts が参照する種はシートにしか無い) ので、片方だけ取れた状態を作らない。 */
  function loadSceneryCatalog(url) {
    if (sceneryCatalogPromise) return sceneryCatalogPromise;
    var u = url || SCENERY_CATALOG_URL;
    sceneryCatalogPromise = Promise.resolve()
      .then(function () {
        if (typeof fetch !== "function") throw new Error("この環境に fetch がありません");
        return fetch(u, { cache: "no-store" });
      })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " (" + u + ")");
        return res.text();
      })
      .then(function (text) {
        var got = parseSceneryCatalog(text);
        scenerySheets  = got.sheets;
        sceneryRecipes = got.recipes;
        sceneryFrames  = got.frames;
        sceneryCatalogError = null;
        return { ok: true, count: Object.keys(scenerySheets).length, error: null, url: u,
                 themes: Object.keys(sceneryRecipes).length, props: propEntries().length };
      })
      .catch(function (e) {
        scenerySheets = null; sceneryRecipes = null; sceneryFrames = null;
        sceneryCatalogError = (e && e.message) ? e.message : String(e);
        try {
          console.warn("[map-editor] 情景カタログ (index.html の SCENERY_SHEETS / SCENERY_RECIPES) を取得できませんでした: "
            + sceneryCatalogError);
        } catch (_) {}
        return { ok: false, count: 0, error: sceneryCatalogError, url: u, themes: 0, props: 0 };
      });
    return sceneryCatalogPromise;
  }

  function getPaintingCatalog()      { return paintingCatalog; }    // null = 未取得
  function getPaintingCatalogError() { return paintingCatalogError; }
  function getSceneryRecipes()       { return sceneryRecipes; }     // null = 未取得
  function getScenerySheets()        { return scenerySheets; }      // null = 未取得
  function getSceneryFrames()        { return sceneryFrames; }      // null = 未取得 (★Phase 6)
  function getSceneryCatalogError()  { return sceneryCatalogError; }

  // 差し替え (検証用)。null でクリア + 次回 load を再実行させる。
  function setPaintingCatalog(cat) {
    paintingCatalog = (cat && typeof cat === "object") ? cat : null;
    paintingCatalogError = null;
    paintingCatalogPromise = null;
    return paintingCatalog;
  }
  /* ⚠ frames は**任意の第3引数**。本編 (index.html) は情景を自前で描くので 2 引数でも
   *   従来どおり動く = この追加で既存の呼び出しは 1 つも壊れない。ただし props (Phase 6) を
   *   使う経路は frames が要るので、本編も 3 引数で渡すよう配線してある。 */
  function setSceneryCatalog(recipes, sheets, frames) {
    sceneryRecipes = (recipes && typeof recipes === "object") ? recipes : null;
    scenerySheets  = (sheets  && typeof sheets  === "object") ? sheets  : null;
    sceneryFrames  = (frames  && typeof frames  === "object") ? frames  : null;
    sceneryCatalogError = null;
    sceneryCatalogPromise = null;
    return sceneryRecipes;
  }

  /* UI (項目3 の <select>) と lint (項目2) が使う平坦なリスト。
   *   [{ theme, key, src, tw, th, label }, …]  ★key は必ず文字列に正規化する
   * ⚠ 未取得なら **空配列** (null を返すと呼び出し側の .map が落ちる)。 */
  function paintingEntries() {
    if (!paintingCatalog) return [];
    var out = [], themes = Object.keys(paintingCatalog), t, per, ks, k, e, wh, key, nm;
    for (t = 0; t < themes.length; t++) {
      per = paintingCatalog[themes[t]];
      if (!per || typeof per !== "object") continue;
      ks = Object.keys(per);
      for (k = 0; k < ks.length; k++) {
        e = per[ks[k]];
        if (!e || typeof e.src !== "string" || !isBounds4(e.tileBounds)) continue;
        wh = boundsWH(e.tileBounds);
        key = String(ks[k]);
        nm = PAINTING_KEY_LABELS[key] || ("部屋" + key);
        out.push({ theme: themes[t], key: key, src: e.src, tw: wh.tw, th: wh.th,
                   label: nm + " " + wh.tw + "×" + wh.th });
      }
    }
    return out;
  }

  /* rooms[i].painting = { theme, key } → 絵の src。
   * ⚠⚠ 引けなければ **null**。テクスチャ (texSetFor) と違い既定テーマへ落とさない (節頭の理由)。 */
  function paintingSrcFor(theme, key) {
    var e = paintingEntryFor(theme, key);
    return e ? e.src : null;
  }

  /* rooms[i].painting = { theme, key } → カタログの生エントリ | null。
   * ⚠ paintingSrcFor と paintingBoundsFor の**唯一の引き手**。2 本に写すと
   *   「src は引けるのに bounds は引けない」という食い違いが生まれる。 */
  function paintingEntryFor(theme, key) {
    if (!paintingCatalog) return null;
    if (typeof theme !== "string" || !theme) return null;
    var per = paintingCatalog[theme];
    // ⚠ プロトタイプ由来のプロパティ ("constructor" 等) を拾わないよう型でも弾く
    if (!per || typeof per !== "object") return null;
    var e = per[String(key)];
    if (!e || typeof e !== "object" || typeof e.src !== "string" || !e.src) return null;
    return e;
  }

  /* rooms[i].painting = { theme, key } → その絵が覆う想定のタイル矩形 [r1,c1,r2,c2] | null。
   * ★P7: 縦横比の判定を「在庫一覧のどれかに当たるか」から「**指定したその絵**に当たるか」へ
   *   精密化するために足した (paintingAspectFits の節を参照)。 */
  function paintingBoundsFor(theme, key) {
    var e = paintingEntryFor(theme, key);
    return (e && isBounds4(e.tileBounds)) ? e.tileBounds : null;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * ★[卓上グリッド P2] 1 枚絵に描かれた障害物の当たり判定
   * ══════════════════════════════════════════════════════════════════════════
   * ROOM_PAINTINGS_DEF[theme][key].blocked = ["..##....", …]
   *   '#' = 通れない / それ以外の文字 = 通れる。1 文字 = 1 タイル、1 行 = 絵の 1 タイル行。
   *
   * ⭐ マスクは **絵に付ける** (部屋に付けない)。障害物は絵に描かれているので、絵を差し替えれば
   *   障害物の位置も当然変わる。rooms[i] 側に持たせると、絵だけ差し替えたときにマスクが黙って
   *   古いまま残る — room_<theme>_1.png → _1_bs.jpg の差し替えは実際に起きているので机上の話ではない。
   * ⭐ 絵は **2 経路**で貼られる (従来経路 = 絵側の tileBounds / mapDef 経路 = 部屋の rect)。
   *   マスクを**絵の座標系**で持ち、貼り先の rect へ drawImage とまったく同じ比率で写すので、
   *   どちらの経路でも「絵に見えている場所」と「塞ぐ場所」が一致する。
   * ⚠⚠ 行数×桁数は tileBounds の th×tw と**厳密に一致**していること。ずれていたら
   *   **丸ごと捨てて error を返す** (半端に採ると絵と 1 マスずれた所が塞がり、原因を追えない)。
   *   捨てたことは lint の painting-blocked-broken が知らせる = silent fail にはしない。 */
  var PAINTING_BLOCK_CHAR = "#";

  /* カタログの生エントリ → { rows, error }。
   *   rows  … 検査を通った行文字列の配列 | null (blocked 未指定・不正のどちらも null)
   *   error … 不正だったときの理由 | null (blocked 未指定なら null = 指定しないのは正常)
   * ⚠ 「採れたか」と「壊れているか」を**1 本の関数**で返す。2 本に割ると
   *   「本編は捨てたのに lint は通す」という食い違いが生まれる。 */
  function paintingBlockedRows(entry) {
    var none = { rows: null, error: null };
    if (!entry || typeof entry !== "object") return none;
    if (entry.blocked === undefined || entry.blocked === null) return none;
    if (!isBounds4(entry.tileBounds))
      return { rows: null, error: "tileBounds が [r1,c1,r2,c2] ではないのでマスクの寸法を検算できません" };
    var wh = boundsWH(entry.tileBounds);
    var rows = entry.blocked;
    if (!Array.isArray(rows) || !rows.length)
      return { rows: null, error: "blocked が行文字列の配列ではありません" };
    if (rows.length !== wh.th)
      return { rows: null, error: "blocked の行数 " + rows.length + " が tileBounds の高さ " + wh.th + " と違います" };
    for (var i = 0; i < rows.length; i++) {
      if (typeof rows[i] !== "string")
        return { rows: null, error: "blocked[" + i + "] が文字列ではありません" };
      if (rows[i].length !== wh.tw)
        return { rows: null, error: "blocked[" + i + "] の桁数 " + rows[i].length + " が tileBounds の幅 " + wh.tw + " と違います" };
    }
    return { rows: rows, error: null };
  }

  /* rooms[i].painting = { theme, key } → { rows, error }。上と同じ 1 本を通す。 */
  function paintingBlockedFor(theme, key) {
    return paintingBlockedRows(paintingEntryFor(theme, key));
  }

  /* 絵のマスク × 貼り先の rect → 塞ぐタイルの index 配列。
   * ⚠ 貼り先の各マスから**絵の側を引く** (destination → source)。逆向きに回すと拡大時に
   *   引かれないマスができて縞状の隙間が空く。等倍 (rect が絵と同じ大きさ) なら恒等写像。
   * ⚠ W/H は貼り先マップの寸法。枠外は捨てる (捏造しない)。 */
  function paintingBlockedTilesFor(rows, rect, W, H) {
    var out = [];
    if (!Array.isArray(rows) || !rows.length || !isBounds4(rect)) return out;
    var rh = rect[2] - rect[0] + 1, rw = rect[3] - rect[1] + 1;
    if (rh <= 0 || rw <= 0) return out;
    var mh = rows.length, mw = rows[0].length;
    if (mw <= 0) return out;
    for (var r = 0; r < rh; r++) {
      var line = rows[Math.min(mh - 1, Math.floor(r * mh / rh))];
      var rr = rect[0] + r;
      if (rr < 0 || rr >= H) continue;
      for (var c = 0; c < rw; c++) {
        if (line.charAt(Math.min(mw - 1, Math.floor(c * mw / rw))) !== PAINTING_BLOCK_CHAR) continue;
        var cc = rect[1] + c;
        if (cc < 0 || cc >= W) continue;
        out.push(rr * W + cc);
      }
    }
    return out;
  }

  /* mapDef.rooms[i].painting → 塞ぐタイルの index 配列 (mapDef 経路ぶんだけ)。
   * ⚠ 既定 6 シナリオ (従来経路) は **絵側の tileBounds** へ貼るので、ここでは 1 マスも出ない。
   *   本編はそちらも含めて roomPaintings を舐めるので、こちらはエディタの lint 用。
   * ⚠ propBlockedTiles と**別関数**にしてある。混ぜると driver_mapeditor_props の
   *   「obstacleTileMask が propBlockedTiles と完全一致」という測り方が意味を失う。 */
  function paintingBlockedTiles(d) {
    var out = [];
    if (!d || !Array.isArray(d.rooms)) return out;
    var W = (d.grid && isNum(d.grid.w)) ? d.grid.w : GRID_W;
    var H = (d.grid && isNum(d.grid.h)) ? d.grid.h : GRID_H;
    for (var i = 0; i < d.rooms.length; i++) {
      var room = d.rooms[i];
      var pg = room && room.painting;
      if (!pg || !isBounds4(room.rect)) continue;
      var m = paintingBlockedFor(pg.theme, pg.key);
      if (!m.rows) continue;
      var t = paintingBlockedTilesFor(m.rows, room.rect, W, H);
      for (var j = 0; j < t.length; j++) out.push(t[j]);
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * ★[卓上グリッド P3 追補] 絵に描かれた「出入口」と「屋外かどうか」
   * ══════════════════════════════════════════════════════════════════════════
   * ROOM_PAINTINGS_DEF[theme][key].gates = { right: [25, 4], up: [16, 0, "up"], … }
   *   値 = [絵ローカル列, 絵ローカル行] | [絵ローカル列, 絵ローカル行, 実際に向いている向き]
   *   絵の左上を [0,0] とするタイル座標。3 つ目は省略可 (省略時 = キーの向き自身)。
   *
   * ⭐ **なぜ絵に付けるか** — blocked とまったく同じ理由。出入口は絵に描かれている
   *   (廃坑入口なら木枠の坑口) ので、絵を差し替えれば口の位置も当然変わる。rooms[i] 側や
   *   ノードの定義に持たせると、絵だけ差し替えたときに口が黙って古い場所に残る。
   * ⭐ 貼り先の rect へ blocked と**同じ比率**で写すので、絵が 2 経路 (絵側の tileBounds /
   *   部屋の rect) のどちらで貼られても「絵に見えている場所」と「口」が一致する。
   *
   * ⭐⭐ **3 つ目の「向き」が要る理由**: 出口の dir は分岐グラフ上の識別子 (部屋の中心から
   *   見てどちらへ抜けるか) で、**絵の中でその口がどちらを向いているか**とは別物。廃坑入口の
   *   坑口は「部屋の中心から見れば右上 = dir:right」だが、口そのものは**北を向いている**
   *   (南から北へ潜る)。扉の板の向き・壁の開口を掘る向きはこちらで決めないと、坑口の前に
   *   縦板の扉が立つ。⚠ dir を変えて解決してはいけない — dir は木構造の枝の識別子なので、
   *   同じノードで 2 本が同じ dir になった瞬間に扉も矢印も 1 本ぶん消える。
   *
   * ⚠⚠ 壊れていたら**丸ごと捨てて error を返す** (blocked と同じ流儀)。半端に採ると
   *   「口が 1 マスずれた所に開く」= 扉が絵と食い違う所に立ち、原因を追えない。
   *   捨てたことは lint の painting-gate-broken が知らせる = silent fail にはしない。 */
  var PAINTING_GATE_DIRS = ["up", "down", "left", "right"];

  function isGateDir(v) { return PAINTING_GATE_DIRS.indexOf(v) >= 0; }

  /* カタログの生エントリ → { gates, tw, th, error }。
   *   gates … 検査を通った { dir: { c, r, face } } | null (未指定・不正のどちらも null)
   *   tw/th … 絵のタイル寸法 (貼り先へ写すときの分母)。gates が null なら 0
   *   error … 不正だったときの理由 | null (未指定なら null = 指定しないのは正常)
   * ⚠ 「採れたか」と「壊れているか」を **1 本の関数**で返す (paintingBlockedRows と同じ)。
   *   2 本に割ると「本編は捨てたのに lint は通す」という食い違いが生まれる。 */
  function paintingGates(entry) {
    var none = { gates: null, tw: 0, th: 0, error: null };
    function bad(msg) { return { gates: null, tw: 0, th: 0, error: msg }; }
    if (!entry || typeof entry !== "object") return none;
    if (entry.gates === undefined || entry.gates === null) return none;
    if (!isBounds4(entry.tileBounds))
      return bad("tileBounds が [r1,c1,r2,c2] ではないので口の座標を検算できません");
    var src = entry.gates;
    if (typeof src !== "object" || Array.isArray(src))
      return bad("gates が { 向き: [列, 行] } の形ではありません");
    var wh = boundsWH(entry.tileBounds);
    var keys = Object.keys(src), out = {}, i, k, v, face;
    if (!keys.length) return bad("gates が空です");
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (!isGateDir(k))
        return bad('gates のキー "' + k + '" は向き (' + PAINTING_GATE_DIRS.join(" / ") + ") ではありません");
      v = src[k];
      if (!Array.isArray(v) || v.length < 2 || !isNum(v[0]) || !isNum(v[1]))
        return bad("gates." + k + " が [列, 行] の数値対ではありません");
      if (v[0] < 0 || v[0] >= wh.tw || v[1] < 0 || v[1] >= wh.th)
        return bad("gates." + k + " の [" + v[0] + "," + v[1] + "] が絵の外です (絵は " +
                   wh.tw + "x" + wh.th + " タイル)");
      face = (v.length >= 3 && v[2] !== undefined && v[2] !== null) ? v[2] : k;
      if (!isGateDir(face))
        return bad("gates." + k + ' の 3 つ目 "' + face + '" は向き (' +
                   PAINTING_GATE_DIRS.join(" / ") + ") ではありません");
      out[k] = { c: Math.round(v[0]), r: Math.round(v[1]), face: face };
    }
    return { gates: out, tw: wh.tw, th: wh.th, error: null };
  }

  /* rooms[i].painting = { theme, key } → 上と同じ 1 本を通す。 */
  function paintingGatesFor(theme, key) {
    return paintingGates(paintingEntryFor(theme, key));
  }

  /* 絵ローカルの口 × 貼り先の rect → { tx, ty, face } | null。
   * ⚠ blocked (貼り先 → 絵) と**逆向き**の写像なので、等倍でない貼り方をすると丸め 1 マス
   *   ぶん食い違いうる。ノードの絵は rect と tileBounds を一致させる規約
   *   (paintingAspectFits が縦横比の完全一致を要求する) なので実際には恒等写像。
   * ⚠ 枠外は null (捏造しない)。 */
  function paintingGateTileFor(m, dir, rect, W, H) {
    if (!m || !m.gates || !isBounds4(rect)) return null;
    var g = m.gates[dir];
    if (!g) return null;
    var rh = rect[2] - rect[0] + 1, rw = rect[3] - rect[1] + 1;
    if (rh <= 0 || rw <= 0 || !(m.tw > 0) || !(m.th > 0)) return null;
    var tx = rect[1] + Math.min(rw - 1, Math.floor(g.c * rw / m.tw));
    var ty = rect[0] + Math.min(rh - 1, Math.floor(g.r * rh / m.th));
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return null;
    return { tx: tx, ty: ty, face: g.face };
  }

  /* ROOM_PAINTINGS_DEF[theme][key].outdoor === true → その絵は空の下の情景。
   * ⭐ これも**絵に付ける** (部屋やノードに付けない)。屋外かどうかは絵が描いている内容
   *   そのものなので、屋内の絵へ差し替えたら屋外でなくなるのが正しい。
   * ⚠ テーマ単位の IS_FIELD_THEME とは別物。あちらは「シナリオまるごと屋外」。こちらは
   *   「屋内シナリオの中に 1 部屋だけある屋外」(廃坑の入口は坑道の外) を表す。 */
  function paintingOutdoor(entry) {
    return !!(entry && typeof entry === "object" && entry.outdoor === true);
  }
  function paintingOutdoorFor(theme, key) {
    return paintingOutdoor(paintingEntryFor(theme, key));
  }

  /* テーマ既定の「代表レシピ」= { counts:{kind:n}, area:n } | null。
   * 呼び出し側 (項目3 のプレビュー / 項目4 の generateScenery) は
   *     Math.round(counts[kind] * (部屋の床面積 / area) * density)
   * で任意サイズの部屋へスケールする。
   *
   * ★「代表」の作り方 = **そのテーマの全部屋エントリを合算**する (counts は種ごとに総和、
   *   area は floorBounds の面積の総和)。理由:
   *     - どのキーを「代表」に選ぶかという恣意的な判断が要らない (キーは 0/1/2 のラベルで、
   *       ROOMS の index ではないため「1 番目が代表」に意味がない)。
   *     - goblin-mine は山場 29個/280タイル に対しボス部屋 12個/396タイル と密度が 3.4 倍違う。
   *       片方だけ採ると「既定」が極端に振れる。合算なら 41/676 = その中間に落ち着く。
   *     - caravan-road は 3 部屋とも 0.29〜0.30 個/タイルでほぼ同じ = 合算しても値が変わらない。
   * ⚠ 部屋数が変わると既定密度も変わるが、それは「本編の情景が変わった」のと同義なので正しい
   *   (写経していたら追従しない部分)。 */
  function sceneryRecipeFor(themeId) {
    if (!sceneryRecipes) return null;
    var id;
    if (typeof themeId === "string" && Object.prototype.hasOwnProperty.call(sceneryRecipes, themeId)) {
      id = themeId;                                       // そのテーマ専用のレシピがある
    } else {                                              // ★無いテーマは屋外/屋内で既定へ落とす
      id = FIELD_THEME_IDS[themeId] ? SCENERY_FALLBACK_FIELD : SCENERY_FALLBACK_DUNGEON;
    }
    var per = sceneryRecipes[id];
    if (!per || typeof per !== "object") return null;
    var ks = Object.keys(per), i, e, wh, a, ck, c, counts = {}, area = 0;
    for (i = 0; i < ks.length; i++) {
      e = per[ks[i]];
      if (!e || !isBounds4(e.floorBounds) || !e.counts) continue;
      wh = boundsWH(e.floorBounds);
      a = wh.tw * wh.th;
      if (!(a > 0)) continue;
      area += a;
      ck = Object.keys(e.counts);
      for (c = 0; c < ck.length; c++) counts[ck[c]] = (counts[ck[c]] || 0) + e.counts[ck[c]];
    }
    if (!(area > 0)) return null;
    return { counts: counts, area: area };
  }

  // SCENERY_SHEETS のキー一覧 (= 置ける情景の種)。⚠ 未取得なら空配列。
  function sceneryKinds() { return scenerySheets ? Object.keys(scenerySheets) : []; }

  /* ══════════════════════════════════════════════════════════════════════════
   * ★Phase 6 — 情景物を 1 個ずつ置く (mapDef.props) の土台
   * ══════════════════════════════════════════════════════════════════════════
   * rooms[i].scenery = { density } が「撒く」なら、props は「置く」。両者は併存する
   * (撒いた上に置ける)。⚠ props は **rooms ではなくトップレベル**に持つ:
   *   ・部屋の外 (廊下・自由タイルで描いた坑道) にも置きたい
   *   ・tiles と同じ「幾何」側 = 焼き固め方式と一貫し、**部屋を動かしても物は動かない**
   *   (rooms は意味 = ボス部屋はどこか / 罠を置かない部屋はどこか、を持ち続ける) */

  /* 種の日本語の呼び名。⚠ **キー名の訳語**であって絵の内容ではないので、絵が差し替わっても
   *   腐らない (PAINTING_KEY_LABELS と同じ判断)。未知の種はキーそのものを出す = 取りこぼしゼロ。 */
  var PROP_KIND_LABELS = {
    grass: "草の房", reed: "葦", log: "倒木", detail: "小物",
    rubble: "瓦礫", cart: "トロッコ", rail: "線路",
    pillar: "石柱", chair: "椅子", table: "テーブル", wreck: "壊れた馬車",
    /* ⚠ rail (散布用の縦3変種) とは**別の種**。呼び名で見分けが付くようにしてある
     *   — パレットに「線路 1..3」と「線路(つなぐ) 1..6」が並ぶ。 */
    railKit: "線路(つなぐ)",
    /* ★STEP 3: 線路と同じ 6 ピース規約でつながるもう 1 種。川・水路を手で引く用。 */
    waterKit: "水の流れ",
  };
  function propKindLabel(kind) { return PROP_KIND_LABELS[kind] || String(kind); }

  /* 種 × variant → 画面上の描画サイズ {dw, dh}。
   * ⭐ 式は index.html:5686-5688 の描画と**同一**:  scale = displayMax / max(fr.w, fr.h)
   *   ここを別式にすると「エディタで見た大きさと本編の大きさが違う」= 今回の最優先条件
   *   (キャラとスケールが合っていること) がエディタ上で確かめられなくなる。
   * ⚠ displayMax は number | number[] の両対応 (混載シートは variant 別の配列 = detail/rubble/reed)。 */
  function propDrawSize(kind, variant) {
    if (!scenerySheets || !sceneryFrames) return null;
    var sheet = scenerySheets[kind], arr = sceneryFrames[kind];
    if (!sheet || !Array.isArray(arr)) return null;
    var v = Math.round(isNum(variant) ? variant : 0);
    var fr = arr[v];
    if (!fr || !(fr.w > 0) || !(fr.h > 0)) return null;
    var dm = Array.isArray(sheet.displayMax) ? sheet.displayMax[v] : sheet.displayMax;
    if (!isNum(dm) || dm <= 0) return null;
    var scale = dm / Math.max(fr.w, fr.h);
    return { dw: fr.w * scale, dh: fr.h * scale };
  }

  /* 種 × variant → 塞ぐマス数 {tw, th}。
   * ⭐ **描画サイズから導出する**(絵の大きさと当たり判定を別々に手入力しない)。
   *   恒久教訓14「displayMax は当たり判定に無関係」は**散布経路の話**で、そこではどんな
   *   大きさの物も一律 1 マスだった。個別配置では「柱やテーブルを置いたらキャラが入れない」
   *   がユーザー要件なので、**見えている大きさ = 塞ぐ範囲**をここで結び付ける。
   * ⚠ ceil ではなく round。ceil だと 200px のトロッコが 3 マスを塞ぎ、絵より広く通れなくなる。 */
  function propFootprint(kind, variant) {
    var s = propDrawSize(kind, variant);
    if (!s) return { tw: 1, th: 1 };
    return { tw: Math.max(1, Math.round(s.dw / GRID_TILE)),
             th: Math.max(1, Math.round(s.dh / GRID_TILE)) };
  }

  /* 種 × variant が通行不能か (= 本編の obstacleTileMask に積まれるか)。
   * ⚠ 判断は**カタログ (SCENERY_SHEETS.blocking) が唯一の正**。prop ごとの上書きは持たない。
   *   持たせると「エディタでは通れないのに本編では通れる」個体が作れてしまう。 */
  function propBlocking(kind, variant) {
    if (!scenerySheets) return false;
    var sheet = scenerySheets[kind];
    if (!sheet || !Array.isArray(sheet.blocking)) return false;
    return !!sheet.blocking[Math.round(isNum(variant) ? variant : 0)];
  }

  /* UI (パレット) と lint が使う平坦なカタログ。
   *   [{ kind, variant, label, src, frame, dw, dh, wcm, hcm, sizeLabel, blocking, tw, th }, …]
   * ★wcm / hcm / sizeLabel が「キャラとスケールが合っているか」を目で確かめるための実寸。
   * ⚠ 未取得なら **空配列** (null だと呼び出し側の .map が落ちる)。 */
  function propEntries() {
    if (!scenerySheets || !sceneryFrames) return [];
    var out = [], kinds = Object.keys(scenerySheets), i, j, arr, sz, fp, nm;
    for (i = 0; i < kinds.length; i++) {
      arr = sceneryFrames[kinds[i]];
      if (!Array.isArray(arr)) continue;
      nm = propKindLabel(kinds[i]);
      for (j = 0; j < arr.length; j++) {
        sz = propDrawSize(kinds[i], j);
        if (!sz) continue;
        fp = propFootprint(kinds[i], j);
        out.push({
          kind: kinds[i], variant: j,
          label: nm + " " + (j + 1),
          src: scenerySheets[kinds[i]].src,
          frame: { x: arr[j].x, y: arr[j].y, w: arr[j].w, h: arr[j].h },
          dw: sz.dw, dh: sz.dh,
          wcm: pxToCm(sz.dw), hcm: pxToCm(sz.dh),
          sizeLabel: cmLabel(pxToCm(sz.dw)) + " × " + cmLabel(pxToCm(sz.dh)),
          blocking: propBlocking(kinds[i], j),
          tw: fp.tw, th: fp.th,
        });
      }
    }
    return out;
  }

  /* mapDef.props → 塞ぐタイルの index 配列。
   *   本編の obstacleTileMask / エディタの lint / エディタのプレビューが**この 1 本**を共有する。
   * ⚠ blocking でない種は 1 マスも積まない (草や線路の上は歩ける)。
   * ⚠ フットプリントは配置タイルを**中心**に広げる (描画も中心合わせのため。左上起点にすると
   *   絵と塞ぐ範囲が半マスずれる)。奇数幅は左右対称、**偶数幅は右/下へ 1 マス伸びる**
   *   (例: 幅2 なら tx と tx+1)。この非対称は仕様 — 変えるなら本編とエディタの両方が
   *   propBlockedTiles を共有しているので**ここ 1 箇所**を直せば足りる。 */
  function propBlockedTiles(d) {
    var out = [];
    if (!d || !Array.isArray(d.props)) return out;
    var W = (d.grid && isNum(d.grid.w)) ? d.grid.w : GRID_W;
    var H = (d.grid && isNum(d.grid.h)) ? d.grid.h : GRID_H;
    for (var i = 0; i < d.props.length; i++) {
      var p = d.props[i];
      if (!p || !propBlocking(p.kind, p.variant)) continue;
      var fp = propFootprint(p.kind, p.variant);
      var c0 = p.tx - Math.floor((fp.tw - 1) / 2), r0 = p.ty - Math.floor((fp.th - 1) / 2);
      for (var r = r0; r < r0 + fp.th; r++) {
        for (var c = c0; c < c0 + fp.tw; c++) {
          if (r < 0 || r >= H || c < 0 || c >= W) continue;
          out.push(r * W + c);
        }
      }
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * ★STEP 2.5 / 3 — つながる情景物 (接続キット) の自動接続
   * ══════════════════════════════════════════════════════════════════════════
   * ユーザー要望「プラレールみたいに上下左右つなげれる構造」の本体。置いた物と、
   * その周りの**同じ種**が、隣り合っていれば自動でつながる形 (縦/横/カーブ) に選び直される。
   *
   * ⭐ 接続規則は**ここが唯一の正**。エディタは connectKitRelinkAround() を呼ぶだけで、
   *   規則を 1 行も持たない (テクスチャ表 / 情景レシピと同じ「写経しない」方針)。
   *
   * ⭐ 種は kind パラメータで受ける = 「6 ピースを下の並びで用意したシート」でありさえすれば、
   *   線路でも水路でも**同じ機構 1 つ**で動く。どの種がつながるかは CONNECT_KIT_KINDS が
   *   唯一の正で、種を足すときはその配列に 1 行足すだけ (規則の写しを作らない)。
   *
   * ⚠ **同じ種どうしだけがつながる**。隣に別の種 (別のキット / 石柱 / 散布物) があっても
   *   mask は立たない。判定は kind の一致のみ (variant は問わない)。
   *
   * ⚠⚠ **読み込み経路では絶対に呼ばないこと** (importJSON / プリセット / 矩形に戻す)。
   *   読み込んだデータが唯一の正で、そこで再計算すると往復同一性
   *   (export → import → export が 1 バイトも変わらない) が壊れる。自動接続は
   *   「エディタ上でユーザーが置く / 動かす / 消す / 種を差し替える」経路だけに効かせる。
   *
   * ⚠ 既存の散布 rail (縦3変種) とは**別種**。近傍として数えるのは railKit だけで、
   *   rail はタイルに整列していない (hash 散布) ので混ぜると意味が壊れる。 */

  var RAIL_KIT_KIND = "railKit";          // ★種キー (index.html の SCENERY_SHEETS と同じ綴り)
  var WATER_KIT_KIND = "waterKit";        // ★STEP 3: 水の流れ。線路と同じ 6 ピース規約

  /* ★つながる種の一覧 = **ここが唯一の正**。エディタも純関数もこの配列だけを見る。
   * ⚠ 種を足すのはここへ 1 行だけ。規則 (RAIL_VARIANT_MASKS / フォールバック) の写しは作らない。
   * ⚠ 並んでいても**互いにはつながらない** (mask は同じ kind しか数えない)。 */
  var CONNECT_KIT_KINDS = [RAIL_KIT_KIND, WATER_KIT_KIND];

  var RAIL_N = 1, RAIL_E = 2, RAIL_S = 4, RAIL_W = 8;

  /* variant → その絵が接続している辺のマスク。接続キットのシート (tools/ 側のジェネレータが
   *   書き出したコマ順。画像名も枠座標も index.html 側にしか無い) と 1 対 1:
   *     0 = 縦(N+S)  1 = 横(E+W)  2 = 北東  3 = 東南  4 = 南西  5 = 西北
   * ⚠ **並び順は保存値そのもの**なので絶対に変えない (保存済みマップが化ける)。
   * ⚠ T 字 / 十字 / 終端のピースは**作らないと決定済み** (6 種で打ち止め)。
   * ⚠ 種が増えても表は 1 つ = すべての接続キットがこの並びを共有する規約。 */
  var RAIL_VARIANT_MASKS = [
    RAIL_N | RAIL_S,   // 0 → 5   ┃
    RAIL_E | RAIL_W,   // 1 → 10  ━
    RAIL_N | RAIL_E,   // 2 → 3   ┗
    RAIL_E | RAIL_S,   // 3 → 6   ┏
    RAIL_S | RAIL_W,   // 4 → 12  ┓
    RAIL_W | RAIL_N,   // 5 → 9   ┛
  ];

  // 近傍を舐める順 (北→東→南→西)。dx/dy はタイル座標の差分。
  var RAIL_DIRS = [
    { dx:  0, dy: -1, bit: RAIL_N },
    { dx:  1, dy:  0, bit: RAIL_E },
    { dx:  0, dy:  1, bit: RAIL_S },
    { dx: -1, dy:  0, bit: RAIL_W },
  ];

  /* kind が「つながる種」か。
   * ⚠ 辞書オブジェクトの `in` / `[kind]` 参照だと Object.prototype 汚染や "toString" 等の
   *   継承プロパティで真になりうるので、**配列を舐めて厳密一致**で判定する。 */
  function isConnectKit(kind) {
    if (typeof kind !== "string" || !kind) return false;
    for (var i = 0; i < CONNECT_KIT_KINDS.length; i++)
      if (CONNECT_KIT_KINDS[i] === kind) return true;
    return false;
  }

  /* mask (N=1 / E=2 / S=4 / W=8) → variant index。★全キット共通の規約。
   * ⭐ **孤立 (mask 0) は null** を返す = 「変更しない」の合図。ユーザーがカーブを 1 個だけ
   *   意図して置いたときに、勝手に直線へ化けるのを防ぐ。
   * フォールバック (ピースが 6 種しかないので 6 通り以外は寄せる)。**判定順が仕様**:
   *   ①上表の 6 通り (5/10/3/6/12/9)  → その variant
   *   ②北と南を両方含む (7/13/15)     → 0 (縦)   ← T 字も十字もここへ落ちる
   *   ③東と西を両方含む (11/14)       → 1 (横)
   *   ④1 方向だけ (終端) 北/南 (1/4)  → 0 (縦)
   *   ⑤1 方向だけ (終端) 東/西 (2/8)  → 1 (横)
   *   ⑥mask 0 (孤立)                  → null (今の variant を保つ) */
  function connectKitVariantForMask(mask) {
    if (!isNum(mask)) return null;
    var m = Math.round(mask) & 15, i;
    for (i = 0; i < RAIL_VARIANT_MASKS.length; i++)
      if (RAIL_VARIANT_MASKS[i] === m) return i;                   // ①
    if ((m & (RAIL_N | RAIL_S)) === (RAIL_N | RAIL_S)) return 0;   // ② 7 / 13 / 15
    if ((m & (RAIL_E | RAIL_W)) === (RAIL_E | RAIL_W)) return 1;   // ③ 11 / 14
    if (m === RAIL_N || m === RAIL_S) return 0;                    // ④ 終端 (縦)
    if (m === RAIL_E || m === RAIL_W) return 1;                    // ⑤ 終端 (横)
    return null;                                                   // ⑥ m === 0 = 孤立
  }

  // その prop が (tx,ty) に居る kind か。⚠ 種の判定は kind のみ (variant は問わない)。
  function isConnectKitAt(p, tx, ty, kind) {
    return !!p && p.kind === kind && (p.tx | 0) === tx && (p.ty | 0) === ty;
  }

  /* props 配列の中で (tx,ty) の**上下左右**に同じ kind が居るか → ビットマスク。
   * ⚠ (tx,ty) 自身は見ない。あくまで「隣に同種があるか」だけを測る。
   * ⚠ 別種は 1 つも数えない = 線路と水路が並んでも互いに影響しない。 */
  function connectKitMaskAt(props, tx, ty, kind) {
    if (!Array.isArray(props)) return 0;
    if (typeof kind !== "string" || !kind) return 0;
    tx = tx | 0; ty = ty | 0;
    var mask = 0, d, i, nx, ny;
    for (d = 0; d < RAIL_DIRS.length; d++) {
      nx = tx + RAIL_DIRS[d].dx; ny = ty + RAIL_DIRS[d].dy;
      for (i = 0; i < props.length; i++)
        if (isConnectKitAt(props[i], nx, ny, kind)) { mask |= RAIL_DIRS[d].bit; break; }
    }
    return mask;
  }

  /* (tx,ty) にある kind を近傍に合わせて選び直す。戻り = 書き換えた個数。
   * ⚠ そのタイルに同種が無ければ何もしない (= 0)。同じタイルに複数あれば全部そろえる。
   * ⚠ つながる種でなければ 1 個も触らない (石柱の variant を勝手に書き換えない)。 */
  function connectKitRelinkAt(props, tx, ty, kind) {
    if (!Array.isArray(props)) return 0;
    if (!isConnectKit(kind)) return 0;
    tx = tx | 0; ty = ty | 0;
    var v = connectKitVariantForMask(connectKitMaskAt(props, tx, ty, kind));
    if (v === null) return 0;                       // 孤立 = 今の形を保つ
    var n = 0, i;
    for (i = 0; i < props.length; i++) {
      if (!isConnectKitAt(props[i], tx, ty, kind)) continue;
      if (props[i].variant !== v) { props[i].variant = v; n++; }
    }
    return n;
  }

  /* ★エディタが呼ぶのはこれ 1 本。自分 + 上下左右 4 近傍を選び直す。戻り = 書き換えた個数。
   * ⚠ 各タイルの結果は「同種がどこにあるか」だけで決まり、他タイルの variant には
   *   依存しない = 何度呼んでも同じ (冪等)。移動は移動元と移動先で 2 回呼べば足りる。 */
  function connectKitRelinkAround(props, tx, ty, kind) {
    if (!Array.isArray(props)) return 0;
    if (!isConnectKit(kind)) return 0;
    tx = tx | 0; ty = ty | 0;
    var n = connectKitRelinkAt(props, tx, ty, kind), d;
    for (d = 0; d < RAIL_DIRS.length; d++)
      n += connectKitRelinkAt(props, tx + RAIL_DIRS[d].dx, ty + RAIL_DIRS[d].dy, kind);
    return n;
  }

  /* ── railKit 専用の別名 (kind 固定の薄いラッパ) ────────────────────────────
   * 既存の呼び口と検証ドライバがこの名前を名指ししているので、名前も戻り値もそのまま残す。
   * 中身は上の汎用版に 1 段渡すだけ = 規則の写しはどこにも無い。 */
  function railVariantForMask(mask) { return connectKitVariantForMask(mask); }
  function isRailKitAt(p, tx, ty) { return isConnectKitAt(p, tx, ty, RAIL_KIT_KIND); }
  function railKitMaskAt(props, tx, ty) { return connectKitMaskAt(props, tx, ty, RAIL_KIT_KIND); }
  function railKitRelinkAt(props, tx, ty) { return connectKitRelinkAt(props, tx, ty, RAIL_KIT_KIND); }
  function railKitRelinkAround(props, tx, ty) { return connectKitRelinkAround(props, tx, ty, RAIL_KIT_KIND); }

  /* ══════════════════════════════════════════════════════════════════════════
   * ★P1 (扉システム) — データ層のみ
   * ══════════════════════════════════════════════════════════════════════════
   * 出所は Codex スキルの proposals/door-system.md。ただし DF は**完全オートバトル**で
   * 「扉の隣に立って操作ボタンを押す」入力が原理的に無いため、提案のフィールドをそのまま
   * 写さず**持つ意味があるものだけ**を採る。落としたものと理由:
   *
   *   blocking       … state から算出できる (doorBlocks)。二重に持つと「表示は開いているのに
   *                    通れない」食い違いを**データで表現できてしまう** = 提案自身が禁じている
   *                    状態そのもの。fixProp が blocking を持たないのとまったく同じ判断。
   *   locked         … state:"locked" に統一 (提案も「どちらかに統一してよい」と明記)。
   *                    locked:true かつ state:"open" のような無意味な組を作れなくする。
   *   interactable   … オートバトルなので「個別の操作対象」という概念が無い。扉を開ける唯一の
   *                    入口は出口選択 (index.html の chooseExit) で、そこに来ない扉は
   *                    原理的に触れない。個体フラグにしても誰も読まない。
   *   openDurationMs … 演出の定数。個体ごとに変える理由が無いので描画側が 1 つ持つ。
   *   width/height   … 出口の口は nodeGateTile が返す **1 タイル**。大型扉が要るときに
   *                    ここへ 2 キー足せばよい (sanitize の既定値 1 で後方互換になる)。
   *   target         … ⚠⚠ **最も重要な不採用**。行き先は分岐グラフの exits が唯一の正で、
   *                    扉にも書くと出所が 2 つになる。これは exitsWithReturn が
   *                    「親への戻りはデータに書かない — 手書きすると必ず食い違う」として
   *                    既に避けている失敗と同型。扉は**タイルで同定**し、行き先は
   *                    そのタイルに立つ exit から引く。
   *
   * ⚠ 本項目は**純粋なデータ層**。buildMapData も isTileWall も 1 命令も触らないので
   *   ゲームの挙動は 1bit も変わらない (Phase 3 項目1 の tiles と同じ進め方)。
   * ────────────────────────────────────────────────────────────────────────── */
  var DOOR_STATES = ["closed", "open", "locked", "broken", "hidden"];
  var DOOR_ORIENTATIONS = ["horizontal", "vertical"];

  /* 「この状態の扉はマスを塞ぐか」= **唯一の正**。P3 で isTileWall がこれを呼ぶ。
   * ⚠⚠ 通すのは "open" と "broken" **だけ**で、未知の状態は塞ぐ側へ倒す。扉の判定で
   *   fail-open (通れてしまう) は「閉じた扉をすり抜けた」= 提案の完了条件を真正面から
   *   破るため、既定は必ず fail-safe 側にする。sanitize も未知の state を "closed" へ
   *   寄せるので二重に守られるが、**どちらか片方に頼らない**。
   * ⚠ "broken" を通行可能に倒したのは設計判断。提案は「完全通行可能または瓦礫による
   *   一部阻害」の両方を許しているが、一部阻害は「壊したのに通れない」= プレイヤーから
   *   見て結果が読めないため採らない。瓦礫を残したいときは props の情景物で置く。
   * ⚠ "hidden" は壁として表示する状態なので当然塞ぐ。発見後に closed / locked へ遷移する。 */
  function doorBlocks(state) {
    return !(state === "open" || state === "broken");
  }

  // ── 既定値 (現行 index.html の値そのまま) ────────────────────────────────
  // 後方互換は「分岐」ではなく「既定値」で担保する。Phase 1 の resolve() が
  // mapDef 不在時にこの2つを返す = 既存6シナリオは 1bit も変わらない。
  //   ROOMS_DUNGEON  index.html:3267-3270
  //   ROOMS_FIELD    index.html:3271-3275
  //   CORRIDORS      index.html:3279-3281
  //   ROOM_SLOTS / BOSS_SLOT  tavern.html:2555-2558
  var ROOM_SLOTS_DEFAULT = [[27,13],[28,13],[28,14],[39,13],[40,13],[39,14],[41,14],[42,13]];

  var DEFAULT_DUNGEON = {
    schema: SCHEMA,
    id: "df-default-dungeon",
    name: "既定ダンジョン (山場 + ボス)",
    grid: { w: GRID_W, h: GRID_H, tile: GRID_TILE },
    themeId: "goblin-mine",
    rooms: [
      { id: "r0", role: "start", rect: [ 7, 24, 20, 43],   // 道中(山場): 1枚絵+罠+混成戦
        enemySlots: ROOM_SLOTS_DEFAULT.map(function (s) { return s.slice(); }),
        bossSlot: null, painting: null, scenery: null },
      { id: "r1", role: "boss",  rect: [ 5, 47, 22, 68],   // ボス部屋
        enemySlots: [], bossSlot: [57, 13], painting: null, scenery: null },
    ],
    corridors: [ [13, 43, 15, 47] ],                        // 山場→ボスのみ
    start: { tx: 24, ty: 13 },
    objective: { kind: "visitRooms", count: null },          // null = 従来式 rooms.length-1
    tiles: null,                                             // Phase 3: { enc:"rle", data:"..." }
    props: null,                                             // Phase 6: [{kind,variant,tx,ty}, …]
    /* ★P2 (分岐マップ): { entry, nodes:[{id,kind,mapDef,exits}] } | null。
     * ⚠⚠ プリセット literal 側にも**書かなければならない**。sanitize が out に graph:null を
     *   作るので、ここに無いと driver_mapeditor §4 2c/2d の「往復後の mapDef が
     *   DEFAULT_DUNGEON と deep-equal」が**キーの有無だけで**落ちる
     *   (tiles / props とまったく同じ理由でこの 1 行が要る)。 */
    graph: null,
    /* ★P1 (扉): tiles / props / graph とまったく同じ流儀。**プリセット literal 側にも
     *   書かなければならない** — sanitize が out に doors:null を作るので、ここに無いと
     *   driver_mapeditor §4 2c/2d の「往復後の mapDef が DEFAULT_DUNGEON と deep-equal」が
     *   **キーの有無だけで**落ちる。 */
    doors: null,
    flags: { bandMask: false },
  };

  var DEFAULT_FIELD = {
    schema: SCHEMA,
    id: "df-default-field",
    name: "既定 屋外・隊商護衛 (導入 + 山場 + ボス)",
    grid: { w: GRID_W, h: GRID_H, tile: GRID_TILE },
    themeId: "caravan-road",
    rooms: [
      { id: "r0", role: "start", rect: [ 8,  2, 19, 20],   // 導入+前哨 (起点 (6,13) を内包)
        enemySlots: [], bossSlot: null, painting: null, scenery: null },
      { id: "r1", role: null,    rect: [ 7, 24, 20, 43],   // 山場・大広間
        enemySlots: ROOM_SLOTS_DEFAULT.map(function (s) { return s.slice(); }),
        bossSlot: null, painting: null, scenery: null },
      { id: "r2", role: "boss",  rect: [ 5, 47, 22, 68],   // ボス部屋
        enemySlots: [], bossSlot: [57, 13], painting: null, scenery: null },
    ],
    corridors: [ [13, 20, 15, 24], [13, 43, 15, 47] ],      // 導入→山場, 山場→ボス
    start: { tx: 6, ty: 13 },
    objective: { kind: "visitRooms", count: null },
    tiles: null,
    props: null,
    graph: null,                                             // ★P2 (分岐マップ)。DEFAULT_DUNGEON の注記を参照
    /* ⚠ 屋外 (caravan-road) は分岐対象外。bandMask が row13-15 以外を全潰しするので上下分岐と
     *   原理的に非互換 (resolve() が既に屋外×カスタム幾何を排他にしている)。ここは常に null。 */
    doors: null,                                             // ★P1 (扉)。DEFAULT_DUNGEON の注記を参照
    // 屋外は row 13-15 以外を潰す帯マスクが掛かる (index.html:3323-3328)。
    // ⚠ カスタム幾何との相互作用が複雑なので、項目5 の lint で排他にする予定。
    flags: { bandMask: true },
  };

  // ── sanitize: 欠損・型崩れを既定値で埋めて df-map/1 の形に整える ─────────
  // 外から来た JSON (ファイル読込 / sessionStorage) は必ずここを通す。
  function sanitize(src, fallback) {
    var base = fallback || DEFAULT_DUNGEON;
    var d = (src && typeof src === "object") ? src : {};
    var g = (d.grid && typeof d.grid === "object") ? d.grid : {};
    var out = {
      schema: SCHEMA,
      id: (typeof d.id === "string" && d.id) ? d.id : base.id,
      name: (typeof d.name === "string" && d.name) ? d.name : base.name,
      grid: {
        // Phase 3 までは 72/28/96 固定 (validate で強制)。ここでは既定へ丸める。
        w: isNum(g.w) ? Math.round(g.w) : GRID_W,
        h: isNum(g.h) ? Math.round(g.h) : GRID_H,
        tile: isNum(g.tile) ? Math.round(g.tile) : GRID_TILE,
      },
      themeId: (THEME_IDS.indexOf(d.themeId) >= 0) ? d.themeId : base.themeId,
      rooms: [],
      corridors: [],
      start: { tx: 0, ty: 0 },
      objective: { kind: "visitRooms", count: null },
      tiles: (d.tiles && typeof d.tiles === "object") ? clone(d.tiles) : null,
      /* ★Phase 6: 空のときは **null** (空配列ではない)。tiles とまったく同じ流儀。
       *   既定プリセット 2 種も props:null なので、driver_mapeditor §4 2c/2d の
       *   往復同一性 deep-equal は 1 バイトも変わらない (最重要の不変条件)。 */
      props: null,
      /* ★P2 (分岐マップ): tiles とまったく同じ流儀。オブジェクトなら clone、それ以外は null。
       * ⚠ ここで**中身を検査しない**のも tiles と同じ。壊れた graph は null へ潰さず素通しさせ、
       *   「未指定」と「壊れている」を validate() の graph-bad が区別して知らせる
       *   (ここで潰すと壊れたデータが黙って矩形進行へ落ちる = silent fail-open)。
       * ⚠ 既定プリセット 2 種も graph:null なので往復同一性 deep-equal は 1 バイトも変わらない。 */
      graph: (d.graph && typeof d.graph === "object") ? clone(d.graph) : null,
      /* ★P1 (扉): props とまったく同じ流儀。空のときは **null** (空配列ではない)。
       *   既定プリセット 2 種も doors:null なので往復同一性 deep-equal は 1 バイトも変わらない。 */
      doors: null,
      flags: { bandMask: false },
    };
    var W = out.grid.w, H = out.grid.h;

    function fixRect(rect) {
      if (!Array.isArray(rect) || rect.length < 4) return null;
      var r1 = clampInt(rect[0], 0, H - 1), c1 = clampInt(rect[1], 0, W - 1);
      var r2 = clampInt(rect[2], 0, H - 1), c2 = clampInt(rect[3], 0, W - 1);
      if (r2 < r1) { var tr = r1; r1 = r2; r2 = tr; }      // 逆転していても救う
      if (c2 < c1) { var tc = c1; c1 = c2; c2 = tc; }
      return [r1, c1, r2, c2];
    }
    /* スロット = [tx, ty] (おまかせ) | [tx, ty, "goblin"] (種類固定) の**両対応**。
     * ⭐ 3 つ目は **normEnemyKey が非 null を返したときだけ**足す。
     *    それ以外 (undefined / null / 空文字 / 数値 / 記号だけ) は **2 要素で返す**。
     *    これにより既存プリセット (2 要素) は sanitize を何度通しても 2 要素のまま =
     *    §4 2c/2d の往復同一性 deep-equal が 1 バイトも変わらない (最重要の不変条件)。
     * ⚠ 未知のキー (カタログに無い) は**落とさない**。ゲーム側で敵が増えたとき、
     *   古いエディタが黙って種類指定を消すのが最悪 → lint の warning で知らせるだけにする。 */
    function fixSlot(s) {
      if (!Array.isArray(s) || s.length < 2) return null;
      var out = [clampInt(s[0], 0, W - 1), clampInt(s[1], 0, H - 1)];   // [tx, ty]
      var kind = normEnemyKey(s[2]);
      if (kind) out.push(kind);
      return out;
    }

    /* ── ★Phase 4 項目2: painting / scenery の**形**を確定する ─────────────────
     *  Phase 3 までは「オブジェクトなら素通し (clone)」だったので、{src:"…"} のような
     *  別方式の指定も density が文字列の壊れた値も、そのまま mapDef に住み続けていた。
     *  ここで**形が正しいものだけ**を採り、それ以外は null へ潰す。
     *
     *  ⚠⚠ 往復同一性 (export → import → export の deep-equal) を壊さないこと。
     *    既存プリセットは painting / scenery とも null なので **null のまま**通り、
     *    driver_mapeditor.js §4 2c/2d の deep-equal は 1 バイトも変わらない。
     *    採る場合も新品の { theme, key } / { density } を**組み直す**ので余計なキーが
     *    残らない = 何度 sanitize を通しても同じ形へ収束する (冪等)。
     *
     *  ⚠ **未知の theme / key は落とさない**。fixSlot の未知の敵キーとまったく同じ判断で、
     *    本編で絵が増えたときに古いエディタが黙って指定を消すのが最悪。形が正しければ通し、
     *    「カタログから引けない」ことは lint の painting-missing (warning) が知らせる。 */
    function fixPainting(p) {
      if (!p || typeof p !== "object" || Array.isArray(p)) return null;
      var theme = p.theme, key = p.key;
      if (typeof theme !== "string" || !theme) return null;
      // ROOM_PAINTINGS_DEF のキーは 1 / 2 の**数値リテラル**なので数値で来ても文字列へ寄せる
      // (paintingSrcFor も内部で String(key) するため、揃えないと往復で形が振れる)。
      if (isNum(key)) key = String(key);
      if (typeof key !== "string" || !key) return null;
      return { theme: theme, key: key };
    }
    function fixScenery(s) {
      if (!s || typeof s !== "object" || Array.isArray(s)) return null;
      if (!isNum(s.density) || s.density <= 0 || s.density > SCENERY_DENSITY_MAX) return null;
      return { density: s.density };
    }

    /* ★Phase 6: 個別に置いた情景物。{ kind, variant, tx, ty } の 4 キーだけを採り、
     *   それ以外は落とす (新品を組み直すので何度通しても同じ形へ収束する = 冪等)。
     * ⚠ **未知の kind は落とさない**。fixSlot の未知の敵キー / fixPainting の未知テーマと
     *   まったく同じ判断で、本編に情景の種が増えたとき古いエディタが黙って消すのが最悪。
     *   「カタログから引けない」ことは lint の prop-unknown-kind (warning) が知らせる。
     * ⚠ blocking は**持たない**。カタログ (SCENERY_SHEETS.blocking) が唯一の正で、
     *   個体ごとの上書きを許すと「エディタでは通れないのに本編では通れる」物が作れる。 */
    function fixProp(p) {
      if (!p || typeof p !== "object" || Array.isArray(p)) return null;
      if (typeof p.kind !== "string" || !p.kind) return null;
      if (!isNum(p.tx) || !isNum(p.ty)) return null;      // 座標が無い物は救わない (0,0 に湧く)
      var v = isNum(p.variant) ? Math.round(p.variant) : 0;
      if (v < 0) v = 0;
      return { kind: p.kind, variant: v,
               tx: clampInt(p.tx, 0, W - 1), ty: clampInt(p.ty, 0, H - 1) };
    }

    /* ★P1: 扉。{ id, tx, ty, orientation, state, requiredKey } の **6 キーだけ**を採る。
     *   fixProp とまったく同じく新品を組み直すので、何度 sanitize を通しても同じ形へ収束する
     *   (冪等)。採らなかったフィールドと理由は DOOR_STATES の節頭にまとめてある。
     * ⚠ state / orientation は**閉じた列挙**として扱い、未知の値は既定へ寄せる
     *   (rooms[].role と同じ)。graph の node.kind のように素通しにはしない — 未知の状態には
     *   通行判定が定義できず、doorBlocks が「塞ぐ」を返す以上、データ側も塞ぐ側の既定
     *   ("closed") へ寄せるのが一貫する。
     * ⚠ id が無い扉は**捨てない**。セーブとイベントの参照キーなので、無ければ通し番号で
     *   採番する (rooms[].id とまったく同じ扱い)。id の重複は lint の door-duplicate が知らせる。
     * ⚠ 座標が無い扉だけは救わない (0,0 に湧いて誰も気づけない = fixProp と同じ判断)。 */
    function fixDoor(dr, idx) {
      if (!dr || typeof dr !== "object" || Array.isArray(dr)) return null;
      if (!isNum(dr.tx) || !isNum(dr.ty)) return null;
      return {
        id: (typeof dr.id === "string" && dr.id) ? dr.id : ("d" + idx),
        tx: clampInt(dr.tx, 0, W - 1),
        ty: clampInt(dr.ty, 0, H - 1),
        orientation: (DOOR_ORIENTATIONS.indexOf(dr.orientation) >= 0) ? dr.orientation : "vertical",
        state: (DOOR_STATES.indexOf(dr.state) >= 0) ? dr.state : "closed",
        requiredKey: (typeof dr.requiredKey === "string" && dr.requiredKey) ? dr.requiredKey : null,
      };
    }

    var srcRooms = Array.isArray(d.rooms) ? d.rooms : base.rooms;
    for (var i = 0; i < srcRooms.length; i++) {
      var r = srcRooms[i] || {};
      var rect = fixRect(r.rect);
      if (!rect) continue;                                  // 矩形が壊れている部屋は捨てる
      var role = (r.role === "start" || r.role === "boss") ? r.role : null;
      var slots = [];
      if (Array.isArray(r.enemySlots)) {
        for (var j = 0; j < r.enemySlots.length; j++) {
          var s = fixSlot(r.enemySlots[j]);
          if (s) slots.push(s);
        }
      }
      out.rooms.push({
        id: (typeof r.id === "string" && r.id) ? r.id : ("r" + out.rooms.length),
        role: role,
        rect: rect,
        enemySlots: slots,
        bossSlot: fixSlot(r.bossSlot),
        painting: fixPainting(r.painting),
        scenery: fixScenery(r.scenery),
      });
    }

    var srcCorr = Array.isArray(d.corridors) ? d.corridors : base.corridors;
    for (var k = 0; k < srcCorr.length; k++) {
      var cr = fixRect(srcCorr[k]);
      if (cr) out.corridors.push(cr);
    }

    /* ★Phase 6: props。⚠ **fallback を見ない**。rooms / corridors は「指定が無ければ既定の
     *   マップ形状を使う」のが正しいが、props は「指定が無い = 何も置いていない」が正しい。
     *   base から引き継ぐと、新規マップに既定プリセットの物が勝手に湧く。 */
    if (Array.isArray(d.props)) {
      var propsOut = [];
      for (var pi = 0; pi < d.props.length; pi++) {
        var fp0 = fixProp(d.props[pi]);
        if (fp0) propsOut.push(fp0);
      }
      if (propsOut.length) out.props = propsOut;            // 空なら null のまま (往復同一性)
    }

    /* ★P1: doors。props とまったく同じ流儀で **fallback を見ない**。rooms / corridors は
     *   「指定が無ければ既定のマップ形状を使う」のが正しいが、扉は「指定が無い = 扉が無い」が
     *   正しい。base から引き継ぐと新規マップに既定プリセットの扉が勝手に湧く。 */
    if (Array.isArray(d.doors)) {
      var doorsOut = [];
      for (var di = 0; di < d.doors.length; di++) {
        var fd0 = fixDoor(d.doors[di], doorsOut.length);
        if (fd0) doorsOut.push(fd0);
      }
      if (doorsOut.length) out.doors = doorsOut;            // 空なら null のまま (往復同一性)
    }

    var st = (d.start && typeof d.start === "object") ? d.start : base.start;
    out.start = { tx: clampInt(st.tx, 0, W - 1), ty: clampInt(st.ty, 0, H - 1) };

    var ob = (d.objective && typeof d.objective === "object") ? d.objective : base.objective;
    out.objective = {
      kind: (typeof ob.kind === "string" && ob.kind) ? ob.kind : "visitRooms",
      count: isNum(ob.count) ? Math.round(ob.count) : null,
    };

    var fl = (d.flags && typeof d.flags === "object") ? d.flags : base.flags;
    out.flags = { bandMask: !!fl.bandMask };

    return out;
  }

  // ── validate: 構造の妥当性チェック ────────────────────────────────────────
  // ⚠ ここは「スキーマとして壊れていないか」だけを見る。到達可能性・スロットが壁に乗って
  //   いないか等は**出発前 lint (lintMapDef)** の担当 (責務を混ぜない)。
  // ★項目5 での変更: 戻り値に issues[] (= { code, message }) を**足した**。
  //   ⚠ errors は**文字列配列のまま 1 文字も変えない**。acceptMapDef が join して HUD に出し、
  //     項目4 のスモークが正規表現で中身を見ているため (構造体に変えると "[object Object]" になる)。
  //   ⚠ code を足した理由は lint 項目④ (boss ちょうど 1 つ) を**二重に持たないため**。
  //     lint は自前で boss を数えず、この issues[].code === "boss-count" を再利用する。
  //     判定式が 2 本あると必ず食い違う (import は通るのに lint は落ちる等)。
  function validate(d) {
    var issues = [];
    function bad(code, msg) { issues.push({ code: code, message: msg }); }
    function done() {
      return { ok: issues.length === 0,
               errors: issues.map(function (x) { return x.message; }),
               issues: issues };
    }
    if (!d || typeof d !== "object") { bad("not-object", "mapDef がオブジェクトではない"); return done(); }
    if (d.schema !== SCHEMA) bad("schema", "schema が " + SCHEMA + " ではない: " + d.schema);
    if (!d.grid || d.grid.w !== GRID_W || d.grid.h !== GRID_H || d.grid.tile !== GRID_TILE)
      bad("grid", "grid は Phase 3 までは " + GRID_W + "x" + GRID_H + "/tile" + GRID_TILE + " 固定");
    if (THEME_IDS.indexOf(d.themeId) < 0) bad("theme", "themeId が既存テーマに無い: " + d.themeId);
    if (!Array.isArray(d.rooms) || d.rooms.length === 0) bad("rooms-empty", "rooms が空");
    if (!Array.isArray(d.corridors)) bad("corridors", "corridors が配列でない");
    if (!d.start || !isNum(d.start.tx) || !isNum(d.start.ty)) bad("start", "start が不正");
    var bossCount = (d.rooms || []).filter(function (r) { return r && r.role === "boss"; }).length;
    if (bossCount !== 1) bad("boss-count", 'role:"boss" はちょうど 1 つ必要 (現在 ' + bossCount + ")");

    /* ★Phase 3 項目1: tiles があるのに展開できない = **silent fail-open の入口**。必ずエラーにする。
     *   黙って矩形生成へ落ちると「動くが別のマップ」になる = 最悪の壊れ方 (SPEC 項目1)。
     * ⚠ tiles が**未指定** (null / undefined) はエラーではない。「tiles を使わない = 矩形生成」
     *   という正常な状態であり、既定プリセット 2 種はどちらも tiles:null なので
     *   この行を足しても既存のマップは 1 つも赤くならない (= 装置が信用を失わない)。 */
    var ti = expandTilesInfo(d);
    if (ti.present && !ti.map) bad("tiles-bad", "tiles を展開できません: " + ti.reason);

    /* ★P2 項目(a): graph があるのに解釈できない = tiles-bad とまったく同じ **silent fail-open の入口**。
     *   黙って「分岐なしの単一マップ」へ落ちると「動くが別のゲーム」になる。
     * ⚠ graph が**未指定** (null / undefined / キーごと無い) はエラーではない。既定プリセット 2 種も
     *   既存 6 シナリオも graph:null なので、この行を足しても既存のマップは 1 つも赤くならない
     *   (= 検査装置が信用を失わない)。tiles-bad の判断と 1 対 1 に対応している。
     * ⚠ graphInfo に渡すのは **d.graph** (グラフそのもの) であって d ではない。d を渡すと
     *   「graph キーを持たない旧 mapDef」を graph だと誤認して全部 graph-bad になる。 */
    var gr = graphInfo(d && d.graph);
    if (gr.present && !gr.graph) bad("graph-bad", "graph を解釈できません: " + gr.reason);

    return done();
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * Phase 3 項目1 — 自由タイル (tiles) の RLE エンコード / デコード + 妥当性検査
   * ══════════════════════════════════════════════════════════════════════════
   * ★「焼き固め方式」(ユーザー決定 2026-08-02) の土台。ブラシの一筆目で矩形 (rooms/corridors)
   *   から tiles を生成して固定し、以後は **tiles = 幾何 / rooms = 意味** に分離する。
   *   ⚠ 本項目は**純関数を足すだけ**。buildMapData / mapUsed への配線は**項目2 の担当**なので
   *     ここでは一切繋がない = ゲームの挙動は 1bit も変わらない。
   *
   * 形式:  tiles = { enc:"rle", data:"2x1728,0x20,…" }
   *   ・**行優先 (row-major)**。data は `<値>x<連長>` をカンマ区切りで並べたもの
   *   ・値は 0=通常床 / 1=レア床 / 2=壁・岩盤 の 3 種のみ。連長は 1 以上の十進整数
   *   ・run は**行をまたいで連結する** (幅は mapDef 側が持つので行境界を data に刻む必要がない)
   *   ・幅・高さは **mapDef.grid.w / grid.h** から取る。tiles 側に w/h を持たせない
   *     (二重に持つと grid と食い違ったときどちらが正か決まらない = 無言の地形化け)
   *
   * ⚠⚠ silent fail-open にしない ★これが本項目の設計の芯
   *   「不正な tiles を黙って無視して矩形生成へ落ちる」= **動くが別のマップ**になる。
   *   そこで **「tiles が無い (未指定)」と「tiles はあるが壊れている」を厳密に区別**する:
   *     expandTiles()      … どちらも null を返す (呼び出し側を単純に書けるようにするため)
   *     expandTilesInfo()  … { present, map, reason } で区別できる ← **判断はこちらで行う**
   *     validate()         … **壊れているときだけ** tiles-bad を積む (未指定はエラーにしない)
   *   項目2 の buildMapData / mapUsed はこの区別に乗って console.warn を出し分ける。
   * ────────────────────────────────────────────────────────────────────────── */
  var TILES_ENC = "rle";
  /* <値>x<連長>。値は 0/1/2 のみ、連長は先頭 0 なしの正の整数。
   * ⚠ 空白も符号も許さない (encodeTiles は空白を出さない)。ここを緩めると
   *   「読めたつもりで別の地形」が生まれる = 検査装置として自滅する。 */
  var TILES_RUN_RE = /^([012])x([1-9][0-9]*)$/;

  function isTileValue(v) { return v === T_FLOOR || v === T_RARE || v === T_WALL; }

  /* hasTiles(d) — tiles が「指定されている」か。★null / undefined **だけ**が未指定。
   * ⚠ 文字列や数値が入っていたら「未指定」ではなく「不正」として扱う (fail-closed)。
   *   ここを「オブジェクトでなければ未指定」にすると、壊れた tiles が黙って矩形へ落ちて
   *   validate も素通りする = まさに避けたかった silent fail-open になる。 */
  function hasTiles(d) {
    return !!d && d.tiles !== null && d.tiles !== undefined;
  }

  /* encodeTiles(map2d) -> { enc:"rle", data:"…" } | null
   *   2 次元配列 (map[row][col]) を行優先 RLE へ。
   *   ⚠ 入力が 2 次元配列でない / 行の長さが不揃い / 値が 0,1,2 以外 なら **null を返す**。
   *     ここで通すと expandTiles が拒否するデータを作れてしまい、
   *     「保存はできたのに二度と読めない」= 無言のデータ喪失になる。 */
  function encodeTiles(map2d) {
    if (!Array.isArray(map2d) || map2d.length === 0) return null;
    var H = map2d.length, W = -1, parts = [], cur = -1, run = 0, r, c, row, v;
    for (r = 0; r < H; r++) {
      row = map2d[r];
      if (!Array.isArray(row) || row.length === 0) return null;
      if (W < 0) W = row.length;
      else if (row.length !== W) return null;            // 行の長さが不揃い = 矩形グリッドでない
      for (c = 0; c < W; c++) {
        v = row[c];
        if (!isTileValue(v)) return null;                // 0,1,2 以外は書き出さない
        if (run > 0 && v === cur) { run++; continue; }
        if (run > 0) parts.push(cur + "x" + run);
        cur = v; run = 1;
      }
    }
    if (run > 0) parts.push(cur + "x" + run);
    return { enc: TILES_ENC, data: parts.join(",") };
  }

  /* expandTilesInfo(mapDef) -> { present, map, reason }
   *   present … tiles が指定されているか (未指定なら present:false / map:null / reason:null)
   *   map     … 展開できた 2 次元配列 (map[row][col]) | null
   *   reason  … 展開できなかった理由の日本語 (present && !map のときだけ非 null)
   *
   *   ★不正の定義 (SPEC 項目1。すべて map:null):
   *     ① enc が "rle" でない          ② run の合計が w*h と一致しない (多くても少なくても)
   *     ③ 値が 0,1,2 以外              ④ data が文字列でない
   *   ⚠ ③は TILES_RUN_RE が弾く (値 3 は run の書式に合わない扱いになる)。
   *     「値だけ別に検査」する形にすると書式検査と二重管理になり、必ず食い違う。 */
  function expandTilesInfo(mapDef) {
    var d = mapDef;
    if (!hasTiles(d)) return { present: false, map: null, reason: null };
    var t = d.tiles;
    if (typeof t !== "object" || Array.isArray(t))
      return { present: true, map: null,
               reason: "tiles がオブジェクトではありません (" + (Array.isArray(t) ? "配列" : typeof t) + ")" };
    if (t.enc !== TILES_ENC)                                             // ① enc
      return { present: true, map: null,
               reason: 'tiles.enc が "' + TILES_ENC + '" ではありません: ' + JSON.stringify(t.enc) };
    if (typeof t.data !== "string")                                      // ④ data の型
      return { present: true, map: null,
               reason: "tiles.data が文字列ではありません (" + (t.data === null ? "null" : typeof t.data) + ")" };

    // 幅・高さは mapDef 側から取る (tiles 側には持たせない = 二重管理を作らない)。
    var W = (d.grid && isNum(d.grid.w)) ? Math.round(d.grid.w) : GRID_W;
    var H = (d.grid && isNum(d.grid.h)) ? Math.round(d.grid.h) : GRID_H;
    if (!(W > 0) || !(H > 0))
      return { present: true, map: null, reason: "grid が不正です (w=" + W + " / h=" + H + ")" };

    var need = W * H, flat = new Array(need), n = 0;
    var parts = t.data.split(","), i, m, v, len, k;
    for (i = 0; i < parts.length; i++) {
      m = TILES_RUN_RE.exec(parts[i]);
      if (!m)                                                            // ③ 値が 0,1,2 以外 もここ
        return { present: true, map: null,
                 reason: "run #" + i + ' の書式が <値(0|1|2)>x<連長> ではありません: "' + parts[i] + '"' };
      v = +m[1]; len = +m[2];
      if (n + len > need)                                                // ② 合計が多い
        return { present: true, map: null,
                 reason: "run の合計が grid (" + W + "x" + H + " = " + need + " タイル) を超えました" +
                         " (run #" + i + " の時点で " + (n + len) + ")" };
      for (k = 0; k < len; k++) flat[n++] = v;
    }
    if (n !== need)                                                      // ② 合計が少ない
      return { present: true, map: null,
               reason: "run の合計が " + n + " タイルで、grid の " + W + "x" + H + " = " + need +
                       " タイルと一致しません" };

    var map = [], r, c, p = 0;
    for (r = 0; r < H; r++) {
      var row = new Array(W);
      for (c = 0; c < W; c++) row[c] = flat[p++];
      map.push(row);
    }
    return { present: true, map: map, reason: null };
  }

  /* expandTiles(mapDef) -> 2 次元配列 (map[row][col]) | null
   * ⚠ null は「未指定」と「不正」の**両方**で返る。区別が要る場所では必ず expandTilesInfo を使う
   *   (項目2 の buildMapData は「不正のときだけ console.warn」= 黙って矩形へ落ちない)。 */
  function expandTiles(mapDef) { return expandTilesInfo(mapDef).map; }

  // ── buildMapData: mapDef → 2次元 mapData ────────────────────────────────
  // ★ index.html:3299-3331 buildMap() と**同じ手順**であること。順序も含めて同じにする:
  //    ① 全面を 2 (壁/void) で埋める
  //    ② 部屋を 0 で塗り、同じ走査で ((r*7+c*13)^(r*3-c))%5===0 のタイルを 1 (レア床) に
  //    ③ 廊下を 0 で塗る (部屋と重なった所はレア床が 0 に戻る ← ②③の順序が意味を持つ)
  //    ④ flags.bandMask なら row 13-15 以外の全行を 2 に潰す (屋外の帯)
  //  ⚠ ②の式は index.html:3312 の逐語コピー。JS の % は負値を返しうるので**書き換えない**
  //    (例: r=7,c=24 → r*3-c = -3 → XOR 結果が負 → %5 も負)。
  function buildMapData(mapDef) {
    var d = mapDef || DEFAULT_DUNGEON;

    /* ★Phase 3 項目2 — 自由タイル (焼き固め方式)。tiles があればそれが**唯一の幾何**。
     *   rooms は「意味」(role / enemySlots / 除外部屋 / 1枚絵の入れ物) だけを担う。
     *
     * ⚠⚠ この早期 return は **map 初期化より前**に置く。位置で結果が変わる:
     *   後ろに置くと ④ の帯マスク (flags.bandMask) が tiles にも掛かってしまう。
     *   tiles があるとき帯マスクは**適用しない** (SPEC 項目2-3) = ここが唯一の実装点。
     *
     * ⚠⚠ expandTiles ではなく **expandTilesInfo** を使うこと。expandTiles は
     *   「未指定」と「不正」の**両方**で null を返すので、`if (t) return t;` と書くと
     *   両者が同じ経路に潰れて console.warn を出し分けられない
     *   = SPEC が禁じた silent fail-open (「動くが別のマップ」) に逆戻りする。 */
    var ti = expandTilesInfo(d);
    if (ti.map) return ti.map;
    if (ti.present) warnMapDef("tiles を展開できないため矩形生成へ落ちました: " + ti.reason);

    var W = (d.grid && d.grid.w) || GRID_W;
    var H = (d.grid && d.grid.h) || GRID_H;
    var map = [];
    for (var r = 0; r < H; r++) {
      var row = new Array(W);
      for (var c = 0; c < W; c++) row[c] = T_WALL;
      map.push(row);
    }
    function fill(r1, c1, r2, c2, t) {
      for (var r = Math.max(0, r1); r <= Math.min(H - 1, r2); r++)
        for (var c = Math.max(0, c1); c <= Math.min(W - 1, c2); c++)
          map[r][c] = t;
    }

    var rooms = Array.isArray(d.rooms) ? d.rooms : [];
    for (var i = 0; i < rooms.length; i++) {
      var rect = rooms[i] && rooms[i].rect;
      if (!rect) continue;
      var a = rect[0], b = rect[1], cc = rect[2], dd = rect[3];
      fill(a, b, cc, dd, T_FLOOR);
      for (var rr = Math.max(0, a); rr <= Math.min(H - 1, cc); rr++)
        for (var c2 = Math.max(0, b); c2 <= Math.min(W - 1, dd); c2++)
          if (((rr * 7 + c2 * 13) ^ (rr * 3 - c2)) % 5 === 0) map[rr][c2] = T_RARE;
    }
    var corr = Array.isArray(d.corridors) ? d.corridors : [];
    for (var k = 0; k < corr.length; k++) {
      var q = corr[k];
      if (q) fill(q[0], q[1], q[2], q[3], T_FLOOR);
    }

    // ④ 屋外の帯マスク (index.html:3323-3328 と同義)。
    //    ⚠ ゲーム側は IS_FIELD_THEME && FIELD_GEO_ACTIVE (画面高さ依存) で発火するが、
    //      エディタは画面に依存させず flags.bandMask だけで判定する。
    if (d.flags && d.flags.bandMask) {
      for (var r3 = 0; r3 < H; r3++) {
        if (r3 >= BAND_TOP_ROW && r3 <= BAND_BOTTOM_ROW) continue;
        for (var c3 = 0; c3 < W; c3++) map[r3][c3] = T_WALL;
      }
    }
    return map;
  }

  // ── MAP_USED: 部屋にも廊下にも属さない行/列を除いた「使われている範囲」 ──
  // index.html:3290-3297 と同じ導出。画面の黒帯予防プレビュー(項目5 lint ⑥)の土台。
  function mapUsed(mapDef) {
    var d = mapDef || DEFAULT_DUNGEON;
    var W = (d.grid && d.grid.w) || GRID_W, H = (d.grid && d.grid.h) || GRID_H;
    var c0 = W, c1 = -1, r0 = H, r1 = -1;

    /* ★Phase 3 項目2 ⚠⚠ **隠れた本丸**。忘れると画面が黒帯になる。
     *   tiles があるときの「使われている範囲」は rooms/corridors の外接矩形ではなく
     *   **壁(2)以外のタイルの外接矩形**。rooms は意味しか担わないので、部屋の外に
     *   描いた床は rooms からは永久に見えない = カメラのクランプが寄れず純黒が出る。
     *
     * ⚠ index.html:3371 付近の MAP_USED は **buildMap() より前**に定義されるので
     *   mapData を待てない → ここで tiles を**もう一度展開する**。2016 タイルなので
     *   コストは無視できる (計測不能な差)。
     *
     * ⚠ 展開できない tiles でも**ここでは console.warn を出さない** (silent ではない):
     *   ・buildMapData が同じ判定で 1 行だけ警告を出す = 系全体としては黙っていない
     *   ・validate() は code:"tiles-bad" を積み、lint はそれを error として表示する
     *   ・mapUsed は map-editor.html:799 の render() から**毎フレーム**呼ばれるため、
     *     ここで警告すると際限なく積もり、buildMapData の 1 行を埋もれさせる
     *     (警告のスパムは警告を殺す)。両者は同じ矩形へ落ちるので不整合も起きない。 */
    var tmap = expandTilesInfo(d).map;
    if (tmap) {
      for (var tr = 0; tr < tmap.length; tr++) {
        var trow = tmap[tr];
        if (!trow) continue;
        for (var tc = 0; tc < trow.length; tc++) {
          if (trow[tc] === T_WALL) continue;              // ★壁(2)以外 = 床(0) と レア床(1)
          if (tr < r0) r0 = tr;  if (tr > r1) r1 = tr;
          if (tc < c0) c0 = tc;  if (tc > c1) c1 = tc;
        }
      }
      // ⚠ tiles が全部壁のときは既存の「該当なし」と同じ全面を返す (挙動を揃える)。
      return (c1 >= c0 && r1 >= r0) ? { c0: c0, c1: c1, r0: r0, r1: r1 }
                                    : { c0: 0, c1: W - 1, r0: 0, r1: H - 1 };
    }

    var all = (d.rooms || []).map(function (r) { return r.rect; }).concat(d.corridors || []);
    for (var i = 0; i < all.length; i++) {
      var q = all[i]; if (!q) continue;
      if (q[0] < r0) r0 = q[0];  if (q[2] > r1) r1 = q[2];
      if (q[1] < c0) c0 = q[1];  if (q[3] > c1) c1 = q[3];
    }
    return (c1 >= c0 && r1 >= r0) ? { c0: c0, c1: c1, r0: r0, r1: r1 }
                                  : { c0: 0, c1: W - 1, r0: 0, r1: H - 1 };
  }

  // ── 派生値 (Phase 1 で index.html の「部屋数からの推測」を置き換える先) ──
  function bossRoomIdx(d) {
    var rooms = (d && d.rooms) || [];
    for (var i = 0; i < rooms.length; i++) if (rooms[i].role === "boss") return i;
    return rooms.length - 1;                                 // 既定: 末尾がボス (現行と同値)
  }
  /* slotsOf(d) -> { roomSlots, bossSlot, byRoom }
   *   tavern.html の ROOM_SLOTS / BOSS_SLOT 相当を mapDef 1 箇所から取り出す。
   *     roomSlots … 全部屋の敵スロットを**平らに**並べた配列 (Phase 1 からの形。変えない)
   *     bossSlot  … 最初に見つかった bossSlot | null
   *     byRoom    … ★Phase 2 で追加。**敵スロットを 1 つ以上持つ部屋だけ**の二次元配列
   *
   *   ⚠⚠ byRoom が「空の部屋を積まない」のは**バランスに直結する**。
   *     tavern.html の buildSpawns は roomIdx / (byRoom.length - 1) を強さ係数 roomFrac に使う。
   *     既定ダンジョンは [山場(8スロット), ボス部屋(0スロット)] なので、空のボス部屋まで積むと
   *     byRoom.length が 2 になり、山場の roomFrac が 1 → 0 へ落ちて**敵が一斉に弱くなる**。
   *     現行 ROOM_SLOTS = [[8スロット]] (1 要素) と同形にするのが唯一の正解。
   *
   *   ⚠ roomSlots と byRoom は**別の配列インスタンス**を積む (同じ参照を共有すると、
   *     片方を書き換えたときにもう片方が黙って変わる)。 */
  function slotsOf(d) {
    var rooms = (d && d.rooms) || [];
    var room = [], boss = null, byRoom = [];
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      var es = r.enemySlots || [], group = [];
      for (var j = 0; j < es.length; j++) {
        room.push(es[j].slice());
        group.push(es[j].slice());
      }
      if (group.length) byRoom.push(group);       // ★空の部屋は積まない (上の注記)
      if (r.bossSlot && !boss) boss = r.bossSlot.slice();
    }
    return { roomSlots: room, bossSlot: boss, byRoom: byRoom };
  }
  function objectiveCount(d) {
    if (d && d.objective && isNum(d.objective.count)) return d.objective.count;
    return ((d && d.rooms) ? d.rooms.length : 1) - 1;         // 既定: rooms.length - 1
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * Phase 2 — エディタの「▶ このマップで遊ぶ」用: mapDef → index.html の spawns
   * ══════════════════════════════════════════════════════════════════════════
   * ★これは **map-editor.html 専用の経路**。酒場 (tavern.html) は tier / 系統 (FAMILIES) を
   *   持っているのでそちらの buildSpawns を使い続ける。ここを酒場から呼ばないこと
   *   (呼ぶと tier による難易度カーブが消える)。
   *
   * ⚠ エディタは tier も系統も持たないので、「おまかせ」スロット ([tx,ty]) を埋める最低限の
   *   テーマ別プールをここに持つ。**FAMILIES の写しではない** (tier 補正もエリート枠も無い)。
   * ⚠⚠ ここに書くキーは index.html の ENEMY_TYPES に**実在**していなければならない。
   *   未知キーは index.html の _safeSpawns が**無言で全消し**し、spawns が空になると
   *   廃坑の敵が旧座標 (27,13)(57,13) に湧く化けバグへ直結する (計画書 落とし穴④)。
   *   → 2026-08-02 に全 25 キーを index.html 実読で確認済み。増やすときも必ず実読で裏取りする。
   * ────────────────────────────────────────────────────────────────────────── */
  var THEME_DEFAULT_ENEMIES = {
    "goblin-mine":    { mob: ["goblin", "goblinArcher", "kobold", "hobgoblin"],  boss: "goblinKing" },
    "bandits-forest": { mob: ["bandit", "banditArcher", "banditMage"],           boss: "scar" },
    "lizard-swamp":   { mob: ["lizardWarrior", "lizardHunter", "lizardRaider"],  boss: "lizardChieftain" },
    "orc-fort":       { mob: ["orcGrunt", "orcArcher", "orcBerserker"],          boss: "garrock" },
    "undead-temple":  { mob: ["skeleton", "zombie", "wraith"],                   boss: "lich" },
    "dragon-lair":    { mob: ["skeleton", "minotaur", "orcBerserker"],           boss: "pharaxus" },
    // 屋外は resolve() でカスタム幾何を排他にしているのでこの経路には来ないが、
    // テーマ表の穴を作らないために置く (穴があると || の既定へ落ちて廃坑の敵が出る)。
    "caravan-road":   { mob: ["goblin", "goblinArcher", "hobgoblin"],            boss: "goblinRider" },
  };

  /* 種類固定 ([tx,ty,"goblin"]) はそのまま尊重し、おまかせ ([tx,ty]) はテーマ別プールから引く。
   * ⚠ **未知キーは「おまかせ」へ降格**する (ユーザー判断 2026-08-02)。落とすと体数が黙って減り、
   *   そのまま通すと index.html の _safeSpawns が黙って消す — どちらも無言の欠損になる。
   * ⚠ カタログ未取得のときは既知/未知を判定できないので**指定を尊重する**
   *   (勝手に書き換えない。最終的な網は index.html の _safeSpawns が張っている)。 */
  function resolveEnemyKind(slot, pool, rand) {
    var k = enemyKindOf(slot);
    if (k && enemyCatalog && !enemyCatalog[k]) k = null;      // 未知 → おまかせへ降格
    if (k) return k;
    return pool[Math.floor(rand() * pool.length)] || pool[0];
  }
  function spawnsFromMapDef(d, rnd) {
    var rand = (typeof rnd === "function") ? rnd : Math.random;
    var theme = THEME_DEFAULT_ENEMIES[d && d.themeId] || THEME_DEFAULT_ENEMIES["goblin-mine"];
    var rooms = (d && d.rooms) || [], out = [], i, j;
    for (i = 0; i < rooms.length; i++) {
      var es = rooms[i].enemySlots || [];
      for (j = 0; j < es.length; j++)
        out.push([resolveEnemyKind(es[j], theme.mob, rand), es[j][0], es[j][1]]);
      var bs = rooms[i].bossSlot;
      if (bs) out.push([resolveEnemyKind(bs, [theme.boss], rand), bs[0], bs[1]]);
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * Phase 1 — index.html が幾何をここ 1 箇所から受け取るための入口
   * ══════════════════════════════════════════════════════════════════════════
   * Phase 1 の契約は「**プレイの結果を 1bit も変えない**」。したがってこの節の関数は
   * すべて「現行 index.html の式と完全同値」であることが唯一の正しさの基準になる。
   * 綺麗な式に整えたくなっても、同値でなくなる整理は Phase 2 以降でユーザー判断のもと行う。
   * ────────────────────────────────────────────────────────────────────────── */

  /* resolve(genScen, isFieldTheme, params) -> mapDef
   *   ★Phase 2: genScen.mapDef が**妥当**なら採用し、それ以外は既定値へ落とす。
   *     戻り値には必ず **isCustom** (boolean) が乗る。index.html はこれを見て
   *     落とし穴 ②③④ のカスタム専用ゲートを開閉する (既定経路では 1 命令も走らない)。
   *
   *   採用の可否は次の順で決まる:
   *     ① params に ?mapdef=0 (撤退スイッチ)        → 無条件で既定値。isCustom=false
   *     ② genScen.mapDef が無い / オブジェクトでない → 既定値。isCustom=false
   *     ③ validate(raw) が ok でない                 → 既定値 + console.warn。isCustom=false
   *     ④ 屋外テーマ (caravan-road) のカスタム幾何   → 既定値 + console.warn。isCustom=false
   *     ⑤ 上記すべてを通過                            → sanitize(raw) を採用。isCustom=true
   *   採用が決まった後、★Phase 3 項目3 で **?mapdef=raw なら tiles だけを落とす**
   *   (幾何は rooms/corridors からの矩形生成へ戻り、rooms の意味も isCustom もそのまま)。
   *
   *   ⚠⚠ ③の validate は **sanitize の「前」**に掛ける。sanitize は schema / grid / themeId を
   *     既定値で埋めてしまうので、後に掛けると壊れた JSON が永久に通ってしまう
   *     (lintMapDef が素の src に validate を掛けているのと同じ理由)。
   *
   *   ⚠⚠ ④ 屋外テーマ × カスタム幾何の排他 (計画書 落とし穴⑤ =「最悪の組合せ」):
   *     themeId:"caravan-road" は index.html 側で IS_FIELD_THEME を真にし、
   *     帯マスク・空/丘/路肩の地平線レンダラ・視界制限オフが**まとめて**発火する。
   *     これらは flags.bandMask ではなく themeId から引かれるので、mapDef 側で
   *     bandMask を切っても地平線レンダラだけが残り、カスタム幾何の上に空と丘が描かれる。
   *     相互作用が複雑すぎるため **明示的に禁じる**のが安全 (計画書の判断)。
   *     エディタ側の lint (field-theme-custom) が ▶ を止めるので、ここは二重の防波堤。
   *
   *   ⚠ params は URLSearchParams | null | undefined。?mapdef=0 は「mapDef を完全に無視し
   *     従来の既定幾何へ戻す」撤退スイッチ (幾何・起点・ボス・敵スロット すべて)。
   *     ?mapdef=raw (★Phase 3 項目3 で実装済み: tiles だけ無視) の**上位集合**である
   *     (既存の ?sky=0 ⊂ ?field=0 と同じ関係)。取り違えないこと。
   *
   *   ⚠ 戻り値は必ず clone / sanitize の新品。呼び出し側 (index.html) が返り値を壊しても
   *     DEFAULT_DUNGEON / DEFAULT_FIELD が汚染されない = 次のシナリオが別のマップにならない。
   *
   *   ⚠ flags.bandMask を必ず持たせる (既定 = isFieldTheme)。index.html:3390 の
   *     帯マスク判定がこれを読むので、欠けると屋外の幾何が丸ごと変わる。
   *
   *   引数がすべて undefined/null でも落ちないこと (読み込み順の事故で引数が揃わなくても
   *   幾何だけは必ず作れる = 画面が真っ黒にならない)。
   */
  function paramOf(params, key) {
    try {
      if (params && typeof params.get === "function") return params.get(key);
    } catch (e) {}
    return null;
  }
  function warnMapDef(msg) {
    try { console.warn("[mapdef] " + msg); } catch (e) {}
  }
  function resolve(genScen, isFieldTheme, params) {
    var base = isFieldTheme ? DEFAULT_FIELD : DEFAULT_DUNGEON;
    var raw = (genScen && typeof genScen === "object") ? genScen.mapDef : null;
    var out = null;

    if (raw && typeof raw === "object") {
      if (paramOf(params, "mapdef") === "0") {
        warnMapDef("?mapdef=0 が指定されたため mapDef を無視し、従来の既定幾何で起動します");
      } else {
        var v = validate(raw);                       // ★ sanitize の「前」に判定する
        if (!v.ok) {
          warnMapDef("mapDef がスキーマ検査を通らなかったため既定幾何へ落としました: " + v.errors.join(" / "));
        } else if (FIELD_THEME_IDS[raw.themeId]) {
          warnMapDef('themeId "' + raw.themeId + '" は屋外テーマです。屋外の地平線レンダラ (空/丘/路肩) と'
            + "カスタム幾何は相互作用が複雑なため排他にしています → 既定幾何へ落としました");
        } else {
          out = sanitize(raw, base);
          out.isCustom = true;
        }
      }
    }
    if (!out) { out = clone(base); out.isCustom = false; }

    /* ★Phase 3 項目3 — 撤退スイッチ ?mapdef=raw: **tiles だけ**落として rooms/corridors からの
     *   矩形生成へ戻す。⭐実装をここ 1 箇所に置くのが肝で、buildMapData / mapUsed は
     *   「tiles があるか」しか見ないので **index.html 側に分岐を 1 つも増やさずに全経路へ効く**
     *   (幾何・カメラのクランプ・lint・エディタのプレビューが同時に矩形へ戻る)。
     *
     * ⚠ ?mapdef=0 (mapDef を丸ごと無視) は raw の**上位集合**。0 は上の分岐で既に既定値へ
     *   落ちていて tiles:null なので、ここは何もしない = 2 つのスイッチに順序依存を作らない。
     * ⚠ tiles が元から無いときは警告を出さない (「常に 1 行出る」= 警告のスパムは警告を殺す)。 */
    if (paramOf(params, "mapdef") === "raw") {
      if (out.tiles) warnMapDef("?mapdef=raw が指定されたため tiles (自由タイル) を無視し、"
        + "rooms/corridors からの矩形生成で起動します");
      out.tiles = null;
    }

    // 既定値は元々 bandMask を持っているが、ここで**明示的に保証**しておく
    // (DEFAULT_* を将来いじったときに index.html:3390 が undefined を読む事故を止める)。
    if (!out.flags || typeof out.flags !== "object") out.flags = {};
    if (typeof out.flags.bandMask !== "boolean") out.flags.bandMask = !!isFieldTheme;
    return out;
  }

  /* ── 除外部屋は **2 系統ある**。統合しないこと ★★★ ────────────────────────
   *  ⚠⚠ 次に読む人へ: 下の 2 関数は「同じことを 2 回書いた重複」ではない。
   *     **2 部屋ダンジョンで戻り値が違い、統合するとゲームの結果が変わる**。
   *
   *       部屋数 | excludedRoomIdx | chestExcludedRoomIdx
   *       -------|-----------------|---------------------
   *       2 部屋 |  {1}            |  {0, 1}   ← ★ここが違う
   *       3 部屋 |  {0, 2}         |  {0, 2}   (たまたま一致するだけ)
   *
   *     現行 6 ダンジョンは 2 部屋 (山場 + ボス) なので、統合すると
   *       - chestExcludedRoomIdx 側へ寄せる → 罠 / 隠し宝箱 / 探索宝箱の候補が消える
   *       - excludedRoomIdx 側へ寄せる     → 山場部屋に玄室宝箱が湧き始める
   *     のどちらかが必ず起きる。どちらも Phase 1 の「1bit も変えない」契約違反。
   *
   *     2 系統あるのは設計というより**現状の実装事実**。role ベースへ揃えるかどうかは
   *     Phase 2 以降でユーザー判断のもと行う (仕様書の「計画書の誤り②」節を参照)。
   * ────────────────────────────────────────────────────────────────────────── */

  /* excludedRoomIdx(mapDef) -> Set<number>
   *   罠 (spawnTraps) / 隠し宝箱 (spawnHiddenChests) / 探索宝箱 (spawnExplorationChests) 用。
   *   現行式 index.html:17950-17951 / 18024-18025 / 19040-19041 と**完全同値**:
   *       ROOMS.length >= 3 ? new Set([0, bossIdx]) : new Set([bossIdx])
   *   3 部屋以上なら導入部屋も除外し、2 部屋ならボス部屋だけを除外する
   *   (2 部屋で 0 も除くと候補タイルが 0 になり、罠も宝箱も**無言で** 1 つも出なくなる)。 */
  function excludedRoomIdx(d) {
    var rooms = (d && d.rooms) || [];
    var boss = bossRoomIdx(d);
    return (rooms.length >= 3) ? new Set([0, boss]) : new Set([boss]);
  }

  /* chestExcludedRoomIdx(mapDef) -> Set<number>
   *   玄室宝箱 (spawnRoomChests / index.html:17912-17914) **専用**。
   *   現行式 `if (i === 0 || i === bossRoomIdx) continue;` と完全同値 = **常に {0, boss}**。
   *   部屋数を見ない (= 2 部屋なら候補ゼロ = 玄室宝箱が出ない) のが現行の振る舞い。
   *   ⚠ excludedRoomIdx と**別物**。上の表を読むこと。 */
  function chestExcludedRoomIdx(d) {
    return new Set([0, bossRoomIdx(d)]);
  }

  /* ══ ★P4: 除外集合を「ノード種別 (kind)」から導く ═══════════════════════════════
   * 上の 2 関数が抱える宿題 ("role ベースへ揃えるかどうかは Phase 2 以降でユーザー判断") を、
   * **既存経路を 1bit も変えずに**回収するための第 3・第 4 の関数。計画書の決定:
   *
   *     kind:"search" … 罠 / 隠し宝箱 / 探索宝箱が湧く **唯一の**ノード種
   *     kind:"loot"   … 玄室宝箱が湧く **唯一の**ノード種
   *     それ以外      … 両方とも除外
   *
   * ⚠⚠ **上の 2 関数は 1 文字も触っていない**。ここは「部屋 index から推測する」のではなく
   *   「著者がノードに与えた意味 (kind) から決める」という**別の規則**であり、同じ器に
   *   まとめると必ずどちらかの経路が黙って変わる (上の表の 2 部屋 {1} vs {0,1} 問題と同根)。
   *   分岐 (RUN) があるときだけ index.html がこちらへ切り替える。
   *
   * ⚠⚠ **なぜ「1 ノード = 1 部屋」でこれが必須なのか**: 部屋が 1 つしかないと
   *   excludedRoomIdx = {boss} = {0} / chestExcludedRoomIdx = {0, boss} = {0} となり、
   *   **唯一の部屋が両方の除外集合に入って罠も宝箱も無言で 0 個**になる。P2 は role:"boss" を
   *   3x3 の「控えの間」へ逃がす仮の器で回避していたが、この 2 関数で不要になった。
   *
   * ⚠ 戻り値は **除外する部屋 index の Set**。「湧かせる」kind では**空集合**を返す
   *   (= どの部屋も除外しない) のが正しく、「湧かせない」kind では**全部屋**を入れる。
   *   ⚠ 全部屋を入れるのであって bossRoomIdx を返すのではない。ここを部分集合にすると
   *     道中ノードの隅に罠が湧き「search だけが唯一のノード種」という約束が崩れる。
   *
   * ⚠ 未知の kind は「湧かせない」側へ倒す (fail-closed)。graphInfo が未知 kind を落とさない
   *   設計 (古いデータを黙って壊さない) なので、ここで開いてしまうと
   *   「typo した kind のノードに罠と宝箱が両方湧く」= 一番気づきにくい壊れ方になる。 */
  var KIND_SPAWNS_TRAPS = { search: 1 };        // 罠 / 隠し宝箱 / 探索宝箱
  var KIND_SPAWNS_ROOM_CHESTS = { loot: 1 };    // 玄室宝箱
  function allRoomIdx(d) {
    var rooms = (d && d.rooms) || [], s = new Set();
    for (var i = 0; i < rooms.length; i++) s.add(i);
    return s;
  }
  function excludedRoomIdxForKind(d, kind) {
    return KIND_SPAWNS_TRAPS[kind] ? new Set() : allRoomIdx(d);
  }
  function chestExcludedRoomIdxForKind(d, kind) {
    return KIND_SPAWNS_ROOM_CHESTS[kind] ? new Set() : allRoomIdx(d);
  }

  /* ⭐ bossRoomIdx(d) は既存 (role:"boss" を探し、無ければ rooms.length - 1)。
   *    既定値では role 探索と rooms.length - 1 が**一致する**ことを確認済み:
   *      DEFAULT_DUNGEON … rooms = [r0(start), r1(boss)]     → 1 = 2 - 1 ✓
   *      DEFAULT_FIELD   … rooms = [r0(start), r1, r2(boss)] → 2 = 3 - 1 ✓
   *    よって上の 2 関数を既定値に対して呼んだ結果は、現行 index.html の
   *    `const bossRoomIdx = ROOMS.length - 1;` 由来の式と 1bit も違わない。 */

  /* ══════════════════════════════════════════════════════════════════════════
   * 出発前 lint (項目5) — 「このまま出発したら壊れるか」を事前に検出する
   * ══════════════════════════════════════════════════════════════════════════
   * ★責務の分担 (混ぜないこと):
   *     sanitize()    … 座標を 0..71 / 0..27 へクランプし、欠損を既定値で埋める
   *     validate()    … **スキーマとして**壊れていないか (import の受け入れ判定)
   *     lintMapDef()  … **ゲームとして**壊れているか (出発前チェック) ← ここ
   *   計画書 §Phase 0 の lint 6 項目 + 落とし穴 ②③④⑥⑦ の事前検出装置。
   *
   * ★純粋関数。DOM・state・canvas に一切触らず、引数 src も**書き換えない**
   *   (Phase 1 で js/df-mapdef.js へそのまま切り出す)。
   *
   * ★エラー / 警告の区別 (計画書の明示要求):
   *     error   = このまま出発すると壊れる (連結性・壁乗り・候補ゼロ・boss 個数)
   *     warning = 読めるが危ない / 卓用としては正当
   *   ⚠ **敵 0 体は警告。エラーにしない** (計画書 落とし穴④の明示要求。卓用マップとして正当)
   *
   * ★issue の形 (項目6 のドライバが code で assert する。**code は安定識別子**):
   *     { code, severity:"error"|"warning", message, at:[tx,ty]|null, roomIndex:int|null }
   *   codes: schema-invalid / boss-count / slot-on-wall / unreachable-room /
   *          unreachable-slot / no-trap-candidates /
   *          painting-blocks-start / painting-on-slot (★卓上グリッド P2)  … error
   *          no-enemies / no-boss-slot / painting-aspect / map-used / band-mask /
   *          field-theme-custom / enemy-unknown-key /
   *          tiles-outside-rooms (★Phase 3 項目2) /
   *          painting-missing    (★Phase 4 項目2) /
   *          painting-blocked-broken (★卓上グリッド P2)     /
   *          painting-gate-broken    (★卓上グリッド P3 追補) … warning
   * ────────────────────────────────────────────────────────────────────────── */

  // index.html:2987 FIELD_THEMES の写し。屋外テーマだけ罠の起点ガード条件が変わる (19055)。
  var FIELD_THEME_IDS = { "caravan-road": 1 };

  // 1枚絵の在庫。計画書 §「1枚絵のアスペクト比ロックへの対処」= 山場 20×16(5:4) / ボス 22×18(11:9)。
  // ⚠ **比率**で比べる (40×32 も 5:4 なので等倍拡大なら歪まない)。サイズ一致で比べない。
  var LINT_PAINTING_ASPECTS = [
    { w: 20, h: 16, label: "山場 20×16 (5:4)" },
    { w: 22, h: 18, label: "ボス 22×18 (11:9)" },
    // ★P7 (2026-08-12): 分岐マップのノード用。道中 7×6 (7:6) / ボス 9×6 (3:2)。
    { w: 7,  h: 6,  label: "ノード山場 7×6 (7:6)" },
    { w: 9,  h: 6,  label: "ノードボス 9×6 (3:2)" },
  ];
  /* ⚠ Phase 0 にあった LINT_PAINTING_MIN_AREA (面積 150 以上なら貼るだろう、という推測) は
   *   ★Phase 4 項目2 で**廃止**した。「絵を貼るか」が rooms[i].painting に明示されるので、
   *   面積から推測する必要が無くなった (下の painting-aspect ループを参照)。 */
  var LINT_MAP_USED_MIN_ROWS = 6;     // 使用範囲がこれより薄いと画面上下が黒帯になりやすい
  var LINT_MAP_USED_MIN_FILL = 0.20;  // 使用範囲がグリッド全体のこの割合を切ると黒が目立つ

  /* rect (= [r1,c1,r2,c2]) に painting を貼ったとき、5引数 drawImage で歪まないか。
   * ★lintMapDef (単一マップ) と lintRun (分岐ノード) の**両方から呼ぶ唯一の判定式**。
   *   ⚠ 片方へ写すと必ず食い違う (在庫を 1 行足したときノード側だけ古い在庫で判定する等)。
   * ⚠ **比率**で比べる (40×32 も 5:4 なので等倍拡大なら歪まない)。サイズ一致で比べない。
   *
   * ★P7 (2026-08-12) — 第2引数 painting ({theme,key}) を足して**指定したその絵**と比べる。
   *   ⚠⚠ 在庫一覧との照合だけだと、在庫のアスペクトが 2 種から 4 種へ増えた瞬間に
   *     **「9×6 の部屋に 7:6 の絵」が無警告で通る** (部屋の比が一覧のどれかに当たれば緑に
   *     なるだけで、貼る絵が何かを一度も見ていなかった)。P7 でノード用 7:6 / 3:2 を在庫へ
   *     足す = その穴が現実になるので、ここで「絵そのもの」を見るように直した。
   *   ⚠ カタログ未取得のときだけ従来どおり在庫一覧へ落ちる (painting-missing と同じ判断で、
   *     「カタログが無い」を「歪む」と誤報しない)。 */
  function paintingAspectFits(rect, painting) {
    var rw = rect[3] - rect[1] + 1, rh = rect[2] - rect[0] + 1;
    var b = painting ? paintingBoundsFor(painting.theme, painting.key) : null;
    if (b) {
      var bw = b[3] - b[1] + 1, bh = b[2] - b[0] + 1;
      return rw * bh === rh * bw;
    }
    for (var j = 0; j < LINT_PAINTING_ASPECTS.length; j++) {
      var A = LINT_PAINTING_ASPECTS[j];
      if (rw * A.h === rh * A.w) return true;
    }
    return false;
  }

  /* 上の警告文に載せる「その絵は何タイル用か」。カタログから引けなければ在庫一覧の名前へ落ちる。 */
  function paintingAspectWanted(painting) {
    /* ⚠ ここは判定ではなく**文言**を組むだけ。上の paintingAspectFits の 1 行を
     *   **部分文字列として含めない**書き方にしてある — 含めると driver_graph_p7 の変異
     *   oldaspect が「2 箇所ヒット」で空振りする (2026-08-12 に実際に踏んだ)。
     *   ⚠⚠ 変異は indexOf の部分一致なので、末尾にコメントを足しただけでは分かれない。 */
    var pg = painting || {};
    var wb = paintingBoundsFor(pg.theme, pg.key);
    if (!wb) return "在庫: " + paintingAspectNames().join(" / ");
    var wh = boundsWH(wb);
    return '指定した絵 "' + painting.theme + "/" + painting.key + '" は ' + wh.tw + "×" + wh.th + " タイル用";
  }
  function paintingAspectNames() {
    var names = [];
    for (var j = 0; j < LINT_PAINTING_ASPECTS.length; j++) names.push(LINT_PAINTING_ASPECTS[j].label);
    return names;
  }

  function lintIssue(code, severity, message, at, roomIndex) {
    return {
      code: code, severity: severity, message: message,
      at: (at && at.length >= 2) ? [at[0], at[1]] : null,
      roomIndex: (typeof roomIndex === "number") ? roomIndex : null,
    };
  }

  // 起点から 4近傍 flood fill。歩けるのは map[r][c] !== T_WALL のタイル。
  // ★index.html:3814 isTileWall() と同義 (値 2 だけが壁。**値 1 のレア床は歩ける**)。
  //   ⚠ isTileWall はさらに情景スプライト (obstacleTileMask) も壁扱いにするが、
  //     エディタは情景を持たないのでそこは数えない = ここの到達集合はゲームの**上限**。
  //     「ここで到達不能」なら実ゲームでも確実に到達不能 (偽陽性はあり得ても偽陰性は出にくい)。
  function reachableFrom(map, W, H, sx, sy) {
    var seen = new Array(W * H);
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) return seen;
    if (map[sy][sx] === T_WALL) return seen;
    var stack = [sy * W + sx];
    seen[sy * W + sx] = 1;
    while (stack.length) {
      var k = stack.pop(), x = k % W, y = (k - x) / W;
      // 4近傍のみ (斜めは通さない)。index.html の aStar も 4近傍。
      if (x + 1 < W && !seen[k + 1]     && map[y][x + 1] !== T_WALL) { seen[k + 1] = 1;     stack.push(k + 1); }
      if (x - 1 >= 0 && !seen[k - 1]    && map[y][x - 1] !== T_WALL) { seen[k - 1] = 1;     stack.push(k - 1); }
      if (y + 1 < H && !seen[k + W]     && map[y + 1][x] !== T_WALL) { seen[k + W] = 1;     stack.push(k + W); }
      if (y - 1 >= 0 && !seen[k - W]    && map[y - 1][x] !== T_WALL) { seen[k - W] = 1;     stack.push(k - W); }
    }
    return seen;
  }

  // 罠 / 隠し宝箱の候補タイル数。
  // ★index.html の候補走査を**逐語で写した**もの:
  //     spawnTraps            19038-19058
  //     spawnHiddenChests     17947-17969
  //     spawnExplorationChests 18020-18042
  //   ① map[r][c] !== 0 は除外 … ★**値 1 のレア床は候補にならない** (元仕様。歩けはする)
  //   ② 除外部屋の中は除外
  //   ③ 罠だけ: 非屋外テーマなら起点の半径 1 (3×3) を除外 (index.html:19055)
  //  ⚠ どれも候補 0 のとき `if (candidates.length === 0) return;` で**無言で戻る**
  //    (計画書 落とし穴⑥)。だからこの数がゼロなら必ずエラーにする。
  function candidateTileCount(map, W, H, rooms, excludedSet, startTx, startTy, useStartGuard) {
    var n = 0;
    for (var r = 0; r < H; r++) {
      for (var c = 0; c < W; c++) {
        if (map[r][c] !== T_FLOOR) continue;
        if (useStartGuard && Math.abs(c - startTx) <= 1 && Math.abs(r - startTy) <= 1) continue;
        var inExcluded = false;
        for (var i = 0; i < rooms.length; i++) {
          if (!excludedSet[i]) continue;
          var q = rooms[i].rect;
          if (r >= q[0] && r <= q[2] && c >= q[1] && c <= q[3]) { inExcluded = true; break; }
        }
        if (inExcluded) continue;
        n++;
      }
    }
    return n;
  }
  function setKey(s) {                     // 除外集合の同一性比較用 ("0,2" 形式)
    var ks = []; for (var k in s) if (s[k]) ks.push(+k);
    ks.sort(function (a, b) { return a - b; });
    return ks.join(",");
  }

  /* opt.catalog … 未知キー検査に使う敵カタログ。省略時はモジュールの取得済みカタログ。
   *   null を**明示的に**渡すと未取得扱い = 検査スキップ (ドライバが両状態を測れる)。 */
  function lintMapDef(src, opt) {
    var errors = [], warnings = [], i, j;
    function err(code, msg, at, ri) { errors.push(lintIssue(code, "error", msg, at, ri)); }
    function warn(code, msg, at, ri) { warnings.push(lintIssue(code, "warning", msg, at, ri)); }
    function done() { return { ok: errors.length === 0, errors: errors, warnings: warnings }; }

    // ── lint 項目④ boss ちょうど 1 つ … validate() の結果を**再利用**する ───────
    //   ★自前で数え直さない (判定式を 2 本持つと必ず食い違う)。
    //   validate は**素の src** に掛ける = schema / grid / themeId の異常もここで拾える
    //   (sanitize 後に掛けると schema と grid は既定へ上書きされ、永久に落ちなくなる)。
    var v = validate(src);
    for (i = 0; i < v.issues.length; i++) {
      err(v.issues[i].code === "boss-count" ? "boss-count" : "schema-invalid",
          v.issues[i].message, null, null);
    }
    // 幾何の検査ができない (rooms が無い) ならここで打ち切る。
    if (!src || typeof src !== "object" || !Array.isArray(src.rooms) || src.rooms.length === 0) return done();

    // 以降の幾何検査は sanitize したコピーの上で行う。
    // ⚠ src は 1 バイトも書き換えない (lint は副作用ゼロ = 何度呼んでも mapDef が変わらない)。
    var d = sanitize(src, DEFAULT_DUNGEON);
    var W = d.grid.w, H = d.grid.h;
    var rooms = d.rooms;
    var map = buildMapData(d);
    /* ★Phase 3 項目2: tiles が**実際に幾何として効いているか**。map と別に持つ理由は、
     *   buildMapData の戻り値だけを見ても「tiles 由来」か「矩形由来」か区別できないため。
     *   ⚠ sanitize は tiles の中身を検査せず clone するだけ (非オブジェクトは null に潰す) なので、
     *     壊れた tiles はここで map:null になり、矩形由来の map と組み合わさる = 下の検査は動かない。
     *     その場合の通知は validate(src) の tiles-bad (上で error 済み) が担当する。 */
    var tinfo = expandTilesInfo(d);
    var isField = !!FIELD_THEME_IDS[d.themeId];
    var startTx = d.start.tx, startTy = d.start.ty;

    // ── 検査対象の点を集める (起点 / 敵スロット / ボススロット) ──────────────
    var points = [{ tile: [startTx, startTy], label: "起点", kind: "start", roomIndex: null }];
    for (i = 0; i < rooms.length; i++) {
      var es = rooms[i].enemySlots || [];
      for (j = 0; j < es.length; j++)
        points.push({ tile: es[j], label: "敵スロット " + rooms[i].id + " #" + j, kind: "enemy", roomIndex: i });
      if (rooms[i].bossSlot)
        points.push({ tile: rooms[i].bossSlot, label: "ボススロット (" + rooms[i].id + ")", kind: "boss", roomIndex: i });
    }

    // ── lint 項目② 壁乗り ★これが計画書 落とし穴② = `8519138` の再来を止める装置 ──
    //   index.html:7083 の救済は `mapData[r][c] === 1` **しか見ない**(実読で確認済み)。
    //   値 2 に置かれた敵は救われず alive のまま到達不能 →
    //   checkDungeonClear (14097) の enemies.every(e => !e.alive) が永久に false になり、
    //   **ボスを倒してもクエストがクリアしない**。
    var startOnWall = false;
    for (i = 0; i < points.length; i++) {
      var p = points[i], tx = p.tile[0], ty = p.tile[1];
      var outside = (tx < 0 || tx >= W || ty < 0 || ty >= H);
      if (!outside && map[ty][tx] !== T_WALL) { p.wall = false; continue; }
      p.wall = true;
      var where = " (tx" + tx + ", ty" + ty + ")";
      if (p.kind === "start") {
        startOnWall = true;
        err("slot-on-wall",
            "起点が" + (outside ? "マップの外にあります" : "壁/岩盤 (値2) の上にあります") + where +
            " — プレイヤーが動けません。起点が壁のため、到達可能性 (flood fill) の検査は打ち切りました",
            p.tile, null);
      } else {
        err("slot-on-wall",
            p.label + " が" + (outside ? "マップの外にあります" : "壁/岩盤 (値2) の上にあります") + where +
            " — 敵スポーンの救済 (index.html:7083) は値1しか見ないため、この敵は岩盤に埋まったまま alive で残り、" +
            "ボスを倒してもクエストがクリアしません (8519138 の再来)",
            p.tile, p.roomIndex);
      }
    }

    // ── lint 項目① 連結性 (起点から 4近傍 flood fill) ────────────────────────
    //   計画書 落とし穴⑦: findNextRoomGoal (13781) は**距離だけ**で目標を選ぶので、
    //   孤立部屋があると永久にウロつき visitedRooms が埋まらない (14096)。
    //   ⚠ 起点自体が壁のときは到達集合が空になり全部が到達不能として溢れるので、
    //     根本原因 (上の slot-on-wall) だけ報告して**ここは打ち切る**。
    /* ── ★Phase 6: 通行判定用の地図 (情景物で塞いだマスを壁にした写し) ──────────
     *  本編の isTileWall (index.html:4044) は mapData の値2 に加えて obstacleTileMask
     *  (= blocking な情景) も壁として扱う。よって到達可能性は**両方**で決まる。
     *  ⚠ map 本体は書き換えない。罠/宝箱の候補タイル (下の項目③) は index.html 側が
     *    mapData を直接見て情景を無視するので、そちらは map のまま数える必要がある
     *    (「歩ける ≠ 候補になる」= Phase 0 項目5 で確立した区別)。 */
    /* ★[卓上グリッド P2] 1 枚絵に描かれた障害物 (樽・木箱・瓦礫) も**同じ扱い**で積む。
     *  本編は roomPaintings 経由で obstacleTileMask へ焼くので、ここで数えないと
     *  「エディタは通れると言ったのに本編では通れない」になる (propBlockedTiles と同じ理由)。
     *  ⚠ 集合は分けて持つ。原因が「置いた柱」か「絵の障害物」かで直し方がまったく違い、
     *    メッセージを混ぜると利用者はどちらを疑えばよいか分からない。 */
    var propBlocked = propBlockedTiles(d);
    var paintBlocked = paintingBlockedTiles(d);
    var propBlockedSet = {}, paintBlockedSet = {};
    var mapWalk = map;
    if (propBlocked.length || paintBlocked.length) {
      mapWalk = new Array(H);
      for (i = 0; i < H; i++) mapWalk[i] = map[i].slice();
      for (i = 0; i < propBlocked.length; i++) {
        propBlockedSet[propBlocked[i]] = 1;
        mapWalk[Math.floor(propBlocked[i] / W)][propBlocked[i] % W] = T_WALL;
      }
      for (i = 0; i < paintBlocked.length; i++) {
        paintBlockedSet[paintBlocked[i]] = 1;
        mapWalk[Math.floor(paintBlocked[i] / W)][paintBlocked[i] % W] = T_WALL;
      }
    }
    /* 起点そのものを情景物で塞いだ場合。壁乗り (startOnWall) と同じ「全部が到達不能に
     * 見える」壊れ方をするので、根本原因だけ報告して flood fill は打ち切る。 */
    var startBlockedByProp = !startOnWall && !!propBlockedSet[startTy * W + startTx];
    if (startBlockedByProp)
      err("prop-blocks-start",
          "起点 (tx" + startTx + ", ty" + startTy + ") が通行不能な情景物で塞がれています" +
          " — プレイヤーがその場から動けません。到達可能性 (flood fill) の検査は打ち切りました",
          [startTx, startTy], null);
    /* ★[卓上グリッド P2] 同じ壊れ方を 1 枚絵のマスクでも起こせる (絵の樽の上に起点を置いた)。 */
    var startBlockedByPaint = !startOnWall && !startBlockedByProp
                              && !!paintBlockedSet[startTy * W + startTx];
    if (startBlockedByPaint)
      err("painting-blocks-start",
          "起点 (tx" + startTx + ", ty" + startTy + ") が 1枚絵の障害物 (blocked マスクの #) で塞がれています" +
          " — プレイヤーがその場から動けません。到達可能性 (flood fill) の検査は打ち切りました",
          [startTx, startTy], null);

    if (!startOnWall && !startBlockedByProp && !startBlockedByPaint) {
      var reach = reachableFrom(mapWalk, W, H, startTx, startTy);
      /* ★情景物を無視した到達集合。**両者の差 = 置いた物が原因で行けなくなった場所**。
       *  これがあると「廊下が繋がっていない」と「柱で塞いだ」を取り違えずに言い分けられる。
       *  ⚠ props が無いときは同じ配列を指すだけ (flood fill を 2 回走らせない)。
       *  ★[卓上グリッド P2] 1 枚絵のマスクも同じ「無ければ届くか」の対照に含める。 */
      var reachNoProps = (propBlocked.length || paintBlocked.length)
        ? reachableFrom(map, W, H, startTx, startTy) : reach;
      /* ★[卓上グリッド P2] 原因の名指しは**実際に置かれている物**で決める。
       * ⚠⚠ 「情景物か 1枚絵の障害物」と両論併記にすると、1 枚絵を 1 枚も貼っていない
       *   マップでも「1枚絵の障害物」を疑わせる = 利用者がどちらを直せばよいか分からない。
       *   さらに props だけのマップでは**メッセージが 1 バイトも変わらない**ので、
       *   既存の検出器 (driver_mapeditor_props §6 6d) の測定点を動かさずに済む。 */
      var blockerLabel = !paintBlocked.length ? "情景物 (柱・テーブル・倒木など)"
                       : !propBlocked.length  ? "1枚絵の障害物 (blocked マスクの #)"
                       : "情景物か 1枚絵の障害物";
      var blockerShort = !paintBlocked.length ? "情景物"
                       : !propBlocked.length  ? "1枚絵の障害物"
                       : "情景物か 1枚絵の障害物";
      for (i = 0; i < rooms.length; i++) {
        var rect = rooms[i].rect, hit = false, walkable = 0, hitNoProps = false;
        for (var r2 = rect[0]; r2 <= rect[2]; r2++) {
          for (var c2 = rect[1]; c2 <= rect[3]; c2++) {
            if (map[r2][c2] === T_WALL) continue;
            walkable++;
            if (reach[r2 * W + c2]) { hit = true; }
            if (reachNoProps[r2 * W + c2]) { hitNoProps = true; }
          }
        }
        if (hit) continue;
        err("unreachable-room",
            "部屋 " + rooms[i].id + " が起点 (tx" + startTx + ", ty" + startTy + ") から到達できません" +
            (walkable === 0 ? " — この部屋には歩けるタイルが 1 つもありません (帯マスクで潰れている可能性)"
             : hitNoProps    ? " — ★通行不能な" + blockerLabel + " が通り道を塞いでいます" +
                               " (" + blockerShort + "が無ければ到達できます)"
             :                 " — 廊下でつながっていません") +
            "。visitedRooms が埋まらず永久にクリアしません (index.html:14096)",
            [rect[1], rect[0]], i);
      }
      for (i = 0; i < points.length; i++) {
        var q2 = points[i];
        if (q2.kind === "start" || q2.wall) continue;   // 壁乗りは根本原因を既に報告済み
        var qk = q2.tile[1] * W + q2.tile[0];
        /* ★Phase 6: スロットの真上に通行不能な情景物を置いた場合。本編のスポーン救済
         *  (index.html:7083) は mapData の値1 しか見ないため情景物では救われず、この敵は
         *  埋まったまま alive で残る = 8519138 (ボスを倒してもクリアしない) と同じ壊れ方。 */
        if (propBlockedSet[qk]) {
          err("prop-on-slot",
              q2.label + " (tx" + q2.tile[0] + ", ty" + q2.tile[1] + ") が通行不能な情景物の下にあります" +
              " — スポーン救済 (index.html:7083) は値1しか見ないため救われず、この敵は動けないまま" +
              "alive で残り、ボスを倒してもクエストがクリアしません",
              q2.tile, q2.roomIndex);
          continue;                                     // 到達不能も併発するが根本原因はこちら
        }
        /* ★[卓上グリッド P2] 1 枚絵の障害物でもまったく同じ壊れ方をする (絵の樽の上に敵)。
         *  ⚠ 敵スポーンは構造壁しか見ない (index.html:20733) ので obstacleTileMask では救われない。 */
        if (paintBlockedSet[qk]) {
          err("painting-on-slot",
              q2.label + " (tx" + q2.tile[0] + ", ty" + q2.tile[1] + ") が 1枚絵の障害物 (blocked の #) の下にあります" +
              " — スポーン救済 (index.html:7083) は値1しか見ないため救われず、この敵は動けないまま" +
              "alive で残り、ボスを倒してもクエストがクリアしません",
              q2.tile, q2.roomIndex);
          continue;
        }
        if (reach[qk]) continue;
        err("unreachable-slot",
            q2.label + " (tx" + q2.tile[0] + ", ty" + q2.tile[1] + ") が起点から到達できません" +
            (reachNoProps[qk] ? " — ★通行不能な" + blockerShort + "が通り道を塞いでいます" : "") +
            " — この敵は倒せず alive のまま残り、クエストがクリアしません",
            q2.tile, q2.roomIndex);
      }
    }

    // ── lint 項目③ 罠・宝箱の候補タイルがゼロ (計画書 落とし穴⑥: **無言の失敗**) ──
    //   除外規則は 2 通りあり、**両方の観点で**検査する:
    //     (1) 現行式 index.html:17951 / 18025 / 19041
    //         `ROOMS.length >= 3 ? {0, boss} : {boss}` … 部屋数からの推測
    //     (2) role 式 (計画書の移行先) … role:"start" の部屋 と role:"boss" の部屋
    //   ⚠ 2 部屋の現行ダンジョンでは (1) と (2) の除外集合が**違う**
    //     ((1)={boss} / (2)={start,boss}) ので、片方だけ見ると Phase 1-2 の移行で事故る。
    var bIdx = bossRoomIdx(d);
    var exLegacy = {};
    if (rooms.length >= 3) exLegacy[0] = 1;
    if (bIdx >= 0) exLegacy[bIdx] = 1;
    var exRole = {};
    for (i = 0; i < rooms.length; i++)
      if (rooms[i].role === "start" || rooms[i].role === "boss") exRole[i] = 1;

    var rules = [{ key: "legacy", label: "現行式 (部屋数からの推測)", ex: exLegacy }];
    if (setKey(exRole) !== setKey(exLegacy)) rules.push({ key: "role", label: "role 式 (計画書の移行先)", ex: exRole });
    else rules[0].label = "現行式 = role 式 (除外部屋が同一)";
    for (i = 0; i < rules.length; i++) {
      // 罠は起点半径1を追加除外 (非屋外テーマのみ)。宝箱にはその規則が無い。
      var nTrap  = candidateTileCount(map, W, H, rooms, rules[i].ex, startTx, startTy, !isField);
      var nChest = candidateTileCount(map, W, H, rooms, rules[i].ex, startTx, startTy, false);
      if (nTrap === 0)
        err("no-trap-candidates",
            "罠の候補タイルが 0 です [" + rules[i].label + "] — 除外部屋の外に「値0の床」が 1 枚も残っていません。" +
            "ゲーム側は candidates.length===0 で**無言で return** するので、罠が 1 つも出ないまま気づけません",
            null, null);
      if (nChest === 0)
        err("no-trap-candidates",
            "隠し宝箱 / 探索宝箱の候補タイルが 0 です [" + rules[i].label + "] — 同上。宝箱も無言で 0 個になります",
            null, null);
    }

    /* ── lint 項目⑤ 1枚絵の縦横比 (★エラーではなく**警告**) ────────────────────
     *  ★Phase 4 項目2 で「painting を明示した部屋だけ」へ絞った (Phase 0 からの宿題)。
     *  Phase 0 の折衷は「面積 >= 150 の部屋なら 1枚絵を貼るだろう」という**推測**だった。
     *  当時は painting を指定する手段が無く、そうしないと装置が一度も発火せず死ぬためで、
     *  代償として既定プリセットの山場 20×14 が常時警告を出していた (誤検出)。
     *  Phase 4 で「絵を貼るか」が mapDef に明示されるので推測は不要になり、面積
     *  ヒューリスティック (LINT_PAINTING_MIN_AREA) は**廃止**した。
     *  ⚠ これにより既定プリセット (painting:null) では painting-aspect が**出なくなる**。
     *    それが正しい挙動 = driver_mapeditor.js §5 2c は「明示した部屋でだけ出る」へ書き直した。
     *  警告のままにする理由は不変: 出発は止めない (歪んで貼るのも卓用としては選択肢)。 */
    for (i = 0; i < rooms.length; i++) {
      if (!rooms[i].painting) continue;                 // ★明示した部屋だけ比率を見る
      var rc = rooms[i].rect;
      // ★判定式は paintingAspectFits ただ 1 本 (lintRun の graph-painting-aspect と共有)
      if (paintingAspectFits(rc, rooms[i].painting)) continue;
      warn("painting-aspect",
           "部屋 " + rooms[i].id + " は 幅" + (rc[3] - rc[1] + 1) + "×高さ" + (rc[2] - rc[0] + 1) +
           " タイルですが、" + paintingAspectWanted(rooms[i].painting) +
           " で縦横比が一致しません — index.html:5440 の 5引数 drawImage で" +
           "引き伸ばされて歪みます (この部屋は painting が明示指定されています)",
           [rc[1], rc[0]], i);
    }

    /* ── ★Phase 4 項目2: painting がカタログから引けない (**warning**) ──────────
     *  ⚠ カタログ未取得 (loadPaintingCatalog の前 / fetch 失敗 / file:// 直開き) のときは
     *    検査そのものを**スキップ**する。「カタログが無い」を「絵が無い」と誤報すると、
     *    オフラインでは指定した部屋が全部警告になり lint 全体が信用されなくなる
     *    (enemy-unknown-key とまったく同じ判断)。
     *  ⚠ sanitize は未知の theme / key を**落とさない**ので、ここが唯一の検出器になる。 */
    if (getPaintingCatalog()) {
      for (i = 0; i < rooms.length; i++) {
        var pg = rooms[i].painting;
        if (!pg) continue;
        if (paintingSrcFor(pg.theme, pg.key)) continue;   // ★引ければ何も言わない
        var prc = rooms[i].rect;
        warn("painting-missing",
             "部屋 " + rooms[i].id + ' の1枚絵 (テーマ "' + pg.theme + '" / 部屋キー "' + pg.key +
             '") が index.html の ROOM_PAINTINGS_DEF にありません — ゲーム側に存在しない参照なので、' +
             "DF へ書き出してもこの部屋には絵が貼られません (綴り違い、またはエディタが古い可能性)",
             [prc[1], prc[0]], i);
      }
    }

    /* ── ★[卓上グリッド P2] 1 枚絵の障害物マスクが壊れている (**warning**) ──────────
     *  paintingBlockedRows は寸法の合わないマスクを**丸ごと捨てる**。捨てたことを黙っていると
     *  「障害物を書いたのに全部すり抜ける」を誰も検出できない = silent fail になる。
     *  ⚠ warning なのは、捨てた結果が「P2 以前とまったく同じ盤面」= 出発を止めるほどではないため。
     *  ⚠⚠ ここが見るのは **mapDef 経路 (rooms[i].painting) だけ**。既定 6 シナリオは絵側の
     *    tileBounds へ直接貼るので、そちらのマスク破損はこの lint に**出てこない**
     *    (本編の __paintBlockProbe と tools/driver_paint_blocked.js が受け持つ)。 */
    if (getPaintingCatalog()) {
      for (i = 0; i < rooms.length; i++) {
        var bpg = rooms[i].painting;
        if (!bpg) continue;
        var bm = paintingBlockedFor(bpg.theme, bpg.key);
        if (!bm.error) continue;
        var brc = rooms[i].rect;
        warn("painting-blocked-broken",
             "部屋 " + rooms[i].id + ' の1枚絵 (テーマ "' + bpg.theme + '" / 部屋キー "' + bpg.key +
             '") の障害物マスク blocked が壊れています: ' + bm.error +
             " — マスクは丸ごと捨てられ、絵に描かれた樽や木箱をキャラがすり抜けます",
             [brc[1], brc[0]], i);
      }
    }

    /* ── ★[卓上グリッド P3 追補] 1 枚絵の出入口 gates が壊れている (**warning**) ──────
     *  paintingGates は形の合わない指定を**丸ごと捨てる**。捨てたことを黙っていると
     *  「絵の坑口に出口を移したのに、辺の中点のままだった」を誰も検出できない = silent fail。
     *  ⚠ warning なのは、捨てた結果が「追補以前とまったく同じ盤面 (辺の中点)」= 詰まないため。
     *  ⚠⚠ ここが見るのは blocked と同じく **mapDef 経路 (rooms[i].painting) だけ**。 */
    if (getPaintingCatalog()) {
      for (i = 0; i < rooms.length; i++) {
        var gpg = rooms[i].painting;
        if (!gpg) continue;
        var gm = paintingGatesFor(gpg.theme, gpg.key);
        if (!gm.error) continue;
        var grc = rooms[i].rect;
        warn("painting-gate-broken",
             "部屋 " + rooms[i].id + ' の1枚絵 (テーマ "' + gpg.theme + '" / 部屋キー "' + gpg.key +
             '") の出入口 gates が壊れています: ' + gm.error +
             " — 指定は丸ごと捨てられ、出口・扉・矢印が絵に描かれた口ではなく部屋の辺の中点に立ちます",
             [grc[1], grc[0]], i);
      }
    }

    /* ── ★Phase 6: 個別に置いた情景物 (props) の検査 ────────────────────────────
     *  ⚠ 「通り道を塞いだ」は上の項目① (unreachable-room / unreachable-slot /
     *    prop-on-slot / prop-blocks-start) が既に見ている。ここは**それ以外**だけ。
     *  ⚠ どちらも warning。壁の上に置くのも、カタログに無い種を持ち続けるのも、
     *    「出発を止めるほどではないが黙って通してはいけない」性質のため。 */
    var props = Array.isArray(d.props) ? d.props : [];
    if (props.length) {
      var catReady = !!getScenerySheets();               // 未取得なら種の検査はしない
      var unknownKinds = {}, nOnWall = 0, firstWall = null;
      for (i = 0; i < props.length; i++) {
        var pp = props[i];
        /* ⚠ カタログ未取得 (file:// 直開き / fetch 失敗) のときは検査そのものを**スキップ**。
         *  「カタログが無い」を「種が無い」と誤報すると、オフラインでは置いた物が全部
         *  警告になり lint 全体が信用されなくなる (painting-missing と同じ判断)。 */
        if (catReady && !getScenerySheets()[pp.kind]) unknownKinds[pp.kind] = 1;
        if (map[pp.ty] && map[pp.ty][pp.tx] === T_WALL) {
          nOnWall++;
          if (!firstWall) firstWall = [pp.tx, pp.ty];
        }
      }
      var uk = Object.keys(unknownKinds);
      if (uk.length)
        warn("prop-unknown-kind",
             "情景物に index.html の SCENERY_SHEETS へ未登録の種があります: " + uk.join(" / ") +
             " — ゲーム側に絵が無いので、DF へ書き出してもこの物は描かれません" +
             " (綴り違い、またはエディタが古い可能性)",
             null, null);
      if (nOnWall)
        warn("prop-on-wall",
             "情景物 " + nOnWall + " 個が壁/岩盤 (値2) の上にあります — 天井の上に物が浮いて見えます" +
             " (通行判定には影響しません。壁は元から通れないため)",
             firstWall, null);
    }

    /* ── ★P1 (扉) の lint ──────────────────────────────────────────────────────
     * ⚠⚠ ここで見るのは「**同じ扉が 2 つある**」だけ。「扉が壁の上か床の上か」は
     *   **わざと検査しない** — 閉扉をどちらで塞ぐか (mapData の壁のまま扉を重ねるのか、
     *   タイルを床にして扉が塞ぐのか) は P3 で決める設計判断であり、まだ答えが無い。
     *   ここで先に片方を正だと決めつけると、P3 が反対を選んだ瞬間に**永久に間違ったまま
     *   緑を出し続ける検出器**になる (golden が「最初から間違った絵」を緑にしたのと同型)。
     *   位置の検査は P3 で通行判定の向きが決まってから足す。
     * ⚠ 一方これは向きに依存しない: タイル重複は「どちらの状態が本物か決まらない」、
     *   id 重複は「セーブが片方を上書きする」で、P3 の設計がどちらに転んでも不正。 */
    var doors = Array.isArray(d.doors) ? d.doors : [];
    if (doors.length) {
      var seenTile = {}, seenId = {}, dupTile = null, dupId = null;
      for (i = 0; i < doors.length; i++) {
        var dd = doors[i];
        if (!dd) continue;
        var tk = dd.tx + "," + dd.ty;
        if (seenTile[tk] && !dupTile) dupTile = [dd.tx, dd.ty];
        seenTile[tk] = 1;
        if (dd.id) {
          if (seenId[dd.id] && !dupId) dupId = dd.id;
          seenId[dd.id] = 1;
        }
      }
      if (dupTile)
        warn("door-duplicate",
             "同じマス (" + dupTile[0] + "," + dupTile[1] + ") に扉が 2 枚以上あります — " +
             "どちらの開閉状態が本物か決まりません (1 マス 1 枚にしてください)",
             dupTile, null);
      if (dupId)
        warn("door-duplicate",
             "扉の id が重複しています: " + dupId + " — セーブ時に片方の状態がもう片方を" +
             "上書きします (id はマップ内で一意にしてください)",
             null, null);
    }

    // ── lint 項目⑥ MAP_USED 枠 (画面の黒帯予防) ──────────────────────────────
    //  index.html:3290 と同じ導出。部屋にも廊下にも属さない行/列は恒久的に未探索の岩盤 =
    //  画面上は純黒になり、カメラのクランプはこの枠までしか寄れない。
    //  ⚠ 枠そのものの**可視化**は render() の白破線 (COL.used) + HUD の「使用範囲」で行う。
    //    ここでは「枠が危ないか」だけを警告する。
    var mu = mapUsed(d);
    var usedRows = mu.r1 - mu.r0 + 1, usedCols = mu.c1 - mu.c0 + 1;
    var fill = (usedRows * usedCols) / (W * H);
    if (usedRows < LINT_MAP_USED_MIN_ROWS)
      warn("map-used",
           "使用範囲 (MAP_USED) の高さが " + usedRows + " 行しかありません (row " + mu.r0 + "-" + mu.r1 + ") — " +
           "カメラが縦に寄れず、画面の上下が黒帯になります",
           [mu.c0, mu.r0], null);
    if (fill < LINT_MAP_USED_MIN_FILL)
      warn("map-used",
           "使用範囲 (MAP_USED) がグリッド全体の " + Math.round(fill * 100) + "% しかありません (col " +
           mu.c0 + "-" + mu.c1 + " / row " + mu.r0 + "-" + mu.r1 + ") — 画面の大半が純黒の岩盤になります",
           [mu.c0, mu.r0], null);
    if (!(startTx >= mu.c0 && startTx <= mu.c1 && startTy >= mu.r0 && startTy <= mu.r1))
      warn("map-used",
           "起点 (tx" + startTx + ", ty" + startTy + ") が使用範囲 (MAP_USED col " + mu.c0 + "-" + mu.c1 +
           " / row " + mu.r0 + "-" + mu.r1 + ") の外にあります — カメラのクランプ外なので開始直後の画面が黒帯になります",
           [startTx, startTy], null);

    /* ── ★Phase 3 項目2: 部屋 (rooms) の外に描いた床 ─────────────────────────────
     *  「焼き固め方式」では **tiles = 幾何 / rooms = 意味** に分離する。ブラシで部屋の外に
     *  床を描いても、その床は rooms からは見えない = 部屋に紐づく仕掛けが一切乗らない。
     *  これは仕様どおりの動作なので **warning** (error ではない。卓用マップとしては正当)。
     *
     *  ⚠⚠ 文面は必ず実コードで裏取りしてから書く。「罠も宝箱も湧きません」は**嘘になる**
     *    (2026-08-02 に index.html を実読して確認):
     *      spawnRoomChests (18073) … ROOMS だけを走査           → 部屋の外には出ない ✔
     *      敵 (enemySlots / bossSlot) … 部屋が持つ宣言           → 部屋の外には出ない ✔
     *      1枚絵 / 情景 / visitedRooms … すべて rooms の矩形基準  → 部屋の外には及ばない ✔
     *      spawnTraps (19199) / spawnHiddenChests (18112) /
     *      spawnExplorationChests (18183) … **mapData 全面**を走査して値0の床を拾う
     *                                        → 部屋の外の床(0)にも普通に湧く ✘
     *    嘘をつく lint は読まれなくなり装置として死ぬので、ここは事実だけを書く。
     *  ⚠ 値1のレア床は元仕様 (`mapData[r][c] !== 0` で continue) により罠/宝箱の候補にならない。
     *    「歩ける ≠ 候補になる」を混同しないよう内訳を出す。 */
    if (tinfo.map) {
      var nOut0 = 0, nOut1 = 0, firstOut = null, oRow, oCol, oVal, covered, boxes = [];
      for (i = 0; i < rooms.length; i++) boxes.push(rooms[i].rect);
      for (i = 0; i < d.corridors.length; i++) boxes.push(d.corridors[i]);
      for (oRow = 0; oRow < H; oRow++) {
        for (oCol = 0; oCol < W; oCol++) {
          oVal = map[oRow][oCol];
          if (oVal === T_WALL) continue;                       // 壁は「描いた床」ではない
          covered = false;
          for (j = 0; j < boxes.length; j++) {
            var bx = boxes[j];
            if (oRow >= bx[0] && oRow <= bx[2] && oCol >= bx[1] && oCol <= bx[3]) { covered = true; break; }
          }
          if (covered) continue;
          if (oVal === T_RARE) nOut1++; else nOut0++;
          if (!firstOut) firstOut = [oCol, oRow];              // at は [tx, ty] = [列, 行]
        }
      }
      if (nOut0 + nOut1 > 0)
        warn("tiles-outside-rooms",
             "部屋 (rooms) にも廊下 (corridors) にも含まれない床を " + (nOut0 + nOut1) +
             " タイル描いています (床0 = " + nOut0 + " / レア床1 = " + nOut1 + ") — " +
             "自由タイルでは tiles が幾何、rooms は意味 (敵スロット / 除外部屋 / 1枚絵・情景 / " +
             "visitedRooms によるクリア判定) を担うため、部屋の矩形の外には " +
             "**敵も玄室宝箱も1枚絵も置かれず、探索の進捗にも数えられません**。" +
             "そこを「意味のある場所」にするなら、覆う部屋を足してください " +
             "(罠と隠し/探索宝箱だけは床の値0を全面走査するので部屋の外にも湧きます。" +
             "レア床1にすればそれも対象外になります)",
             firstOut, null);
    }

    // ── 屋外の帯マスク (計画書 落とし穴⑤: 最悪の組合せ) ────────────────────────
    //  bandMask ON は row 13-15 以外の**全行を壁へ潰す** (index.html:3323-3328)。
    //  カスタム幾何を描いたのに ON のままだと、描いた部屋が丸ごと消える。
    //  ⚠ 屋外プリセットは意図してこの状態なので**警告**に留める (エラーにしない)。
    //  ★Phase 3 項目2: tiles があるとき buildMapData は帯マスクを**適用しない**ので、
    //    「潰されます」は嘘になる。分岐して「このフラグは効いていない」と伝える。
    if (d.flags.bandMask && tinfo.map) {
      warn("band-mask",
           "屋外の帯マスク (bandMask) が ON ですが、自由タイル (tiles) があるため**適用されません** — " +
           "自由タイルでは tiles が唯一の幾何なので、row " + BAND_TOP_ROW + "-" + BAND_BOTTOM_ROW +
           " 以外の行も壁に潰されません。このフラグは現在なにも効いていないため OFF にして構いません",
           null, null);
    } else if (d.flags.bandMask) {
      var lost = 0, all = [], k2;
      for (i = 0; i < rooms.length; i++) all.push(rooms[i].rect);
      for (i = 0; i < d.corridors.length; i++) all.push(d.corridors[i]);
      for (i = 0; i < all.length; i++) {
        var a = all[i];
        for (k2 = a[0]; k2 <= a[2]; k2++)
          if (k2 < BAND_TOP_ROW || k2 > BAND_BOTTOM_ROW) lost += (a[3] - a[1] + 1);
      }
      if (lost > 0)
        warn("band-mask",
             "屋外の帯マスクが ON です — row " + BAND_TOP_ROW + "-" + BAND_BOTTOM_ROW +
             " 以外に描いた約 " + lost + " タイル分は buildMap の最後で壁に潰されます " +
             "(屋外シナリオの意図した設計。カスタム幾何を活かすなら OFF にしてください)",
             null, null);
    }

    /* ── 屋外テーマ × カスタム幾何の排他 (計画書 落とし穴⑤ =「最悪の組合せ」) ────────
     *  ★**警告**であって error ではない。既定の屋外プリセット (caravan-road) は正当なマップで、
     *    error にすると読み込んだ瞬間に赤くなり lint 全体が信用されなくなる。
     *  ただし「▶ このマップで遊ぶ」は DFMapDef.resolve() が屋外テーマのカスタム幾何を
     *  受け付けない (既定幾何へ落とす) ので、エディタ側は**この code を見て ▶ を止める**。
     *  ⚠ 判定を resolve() と 2 本持たない: どちらも FIELD_THEME_IDS を唯一の出所にする。 */
    if (FIELD_THEME_IDS[d.themeId])
      warn("field-theme-custom",
           'themeId "' + d.themeId + '" は屋外テーマです — 屋外は空/丘/路肩の地平線レンダラと' +
           "視界制限オフが themeId から発火し、カスタム幾何と相互作用が複雑になるため、" +
           "この設定のマップは「▶ このマップで遊ぶ」で試遊できません " +
           "(卓用マップとしての編集・保存・PNG 書き出しは通常どおり行えます)",
           null, null);

    // ── 敵 0 体 / ボススロット無し (★どちらも警告。計画書 落とし穴④の明示要求) ──
    //  「敵 0 体」は卓用マップとしては完全に正当なのでエラーにしない。
    //  ただし DF 側は spawns 空フォールバックで**廃坑の敵が湧く**化けバグを持つので黙らない。
    var enemyN = 0;
    for (i = 0; i < rooms.length; i++) enemyN += (rooms[i].enemySlots || []).length;
    if (enemyN === 0)
      warn("no-enemies",
           "敵スロットが 0 体です — 卓用マップとしては正当ですが、DF へ書き出すと敵が湧きません " +
           "(index.html:6995 の spawns 空フォールバックに落ちると廃坑の敵が旧座標に湧く危険があります)",
           null, null);
    var hasBossSlot = false;
    for (i = 0; i < rooms.length; i++) if (rooms[i].bossSlot) hasBossSlot = true;
    if (!hasBossSlot)
      warn("no-boss-slot",
           "ボススロットがありません — ボスが湧かないので、ボス撃破を前提にした進行になりません",
           null, (bIdx >= 0 && bIdx < rooms.length) ? bIdx : null);

    /* ── 敵の種類キーがカタログに無い (★項目1 で追加。**warning** であって error ではない) ──
     *  ⚠ カタログ未取得 (fetch 失敗 / まだ届いていない) のときは検査そのものを**スキップ**する。
     *    error にしたり未取得時に走らせたりすると、カタログが取れない環境で正しいマップまで
     *    全部赤くなり、lint 全体が信用されなくなる (= 装置として死ぬ)。
     *  ⚠ sanitize は未知キーを**落とさない**ので、ここが唯一の検出器になる。 */
    var cat = (opt && "catalog" in opt) ? opt.catalog : enemyCatalog;
    if (cat) {
      for (i = 0; i < rooms.length; i++) {
        var esk = rooms[i].enemySlots || [];
        for (j = 0; j < esk.length; j++) lintEnemyKind(esk[j], "敵スロット " + rooms[i].id + " #" + j, i);
        lintEnemyKind(rooms[i].bossSlot, "ボススロット (" + rooms[i].id + ")", i);
      }
    }
    function lintEnemyKind(slot, label, ri) {
      var key = enemyKindOf(slot);
      if (!key || cat[key]) return;
      warn("enemy-unknown-key",
           label + ' の敵の種類 "' + key + '" が index.html の ENEMY_TYPES にありません — ' +
           "ゲーム側に存在しないキーなので、DF へ書き出してもこの敵は湧きません " +
           "(綴り違い、またはエディタが古い可能性)",
           slot, ri);
    }

    return done();
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * ★P2 — ゲームブック風 分岐マップ: グラフ (run) の純関数
   * ══════════════════════════════════════════════════════════════════════════
   * 「1 ノード = 独立した 1 マップ / 分岐は**行き止まりありの木** / 枝は合流しない」
   * という企画の骨格 (ユーザー決定 2026-08-06) を、データとして検査可能にするための層。
   *
   * ★ここは**純関数だけ**。DOM・state・乱数に触れず、引数も 1 バイトも書き換えない
   *   (lintMapDef と同じ契約。何度呼んでも run が変わらない)。
   *
   * ★run (潜行 = グラフ全体) の形:
   *     run = { entry:"n0",
   *             nodes:[ { id:"n0", kind:"start", mapDef:{…df-map/1…},
   *                       exits:[ { to:"n1", dir:"up", at:[33,7], hint:{text:"…"} }, … ] }, … ] }
   *
   * | フィールド | 意味 | 設計理由 |
   * |---|---|---|
   * | id   | 安定識別子 | **添字ではなく id**。並べ替えでノード状態やイベント台帳が壊れない |
   * | kind | start/combat/search/loot/rest/event/boss | スポーン内容と除外集合を決める |
   * | at   | 矢印を置き、そこへ歩かせる**床タイル** | 導出にしない (焼き固めマップでは廊下が矩形として存在せず導出が破綻する) |
   * | dir  | up/down/left/right | 省略可。明示したら幾何と食い違わないか lint が warning |
   * | hint | { text } | データは「意味」、表現はゲーム側の台帳 (painting が {theme,key} 参照なのと同じ流儀) |
   *
   * ⚠⚠ **親への戻り (引き返す) はデータに書かない**。木構造なので親は常に 1 つで、
   *   ランタイムが parentOf() から自動生成する。手書きすると必ず食い違う。
   * ────────────────────────────────────────────────────────────────────────── */

  var GRAPH_DIRS = { up: 1, down: 1, left: 1, right: 1 };
  /* kind の在庫。⚠ **未知の kind は落とさない**。fixSlot の未知の敵キー / fixPainting の未知テーマと
   *   まったく同じ判断で、ゲーム側に種類が増えたとき古いデータが黙って壊れるのが最悪。
   *   「在庫に無い」ことは lint の graph-kind-role が知らせるだけにする。 */
  var GRAPH_KINDS = { start: 1, combat: 1, search: 1, loot: 1, rest: 1, event: 1, boss: 1 };

  /* graphInfo(src) -> { present, graph, reason }
   *   present … graph が「指定されている」か (未指定なら present:false / graph:null / reason:null)
   *   graph   … 正規化して clone した run | null
   *   reason  … 解釈できなかった理由の日本語 (present && !graph のときだけ非 null)
   *
   * ⚠⚠ **expandTilesInfo とまったく同じ流儀**。「未指定」と「壊れている」を厳密に区別する。
   *   expandTiles のように両方 null を返す関数は作らない: 呼び出し側が単純に書けるのと
   *   引き換えに **silent fail-open** (壊れた分岐を黙って無視して単一マップへ落ちる) が
   *   復活するため。判断が要る場所は必ずこの 3 つ組を見ること。
   *
   * ⚠ 引数は「グラフそのもの」。mapDef を渡してはいけない (validate の注記を参照)。
   *   null / undefined **だけ**が未指定 = fail-closed (文字列や数値は「壊れている」)。
   *
   * ★正規化して clone を返す理由: ランタイムが exits を書き換えても sessionStorage の
   *   ペイロードが汚れない + 欠けた dir/hint を毎回その場で埋める分岐を書かずに済む。 */
  function graphInfo(src) {
    if (src === null || src === undefined) return { present: false, graph: null, reason: null };
    function bad(reason) { return { present: true, graph: null, reason: reason }; }
    if (typeof src !== "object" || Array.isArray(src)) return bad("graph がオブジェクトではありません");
    if (!Array.isArray(src.nodes) || src.nodes.length === 0) return bad("nodes が空です");

    var i, j, ids = {}, n;
    for (i = 0; i < src.nodes.length; i++) {
      n = src.nodes[i];
      if (!n || typeof n !== "object" || Array.isArray(n)) return bad("nodes[" + i + "] がオブジェクトではありません");
      if (typeof n.id !== "string" || !n.id) return bad("nodes[" + i + "] に id (非空の文字列) がありません");
      if (ids[n.id] !== undefined) return bad('ノード id "' + n.id + '" が重複しています');
      ids[n.id] = i;
    }
    if (typeof src.entry !== "string" || !src.entry) return bad("entry (非空の文字列) がありません");
    if (ids[src.entry] === undefined) return bad('entry "' + src.entry + '" が nodes に存在しません');

    var out = { entry: src.entry, nodes: [] };
    for (i = 0; i < src.nodes.length; i++) {
      n = src.nodes[i];
      var raw = Array.isArray(n.exits) ? n.exits : [], exits = [], seenTo = {};
      for (j = 0; j < raw.length; j++) {
        var e = raw[j], where = 'ノード "' + n.id + '" の exits[' + j + ']';
        if (!e || typeof e !== "object" || Array.isArray(e)) return bad(where + " がオブジェクトではありません");
        if (typeof e.to !== "string" || !e.to) return bad(where + " に to がありません");
        if (ids[e.to] === undefined) return bad(where + ' の to "' + e.to + '" が nodes に存在しません');
        if (e.to === n.id) return bad(where + " が自分自身を指しています (自己ループ)");
        if (seenTo[e.to]) return bad(where + ' が "' + e.to + '" への 2 本目の出口です (多重辺)');
        seenTo[e.to] = 1;
        if (!Array.isArray(e.at) || e.at.length < 2 || !isNum(e.at[0]) || !isNum(e.at[1]))
          return bad(where + " の at が [tx, ty] ではありません");
        exits.push({
          to: e.to,
          dir: GRAPH_DIRS[e.dir] ? e.dir : null,          // 未指定/未知は null = 幾何から導出させる
          at: [Math.round(e.at[0]), Math.round(e.at[1])],
          hint: (e.hint && typeof e.hint === "object" && !Array.isArray(e.hint)) ? clone(e.hint) : null,
        });
      }
      out.nodes.push({
        id: n.id,
        kind: (typeof n.kind === "string" && n.kind) ? n.kind : "combat",
        /* ⚠ mapDef は**ここで sanitize しない**。sanitize は「df-map/1 として整える」責務で、
         *   validate を通さずに整えると壊れた mapDef が黙って通る (resolve() が
         *   「validate は sanitize の前に掛ける」としているのと同じ理由)。ランタイムは
         *   このまま DFMapDef.resolve({mapDef: …}) へ渡し、既存の検査経路を再利用する。 */
        mapDef: (n.mapDef && typeof n.mapDef === "object" && !Array.isArray(n.mapDef)) ? clone(n.mapDef) : null,
        exits: exits,
      });
    }
    return { present: true, graph: out, reason: null };
  }

  /* nodeIndexById(graph) -> { id -> index } */
  function nodeIndexById(graph) {
    var m = {};
    if (!graph || !Array.isArray(graph.nodes)) return m;
    for (var i = 0; i < graph.nodes.length; i++) m[graph.nodes[i].id] = i;
    return m;
  }

  /* parentOf(graph) -> { map, multi, reach, order, entryParents, edgeCount }
   *
   * ⚠ 計画書の表記は `parentOf(graph) -> { childId -> parentId }` だが、実装は
   *   **その map を .map に入れた包み**を返す。理由は「木の検査も兼ねる」という要求を
   *   1 回の走査で満たすため:
   *     ・素の map だけを返すと「親が 2 つある」を lint 側でもう一度数える羽目になり、
   *       **判定式が 2 本**になる (この repo が繰り返し禁じている壊れ方。boss-count を
   *       lintMapDef が validate から再利用しているのと同じ判断)。
   *   ランタイムの「引き返す」は `parentOf(g).map[childId]` で引く。
   *
   *   map          … childId -> parentId (親が複数なら nodes 順で最初の 1 つ = 決定論)
   *   multi        … [{ id, parents:[…] }] 親が 2 つ以上 = **木でない**
   *   entryParents … entry を指している親 (1 つでもあれば閉路 = 木でない)
   *   reach        … entry からの到達集合 { id:true }
   *   order        … 到達順 (BFS)。⚠ 「親が居る」と「到達できる」は別物 (孤立した輪は親を持つ)
   *   edgeCount    … 辺の総数 */
  function parentOf(graph) {
    var out = { map: {}, multi: [], reach: {}, order: [], entryParents: [], edgeCount: 0 };
    if (!graph || !Array.isArray(graph.nodes)) return out;
    var i, j, all = {}, id;
    for (i = 0; i < graph.nodes.length; i++) all[graph.nodes[i].id] = [];
    for (i = 0; i < graph.nodes.length; i++) {
      var n = graph.nodes[i];
      for (j = 0; j < n.exits.length; j++) {
        var to = n.exits[j].to;
        if (!all[to]) continue;                        // graphInfo を通っていれば起きない
        out.edgeCount++;
        if (all[to].indexOf(n.id) < 0) all[to].push(n.id);
      }
    }
    for (i = 0; i < graph.nodes.length; i++) {         // ⚠ for-in ではなく nodes 順 = 決定論
      id = graph.nodes[i].id;
      if (all[id].length >= 1) out.map[id] = all[id][0];
      if (all[id].length >= 2) out.multi.push({ id: id, parents: all[id].slice() });
    }
    out.entryParents = all[graph.entry] ? all[graph.entry].slice() : [];

    var idx = nodeIndexById(graph), q = [];
    if (idx[graph.entry] !== undefined) { out.reach[graph.entry] = true; q.push(graph.entry); }
    while (q.length) {
      var cur = q.shift();
      out.order.push(cur);
      var nd = graph.nodes[idx[cur]];
      for (j = 0; j < nd.exits.length; j++) {
        var t = nd.exits[j].to;
        if (!out.reach[t]) { out.reach[t] = true; q.push(t); }
      }
    }
    return out;
  }

  /* 出口の向きを**幾何から**導く。rect は [r1,c1,r2,c2]、at は [tx,ty]。
   * 部屋の中心から見て「横のずれの方が大きければ left/right、縦なら up/down」。 */
  function dirFromGeometry(rect, at) {
    var midR = (rect[0] + rect[2]) / 2, midC = (rect[1] + rect[3]) / 2;
    var dx = at[0] - midC, dy = at[1] - midR;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "down" : "up";
  }

  /* lintRun(run) -> { ok, errors, warnings }
   *
   * ⚠ **lintMapDef と同じ器**にする (計画書「lintMapDef と同じ器に足す」)。issue の形は
   *   lintIssue と共通の { code, severity, message, at, roomIndex } + **nodeId** の 1 本だけ。
   *   計画書の速記 `[{code, level, msg}]` に合わせて 2 つ目の形を発明すると、ドライバも
   *   エディタも「どちらの形か」で分岐する羽目になり、必ず片方が腐る。
   *
   * codes:
   *   error   graph-bad / graph-not-tree / graph-unreachable-node / graph-no-boss /
   *           graph-gate-not-floor / graph-entry-start
   *   warning graph-dir-mismatch / graph-dead-end-empty / graph-kind-role /
   *           graph-painting-aspect (★P5 前段) /
   *           graph-painting-gate-broken (★卓上グリッド P3 追補)
   *
   * ⚠ **graph が未指定なら何も言わない** (errors:[] / warnings:[])。既存 6 シナリオは
   *   graph を持たないので、この装置は 1 件も発火しない = 装置が信用を失わない。 */
  function runIssue(code, severity, message, nodeId, at) {
    var it = lintIssue(code, severity, message, at, null);
    it.nodeId = (typeof nodeId === "string" && nodeId) ? nodeId : null;
    return it;
  }
  function lintRun(run) {
    var errors = [], warnings = [], i, j;
    function err(code, msg, nodeId, at) { errors.push(runIssue(code, "error", msg, nodeId, at)); }
    function warn(code, msg, nodeId, at) { warnings.push(runIssue(code, "warning", msg, nodeId, at)); }
    function done() { return { ok: errors.length === 0, errors: errors, warnings: warnings }; }

    var gi = graphInfo(run);
    if (!gi.present) return done();                    // 未指定 = 分岐なし。正常
    if (!gi.graph) { err("graph-bad", "分岐グラフを解釈できません: " + gi.reason, null, null); return done(); }

    var g = gi.graph, po = parentOf(g), idx = nodeIndexById(g);

    // ── ① 木であること (親が 2 つ以上 / entry に戻る辺 / 辺数) ──────────────────
    //   ★「枝は合流しない」がユーザー決定の骨格。合流すると「引き返す」の行き先が
    //     一意に決まらず、ランタイムの自動生成 (parentOf) が嘘をつく。
    for (i = 0; i < po.multi.length; i++)
      err("graph-not-tree",
          'ノード "' + po.multi[i].id + '" に親が ' + po.multi[i].parents.length + ' つあります (' +
          po.multi[i].parents.join(" / ") + ") — 分岐は**行き止まりありの木**なので枝は合流できません。" +
          "「引き返す」の行き先が一意に決まらず、ランタイムが自動生成する親への出口が嘘になります",
          po.multi[i].id, null);
    if (po.entryParents.length)
      err("graph-not-tree",
          'entry ノード "' + g.entry + '" を指している出口があります (' + po.entryParents.join(" / ") +
          ") — 閉路があると木ではありません", g.entry, null);

    // ── ② 到達可能性 ────────────────────────────────────────────────────────
    for (i = 0; i < g.nodes.length; i++) {
      if (po.reach[g.nodes[i].id]) continue;
      err("graph-unreachable-node",
          'ノード "' + g.nodes[i].id + '" が entry "' + g.entry + '" から到達できません — ' +
          "このノードの中身 (敵・宝箱・イベント) には一生たどり着けません",
          g.nodes[i].id, null);
    }

    // ── ③ boss ノードが到達集合の中にあること ────────────────────────────────
    //   ★クリア条件 objective.kind:"defeatBoss" の唯一の終着点。到達できないと**永久にクリアしない**。
    var bossIds = [];
    for (i = 0; i < g.nodes.length; i++) if (g.nodes[i].kind === "boss") bossIds.push(g.nodes[i].id);
    if (!bossIds.length)
      err("graph-no-boss", 'kind:"boss" のノードが 1 つもありません — ' +
          "ボス撃破でクリアする進行なので、この潜行は永久に終わりません", null, null);
    else {
      var reachedBoss = false;
      for (i = 0; i < bossIds.length; i++) if (po.reach[bossIds[i]]) reachedBoss = true;
      if (!reachedBoss)
        err("graph-no-boss", 'kind:"boss" のノード (' + bossIds.join(" / ") +
            ") が entry から到達できません — ボスに会えないので永久にクリアしません", bossIds[0], null);
    }

    // ── ④ ノードごとの幾何検査 ───────────────────────────────────────────────
    for (i = 0; i < g.nodes.length; i++) {
      var node = g.nodes[i];
      var d = sanitize(node.mapDef || DEFAULT_DUNGEON, DEFAULT_DUNGEON);
      var map = buildMapData(d), W = d.grid.w, H = d.grid.h, rooms = d.rooms;

      /* ★entry の起点だけは「部屋の中にあるか」を見る。他のノードは来た方向の反対側の縁へ
       *   置かれる (start は使われない) ので、ここで見ても嘘になる。 */
      if (node.id === g.entry) {
        var inRoom = false;
        for (j = 0; j < rooms.length; j++) {
          var rr = rooms[j].rect;
          if (d.start.ty >= rr[0] && d.start.ty <= rr[2] && d.start.tx >= rr[1] && d.start.tx <= rr[3]) inRoom = true;
        }
        if (!inRoom)
          err("graph-entry-start",
              'entry ノード "' + node.id + '" の起点 (tx' + d.start.tx + ", ty" + d.start.ty +
              ") がどの部屋の中にもありません — パーティが部屋の外 (廊下や岩盤の際) から始まり、" +
              "1 枚絵の外・visitedRooms の外に立つことになります",
              node.id, [d.start.tx, d.start.ty]);
      }

      for (j = 0; j < node.exits.length; j++) {
        var ex = node.exits[j], tx = ex.at[0], ty = ex.at[1];
        var outside = (tx < 0 || tx >= W || ty < 0 || ty >= H);
        if (outside || map[ty][tx] === T_WALL) {
          err("graph-gate-not-floor",
              'ノード "' + node.id + '" の "' + ex.to + '" への出口 (tx' + tx + ", ty" + ty + ") が" +
              (outside ? "マップの外にあります" : "壁/岩盤 (値2) の上にあります") +
              " — heroAI がそこへ歩けず、到達検出が永久に発火しないので分岐が詰みます",
              node.id, ex.at);
          continue;                                    // 壁なら向きの検査は無意味
        }
        // dir を明示したときだけ、幾何と食い違わないかを見る (warning)
        //   ★矢印の向きと実際の移動方向がズレる事故を構造的に潰すための装置。
        if (!ex.dir) continue;
        var host = null;
        for (var k = 0; k < rooms.length; k++) {
          var q = rooms[k].rect;
          if (ty >= q[0] && ty <= q[2] && tx >= q[1] && tx <= q[3]) { host = q; break; }
        }
        if (!host) continue;                           // 部屋の外の出口は基準が無いので黙る
        var geo = dirFromGeometry(host, ex.at);
        if (geo !== ex.dir)
          warn("graph-dir-mismatch",
               'ノード "' + node.id + '" の "' + ex.to + '" への出口は dir:"' + ex.dir +
               '" と書かれていますが、部屋の中心から見た幾何は "' + geo + '" です (tx' + tx + ", ty" + ty +
               ") — 矢印の向きと実際に歩く方向が食い違って見えます", node.id, ex.at);
      }

      /* ⑤ 行き止まりなのに中身が無い (warning)。kind:"search" の行き止まり = 完全な無駄足。
       *   ⚠ error にしない: 「外れを引いたら引き返す」は企画の骨格で、無駄足そのものは仕様。
       *     ここが言うのは「**探索する物が何も無い**探索ノード」という設計ミスだけ。 */
      if (node.exits.length === 0 && node.kind === "search")
        warn("graph-dead-end-empty",
             'ノード "' + node.id + '" は kind:"search" の行き止まりです — 探索の当たりも外れも' +
             "無いまま引き返すだけになります (loot / event / rest のどれかにするか、出口を足してください)",
             node.id, null);

      /* ⑥ kind と mapDef の役割の食い違い (warning)。
       * ⚠ role:"boss" の部屋は validate が**全 mapDef にちょうど 1 つ**要求するので、
       *   role の有無では区別できない。区別できる唯一の実体は **bossSlot** (= ボスが湧くか)。
       *   計画書の「kind:"boss" と role:"boss" の不一致」はこの意味に解釈した。 */
      var hasBossSlot = false;
      for (j = 0; j < rooms.length; j++) if (rooms[j].bossSlot) hasBossSlot = true;
      if (node.kind === "boss" && !hasBossSlot)
        warn("graph-kind-role",
             'ノード "' + node.id + '" は kind:"boss" ですが、mapDef にボススロットがありません — ' +
             "ボスが湧かないので、このノードを片付けてもクリア条件 (ボス撃破) が満たされません",
             node.id, null);
      if (node.kind !== "boss" && hasBossSlot)
        warn("graph-kind-role",
             'ノード "' + node.id + '" は kind:"' + node.kind + '" ですが、mapDef にボススロットがあります — ' +
             "道中のノードにボスが湧きます (kind を boss にするか、bossSlot を外してください)",
             node.id, null);
      if (!GRAPH_KINDS[node.kind])
        warn("graph-kind-role",
             'ノード "' + node.id + '" の kind "' + node.kind + '" は在庫にありません (' +
             Object.keys(GRAPH_KINDS).join(" / ") + ") — ゲーム側は既定の中身で扱います",
             node.id, null);

      /* ⑦ ★[P5 前段 2026-08-07] ノードの部屋に 1枚絵を指定したが、在庫の縦横比に合わない
       *   (**warning**)。ノードの部屋は可視域サイズ (7x6 / 9x6) へ縮めたので、20x16(5:4) /
       *   22x18(11:9) の在庫 12 枚は**もう載らない**。それ自体は仕様 (絵の無いノードはタイル
       *   描画で成立させる = 6 シナリオ中 4 つの元の姿) だが、
       *   **「指定したのに歪んで貼られる」が無言で起きるのが最悪**なので必ず知らせる。
       * ⚠⚠ lintRun は lintMapDef を呼ばない (責務が別) ので、ここに書かないとノードの
       *   1枚絵は**どの検査装置にも一度も掛からない**。
       * ⚠ 判定式は lintMapDef と共有 (paintingAspectFits)。写して 2 本目を作らないこと。
       * ⚠ **map-used (黒帯) は意図的に写していない**。ノードの部屋は「可視域より小さく作り、
       *   カメラのクランプが画面中央へ固定する」のが設計なので、使用範囲が狭いのは正常。
       *   ここへ写すと全ノードで常時警告が出て、装置全体が信用を失う。 */
      for (j = 0; j < rooms.length; j++) {
        if (!rooms[j].painting) continue;
        var prc = rooms[j].rect;
        if (paintingAspectFits(prc, rooms[j].painting)) continue;
        warn("graph-painting-aspect",
             'ノード "' + node.id + '" の部屋 ' + rooms[j].id + " は 幅" + (prc[3] - prc[1] + 1) +
             "×高さ" + (prc[2] - prc[0] + 1) + " タイルですが、" +
             paintingAspectWanted(rooms[j].painting) + " で縦横比が一致しません — " +
             "5引数 drawImage で引き伸ばされて歪みます。ノードの部屋は可視域サイズ (7×6 / 9×6) なので、" +
             "旧単一マップ用の在庫 (20×16 / 22×18) は載りません " +
             "(painting を外してタイル描画にするか、ノード用の絵 n4 / n7 を指定してください)",
             node.id, [prc[1], prc[0]]);
      }

      /* ⑧ ★[卓上グリッド P3 追補] ノードの絵が持つ出入口 gates が壊れている (**warning**)。
       * ⚠⚠ ⑦ と**まったく同じ理由でここに要る** — lintRun は lintMapDef を呼ばないので、
       *   lintMapDef 側の painting-gate-broken だけでは**分岐マップのノードは一度も検査に
       *   掛からない**。実際 2026-08-18 に、絵の gates を絵の外の座標へ壊す変異
       *   (driver_grid_p3b の gatebroken) で lintMapDef 側の警告が 1 件も出ず、
       *   「黙って辺の中点へ落ちる」状態を検出できなかった。
       * ⚠ code は graph- 接頭辞 (graph-painting-aspect と同じ流儀)。lintMapDef 側は
       *   painting-gate-broken のまま = どちらの検査装置が言ったのかが code で分かる。 */
      for (j = 0; j < rooms.length; j++) {
        if (!rooms[j].painting) continue;
        var gpm = paintingGatesFor(rooms[j].painting.theme, rooms[j].painting.key);
        if (!gpm.error) continue;
        var grc2 = rooms[j].rect;
        warn("graph-painting-gate-broken",
             'ノード "' + node.id + '" の部屋 ' + rooms[j].id + " の1枚絵が持つ出入口 gates が" +
             "壊れています: " + gpm.error +
             " — 指定は丸ごと捨てられ、出口・扉・矢印が絵に描かれた口ではなく部屋の辺の中点に立ちます",
             node.id, [grc2[1], grc2[0]]);
      }
    }

    return done();
  }

  global.DFMapDef = {
    SCHEMA: SCHEMA,
    GRID_W: GRID_W, GRID_H: GRID_H, GRID_TILE: GRID_TILE,
    T_FLOOR: T_FLOOR, T_RARE: T_RARE, T_WALL: T_WALL,
    BAND_TOP_ROW: BAND_TOP_ROW, BAND_BOTTOM_ROW: BAND_BOTTOM_ROW,
    THEMES: THEMES,
    DEFAULT_DUNGEON: DEFAULT_DUNGEON,
    DEFAULT_FIELD: DEFAULT_FIELD,
    clone: clone,
    sanitize: sanitize,
    validate: validate,
    /* ── 幾何の生成 ★Phase 3 項目2 で tiles 対応済み ────────────────────────────
     *   buildMapData(mapDef) … tiles があればそれを返す (= 唯一の幾何)。無ければ従来どおり
     *                          rooms/corridors から矩形生成し、最後に flags.bandMask を掛ける。
     *                          ⚠ tiles があるとき **bandMask は適用されない**
     *                          ⚠ tiles があるのに展開できないときだけ console.warn を 1 行出す
     *                             (未指定では出さない = 「常に警告」と区別できる)
     *   mapUsed(mapDef)      … tiles があれば **壁(2)以外の外接矩形**、無ければ rooms+corridors
     *                          の外接矩形。⚠⚠ ここを tiles 対応にし忘れると、部屋の外に描いた
     *                          床がカメラのクランプ外になり**画面が黒帯**になる (隠れた本丸)。
     *                          ⚠ 展開できない tiles でもここは警告しない (render から毎フレーム
     *                             呼ばれるため。通知は buildMapData と validate が担当する) */
    buildMapData: buildMapData,
    mapUsed: mapUsed,

    /* ── Phase 3 項目1: 自由タイル (tiles) の RLE ────────────────────────────────
     *   encodeTiles(map2d)       … 2次元配列 → { enc:"rle", data:"…" } | null (**行優先**)
     *                              null = 2次元配列でない / 行の長さが不揃い / 値が 0,1,2 以外
     *   expandTiles(mapDef)      … mapDef.tiles → 2次元配列 map[row][col] | null
     *                              ⚠ null は「未指定」と「不正」の**両方**で返る
     *   expandTilesInfo(mapDef)  … { present, map, reason } ← ★**区別が要るときは必ずこちら**
     *   hasTiles(mapDef)         … tiles が指定されているか (null/undefined だけが未指定)
     *   TILES_ENC                … "rle"
     *  ⚠⚠ 不正な tiles を黙って矩形生成へ落とすのは **silent fail-open** =「動くが別のマップ」。
     *    validate() は tiles が**あるのに展開できないときだけ** code:"tiles-bad" を積む
     *    (未指定はエラーにしない)。項目2 の buildMapData / mapUsed はこの区別に乗る。
     *  ⚠ 幅・高さの出所は **mapDef.grid.w / grid.h** の 1 箇所。tiles 側に持たせない。 */
    TILES_ENC: TILES_ENC,
    encodeTiles: encodeTiles,
    expandTiles: expandTiles,
    expandTilesInfo: expandTilesInfo,
    hasTiles: hasTiles,

    /* ── ★P1: 扉 (doors) ────────────────────────────────────────────────────────
     *   DOOR_STATES        … "closed" / "open" / "locked" / "broken" / "hidden"
     *   DOOR_ORIENTATIONS  … "horizontal" / "vertical"
     *   doorBlocks(state)  … その状態がマスを塞ぐか = **唯一の正**。P3 で isTileWall が呼ぶ
     *  mapDef.doors = null | [{ id, tx, ty, orientation, state, requiredKey }]
     *  ⚠ null = 「扉が無い」。既定プリセット 2 種も既存 6 シナリオも null なので、
     *    この項目を足してもゲームの挙動は 1bit も変わらない (tiles / props と同じ進め方)。
     *  ⚠⚠ **行き先 (target) を扉に持たせていない**。出所は分岐グラフの exits ただ 1 つで、
     *    扉はタイルで同定する。理由は DOOR_STATES の節頭を参照 (二重の出所を作らない)。 */
    DOOR_STATES: DOOR_STATES,
    DOOR_ORIENTATIONS: DOOR_ORIENTATIONS,
    doorBlocks: doorBlocks,

    lintMapDef: lintMapDef,                 // ★項目5: 出発前 lint (純粋関数・副作用なし)
    LINT_PAINTING_ASPECTS: LINT_PAINTING_ASPECTS,

    /* ── ★P2: ゲームブック風 分岐マップ (run = 潜行 = グラフ全体) ────────────────
     *   graphInfo(graph)      … { present, graph, reason } ← ★**判断が要るときは必ずこれ**
     *                            (expandTilesInfo と同じ流儀。「未指定」と「壊れている」を厳密に区別)
     *   nodeIndexById(graph)  … { id -> index }
     *   parentOf(graph)       … { map:{child->parent}, multi, reach, order, entryParents, edgeCount }
     *                            ⚠ 「引き返す」は map から引く。木の検査もここが**唯一の出所**
     *   lintRun(run)          … { ok, errors, warnings }。lintMapDef と**同じ器**の issue
     *   dirFromGeometry(rect, at) … 出口の向きを幾何から導く (lint と本編で式を 2 本持たないため公開)
     *  ⚠⚠ 壊れた graph を黙って「分岐なし」へ落とすのは silent fail-open =「動くが別のゲーム」。
     *    validate() は graph が**あるのに解釈できないときだけ** code:"graph-bad" を積む
     *    (未指定はエラーにしない = 既定プリセットも既存 6 シナリオも赤くならない)。 */
    graphInfo: graphInfo,
    nodeIndexById: nodeIndexById,
    parentOf: parentOf,
    lintRun: lintRun,
    dirFromGeometry: dirFromGeometry,
    GRAPH_KINDS: GRAPH_KINDS,
    bossRoomIdx: bossRoomIdx,
    slotsOf: slotsOf,
    objectiveCount: objectiveCount,

    /* ── Phase 2: エディタの「▶ このマップで遊ぶ」用 ────────────────────────────
     *   spawnsFromMapDef(mapDef[, rnd]) … mapDef の敵/ボススロット → index.html の
     *        spawns 形式 [key, tx, ty]。種類固定はそのまま、おまかせは THEME_DEFAULT_ENEMIES
     *        から抽選、**未知キーはおまかせへ降格**。rnd を渡せば決定論にできる (ドライバ用)。
     *   isFieldThemeId(id)  … 屋外テーマか (resolve の排他判定と同じ出所)
     *   ⚠ spawnsFromMapDef は **map-editor 専用**。酒場は tier/系統を持つ buildSpawns を使う。 */
    THEME_DEFAULT_ENEMIES: THEME_DEFAULT_ENEMIES,
    spawnsFromMapDef: spawnsFromMapDef,
    isFieldThemeId: function (id) { return !!FIELD_THEME_IDS[id]; },

    /* ── Phase 1: index.html が幾何をここから受け取るための入口 ──────────────
     *   resolve(genScen, isFieldTheme, params)
     *        … 既定 mapDef の **clone**。Phase 1 は常に既定 (genScen.mapDef は読まない)。
     *          flags.bandMask を必ず持つ (既定 = isFieldTheme)。引数が全部 undefined でも落ちない
     *   excludedRoomIdx(mapDef)      … 罠 / 隠し宝箱 / 探索宝箱 の除外部屋 Set
     *                                  (rooms.length >= 3 ? {0, boss} : {boss})
     *   chestExcludedRoomIdx(mapDef) … 玄室宝箱 (spawnRoomChests) 専用の除外部屋 Set
     *                                  (常に {0, boss})
     *   ⚠⚠ 下の 2 つは**別物**。2 部屋ダンジョンで {1} と {0,1} に割れる。
     *      「重複だから片方消そう」は玄室宝箱 or 罠のどちらかを壊す。実装側の表を読むこと。 */
    resolve: resolve,
    excludedRoomIdx: excludedRoomIdx,
    chestExcludedRoomIdx: chestExcludedRoomIdx,

    /* ── ★P4: 除外集合の **kind 由来版** (分岐 RUN があるときだけ index.html が使う) ──
     *   excludedRoomIdxForKind(mapDef, kind)      … kind:"search" だけ空集合 (= 罠が湧く)
     *   chestExcludedRoomIdxForKind(mapDef, kind) … kind:"loot"   だけ空集合 (= 玄室宝箱が湧く)
     *   それ以外の kind と未知の kind は **全部屋を除外** (fail-closed)。
     *  ⚠ 上の 2 つ (部屋 index からの推測) と**併存**させる。統合すると既存 6 シナリオが変わる。
     *  ⚠ 「湧かせない」= 全部屋を入れる。bossRoomIdx だけを入れる部分集合にしてはいけない
     *    (道中ノードの隅に罠が湧き「search が唯一のノード種」という約束が崩れる)。 */
    excludedRoomIdxForKind: excludedRoomIdxForKind,
    chestExcludedRoomIdxForKind: chestExcludedRoomIdxForKind,

    /* ── 敵カタログ (Phase 0.5 項目1) ★項目2 のパレット / 項目3 の描画はここに乗る ──
     *   loadEnemyCatalog([url])  … Promise<{ ok, count, error, url }>。**必ず resolve** する。
     *                              二重呼び出しは同じ Promise を返す (fetch は 1 回だけ)
     *   getEnemyCatalog()        … { key: def, … } | null (null = 未取得)。caravanWagon は除外済み
     *   getEnemyCatalogError()   … 直近の失敗理由の文字列 | null
     *   setEnemyCatalog(cat)     … 差し替え / null でクリア (次回 load は再実行される)
     *   parseEnemyCatalog(text)  … index.html のテキストから抽出 (**失敗は throw**。純粋)
     *   enemyDef(key) / isKnownEnemyKey(key)
     *   normEnemyKey(v)          … 防御的正規化。非文字列/空/記号だけ → null
     *   enemyKindOf(slot)        … [tx,ty,"goblin"] → "goblin" / [tx,ty] → null
     *   groupIdOfEnemy(key)      … 系統グループ id。★未分類は必ず "other"
     *   groupEnemyCatalog([cat]) … [{ id, label, keys[] }, …] (パレットの並び順そのもの)
     *   ENEMY_GROUPS / ENEMY_NON_COMBAT / ENEMY_REQUIRED_FIELDS / ENEMY_CATALOG_URL */
    ENEMY_CATALOG_URL: ENEMY_CATALOG_URL,
    ENEMY_GROUPS: ENEMY_GROUPS,
    ENEMY_NON_COMBAT: ENEMY_NON_COMBAT,
    ENEMY_REQUIRED_FIELDS: ENEMY_REQUIRED_FIELDS,
    ENEMY_KEY_MAX: ENEMY_KEY_MAX,
    normEnemyKey: normEnemyKey,
    enemyKindOf: enemyKindOf,
    groupIdOfEnemy: groupIdOfEnemy,
    groupEnemyCatalog: groupEnemyCatalog,
    parseEnemyCatalog: parseEnemyCatalog,
    loadEnemyCatalog: loadEnemyCatalog,
    getEnemyCatalog: getEnemyCatalog,
    getEnemyCatalogError: getEnemyCatalogError,
    setEnemyCatalog: setEnemyCatalog,
    enemyDef: enemyDef,
    isKnownEnemyKey: isKnownEnemyKey,

    /* ── テクスチャカタログ (2026-08-03) — エディタの「本編の見た目」表示 ────────
     *   loadTextureCatalog([url]) … index.html の SCENARIO_TEX を実行時に読む。
     *                               戻り Promise は必ず resolve ({ok,count,error,url,ceiling})
     *   texSetFor(themeId)        … { floor, wall, floorScale? } | null
     *                               ★未登録テーマは "goblin-mine" へ落ちる (index.html:2976 と同式)
     *   getCeilingSprite()        … 壁セルの天井スプライト [sx,sy,sw,sh] | null
     *  ⚠⚠ **エディタ側にテクスチャ表を写経しないこと**。写経した瞬間に
     *    「エディタでは正しいのに本編では違う絵」が発生しうる = この機能の存在意義が壊れる。 */
    TEX_CATALOG_URL: TEX_CATALOG_URL,
    TEX_CATALOG_MARK: TEX_CATALOG_MARK,
    TEX_FALLBACK_ID: TEX_FALLBACK_ID,
    parseTextureCatalog: parseTextureCatalog,
    parseCeilingSprite: parseCeilingSprite,
    loadTextureCatalog: loadTextureCatalog,
    getTextureCatalog: getTextureCatalog,
    getTextureCatalogError: getTextureCatalogError,
    getCeilingSprite: getCeilingSprite,
    texSetFor: texSetFor,
    setTextureCatalog: setTextureCatalog,

    /* ── 1枚絵カタログ / 情景カタログ (Phase 4 項目1) ────────────────────────
     *   loadPaintingCatalog([url]) … index.html の ROOM_PAINTINGS_DEF を実行時に読む。
     *                                戻り Promise は必ず resolve ({ok,count,error,url})
     *   paintingEntries()          … [{ theme, key, src, tw, th, label }, …] (未取得なら [])
     *                                ★tw/th は tileBounds から算出。UI (項目3) と lint (項目2) が使う
     *   paintingSrcFor(theme, key) … "assets/room_xxx_1_bs.jpg" | null
     *                                ⚠⚠ 引けなければ **null**。texSetFor と違い既定テーマへ
     *                                   落とさない (絵は「無い」が正しい状態)
     *   loadSceneryCatalog([url])  … SCENERY_SHEETS + SCENERY_RECIPES を **1 fetch で両方**読む
     *   sceneryRecipeFor(themeId)  … { counts:{kind:n}, area:n } | null
     *                                ★レシピが無いテーマは 屋外→caravan-road / 他→goblin-mine。
     *                                  この式は**ここ 1 箇所**。本編 (項目4) も同じ関数を使う
     *   sceneryKinds()             … SCENERY_SHEETS のキー (未取得なら [])
     *  ⚠⚠ **エディタ側に絵の表 / 情景レシピを写経しないこと**。写経した瞬間に
     *    「エディタでは正しいのに本編では違う絵」が発生しうる = この機能の存在意義が壊れる。
     *  ⚠ 敵カタログ / テクスチャカタログとは fetch も promise も共有しない
     *    (setXxxCatalog(null) → 再取得 の契約が壊れるため)。 */
    PAINTING_CATALOG_URL: PAINTING_CATALOG_URL,
    PAINTING_CATALOG_MARK: PAINTING_CATALOG_MARK,
    PAINTING_KEY_LABELS: PAINTING_KEY_LABELS,
    SCENERY_CATALOG_URL: SCENERY_CATALOG_URL,
    SCENERY_RECIPE_MARK: SCENERY_RECIPE_MARK,
    SCENERY_SHEET_MARK: SCENERY_SHEET_MARK,
    SCENERY_FALLBACK_FIELD: SCENERY_FALLBACK_FIELD,
    SCENERY_FALLBACK_DUNGEON: SCENERY_FALLBACK_DUNGEON,
    // ★Phase 4 項目2: rooms[i].scenery.density の上限 (sanitize が 0 < d <= これ で採る)。
    //   項目3 の UI と項目5 のドライバが同じ値を参照できるよう公開する。
    SCENERY_DENSITY_MAX: SCENERY_DENSITY_MAX,
    parsePaintingCatalog: parsePaintingCatalog,
    parseSceneryCatalog: parseSceneryCatalog,
    loadPaintingCatalog: loadPaintingCatalog,
    loadSceneryCatalog: loadSceneryCatalog,
    getPaintingCatalog: getPaintingCatalog,
    getPaintingCatalogError: getPaintingCatalogError,
    setPaintingCatalog: setPaintingCatalog,
    getSceneryRecipes: getSceneryRecipes,
    getScenerySheets: getScenerySheets,
    getSceneryCatalogError: getSceneryCatalogError,
    setSceneryCatalog: setSceneryCatalog,
    paintingEntries: paintingEntries,
    paintingSrcFor: paintingSrcFor,
    /* ★P7: 絵が覆う想定のタイル矩形 [r1,c1,r2,c2] | null。lint の縦横比判定
     *   (paintingAspectFits) が「指定したその絵」と比べるために使う唯一の出所。 */
    paintingBoundsFor: paintingBoundsFor,
    /* ★P7: 縦横比の判定そのもの。lintMapDef / lintRun と**同じ 1 本**を検証ドライバからも
     *   直接叩けるようにした (lint 越しの結果と食い違わないことを driver_graph_p7 (2e) が測る)。 */
    paintingAspectFits: paintingAspectFits,
    /* ── ★[卓上グリッド P2] 1 枚絵に描かれた障害物の当たり判定 ──────────────────
     *   PAINTING_BLOCK_CHAR                     … "#" (綴りの唯一の正)
     *   paintingBlockedRows(entry)              … { rows, error }。**採否と不正理由を 1 本で返す**
     *   paintingBlockedFor(theme, key)          … 同上をカタログ経由で
     *   paintingBlockedTilesFor(rows,rect,W,H)  … 絵のマスク × 貼り先 rect → タイル index 配列
     *                                             ★本編の obstacleTileMask と lint が**この 1 本**を共有
     *   paintingBlockedTiles(mapDef)            … mapDef 経路 (rooms[i].painting) ぶんだけ
     *  ⚠⚠ 本編 (index.html) は roomPaintings を舐めて paintingBlockedTilesFor を直に呼ぶ。
     *    既定 6 シナリオは **絵側の tileBounds** へ貼るため paintingBlockedTiles(mapDef) には
     *    出てこない — この非対称を忘れて lint 側だけで数えると「本編では塞がるのに
     *    エディタは 0 と言う」になる。 */
    PAINTING_BLOCK_CHAR: PAINTING_BLOCK_CHAR,
    paintingBlockedRows: paintingBlockedRows,
    paintingBlockedFor: paintingBlockedFor,
    paintingBlockedTilesFor: paintingBlockedTilesFor,
    paintingBlockedTiles: paintingBlockedTiles,

    /* ── ★[卓上グリッド P3 追補] 絵に描かれた出入口 / 屋外フラグ ──────────────
     *   paintingGates(entry) / paintingGatesFor(theme,key) … { gates, tw, th, error }
     *   paintingGateTileFor(m, dir, rect, W, H)            … { tx, ty, face } | null
     *   paintingOutdoor(entry) / paintingOutdoorFor(t,k)   … その絵は空の下か
     *  ⚠ blocked とまったく同じ非対称がある: 本編は roomPaintings 経由でも引くが、lint が
     *    見るのは mapDef 経路 (rooms[i].painting) だけ。 */
    PAINTING_GATE_DIRS: PAINTING_GATE_DIRS,
    paintingGates: paintingGates,
    paintingGatesFor: paintingGatesFor,
    paintingGateTileFor: paintingGateTileFor,
    paintingOutdoor: paintingOutdoor,
    paintingOutdoorFor: paintingOutdoorFor,
    sceneryRecipeFor: sceneryRecipeFor,
    sceneryKinds: sceneryKinds,

    /* ── ★Phase 6: 情景物の個別配置 (mapDef.props) ────────────────────────────
     *   ⭐ 縮尺の物差し — ユーザーが最優先に挙げた「キャラとスケールが合っている」の基準。
     *   CHAR_INK_H_PX(57) / CHAR_H_CM(170) / CM_PER_PX(≒2.982)
     *   pxToCm(px) / cmToPx(cm) / cmLabel(cm) … px ⇄ 実寸 の唯一の換算
     *
     *   propEntries()                … 置ける物の平坦なカタログ (未取得なら [])
     *                                  [{kind,variant,label,src,frame,dw,dh,wcm,hcm,
     *                                    sizeLabel,blocking,tw,th}, …]
     *   propDrawSize(kind, variant)  … {dw,dh} | null ★式は index.html:5686 の描画と同一
     *   propFootprint(kind, variant) … {tw,th} ★描画サイズから**導出**する (別入力にしない)
     *   propBlocking(kind, variant)  … 通行不能か (カタログの blocking[variant] が唯一の正)
     *   propBlockedTiles(mapDef)     … 塞ぐタイルの index 配列。本編の obstacleTileMask と
     *                                  lint の flood fill が**この 1 本**を共有する
     *  ⚠⚠ ここでも写経しないこと。SCENERY_FRAMES / SCENERY_SHEETS は index.html から
     *    実行時に読む (loadSceneryCatalog が 1 fetch で 3 マーカーとも読む)。 */
    CHAR_INK_H_PX: CHAR_INK_H_PX,
    CHAR_H_CM: CHAR_H_CM,
    CM_PER_PX: CM_PER_PX,
    SCENERY_FRAME_MARK: SCENERY_FRAME_MARK,
    PROP_KIND_LABELS: PROP_KIND_LABELS,
    pxToCm: pxToCm,
    cmToPx: cmToPx,
    cmLabel: cmLabel,
    getSceneryFrames: getSceneryFrames,
    propKindLabel: propKindLabel,
    propEntries: propEntries,
    propDrawSize: propDrawSize,
    propFootprint: propFootprint,
    propBlocking: propBlocking,
    propBlockedTiles: propBlockedTiles,

    /* ── ★STEP 2.5 / 3: つながる情景物 (接続キット) の自動接続 ─────────────────
     * ▼汎用版 (種を kind で受ける。★新しいコードはこちらを使う)
     *   CONNECT_KIT_KINDS     … つながる種の配列 = **唯一の正**。種を足すならここに 1 行
     *   isConnectKit(kind)                        … その種がつながるか (真偽)
     *   connectKitVariantForMask(mask)            … mask → variant | **null (孤立=変更しない)**
     *   connectKitMaskAt(props, tx, ty, kind)     … 上下左右の**同種**だけ → mask
     *   connectKitRelinkAt(props, tx, ty, kind)   … そのタイルの同種を選び直す → 変更数
     *   connectKitRelinkAround(props,tx,ty,kind)  … ★自分 + 4 近傍。エディタが呼ぶのはこれ 1 本
     * ▼種キー (綴りの唯一の正。index.html の SCENERY_SHEETS と同じ)
     *   RAIL_KIT_KIND  … "railKit" (線路)  /  WATER_KIT_KIND … "waterKit" (水の流れ)
     * ▼railKit 固定の別名 (既存の呼び口のために残す薄いラッパ。中身は上と同一)
     *   RAIL_VARIANT_MASKS    … variant → 接続辺のマスク [5,10,3,6,12,9]
     *                           (N=1 / E=2 / S=4 / W=8)。★全キット共通の並び
     *   railVariantForMask / railKitMaskAt / railKitRelinkAt / railKitRelinkAround
     *  ⚠⚠ importJSON / プリセット / 矩形に戻す では**呼ばない**こと (往復同一性が壊れる)。 */
    CONNECT_KIT_KINDS: CONNECT_KIT_KINDS,
    isConnectKit: isConnectKit,
    connectKitVariantForMask: connectKitVariantForMask,
    connectKitMaskAt: connectKitMaskAt,
    connectKitRelinkAt: connectKitRelinkAt,
    connectKitRelinkAround: connectKitRelinkAround,
    RAIL_KIT_KIND: RAIL_KIT_KIND,
    WATER_KIT_KIND: WATER_KIT_KIND,
    RAIL_VARIANT_MASKS: RAIL_VARIANT_MASKS,
    railVariantForMask: railVariantForMask,
    railKitMaskAt: railKitMaskAt,
    railKitRelinkAt: railKitRelinkAt,
    railKitRelinkAround: railKitRelinkAround,
  };
})(window);
