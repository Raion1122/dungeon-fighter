#!/usr/bin/env node
/*
 * verify_bolt_bounce.js — 実装依頼書 #71「ライトニングボルトの壁反射 + 候補の向きを全既約方向へ」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_bolt_bounce.js                  # 素 (合成盤面だけ。実プレイは回さない)
 *   node tools/verify_bolt_bounce.js --negative       # 変異 8 本 (port 10372〜10379)
 *   node tools/verify_bolt_bounce.js --mutate nobounce   # 変異を 1 本だけ載せて手回し
 *   node tools/verify_bolt_bounce.js --negative --only nobounce,bounce2
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り / 2=環境不足 / 3=変異アンカーの腐敗
 *
 * ■ 方針 (依頼書 §8) — **合成盤面で決定論的に固める。⛔ 実プレイの率は測らない**
 *   (#68 の教訓 = 率の閾値は重み付けの書き方ひとつで動く。素の腕の統計的カバレッジは
 *    verify_bolt_aim が (1f)(2b) で持っているので、この本は**仕込んだ盤面での因果**に徹する)。
 *   ⇒ 実プレイを 1 走行も回さないので **素 1 回が 20 秒前後**で終わる。
 *
 * ■ ⚠⚠⚠ 2 つの柱は「もう片方を止めた腕」で測る (依頼書 §8 冒頭)
 *   §1 候補の向き … **?boltbounce=0 を付けた腕**で測る (反射で救われて緑になるのを防ぐ)
 *   §2 反射       … **?boltrays=0 を付けた腕**で測る (候補の広がりで救われて緑になるのを防ぐ)
 *   §3 描画 / §4 恒等 … ここだけ両方を生かしてよい
 *
 * ■ ⭐⭐⭐ 2 経路目 = ドライバの独立再計算 (oracleBolt / oracleWalk)
 *   本番の boltLineTiles / boltAimRays / hasLineOfSight / enemiesInArea / partyInArea を **1 つも呼ばない**。
 *   ページから持ち帰るのは盤面の生データだけ (術者と敵のタイル / 交戦中の添字 / isTileWall の 27x27 の写し /
 *   味方のタイル / 宣言射程)。直線・視線・反射は Node 側で仕様だけから引き直す。
 *   ⭐ verify_bolt_aim.js の oracleBolt (#71 項目3 で再ベース済) からの流用。持ってきた肝は 1 行:
 *     **count は重複込み** (本番の bestCount = lineIdxs.length) / **hit は Set** (本番の lineEnemyIdxs)。
 *     ⚠ ここを揃えないと「反射で同じマスを 2 度通る」盤面で 1 件ずつ外れる。
 *   ⛔ mode 'legacy' (?boltaim=0 = #68 以前の 8 方向 3 マス) の枝は写していない。この本は
 *     ?boltaim=0 の腕を 1 つも開かないため (その腕の番人は verify_bolt_aim の (0d)(4a)(4b))。
 *
 * ■ ⭐⭐⭐ 闘技場 = 原点から ±12 マスを掘り抜いた完全な平地 (⛔ 自然の壁に頼らない)
 *   verify_bolt_aim の盤面は x -2..13 / y -2..3 しか掘らないため、**掘った矩形の外の自然壁で跳ね返る**
 *   (#71 項目3 の実測。「この盤面に壁は無い」は「反射は起きない」ではない)。
 *   本チケットは反射そのものを測るので、跳ね返る壁を 1 枚ずつこちらで置けないと因果が立たない。
 *   ⇒ **±12 を全部床にしてから、盤面ごとに壁を置く**。
 *   ⭐ ±12 の根拠 = 反射 1 回の列が触れる最大チェビシェフ距離。
 *     列に積むマスは L=10 個、壁に当たって積まなかった歩みが最大 2 歩 (折れる 1 + 打ち切る 1) ⇒ 12。
 *     盤面の写し (snap.walls) は **R=13** で採るので、再計算器が写しの外を引くことは無い。
 *
 * ■ ⚠ 計測機構 (verify_bolt_aim.js の写し)
 *   - 編成と装備は evaluateOnNewDocument で仕込み、**index.html?diag=1 へ直接入る**。
 *     ⛔ 酒場 (tavern.html) 経由で編成を仕込まない (openPrep が冒頭で regeneratePartyMembers() を
 *     無条件に呼ぶので、開く前に仕込んだ顔ぶれは消える = #70 項目4 の申し送り)。
 *   - ⚠⚠⚠ 不発の盤面で CDP が 240 秒ハングする。不発 → allyBasicAttack → 射程外なら
 *     allyAdvanceTowardPoint の rAF が背景タブで止まる ⇒ 両方を即解決スタブに差し替える
 *     (noteAoeOutcome は不発判定の前に記録済みなので計数に影響しない)。
 *   - ⚠ classic script 直下の let/const は window に載らない → 裸の識別子で読む
 *     (enemies / allies / encounterEnemyIndices / BOLT_RAYS_ON / BOLT_BOUNCE_ON / BOLT_MAX_BOUNCE / AOE_COVER_ON)。
 *     function 宣言は window に載るので allyLightningBolt / boltLineTiles / spawnLightningBoltPath は差し替えられる。
 *   - ⚠⚠ http.Server#close() は Chrome の先読み接続を待って長く止まる ⇒ 閉じる前に closeAllConnections()。
 *   - ⛔ このドライバを timeout コマンドで包まない (打ち切ると node が孤児としてポートを掴む)。
 *
 * ■ ⭐⭐⭐ (0d)「呼ばれた / 在る」で緑にしない — 値まで見る
 *   観測先 (__paths 頂点列 / __lines 候補ごとのマス列 / __svgs / __pops / __aoeStats) は
 *   **測る直前に window.__vbb.clear() で空へ戻し**、その戻り値 (= 全部 0) を毎回持ち帰る。
 *   書けるのは本番の口だけ ⇒ 「前の節が残した値」で緑になる事故 (#70 の noprefix 空振り) を防ぐ。
 *
 * ■ ⚠⚠ 依頼書 §8 から変えた点 (⭐ どれも期待値を弱めていない。理由は各 assert の本文に 1 行ずつ書いた)
 *   (1a) … §8 の文面「敵へ真っ直ぐは壁で止まるが、隣の既約方向なら当たる」は **撤退腕に候補が立つ形では
 *          原理的に作れない**(実測: 1 体 + 壁 1 枚の 17x10x9x9 通りを全探索して 0 件)。
 *          #68 の候補生成は「視線が通る敵」しか採らず、視線 (hasLineOfSight) も弾 (boltLineTiles) も
 *          同じ Bresenham なので「視線は通るのに弾は壁で止まる」が起きない。
 *          ⇒ 実際の救済の形 (項目2a の実測: 不発 43 件は例外なく旧 boltAimRays の戻りが **0 本**) に合わせ、
 *            「撤退腕は候補 0 本で不発 / 素腕は 256 本の中の迂回する筋で当てる」を測る。**候補数も導出して見る**。
 *   (2a) … §8 どおり「素は被弾 1 体・?boltbounce=0 は不発」。ただし #68 の候補は敵からしか生えないので、
 *          種になる敵 (inactive = 巻き込み対象外) と的になる敵 (非 encounter) を別に置いて初めて成立する。
 *   (1b) … 「3 回開いて」を「同じページで 3 回撃って」に読み替えた (ページ生成時に 1 度だけ引く乱数も
 *          **候補の並びを Node 側で導出した正準列と突き合わせる**ので捕まる = 経路は減っていない)。
 *
 * ■ ポート = **10371** (素) / 変異 **10372〜10379** (8 本)。
 *   ⚠ #71 の項目2a/2b のプローブが 10381 / 10382 / 10383 を使った。10371〜10380 は無傷 (項目3 の実測)。
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
const PORT = parseInt(arg('port', '10371'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結 = 走行中に別窓が保存しても混合ビルドにならない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const SRC_FILES = ['index.html'];
const PRISTINE = {};
for (const f of SRC_FILES) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (負のコントロール)
 *   scope = 注入点が属する範囲の **先頭行** (逐語・行末の \r を除く)。範囲の終わりは先頭行の形から決める:
 *     `{` で終わる → 同じ字下げの `}` / `[` で終わる → 同じ字下げの `];` / `=` で終わる → 次の `;` で終わる行。
 *   from = 範囲の中で **ちょうど 1 行** 一致すべき行 (逐語)。to = 置き換える 1 行。
 *   ⚠⚠⚠ 逐語は **#71 実装後 (HEAD 35ccb0c)** で取り直したもの。依頼書 §8 の表は eaa0626 時点の姿。
 * ══════════════════════════════════════════════════════════════════════════════ */
const FN_BOLT = '    async function allyLightningBolt(ally, enemyIdx) {';
const FN_LINE = '    function boltLineTiles(aTX, aTY, dx, dy, L, stopAtWall, maxBounces) {';
const FN_RAYS = '    function boltAimRays(aCX, aCY, L) {';
const MUTATIONS = {
  /* 柱1 を殺す: 候補を #68 の姿 (敵へ向けたベクトル + 視線) へ戻す。 */
  raysnarrow: { file: 'index.html', scope: FN_RAYS,
    from: '      if (BOLT_RAYS_ON) {',
    to:   '      if (false) {   /* ★変異raysnarrow */' },
  /* 柱2 を殺す: 呼び口で反射回数を 0 に固定する。 */
  nobounce: { file: 'index.html', scope: FN_BOLT,
    from: '                                    BOLT_BOUNCE_ON ? BOLT_MAX_BOUNCE : 0);',
    to:   '                                    0);   /* ★変異nobounce */' },
  /* 反射を 2 回まで許す (依頼書 §5-3「反射は 1 回まで」を破る)。 */
  bounce2: { file: 'index.html', scope: FN_LINE,
    from: '      const maxB = maxBounces > 0 ? maxBounces : 0;',
    to:   '      const maxB = maxBounces > 0 ? 2 : 0;   /* ★変異bounce2 */' },
  /* ⭐⭐⭐ 依頼書 §2-7 の罠を機械で検査する変異 = **反射回数を stopAtWall から導出させる**。
   * ⛔ 「第 6 引数 stopAtWall を false にする」型 (verify_bolt_aim の nowall) にしてはいけない:
   *   本番の反射は **第 7 引数**で足されていて stopAtWall の意味は 1 ミリも変わっていないので、
   *   stopAtWall=false にすると「壁で止まらない」と「反射しない」が同時に起きて nowall と見分けがつかない。
   *   ⇒ こちらは stopAtWall の値はそのまま使い、**maxBounces 引数を無視して stopAtWall から maxB を作る**。
   *     素の腕は 1 マスも変わらないが、**?boltbounce=0 と両方 0 の腕が勝手に跳ね返る** ⇒ 恒等 (4a) が割れる。 */
  stopwallgone: { file: 'index.html', scope: FN_LINE,
    from: '      const maxB = maxBounces > 0 ? maxBounces : 0;',
    to:   '      const maxB = stopAtWall ? 1 : 0;   /* ★変異stopwallgone */' },
  /* 反射したら残りの長さを減らさない = 射程が伸びる (依頼書 §2-4 を破る)。 */
  lenextend: { file: 'index.html', scope: FN_LINE,
    from: '        curX = px; curY = py;',
    to:   '        curX = px; curY = py; L += 5;   /* ★変異lenextend */' },
  /* 描画の頂点列を始点と終点だけに畳む (折れ点を渡さない)。 */
  polystale: { file: 'index.html', scope: FN_BOLT,
    from: '      for (const b of (best.tiles.bends || [])) {',
    to:   '      for (const b of []) {   /* ★変異polystale */' },
  /* 候補の並びをシャッフルする (依頼書 §5-2「並びを固定・乱数を引かない」を破る)。 */
  rngdir: { file: 'index.html', scope: FN_RAYS,
    from: '        return rays;',
    to:   '        return rays.slice().sort(function () { return Math.random() - 0.5; });   /* ★変異rngdir */' },
  /* 撤退スイッチ ?boltbounce=0 の判定を常に真にする (撤退路が死ぬ)。 */
  switchdead: { file: 'index.html', scope: '    const BOLT_BOUNCE_ON =',
    from: '      new URLSearchParams(window.location.search).get("boltbounce") !== "0";',
    to:   '      true;   /* ★変異switchdead */' },
};
/* 変異 → 赤くなるべき assert (担当)。
 * ⚠⚠⚠ 机上で書かない。**1 本ずつ --mutate で実走し、実際に赤くなった集合を見て決めた** (2026-09-20)。
 *   巻き添えで赤くなったものも下に残す (担当は「その変異を名指しで捕まえる 1 本」に絞る)。
 * ── 2026-09-20 の実走 (素 15/15 の上・`--mutate <key>` を 8 本) で実際に赤くなった集合 ──
 *   raysnarrow   … (0a)(1a)(1b)(3b)(2c)(4b)   ⚠ (0a) は巻き添え = 候補が 0 本になるので
 *                                               boltLineTiles が 1 度も呼ばれず「候補 ≥ 1」が落ちる
 *   nobounce     … (2a)(2b)(3a)(3b)(2c)(4b)   ⭐ 反射が全部死ぬので描画も恒等の絶対量も一緒に落ちる
 *   bounce2      … (2b)                        ⭐ 最も鋭い (素の腕は 1 マスも変わらず (2b) だけが見分ける)
 *   stopwallgone … (2a)(4a)
 *   lenextend    … (3a)(2c)
 *   polystale    … (3a)(3b)
 *   rngdir       … (1b)                        ⭐ 最も鋭い (採用の結果は同じでも並びが揺れる)
 *   switchdead   … (0a)(2a)(4a)                ⚠ (0a) は判定の行そのものを消すので巻き添え
 * ⭐ stopwallgone と switchdead は署名が同じ ((2a)(4a)) = どちらも「?boltbounce=0 の腕が勝手に跳ね返る」。
 *   ⛔ だからといって片方を外さない: 直し方が違う (前者は boltLineTiles の実装・後者は撤退スイッチの判定)。
 */
const NEG_EXPECT = {
  raysnarrow:   ['(1a)'],
  nobounce:     ['(2a)'],
  bounce2:      ['(2b)'],
  stopwallgone: ['(4a)'],
  lenextend:    ['(2c)'],
  polystale:    ['(3b)'],
  rngdir:       ['(1b)'],
  switchdead:   ['(4a)'],
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
  console.log('   ' + (a.ok ? 'OK ' : '⛔ ') + a.key.padEnd(13) + ' ' + a.file + ':' + a.line
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
function pageSnapHelper() {
  window.__vbbSnap = function (ally) {
    const T = TILE_SIZE;
    const aCX = ally.x + ally.def.displaySize / 2, aCY = ally.y + ally.def.displaySize / 2;
    const m = { tx: Math.floor(aCX / T), ty: Math.floor(aCY / T) };
    const R = 13;   // ⭐ 反射 1 回の列が触れる最大チェビシェフ (12) + 1
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
    return { m: m, aCX: aCX, aCY: aCY, T: T, R: R, walls: walls, foes: foes,
      enc: encounterEnemyIndices.slice(), party: party, L: getRange(skill.range).tiles,
      aoeCover: AOE_COVER_ON,
      boltAim: (typeof BOLT_AIM_ON !== 'undefined') ? BOLT_AIM_ON : null,
      boltRays: (typeof BOLT_RAYS_ON !== 'undefined') ? BOLT_RAYS_ON : null,
      boltBounce: (typeof BOLT_BOUNCE_ON !== 'undefined') ? BOLT_BOUNCE_ON : null,
      maxBounce: (typeof BOLT_MAX_BOUNCE !== 'undefined') ? BOLT_MAX_BOUNCE : null,
      key: skill.name };
  };
}
/* 合成盤面の据え付け (verify_bolt_aim の pageBoard の写し + ±12 闘技場 + 観測口 4 本)。 */
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

  /* ── 観測口 (⭐ 値を採るだけ。判定はしない) ─────────────────────────────── */
  window.__paths = [];   // spawnLightningBoltPath に渡った頂点列
  window.__svgs = [];    // その呼び出しで生まれた SVG の width / height
  window.__lines = [];   // boltLineTiles の呼び出しごとの (向き・引数・返ったマス列・折れ点)
  window.__pops = [];    // 吹き出しの文言
  const _sp = window.spawnLightningBoltPath;
  window.spawnLightningBoltPath = function (pts) {
    try { window.__paths.push((pts || []).map(function (p) { return { x: p.x, y: p.y }; })); } catch (e) {}
    let n0 = 0;
    try { n0 = document.querySelectorAll('.fxLightningSvg').length; } catch (e) {}
    const r = _sp.apply(null, arguments);
    try {
      const all = document.querySelectorAll('.fxLightningSvg');
      if (all.length > n0) {
        const el = all[all.length - 1];
        window.__svgs.push({ w: parseFloat(el.getAttribute('width')), h: parseFloat(el.getAttribute('height')) });
      } else window.__svgs.push(null);
    } catch (e) { window.__svgs.push(null); }
    return r;
  };
  const _blt = window.boltLineTiles;
  window.boltLineTiles = function (aTX, aTY, dx, dy, L, stopAtWall, maxBounces) {
    const r = _blt.apply(null, arguments);
    try {
      const tl = []; for (const t of r) tl.push([t.tx, t.ty]);
      const bd = []; for (const b of (r.bends || [])) bd.push([b.tx, b.ty]);
      window.__lines.push({ d: [dx, dy], L: L, stop: !!stopAtWall, mb: (maxBounces | 0), t: tl, b: bd });
    } catch (e) {}
    return r;
  };
  try {
    new MutationObserver(function (muts) {
      for (const mu of muts) for (const n of mu.addedNodes)
        if (n.nodeType === 1 && n.classList && n.classList.contains('rollPop')) window.__pops.push(n.textContent);
    }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  /* ── ±12 闘技場 (⭐ 自然の壁に頼らない。掘った矩形の外の壁で跳ね返る事故を根から消す) ── */
  const T = TILE_SIZE;
  const H = 12;
  const blockedIn = (ox, oy) => {
    let n = 0;
    for (let y = oy - H; y <= oy + H; y++) for (let x = ox - H; x <= ox + H; x++) if (isTileWall(x, y)) n++;
    return n;
  };
  const doorsIn = (ox, oy) => {
    if (typeof isDoorBlocking !== 'function') return 0;
    let n = 0;
    for (let y = oy - H; y <= oy + H; y++) for (let x = ox - H; x <= ox + H; x++) if (isDoorBlocking(x, y)) n++;
    return n;
  };
  let org = null, tried = 0;
  /* 扉は mapData を 0 にしても塞いだままなので、**扉が 1 枚も無い原点**を先に選ぶ (⛔ 扉の state を触らない)。 */
  for (let y = 1 + H; y <= MAP_H - 2 - H && !org; y++)
    for (let x = 1 + H; x <= MAP_W - 2 - H && !org; x++) { tried++; if (doorsIn(x, y) === 0) org = { x: x, y: y }; }
  let carvedN = 0;
  if (org) {
    for (let y = org.y - H; y <= org.y + H; y++) for (let x = org.x - H; x <= org.x + H; x++) {
      if (mapData[y][x] !== 0) carvedN++;
      mapData[y][x] = 0;
      try { obstacleTileMask[y * MAP_W + x] = 0; } catch (e) {}
    }
  }
  const setUnit = (u, tx, ty) => {
    const s = (u.def && u.def.displaySize) || 96;
    u.x = tx * T + T / 2 - s / 2; u.y = ty * T + T / 2 - s / 2;
  };
  const mageOf = () => allies.find((a) => a.classKey === 'mage');
  window.__vbb = {
    /* ⭐⭐⭐ (0d) 測る直前に観測先を空へ戻す。戻り値 (= 全部 0) を毎回 Node へ持ち帰る。 */
    clear: function () {
      window.__paths.length = 0; window.__svgs.length = 0; window.__lines.length = 0;
      window.__pops.length = 0; window.__basic = 0; window.__aoeStats = {};
      return { paths: window.__paths.length, svgs: window.__svgs.length, lines: window.__lines.length,
        pops: window.__pops.length, basic: window.__basic, stats: Object.keys(window.__aoeStats).length };
    },
    run: async function (spec) {
      for (const e of enemies) { e.alive = false; e.hp = 0; e.inactive = false; }
      for (const a of allies) { a.alive = true; a.hp = a.maxHp; a.x = -999999; a.y = -999999; }
      const m = mageOf();
      setUnit(m, org.x, org.y);
      const h = spec.hero || [-11, -11];
      snapPlayerToTile(org.x + h[0], org.y + h[1]);
      const saved = [];
      for (const w of (spec.walls || [])) {
        const x = org.x + w[0], y = org.y + w[1];
        saved.push([x, y, mapData[y][x]]); mapData[y][x] = 2;
      }
      const made = [], enc = [];
      for (const f of spec.foes) {
        const idx = enemies.length;
        const e = createEnemy('goblin', org.x + f.p[0], org.y + f.p[1]);
        enemies.push(e); createEnemyDom(idx, e.def, e.type);
        e.alive = true; e.maxHp = 400; e.hp = 400; e.stunned = 0;
        e.inactive = !!f.inactive;
        made.push(idx); if (f.enc !== false) enc.push(idx);
      }
      encounterEnemyIndices = enc.slice();
      const pre = window.__vbb.clear();
      const arena = { blocked: blockedIn(org.x, org.y), walls: (spec.walls || []).length };
      const key = MAGE_SKILLS['lightning-bolt'].name;
      const before = made.map((i) => enemies[i].hp);
      let snap = null, snapErr = null, err = null;
      try { snap = window.__vbbSnap(m); } catch (e) { snapErr = String((e && e.message) || e); }
      try { await window.allyLightningBolt(m, made[0]); } catch (e) { err = String((e && e.message) || e); }
      const st = (window.__aoeStats || {})[key] || null;
      const hit = made.filter((i, k) => before[k] - enemies[i].hp > 0);
      for (const s of saved) mapData[s[1]][s[0]] = s[2];
      for (const i of made) { enemies[i].alive = false; enemies[i].hp = 0; enemies[i].inactive = false; }
      return { err: err, snapErr: snapErr, key: key, pre: pre, arena: arena,
        stats: st ? { attempts: st.attempts, cast: st.cast, demoted: st.demoted } : null,
        made: made, enc: enc, hit: hit, snap: snap,
        paths: window.__paths.slice(), svgs: window.__svgs.slice(), lines: window.__lines.slice(),
        pops: window.__pops.slice(), basic: window.__basic };
    },
  };
  return { org: org, carvedN: carvedN, tried: tried, H: H,
    blockedAfter: org ? blockedIn(org.x, org.y) : null,
    MAP_W: MAP_W, MAP_H: MAP_H, T: T,
    title: document.title, hasPhase: !!document.getElementById('phaseText'),
    nodes: document.getElementsByTagName('*').length,
    boltAim: (typeof BOLT_AIM_ON !== 'undefined') ? BOLT_AIM_ON : null,
    boltRays: (typeof BOLT_RAYS_ON !== 'undefined') ? BOLT_RAYS_ON : null,
    boltBounce: (typeof BOLT_BOUNCE_ON !== 'undefined') ? BOLT_BOUNCE_ON : null,
    maxBounce: (typeof BOLT_MAX_BOUNCE !== 'undefined') ? BOLT_MAX_BOUNCE : null,
    cover: (typeof AOE_COVER_ON !== 'undefined') ? AOE_COVER_ON : null,
    L: getRange(MAGE_SKILLS['lightning-bolt'].range).tiles,
    fnBolt: typeof window.allyLightningBolt, fnLine: typeof window.boltLineTiles,
    fnRays: typeof window.boltAimRays, fnPath: typeof window.spawnLightningBoltPath };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ⭐⭐⭐ 独立再計算器 — 仕様だけから書く (本番のヘルパーを 1 つも呼ばない)
 *   verify_bolt_aim.js の oracleBolt (#71 項目3 で #71 仕様へ再ベース済) からの流用。
 *   oracleBolt(s, opts) … opts = { rays: true|false, bounce: <回数> }
 *     rays: true  (#71 柱1) … 候補 = 射程内の全既約整数方向 (|dx| ≤ L / |dy| ≤ L / gcd = 1。L=10 で 256 本)。
 *                             **並びは dy 昇順 → dx 昇順**。敵も視線も見ない。
 *     rays: false (#68)     … 候補 = 交戦中・生存・非護衛・チェビシェフ ≤ L・視線が通る敵への
 *                             既約ベクトル (交戦順・重複除去)。⇒ 撤退 ?boltrays=0 の腕。
 *     bounce: 1   (#71 柱2) … 壁で 1 回まで反射。横だけ変わるステップで壁なら dx 反転 /
 *                             縦だけなら dy 反転 / 斜めなら横隣が壁で dx・縦隣が壁で dy・
 *                             どちらも壁でない (角) なら両方反転。**長さは歩いたマス数**。
 *     bounce: 0             … 壁の手前で止まる (⇒ 撤退 ?boltbounce=0 の腕)。
 *   共通: 列の途中に味方が居れば AOE_COVER_ON が偽のときだけ捨てる / 数えるのは非 inactive・非護衛の生存敵 /
 *         採用 = 敵数が最大 (同数は先勝ち) / 成否 = 最大が 1 以上。
 *         ⭐ 敵数は**重複込み**で数える (反射で同じマスを 2 度通ると本番の lineIdxs も 2 回積む) が、
 *           被弾集合は Set で潰す (本番の lineEnemyIdxs が Set)。⚠ ここを揃えないと反射盤面で 1 件ずつ外れる。
 * ══════════════════════════════════════════════════════════════════════════════ */
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
/* 1 本の向きの歩き方。返りは { tiles, bends }。⭐ 長さは「歩いたマス数」で数える
 * (⛔ 起点からのチェビシェフ距離だと折り返しで永遠に止まらない)。 */
function oracleWalk(s, G, d, L, maxB) {
  const mx = s.m.tx, my = s.m.ty;
  const wall = G.wall;
  const tiles = [], bends = [];
  const k = Math.max(Math.abs(d[0]), Math.abs(d[1]));
  if (!(k > 0) || !(L > 0)) return { tiles: tiles, bends: bends };
  let curX = mx, curY = my, ddx = d[0], ddy = d[1];
  let bounces = 0, guard = 0;
  while (tiles.length < L && guard < 64) {
    guard++;
    const m = Math.ceil((L - tiles.length) / k);
    const ex = curX + ddx * m, ey = curY + ddy * m;
    const adx = Math.abs(ex - curX), ady = Math.abs(ey - curY);
    const sx = curX < ex ? 1 : -1, sy = curY < ey ? 1 : -1;
    let err = adx - ady;
    let tx = curX, ty = curY, px = curX, py = curY;
    let xch = false, ych = false, hitWall = false;
    while ((tx !== ex || ty !== ey) && tiles.length < L) {
      px = tx; py = ty;
      const e2 = 2 * err;
      if (e2 > -ady) { err -= ady; tx += sx; }
      if (e2 < adx) { err += adx; ty += sy; }
      xch = (tx !== px); ych = (ty !== py);
      if (wall(tx, ty)) { hitWall = true; break; }   // 素は常に壁で止める (本番の stopAtWall = BOLT_AIM_ON = true)
      tiles.push([tx, ty]);
    }
    if (!hitWall) break;
    if (bounces >= maxB) break;
    if (xch && !ych) { ddx = -ddx; }
    else if (ych && !xch) { ddy = -ddy; }
    else {
      const wallX = wall(tx, py);   // 横隣
      const wallY = wall(px, ty);   // 縦隣
      if (wallX) ddx = -ddx;
      if (wallY) ddy = -ddy;
      if (!wallX && !wallY) { ddx = -ddx; ddy = -ddy; }
    }
    bounces++;
    curX = px; curY = py;
    bends.push([px, py]);
  }
  return { tiles: tiles, bends: bends };
}
/* ⭐ 候補の正準列 = 依頼書 §5-2「dy 昇順 → dx 昇順」。(1b) の期待値はこれを L から導出する。 */
function raysCanonical(L) {
  const rays = [];
  for (let dy = -L; dy <= L; dy++) for (let dx = -L; dx <= L; dx++) {
    if (dx === 0 && dy === 0) continue;
    if (gcd(dx, dy) !== 1) continue;
    rays.push([dx, dy]);
  }
  return rays;
}
function oracleRays(s, G, raysAll, L) {
  if (raysAll) return raysCanonical(L);
  const mx = s.m.tx, my = s.m.ty;
  const byI = new Map(s.foes.map((f) => [f.i, f]));
  const seen = new Set(), rays = [];
  for (const i of s.enc) {
    const f = byI.get(i);
    if (!f || f.escort) continue;               // foes は生存だけを採ってある
    if (G.cheb(f.tx, f.ty) > L) continue;
    if (!G.los(f.tx, f.ty)) continue;
    let dx = f.tx - mx, dy = f.ty - my;
    if (dx === 0 && dy === 0) continue;
    const g = gcd(dx, dy); dx /= g; dy /= g;
    const k = dx + ',' + dy;
    if (seen.has(k)) continue;
    seen.add(k); rays.push([dx, dy]);
  }
  return rays;
}
function oracleBolt(s, opts) {
  const o = opts || {};
  const raysAll = (o.rays === undefined) ? true : !!o.rays;              // #71 柱1 (既定 = 素)
  const maxB = (o.bounce === undefined) ? 1 : (o.bounce | 0);            // #71 柱2 (既定 = 素)
  const L = s.L;
  const G = geoOf(s);
  const rays = oracleRays(s, G, raysAll, L);
  const live = s.foes.filter((f) => !f.inactive && !f.escort);
  let best = null, bestCount = 0;
  for (const d of rays) {
    const ln = oracleWalk(s, G, d, L, maxB);
    let blocked = false, cnt = 0;
    const idx = [];
    for (const t of ln.tiles) {
      if (!s.aoeCover && s.party.some((p) => p.tx === t[0] && p.ty === t[1])) { blocked = true; break; }
      for (const f of live) if (f.tx === t[0] && f.ty === t[1]) { cnt++; idx.push(f.i); }
    }
    if (blocked) continue;
    if (cnt > bestCount) { best = { d: d, tiles: ln.tiles, bends: ln.bends, idx: idx }; bestCount = cnt; }
  }
  /* ⭐ count は重複込み (本番の bestCount = lineIdxs.length) / hit は Set (本番の lineEnemyIdxs)。 */
  return { ok: bestCount > 0, count: bestCount, rays: rays.length, oob: G.oob,
    hit: best ? Array.from(new Set(best.idx)).sort((a, b) => a - b) : [],
    last: (best && best.tiles.length) ? best.tiles[best.tiles.length - 1] : null,
    tiles: best ? best.tiles.slice() : [],
    bends: best ? best.bends.slice() : [], dir: best ? best.d : null, L: L };
}
const sameSet = (a, b) => JSON.stringify((a || []).slice().sort((x, y) => x - y)) === JSON.stringify((b || []).slice().sort((x, y) => x - y));
const sameTiles = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

/* ══════════════════════════════════════════════════════════════════════════════
 * 合成盤面 (すべて術者からの相対 [dx, dy]。±12 は全部床なので**壁はここに書いたものだけ**)
 *   foes[].p = 位置 / foes[].inactive = 巻き込み対象外 (enemiesInArea が飛ばす) /
 *   foes[].enc = false なら encounterEnemyIndices に入れない (#68 の候補の種にならない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const BOARD_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
];
const B = {
  /* (1a)(1b) 敵 (6,3) / 壁 (3,1)。#68 の候補は視線が切れて **0 本** (⇒ 撤退腕は不発)。
   *   #71 の 256 本には壁を迂回して (6,3) を貫く筋 (7,4) がある。⭐ 反射は 1 度も起きない (折れ点 0)。 */
  aim1:  { foes: [{ p: [6, 3] }], walls: [[3, 1]] },
  /* (2a) 種 A (3,0) は inactive = 巻き込み対象外 / 壁 (4,0) / 的 B (-3,0) は非 encounter。
   *   #68 の候補は A への (1,0) の 1 本だけ。反射なしでは誰にも当たらず不発、
   *   反射ありなら (3,0) で折り返して術者の後ろの B に当たる (= 被弾 1 体)。 */
  bnc1:  { foes: [{ p: [3, 0], inactive: true }, { p: [-3, 0], enc: false }], walls: [[4, 0]] },
  /* (2b) 2 回折れないと届かない的。種 A (2,1) inactive / 壁 (3,1) と (-1,2) / 的 B (2,3) 非 encounter。 */
  bnc2:  { foes: [{ p: [2, 1], inactive: true }, { p: [2, 3], enc: false }], walls: [[3, 1], [-1, 2]] },
  /* (3a)(3b) 折れた列が採用される盤面。(3,0) と (-3,0) に敵、壁 (4,0)。
   *   (1,0) の筋は前 3 マスで A を貫き、折り返して B も貫く = 重複込み 3 でどの直進よりも多い。 */
  draw1: { foes: [{ p: [3, 0] }, { p: [-3, 0] }], walls: [[4, 0]] },
  /* (4a)(4b) 恒等の腕で **撃てる** 盤面 3 枚 (⛔ 撤退腕が何も撃たないと恒等は空振りで緑になる)。 */
  id1:   { foes: [{ p: [3, 0] }], walls: [[6, 0]] },
  id2:   { foes: [{ p: [4, 2] }], walls: [[8, 4]] },
  id3:   { foes: [{ p: [2, 0] }, { p: [6, 0] }], walls: [[4, 0]] },
};
/* 腕 — ⚠⚠ §1 は bnc0 / both0 で・§2 は rays0 / both0 で測る (依頼書 §8 冒頭)。 */
const BOARD_ARMS = { base: '?diag=1', bnc0: '?diag=1&boltbounce=0', rays0: '?diag=1&boltrays=0',
  both0: '?diag=1&boltrays=0&boltbounce=0' };

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

function mkResults() {
  const R = [];
  R.check = (id, name, cond, detail) => {
    R.push({ id: id, name: name, ok: !!cond, pending: false, detail: detail === undefined ? '' : String(detail) });
    console.log((cond ? '  OK  ' : '  NG  ') + id + ' ' + name + (detail !== undefined ? '  -- ' + detail : ''));
  };
  return R;
}
const stat = (r) => (r && r.stats) ? r.stats : { attempts: 0, cast: 0, demoted: 0 };
const isCast = (r) => !r.err && stat(r).attempts === 1 && stat(r).cast === 1 && stat(r).demoted === 0;
const isDem = (r) => !r.err && stat(r).attempts === 1 && stat(r).cast === 0 && stat(r).demoted === 1;
const brief = (r) => r ? (JSON.stringify(stat(r)) + ' hit=' + JSON.stringify(r.hit)
  + ' 候補' + (r.lines || []).length + ' 頂点' + ((r.paths || [])[0] || []).length
  + (r.err ? ' ERR=' + r.err : '') + (r.snapErr ? ' SNAPERR=' + r.snapErr : '')) : 'なし';
const oBrief = (o) => o ? ((o.ok ? 'cast' : 'demoted') + JSON.stringify(o.hit) + ' 候補' + o.rays
  + ' dir' + JSON.stringify(o.dir) + ' 折れ点' + o.bends.length + ' len' + o.tiles.length + (o.oob ? ' ⛔oob' : '')) : 'なし';

async function runSynthetic(browser, port, label, R, mutKey) {
  const errs = [];
  const pages = [];
  const out = { booted: false, bootErr: null, errs: errs, served: null, seam: 0 };
  console.log('\n[drv] ══ 合成盤面 ' + label + ' (port ' + port + ') ══');
  const served = await httpGetText(port, '/index.html');
  /* ⚠⚠ 番人 — **配信物が自分の凍結スナップショットと byte 一致するか**を毎回確かめる。
   *   Windows の http サーバは同じポートに黙って同居でき、保持者が測定ごとに変わる (#71 項目1 の実測)。
   *   ⇒ 「誰が答えたか」ではなく「返ってきた中身」で判定する。 */
  const expectSrc = mutKey ? mutatedSources(mutKey)['index.html'] : PRISTINE['index.html'];
  const sha = (t) => require('crypto').createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex').slice(0, 12);
  out.served = { same: served === expectSrc, sha: sha(served), shaWant: sha(expectSrc),
    judgeAim: served.split('get("boltaim")').length - 1,
    judgeRays: served.split('get("boltrays")').length - 1,
    judgeBnc: served.split('get("boltbounce")').length - 1,
    wordRays: served.split('boltrays').length - 1, wordBnc: served.split('boltbounce').length - 1,
    def: served.split('async function allyLightningBolt(').length - 1,
    defPath: served.split('function spawnLightningBoltPath(').length - 1,
    bytes: Buffer.byteLength(served, 'utf8') };
  const A = {};
  try {
    for (const arm of Object.keys(BOARD_ARMS)) { A[arm] = await openBoardPage(browser, port, BOARD_ARMS[arm], errs); pages.push(A[arm].page); }
    out.booted = true;
  } catch (e) {
    out.bootErr = String((e && e.message) || e);
    console.log('  ⛔ ページが起動しなかった: ' + out.bootErr);
    for (const p of pages) await p.close().catch(() => {});
    return out;
  }
  const T = A.base.info.T;
  const RUNS = [];   // (0b)(0d)(2c)(4b) が全走行に当たるように、採った結果をここへ積む
  const doRun = async (arm, key) => {
    const r = await A[arm].page.evaluate((s) => window.__vbb.run(s), B[key]);
    RUNS.push({ arm: arm, key: key, r: r });
    return r;
  };

  /* ── §0 装置 ─────────────────────────────────────────────────────────────── */
  const bnc0_aim1 = await doRun('bnc0', 'aim1');
  out.seam = bnc0_aim1.stats ? bnc0_aim1.stats.attempts : 0;

  R.check('(0a)', '[装置] **配信物が自分の凍結スナップショットと byte 一致** (⚠ Windows は同じポートに別のサーバが'
    + '黙って同居できるので「誰が答えたか」でなく「返ってきた中身」で見る) かつ、そこに撤退の**判定の逐語**'
    + ' get("boltrays") / get("boltbounce") が**それぞれちょうど 1**・'
    + 'allyLightningBolt と spawnLightningBoltPath の定義が各 1、4 腕すべてで boltLineTiles / boltAimRays / '
    + 'spawnLightningBoltPath が関数として読め、盤面のシームが生きている (敵 ≥ 1・壁 ≥ 1・候補 ≥ 1・attempts 0→1)'
    + ' ⛔ 語の件数で数えない (boltrays は語 ' + out.served.wordRays + ' / boltbounce は語 ' + out.served.wordBnc + ' 箇所ある)',
    out.served.same
    && out.served.judgeRays === 1 && out.served.judgeBnc === 1 && out.served.judgeAim === 1
    && out.served.def === 1 && out.served.defPath === 1
    && Object.keys(A).every((k) => A[k].info.fnBolt === 'function' && A[k].info.fnLine === 'function'
      && A[k].info.fnRays === 'function' && A[k].info.fnPath === 'function')
    && bnc0_aim1.made.length >= 1 && bnc0_aim1.arena.walls >= 1 && (bnc0_aim1.lines || []).length >= 1
    && !!bnc0_aim1.stats && bnc0_aim1.stats.attempts === 1 && !bnc0_aim1.err,
    '配信 sha256 ' + out.served.sha + (out.served.same ? ' == 凍結 ' : ' ⛔≠ 凍結 ') + out.served.shaWant
    + ' / get("boltaim")=' + out.served.judgeAim + ' get("boltrays")=' + out.served.judgeRays
    + ' get("boltbounce")=' + out.served.judgeBnc + ' / 定義 allyLightningBolt=' + out.served.def
    + ' spawnLightningBoltPath=' + out.served.defPath + ' / 配信 ' + out.served.bytes + ' B'
    + ' / 腕 ' + Object.keys(A).map((k) => k + '(' + A[k].info.fnLine + ',' + A[k].info.fnPath + ')').join(' ')
    + ' / 基準走行 ' + brief(bnc0_aim1));

  R.check('(0c)', '[装置] 4 腕のページが**実際に描けている** (title が本番のもの・#phaseText が在る・DOM ノード ≥ 100'
    + ' ⇒ 実測は 4 腕とも 189。白紙なら 10 前後にしかならない)'
    + ' ⛔ 「変数が取れたか」だけで起動を判定しない (全リクエスト 404 の白紙と「変数が見えないだけ」は区別できない)',
    Object.keys(A).every((k) => /ダンジョンファイターズ/.test(A[k].info.title || '') && A[k].info.hasPhase && A[k].info.nodes >= 100),
    Object.keys(A).map((k) => k + ':' + JSON.stringify(A[k].info.title) + ' phase=' + A[k].info.hasPhase + ' nodes=' + A[k].info.nodes).join(' / '));

  /* ── §1 候補の向き (⚠ ?boltbounce=0 を付けた腕で測る) ───────────────────── */
  const both0_aim1 = await doRun('both0', 'aim1');
  const o_aim1_on = bnc0_aim1.snap ? oracleBolt(bnc0_aim1.snap, { rays: true, bounce: 0 }) : null;
  const o_aim1_off = both0_aim1.snap ? oracleBolt(both0_aim1.snap, { rays: false, bounce: 0 }) : null;
  const pop1 = (bnc0_aim1.pops || []).filter((t) => /直線/.test(t))[0] || '';
  R.check('(1a)', '★★ 候補の向き — 壁 (3,1) で視線が切れた敵 (6,3) を、**反射を止めた腕**で測る:'
    + ' 素 (?boltbounce=0) は cast し被弾は狙った 1 体 / 撤退 (?boltrays=0&boltbounce=0) は不発。'
    + ' 2 経路 = 吹き出しの「直線 N 体」と被弾した敵の集合。'
    + ' ⭐ 撤退側の候補数を**導出して 0 本**であることまで見る (= 依頼書 §8 の「真っ直ぐは壁で止まる」の実体。'
    + ' 視線も弾も同じ Bresenham なので「視線は通るのに弾だけ壁で止まる」盤面は原理的に作れない = 項目4 の全探索で 0 件)',
    isCast(bnc0_aim1) && isDem(both0_aim1)
    && !!o_aim1_on && !o_aim1_on.oob && o_aim1_on.ok && sameSet(bnc0_aim1.hit, o_aim1_on.hit)
    && bnc0_aim1.hit.length === 1
    && !!o_aim1_off && o_aim1_off.rays === 0 && !o_aim1_off.ok
    && o_aim1_on.rays === 256 && /直線 1体/.test(pop1)
    && A.bnc0.info.boltRays === true && A.both0.info.boltRays === false,
    '素 ' + brief(bnc0_aim1) + ' 再計算 ' + oBrief(o_aim1_on)
    + ' ‖ 撤退 ' + brief(both0_aim1) + ' 再計算 ' + oBrief(o_aim1_off)
    + ' / 吹き出し ' + JSON.stringify(pop1)
    + ' / BOLT_RAYS_ON 素=' + A.bnc0.info.boltRays + ' 撤退=' + A.both0.info.boltRays);

  const rep2 = await doRun('bnc0', 'aim1');
  const rep3 = await doRun('bnc0', 'aim1');
  const canon = JSON.stringify(raysCanonical(A.bnc0.info.L));
  const seqOf = (r) => JSON.stringify((r.lines || []).map((l) => l.d));
  /* ⚠ 走行のたびに enemies へ push するので**敵の添字は毎回ずれる** (2026-09-20 の実測: [2] / [3] / [4])。
   *   決定論を測るときは made の中での順番 (= 盤面の何番目の敵か) へ直してから比べる。 */
  const hitRel = (r) => (r.hit || []).map((i) => r.made.indexOf(i));
  const outcomeOf = (r) => JSON.stringify({ hit: hitRel(r), paths: r.paths, stats: stat(r) });
  R.check('(1b)', '★ 候補の並びが決定論 — 同じ盤面を 3 回撃って ① boltLineTiles に渡った**向きの列**が 3 回とも同一'
    + ' ② その列が「dy 昇順 → dx 昇順の全既約方向」を L から導出した正準列と**逐語で一致** (L=' + A.bnc0.info.L + ' で ' + raysCanonical(A.bnc0.info.L).length + ' 本)'
    + ' ③ 採用の結果 (被弾集合・頂点列) も 3 回とも同一。⛔ 乱数を引かない (依頼書 §5-2)',
    seqOf(bnc0_aim1) === canon && seqOf(rep2) === canon && seqOf(rep3) === canon
    && outcomeOf(bnc0_aim1) === outcomeOf(rep2) && outcomeOf(rep2) === outcomeOf(rep3),
    '候補列 3 回 = ' + [bnc0_aim1, rep2, rep3].map((r) => (r.lines || []).length + '本' + (seqOf(r) === canon ? '✓正準' : '✗')).join(' / ')
    + ' / 採用 ' + [bnc0_aim1, rep2, rep3].map((r) => '盤面内' + JSON.stringify(hitRel(r)) + '(実 ' + JSON.stringify(r.hit) + ')頂点' + ((r.paths || [])[0] || []).length).join(' ')
    + ' / 先頭 3 本 ' + JSON.stringify((bnc0_aim1.lines || []).slice(0, 3).map((l) => l.d)));

  /* ── §2 反射 (⚠ ?boltrays=0 を付けた腕で測る) ─────────────────────────── */
  const rays0_bnc1 = await doRun('rays0', 'bnc1');
  const both0_bnc1 = await doRun('both0', 'bnc1');
  const o_bnc1_on = rays0_bnc1.snap ? oracleBolt(rays0_bnc1.snap, { rays: false, bounce: 1 }) : null;
  const o_bnc1_off = both0_bnc1.snap ? oracleBolt(both0_bnc1.snap, { rays: false, bounce: 0 }) : null;
  R.check('(2a)', '★★ 壁で折れた先にだけ敵が居る盤面を、**候補の広がりを止めた腕**で測る:'
    + ' 種の敵 (3,0) は inactive = 巻き込み対象外・壁 (4,0)・的 (-3,0) は非 encounter (候補の種にならない)。'
    + ' 素 (?boltrays=0) は cast で**被弾ちょうど 1 体 = 折れた先の的** / 撤退 (?boltrays=0&boltbounce=0) は不発。'
    + ' ⭐ 候補は 1 本きり (導出) なので、救ったのは反射だけ。被弾集合は独立再計算と一致し、採用列は実際に折れている',
    isCast(rays0_bnc1) && isDem(both0_bnc1)
    && !!o_bnc1_on && !o_bnc1_on.oob && o_bnc1_on.ok && o_bnc1_on.rays === 1
    && sameSet(rays0_bnc1.hit, o_bnc1_on.hit) && rays0_bnc1.hit.length === 1
    && rays0_bnc1.hit[0] === rays0_bnc1.made[1]
    && o_bnc1_on.bends.length === 1 && (rays0_bnc1.lines || []).some((l) => l.b.length >= 1)
    && !!o_bnc1_off && !o_bnc1_off.ok && o_bnc1_off.rays === 1
    && A.rays0.info.boltBounce === true && A.both0.info.boltBounce === false,
    '素 ' + brief(rays0_bnc1) + ' 再計算 ' + oBrief(o_bnc1_on)
    + ' ‖ 撤退 ' + brief(both0_bnc1) + ' 再計算 ' + oBrief(o_bnc1_off)
    + ' / made=' + JSON.stringify(rays0_bnc1.made) + ' enc=' + JSON.stringify(rays0_bnc1.enc)
    + ' / BOLT_BOUNCE_ON 素=' + A.rays0.info.boltBounce + ' 撤退=' + A.both0.info.boltBounce);

  const rays0_bnc2 = await doRun('rays0', 'bnc2');
  const o_bnc2_1 = rays0_bnc2.snap ? oracleBolt(rays0_bnc2.snap, { rays: false, bounce: 1 }) : null;
  const o_bnc2_2 = rays0_bnc2.snap ? oracleBolt(rays0_bnc2.snap, { rays: false, bounce: 2 }) : null;
  R.check('(2b)', '★★ 反射は 1 回まで — 「2 回折れないと届かない敵」は当たらない:'
    + ' 素 (?boltrays=0) は不発で、候補の唯一の列は**実際に 1 回は折れている** (= 壁に届いていないのではない)。'
    + ' ⭐ 盤面が空でないことの証明 = 同じ盤面を反射 2 回で再計算すると cast して的に当たる (BOLT_MAX_BOUNCE=' + A.rays0.info.maxBounce + ')',
    isDem(rays0_bnc2)
    && !!o_bnc2_1 && !o_bnc2_1.oob && !o_bnc2_1.ok && o_bnc2_1.rays === 1
    && !!o_bnc2_2 && o_bnc2_2.ok && o_bnc2_2.hit.length === 1 && o_bnc2_2.hit[0] === rays0_bnc2.made[1]
    && o_bnc2_2.bends.length === 2
    && (rays0_bnc2.lines || []).length === 1 && (rays0_bnc2.lines || [])[0].b.length === 1
    && A.rays0.info.maxBounce === 1,
    '素 ' + brief(rays0_bnc2) + ' / 反射1回の再計算 ' + oBrief(o_bnc2_1) + ' / 反射2回の再計算 ' + oBrief(o_bnc2_2)
    + ' / 本番が引いた列 ' + JSON.stringify((rays0_bnc2.lines || []).map((l) => ({ d: l.d, mb: l.mb, n: l.t.length, b: l.b }))));

  /* ── §3 描画 (両方の柱を生かしてよいのはここと §4) ─────────────────────── */
  const base_draw1 = await doRun('base', 'draw1');
  const o_draw1 = base_draw1.snap ? oracleBolt(base_draw1.snap, { rays: true, bounce: 1 }) : null;
  const pts1 = (base_draw1.paths || [])[0] || null;
  const at = (t) => ({ x: (t[0] + 0.5) * T, y: (t[1] + 0.5) * T });
  const near = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  const vtxOk = !!pts1 && !!o_draw1 && o_draw1.ok && !!o_draw1.last
    && near(pts1[0], { x: base_draw1.snap.aCX, y: base_draw1.snap.aCY - 8 })
    && o_draw1.bends.every((bd, k) => near(pts1[k + 1], at(bd)))
    && near(pts1[pts1.length - 1], at(o_draw1.last));
  R.check('(3a)', '★★ 折れた詠唱で描画へ渡した**頂点列の値**が、被弾計算に使った列から導ける:'
    + ' ① 先頭 == 術者の中心 (aCX, aCY-8) ② 中間 == 独立再計算が歩いて覚えた**折れ点のマスの中心** ③ 末尾 == 列の最後のマスの中心。'
    + ' ⛔ 「spawnLightningBoltPath が呼ばれた」では緑にしない (渡った座標まで見る)',
    isCast(base_draw1) && (base_draw1.paths || []).length === 1 && vtxOk
    && !!o_draw1 && o_draw1.bends.length >= 1 && sameSet(base_draw1.hit, o_draw1.hit),
    '素 ' + brief(base_draw1) + ' 再計算 ' + oBrief(o_draw1)
    + ' / 頂点 ' + JSON.stringify((pts1 || []).map((p) => [Math.round(p.x), Math.round(p.y)]))
    + ' / 期待 先頭(' + Math.round(base_draw1.snap ? base_draw1.snap.aCX : 0) + ',' + Math.round(base_draw1.snap ? base_draw1.snap.aCY - 8 : 0) + ')'
    + ' 折れ点' + JSON.stringify((o_draw1 ? o_draw1.bends : []).map((b) => [at(b).x, at(b).y]))
    + ' 末尾' + JSON.stringify(o_draw1 && o_draw1.last ? [at(o_draw1.last).x, at(o_draw1.last).y] : null));

  const bboxOf = (pts) => {
    let a = pts[0].x, b = pts[0].x, c = pts[0].y, d = pts[0].y;
    for (const p of pts) { if (p.x < a) a = p.x; if (p.x > b) b = p.x; if (p.y < c) c = p.y; if (p.y > d) d = p.y; }
    return { w: (b - a) + 180, h: (d - c) + 180 };
  };
  const svg1 = (base_draw1.svgs || [])[0] || null;
  const svg2 = (bnc0_aim1.svgs || [])[0] || null;
  const pts2 = (bnc0_aim1.paths || [])[0] || null;
  const bb1 = pts1 ? bboxOf(pts1) : null, bb2 = pts2 ? bboxOf(pts2) : null;
  R.check('(3b)', '★★ 頂点列の長さ == 折れ点の数 + 2 で、SVG の bbox が全頂点を含む (= 全頂点の幅高 + 180px):'
    + ' 折れる盤面 (折れ点 ' + (o_draw1 ? o_draw1.bends.length : '-') + ' → 頂点 ' + ((o_draw1 ? o_draw1.bends.length : 0) + 2) + ') と'
    + ' 折れない盤面 (折れ点 ' + (o_aim1_on ? o_aim1_on.bends.length : '-') + ' → 頂点 2) の 2 枚で測る',
    !!pts1 && !!o_draw1 && pts1.length === o_draw1.bends.length + 2
    && !!pts2 && !!o_aim1_on && pts2.length === o_aim1_on.bends.length + 2 && pts2.length === 2
    && !!svg1 && Math.abs(svg1.w - bb1.w) < 0.5 && Math.abs(svg1.h - bb1.h) < 0.5
    && !!svg2 && Math.abs(svg2.w - bb2.w) < 0.5 && Math.abs(svg2.h - bb2.h) < 0.5,
    '折れる: 頂点 ' + (pts1 ? pts1.length : 'なし') + ' 期待 ' + (o_draw1 ? o_draw1.bends.length + 2 : '-')
    + ' SVG ' + JSON.stringify(svg1) + ' 期待 ' + JSON.stringify(bb1)
    + ' ‖ 折れない: 頂点 ' + (pts2 ? pts2.length : 'なし') + ' 期待 ' + (o_aim1_on ? o_aim1_on.bends.length + 2 : '-')
    + ' SVG ' + JSON.stringify(svg2) + ' 期待 ' + JSON.stringify(bb2));

  /* ── §4 恒等 (非退行) ────────────────────────────────────────────────────── */
  const idRows = [];
  let idBad = 0;
  for (const key of ['id1', 'id2', 'id3']) {
    const r = await doRun('both0', key);
    const o = r.snap ? oracleBolt(r.snap, { rays: false, bounce: 0 }) : null;
    const pts = (r.paths || [])[0] || null;
    const bentLines = (r.lines || []).filter((l) => l.b.length >= 1).length;
    const mbArg = (r.lines || []).every((l) => l.mb === 0);
    const good = !!o && !o.oob && o.ok && isCast(r) && sameSet(r.hit, o.hit)
      && bentLines === 0 && mbArg && !!pts && pts.length === 2
      && (r.lines || []).length === o.rays;
    if (!good) idBad++;
    idRows.push(key + (good ? ' ✓' : ' ✗') + ' ' + brief(r) + ' 再計算 ' + oBrief(o)
      + ' 折れた列 ' + bentLines + ' 第7引数0 ' + mbArg + ' 頂点 ' + (pts ? pts.length : 'なし'));
  }
  R.check('(4a)', '★★★ 恒等 — ?boltrays=0&boltbounce=0 は #68 (eaa0626) の姿に戻る: 壁のある 3 盤面で'
    + ' ① 成否と被弾集合が #68 仕様の独立再計算と一致 ② 候補の本数も一致 ③ **反射が 1 度も起きない**'
    + ' (boltLineTiles に渡る第 7 引数が全部 0・返った列の折れ点が全部 0) ④ 描画の頂点はちょうど 2 点。'
    + ' ⭐ 3 盤面とも**撃てる**盤面にしてある (⛔ 撤退腕が何も撃たなくても緑、を避ける)',
    idBad === 0 && A.both0.info.boltRays === false && A.both0.info.boltBounce === false,
    'BOLT_RAYS_ON=' + A.both0.info.boltRays + ' BOLT_BOUNCE_ON=' + A.both0.info.boltBounce + ' / ' + idRows.join(' / '));

  /* (2c) 射程が伸びない — 素 / ?boltrays=0 の腕で引かれた全部の列を見る */
  const L = A.rays0.info.L;
  const lenRows = [];
  let lenBad = 0, bentN = 0, fullN = 0, lineN = 0;
  for (const { arm, key, r } of RUNS) {
    if (arm !== 'rays0' && arm !== 'base') continue;
    for (const l of (r.lines || [])) {
      lineN++;
      if (l.t.length > l.L) { lenBad++; if (lenRows.length < 4) lenRows.push(arm + '/' + key + ' d' + JSON.stringify(l.d) + ' len' + l.t.length + '>L' + l.L); }
      if (l.b.length >= 1) { bentN++; if (l.t.length === l.L) fullN++; }
    }
  }
  R.check('(2c)', '★★ 射程が伸びない — 本番が引いた**すべての**マス列で「マス数 ≤ その呼び出しの L」'
    + ' (L は宣言射程 getRange(spellAoE).tiles=' + L + ' から導出。⛔ 反射で射程を稼がない = 依頼書 §2-4)。'
    + ' ⭐ 空振り防止の絶対量 = 実際に折れた列が 1 本以上あり、そのうち長さがちょうど L の列も 1 本以上ある',
    lenBad === 0 && bentN >= 1 && fullN >= 1 && lineN >= 200,
    '調べた列 ' + lineN + ' 本 / L 超過 ' + lenBad + ' 本 ' + (lenRows.join(' ') || '')
    + ' / 折れた列 ' + bentN + ' 本 (うち長さちょうど L ' + fullN + ' 本)');

  /* (4b) 反射 0 回の列が、反射引数を足す前と 1 マスも違わない (§2-4 の等価性) */
  let eqN = 0, eqBad = 0, diffN = 0;
  const eqRows = [];
  for (const { arm, key, r } of RUNS) {
    if (arm !== 'base') continue;
    const s = r.snap; if (!s) continue;
    const G = geoOf(s);
    for (const l of (r.lines || [])) {
      const noB = oracleWalk(s, G, l.d, l.L, 0);
      if (l.b.length === 0) {
        if (sameTiles(l.t, noB.tiles)) eqN++;
        else { eqBad++; if (eqRows.length < 4) eqRows.push(key + ' d' + JSON.stringify(l.d) + ' 実物' + JSON.stringify(l.t) + ' 再計算' + JSON.stringify(noB.tiles)); }
      } else if (!sameTiles(l.t, noB.tiles)) diffN++;
    }
  }
  R.check('(4b)', '★★★ 反射 0 回の列が、反射を足す前と 1 マスも違わない (依頼書 §2-4 の等価性):'
    + ' 素の腕 (両方の柱が生きている) で本番が引いた列のうち**折れなかったもの全部**を、'
    + ' 反射引数 0 の独立再計算と逐語で突き合わせる。⭐ 空振り防止の絶対量 = 突き合わせた本数 ≥ 200 かつ、'
    + ' **折れた列のうち反射なしと食い違うものが 1 本以上**ある (= 比較器が「全部同じ」を返しているだけではない)',
    eqBad === 0 && eqN >= 200 && diffN >= 1,
    '折れなかった列 ' + eqN + ' 本が一致 / 不一致 ' + eqBad + ' 本 ' + (eqRows.join(' / ') || '')
    + ' / 折れた列で反射なしと差があるもの ' + diffN + ' 本');

  /* (0b) 期待値は盤面から導出している (全走行に当てる) */
  const b0 = [];
  let b0bad = 0;
  for (const { arm, key, r } of RUNS) {
    const spec = B[key], s = r.snap, info = A[arm].info;
    const okFoes = !!s && spec.foes.every((f, k) => {
      const fo = s.foes.filter((x) => x.i === r.made[k])[0];
      return fo && fo.tx === s.m.tx + f.p[0] && fo.ty === s.m.ty + f.p[1] && (!!fo.inactive === !!f.inactive);
    });
    const okWalls = !!s && (spec.walls || []).every((w) => {
      const row = s.walls[s.R + w[1]];
      return row && row.charAt(s.R + w[0]) === '#';
    });
    const okArena = r.arena.blocked === (spec.walls || []).length && info.blockedAfter === 0 && !!info.org;
    if (!(okFoes && okWalls && okArena)) { b0bad++; if (b0.length < 4) b0.push(arm + '/' + key + ' ✗ foes=' + okFoes + ' walls=' + okWalls + ' arena=' + okArena); }
  }
  R.check('(0b)', '[装置] ⭐⭐⭐ 期待値を**盤面から導出**している: 仕込んだ敵の相対座標と inactive・置いた壁が'
    + ' 27x27 の写しと 1 マスも違わず、闘技場 (±' + A.base.info.H + ') に**置いた壁以外の塞ぎマスが 0**'
    + ' (⭐ 掘った矩形の外の自然壁で跳ね返る事故 = #71 項目3 の (1d)(1g) の根 を構造的に消している)',
    b0bad === 0 && A.base.info.blockedAfter === 0 && RUNS.length >= 10,
    '走行 ' + RUNS.length + ' 件中 ✗ ' + b0bad + ' 件 ' + (b0.join(' / ') || '(なし)')
    + ' / org=' + JSON.stringify(A.base.info.org) + ' 掘った ' + A.base.info.carvedN + ' マス (原点候補 ' + A.base.info.tried + ' 件目)'
    + ' / 掘った後の塞ぎ ' + A.base.info.blockedAfter + ' / MAP ' + A.base.info.MAP_W + 'x' + A.base.info.MAP_H);

  /* (0d) 観測先は測る直前に空へ戻し、本番の口だけが書いた */
  const preBad = RUNS.filter((x) => !x.r.pre || x.r.pre.paths !== 0 || x.r.pre.svgs !== 0 || x.r.pre.lines !== 0
    || x.r.pre.pops !== 0 || x.r.pre.stats !== 0).length;
  const castRuns = RUNS.filter((x) => isCast(x.r));
  const writeBad = castRuns.filter((x) => (x.r.paths || []).length !== 1 || (x.r.svgs || []).length !== 1
    || !(x.r.svgs || [])[0] || (x.r.lines || []).length < 1
    || !((x.r.paths || [])[0] || []).every((p) => isFinite(p.x) && isFinite(p.y))).length;
  R.check('(0d)', '[装置] ⭐⭐⭐ 観測先 (頂点列 / SVG / 候補ごとのマス列 / 吹き出し / __aoeStats) を'
    + ' **測る直前に空へ戻し**、書いたのが本番の口だけであることを毎走行で確かめる'
    + ' (⛔ 「呼ばれた / 在る」で緑にしない。#70 の noprefix 空振り = 前の節が残した [] で緑になった事故の予防)。'
    + ' 撃てた走行では 頂点列 1 本・SVG 1 枚・候補の列 ≥ 1 本・頂点の座標が全部有限',
    preBad === 0 && writeBad === 0 && RUNS.length >= 10 && castRuns.length >= 5,
    '走行 ' + RUNS.length + ' 件 (うち cast ' + castRuns.length + ' 件) / 測定直前が空でなかった ' + preBad + ' 件'
    + ' / 書き込みが期待と違った ' + writeBad + ' 件'
    + ' / 例: ' + JSON.stringify(RUNS[0].r.pre) + ' → paths ' + (RUNS[0].r.paths || []).length
    + ' svgs ' + (RUNS[0].r.svgs || []).length + ' lines ' + (RUNS[0].r.lines || []).length);

  R.check('(0g)', '[装置] 合成盤面の ' + Object.keys(BOARD_ARMS).length + ' 腕でページエラー / console.error が 0 件 (favicon の 404 は除外)',
    errs.length === 0, errs.slice(0, 4).join('  |  ') || '(なし)');

  for (const p of pages) await p.close().catch(() => {});
  return out;
}

function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + (label ? '   ' + label : ''));
  if (failed) {
    console.log('  --- FAILED ---');
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name + '  -- ' + r.detail));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed: passed, failed: failed };
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_boltbounce_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  try {
    if (NEGATIVE) {
      /* 素の合成盤面 (基準)。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない
       *   (赤の上では「担当ラベルが赤くなったか」の判定が無条件に真へ縮退する = #71 項目3b の m8 の実例)。 */
      const srv0 = await startServer(PORT, null);
      const R0 = mkResults();
      const o0 = await runSynthetic(browser, PORT, '(素・基準)', R0, null);
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
          try { o = await runSynthetic(browser, port, '[変異 ' + key + ']', R, key); }
          catch (e) { o = { booted: false, bootErr: 'ドライバ例外: ' + String((e && e.message) || e) }; }
          await stopServer(srv);
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const r0a = R.filter((r) => r.id === '(0a)')[0], r0c = R.filter((r) => r.id === '(0c)')[0];
          /* ⭐ 起動確認 = 4 腕が起動し (0c) でページが実際に描けている + 盤面のシームが生きている
           *   (構文破壊で全部赤になる偽の検出を見分ける)。
           *   ⚠ (0a) は switchdead が判定の行そのものを消すので巻き添えで赤くなる = 起動確認には使わない (ログには出す)。 */
          const bootOk = !!o && o.booted && !!r0c && r0c.ok && o.seam === 1;
          const want = NEG_EXPECT[key] || [];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const ok = bootOk && miss.length === 0;
          console.log('[drv] 起動確認 ' + key + ': ' + (bootOk ? 'OK' : '⛔ NG') + ' — ページ起動 ' + (o && o.booted ? 'OK' : 'NG ' + (o && o.bootErr))
            + ' / (0c) ' + (r0c ? (r0c.ok ? 'OK' : 'NG') : 'なし') + ' / シーム attempts=' + (o ? o.seam : '-')
            + ' / (0a) ' + (r0a ? (r0a.ok ? 'OK' : 'NG') : 'なし'));
          console.log('[drv] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + red.join(',')
            + ' → ' + (ok ? '✓ OK' : '✗ ' + (bootOk ? '空振り ' + miss.join(',') : '起動確認 NG')));
          report.push({ key: key, want: want, red: red, ok: ok, bootOk: bootOk });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(13) + ' 担当 ' + r.want.join(',')
          + ' / 赤 ' + r.red.join(',') + ' / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[drv] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
        else console.error('[drv] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const srv = await startServer(port, MUTATE);
      const R = mkResults();
      await runSynthetic(browser, port, '[変異 ' + MUTATE + ' (手回し)]', R, MUTATE);
      await stopServer(srv);
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[drv] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)'));
      exitCode = 0;
    } else {
      const R = mkResults();
      R.check('(0e)', '[装置] 変異 ' + MUT_ORDER.length + ' 本の注入点が、原本の「属する範囲」の中でちょうど 1 行'
        + ' (⭐ 腐ると --negative が走る前に exit 3。素の側でも赤で見えるようにする)',
        AUDIT_BAD.length === 0,
        AUDIT.map((a) => a.key + '=' + a.file.replace('.html', '') + ':' + a.line + '(範囲内 ' + a.inScope + '/全体 ' + a.inFile + ')').join(' '));
      const srv = await startServer(PORT, null);
      const o = await runSynthetic(browser, PORT, '(素)', R, null);
      if (!o.booted) R.check('(0x)', '[装置] 合成盤面のページが起動する', false, o.bootErr);
      await stopServer(srv);
      const s = summarize(R, '');
      exitCode = s.failed ? 1 : 0;
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
