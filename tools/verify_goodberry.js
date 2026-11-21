#!/usr/bin/env node
/*
 * verify_goodberry.js — 実装依頼書 #116「グッドベリー」(エルフが最初の部屋で木の実を 10 個作り、
 *   HP が半分を切った味方が手番の頭に 1 個ずつ食べて +1) の受入ドライバ (依頼書 2026-11-21_goodberry.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_goodberry.js                          # 素 (port 10860)
 *   node tools/verify_goodberry.js --negative               # 素の基準 + 変異 10 本 (port 10861〜10870)
 *   node tools/verify_goodberry.js --negative --only nested,inloop
 *   node tools/verify_goodberry.js --mutate rng             # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り (担当の節が赤くならない)
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *        または母集団 0 (素で「食べる口を通った手番」が 1 回も無い = (0c))
 *
 * ■ 方針 (依頼書 §8)
 *   - 種 (エルフが goodberry を習得済み・partySkills で 1 枠配分) を入れて index.html?diag=1 を開き、
 *     背景の進行 (heroAI / tryStartEncounter / moveEnemies) を止めてから startGame() を直接呼ぶ。
 *   - 手番はループの包みを再現して駆動する: RunChronicle.beginTurn(actor) → allyAttackTurn / playerAttackTurn → endTurn。
 *     ⭐ 食べた後の手番の続きは tryDrinkHealingPotion (呼び口の直後) を包んで「届いたか」で見る。
 *        速さと決定性のため、既定ではそこで番兵を投げて手番を打ち切る。(2c) だけは打ち切らずに最後まで回し、
 *        攻撃 / 呪文の記録 (allyBasicAttack・showRollAtAlly・呪文の枠の減り) が出るかを見る。
 *   - (2e) は手番の関数の直叩き (仲間 stunned / 主人公 sleepRemaining) に加えて、**本物の runEncounter** を 1 戦回す
 *     (変異 inloop = 食べる口をループの側へ移すと、眠っている仲間が食べる。直叩きではループを通らないので測れない)。
 *   - ⭐ 帰属は台帳の公開の口 RunChronicle.snapshot(null).members[].healed から読み、HP の実体 (hp / allies[i].hp) と
 *     袋の減り (goodberryPouch.count) の 2 経路で突き合わせる。
 *   - (5a) 乱数: 袋が無い戦闘 (エルフ無し) と ?goodberry=0 の戦闘で、食べる口を同じ並びで呼んだときの
 *     Math.random の呼び出し回数がどちらも 0 (= 食べる口を外した対照と同じ)。さらに素のページで、食べなかった
 *     (false を返した) 呼び出しの中の乱数が 0 回。⚠ 非同期の手番を挟むと背景の乱数が混ざるので、数えるのは同期区間だけ。
 *   - (6a)(6b) 抽選の母集団: pickScrollId({common:100}) の 2 回の Math.random を差し替えて全区間を掃き、
 *     common の候補集合を直接得る。
 *   - ⛔ 測らないこと: 1 個あたりの回復量の手応え・帯の秒数・mpCost の値 (§8)。
 *     「満タンで切れる」は整数 HP で hp < maxHp/2 なら hp+1 ≤ maxHp が常に成り立つので到達しない (判定は hp ≤ maxHp だけ見る)。
 *   - ⛔ 本番ファイルに測定シームを足さない (グローバルの読み取り・包み・直叩きだけ)。
 *
 * ■ ⚠ 計測機構 (verify_promote_growth.js と同型)
 *   - index.html は起動時に 1 回だけ readFileSync して凍結し、変異はメモリ上で差し替えて配る (ファイルは書き換えない)。
 *   - 変異の注入点は原本でちょうど 1 件・注入文字列が原本に無い・行数不変、を起動時に検算する。
 *     複数行のアンカーは '\n' で書き、原本の行末 (CRLF) に合わせて照合する。
 *     さらに (a) 自分のアンカーが他の tools/*.js に出てこない (b) 変異で書き換わる行のコード部分が他ドライバに出てこない。
 *     ⚠ verify_run_chronicle の N1 のアンカー (__chSnap の行) は使わない・書き換えない (inloop は 1 行上の行へ注入する)。
 *   - --negative の合否 = 「担当 (NEG_EXPECT) ⊆ 実際の赤」。担当外の赤は記録する (依頼書の指示: 赤くならなければ exit 1)。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10860** (素) / 変異 **10861〜10870** (MUTATIONS の並び順)。
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
const PORT = parseInt(arg('port', '10860'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════════════════
 * 種 (セーブ)
 * ══════════════════════════════════════════════════════════════════════════════ */
const GB_COUNT = 10;   // 依頼書 §1 (SRD: 最大 10 個)
const pm = (a) => a.map((m, i) => Object.assign({ variant: 0, npcName: m.isHero ? undefined : 'N' + i, name: m.isHero ? '' : 'N' + i }, m));
const KNOWN = J({ elf: ['aimed-shot', 'magic-arrow', 'hunters-mark', 'cure-minor', 'goodberry'] });
const SKILLS = J({ elf: ['goodberry', 'cure-minor'] });   // ⚠ 配列で渡す ({goodberry:1} の形だと配分に入らない)
/* 編成。仲間の名前は N<i> (i = partyMembers の並び) */
const PARTY = {
  main: { hero: 'warrior', party: pm([{ classKey: 'warrior', isHero: true }, { classKey: 'elf' }, { classKey: 'warrior' }, { classKey: 'warrior' }]) },
  heroElf: { hero: 'elf', party: pm([{ classKey: 'elf', isHero: true }, { classKey: 'elf' }, { classKey: 'warrior' }, { classKey: 'warrior' }]) },
  twoElves: { hero: 'warrior', party: pm([{ classKey: 'warrior', isHero: true }, { classKey: 'elf' }, { classKey: 'elf' }, { classKey: 'warrior' }]) },
  noElf: { hero: 'warrior', party: pm([{ classKey: 'warrior', isHero: true }, { classKey: 'warrior' }, { classKey: 'warrior' }, { classKey: 'warrior' }]) },
};
function seed(key) {
  const c = PARTY[key];
  return {
    ls: { 'dragonfighters.xp': '0', 'dragonfighters.prologueSeen': '1', 'dragonfighters.partyComposition': J([c.hero]),
      'dragonfighters.knownSpells': KNOWN, 'dragonfighters.partySkills': SKILLS, 'dragonfighters.plazaInventory': J({ potion_healing: 0 }) },
    ss: { 'dragonfighters.partyComposition': J([c.hero]), 'dragonfighters.partyMembers': J(c.party) },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const I = 'index.html';
const T = 'tavern.html';
const SNAP = [I];
const PRISTINE = {};
for (const f of SNAP) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const TAVERN = fs.readFileSync(path.join(ROOT, T), 'utf8');
const EOL = /\r\n/.test(PRISTINE[I]) ? '\r\n' : '\n';
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[I].indexOf('function tryEatGoodberry(unit)') < 0) vetFail('#116 項目2 より前のツリーで走らせている (tryEatGoodberry が無い)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。⚠ 行数は変えない (行の中身だけを差し替える)。
 *   from / to の '\n' は原本の行末へ読み替える。
 * ══════════════════════════════════════════════════════════════════════════════ */
const EAT_ALLY = '      tryEatGoodberry(ally);';
const EAT_PLAYER = '      tryEatGoodberry("player");';
const MUTATIONS = {
  /* 罠 A: 袋を plazaInventory (localStorage) にも作る */
  inpouch: [{ file: I, from: '      goodberryPouch = { count: GOODBERRY_COUNT, owner: caster.owner, ownerName: caster.name };',
    to: '      goodberryPouch = { count: GOODBERRY_COUNT, owner: caster.owner, ownerName: caster.name }; addChargeItem("goodberry"); /* ★変異inpouch */' }],
  /* 罠 B: creditHealTo の代わりに beginTurn(owner) / endTurn で包む (入れ子は no-op) */
  nested: [{ file: I, from: '      RunChronicle.creditHealTo(goodberryPouch.owner === "player" ? { head: true } : goodberryPouch.owner,',
    to: '      { const __gbNest = RunChronicle.beginTurn(goodberryPouch.owner === "player" ? { kind: "player" } : { kind: "ally", ally: goodberryPouch.owner }); RunChronicle.endTurn(__gbNest); } void (0, /* ★変異nested */' }],
  /* 罠 B: 基準の直しを外す (食べた本人の手番の差分にも +1 = 二重計上) */
  nobaseline: [
    { file: I, from: '            if (openSnap.head != null) openSnap.head += delta;', to: '            /* ★変異nobaseline (頭) */ void 0;' },
    { file: I, from: '            if (i >= 0 && i < openSnap.allies.length && openSnap.allies[i] != null) openSnap.allies[i] += delta;', to: '            /* ★変異nobaseline (仲間) */ void i;' },
  ],
  /* 罠 C: 食べる口を手番の関数から外し、手番のループ (__chSnap の手前) へ移す。
     ⚠ __chSnap の行は verify_run_chronicle N1 のアンカーなので触らず、1 つ上の行 (カメラ寄せ) の末尾へ足す */
  inloop: [
    { file: I, from: EAT_ALLY, to: '      /* ★変異inloop: 仲間の口はループへ移した */' },
    { file: I, from: EAT_PLAYER, to: '      /* ★変異inloop: 主人公の口はループへ移した */' },
    { file: I, from: '            const actorFocus = actorWorldCenter(actor);',
      to: '            const actorFocus = actorWorldCenter(actor); if (actor.kind === "ally") tryEatGoodberry(actor.ally); else if (actor.kind === "player") tryEatGoodberry("player"); /* ★変異inloop */' },
  ],
  /* 食べたら手番を終える */
  endsturn: [
    { file: I, from: EAT_ALLY, to: '      if (tryEatGoodberry(ally)) return; /* ★変異endsturn */' },
    { file: I, from: EAT_PLAYER, to: '      if (tryEatGoodberry("player")) return; /* ★変異endsturn */' },
  ],
  /* 1 手番に何個でも */
  multi: [
    { file: I, from: EAT_ALLY, to: '      while (tryEatGoodberry(ally)); /* ★変異multi */' },
    { file: I, from: EAT_PLAYER, to: '      while (tryEatGoodberry("player")); /* ★変異multi */' },
  ],
  /* 条件を hp < maxHp に (⚠ 同じ条件の行が tryDrinkHealingPotion にもあるので次の行まで含めて 1 件にする) */
  fullhp: [{ file: I,
    from: '      if (isPlayer ? !(hp > 0 && hp < maxHp / 2) : !(unit && unit.alive && unit.hp < unit.maxHp / 2 && !unit.isSummon)) return false;\n      goodberryPouch.count--;',
    to: '      if (isPlayer ? !(hp > 0 && hp < maxHp) : !(unit && unit.alive && unit.hp < unit.maxHp && !unit.isSummon)) return false; /* ★変異fullhp */\n      goodberryPouch.count--;' }],
  /* 早期 return の前に乱数を 1 回引く */
  rng: [{ file: I, from: '      if (!goodberryPouch || goodberryPouch.count <= 0 || !isGoodberryOn()) return false;',
    to: '      Math.random(); /* ★変異rng */ if (!goodberryPouch || goodberryPouch.count <= 0 || !isGoodberryOn()) return false;' }],
  /* 抽選の行から撤退スイッチを外す */
  poolleak: [{ file: I, from: ' && (isGoodberryOn() || id !== "grimoire-goodberry"));', to: '); /* ★変異poolleak */' }],
  /* 術者探しで見つかった全員の枠を減らす (break を飛ばす) */
  twocast: [{ file: I, from: '          if (consumeSpellSlot(a, GB_ID)) caster = { owner: a, name: a.npcName || (a.def && a.def.name) || "エルフ" };',
    to: '          if (consumeSpellSlot(a, GB_ID) && !caster) caster = { owner: a, name: a.npcName || (a.def && a.def.name) || "エルフ" }; continue; /* ★変異twocast */' }],
};
/* 変異 → 赤くなるべき節 (担当)。依頼書 §8 の表。⚠ 担当外の赤は --mutate の実走で記録する (NEG_ALSO = 実測で赤くなった担当外の節)。 */
const NEG_EXPECT = {
  inpouch: ['(4a)'], nested: ['(3a)'], nobaseline: ['(3a)'], inloop: ['(2e)'], endsturn: ['(2c)'],
  multi: ['(2d)'], fullhp: ['(2b)'], rng: ['(5a)'], poolleak: ['(6a)'], twocast: ['(1c)'],
};
/* 担当外で赤くなると実走で確かめた節 (記録用。⚠ 合否には使わない = 依頼書の指示)。2026-11-21 の --negative 実走の値。
   - nested / nobaseline → (3b) も赤 (倒れたエルフへの帰属も同じ口を通る)
   - inloop → 手番の関数の中の口が消えるので、手番の直叩きで測る節が軒並み赤 ((0c) 口を通った回数 0 / (2b) calls 0 /
     (5a) 食べなかった呼び出しが 4 回しか無い)。担当の (2e) は本物の runEncounter の腕でだけ赤 (眠っている 7 手番で 7 個食べた)
   - multi → 1 手番で袋が 9〜10 個減るので、後の (2a)(2c)(3a)(3b)(3c) の前提 (袋が残っている・食べた数 4) も崩れる
   - poolleak → (6b) も赤 (素と撤退の候補の差が 0 冊になる) */
const NEG_ALSO = {
  inpouch: [], nested: ['(3b)'], nobaseline: ['(3b)'],
  inloop: ['(0c)', '(2a)', '(2b)', '(2c)', '(2d)', '(3a)', '(3b)', '(3c)', '(5a)'], endsturn: [],
  multi: ['(2a)', '(2c)', '(3a)', '(3b)', '(3c)'], fullhp: [], rng: [], poolleak: ['(6b)'], twocast: [],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length !== 10) vetFail('変異は 10 本 (ポート 10861〜10870)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_ALSO[k] || !NEG_EXPECT[k].length)) vetFail('NEG_EXPECT / NEG_ALSO と MUTATIONS が揃っていない');
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
const eol = (s) => s.split('\n').join(EOL);
const _mutCache = {};
function servedFiles(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key]) return _mutCache[key];
  const out = Object.assign({}, PRISTINE);
  for (const e of MUTATIONS[key]) {
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
/* 他ドライバとの重なり (罠E)。(a) 自分のアンカーが他の tools/*.js に出てこない
   (b) 変異で書き換わる行のコード部分 (行末コメントを除く) が他の tools/*.js に出てこない */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self)
    .map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  const codePart = (line) => { const i = line.indexOf('//'); return (i >= 0 ? line.slice(0, i) : line).trim(); };
  const pl = PRISTINE[I].split('\n');
  for (const k of MUT_ORDER) {
    for (const e of MUTATIONS[k]) {
      for (const core of e.from.split('\n').map((s) => s.trim()).filter((s) => s.length >= 12)) {
        const clash = peers.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
        if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(',') + ' :: ' + core.slice(0, 100));
      }
    }
    const ml = servedFiles(k)[I].split('\n');
    for (let i = 0; i < pl.length; i++) {
      if (pl[i] === ml[i]) continue;
      const cp0 = codePart(pl[i]);
      if (cp0.length < 12) continue;
      const clash = peers.filter((x) => x.s.indexOf(cp0) >= 0).map((x) => x.f);
      if (clash.length) vetFail('変異 ' + k + ' が書き換える ' + (i + 1) + ' 行目は他ドライバのアンカー行 (' + clash.join(',') + '): ' + cp0.slice(0, 120));
    }
  }
}
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本でちょうど 1 箇所・行数不変・他ドライバとアンカー / 書き換え行の重なり 0 (行末 ' + (EOL === '\r\n' ? 'CRLF' : 'LF') + ')');

/* ══════════════════════════════════════════════════════════════════════════════
 * (0a) ソースの母集団 (原本で数える。変異は index の定義を変えない)
 * ══════════════════════════════════════════════════════════════════════════════ */
function sourceCensus() {
  const ix = PRISTINE[I];
  const out = {};
  const elfAt = ix.indexOf('const ELF_SKILLS = {');
  const defRe = /"goodberry":\s*\{[^}]*name:\s*"グッドベリー"[^}]*\}/g;
  const defs = []; let m;
  while ((m = defRe.exec(ix))) defs.push({ at: m.index, s: m[0] });
  out.elfSkillsAt = elfAt;
  out.defs = defs.length;
  out.defInElf = defs.length === 1 && elfAt >= 0 && defs[0].at > elfAt;
  out.defOutOfCombat = defs.length === 1 && /outOfCombat:\s*true/.test(defs[0].s);
  const uiRe = /^\s*\{\s*id:\s*"goodberry"[^\n]*\}\s*,?\s*$/gm;
  const ui = TAVERN.match(uiRe) || [];
  out.ui = ui.length;
  out.uiAutoCast = ui.length === 1 && /autoCast:\s*true/.test(ui[0]);
  out.uiAfterElfUi = ui.length === 1 && TAVERN.indexOf(ui[0]) > TAVERN.indexOf('const ELF_SKILLS_UI = [');
  const grRe = /^\s*"grimoire-goodberry":\s*\{[^\n]*\}\s*,?\s*$/gm;
  const gi = ix.match(grRe) || [], gt = TAVERN.match(grRe) || [];
  out.grIndex = gi.length; out.grTavern = gt.length;
  out.grSame = gi.length === 1 && gt.length === 1 && gi[0].trim() === gt[0].trim();
  out.grCommon = gi.length === 1 && /spellId:\s*"goodberry"/.test(gi[0]) && /classKey:\s*"elf"/.test(gi[0]) && /rarity:\s*"common"\s*\}/.test(gi[0]);
  out.grLine = gi.length ? gi[0].trim() : null;
  return out;
}

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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)',
  '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(2g)', '(3a)', '(3b)', '(3c)', '(4a)', '(4b)', '(5a)', '(6a)', '(6b)'];
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
 * ページ内の装置 (⛔ 期待値の判定はここに書かない — 生の値だけ返す)
 * ══════════════════════════════════════════════════════════════════════════════ */
const PAGE_ERRS = [];
async function openPage(browser, port, query, sd, lab) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => PAGE_ERRS.push(lab + ': ' + String((e && e.message) || e).slice(0, 200)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /encounter error/.test(t)) PAGE_ERRS.push(lab + ' runEncounter :: ' + t.slice(0, 200)); });
  page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
  await page.evaluateOnNewDocument((s) => {
    try {
      if (sessionStorage.getItem('__v116Seeded')) return;   // 読み直し (4b) では種を入れ直さない
      localStorage.clear();
      for (const k in s.ls) localStorage.setItem(k, s.ls[k]);
      sessionStorage.clear();
      for (const k in (s.ss || {})) sessionStorage.setItem(k, s.ss[k]);
      sessionStorage.setItem('__v116Seeded', '1');
    } catch (e) {}
  }, { ls: sd.ls, ss: sd.ss || {} });
  await gotoIndex(page, port, query);
  return page;
}
async function gotoIndex(page, port, query) {
  await page.goto('http://127.0.0.1:' + port + '/' + I + '?diag=1' + (query || ''), { waitUntil: 'load', timeout: 90000 });
  /* ⚠ 裸の識別子で待つ (classic script 直下の let/const は window に載らない) */
  await page.waitForFunction(() => { try { return typeof allies !== 'undefined' && allies.length > 0 && typeof RUN !== 'undefined' && !!RUN && !!currentNodeId && typeof tryEatGoodberry === 'function'; } catch (e) { return false; } }, { timeout: 60000 });
  await sleep(800);
}

/* 装置を入れる (startGame の前)。window.__gb に包みと道具を置く */
const SETUP = () => {
  const G = window.__gb = { calls: [], drink: 0, banners: [], rnd: 0, act: 0, inAlly: 0, inPlayer: 0, inLoop: 0, abortAtDrink: true, loopTurns: [] };
  heroAI = function () {};
  tryStartEncounter = function () {};
  try { moveEnemies = function () {}; } catch (e) {}
  sleepMs = () => new Promise((r) => setTimeout(r, 0));   // ⛔ Promise.resolve() はマイクロタスク飢餓
  awaitNarrationClear = async function () {};
  try { spawnArrow = function () { return Promise.resolve(); }; } catch (e) {}
  const R0 = Math.random;
  Math.random = function () { G.rnd++; return R0(); };
  const kb = showBanner;
  showBanner = function (t) { G.banners.push(String(t)); return kb.apply(this, arguments); };
  const ke = tryEatGoodberry;
  tryEatGoodberry = function (u) {
    const r0 = G.rnd, c0 = goodberryPouch ? goodberryPouch.count : null;
    const st = u === 'player' ? { who: 'player', sleep: playerBuffs.sleepRemaining || 0, hp0: hp, maxHp }
      : { who: u ? (u.npcName || u.classKey) : null, stunned: u ? (u.stunned || 0) : 0, summon: !!(u && u.isSummon), hp0: u ? u.hp : null, maxHp: u ? u.maxHp : null };
    const ret = ke(u);
    st.hp1 = u === 'player' ? hp : (u ? u.hp : null);
    G.calls.push(Object.assign(st, { ret, rnd: G.rnd - r0, c0, c1: goodberryPouch ? goodberryPouch.count : null, inAlly: G.inAlly, inPlayer: G.inPlayer, inLoop: G.inLoop }));
    return ret;
  };
  const SENT = G.SENT = { gbSentinel: true };
  const kd = tryDrinkHealingPotion;
  tryDrinkHealingPotion = async function (u) { G.drink++; if (G.abortAtDrink) throw SENT; return kd.apply(this, arguments); };
  const ka = allyAttackTurn;
  allyAttackTurn = async function (a) {
    G.inAlly++;
    if (G.inLoop) G.loopTurns.push({ k: 'ally', who: a.npcName, stunned: a.stunned || 0 });
    try { return await ka.apply(this, arguments); } finally { G.inAlly--; }
  };
  const kp = playerAttackTurn;
  playerAttackTurn = async function () {
    G.inPlayer++;
    if (G.inLoop) G.loopTurns.push({ k: 'player', sleep: playerBuffs.sleepRemaining || 0 });
    try { return await kp.apply(this, arguments); } finally { G.inPlayer--; }
  };
  const kba = allyBasicAttack;
  allyBasicAttack = async function () { G.act++; return kba.apply(this, arguments); };
  const kra = showRollAtAlly;
  showRollAtAlly = function () { G.act++; return kra.apply(this, arguments); };

  G.turn = async (actor, fn) => {
    const s = RunChronicle.beginTurn(actor);
    try { await fn(); } catch (e) { if (e !== SENT) throw e; } finally { RunChronicle.endTurn(s); }
  };
  G.allyTurn = (a) => G.turn({ kind: 'ally', ally: a }, () => allyAttackTurn(a));
  G.playerTurn = () => G.turn({ kind: 'player' }, () => playerAttackTurn(G.gob));
  G.healed = () => { const s = RunChronicle.snapshot(null); if (!s) return null; const m = {}; for (const x of s.members) m[x.name] = x.healed; return m; };
  G.count = () => (goodberryPouch ? goodberryPouch.count : null);
  G.slotsOf = (u) => (u === 'player' ? { max: (currentMaxSpellSlots || {}).goodberry || 0, cur: (currentSpellSlots || {}).goodberry || 0 }
    : { max: (u.maxSpellSlots || {}).goodberry || 0, cur: (u.spellSlots || {}).goodberry || 0 });
  G.slotSum = (u) => { let n = 0; const o = u === 'player' ? currentSpellSlots : u.spellSlots; for (const k in (o || {})) n += (o[k] || 0); return n; };
  G.ownerTag = () => (!goodberryPouch ? null : goodberryPouch.owner === 'player' ? 'player' : (goodberryPouch.owner && goodberryPouch.owner.npcName));
  /* 抽選の母集団: 1 回目 = 珍しさ (0 → common)、2 回目 = 候補の位置 (全区間を掃く) */
  G.pool = () => {
    const keep = Math.random, seen = {};
    try {
      for (let k = 0; k < 400; k++) { let n = 0; Math.random = () => (n++ === 0 ? 0 : k / 400); const id = pickScrollId({ common: 100 }); seen[id] = 1; }
    } finally { Math.random = keep; }
    return Object.keys(seen).sort();
  };
  /* 盤面: 長い通路に仲間とゴブリン 1 体 (HP 999)。食べる仲間 (eater) はゴブリンの隣 */
  G.board = (eater) => {
    const TILE = TILE_SIZE;
    let lane = { len: 0, ty: -1, tx0: -1 };
    for (let ty = 1; ty < MAP_H - 1; ty++) {
      let run = 0, start = 0;
      for (let tx = 1; tx < MAP_W - 1; tx++) {
        if (!isTileWall(tx, ty)) { if (run === 0) start = tx; run++; if (run > lane.len) lane = { len: run, ty, tx0: start }; } else run = 0;
      }
    }
    const setUnit = (u, tx, ty) => { const s = (u.def && u.def.displaySize) || 96; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
    for (const e of enemies) if (e) { e.alive = false; e.hp = 0; }
    const x0 = lane.tx0, ty = lane.ty;
    let k = 0;
    for (const a of allies) { if (a === eater) setUnit(a, x0 + 2, ty); else setUnit(a, x0 + [0, 1, 5, 6][k++ % 4], ty); }
    const idx = enemies.length;
    const e = createEnemy('goblin', x0 + 3, ty);
    enemies.push(e); createEnemyDom(idx, e.def, e.type);
    e.alive = true; e.maxHp = 999; e.hp = 999; e.stunned = 0;
    setUnit(e, x0 + 3, ty);
    snapPlayerToTile(x0 + 4, ty);
    encounterEnemyIndices = [idx];
    encounterRound = 1;
    G.gob = idx;
    return { laneLen: lane.len, idx };
  };
  /* 本物の runEncounter を 1 戦 (敵の手番は止める。敵の 2 手番目で敵が倒れて終わる) */
  G.battle = async (eachRound) => {
    const keep = { tryStealthSurprise, runLoreCheck, detectReinforcements, enemyAttackTurn, tryMageHandInCombat };
    let n = 0;
    /* ⚠ runEncounter の交戦の初期化が状態を戻すので、眠りはラウンドの頭 (actor ループの直前に呼ばれる
       tryMageHandInCombat の口) で入れ直す */
    tryMageHandInCombat = async function () { if (eachRound) eachRound(); };
    tryStealthSurprise = async function () { return false; };
    runLoreCheck = async function () {};
    detectReinforcements = function () { return []; };
    enemyAttackTurn = async function (idx) { n++; if (n >= 2) enemies[idx].alive = false; };
    gameOver = false; dialogPaused = false;
    G.inLoop++;
    const to = new Promise((res) => setTimeout(() => res('timeout'), 30000));
    let ran;
    try {
      ran = await Promise.race([runEncounter([G.gob]).then(() => 'done', (e) => 'throw ' + e), to]);
    } finally {
      G.inLoop--;
      tryStealthSurprise = keep.tryStealthSurprise; runLoreCheck = keep.runLoreCheck; detectReinforcements = keep.detectReinforcements; enemyAttackTurn = keep.enemyAttackTurn;
      tryMageHandInCombat = keep.tryMageHandInCombat;
    }
    return { ran, enemyTurns: n };
  };
  return true;
};

/* ── 主たるページ (主人公 戦士 / 仲間 エルフ N1・戦士 N2・戦士 N3) ── */
const PROBE_MAIN = async () => {
  const G = window.__gb, M = {};
  const elf = allies.find((a) => a.classKey === 'elf');
  const war = allies.find((a) => a.npcName === 'N2');
  M.names = allies.map((a) => a.npcName + ':' + a.classKey);
  M.elfName = elf && elf.npcName; M.warName = war && war.npcName;
  M.lsBefore = localStorage.getItem('dragonfighters.plazaInventory');
  M.slot0 = G.slotsOf(elf);
  M.pouchBefore = goodberryPouch;
  const b0 = G.banners.length;
  startGame();
  M.cast = { count: G.count(), owner: G.ownerTag(), slot1: G.slotsOf(elf), banners: G.banners.slice(b0) };
  M.recast = tryGoodberryOnEntry();
  M.castBannersAfterRecast = G.banners.filter((t) => /木の実が 10 個実った/.test(t)).length;
  M.board = G.board(war);
  war.maxHp = 30; maxHp = 30;
  const arm = async (name, fn) => { try { M[name] = await fn(); } catch (e) { M[name] = { err: String((e && e.stack) || e).slice(0, 400) }; } };
  const allyStep = async (u, h) => { u.hp = h; const c0 = G.count(), d0 = G.drink, n0 = G.calls.length; await G.allyTurn(u); return { h0: h, h1: u.hp, dc: G.count() - c0, drink: G.drink - d0, calls: G.calls.length - n0 }; };
  const playerStep = async (h) => { hp = h; const c0 = G.count(), d0 = G.drink, n0 = G.calls.length; await G.playerTurn(); return { h0: h, h1: hp, dc: G.count() - c0, drink: G.drink - d0, calls: G.calls.length - n0 }; };

  /* (2b) ちょうど半分 / 半分以上は食べない */
  await arm('b2', async () => ({ a15: await allyStep(war, 15), a20: await allyStep(war, 20), p15: await playerStep(15), p30: await playerStep(30) }));
  /* (2a)(2d)(3a) 食べる: 仲間 14/30 → 15、1/30 → 2。主人公も同じ */
  await arm('eat', async () => {
    const h0 = G.healed();
    const r = { a14: await allyStep(war, 14), a1: await allyStep(war, 1), p14: await playerStep(14), p1: await playerStep(1) };
    r.h0 = h0; r.h1 = G.healed();
    return r;
  });
  /* (2c) 手番を打ち切らずに最後まで: 食べた同じ手番で攻撃 / 呪文の記録 */
  await arm('c2', async () => {
    G.abortAtDrink = false;
    try {
      war.hp = 3; const c0 = G.count(), d0 = G.drink, a0 = G.act, s0 = G.slotSum(war), g0 = enemies[G.gob].hp;
      await G.allyTurn(war);
      return { dc: G.count() - c0, drink: G.drink - d0, act: G.act - a0, slot: G.slotSum(war) - s0, gobHp: [g0, enemies[G.gob].hp], hp: war.hp };
    } finally { G.abortAtDrink = true; }
  });
  /* (2e) 直叩き: 眠っている仲間 / 主人公 */
  await arm('e2', async () => {
    war.stunned = 2; const a = await allyStep(war, 3); war.stunned = 0;
    playerBuffs.sleepRemaining = 2; const p = await playerStep(3); playerBuffs.sleepRemaining = 0; playerBuffs.sleepWatchHp = null;
    return { a, p };
  });
  /* (2f) 召喚獣は食べない */
  await arm('f2', async () => { war.isSummon = true; war.hp = 3; const c0 = G.count(); const ate = tryEatGoodberry(war); const r = { ate, dc: G.count() - c0, hp: war.hp }; delete war.isSummon; return r; });
  /* (3b) 唱えたエルフが倒れていても、倒れたエルフへ入る */
  await arm('b3', async () => {
    const keep = { alive: elf.alive, hp: elf.hp };
    elf.alive = false; elf.hp = 0;
    const h0 = G.healed(); const s = await allyStep(war, 3); const h1 = G.healed();
    elf.alive = keep.alive; elf.hp = keep.hp;
    return { s, h0, h1 };
  });
  /* (2e) 本物の runEncounter: 全員が眠っている (仲間 stunned 99 / 主人公 sleepRemaining 99)・HP 3/30 */
  await arm('e2loop', async () => {
    G.board(war);
    const sleepAll = () => { for (const a of allies) { a.alive = true; a.maxHp = 30; a.hp = 3; a.stunned = 99; } maxHp = 30; hp = 3; playerBuffs.sleepRemaining = 99; };
    sleepAll();
    const c0 = G.count(), n0 = G.calls.length, t0 = G.loopTurns.length;
    G.abortAtDrink = false;   // ⚠ runEncounter の中で番兵を投げない (投げると encounter error になる)
    let b;
    try { b = await G.battle(sleepAll); } finally { G.abortAtDrink = true; }
    const calls = G.calls.slice(n0);
    const r = { b, dc: G.count() - c0, turns: G.loopTurns.slice(t0), calls, alliesHp: allies.map((a) => a.hp), hp };
    for (const a of allies) { a.stunned = 0; a.maxHp = 30; }
    playerBuffs.sleepRemaining = 0; playerBuffs.sleepWatchHp = null;
    G.board(war);
    return r;
  });
  /* (2g) 袋が空になるまで → 帯 1 回・以後は食べない */
  await arm('g2', async () => {
    let n = 0; const c0 = G.count();
    while (G.count() > 0 && n < 30) { war.hp = 2; tryEatGoodberry(war); n++; }
    const empty = G.count();
    const more = []; for (let i = 0; i < 3; i++) { war.hp = 2; more.push(tryEatGoodberry(war)); }
    const s = await allyStep(war, 2);
    return { c0, n, empty, more, s, endBanners: G.banners.filter((t) => /木の実を食べ尽くした/.test(t)).length };
  });
  M.lsAfter = localStorage.getItem('dragonfighters.plazaInventory');
  M.lsKeysWithGb = Object.keys(localStorage).filter((k) => /goodberry/.test(localStorage.getItem(k) || '') && k !== 'dragonfighters.knownSpells' && k !== 'dragonfighters.partySkills');
  M.pool = G.pool();
  M.calls = G.calls;
  M.castBannersEnd = G.banners.filter((t) => /木の実が 10 個実った/.test(t)).length;
  return M;
};
/* (4b) 読み直した次の出撃の頭 (装置は入れない) */
const PROBE_RELOAD = () => {
  const war = allies.find((a) => a.npcName === 'N2'), elf = allies.find((a) => a.classKey === 'elf');
  const o = { pouchAtLoad: goodberryPouch, ls: localStorage.getItem('dragonfighters.plazaInventory') };
  war.maxHp = 30; war.hp = 3; o.ateBefore = tryEatGoodberry(war); o.hpAfter = war.hp;
  heroAI = function () {}; tryStartEncounter = function () {};
  startGame();
  o.countAfterStart = goodberryPouch ? goodberryPouch.count : null;
  o.ownerIsElf = !!goodberryPouch && goodberryPouch.owner === elf;
  return o;
};
/* (1b)(1c)(3a) 主人公エルフ + 仲間エルフ N1 */
const PROBE_HERO_ELF = async () => {
  const G = window.__gb, M = {};
  const elf = allies.find((a) => a.classKey === 'elf');
  const war = allies.find((a) => a.npcName === 'N2');
  M.lead = leaderClassKey;
  M.p0 = G.slotsOf('player'); M.a0 = G.slotsOf(elf);
  startGame();
  M.p1 = G.slotsOf('player'); M.a1 = G.slotsOf(elf);
  M.count = G.count(); M.owner = G.ownerTag();
  M.castBanners = G.banners.filter((t) => /木の実が 10 個実った/.test(t)).length;
  G.board(war); war.maxHp = 30;
  try {
    const h0 = G.healed(); war.hp = 3; const c0 = G.count();
    await G.allyTurn(war);
    M.eat = { dc: G.count() - c0, hp: war.hp, h0, h1: G.healed() };
  } catch (e) { M.eat = { err: String(e).slice(0, 300) }; }
  return M;
};
/* (1c) 主人公 戦士 + 仲間エルフ N1・N2 */
const PROBE_TWO_ELVES = () => {
  const G = window.__gb;
  const e1 = allies.find((a) => a.npcName === 'N1'), e2 = allies.find((a) => a.npcName === 'N2');
  const o = { cls: [e1 && e1.classKey, e2 && e2.classKey], s1a: G.slotsOf(e1), s2a: G.slotsOf(e2) };
  startGame();
  o.s1b = G.slotsOf(e1); o.s2b = G.slotsOf(e2); o.count = G.count(); o.owner = G.ownerTag();
  o.castBanners = G.banners.filter((t) => /木の実が 10 個実った/.test(t)).length;
  return o;
};
/* (3c) ?chronicle=0 */
const PROBE_CHRON0 = async () => {
  const G = window.__gb;
  const war = allies.find((a) => a.npcName === 'N2'), elf = allies.find((a) => a.classKey === 'elf');
  const o = { slot: G.slotsOf(elf) };
  startGame();
  o.count0 = G.count();
  G.board(war); war.maxHp = 30; war.hp = 3;
  await G.allyTurn(war);
  o.count1 = G.count(); o.hp = war.hp; o.snap = RunChronicle.snapshot(null);
  return o;
};
/* (5a) 同期区間で食べる口を同じ並びで呼んだときの乱数 (袋が無い / ?goodberry=0) + (6a) 撤退 */
const PROBE_QUIET = async () => {
  const G = window.__gb;
  const war = allies.find((a) => a.npcName === 'N2'), elf = allies.find((a) => a.classKey === 'elf');
  const o = { slot0: elf ? G.slotsOf(elf) : null, on: isGoodberryOn() };
  startGame();
  o.slot1 = elf ? G.slotsOf(elf) : null; o.pouch = goodberryPouch;
  o.castBanners = G.banners.filter((t) => /木の実が 10 個実った/.test(t)).length;
  war.maxHp = 30; maxHp = 30;
  const seq = () => {
    const r0 = G.rnd, out = [];
    for (const h of [3, 14, 15, 20, 1]) { war.hp = h; out.push(tryEatGoodberry(war)); hp = h; out.push(tryEatGoodberry('player')); }
    war.isSummon = true; war.hp = 3; out.push(tryEatGoodberry(war)); delete war.isSummon;
    return { n: G.rnd - r0, ate: out.filter(Boolean).length };
  };
  o.seqReal = seq();
  const keep = tryEatGoodberry;
  tryEatGoodberry = function () { return false; };   // 対照 = 食べる口を外した同じ並び
  o.seqStub = seq();
  tryEatGoodberry = keep;
  /* 袋を手で置いても食べない (撤退のとき) */
  if (elf) {
    goodberryPouch = { count: 10, owner: elf, ownerName: elf.npcName };
    war.hp = 3; o.manualAte = tryEatGoodberry(war); o.manualCount = goodberryPouch.count;
    G.board(war); war.hp = 3; await G.allyTurn(war); o.turnCount = goodberryPouch.count; o.turnHp = war.hp;
    goodberryPouch = null;
  }
  o.pool = G.pool();
  return o;
};

/* ══════════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════════ */
async function runSuite(browser, port) {
  const R = mkResults();
  PAGE_ERRS.length = 0;
  const failRest = (ids, e) => { for (const id of ids) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.stack) || e).slice(0, 300)); };
  const sect = async (ids, fn) => { try { await fn(); } catch (e) { console.log('  ⛔ 例外 [' + ids.join(',') + ']: ' + String((e && e.stack) || e).slice(0, 500)); failRest(ids, e); } };
  const run = async (key, query, probe, lab) => {
    const p = await openPage(browser, port, query, seed(key), lab);
    await p.evaluate(SETUP);
    const v = await p.evaluate(probe);
    return { p, v };
  };
  let MAIN = null, RELOAD = null, HE = null, TWO = null, C0 = null, NOP = null, OFF = null;

  /* ── 測る ── */
  await sect(ALL_IDS.filter((x) => x !== '(0a)'), async () => {
    const m = await run('main', '', PROBE_MAIN, 'main');
    MAIN = m.v;
    await gotoIndex(m.p, port, '');   // 読み直し (= 次の出撃。種は入れ直さない)
    RELOAD = await m.p.evaluate(PROBE_RELOAD);
    await m.p.close();
    let x;
    x = await run('heroElf', '', PROBE_HERO_ELF, 'heroElf'); HE = x.v; await x.p.close();
    x = await run('twoElves', '', PROBE_TWO_ELVES, 'twoElves'); TWO = x.v; await x.p.close();
    x = await run('main', '&chronicle=0', PROBE_CHRON0, 'chronicle0'); C0 = x.v; await x.p.close();
    x = await run('noElf', '', PROBE_QUIET, 'noElf'); NOP = x.v; await x.p.close();
    x = await run('main', '&goodberry=0', PROBE_QUIET, 'goodberry0'); OFF = x.v; await x.p.close();
  });
  const errOf = (o) => o && o.err;
  const brief = (o) => J(o).slice(0, 900);

  /* ── §0 装置 ── */
  await sect(['(0a)'], async () => {
    const c = sourceCensus();
    R.check('(0a)', '[装置] ソース: ELF_SKILLS.goodberry (outOfCombat: true) が 1 つ・tavern の ELF_SKILLS_UI に goodberry の行 (autoCast: true) が 1 つ・森の書の行が index / tavern に 1 つずつで逐語で同じ・common',
      c.defs === 1 && c.defInElf && c.defOutOfCombat && c.ui === 1 && c.uiAutoCast && c.uiAfterElfUi && c.grIndex === 1 && c.grTavern === 1 && c.grSame && c.grCommon, c);
  });
  await sect(['(0b)'], async () => {
    const rows = { main: MAIN.slot0, heroElfPlayer: HE.p0, heroElfAlly: HE.a0, twoA: TWO.s1a, twoB: TWO.s2a, chron0: C0.slot, off: OFF.slot0 };
    const bad = Object.keys(rows).filter((k) => !(rows[k] && rows[k].max >= 1 && rows[k].cur === rows[k].max));
    R.check('(0b)', '[装置] 種まきしたセーブで、全ページのエルフの maxSpellSlots.goodberry >= 1 (習得のゲートを通った)・出撃前は満タン', bad.length === 0, { bad, rows });
  });
  await sect(['(0c)'], async () => {
    const site = MAIN.calls.filter((c) => (c.inAlly > 0 || c.inPlayer > 0));
    const ate = site.filter((c) => c.ret);
    R.check('(0c)', '[装置] 駆動した手番で、食べる口 (手番の関数の中の tryEatGoodberry) を通った回数 >= 1・そのうち食べた回数 >= 1', site.length >= 1 && ate.length >= 1,
      { siteCalls: site.length, ate: ate.length, allCalls: MAIN.calls.length });
  });

  /* ── §1 唱える ── */
  await sect(['(1a)'], async () => {
    const c = MAIN.cast;
    R.check('(1a)', '最初の部屋 (startGame) で袋が count === 10・術者 (仲間エルフ N1) の枠が 1 減る (max − cur === 1)・出撃前の袋は null',
      MAIN.pouchBefore === null && c.count === GB_COUNT && c.owner === MAIN.elfName && c.slot1.max - c.slot1.cur === 1 && MAIN.slot0.cur === MAIN.slot0.max,
      { pouchBefore: MAIN.pouchBefore, cast: c, slot0: MAIN.slot0, elf: MAIN.elfName });
  });
  await sect(['(1b)'], async () => {
    R.check('(1b)', '主人公がエルフ (枠 "player" が 1 減る・owner = player) と、仲間のエルフ (N1 の枠が 1 減る・owner = N1) の両方で唱える (袋 count === 10)',
      HE.lead === 'elf' && HE.p0.max - HE.p1.cur === 1 && HE.owner === 'player' && HE.count === GB_COUNT && MAIN.cast.owner === MAIN.elfName && MAIN.cast.count === GB_COUNT,
      { heroElf: { lead: HE.lead, p0: HE.p0, p1: HE.p1, owner: HE.owner, count: HE.count }, ally: MAIN.cast });
  });
  await sect(['(1c)'], async () => {
    const heOk = HE.p1.cur === HE.p0.cur - 1 && HE.a1.cur === HE.a0.cur && HE.count === GB_COUNT;
    const twoOk = TWO.cls[0] === 'elf' && TWO.cls[1] === 'elf' && TWO.s1b.cur === TWO.s1a.cur - 1 && TWO.s2b.cur === TWO.s2a.cur && TWO.count === GB_COUNT && TWO.owner === 'N1';
    R.check('(1c)', 'エルフが 2 人いても袋は 1 つ (count 10)・枠が減るのは 1 人だけ: 主人公エルフ + 仲間エルフ → 主人公だけ / 仲間エルフ 2 人 → 先頭の N1 だけ',
      heOk && twoOk, { heroElf: { p0: HE.p0, p1: HE.p1, a0: HE.a0, a1: HE.a1, count: HE.count }, twoElves: TWO });
  });
  await sect(['(1d)'], async () => {
    const castB = MAIN.cast.banners.filter((t) => /木の実が 10 個実った/.test(t)).length;
    R.check('(1d)', '帯「木の実が 10 個実った」が 1 回だけ (startGame で 1 回・tryGoodberryOnEntry を呼び直しても false で増えない・ページの終わりまで 1 回)',
      castB === 1 && MAIN.recast === false && MAIN.castBannersAfterRecast === 1 && MAIN.castBannersEnd === 1 && HE.castBanners === 1 && TWO.castBanners === 1,
      { castB, recast: MAIN.recast, afterRecast: MAIN.castBannersAfterRecast, end: MAIN.castBannersEnd, heroElf: HE.castBanners, two: TWO.castBanners, banners: MAIN.cast.banners });
  });

  /* ── §2 食べる ── */
  await sect(['(2a)'], async () => {
    const e = MAIN.eat;
    const ok1 = (s) => s && s.dc === -1 && s.h1 === s.h0 + 1 && s.h1 <= 30;
    R.check('(2a)', 'HP が半分未満 (14/30) なら、手番で count が 1 減り HP が +1 (仲間 N2 / 主人公)', !errOf(e) && ok1(e.a14) && ok1(e.p14), brief(e && { a14: e.a14, p14: e.p14, err: e.err }));
  });
  await sect(['(2b)'], async () => {
    const b = MAIN.b2;
    const none = (s) => s && s.dc === 0 && s.h1 === s.h0 && s.calls >= 1 && s.drink === 1;
    R.check('(2b)', 'HP が半分以上なら食べない (境界: ちょうど半分 15/30 は食べない。20/30・主人公 15/30・30/30 も)。食べる口は通っている (calls >= 1)',
      !errOf(b) && none(b.a15) && none(b.a20) && none(b.p15) && none(b.p30), brief(b));
  });
  await sect(['(2c)'], async () => {
    const c = MAIN.c2;
    R.check('(2c)', '手番は終わらない: HP 3/30 の仲間が食べた同じ手番で、ポーションの口に届き (drink 1) 攻撃 / 呪文の記録が出る (allyBasicAttack・showRollAtAlly・呪文の枠の減りのどれか)',
      !errOf(c) && c.dc === -1 && c.drink === 1 && (c.act >= 1 || c.slot < 0), brief(c));
  });
  await sect(['(2d)'], async () => {
    const e = MAIN.eat;
    const one = (s) => s && s.dc === -1 && s.h1 === 2;
    R.check('(2d)', '1 手番に 1 個まで: HP 1/30 の手番で count は 1 だけ減り HP は 2 (仲間 / 主人公)', !errOf(e) && one(e.a1) && one(e.p1), brief(e && { a1: e.a1, p1: e.p1, err: e.err }));
  });
  await sect(['(2e)'], async () => {
    const d = MAIN.e2, L = MAIN.e2loop;
    const directOk = !errOf(d) && d.a.dc === 0 && d.a.h1 === 3 && d.a.calls === 0 && d.p.dc === 0 && d.p.h1 === 3 && d.p.calls === 0;
    const sleptA = !errOf(L) && L.turns.filter((t) => t.k === 'ally' && t.stunned > 0).length;
    const sleptP = !errOf(L) && L.turns.filter((t) => t.k === 'player' && t.sleep > 0).length;
    const ateAsleep = !errOf(L) ? L.calls.filter((c) => c.ret).length : -1;
    const loopOk = !errOf(L) && L.b.ran === 'done' && sleptA >= 3 && sleptP >= 1 && L.dc === 0 && ateAsleep === 0;
    R.check('(2e)', '眠っている (stunned > 0) 仲間・sleepRemaining > 0 の主人公は食べない: 手番の関数の直叩き + 本物の runEncounter (全員が眠っている 1 戦で袋が減らない)',
      directOk && loopOk, { direct: d, loop: L && { b: L.b, dc: L.dc, sleptA, sleptP, ateAsleep, turns: L.turns, err: L.err } });
  });
  await sect(['(2f)'], async () => {
    const f = MAIN.f2;
    R.check('(2f)', '召喚獣 (isSummon) は HP 3/30 でも食べない', !errOf(f) && f.ate === false && f.dc === 0 && f.hp === 3, f);
  });
  await sect(['(2g)'], async () => {
    const g = MAIN.g2;
    R.check('(2g)', '袋が空になったら食べない (以後 false・手番でも減らない)・「木の実を食べ尽くした」の帯が 1 回だけ',
      !errOf(g) && g.empty === 0 && g.n === g.c0 && g.more.every((x) => x === false) && g.s.dc === 0 && g.s.h1 === 2 && g.endBanners === 1, g);
  });

  /* ── §3 記録の帰属 ── */
  await sect(['(3a)'], async () => {
    const e = MAIN.eat, el = MAIN.elfName, wa = MAIN.warName;
    const steps = e && !e.err ? [e.a14, e.a1, e.p14, e.p1] : [];
    const eaten = -steps.reduce((s, x) => s + x.dc, 0);
    const gained = steps.reduce((s, x) => s + (x.h1 - x.h0), 0);
    const nW = -(e && !e.err ? e.a14.dc + e.a1.dc : 0);
    const dE = e && e.h0 && e.h1 ? (e.h1[el] || 0) - (e.h0[el] || 0) : null;
    const dW = e && e.h0 && e.h1 ? (e.h1[wa] || 0) - (e.h0[wa] || 0) : null;
    const dH = e && e.h0 && e.h1 ? (e.h1['あなた'] || 0) - (e.h0['あなた'] || 0) : null;
    const he = HE.eat;
    const heW = he && he.h0 && he.h1 ? (he.h1.N2 || 0) - (he.h0.N2 || 0) : null;
    const heP = he && he.h0 && he.h1 ? (he.h1['あなた'] || 0) - (he.h0['あなた'] || 0) : null;
    R.check('(3a)', '仲間 N2 と主人公が食べた n 個の回復が、唱えたエルフ N1 の healed に n 入り、食べた本人の healed は増えない (= HP の実体の増分 = 袋の減り)。主人公エルフが唱えたときは頭 (あなた) へ',
      eaten === 4 && nW === 2 && gained === eaten && dE === eaten && dW === 0 && dH === 0 && he && he.dc === -1 && heP === 1 && heW === 0,
      { eaten, gained, dElf: dE, dWar: dW, dHead: dH, heroElf: { dc: he && he.dc, head: heP, war: heW, err: he && he.err } });
  });
  await sect(['(3b)'], async () => {
    const b = MAIN.b3, el = MAIN.elfName, wa = MAIN.warName;
    const dE = b && b.h0 && b.h1 ? (b.h1[el] || 0) - (b.h0[el] || 0) : null;
    const dW = b && b.h0 && b.h1 ? (b.h1[wa] || 0) - (b.h0[wa] || 0) : null;
    R.check('(3b)', '唱えたエルフが倒れた (alive=false・hp 0) 後に食べても、倒れたエルフへ +1 入る (食べた本人は 0)', !errOf(b) && b.s.dc === -1 && b.s.h1 === 4 && dE === 1 && dW === 0, { s: b && b.s, dE, dW, err: b && b.err });
  });
  await sect(['(3c)'], async () => {
    R.check('(3c)', '?chronicle=0 でも食べる (count 10 → 9・HP 3 → 4)・記録だけが止まる (snapshot が null)', C0.count0 === GB_COUNT && C0.count1 === GB_COUNT - 1 && C0.hp === 4 && C0.snap === null, C0);
  });

  /* ── §4 出撃をまたがない ── */
  await sect(['(4a)'], async () => {
    R.check('(4a)', '唱えて食べた前後で、localStorage の dragonfighters.plazaInventory が 1 バイトも変わらない (knownSpells / partySkills 以外に goodberry の語を持つキーも無い)',
      MAIN.lsBefore !== null && MAIN.lsBefore === MAIN.lsAfter && MAIN.lsKeysWithGb.length === 0, { before: MAIN.lsBefore, after: MAIN.lsAfter, keys: MAIN.lsKeysWithGb });
  });
  await sect(['(4b)'], async () => {
    R.check('(4b)', 'ページを読み直した次の出撃の頭で goodberryPouch === null・唱え直すまで食べない (HP 3/30 でも false)・startGame で唱え直して count 10',
      RELOAD.pouchAtLoad === null && RELOAD.ateBefore === false && RELOAD.hpAfter === 3 && RELOAD.countAfterStart === GB_COUNT && RELOAD.ownerIsElf, RELOAD);
  });

  /* ── §5 乱数 ── */
  await sect(['(5a)'], async () => {
    const falses = MAIN.calls.filter((c) => !c.ret);
    const leak = falses.filter((c) => c.rnd !== 0);
    R.check('(5a)', '袋が無い戦闘 (エルフ無し) と ?goodberry=0 の戦闘で、食べる口を同じ並び (11 回) で呼んだときの Math.random の回数が同じ (= 食べる口を外した対照と同じ 0)・素のページで食べなかった呼び出しの中の乱数 0 回',
      NOP.pouch === null && OFF.pouch === null && NOP.seqReal.n === NOP.seqStub.n && OFF.seqReal.n === OFF.seqStub.n && NOP.seqReal.n === OFF.seqReal.n && NOP.seqReal.ate === 0 && OFF.seqReal.ate === 0
        && falses.length >= 5 && leak.length === 0,
      { noElf: { real: NOP.seqReal, stub: NOP.seqStub }, off: { real: OFF.seqReal, stub: OFF.seqStub }, mainFalseCalls: falses.length, leak: leak.slice(0, 3) });
  });

  /* ── §6 撤退 ── */
  await sect(['(6a)'], async () => {
    R.check('(6a)', '?goodberry=0 → 唱えない (枠が減らない・袋 null・帯なし)・袋を手で置いても食べない (直叩き / 手番)・pickScrollId の common の候補に grimoire-goodberry が出ない',
      OFF.on === false && OFF.slot1.cur === OFF.slot0.cur && OFF.pouch === null && OFF.castBanners === 0 && OFF.manualAte === false && OFF.manualCount === 10 && OFF.turnCount === 10 && OFF.turnHp === 3
        && OFF.pool.length >= 1 && OFF.pool.indexOf('grimoire-goodberry') < 0,
      { on: OFF.on, slot0: OFF.slot0, slot1: OFF.slot1, pouch: OFF.pouch, banners: OFF.castBanners, manualAte: OFF.manualAte, turn: [OFF.turnCount, OFF.turnHp], pool: OFF.pool });
  });
  await sect(['(6b)'], async () => {
    const diff = MAIN.pool.filter((x) => OFF.pool.indexOf(x) < 0);
    R.check('(6b)', 'スイッチ無しでは common の候補に grimoire-goodberry が入る (撤退との差はちょうどそれ 1 冊)', MAIN.pool.indexOf('grimoire-goodberry') >= 0 && J(diff) === J(['grimoire-goodberry']) && MAIN.pool.length === OFF.pool.length + 1,
      { on: MAIN.pool, off: OFF.pool, diff });
  });

  R.check('(0d)', '[装置] 全ページで pageerror 0 件・runEncounter の中の例外 0 件', PAGE_ERRS.length === 0, PAGE_ERRS.slice(0, 5));
  for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(判定が出ていない)', false, '');
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_goodberry_');
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
  const popZero = (R) => { const r = R.find((x) => x.id === '(0c)'); return !r || !r.ok; };
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const R0 = await run(PORT, null, '(素・基準)');
      const s0 = summarize(R0, '[素・基準]');
      if (popZero(R0)) { console.error('[vet] ⛔ 素で母集団 0 ((0c) が赤) — 装置が腐っている'); exitCode = 3; }
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
      if (popZero(R)) { console.error('[vet] ⛔ 母集団 0 ((0c) が赤) — 食べる口を通った手番が無い'); exitCode = 3; }
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
