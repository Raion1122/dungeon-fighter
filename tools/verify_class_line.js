#!/usr/bin/env node
/*
 * verify_class_line.js — 実装依頼書 #86「名前札の職業を文字で」の受入ドライバ
 *   (依頼書 2026-10-05_class-line-label.md §8 + §12-0 K1〜K11 + §12-1 K12・K13)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_class_line.js                        # 素 (port 10574)
 *   node tools/verify_class_line.js --negative             # 素の基準 + 変異 11 本 (port 10575〜10585)
 *   node tools/verify_class_line.js --negative --only inline,mirror
 *   node tools/verify_class_line.js --mutate paintonce     # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 酒場 (tavern.html) とダンジョン (index.html) の札を実 Chrome の DOM と getBoundingClientRect で測る。
 *   - 職業名の期待値はドライバが PARTY_SLOTS (酒場) / CLASS_DEFS (ダンジョン) の**データ**から自分で引く
 *     (⛔ 実装が使う recruitClassLabel を呼ばない)。色・字の大きさ・字間は縛らない。
 *   - 酒場: desktop 1280x900 / compact 390x844 × (素 / ?classline=0) の 4 腕。
 *   - ダンジョン (K10): sessionStorage の partyMembers で編成を自分で作る 2 編成 × (素 / ?classline=0) の 4 腕。
 *       N = [戦士 NPC イレーナ, 僧侶 NPC ヨナ, 魔法使い=主人公] … 頭が NPC・主人公が仲間の列 (「魔法使い（あなた）」)
 *       H = [戦士=主人公, ドワーフ NPC ダグ, 魔法使い NPC オズ] … 頭が主人公・NPC 仲間 2 人
 *     どちらも起動後にゴーレム兵 (golem_soldier) と従者 (servant) を本番の factory (createAlly + createAllyDom)
 *     で足し、見える敵 1 体 (createEnemy + createEnemyDom・everSeen) を置いてから 1 回の evaluate で測る。
 *     その後 tryPromoteNewHead を直接呼んで頭を全員ぶん委譲し、各段階の #warriorLabel を測る
 *     (K1 = ユーザー決定 (b) / K12 = 従者が頭になった段階で段なし)。
 *
 * ■ 測っているもの
 *   §0 (0a) [装置] 酒場 4 腕すべてで .patronLabel[data-patron] が 4 枚・4 席の classKey が相異なる・左向きの席が 2 つ
 *      (0b) [装置] ダンジョンの素 2 腕で NPC 仲間の札 2 枚以上・主人公の札 1 枚以上・名前の無い仲間 (ゴーレム兵 / 従者) の
 *           札それぞれ 1 枚以上・見える敵の札 1 枚以上。委譲の段階に「NPC→NPC」「主人公→NPC」「→主人公」「→従者」「→ゴーレム兵」が在る
 *      (0c) [装置] 全ページで pageerror 0 件
 *   §1 (1a) ★★ 酒場 desktop / compact の 4 席すべてで .labelClass がちょうど 1 枚・文字が "(" + その席の職業名 + ")"
 *      (1b) 札の箱の高さが ?classline=0 の同じ画面・同じ席と一致 (±0.5px) = 罠 A
 *      (1c) .labelClass の下端 ≤ 札の上端 + 枠の実測 (border-top-width × 実効の縦倍率) + 0.5px (K3/K13)・
 *           上端 < 札の上端・横の中心が札の中心と ±1px
 *      (1d) 札の文字に PM_CLASS_EMOJI のどのアイコンも含まれない (初期 / 約束中 / 解いた後)
 *      (1e) 最悪の組 (4 席を「🤝 ガウェイン」+「(魔法使い)」へ patronLabelPaint で描き直す) で、隣の席 (A-B・C-D) の
 *           札の箱・職業の段どうしが重ならない — desktop と compact
 *      (1f) 約束 → 取り消し (refreshPatronLabelFor → doPromiseDrop・4 席) と 2 席約束 → doPromiseDisband の後も
 *           .labelClass がちょうど 1 枚残り (文字も正しい)、約束中の textContent は 🤝 で始まり、解いた後は 🤝 を含まない = 罠 B・C
 *      (1g) 左向きの席 (patronB / patronD) の .labelClass の実効の横倍率 (getComputedStyle の行列を親まで掛け合わせる) が正
 *   §2 (2a) ★★ NPC 仲間の札すべてで .labelClass がちょうど 1 枚・文字が "(" + CLASS_DEFS[その仲間の classKey].name + ")"
 *      (2b) 主人公の札 (仲間の列)・名前の無い仲間の札・見える敵の札に .labelClass が 0 個
 *      (2c) NPC 仲間の札の箱の高さが ?classline=0 の同じ仲間と一致 (±0.5px)、かつ同じ腕の主人公 / 敵の札と同じ高さ (±0.5px)
 *      (2d) NPC 仲間の .labelClass の下端 ≤ 札の上端 + 枠の実測 + 0.5px・上端 < 札の上端・横の中心 ±1px
 *      (2e) [K1] 頭が NPC の段階 (N の起動時と、委譲で NPC が頭になった全段階) で #warriorLabel の .labelClass がちょうど 1 枚・
 *           文字が "(" + CLASS_DEFS[頭の classKey].name + ")"・下端 ≤ 上端 + 枠 + 0.5px・
 *           頭の札の高さが ?classline=0 の同じ編成の起動時の頭の札と一致 (±0.5px)
 *      (2f) [K1/K12] 頭が主人公・名前の無い仲間 (ゴーレム兵 / 従者) の段階 (H の起動時・委譲) で #warriorLabel の .labelClass が 0 個
 *   §3 (3a) tavern.html?classline=0 → 4 席の textContent が PM_CLASS_EMOJI[classKey] + " " + 名前 に完全一致・.labelClass 0 個、
 *           約束中は "🤝 " + アイコン + " " + 名前 に完全一致 (desktop / compact)
 *      (3b) index.html?classline=0 → 起動時と委譲の全段階で文書中の .labelClass が 0 個 (2 編成)
 *   ⛔ 測らないこと (依頼書 §8): 段の色・font-size の具体値・字間 / 約束の一覧の行・肖像の代わりの絵
 *
 * ■ ⚠ 計測機構
 *   - tavern.html / index.html は起動時に 1 回だけ readFileSync して凍結し、変異はその文字列をメモリ上で差し替えて配る
 *     (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。素と各変異はポート = オリジンが違う。
 *   - 起動時に全変異のアンカーを原本で検算する (対象ファイルでちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。崩れたら素でも exit 3。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」。担当は --mutate で実走して決めた
 *     (依頼書 §12-2)。依頼書 §8 の予想 (NEG_PREDICTED) と違う所はログに出す (予想の訂正は §12-2 に記録)。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10574** (素) / 変異 **10575〜10585** (11 本・MUTATIONS の並び順)。次の新規ドライバ base = 10586。
 * ■ 所要は依頼書 §12-2 に記録。
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
const PORT = parseInt(arg('port', '10574'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた条件 (データ) */
const TOL_H = 0.5;          // (1b)(2c)(2e) 高さの一致
const TOL_EDGE = 0.5;       // (1c)(2d)(2e) 枠の実測に足す余白 (K3/K13)
const TOL_CX = 1;           // (1c)(2d) 横の中心
const WORST = { name: 'ガウェイン', classKey: 'mage' };   // (1e) 最悪の組 (名前最長 5 文字・職業名最長 4 文字)
const PAIRS = [['patronA', 'patronB'], ['patronC', 'patronD']];   // js/npc-crowd.js の隣どうし
const LEFT_SEATS = ['patronB', 'patronD'];
const VIEW_D = { width: 1280, height: 900 };
const VIEW_C = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const PM_N = [{ classKey: 'warrior', name: 'イレーナ', zone: 'front' }, { classKey: 'cleric', name: 'ヨナ', zone: 'mid' }, { classKey: 'mage', isHero: true, zone: 'rear' }];
const PM_H = [{ classKey: 'warrior', isHero: true, zone: 'front' }, { classKey: 'dwarf', name: 'ダグ', zone: 'front' }, { classKey: 'mage', name: 'オズ', zone: 'rear' }];

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const PRISTINE = {
  'tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8'),
  'index.html': fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
};
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE['tavern.html'].indexOf('function isClassLineOn()') < 0) vetFail('配信する tavern.html に isClassLineOn が無い (#86 実装前のツリーで走らせている)');
if (PRISTINE['index.html'].indexOf('const CLASS_LINE_ON') < 0) vetFail('配信する index.html に CLASS_LINE_ON が無い (#86 実装前のツリーで走らせている)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 8 本 + K1 の頭の札 3 本)。⚠ 置換は 1 行の中だけ (行数不変)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const T = 'tavern.html', I = 'index.html';
const MUTATIONS = {
  /* 罠 A: 段を札の中の普通の 2 行目にする。⚠ K2: position:absolute を外しただけ (inline) では札が nowrap なので
     高さが変わらない ⇒ display:block + position:static で「普通の行」を作る (酒場とダンジョンの両方の規則) */
  inline: [
    { file: T, from: '    .patronLabel .labelClass {', to: '    .patronLabel .labelClass { display: block !important; position: static !important; transform: none !important; /* ★変異inline */' },
    { file: I, from: '    .allyLabel .labelClass {', to: '    .allyLabel .labelClass { display: block !important; position: static !important; transform: none !important; /* ★変異inline */' }],
  /* 罠 B: 段を初回の描画でだけ足す (2 回目以降の patronLabelPaint = 約束の付け外しでは足さない) */
  paintonce: [
    { file: T, from: '      lb.appendChild(clsLine);', to: '      if (!lb.__m86once) { lb.__m86once = 1; lb.appendChild(clsLine); } /* ★変異paintonce */' }],
  /* 罠 C: 段を札の先頭に挿す */
  classfirst: [
    { file: T, from: '      lb.appendChild(clsLine);', to: '      lb.prepend(clsLine); /* ★変異classfirst */' }],
  /* 酒場の段に隣の席の classKey を使う */
  wrongclass: [
    { file: T, from: '      clsLine.textContent = "(" + recruitClassLabel(m.classKey) + ")";',
      to: '      clsLine.textContent = "(" + recruitClassLabel((function () { const ks = Object.keys(todaysPatrons || {}); const i = ks.findIndex((k) => todaysPatrons[k] === m); return i < 0 ? m.classKey : todaysPatrons[ks[(i + 1) % ks.length]].classKey; })()) + ")"; /* ★変異wrongclass */' }],
  /* 段を足したうえでアイコンも残す */
  emojistay: [
    { file: T, from: '      lb.textContent = (promised ? "🤝 " : "") + (m.name || "");',
      to: '      lb.textContent = (promised ? "🤝 " : "") + (PM_CLASS_EMOJI[m.classKey] || "") + " " + (m.name || ""); /* ★変異emojistay */' }],
  /* ダンジョンで主人公・名前の無い仲間にも段を付ける */
  heroclass: [
    { file: I, from: '      if (CLASS_LINE_ON && !ally.isHero && ally.npcName) {', to: '      if (CLASS_LINE_ON) { /* ★変異heroclass */' }],
  /* 段に scaleX(-1) を足す (酒場) */
  mirror: [
    { file: T, from: '    .patronLabel .labelClass {', to: '    .patronLabel .labelClass { transform: translateX(-50%) scaleX(-1) !important; /* ★変異mirror */' }],
  /* ?classline=0 を無視する (酒場とダンジョンの両方) */
  deadswitch: [
    { file: T, from: '    try { return new URLSearchParams(location.search).get("classline") !== "0"; }', to: '    try { return true; /* ★変異deadswitch */ }' },
    { file: I, from: '      try { return new URLSearchParams(window.location.search).get("classline") !== "0"; }', to: '      try { return true; /* ★変異deadswitch */ }' }],
  /* K1: 頭の札に段を付けない */
  headnone: [
    { file: I, from: '      wl.appendChild(clsLine);', to: '      /* ★変異headnone */' }],
  /* K1: 委譲で頭の段を付け替えない (起動時だけ描く) */
  headstale: [
    { file: I, from: '      paintHeadClassLine(!nh.isHero && !!nh.npcName, nh.classKey);', to: '      /* ★変異headstale */ void 0;' }],
  /* K1/K12: 頭が主人公・名前の無い仲間でも段を付ける */
  headany: [
    { file: I, from: '      if (!CLASS_LINE_ON || !isNpcHead) return;', to: '      if (!CLASS_LINE_ON) return; /* ★変異headany */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-2)。
 * 依頼書 §8 の予想より広いもの (どれも本物の検出・連鎖):
 *   inline     … (2e) 頭の札も .allyLabel なので同じ規則で箱が 14.375 → 21.563 に伸びる。⚠ (1e) は緑 (最悪の組でも縦に伸びるだけで隣と重ならない)
 *   paintonce  … (1e) 最悪の組の描き直し (2 回目の patronLabelPaint) で段が消える = 「段が無い」で形が崩れる
 *   classfirst … (1e) 最悪の組の文字が「(魔法使い)🤝 ガウェイン」= 🤝 で始まらない
 *   wrongclass … (1f) 約束の付け外しの後も段の文字を期待値と突き合わせている
 *   emojistay  … (1e) 最悪の組の文字が「🤝 🔮 ガウェイン」= 形が崩れる
 *   headstale  … (2e) 委譲で NPC→NPC のとき前の頭の「(戦士)」が残る (ヨナ(戦士)) */
const NEG_EXPECT = {
  inline:     ['(1b)', '(1c)', '(2c)', '(2d)', '(2e)'],
  paintonce:  ['(1e)', '(1f)'],
  classfirst: ['(1e)', '(1f)'],
  wrongclass: ['(1a)', '(1f)'],
  emojistay:  ['(1d)', '(1e)'],
  heroclass:  ['(2b)'],
  mirror:     ['(1g)'],
  deadswitch: ['(3a)', '(3b)'],
  headnone:   ['(2e)'],
  headstale:  ['(2e)', '(2f)'],
  headany:    ['(2f)'],
};
/* 変異 → 時機しだいで赤くなり得る節 (緑でも赤でも可)。測る値は固定の編成・固定の最悪の組から出るので、どの変異にも無い。 */
const NEG_MAYBE = { inline: [], paintonce: [], classfirst: [], wrongclass: [], emojistay: [], heroclass: [], mirror: [], deadswitch: [], headnone: [], headstale: [], headany: [] };
/* 依頼書 §8 の予想 (記録用。実走と違う所はログに出す) */
const NEG_PREDICTED = {
  inline: ['(1b)', '(1c)', '(2c)', '(2d)'], paintonce: ['(1f)'], classfirst: ['(1f)'], wrongclass: ['(1a)'], emojistay: ['(1d)'],
  heroclass: ['(2b)'], mirror: ['(1g)'], deadswitch: ['(3a)', '(3b)'], headnone: ['(2e)'], headstale: ['(2f)'], headany: ['(2f)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 11) vetFail('変異は 11 本まで (ポート 10575〜10585)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_MAYBE[k] || !NEG_PREDICTED[k])) vetFail('NEG_EXPECT / NEG_MAYBE / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length) vetFail('変異 ' + k + ' に必ず赤の節が無い');
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
  for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
    const core = e.from.trim();
    const clash = src.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
    if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(','));
  }
}
const _mutCache = {};
function servedFiles(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key]) return _mutCache[key];
  const out = { 'tavern.html': PRISTINE['tavern.html'], 'index.html': PRISTINE['index.html'] };
  for (const e of MUTATIONS[key]) {
    const c = countOf(PRISTINE[e.file], e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + e.file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE[e.file], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    out[e.file] = out[e.file].split(e.from).join(e.to);
  }
  for (const f of [T, I]) if (out[f].split('\n').length !== PRISTINE[f].split('\n').length) vetFail('変異 ' + key + ' が ' + f + ' の行数を変えた');
  if (out[T] === PRISTINE[T] && out[I] === PRISTINE[I]) vetFail('変異 ' + key + ' が何も変えていない');
  _mutCache[key] = out;
  return out;
}
for (const k of MUT_ORDER) servedFiles(k);
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本でちょうど 1 箇所・行数不変・他ドライバとアンカーの重なり 0');

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
  const buf = { 'tavern.html': Buffer.from(files[T], 'utf8'), 'index.html': Buffer.from(files[I], 'utf8') };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        res.on('error', () => {});
        let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (rel === '') rel = 'index.html';
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)',
  '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(3a)', '(3b)'];
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
 * ページ側の観測 (⛔ 期待値の判定はここに書かない — 生の値と「データから引いた期待の文字」だけ返す)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* 酒場: 4 席の札。期待の職業名は PARTY_SLOTS (データ) から引く (recruitClassLabel を呼ばない) */
const TAVERN_OBS = () => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: (r.left + r.right) / 2 }; };
  const eff = (el) => { let a = 1, d = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const t = getComputedStyle(e).transform; if (t && t !== 'none') { const m = new DOMMatrixReadOnly(t); a *= m.a; d *= m.d; } } return { sx: a, sy: d }; };
  const emojis = Object.keys(PM_CLASS_EMOJI).map((k) => PM_CLASS_EMOJI[k]);
  const seat = (lb) => {
    const k = lb.getAttribute('data-patron'); const m = todaysPatrons ? todaysPatrons[k] : null;
    const sl = m ? PARTY_SLOTS.find((x) => x && x.classKey === m.classKey) : null;
    const cl = lb.querySelectorAll('.labelClass'); const c0 = cl[0] || null; const u = lb.closest('.npcUnit');
    const e = eff(lb);
    return { k, name: m ? m.name : null, classKey: m ? m.classKey : null, expect: sl ? '(' + sl.name + ')' : null,
      emoji: m ? (PM_CLASS_EMOJI[m.classKey] || '') : null, text: lb.textContent, nCls: cl.length, clsText: c0 ? c0.textContent : null,
      box: R(lb), cls: R(c0), borderTop: parseFloat(getComputedStyle(lb).borderTopWidth) || 0, lbSy: e.sy,
      clsSx: c0 ? eff(c0).sx : null, faceLeft: !!(u && u.classList.contains('faceLeft')),
      hasEmoji: emojis.filter((x) => x && lb.textContent.indexOf(x) >= 0) };
  };
  const seats = {};
  document.querySelectorAll('.patronLabel[data-patron]').forEach((lb) => { const s = seat(lb); seats[s.k] = s; });
  return { n: document.querySelectorAll('.patronLabel[data-patron]').length, compact: document.body.classList.contains('compact'), seats };
};
/* 酒場: 約束 → 取り消し (4 席) と 2 席約束 → doPromiseDisband */
const TAVERN_PROMISE = () => {
  const lbOf = (k) => document.querySelector('.patronLabel[data-patron="' + k + '"]');
  const emojis = Object.keys(PM_CLASS_EMOJI).map((k) => PM_CLASS_EMOJI[k]);
  const st = (k) => { const lb = lbOf(k); const cl = lb.querySelectorAll('.labelClass');
    return { k, text: lb.textContent, nCls: cl.length, clsText: cl[0] ? cl[0].textContent : null, h: lb.getBoundingClientRect().height,
      hasEmoji: emojis.filter((x) => x && lb.textContent.indexOf(x) >= 0) }; };
  const out = { drop: [], disband: null, err: null };
  try {
    const keys = Object.keys(todaysPatrons);
    for (const k of keys) {
      const m = todaysPatrons[k];
      DFRecruits.add(m, RECRUIT_MAX); refreshPatronLabelFor(m);
      const during = st(k);
      doPromiseDrop(m.name);
      out.drop.push({ k, name: m.name, during, after: st(k) });
    }
    const two = keys.slice(0, 2);
    for (const k of two) { DFRecruits.add(todaysPatrons[k], RECRUIT_MAX); refreshPatronLabelFor(todaysPatrons[k]); }
    const during = two.map(st);
    doPromiseDisband();
    out.disband = { during, after: keys.map(st) };
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};
/* 酒場 ?classline=0: 約束中の文字 */
const TAVERN_OFF_PROMISE = () => {
  const out = { during: [], err: null };
  try {
    for (const k of Object.keys(todaysPatrons)) {
      const m = todaysPatrons[k]; const lb = document.querySelector('.patronLabel[data-patron="' + k + '"]');
      DFRecruits.add(m, RECRUIT_MAX); refreshPatronLabelFor(m);
      out.during.push({ k, name: m.name, emoji: PM_CLASS_EMOJI[m.classKey] || '', text: lb.textContent, nCls: lb.querySelectorAll('.labelClass').length });
      doPromiseDrop(m.name);
    }
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};
/* 酒場 (1e): 4 席を最悪の組へ描き直す (patronLabelPaint を通し、🤝 を名前の前に足す) */
const TAVERN_WORST = (w) => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const out = { seats: {}, err: null };
  try {
    document.querySelectorAll('.patronLabel[data-patron]').forEach((lb) => {
      patronLabelPaint(lb, { name: w.name, classKey: w.classKey });
      const tn = Array.from(lb.childNodes).find((n) => n.nodeType === 3);
      if (tn) tn.nodeValue = '🤝 ' + tn.nodeValue;
      const c = lb.querySelector('.labelClass');
      out.seats[lb.getAttribute('data-patron')] = { text: lb.textContent, box: R(lb), cls: R(c), clsText: c ? c.textContent : null };
    });
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* ダンジョン: 母集団を本番の factory で足し、測って、頭を全員ぶん委譲しながら #warriorLabel を測る (1 回の evaluate) */
const DUNGEON_OBS = () => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: (r.left + r.right) / 2 }; };
  const sy = (el) => { let d = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const t = getComputedStyle(e).transform; if (t && t !== 'none') d *= new DOMMatrixReadOnly(t).d; } return d; };
  const nameOf = (k) => (CLASS_DEFS[k] && CLASS_DEFS[k].name) || null;
  const lab = (el) => { if (!el) return null; const cl = el.querySelectorAll('.labelClass');
    return { text: el.textContent, nCls: cl.length, clsText: cl[0] ? cl[0].textContent : null, box: R(el), cls: R(cl[0] || null),
      borderTop: parseFloat(getComputedStyle(el).borderTopWidth) || 0, sy: sy(el) }; };
  const out = { labelSmall: document.body.classList.contains('labelSmall'), err: null };
  try {
    /* 名前の無い仲間 2 体 (ゴーレム兵 / 従者) */
    for (const ck of ['golem_soldier', 'servant']) { const a = createAlly(ck, playerX + 60, playerY); allies.push(a); createAllyDom(a, allies.length - 1); }
    /* 見える敵 1 体 */
    const ptx = Math.floor(playerX / TILE_SIZE), pty = Math.floor(playerY / TILE_SIZE);
    const ei = enemies.length; const e = createEnemy('goblin', ptx + 3, pty);
    e.everSeen = true; e.state = 'idle'; enemies.push(e); createEnemyDom(ei, e.def, 'goblin');
    updatePositions();
  } catch (e) { out.err = 'fixture: ' + String((e && e.message) || e); }
  const wl = document.getElementById('warriorLabel');
  out.allies = allies.map((a) => ({ classKey: a.classKey, isHero: !!a.isHero, npcName: a.npcName || null, isSummon: !!a.isSummon,
    expect: nameOf(a.classKey) ? '(' + nameOf(a.classKey) + ')' : null, ...lab(a.nameLabelEl) }));
  out.enemies = Array.from(document.querySelectorAll('.enemyLabel')).map(lab).filter((x) => x && x.box && x.box.h > 0);
  out.enemyClsAll = document.querySelectorAll('.enemyLabel .labelClass').length;
  const head = (tag, cand) => ({ tag, heroIsHead: !!heroIsHead, classKey: leaderClassKey, expect: nameOf(leaderClassKey) ? '(' + nameOf(leaderClassKey) + ')' : null,
    cand, docCls: document.querySelectorAll('.labelClass').length, ...lab(wl) });
  out.steps = [head('boot', null)];
  try {
    for (let i = 0; i < 8; i++) {
      const ni = pickNextHeadIndex(); if (ni < 0) break;
      const a = allies[ni];
      const cand = { classKey: a.classKey, isHero: !!a.isHero, npcName: a.npcName || null };
      const ok = tryPromoteNewHead('verify_class_line');
      try { updatePositions(); } catch (e) {}
      out.steps.push({ ok, ...head('deleg' + (i + 1), cand) });
      if (!ok) break;
    }
  } catch (e) { out.err = (out.err ? out.err + ' / ' : '') + 'deleg: ' + String((e && e.message) || e); }
  return out;
};

async function newPage(browser, ctx, label) {
  const page = await browser.newPage();
  ctx.pages++;
  page.on('pageerror', (e) => { ctx.errs.push(label + ': ' + String((e && e.message) || e).slice(0, 200)); });
  return page;
}
async function tavernArm(browser, port, ctx, vp, vpName, q) {
  const label = 'tavern/' + vpName + (q ? '?' + q : '');
  const page = await newPage(browser, ctx, label);
  const out = { label };
  try {
    await page.setViewport(vp);
    const url = 'http://127.0.0.1:' + port + '/tavern.html' + (q ? '?' + q : '');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1'); localStorage.setItem('dragonfighters.prepOnboardingSeen', '1'); } catch (e) {} });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction("document.querySelectorAll('.patronLabel[data-patron]').length === 4", { timeout: 30000 });
    await sleep(800);
    out.obs = await page.evaluate(TAVERN_OBS);
    if (q) out.offPromise = await page.evaluate(TAVERN_OFF_PROMISE);
    else {
      out.promise = await page.evaluate(TAVERN_PROMISE);
      out.worst = await page.evaluate(TAVERN_WORST, WORST);
    }
  } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
  finally { await page.close().catch(() => {}); }
  const s = out.obs ? Object.values(out.obs.seats).map((x) => x.k.slice(-1) + ':' + x.text) : [];
  console.log('    [腕] ' + label + (out.err ? ' 例外 ' + out.err : '') + ' ' + s.join(' / '));
  return out;
}
async function dungeonArm(browser, port, ctx, pmName, pm, q) {
  const label = 'index/' + pmName + (q ? '?' + q : '');
  const page = await newPage(browser, ctx, label);
  const out = { label };
  try {
    await page.evaluateOnNewDocument((p) => { try { sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
      sessionStorage.setItem('dragonfighters.partyMembers', p); } catch (e) {} }, JSON.stringify(pm));
    await page.setViewport(VIEW_D);
    await page.goto('http://127.0.0.1:' + port + '/index.html?enemybadge=1' + (q ? '&' + q : ''), { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForFunction(() => typeof allies !== 'undefined' && typeof updatePositions === 'function' && typeof tryPromoteNewHead === 'function'
      && typeof createEnemy === 'function' && allies.length > 0 && allies.every((a) => a.nameLabelEl), { timeout: 40000 });
    await sleep(1500);
    out.obs = await page.evaluate(DUNGEON_OBS);
  } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
  finally { await page.close().catch(() => {}); }
  const o = out.obs;
  console.log('    [腕] ' + label + (out.err ? ' 例外 ' + out.err : '') + (o ? ' 仲間 ' + o.allies.map((a) => a.text).join(' / ')
    + ' | 頭 ' + o.steps.map((s) => s.text).join(' → ') + (o.err ? ' err=' + o.err : '') : ''));
  return out;
}

/* 矩形の重なり (面積 > 0) */
const overlap = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0;
/* 段が札の上に乗っている (K3/K13: 下端の許容 = 枠の実測 × 実効の縦倍率 + 0.5px) */
function onTop(s) {
  if (!s || !s.cls || !s.box) return { ok: false, why: '段か札が無い' };
  const k = Math.abs(s.lbSy != null ? s.lbSy : (s.sy != null ? s.sy : 1));
  const edge = s.box.t + (s.borderTop || 0) * k + TOL_EDGE;
  const ok = s.cls.b <= edge && s.cls.t < s.box.t && Math.abs(s.cls.cx - s.box.cx) <= TOL_CX;
  return { ok, clsB: +s.cls.b.toFixed(3), boxT: +s.box.t.toFixed(3), edge: +edge.toFixed(3), dcx: +(s.cls.cx - s.box.cx).toFixed(3) };
}

async function runSuite(browser, port) {
  const R = mkResults();
  const ctx = { errs: [], pages: 0 };
  try {
    const TD = await tavernArm(browser, port, ctx, VIEW_D, 'desktop', '');
    const TD0 = await tavernArm(browser, port, ctx, VIEW_D, 'desktop', 'classline=0');
    const TC = await tavernArm(browser, port, ctx, VIEW_C, 'compact', '');
    const TC0 = await tavernArm(browser, port, ctx, VIEW_C, 'compact', 'classline=0');
    const DN = await dungeonArm(browser, port, ctx, 'N', PM_N, '');
    const DN0 = await dungeonArm(browser, port, ctx, 'N', PM_N, 'classline=0');
    const DH = await dungeonArm(browser, port, ctx, 'H', PM_H, '');
    const DH0 = await dungeonArm(browser, port, ctx, 'H', PM_H, 'classline=0');
    const TAV = [['desktop', TD, TD0], ['compact', TC, TC0]];
    const seatsOf = (arm) => (arm && arm.obs) ? Object.values(arm.obs.seats) : [];
    const stepsOf = (arm) => (arm && arm.obs ? arm.obs.steps : []);

    /* ── §0 ── */
    const v0a = [TD, TD0, TC, TC0].map((a) => { const ss = seatsOf(a); const ks = ss.map((s) => s.classKey);
      return { arm: a.label, n: a.obs ? a.obs.n : null, classKeys: ks, distinct: new Set(ks.filter(Boolean)).size,
        left: ss.filter((s) => s.faceLeft).map((s) => s.k), err: a.err || null }; });
    R.check('(0a)', '[装置] 酒場 4 腕で札 4 枚・4 席の classKey が相異なる・左向きの席が patronB / patronD',
      v0a.every((x) => x.n === 4 && x.distinct === 4 && J(x.left.slice().sort()) === J(LEFT_SEATS)), v0a);
    const dSoft = [DN, DH];
    const allA = dSoft.flatMap((a) => (a.obs ? a.obs.allies : []));
    const npcA = allA.filter((a) => !a.isHero && a.npcName);
    const heroA = allA.filter((a) => a.isHero);
    const golemA = allA.filter((a) => !a.isHero && !a.npcName && a.classKey === 'golem_soldier');
    const servA = allA.filter((a) => !a.isHero && !a.npcName && a.classKey === 'servant');
    const enA = dSoft.flatMap((a) => (a.obs ? a.obs.enemies : []));
    /* 段階ごとに「頭は名前のある NPC か」を、委譲の前に読んだ候補 (cand) と起動時の編成 (PM) から決める */
    const isNpcHead = (arm, s) => (s.cand ? (!s.cand.isHero && !!s.cand.npcName) : (arm === DN || arm === DN0));
    const trans = dSoft.flatMap((a) => stepsOf(a).map((s, i, st) => (i === 0 ? null
      : { from: isNpcHead(a, st[i - 1]) ? 'npc' : (st[i - 1].cand ? (st[i - 1].cand.isHero ? 'hero' : st[i - 1].cand.classKey) : 'hero'),
        to: s.cand.isHero ? 'hero' : (s.cand.npcName ? 'npc' : s.cand.classKey) })).filter(Boolean));
    const kinds = { npc2npc: trans.some((t) => t.from === 'npc' && t.to === 'npc'), hero2npc: trans.some((t) => t.from === 'hero' && t.to === 'npc'),
      toHero: trans.some((t) => t.to === 'hero'), toServant: trans.some((t) => t.to === 'servant'), toGolem: trans.some((t) => t.to === 'golem_soldier') };
    const v0b = { npc: npcA.length, hero: heroA.length, golem: golemA.length, servant: servA.length, enemies: enA.length, kinds,
      bootN: stepsOf(DN)[0] ? stepsOf(DN)[0].heroIsHead : null, bootH: stepsOf(DH)[0] ? stepsOf(DH)[0].heroIsHead : null,
      errs: dSoft.map((a) => a.err || (a.obs && a.obs.err) || null), labelSmall: dSoft.map((a) => a.obs && a.obs.labelSmall) };
    R.check('(0b)', '[装置] ダンジョンの素 2 腕: NPC 仲間 ≥2・主人公 ≥1・ゴーレム兵 ≥1・従者 ≥1・見える敵 ≥1 / N の頭 = NPC・H の頭 = 主人公 / 委譲に NPC→NPC・主人公→NPC・→主人公・→従者・→ゴーレム兵',
      npcA.length >= 2 && heroA.length >= 1 && golemA.length >= 1 && servA.length >= 1 && enA.length >= 1
        && v0b.bootN === false && v0b.bootH === true && Object.values(kinds).every(Boolean) && v0b.errs.every((x) => !x), v0b);
    R.check('(0c)', '[装置] 全ページで pageerror 0 件', ctx.pages > 0 && ctx.errs.length === 0, 'ページ ' + ctx.pages + ' 枚 / pageerror ' + J(ctx.errs.slice(0, 3)));

    /* ── §1 ── */
    const v1a = TAV.flatMap(([vn, a]) => seatsOf(a).map((s) => ({ vp: vn, k: s.k, nCls: s.nCls, cls: s.clsText, expect: s.expect,
      ok: s.nCls === 1 && !!s.expect && s.clsText === s.expect })));
    R.check('(1a)', '★★ 酒場 desktop / compact の 4 席すべてで .labelClass がちょうど 1 枚・文字が "(" + PARTY_SLOTS の職業名 + ")"',
      v1a.length === 8 && v1a.every((x) => x.ok), v1a.filter((x) => !x.ok).concat(v1a.filter((x) => x.ok).slice(0, 2)));
    const v1b = TAV.flatMap(([vn, a, a0]) => seatsOf(a).map((s) => { const o = a0 && a0.obs && a0.obs.seats[s.k];
      const h = s.box && s.box.h, h0 = o && o.box && o.box.h;
      return { vp: vn, k: s.k, h: h != null ? +h.toFixed(3) : null, h0: h0 != null ? +h0.toFixed(3) : null, ok: h != null && h0 != null && Math.abs(h - h0) <= TOL_H }; }));
    R.check('(1b)', '札の箱の高さが ?classline=0 の同じ画面・同じ席と一致 (±' + TOL_H + 'px) = 罠 A',
      v1b.length === 8 && v1b.every((x) => x.ok), v1b);
    const v1c = TAV.flatMap(([vn, a]) => seatsOf(a).map((s) => ({ vp: vn, k: s.k, ...onTop(s) })));
    R.check('(1c)', '段の下端 ≤ 札の上端 + 枠の実測 + ' + TOL_EDGE + 'px・段の上端 < 札の上端・横の中心 ±' + TOL_CX + 'px',
      v1c.length === 8 && v1c.every((x) => x.ok), v1c);
    const pr = TAV.map(([vn, a]) => ({ vn, p: a && a.promise }));
    const v1d = [];
    for (const [vn, a] of TAV) for (const s of seatsOf(a)) v1d.push({ vp: vn, at: 'init', k: s.k, hit: s.hasEmoji });
    for (const { vn, p } of pr) if (p) {
      for (const d of p.drop) { v1d.push({ vp: vn, at: 'promised', k: d.k, hit: d.during.hasEmoji }); v1d.push({ vp: vn, at: 'dropped', k: d.k, hit: d.after.hasEmoji }); }
      if (p.disband) for (const x of p.disband.after) v1d.push({ vp: vn, at: 'disband', k: x.k, hit: x.hasEmoji });
    }
    R.check('(1d)', '札の文字に PM_CLASS_EMOJI のアイコンが 1 つも無い (初期 / 約束中 / 取り消し後 / 解散後)',
      v1d.length === 8 + 2 * (8 + 4) && v1d.every((x) => x.hit && x.hit.length === 0), v1d.filter((x) => !x.hit || x.hit.length).slice(0, 8).concat([{ n: v1d.length }]));
    const v1e = TAV.map(([vn, a]) => { const w = a && a.worst; if (!w || w.err) return { vp: vn, ok: false, err: w ? w.err : 'なし' };
      const ss = w.seats; const pairs = PAIRS.map(([x, y]) => { const X = ss[x], Y = ss[y];
        const okShape = !!X && !!Y && !!X.cls && !!Y.cls && X.clsText === '(魔法使い)' && Y.clsText === '(魔法使い)' && X.text.indexOf('🤝 ガウェイン') === 0 && Y.text.indexOf('🤝 ガウェイン') === 0;
        const hits = okShape ? [['box', 'box', X.box, Y.box], ['box', 'cls', X.box, Y.cls], ['cls', 'box', X.cls, Y.box], ['cls', 'cls', X.cls, Y.cls]]
          .filter((q) => overlap(q[2], q[3])).map((q) => x.slice(-1) + '.' + q[0] + '×' + y.slice(-1) + '.' + q[1]) : ['形が崩れている'];
        const gap = okShape ? +(Y.box.l - X.box.r).toFixed(2) : null;
        return { pair: x.slice(-1) + '-' + y.slice(-1), hits, boxGap: gap, aLeft: X && X.box ? +X.box.l.toFixed(1) : null }; });
      return { vp: vn, ok: pairs.every((p) => p.hits.length === 0), pairs }; });
    R.check('(1e)', '最悪の組 (🤝 ガウェイン + (魔法使い)) で隣の席 A-B・C-D の札の箱 / 段が重ならない (desktop / compact)',
      v1e.length === 2 && v1e.every((x) => x.ok), v1e);
    const v1f = [];
    for (const { vn, p } of pr) {
      if (!p || p.err) { v1f.push({ vp: vn, ok: false, err: p ? p.err : 'なし' }); continue; }
      const exp = {}; for (const [vn2, a] of TAV) if (vn2 === vn) for (const s of seatsOf(a)) exp[s.k] = s.expect;
      for (const d of p.drop) v1f.push({ vp: vn, k: d.k, during: d.during.text, after: d.after.text, nD: d.during.nCls, nA: d.after.nCls,
        ok: d.during.text.indexOf('🤝') === 0 && d.after.text.indexOf('🤝') < 0 && d.during.nCls === 1 && d.after.nCls === 1
          && d.during.clsText === exp[d.k] && d.after.clsText === exp[d.k] });
      if (!p.disband) v1f.push({ vp: vn, ok: false, err: 'disband なし' });
      else {
        for (const x of p.disband.during) v1f.push({ vp: vn, at: 'disband前', k: x.k, text: x.text, ok: x.text.indexOf('🤝') === 0 && x.nCls === 1 && x.clsText === exp[x.k] });
        for (const x of p.disband.after) v1f.push({ vp: vn, at: 'disband後', k: x.k, text: x.text, ok: x.text.indexOf('🤝') < 0 && x.nCls === 1 && x.clsText === exp[x.k] });
      }
    }
    R.check('(1f)', '約束 → 取り消し (4 席) / 2 席約束 → 解散の後も段がちょうど 1 枚・約束中は 🤝 で始まり・解くと 🤝 を含まない = 罠 B・C',
      v1f.length === 2 * (4 + 2 + 4) && v1f.every((x) => x.ok), v1f.filter((x) => !x.ok).concat(v1f.filter((x) => x.ok).slice(0, 2)));
    const v1g = TAV.flatMap(([vn, a]) => seatsOf(a).filter((s) => s.faceLeft).map((s) => ({ vp: vn, k: s.k, sx: s.clsSx != null ? +s.clsSx.toFixed(3) : null })));
    R.check('(1g)', '左向きの席 (patronB / patronD) の段の実効の横倍率が正 (鏡文字でない)',
      v1g.length === 4 && v1g.every((x) => typeof x.sx === 'number' && x.sx > 0), v1g);

    /* ── §2 ── */
    const v2a = npcA.map((a) => ({ name: a.npcName, cls: a.clsText, expect: a.expect, nCls: a.nCls, ok: a.nCls === 1 && !!a.expect && a.clsText === a.expect }));
    R.check('(2a)', '★★ NPC 仲間の札すべてで .labelClass がちょうど 1 枚・文字が "(" + CLASS_DEFS[classKey].name + ")"',
      v2a.length >= 2 && v2a.every((x) => x.ok), v2a);
    const v2b = heroA.map((a) => ({ who: 'hero:' + a.text, n: a.nCls })).concat(golemA.concat(servA).map((a) => ({ who: a.classKey + ':' + a.text, n: a.nCls })),
      enA.map((e) => ({ who: 'enemy:' + e.text, n: e.nCls })), dSoft.map((a) => ({ who: 'enemyAll:' + a.label, n: a.obs ? a.obs.enemyClsAll : null })));
    R.check('(2b)', '主人公の札・名前の無い仲間 (ゴーレム兵 / 従者) の札・敵の札に .labelClass が 0 個',
      heroA.length >= 1 && golemA.length + servA.length >= 2 && enA.length >= 1 && v2b.every((x) => x.n === 0), v2b);
    const v2c = [];
    for (const [a, a0] of [[DN, DN0], [DH, DH0]]) {
      if (!a.obs || !a0 || !a0.obs) { v2c.push({ arm: a.label, ok: false, err: 'obs なし' }); continue; }
      const refs = a.obs.allies.filter((x) => x.isHero).map((x) => x.box.h).concat(a.obs.enemies.map((e) => e.box.h),
        stepsOf(a)[0] && stepsOf(a)[0].heroIsHead && stepsOf(a)[0].box ? [stepsOf(a)[0].box.h] : []);
      for (const x of a.obs.allies.filter((y) => !y.isHero && y.npcName)) {
        const o = a0.obs.allies.find((y) => y.npcName === x.npcName);
        const h = x.box.h, h0 = o ? o.box.h : null;
        v2c.push({ arm: a.label, name: x.npcName, h: +h.toFixed(3), h0: h0 != null ? +h0.toFixed(3) : null, refs: refs.map((r) => +r.toFixed(3)),
          ok: h0 != null && Math.abs(h - h0) <= TOL_H && refs.length >= 1 && refs.every((r) => Math.abs(r - h) <= TOL_H) });
      }
    }
    R.check('(2c)', 'NPC 仲間の札の高さが ?classline=0 の同じ仲間と一致・同じ腕の主人公 / 敵の札と同じ (±' + TOL_H + 'px) = 罠 A',
      v2c.length >= 2 && v2c.every((x) => x.ok), v2c);
    const v2d = npcA.map((a) => ({ name: a.npcName, ...onTop(a) }));
    R.check('(2d)', 'NPC 仲間の段の下端 ≤ 札の上端 + 枠の実測 + ' + TOL_EDGE + 'px・段の上端 < 札の上端・横の中心 ±' + TOL_CX + 'px',
      v2d.length >= 2 && v2d.every((x) => x.ok), v2d);
    const h0N = stepsOf(DN0)[0] && stepsOf(DN0)[0].box ? stepsOf(DN0)[0].box.h : null;
    const v2e = [];
    for (const a of dSoft) for (const s of stepsOf(a)) if (isNpcHead(a, s)) {
      const top = onTop(s);
      v2e.push({ arm: a.label, tag: s.tag, text: s.text, cls: s.clsText, expect: s.expect, nCls: s.nCls, h: s.box ? +s.box.h.toFixed(3) : null, h0: h0N, edge: top,
        ok: s.ok !== false && s.heroIsHead === false && s.nCls === 1 && !!s.expect && s.clsText === s.expect && top.ok
          && h0N != null && !!s.box && Math.abs(s.box.h - h0N) <= TOL_H });
    }
    R.check('(2e)', '[K1] 頭が NPC の段階 (起動時・委譲) で #warriorLabel の段がちょうど 1 枚・"(" + CLASS_DEFS[頭].name + ")"・札の上に乗る・高さが ?classline=0 の頭と一致',
      v2e.length >= 4 && v2e.every((x) => x.ok), v2e);
    const v2f = [];
    for (const a of dSoft) for (const s of stepsOf(a)) if (!isNpcHead(a, s))
      v2f.push({ arm: a.label, tag: s.tag, who: s.cand ? (s.cand.isHero ? 'hero' : s.cand.classKey) : 'boot-hero', text: s.text, nCls: s.nCls, ok: s.ok !== false && s.nCls === 0 });
    R.check('(2f)', '[K1/K12] 頭が主人公・名前の無い仲間 (ゴーレム兵 / 従者) の段階で #warriorLabel の段が 0 個',
      v2f.length >= 4 && v2f.some((x) => x.who === 'servant') && v2f.some((x) => x.who === 'boot-hero') && v2f.every((x) => x.ok), v2f);

    /* ── §3 ── */
    const v3a = [];
    for (const [vn, , a0] of TAV) {
      for (const s of seatsOf(a0)) v3a.push({ vp: vn, k: s.k, text: s.text, want: s.emoji + ' ' + s.name, nCls: s.nCls, ok: !!s.name && s.text === s.emoji + ' ' + s.name && s.nCls === 0 });
      const op = a0 && a0.offPromise;
      if (!op || op.err) v3a.push({ vp: vn, ok: false, err: op ? op.err : 'なし' });
      else for (const d of op.during) v3a.push({ vp: vn, k: d.k, at: '約束中', text: d.text, want: '🤝 ' + d.emoji + ' ' + d.name, ok: d.text === '🤝 ' + d.emoji + ' ' + d.name && d.nCls === 0 });
    }
    R.check('(3a)', 'tavern.html?classline=0 → 4 席が PM_CLASS_EMOJI + " " + 名前 に完全一致・段 0・約束中は "🤝 " + それ',
      v3a.length === 16 && v3a.every((x) => x.ok), v3a.filter((x) => !x.ok).concat(v3a.filter((x) => x.ok).slice(0, 2)));
    const v3b = [DN0, DH0].map((a) => ({ arm: a.label, steps: stepsOf(a).length, docCls: stepsOf(a).map((s) => s.docCls),
      allyCls: a.obs ? a.obs.allies.map((x) => x.nCls) : null, err: a.err || (a.obs && a.obs.err) || null }));
    R.check('(3b)', 'index.html?classline=0 → 起動時と委譲の全段階で文書中の .labelClass が 0 個 (2 編成)',
      v3b.every((x) => !x.err && x.steps >= 3 && x.docCls.every((n) => n === 0) && x.allyCls && x.allyCls.length >= 4 && x.allyCls.every((n) => n === 0)), v3b);
  } catch (e) {
    console.log('  ⛔ 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_class_line_');
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
          const predDiff = J(NEG_PREDICTED[key]) !== J(want) ? ' (依頼書 §8 の予想 ' + NEG_PREDICTED[key].join(',') + ' を実走で訂正)' : '';
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + (maybe.length ? ' (確率で赤 ' + maybe.join(',') + ')' : '') + predDiff
            + ' / 実際に赤くなった=' + (red.join(',') || '(なし)') + ' → ' + (ok ? '✓ OK' : '✗ '
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, maybe, red, ok });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (必ず赤 ⊆ 赤 ⊆ 必ず赤 ∪ 確率で赤)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(10) + ' 担当 ' + r.want.join(',') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '')
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
