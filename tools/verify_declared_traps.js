#!/usr/bin/env node
/*
 * verify_declared_traps.js — 実装依頼書 #90「罠を宣言どおりに — 隊商護衛から罠を撤去」の受入ドライバ
 *   (依頼書 2026-10-12_declared-traps.md §8 + §12-0 K1 のユーザー決定 + §12-3)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_declared_traps.js                       # 素 (port 10617)
 *   node tools/verify_declared_traps.js --negative            # 素の基準 + 変異 5 本 (port 10618〜10622)
 *   node tools/verify_declared_traps.js --negative --only onlyscen,nodecl
 *   node tools/verify_declared_traps.js --mutate zeroall      # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる・#90 より前のツリー)
 *
 * ■ 方針 (依頼書 §8)
 *   - index.html を直接開き、sessionStorage に積荷を置いて読み込み直後の罠を数える。
 *     罠の数は 2 経路 = 内部配列 traps.length と DOM の #nodeLayer .trap 要素数で突き合わせる。
 *   - ⭐ 期待値を写経しない:
 *       隊商護衛の積荷 = tavern.html を開き、本物の QuestGen.generateQuest(…, forceFamilyId "caravan-escort") →
 *         buildPlazaSynthetic(q).__generated をそのまま index.html へ渡す (isCaravan 分岐の宣言 0 を実体で引く)。
 *       tier 表 = 同じページで QuestGen.combatParams({ tierKey }) の trapCount (tavern.html の DATA.tiers)。
 *       街道の襲撃 = js/road-events.js を vm で読んだ ROAD_EVENTS.AMBUSH_FIELD (world.html が丸写しする積荷)。
 *     引けなければ (0b) を赤にする (⛔ 固定値へ落とさない)。
 *   - (1b) 実物の街道積荷 (カスタム 1 部屋・EXCLUDED_ROOMS=[0] = 修正前から 0 個) と
 *     (1b') 合成の単一マップ積荷 (実物から themeId・mapDef を外す = 廃坑の単一マップへ落ちる = 2 段目を測る) に分ける (§12-0 K1)。
 *   - 全 index ページで Math.random を同じ種の mulberry32 へ差し替えてから読み込む (⭐ (2a) の ?graph=0 は RUN が無く素の乱数なので必須)。
 *
 * ■ 測っているもの
 *   §0 (0a) [装置] 対照腕 (生成クエスト tier1 = 宣言 3) で罠が宣言どおり 3 個 (配列・DOM) = 検出器が 0 を返す空振りでない
 *      (0b) [装置] 隊商の宣言 (buildPlazaSynthetic の isCaravan 分岐) と街道の宣言 (AMBUSH_FIELD) を実体から引けた (どちらも数値 0)・
 *           tier 表 4 段を実体から引けた (数値 ≥ 1)
 *      (0c) [装置] 各腕の scenarioId が期待どおり (generated-quest / road-ambush / 既定 7 シナリオ)・全ページ pageerror 0
 *   §1 (1a) 隊商護衛: currentScenario.trapCount === 0 かつ 罠 0 個 (配列・DOM)
 *      (1b) 街道の襲撃 (実物の積荷): 罠 0 個 (配列・DOM)。?trapdecl=0 でも 0 個 (= 不変・修正前から緑)
 *      (1b') 街道の襲撃 (合成の単一マップ積荷・宣言 0): currentScenario.trapCount === 0 かつ 罠 0 個 (配列・DOM) — 2 段目 (spawnTraps)
 *      (1c) 生成クエスト 宣言なし: 罠 3 個 (既定値 3 は残る)
 *      (1d) 生成クエスト tier1〜4: 罠 = 宣言値 (tier 表から)・配列 = DOM
 *   §2 (2a) 既定 7 シナリオ (?graph=0 の単一マップ) で罠の座標列が ?trapdecl=0 の腕と一致 + 絶対量 (合計 > 0・各腕で配列 = DOM)
 *   §3 (3a) ?trapdecl=0 → 隊商 (実体の積荷) と街道 (合成の単一マップ積荷) で罠 3 個 (従来の姿)
 *   ⛔ 測らないこと (依頼書 §8): 罠のダメージ・発見率・探索判定パネルの見た目 / 隠し宝箱の数
 *
 * ■ ⚠ 計測機構
 *   - index.html は起動時に 1 回だけ readFileSync して凍結し、変異はその文字列をメモリ上で差し替えて配る
 *     (⛔ 本番ファイルは 1 バイトも触らない)。他のファイル (tavern / js) は都度ディスクから配る。
 *   - 起動時に全変異のアンカーを原本で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     罠E の自己検査: 自分のアンカー (各行) が他の tools/*.js のソースに出てこないこと。崩れたら素でも exit 3。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」。
 *     earlyret は「赤にならないことを記録する腕」(NEG_EXPECT 空 = 担当外の赤 0 で合格・依頼書 §2-3 の裏取り)。
 *     担当は --mutate で実走して決めた (依頼書 §12-3)。依頼書 §8 の予想 (NEG_PREDICTED) と違う所はログに出す。
 *   - 決定性: 全腕の生の値から指紋 (sha1) を出す。同じツリーで 2 回走らせて指紋が一致すること (依頼書 §12-3)。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10617** (素) / 変異 **10618〜10622** (5 本・MUTATIONS の並び順)。次の新規ドライバ base = 10623。
 * ■ 所要は依頼書 §12-3 に記録。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10617'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた条件 (データ) */
const SEED = 90017;
const BASE_Q = '?intel=0';            // 起草時の probe と同じ (酒場 intel の割り込みを止める)
const SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair', 'tower-mother'];
const GEN_DEFAULT_TRAPS = 3;          // (1c) 宣言なしの既定値 (依頼書 §8 (1c)・index.html の `|| 3` は残す仕様)
const LEVEL_OF_TIER = { tier1: 1, tier2: 5, tier3: 11, tier4: 17 };   // 隊商の生成に使う水準 (宣言 0 は tier に依らない)

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const I = 'index.html';
const PRISTINE = { [I]: fs.readFileSync(path.join(ROOT, I), 'utf8') };
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[I].indexOf('const TRAP_DECL_ON') < 0) vetFail('配信する index.html に TRAP_DECL_ON が無い (#90 項目2 より前のツリーで走らせている)');
const EOL = PRISTINE[I].indexOf('\r\n') >= 0 ? '\r\n' : '\n';

/* ── 実体: 街道の積荷 (js/road-events.js を vm で読む = world.html が丸写しする AMBUSH_FIELD) ── */
let ROAD_REAL = null, ROAD_SYN = null, ROAD_ERR = null;
try {
  const ctx = { console: { log() {}, warn() {}, error() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'road-events.js'), 'utf8'), ctx);
  const RE = ctx.ROAD_EVENTS || (ctx.window && ctx.window.ROAD_EVENTS);
  ROAD_REAL = JSON.parse(JSON.stringify(RE.AMBUSH_FIELD));
  /* (1b') 合成の単一マップ積荷 = 実物から themeId・mapDef を外す (依頼書 §8 の「⚠ 項目1 で訂正」)。
     ⚠ start は mapDef.start と同じ値の写し (index.html は MAPDEF.start を出所にする) なので一緒に外す。 */
  ROAD_SYN = JSON.parse(JSON.stringify(ROAD_REAL));
  delete ROAD_SYN.themeId; delete ROAD_SYN.mapDef; delete ROAD_SYN.start;
} catch (e) { ROAD_ERR = String((e && e.message) || e); }

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 5 本)。⚠ 置換は行数不変。
 * ══════════════════════════════════════════════════════════════════════════════ */
const GEN_L1 = '        trapCount: (TRAP_DECL_ON && typeof _genScenario.trapCount === "number" && _genScenario.trapCount >= 0)';
const GEN_L2 = '                     ? _genScenario.trapCount : (_genScenario.trapCount || 3),';
const SPAWN_COUNT = '      const count = (TRAP_DECL_ON && typeof _tc === "number" && _tc >= 0) ? _tc : (_tc || 3);';
const MUTATIONS = {
  /* 生成クエストの組み立て (1 段目) だけ直し、spawnTraps (2 段目) を `|| 3` へ戻す (依頼書 §2-2 の罠) */
  onlyscen:  [{ file: I, from: SPAWN_COUNT, to: '      const count = _tc || 3; /* ★変異onlyscen */' }],
  /* spawnTraps だけ直し、生成クエストの組み立てを `|| 3` へ戻す (2 行の式を 1 行 + 注記へ = 行数不変) */
  onlyspawn: [{ file: I, from: GEN_L1 + EOL + GEN_L2, to: '        trapCount: _genScenario.trapCount || 3,' + EOL + '        /* ★変異onlyspawn */' }],
  /* spawnTraps の count を常に 0 */
  zeroall:   [{ file: I, from: SPAWN_COUNT, to: '      const count = 0; /* ★変異zeroall */' }],
  /* count 0 でシャッフル前に早期 return (依頼書 §2-3 の禁じ手) ⇒ 期待 = 緑 (担当外の赤 0 を記録する腕) */
  earlyret:  [{ file: I, from: SPAWN_COUNT, to: SPAWN_COUNT + ' if (count <= 0) return; /* ★変異earlyret */' }],
  /* 撤退の定数を常に false */
  nodecl:    [{ file: I, from: 'get("trapdecl") !== "0";', to: 'get("trapdecl") !== "0" && false; /* ★変異nodecl */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-3)。 */
const NEG_EXPECT = {
  onlyscen:  ["(1a)", "(1b')"],
  onlyspawn: ['(1a)'],
  zeroall:   ['(0a)', '(1c)', '(1d)', '(2a)', '(3a)'],   // (2a)(3a) = 絶対量の併設 (罠 0 個は ?trapdecl=0 の腕でも 0) の帰結 (§12-3)
  earlyret:  [],                                          // ⭐ 緑のまま = 記録する腕
  nodecl:    ['(1a)', "(1b')"],
};
/* 変異 → 時機しだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = { onlyscen: [], onlyspawn: [], zeroall: [], earlyret: [], nodecl: [] };
/* 依頼書 §8 の予想 ((1b) → (1b') の読み替え後。記録用。実走と違う所はログに出す) */
const NEG_PREDICTED = {
  onlyscen: ['(1a)', "(1b')"], onlyspawn: ['(1a)'], zeroall: ['(0a)', '(1c)', '(1d)'], earlyret: [], nodecl: ['(1a)', "(1b')"],
};
const EXPECT_GREEN = ['earlyret'];
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 5) vetFail('変異は 5 本まで (ポート 10618〜10622)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_MAYBE[k] || !NEG_PREDICTED[k])) vetFail('NEG_EXPECT / NEG_MAYBE / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length && EXPECT_GREEN.indexOf(k) < 0) vetFail('変異 ' + k + ' に必ず赤の節が無い');
  const both = NEG_EXPECT[k].filter((x) => NEG_MAYBE[k].indexOf(x) >= 0);
  if (both.length) vetFail('変異 ' + k + ' の ' + both.join(',') + ' が必ず赤と確率で赤の両方に居る');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self);
  const src = peers.map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) for (const line of e.from.split(EOL)) {
    const core = line.trim();
    const clash = src.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
    if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(',') + ' :: ' + core.slice(0, 80));
  }
}
const _mutCache = {};
function servedFiles(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key]) return _mutCache[key];
  const out = { [I]: PRISTINE[I] };
  for (const e of MUTATIONS[key]) {
    const c = countOf(PRISTINE[e.file], e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + e.file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE[e.file], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    out[e.file] = out[e.file].split(e.from).join(e.to);
  }
  if (out[I].split('\n').length !== PRISTINE[I].split('\n').length) vetFail('変異 ' + key + ' が ' + I + ' の行数を変えた');
  if (out[I] === PRISTINE[I]) vetFail('変異 ' + key + ' が何も変えていない');
  _mutCache[key] = out;
  return out;
}
for (const k of MUT_ORDER) servedFiles(k);
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本でちょうど 1 箇所・行数不変・他ドライバとアンカーの重なり 0 (EOL=' + J(EOL) + ')');

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  envFail('puppeteer-core が見つかりません');
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  envFail('Chrome/Edge が見つかりません (--browser <path>)');
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.md': 'text/markdown;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SERVERS = [];
function startServer(port, mutKey) {
  const files = servedFiles(mutKey);
  const buf = { [I]: Buffer.from(files[I], 'utf8') };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        res.on('error', () => {});
        let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (rel === '') rel = I;
        res.setHeader('Cache-Control', 'no-store');
        if (buf[rel]) { res.setHeader('Content-Type', MIME['.html']); res.end(buf[rel]); return; }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { try { res.statusCode = 500; res.end('500'); } catch (e2) {} }
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', "(1b')", '(1c)', '(1d)', '(2a)', '(3a)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 400 : 1500));
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
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 80) + '  -- ' + r.detail.slice(0, 500)));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed, failed };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ側 (⛔ 期待値の判定はここに書かない — 生の値だけ返す)
 * ══════════════════════════════════════════════════════════════════════════════ */
const ON_NEW_DOC = (o) => {
  try {
    if (window.top !== window) return;
    let a = o.seed >>> 0;
    Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    if (!sessionStorage.getItem('__v90once')) {
      localStorage.clear(); sessionStorage.clear();
      sessionStorage.setItem('__v90once', '1');
      localStorage.setItem('dragonfighters.prologueSeen', '1'); localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
      if (o.gen) sessionStorage.setItem('dragonfighters.generatedScenario', o.gen);
      if (o.road) sessionStorage.setItem('dragonfighters.roadBattle', o.road);
      if (o.scen) sessionStorage.setItem('dragonfighters.currentScenario', o.scen);
    }
  } catch (e) {}
};
/* 実体の宣言: tavern.html の本物の QuestGen / buildPlazaSynthetic を呼ぶ */
const TAVERN_DECL = (lv) => {
  const out = { err: null };
  try {
    out.seam = { QuestGen: typeof QuestGen, buildPlazaSynthetic: typeof buildPlazaSynthetic };
    const q = QuestGen.generateQuest(lv, { source: 'plaza', forceFamilyId: 'caravan-escort' });
    q._sentence = QuestGen.buildSentence(q);
    const s = buildPlazaSynthetic(q);          // ★本番の 生成クエスト → シナリオ 変換 (isCaravan 分岐)
    out.familyId = q.familyId || (q.family && q.family.id) || null;
    out.synthId = s.id;
    out.caravan = s.__generated;
    out.caravanJson = JSON.stringify(s.__generated);
    out.tiers = ['tier1', 'tier2', 'tier3', 'tier4'].map((k) => ({ k, trapCount: QuestGen.combatParams({ tierKey: k }).trapCount }));
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};
const MEASURE = () => {
  const g = (f) => { try { return f(); } catch (e) { return 'ERR ' + e.message; } };
  return {
    scenarioId: g(() => scenarioId), declTrap: g(() => currentScenario.trapCount),
    traps: g(() => traps.length), trapPos: g(() => traps.map((t) => [t.tx, t.ty])),
    dom: g(() => document.querySelectorAll('#nodeLayer .trap').length),
    RUN: g(() => !!RUN), decl: g(() => TRAP_DECL_ON),
    rooms: g(() => ROOMS.length), excl: g(() => [...EXCLUDED_ROOMS]),
  };
};
async function newPage(browser, ctx, label) {
  const page = await browser.newPage();
  ctx.pages++;
  page.on('pageerror', (e) => { ctx.errs.push(label + ': ' + String((e && e.message) || e).slice(0, 200)); });
  return page;
}
async function tavernArm(browser, port, ctx) {
  const out = { label: 'TV/tavern' };
  let page = null;
  try {
    page = await newPage(browser, ctx, out.label);
    await page.evaluateOnNewDocument(ON_NEW_DOC, { seed: SEED });
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('http://127.0.0.1:' + port + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => { try { return typeof QuestGen === 'object' && typeof buildPlazaSynthetic === 'function'; } catch (e) { return false; } },
      { timeout: 60000, polling: 100 });
    out.T = await page.evaluate(TAVERN_DECL, LEVEL_OF_TIER.tier1);
  } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
  finally { if (page) await page.close().catch(() => {}); }
  const t = out.T || {};
  console.log('    [腕] ' + out.label + (out.err ? ' 例外 ' + out.err : '') + ' family=' + t.familyId + ' 隊商 trapCount=' + (t.caravan ? J(t.caravan.trapCount) : 'なし')
    + ' tiers=' + J((t.tiers || []).map((x) => x.trapCount)) + (t.err ? ' err=' + t.err : ''));
  return out;
}
async function indexArm(browser, port, ctx, label, o) {
  const out = { label };
  let page = null;
  try {
    page = await newPage(browser, ctx, label);
    await page.evaluateOnNewDocument(ON_NEW_DOC, Object.assign({ seed: SEED }, o));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:' + port + '/index.html' + BASE_Q + (o.q || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => { try { return Array.isArray(traps) && !!currentScenario && !!document.getElementById('nodeLayer'); } catch (e) { return false; } },
      { timeout: 60000, polling: 100 });
    await sleep(1500);
    out.M = await page.evaluate(MEASURE);
  } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
  finally { if (page) await page.close().catch(() => {}); }
  const m = out.M || {};
  console.log('    [腕] ' + label + (out.err ? ' 例外 ' + out.err : '') + ' id=' + m.scenarioId + ' 宣言=' + J(m.declTrap) + ' 罠 ' + m.traps + '/' + m.dom
    + ' RUN=' + m.RUN + ' decl=' + m.decl + ' 部屋 ' + m.rooms + ' 除外 ' + J(m.excl));
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 判定
 * ══════════════════════════════════════════════════════════════════════════════ */
const isNum = (x) => typeof x === 'number' && isFinite(x);
const both = (a, n) => !!a && !a.err && !!a.M && a.M.traps === n && a.M.dom === n;
const view = (a) => (a && a.M ? { id: a.M.scenarioId, decl: a.M.declTrap, traps: a.M.traps, dom: a.M.dom, rooms: a.M.rooms, excl: a.M.excl, err: a.err || null } : { err: (a && a.err) || 'M なし' });

async function runSuite(browser, port) {
  const R = mkResults();
  const ctx = { errs: [], pages: 0 };
  const FP = {};
  try {
    const TV = await tavernArm(browser, port, ctx);
    const T = TV.T || {};
    const caravanJson = T.caravanJson || null;
    const tiers = T.tiers || [];
    const tierPay = (k, n) => JSON.stringify({ title: 'verify_declared_traps — ' + k, flavor: 'verify', spawns: [['goblin', 30, 14]], clearXp: 300,
      trapCount: n, hiddenChestCount: 2, perceptionDC: 12, themeId: 'goblin-mine' });
    const NODECL = JSON.stringify({ title: 'verify_declared_traps — 宣言なし', flavor: 'verify', spawns: [['goblin', 30, 14]], clearXp: 300, themeId: 'goblin-mine' });

    const A = {};
    A.caravan = caravanJson ? await indexArm(browser, port, ctx, 'A/隊商護衛 (実体)', { gen: caravanJson }) : { err: '隊商の積荷を引けなかった' };
    A.roadReal = ROAD_REAL ? await indexArm(browser, port, ctx, 'A/街道 (実物 AMBUSH_FIELD)', { road: J(ROAD_REAL) }) : { err: ROAD_ERR };
    A.roadSyn = ROAD_SYN ? await indexArm(browser, port, ctx, "A/街道 (合成 単一マップ)", { road: J(ROAD_SYN) }) : { err: ROAD_ERR };
    A.nodecl = await indexArm(browser, port, ctx, 'A/生成 宣言なし', { gen: NODECL });
    A.tiers = [];
    for (const t of tiers) A.tiers.push({ k: t.k, decl: t.trapCount, a: isNum(t.trapCount) ? await indexArm(browser, port, ctx, 'A/生成 ' + t.k + ' (宣言 ' + t.trapCount + ')', { gen: tierPay(t.k, t.trapCount) }) : { err: '宣言なし' } });
    const Z = {};
    Z.caravan = caravanJson ? await indexArm(browser, port, ctx, 'Z/隊商護衛 ?trapdecl=0', { gen: caravanJson, q: '&trapdecl=0' }) : { err: '隊商の積荷を引けなかった' };
    Z.roadSyn = ROAD_SYN ? await indexArm(browser, port, ctx, 'Z/街道 (合成) ?trapdecl=0', { road: J(ROAD_SYN), q: '&trapdecl=0' }) : { err: ROAD_ERR };
    Z.roadReal = ROAD_REAL ? await indexArm(browser, port, ctx, 'Z/街道 (実物) ?trapdecl=0', { road: J(ROAD_REAL), q: '&trapdecl=0' }) : { err: ROAD_ERR };
    const D = [];
    for (const s of SCENS) {
      const d = await indexArm(browser, port, ctx, 'D/' + s + ' ?graph=0', { scen: s, q: '&graph=0' });
      const z = await indexArm(browser, port, ctx, 'D/' + s + ' ?graph=0&trapdecl=0', { scen: s, q: '&graph=0&trapdecl=0' });
      D.push({ s, d, z });
    }
    /* 決定性の指紋 (生の値だけ) */
    const raw = (a) => (a && a.M ? [a.M.scenarioId, a.M.declTrap, a.M.traps, a.M.dom, a.M.trapPos] : ['ERR', a && a.err]);
    Object.assign(FP, { caravan: raw(A.caravan), roadReal: raw(A.roadReal), roadSyn: raw(A.roadSyn), nodecl: raw(A.nodecl),
      tiers: A.tiers.map((t) => [t.k, t.decl, raw(t.a)]), Zc: raw(Z.caravan), Zs: raw(Z.roadSyn), Zr: raw(Z.roadReal),
      D: D.map((x) => [x.s, raw(x.d), raw(x.z)]), tv: [T.familyId, T.caravan ? T.caravan.trapCount : null, tiers.map((t) => t.trapCount)] });

    /* ── §0 ── */
    const t1 = A.tiers.find((t) => t.k === 'tier1');
    R.check('(0a)', '[装置] 対照腕 (生成クエスト tier1 = 宣言 ' + (t1 ? t1.decl : '?') + ') で罠が宣言どおり (配列・DOM) = 検出器が 0 を返す空振りでない',
      !!t1 && isNum(t1.decl) && t1.decl >= 1 && both(t1.a, t1.decl), { decl: t1 && t1.decl, arm: t1 && view(t1.a) });
    const cv = T.caravan || {};
    const v0b = { tavernErr: T.err || TV.err || null, seam: T.seam, familyId: T.familyId, synthId: T.synthId,
      caravanTrap: cv.trapCount, caravanHasWaves: Array.isArray(cv.waves) && cv.waves.length > 0, caravanHasWagon: Array.isArray(cv.wagonSpawns) && cv.wagonSpawns.length > 0,
      roadErr: ROAD_ERR, roadTrap: ROAD_REAL ? ROAD_REAL.trapCount : null, roadHasMapDef: !!(ROAD_REAL && ROAD_REAL.mapDef),
      synHasMapDef: !!(ROAD_SYN && (ROAD_SYN.mapDef || ROAD_SYN.themeId)), tiers: tiers.map((t) => t.trapCount) };
    R.check('(0b)', '[装置] 隊商 (buildPlazaSynthetic の isCaravan 分岐) と街道 (AMBUSH_FIELD) の宣言を実体から引けた (数値 0)・tier 表 4 段 (数値 ≥ 1)',
      !v0b.tavernErr && v0b.familyId === 'caravan-escort' && v0b.synthId === 'generated-quest' && v0b.caravanTrap === 0 && v0b.caravanHasWaves && v0b.caravanHasWagon
        && !ROAD_ERR && v0b.roadTrap === 0 && v0b.roadHasMapDef && !v0b.synHasMapDef
        && tiers.length === 4 && tiers.every((t) => isNum(t.trapCount) && t.trapCount >= 1), v0b);
    const idWant = [[A.caravan, 'generated-quest'], [A.roadReal, 'road-ambush'], [A.roadSyn, 'road-ambush'], [A.nodecl, 'generated-quest'],
      [Z.caravan, 'generated-quest'], [Z.roadSyn, 'road-ambush'], [Z.roadReal, 'road-ambush']]
      .concat(A.tiers.map((t) => [t.a, 'generated-quest'])).concat(D.map((x) => [x.d, x.s])).concat(D.map((x) => [x.z, x.s]));
    const idBad = idWant.filter(([a, w]) => !(a && a.M && a.M.scenarioId === w)).map(([a, w]) => ({ label: a && a.label, want: w, got: a && a.M ? a.M.scenarioId : (a && a.err) }));
    R.check('(0c)', '[装置] 各腕の scenarioId が期待どおり (' + idWant.length + ' 腕)・全ページ pageerror 0',
      idBad.length === 0 && idWant.length === 7 + A.tiers.length + 2 * SCENS.length && ctx.errs.length === 0,
      'ページ ' + ctx.pages + ' 枚 / scenarioId の食い違い ' + J(idBad) + ' / pageerror ' + J(ctx.errs.slice(0, 3)));

    /* ── §1 ── */
    R.check('(1a)', '隊商護衛 (実体の積荷): currentScenario.trapCount === 0 かつ 罠 0 個 (配列・DOM)',
      !!A.caravan.M && A.caravan.M.declTrap === 0 && both(A.caravan, 0), view(A.caravan));
    R.check('(1b)', '街道の襲撃 (実物の積荷): 罠 0 個 (配列・DOM)・?trapdecl=0 でも 0 個 (不変)',
      both(A.roadReal, 0) && both(Z.roadReal, 0), { def: view(A.roadReal), trapdecl0: view(Z.roadReal) });
    R.check("(1b')", '街道の襲撃 (合成の単一マップ積荷・宣言 0): currentScenario.trapCount === 0 かつ 罠 0 個 (配列・DOM) — 2 段目 (spawnTraps)',
      !!A.roadSyn.M && A.roadSyn.M.declTrap === 0 && both(A.roadSyn, 0), view(A.roadSyn));
    R.check('(1c)', '生成クエスト 宣言なし: 罠 ' + GEN_DEFAULT_TRAPS + ' 個 (既定値は残る・配列・DOM)',
      both(A.nodecl, GEN_DEFAULT_TRAPS), view(A.nodecl));
    const v1d = A.tiers.map((t) => ({ k: t.k, decl: t.decl, arm: view(t.a), ok: isNum(t.decl) && t.decl >= 1 && both(t.a, t.decl) && t.a.M.declTrap === t.decl }));
    R.check('(1d)', '生成クエスト tier1〜4: 罠 = 宣言値 (tavern.html の tier 表から)・配列 = DOM',
      v1d.length === 4 && v1d.every((x) => x.ok), v1d);

    /* ── §2 ── */
    const v2a = D.map((x) => { const d = x.d.M || {}, z = x.z.M || {};
      return { s: x.s, run: [d.RUN, z.RUN], decl: [d.declTrap, z.declTrap], n: [d.traps, z.traps], dom: [d.dom, z.dom],
        same: J(d.trapPos) === J(z.trapPos), ok: !x.d.err && !x.z.err && d.RUN === false && z.RUN === false && Array.isArray(d.trapPos) && Array.isArray(z.trapPos)
          && J(d.trapPos) === J(z.trapPos) && d.traps === d.dom && z.traps === z.dom }; });
    const total = D.reduce((s, x) => s + ((x.d.M && isNum(x.d.M.traps)) ? x.d.M.traps : 0), 0);
    R.check('(2a)', '既定 7 シナリオ (?graph=0 の単一マップ) で罠の座標列が ?trapdecl=0 の腕と一致 + 絶対量 (合計 > 0・配列 = DOM)',
      v2a.length === SCENS.length && v2a.every((x) => x.ok) && total > 0, { total, v2a });

    /* ── §3 ── */
    R.check('(3a)', '?trapdecl=0 → 隊商 (実体の積荷) と街道 (合成の単一マップ積荷) で罠 3 個 (従来の姿・配列・DOM)',
      both(Z.caravan, 3) && both(Z.roadSyn, 3), { caravan: view(Z.caravan), roadSyn: view(Z.roadSyn) });
  } catch (e) {
    console.log('  ⛔ 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  R.fingerprint = crypto.createHash('sha1').update(J(FP)).digest('hex');
  console.log('[vet] 指紋 (生の値の sha1) = ' + R.fingerprint);
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_declared_traps_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  const run = async (port, key, lab) => {
    const srv = await startServer(port, key);
    console.log('\n[vet] ════════ ' + lab + ' (port ' + port + ') ════════');
    const t0 = Date.now();
    const R = await runSuite(browser, port);
    console.log('[vet] ' + lab + ' 所要 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
    await stopServer(srv);
    return R;
  };
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const R0 = await run(PORT, null, '(素・基準)');
      const s0 = summarize(R0, '[素・基準]');
      if (s0.failed || R0.length !== ALL_IDS.length) {
        console.error('[vet] ⛔ 素の基準で FAIL がある / 判定数が合わない — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const R = await run(port, key, '[変異 ' + key + ']');
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const want = NEG_EXPECT[key], maybe = NEG_MAYBE[key];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = red.filter((x) => want.indexOf(x) < 0 && maybe.indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = miss.length === 0 && leak.length === 0 && absent.length === 0;
          const predDiff = J(NEG_PREDICTED[key]) !== J(want) ? ' (依頼書 §8 の予想 ' + (NEG_PREDICTED[key].join(',') || '(なし)') + ' を実走で訂正)' : '';
          console.log('[vet] --negative ' + key + ': 担当=' + (want.join(',') || '(緑のまま = 記録する腕)') + (maybe.length ? ' (確率で赤 ' + maybe.join(',') + ')' : '') + predDiff
            + ' / 実際に赤くなった=' + (red.join(',') || '(なし)') + ' → ' + (ok ? '✓ OK' : '✗ '
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, maybe, red, ok });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が期待どおり (必ず赤 ⊆ 赤 ⊆ 必ず赤 ∪ 確率で赤・earlyret は赤 0)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(10) + ' 担当 ' + (r.want.join(',') || '(緑)') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '')
          + ' / 赤 ' + (r.red.join(',') || '(なし)'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤・担当外の赤 0');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const R = await run(port, MUTATE, '[変異 ' + MUTATE + ' (手回し)]');
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vet] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)'));
      exitCode = 0;
    } else {
      const R = await run(PORT, null, '(素)');
      const s = summarize(R, '');
      exitCode = (s.failed || R.length !== ALL_IDS.length) ? 1 : 0;
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
