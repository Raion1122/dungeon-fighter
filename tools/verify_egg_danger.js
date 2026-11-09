#!/usr/bin/env node
/*
 * verify_egg_danger.js — 実装依頼書 #112「赤い卵を持ち帰った後の巣穴は ★ を増やす」の受入ドライバ
 *   (依頼書 実装依頼書/2026-11-09_egg-danger-stars.md §8 = 受入条件の唯一の正。型 = tools/verify_egg_parent.js)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_egg_danger.js                          # 素
 *   node tools/verify_egg_danger.js --negative               # 先に素の基準 → 変異 8 本 (port 10771〜10778)
 *   node tools/verify_egg_danger.js --negative --only lv4,nogate
 *   node tools/verify_egg_danger.js --mutate lv4             # 変異 1 本を載せて手回し (担当表を実走で決める用)
 *   node tools/verify_egg_danger.js --verbose                # 緑の節の詳細も全部出す
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome / git が無い)・例外
 *      3=装置の腐敗 (変異の注入点の数が違う・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 酒場を実 Chrome で開き、印の種まき (localStorage) と lastResult の 2 経路で、**実際に作られた札の DOM** と `scenarios` の実体を見る。
 *     ⭐ 本体は読み込みで 1 回だけ走る = 腕ごとに別の browser context で別のページを起動する (localStorage / sessionStorage が混ざらない)。
 *   - 種まきは __blank.html (同じ origin) で済ませてから tavern.html へ goto する。sessionStorage の plazaClock=21 は
 *     CLAUDE.md #102 のとおり (昼に走らせても歩ける酒場の札が同じになる)。
 *   - 札は id で引く (`#questTable_<id>`。札の並びは毎回変わる)。cleared=[] / [巣穴] なら卓は廃坑 + 巣穴の 2 枚に決まる (依頼書 §2-6)。
 *   - 仲間の帯は Math.random を 0 に固定して本番の assignCompanionLevels / questLevelOf を実体で呼ぶ (⛔ 帯の表を写経しない)。
 *   - (0a) は**配信されたバイト**を http で取り、正規表現で独立に読む (ページの実体を見ない)。(2c) の 11 件の比較はここで読んだ値とも突き合わせる。
 *   - 強さ (⑤) は assert にしない (~/.claude/dev-loop/r111/item3/probe_egg_clear.js で記録する。依頼書 §12-3)。
 *
 * ■ 依頼書 §8 からの言い直し (実装と項目1・2 の実測に合わせた点)
 *   - (0b) は札の実在に加え、§1〜§3 の腕で pageerror 0 件であること (空振りと例外を同時に潰す)。
 *   - (3a) は「印なしで開いた**その 1 回目**」を、redEgg().pending が真 (このページの寿命で初めて印が立った) で縛る。
 *     (3a)(3b) は lastResult が consumeResult() に消費された (sessionStorage から消えた) ことも見る (経路を通らずに緑にならない)。
 *   - 変異 beforeconsume は、関数を移すだけだと var RED_EGG_KEY がまだ undefined で門が常に閉じ、罠そのもの (§2-5 = 印を種まきした腕は ★★ で、
 *     持ち帰った回だけ ★) にならない。⇒ 移した先では鍵を文字列で持たせる。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] 配信バイトの scenarios 宣言: 全 12 件が読め、巣穴は ★ / 2
 *      (0b) [装置] 札 questTable_kobold-warren と .tavernSignDesc が実在・pageerror 0 件 (印なし / 印あり / 持ち帰り / 敗走 / 撤退の 5 腕)
 *      (0c) [装置] __TAVERN_TV.redEgg().mark が印ありの腕で真・印なしの腕で偽
 *   §1 (1a) 印なし: 札 ★・#metaDiff ★・questLevelOf(sc, 2) = 2
 *   §2 (2a) 印あり: 札 ★★・#metaDiff ★★  (2b) questLevelOf(sc, 2) = 5  (2c) 巣穴以外の 11 件が印なしの腕 (と配信バイト) と同じ
 *   §3 (3a) 持ち帰った回: その 1 回目で札 ★★・#metaDiff ★★  (3b) 敗走の回: 札 ★ のまま
 *   §4 (4a) 主人公 Lv4: 印なし = 仲間 Lv2 / 印あり = 仲間 Lv4  (4b) 主人公 Lv2: 両腕とも Lv2  (4c) 名簿の顔 (Lv3) は主人公 Lv4 で両腕とも Lv3
 *   §5 (5a) ?warren=0 + 印あり: pageerror 0 件・scenarios に巣穴が無い  (5b) index.html が基準 56ac565 と同じ
 *   §6 (Xa) ?eggdanger=0 + 印あり: 札 ★・questLevelOf(sc, 2) = 2
 *   ⛔ 測らないこと (依頼書 §8): ★ の字形・札の中の収まり・クリア率。
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。tavern.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列をメモリ上で差し替える
 *     (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。favicon.ico は 204。
 *   - 起動時に全変異のアンカーを**原本**で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *     ⚠ アンカーの改行は '\n' で書き、原本の改行コード (tavern.html は CRLF) へ合わせてから数える。
 *     ⭐ beforeconsume は塊を別の場所へ動かすので編集ごとの改行の数は揃わない ⇒ 行数はページ全体で検算する。
 *     罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持つ。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」+ 注入行の実行 > 0。
 *     担当は**実走で決めた** (--mutate で 1 本ずつ)。依頼書の予想 (NEG_PREDICTED) は記録として並べるだけ。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10770** (素) / 変異 **10771〜10778** (8 本・MUTATIONS の並び順)。⑤ の道具は 10755〜。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const VERBOSE = flag('verbose');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10770'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前と値 (データ) */
const KW = 'kobold-warren';
const EGG_KEY = 'dragonfighters.redEgg';
const STAR_BASE = '★', STAR_UP = '★★';
const LV_BASE = 2, LV_UP = 5;
const SCEN_COUNT = 12;
const BASE_REV = '56ac565';                     // #111 項目4 = #112 の着手前 (5b)
const BAND_WANT = {                             // §4 (依頼書 §2-4 の表の Math.random = 0 の列)
  plain: { hero4: 2, hero2: 2, named4: 3 },
  mark:  { hero4: 4, hero2: 2, named4: 3 },
};
const PLAZA_CLOCK = '21';

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_TAVERN = 'tavern.html';
const SERVED = [F_TAVERN];
const PRISTINE = {};
for (const f of SERVED) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const EOL = PRISTINE[F_TAVERN].indexOf('\r\n') >= 0 ? '\r\n' : '\n';
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function countOf(hay, needle) { if (!needle) return 0; let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
const nl = (s) => s.split('\n').join(EOL);          // アンカーの改行を原本の改行コードへ
const lf = (s) => s.replace(/\r\n/g, '\n');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 8 本)。逐語は HEAD 6b620da (項目2 の後) の行で取った。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const A_RETREAT = '      if (new URLSearchParams(location.search).get("eggdanger") === "0") return;';
const A_GATE = '      if (localStorage.getItem(RED_EGG_KEY) !== "1") return;';
const A_SAFE = '    if (!sc) return;\n    sc.difficulty =';      // ⭐ `if (!sc) return;` は単独でも 1 件だが、次の行の頭まで含めて本ドライバだけの字面にする
const A_STAR = '    sc.difficulty = "★★";';
const A_LV = '    sc.recommendedLevel = 5;';
const FN_HEAD = '  (function eggDangerOnWarren() {';
const FN_TAIL = '    sc.recommendedLevel = 5;\n  })();\n';
/* beforeconsume の行き先 = ?warren=0 のブロックの閉じの直後 (依頼書 §2-5)。⚠ その節のコメント行は verify_kobold_warren の錨なので使わない */
const A_WARREN_END = 'window.WORLD_MAP.retireWarren(); } catch (e) {}\n  })();\n';
/* beforeconsume で動かす塊 (関数の頭〜閉じ) を原本から切り出す。⚠ 改行は LF へ揃えて持つ (nl() が原本の改行へ戻す) */
const FN_BLOCK = (() => {
  const s = lf(PRISTINE[F_TAVERN]);
  const i = s.indexOf(FN_HEAD);
  const j = i >= 0 ? s.indexOf(FN_TAIL, i) : -1;
  if (i < 0 || j < 0) vetFail('本体の関数 eggDangerOnWarren の頭 / 閉じが原本に無い');
  return s.slice(i, j + FN_TAIL.length);
})();
const FN_BLOCK_EARLY = FN_BLOCK
  .replace(FN_HEAD, FN_HEAD + ' ' + HIT('beforeconsume') + ';   /* ★変異beforeconsume */')
  .replace('localStorage.getItem(RED_EGG_KEY)', 'localStorage.getItem(' + J(EGG_KEY) + ')');
const MUTATIONS = {
  /* ⭐ 関数を配列の直後へ移す (依頼書 §2-5 の罠そのもの)。⚠ 鍵は var RED_EGG_KEY がまだ undefined なので文字列で持たせる */
  beforeconsume: [
    { from: FN_BLOCK, to: '' },
    { from: A_WARREN_END, to: A_WARREN_END + FN_BLOCK_EARLY }],
  /* ⭐ 推奨 Lv を 4 に (依頼書 §2-4 = qGetTier が tier1 のままで仲間の帯が動かない) */
  lv4: [
    { from: A_LV, to: '    sc.recommendedLevel = (' + HIT('lv4') + ', 4);   /* ★変異lv4 */' }],
  /* 印の判定を外す */
  nogate: [
    { from: A_GATE, to: '      if ((' + HIT('nogate') + ', false)) return;   /* ★変異nogate */' }],
  /* recommendedLevel を変えない */
  staronly: [
    { from: A_LV, to: '    ' + HIT('staronly') + ';   /* ★変異staronly */' }],
  /* difficulty を変えない */
  lvonly: [
    { from: A_STAR, to: '    ' + HIT('lvonly') + ';   /* ★変異lvonly */' }],
  /* side の全件に適用 */
  allside: [
    { from: A_STAR, to: '    ' + HIT('allside') + '; scenarios.filter(function (s) { return s.side; }).forEach(function (s) { s.difficulty = "★★"; s.recommendedLevel = 5; });   /* ★変異allside */' }],
  /* if (!sc) return; を外す */
  nosafe: [
    { from: A_SAFE, to: '    ' + HIT('nosafe') + ';   /* ★変異nosafe */\n    sc.difficulty =' }],
  /* eggdanger の判定を外す */
  noretreat: [
    { from: A_RETREAT, to: '      if ((' + HIT('noretreat') + ', false)) return;   /* ★変異noretreat */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で 1 本ずつ実走して決めた (依頼書 §12-3 に表) */
const NEG_EXPECT = {
  beforeconsume: ['(3a)'],
  lv4:           ['(2b)', '(4a)'],
  nogate:        ['(1a)', '(3b)', '(4a)'],   /* 実測: 印なしの全腕が上がる = 敗走の札 (3b)・印なしの帯 (4a) も赤 */
  staronly:      ['(2b)', '(4a)'],
  lvonly:        ['(2a)', '(3a)'],
  allside:       ['(2c)'],
  nosafe:        ['(5a)'],
  noretreat:     ['(Xa)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = { beforeconsume: [], lv4: [], nogate: [], staronly: [], lvonly: [], allside: [], nosafe: [], noretreat: [] };
/* 依頼書 §8 の予想 (記録。⛔ 合否には使わない = 担当は実走で決める) */
const NEG_PREDICTED = {
  beforeconsume: ['(3a)'], lv4: ['(2b)', '(4a)'], nogate: ['(1a)'], staronly: ['(2b)', '(4a)'], lvonly: ['(2a)', '(3a)'],
  allside: ['(2c)'], nosafe: ['(5a)'], noretreat: ['(Xa)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
const mutPort = (key) => PORT + 1 + MUT_ORDER.indexOf(key);
if (MUT_ORDER.length !== 8) vetFail('変異は 8 本 (ポート 10771〜10778)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_MAYBE[k] || !NEG_PREDICTED[k])) vetFail('NEG_EXPECT / NEG_MAYBE / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length) vetFail('変異 ' + k + ' に必ず赤の節が無い');
  const both = NEG_EXPECT[k].filter((x) => NEG_MAYBE[k].indexOf(x) >= 0);
  if (both.length) vetFail('変異 ' + k + ' の ' + both.join(',') + ' が必ず赤と確率で赤の両方に居る');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

/* 罠E の自己検査: 他の tools/*.js が同じアンカーを持っていないこと (改行を含むアンカーは LF / CRLF の両方の形で)。
 * ⭐ 行の字面そのもの (前後の空白を除く) で引く。beforeconsume の塊は頭の 1 行と行き先のアンカーで引く */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self);
  const src = peers.map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  const anchors = new Set([A_RETREAT, A_GATE, A_SAFE, A_STAR, A_LV, FN_HEAD, A_WARREN_END]);
  for (const a of anchors) {
    const core = a.trim();
    const forms = [core, core.split('\n').join('\r\n')];
    const clash = src.filter((x) => forms.some((c) => x.s.indexOf(c) >= 0)).map((x) => x.f);
    if (clash.length) vetFail('変異のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(',') + ' / ' + core.slice(0, 120));
  }
}
for (const f of SERVED) if (countOf(PRISTINE[f], '__MUTHIT__') !== 0) vetFail('原本 ' + f + ' に __MUTHIT__ が在る');
const _mutCache = {};
function servedFile(file, key) {
  if (!key) return PRISTINE[file];
  const ck = key + '|' + file;
  if (_mutCache[ck] !== undefined) return _mutCache[ck];
  let s = PRISTINE[file];
  for (const e of MUTATIONS[key]) {
    const from = nl(e.from), to = nl(e.to);
    const c = countOf(PRISTINE[file], from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (to && countOf(PRISTINE[file], to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    if (countOf(s, from) !== 1) vetFail('変異 ' + key + ' の注入点が同じ変異の先の注入に食われた: ' + e.from.slice(0, 120));
    s = s.split(from).join(to);
  }
  if (s.split('\n').length !== PRISTINE[file].split('\n').length) vetFail('変異 ' + key + ' が ' + file + ' の行数を変えた');
  if (s === PRISTINE[file]) vetFail('変異 ' + key + ' が何も変えていない');
  if (countOf(s, '__MUTHIT__' + key) < 1) vetFail('変異 ' + key + ' に実行の印が無い');
  _mutCache[ck] = s;
  return s;
}
for (const k of MUT_ORDER) servedFile(F_TAVERN, k);

/* (5b) 基準の index.html。git show の失敗は環境 (exit 2) */
const gitOut = (args) => execFileSync('git', ['-C', ROOT].concat(args), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
let BASE_INDEX = null, BASE_INDEX_BLOB = null;
try {
  BASE_INDEX = gitOut(['show', BASE_REV + ':index.html']);
  BASE_INDEX_BLOB = gitOut(['rev-parse', BASE_REV + ':index.html']).trim();
} catch (e) { console.error('[vet] git show ' + BASE_REV + ':index.html に失敗: ' + e.message); process.exit(2); }
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で 1 件・行数不変・他ドライバとアンカーの重なり 0'
  + ' / 基準 = git ' + BASE_REV + ' (index.html ' + BASE_INDEX.length + ' 文字) / tavern.html の改行 ' + J(EOL));

/* (0a) 配信バイトの scenarios 宣言を正規表現で読む (⛔ ページの実体を見ない)。⚠ 値の後ろのコメント (巣穴の recommendedLevel) を許す。
 *   ⚠ キーの字面は `difficulty: "` (コメントの `difficulty "★★"` を拾わない)・字下げ 6 桁 (入れ子のオブジェクトを拾わない) */
function readScenariosFromBytes(txt) {
  const s = lf(txt);
  const i = s.indexOf('const scenarios = [');
  const j = i >= 0 ? s.indexOf('\n  ];', i) : -1;
  if (i < 0 || j < 0) return { err: 'scenarios の宣言が見つからない', rows: [] };
  const body = s.slice(i, j);
  const take = (re) => { const out = []; let m; while ((m = re.exec(body))) out.push(m[1]); return out; };
  const ids = take(/^ {6}id: "([^"]+)"/gm);
  const diffs = take(/^ {6}difficulty: "([^"]*)"/gm);
  const lvs = take(/^ {6}recommendedLevel: (\d+)/gm).map((x) => parseInt(x, 10));
  return { ids, diffs, lvs, rows: ids.map((id, k) => ({ id, difficulty: diffs[k], recommendedLevel: lvs[k] })) };
}

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
  const frozen = {};
  for (const f of SERVED) frozen[f] = Buffer.from(servedFile(f, mutKey), 'utf8');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === 'favicon.ico') { res.statusCode = 204; res.end(); return; }
        if (frozen[rel]) { res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()]); res.end(frozen[rel]); return; }
        if (rel === '__blank.html') { res.setHeader('Content-Type', MIME['.html']); res.end('<!doctype html><title>blank</title>'); return; }
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
function fetchServed(port, rel) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/' + rel }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(2a)', '(2b)', '(2c)', '(3a)', '(3b)', '(4a)', '(4b)', '(4c)', '(5a)', '(5b)', '(Xa)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok && !VERBOSE ? 300 : 6000));
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
 * ページ側の観測 (⛔ 期待値はここに書かない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const SEED = (A) => {
  localStorage.setItem('dragonfighters.prologueSeen', '1');
  sessionStorage.setItem('dragonfighters.plazaClock', A.clock);
  for (const k in A.ls) localStorage.setItem(k, A.ls[k]);
  if (A.lastResult) sessionStorage.setItem('dragonfighters.lastResult', JSON.stringify(A.lastResult));
};
/* ⚠ 札を読むのは openDialog の前 (読む順を腕で揃える) */
const OBSERVE = (WK) => {
  const r = {};
  const sc = scenarios.find((s) => s.id === WK);
  r.hasWarren = !!sc;
  r.count = scenarios.length;
  r.table = scenarios.map((s) => ({ id: s.id, difficulty: s.difficulty, recommendedLevel: s.recommendedLevel }));
  const t = document.getElementById('questTable_' + WK);
  r.signEl = !!t;
  const d = t && t.querySelector('.tavernSignDesc');
  r.descEl = !!d;
  r.sign = d ? d.textContent.trim() : null;
  r.signs = Array.from(document.querySelectorAll('[id^="questTable_"]')).map((e) => e.id);
  const eg = window.__TAVERN_TV && window.__TAVERN_TV.redEgg ? window.__TAVERN_TV.redEgg() : null;
  r.mark = eg ? eg.mark : null;
  r.pending = eg ? eg.pending : null;
  r.lastResultLeft = sessionStorage.getItem('dragonfighters.lastResult');
  if (sc) {
    r.ql2 = questLevelOf(sc, 2);
    openDialog(sc, true);
    const m = document.getElementById('metaDiff');
    r.meta = m ? m.textContent.trim() : null;
    /* §4 帯: Math.random を 0 に固定して本番を呼ぶ (⭐ finally で戻す) */
    const R0 = Math.random;
    Math.random = () => 0;
    try {
      const run = (hero, extra) => {
        const members = [Object.assign({ classKey: 'fighter', isHero: false }, extra || {})];
        assignCompanionLevels(members, questLevelOf(sc, hero), hero);
        return members[0].level;
      };
      r.band = { hero4: run(4), hero2: run(2), named4: run(4, { mercId: 'probe-merc', level: 3 }) };
    } finally { Math.random = R0; }
  }
  return r;
};

async function openArm(browser, port, ctx, arm) {
  const out = { name: arm.name, errs: [], obs: null, err: null };
  const bc = await browser.createBrowserContext();
  try {
    const page = await bc.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', (e) => out.errs.push(String((e && e.message) || e).slice(0, 200)));
    page.on('console', (m) => { const t = m.text(); const k = /__MUTHIT__(\w+)/.exec(t); if (k) ctx.hits[k[1]] = (ctx.hits[k[1]] || 0) + 1; });
    await page.goto('http://127.0.0.1:' + port + '/__blank.html', { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(SEED, { clock: PLAZA_CLOCK, ls: arm.ls || {}, lastResult: arm.lastResult || null });
    await page.goto('http://127.0.0.1:' + port + '/' + F_TAVERN + (arm.q || ''), { waitUntil: 'load', timeout: 60000 });
    /* 札が 1 枚でも出るのを待つ (⚠ ?warren=0 では巣穴の札は無いので id では待たない)。例外で本文が死んだ腕は待ち切りで次へ */
    await page.waitForFunction("document.querySelector('[id^=\"questTable_\"]') && window.__TAVERN_TV", { timeout: 12000 }).catch(() => {});
    await sleep(300);
    out.obs = await page.evaluate(OBSERVE, KW);
    await sleep(100);   // console イベントの取りこぼしを避ける
  } catch (e) {
    out.err = String((e && e.message) || e).slice(0, 300);
  } finally {
    await bc.close().catch(() => {});
  }
  return out;
}

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { hits: {} };
  const MARK = {}; MARK[EGG_KEY] = '1';
  const ARMS = {
    plain:   { name: 'plain', q: '', ls: {} },
    mark:    { name: 'mark', q: '', ls: MARK },
    carry:   { name: 'carry', q: '', ls: {}, lastResult: { cleared: true, scenarioId: KW } },
    defeat:  { name: 'defeat', q: '', ls: {}, lastResult: { defeated: true, scenarioId: KW } },
    warren0: { name: 'warren0', q: '?warren=0', ls: MARK },
    retreat: { name: 'retreat', q: '?eggdanger=0', ls: MARK },
  };
  try {
    const A = {};
    for (const k of Object.keys(ARMS)) A[k] = await openArm(browser, port, ctx, ARMS[k]);
    const O = {};
    for (const k of Object.keys(A)) O[k] = A[k].obs || {};
    const brief = (k) => ({ sign: O[k].sign, meta: O[k].meta, ql2: O[k].ql2, mark: O[k].mark, pending: O[k].pending, errs: A[k].errs, err: A[k].err });

    /* ── §0 ── */
    const bytes = readScenariosFromBytes(await fetchServed(port, F_TAVERN));
    const rowKW = (bytes.rows || []).find((r) => r.id === KW) || {};
    R.check('(0a)', '[装置] 配信バイトの scenarios 宣言から全 ' + SCEN_COUNT + ' 件の id / difficulty / recommendedLevel が読める・巣穴は ' + STAR_BASE + ' / ' + LV_BASE,
      !bytes.err && bytes.ids.length === SCEN_COUNT && bytes.diffs.length === SCEN_COUNT && bytes.lvs.length === SCEN_COUNT
        && new Set(bytes.ids).size === SCEN_COUNT && rowKW.difficulty === STAR_BASE && rowKW.recommendedLevel === LV_BASE,
      { err: bytes.err || null, n: [(bytes.ids || []).length, (bytes.diffs || []).length, (bytes.lvs || []).length], warren: rowKW });
    const SIGN_ARMS = ['plain', 'mark', 'carry', 'defeat', 'retreat'];
    R.check('(0b)', '[装置] 札 questTable_' + KW + ' と .tavernSignDesc が ' + SIGN_ARMS.join(' / ') + ' の全腕で実在・pageerror 0 件',
      SIGN_ARMS.every((k) => O[k].signEl === true && O[k].descEl === true && A[k].errs.length === 0 && !A[k].err),
      SIGN_ARMS.map((k) => k + ': 札 ' + O[k].signEl + ' / desc ' + O[k].descEl + ' / pageerror ' + J(A[k].errs) + (A[k].err ? ' / 例外 ' + A[k].err : '')).join(' ; '));
    R.check('(0c)', '[装置] __TAVERN_TV.redEgg().mark が印ありの腕 (mark / carry) で真・印なしの腕 (plain / defeat) で偽',
      O.mark.mark === true && O.carry.mark === true && O.plain.mark === false && O.defeat.mark === false,
      { mark: O.mark.mark, carry: O.carry.mark, plain: O.plain.mark, defeat: O.defeat.mark });

    /* ── §1 ── */
    R.check('(1a)', '印なし: 札 = ' + STAR_BASE + '・#metaDiff = ' + STAR_BASE + '・questLevelOf(sc, 2) = ' + LV_BASE,
      O.plain.sign === STAR_BASE && O.plain.meta === STAR_BASE && O.plain.ql2 === LV_BASE, brief('plain'));

    /* ── §2 ── */
    R.check('(2a)', '印あり: 札 = ' + STAR_UP + '・#metaDiff = ' + STAR_UP,
      O.mark.mark === true && O.mark.sign === STAR_UP && O.mark.meta === STAR_UP, brief('mark'));
    R.check('(2b)', '印あり: questLevelOf(sc, 2) = ' + LV_UP, O.mark.mark === true && O.mark.ql2 === LV_UP, { ql2: O.mark.ql2, mark: O.mark.mark });
    const othersOf = (o) => (o.table || []).filter((s) => s.id !== KW);
    const pOthers = othersOf(O.plain), mOthers = othersOf(O.mark), bOthers = (bytes.rows || []).filter((s) => s.id !== KW);
    const sameRows = (a, b) => J(a) === J(b);
    R.check('(2c)', '巣穴以外の ' + (SCEN_COUNT - 1) + ' 件の difficulty / recommendedLevel が印なしの腕と完全に同じ (配信バイトの宣言とも同じ)',
      pOthers.length === SCEN_COUNT - 1 && sameRows(pOthers, mOthers) && sameRows(mOthers, bOthers),
      { n: [pOthers.length, mOthers.length, bOthers.length], diff: mOthers.filter((s, i) => !sameRows(s, pOthers[i]) || !sameRows(s, bOthers[i])) });

    /* ── §3 ── */
    R.check('(3a)', '⭐ 持ち帰った回: 印なし + lastResult クリアで開いた**その 1 回目**に 札 = ' + STAR_UP + '・#metaDiff = ' + STAR_UP + ' (redEgg().pending 真 = このページで初めて印が立った・lastResult は消費済み)',
      O.carry.mark === true && O.carry.pending === true && O.carry.lastResultLeft === null && O.carry.sign === STAR_UP && O.carry.meta === STAR_UP, brief('carry'));
    R.check('(3b)', '敗走の回: 印なし + lastResult 敗走で開いて 札 = ' + STAR_BASE + ' のまま (印は立たない・lastResult は消費済み)',
      O.defeat.mark === false && O.defeat.lastResultLeft === null && O.defeat.sign === STAR_BASE, brief('defeat'));

    /* ── §4 ── */
    const bp = O.plain.band || {}, bm = O.mark.band || {};
    R.check('(4a)', '主人公 Lv4 (Math.random = 0): 印なし = 仲間 Lv' + BAND_WANT.plain.hero4 + ' / 印あり = 仲間 Lv' + BAND_WANT.mark.hero4,
      bp.hero4 === BAND_WANT.plain.hero4 && bm.hero4 === BAND_WANT.mark.hero4, { plain: bp, mark: bm });
    R.check('(4b)', '主人公 Lv2: 印あり・印なしともに仲間 Lv' + BAND_WANT.plain.hero2,
      bp.hero2 === BAND_WANT.plain.hero2 && bm.hero2 === BAND_WANT.mark.hero2, { plain: bp.hero2, mark: bm.hero2 });
    R.check('(4c)', '名簿の顔 (mercId + level: 3) は主人公 Lv4 で両腕とも Lv' + BAND_WANT.plain.named4,
      bp.named4 === BAND_WANT.plain.named4 && bm.named4 === BAND_WANT.mark.named4, { plain: bp.named4, mark: bm.named4 });

    /* ── §5 ── */
    const W0 = A.warren0;
    const w0Ok = !W0.err && W0.errs.length === 0 && O.warren0.hasWarren === false && O.warren0.count === SCEN_COUNT - 1 && O.warren0.mark === true;
    R.check('(5a)', '?warren=0 + 印あり: pageerror 0 件・scenarios に巣穴が無い (' + (SCEN_COUNT - 1) + ' 件)', w0Ok,
      { errs: W0.errs, err: W0.err, hasWarren: O.warren0.hasWarren, count: O.warren0.count, mark: O.warren0.mark, signs: O.warren0.signs });
    const curIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    let curBlob = null;
    try { curBlob = gitOut(['hash-object', '--path=index.html', path.join(ROOT, 'index.html')]).trim(); } catch (e) { curBlob = 'ERR ' + e.message; }
    R.check('(5b)', 'index.html が基準 ' + BASE_REV + ' と 1 バイトも違わない (blob のハッシュと、改行を揃えた全文)',
      curBlob === BASE_INDEX_BLOB && lf(curIndex) === lf(BASE_INDEX), { base: BASE_INDEX_BLOB, cur: curBlob, sameText: lf(curIndex) === lf(BASE_INDEX) });

    /* ── §6 ── */
    R.check('(Xa)', '?eggdanger=0 + 印あり: 札 = ' + STAR_BASE + '・questLevelOf(sc, 2) = ' + LV_BASE + ' (印は立ったまま)',
      O.retreat.mark === true && O.retreat.sign === STAR_BASE && O.retreat.ql2 === LV_BASE, brief('retreat'));
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_egg_danger_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  const run = async (port, key, lab) => {
    const srv = await startServer(port, key);
    console.log('\n[vet] ════════ ' + lab + ' (port ' + port + ') ════════');
    const t0 = Date.now();
    const R = await runSuite(browser, port, key, lab);
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
      const hits0 = Object.keys(R0.hits);
      if (s0.failed || R0.length !== ALL_IDS.length || hits0.length) {
        console.error('[vet] ⛔ 素の基準で FAIL がある / 判定数が合わない / 変異の印が出た (' + J(R0.hits) + ') — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = mutPort(key);
          const R = await run(port, key, '[変異 ' + key + ']');
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const hit = R.hits[key] || 0;
          const want = NEG_EXPECT[key], maybe = NEG_MAYBE[key];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = red.filter((x) => want.indexOf(x) < 0 && maybe.indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = hit > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + (maybe.length ? ' (確率で赤 ' + maybe.join(',') + ')' : '')
            + ' / 実際に赤くなった=' + (red.join(',') || '(なし)') + ' / 注入行の実行 ' + hit + ' 回 / 依頼書の予想=' + NEG_PREDICTED[key].join(',') + ' → ' + (ok ? '✓ OK' : '✗ ' + (hit ? '' : '注入行が実行されていない ')
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, maybe, red, ok, hit });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (必ず赤 ⊆ 赤 ⊆ 必ず赤 ∪ 確率で赤)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(13) + ' 担当 ' + r.want.join(',') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '')
          + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 注入行 ' + r.hit + ' 回');
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = mutPort(MUTATE);
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
