#!/usr/bin/env node
/*
 * driver_mapeditor.js — TRPG マップエディタ map-editor.html (Phase 0) の検証ドライバ
 * ══════════════════════════════════════════════════════════════════════════════
 * 計画書: ~/.claude/plans/dnd-trpg-map-serialized-quail.md 「検証 / tools/driver_mapeditor.js」
 *
 * ■ 何を検証するか (Phase 0 項目1〜5 を 1 本に統合)
 *   §0 前提     実コード(index.html / tavern.html)からの値抽出 + 検証シームの形
 *   §1 骨格     72x28 グリッド / buildMapData / レア床 XOR 式 / パン・ズーム・全体表示
 *   §2 矩形     部屋・廊下の作成/選択/移動/リサイズ/クランプ/削除/role/比率スナップ/undo-redo
 *   §3 スロット 起点・敵・ボスの配置 / 拒否理由 / 所属部屋の付け替え / 削除 / undo-redo
 *   §4 入出力   ★往復同一性 (プリセット → exportJSON → validate → importJSON → DEFAULT_* と
 *               deep-equal) / localStorage / 壊れた JSON の拒否 / sanitize クランプ / PNG
 *   §5 lint     ★不正マップ 5 種の検出 / プリセット 2 種はエラー 0 件 / 純粋性 / PNG 非焼込 / 性能
 *   §6 敵種     ★カタログ抽出のドリフト検出 / 3 要素スロットの往復同一性 / 配置・種類変更・
 *               実寸描画 (drawImage フック) / ツールチップが DOM / lint の未知キー warning
 *   §9 実行中に pageerror / console.error / 404 が 1 件も出ていないこと
 *
 * ■ ★計画書が名指しで要求している assert
 *   - 往復同一性        §4 2c / 2d … DEFAULT_DUNGEON / DEFAULT_FIELD と **deep-equal**
 *                       (JSON 文字列比較ではなく node 側の再帰 deepEqual。キー順に依存しない)
 *   - lint 不正 5 種    §5 3a/3a2/3b/3c/3d/3e/3e2 … **code** で判定する (文言では判定しない)
 *   - 空振り検出        §5 2a/2b/N0 … プリセットそのままなら lint エラー 0 件
 *   - 実コードとの一致  §0 0-1 / §4 3a〜3n … index.html / tavern.html から実読した値と突合。
 *                       ★「抽出できたこと自体」も assert する (抽出失敗を PASS にしない)
 *   - 敵カタログのドリフト §6 A1〜A8 … ★ドライバ側でも index.html を **node で独立に**読み、
 *                       **2 通りの方法** (new Function 評価 / eval を使わないトークン走査) で
 *                       キーを数え、その結果と**エディタの抽出結果**を突き合わせる。
 *                       ⚠ ハードコードの 49 とエディタの 49 を比べても意味がない
 *                         (index.html の書式が変わったとき両方が同時に腐る) → 実読で作る。
 *
 * ■ 負のコントロール (--mutate <kind>)  ★「assert が空振りでない」ことの直接証明
 *   map-editor.html にわざと欠陥を注入した写しを配信し、狙った assert だけが赤くなるか見る。
 *   ⚠ 置換対象が見つからなければ **exit 3 で止まる** (変異が空振りしたまま PASS するのを防ぐ)
 *     noclamp     移動のクランプを外す               → §2 6a/6b/6c が FAIL
 *     nonorm      反転ドラッグの正規化を殺す         → §2 5b が FAIL
 *     snapwh      比率スナップの幅と高さを取り違え   → §2 9a/9d/N2 が FAIL
 *     noroomcheck 敵スロットの部屋内判定を殺す       → §3 4a/4b/4c が FAIL
 *     noreparent  スロット移動時の所属付け替えを殺す → §3 7c が FAIL
 *     nobosscheck ボス部屋を role でなく末尾で推測   → §3 5a/5b が FAIL
 *     dropslots   exportJSON が enemySlots を落とす  → §4 2a/2b/2c/2d/N1 + §6 B1/B2 が FAIL
 *                 (§6 も exportJSON を通る = 同じ欠陥が 2 節から見える。狙い通り)
 *     noschema    読込時の schema 判定を殺す         → §4 7a が FAIL
 *     keepsel     PNG 書き出し前の選択解除を殺す     → §4 9d が FAIL
 *     nofill      lint の flood fill を殺す          → §5 3a/3a2 が FAIL
 *     nowall      lint の壁乗り検査を殺す            → §5 3b/3c が FAIL
 *     nocand      lint の候補ゼロ検査を殺す          → §5 3e が FAIL
 *     lintpng     PNG 書き出し前の overlay OFF を殺す→ §5 6 が FAIL
 *     ── Phase 0.5 (敵の種類指定) で足した 7 種 ★下表は推測ではなく実測 ────────
 *     dropkind    makeSlot が 3 要素目を落とす       → §6 C1/C2/C3/C4/C6/C7/C8/D2 が FAIL
 *                 (★sanitize 側の fixSlot は無傷なので §6 B1 は PASS のまま = 経路が別)
 *     dropfix     sanitize の fixSlot が 3 要素目を落とす → §6 B1/B3/B4/E1/E3 が FAIL
 *                 (★makeSlot は無傷なので配置系 C1/C2 は PASS のまま = 経路が別。
 *                  lintMapDef は入力を sanitize してから見るので E も巻き込まれる)
 *     nobrush     敵スロット配置が筆を無視する       → §6 C1 だけが FAIL
 *                 (ボスは brushSlot のままなので C2 は PASS = 「配置 2 経路」の片方だけを殺す)
 *     nosprite    実寸スプライト描画を殺す           → §6 C7/C8 が FAIL
 *     nocatalog   カタログ抽出のマーカーを壊す       → §6 A2/A3/A4/A5/A6/A8/C4/C7/C8/D2/E1/E3 が FAIL
 *                 (★fetch を 404 にする方向はダメ = §9 の console.error 0 件と衝突する)
 *     nogroupfallback 未分類キーの受け皿 "other" を殺す → §6 A7/A8 が FAIL
 *                 (⚠ groupEnemyCatalog 側の `|| byId.other` が総和を救うので A6 は PASS)
 *     notip       ツールチップの表示クラスを付けない → §6 D1/D4 が FAIL
 *                 (⚠ 文言は textContent に入ったままなので D2/D3 は PASS = 別の物を測っている)
 *
 * ■ 使い方
 *     node tools/driver_mapeditor.js [--headful] [--port N] [--browser <path>]
 *                                    [--mutate <kind>] [--shots <dir>]
 *   exit 0=全 PASS / 1=FAIL あり / 2=環境不足 (puppeteer-core・Chrome) / 3=例外・変異の空振り
 *
 * ⚠ Chrome プロファイルは必ず require('./_pptr_profile') で作る。自前で --user-data-dir を
 *   作ると消し忘れて滞留する (実測 1710 個・8.0GB の前科あり → tools/_pptr_profile.js 参照)。
 * ⚠ 本ドライバは map-editor.html だけを開く。ゲーム本体 (index.html / tavern.html) は
 *   期待値の抽出のために**読むだけ**で、開きも書き換えもしない。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8861'), 10);
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'df_mapeditor_shots'));

// ── 変異負制御 ──────────────────────────────────────────────────────────────
const MUTATE = arg('mutate', null);
const MUTATIONS = {
  // §2 矩形ツール
  noclamp: [['      var ddc = clamp(dtx, -o[1], (g.w - 1) - o[3]);\n      var ddr = clamp(dty, -o[0], (g.h - 1) - o[2]);',
             '      var ddc = dtx;\n      var ddr = dty;']],
  nonorm:  [['if (r2 < r1) { tmp = r1; r1 = r2; r2 = tmp; }', 'if (false) { tmp = r1; r1 = r2; r2 = tmp; }'],
            ['if (c2 < c1) { tmp = c1; c1 = c2; c2 = tmp; }', 'if (false) { tmp = c1; c1 = c2; c2 = tmp; }']],
  snapwh:  [['climax: { w: 20, h: 16,', 'climax: { w: 16, h: 20,']],
  // §3 スロット
  noroomcheck: [['      var ri = roomIndexAt(tx, ty);',
                 '      var ri = Math.max(0, roomIndexAt(tx, ty));']],
  noreparent:  [['    var rj = roomIndexAt(tx, ty);                    // 移動先の部屋',
                 '    var rj = sel.roomIndex;                          // 移動先の部屋']],
  nobosscheck: [['    return -1;                                     // 推測でボス部屋を作らない',
                 '    return rooms.length - 1;                       // 推測でボス部屋を作らない']],
  // §4 入出力
  dropslots: [['    return JSON.stringify(state.mapDef, null, 2);',
               '    var _m = M.clone(state.mapDef); for (var _i = 0; _i < _m.rooms.length; _i++) _m.rooms[_i].enemySlots = []; return JSON.stringify(_m, null, 2);']],
  noschema:  [['    if (obj.schema !== M.SCHEMA)', '    if (false)']],
  keepsel:   [['      state.selection = null; state.slotSelection = null;\n      state.lintOverlay = false;',
               '      state.lintOverlay = false;']],
  // §5 lint
  nofill:  [['    var seen = new Array(W * H);\n    if (sx < 0 || sx >= W || sy < 0 || sy >= H) return seen;',
             '    var seen = new Array(W * H);\n    for (var _z = 0; _z < W * H; _z++) seen[_z] = 1;\n    if (sx < 0 || sx >= W || sy < 0 || sy >= H) return seen;']],
  nowall:  [['      if (!outside && map[ty][tx] !== T_WALL) { p.wall = false; continue; }',
             '      if (true) { p.wall = false; continue; }']],
  nocand:  [['      if (nTrap === 0)', '      if (false)'],
            ['      if (nChest === 0)', '      if (false)']],
  lintpng: [['      state.lintOverlay = false;\n      render();', '      render();']],

  /* ── §6 敵の種類指定 (Phase 0.5) ────────────────────────────────────────────
   * ⚠ 置換文字列は map-editor.html からの**逐語コピー**。実装を触ると自己失効する
   *   (空振り = exit 3 で止まるので、黙って負のコントロールが死ぬことはない)。
   * ⚠ 「3 要素目を落とす」は **makeSlot (配置/移動/種類変更)** と
   *   **fixSlot (sanitize/往復)** の 2 経路がある。どちらか一方だけを殺すことで
   *   「§6 B (往復) と §6 C (配置) が本当に別の経路を測っている」ことが証明できる。 */
  dropkind: [['  function makeSlot(tx, ty, kind) {\n    var k = M.normEnemyKey(kind);',
              '  function makeSlot(tx, ty, kind) {\n    var k = null;']],
  dropfix:  [['      var kind = normEnemyKey(s[2]);\n      if (kind) out.push(kind);',
              '      var kind = null;\n      if (kind) out.push(kind);']],
  nobrush:  [['      d.rooms[ri].enemySlots.push(brushSlot(tx, ty));',
              '      d.rooms[ri].enemySlots.push(makeSlot(tx, ty, null));']],
  nosprite: [['    if (drawSlotSprite(slot, color)) return;', '    if (false) return;']],
  // ★fetch を 404 にする方向は §9 (console.error 0 件) と衝突するので、抽出マーカーを壊す。
  //   loadEnemyCatalog は console.warn + reason 付きで失敗する = 想定内の退化パス。
  nocatalog: [['  var ENEMY_CATALOG_MARK = "const ENEMY_TYPES = {";',
               '  var ENEMY_CATALOG_MARK = "const ENEMY_TYPES_GONE = {";']],
  // ⚠ groupEnemyCatalog 側に `|| byId.other` の保険があるので**総和は崩れない**。
  //   崩れるのは groupIdOfEnemy の戻り値と .palItem[data-group] の方 → A7/A8 が拾う。
  nogroupfallback: [['    return "other";                                       // ★③ 受け皿 (未分類は必ずここ)',
                     '    return null;                                          // ★③ 受け皿 (未分類は必ずここ)']],
  notip: [['    el.slotTip.classList.add("on");', '    el.slotTip.classList.remove("on");']],
};
/* 変異の対象ファイル。Phase 1 で §A (DFMapDef) が map-editor.html から js/df-mapdef.js へ
 * 移ったため、置換先は **2 ファイルに跨る**。どちらに書いてあるかを呼び出し側が知らずに済むよう
 * 「両方を読んで from を含む方に当てる」方式にした。
 * ⚠ 1 つの rule が **どちらにも無い** / **両方にある** ときは exit 3 (空振り = 負のコントロールの死)。 */
const MUTATE_TARGETS = ['map-editor.html', 'js/df-mapdef.js'];
let _mutatedCache = null;
function mutatedSources() {
  if (_mutatedCache) return _mutatedCache;
  const rules = MUTATIONS[MUTATE];
  if (!rules) {
    console.error('[driver] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
    process.exit(3);
  }
  const orig = {}, out = {};
  for (const rel of MUTATE_TARGETS) orig[rel] = out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of rules) {
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    if (hits.length !== 1) {
      console.error('[driver] ⛔ 変異の置換対象が ' + (hits.length === 0 ? '見つからない' : hits.length + ' ファイルに重複') +
                    ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 80)) +
                    (hits.length ? '  [' + hits.join(', ') + ']' : ''));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
  }
  const touched = MUTATE_TARGETS.filter(rel => out[rel] !== orig[rel]);
  console.log('[driver] ★変異負制御 --mutate ' + MUTATE + ' を注入 (' + touched.join(' + ') + ') して配信します');
  _mutatedCache = out;
  return out;
}

// ── puppeteer / Chrome (tools/driver_field_step1_geo.js と同じ流儀) ─────────
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

// ── 内蔵静的サーバ (外部の 8765 に依存しない) ───────────────────────────────
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, root) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        // ← 変異負制御の差し替え (map-editor.html と js/df-mapdef.js の両方が対象)
        if (MUTATE && MUTATE_TARGETS.indexOf(u.replace(/^\//, '')) >= 0) {
          const rel = u.replace(/^\//, '');
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]);
          return;
        }
        const fp = path.join(root, u);
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

// ── 判定 ────────────────────────────────────────────────────────────────────
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ★往復同一性で使う再帰 deep-equal。
 * JSON.stringify 比較は**キーの順序が変わっただけで不一致**になるので、
 * 「DEFAULT_DUNGEON と deep-equal」という計画書の要求には順序非依存の比較を使う。 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}
// 最初に食い違った場所を人が読める形で返す (FAIL 時の detail 用)
function deepDiff(a, b, p) {
  p = p || '$';
  if (deepEqual(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' ||
      Array.isArray(a) !== Array.isArray(b))
    return p + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
  const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
  for (const k of keys) {
    if (!(k in a)) return p + '.' + k + ': (無い) vs ' + JSON.stringify(b[k]);
    if (!(k in b)) return p + '.' + k + ': ' + JSON.stringify(a[k]) + ' vs (無い)';
    const d = deepDiff(a[k], b[k], p + '.' + k);
    if (d) return d;
  }
  return p + ': 不明な差分';
}

/* ── §1 用: index.html:3312 の XOR 式を**独立に再実装**する ──────────────────
 * ⚠ map-editor.html のコードは一切参照せず、index.html の逐語コピーから集合を作る。
 *   ダンジョン既定 (2部屋 / 廊下1本 / 帯マスク無し) の理論値。 */
function expectedRareSet() {
  const W = 72, H = 28;
  const ROOMS = [[7, 24, 20, 43], [5, 47, 22, 68]];
  const CORRIDORS = [[13, 43, 15, 47]];
  const map = Array.from({ length: H }, () => new Array(W).fill(2));
  const fill = (r1, c1, r2, c2, t) => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) map[r][c] = t;
  };
  for (const [r1, c1, r2, c2] of ROOMS) {
    fill(r1, c1, r2, c2, 0);
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        if (((r * 7 + c * 13) ^ (r * 3 - c)) % 5 === 0) map[r][c] = 1;   // index.html:3312 逐語
  }
  for (const [r1, c1, r2, c2] of CORRIDORS) fill(r1, c1, r2, c2, 0);
  const set = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (map[r][c] === 1) set.push(r + ',' + c);
  return set;
}

/* ── §4 用: 実コード (index.html / tavern.html) から現行値を抽出する ─────────
 * ★「エディタのプリセットが現行と一致」を**転記**ではなく実ファイルで検算するため。
 *   見つからなければ null を返し、§0 0-1 で FAIL にする (空振り禁止)。
 *
 * ⚠ Phase 1 (幾何の一元化) で index.html の抽出先が変わった。
 *   旧: `const ROOMS_DUNGEON = […]` … index.html が幾何の値を持っていた頃のアンカー
 *   新: `const FALLBACK_ROOMS_DUNGEON = […]` … js/df-mapdef.js が 404 のときの**救命ボート**
 *   index.html の ROOMS/CORRIDORS/start は今や MAPDEF (= DFMapDef.resolve) 由来なので、
 *   index.html 側に残る唯一の座標リテラルがこの救命ボートである。
 * ⭐ 比較の意味は**強くなっている**: エディタのプリセット (js/df-mapdef.js の DEFAULT_*) と
 *   救命ボート (index.html) が食い違うと「404 のときだけ別のマップで動く」という Phase 1 で
 *   いちばん怖い壊れ方をする。ここはその唯一の検出器。 */
function stripComments(s) { return s.replace(/\/\/[^\n]*/g, ''); }
function grabPairs4(text) {
  const out = [], re = /\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/g;
  let m; while ((m = re.exec(text))) out.push([+m[1], +m[2], +m[3], +m[4]]);
  return out;
}
function grabPairs2(text) {
  const out = [], re = /\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/g;
  let m; while ((m = re.exec(text))) out.push([+m[1], +m[2]]);
  return out;
}
function extractLive() {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tav = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
  const roomsDun = /const\s+FALLBACK_ROOMS_DUNGEON\s*=\s*\[([\s\S]*?)\n\s*\];/.exec(idx);
  const roomsFld = /const\s+FALLBACK_ROOMS_FIELD\s*=\s*\[([\s\S]*?)\n\s*\];/.exec(idx);
  const corrDunM = /const\s+FALLBACK_CORRIDORS_DUNGEON\s*=\s*(\[[\s\S]*?\])\s*;/.exec(idx);
  const corrFldM = /const\s+FALLBACK_CORRIDORS_FIELD\s*=\s*(\[[\s\S]*?\])\s*;/.exec(idx);
  const slots = /const\s+ROOM_SLOTS\s*=\s*\[([\s\S]*?)\n\s*\];/.exec(tav);
  const boss = /const\s+BOSS_SLOT\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/.exec(tav);
  const startDunM = /const\s+FALLBACK_START_DUNGEON\s*=\s*\{\s*tx:\s*(\d+)\s*,\s*ty:\s*(\d+)\s*\}/.exec(idx);
  const startFldM = /const\s+FALLBACK_START_FIELD\s*=\s*\{\s*tx:\s*(\d+)\s*,\s*ty:\s*(\d+)\s*\}/.exec(idx);
  return {
    roomsDungeon: roomsDun ? grabPairs4(stripComments(roomsDun[1])) : null,
    roomsField:   roomsFld ? grabPairs4(stripComments(roomsFld[1])) : null,
    corrDungeon:  corrDunM ? grabPairs4(stripComments(corrDunM[1])) : null,
    corrField:    corrFldM ? grabPairs4(stripComments(corrFldM[1])) : null,
    roomSlots:    slots ? grabPairs2(stripComments(slots[1])) : null,
    bossSlot:     boss ? [+boss[1], +boss[2]] : null,
    startField:   startFldM ? { tx: +startFldM[1], ty: +startFldM[2] } : null,
    startDungeon: startDunM ? { tx: +startDunM[1], ty: +startDunM[2] } : null,
  };
}

/* ── §5 用: 実コードから「lint が模倣すべき規則」を抽出して検算する ──────────
 * ★転記ではなく index.html の実文字列で裏を取る (空振り禁止)。 */
function extractLiveRules() {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const mdf = fs.readFileSync(path.join(ROOT, 'js', 'df-mapdef.js'), 'utf8');
  return {
    // 敵スポーン救済が値1しか見ない (計画書 落とし穴② の根拠)
    rescueOnlyRare: /mapData\[r\]\[c\] === 1\) mapData\[r\]\[c\] = 0;/.test(idx),
    /* 罠/宝箱の部屋除外。⚠ Phase 1 で index.html から式そのものが消え、
     *   `DFMapDef.excludedRoomIdx(MAPDEF)` の戻り値を 3 つのスポナーが**共有**する形になった。
     *   よって「同じ規則を 3 箇所が使っている」ことは EXCLUDED_ROOMS の消費回数で数える。 */
    excludeExpr: (idx.match(/for \(const i of EXCLUDED_ROOMS\)/g) || []).length,
    // 規則そのもの (rooms.length >= 3 ? {0,boss} : {boss}) は js/df-mapdef.js 側にある。
    // ★lint (lintMapDef の exLegacy) はこれを**自前で再実装**しているので、両者の食い違い検出になる。
    excludeRule: /\(rooms\.length >= 3\) \? new Set\(\[0, boss\]\) : new Set\(\[boss\]\)/.test(mdf),
    /* ★「誤り②」の再発検出器: 玄室宝箱 (spawnRoomChests) だけは**部屋数を見ない**別系統
     *   (常に {0,boss})。index.html で 2 つが**別名で**使われていることを確認する。
     *   統合されると 2 部屋ダンジョンで玄室宝箱 or 罠のどちらかが必ず壊れる。 */
    chestRuleSeparate: /if \(ROOM_CHEST_EXCLUDED_ROOMS\.has\(i\)\) continue;/.test(idx) &&
                       /function chestExcludedRoomIdx\(d\) \{\s*\n\s*return new Set\(\[0, bossRoomIdx\(d\)\]\);/.test(mdf),
    // 候補ゼロで無言 return
    silentReturn: (idx.match(/if \(candidates\.length === 0\) return;/g) || []).length,
    // 候補は値0のみ (レア床1 は候補外)
    onlyFloor0: (idx.match(/if \(mapData\[r\]\[c\] !== 0\) continue;/g) || []).length,
    // 罠の起点半径1 除外 (⚠ 起点は Phase 1 で MAPDEF.start 由来の START_TX/TY になった)
    trapStartGuard: /!IS_FIELD_THEME && Math\.abs\(c - START_TX\) <= 1 && Math\.abs\(r - START_TY\) <= 1/.test(idx),
    // 歩行判定 = 値2 だけが壁
    wallIsOnly2: /if \(mapData\[tileY\]\[tileX\] === 2\) return true;/.test(idx),
    // クリア条件 (⚠ Phase 1 で ROOMS.length-1 → OBJECTIVE_ROOMS = DFMapDef.objectiveCount)
    clearCond: /visitedRooms\.size >= OBJECTIVE_ROOMS/.test(idx),
    // 帯マスク行。⚠ BOTTOM_ROW は `TOP_ROW + ROWS - 1` の**計算式**でリテラルではない
    //   (index.html:3029)。リテラルで探すと永久に空振りする → 2 定数から計算して突き合わせる。
    bandTop: (function () { const m = /FIELD_BAND_TOP_ROW\s*=\s*(\d+)/.exec(idx); return m ? +m[1] : null; })(),
    bandBottom: (function () {
      const t = /FIELD_BAND_TOP_ROW\s*=\s*(\d+)/.exec(idx), n = /FIELD_BAND_ROWS\s*=\s*(\d+)/.exec(idx);
      return (t && n) ? (+t[1] + (+n[1]) - 1) : null;
    })(),
  };
}

/* ── §6 用: index.html の ENEMY_TYPES を **ドライバ側で独立に**抽出する ───────
 * ★これが「index.html の書式が変わった」を検知する唯一の器。
 *   ⚠ 期待値をハードコード (49) してエディタの 49 と比べても意味がない。
 *     index.html の書式が変われば**両方が同時に**壊れるか、両方が同時に古くなる。
 *     → node 側で毎回実読して数え、エディタ側の抽出結果と突き合わせる。
 * ★数え方を **2 通り**用意して互いに検算する:
 *     ① new Function で評価してキーを取る (= エディタと同じ結論に至るはず)
 *     ② eval を一切使わないトークン走査で「深さ1 の識別子 + :」を拾う
 *   ①だけだと「評価はできたが中身が別物」を見逃す。②だけだと三項演算子等で誤検出しうる。
 * ⚠ 文字列と // /* コメントを飛ばさないと、日本語コメント中の { } で必ず壊れる
 *   (ENEMY_TYPES は日本語コメントだらけ)。 */
function enemyTypesBlock() {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const MARK = 'const ENEMY_TYPES = {';
  const at = idx.indexOf(MARK);
  if (at < 0) return null;
  const open = at + MARK.length - 1;              // '{' の位置
  let depth = 0, k = open;
  const n = idx.length;
  while (k < n) {
    const ch = idx[k];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; k++;
      while (k < n) { if (idx[k] === '\\') { k += 2; continue; } if (idx[k] === q) { k++; break; } k++; }
      continue;
    }
    if (ch === '/' && idx[k + 1] === '/') { while (k < n && idx[k] !== '\n') k++; continue; }
    if (ch === '/' && idx[k + 1] === '*') { k += 2; while (k < n && !(idx[k] === '*' && idx[k + 1] === '/')) k++; k += 2; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return { text: idx.slice(open, k + 1), start: open, end: k + 1 }; }
    k++;
  }
  return null;                                    // 閉じていない = 抽出失敗 (PASS にしない)
}
// 文字列とコメントを空白へ潰す (「純データか」を測るための下ごしらえ)
function stripStringsAndComments(s) {
  let out = '', k = 0;
  const n = s.length;
  while (k < n) {
    const ch = s[k];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; k++;
      while (k < n) { if (s[k] === '\\') { k += 2; continue; } if (s[k] === q) { k++; break; } k++; }
      out += '""'; continue;
    }
    if (ch === '/' && s[k + 1] === '/') { while (k < n && s[k] !== '\n') k++; continue; }
    if (ch === '/' && s[k + 1] === '*') { k += 2; while (k < n && !(s[k] === '*' && s[k + 1] === '/')) k++; k += 2; continue; }
    out += ch; k++;
  }
  return out;
}
/* コメントだけを潰す (文字列は残す)。
 * ⚠ テンプレートリテラルの検出にはこちらを使うこと。stripStringsAndComments は
 *   バッククォートを「文字列の囲み」として消してしまうので、必ず 0 になり検査が死ぬ。
 * ⚠ ENEMY_TYPES 内には `` ` `` を含む**日本語コメント**が実在する (index.html:6812 付近)
 *   ので、素朴に生テキストを数えると 2 件の偽陽性が出る (実測で踏んだ)。 */
function stripCommentsOnly(s) {
  let out = '', k = 0;
  const n = s.length;
  while (k < n) {
    const ch = s[k];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; let j = k + 1;
      while (j < n) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === q) { j++; break; } j++; }
      out += s.slice(k, j); k = j; continue;
    }
    if (ch === '/' && s[k + 1] === '/') { while (k < n && s[k] !== '\n') k++; continue; }
    if (ch === '/' && s[k + 1] === '*') { k += 2; while (k < n && !(s[k] === '*' && s[k + 1] === '/')) k++; k += 2; continue; }
    out += ch; k++;
  }
  return out;
}
// ② eval を使わない独立実装。深さ1 (= ENEMY_TYPES 直下) の `key:` だけを拾う
function scanTopLevelEnemyKeys(body) {
  const keys = [];
  const idStart = /[A-Za-z_$]/, idPart = /[A-Za-z0-9_$]/;
  let depth = 0, k = 0;
  const n = body.length;
  while (k < n) {
    const ch = body[k];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; k++;
      while (k < n) { if (body[k] === '\\') { k += 2; continue; } if (body[k] === q) { k++; break; } k++; }
      continue;
    }
    if (ch === '/' && body[k + 1] === '/') { while (k < n && body[k] !== '\n') k++; continue; }
    if (ch === '/' && body[k + 1] === '*') { k += 2; while (k < n && !(body[k] === '*' && body[k + 1] === '/')) k++; k += 2; continue; }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; k++; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; k++; continue; }
    if (depth === 1 && idStart.test(ch)) {
      let j = k; while (j < n && idPart.test(body[j])) j++;
      const word = body.slice(k, j);
      let p = j; while (p < n && /\s/.test(body[p])) p++;
      if (body[p] === ':') keys.push(word);
      k = j; continue;
    }
    k++;
  }
  return keys;
}
const ENEMY_NON_COMBAT_EXPECT = ['caravanWagon'];      // 敵ではない = カタログから除外されるべき
const ENEMY_REQUIRED_EXPECT = ['name', 'sprite', 'frameW', 'frameH', 'cols', 'hp', 'xp'];
function extractEnemyCatalogNode() {
  const blk = enemyTypesBlock();
  if (!blk) return { ok: false, error: 'index.html から ENEMY_TYPES ブロックを切り出せない' };
  let obj = null, evalErr = null;
  try { obj = new Function('return (' + blk.text + ');')(); }
  catch (e) { evalErr = String((e && e.message) || e); }
  const evalKeys = obj ? Object.keys(obj) : [];
  const scanKeys = scanTopLevelEnemyKeys(blk.text);
  const bare = stripStringsAndComments(blk.text);
  const pure = {                                   // new Function で評価してよい根拠 (純データか)
    fn: (bare.match(/\bfunction\b/g) || []).length,
    arrow: (bare.match(/=>/g) || []).length,
    tmpl: (stripCommentsOnly(blk.text).match(/`/g) || []).length,
  };
  const combat = evalKeys.filter((k) => ENEMY_NON_COMBAT_EXPECT.indexOf(k) < 0);
  const missing = [];
  for (const k of combat)
    for (const f of ENEMY_REQUIRED_EXPECT)
      if (!obj[k] || obj[k][f] === undefined || obj[k][f] === null) missing.push(k + '.' + f);
  return {
    ok: !evalErr && evalKeys.length > 0,
    error: evalErr,
    bytes: blk.text.length,
    evalKeys, scanKeys, combat, missing, pure,
    // ★2 方式が一致すること自体が「抽出が正しい」の裏取り
    sameByBothMethods: evalKeys.length === scanKeys.length &&
      evalKeys.slice().sort().join(',') === scanKeys.slice().sort().join(','),
    // caravanWagon が index.html に**実在する**こと (除外 assert の空振り防止)
    hasNonCombat: ENEMY_NON_COMBAT_EXPECT.every((k) => evalKeys.indexOf(k) >= 0),
  };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_mapedit_');
  const srv = await startServer(PORT, ROOT);
  console.log('[driver] server http://127.0.0.1:' + PORT + '  root=' + ROOT);
  console.log('[driver] profile=' + profile);

  // ══════════════════════════════════════════════════════════════════════════
  // §0 前提 — 実コードからの抽出 + 検証シームの形
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n───── §0 前提 (実コード抽出 + 検証シームの形) ─────');
  const live = extractLive();
  console.log('[live] FALLBACK_ROOMS_DUNGEON = ' + JSON.stringify(live.roomsDungeon));
  console.log('[live] FALLBACK_ROOMS_FIELD   = ' + JSON.stringify(live.roomsField));
  console.log('[live] FALLBACK_CORRIDORS dungeon=' + JSON.stringify(live.corrDungeon) + '  field=' + JSON.stringify(live.corrField));
  console.log('[live] ROOM_SLOTS    = ' + JSON.stringify(live.roomSlots));
  console.log('[live] BOSS_SLOT     = ' + JSON.stringify(live.bossSlot));
  console.log('[live] start dungeon=' + JSON.stringify(live.startDungeon) + '  field=' + JSON.stringify(live.startField));
  check('§0 0-1 実コード(index の救命ボート/tavern)から現行値を抽出できた (抽出失敗を PASS にしない)',
        !!(live.roomsDungeon && live.roomsField && live.corrDungeon && live.corrField &&
           live.roomSlots && live.bossSlot && live.startDungeon && live.startField) &&
        live.roomsDungeon.length === 2 && live.roomsField.length === 3 && live.roomSlots.length === 8,
        'rooms=' + (live.roomsDungeon || []).length + '/' + (live.roomsField || []).length +
        ' slots=' + (live.roomSlots || []).length);

  const liveRules = extractLiveRules();
  console.log('[live] lint 前提規則 = ' + JSON.stringify(liveRules));
  check('§0 0-2 実コードから lint の前提規則を裏取りできた (救済は値1のみ/除外式2系統/無言return/値0のみ候補/罠の起点ガード/壁は値2/クリア条件/帯row)',
        liveRules.rescueOnlyRare && liveRules.excludeExpr >= 3 && liveRules.silentReturn >= 3 &&
        liveRules.onlyFloor0 >= 3 && liveRules.trapStartGuard && liveRules.wallIsOnly2 &&
        liveRules.clearCond && liveRules.bandTop !== null && liveRules.bandBottom !== null &&
        liveRules.excludeRule && liveRules.chestRuleSeparate,
        JSON.stringify(liveRules));

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: HEADFUL ? false : 'new',
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errs.push('http' + r.status() + ': ' + r.url()); });

  await page.goto('http://127.0.0.1:' + PORT + '/map-editor.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('!!window.__mapEditor', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));

  const seam = await page.evaluate(() => {
    const E = window.__mapEditor;
    return { keys: Object.keys(E).sort(), version: E.version,
             mapDefKeys: Object.keys(E.MapDef).sort(),
             tools: E.TOOLS.map(t => t.key), snapDims: E.ASPECT_SNAPS,
             band: { top: E.MapDef.BAND_TOP_ROW, bottom: E.MapDef.BAND_BOTTOM_ROW,
                     wall: E.MapDef.T_WALL, floor: E.MapDef.T_FLOOR, rare: E.MapDef.T_RARE } };
  });
  console.log('[driver] seam keys: ' + seam.keys.join(','));
  console.log('[driver] version=' + seam.version + '  TOOLS=' + JSON.stringify(seam.tools) +
              '  ASPECT_SNAPS=' + JSON.stringify(seam.snapDims));
  console.log('[driver] 帯row エディタ=' + seam.band.top + '-' + seam.band.bottom +
              ' / index.html=' + liveRules.bandTop + '-' + liveRules.bandBottom +
              '  タイル値 floor/rare/wall=' + seam.band.floor + '/' + seam.band.rare + '/' + seam.band.wall);

  /* ⚠ version は項目が進むたび上がる。=== 5 に固定すると**この assert は自己失効する**ので
   *   「項目5 以降であること」を見る。名前が消えていないかは厳密に見る。 */
  const SEAM_KEYS = [
    // 項目1 (骨格)
    'version', 'getMapDef', 'setMapDef', 'buildMapData', 'state', 'MapDef', 'render', 'fitToView',
    'zoomAt', 'loadPreset', 'worldToScreen', 'screenToWorld', 'screenToTile', 'canvas',
    // 項目2 (矩形ツール)
    'setTool', 'dragTile', 'selectAt', 'getSelection', 'deleteSelection', 'setRole',
    'setAspectSnap', 'undo', 'redo', 'TOOLS', 'ASPECT_SNAPS',
    // 項目3 (スロット)
    'placeSlot', 'selectSlotAt', 'getSlotSelection', 'moveSlot', 'deleteSlot', 'lastReason',
    // 項目4 (入出力)
    'exportJSON', 'importJSON', 'saveLocal', 'listLocal', 'loadLocal', 'deleteLocal', 'exportPNG',
    // 項目5 (lint)
    'lint', 'lintMapDef', 'focusTile', 'setLintPanelOpen',
  ];
  check('§0 0-3 検証シーム window.__mapEditor に項目1〜5 の名前が全部ある / version>=5',
        SEAM_KEYS.every(k => seam.keys.includes(k)) && seam.version >= 5,
        'version=' + seam.version + ' 不足=' + JSON.stringify(SEAM_KEYS.filter(k => !seam.keys.includes(k))));
  check('§0 0-4 DFMapDef 側に純粋関数が揃っている (validate/sanitize/buildMapData/lintMapDef/DEFAULT_*)',
        ['SCHEMA', 'DEFAULT_DUNGEON', 'DEFAULT_FIELD', 'clone', 'sanitize', 'validate',
         'buildMapData', 'lintMapDef', 'bossRoomIdx', 'slotsOf', 'objectiveCount'].every(k => seam.mapDefKeys.includes(k)),
        JSON.stringify(seam.mapDefKeys));
  check('§0 0-5 ツール 6 種 + 比率スナップ 2 種が揃っている',
        eq(seam.tools, ['select', 'room', 'corridor', 'start', 'enemySlot', 'bossSlot']) &&
        !!seam.snapDims.climax && !!seam.snapDims.boss,
        JSON.stringify(seam.tools) + ' ' + JSON.stringify(seam.snapDims));
  check('§0 0-6 エディタの帯row とタイル値が index.html と一致 (帯 13-15 / 床0 レア1 壁2)',
        seam.band.top === liveRules.bandTop && seam.band.bottom === liveRules.bandBottom &&
        seam.band.top === 13 && seam.band.bottom === 15 &&
        seam.band.floor === 0 && seam.band.rare === 1 && seam.band.wall === 2,
        'エディタ=' + seam.band.top + '-' + seam.band.bottom +
        ' / live=' + liveRules.bandTop + '-' + liveRules.bandBottom);

  // ══════════════════════════════════════════════════════════════════════════
  // §1 骨格 (グリッド / buildMapData / レア床 / パン・ズーム)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n───── §1 骨格 (グリッド / buildMapData / パン・ズーム) ─────');
  const probe = await page.evaluate(() => {
    const E = window.__mapEditor;
    const def = E.getMapDef();
    const md = E.buildMapData();
    const rare = [];
    for (let r = 0; r < md.length; r++)
      for (let c = 0; c < md[r].length; c++)
        if (md[r][c] === 1) rare.push(r + ',' + c);
    // canvas のピクセル多様性 (全て同一色でないこと)
    const cv = E.canvas;
    const cx = cv.getContext('2d');
    const img = cx.getImageData(0, 0, cv.width, cv.height).data;
    const seen = new Set();
    for (let i = 0; i < img.length; i += 4 * 97) {          // 97px 間引きで走査
      seen.add(img[i] + ',' + img[i + 1] + ',' + img[i + 2]);
      if (seen.size > 40) break;
    }
    return {
      schema: def.schema, roomCount: def.rooms.length, corrCount: def.corridors.length,
      start: def.start, themeId: def.themeId, bandMask: def.flags.bandMask,
      rows: md.length, cols: md[0].length,
      valInRoom: md[13][30], valOutside: md[0][0], valStart: md[13][24],
      rare: rare,
      distinctColors: seen.size, colorSample: Array.from(seen).slice(0, 6),
      cw: cv.width, ch: cv.height,
      zoom: E.state.view.zoom,
      validate: E.MapDef.validate(def),
    };
  });
  console.log('[driver] mapDef: schema=' + probe.schema + ' rooms=' + probe.roomCount +
              ' corridors=' + probe.corrCount + ' start=(tx' + probe.start.tx + ',ty' + probe.start.ty + ')' +
              ' theme=' + probe.themeId + ' bandMask=' + probe.bandMask);
  console.log('[driver] mapData: ' + probe.rows + '行 x ' + probe.cols + '列  ' +
              '(30,13)=' + probe.valInRoom + '  (0,0)=' + probe.valOutside + '  起点(24,13)=' + probe.valStart);
  console.log('[driver] canvas: ' + probe.cw + 'x' + probe.ch + ' 色数=' + probe.distinctColors +
              ' 例=' + JSON.stringify(probe.colorSample) + ' zoom=' + probe.zoom.toFixed(4));

  const rareA = probe.rare.slice().sort(), rareB = expectedRareSet().slice().sort();
  const rareSame = rareA.length === rareB.length && rareA.every((v, i) => v === rareB[i]);
  const rareDiffA = rareA.filter((v) => rareB.indexOf(v) < 0).slice(0, 5);
  const rareDiffB = rareB.filter((v) => rareA.indexOf(v) < 0).slice(0, 5);
  console.log('[driver] レア床: editor=' + rareA.length + ' 個 / 独立再実装=' + rareB.length + ' 個');

  check("§1 2 getMapDef().schema === 'df-map/1'", probe.schema === 'df-map/1', 'schema=' + probe.schema);
  check('§1 2b 起動直後の mapDef が validate() ok (boss ちょうど1つ等)',
        probe.validate.ok, JSON.stringify(probe.validate.errors));
  check('§1 3 buildMapData() が 28行 x 72列', probe.rows === 28 && probe.cols === 72, probe.rows + 'x' + probe.cols);
  check('§1 4a 部屋内 (tx30,ty13) が 2 でない', probe.valInRoom !== 2, '値=' + probe.valInRoom);
  check('§1 4b 部屋外 (tx0,ty0) が 2', probe.valOutside === 2, '値=' + probe.valOutside);
  check('§1 5a レア床(値1)が 1 つ以上', probe.rare.length > 0, probe.rare.length + ' 個');
  check('§1 5b レア床の座標集合が index.html の XOR 式の独立再実装と完全一致', rareSame,
        rareSame ? (rareA.length + ' 個一致')
                 : ('editor側のみ=' + JSON.stringify(rareDiffA) + ' 期待側のみ=' + JSON.stringify(rareDiffB)));

  // 負のコントロール: 式を 1 文字変えた集合とは一致しないこと (5b が空振りでない証明)
  const mutatedRare = (() => {
    const ROOMS = [[7, 24, 20, 43], [5, 47, 22, 68]];
    const out = [];
    for (const [r1, c1, r2, c2] of ROOMS)
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++)
          if (((r * 7 + c * 13) ^ (r * 3 + c)) % 5 === 0) out.push(r + ',' + c);   // ← "-c" を "+c" に変異
    return out;
  })();
  const sameMut = mutatedRare.length === rareA.length && mutatedRare.slice().sort().every((v, i) => v === rareA[i]);
  check('§1 N 負のコントロール: XOR 式を変異させた集合とは一致しない', !sameMut,
        '変異集合=' + mutatedRare.length + ' 個 / 実測=' + rareA.length + ' 個');
  check('§1 6 canvas に描画あり (単色でない)', probe.distinctColors >= 3, '色数=' + probe.distinctColors);

  // 屋外プリセットに切り替えても帯マスクが効くこと
  const fieldProbe = await page.evaluate(() => {
    window.__mapEditor.loadPreset('field');
    const E = window.__mapEditor, d = E.getMapDef(), md = E.buildMapData();
    let walkRows = 0;
    for (let r = 0; r < md.length; r++) if (md[r].some((v) => v !== 2)) walkRows++;
    return { rooms: d.rooms.length, corr: d.corridors.length, start: d.start,
             bandMask: d.flags.bandMask, walkRows: walkRows, theme: d.themeId };
  });
  console.log('[driver] field プリセット: rooms=' + fieldProbe.rooms + ' corridors=' + fieldProbe.corr +
              ' start=(tx' + fieldProbe.start.tx + ',ty' + fieldProbe.start.ty + ') bandMask=' + fieldProbe.bandMask +
              ' 歩行可能行数=' + fieldProbe.walkRows);
  check('§1 7 屋外プリセット: 3部屋 / 起点(6,13) / 帯マスクで歩行可能行が 3 行',
        fieldProbe.rooms === 3 && fieldProbe.corr === 2 && fieldProbe.start.tx === 6 && fieldProbe.start.ty === 13 &&
        fieldProbe.bandMask === true && fieldProbe.walkRows === 3,
        'rooms=' + fieldProbe.rooms + ' corr=' + fieldProbe.corr + ' walkRows=' + fieldProbe.walkRows);

  // ── パン / ズーム / 全体表示リセット ──────────────────────────────────
  await page.evaluate(() => window.__mapEditor.loadPreset('dungeon'));
  const canvasRect = await page.evaluate(() => {
    const r = window.__mapEditor.canvas.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const lx = Math.round(canvasRect.w / 2), ly = Math.round(canvasRect.h / 2);

  const zoomRes = await page.evaluate((lx, ly) => {
    const E = window.__mapEditor, r = E.canvas.getBoundingClientRect();
    const before = { w: E.screenToWorld(lx, ly), zoom: E.state.view.zoom };
    E.canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -120, clientX: r.left + lx, clientY: r.top + ly, bubbles: true, cancelable: true }));
    const after = { w: E.screenToWorld(lx, ly), zoom: E.state.view.zoom };
    return { beforeZoom: before.zoom, afterZoom: after.zoom,
             dx: Math.abs(after.w.x - before.w.x), dy: Math.abs(after.w.y - before.w.y) };
  }, lx, ly);
  console.log('[driver] ホイールズーム: ' + zoomRes.beforeZoom.toFixed(4) + ' → ' + zoomRes.afterZoom.toFixed(4) +
              '  アンカーずれ dx=' + zoomRes.dx.toExponential(2) + ' dy=' + zoomRes.dy.toExponential(2) + ' (world px)');
  check('§1 8 ホイールでズームし、カーソル直下のワールド点が固定される',
        zoomRes.afterZoom > zoomRes.beforeZoom * 1.1 && zoomRes.dx < 0.5 && zoomRes.dy < 0.5,
        'zoom ' + zoomRes.beforeZoom.toFixed(4) + '→' + zoomRes.afterZoom.toFixed(4) + ' / dx=' + zoomRes.dx.toExponential(2));

  /* パン: ドラッグ量 / zoom だけ view が動くこと。
   * ⚠ 左ドラッグは「掴む物が無いときだけ」パンになる。canvas 中央 (≒ tx36,ty14) は部屋 r0
   *   [7,24,20,43] の内側なので、そこから引くとパンではなく**部屋が動く**。
   *   よってドラッグ開始点は必ず**空きタイル (tx2,ty2)** にする。 */
  const emptyPt = await page.evaluate(() => {
    const E = window.__mapEditor, t = E.state.mapDef.grid.tile;
    E.fitToView();   // 直前のズーム試験で寄っているので全体表示へ戻す (tx2,ty2 を画面内に入れる)
    const p = E.worldToScreen(2 * t + t / 2, 2 * t + t / 2);   // タイル (tx2,ty2) の中心
    return { x: p.x, y: p.y, val: E.state.mapData[2][2] };
  });
  const px0 = Math.round(emptyPt.x), py0 = Math.round(emptyPt.y);
  const view0 = await page.evaluate(() => ({ x: window.__mapEditor.state.view.x, y: window.__mapEditor.state.view.y,
                                             z: window.__mapEditor.state.view.zoom, n: window.__mapEditor.state.renderCount }));
  await page.mouse.move(canvasRect.x + px0, canvasRect.y + py0);
  await page.mouse.down();
  await page.mouse.move(canvasRect.x + px0 - 100, canvasRect.y + py0 - 40);
  await page.mouse.up();
  const view1 = await page.evaluate(() => ({ x: window.__mapEditor.state.view.x, y: window.__mapEditor.state.view.y,
                                             n: window.__mapEditor.state.renderCount,
                                             cur: window.__mapEditor.state.cursor }));
  const expDx = 100 / view0.z, expDy = 40 / view0.z;
  console.log('[driver] ドラッグ(-100,-40)px: view.x ' + view0.x.toFixed(1) + '→' + view1.x.toFixed(1) +
              ' (期待 +' + expDx.toFixed(1) + ') / view.y ' + view0.y.toFixed(1) + '→' + view1.y.toFixed(1) +
              ' (期待 +' + expDy.toFixed(1) + ') / renderCount ' + view0.n + '→' + view1.n);
  check('§1 9 ドラッグでパンする (移動量 = ドラッグ量 / zoom)',
        Math.abs((view1.x - view0.x) - expDx) < 1 && Math.abs((view1.y - view0.y) - expDy) < 1 && view1.n > view0.n,
        'dx=' + (view1.x - view0.x).toFixed(2) + ' dy=' + (view1.y - view0.y).toFixed(2));
  check('§1 9b HUD のカーソルタイルが更新される',
        view1.cur.inside === true && view1.cur.val !== null,
        '(tx' + view1.cur.tx + ',ty' + view1.cur.ty + ') 値=' + view1.cur.val);

  const fitRes = await page.evaluate(() => {
    document.getElementById('btnFit').click();
    const E = window.__mapEditor, g = E.state.mapDef.grid;
    const a = E.worldToScreen(0, 0), b = E.worldToScreen(g.w * g.tile, g.h * g.tile);
    return { a: a, b: b, w: E.state.css.w, h: E.state.css.h, zoom: E.state.view.zoom };
  });
  console.log('[driver] 全体表示リセット: 左上=(' + fitRes.a.x.toFixed(1) + ',' + fitRes.a.y.toFixed(1) +
              ') 右下=(' + fitRes.b.x.toFixed(1) + ',' + fitRes.b.y.toFixed(1) + ') canvas=' +
              fitRes.w + 'x' + fitRes.h + ' zoom=' + fitRes.zoom.toFixed(4));
  check('§1 10 「全体表示にリセット」でマップ全域が canvas 内に収まる',
        fitRes.a.x >= -1 && fitRes.a.y >= -1 && fitRes.b.x <= fitRes.w + 1 && fitRes.b.y <= fitRes.h + 1,
        '左上(' + fitRes.a.x.toFixed(1) + ',' + fitRes.a.y.toFixed(1) + ') 右下(' + fitRes.b.x.toFixed(1) + ',' + fitRes.b.y.toFixed(1) + ')');

  // ══════════════════════════════════════════════════════════════════════════
  // §2 矩形ツール (部屋・廊下の作成 / 選択 / 移動 / リサイズ / 削除 / role / スナップ)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n───── §2 矩形ツール (作成/移動/リサイズ/クランプ/role/スナップ/undo) ─────');
  const create = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon'); E.setAspectSnap(null);
    const before = E.getMapDef();
    const mdBefore = E.buildMapData();
    E.setTool('room');
    const okRoom = E.dragTile({ tx: 3, ty: 2 }, { tx: 9, ty: 6 });      // → rect [2,3,6,9]
    const afterRoom = E.getMapDef();
    E.setTool('corridor');
    const okCorr = E.dragTile({ tx: 12, ty: 22 }, { tx: 16, ty: 24 });  // → rect [22,12,24,16]
    const after = E.getMapDef();
    const mdAfter = E.state.mapData;
    return {
      okRoom, okCorr,
      roomsBefore: before.rooms.length, roomsAfter: afterRoom.rooms.length,
      corrBefore: before.corridors.length, corrAfter: after.corridors.length,
      newRoom: afterRoom.rooms[afterRoom.rooms.length - 1],
      newCorr: after.corridors[after.corridors.length - 1],
      ids: after.rooms.map(r => r.id),
      tileBefore: mdBefore[4][6], tileAfter: mdAfter[4][6],   // 新部屋 [2,3,6,9] の内側 (r4,c6)
      tool: E.state.tool, sel: E.getSelection(),
    };
  });
  console.log('[driver] 作成: rooms ' + create.roomsBefore + '→' + create.roomsAfter +
              ' / corridors ' + create.corrBefore + '→' + create.corrAfter +
              ' / 新部屋 id=' + create.newRoom.id + ' rect=' + JSON.stringify(create.newRoom.rect) +
              ' role=' + create.newRoom.role + ' / 新廊下 rect=' + JSON.stringify(create.newCorr));
  check('§2 2a 部屋を新規作成 → rooms.length が +1',
        create.roomsAfter === create.roomsBefore + 1, create.roomsBefore + '→' + create.roomsAfter);
  check('§2 2b rect がドラッグしたタイル範囲と完全一致 [r1,c1,r2,c2]=[2,3,6,9] (★行が先)',
        eq(create.newRoom.rect, [2, 3, 6, 9]), JSON.stringify(create.newRoom.rect));
  check('§2 2c 新部屋は role=null / enemySlots=[] / id が重複しない',
        create.newRoom.role === null && eq(create.newRoom.enemySlots, []) &&
        new Set(create.ids).size === create.ids.length,
        'id=' + create.newRoom.id + ' ids=' + JSON.stringify(create.ids));
  check('§2 3 廊下を新規作成 → corridors.length +1 / rect=[22,12,24,16]',
        create.corrAfter === create.corrBefore + 1 && eq(create.newCorr, [22, 12, 24, 16]),
        JSON.stringify(create.newCorr));
  check('§2 11 編集後に mapData が再生成されている (新部屋の内部タイルが 2 でなくなる)',
        create.tileBefore === 2 && create.tileAfter !== 2,
        '(r4,c6) ' + create.tileBefore + ' → ' + create.tileAfter);

  const move = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.setTool('select');
    const id = E.selectAt(6, 4);                       // 新部屋 [2,3,6,9] の内側
    const sel = E.getSelection();
    const r0 = E.getMapDef().rooms[sel.index].rect.slice();
    E.dragTile({ tx: 6, ty: 4 }, { tx: 10, ty: 7 });    // dtx=+4 dty=+3
    const r1 = E.getMapDef().rooms[sel.index].rect.slice();
    return { id, sel, r0, r1,
             w0: r0[3] - r0[1] + 1, h0: r0[2] - r0[0] + 1, w1: r1[3] - r1[1] + 1, h1: r1[2] - r1[0] + 1 };
  });
  console.log('[driver] 選択: selectAt(6,4) → "' + move.id + '"  ' + JSON.stringify(move.sel));
  console.log('[driver] 移動 (+4列,+3行): ' + JSON.stringify(move.r0) + ' → ' + JSON.stringify(move.r1) +
              '  幅×高さ ' + move.w0 + '×' + move.h0 + ' → ' + move.w1 + '×' + move.h1);
  check('§2 4a クリックで部屋を選択できる (識別子が返る)',
        move.id === 'room:2' && move.sel && move.sel.kind === 'room' && move.sel.index === 2, move.id);
  check('§2 4b 移動 → rect が期待どおりシフト [5,7,9,13]', eq(move.r1, [5, 7, 9, 13]), JSON.stringify(move.r1));
  check('§2 4c 移動で幅と高さが不変', move.w0 === move.w1 && move.h0 === move.h1,
        move.w0 + '×' + move.h0 + ' → ' + move.w1 + '×' + move.h1);
  check('§2 N1 負のコントロール: 移動 assert は期待値を1タイルずらすと不一致になる',
        !eq(move.r1, [5, 7, 9, 14]) && !eq(move.r1, [6, 7, 9, 13]),
        '実測=' + JSON.stringify(move.r1) + ' / ずらした期待値=[5,7,9,14],[6,7,9,13]');

  const resize = await page.evaluate(() => {
    const E = window.__mapEditor;
    const sel = E.getSelection();
    const r0 = E.getMapDef().rooms[sel.index].rect.slice();      // [5,7,9,13]
    E.dragTile({ tx: 13, ty: 9 }, { tx: 20, ty: 15 });           // SE 角を +7列 +6行
    const r1 = E.getMapDef().rooms[sel.index].rect.slice();
    E.dragTile({ tx: 20, ty: 15 }, { tx: 2, ty: 1 });            // SE 角を左上へ突き抜ける(反転)
    const r2 = E.getMapDef().rooms[sel.index].rect.slice();
    E.dragTile({ tx: 2, ty: 1 }, { tx: 7, ty: 5 });              // NW 角を SE 角まで潰す
    const r3 = E.getMapDef().rooms[sel.index].rect.slice();
    return { r0, r1, r2, r3 };
  });
  console.log('[driver] リサイズ SE角(+7,+6): ' + JSON.stringify(resize.r0) + ' → ' + JSON.stringify(resize.r1));
  console.log('[driver] 反転ドラッグ SE角→(2,1): ' + JSON.stringify(resize.r1) + ' → ' + JSON.stringify(resize.r2));
  console.log('[driver] NW角→SE角まで潰す: ' + JSON.stringify(resize.r2) + ' → ' + JSON.stringify(resize.r3));
  check('§2 5a 角ハンドルのリサイズが期待どおり [5,7,15,20]', eq(resize.r1, [5, 7, 15, 20]), JSON.stringify(resize.r1));
  check('§2 5b 反転ドラッグでも r1<=r2 / c1<=c2 が保たれる ([1,2,5,7] に正規化)',
        eq(resize.r2, [1, 2, 5, 7]) && resize.r2[0] <= resize.r2[2] && resize.r2[1] <= resize.r2[3],
        JSON.stringify(resize.r2));
  check('§2 5c 最小サイズ 1×1 を割らない',
        (resize.r3[2] - resize.r3[0] + 1) >= 1 && (resize.r3[3] - resize.r3[1] + 1) >= 1 &&
        resize.r3[0] <= resize.r3[2] && resize.r3[1] <= resize.r3[3],
        JSON.stringify(resize.r3) + ' = 幅' + (resize.r3[3] - resize.r3[1] + 1) + '×高さ' + (resize.r3[2] - resize.r3[0] + 1));

  const clampRes = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon'); E.setAspectSnap(null); E.setTool('room');
    E.dragTile({ tx: 2, ty: 1 }, { tx: 7, ty: 5 });     // [1,2,5,7] 幅6×高さ5
    E.setTool('select');
    const sel = E.getSelection();
    const r0 = E.getMapDef().rooms[sel.index].rect.slice();
    E.dragTile({ tx: 4, ty: 3 }, { tx: 200, ty: 200 }); // 右下へ大きくはみ出す移動
    const rSE = E.getMapDef().rooms[sel.index].rect.slice();
    E.dragTile({ tx: rSE[1] + 1, ty: rSE[0] + 1 }, { tx: -300, ty: -300 });  // 左上へはみ出す移動
    const rNW = E.getMapDef().rooms[sel.index].rect.slice();
    E.dragTile({ tx: rNW[3], ty: rNW[2] }, { tx: 999, ty: 999 });            // リサイズで外へ
    const rBig = E.getMapDef().rooms[sel.index].rect.slice();
    const g = E.state.mapDef.grid;
    const inRange = (q) => q[0] >= 0 && q[2] <= g.h - 1 && q[1] >= 0 && q[3] <= g.w - 1;
    return { r0, rSE, rNW, rBig, ok: inRange(rSE) && inRange(rNW) && inRange(rBig),
             wSE: rSE[3] - rSE[1] + 1, hSE: rSE[2] - rSE[0] + 1, wNW: rNW[3] - rNW[1] + 1, hNW: rNW[2] - rNW[0] + 1 };
  });
  console.log('[driver] クランプ: ' + JSON.stringify(clampRes.r0) + ' --(→200,200)--> ' + JSON.stringify(clampRes.rSE) +
              ' --(→-300,-300)--> ' + JSON.stringify(clampRes.rNW) +
              ' --(SE角→999,999)--> ' + JSON.stringify(clampRes.rBig));
  check('§2 6a マップ外へ移動しても 0..71 / 0..27 にクランプされる',
        clampRes.ok && eq(clampRes.rSE, [23, 66, 27, 71]) && eq(clampRes.rNW, [0, 0, 4, 5]),
        'SE=' + JSON.stringify(clampRes.rSE) + ' NW=' + JSON.stringify(clampRes.rNW));
  check('§2 6b クランプされても幅と高さは不変 (6×5)',
        clampRes.wSE === 6 && clampRes.hSE === 5 && clampRes.wNW === 6 && clampRes.hNW === 5,
        clampRes.wSE + '×' + clampRes.hSE + ' / ' + clampRes.wNW + '×' + clampRes.hNW);
  check('§2 6c リサイズでもマップ外へ出ない ([0,0,27,71] で頭打ち)',
        eq(clampRes.rBig, [0, 0, 27, 71]), JSON.stringify(clampRes.rBig));

  const delKey2 = await page.evaluate(() => ({
    n: window.__mapEditor.getMapDef().rooms.length, sel: window.__mapEditor.getSelection() }));
  await page.keyboard.press('Delete');
  const afterKey2 = await page.evaluate(() => ({
    n: window.__mapEditor.getMapDef().rooms.length, sel: window.__mapEditor.getSelection() }));
  console.log('[driver] 削除(Delete キー): rooms ' + delKey2.n + '→' + afterKey2.n +
              ' / selection ' + JSON.stringify(delKey2.sel) + '→' + JSON.stringify(afterKey2.sel));
  check('§2 7a Delete キーで削除 → rooms.length -1 / 選択解除',
        afterKey2.n === delKey2.n - 1 && afterKey2.sel === null, delKey2.n + '→' + afterKey2.n);

  const delBtn = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.setTool('room'); E.dragTile({ tx: 60, ty: 24 }, { tx: 64, ty: 26 });
    const n0 = E.getMapDef().rooms.length;
    E.setTool('select'); E.selectAt(62, 25);
    document.getElementById('btnDelete').click();
    return { n0, n1: E.getMapDef().rooms.length, sel: E.getSelection() };
  });
  console.log('[driver] 削除(「削除」ボタン): rooms ' + delBtn.n0 + '→' + delBtn.n1);
  check('§2 7b 「削除」ボタンでも削除できる', delBtn.n1 === delBtn.n0 - 1, delBtn.n0 + '→' + delBtn.n1);

  const roleRes = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const roles0 = E.getMapDef().rooms.map(r => r.role);
    E.setTool('select'); E.selectAt(30, 13);                 // r0 (山場)
    E.setRole('boss');                                       // 末尾の r1 から boss を奪う
    const d1 = E.getMapDef(), v1 = E.MapDef.validate(d1);
    E.selectAt(57, 13);                                      // r1 (ボス部屋)
    E.setRole('boss');                                       // 付け替え → r0 の boss が外れる
    const d2 = E.getMapDef(), v2 = E.MapDef.validate(d2);
    E.selectAt(30, 13); E.setRole('start');
    const d3 = E.getMapDef();
    const cnt = (d, role) => d.rooms.filter(r => r.role === role).length;
    return {
      roles0, roles1: d1.rooms.map(r => r.role), roles2: d2.rooms.map(r => r.role),
      roles3: d3.rooms.map(r => r.role),
      boss1: cnt(d1, 'boss'), boss2: cnt(d2, 'boss'), boss3: cnt(d3, 'boss'),
      start3: cnt(d3, 'start'), v1, v2, bossIdx: E.MapDef.bossRoomIdx(d3),
      roleSelVal: document.getElementById('roleSel').value,
      roleSelDisabled: document.getElementById('roleSel').disabled,
    };
  });
  console.log('[driver] role: 初期=' + JSON.stringify(roleRes.roles0) +
              ' → r0にboss=' + JSON.stringify(roleRes.roles1) +
              ' → r1にboss=' + JSON.stringify(roleRes.roles2) +
              ' → r0にstart=' + JSON.stringify(roleRes.roles3));
  console.log('[driver] boss 個数: ' + roleRes.boss1 + ' / ' + roleRes.boss2 + ' / ' + roleRes.boss3 +
              '   start 個数=' + roleRes.start3 + '  bossRoomIdx=' + roleRes.bossIdx);
  check('§2 8a boss を付け替えると前の部屋の boss が外れ、常にちょうど 1 つ',
        roleRes.boss1 === 1 && roleRes.boss2 === 1 && roleRes.boss3 === 1 &&
        eq(roleRes.roles1, ['boss', null]) && eq(roleRes.roles2, [null, 'boss']),
        JSON.stringify(roleRes.roles1) + ' / ' + JSON.stringify(roleRes.roles2));
  check('§2 8b start も全体でちょうど 1 つ / validate() が ok',
        roleRes.start3 === 1 && eq(roleRes.roles3, ['start', 'boss']) && roleRes.v1.ok && roleRes.v2.ok,
        JSON.stringify(roleRes.roles3) + ' validate=' + JSON.stringify(roleRes.v2.errors));
  check('§2 8c 選択中が部屋なら役割 <select> が有効になり現在値を映す',
        roleRes.roleSelDisabled === false && roleRes.roleSelVal === 'start',
        'disabled=' + roleRes.roleSelDisabled + ' value=' + roleRes.roleSelVal);

  const snap = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    E.setTool('room'); E.setAspectSnap('climax');
    E.dragTile({ tx: 5, ty: 3 }, { tx: 9, ty: 7 });     // ドラッグ幅は 5×5 だが 20×16 になるはず
    const a = E.getMapDef().rooms.slice(-1)[0].rect;
    E.setAspectSnap('boss');
    E.dragTile({ tx: 40, ty: 5 }, { tx: 41, ty: 6 });
    const b = E.getMapDef().rooms.slice(-1)[0].rect;
    // スナップしたままリサイズしてもサイズは固定
    E.setTool('select'); E.selectAt(b[1] + 1, b[0] + 1);
    E.dragTile({ tx: b[3], ty: b[2] }, { tx: b[3] + 5, ty: b[2] + 2 });
    const c = E.getMapDef().rooms.slice(-1)[0].rect;
    // マップ端で描いてもサイズを縮めず内側へずらす
    E.setTool('room'); E.setAspectSnap('climax');
    E.dragTile({ tx: 70, ty: 26 }, { tx: 70, ty: 26 });
    const d = E.getMapDef().rooms.slice(-1)[0].rect;
    E.setAspectSnap(null);
    const dim = (q) => ({ w: q[3] - q[1] + 1, h: q[2] - q[0] + 1 });
    return { a, b, c, d, da: dim(a), db: dim(b), dc: dim(c), dd: dim(d), snapNow: E.state.aspectSnap };
  });
  console.log('[driver] スナップ climax: rect=' + JSON.stringify(snap.a) + ' → 幅' + snap.da.w + '×高さ' + snap.da.h);
  console.log('[driver] スナップ boss  : rect=' + JSON.stringify(snap.b) + ' → 幅' + snap.db.w + '×高さ' + snap.db.h);
  console.log('[driver] スナップ中のリサイズ: rect=' + JSON.stringify(snap.c) + ' → 幅' + snap.dc.w + '×高さ' + snap.dc.h);
  console.log('[driver] マップ端で描く     : rect=' + JSON.stringify(snap.d) + ' → 幅' + snap.dd.w + '×高さ' + snap.dd.h);
  check('§2 9a 山場スナップ: 幅20×高さ16 かつ rect=[3,5,18,24] (★行が先)',
        snap.da.w === 20 && snap.da.h === 16 && eq(snap.a, [3, 5, 18, 24]),
        JSON.stringify(snap.a) + ' 幅' + snap.da.w + '×高さ' + snap.da.h);
  check('§2 9b ボススナップ: 幅22×高さ18 かつ rect=[5,40,22,61]',
        snap.db.w === 22 && snap.db.h === 18 && eq(snap.b, [5, 40, 22, 61]),
        JSON.stringify(snap.b) + ' 幅' + snap.db.w + '×高さ' + snap.db.h);
  check('§2 9c スナップ ON のリサイズはサイズ固定 (22×18 のまま)',
        snap.dc.w === 22 && snap.dc.h === 18, JSON.stringify(snap.c) + ' 幅' + snap.dc.w + '×高さ' + snap.dc.h);
  check('§2 9d マップ端で描いてもサイズを縮めず内側へ収める (20×16 / 右下端に接する)',
        snap.dd.w === 20 && snap.dd.h === 16 && eq(snap.d, [12, 52, 27, 71]),
        JSON.stringify(snap.d) + ' 幅' + snap.dd.w + '×高さ' + snap.dd.h);
  check('§2 N2 負のコントロール: 幅と高さを取り違えた期待値 (16×20 / 18×22) とは一致しない',
        !(snap.da.w === 16 && snap.da.h === 20) && !(snap.db.w === 18 && snap.db.h === 22),
        '実測 ' + snap.da.w + '×' + snap.da.h + ' / ' + snap.db.w + '×' + snap.db.h);

  const hist2 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon'); E.setAspectSnap(null);
    const s0 = JSON.stringify(E.getMapDef());
    E.setTool('room'); E.dragTile({ tx: 3, ty: 2 }, { tx: 9, ty: 6 });      // ① 作成
    const s1 = JSON.stringify(E.getMapDef());
    E.setTool('select'); E.selectAt(6, 4); E.dragTile({ tx: 6, ty: 4 }, { tx: 10, ty: 7 });  // ② 移動
    const s2 = JSON.stringify(E.getMapDef());
    E.setRole('boss');                                                       // ③ role
    const s3 = JSON.stringify(E.getMapDef());
    const u1 = E.undo(), a3 = JSON.stringify(E.getMapDef());   // → s2
    const u2 = E.undo(), a2 = JSON.stringify(E.getMapDef());   // → s1
    const u3 = E.undo(), a1 = JSON.stringify(E.getMapDef());   // → s0
    const tileAtS0 = E.state.mapData[4][6];                    // ← mapData も戻っているか
    const u4 = E.undo();                                       // これ以上戻れない
    const r1 = E.redo(), b1 = JSON.stringify(E.getMapDef());   // → s1
    const r2 = E.redo(), b2 = JSON.stringify(E.getMapDef());   // → s2
    const r3 = E.redo(), b3 = JSON.stringify(E.getMapDef());   // → s3
    const r4 = E.redo();                                       // これ以上進めない
    E.undo(); E.setTool('room'); E.dragTile({ tx: 50, ty: 24 }, { tx: 53, ty: 26 });
    const redoDropped = E.redo();                              // 新しい編集で redo は捨てられる
    return { u: [u1, u2, u3, u4], r: [r1, r2, r3, r4],
             backToS2: a3 === s2, backToS1: a2 === s1, backToS0: a1 === s0,
             fwdS1: b1 === s1, fwdS2: b2 === s2, fwdS3: b3 === s3,
             redoDropped, tileAtS0,
             btnUndoDisabled: document.getElementById('btnUndo').disabled,
             btnRedoDisabled: document.getElementById('btnRedo').disabled };
  });
  console.log('[driver] undo 戻り値=' + JSON.stringify(hist2.u) + '  redo 戻り値=' + JSON.stringify(hist2.r));
  console.log('[driver] undo一致: s2=' + hist2.backToS2 + ' s1=' + hist2.backToS1 + ' s0=' + hist2.backToS0 +
              ' / redo一致: s1=' + hist2.fwdS1 + ' s2=' + hist2.fwdS2 + ' s3=' + hist2.fwdS3 +
              ' / undo 後の mapData[4][6]=' + hist2.tileAtS0);
  check('§2 10a undo で直前の状態に正確に戻る (JSON.stringify 一致 / 3段)',
        hist2.backToS2 && hist2.backToS1 && hist2.backToS0 && eq(hist2.u, [true, true, true, false]),
        's2=' + hist2.backToS2 + ' s1=' + hist2.backToS1 + ' s0=' + hist2.backToS0 + ' 戻り値=' + JSON.stringify(hist2.u));
  check('§2 10b redo で戻し直せる (3段) / 端では false を返す',
        hist2.fwdS1 && hist2.fwdS2 && hist2.fwdS3 && eq(hist2.r, [true, true, true, false]),
        JSON.stringify(hist2.r));
  check('§2 10c 新しい編集をしたら redo は捨てられる', hist2.redoDropped === false, 'redo()=' + hist2.redoDropped);
  check('§2 10d undo でも mapData が再生成される (新部屋の内側が壁 2 に戻る)',
        hist2.tileAtS0 === 2, 'mapData[4][6]=' + hist2.tileAtS0);
  check('§2 10e undo/redo ボタンの活性状態が履歴に追従する',
        hist2.btnUndoDisabled === false && hist2.btnRedoDisabled === true,
        'undo.disabled=' + hist2.btnUndoDisabled + ' redo.disabled=' + hist2.btnRedoDisabled);

  const nc = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const d = E.getMapDef();
    d.rooms[0].rect = [-5, 60, 40, 200];              // ★クランプを迂回して直接注入
    const out = E.setMapDef(d);
    E.setTool('select'); E.selectAt(0, 0);
    const grabbedEmpty = E.dragTile({ tx: 1, ty: 1 }, { tx: 5, ty: 5 });     // 空き領域
    const grabbedOutside = E.dragTile({ tx: -9, ty: -9 }, { tx: 5, ty: 5 }); // マップ外
    return { rect: out.rooms[0].rect, grabbedEmpty, grabbedOutside, sel: E.getSelection() };
  });
  console.log('[driver] sanitize 注入 [-5,60,40,200] → ' + JSON.stringify(nc.rect) +
              '  空き領域 dragTile=' + nc.grabbedEmpty + ' マップ外 dragTile=' + nc.grabbedOutside);
  check('§2 N3 負のコントロール: クランプを迂回した rect も sanitize が [0,60,27,71] に正す',
        eq(nc.rect, [0, 60, 27, 71]), JSON.stringify(nc.rect));
  check('§2 N4 負のコントロール: 空き領域/マップ外では dragTile が false (パンへ委譲される経路)',
        nc.grabbedEmpty === false && nc.grabbedOutside === false && nc.sel === null,
        '空き=' + nc.grabbedEmpty + ' 外=' + nc.grabbedOutside);

  // ── 実マウスでの挙動 (パンと編集の分岐点の実証) ────────────────────────
  await page.evaluate(() => { window.__mapEditor.loadPreset('dungeon'); window.__mapEditor.setTool('select'); });
  const geom = await page.evaluate(() => {
    const E = window.__mapEditor, r = E.canvas.getBoundingClientRect(), t = E.state.mapDef.grid.tile;
    const at = (tx, ty) => { const p = E.worldToScreen(tx * t + t / 2, ty * t + t / 2);
                             return { x: r.left + p.x, y: r.top + p.y }; };
    return { empty: at(2, 2), emptyTo: at(6, 6), view: { x: E.state.view.x, y: E.state.view.y, z: E.state.view.zoom },
             rect0: E.state.mapDef.rooms[0].rect.slice() };
  });
  await page.mouse.move(geom.empty.x, geom.empty.y);
  await page.mouse.down();
  await page.mouse.move(geom.emptyTo.x, geom.emptyTo.y, { steps: 4 });
  await page.mouse.up();
  const panRes2 = await page.evaluate(() => ({ x: window.__mapEditor.state.view.x, y: window.__mapEditor.state.view.y,
                                               rect0: window.__mapEditor.state.mapDef.rooms[0].rect.slice(),
                                               sel: window.__mapEditor.getSelection() }));
  const panDx = panRes2.x - geom.view.x, panDy = panRes2.y - geom.view.y;
  console.log('[driver] 実マウス 空き領域ドラッグ: view (' + geom.view.x.toFixed(1) + ',' + geom.view.y.toFixed(1) +
              ') → (' + panRes2.x.toFixed(1) + ',' + panRes2.y.toFixed(1) + ')  Δ=(' + panDx.toFixed(1) + ',' + panDy.toFixed(1) + ')' +
              '  rooms[0]=' + JSON.stringify(panRes2.rect0));
  check('§2 12a 実マウス: 空き領域の左ドラッグはパン (view が動き、矩形は動かない)',
        Math.abs(panDx) > 5 && Math.abs(panDy) > 5 && eq(panRes2.rect0, geom.rect0) && panRes2.sel === null,
        'Δview=(' + panDx.toFixed(1) + ',' + panDy.toFixed(1) + ') rooms[0]=' + JSON.stringify(panRes2.rect0));

  const geom2 = await page.evaluate(() => {
    const E = window.__mapEditor, r = E.canvas.getBoundingClientRect(), t = E.state.mapDef.grid.tile;
    const at = (tx, ty) => { const p = E.worldToScreen(tx * t + t / 2, ty * t + t / 2);
                             return { x: r.left + p.x, y: r.top + p.y }; };
    return { from: at(30, 13), to: at(33, 15), view: { x: E.state.view.x, y: E.state.view.y },
             rect0: E.state.mapDef.rooms[0].rect.slice() };
  });
  await page.mouse.move(geom2.from.x, geom2.from.y);
  await page.mouse.down();
  await page.mouse.move(geom2.to.x, geom2.to.y, { steps: 6 });
  await page.mouse.up();
  const moveRes = await page.evaluate(() => ({ x: window.__mapEditor.state.view.x, y: window.__mapEditor.state.view.y,
                                               rect0: window.__mapEditor.state.mapDef.rooms[0].rect.slice(),
                                               sel: window.__mapEditor.getSelection() }));
  console.log('[driver] 実マウス 部屋上ドラッグ(+3列,+2行): rooms[0] ' + JSON.stringify(geom2.rect0) + ' → ' +
              JSON.stringify(moveRes.rect0) + '  view Δ=(' + (moveRes.x - geom2.view.x).toFixed(3) + ',' +
              (moveRes.y - geom2.view.y).toFixed(3) + ')  selection=' + JSON.stringify(moveRes.sel));
  const expMoved = [geom2.rect0[0] + 2, geom2.rect0[1] + 3, geom2.rect0[2] + 2, geom2.rect0[3] + 3];
  check('§2 12b 実マウス: 部屋の上の左ドラッグは部屋が動く (パンしない)',
        eq(moveRes.rect0, expMoved) && Math.abs(moveRes.x - geom2.view.x) < 0.001 &&
        Math.abs(moveRes.y - geom2.view.y) < 0.001 && moveRes.sel && moveRes.sel.index === 0,
        '実測=' + JSON.stringify(moveRes.rect0) + ' 期待=' + JSON.stringify(expMoved));

  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
  const undoKey = await page.evaluate(() => window.__mapEditor.state.mapDef.rooms[0].rect.slice());
  console.log('[driver] Ctrl+Z: rooms[0] → ' + JSON.stringify(undoKey));
  check('§2 12c Ctrl+Z で直前のマウス操作が取り消される', eq(undoKey, geom2.rect0),
        JSON.stringify(undoKey) + ' 期待=' + JSON.stringify(geom2.rect0));

  // ══════════════════════════════════════════════════════════════════════════
  // §3 スロット配置 (起点 / 敵 / ボス。★拒否理由が必ず返る = 無言の失敗を作らない)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n───── §3 スロット配置 (起点/敵/ボス・拒否理由・所属部屋の付け替え) ─────');
  const startRes = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const start0 = E.getMapDef().start;
    E.setTool('start');
    const p1 = E.placeSlot(30, 10);
    const s1 = E.getMapDef().start;
    const p2 = E.placeSlot(31, 11);            // 2回目 → 前の起点は残らない
    const s2 = E.getMapDef().start;
    const oldMarker = E.selectSlotAt(30, 10);  // 旧位置にマーカーが残っていないこと
    E.selectSlotAt(31, 11);
    const selKind = E.getSlotSelection();
    E.dragTile({ tx: 31, ty: 11 }, { tx: 35, ty: 12 });   // ドラッグで移動
    const s3 = E.getMapDef().start;
    const d = E.getMapDef();
    return { start0, p1, p2, s1, s2, s3, oldMarker, selKind,
             startKeys: Object.keys(d.start).sort(), reason: E.lastReason(),
             hudStart: document.getElementById('hudStart').textContent };
  });
  console.log('[driver] 起点: 初期=' + JSON.stringify(startRes.start0) + ' → placeSlot(30,10)=' + JSON.stringify(startRes.s1) +
              ' → placeSlot(31,11)=' + JSON.stringify(startRes.s2) + ' → drag(35,12)=' + JSON.stringify(startRes.s3));
  check('§3 2a 起点をクリック配置 → mapDef.start が {tx:30,ty:10} に一致',
        startRes.p1.ok === true && eq(startRes.s1, { tx: 30, ty: 10 }), JSON.stringify(startRes.s1) + ' ok=' + startRes.p1.ok);
  check('§3 2b 起点は常に 1 つ (2回目の配置で旧位置のマーカーが消える / start は単一オブジェクト)',
        eq(startRes.s2, { tx: 31, ty: 11 }) && startRes.oldMarker === null && eq(startRes.startKeys, ['tx', 'ty']),
        JSON.stringify(startRes.s2) + ' 旧位置=' + JSON.stringify(startRes.oldMarker));
  check('§3 2c ドラッグで起点が移動する / 選択種別が start',
        eq(startRes.s3, { tx: 35, ty: 12 }) && startRes.selKind && startRes.selKind.kind === 'start',
        JSON.stringify(startRes.s3) + ' sel=' + JSON.stringify(startRes.selKind));
  check('§3 2d 起点の配置は拒否理由を残さない (成功時 lastReason()===null)',
        startRes.reason === null, 'lastReason=' + JSON.stringify(startRes.reason));

  //   既定ダンジョン: rooms[0].rect=[7,24,20,43] / rooms[1].rect=[5,47,22,68] (行が先)
  const en = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    E.setTool('enemySlot');
    const n0 = E.getMapDef().rooms.map(r => r.enemySlots.length);
    const a = E.placeSlot(30, 10);                 // → rooms[0] (col30 row10)
    const b = E.placeSlot(50, 8);                  // → rooms[1] (col50 row8)  ★非対称な座標
    const d = E.getMapDef();
    const dup = E.placeSlot(30, 10);               // 同じタイルへの重複配置
    const dupSel = E.getSlotSelection();
    return { n0, a, b, dup, dupSel,
             r0: d.rooms[0].enemySlots.slice(), r1: d.rooms[1].enemySlots.slice(),
             n1: E.getMapDef().rooms.map(r => r.enemySlots.length),
             dupReason: E.lastReason() };
  });
  console.log('[driver] 敵スロット: enemySlots 個数 ' + JSON.stringify(en.n0) + ' → ' + JSON.stringify(en.n1));
  console.log('[driver]   placeSlot(30,10) → ' + JSON.stringify(en.a) + '   rooms[0] 末尾=' + JSON.stringify(en.r0.slice(-1)));
  console.log('[driver]   placeSlot(50, 8) → ' + JSON.stringify(en.b) + '   rooms[1]=' + JSON.stringify(en.r1));
  check('§3 3a 部屋0 の中に置くと rooms[0].enemySlots へ [30,10] (★列が先) が入る',
        en.a.ok === true && eq(en.r0.slice(-1)[0], [30, 10]) && en.n1[0] === en.n0[0] + 1 && en.a.ref === 'enemy:0:8',
        'ref=' + en.a.ref + ' 末尾=' + JSON.stringify(en.r0.slice(-1)[0]));
  check('§3 3b 部屋1 の中に置くと **rooms[1]** の方へ入る (所属部屋の判定が効いている)',
        en.b.ok === true && eq(en.r1, [[50, 8]]) && en.n1[0] === en.n0[0] + 1 && en.b.ref === 'enemy:1:0',
        'rooms[1]=' + JSON.stringify(en.r1) + ' ref=' + en.b.ref);
  check('§3 3c 同じタイルへの重複配置は拒否され、既存スロットが選択される',
        en.dup.ok === false && /既に/.test(en.dup.reason || '') && en.dupSel &&
        en.dupSel.kind === 'enemy' && en.dupSel.roomIndex === 0 && en.n1[0] === en.n0[0] + 1,
        '理由=' + JSON.stringify(en.dup.reason) + ' 選択=' + JSON.stringify(en.dupSel));
  check('§3 N1 負のコントロール: 座標が [ty,tx] (行が先) だったら不一致になる期待値と比較',
        !eq(en.r1, [[8, 50]]) && eq(en.r1, [[50, 8]]),
        '実測 rooms[1]=' + JSON.stringify(en.r1) + ' / 行が先なら [[8,50]]');

  const rej = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon'); E.setTool('enemySlot');
    const total0 = E.getMapDef().rooms.reduce((s, r) => s + r.enemySlots.length, 0);
    const corr = E.placeSlot(45, 14);            // corridors[0]=[13,43,15,47] の中 = どの部屋でもない
    const corrReason = E.lastReason();
    const corrHud = document.getElementById('hudMsg').textContent;
    const rock = E.placeSlot(2, 2);              // 岩盤 (部屋にも廊下にも属さない)
    const rockReason = E.lastReason();
    const outside = E.placeSlot(999, 999);       // マップ外
    const outsideReason = E.lastReason();
    const total1 = E.getMapDef().rooms.reduce((s, r) => s + r.enemySlots.length, 0);
    // 廊下タイルがどの部屋にも属していないことの裏取り (assert の前提が本当か)
    const rooms = E.getMapDef().rooms;
    const inAnyRoom = (tx, ty) => rooms.some(r => ty >= r.rect[0] && ty <= r.rect[2] && tx >= r.rect[1] && tx <= r.rect[3]);
    return { corr, corrReason, corrHud, rock, rockReason, outside, outsideReason, total0, total1,
             corrInRoom: inAnyRoom(45, 14), rockInRoom: inAnyRoom(2, 2),
             corrTileVal: E.state.mapData[14][45], rockTileVal: E.state.mapData[2][2] };
  });
  console.log('[driver] 拒否: 廊下(45,14) → ' + JSON.stringify(rej.corr) + '  lastReason=' + JSON.stringify(rej.corrReason));
  console.log('[driver]       岩盤(2,2)   → ' + JSON.stringify(rej.rock) + '  lastReason=' + JSON.stringify(rej.rockReason));
  console.log('[driver]       マップ外    → ' + JSON.stringify(rej.outside) + '  lastReason=' + JSON.stringify(rej.outsideReason));
  console.log('[driver]   前提: (45,14) は部屋内か=' + rej.corrInRoom + ' タイル値=' + rej.corrTileVal +
              ' / (2,2) は部屋内か=' + rej.rockInRoom + ' タイル値=' + rej.rockTileVal +
              ' / enemySlots 総数 ' + rej.total0 + '→' + rej.total1);
  check('§3 4a 廊下タイルへの敵スロット配置は拒否され、理由が返る (無言で失敗していない)',
        rej.corr.ok === false && typeof rej.corr.reason === 'string' && rej.corr.reason.length > 0 &&
        rej.corrReason === rej.corr.reason && /部屋の中にのみ/.test(rej.corrReason),
        'ok=' + rej.corr.ok + ' reason=' + JSON.stringify(rej.corrReason));
  check('§3 4b 岩盤タイルも同様に拒否 + 理由 / マップ外も拒否 + 理由',
        rej.rock.ok === false && /部屋の中にのみ/.test(rej.rockReason || '') &&
        rej.outside.ok === false && /マップの外/.test(rej.outsideReason || ''),
        '岩盤=' + JSON.stringify(rej.rockReason) + ' 外=' + JSON.stringify(rej.outsideReason));
  check('§3 4c 拒否されたら enemySlots は 1 つも増えない / 理由が HUD にも出ている',
        rej.total1 === rej.total0 && /部屋の中にのみ/.test(rej.corrHud),
        '総数 ' + rej.total0 + '→' + rej.total1 + ' HUD=' + JSON.stringify(rej.corrHud));

  const nob = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const d = E.getMapDef();
    d.rooms.forEach(r => { r.role = null; r.bossSlot = null; });   // ボス部屋も既存 bossSlot も消す
    E.setMapDef(d);
    E.setTool('bossSlot');
    const r = E.placeSlot(57, 13);                                  // 元のボススロット位置
    const after = E.getMapDef();
    return { r, reason: E.lastReason(),
             roles: after.rooms.map(x => x.role),
             bossSlots: after.rooms.map(x => x.bossSlot),
             nBoss: after.rooms.filter(x => x.bossSlot).length,
             hud: document.getElementById('hudMsg').textContent };
  });
  console.log('[driver] ボス部屋なし: roles=' + JSON.stringify(nob.roles) + ' → placeSlot(57,13)=' + JSON.stringify(nob.r));
  check('§3 5a boss 部屋が無ければボススロットは置けず、理由が返る',
        nob.r.ok === false && /ボス部屋がありません/.test(nob.r.reason || '') && nob.reason === nob.r.reason,
        'ok=' + nob.r.ok + ' reason=' + JSON.stringify(nob.r.reason));
  check('§3 5b 拒否時に bossSlot はどの部屋にも書かれていない',
        nob.nBoss === 0 && nob.bossSlots.every(b => b === null),
        JSON.stringify(nob.bossSlots));

  const bs = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');                       // rooms[1] が role:"boss" / bossSlot=[57,13]
    E.setTool('bossSlot');
    const before = E.getMapDef().rooms.map(r => r.bossSlot);
    const a = E.placeSlot(60, 10);                 // rooms[1] の中
    const d1 = E.getMapDef();
    const oldMarker = E.selectSlotAt(57, 13);      // 旧位置は消えているか
    const outside = E.placeSlot(30, 10);           // rooms[0] (ボス部屋ではない) の中
    const outsideReason = E.lastReason();
    const d2 = E.getMapDef();
    // ボス役割を rooms[0] へ移してから置くと、rooms[1] 側の bossSlot は消える
    E.setTool('select'); E.selectAt(30, 10); E.setRole('boss');
    E.setTool('bossSlot');
    const moved = E.placeSlot(30, 11);
    const d3 = E.getMapDef();
    return { before, a, oldMarker, outside, outsideReason, moved,
             b1: d1.rooms.map(r => r.bossSlot), n1: d1.rooms.filter(r => r.bossSlot).length,
             b2: d2.rooms.map(r => r.bossSlot),
             b3: d3.rooms.map(r => r.bossSlot), n3: d3.rooms.filter(r => r.bossSlot).length,
             bossIdx3: E.MapDef.bossRoomIdx(d3) };
  });
  console.log('[driver] ボススロット: 初期=' + JSON.stringify(bs.before) + ' → placeSlot(60,10)=' + JSON.stringify(bs.a) +
              ' → ' + JSON.stringify(bs.b1) + '  旧位置=' + JSON.stringify(bs.oldMarker));
  console.log('[driver]   ボス部屋の外(30,10) → ' + JSON.stringify(bs.outside) + '  bossSlots=' + JSON.stringify(bs.b2));
  console.log('[driver]   ボス役割を rooms[0] へ移して placeSlot(30,11) → ' + JSON.stringify(bs.b3) +
              '  bossRoomIdx=' + bs.bossIdx3);
  check('§3 6a boss 部屋の中に置くと rooms[bossIdx].bossSlot = [60,10] (列が先)',
        bs.a.ok === true && bs.a.ref === 'boss' && eq(bs.b1[1], [60, 10]) && bs.b1[0] === null,
        JSON.stringify(bs.b1));
  check('§3 6b ボススロットはマップに 1 つ (旧位置のマーカーが消える / 非 null は 1 個)',
        bs.n1 === 1 && bs.oldMarker === null, 'n=' + bs.n1 + ' 旧位置=' + JSON.stringify(bs.oldMarker));
  check('§3 6c ボス部屋の外は拒否 + 理由 / bossSlot は書き換わらない',
        bs.outside.ok === false && /ボス部屋の中にのみ/.test(bs.outsideReason || '') && eq(bs.b2, bs.b1),
        '理由=' + JSON.stringify(bs.outsideReason) + ' bossSlots=' + JSON.stringify(bs.b2));
  check('§3 6d ボス役割を別部屋へ移して置くと、前の部屋の bossSlot が外れて 1 つに保たれる',
        bs.moved.ok === true && bs.n3 === 1 && eq(bs.b3[0], [30, 11]) && bs.b3[1] === null && bs.bossIdx3 === 0,
        JSON.stringify(bs.b3) + ' n=' + bs.n3);

  const mv = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon'); E.setTool('enemySlot');
    E.placeSlot(30, 10);                                   // rooms[0] の 9個目 (index 8)
    const selId = E.selectSlotAt(30, 10);
    const sel0 = E.getSlotSelection();
    const m1 = E.moveSlot(32, 11);                         // 同じ部屋の中で移動
    const d1 = E.getMapDef();
    const m2 = E.moveSlot(50, 8);                          // ★rooms[1] へ移す = 所属も移る
    const d2 = E.getMapDef();
    const sel2 = E.getSlotSelection();
    const m3 = E.moveSlot(45, 14);                         // 廊下 = 部屋の外 → 拒否
    const d3 = E.getMapDef();
    const m3Reason = E.lastReason();
    E.dragTile({ tx: 50, ty: 8 }, { tx: 52, ty: 9 });       // ドラッグでも動く
    const d4 = E.getMapDef();
    return { selId, sel0, m1, m2, m3, m3Reason, sel2,
             r0a: d1.rooms[0].enemySlots.slice(-1)[0], n0a: d1.rooms[0].enemySlots.length,
             n0b: d2.rooms[0].enemySlots.length, r1b: d2.rooms[1].enemySlots.slice(),
             n0c: d3.rooms[0].enemySlots.length, r1c: d3.rooms[1].enemySlots.slice(),
             r1d: d4.rooms[1].enemySlots.slice() };
  });
  console.log('[driver] 移動: selectSlotAt(30,10)="' + mv.selId + '" ' + JSON.stringify(mv.sel0));
  console.log('[driver]   同部屋 moveSlot(32,11)=' + JSON.stringify(mv.m1) + ' → rooms[0] 末尾=' + JSON.stringify(mv.r0a));
  console.log('[driver]   別部屋 moveSlot(50, 8)=' + JSON.stringify(mv.m2) + ' → rooms[0] 個数=' + mv.n0b +
              ' rooms[1]=' + JSON.stringify(mv.r1b) + ' 選択=' + JSON.stringify(mv.sel2));
  console.log('[driver]   部屋外 moveSlot(45,14)=' + JSON.stringify(mv.m3) + '  lastReason=' + JSON.stringify(mv.m3Reason));
  console.log('[driver]   ドラッグ (50,8)→(52,9): rooms[1]=' + JSON.stringify(mv.r1d));
  check('§3 7a スロットを選択できる (識別子 "enemy:0:8")',
        mv.selId === 'enemy:0:8' && mv.sel0 && mv.sel0.kind === 'enemy' &&
        mv.sel0.roomIndex === 0 && mv.sel0.slotIndex === 8,
        mv.selId + ' ' + JSON.stringify(mv.sel0));
  check('§3 7b 同じ部屋の中の移動で座標が更新される ([32,11])',
        mv.m1.ok === true && eq(mv.r0a, [32, 11]) && mv.n0a === 9, JSON.stringify(mv.r0a));
  check('§3 7c ★別の部屋へ移すと enemySlots の所属が移る (rooms[0] から抜けて rooms[1] へ)',
        mv.m2.ok === true && mv.n0b === 8 && eq(mv.r1b, [[50, 8]]) &&
        mv.sel2 && mv.sel2.roomIndex === 1 && mv.sel2.slotIndex === 0,
        'rooms[0] 個数=' + mv.n0b + ' rooms[1]=' + JSON.stringify(mv.r1b) + ' 選択=' + JSON.stringify(mv.sel2));
  check('§3 7d 部屋の外へは出せない (拒否 + 理由 / 座標は直前のまま)',
        mv.m3.ok === false && /部屋の中にのみ/.test(mv.m3Reason || '') && eq(mv.r1c, [[50, 8]]) && mv.n0c === 8,
        '理由=' + JSON.stringify(mv.m3Reason) + ' rooms[1]=' + JSON.stringify(mv.r1c));
  check('§3 7e ドラッグ (dragTile) でも移動できる ([52,9])',
        eq(mv.r1d, [[52, 9]]), JSON.stringify(mv.r1d));

  const delSlot = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon'); E.setTool('enemySlot');
    E.placeSlot(30, 10);
    const n0 = E.getMapDef().rooms[0].enemySlots.length;
    E.selectSlotAt(30, 10);
    const okEnemy = E.deleteSlot();
    const n1 = E.getMapDef().rooms[0].enemySlots.length;
    const gone = E.selectSlotAt(30, 10);
    const selAfter = E.getSlotSelection();
    // ボススロット
    const bossId = E.selectSlotAt(57, 13);
    const okBoss = E.deleteSlot();
    const b1 = E.getMapDef().rooms.map(r => r.bossSlot);
    // 起点は削除できない
    const startId = E.selectSlotAt(24, 13);
    const okStart = E.deleteSlot();
    const startReason = E.lastReason();
    const st1 = E.getMapDef().start;
    // 「削除」ボタンでも消える
    E.setTool('enemySlot'); E.placeSlot(31, 10); E.selectSlotAt(31, 10);
    document.getElementById('btnDelete').click();
    const n2 = E.getMapDef().rooms[0].enemySlots.length;
    return { n0, okEnemy, n1, gone, selAfter, bossId, okBoss, b1, startId, okStart, startReason, st1, n2 };
  });
  console.log('[driver] 削除: 敵 個数 ' + delSlot.n0 + '→' + delSlot.n1 + ' (deleteSlot=' + delSlot.okEnemy +
              ')  「削除」ボタン後=' + delSlot.n2);
  console.log('[driver]   ボス "' + delSlot.bossId + '" 削除=' + delSlot.okBoss + ' → bossSlots=' + JSON.stringify(delSlot.b1));
  console.log('[driver]   起点 "' + delSlot.startId + '" 削除=' + delSlot.okStart + ' 理由=' + JSON.stringify(delSlot.startReason));
  check('§3 8a 敵スロットを削除すると配列から消える / 選択も外れる',
        delSlot.okEnemy === true && delSlot.n1 === delSlot.n0 - 1 && delSlot.gone === null && delSlot.selAfter === null,
        delSlot.n0 + '→' + delSlot.n1);
  check('§3 8b ボススロットを削除すると null になる (識別子は "boss")',
        delSlot.bossId === 'boss' && delSlot.okBoss === true && delSlot.b1.every(b => b === null), JSON.stringify(delSlot.b1));
  check('§3 8c 起点は削除できず理由が出る (識別子は "start" / start は不変)',
        delSlot.startId === 'start' && delSlot.okStart === false && /起点は削除できません/.test(delSlot.startReason || '') &&
        eq(delSlot.st1, { tx: 24, ty: 13 }),
        '理由=' + JSON.stringify(delSlot.startReason) + ' start=' + JSON.stringify(delSlot.st1));
  check('§3 8d 「削除」ボタンでもスロットが消える', delSlot.n2 === delSlot.n1, delSlot.n1 + '→' + delSlot.n2);

  const hist3 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const s0 = JSON.stringify(E.getMapDef());
    E.setTool('start'); E.placeSlot(30, 12);                     // ① 起点
    const s1 = JSON.stringify(E.getMapDef());
    E.setTool('enemySlot'); E.placeSlot(31, 10);                 // ② 敵スロット配置
    const s2 = JSON.stringify(E.getMapDef());
    E.selectSlotAt(31, 10); E.moveSlot(50, 8);                   // ③ 別部屋へ移動
    const s3 = JSON.stringify(E.getMapDef());
    E.deleteSlot();                                              // ④ 削除
    const s4 = JSON.stringify(E.getMapDef());
    E.setTool('bossSlot'); E.placeSlot(60, 10);                  // ⑤ ボススロット
    const s5 = JSON.stringify(E.getMapDef());
    const u = [], b = [];
    for (let i = 0; i < 5; i++) { u.push(E.undo()); b.push(JSON.stringify(E.getMapDef())); }
    const uEnd = E.undo();
    const r = [], f = [];
    for (let i = 0; i < 5; i++) { r.push(E.redo()); f.push(JSON.stringify(E.getMapDef())); }
    const rEnd = E.redo();
    return { u, r, uEnd, rEnd,
             back: [b[0] === s4, b[1] === s3, b[2] === s2, b[3] === s1, b[4] === s0],
             fwd:  [f[0] === s1, f[1] === s2, f[2] === s3, f[3] === s4, f[4] === s5],
             // ⚠ s1 === s4 になるのは正しい (②配置 → ③移動 → ④削除 でちょうど元へ戻るため)。
             //   「全部違う」を assert すると実装が正しいほど落ちる。見るべきは**隣接遷移**。
             adj: [s0 !== s1, s1 !== s2, s2 !== s3, s3 !== s4, s4 !== s5],
             s0ne5: s0 !== s5 };
  });
  console.log('[driver] undo/redo(スロット): undo 戻り値=' + JSON.stringify(hist3.u) + ' (端=' + hist3.uEnd + ')');
  console.log('[driver]   undo 一致 [s4,s3,s2,s1,s0]=' + JSON.stringify(hist3.back));
  console.log('[driver]   redo 一致 [s1,s2,s3,s4,s5]=' + JSON.stringify(hist3.fwd) + ' (端=' + hist3.rEnd + ')');
  check('§3 9a undo が 起点/配置/移動/削除/ボス の 5 段すべてに効く (JSON 完全一致)',
        hist3.back.every(Boolean) && eq(hist3.u, [true, true, true, true, true]) && hist3.uEnd === false,
        JSON.stringify(hist3.back) + ' 戻り値=' + JSON.stringify(hist3.u));
  check('§3 9b redo で 5 段すべて戻し直せる',
        hist3.fwd.every(Boolean) && eq(hist3.r, [true, true, true, true, true]) && hist3.rEnd === false,
        JSON.stringify(hist3.fwd) + ' 戻り値=' + JSON.stringify(hist3.r));
  check('§3 N2 負のコントロール: 5 つの隣接遷移がすべて別状態 = 同じ物を比べて PASS していない',
        hist3.adj.every(Boolean) && hist3.s0ne5,
        '隣接=' + JSON.stringify(hist3.adj) + ' s0≠s5=' + hist3.s0ne5 +
        '  ※s1===s4 は「配置→移動→削除で元へ戻る」正しい帰結なので全体の一意性は見ない');

  // ── 実マウス ────────────────────────────────────────────────────────────
  await page.evaluate(() => { const E = window.__mapEditor; E.loadPreset('dungeon'); E.setTool('enemySlot'); });
  const g1 = await page.evaluate(() => {
    const E = window.__mapEditor, r = E.canvas.getBoundingClientRect(), t = E.state.mapDef.grid.tile;
    const at = (tx, ty) => { const p = E.worldToScreen(tx * t + t / 2, ty * t + t / 2);
                             return { x: r.left + p.x, y: r.top + p.y }; };
    return { inRoom: at(33, 12), moveTo: at(35, 15), rock: at(2, 2), rockTo: at(6, 6),
             view: { x: E.state.view.x, y: E.state.view.y },
             n0: E.state.mapDef.rooms[0].enemySlots.length };
  });
  await page.mouse.click(g1.inRoom.x, g1.inRoom.y);
  const clickRes = await page.evaluate(() => {
    const E = window.__mapEditor;
    return { n: E.state.mapDef.rooms[0].enemySlots.length,
             last: E.state.mapDef.rooms[0].enemySlots.slice(-1)[0],
             sel: E.getSlotSelection() };
  });
  console.log('[driver] 実マウス クリック配置 (33,12): 個数 ' + g1.n0 + '→' + clickRes.n +
              ' 末尾=' + JSON.stringify(clickRes.last));
  check('§3 12a 実マウス: 部屋内クリックで敵スロットが置かれる',
        clickRes.n === g1.n0 + 1 && eq(clickRes.last, [33, 12]) && clickRes.sel && clickRes.sel.kind === 'enemy',
        JSON.stringify(clickRes.last));

  await page.mouse.move(g1.inRoom.x, g1.inRoom.y);
  await page.mouse.down();
  await page.mouse.move(g1.moveTo.x, g1.moveTo.y, { steps: 6 });
  await page.mouse.up();
  const dragRes = await page.evaluate(() => {
    const E = window.__mapEditor;
    return { last: E.state.mapDef.rooms[0].enemySlots.slice(-1)[0],
             n: E.state.mapDef.rooms[0].enemySlots.length,
             view: { x: E.state.view.x, y: E.state.view.y } };
  });
  console.log('[driver] 実マウス スロットドラッグ (33,12)→(35,15): 末尾=' + JSON.stringify(dragRes.last) +
              ' 個数=' + dragRes.n);
  check('§3 12b 実マウス: 既存スロットをドラッグすると移動する (パンしない・増えない)',
        eq(dragRes.last, [35, 15]) && dragRes.n === g1.n0 + 1 &&
        Math.abs(dragRes.view.x - g1.view.x) < 0.001 && Math.abs(dragRes.view.y - g1.view.y) < 0.001,
        JSON.stringify(dragRes.last));

  await page.mouse.move(g1.rock.x, g1.rock.y);
  await page.mouse.down();
  await page.mouse.move(g1.rockTo.x, g1.rockTo.y, { steps: 4 });
  await page.mouse.up();
  const panRes3 = await page.evaluate(() => {
    const E = window.__mapEditor;
    return { view: { x: E.state.view.x, y: E.state.view.y },
             n: E.state.mapDef.rooms.reduce((s, r) => s + r.enemySlots.length, 0),
             reason: E.lastReason(), hud: document.getElementById('hudMsg').textContent };
  });
  console.log('[driver] 実マウス 岩盤ドラッグ: view Δ=(' + (panRes3.view.x - dragRes.view.x).toFixed(1) + ',' +
              (panRes3.view.y - dragRes.view.y).toFixed(1) + ')  理由=' + JSON.stringify(panRes3.reason));
  check('§3 12c 実マウス: 岩盤では配置されずパンへ委譲 (理由は HUD に残るので無言ではない)',
        Math.abs(panRes3.view.x - dragRes.view.x) > 5 && Math.abs(panRes3.view.y - dragRes.view.y) > 5 &&
        /部屋の中にのみ/.test(panRes3.reason || '') && /部屋の中にのみ/.test(panRes3.hud),
        'Δview=(' + (panRes3.view.x - dragRes.view.x).toFixed(1) + ',' + (panRes3.view.y - dragRes.view.y).toFixed(1) + ')');

  await page.keyboard.press('Delete');
  const delKey3 = await page.evaluate(() => ({
    n: window.__mapEditor.state.mapDef.rooms[0].enemySlots.length,
    rooms: window.__mapEditor.state.mapDef.rooms.length }));
  console.log('[driver] Delete キー: enemySlots 個数=' + delKey3.n + ' (rooms=' + delKey3.rooms + ')');
  check('§3 12d Delete キーは選択中スロットを消す (部屋は消さない)',
        delKey3.n === g1.n0 && delKey3.rooms === 2, '個数=' + delKey3.n + ' rooms=' + delKey3.rooms);

  // ══════════════════════════════════════════════════════════════════════════
  // §4 入出力 (★往復同一性 / プリセットの実値 / localStorage / 拒否 / PNG)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n───── §4 入出力 (★往復同一性 / プリセット実値 / localStorage / PNG) ─────');
  const pre = await page.evaluate(() => {
    const E = window.__mapEditor;
    const snap = (key) => {
      E.loadPreset(key);
      const d = E.getMapDef();
      return { d: d,
               rects: d.rooms.map(r => r.rect),
               roles: d.rooms.map(r => r.role),
               slotsPerRoom: d.rooms.map(r => r.enemySlots),
               bossPerRoom: d.rooms.map(r => r.bossSlot),
               slotsOf: E.MapDef.slotsOf(d),
               bossIdx: E.MapDef.bossRoomIdx(d),
               objective: E.MapDef.objectiveCount(d),
               validate: E.MapDef.validate(d) };
    };
    return { dungeon: snap('dungeon'), field: snap('field') };
  });
  console.log('[driver] dungeon rects=' + JSON.stringify(pre.dungeon.rects) + ' roles=' + JSON.stringify(pre.dungeon.roles));
  console.log('[driver] dungeon corridors=' + JSON.stringify(pre.dungeon.d.corridors) + ' start=' + JSON.stringify(pre.dungeon.d.start) +
              ' theme=' + pre.dungeon.d.themeId + ' bandMask=' + pre.dungeon.d.flags.bandMask);
  console.log('[driver] field   rects=' + JSON.stringify(pre.field.rects) + ' roles=' + JSON.stringify(pre.field.roles));
  console.log('[driver] field   corridors=' + JSON.stringify(pre.field.d.corridors) + ' start=' + JSON.stringify(pre.field.d.start) +
              ' theme=' + pre.field.d.themeId + ' bandMask=' + pre.field.d.flags.bandMask);
  console.log('[driver] dungeon slotsOf=' + JSON.stringify(pre.dungeon.slotsOf));
  console.log('[driver] field   slotsOf=' + JSON.stringify(pre.field.slotsOf));

  check('§4 3a ダンジョン: rooms[].rect が index.html FALLBACK_ROOMS_DUNGEON (救命ボート) と一致',
        eq(pre.dungeon.rects, live.roomsDungeon), JSON.stringify(pre.dungeon.rects) + ' vs ' + JSON.stringify(live.roomsDungeon));
  check('§4 3b ダンジョン: corridors が index.html CORRIDORS(非屋外) と一致',
        eq(pre.dungeon.d.corridors, live.corrDungeon), JSON.stringify(pre.dungeon.d.corridors) + ' vs ' + JSON.stringify(live.corrDungeon));
  check('§4 3c ダンジョン: start が index.html の (24,13) と一致',
        eq(pre.dungeon.d.start, live.startDungeon), JSON.stringify(pre.dungeon.d.start) + ' vs ' + JSON.stringify(live.startDungeon));
  check('§4 3d ダンジョン: role が rooms[0]=start / rooms[1]=boss / bossRoomIdx=末尾',
        eq(pre.dungeon.roles, ['start', 'boss']) && pre.dungeon.bossIdx === 1,
        JSON.stringify(pre.dungeon.roles) + ' bossIdx=' + pre.dungeon.bossIdx);
  check('§4 3e ダンジョン: slotsOf() が tavern.html ROOM_SLOTS 8個 + BOSS_SLOT と一致',
        eq(pre.dungeon.slotsOf.roomSlots, live.roomSlots) && eq(pre.dungeon.slotsOf.bossSlot, live.bossSlot),
        JSON.stringify(pre.dungeon.slotsOf));
  check('§4 3f ダンジョン: 8個の敵スロットは **rooms[0](山場)** に属し、bossSlot は rooms[1] だけが持つ',
        pre.dungeon.slotsPerRoom[0].length === 8 && pre.dungeon.slotsPerRoom[1].length === 0 &&
        pre.dungeon.bossPerRoom[0] === null && eq(pre.dungeon.bossPerRoom[1], live.bossSlot),
        '個数=' + JSON.stringify(pre.dungeon.slotsPerRoom.map(s => s.length)) + ' boss=' + JSON.stringify(pre.dungeon.bossPerRoom));
  check('§4 3g ダンジョン: themeId=goblin-mine / bandMask=false',
        pre.dungeon.d.themeId === 'goblin-mine' && pre.dungeon.d.flags.bandMask === false,
        pre.dungeon.d.themeId + ' / ' + pre.dungeon.d.flags.bandMask);
  check('§4 3h 屋外: rooms[].rect が index.html FALLBACK_ROOMS_FIELD (救命ボート) と一致 (3部屋)',
        eq(pre.field.rects, live.roomsField), JSON.stringify(pre.field.rects) + ' vs ' + JSON.stringify(live.roomsField));
  check('§4 3i 屋外: corridors が index.html CORRIDORS(屋外) と一致 (2本)',
        eq(pre.field.d.corridors, live.corrField), JSON.stringify(pre.field.d.corridors) + ' vs ' + JSON.stringify(live.corrField));
  check('§4 3j 屋外: start が index.html の (6,13) と一致',
        eq(pre.field.d.start, live.startField), JSON.stringify(pre.field.d.start) + ' vs ' + JSON.stringify(live.startField));
  check('§4 3k 屋外: role が rooms[0]=start / rooms[1]=null / rooms[2]=boss / bossRoomIdx=2',
        eq(pre.field.roles, ['start', null, 'boss']) && pre.field.bossIdx === 2,
        JSON.stringify(pre.field.roles) + ' bossIdx=' + pre.field.bossIdx);
  check('§4 3l 屋外: 敵スロット 8個は **rooms[1](山場 col24-43)** に属する (tavern の ROOM_SLOTS と同一)',
        pre.field.slotsPerRoom[0].length === 0 && pre.field.slotsPerRoom[1].length === 8 &&
        pre.field.slotsPerRoom[2].length === 0 && eq(pre.field.slotsPerRoom[1], live.roomSlots),
        '個数=' + JSON.stringify(pre.field.slotsPerRoom.map(s => s.length)));
  check('§4 3m 屋外: slotsOf() が ROOM_SLOTS 8個 + BOSS_SLOT と一致 / themeId=caravan-road / bandMask=true',
        eq(pre.field.slotsOf.roomSlots, live.roomSlots) && eq(pre.field.slotsOf.bossSlot, live.bossSlot) &&
        pre.field.d.themeId === 'caravan-road' && pre.field.d.flags.bandMask === true,
        JSON.stringify(pre.field.slotsOf) + ' ' + pre.field.d.themeId + ' bandMask=' + pre.field.d.flags.bandMask);
  check('§4 3n 敵/ボススロットは全部その所属部屋の rect の中にある (列が先/行が先の取り違え検出)',
        (() => {
          const inside = (rect, s) => s[1] >= rect[0] && s[1] <= rect[2] && s[0] >= rect[1] && s[0] <= rect[3];
          const okD = pre.dungeon.slotsPerRoom.every((ss, i) => ss.every(s => inside(pre.dungeon.rects[i], s)));
          const okF = pre.field.slotsPerRoom.every((ss, i) => ss.every(s => inside(pre.field.rects[i], s)));
          const okB = inside(pre.dungeon.rects[1], pre.dungeon.bossPerRoom[1]) && inside(pre.field.rects[2], pre.field.bossPerRoom[2]);
          return okD && okF && okB;
        })(), 'rect は [r1,c1,r2,c2] / スロットは [tx,ty]');
  check('§4 4 validate() がプリセット 2 種で ok',
        pre.dungeon.validate.ok === true && pre.field.validate.ok === true,
        'dungeon=' + JSON.stringify(pre.dungeon.validate.errors) + ' field=' + JSON.stringify(pre.field.validate.errors));

  /* ── ★往復同一性 ────────────────────────────────────────────────────────
   * 計画書の要求: プリセット読込 → JSON 出力 → validate 通過 → DEFAULT_* と deep-equal。
   * ⚠ exportJSON → **別プリセットへ切り替えて状態を汚してから** → importJSON する。
   *   汚さずに import すると「import が何もしなくても PASS」になる (空振り)。 */
  const round = await page.evaluate(() => {
    const E = window.__mapEditor;
    const trip = (key, other) => {
      E.loadPreset(key);
      const before = JSON.stringify(E.getMapDef());
      const json = E.exportJSON();
      let parsed = null, parseErr = null;
      try { parsed = JSON.parse(json); } catch (e) { parseErr = String((e && e.message) || e); }
      const v = parsed ? E.MapDef.validate(parsed)
                       : { ok: false, errors: ['JSON.parse に失敗: ' + parseErr] };
      E.loadPreset(other);                       // ★状態を別物にする
      const mid = JSON.stringify(E.getMapDef());
      const r = E.importJSON(json);
      const after = JSON.stringify(E.getMapDef());
      return { r, v, same: before === after, dirty: before !== mid,
               schema: parsed ? parsed.schema : 'PARSE-ERROR',
               afterObj: E.getMapDef(),
               diff: before === after ? null : { b: before.slice(0, 400), a: after.slice(0, 400) } };
    };
    const dungeon = trip('dungeon', 'field');
    const field = trip('field', 'dungeon');
    return { dungeon, field,
             DEFAULT_DUNGEON: E.MapDef.DEFAULT_DUNGEON, DEFAULT_FIELD: E.MapDef.DEFAULT_FIELD };
  });
  console.log('[driver] 往復 dungeon: validate=' + round.dungeon.v.ok + ' import=' + JSON.stringify(round.dungeon.r) +
              ' 一致=' + round.dungeon.same + ' (途中で別状態になった=' + round.dungeon.dirty + ') schema=' + round.dungeon.schema);
  console.log('[driver] 往復 field  : validate=' + round.field.v.ok + ' import=' + JSON.stringify(round.field.r) +
              ' 一致=' + round.field.same + ' (途中で別状態になった=' + round.field.dirty + ') schema=' + round.field.schema);
  if (round.dungeon.diff) console.log('[driver]   差分 before=' + round.dungeon.diff.b + '\n[driver]   差分 after =' + round.dungeon.diff.a);
  if (round.field.diff) console.log('[driver]   差分 before=' + round.field.diff.b + '\n[driver]   差分 after =' + round.field.diff.a);
  const ddDun = deepDiff(round.dungeon.afterObj, round.DEFAULT_DUNGEON);
  const ddFld = deepDiff(round.field.afterObj, round.DEFAULT_FIELD);
  console.log('[driver] ★DEFAULT_DUNGEON との deep-equal: ' + (ddDun === null ? '一致' : ('不一致 ' + ddDun)));
  console.log('[driver] ★DEFAULT_FIELD   との deep-equal: ' + (ddFld === null ? '一致' : ('不一致 ' + ddFld)));

  check('§4 2a ★往復同一性 (ダンジョン): export → 別状態 → import で元と一致',
        round.dungeon.r.ok === true && round.dungeon.same === true && round.dungeon.dirty === true &&
        round.dungeon.schema === 'df-map/1',
        '一致=' + round.dungeon.same + ' 汚し=' + round.dungeon.dirty);
  check('§4 2b ★往復同一性 (屋外3部屋): export → 別状態 → import で元と一致',
        round.field.r.ok === true && round.field.same === true && round.field.dirty === true &&
        round.field.schema === 'df-map/1',
        '一致=' + round.field.same + ' 汚し=' + round.field.dirty);
  check('§4 2c ★★往復後の mapDef が DFMapDef.DEFAULT_DUNGEON と deep-equal / 出力 JSON が validate 通過',
        round.dungeon.v.ok === true && ddDun === null,
        'validate=' + round.dungeon.v.ok + ' ' + JSON.stringify(round.dungeon.v.errors) +
        ' deep-equal=' + (ddDun === null ? 'OK' : ddDun));
  check('§4 2d ★★往復後の mapDef が DFMapDef.DEFAULT_FIELD と deep-equal / 出力 JSON が validate 通過',
        round.field.v.ok === true && ddFld === null,
        'validate=' + round.field.v.ok + ' ' + JSON.stringify(round.field.v.errors) +
        ' deep-equal=' + (ddFld === null ? 'OK' : ddFld));
  check('§4 N0 負のコントロール: deep-equal は DEFAULT_DUNGEON と DEFAULT_FIELD を同一と言わない',
        deepEqual(round.DEFAULT_DUNGEON, round.DEFAULT_DUNGEON) === true &&
        deepEqual(round.DEFAULT_DUNGEON, round.DEFAULT_FIELD) === false,
        '自分自身=' + deepEqual(round.DEFAULT_DUNGEON, round.DEFAULT_DUNGEON) +
        ' / 別プリセット=' + deepEqual(round.DEFAULT_DUNGEON, round.DEFAULT_FIELD));

  const ls = await page.evaluate(() => {
    const E = window.__mapEditor;
    // 前回実行の残骸を掃除 (決定論のため)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.indexOf('dfMapEditor.maps.') === 0) localStorage.removeItem(k);
    }
    const list0 = E.listLocal();
    E.loadPreset('dungeon');
    E.setTool('enemySlot'); E.placeSlot(33, 12);         // ★既定と違う状態にしてから保存する
    const saved = JSON.stringify(E.getMapDef());
    const sv = E.saveLocal('ドライバ保存A');
    const list1 = E.listLocal();
    const rawKeys = Object.keys(localStorage).filter(k => k.indexOf('dfMapEditor.maps.') === 0);
    E.loadPreset('field');                               // ★別状態へ
    const mid = JSON.stringify(E.getMapDef());
    const ld = E.loadLocal(sv.id);
    const back = JSON.stringify(E.getMapDef());
    const missing = E.loadLocal('存在しないid');
    const del = E.deleteLocal(sv.id);
    const list2 = E.listLocal();
    const delAgain = E.deleteLocal(sv.id);
    return { list0, sv, list1, list2, ld, back: back === saved, mid: mid !== saved, del, delAgain,
             missing, rawKeys,
             hasSlot: JSON.parse(saved).rooms[0].enemySlots.some(s => s[0] === 33 && s[1] === 12) };
  });
  console.log('[driver] localStorage: save=' + JSON.stringify(ls.sv) + ' keys=' + JSON.stringify(ls.rawKeys));
  console.log('[driver]   一覧 0件→' + JSON.stringify(ls.list1) + ' → 削除後=' + JSON.stringify(ls.list2));
  console.log('[driver]   load=' + JSON.stringify(ls.ld) + ' 元に戻った=' + ls.back + ' (途中で別状態=' + ls.mid + ')');
  check('§4 5a 保存すると localStorage の dfMapEditor.maps.<id> に入り、一覧に出る',
        ls.list0.length === 0 && ls.sv.ok === true && !!ls.sv.id && ls.list1.length === 1 &&
        ls.list1[0].id === ls.sv.id && ls.list1[0].name === 'ドライバ保存A' && !!ls.list1[0].savedAt &&
        eq(ls.rawKeys, ['dfMapEditor.maps.' + ls.sv.id]),
        JSON.stringify(ls.list1));
  check('§4 5b 別状態にしてから読込 → 保存時の状態に完全復帰 (編集した敵スロットも含む)',
        ls.ld.ok === true && ls.back === true && ls.mid === true && ls.hasSlot === true,
        '復帰=' + ls.back + ' 汚し=' + ls.mid + ' スロット=' + ls.hasSlot);
  check('§4 5c 削除で一覧から消える / 存在しない id は false + 理由 (無言で成功しない)',
        ls.del === true && ls.list2.length === 0 && ls.delAgain === false &&
        ls.missing.ok === false && /見つかりません/.test(ls.missing.reason || ''),
        '削除=' + ls.del + ' 再削除=' + ls.delAgain + ' 理由=' + JSON.stringify(ls.missing.reason));

  const imp = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const base = JSON.stringify(E.getMapDef());

    const broken = E.importJSON('{ "schema": "df-map/1", rooms: [ }');   // JSON として壊れている
    const afterBroken = JSON.stringify(E.getMapDef());
    const brokenHud = document.getElementById('hudMsg').textContent;

    const wrong = JSON.parse(E.exportJSON()); wrong.schema = 'df-map/9';
    const wrongRes = E.importJSON(JSON.stringify(wrong));
    const afterWrong = JSON.stringify(E.getMapDef());

    const noSchema = JSON.parse(E.exportJSON()); delete noSchema.schema;
    const noSchemaRes = E.importJSON(JSON.stringify(noSchema));
    const afterNoSchema = JSON.stringify(E.getMapDef());

    const notObj = E.importJSON('42');
    const afterNotObj = JSON.stringify(E.getMapDef());

    // 構造が壊れている (boss 部屋 0 個) → validate で拒否
    const noBoss = JSON.parse(E.exportJSON());
    noBoss.rooms.forEach(r => { r.role = null; });
    const noBossRes = E.importJSON(JSON.stringify(noBoss));
    const afterNoBoss = JSON.stringify(E.getMapDef());

    // 範囲外座標 → sanitize でクランプされて**受け入れられる**
    const oob = {
      schema: 'df-map/1', id: 'oob', name: '範囲外テスト',
      grid: { w: 72, h: 28, tile: 96 }, themeId: 'goblin-mine',
      rooms: [
        { id: 'r0', role: 'start', rect: [-5, -3, 99, 999],
          enemySlots: [[500, 400], [-7, -9]], bossSlot: null, painting: null, scenery: null },
        { id: 'r1', role: 'boss', rect: [5, 47, 22, 68],
          enemySlots: [], bossSlot: [999, 999], painting: null, scenery: null },
      ],
      corridors: [[13, 43, 15, 47]],
      start: { tx: -40, ty: 99 },
      objective: { kind: 'visitRooms', count: null }, tiles: null, flags: { bandMask: false },
    };
    const oobRes = E.importJSON(JSON.stringify(oob));
    const oobDef = E.getMapDef();
    const all = [];
    oobDef.rooms.forEach(r => {
      all.push(['rect-r', r.rect[0], 27], ['rect-c', r.rect[1], 71], ['rect-r2', r.rect[2], 27], ['rect-c2', r.rect[3], 71]);
      r.enemySlots.forEach(s => all.push(['slot-x', s[0], 71], ['slot-y', s[1], 27]));
      if (r.bossSlot) all.push(['boss-x', r.bossSlot[0], 71], ['boss-y', r.bossSlot[1], 27]);
    });
    all.push(['start-x', oobDef.start.tx, 71], ['start-y', oobDef.start.ty, 27]);
    const outOfRange = all.filter((t) => !(t[1] >= 0 && t[1] <= t[2]));

    return { broken, brokenHud, wrongRes, noSchemaRes, notObj, noBossRes, oobRes,
             unchanged: { broken: afterBroken === base, wrong: afterWrong === base,
                          noSchema: afterNoSchema === base, notObj: afterNotObj === base,
                          noBoss: afterNoBoss === base },
             oobDef: { rects: oobDef.rooms.map(r => r.rect), slots: oobDef.rooms.map(r => r.enemySlots),
                       boss: oobDef.rooms.map(r => r.bossSlot), start: oobDef.start, id: oobDef.id },
             outOfRange };
  });
  console.log('[driver] 壊れた JSON: ' + JSON.stringify(imp.broken));
  console.log('[driver] schema=df-map/9: ' + JSON.stringify(imp.wrongRes));
  console.log('[driver] schema 欠落: ' + JSON.stringify(imp.noSchemaRes) + '  非オブジェクト(42): ' + JSON.stringify(imp.notObj));
  console.log('[driver] boss 部屋 0 個: ' + JSON.stringify(imp.noBossRes));
  console.log('[driver] mapDef 不変: ' + JSON.stringify(imp.unchanged));
  console.log('[driver] 範囲外座標 → ' + JSON.stringify(imp.oobRes) + '  クランプ後=' + JSON.stringify(imp.oobDef));
  check('§4 6 壊れた JSON は ok:false + 理由 / mapDef は不変 / 理由が HUD に出る',
        imp.broken.ok === false && /JSON として読めません/.test(imp.broken.reason || '') &&
        imp.unchanged.broken === true && /JSON として読めません/.test(imp.brokenHud || ''),
        JSON.stringify(imp.broken.reason));
  check('§4 7a schema が df-map/9 の JSON は拒否され、理由に schema が出る / mapDef は不変',
        imp.wrongRes.ok === false && /schema/.test(imp.wrongRes.reason || '') &&
        /df-map\/9/.test(imp.wrongRes.reason || '') && imp.unchanged.wrong === true,
        JSON.stringify(imp.wrongRes.reason));
  check('§4 7b schema 欠落 / 非オブジェクトも拒否 (mapDef 不変)',
        imp.noSchemaRes.ok === false && imp.notObj.ok === false &&
        imp.unchanged.noSchema === true && imp.unchanged.notObj === true,
        JSON.stringify(imp.noSchemaRes.reason) + ' / ' + JSON.stringify(imp.notObj.reason));
  check('§4 7c validate NG (boss 部屋 0 個) は読み込まれない + 理由',
        imp.noBossRes.ok === false && /boss/.test(imp.noBossRes.reason || '') && imp.unchanged.noBoss === true,
        JSON.stringify(imp.noBossRes.reason));
  check('§4 8 範囲外座標は sanitize でクランプされて受け入れられる (0..71 / 0..27)',
        imp.oobRes.ok === true && imp.outOfRange.length === 0 &&
        eq(imp.oobDef.rects[0], [0, 0, 27, 71]) && eq(imp.oobDef.start, { tx: 0, ty: 27 }) &&
        eq(imp.oobDef.slots[0], [[71, 27], [0, 0]]) && eq(imp.oobDef.boss[1], [71, 27]),
        '範囲外=' + JSON.stringify(imp.outOfRange) + ' rect0=' + JSON.stringify(imp.oobDef.rects[0]));

  const png4 = await page.evaluate(async () => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    E.zoomAt(200, 200, 1.3);                       // ★view を既定から動かしておく
    const view0 = { x: E.state.view.x, y: E.state.view.y, zoom: E.state.view.zoom };
    const cssW = E.state.css.w, cssH = E.state.css.h;

    // ① 選択なしで書き出し
    E.setTool('select');
    E.selectAt(0, 0);                              // 岩盤 = 選択解除
    E.selectSlotAt(0, 0);
    const noSel = { rect: E.getSelection(), slot: E.getSlotSelection() };
    const url1 = E.exportPNG();
    const view1 = { x: E.state.view.x, y: E.state.view.y, zoom: E.state.view.zoom };

    // ② 部屋を選択した状態 / ③ スロットを選択した状態 → ①と**同一**でなければならない
    E.selectAt(30, 12);                            // rooms[0] を選択
    const selRect = E.getSelection();
    const url2 = E.exportPNG();
    E.selectSlotAt(27, 13);                        // ROOM_SLOTS 先頭 = 敵スロット
    const selSlot = E.getSlotSelection();
    const url3 = E.exportPNG();
    const after = { rect: E.getSelection(), slot: E.getSlotSelection() };
    const view2 = { x: E.state.view.x, y: E.state.view.y, zoom: E.state.view.zoom };

    // 画素を数える (単色でないことの確認)
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url1; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const seen = {}; let colors = 0;
    for (let i = 0; i < d.length; i += 4) {
      const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
      if (!seen[k]) { seen[k] = 0; colors++; }
      seen[k]++;
    }
    const top = Object.keys(seen).sort((a, b) => seen[b] - seen[a]).slice(0, 4).map(k => k + '×' + seen[k]);
    return { head: url1.slice(0, 22), len: url1.length, w: img.width, h: img.height, colors, top,
             same12: url1 === url2, same13: url1 === url3, noSel, selRect, selSlot, after,
             view0, view1, view2, cssW, cssH,
             cssNow: { w: E.state.css.w, h: E.state.css.h } };
  });
  console.log('[driver] PNG: head=' + png4.head + ' len=' + png4.len + ' 画像=' + png4.w + '×' + png4.h +
              ' 色数=' + png4.colors + ' 上位=' + JSON.stringify(png4.top));
  console.log('[driver]   選択なし PNG === 部屋選択 PNG: ' + png4.same12 + ' / === スロット選択 PNG: ' + png4.same13);
  check('§4 9a exportPNG() が data:image/png;base64, で始まる / 画像サイズは固定 (72×16 × 28×16)',
        png4.head === 'data:image/png;base64,' && png4.w === 72 * 16 && png4.h === 28 * 16,
        png4.head + ' ' + png4.w + '×' + png4.h);
  check('§4 9b 単色でない (実際に地形が描かれている)', png4.colors >= 4, '色数=' + png4.colors + ' 上位=' + JSON.stringify(png4.top));
  check('§4 9c 書き出し前後で画面の view / css が不変 (画面のズーム・パンに影響しない)',
        eq(png4.view0, png4.view1) && eq(png4.view0, png4.view2) &&
        png4.cssW === png4.cssNow.w && png4.cssH === png4.cssNow.h,
        JSON.stringify(png4.view0) + ' → ' + JSON.stringify(png4.view2));
  check('§4 9d ★選択リングが焼き込まれない (選択ありでも選択なしと同一 PNG) / 選択自体は書き出し後も残る',
        png4.same12 === true && png4.same13 === true &&
        png4.noSel.rect === null && png4.noSel.slot === null &&
        !!png4.selRect && !!png4.selSlot && !!png4.after.slot === true,
        '同一=' + png4.same12 + '/' + png4.same13 + ' 書出し後=' + JSON.stringify(png4.after));

  const ui4 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('field');
    document.getElementById('presetSel').value = 'dungeon';
    document.getElementById('btnLoadPreset').click();         // ★ボタンでプリセット読込
    const afterBtn = E.getMapDef().rooms.length;
    document.getElementById('mapNameInput').value = '崩れた坑道';
    document.getElementById('mapNameInput').dispatchEvent(new Event('change'));
    const named = { name: E.getMapDef().name, id: E.getMapDef().id };
    document.getElementById('btnSaveLocal').click();
    const listed = E.listLocal().map(x => x.name);
    const optCount = document.getElementById('localSel').options.length;
    document.getElementById('btnDeleteLocal').click();
    const listed2 = E.listLocal().length;
    return { afterBtn, named, listed, optCount, listed2,
             notice: document.getElementById('hudInfo').textContent };
  });
  console.log('[driver] UI: プリセットボタン後の部屋数=' + ui4.afterBtn + ' 名前=' + JSON.stringify(ui4.named) +
              ' 一覧=' + JSON.stringify(ui4.listed) + ' option数=' + ui4.optCount + ' 削除後=' + ui4.listed2);
  check('§4 10a 「読込」ボタンでプリセットが読み込まれる (屋外3部屋 → ダンジョン2部屋)',
        ui4.afterBtn === 2, '部屋数=' + ui4.afterBtn);
  check('§4 10b 名前入力が mapDef.name / id に反映され、保存ボタン → 一覧 → 削除ボタンが動く',
        ui4.named.name === '崩れた坑道' && ui4.named.id === '崩れた坑道' &&
        eq(ui4.listed, ['崩れた坑道']) && ui4.optCount === 1 && ui4.listed2 === 0,
        JSON.stringify(ui4.named) + ' 一覧=' + JSON.stringify(ui4.listed));

  const dropRes = await page.evaluate(async () => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const json = E.exportJSON();
    E.loadPreset('field');
    const before = E.getMapDef().rooms.length;
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'test.df-map.json', { type: 'application/json' }));
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    E.canvas.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 300));      // FileReader は非同期
    return { before, after: E.getMapDef().rooms.length, notice: document.getElementById('hudInfo').textContent,
             err: document.getElementById('hudMsg').textContent, defaultPrevented: ev.defaultPrevented };
  });
  console.log('[driver] drag&drop: 部屋数 ' + dropRes.before + '→' + dropRes.after +
              ' 通知=' + JSON.stringify(dropRes.notice) + ' エラー=' + JSON.stringify(dropRes.err));
  check('§4 10c canvas への drag & drop で JSON が読み込まれる (既定動作も抑止されている)',
        dropRes.before === 3 && dropRes.after === 2 && dropRes.defaultPrevented === true &&
        /読み込みました/.test(dropRes.notice || '') && dropRes.err === '',
        '部屋数 ' + dropRes.before + '→' + dropRes.after);

  const neg4 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const json = E.exportJSON();
    const obj = JSON.parse(json);
    obj.rooms[0].enemySlots = [];                   // ★1 箇所だけ削った JSON
    const r = E.importJSON(JSON.stringify(obj));
    const after = E.getMapDef();
    return { ok: r.ok, slots: after.rooms[0].enemySlots.length,
             same: JSON.stringify(after) === JSON.stringify(JSON.parse(json)) };
  });
  console.log('[driver] 負のコントロール: enemySlots を削った JSON を入れると slots=' + neg4.slots +
              ' / 元と同一=' + neg4.same);
  check('§4 N1 負のコントロール: enemySlots を 1 箇所削った JSON は元と一致しない (往復 assert が空振りでない)',
        neg4.ok === true && neg4.slots === 0 && neg4.same === false,
        'slots=' + neg4.slots + ' 同一=' + neg4.same);

  // ══════════════════════════════════════════════════════════════════════════
  // §5 出発前 lint (★不正マップ 5 種の検出 / プリセットは 0 件 / 純粋性 / PNG / 性能)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n───── §5 出発前 lint (不正5種の検出 / プリセット0件 / 純粋性 / 性能) ─────');
  const presets = await page.evaluate(() => {
    const E = window.__mapEditor;
    const snap = (key) => {
      E.loadPreset(key);
      const r = E.lint();
      return { errors: r.errors, warnings: r.warnings, ok: r.ok,
               fromState: E.state.lintResult ? E.state.lintResult.errors.length : -1,
               badgeErr: document.getElementById('lintBadgeErr').textContent,
               badgeWarn: document.getElementById('lintBadgeWarn').textContent,
               summary: document.getElementById('lintSummary').textContent };
    };
    return { dungeon: snap('dungeon'), field: snap('field') };
  });
  for (const k of ['dungeon', 'field']) {
    const p = presets[k];
    console.log('[driver] ' + k + ': errors=' + p.errors.length + ' warnings=' + p.warnings.length +
                ' バッジ="' + p.badgeErr + '" / "' + p.badgeWarn + '" 要約="' + p.summary + '"');
    p.errors.forEach(e => console.log('[driver]   ERROR   ' + e.code + ' | ' + e.message));
    p.warnings.forEach(e => console.log('[driver]   WARNING ' + e.code + ' | ' + e.message));
  }
  check('§5 2a ★ダンジョンプリセットが lint エラー 0 件 (既存の正しいマップを誤検出しない)',
        presets.dungeon.errors.length === 0 && presets.dungeon.ok === true &&
        presets.dungeon.fromState === 0 && presets.dungeon.badgeErr === 'エラー 0',
        'errors=' + JSON.stringify(presets.dungeon.errors.map(e => e.code)));
  check('§5 2b ★屋外プリセット(3部屋+帯マスク)が lint エラー 0 件',
        presets.field.errors.length === 0 && presets.field.ok === true &&
        presets.field.fromState === 0 && presets.field.badgeErr === 'エラー 0',
        'errors=' + JSON.stringify(presets.field.errors.map(e => e.code)));
  check('§5 2c ★1枚絵の比率不一致 (山場 20×14) は **警告** であってエラーではない',
        presets.dungeon.warnings.some(w => w.code === 'painting-aspect') &&
        !presets.dungeon.errors.some(e => e.code === 'painting-aspect'),
        '警告=' + JSON.stringify(presets.dungeon.warnings.map(w => w.code)));
  check('§5 2d 屋外プリセットは帯マスク警告が出る (落とし穴⑤ の可視化) / それでもエラーではない',
        presets.field.warnings.some(w => w.code === 'band-mask') && presets.field.errors.length === 0,
        '警告=' + JSON.stringify(presets.field.warnings.map(w => w.code)));

  /* ── ★不正マップ 5 種 (計画書「lint が不正マップ 5 種を全部検出」) ────────
   * ⚠ 判定は必ず **code** で行う。文言で見ると日本語を推敲した瞬間に落ちる。
   * ⚠ (d) boss 0 個は importJSON では拒否されるので lintMapDef(obj) を直接呼ぶ。 */
  const bad = await page.evaluate(() => {
    const E = window.__mapEditor;
    const M = E.MapDef;
    const base = () => { E.loadPreset('dungeon'); return JSON.parse(E.exportJSON()); };
    const codes = (r) => ({ err: r.errors.map(x => x.code), warn: r.warnings.map(x => x.code),
                            errMsg: r.errors.map(x => x.code + '|' + x.message + '|at=' + JSON.stringify(x.at)) });

    // (a) 廊下を抜いて孤立部屋
    const a = base(); a.corridors = [];
    const rA = M.lintMapDef(a);

    // (b) 敵スロットを岩盤 (値2) へ ★8519138 の再来
    const b = base(); b.rooms[0].enemySlots.push([10, 3]);   // どの部屋にも廊下にも属さない = 値2
    const rB = M.lintMapDef(b);
    const mapB = M.buildMapData(b);

    // (c) 起点を壁へ
    const c = base(); c.start = { tx: 0, ty: 0 };
    const rC = M.lintMapDef(c);
    const mapC = M.buildMapData(c);

    // (d) boss 0 個 / 2 個
    const d0 = base(); d0.rooms.forEach(r => { if (r.role === 'boss') r.role = null; });
    const rD0 = M.lintMapDef(d0);
    const d2 = base(); d2.rooms.forEach(r => { r.role = 'boss'; });
    const rD2 = M.lintMapDef(d2);

    // (e) 候補タイルが 0 になる構成
    //     部屋を隣接させて廊下を無くす = 連結性は保ったまま、role 除外後の候補が消える
    const e = base();
    e.rooms[0].rect = [7, 24, 20, 46];      // start 部屋を東へ伸ばしてボス部屋 (c47-) と接する
    e.corridors = [];
    const rE = M.lintMapDef(e);

    return {
      a: codes(rA), b: codes(rB), c: codes(rC), d0: codes(rD0), d2: codes(rD2), e: codes(rE),
      bTileVal: mapB[3][10], cTileVal: mapC[0][0],
      aReachAt: rA.errors.filter(x => x.code === 'unreachable-room').map(x => x.at),
    };
  });
  console.log('[driver] (a) 廊下なし        : err=' + JSON.stringify(bad.a.err));
  bad.a.errMsg.forEach(m => console.log('[driver]      ' + m));
  console.log('[driver] (b) 敵を岩盤(値' + bad.bTileVal + ')へ: err=' + JSON.stringify(bad.b.err));
  bad.b.errMsg.filter(m => m.indexOf('slot-on-wall') === 0).forEach(m => console.log('[driver]      ' + m));
  console.log('[driver] (c) 起点を壁(値' + bad.cTileVal + ')へ : err=' + JSON.stringify(bad.c.err));
  bad.c.errMsg.filter(m => m.indexOf('slot-on-wall') === 0).forEach(m => console.log('[driver]      ' + m));
  console.log('[driver] (d) boss 0個       : err=' + JSON.stringify(bad.d0.err));
  console.log('[driver] (d) boss 2個       : err=' + JSON.stringify(bad.d2.err));
  console.log('[driver] (e) 候補ゼロ構成   : err=' + JSON.stringify(bad.e.err));
  bad.e.errMsg.filter(m => m.indexOf('no-trap-candidates') === 0).forEach(m => console.log('[driver]      ' + m));

  check('§5 3a ★(a) 廊下を抜くと unreachable-room が出る (孤立したボス部屋を検出) / 座標も返る',
        bad.a.err.includes('unreachable-room') && bad.aReachAt.length >= 1 && !!bad.aReachAt[0],
        'err=' + JSON.stringify(bad.a.err) + ' at=' + JSON.stringify(bad.aReachAt));
  check('§5 3a2 (a) 到達不能なボススロットも unreachable-slot として列挙される',
        bad.a.err.includes('unreachable-slot'), 'err=' + JSON.stringify(bad.a.err));
  check('§5 3b ★(b) 敵スロットを値2 の岩盤へ置くと slot-on-wall (8519138 の再来検出)',
        bad.bTileVal === 2 && bad.b.err.includes('slot-on-wall') &&
        bad.b.errMsg.some(m => /slot-on-wall/.test(m) && /8519138/.test(m) && /\[10,3\]/.test(m.replace(/\s/g, ''))),
        'タイル値=' + bad.bTileVal + ' err=' + JSON.stringify(bad.b.err));
  check('§5 3c ★(c) 起点を壁に置くと slot-on-wall / 起点が壁のとき到達性検査は打ち切る (連鎖エラーを撒かない)',
        bad.cTileVal === 2 && bad.c.err.includes('slot-on-wall') &&
        !bad.c.err.includes('unreachable-room') && !bad.c.err.includes('unreachable-slot'),
        'タイル値=' + bad.cTileVal + ' err=' + JSON.stringify(bad.c.err));
  check('§5 3d ★(d) boss 0個 / 2個 のどちらも boss-count',
        bad.d0.err.includes('boss-count') && bad.d2.err.includes('boss-count'),
        '0個=' + JSON.stringify(bad.d0.err) + ' 2個=' + JSON.stringify(bad.d2.err));
  check('§5 3e ★(e) role 除外後に候補タイルが 0 になる構成で no-trap-candidates (罠と宝箱の両方)',
        bad.e.err.filter(c => c === 'no-trap-candidates').length >= 2 &&
        bad.e.errMsg.some(m => /no-trap-candidates/.test(m) && /role/.test(m)),
        'err=' + JSON.stringify(bad.e.err));
  check('§5 3e2 (e) 連結性は保たれている (候補ゼロだけを見ている = (a) と原因が違う)',
        !bad.e.err.includes('unreachable-room') && !bad.e.err.includes('unreachable-slot'),
        'err=' + JSON.stringify(bad.e.err));

  const noEnemy = await page.evaluate(() => {
    const E = window.__mapEditor, M = E.MapDef;
    E.loadPreset('dungeon');
    const d = JSON.parse(E.exportJSON());
    d.rooms.forEach(r => { r.enemySlots = []; });
    const r = M.lintMapDef(d);
    // ボススロットも消した版
    const d2 = JSON.parse(E.exportJSON());
    d2.rooms.forEach(r2 => { r2.enemySlots = []; r2.bossSlot = null; });
    const r2 = M.lintMapDef(d2);
    return { err: r.errors.map(x => x.code), warn: r.warnings.map(x => x.code), ok: r.ok,
             err2: r2.errors.map(x => x.code), warn2: r2.warnings.map(x => x.code), ok2: r2.ok,
             msg: (r.warnings.find(x => x.code === 'no-enemies') || {}).message };
  });
  console.log('[driver] 敵0体: err=' + JSON.stringify(noEnemy.err) + ' warn=' + JSON.stringify(noEnemy.warn) + ' ok=' + noEnemy.ok);
  console.log('[driver] 敵0体+ボス無: err=' + JSON.stringify(noEnemy.err2) + ' warn=' + JSON.stringify(noEnemy.warn2));
  check('§5 4 ★敵 0 体は warnings に入り errors には入らない (卓用マップとして正当・計画書 落とし穴④)',
        noEnemy.warn.includes('no-enemies') && !noEnemy.err.includes('no-enemies') &&
        noEnemy.err.length === 0 && noEnemy.ok === true &&
        noEnemy.warn2.includes('no-boss-slot') && noEnemy.err2.length === 0,
        'err=' + JSON.stringify(noEnemy.err) + ' warn=' + JSON.stringify(noEnemy.warn));

  const pure = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const before = JSON.stringify(E.getMapDef());
    const view0 = JSON.stringify(E.state.view);
    // 他人の壊れた mapDef を lint しても現在の編集内容が変わってはいけない
    const foreign = JSON.parse(E.exportJSON());
    foreign.corridors = []; foreign.rooms[0].enemySlots.push([10, 3]); foreign.start = { tx: 0, ty: 0 };
    const foreignCopy = JSON.stringify(foreign);
    const r1 = E.lintMapDef(foreign);
    const r2 = E.lintMapDef(foreign);
    const after = JSON.stringify(E.getMapDef());
    return { same: before === after, viewSame: view0 === JSON.stringify(E.state.view),
             argIntact: foreignCopy === JSON.stringify(foreign),
             deterministic: JSON.stringify(r1) === JSON.stringify(r2),
             gotErrors: r1.errors.length };
  });
  console.log('[driver] 純粋性: mapDef不変=' + pure.same + ' view不変=' + pure.viewSame +
              ' 引数不変=' + pure.argIntact + ' 決定論=' + pure.deterministic + ' (検出したエラー数=' + pure.gotErrors + ')');
  check('§5 5 ★lintMapDef(d) は副作用なし (getMapDef/view/引数が不変・2回呼んで同じ結果・空振りでない)',
        pure.same && pure.viewSame && pure.argIntact && pure.deterministic && pure.gotErrors > 0,
        'mapDef不変=' + pure.same + ' 引数不変=' + pure.argIntact + ' 検出=' + pure.gotErrors);

  const png5 = await page.evaluate(() => {
    const E = window.__mapEditor;
    // lint エラーが出る状態を作る (canvas にマーカーが載る)
    E.loadPreset('dungeon');
    const d = JSON.parse(E.exportJSON());
    d.corridors = [];
    d.rooms[0].enemySlots.push([10, 3]);       // 岩盤の敵 = 赤い✕マーカー
    E.setMapDef(d);
    const res = E.state.lintResult;
    const withAt = res.errors.concat(res.warnings).filter(x => x.at).length;

    const overlayDefault = E.state.lintOverlay;
    const url1 = E.exportPNG();                 // 既定 (lintOverlay=true) のまま書き出し
    E.state.lintOverlay = false;                // 手動で OFF
    E.render();
    const url2 = E.exportPNG();
    E.state.lintOverlay = true;
    E.render();
    const restored = E.state.lintOverlay;
    return { same: url1 === url2, withAt, overlayDefault, restored,
             errN: res.errors.length, len1: url1.length, len2: url2.length };
  });
  console.log('[driver] PNG焼き込み: lintエラー=' + png5.errN + ' 座標付きissue=' + png5.withAt +
              ' / 既定PNG === lint表示OFF PNG: ' + png5.same + ' (len ' + png5.len1 + ' vs ' + png5.len2 + ')');
  check('§5 6 ★lint エラーがある状態でも exportPNG() に lint オーバーレイが焼き込まれない',
        png5.same === true && png5.errN > 0 && png5.withAt > 0 &&
        png5.overlayDefault === true && png5.restored === true,
        '同一=' + png5.same + ' エラー数=' + png5.errN + ' 座標付き=' + png5.withAt);

  const ui5 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const d = JSON.parse(E.exportJSON());
    d.corridors = [];
    d.rooms[0].enemySlots.push([10, 3]);
    E.setMapDef(d);
    const res = E.state.lintResult;
    const all = res.errors.concat(res.warnings);
    const shapeOK = all.every(x =>
      typeof x.code === 'string' && x.code.length > 0 &&
      (x.severity === 'error' || x.severity === 'warning') &&
      typeof x.message === 'string' && x.message.length > 0 &&
      (x.at === null || (Array.isArray(x.at) && x.at.length === 2 && Number.isInteger(x.at[0]) && Number.isInteger(x.at[1]))) &&
      (x.roomIndex === null || Number.isInteger(x.roomIndex)));
    const sevOK = res.errors.every(x => x.severity === 'error') && res.warnings.every(x => x.severity === 'warning');

    const panelBefore = document.getElementById('lintPanel').classList.contains('open');
    document.getElementById('btnLint').click();                 // ★ボタンで一覧を開く
    const panelAfter = document.getElementById('lintPanel').classList.contains('open');
    const lis = Array.from(document.querySelectorAll('#lintList li'));
    const rows = lis.map(li => ({ code: li.getAttribute('data-code'), sev: li.getAttribute('data-severity'),
                                  jump: li.classList.contains('jump') }));
    const badge = document.getElementById('lintBadgeErr').textContent + ' / ' +
                  document.getElementById('lintBadgeWarn').textContent;

    // 行クリックでビューが飛ぶ
    const jumpRow = lis.filter(li => li.classList.contains('jump'))[0];
    const view0 = JSON.stringify(E.state.view);
    if (jumpRow) jumpRow.click();
    const view1 = JSON.stringify(E.state.view);

    document.getElementById('btnLintClose').click();
    const panelClosed = document.getElementById('lintPanel').classList.contains('open');
    return { shapeOK, sevOK, panelBefore, panelAfter, panelClosed, rows, badge,
             moved: view0 !== view1, nAll: all.length };
  });
  console.log('[driver] lint UI: バッジ="' + ui5.badge + '" 一覧行数=' + ui5.rows.length + '/' + ui5.nAll +
              ' パネル ' + ui5.panelBefore + '→' + ui5.panelAfter + '→' + ui5.panelClosed + ' 行クリックで移動=' + ui5.moved);
  console.log('[driver]   行: ' + JSON.stringify(ui5.rows));
  check('§5 7a issue の形が { code, severity, message, at:[tx,ty]|null, roomIndex:int|null } で揃っている',
        ui5.shapeOK === true && ui5.sevOK === true, '形OK=' + ui5.shapeOK + ' severity整合=' + ui5.sevOK);
  check('§5 7b 一覧パネルがボタンで開閉し、全 issue が data-code / data-severity 付きで並ぶ',
        ui5.panelBefore === false && ui5.panelAfter === true && ui5.panelClosed === false &&
        ui5.rows.length === ui5.nAll && ui5.rows.every(r => !!r.code && !!r.sev),
        '行数=' + ui5.rows.length + '/' + ui5.nAll);
  check('§5 7c 座標付きの行はクリックでその場所へビューが飛ぶ',
        ui5.moved === true && ui5.rows.some(r => r.jump), '移動=' + ui5.moved);

  /* ★ここが無いと「常に何か出す lint」でも (a)〜(e) が全部通ってしまう。
   *   2a/2b と重複して見えるが、こちらは lintMapDef (純粋関数) 側で測る = 経路が別。 */
  const neg5 = await page.evaluate(() => {
    const E = window.__mapEditor, M = E.MapDef;
    E.loadPreset('dungeon');
    const clean = M.lintMapDef(JSON.parse(E.exportJSON()));
    E.loadPreset('field');
    const cleanF = M.lintMapDef(JSON.parse(E.exportJSON()));
    return { cleanErr: clean.errors.length, cleanFieldErr: cleanF.errors.length };
  });
  check('§5 N0 負のコントロール: プリセットそのままなら lint エラー 0 (検査が常に何か出す作りではない)',
        neg5.cleanErr === 0 && neg5.cleanFieldErr === 0,
        'errors dungeon=' + neg5.cleanErr + ' field=' + neg5.cleanFieldErr);

  // 性能: lint は編集のたび (= ドラッグ中は毎タイル) 走る。ここが重いとドラッグがカクつく。
  const perf = await page.evaluate(() => {
    const E = window.__mapEditor, M = E.MapDef;
    E.loadPreset('field');                       // 3部屋 + 帯マスク = 最も重い側
    const d = JSON.parse(E.exportJSON());
    const N = 300, t0 = performance.now();
    for (let i = 0; i < N; i++) M.lintMapDef(d);
    const lintMs = (performance.now() - t0) / N;
    // ドラッグ 1 タイル分 = dragTile 経由 (buildMapData + lint + render まで含む)
    E.setTool('room');
    const t1 = performance.now();
    for (let i = 0; i < 60; i++) E.dragTile([2, 2], [6 + (i % 5), 6]);
    const dragMs = (performance.now() - t1) / 60;
    return { lintMs, dragMs };
  });
  console.log('[driver] 性能: lintMapDef=' + perf.lintMs.toFixed(3) + ' ms/回  ' +
              'dragTile 1回 (build+lint+render 込み)=' + perf.dragMs.toFixed(3) + ' ms');
  check('§5 P lint が編集のたび走っても軽い (lintMapDef < 1.0ms / dragTile 1回 < 16ms = 60fps 予算内)',
        perf.lintMs < 1.0 && perf.dragMs < 16,
        'lint=' + perf.lintMs.toFixed(3) + 'ms drag=' + perf.dragMs.toFixed(3) + 'ms');

  // ══════════════════════════════════════════════════════════════════════════
  // §6 敵の種類指定 (Phase 0.5)
  //    ★カタログ抽出のドリフト検出 / 3 要素スロットの往復同一性 /
  //      配置・種類変更・実寸描画 (drawImage フック) / ツールチップが DOM /
  //      lint の未知キー warning
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n───── §6 敵の種類指定 (カタログ / 3要素往復 / 配置・描画 / ツールチップ / lint) ─────');

  // ── A. カタログ抽出のドリフト検出 ────────────────────────────────────────
  const nodeCat = extractEnemyCatalogNode();
  console.log('[node] ENEMY_TYPES ブロック = ' + nodeCat.bytes + ' bytes / eval 評価 ' +
              nodeCat.evalKeys.length + ' キー / トークン走査 ' + nodeCat.scanKeys.length +
              ' キー / 2方式一致=' + nodeCat.sameByBothMethods);
  console.log('[node] 敵 (' + ENEMY_NON_COMBAT_EXPECT.join(',') + ' 除外) = ' + nodeCat.combat.length +
              ' 種 / 必須欠落=' + JSON.stringify(nodeCat.missing) +
              ' / 純データ度 (function/=>/`) = ' + JSON.stringify(nodeCat.pure));
  check('§6 A1 ★ドライバ側でも index.html から ENEMY_TYPES を独立抽出できた ' +
        '(eval 評価とトークン走査の 2 方式が一致 / 中身は純データ / 抽出失敗を PASS にしない)',
        nodeCat.ok === true && nodeCat.sameByBothMethods === true && nodeCat.evalKeys.length > 0 &&
        nodeCat.pure.fn === 0 && nodeCat.pure.arrow === 0 && nodeCat.pure.tmpl === 0 &&
        nodeCat.hasNonCombat === true,
        'ok=' + nodeCat.ok + ' err=' + nodeCat.error + ' eval=' + nodeCat.evalKeys.length +
        ' scan=' + nodeCat.scanKeys.length + ' pure=' + JSON.stringify(nodeCat.pure));

  // サムネの読込が落ち着くまで待つ (待たないと thumbs.pending が残って偽 FAIL になる)
  await page.waitForFunction(
    () => window.__mapEditor.paletteInfo().thumbs.pending === 0, { timeout: 20000 }).catch(() => {});

  const cat6 = await page.evaluate(async () => {
    const E = window.__mapEditor, M = E.MapDef;
    const st = await E.enemyCatalogReady;                 // ★測る前に必ず await
    const c = M.getEnemyCatalog();
    const keys = c ? Object.keys(c) : [];
    const req = M.ENEMY_REQUIRED_FIELDS;
    const missing = [];
    for (const k of keys)
      for (const f of req)
        if (!c[k] || c[k][f] === undefined || c[k][f] === null) missing.push(k + '.' + f);
    const groups = M.groupEnemyCatalog(c || {});
    const gKeys = [];
    groups.forEach((g) => g.keys.forEach((k) => gKeys.push(k)));
    const dup = gKeys.filter((k, i) => gKeys.indexOf(k) !== i);
    const uncovered = keys.filter((k) => gKeys.indexOf(k) < 0);
    const pal = E.paletteInfo();
    const items = Array.from(document.querySelectorAll('#palList .palItem'));
    // ★DOM の data-group が「入っているセクションの系統」と一致するか (受け皿が死ぬと崩れる)
    const badGroup = items.filter((it) => {
      const sec = it.closest('.palGroup');
      return !sec || sec.getAttribute('data-group') !== it.getAttribute('data-group');
    }).map((it) => it.getAttribute('data-key') + '→' + it.getAttribute('data-group'));
    return {
      status: st, statusState: E.state.enemyCatalogStatus,
      keys, missing, req,
      groups: groups.map((g) => ({ id: g.id, n: g.keys.length })),
      gTotal: gKeys.length, dup, uncovered,
      groupOfUnknown: M.groupIdOfEnemy('zzzBrandNewMonster'),
      groupOfKnown: M.groupIdOfEnemy('goblin'),
      pal, badGroup,
      hasWagon: keys.indexOf('caravanWagon') >= 0,
      nonCombat: Object.keys(M.ENEMY_NON_COMBAT),
      itemKeys: items.map((it) => it.getAttribute('data-key')),
    };
  });
  console.log('[driver] エディタのカタログ: status=' + JSON.stringify(cat6.status) +
              ' キー=' + cat6.keys.length + ' 種 / 必須欠落=' + JSON.stringify(cat6.missing));
  console.log('[driver] 系統グループ: ' + JSON.stringify(cat6.groups) + ' 総和=' + cat6.gTotal +
              ' 重複=' + JSON.stringify(cat6.dup) + ' 未収容=' + JSON.stringify(cat6.uncovered));
  console.log('[driver] パレット DOM: ' + JSON.stringify(cat6.pal));

  const nodeKeysSorted = nodeCat.combat.slice().sort();
  const edKeysSorted = cat6.keys.slice().sort();
  check('§6 A2 ★エディタの敵カタログ取得が成功している (silent fail-open にしない / state にも同じ結果が入る)',
        !!cat6.status && cat6.status.ok === true && cat6.status.error === null &&
        cat6.status.count === cat6.keys.length && cat6.keys.length > 0 &&
        !!cat6.statusState && cat6.statusState.ok === true &&
        cat6.pal.hasCatalog === true && !/⚠/.test(cat6.pal.note || ''),
        JSON.stringify(cat6.status) + ' note=' + JSON.stringify(cat6.pal.note));
  check('§6 A3 ★★カタログのキー集合が index.html の実読結果と完全一致 (書式ドリフトの検出器・ハードコードした期待値ではない)',
        deepEqual(edKeysSorted, nodeKeysSorted) && edKeysSorted.length === nodeCat.combat.length,
        'エディタ=' + edKeysSorted.length + ' 種 / node 実読=' + nodeKeysSorted.length + ' 種  差分=' +
        JSON.stringify(edKeysSorted.filter((k) => nodeKeysSorted.indexOf(k) < 0)
          .concat(nodeKeysSorted.filter((k) => edKeysSorted.indexOf(k) < 0)).slice(0, 6)));
  check('§6 A4 caravanWagon は index.html に**実在するのに**カタログから除外されている (除外 assert の空振り防止)',
        nodeCat.hasNonCombat === true && nodeCat.evalKeys.length === nodeCat.combat.length + 1 &&
        cat6.keys.length > 0 && cat6.hasWagon === false && eq(cat6.nonCombat, ENEMY_NON_COMBAT_EXPECT),
        'index.html に実在=' + nodeCat.hasNonCombat + ' カタログに混入=' + cat6.hasWagon +
        ' 除外表=' + JSON.stringify(cat6.nonCombat));
  check('§6 A5 ★必須フィールド (name/sprite/frameW/frameH/cols/hp/xp) が全種で揃う (エディタ側・node 側の両方で 0 件欠落)',
        eq(cat6.req, ENEMY_REQUIRED_EXPECT) && cat6.keys.length > 0 &&   // ★空カタログで空振りしない
        cat6.missing.length === 0 && nodeCat.missing.length === 0,
        'エディタ欠落=' + JSON.stringify(cat6.missing.slice(0, 6)) +
        ' node欠落=' + JSON.stringify(nodeCat.missing.slice(0, 6)) + ' 必須=' + JSON.stringify(cat6.req));
  check('§6 A6 ★系統グループの keys 総和 = 総数 (どのキーも取りこぼされない / 重複もしない)',
        cat6.gTotal === cat6.keys.length && cat6.dup.length === 0 && cat6.uncovered.length === 0 &&
        cat6.keys.length > 0,
        '総和=' + cat6.gTotal + ' / 総数=' + cat6.keys.length +
        ' 重複=' + JSON.stringify(cat6.dup) + ' 未収容=' + JSON.stringify(cat6.uncovered));
  check('§6 A7 ★未知のキーは受け皿 "other" へ落ちる (ゲーム側で敵が増えてもパレットから消えない) / 既知は自分の系統へ',
        cat6.groupOfUnknown === 'other' && cat6.groupOfKnown === 'goblin',
        '未知→' + cat6.groupOfUnknown + ' / goblin→' + cat6.groupOfKnown);
  check('§6 A8 パレット DOM のエントリ数 = カタログ件数 / data-group が所属セクションと一致 / サムネが全部決着 (pending 0)',
        cat6.keys.length > 0 &&                                          // ★空カタログで空振りしない
        cat6.pal.items === cat6.keys.length && cat6.badGroup.length === 0 &&
        cat6.pal.thumbs.pending === 0 &&
        (cat6.pal.thumbs.ok + cat6.pal.thumbs.fallback) === cat6.keys.length &&
        deepEqual(cat6.itemKeys.slice().sort(), edKeysSorted),
        'DOM=' + cat6.pal.items + ' / カタログ=' + cat6.keys.length +
        ' 不整合=' + JSON.stringify(cat6.badGroup.slice(0, 5)) + ' thumbs=' + JSON.stringify(cat6.pal.thumbs));

  // ── B. 往復同一性が 3 要素でも成立する ───────────────────────────────────
  const rt6 = await page.evaluate(() => {
    const E = window.__mapEditor, M = E.MapDef;
    E.loadPreset('dungeon');
    const d = JSON.parse(E.exportJSON());
    /* ★スロットは**この場で丸ごと定義する**。export されたスロットを添字で書き換えると、
     *   enemySlots を落とす変異 (--mutate dropslots) で undefined[0] を踏んで
     *   ドライバ自体が例外 = exit 3 で死に、負のコントロールの結果が読めなくなる (実測で踏んだ)。
     * 座標は rooms[0] rect [7,24,20,43] / rooms[1] rect [5,47,22,68] の内側。 */
    d.rooms[0].enemySlots = [[27, 13, 'goblin'], [28, 13], [28, 14], [39, 13, 'hobgoblin'],
                             [40, 13], [39, 14], [41, 14], [42, 13]];
    d.rooms[1].bossSlot = [57, 13, 'pharaxus'];
    E.setMapDef(d);                                   // ★sanitize を通す
    const before = E.getMapDef();
    const json = E.exportJSON();
    let parsed = null, perr = null;
    try { parsed = JSON.parse(json); } catch (e) { perr = String((e && e.message) || e); }
    const v = parsed ? M.validate(parsed) : { ok: false, errors: ['JSON.parse 失敗: ' + perr] };
    E.loadPreset('field');                            // ★状態を汚してから import する
    const dirty = JSON.stringify(E.getMapDef()) !== JSON.stringify(before);
    const r = E.importJSON(json);
    const after = E.getMapDef();
    return { before, after, v, r, dirty,
             lensBefore: before.rooms[0].enemySlots.map((s) => s.length),
             kindsBefore: before.rooms[0].enemySlots.map((s) => (s.length >= 3 ? s[2] : null)),
             bossBefore: before.rooms[1].bossSlot,
             lensAfter: after.rooms[0].enemySlots.map((s) => s.length),
             bossAfter: after.rooms[1].bossSlot };
  });
  const rtDiff = deepDiff(rt6.before, rt6.after);
  console.log('[driver] 3要素往復: import=' + JSON.stringify(rt6.r) + ' validate=' + rt6.v.ok +
              ' 汚し=' + rt6.dirty + ' deep-equal=' + (rtDiff === null ? '一致' : ('不一致 ' + rtDiff)));
  console.log('[driver]   要素数 before=' + JSON.stringify(rt6.lensBefore) + ' after=' + JSON.stringify(rt6.lensAfter) +
              ' 種類=' + JSON.stringify(rt6.kindsBefore) +
              ' boss=' + JSON.stringify(rt6.bossBefore) + '→' + JSON.stringify(rt6.bossAfter));
  /* ⚠⚠ deep-equal だけでは**空振りする**: fixSlot が 3 要素目を落とすと before も after も
   *    2 要素になって「一致」してしまう。要素数と中身も必ず一緒に見る (--mutate dropfix が守る)。 */
  check('§6 B1 ★★3要素 enemySlot / bossSlot を含む mapDef が export → validate → import で deep-equal ' +
        '(かつ 3 要素目が実際に生き残っている = 落として一致したのではない)',
        rt6.r.ok === true && rt6.v.ok === true && rt6.dirty === true && rtDiff === null &&
        eq(rt6.lensBefore, [3, 2, 2, 3, 2, 2, 2, 2]) &&
        rt6.kindsBefore[0] === 'goblin' && rt6.kindsBefore[3] === 'hobgoblin' &&
        Array.isArray(rt6.bossBefore) && rt6.bossBefore.length === 3 && rt6.bossBefore[2] === 'pharaxus',
        'deep-equal=' + (rtDiff === null ? 'OK' : rtDiff) + ' 要素数=' + JSON.stringify(rt6.lensBefore) +
        ' boss=' + JSON.stringify(rt6.bossBefore) + ' validate=' + JSON.stringify(rt6.v.errors));

  const keep2 = await page.evaluate(() => {
    const E = window.__mapEditor;
    const trip = (key, other) => {
      E.loadPreset(key);
      const json = E.exportJSON();
      E.loadPreset(other);                            // ★汚す
      E.importJSON(json);
      const d = E.getMapDef(), lens = [];
      d.rooms.forEach((r) => {
        r.enemySlots.forEach((s) => lens.push(s.length));
        if (r.bossSlot) lens.push(r.bossSlot.length);
      });
      return lens;
    };
    return { dungeon: trip('dungeon', 'field'), field: trip('field', 'dungeon') };
  });
  console.log('[driver] プリセット往復後の要素数: dungeon=' + JSON.stringify(keep2.dungeon) +
              ' field=' + JSON.stringify(keep2.field));
  check('§6 B2 ★既存プリセットは往復しても 2 要素のまま (§4 2c/2d の deep-equal を壊さない最重要の不変条件)',
        keep2.dungeon.length === 9 && keep2.dungeon.every((n) => n === 2) &&
        keep2.field.length === 9 && keep2.field.every((n) => n === 2),
        'dungeon=' + JSON.stringify(keep2.dungeon) + ' field=' + JSON.stringify(keep2.field));

  const b3 = await page.evaluate(() => {
    const E = window.__mapEditor, M = E.MapDef;
    E.loadPreset('dungeon');
    const d = JSON.parse(E.exportJSON());
    d.rooms[0].enemySlots = [
      [27, 13, 42],                          // 数値        → 落ちて 2 要素
      [28, 13, ''],                          // 空文字      → 落ちて 2 要素
      [28, 14, new Array(81).join('x')],     // 80 文字     → 上限 40 文字へ切り詰め
      [39, 13, 'gob-lin!'],                  // 記号混じり  → "goblin" へ正規化
      [40, 13, null],                        // null        → 落ちて 2 要素
      [39, 14, { k: 'goblin' }],             // オブジェクト→ 落ちて 2 要素
      [41, 14, '   '],                       // 空白のみ    → 落ちて 2 要素
      [42, 13, 'goblin'],                    // ★正常 (陽性対照。全部落ちる実装では PASS しない)
    ];
    E.setMapDef(d);
    return { got: E.getMapDef().rooms[0].enemySlots, max: M.ENEMY_KEY_MAX };
  });
  console.log('[driver] 不正な 3 要素目 → ' + JSON.stringify(b3.got) + ' (キー長上限=' + b3.max + ')');
  check('§6 B3 ★不正な 3 要素目 (数値/空文字/巨大文字列/記号混じり/null/オブジェクト/空白) が sanitize で落ちる or 正規化される',
        b3.max === 40 &&
        eq(b3.got, [[27, 13], [28, 13], [28, 14, new Array(41).join('x')], [39, 13, 'goblin'],
                    [40, 13], [39, 14], [41, 14], [42, 13, 'goblin']]),
        JSON.stringify(b3.got));

  const b4 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const d = JSON.parse(E.exportJSON());
    d.rooms[0].enemySlots = [[27, 13, 'goblin'], [28, 13]];   // ★添字書き換えを避ける (dropslots で死ぬ)
    E.setMapDef(d);
    const a = E.getMapDef();
    const obj = JSON.parse(E.exportJSON());
    const arr = obj.rooms[0].enemySlots;
    if (arr.length) { const t = arr[0]; arr[0] = [t[0], t[1], 'kobold']; }  // ★3 要素目だけを 1 箇所変える
    E.importJSON(JSON.stringify(obj));
    return { a: a, b: E.getMapDef() };
  });
  check('§6 B4 負のコントロール: 3 要素目だけを 1 箇所変えた JSON は元と deep-equal にならない (B1 が空振りでない)',
        deepEqual(b4.a, b4.a) === true && deepEqual(b4.a, b4.b) === false,
        '自分自身=' + deepEqual(b4.a, b4.a) + ' / 1箇所変更=' + deepEqual(b4.a, b4.b));

  // ── C. 配置 / 種類変更 / 実寸描画 ────────────────────────────────────────
  const place6 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    const lastEnemy = () => { const s = E.getMapDef().rooms[0].enemySlots; return s[s.length - 1]; };
    E.setTool('enemySlot');
    E.setEnemyBrush(null);
    const rAuto = E.placeSlot(30, 10);
    const auto = lastEnemy();
    const brush = E.setEnemyBrush('goblin');
    const rKind = E.placeSlot(31, 10);
    const kind = lastEnemy();
    E.setTool('bossSlot');
    E.setEnemyBrush(null);
    const rbAuto = E.placeSlot(50, 10);
    const bossAuto = E.getMapDef().rooms[1].bossSlot;
    E.setEnemyBrush('pharaxus');
    const rbKind = E.placeSlot(51, 10);
    const bossKind = E.getMapDef().rooms[1].bossSlot;
    return { rAuto, rKind, auto, kind, brush, rbAuto, rbKind, bossAuto, bossKind, tool: E.state.tool };
  });
  console.log('[driver] 配置: おまかせ=' + JSON.stringify(place6.auto) + ' / 筆goblin=' + JSON.stringify(place6.kind));
  console.log('[driver] ボス: おまかせ=' + JSON.stringify(place6.bossAuto) + ' / 筆pharaxus=' + JSON.stringify(place6.bossKind));
  check('§6 C1 ★enemyBrush=null で置くと 2 要素 (従来と 1 バイトも変わらない) / キーを選んで置くと 3 要素',
        place6.rAuto.ok === true && place6.rKind.ok === true && place6.brush === 'goblin' &&
        eq(place6.auto, [30, 10]) && eq(place6.kind, [31, 10, 'goblin']),
        'おまかせ=' + JSON.stringify(place6.auto) + ' 筆=' + JSON.stringify(place6.kind));
  check('§6 C2 ★bossSlot も同じ規則 (おまかせ=2 要素 / 筆あり=3 要素。ボスは常に 1 つのまま)',
        place6.rbAuto.ok === true && place6.rbKind.ok === true &&
        eq(place6.bossAuto, [50, 10]) && eq(place6.bossKind, [51, 10, 'pharaxus']),
        'おまかせ=' + JSON.stringify(place6.bossAuto) + ' 筆=' + JSON.stringify(place6.bossKind));

  const chg6 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    E.setTool('select');
    const ref = E.selectSlotAt(27, 13);
    const slot = () => E.getMapDef().rooms[0].enemySlots[0].slice();
    const k0 = E.getSlotEnemyKind(), s0 = slot();
    const r1 = E.setSlotEnemyKind('hobgoblin');
    const k1 = E.getSlotEnemyKind(), s1 = slot();
    const u = E.undo();
    const k2 = E.getSlotEnemyKind(), s2 = slot();
    const rd = E.redo();
    const k3 = E.getSlotEnemyKind(), s3 = slot();
    const r2 = E.setSlotEnemyKind(null);            // ★おまかせへ戻す = 3 要素目が消える
    const k4 = E.getSlotEnemyKind(), s4 = slot();
    // 起点は敵ではないので種類を持てない (無言で失敗しないこと)
    E.selectSlotAt(24, 13);
    const rStart = E.setSlotEnemyKind('goblin');
    return { ref, k0, k1, k2, k3, k4, s0, s1, s2, s3, s4, r1, r2, u, rd, rStart,
             reason: E.lastReason(), startTile: E.getMapDef().start,
             line: E.slotTipInfo().slotLine };
  });
  console.log('[driver] 種類変更: ' + JSON.stringify(chg6.s0) + ' →hobgoblin ' + JSON.stringify(chg6.s1) +
              ' →undo ' + JSON.stringify(chg6.s2) + ' →redo ' + JSON.stringify(chg6.s3) +
              ' →おまかせ ' + JSON.stringify(chg6.s4));
  check('§6 C3 ★既存スロットの種類変更 → undo で戻る / redo で再適用 / おまかせを選ぶと 2 要素へ戻る',
        chg6.ref === 'enemy:0:0' && chg6.k0 === null && eq(chg6.s0, [27, 13]) &&
        chg6.r1.ok === true && chg6.k1 === 'hobgoblin' && eq(chg6.s1, [27, 13, 'hobgoblin']) &&
        chg6.u === true && chg6.k2 === null && eq(chg6.s2, [27, 13]) &&
        chg6.rd === true && chg6.k3 === 'hobgoblin' && eq(chg6.s3, [27, 13, 'hobgoblin']) &&
        chg6.r2.ok === true && chg6.k4 === null && eq(chg6.s4, [27, 13]),
        JSON.stringify([chg6.s0, chg6.s1, chg6.s2, chg6.s3, chg6.s4]));

  const pick6 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    E.setTool('select');
    const tool0 = E.state.tool;
    E.selectSlotAt(28, 13);                                   // enemySlots[1]
    const b1 = E.pickEnemy('kobold');
    const s1 = E.getMapDef().rooms[0].enemySlots[1].slice();
    const selNodes1 = document.querySelectorAll('#palList .palItem.sel');
    const selKey1 = selNodes1.length === 1 ? selNodes1[0].getAttribute('data-key') : null;
    const b2 = E.pickEnemy(null);
    const s2 = E.getMapDef().rooms[0].enemySlots[1].slice();
    const autoSel = document.getElementById('palAuto').classList.contains('sel');
    // ★DOM のエントリを**本当にクリック**する経路 (検証シームを迂回しない)
    E.selectSlotAt(28, 14);                                   // enemySlots[2]
    const btn = document.querySelector('#palList .palItem[data-key="goblin"]');
    if (btn) btn.click();
    const s3 = E.getMapDef().rooms[0].enemySlots[2].slice();
    return { b1, s1, selKey1, selCount1: selNodes1.length, b2, s2, autoSel, s3,
             hasBtn: !!btn, tool0, tool: E.state.tool, brush: E.getEnemyBrush(),
             palBrush: document.getElementById('palBrush').textContent };
  });
  console.log('[driver] pickEnemy: kobold→' + JSON.stringify(pick6.s1) + ' / おまかせ→' + JSON.stringify(pick6.s2) +
              ' / 実クリック goblin→' + JSON.stringify(pick6.s3) + '  筆表示="' + pick6.palBrush + '"');
  check('§6 C4 ★パレットのクリック経路 (pickEnemy / 実 DOM click) が「筆」と「選択中スロットの敵種」を両方変える ' +
        '/ ツールは勝手に切り替わらない',
        pick6.b1 === 'kobold' && eq(pick6.s1, [28, 13, 'kobold']) && pick6.selKey1 === 'kobold' &&
        pick6.selCount1 === 1 && pick6.b2 === null && eq(pick6.s2, [28, 13]) && pick6.autoSel === true &&
        pick6.hasBtn === true && eq(pick6.s3, [28, 14, 'goblin']) && pick6.brush === 'goblin' &&
        pick6.tool0 === 'select' && pick6.tool === 'select',
        JSON.stringify([pick6.s1, pick6.s2, pick6.s3]) + ' tool=' + pick6.tool0 + '→' + pick6.tool);
  check('§6 C5 起点 (mapDef.start) は敵ではないので種類を持てない — 拒否理由が必ず残る (無言で失敗しない)',
        chg6.rStart.ok === false && !!chg6.rStart.reason && chg6.rStart.kind === null &&
        !!chg6.reason && eq(chg6.startTile, { tx: 24, ty: 13 }) && /起点/.test(chg6.line || ''),
        JSON.stringify(chg6.rStart) + ' 行=' + JSON.stringify(chg6.line));

  const mv6 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    E.setTool('select');
    E.selectSlotAt(27, 13);
    E.setSlotEnemyKind('goblin');
    const before = E.getMapDef().rooms[0].enemySlots[0].slice();
    const r = E.moveSlot(30, 11);                    // ★同じ部屋の中で動かす
    const after = E.getMapDef().rooms[0].enemySlots[0].slice();
    /* ボス側も同じ規則。⚠ ボス座標は**プリセットから読む** (tavern.html の BOSS_SLOT)。
     *   ここに数字を直書きすると BOSS_SLOT が動いた瞬間に選択が空振りして
     *   「3 要素目が保たれない」と誤読する (実際に [58,13] と書いて踏んだ)。 */
    const b0 = E.getMapDef().rooms[1].bossSlot.slice();
    E.selectSlotAt(b0[0], b0[1]);
    const bsel = E.getSlotSelection();
    E.setSlotEnemyKind('pharaxus');
    const bBefore = E.getMapDef().rooms[1].bossSlot.slice();
    const rb = E.moveSlot(b0[0] - 1, b0[1]);
    const bAfter = E.getMapDef().rooms[1].bossSlot.slice();
    return { r, before, after, rb, bBefore, bAfter, bsel, b0 };
  });
  console.log('[driver] 移動で種類が保たれる: ' + JSON.stringify(mv6.before) + '→' + JSON.stringify(mv6.after) +
              ' / ボス ' + JSON.stringify(mv6.bBefore) + '→' + JSON.stringify(mv6.bAfter) +
              ' (プリセットのボス座標=' + JSON.stringify(mv6.b0) + ' / tavern.html=' + JSON.stringify(live.bossSlot) + ')');
  check('§6 C6 ★スロットを移動しても 3 要素目が保たれる (敵 / ボスの両方。座標だけが変わる)',
        mv6.r.ok === true && eq(mv6.before, [27, 13, 'goblin']) && eq(mv6.after, [30, 11, 'goblin']) &&
        !!mv6.bsel && mv6.bsel.kind === 'boss' && eq(mv6.b0, live.bossSlot) &&
        mv6.rb.ok === true && eq(mv6.bBefore, [mv6.b0[0], mv6.b0[1], 'pharaxus']) &&
        eq(mv6.bAfter, [mv6.b0[0] - 1, mv6.b0[1], 'pharaxus']),
        JSON.stringify(mv6.before) + '→' + JSON.stringify(mv6.after) + ' / ' +
        JSON.stringify(mv6.bBefore) + '→' + JSON.stringify(mv6.bAfter) + ' 選択=' + JSON.stringify(mv6.bsel));

  /* ── 実寸スプライト描画 (★drawImage フックで確定させる) ─────────────────
   * ⚠⚠ **画像のロードを待ってからフックする**。未ロード中は仕様どおり従来マーカーへ
   *   落ちるので drawImage は 0 回になり、「実装が壊れている」と誤読する。
   * ⚠ this.canvas.id === 'editorCanvas' で必ず絞る。パレットのサムネ (49 枚) も
   *   exportPNG のオフスクリーンも drawImage を使う (どちらも id は空文字)。 */
  await page.waitForFunction(() => {
    const def = window.__mapEditor.MapDef.enemyDef('goblin');
    if (!def) return true;                          // カタログが死んだ変異では待たない (assert で落とす)
    const im = new Image(); im.src = def.sprite;
    return im.complete && im.naturalWidth > 0;
  }, { timeout: 15000 }).catch(() => {});

  const draw6 = await page.evaluate(() => {
    const E = window.__mapEditor, M = E.MapDef;
    E.loadPreset('dungeon');
    E.fitToView();
    E.setTool('select');
    E.selectSlotAt(27, 13);
    E.setSlotEnemyKind('goblin');                   // ★編集の実経路で 3 要素にする
    const def = M.enemyDef('goblin');
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    let calls = [];
    proto.drawImage = function () {
      if (this.canvas && this.canvas.id === 'editorCanvas')
        calls.push({ n: arguments.length, sw: arguments[3], sh: arguments[4],
                     dw: arguments[7], dh: arguments[8] });
      return orig.apply(this, arguments);
    };
    let withKind = [], noKind = [], zoom = 0;
    try {
      calls = [];
      E.render();
      withKind = calls.slice();
      zoom = E.state.view.zoom;
      E.setSlotEnemyKind(null);                     // ★負のコントロール: おまかせへ戻す
      calls = [];
      E.render();
      noKind = calls.slice();
    } finally { proto.drawImage = orig; }
    return { withKind, noKind, zoom,
             expDw: def ? def.displaySize * zoom : null,
             expDh: def ? def.frameH * (def.displaySize / def.frameW) * zoom : null,
             def: def ? { displaySize: def.displaySize, frameW: def.frameW, frameH: def.frameH,
                          rowOffset: def.rowOffset || 0, sprite: def.sprite } : null };
  });
  console.log('[driver] drawImage フック: 3要素=' + draw6.withKind.length + ' 回 ' +
              JSON.stringify(draw6.withKind) + ' / おまかせ=' + draw6.noKind.length + ' 回');
  console.log('[driver]   期待 dw=' + (draw6.expDw === null ? 'カタログ無し' : draw6.expDw.toFixed(4)) +
              ' dh=' + (draw6.expDh === null ? '-' : draw6.expDh.toFixed(4)) +
              ' (zoom=' + draw6.zoom.toFixed(4) + ' def=' + JSON.stringify(draw6.def) + ')');
  check('§6 C7 ★★3 要素スロットで #editorCanvas への drawImage が実際に呼ばれ、実寸 (displaySize×zoom) で描かれる ' +
        '(スクショ目視ではなくフックで確定)',
        draw6.withKind.length === 1 && draw6.withKind[0].n === 9 && !!draw6.def &&
        draw6.withKind[0].sw === draw6.def.frameW && draw6.withKind[0].sh === draw6.def.frameH &&
        Math.abs(draw6.withKind[0].dw - draw6.expDw) < 0.001 &&
        Math.abs(draw6.withKind[0].dh - draw6.expDh) < 0.001,
        '回数=' + draw6.withKind.length + ' 実測=' + JSON.stringify(draw6.withKind[0] || null) +
        ' 期待dw=' + (draw6.expDw === null ? '-' : draw6.expDw.toFixed(4)));
  check('§6 C8 負のコントロール: 同じスロットを「おまかせ」へ戻すと #editorCanvas への drawImage は 0 回 (C7 が空振りでない)',
        draw6.noKind.length === 0 && draw6.withKind.length > 0,
        'おまかせ=' + draw6.noKind.length + ' 回 / 種類固定=' + draw6.withKind.length + ' 回');

  // ── D. ツールチップ (★canvas ではなく DOM = PNG に焼き込まれない) ────────
  const tip6 = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    E.setTool('select');
    E.selectSlotAt(27, 13);
    E.setSlotEnemyKind('goblin');
    E.selectSlotAt(0, 0);                           // 岩盤 = スロット選択を外す (ホバーだけで測る)
    const off0 = E.hoverTile(null);
    const onKind = E.hoverTile(27, 13);             // 3 要素スロット
    const onAuto = E.hoverTile(28, 13);             // 2 要素スロット (おまかせ)
    const off1 = E.hoverTile(null);
    const node = document.getElementById('slotTip');
    const def = E.MapDef.enemyDef('goblin');
    return { off0, onKind, onAuto, off1,
             tag: node.tagName, parentId: node.parentElement ? node.parentElement.id : null,
             insideCanvas: !!node.closest('canvas'),
             def: def ? { name: def.name, hp: def.hp, xp: def.xp, flavor: def.flavor } : null };
  });
  console.log('[driver] ツールチップ: 3要素="' + tip6.onKind.text + '"');
  console.log('[driver]               2要素="' + tip6.onAuto.text + '"  解除時 shown=' + tip6.off1.shown);
  console.log('[driver]   DOM: <' + tip6.tag + '> 親=#' + tip6.parentId + ' canvas の中=' + tip6.insideCanvas);
  check('§6 D1 ★ツールチップは canvas ではなく DOM (#stage 直下の DIV) / ホバーで出てホバー解除で消える',
        tip6.tag === 'DIV' && tip6.parentId === 'stage' && tip6.insideCanvas === false &&
        tip6.onKind.inDom === true && tip6.onKind.onCanvas === false &&
        tip6.off0.shown === false && tip6.onKind.shown === true && tip6.onAuto.shown === true &&
        tip6.off1.shown === false,
        '<' + tip6.tag + '> 親=#' + tip6.parentId + ' shown ' + tip6.off0.shown + '→' +
        tip6.onKind.shown + '→' + tip6.off1.shown);
  check('§6 D2 3 要素スロットのツールチップに 敵の名前 / キー / HP / XP / flavor が出る',
        !!tip6.def && tip6.onKind.name === (tip6.def.name + ' (goblin)') &&
        tip6.onKind.stat.indexOf('HP ' + tip6.def.hp) === 0 &&
        tip6.onKind.stat.indexOf('XP ' + tip6.def.xp) > 0 &&
        tip6.onKind.stat.indexOf('(tx27, ty13)') > 0 &&
        tip6.onKind.flavor === (tip6.def.flavor || ''),
        'name=' + JSON.stringify(tip6.onKind.name) + ' stat=' + JSON.stringify(tip6.onKind.stat));
  check('§6 D3 2 要素スロットのツールチップは「おまかせ（tier と系統から自動選出）」',
        tip6.onAuto.name === 'おまかせ' && /tier と系統から自動選出/.test(tip6.onAuto.stat || '') &&
        tip6.onAuto.stat.indexOf('(tx28, ty13)') > 0,
        'name=' + JSON.stringify(tip6.onAuto.name) + ' stat=' + JSON.stringify(tip6.onAuto.stat));

  /* ⚠ 3 要素スロットを含むマップで PNG 同一性を測るので、画像ロードは上で待ってある。
   *   待たないと 1 回目と 2 回目でスプライトの有無が変わって偽 FAIL になる。 */
  const tipPng = await page.evaluate(() => {
    const E = window.__mapEditor;
    E.loadPreset('dungeon');
    E.setTool('select');
    E.selectSlotAt(27, 13);
    E.setSlotEnemyKind('goblin');
    E.selectSlotAt(0, 0);                           // 選択も外す (測りたいのはツールチップだけ)
    E.hoverTile(null);
    const shownOff = E.slotTipInfo().shown;
    const url1 = E.exportPNG();
    const on = E.hoverTile(27, 13);
    const url2 = E.exportPNG();
    const stillOn = E.slotTipInfo().shown;
    E.hoverTile(null);
    return { same: url1 === url2, shownOff, shownOn: on.shown, stillOn, len: url1.length };
  });
  console.log('[driver] ツールチップ表示中の PNG: 同一=' + tipPng.same + ' (len ' + tipPng.len +
              ') shown ' + tipPng.shownOff + '→' + tipPng.shownOn);
  check('§6 D4 ★ツールチップを出した状態でも exportPNG() が 1 バイトも変わらない (DOM なので焼き込まれない)',
        tipPng.same === true && tipPng.shownOff === false && tipPng.shownOn === true &&
        tipPng.stillOn === true && tipPng.len > 1000,
        '同一=' + tipPng.same + ' shown=' + tipPng.shownOff + '→' + tipPng.shownOn);

  // ── E. lint の未知キー warning ───────────────────────────────────────────
  const lk6 = await page.evaluate(() => {
    const E = window.__mapEditor, M = E.MapDef;
    E.loadPreset('dungeon');
    const d = JSON.parse(E.exportJSON());
    // ★ここも添字書き換えを避けて丸ごと定義する (dropslots で undefined[0] を踏まないため)
    d.rooms[0].enemySlots = [
      [27, 13, 'goblin'],                                      // ★既知 = 警告が出てはいけない
      [28, 13, 'zzzNotAnEnemy'],                               // 未知 (敵スロット)
      [28, 14],                                                // おまかせ = 警告が出てはいけない
    ];
    d.rooms[1].bossSlot = [57, 13, 'alsoNotAnEnemy'];          // 未知 (ボススロット)
    const codes = (r) => ({
      err: r.errors.map((x) => x.code),
      warn: r.warnings.map((x) => x.code),
      unknown: r.warnings.filter((x) => x.code === 'enemy-unknown-key')
        .map((x) => ({ msg: x.message, at: x.at, roomIndex: x.roomIndex, sev: x.severity })),
    });
    return {
      withCat: codes(M.lintMapDef(d)),
      noCat: codes(M.lintMapDef(d, { catalog: null })),   // ★"catalog" in opt で「未取得」を再現
      optNoKey: codes(M.lintMapDef(d, {})),               // opt はあるが catalog キー無し → 現行カタログ
      hasCat: !!M.getEnemyCatalog(),
    };
  });
  console.log('[driver] lint 未知キー: カタログあり warn=' + JSON.stringify(lk6.withCat.warn));
  lk6.withCat.unknown.forEach((u) => console.log('[driver]   ' + JSON.stringify(u.at) + ' ' + u.msg));
  console.log('[driver] lint 未知キー: カタログ未取得 (opt.catalog=null) warn=' + JSON.stringify(lk6.noCat.warn));
  check('§6 E1 ★未知の敵キーは warning "enemy-unknown-key" になる (error にはしない) / 敵とボスの両方 / 座標付き',
        lk6.hasCat === true && lk6.withCat.unknown.length === 2 &&
        lk6.withCat.err.indexOf('enemy-unknown-key') < 0 &&
        lk6.withCat.unknown.every((u) => u.sev === 'warning' && Array.isArray(u.at) && u.at.length >= 2) &&
        lk6.withCat.unknown.some((u) => /zzzNotAnEnemy/.test(u.msg)) &&
        lk6.withCat.unknown.some((u) => /alsoNotAnEnemy/.test(u.msg)),
        'warn=' + JSON.stringify(lk6.withCat.warn) + ' err=' + JSON.stringify(lk6.withCat.err));
  check('§6 E2 ★カタログ未取得のときは未知キー検査を**スキップ**する (取れない環境で正しいマップまで赤くしない)',
        lk6.noCat.unknown.length === 0 && lk6.noCat.warn.indexOf('enemy-unknown-key') < 0 &&
        eq(lk6.noCat.err, lk6.withCat.err),
        'warn=' + JSON.stringify(lk6.noCat.warn));
  check('§6 E3 既知キー (goblin) では 1 件も出ない / opt に catalog キーが無ければ現行カタログを使う (空振り検出)',
        !lk6.withCat.unknown.some((u) => /"goblin"/.test(u.msg)) &&
        lk6.optNoKey.unknown.length === 2 && eq(lk6.optNoKey.warn, lk6.withCat.warn),
        'opt={} の warn=' + JSON.stringify(lk6.optNoKey.warn));

  // ══════════════════════════════════════════════════════════════════════════
  // §9 実行中のエラー (全セクションを通しての累計)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n───── §9 実行中のエラー ─────');
  check('§9 1 pageerror / console.error / 404 が 0 件 (全セクション通算)',
        errs.length === 0, errs.slice(0, 4).join(' | ') || '0件');

  // ── 証拠用のスクリーンショット + 書き出し PNG ───────────────────────────
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.evaluate(() => {
      const E = window.__mapEditor;
      E.loadPreset('dungeon');
      const d = JSON.parse(E.exportJSON());
      d.corridors = [];
      d.rooms[0].enemySlots.push([10, 3]);
      E.setMapDef(d);
      E.fitToView();
      E.setLintPanelOpen(true);
    });
    const shot = path.join(SHOT_DIR, 'mapeditor_lint.png');
    await page.screenshot({ path: shot });
    const pngData = await page.evaluate(() => { window.__mapEditor.loadPreset('dungeon'); return window.__mapEditor.exportPNG(); });
    const pngPath = path.join(SHOT_DIR, 'mapeditor_export.png');
    fs.writeFileSync(pngPath, Buffer.from(pngData.split(',')[1], 'base64'));
    console.log('[driver] スクリーンショット: ' + shot);
    console.log('[driver] 書き出した PNG   : ' + pngPath + ' (' + fs.statSync(pngPath).size + ' bytes)');
  } catch (e) {
    console.log('[driver] (スクリーンショットの保存に失敗: ' + ((e && e.message) || e) + ') — assert には影響しない');
  }


  await browser.close();
  srv.close();

  const ng = results.filter((r) => !r.ok).length;
  console.log('\n[driver] ' + (results.length - ng) + '/' + results.length + ' PASS' + (ng ? ('  (FAIL ' + ng + ')') : ''));
  process.exit(ng ? 1 : 0);
})().catch((e) => { console.error('[driver] 例外: ' + (e && e.stack || e)); process.exit(3); });
