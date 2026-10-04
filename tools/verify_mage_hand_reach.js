#!/usr/bin/env node
/*
 * verify_mage_hand_reach.js — 実装依頼書 #84「メイジハンドが実機で一度も出ない」の受入ドライバ
 *   (依頼書 2026-10-03_mage-hand-reach.md §5)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_mage_hand_reach.js                         # 素
 *   node tools/verify_mage_hand_reach.js --negative              # 変異 6 本 (port 10549〜10554)。先に素の基準を走らせる
 *   node tools/verify_mage_hand_reach.js --negative --only range6,calm13
 *   node tools/verify_mage_hand_reach.js --mutate autoskip       # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §5)
 *   ① 表示は酒場 (tavern.html) の引き出しを実際に描いて DOM で見る (pmRenderDrawer。習得は localStorage
 *      "dragonfighters.knownSpells" を読み込み前に焼く = 実プレイで巻物を読んだ後と同じ経路)。
 *   ② 射程は本番の口 (tryMageHandCalm / tryMageHandInCombat) を、魔法使いと檻の距離を変えた仕込みで呼ぶ。
 *      戦闘前の口は gameStarted を**同じ同期区間の中だけ**立てて呼ぶ (ゲームループを 1 tick も回さない = 仲間が動かない)。
 *      戦闘中の口は encounterActive を同じく同期区間だけ立てる。
 *   ③ 待ちは window.__autoplay を切ったページで showCharChoice を開かせ、5.5 秒後も開いたままかを見る。
 *   ④ 普通のプレイでの到達 (§5 §4 の 5/5) は測定台 tools/probe_magehand_reach.js で報告する (ここでは assert しない)。
 *   - showCharChoice は**記録だけ**する包みで包む (⛔ 引数を変えない = verify_mage_hand の __ccAutoClose のような
 *     閉じる装置を持たない。待つかどうかそのものを測るため)。押下は #choiceDialog のボタンを実際にクリックする。
 *   - ⚠ #choiceDialog は最初のダイアログが出るまで DOM に無い (依頼書 §10-1 K11) ⇒ null は「開いていない」として扱い、
 *     「開いたまま」の判定の前に必ず「開いた」ことを assert する (null で緑にしない)。
 *   - ⚠ 射程の境界は**出ない側を先に**測る (出た側で _handAsked[gate] が立つと、後の呼び出しは射程と無関係に素通り =
 *     永久緑・依頼書 §10-1 項目2 の申し送り)。出た側の鍵は測った後に消す (装置)。
 *   - ⚠ (3a)(3b)(3c) は射程と無関係にしたいので檻から 3〜5 マスで測る (range6 / calm13 の変異が (3x) へ漏れない)。
 *
 * ■ 測っているもの (依頼書 §5 の番号)
 *   §0 (0a) [装置] 噂を成功に固定 (sessionStorage dragonfighters.questFlags = {s2_beast_intel:true} = 酒場で判定に
 *           成功した後と同じ状態) した森 n7 で、獣つきの檻がちょうど 1 つ・(55,8)・獣が同じタイル /
 *           対照: 噂に失敗 ({s2_beast_intel:false}) なら獣つきの檻は 0 (原因 B が本当にゲートであること)
 *      (0b) [装置] 魔法使いの仲間が 1 人居て isSpellKnown("mage","mage-hand") が真・mageHandCaster() がその仲間・
 *           主人公は魔法使いでない (術者の位置 = 仕込んだ仲間の位置)・MAGE_HAND の射程の読み口が在る
 *      (0c) [装置] 全ページが起動し pageerror 0 件
 *   §1 (1a) 覚えている魔法使いのカードの引き出し: #pmDrawerSkillList に #pmDrawerMageHand.pmDrawerInnateRow がちょうど 1 つ・
 *           「メイジハンド」を含む・技 / 呪文の class を持たない・押しても selection.partySkills・見出し (スキル n/m)・
 *           呪文枠の ± 欄の表示が変わらない
 *      (1b) 覚えていない魔法使いのカード → 行が無い / 覚えている魔法使い以外のカード (僧侶・エルフ・戦士) → 行が無い
 *      (1c) 呪文枠の ± 欄 (.spellCountItem) と技の一覧 (.skillItem) の件数と並びが、覚える前と後で同じ
 *           (魔法使い・僧侶・エルフ。⭐ 罠 1 = MAGE_SKILLS_UI へ足すと必ず漏れる の検出)
 *   §2 (2a) 戦闘中の口: 檻から 12 マス超・13 マス以内 (12 < d <= 13) + 視線ありでは聞かれない (鍵も立たない) / 10.5〜11.5 マス + 視線ありでは聞かれる
 *      (2b) 戦闘前の口: 同じ 12 < d <= 13 の床で聞かれない / 11 マスで聞かれる (射程は 12 のまま)
 *   §3 (3a) __autoplay を切ったページで檻のダイアログを出し、5.5 秒待っても開いたまま (#choiceDialog.show・
 *           口が返っていない・mageHandBusy・cage.dialogActive・showCharChoice に autoSkipMs が渡っていない)
 *      (3b) 「触らない」を押すと閉じる (口が返る・檻は閉じたまま) → 同じ口からは二度と聞かない (罠 2 = 仕様のまま)
 *      (3c) オートプレイ (window.__autoplay = 1) のページでは 1 番目を即座に選ぶ (showCharChoice が 50ms 以内に 0 で返る・
 *           #choiceDialog は一度も開かない・檻が開く・口が true)
 *   ⛔ 測らないこと: 普通のプレイでの到達率 (測定台で報告) / 手の飛ぶ速さ / 文面の細部 (「メイジハンド」「レバー」だけ固定)
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html と tavern.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列を
 *     メモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *   - 起動時に全変異のアンカーを**原本**で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *   - ⭐ 罠E の自己検査: 自分の変異アンカー (前後の空白を落とした形) が tools/*.js の他のどのドライバのソースにも
 *     出てこないこと (出たら exit 3)。⇒ handinpool は verify_mage_hand の「const MAGE_SKILLS_UI = [」を使わず、
 *     表の 1 行目 (magic-missile) の行に注入する。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持ち、**欠陥が効く枝でだけ**鳴る (射程はゲッターで読まれた時)。
 *   - ⛔ git を読まない ⇒ 影のツリーでもそのまま走る。⛔ timeout コマンドで包まない。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0` (verify_mage_hand と同じ型)。
 *
 * ■ ポート = **10548** (素) / 変異 **10549〜10554** (6 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-10-04 この機械の実測・HEAD c7e60d1) = 素 約 14 秒 (11 assert・index 3 枚 + tavern 2 枚) / --negative 約 96 秒。
 * ■ 担当表は実走で確定し依頼書 §5 の予測と全部一致 (依頼書 §10-2)。⚠ K12: 「13 マス」を d = 13.04 で測ると calm13 が空振り
 *   ⇒ 12 < d <= 13 の床 (実測 (58,20) 12.37) で測る。
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
const PORT = parseInt(arg('port', '10548'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const HAND_ICON = '\u270B';          // ✋
const NO_LABEL = '触らない';
const WAIT_OPEN_MS = 5500;          // (3a) 「5 秒待っても開いたまま」
const ASK_PEEK_MS = 400;            // 呼んでから「聞かれたか」を覗くまで (本番の自動スキップ 2000ms より十分短い)

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html';
const F_TAVERN = 'tavern.html';
const PRISTINE = {
  [F_INDEX]: fs.readFileSync(path.join(ROOT, F_INDEX), 'utf8'),
  [F_TAVERN]: fs.readFileSync(path.join(ROOT, F_TAVERN), 'utf8'),
};
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §5 の負のコントロール 6 本)。逐語は HEAD c7e60d1 (項目2 の実装後) の行で取った。
 * 各変異は console.log("__MUTHIT__<key>") を**欠陥が効く枝**に持つ。原本でちょうど 1 件・全部置き換える。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const A_RANGE = 'calmRangeTiles: 12, combatRangeTiles: 12 };';
const A_ASK = 'const pick = await showCharChoice(T.ask(t), [{ label: T.label(t) }], "触らない (Esc)");';
const MUTATIONS = {
  /* ⭐ 罠 1: 表示のために酒場の MAGE_SKILLS_UI へ mpCost つきの行を足す (印は表の評価時)。
   *   ⚠ 罠E: verify_mage_hand の handinpool (「const MAGE_SKILLS_UI = [」) と別の行 = 表の 1 行目へ前置する */
  handinpool: [
    { file: F_TAVERN, from: '{ id: "magic-missile",  name: "マジックミサイル", category: "攻撃", range: "spellSingle", mpCost: 3, flavor: "必中の魔力矢 3d4+1" },',
      to: '{ id: "mage-hand", name: "メイジハンド", category: "補助", range: "spellSingle", mpCost: (' + HIT('handinpool') + ', 1), flavor: "幽霊の手" }, { id: "magic-missile",  name: "マジックミサイル", category: "攻撃", range: "spellSingle", mpCost: 3, flavor: "必中の魔力矢 3d4+1" },   /* ★変異handinpool */' }],
  /* 自動スキップを戻す (#80 の 2 秒。印は手のダイアログを出したとき) */
  autoskip: [
    { file: F_INDEX, from: A_ASK,
      to: 'const pick = await showCharChoice(T.ask(t), [{ label: T.label(t) }], "触らない (Esc)", (' + HIT('autoskip') + ', { autoSkipMs: (window.SkillCheck && SkillCheck.AUTO_ROLL_MS) || 2000 }));   /* ★変異autoskip */' }],
  /* 戦闘中の射程を 6 へ戻す (印は戦闘中の射程が読まれたとき) */
  range6: [
    { file: F_INDEX, from: A_RANGE,
      to: 'calmRangeTiles: 12, get combatRangeTiles() { ' + HIT('range6') + '; return 6; } };   /* ★変異range6 */' }],
  /* 戦闘前の射程まで伸ばす (印は戦闘前の射程が読まれたとき) */
  calm13: [
    { file: F_INDEX, from: A_RANGE,
      to: 'get calmRangeTiles() { ' + HIT('calm13') + '; return 13; }, combatRangeTiles: 12 };   /* ★変異calm13 */' }],
  /* 断った後も同じ口から聞く (印は鍵が立っているのに素通りしたとき) */
  asklater: [
    { file: F_INDEX, from: 'if (t._handAsked[gate]) continue;',
      to: 'if (t._handAsked[gate] && (' + HIT('asklater') + ', false)) continue;   /* ★変異asklater */' }],
  /* 覚えていなくても魔法使いのカードに行を出す (印は覚えていないのに通したとき) */
  showall: [
    { file: F_TAVERN, from: 'if (classKey === "mage" && isSpellKnownTV("mage", "mage-hand")) {',
      to: 'if (classKey === "mage" && (isSpellKnownTV("mage", "mage-hand") || (' + HIT('showall') + ', true))) {   /* ★変異showall */' }],
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決める。
 * ⭐ --negative は「赤の集合 = 担当」の完全一致を要求する。依頼書 §5 との差は依頼書 §10-2 に書く。 */
const NEG_EXPECT = {
  handinpool: ['(1c)'],
  autoskip:   ['(3a)'],
  range6:     ['(2a)'],
  calm13:     ['(2b)'],
  asklater:   ['(3b)'],
  showall:    ['(1b)'],
};
/* 依頼書 §5 の予想 (⭐ 実測の赤に含まれていることは崩さない = 起動時に検算) */
const NEG_PREDICTED = {
  handinpool: ['(1c)'], autoskip: ['(3a)'], range6: ['(2a)'], calm13: ['(2b)'], asklater: ['(3b)'], showall: ['(1b)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 6) vetFail('変異は 6 本まで (ポート 10549〜10554)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_PREDICTED[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) vetFail('NEG_EXPECT / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  const miss = NEG_PREDICTED[k].filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  if (miss.length) vetFail('担当 ' + k + ' が依頼書 §5 の予想 ' + J(NEG_PREDICTED[k]) + ' を含まない');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
/* ⭐ 罠E の自己検査: tools/*.js の自分以外の全ドライバのソースに、自分のアンカー (前後の空白を落とした形) が出てこないこと */
const SELF = path.basename(__filename);
const PEER_FILES = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== SELF);
if (PEER_FILES.indexOf('verify_mage_hand.js') < 0) vetFail('罠E の自己検査: tools/verify_mage_hand.js が見つからない (走査先が違う)');
const PEER_SRC = PEER_FILES.map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
  const core = e.from.trim();
  const clash = PEER_SRC.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
  if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(','));
}
const _mutCache = {};
/* ⭐ 注入点の検算は**手つかずの原本**に対して数える */
function servedFile(file, key) {
  if (!key) return PRISTINE[file];
  const ck = key + '|' + file;
  if (_mutCache[ck] !== undefined) return _mutCache[ck];
  let s = PRISTINE[file];
  for (const e of MUTATIONS[key]) {
    if (e.file !== file) continue;
    const c = countOf(PRISTINE[file], e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE[file], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    s = s.split(e.from).join(e.to);
  }
  if (s.split('\n').length !== PRISTINE[file].split('\n').length) vetFail('変異 ' + key + ' が ' + file + ' の行数を変えた');
  _mutCache[ck] = s;
  return s;
}
if (countOf(PRISTINE[F_INDEX], '__MUTHIT__') + countOf(PRISTINE[F_TAVERN], '__MUTHIT__') !== 0) vetFail('原本に __MUTHIT__ が在る');
for (const k of MUT_ORDER) {
  if (!MUTATIONS[k].some((e) => e.to.indexOf('__MUTHIT__' + k) >= 0)) vetFail('変異 ' + k + ' に実行の印が無い');
  let changed = false;
  for (const f of [F_INDEX, F_TAVERN]) if (servedFile(f, k) !== PRISTINE[f]) changed = true;
  if (!changed) vetFail('変異 ' + k + ' が何も変えていない');
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で 1 箇所・tools/*.js の他 ' + PEER_FILES.length + ' 本とアンカーの重なり 0');

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
  const idx = servedFile(F_INDEX, mutKey), tav = servedFile(F_TAVERN, mutKey);
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === F_INDEX) { res.setHeader('Content-Type', MIME['.html']); res.end(Buffer.from(idx, 'utf8')); return; }
        if (rel === F_TAVERN) { res.setHeader('Content-Type', MIME['.html']); res.end(Buffer.from(tav, 'utf8')); return; }
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(2a)', '(2b)', '(3a)', '(3b)', '(3c)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 400 : 1200));
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
 * ページ内の道具 (index.html の読み込み後に 1 回入れる)。⚠ showCharChoice は**記録だけ** (引数を変えない)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const INSTALL = (HAND) => {
  window.__cc = []; window.__logs = [];
  const oLog = appendLog;
  appendLog = function (msg) { const s = String(msg); if (s.indexOf(HAND) === 0) window.__logs.push(s); return oLog.apply(this, arguments); };
  const oCC = showCharChoice;
  showCharChoice = function (msg, cands, cancel, opts) {
    const rec = { msg: String(msg), labels: (cands || []).map((c) => c.label), cancel, opts: opts ? JSON.parse(JSON.stringify(opts)) : null,
      argc: arguments.length, t0: performance.now(), t1: null, val: 'pending' };
    window.__cc.push(rec);
    const pr = oCC.apply(this, arguments);
    Promise.resolve(pr).then((v) => { rec.t1 = performance.now(); rec.val = v; });
    return pr;
  };
  window.__dlgShown = () => { const d = document.getElementById('choiceDialog'); return { exists: !!d, show: !!(d && d.classList.contains('show')) }; };
  window.__putAlly = (a, tx, ty) => { const s = (a.def && a.def.displaySize) || TILE_SIZE; a.x = tx * TILE_SIZE + TILE_SIZE / 2 - s / 2; a.y = ty * TILE_SIZE + TILE_SIZE / 2 - s / 2; };
  /* 生きている魔法使いの仲間 (居なければ先頭の仲間を魔法使いにする = 装置。(0b) で natural を報告) */
  window.__mageAlly = () => {
    let a = allies.find((x) => x && x.alive && x.classKey === 'mage');
    if (!a) { a = allies.find((x) => x && x.alive); a.classKey = 'mage'; a.__madeMage = true; if (!a.spellSlots || !Object.keys(a.spellSlots).length) a.spellSlots = { 'magic-missile': 2, sleep: 1 }; }
    return a;
  };
  window.__beastCage = () => cages.find((c) => c.beastIdx >= 0) || null;
  /* (cx,cy) からの距離 [lo, hi] で、視線が通る (los=true) / 通らない (false) / 問わない (null) 床を近い順に */
  window.__tilesAround = (cx, cy, lo, hi, los) => {
    const out = [];
    const W = (typeof MAP_COLS !== 'undefined') ? MAP_COLS : 80, H = (typeof MAP_ROWS !== 'undefined') ? MAP_ROWS : 40;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (isTileWall(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < lo || d > hi) continue;
      if (los !== null && hasLineOfSight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, cx * TILE_SIZE + TILE_SIZE / 2, cy * TILE_SIZE + TILE_SIZE / 2) !== los) continue;
      out.push([x, y, Math.round(d * 100) / 100]);
    }
    out.sort((p, q) => p[2] - q[2] || p[0] - q[0] || p[1] - q[1]);
    return out;
  };
  /* 本番の口を 1 回呼ぶ (待たない)。gate = 'calm' (tryMageHandCalm) / 'combat' (tryMageHandInCombat)。
   *   戦闘前の口は gameStarted を、戦闘中の口は encounterActive を、**同じ同期区間の中だけ**立てる
   *   (口の同期部分 = 射程・視線・鍵の判定は最初の await より前 ⇒ ゲームループは 1 tick も回らない)。
   *   術者の位置 (仲間の中心 → 檻の中心) の距離と視線も同じ瞬間に記録する。 */
  window.__fire = (gate, tile) => {
    const a = __mageAlly(); const c = __beastCage();
    __putAlly(a, tile[0], tile[1]);
    const cs = mageHandCaster();
    const out = { gate, tile, n0: window.__cc.length, caster: cs ? { ally: cs.actor === a, d: Math.round(Math.hypot(cs.cx - (c.tx * TILE_SIZE + TILE_SIZE / 2), cs.cy - (c.ty * TILE_SIZE + TILE_SIZE / 2)) / TILE_SIZE * 100) / 100,
      los: hasLineOfSight(cs.cx, cs.cy, c.tx * TILE_SIZE + TILE_SIZE / 2, c.ty * TILE_SIZE + TILE_SIZE / 2) } : null };
    window.__ret = undefined; window.__retDone = false;
    let pr;
    if (gate === 'calm') {
      const g0 = gameStarted, e0 = encounterActive, r0 = encounterRunning;
      encounterActive = false; encounterRunning = false; gameStarted = true;
      try { pr = tryMageHandCalm(); } finally { gameStarted = g0; encounterActive = e0; encounterRunning = r0; }
    } else {
      const e0 = encounterActive;
      encounterActive = true;
      try { pr = tryMageHandInCombat(); } finally { encounterActive = e0; }
    }
    Promise.resolve(pr).then((r) => { window.__ret = r; window.__retDone = true; });
    return out;
  };
  window.__peek = (n0) => {
    const c = __beastCage();
    return { cc: window.__cc.length - n0, ccRec: window.__cc.slice(n0).map((r) => ({ msg: r.msg.slice(0, 40), labels: r.labels, cancel: r.cancel, opts: r.opts, argc: r.argc, val: r.val })),
      dlg: __dlgShown(), done: window.__retDone, ret: window.__ret, busy: mageHandBusy, cageFlag: c ? c.dialogActive : null,
      keys: Object.keys((c && c._handAsked) || {}).filter((k) => c._handAsked[k]), opened: c ? c.opened : null };
  };
  /* 開いているダイアログの「触らない」を押す (開いていなければ何もしない) */
  window.__clickNo = (label) => {
    const d = document.getElementById('choiceDialog');
    if (!d || !d.classList.contains('show')) return false;
    const b = Array.from(d.querySelectorAll('button')).find((x) => x.textContent.indexOf(label) >= 0);
    if (!b) return false;
    b.click(); return true;
  };
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { port, booted: 0, errs: [], hits: {} };
  const base = 'http://127.0.0.1:' + port + '/';
  const pages = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const newPage = async () => {
    const p = await browser.newPage();
    pages.push(p);
    p.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
    p.on('console', (m) => {
      let t = ''; try { t = m.text(); } catch (e) { return; }
      if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
    });
    return p;
  };
  const closePage = async (p) => { await sleep(150); await p.close().catch(() => {}); };
  /* 森を開く。intel = 噂の成否 (sessionStorage dragonfighters.questFlags = 酒場の判定の後と同じ) / known = 手の習得を焼く */
  async function openForest(intel, known) {
    const p = await newPage();
    await p.evaluateOnNewDocument((iv, k) => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', 'bandits-forest');
        sessionStorage.setItem('dragonfighters.questFlags', JSON.stringify({ s2_beast_intel: iv }));
        localStorage.clear();
        if (k) localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ mage: ['mage-hand'] }));
      } catch (e) {}
    }, !!intel, !!known);
    await p.goto(base + F_INDEX + '?diag=1', { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => { try { return typeof allies !== 'undefined' && allies.length > 0 && typeof RUN !== 'undefined' && !!RUN && !!currentNodeId && !!window.__graphRun; } catch (e) { return false; } }, { timeout: 60000 });
    await p.evaluate(INSTALL, HAND_ICON);
    ctx.booted++;
    return p;
  }
  /* 酒場を開く。known = 手の習得を焼く (読み込み前) */
  async function openTavern(known) {
    const p = await newPage();
    await p.evaluateOnNewDocument((k) => {
      try {
        if (!sessionStorage.getItem('__mhrCleared')) { localStorage.clear(); sessionStorage.setItem('__mhrCleared', '1'); }
        if (k) localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ mage: ['mage-hand'] }));
      } catch (e) {}
    }, !!known);
    await p.goto(base + F_TAVERN, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => !!window.__equipTV, { timeout: 30000 });
    ctx.booted++;
    return p;
  }
  /* 口を呼んで ASK_PEEK_MS 後に覗く → 開いていれば「触らない」を押して口が返るのを待つ */
  async function askAndDecline(p, gate, tile) {
    const f = await p.evaluate((g, t) => __fire(g, t), gate, tile);
    await sleep(ASK_PEEK_MS);
    const pk = await p.evaluate((n0) => __peek(n0), f.n0);
    let clicked = false;
    if (pk.dlg.show) clicked = await p.evaluate((l) => __clickNo(l), NO_LABEL);
    await p.waitForFunction(() => window.__retDone === true, { timeout: 15000, polling: 50 }).catch(() => {});
    const after = await p.evaluate((n0) => __peek(n0), f.n0);
    return { fire: f, peek: pk, clicked, after };
  }
  /* 引き出しの技 / 呪文の行の件数と並び + 表示の 1 行 */
  const DRAWER = (ck) => {
    pmOrdered = [{ classKey: ck, isHero: true, name: '', zone: 'rear', variant: 0 }];
    pmRenderDrawer(0);
    const list = document.getElementById('pmDrawerSkillList');
    if (!list) return { list: false };
    const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const skills = Array.from(list.querySelectorAll('.skillItem')).map(txt);
    const spells = Array.from(list.querySelectorAll('.spellCountItem')).map(txt);
    const innate = Array.from(list.querySelectorAll('.pmDrawerInnateRow'));
    const head = document.getElementById('pmDrawerSkillHead');
    return { list: true, skills, spells, innate: innate.length, innateHand: innate.filter((e) => e.textContent.indexOf('メイジハンド') >= 0).length,
      innateId: innate.map((e) => e.id), innateSkillCls: innate.filter((e) => e.classList.contains('skillItem') || e.classList.contains('spellCountItem')).length,
      head: head ? head.textContent : null, known: isSpellKnownTV('mage', 'mage-hand') };
  };

  let p = null;
  try {
    /* ══════════ P0. 噂に失敗した森 (対照): (0a) の後半 ══════════ */
    p = await openForest(false, true);
    const A0 = await p.evaluate(() => ({ node: currentNodeId, cages: cages.length, linked: cages.filter((c) => c.beastIdx >= 0).length, flagOn: questFlagOn('s2_beast_intel') }));
    await closePage(p);

    /* ══════════ P1. 噂に成功した森 n7 (覚えている・__autoplay を切る): (0a)(0b) → (2b) → (2a) → (3b) → (3a) ══════════ */
    p = await openForest(true, true);
    const A = await p.evaluate(() => {
      window.__autoplay = 0;
      const nat = allies.filter((x) => x && x.alive && x.classKey === 'mage').length;
      const a = __mageAlly();
      const c = __beastCage();
      const cs = mageHandCaster();
      const b = c ? enemies[c.beastIdx] : null;
      const bd = b ? ((b.def && b.def.displaySize) || TILE_SIZE) : 0;
      return { node: currentNodeId, cages: cages.length, linked: cages.filter((x) => x.beastIdx >= 0).length, flagOn: questFlagOn('s2_beast_intel'),
        cage: c ? { tx: c.tx, ty: c.ty, opened: c.opened } : null,
        beast: b ? [Math.floor((b.x + bd / 2) / TILE_SIZE), Math.floor((b.y + bd / 2) / TILE_SIZE)] : null,
        naturalMages: nat, madeMage: !!a.__madeMage, leader: leaderClassKey, known: isSpellKnown('mage', 'mage-hand'),
        casterIsAlly: !!cs && cs.actor === a,
        /* ⚠ 射程の値はここで読まない (range6 / calm13 のゲッターを鳴らさない) = 鍵が在ることだけ */
        range: (typeof MAGE_HAND === 'object') ? ['calmRangeTiles', 'combatRangeTiles'].map((k) => k in MAGE_HAND) : null,
        autoplay: window.__autoplay, gs: gameStarted, enc: encounterActive, dp: dialogPaused, sk: skillCheckActive };
    });
    R.check('(0a)', '[装置] 噂に成功 (questFlags.s2_beast_intel = true) の森 n7: 獣つきの檻がちょうど 1 つ・(55,8)・獣が同じタイル / 対照: 噂に失敗 ⇒ 獣つきの檻 0',
      A.node === 'n7' && A.flagOn === true && A.linked === 1 && !!A.cage && A.cage.tx === 55 && A.cage.ty === 8 && A.cage.opened === false
      && !!A.beast && A.beast[0] === 55 && A.beast[1] === 8 && A0.flagOn === false && A0.linked === 0,
      { success: { node: A.node, flagOn: A.flagOn, cages: A.cages, linked: A.linked, cage: A.cage, beast: A.beast }, failure: A0 });
    R.check('(0b)', '[装置] 魔法使いの仲間が居て isSpellKnown("mage","mage-hand") が真・mageHandCaster() がその仲間・主人公は魔法使いでない・__autoplay = 0・静止',
      A.known === true && A.casterIsAlly === true && A.leader !== 'mage' && A.autoplay === 0 && A.gs === false && A.dp === false && A.sk === false
      && !!A.range && A.range.every((t) => t === true),
      { naturalMages: A.naturalMages, madeMage: A.madeMage, leader: A.leader, known: A.known, casterIsAlly: A.casterIsAlly, range: A.range, gs: A.gs, enc: A.enc, dp: A.dp, sk: A.sk });

    /* 仕込みの床 (檻の中心からタイル距離・視線あり)。⭐ 自分で距離と視線を assert する (装置 = geo) */
    const TL = await p.evaluate(() => {
      const c = __beastCage(); if (!c) return null;
      const pick = (lo, hi, mid) => { const l = __tilesAround(c.tx, c.ty, lo, hi, true); l.sort((p, q) => Math.abs(p[2] - mid) - Math.abs(q[2] - mid) || p[0] - q[0] || p[1] - q[1]); return l[0] || null; };
      /* ⚠ 「13 マス」は 12 < d ≤ 13 の床で取る (d = 13.04 だと射程 13 へ伸ばす変異 calm13 も聞かない = 空振り・依頼書 §10-2 K12) */
      return { t13: pick(12.01, 13.0, 13), t11: pick(10.5, 11.5, 11), near: pick(3, 5, 4) };
    });
    const tilesOk = !!TL && !!TL.t13 && !!TL.t11 && !!TL.near;
    console.log('[vet] 仕込みの床 (檻から): ' + J(TL));

    /* (2b) 戦闘前の口: 13 マス (出ない側を先に) → 11 マス */
    let B13 = null, B11 = null;
    if (tilesOk) {
      B13 = await askAndDecline(p, 'calm', TL.t13);
      B11 = await askAndDecline(p, 'calm', TL.t11);
      await p.evaluate(() => { const c = __beastCage(); if (c && c._handAsked) delete c._handAsked.calm; });   // (3b) の前の後始末
    }
    const geo = (x, lo, hi) => !!x && !!x.fire.caster && x.fire.caster.ally === true && x.fire.caster.los === true && x.fire.caster.d >= lo && x.fire.caster.d <= hi;
    const shortView = (x) => x && { tile: x.fire.tile, caster: x.fire.caster, cc: x.peek.cc, dlg: x.peek.dlg, keys: x.peek.keys, done: x.after.done, opened: x.after.opened, clicked: x.clicked };
    R.check('(2b)', '戦闘前の口 (tryMageHandCalm・射程 12 のまま): 12 マス超・13 マス以内 + 視線ありでは聞かれない (鍵も立たない) / 11 マス + 視線ありでは聞かれる',
      tilesOk && geo(B13, 12.01, 13.0) && B13.peek.cc === 0 && B13.peek.dlg.show === false && B13.peek.keys.length === 0 && B13.after.done === true
      && geo(B11, 10.5, 11.5) && B11.peek.cc === 1 && B11.peek.dlg.show === true && B11.peek.keys.join() === 'calm' && B11.clicked === true && B11.after.done === true && B11.after.opened === false,
      { t13: shortView(B13), t11: shortView(B11) });

    /* (2a) 戦闘中の口: 13 マス (出ない側を先に) → 11 マス */
    let C13 = null, C11 = null;
    if (tilesOk) {
      C13 = await askAndDecline(p, 'combat', TL.t13);
      C11 = await askAndDecline(p, 'combat', TL.t11);
      await p.evaluate(() => { const c = __beastCage(); if (c && c._handAsked) delete c._handAsked.combat; });   // (3a) の前の後始末
    }
    R.check('(2a)', '戦闘中の口 (tryMageHandInCombat): 12 マス超・13 マス以内 + 視線ありでは聞かれない (鍵も立たない) / 11 マス + 視線ありでは聞かれる',
      tilesOk && geo(C13, 12.01, 13.0) && C13.peek.cc === 0 && C13.peek.dlg.show === false && C13.peek.keys.length === 0 && C13.after.done === true && C13.after.ret === false
      && geo(C11, 10.5, 11.5) && C11.peek.cc === 1 && C11.peek.dlg.show === true && C11.peek.keys.join() === 'combat' && C11.clicked === true && C11.after.done === true
      && C11.after.ret === false && C11.after.opened === false,
      { t13: shortView(C13), t11: shortView(C11) });

    /* (3b) 戦闘前の口・3〜5 マス: 聞かれる → 「触らない」を押す → 閉じる → 同じ口からは二度と聞かない */
    let D1 = null, D2 = null;
    if (tilesOk) {
      D1 = await askAndDecline(p, 'calm', TL.near);
      await sleep(300);
      D2 = await askAndDecline(p, 'calm', TL.near);   // 二度目 (asklater なら聞かれる ⇒ 閉じて戻る)
    }
    R.check('(3b)', '「触らない」を押すと閉じる (口が返る・檻は閉じたまま・鍵 calm) → 同じ口からは二度と聞かない (罠 2 = 仕様のまま)',
      tilesOk && geo(D1, 3, 5) && D1.peek.cc === 1 && D1.peek.dlg.show === true && D1.clicked === true && D1.after.done === true && D1.after.dlg.show === false
      && D1.after.opened === false && D1.after.keys.indexOf('calm') >= 0 && D1.after.busy === false
      && !!D2 && D2.peek.cc === 0 && D2.peek.dlg.show === false && D2.after.done === true && D2.after.opened === false,
      { first: shortView(D1), firstAfter: D1 && { dlg: D1.after.dlg, busy: D1.after.busy, keys: D1.after.keys }, again: shortView(D2) });

    /* (3a) 戦闘中の口・3〜5 マス: 開いて 5.5 秒待っても開いたまま。⚠ まず「開いた」を assert (K11: null を開いていないと扱う) */
    let E0 = null, E1 = null, E2 = null;
    if (tilesOk) {
      const f = await p.evaluate((t) => __fire('combat', t), TL.near);
      await sleep(ASK_PEEK_MS);
      E0 = await p.evaluate((n0) => __peek(n0), f.n0);
      await sleep(WAIT_OPEN_MS - ASK_PEEK_MS);
      E1 = await p.evaluate((n0) => __peek(n0), f.n0);
      E1.fire = f;
      /* 後始末: 開いていれば「触らない」で閉じる */
      await p.evaluate((l) => __clickNo(l), NO_LABEL);
      await p.waitForFunction(() => window.__retDone === true, { timeout: 15000, polling: 50 }).catch(() => {});
      E2 = await p.evaluate((n0) => __peek(n0), f.n0);
    }
    R.check('(3a)', '__autoplay = 0 で檻のダイアログ (戦闘中の口・3〜5 マス) を出し、' + (WAIT_OPEN_MS / 1000) + ' 秒待っても開いたまま (口が返らない・mageHandBusy・cage.dialogActive・autoSkipMs なし)',
      tilesOk && !!E0 && E0.cc === 1 && E0.dlg.exists === true && E0.dlg.show === true && E0.done === false
      && E1.cc === 1 && E1.dlg.show === true && E1.done === false && E1.busy === true && E1.cageFlag === true && E1.ccRec[0].val === 'pending'
      && /レバー/.test(E1.ccRec[0].msg) && !(E1.ccRec[0].opts && E1.ccRec[0].opts.autoSkipMs > 0) && !!E1.fire.caster && E1.fire.caster.d <= 5,
      { at0: E0 && { cc: E0.cc, dlg: E0.dlg, done: E0.done }, at5: E1 && { cc: E1.cc, dlg: E1.dlg, done: E1.done, busy: E1.busy, cageFlag: E1.cageFlag, rec: E1.ccRec, caster: E1.fire.caster },
        cleanup: E2 && { dlg: E2.dlg, done: E2.done, ret: E2.ret } });
    await closePage(p);

    /* ══════════ P2. 噂に成功した森 n7 (覚えている・window.__autoplay = 1): (3c) ══════════ */
    p = await openForest(true, true);
    let F0 = null, F1 = null;
    if (tilesOk) {
      F0 = await p.evaluate((t) => { window.__autoplay = 1; return __fire('combat', t); }, TL.near);
      await p.waitForFunction(() => window.__retDone === true, { timeout: 30000, polling: 50 }).catch(() => {});
      F1 = await p.evaluate((n0) => { const pk = __peek(n0); pk.rec = window.__cc.slice(n0).map((r) => ({ val: r.val, ms: r.t1 === null ? null : Math.round(r.t1 - r.t0) })); pk.logs = window.__logs.slice(); window.__autoplay = 0; return pk; }, F0.n0);
    }
    R.check('(3c)', 'オートプレイ (window.__autoplay = 1) では 1 番目を即座に選ぶ: showCharChoice が 50ms 以内に 0 で返る・#choiceDialog は一度も開かない・檻が開く・口が true・✋ 1 行',
      tilesOk && !!F1 && F1.cc === 1 && F1.rec[0].val === 0 && F1.rec[0].ms !== null && F1.rec[0].ms <= 50 && F1.dlg.show === false && F1.dlg.exists === false
      && F1.done === true && F1.ret === true && F1.opened === true && F1.logs.length === 1 && !!F0.caster && F0.caster.d <= 5,
      { fire: F0 && F0.caster, rec: F1 && F1.rec, dlg: F1 && F1.dlg, ret: F1 && F1.ret, opened: F1 && F1.opened, logs: F1 && F1.logs });
    await closePage(p);

    /* ══════════ P3/P4. 酒場の引き出し: 覚えていない → 覚えている ══════════ */
    p = await openTavern(false);
    const U0 = { mage: await p.evaluate(DRAWER, 'mage'), cleric: await p.evaluate(DRAWER, 'cleric'), elf: await p.evaluate(DRAWER, 'elf') };
    await closePage(p);
    p = await openTavern(true);
    const U1 = { mage: await p.evaluate(DRAWER, 'mage'), cleric: await p.evaluate(DRAWER, 'cleric'), elf: await p.evaluate(DRAWER, 'elf'), warrior: await p.evaluate(DRAWER, 'warrior') };
    const V = await p.evaluate(() => {
      pmOrdered = [{ classKey: 'mage', isHero: true, name: '', zone: 'rear', variant: 0 }];
      pmRenderDrawer(0);
      const list = document.getElementById('pmDrawerSkillList');
      const row = document.getElementById('pmDrawerMageHand');
      const snap = () => JSON.stringify({ sel: selection.partySkills || null, head: (document.getElementById('pmDrawerSkillHead') || {}).textContent || null,
        spells: Array.from(document.querySelectorAll('#pmDrawerSkillList .spellCountItem')).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()) });
      const s0 = snap();
      const inList = !!row && !!list && list.contains(row);
      const cls = row ? row.className : null;
      const onclick = row ? row.onclick : 'none';
      if (row) row.click();
      const s1 = snap();
      return { inList, cls, text: row ? row.textContent : null, onclickNull: onclick === null, same: s0 === s1, s0: JSON.parse(s0) };
    });
    R.check('(1a)', '覚えている魔法使いの引き出し: #pmDrawerSkillList に #pmDrawerMageHand.pmDrawerInnateRow が 1 つ・「メイジハンド」・技 / 呪文の class なし・押しても partySkills・見出し・± 欄が不変',
      U1.mage.known === true && U1.mage.innate === 1 && U1.mage.innateHand === 1 && J(U1.mage.innateId) === J(['pmDrawerMageHand']) && U1.mage.innateSkillCls === 0
      && V.inList === true && V.cls === 'pmDrawerInnateRow' && V.onclickNull === true && V.same === true,
      { drawer: U1.mage, click: V });
    R.check('(1b)', '覚えていない魔法使い → 行なし / 覚えている僧侶・エルフ・戦士 → 行なし (対照: 覚えている魔法使いは 1 行)',
      U0.mage.known === false && U0.mage.list === true && U0.mage.innate === 0 && U1.cleric.innate === 0 && U1.elf.innate === 0 && U1.warrior.list === true && U1.warrior.innate === 0 && U1.mage.innate === 1,
      { unknownMage: { known: U0.mage.known, innate: U0.mage.innate }, cleric: U1.cleric.innate, elf: U1.elf.innate, warrior: U1.warrior.innate, knownMage: U1.mage.innate });
    R.check('(1c)', '呪文枠の ± 欄 (.spellCountItem) と技の一覧 (.skillItem) の件数と並びが、覚える前と後で同じ (魔法使い・僧侶・エルフ)',
      ['mage', 'cleric', 'elf'].every((k) => U0[k].list && U1[k].list && J(U0[k].skills) === J(U1[k].skills) && J(U0[k].spells) === J(U1[k].spells) && U0[k].head === U1[k].head)
      && U0.mage.spells.length >= 1,
      ['mage', 'cleric', 'elf'].map((k) => ({ k, before: { skills: U0[k].skills.length, spells: U0[k].spells, head: U0[k].head }, after: { skills: U1[k].skills.length, spells: U1[k].spells, head: U1[k].head } })));
    await closePage(p);
    p = null;

    /* ══════════ (0c) 起動確認 ══════════ */
    {
      const want = 3 + 2;   // index 3 枚 (P0〜P2) + tavern 2 枚
      R.check('(0c)', '[装置] 全ページが起動し pageerror 0 件', ctx.booted === want && ctx.errs.length === 0, '起動 ' + ctx.booted + '/' + want + ' / pageerror ' + J(ctx.errs.slice(0, 3)));
    }
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await sleep(200);   // console イベントの取りこぼしを避ける
    for (const pg of pages) await pg.close().catch(() => {});
  }
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_mage_hand_reach_');
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
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(12) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 注入行 ' + r.hit + ' 回 / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
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
