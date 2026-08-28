#!/usr/bin/env node
/*
 * tools/verify_ability_scores.js — 能力値を D&D 5e の 6 能力へ一本化 (実装依頼書 #28 §8)
 * ════════════════════════════════════════════════════════════════════════════
 * 何を担保するか
 *   ① js/abilities.js が **6 能力スコアの唯一の正**になっている (移設であって改変ではない)
 *   ② 修正値の式が 5e の floor((score-10)/2) になっている
 *   ③ 5 ページ **全部** が js/abilities.js を読んでいる (罠 A)
 *   ④ 戦闘用修正値 (index.html CLASS_DEFS) が **1 も動いていない**
 *   ⑤ 撤退スイッチ ?ability5e=0 で B/X 式へ戻る
 *
 * ⭐⭐ 期待値を「ドライバへ書き写す」ことを避ける 2 経路
 *   旧スコア表は git から採る (`git show <BASE>:js/skill-check.js`)。
 *   ブラウザで評価した新モジュールと突き合わせるので、「移設のつもりで 1 マス
 *   書き換えた」を機械が捕まえる。⛔ 36 マスをドライバに直書きしない。
 *
 * ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   - DC の値 (DC_TIERS / disarmDC / exitHintDc / SCE1_*_DC)
 *   - PROFICIENCY_BONUS / HELP_BONUS
 *   - 戦闘用修正値の「値そのものが妥当か」((4b) は「変わっていないこと」だけを見る)
 *
 * 使い方:
 *     node tools/verify_ability_scores.js                    # 素
 *     node tools/verify_ability_scores.js --negative         # 負のコントロール (空振り 1 本で exit 1)
 *     node tools/verify_ability_scores.js --mutate bxmod     # 単一変異で走らせる
 *     node tools/verify_ability_scores.js --port 8930 --headful
 *   環境変数 DF_BASE_REF … 旧スコア表を採る git ref (既定 = #28 着手前の 6bd11b7)
 */
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT  = path.resolve(__dirname, '..');
const argv  = process.argv.slice(2);
const arg   = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag  = (n) => argv.includes('--' + n);
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE   = arg('mutate', null);
const PORT     = parseInt(arg('port', '8930'), 10);

/* ⭐ 旧スコア表と旧 CLASS_DEFS を採る ref。既定は **#28 着手前**のコミット。
 *   HEAD を既定にすると、実装後は「新版と新版」を比べることになり (1a) が永久緑になる。 */
const BASE = process.env.DF_BASE_REF || '6bd11b7';

const ABILITIES_JS = 'js/abilities.js';
const SKILL_JS     = 'js/skill-check.js';
const INDEX_HTML   = 'index.html';
const PAGES = ['index.html', 'tavern.html', 'town.html', 'world.html', 'title.html'];

const STUB_REL  = '__ability_probe.html';
const STUB_HTML = '<!doctype html><meta charset="utf-8"><title>probe</title>\n'
  + '<script src="' + ABILITIES_JS + '"></script>\n'
  + '<script src="' + SKILL_JS + '"></script>\n';

// ══════════════════════════════════════════════════════════════════════════════
// 変異表 (負のコントロール)
//   file/from/to … 配信スナップショットへの 1 行置換。⚠ ちょうど 1 箇所ヒットが起動時の条件。
//   targets   … 依頼書 §8 の表。**ここが赤くならなければ空振り = exit 1**。
//   evaluable … 変異ポートの測定で **実際に評価できる** assert。
//               ⛔ 測っていない節をここへ書かない (述語が例外 → 一律 false = 偽陽性)。
//   allowRed  … targets 以外で **赤くなるのが正しい**節。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  bxmod: {
    impl: true, file: ABILITIES_JS, targets: ['2a', '2c'],
    from: '    return USE_5E ? mod5e(s) : modBX(s);',
    to:   '    return modBX(s);  /* mut-bxmod: 5e 式への切替を握り潰す */',
    evaluable: ['0a', '1a', '1b', '1c', '2a', '2b', '2c', '4a', '5a', '5b'],
    allowRed: [],
    /* ⭐ (2b) と (5a)(5b) は緑のまま = 「B/X 式そのものは壊していない」ことがここで見える。
       ⭐ (5a)(5b) は「?ability5e=0 で B/X 値」を見るので、5e 側を潰しても緑。効きすぎ検出に効く。 */
    why: '修正値を旧 B/X 式へ差し戻す = 5e 化そのものが死ぬ。',
  },
  nocha: {
    impl: true, file: ABILITIES_JS, targets: ['1a', '1b'],
    from: '  var ABILITY_KEYS  = ["str", "dex", "con", "int", "wis", "cha"];',
    to:   '  (function () { for (var _k in CLASS_ABILITIES) { delete CLASS_ABILITIES[_k].cha; } })();  /* mut-nocha */  var ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];',
    evaluable: ['0a', '1a', '1b', '1c', '2a', '2b', '2c', '4a', '5a', '5b'],
    allowRed: ['2c', '5b'],
    /* ⭐ CHA を削ると persuasion / deception / intimidation の代表者スコアが崩れるので
       (2c)(5b) も道連れになる。これは欠陥の性質そのもの (§2-4 = CHA は既に判定で生きている)。 */
    why: '⭐ 6 能力から cha を落とす = 「CHA 込みで一本化」が死ぬ。',
  },
  tweak: {
    impl: true, file: ABILITIES_JS, targets: ['1a'],
    from: '    warrior: { str: 15, dex: 11, con: 14, int: 9,  wis: 10, cha: 11 },',
    to:   '    warrior: { str: 16, dex: 11, con: 14, int: 9, wis: 10, cha: 11 },  /* mut-tweak: 移設のついでに 1 マス書き換えた */',
    evaluable: ['0a', '1a', '1b', '1c', '2a', '2b', '2c', '4a', '5a', '5b'],
    allowRed: ['2c', '5b'],
    /* ⭐ warrior.str を 15→16 にすると athletics の代表者スコアが動くので (2c)(5b) も赤。
       ⛔ ここを targets にすると (1a) の空振りを見逃す。 */
    why: '⭐⭐ 「移設であって改変ではない」の機械証明。1 マスだけ書き換える誘惑。',
  },
  nopage: {
    impl: true, file: 'town.html', targets: ['3a'],
    from: '  <script src="js/abilities.js"></script>',
    to:   '  <!-- mut-nopage: town.html に <script src> を書き忘れた状態 -->',
    evaluable: ['0c', '3a', '3b', '3c', '4b', '4c'],
    allowRed: [],
    /* ⭐⭐⭐ 依頼書 §2-2 罠 A の再現。「skill-check があるから見えるはず」は
       town/world/title で false — 1 ページ落とすだけで (3a) だけが赤くなる。 */
    why: '⭐⭐⭐ 罠 A: 5 ページのうち 1 枚だけ <script src> を書き忘れる。',
  },
  shadow: {
    impl: true, file: SKILL_JS, targets: ['3b'],
    from: '  function classAbilities(classKey) {',
    to:   '  var CLASS_ABILITIES = { warrior: { str: 15, dex: 11, con: 14, int: 9, wis: 10, cha: 11 } };  /* mut-shadow: 旧スコア表の写しを復活させる */  function classAbilities(classKey) {',
    evaluable: ['0a', '1a', '1b', '1c', '2a', '2b', '2c', '3b', '3c', '4a'],
    allowRed: [],
    /* ⭐ 写しは未参照なので挙動は 1 つも変わらない = (1a)〜(2c) は全部緑のまま。
       「振る舞いでは捕まらない二重管理」を (3b) だけが捕まえることがここで見える。 */
    why: 'js/skill-check.js に旧スコア表の写しを復活させる = 二重管理のドリフトが再発する。',
  },
  combat: {
    impl: true, file: INDEX_HTML, targets: ['4b'],
    from: '        str: 3, dex: 1, con: 2, wis: 0, int: 0,',
    to:   '        str: 4, dex: 1, con: 2, wis: 0, int: 0,  /* mut-combat: 戦闘用修正値に手を出した */',
    evaluable: ['0c', '3a', '3b', '3c', '4b', '4c'],
    allowRed: [],
    why: '⛔ 本チケットの「戦闘は 1 も触らない」の機械証明。CLASS_DEFS.warrior.str を 3→4。',
  },
};
const MUT_ORDER = ['bxmod', 'nocha', 'tweak', 'nopage', 'shadow', 'combat'];
const MUT_IMPL  = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_TODO  = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING)'); process.exit(3);
}

// ══════════════════════════════════════════════════════════════════════════════
// 配信バイトの凍結 (別窓が同じリポを触っても測定が汚れないように)
// ══════════════════════════════════════════════════════════════════════════════
const SNAP = new Map();
function frozen(rel) {
  if (SNAP.has(rel)) return SNAP.get(rel);
  let buf = null;
  try {
    const fp = path.join(ROOT, rel);
    if (fp.startsWith(ROOT) && fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) buf = fs.readFileSync(fp);
  } catch (e) { buf = null; }
  SNAP.set(rel, buf);
  return buf;
}
for (const rel of [ABILITIES_JS, SKILL_JS].concat(PAGES)) frozen(rel);

const MUT_SRC = {};
for (const k of MUT_IMPL) {
  const m = MUTATIONS[k];
  const body = frozen(m.file);
  if (body === null) { console.error('[drv] ⛔ 変異 ' + k + ' の対象 ' + m.file + ' が読めない'); process.exit(3); }
  const src = body.toString('utf8');
  if (m.from.indexOf('\n') >= 0) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換**前**文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
    process.exit(3);
  }
  if (m.from.length === m.to.length) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
  }
  const n = src.split(m.from).length - 1;
  if (n !== 1) {
    console.error('[drv] ⛔ 変異 ' + k + ' の置換対象が ' + m.file + ' 内に ' + n
      + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(m.from.slice(0, 90)));
    process.exit(3);
  }
  MUT_SRC[k] = { file: m.file, body: src.split(m.from).join(m.to) };
}
const PORT_OF = {};
MUT_IMPL.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });
/** 変異ポートで実際に配信されるソース (変異対象でなければ凍結バイト) */
function servedSrc(mutKey, rel) {
  if (mutKey && MUT_SRC[mutKey] && MUT_SRC[mutKey].file === rel) return MUT_SRC[mutKey].body;
  const b = frozen(rel);
  return b === null ? '' : b.toString('utf8');
}

// ══════════════════════════════════════════════════════════════════════════════
// git から「#28 着手前」のスコア表と戦闘用修正値を採る
//   ⛔ ドライバに 36 マスも 50 マスも直書きしない (写経すると差分が消える)
// ══════════════════════════════════════════════════════════════════════════════
function gitShow(rel) {
  try {
    return execFileSync('git', ['show', BASE + ':' + rel],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { return null; }
}
/** `warrior: { str: 15, dex: 11, ... },` の並びを {warrior:{str:15,...}} へ */
function parseAbilityTable(body) {
  if (!body) return null;
  const out = {};
  const re = /(\w+)\s*:\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const cells = {};
    const re2 = /(\w+)\s*:\s*(-?\d+)/g;
    let m2;
    while ((m2 = re2.exec(m[2])) !== null) cells[m2[1]] = parseInt(m2[2], 10);
    out[m[1]] = cells;
  }
  return Object.keys(out).length ? out : null;
}
const OLD_SKILL_SRC = gitShow(SKILL_JS);
const OLD_TABLE = (() => {
  if (!OLD_SKILL_SRC) return null;
  const m = OLD_SKILL_SRC.match(/CLASS_ABILITIES\s*=\s*\{([\s\S]*?)\n\s*\};/);
  return m ? parseAbilityTable(m[1]) : null;
})();
function tableCells(t) {
  if (!t) return 0;
  return Object.keys(t).reduce((n, k) => n + Object.keys(t[k]).length, 0);
}

/** index.html の CLASS_DEFS から「戦闘用修正値」だけを抜く (str/dex/con/wis/int) */
const COMBAT_KEYS = ['str', 'dex', 'con', 'wis', 'int'];
function parseCombatMods(src) {
  if (!src) return null;
  const i = src.indexOf('const CLASS_DEFS = {');
  if (i < 0) return null;
  const block = src.slice(i);
  const out = {};
  const re = /\n {6}(\w+):\s*\{([\s\S]*?)\n {6}\},/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const line = m[2].match(/str:\s*(-?\d+),\s*dex:\s*(-?\d+),\s*con:\s*(-?\d+),\s*wis:\s*(-?\d+),\s*int:\s*(-?\d+)/);
    if (!line) continue;
    out[m[1]] = { str: +line[1], dex: +line[2], con: +line[3], wis: +line[4], int: +line[5] };
    if (Object.keys(out).length > 64) break;   // 保険 (CLASS_DEFS の外へ流れ出た時)
  }
  return Object.keys(out).length ? out : null;
}
const OLD_COMBAT = parseCombatMods(gitShow(INDEX_HTML));

// ══════════════════════════════════════════════════════════════════════════════
// Node 側で独立に組む期待値 (§2-3 の予告表の検算)
//   ⭐ ブラウザの DFAbilities を一切通さず、git から採った旧スコア表 + 判定表 +
//     習熟表だけから 5e / B/X 双方の「代表者スコア」を計算する。
//   ⚠ 判定表 (CHECKS) と習熟表 (CLASS_PROFICIENCIES) は #28 が 1 文字も触らないので、
//     ブラウザから採っても「新実装で新実装を測る」ことにはならない。
// ══════════════════════════════════════════════════════════════════════════════
const bxMod = (s) => (s <= 3 ? -3 : s <= 5 ? -2 : s <= 8 ? -1 : s <= 12 ? 0 : s <= 15 ? 1 : s <= 17 ? 2 : 3);
const e5Mod = (s) => Math.floor((s - 10) / 2);
function expectReps(table, checks, profs, modFn) {
  const out = {};
  if (!table || !checks || !profs) return out;
  for (const ck of Object.keys(checks)) {
    const ab = checks[ck].ability;
    let best = null;
    for (const cls of Object.keys(table)) {
      const sc = table[cls] ? table[cls][ab] : undefined;
      if (typeof sc !== 'number') continue;
      const prof = ((profs[cls] || []).indexOf(checks[ck].profKey) >= 0) ? 2 : 0;
      const v = modFn(sc) + prof;
      if (best === null || v > best) best = v;
    }
    out[ck] = best;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると startServer の
 *   try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = decodeURIComponent(req.url.split('?')[0]);
        const rel = u.replace(/^\/+/, '') || 'index.html';
        if (rel === STUB_REL) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(STUB_HTML); return;
        }
        if (mutKey && MUT_SRC[mutKey] && rel === MUT_SRC[mutKey].file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(MUT_SRC[mutKey].body); return;
        }
        const buf = frozen(rel);
        if (buf === null) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buf);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// 判定 (PASSED / FAILED / PENDING の 3 値)
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + name + (detail ? '  — ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, state: 'PENDING', detail: why || '' });
  console.log('  **PENDING** ' + name + (why ? '  — ' + why : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ① エンジン単体 — スタブページに abilities.js + skill-check.js だけを載せて読む
//   ⭐ ゲーム本体を開かないのは軽さのためではなく、**データ層とページの結線を
//     別々に測る**ため (結線は §3 の担当)。
// ══════════════════════════════════════════════════════════════════════════════
async function probeEngine(browser, base, query) {
  const out = { errs: [] };
  const page = await browser.newPage();
  page.on('pageerror', e => out.errs.push(e.message));
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
  await page.goto(base + '/' + STUB_REL + (query || ''), { waitUntil: 'load', timeout: 30000 });
  const d = await page.evaluate(() => {
    const o = { has: false };
    const A = window.DFAbilities;
    o.has = !!A;
    o.hasSC = !!(window.SkillCheck && window.SkillCheck.checkScore);
    if (!A) return o;
    o.table   = JSON.parse(JSON.stringify(A.CLASS_ABILITIES || {}));
    o.use5e   = !!(A.use5e && A.use5e());
    o.abbr    = JSON.parse(JSON.stringify(A.ABILITY_ABBR || {}));
    o.modAll  = []; for (let s = 1; s <= 30; s++) o.modAll.push(A.abilityMod(s));
    o.modBX   = [3, 5, 8, 12, 15, 17, 18].map(s => A.modBX(s));
    o.mod5e   = [3, 5, 8, 12, 15, 17, 18].map(s => A.mod5e(s));
    if (!o.hasSC) return o;
    o.scTable = JSON.parse(JSON.stringify(window.SkillCheck.CLASS_ABILITIES || {}));
    o.checks  = JSON.parse(JSON.stringify(window.SkillCheck.CHECKS || {}));
    o.profs   = JSON.parse(JSON.stringify(window.SkillCheck.CLASS_PROFICIENCIES || {}));
    // ── 代表者スコア: 6 職フルパーティで 12 判定を回す (本番の selectRepresentative を使う)
    const party = Object.keys(o.table).map(k => ({ classKey: k, name: k }));
    o.partyN = party.length;
    o.reps = {};
    for (const ck of Object.keys(o.checks)) {
      const cd = o.checks[ck];
      const rep = window.SkillCheck.selectRepresentative(party, cd);
      o.reps[ck] = { score: rep ? window.SkillCheck.checkScore(rep, cd) : null,
                     rep: rep ? rep.classKey : null };
    }
    // ── (4a) 恒等: breakdown.total === checkScore (全 CHECKS × 全クラス)
    o.ident = { n: 0, bad: [] };
    for (const ck of Object.keys(o.checks)) for (const cls of Object.keys(o.table)) {
      const m = { classKey: cls, name: cls }, cd = o.checks[ck];
      const a = window.SkillCheck.checkScore(m, cd);
      const b = window.SkillCheck.checkScoreBreakdown(m, cd, 0).total;
      o.ident.n++;
      if (a !== b) o.ident.bad.push(ck + '/' + cls + ' ' + a + '!=' + b);
    }
    return o;
  });
  await page.close();
  return Object.assign(out, d);
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定 ② 搭載 — 5 ページを実際に http で開き、window.DFAbilities が生えているか
//   ⭐ これが §2-2 罠 A (「共有モジュールだから全ページで見える」は成立しない) の検査。
// ══════════════════════════════════════════════════════════════════════════════
async function probePages(browser, base) {
  const out = {};
  for (const rel of PAGES) {
    const r = { status: 0, hasDF: false, cells: 0, errs: [] };
    const page = await browser.newPage();
    page.on('pageerror', e => r.errs.push(e.message));
    try {
      await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
      const resp = await page.goto(base + '/' + rel, { waitUntil: 'domcontentloaded', timeout: 40000 });
      r.status = resp ? resp.status() : 0;
      await sleep(350);
      const d = await page.evaluate(() => {
        const A = window.DFAbilities;
        if (!A || !A.CLASS_ABILITIES) return { hasDF: false, cells: 0 };
        return { hasDF: true,
          cells: Object.keys(A.CLASS_ABILITIES)
            .reduce((n, k) => n + Object.keys(A.CLASS_ABILITIES[k]).length, 0) };
      });
      r.hasDF = d.hasDF; r.cells = d.cells;
    } catch (e) { r.errs.push('goto: ' + (e && e.message)); }
    await page.close();
    out[rel] = r;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// assert 一覧 (id / 見出し / 述語)。述語は測定結果 M だけを見る純関数。
// ══════════════════════════════════════════════════════════════════════════════
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function diffTable(a, b) {
  const bad = [];
  const keys = Array.from(new Set(Object.keys(a || {}).concat(Object.keys(b || {}))));
  for (const k of keys) {
    const x = (a || {})[k] || {}, y = (b || {})[k] || {};
    const cells = Array.from(new Set(Object.keys(x).concat(Object.keys(y))));
    for (const c of cells) if (x[c] !== y[c]) bad.push(k + '.' + c + ' ' + x[c] + '→' + y[c]);
  }
  return bad;
}
const CHECK_ORDER = ['perception', 'investigation', 'sleightOfHand', 'stealth', 'athletics',
  'arcana', 'history', 'religion', 'insight', 'persuasion', 'intimidation', 'deception'];

const ASSERTS = [
  // ── §0 装置 ────────────────────────────────────────────────────────────────
  ['0a', 'スタブページで window.DFAbilities が生えている', (M) => {
    const e = M.eng;
    return [!!(e && e.has), e && e.has ? 'DFAbilities 有り / SkillCheck ' + (e.hasSC ? '有り' : '⛔無し')
      : '⛔ 無い — 以降の assert が undefined 比較で空振りし、永久緑になる'];
  }],
  ['0b', '[装置] 旧スコア表を git (' + BASE + ':' + SKILL_JS + ') から 36 マス採れた', (M) => {
    const n = tableCells(M.oldTable);
    const cls = Object.keys(M.oldTable || {}).length;
    return [n === 36 && cls === 6, n + ' マス / ' + cls + ' 職'
      + (n === 36 && cls === 6 ? '' : '  ⛔ 採れないと (1a) が写経になる。DF_BASE_REF に #28 着手前の hash を渡す')];
  }],
  ['0b2', '[装置] 旧 CLASS_DEFS (戦闘用修正値) を git から採れた', (M) => {
    const n = Object.keys(M.oldCombat || {}).length;
    return [n >= 6, n + ' 定義' + (n >= 6 ? ' × ' + COMBAT_KEYS.length + ' 能力' : '  ⛔ (4b) が空振りする')];
  }],
  ['0c', '[装置] 5 ページすべてが HTTP 200 で読めている (母集団 = 5)', (M) => {
    const bad = PAGES.filter(p => (M.pages[p] || {}).status !== 200);
    return [bad.length === 0, bad.length ? '⛔ 200 でない: ' + bad.join(',') : PAGES.join(' / ')];
  }],

  // ── §1 スコア表 (移設であって改変ではない) ─────────────────────────────────
  ['1a', 'DFAbilities.CLASS_ABILITIES の 36 マスが着手前と完全一致 (移設であって改変ではない)', (M) => {
    if (!M.eng.has || !M.oldTable) return [false, '⛔ 母集団が無い'];
    const bad = diffTable(M.oldTable, M.eng.table);
    return [bad.length === 0, bad.length ? '⛔ 差分 ' + bad.length + ' 件: ' + bad.join(' / ')
      : '36 マス一致 (git ' + BASE + ' との 2 経路照合)'];
  }],
  ['1b', '6 職すべてが cha を持つ (CHA 込みで一本化)', (M) => {
    const t = M.eng.table || {};
    const cls = Object.keys(t);
    const miss = cls.filter(k => typeof t[k].cha !== 'number');
    return [cls.length === 6 && miss.length === 0,
      cls.length + ' 職' + (miss.length ? '  ⛔ cha 欠落: ' + miss.join(',') : ' すべて cha 有り')];
  }],
  ['1c', 'SkillCheck.CLASS_ABILITIES (転送) が DFAbilities のものと同一内容', (M) => {
    if (!M.eng.hasSC) return [false, '⛔ SkillCheck が無い'];
    const bad = diffTable(M.eng.table, M.eng.scTable);
    return [bad.length === 0 && tableCells(M.eng.scTable) > 0,
      bad.length ? '⛔ 差分: ' + bad.join(' / ') : '転送 ' + tableCells(M.eng.scTable) + ' マス一致'];
  }],

  // ── §2 修正値の式 ──────────────────────────────────────────────────────────
  ['2a', 's = 1..30 の全域で abilityMod(s) === floor((s-10)/2) (5e 式)', (M) => {
    const got = M.eng.modAll || [];
    const want = []; for (let s = 1; s <= 30; s++) want.push(Math.floor((s - 10) / 2));
    const bad = [];
    for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) bad.push('s=' + (i + 1) + ' ' + got[i] + '≠' + want[i]);
    return [got.length === 30 && bad.length === 0,
      bad.length ? '⛔ ' + bad.length + ' 件: ' + bad.slice(0, 6).join(' / ') : '30/30 一致'];
  }],
  ['2b', 'modBX が旧 B/X 式と一致 (撤退経路が生きている)', (M) => {
    const want = [-3, -2, -1, 0, 1, 2, 3];
    return [deepEq(M.eng.modBX, want), '[3,5,8,12,15,17,18] → ' + JSON.stringify(M.eng.modBX)
      + (deepEq(M.eng.modBX, want) ? '' : ' ⛔ 期待 ' + JSON.stringify(want))];
  }],
  ['2c', '代表者スコアの実測が「旧表 + 5e 式」の独立計算と一致し、下がる判定が 0 件', (M) => {
    if (!M.eng.hasSC || !M.exp5e || !Object.keys(M.exp5e).length) return [false, '⛔ 母集団が無い'];
    const bad = [], up = [], down = [], flat = [];
    for (const ck of CHECK_ORDER) {
      const got = (M.eng.reps[ck] || {}).score;
      const w5 = M.exp5e[ck], wb = M.expBX[ck];
      if (got !== w5) bad.push(ck + ' ' + got + '≠' + w5);
      if (w5 > wb) up.push(ck); else if (w5 < wb) down.push(ck); else flat.push(ck);
    }
    const ok = bad.length === 0 && down.length === 0 && up.length === M.UP_N && flat.length === M.FLAT_N;
    return [ok, (bad.length ? '⛔ 実測≠期待 ' + bad.join(' / ') + '  ' : '')
      + '上昇 ' + up.length + ' / 据置 ' + flat.length + ' / 下降 ' + down.length
      + '  +1=' + up.join(',')
      + (ok ? '' : '  ⛔ 予告は 上昇 ' + M.UP_N + ' / 据置 ' + M.FLAT_N + ' / 下降 0')];
  }],

  // ── §3 搭載 (罠 A) ─────────────────────────────────────────────────────────
  ['3a', '5 ページ **すべて** で window.DFAbilities が truthy (1 枚でも欠けたら赤)', (M) => {
    const bad = PAGES.filter(p => !(M.pages[p] || {}).hasDF);
    return [bad.length === 0, bad.length ? '⛔ 載っていない: ' + bad.join(',')
      : PAGES.map(p => p.replace('.html', '') + ':' + (M.pages[p].cells || 0)).join(' ')];
  }],
  ['3b', SKILL_JS + ' に自前のスコア表の写しが残っていない ("str: 15" が現れない)', (M) => {
    const n = (M.skillSrc.split('str: 15').length - 1);
    return [n === 0, n === 0 ? '写し無し' : '⛔ ' + n + ' 箇所 — 二重管理が復活している'];
  }],
  ['3c', SKILL_JS + ' に自前の B/X 式の写しが残っていない', (M) => {
    const n = (M.skillSrc.split('if (score <= 15) return 1;').length - 1);
    return [n === 0, n === 0 ? '写し無し' : '⛔ ' + n + ' 箇所'];
  }],

  // ── §4 恒等 (非退行) ───────────────────────────────────────────────────────
  ['4a', 'checkScoreBreakdown.total === checkScore (全 CHECKS × 全クラス = 72 組)', (M) => {
    const id = M.eng.ident || { n: 0, bad: [] };
    return [id.n === 72 && id.bad.length === 0,
      id.n + ' 組' + (id.n === 72 ? '' : ' ⛔ 母集団が 72 でない')
      + (id.bad.length ? '  ⛔ 不一致: ' + id.bad.slice(0, 5).join(' / ') : '')];
  }],
  ['4b', '⛔ 戦闘用修正値 (index.html CLASS_DEFS) が 1 も動いていない', (M) => {
    if (!M.oldCombat || !M.newCombat) return [false, '⛔ 母集団が無い'];
    const bad = [];
    const keys = Array.from(new Set(Object.keys(M.oldCombat).concat(Object.keys(M.newCombat))));
    for (const k of keys) {
      const a = M.oldCombat[k], b = M.newCombat[k];
      if (!a || !b) { bad.push(k + ' 定義が増減'); continue; }
      for (const c of COMBAT_KEYS) if (a[c] !== b[c]) bad.push(k + '.' + c + ' ' + a[c] + '→' + b[c]);
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : Object.keys(M.newCombat).length + ' 定義 × ' + COMBAT_KEYS.length + ' = '
        + (Object.keys(M.newCombat).length * COMBAT_KEYS.length) + ' マスが git ' + BASE + ' と一致'];
  }],
  ['4c', '5 ページすべてで pageerror ゼロ', (M) => {
    const bad = PAGES.filter(p => ((M.pages[p] || {}).errs || []).length);
    return [bad.length === 0, bad.length
      ? '⛔ ' + bad.map(p => p + ':' + M.pages[p].errs.slice(0, 2).join('|')).join('  ')
      : '5 ページ 0 件'];
  }],

  // ── §5 撤退 ────────────────────────────────────────────────────────────────
  ['5a', '?ability5e=0 で abilityMod(15) === 1 (B/X 値へ戻る)', (M) => {
    const r = M.off;
    if (!r || !r.has) return [false, '⛔ 撤退側で DFAbilities が無い'];
    const got = r.modAll[14];   // s=15
    return [got === 1 && r.use5e === false,
      'abilityMod(15)=' + got + ' use5e=' + r.use5e + (got === 1 ? '' : ' ⛔ 期待 1')];
  }],
  ['5b', '?ability5e=0 で 12 判定の代表者スコアが旧 B/X 値へ戻る', (M) => {
    if (!M.off || !M.off.hasSC || !M.expBX || !Object.keys(M.expBX).length) return [false, '⛔ 母集団が無い'];
    const bad = [];
    for (const ck of CHECK_ORDER) {
      const got = (M.off.reps[ck] || {}).score;
      if (got !== M.expBX[ck]) bad.push(ck + ' ' + got + '≠' + M.expBX[ck]);
    }
    return [bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ')
      : '12/12 が B/X 値 (' + CHECK_ORDER.map(ck => M.expBX[ck]).join(',') + ')'];
  }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;
const SECTIONS = [
  ['§0 装置 — 母集団を先に確かめる', ['0a', '0b', '0b2', '0c']],
  ['§1 スコア表 — 移設であって改変ではない', ['1a', '1b', '1c']],
  ['§2 修正値の式 — 5e 化と、それがバランスに与える差', ['2a', '2b', '2c']],
  ['§3 搭載 — 罠 A (「共有モジュールだから見えるはず」は false)', ['3a', '3b', '3c']],
  ['§4 恒等 — 非退行と「戦闘は触っていない」', ['4a', '4b', '4c']],
  ['§5 撤退 — ?ability5e=0', ['5a', '5b']],
];
function emit(id, M) {
  const a = ASSERT_OF[id];
  if (!a) { check('(' + id + ') ⛔ 未定義の assert', false); return; }
  let r;
  try { r = a[2](M); } catch (e) { r = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
  check('(' + a[0] + ') ' + a[1], r[0], r[1]);
}

// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('=== verify_ability_scores — 能力値を D&D 5e の 6 能力へ一本化 (依頼書 #28 §8) '
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] ROOT=' + ROOT + '  PORT=' + PORT + '  BASE=' + BASE
    + (NEGATIVE ? '  変異ポート=' + MUT_IMPL.map(k => k + ':' + PORT_OF[k]).join(' ') : ''));

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_abil_');
  const servers = [await startServer(PORT, MUTATE)];
  if (NEGATIVE) for (const k of MUT_IMPL) servers.push(await startServer(PORT_OF[k], k));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /** 1 ポート分を丸ごと測る。want で「要る測定だけ」に絞る (変異ごとの時短)。 */
  async function measureAll(port, mutKey, want) {
    const base = 'http://localhost:' + port;
    const m = { oldTable: OLD_TABLE, oldCombat: OLD_COMBAT };
    m.eng   = (!want || want.eng)   ? await probeEngine(browser, base, '') : { has: false, errs: [] };
    m.off   = (!want || want.off)   ? await probeEngine(browser, base, '?ability5e=0') : null;
    m.pages = (!want || want.pages) ? await probePages(browser, base) : {};
    m.skillSrc  = servedSrc(mutKey, SKILL_JS);
    m.newCombat = parseCombatMods(servedSrc(mutKey, INDEX_HTML));
    /* ⭐ 期待値は「git の旧表 + 判定表 + 習熟表」から Node 側で独立に組む。 */
    m.exp5e = expectReps(OLD_TABLE, m.eng.checks, m.eng.profs, e5Mod);
    m.expBX = expectReps(OLD_TABLE, m.eng.checks, m.eng.profs, bxMod);
    m.UP_N = 0; m.FLAT_N = 0; m.DOWN_N = 0;
    for (const ck of Object.keys(m.exp5e)) {
      if (m.exp5e[ck] > m.expBX[ck]) m.UP_N++;
      else if (m.exp5e[ck] < m.expBX[ck]) m.DOWN_N++;
      else m.FLAT_N++;
    }
    return m;
  }

  try {
    mark('装置 — 変異アンカーが 1 箇所にヒットするか');
    for (const k of MUT_IMPL) {
      check('(0m-' + k + ') [装置] 変異アンカーが ' + MUTATIONS[k].file + ' の 1 箇所にヒットする',
        !!MUT_SRC[k], '置換 ' + MUTATIONS[k].from.length + ' → ' + MUTATIONS[k].to.length + ' bytes');
    }

    mark('測定 — エンジン単体 / 撤退 / 5 ページ');
    const M = await measureAll(PORT, MUTATE, null);
    console.log('[drv]   代表者スコア(5e 実測): '
      + CHECK_ORDER.map(ck => ck + '=' + ((M.eng.reps || {})[ck] || {}).score).join(' '));
    console.log('[drv]   旧表+式の独立計算: 上昇 ' + M.UP_N + ' / 据置 ' + M.FLAT_N + ' / 下降 ' + M.DOWN_N);
    for (const p of PAGES) {
      const r = M.pages[p] || {};
      if ((r.errs || []).length) console.log('[drv]   ⚠ ' + p + ' の pageerror ' + r.errs.length
        + ' 件: ' + r.errs.slice(0, 2).join(' | '));
    }

    for (const sec of SECTIONS) { mark(sec[0]); for (const id of sec[1]) emit(id, M); }

    /* ── 負のコントロール ──────────────────────────────────────────────────
     *  ⭐ 各変異について「赤くなるべき節」が実際に赤くなったかを数える。
     *    赤くならなかった変異が 1 本でもあれば **空振り** = exit 1。 */
    if (NEGATIVE) {
      for (const k of MUT_IMPL) {
        const mu = MUTATIONS[k];
        mark('負のコントロール — 変異 ' + k + ' (' + mu.file + ' の配信を差し替え) → ('
          + mu.targets.join(')(') + ') が赤くなる');
        const ev = mu.evaluable || [];
        const need = {
          eng:   ev.some(id => /^(0a|1[abc]|2[abc]|4a)$/.test(id)),
          off:   ev.some(id => /^5[ab]$/.test(id)),
          pages: ev.some(id => /^(0c|3a|4c)$/.test(id)),
        };
        const mm = await measureAll(PORT_OF[k], k, need);
        const res = {};
        for (const id of ev) {
          try { res[id] = ASSERT_OF[id][2](mm); }
          catch (e) { res[id] = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
        }
        for (const id of mu.targets) {
          const r = res[id] || [true, '⛔ evaluable に載っていない = この変異では測っていない'];
          check('(neg-' + k + '-' + id + ') 変異 ' + k + ' で (' + id + ') が赤くなる — '
            + ASSERT_OF[id][1].slice(0, 44), r[0] === false,
            (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        const red = ev.filter(id => res[id][0] === false);
        const extra = red.filter(id => mu.targets.indexOf(id) < 0);
        const unexpected = extra.filter(id => (mu.allowRed || []).indexOf(id) < 0);
        /* ⭐ 「効きすぎていないこと」まで見る。依頼書 §8 の表は赤くなるべき節を最小限しか
           書いていないので、余分に赤くなる節は allowRed で明示的に許可して証拠へ出す。 */
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない (見た節=' + ev.join('/') + ')',
          unexpected.length === 0,
          '赤=' + (red.length ? red.join(',') : '(無し)')
          + '  担当=' + mu.targets.join(',')
          + '  想定内の巻き添え=' + ((mu.allowRed || []).length ? mu.allowRed.join(',') : '(無し)')
          + '  緑のまま=' + (ev.filter(x => red.indexOf(x) < 0).join(',') || '(無し)')
          + (unexpected.length ? '  ⛔ 想定外の巻き込み=' + unexpected.join(',') : ''));
      }
      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (完了条件 = ここが 0 件)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → ' + MUTATIONS[k].targets.map(t => '(' + t + ')').join('')
            + ' が赤くなる  [' + MUTATIONS[k].file + ']', MUTATIONS[k].why);
        }
      } else {
        mark('変異の実装漏れ');
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, (e && e.message) + '\n' + ((e && e.stack) || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend   = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length
    + (NEGATIVE ? '   [負のコントロール]' : (MUTATE ? '   [変異 ' + MUTATE + ']' : '')));
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING**:');
    for (const b of pend) console.log('    - ' + b.name);
  }
  console.log('──────────────────────────────────────────────');
  process.exit(failed.length ? 1 : 0);
})();
