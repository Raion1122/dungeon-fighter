#!/usr/bin/env node
/*
 * verify_accessory_equip.js — 実装依頼書 #113「魔法の装身具を、キャラクターシートと出発画面で主人公が着脱する」の受入ドライバ
 *   (依頼書 2026-11-10_magic-item-equip.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_accessory_equip.js                        # 素 (port 10780)
 *   node tools/verify_accessory_equip.js --negative             # 素の基準 + 変異 10 本 (port 10781〜10790)
 *   node tools/verify_accessory_equip.js --negative --only seat,promote
 *   node tools/verify_accessory_equip.js --mutate seat          # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・基準版が取れない・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 実ページを開き、シートと引き出しのボタンを実際に押して ① localStorage ② ランタイム ③ 画面 の 3 つを突き合わせる。
 *   - シートのボタンは実タップ (touchscreen)。引き出しの行は DOM の click (シートの幕の下にあるときも押せる必要があるため)。
 *   - (6a) の基準は git show 3700c2d:index.html (⛔ HEAD にしない)。同じサーバの /index.html?base3700=1 で配る。
 *   - (3f) の勝利経路: :44577 の直書きの直後に savePersistentAccessoryStock が同じキーを書き直すので、最終値を読むだけでは
 *     直書きの誤りが見えない ⇒ setItem の書き込み列を記録して「どの書き込みも主人公の品」を確かめる。
 *   - ⛔ 本番ファイルに測定シームを足さない (読むのは項目2 の window.__sheetEquip.heroAcc まで)。
 *
 * ■ ⚠ 計測機構
 *   - index.html / tavern.html は起動時に 1 回だけ readFileSync して凍結し、変異はメモリ上で差し替えて配る。
 *   - 起動時に全変異のアンカーを原本で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     自分のアンカーが他の tools/*.js に出てこないことも確かめる (罠E)。崩れたら exit 3 (部分注入で走らせない)。
 *   - --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」。担当は --mutate の実走で決めた。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10780** (素) / 変異 **10781〜10790** (MUTATIONS の並び順)。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10780'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた条件 (データ) */
const BASE_REV = '3700c2d';     // (6a) の基準。⛔ HEAD にしない
const G = 'gauntlets-ogre-power', H = 'amulet-health', RP = 'ring-protection', F = 'ring-fire-resist', B = 'belt-giant-strength',
  SA = 'shadow-amulet', ST = 'amulet-silver-tongue';
const K = { e1: 'dragonfighters.equipAccessory1', e2: 'dragonfighters.equipAccessory2', st: 'dragonfighters.accessoryState', ids: 'dragonfighters.accessoryIds' };
const ACC_KEYS = [K.e1, K.e2, K.st, K.ids];
const HP_BONUS = 8;

/* セーブ (種) */
const BASE_LS = { 'dragonfighters.xp': '6000', 'dragonfighters.prologueSeen': '1' };
const pm = (a) => a.map((m, i) => Object.assign({ variant: 0, npcName: m.isHero ? undefined : 'N' + i, name: m.isHero ? '' : 'N' + i }, m));
const MAGE_PARTY = pm([{ classKey: 'warrior' }, { classKey: 'mage', isHero: true }]);
const WAR_PARTY = pm([{ classKey: 'warrior', isHero: true }, { classKey: 'mage' }]);
function seed(cls, party, ls) {
  const ss = { 'dragonfighters.partyComposition': J([cls]) };
  if (party) ss['dragonfighters.partyMembers'] = J(party);
  return { ss, ls: Object.assign({ 'dragonfighters.partyComposition': J([cls]) }, BASE_LS, ls || {}) };
}
const state = (allies) => J({ player: ['none', 'none'], allies });

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const I = 'index.html', TVN = 'tavern.html';
const SNAP = [I, TVN];
const PRISTINE = {};
for (const f of SNAP) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[I].indexOf('ACC_EQUIP_ON') < 0 || PRISTINE[TVN].indexOf('ACC_EQUIP_ON_TV') < 0) vetFail('#113 項目2 より前のツリーで走らせている');
let BASE_INDEX = null;
try { BASE_INDEX = cp.execFileSync('git', ['show', BASE_REV + ':index.html'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8'); }
catch (e) { vetFail('基準版 ' + BASE_REV + ':index.html が取れない: ' + String(e).slice(0, 200)); }
if (BASE_INDEX.indexOf('ACC_EQUIP_ON') >= 0) vetFail('基準版に #113 の実装が入っている (基準の取り違え)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。⚠ 置換は 1 行の中だけ (行数不変)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MUTATIONS = {
  /* §2-2 の再現: 主人公の枠を本人へ届けない */
  seat: [{ file: I, from: '      if (!ACC_EQUIP_ON || heroIsHead || !heroRef) return;', to: '      return; /* ★変異seat */' }],
  /* 保存で a.isHero を飛ばさない */
  heroinallies: [{ file: I, from: '          if (ACC_EQUIP_ON && a.isHero) continue;              // ★#113 主人公は equipAccessory1/2 が権威', to: '          /* ★変異heroinallies */ void 0;' }],
  /* §2-6: 勝利時の直書きを頭の枠へ戻す */
  winsave: [
    { file: I, from: '            (accessories[heroAccessoryIndices()[0]] || accessories[0]).id);', to: '            (accessories[currentAccessoryIndices[0]] || accessories[0]).id); /* ★変異winsave */' },
    { file: I, from: '            (accessories[heroAccessoryIndices()[1]] || accessories[0]).id);', to: '            (accessories[currentAccessoryIndices[1]] || accessories[0]).id); /* ★変異winsave */' },
  ],
  /* §2-5: 頭の交代の追加を消す */
  promote: [{ file: I, from: '      if (ACC_EQUIP_ON && Array.isArray(nh.accessoryIndices)) {   // ★#113 新しい頭は自分の品を持って頭になる', to: '      if (false) {   /* ★変異promote */' }],
  /* §2-7: 拾得の追加を消す */
  recipient: [{ file: I, from: '      if (ACC_EQUIP_ON && !heroIsHead && heroRef &&              // ★#113 後衛の主人公の空き枠を最優先', to: '      if (false && !heroIsHead && heroRef &&   /* ★変異recipient */' }],
  /* 着けたとき hp も増やす */
  healloop: [
    { file: I, from: '      if (unit === "player") { maxHp += d; hp = Math.min(hp, maxHp); }', to: '      if (unit === "player") { maxHp += d; hp = Math.min(hp + Math.max(0, d), maxHp); } /* ★変異healloop */' },
    { file: I, from: '      else { unit.maxHp = (unit.maxHp || 0) + d; unit.hp = Math.min(unit.hp, unit.maxHp); }', to: '      else { unit.maxHp = (unit.maxHp || 0) + d; unit.hp = Math.min(unit.hp + Math.max(0, d), unit.maxHp); } /* ★変異healloop */' },
  ],
  /* 装身具の分岐を dfSheetCanEdit より前へ */
  combatacc: [{ file: I, from: '      const ce = dfSheetCanEdit();', to: '      if (ACC_EQUIP_ON && Object.prototype.hasOwnProperty.call(DF_ACC_SLOT, kind)) return dfSheetEquipAcc(kind, idx); /* ★変異combatacc */ const ce = dfSheetCanEdit();' }],
  /* NPC から外さない */
  nomove: [
    { file: I, from: '        if (w) dfSetUnitAcc(w.unit, w.slot, 0);', to: '        /* ★変異nomove */ void w;' },
    { file: TVN, from: '          s.allies[w[0].classKey][w[0].slot] = "none";', to: '          /* ★変異nomove */ void s;' },
  ],
  /* 引き出しの条件を職業判定にする */
  npcdrawer: [{ file: TVN, from: '      if (ACC_EQUIP_ON_TV && m.isHero) {', to: '      if (ACC_EQUIP_ON_TV && m.classKey === getHeroClass()) { /* ★変異npcdrawer */' }],
  /* sessionStorage へ写さない (そのページだけはクエリで撤退できる = 「遷移先へ届かない」欠陥だけを再現) */
  offleak: [
    { file: I, from: '        if (/[?&]accequip=0(&|$)/.test(location.search)) sessionStorage.setItem("dragonfighters.accEquipOff", "1");', to: '        /* ★変異offleak */ void 0;' },
    { file: I, from: '        return sessionStorage.getItem("dragonfighters.accEquipOff") !== "1";', to: '        return sessionStorage.getItem("dragonfighters.accEquipOff") !== "1" && !/[?&]accequip=0(&|$)/.test(location.search); /* ★変異offleak */' },
    { file: TVN, from: '      if (/[?&]accequip=0(&|$)/.test(location.search)) sessionStorage.setItem("dragonfighters.accEquipOff", "1");', to: '      /* ★変異offleak */ void 0;' },
    { file: TVN, from: '      return sessionStorage.getItem("dragonfighters.accEquipOff") !== "1";', to: '      return sessionStorage.getItem("dragonfighters.accEquipOff") !== "1" && !/[?&]accequip=0(&|$)/.test(location.search); /* ★変異offleak */' },
  ],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-3)。 */
const NEG_EXPECT = {
  /* (1c)(1d)(3d)(4a)(4b)(4d)(5a)(5c) も赤 = 本人の枠に品が届かないと、先頭 NPC の枠も職業キーから作られず、
     種の品がすべて先頭 NPC / 空へずれる (これらの節はみな seat の結果を前提に測っている) */
  seat: ['(1a)', '(1c)', '(1d)', '(1e)', '(3d)', '(4a)', '(4b)', '(4d)', '(5a)', '(5c)'],
  heroinallies: ['(1d)'], winsave: ['(3f)'], promote: ['(5a)'], recipient: ['(5b)'],
  /* (4b) も赤 = NPC から移した amulet-health を主人公が着けるとき hp まで増え、「主人公の hp は変わらない」が崩れる */
  healloop: ['(3d)', '(3e)', '(4b)'], combatacc: ['(3c)'],
  /* (4c) も赤 = 編成に居ない職のキーから外すのも同じ 1 行 */
  nomove: ['(4b)', '(4c)'], npcdrawer: ['(2g)'], offleak: ['(7b)'],
};
/* 変異 → 時機しだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = { seat: [], heroinallies: [], winsave: [], promote: [], recipient: [], healloop: [], combatacc: [], nomove: [], npcdrawer: [], offleak: [] };
/* 依頼書 §8 の予想 (記録用。実走と違う所はログに出す) */
const NEG_PREDICTED = {
  seat: ['(1a)', '(1e)'], heroinallies: ['(1d)'], winsave: ['(3f)'], promote: ['(5a)'], recipient: ['(5b)'],
  healloop: ['(3d)', '(3e)'], combatacc: ['(3c)'], nomove: ['(4b)'], npcdrawer: ['(2g)'], offleak: ['(7b)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length !== 10) vetFail('変異は 10 本 (ポート 10781〜10790)');
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
  const out = Object.assign({}, PRISTINE);
  for (const e of MUTATIONS[key]) {
    const c = countOf(PRISTINE[e.file], e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + e.file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (e.from.indexOf('\n') >= 0 || e.to.indexOf('\n') >= 0) vetFail('変異 ' + key + ' が改行を含む');
    if (countOf(PRISTINE[e.file], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    if (countOf(out[e.file], e.from) !== 1) vetFail('変異 ' + key + ' の注入点が同じ変異の先行注入に食われた');
    out[e.file] = out[e.file].split(e.from).join(e.to);
  }
  for (const f of SNAP) if (out[f].split('\n').length !== PRISTINE[f].split('\n').length) vetFail('変異 ' + key + ' が ' + f + ' の行数を変えた');
  if (SNAP.every((f) => out[f] === PRISTINE[f])) vetFail('変異 ' + key + ' が何も変えていない');
  _mutCache[key] = out;
  return out;
}
for (const k of MUT_ORDER) servedFiles(k);
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本でちょうど 1 箇所・行数不変・他ドライバとアンカーの重なり 0 / 基準版 ' + BASE_REV);

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
  const baseBuf = Buffer.from(BASE_INDEX, 'utf8');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        res.on('error', () => {});
        const qs = req.url.split('?')[1] || '';
        let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (rel === '') rel = I;
        res.setHeader('Cache-Control', 'no-store');
        if (rel === I && /(^|&)base3700=1(&|$)/.test(qs)) { res.setHeader('Content-Type', MIME['.html']); res.end(baseBuf); return; }
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(2g)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(3e)', '(3f)', '(4a)', '(4b)', '(4c)', '(4d)', '(5a)', '(5b)', '(5c)', '(6a)', '(6b)', '(7a)', '(7b)'];
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
 * ページ操作 (⛔ 期待値の判定はここに書かない — 生の値だけ返す)
 * ══════════════════════════════════════════════════════════════════════════════ */
const PAGE_ERRS = [];
async function openPage(browser, port, file, query, sd) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => PAGE_ERRS.push(file + (query || '') + ': ' + String((e && e.message) || e).slice(0, 200)));
  page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((s) => {
    try {
      if (sessionStorage.getItem('__v113Seeded')) return;
      localStorage.clear();
      for (const k in s.ls) localStorage.setItem(k, s.ls[k]);
      sessionStorage.clear();
      for (const k in (s.ss || {})) sessionStorage.setItem(k, s.ss[k]);
      sessionStorage.setItem('__v113Seeded', '1');
    } catch (e) {}
  }, { ls: sd.ls, ss: sd.ss || {} });
  await page.goto('http://127.0.0.1:' + port + '/' + file + (query || ''), { waitUntil: 'load', timeout: 60000 });
  await waitReady(page, file);
  return page;
}
async function waitReady(page, file) {
  const cond = file === I ? 'window.DFSheet && window.__sheetEquip && typeof heroIsHead !== "undefined"'
    : 'window.DFSheet && window.__sheetEquipTV && window.__equipTV';
  await page.waitForFunction(cond, { timeout: 30000 });
  await sleep(1800);
}
const lsDump = (page) => page.evaluate(() => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('dragonfighters.') === 0) o[k] = localStorage.getItem(k); }
  return o;
});
function lsDiff(a, b) {
  const ks = new Set(Object.keys(a).concat(Object.keys(b)));
  return Array.from(ks).filter((k) => a[k] !== b[k]).sort();
}
const parseJ = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
/* ランタイムの読み取り (index) */
const READ = () => {
  const nm = (i) => (accessories[i] || accessories[0]).id;
  const hero = allies.find((a) => a && a.isHero);
  return {
    heroIsHead, leader: leaderClassKey, head: currentAccessoryIndices.map(nm), headMaxHp: maxHp, headHp: hp,
    heroSlots: hero ? hero.accessoryIndices.map(nm) : null, heroMaxHp: hero ? hero.maxHp : null, heroHp: hero ? hero.hp : null,
    heroDmg: heroRef ? getAccessoryDmgBonus(heroRef) : null, headDmg: getAccessoryDmgBonus('player'),
    heroAcc: window.__sheetEquip.heroAcc ? window.__sheetEquip.heroAcc() : null,
    allies: allies.filter((a) => a && Array.isArray(a.accessoryIndices)).map((a) => ({ ck: a.classKey, isHero: !!a.isHero, npc: a.npcName || '', acc: a.accessoryIndices.map(nm), maxHp: a.maxHp, hp: a.hp })),
  };
};
const accIdx = (page, id) => page.evaluate((x) => (typeof accessories !== 'undefined' ? accessories : ACCESSORIES_TV).findIndex((a) => a.id === x), id);
const accName = (page, id) => page.evaluate((x) => (typeof accessories !== 'undefined' ? accessories : ACCESSORIES_TV).find((a) => a.id === x).name, id);
async function sheetAcc(page) {
  return page.evaluate(() => {
    const q = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
    const rv = (k) => { const e = document.querySelector('[data-stat="' + k + '"] .rv') || document.querySelector('[data-stat="' + k + '"] .v'); return e ? e.textContent.trim() : null; };
    const ed = document.querySelector('#dfSheetSecEquip [data-equip-edit]');
    return {
      open: window.DFSheet.isOpen(), rows: q('#dfSheetSecEquip [data-equip-slot]').map((e) => e.getAttribute('data-equip-slot')),
      edit: ed ? ed.getAttribute('data-equip-edit') : null,
      reason: q('#dfSheetSecEquip [data-equip-reason]').map((e) => e.textContent),
      opts: q('.dfSheetEquipOpt').map((e) => ({ kind: e.getAttribute('data-equip-kind'), idx: +e.getAttribute('data-equip-idx'),
        off: e.classList.contains('off'), name: (e.querySelector('.en') || e).textContent, note: (e.querySelector('.es') || {}).textContent || '' })),
      cur1: rv('equip_accessory1'), cur2: rv('equip_accessory2'), ac: rv('ac'), damage: rv('damage'),
    };
  });
}
const optsOf = (si, kind) => si.opts.filter((o) => o.kind === kind);
async function tapOpt(page, kind, idx) {
  const sel = '.dfSheetEquipOpt[data-equip-kind="' + kind + '"][data-equip-idx="' + idx + '"]';
  const ok = await page.evaluate((q) => { const el = document.querySelector(q); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; }, sel);
  if (!ok) return { tapped: false, inside: false };
  await sleep(350);
  const pt = await page.evaluate((q) => {
    const el = document.querySelector(q);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const h = document.elementFromPoint(x, y);
    const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0 };   // ⚠ CDP の touch 座標は visual viewport 基準
    return { x: x - vv.offsetLeft, y: y - vv.offsetTop, inside: !!(h && el.contains(h)) };
  }, sel);
  await page.touchscreen.tap(pt.x, pt.y);
  await sleep(350);
  return { tapped: true, inside: pt.inside };
}
async function openSheetIndex(page) {
  const r = await page.evaluate(() => {
    const t = document.getElementById('partyToggleBtn');
    if (!t) return null; const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width };
  });
  if (r && r.w > 0) { await page.touchscreen.tap(r.x, r.y); await sleep(500); }
  return pressSheetBtn(page);
}
async function pressSheetBtn(page) {
  const b = await page.evaluate(() => {
    const el = document.getElementById('dfSheetBtn'); if (!el) return null;
    const q = el.getBoundingClientRect();
    const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0 };
    return { x: cx - vv.offsetLeft, y: cy - vv.offsetTop, onTop: !!(hit && (hit === el || el.contains(hit))) };
  });
  let via = 'none';
  if (b && b.onTop) { await page.touchscreen.tap(b.x, b.y); await sleep(450); via = 'tap'; }
  if (!(await page.evaluate(() => window.DFSheet.isOpen()))) { await page.evaluate(() => window.DFSheet.open()); via += '+open()'; await sleep(300); }
  return via;
}
async function retreatNow(page) {
  await page.evaluate(() => { if (!gameStarted) startGame(); });
  let enabled = false;
  for (let i = 0; i < 40 && !enabled; i++) {
    enabled = await page.evaluate(() => { const b = document.getElementById('retreatBtn'); return !!(b && !b.disabled && !encounterActive && !encounterRunning); });
    if (!enabled) await sleep(150);
  }
  if (!enabled) return { ok: false, why: 'retreatBtn が押せない' };
  const nav = page.waitForNavigation({ timeout: 30000 }).then(() => true, () => false);
  await page.evaluate(() => document.getElementById('retreatBtn').click());
  const navigated = await nav;
  await sleep(500);
  return { ok: navigated, url: page.url() };
}
async function gotoPage(page, port, file, query) {
  await page.goto('http://127.0.0.1:' + port + '/' + file + (query || ''), { waitUntil: 'load', timeout: 60000 });
  await waitReady(page, file);
}
/* 酒場: 編成を入れてマッチング画面を実際に出し、指定の席の引き出しを開く */
async function playMatch(page, members) {
  await page.evaluate((mem) => {
    const mk = (m) => ({ classKey: m[0], isHero: !!m[1], name: m[2] || '', zone: PARTY_ZONES[m[0]], variant: 0, level: 10 });
    selection.partyMembers = mem.map(mk);
    Promise.resolve(window.__pmTest.play(scenarios[0])).catch(() => {});
  }, members);
  for (let i = 0; i < 200; i++) { if (await page.evaluate(() => pmCols.length > 0 && pmOrdered.length > 0)) break; await sleep(100); }
  await sleep(4000);
}
const openDrawer = async (page, which) => {
  const i = await page.evaluate((w) => {
    const i = pmOrdered.findIndex((m) => m && (w === 'hero' ? m.isHero : (!m.isHero && m.classKey === w)));
    if (i >= 0) pmOpenDrawer(i);
    return i;
  }, which);
  await sleep(350);
  return i;
};
const drawerRead = (page) => page.evaluate(() => {
  const list = (id) => { const e = document.getElementById(id); return e ? Array.prototype.slice.call(e.querySelectorAll('.equipItem')).map((x) => ({ name: (x.querySelector('.eName') || x).textContent, spec: (x.querySelector('.eSpec') || {}).textContent || '' })) : null; };
  return {
    l0: list('pmDrawerAcc_0'), l1: list('pmDrawerAcc_1'), hasFold: !!document.getElementById('pmDrawerEquip'),
    chips: Array.prototype.slice.call(document.querySelectorAll('#pmDrawerEquipSummary .equipSlotChip')).map((c) => c.textContent),
    drawerIdx: window.__sheetEquipTV.drawerIdx(),
  };
});
const clickDrawerRow = (page, s, name) => page.evaluate((s, name) => {
  const f = document.getElementById('pmDrawerEquip'); if (f) f.open = true;
  const el = document.getElementById('pmDrawerAcc_' + s); if (!el) return false;
  const row = Array.prototype.slice.call(el.querySelectorAll('.equipItem')).find((x) => (x.querySelector('.eName') || x).textContent === name);
  if (!row) return false;
  row.click();
  return true;
}, s, name);
const tvSel = (page) => page.evaluate((K) => ({ s1: selection.equipAccessory1, s2: selection.equipAccessory2, l1: localStorage.getItem(K.e1), l2: localStorage.getItem(K.e2),
  state: localStorage.getItem(K.st) }), K);

/* ══════════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════════ */
async function runSuite(browser, port) {
  const R = mkResults();
  PAGE_ERRS.length = 0;
  const failRest = (ids, e) => { for (const id of ids) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.stack) || e).slice(0, 300)); };
  const sect = async (ids, fn) => { try { await fn(); } catch (e) { console.log('  ⛔ 例外 [' + ids.join(',') + ']: ' + String((e && e.stack) || e).slice(0, 500)); failRest(ids, e); } };
  const open = (file, query, sd) => openPage(browser, port, file, query, sd);
  const S0 = { head: {}, index: null, tavern: null };

  /* ── §1 本人へ届く ── */
  await sect(['(1a)'], async () => {
    const p = await open(I, '', seed('mage', MAGE_PARTY, { [K.e1]: G, [K.e2]: RP }));
    const v = await p.evaluate(READ); await p.close();
    S0.head.mage = v.heroIsHead;
    R.check('(1a)', '魔法使い + ガントレット: getAccessoryDmgBonus(heroRef)=2・先頭 NPC は 0・本人の枠に品', v.heroIsHead === false && v.heroDmg === 2 && v.headDmg === 0 && v.heroAcc[0] === G && v.heroSlots[0] === G && v.head[0] === 'none', { heroDmg: v.heroDmg, headDmg: v.headDmg, heroAcc: v.heroAcc, head: v.head });
  });
  await sect(['(1b)'], async () => {
    const p = await open(I, '', seed('warrior', WAR_PARTY, { [K.e1]: G, [K.e2]: RP }));
    const v = await p.evaluate(READ); await p.close();
    S0.head.warrior = v.heroIsHead;
    R.check('(1b)', '戦士: 頭に付く (従来どおり)', v.heroIsHead === true && v.headDmg === 2 && v.head[0] === G && v.head[1] === RP && v.heroAcc[0] === G, { head: v.head, headDmg: v.headDmg, heroAcc: v.heroAcc });
  });
  await sect(['(1c)'], async () => {
    const p = await open(I, '', seed('mage', MAGE_PARTY, { [K.ids]: J([B]), [K.st]: state({ warrior: [B, 'none'] }) }));
    const v = await p.evaluate(READ); await p.close();
    R.check('(1c)', 'allies[先頭 NPC の職] の品は先頭 NPC に付く (主人公には付かない)', v.heroIsHead === false && v.leader === 'warrior' && v.head[0] === B && v.heroAcc[0] === 'none', { leader: v.leader, head: v.head, heroAcc: v.heroAcc });
  });
  await sect(['(1d)'], async () => {
    const out = {};
    /* 同職の NPC が居る編成 / 居ない編成。⭐ 保存のあと読み直して、職業キーに主人公の品が混ざらないこと */
    const P2 = pm([{ classKey: 'warrior' }, { classKey: 'mage' }, { classKey: 'mage', isHero: true }]);
    for (const [nm, party, st] of [['withNpc', P2, { mage: [F, 'none'] }], ['noNpc', MAGE_PARTY, {}]]) {
      const sd = seed('mage', party, { [K.e1]: G, [K.ids]: J([G, F, RP]), [K.st]: state(st) });
      const p = await open(I, '', sd);
      const v0 = await p.evaluate(READ);
      await openSheetIndex(p);
      const t = await tapOpt(p, 'accessory2', await accIdx(p, RP));
      const ls = await lsDump(p);
      await gotoPage(p, port, I, '');
      const v1 = await p.evaluate(READ);
      await p.close();
      out[nm] = { hero0: v0.heroAcc, tap: t, saved: parseJ(ls[K.st], {}).allies, npc0: v0.allies.filter((a) => !a.isHero && a.ck === 'mage').map((a) => a.acc), npc1: v1.allies.filter((a) => !a.isHero && a.ck === 'mage').map((a) => a.acc), hero1: v1.heroAcc };
    }
    const w = out.withNpc, n = out.noNpc;
    const hasHeroItem = (arr) => !!arr && (arr.indexOf(G) >= 0 || arr.indexOf(RP) >= 0);
    R.check('(1d)', '主人公と同職の NPC に主人公の品が重複しない (読み込み・保存・再読み込み)',
      w.tap.inside && n.tap.inside && w.hero0[0] === G && J(w.npc0) === J([[F, 'none']]) && J(w.npc1) === J([[F, 'none']]) && !hasHeroItem((w.saved || {}).mage)
        && J(w.hero1) === J([G, RP]) && !(n.saved || {}).mage && J(n.hero1) === J([G, RP]), out);
  });
  await sect(['(1e)'], async () => {
    const p0 = await open(I, '', seed('mage', MAGE_PARTY, {})); const v0 = await p0.evaluate(READ); await p0.close();
    const p1 = await open(I, '', seed('mage', MAGE_PARTY, { [K.e1]: H })); const v1 = await p1.evaluate(READ); await p1.close();
    R.check('(1e)', 'amulet-health の魔法使い: 主人公の maxHp が +8・先頭 NPC は増えない', v1.heroMaxHp - v0.heroMaxHp === HP_BONUS && v1.headMaxHp === v0.headMaxHp, { base: [v0.heroMaxHp, v0.headMaxHp], withH: [v1.heroMaxHp, v1.headMaxHp] });
  });
  await sect(['(0a)'], async () => {
    R.check('(0a)', '主人公が頭 (戦士) と頭でない (魔法使い) が実際に両方起きた', S0.head.warrior === true && S0.head.mage === false, S0.head);
  });

  /* ── §2 酒場で着脱 ── */
  await sect(['(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2g)'], async () => {
    const p = await open(TVN, '', seed('mage', null, { [K.ids]: J([G, H, RP, ST]) }));
    await pressSheetBtn(p);
    const si0 = await sheetAcc(p);
    S0.tavern = { rows: si0.rows, n1: optsOf(si0, 'accessory1').length };
    const iG = await accIdx(p, G), nG = await accName(p, G);
    const noneName = await accName(p, 'none');
    const t1 = await tapOpt(p, 'accessory1', iG);
    const s1 = await tvSel(p), si1 = await sheetAcc(p);
    R.check('(2a)', 'シートのボタンで着ける → equipAccessory1 / selection / シートの表示が同じ品', t1.inside && s1.s1 === G && s1.l1 === G && si1.cur1 === nG, { t1, s1, cur: si1.cur1 });
    const t2 = await tapOpt(p, 'accessory1', 0);
    const s2 = await tvSel(p), si2 = await sheetAcc(p);
    R.check('(2b)', '「外す」→ none (localStorage / selection / シート)', t2.inside && s2.s1 === 'none' && s2.l1 === 'none' && si2.cur1 === noneName && !optsOf(si2, 'accessory1').some((o) => o.idx === 0), { t2, s2, cur: si2.cur1 });
    await p.evaluate(() => window.DFSheet.close());
    await playMatch(p, [['warrior', false, 'NW'], ['mage', true, ''], ['mage', false, 'NM'], ['rogue', false, 'NR']]);
    const hi = await openDrawer(p, 'hero');
    const d0 = await drawerRead(p);
    S0.drawer = { hi, l0: !!d0.l0, l1: !!d0.l1, n0: d0.l0 ? d0.l0.length : 0 };
    const clicked = await clickDrawerRow(p, 0, nG);
    await sleep(300);
    const s3 = await tvSel(p), d1 = await drawerRead(p);
    const card = await p.evaluate((i) => (pmCols[i] && pmCols[i].el ? pmCols[i].el.textContent : null), hi);
    R.check('(2c)', '引き出しの一覧で着ける → equipAccessory / 引き出しの「装備中」が同じ品・一覧は外す付きへ変わる (カードの本文は武器/防具/盾だけ = 記録のみ)',
      clicked && s3.s1 === G && s3.l1 === G && d1.chips.some((c) => c.indexOf(nG) >= 0) && d1.l0[0].name === '外す' && !d1.l0.some((r) => r.name === nG) && d1.drawerIdx === hi,
      { clicked, s3, chips: d1.chips, l0: d1.l0.map((r) => r.name), cardHasName: !!card && card.indexOf(nG) >= 0 });
    /* (2d) 引き出しを開いたままシートで変える → 引き出しが追随 / 逆向き */
    await p.evaluate(() => window.DFSheet.open());
    await sleep(300);
    const iH = await accIdx(p, H), nH = await accName(p, H);
    const t3 = await tapOpt(p, 'accessory2', iH);
    const s4 = await tvSel(p), d2 = await drawerRead(p);
    const nR = await accName(p, RP);
    const clicked2 = await clickDrawerRow(p, 1, nR);
    await sleep(300);
    const s5 = await tvSel(p), si5 = await sheetAcc(p), d3 = await drawerRead(p);
    R.check('(2d)', '引き出しを開いたままシートで変える → 引き出しが追随 / 引き出しで変える → 開いたシートが追随',
      t3.inside && s4.s2 === H && d2.chips.some((c) => c.indexOf(nH) >= 0) && d2.drawerIdx === hi && clicked2 && s5.s2 === RP && si5.open && si5.cur2 === nR && d3.chips.some((c) => c.indexOf(nR) >= 0),
      { t3, s4: s4.s2, chips: d2.chips, clicked2, s5: s5.s2, cur2: si5.cur2, open: si5.open });
    /* (2e) 同じ品を 2 枠に入れられない (今 G / RP) */
    const lsE0 = await lsDump(p);
    const direct = await p.evaluate((i) => window.__sheetEquipTV.equip('accessory2', i), iG);
    const lsE1 = await lsDump(p);
    const si6 = await sheetAcc(p), d4 = await drawerRead(p);
    R.check('(2e)', '同じ品を 2 枠に入れられない (シートの候補・引き出しの一覧に無い・直接 equip は拒否で何も書かない)',
      direct.ok === false && lsDiff(lsE0, lsE1).length === 0 && !optsOf(si6, 'accessory2').some((o) => o.idx === iG) && !d4.l1.some((r) => r.name === nG),
      { direct, diff: lsDiff(lsE0, lsE1), opts2: optsOf(si6, 'accessory2').map((o) => o.name), l1: d4.l1.map((r) => r.name) });
    await p.evaluate(() => window.DFSheet.close());
    await sleep(200);
    /* (2g) NPC のカードに一覧が出ない (主人公と同職の NPC を含む) */
    const npc = await p.evaluate(() => {
      const out = [];
      pmOrdered.forEach((m, i) => { if (m && !m.isHero) { pmOpenDrawer(i); out.push({ c: m.classKey, a0: !!document.getElementById('pmDrawerAcc_0'), a1: !!document.getElementById('pmDrawerAcc_1'), fold: !!document.getElementById('pmDrawerEquip') }); } });
      const hi = pmOrdered.findIndex((m) => m && m.isHero); pmOpenDrawer(hi);
      return { npc: out, hero: !!document.getElementById('pmDrawerAcc_0') };
    });
    R.check('(2g)', 'NPC のカードに一覧が出ない (主人公と同職の NPC のカードを含む)・主人公のカードには出る',
      npc.npc.length === 3 && npc.npc.some((x) => x.c === 'mage') && npc.npc.every((x) => !x.a0 && !x.a1 && x.fold) && npc.hero === true, npc);
    await p.close();
  });
  await sect(['(2f)'], async () => {
    const w = await open(TVN, '', seed('warrior', null, { [K.ids]: J([G, ST]) }));
    await pressSheetBtn(w);
    const iS = await accIdx(w, ST), nS = await accName(w, ST);
    const siW = await sheetAcc(w);
    const direct = await w.evaluate((i) => window.__sheetEquipTV.equip('accessory1', i), iS);
    await w.evaluate(() => window.DFSheet.close());
    await playMatch(w, [['warrior', true, ''], ['mage', false, 'NM']]);
    await openDrawer(w, 'hero');
    const dW = await drawerRead(w);
    await w.close();
    const m = await open(TVN, '', seed('mage', null, { [K.ids]: J([G, ST]) }));
    await pressSheetBtn(m);
    const siM = await sheetAcc(m);
    await m.close();
    const has = (si) => optsOf(si, 'accessory1').some((o) => o.idx === iS);
    R.check('(2f)', '魔法使い専用の品は戦士の候補に出ない (シート・引き出し・直接 equip は拒否) / 魔法使いには出る', !has(siW) && direct.ok === false && !!dW.l0 && !dW.l0.some((r) => r.name === nS) && has(siM),
      { warriorOpts: optsOf(siW, 'accessory1').map((o) => o.name), direct, l0: dW.l0 && dW.l0.map((r) => r.name), mageHas: has(siM) });
  });

  /* ── §3 ダンジョンで着脱 ── */
  await sect(['(3a)', '(3b)', '(3c)'], async () => {
    const p = await open(I, '', seed('mage', MAGE_PARTY, { [K.ids]: J([G, H, RP]) }));
    await openSheetIndex(p);
    const si0 = await sheetAcc(p);
    S0.index = { rows: si0.rows, n1: optsOf(si0, 'accessory1').length };
    const iG = await accIdx(p, G), nG = await accName(p, G), iR = await accIdx(p, RP), iH = await accIdx(p, H);
    const dmgBonus = (s) => { const m = /([+-]\d+)\s*$/.exec(s || ''); return m ? +m[1] : 0; };
    const t1 = await tapOpt(p, 'accessory1', iG);
    const v1 = await p.evaluate(READ), ls1 = await lsDump(p), si1 = await sheetAcc(p);
    const t2 = await tapOpt(p, 'accessory2', iR);
    const si2 = await sheetAcc(p);
    S0.d3a = { t1, heroAcc: v1.heroAcc, slots: v1.heroSlots, e1: ls1[K.e1], cur1: si1.cur1, heroDmg: v1.heroDmg, headDmg: v1.headDmg };
    S0.d3aOk = t1.inside && v1.heroAcc[0] === G && v1.heroSlots[0] === G && ls1[K.e1] === G && si1.cur1 === nG && v1.heroDmg === 2 && v1.headDmg === 0;
    const acDelta = (+si2.ac) - (+si0.ac), dmgDelta = dmgBonus(si1.damage) - dmgBonus(si0.damage);
    R.check('(3b)', '主人公が頭でないとき、シートの AC / ダメージ欄に装身具の分が乗る (+1 / +2)', t2.inside && acDelta === 1 && dmgDelta === 2, { ac: [si0.ac, si2.ac], dmg: [si0.damage, si1.damage] });
    /* (3c) 戦闘中 */
    await p.evaluate(() => { encounterActive = true; currentPhase = 'combat'; window.DFSheet.render(); });
    const siC = await sheetAcc(p);
    const accOpts = siC.opts.filter((o) => /accessory/.test(o.kind));
    const lsC0 = await lsDump(p);
    const vC0 = await p.evaluate(READ);
    const tC = await tapOpt(p, 'accessory1', iH);
    const direct = await p.evaluate((i) => window.__sheetEquip.equip('accessory1', i), iH);
    const lsC1 = await lsDump(p), vC1 = await p.evaluate(READ);
    await p.evaluate(() => { encounterActive = false; currentPhase = 'explore'; window.DFSheet.render(); });
    R.check('(3c)', '戦闘中は灰色・実タップも直接 equip も {ok:false} で何も書かない', accOpts.length >= 1 && accOpts.every((o) => o.off) && siC.edit === '0' && siC.reason.some((x) => /戦闘中/.test(x)) && tC.tapped && direct.ok === false
      && lsDiff(lsC0, lsC1).length === 0 && J(vC0.heroAcc) === J(vC1.heroAcc), { n: accOpts.length, edit: siC.edit, direct, diff: lsDiff(lsC0, lsC1), heroAcc: vC1.heroAcc });
    await p.close();
    /* 戦士 (頭) の実タップ */
    const w = await open(I, '', seed('warrior', WAR_PARTY, { [K.ids]: J([G, H, RP]) }));
    await openSheetIndex(w);
    const tW = await tapOpt(w, 'accessory1', await accIdx(w, G));
    const vW = await w.evaluate(READ), lsW = await lsDump(w), siW = await sheetAcc(w);
    await w.close();
    R.check('(3a)', '探索中に実タップで着ける → ランタイムの本人の枠・equipAccessory・シートが同じ品 (頭でない / 頭)',
      S0.d3aOk && tW.inside && vW.heroIsHead === true && vW.head[0] === G && vW.heroAcc[0] === G && lsW[K.e1] === G && siW.cur1 === nG, { mage: S0.d3a, warrior: { tW, head: vW.head, heroAcc: vW.heroAcc, e1: lsW[K.e1], cur1: siW.cur1 } });
  });
  await sect(['(3d)', '(3e)'], async () => {
    const run = async (cls, party) => {
      const p = await open(I, '', seed(cls, party, { [K.e1]: H, [K.ids]: J([H]) }));
      await openSheetIndex(p);
      const iH = await accIdx(p, H);
      const pick = (v) => (v.heroIsHead ? { max: v.headMaxHp, hp: v.headHp } : { max: v.heroMaxHp, hp: v.heroHp });
      const v0 = pick(await p.evaluate(READ));
      const tOff = await tapOpt(p, 'accessory1', 0);
      const v1 = pick(await p.evaluate(READ));
      const tOn = await tapOpt(p, 'accessory1', iH);
      const v2 = pick(await p.evaluate(READ));
      /* (3e) 体力を減らしてから 着→外→着 を繰り返す */
      await p.evaluate((d) => { if (heroIsHead) hp = d; else heroRef.hp = d; }, 12);
      const seq = [];
      for (let i = 0; i < 4; i++) {
        const v = pick(await p.evaluate(READ));
        const on = (await p.evaluate(() => window.__sheetEquip.heroAcc()[0])) !== 'none';
        const t = await tapOpt(p, 'accessory1', on ? 0 : iH);
        seq.push({ on, hp: v.hp, max: v.max, ok: t.inside });
      }
      const vEnd = pick(await p.evaluate(READ));
      await p.close();
      return { v0, v1, v2, tOff, tOn, seq, vEnd };
    };
    const m = await run('mage', MAGE_PARTY), w = await run('warrior', WAR_PARTY);
    const ok3d = (x) => x.tOff.inside && x.tOn.inside && x.v0.max - x.v1.max === HP_BONUS && x.v1.hp <= x.v1.max && x.v2.max - x.v1.max === HP_BONUS && x.v2.hp === x.v1.hp;
    const ok3e = (x) => x.seq.every((s) => s.ok && s.hp <= 12) && x.vEnd.hp <= 12;
    R.check('(3d)', 'amulet-health を外す → maxHp−8・hp≤maxHp / 着ける → maxHp+8・hp は増えない (頭でない / 頭)', ok3d(m) && ok3d(w), { mage: { v0: m.v0, v1: m.v1, v2: m.v2 }, warrior: { v0: w.v0, v1: w.v1, v2: w.v2 } });
    R.check('(3e)', '着→外→着 を繰り返しても hp が開始時 (12) を超えない (頭でない / 頭)', ok3e(m) && ok3e(w), { mage: m.seq.concat([m.vEnd]), warrior: w.seq.concat([w.vEnd]) });
  });
  await sect(['(3f)'], async () => {
    /* 撤退経路 */
    const p = await open(I, '', seed('mage', MAGE_PARTY, { [K.ids]: J([G, B]), [K.st]: state({ warrior: [B, 'none'] }) }));
    await openSheetIndex(p);
    const t = await tapOpt(p, 'accessory1', await accIdx(p, G));
    const rt = await retreatNow(p);
    const ls = await lsDump(p);
    await gotoPage(p, port, TVN, '');
    const sel = await tvSel(p);
    await p.evaluate(() => window.DFSheet.open()); await sleep(300);
    const si = await sheetAcc(p);
    const nG = await accName(p, G);
    await p.close();
    /* 勝利経路: 書き込みの列を記録 (最終値は savePersistentAccessoryStock が書き直すので、列で見る) */
    const pw = await open(I, '', seed('mage', MAGE_PARTY, { [K.ids]: J([G, B]), [K.st]: state({ warrior: [B, 'none'] }) }));
    await openSheetIndex(pw);
    const tw = await tapOpt(pw, 'accessory1', await accIdx(pw, G));
    const log = await pw.evaluate((K) => {
      const out = [];
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === K.e1 || k === K.e2) out.push([k === K.e1 ? 1 : 2, v]); return orig.call(this, k, v); };
      try { gameOver = true; resultShown = false; showResult(true); } finally { Storage.prototype.setItem = orig; }
      return out;
    }, K);
    await sleep(300);
    const lsW = await lsDump(pw);
    await pw.close();
    const allHero = log.length >= 4 && log.filter((x) => x[0] === 1).every((x) => x[1] === G) && log.filter((x) => x[0] === 2).every((x) => x[1] === 'none');
    R.check('(3f)', '撤退して酒場を開くとシートで選んだ品が装備中 / 勝利経路の書き込みはすべて主人公の品 (先頭 NPC の枠で書かない)',
      t.inside && rt.ok && ls[K.e1] === G && sel.s1 === G && si.cur1 === nG && tw.inside && allHero && lsW[K.e1] === G,
      { t, retreat: rt.ok, e1: ls[K.e1], sel: sel.s1, cur1: si.cur1, winLog: log, winFinal: lsW[K.e1] });
  });

  /* ── §4 NPC からの移動 ── */
  await sect(['(4a)', '(4b)'], async () => {
    /* 酒場 */
    const tv = await open(TVN, '', seed('mage', null, { [K.ids]: J([G]), [K.st]: state({ warrior: [G, 'none'] }) }));
    await pressSheetBtn(tv);
    const iG = await accIdx(tv, G);
    const siT = await sheetAcc(tv);
    const optT = optsOf(siT, 'accessory1').find((o) => o.idx === iG);
    const tT = await tapOpt(tv, 'accessory1', iG);
    const sT = await tvSel(tv);
    await tv.close();
    /* ダンジョン: 先頭 NPC / 頭でない NPC */
    const P3 = pm([{ classKey: 'warrior' }, { classKey: 'rogue' }, { classKey: 'mage', isHero: true }]);
    const runD = async (party, st) => {
      const p = await open(I, '', seed('mage', party, { [K.ids]: J([H]), [K.st]: state(st) }));
      await openSheetIndex(p);
      const iH = await accIdx(p, H);
      const si = await sheetAcc(p);
      const opt = optsOf(si, 'accessory1').find((o) => o.idx === iH);
      const v0 = await p.evaluate(READ);
      const t = await tapOpt(p, 'accessory1', iH);
      const v1 = await p.evaluate(READ);
      const ls = await lsDump(p);
      await p.close();
      return { opt, v0, v1, t, ls };
    };
    const dh = await runD(MAGE_PARTY, { warrior: [H, 'none'] });
    const da = await runD(P3, { rogue: [H, 'none'] });
    const rogue = (v) => v.allies.find((a) => a.ck === 'rogue');
    R.check('(4a)', 'NPC が着けている品が「(〇〇が着用中)」付きで候補に出る (酒場 / ダンジョンの先頭 NPC / 仲間)',
      !!optT && /が着用中/.test(optT.note) && !!dh.opt && /が着用中/.test(dh.opt.note) && !!da.opt && /が着用中/.test(da.opt.note), { tavern: optT, head: dh.opt, ally: da.opt });
    const stT = parseJ(sT.state, {}).allies || {};
    R.check('(4b)', '選ぶと主人公へ移り NPC の分が消える (酒場の accessoryState / ダンジョンの枠と最大 HP)',
      tT.inside && sT.s1 === G && stT.warrior && stT.warrior[0] === 'none'
        && dh.t.inside && dh.v0.head[0] === H && dh.v1.heroAcc[0] === H && dh.v1.head[0] === 'none' && dh.v0.headMaxHp - dh.v1.headMaxHp === HP_BONUS && dh.v1.heroMaxHp - dh.v0.heroMaxHp === HP_BONUS && dh.v1.heroHp === dh.v0.heroHp
        && da.t.inside && rogue(da.v0).acc[0] === H && rogue(da.v1).acc[0] === 'none' && rogue(da.v0).maxHp - rogue(da.v1).maxHp === HP_BONUS && da.v1.heroAcc[0] === H,
      { tavern: { tT, s1: sT.s1, warrior: stT.warrior }, head: { h0: dh.v0.head, h1: dh.v1.head, hero: dh.v1.heroAcc, max: [dh.v0.headMaxHp, dh.v1.headMaxHp, dh.v0.heroMaxHp, dh.v1.heroMaxHp] },
        ally: { r0: rogue(da.v0), r1: rogue(da.v1), hero: da.v1.heroAcc } });
  });
  await sect(['(4c)'], async () => {
    const p = await open(TVN, '', seed('mage', null, { [K.ids]: J([G]), [K.st]: state({ cleric: [G, 'none'] }) }));
    await p.evaluate(() => { selection.partyMembers = [{ classKey: 'warrior', isHero: false, name: 'NW' }, { classKey: 'mage', isHero: true, name: '' }]; });
    await pressSheetBtn(p);
    const iG = await accIdx(p, G);
    const si = await sheetAcc(p);
    const opt = optsOf(si, 'accessory1').find((o) => o.idx === iG);
    const t = await tapOpt(p, 'accessory1', iG);
    const s = await tvSel(p);
    const mem = await p.evaluate(() => selection.partyMembers.map((m) => m.classKey));
    await p.close();
    const al = parseJ(s.state, {}).allies || {};
    R.check('(4c)', '今回の編成に居ない職のキーが握っている品も移せる', mem.indexOf('cleric') < 0 && !!opt && /が着用中/.test(opt.note) && t.inside && s.s1 === G && al.cleric && al.cleric[0] === 'none', { mem, opt, t, s1: s.s1, cleric: al.cleric });
  });
  await sect(['(4d)'], async () => {
    const ids = J([SA, SA]);
    const tv = await open(TVN, '', seed('mage', null, { [K.ids]: ids, [K.st]: state({ warrior: [SA, 'none'] }) }));
    await pressSheetBtn(tv);
    const tT = await tapOpt(tv, 'accessory1', await accIdx(tv, SA));
    const sT = await tvSel(tv);
    await tv.close();
    const p = await open(I, '', seed('mage', MAGE_PARTY, { [K.ids]: ids, [K.st]: state({ warrior: [SA, 'none'] }) }));
    await openSheetIndex(p);
    const t = await tapOpt(p, 'accessory1', await accIdx(p, SA));
    const v = await p.evaluate(READ), ls = await lsDump(p);
    await p.close();
    const al = parseJ(sT.state, {}).allies || {};
    const stock = parseJ(ls[K.ids], []);
    R.check('(4d)', 'shadow-amulet を 2 個持っていれば NPC から外さない (酒場 / ダンジョン)',
      tT.inside && sT.s1 === SA && al.warrior && al.warrior[0] === SA && t.inside && v.heroAcc[0] === SA && v.head[0] === SA && stock.filter((x) => x === SA).length === 2,
      { tavern: { s1: sT.s1, warrior: al.warrior }, dungeon: { hero: v.heroAcc, head: v.head, stock } });
  });

  /* ── §5 頭の交代と拾得 ── */
  await sect(['(5a)'], async () => {
    /* ⭐ applyLeaderStats は最大 HP を CLASS_DEFS の素の値へ作り直すので、主人公の昇格では本人の maxHp を引き継ぐ。
       ⇒ Lv4 の種で「昇格の前後で最大 HP が同じ」(Lv の分が残る) と「品なしの昇格との差が +8」(hpBonus が残る) の両方を測る */
    const promote = async (extra) => {
      const p = await open(I, '', seed('mage', MAGE_PARTY, Object.assign({ 'dragonfighters.xp': '6000', [K.ids]: J([H, RP]), [K.st]: state({ warrior: [RP, 'none'] }) }, extra)));
      const v0 = await p.evaluate(READ);
      const r = await p.evaluate(() => { hp = 0; return onHeadDowned('test'); });
      await sleep(200);
      const v1 = await p.evaluate(() => { const nm = (i) => (accessories[i] || accessories[0]).id; savePersistentAccessoryStock(); return { heroIsHead, head: currentAccessoryIndices.map(nm), heroAcc: window.__sheetEquip.heroAcc(), maxHp, hp, bonus: getAccessoryHpBonus('player') }; });
      const ls = await lsDump(p);
      await p.close();
      return { v0, r, v1, e1: ls[K.e1] };
    };
    const a = await promote({ [K.e1]: H });
    const z = await promote({});
    R.check('(5a)', '主人公が頭へ昇格 → 本人の品のまま (死んだ頭の品を継がない)・hpBonus が乗ったまま (品なしの昇格より maxHp +8)・Lv の分も残る (昇格の前後で maxHp が同じ)',
      a.v0.heroIsHead === false && a.v0.head[0] === RP && a.r === true && a.v1.heroIsHead === true && a.v1.head[0] === H && a.v1.heroAcc[0] === H && a.v1.bonus === HP_BONUS
        && z.r === true && z.v1.head[0] === 'none' && a.v1.maxHp - z.v1.maxHp === HP_BONUS && a.v1.hp <= a.v1.maxHp && a.e1 === H
        && a.v0.heroMaxHp > 18 + HP_BONUS - 1 && a.v1.maxHp === a.v0.heroMaxHp && z.v1.maxHp === z.v0.heroMaxHp,
      { a: { v0head: a.v0.head, heroMaxHp: a.v0.heroMaxHp, v1: a.v1, e1: a.e1 }, z: { v1: z.v1 } });
  });
  await sect(['(5b)', '(5c)'], async () => {
    /* (5b) 主人公の枠が空き: 本番の付与関数 */
    const grant = (p, id) => p.evaluate((x) => { const i = accessories.findIndex((a) => a.id === x); const recipient = findAccessoryRecipient(x); grantMagicItemPick({ kind: 'accessory', idx: i, recipient }); return recipient && { kind: recipient.kind, hero: !!(recipient.ally && recipient.ally.isHero), slot: recipient.slot }; }, id);
    const p = await open(I, '', seed('mage', MAGE_PARTY, {}));
    const r1 = await grant(p, G);
    const v1 = await p.evaluate(READ), ls1 = await lsDump(p);
    await p.close();
    R.check('(5b)', '後衛の主人公の空き枠へ、拾った品が最優先で入る (永続化まで)', !!r1 && r1.kind === 'ally' && r1.hero && v1.heroAcc[0] === G && v1.head[0] === 'none' && ls1[K.e1] === G, { r1, hero: v1.heroAcc, head: v1.head, e1: ls1[K.e1] });
    /* (5c) 主人公の枠が埋まっている: 従来どおり他の人へ */
    const q = await open(I, '', seed('mage', MAGE_PARTY, { [K.e1]: H, [K.e2]: RP, [K.ids]: J([H, RP]) }));
    const r2 = await grant(q, G);
    const v2 = await q.evaluate(READ);
    await q.close();
    R.check('(5c)', '主人公の枠が埋まっていれば従来どおり他の人へ (先頭 NPC)', !!r2 && r2.kind === 'player' && v2.head[0] === G && J(v2.heroAcc) === J([H, RP]), { r2, hero: v2.heroAcc, head: v2.head });
  });

  /* ── §6 恒等 ── */
  await sect(['(6a)'], async () => {
    const P6 = pm([{ classKey: 'warrior', isHero: true }, { classKey: 'mage' }, { classKey: 'rogue' }]);
    const sd = seed('warrior', P6, { [K.e1]: G, [K.e2]: H, [K.ids]: J([G, H, F, RP, B]), [K.st]: J({ player: ['none', 'none'], allies: { mage: [F, 'none'] } }) });
    const measure = async (query) => {
      const p = await open(I, query, sd);
      const v = await p.evaluate((K) => {
        const nm = (i) => (accessories[i] || accessories[0]).id;
        const snap = () => ({ head: currentAccessoryIndices.map(nm), maxHp, allies: allies.filter(Boolean).map((a) => ({ ck: a.classKey, isHero: !!a.isHero, acc: (a.accessoryIndices || []).map(nm), maxHp: a.maxHp })) });
        const out = { heroIsHead, load: snap(), picks: [] };
        for (const id of ['ring-protection', 'belt-giant-strength', 'ring-fire-resist']) {
          const rc = findAccessoryRecipient(id);
          out.picks.push(rc ? { id, kind: rc.kind, slot: rc.slot, ally: rc.ally ? rc.ally.classKey : null } : { id, kind: null });
          if (rc) { const i = accessories.findIndex((a) => a.id === id); if (rc.kind === 'player') currentAccessoryIndices[rc.slot] = i; else rc.ally.accessoryIndices[rc.slot] = i; }
        }
        out.afterPick = snap();
        savePersistentAccessoryStock();
        out.ls = { e1: localStorage.getItem(K.e1), e2: localStorage.getItem(K.e2), st: localStorage.getItem(K.st), ids: localStorage.getItem(K.ids) };
        return out;
      }, K);
      await p.close();
      return v;
    };
    const base = await measure('?base3700=1');
    const head = await measure('');
    R.check('(6a)', 'heroIsHead=true の読み込み・拾得・保存が ' + BASE_REV + ' と完全に同じ',
      base.heroIsHead === true && head.heroIsHead === true && base.load.head[0] === G && J(base) === J(head), { same: J(base) === J(head), base: J(base).slice(0, 700), head: J(base) === J(head) ? '(同じ)' : J(head).slice(0, 700) });
  });
  await sect(['(6b)'], async () => {
    const out = [];
    const ls = { [K.e1]: G, [K.e2]: H, [K.ids]: J([G, H, F]), [K.st]: state({ mage: [F, 'none'] }),
      'dragonfighters.weaponIdx': '2', 'dragonfighters.armorIdx': '2', 'dragonfighters.shieldIdx': '1', 'dragonfighters.equipWeaponIdx': '2', 'dragonfighters.equipArmorIdx': '2', 'dragonfighters.equipShieldIdx': '1' };
    const run = async (label, file, sd, kinds) => {
      const p = await open(file, '', sd);
      if (file === I) await openSheetIndex(p); else await pressSheetBtn(p);
      const before = await lsDump(p);
      const taps = [];
      for (const kind of kinds) {
        const si = await sheetAcc(p);
        const o = optsOf(si, kind).find((x) => !x.off);
        if (!o) { taps.push({ kind, none: true }); continue; }
        const t = await tapOpt(p, kind, o.idx);
        taps.push({ kind, idx: o.idx, inside: t.inside });
      }
      const after = await lsDump(p);
      await p.close();
      const diff = lsDiff(before, after);
      out.push({ label, taps, diff, ok: taps.length === kinds.length && taps.every((t) => t.inside) && diff.length >= 1 && !diff.some((k) => ACC_KEYS.indexOf(k) >= 0) });
    };
    await run('index 戦士', I, seed('warrior', WAR_PARTY, ls), ['weapon', 'armor', 'shield']);
    await run('index 魔法使い', I, seed('mage', MAGE_PARTY, ls), ['weapon']);
    await run('tavern 戦士', TVN, seed('warrior', null, ls), ['weapon', 'armor']);
    R.check('(6b)', '武器・防具・盾の付け替えで equipAccessory1/2 と accessoryState (と accessoryIds) が変わらない', out.every((x) => x.ok), out);
  });

  /* ── §7 撤退 ── */
  await sect(['(7a)'], async () => {
    const p = await open(I, '?accequip=0', seed('mage', MAGE_PARTY, { [K.e1]: G, [K.ids]: J([G]) }));
    await openSheetIndex(p);
    const si = await sheetAcc(p); const v = await p.evaluate(READ);
    await p.close();
    const t = await open(TVN, '?accequip=0', seed('mage', null, { [K.ids]: J([G]) }));
    await pressSheetBtn(t);
    const siT = await sheetAcc(t);
    await t.evaluate(() => window.DFSheet.close());
    await playMatch(t, [['warrior', false, 'NW'], ['mage', true, '']]);
    await openDrawer(t, 'hero');
    const d = await drawerRead(t);
    await t.close();
    R.check('(7a)', '?accequip=0: シート 3 行・一覧なし・魔法使いの品は先頭 NPC へ (従来)',
      si.rows.length === 3 && v.head[0] === G && v.heroDmg === 0 && v.headDmg === 2 && siT.rows.length === 3 && d.hasFold && !d.l0 && !d.l1, { rows: si.rows, head: v.head, heroDmg: v.heroDmg, headDmg: v.headDmg, rowsT: siT.rows, fold: d.hasFold, l0: d.l0 });
  });
  await sect(['(7b)'], async () => {
    const p = await open(TVN, '?accequip=0', seed('mage', MAGE_PARTY, { [K.e1]: G, [K.ids]: J([G]) }));
    const flag = await p.evaluate(() => sessionStorage.getItem('dragonfighters.accEquipOff'));
    await gotoPage(p, port, I, '');
    await openSheetIndex(p);
    const si = await sheetAcc(p); const v = await p.evaluate(READ);
    const on = await p.evaluate('ACC_EQUIP_ON');
    const url = p.url();
    await p.close();
    R.check('(7b)', '酒場の ?accequip=0 が遷移先の index に届く (index の URL にクエリは無い)', flag === '1' && on === false && si.rows.length === 3 && v.head[0] === G && url.indexOf('accequip') < 0, { flag, on, rows: si.rows, head: v.head, url });
  });

  /* ── §0 装置 ── */
  await sect(['(0b)'], async () => {
    const t = S0.tavern || {}, x = S0.index || {}, d = S0.drawer || {};
    R.check('(0b)', '種の 3 品以上が候補に出ている / シートの装備区画が 5 行 (酒場・ダンジョン) / 引き出しの一覧が DOM にある',
      t.n1 >= 3 && x.n1 >= 3 && (t.rows || []).length === 5 && (x.rows || []).length === 5 && (t.rows || [])[3] === 'accessory1' && (x.rows || [])[4] === 'accessory2' && d.l0 && d.l1 && d.n0 >= 3, { tavern: t, index: x, drawer: d });
  });
  R.check('(0c)', '全ページで pageerror 0 件', PAGE_ERRS.length === 0, PAGE_ERRS.slice(0, 5));
  for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(判定が出ていない)', false, '');
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_accessory_equip_');
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
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + (maybe.length ? ' (確率で赤 ' + maybe.join(',') + ')' : '') + predDiff
            + ' / 実際に赤くなった=' + (red.join(',') || '(なし)') + ' → ' + (ok ? '✓ OK' : '✗ '
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, maybe, red, ok });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (必ず赤 ⊆ 赤 ⊆ 必ず赤 ∪ 確率で赤)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(12) + ' 担当 ' + r.want.join(',') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '') + ' / 赤 ' + (r.red.join(',') || '(なし)'));
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
