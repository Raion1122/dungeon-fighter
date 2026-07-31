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
        painting: (r.painting && typeof r.painting === "object") ? clone(r.painting) : null,
        scenery: (r.scenery && typeof r.scenery === "object") ? clone(r.scenery) : null,
      });
    }

    var srcCorr = Array.isArray(d.corridors) ? d.corridors : base.corridors;
    for (var k = 0; k < srcCorr.length; k++) {
      var cr = fixRect(srcCorr[k]);
      if (cr) out.corridors.push(cr);
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
    return done();
  }

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
  function slotsOf(d) {
    // tavern.html の ROOM_SLOTS / BOSS_SLOT 相当を mapDef 1 箇所から取り出す。
    var rooms = (d && d.rooms) || [];
    var room = [], boss = null;
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      for (var j = 0; j < (r.enemySlots || []).length; j++) room.push(r.enemySlots[j].slice());
      if (r.bossSlot && !boss) boss = r.bossSlot.slice();
    }
    return { roomSlots: room, bossSlot: boss };
  }
  function objectiveCount(d) {
    if (d && d.objective && isNum(d.objective.count)) return d.objective.count;
    return ((d && d.rooms) ? d.rooms.length : 1) - 1;         // 既定: rooms.length - 1
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * Phase 1 — index.html が幾何をここ 1 箇所から受け取るための入口
   * ══════════════════════════════════════════════════════════════════════════
   * Phase 1 の契約は「**プレイの結果を 1bit も変えない**」。したがってこの節の関数は
   * すべて「現行 index.html の式と完全同値」であることが唯一の正しさの基準になる。
   * 綺麗な式に整えたくなっても、同値でなくなる整理は Phase 2 以降でユーザー判断のもと行う。
   * ────────────────────────────────────────────────────────────────────────── */

  /* resolve(genScen, isFieldTheme, params) -> mapDef
   *   isFieldTheme が真 → DEFAULT_FIELD、偽 → DEFAULT_DUNGEON の **clone** を返す。
   *
   *   ⚠ Phase 1 では **常に既定値**を返す。genScen.mapDef は**読まない**
   *     (シナリオ定義から mapDef を採用するのは Phase 2 の仕事)。
   *     引数 genScen / params を今から受け取っておくのは、Phase 2 で採用ロジックを足すときに
   *     index.html 側の呼び出し行を 1 行も書き換えずに済ませるため。配線を 2 度やると
   *     その間に「半分だけ直った状態」が生まれる = Phase 1 でいちばん避けたい状態。
   *
   *   ⚠ params は URLSearchParams | null | undefined。?mapdef=0 は撤退スイッチで、
   *     Phase 2 で「genScen.mapDef を無視して既定へ落とす」意味を持つ。Phase 1 は
   *     採用ロジックがそもそも無いので**どんな URL でも同じ既定**へ落ちる = 振る舞い不変。
   *     ここで params を引数に取っておくのが「撤退スイッチの口だけ先に開けておく」の実体。
   *
   *   ⚠ 戻り値は必ず clone。呼び出し側 (index.html) が返り値を壊しても
   *     DEFAULT_DUNGEON / DEFAULT_FIELD が汚染されない = 次のシナリオが別のマップにならない。
   *
   *   ⚠ flags.bandMask を必ず持たせる (既定 = isFieldTheme)。index.html:3323 の
   *     帯マスク判定がこれを読むので、欠けると屋外の幾何が丸ごと変わる。
   *
   *   引数がすべて undefined/null でも落ちないこと (読み込み順の事故で引数が揃わなくても
   *   幾何だけは必ず作れる = 画面が真っ黒にならない)。
   */
  function resolve(genScen, isFieldTheme, params) {
    var out = clone(isFieldTheme ? DEFAULT_FIELD : DEFAULT_DUNGEON);
    // 既定値は元々 bandMask を持っているが、ここで**明示的に保証**しておく
    // (DEFAULT_* を将来いじったときに index.html:3323 が undefined を読む事故を止める)。
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
   *          unreachable-slot / no-trap-candidates          … error
   *          no-enemies / no-boss-slot / painting-aspect / map-used / band-mask … warning
   * ────────────────────────────────────────────────────────────────────────── */

  // index.html:2987 FIELD_THEMES の写し。屋外テーマだけ罠の起点ガード条件が変わる (19055)。
  var FIELD_THEME_IDS = { "caravan-road": 1 };

  // 1枚絵の在庫。計画書 §「1枚絵のアスペクト比ロックへの対処」= 山場 20×16(5:4) / ボス 22×18(11:9)。
  // ⚠ **比率**で比べる (40×32 も 5:4 なので等倍拡大なら歪まない)。サイズ一致で比べない。
  var LINT_PAINTING_ASPECTS = [
    { w: 20, h: 16, label: "山場 20×16 (5:4)" },
    { w: 22, h: 18, label: "ボス 22×18 (11:9)" },
  ];
  // 「1枚絵を貼りうる部屋」とみなす最小面積。これ未満の小部屋は比率を問わない
  // (painting が明示指定されている部屋は面積に関係なく必ず検査する)。
  var LINT_PAINTING_MIN_AREA = 150;   // 15×10 相当
  var LINT_MAP_USED_MIN_ROWS = 6;     // 使用範囲がこれより薄いと画面上下が黒帯になりやすい
  var LINT_MAP_USED_MIN_FILL = 0.20;  // 使用範囲がグリッド全体のこの割合を切ると黒が目立つ

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
    if (!startOnWall) {
      var reach = reachableFrom(map, W, H, startTx, startTy);
      for (i = 0; i < rooms.length; i++) {
        var rect = rooms[i].rect, hit = false, walkable = 0;
        for (var r2 = rect[0]; r2 <= rect[2]; r2++) {
          for (var c2 = rect[1]; c2 <= rect[3]; c2++) {
            if (map[r2][c2] === T_WALL) continue;
            walkable++;
            if (reach[r2 * W + c2]) { hit = true; }
          }
        }
        if (hit) continue;
        err("unreachable-room",
            "部屋 " + rooms[i].id + " が起点 (tx" + startTx + ", ty" + startTy + ") から到達できません" +
            (walkable === 0 ? " — この部屋には歩けるタイルが 1 つもありません (帯マスクで潰れている可能性)"
                            : " — 廊下でつながっていません") +
            "。visitedRooms が埋まらず永久にクリアしません (index.html:14096)",
            [rect[1], rect[0]], i);
      }
      for (i = 0; i < points.length; i++) {
        var q2 = points[i];
        if (q2.kind === "start" || q2.wall) continue;   // 壁乗りは根本原因を既に報告済み
        if (reach[q2.tile[1] * W + q2.tile[0]]) continue;
        err("unreachable-slot",
            q2.label + " (tx" + q2.tile[0] + ", ty" + q2.tile[1] + ") が起点から到達できません" +
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

    // ── lint 項目⑤ 1枚絵の縦横比 (★エラーではなく**警告**) ────────────────────
    //  判断と理由: 現行プリセットの山場は 20×14 で 5:4 ではない。エラーにすると
    //  **既存の正しいプリセットが常時赤くなり lint 全体が信用されなくなる**。
    //  一方「無視 (painting 明示時のみ検査)」だと Phase 4 まで一度も発火せず装置として死ぬ。
    //  → 折衷: **1枚絵を貼りうる大きさ (面積 >= 150) の部屋は常に比率を見て警告**、
    //     painting が明示指定されている部屋は面積に関係なく検査する。
    //     警告なので「出発は止めない」= 卓用マップにも DF の既存プリセットにも邪魔をしない。
    for (i = 0; i < rooms.length; i++) {
      var rc = rooms[i].rect;
      var rw = rc[3] - rc[1] + 1, rh = rc[2] - rc[0] + 1;
      var explicit = !!rooms[i].painting;
      if (!explicit && rw * rh < LINT_PAINTING_MIN_AREA) continue;
      var fit = false, names = [];
      for (j = 0; j < LINT_PAINTING_ASPECTS.length; j++) {
        var A = LINT_PAINTING_ASPECTS[j];
        names.push(A.label);
        if (rw * A.h === rh * A.w) fit = true;          // ★比率で比較 (等倍拡大は歪まない)
      }
      if (fit) continue;
      warn("painting-aspect",
           "部屋 " + rooms[i].id + " は 幅" + rw + "×高さ" + rh + " タイルで、1枚絵の在庫 (" + names.join(" / ") +
           ") と縦横比が一致しません — index.html:5440 の 5引数 drawImage で引き伸ばされて歪みます" +
           (explicit ? " (この部屋は painting が明示指定されています)"
                     : " (この部屋に1枚絵を貼らないなら無視してよい警告です)"),
           [rc[1], rc[0]], i);
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

    // ── 屋外の帯マスク (計画書 落とし穴⑤: 最悪の組合せ) ────────────────────────
    //  bandMask ON は row 13-15 以外の**全行を壁へ潰す** (index.html:3323-3328)。
    //  カスタム幾何を描いたのに ON のままだと、描いた部屋が丸ごと消える。
    //  ⚠ 屋外プリセットは意図してこの状態なので**警告**に留める (エラーにしない)。
    if (d.flags.bandMask) {
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
    buildMapData: buildMapData,
    mapUsed: mapUsed,
    lintMapDef: lintMapDef,                 // ★項目5: 出発前 lint (純粋関数・副作用なし)
    LINT_PAINTING_ASPECTS: LINT_PAINTING_ASPECTS,
    bossRoomIdx: bossRoomIdx,
    slotsOf: slotsOf,
    objectiveCount: objectiveCount,

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
  };
})(window);
