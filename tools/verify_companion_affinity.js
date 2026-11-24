#!/usr/bin/env node
/*
 * verify_companion_affinity.js — ★#121 (B3 縮小版)「仲間の相性と掛け合い」の受入ドライバ
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_companion_affinity.js              # 素 (port 10920)
 *   node tools/verify_companion_affinity.js --negative   # 素の基準 + 変異 4 本 (port 10921〜10924)
 *   node tools/verify_companion_affinity.js --mutate dropsecond
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り / 2=環境不足 / 3=装置の腐敗
 *
 * ■ 方針 (verify_banter_callouts.js と同型・最小構成)
 *   - ゲームを遊ばせず、本体の window.__affinity / DFCast を直接呼んで、相性ペアの検出と掛け合いの予約を読む。
 *   - 仕込み = sessionStorage["dragonfighters.partyMembers"] に castId 入りの人物を入れて index を開き、
 *     tryStartEncounter を止めて startGame()。人物は js/companion-cast.js の DFCast を node 側で評価して作る。
 *   - 予約の観測 = speechQueue.push を配列 1 本ぶんだけ包んで記録 (本番コードは 1 バイトも変えない)。
 *   - ⛔ 本番ファイルに測定シームを足さない。⛔ どの掛け合いが選ばれるかの偏りは測らない (集合に入るかだけ)。
 *
 * ■ 変異 (負のコントロール 4 本)。注入点は原本でちょうど 1 件・行数不変、を起動時に検算する。
 *   dropsecond   : sayPairBanter の 2 行目を消す      → (2a)(2b) 赤
 *   nogate       : sayPairBanter の行列ゲートを外す    → (2c) 赤
 *   affinityleak : affinityOn が URL を見ず常に true   → (2d) 赤
 *   pairall      : activePairs が ids を無視して全組   → (1b)(2e) 赤
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10920'), 10);
const MUTATE = arg('mutate', null);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const I = 'index.html';
const CC = 'js/companion-cast.js';
const SNAP = [I, CC];
const PRISTINE = {};
for (const f of SNAP) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const EOLS = {};
for (const f of SNAP) EOLS[f] = /\r\n/.test(PRISTINE[f]) ? '\r\n' : '\n';
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[I].indexOf('window.__affinity = {') < 0 || PRISTINE[CC].indexOf('function activePairs(ids)') < 0)
  vetFail('#121 より前のツリーで走らせている (window.__affinity / activePairs が無い)');

const NODE_CAST = (() => {
  const sandbox = { location: { search: '' } };
  try { new Function('window', PRISTINE[CC])(sandbox); } catch (e) { vetFail('companion-cast.js を node 側で評価できない: ' + e.message); }
  if (!sandbox.DFCast || typeof sandbox.DFCast.activePairs !== 'function') vetFail('companion-cast.js から DFCast.activePairs が作れない');
  return sandbox.DFCast;
})();

/* ── 変異 ── */
const MUTATIONS = {
  dropsecond: [{ file: I,
    from: '      sayLine("banter.pair", a1, { text: t1, prio: 0, meta: { scene: "banter", with: a0.castId || null } });',
    to:   '      void 0; /* ★変異dropsecond */' }],
  nogate: [{ file: I,
    from: '      if (speechQueue.length || speechBubbles.length || Date.now() < speechBusyUntil) return false;',
    to:   '      if (false) return false; /* ★変異nogate */' }],
  affinityleak: [{ file: I,
    from: '      try { return new URLSearchParams(window.location.search).get("affinity") !== "0"; } catch (e) { return true; }',
    to:   '      try { return true; /* ★変異affinityleak */ } catch (e) { return true; }' }],
  pairall: [{ file: CC,
    from: '    for (var j = 0; j < PAIRS.length; j++) if (set[PAIRS[j].a] && set[PAIRS[j].b]) out.push(copyPair(PAIRS[j]));',
    to:   '    for (var j = 0; j < PAIRS.length; j++) { if (set) {} out.push(copyPair(PAIRS[j])); } /* ★変異pairall */' }],
};
/* pairall は activePairs が ids を無視して全組返す変異。これが赤にするのは ids ベースの (1a)(1b) 両方。
   (2e) は tryPairBanter 側の「往復の 2 人が両方 cands に居るか」の独立ガードが効くので、
   activePairs が壊れても no-pair 編成では掛け合いが積まれない (= 多層防御。pairall では赤にならない)。 */
const NEG_EXPECT = { dropsecond: ['(2a)', '(2b)'], nogate: ['(2c)'], affinityleak: ['(2d)'], pairall: ['(1a)', '(1b)'] };
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length !== 4) vetFail('変異は 4 本');
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE);

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
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + e.file + ' に ' + c + ' 件): ' + e.from.slice(0, 120));
    if (from.split('\n').length !== to.split('\n').length) vetFail('変異 ' + key + ' が行数を変える');
    if (countOf(PRISTINE[e.file], to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    out[e.file] = out[e.file].split(from).join(to);
  }
  for (const f of SNAP) if (out[f].split('\n').length !== PRISTINE[f].split('\n').length) vetFail('変異 ' + key + ' が ' + f + ' の行数を変えた');
  if (SNAP.every((f) => out[f] === PRISTINE[f])) vetFail('変異 ' + key + ' が何も変えていない');
  _mutCache[key] = out;
  return out;
}
for (const k of MUT_ORDER) servedFiles(k);
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本でちょうど 1 箇所・行数不変');

/* ── puppeteer / Chrome / サーバ ── */
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

/* ── 結果 ── */
const ALL_IDS = ['(0a)', '(0b)', '(1a)', '(1b)', '(2a)', '(2b)', '(2c)', '(2d)', '(2e)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 1200));
  };
  return R;
}
function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + '   PENDING 0' + (label ? '   ' + label : ''));
  if (failed) R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 70) + '  -- ' + r.detail.slice(0, 400)));
  console.log('══════════════════════════════════════════════════════════');
  return { passed, failed };
}

/* ── 編成 ── */
const ZONE = { warrior: 'front', dwarf: 'front', rogue: 'mid', elf: 'mid', cleric: 'mid', mage: 'rear' };
const PARTY_PAIR = { hero: 'warrior', cast: ['rolf', 'knut', 'oz'] };   // rolf↔knut が揃う / oz は相方 jona 不在
const PARTY_NOPAIR = { hero: 'warrior', cast: ['rolf', 'oz', 'irena'] }; // どの相方も不在 = ペア 0
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

/* ── ページ内補助 (配列 1 本の push を包むだけ) ── */
function installHelpers() {
  const R0 = Math.random;
  const sp = (s) => (s === 'player' ? 'player' : s === 'party' ? 'party' : (s && typeof s === 'object') ? (s.castId || ('name:' + (s.npcName || '?'))) : String(s));
  const pushed = [];
  const origPush = speechQueue.push;
  speechQueue.push = function (e) {
    try { pushed.push({ key: e.key, text: e.text, sp: sp(e.speaker), prio: e.prio, meta: e.meta ? JSON.parse(JSON.stringify(e.meta)) : null }); } catch (x) {}
    return origPush.apply(this, arguments);
  };
  window.__at = {
    pushed,
    seed(n) {
      let s = (n >>> 0) || 1;
      Math.random = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); const u = (t ^ (t >>> 14)) >>> 0; return u / 4294967296; };
    },
    unseed() { Math.random = R0; },
    reset() { clearSpeech(); pushed.length = 0; speechBusyUntil = 0; },
    castAllies() { return allies.filter((a) => a && a.alive && a.castId); },
    ids() { return allies.filter((a) => a && a.alive && a.castId).map((a) => a.castId); },
    unitOf(id) { return allies.find((a) => a && a.castId === id) || null; },
    /* __affinity.say を reset してから呼び、積まれた予約を返す */
    sayOnce(id0, t0, id1, t1) {
      this.reset();
      const u0 = this.unitOf(id0), u1 = this.unitOf(id1);
      const ret = (u0 && u1) ? __affinity.say(u0, t0, u1, t1) : false;
      return { ret, q: pushed.slice() };
    },
    /* 行列を埋めた状態で say → 積まれないはず */
    sayBusy(id0, t0, id1, t1) {
      this.reset();
      speechBusyUntil = Date.now() + 100000;   // 行列が「忙しい」状態を作る
      const u0 = this.unitOf(id0), u1 = this.unitOf(id1);
      const ret = (u0 && u1) ? __affinity.say(u0, t0, u1, t1) : false;
      const q = pushed.slice();
      speechBusyUntil = 0;
      return { ret, q };
    },
    /* tryTick (= tickIdleChatter が呼ぶ本体) を seed 付きで */
    tick(seed) {
      this.reset();
      const cands = this.castAllies();
      this.seed(seed);
      let ret = false, err = null;
      try { ret = __affinity.tryTick(cands); } catch (e) { err = String(e && e.message || e); } finally { this.unseed(); }
      return { ret, q: pushed.slice(), err };
    },
  };
  return true;
}

/* ── 1 回分の検査 ── */
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
    const members = membersOf(party);
    await page.evaluateOnNewDocument((spec) => {
      try {
        [localStorage, sessionStorage].forEach((st) => {
          const k = []; for (let i = 0; i < st.length; i++) if (st.key(i).indexOf('dragonfighters.') === 0) k.push(st.key(i));
          k.forEach((x) => st.removeItem(x));
        });
        localStorage.setItem('dragonfighters.xp', '45000'); localStorage.setItem('dragonfighters.prologueSeen', '1');
        sessionStorage.setItem('dragonfighters.plazaClock', '21');
        sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(spec.members));
        sessionStorage.setItem('dragonfighters.partyComposition', JSON.stringify([spec.members[0].classKey]));
      } catch (e) {}
    }, { members });
    await page.goto(BASE + I + INDEX_QS + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => { try { return typeof allies !== 'undefined' && allies.length > 0 && typeof startGame === 'function' && !!window.__affinity; } catch (e) { return false; } }, { timeout: 60000 })
      .catch(() => { throw new Error('本体の起動待ち (allies / __affinity) が切れた'); });
    await sleep(500);
    await page.evaluate(() => { try { tryStartEncounter = function () {}; } catch (e) {} try { if (!gameStarted) startGame(); } catch (e) {} });
    await page.waitForFunction(() => { try { return gameStarted; } catch (e) { return false; } }, { timeout: 30000 })
      .catch(() => { throw new Error('本体の startGame 待ちが切れた'); });
    await sleep(300);
    await page.evaluate(installHelpers);
    return page;
  }

  /* ════ Page A: PARTY_PAIR (banter ON) ════ */
  await sect(['(0a)', '(0b)', '(1a)', '(2a)', '(2b)', '(2c)', '(2d)'], async () => {
    const pg = await openIndex(PARTY_PAIR, '');
    const z = await pg.evaluate(() => {
      const all = DFCast.all().map((c) => c.id);
      const set = {}; all.forEach((x) => set[x] = true);
      const pairs = __affinity.pairs();
      const bad = [], covered = {};
      pairs.forEach((p) => {
        if (!set[p.a]) bad.push('a:' + p.a);
        if (!set[p.b]) bad.push('b:' + p.b);
        covered[p.a] = covered[p.b] = true;
        p.banter.forEach((ex) => {
          if (!Array.isArray(ex) || ex.length !== 2) bad.push('ex-len:' + p.a);
          ex.forEach((t) => { if (!set[t.id]) bad.push('turn:' + t.id); if (/[{}]/.test(t.t)) bad.push('brace:' + t.t); });
        });
      });
      return { nPairs: pairs.length, nCast: all.length, cover: Object.keys(covered).length, bad,
        on: __affinity.on(), ids: __at.ids() };
    });
    R.check('(0a)', 'DFCast.pairs() が 6 組・全 id が実在 (12 人をちょうど網羅)・どの掛け合いも 2 行で "{}" を含まない',
      z.nPairs === 6 && z.nCast === 12 && z.cover === 12 && z.bad.length === 0, { nPairs: z.nPairs, cover: z.cover, bad: z.bad.slice(0, 6) });
    R.check('(0b)', '起動後の allies に castId を持つ仲間が 2 人以上・affinityOn()=true (既定)',
      z.ids.length >= 2 && z.on === true, z);
    const a1 = await pg.evaluate(() => __affinity.active(__at.ids()).map((p) => [p.a, p.b].sort().join('+')));
    R.check('(1a)', 'PARTY_PAIR (rolf+knut+oz) で active(ids) = rolf+knut の 1 組だけ (oz は相方不在)',
      a1.length === 1 && a1[0] === 'knut+rolf', { active: a1 });
    const s2 = await pg.evaluate(() => __at.sayOnce('rolf', 'セリフA', 'knut', 'セリフB'));
    const q = s2.q;
    R.check('(2a)', '__affinity.say(rolf,A,knut,B) → 予約が 2 本・1 本目=rolf/A・2 本目=knut/B・どちらも key=banter.pair・優先度 0・meta.scene=banter',
      s2.ret === true && q.length === 2 &&
      q[0].sp === 'rolf' && q[0].text === 'セリフA' && q[0].key === 'banter.pair' && q[0].prio === 0 && q[0].meta && q[0].meta.scene === 'banter' && q[0].meta.with === 'knut' &&
      q[1].sp === 'knut' && q[1].text === 'セリフB' && q[1].key === 'banter.pair' && q[1].prio === 0 && q[1].meta && q[1].meta.with === 'rolf',
      q);
    /* (2b) tryTick: 実在の往復が 2 行とも積まれ、話し手が往復の id と一致し、文は DFCast の往復に実在する */
    const b = await pg.evaluate(() => {
      const pairObj = __affinity.active(__at.ids()).find((p) => [p.a, p.b].sort().join('+') === 'knut+rolf');
      const texts = {}; pairObj.banter.forEach((ex) => ex.forEach((t) => { (texts[t.id] = texts[t.id] || []).push(t.t); }));
      let got = null;
      for (let s = 1; s <= 80 && !got; s++) { const r = __at.tick(s); if (r.ret && r.q.length === 2) got = r; }
      if (!got) return { found: false };
      const q = got.q;
      const ok = q[0].key === 'banter.pair' && q[1].key === 'banter.pair' &&
        texts[q[0].sp] && texts[q[0].sp].indexOf(q[0].text) >= 0 &&
        texts[q[1].sp] && texts[q[1].sp].indexOf(q[1].text) >= 0 &&
        ((q[0].sp === pairObj.a && q[1].sp === pairObj.b) || (q[0].sp === pairObj.b && q[1].sp === pairObj.a));
      return { found: true, ok, q };
    });
    R.check('(2b)', 'tryTick (独り言のフック本体) → 相性ペアの往復が 2 行とも積まれ、話し手がペアの 2 人・文はその人の実在の掛け合い',
      b.found && b.ok, b);
    const c = await pg.evaluate(() => __at.sayBusy('rolf', 'A', 'knut', 'B'));
    R.check('(2c)', '行列が埋まっている (speechBusyUntil が先) ときは say が false・予約は 0 本 (遭遇/罠を押し出さない)',
      c.ret === false && c.q.length === 0, c);
    /* (2d) affinity=0 の別ページで on()=false */
    const pg0 = await openIndex(PARTY_PAIR, '&affinity=0');
    const off = await pg0.evaluate(() => ({ on: __affinity.on() }));
    R.check('(2d)', '?affinity=0 では affinityOn()=false (掛け合いが止まる)', off.on === false, off);
  });

  /* ════ Page B: PARTY_NOPAIR ════ */
  await sect(['(1b)', '(2e)'], async () => {
    const pg = await openIndex(PARTY_NOPAIR, '');
    const nb = await pg.evaluate(() => ({ active: __affinity.active(__at.ids()), ids: __at.ids() }));
    R.check('(1b)', 'PARTY_NOPAIR (どの相方も不在) で active(ids) = 空', Array.isArray(nb.active) && nb.active.length === 0, nb);
    const t = await pg.evaluate(() => { const out = []; for (let s = 1; s <= 20; s++) out.push(__at.tick(s)); return out; });
    const anyQueued = t.some((r) => r.ret || r.q.length);
    R.check('(2e)', 'PARTY_NOPAIR では tryTick が一度も掛け合いを積まない (ペア 0 = RNG 以前に false)',
      !anyQueued && t.every((r) => !r.err), { anyQueued, errs: t.map((r) => r.err).filter(Boolean).slice(0, 2) });
  });

  if (ERRS.length) { R.check('(PE)', 'ページ例外なし', false, ERRS.slice(0, 6).join(' || ')); }
  return R;
}

/* ── main ── */
(async () => {
  const puppeteer = loadPuppeteer();
  const exe = findBrowser();
  const launch = async () => puppeteer.launch({ headless: !HEADFUL, executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  async function oneRun(port, mutKey, label) {
    const srv = await startServer(port, mutKey);
    const browser = await launch();
    let R;
    try { R = await runSuite(browser, port); }
    finally { try { await browser.close(); } catch (e) {} await stopServer(srv); }
    summarize(R, label);
    return R;
  }

  try {
    if (MUTATE) {
      const R = await oneRun(PORT, MUTATE, 'mutate=' + MUTATE);
      process.exit(R.filter((r) => !r.ok).length ? 0 : 1);
    }
    const base = await oneRun(PORT, null, '素 (pristine)');
    const baseFail = base.filter((r) => !r.ok).length;
    if (!NEGATIVE) { process.exit(baseFail ? 1 : 0); }

    let bad = baseFail ? ['素が赤: ' + base.filter((r) => !r.ok).map((r) => r.id).join(',')] : [];
    for (let i = 0; i < MUT_ORDER.length; i++) {
      const key = MUT_ORDER[i];
      const R = await oneRun(PORT + 1 + i, key, '変異 ' + key);
      const red = new Set(R.filter((r) => !r.ok).map((r) => r.id));
      const miss = NEG_EXPECT[key].filter((id) => !red.has(id));
      if (miss.length) bad.push('変異 ' + key + ' で赤くならない担当: ' + miss.join(','));
      else console.log('  [neg] 変異 ' + key + ' OK (担当 ' + NEG_EXPECT[key].join(',') + ' が赤)');
    }
    console.log('\n[合計] ' + Math.round((Date.now() - T_START) / 1000) + 's');
    if (bad.length) { console.error('\n⛔ 負のコントロール NG:\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('\n✅ 素は全緑・変異 4 本すべて担当の節が赤');
    process.exit(0);
  } catch (e) {
    console.error('[fatal] ' + String((e && e.stack) || e).slice(0, 500));
    for (const s of SERVERS.slice()) await stopServer(s);
    process.exit(2);
  }
})();
