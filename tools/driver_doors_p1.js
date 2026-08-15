#!/usr/bin/env node
/*
 * driver_doors_p1.js — 扉システム P1 (データ層のみ) の測定装置
 * ═════════════════════════════════════════════════════════════════════════════
 * 対象: js/df-mapdef.js に足した doors / DOOR_STATES / DOOR_ORIENTATIONS / doorBlocks。
 *
 * ■ なぜ puppeteer ではなく素の node なのか
 *   P1 は **DOM に一切触れない純粋関数**しか足していない (buildMapData も isTileWall も
 *   1 命令も変えていない)。ブラウザを立てても測れるものが増えず、代わりに http + 実 Chrome の
 *   フレーク要因だけが増える。df-mapdef.js は classic script + IIFE なので、window の
 *   スタブを 1 つ与えれば node からそのまま同じコードを実行できる。
 *   ⚠ したがって本ドライバは「ゲームに配線されたこと」は**測っていない**。配線は P2 以降の
 *     担当で、そのときは実ブラウザのドライバを別に立てる。ここで緑になったことを
 *     「扉が動いた」の根拠にしてはならない。
 *
 * ■ ⚠ 真空 PASS への対策
 *   「往復同一性が保たれている」は **doors キーが両側に無くても真になる**。つまり実装を
 *   1 行も入れていなくても §A は全部緑になりうる。そこで:
 *     ・§A に「プリセットが実際に doors キーを持つ」ガードを同居させる
 *     ・§F で **baseline (扉が入る直前のコミット) を実際に読み込み**、そこには
 *       DOOR_STATES も doors キーも無いことを実測する = 装置が新機能を見ている証明
 *   ⚠⚠ baseline は **記号 HEAD ではなく sha 直書き**。この変更をコミットした瞬間に
 *     HEAD == 作業ツリーになり、負のコントロールが自分自身と比較して無言で死ぬため。
 *
 * 使い方:  node tools/driver_doors_p1.js
 * 終了コード: 0 = 全 PASS / 1 = FAIL あり / 3 = 装置自体の異常 (読み込み失敗など)
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const MODULE_REL = "js/df-mapdef.js";

/* ★扉が入る**直前**のコミット。⚠ "HEAD" と書いてはいけない (節頭の注記を参照)。 */
const BASELINE_SHA = "aef096bc5c2c9f90d8101eecaed4c3478aaf80b3";

// ── 集計 ────────────────────────────────────────────────────────────────────
let pass = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fails.push(name + (detail ? " — " + detail : "")); console.log("  FAIL  " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

// ── df-mapdef.js を window スタブ付きで評価して DFMapDef を取り出す ──────────
function loadModule(source, label) {
  const win = {};
  const sandbox = { window: win, console: console, fetch: undefined };
  sandbox.globalThis = sandbox;
  try {
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: label });
  } catch (e) {
    console.error("装置異常: " + label + " を評価できません: " + (e && e.message));
    process.exit(3);
  }
  if (!win.DFMapDef) {
    console.error("装置異常: " + label + " が window.DFMapDef を作りませんでした");
    process.exit(3);
  }
  return win.DFMapDef;
}

function baselineSource() {
  try {
    return execFileSync("git", ["show", BASELINE_SHA + ":" + MODULE_REL],
                        { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    console.error("装置異常: baseline " + BASELINE_SHA.slice(0, 7) + " から " + MODULE_REL +
                  " を取り出せません: " + (e && e.message));
    process.exit(3);
  }
}

const M = loadModule(fs.readFileSync(path.join(ROOT, MODULE_REL), "utf8"), "worktree/" + MODULE_REL);
const B = loadModule(baselineSource(), "baseline/" + MODULE_REL);

// ── 補助 ────────────────────────────────────────────────────────────────────
const J = (o) => JSON.stringify(o);
const deepEq = (a, b) => J(a) === J(b);
const omit = (o, k) => { const c = JSON.parse(J(o)); delete c[k]; return c; };
function lintCodes(mod, def) {
  const r = mod.lintMapDef(def);
  return { ok: r.ok,
           errors: r.errors.map((x) => x.code),
           warnings: r.warnings.map((x) => x.code) };
}
/* 扉を 1 枚以上持つ有効な mapDef を作る (プリセットを土台にする = boss ちょうど 1 つ等を満たす) */
function withDoors(mod, doors) {
  const d = mod.clone(mod.DEFAULT_DUNGEON);
  d.doors = doors;
  return mod.sanitize(d);
}

console.log("扉システム P1 — データ層の測定");
console.log("  worktree : " + path.join(ROOT, MODULE_REL));
console.log("  baseline : " + BASELINE_SHA.slice(0, 7) + ":" + MODULE_REL);

// ══ §A 往復同一性 (最重要の不変条件) ════════════════════════════════════════
section("§A 往復同一性 — 既存マップを 1 バイトも変えていないこと");
{
  const dg = M.DEFAULT_DUNGEON, fl = M.DEFAULT_FIELD;

  /* ⚠ このガードが無いと §A は「両側に doors が無い」でも緑になる = 真空 PASS。 */
  check("A0a DEFAULT_DUNGEON が doors キーを持つ (真空 PASS 対策)",
        Object.prototype.hasOwnProperty.call(dg, "doors"), "keys=" + Object.keys(dg).join(","));
  check("A0b DEFAULT_FIELD が doors キーを持つ (真空 PASS 対策)",
        Object.prototype.hasOwnProperty.call(fl, "doors"));
  check("A0c 既定は null (空配列ではない)", dg.doors === null && fl.doors === null,
        "dungeon=" + J(dg.doors) + " field=" + J(fl.doors));

  check("A1 sanitize(DEFAULT_DUNGEON) が DEFAULT_DUNGEON と deep-equal", deepEq(M.sanitize(dg), dg));
  check("A2 sanitize(DEFAULT_FIELD) が DEFAULT_FIELD と deep-equal", deepEq(M.sanitize(fl), fl));
  check("A3 JSON 往復後も deep-equal (export→import→export)",
        deepEq(M.sanitize(JSON.parse(J(dg))), dg) && deepEq(M.sanitize(JSON.parse(J(fl))), fl));
  check("A4 sanitize が冪等 (何度通しても同じ形へ収束)",
        deepEq(M.sanitize(M.sanitize(dg)), M.sanitize(dg)) &&
        deepEq(M.sanitize(M.sanitize(fl)), M.sanitize(fl)));

  /* キー順まで一致していること。deep-equal を JSON 文字列比較で見ているので順序も込みだが、
   * 「なぜ落ちたか」を読めるように順序だけの assert を分けて置く。 */
  check("A5 sanitize 出力のキー順がプリセットと一致",
        J(Object.keys(M.sanitize(dg))) === J(Object.keys(dg)),
        J(Object.keys(M.sanitize(dg))) + " vs " + J(Object.keys(dg)));
}

// ══ §B doors の形 ═══════════════════════════════════════════════════════════
section("§B doors の形 — fixDoor が採るもの / 落とすもの");
{
  const base = M.DEFAULT_DUNGEON;

  check("B1 doors 未指定 → null", M.sanitize(omit(base, "doors")).doors === null);
  check("B2 doors:[] → null (空配列にしない = 往復同一性)",
        withDoors(M, []).doors === null, J(withDoors(M, []).doors));

  const one = withDoors(M, [{ id: "door_a", tx: 33, ty: 11,
                              orientation: "horizontal", state: "locked", requiredKey: "rusty_key" }]).doors;
  check("B3a 正常な扉が 1 枚残る", Array.isArray(one) && one.length === 1, J(one));
  check("B3b 6 キーちょうど (余計なキーが生えない)",
        one && J(Object.keys(one[0])) === J(["id", "tx", "ty", "orientation", "state", "requiredKey"]),
        one && J(Object.keys(one[0])));
  check("B3c 値がそのまま通る",
        one && one[0].id === "door_a" && one[0].tx === 33 && one[0].ty === 11 &&
        one[0].orientation === "horizontal" && one[0].state === "locked" &&
        one[0].requiredKey === "rusty_key", J(one && one[0]));

  const coerced = withDoors(M, [{ tx: 1, ty: 1, state: "ajar", orientation: "diagonal" }]).doors;
  check("B4 未知の state は 'closed' へ寄る (fail-safe 側)",
        coerced && coerced[0].state === "closed", J(coerced && coerced[0]));
  check("B5 未知の orientation は 'vertical' へ寄る",
        coerced && coerced[0].orientation === "vertical");
  check("B6 id が無ければ通し番号で採番",
        coerced && coerced[0].id === "d0", J(coerced && coerced[0].id));

  const dropped = withDoors(M, [{ id: "no_coords" }, null, "文字列", { tx: 5, ty: 5 }]).doors;
  check("B7 座標の無い扉 / 非オブジェクトは落ちる (残るのは 1 枚)",
        dropped && dropped.length === 1, J(dropped));

  /* ⚠ 提案 (door-system.md) の不採用フィールドが**混ざり込まない**こと。ここが緩むと
   *   blocking と state の二重管理が復活し「表示は開いているのに通れない」が表現可能になる。 */
  const noisy = withDoors(M, [{ id: "d", tx: 2, ty: 2, blocking: true, locked: true,
                                interactable: false, openDurationMs: 250, target: "room_02",
                                width: 2, height: 1 }]).doors;
  check("B8 不採用フィールド (blocking/locked/interactable/openDurationMs/target/width/height) は残らない",
        noisy && J(Object.keys(noisy[0])) === J(["id", "tx", "ty", "orientation", "state", "requiredKey"]),
        noisy && J(Object.keys(noisy[0])));

  const clamped = withDoors(M, [{ id: "c", tx: 999, ty: -5 }]).doors;
  check("B9 範囲外の座標はグリッドへクランプされる",
        clamped && clamped[0].tx === M.GRID_W - 1 && clamped[0].ty === 0, J(clamped && clamped[0]));

  const rt = withDoors(M, [{ id: "d0", tx: 3, ty: 4, orientation: "horizontal", state: "hidden",
                             requiredKey: null }]);
  check("B10 扉ありの mapDef も sanitize が冪等",
        deepEq(M.sanitize(rt), rt) && deepEq(M.sanitize(JSON.parse(J(rt))), rt));
}

// ══ §C doorBlocks — 通行判定の唯一の正 ══════════════════════════════════════
section("§C doorBlocks — 未知は必ず塞ぐ側 (fail-safe)");
{
  check("C1 'open' は通す", M.doorBlocks("open") === false);
  check("C2 'broken' は通す", M.doorBlocks("broken") === false);
  check("C3 'closed' / 'locked' / 'hidden' は塞ぐ",
        M.doorBlocks("closed") === true && M.doorBlocks("locked") === true &&
        M.doorBlocks("hidden") === true);
  /* ⚠⚠ ここが本節の芯。扉の判定で fail-open は「閉じた扉をすり抜けた」= 完了条件の違反。 */
  check("C4 未知の値 / undefined / null は塞ぐ (fail-open にしない)",
        M.doorBlocks("xyzzy") === true && M.doorBlocks(undefined) === true &&
        M.doorBlocks(null) === true && M.doorBlocks("") === true);
  check("C5 DOOR_STATES の 5 値がすべて doorBlocks で判定できる",
        M.DOOR_STATES.length === 5 &&
        M.DOOR_STATES.filter((s) => M.doorBlocks(s) === false).length === 2,
        J(M.DOOR_STATES));
  check("C6 DOOR_ORIENTATIONS は horizontal / vertical の 2 値",
        J(M.DOOR_ORIENTATIONS) === J(["horizontal", "vertical"]));
}

// ══ §D lint — 向きに依存しない不正だけを鳴らす ══════════════════════════════
section("§D lint door-duplicate");
{
  check("D1 既定プリセット 2 種で door-duplicate が鳴らない",
        lintCodes(M, M.DEFAULT_DUNGEON).warnings.indexOf("door-duplicate") < 0 &&
        lintCodes(M, M.DEFAULT_FIELD).warnings.indexOf("door-duplicate") < 0);

  const ok2 = withDoors(M, [{ id: "a", tx: 10, ty: 10 }, { id: "b", tx: 11, ty: 10 }]);
  check("D2 別タイル別 id の扉 2 枚では鳴らない",
        lintCodes(M, ok2).warnings.indexOf("door-duplicate") < 0,
        J(lintCodes(M, ok2).warnings));

  const dupTile = withDoors(M, [{ id: "a", tx: 10, ty: 10 }, { id: "b", tx: 10, ty: 10 }]);
  check("D3 同じタイルに 2 枚 → door-duplicate",
        lintCodes(M, dupTile).warnings.indexOf("door-duplicate") >= 0,
        J(lintCodes(M, dupTile).warnings));

  const dupId = withDoors(M, [{ id: "same", tx: 10, ty: 10 }, { id: "same", tx: 12, ty: 10 }]);
  check("D4 id が重複 → door-duplicate",
        lintCodes(M, dupId).warnings.indexOf("door-duplicate") >= 0,
        J(lintCodes(M, dupId).warnings));

  /* ⚠ warning であって error ではない = 扉が重複していても出発は止まらない。P1 は
   *   データ層だけなので、ここを error にすると既存の出発フローを止めうる。 */
  check("D5 door-duplicate は warning (ok を false にしない)",
        lintCodes(M, dupTile).ok === lintCodes(M, ok2).ok,
        "dup.ok=" + lintCodes(M, dupTile).ok + " / clean.ok=" + lintCodes(M, ok2).ok);

  /* ⚠ P3 で決める設計判断 (扉を壁の上に置くのか床の上に置くのか) を**まだ検査していない**
   *   ことを明示的に固定する。ここが緑のうちは「位置の lint は未実装」が意図どおり。 */
  const onFloor = withDoors(M, [{ id: "f", tx: 30, ty: 13 }]);
  check("D6 位置 (壁/床) の lint は P1 では**わざと未実装**",
        lintCodes(M, onFloor).warnings.filter((c) => c.indexOf("door-on") === 0).length === 0,
        J(lintCodes(M, onFloor).warnings));
}

// ══ §E validate ════════════════════════════════════════════════════════════
section("§E validate — 既存の判定を 1 つも壊していない");
{
  check("E1 既定プリセット 2 種が validate を通る",
        M.validate(M.DEFAULT_DUNGEON).ok === true && M.validate(M.DEFAULT_FIELD).ok === true,
        J(M.validate(M.DEFAULT_DUNGEON).errors));
  const withD = withDoors(M, [{ id: "a", tx: 10, ty: 10 }]);
  check("E2 扉を足しても validate を通る", M.validate(withD).ok === true, J(M.validate(withD).errors));
  /* validate は doors を**見ない**のが P1 の意図 (tiles / graph と違い、扉は個別の物なので
   * 壊れた 1 枚は sanitize が落として lint が知らせる = props とまったく同じ流儀)。 */
  check("E3 validate の issue コード集合が baseline と同一 (判定を増やしていない)",
        J(M.validate(M.DEFAULT_DUNGEON).issues) === J(B.validate(B.DEFAULT_DUNGEON).issues));
}

// ══ §F 負のコントロール — 装置が新機能を見ている証明 ════════════════════════
section("§F 負のコントロール (baseline " + BASELINE_SHA.slice(0, 7) + " = 扉が入る直前)");
{
  check("F1 baseline に DOOR_STATES / doorBlocks が無い",
        B.DOOR_STATES === undefined && B.doorBlocks === undefined,
        "DOOR_STATES=" + J(B.DOOR_STATES) + " doorBlocks=" + typeof B.doorBlocks);
  check("F2 baseline の DEFAULT_DUNGEON は doors キーを持たない",
        !Object.prototype.hasOwnProperty.call(B.DEFAULT_DUNGEON, "doors"),
        J(Object.keys(B.DEFAULT_DUNGEON)));

  /* ⭐ 同じ入力を両版へ通し、**baseline では扉が消える**ことを実測する。これが無いと
   *   §B は「そもそも扉を落とさない実装」でも緑になりうる。 */
  const input = { doors: [{ id: "a", tx: 10, ty: 10, state: "locked" }] };
  const src = Object.assign(JSON.parse(J(B.DEFAULT_DUNGEON)), input);
  check("F3 baseline に同じ入力を通すと扉が消える (新版だけが保持する)",
        B.sanitize(src).doors === undefined &&
        Array.isArray(M.sanitize(Object.assign(JSON.parse(J(M.DEFAULT_DUNGEON)), input)).doors),
        "baseline=" + J(B.sanitize(src).doors));
}

// ══ §G 非退行 — doors 以外は baseline と 1 バイトも変わっていない ═══════════
section("§G 非退行 (doors を除けば baseline と同一)");
{
  check("G1 DEFAULT_DUNGEON が doors を除いて baseline と deep-equal",
        deepEq(omit(M.DEFAULT_DUNGEON, "doors"), B.DEFAULT_DUNGEON));
  check("G2 DEFAULT_FIELD が doors を除いて baseline と deep-equal",
        deepEq(omit(M.DEFAULT_FIELD, "doors"), B.DEFAULT_FIELD));
  check("G3 sanitize 出力が doors を除いて baseline と deep-equal (dungeon)",
        deepEq(omit(M.sanitize(M.DEFAULT_DUNGEON), "doors"), B.sanitize(B.DEFAULT_DUNGEON)));
  check("G4 sanitize 出力が doors を除いて baseline と deep-equal (field)",
        deepEq(omit(M.sanitize(M.DEFAULT_FIELD), "doors"), B.sanitize(B.DEFAULT_FIELD)));

  /* tiles / props / graph の扱いを 1 つも動かしていないこと (doors は同じ流儀で**足しただけ**)。 */
  const probe = { tiles: { enc: "rle", data: "2x2016" }, props: [{ kind: "torch", tx: 9, ty: 9 }],
                  graph: { entry: "n0", nodes: [] } };
  const mProbe = M.sanitize(Object.assign(JSON.parse(J(M.DEFAULT_DUNGEON)), probe));
  const bProbe = B.sanitize(Object.assign(JSON.parse(J(B.DEFAULT_DUNGEON)), probe));
  check("G5 tiles / props / graph の sanitize 結果が baseline と同一",
        J(mProbe.tiles) === J(bProbe.tiles) && J(mProbe.props) === J(bProbe.props) &&
        J(mProbe.graph) === J(bProbe.graph),
        "tiles=" + J(mProbe.tiles) + " props=" + J(mProbe.props));

  check("G6 lint の issue コード集合が baseline と同一 (扉なしのプリセット)",
        J(lintCodes(M, M.DEFAULT_DUNGEON)) === J(lintCodes(B, B.DEFAULT_DUNGEON)) &&
        J(lintCodes(M, M.DEFAULT_FIELD)) === J(lintCodes(B, B.DEFAULT_FIELD)),
        J(lintCodes(M, M.DEFAULT_DUNGEON)) + " vs " + J(lintCodes(B, B.DEFAULT_DUNGEON)));
}

// ── 集計 ────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PASS " + pass + " / FAIL " + fails.length);
if (fails.length) {
  console.log("\n落ちた assert:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log("すべて緑 — P1 (データ層) はゲームの挙動を 1bit も変えていません");
process.exit(0);
