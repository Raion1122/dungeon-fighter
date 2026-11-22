#!/usr/bin/env node
/*
 * verify_path_advice.js — 実装依頼書 #119「分かれ道で仲間が道を勧め、主人公が返事をする」の受入ドライバ
 *   (依頼書 2026-11-22_path-advice.md §8。§8 の `__graph.*` は §12-1 注意 1 のとおり `window.__graphRun.*` と読む)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_path_advice.js                          # 素 (port 10901)
 *   node tools/verify_path_advice.js --negative               # 素の基準 + 変異 10 本 (port 10902〜10911)
 *   node tools/verify_path_advice.js --negative --only zero,again
 *   node tools/verify_path_advice.js --mutate truekind        # 変異 1 本を載せて手回し
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り (担当の節が赤くならない)
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *        または母集団の崩れ ((0a)(0b)(0c) が素で赤 = 出口 2 本 / castId の仲間 2 人 / 見えている順位と本当の順位が食い違う盤面 が無い)
 *
 * ■ 方針 (依頼書 §8)
 *   - ゲームを最後まで遊ばせず、分かれ道の部屋 (graphtest の n0) で本体の入口 window.__graphRun.choose() (= chooseExit) を
 *     直接叩き、#choiceDialog の DOM・window.__advice.log・吹き出しの予約 (speechQueue.push の記録)・__speech.log を読む。
 *   - 起動 = /index.html?diag=1&graphtest=1&secret=0 (driver_graph_arrows の QT と同じ作法)。⚠ ?autoplay を付けない (付けると勧めが出ない)。
 *     sessionStorage["dragonfighters.partyMembers"] に castId 入りの人物 (主人公 = 戦士 + キャスト 3 人) を入れる。
 *     人物は js/companion-cast.js の DFCast を node 側で評価して作る (⛔ 12 人の表を写経しない)。
 *   - 期待値はドライバが自分で計算する (2 経路):
 *       勧める出口 = hints().byExit の「見えている kind」をドライバ自身の順位表 (依頼書 §5-3 (b)) で選び直したもの。
 *       文 = ページの DFCast.byId() の実体の advise / yes / no に、ドライバ自身の方角の語 (§2-9) と hint の切り出しを差し込んだ「あり得る文の集合」。
 *       (1a) の判定者 = SkillCheck.resolveSkillCheck を包んで受け取った party と res.rep を、ドライバが同じ並び (生きている主人公 → 生きている仲間) で本物へ戻したもの。
 *     ⛔ §4 の 72 本を写経しない。
 *   - 結果の段階は __graphRun.reveal(tier) で作り、勧める人は __advice.setBy(castId) で入れる。実際の判定から入る経路は (1a)(1b)(5b) だけ。
 *   - 乱数は Math.random を seed 付き (mulberry32) に差し替えて固定する。(1a) の本物の判定だけは出目を 0.97 に固定。
 *   - ⚠ __advice.log の行は返事の後に積まれる (ダイアログが開いている間は増えない)。⚠ 矢印は ARROW_TAP_GATE (500ms) の間は Esc が効かない
 *     ⇒ 矢印を閉じるときは 700ms 待ってから Esc。次の choose() の前に必ず前の choose() を解決させる (settle)。
 *   - ⛔ 測らないこと (§8): どの行が選ばれるかの偏り・吹き出しやダイアログの見た目・時間切れの長さそのもの・勧めに従った先で何が起きるか。
 *   - ⛔ 本番ファイルに測定シームを足さない (グローバルの読み取り・代入・直叩き・SkillCheck の関数 1 本と speechQueue.push の包みだけ)。
 *
 * ■ 計測機構 (verify_banter_callouts.js と同型)
 *   - index.html / js/companion-cast.js は起動時に 1 回だけ readFileSync して凍結し、変異はメモリ上で差し替えて配る (ファイルは書き換えない)。
 *   - 変異の注入点は原本でちょうど 1 件・注入文字列が原本に無い・行数不変、を起動時に検算する (空振りの変異 = exit 3)。
 *     さらに (a) 自分のアンカーが他の tools/*.js に出てこない (b) 変異で書き換わる行のコード部分が他ドライバに出てこない。
 *   - --negative の合否 = 「担当 (NEG_EXPECT) ⊆ 実際の赤」。担当外の赤は記録する (NEG_ALSO = 実走の記録・合否には使わない)。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10901** (素) / 変異 **10902〜10911** (MUTATIONS の並び順)。
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
const PORT = parseInt(arg('port', '10901'), 10);
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
if (PRISTINE[I].indexOf('window.__advice = {') < 0 || PRISTINE[CC].indexOf('advise: c.voice.advise.slice()') < 0)
  vetFail('#119 項目2 より前のツリーで走らせている (window.__advice / copyOf の advise が無い)');

/* 原本の companion-cast.js を node 側で評価した DFCast (仕込みの人物を作るためだけに使う) */
const NODE_CAST = (() => {
  const sandbox = { location: { search: '' } };
  try { new Function('window', PRISTINE[CC])(sandbox); } catch (e) { vetFail('companion-cast.js を node 側で評価できない: ' + e.message); }
  if (!sandbox.DFCast || typeof sandbox.DFCast.byId !== 'function') vetFail('companion-cast.js から DFCast が作れない');
  return sandbox.DFCast;
})();

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。⚠ 行数は変えない (行の中身だけを差し替える)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MUTATIONS = {
  /* 勧めを `if (!window.__autoplay)` の外へ出す (RUN.auto の後・矢印の if の前) */
  autoplay: [{ file: I,
    from: '      if (!window.__autoplay) { const advised = await offerPathAdvice(node, opts); if (advised) return advised; }',
    to: '      { const advised = await offerPathAdvice(node, opts); if (advised) return advised; } /* ★変異autoplay */' }],
  /* 罠B: autoSkipTo を `||` で読む (添字 0 が null = キャンセルへ倒れる) */
  zero: [{ file: I,
    from: '        const autoSkipTo = (opts && Number.isInteger(opts.autoSkipTo)) ? opts.autoSkipTo : null;   // ★#119',
    to: '        const autoSkipTo = (opts && opts.autoSkipTo) || null; /* ★変異zero */' }],
  /* 罠A: 勧めの文を吹き出しで出し、ダイアログの文面は「分かれ道だ。」 */
  bubble: [{ file: I,
    from: '      const msg = advisor.npcName + "「" + text + "」";          // ⚠ 罠 A: 吹き出しではなくダイアログの文面',
    to: '      const msg = "分かれ道だ。"; sayLine("advice.say", advisor, { text }); /* ★変異bubble */' }],
  /* 罠C: 写し (res.rep) から castId を直接引く */
  copyrep: [{ file: I,
    from: '          st.adviceBy = (repUnit && repUnit !== "player" && repUnit.castId) ? repUnit.castId : null;',
    to: '          st.adviceBy = (res && res.rep && res.rep.castId) || null; /* ★変異copyrep */' }],
  /* 罠E: copyOf から advise を落とす */
  copyof: [{ file: CC,
    from: '                      advise: c.voice.advise.slice(), yes: c.voice.yes.slice(), no: c.voice.no.slice() } };',
    to: '                      yes: c.voice.yes.slice(), no: c.voice.no.slice() } }; /* ★変異copyof */' }],
  /* 罠D: 順位を本当の行き先の kind で付ける */
  truekind: [{ file: I,
    from: '        const r = ADVICE_KIND_RANK[h.kind];',
    to: '        const r = ADVICE_KIND_RANK[(RUN.byId[o.to] || {}).kind]; /* ★変異truekind */' }],
  /* kind が null (fail のぼかした文) の出口も順位 0 として残す */
  failadvise: [{ file: I,
    from: '        if (!h || !h.kind) continue;                             // fail = ぼかした文 (kind: null) は勧めない',
    to: '        if (!h) continue; { const r0 = h.kind ? ADVICE_KIND_RANK[h.kind] : 0; if (r0 !== undefined && r0 > bestRank) { best = o; bestRank = r0; } } continue; /* ★変異failadvise */' }],
  /* 訪れた出口を候補から外さない */
  seen: [{ file: I,
    from: '      const cands = opts.filter(o => o && !o.back && !o.spot && !(nodeState[o.to] && nodeState[o.to].visited));',
    to: '      const cands = opts.filter(o => o && !o.back && !o.spot); /* ★変異seen */' }],
  /* 1 部屋 1 回の印を書かない */
  again: [{ file: I,
    from: '      st.adviceDone = true;                                      // 出したら返事に関係なく 1 回で終わり',
    to: '      void 0; /* ★変異again */' }],
  /* adviceOn() が URL を見ずに常に true */
  switch: [{ file: I,
    from: '      try { return new URLSearchParams(window.location.search).get("advise") !== "0"; } catch (e) { return true; }',
    to: '      try { return true; /* ★変異switch */ } catch (e) { return true; }' }],
};
/* 変異 → 赤くなるべき節 (担当)。依頼書 §8 の表。 */
const NEG_EXPECT = {
  autoplay: ['(5a)'], zero: ['(3b)'], bubble: ['(2a)'], copyrep: ['(1a)'], copyof: ['(0d)', '(2a)'],
  truekind: ['(2c)'], failadvise: ['(2d)'], seen: ['(2e)'], again: ['(4a)'], switch: ['(6a)'],
};
/* 担当外で赤くなると実走で確かめた節 (記録用。⚠ 合否には使わない)。依頼書 §12-3 の --negative 実走の値。 */
const NEG_ALSO = {
  autoplay: [], zero: [], bubble: [], copyrep: [],
  copyof: ['(2b)', '(2c)', '(2e)', '(2f)', '(3a)', '(3b)', '(3c)', '(4a)'],
  truekind: [], failadvise: [], seen: [], again: [], switch: [],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length !== 10) vetFail('変異は 10 本 (ポート 10902〜10911)');
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(0e)', '(1a)', '(1b)',
  '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(5a)', '(5b)', '(6a)'];
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
 * 期待値 (ドライバ側の計算 = 2 経路目)。依頼書 §5-3 (b) / §2-9 の規則をドライバが自分で持つ。
 * ══════════════════════════════════════════════════════════════════════════════ */
const RANK = { loot: 5, rest: 4, search: 3, event: 2, combat: 1, boss: 0 };   // 見えている kind の順位 (start は候補にしない)
const DIRW = { up: '奥', down: '手前', left: '西', right: '東' };            // {dir} の 1 語
const hintCore = (text) => String(text || '').split(' — ')[0].replace(/。$/, '');
/* advise の行の集合に {dir} / {hint} を差し込んだ「あり得る文」の集合 (fillVoice は {to} の無い行だけを引く) */
function adviseSet(lines, dir, hintText) {
  return (lines || []).filter((l) => l.indexOf('{to}') < 0).map((l) => l.split('{dir}').join(DIRW[dir]).split('{hint}').join(hintCore(hintText)));
}

/* 編成: 主人公 = 戦士 (知覚がいちばん低い) + キャスト 3 人 (隊列順 = allies の順) */
const ZONE = { warrior: 'front', dwarf: 'front', rogue: 'mid', elf: 'mid', cleric: 'mid', mage: 'rear' };
const PARTY_MAIN = { hero: 'warrior', cast: ['falke', 'rasmussen', 'irena'] };
function membersOf(party) {
  const out = [{ classKey: party.hero, name: 'あなた', isHero: true, zone: ZONE[party.hero], variant: 0 }];
  for (const id of party.cast) {
    const c = NODE_CAST.byId(id);
    if (!c) vetFail('DFCast.byId(' + id + ') が無い');
    out.push({ classKey: c.classKey, name: c.name, isHero: false, zone: ZONE[c.classKey], variant: c.variant, trait: c.trait, line: c.line, castId: c.id, level: 3 });
  }
  return out;
}
const INDEX_QS = '?diag=1&graphtest=1&secret=0';

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ内の補助 (各ページで 1 回だけ入れる)。⛔ 本番のコードは書き換えない (配列 1 本の push を包むだけ)。
 * ══════════════════════════════════════════════════════════════════════════════ */
function installHelpers(RANK) {
  const R0 = Math.random;
  const sp = (s) => (s === 'player' ? 'player' : s === 'party' ? 'party' : (s && typeof s === 'object') ? (s.castId || ('name:' + (s.npcName || '?'))) : String(s));
  const pushed = [];
  const origPush = speechQueue.push;
  speechQueue.push = function (e) {   // 予約の記録 (表示されて行列から消えても残る)
    try { pushed.push({ key: e.key, text: e.text, sp: sp(e.speaker), prio: e.prio, meta: e.meta ? JSON.parse(JSON.stringify(e.meta)) : null }); } catch (x) {}
    return origPush.apply(this, arguments);
  };
  const W = {
    pushed, done: true, pick: undefined, t0: 0, t1: 0, err: null,
    seed(n) {   // mulberry32
      let s = (n >>> 0) || 1;
      Math.random = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); const u = (t ^ (t >>> 14)) >>> 0; return u / 4294967296; };
    },
    unseed() { Math.random = R0; },
    /* 本番の入口 chooseExit を開く (解決は後で W.done / W.pick を読む) */
    open() {
      W.done = false; W.pick = undefined; W.err = null; W.t0 = Date.now(); W.t1 = 0;
      window.__graphRun.choose().then((v) => { W.pick = v ? v.to : null; W.t1 = Date.now(); W.done = true; },
        (e) => { W.err = String((e && e.stack) || e).slice(0, 300); W.t1 = Date.now(); W.done = true; });
      return true;
    },
    snap() {
      const d = document.getElementById('choiceDialog');
      const show = !!(d && d.classList.contains('show'));
      return { dlg: show, msg: (show && d.querySelector('.choiceMessage')) ? d.querySelector('.choiceMessage').textContent : null,
        btns: show ? Array.from(d.querySelectorAll('button')).map((b) => b.textContent) : [],
        arrows: document.querySelectorAll('#nodeLayer .exitArrow').length, done: W.done, pick: W.pick, err: W.err,
        log: window.__advice.log.length, last: window.__advice.log[window.__advice.log.length - 1] || null, state: window.__advice.state(),
        bubbles: Array.from(document.querySelectorAll('.speechBubble')).map((b) => b.textContent) };
    },
    click(sel) { const b = document.querySelector('#choiceDialog.show ' + sel); if (!b) return false; b.click(); return true; },
    /* ドライバ側の期待値: 候補 = 引き返す口・寄り道・訪れた出口を除く / 2 本未満なら null / 見えている kind (rank) と本当の kind (trueRank) で選び直す */
    expect() {
      const g = window.__graphRun; const hr = g.hints() || {}; const by = hr.byExit || {};
      const opts = g.exits();
      const cands = opts.filter((o) => !o.back && !o.spot && !(nodeState[o.to] && nodeState[o.to].visited));
      const best = (rankOf) => { let b = null, br = -1; for (const o of cands) { const r = rankOf(o); if (r === undefined || r === null) continue; if (r > br) { br = r; b = o; } } return b; };
      const vis = cands.length >= 2 ? best((o) => { const h = by[o.to]; return (h && h.kind) ? RANK[h.kind] : undefined; }) : null;
      const tru = cands.length >= 2 ? best((o) => { const n = RUN.byId[o.to]; return n ? RANK[n.kind] : undefined; }) : null;
      return { vis: vis ? vis.to : null, visDir: vis ? vis.dir : null, visHint: (vis && by[vis.to]) ? by[vis.to] : null,
        tru: tru ? tru.to : null, cands: cands.map((o) => o.to), opts: opts.map((o) => o.to + '/' + o.dir + (o.back ? '/back' : '')),
        byExit: Object.keys(by).map((k) => k + ':' + by[k].kind + (by[k].wrong ? '!' : '') + ':' + by[k].text),
        trueKinds: opts.map((o) => o.to + ':' + (RUN.byId[o.to] ? RUN.byId[o.to].kind : '?')), tier: hr.tier };
    },
  };
  window.__pv = W;
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
    await page.setViewport({ width: 1280, height: 800 });
    const members = party ? membersOf(party) : null;
    await page.evaluateOnNewDocument((spec) => {
      try {
        [localStorage, sessionStorage].forEach((st) => {
          const k = []; for (let i = 0; i < st.length; i++) if (st.key(i).indexOf('dragonfighters.') === 0) k.push(st.key(i));
          k.forEach((x) => st.removeItem(x));
        });
        sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
        localStorage.setItem('dragonfighters.xp', '45000'); localStorage.setItem('dragonfighters.prologueSeen', '1');
        sessionStorage.setItem('dragonfighters.plazaClock', '21');
        if (spec.members) {
          sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(spec.members));
          sessionStorage.setItem('dragonfighters.partyComposition', JSON.stringify([spec.members[0].classKey]));
        }
      } catch (e) {}
    }, { members });
    await page.goto(BASE + I + INDEX_QS + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => { try { return typeof mapData !== 'undefined' && !!window.__graphRun && window.__graphRun.active() && !!window.__advice && typeof allies !== 'undefined'; } catch (e) { return false; } }, { timeout: 60000 })
      .catch(() => { throw new Error('本体の起動待ち (__graphRun / __advice) が切れた'); });
    await sleep(800);
    await page.evaluate(installHelpers, RANK);
    return page;
  }
  const snap = (pg) => pg.evaluate(() => __pv.snap());
  /* 前の choose() を必ず解決させる (ダイアログなら「自分で選ぶ」→ 矢印なら 700ms 待って Esc) */
  async function settle(pg) {
    for (let i = 0; i < 16; i++) {
      const s = await snap(pg);
      if (s.done && !s.dlg && !s.arrows) return true;
      if (s.dlg) await pg.evaluate(() => __pv.click('.choiceNo'));
      else if (s.arrows) { await sleep(700); await pg.keyboard.press('Escape'); }
      await sleep(350);
    }
    return false;
  }
  const castOf = async (pg, id) => pg.evaluate((id) => DFCast.byId(id), id);
  /* 段階を作って勧める人を入れ、chooseExit を開く。返り値 = 開いた直後の snap と期待値 */
  async function openWith(pg, tier, castId, seed) {
    await settle(pg);
    const ex = await pg.evaluate((tier, castId, seed) => {
      __speech.clear(); __pv.pushed.length = 0;
      __graphRun.reveal(tier); if (castId !== null) __advice.setBy(castId);
      __pv.seed(seed);
      return __pv.expect();
    }, tier, castId, seed);
    const L0 = (await snap(pg)).log;
    await pg.evaluate(() => __pv.open());
    await sleep(300);
    return { ex, L0, s: await snap(pg) };
  }

  /* ════════ P1: 主人公 = 戦士 + キャスト 3 人 ════════ */
  await sect(['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(3a)', '(3b)', '(3c)', '(3d)', '(4a)'], async () => {
    const pg = await openIndex(PARTY_MAIN, '');
    /* §0 装置 */
    const z = await pg.evaluate(() => {
      const bad = [];
      for (const c of DFCast.all()) {
        const v = DFCast.byId(c.id) && DFCast.byId(c.id).voice;
        for (const s of ['advise', 'yes', 'no']) {
          const L = v && v[s];
          if (!Array.isArray(L) || L.length !== 2 || !L.every((l) => typeof l === 'string' && l.length > 0)) bad.push(c.id + '.' + s);
        }
        if (v && Array.isArray(v.advise) && !v.advise.every((l) => l.indexOf('{dir}') >= 0 && l.indexOf('{hint}') >= 0)) bad.push(c.id + '.advise:{dir}{hint}');
      }
      return { n: DFCast.all().length, bad, node: __graphRun.nodeId(), exits: __graphRun.exits().map((o) => ({ to: o.to, dir: o.dir, back: !!o.back, spot: !!o.spot, visited: !!(nodeState[o.to] && nodeState[o.to].visited) })),
        allies: allies.map((a) => ({ n: a.npcName, c: a.castId || null, alive: a.alive })), hero: leaderClassKey, auto: !!window.__autoplay,
        autoMs: (window.SkillCheck && SkillCheck.AUTO_ROLL_MS) || 0 };
    });
    const fresh = z.exits.filter((o) => !o.back && !o.spot && !o.visited);
    R.check('(0a)', '[装置] 分かれ道の部屋 (graphtest の入口) に未踏の出口が 2 本以上・?autoplay ではない',
      fresh.length >= 2 && z.auto === false, { node: z.node, exits: z.exits });
    R.check('(0b)', '[装置] allies に castId を持つ生きた仲間が 2 人以上 (partyMembers の castId が本体へ届く)・主人公 = 戦士',
      z.allies.filter((a) => a.c && a.alive).length >= 2 && z.hero === PARTY_MAIN.hero, { allies: z.allies, hero: z.hero });
    R.check('(0d)', '[装置] DFCast.byId(id).voice の 12 人すべてに advise / yes / no が 2 本ずつ (写しから消えていない = 罠 E)・advise はどれも {dir} と {hint} を含む',
      z.n === 12 && z.bad.length === 0, { n: z.n, bad: z.bad.slice(0, 8) });
    const AUTO_MS = z.autoMs;
    const CAST = {};
    for (const id of PARTY_MAIN.cast) CAST[id] = await castOf(pg, id);
    const vOf = (id, s) => (CAST[id] && CAST[id].voice && CAST[id].voice[s]) || [];
    const nameOf = (id) => (CAST[id] ? CAST[id].name : '?');

    /* (0c) fumble の盤面で「見えている kind の順位で選んだ出口 ≠ 本当の kind の順位で選んだ出口」 */
    const z0c = await pg.evaluate(() => { __graphRun.reveal('fumble'); const e = __pv.expect(); __graphRun.clearHints(); return e; });
    R.check('(0c)', '[装置] fumble の盤面で、見えている kind の順位で選んだ出口 ≠ 本当の kind の順位で選んだ出口 (無いと罠 D の変異 truekind を捕まえられない)',
      !!z0c.vis && !!z0c.tru && z0c.vis !== z0c.tru, z0c);

    /* §1 判定した本人 — 本物の revealExitHints (出目 0.97 に固定) */
    const realReveal = async (killAllies) => pg.evaluate(async (killAllies) => {
      __advice.setBy(killAllies ? 'falke' : null);      // 先に別の値を入れておく (書かれたことを見る)
      __graphRun.clearHints();
      const keep = allies.map((a) => a.alive);
      if (killAllies) allies.forEach((a) => { a.alive = false; });
      const SC = window.SkillCheck; const orig = SC.resolveSkillCheck; let cap = null;
      const units = []; if (hp > 0 && !gameOver) units.push('player'); for (const a of allies) if (a.alive) units.push(a);   // ドライバ側の並び (2 経路目)
      SC.resolveSkillCheck = function (k, dc, party) {
        return Promise.resolve(orig.apply(this, arguments)).then((r) => { cap = { party, rep: r ? r.rep : null, k }; return r; });
      };
      const prev = Math.random; Math.random = () => 0.97;
      let err = null;
      try { await __graphRun.reveal(); } catch (e) { err = String(e && e.message || e); }
      finally { Math.random = prev; SC.resolveSkillCheck = orig; allies.forEach((a, i) => { a.alive = keep[i]; }); }
      const idx = cap && cap.rep ? cap.party.indexOf(cap.rep) : -1;
      const u = idx >= 0 ? units[idx] : undefined;
      return { err, st: __advice.state(), tier: (__graphRun.hints() || {}).tier, k: cap && cap.k, idx,
        party: cap ? cap.party.map((m) => m.name + (m.isHero ? '(主)' : '') + ':' + JSON.stringify(m.skillBonus)) : null,
        exp: u === undefined ? undefined : (u === 'player' ? null : (u.castId || null)), expIsHero: u === 'player' };
    }, killAllies);
    const waitPanel = async () => { await pg.waitForFunction(() => !skillCheckActive, { timeout: 20000 }).catch(() => {}); await sleep(600); };
    const A1 = await realReveal(false);
    await waitPanel();
    R.check('(1a)', '本物の revealExitHints (出目固定) → __advice.state().by = res.rep を「生きている主人公 → 生きている仲間」の並びで本物へ戻したものの castId (2 経路: ドライバが SkillCheck の結果から引き直す)・判定者はキャストの仲間',
      !A1.err && A1.k === 'perception' && A1.idx > 0 && typeof A1.exp === 'string' && A1.st && A1.st.by === A1.exp && !!CAST[A1.exp], A1);
    const B1 = await realReveal(true);
    await waitPanel();
    const b1 = await openWith(pg, null, null, 11).catch(() => null);   // ヒントは本物の判定のまま (tier を渡さない = forcedTier なし → 再判定せず焼いた値)
    R.check('(1b)', '主人公が判定した (仲間が倒れていた) → by は null。chooseExit → ダイアログは出ず、すぐ矢印',
      !B1.err && B1.expIsHero === true && B1.st && B1.st.by === null && !!b1 && !b1.s.dlg && b1.s.arrows > 0 && b1.s.log === b1.L0, { B1, s: b1 && b1.s });

    /* §2 勧めの中身 — success + setBy(falke) */
    const B = 'falke';
    const a2 = await openWith(pg, 'success', B, 101);
    const want2 = a2.ex.vis ? adviseSet(vOf(B, 'advise'), a2.ex.visDir, a2.ex.visHint && a2.ex.visHint.text).map((t) => nameOf(B) + '「' + t + '」') : [];
    R.check('(2a)', 'success + setBy(B) → #choiceDialog が出る。文面 = B.npcName「B の advise に勧めた出口の {dir} / {hint} を差し込んだ文のどれか」・ボタンは「1. わかった、そっちに進もう」「いや、自分で選ぶ (Esc)」・矢印はまだ無い',
      a2.s.dlg && want2.indexOf(a2.s.msg) >= 0 && J(a2.s.btns) === J(['1. わかった、そっちに進もう', 'いや、自分で選ぶ (Esc)']) && a2.s.arrows === 0 && a2.s.log === a2.L0,
      { msg: a2.s.msg, want: want2, btns: a2.s.btns, arrows: a2.s.arrows });
    await pg.evaluate(() => __pv.click('.choiceYes'));
    await sleep(300);
    const a3 = await snap(pg);
    const yesQ = await pg.evaluate(() => __pv.pushed.filter((x) => x.key === 'advice.yes'));
    R.check('(2b)', '勧めた出口 (__advice.log の最後の to) = ドライバが hints().byExit の見えている kind で選び直した出口 (2 経路)',
      !!a2.ex.vis && !!a3.last && a3.log === a2.L0 + 1 && a3.last.to === a2.ex.vis && a3.last.castId === B && a3.last.wrong === false, { ex: a2.ex, last: a3.last });
    R.check('(3a)', '「わかった」をタップ → chooseExit が勧めた出口を返す。advice.yes の予約が 1 本・話し手 = B・文は B の yes のどれか',
      a3.done && !a3.err && a3.pick === a2.ex.vis && !!a3.last && a3.last.yes === true && yesQ.length === 1 && yesQ[0].sp === B && vOf(B, 'yes').indexOf(yesQ[0].text) >= 0,
      { pick: a3.pick, err: a3.err, yesQ });

    /* (3b) 時間切れ = わかった */
    const C = 'rasmussen';
    const b3 = await openWith(pg, 'success', C, 202);
    await pg.waitForFunction(() => __pv.done, { timeout: AUTO_MS + 3000 }).catch(() => {});
    const b3s = await snap(pg);
    const b3t = await pg.evaluate(() => ({ dt: __pv.t1 ? __pv.t1 - __pv.t0 : null }));
    R.check('(3b)', '何もしない → AUTO_ROLL_MS (' + AUTO_MS + 'ms) + 500ms 以内にダイアログが閉じ、勧めた出口を返す (= わかった・罠 B)・矢印は出ない',
      AUTO_MS > 0 && b3.s.dlg && b3s.done && !b3s.dlg && b3s.arrows === 0 && b3s.pick === b3.ex.vis && !!b3s.last && b3s.last.yes === true && b3s.last.castId === C
        && b3t.dt !== null && b3t.dt >= AUTO_MS - 100 && b3t.dt <= AUTO_MS + 500,
      { autoMs: AUTO_MS, dt: b3t.dt, opened: b3.s.dlg, after: { done: b3s.done, dlg: b3s.dlg, arrows: b3s.arrows, pick: b3s.pick, last: b3s.last }, vis: b3.ex.vis });

    /* (3c) 自分で選ぶ — 先に他の吹き出しを表示中にしておく (罠 A の補足) */
    const D = 'irena';
    await settle(pg);
    const c3 = await openWith(pg, 'success', D, 303);
    const pre = await pg.evaluate(() => { __speech.say('find.trap', allies[2]); __speech.update(); return { active: __speech.active.length }; });
    await pg.evaluate(() => __pv.click('.choiceNo'));
    await sleep(400);
    const c3s = await snap(pg);
    const noRow = await pg.evaluate((mark) => __speech.log.filter((r) => r.key === 'advice.no' && r.at >= mark).slice(-1)[0] || null, Date.now() - 60000);
    const noQ = await pg.evaluate(() => __pv.pushed.filter((x) => x.key === 'advice.no'));
    R.check('(3c)', '「自分で選ぶ」→ ダイアログが閉じて矢印が出る。speechLog に advice.no の行が 1 本 (話し手 = D・文は D の no のどれか) = 矢印が出ている間に表示済み (DOM の吹き出しにもある・罠 A)',
      c3.s.dlg && !c3s.dlg && c3s.arrows > 0 && !c3s.done && !!noRow && noRow.castId === D && vOf(D, 'no').indexOf(noRow.text) >= 0 && c3s.bubbles.indexOf(noRow.text) >= 0
        && noQ.length === 1 && noQ[0].sp === D && !!c3s.last && c3s.last.yes === false,
      { pre, s: { dlg: c3s.dlg, arrows: c3s.arrows, done: c3s.done, bubbles: c3s.bubbles, last: c3s.last }, noRow, noQ });

    /* §4 1 部屋 1 回 — (3c) の後に矢印を Esc (留まる) → もう一度 chooseExit */
    await sleep(700); await pg.keyboard.press('Escape'); await sleep(400);
    const d4a = await snap(pg);
    await pg.evaluate(() => __pv.open()); await sleep(300);
    const d4b = await snap(pg);
    R.check('(4a)', '(3c) の後に矢印を Esc (留まる) → もう一度 chooseExit → ダイアログは出ず、矢印だけ。log の本数は変わらない',
      d4a.done && d4a.pick === null && !d4b.dlg && d4b.arrows > 0 && d4b.log === d4a.log && d4b.state && d4b.state.done === true,
      { first: { done: d4a.done, pick: d4a.pick, log: d4a.log }, again: { dlg: d4b.dlg, arrows: d4b.arrows, log: d4b.log, state: d4b.state, msg: d4b.msg } });

    /* (2d) fail → 勧めない */
    const f2 = await openWith(pg, 'fail', B, 404);
    R.check('(2d)', 'fail → ダイアログは出ず、すぐ矢印。log は増えない',
      !f2.s.dlg && f2.s.arrows > 0 && f2.s.log === f2.L0 && f2.ex.vis === null, { s: { dlg: f2.s.dlg, msg: f2.s.msg, arrows: f2.s.arrows, log: f2.s.log, L0: f2.L0 }, ex: f2.ex.byExit });

    /* (2c) fumble → 見えている kind で選ばれ wrong === true・(0c) の部屋では本当の kind で選んだ出口と違う */
    const g2 = await openWith(pg, 'fumble', B, 505);
    await pg.evaluate(() => __pv.click('.choiceNo')); await sleep(300);
    const g2s = await snap(pg);
    R.check('(2c)', 'fumble → (2b) と同じ規則 (見えている kind) で選ばれ、wrong === true。本当の kind で選んだ出口とは違う',
      g2.s.dlg && g2s.log === g2.L0 + 1 && !!g2s.last && g2s.last.to === g2.ex.vis && g2s.last.wrong === true && g2.ex.tru !== null && g2s.last.to !== g2.ex.tru,
      { last: g2s.last, vis: g2.ex.vis, tru: g2.ex.tru, byExit: g2.ex.byExit, trueKinds: g2.ex.trueKinds });

    /* (2e) 訪れた出口・引き返す口は勧めない — success で勧められる出口 (loot) を訪れた印にする */
    await settle(pg);
    const seenTo = a2.ex.vis;
    const mk = await pg.evaluate((to) => { const had = Object.prototype.hasOwnProperty.call(nodeState, to); const prev = had ? nodeState[to].visited : undefined; if (!had) nodeState[to] = newNodeState(); nodeState[to].visited = true; window.__pvSeen = { to, had, prev }; return { had, prev }; }, seenTo);
    const e2 = await openWith(pg, 'success', B, 606);
    if (e2.s.dlg) { await pg.evaluate(() => __pv.click('.choiceYes')); await sleep(300); }
    const e2s = await snap(pg);
    await settle(pg);
    await pg.evaluate(() => { const m = window.__pvSeen; if (!m) return; if (m.had) nodeState[m.to].visited = m.prev; else delete nodeState[m.to]; });
    const backTos = e2.ex.opts.filter((s) => /\/back$/.test(s)).map((s) => s.split('/')[0]);
    R.check('(2e)', '勧められる出口 (success の ' + seenTo + ') を訪れた印にする → 勧めは別の出口 (= ドライバが訪れた出口を除いて選び直したもの)・引き返す口でもない',
      !!seenTo && e2.s.dlg && e2s.log === e2.L0 + 1 && !!e2s.last && e2s.last.to !== seenTo && e2s.last.to === e2.ex.vis && backTos.indexOf(e2s.last.to) < 0,
      { seen: seenTo, mk, last: e2s.last, ex: { vis: e2.ex.vis, cands: e2.ex.cands, opts: e2.ex.opts } });

    /* (2f) crit → {hint} に「— N 体ばかり」が入らない */
    const h2 = await openWith(pg, 'crit', B, 707);
    const h2t = await pg.evaluate(() => {
      const opts = __graphRun.exits(); const by = (__graphRun.hints() || {}).byExit || {};
      const a = allies.find((x) => x.castId === 'falke');
      const out = [];
      for (const o of opts) { const h = by[o.to]; if (!h || !h.kind || h.text.indexOf(' — ') < 0) continue; __pv.seed(17); out.push({ to: o.to, text: h.text, got: __advice.text(a, 'advise', o, h) }); }
      return out;
    });
    if (h2.s.dlg) { await pg.evaluate(() => __pv.click('.choiceYes')); await sleep(300); }
    const h2s = await snap(pg);
    const critTrim = h2t.length >= 1 && h2t.every((x) => typeof x.got === 'string' && x.got.indexOf('体ばかり') < 0 && x.got.indexOf(' — ') < 0 && x.got.indexOf(hintCore(x.text)) >= 0);
    R.check('(2f)', 'crit → 勧めの文面に「— N 体ばかり」が入っていない (ダイアログ + 「— N 体」の付いた出口すべてで __advice.text を直叩き)',
      h2.s.dlg && !!h2.s.msg && h2.s.msg.indexOf('体ばかり') < 0 && h2.s.msg.indexOf(' — ') < 0 && critTrim && !!h2s.last && h2s.last.to === h2.ex.vis,
      { msg: h2.s.msg, direct: h2t, last: h2s.last });

    /* (3d) 召喚の呼び口と同じ autoSkipMs だけ → 時間切れで null (恒等) */
    await settle(pg);
    const d3 = await pg.evaluate(async () => { const t = Date.now(); const v = await showCharChoice('召喚の恒等', [{ label: 'a' }], 'c', { autoSkipMs: 300 }); return { v, dt: Date.now() - t }; });
    R.check('(3d)', 'autoSkipMs だけを渡した showCharChoice (召喚の呼び口と同じ) → 時間切れで null (恒等)',
      d3.v === null && d3.dt >= 250 && d3.dt < 2000, d3);
    await settle(pg);
    await pg.close();
  });

  /* ════════ P2: ?autoplay=15 (同じ仕込み) ════════ */
  await sect(['(5a)'], async () => {
    const pg = await openIndex(PARTY_MAIN, '&autoplay=15');
    const r = await pg.evaluate(async () => {
      __graphRun.reveal('success'); __advice.setBy('falke');
      const opts = __graphRun.exits();
      const L0 = __advice.log.length;
      const v = await __graphRun.choose();
      const d = document.getElementById('choiceDialog');
      return { auto: !!window.__autoplay, v: v ? v.to : null, first: opts[0] ? opts[0].to : null, L0, log: __advice.log.length, last: __advice.log[__advice.log.length - 1] || null,
        dlg: !!(d && d.classList.contains('show')), opts: opts.map((o) => o.to) };
    });
    R.check('(5a)', '同じ仕込みで ?autoplay=15 → chooseExit の戻りが今までどおり (ダイアログ経路の候補 0)・log は 0 本',
      r.auto === true && r.v !== null && r.v === r.first && r.log === 0 && r.L0 === 0 && !r.dlg, r);
    await pg.close();
  });

  /* ════════ P3: castId の無いパーティ (直起動) ════════ */
  await sect(['(5b)'], async () => {
    const pg = await openIndex(null, '');
    const r = await pg.evaluate(async () => {
      __graphRun.clearHints();
      const prev = Math.random; Math.random = () => 0.97; let err = null;
      try { await __graphRun.reveal(); } catch (e) { err = String(e && e.message || e); } finally { Math.random = prev; }
      return { err, st: __advice.state(), allies: allies.map((a) => ({ n: a.npcName, c: a.castId || null, alive: a.alive })) };
    });
    await pg.waitForFunction(() => !skillCheckActive, { timeout: 20000 }).catch(() => {});
    await sleep(600);
    const L0 = (await snap(pg)).log;
    await pg.evaluate(() => __pv.open()); await sleep(300);
    const s = await snap(pg);
    R.check('(5b)', 'castId の無いパーティ (直起動) → 本物の判定でも by は null・勧めは出ない (すぐ矢印・log 不変)',
      !r.err && r.allies.length >= 1 && r.allies.every((a) => !a.c) && r.st && r.st.by === null && !s.dlg && s.arrows > 0 && s.log === L0 && L0 === 0,
      { r, s: { dlg: s.dlg, arrows: s.arrows, log: s.log } });
    await settle(pg);
    await pg.close();
  });

  /* ════════ P4: ?advise=0 (同じ仕込み) ════════ */
  await sect(['(6a)'], async () => {
    const pg = await openIndex(PARTY_MAIN, '&advise=0');
    const o = await openWith(pg, 'success', 'falke', 909);
    const on = await pg.evaluate(() => __advice.on());
    R.check('(6a)', '?advise=0 → (2a) と同じ仕込みでもダイアログは出ず、すぐ矢印 (__advice.on() = false・log 0 本)',
      on === false && !o.s.dlg && o.s.arrows > 0 && o.s.log === 0 && !!o.ex.vis, { on, s: { dlg: o.s.dlg, msg: o.s.msg, arrows: o.s.arrows, log: o.s.log }, vis: o.ex.vis });
    await settle(pg);
    await pg.close();
  });

  R.check('(0e)', '[装置] 全ページで pageerror 0 件', ERRS.length === 0, ERRS.slice(0, 5));
  for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(判定が出ていない)', false, '');
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_path_advice_');
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
      if (popZero(R0)) { console.error('[vet] ⛔ 素で母集団が崩れている ((0a)(0b)(0c) が赤) — 装置が腐っている'); exitCode = 3; }
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
      if (popZero(R)) { console.error('[vet] ⛔ 母集団が崩れている ((0a)(0b)(0c) が赤)'); exitCode = 3; }
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
