#!/usr/bin/env node
/*
 * verify_ambush_round.js — 実装依頼書 #114「不意打ちの第 1 ラウンド」の受入ドライバ
 *                          (依頼書 2026-11-10_ambush-round.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_ambush_round.js                       # 素
 *   node tools/verify_ambush_round.js --negative            # 素の基準 + 変異 9 本 (port 10811〜10819)
 *   node tools/verify_ambush_round.js --negative --only holdstun,noreset
 *   node tools/verify_ambush_round.js --mutate holdstun     # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が期待の件数でない・行数が変わる)
 *
 * ■ 方針 — index.html を開き、page.evaluate で交戦中の敵を createEnemy で直接組み、本物の
 *   applySurpriseStun / enemyAttackTurn / allyBasicAttack / playerSingleAttack / canSneakOnTarget を呼ぶ。
 *   ⭐ 自動命中は Math.random を 0 に固定して d20 = 1 を振らせ、ファンブルにならず命中することで確かめる
 *     (isHelplessStrike の戻り値を写経しない)。振った出目は d20 の包みで控え、1 だったことも確かめる。
 *   ⭐ 「敵が行動した」は、スタンの関門の直後にある sayEnemyCry (敵の全攻撃形態の唯一の入口) へ届いたかで見る。
 *     届いた時点で番兵を投げて抜ける (移動・攻撃の演出と乱数を持ち込まない)。
 *   ⭐ (1f) (3b) は本物の runEncounter を通す (交戦の初期化の印の消去と、手番ループの ambushActorClass の代入が
 *     この関数の中にあるため)。手番の中身だけ差し替え、当たる職の手番で本物の allyBasicAttack を呼ぶ。
 *     runEncounter の catch が飲んだ例外は console.error("encounter error", …) で拾って (0c) に出す。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) ソース: コメントを剥いで `helpless = isHelplessStrike(target|t)` が 15 件・`helpless = (target|t).stunned > 0` が 0 件
 *      (0b) [装置] (1a) の一撃が実際に HP を減らし、見せ場のバナーが 1 回以上呼ばれた ⭐ これが無いと全 assert が空振りで永久緑
 *      (0c) [装置] 全ページ起動・pageerror 0 件・runEncounter の中の例外 0 件
 *   §1 (1a) 不意打ち → 敵の手番 (stunned 1→0) → 第 1 ラウンドの d20 = 1 が命中 + クリティカル (仲間 + 主人公の 2 経路)
 *      (1b) 同じ仕込みで第 2 ラウンド ⇒ d20 = 1 はファンブル   (1c) ボス ⇒ stunned は付くが窓なし
 *      (1d) 盾バッシュ等だけで止めた敵 ⇒ 手番の後は窓なし     (1e) canSneakOnTarget: 手番の後も真・第 2 ラウンドは偽
 *      (1f) 本物の runEncounter: 前の戦闘の生き残りの印が次の交戦の初期化で消える
 *   §2 (2a) enemyAttackTurn 2 回 ⇒ 1 回目は行動せず stunned 0・2 回目は行動する
 *      (2b) ?ambushround=0 で同じ推移   (2c) 手番の後の盾バッシュ (1)・スリープ (2) が第 2 ラウンドにそのまま効く
 *   §3 (3a) 1 戦で 2 体に一撃 ⇒ バナー 1 回   (3b) 手番の主 = 盗賊 ⇒ 暗殺 / 戦士 ⇒ 不意の一撃 (本物の手番ループ)
 *      (3c) 不意打ちなしの stunned の敵 ⇒ バナーなし   (3d) 次の不意打ちでまた 1 回
 *   §4 (4a) ?ambushround=0 ⇒ (1a) の仕込みで d20 = 1 はファンブル・バナーなし
 *      (4b) sessionStorage に写り、クエリなしの再読み込みでも撤退のまま
 *   ⛔ 測らないこと (依頼書 §8): バナーの尺と文面の細部 / 実戦での出現頻度・勝率
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html は起動時に 1 回だけ readFileSync して凍結し、変異はメモリ上で差し替える
 *     (⛔ 本番ファイルは 1 バイトも触らない)。
 *   - 起動時に全変異のアンカーを原本で検算する。崩れたら素でも exit 3。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持ち、欠陥が効く枝で鳴る。--negative / --mutate はその件数で
 *     「注入行が実行された」を確かめる (0 件 = 空振り扱いで exit 1)。
 *   - ⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *   - sessionStorage はタブ単位。素の版と撤退の版は別タブ。(4b) は撤退のタブをそのまま読み直す。
 *
 * ■ ポート = 10810 (素) / 変異 10811〜10819 (9 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-11-10 この機械の実測・HEAD 9034fc7) = 素 約 6 秒 / --negative 約 57 秒 (素の基準 + 変異 9 本)。
 * ■ 担当表の依頼書 §8 との差 (実走で決めた。予想は全部含む): holdstun +(1a)(1b)(1e)(2b) / onesite +(1a) /
 *   everybanner +(3d) / alwaysoff +(1e)(1f)(3a)(3b)(3d)。
 *   holdstun は「止めるだけ」だと (2c) が空振りするので、後からまとめて引く半分まで注入している (MUTATIONS のコメント)。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10810'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const SCENARIO = 'goblin-mine';
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'rogue',   isHero: false, zone: 'front', name: 'ニア', trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガル', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
];

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html';
const PRISTINE = fs.readFileSync(path.join(ROOT, F_INDEX), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 9 本)。逐語は HEAD 9034fc7。count は原本での出現回数 (既定 1)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const MUTATIONS = {
  /* ⭐ §2-2 の罠「第 1 ラウンド中は stunned -= 1 を止めて、ラウンド末にまとめて引く」。
   *   ラウンド末の減算は、次にスタンの関門を読む直前へ畳んだ (関門の外からは「ラウンド末に引いた」のと同じ値に見える)。
   *   ⚠ 止めるだけで後から引かないと、Math.max(1, 1) = 1 で (2c) が空振りする。 */
  holdstun: [
    { from: '        enemy.stunned -= 1;',
      to: '        if (enemy.__ambushOpen && encounterRound === 1) { ' + HIT('holdstun') + '; enemy.__deferStun = true; } else enemy.stunned -= 1;   /* ★変異holdstun */' },
    { from: '      // スタン判定: 盾バッシュ等でスタン状態なら1ターン行動不能',
      to: '      if (enemy.__deferStun && encounterRound !== 1) { enemy.__deferStun = false; enemy.stunned = Math.max(0, enemy.stunned - 1); }   /* ★変異holdstun */' }],
  /* markAmbushOpen のボス除外を外す */
  bossopen: [
    { from: '        if (e && e.alive && !(e.def && e.def.isBoss)) e.__ambushOpen = true;',
      to: '        if (e && e.alive) { if (e.def && e.def.isBoss) ' + HIT('bossopen') + '; e.__ambushOpen = true; }   /* ★変異bossopen */' }],
  /* isAmbushOpen の encounterRound === 1 を外す */
  noround: [
    { from: '    function isAmbushOpen(t) { return !!(t && t.__ambushOpen) && encounterRound === 1; }',
      to: '    function isAmbushOpen(t) { if (t && t.__ambushOpen && encounterRound !== 1) ' + HIT('noround') + '; return !!(t && t.__ambushOpen); }   /* ★変異noround */' }],
  /* 15 か所のうち 1 か所 (playerSingleAttack) を元へ戻す */
  onesite: [
    { from: '      const helpless = isHelplessStrike(target);  // スタン/スリープ中の敵は無抵抗',
      to: '      const helpless = target.stunned > 0; if (isAmbushOpen(target)) ' + HIT('onesite') + ';   /* ★変異onesite */' }],
  /* canSneakOnTarget を元へ戻す */
  nosneak: [
    { from: '      if (target.stunned > 0 || isAmbushOpen(target)) return true;',
      to: '      if (isAmbushOpen(target) && !(target.stunned > 0)) ' + HIT('nosneak') + '; if (target.stunned > 0) return true;   /* ★変異nosneak */' }],
  /* 交戦の初期化の印の消去を外す (印が残っていたときに鳴る) */
  noreset: [
    { from: '          e.__ambushOpen = false;',
      to: '          if (e.__ambushOpen) ' + HIT('noreset') + ';   /* ★変異noreset */' }],
  /* ambushStrikeShown の latch を外す */
  everybanner: [
    { from: '      if (open && !ambushStrikeShown) showAmbushStrike(t);',
      to: '      if (open) { if (ambushStrikeShown) ' + HIT('everybanner') + '; showAmbushStrike(t); }   /* ★変異everybanner */' }],
  /* 手番の職を入れない */
  noactor: [
    { from: '              ambushActorClass = actor.kind === "player" ? leaderClassKey : actor.kind === "ally" ? actor.ally.classKey : null;',
      to: '              ambushActorClass = null; if (actor.kind !== "enemy") ' + HIT('noactor') + ';   /* ★変異noactor */' }],
  /* AMBUSH_ROUND_ON を常に偽 */
  alwaysoff: [
    { from: '        return sessionStorage.getItem("dragonfighters.ambushRoundOff") !== "1";',
      to: '        ' + HIT('alwaysoff') + '; return false;   /* ★変異alwaysoff */' }],
};
/* 依頼書 §8 の予想 (⭐ 実測の赤に含まれていることを起動時に検算する) */
const NEG_PREDICTED = {
  holdstun: ['(2a)', '(2c)'], bossopen: ['(1c)'], noround: ['(1b)', '(1e)'], onesite: ['(0a)'], nosneak: ['(1e)'],
  noreset: ['(1f)'], everybanner: ['(3a)'], noactor: ['(3b)'], alwaysoff: ['(1a)', '(0b)'],
};
/* 変異 → 赤くなるべき assert (担当)。⚠ 机上で書かない。--mutate <key> の実走で決めた。--negative は完全一致を要求する。 */
const NEG_EXPECT = {
  /* (1a) stun1 が 0 にならない / (1b)(1e) 手番の後も stunned が残り第 2 ラウンドでも無防備 / (2b) 撤退の版 (印が付かないので普通に引く) と推移が割れる */
  holdstun: ['(1a)', '(1b)', '(1e)', '(2a)', '(2b)', '(2c)'],
  bossopen: ['(1c)'],
  noround: ['(1b)', '(1e)'],
  /* (1a) = 戻した 1 か所 (playerSingleAttack) を主人公の経路で実際に振っている */
  onesite: ['(0a)', '(1a)'],
  nosneak: ['(1e)'],
  noreset: ['(1f)'],
  /* (3d) = 同じ窓の 2 撃目でもバナーが増える */
  everybanner: ['(3a)', '(3d)'],
  noactor: ['(3b)'],
  /* 窓が開かない ⇒ 窓に頼る節が全部赤: (1e) 手番の後のスニーク / (1f) 1 戦目の一撃 / (3a)(3b)(3d) バナー */
  alwaysoff: ['(0b)', '(1a)', '(1e)', '(1f)', '(3a)', '(3b)', '(3d)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 9) vetFail('変異は 9 本まで (ポート 10811〜10819)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_PREDICTED[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) vetFail('NEG_EXPECT / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  const miss = NEG_PREDICTED[k].filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  if (miss.length) vetFail('担当 ' + k + ' が依頼書 §8 の予想 ' + J(NEG_PREDICTED[k]) + ' を含まない');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
const _mutCache = {};
function servedIndex(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key] !== undefined) return _mutCache[key];
  let s = PRISTINE;
  for (const e of MUTATIONS[key]) {
    const want = e.count || 1;
    const c = countOf(PRISTINE, e.from);
    if (c !== want) vetFail('変異 ' + key + ' の注入点が ' + want + ' 箇所ではない (' + c + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE, e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    s = s.split(e.from).join(e.to);
  }
  if (s.split('\n').length !== PRISTINE.split('\n').length) vetFail('変異 ' + key + ' が行数を変えた');
  _mutCache[key] = s;
  return s;
}
if (countOf(PRISTINE, '__MUTHIT__') !== 0) vetFail('原本に __MUTHIT__ が在る');
for (const k of MUT_ORDER) {
  if (!MUTATIONS[k].some((e) => e.to.indexOf('__MUTHIT__' + k) >= 0)) vetFail('変異 ' + k + ' に実行の印が無い');
  if (servedIndex(k) === PRISTINE) vetFail('変異 ' + k + ' が何も変えていない');
}

/* (0a) コメントを剥いで数える。⚠ コメントの 3 行に `helpless = target.stunned > 0` がそのまま書かれている。
 * 定義行を数えないよう `helpless = isHelplessStrike(` の形で数える。⛔ 全文一括の正規表現でブロックコメントを消さない (文字列の中の記号で範囲が狂う)。 */
function countSites(src) {
  let inBlock = false, calls = 0, raw = 0;
  for (const line0 of src.split('\n')) {
    let line = line0;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) continue;
      line = line.slice(end + 2); inBlock = false;
    }
    line = line.replace(/\/\*.*?\*\//g, '');
    const open = line.indexOf('/*');
    if (open >= 0 && line.indexOf('*/', open) < 0) { line = line.slice(0, open); inBlock = true; }
    const c = line.indexOf('//');
    if (c >= 0) line = line.slice(0, c);
    if (/\bconst helpless = isHelplessStrike\((target|t)\);/.test(line)) calls++;
    if (/\bhelpless = (target|t)\.stunned > 0/.test(line)) raw++;
  }
  return { calls, raw };
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で期待どおり');

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[vet] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[vet] Chrome/Edge が見つかりません (--browser <path>)'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.md': 'text/markdown;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SERVERS = [];
function startServer(port, mutKey) {
  const idx = servedIndex(mutKey);
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === F_INDEX) { res.setHeader('Content-Type', MIME['.html']); res.end(Buffer.from(idx, 'utf8')); return; }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
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
    try { srv.closeAllConnections(); } catch (e) {}
    try { srv.close(() => resolve()); } catch (e) { resolve(); }
    const i = SERVERS.indexOf(srv); if (i >= 0) SERVERS.splice(i, 1);
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(2a)', '(2b)', '(2c)', '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(4b)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 700));
  };
  return R;
}
function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + '   PENDING 0' + (label ? '   ' + label : ''));
  if (failed) {
    console.log('  --- FAILED ---');
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 80) + '  -- ' + r.detail.slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed, failed };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ内の測定 (全腕)。各腕は例外を自分の中で { err } に畳む = 1 腕の故障で他の判定を失わない。
 * ══════════════════════════════════════════════════════════════════════════════ */
const PROBE = async () => {
  const M = { on: AMBUSH_ROUND_ON, ss: null };
  try { M.ss = sessionStorage.getItem('dragonfighters.ambushRoundOff'); } catch (e) {}
  /* 背景の進行を止める (⛔ gameOver = true は使わない: runEncounter のラウンドループが回らなくなる) */
  heroAI = function () {};
  tryStartEncounter = function () {};
  try { moveEnemies = function () {}; } catch (e) {}
  sleepMs = () => new Promise((r) => setTimeout(r, 0));   // ⛔ Promise.resolve() はマイクロタスク飢餓
  awaitNarrationClear = async function () {};
  try { spawnArrow = function () { return Promise.resolve(); }; } catch (e) {}
  gameOver = false; dialogPaused = false;
  maxHp = Math.max(maxHp, 999); hp = maxHp;

  const B = [];
  const keepBanner = showBanner;
  showBanner = function (t) { B.push(String(t)); return keepBanner.apply(this, arguments); };
  const ambushBanners = () => B.filter((t) => /暗殺|不意の一撃/.test(t));
  const rollsA = [], rollsP = [];
  const keepRA = showRollAtAlly, keepRP = showRollAtPlayer;
  showRollAtAlly = function (a, html) { rollsA.push(String(html)); return keepRA.apply(this, arguments); };
  showRollAtPlayer = function (html) { rollsP.push(String(html)); return keepRP.apply(this, arguments); };

  const TILE = TILE_SIZE;
  let lane = { len: 0, ty: -1, tx0: -1 };
  for (let ty = 1; ty < MAP_H - 1; ty++) {
    let run = 0, start = 0;
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (!isTileWall(tx, ty)) { if (run === 0) start = tx; run++; if (run > lane.len) lane = { len: run, ty, tx0: start }; }
      else run = 0;
    }
  }
  M.laneLen = lane.len;
  const setUnit = (u, tx, ty) => { const s = (u.def && u.def.displaySize) || 96; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
  const tileOf = (u) => ({ tx: Math.floor((u.x + u.def.displaySize / 2) / TILE), ty: Math.floor((u.y + u.def.displaySize / 2) / TILE) });
  const allyOf = (ck) => allies.find((a) => a.classKey === ck);
  M.allyKeys = allies.map((a) => a.classKey);
  const rogue = allyOf('rogue'), fighter = allyOf('warrior');

  const parkParty = () => {
    for (const a of allies) { a.alive = true; a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; a.x = -999999; a.y = -999999; }
    snapPlayerToTile(lane.tx0 + lane.len - 1, lane.ty);
    hp = maxHp;
  };
  const board = (types) => {
    for (const e of enemies) { if (e) { e.alive = false; e.hp = 0; } }
    parkParty();
    const made = [];
    types.forEach((t, k) => {
      const idx = enemies.length;
      const e = createEnemy(t, lane.tx0 + 2 + 3 * k, lane.ty);
      enemies.push(e); createEnemyDom(idx, e.def, e.type);
      e.alive = true; e.maxHp = 999; e.hp = 999; e.stunned = 0;
      setUnit(e, lane.tx0 + 2 + 3 * k, lane.ty);
      made.push(idx);
    });
    encounterEnemyIndices = made.slice();
    encounterRound = 1;
    B.length = 0;
    ambushActorClass = 'warrior';
    return made;
  };
  /* 本物の敵の手番。スタンの関門を抜けて sayEnemyCry へ届いたら「行動した」 */
  const SENT = { sentinel: true };
  const turn = async (idx) => {
    const keep = sayEnemyCry;
    let acted = false;
    sayEnemyCry = function () { acted = true; throw SENT; };
    try { await enemyAttackTurn(idx); } catch (e) { if (e !== SENT) throw e; } finally { sayEnemyCry = keep; }
    return acted;
  };
  /* d20 = 1 を振らせて本物の攻撃を呼ぶ */
  const withD1 = async (fn) => {
    const rolls = [];
    const keepD = d20, keepR = Math.random;
    d20 = function () { const v = keepD(); rolls.push(v); return v; };
    Math.random = () => 0;
    let r;
    try { r = await fn(); } finally { Math.random = keepR; d20 = keepD; }
    return { r, rolls };
  };
  const strike = async (ally, idx) => {
    const t = enemies[idx], p = tileOf(t);
    setUnit(ally, p.tx - 1, p.ty);
    rollsA.length = 0;
    const hp0 = t.hp;
    const { r, rolls } = await withD1(() => allyBasicAttack(ally, idx));
    return { r: { missed: !!r.missed, isCrit: !!r.isCrit, outOfRange: !!r.outOfRange }, rolls, hp0, hp1: t.hp, labels: rollsA.join(' | ') };
  };
  const strikeP = async (idx) => {
    const t = enemies[idx], p = tileOf(t);
    snapPlayerToTile(p.tx - 1, p.ty);
    rollsP.length = 0;
    const hp0 = t.hp;
    const { r, rolls } = await withD1(() => playerSingleAttack(idx, {}));
    return { r: { missed: !!(r && r.missed), isCrit: !!(r && r.isCrit), outOfRange: false }, rolls, hp0, hp1: t.hp, labels: rollsP.join(' | ') };
  };
  const arm = async (name, fn) => { try { M[name] = await fn(); } catch (e) { M[name] = { err: String((e && e.stack) || (e && e.message) || e).slice(0, 400) }; } };

  /* ── §1 ── */
  await arm('a1a', async () => {
    const [e0, e1] = board(['goblin', 'goblin']);
    const n = applySurpriseStun([e0, e1]);
    encounterRound = 1;
    const stun0 = enemies[e0].stunned;
    const acted = await turn(e0);
    await turn(e1);
    const stun1 = enemies[e0].stunned;
    const s = await strike(rogue, e0);
    const bannersAfterAlly = ambushBanners().length;
    const sP = await strikeP(e1);
    return { n, stun0, acted, stun1, s, sP, bannersAfterAlly, banners: ambushBanners(), flag: enemies[e0].__ambushOpen === true };
  });
  await arm('a1b', async () => {
    const [e] = board(['goblin']);
    applySurpriseStun([e]); encounterRound = 1;
    await turn(e);
    encounterRound = 2;
    const s = await strike(rogue, e);
    return { s, banners: ambushBanners(), stun: enemies[e].stunned };
  });
  await arm('a1c', async () => {
    const [e] = board(['goblinKing']);
    applySurpriseStun([e]); encounterRound = 1;
    const stun0 = enemies[e].stunned, flag = enemies[e].__ambushOpen === true;
    const acted = await turn(e);
    const s = await strike(rogue, e);
    return { isBoss: !!enemies[e].def.isBoss, stun0, flag, acted, stun1: enemies[e].stunned, s, banners: ambushBanners() };
  });
  await arm('a1d', async () => {
    const [e] = board(['goblin']);
    enemies[e].stunned = 1; encounterRound = 1;
    const acted = await turn(e);
    const s = await strike(rogue, e);
    return { acted, stun1: enemies[e].stunned, open: isAmbushOpen(enemies[e]), s, banners: ambushBanners() };
  });
  await arm('a1e', async () => {
    const [e] = board(['goblin']);
    applySurpriseStun([e]); encounterRound = 1;
    await turn(e);
    const p = tileOf(enemies[e]);
    setUnit(rogue, p.tx - 2, p.ty);
    const r1 = canSneakOnTarget(rogue, enemies[e]);
    encounterRound = 2;
    const r2 = canSneakOnTarget(rogue, enemies[e]);
    return { stun: enemies[e].stunned, r1, r2 };
  });

  /* ── 本物の runEncounter を 1 戦回す。o = { made, ambush, attacker:'ally'|'player', classKey, leader, removeSurvivor } ── */
  const battle = async (o) => {
    const out = { done: false };
    const tgt = o.made[0];
    const keep = { allyAttackTurn, playerAttackTurn, enemyAttackTurn, tryStealthSurprise, runLoreCheck, detectReinforcements, leader: leaderClassKey };
    leaderClassKey = o.leader || 'warrior';
    parkParty();
    allies.forEach((a, k) => setUnit(a, lane.tx0 + [0, 1, 3, 4][k % 4], lane.ty));
    tryStealthSurprise = async function () { if (o.ambush) applySurpriseStun(encounterEnemyIndices.slice()); return !!o.ambush; };
    runLoreCheck = async function () {};
    detectReinforcements = function () { return []; };
    enemyAttackTurn = async function () {};
    const finish = () => {
      out.done = true;
      enemies[tgt].alive = false;
      if (o.removeSurvivor) encounterEnemyIndices = encounterEnemyIndices.filter((i) => i === tgt);
    };
    playerAttackTurn = async function () {
      if (o.attacker !== 'player' || out.done) return;
      out.actorAtTurn = ambushActorClass; out.round = encounterRound;
      out.flag = enemies[tgt].__ambushOpen === true;
      out.helpless = isHelplessStrike(enemies[tgt]);
      finish();
    };
    allyAttackTurn = async function (a) {
      if (o.attacker !== 'ally' || out.done || a.classKey !== o.classKey) return;
      out.actorAtTurn = ambushActorClass; out.round = encounterRound;
      out.flag = enemies[tgt].__ambushOpen === true;
      out.s = await strike(a, tgt);
      finish();
    };
    gameOver = false; dialogPaused = false; maxHp = Math.max(maxHp, 999); hp = maxHp;
    B.length = 0;
    const to = new Promise((res) => setTimeout(() => res('timeout'), 30000));
    try {
      out.ran = await Promise.race([runEncounter(o.made.slice()).then(() => 'done', (e) => 'throw ' + e), to]);
    } finally {
      allyAttackTurn = keep.allyAttackTurn; playerAttackTurn = keep.playerAttackTurn; enemyAttackTurn = keep.enemyAttackTurn;
      tryStealthSurprise = keep.tryStealthSurprise; runLoreCheck = keep.runLoreCheck; detectReinforcements = keep.detectReinforcements;
      leaderClassKey = keep.leader;
    }
    out.banners = ambushBanners();
    return out;
  };

  await arm('a1f', async () => {
    const [e0, e1] = board(['goblin', 'goblin']);
    const b1 = await battle({ made: [e0, e1], ambush: true, attacker: 'ally', classKey: 'rogue', removeSurvivor: true });
    const left = { alive: enemies[e1].alive, flag: enemies[e1].__ambushOpen === true };
    const b2 = await battle({ made: [e1], ambush: false, attacker: 'ally', classKey: 'rogue' });
    return { b1: { ran: b1.ran, done: b1.done, banners: b1.banners, s: b1.s }, left, b2: { ran: b2.ran, done: b2.done, banners: b2.banners, s: b2.s, flag: b2.flag, round: b2.round } };
  });

  /* ── §2 ── */
  await arm('a2a', async () => {
    const [e] = board(['goblin']);
    applySurpriseStun([e]); encounterRound = 1;
    const t = [enemies[e].stunned];
    const acted1 = await turn(e); t.push(enemies[e].stunned);
    const acted2 = await turn(e); t.push(enemies[e].stunned);
    return { t, acted: [acted1, acted2] };
  });
  const after = async (k) => {
    const [e] = board(['goblin']);
    applySurpriseStun([e]); encounterRound = 1;
    await turn(e);
    enemies[e].stunned = Math.max(enemies[e].stunned || 0, k);
    const before = enemies[e].stunned;
    encounterRound = 2;
    let skips = 0;
    while (skips < 5) { const a = await turn(e); if (a) break; skips++; }
    return { before, skips, end: enemies[e].stunned };
  };
  await arm('a2cBash', () => after(1));
  await arm('a2cSleep', () => after(2));

  /* ── §3 ── */
  await arm('a3a', async () => {
    const [e0, e1] = board(['goblin', 'goblin']);
    applySurpriseStun([e0, e1]); encounterRound = 1;
    await turn(e0); await turn(e1);
    const s0 = await strike(rogue, e0);
    const s1 = await strike(fighter, e1);
    return { s0, s1, banners: ambushBanners() };
  });
  const loopArm = async (o) => {
    const [e] = board(['goblin']);
    return battle(Object.assign({ made: [e], ambush: true }, o));
  };
  await arm('a3bRogue', () => loopArm({ attacker: 'ally', classKey: 'rogue' }));
  await arm('a3bWarrior', () => loopArm({ attacker: 'ally', classKey: 'warrior' }));
  await arm('a3bLeaderRogue', () => loopArm({ attacker: 'player', leader: 'rogue' }));
  await arm('a3c', async () => {
    const [e] = board(['goblin']);
    enemies[e].stunned = 1; encounterRound = 1;
    const s = await strike(rogue, e);
    return { s, banners: ambushBanners() };
  });
  await arm('a3d', async () => {
    const [e0] = board(['goblin']);
    applySurpriseStun([e0]); encounterRound = 1;
    await strike(rogue, e0);
    const n1 = ambushBanners().length;
    await strike(rogue, e0);
    const n1b = ambushBanners().length;
    const e1 = enemies.length;
    const fresh = createEnemy('goblin', lane.tx0 + 5, lane.ty);
    enemies.push(fresh); createEnemyDom(e1, fresh.def, fresh.type);
    fresh.alive = true; fresh.maxHp = 999; fresh.hp = 999; fresh.stunned = 0;
    setUnit(fresh, lane.tx0 + 5, lane.ty);
    applySurpriseStun([e1]);
    await strike(rogue, e1);
    return { n1, n1b, n2: ambushBanners().length };
  });
  M.finalGameOver = gameOver;
  return M;
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { errs: [], hits: {}, booted: 0 };
  const base = 'http://127.0.0.1:' + port + '/index.html';
  const openTab = async () => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => ctx.errs.push('pageerror :: ' + String((e && e.message) || e).slice(0, 300)));
    page.on('console', (m) => {
      const t = m.text();
      const hit = /^__MUTHIT__(\w+)/.exec(t);
      if (hit) { ctx.hits[hit[1]] = (ctx.hits[hit[1]] || 0) + 1; return; }
      if (m.type() === 'error' && /encounter error/.test(t)) ctx.errs.push('runEncounter :: ' + t.slice(0, 300));
    });
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((seed) => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', seed.scen);
        sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
        localStorage.setItem('dragonfighters.xp', String(seed.xp));
        localStorage.setItem('dragonfighters.prologueSeen', '1');
      } catch (e) {}
    }, { scen: SCENARIO, party: SEED_PARTY, xp: 45000 });
    return page;
  };
  const load = async (page, qs) => {
    await page.goto(base + qs, { waitUntil: 'domcontentloaded', timeout: 60000 });
    /* ⚠ 裸の識別子で待つ (classic script 直下の const/let は window に載らない) */
    await page.waitForFunction("typeof allies !== 'undefined' && allies.length > 0 && typeof enemies !== 'undefined'"
      + " && typeof createEnemy === 'function' && typeof AMBUSH_ROUND_ON !== 'undefined' && !!mapData", { timeout: 90000 });
    ctx.booted++;
  };

  const isAuto = (s) => !!s && !s.err && !!s.r && s.r.missed === false && s.r.isCrit === true && s.rolls[0] === 1 && s.hp1 < s.hp0 && /HELPLESS/.test(s.labels) && !/FUMBLE/.test(s.labels);
  const isFumble = (s) => !!s && !s.err && !!s.r && s.r.missed === true && s.r.outOfRange === false && s.rolls.length === 1 && s.rolls[0] === 1 && s.hp1 === s.hp0 && /FUMBLE/.test(s.labels);

  let page1 = null, page2 = null;
  try {
    /* ══════════ (0a) ソース (配信した版で数える = 変異が効く) ══════════ */
    {
      const c = countSites(servedIndex(mutKey));
      R.check('(0a)', '[装置] コメントを剥いで `helpless = isHelplessStrike(target|t)` が 15 件・`helpless = (target|t).stunned > 0` が 0 件', c.calls === 15 && c.raw === 0, c);
    }

    /* ══════════ 素 ══════════ */
    page1 = await openTab();
    await load(page1, '');
    const A = await page1.evaluate(PROBE);

    /* ══════════ ?ambushround=0 (別タブ) ══════════ */
    page2 = await openTab();
    await load(page2, '?ambushround=0');
    const O = await page2.evaluate(PROBE);
    /* (4b) 同じタブをクエリなしで読み直す */
    await load(page2, '');
    const O2 = await page2.evaluate(PROBE);

    const a = A.a1a || {};
    R.check('(0b)', '[装置] (1a) の一撃が実際に HP を減らし、見せ場のバナーが 1 回以上呼ばれた・盗賊と戦士の仲間が居る・通路が足りる',
      !!a.s && a.s.hp1 < a.s.hp0 && (a.banners || []).length >= 1 && A.allyKeys.indexOf('rogue') >= 0 && A.allyKeys.indexOf('warrior') >= 0 && A.laneLen >= 10,
      { hp: a.s && [a.s.hp0, a.s.hp1], banners: a.banners, allies: A.allyKeys, lane: A.laneLen, err: a.err });

    R.check('(1a)', '不意打ち → 敵の手番 (stunned 1→0) → 第 1 ラウンドの d20 = 1 が命中 + クリティカル (仲間 allyBasicAttack + 主人公 playerSingleAttack)',
      a.n === 2 && a.stun0 === 1 && a.acted === false && a.stun1 === 0 && a.flag === true && isAuto(a.s) && isAuto(a.sP), a);

    const b = A.a1b || {};
    R.check('(1b)', '同じ仕込みで encounterRound = 2 ⇒ d20 = 1 はファンブル (窓は閉じている)・バナーなし', isFumble(b.s) && (b.banners || []).length === 0, b);

    const c = A.a1c || {};
    R.check('(1c)', 'ボスに applySurpriseStun ⇒ stunned は付くが窓なし (手番の後の d20 = 1 はファンブル)',
      c.isBoss === true && c.stun0 === 1 && c.flag === false && c.acted === false && c.stun1 === 0 && isFumble(c.s) && (c.banners || []).length === 0, c);

    const d = A.a1d || {};
    R.check('(1d)', '盾バッシュ等だけで止めた敵 (不意打ちなし) ⇒ 手番の後は窓なし', d.acted === false && d.stun1 === 0 && d.open === false && isFumble(d.s) && (d.banners || []).length === 0, d);

    const e = A.a1e || {};
    R.check('(1e)', '手番の後でも canSneakOnTarget が真・第 2 ラウンドは (隣接役がいなければ) 偽', e.stun === 0 && e.r1 === true && e.r2 === false, e);

    const f = A.a1f || {};
    const fb1 = f.b1 || {}, fb2 = f.b2 || {}, fl = f.left || {};
    R.check('(1f)', '本物の runEncounter: 第 1 ラウンドに終わった戦闘の生き残りの印が次の交戦の初期化で消える (次の戦闘の第 1 ラウンドの d20 = 1 はファンブル)',
      fb1.ran === 'done' && fb1.done === true && isAuto(fb1.s) && fl.alive === true && fl.flag === true
      && fb2.ran === 'done' && fb2.done === true && fb2.flag === false && fb2.round === 1 && isFumble(fb2.s) && (fb2.banners || []).length === 0, f);

    const a2 = A.a2a || {};
    R.check('(2a)', '不意打ちされた敵の enemyAttackTurn 2 回 ⇒ 1 回目は行動せず stunned 0・2 回目は行動する', J(a2.t) === '[1,0,0]' && J(a2.acted) === '[false,true]', a2);
    const o2 = O.a2a || {};
    R.check('(2b)', '同じ手順を ?ambushround=0 で走らせ、stunned の推移と行動の有無が (2a) と一致', O.on === false && J(o2.t) === J(a2.t) && J(o2.acted) === J(a2.acted) && !!a2.t, { on: O.on, off: o2, def: a2 });
    const cb = A.a2cBash || {}, cs = A.a2cSleep || {};
    R.check('(2c)', '手番の後の盾バッシュ (1) / スリープ (2) ⇒ それぞれ 1 / 2 のまま第 2 ラウンドへ (スキップ 1 回 / 2 回)',
      cb.before === 1 && cb.skips === 1 && cb.end === 0 && cs.before === 2 && cs.skips === 2 && cs.end === 0, { bash: cb, sleep: cs });

    const a3 = A.a3a || {};
    R.check('(3a)', '1 戦で 2 体に一撃 ⇒ バナーは 1 回だけ', isAuto(a3.s0) && isAuto(a3.s1) && (a3.banners || []).length === 1, a3);

    const br = A.a3bRogue || {}, bw = A.a3bWarrior || {}, bl = A.a3bLeaderRogue || {};
    const has = (arr, re) => (arr || []).length === 1 && re.test(arr[0]);
    R.check('(3b)', '本物の手番ループ: 手番の主が盗賊 (仲間 / 主人公) ⇒ 「暗殺」/ 戦士 ⇒ 「不意の一撃」',
      br.ran === 'done' && br.done === true && br.actorAtTurn === 'rogue' && br.round === 1 && has(br.banners, /暗殺/)
      && bw.ran === 'done' && bw.done === true && bw.actorAtTurn === 'warrior' && bw.round === 1 && has(bw.banners, /不意の一撃/)
      && bl.ran === 'done' && bl.done === true && bl.actorAtTurn === 'rogue' && bl.helpless === true && has(bl.banners, /暗殺/), { rogue: br, warrior: bw, leader: bl });

    const a3c = A.a3c || {};
    R.check('(3c)', '不意打ちなしの stunned の敵を殴る ⇒ 自動命中するがバナーなし', isAuto(a3c.s) && (a3c.banners || []).length === 0, a3c);
    const a3d = A.a3d || {};
    R.check('(3d)', '次の不意打ちでまた 1 回出る (1 回 → 同じ窓の 2 撃目も 1 回 → 次の不意打ちで 2 回)', a3d.n1 === 1 && a3d.n1b === 1 && a3d.n2 === 2, a3d);

    const o4 = O.a1a || {};
    R.check('(4a)', 'index.html?ambushround=0 ⇒ (1a) の仕込みで d20 = 1 はファンブル・バナーなし・印なし', O.on === false && o4.stun1 === 0 && o4.flag === false && isFumble(o4.s) && (o4.banners || []).length === 0, { on: O.on, a: o4 });
    const o5 = O2.a1a || {};
    R.check('(4b)', 'sessionStorage に写り、クエリなしの再読み込みでも撤退のまま', O.ss === '1' && O2.ss === '1' && O2.on === false && isFumble(o5.s) && (o5.banners || []).length === 0, { ss: [O.ss, O2.ss], on: O2.on, a: o5 });

    const want = 3;
    R.check('(0c)', '[装置] 全ページが起動し pageerror 0 件・runEncounter の中の例外 0 件', ctx.booted === want && ctx.errs.length === 0, '起動 ' + ctx.booted + '/' + want + ' / err ' + J(ctx.errs.slice(0, 3)));
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await new Promise((r) => setTimeout(r, 200));   // console イベントの取りこぼしを避ける
    if (page1) await page1.close().catch(() => {});
    if (page2) await page2.close().catch(() => {});
  }
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_ambush_round_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  const run = async (port, key, label) => {
    const srv = await startServer(port, key);
    console.log('\n[vet] ════════ ' + label + ' (port ' + port + ') ════════');
    const R = await runSuite(browser, port, key, label);
    await stopServer(srv);
    return R;
  };
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      const R0 = await run(PORT, null, '(素・基準)');
      const s0 = summarize(R0, '[素・基準]');
      const hits0 = Object.keys(R0.hits);
      if (s0.failed || R0.length !== ALL_IDS.length || hits0.length) {
        console.error('[vet] ⛔ 素の基準で FAIL がある / 判定数が合わない / 変異の印が出た (' + J(R0.hits) + ') — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const R = await run(port, key, '[変異 ' + key + ']');
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const r0c = R.filter((r) => r.id === '(0c)')[0];
          const bootOk = !!r0c && r0c.ok;
          const hit = R.hits[key] || 0;
          const want = NEG_EXPECT[key] || [];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = red.filter((x) => want.indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = bootOk && hit > 0 && want.length > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)')
            + ' / 注入行の実行 ' + hit + ' 回 / 起動確認 ' + (bootOk ? 'OK' : 'NG') + ' → ' + (ok ? '✓ OK' : '✗ ' + (!bootOk ? '起動確認 NG ' : '') + (hit ? '' : '注入行が実行されていない ')
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, red, ok, bootOk, hit });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (赤 = 担当に完全一致)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(14) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 注入行 ' + r.hit + ' 回 / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルだけが赤くなりました (空振り 0・漏れ 0・注入行はすべて実行)');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const R = await run(port, MUTATE, '[変異 ' + MUTATE + ' (手回し)]');
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vet] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)') + ' / 注入行の実行 ' + (R.hits[MUTATE] || 0) + ' 回');
      exitCode = 0;
    } else {
      const R = await run(PORT, null, '(素)');
      const s = summarize(R, '');
      const hits = Object.keys(R.hits);
      if (hits.length) console.error('[vet] ⛔ 素で変異の印が出た: ' + J(R.hits));
      exitCode = (s.failed || R.length !== ALL_IDS.length || hits.length) ? 1 : 0;
    }
  } catch (e) {
    console.error('[vet] 例外: ' + ((e && e.stack) || e));
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    for (const s of SERVERS.slice()) await stopServer(s);
  }
  console.log('[vet] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
})();
