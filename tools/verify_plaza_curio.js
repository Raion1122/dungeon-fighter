/* verify_plaza_curio.js — #99 古物商 (独自品 19 品を SRD の名前へ・旧セーブの名前の移し替え・古物商で gated 装備を牙貨で) の受入
 *
 *   node tools/verify_plaza_curio.js                        ← 素の受入 (依頼書 §8 の全 assert)
 *   node tools/verify_plaza_curio.js --negative             ← 負のコントロール 12 本 (1 本ずつ子プロセスで順に)
 *   node tools/verify_plaza_curio.js --negative --only gearfall
 *
 * 依頼書: 実装依頼書/2026-10-22_plaza-curio.md §8。
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 *  - 本番の index.html / tavern.html を実 Chrome (puppeteer-core) で開く。配信バイトは起動時に凍結する
 *    (index.html / tavern.html / js/*.js は起動時、残りは初回アクセス時)。
 *  - ⭐ 旧名と数値の正は git show 54f6409:<file> (#98 完了時点 = #99 着手前)。表のリテラルを素の node の vm で
 *    評価して「職・区分・行番号 (装飾品は id)」ごとの基準の行を作り、実行時の表と突き合わせる。
 *    ⛔ 写経した期待値の表を持たない。持つのは依頼書 §2-1 の「旧名 → 新しい名前」19 組だけ (新しい名前の正は依頼書)。
 *  - 古いセーブ = localStorage を直接仕込んでからページを開く (sessionStorage の印で 1 回だけまく = 同じタブで
 *    ダンジョン → 酒場へ移っても仕込み直さない)。
 *  - 乱数を固定しない抽選は「200 回の和集合」で見る (#81 の作法)。
 *  - ⛔ 本番に検証専用の行を足さない。見たい値は既存の検証の口 (__sheetEquip / __equipTV / __plazaTV) と
 *    classic script 直下の宣言 (index の weapons / ALLY_EQUIP_POOLS / accessories ほか) から読む。
 *  - ⛔ 説明文の言い回し / 長い名前の折り返し / 値段の妥当さは測らない (依頼書 §8 ⛔)。
 *
 * ── 依頼書 §8 からの言い直し・測定点 (notes99_item3.md に同じ記録) ─────────────
 *  (0a) 「21 品」を数だけでなく、基準の木の表から導いた 21 の置き場 (職・区分・行番号 / 装飾品 id) と集合で一致させる。
 *       母集団が 0 (装置が立っていない) のときだけ §3 を測らず赤で記録する
 *       (shadow-amulet が混ざった 22 品のときは §3 を測り続ける = 変異 gearshadow で (3a) も赤くなるのを見る)。
 *  (1a) 19 品だけでなく、全職・全区分・装飾品の**全行**で「名前 = 基準の名前 (19 品は新しい名前)・
 *       name / flavor / effect 以外の欄 = 基準と完全一致」を見る (index 22 表 + 酒場 19 表)。
 *  (1d) index のソースを行ごとに字句で走査し、文字列リテラルの中の出現だけを数える (コメント・表の name 行を除く)。
 *       基準の木で 8 + 8 が取れること自体も装置の検算に含め、さらに基準の 16 行を旧名 → 新名に置き換えた行が
 *       配信中の index に 1 行ずつ在ることを見る。
 *  (2f) 酒場 = 主人公を魔法使いにして (ストーンオブグッドラックは魔法使い専用) 装身具 1 の巡回で出る名前 /
 *       ダンジョン = パーティ状態の欄 (#partyStatusList の「アクセ1 / アクセ2」) を 3 組。1 組目は装備の保存キーから
 *       開く本物の経路、残り 2 組は currentAccessoryIndices を差し替えて renderPartyStatuses()。
 *  (3c) 値段は refreshCurioGear が付けた値段で測る (仕込みの値段で測ると変異 gearprice が空振りする・項目2 の記録)。
 *  (3d) 仕込む装備品の行の値段も (3c) で実際に付いた値段を使う。期待する差 (−30 / −25) は依頼書のユーザー決定。
 *  (3b) 全部持っている状態は、地下街で古物商の露店を開いたまま抽選し直して「見えている行 = 古物商の在庫の品だけ」まで見る。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────
 *  - ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 *  - 1 本ずつ子プロセスで順に回す (同時注入は互いを覆い隠す)。port は 10638 だけを順に使う。
 *  - アンカーは**手つかずの原本**で 1 件ちょうどを起動時に確かめる (素の走行でも)。0 件 / 2 件以上 /
 *    置換前後が同じ長さ / 改行を含む / 置換文字列が原本に既に在る / 他の tools/*.js のソースに同じ文字列がある
 *    (罠E) なら exit 3。
 *  - 担当の節が赤くならなければ exit 1。担当外の赤 (巻き込み) は一覧に出す。
 *
 * exit: 0 = 全緑 / 1 = 赤あり (または --negative の空振り) / 2 = 環境 (puppeteer / ブラウザ / ポート / git) / 3 = 変異アンカーの腐敗
 * port: 10638 (このチケットの割当)。⛔ 8765 は常駐サーバなので使わない・止めない。
 * ⚠ git が要る (54f6409 を git show で読む)。走行中に本番を編集しないこと (起動時に凍結)。
 * ⛔ timeout コマンドで包まない (孤児の node がポートを掴む)。長い走行は PowerShell の背景実行で。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const vm   = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT     = parseInt(arg('port', '10638'), 10);
/* #99 の基準 (#98 完了・push 済 = 着手前)。⛔ HEAD にしない (commit した瞬間に自分との比較になる) */
const BASE_REV = '54f6409';

/* 依頼書 §2-1 の対応表 (旧名 → 新しい名前・19 組)。⭐ 新しい名前の正は依頼書なのでここだけは持つ。
 *   旧名が「どの職のどの行か」「gated か」は持たない (基準の木の表から引く)。 */
const RENAME19 = {
  '聖別された剣': 'サンブレード', '熔鉄の戦鎚': 'ドワーヴンスロウワー', '贖罪のメイス': 'メイスオブディスラプション',
  '星詠みの杖': 'スタッフオブフロスト', '風斬りの弓': 'オースボウ', '吸命の短剣': 'ソードオブライフスティーリング',
  '山守りの板金鎧': 'ドワーヴンプレート', '軽業師の革装束': 'グラマードスタデッドレザー',
  '自由の指輪': 'リングオブフリーアクション', '火耐性の指輪': 'リングオブレジスタンス(炎)', '生命の護符': 'アミュレットオブヘルス',
  '不浄を退ける聖印': 'スカラベオブプロテクション', '囁きの護符': 'ストーンオブグッドラック', '残影の首飾り': 'クロークオブディスプレイスメント',
  '雷鳴の斧': 'ジャイアントスレイヤー', '吸命のメイス': 'メイスオブスマイティング', '嵐のスタッフ': 'スタッフオブサンダーアンドライトニング',
  '霜咬みの弓': 'ヴィシャスウェポン(ロングボウ)', '影縫の刃': 'デイガーオブヴェノム',
};
const OLD19 = Object.keys(RENAME19);
const KEY_GATED = 'dragonfighters.ownedGatedNames';
const KEY_ACC = 'dragonfighters.accessoryIds';
const CLASSES = ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'];
const SLOTS = ['weapons', 'armors', 'shields'];
const SLOT_UP = { weapons: 'WEAPONS', armors: 'ARMORS', shields: 'SHIELDS' };

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
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
const JS_FILES = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /\.js$/.test(f)).map((f) => 'js/' + f).sort();
for (const rel of ['index.html', 'tavern.html'].concat(JS_FILES)) {
  if (!frozen(rel)) { console.error('[driver] ' + rel + ' が読めません'); process.exit(2); }
}
const PRISTINE = {};
for (const rel of ['index.html', 'tavern.html']) PRISTINE[rel] = frozen(rel).toString('utf8');

/* 基準の木 (54f6409) のバイト。⚠ blob は LF・作業ツリーは CRLF ⇒ 比較は LF に揃えてから */
const BASE = {};
for (const rel of ['index.html', 'tavern.html', 'js/plaza-map.js']) {
  try { BASE[rel] = execFileSync('git', ['show', BASE_REV + ':' + rel], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { console.error('[driver] git show ' + BASE_REV + ':' + rel + ' が読めません: ' + String(e.message || e).slice(0, 200)); process.exit(2); }
}

/* 変異 (依頼書 §8 の表)。edits = [[file, anchor, patch], ...]。⚠ アンカーも置換も 1 行に収める */
const MUTATIONS = {
  nomapidx: { expect: ['(2a)'], why: '⭐ 罠 A: index の dfSheetGatedOwned で旧名 → 新名に変換しない',
    edits: [['index.html', '      if (Array.isArray(arr)) return dfRenameGatedNames(arr).names;', '      if (Array.isArray(arr)) return arr;  /* mut-nomapidx */']] },
  nomaptv: { expect: ['(2b)'], why: '⭐ 罠 A: 酒場の dfLoadGatedOwned で変換しない (書き戻しもしない)',
    edits: [['tavern.html', '      const r = dfRenameGatedNames(arr);', '      const r = { names: arr, changed: false };  /* mut-nomaptv */']] },
  markmix: { expect: ['(2e)'], why: '⭐ 罠 A: index の markGatedOwned で変換しない (旧名の配列に新しい名前を足して書く)',
    edits: [['index.html', '        const set = new Set(Array.isArray(cur) ? dfRenameGatedNames(cur).names : []);', '        const set = new Set(Array.isArray(cur) ? cur : []);  /* mut-markmix */']] },
  legacyold: { expect: ['(2d)'], why: '⭐ 罠 B: 酒場の種まきの表を旧名 (聖別された剣・軽業師の革装束) のまま',
    edits: [['tavern.html', '  const DF_GATED_LEGACY = ["フレームタング", "フロストブランド", "サンブレード", "グラマードスタデッドレザー"];',
      '  const DF_GATED_LEGACY = ["フレームタング", "フロストブランド", "聖別された剣", "軽業師の革装束"];  /* mut-legacyold */']] },
  oneside: { expect: ['(1b)', '(1c)'], why: '酒場の表のドワーヴンスロウワーだけ旧名に戻す',
    edits: [['tavern.html', '    { name: "ドワーヴンスロウワー",', '    { name: "熔鉄の戦鎚", /* mut-oneside */']] },
  numdrift: { expect: ['(1a)'], why: 'ドワーヴンプレートの saveBonus を 3 にする (酒場の表)',
    edits: [['tavern.html', '      saveBonus: 2 },', '      saveBonus: 3 },  /* mut-numdrift */']] },
  gearfall: { expect: ['(3d)'], why: '⭐ 罠 C: onPlazaBuy の gear の分岐を外す (消耗品の買い方へ落ちる)',
    edits: [['tavern.html', '    if (s.kind === "gear") { buyCurioGearTV(s); return; }', '    /* mut-gearfall */']] },
  gearfront: { expect: ['(3f)'], why: '⭐ 罠 C: 装備品の行を在庫の前に付ける',
    edits: [['tavern.html', '    const rows = gear.length ? stock.concat(gear) : stock;', '    const rows = gear.length ? gear.concat(stock) : stock;  /* mut-gearfront */']] },
  gearowned: { expect: ['(3b)'], why: '抽選で持っている品を除かない',
    edits: [['tavern.html', '    const pool = shuffled(curioGearPoolTV().filter(g => !curioOwnedTV(g)));', '    const pool = shuffled(curioGearPoolTV());  /* mut-gearowned */']] },
  gearshadow: { expect: ['(0a)', '(3a)'], why: '母集団に shadow-amulet (クロークオブディスプレイスメント) を入れる',
    edits: [['tavern.html', '    ACCESSORIES_TV.forEach(a => { if (a.gated) out.push({ acc: a.id }); });',
      '    ACCESSORIES_TV.forEach(a => { if (a.gated || a.id === "shadow-amulet") out.push({ acc: a.id }); });  /* mut-gearshadow */']] },
  gearprice: { expect: ['(3c)'], why: '装飾品の値段を 30 にする',
    edits: [['tavern.html', '  function curioPriceTV(g) { return g && g.acc ? 25 : 30; }', '  function curioPriceTV(g) { return g && g.acc ? 30 : 30; }  /* mut-gearprice */']] },
  curioleak: { expect: ['(5a)'], why: '?curio=0 を見ない (isCurioOnTV が常に true)',
    edits: [['tavern.html', '    try { return new URLSearchParams(location.search).get("curio") !== "0"; }', '    try { return true; }  /* mut-curioleak */']] },
};
const MUT_ORDER = ['nomapidx', 'nomaptv', 'markmix', 'legacyold', 'oneside', 'numdrift', 'gearfall', 'gearfront', 'gearowned', 'gearshadow', 'gearprice', 'curioleak'];

/* 起動時の検算 (素の走行でも必ず): 原本で 1 件ちょうど / 置換前後で長さが違う / 改行なし / 原本に無い / 他ドライバのソースに無い */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self)
    .map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  for (const k of MUT_ORDER) {
    for (const [file, anchor, patch] of MUTATIONS[k].edits) {
      const hits = PRISTINE[file].split(anchor).length - 1;
      if (hits !== 1) {
        console.error('[driver] 負のコントロール ' + k + ' の注入点が ' + file + ' に ' + hits + ' 箇所 (期待 1)。変異は無効です: ' + anchor.slice(0, 160));
        process.exit(3);
      }
      if (anchor === patch || anchor.length === patch.length || /[\r\n]/.test(anchor + patch)) {
        console.error('[driver] ' + k + ' は置換前後が同一 / 同じバイト長 / 改行を含みます'); process.exit(3);
      }
      if (PRISTINE[file].indexOf(patch) >= 0) { console.error('[driver] ' + k + ' の置換文字列が原本に既に在る'); process.exit(3); }
      const clash = peers.filter((x) => x.s.indexOf(anchor.trim()) >= 0).map((x) => x.f);
      if (clash.length) { console.error('[driver] 変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(',')); process.exit(3); }
    }
  }
}
for (const k of ONLY) if (!MUTATIONS[k]) { console.error('[driver] 未知の --only: ' + k + '  (' + MUT_ORDER.join(',') + ')'); process.exit(3); }

const INJECTED = [];
function inject(tag) {
  const m = MUTATIONS[tag];
  const work = {};
  for (const [file, anchor, patch] of m.edits) {
    const s = work[file] !== undefined ? work[file] : PRISTINE[file];
    const now = s.split(anchor).length - 1;
    if (now !== 1) { console.error('[driver] ' + tag + ': 先行の置換の後で注入点が ' + now + ' 箇所 (期待 1)'); process.exit(3); }
    work[file] = s.split(anchor).join(patch);
  }
  for (const file of Object.keys(work)) SNAP.set(file, Buffer.from(work[file], 'utf8'));
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + tag + ' を注入しました (' + m.why + ' / 置換 ' + m.edits.length + ' 本)');
}

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const bad = [], summary = [];
  const t0 = Date.now();
  console.log('[driver] --negative (一括): ' + MUT_ORDER.join(',') + ' を 1 本ずつ順に走らせます (port ' + PORT + ' を順に使う)');
  for (const tag of MUT_ORDER) {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const t1 = Date.now();
    const r = spawnSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    const m = (r.stdout || '').match(/\[driver\] --negative \S+: 担当=([^\s]*) \/ 実際に赤くなった=([^\n]*)/);
    summary.push(tag + ': exit ' + r.status + ' (' + Math.round((Date.now() - t1) / 1000) + ' 秒)' + (m ? '  担当=' + m[1] + '  赤=' + m[2].trim() : ''));
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  }
  console.log('\n[driver] ── --negative 総括 (' + Math.round((Date.now() - t0) / 1000) + ' 秒) ──');
  summary.forEach((s) => console.log('   ' + s));
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + MUT_ORDER.length + ' 本すべて担当の節が赤くなりました (空振り 0)');
  process.exit(0);
}
if (NEGATIVE) {
  if (ONLY.length !== 1) { console.error('[driver] --only には変異を 1 つ: ' + MUT_ORDER.join(',')); process.exit(1); }
  inject(ONLY[0]);
}

/* ══════════════════════════════════════════════════════════════════════════
 * ソースの読み取り (基準の木 / 配信中のバイト)
 * ══════════════════════════════════════════════════════════════════════════ */
const lf = (b) => (Buffer.isBuffer(b) ? b.toString('utf8') : String(b)).replace(/\r\n/g, '\n');
/* `const <name> = [ ... ];` (または { ... };) のリテラルを vm で評価する。宣言が 1 つちょうどでなければ err */
function evalDecl(src, name) {
  const re = new RegExp('\\n([ \\t]*)const ' + name + ' = ([\\[{])');
  const m = re.exec(src); if (!m) return { err: 'not found' };
  const cnt = src.split(new RegExp('\\n[ \\t]*const ' + name + ' = ')).length - 1;
  if (cnt !== 1) return { err: 'decl x' + cnt };
  const close = '\n' + m[1] + (m[2] === '[' ? '];' : '};');
  const a = m.index + m[0].length - 1; const b = src.indexOf(close, a);
  if (b < 0) return { err: 'no close' };
  try { return { v: vm.runInNewContext('(' + src.slice(a, b + close.length - 1) + ')', {}) }; }
  catch (e) { return { err: 'eval ' + e.message }; }
}
/* index の表: 戦士の本表 (weapons/armors/shields) + 仲間の表 (戦士の写し + 五職) + 装飾品 */
function idxTables(src) {
  const t = { main: {}, ally: {}, acc: null, errs: [] };
  for (const s of SLOTS) { const r = evalDecl(src, s); if (r.err) t.errs.push(s + ':' + r.err); else t.main[s] = r.v; }
  for (const c of CLASSES) {
    t.ally[c] = {};
    for (const s of SLOTS) {
      const nm = (c === 'warrior' ? 'WARRIOR_ALLY_' : c.toUpperCase() + '_') + SLOT_UP[s];
      const r = evalDecl(src, nm); if (r.err) t.errs.push(nm + ':' + r.err); else t.ally[c][s] = r.v;
    }
  }
  const r = evalDecl(src, 'accessories'); if (r.err) t.errs.push('accessories:' + r.err); else t.acc = r.v;
  return t;
}
/* 酒場の表: CHAR_EQUIP の割り当て (戦士 = WEAPONS ほか / 五職 = <職>_WEAPONS ほか) + ACCESSORIES_TV */
function tvTables(src) {
  const t = { cls: {}, acc: null, errs: [] };
  for (const c of CLASSES) {
    t.cls[c] = {};
    for (const s of SLOTS) {
      const nm = (c === 'warrior' ? '' : c.toUpperCase() + '_') + SLOT_UP[s];
      const r = evalDecl(src, nm); if (r.err) t.errs.push(nm + ':' + r.err); else t.cls[c][s] = r.v;
    }
  }
  const r = evalDecl(src, 'ACCESSORIES_TV'); if (r.err) t.errs.push('ACCESSORIES_TV:' + r.err); else t.acc = r.v;
  return t;
}
/* 1 行を字句で走査し、文字列リテラル ('..' ".." `..` と ${..} の中の文字列) に入っている文字の印を返す。
 *   行頭が // / * / /* の行はコメント行として全部 false。// 以降・/* .. *\/ はコメント。 */
function stringMask(line) {
  const mask = new Array(line.length).fill(false);
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return mask;
  const st = ['code'];
  for (let i = 0; i < line.length; i++) {
    const top = st[st.length - 1], ch = line[i], nx = line[i + 1];
    if (top === 'code' || top === 'expr' || top === 'brace') {
      if (ch === '/' && nx === '/') break;
      if (ch === '/' && nx === '*') { const e = line.indexOf('*/', i + 2); if (e < 0) break; i = e + 1; continue; }
      if (ch === '"' || ch === "'") { st.push(ch); continue; }
      if (ch === '`') { st.push('tpl'); continue; }
      if (ch === '{' && top !== 'code') { st.push('brace'); continue; }
      if (ch === '}' && (top === 'brace' || top === 'expr')) { st.pop(); continue; }
      continue;
    }
    if (top === '"' || top === "'") {
      mask[i] = true;
      if (ch === '\\') { mask[i + 1] = true; i++; continue; }
      if (ch === top) { mask[i] = false; st.pop(); }
      continue;
    }
    if (top === 'tpl') {
      if (ch === '\\') { mask[i] = true; mask[i + 1] = true; i++; continue; }
      if (ch === '`') { st.pop(); continue; }
      if (ch === '$' && nx === '{') { st.push('expr'); i++; continue; }
      mask[i] = true;
    }
  }
  return mask;
}
/* src の各行で word が文字列リテラルの中に出る回数 (表の name: "<word>" の行は除く)。返す: { n, lines: [行の文字列] } */
function literalHits(src, word) {
  const out = { n: 0, lines: [] };
  for (const line of src.split('\n')) {
    if (line.indexOf(word) < 0) continue;
    if (line.indexOf('name: "' + word + '"') >= 0) continue;
    const mask = stringMask(line);
    let k = 0, hit = 0;
    while ((k = line.indexOf(word, k)) >= 0) { if (mask[k] && mask[k + word.length - 1]) hit++; k += word.length; }
    if (hit) { out.n += hit; out.lines.push(line); }
  }
  return out;
}
const canon = (o, omit) => {
  const x = JSON.parse(JSON.stringify(o === undefined ? null : o));
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const r = {}; Object.keys(v).sort().forEach((k) => { if (!(omit && omit.indexOf(k) >= 0)) r[k] = walk(v[k]); }); return r; }
    return v;
  };
  return JSON.stringify(walk(x));
};
/* 基準の行と実行時の行: 名前 = 基準の名前 (19 品は新しい名前)・name/flavor/effect 以外の欄が完全一致 */
function rowDiff(base, now) {
  if (!base || !now) return 'missing';
  const want = RENAME19[base.name] || base.name;
  if (now.name !== want) return 'name ' + now.name + ' != ' + want;
  const a = canon(base, ['name', 'flavor', 'effect']), b = canon(now, ['name', 'flavor', 'effect']);
  return a === b ? null : 'fields ' + a.slice(0, 160) + ' / ' + b.slice(0, 160);
}

/* ══════════════════════════════════════════════════════════════════════════
 * 器 (サーバ・ブラウザ)
 * ══════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        const buf = frozen(rel);
        if (!buf) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
        rs.setHeader('Cache-Control', 'no-store');
        rs.end(buf);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 判定の記録
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  const ok = !!cond;
  const d = detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
  results.push({ name, ok, detail: d });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (d ? '  -- ' + d.slice(0, 700) : ''));
}
const S3_LABELS = ['(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(3f)', '(5a)'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x) => b.indexOf(x) >= 0);

const pageErrors = [];
function watchErrors(page, tag) {
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    if (/\[DIAG\]/.test(m.text())) return;
    pageErrors.push(tag + ' :: CONSOLE ' + m.text() + ' ' + url);
  });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
}
/* 種: dragonfighters.* を全部消してから ls を置く。sessionStorage の印で 1 回だけ (同じタブで移ってもまき直さない) */
async function openPage(browser, file, opt) {
  const o = Object.assign({ cls: 'warrior', ls: {}, qs: '', tag: '' }, opt || {});
  const page = await browser.newPage();
  watchErrors(page, file + (o.qs || '') + (o.tag ? ' [' + o.tag + ']' : ''));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((sd) => {
    try {
      if (sessionStorage.getItem('__vpcSeeded')) return;
      sessionStorage.setItem('__vpcSeeded', '1');
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('dragonfighters.') === 0) kill.push(k); }
      kill.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('dragonfighters.xp', '6000');
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.partyComposition', JSON.stringify([sd.cls]));
      sessionStorage.setItem('dragonfighters.partyComposition', JSON.stringify([sd.cls]));
      sessionStorage.setItem('dragonfighters.plazaClock', '21');   /* ★[#102] 闇市は夜だけ開く。時計で揺れないよう夜に固定 */
      for (const k of Object.keys(sd.ls)) localStorage.setItem(k, sd.ls[k]);
    } catch (e) {}
  }, { cls: o.cls, ls: o.ls });
  await gotoFile(page, file, o.qs);
  return page;
}
async function gotoFile(page, file, qs) {
  await page.goto('http://localhost:' + PORT + '/' + file + (qs || ''), { waitUntil: 'load', timeout: 60000 });
  if (file === 'index.html') {
    await page.waitForFunction('!!window.__sheetEquip && typeof heroIsHead !== "undefined"', { timeout: 60000 });
    await sleep(1500);
  } else {
    await page.waitForFunction(() => !!window.__equipTV && !!window.__plazaTV && typeof window.__plazaTV.onTapPlazaDoor === 'function', { timeout: 60000 });
    await sleep(600);
  }
}
async function waitFn(page, fn, ms, a) { try { await page.waitForFunction(fn, { timeout: ms || 15000, polling: 50 }, a); return true; } catch (e) { return false; } }
const getKey = (page, k) => page.evaluate((kk) => localStorage.getItem(kk), k);
/* index: 全職の表の gated 品それぞれ → キャラクターシートの isOwned (#89 の検証の口) */
const idxOwned = (page) => page.evaluate(() => {
  const out = { owned: [], notOwned: [], gatedOwned: window.__sheetEquip.gatedOwned() };
  for (const ck of ALL_CLASS_KEYS) {
    const p = dfSheetPools(ck); if (!p) continue;
    for (const [kind, slot] of [['weapon', 'weapons'], ['armor', 'armors'], ['shield', 'shields']]) {
      (p[slot] || []).forEach((it, t) => { if (it && it.gated) (window.__sheetEquip.isOwned(kind, t, it) ? out.owned : out.notOwned).push(ck + ':' + it.name); });
    }
  }
  return out;
});
/* 札を押す: 中心が画面内で elementFromPoint が札自身なら実クリック、そうでなければ el.click() */
async function pressSign(page, id) {
  const pt = await page.evaluate((sid) => {
    const s = document.getElementById(sid); if (!s) return { missing: true };
    const b = s.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
    if (x >= 2 && y >= 2 && x < innerWidth - 2 && y < innerHeight - 2) {
      const e = document.elementFromPoint(x, y); if (e && (e === s || s.contains(e))) return { x, y };
    }
    s.click(); return { elClick: true };
  }, id);
  if (pt && pt.x !== undefined) await page.mouse.click(pt.x, pt.y);
  return pt;
}
async function enterPlaza(page) {
  await page.evaluate(() => { window.__plazaTV.onTapPlazaDoor(); });
  const ok = await waitFn(page, () => window.__plazaTV.plazaOpen(), 15000);
  await sleep(300);
  return ok;
}
/* ページ内の道具 (1 ページに 1 回入れる)。置き場のキー = 'acc:<id>' / '<cls>:<slot>:<tier>' */
const HELPERS = () => {
  const E = window.__equipTV;
  window.__vpc = {
    key: (g) => g.acc ? 'acc:' + g.acc : g.cls + ':' + g.slot + ':' + g.tier,
    item: (g) => { if (g.acc) return E.accDef(g.acc); const p = E.charEquip()[g.cls]; return p[g.slot][g.tier]; },
    clearOwned: () => { for (const n of E.gatedOwned()) E.removeGatedOwned(n); localStorage.setItem('dragonfighters.accessoryIds', '[]'); },
    own: (g) => {
      if (g.acc) { const a = JSON.parse(localStorage.getItem('dragonfighters.accessoryIds') || '[]'); if (a.indexOf(g.acc) < 0) a.push(g.acc); localStorage.setItem('dragonfighters.accessoryIds', JSON.stringify(a)); }
      else E.addGatedOwned(window.__vpc.item(g).name);
    },
    gearRows: () => [...document.querySelectorAll('#plazaShop .pshopItem[data-gear]')],
  };
};
const PLAZA_SEED = (extra) => ({
  'dragonfighters.plazaState': JSON.stringify(Object.assign({ unlocked: true, everEntered: true, gatekeeperEventSeen: true }, extra || {})),
  'dragonfighters.plazaInventory': JSON.stringify({ wand_polymorph: [3, 3, 3, 3, 3, 3] }),
});

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const T0 = Date.now();

  /* ══ 基準の木 (54f6409) の表 / 配信中のソースの表 ══ */
  const baseIdxSrc = lf(BASE['index.html']), baseTvSrc = lf(BASE['tavern.html']);
  const nowIdxSrc = lf(frozen('index.html')), nowTvSrc = lf(frozen('tavern.html'));
  const bI = idxTables(baseIdxSrc), bT = tvTables(baseTvSrc);
  const nT = tvTables(nowTvSrc);
  /* 旧名の位置 (基準の木の表から): index = 本表 + 仲間の表 + 装飾品 / 酒場 = CHAR_EQUIP + ACCESSORIES_TV */
  const posIdx = [], posTv = [];
  for (const s of SLOTS) (bI.main[s] || []).forEach((it, t) => { if (RENAME19[it.name]) posIdx.push({ tbl: 'main', cls: 'warrior', slot: s, tier: t, old: it.name, gated: !!it.gated }); });
  for (const c of CLASSES) for (const s of SLOTS) ((bI.ally[c] || {})[s] || []).forEach((it, t) => { if (RENAME19[it.name]) posIdx.push({ tbl: 'ally', cls: c, slot: s, tier: t, old: it.name, gated: !!it.gated }); });
  (bI.acc || []).forEach((a) => { if (RENAME19[a.name]) posIdx.push({ tbl: 'acc', acc: a.id, old: a.name, gated: !!a.gated }); });
  for (const c of CLASSES) for (const s of SLOTS) ((bT.cls[c] || {})[s] || []).forEach((it, t) => { if (RENAME19[it.name]) posTv.push({ cls: c, slot: s, tier: t, old: it.name, gated: !!it.gated }); });
  (bT.acc || []).forEach((a) => { if (RENAME19[a.name]) posTv.push({ acc: a.id, old: a.name, gated: !!a.gated }); });
  /* gated の旧名 (= 名前の移し替えが要る 8 品) と、その新しい名前 */
  const OLD_GATED = OLD19.filter((n) => posTv.some((p) => p.old === n && p.gated && !p.acc));
  const NEW_GATED = OLD_GATED.map((n) => RENAME19[n]);
  /* 古物商の母集団 (基準の木の酒場の表から): gated の武器・鎧 + gated の装飾品 */
  const POOL_KEYS = [];
  for (const c of CLASSES) for (const s of ['weapons', 'armors']) ((bT.cls[c] || {})[s] || []).forEach((it, t) => { if (it && it.gated) POOL_KEYS.push(c + ':' + s + ':' + t); });
  (bT.acc || []).forEach((a) => { if (a.gated) POOL_KEYS.push('acc:' + a.id); });

  /* ══ (0b) 基準の木から旧名 19 品の行を取り出せた ══ */
  const lineFound = (src) => OLD19.filter((n) => src.indexOf('name: "' + n + '"') >= 0);
  const fI = lineFound(baseIdxSrc), fT = lineFound(baseTvSrc);
  const tblI = OLD19.filter((n) => posIdx.some((p) => p.old === n)), tblT = OLD19.filter((n) => posTv.some((p) => p.old === n));
  const ok0b = !bI.errs.length && !bT.errs.length && !nT.errs.length && fI.length === 19 && fT.length === 19 && tblI.length === 19 && tblT.length === 19
    && OLD_GATED.length === 8 && POOL_KEYS.length > 0;
  check('(0b) [装置] ' + BASE_REV + ' の両ファイルから旧名 19 品の行を取り出せた (行: index ' + fI.length + '/19・酒場 ' + fT.length + '/19 / 表の位置: index ' + tblI.length + '/19 (' + posIdx.length + ' 行)・酒場 ' + tblT.length + '/19)・gated の旧名 ' + OLD_GATED.length + '/8',
    ok0b, { errs: bI.errs.concat(bT.errs, nT.errs), missI: OLD19.filter((n) => fI.indexOf(n) < 0), missT: OLD19.filter((n) => fT.indexOf(n) < 0), OLD_GATED, pool: POOL_KEYS.length });

  /* ══ (1c) 旧名は DF_GATED_RENAME の宣言の中にだけ (index 8・酒場 8・js/*.js 0)・両ファイルの表が同じ 8 組 ══ */
  const renameBlock = (src) => { const a = src.indexOf('const DF_GATED_RENAME = {'); if (a < 0) return null; const b = src.indexOf('};', a); return b < 0 ? null : [a, b + 2]; };
  const occ = (src, blk) => {
    const r = { inside: 0, outside: 0, outsideNames: [] };
    for (const n of OLD19) {
      let k = 0;
      while ((k = src.indexOf(n, k)) >= 0) {
        if (blk && k >= blk[0] && k < blk[1]) r.inside++; else { r.outside++; if (r.outsideNames.length < 8) r.outsideNames.push(n + '@' + src.slice(0, k).split('\n').length); }
        k += n.length;
      }
    }
    return r;
  };
  const blkI = renameBlock(nowIdxSrc), blkT = renameBlock(nowTvSrc);
  const oI = occ(nowIdxSrc, blkI), oT = occ(nowTvSrc, blkT);
  const oJ = JS_FILES.map((rel) => ({ rel, o: occ(lf(frozen(rel)), null) })).filter((x) => x.o.outside > 0).map((x) => x.rel + ':' + x.o.outsideNames.join(','));
  const mapOf = (src, blk) => { try { return vm.runInNewContext('(' + src.slice(src.indexOf('{', blk[0]), blk[1] - 1) + ')', {}); } catch (e) { return null; } };
  const rI = blkI && mapOf(nowIdxSrc, blkI), rT = blkT && mapOf(nowTvSrc, blkT);
  const want8 = {}; OLD_GATED.forEach((n) => { want8[n] = RENAME19[n]; });
  check('(1c) 旧名 19 品は DF_GATED_RENAME の宣言の中にだけ出る (index 中 ' + oI.inside + '・外 ' + oI.outside + ' / 酒場 中 ' + oT.inside + '・外 ' + oT.outside + ' / js/*.js ' + JS_FILES.length + ' 本で ' + oJ.length + ' 本)・両ファイルの DF_GATED_RENAME が同じ 8 組 (= 依頼書 §2-1 の gated 8 品)',
    !!blkI && !!blkT && oI.inside === 8 && oI.outside === 0 && oT.inside === 8 && oT.outside === 0 && oJ.length === 0
      && !!rI && !!rT && canon(rI) === canon(rT) && canon(rI) === canon(want8),
    { oI, oT, js: oJ, rI, same: canon(rI) === canon(rT) });

  /* ══ (1d) 自由の指輪 8 か所・残影の首飾り 8 か所の文言 (index のソースの文字列リテラル) ══ */
  const d1 = {};
  let d1ok = true;
  for (const old of ['自由の指輪', '残影の首飾り']) {
    const nw = RENAME19[old];
    const b = literalHits(baseIdxSrc, old), nOld = literalHits(nowIdxSrc, old), nNew = literalHits(nowIdxSrc, nw);
    const nowLines = new Set(nowIdxSrc.split('\n'));
    const mapped = b.lines.map((l) => l.split(old).join(nw)).filter((l) => !nowLines.has(l));
    d1[old] = { base: b.n, nowOld: nOld.n, nowNew: nNew.n, unmapped: mapped.map((l) => l.trim().slice(0, 80)) };
    if (!(b.n === 8 && nOld.n === 0 && nNew.n === 8 && mapped.length === 0)) d1ok = false;
  }
  check('(1d) 自由の指輪・残影の首飾りの文言 (index の文字列リテラル・表の name 行とコメントを除く): 基準 8 + 8 → 配信中は旧名 0・新しい名前 8 + 8・基準の 16 行を旧名 → 新名にした行が 1 行ずつ在る',
    d1ok, d1);

  /* ══ (4a) 恒等: 闇市の品の表 2 つと refreshPlazaStock / js/plaza-map.js が 54f6409 とバイト一致 (LF) ══ */
  const sliceTo = (s, startStr, endStr) => { const a = s.indexOf(startStr); if (a < 0) return null; const b = s.indexOf(endStr, a); return b < 0 ? null : s.slice(a, b + endStr.length); };
  /* ★[#102] 夜の関門 (依頼書 2026-10-27_plaza-night-hours.md §5-1 ⑦⑧) で書き換えた杖の 2 か所**だけ**を #102 以前の姿へ戻してから比べる
   *   (カタログの retired と効果文 / refreshPlazaStock の杖の常設 push)。それ以外の変化は今までどおり赤。各パターンは 1 回だけ当てる。
   *   ⚠ 正規表現にしてあるのは、後続の変異ドライバのアンカー文字列と字面で重ねないため (罠E)。 */
  const UNDO102 = [
    [/(consumeTrigger: "onPlazaEnter", alwaysInStock: true), retired: true,\n(      effect: "パーティ全員をモンスターの姿に変える。)" \},/g, '$1,\n$2ポドルプラザへの入場に必要。" },'],
    [/\n    \/\/ ポリモーフの杖の常設在庫は #101 までの門番のため。★\[#102\][^\n]*\n    if \(!plazaNightOnTV\(\)\) (stock\.push\(\{ itemId: "wand_polymorph")/g, '\n    // ポリモーフの杖は常設在庫 (供給ループ維持・仕様書 §3.3)\n    $1'],
  ];
  let nowTv102 = nowTvSrc;
  for (const [re, to] of UNDO102) { const m = nowTv102.match(re); if (m && m.length === 1) nowTv102 = nowTv102.replace(re, to); }
  const parts4a = [['const PLAZA_ITEMS_TV = {', '\n  };'], ['const PLAZA_ITEMS_COMMON_TV = {', '\n  };'], ['function refreshPlazaStock(', '\n  }\n']].map(([a, z]) => {
    const n = sliceTo(nowTv102, a, z), bb = sliceTo(baseTvSrc, a, z);
    return { from: a, len: n && n.length, same: !!n && n.length > 200 && n === bb };
  });
  const pm = { same: lf(frozen('js/plaza-map.js')) === lf(BASE['js/plaza-map.js']), bytes: frozen('js/plaza-map.js').length };
  check('(4a) tavern.html の PLAZA_ITEMS_TV / PLAZA_ITEMS_COMMON_TV の宣言と refreshPlazaStock の関数本体・js/plaza-map.js が ' + BASE_REV + ' とバイト一致 (LF に揃えて・#102 の杖の 2 か所を除いて)',
    parts4a.every((x) => x.same) && pm.same, { parts4a, pm });

  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_plazacurio_');
  const server = await startServer().catch((e) => { console.error('[driver] サーバを立てられません (port ' + PORT + '): ' + e.message); process.exit(2); });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile, '--mute-audio', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 300000 });
  try {
    console.log('[driver] serving ' + ROOT + ' :' + PORT + (INJECTED.length ? '  (変異 ' + INJECTED.join(',') + ')' : '') + '  基準の木 = ' + BASE_REV);
    const OLD8 = OLD_GATED, NEW8 = NEW_GATED;
    const oldJson = JSON.stringify(OLD8);

    /* ══ (2a) 旧名 8 つのセーブ → ダンジョンから先に開く / (2b) 同じタブで酒場 ══ */
    let page = await openPage(browser, 'index.html', { ls: { [KEY_GATED]: oldJson }, tag: 'old8' });
    const a = await idxOwned(page);
    const ownedNames = Array.from(new Set(a.owned.map((x) => x.split(':')[1])));
    const afterIdx = await getKey(page, KEY_GATED);
    check('(2a) 旧名 8 つの ownedGatedNames → ダンジョンを先に開く: キャラクターシートの gatedOwned = 新しい名前 8 (旧名 0)・isOwned が真になるのは各職の表で新しい名前の 8 品ちょうど・localStorage は書き換わらない',
      sameSet(a.gatedOwned, NEW8) && sameSet(ownedNames, NEW8) && afterIdx === oldJson, { gatedOwned: a.gatedOwned, owned: a.owned, notOwned: a.notOwned, ls: afterIdx });
    await gotoFile(page, 'tavern.html');
    const tv = await page.evaluate(() => window.__equipTV.gatedOwned());
    const afterTv = JSON.parse(await getKey(page, KEY_GATED) || 'null');
    const tvIs = await page.evaluate((ns) => ns.map((n) => window.__equipTV.isGatedOwned(n)), NEW8);
    check('(2b) 同じセーブで酒場を開く: __equipTV.gatedOwned() = 新しい名前 8・旧名 0・isGatedOwned(新しい名前) 8/8・localStorage の配列も新しい名前 8 に書き換わる',
      sameSet(tv, NEW8) && tvIs.every(Boolean) && sameSet(afterTv, NEW8), { tv, tvIs, ls: afterTv });
    await page.close();

    /* ══ (2c) 旧名と新名が混ざった配列 → どちらでも新しい名前 1 つに畳まれる ══ */
    const mixedArr = [OLD8[0], RENAME19[OLD8[0]], 'フロストブランド'];
    const mixedWant = [RENAME19[OLD8[0]], 'フロストブランド'];
    const mixed = JSON.stringify(mixedArr);
    page = await openPage(browser, 'index.html', { ls: { [KEY_GATED]: mixed }, tag: 'mixed' });
    const c1 = await page.evaluate(() => window.__sheetEquip.gatedOwned());
    const c1ls = await getKey(page, KEY_GATED);
    check('(2c) [ダンジョン] 混ざった配列 ' + mixed + ' → シートの gatedOwned = ' + JSON.stringify(mixedWant) + ' (書かない)', sameSet(c1, mixedWant) && c1ls === mixed, { c1, c1ls });
    await gotoFile(page, 'tavern.html');
    const c2 = await page.evaluate(() => window.__equipTV.gatedOwned());
    const c2ls = JSON.parse(await getKey(page, KEY_GATED) || 'null');
    check('(2c) [酒場] 混ざった配列 → gatedOwned と書き戻した配列が ' + JSON.stringify(mixedWant), sameSet(c2, mixedWant) && sameSet(c2ls, mixedWant), { c2, c2ls });
    await page.close();

    /* ══ (2d) キーの無い古いセーブ: 戦士の高水位が聖別された剣の行・盗賊の鎧の高水位が軽業師の行 (行番号は基準の木から) ══ */
    const pW = posTv.find((p) => p.old === '聖別された剣' && p.cls === 'warrior' && p.slot === 'weapons');
    const pA = posTv.find((p) => p.old === '軽業師の革装束' && p.slot === 'armors');
    const seedNames = [RENAME19['聖別された剣'], RENAME19['軽業師の革装束']];
    const hwmLs = { 'dragonfighters.weaponIdx': String(pW ? pW.tier : -1), 'dragonfighters.armorIdx': String(pA ? pA.tier : -1), 'dragonfighters.shieldIdx': '0' };
    page = await openPage(browser, 'index.html', { ls: hwmLs, tag: 'nokey' });
    const d1i = await page.evaluate(() => window.__sheetEquip.gatedOwned());
    const d1ls = await getKey(page, KEY_GATED);
    const d1own = await idxOwned(page);
    check('(2d) [ダンジョン] キー無し・高水位 (武器 ' + (pW && pW.tier) + '・鎧 ' + (pA && pA.tier) + ' = 基準の木で聖別された剣 / 軽業師の革装束の行) → シートの種まきに ' + seedNames.join(' + ') + ' (旧名 0・書かない)',
      !!pW && !!pA && seedNames.every((n) => d1i.indexOf(n) >= 0) && !d1i.some((n) => OLD19.indexOf(n) >= 0) && d1ls === null
        && seedNames.every((n) => d1own.owned.some((x) => x.split(':')[1] === n)), { d1i, d1ls, owned: d1own.owned });
    await gotoFile(page, 'tavern.html');
    const d2 = await page.evaluate(() => window.__equipTV.gatedOwned());
    const d2ls = JSON.parse(await getKey(page, KEY_GATED) || 'null');
    check('(2d) [酒場] 同じセーブで酒場の種まき → 持ち物に ' + seedNames.join(' + ') + ' (旧名 0)・書いた配列も同じ',
      seedNames.every((n) => d2.indexOf(n) >= 0) && !d2.some((n) => OLD19.indexOf(n) >= 0) && Array.isArray(d2ls) && sameSet(d2ls, d2), { d2, d2ls });
    await page.close();

    /* ══ (2e) 旧名の配列で markGatedOwned("フレームタング") / (2f) ダンジョンの装備欄 / index の実行時の表 ══ */
    const ACC6 = posIdx.filter((p) => p.tbl === 'acc').map((p) => p.acc);
    page = await openPage(browser, 'index.html', { cls: 'mage', tag: 'mark+acc',
      ls: { [KEY_GATED]: oldJson, [KEY_ACC]: JSON.stringify(ACC6), 'dragonfighters.equipAccessory1': ACC6[0] || '', 'dragonfighters.equipAccessory2': ACC6[1] || '' } });
    const e2 = await page.evaluate((k) => { markGatedOwned('フレームタング'); return JSON.parse(localStorage.getItem(k)); }, KEY_GATED);
    check('(2e) 旧名の配列でダンジョンの markGatedOwned("フレームタング") → 書かれた配列 = 新しい名前 8 + フレームタング・旧名 0',
      Array.isArray(e2) && sameSet(e2, NEW8.concat(['フレームタング'])) && !e2.some((n) => OLD19.indexOf(n) >= 0), e2);
    const hud = await page.evaluate((ids) => {
      const read = () => { const el = document.getElementById('partyStatusList'); const t = el ? el.textContent : ''; return (t.match(/アクセ[12]: .*?(?=アクセ[12]: |スキル|$)/g) || []).map((x) => x.trim()); };
      const out = [{ via: 'save', pair: ids.slice(0, 2), lines: read() }];
      for (const pr of [ids.slice(2, 4), ids.slice(4, 6)]) {
        currentAccessoryIndices[0] = accessoryIdxFromId(pr[0]); currentAccessoryIndices[1] = accessoryIdxFromId(pr[1]);
        renderPartyStatuses();
        out.push({ via: 'indices', pair: pr, lines: read() });
      }
      return out;
    }, ACC6);
    const hudOk = ACC6.length === 6 && hud.every((h) => h.pair.every((id, s) => {
      const p = posIdx.find((x) => x.acc === id); const want = 'アクセ' + (s + 1) + ': ' + RENAME19[p.old];
      return h.lines.some((l) => l.indexOf(want) === 0);
    })) && hud.every((h) => !h.lines.some((l) => OLD19.some((n) => l.indexOf(n) >= 0)));
    const rtI = await page.evaluate(() => ({ main: { weapons, armors, shields }, ally: ALLY_EQUIP_POOLS, acc: accessories }));
    const ls2f = JSON.parse(await getKey(page, KEY_ACC) || 'null');
    await page.close();

    /* ══ 酒場 (主人公 = 魔法使い): (2f) 装飾品の選択肢 / 実行時の表 / (0a) / §3 (3a)(3b)(3c)(3d)(3f) ══ */
    page = await openPage(browser, 'tavern.html', { cls: 'mage', tag: 'curio', ls: Object.assign({ [KEY_ACC]: JSON.stringify(ACC6) }, PLAZA_SEED()) });
    await page.evaluate(HELPERS);
    const f2t = await page.evaluate(() => {
      const E = window.__equipTV; const out = { ids: E.unlockedAccs(), defs: {}, chips: [] };
      for (const id of out.ids) out.defs[id] = E.accDef(id).name;
      E.setTab('mage');
      for (let k = 0; k < out.ids.length + 1; k++) {
        E.cycleAcc(0);
        const id = E.heroAccIds()[0]; const t = (E.summaryHtml() || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        out.chips.push({ id, text: t.slice(0, 240) });
      }
      return out;
    });
    const f2tOk = ACC6.every((id) => {
      const p = posIdx.find((x) => x.acc === id); const nw = RENAME19[p.old];
      return f2t.ids.indexOf(id) >= 0 && f2t.defs[id] === nw && f2t.chips.some((c) => c.id === id && c.text.indexOf(nw) >= 0);
    }) && !f2t.chips.some((c) => OLD19.some((n) => c.text.indexOf(n) >= 0));
    const tvAccNow = await page.evaluate((ids) => ids.map((id) => window.__equipTV.accDef(id)), (bT.acc || []).map((x) => x.id));
    const rtT = await page.evaluate(() => window.__equipTV.charEquip());
    check('(2f) 装飾品 6 品の id を accessoryIds に仕込む → ダンジョンのパーティ欄「アクセ1/2」(3 組・1 組目は保存キーから) と酒場の装身具の選択肢 (魔法使い・巡回) に新しい名前で出る・旧名 0・accessoryIds の id は不変',
      hudOk && f2tOk && Array.isArray(ls2f) && ACC6.every((id) => ls2f.indexOf(id) >= 0), { hud, tv: f2t, ls: ls2f });

    /* ── (1a) 全行: 名前 = 基準 (19 品は新しい名前)・name/flavor/effect 以外の欄 = 基準と完全一致 (実行時 × 基準のソース) ── */
    const bad1a = []; let rows1a = 0; const renamed = { idx: 0, tv: 0 };
    const cmp = (where, base, now) => { rows1a++; const d = rowDiff(base, now); if (base && RENAME19[base.name] && !d) renamed[where.startsWith('idx') ? 'idx' : 'tv']++; if (d) bad1a.push(where + ' ' + d); };
    for (const s of SLOTS) (bI.main[s] || []).forEach((it, t) => cmp('idx:main:' + s + ':' + t, it, rtI.main[s] && rtI.main[s][t]));
    for (const c of CLASSES) for (const s of SLOTS) ((bI.ally[c] || {})[s] || []).forEach((it, t) => cmp('idx:ally:' + c + ':' + s + ':' + t, it, rtI.ally[c] && rtI.ally[c][s] && rtI.ally[c][s][t]));
    (bI.acc || []).forEach((it) => cmp('idx:acc:' + it.id, it, (rtI.acc || []).find((x) => x.id === it.id)));
    for (const c of CLASSES) for (const s of SLOTS) ((bT.cls[c] || {})[s] || []).forEach((it, t) => cmp('tv:' + c + ':' + s + ':' + t, it, rtT[c] && rtT[c][s] && rtT[c][s][t]));
    (bT.acc || []).forEach((it, i) => cmp('tv:acc:' + it.id, it, tvAccNow[i] && tvAccNow[i].id === it.id ? tvAccNow[i] : null));
    check('(1a) 全行 (' + rows1a + ' 行: index 本表 + 仲間の表 + 装飾品 / 酒場 CHAR_EQUIP + ACCESSORIES_TV) で、名前 = ' + BASE_REV + ' の同じ職・同じ行 (装飾品は同じ id) の名前 (旧名 19 品は §2-1 の新しい名前)・name/flavor/effect 以外の欄が完全一致。新しい名前になった行: index ' + renamed.idx + '/' + posIdx.length + '・酒場 ' + renamed.tv + '/' + posTv.length,
      bad1a.length === 0 && renamed.idx === posIdx.length && renamed.tv === posTv.length && posIdx.length >= 19 && posTv.length === 19, { bad: bad1a.slice(0, 12), n: bad1a.length });

    /* ── (1b) index と酒場で、ゲート付き 21 品 + 特別な武器 5 品の名前が職・行番号 (id) ごとに一致 ── */
    const pop1b = [];
    for (const c of CLASSES) for (const s of ['weapons', 'armors']) ((bT.cls[c] || {})[s] || []).forEach((it, t) => {
      if (it.gated || RENAME19[it.name]) pop1b.push({ c, s, t });
    });
    const accPop = (bT.acc || []).filter((x) => x.gated).map((x) => x.id);
    const bad1b = [];
    for (const p of pop1b) {
      const tvN = rtT[p.c] && rtT[p.c][p.s] && rtT[p.c][p.s][p.t] && rtT[p.c][p.s][p.t].name;
      const ixN = p.c === 'warrior' ? (rtI.main[p.s] && rtI.main[p.s][p.t] && rtI.main[p.s][p.t].name) : (rtI.ally[p.c] && rtI.ally[p.c][p.s] && rtI.ally[p.c][p.s][p.t] && rtI.ally[p.c][p.s][p.t].name);
      const mirror = p.c === 'warrior' ? (rtI.ally.warrior[p.s] && rtI.ally.warrior[p.s][p.t] && rtI.ally.warrior[p.s][p.t].name) : ixN;
      if (!tvN || tvN !== ixN || tvN !== mirror) bad1b.push(p.c + ':' + p.s + ':' + p.t + ' tv=' + tvN + ' idx=' + ixN + (mirror !== ixN ? ' mirror=' + mirror : ''));
    }
    for (const id of accPop) {
      const tvN = (tvAccNow.find((x) => x && x.id === id) || {}).name, ixN = ((rtI.acc || []).find((x) => x.id === id) || {}).name;
      if (!tvN || tvN !== ixN) bad1b.push('acc:' + id + ' tv=' + tvN + ' idx=' + ixN);
    }
    const n1b = pop1b.length + accPop.length;
    check('(1b) index と酒場で、ゲート付き 21 品 + 特別な武器 5 品 (= 基準の木の酒場の表の gated 行と、改名した非 gated の武器: ' + n1b + ' 品) の名前が職・行番号 (装飾品は id) ごとに一致 (戦士は index の仲間用の写しも)',
      bad1b.length === 0 && n1b === 26, { bad: bad1b, n: n1b });

    /* ── (4b) 装備の表の行数が両ファイル・全職・全区分で 54f6409 と同じ (装飾品も) ── */
    const bad4b = [];
    for (const s of SLOTS) if ((bI.main[s] || []).length !== (rtI.main[s] || []).length) bad4b.push('idx:main:' + s);
    for (const c of CLASSES) for (const s of SLOTS) {
      if (((bI.ally[c] || {})[s] || []).length !== ((rtI.ally[c] || {})[s] || []).length) bad4b.push('idx:ally:' + c + ':' + s);
      if (((bT.cls[c] || {})[s] || []).length !== ((rtT[c] || {})[s] || []).length) bad4b.push('tv:' + c + ':' + s);
    }
    if ((bI.acc || []).length !== (rtI.acc || []).length) bad4b.push('idx:acc');
    if ((bT.acc || []).length !== (nT.acc || []).length || (nT.acc || []).map((x) => x.id).join() !== (bT.acc || []).map((x) => x.id).join()) bad4b.push('tv:acc(source)');
    check('(4b) 装備の表の行数が両ファイル・全職・全区分 (index 本表 3 + 仲間の表 18 + 装飾品 / 酒場 18 + ACCESSORIES_TV の id の並び) で ' + BASE_REV + ' と同じ', bad4b.length === 0, bad4b);

    /* ── (0a) 母集団 = 21 品 (武器 8・鎧 2・装飾品 11)・shadow-amulet を含まない・基準の木から導いた 21 の置き場と同じ集合 ── */
    const p0 = await page.evaluate(() => {
      const T = window.__plazaTV; if (typeof T.curioPool !== 'function') return { missing: true };
      const pool = T.curioPool();
      return { on: T.curioOn(), keys: pool.map(window.__vpc.key), w: pool.filter((g) => g.slot === 'weapons').length, a: pool.filter((g) => g.slot === 'armors').length,
        acc: pool.filter((g) => g.acc).length, byName: pool.some((g) => typeof g === 'string' || (g && g.name)) };
    });
    const poolStanding = !p0.missing && Array.isArray(p0.keys) && p0.keys.length > 0;
    check('(0a) [装置] 酒場の母集団 __plazaTV.curioPool() が 21 品 (武器 8・鎧 2・装飾品 11)・shadow-amulet を含まない・' + BASE_REV + ' の表の gated の置き場 ' + POOL_KEYS.length + ' と同じ集合・名前で持たない',
      poolStanding && p0.on && p0.keys.length === 21 && p0.w === 8 && p0.a === 2 && p0.acc === 11 && p0.keys.indexOf('acc:shadow-amulet') < 0
        && sameSet(p0.keys, POOL_KEYS) && !p0.byName, Object.assign({}, p0, { want: POOL_KEYS.length }));
    if (!poolStanding) {
      for (const l of S3_LABELS) check(l + ' (0a) の母集団が立っていないので測らない = 赤で記録', false, '装置が立っていない');
      throw { skipRest: true };
    }

    /* ── (3a) 何も持っていない状態で 200 回 ── */
    const a3 = await page.evaluate((poolKeys) => {
      const T = window.__plazaTV, C = window.__vpc; C.clearOwned();
      const seen = {}; const sizes = {}; let dup = 0, outside = 0;
      for (let k = 0; k < 200; k++) {
        T.refreshCurioGear(); const cg = T.curioGear(); sizes[cg.length] = (sizes[cg.length] || 0) + 1;
        const ks = cg.map((x) => C.key(x.gear)); if (new Set(ks).size !== ks.length) dup++;
        for (const kk of ks) { if (poolKeys.indexOf(kk) < 0) outside++; seen[kk] = (seen[kk] || 0) + 1; }
      }
      const saved = JSON.parse(localStorage.getItem('dragonfighters.plazaState')).curioGear;
      return { sizes, distinct: Object.keys(seen).length, missing: poolKeys.filter((k) => !seen[k]), dup, outside, outsideKeys: Object.keys(seen).filter((k) => poolKeys.indexOf(k) < 0),
        saved: JSON.stringify(saved) === JSON.stringify(T.curioGear()) };
    }, POOL_KEYS);
    check('(3a) 何も持っていない状態で refreshCurioGear を 200 回: 毎回 1〜2 品・21 品すべてが 1 回以上・21 品以外 0・同じ回に同じ品が 2 つ並ばない・置き場は保存される',
      Object.keys(a3.sizes).every((n) => n === '1' || n === '2') && !!a3.sizes['1'] && !!a3.sizes['2'] && a3.distinct === 21 && a3.missing.length === 0 && a3.outside === 0 && a3.dup === 0 && a3.saved, a3);

    /* ── (3b) 20 品を持っている状態で 200 回 = 残りの 1 品 (武器・鎧・装飾品の 3 通り) / 21 品とも持っている = 0 品 ── */
    const b3 = await page.evaluate((poolKeys) => {
      const T = window.__plazaTV, C = window.__vpc; const pool = T.curioPool().filter((g) => poolKeys.indexOf(C.key(g)) >= 0); const out = {};
      const leaves = [pool.findIndex((g) => g.slot === 'weapons'), pool.findIndex((g) => g.slot === 'armors'), pool.findIndex((g) => g.acc)];
      for (const leaveIdx of leaves) {
        C.clearOwned(); pool.forEach((g, i) => { if (i !== leaveIdx) C.own(g); });
        let ok = 0; const other = {};
        for (let k = 0; k < 200; k++) { T.refreshCurioGear(); const cg = T.curioGear(); if (cg.length === 1 && C.key(cg[0].gear) === C.key(pool[leaveIdx])) ok++; else { const s = cg.map((x) => C.key(x.gear)).join('+'); other[s] = (other[s] || 0) + 1; } }
        out['leave:' + C.key(pool[leaveIdx])] = { ok, other: Object.keys(other).slice(0, 4) };
      }
      C.clearOwned(); pool.forEach((g) => C.own(g));
      let zero = 0; for (let k = 0; k < 200; k++) { T.refreshCurioGear(); if (T.curioGear().length === 0) zero++; }
      T.renderPlazaShop();
      out.zero = zero; out.gearRowsDom = C.gearRows().length; out.rowsGear = T.shopRows().filter((s) => s.kind === 'gear').length;
      C.clearOwned();
      return out;
    }, POOL_KEYS);
    const leaveKeys = Object.keys(b3).filter((k) => /^leave:/.test(k));
    check('(3b) 20 品を持っている状態で 200 回 = 毎回ちょうど残りの 1 品 (残す品 = 武器 / 鎧 / 装飾品の 3 通り)・21 品とも持っている = 200 回とも 0 品で店の装備品の行 0',
      leaveKeys.length === 3 && leaveKeys.every((k) => b3[k].ok === 200) && b3.zero === 200 && b3.gearRowsDom === 0 && b3.rowsGear === 0, b3);

    /* ── (3c) 値段: refreshCurioGear が付けた値段で行を描き、描かれた「牙貨 N」と行の値段を見る ── */
    const c3 = await page.evaluate(() => {
      const T = window.__plazaTV, C = window.__vpc; C.clearOwned(); T.setFang(999);
      const st = T.getStock(); st.length = 0; st.push({ itemId: 'potion_healing', price: 3, kind: 'always' });
      const rows = []; const kinds = { gear: false, acc: false }; let tries = 0;
      while ((!kinds.gear || !kinds.acc) && tries < 600) {
        tries++; T.refreshCurioGear(); const cg = T.curioGear();
        const hasG = cg.some((x) => !x.gear.acc), hasA = cg.some((x) => x.gear.acc);
        if ((hasG && !kinds.gear) || (hasA && !kinds.acc)) {
          T.renderPlazaShop(); const sr = T.shopRows();
          for (const r of C.gearRows()) {
            const idx = Number(r.querySelector('.pbuy').getAttribute('data-idx')); const row = sr[idx];
            rows.push({ key: C.key(row.gear), acc: !!row.gear.acc, rowPrice: row.price, drawn: r.querySelector('.pshopPrice').textContent, name: r.querySelector('.pshopName').textContent,
              itemName: C.item(row.gear).name, stall: r.getAttribute('data-stall'), owned: !!r.querySelector('.pshopOwned'), eff: (r.querySelector('.pshopEffect') || {}).textContent || '' });
          }
          kinds.gear = kinds.gear || hasG; kinds.acc = kinds.acc || hasA;
        }
      }
      return { tries, rows };
    });
    const c3ok = c3.rows.some((r) => !r.acc) && c3.rows.some((r) => r.acc) && c3.rows.every((r) => {
      const want = r.acc ? 25 : 30;
      return r.rowPrice === want && r.drawn === '牙貨 ' + want && r.name === r.itemName && !r.owned && r.eff.length > 2;
    });
    check('(3c) 値段 (refreshCurioGear が付けた値段): 武器・鎧の行は 30・装飾品の行は 25 (実行時の行の price × 描かれた「牙貨 N」)・行の名前 = 実行時の表の名前・所持チップ無し',
      c3ok, c3);
    const priceSeen = { w: (c3.rows.find((r) => !r.acc) || {}).rowPrice, a: (c3.rows.find((r) => r.acc) || {}).rowPrice };

    /* ── (3f) 罠 C: 装備品の行があるとき、在庫の各行を onPlazaBuy(i) で買うと押した行の品だけが 1 増える ── */
    const GK = [POOL_KEYS.find((k) => /:weapons:/.test(k) && !/^warrior:/.test(k)), POOL_KEYS.find((k) => /:armors:/.test(k)), 'acc:amulet-health'];
    const setGear = (pg, keys) => pg.evaluate((ks, pr) => {
      const T = window.__plazaTV, C = window.__vpc; const pool = T.curioPool();
      if (!Array.isArray(T.curioGear())) T.refreshCurioGear();
      const cg = T.curioGear(); cg.length = 0;
      for (const k of ks) { const g = pool.find((x) => C.key(x) === k); if (g) cg.push({ gear: g, price: g.acc ? pr.a : pr.w }); }
      T.renderPlazaShop();
    }, keys, priceSeen);
    const STOCK = [{ itemId: 'potion_healing', price: 3, kind: 'always' }, { itemId: 'wand_polymorph', price: 10, kind: 'always' },
      { itemId: 'potion_greater_healing', price: 5, kind: 'common' }, { itemId: 'pearl_of_power', price: 8, kind: 'featured' },
      { itemId: 'scroll_create_golem', price: 9, kind: 'featured' }, { itemId: 'ring_spell_turning', price: 12, kind: 'featured' }];
    await setGear(page, GK);
    const f3 = await page.evaluate((stock) => {
      const T = window.__plazaTV; const out = [];
      for (let i = 0; i < stock.length; i++) {
        const st = T.getStock(); st.length = 0; stock.forEach((s) => st.push(Object.assign({}, s)));
        const inv = T.inv(); for (const k of Object.keys(inv)) delete inv[k];
        T.setFang(999); T.renderPlazaShop();
        const rows = T.shopRows(); const gearAt = rows.map((s, j) => s.kind === 'gear' ? j : -1).filter((j) => j >= 0);
        T.onPlazaBuy(i);
        const after = {}; for (const k of Object.keys(T.inv())) after[k] = T.inv()[k].length;
        out.push({ i, want: stock[i].itemId, after, gearAt: gearAt.join(), gearLeft: T.curioGear().length });
      }
      return out;
    }, STOCK);
    check('(3f) 罠 C: 装備品の行が 3 つあるとき、在庫 6 行それぞれを onPlazaBuy(i) で買う → 押した行の品だけが持ち物に 1 増える・装備品の行は在庫の後ろ (添字 6,7,8) で減らない',
      f3.length === 6 && f3.every((r) => Object.keys(r.after).length === 1 && r.after[r.want] === 1 && r.gearLeft === 3 && r.gearAt === '6,7,8'), f3);

    /* ── (3d) 購入: 武器 −30・gatedOwned に名前・行が消える・plazaInventory 不変 / 装飾品 −25・accessoryIds / 牙貨 29 では無効 ── */
    await setGear(page, GK);
    const d3 = await page.evaluate(() => {
      const T = window.__plazaTV, E = window.__equipTV, C = window.__vpc;
      const st = T.getStock(); st.length = 0; st.push({ itemId: 'potion_healing', price: 3, kind: 'always' });
      T.setFang(999); T.renderPlazaShop();
      const inv0 = JSON.stringify(T.inv()), ls0 = localStorage.getItem('dragonfighters.plazaInventory'), stock0 = JSON.stringify(T.getStock());
      const rows = T.shopRows(); const wi = rows.findIndex((s) => s.kind === 'gear' && !s.gear.acc && s.gear.slot === 'weapons');
      const wname = wi >= 0 ? C.item(rows[wi].gear).name : null;
      try { T.onPlazaBuy(wi); } catch (e) {}
      const w = { fang: T.getFang(), owned: E.isGatedOwned(wname), inG: E.gatedOwned().indexOf(wname) >= 0, left: (T.curioGear() || []).map((x) => C.key(x.gear)),
        inv: JSON.stringify(T.inv()) === inv0, ls: localStorage.getItem('dragonfighters.plazaInventory') === ls0, stock: JSON.stringify(T.getStock()) === stock0,
        drawn: C.gearRows().map((r) => r.querySelector('.pshopName').textContent), wname };
      const rows2 = T.shopRows(); const ai = rows2.findIndex((s) => s.kind === 'gear' && s.gear.acc);
      try { T.onPlazaBuy(ai); } catch (e) {}
      const a = { fang: T.getFang(), ids: JSON.parse(localStorage.getItem('dragonfighters.accessoryIds') || '[]'), left: (T.curioGear() || []).map((x) => C.key(x.gear)),
        inv: JSON.stringify(T.inv()) === inv0, stock: JSON.stringify(T.getStock()) === stock0 };
      T.setFang(29); T.renderPlazaShop();
      const rows3 = T.shopRows(); const ri = rows3.findIndex((s) => s.kind === 'gear');
      const btn = document.querySelector('#plazaShop .pshopItem[data-gear] .pbuy');
      const aname = ri >= 0 ? C.item(rows3[ri].gear).name : null;
      const left0 = (T.curioGear() || []).length;
      try { T.onPlazaBuy(ri); } catch (e) {}
      const p = { dis: !!btn && btn.disabled, fang: T.getFang(), owned: E.isGatedOwned(aname), left0, left: (T.curioGear() || []).length, inv: JSON.stringify(T.inv()) === inv0, stock: JSON.stringify(T.getStock()) === stock0 };
      return { w, a, p };
    });
    check('(3d) 武器の行を買う (牙貨 999): 牙貨 −30・gatedOwned にその名前・行が消える・plazaInventory (メモリ / localStorage) と在庫は 1 バイトも変わらない',
      d3.w.fang === 969 && d3.w.owned && d3.w.inG && d3.w.left.join() === GK.slice(1).join() && d3.w.inv && d3.w.ls && d3.w.stock && d3.w.drawn.indexOf(d3.w.wname) < 0 && d3.w.drawn.length === 2, d3.w);
    check('(3d) 装飾品の行を買う: 牙貨 −25・accessoryIds にその id・持ち物と在庫は不変', d3.a.fang === 944 && d3.a.ids.indexOf('amulet-health') >= 0 && d3.a.left.join() === GK[1] && d3.a.inv && d3.a.stock, d3.a);
    check('(3d) 牙貨 29: 武器・鎧の行のボタンが無効・onPlazaBuy しても牙貨・所持・行・持ち物・在庫が変わらない', d3.p.dis === true && d3.p.fang === 29 && !d3.p.owned && d3.p.left0 === 1 && d3.p.left === 1 && d3.p.inv && d3.p.stock, d3.p);
    await page.close();

    /* ══ (3e) 地下街で古物商の札を押して歩いて開く → 装備品の行が見える (薬屋・杖屋・召喚屋では 0)・実クリックで購入 ══ */
    page = await openPage(browser, 'tavern.html', { tag: 'walk', ls: PLAZA_SEED() });
    await page.evaluate(HELPERS);
    await page.evaluate(() => { window.__vpc.clearOwned(); window.__plazaTV.setFang(999); });
    const entered = await enterPlaza(page);
    const e0 = await page.evaluate(() => ({ n: (window.__plazaTV.curioGear() || []).length, map: !!(window.__plazaTV.map && window.__plazaTV.map.on) }));
    const e3 = {};
    for (const key of ['potion', 'wand', 'summon', 'curio']) {
      const press = await pressSign(page, 'plazaSign_' + key);
      const arrived = await waitFn(page, (k) => window.__plazaTV.map.openStall() === k && !window.__plazaTV.map.isMoving(), 25000, key);
      e3[key] = await page.evaluate(() => ({ visGear: window.__vpc.gearRows().filter((e) => e.offsetParent !== null).length, allGear: window.__vpc.gearRows().length }));
      e3[key].arrived = arrived; e3[key].press = press && press.elClick ? 'el.click' : 'real';
      if (key !== 'curio') await page.evaluate(() => { const b = document.getElementById('btnPlazaBackToMap'); if (b) b.click(); });
    }
    const n3 = e0.n;
    check('(3e) 地下街で古物商の札を押して歩いて開く → 装備品の行 (' + n3 + ' 行) が見える・薬屋・杖屋・召喚屋では見えている装備品の行 0',
      entered && e0.map && n3 >= 1 && n3 <= 2 && Object.values(e3).every((r) => r.arrived && r.allGear === n3)
        && e3.curio.visGear === n3 && e3.potion.visGear === 0 && e3.wand.visGear === 0 && e3.summon.visGear === 0, { entered, e0, e3 });
    const pick = await page.evaluate(() => {
      const r = window.__vpc.gearRows().find((e) => e.offsetParent !== null); if (!r) return null;
      const b = r.querySelector('.pbuy');
      b.scrollIntoView({ block: 'center' }); const rc = b.getBoundingClientRect();
      const idx = Number(b.getAttribute('data-idx')); const row = window.__plazaTV.shopRows()[idx];
      const e = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2, name: r.querySelector('.pshopName').textContent, gear: row.gear, price: row.price,
        fang: window.__plazaTV.getFang(), inv: JSON.stringify(window.__plazaTV.inv()), under: !!e && (e === b || b.contains(e)) };
    });
    if (pick) { await page.mouse.click(pick.x, pick.y); await sleep(250); }
    const e4 = pick ? await page.evaluate((pk) => {
      const T = window.__plazaTV, E = window.__equipTV;
      const owned = pk.gear.acc ? JSON.parse(localStorage.getItem('dragonfighters.accessoryIds') || '[]').indexOf(pk.gear.acc) >= 0 : E.isGatedOwned(pk.name);
      return { fang: T.getFang(), owned, left: (T.curioGear() || []).length, inv: JSON.stringify(T.inv()) === pk.inv };
    }, pick) : null;
    const wantDrop = pick ? (pick.gear.acc ? 25 : 30) : -1;
    check('(3e) 見えている装備品の行の「購入」を実クリック → 牙貨 −' + wantDrop + '・その品を所持・行が消える・持ち物 (plazaInventory) は不変',
      !!pick && pick.under && !!e4 && pick.price === wantDrop && e4.fang === pick.fang - wantDrop && e4.owned && e4.left === n3 - 1 && e4.inv, { pick: pick && { name: pick.name, price: pick.price, under: pick.under }, e4 });
    /* (3b) の続き: 21 品とも持っている状態で古物商の露店を開いたまま抽選し直す → 見えている行は古物商の在庫の品だけ */
    const b3s = await page.evaluate(() => {
      const T = window.__plazaTV, C = window.__vpc, PM = window.PLAZA_MAP;
      T.curioPool().forEach((g) => C.own(g));
      const st = T.getStock(); st.length = 0;
      st.push({ itemId: 'potion_healing', price: 3, kind: 'always' }, { itemId: 'ring_spell_turning', price: 12, kind: 'featured' }, { itemId: 'dust_sneezing_choking', price: 4, kind: 'common' });
      T.refreshCurioGear(); T.renderPlazaShop();
      const all = Object.assign({}, PLAZA_ITEMS_TV, PLAZA_ITEMS_COMMON_TV);
      const vis = [...document.querySelectorAll('#plazaShop .pshopItem')].filter((e) => e.offsetParent !== null);
      const ids = vis.map((e) => { const nm = e.querySelector('.pshopName').textContent; return Object.keys(all).find((x) => all[x].name === nm) || ('?' + nm); });
      return { stall: T.map.openStall(), cg: (T.curioGear() || []).length, gearDom: C.gearRows().length, ids, stallOf: ids.map((id) => PM.stallOf(id)) };
    });
    check('(3b) 21 品とも持っている状態で古物商の露店を開いたまま抽選し直す → 装備品の行 0・見えている行は古物商の在庫の品だけ (リングオブスペルターニングを含む)',
      b3s.stall === 'curio' && b3s.cg === 0 && b3s.gearDom === 0 && b3s.ids.length > 0 && b3s.ids.indexOf('ring_spell_turning') >= 0 && b3s.stallOf.every((s) => s === 'curio'), b3s);
    await page.close();

    /* ══ (5a) tavern.html?curio=0 → curioGear が空・装備品の行 0・古物商は在庫の品だけ・名前は新しいまま ══ */
    page = await openPage(browser, 'tavern.html', { qs: '?curio=0', tag: 'curio0', ls: PLAZA_SEED({ curioGear: [{ gear: { acc: 'amulet-health' }, price: 25 }] }) });
    await page.evaluate(HELPERS);
    const r0 = await page.evaluate(() => { const T = window.__plazaTV; return { on: T.curioOn(), rowsBefore: T.shopRows().filter((s) => s.kind === 'gear').length }; });
    await page.evaluate(() => { window.__vpc.clearOwned(); });
    const ent5 = await enterPlaza(page);
    await pressSign(page, 'plazaSign_curio');
    const arr5 = await waitFn(page, () => window.__plazaTV.map.openStall() === 'curio' && !window.__plazaTV.map.isMoving(), 25000);
    const r1 = await page.evaluate((nm) => {
      const T = window.__plazaTV; const cgAfterEnter = T.curioGear(); T.refreshCurioGear();
      const vis = [...document.querySelectorAll('#plazaShop .pshopItem')].filter((e) => e.offsetParent !== null);
      const all = Object.assign({}, PLAZA_ITEMS_TV, PLAZA_ITEMS_COMMON_TV);
      const visNames = vis.map((e) => e.querySelector('.pshopName').textContent);
      return { cgAfterEnter, cg: T.curioGear(), rows: T.shopRows().filter((s) => s.kind === 'gear').length, gearDom: window.__vpc.gearRows().length,
        visNames, nonStock: visNames.filter((n) => !Object.keys(all).some((x) => all[x].name === n)), accName: window.__equipTV.accDef('amulet-health').name, accWant: nm };
    }, RENAME19['生命の護符']);
    check('(5a) tavern.html?curio=0 → curioOn false・(セーブに curioGear を仕込んでも) 装備品の行 0・入場後も抽選し直しても curioGear が空・古物商の露店に見えるのは在庫の品だけ・名前は新しいまま',
      r0.on === false && r0.rowsBefore === 0 && ent5 && arr5 && Array.isArray(r1.cgAfterEnter) && r1.cgAfterEnter.length === 0 && Array.isArray(r1.cg) && r1.cg.length === 0
        && r1.rows === 0 && r1.gearDom === 0 && r1.nonStock.length === 0 && r1.accName === r1.accWant, { r0, entered: ent5, arrived: arr5, r1 });
    await page.close();

    await sleep(500);
    check('(9a) pageerror / console error 0 件 (ダンジョン・酒場。favicon の 404 と [DIAG] は除外)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
  } catch (e) {
    if (!(e && e.skipRest)) {
      console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
      results.push({ name: '(fatal) ' + String(e && e.message || e).slice(0, 200), ok: false, detail: '' });
    } else {
      check('(9a) pageerror / console error 0 件 (ここまでのページ)', pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');
    }
  } finally {
    try { await browser.close(); } catch (e) {}
    try { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) {}
  }

  /* ══ 集計 ══ */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const labels = Array.from(new Set(results.map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0]).filter(Boolean)));
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   節 ' + labels.length + '   (' + Math.round((Date.now() - T0) / 1000) + ' 秒)');
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.name.slice(0, 120) + '  -- ' + String(r.detail).slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = MUTATIONS[tag].expect;
    const red = Array.from(new Set(results.filter((r) => !r.ok).map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0])));
    const miss = want.filter((w) => red.indexOf(w) < 0);
    const extra = red.filter((w) => want.indexOf(w) < 0);
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + red.join(','));
    console.log('[driver]   担当外の巻き込み: ' + (extra.length ? extra.join(',') : 'なし'));
    if (miss.length) { console.error('[driver] ✗ ' + tag + ' の担当の節が赤くなりませんでした (空振り): ' + miss.join(',')); process.exit(1); }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
