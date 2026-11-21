#!/usr/bin/env node
/*
 * verify_promote_growth.js — 実装依頼書 #115「先頭に立った仲間が、育った HP・命中・ダメージを持ったまま戦う」の受入ドライバ
 *   (依頼書 2026-11-21_promote-keeps-growth.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_promote_growth.js                         # 素 (port 10830)
 *   node tools/verify_promote_growth.js --negative              # 素の基準 + 変異 5 本 (port 10831〜10835)
 *   node tools/verify_promote_growth.js --negative --only off,nohp
 *   node tools/verify_promote_growth.js --mutate dmgdouble      # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 種 (Lv10 / Lv4 の XP・partyMembers) を入れて index.html を開き、昇格の前に allies[pickNextHeadIndex()] の
 *     「仲間としての実効値」を読み、nh.hp を半分へ減らしてから `hp = 0; onHeadDowned('verify')` で昇格させ、
 *     後で「頭としての実効値」を読んで突き合わせる。
 *   - ⭐ 2 経路: ① 昇格前の仲間の実効値との一致 ② CLASS_DEFS の素の値 + **このドライバが持つ Lv の表** (LV_TABLE。
 *     本番の LEVEL_PROGRESSION は読まない) と XP から独自に計算した Lv の期待値との一致。
 *     ① だけだと「仲間側も素の値だった」と同じ間違いを共有して緑になる。
 *   - (1c) は E (暗殺者の刃 +1 = 二重計上の罠を踏める) と G (戦士 Lv10 = 修正前は 5 → 3 に縮む) の両方で判定する
 *     (E は修正前でも 2 === 2 = 直ったかを見分けられない。依頼書 §12-1 の気づき 1)。
 *   - (1a) は装身具なしの例 (E/F/G/C)。装身具の HP の二重計上は (1f) の例 H だけで測る (担当を割るため)。
 *   - (3b) の「部屋を 1 つ遷移」: index は 1 回の潜行が 1 ページ (部屋の移動はページ内) なので、
 *     撤退スイッチが試されるのは「index をクエリなしで開き直したとき」= ?promotegrowth=0 で開いたタブで
 *     index.html をクエリなしで読み直し、そのタブで昇格させる (#114 (4b) と同じ形)。
 *   - ⛔ 測らないこと: 勝率・クリア率 / 頭と仲間の命中式の違い (§2-4。揃えないと決めてある)。
 *   - ⛔ 本番ファイルに測定シームを足さない (グローバルの読み取りと onHeadDowned の直叩きだけ)。
 *
 * ■ ⚠ 計測機構 (verify_accessory_equip.js と同型)
 *   - index.html は起動時に 1 回だけ readFileSync して凍結し、変異はメモリ上で差し替えて配る (ファイルは書き換えない)。
 *   - 起動時に全変異の注入点を原本で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     さらに (a) 自分のアンカーが他の tools/*.js に出てこない (b) 変異で書き換わる行が他ドライバのアンカー行
 *     (verify_accessory_equip の promote / verify_class_line の headstale など) と重ならない、を確かめる。崩れたら exit 3。
 *   - --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」。担当は --mutate の実走で決めた。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10830** (素) / 変異 **10831〜10835** (MUTATIONS の並び順)。
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
const PORT = parseInt(arg('port', '10830'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════════════════
 * 依頼書が決めた条件 (データ)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* ② の独自計算に使う Lv の表 (D&D 3.5: 戦士 d10・BAB 良 / 盗賊 d6・BAB 3/4 / 魔法使い d4・BAB 1/2、4 Lv ごとに主能力 +1。
   戦士の STR 上昇は命中とダメージへ追従)。⛔ 本番の LEVEL_PROGRESSION を読まない。 */
const LV_TABLE = {
  warrior: { hd: 10, bab: (lv) => lv, boost: 'str', boostAtk: true, boostDmg: true },
  rogue: { hd: 6, bab: (lv) => Math.floor(lv * 3 / 4), boost: 'dex', boostAtk: false, boostDmg: false },
  mage: { hd: 4, bab: (lv) => Math.floor(lv / 2), boost: 'int', boostAtk: false, boostDmg: false },
};
const STATS = ['str', 'dex', 'con', 'wis', 'int'];
/* 累積 XP = 500 × Lv × (Lv − 1) (CLAUDE.md の経験値設計)。Lv10 で頭打ち */
function lvFromXp(xp) { let lv = 1; for (let L = 2; L <= 10; L++) if (xp >= 500 * L * (L - 1)) lv = L; return lv; }
/* def = CLASS_DEFS[cls] の素の値 (ページから読む)。Lv の分はここで足す */
function expectAt(cls, def, lv) {
  const t = LV_TABLE[cls];
  const boosts = Math.floor(lv / 4);
  const e = { maxHp: (def.hpMax || 0) + (lv - 1) * t.hd, atk: (def.atkBonus || 0) + t.bab(lv) - t.bab(1) + (t.boostAtk ? boosts : 0),
    dmg: (def.dmgBonus || 0) + (t.boostDmg ? boosts : 0) };
  for (const s of STATS) e[s] = (def[s] || 0) + (s === t.boost ? boosts : 0);
  return e;
}
const HP_AMULET = 8;     // アミュレットオブヘルス
const DMG_GAUNTLET = 2;  // ガントレットオブオーガパワー

/* セーブ (種) */
const pm = (a) => a.map((m, i) => Object.assign({ variant: 0, npcName: m.isHero ? undefined : 'N' + i, name: m.isHero ? '' : 'N' + i }, m));
const P_WRM = pm([{ classKey: 'warrior' }, { classKey: 'rogue' }, { classKey: 'mage', isHero: true }]);
const P_RWM = pm([{ classKey: 'rogue' }, { classKey: 'warrior' }, { classKey: 'mage', isHero: true }]);
const P_WM = pm([{ classKey: 'warrior' }, { classKey: 'mage', isHero: true }]);
/* 例 (依頼書 §2-1 / §12-2)。wEnh = 新しい頭の武器の +N / accHp・accDmg = 装身具の分 (② の期待値に足す) */
const CASES = {
  E: { lab: 'E 戦士 NPC の頭が倒れ → 盗賊 NPC (Lv10・暗殺者の刃 +1 / 鎧 idx2)', xp: 45000, party: P_WRM, head: 'warrior', next: 'rogue', heroHead: false, wEnh: 1, accHp: 0, accDmg: 0,
    ls: { 'dragonfighters.allyEquip': J({ rogue: { weapon: 2, armor: 2, shield: 0 } }) } },
  F: { lab: 'F 同 Lv4・素装備', xp: 6000, party: P_WRM, head: 'warrior', next: 'rogue', heroHead: false, wEnh: 0, accHp: 0, accDmg: 0, ls: {} },
  G: { lab: 'G 盗賊 NPC の頭が倒れ → 戦士 NPC (Lv10)', xp: 45000, party: P_RWM, head: 'rogue', next: 'warrior', heroHead: false, wEnh: 0, accHp: 0, accDmg: 0, ls: {} },
  H: { lab: 'H 戦士 NPC の頭が倒れ → 盗賊 NPC (Lv10・アミュレットオブヘルス + ガントレット)', xp: 45000, party: P_WRM, head: 'warrior', next: 'rogue', heroHead: false, wEnh: 0, accHp: HP_AMULET, accDmg: DMG_GAUNTLET,
    ls: { 'dragonfighters.accessoryIds': J(['amulet-health', 'gauntlets-ogre-power']), 'dragonfighters.accessoryState': J({ player: ['none', 'none'], allies: { rogue: ['amulet-health', 'gauntlets-ogre-power'] } }) } },
  C: { lab: 'C 戦士 NPC の頭が倒れ → 主人公の魔法使い (Lv10)', xp: 45000, party: P_WM, head: 'warrior', next: 'mage', heroHead: true, wEnh: 0, accHp: 0, accDmg: 0, ls: {} },
};
function seed(c) {
  return {
    ls: Object.assign({ 'dragonfighters.xp': String(c.xp), 'dragonfighters.prologueSeen': '1', 'dragonfighters.partyComposition': J(['mage']) }, c.ls || {}),
    ss: { 'dragonfighters.partyComposition': J(['mage']), 'dragonfighters.partyMembers': J(c.party) },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const I = 'index.html';
const SNAP = [I];
const PRISTINE = {};
for (const f of SNAP) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[I].indexOf('const PROMOTE_GROWTH_ON = ') < 0) vetFail('#115 項目2 より前のツリーで走らせている (PROMOTE_GROWTH_ON が無い)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 5 本)。⚠ 置換は 1 行の中だけ (行数不変)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MUTATIONS = {
  /* 引き継ぎブロックを丸ごと止める (撤退スイッチの値はそのまま = 装身具の HP の足し直しも止まったまま) */
  off: [{ file: I, from: '      if (PROMOTE_GROWTH_ON) {   // ★#115', to: '      if (false) {   /* ★変異off */ // ★#115' }],
  /* §2-3-1 の罠: 焼き込まれた武器の +N を抜かない */
  dmgdouble: [{ file: I, from: 'playerStats.dmgBonus = (nh.dmgBonus | 0) - (nh._dmgEnhDelta | 0);', to: 'playerStats.dmgBonus = (nh.dmgBonus | 0); /* ★変異dmgdouble */' }],
  /* §2-3-2 の罠: 仲間の ac (鎧/盾の +N 焼き込み済み) を写す */
  accoverwrite: [{ file: I, from: '// ⛔ playerStats.ac は写さない', to: 'playerStats.ac = nh.ac; /* ★変異accoverwrite */ // ⛔ playerStats.ac は写さない' }],
  /* §2-3-3 の罠: 引き継ぎ後も NPC に装身具の HP を足し直す */
  hpdouble: [{ file: I, from: 'if (pb > 0 && !nh.isHero && !PROMOTE_GROWTH_ON) {', to: 'if (pb > 0 && !nh.isHero /* ★変異hpdouble */) {' }],
  /* 最大 HP だけ引き継がない */
  nohp: [{ file: I, from: 'if (nh.maxHp > 0) maxHp = nh.maxHp;', to: '/* ★変異nohp */ void 0;' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-3)。 */
const NEG_EXPECT = {
  /* 依頼書の予想 (1a)(1b)(1d) に加えて
     (1c) も赤 = G の戦士の dmgBonus が 5 → 3 (Lv の STR 上昇の分が消える)
     (1f) も赤 = H の最大 HP が 22 (撤退スイッチの値は ON のままなので、22077 の装身具の HP の足し直しも止まったまま)
     (1g) も赤 = 最大 HP が素の値へ縮み、半分へ減らした現在 HP (E 38 / G 60 / H 42) が素の最大 HP で頭打ちされる */
  off: ['(1a)', '(1b)', '(1c)', '(1d)', '(1f)', '(1g)'],
  dmgdouble: ['(1c)'],
  accoverwrite: ['(1e)'],
  hpdouble: ['(1f)'],
  /* (1g) も赤 = off と同じ理由 (現在 HP が素の最大 HP で頭打ち) */
  nohp: ['(1a)', '(1f)', '(1g)'],
};
/* 変異 → 時機しだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = { off: [], dmgdouble: [], accoverwrite: [], hpdouble: [], nohp: [] };
/* 依頼書 §8 の予想 (記録用。実走と違う所はログに出す) */
const NEG_PREDICTED = { off: ['(1a)', '(1b)', '(1d)'], dmgdouble: ['(1c)'], accoverwrite: ['(1e)'], hpdouble: ['(1f)'], nohp: ['(1a)', '(1f)'] };
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length !== 5) vetFail('変異は 5 本 (ポート 10831〜10835)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_MAYBE[k] || !NEG_PREDICTED[k])) vetFail('NEG_EXPECT / NEG_MAYBE / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length) vetFail('変異 ' + k + ' に必ず赤の節が無い');
  const both = NEG_EXPECT[k].filter((x) => NEG_MAYBE[k].indexOf(x) >= 0);
  if (both.length) vetFail('変異 ' + k + ' の ' + both.join(',') + ' が必ず赤と確率で赤の両方に居る');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
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
/* 他ドライバとの重なり (罠E)。
   (a) 自分のアンカーが他の tools/*.js に出てこない
   (b) 変異で書き換わる行 (原本の行) のコード部分 (行末コメントを除く) が、他の tools/*.js のどこにも出てこない
       = verify_accessory_equip の promote / verify_class_line の headstale などの変異アンカー行を、こちらの変異が壊さない。
       ⚠ 相手のアンカー文字列をこのファイルに書き写さない (相手の (a) が鳴る) */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self)
    .map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  const codePart = (line) => { const i = line.indexOf('//'); return (i >= 0 ? line.slice(0, i) : line).trim(); };
  const pl = PRISTINE[I].split('\n');
  let touched = 0;
  for (const k of MUT_ORDER) {
    for (const e of MUTATIONS[k]) {
      const core = e.from.trim();
      const clash = peers.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
      if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(','));
    }
    const ml = servedFiles(k)[I].split('\n');
    for (let i = 0; i < pl.length; i++) {
      if (pl[i] === ml[i]) continue;
      touched++;
      const cp0 = codePart(pl[i]);
      if (cp0.length < 12) continue;   // コメントだけの行 (accoverwrite) / 短すぎる断片は照合しない
      const clash = peers.filter((x) => x.s.indexOf(cp0) >= 0).map((x) => x.f);
      if (clash.length) vetFail('変異 ' + k + ' が書き換える ' + (i + 1) + ' 行目は他ドライバのアンカー行 (' + clash.join(',') + '): ' + cp0.slice(0, 120));
    }
  }
  if (touched !== MUT_ORDER.length) vetFail('変異で書き換わる行の数が ' + touched + ' (各 1 行 = ' + MUT_ORDER.length + ' のはず)');
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本でちょうど 1 箇所・各 1 行・行数不変・他ドライバとアンカー / 書き換え行の重なり 0');

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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(2a)', '(3a)', '(3b)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 600 : 1500));
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
async function openPage(browser, port, query, sd) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => PAGE_ERRS.push(I + (query || '') + ': ' + String((e && e.message) || e).slice(0, 200)));
  page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
  await page.evaluateOnNewDocument((s) => {
    try {
      if (sessionStorage.getItem('__v115Seeded')) return;   // 読み直し (3b) では種を入れ直さない (撤退の印を消さない)
      localStorage.clear();
      for (const k in s.ls) localStorage.setItem(k, s.ls[k]);
      sessionStorage.clear();
      for (const k in (s.ss || {})) sessionStorage.setItem(k, s.ss[k]);
      sessionStorage.setItem('__v115Seeded', '1');
    } catch (e) {}
  }, { ls: sd.ls, ss: sd.ss || {} });
  await gotoIndex(page, port, query);
  return page;
}
async function gotoIndex(page, port, query) {
  await page.goto('http://127.0.0.1:' + port + '/' + I + (query || ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof heroIsHead !== "undefined" && typeof allies !== "undefined" && typeof onHeadDowned === "function"', { timeout: 30000 });
  await sleep(1800);
}
/* 昇格の前後を読む (生の値) */
const PROMOTE = (cls) => {
  const head = () => ({
    cls: leaderClassKey, heroIsHead, maxHp, hp,
    ps: { atkBonus: playerStats.atkBonus, dmgBonus: playerStats.dmgBonus, ac: playerStats.ac, str: playerStats.str, dex: playerStats.dex, con: playerStats.con, wis: playerStats.wis, int: playerStats.int },
    curAtk: currentPlayerAtkBonus(), curDmg: currentPlayerDmgBonus(), curAc: currentPlayerAc(), wEnh: effectiveWeaponEnh('player'), accDmg: getAccessoryDmgBonus('player'),
  });
  const d = CLASS_DEFS[cls] || {};
  const def = { hpMax: d.hpMax, atkBonus: d.atkBonus, dmgBonus: d.dmgBonus, ac: d.ac, str: d.str, dex: d.dex, con: d.con, wis: d.wis, int: d.int };
  const on = (typeof PROMOTE_GROWTH_ON !== 'undefined') ? PROMOTE_GROWTH_ON : 'undef';
  let ss = null; try { ss = sessionStorage.getItem('dragonfighters.promoteGrowthOff'); } catch (e) {}
  const before = head();
  const ni = pickNextHeadIndex();
  const nh = allies[ni];
  if (!nh) return { on, ss, def, before, ni, ok: 'no-next' };
  nh.hp = Math.max(1, Math.floor(nh.maxHp / 2));   // (1g) 満タンに戻らないことを見るため半分へ
  const next = { cls: nh.classKey, isHero: !!nh.isHero, maxHp: nh.maxHp, hp: nh.hp, atkBonus: nh.atkBonus, dmgBonus: nh.dmgBonus, ac: nh.ac,
    str: nh.str, dex: nh.dex, con: nh.con, wis: nh.wis, int: nh.int, dmgEnhDelta: nh._dmgEnhDelta, acEnhDelta: nh._acEnhDelta,
    effDmg: effectiveAllyDmgBonus(nh), curAc: currentAllyAc(nh), accDmg: getAccessoryDmgBonus(nh) };
  hp = 0;
  const ok = onHeadDowned('verify');
  return { on, ss, def, before, ni, next, ok, after: head() };
};
async function promoteCase(open, key, query) {
  const c = CASES[key];
  const p = await open(query, seed(c));
  const v = await p.evaluate(PROMOTE, c.next);
  await p.close();
  return v;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════════ */
async function runSuite(browser, port) {
  const R = mkResults();
  PAGE_ERRS.length = 0;
  const failRest = (ids, e) => { for (const id of ids) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.stack) || e).slice(0, 300)); };
  const sect = async (ids, fn) => { try { await fn(); } catch (e) { console.log('  ⛔ 例外 [' + ids.join(',') + ']: ' + String((e && e.stack) || e).slice(0, 500)); failRest(ids, e); } };
  const open = (query, sd) => openPage(browser, port, query, sd);
  const ON = {}, OFF = {};

  /* ── 測る (素: 5 例 / 撤退: E・G・C) ── */
  await sect(['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(2a)', '(3a)'], async () => {
    for (const k of ['E', 'F', 'G', 'H', 'C']) ON[k] = await promoteCase(open, k, '');
    for (const k of ['E', 'G', 'C']) OFF[k] = await promoteCase(open, k, '?promotegrowth=0');
  });
  const exp = (k) => { const c = CASES[k], v = ON[k]; return expectAt(c.next, v.def, lvFromXp(c.xp)); };
  const brief = (k, v) => v && v.next ? { k, ok: v.ok, cls: v.after && v.after.cls, nh: { maxHp: v.next.maxHp, hp: v.next.hp, atk: v.next.atkBonus, dmg: v.next.dmgBonus, effDmg: v.next.effDmg, curAc: v.next.curAc },
    after: v.after && { maxHp: v.after.maxHp, hp: v.after.hp, curAtk: v.after.curAtk, curDmg: v.after.curDmg, curAc: v.after.curAc, wEnh: v.after.wEnh, ps: v.after.ps } } : { k, v };
  const each = (keys, fn) => { const bad = []; for (const k of keys) { let ok = false; try { ok = !!fn(k, ON[k], exp(k), CASES[k]); } catch (e) { ok = false; } if (!ok) bad.push(k); } return bad; };

  /* ── §0 装置 ── */
  await sect(['(0a)'], async () => {
    const all = Object.assign({}, ...Object.keys(ON).map((k) => ({ ['on' + k]: ON[k] })), ...Object.keys(OFF).map((k) => ({ ['off' + k]: OFF[k] })));
    const bad = Object.keys(all).filter((n) => {
      const v = all[n], c = CASES[n.slice(-1)];
      return !(v && v.ok === true && v.before.cls === c.head && v.before.heroIsHead === false && v.next.cls === c.next && v.next.isHero === c.heroHead
        && v.after.cls === c.next && v.after.heroIsHead === c.heroHead);
    });
    const onOk = Object.keys(ON).every((k) => ON[k].on === true) && Object.keys(OFF).every((k) => OFF[k].on === false);
    R.check('(0a)', '全例で onHeadDowned が true (昇格が起きた)・heroIsHead が期待どおり (C だけ true)・leaderClassKey が昇格した人の職 / PROMOTE_GROWTH_ON が素で true・撤退で false',
      bad.length === 0 && onOk && Object.keys(all).length === 8, { bad, on: Object.keys(all).map((n) => n + ':' + all[n].on + '/' + all[n].ok + '/' + (all[n].after && all[n].after.cls) + '/' + (all[n].after && all[n].after.heroIsHead)) });
  });
  await sect(['(0b)'], async () => {
    const bad = each(['E', 'F', 'G', 'H', 'C'], (k, v) => v.next.maxHp > v.def.hpMax && v.next.atkBonus > v.def.atkBonus);
    R.check('(0b)', '昇格前の仲間の値が素の値と違う (maxHp > CLASS_DEFS.hpMax・atkBonus > def.atkBonus) = 失うものが実在する', bad.length === 0,
      { bad, rows: ['E', 'F', 'G', 'H', 'C'].map((k) => k + ' maxHp ' + ON[k].def.hpMax + '→' + ON[k].next.maxHp + ' atk ' + ON[k].def.atkBonus + '→' + ON[k].next.atkBonus) });
  });
  await sect(['(0c)'], async () => {
    const e = ON.E.next;
    R.check('(0c)', 'E の盗賊は武器 +N が dmgBonus に焼き込まれている (_dmgEnhDelta ≥ 1) / 鎧の +N が ac に焼き込まれている (_acEnhDelta ≥ 1) = 罠 §2-3-1/2 を踏める種',
      e.dmgEnhDelta >= 1 && e.acEnhDelta >= 1 && ON.E.after.wEnh === CASES.E.wEnh, { dmgEnhDelta: e.dmgEnhDelta, acEnhDelta: e.acEnhDelta, wEnh: ON.E.after.wEnh });
  });

  /* ── §1 本体 ── */
  await sect(['(1a)'], async () => {
    const keys = ['E', 'F', 'G', 'C'];
    const bad = each(keys, (k, v, x) => v.after.maxHp === v.next.maxHp && v.after.maxHp === x.maxHp);
    R.check('(1a)', '最大 HP: 昇格後 maxHp === 昇格前の nh.maxHp (①) === def.hpMax + (Lv−1)×ヒットダイス (②) (E/F/G/C)', bad.length === 0,
      { bad, rows: keys.map((k) => k + ' 後 ' + ON[k].after.maxHp + ' / ① ' + ON[k].next.maxHp + ' / ② ' + exp(k).maxHp) });
  });
  await sect(['(1b)'], async () => {
    const keys = ['E', 'F', 'G', 'H', 'C'];
    const bad = each(keys, (k, v, x, c) => v.after.wEnh === c.wEnh && v.after.curAtk === v.next.atkBonus + v.after.wEnh && v.after.curAtk === x.atk + c.wEnh);
    R.check('(1b)', '命中: currentPlayerAtkBonus() === nh.atkBonus + effectiveWeaponEnh("player") (① / §2-4 の差を明示) === 素 + BAB の伸び (+ 戦士の STR 上昇) + 武器 +N (②)', bad.length === 0,
      { bad, rows: keys.map((k) => k + ' 後 ' + ON[k].after.curAtk + ' / ① ' + ON[k].next.atkBonus + '+' + ON[k].after.wEnh + ' / ② ' + exp(k).atk + '+' + CASES[k].wEnh) });
  });
  await sect(['(1c)'], async () => {
    const keys = ['E', 'F', 'G', 'H', 'C'];
    const bad = each(keys, (k, v, x, c) => v.after.curDmg === v.next.effDmg && v.after.curDmg === x.dmg + c.wEnh + c.accDmg);
    R.check('(1c)', 'ダメージ: currentPlayerDmgBonus() === 昇格前の effectiveAllyDmgBonus(nh) (①) === 素 (+ 戦士の STR 上昇) + 武器 +N + 装身具 (②)。⭐ E (二重計上なら 3) と G (修正前は 3) の両方',
      bad.length === 0, { bad, rows: keys.map((k) => k + ' 後 ' + ON[k].after.curDmg + ' / ① ' + ON[k].next.effDmg + ' / ② ' + (exp(k).dmg + CASES[k].wEnh + CASES[k].accDmg)) });
  });
  await sect(['(1d)'], async () => {
    const keys = ['E', 'F', 'G', 'H', 'C'];
    const bad = each(keys, (k, v, x) => STATS.every((s) => v.after.ps[s] === v.next[s] && v.after.ps[s] === x[s]));
    R.check('(1d)', '能力値: playerStats.str/dex/con/wis/int === nh.* (①) === 素 + 4 Lv ごとの主能力 +1 (②) (G 戦士 str 5・E 盗賊 dex 6・C 魔法使い int 6)', bad.length === 0,
      { bad, rows: keys.map((k) => k + ' 後 ' + STATS.map((s) => ON[k].after.ps[s]).join('/') + ' / ① ' + STATS.map((s) => ON[k].next[s]).join('/') + ' / ② ' + STATS.map((s) => exp(k)[s]).join('/')) });
  });
  await sect(['(1e)'], async () => {
    const keys = ['E', 'F', 'G', 'H', 'C'];
    const bad = each(keys, (k, v) => v.after.curAc === v.next.curAc && v.after.ps.ac === v.def.ac);
    R.check('(1e)', 'AC: currentPlayerAc() === 昇格前の currentAllyAc(nh)・playerStats.ac は CLASS_DEFS の素のまま (E 16 === 16。nh.ac を写さない)', bad.length === 0,
      { bad, rows: keys.map((k) => k + ' 後 ' + ON[k].after.curAc + ' (ps.ac ' + ON[k].after.ps.ac + ' / def ' + ON[k].def.ac + ') / ① ' + ON[k].next.curAc) });
  });
  await sect(['(1f)'], async () => {
    const v = ON.H, x = exp('H');
    R.check('(1f)', '例 H (アミュレットオブヘルスの盗賊が昇格): maxHp === nh.maxHp (①) === Lv の期待値 + 8 (②) = +8 は 1 回だけ',
      v.after.maxHp === v.next.maxHp && v.after.maxHp === x.maxHp + CASES.H.accHp, { after: v.after.maxHp, nh: v.next.maxHp, expect: x.maxHp + CASES.H.accHp });
  });
  await sect(['(1g)'], async () => {
    const keys = ['E', 'F', 'G', 'H', 'C'];
    const bad = each(keys, (k, v) => v.next.hp < v.next.maxHp && v.after.hp === v.next.hp);
    R.check('(1g)', '現在 HP: 昇格前に nh.hp を半分へ減らす → 昇格後 hp === nh.hp (満タンに戻らない・素の最大 HP で頭打ちされない)', bad.length === 0,
      { bad, rows: keys.map((k) => k + ' 後 ' + ON[k].after.hp + '/' + ON[k].after.maxHp + ' / nh ' + ON[k].next.hp + '/' + ON[k].next.maxHp) });
  });

  /* ── §2 恒等 ── */
  await sect(['(2a)'], async () => {
    const keys = ['E', 'G', 'C'];
    const pick = (v) => J({ cls: v.before.cls, heroIsHead: v.before.heroIsHead, maxHp: v.before.maxHp, hp: v.before.hp, ps: v.before.ps, curAtk: v.before.curAtk, curDmg: v.before.curDmg, curAc: v.before.curAc });
    const bad = keys.filter((k) => pick(ON[k]) !== pick(OFF[k]));
    R.check('(2a)', '起動時の頭 (昇格していない) の maxHp / playerStats / 実効値が ?promotegrowth=0 と素で一致 (E/G/C)', bad.length === 0,
      { bad, rows: keys.map((k) => k + (pick(ON[k]) === pick(OFF[k]) ? ' 同じ ' + pick(ON[k]).slice(0, 160) : ' 素 ' + pick(ON[k]) + ' / 撤退 ' + pick(OFF[k]))) });
  });

  /* ── §3 撤退 ── */
  const retreatOk = (k, v) => {
    if (k === 'C') return v.after.maxHp === v.next.maxHp && v.after.ps.atkBonus === v.def.atkBonus && v.after.ps.int === v.def.int;   // 主人公の最大 HP だけは 1a44ac8 のまま引き継ぐ
    return v.after.maxHp === v.def.hpMax && v.after.ps.atkBonus === v.def.atkBonus && v.after.ps.dmgBonus === v.def.dmgBonus && STATS.every((s) => v.after.ps[s] === (v.def[s] || 0));
  };
  await sect(['(3a)'], async () => {
    const keys = ['E', 'G', 'C'];
    const bad = keys.filter((k) => !retreatOk(k, OFF[k]));
    R.check('(3a)', '?promotegrowth=0: E/G の新しい頭は CLASS_DEFS の素の値 (maxHp・atkBonus・dmgBonus・能力値) へ戻る (§2-1 の表)・C の maxHp は 54 のまま (主人公の HP だけ引き継ぐ)', bad.length === 0,
      { bad, rows: keys.map((k) => k + ' 後 maxHp ' + OFF[k].after.maxHp + ' atk ' + OFF[k].after.ps.atkBonus + ' dmg ' + OFF[k].after.ps.dmgBonus + ' ' + STATS.map((s) => OFF[k].after.ps[s]).join('/')
        + ' / def ' + OFF[k].def.hpMax + ' ' + OFF[k].def.atkBonus + ' ' + OFF[k].def.dmgBonus + ' / nh.maxHp ' + OFF[k].next.maxHp) });
  });
  await sect(['(3b)'], async () => {
    const c = CASES.E;
    const p = await open('?promotegrowth=0', seed(c));
    const first = await p.evaluate(() => ({ on: PROMOTE_GROWTH_ON, ss: sessionStorage.getItem('dragonfighters.promoteGrowthOff'), url: location.href }));
    await gotoIndex(p, port, '');   // クエリなしで読み直す (= 次のページ / 部屋へ進んでも撤退が残るか)
    const v = await p.evaluate(PROMOTE, c.next);
    const url = p.url();
    await p.close();
    R.check('(3b)', '?promotegrowth=0 で入ったタブで index をクエリなしで開き直しても撤退のまま (sessionStorage の印) → 昇格した E の盗賊は素の値',
      first.on === false && first.ss === '1' && url.indexOf('promotegrowth') < 0 && v.on === false && v.ss === '1' && v.ok === true && v.after.cls === c.next && retreatOk('E', v),
      { first, url, on: v.on, ss: v.ss, ok: v.ok, after: v.after && { cls: v.after.cls, maxHp: v.after.maxHp, atk: v.after.ps.atkBonus, dex: v.after.ps.dex }, def: v.def });
  });

  R.check('(0d)', '全ページで pageerror 0 件', PAGE_ERRS.length === 0, PAGE_ERRS.slice(0, 5));
  if (R.some((r) => !r.ok)) console.log('  [詳細] ' + J(Object.keys(ON).map((k) => brief(k, ON[k]))).slice(0, 3000));
  for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(判定が出ていない)', false, '');
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_promote_growth_');
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
