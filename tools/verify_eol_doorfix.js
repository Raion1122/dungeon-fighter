#!/usr/bin/env node
/*
 * verify_eol_doorfix.js — 依頼書 #65「行末を CRLF へ一本化 + 扉の測定台を撤退スイッチから降ろす」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-10_eol-unify-and-door-fixture.md` の §8 を機械的に測る。
 *
 * ■ 何を測るか (依頼書 §8 の番号と 1:1)
 *    §0 装置 … 母集団 (追跡テキスト 400 本以上) / 期待の行末を **2 経路**で突き合わせる /
 *              扉の fixture が実際に立っているか
 *    §1 行末 … ディスクが check-attr の答えどおり / 隔離ツリーと byte 一致 /
 *              複数行アンカー 2 本が両ツリーで 1 箇所ちょうど / フックは必ず LF で shebang /
 *              行末変換が blob を 1 本も動かしていない
 *    §2 扉   … 3 本のドライバに `fortfold` が 1 件も無い / 合成ノードの扉が規則どおり /
 *              ノエルの条件 / 抽選が効いている / Math.random を引かない
 *    §3 恒等 … driver_doors_p5 の §1x が基準の assert を 1 本も失っていない (逐語差分は例外表で明示) /
 *              本番 5 ファイルの blob が HEAD と同一
 *
 * ■ ⭐⭐⭐ 測り方の 3 原則 (これが本ドライバの背骨)
 *    ① **期待の行末を `.gitattributes` の写経で書かない**。ドライバが書き下すのは
 *       「配信物 = ブラウザが読む *.html / js/*.js / audio.js は CRLF、それ以外は LF」という
 *       **契約**だけ。実際の期待値は `git check-attr eol` に聞く。2 経路が食い違えば (0b) が赤くなる。
 *    ② **行末は必ずバイトで測る**。⚠⚠⚠ grep で測ると LF しか無いファイルに「CR 行数 = 総行数」が
 *       返り、**真逆の結論**が出る (#65 項目1 が実際に踏んだ)。ここでは Buffer を数える。
 *    ③ 観測するのは「行末のバイト」と「扉の state」だけ。**ファイルの中身 (トークン列) は観測しない**。
 *
 * ■ ⭐⭐⭐ 変異は「ディスクを書き換える」のではなく「**読み口を差し替える**」
 *    このドライバの測定対象は配信 HTML ではなく**作業ツリーそのもの**なので、従来の
 *    「配信をメモリ上で差し替える」に対応するのは **readTracked() / attrsFor() という 1 本の読み口**。
 *    ⇒ 作業ツリーは 1 バイトも変わらないので**復元漏れが原理的に起きない**
 *      (⛔ `.gitattributes` や `js/road-events.js` を実際に書き換える実装にしない。
 *        子プロセスが落ちた瞬間に本番ツリーが壊れたまま残る)。
 *    ⚠ 読み口には **purpose** を持たせてある。purpose 無しで「そのファイルを読んだら全部差し替え」に
 *      すると、例えば `anchorlf` (アンカーの行末を LF へ戻す変異) が
 *      `tools/verify_road_ambush.js` の byte 比較 (1b) まで赤くしてしまい、
 *      「何を検出したのか分からない変異」になる。
 *
 * ■ ⚠⚠ 踏んだ罠 (実測で確かめた。消さないこと)
 *    - `git check-attr --stdin` に `-z` を付けるなら**入力も NUL 区切り**にすること。改行区切りのままだと
 *      git が全体を 1 本のパスと見なし `Filename too long` を 840 回吐く。
 *      ⚠ `-z` 無しだと**非 ASCII パス 98 本の照合が黙って失敗**し「eol 未指定 98 本」という偽の結論が出る。
 *    - `* text=auto eol=lf` の下でも **binary は `eol: lf` と報告される** (`text: unset` が効いて
 *      git が eol を無視するだけ)。⇒ **eol 属性だけで binary を判定しない**。`text` 属性と NUL 走査の 2 経路で切る。
 *    - `git status` を停止条件に使わない。行末変換は **stat-dirty** を作るので ` M` が出続ける。
 *      正は `git diff` (内容比較まで進む) と **blob OID**。(1e) はこの 2 本に分割してある。
 *    - ⭐ **未コミットの `.gitattributes` 編集は `git worktree add` のチェックアウトに効かない**
 *      (2026-09-11 実測)。チェックアウトは**取り出す木の属性**を読むため。
 *      ⇒ 依頼書 §8 の「`attrdrop` は (1b) を赤にする」は成立しない。(0b)(1a) が受け止める。
 *    - ⭐⭐ **畳んだ砦の実在ノードは 2 件・扉 1 枚しか残っていない** (2026-09-11 実測)。
 *      ⇒ 「実在ノードの扉が規則どおり」で seed の退行 (seedplain) を捕まえるのは**原理的に無理**
 *        (その 1 枚は `orc-fort/n4` でも素の `n4` でも同じ答えになる)。合成ノードの 8 枚 = (2b) が捕まえる。
 *      ⇒ 自作マップ版 fixture (fixturefake) も、ノエルの**署名比較では捕まらない**
 *        (MAPDEF.doors が盤面ごと乗っ取るので実在側も偽物になり、偽物どうしが一致する)。
 *        ⇒ (2c) の 1 本目の節「fixture を入れても実在ノードの扉が 1 枚も動かない」で捕まえる。
 *    - ⚠⚠ `git worktree list` に**古い baseline ツリーが 10 本**残っている (`df_step2_baseline` 等)。
 *      いずれも `.gitattributes` を持たない古いコミットなので⛔**測定台に使うと偽の結果**が出る。
 *      本ドライバは毎回**自分で新規に作り、finally で必ず撤去する**。
 *
 * ■ 使い方
 *     node tools/verify_eol_doorfix.js
 *     node tools/verify_eol_doorfix.js --negative          (負のコントロールの自己検査)
 *     node tools/verify_eol_doorfix.js --mutate seedplain  (手回し)
 *
 * ⚠ base port 10241 (--negative の子は 10242..10249 を使う。子は逐次実行なので衝突しない)。
 *   `grep -rn '1024[0-9]' tools/*.js` が着手前 0 件 = 未使用を実測済み。
 *   ⚠ 新しい base を掴んだら 1 回 goto して ERR_UNSAFE_PORT が出ないことを確かめること (10080 の前例)。
 *
 * exit 0=全 PASS / 1=FAIL あり (--negative では空振りあり) / 2=環境不足 / 3=変異アンカーの腐敗
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { execFileSync } = require('child_process');

/* ★[#65] 扉の合成ノードの器。⛔ 写経しないこと (3 本のドライバと**同じ器**を使うのが受入の要件)。 */
const FX = require('./_doors_fixture');

/* ⚠⚠ path.resolve 必須。'/' 区切りのまま持つと下の startsWith が必ず false になり配信が全 404、
 *   症状はタイムアウトだけで原因が見えない (恒久教訓)。 */
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const HEADFUL = argv.includes('--headful');
const NEGATIVE = argv.includes('--negative');
const PORT = parseInt(arg('port', '10241'), 10);
const MUTATE = arg('mutate', null);

// ══════════════════════════════════════════════════════════════════════════════
// 契約 (ドライバ側が書き下す。⛔ .gitattributes を読んで写さない)
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐⭐⭐ 裁定 (C) = 既定 LF + 配信物だけ CRLF。
 *   .gitattributes は「全部同じにする」道具ではなく **道具が実際に書き出す姿を宣言する**道具
 *   (例: tools/_golden.js:157 は常に LF で書くので tools/goldens/ は LF が正)。
 * ⚠ 順序 = .gitattributes と同じく**後の行が勝つ**。scripts/hooks/* は最後なので最優先。
 * ⚠ パターンの意味も git に合わせる: スラッシュを含まない `*.html` / `audio.js` は**どの深さでも**当たり、
 *   スラッシュを含む `js/*.js` は**リポジトリ直下の js/ 直下だけ**に当たる。 */
function wantEol(rel) {
  if (/^scripts\/hooks\/[^/]+$/.test(rel)) return 'lf';
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  if (base.endsWith('.html')) return 'crlf';
  if (/^js\/[^/]+\.js$/.test(rel)) return 'crlf';
  if (base === 'audio.js') return 'crlf';
  return 'lf';
}
const isHook = (rel) => /^scripts\/hooks\/[^/]+$/.test(rel);
const isShip = (rel) => !isHook(rel) && wantEol(rel) === 'crlf';

/* (3b) 本チケットが 1 バイトも触っていないことを直接測る本番ファイル。 */
const PROD_FILES = ['index.html', 'tavern.html', 'audio.js', 'world.html', 'town.html'];
/* (2a) 撤退スイッチから降ろした 3 本。 */
const DOOR_DRIVERS = ['tools/driver_doors_p2.js', 'tools/driver_doors_p5.js', 'tools/driver_doors_p8.js'];
const RETREAT_WORD = 'fortfold';
/* (1d) changelog ガードの命綱。CRLF になると Git Bash が bad interpreter で落ちる。 */
const HOOK_SCRIPT = 'scripts/hooks/pre-commit';
/* (1c) 複数行アンカーを持つ唯一のドライバ (全 136 本で 2 本だけ)。 */
const ANCHOR_DRIVER = 'tools/verify_road_ambush.js';
/* (3a) §1x は #62 が台帳導出で正しい形にしてある。#65 は 1 バイトも触らない。
 * ⭐ 「固定コミットと完全一致」型の golden なので**日付と由来**を残す:
 *    da7cce6 = 2026-09-10 時点の origin/main (= #65 に着手する直前の姿)。 */
const P5_BASE_REF = 'da7cce6';
/* (0a) 母集団の下限。⚠ 依頼書の旧「700 本以上」は**達成不能** (テキストは 477 本)。 */
const MIN_TEXT = 400;

/* ★施錠の抽選の**契約をドライバ側で書き下す** (driver_doors_p5 と同じ流儀)。
 * ⛔ 実装の doorLockedByRng を呼んで比べない。実装が「常に closed」に化けても
 *   両方が同じ答えを返して緑になる = 何も測っていない検出器になる。
 * 規則: mulberry32(hashStr(mapDef.id + "/lock/" + doorId))() < 0.25 */
const WANT_LOCK_CHANCE = 0.25;
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function wantLocked(seed, doorId) {
  return mulberry32(hashStr(String(seed) + '/lock/' + doorId))() < WANT_LOCK_CHANCE;
}
/* ⚠⚠ seed は **node id ではなく mapDef.id**。ノード id は 6 シナリオで "n0".."n7" が共通なので、
 *   素の id で引くと全シナリオで同じ扉が施錠される (P5 出荷時の実際の欠陥)。
 *   ⇒ 変異 seedplain はここを素の node id へ戻す。 */
function seedOf(mapId, nodeId) { return MUTATE === 'seedplain' ? String(nodeId) : String(mapId); }

// ══════════════════════════════════════════════════════════════════════════════
// 負のコントロール (9 本。⭐ 「注入できたか」ではなく「**測っている場所に赤が現れるか**」まで設計する)
//   ★[#66 項目7] 9 本目 p5cut を追加 = 逐語凍結をやめた (3a) の負のコントロール
// ══════════════════════════════════════════════════════════════════════════════
const MUT_ORDER = ['eolrevert', 'attrdrop', 'hookscrlf', 'anchorlf', 'armback',
                   'fixturemiss', 'fixturefake', 'seedplain', 'p5cut'];
const MUT_WHY = {
  eolrevert:   'js/road-events.js を LF へ戻す (配信物なので CRLF が正)',
  attrdrop:    '.gitattributes の配信物 CRLF 宣言 3 行のうち `js/*.js text eol=crlf` を消す',
  hookscrlf:   '`scripts/hooks/* text eol=lf` を **eol=crlf へ書き換える** (消すのでは (C) では空振りする)',
  anchorlf:    'boxleak の複数行アンカーの改行を LF へ戻す',
  armback:     'driver_doors_p5 へ撤退スイッチの腕 STAGE_ARM を戻す',
  fixturemiss: '合成ノードの注入を消す',
  fixturefake: '合成ノードをやめ **MAPDEF.doors を持つ自作マップ**で扉を作る (§2-2 の罠の再現)',
  seedplain:   'ドライバ側の規則の seed を mapDef.id でなく素の node id にする',
  p5cut:       'driver_doors_p5 の §1x から assert を 1 本 ((1x-c2)) 落とす',
};
/* その変異で **赤くなるべき** assert の接頭辞。⭐ 空振りしていないことの唯一の判定基準。
 * ⚠ 依頼書 §8 の表からの差分は 2 件。どちらも**実測で崩れた**もので、緩めた訳ではない:
 *   ① attrdrop の (1b) → **(1a)**。未コミットの .gitattributes 編集は worktree のチェックアウトに
 *      効かない (2026-09-11 実測。チェックアウトは**取り出す木の属性**を読む) ので (1b) は原理的に
 *      動かない。代わりに (0b)(1a) が受け止める (どちらも**コミット前に**気づける = 元より弱くない)。
 *   ② seedplain の (2c) を落とした。⭐ 理由 = **#63 が砦を畳んだ結果、実在ノードが 2 件・扉 1 枚
 *      (n4/gate-right) しか残っておらず、その 1 枚は `orc-fort/n4` でも素の `n4` でも
 *      同じ答え (closed) になる**。⇒ (2c) の規則検査は seed を変えても動かない。
 *      ⛔ 「舞台の形に依存する母集団では測れない」という、このチケットが直している病そのもの。
 *      seed の退行は (2b) が合成ノードの 8 枚 (fx2/gate-left が割れる) で捕まえる。
 *      ⭐ シナリオ横断の証明は driver_doors_p5 の §1x が 5 舞台で持っている (本ドライバは §1x を触らない)。 */
const MUT_EXPECT = {
  eolrevert:   ['(1a', '(1b'],
  attrdrop:    ['(0b', '(1a'],
  hookscrlf:   ['(1d'],
  anchorlf:    ['(1c'],
  armback:     ['(2a'],
  fixturemiss: ['(0c', '(2b', '(2d'],
  fixturefake: ['(2b', '(2c', '(2d'],
  seedplain:   ['(2b'],
  /* ★[#66 項目7] 逐語凍結をやめた (3a) の負のコントロール。旧 (3a) は変異を 1 本も
   *   持っておらず「何も守っていない」と区別が付かなかった。⚠ 接頭辞は `(3a)` まで
   *   書く — `(3a` だと (3a2) にも当たり、緑のままの (3a2) で空振り判定になる。 */
  p5cut:       ['(3a)'],
};
/* その変異で「同時に**緑のままである**べき」assert。
 * ⭐ これが無いと「効きすぎて全部赤 = 何を検出したのか分からない」変異を通してしまう。 */
const MUT_KEEP_GREEN = {
  eolrevert:   ['(1d', '(2b', '(3b'],
  attrdrop:    ['(1d', '(2a', '(2b'],
  hookscrlf:   ['(1c', '(2b'],
  anchorlf:    ['(1a', '(1b', '(1d'],
  armback:     ['(1a', '(3a', '(2b'],
  fixturemiss: ['(1a', '(2c', '(2e'],
  fixturefake: ['(1a', '(1b'],
  seedplain:   ['(0c', '(1a', '(2e'],
  p5cut:       ['(3a2)', '(2a', '(3b'],
};
if (MUTATE !== null && MUT_ORDER.indexOf(MUTATE) < 0) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}

// ══════════════════════════════════════════════════════════════════════════════
// 読み口 (変異はここだけを差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const P = { TREE: 'tree', ANCHOR_SRC: 'anchor-src', ANCHOR_TGT: 'anchor-target',
            DRIVER_SRC: 'driver-src', HOOK: 'hook' };
const EOLREVERT_FILE = 'js/road-events.js';

function rawRead(rel) { return fs.readFileSync(path.join(ROOT, rel.replace(/\//g, path.sep))); }

/* 変異 p5cut の注入点。⚠ 健在チェック (auditMutations) と注入で**同じ文字列**を使う。 */
const P5CUT_ANCHOR = "check('(1x-c2) ";

/* 作業ツリーのバイトを読む唯一の口。⚠ purpose ごとに変異の当たる範囲が違う (冒頭の注記)。 */
function readTracked(rel, purpose) {
  let buf = rawRead(rel);
  if (MUTATE === 'eolrevert' && rel === EOLREVERT_FILE &&
      (purpose === P.TREE || purpose === P.ANCHOR_TGT)) {
    /* ⚠ latin1 は 1 バイト = 1 文字で往復するのでバイナリ安全。utf8 で往復させない。 */
    buf = Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  }
  if (MUTATE === 'anchorlf' && rel === ANCHOR_DRIVER && purpose === P.ANCHOR_SRC) {
    const s = buf.toString('utf8');
    const i = s.indexOf('boxleak:');
    const j = s.indexOf('worldremove:', i > 0 ? i : 0);
    if (i >= 0 && j > i) {
      /* ソース上の 4 文字 `\r\n` を `\n` へ = 「アンカーを LF で書いた」状態の再現。 */
      buf = Buffer.from(s.slice(0, i) + s.slice(i, j).split('\\r\\n').join('\\n') + s.slice(j), 'utf8');
    }
  }
  if (MUTATE === 'armback' && rel === 'tools/driver_doors_p5.js' && purpose === P.DRIVER_SRC) {
    const s = buf.toString('utf8');
    buf = Buffer.from(s.replace("const STAGE = 'orc-fort';",
      "const STAGE = 'orc-fort';\nconst STAGE_ARM = '&fortfold=0';   /* \u2605\u5909\u7570armback */"), 'utf8');
  }
  /* \u2605[#66 \u9805\u76ee7] \u00a71x \u304b\u3089 assert \u3092 1 \u672c\u843d\u3068\u3059\u3002id \u3054\u3068\u6d88\u3055\u306a\u3044\u3068 ids1x \u304c\u62fe\u3063\u3066\u3057\u307e\u3046\u3002 */
  if (MUTATE === 'p5cut' && rel === 'tools/driver_doors_p5.js' && purpose === P.DRIVER_SRC) {
    const s = buf.toString('utf8');
    buf = Buffer.from(s.replace(P5CUT_ANCHOR, "if (false) check('(1xCUT) \u2605\u5909\u7570p5cut "), 'utf8');
  }
  return buf;
}

// ══════════════════════════════════════════════════════════════════════════════
// git
// ══════════════════════════════════════════════════════════════════════════════
function git(args, opts) {
  return execFileSync('git', ['-C', ROOT, '-c', 'core.quotepath=off'].concat(args),
    Object.assign({ maxBuffer: 1 << 28 }, opts || {}));
}
function gitStr(args, opts) { return git(args, opts).toString('utf8'); }
const zsplit = (s) => s.split('\0').filter((x) => x.length);

/* 期待の行末を git に聞く (= 2 経路の片方)。
 * ⚠⚠⚠ -z を付けるなら**入力も NUL 区切り**。改行区切りだと `Filename too long` を 840 回吐く。 */
function checkAttr(paths) {
  const out = git(['check-attr', '-z', '--stdin', 'text', 'eol'],
                  { input: Buffer.from(paths.join('\0') + '\0', 'utf8') }).toString('utf8');
  const t = out.split('\0');
  const m = {};
  for (let i = 0; i + 2 < t.length; i += 3) (m[t[i]] = m[t[i]] || {})[t[i + 1]] = t[i + 2];
  return m;
}
/* 変異はここで git の答えを差し替える (= 宣言からその行が消えた / 書き換わった状態の再現)。
 * ⭐ ディスクの .gitattributes は 1 バイトも触らない。 */
function attrsFor(paths) {
  const m = checkAttr(paths);
  if (MUTATE === 'attrdrop') {
    for (const p of paths) if (/^js\/[^/]+\.js$/.test(p) && m[p]) m[p].eol = 'lf';
  }
  if (MUTATE === 'hookscrlf') {
    for (const p of paths) if (isHook(p) && m[p]) m[p].eol = 'crlf';
  }
  return m;
}

/* バイト列から行末を判定する。⛔ grep で測らない (真逆の答えが返る)。 */
function eolOf(buf) {
  if (buf.includes(0)) return 'binary';
  const s = buf.toString('latin1');
  const crlf = (s.match(/\r\n/g) || []).length;
  const lf = (s.match(/\n/g) || []).length - crlf;
  const cr = (s.match(/\r/g) || []).length - crlf;
  if (!crlf && !lf && !cr) return 'none';
  if (!lf && !cr) return 'crlf';
  if (!crlf && !cr) return 'lf';
  return 'mixed';
}

let ACTIVE_WT = null;
function dropWorktree() {
  if (!ACTIVE_WT) return;
  const wt = ACTIVE_WT; ACTIVE_WT = null;
  try { git(['worktree', 'remove', '--force', wt]); } catch (e) {
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch (e2) {}
  }
  try { git(['worktree', 'prune']); } catch (e) {}
}
process.on('exit', dropWorktree);
process.on('SIGINT', () => { dropWorktree(); process.exit(130); });

// ══════════════════════════════════════════════════════════════════════════════
// 複数行アンカーの取り出し (⛔ 写経しない。ドライバのソースから読み出す)
// ══════════════════════════════════════════════════════════════════════════════
/* ⚠ `bridgefill` の from は `M52_ROW8 + '\r\n' + M52_ROW9` という**式**なので、
 *   リテラルを正規表現で抜くだけでは取れない。⇒ 式をそのまま取り出し、
 *   同じソースから `const NAME = '…';` を解決して vm で評価する。 */
const JS_WORDS = new Set(['true', 'false', 'null', 'undefined']);
function parseAnchors(src) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/multiline:\s*true/.test(lines[i])) continue;
    const nm = lines[i].match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*\{/);
    const fm = lines[i].match(/file:\s*'([^']+)'/);
    let j = i;
    while (j < lines.length && !/^\s*from:/.test(lines[j])) j++;
    if (j >= lines.length) continue;
    let expr = lines[j].replace(/^\s*from:\s*/, '');
    let k = j + 1;
    while (k < lines.length && !/^\s*to:/.test(lines[k])) { expr += '\n' + lines[k]; k++; }
    expr = expr.replace(/,\s*$/, '');
    const sandbox = {};
    for (const id of (expr.match(/\b[A-Za-z_$][\w$]*\b/g) || [])) {
      if (JS_WORDS.has(id) || sandbox[id] !== undefined) continue;
      const dm = src.match(new RegExp('^const ' + id + " = ('(?:[^'\\\\]|\\\\.)*');", 'm'));
      if (dm) sandbox[id] = vm.runInNewContext(dm[1], {}, { timeout: 1000 });
    }
    let val = null;
    try { val = vm.runInNewContext(expr, sandbox, { timeout: 1000 }); } catch (e) { val = null; }
    out.push({ name: nm ? nm[1] : ('anchor@' + (i + 1)), file: fm ? fm[1] : null,
               text: typeof val === 'string' ? val : null, line: i + 1 });
  }
  return out;
}
/* 測定用 = 読み口を通す (anchorlf はここへ効く)。 */
const anchorsMeasured = () => parseAnchors(readTracked(ANCHOR_DRIVER, P.ANCHOR_SRC).toString('utf8'));
/* 健在検査用 = ⚠ 変異を通さない原本で取る (anchorlf が自分の健在検査を殺さないように)。 */
const anchorsPristine = () => parseAnchors(rawRead(ANCHOR_DRIVER).toString('utf8'));

// ══════════════════════════════════════════════════════════════════════════════
// 変異アンカーの健在検査 (⛔ --mutate の有無に関わらず毎回回す)
//   ⚠⚠ 必ず**手つかずの原本**に対して数える。変異後のバッファで数えると
//     いちばん大事な変異が「偽のアンカー腐敗」で 1 度も走らなくなる。
// ══════════════════════════════════════════════════════════════════════════════
function auditMutations() {
  const st = {};
  const attrSrc = rawRead('.gitattributes').toString('utf8');
  const countLine = (re) => (attrSrc.match(re) || []).length;

  const roadEol = eolOf(rawRead(EOLREVERT_FILE));
  st.eolrevert = { ok: roadEol === 'crlf', note: EOLREVERT_FILE + ' の行末=' + roadEol + ' (crlf であること)' };

  const nShip = countLine(/^js\/\*\.js\s+text\s+eol=crlf\s*$/gm);
  st.attrdrop = { ok: nShip === 1, note: '.gitattributes の `js/*.js text eol=crlf` 宣言 ' + nShip + ' 行' };

  const nHook = countLine(/^scripts\/hooks\/\*\s+text\s+eol=lf\s*$/gm);
  st.hookscrlf = { ok: nHook === 1, note: '.gitattributes の `scripts/hooks/* text eol=lf` 宣言 ' + nHook + ' 行' };

  const box = anchorsPristine().find((a) => a.name === 'boxleak');
  st.anchorlf = { ok: !!(box && box.text && box.text.indexOf('\r\n') >= 0),
                  note: 'boxleak アンカーの CRLF 改行=' +
                        (box && box.text ? (box.text.match(/\r\n/g) || []).length + ' 箇所' : 'なし') };

  const p5 = rawRead('tools/driver_doors_p5.js').toString('utf8');
  const nStage = p5.split("const STAGE = 'orc-fort';").length - 1;
  st.armback = { ok: nStage === 1, note: "driver_doors_p5 の `const STAGE = 'orc-fort';` " + nStage + ' 箇所' };

  const nCut = p5.split(P5CUT_ANCHOR).length - 1;
  st.p5cut = { ok: nCut === 1, note: 'driver_doors_p5 の §1x の ' + P5CUT_ANCHOR + ' ' + nCut + ' 箇所' };

  const fxOk = typeof FX.install === 'function' && typeof FX.noel === 'function' &&
               FX.FX_NODE_IDS.length >= 2 && FX.FX_DIRS.length >= 2;
  const fxNote = '_doors_fixture の口: install/noel/' + FX.FX_NODE_IDS.length + ' ノード x ' +
                 FX.FX_DIRS.length + ' 出口';
  st.fixturemiss = { ok: fxOk, note: fxNote };
  st.fixturefake = { ok: fxOk, note: fxNote };
  st.seedplain = { ok: fxOk, note: fxNote };

  const bad = MUT_ORDER.filter((k) => !st[k].ok);
  return { status: st, fatal: bad.length > 0, bad: bad };
}

// ══════════════════════════════════════════════════════════════════════════════
// 記録
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, st: cond ? 'PASSED' : 'FAILED' });
  console.log('  ' + (cond ? 'PASSED' : 'FAILED') + ' ' + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// §0 / §1 — git と実ファイルだけで行末を測る (⭐ ブラウザを使わない)
// ══════════════════════════════════════════════════════════════════════════════
function sectionEol() {
  console.log('--- §0 装置 + §1 行末 (ブラウザを使わない) ---');
  const tracked = zsplit(gitStr(['ls-files', '-z']));
  const attrs = attrsFor(tracked);

  const text = [], binary = [], clash = [], missing = [];
  for (const rel of tracked) {
    const abs = path.join(ROOT, rel.replace(/\//g, path.sep));
    if (!fs.existsSync(abs)) { missing.push(rel); continue; }
    const buf = readTracked(rel, P.TREE);
    const attrBin = (attrs[rel] || {}).text === 'unset';
    const nulBin = buf.includes(0);
    if (attrBin !== nulBin) clash.push(rel + '(attr=' + (attrBin ? 'binary' : 'text') +
                                       '/中身=' + (nulBin ? 'NUL あり' : 'NUL なし') + ')');
    if (attrBin || nulBin) { binary.push(rel); continue; }
    text.push({ rel: rel, eol: eolOf(buf), attr: (attrs[rel] || {}).eol, want: wantEol(rel) });
  }

  // ── (0a) 母集団 ─────────────────────────────────────────────────────────
  check('(0a) [装置] 追跡テキストファイルが ' + MIN_TEXT + ' 本以上あり、binary の判定が ' +
    '「text 属性」と「NUL 走査」の 2 経路で一致する (これが無いと「0 本を検査して全部緑」)',
    text.length >= MIN_TEXT && clash.length === 0 && missing.length === 0,
    '追跡 ' + tracked.length + ' = binary ' + binary.length + ' / テキスト ' + text.length +
    ' / 分類の食い違い ' + clash.length + (clash.length ? ' ' + clash.slice(0, 3).join(' ') : '') +
    ' / 不在 ' + missing.length);

  // ── (0b) 2 経路 (契約 vs git) ────────────────────────────────────────────
  const attrBad = text.filter((t) => t.attr !== t.want);
  check('(0b) ★★[2 経路] ドライバが書き下した契約 (配信物 *.html / js/*.js / audio.js = CRLF、' +
    'hooks と残り = LF) と `git check-attr eol` の答えが、テキスト ' + text.length + ' 本すべてで一致する',
    text.length >= MIN_TEXT && attrBad.length === 0,
    '食い違い ' + attrBad.length + ' 本' +
    (attrBad.length ? ': ' + attrBad.slice(0, 4).map((t) => t.rel + ' 契約=' + t.want + '/git=' + t.attr).join(' ') : '') +
    ' / 配信物 ' + text.filter((t) => isShip(t.rel)).length + ' 本・hook ' +
    text.filter((t) => isHook(t.rel)).length + ' 本');

  // ── (1a) ディスクが check-attr の答えどおり ────────────────────────────
  const constrained = text.filter((t) => (t.attr === 'crlf' || t.attr === 'lf') && t.eol !== 'none');
  const eolBad = constrained.filter((t) => t.eol !== t.attr);
  check('(1a) ★★作業ツリーの追跡テキストの行末が `git check-attr eol` の答えどおり ' +
    '(⛔ 本数を焼かない = 配信物が 1 本増えても腐らない)',
    constrained.length >= MIN_TEXT && eolBad.length === 0,
    '検査 ' + constrained.length + ' 本 / 食い違い ' + eolBad.length + ' 本' +
    (eolBad.length ? ': ' + eolBad.slice(0, 4).map((t) => t.rel + ' want=' + t.attr + '/got=' + t.eol).join(' ') : '') +
    ' (改行なし ' + (text.length - constrained.length) + ' 本は対象外)');

  // ── (1b)(1c) 隔離ツリー ─────────────────────────────────────────────────
  /* ⚠ 隔離ツリーは **HEAD** のチェックアウトなので、未コミットで中身を変えたファイルは
   *   byte が違って当たり前。(1b) の主題は「**行末の変換で**姿が変わっていないか」なので、
   *   `git diff HEAD` が挙げた本だけは母集団から外し、外した本を必ず出力に書く。
   * ⛔ 例外を作っても穴は開かない: その集合に配信物とフックが 1 本も入っていないことは
   *   (1e-1) が別に見張っており、外した本の行末自体は (1a) が check-attr と突き合わせている。
   * ⭐ 変異 eolrevert は**読み口の差し替え**なので `git diff` には現れない = 母集団に残る
   *   (= この例外で負のコントロールが空振りすることはない)。 */
  const changed = zsplit(gitStr(['diff', 'HEAD', '--name-only', '-z']));
  const anchors = anchorsMeasured();
  check('(0z-anchor) [装置] 複数行アンカーが 2 本抽出でき、すべて改行と当て先を持つ ' +
    '(⛔ 期待文言を写経せず ' + ANCHOR_DRIVER + ' から読み出している)',
    anchors.length === 2 && anchors.every((a) => a.text && a.text.indexOf('\n') >= 0 && a.file),
    anchors.map((a) => a.name + '@' + a.line + '→' + a.file +
      (a.text ? '(改行 ' + ((a.text.match(/\n/g) || []).length) + ')' : '(取り出し失敗)')).join(' / '));

  git(['worktree', 'prune']);
  const wt = path.join(os.tmpdir(), 'df_eol65_' + process.pid);
  try { fs.rmSync(wt, { recursive: true, force: true }); } catch (e) {}
  let wtOk = true, wtErr = '';
  try { git(['worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'pipe' }); ACTIVE_WT = wt; }
  catch (e) { wtOk = false; wtErr = String(e.message || e).slice(0, 160); }

  const cmp = { n: 0, diff: [], skip: [] };
  if (wtOk) {
    for (const rel of tracked) {
      if (changed.indexOf(rel) >= 0) { cmp.skip.push(rel); continue; }   // 未コミットで中身を変えた本
      const w = path.join(wt, rel.replace(/\//g, path.sep));
      if (!fs.existsSync(w)) { cmp.diff.push(rel + '(隔離側に無い)'); continue; }
      const a = readTracked(rel, P.TREE), b = fs.readFileSync(w);
      cmp.n++;
      if (!a.equals(b)) cmp.diff.push(rel + '(' + eolOf(a) + '/' + eolOf(b) + ')');
    }
  }
  check('(1b) ★★★ `git worktree add --detach <tmp> HEAD` で作った隔離ツリーが、追跡ファイル ' +
    '全部で本番と byte 一致する (= 別 PC でクローンした人が受け取る姿と同じ)',
    wtOk && cmp.n === tracked.length - cmp.skip.length && cmp.n >= MIN_TEXT && cmp.diff.length === 0,
    wtOk ? ('比較 ' + cmp.n + '/' + tracked.length + ' 本 / 差 ' + cmp.diff.length + ' 本' +
            (cmp.diff.length ? ': ' + cmp.diff.slice(0, 4).join(' ') : '') +
            ' / 未コミットで中身を変えたため対象外 ' + cmp.skip.length + ' 本' +
            (cmp.skip.length ? ': ' + cmp.skip.slice(0, 4).join(' ') : ''))
         : ('隔離ツリーを作れない: ' + wtErr));

  const hit = anchors.map((a) => {
    const r = { name: a.name, file: a.file, prod: -1, wt: -1 };
    if (!a.text || !a.file) return r;
    try { r.prod = readTracked(a.file, P.ANCHOR_TGT).toString('utf8').split(a.text).length - 1; } catch (e) {}
    if (wtOk) {
      try {
        r.wt = fs.readFileSync(path.join(wt, a.file.replace(/\//g, path.sep)))
          .toString('utf8').split(a.text).length - 1;
      } catch (e) {}
    }
    return r;
  });
  check('(1c) ★複数行アンカー 2 本が、**本番ツリーと隔離ツリーの両方で 1 箇所ちょうど**ヒットする ' +
    '(#64 が踏んだ偽の EXIT=3 の直接の再現防止)',
    wtOk && hit.length === 2 && hit.every((h) => h.prod === 1 && h.wt === 1),
    hit.map((h) => h.name + '→' + h.file + ' 本番=' + h.prod + ' 隔離=' + h.wt).join(' / '));

  dropWorktree();

  // ── (1d) フックの最終防衛線 ─────────────────────────────────────────────
  const hookBuf = readTracked(HOOK_SCRIPT, P.HOOK);
  const hookEol = eolOf(hookBuf);
  const hookHead = hookBuf.slice(0, 2).toString('latin1');
  const hookAttr = (attrs[HOOK_SCRIPT] || {}).eol;
  let hookBlob = '\r';
  try { hookBlob = gitStr(['show', 'HEAD:' + HOOK_SCRIPT]); } catch (e) {}
  check('(1d) ★★[最終防衛線] ' + HOOK_SCRIPT + ' が **ディスクでも git が取り出す姿でも LF** で、' +
    '先頭が shebang (⛔ 「.gitattributes に除外行があるか」では測らない —— 裁定 (C) では永久緑になる)',
    hookEol === 'lf' && hookHead === '#!' && hookAttr === 'lf' && hookBlob.indexOf('\r') < 0,
    'ディスク=' + hookEol + ' 先頭=' + JSON.stringify(hookHead) + ' check-attr=' + hookAttr +
    ' HEAD blob の CR=' + (hookBlob.match(/\r/g) || []).length + ' 個');

  // ── (1e) 行末変換が blob を動かしていないこと (⛔ git status は使わない) ──
  const ALLOW = (rel) => rel === '.gitattributes' || rel.indexOf('tools/') === 0 ||
                         rel.indexOf('実装依頼書/') === 0;
  const shipTouched = changed.filter((r) => isShip(r) || isHook(r));
  check('(1e-1) ★`git diff HEAD` が挙げるのは本チケットが中身を変えると宣言したものだけで、' +
    '**配信物と git フックは 1 本も含まれない** (⛔ `git status` は stat-dirty を出すので使わない)',
    shipTouched.length === 0 && changed.every(ALLOW),
    '差分 ' + changed.length + ' 本' + (changed.length ? ': ' + changed.slice(0, 6).join(' ') : '') +
    ' / うち配信物・フック ' + shipTouched.length + ' 本');

  const oids = gitStr(['hash-object', '--stdin-paths'],
    { input: Buffer.from(tracked.join('\n') + '\n', 'utf8') }).split('\n').filter((x) => x.length);
  const head = {};
  for (const line of zsplit(gitStr(['ls-tree', '-r', '-z', 'HEAD']))) {
    const tab = line.indexOf('\t');
    head[line.slice(tab + 1)] = line.slice(0, tab).split(' ')[2];
  }
  const moved = [];
  for (let i = 0; i < tracked.length; i++) if (oids[i] !== head[tracked[i]]) moved.push(tracked[i]);
  const setEq = moved.length === changed.length && moved.every((r) => changed.indexOf(r) >= 0);
  check('(1e-2) ★★追跡ファイルの **blob OID が HEAD と一致**する。動いたのは `git diff` が挙げた ' +
    'ファイルと**完全に同じ集合**だけ (= 行末変換は blob を 1 ビットも動かしていない)',
    oids.length === tracked.length && setEq,
    '照合 ' + oids.length + '/' + tracked.length + ' 本 / OID が動いた ' + moved.length + ' 本' +
    (moved.length ? ': ' + moved.slice(0, 6).join(' ') : '') + ' / diff の集合と一致=' + setEq);
}

// ══════════════════════════════════════════════════════════════════════════════
// §2 — 扉の fixture (puppeteer)
// ══════════════════════════════════════════════════════════════════════════════
const STAGE = 'orc-fort';   // ⚠ 廃坑 (goblin-mine) は n1 が event でダイアログ待ちに入るので使わない

function sectionDoorSource() {
  console.log('--- §2 扉の測定台 (ソース) ---');
  const per = DOOR_DRIVERS.map((rel) => {
    const s = readTracked(rel, P.DRIVER_SRC).toString('utf8');
    return { rel: rel, n: s.split(RETREAT_WORD).length - 1, len: s.length };
  });
  check('(2a) ★★ `doors_p2` / `p5` / `p8` の**ソースに `' + RETREAT_WORD + '` が 1 件も無い** ' +
    '(= 測定台が撤退スイッチの上に立っていない)',
    per.length === 3 && per.every((x) => x.len > 1000) && per.every((x) => x.n === 0),
    per.map((x) => path.basename(x.rel) + ':' + x.n + '件/' + x.len + 'B').join(' '));
}

/* ページ側で走る本体 (外の変数を掴めないので定数は cfg で渡す)。 */
const PAGE_POP = function (ids) {
  const out = [];
  const cur = currentNodeId;
  for (const id of ids) {
    const nd = RUN.byId[id];
    if (!nd) continue;
    rebuildNodeDoors(id);
    const ds = doorsForRender();
    for (let k = 0; k < ds.length; k++) {
      out.push({ node: id, mapId: (nd.mapDef || {}).id || null, door: ds[k].id, state: ds[k].state });
    }
  }
  rebuildNodeDoors(cur);
  return out;
};

/* ⛔⛔ 依頼書 §2-2 の罠の再現 = **自作マップ (MAPDEF.doors) で扉を作る**。
 * rebuildNodeDoors は MAPDEF.doors があると早期 return し、施錠の抽選 doorLockedByRng は
 * その return より**下**にしか無い。⇒ 扉は立つが抽選が 1 度も引かれない。
 * ⚠ しかも MAPDEF.doors は**盤面ごと乗っ取る**ので、以後どのノードを rebuild しても同じ偽の扉が返る
 *   (= ノエルの署名比較は「両方が同じ偽物」になって意味を失い、赤は (2c) の規則検査の側に出る)。 */
const PAGE_FAKE = function (cfg) {
  const out = { ok: false, why: '', nodes: [], doors: 0, fxDoors: 0, population: [] };
  if (typeof MAPDEF === 'undefined' || !MAPDEF) { out.why = 'MAPDEF が無い'; return out; }
  const origId = MAPDEF.id;
  for (let i = 0; i < cfg.nodeIds.length; i++) {
    const id = cfg.nodeIds[i], mapId = cfg.prefix + id;
    MAPDEF.id = mapId;
    MAPDEF.doors = cfg.dirs.map(function (d) {
      const g = nodeGateTile(MAPDEF, d);
      return { id: 'gate-' + d, tx: g.tx, ty: g.ty,
               orientation: (d === 'left' || d === 'right') ? 'vertical' : 'horizontal',
               state: 'closed', requiredKey: null };
    });
    rebuildNodeDoors(currentNodeId);
    const ds = doorsForRender();
    for (let k = 0; k < ds.length; k++) {
      out.population.push({ node: id, mapId: mapId, door: ds[k].id, state: ds[k].state });
    }
    out.nodes.push(id);
  }
  MAPDEF.id = origId;
  out.fxDoors = out.population.length;
  out.doors = doorsForRender().length;
  out.ok = true;
  return out;
};

const PAGE_SCAN = function (cfg) {
  nodeBusy = true;                     // ★本編と同じ「選択処理中」= 400ms tick を止める
  const cur = currentNodeId;
  const flat = [];
  const ids = Object.keys(RUN.byId);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (cfg.fxIds.indexOf(id) >= 0 || id === cfg.sameId) continue;   // 合成は (2b) が見る
    const nd = RUN.byId[id];
    rebuildNodeDoors(id);
    const ds = doorsForRender();
    for (let k = 0; k < ds.length; k++) {
      flat.push({ node: id, mapId: (nd.mapDef || {}).id || null, door: ds[k].id, state: ds[k].state });
    }
  }
  rebuildNodeDoors(cur);
  /* ★抽選が Math.random を 1 度も引かない (盤面の湧きの RNG 消費順を動かさない) */
  const real = Math.random;
  let calls = 0;
  Math.random = function () { calls++; return real.apply(Math, arguments); };
  try {
    for (let i = 0; i < cfg.fxIds.length; i++) if (RUN.byId[cfg.fxIds[i]]) rebuildNodeDoors(cfg.fxIds[i]);
    rebuildNodeDoors(cur);
  } finally { Math.random = real; }
  return { flat: flat, randomCalls: calls, nodeId: cur, nNodes: ids.length };
};

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome が見つかりません。--browser <path> で指定してください。'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

async function sectionDoors(browser, base) {
  console.log('--- §2 扉の測定台 (合成ノード) ---');
  const errs = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/i.test(t)) errs.push('CONSOLE ' + t);
  });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
    try { localStorage.removeItem('df.devMode'); } catch (e) {}
  }, STAGE);
  await page.goto(base + '/index.html?diag=1&intel=0&secret=0',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'",
    { timeout: 25000 });
  await sleep(900);      // テクスチャの読込 (壁/床の pattern) を待つ

  /* ★[(2c) の 1 本目の節] fixture を入れる**前**の実在ノードの扉を控える。
   * ⭐⭐ 「測定器が盤面を汚さない」は fixture の最重要の契約で、自作マップ (MAPDEF.doors) 版は
   *   ここで必ず破れる —— MAPDEF.doors は**盤面ごと乗っ取る**ので、以後どのノードを rebuild しても
   *   同じ偽の扉が返り、実在ノードの扉が書き換わる。
   * ⚠ 署名の比較でしか捕まらない: 偽物どうしを比べるノエルの署名は**両方が同じ偽物**になって一致し、
   *   規則検査も「畳んだ砦に実在の扉が 1 枚しかない」せいで当たらない (2026-09-11 実測)。 */
  const before = await page.evaluate(PAGE_SCAN, { fxIds: FX.FX_NODE_IDS, sameId: FX.FX_SAME_ID });

  const WANT_FX_DOORS = FX.FX_NODE_IDS.length * FX.FX_DIRS.length;   // ⭐ 定数を焼かず器から導く
  let fx, pop;
  if (MUTATE === 'fixturefake') {
    fx = await page.evaluate(PAGE_FAKE,
      { nodeIds: FX.FX_NODE_IDS, prefix: FX.FX_MAP_PREFIX, dirs: FX.FX_DIRS });
    pop = fx.population;
  } else if (MUTATE === 'fixturemiss') {
    fx = { ok: true, why: '★変異fixturemiss (注入を消した)', nodes: [], doors: 0, fxDoors: 0 };
    pop = [];
  } else {
    fx = await FX.install(page, { nodes: true });
    pop = await page.evaluate(PAGE_POP, FX.FX_NODE_IDS);
  }
  /* ★ノエルの条件は**扉を 1 枚も開けていない今**測る (開けた扉は nodeState へ保存され、
   *   applySavedDoorStates が実在ノード側にだけ当て直すので後から測ると必ず食い違う)。 */
  const noel = await FX.noel(page);
  const S = await page.evaluate(PAGE_SCAN, { fxIds: FX.FX_NODE_IDS, sameId: FX.FX_SAME_ID });
  await page.close();
  for (const e of errs.slice(0, 3)) console.log('  [page] ' + e);

  const predict = (x) => (wantLocked(seedOf(x.mapId, x.node), x.door) ? 'locked' : 'closed');
  const wrongFx = pop.filter((x) => !x.mapId || x.state !== predict(x));
  const lockedFx = pop.filter((x) => x.state === 'locked').length;
  const wrongReal = S.flat.filter((x) => !x.mapId || x.state !== predict(x));

  check('(0c) [装置] 扉の fixture が実際に立っている = 合成ノード ' + FX.FX_NODE_IDS.length +
    ' 件に扉が ' + WANT_FX_DOORS + ' 枚 (これが 0 だと以下は「0 枚を検査して全部緑」)',
    fx.ok === true && pop.length === WANT_FX_DOORS && fx.nodes.length === FX.FX_NODE_IDS.length,
    'ok=' + fx.ok + ' ノード=' + fx.nodes.join(',') + ' 扉=' + pop.length + '/' + WANT_FX_DOORS +
    (fx.why ? ' / ' + fx.why : ''));

  check('(2b) ★★★合成ノードの扉の state が、**ドライバ側で書き下した規則** ' +
    '(mapDef.id + "/lock/" + door id のハッシュ < ' + WANT_LOCK_CHANCE + ') と ' + WANT_FX_DOORS +
    ' 枚すべてで一致する (⛔ 実装の doorLockedByRng を呼ばない)',
    pop.length === WANT_FX_DOORS && wrongFx.length === 0,
    '照合 ' + pop.length + ' 枚 / 食い違い ' + wrongFx.length + ' 枚' +
    (wrongFx.length ? ': ' + wrongFx.slice(0, 4)
      .map((x) => x.mapId + '/' + x.door + ' 実装=' + x.state + ' 規則=' + predict(x)).join(' ') : '') +
    ' / 実測=' + pop.map((x) => x.node + ':' + x.door.replace('gate-', '') + '=' + x.state).join(' '));

  const sigOf = (flat) => flat.map((x) => x.node + '/' + x.door + ':' + x.state).sort().join(' ');
  const beforeSig = sigOf(before.flat), afterSig = sigOf(S.flat);
  check('(2c) ★★★[ノエルの条件] ① fixture を入れても**実在ノードの扉が 1 枚も動かない** ' +
    '(= 測定器が盤面を汚していない) ② 実在ノードと**同じ mapDef.id** を与えた合成ノードの扉が ' +
    'id / state / タイル / 板の向きで 1 文字も違わない ③ 実在ノードの扉も規則どおり',
    noel.ok === true && noel.dirs.length >= 1 && noel.real === noel.fx &&
      before.flat.length >= 1 && beforeSig === afterSig && wrongReal.length === 0,
    '① 盤面 前=[' + beforeSig + '] 後=[' + afterSig + '] 不変=' + (beforeSig === afterSig) +
    ' / ② 実在(' + noel.realId + ' / ' + noel.mapId + ')=[' + noel.real + '] 合成=[' + noel.fx + ']' +
    ' / ③ 実在ノードの扉 ' + S.flat.length + ' 枚中 食い違い ' + wrongReal.length +
    (wrongReal.length ? ': ' + wrongReal.slice(0, 4)
      .map((x) => x.node + '/' + x.door + '=' + x.state + '≠' + predict(x)).join(' ') : '') +
    (noel.why ? ' / ' + noel.why : ''));

  check('(2d) ★合成ノードの扉に locked が 1 枚以上あり、全部ではない (抽選が効いている)',
    pop.length >= 2 && lockedFx >= 1 && lockedFx < pop.length,
    '扉 ' + pop.length + ' 枚中 ' + lockedFx + ' 枚が locked (期待の割合 ' + WANT_LOCK_CHANCE + ')');

  check('(2e) ★抽選が Math.random を 1 度も引かない (盤面の湧きの RNG 消費順を動かさない)',
    S.randomCalls === 0, 'rebuildNodeDoors 中の Math.random 呼び出し=' + S.randomCalls +
    ' / 走査したノード ' + S.nNodes + ' 件 / 実在ノードの扉 ' + S.flat.length + ' 枚');
}

// ══════════════════════════════════════════════════════════════════════════════
// §3 恒等 (非退行)
// ══════════════════════════════════════════════════════════════════════════════
/* driver_doors_p5 の §1x ブロックを切り出す。⛔ 行番号で切らない (1 行足すたび腐る)。 */
function slice1x(src) {
  const head = src.indexOf('§1x 施錠される扉がシナリオごとに違う');
  if (head < 0) return null;
  const start = src.lastIndexOf('\n', head) + 1;
  const next = src.indexOf('§2', head);
  if (next < 0) return null;
  const end = src.lastIndexOf('\n', next) + 1;
  return src.slice(start, end);
}
/* §1x に並ぶ assert の id を**切り出したブロックから読む**。⛔ 名前を書き下さない
 * (基準側にも本番側にも同じ関数を当てるので、増えた / 減ったが機械で出る)。 */
function ids1x(src) {
  const out = []; const re = /check\('(\([^)]*\))/g; let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}
/* ★[#66 項目7 2026-09-12] §1x を逐語で凍結していた (3a) の言い直し。
 * ⛔ **基準 rev (P5_BASE_REF) は進めない。** 進めるとチケット 1 本ごとに守る時間幅が
 *   リセットされ、「#65 は §1x を 1 バイトも触っていない」という主張そのものが消える
 *   (#62 の verify_swamp_lair (5a) で確立した裁定と同型)。
 * ⚠ しかし #66 が神殿を畳んだ結果 §1x の母集団 (実在の扉) が痩せ、(1x-c2) の「過半」が
 *   割れた。#66 項目7 はそれを**広げる向き**に直した (5 舞台 27 枚 / assert 5 → 6 本)。
 * ⇒ 守りたい不変条件へ言い直す = 「**基準に在った assert が 1 本も消えていない**」+
 *   「逐語の差分があるなら例外表に理由が載っている」。
 * ⚠ 「撤退スイッチの腕を持たない」は §2 の (2a) が 3 本のドライバ全体で見ているので重ねない。 */
const P5_1X_EXCEPTIONS = {
  '#66 項目7 (2026-09-12)':
    '神殿の畳みで痩せた §1x の母集団を #65 の合成の出口で 5 舞台 27 枚へ作り直し、' +
    '(1x-c2) の「食い違うペアが過半」を台帳導出の被覆 (扉を持つ舞台が 1 つ残らず食い違う) へ言い直した',
};
function sectionIdentity() {
  console.log('--- §3 恒等 (非退行) ---');
  const cur = slice1x(readTracked('tools/driver_doors_p5.js', P.DRIVER_SRC).toString('utf8'));
  let old = null;
  try { old = slice1x(gitStr(['show', P5_BASE_REF + ':tools/driver_doors_p5.js'])); } catch (e) {}
  const ids = ['(1x-z)', '(1x-a)', '(1x-b)', '(1x-c)', '(1x-c2)'];
  const hasAll = !!cur && ids.every((i) => cur.indexOf(i) >= 0);
  const curIds = cur ? ids1x(cur) : [];
  const oldIds = old ? ids1x(old) : [];
  const lost = oldIds.filter((i) => curIds.indexOf(i) < 0);
  const verbatim = !!cur && !!old && cur === old;
  const exKeys = Object.keys(P5_1X_EXCEPTIONS);
  check('(3a) ★ `driver_doors_p5` の §1x が ' + P5_BASE_REF + ' (#65 着手直前の origin/main) の ' +
    'assert を **1 本も失っていない** (id は基準側から導出 / ⛔ 基準 rev は進めない) + ' +
    '[装置] ブロックが ' + ids.length + ' 本の assert を含む',
    !!cur && !!old && hasAll && oldIds.length >= ids.length &&
    lost.length === 0 && curIds.length >= oldIds.length,
    cur ? ('本番 ' + cur.length + 'B / ' + P5_BASE_REF + ' ' + (old ? old.length + 'B' : '取得失敗') +
           ' / assert ' + oldIds.length + ' → ' + curIds.length + ' / 失われた id ' + lost.length +
           (lost.length ? ': ' + lost.join(' ') : '') + ' / 逐語一致=' + verbatim + ' / 装置=' +
           ids.filter((i) => cur.indexOf(i) >= 0).length + '/' + ids.length) : '§1x を切り出せない');
  check('(3a2) ★装置: §1x に基準からの逐語差分があるなら例外表に理由が 1 件以上ある / ' +
    '差分が無いなら例外表は空 (= 古い免罪符が黙って残らない)',
    !!cur && !!old && (verbatim === (exKeys.length === 0)),
    '逐語一致=' + verbatim + ' / 例外 ' + exKeys.length + ' 件=' + JSON.stringify(P5_1X_EXCEPTIONS));

  const bad = [];
  for (const rel of PROD_FILES) {
    const disk = gitStr(['hash-object', '--stdin-paths'], { input: Buffer.from(rel + '\n', 'utf8') }).trim();
    const h = gitStr(['rev-parse', 'HEAD:' + rel]).trim();
    if (disk !== h) bad.push(rel + '(' + disk.slice(0, 8) + '≠' + h.slice(0, 8) + ')');
  }
  check('(3b) ★★本番 ' + PROD_FILES.length + ' ファイル (' + PROD_FILES.join(' / ') +
    ') の **blob が HEAD と同一** (= 本チケットが本番を 1 バイトも触っていない)',
    bad.length === 0, '食い違い ' + bad.length + ' 本' + (bad.length ? ': ' + bad.join(' ') : ''));
}

// ══════════════════════════════════════════════════════════════════════════════
// --negative : 8 変異を自分で回し、赤くならなければ exit 1
// ══════════════════════════════════════════════════════════════════════════════
function runNegative() {
  console.log('══════ 負のコントロール (--negative) ══════');
  console.log('  ⭐ 「その変異で赤くなるはずの assert」が実際に FAILED になるかを見る。');
  console.log('  ⭐ 同時に「緑のままであるべき assert」が赤くなっていないか (効きすぎ) も見る。');
  console.log('  ⭐ 変異はディスクを 1 バイトも書き換えない (読み口の差し替え) = 復元漏れが起きない。');
  let bad = 0;
  MUT_ORDER.forEach((key, i) => {
    const want = MUT_EXPECT[key];
    const port = PORT + 1 + i;
    const t0 = Date.now();
    let out = '';
    try {
      out = execFileSync(process.execPath, [__filename, '--mutate', key, '--port', String(port)],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: ROOT });
    } catch (e) {
      out = (e.stdout || '') + (e.stderr || '');     // FAILED があると exit 1 で来る = 正常
    }
    const lines = out.split(/\r?\n/);
    const hasFailed = (pfx) => lines.some((l) => l.indexOf('FAILED ' + pfx) >= 0);
    const missing = want.filter((p) => !hasFailed(p));
    const keep = MUT_KEEP_GREEN[key] || [];
    const over = keep.filter((p) => hasFailed(p));
    const ok = missing.length === 0 && over.length === 0;
    if (!ok) bad++;
    const reds = lines.filter((l) => l.indexOf('  FAILED ') === 0)
      .map((l) => (l.match(/FAILED (\([\w-]+\))/) || [, '?'])[1]);
    console.log('  ' + (ok ? 'PASSED' : 'FAILED') + ' 変異 ' + key + ' (:' + port + ' ' +
      ((Date.now() - t0) / 1000).toFixed(0) + 's) で ' + want.map((x) => x + ')').join(' / ') + ' が赤くなる' +
      '  [緑のまま: ' + (keep.length ? keep.map((x) => x + ')').join(' ') : 'なし') + ']' +
      '  — ' + MUT_WHY[key] +
      '\n           赤くなった節: ' + (reds.length ? reds.join(' ') : 'なし') +
      (missing.length ? '  ⛔ 赤くならなかった: ' + missing.join(' ') : '') +
      (over.length ? '  ⛔ 効きすぎ (緑のままであるべき): ' + over.join(' ') : ''));
    if (!ok) {
      const tail = lines.filter((l) => /PASSED|FAILED|\[drv\]/.test(l)).slice(-40).join('\n');
      console.log('    ---- 変異 ' + key + ' の出力 (末尾) ----\n' + tail);
    }
  });
  console.log('════════════════════════════════════════════');
  console.log('  ' + MUT_ORDER.length + ' / ' + MUT_ORDER.length + ' 実行');
  console.log(bad === 0 ? '  空振りした変異は無い (PASS)' : '  ⛔ ' + bad + ' 本が空振り = 検出器が壊れている');
  console.log('════════════════════════════════════════════');
  process.exit(bad === 0 ? 0 : 1);
}

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_eol_doorfix.js' + (MUTATE ? '  [変異 ' + MUTATE + ']' : '') + ' ===\n');

  let audit;
  try { audit = auditMutations(); }
  catch (e) { console.error('[drv] ⛔ 変異アンカーの検算で例外: ' + e.message); process.exit(3); }
  if (audit.fatal) {
    console.error('[drv] ⛔ 変異アンカーの検算に失敗 → 負のコントロールが空振りする: ' +
      audit.bad.map((k) => k + ' (' + audit.status[k].note + ')').join(' / '));
    process.exit(3);
  }
  if (NEGATIVE) return runNegative();

  console.log('--- §0 装置 (変異アンカーの健在) ---');
  for (const k of MUT_ORDER) {
    check('(0z-' + k + ') [装置] 変異 ' + k + ' の注入点が生きている',
      true, audit.status[k].note + '  → 赤くなるべき ' + MUT_EXPECT[k].map((x) => x + ')').join(' '));
  }

  let srv = null, browser = null;
  try {
    sectionEol();
    sectionDoorSource();

    const puppeteer = loadPuppeteer();
    const exe = findBrowser();
    const profile = require('./_pptr_profile')('df_eoldoor_');
    srv = await startServer(PORT);
    const base = 'http://localhost:' + PORT;
    console.log('[drv] ' + base + '  browser=' + path.basename(exe) +
      (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
    browser = await puppeteer.launch({
      executablePath: exe, headless: HEADFUL ? false : 'new',
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--user-data-dir=' + profile] });
    await sectionDoors(browser, base);
    sectionIdentity();
  } catch (e) {
    console.error('\n[drv] 例外: ' + e.message + '\n' + (e.stack || ''));
    results.push({ name: '例外なく完走', st: 'FAILED' });
  } finally {
    dropWorktree();
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (srv) { try { srv.close(); } catch (e) {} }
  }

  const pass = results.filter((r) => r.st === 'PASSED');
  const fail = results.filter((r) => r.st === 'FAILED');
  console.log('\n════════════════════════════════════════════');
  console.log('  素 ' + pass.length + '/' + (pass.length + fail.length) + ' PASSED' +
    (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
  if (fail.length) { console.log('  FAILED:'); fail.forEach((r) => console.log('    - ' + r.name)); }
  console.log('════════════════════════════════════════════');
  process.exit(fail.length ? 1 : 0);
})();
