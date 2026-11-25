#!/usr/bin/env node
/*
 * verify_companion_cast.js — 実装依頼書 #117「固定キャスト 12 人」(仲間を各職 2 人・計 12 人の決まった人物にし、
 *   歩いている間に独り言を話す) の受入ドライバ (依頼書 2026-11-21_companion-cast.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_companion_cast.js                         # 素 (port 10871)
 *   node tools/verify_companion_cast.js --negative              # 素の基準 + 変異 10 本 (port 10872〜10881)
 *   node tools/verify_companion_cast.js --negative --only nocopy,idleprio2
 *   node tools/verify_companion_cast.js --mutate castbyname     # 変異 1 本を載せて手回し (担当外の赤を実走で調べる用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り (担当の節が赤くならない)
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *        または母集団の崩れ ((0a)〜(0c) が素で赤 = キャストが 12 人いない / 表の外の名前が 1 つでない / 12 人が出ない)
 *
 * ■ 方針 (依頼書 §8)
 *   - キャストの中身は**ページの DFCast の実体から読む** (⛔ 12 人の表を写経しない)。依頼書が名指しする
 *     ダグ / ハルガン / ブルム / アデラ / トルガ (旧名簿・約束の仕込み) 以外の名前は、すべて DFCast から引いて期待値にする。
 *   - 酒場の抽選は pickCompanion / drawTodaysPatrons を**本番の口のまま**回す。出発は本番の departToScenario
 *     (index.html への遷移だけを request interception で止め、sessionStorage の partyMembers を読む)。
 *   - 名簿の切り替えは localStorage に旧名簿を仕込んで開き、**同じタブの reload()** で開き直して測る
 *     (⚠ 仕込みは sessionStorage の印で 1 タブ 1 回だけ = reload しても仕込み直さない)。
 *   - 本体は index.html?diag=1&scen=goblin-mine&graph=0&autoplay=15 を開き、tryStartEncounter を止めて
 *     (= 探索のまま) startGame() を呼ぶ。独り言の予定は Date.now() で決まるので、evaluateOnNewDocument で
 *     Date.now をずらせる時計に差し替え、4 秒ずつ進める。
 *     ⚠ その副作用で診断の console.error「[DIAG][stall]」が鳴る。装置が作った音なので、その 1 種だけ (0d) の数から外す。
 *   - 「出ない」を測る節 ((3d)(4a)(5d)) は、同じページで castId を 1 人に手で付けると独り言が出ることも確かめる
 *     (= 窓の長さが足りていて、出ないのは条件 / castId が無いから、を示す陽性対照)。
 *   - ⛔ 測らないこと (§8): 独り言の間隔の数字・本数 / 独り言・性格・ひと言の文面そのもの。
 *   - ⛔ 本番ファイルに測定シームを足さない (グローバルの読み取り・代入・直叩きだけ)。
 *
 * ■ 計測機構 (verify_goodberry.js と同型)
 *   - tavern.html / index.html / js/mercenary-roster.js / js/companion-cast.js は起動時に 1 回だけ readFileSync して凍結し、
 *     変異はメモリ上で差し替えて配る (ファイルは書き換えない)。
 *   - 変異の注入点は原本でちょうど 1 件・注入文字列が原本に無い・行数不変、を起動時に検算する。
 *     さらに (a) 自分のアンカーが他の tools/*.js に出てこない (b) 変異で書き換わる行のコード部分が他ドライバに出てこない。
 *     ⚠ pickCompanion の新顔の枝 4 行 (return makeNpcMember(classKey, usedNames);) は verify_mercenary_roster の
 *       計測シームのアンカーなので触らない (oldnewface は makeNpcMember の中の isCastOnTV() の枝へ当てる = 依頼書 §12-2 (2))。
 *   - --negative の合否 = 「担当 (NEG_EXPECT) ⊆ 実際の赤」。担当外の赤は記録する (NEG_ALSO = 実走の記録・合否には使わない)。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10871** (素) / 変異 **10872〜10881** (MUTATIONS の並び順)。
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
const PORT = parseInt(arg('port', '10871'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const I = 'index.html';
const T = 'tavern.html';
const MR = 'js/mercenary-roster.js';
const CC = 'js/companion-cast.js';
const SNAP = [I, T, MR, CC];
const PRISTINE = {};
for (const f of SNAP) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const EOLS = {};
for (const f of SNAP) EOLS[f] = /\r\n/.test(PRISTINE[f]) ? '\r\n' : '\n';
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[CC].indexOf('global.DFCast = {') < 0 || PRISTINE[I].indexOf('function tickIdleChatter()') < 0)
  vetFail('#117 項目2 より前のツリーで走らせている (DFCast / tickIdleChatter が無い)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。⚠ 行数は変えない (行の中身だけを差し替える)。
 *   from / to の '\n' は原本の行末へ読み替える。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MUTATIONS = {
  /* ⭐罠A: castId を名簿の項目から読む (= 名簿には保存されていないので常に undefined)。
     ⚠ 出発の関所 stampCastIdsTV が名前から付け直すので、関所も「持っている castId を読むだけ」にしないと本体側が赤にならない */
  castidfromroster: [
    { file: T, from: '    const cid = castIdOfTV(v.name, classKey);   // ★#117 罠 A: 名簿には無いので名前から付ける (OFF なら付けない)',
      to: '    const cid = v.castId;   /* ★変異castidfromroster: 名簿の項目から読む */' },
    { file: T, from: '      const id = castIdOfTV(m.name, m.classKey);',
      to: '      const id = m.castId; /* ★変異castidfromroster: 関所も持っている castId を読むだけ */' },
  ],
  /* ⭐罠B: 本体が castId ではなく npcName でキャストを引く */
  castbyname: [{ file: I,
    from: '      ally.castId   = m.isHero ? null : ((typeof m.castId === "string" && m.castId) ? m.castId : null);',
    to: '      ally.castId   = m.isHero ? null : ((window.DFCast && DFCast.idOfName(m.name)) || null); /* ★変異castbyname */' }],
  /* ⭐罠C: 写しの有無を見ずに毎回切り替える */
  migrateevery: [{ file: MR, from: '    if (lsGet(PRECAST_KEY) != null) return;         // 切り替え済み',
    to: '    /* ★変異migrateevery: 写しの有無を見ない */' }],
  /* ⭐罠D: 名前一致の段 ① を外す (① の候補が 1 人も見つからない) */
  noname1st: [{ file: MR, from: '            if (taken[m.id] || m.name !== c.name) return;',
    to: '            return; /* ★変異noname1st */' }],
  /* 写しを書かない (⚠ 写し = 切り替え済みの印も消えるので毎回走る) */
  nocopy: [{ file: MR, from: '      if (!lsSet(PRECAST_KEY, raw != null ? raw : JSON.stringify(emptyRoster()))) return;',
    to: '      /* ★変異nocopy: 写しを書かない */' }],
  /* 約束からキャスト外を外さない */
  keeprecruit: [{ file: MR, from: '            if (kept.length) lsSet(RECRUIT_KEY, JSON.stringify(kept)); else lsDel(RECRUIT_KEY);',
    to: '            void kept; /* ★変異keeprecruit */' }],
  /* 独り言の currentPhase の条件を外す */
  idleincombat: [{ file: I, from: '        if (currentPhase !== "explore" || dialogPaused || gameOver) { idleWasExplore = false; return; }',
    to: '        if (dialogPaused || gameOver) { idleWasExplore = false; return; } /* ★変異idleincombat */' }],
  /* 独り言を優先度 2 で積む */
  idleprio2: [{ file: I, from: '        if (!sayLine("idle.chatter", a, { text, ambient: true, prio: 0 })) { idleChatterNextAt = now + IDLE_CHATTER_RETRY_MS; return; }',
    to: '        if (!sayLine("idle.chatter", a, { text, ambient: true, prio: 2 })) { idleChatterNextAt = now + IDLE_CHATTER_RETRY_MS; return; } /* ★変異idleprio2 */' }],
  /* 新顔の枝を makeNpcMember (= 90 人の表) のままにする。⚠ pickCompanion の枝の行には当てない (§12-2 (2)) */
  oldnewface: [{ file: T, from: '    if (isCastOnTV()) {', to: '    if (false) { /* ★変異oldnewface */' }],
  /* ?cast=0 を見ない */
  nocastoff: [{ file: CC, from: '    try { return new URLSearchParams(global.location.search).get("cast") !== "0"; }',
    to: '    try { return true; /* ★変異nocastoff */ }' }],
};
/* 変異 → 赤くなるべき節 (担当)。依頼書 §8 の表。 */
const NEG_EXPECT = {
  castidfromroster: ['(1d)', '(3a)'], castbyname: ['(5d)'], migrateevery: ['(2c)'], noname1st: ['(2a)'],
  nocopy: ['(2b)', '(2e)', '(5c)'], keeprecruit: ['(2d)'], idleincombat: ['(3d)'], idleprio2: ['(3c)'],
  oldnewface: ['(1a)'], nocastoff: ['(5a)', '(5b)'],
};
/* 担当外で赤くなると実走で確かめた節 (記録用。⚠ 合否には使わない)。2026-11-21 の --negative 実走の値。
   - castidfromroster → (5d): 関所が「持っている castId を読むだけ」になるので、?cast=0 の約束に残った古い castId が本体へ届く
   - castbyname → (4a): 直起動の既定の仲間の名前にもキャストと同じ名前 (例 ミラ) がいる = 名前で引くと話し出す
   - migrateevery → (2b)(2f)(5c): 酒場の起動で load() が複数回呼ばれ、2 回目が写しを「切り替え後の名簿」で上書きする /
     知らせの印も立て直される / ?cast=0 で読む写しがキャストの名簿になる
   - nocopy → (2c)(2f): 印が無いので開くたびに切り替えが走り、消した知らせの印がまた立つ
   - oldnewface → (1b)(1c)(3a)、ときどき (3b)(3c): 新顔に castId が付かない / 戦士の新顔が 90 人の表から出る。
     ⚠ 90 人の表にはキャストと同じ名前が 11 人いるので、出発の関所が名前から castId を付け直す人が出ることがあり、
       (3b)(3c) は抽選しだいで緑にもなる (2 回の実走で 1 回ずつ)。担当の (1a) は毎回赤
     ★#121: (0c) は oldnewface では赤にならなくなった = 相性ペアの 2 席が makeNpcMember を通らず DFCast から
       直に座り、全 12 キャストを供給するため「12 人全員が 1 回以上出る」は満たされる。この変異は (1a) が
       「全席が妥当なキャスト (pickCompanion 由来の 2 席が 90 人の表の非キャストになる)」でより強く捕えるので担当を (1a) 単独へ移した
   - nocastoff → (5c)(5d): ?cast=0 でもキャスト ON 扱い = 写しを読まない / 出発で castId が付く */
const NEG_ALSO = {
  castidfromroster: ['(5d)'], castbyname: ['(4a)'], migrateevery: ['(2b)', '(2f)', '(5c)'], noname1st: [],
  nocopy: ['(2c)', '(2f)'], keeprecruit: [], idleincombat: [], idleprio2: [],
  oldnewface: ['(1b)', '(1c)', '(3a)', '(3b)', '(3c)'], nocastoff: ['(5c)', '(5d)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length !== 10) vetFail('変異は 10 本 (ポート 10872〜10881)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_ALSO[k] || !NEG_EXPECT[k].length)) vetFail('NEG_EXPECT / NEG_ALSO と MUTATIONS が揃っていない');
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
const _mutCache = {};
function servedFiles(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key]) return _mutCache[key];
  const out = Object.assign({}, PRISTINE);
  for (const e of MUTATIONS[key]) {
    const eol = (s) => s.split('\n').join(EOLS[e.file]);
    const from = eol(e.from), to = eol(e.to);
    const c = countOf(PRISTINE[e.file], from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + e.file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (from.split('\n').length !== to.split('\n').length) vetFail('変異 ' + key + ' が行数を変える');
    if (countOf(PRISTINE[e.file], to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    if (countOf(out[e.file], from) !== 1) vetFail('変異 ' + key + ' の注入点が同じ変異の先行注入に食われた');
    out[e.file] = out[e.file].split(from).join(to);
  }
  for (const f of SNAP) if (out[f].split('\n').length !== PRISTINE[f].split('\n').length) vetFail('変異 ' + key + ' が ' + f + ' の行数を変えた');
  if (SNAP.every((f) => out[f] === PRISTINE[f])) vetFail('変異 ' + key + ' が何も変えていない');
  _mutCache[key] = out;
  return out;
}
for (const k of MUT_ORDER) servedFiles(k);
/* 他ドライバとの重なり。(a) 自分のアンカーが他の tools/*.js に出てこない
   (b) 変異で書き換わる行のコード部分 (行末コメントを除く) が他の tools/*.js に出てこない */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self)
    .map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  const codePart = (line) => { const i = line.indexOf('//'); return (i >= 0 ? line.slice(0, i) : line).trim(); };
  for (const k of MUT_ORDER) {
    for (const e of MUTATIONS[k]) {
      for (const core of e.from.split('\n').map((s) => codePart(s)).filter((s) => s.length >= 12)) {
        const clash = peers.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
        if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる: ' + clash.join(',') + ' :: ' + core.slice(0, 100));
      }
    }
    const served = servedFiles(k);
    for (const f of SNAP) {
      const pl = PRISTINE[f].split('\n'), ml = served[f].split('\n');
      for (let i = 0; i < pl.length; i++) {
        if (pl[i] === ml[i]) continue;
        const cp0 = codePart(pl[i]);
        if (cp0.length < 12) continue;
        const clash = peers.filter((x) => x.s.indexOf(cp0) >= 0).map((x) => x.f);
        if (clash.length) vetFail('変異 ' + k + ' が書き換える ' + f + ':' + (i + 1) + ' は他ドライバのアンカー行 (' + clash.join(',') + '): ' + cp0.slice(0, 120));
      }
    }
  }
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本でちょうど 1 箇所・行数不変・他ドライバとアンカー / 書き換え行の重なり 0');

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
  const buf = {};
  for (const f of SNAP) buf[f] = Buffer.from(files[f], 'utf8');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        res.on('error', () => {});
        let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (rel === '') rel = T;
        res.setHeader('Cache-Control', 'no-store');
        if (buf[rel]) { res.setHeader('Content-Type', MIME[path.extname(rel)] || 'text/plain'); res.end(buf[rel]); return; }
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)',
  '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(4b)',
  '(5a)', '(5b)', '(5c)', '(5d)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 500 : 1500));
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
 * 種
 * ══════════════════════════════════════════════════════════════════════════════ */
/* 依頼書 §8 (2a) の旧名簿 (ドワーフ 3 人 + 戦士 1 人) と (2d) の約束 (キャストの名前 1 人 + キャスト外 1 人) */
const OLD_ROSTER = J({ v: 1, next: 9, list: [
  { id: 1, classKey: 'dwarf', name: 'ダグ', trait: '旧', line: '旧', variant: 1, level: 3, runs: 9 },
  { id: 2, classKey: 'dwarf', name: 'ハルガン', trait: '旧', line: '旧', variant: 1, level: 5, runs: 1 },
  { id: 3, classKey: 'dwarf', name: 'ブルム', trait: '旧', line: '旧', variant: 1, level: 2, runs: 0 },
  { id: 4, classKey: 'warrior', name: 'アデラ', trait: '旧', line: '旧', variant: 1, level: 4, runs: 2 } ] });
const OLD_RECRUITS = J([{ classKey: 'dwarf', name: 'ダグ', isHero: false, zone: 'front', variant: 1 },
  { classKey: 'mage', name: 'トルガ', isHero: false, zone: 'rear', variant: 1 }]);
const TAVERN_SS = { 'dragonfighters.plazaClock': '21' };   // CLAUDE.md #102: 酒場は時刻を固定して開く
const TAVERN_READY = "typeof openPrep === 'function' && typeof scenarios !== 'undefined' && !!(window.__pmTest)"
  + " && (typeof isRecruitTalkOn !== 'function' || !isRecruitTalkOn() || (typeof todaysPatrons !== 'undefined' && todaysPatrons && Object.keys(todaysPatrons).length === 4))";
const INDEX_QS = '?diag=1&scen=goblin-mine&graph=0&autoplay=15';

/* ══════════════════════════════════════════════════════════════════════════════
 * 1 回分の検査 (素 / 変異で共通)
 * ══════════════════════════════════════════════════════════════════════════════ */
async function runSuite(browser, port) {
  const R = mkResults();
  const ERRS = [];
  let seq = 0;
  const BASE = 'http://127.0.0.1:' + port + '/';

  async function open(file, qs, seed) {
    const page = await browser.newPage();
    const tag = 'P' + port + '_' + (++seq);
    page.on('pageerror', (e) => ERRS.push(tag + ' ' + file + (qs || '') + ' PAGEERROR ' + String(e.message).slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (/^\[DIAG\]\[stall\]/.test(m.text())) return;   // 装置の副作用 (遭遇を止めて時計を進める) — この 1 種だけ外す
      if (/favicon/.test(String((m.location() || {}).url))) return;
      ERRS.push(tag + ' ' + file + (qs || '') + ' CONSOLE ' + m.text().slice(0, 200));
    });
    page.__nav = [];
    await page.setRequestInterception(true);
    page.on('request', (rq) => {
      if (file === T && rq.isNavigationRequest() && rq.frame() === page.mainFrame() && /\/(index|world)\.html/.test(rq.url())) {
        page.__nav.push(rq.url()); rq.abort('aborted').catch(() => {}); return;
      }
      rq.continue().catch(() => {});
    });
    await page.setViewport({ width: 1280, height: 900 });
    if (seed) {
      await page.evaluateOnNewDocument((spec) => {
        try {
          if (sessionStorage.getItem('__vcc') !== spec.tag) {   // 仕込みは 1 タブ 1 回だけ (reload では仕込み直さない)
            [localStorage, sessionStorage].forEach((st) => {
              const k = []; for (let i = 0; i < st.length; i++) if (st.key(i).indexOf('dragonfighters.') === 0) k.push(st.key(i));
              k.forEach((x) => st.removeItem(x));
            });
            Object.keys(spec.ls || {}).forEach((k) => localStorage.setItem(k, spec.ls[k]));
            Object.keys(spec.ss || {}).forEach((k) => sessionStorage.setItem(k, spec.ss[k]));
            sessionStorage.setItem('__vcc', spec.tag);
          }
        } catch (e) {}
        if (spec.clock) {   // Date.now をずらせる時計 (吹き出しの行列と独り言の予定が Date.now を見る)
          const real = Date.now.bind(Date); window.__dOff = 0; Date.now = () => real() + window.__dOff;
        }
      }, Object.assign({ tag }, seed));
    } else {
      /* 仕込まない (= 直前の節の localStorage をそのまま引き継ぐ)。sessionStorage はタブごとなので時刻だけ入れる */
      await page.evaluateOnNewDocument((ss) => { try { Object.keys(ss).forEach((k) => sessionStorage.setItem(k, ss[k])); } catch (e) {} }, TAVERN_SS);
    }
    await page.goto(BASE + file + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (file === T) await page.waitForFunction(TAVERN_READY, { timeout: 60000 });
    return page;
  }
  const tavern = (qs, ls) => open(T, qs, { ls: ls || {}, ss: TAVERN_SS });
  const sect = async (ids, fn) => {
    try { await fn(); }
    catch (e) { for (const id of ids) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.stack) || e).slice(0, 400)); }
  };

  /* ── §0 / §1 / (2e): まっさらの酒場 ── */
  let CAST = null;   // ページの DFCast.all() (以降の期待値の母集団)
  await sect(['(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(2e)'], async () => {
    const p = await tavern('', {});
    const e0 = await p.evaluate(() => ({
      precast: localStorage.getItem(DFRoster.PRECAST_KEY), main: localStorage.getItem(DFRoster.KEY),
      notice: localStorage.getItem(DFRoster.NOTICE_KEY),
    }));
    const a = await p.evaluate(() => {
      const cast = DFCast.all();
      const byClass = {}; cast.forEach((c) => { (byClass[c.classKey] = byClass[c.classKey] || []).push(c.name); });
      const outside = cast.filter((c) => !(NPC_NAMES_BY_CLASS[c.classKey] || []).includes(c.name)).map((c) => c.name);
      const byName = {}; cast.forEach((c) => { byName[c.name] = c; });
      const seen = {}; const bad = []; const bad1b = []; let n = 0, pairDraws = 0;
      /* ⭐ 職は pickCompanion へ渡した職 (引数) と 人物の classKey の両方で突き合わせる。
         引数は卓の席の名前 (patronA〜D) からは分からないので、本番の pickCompanion を包んで記録する (終わったら戻す)。
         ★#121: 相性ペアの 2 席は pickCompanion を通らず DFCast から直に座る (同職ペアは pickCompanion では
            揃えられないため)。その席は「DFCast に実在するキャスト (名前の職 = classKey) かつ castId が引ける」で妥当とする。
            pickCompanion 由来の席は従来どおり引数の職とも一致まで要求する (oldnewface はこの席で赤になる)。 */
      const orig = pickCompanion; const args = new Map();
      pickCompanion = function (ck, used) { const m = orig(ck, used); if (m) args.set(m, ck); return m; };
      try {
      for (let i = 0; i < 200; i++) {
        const out = drawTodaysPatrons();
        const seatIds = [];
        Object.keys(out).forEach((slot) => {
          const m = out[slot]; n++;
          seen[m.name] = 1;
          if (m.castId) seatIds.push(m.castId);
          const c = byName[m.name];
          const viaPick = args.has(m);
          const arg = viaPick ? args.get(m) : '(相性ペアの専用枠)';
          const okSeat = !!c && c.classKey === m.classKey
            && (viaPick ? (c.classKey === arg) : (typeof m.castId === 'string' && !!DFCast.byId(m.castId)));
          if (!okSeat) bad.push({ slot, arg, cls: m.classKey, name: m.name });
          const b = m.castId ? DFCast.byId(m.castId) : null;
          if (!b || b.name !== m.name || b.trait !== m.trait || b.line !== m.line || b.variant !== m.variant) bad1b.push({ name: m.name, castId: m.castId || null });
        });
        if (DFCast.activePairs(seatIds).length > 0) pairDraws++;
      }
      } finally { pickCompanion = orig; }
      return { cast, byClass, names: new Set(cast.map((c) => c.name)).size, outside, seen: Object.keys(seen).filter((k) => byName[k]).length,
        seenAll: Object.keys(seen).length, n, pairDraws, bad: bad.slice(0, 3), nbad: bad.length, bad1b: bad1b.slice(0, 3), nbad1b: bad1b.length,
        slots: Object.keys(todaysPatrons) };
    });
    CAST = a.cast;
    CAST.__byClass = a.byClass; CAST.__names = a.names;
    R.check('(0b)', '[装置] キャストの名前のうち NPC_NAMES_BY_CLASS のその職の表にいない名前がちょうど 1 つ (罠 E の母集団)',
      a.outside.length === 1, { outside: a.outside });
    R.check('(0c)', '[装置] 卓の抽選 (drawTodaysPatrons) 200 回でキャスト 12 人全員が 1 回以上出る', a.seen === 12 && a.cast.length === 12,
      { seenCast: a.seen, seenAllNames: a.seenAll, draws: a.n });
    R.check('(1a)', '名簿が空のとき、卓の 4 人 × 200 回の全員が DFCast にいて職が一致 (pickCompanion 由来は引数の職とも一致・★#121 相性ペアの専用枠は castId が引ける)・★#121 どの回も相性ペアが同席する',
      a.n === 800 && a.nbad === 0 && a.pairDraws === 200, { n: a.n, nbad: a.nbad, pairDraws: a.pairDraws, sample: a.bad, slots: a.slots });
    R.check('(1b)', '返された人物の castId が引けて、name / trait / line / variant が DFCast.byId(castId) と一致', a.n === 800 && a.nbad1b === 0,
      { nbad: a.nbad1b, sample: a.bad1b });
    R.check('(2e)', '空の名簿で開くと、写しが空の名簿として書かれ、名簿本体と知らせのキーは書かれない',
      e0.precast !== null && (() => { try { const o = JSON.parse(e0.precast); return Array.isArray(o.list) && o.list.length === 0; } catch (e) { return false; } })()
        && e0.main === null && e0.notice === null, e0);
    /* (1c)(1d): 名簿にその職の 1 人目がいるとき */
    const c = await p.evaluate(() => {
      const first = DFCast.ofClass('warrior')[0], second = DFCast.ofClass('warrior')[1];
      DFRoster.enroll({ classKey: 'warrior', name: first.name, trait: first.trait, line: first.line, variant: first.variant, level: 2 });
      const fresh = {}, vet = {}; let vetN = 0, vetNoCid = 0, freshN = 0;
      for (let i = 0; i < 300; i++) {
        const m = pickCompanion('warrior', new Set());
        if (m.mercId != null) { vetN++; vet[m.name] = 1; if (m.castId !== first.id) vetNoCid++; }
        else { freshN++; fresh[m.name] = 1; }
      }
      const stored = (JSON.parse(localStorage.getItem(DFRoster.KEY) || '{"list":[]}').list || [])[0] || null;
      return { first: first.name, second: second.name, fresh: Object.keys(fresh), vet: Object.keys(vet), vetN, freshN, vetNoCid,
        storedHasCastId: !!(stored && 'castId' in stored) };
    });
    R.check('(1c)', '名簿にその職の 1 人目がいるとき、新顔の枝からは 2 人目しか出ない (pickCompanion 300 回)',
      c.freshN > 0 && c.fresh.length === 1 && c.fresh[0] === c.second, c);
    R.check('(1d)', '名簿の枝から来た人にも castId が付いている (罠 A — 名簿には castId が保存されていないのに付く)',
      c.vetN > 0 && c.vet.length === 1 && c.vet[0] === c.first && c.vetNoCid === 0 && !c.storedHasCastId, c);
    await p.close();
  });

  /* ── §2 名簿の切り替え + (5c) ── */
  await sect(['(2a)', '(2b)', '(2c)', '(2d)', '(2f)', '(5c)'], async () => {
    const p = await tavern('', { 'dragonfighters.mercRoster': OLD_ROSTER, 'dragonfighters.recruitCandidates': OLD_RECRUITS });
    const b = await p.evaluate(() => {
      const dw = DFCast.ofClass('dwarf'), wa = DFCast.ofClass('warrior');
      const dag = DFCast.byId(DFCast.idOfName('ダグ'));
      return {
        roster: JSON.parse(localStorage.getItem(DFRoster.KEY) || 'null'),
        precast: localStorage.getItem(DFRoster.PRECAST_KEY),
        recruits: JSON.parse(localStorage.getItem('dragonfighters.recruitCandidates') || '[]').map((m) => m.name),
        notice: localStorage.getItem(DFRoster.NOTICE_KEY),
        dag, otherDwarf: dw.find((c) => c.name !== 'ダグ') || null, firstWarrior: wa[0],
        torgaInCast: DFCast.idOfName('トルガ') != null, dagInCast: DFCast.idOfName('ダグ') != null,
      };
    });
    const L = (b.roster && b.roster.list) || [];
    const byId = {}; L.forEach((m) => { byId[m.id] = m; });
    const same = (m, c) => !!(m && c && m.name === c.name && m.trait === c.trait && m.line === c.line && m.variant === c.variant);
    R.__a2 = { ok: !!b.dag && !!b.otherDwarf && L.length === 3
        && same(byId[1], b.dag) && byId[1].level === 3 && byId[1].runs === 9
        && same(byId[2], b.otherDwarf) && byId[2].level === 5 && byId[2].runs === 1
        && !byId[3]
        && same(byId[4], b.firstWarrior) && byId[4].level === 4 && byId[4].runs === 2
        && b.roster.next === 9,
      detail: { roster: b.roster, expect: { dag: b.dag && b.dag.name, otherDwarf: b.otherDwarf && b.otherDwarf.name, warrior: b.firstWarrior && b.firstWarrior.name } } };
    R.check('(2b)', '写し dragonfighters.mercRosterPreCast が仕込んだ文字列と完全一致', b.precast === OLD_ROSTER, { precast: b.precast });
    R.check('(2d)', '同行の約束にキャストの名前 (ダグ) とキャスト外 (トルガ) を仕込むと、キャスト外だけ外れる',
      b.dagInCast && !b.torgaInCast && J(b.recruits) === J(['ダグ']), { recruits: b.recruits });
    /* (2f) 名簿パネルの知らせは 1 回だけ */
    const f = await p.evaluate(() => {
      const before = localStorage.getItem(DFRoster.NOTICE_KEY);
      const r1 = openRoster(); const n1 = document.querySelectorAll('#rosterBody .mrCastNotice').length;
      closeRoster(); const r2 = openRoster(); const n2 = document.querySelectorAll('#rosterBody .mrCastNotice').length; closeRoster();
      return { before, r1, n1, r2, n2, after: localStorage.getItem(DFRoster.NOTICE_KEY) };
    });
    R.check('(2f)', '名簿パネルを開くと知らせの 1 行が出て、2 回目は出ない (印は 1 回で消える)',
      f.before === '1' && f.r1 && f.n1 === 1 && f.r2 && f.n2 === 0 && f.after === null, f);
    /* (2c) 同じタブで開き直しても変わらない。⭐ 名簿・写し・知らせの印・約束の 4 つとも (= 切り替えの書き込みが二度と起きない) */
    const snap = () => p.evaluate(() => ({ r: localStorage.getItem(DFRoster.KEY), c: localStorage.getItem(DFRoster.PRECAST_KEY),
      n: localStorage.getItem(DFRoster.NOTICE_KEY), k: localStorage.getItem('dragonfighters.recruitCandidates') }));
    const s0 = await snap();
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(TAVERN_READY, { timeout: 60000 });
    await p.evaluate(() => { DFRoster.all(); DFRoster.load(); });
    const s1 = await snap();
    R.check('(2c)', 'もう一度開き直しても名簿が変わらない (切り替えは 1 回だけ: 名簿・写し・知らせの印・約束がすべて同じ)',
      s0.r !== null && s0.r === s1.r && s0.c === s1.c && s0.n === s1.n && s0.k === s1.k, { before: s0, after: s1 });
    await p.close();
    /* (5c) 同じ localStorage のまま ?cast=0 で開く → 写しの中身を返す */
    const q = await open(T, '?cast=0', null);
    const r5 = await q.evaluate(() => ({ names: DFRoster.all().map((m) => m.name).sort(), levels: DFRoster.all().map((m) => m.level).sort() }));
    const oldNames = JSON.parse(OLD_ROSTER).list.map((m) => m.name).sort();
    const oldLv = JSON.parse(OLD_ROSTER).list.map((m) => m.level).sort();
    R.check('(5c)', '切り替え済みの状態で ?cast=0 で開くと、名簿が写しの中身 (切り替え前の 4 人) を返す',
      J(r5.names) === J(oldNames) && J(r5.levels) === J(oldLv), { got: r5, want: oldNames });
    await q.close();
    /* (2a) の 2 枚目の盤面 (罠 D)。⚠ 依頼書の盤面だけでは ① (名前一致) を外しても緑になる: ドワーフの並びが
       [ラスムーゼン, ダグ] で、ダグは Lv でも 2 番目なので ② (Lv 順) だけでも同じ割り当てに落ちる (実走で確認)。
       そこで 6 職すべてに「その職の 2 人目 (並びの後ろ) と同じ名前で Lv 6」+「キャスト外の名前で Lv 1」を置く。
       ① があれば名前一致の人は 2 人目へ、② だけなら Lv の高いその人が 1 人目の枠へ入る。
       名前はページの DFCast から引く = 写経しない。仕込みはページの中で書いて同じタブを reload する。 */
    const p2 = await tavern('', {});
    const want2 = await p2.evaluate(() => {
      const list = []; const want = {}; let id = 1;
      Object.keys(NPC_NAMES_BY_CLASS).forEach((ck) => {
        const cs = DFCast.ofClass(ck);
        if (cs.length < 2) return;
        want[id] = cs[1].name; list.push({ id: id++, classKey: ck, name: cs[1].name, trait: '旧', line: '旧', variant: 1, level: 6, runs: 0 });
        want[id] = cs[0].name; list.push({ id: id++, classKey: ck, name: 'キャスト外' + id, trait: '旧', line: '旧', variant: 1, level: 1, runs: 0 });
      });
      localStorage.removeItem(DFRoster.PRECAST_KEY); localStorage.removeItem(DFRoster.NOTICE_KEY);
      localStorage.setItem(DFRoster.KEY, JSON.stringify({ v: 1, next: id, list }));
      return want;
    });
    await p2.reload({ waitUntil: 'domcontentloaded' }); await p2.waitForFunction(TAVERN_READY, { timeout: 60000 });
    const got2 = await p2.evaluate(() => { const o = {}; DFRoster.all().forEach((m) => { o[m.id] = m.name; }); return o; });
    await p2.close();
    const a2b = Object.keys(want2).length === 12 && Object.keys(want2).every((k) => got2[k] === want2[k]);
    const a2 = R.__a2 || { ok: false, detail: null };
    R.check('(2a)', '旧名簿 (ダグ Lv3 runs9 / ハルガン Lv5 / ブルム Lv2 / アデラ Lv4) → ダグ→ダグ (Lv3 runs9) / ハルガン→もう 1 人のドワーフ (Lv5) / ブルム消える / アデラ→戦士の 1 人目 (Lv4)。引き継ぎは id・level・runs、name・trait・line・variant はキャスト。'
      + '+ 2 枚目: 6 職とも「2 人目と同名 Lv6」は Lv の順より名前一致が勝って 2 人目へ・「キャスト外 Lv1」は 1 人目へ',
      a2.ok && a2b, { board1: a2.detail, board2: { want: want2, got: got2 } });
  });

  /* ── §5 撤退 (5a)(5b) ── */
  await sect(['(5a)', '(5b)'], async () => {
    const p = await tavern('?cast=0', { 'dragonfighters.mercRoster': OLD_ROSTER });
    const c = await p.evaluate(() => {
      let bad = 0, cid = 0, fresh = 0; const sample = [];
      for (let i = 0; i < 100; i++) {
        const out = drawTodaysPatrons();
        Object.keys(out).forEach((k) => {
          const m = out[k];
          if (m.mercId == null) { fresh++; if (!(NPC_NAMES_BY_CLASS[m.classKey] || []).includes(m.name)) { bad++; if (sample.length < 3) sample.push(m.name); } }
          if ('castId' in m) cid++;
        });
      }
      for (const k of Object.keys(NPC_NAMES_BY_CLASS)) for (let i = 0; i < 30; i++) {
        const m = makeNpcMember(k, new Set()); fresh++;
        if (!(NPC_NAMES_BY_CLASS[k] || []).includes(m.name)) { bad++; if (sample.length < 3) sample.push(m.name); }
        if ('castId' in m) cid++;
      }
      return { bad, cid, fresh, sample, precast: localStorage.getItem(DFRoster.PRECAST_KEY), roster: localStorage.getItem(DFRoster.KEY), on: DFCast.enabled() };
    });
    R.check('(5a)', 'tavern.html?cast=0 → 新顔の名前が NPC_NAMES_BY_CLASS のその職の表から (#72 の姿)・castId が付かない (卓 100 回 + makeNpcMember 6 職 × 30)',
      c.fresh > 0 && c.bad === 0 && c.cid === 0, { fresh: c.fresh, bad: c.bad, cid: c.cid, sample: c.sample, enabled: c.on });
    R.check('(5b)', '?cast=0 で旧名簿を仕込んで開くと切り替えが走らない (写しが書かれない・名簿が 1 バイトも変わらない)',
      c.precast === null && c.roster === OLD_ROSTER, { precast: c.precast, rosterSame: c.roster === OLD_ROSTER });
    await p.close();
  });

  /* ── 出発 (本番の departToScenario) ── */
  async function depart(qs, prep) {
    const p = await tavern(qs, {});
    await p.evaluate(prep);
    await p.evaluate(() => {
      prepScenario = scenarios.find((s) => s.id === 'goblin-mine') || scenarios[0];
      selection.partyMembers = null; regeneratePartyMembers();
      departToScenario();
    });
    await sleep(400);
    const d = await p.evaluate(() => JSON.parse(sessionStorage.getItem('dragonfighters.partyMembers') || 'null'));
    const nav = p.__nav.length;
    await p.close();
    return { members: d, nav };
  }
  let DEP_NEW = null, DEP_VET = null, DEP_OFF = null;
  await sect(['(3a)', '(5d)'], async () => {
    /* ⚠ 卓の声掛けが ON の酒場では、同行するのは声を掛けた (= 約束 DFRecruits に入れた) 人だけ。
       卓の 3 人を約束に入れてから出発する (smoke と同じ型) */
    /* 新顔だけの編成 (名簿は空 = 卓の 4 人はすべて新顔の枝) */
    DEP_NEW = await depart('', () => {
      Object.keys(todaysPatrons).slice(0, 3).forEach((k) => DFRecruits.add(todaysPatrons[k], 3));
    });
    /* 名簿だけの編成: キャスト 12 人を全員名簿へ (= 満杯 → pickCompanion は必ず名簿の枝) → 卓を引き直して 3 人を約束へ */
    DEP_VET = await depart('', () => {
      DFCast.all().forEach((c) => DFRoster.enroll({ classKey: c.classKey, name: c.name, trait: c.trait, line: c.line, variant: c.variant, level: 2 }));
      todaysPatrons = drawTodaysPatrons();
      Object.keys(todaysPatrons).slice(0, 3).forEach((k) => DFRecruits.add(todaysPatrons[k], 3));
    });
    /* ?cast=0 で、キャストと同じ名前の人を約束に入れて出発 (⭐ 古い castId を持たせる = 関所で外れることも見る) */
    DEP_OFF = await depart('?cast=0', () => {
      Object.keys(todaysPatrons).slice(0, 3).forEach((k) => {
        const m = Object.assign({}, todaysPatrons[k]);
        const c = DFCast.ofClass(m.classKey)[0];
        if (c) { m.name = c.name; m.castId = c.id; }
        DFRecruits.add(m, 3);
      });
    });
  });

  /* ── 本体 ── */
  async function openIndex(members, opt) {
    opt = opt || {};
    const ss = {};
    if (members) {
      const hero = members.find((m) => m.isHero);
      ss['dragonfighters.partyMembers'] = J(members);
      ss['dragonfighters.partyComposition'] = J([hero ? hero.classKey : 'warrior']);
    }
    const pg = await open(I, INDEX_QS, { clock: true, ls: { 'dragonfighters.xp': '45000', 'dragonfighters.prologueSeen': '1' }, ss });
    await pg.waitForFunction(() => { try { return typeof allies !== 'undefined' && allies.length > 0 && typeof startGame === 'function'; } catch (e) { return false; } }, { timeout: 60000 })
      .catch(async (e) => { throw new Error('本体の起動待ち (allies) が切れた: ' + J(await pg.evaluate(() => { try { return { allies: typeof allies !== 'undefined' ? allies.length : 'undef', url: location.href }; } catch (e2) { return String(e2); } }).catch(() => null))); });
    await sleep(600);
    if (opt.start !== false) {
      await pg.evaluate(() => { try { tryStartEncounter = function () {}; } catch (e) {} try { if (!gameStarted) startGame(); } catch (e) {} });   // 戦闘に入らない = 探索のまま
      await pg.waitForFunction(() => { try { return gameStarted; } catch (e) { return false; } }, { timeout: 30000 })
        .catch(() => { throw new Error('本体の startGame 待ちが切れた'); });
    }
    return pg;
  }
  /* 時計を steps 回 4 秒ずつ進める。idle.chatter の行 (at > mark) を数える。stopAt 本出たら止める。
     ⭐ 毎回 currentPhase / dialogPaused を記録して、条件が保たれていたかを返す (force で毎回かけ直す) */
  async function advance(pg, steps, opt) {
    opt = opt || {};
    const mark = await pg.evaluate(() => Date.now());
    const phases = {}; let rows = [];
    for (let i = 0; i < steps; i++) {
      const r = await pg.evaluate((mk, force) => {
        window.__dOff += 4000;
        if (force) { try { if (force.phase) currentPhase = force.phase; if (force.paused !== undefined) dialogPaused = force.paused; } catch (e) {} }
        return { ph: currentPhase, dp: dialogPaused, go: gameOver,
          rows: __speech.log.filter((x) => x.key === 'idle.chatter' && x.at > mk).map((x) => ({ text: x.text, castId: x.castId || null, at: x.at })) };
      }, mark, opt.force || null);
      const k = r.ph + (r.dp ? '/paused' : '') + (r.go ? '/over' : '');
      phases[k] = (phases[k] || 0) + 1;
      rows = r.rows;
      if (r.go) break;
      if (opt.stopAt && rows.length >= opt.stopAt) break;
      await sleep(250);
    }
    return { rows, phases };
  }
  /* 陽性対照: castId を仲間 1 人へ手で付けて (付いていればそのまま)、探索へ戻すと独り言が出るか */
  async function positiveControl(pg) {
    await pg.evaluate(() => {
      const a = allies.find((x) => x && x.alive);
      if (a) a.castId = a.castId || (DFCast.idOfName(a.npcName) || DFCast.all()[0].id);
      try { currentPhase = 'explore'; dialogPaused = false; } catch (e) {}
      clearSpeech(); idleChatterNextAt = 1;
    });
    return advance(pg, 30, { stopAt: 1 });
  }

  /* E1: 新顔の編成で本体を開く → (0a 本体)(3a 前半)(3b)(3c)(3d)(4b) */
  let A3NEW = { ok: false };
  await sect(['(0a)', '(3b)', '(3c)', '(3d)', '(4b)'], async () => {
    if (!DEP_NEW || !DEP_NEW.members) throw new Error('出発 (新顔) の partyMembers が無い');
    const pg = await openIndex(DEP_NEW.members);
    const info = await pg.evaluate(() => ({
      cast: (window.DFCast && DFCast.all().length) || 0,
      allies: allies.map((a) => ({ n: a.npcName, c: a.castId, nm: a.castId && DFCast.byId(a.castId) ? DFCast.byId(a.castId).name : null })),
    }));
    /* (3b) 探索中に独り言が出る */
    const adv = await advance(pg, 120, { stopAt: 2 });
    const chk = await pg.evaluate((rows) => rows.map((x) => {
      const a = allies.find((y) => y.castId && y.castId === x.castId); const c = x.castId && DFCast.byId(x.castId);
      return { ok: !!(a && c && c.idle.indexOf(x.text) >= 0), text: x.text, who: c ? c.name : null };
    }), adv.rows);
    /* (3c) 優先度 0・遭遇 / 重要なセリフを押し出さない。(4b) 既存の呼び口。⚠ 同期区間で積んで読む (フレームを挟まない = 表示へ回らない) */
    const c3 = await pg.evaluate(() => {
      const out = {};
      const prime = () => { clearSpeech(); idleChatterNextAt = 1; tickIdleChatter(); return speechQueue.map((e) => ({ key: e.key, prio: e.prio })); };
      out.max = SPEECH_MAX_QUEUE;
      /* A: [独り言, 遭遇 × (MAX-1)] で満杯 → さらに遭遇を積む */
      out.qA0 = prime();
      for (let i = 0; i < SPEECH_MAX_QUEUE - 1; i++) sayLine('encounter.goblinoid', 'party');
      out.okA = sayLine('encounter.goblinoid', 'party');
      out.qA = speechQueue.map((e) => e.key);
      /* B: [独り言, 遭遇 × (MAX-1)] で満杯 → 優先度 1 の台詞 (combat.lowhp) を積む */
      out.qB0 = prime();
      for (let i = 0; i < SPEECH_MAX_QUEUE - 1; i++) sayLine('encounter.goblinoid', 'party');
      out.okB = sayLine('combat.lowhp', 'player');
      out.qB = speechQueue.map((e) => e.key);
      /* (4b) 既存の呼び口 (opts.text なし) は SPEECH_LINES から */
      clearSpeech();
      const r1 = sayLine('encounter.goblinoid', 'party');
      const t1 = speechQueue.length ? speechQueue[0].text : null;
      const p1 = speechQueue.length ? speechQueue[0].prio : null;
      clearSpeech();
      const r2 = sayLine('idle.chatter', 'party');   // 文面を渡さない独り言のキー = SPEECH_LINES に無い → 積まれない
      const q2 = speechQueue.length;
      clearSpeech();
      out.b4 = { r1, inLines: (SPEECH_LINES['encounter.goblinoid'] || []).indexOf(t1) >= 0, p1, encPrio: speechPrio('encounter.goblinoid'), r2, q2 };
      return out;
    });
    /* (3d) 戦闘中・選択肢の表示中は出ない (それぞれの窓の後に陽性対照) */
    await pg.evaluate(() => { clearSpeech(); idleChatterNextAt = 1; currentPhase = 'combat'; });
    const dCombat = await advance(pg, 16, { force: { phase: 'combat' } });
    const pCombat = await positiveControl(pg);
    await pg.evaluate(() => { clearSpeech(); idleChatterNextAt = 1; dialogPaused = true; });
    const dPaused = await advance(pg, 16, { force: { paused: true } });
    const pPaused = await positiveControl(pg);
    await pg.close();

    const npc = info.allies.filter((x) => x.n);
    const tc = CAST || [];
    const tcls = Object.keys(tc.__byClass || {});
    R.check('(0a)', '[装置] DFCast が酒場と本体 (index.html) の両方に読み込まれ、all().length === 12・6 職 × 2 人・名前 12 通り',
      tc.length === 12 && tcls.length === 6 && tcls.every((k) => tc.__byClass[k].length === 2) && tc.__names === 12 && info.cast === 12,
      { tavern: tc.length, byClass: tc.__byClass, names: tc.__names, index: info.cast });
    A3NEW = { ok: DEP_NEW.nav === 1 && npc.length === info.allies.length && npc.length >= 1 && npc.every((x) => x.c && x.nm === x.n), allies: info.allies, nav: DEP_NEW.nav };
    R.check('(3b)', '探索中、時計を進めると独り言が speechLog に 1 本以上出る。話し手は castId を持つ仲間で、文面はその人の idle に含まれる',
      chk.length >= 1 && chk.every((x) => x.ok), { rows: chk, phases: adv.phases });
    const onlyEnc = (q) => q.length === c3.max && q.every((k) => k === 'encounter.goblinoid');
    R.check('(3c)', '独り言の予約の優先度が 0。[独り言, 遭遇 × 2] の満杯の行列へ遭遇を積むと独り言だけが外れて遭遇 3 本が残る・優先度 1 の台詞 (combat.lowhp) も独り言を押し出して入る',
      c3.qA0.length === 1 && c3.qA0[0].key === 'idle.chatter' && c3.qA0[0].prio === 0
        && c3.okA === true && onlyEnc(c3.qA)
        && c3.qB0.length === 1 && c3.qB0[0].prio === 0 && c3.okB === true && c3.qB.indexOf('combat.lowhp') >= 0 && c3.qB.indexOf('idle.chatter') < 0,
      c3);
    const phOnly = (ph, want) => Object.keys(ph).length > 0 && Object.keys(ph).every((k) => k === want);
    R.check('(3d)', '戦闘中 (currentPhase === "combat") と選択肢の表示中 (dialogPaused) は 64 秒進めても独り言が出ない (それぞれ直後に探索へ戻すと出る = 陽性対照)',
      dCombat.rows.length === 0 && phOnly(dCombat.phases, 'combat') && pCombat.rows.length >= 1
        && dPaused.rows.length === 0 && phOnly(dPaused.phases, 'explore/paused') && pPaused.rows.length >= 1,
      { combat: { n: dCombat.rows.length, ph: dCombat.phases, ctl: pCombat.rows.length }, paused: { n: dPaused.rows.length, ph: dPaused.phases, ctl: pPaused.rows.length } });
    R.check('(4b)', 'sayLine の既存の呼び口 (opts.text なし) は SPEECH_LINES から積む・優先度は speechPrio のまま・文面の無いキーは積まれない',
      c3.b4.r1 === true && c3.b4.inLines && c3.b4.p1 === c3.b4.encPrio && c3.b4.r2 === false && c3.b4.q2 === 0, c3.b4);
  });

  /* E2: 名簿だけの編成 → (3a) */
  await sect(['(3a)'], async () => {
    if (!DEP_VET || !DEP_VET.members) throw new Error('出発 (名簿) の partyMembers が無い');
    const pg = await openIndex(DEP_VET.members, { start: false });
    const al = await pg.evaluate(() => allies.map((a) => ({ n: a.npcName, c: a.castId, nm: a.castId && DFCast.byId(a.castId) ? DFCast.byId(a.castId).name : null })));
    await pg.close();
    const vets = (DEP_VET.members || []).filter((m) => !m.isHero);
    const npc = al.filter((x) => x.n);
    const vetOk = DEP_VET.nav === 1 && vets.length >= 1 && vets.every((m) => m.mercId != null) && npc.length === al.length && npc.length >= 1 && npc.every((x) => x.c && x.nm === x.n);
    R.check('(3a)', '酒場から出発すると本体の仲間全員 (主人公を除く) が castId を持ち DFCast.byId(castId).name === npcName (新顔だけの編成 と 名簿だけの編成 の両方)',
      A3NEW.ok && vetOk, { fresh: A3NEW, vet: { allies: al, mercIds: vets.map((m) => m.mercId), nav: DEP_VET.nav } });
  });

  /* E3: ?cast=0 の出発 → (5d) */
  await sect(['(5d)'], async () => {
    if (!DEP_OFF || !DEP_OFF.members) throw new Error('出発 (?cast=0) の partyMembers が無い');
    const npcs = DEP_OFF.members.filter((m) => !m.isHero);
    const castNames = (CAST || []).map((c) => c.name);
    const pg = await openIndex(DEP_OFF.members);
    const al = await pg.evaluate(() => allies.map((a) => ({ n: a.npcName, c: a.castId })));
    const adv = await advance(pg, 25);
    const ctl = await positiveControl(pg);
    await pg.close();
    R.check('(5d)', '?cast=0 で出発すると (仲間の名前がキャストと同じでも・約束に古い castId があっても) partyMembers に castId が無く、本体で 100 秒進めても独り言が出ない (castId を手で付けると出る = 陽性対照)',
      DEP_OFF.nav === 1 && npcs.length === 3 && npcs.every((m) => castNames.indexOf(m.name) >= 0 && !('castId' in m))
        && al.every((x) => !x.c) && adv.rows.length === 0 && (adv.phases.explore || 0) >= 20 && ctl.rows.length >= 1,
      { members: npcs.map((m) => [m.name, m.castId || null]), allies: al, idle: adv.rows.length, phases: adv.phases, ctl: ctl.rows.length });
  });

  /* E4: 酒場を通らない直起動 → (4a) */
  await sect(['(4a)'], async () => {
    const pg = await openIndex(null);
    const al = await pg.evaluate(() => allies.map((a) => ({ n: a.npcName, c: a.castId })));
    const adv = await advance(pg, 25);
    const ctl = await positiveControl(pg);
    await pg.close();
    R.check('(4a)', 'index.html を直接起動 (酒場を通らない) すると仲間に castId が無く、100 秒進めても独り言が一言も出ない (castId を手で付けると出る = 陽性対照)',
      al.length >= 1 && al.every((x) => !x.c) && adv.rows.length === 0 && (adv.phases.explore || 0) >= 20 && ctl.rows.length >= 1,
      { allies: al, idle: adv.rows.length, phases: adv.phases, ctl: ctl.rows.length });
  });

  R.check('(0d)', '[装置] 全ページで pageerror / console.error 0 件 ([DIAG][stall] の 1 種だけ除く)', ERRS.length === 0, ERRS.slice(0, 5));
  for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(判定が出ていない)', false, '');
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_companion_cast_');
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
  const popZero = (R) => ['(0a)', '(0b)', '(0c)'].some((id) => { const r = R.find((x) => x.id === id); return !r || !r.ok; });
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const R0 = await run(PORT, null, '(素・基準)');
      const s0 = summarize(R0, '[素・基準]');
      if (popZero(R0)) { console.error('[vet] ⛔ 素で母集団が崩れている ((0a)〜(0c) が赤) — 装置が腐っている'); exitCode = 3; }
      else if (s0.failed || R0.length !== ALL_IDS.length) {
        console.error('[vet] ⛔ 素の基準で FAIL がある / 判定数が合わない — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const R = await run(port, key, '[変異 ' + key + ']');
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const want = NEG_EXPECT[key];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const extra = red.filter((x) => want.indexOf(x) < 0);
          const unexpected = extra.filter((x) => NEG_ALSO[key].indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = miss.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)')
            + (extra.length ? ' / 担当外の赤=' + extra.join(',') + (unexpected.length ? ' (⚠ 実走の記録 NEG_ALSO に無い: ' + unexpected.join(',') + ')' : '') : '')
            + ' → ' + (ok ? '✓ 検出' : '✗ ' + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, red, extra, unexpected, ok });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (担当 ⊆ 赤)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(17) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)') + (r.extra.length ? ' / 担当外 ' + r.extra.join(',') : ''));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当の節が赤');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const R = await run(port, MUTATE, '[変異 ' + MUTATE + ' (手回し)]');
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vet] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)') + ' / 担当 = ' + NEG_EXPECT[MUTATE].join(','));
      exitCode = 0;
    } else {
      const R = await run(PORT, null, '(素)');
      const s = summarize(R, '');
      if (popZero(R)) { console.error('[vet] ⛔ 母集団が崩れている ((0a)〜(0c) が赤)'); exitCode = 3; }
      else exitCode = (s.failed || R.length !== ALL_IDS.length) ? 1 : 0;
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
