#!/usr/bin/env node
/*
 * driver_mapdef_step1.js — Phase 1「幾何の一元化」の**非退行 (値を 1bit も変えていない)** 測定装置
 * ═════════════════════════════════════════════════════════════════════════════
 * 仕様書: C:\Users\PC_User\.claude\dev-loop\SPEC_phase1_mapdef.md の「検証」節が唯一の正。
 * テンプレ: tools/driver_field_step1_geo.js (内蔵 http + baseline worktree + prelude + check 集計)。
 *
 * ■ このドライバの立ち位置 (誤解しないこと)
 *   これは「index.html の Phase 1 配線が幾何を 1bit も変えていない」ことを証明する装置。
 *   **本ドライバを新規追加した時点 (dev-loop 項目 2) では index.html はまだ 1 バイトも変わっておらず、
 *   作業ツリー == baseline なので全 assert が PASS するのが正しい状態**である。
 *   そこで測れているのは「装置が動くこと」だけ。**本番の判定は項目 3 (index.html の配線) で行う。**
 *   ここで PASS したことを「Phase 1 は安全」の根拠にしてはならない。
 *
 * ■ ⚠ 真空 PASS への対策 (過去に実際に踏んだ罠)
 *   baseline と作業ツリーが同一のとき、「両方 undefined」「両方 null」「両方 空文字」でも一致する。
 *   よって全 assert に **「取得値が空でない / 期待した形をしている」ガード**を同時に置く:
 *     ・mapData は 28 行 × 72 列、値は {0,1,2}、床(0)と岩盤(2)の両方が存在する
 *     ・ENEMY_SPAWNS は 1 件以上で各要素が [key, tx, ty] 形
 *     ・toDataURL は PNG の data URI で長さ 1000 超、かつ wallPattern/floorPattern が非 null
 *       (null 同士だとフォールバック経路の一致を見ているだけになる)
 *     ・traps / roomChests は 1 件以上、座標はマップ範囲内で mapData 上が床
 *     ・屋外ターゲットでは FIELD_GEO_ACTIVE の真偽まで assert する
 *       (Phase 1 の主戦場 = index.html:3323 `IS_FIELD_THEME && FIELD_GEO_ACTIVE` の置換なので、
 *        帯マスクが掛かっていないマップ同士を比べていたら空振り)
 *
 * ■ assert (仕様書「検証」節 1-6 をすべて実装済み)
 *   1  mapData 全体の SHA-256 が baseline と一致              … 幾何そのものの証明
 *   2  ENEMY_SPAWNS の JSON が一致
 *   3  mapCanvas.toDataURL() の SHA-256 が一致
 *   4  Math.random を固定シードにして traps / roomChests(=玄室+隠し+探索+竜の財宝) の座標列が一致
 *      ← 除外ロジック 4 箇所 (spawnTraps / spawnRoomChests / spawnHiddenChests /
 *        spawnExplorationChests) の同値性の直接証明。**今回いちばん壊しやすい本丸**。
 *        roomChests は 4 系統が**同じ配列へ順番に push される**ので、配列の順序込みで比べれば
 *        4 系統すべての差分が 1 本の assert に写る (spawnRoomChests → spawnHiddenChests →
 *        spawnExplorationChests → spawnDragonHoard の順)。
 *   5  新定数の実値 (START_TX / START_TY / BOSS_ROOM_IDX / EXCLUDED_ROOMS /
 *      ROOM_CHEST_EXCLUDED_ROOMS / OBJECTIVE_ROOMS) が仕様書の表どおり … (5a)-(5f)
 *      ⭐ (5f) は「ダンジョンで EXCLUDED_ROOMS ≠ ROOM_CHEST_EXCLUDED_ROOMS ({1} vs {0,1})」の
 *        専用 assert = **仕様書「計画書の誤り②」を踏んでいないことの静的な証明**。
 *      ⚠ classic script 直下の const は window に載らないが、page.evaluate は**グローバル
 *        スコープでコンパイルされる**ので bare 名で到達できる (mapData / ROOMS と同じ経路)。
 *        よって index.html に検証シームを足す必要は無い (= 触らない = changelog フック非発火)。
 *   6  pageerror / console.error / HTTP 4xx-5xx が 0 件
 *      ← **項目 3 で <script src="js/df-mapdef.js"> を足すので、その 404 の最大の検出器がここ**。
 *
 * ■ 対象 (屋外を必ず含める)
 *   6 シナリオ (goblin-mine / bandits-forest / lizard-swamp / orc-fort / undead-temple / dragon-lair)
 *   + 隊商護衛 caravan-road を **縦持ち (FIELD_GEO_ACTIVE=true = 帯マスクあり)** と
 *     **横持ち (FIELD_GEO_ACTIVE=false = 帯マスクなし)** の 2 通り。
 *   ⚠ 生成クエストの trapCount は index.html:6992 が `_genScenario.trapCount || 3` なので、
 *     隊商護衛の実ペイロード (trapCount:0) でも罠は 3 個湧く = 屋外でも assert 4 は空振りしない。
 *
 * ■ baseline は必ず git worktree に展開する (--baseline-rev で上書き可)
 *   ⚠ 過去に「ベースライン置換が空振りして作業ツリーを 2 回測る」事故が 2 回起きている。
 *     そこで (0a)-(0h) で **「別のものを読んでいること」を積極的に検算**する:
 *       ・BASELINE_DIR が ROOT と別パスで、git worktree list に載っていて、実在する
 *       ・両者の index.html の SHA-256 とバイト数を出力に出す
 *         (今は同一リビジョンなので一致が正しい。項目 3 以降は必ず食い違う)
 *       ・**各サーバが実際にどのディレクトリから index.html を配信したか**を記録して assert
 *   ⚠ baseline サーバの「ROOT へのフォールバック」は **画像等のアセットに限定**する。
 *     .html / .js までフォールバックさせると、baseline に存在しないスクリプト (まさに
 *     js/df-mapdef.js) が作業ツリーから配信されてしまい、404 検出器が死ぬ。
 *   ⚠⚠ **この環境は core.autocrlf=true**。git worktree に展開した baseline の index.html は
 *     **CRLF**、作業ツリーは **LF** になる (実測: 同一リビジョンなのに 1,511,581B vs 1,539,053B =
 *     差 27,472 = 行数ぴったり)。よって **index.html の生バイト/SHA を両側で比べても常に食い違う**。
 *     (0d) が「両側とも読めている」しか assert していないのはこのため。項目 4 の
 *     リビジョン負制御 (baseline に MAPDEF / START_TX が無いことの確認) は
 *     **文字列 indexOf で書く**こと。行をまたぐ正規表現や行数・バイト数の比較は CRLF で壊れる。
 *
 * ■ 負のコントロール (2 段構え) — 「assert が空振りでないこと」の直接証明 ★項目 4 で実装
 *   baseline 比較だけでは、**両側が同じように壊れていても PASS する**。そこで 2 種類:
 *
 *   (a) リビジョン負制御 … (R1a)(R1b)(R2a)(R2b)
 *       baseline(@c2ab252) の index.html に Phase 1 の識別子 (MAPDEF / START_TX / …) が
 *       **無い**こと + 作業ツリーには**在る**こと。さらに旧式 (const bossRoomIdx =
 *       ROOMS.length - 1; など) が baseline に**在り**作業ツリーに**無い**ことも見る。
 *       4 本セットで「本当に別物を比べている」証明になる。
 *       ランタイム版 (R3) = baseline ページ上に START_TX / BOSS_ROOM_IDX が存在しない。
 *       ⚠⚠ core.autocrlf=true なので baseline は CRLF・作業ツリーは LF。同一リビジョンでも
 *         27,472B (= 行数) 食い違う → **必ず文字列 indexOf で書く**。行をまたぐ正規表現・
 *         行数・バイト数の比較は CRLF で無言で壊れる。
 *
 *   (b) 変異負制御 … --mutate <kind> (start / exclude / chest / boss)
 *       page.evaluateOnNewDocument で **cur 側にだけ**欠陥を注入し、必ず exit 1 になることを
 *       確認する。注入が空振りしていないことは (M1) が毎ターゲットで実測する
 *       (「注入したつもりで効いていない」= 全 PASS = 偽の安心 を潰すため)。
 *       ⚠ evaluateOnNewDocument は**リロードのたびに**必要 (過去に踏んだ罠)。本ドライバは
 *         ターゲットごとに新しい page を作り bootPage 内で毎回 applyMutation() する。
 *

 * ■ プロファイル
 *   ⚠ Chrome プロファイルは必ず require('./_pptr_profile') で作る。自前で --user-data-dir を
 *     作ると消し忘れて滞留する (実測 1710 個・8.0GB の前科あり → tools/_pptr_profile.js 参照)。
 *
 * 使い方:
 *   node tools/driver_mapdef_step1.js [--headful] [--browser <path>] [--port N]
 *                                     [--baseline-rev c2ab252] [--baseline-dir <dir>]
 *                                     [--mutate start|exclude|chest|boss]
 *   ⚠ 並列検証はポート間隔 4 以上 (本ドライバは baseline 用に port+1 も掴む)。
 *   exit: 0=全 PASS / 1=FAIL あり (変異時は「捕まえた」= 期待どおり) / 2=環境不備 /
 *         3=装置の故障 (未知の kind・例外・変異が注入できていない) / 4=assert の穴
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8901'), 10);
const BASELINE_PORT = PORT + 1;
// Phase 1 前の HEAD = index.html が素の状態のリビジョン。
const BASELINE_REV = arg('baseline-rev', 'c2ab252');
const BASELINE_DIR = arg('baseline-dir', path.join(os.tmpdir(), 'df_mapdef1_baseline'));
const SEED = parseInt(arg('seed', '20260801'), 10);

/* ★2026-08-04: **描画 (canvas) の非退行だけ golden 方式へ移した**。
 *   理由 = 幾何 (mapData / spawns / traps / chests) は「二度と変わってはいけない」ので固定コミット
 *   c2ab252 との比較でよいが、**絵は意図的に変わる**。実際、情景の縮尺修正 (mine_cart の
 *   displayMax 200→64) で assert (3) が赤くなり、これは正しい検出だが、固定ベースラインのままだと
 *   「赤いまま安定 = 何も検出しない検出器」になる (driver_field_* 5 本が実際にそうなった)。
 *   → golden なら「FAIL → --update-golden → git diff に載る → commit でレビュー」という
 *     **明示的な操作**として陳腐化が可視化される。詳細は tools/_golden.js の冒頭。
 *   ⚠ ベースライン worktree は (1)(2)(4)(5) のために**そのまま残す**。1 つのベースラインに
 *     2 役 (負のコントロール / 非退行) を兼務させないこと。 */
const UPDATE_GOLDEN = flag('update-golden');
const G = require('./_golden')('mapdef_step1', { update: UPDATE_GOLDEN, driver: 'driver_mapdef_step1' });

// ── 変異負制御 (--mutate) ───────────────────────────────────────────────────
//   ※ 「捕まえた assert」は 2026-08-01 の実測値 (母集団 190 assert / 8 ターゲット)。
//   kind    | 注入する欠陥                                     | 実際に落ちた assert (実測)
//   --------|-------------------------------------------------|------------------------------
//   start   | DEFAULT_DUNGEON.start.tx = 25 (起点を 1 タイル)  | 24 件 = (1)x6 (4a)x6 (4b)x6 (5a)x6
//           |                                                 | ※ダンジョン 6 本のみ (屋外は不変)
//   exclude | excludedRoomIdx を**常に {boss}**                | 8 件 = (4a)x2 (4b)x2 (5c)x2 (5f)x2
//           |                                                 | ※屋外(3部屋)のみ。2部屋は元々 {boss}
//   chest   | chestExcludedRoomIdx を excludedRoomIdx と同一式 | 24 件 = (4a)x6 (4b)x6 (5d)x6 (5f)x6
//           |   ★仕様書「計画書の誤り②」の再発検出器・最重要  | ※ダンジョン 6 本のみ
//   boss    | bossRoomIdx を**常に 0** (派生 2 関数も 0 で再計算)| 46 件 = (4a)x8 (4b)x8 (5b)x8
//           |                                                 |         (5c)x8 (5d)x8 (5f)x6
//
// ⚠ start は (1) mapData SHA が落ちるのに **(3) canvas SHA は落ちない** (実測)。
//   起点 (24,13) は通常床だが (25,13) はレア床なので、起点救済 `mapData[ty][tx]===1 → 0` が
//   効いて床 551→552 / レア床 134→133 と 1 タイルだけ変わる。しかし renderMap 時のカメラは
//   両側とも cam=[2024,931] で同一・その 1 タイルは絵として差が出ないため canvas は一致する。
//   → **「mapData が変われば canvas も必ず変わる」は成り立たない**。(1) と (3) は別の検出器
//     として両方要る (どちらかがあれば十分、と間引くと 1 タイル級の欠陥を取り逃がす)。
//
// ⭐ これが可能なのは DFMapDef が**外部 script のグローバル**だから。inline に直書きすると
//    変異注入ができず負のコントロールが作れない (js/df-mapdef.js を分離する 2 つ目の理由)。
//
// ⚠ 注入は evaluateOnNewDocument なので **js/df-mapdef.js より先**に走る = その時点で
//   window.DFMapDef はまだ無い。よって「DFMapDef を直接書き換える」ことはできない。
//   → window.DFMapDef に**アクセサを仕掛けて** df-mapdef.js 末尾の `global.DFMapDef = {...}`
//     (js/df-mapdef.js は `})(window)` で閉じている) という代入を横取りし、その瞬間に
//     パッチを当てる。効いたかどうかは window.__dfMut.applied に残して (M1) が実測する。
//
// ⚠ boss だけ派生 2 関数 (excludedRoomIdx / chestExcludedRoomIdx) も一緒に 0 で再計算する。
//   これらは df-mapdef.js の**内部**で bossRoomIdx() を呼んでいるので、export だけ差し替えても
//   内部呼び出しは古いままになる。「bossRoomIdx が壊れた世界」を忠実に再現するには
//   内部呼び出しの結果も 0 に揃える必要がある (弱めているのではなく、正しく強めている)。
const MUTATIONS = {
  start:   { desc: 'DEFAULT_DUNGEON.start.tx を 24 → 25 (起点を 1 タイル東へ)' },
  exclude: { desc: 'excludedRoomIdx を常に {boss} (3部屋の導入部屋が罠候補に入る)' },
  chest:   { desc: 'chestExcludedRoomIdx を excludedRoomIdx と同一式 (誤り②の再発)' },
  boss:    { desc: 'bossRoomIdx を常に 0 (派生の除外部屋 Set も 0 基準へ)' },
};
const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[driver] 未知の --mutate: ' + MUTATE + '  (' + Object.keys(MUTATIONS).join(' / ') + ')');
  process.exit(3);
}

/* installMutation — ページ内で走る (evaluateOnNewDocument)。**index.html より前**。
 * ⚠ この関数はページへ文字列化して送られる。外側のスコープを一切参照しないこと。 */
function installMutation(kind) {
  var box = { v: undefined };
  window.__dfMut = { kind: kind, applied: false, detail: '<DFMapDef が代入されていない>' };
  function patch(D) {
    if (!D) { window.__dfMut.detail = 'DFMapDef が falsy'; return; }
    if (kind === 'start') {
      // resolve() は clone(DEFAULT_DUNGEON) を返す = 既定オブジェクトを書けば伝播する
      D.DEFAULT_DUNGEON.start.tx = 25;
      window.__dfMut.detail = 'DEFAULT_DUNGEON.start.tx=' + D.DEFAULT_DUNGEON.start.tx;
    } else if (kind === 'exclude') {
      D.excludedRoomIdx = function (d) { return new Set([D.bossRoomIdx(d)]); };
      window.__dfMut.detail = 'excludedRoomIdx -> 常に {boss}';
    } else if (kind === 'chest') {
      D.chestExcludedRoomIdx = function (d) {
        var rooms = (d && d.rooms) || [];
        var boss = D.bossRoomIdx(d);
        return (rooms.length >= 3) ? new Set([0, boss]) : new Set([boss]);
      };
      window.__dfMut.detail = 'chestExcludedRoomIdx -> excludedRoomIdx と同一式';
    } else if (kind === 'boss') {
      D.bossRoomIdx = function () { return 0; };
      D.excludedRoomIdx = function (d) {
        var rooms = (d && d.rooms) || [];
        return (rooms.length >= 3) ? new Set([0, 0]) : new Set([0]);
      };
      D.chestExcludedRoomIdx = function () { return new Set([0, 0]); };
      window.__dfMut.detail = 'bossRoomIdx -> 常に 0 (派生 2 関数も 0 基準)';
    } else {
      window.__dfMut.detail = '未知の kind: ' + kind;
      return;
    }
    window.__dfMut.applied = true;
  }
  Object.defineProperty(window, 'DFMapDef', {
    configurable: true,
    get: function () { return box.v; },
    set: function (nv) {
      box.v = nv;
      try { patch(nv); } catch (e) { window.__dfMut.detail = 'パッチ例外: ' + (e && e.message || e); }
    },
  });
}

// ⚠ evaluateOnNewDocument はリロード/新 page のたびに要る。bootPage から毎回呼ぶこと。
async function applyMutation(page, side) {
  if (MUTATE === null || side !== 'cur') return;
  await page.evaluateOnNewDocument(installMutation, MUTATE);
}

// ── 対象 ────────────────────────────────────────────────────────────────────
const DUNGEON_SCENARIOS = ['goblin-mine', 'bandits-forest', 'lizard-swamp',
  'orc-fort', 'undead-temple', 'dragon-lair'];

// 隊商護衛ペイロード (driver_field_step0/step1_geo/step5 と同形)。
// ⚠ wagonSpawns は tavern.html と同じ ty:14 (帯 3 行に 3x3 フットプリントを収めるため)。
const CARAVAN_PAYLOAD = {
  title: '隊商の街道 — 積荷の護衛',
  flavor: '隊商の馬車を街道の果てまで守り抜け。',
  spawns: [['goblin', 14, 13], ['goblinArcher', 15, 13], ['goblin', 14, 14]],
  clearXp: 600, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'caravan-road', questLevel: 3, tierKey: 'T2', source: 'plaza', fangReward: 0,
  waves: [
    { count: 3, pool: ['goblin', 'goblinArcher'] },
    { count: 3, pool: ['goblin', 'hobgoblin'] },
    { count: 3, pool: ['hobgoblin', 'goblinRider'] },
  ],
  wagonSpawns: [{ tx: 9, ty: 14 }],
};

const VP_DESKTOP = { name: 'desktop', width: 1440, height: 900 };
const VP_LAND = { name: 'iphone_land', width: 844, height: 390 };

/* ── assert 5 の期待値 (仕様書「検証」節 5 の表。実測で裏取り済み) ──────────────
 *   定数                        | ダンジョン(2部屋) | 屋外(3部屋)
 *   START_TX / START_TY         |  24 / 13          |  6 / 13
 *   BOSS_ROOM_IDX               |  1                |  2
 *   EXCLUDED_ROOMS              |  {1}              |  {0,2}
 *   ROOM_CHEST_EXCLUDED_ROOMS   |  {0,1}  ← ★別物  |  {0,2}   (たまたま一致)
 *   OBJECTIVE_ROOMS             |  1                |  2
 * ⭐ splitSets = 「この部屋数では 2 つの除外集合が別物になるか」。ダンジョンで true。 */
const EXPECT_DUNGEON = { rooms: 2, startTx: 24, startTy: 13, boss: 1,
  excluded: [1], chestExcluded: [0, 1], objective: 1, splitSets: true };
const EXPECT_FIELD = { rooms: 3, startTx: 6, startTy: 13, boss: 2,
  excluded: [0, 2], chestExcluded: [0, 2], objective: 2, splitSets: false };

// fieldGeo: 期待する FIELD_GEO_ACTIVE。null = 判定しない (ダンジョンは屋外幾何と無関係)。
const TARGETS = [].concat(
  DUNGEON_SCENARIOS.map(scen => ({
    label: scen, mode: 'legacy', scen, vp: VP_DESKTOP, field: false, fieldGeo: null,
    expect: EXPECT_DUNGEON,
  })),
  [
    { label: 'caravan-road(縦持ち相当/帯マスクあり)', mode: 'field', payload: CARAVAN_PAYLOAD,
      vp: VP_DESKTOP, field: true, fieldGeo: true, expect: EXPECT_FIELD },
    // ⚠ 横持ちは usableH が足りず FIELD_GEO_ACTIVE=false = 帯マスクが掛からない別の幾何になる。
    //    index.html:3323 の置換は `MAPDEF.flags.bandMask && FIELD_GEO_ACTIVE` なので、
    //    帯マスクあり / なし の**両方**を母集団に入れておかないと片側しか測れない。
    { label: 'caravan-road(横持ち/帯マスクなし)', mode: 'field', payload: CARAVAN_PAYLOAD,
      vp: VP_LAND, field: true, fieldGeo: false, expect: EXPECT_FIELD },
  ]
);

// ── puppeteer / Chrome (tools/driver_field_step1_geo.js と同じ流儀) ─────────
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
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

// ── baseline worktree ───────────────────────────────────────────────────────
function gitOut(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }); } catch (e) { return ''; }
}
function prepareBaseline() {
  const marker = path.join(BASELINE_DIR, 'index.html');
  if (fs.existsSync(marker)) {
    const head = gitOut(['-C', BASELINE_DIR, 'rev-parse', '--short', 'HEAD']).trim();
    if (head && (BASELINE_REV.indexOf(head) === 0 || head.indexOf(BASELINE_REV) === 0)) {
      console.log('[drv] baseline worktree 再利用: ' + BASELINE_DIR + ' @ ' + head);
      return;
    }
    console.log('[drv] baseline worktree が別リビジョン (' + head + ') なので作り直す');
    try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', BASELINE_DIR], { encoding: 'utf8' }); }
    catch (e) { /* 手で消された等 */ }
  }
  console.log('[drv] baseline worktree を作成: ' + BASELINE_DIR + ' @ ' + BASELINE_REV);
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', BASELINE_DIR, BASELINE_REV],
    { encoding: 'utf8', stdio: 'pipe' });
}

// ── 静的サーバ ──────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
// ⚠ baseline に無いファイルを作業ツリーから借りるのは**アセットだけ**。
//   .html / .js を借りると「baseline に存在しないスクリプトが作業ツリーから配信される」ことになり、
//   項目 3 の js/df-mapdef.js 404 検出器が死ぬ (= 装置が黙って壊れる)。
const ASSET_FALLBACK_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.mp3', '.ogg', '.wav', '.ttf', '.woff', '.woff2', '.svg']);

/* ⚠ /favicon.ico は **ページが参照している物ではなく、Chrome が勝手に取りに行く物**。
 *   index.html には favicon の記述が 1 つも無く (grep で 0 件)、リポジトリにも favicon.ico は
 *   存在しない = ゲーム側の欠陥ではない。よって 404 検出器の対象から明示的に外す。
 *   ⚠ 外すのは**このパスだけ**。「Failed to load resource ... 404」という文言で一括除外すると
 *     項目 3 の js/df-mapdef.js の 404 まで一緒に消えて、装置が黙って壊れる。
 *     除外判定は必ず **URL** で行い、コンソールメッセージの本文では行わない。 */
const IGNORED_URL_RE = /\/favicon\.ico(\?|$)/;

function startServer(port, root, label) {
  const rec = { label, root, servedFrom: {}, fallback: [], notFound: [], ignored404: [] };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const ext = path.extname(u).toLowerCase();
        let fp = path.join(root, u);
        let from = root;
        if (!fs.existsSync(fp) && root !== ROOT && ASSET_FALLBACK_EXT.has(ext)) {
          const alt = path.join(ROOT, u);
          if (fs.existsSync(alt)) { fp = alt; from = ROOT; rec.fallback.push(u); }
        }
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          (IGNORED_URL_RE.test(u) ? rec.ignored404 : rec.notFound).push(u);
          res.statusCode = 404; res.end('404'); return;
        }
        rec.servedFrom[u] = from;
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve({ srv, rec }));
  });
}

// ── 判定 ────────────────────────────────────────────────────────────────────
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isHex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

const T_BASE_MS = 1700000000000;

// ── プレリュード (page.evaluateOnNewDocument へ渡す。index.html より先に走る) ──
// mode:'legacy' … sessionStorage に既存シナリオ ID を積む
// mode:'field'  … 隊商護衛の生成ペイロードを積む (themeId=caravan-road → IS_FIELD_THEME)
function prelude(cfg) {
  try {
    if (cfg.mode === 'field') {
      sessionStorage.setItem('dragonfighters.generatedScenario', JSON.stringify(cfg.payload));
      sessionStorage.removeItem('dragonfighters.currentScenario');
      sessionStorage.removeItem('dragonfighters.questFlags');
    } else {
      sessionStorage.setItem('dragonfighters.currentScenario', cfg.scen);
      sessionStorage.removeItem('dragonfighters.generatedScenario');
      sessionStorage.removeItem('dragonfighters.questFlags');
    }
  } catch (e) {}

  // 時刻を凍結 (時刻依存の演出/乱数種を排除)
  const T0 = cfg.t0;
  const OrigDate = Date;
  window.Date = function (a) { return arguments.length ? new OrigDate(a) : new OrigDate(T0); };
  window.Date.now = function () { return T0; };
  window.Date.prototype = OrigDate.prototype;

  // ★assert 4 の前提: Math.random を固定シードの決定論 PRNG (LCG) に差し替える。
  //   これが無いと traps / roomChests の座標は毎回変わり、除外ロジックの同値性を直接測れない。
  let _s = (cfg.seed || 20260801) >>> 0;
  Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };

  // 画像ロード待ちのために Image を追跡 (テクスチャ未ロードのまま toDataURL を取ると
  // フォールバック描画同士の一致を見ているだけになる)
  const NativeImage = window.Image;
  window.__imgs = [];
  function TrackedImage(w, h) {
    const i = (w === undefined) ? new NativeImage() : new NativeImage(w, h);
    window.__imgs.push(i);
    return i;
  }
  TrackedImage.prototype = NativeImage.prototype;
  window.Image = TrackedImage;
}

async function waitImages(page, label) {
  const snapshot = () => page.evaluate(() => {
    const a = (window.__imgs || []).concat(Array.prototype.slice.call(document.images || []));
    let done = 0;
    for (const i of a) { if (!i.src || i.complete) done++; }
    return { total: a.length, done };
  });
  const t0 = Date.now();
  let prev = { total: -1, done: -1 }, stable = 0;
  while (Date.now() - t0 < 40000) {
    const s = await snapshot();
    if (s.total > 0 && s.done === s.total && s.total === prev.total) { stable++; if (stable >= 3) return s; }
    else stable = 0;
    prev = s;
    await new Promise(r => setTimeout(r, 250));
  }
  console.warn('[drv] 画像ロード待ちがタイムアウト: ' + label);
  return prev;
}

// ── in-page プローブ ────────────────────────────────────────────────────────
// page.evaluate はグローバルスコープでコンパイルされるので index.html の top-level
// const/let (mapData / ROOMS / traps / roomChests …) へ bare 名で到達できる。
// ⚠ 取れなかった値は例外で落とさず '<none>' を返す = 「取れていない」ことが FAIL として見える。
async function probe(page) {
  return page.evaluate(() => {
    const g = (fn, dflt) => { try { const v = fn(); return (v === undefined) ? dflt : v; } catch (e) { return dflt; } };
    const out = {};

    out.scenarioId = g(() => scenarioId, '<none>');
    out.isFieldTheme = g(() => IS_FIELD_THEME, '<none>');
    out.fieldMode = g(() => FIELD_MODE, '<none>');
    out.fieldGeoActive = g(() => FIELD_GEO_ACTIVE, '<none>');
    out.rooms = g(() => JSON.parse(JSON.stringify(ROOMS)), '<none>');
    out.roomsLen = g(() => ROOMS.length, -1);
    out.corridors = g(() => JSON.parse(JSON.stringify(CORRIDORS)), '<none>');
    out.mapW = g(() => MAP_W, -1);
    out.mapH = g(() => MAP_H, -1);

    // ── 5. Phase 1 の新定数 (仕様書「検証」節 5) ──
    //   ⚠ これらは classic script 直下の const = window には載らない。page.evaluate が
    //     グローバルスコープでコンパイルされるおかげで bare 名で読める (mapData と同じ経路)。
    //     baseline (Phase 1 前) には存在しないので '<none>' が返る = (R3) の材料になる。
    //   ⚠ Set のままだと構造化クローンで {} に化けるので必ず配列へ。順序ゆれを消すためソート。
    const setArr = (fn) => { const s = fn(); return Array.from(s).sort((a, b) => a - b); };
    out.startTx = g(() => START_TX, '<none>');
    out.startTy = g(() => START_TY, '<none>');
    out.bossRoomIdx = g(() => BOSS_ROOM_IDX, '<none>');
    out.excludedRooms = g(() => setArr(() => EXCLUDED_ROOMS), '<none>');
    out.chestExcludedRooms = g(() => setArr(() => ROOM_CHEST_EXCLUDED_ROOMS), '<none>');
    out.objectiveRooms = g(() => OBJECTIVE_ROOMS, '<none>');
    out.mapdefStart = g(() => JSON.parse(JSON.stringify(MAPDEF.start)), '<none>');
    out.mapdefFlags = g(() => JSON.parse(JSON.stringify(MAPDEF.flags)), '<none>');

    // ── 変異負制御が実際に効いたか (M1 の材料) ──
    out.mut = g(() => (window.__dfMut ? JSON.parse(JSON.stringify(window.__dfMut)) : null), null);

    // ── 1. mapData 全体 ──
    const md = g(() => mapData, null);
    if (Array.isArray(md)) {
      out.mapJson = JSON.stringify(md);
      out.mapRows = md.length;
      out.mapCols = Array.from(new Set(md.map(r => (r && r.length) || -1)));
      const tally = {};
      for (const row of md) for (const v of row) tally[v] = (tally[v] || 0) + 1;
      out.mapTally = tally;
    } else {
      out.mapJson = '<none>'; out.mapRows = -1; out.mapCols = []; out.mapTally = {};
    }

    // ── 2. ENEMY_SPAWNS ──
    const sp = g(() => ENEMY_SPAWNS, null);
    out.spawnsJson = Array.isArray(sp) ? JSON.stringify(sp) : '<none>';
    out.spawnsLen = Array.isArray(sp) ? sp.length : -1;
    out.spawnsShapeOk = Array.isArray(sp) && sp.length > 0 && sp.every(s =>
      Array.isArray(s) && typeof s[0] === 'string' && typeof s[1] === 'number' && typeof s[2] === 'number');

    // ── 4. traps / roomChests ──
    //   roomChests は spawnRoomChests → spawnHiddenChests → spawnExplorationChests →
    //   spawnDragonHoard の順に同じ配列へ push される。順序込みで比べると 4 系統すべてが写る。
    const tr = g(() => traps, null);
    out.traps = Array.isArray(tr) ? tr.map(t => [t.tx, t.ty]) : '<none>';
    const rc = g(() => roomChests, null);
    out.chests = Array.isArray(rc)
      ? rc.map(c => [c.tx, c.ty, c.hidden ? 1 : 0, c.locked ? 1 : 0, c.isMimic ? 1 : 0])
      : '<none>';
    out.trapCount = g(() => currentScenario.trapCount, '<none>');
    out.hiddenChestCount = g(() => currentScenario.hiddenChestCount, '<none>');

    // ── 3. mapCanvas ──
    //   ⚠ wallPattern/floorPattern が null だとフォールバック経路同士の一致を見ているだけになる。
    let wall = '<unreadable>', floor = '<unreadable>';
    try { wall = wallPattern; } catch (e) {}
    try { floor = floorPattern; } catch (e) {}
    out.patterns = {
      wall: wall !== null && wall !== undefined && wall !== '<unreadable>',
      floor: floor !== null && floor !== undefined && floor !== '<unreadable>',
    };
    let url = '<none>', cw = -1, ch = -1;
    try {
      window.requestAnimationFrame = function () { return 0; };   // 以後の自動再描画を止める
      computeCameraTarget(); camX = camTargetX; camY = camTargetY;
      renderMap();
      url = mapCanvas.toDataURL('image/png');
      cw = mapCanvas.width; ch = mapCanvas.height;
    } catch (e) { out.renderErr = String(e && e.message || e); }
    out.canvasUrl = url; out.canvasW = cw; out.canvasH = ch;
    out.cam = g(() => [camX, camY], '<none>');

    return out;
  });
}

async function bootPage(browser, url, viewport, pre, side) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // ⚠ 除外は **発生元 URL** で判定する (本文で判定すると js/df-mapdef.js の 404 まで消える)
    const loc = (typeof m.location === 'function') ? m.location() : null;
    if (loc && loc.url && IGNORED_URL_RE.test(loc.url)) return;
    errs.push('console.error: ' + m.text() + (loc && loc.url ? '  @' + loc.url : ''));
  });
  page.on('response', r => {
    if (r.status() >= 400 && !IGNORED_URL_RE.test(r.url())) errs.push('http' + r.status() + ': ' + r.url());
  });
  page.on('requestfailed', r => {
    if (IGNORED_URL_RE.test(r.url())) return;
    const t = r.failure() ? r.failure().errorText : '?';
    // ⚠ headless では音声などが ERR_ABORTED で切られることがあるので、それだけ除外する
    if (t !== 'net::ERR_ABORTED') errs.push('requestfailed(' + t + '): ' + r.url());
  });
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(prelude, pre);
  await applyMutation(page, side);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => {
    try { return typeof renderMap === 'function' && !!mapData && !!mapCanvas && typeof computeCameraTarget === 'function'; }
    catch (e) { return false; }
  }, { timeout: 30000, polling: 100 });
  await waitImages(page, url);
  return { page, errs };
}

// ── メイン ──────────────────────────────────────────────────────────────────
(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  prepareBaseline();

  let srv = null, srvBase = null, browser = null;
  let recCur = null, recBase = null;
  try {
    const a = await startServer(PORT, ROOT, 'cur');
    const b = await startServer(BASELINE_PORT, BASELINE_DIR, 'base');
    srv = a.srv; recCur = a.rec;
    srvBase = b.srv; recBase = b.rec;
    const BASE = 'http://127.0.0.1:' + PORT;
    const BBASE = 'http://127.0.0.1:' + BASELINE_PORT;
    console.log('[drv] cur =' + BASE + '  (' + ROOT + ')');
    console.log('[drv] base=' + BBASE + '  (' + BASELINE_DIR + ' @ ' + BASELINE_REV + ')');
    console.log('[drv] seed=' + SEED + ' (Math.random を LCG に固定)');

    const profile = require('./_pptr_profile')('df_mapdef1_');
    browser = await puppeteer.launch({
      executablePath: browserPath, headless: !HEADFUL,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--force-device-scale-factor=1', '--mute-audio',
        '--disable-dev-shm-usage', '--user-data-dir=' + profile],
    });

    // ── 0. baseline の素性 (「作業ツリーを 2 回測る」事故の検算) ──────────────
    mark('baseline が worktree として別に展開されていることの検算');
    {
      const curIdx = path.join(ROOT, 'index.html');
      const baseIdx = path.join(BASELINE_DIR, 'index.html');
      check('(0a) BASELINE_DIR が作業ツリーと別パスで実在する',
        path.resolve(BASELINE_DIR) !== path.resolve(ROOT) && fs.existsSync(baseIdx),
        'ROOT=' + ROOT + ' / BASELINE_DIR=' + BASELINE_DIR);
      const wtList = gitOut(['-C', ROOT, 'worktree', 'list']);
      const normalized = wtList.replace(/\\/g, '/').toLowerCase();
      check('(0b) git worktree list に BASELINE_DIR が載っている',
        normalized.indexOf(path.resolve(BASELINE_DIR).replace(/\\/g, '/').toLowerCase()) >= 0,
        wtList.trim().split(/\r?\n/).map(s => s.trim()).join(' | ') || '<empty>');
      const revFull = gitOut(['-C', ROOT, 'rev-parse', BASELINE_REV]).trim();
      const headBase = gitOut(['-C', BASELINE_DIR, 'rev-parse', 'HEAD']).trim();
      const headCur = gitOut(['-C', ROOT, 'rev-parse', 'HEAD']).trim();
      check('(0c) baseline の HEAD が --baseline-rev と一致する (40桁で解決できている)',
        headBase.length === 40 && revFull.length === 40 && headBase === revFull,
        'baseline=' + headBase.slice(0, 12) + ' / 作業ツリー=' + headCur.slice(0, 12) +
        ' / rev=' + BASELINE_REV + '→' + revFull.slice(0, 12));
      const sc = fs.readFileSync(curIdx), sb = fs.readFileSync(baseIdx);
      const hc = sha256(sc), hb = sha256(sb);
      // ⚠ 項目 2 の時点では index.html を 1 バイトも触っていないので**一致が正しい**。
      //   項目 3 以降は必ず食い違う。ここは「値が取れていること」だけを assert する。
      console.log('[drv]   index.html  cur : ' + sc.length + ' bytes  sha=' + hc.slice(0, 16));
      console.log('[drv]   index.html  base: ' + sb.length + ' bytes  sha=' + hb.slice(0, 16) +
        (hc === hb ? '   ← 一致 (Phase 1 未着手なので正しい)' : '   ← 相違 (Phase 1 着手後はこちらが正しい)'));
      check('(0d) 両側の index.html を実ファイルとして読めている (64桁 SHA / 10万バイト超)',
        isHex64(hc) && isHex64(hb) && sc.length > 100000 && sb.length > 100000,
        'cur=' + sc.length + 'B ' + hc.slice(0, 16) + ' / base=' + sb.length + 'B ' + hb.slice(0, 16));

      // ── リビジョン負制御 (静的) ─────────────────────────────────────────
      // ⚠⚠ core.autocrlf=true。baseline は CRLF・作業ツリーは LF で、同一リビジョンでも
      //   27,472B (= 行数) 食い違う。よって **必ず文字列 indexOf**。行をまたぐ正規表現・
      //   行数・バイト数の比較は CRLF で無言で壊れる。下の検索語はすべて 1 行に収まる。
      // ⚠ 'START_TX' 単体は baseline の PARTY_START_TX に部分一致してしまう
      //   → 代入の右辺まで含めた形で引く (PARTY_START_TX の代入式とは右辺が違うので当たらない)。
      // ⚠⚠ 旧版は 'const START_TX' のように**宣言キーワード込み**で引いていたが、
      //   [P1 再入可能化] で MAPDEF / 派生定数が `const` → `let` になった (buildNode が差し替える)
      //   ため、そのままだと作業ツリー側で 6 件が見つからず R1b が永久に赤くなる。
      //   ⭐ 検出力は落とさずに追従させる = **宣言に依存しないアンカー**へ書き換える。
      //     いずれも baseline (Phase 1 前) には MAPDEF そのものが無いので 0 件のまま
      //     = (R1a) の「baseline に 1 つも無い」は従来どおり成立する。
      const txtCur = sc.toString('utf8'), txtBase = sb.toString('utf8');
      const NEW_IDS = ['MAPDEF.rooms.map(r => r.rect)', 'js/df-mapdef.js', 'START_TX = MAPDEF.start.tx',
        'BOSS_ROOM_IDX = window.DFMapDef', 'EXCLUDED_ROOMS = window.DFMapDef',
        'ROOM_CHEST_EXCLUDED_ROOMS = window.DFMapDef', 'OBJECTIVE_ROOMS = window.DFMapDef',
        'MAPDEF.flags.bandMask', 'ROOM_CHEST_EXCLUDED_ROOMS.has(i)'];
      // 置換前の旧式。baseline に**在り**、作業ツリーには**無い**のが正しい。
      // ⚠ 'IS_FIELD_THEME && FIELD_GEO_ACTIVE' は他用途で作業ツリーにも 2 件残るので使わない
      //   (「消えているはず」の語を選び間違えると、この assert 自体が永久に落ちる)。
      const OLD_IDS = ['const bossRoomIdx = ROOMS.length - 1;', 'if (i === 0 || i === bossRoomIdx) continue;',
        '(IS_FIELD_THEME ? 6 : 24)', 'const excludeRooms = ROOMS.length >= 3', 'mapData[13][24]',
        'visitedRooms.size >= ROOMS.length - 1'];
      const newInBase = NEW_IDS.filter(s => txtBase.indexOf(s) >= 0);
      const newMissCur = NEW_IDS.filter(s => txtCur.indexOf(s) < 0);
      const oldMissBase = OLD_IDS.filter(s => txtBase.indexOf(s) < 0);
      const oldInCur = OLD_IDS.filter(s => txtCur.indexOf(s) >= 0);
      check('(R1a) baseline(@' + BASELINE_REV + ') の index.html に Phase 1 の識別子が 1 つも無い (' +
        NEW_IDS.length + ' 種)', newInBase.length === 0 && NEW_IDS.length === 9,
        newInBase.length ? '見つかった: ' + newInBase.join(' / ') : 'なし');
      check('(R1b) 作業ツリーの index.html には Phase 1 の識別子が ' + NEW_IDS.length + ' 種すべて在る',
        newMissCur.length === 0, newMissCur.length ? '欠けている: ' + newMissCur.join(' / ') : 'すべて在る');
      check('(R2a) baseline には置換前の旧式が ' + OLD_IDS.length + ' 種すべて在る (本当に Phase 1 前である証明)',
        oldMissBase.length === 0, oldMissBase.length ? '欠けている: ' + oldMissBase.join(' / ') : 'すべて在る');
      check('(R2b) 作業ツリーには置換前の旧式が 1 つも残っていない (半分だけ直した状態でない)',
        oldInCur.length === 0, oldInCur.length ? '残存: ' + oldInCur.join(' / ') : 'なし');
    }

    // ── 1-4 & 6: 全ターゲットの非退行 ────────────────────────────────────────
    for (const t of TARGETS) {
      mark('非退行: ' + t.label + '  [' + t.vp.name + ' ' + t.vp.width + 'x' + t.vp.height + ']');
      // ⚠ ?intel=0 は dev 専用チート。?autoplay=0 を併記しないと __dfDevCheat が黙って無視する
      //   (fail-open)。?autoplay=0 は __autoplay を 0 のままにするので演出/速度は素のまま。
      /* ⚠⚠ **`&graph=0` は 2026-08-08 (P5) に足した**。廃坑 (goblin-mine) が既定で分岐版に
       *   なり、付けないと「既定幾何 (山場+ボスの 2 部屋)」ではなく分岐ノード (7x6 の 1 部屋)
       *   を測ってしまう。本ドライバは**「壊していない」の最終判定装置**なので、計画書どおり
       *   `?graph=0` を付けて旧幾何へ固定し、負のコントロールとして生かし続ける。
       *   ⚠ baseline (@BASELINE_REV) は ?graph を知らないが、未知のクエリは単に無視されるので
       *     両側に同じ URL を投げてよい (対照の条件が揃う)。
       *   ⚠ assert は 1 つも消していない。
       * ⚠⚠ **`&paintblock=0` は 2026-08-17 (卓上グリッド P2) に足した**。1 枚絵に描かれた
       *   障害物 (樽・木箱・柵) を obstacleTileMask へ積むようにした結果、罠と宝箱が
       *   `isTileWall` を見て**その上を避ける**ようになり、(4a)(4b) の座標列が baseline と
       *   食い違うようになった (個数は不変・位置だけ移動)。これは**意図した仕様変更**であって
       *   退行ではないので、`&graph=0` とまったく同じ扱いで**旧経路へ固定**する。
       *   ⚠ baseline は ?paintblock を知らないが、未知のクエリは無視されるので両側に投げてよい。
       *   ⚠ 期待値 (baseline との一致) は**1 文字も書き換えていない**。ピンが空振りしていない
       *     ことは下の (G0) が実測する。障害物そのものの検証は driver_paint_blocked.js の担当。 */
      const q = '/index.html?intel=0&autoplay=0&graph=0&paintblock=0';
      const pre = { mode: t.mode, scen: t.scen, payload: t.payload, seed: SEED, t0: T_BASE_MS };
      const cur = await bootPage(browser, BASE + q, t.vp, pre, 'cur');
      const base = await bootPage(browser, BBASE + q, t.vp, pre, 'base');
      const C = await probe(cur.page);
      const B = await probe(base.page);
      const L = t.label;

      /* ── ★[卓上グリッド P2] 装置: 旧経路へのピンが空振りしていないこと ──────────
       * ⚠⚠ `&paintblock=0` を足して赤を消した以上、「スイッチが効いている」だけでなく
       *   「**そもそも塞ぐものが在る**」ことまで測らないと、将来マスクが全部消えても
       *   このドライバは緑のまま = ピンが意味を失ったことに気づけない。
       *   (在庫にマスクが 1 枚も無いテーマは masksInCatalog=0 が正しいので、そこは緩める) */
      const PB = await cur.page.evaluate(() => {
        const p = window.__paintBlockProbe ? window.__paintBlockProbe() : null;
        let masks = 0;
        try {
          const cat = DFMapDef.getPaintingCatalog() || {};
          for (const th of Object.keys(cat)) {
            for (const k of Object.keys(cat[th])) {
              if (DFMapDef.paintingBlockedFor(th, k).rows) masks++;
            }
          }
        } catch (e) {}
        return { off: p ? p.off : null, tiles: p ? p.tiles.length : null, masks: masks };
      });
      check('(G0) ' + L + ': ★?paintblock=0 が効き、かつ在庫に障害物マスクが実在する (ピンが空振りしていない)',
        PB.off === true && PB.tiles === 0 && PB.masks > 0,
        'off=' + PB.off + ' tiles=' + PB.tiles + ' 在庫のマスク=' + PB.masks + ' 枚');

      // ── 母集団ガード (真空 PASS 対策) ──
      check('(G1) ' + L + ': mapData が 28行 x 72列 で値が {0,1,2}、床(0)と岩盤(2)が両方ある',
        C.mapRows === 28 && C.mapCols.length === 1 && C.mapCols[0] === 72 &&
        Object.keys(C.mapTally).every(k => k === '0' || k === '1' || k === '2') &&
        (C.mapTally['0'] || 0) > 0 && (C.mapTally['2'] || 0) > 0,
        'rows=' + C.mapRows + ' cols=' + JSON.stringify(C.mapCols) + ' tally=' + JSON.stringify(C.mapTally));
      check('(G2) ' + L + ': IS_FIELD_THEME が期待どおり (' + t.field + ')',
        C.isFieldTheme === t.field,
        'IS_FIELD_THEME=' + C.isFieldTheme + ' scenarioId=' + C.scenarioId +
        ' rooms=' + JSON.stringify(C.rooms) + ' corridors=' + JSON.stringify(C.corridors));
      if (t.fieldGeo !== null) {
        // ★Phase 1 の主戦場 (index.html:3323 の帯マスク分岐) を実際に通っている証拠
        check('(G3) ' + L + ': FIELD_GEO_ACTIVE === ' + t.fieldGeo + ' (帯マスク分岐を実際に通っている)',
          C.fieldGeoActive === t.fieldGeo,
          'FIELD_GEO_ACTIVE=' + C.fieldGeoActive + ' FIELD_MODE=' + C.fieldMode +
          ' 床=' + (C.mapTally['0'] || 0) + ' レア床=' + (C.mapTally['1'] || 0) +
          ' 岩盤=' + (C.mapTally['2'] || 0));
      }
      check('(G4) ' + L + ': ENEMY_SPAWNS が 1 件以上で [key,tx,ty] 形',
        C.spawnsShapeOk === true, 'len=' + C.spawnsLen + ' 例=' +
        (C.spawnsJson === '<none>' ? '<none>' : C.spawnsJson.slice(0, 80)));
      check('(G5) ' + L + ': wallPattern / floorPattern が両側とも非 null (フォールバック同士の比較でない)',
        C.patterns.wall && C.patterns.floor && B.patterns.wall && B.patterns.floor,
        'cur=' + JSON.stringify(C.patterns) + ' base=' + JSON.stringify(B.patterns));
      check('(G6) ' + L + ': mapCanvas が PNG dataURL を返し寸法が 0 でない',
        typeof C.canvasUrl === 'string' && C.canvasUrl.indexOf('data:image/png;base64,') === 0 &&
        C.canvasUrl.length > 1000 && C.canvasW > 0 && C.canvasH > 0 && !C.renderErr,
        'w=' + C.canvasW + ' h=' + C.canvasH + ' urlLen=' + (C.canvasUrl || '').length +
        ' cam=' + JSON.stringify(C.cam) + (C.renderErr ? ' renderErr=' + C.renderErr : ''));
      // 罠/宝箱の母集団: 座標列が空でなく、範囲内で、mapData 上が床 (=生成が実際に走った証拠)
      const md = (C.mapJson !== '<none>') ? JSON.parse(C.mapJson) : null;
      const inMap = (p) => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) &&
        p[0] >= 0 && p[0] < 72 && p[1] >= 0 && p[1] < 28;
      const onFloor = (p) => !!(md && md[p[1]] && md[p[1]][p[0]] === 0);
      const trapsOk = Array.isArray(C.traps) && C.traps.length > 0 &&
        C.traps.every(p => inMap(p) && onFloor(p));
      check('(G7) ' + L + ': traps が 1 件以上・範囲内・床の上 (trapCount=' + C.trapCount + ')',
        trapsOk, 'n=' + (Array.isArray(C.traps) ? C.traps.length : C.traps) +
        ' 例=' + JSON.stringify(Array.isArray(C.traps) ? C.traps.slice(0, 4) : C.traps));
      const chestsOk = Array.isArray(C.chests) && C.chests.length > 0 &&
        C.chests.every(p => inMap(p));
      check('(G8) ' + L + ': roomChests が 1 件以上・範囲内 (hiddenChestCount=' + C.hiddenChestCount + ')',
        chestsOk, 'n=' + (Array.isArray(C.chests) ? C.chests.length : C.chests) +
        ' 例=' + JSON.stringify(Array.isArray(C.chests) ? C.chests.slice(0, 4) : C.chests));

      // ── assert 1: mapData 全体の SHA-256 ──
      const h1c = sha256(String(C.mapJson)), h1b = sha256(String(B.mapJson));
      check('(1) ' + L + ': mapData 全体の SHA-256 が baseline と一致',
        h1c === h1b && isHex64(h1c) && C.mapJson !== '<none>',
        'cur=' + h1c.slice(0, 16) + ' base=' + h1b.slice(0, 16) +
        ' 床=' + (C.mapTally['0'] || 0) + ' レア床=' + (C.mapTally['1'] || 0) + ' 岩盤=' + (C.mapTally['2'] || 0));

      // ── assert 2: ENEMY_SPAWNS の JSON ──
      check('(2) ' + L + ': ENEMY_SPAWNS の JSON が baseline と一致',
        C.spawnsJson === B.spawnsJson && C.spawnsJson !== '<none>',
        'n=' + C.spawnsLen + '/' + B.spawnsLen +
        (C.spawnsJson === B.spawnsJson ? ' ' + String(C.spawnsJson).slice(0, 70)
          : ' cur=' + String(C.spawnsJson).slice(0, 120) + ' base=' + String(B.spawnsJson).slice(0, 120)));

      /* ── assert 3: mapCanvas.toDataURL の SHA-256 ★golden 方式 ──────────────
       * ⚠ baseline (c2ab252) とは**比べない**。絵は意図的に変わるので、固定コミット比較は
       *   1 度の見た目変更で自己失効して赤いまま安定する。上の UPDATE_GOLDEN の注記を読むこと。
       * ⚠ 「描いていること」の下支えは assert (3b) と (G1) が担う。SHA が一致するだけでは
       *   真っ白な canvas を焼き付けても緑になってしまう。 */
      const h3c = sha256(String(C.canvasUrl)), h3b = sha256(String(B.canvasUrl));
      G.check(check, '(3) ' + L + ': mapCanvas.toDataURL の SHA-256 が golden と一致',
        '3-' + L, h3c);
      check('(3b) ' + L + ': canvas が実体を持つ (真っ白/未描画を golden に焼き付けない)',
        isHex64(h3c) && C.canvasUrl !== '<none>' && C.canvasW > 0 && C.canvasH > 0 &&
        String(C.canvasUrl).length > 5000,
        'size=' + C.canvasW + 'x' + C.canvasH + ' dataURL長=' + String(C.canvasUrl).length +
        ' cam=' + JSON.stringify(C.cam) + ' / baselineSHA=' + h3b.slice(0, 16) + ' (参考値)');

      // ── assert 4 (★本丸): 除外ロジック 4 箇所の同値性 ──
      const jt = JSON.stringify(C.traps), jtb = JSON.stringify(B.traps);
      check('(4a) ' + L + ': traps の座標列が baseline と一致 (spawnTraps の除外ロジック)',
        jt === jtb && trapsOk,
        'n=' + (Array.isArray(C.traps) ? C.traps.length : -1) +
        (jt === jtb ? ' ' + jt.slice(0, 90) : '\n        cur =' + jt + '\n        base=' + jtb));
      const jc = JSON.stringify(C.chests), jcb = JSON.stringify(B.chests);
      check('(4b) ' + L + ': roomChests の座標列が baseline と一致 ' +
        '(玄室→隠し→探索→竜の財宝 の push 順込み・[tx,ty,hidden,locked,mimic])',
        jc === jcb && chestsOk,
        'n=' + (Array.isArray(C.chests) ? C.chests.length : -1) +
        (jc === jcb ? ' ' + jc.slice(0, 90) : '\n        cur =' + jc + '\n        base=' + jcb));

      // ── assert 5 (仕様書「検証」節 5): 新定数の実値 ──────────────────────
      //   ⚠ index.html には検証シームを 1 行も足していない。classic script 直下の const は
      //     window に載らないが、page.evaluate はグローバルスコープでコンパイルされるので
      //     bare 名で読める (mapData / ROOMS と同じ経路で実測済み)。
      const E = t.expect;
      const jExc = JSON.stringify(C.excludedRooms), jChe = JSON.stringify(C.chestExcludedRooms);
      check('(5a) ' + L + ': START_TX / START_TY の実値が ' + E.startTx + ' / ' + E.startTy,
        C.startTx === E.startTx && C.startTy === E.startTy,
        'START_TX=' + C.startTx + ' START_TY=' + C.startTy +
        ' MAPDEF.start=' + JSON.stringify(C.mapdefStart));
      check('(5b) ' + L + ': BOSS_ROOM_IDX の実値が ' + E.boss + ' (= ROOMS.length-1 と一致する既定)',
        C.bossRoomIdx === E.boss && C.roomsLen === E.rooms && C.bossRoomIdx === C.roomsLen - 1,
        'BOSS_ROOM_IDX=' + C.bossRoomIdx + ' ROOMS.length=' + C.roomsLen);
      check('(5c) ' + L + ': EXCLUDED_ROOMS の実値が ' + JSON.stringify(E.excluded) +
        ' (罠/隠し宝箱/探索宝箱)',
        jExc === JSON.stringify(E.excluded), 'EXCLUDED_ROOMS=' + jExc);
      check('(5d) ' + L + ': ROOM_CHEST_EXCLUDED_ROOMS の実値が ' + JSON.stringify(E.chestExcluded) +
        ' (玄室宝箱専用)',
        jChe === JSON.stringify(E.chestExcluded), 'ROOM_CHEST_EXCLUDED_ROOMS=' + jChe);
      check('(5e) ' + L + ': OBJECTIVE_ROOMS の実値が ' + E.objective,
        C.objectiveRooms === E.objective, 'OBJECTIVE_ROOMS=' + C.objectiveRooms);
      // ⭐ 仕様書「計画書の誤り②」を踏んでいないことの静的な証明。
      //    2 部屋では {1} vs {0,1} で**必ず別物**。統合すると山場部屋に玄室宝箱が湧き始める。
      //    ⚠ 母集団ガード: 両方とも配列で 1 件以上 (両方 '<none>' で「違う」を名乗らせない)。
      check('(5f) ⭐' + L + ': EXCLUDED_ROOMS と ROOM_CHEST_EXCLUDED_ROOMS が ' +
        (E.splitSets ? '**別物** ({1} vs {0,1} = 誤り②を踏んでいない証明)'
                     : '一致 (3部屋ではたまたま同じ値になるだけ)'),
        Array.isArray(C.excludedRooms) && C.excludedRooms.length > 0 &&
        Array.isArray(C.chestExcludedRooms) && C.chestExcludedRooms.length > 0 &&
        (E.splitSets ? jExc !== jChe : jExc === jChe),
        'EXCLUDED_ROOMS=' + jExc + ' / ROOM_CHEST_EXCLUDED_ROOMS=' + jChe);

      // ── (R3) リビジョン負制御 (ランタイム版) ────────────────────────────
      //   baseline ページ上に Phase 1 の定数が**存在しない**こと = 本当に別リビジョンを
      //   読んでいる証拠。⚠ 母集団ガード (baseline の mapData が生きている) を必ず併記する。
      check('(R3) ' + L + ': baseline 側のページには START_TX / BOSS_ROOM_IDX / EXCLUDED_ROOMS が存在しない',
        B.startTx === '<none>' && B.startTy === '<none>' && B.bossRoomIdx === '<none>' &&
        B.excludedRooms === '<none>' && B.chestExcludedRooms === '<none>' &&
        B.objectiveRooms === '<none>' && B.mapRows === 28,
        'base: START_TX=' + B.startTx + ' BOSS_ROOM_IDX=' + B.bossRoomIdx +
        ' EXCLUDED_ROOMS=' + JSON.stringify(B.excludedRooms) +
        ' (baseline mapData rows=' + B.mapRows + ' = ページは生きている)');

      // ── (M1) 変異負制御が本当に注入されたか ─────────────────────────────
      //   ⚠ 「注入したつもりで効いていない」= 全 PASS = 偽の安心。ここで必ず実測する。
      check('(M1) ' + L + ': ' + (MUTATE === null
          ? '無変異で走っている (cur / base とも欠陥注入なし)'
          : '--mutate ' + MUTATE + ' が cur 側に実際に注入された (base 側は無変異のまま)'),
        MUTATE === null
          ? (C.mut === null && B.mut === null)
          : !!(C.mut && C.mut.kind === MUTATE && C.mut.applied === true && B.mut === null),
        'cur=' + JSON.stringify(C.mut) + ' base=' + JSON.stringify(B.mut));

      // ── assert 6: pageerror / console.error / 404 ──
      //   ★項目 3 で <script src="js/df-mapdef.js"> を足すので、その 404 はここで必ず出る。
      check('(6a) ' + L + ': 作業ツリー側の pageerror / console.error / 4xx が 0 件',
        cur.errs.length === 0, cur.errs.slice(0, 4).join(' | ') || 'none');
      check('(6b) ' + L + ': baseline 側の pageerror / console.error / 4xx が 0 件',
        base.errs.length === 0, base.errs.slice(0, 4).join(' | ') || 'none');

      await cur.page.close();
      await base.page.close();
    }

    // ── 0 (続き): サーバが実際にどこから配信したか ──────────────────────────
    mark('各サーバが実際に配信したディレクトリの検算 (ベースライン置換の空振り防止)');
    {
      const cf = recCur.servedFrom['/index.html'];
      const bf = recBase.servedFrom['/index.html'];
      check('(0e) 作業ツリー側サーバは ROOT から index.html を配信した',
        !!cf && path.resolve(cf) === path.resolve(ROOT), 'from=' + cf);
      check('(0f) baseline 側サーバは BASELINE_DIR から index.html を配信した (ROOT へフォールバックしていない)',
        !!bf && path.resolve(bf) === path.resolve(BASELINE_DIR), 'from=' + bf);
      const jsFallback = recBase.fallback.filter(u => /\.(html|js)$/i.test(u));
      check('(0g) baseline 側が .html/.js を作業ツリーから借りていない',
        jsFallback.length === 0,
        (jsFallback.slice(0, 5).join(', ') || 'none') +
        ' (アセットのフォールバックは ' + recBase.fallback.length + ' 件で許容)');
      console.log('[drv]   baseline が配信したパス数: ' + Object.keys(recBase.servedFrom).length +
        ' / アセット借用: ' + recBase.fallback.length + ' / 404: ' + recBase.notFound.length +
        ' (除外対象の 404: ' + (recBase.ignored404.join(', ') || 'なし') + ')');
      console.log('[drv]   cur      が配信したパス数: ' + Object.keys(recCur.servedFrom).length +
        ' / 404: ' + recCur.notFound.length +
        ' (除外対象の 404: ' + (recCur.ignored404.join(', ') || 'なし') + ')');
      // ⚠ 母集団ガード: そもそも 1 本もリクエストが来ていなければ 404 が 0 なのは当たり前 (真空 PASS)。
      check('(0h) どちらのサーバも (favicon.ico を除いて) 404 を返していない・かつ実際に配信している',
        recCur.notFound.length === 0 && recBase.notFound.length === 0 &&
        Object.keys(recCur.servedFrom).length > 10 && Object.keys(recBase.servedFrom).length > 10,
        'cur=' + (recCur.notFound.slice(0, 4).join(', ') || 'none') + ' (配信 ' + Object.keys(recCur.servedFrom).length + ' 本)' +
        ' / base=' + (recBase.notFound.slice(0, 4).join(', ') || 'none') + ' (配信 ' + Object.keys(recBase.servedFrom).length + ' 本)');
    }

  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
    if (srvBase) { try { srvBase.close(); } catch (e) {} }
  }

  /* ★golden の空振り防止 2 段 (tools/_golden.js の「危険と封じ方」(1)(2))。
   *   GC1 = 8 通りの canvas SHA が**相互に異なる**こと。描画が死んで一様になった状態を
   *         golden に焼き付けても、ここで即座に落ちる。⚠ 件数ではなく identity で測る。
   *   G0  = golden のキー集合と今回の実行が完全一致すること (assert をこっそり消していない)。
   * ⚠⚠ **必ず `const pass = …` より前に置くこと**。後ろに置くと results には積まれるのに
   *   pass に数えられず「198/200 PASS なのに FAILED 一覧が空」という不可解な出方をする
   *   (2026-08-04 に実際に踏んだ)。
   * ⚠ ラベルは (GC1)。既存の per-scenario assert が (G1) を使っているので衝突させない。 */
  G.distinct(check, '(GC1) 8 通りの mapCanvas SHA が相互に異なる (描画が死んで一様になっていない)', '3-');
  G.finish(check);

  const pass = results.filter(r => r.ok).length;

  console.log('\n=== ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('--- FAILED ---'); failed.forEach(f => console.log('  ' + f.name + ' — ' + f.detail)); }

  // ── 変異負制御の判定 (exit code の意味を分ける) ────────────────────────────
  //   exit 1 … 欠陥が assert に捕まった = 負のコントロール成功 (期待どおり)
  //   exit 3 … 欠陥を注入できていない   = **装置の故障**。FAIL を「捕まえた」と誤読させない
  //   exit 4 … 注入できたのに 1 つも落ちない = **assert の穴**。
  //            ⚠ 穴は「変異を弱める」のではなく「assert を足す」で塞ぐこと。
  if (MUTATE !== null) {
    const notInjected = failed.filter(f => /^\(M1\)/.test(f.name));
    const caught = failed.filter(f => !/^\(M1\)/.test(f.name));
    if (notInjected.length) {
      console.error('\n[driver] ⚠ --mutate ' + MUTATE + ' が実際には注入できていません (' +
        notInjected.length + ' ターゲット) = 装置の故障。負のコントロールとして無効なので exit 3。');
      process.exit(3);
    }
    console.log('\n[drv] 変異負制御 --mutate ' + MUTATE + '  (' + MUTATIONS[MUTATE].desc + ')');
    console.log('[drv]   注入: 全 ' + TARGETS.length + ' ターゲットで確認済み / これを捕まえた assert = ' +
      caught.length + ' 件');
    const byName = {};
    caught.forEach(f => { const k = (f.name.match(/^\([^)]+\)/) || ['(?)'])[0]; byName[k] = (byName[k] || 0) + 1; });
    console.log('[drv]   内訳: ' + Object.keys(byName).map(k => k + ' x' + byName[k]).join(', '));
    if (caught.length === 0) {
      console.error('[driver] ⚠⚠ 欠陥を注入したのに落ちた assert が 0 件 = **assert の穴**。' +
        ' 変異を弱めて辻褄を合わせるのは禁止。assert を足して塞ぐこと。');
      process.exit(4);
    }
  }
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('[driver] 例外: ' + (e && e.stack || e));
  process.exit(3);
});
