#!/usr/bin/env node
/*
 * verify_bolt_aim.js — 実装依頼書 #68「ライトニングボルトを敵へ向けて 10 マス撃つ」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_bolt_aim.js                 # 素 (合成盤面 + 実プレイ 24 走行 ≒ 38 分)
 *   node tools/verify_bolt_aim.js --no-play       # 合成盤面だけ (実プレイの節は PENDING)
 *   node tools/verify_bolt_aim.js --negative      # 変異 10 本 (合成盤面だけ。port 10302〜10311)
 *   node tools/verify_bolt_aim.js --negative --only nowall,norange
 *   node tools/verify_bolt_aim.js --mutate dmgray # 変異を 1 本だけ載せて合成盤面を回す (手回し)
 *   node tools/verify_bolt_aim.js --dump <path>   # 実プレイの試行ごとの盤面の写しを JSON で書き出す (不発の分析用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・PENDING あり(--no-play 以外) / 2=環境不足 / 3=変異アンカーの腐敗
 *
 * ■ 方針 (依頼書 §8) — **合成盤面で決定論的に形を固め、実プレイで率を測る**
 *   §0 装置 / §1 合成盤面 (素と撤退の 2 腕) / §2 実プレイ (回数と比率) / §3 文言 / §4 撤退 / §5 導出
 *   ⛔ 本番 (index.html / tavern.html) に計測シームを足さない (changelog ガードとの衝突)。
 *     計測はすべてドライバ側の注入: 合成盤面 = page.evaluate で据え付け、
 *     実プレイ = evaluateOnNewDocument で window.allyLightningBolt を包む。
 *
 * ■ ⭐⭐⭐ 2 経路目 = ドライバの独立再計算 (oracleBolt)
 *   本番の boltLineTiles / boltAimRays / hasLineOfSight / enemiesInArea / partyInArea を **1 つも呼ばない**。
 *   ページから持ち帰るのは「そのときの盤面の生データ」だけ (術者と敵のタイル / 交戦中の添字 /
 *   isTileWall の 23x23 の写し / 味方のタイル / 宣言射程)。直線と視線は Node 側の Bresenham で引く。
 *   ⭐ 撤退 (L=3・8 方向・壁なし) は Bresenham を使わず「単位ベクトル × 1,2,3」で書く = 旧コードの仕様そのもの。
 *   ⇒ (0d) 撤退の腕で再計算器と実物が全件一致 = 再計算器そのものが正しいことの証明。
 *
 * ■ ⛔ 依頼書 §8 から変えた点 (⭐ どれも期待値を弱めていない = 条件を足す / 測定点を移す)
 *   (1c2) 新設 … §8 は変異 norange の担当を (1c)「敵 1 体をチェビシェフ 11 マス」にしていたが、
 *                 ⚠ **その盤面では原理的に赤くならない**。列の歩きが L で打ち切るので、距離上限を外しても
 *                 11 マス先の 1 体には届かず demoted のまま。敵 2 体で検出できる配置は **0 件** (項目2 の py 模擬)。
 *                 ⇒ 盤面 range3 = A (5,0) / C (7,1) / B (11,1)。素は A だけ被弾、norange なら
 *                   B への向き (11,1) が A と C を通って採られる。(1c) は素の性質として残す。
 *   (1d2) 新設 … 同じく nowall の担当 (1d)「壁 1 マス + 5 マス先の敵」は赤くならない。
 *                 素の候補は視線が通る敵だけなので、壁止めを外しても壁の向こうの 1 体は候補に入らない。
 *                 ⇒ 盤面 wall2 = A (2,0) / 壁 (4,0) / B (6,0)。素は A だけ被弾、nowall なら B も被弾。
 *   (1f)  拡張 … 1 盤面ではなく **§1 の素の盤面 10 枚すべて**で「成否 + 被弾集合 == 再計算器」。
 *   (1g)  拡張 … 横 (味方 (3,0)) に加えて斜め (味方 (2,1) / 敵 (4,2)) の 2 盤面。
 *   (1h)  拡張 … 横 7 マス / 斜め (4,1) / 壁の手前で止まる の 3 盤面。
 *   (4a)  拡張 … (1a)(1b) が demoted に戻るだけでは「撤退の腕は何も撃たない」でも緑になる。
 *                 ⇒ 旧挙動で **撃てる** 盤面 (3,0) / (2,2) で cast・被弾集合が旧仕様の再計算と一致・
 *                   描画の終点が旧式 (術者の中心 + 3 マス) であることを足した。
 *   (4b)  拡張 … (0d) と同じ一致に加えて「撤退の腕の試行で、新仕様の再計算と食い違う試行が 1 件以上ある」
 *                 = 撤退の腕が黙って新挙動のまま、を捕まえる (⭐ 差ではなく絶対量)。
 *   (0e)(0f)(0g) 新設 … 変異アンカーの起動時検算 / 盤面を掘った結果の検算 / ページエラー 0。
 * ■ ⭐ 2026-09-17 のユーザー決定で変えた点 (依頼書 §12-3 (g)。⚠ ここだけは「母集団」の閾値の緩和を含むので承認済みと明記する)
 *   (0c) … 「素の各走行 attempts ≥ 5」→「各走行 ≥ 1 かつ 素の全走行の合計 ≥ 20」。
 *   (2a) … LB×8 単独を各マップ 3 → 5 回 (素と撤退)。閾値 3 本の値はそのまま。
 *          さらに決定 E で、率と差を **マップごとの率の単純平均** で測る (合算 pooled とマップ別は [record] 行に出すだけ)。
 *          ⚠ 各 5 回の合算は試行の 7 割強が廃坑に寄り、廃坑の率 (56〜58%) へ引き寄せられて 2 回とも 68% 前後になった。
 *   (2c) … assert から外して [record] 行だけ (総括の分母に入らない)。混成は各マップ 2 回のまま。
 *
 * ■ ⚠ 計測機構で踏んだ罠 (この本を直す人へ)
 *   - ⚠⚠⚠ 不発の盤面で CDP が 240 秒ハングする。不発 → allyBasicAttack → 射程外なら
 *     allyAdvanceTowardPoint の rAF が背景タブで止まる ⇒ 両方を即解決スタブに差し替える
 *     (noteAoeOutcome は不発判定の前に記録済みなので計数に影響しない)。
 *   - ⚠ goblin-mine には 14x4 の自然な床が無い ⇒ 最長の床の行の周りを mapData=0 へ掘る (ページ内だけ)。
 *     掘った範囲に isTileWall が真のマスが残っていないことを (0f) が確かめる (扉が居たら赤)。
 *   - ⚠⚠ 変異の注入点は「ファイル全体の部分文字列の出現数」で数えない。**行単位 + 属する関数本体の範囲**で
 *     ちょうど 1 を確かめる (#68 項目3: driver_action_priority の N3 は同じ行が別関数へ写された日から
 *     18 日間 exit 1 で死んでいた)。index.html は CRLF なので行末の \r を外して比べ、書き戻しで付け直す。
 *   - ⚠⚠ http.Server#close() は Chrome の先読み接続 (要求を 1 本も送っていない socket) を待って
 *     ポートごとに長く止まる (Node 24 の実測)。⇒ 閉じる前に closeAllConnections()。
 *   - ⚠ classic script 直下の let/const は window に載らない → 裸の識別子で読む
 *     (enemies / allies / encounterEnemyIndices / BOLT_AIM_ON / AOE_COVER_ON / MAGE_SKILLS / MAGE_SKILLS_UI)。
 *     function 宣言は window に載るので allyLightningBolt / spawnLightningBolt は差し替えられる。
 *   - ⚠ 実プレイは 1 本ずつ直列 (並走すると偽の赤が出る = project_headless_verification)。
 *     ⛔ このドライバを timeout コマンドで包まない (打ち切ると node が孤児としてポートを掴む)。
 *
 * ■ ⛔ 測らないこと (依頼書 §8)
 *   ダメージ量・セーヴ DC・見た目 / 魔法使い AI の梯子の順番と閾値・不発で枠を減らさないこと /
 *   貫通体数の平均 / 実プレイの cast 率の上限側。
 *
 * ■ ポート = **10301** (素) / 変異 **10302〜10311** (10 本)。
 *   10300〜10320 を使う既存の本は 0 本 (#68 項目1 の実測)。10301〜10312 は goto で ERR_UNSAFE_PORT が出ない (項目4 の実測)。
 * ■ 後始末 = このドライバが起動したもの (内蔵 http サーバとこのブラウザ・プロファイル) だけ。
 *   ⛔ 「LISTEN を 0 にする」で他のプロセスを落とさない (#67 でユーザーのローカルサーバ 8765 を落とした実害)。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須 (区切りのままだと全 404)
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const NO_PLAY = flag('no-play');
const PORT = parseInt(arg('port', '10301'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const DUMP = arg('dump', null);   // 実プレイの生データ (試行ごとの盤面の写し) を JSON で書き出す先。既定は書き出さない
const T_START = Date.now();

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結 = 走行中に別窓が保存しても混合ビルドにならない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const SRC_FILES = ['index.html', 'tavern.html'];
const PRISTINE = {};
for (const f of SRC_FILES) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (負のコントロール)
 *   scope = 注入点が属する範囲の **先頭行** (逐語・行末の \r を除く)。範囲の終わりは先頭行の形から決める:
 *     `{` で終わる → 同じ字下げの `}` / `[` で終わる → 同じ字下げの `];` / `=` で終わる → 次の `;` で終わる行。
 *   from = 範囲の中で **ちょうど 1 行** 一致すべき行 (逐語)。to = 置き換える 1 行。
 * ══════════════════════════════════════════════════════════════════════════════ */
const FN_BOLT = '    async function allyLightningBolt(ally, enemyIdx) {';
const MUTATIONS = {
  /* 素の長さを 3 に固定する。 */
  reach3: { file: 'index.html', scope: FN_BOLT,
    from: '      const boltLen = BOLT_AIM_ON ? getRange(skill.range).tiles : 3;',
    to:   '      const boltLen = BOLT_AIM_ON ? 3 : 3;   /* ★変異reach3 */' },
  /* 素の候補を 8 方向の筋へ戻す (長さ・壁止めは新仕様のまま)。 */
  rays8: { file: 'index.html', scope: FN_BOLT,
    from: '      const rays = BOLT_AIM_ON ? boltAimRays(aCX, aCY, boltLen) : directions;',
    to:   '      const rays = directions;   /* ★変異rays8 */' },
  /* 壁で止めない。 */
  nowall: { file: 'index.html', scope: FN_BOLT,
    from: '        const tiles = boltLineTiles(aTX, aTY, d.dx, d.dy, boltLen, BOLT_AIM_ON);',
    to:   '        const tiles = boltLineTiles(aTX, aTY, d.dx, d.dy, boltLen, false);   /* ★変異nowall */' },
  /* ⭐ 探索は新経路のまま、ダメージだけ旧 3 マスの筋で集める (依頼書 §2-3 の罠の再現)。 */
  dmgray: { file: 'index.html', scope: FN_BOLT,
    from: '      for (const t of best.tiles) for (const i of enemiesInArea(t.tx, t.ty, 1, 1)) lineEnemyIdxs.add(i);',
    to:   '      for (let s = 1; s <= 3; s++) for (const i of enemiesInArea(aTX + best.dx * s, aTY + best.dy * s, 1, 1)) lineEnemyIdxs.add(i);   /* ★変異dmgray */' },
  /* 候補の距離上限を外す。 */
  norange: { file: 'index.html', scope: '    function boltAimRays(aCX, aCY, L) {',
    from: '        if (tileChebyshev(aCX, aCY, eCX, eCY) > L) continue;',
    to:   '        /* ★変異norange — 候補の距離上限を外す */' },
  /* 長さを getRange から導出せず 10 を直書きする。 */
  hardcode10: { file: 'index.html', scope: FN_BOLT,
    from: '      const boltLen = BOLT_AIM_ON ? getRange(skill.range).tiles : 3;',
    to:   '      const boltLen = BOLT_AIM_ON ? 10 : 3;   /* ★変異hardcode10 */' },
  /* ?aoecover=0 でも味方の拒否権を掛けない。⚠ verify_aoe_coverage の m8 と同じ行だが向きは逆。 */
  vetogone: { file: 'index.html', scope: FN_BOLT,
    from: '          if (!AOE_COVER_ON && partyInArea(tx, ty, 1, 1)) { blocked = true; break; }',
    to:   '          if (false && partyInArea(tx, ty, 1, 1)) { blocked = true; break; }   /* ★変異vetogone */' },
  /* BOLT_AIM_ON を常に真にする (撤退スイッチが死ぬ)。 */
  switchdead: { file: 'index.html', scope: '    const BOLT_AIM_ON =',
    from: '      new URLSearchParams(window.location.search).get("boltaim") !== "0";',
    to:   '      true;   /* ★変異switchdead */' },
  /* 描画の終点を旧 best.dx * 3 * TILE_SIZE のままにする。 */
  endstale: { file: 'index.html', scope: FN_BOLT,
    from: '      const boltEnd = BOLT_AIM_ON ? best.tiles[best.tiles.length - 1] : null;',
    to:   '      const boltEnd = null;   /* ★変異endstale */' },
  /* tavern.html の flavor だけ「3 タイル」のまま (酒場の鏡の直し忘れ = #57 の教訓)。 */
  flavor3: { file: 'tavern.html', scope: '  const MAGE_SKILLS_UI = [',
    from: '    { id: "lightning-bolt", name: "ライトニングボルト", category: "攻撃", range: "spellAoE",   mpCost: 6, flavor: "敵へ向けて直線 10 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし" },',
    to:   '    { id: "lightning-bolt", name: "ライトニングボルト", category: "攻撃", range: "spellAoE",   mpCost: 6, flavor: "直線 3 タイル 5d6 雷 (DEX セーヴ半減)、PT 巻き込みなし" },   /* ★変異flavor3 */' },
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。1 本ずつ実走して実際に赤くなった集合を見て決める。
 * ── 2026-09-17 の実走 (#68 項目4・素の合成盤面 17/17 の上) で実際に赤くなった集合 (巻き添えも残す) ──
 *   reach3     … (1a)(1b)(1c2)(1e)(1f)(1g)(1h)(5a)   ⭐ 長さ 3 は素の盤面の大半を殺す
 *   rays8      … (1a)(1f)(1g)(1h)
 *   nowall     … (1d2)(1f)(1h)                        ⚠ (1d) は緑のまま (依頼書 §8 の担当は外れ = 項目2 の予告どおり)
 *   dmgray     … (1c2)(1e)(1f)
 *   norange    … (1c2)(1f)                            ⚠ (1c) は緑のまま (同上)
 *   hardcode10 … (5a)                                 ⭐ 最も鋭い (素の長さは同じ 10 なので §5 だけが見分ける)
 *   vetogone   … (1g)
 *   switchdead … (0a)(1a)(1b)(4a)                     ⚠ (0a) は判定の行そのものを消すので巻き添え
 *   endstale   … (1h)
 *   flavor3    … (3a)
 * ⚠ 担当が赤くなっても、起動確認 (4 腕 + tavern が起動し (0b) のシームが生きている) が NG なら検出に数えない。
 */
const NEG_EXPECT = {
  reach3:     ['(1b)', '(5a)'],
  rays8:      ['(1a)'],
  nowall:     ['(1d2)'],
  dmgray:     ['(1e)', '(1f)'],
  norange:    ['(1c2)'],
  hardcode10: ['(5a)'],
  vetogone:   ['(1g)'],
  switchdead: ['(4a)'],
  endstale:   ['(1h)'],
  flavor3:    ['(3a)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
for (const k of ONLY) {
  if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) {
    console.error('[drv] 未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');
    process.exit(3);
  }
}

/* ── (0e) 変異アンカーの起動時検算 — **手つかずの原本**に対して行単位 + 範囲で数える ─────────── */
function splitLines(text) { return text.split('\n'); }
function bare(line) { return line.endsWith('\r') ? line.slice(0, -1) : line; }
function scopeRange(lines, scope) {
  const starts = [];
  for (let i = 0; i < lines.length; i++) if (bare(lines[i]) === scope) starts.push(i);
  if (starts.length !== 1) return { starts: starts.length, start: -1, end: -1 };
  const s = starts[0];
  const indent = (scope.match(/^\s*/) || [''])[0];
  let closeTest;
  if (/\{\s*$/.test(scope)) closeTest = (l) => l === indent + '}';
  else if (/\[\s*$/.test(scope)) closeTest = (l) => l === indent + '];';
  else if (/=\s*$/.test(scope)) closeTest = (l) => /;\s*$/.test(l);
  else return { starts: 1, start: s, end: -1 };
  for (let j = s + 1; j < lines.length; j++) if (closeTest(bare(lines[j]))) return { starts: 1, start: s, end: j };
  return { starts: 1, start: s, end: -1 };
}
function auditMutation(key) {
  const m = MUTATIONS[key];
  const lines = splitLines(PRISTINE[m.file]);
  const sr = scopeRange(lines, m.scope);
  const inScope = [];
  let inFile = 0;
  for (let i = 0; i < lines.length; i++) {
    if (bare(lines[i]) !== m.from) continue;
    inFile++;
    if (sr.end > 0 && i > sr.start && i <= sr.end) inScope.push(i);
  }
  const multiline = /[\r\n]/.test(m.from) || /[\r\n]/.test(m.to);
  const sameLen = m.from.length === m.to.length;
  const ok = sr.starts === 1 && sr.end > 0 && inScope.length === 1 && !multiline && !sameLen;
  return { key: key, file: m.file, ok: ok, scopeStarts: sr.starts, scopeLines: sr.end > 0 ? (sr.end - sr.start + 1) : null,
    inScope: inScope.length, inFile: inFile, line: inScope.length === 1 ? inScope[0] + 1 : null,
    multiline: multiline, sameLen: sameLen };
}
const AUDIT = MUT_ORDER.map(auditMutation);
console.log('[drv] §0e 変異アンカーの検算 (原本・行単位 + 属する範囲):');
for (const a of AUDIT) {
  console.log('   ' + (a.ok ? 'OK ' : '⛔ ') + a.key.padEnd(11) + ' ' + a.file + ':' + a.line
    + '  範囲の先頭 ' + a.scopeStarts + ' 箇所 (' + a.scopeLines + ' 行) / 範囲内 ' + a.inScope + ' 行 / ファイル全体 ' + a.inFile + ' 行'
    + (a.multiline ? ' / ⛔複数行' : '') + (a.sameLen ? ' / ⛔置換前後が同長' : ''));
}
const AUDIT_BAD = AUDIT.filter((a) => !a.ok);
if (AUDIT_BAD.length && (NEGATIVE || MUTATE)) {
  console.error('[drv] ⛔ 変異アンカーが ' + AUDIT_BAD.length + ' 本腐っている (' + AUDIT_BAD.map((a) => a.key).join(',')
    + ') → 負のコントロールが空振りするので走らせない');
  process.exit(3);
}

const _mutCache = {};
function mutatedSources(key) {
  if (!key) return null;
  if (_mutCache[key]) return _mutCache[key];
  const m = MUTATIONS[key];
  const a = auditMutation(key);
  if (!a.ok) { console.error('[drv] ⛔ 変異 ' + key + ' の注入点がちょうど 1 行ではない'); process.exit(3); }
  const out = {};
  for (const f of SRC_FILES) out[f] = PRISTINE[f];
  const lines = splitLines(PRISTINE[m.file]);
  const i = a.line - 1;
  const cr = lines[i].endsWith('\r') ? '\r' : '';
  lines[i] = m.to + cr;
  out[m.file] = lines.join('\n');
  /* 検算: 変わった行はちょうど 1 行 */
  const before = splitLines(PRISTINE[m.file]), after = splitLines(out[m.file]);
  let diff = 0;
  for (let j = 0; j < before.length; j++) if (before[j] !== after[j]) diff++;
  if (diff !== 1 || before.length !== after.length) {
    console.error('[drv] ⛔ 変異 ' + key + ' の差し替えが 1 行に閉じていない (diff=' + diff + ')'); process.exit(3);
  }
  _mutCache[key] = out;
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[drv] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません (--browser <path>)'); process.exit(2);
}
// ⚠ MIME を持たせ忘れると全 500 = ページが白紙になり「シームが無い」ように見える
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SERVERS = [];
function startServer(port, mutKey) {
  const srcs = mutKey ? mutatedSources(mutKey) : PRISTINE;
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (Object.prototype.hasOwnProperty.call(srcs, rel)) {
          res.setHeader('Content-Type', MIME['.html']);
          res.end(Buffer.from(srcs[rel], 'utf8')); return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => { SERVERS.push(srv); resolve(srv); });
  });
}
function stopServer(srv) {
  return new Promise((resolve) => {
    try { srv.closeAllConnections(); } catch (e) {}   // ⚠ 先読み接続を切らないと close が長く止まる
    try { srv.close(() => resolve()); } catch (e) { resolve(); }
    const i = SERVERS.indexOf(srv); if (i >= 0) SERVERS.splice(i, 1);
  });
}
function httpGetText(port, p) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: port, path: p, agent: false }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', () => resolve(''));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側のコード (文字列として注入する。⛔ ここに判定ロジックを書かない = 生データを採るだけ)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* 盤面の生データ。⭐ 本番の直線・視線・被害者列挙のヘルパーは 1 つも呼ばない
 *   (isTileWall は「地図そのもの」なので写しを採るのに使う)。 */
function pageSnapHelper() {
  window.__vbaSnap = function (ally, enemyIdx) {
    const T = TILE_SIZE;
    const aCX = ally.x + ally.def.displaySize / 2, aCY = ally.y + ally.def.displaySize / 2;
    const m = { tx: Math.floor(aCX / T), ty: Math.floor(aCY / T) };
    const R = 11;
    const walls = [];
    for (let y = m.ty - R; y <= m.ty + R; y++) {
      let row = '';
      for (let x = m.tx - R; x <= m.tx + R; x++) row += isTileWall(x, y) ? '#' : '.';
      walls.push(row);
    }
    const foes = [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.alive || !e.def) continue;
      foes.push({ i: i, inactive: !!e.inactive, escort: !!e.def.isObjective,
        tx: Math.floor((e.x + e.def.displaySize / 2) / T), ty: Math.floor((e.y + e.def.displaySize / 2) / T) });
    }
    const party = [{ tx: Math.floor((playerX + 48) / T), ty: Math.floor((playerY + 58) / T) }];
    const al = (typeof allies !== 'undefined' && allies) ? allies : [];
    for (const a of al) {
      if (!a || !a.alive || !a.def) continue;
      party.push({ tx: Math.floor((a.x + a.def.displaySize / 2) / T), ty: Math.floor((a.y + a.def.displaySize / 2) / T) });
    }
    const skill = MAGE_SKILLS['lightning-bolt'];
    const t = enemies[enemyIdx];
    return { m: m, aCX: aCX, aCY: aCY, T: T, R: R, walls: walls, foes: foes,
      enc: encounterEnemyIndices.slice(), party: party, L: getRange(skill.range).tiles,
      aoeCover: AOE_COVER_ON, boltAim: (typeof BOLT_AIM_ON !== 'undefined') ? BOLT_AIM_ON : null,
      targetAlive: !!(t && t.alive), key: skill.name };
  };
}
/* 実プレイ: 全ドキュメントで allyLightningBolt を包み、試行ごとに生データ + 実物の成否を Node へ送る。
 * ⭐ async 関数は最初の await まで同期で走る = noteAoeOutcome は orig を呼んだ直後に計上済み。 */
function pageWrapHook() {
  window.__vbaDoc = Math.random().toString(36).slice(2, 10);
  document.addEventListener('DOMContentLoaded', function () {
    try {
      if (typeof window.allyLightningBolt !== 'function') return;
      const orig = window.allyLightningBolt;
      window.allyLightningBolt = function (ally, enemyIdx) {
        let snap = null, snapErr = null, key = null;
        try { snap = window.__vbaSnap(ally, enemyIdx); key = snap.key; } catch (e) { snapErr = String((e && e.message) || e); }
        const read = function () {
          const st = (window.__aoeStats && key) ? window.__aoeStats[key] : null;
          return st ? { a: st.attempts, c: st.cast, d: st.demoted } : { a: 0, c: 0, d: 0 };
        };
        const s0 = read();
        const p = orig.apply(this, arguments);
        const s1 = read();
        try {
          const r = window.__vbaReport(JSON.stringify({ doc: window.__vbaDoc, snap: snap, snapErr: snapErr,
            noted: s1.a - s0.a, cast: s1.c - s0.c, demoted: s1.d - s0.d }));
          if (r && r.catch) r.catch(function () {});
        } catch (e) {}
        return p;
      };
      window.__vbaWrapped = true;
    } catch (e) { window.__vbaWrapErr = String((e && e.message) || e); }
  });
}
/* 合成盤面の据え付け (verify_aoe_coverage の installProbe の作法 + #68 項目2 の罠への対処)。 */
function pageBoard() {
  gameOver = true;
  try { encounterActive = false; } catch (e) {}
  window.sleepMs = () => new Promise((r) => setTimeout(r, 0));   // ⛔ Promise.resolve() はマイクロタスク飢餓
  try { window.moveEnemies = function () {}; } catch (e) {}
  window.dfPlayCast = function () { return Promise.resolve(); };
  window.spawnFireballProjectile = function () { return Promise.resolve(); };
  window.spawnArrow = function () { return Promise.resolve(); };
  window.castMagicMissileBarrage = function () { return Promise.resolve(); };
  /* ⚠⚠⚠ 不発 → 通常攻撃 → 歩み寄りの rAF で CDP が 240 秒ハングする (#68 項目2)。 */
  window.__basic = 0;
  window.allyBasicAttack = function () { window.__basic++; return Promise.resolve(); };
  window.allyAdvanceTowardPoint = function () { return Promise.resolve(); };
  /* ⭐ (1h) 描画の終点は spawnLightningBolt が受け取った引数そのもの。 */
  window.__bolts = [];
  const _sb = window.spawnLightningBolt;
  window.spawnLightningBolt = function (fx, fy, tx, ty) {
    window.__bolts.push({ fx: fx, fy: fy, tx: tx, ty: ty });
    return _sb.apply(null, arguments);
  };
  window.__pops = [];
  try {
    new MutationObserver(function (muts) {
      for (const mu of muts) for (const n of mu.addedNodes)
        if (n.nodeType === 1 && n.classList && n.classList.contains('rollPop')) window.__pops.push(n.textContent);
    }).observe(document.body, { childList: true });
  } catch (e) {}

  const T = TILE_SIZE;
  /* 盤面の範囲 (術者からの相対)。⭐ 絶対タイル座標を直書きしない。 */
  const X0 = -2, X1 = 13, Y0 = -2, Y1 = 3;
  const blockedIn = (ox, oy) => {
    let n = 0;
    for (let y = oy + Y0; y <= oy + Y1; y++) for (let x = ox + X0; x <= ox + X1; x++) if (isTileWall(x, y)) n++;
    return n;
  };
  let org = null;
  for (let y = 1 - Y0; y < MAP_H - Y1 - 1 && !org; y++)
    for (let x = 1 - X0; x < MAP_W - X1 - 1 && !org; x++) if (blockedIn(x, y) === 0) org = { x: x, y: y };
  let carved = false, carvedN = 0;
  if (!org) {   // 自然の床が無ければ、最長の床の行の周りを掘る (ページ内だけ)
    let lane = { len: 0, ty: -1, tx0: -1 };
    for (let ty = 1 - Y0; ty < MAP_H - Y1 - 1; ty++) {
      let run = 0, st = 0;
      for (let tx = 1; tx < MAP_W - 1; tx++) {
        if (!isTileWall(tx, ty)) { if (!run) st = tx; run++; if (run > lane.len) lane = { len: run, ty: ty, tx0: st }; }
        else run = 0;
      }
    }
    org = { x: Math.min(Math.max(1 - X0, lane.tx0), MAP_W - X1 - 2), y: lane.ty };
    for (let y = org.y + Y0; y <= org.y + Y1; y++) for (let x = org.x + X0; x <= org.x + X1; x++) {
      if (mapData[y][x] !== 0) carvedN++;
      mapData[y][x] = 0;
      try { obstacleTileMask[y * MAP_W + x] = 0; } catch (e) {}
    }
    carved = true;
  }
  const setUnit = (u, tx, ty) => {
    const s = (u.def && u.def.displaySize) || 96;
    u.x = tx * T + T / 2 - s / 2; u.y = ty * T + T / 2 - s / 2;
  };
  const mageOf = () => allies.find((a) => a.classKey === 'mage');
  window.__vbb = {
    run: async function (spec) {
      for (const e of enemies) { e.alive = false; e.hp = 0; }
      for (const a of allies) { a.alive = true; a.hp = a.maxHp; a.x = -999999; a.y = -999999; }
      const m = mageOf();
      setUnit(m, org.x, org.y);
      const h = spec.hero || [-1, 0];
      snapPlayerToTile(org.x + h[0], org.y + h[1]);
      const saved = [];
      for (const w of (spec.walls || [])) {
        const x = org.x + w[0], y = org.y + w[1];
        saved.push([x, y, mapData[y][x]]); mapData[y][x] = 2;
      }
      const made = [];
      for (const f of spec.foes) {
        const idx = enemies.length;
        const e = createEnemy('goblin', org.x + f[0], org.y + f[1]);
        enemies.push(e); createEnemyDom(idx, e.def, e.type);
        e.alive = true; e.maxHp = 400; e.hp = 400; e.stunned = 0;
        made.push(idx);
      }
      encounterEnemyIndices = made.slice();
      window.__aoeStats = {}; window.__bolts.length = 0; window.__pops.length = 0; window.__basic = 0;
      const key = MAGE_SKILLS['lightning-bolt'].name;
      const before = made.map((i) => enemies[i].hp);
      let snap = null, snapErr = null, err = null;
      try { snap = window.__vbaSnap(m, made[0]); } catch (e) { snapErr = String((e && e.message) || e); }
      try { await window.allyLightningBolt(m, made[0]); } catch (e) { err = String((e && e.message) || e); }
      const st = (window.__aoeStats || {})[key] || null;
      const hit = made.filter((i, k) => before[k] - enemies[i].hp > 0);
      for (const s of saved) mapData[s[1]][s[0]] = s[2];
      for (const i of made) { enemies[i].alive = false; enemies[i].hp = 0; }
      return { err: err, snapErr: snapErr, key: key,
        stats: st ? { attempts: st.attempts, cast: st.cast, demoted: st.demoted } : null,
        made: made, hit: hit, snap: snap, bolts: window.__bolts.slice(), pops: window.__pops.slice(),
        basic: window.__basic };
    },
  };
  return { org: org, carved: carved, carvedN: carvedN, blockedAfter: blockedIn(org.x, org.y),
    MAP_W: MAP_W, MAP_H: MAP_H, T: T,
    boltAim: (typeof BOLT_AIM_ON !== 'undefined') ? BOLT_AIM_ON : null,
    cover: (typeof AOE_COVER_ON !== 'undefined') ? AOE_COVER_ON : null,
    L: getRange(MAGE_SKILLS['lightning-bolt'].range).tiles,
    fnBolt: typeof window.allyLightningBolt, fnSpawn: typeof window.spawnLightningBolt,
    flavor: MAGE_SKILLS['lightning-bolt'].flavor };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ⭐⭐⭐ 独立再計算器 — 依頼書 §5-2 / §5-3 の仕様だけから書く (本番のヘルパーを呼ばない)
 *   mode 'aim'    = 素: 候補 = 交戦中・生存・非護衛・チェビシェフ ≤ L・視線が通る敵への既約ベクトル (交戦順・重複除去)
 *                   直線 = 整数倍の終点への Bresenham。L 超で打ち切り、壁のマスの手前で打ち切り。
 *   mode 'legacy' = 撤退: 8 方向 (旧コードの並び)・単位ベクトル × 1,2,3・壁を見ない。
 *   共通: 列の途中に味方が居れば AOE_COVER_ON が偽のときだけ捨てる / 数えるのは非 inactive・非護衛の生存敵 /
 *         採用 = 敵数が最大 (同数は先勝ち) / 成否 = 最大が 1 以上。
 * ══════════════════════════════════════════════════════════════════════════════ */
const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [1, 1], [-1, -1], [-1, 1]];
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const r = a % b; a = b; b = r; } return a; }
/* 盤面の写しの上の幾何 (壁 / チェビシェフ / 視線)。⛔ 本番の hasLineOfSight を呼ばない。 */
function geoOf(s) {
  const mx = s.m.tx, my = s.m.ty;
  const ox = mx - s.R, oy = my - s.R;
  const g = { oob: false };
  g.wall = (x, y) => {
    const r = y - oy, c = x - ox;
    if (r < 0 || c < 0 || r >= s.walls.length || c >= s.walls[r].length) { g.oob = true; return true; }
    return s.walls[r].charAt(c) === '#';
  };
  g.cheb = (x, y) => Math.max(Math.abs(x - mx), Math.abs(y - my));
  /* 視線 = 術者のマスから敵のマスまで Bresenham で歩き、途中 (両端を含む) に壁が 1 つでもあれば通らない。 */
  g.los = (x, y) => {
    let cx = mx, cy = my;
    const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
    const sx = cx < x ? 1 : -1, sy = cy < y ? 1 : -1;
    let err = dx - dy;
    for (let k = 0; k <= dx + dy + 1; k++) {
      if (g.wall(cx, cy)) return false;
      if (cx === x && cy === y) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
    return false;
  };
  return g;
}
/* 不発の内訳 (記録用。⛔ 合否には使わない)。新仕様で撃てなかった試行を、候補が消えた段で分類する。 */
function demotedWhy(s) {
  const g = geoOf(s);
  const L = s.L;
  const byI = new Map(s.foes.map((f) => [f.i, f]));
  const eng = s.enc.map((i) => byI.get(i)).filter((f) => f && !f.escort);
  const engIn = eng.filter((f) => g.cheb(f.tx, f.ty) <= L);
  const engLos = engIn.filter((f) => g.los(f.tx, f.ty) && !(f.tx === s.m.tx && f.ty === s.m.ty));
  const engAct = engLos.filter((f) => !f.inactive);
  const other = s.foes.filter((f) => !f.escort && !f.inactive && s.enc.indexOf(f.i) < 0
    && g.cheb(f.tx, f.ty) <= L && g.los(f.tx, f.ty));
  const sameTile = engIn.filter((f) => f.tx === s.m.tx && f.ty === s.m.ty).length;
  const why = !eng.length ? 'noEngaged' : (!engIn.length ? 'engagedFar'
    : (!engLos.length ? ((sameTile === engIn.length) ? 'sameTile' : 'noLOS')
    : (!engAct.length ? 'inactiveOnly' : 'other')));
  const near = eng.length ? Math.min.apply(null, eng.map((f) => g.cheb(f.tx, f.ty))) : null;
  return { why: why, nearEngaged: near, nonEngagedReachable: other.length,
    casterOnWall: g.wall(s.m.tx, s.m.ty), engInOnWall: engIn.filter((f) => g.wall(f.tx, f.ty)).length };
}
function oracleBolt(s, mode) {
  const aim = mode === 'aim';
  const L = aim ? s.L : 3;
  const mx = s.m.tx, my = s.m.ty;
  const G = geoOf(s);
  const wall = G.wall, cheb = G.cheb, los = G.los;
  const byI = new Map(s.foes.map((f) => [f.i, f]));
  let rays = [];
  if (aim) {
    const seen = new Set();
    for (const i of s.enc) {
      const f = byI.get(i);
      if (!f || f.escort) continue;               // foes は生存だけを採ってある
      if (cheb(f.tx, f.ty) > L) continue;
      if (!los(f.tx, f.ty)) continue;
      let dx = f.tx - mx, dy = f.ty - my;
      if (dx === 0 && dy === 0) continue;
      const g = gcd(dx, dy); dx /= g; dy /= g;
      const k = dx + ',' + dy;
      if (seen.has(k)) continue;
      seen.add(k); rays.push([dx, dy]);
    }
  } else rays = DIR8;
  const lineOf = (d) => {
    const out = [];
    if (!aim) { for (let k = 1; k <= 3; k++) out.push([mx + d[0] * k, my + d[1] * k]); return out; }
    const n = Math.max(Math.abs(d[0]), Math.abs(d[1]));
    const mul = Math.ceil(L / n);
    const ex = mx + d[0] * mul, ey = my + d[1] * mul;
    const adx = Math.abs(ex - mx), ady = Math.abs(ey - my);
    const sx = mx < ex ? 1 : -1, sy = my < ey ? 1 : -1;
    let err = adx - ady, x = mx, y = my;
    while (x !== ex || y !== ey) {
      const e2 = 2 * err;
      if (e2 > -ady) { err -= ady; x += sx; }
      if (e2 < adx) { err += adx; y += sy; }
      if (cheb(x, y) > L) break;
      if (wall(x, y)) break;
      out.push([x, y]);
    }
    return out;
  };
  const live = s.foes.filter((f) => !f.inactive && !f.escort);
  let best = null, bestCount = 0;
  for (const d of rays) {
    const tiles = lineOf(d);
    let blocked = false, cnt = 0;
    const idx = [];
    for (const t of tiles) {
      if (!s.aoeCover && s.party.some((p) => p.tx === t[0] && p.ty === t[1])) { blocked = true; break; }
      for (const f of live) if (f.tx === t[0] && f.ty === t[1]) { cnt++; idx.push(f.i); }
    }
    if (blocked) continue;
    if (cnt > bestCount) { best = { d: d, tiles: tiles, idx: idx }; bestCount = cnt; }
  }
  return { ok: bestCount > 0, count: bestCount, rays: rays.length, oob: G.oob,
    hit: best ? best.idx.slice().sort((a, b) => a - b) : [],
    last: (best && best.tiles.length) ? best.tiles[best.tiles.length - 1] : null,
    dir: best ? best.d : null, L: L };
}
const sameSet = (a, b) => JSON.stringify((a || []).slice().sort((x, y) => x - y)) === JSON.stringify((b || []).slice().sort((x, y) => x - y));

/* ══════════════════════════════════════════════════════════════════════════════
 * 合成盤面 (§0 / §1 / §3 / §4a / §5)
 * ══════════════════════════════════════════════════════════════════════════════ */
const BOARD_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
];
/* 盤面はすべて術者からの相対 [dx, dy]。主人公の既定は術者の真後ろ [-1, 0]。 */
const B = {
  b1a:    { foes: [[4, 1]] },                                   // 筋から外れた敵
  b1b:    { foes: [[7, 0]] },                                   // 筋の上 7 マス
  b1c:    { foes: [[11, 0]] },                                  // チェビシェフ 11 = L+1
  range3: { foes: [[5, 0], [7, 1], [11, 1]] },                  // (1c2) A / C / B
  b1d:    { foes: [[5, 0]], walls: [[3, 0]] },                  // 間に壁 1 マス
  wall2:  { foes: [[2, 0], [6, 0]], walls: [[4, 0]] },          // (1d2) A / 壁 / B
  b1e:    { foes: [[3, 0], [8, 0]] },                           // 貫通 2 体
  b1g:    { hero: [3, 0], foes: [[6, 0]] },                     // 味方が唯一の直線の途中 (横)
  b1g2:   { hero: [2, 1], foes: [[4, 2]] },                     // 同 (斜め)
  b1hw:   { foes: [[3, 0]], walls: [[6, 0]] },                  // 描画は壁の手前で止まる
  r3:     { foes: [[3, 0]] },                                   // 撤退でも撃てる (旧挙動)
  r3d:    { foes: [[2, 2]] },                                   // 同 (斜め)
  g6:     { foes: [[6, 0]] },                                   // (5a) ?dndrange=0 の L=5 を 1 超える
  g4:     { foes: [[4, 0]] },                                   // (5a) L=5 以内
};
const BOARD_ARMS = { base: '', ret: '?boltaim=0', cov: '?aoecover=0', dnd: '?dndrange=0' };

async function openBoardPage(browser, port, qs, errs) {
  const page = await browser.newPage();
  const tag = ':' + port + ' index' + (qs || '');
  page.on('pageerror', (e) => errs.push(tag + ' PAGEERROR ' + e.message));
  page.on('console', (mm) => {
    if (mm.type() !== 'error') return;
    let url = ''; try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;   // ⚠ 除外はこの 1 本の URL だけ
    errs.push(tag + ' CONSOLE ' + mm.text());
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((party) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(party));
      localStorage.setItem('dragonfighters.xp', '45000');
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  }, BOARD_PARTY);
  await page.goto('http://127.0.0.1:' + port + '/index.html' + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    "typeof allies !== 'undefined' && allies.length > 0 && typeof enemies !== 'undefined'"
    + " && typeof createEnemy === 'function' && typeof allyLightningBolt === 'function' && !!mapData",
    { timeout: 45000 });
  await sleep(1500);
  const info = await page.evaluate('(' + pageSnapHelper.toString() + ')();(' + pageBoard.toString() + ')()');
  return { page: page, info: info };
}
async function openTavernPage(browser, port, errs) {
  const page = await browser.newPage();
  const tag = ':' + port + ' tavern';
  page.on('pageerror', (e) => errs.push(tag + ' PAGEERROR ' + e.message));
  page.on('console', (mm) => {
    if (mm.type() !== 'error') return;
    let url = ''; try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + ' CONSOLE ' + mm.text());
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:' + port + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction("typeof MAGE_SKILLS_UI !== 'undefined' && Array.isArray(MAGE_SKILLS_UI)", { timeout: 25000 });
  const flavor = await page.evaluate(() => {
    const s = MAGE_SKILLS_UI.filter((x) => x && x.id === 'lightning-bolt')[0];
    return s ? s.flavor : null;
  });
  return { page: page, flavor: flavor };
}

function mkResults() {
  const R = [];
  R.check = (id, name, cond, detail) => {
    R.push({ id: id, name: name, ok: !!cond, pending: false, detail: detail === undefined ? '' : String(detail) });
    console.log((cond ? '  OK  ' : '  NG  ') + id + ' ' + name + (detail !== undefined ? '  -- ' + detail : ''));
  };
  R.pending = (id, name, why) => {
    R.push({ id: id, name: name, ok: false, pending: true, detail: why });
    console.log('  ..  ' + id + ' ' + name + '  -- PENDING ' + why);
  };
  return R;
}
const stat = (r) => (r && r.stats) ? r.stats : { attempts: 0, cast: 0, demoted: 0 };
const isCast = (r) => !r.err && stat(r).attempts === 1 && stat(r).cast === 1 && stat(r).demoted === 0;
const isDem = (r) => !r.err && stat(r).attempts === 1 && stat(r).cast === 0 && stat(r).demoted === 1;
const brief = (r) => r ? (JSON.stringify(stat(r)) + ' hit=' + JSON.stringify(r.hit) + (r.err ? ' ERR=' + r.err : '')
  + (r.snapErr ? ' SNAPERR=' + r.snapErr : '')) : 'なし';

async function runSynthetic(browser, port, label, R) {
  const errs = [];
  const pages = [];
  const out = { booted: false, bootErr: null, errs: errs, served: null };
  console.log('\n[drv] ══ 合成盤面 ' + label + ' (port ' + port + ') ══');
  const served = await httpGetText(port, '/index.html');
  out.served = { judge: served.split('get("boltaim")').length - 1,
    def: served.split('async function allyLightningBolt(').length - 1, bytes: Buffer.byteLength(served, 'utf8') };
  const A = {};
  let tav = null;
  try {
    for (const arm of Object.keys(BOARD_ARMS)) { A[arm] = await openBoardPage(browser, port, BOARD_ARMS[arm], errs); pages.push(A[arm].page); }
    tav = await openTavernPage(browser, port, errs); pages.push(tav.page);
    out.booted = true;
  } catch (e) {
    out.bootErr = String((e && e.message) || e);
    console.log('  ⛔ ページが起動しなかった: ' + out.bootErr);
    for (const p of pages) await p.close().catch(() => {});
    return out;
  }
  const run = (arm, key) => A[arm].page.evaluate((s) => window.__vbb.run(s), B[key]);
  const T = A.base.info.T;

  /* ── §0 装置 ─────────────────────────────────────────────────────────────── */
  R.check('(0a)', '[装置] 配信 index.html に撤退の判定 get("boltaim") がちょうど 1・allyLightningBolt の定義が 1、ページで関数として読める'
    + ' (⚠ 語 boltaim の行はコメント込みで 4 あるので判定の形で数える)',
    out.served.judge === 1 && out.served.def === 1 && A.base.info.fnBolt === 'function',
    'get("boltaim")=' + out.served.judge + ' / async function allyLightningBolt(=' + out.served.def
    + ' / typeof=' + A.base.info.fnBolt + ' / 配信 ' + out.served.bytes + ' B');

  const r0b = await run('base', 'b1b');
  out.seam = r0b.stats ? r0b.stats.attempts : 0;
  R.check('(0b)', '[装置] 合成盤面で allyLightningBolt を 1 回呼ぶと __aoeStats[呪文名].attempts が 0 → 1'
    + ' (⭐⭐⭐ 0 なら以降の assert は全部空振り)',
    !!r0b.stats && r0b.stats.attempts === 1 && !r0b.err,
    'key=' + r0b.key + ' ' + brief(r0b));

  const infos = Object.keys(A).map((k) => k + ':' + JSON.stringify({ org: A[k].info.org, carved: A[k].info.carved,
    blockedAfter: A[k].info.blockedAfter, boltAim: A[k].info.boltAim, cover: A[k].info.cover, L: A[k].info.L }));
  const orgKey = JSON.stringify(A.base.info.org);
  R.check('(0f)', '[装置] 盤面 (術者から x -2..13 / y -2..3) に歩けないマスが 1 つも無く、4 腕で原点が同じ'
    + ' (⚠ goblin-mine は自然な床が無いので掘る。扉が残っていたら赤)',
    Object.keys(A).every((k) => A[k].info.blockedAfter === 0 && JSON.stringify(A[k].info.org) === orgKey),
    infos.join(' / '));

  /* ── §1 合成盤面 ─────────────────────────────────────────────────────────── */
  const base = {}, ret = {}, cov = {}, dnd = {};
  base.b1a = await run('base', 'b1a'); ret.b1a = await run('ret', 'b1a');
  R.check('(1a)', '★ 敵 1 体を筋から外れた (4,1) に置く → 素 cast 1 / 撤退 ?boltaim=0 demoted 1',
    isCast(base.b1a) && isDem(ret.b1a),
    '素 ' + brief(base.b1a) + '  ‖  撤退 ' + brief(ret.b1a));

  base.b1b = r0b; ret.b1b = await run('ret', 'b1b');
  R.check('(1b)', '★ 敵 1 体を筋の上 7 マスに置く → 素 cast 1 / 撤退 demoted 1',
    isCast(base.b1b) && isDem(ret.b1b),
    '素 ' + brief(base.b1b) + '  ‖  撤退 ' + brief(ret.b1b));

  base.b1c = await run('base', 'b1c');
  R.check('(1c)', '敵 1 体をチェビシェフ 11 マス (= L+1) に置く → 素でも demoted 1 (射程の上限)',
    isDem(base.b1c), '素 ' + brief(base.b1c) + ' / L=' + A.base.info.L);

  base.range3 = await run('base', 'range3');
  const rg = base.range3.made;
  R.check('(1c2)', '★★ 距離上限の番人: A (5,0) / C (7,1) / B (11,1) → 素 cast 1 で被弾は A だけ'
    + ' (⭐ 上限を外すと B への向きが A と C を通って採られ C も被弾する。⚠ (1c) の 1 体盤面では原理的に赤くならない)',
    isCast(base.range3) && sameSet(base.range3.hit, [rg[0]]),
    brief(base.range3) + ' / A,C,B=' + JSON.stringify(rg));

  base.b1d = await run('base', 'b1d');
  R.check('(1d)', '術者と敵 (5 マス先・筋の上) の間に壁 1 マス → 素 demoted 1 (壁で止まる)',
    isDem(base.b1d), '素 ' + brief(base.b1d));

  base.wall2 = await run('base', 'wall2');
  const w2 = base.wall2.made;
  R.check('(1d2)', '★★ 壁止めの番人: A (2,0) / 壁 (4,0) / B (6,0) → 素 cast 1 で被弾は A だけ'
    + ' (⭐ 壁で止めないと B も被弾する。⚠ (1d) の 1 体盤面では壁の向こうの敵が候補に入らないので原理的に赤くならない)',
    isCast(base.wall2) && sameSet(base.wall2.hit, [w2[0]]),
    brief(base.wall2) + ' / A,B=' + JSON.stringify(w2));

  base.b1e = await run('base', 'b1e');
  R.check('(1e)', '★ 狙える敵 (3,0) の奥・同じ直線上 L 以内 (8,0) にもう 1 体 → 素 cast 1 で 2 体とも HP が減る (貫通)',
    isCast(base.b1e) && sameSet(base.b1e.hit, base.b1e.made),
    brief(base.b1e) + ' / made=' + JSON.stringify(base.b1e.made));

  base.b1g = await run('base', 'b1g'); base.b1g2 = await run('base', 'b1g2');
  cov.b1g = await run('cov', 'b1g'); cov.b1g2 = await run('cov', 'b1g2');
  base.b1hw = await run('base', 'b1hw');

  /* (1f) ⭐⭐ 2 経路: 素の盤面 10 枚すべてで、実物の成否と被弾集合 == ドライバの独立再計算 */
  const F_KEYS = ['b1a', 'b1b', 'b1c', 'range3', 'b1d', 'wall2', 'b1e', 'b1g', 'b1g2', 'b1hw'];
  const fRows = [];
  let fBad = 0;
  for (const k of F_KEYS) {
    const r = base[k];
    const o = r.snap ? oracleBolt(r.snap, 'aim') : null;
    const act = isCast(r);
    const good = !!o && !o.oob && !r.snapErr && !r.err && stat(r).attempts === 1
      && act === o.ok && sameSet(r.hit, o.hit);
    if (!good) fBad++;
    fRows.push(k + (good ? ' ✓' : ' ✗') + '(実物 ' + (act ? 'cast' : 'demoted') + ' ' + JSON.stringify(r.hit)
      + ' / 再計算 ' + (o ? (o.ok ? 'cast' : 'demoted') + ' ' + JSON.stringify(o.hit) + (o.oob ? ' oob' : '') : 'なし') + ')');
  }
  R.check('(1f)', '★★★ 素の盤面 ' + F_KEYS.length + ' 枚すべてで、実物の成否と被弾した敵の集合 == ドライバが同じ盤面で独立に引いた直線'
    + ' (⭐ 本番の boltLineTiles / boltAimRays / hasLineOfSight / enemiesInArea を 1 つも呼ばない)',
    fBad === 0, fRows.join(' / '));

  R.check('(1g)', '★ 味方を唯一の候補直線の途中に置く (横 (3,0)・斜め (2,1)) → 素 cast 1 / ?aoecover=0 で demoted 1',
    A.cov.info.cover === false && A.base.info.cover === true
    && isCast(base.b1g) && isCast(base.b1g2) && isDem(cov.b1g) && isDem(cov.b1g2),
    'AOE_COVER_ON 素=' + A.base.info.cover + ' 撤退=' + A.cov.info.cover
    + ' / 横 素 ' + brief(base.b1g) + ' ‖ ' + brief(cov.b1g)
    + ' / 斜め 素 ' + brief(base.b1g2) + ' ‖ ' + brief(cov.b1g2)
    + ' / 吹き出し ' + JSON.stringify((base.b1g.pops || [])[0] || null));

  const hRows = [];
  let hBad = 0;
  for (const k of ['b1b', 'b1a', 'b1hw']) {
    const r = base[k];
    const o = r.snap ? oracleBolt(r.snap, 'aim') : null;
    const bolt = (r.bolts || [])[0] || null;
    const exp = (o && o.last) ? { x: (o.last[0] + 0.5) * T, y: (o.last[1] + 0.5) * T } : null;
    const good = isCast(r) && (r.bolts || []).length === 1 && !!exp && !!bolt
      && Math.abs(bolt.tx - exp.x) < 0.5 && Math.abs(bolt.ty - exp.y) < 0.5;
    if (!good) hBad++;
    hRows.push(k + (good ? ' ✓' : ' ✗') + ' 受け取った終点 ' + (bolt ? '(' + Math.round(bolt.tx) + ',' + Math.round(bolt.ty) + ')' : 'なし')
      + ' / 列の最後のマス ' + (o && o.last ? JSON.stringify(o.last) + ' の中心 (' + exp.x + ',' + exp.y + ')' : 'なし')
      + ' / 呼び出し ' + (r.bolts || []).length + ' 回');
  }
  R.check('(1h)', '★★ spawnLightningBolt が受け取った終点 == 被弾計算に使ったマス列の最後のマスの中心 (横 7 / 斜め (4,1) / 壁の手前)',
    hBad === 0, hRows.join(' / '));

  /* ── §3 文言 ─────────────────────────────────────────────────────────────── */
  const fi = A.base.info.flavor, ft = tav.flavor;
  const flavorOk = (s) => typeof s === 'string' && s.indexOf('10') >= 0 && s.indexOf('3 タイル') < 0;
  R.check('(3a)', '★ index.html の MAGE_SKILLS["lightning-bolt"].flavor と tavern.html の鏡 MAGE_SKILLS_UI の flavor が'
    + ' どちらも「10」を含み「3 タイル」を含まない (2 ファイル = 2 経路)',
    flavorOk(fi) && flavorOk(ft),
    'index ' + JSON.stringify(fi) + ' / tavern ' + JSON.stringify(ft));

  /* ── §4 撤退 ─────────────────────────────────────────────────────────────── */
  ret.r3 = await run('ret', 'r3'); ret.r3d = await run('ret', 'r3d');
  const legRows = [];
  let legBad = 0;
  for (const k of ['r3', 'r3d']) {
    const r = ret[k];
    const o = r.snap ? oracleBolt(r.snap, 'legacy') : null;
    const bolt = (r.bolts || [])[0] || null;
    const exp = (o && o.dir && r.snap) ? { x: r.snap.aCX + o.dir[0] * 3 * T, y: r.snap.aCY + o.dir[1] * 3 * T } : null;
    const good = isCast(r) && !!o && o.ok && sameSet(r.hit, o.hit) && !!bolt && !!exp
      && Math.abs(bolt.tx - exp.x) < 0.5 && Math.abs(bolt.ty - exp.y) < 0.5;
    if (!good) legBad++;
    legRows.push(k + (good ? ' ✓ ' : ' ✗ ') + brief(r) + ' 旧仕様の再計算 ' + (o ? JSON.stringify(o.hit) : 'なし')
      + ' 終点 ' + (bolt ? '(' + Math.round(bolt.tx) + ',' + Math.round(bolt.ty) + ')' : 'なし')
      + ' 旧式 ' + (exp ? '(' + exp.x + ',' + exp.y + ')' : 'なし'));
  }
  R.check('(4a)', '★★ ?boltaim=0 で BOLT_AIM_ON=false・(1a)(1b) が demoted に戻り、旧挙動で撃てる (3,0)/(2,2) は cast'
    + ' (被弾集合 = 旧仕様の再計算 / 終点 = 旧式の術者の中心 + 3 マス)',
    A.ret.info.boltAim === false && A.base.info.boltAim === true && isDem(ret.b1a) && isDem(ret.b1b) && legBad === 0,
    'BOLT_AIM_ON 素=' + A.base.info.boltAim + ' 撤退=' + A.ret.info.boltAim
    + ' / (1a) ' + brief(ret.b1a) + ' / (1b) ' + brief(ret.b1b) + ' / ' + legRows.join(' / '));

  /* ── §5 導出 ─────────────────────────────────────────────────────────────── */
  dnd.g6 = await run('dnd', 'g6'); dnd.g4 = await run('dnd', 'g4');
  R.check('(5a)', '★★ ?dndrange=0 (宣言射程 5) で、筋の上 6 マスの敵は素でも demoted 1・4 マスなら cast 1'
    + ' (⭐ 長さが宣言射程から導出されていることの絶対量の証明。直書きの 10 ならこの assert は赤)',
    A.dnd.info.L === 5 && isDem(dnd.g6) && isCast(dnd.g4),
    'getRange(spellAoE).tiles=' + A.dnd.info.L + ' / 6 マス ' + brief(dnd.g6) + ' / 4 マス ' + brief(dnd.g4));

  R.check('(0g)', '[装置] 合成盤面の 5 ページ (index 4 腕 + tavern) でページエラー / console.error が 0 件 (favicon の 404 は除外)',
    errs.length === 0, errs.slice(0, 4).join('  |  ') || '(なし)');

  for (const p of pages) await p.close().catch(() => {});
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 実プレイ (§0c / §0d / §2 / §4b)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* ⭐ 2026-09-17 ユーザー決定 (依頼書 §12-3 (g)) — §8 の「母集団」の閾値が 90 秒 × 各 3 回で安定して立たなかったため:
 *   ① (0c) を「素の各走行 attempts ≥ 1 かつ 素の全走行の attempts 合計 ≥ 20」へ移す (各走行の下限 5 → 1 は承認済み)。
 *      実測: 森の素は 90 秒で 1〜4 回・廃坑も 4 回が出て、完走 2 回とも「各走行 ≥ 5」が赤だった。
 *   ② LB×8 単独は各マップ 3 → **5 回** (× 素と撤退)。(2a) の閾値 3 本 (≥ 70% / +30pt / cast ≥ 20) はそのまま。
 *      実測: 各 3 回では素の cast 合計が 21 / 18 で閾値をまたいだ。
 *   ③ (2c) は assert から外して **記録だけ** ([record] 行)。混成は各マップ 2 回のまま。
 *      ⚠ CC attempts が 0 の走行は「不発で枠を減らさず梯子に居座る実害が一部残っている」観測 (依頼書 §11 の別チケット候補の根拠)。
 *   ⭐ 素で撃てるようになると戦闘が早く終わり、魔法使いの手番 = 試行そのものが減ることがある
 *     (各 3 回の LB×8 の試行: run2 素 24 回 / 撤退 49 回。diag1 は 27 / 26)。 */
const PLAY_MS = 90000;
const POLL_MS = 1000;
const PLAY_SCENS = ['goblin-mine', 'bandits-forest'];
const LB_REPS = 5, MIX_REPS = 2;
const POP_MIN_TOTAL = 20;   // (0c) 素の LB×8 の全走行の attempts 合計の下限
const LV = 5, XP = 500 * LV * (LV - 1);   // 10000 = Lv5 (cone-of-cold の levelReq)
const PLAY_PARTY = [
  { classKey: 'warrior', isHero: true, name: '勇者', level: LV },
  { classKey: 'mage', name: 'ミラ', level: LV },
  { classKey: 'dwarf', name: 'グリム', level: LV },
  { classKey: 'cleric', name: 'リタ', level: LV },
];
const PLAY_KNOWN = {
  mage: ['magic-missile', 'sleep', 'fire-bolt', 'arcane-shield', 'lightning-bolt', 'cone-of-cold', 'burning-hands', 'fireball'],
  cleric: ['cure-light-wounds', 'shield-of-faith', 'turn-undead'],
  elf: ['aimed-shot', 'magic-arrow', 'hunters-mark', 'cure-minor'],
};
const rep = (id, n) => Array(n).fill(id);
const LOADOUTS = {
  lb8: rep('lightning-bolt', 8),
  /* 依頼書 §2-1 の混成 (Lv5 の 8 枠) */
  mix: [].concat(rep('magic-missile', 2), rep('sleep', 1), rep('fireball', 1), rep('lightning-bolt', 2), rep('cone-of-cold', 2)),
};
function playSeed(s) {
  try {
    sessionStorage.setItem('dragonfighters.currentScenario', s.scenario);
    sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(s.party));
    localStorage.setItem('dragonfighters.knownSpells', JSON.stringify(s.known));
    localStorage.setItem('dragonfighters.partySkills', JSON.stringify({ mage: s.skills }));
    localStorage.setItem('dragonfighters.xp', String(s.xp));
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
  } catch (e) {}
  try { window.__aoeStats = {}; } catch (e) {}   // 既存の観測シームを有効化 (定義したときだけ計上される)
}

async function playRun(browser, port, spec) {
  const page = await browser.newPage();
  const recs = [];
  const perr = [];
  page.on('pageerror', (e) => perr.push(String(e.message).slice(0, 200)));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.exposeFunction('__vbaReport', (json) => { try { recs.push(JSON.parse(json)); } catch (e) {} });
  await page.evaluateOnNewDocument(playSeed, { scenario: spec.scen, party: PLAY_PARTY, known: PLAY_KNOWN,
    skills: LOADOUTS[spec.loadout], xp: XP });
  await page.evaluateOnNewDocument('(' + pageSnapHelper.toString() + ')();(' + pageWrapHook.toString() + ')();');
  const url = 'http://127.0.0.1:' + port + '/index.html?autoplay=30&diag=1' + (spec.arm === 'ret' ? '&boltaim=0' : '');
  const out = { spec: spec, url: url, started: false, err: null, docs: {}, recs: recs, perr: perr, mage: null, elapsedMs: 0 };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")', { timeout: 60000 });
    out.started = true;
  } catch (e) { out.err = 'ゲームが起動しなかった: ' + String((e && e.message) || e); }
  if (out.started) {
    try {
      out.mage = await page.evaluate(() => {
        const m = (typeof allies !== 'undefined' && allies ? allies : []).filter((a) => a && a.classKey === 'mage')[0];
        return { found: !!m, level: m ? m.level : null, equipped: m ? (m.equippedSkills || []).slice() : null,
          slots: m ? JSON.parse(JSON.stringify(m.spellSlots || {})) : null,
          keys: { lb: MAGE_SKILLS['lightning-bolt'].name, cc: MAGE_SKILLS['cone-of-cold'].name },
          boltAim: (typeof BOLT_AIM_ON !== 'undefined') ? BOLT_AIM_ON : null,
          wrapped: !!window.__vbaWrapped, wrapErr: window.__vbaWrapErr || null };
      });
    } catch (e) { out.mage = { err: String((e && e.message) || e) }; }
    const t0 = Date.now();
    while (Date.now() - t0 < PLAY_MS) {
      await sleep(POLL_MS);
      try {
        const snap = await page.evaluate(() => ({ doc: window.__vbaDoc || null, path: location.pathname,
          stats: window.__aoeStats ? JSON.parse(JSON.stringify(window.__aoeStats)) : null }));
        if (snap && snap.doc) out.docs[snap.doc] = snap;
      } catch (e) { /* 遷移の最中 */ }
    }
    out.elapsedMs = Date.now() - t0;
    await sleep(500);   // 送信中の報告を受け取る
    /* ⚠ 最後にもう 1 回読む (1 秒間隔のポーリングだと、終了間際の試行が __aoeStats の読みから漏れて
     *   包みの記録より 1 件少なく見える = 項目4 の初回実走で実際に 7 対 6 になった)。 */
    try {
      const snap = await page.evaluate(() => ({ doc: window.__vbaDoc || null, path: location.pathname,
        stats: window.__aoeStats ? JSON.parse(JSON.stringify(window.__aoeStats)) : null }));
      if (snap && snap.doc) out.docs[snap.doc] = snap;
    } catch (e) {}
  }
  await page.close().catch(() => {});
  return out;
}
function sumStats(run, key) {
  const s = { attempts: 0, cast: 0, demoted: 0 };
  for (const d of Object.keys(run.docs)) {
    const st = run.docs[d].stats && run.docs[d].stats[key];
    if (!st) continue;
    s.attempts += st.attempts || 0; s.cast += st.cast || 0; s.demoted += st.demoted || 0;
  }
  return s;
}
function judgeRecs(run) {
  const out = { n: 0, snapErr: 0, oob: 0, aimAgree: 0, legAgree: 0, boltAimFalse: 0, boltAimTrue: 0, bad: [],
    why: {}, nonEngagedReachable: 0 };
  for (const r of run.recs) {
    if (r.noted !== 1) continue;           // 標的が既に倒れていて早期 return した呼び出しは試行ではない
    out.n++;
    if (!r.snap) { out.snapErr++; continue; }
    const act = r.cast === 1;
    const oa = oracleBolt(r.snap, 'aim'), ol = oracleBolt(r.snap, 'legacy');
    if (!act && run.spec.arm === 'base') {
      const w = demotedWhy(r.snap);
      out.why[w.why] = (out.why[w.why] || 0) + 1;
      if (w.nonEngagedReachable > 0) out.nonEngagedReachable++;
      if (w.casterOnWall) out.why.casterOnWall = (out.why.casterOnWall || 0) + 1;
      if (w.engInOnWall) out.why.foeOnWall = (out.why.foeOnWall || 0) + 1;
    }
    if (oa.oob || ol.oob) out.oob++;
    if (oa.ok === act) out.aimAgree++;
    if (ol.ok === act) out.legAgree++;
    if (r.snap.boltAim === false) out.boltAimFalse++; else if (r.snap.boltAim === true) out.boltAimTrue++;
    const mismatch = run.spec.arm === 'ret' ? (ol.ok !== act) : (oa.ok !== act);
    if (mismatch && out.bad.length < 3) {
      out.bad.push({ act: act, aim: oa.ok, leg: ol.ok, m: r.snap.m, L: r.snap.L,
        foes: r.snap.foes.map((f) => [f.i, f.tx - r.snap.m.tx, f.ty - r.snap.m.ty, f.inactive ? 'i' : '', f.escort ? 'e' : ''].join(':')),
        enc: r.snap.enc });
    }
  }
  return out;
}

async function runPlay(browser, port, R) {
  console.log('\n[drv] ══ 実プレイ (port ' + port + ' / 1 走行 ' + (PLAY_MS / 1000) + ' 秒 / 直列) ══');
  const plan = [];
  for (const scen of PLAY_SCENS) for (let i = 1; i <= LB_REPS; i++) {
    plan.push({ scen: scen, loadout: 'lb8', arm: 'base', rep: i });
    plan.push({ scen: scen, loadout: 'lb8', arm: 'ret', rep: i });
  }
  for (const scen of PLAY_SCENS) for (let i = 1; i <= MIX_REPS; i++) plan.push({ scen: scen, loadout: 'mix', arm: 'base', rep: i });
  const runs = [];
  for (const spec of plan) {
    const t = Date.now();
    const r = await playRun(browser, port, spec);
    const keys = (r.mage && r.mage.keys) || { lb: 'ライトニングボルト', cc: 'コーンオブコールド' };
    r.lb = sumStats(r, keys.lb); r.cc = sumStats(r, keys.cc); r.j = judgeRecs(r);
    runs.push(r);
    const pct = r.lb.attempts ? Math.round(100 * r.lb.cast / r.lb.attempts) + '%' : '-';
    console.log('  [play] ' + spec.scen + ' ' + spec.loadout + ' ' + (spec.arm === 'base' ? '素' : '撤退') + ' #' + spec.rep
      + ': LB attempts ' + r.lb.attempts + ' cast ' + r.lb.cast + ' (' + pct + ')'
      + ' / CC attempts ' + r.cc.attempts + ' cast ' + r.cc.cast
      + ' / 包み記録 ' + r.j.n + ' (snapErr ' + r.j.snapErr + ' oob ' + r.j.oob + ')'
      + ' / 新仕様の再計算と一致 ' + r.j.aimAgree + '/' + r.j.n + ' / 旧仕様の再計算と一致 ' + r.j.legAgree + '/' + r.j.n
      + ' / equipped ' + JSON.stringify(r.mage && r.mage.equipped) + ' Lv' + (r.mage && r.mage.level)
      + ' / BOLT_AIM_ON ' + (r.mage && r.mage.boltAim) + ' wrapped ' + (r.mage && r.mage.wrapped)
      + (spec.arm === 'base' ? ' / 不発の内訳 ' + JSON.stringify(r.j.why) + ' (うち交戦外の敵なら届いた ' + r.j.nonEngagedReachable + ')' : '')
      + ' / docs ' + Object.keys(r.docs).length + ' / pageerror ' + r.perr.length
      + ' / ' + ((Date.now() - t) / 1000).toFixed(1) + 's' + (r.err ? ' / ⛔ ' + r.err : ''));
    if (r.j.bad.length) console.log('         食い違い (先頭 3 件) ' + JSON.stringify(r.j.bad));
  }
  const sel = (f) => runs.filter(f);
  const lbBase = sel((r) => r.spec.loadout === 'lb8' && r.spec.arm === 'base');
  const lbRet = sel((r) => r.spec.loadout === 'lb8' && r.spec.arm === 'ret');
  const mix = sel((r) => r.spec.loadout === 'mix');
  const allBase = sel((r) => r.spec.arm === 'base');
  const tag = (r) => r.spec.scen.replace('goblin-mine', '廃坑').replace('bandits-forest', '森') + '#' + r.spec.rep;
  const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);

  const bAttTotal = sum(lbBase, (r) => r.lb.attempts);
  R.check('(0c)', '[装置] 実プレイ LB×8 の素の各走行 (廃坑と森・各 ' + LB_REPS + ' 回) で、魔法使いの equippedSkills に lightning-bolt が入り'
    + ' 90 秒で attempts ≥ 1、かつ素の全走行の attempts 合計 ≥ ' + POP_MIN_TOTAL
    + ' (⭐ 0 なら §2 の率は全部空振り。⚠ 各走行 ≥ 5 から 2026-09-17 のユーザー決定で合算へ移した = 依頼書 §12-3 (g))',
    lbBase.length === PLAY_SCENS.length * LB_REPS
    && lbBase.every((r) => r.started && r.mage && Array.isArray(r.mage.equipped) && r.mage.equipped.indexOf('lightning-bolt') >= 0
      && r.lb.attempts >= 1)
    && bAttTotal >= POP_MIN_TOTAL,
    '合計 attempts ' + bAttTotal + ' / 走行別 ' + lbBase.map((r) => tag(r) + ' attempts=' + r.lb.attempts
      + ' eq=' + JSON.stringify(r.mage && r.mage.equipped) + (r.err ? ' ⛔' + r.err : '')).join(' / '));

  const retN = sum(lbRet, (r) => r.j.n), retLeg = sum(lbRet, (r) => r.j.legAgree);
  const retSnapBad = sum(lbRet, (r) => r.j.snapErr + r.j.oob);
  R.check('(0d)', '[装置] 撤退 ?boltaim=0 の腕で、ドライバの再計算 (L=3・8 方向・壁なし) が実物の成否と全件一致 (試行 ≥ 10)'
    + ' (⭐ 2 経路目の再計算器そのものが正しいことの証明。一致しなければ §2 の率を信じない)',
    retN >= 10 && retSnapBad === 0 && retLeg === retN,
    '一致 ' + retLeg + '/' + retN + ' / 写しの失敗 ' + retSnapBad + ' / 走行別 '
    + lbRet.map((r) => tag(r) + ' ' + r.j.legAgree + '/' + r.j.n).join(' '));

  const whyAll = {};
  for (const r of lbBase) for (const k of Object.keys(r.j.why)) whyAll[k] = (whyAll[k] || 0) + r.j.why[k];
  /* (2a) ⭐ 2026-09-17 のユーザー決定 (案 E) — 率は **マップごとの cast/attempts の単純平均** で測る
   *   (合算 pooled だと試行の多い廃坑へ重みが寄り、回数を増やすほど廃坑の率へ引き寄せられる = 依頼書 §12-3 (g))。
   *   差も同じ重み付け = マップ平均(素) − マップ平均(撤退)。cast 合計 ≥ 20 (絶対量) は据え置き。
   *   ⚠ 平均の母数がそろっていない (どれかのマップで素か撤退の attempts が 0 / 走っていない) ときは平均せず FAIL。
   *   ⭐ pooled の率とマップ別の率は判定に使わず、[record] 行に必ず出す (廃坑の低さが森の 100% に隠れないように)。 */
  const bA = sum(lbBase, (r) => r.lb.attempts), bC = sum(lbBase, (r) => r.lb.cast);
  const rA = sum(lbRet, (r) => r.lb.attempts), rC = sum(lbRet, (r) => r.lb.cast);
  const bRate = bA ? bC / bA : 0, rRate = rA ? rC / rA : 0;
  const perMap = PLAY_SCENS.map((scen) => {
    const b = lbBase.filter((r) => r.spec.scen === scen), rr = lbRet.filter((r) => r.spec.scen === scen);
    const ba = sum(b, (r) => r.lb.attempts), bc = sum(b, (r) => r.lb.cast);
    const ra = sum(rr, (r) => r.lb.attempts), rc = sum(rr, (r) => r.lb.cast);
    return { scen: scen, name: tag({ spec: { scen: scen, rep: '' } }).replace(/#$/, ''), runsB: b.length, runsR: rr.length,
      ba: ba, bc: bc, ra: ra, rc: rc, bRate: ba ? bc / ba : null, rRate: ra ? rc / ra : null };
  });
  const mapsReady = perMap.length === PLAY_SCENS.length && perMap.length >= 2
    && perMap.every((m) => m.runsB === LB_REPS && m.runsR === LB_REPS && m.bRate !== null && m.rRate !== null);
  const avg = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const bMapAvg = mapsReady ? avg(perMap.map((m) => m.bRate)) : null;
  const rMapAvg = mapsReady ? avg(perMap.map((m) => m.rRate)) : null;
  const pct = (x) => (x === null ? '-' : (100 * x).toFixed(1) + '%');
  const mapRows = perMap.map((m) => m.name + ' 素 ' + m.bc + '/' + m.ba + ' = ' + pct(m.bRate)
    + ' 撤退 ' + m.rc + '/' + m.ra + ' = ' + pct(m.rRate) + ' (走行 ' + m.runsB + '+' + m.runsR + ')').join(' / ');
  R.check('(2a)', '★★★ LB×8 単独・廃坑と森・各 ' + LB_REPS + ' 回で、マップごとの素の cast/attempts の平均 ≥ 70% かつ'
    + ' マップ平均(素) − マップ平均(撤退) ≥ 30pt かつ 素の cast 合計 ≥ 20'
    + ' (⭐ 差だけでは両腕へ等しく効く欠陥を捕まえられないので絶対量を添える。⚠ 率の重み付けは 2026-09-17 のユーザー決定 E = 依頼書 §12-3 (g))',
    mapsReady && bMapAvg >= 0.70 && (bMapAvg - rMapAvg) >= 0.30 && bC >= 20,
    (mapsReady ? '' : '⛔ 平均の母数がそろっていない (全マップで素と撤退が各 ' + LB_REPS + ' 走行・attempts ≥ 1 が要る) / ')
    + 'マップ平均 素 ' + pct(bMapAvg) + ' / 撤退 ' + pct(rMapAvg)
    + ' / 差 ' + (mapsReady ? (100 * (bMapAvg - rMapAvg)).toFixed(1) + 'pt' : '-') + ' / 素の cast 合計 ' + bC
    + ' / マップ別 ' + mapRows + ' / 素の不発の内訳 ' + JSON.stringify(whyAll)
    + ' (交戦外の敵なら届いた ' + sum(lbBase, (r) => r.j.nonEngagedReachable) + ') / 走行別 素 '
    + lbBase.map((r) => tag(r) + ' ' + r.lb.cast + '/' + r.lb.attempts).join(' ')
    + ' ‖ 撤退 ' + lbRet.map((r) => tag(r) + ' ' + r.lb.cast + '/' + r.lb.attempts).join(' '));
  console.log('  [record] (2a) 判定に使わない参考値 — 合算 pooled: 素 ' + bC + '/' + bA + ' = ' + pct(bA ? bRate : null)
    + ' / 撤退 ' + rC + '/' + rA + ' = ' + pct(rA ? rRate : null)
    + ' / 差 ' + (bA && rA ? (100 * (bRate - rRate)).toFixed(1) + 'pt' : '-') + '  ‖  マップ別 ' + mapRows);

  const aN = sum(allBase, (r) => r.j.n), aAg = sum(allBase, (r) => r.j.aimAgree), aLeg = sum(allBase, (r) => r.j.legAgree);
  const aSnapBad = sum(allBase, (r) => r.j.snapErr + r.j.oob);
  R.check('(2b)', '★★ 素の腕の全試行 (LB×8 と混成) で、ドライバの再計算 (L=宣言射程・交戦中の敵へ向けて・視線・壁で止める)'
    + ' と実物の成否の一致率 ≥ 95% (試行 ≥ 20)',
    aN >= 20 && aSnapBad === 0 && aAg / aN >= 0.95,
    '一致 ' + aAg + '/' + aN + ' = ' + (aN ? (100 * aAg / aN).toFixed(1) : '-') + '% / 写しの失敗 ' + aSnapBad
    + ' / 参考: 旧仕様の再計算との一致 ' + aLeg + '/' + aN
    + ' / 走行別 ' + allBase.map((r) => tag(r) + r.spec.loadout + ' ' + r.j.aimAgree + '/' + r.j.n).join(' '));

  /* (2c) ⭐ 2026-09-17 のユーザー決定で **記録だけ** (PASS/FAIL を出さない = 総括の分母に入らない)。
   *   CC attempts が 0 の走行 = 不発で枠を減らさず梯子に居座る実害が一部残っている観測 (依頼書 §11 の別チケット候補)。 */
  const ccA = sum(mix, (r) => r.cc.attempts);
  const ccZero = mix.filter((r) => r.cc.attempts === 0).length;
  const mixEqOk = mix.length === PLAY_SCENS.length * MIX_REPS && mix.every((r) => r.started && r.mage && Array.isArray(r.mage.equipped)
    && r.mage.equipped.indexOf('cone-of-cold') >= 0 && r.mage.equipped.indexOf('lightning-bolt') >= 0);
  console.log('  [record] (2c) 混成装備 (MM×2/スリープ/ファイアボール/LB×2/CC×2)・廃坑と森・各 ' + MIX_REPS + ' 回'
    + ' — CC attempts 合計 = ' + ccA + ' / CC attempts が 0 の走行 = ' + ccZero + '/' + mix.length
    + (ccZero ? ' (⚠ 不発の居座りの実害が一部残っている観測)' : '')
    + ' / 装備の仕込み ' + (mixEqOk ? 'OK' : '⛔ NG')
    + ' / 走行別 ' + mix.map((r) => tag(r) + ' CC ' + r.cc.cast + '/' + r.cc.attempts
      + ' LB ' + r.lb.cast + '/' + r.lb.attempts + ' eq=' + JSON.stringify(r.mage && r.mage.equipped)).join(' / '));

  const retAimDis = sum(lbRet, (r) => r.j.n - r.j.aimAgree);
  const retFlag = sum(lbRet, (r) => r.j.boltAimFalse);
  R.check('(4b)', '★★ ?boltaim=0 の実プレイで、全試行の BOLT_AIM_ON=false・旧仕様の再計算と全件一致 ((0d))'
    + '・かつ新仕様の再計算とは 1 件以上食い違う (= 撤退の腕が黙って新挙動のまま、を捕まえる絶対量)',
    retN >= 10 && retFlag === retN && retLeg === retN && retAimDis >= 1,
    'BOLT_AIM_ON=false ' + retFlag + '/' + retN + ' / 旧仕様と一致 ' + retLeg + '/' + retN + ' / 新仕様と食い違い ' + retAimDis);

  if (DUMP) {
    try {
      fs.writeFileSync(DUMP, JSON.stringify(runs.map((r) => ({ spec: r.spec, started: r.started, err: r.err, mage: r.mage,
        lb: r.lb, cc: r.cc, j: r.j, docs: r.docs, perr: r.perr, recs: r.recs })), null, 0));
      console.log('  [play] 生データを書き出しました: ' + DUMP);
    } catch (e) { console.log('  [play] 生データの書き出しに失敗: ' + ((e && e.message) || e)); }
  }
  const perrN = sum(runs, (r) => r.perr.length);
  console.log('  [play] 参考: 実プレイ ' + runs.length + ' 走行の pageerror 合計 ' + perrN
    + (perrN ? ' ' + JSON.stringify(runs.filter((r) => r.perr.length).map((r) => r.perr[0]).slice(0, 3)) : ''));
  return runs;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════════ */
function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const pendingN = R.filter((r) => r.pending).length;
  const failed = R.filter((r) => !r.ok && !r.pending).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + '   PENDING ' + pendingN + (label ? '   ' + label : ''));
  if (failed) {
    console.log('  --- FAILED ---');
    R.filter((r) => !r.ok && !r.pending).forEach((r) => console.log('    ' + r.id + ' ' + r.name + '  -- ' + r.detail));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed: passed, failed: failed, pending: pendingN };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_boltaim_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  try {
    if (NEGATIVE) {
      /* 素の合成盤面 (基準)。⭐ 素が赤いと変異の赤は何も意味しない。 */
      const srv0 = await startServer(PORT, null);
      const R0 = mkResults();
      const o0 = await runSynthetic(browser, PORT, '(素・基準)', R0);
      await stopServer(srv0);
      const s0 = summarize(R0, '[素・基準]');
      if (!o0.booted || s0.failed) {
        console.error('[drv] ⛔ 素の合成盤面で FAIL がある / 起動しない — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const srv = await startServer(port, key);
          console.log('\n[drv] ════════ 変異 ' + key + ' (port ' + port + ' / ' + MUTATIONS[key].file + ':'
            + auditMutation(key).line + ') ════════');
          const R = mkResults();
          let o = null;
          try { o = await runSynthetic(browser, port, '[変異 ' + key + ']', R); }
          catch (e) { o = { booted: false, bootErr: 'ドライバ例外: ' + String((e && e.message) || e) }; }
          await stopServer(srv);
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok && !r.pending).map((r) => r.id);
          const r0a = R.filter((r) => r.id === '(0a)')[0], r0b = R.filter((r) => r.id === '(0b)')[0];
          /* ⭐ 起動確認 = 4 腕 + tavern が起動し、(0b) のシームが生きている (構文破壊で全部赤の偽の検出を見分ける)。
           *   ⚠ (0a) は switchdead が判定の行そのものを消すので巻き添えで赤くなる = 起動確認には使わない (ログには出す)。 */
          const bootOk = !!o && o.booted && !!r0b && r0b.ok;
          const want = NEG_EXPECT[key] || [];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const ok = bootOk && miss.length === 0;
          console.log('[drv] 起動確認 ' + key + ': ' + (bootOk ? 'OK' : '⛔ NG') + ' — ページ起動 ' + (o && o.booted ? 'OK' : 'NG ' + (o && o.bootErr))
            + ' / (0a) ' + (r0a ? (r0a.ok ? 'OK' : 'NG') + ' ' + r0a.detail : 'なし')
            + ' / (0b) ' + (r0b ? (r0b.ok ? 'OK' : 'NG') + ' ' + r0b.detail : 'なし'));
          console.log('[drv] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + red.join(',')
            + ' → ' + (ok ? '✓ OK' : '✗ ' + (bootOk ? '空振り ' + miss.join(',') : '起動確認 NG')));
          report.push({ key: key, want: want, red: red, ok: ok, bootOk: bootOk });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(11) + ' 担当 ' + r.want.join(',')
          + ' / 赤 ' + r.red.join(',') + ' / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[drv] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
        else console.error('[drv] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const srv = await startServer(port, MUTATE);
      const R = mkResults();
      await runSynthetic(browser, port, '[変異 ' + MUTATE + ' (手回し)]', R);
      await stopServer(srv);
      summarize(R, '[変異 ' + MUTATE + ']');
      exitCode = 0;
    } else {
      const R = mkResults();
      R.check('(0e)', '[装置] 変異 ' + MUT_ORDER.length + ' 本の注入点が、原本の「属する範囲」の中でちょうど 1 行'
        + ' (⭐ 腐ると --negative が走る前に exit 3。素の側でも赤で見えるようにする)',
        AUDIT_BAD.length === 0,
        AUDIT.map((a) => a.key + '=' + a.file.replace('.html', '') + ':' + a.line + '(範囲内 ' + a.inScope + '/全体 ' + a.inFile + ')').join(' '));
      const srv = await startServer(PORT, null);
      const o = await runSynthetic(browser, PORT, '(素)', R);
      if (!o.booted) R.check('(0x)', '[装置] 合成盤面のページが起動する', false, o.bootErr);
      if (NO_PLAY) {
        for (const id of ['(0c)', '(0d)', '(2a)', '(2b)', '(4b)']) R.pending(id, '実プレイ', '--no-play 指定');
      } else {
        await runPlay(browser, PORT, R);
      }
      await stopServer(srv);
      const s = summarize(R, NO_PLAY ? '(--no-play: 実プレイの節は PENDING)' : '');
      exitCode = s.failed ? 1 : ((s.pending && !NO_PLAY) ? 1 : 0);
    }
  } catch (e) {
    console.error('[drv] 例外: ' + ((e && e.stack) || e));
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    for (const s of SERVERS.slice()) await stopServer(s);
  }
  console.log('[drv] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
})();
