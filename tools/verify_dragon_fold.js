#!/usr/bin/env node
/*
 * verify_dragon_fold.js — 実装依頼書 #67「F4 竜の巣(dragon-lair)を卓上マップ 2 枚へ畳む
 *   (旧タイプ小部屋 n0/n1/n2/n3/n5/n6 の廃止 → n4 骨の谷 / n7 ファラクサスの巣 の 2 ノード)」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 * ■ 測るのは 3 本柱 (依頼書 §8)
 *   ① 畳んだ竜の巣が**最後まで遊べる**こと
 *   ② 隠し要素 (偽宝箱のミミック) が畳んでも**生きていて、しかも塊として並ぶ**こと
 *   ③ 他 5 シナリオを **1 ビットも触っていない**こと (hoard を無条件に生やしていない)
 *
 * ■ 測り方の方針 (#62 / #63 / #66 の受入ドライバから継承)
 *   ⭐ **期待値はその場で導く**。移設した敵の顔ぶれは `?dragonfold=0` の n1+n2+n3+n4 の
 *     合計から、ノード数は `buildScenarioRun("dragon-lair")` と `buildDragonLairRun()` の
 *     戻り値から数える。⛔ 体数・座標・ノード数を数字で焼き込まない
 *     (実装とドライバが同じ間違いを共有すると両方緑になる)。
 *   ⭐ 幾何は**本番の関数と定数だけ**を通す (nodeGateTile / isTileWall / aStar /
 *     isNodeSettled / NODE_ENTRY_INSET / TILE_SIZE / DETECTION_RANGE /
 *     MIMIC_APPROACH_RADIUS / RANGE.melee.engagePx)。マスクは**配信した index.html を
 *     自前でパース**して組む (実装の paintingBlockedTilesFor は 1 行も借りない)。
 *   ⭐ 「西 45%」の 0.45 も**配信バイトから読む** (spawnDragonHoard の westLimit の行)。
 *     読めなければ (3f) は赤 = 装置の故障として出る。⛔ 0.45 を写経しない。
 *
 * ■ ⛔ 依頼書 §8 から変えた点 (理由つき。⭐ どれも「弱めた」ものは 1 つも無い)
 *   (8a)  … 依頼書は「他 5 シナリオの mapDef が 1 バイトも変わっていない」= **両腕の差**で
 *           書かれており、かつ「hoard を無条件に生やしていないことの検査でもある」と
 *           括弧書きしていた。⚠⚠⚠ **両立しない。** 無条件に生やす欠陥は
 *           **両方の腕へ等しく**効くので差が出ず、(8a) は緑のまま素通しする
 *           (#44「恒等 assert は片方のアームだけを壊す変更でしか赤くならない」)。
 *           ⇒ (8a) は両腕の恒等のまま残し、**絶対量の (8a2) を新設**した:
 *           「`hoard` キーを持つ mapDef は 6 シナリオ全ノードを走査して**畳んだ竜の n7 ただ 1 つ**」。
 *           変異 hoardnull はこちらで捕まる (実測)。
 *   (2c)  … 依頼書は「敵の全タイルがマスクで開いている(絵に穴を開けていない)」。
 *           ⚠ **isTileWall だけでは永久緑**になる (applyPaintingBlocking の門番 skipSpawn が
 *           敵スポーンのタイルを必ず素通しさせる = #58 の教訓)。⇒ 2 本立てにした:
 *           「スロットがマスクの '.' に載る」+「マスクの '#' が 1 つも歩けるようになっていない」。
 *   (2e)  … 依頼書 §8 には無いが、§9-2 が「群の最短距離を DETECTION_RANGE 超に保つ」を
 *           **設計の制約として決めている**ので、決定を記録する assert として足した
 *           (⛔ 決定を先取りしてはいない = 値は既に決まっている)。
 *   (1d)  … 起動時 lint が error 0 / warning 0。LINT_PAINTING_ASPECTS へ足した 31x20 / 30x19 が
 *           効いていることを、このドライバ単体でも読めるようにする。
 *   (0e)  … 変異アンカーの起動時検算 (temple 由来)。⚠⚠⚠ **verify_fort_fold はこれを持たない**
 *           ため、gateshift のアンカーが #66 で 2 箇所へ増えた日から**素は 30/30 緑のまま
 *           --negative だけが EXIT=3** という状態が生き延びた (#67 項目3 (j) / 項目4 (f) の実測)。
 *   (4c)  … 他 4 シナリオの兼務宣言が 1 ビットも動いていないこと (fort / temple と同じ形)。
 *   (6a)  … ⚠ **この節には変異が無い (宣言された穴)**。竜は inactive な敵を 1 体も置かないので、
 *           竜側の欠陥では原理的に赤くならない。母集団ガード (敵が実在する) を同居させて
 *           「空集合を測って緑」だけは塞いである。
 *
 * ■ 節
 *   §0 装置  §1 構造  §2 敵  §3 財宝とミミック  §4 罠と宝箱
 *   §5 幾何  §6 詰み防止  §7 撤退  §8 恒等 (非退行)
 *
 * ── 負のコントロール (--negative。**配信をメモリ上で差し替える**。本番ファイルは無傷) ────
 *   nofold / nokinds / dropfoes / hoardwide / hoardnull / gateshift / rectshift /
 *   startdefault / density1
 *   ⚠ 変異の置換文字列は**必ず 1 行**(index.html は CRLF なので改行を含むと原理的に空振り)。
 *   ⚠ 置換前後で**バイト長をずらす**(同じ長さだと差し替わったか確認できない)。
 *   ⛔⛔ 次の 2 行は**アンカーに使えない** — #67 項目4 が出現数を実測した (2026-09-16):
 *        '          { id: "n4", kind: "start", mapDef: n4.mapDef, exits: n4.exits },'   … 3 箇所
 *        '              start: { tx: 12, ty: 13 },'                                     … 4 箇所 (沼が接頭辞)
 *      ⇒ 竜にしか無い行を握る。本ドライバの 9 本は着手前に py で出現数 1 を実測済み。
 *   ⛔ 次の行も**アンカーに使わない** — 既存ドライバが逐語で握っている:
 *        ? { "bandits-forest": { n7: ["search", "loot"] } }        (grid_s2 の nosearchkind)
 *        const SWAMP_FOLDED = !SWAMP_FOLD_OFF ...                  (swamp_fold の nofold/mapoff)
 *   ⚠ density1 のアンカー (buildP6Run の nd()) は verify_fort_fold / verify_temple_fold と
 *     **共有**している。変異ごとに原本を読み直すので互いを食わない。
 *
 * 使い方:
 *   node tools/verify_dragon_fold.js                # 素の 1 本 (exit 0=全 PASS / 1=FAIL)
 *   node tools/verify_dragon_fold.js --negative     # 変異 9 本 (port 10282〜10290) が赤くなるか
 *   node tools/verify_dragon_fold.js --negative --only hoardnull
 *   node tools/verify_dragon_fold.js --mutate nofold --port 10282
 * ⚠ base ポートは **10281**。10261 は #66 / 10241 は #65 / 10201 は #63 / 10181 は #62 が占有。
 *   ⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する (#56 の実測)。10281 は goto 実測で健全。
 * ⚠⚠ このドライバを `timeout` コマンドで包まないこと (#64)。打ち切ると node が孤児として
 *   ポートを掴んだまま残り、次の起動が EADDRINUSE で即死する。
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り / 2=環境不足 / 3=変異アンカーの腐敗・使い方の誤り
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須 (区切りのままだと全 404)
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '10281'), 10);
const THEME = 'dragon-lair';
/* 恒等 (8a) の母集団。⚠ dragon-lair は含めない (変えたのはそこだから)。 */
const OTHER_SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple'];
/* (8a2) の走査は 6 シナリオ全部。⭐ 竜も含めて数えるので「1 件だけ」が言える。 */
const ALL_SCENS = OTHER_SCENS.concat([THEME]);
/* 畳んだ後に残るノード / 消えるノード。⚠ これは**契約**なのでドライバ側に書き下す
 *   (実装から読むと実装の誤りを一緒に信じてしまう)。 */
const KEEP_IDS = ['n4', 'n7'];
const DROP_IDS = ['n0', 'n1', 'n2', 'n3', 'n5', 'n6'];
/* 旧構成で n4 へ合流する側のノード。⭐ 期待値はここから**合計して導く** (写経しない)。 */
const MERGED_FROM = ['n1', 'n2', 'n3', 'n4'];
/* 共通骨格 (buildP6Run) の kind の列。⭐ n6 は竜だけ "loot" (spec で上書きしている)。
 * ⛔ ここを "event" と書かない (依頼書 §8 (1c) の名指し)。 */
const SKELETON_KINDS = { n0: 'start', n1: 'combat', n2: 'search', n3: 'loot',
                         n4: 'combat', n5: 'rest', n6: 'loot', n7: 'boss' };
/* ドライバ側が決めている閾値 (⭐ どちらも依頼書 §8 が決定済みの値)。 */
const HOARD_SPREAD_TILES = 2;   // (3c) 財宝 4 個の相互最大距離
const MIMIC_BOSS_TILES = 4;     // (3e) ミミック ←→ ボス個体

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (負のコントロール)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = {
  /* M1 畳みを丸ごと無効化する = 8 ノードのまま。§0/§1/§2/§3/§4/§5 が広く赤くなるべき。 */
  nofold: [['    const DRAGON_FOLDED = !DRAGON_FOLD_OFF;',
            '    const DRAGON_FOLDED = false;   /* ★変異nofold */']],
  /* M2 ⭐ 兼務宣言から竜の行を消す = 罠も玄室の宝箱も無言でゼロになる罠の再現 (森 #16)。 */
  nokinds: [['      if (DRAGON_FOLDED) t["dragon-lair"] = { n4: ["search", "loot"] };',
             '      /* ★変異nokinds — 竜の兼務宣言を落とす */']],
  /* M3 移設した 7 体を丸ごと落とす = 体数が旧構成の合計と合わなくなる。
   *   ⚠ 三項の条件だけを false にする (行ごと消すと続く `? [...] : []` が構文エラー)。 */
  dropfoes: [['      const FOLD_MOVED_DRAGON = DRAGON_FOLDED',
              '      const FOLD_MOVED_DRAGON = false   /* ★変異dropfoes */']],
  /* M4 ⭐⭐⭐ **本命その 1** — mapDef の hoard 宣言を読ませず、西 45% 規則へ戻す
   *   (依頼書 §2-2 が名指しした最大の地雷そのもの)。declaredHoard を必ず null にするので
   *   財宝が 19 行 x 13 列へ散り、入場地点の隣にミミックが湧きうる。§3 が赤くなるべき。 */
  hoardwide: [['          if (MAPDEF && Array.isArray(MAPDEF.hoard)) return MAPDEF.hoard;',
               '          return null;   /* ★変異hoardwide — 宣言を読ませず西 45% 規則へ落とす */']],
  /* M5 ⭐⭐⭐ **本命その 2** — p6Node が hoard を**無条件に**載せる。
   *   ⚠⚠ 両方の腕へ等しく効くので **(8a) は緑のまま**。捕まえるのは絶対量の (8a2)。 */
  hoardnull: [['      if (opt.hoard != null) md.hoard = opt.hoard;',
               '      md.hoard = (opt.hoard != null) ? opt.hoard : null;   /* ★変異hoardnull */']],
  /* M6 出口ゲートを 1 タイルずらす = 「矢印は辺の中点・遷移は別のマス」という開かない扉。
   *   ⚠ 依頼書 §8 は `{ id: "n4", kind: "start", …` を握れと書いていたが、その行は
   *     #66 で 3 箇所へ増えている (項目4 の実測)。⇒ 竜にしか無い `if (!DRAGON_FOLDED) return run;` へ。 */
  gateshift: [['      if (!DRAGON_FOLDED) return run;     // ?dragonfold=0 = 8 ノードの旧構成',
               '      if (!DRAGON_FOLDED) return run; else { const _gs = run.nodes.find(n => n.id === "n4"); _gs.exits = _gs.exits.map(e => ({ to: e.to, dir: e.dir, at: [e.at[0], e.at[1] + 1], hint: e.hint })); }   /* ★変異gateshift */']],
  /* M7 n4 の rect を 1 列ずらす = ROOM_PAINTINGS_DEF の tileBounds と食い違う
   *   (paintingAspectFits は縦横比の完全一致を要求する)。 */
  rectshift: [['              rect: [4, 9, 23, 39], paint: "n4big", density: 0,',
               '              rect: [4, 10, 23, 40], paint: "n4big", density: 0,   /* ★変異rectshift */']],
  /* M8 n7 の start を既定 (36,13) へ戻す = buildNode の「起点の床保証」が
   *   絵ローカル (26,9) = 溶岩の堀のど真ん中に blocked マスクの穴を無言で開ける。 */
  startdefault: [['              start: { tx: 12, ty: 13 },   /* 西辺の岩床の 2 タイル内側 */',
                  '              start: { tx: 36, ty: 13 },   /* ★変異startdefault */']],
  /* M9 density の 0 を `|| 1` で握り潰す = 既に描き込まれた絵の上へ scenery が湧く。
   *   ⚠ ここは buildP6Run の共通骨格なので森・沼・砦・神殿にも効くが、負のコントロールとしては正しい。 */
  density1: [['                                  density: d.density, start: d.start }),',
              '                                  density: d.density || 1, start: d.start }),   /* ★変異density1 */']],
};
/* 変異 → 赤くなるべき assert id。
 * ⚠⚠⚠ 机上で書かない。1 本ずつ実走して**実際に赤くなった id** を書く (#57 の教訓)。
 * ── 2026-09-16 の実走 (素 35/35 / 変異 9/9 検出) で実際に赤くなった集合。爆風の広さも残す ──
 *   nofold       … 0a 0b 1a 2a 2c 2d 2e 3a 3b 3c 3d 4a 4b 5a 5b 5c 5d 5e 6a 7a 8a2  (21 本)
 *                  ⭐ 緑のまま残ったのは 0c 0d 0e 1b 1c 1d 2b 3e 3f 4c 6b 6c 7b 8a の 14 本
 *                  (旧 8 ノード構成でも「歩けること」自体は成り立つ = 6b/6c が緑なのは正しい)
 *   nokinds      … 4a 4b                          (2 本)
 *   dropfoes     … 2a                             (1 本 ⭐ 最も鋭い)
 *   hoardwide    … 3b 3c                          (2 本)
 *                  ⚠⚠⚠ **依頼書 §8 の表は (3d) も赤くなると予告していたが外れた。**
 *                  西 45% 規則へ落ちたとき、種つき乱数がミミックを (11,8) へ置き、
 *                  入場 (12,13) から 489.5px = 半径の **2.45 倍**で (3d) の敷居を上回った。
 *                  ⇒ (3d) は「入場の隣に湧く」欠陥を捕まえる assert として正しいが、
 *                  この変異では発火しない。担当は (3b)(3c)。
 *   hoardnull    … 8a2                            (1 本 ⭐ 最も鋭い)
 *                  ⚠⚠⚠ **(8a) は緑のまま** (両腕へ等しく効くので差が出ない)。
 *                  = 依頼書 §8 の「(8a) は hoard を無条件に生やしていない検査でもある」が
 *                  原理的に成り立たないことの実測。(8a2) を足した理由そのもの。
 *   gateshift    … 5c                             (1 本 ⭐ 最も鋭い)
 *   rectshift    … 5a 5b 5c                       (3 本)
 *   startdefault … 2c 5b 5d                       (3 本。⭐ 2c は「起点の床保証」が
 *                                                   絵へ開けた穴を捕まえている)
 *   density1     … 5e                             (1 本 ⭐ 最も鋭い)
 * ⭐ dropfoes / hoardnull / gateshift / density1 が 1 本ずつ = **節が分離している**証拠
 *   (1 つの変異が全部を赤くする「爆風だけの装置」ではない)。
 * ⚠ 下の表は「必ず命中してほしい担当」だけ。巻き添えは許容する (#61 の教訓)。 */
const MUT_EXPECT = {
  nofold:       ['0a'],
  nokinds:      ['4a'],
  dropfoes:     ['2a'],
  hoardwide:    ['3b'],
  hoardnull:    ['8a2'],
  gateshift:    ['5c'],
  rectshift:    ['5a'],
  startdefault: ['5b'],
  density1:     ['5e'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
const MUTATE = arg('mutate', null);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}

/* ── (0e) 起動時のアンカー検算 ─────────────────────────────────────────────────
 * ⭐ #65 が踏んだ「偽の EXIT=3」の再発防止 = **手つかずの原本**に対して数える
 *   (変異後のバッファを数えると、同じ行を共有する 2 本目が偽の腐敗に見える #56 の罠)。
 * ⛔ 1 つでも 1 箇所でなければ **exit 3**。素の assert を 1 本も走らせないまま
 *   「赤くならなかった」と報告するのが最悪の結果。
 * ⚠⚠ verify_fort_fold にはこの段が無く、#66 が神殿を足してアンカーが 2 箇所になった日から
 *   「素は緑・--negative だけ EXIT=3」が 1 チケット生き延びた。⭐ 必ず持たせること。 */
function anchorAudit() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const rows = [];
  for (const key of MUT_ORDER) {
    for (const pair of MUTATIONS[key]) {
      const from = pair[0], to = pair[1];
      rows.push({
        key: key,
        n: src.split(from).length - 1,
        multiline: from.indexOf('\n') >= 0,
        sameLen: from.length === to.length,
        head: from.trim().slice(0, 56),
      });
    }
  }
  return rows;
}
const ANCHORS = anchorAudit();
{
  const bad = ANCHORS.filter(r => r.n !== 1 || r.multiline || r.sameLen);
  console.log('[drv] §0e 変異アンカーの検算 (原本 index.html):');
  for (const r of ANCHORS) {
    console.log('   ' + (r.n === 1 && !r.multiline && !r.sameLen ? 'OK ' : '⛔ ') +
      r.key + '  一致 ' + r.n + ' 箇所' +
      (r.multiline ? ' / ⛔複数行' : '') + (r.sameLen ? ' / ⛔置換前後が同長' : '') +
      '   ' + JSON.stringify(r.head));
  }
  if (bad.length) {
    console.error('[drv] ⛔ 変異アンカーが ' + bad.length + ' 本腐っている (' +
      bad.map(r => r.key).join(',') + ') → 負のコントロールが空振りする');
    process.exit(3);
  }
}

const _mutCache = {};
function mutatedSources(key) {
  if (_mutCache[key]) return _mutCache[key];
  const out = {};
  /* ⚠ 変異ごとに**原本**を読み直す (#56 の教訓)。 */
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const pair of MUTATIONS[key]) {
    const from = pair[0], to = pair[1];
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    if (from.length === to.length) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換前後が同じ長さ → 差し替わったか確認できない');
      process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異 ' + key + ' の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' (同 tag の先行変異に食われた可能性): ' + JSON.stringify(from.slice(0, 90)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
  }
  _mutCache[key] = out;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
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
  console.error('[drv] Chrome/Edge が見つかりません'); process.exit(2);
}
// ⚠ MIME を持たせ忘れると全 500 = ページが白紙になり「シームが無い」ように見える
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        if (mutKey && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources(mutKey)[rel]); return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
function httpStatus(port, p) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: port, path: p }, r => { r.resume(); resolve(r.statusCode); })
      .on('error', () => resolve(0));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ★ドライバ側の独立実装 — 配信されたテキストから n4big / n7big のマスクを組む
//   ⚠⚠ df-mapdef.js の paintingBlockedTilesFor も index.html の関数も 1 行も借りない。
// ══════════════════════════════════════════════════════════════════════════════
function sliceBrace(text, i) {
  let depth = 0, j = i, quote = null;
  while (j < text.length) {
    const ch = text[j];
    if (quote) {
      if (ch === '\\') { j += 2; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(i, j + 1); }
    j++;
  }
  throw new Error('{ } が閉じていません');
}
function stripComments(s) {
  const out = []; let i = 0, quote = null;
  while (i < s.length) {
    const ch = s[i];
    if (quote) {
      out.push(ch);
      if (ch === '\\' && i + 1 < s.length) { out.push(s[i + 1]); i += 2; continue; }
      if (ch === quote) quote = null;
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out.push(ch); i++; continue; }
    if (s.startsWith('//', i)) { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j; continue; }
    if (s.startsWith('/*', i)) { const j = s.indexOf('*/', i + 2); if (j < 0) throw new Error('block comment'); i = j + 2; continue; }
    out.push(ch); i++;
  }
  return out.join('');
}
/* -> { theme: { key: { bounds, node, rows, seal, outdoor, src } } } */
function parsePaintings(indexText) {
  const MARK = 'const ROOM_PAINTINGS_DEF = {';
  const i = indexText.indexOf(MARK);
  if (i < 0) throw new Error('ROOM_PAINTINGS_DEF が見つかりません');
  const body = stripComments(sliceBrace(indexText, i + MARK.length - 1));
  const out = {};
  const themeRe = /["']([\w\-]+)["']\s*:\s*\{/g;
  let m;
  while ((m = themeRe.exec(body))) {
    const theme = m[1];
    const block = sliceBrace(body, m.index + m[0].length - 1);
    themeRe.lastIndex = m.index + m[0].length - 1 + block.length;
    const list = {};
    const entRe = /["']?([\w]+)["']?\s*:\s*\{/g;
    let e;
    while ((e = entRe.exec(block))) {
      const eb = sliceBrace(block, e.index + e[0].length - 1);
      entRe.lastIndex = e.index + e[0].length - 1 + eb.length;
      const bm = /tileBounds\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/.exec(eb);
      if (!bm) continue;
      const km = /blocked\s*:\s*\[([\s\S]*?)\]/.exec(eb);
      const sm = /src\s*:\s*["']([^"']+)["']/.exec(eb);
      list[e[1]] = {
        bounds: bm.slice(1, 5).map(Number),
        node: /node\s*:\s*true/.test(eb),
        seal: /sealRing\s*:\s*true/.test(eb),
        outdoor: /outdoor\s*:\s*true/.test(eb),
        src: sm ? sm[1] : null,
        rows: km ? (km[1].match(/["']([^"']*)["']/g) || []).map(s => s.slice(1, -1)) : null,
      };
    }
    out[theme] = list;
  }
  return out;
}
/* ★「西 45%」の比を**配信バイトから読む**。⛔ 0.45 を写経しない。
 *   読めなければ null を返し、(3f) が装置の故障として赤くなる。 */
function parseWestRatio(indexText) {
  const m = /westLimit\s*=\s*c1\s*\+\s*Math\.floor\(\(c2\s*-\s*c1\)\s*\*\s*([0-9.]+)\)/.exec(indexText);
  return m ? parseFloat(m[1]) : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ページ側の測定
// ══════════════════════════════════════════════════════════════════════════════
async function bootPage(browser, url, scen, errs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  /* ⚠⚠⚠ (1d) で使う。**必ず m.type() で絞る** —
   *   `[graph] 分岐グラフで起動します` は console.log の**成功行**なので、
   *   語で拾うと素で必ず赤くなる (#62 が実際に踏んだ)。 */
  page.on('console', m => {
    const t = m.type();
    if (t === 'error' || t === 'warning') errs.push(t.toUpperCase() + ' ' + m.text());
  });
  await page.evaluateOnNewDocument((sid) => {
    try { sessionStorage.setItem('dragonfighters.currentScenario', sid); } catch (e) {}
    try { localStorage.setItem('dragonfighters.xp', '45000'); } catch (e) {}
  }, scen);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof mapData !== 'undefined' && typeof buildNode === 'function'", { timeout: 25000 });
  return page;
}

/* グラフの姿。⭐ RUN (起動時に組まれた物) / buildScenarioRun (その場で呼び直した物) /
 *   buildDragonLairRun (畳みの本体そのもの) の **3 経路**を返すので、
 *   ドライバはノード数も id も写経しなくてよい (依頼書 §8 (0a))。 */
const GRAPH_FN = (others, all, theme) => {
  const out = { err: null };
  const nodeOf = (n) => {
    const rm = (n.mapDef.rooms || [])[0] || {};
    return { id: n.id, kind: n.kind, rect: rm.rect ? rm.rect.slice() : null,
             paint: rm.painting ? rm.painting.key : null,
             density: rm.scenery ? rm.scenery.density : null,
             slots: (rm.enemySlots || []).map(s => s.slice()),
             boss: rm.bossSlot ? rm.bossSlot.slice() : null,
             hoardKey: Object.prototype.hasOwnProperty.call(n.mapDef, 'hoard'),
             hoard: Array.isArray(n.mapDef.hoard) ? n.mapDef.hoard.map(t => t.slice()) : null,
             start: n.mapDef.start ? { tx: n.mapDef.start.tx, ty: n.mapDef.start.ty } : null,
             exits: n.exits.map(e => ({ to: e.to, dir: e.dir || null, at: e.at.slice() })) };
  };
  const hash = (s) => { let h = 5381;
    for (let i = 0; i < s.length; i++) h = (((h * 33) ^ s.charCodeAt(i)) >>> 0);
    return h.toString(16) + ':' + s.length; };
  try {
    const R = (typeof RUN !== 'undefined') ? RUN : null;
    out.active = !!R;
    out.seamActive = !!(window.__graphRun && window.__graphRun.active());
    const g = R ? R.graph : null;
    out.entry = g ? g.entry : null;
    out.curNode = (typeof currentNodeId !== 'undefined') ? currentNodeId : null;
    out.nodes = g ? g.nodes.map(nodeOf) : null;
    /* ★2 経路目 = buildScenarioRun をその場で呼び直す */
    try {
      const g2 = buildScenarioRun(theme);
      out.fresh = g2 ? { entry: g2.entry, ids: g2.nodes.map(n => n.id),
                         kinds: g2.nodes.map(n => n.kind) } : null;
    } catch (e) { out.fresh = { err: String(e && e.message || e) }; }
    /* ★3 経路目 = 畳みの本体 buildDragonLairRun() の戻り値 (依頼書 §8 (0a) の指定) */
    try {
      const g3 = buildDragonLairRun();
      out.direct = g3 ? { entry: g3.entry, ids: g3.nodes.map(n => n.id),
                          kinds: g3.nodes.map(n => n.kind) } : null;
    } catch (e) { out.direct = { err: String(e && e.message || e) }; }
    /* ★(8a2) — 6 シナリオ全ノードを走査して「hoard キーを持つ mapDef」を数える。
     *   ⭐ 両腕の差ではなく**絶対量**なので、両腕へ等しく効く欠陥 (hoardnull) を捕まえる。 */
    out.hoardScan = [];
    for (const sid of all) {
      try {
        const r = buildScenarioRun(sid);
        if (!r) { out.hoardScan.push(sid + ':NULL'); continue; }
        for (const n of r.nodes)
          if (Object.prototype.hasOwnProperty.call(n.mapDef, 'hoard'))
            out.hoardScan.push(sid + '/' + n.id);
      } catch (e) { out.hoardScan.push(sid + ':THREW'); }
    }
    /* 恒等 (非退行) — 他 5 シナリオのグラフ全文のハッシュ */
    out.others = {};
    for (const sid of others) {
      try { const r = buildScenarioRun(sid); out.others[sid] = r ? hash(JSON.stringify(r)) : null; }
      catch (e) { out.others[sid] = 'THREW'; }
    }
    if (window.DFMapDef && g) {
      const L = DFMapDef.lintRun(g);
      out.lint = { e: L.errors.map(x => x.code), w: L.warnings.map(x => x.code) };
    } else out.lint = null;
    out.kindsTable = (typeof NODE_EXTRA_SPAWN_KINDS !== 'undefined')
      ? JSON.parse(JSON.stringify(NODE_EXTRA_SPAWN_KINDS)) : null;
    out.hasDragonKinds = (typeof NODE_EXTRA_SPAWN_KINDS !== 'undefined')
      ? Object.prototype.hasOwnProperty.call(NODE_EXTRA_SPAWN_KINDS, 'dragon-lair') : null;
    /* ★本番の並び (exitsWithReturn) = 自動進行が opts[0] を取る、その 0 番目 */
    out.opts = (window.__graphRun && R && R.byId[currentNodeId])
      ? window.__graphRun.exits().map(o => ({ to: o.to, dir: o.dir, back: !!o.back })) : null;
    /* 幾何の物差しは**本番の定数**から取る (⛔ 96 / 12.5 / 200 / 400 を写経しない) */
    const rd = (f) => { try { const v = f(); return v === undefined ? null : v; } catch (e) { return 'UNREADABLE'; } };
    out.tile    = rd(() => TILE_SIZE);
    out.detect  = rd(() => DETECTION_RANGE);
    out.inset   = rd(() => NODE_ENTRY_INSET);
    out.mimicR  = rd(() => MIMIC_APPROACH_RADIUS);
    out.melee   = rd(() => RANGE.melee.engagePx);
    out.snapX   = rd(() => SNAP_X_OFFSET);
    out.snapY   = rd(() => SNAP_Y_OFFSET);
    out.folded  = rd(() => DRAGON_FOLDED);
    out.foldOff = rd(() => DRAGON_FOLD_OFF);
  } catch (e) { out.err = String(e && e.message || e); }
  return out;
};

/* ノードを実プレイと同じ順序で組み、盤面を丸ごと写して返す。
 * ⚠⚠ buildNode(nd.mapDef) を直に呼ばない (MAPDEF.isCustom が付かず旧在庫の絵が貼られる)。
 * ⭐ buildNode は内部で withNodeRng(... spawnNodeEntities) を回すので、
 *   罠 / 玄室の宝箱 / spawnDragonHoard の財宝の山まで**本番と同じ経路で**湧く。 */
const SNAP_FN = (nodeId, via) => {
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) return { err: 'no node ' + nodeId };
  resetNodeState();
  currentNodeId = nodeId;
  buildNode(resolveNodeMapDef(nodeId), nodeId);
  try { restoreNodeState(nodeId); } catch (e) {}
  try { placeNodeParty(via || 'right'); } catch (e) {}
  const md = RUN.byId[nodeId].mapDef, room = (md.rooms || [])[0] || {};
  const rect = room.rect || null;
  const walls = [];
  if (rect) {
    for (let r = rect[0]; r <= rect[2]; r++) {
      let line = '';
      for (let c = rect[1]; c <= rect[3]; c++) line += isTileWall(c, r) ? '#' : '.';
      walls.push(line);
    }
  }
  const gates = {};
  for (const d of ['up', 'down', 'left', 'right']) {
    try { const g = nodeGateTile(md, d); gates[d] = [g.tx, g.ty]; } catch (e) { gates[d] = null; }
  }
  return {
    node: nodeId, rect: rect, kind: RUN.byId[nodeId].kind,
    start: md.start ? { tx: md.start.tx, ty: md.start.ty } : null,
    /* ★入場地点は「**パーティが実際に立っているタイル**」。⛔ START_TX/TY は
     *   buildNode が書いた mapDef.start なので別の縁から入っても動かない。 */
    hero: { tx: Math.round((playerX - SNAP_X_OFFSET) / TILE_SIZE),
            ty: Math.round((playerY - SNAP_Y_OFFSET) / TILE_SIZE) },
    paint: room.painting ? room.painting.key : null,
    density: room.scenery ? room.scenery.density : null,
    slots: (room.enemySlots || []).map(s => s.slice()),
    boss: room.bossSlot ? room.bossSlot.slice() : null,
    /* ★宣言の出所そのもの (spawnDragonHoard が読むのと同じ場所) */
    rawHoard: Array.isArray(md.hoard) ? md.hoard.map(t => t.slice()) : null,
    exits: RUN.byId[nodeId].exits.map(e => ({ to: e.to, dir: e.dir || null, at: e.at.slice() })),
    gates: gates,
    traps: (typeof traps !== 'undefined') ? traps.length : null,
    chests: (typeof roomChests !== 'undefined')
      ? roomChests.map(c => ({ tx: c.tx, ty: c.ty, mimic: !!c.isMimic })) : null,
    mimic: (typeof mimicChest !== 'undefined' && mimicChest) ? [mimicChest.tx, mimicChest.ty] : null,
    /* ⚠ 敵のタイルは Math.round(e.x / TILE) では出ない。createEnemy が
     *   x = tx*TILE + TILE/2 - displaySize/2 を入れるので、中心へ戻してから floor する。 */
    enemies: enemies.map(e => ({ type: e.type, alive: !!e.alive, inactive: !!e.inactive,
      passiveNpc: !!e.passiveNpc, boss: !!(e.def && e.def.isBoss),
      tx: Math.floor((e.x + (e.def ? e.def.displaySize : 0) / 2) / TILE_SIZE),
      ty: Math.floor((e.y + (e.def ? e.def.displaySize : 0) / 2) / TILE_SIZE) })),
    walls: walls,
  };
};

/* ★本番の aStar (4 近傍) で歩数を測る。⛔ 自前 BFS を「本番の経路探索」と呼ばない。 */
const PATH_FN = (fx, fy, tx, ty) => {
  try { const p = aStar(fx, fy, tx, ty); return Array.isArray(p) ? p.length : null; }
  catch (e) { return 'THREW:' + String(e && e.message || e); }
};
/* ★出口ゲートへの到達。
 * ⚠⚠⚠ 出口タイルには**閉じた扉** (doorsForRender の "gate-right") が立っており、
 *   isTileWall がそれを壁と読むので aStar は素で null を返す (#66 が 2026-09-12 に実測し、
 *   #67 の下見でも gate:null を再現した)。⇒ 扉の**手前**まで測り、扉のタイル自身を
 *   経路の末尾へ足す (実プレイでも主人公は扉の手前まで歩き、開けてから踏み越える)。 */
const GATE_PATH_FN = (fx, fy, gx, gy) => {
  const direct = aStar(fx, fy, gx, gy);
  if (Array.isArray(direct)) return { via: 'gate', steps: direct.length };
  for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const q = aStar(fx, fy, gx + d[0], gy + d[1]);
    if (Array.isArray(q)) return { via: 'door-front', steps: q.length + 1, front: [gx + d[0], gy + d[1]] };
  }
  return { via: null, steps: null,
           doors: (typeof doorsForRender === 'function' ? doorsForRender() : [])
             .map(x => x.id + '@' + x.tx + ',' + x.ty + ':' + x.state) };
};

/* ★(6c) 「全敵を倒したら isNodeSettled() が true になり、出口が立つか」。
 * ⚠ alive を落とすだけなので coin/weapon/armorVisible は立たない
 *   = findNearestDrop() は null のまま (isNodeSettled の第 2 条件を人工的に満たさない)。 */
const SETTLE_FN = (nodeId) => {
  if (typeof RUN === 'undefined' || !RUN || !RUN.byId || !RUN.byId[nodeId]) return { err: 'no node ' + nodeId };
  resetNodeState();
  currentNodeId = nodeId;
  buildNode(resolveNodeMapDef(nodeId), nodeId);
  try { restoreNodeState(nodeId); } catch (e) {}
  try { placeNodeParty('right'); } catch (e) {}
  const before = isNodeSettled();
  const killed = [];
  for (const e of enemies) {
    if (!e.alive) continue;
    e.alive = false; killed.push(e.type);
  }
  const after = isNodeSettled();
  return {
    before: before, after: after, killed: killed.length,
    left: enemies.filter(e => e.alive).map(e => ({ type: e.type, inactive: !!e.inactive, passiveNpc: !!e.passiveNpc })),
    drop: (typeof findNearestDrop === 'function') ? !!findNearestDrop() : null,
    opts: (window.__graphRun && RUN.byId[currentNodeId])
      ? window.__graphRun.exits().map(o => ({ to: o.to, dir: o.dir, back: !!o.back })) : null,
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
/* 入場地点の**独立式** — 「来た向きの反対側の辺の中点 + NODE_ENTRY_INSET」を
 *   rect の算術だけで組む。⛔ 本番の nodeGateTile を借りない (借りると 1 経路になる)。
 * ⚠ midR / midC は Math.floor なので**行数・列数の偶奇で 1 マスずれる** (#58 の教訓)。
 *   竜は n4 = **20 行 (偶数)** / n7 = **19 行 (奇数)** で**偶奇が違う 2 枚**。
 *   ⛔ 砦の 30x20 も神殿の 28x18 / 20x13 も写経しない。 */
function entryFromRect(rect, via, inset) {
  if (!rect || inset === null || inset === undefined) return null;
  const midR = Math.floor((rect[0] + rect[2]) / 2), midC = Math.floor((rect[1] + rect[3]) / 2);
  if (via === 'right') return [rect[1] + inset, midR];   // 左辺の中点から東へ踏み込む
  if (via === 'left')  return [rect[3] - inset, midR];
  if (via === 'up')    return [midC, rect[2] - inset];
  if (via === 'down')  return [midC, rect[0] + inset];
  return null;
}
/* ★出口ゲートの**独立式** — 右辺の中点。⛔ nodeGateTile を借りない。 */
function gateFromRect(rect, dir) {
  if (!rect) return null;
  const midR = Math.floor((rect[0] + rect[2]) / 2), midC = Math.floor((rect[1] + rect[3]) / 2);
  if (dir === 'right') return [rect[3], midR];
  if (dir === 'left')  return [rect[1], midR];
  if (dir === 'up')    return [midC, rect[0]];
  if (dir === 'down')  return [midC, rect[2]];
  return null;
}
/* 敵スロットを「互いに range タイル未満なら同じ群」で連結成分に割る。 */
function clusters(pts, range) {
  const n = pts.length, seen = new Array(n).fill(false), out = [];
  const d = (a, b) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const st = [i], grp = []; seen[i] = true;
    while (st.length) {
      const c = st.pop(); grp.push(c);
      for (let j = 0; j < n; j++) if (!seen[j] && d(c, j) < range) { seen[j] = true; st.push(j); }
    }
    out.push(grp.map(k => pts[k]));
  }
  return out;
}
function minGroupGap(groups) {
  let best = Infinity;
  for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++)
    for (const p of groups[a]) for (const q of groups[b])
      best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  return best;
}
const typeCount = (list) => {
  const m = {};
  for (const t of list) m[t] = (m[t] || 0) + 1;
  return m;
};
const sortedJSON = (o) => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const tileSet = (list) => JSON.stringify((list || []).map(t => t[0] + ',' + t[1]).sort());
const maxSpread = (pts) => {
  let best = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
    best = Math.max(best, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  return best;
};

async function runSuite(browser, port, label) {
  const R = [];
  const errs = [];
  const check = (id, name, cond, detail) => {
    R.push({ id: id, name: name, ok: !!cond, detail: detail || '' });
    console.log('  ' + (cond ? 'PASS' : 'FAIL') + ' (' + id + ') ' + name + (detail ? '  — ' + detail : ''));
  };
  const base = 'http://127.0.0.1:' + port;
  /* ⭐ 期待値は**配信バイト**から組む。⛔ 作業ツリーを fs で読むと --mutate が素通しになる。 */
  const indexText = await new Promise((res, rej) => {
    http.get(base + '/index.html', r => { const b = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b).toString('utf8'))); }).on('error', rej);
  });
  const cat = parsePaintings(indexText);
  const dl = cat[THEME] || {};
  const n4def = dl.n4big || null, n7def = dl.n7big || null;
  const westRatio = parseWestRatio(indexText);

  // ── §0 装置 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §0 装置 (先に母集団を確かめる)  ' + label);
  const pageA = await bootPage(browser, base + '/index.html?diag=1', THEME, errs);
  const GA = await pageA.evaluate(GRAPH_FN, OTHER_SCENS, ALL_SCENS, THEME);
  const idsA = GA.nodes ? GA.nodes.map(n => n.id) : [];
  const byA = {}; for (const n of (GA.nodes || [])) byA[n.id] = n;
  const fr = GA.fresh || {}, dr = GA.direct || {};
  check('0a', '★★★装置: 既定の腕で竜が ' + JSON.stringify(KEEP_IDS) + ' の 2 ノードへ畳まれ entry="n4"。⭐ ノード数は spec でなく buildScenarioRun("dragon-lair") と buildDragonLairRun() の戻り値でも数える (3 経路)。⛔ これが無いと以下の assert が全部空振りで永久緑',
    !!GA.nodes && GA.nodes.length === KEEP_IDS.length &&
    KEEP_IDS.every(id => idsA.indexOf(id) >= 0) && GA.entry === 'n4' && GA.seamActive === true &&
    !!fr.ids && JSON.stringify(fr.ids) === JSON.stringify(idsA) && fr.entry === GA.entry &&
    !!dr.ids && JSON.stringify(dr.ids) === JSON.stringify(idsA) && dr.entry === GA.entry,
    'RUN: entry=' + GA.entry + ' ids=' + JSON.stringify(idsA) +
    ' / buildScenarioRun: ' + JSON.stringify(fr) + ' / buildDragonLairRun: ' + JSON.stringify(dr) +
    ' / seam=' + GA.seamActive + (GA.err ? ' err=' + GA.err : ''));

  /* 旧構成 = 撤退の腕。⭐ §2 の期待値をここから導くので §1 より先に開く。 */
  const pageB = await bootPage(browser, base + '/index.html?diag=1&dragonfold=0', THEME, errs);
  const GB = await pageB.evaluate(GRAPH_FN, OTHER_SCENS, ALL_SCENS, THEME);
  const idsB = GB.nodes ? GB.nodes.map(n => n.id) : [];
  const byB = {}; for (const n of (GB.nodes || [])) byB[n.id] = n;
  check('0b', '★装置: ?dragonfold=0 の腕に旧構成が実在する (' + (KEEP_IDS.length + DROP_IDS.length) + ' ノード / entry="n0" / 廃止した 6 部屋が全部そこに居る)。⛔ これが無いと「元から 2 ノードだった」と区別できない',
    idsB.length === KEEP_IDS.length + DROP_IDS.length && GB.entry === 'n0' &&
    DROP_IDS.every(id => idsB.indexOf(id) >= 0) && KEEP_IDS.every(id => idsB.indexOf(id) >= 0) &&
    GB.foldOff === true && GB.folded === false && GA.foldOff === false && GA.folded === true,
    'entry=' + GB.entry + ' nodes=' + JSON.stringify(idsB) +
    ' / DRAGON_FOLD_OFF=' + GB.foldOff + ' DRAGON_FOLDED=' + GB.folded +
    ' (畳んだ側は ' + GA.foldOff + ' / ' + GA.folded + ')');

  const maskOf = (def) => (tx, ty) => {
    const b = def && def.bounds;
    return (b && def.rows && ty >= b[0] && ty <= b[2] && tx >= b[1] && tx <= b[3] && def.rows[ty - b[0]])
      ? def.rows[ty - b[0]][tx - b[1]] : null;
  };
  const m4 = maskOf(n4def), m7 = maskOf(n7def);
  const countCh = (def, ch) => (def && def.rows)
    ? def.rows.reduce((a, r) => a + r.split('').filter(c => c === ch).length, 0) : 0;
  const shapeOK = (def) => !!def && Array.isArray(def.rows) &&
    def.rows.length === (def.bounds[2] - def.bounds[0] + 1) &&
    def.rows.every(r => r.length === (def.bounds[3] - def.bounds[1] + 1));
  check('0c', '★装置: 自前パースした n4big / n7big のマスクが tileBounds と同じ行数・列数で、開きマス "." も塞ぎマス "#" もどちらも 0 でない (パーサが死んでいない)',
    shapeOK(n4def) && shapeOK(n7def) &&
    countCh(n4def, '.') > 0 && countCh(n4def, '#') > 0 &&
    countCh(n7def, '.') > 0 && countCh(n7def, '#') > 0,
    'n4big ' + (n4def ? (n4def.rows || []).length + '行 x ' + ((n4def.rows || [''])[0] || '').length + '列 tileBounds=' + JSON.stringify(n4def.bounds) : 'なし') +
    ' 開き=' + countCh(n4def, '.') + ' 塞ぎ=' + countCh(n4def, '#') +
    ' / n7big ' + (n7def ? (n7def.rows || []).length + '行 x ' + ((n7def.rows || [''])[0] || '').length + '列 tileBounds=' + JSON.stringify(n7def.bounds) : 'なし') +
    ' 開き=' + countCh(n7def, '.') + ' 塞ぎ=' + countCh(n7def, '#'));
  const numOK = (v) => typeof v === 'number' && isFinite(v) && v > 0;
  check('0d', '★装置: 幾何の物差しが本番から読めている (MIMIC_APPROACH_RADIUS / TILE_SIZE / DETECTION_RANGE / NODE_ENTRY_INSET / RANGE.melee.engagePx)。⛔ 1 つでも 0 や undefined なら §2 §3 の距離 assert が無意味になる',
    numOK(GA.mimicR) && numOK(GA.tile) && numOK(GA.detect) && numOK(GA.inset) && numOK(GA.melee) &&
    typeof westRatio === 'number' && westRatio > 0 && westRatio < 1,
    'MIMIC_APPROACH_RADIUS=' + GA.mimicR + ' TILE_SIZE=' + GA.tile + ' DETECTION_RANGE=' + GA.detect +
    ' NODE_ENTRY_INSET=' + GA.inset + ' melee.engagePx=' + GA.melee +
    ' / 配信バイトから読んだ西の比=' + westRatio);
  check('0e', '★装置: 変異アンカー ' + ANCHORS.length + ' 本が原本 index.html に 1 箇所ずつ実在する (起動時検算。1 本でも空振りなら exit 3 で即死 = verify_fort_fold が 1 チケット見逃した型の再発防止)',
    ANCHORS.length === MUT_ORDER.length && ANCHORS.every(r => r.n === 1 && !r.multiline && !r.sameLen),
    ANCHORS.map(r => r.key + '=' + r.n).join(' '));

  // ── §1 構造 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §1 構造');
  check('1a', '★ノードは n4 / n7 の 2 つだけで kind が start / boss (n0 / n1 / n2 / n3 / n5 / n6 が 1 つも無い)',
    idsA.length === KEEP_IDS.length && KEEP_IDS.every(id => idsA.indexOf(id) >= 0) &&
    DROP_IDS.every(id => idsA.indexOf(id) < 0) &&
    !!byA.n4 && byA.n4.kind === 'start' && !!byA.n7 && byA.n7.kind === 'boss',
    '残った=' + JSON.stringify((GA.nodes || []).map(n => n.id + ':' + n.kind)) +
    ' 廃止すべきなのに残っている=' + JSON.stringify(DROP_IDS.filter(id => idsA.indexOf(id) >= 0)));
  const bosses = (GA.nodes || []).filter(n => n.kind === 'boss').map(n => n.id);
  check('1b', '★kind:"boss" のノードがグラフにちょうど 1 つ (validate / lintRun がそれを要求する)',
    bosses.length === 1 && bosses[0] === 'n7',
    'boss=' + JSON.stringify(bosses) + ' kinds=' + JSON.stringify((GA.nodes || []).map(n => n.id + ':' + n.kind)));
  const kindsB = {}; for (const n of (GB.nodes || [])) kindsB[n.id] = n.kind;
  const kindDiff = Object.keys(SKELETON_KINDS).filter(id => kindsB[id] !== SKELETON_KINDS[id]);
  check('1c', '★?dragonfold=0 の 8 ノードの kind の列が共通骨格と一致する (⭐ n6 は竜だけ "loot"。⛔ ここを "event" と書かない)',
    idsB.length === 8 && kindDiff.length === 0,
    '実測=' + JSON.stringify(kindsB) + ' / 契約=' + JSON.stringify(SKELETON_KINDS) +
    ' 食い違い=' + JSON.stringify(kindDiff));
  const graphWarn = errs.filter(s => /^(WARNING|ERROR)\b/.test(s) && s.indexOf('[graph]') >= 0);
  check('1d', '★DFMapDef.lintRun が error 0 / warning 0 で、console の warning/error に [graph] が 1 件も無い (⭐ 縦横比の在庫 LINT_PAINTING_ASPECTS が竜の 31x20 / 30x19 を知っているか)',
    !!GA.lint && GA.lint.e.length === 0 && GA.lint.w.length === 0 && graphWarn.length === 0,
    'lint=' + JSON.stringify(GA.lint) + ' console=' + JSON.stringify(graphWarn.slice(0, 3)));

  // ── §2 敵 ──────────────────────────────────────────────────────────────────
  console.log('\n[drv] §2 敵 (⭐ 期待値は ?dragonfold=0 の腕からその場で導く)');
  const oldSum = [];
  for (const id of MERGED_FROM) for (const s of ((byB[id] || {}).slots || [])) oldSum.push(s[2]);
  const newList = ((byA.n4 || {}).slots || []).map(s => s[2]);
  check('2a', '★★畳んだ n4 の敵の**顔ぶれ** (種類ごとの体数) が ?dragonfold=0 の ' + MERGED_FROM.join('+') + ' の合計と完全一致する (⛔ 座標は rect が変わる以上一致しないので比べない・数字も焼いていない)',
    newList.length > 0 && oldSum.length === newList.length &&
    sortedJSON(typeCount(oldSum)) === sortedJSON(typeCount(newList)),
    '旧 ' + MERGED_FROM.join('+') + ' = ' + oldSum.length + ' 体 ' + JSON.stringify(typeCount(oldSum)) +
    ' / 畳んだ n4 = ' + newList.length + ' 体 ' + JSON.stringify(typeCount(newList)));
  const escA = ((byA.n7 || {}).slots || []).map(s => s[2]);
  const escB = ((byB.n7 || {}).slots || []).map(s => s[2]);
  check('2b', '★畳んだ n7 の顔ぶれが ?dragonfold=0 の n7 と一致し、ボスが pharaxus 単騎 (⛔ 座標は測らない)',
    escA.length > 0 && escB.length === escA.length &&
    sortedJSON(typeCount(escA)) === sortedJSON(typeCount(escB)) &&
    !!byA.n7 && !!byA.n7.boss && byA.n7.boss[2] === 'pharaxus' &&
    !!byB.n7 && !!byB.n7.boss && byB.n7.boss[2] === 'pharaxus',
    '畳んだ n7 護衛=' + JSON.stringify(escA) + ' boss=' + JSON.stringify((byA.n7 || {}).boss) +
    ' / 旧 n7 護衛=' + JSON.stringify(escB) + ' boss=' + JSON.stringify((byB.n7 || {}).boss));
  /* (2c) ⚠⚠⚠ isTileWall だけでは**永久緑**になる (敵スポーンは applyPaintingBlocking の
   *   門番 skipSpawn が必ず素通しさせる = #58 の教訓)。効くのは「マスクが '.' か」と
   *   「マスクが '#' なのに歩けるタイルが 0 か (= 絵に穴が開いていない)」の 2 本。 */
  const S4 = await pageA.evaluate(SNAP_FN, 'n4', 'right');
  const S7 = await pageA.evaluate(SNAP_FN, 'n7', 'right');
  const slots4 = ((byA.n4 || {}).slots || []).slice();
  const slots7 = ((byA.n7 || {}).slots || []).slice();
  if (byA.n7 && byA.n7.boss) slots7.push(byA.n7.boss);
  const bad4 = slots4.filter(s => m4(s[0], s[1]) !== '.');
  const bad7 = slots7.filter(s => m7(s[0], s[1]) !== '.');
  const holesOf = (def, S) => {
    const out = [], b = def && def.bounds;
    if (b && def.rows && S.walls) {
      for (let r = 0; r < def.rows.length; r++) for (let c = 0; c < def.rows[r].length; c++) {
        if (def.rows[r][c] !== '#') continue;
        if (S.walls[r] && S.walls[r][c] === '.') out.push([b[1] + c, b[0] + r]);
      }
    }
    return out;
  };
  const holes4 = holesOf(n4def, S4), holes7 = holesOf(n7def, S7);
  check('2c', '★★敵 (+ ボス) の全タイルがマスクの "." に載り、マスクの "#" が 1 つも歩けるようになっていない (= 絵に穴を開けていない) — n4 / n7 とも',
    slots4.length > 0 && slots7.length > 0 &&
    bad4.length === 0 && bad7.length === 0 && holes4.length === 0 && holes7.length === 0,
    'n4 スロット ' + slots4.length + ' 体 ⛔"#"の上=' + JSON.stringify(bad4) +
    ' ⛔絵の穴=' + JSON.stringify(holes4.slice(0, 6)) +
    ' / n7 スロット ' + slots7.length + ' 体 ⛔"#"の上=' + JSON.stringify(bad7) +
    ' ⛔絵の穴=' + JSON.stringify(holes7.slice(0, 6)));
  const hero4 = S4.hero || { tx: -1, ty: -1 }, hero7 = S7.hero || { tx: -1, ty: -1 };
  const nearest = (pts, h) => pts.length ? Math.min.apply(null, pts.map(p => Math.hypot(p[0] - h.tx, p[1] - h.ty))) : -1;
  const near4 = nearest(slots4.map(s => [s[0], s[1]]), hero4);
  const near7 = nearest(slots7.map(s => [s[0], s[1]]), hero7);
  const meleeTiles = (numOK(GA.melee) && numOK(GA.tile)) ? GA.melee / GA.tile : null;
  check('2d', '★入場地点から最も近い敵まで melee の交戦距離 (RANGE.melee.engagePx = ' + GA.melee + 'px = ' + (meleeTiles ? meleeTiles.toFixed(2) : '?') + ' タイル) より遠い — n4 / n7 とも (入場ナレの最中に乱戦が始まらない)',
    !!meleeTiles && near4 > meleeTiles && near7 > meleeTiles,
    'n4 入場=' + JSON.stringify(hero4) + ' 最寄り=' + near4.toFixed(2) + ' タイル (' + Math.round(near4 * (GA.tile || 96)) + 'px)' +
    ' / n7 入場=' + JSON.stringify(hero7) + ' 最寄り=' + near7.toFixed(2) + ' タイル (' + Math.round(near7 * (GA.tile || 96)) + 'px)');
  /* (2e) ⭐ 依頼書 §9-2 が決めた設計の制約 (群の最短 > DETECTION_RANGE) を記録する。
   *   ⛔ 12.5 タイルを写経しない — DETECTION_RANGE / TILE_SIZE を割って導く。 */
  const rangeTiles = (numOK(GA.detect) && numOK(GA.tile)) ? GA.detect / GA.tile : null;
  const foePts = slots4.map(s => [s[0], s[1]]);
  const grps = rangeTiles ? clusters(foePts, rangeTiles) : [];
  const gap = grps.length >= 2 ? minGroupGap(grps) : Infinity;
  check('2e', '★n4 の敵が 2 群に割れており、群間の最短が DETECTION_RANGE (' + (rangeTiles || '?') + ' タイル) より遠い (= 10 体が一度に襲ってこない。依頼書 §9-2 の設計制約)',
    !!rangeTiles && foePts.length > 0 && grps.length === 2 && gap > rangeTiles,
    '索敵=' + GA.detect + 'px / タイル=' + GA.tile + 'px = ' + rangeTiles + ' タイル / 群=' +
    JSON.stringify(grps.map(g => g.length)) + ' 群間=' + (gap === Infinity ? '-' : gap.toFixed(2)) + ' タイル');

  // ── §3 財宝とミミック ──────────────────────────────────────────────────────
  console.log('\n[drv] §3 財宝とミミック (⭐ 本チケットの山場)');
  const decl = (byA.n7 || {}).hoard || S7.rawHoard || null;
  const declBad = (decl || []).filter(t => m7(t[0], t[1]) !== '.');
  check('3a', '★畳んだ n7 の mapDef に hoard が在り、宣言タイルが**すべて**マスクの "." に載っている (⛔ 座標は焼き込まない = 性質だけを測る)',
    Array.isArray(decl) && decl.length > 0 && declBad.length === 0 &&
    !!S7.rawHoard && tileSet(S7.rawHoard) === tileSet(decl),
    '宣言=' + JSON.stringify(decl) + ' (' + (decl ? decl.length : 0) + ' マス)' +
    ' ⛔"#"の上=' + JSON.stringify(declBad) +
    ' / グラフの生 mapDef 側=' + JSON.stringify(S7.rawHoard));
  const chests7 = (S7.chests || []).map(c => [c.tx, c.ty]);
  check('3b', '★★実際に湧いた宝箱の座標が宣言タイルの集合と**完全一致**する (spawnDragonHoard が宣言を読んでいる。⛔ 宣言側ではシャッフルしないので決定論)',
    Array.isArray(decl) && chests7.length === decl.length && tileSet(chests7) === tileSet(decl),
    '湧いた ' + chests7.length + ' 個 ' + JSON.stringify(chests7) +
    ' / 宣言 ' + (decl ? decl.length : 0) + ' マス ' + JSON.stringify(decl));
  const spread = maxSpread(chests7);
  check('3c', '★湧いた宝箱の相互の最大距離が ' + HOARD_SPREAD_TILES + ' タイル以内 (final-mimic.md の「整然と並んだ古びた宝箱」を機械で測る唯一の形)',
    chests7.length > 1 && spread <= HOARD_SPREAD_TILES,
    '最大 ' + spread.toFixed(2) + ' タイル / ' + chests7.length + ' 個 ' + JSON.stringify(chests7));
  const mim = S7.mimic;
  const dMimEntry = mim ? Math.hypot(mim[0] - hero7.tx, mim[1] - hero7.ty) * (GA.tile || 96) : -1;
  check('3d', '★★ミミックから入場地点までが MIMIC_APPROACH_RADIUS (' + GA.mimicR + 'px) の 2 倍より遠い (入った瞬間に起動しない)',
    !!mim && numOK(GA.mimicR) && dMimEntry > GA.mimicR * 2,
    'ミミック=' + JSON.stringify(mim) + ' 入場=' + JSON.stringify(hero7) +
    ' 距離=' + dMimEntry.toFixed(1) + 'px (半径の ' + (GA.mimicR ? (dMimEntry / GA.mimicR).toFixed(2) : '?') + ' 倍)' +
    ' / 宝箱の mimic フラグ=' + JSON.stringify((S7.chests || []).filter(c => c.mimic).map(c => [c.tx, c.ty])));
  const bossUnit = (S7.enemies || []).filter(e => e.boss)[0] || null;
  const dMimBoss = (mim && bossUnit) ? Math.hypot(mim[0] - bossUnit.tx, mim[1] - bossUnit.ty) : -1;
  check('3e', '★ミミックからボス個体までが ' + MIMIC_BOSS_TILES + ' タイル (' + (MIMIC_BOSS_TILES * (GA.tile || 96)) + 'px) より遠い (⭐ 距離は mapDef の bossSlot でなく**実際に湧いたボス個体**から測る)',
    !!mim && !!bossUnit && dMimBoss > MIMIC_BOSS_TILES,
    'ミミック=' + JSON.stringify(mim) + ' ボス個体=' + (bossUnit ? bossUnit.type + '@' + bossUnit.tx + ',' + bossUnit.ty : 'なし') +
    ' 距離=' + dMimBoss.toFixed(2) + ' タイル (' + Math.round(dMimBoss * (GA.tile || 96)) + 'px)');
  const B7 = await pageB.evaluate(SNAP_FN, 'n7', 'right');
  const chestsB = (B7.chests || []).map(c => [c.tx, c.ty]);
  const rcB = (byB.n7 || {}).rect || null;
  const westLimit = (rcB && typeof westRatio === 'number') ? rcB[1] + Math.floor((rcB[3] - rcB[1]) * westRatio) : null;
  const outsideWest = westLimit === null ? chestsB : chestsB.filter(t => t[0] > westLimit);
  check('3f', '★?dragonfold=0 の腕では宝箱が**従来どおり西 ' + (westRatio !== null ? Math.round(westRatio * 100) : '?') + '% の内側**に出る (= 宣言を持たないときのフォールバックが生きている。恒等性の根拠)。⭐ 比は配信バイトの westLimit の行から読む',
    !!B7.rawHoard === false && chestsB.length > 0 && westLimit !== null && outsideWest.length === 0 && !!B7.mimic,
    '旧 n7 rect=' + JSON.stringify(rcB) + ' westLimit=col ' + westLimit +
    ' / 宝箱 ' + chestsB.length + ' 個 ' + JSON.stringify(chestsB) +
    ' ⛔西の外=' + JSON.stringify(outsideWest) + ' ミミック=' + JSON.stringify(B7.mimic) +
    ' / 旧 n7 の hoard 宣言=' + JSON.stringify(B7.rawHoard));

  // ── §4 罠と宝箱 ────────────────────────────────────────────────────────────
  console.log('\n[drv] §4 罠と玄室の宝箱 (森 #16 の失敗の再現防止)');
  const B4 = await pageB.evaluate(SNAP_FN, 'n4', 'right');
  check('4a', '★★畳んだ n4 で罠と宝箱が**どちらも 1 個以上**湧く (NODE_EXTRA_SPAWN_KINDS["dragon-lair"].n4 = ["search","loot"] の兼務が効いている。⛔ 忘れると無言でゼロ)',
    S4.traps > 0 && (S4.chests || []).length > 0 &&
    !!GA.kindsTable && JSON.stringify((GA.kindsTable['dragon-lair'] || {}).n4) === JSON.stringify(['search', 'loot']),
    '畳んだ n4: 罠=' + S4.traps + ' 宝箱=' + (S4.chests || []).length +
    ' / 台帳=' + JSON.stringify(GA.kindsTable));
  check('4b', '★?dragonfold=0 では n4 に兼務が載らない (旧構成では n2 が search / n3 と n6 が loot を持っている) = 台帳に "dragon-lair" キーが無く、実走でも罠 0 / 宝箱 0',
    GA.hasDragonKinds === true && GB.hasDragonKinds === false &&
    !!GB.kindsTable && GB.kindsTable['dragon-lair'] === undefined &&
    B4.traps === 0 && (B4.chests || []).length === 0,
    '旧側の台帳=' + JSON.stringify(GB.kindsTable) + ' hasOwnProperty=' + GB.hasDragonKinds +
    ' / ?dragonfold=0 の n4: 罠=' + B4.traps + ' 宝箱=' + (B4.chests || []).length);
  check('4c', '★森 (bandits-forest n7) / 沼 (lizard-swamp n4) / 砦 (orc-fort n4) / 神殿 (undead-temple n4) の兼務宣言が 1 ビットも動いていない',
    !!GA.kindsTable &&
    JSON.stringify(GA.kindsTable['bandits-forest']) === JSON.stringify({ n7: ['search', 'loot'] }) &&
    JSON.stringify(GA.kindsTable['lizard-swamp']) === JSON.stringify({ n4: ['search', 'loot'] }) &&
    JSON.stringify(GA.kindsTable['orc-fort']) === JSON.stringify({ n4: ['search', 'loot'] }) &&
    JSON.stringify(GA.kindsTable['undead-temple']) === JSON.stringify({ n4: ['search', 'loot'] }),
    JSON.stringify(GA.kindsTable));

  // ── §5 幾何 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §5 幾何 (本番の nodeGateTile / isTileWall / NODE_ENTRY_INSET)');
  const rectEq = (r, b) => !!r && !!b && r.length === 4 && JSON.stringify(r) === JSON.stringify(b);
  check('5a', '★n4 / n7 の rect が n4big / n7big の tileBounds と完全一致 (paintingAspectFits が縦横比の完全一致を要求する)',
    !!n4def && !!n7def && rectEq((byA.n4 || {}).rect, n4def.bounds) &&
    rectEq((byA.n7 || {}).rect, n7def.bounds),
    'n4 rect=' + JSON.stringify((byA.n4 || {}).rect) + ' tileBounds=' + JSON.stringify(n4def && n4def.bounds) +
    ' / n7 rect=' + JSON.stringify((byA.n7 || {}).rect) + ' tileBounds=' + JSON.stringify(n7def && n7def.bounds) +
    ' / paint=' + (byA.n4 || {}).paint + ',' + (byA.n7 || {}).paint);
  const ind4 = entryFromRect(S4.rect, 'right', GA.inset), ind7 = entryFromRect(S7.rect, 'right', GA.inset);
  const rowsOf = (r) => r ? (r[2] - r[0] + 1) : null;
  check('5b', '★★パーティが実際に立ったタイルが「入る辺の中点 + NODE_ENTRY_INSET」= mapDef.start と 3 経路で一致 — n4 / n7 とも。⭐ 期待式は rect からの独立式 (⛔ 数字を焼かない)。⚠ n4 と n7 は行数の偶奇が違うので midR の挙動が 2 枚で違う',
    !!ind4 && hero4.tx === ind4[0] && hero4.ty === ind4[1] &&
    !!S4.start && S4.start.tx === hero4.tx && S4.start.ty === hero4.ty &&
    !!ind7 && hero7.tx === ind7[0] && hero7.ty === ind7[1] &&
    !!S7.start && S7.start.tx === hero7.tx && S7.start.ty === hero7.ty,
    'n4 (' + rowsOf(S4.rect) + ' 行 ' + (rowsOf(S4.rect) % 2 ? '奇数' : '偶数') + ') 実際=' + JSON.stringify(hero4) +
    ' 独立式=' + JSON.stringify(ind4) + ' start=' + JSON.stringify(S4.start) +
    ' / n7 (' + rowsOf(S7.rect) + ' 行 ' + (rowsOf(S7.rect) % 2 ? '奇数' : '偶数') + ') 実際=' + JSON.stringify(hero7) +
    ' 独立式=' + JSON.stringify(ind7) + ' start=' + JSON.stringify(S7.start) + ' / inset=' + GA.inset);
  const ex4 = (byA.n4 || {}).exits || [];
  const atRight = ex4.find(e => e.to === 'n7');
  const gRight = (S4.gates && S4.gates.right) || null;
  const gInd = gateFromRect(S4.rect, 'right');
  check('5c', '★★n4 の出口が 3 経路で一致する (exits[].at / 本番の nodeGateTile(md,"right") / rect の右辺の中点という独立式)。食い違うと「矢印は辺の中点・遷移は別のマス」という開かない扉が生まれる',
    ex4.length === 1 && !!atRight && atRight.dir === 'right' &&
    !!byA.n7 && byA.n7.exits.length === 0 &&
    !!gRight && !!gInd &&
    atRight.at[0] === gRight[0] && atRight.at[1] === gRight[1] &&
    gRight[0] === gInd[0] && gRight[1] === gInd[1] &&
    Array.isArray(GA.opts) && GA.opts.length > 0 && GA.opts[0].to === 'n7' && GA.curNode === 'n4',
    'exits[].at=' + JSON.stringify(atRight ? atRight.at : null) +
    ' nodeGateTile(right)=' + JSON.stringify(gRight) + ' 独立式=' + JSON.stringify(gInd) +
    ' / n7 exits=' + JSON.stringify((byA.n7 || {}).exits) +
    ' / 自動進行の先頭=' + JSON.stringify(GA.opts) + ' 現在=' + GA.curNode);
  const st4mask = S4.start ? m4(S4.start.tx, S4.start.ty) : null;
  const st7mask = S7.start ? m7(S7.start.tx, S7.start.ty) : null;
  check('5d', '★起点タイルがマスクの "." に載っている — n4 / n7 とも (⛔ "#" の上に置くと buildNode の「起点の床保証」が絵へ無言で穴を開ける)',
    st4mask === '.' && st7mask === '.',
    'n4 start=' + JSON.stringify(S4.start) + ' マスク="' + st4mask + '"' +
    ' / n7 start=' + JSON.stringify(S7.start) + ' マスク="' + st7mask + '"');
  check('5e', '★n4 / n7 の density が 2 ノードとも 0 (⛔ `|| 1` で書くと既に描き込まれた絵の上へ scenery が湧く) — ?dragonfold=0 側は 1',
    (byA.n4 || {}).density === 0 && (byA.n7 || {}).density === 0 &&
    (byB.n4 || {}).density === 1 && (byB.n7 || {}).density === 1,
    '畳んだ n4=' + (byA.n4 || {}).density + ' n7=' + (byA.n7 || {}).density +
    ' / 旧 n4=' + (byB.n4 || {}).density + ' n7=' + (byB.n7 || {}).density);

  // ── §6 詰み防止 ────────────────────────────────────────────────────────────
  console.log('\n[drv] §6 詰み防止');
  /* (6a) ⚠ **この節には変異が無い (宣言された穴)**。竜は inactive な敵を 1 体も置かないので、
   *   竜側のどんな欠陥でも原理的に赤くならない。⭐ ただし「空集合を測って緑」だけは
   *   母集団ガード (敵が実在する) を同居させて塞いである。 */
  const stuck = [], popPerNode = [];
  for (const id of idsA) {
    const S = await pageA.evaluate(SNAP_FN, id, 'right');
    popPerNode.push(id + ':' + (S.enemies || []).length);
    for (const e of (S.enemies || [])) if (e.alive && e.inactive && !e.passiveNpc) stuck.push(id + ':' + e.type);
  }
  check('6a', '★★畳んだグラフのどのノードにも「生きていて inactive で passiveNpc でない」敵が 1 体も居ない (居ると isNodeSettled が永久 false = クリア不能。砦 #63 の守護者がまさにこれ)。⚠ 母集団ガード = 各ノードに敵が実在する',
    idsA.length > 0 && stuck.length === 0 && popPerNode.every(s => +s.split(':')[1] > 0),
    '⛔該当=' + JSON.stringify(stuck) + ' / 母集団 (ノード:敵の体数)=' + JSON.stringify(popPerNode));
  /* (6b) ⚠⚠⚠ **測る直前にそのノードを撮り直す。** SNAP_FN は resetNodeState / buildNode を
   *   呼ぶので盤面のグローバル状態を書き換える (#63 で実際に踏んだ)。 */
  const unreach = [];
  await pageA.evaluate(SNAP_FN, 'n4', 'right');
  for (const s of slots4) {
    const n = await pageA.evaluate(PATH_FN, hero4.tx, hero4.ty, s[0], s[1]);
    if (!(typeof n === 'number' && n > 0)) unreach.push(['n4', s[2], s[0], s[1], n]);
  }
  const gp = await pageA.evaluate(GATE_PATH_FN, hero4.tx, hero4.ty, (gRight || [0, 0])[0], (gRight || [0, 0])[1]);
  await pageA.evaluate(SNAP_FN, 'n7', 'right');
  for (const s of slots7) {
    const n = await pageA.evaluate(PATH_FN, hero7.tx, hero7.ty, s[0], s[1]);
    if (!(typeof n === 'number' && n > 0)) unreach.push(['n7', s[2], s[0], s[1], n]);
  }
  for (const t of chests7) {
    const n = await pageA.evaluate(PATH_FN, hero7.tx, hero7.ty, t[0], t[1]);
    if (!(typeof n === 'number' && n > 0)) unreach.push(['n7', 'chest', t[0], t[1], n]);
  }
  check('6b', '★★★入場地点から敵・ボス・財宝の全部へ、本番の aStar (4 近傍) で到達できる — n4 / n7 とも (⭐ 竜の寝床は溶岩の堀に囲まれた島なので、ボスをそこへ置くとクリア不能になる)',
    slots4.length > 0 && slots7.length > 0 && chests7.length > 0 && unreach.length === 0,
    'n4 入場=' + JSON.stringify(hero4) + ' 敵 ' + slots4.length + ' 体 / n7 入場=' + JSON.stringify(hero7) +
    ' 敵+ボス ' + slots7.length + ' 体 + 財宝 ' + chests7.length + ' マス / ⛔到達不能=' + JSON.stringify(unreach));
  const stl = await pageA.evaluate(SETTLE_FN, 'n4');
  check('6c', '★★n4 の全敵を倒すと isNodeSettled() が false → true になり、出口の候補に n7 が並ぶ。⭐ 出口ゲートへは本番の aStar で (閉じた扉の手前まで) 実際に歩ける',
    !stl.err && stl.before === false && stl.after === true && stl.killed > 0 &&
    (stl.left || []).length === 0 && stl.drop === false &&
    Array.isArray(stl.opts) && stl.opts.some(o => o.to === 'n7') &&
    !!gp && typeof gp.steps === 'number' && gp.steps > 0,
    stl.err ? ('⛔ ' + JSON.stringify(stl))
      : ('倒す前=' + stl.before + ' 倒した後=' + stl.after + ' 撃破 ' + stl.killed + ' 体 / 残り=' +
         JSON.stringify(stl.left) + ' / findNearestDrop=' + stl.drop +
         ' / 出口候補=' + JSON.stringify(stl.opts) +
         ' / ゲート ' + JSON.stringify(gRight) + ' まで ' + JSON.stringify(gp)));

  // ── §7 撤退 ────────────────────────────────────────────────────────────────
  console.log('\n[drv] §7 撤退スイッチ ?dragonfold=0');
  const wh = (r) => r ? [r[3] - r[1] + 1, r[2] - r[0] + 1] : null;
  const rc4B = (byB.n4 || {}).rect || null, rc7B = (byB.n7 || {}).rect || null;
  const stOld4 = await httpStatus(port, '/assets/room_dragon-lair_n4.jpg');
  const stOld7 = await httpStatus(port, '/assets/room_dragon-lair_n7.jpg');
  const stBig4 = await httpStatus(port, '/assets/room_dragon-lair_n4_map.jpg');
  const stBig7 = await httpStatus(port, '/assets/room_dragon-lair_n7_map.jpg');
  check('7a', '★?dragonfold=0 で ' + (KEEP_IDS.length + DROP_IDS.length) + ' ノードへ戻り、n4 は 7x6 / n7 は 9x6 の小部屋・絵は旧 n4 / n7 に戻る (⭐ rect は旧 tileBounds と同値。撤退先の絵も行き先の大部屋の絵も 200 で引ける)',
    idsB.length === KEEP_IDS.length + DROP_IDS.length && GB.entry === 'n0' &&
    JSON.stringify(wh(rc4B)) === JSON.stringify([7, 6]) &&
    JSON.stringify(wh(rc7B)) === JSON.stringify([9, 6]) &&
    (byB.n4 || {}).paint === 'n4' && (byB.n7 || {}).paint === 'n7' &&
    (byA.n4 || {}).paint === 'n4big' && (byA.n7 || {}).paint === 'n7big' &&
    rectEq(rc4B, (dl.n4 || {}).bounds) && rectEq(rc7B, (dl.n7 || {}).bounds) &&
    stOld4 === 200 && stOld7 === 200 && stBig4 === 200 && stBig7 === 200,
    'nodes=' + idsB.length + ' entry=' + GB.entry +
    ' / 旧 n4 rect=' + JSON.stringify(rc4B) + '(' + (wh(rc4B) || []).join('x') + ') paint=' + (byB.n4 || {}).paint +
    ' tileBounds=' + JSON.stringify((dl.n4 || {}).bounds) +
    ' / 旧 n7 rect=' + JSON.stringify(rc7B) + '(' + (wh(rc7B) || []).join('x') + ') paint=' + (byB.n7 || {}).paint +
    ' / http 旧=' + stOld4 + ',' + stOld7 + ' 新=' + stBig4 + ',' + stBig7);
  check('7b', '★?dragonfold=0 で NODE_EXTRA_SPAWN_KINDS に竜の行が載らず、他 4 シナリオの行はそのまま残る (畳んだ舞台だけが兼務を宣言する)',
    GB.hasDragonKinds === false && !!GB.kindsTable &&
    Object.keys(GB.kindsTable).sort().join(',') === ['bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple'].join(','),
    '旧側の台帳のキー=' + JSON.stringify(Object.keys(GB.kindsTable || {}).sort()) +
    ' / 畳んだ側=' + JSON.stringify(Object.keys(GA.kindsTable || {}).sort()));

  // ── §8 恒等 (非退行) ───────────────────────────────────────────────────────
  console.log('\n[drv] §8 恒等 (他 5 シナリオを 1 ビットも触っていないか)');
  const oA = GA.others || {}, oB = GB.others || {};
  const diffScen = OTHER_SCENS.filter(s => oA[s] !== oB[s] || !oA[s]);
  const distinct = new Set(OTHER_SCENS.map(s => oA[s])).size;
  check('8a', '★他 5 シナリオのグラフ (mapDef 全文) が ?dragonfold=0 の腕と 1 ビットも変わらない (⭐ 5 本が相互に異なる = 同じ物を 5 回測っていない)',
    diffScen.length === 0 && distinct === OTHER_SCENS.length,
    '差分=' + JSON.stringify(diffScen) + ' 相互に異なる=' + distinct + '/' + OTHER_SCENS.length +
    ' hash=' + JSON.stringify(oA));
  /* (8a2) ⭐⭐⭐ 依頼書 §8 は (8a) を「hoard を無条件に生やしていないことの検査でもある」と
   *   書いていたが、⚠⚠⚠ **両立しない** —— 無条件に生やす欠陥は両腕へ等しく効くので差が出ず、
   *   (8a) は緑のまま素通しする (#44 の「恒等 assert は片方のアームだけを壊す変更でしか
   *   赤くならない」)。⇒ **絶対量**で測る節をここに置く。変異 hoardnull がこれで赤くなる。 */
  const scanA = (GA.hoardScan || []).slice().sort();
  const scanB = (GB.hoardScan || []).slice().sort();
  check('8a2', '★★★`hoard` キーを持つ mapDef が 6 シナリオ全ノードを走査して**畳んだ竜の n7 ただ 1 つ**で、?dragonfold=0 の腕では 0 件 (= p6Node が渡されたときだけキーを生やしている)。⭐ 依頼書 §2-2 の罠 (全 mapDef に hoard:null が生えて driver_grid_s2 §8 の golden が一斉に赤くなる) の番人',
    scanA.length === 1 && scanA[0] === THEME + '/n7' && scanB.length === 0,
    '畳んだ腕=' + JSON.stringify(scanA) + ' (' + scanA.length + ' 件) / ?dragonfold=0 の腕=' +
    JSON.stringify(scanB) + ' (' + scanB.length + ' 件) / 走査した舞台=' + JSON.stringify(ALL_SCENS));

  await pageA.close(); await pageB.close();
  return { results: R, errs: errs };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_dragonfold_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile] });
  const servers = [];
  let exitCode = 0;
  try {
    if (flag('negative')) {
      const srv0 = await startServer(PORT, null); servers.push(srv0);
      console.log('\n════ 素の 1 本 (基準) ════');
      const baseRun = await runSuite(browser, PORT, '(素)');
      const baseFail = baseRun.results.filter(r => !r.ok).map(r => r.id);
      if (baseFail.length) {
        console.log('\n⛔ 素の実行で FAIL がある (' + baseFail.join(',') + ') — 先にそれを直すこと');
        exitCode = 1;
      }
      const only = (arg('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
      const order = only.length ? MUT_ORDER.filter(k => only.indexOf(k) >= 0) : MUT_ORDER;
      const report = [];
      for (let i = 0; i < order.length; i++) {
        const key = order[i], port = PORT + 1 + MUT_ORDER.indexOf(key);
        const srv = await startServer(port, key); servers.push(srv);
        console.log('\n════ 変異 ' + key + ' (port ' + port + ') ════');
        let failed = [];
        try {
          const run = await runSuite(browser, port, '[変異 ' + key + ']');
          failed = run.results.filter(r => !r.ok).map(r => r.id);
        } catch (e) {
          /* ⭐ 変異でドライバ自身が落ちるのも「検出できた」= 期待どおり。理由を必ず出す。 */
          failed = ['THREW'];
          console.log('  (変異でドライバが例外: ' + String(e && e.message || e) + ')');
        }
        const want = MUT_EXPECT[key] || [];
        const hit = want.filter(id => failed.indexOf(id) >= 0);
        /* ⚠⚠⚠ 「何かが赤くなった」で満足しない。**期待した節が赤くなったか**まで見る
         *   (#53 の MUT_EXPECT。素は緑のまま変異だけ空振り、という型をここで捕まえる)。 */
        const ok = hit.length > 0 || failed.indexOf('THREW') >= 0;
        report.push({ key: key, want: want, failed: failed, hit: hit, ok: ok });
        console.log('  ⇒ 変異 ' + key + ': 期待 ' + JSON.stringify(want) + ' / 実際に赤 ' + JSON.stringify(failed) +
                    ' / 命中 ' + JSON.stringify(hit) + ' → ' + (ok ? 'OK (検出できた)' : '⛔ 空振り'));
        if (!ok) exitCode = 1;
      }
      console.log('\n════════════════════════════════════════');
      console.log('  負のコントロール ' + report.filter(r => r.ok).length + ' / ' + report.length + ' が検出成功');
      for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key +
        '  期待 ' + JSON.stringify(r.want) + ' / 赤 ' + JSON.stringify(r.failed));
      console.log('════════════════════════════════════════');
    } else {
      const srv = await startServer(PORT, MUTATE); servers.push(srv);
      const run = await runSuite(browser, PORT, MUTATE ? '[変異 ' + MUTATE + ']' : '');
      const okN = run.results.filter(r => r.ok).length, ngN = run.results.length - okN;
      console.log('\n[drv] 例外 / console.error·warning = ' + run.errs.length +
                  (run.errs.length ? ' ' + JSON.stringify(run.errs.slice(0, 4)) : ''));
      console.log('\n════════════════════════════════════════');
      console.log('  PASS ' + okN + ' / FAIL ' + ngN + (MUTATE ? '   [変異 ' + MUTATE + ']' : ''));
      if (ngN) {
        console.log('  --- FAIL 一覧 ---');
        for (const r of run.results) if (!r.ok) console.log('   ・(' + r.id + ') ' + r.name + (r.detail ? '  — ' + r.detail : ''));
      }
      console.log('════════════════════════════════════════');
      if (ngN && !MUTATE) exitCode = 1;
    }
  } catch (e) {
    console.error('[drv] 例外: ' + ((e && e.stack) || e));
    exitCode = 3;
  } finally {
    await browser.close().catch(() => {});
    servers.forEach(s => { try { s.close(); } catch (e) {} });
  }
  process.exit(exitCode);
})();
