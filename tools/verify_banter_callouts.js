#!/usr/bin/env node
/*
 * verify_banter_callouts.js — 実装依頼書 #118「気づいた本人が名前を呼んで伝える」(罠・宝箱・隠し扉・伝承を見つけた本人が
 *   その人の口調で仲間の名前を呼んで知らせ、仲間の HP が減ったら別の仲間が名前を呼ぶ) の受入ドライバ
 *   (依頼書 2026-11-22_banter-callouts.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_banter_callouts.js                         # 素 (port 10891)
 *   node tools/verify_banter_callouts.js --negative              # 素の基準 + 変異 9 本 (port 10892〜10900)
 *   node tools/verify_banter_callouts.js --negative --only norep,callself
 *   node tools/verify_banter_callouts.js --mutate heroname       # 変異 1 本を載せて手回し
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り (担当の節が赤くならない)
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *        または母集団の崩れ ((0b) が素で赤 = castId を持つ仲間が 2 人いない)
 *
 * ■ 方針 (依頼書 §8)
 *   - ゲームを最後まで遊ばせず、本体の関数を**直接呼んで**吹き出しの予約と speechLog を読む。
 *   - 仕込み = sessionStorage["dragonfighters.partyMembers"] に castId 入りの人物 (主人公 + キャスト 3 人) を入れて
 *     index.html?diag=1&scen=goblin-mine&graph=0&autoplay=15 を開き、tryStartEncounter を止めて startGame() (verify_companion_cast と同じ作法)。
 *     人物 (名前・性格・ひと言・variant) は js/companion-cast.js の DFCast を node 側で評価して作る (⛔ 12 人の表を写経しない)。
 *   - 期待値はドライバが自分で計算する (2 経路): キャストの声は**ページの DFCast.byId() の実体から**読み、{to} / {enemy} / {trait} の
 *     差し込みはドライバ側の fillSet で行って「あり得る文の集合」を作る (⛔ §4 の 156 本を写経しない)。
 *     伝承の体質の文は、ログの「📜 …は伝承を思い出した — 名前 (脅威度 X): 体質 / …」の行から**ドライバが切り出す**
 *     (最初の ": " の後ろ・先頭の種類・「、」で割って先頭 2 つ = 依頼書 §12-1 注意 4)。
 *   - 予約の観測は speechQueue.push をその配列 1 本だけ包んで記録する (本番のコードは 1 バイトも変えない。
 *     次のフレームで表示されて行列から消えても、積まれた事実は残る)。表示は speechLog の行 (castId / meta) で見る。
 *   - 乱数は Math.random を seed 付きの擬似乱数 (mulberry32) に差し替えて固定する。伝承の成否だけは出目を定数で固定
 *     (成功 = 0.95 → d20=20 / 失敗 = 0 → d20=1)。
 *   - 判定の結果は**偽の res** を作って applyRoomSearchResult(res, traps, chests, null, doors, unitOf) を呼ぶ。
 *     res.rep は buildPerceptionParty() の**本物の要素**を配列の位置で選び、unitOf は本番 (runRoomSearchCheck) と同じ作り方。
 *   - ⭐ 隠し扉の仕込み = setDoorState / doorLockedByRng をページの中で一時的に差し替え (true / false を返す)、
 *     偽の扉 { id, state: "hidden" } を渡す (依頼書 §8 の「差し替えても構わない」の道。driver_doors_p6 のノード入りは重いので使わない)。
 *   - 伝承は本物の __dfLore.run() を呼ぶ (敵は createEnemy で作り直す)。
 *   - ⛔ 測らないこと (§8): どの行が選ばれるかの偏り・吹き出しの見た目・1 場面あたりの本数。
 *   - ⛔ 本番ファイルに測定シームを足さない (グローバルの読み取り・代入・直叩きだけ)。
 *
 * ■ 計測機構 (verify_companion_cast.js と同型)
 *   - index.html / js/companion-cast.js は起動時に 1 回だけ readFileSync して凍結し、変異はメモリ上で差し替えて配る (ファイルは書き換えない)。
 *   - 変異の注入点は原本でちょうど 1 件・注入文字列が原本に無い・行数不変、を起動時に検算する (空振りの変異 = exit 3)。
 *     さらに (a) 自分のアンカーが他の tools/*.js に出てこない (b) 変異で書き換わる行のコード部分が他ドライバに出てこない。
 *   - --negative の合否 = 「担当 (NEG_EXPECT) ⊆ 実際の赤」。担当外の赤は記録する (NEG_ALSO = 実走の記録・合否には使わない)。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10891** (素) / 変異 **10892〜10900** (MUTATIONS の並び順)。
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
const PORT = parseInt(arg('port', '10891'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const I = 'index.html';
const CC = 'js/companion-cast.js';
const SNAP = [I, CC];
const PRISTINE = {};
for (const f of SNAP) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const EOLS = {};
for (const f of SNAP) EOLS[f] = /\r\n/.test(PRISTINE[f]) ? '\r\n' : '\n';
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[I].indexOf('window.__banter = {') < 0 || PRISTINE[CC].indexOf('voice: { trap: c.voice.trap.slice()') < 0)
  vetFail('#118 項目2 より前のツリーで走らせている (window.__banter / copyOf の voice が無い)');

/* 原本の companion-cast.js を node 側で評価した DFCast (仕込みの人物を作るためだけに使う) */
const NODE_CAST = (() => {
  const sandbox = { location: { search: '' } };
  try { new Function('window', PRISTINE[CC])(sandbox); } catch (e) { vetFail('companion-cast.js を node 側で評価できない: ' + e.message); }
  if (!sandbox.DFCast || typeof sandbox.DFCast.byId !== 'function') vetFail('companion-cast.js から DFCast が作れない');
  return sandbox.DFCast;
})();

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 9 本)。⚠ 行数は変えない (行の中身だけを差し替える)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MUTATIONS = {
  /* 罠A: 探索の話し手を "party" に戻す (= 判定者と話し手の対応を捨てる) */
  norep: [{ file: I,
    from: '      if (!banterOn() || !repUnit) return sayLine(key);            // ?banter=0 / 対応が取れない = 今までどおり (party・汎用)',
    to: '      return sayLine(key); /* ★変異norep */' }],
  /* 罠F: copyOf で voice を落とす (2 行の写しの 1 行目の欄名を変える = voice が undefined) */
  copyvoice: [{ file: CC,
    from: '             voice: { trap: c.voice.trap.slice(), chest: c.voice.chest.slice(), door: c.voice.door.slice(),',
    to: '             _novoice: { trap: c.voice.trap.slice(), chest: c.voice.chest.slice(), door: c.voice.door.slice(), /* ★変異copyvoice */' }],
  /* 罠B: {to} の候補に主人公 (「あなた」) を入れる + 相手が主人公の声掛けでも to を主人公の表示名にする (§12-2 注意 7) */
  heroname: [
    { file: I,
      from: '      for (const a of allies) if (a && a.alive && a !== speaker && a.npcName) names.push(a.npcName);',
      to: '      if (speaker !== "player") names.push(getLeaderName()); for (const a of allies) if (a && a.alive && a !== speaker && a.npcName) names.push(a.npcName); /* ★変異heroname */' },
    { file: I,
      from: '      const to = (target && target !== "player" && target.npcName) ? target.npcName : null;',
      to: '      const to = (target === "player") ? getLeaderName() : ((target && target.npcName) ? target.npcName : null); /* ★変異heroname */' },
  ],
  /* 罠C: 声掛けを combat.lowhp のキーで積む */
  callkey: [{ file: I,
    from: '      return sayLine("ally.call", caller, { text, meta: { scene: "call", to } });',
    to: '      return sayLine("combat.lowhp", caller, { text, meta: { scene: "call", to } }); /* ★変異callkey */' }],
  /* 罠C: speechPrio に ally.call を足さない (= 知らないキーとして 2) */
  callprio2: [{ file: I,
    from: '      if (key === "ally.call") return 1;   // ★#118 仲間の危機の声掛け = combat.lowhp と同じ 1 (罠 C: 足さないと知らないキー = 2)',
    to: '      /* ★変異callprio2 */' }],
  /* 声掛けの話し手に相手本人を許す */
  callself: [{ file: I,
    from: '      for (const a of allies) if (a && a.alive && a.castId && a !== target) pool.push(a);',
    to: '      for (const a of allies) if (a && a.alive && a.castId) pool.push(a); /* ★変異callself */' }],
  /* 罠E: {trait} を差し込まない。⚠ 保険 (差し込み後に "{" が残れば null) も外さないと汎用の行へ倒れて緑のまま (§12-2) */
  rawbrace: [
    { file: I, from: '      if (vars.trait) t = t.split("{trait}").join(vars.trait);', to: '      void 0; /* ★変異rawbrace: {trait} を差し込まない */' },
    { file: I, from: '      return t.indexOf("{") >= 0 ? null : t;', to: '      return t; /* ★変異rawbrace: 保険も外す */' },
  ],
  /* 伝承の吹き出しを種類ごとに出す / 失敗でも出す (成功の枝の 1 回を消し、成否が決まった直後に種類ごとに出す) */
  loreall: [
    { file: I, from: '        const unit = res.rep ? unitOf.get(res.rep) : null;',
      to: '        const unit = res.rep ? unitOf.get(res.rep) : null; for (const t of g.types) sayLoreShare(unit, g.rep[t]); /* ★変異loreall */' },
    { file: I, from: '          sayLoreShare(unit, g.rep[g.types[0]]);   // ★#118 吹き出しは 1 回だけ (先頭の種類・体質は先頭 2 つ)',
      to: '          /* ★変異loreall: 成功の枝の 1 回は消す */' },
  ],
  /* banterOn() が URL を見ずに常に true */
  banterleak: [{ file: I,
    from: '      try { return new URLSearchParams(window.location.search).get("banter") !== "0"; } catch (e) { return true; }',
    to: '      try { return true; /* ★変異banterleak */ } catch (e) { return true; }' }],
};
/* 変異 → 赤くなるべき節 (担当)。依頼書 §8 の表。 */
const NEG_EXPECT = {
  norep: ['(1a)', '(1b)'], copyvoice: ['(0a)', '(1a)'], heroname: ['(1e)', '(3b)'], callkey: ['(3a)', '(3e)'],
  callprio2: ['(3a)'], callself: ['(3a)', '(3c)'], rawbrace: ['(1e)', '(2a)'], loreall: ['(2b)', '(2c)'], banterleak: ['(5a)'],
};
/* 担当外で赤くなると実走で確かめた節 (記録用。⚠ 合否には使わない)。2026-11-22 の --negative 実走の値 (§12-3)。 */
/* - norep → (1c)(1d)(4a): meta が付かない (to が全部 null 扱い) / 主人公の判定も直起動の判定も話し手が party になる
   - copyvoice → (1b)(1c)(2a)(3a)(3b)(3d): voice が無い = 罠・宝箱・隠し扉・伝承が汎用の行に倒れ、声掛けは 1 本も積まれない
   - heroname → (1c): meta.to に「あなた」が入る (判定者以外の仲間の名前ではない)
   - callkey → (3b)(3d): ally.call のキーで積まれないので、主人公の声掛け・ラッチの節も ally.call を 0 本と数える
   - rawbrace → (2d): 主人公の伝承の汎用の行にも {trait} が残る */
const NEG_ALSO = {
  norep: ['(1c)', '(1d)', '(4a)'], copyvoice: ['(1b)', '(1c)', '(2a)', '(3a)', '(3b)', '(3d)'], heroname: ['(1c)'],
  callkey: ['(3b)', '(3d)'], callprio2: [], callself: [], rawbrace: ['(2d)'], loreall: [], banterleak: [],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length !== 9) vetFail('変異は 9 本 (ポート 10892〜10900)');
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
        if (rel === '') rel = I;
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)',
  '(2a)', '(2b)', '(2c)', '(2d)', '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(4a)', '(5a)'];
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
 * 期待値 (ドライバ側の計算 = 2 経路目)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* 行の集合 lines に {to} / {enemy} / {trait} をドライバ自身が差し込んだ「あり得る文」の集合。
   to が null なら {to} を含まない行だけ (依頼書 §4 の規則)。 */
function fillSet(lines, to, vars) {
  vars = vars || {};
  return (lines || []).filter((l) => to || l.indexOf('{to}') < 0).map((l) => {
    let t = l;
    if (to) t = t.split('{to}').join(to);
    if (vars.enemy) t = t.split('{enemy}').join(vars.enemy);
    if (vars.trait) t = t.split('{trait}').join(vars.trait);
    return t;
  });
}
/* ログの成功行「📜 X は伝承を思い出した — 名前 (脅威度 1/4): 体質、体質 / 名前2: …」から、先頭の種類の名前と体質 (先頭 2 つ) を切り出す */
function parseLoreLog(line) {
  const body = (String(line || '').split('伝承を思い出した — ')[1] || '');
  const first = body.split(' / ')[0] || '';
  const ci = first.indexOf(': ');
  if (ci < 0) return null;
  const name = first.slice(0, ci).replace(/ \(脅威度 [^)]*\)$/, '');
  const full = first.slice(ci + 2);
  return { name, full, trait: full.split('、').slice(0, 2).join('、'), parts: full.split('、').length, kinds: body.split(' / ').length };
}

/* 編成: 主人公 + キャスト 3 人 (隊列順 = allies の順)。主人公の職で伝承の判定者が変わる
   (歴史 = 魔法使いだけ / 秘術 = 魔法使い・エルフ)。 */
const ZONE = { warrior: 'front', dwarf: 'front', rogue: 'mid', elf: 'mid', cleric: 'mid', mage: 'rear' };
const PARTY_MAIN = { hero: 'warrior', cast: ['rolf', 'oz', 'jona'] };      // 伝承の判定者 = 歴史・秘術はオズ (魔法使い) / 宗教はヨナ (僧侶)
const LORE_REP_MAIN = { history: 'oz', arcana: 'oz', religion: 'jona' };     // PARTY_MAIN でその技能の習熟を持つのは 1 人だけ (主人公の戦士は持たない)
const PARTY_HEROMAGE = { hero: 'mage', cast: ['irena', 'rolf', 'falke'] }; // 歴史の判定者 = 主人公 (魔法使いは主人公だけ)
function membersOf(party) {
  const out = [{ classKey: party.hero, name: 'あなた', isHero: true, zone: ZONE[party.hero], variant: 0 }];
  for (const id of party.cast) {
    const c = NODE_CAST.byId(id);
    if (!c) vetFail('DFCast.byId(' + id + ') が無い');
    out.push({ classKey: c.classKey, name: c.name, isHero: false, zone: ZONE[c.classKey], variant: c.variant, trait: c.trait, line: c.line, castId: c.id, level: 3 });
  }
  return out;
}
const INDEX_QS = '?diag=1&scen=goblin-mine&graph=0&autoplay=15';

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ内の補助 (各ページで 1 回だけ入れる)。⛔ 本番のコードは書き換えない (配列 1 本の push を包むだけ)。
 * ══════════════════════════════════════════════════════════════════════════════ */
function installHelpers() {
  const R0 = Math.random;
  const sp = (s) => (s === 'player' ? 'player' : s === 'party' ? 'party' : (s && typeof s === 'object') ? (s.castId || ('name:' + (s.npcName || '?'))) : String(s));
  const pushed = [];
  const origPush = speechQueue.push;
  speechQueue.push = function (e) {   // 予約の記録 (表示されて行列から消えても残る)
    try { pushed.push({ key: e.key, text: e.text, sp: sp(e.speaker), prio: e.prio, meta: e.meta ? JSON.parse(JSON.stringify(e.meta)) : null }); } catch (x) {}
    return origPush.apply(this, arguments);
  };
  const units = () => { const u = []; if (hp > 0 && !gameOver) u.push('player'); for (const a of allies) if (a.alive) u.push(a); return u; };
  window.__vb = {
    pushed,
    seed(n) {   // mulberry32
      let s = (n >>> 0) || 1;
      Math.random = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); const u = (t ^ (t >>> 14)) >>> 0; return u / 4294967296; };
    },
    unseed() { Math.random = R0; },
    reset() {
      allies.forEach((a) => { a.alive = true; a.hp = a.maxHp; if (a.buffs) a.buffs.lowHpSpoken = false; a.downSpoken = false; });
      hp = maxHp; gameOver = false;
      if (typeof playerBuffs !== 'undefined' && playerBuffs) playerBuffs.lowHpSpoken = false;
      clearSpeech(); pushed.length = 0;
    },
    info() {
      return { hero: leaderClassKey, allies: allies.map((a) => ({ n: a.npcName, c: a.castId || null, k: a.classKey, alive: a.alive })) };
    },
    /* 探索判定 1 本 (偽の res)。repIdx = buildPerceptionParty() の位置 (0 = 主人公)。kind = trap / chest / door */
    search(repIdx, kind) {
      pushed.length = 0; clearSpeech();
      const party = buildPerceptionParty();
      const us = units();
      const unitOf = new Map(); party.forEach((m, k) => unitOf.set(m, us[k]));   // 本番 (runRoomSearchCheck) と同じ作り方
      const res = { success: true, rep: party[repIdx], total: 25, dc: 10, roll: 20, bonus: 5 };
      const traps = kind === 'trap' ? [{ found: false, triggered: false }] : [];
      const chests = kind === 'chest' ? [{ found: false }] : [];
      let doors = [];
      const sd = setDoorState, dl = doorLockedByRng;
      if (kind === 'door') { doors = [{ id: '__vb_d1', state: 'hidden' }]; setDoorState = function () { return true; }; doorLockedByRng = function () { return false; }; }
      let err = null;
      try { applyRoomSearchResult(res, traps, chests, null, doors, unitOf); } catch (e) { err = String(e && e.message || e); }
      finally { if (kind === 'door') { setDoorState = sd; doorLockedByRng = dl; } }
      const u = us[repIdx];
      return { err, q: pushed.slice(), rep: sp(u),
        others: allies.filter((a) => a.alive && a !== u && a.npcName).map((a) => a.npcName),
        allNames: allies.filter((a) => a.npcName).map((a) => a.npcName) };
    },
    /* 敵を作り直す (伝承用)。返り値 = 添字 */
    makeEnemies(types) {
      /* ⚠ 元からいる敵は倒さない (全滅させるとシナリオがクリアになり、吹き出しの行列が消される)。
         作った敵だけを交戦中 (encounterEnemyIndices) にする。前に作った敵は片付ける */
      for (const i of (window.__vbMade || [])) { const e = enemies[i]; if (e) { e.alive = false; e.hp = 0; } }
      const made = types.map((t, k) => { const idx = enemies.length; const e = createEnemy(t, 5 + k, 5); enemies.push(e); createEnemyDom(idx, e.def, e.type); e.alive = true; e.hp = e.maxHp = 400; return idx; });
      encounterEnemyIndices = made.slice();
      window.__vbMade = made.slice();
      return made;
    },
    /* 本物の __dfLore.run() を、出目を定数 rv に固定して 1 回 */
    async lore(types, rv) {
      this.reset();
      const W = window.__dfLore; W.known.clear(); W.tried.clear(); W.nobodySaid.clear();
      this.makeEnemies(types);
      const infos = []; const ui = window.updateInfo;
      window.updateInfo = function (m) { infos.push(String(m || '')); return ui.apply(this, arguments); };
      const RR = Math.random; Math.random = () => rv; let err = null;
      try { await W.run(); } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
      finally { Math.random = RR; window.updateInfo = ui; }
      for (const i of window.__vbMade) { enemies[i].alive = false; enemies[i].hp = 0; }
      encounterEnemyIndices = [];
      return { err, q: pushed.filter((x) => x.key === 'lore.share'), lines: infos.filter((s) => s.indexOf('📜') >= 0),
        others: allies.filter((a) => a.alive && a.npcName).map((a) => a.npcName) };
    },
    /* 仲間 (添字) か主人公 ('player') の HP を 20% にして updateInfo() → 積まれた予約。続けてもう一度 updateInfo() した分も返す */
    lowhp(target) {
      this.reset();
      updateInfo(); pushed.length = 0;   // 全快の状態で 1 回 (ラッチを外した状態を確定)
      if (target === 'player') hp = Math.max(1, Math.floor(maxHp * 0.2));
      else { const a = allies[target]; a.hp = Math.max(1, Math.floor(a.maxHp * 0.2)); }
      updateInfo();
      const first = pushed.slice();
      pushed.length = 0;
      updateInfo();
      const again = pushed.slice();
      const t = target === 'player' ? null : allies[target];
      return { first, again, targetName: t ? t.npcName : null, target: t ? (t.castId || ('name:' + t.npcName)) : 'player' };
    },
  };
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 1 回分の検査 (素 / 変異で共通)
 * ══════════════════════════════════════════════════════════════════════════════ */
async function runSuite(browser, port) {
  const R = mkResults();
  const ERRS = [];
  let seq = 0;
  const BASE = 'http://127.0.0.1:' + port + '/';
  const sect = async (ids, fn) => {
    try { await fn(); }
    catch (e) { for (const id of ids) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.stack) || e).slice(0, 400)); }
  };
  async function openIndex(party, qs) {
    const page = await browser.newPage();
    const tag = 'P' + port + '_' + (++seq);
    page.on('pageerror', (e) => ERRS.push(tag + (qs || '') + ' PAGEERROR ' + String(e.message).slice(0, 200)));
    await page.setViewport({ width: 1280, height: 900 });
    const members = party ? membersOf(party) : null;
    await page.evaluateOnNewDocument((spec) => {
      try {
        [localStorage, sessionStorage].forEach((st) => {
          const k = []; for (let i = 0; i < st.length; i++) if (st.key(i).indexOf('dragonfighters.') === 0) k.push(st.key(i));
          k.forEach((x) => st.removeItem(x));
        });
        localStorage.setItem('dragonfighters.xp', '45000'); localStorage.setItem('dragonfighters.prologueSeen', '1');
        sessionStorage.setItem('dragonfighters.plazaClock', '21');
        if (spec.members) {
          sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(spec.members));
          sessionStorage.setItem('dragonfighters.partyComposition', JSON.stringify([spec.members[0].classKey]));
        }
      } catch (e) {}
    }, { members });
    await page.goto(BASE + I + INDEX_QS + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => { try { return typeof allies !== 'undefined' && allies.length > 0 && typeof startGame === 'function' && !!window.__banter; } catch (e) { return false; } }, { timeout: 60000 })
      .catch(() => { throw new Error('本体の起動待ち (allies / __banter) が切れた'); });
    await sleep(600);
    await page.evaluate(() => { try { tryStartEncounter = function () {}; } catch (e) {} try { if (!gameStarted) startGame(); } catch (e) {} });   // 戦闘に入らない = 探索のまま
    await page.waitForFunction(() => { try { return gameStarted; } catch (e) { return false; } }, { timeout: 30000 })
      .catch(() => { throw new Error('本体の startGame 待ちが切れた'); });
    await sleep(400);
    await page.evaluate(installHelpers);
    return page;
  }
  const castOf = async (pg, id) => pg.evaluate((id) => DFCast.byId(id), id);
  const lowhpRounds = async (pg) => {
    const rounds = [];
    const n = await pg.evaluate(() => allies.length);
    for (let rep = 0; rep < 4; rep++) {
      for (let k = 0; k < n; k++) rounds.push(await pg.evaluate((k, s) => { __vb.seed(s); try { return __vb.lowhp(k); } finally { __vb.unseed(); } }, k, 1000 + rep * 10 + k));
    }
    return rounds;
  };

  /* ════════ P1: 主人公 = 戦士 + キャスト 3 人 (banter ON) ════════ */
  let LOWHP_ON = null;   // (3e) 用: 声掛けの手順 12 回ぶんの combat.lowhp の本数
  await sect(['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)', '(3a)', '(3b)', '(3c)', '(3d)'], async () => {
    const pg = await openIndex(PARTY_MAIN, '');
    /* §0 装置 */
    const z = await pg.evaluate(() => {
      const cast = DFCast.all();
      const scenes = ['trap', 'chest', 'door', 'lore', 'call'];
      const bad = [];
      for (const c of cast) {
        if (!c.voice) { bad.push(c.id + ':voice無し'); continue; }
        for (const s of scenes) {
          const L = c.voice[s];
          if (!Array.isArray(L) || !L.length) { bad.push(c.id + '.' + s + ':空'); continue; }
          if (!L.some((l) => typeof l === 'string' && l.indexOf('{to}') < 0)) bad.push(c.id + '.' + s + ':{to}無しの行が無い');
        }
      }
      const braces = [];
      for (const k of Object.keys(SPEECH_LINES)) {
        const v = SPEECH_LINES[k];
        if (Array.isArray(v)) v.forEach((l) => { if (typeof l === 'string' && l.indexOf('{') >= 0) braces.push(k + ': ' + l); });
      }
      return { n: cast.length, bad, braces, nKeys: Object.keys(SPEECH_LINES).length, door: SPEECH_LINES['find.door'], info: __vb.info() };
    });
    R.check('(0a)', '[装置] DFCast.all() が 12 人・全員が voice の 5 場面 (trap/chest/door/lore/call) を持ち、どれも 1 本以上・どの場面にも {to} を含まない行が 1 本以上',
      z.n === 12 && z.bad.length === 0, { n: z.n, bad: z.bad.slice(0, 6) });
    const castAllies = z.info.allies.filter((a) => a.c);
    R.check('(0b)', '[装置] 起動後の allies のうち castId を持つ人が 2 人以上 (partyMembers の castId が本体へ届く)',
      castAllies.length >= 2 && z.info.hero === PARTY_MAIN.hero, z.info);
    R.check('(0c)', '[装置] SPEECH_LINES のどの行にも "{" が無い (罠 E)・find.door の汎用の行がある',
      z.braces.length === 0 && z.nKeys > 10 && Array.isArray(z.door) && z.door.length >= 1, { braces: z.braces.slice(0, 4), door: z.door });
    const CAST = {};
    for (const id of PARTY_MAIN.cast) CAST[id] = await castOf(pg, id);
    const vOf = (id, scene) => (CAST[id] && CAST[id].voice && CAST[id].voice[scene]) || null;
    const GENERIC = await pg.evaluate(() => ({ trap: SPEECH_LINES['find.trap'], chest: SPEECH_LINES['find.chest'], door: SPEECH_LINES['find.door'] }));

    /* §1 探索判定: 判定者 = キャストの仲間 (party の 1〜3 番) */
    const finds = { trap: [], chest: [], door: [] };
    for (const kind of ['trap', 'chest', 'door']) {
      for (let k = 1; k <= 3; k++) {
        const r = await pg.evaluate((k, kind, s) => { __vb.reset(); __vb.seed(s); try { return __vb.search(k, kind); } finally { __vb.unseed(); } }, k, kind, 200 + k * 7 + kind.length);
        const e = r.q.filter((x) => x.key === 'find.' + kind);
        const last = e[e.length - 1] || null;
        const want = last && last.meta ? fillSet(vOf(r.rep, kind), last.meta.to) : [];
        finds[kind].push({ k, rep: r.rep, n: e.length, e: last, err: r.err, others: r.others, allNames: r.allNames,
          ok: !r.err && e.length === 1 && !!last && last.sp === r.rep && !!CAST[r.rep] && !!last.meta && last.meta.scene === kind && want.indexOf(last.text) >= 0 });
      }
    }
    const brief = (x) => ({ rep: x.rep, n: x.n, sp: x.e && x.e.sp, text: x.e && x.e.text, meta: x.e && x.e.meta, err: x.err });
    R.check('(1a)', '判定者 = キャストの仲間 (3 人それぞれ) で罠を見つける → find.trap の予約が 1 本・話し手 = 判定者の castId・文 = その人の voice.trap に meta.to をドライバが差し込んだもののどれか',
      finds.trap.every((x) => x.ok), finds.trap.map(brief));
    R.check('(1b)', '同じことを宝箱 (find.chest / voice.chest) と隠し扉 (find.door / voice.door) で',
      finds.chest.every((x) => x.ok) && finds.door.every((x) => x.ok), ['chest', 'door'].map((k) => finds[k].map(brief)));
    /* (1c) meta.to の母集団 + null の枝 (相手が誰もいない = 他の仲間を倒れたことにする) */
    const all9 = [].concat(finds.trap, finds.chest, finds.door);
    const toOk = all9.every((x) => x.e && x.e.meta && (x.e.meta.to === null ? x.allNames.every((n) => x.e.text.indexOf(n) < 0)
      : (x.others.indexOf(x.e.meta.to) >= 0 && (!CAST[x.rep] || x.e.meta.to !== CAST[x.rep].name))));
    const solo = await pg.evaluate((s) => {
      __vb.reset(); allies.forEach((a, k) => { if (k !== 1) a.alive = false; });
      __vb.seed(s);
      const out = [];
      try { for (const kind of ['trap', 'chest', 'door']) { const r = __vb.search(1, kind); out.push({ kind, e: r.q.filter((x) => x.key === 'find.' + kind)[0] || null, allNames: r.allNames }); } }
      finally { __vb.unseed(); __vb.reset(); }
      return out;
    }, 77);
    const soloRep = PARTY_MAIN.cast[1];
    const soloOk = solo.every((x) => x.e && x.e.meta && x.e.meta.to === null && x.e.sp === soloRep
      && x.allNames.filter((n) => n !== CAST[soloRep].name).every((n) => x.e.text.indexOf(n) < 0)
      && fillSet(vOf(soloRep, x.kind), null).indexOf(x.e.text) >= 0);
    R.check('(1c)', 'meta.to は判定者以外の生きた仲間の npcName のどれか (本人の名前ではない)、または null。null (他に生きた仲間がいない) のときは文に他人の名前が無く {to} の無い行',
      toOk && soloOk, { tos: all9.map((x) => x.e && x.e.meta && x.e.meta.to), solo: solo.map((x) => ({ kind: x.kind, e: x.e })) });
    /* (1d) 判定者 = 主人公 */
    const hero = await pg.evaluate((s) => { __vb.reset(); __vb.seed(s); try { return __vb.search(0, 'trap'); } finally { __vb.unseed(); } }, 31);
    const he = hero.q.filter((x) => x.key === 'find.trap');
    R.check('(1d)', '判定者 = 主人公 → find.trap の話し手 = player、文は SPEECH_LINES["find.trap"] のどれか',
      !hero.err && he.length === 1 && he[0].sp === 'player' && GENERIC.trap.indexOf(he[0].text) >= 0, { e: he, err: hero.err });
    /* (1e) 判定者を変えて 30 回 (罠・宝箱・隠し扉 + 伝承の吹き出し sayLoreShare を回す) → 「あなた」も "{" も無い */
    const e30 = await pg.evaluate(() => {
      const texts = []; const errs = [];
      const idx = __vb.makeEnemies(['goblin']); const enemy = enemies[idx[0]];
      for (let i = 0; i < 30; i++) {
        __vb.reset(); __vb.seed(5000 + i);
        try {
          const nUnits = 1 + allies.filter((a) => a.alive).length;
          const repIdx = i % nUnits;
          const scene = ['trap', 'chest', 'door', 'lore'][Math.floor(i / nUnits) % 4];
          if (scene === 'lore') {
            const us = []; if (hp > 0 && !gameOver) us.push('player'); for (const a of allies) if (a.alive) us.push(a);
            __banter.lore(us[repIdx], enemy);
          } else { const r = __vb.search(repIdx, scene); if (r.err) errs.push(r.err); }
          __vb.pushed.forEach((x) => texts.push({ i, repIdx, scene, key: x.key, text: x.text }));
        } finally { __vb.unseed(); }
      }
      for (const i of window.__vbMade) { enemies[i].alive = false; enemies[i].hp = 0; }
      encounterEnemyIndices = [];
      return { texts, errs };
    });
    const scenesSeen = Array.from(new Set(e30.texts.map((x) => x.scene)));
    const badE = e30.texts.filter((x) => x.text.indexOf('あなた') >= 0 || x.text.indexOf('{') >= 0);
    R.check('(1e)', '判定者を変えて 30 回 (罠・宝箱・隠し扉・伝承) → どの文にも「あなた」が無い (罠 B)・"{" が無い (罠 E)',
      e30.texts.length >= 30 && scenesSeen.length === 4 && badE.length === 0 && e30.errs.length === 0, { n: e30.texts.length, scenes: scenesSeen, bad: badE.slice(0, 4), errs: e30.errs.slice(0, 2) });

    /* §2 伝承 (本物の __dfLore.run)。(2a) の敵 = 歴史 / 秘術 / 宗教の種類のうち、体質の文がいちばん長い種類 (先頭 2 つの切り出しが効く) */
    const pick = await pg.evaluate((REPS) => {
      const cands = [];
      for (const t of Object.keys(window.__dfLore.skillOf)) {
        const sk = window.__dfLore.skillOf[t];
        if (!REPS[sk] || !ENEMY_TYPES[t] || !ENEMY_TYPES[t].name) continue;
        try { const e = createEnemy(t, 5, 5); cands.push({ t, sk, n: loreTraitText(e).split('、').length }); } catch (x) {}
      }
      cands.sort((a, b) => b.n - a.n);
      return cands.slice(0, 3);
    }, LORE_REP_MAIN);
    const loreType = pick[0] ? pick[0].t : 'goblin';
    const L1 = await pg.evaluate((t) => __vb.lore([t], 0.95), loreType);
    const succ = L1.lines.find((s) => s.indexOf('伝承を思い出した — ') >= 0) || '';
    const pl = parseLoreLog(succ);
    const ozId = LORE_REP_MAIN[pick[0] ? pick[0].sk : 'history'];   // その技能の判定者 (習熟を持つのは 1 人)
    const s0 = L1.q[0] || null;
    const wantL = (s0 && pl) ? fillSet(vOf(ozId, 'lore'), s0.meta && s0.meta.to, { enemy: pl.name, trait: pl.trait }) : [];
    R.check('(2a)', '判定者 = キャストの仲間 (体質の文がいちばん長い種類の技能を持つ 1 人) で成功 → lore.share が 1 本・話し手 = その castId・meta.enemy = ログの名前・meta.trait = ログの行から切り出した体質の先頭 2 つ (2 経路)・文に両方を含み、voice.lore にドライバが差し込んだもののどれか (⚠ 体質が 3 つ以上の種類で測る = ログには 3 つ・吹き出しには 2 つ)',
      !L1.err && !!pl && pl.parts >= 3 && L1.q.length === 1 && s0.sp === ozId && !!s0.meta && s0.meta.scene === 'lore' && s0.meta.enemy === pl.name && s0.meta.trait === pl.trait
        && s0.text.indexOf(pl.name) >= 0 && s0.text.indexOf(pl.trait) >= 0 && wantL.indexOf(s0.text) >= 0 && (s0.meta.to === null || L1.others.indexOf(s0.meta.to) >= 0),
      { type: loreType, cands: pick, log: succ, parsed: pl, q: L1.q, err: L1.err });
    const L2 = await pg.evaluate(() => __vb.lore(['goblin'], 0));
    const fails = L2.lines.filter((s) => s.indexOf('思い出せない') >= 0);
    R.check('(2b)', '失敗 (出目 1) → lore.share は 0 本・ログの「思い出せない」は 1 行',
      !L2.err && L2.q.length === 0 && fails.length === 1, { q: L2.q, lines: L2.lines, err: L2.err });
    const L3 = await pg.evaluate(() => __vb.lore(['goblin', 'kobold'], 0.95));
    const succ3 = L3.lines.find((s) => s.indexOf('伝承を思い出した — ') >= 0) || '';
    const pl3 = parseLoreLog(succ3);
    R.check('(2c)', '種類が 2 つの戦い (ゴブリン + コボルド = 同じ歴史の組) で成功 → lore.share は 1 本だけ・先頭の種類 (ログの 1 つ目)',
      !L3.err && !!pl3 && pl3.kinds === 2 && L3.q.length === 1 && !!L3.q[0].meta && L3.q[0].meta.enemy === pl3.name, { log: succ3, parsed: pl3, q: L3.q, err: L3.err });

    /* §3 声掛け */
    const rounds = await lowhpRounds(pg);
    LOWHP_ON = rounds.reduce((s, r) => s + r.first.filter((x) => x.key === 'combat.lowhp').length, 0);
    const a3 = rounds.map((r) => {
      const low = r.first.filter((x) => x.key === 'combat.lowhp');
      const call = r.first.filter((x) => x.key === 'ally.call');
      const c = call[0] || null;
      const want = c ? fillSet(vOf(c.sp, 'call'), r.targetName) : [];
      return { target: r.target, low: low.map((x) => x.sp), call: call.map((x) => ({ sp: x.sp, prio: x.prio, text: x.text, meta: x.meta })),
        named: !!c && c.text.indexOf(r.targetName) >= 0,
        ok: low.length === 1 && low[0].sp === r.target && call.length === 1 && !!CAST[c.sp] && c.sp !== r.target && c.prio === 1
          && !!c.meta && c.meta.scene === 'call' && c.meta.to === r.targetName && want.indexOf(c.text) >= 0 };
    });
    /* 表示: {to} を含む行が選ばれる seed を探して 1 回だけ待ち、speechLog の行を見る
       (⚠ voice.call には {to} を含まない行もあり、相手が仲間でもそれが選ばれ得る = §4 の規則どおり。名前が入るのは {to} の行のとき) */
    const shown = await pg.evaluate(async () => {
      let r = null, seed = 0;
      for (seed = 4242; seed < 4282; seed++) {
        __vb.seed(seed);
        try { r = __vb.lowhp(0); } finally { __vb.unseed(); }
        const c = r.first.find((x) => x.key === 'ally.call');
        if (c && r.targetName && c.text.indexOf(r.targetName) >= 0) break;
      }
      const mark = Date.now() - 1;
      let row = null;
      const tl = [];
      for (let i = 0; i < 80 && !row; i++) { await new Promise((z) => setTimeout(z, 100)); tl.push((Date.now() - mark) + ':' + speechQueue.map((x) => x.key + '/' + (x.dropAfter - Date.now())).join(',') + '|b' + speechBubbles.length); row = __speech.log.slice().reverse().find((x) => x.key === 'ally.call' && x.at >= mark) || null; }
      return { row, seed, tl: tl.filter((x, i) => i % 3 === 0).slice(0, 30), queued: r && r.first.map((x) => x.key + ':' + x.text), targetName: r && r.targetName,
        dbg: { q: speechQueue.map((x) => x.key), b: speechBubbles.length, log: __speech.log.slice(-4).map((x) => x.key + '@' + (x.at - mark)), ph: currentPhase, dp: dialogPaused, go: gameOver } };
    });
    R.check('(3a)', 'キャストの仲間 A の HP を 20% にして updateInfo (各仲間 × 4 回) → combat.lowhp (話し手 A) と ally.call (話し手 = A 以外のキャスト・優先度 1・meta.to = A の名前) が 1 本ずつ・文は話し手の voice.call に A の名前を差し込んだもの。表示した ally.call の行の文に A の npcName',
      a3.length >= 12 && a3.every((x) => x.ok) && a3.some((x) => x.named) && !!shown.row && shown.row.text.indexOf(shown.targetName) >= 0 && !!shown.row.castId && !!shown.row.meta && shown.row.meta.to === shown.targetName,
      { bad: a3.filter((x) => !x.ok).slice(0, 3), n: a3.length, named: a3.filter((x) => x.named).length, shown });
    const hb = [];
    for (let i = 0; i < 6; i++) hb.push(await pg.evaluate((s) => { __vb.seed(s); try { return __vb.lowhp('player'); } finally { __vb.unseed(); } }, 600 + i));
    const b3 = hb.map((r) => {
      const call = r.first.filter((x) => x.key === 'ally.call'); const c = call[0] || null;
      return { call, ok: call.length === 1 && !!CAST[c.sp] && !!c.meta && c.meta.to === null && c.text.indexOf('あなた') < 0 && c.text.indexOf('{') < 0 && fillSet(vOf(c.sp, 'call'), null).indexOf(c.text) >= 0 };
    });
    R.check('(3b)', '主人公の HP を 20% に (6 回) → ally.call が 1 本・meta.to = null・文は話し手の voice.call の {to} を含まない行のどれか (「あなた」が無い)',
      b3.every((x) => x.ok), { bad: b3.filter((x) => !x.ok).slice(0, 3), sample: b3[0] && b3[0].call });
    const only = [];
    for (let k = 0; k < 3; k++) {
      only.push(await pg.evaluate((k, s) => {
        const keep = allies.map((a) => a.castId);
        allies.forEach((a, j) => { if (j !== k) a.castId = null; });
        __vb.seed(s);
        try { return __vb.lowhp(k); } finally { __vb.unseed(); allies.forEach((a, j) => { a.castId = keep[j]; }); }
      }, k, 700 + k));
    }
    R.check('(3c)', 'castId を持つ生きた仲間が相手 A だけ (3 人それぞれ) → ally.call は 0 本 (combat.lowhp は 1 本)',
      only.every((r) => r.first.filter((x) => x.key === 'ally.call').length === 0 && r.first.filter((x) => x.key === 'combat.lowhp').length === 1),
      only.map((r) => r.first.map((x) => x.key + ':' + x.sp)));
    const d3 = await pg.evaluate((s) => {
      __vb.seed(s);
      try {
        const r = __vb.lowhp(0);
        const a = allies[0];
        a.hp = a.maxHp; __vb.pushed.length = 0; updateInfo();          // 全快 (ラッチが外れる)
        const healed = __vb.pushed.slice();
        __vb.pushed.length = 0; a.hp = Math.max(1, Math.floor(a.maxHp * 0.2)); updateInfo();
        return { first: r.first.filter((x) => x.key === 'ally.call').length, again: r.again.filter((x) => x.key === 'ally.call').length,
          healed: healed.filter((x) => x.key === 'ally.call').length, rearmed: __vb.pushed.filter((x) => x.key === 'ally.call').length };
      } finally { __vb.unseed(); }
    }, 800);
    R.check('(3d)', 'もう一度 updateInfo → ally.call は増えない (ラッチ) / 全快してからまた 20% → もう 1 本',
      d3.first === 1 && d3.again === 0 && d3.healed === 0 && d3.rearmed === 1, d3);
    await pg.close();
  });

  /* ════════ P2: 主人公 = 魔法使い (歴史の判定者 = 主人公) ════════ */
  await sect(['(2d)'], async () => {
    const pg = await openIndex(PARTY_HEROMAGE, '');
    const LORE_LINES = await pg.evaluate(() => __banter.loreLines.slice());
    const L = await pg.evaluate(() => __vb.lore(['goblin'], 0.95));
    const succ = L.lines.find((s) => s.indexOf('伝承を思い出した — ') >= 0) || '';
    const pl = parseLoreLog(succ);
    const s0 = L.q[0] || null;
    const want = pl ? fillSet(LORE_LINES, null, { enemy: pl.name, trait: pl.trait }) : [];
    R.check('(2d)', '判定者 = 主人公 (魔法使い) で成功 → lore.share が 1 本・話し手 player・文は LORE_SHARE_LINES にログから切り出した名前と体質を差し込んだもののどれか',
      !L.err && !!pl && L.q.length === 1 && s0.sp === 'player' && want.indexOf(s0.text) >= 0 && !!s0.meta && s0.meta.to === null && LORE_LINES.length >= 1,
      { log: succ, parsed: pl, q: L.q, err: L.err, hero: await pg.evaluate(() => leaderClassKey) });
    await pg.close();
  });

  /* ════════ P3: ?banter=0 (同じ編成) ════════ */
  await sect(['(3e)', '(5a)'], async () => {
    const pg = await openIndex(PARTY_MAIN, '&banter=0');
    const GENERIC = await pg.evaluate(() => ({ trap: SPEECH_LINES['find.trap'] }));
    const rounds = await lowhpRounds(pg);
    const lowOff = rounds.reduce((s, r) => s + r.first.filter((x) => x.key === 'combat.lowhp').length, 0);
    const callOff = rounds.reduce((s, r) => s + r.first.filter((x) => x.key === 'ally.call').length, 0);
    R.check('(3e)', 'combat.lowhp の本数 (声掛けの手順 12 回) が ?banter=0 の腕と同じ (罠 C)',
      LOWHP_ON !== null && LOWHP_ON === lowOff && lowOff === rounds.length, { on: LOWHP_ON, off: lowOff, rounds: rounds.length });
    const t = await pg.evaluate((s) => { __vb.reset(); __vb.seed(s); try { return __vb.search(1, 'trap'); } finally { __vb.unseed(); } }, 91);
    const d = await pg.evaluate((s) => { __vb.reset(); __vb.seed(s); try { return __vb.search(1, 'door'); } finally { __vb.unseed(); } }, 92);
    const L = await pg.evaluate(() => __vb.lore(['goblin'], 0.95));
    const et = t.q.filter((x) => x.key === 'find.trap');
    const loreOk = L.lines.some((s) => s.indexOf('伝承を思い出した') >= 0);
    R.check('(5a)', '?banter=0 → 罠の予約の speaker === "party"・汎用の行・meta 無し / 隠し扉の吹き出し 0 本 / 伝承 (成功) の吹き出し 0 本 / ally.call 0 本',
      et.length === 1 && et[0].sp === 'party' && GENERIC.trap.indexOf(et[0].text) >= 0 && et[0].meta === null
        && d.q.filter((x) => x.key === 'find.door').length === 0 && loreOk && L.q.length === 0 && callOff === 0,
      { trap: et, door: d.q, lore: { q: L.q, ok: loreOk }, callOff });
    await pg.close();
  });

  /* ════════ P4: 直起動 (castId 無し) ════════ */
  await sect(['(4a)'], async () => {
    const pg = await openIndex(null, '');
    const info = await pg.evaluate(() => __vb.info());
    const GENERIC = await pg.evaluate(() => ({ trap: SPEECH_LINES['find.trap'] }));
    const t = await pg.evaluate((s) => { __vb.reset(); __vb.seed(s); try { return __vb.search(1, 'trap'); } finally { __vb.unseed(); } }, 41);
    const rounds = [];
    for (let k = 0; k < info.allies.length; k++) rounds.push(await pg.evaluate((k, s) => { __vb.seed(s); try { return __vb.lowhp(k); } finally { __vb.unseed(); } }, k, 50 + k));
    const et = t.q.filter((x) => x.key === 'find.trap');
    const calls = rounds.reduce((s, r) => s + r.first.filter((x) => x.key === 'ally.call').length, 0);
    const lows = rounds.reduce((s, r) => s + r.first.filter((x) => x.key === 'combat.lowhp').length, 0);
    R.check('(4a)', '直起動 (castId 無し) で罠を見つける → 話し手 = 判定者 (仲間)・文は SPEECH_LINES["find.trap"] のどれか / 仲間の HP が減っても ally.call は 0 本 (combat.lowhp は出る)',
      info.allies.length >= 1 && info.allies.every((a) => !a.c) && et.length === 1 && et[0].sp === t.rep && t.rep !== 'party' && t.rep !== 'player'
        && GENERIC.trap.indexOf(et[0].text) >= 0 && calls === 0 && lows === rounds.length,
      { allies: info.allies, trap: et, rep: t.rep, calls, lows });
    await pg.close();
  });

  R.check('(0d)', '[装置] 全ページで pageerror 0 件', ERRS.length === 0, ERRS.slice(0, 5));
  for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(判定が出ていない)', false, '');
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_banter_callouts_');
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
  const popZero = (R) => ['(0b)'].some((id) => { const r = R.find((x) => x.id === id); return !r || !r.ok; });
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const R0 = await run(PORT, null, '(素・基準)');
      const s0 = summarize(R0, '[素・基準]');
      if (popZero(R0)) { console.error('[vet] ⛔ 素で母集団が崩れている ((0b) が赤) — 装置が腐っている'); exitCode = 3; }
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
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(11) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)') + (r.extra.length ? ' / 担当外 ' + r.extra.join(',') : ''));
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
      if (popZero(R)) { console.error('[vet] ⛔ 母集団が崩れている ((0b) が赤)'); exitCode = 3; }
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
