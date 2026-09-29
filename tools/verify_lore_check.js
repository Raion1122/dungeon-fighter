#!/usr/bin/env node
/*
 * verify_lore_check.js — 実装依頼書 #76「伝承判定と AI の呪文選び + 脅威度 (SRD 5.1 の CR)」の受入ドライバ
 *                         (依頼書 2026-09-29_lore-check-ai.md §8 / §12-3)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_lore_check.js                          # 素
 *   node tools/verify_lore_check.js --negative               # 変異 11 本 (port 10472〜10482)。先に素の基準を走らせる
 *   node tools/verify_lore_check.js --negative --only nogate,crdup
 *   node tools/verify_lore_check.js --mutate nogate          # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない / 2=環境不足 (SRD のフォルダが読めない等)・例外
 *      3=変異アンカーの腐敗 (注入点がちょうど 1 箇所でない・行数が変わる)
 *
 * ■ 方針 — 伝承判定 (runLoreCheck = __dfLore.run) と AI (mageAI / elfAI / playerAttackTurn → pickLeaderAction /
 *   allySleep の狙点 / clericAI) を盤面で**直接**回し、呼ばれたもの・札・ログを観測する。
 *   - 盤面 = verify_enemy_traits (← verify_aoe_coverage) の openIndex / installProbe / board の写し
 *     (#76 項目2 の使い捨て検証 probe_lore.js 経由・33/33)。2x2 のために 2 行の床が 13 マス続く区間を探す。
 *   - ally* の非同期関数は記録器へ差し替える (verify_cone_cast の quiet の形)。関数宣言は window に載る
 *     (依頼書 §12-0 崩れ 7) ので、名前で呼ぶ mageAI / elfAI の中から差し替えが効く。
 *   - SkillCheck.resolveSkillCheck を包んで (技能, DC, 渡された編成の classKey, auto) を記録する。
 *   - Math.random は**列**で固定する (定数 1 つでは確率ゲートの有無を区別できない)。seeded(n) = mulberry32。
 *     判定の成功 = 0.95 (d20 = 20)・失敗 = 0.0 (d20 = 1)。
 *   - ⚠ buildPerceptionParty は主人公を hp>0 && !gameOver のときだけ入れる (§12-0 崩れ 2) ⇒ 判定を回す間だけ gameOver = false。
 *   - 期待値は 2 経路: ① ページの窓 __dfLore / __dfEnemyTraits ② **このドライバが独立に持つ表**
 *     (DRV_SKILL = §2-4 の 51 種の振り分け / DRV_ELEMENT = 呪文 → 属性の 7 行 / DRV_SLUG = 敵キー → SRD の slug 34 行。
 *      CR の値は起動時に Dropbox の SRD の前付け `cr:` から読む = ページの表から作らない)。
 *   - 撤退の腕 = index.html?lore=0 を別ページで開く (ページ単位の定数 LORE_ON)。両腕とも同じ配信スナップショット。
 *
 * ■ 測っているもの (依頼書 §8 の番号。+ (0e) は --negative の起動確認)
 *   §0 (0a) [装置] 判定が resolveSkillCheck を実際に呼んだ・mageAI がスリープと攻撃呪文を撃った・elfAI が LA を撃った・
 *           pickLeaderAction が呼ばれた ⭐ これが無いと全 assert が空振りで永久緑
 *      (0b) __dfLore が在り on === true・skillOf の全キーが ENEMY_TYPES に実在・ENEMY_TYPES の 51 キーがドライバの表で 40 / 11 に分かれる
 *      (0c) skillOf とドライバの表が 51 種すべてで一致 + **実効の技能** (51 種を 1 種ずつ盤面へ置いて run() した時に振られた技能) も一致
 *           + spellElement の 7 行が一致 + 属性語が __dfEnemyTraits の表で使われている語の中にある
 *      (0d) ページの cr の 34 キー = SRD の cr: (ドライバが slug で読む) と一致・「出さない」17 キーは表に無い・34+17 = ENEMY_TYPES
 *      (0e) [装置] 全ページが起動し pageerror 0 件 (⭐ 構文破壊で全部赤くなる偽の検出を見分ける)
 *   §1 (1a) 戦士 + 盗賊 × スケルトン → 呼ばない・「正体を知る者はいない」1 行・tried に入らない・同じ冒険の 2 戦目は行を繰り返さない
 *      (1b) 僧侶の居る編成 (主人公 戦士 + 魔法使い + 僧侶) × スケルトン → religion で 1 回・渡された全員が宗教の習熟を持つ
 *      (1c) 出目 20 → known にスケルトン・knows() 真 / 出目 1 → tried に入り known に入らない・knows() 偽・札なし
 *      (1d) 同じ種類との 2 戦目 (成功の後・失敗の後の両方) → 呼び出しが増えない
 *      (1e) ジャイアントラットだけ → 呼び出し 0・ログ 0 行
 *      (1f) ゴブリンだけ → DC 10 / ゴブリン + ゴブリンキング → DC 15 + 振られた全種の DC = 定義のフラグからドライバが出した値
 *      (1g) リッチ + スケルトンの runEncounter (boss_appear の枝) → 宗教の判定が 1 回 DC 15 (対照: ゴブリンの runEncounter も 1 回)
 *      (1h) スケルトンを見抜いた → ログに 1/4・全員の札に .enemyCr がちょうど 1 つ (CR1/4) / ゴブリンキングは札なし・ログに「脅威度」なし /
 *           失敗した種類の札には付かない + 見抜いた全種の札 = SRD の CR (分数表記) か無し
 *      (1i) 見抜いた種類の敵を後から作る → 札に .enemyCr が 1 つ・decorate 2 回でも 1 つ / ?namelabel=0 では例外なく何も付かない
 *   §2 (2a) スケルトン 3 体を知る × スリープ + ファイアボルトで 20 手番 → allySleep 0 / 知らない → 1 回以上 (同じ乱数列)
 *      (2b) ゴブリン 3 体を知る × 乱数 0.99 → スリープ / 知らない → 撃たない
 *      (2c) ファラクサスを知る × ファイアボール + MM (threat ≥ 30) → 炎 0・MM / 知らない → ファイアボール
 *           + ファイアボルトだけ × 知る → 候補が空 = false (§12-0 崩れ 5)
 *      (2d) カエルムを知る × コーン + ファイアボール (hp 5 = threat < 25) → コーン 0 / リッチを知る → ファイアボールへ差し替え (§12-0 崩れ 6)
 *      (2e) window.enemyElementMult を包んでゴブリン × 炎 = 2 → 知っていればファイアボルト / 知らない → MM
 *      (2f) ウィル・オ・ウィスプを知る × エルフ → LA を撃たない / 知らない → 撃つ
 *      (2g) 主人公 (魔法使い): ファラクサスを知る → choices に炎が無い / スケルトンだけを知る → sleep が無い / 知らない → 両方ある
 *           + 眠ると知るゴブリン 2 体で sleep の選択率が上がる・乱数は 1 回/呼び出し・warn 0
 *      (2h) 眠らないと知るスケルトン 3 体の塊 + ゴブリン 2 体 → スリープの 2x2 がゴブリン側 / 知らない → スケルトン側 (範囲 3 体)
 *   §3 (3a) 何も知らない状態で mageAI / elfAI / pickLeaderAction の「呼ばれた関数の列」と「Math.random の回数」が ?lore=0 と完全一致
 *      (3b) clericAI の呼び出し列と乱数の回数は、知っている時と知らない時で完全一致
 *   §4 (4a) ?lore=0 では (1b)(1c)(1g)(1h)(2a)(2b)(2c)(2f)(2g) の**同じ述語関数**がすべて偽 + 窓の on === false (「OFF で緑」ではない)
 *   ⛔ 測らないこと (依頼書 §8): ログと吹き出しの文言 (LORE のラベル・「正体を知る者はいない」・「脅威度」の有無以外)・成功率・勝敗
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。変異は **配信スナップショットの index.html をメモリ上で差し替える** (⛔ 本番ファイルは 1 バイトも触らない)。
 *   - 起動時に全変異のアンカーを**原本**で検算する (各 1 件・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *   - ⛔ このドライバを timeout コマンドで包まない。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *
 * ■ ポート = **10471** (素) / 変異 **10472〜10482** (11 本・MUTATIONS の並び順)。10470 は probe_s5s6_clear。
 * ■ 所要 (2026-09-29 この機械の実測・項目4 の走行と並走中) = 素 2.8 秒 (25 assert・3 回とも同じ) / --negative 28.8 秒 (素の基準 + 変異 11 本)。
 *   ページは 6 枚 (主 ON / 主 ?lore=0 / 主人公=魔法使い ON / 同 ?lore=0 / 戦士+盗賊 / ?namelabel=0)。
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
const PORT = parseInt(arg('port', '10471'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);

const SCENARIO = 'goblin-mine';
const RND_HI = 0.95;   // d20 = 20 (必ず成功)
const RND_LO = 0.0;    // d20 = 1  (必ず失敗)

/* ══════════════════════════════════════════════════════════════════════════════
 * ② ドライバが独立に持つ表 (依頼書 §2-4 / §4 / §2-10 を書き写した。⛔ ページの表から作らない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const DRV_SKILL = {};
for (const k of ['goblin', 'goblinArcher', 'goblinShaman', 'goblinBrute', 'goblinRider', 'goblinKing', 'goblinChariot', 'hobgoblin',
  'kobold', 'orc', 'orcGrunt', 'orcArcher', 'orcShaman', 'orcBerserker', 'garrock', 'bandit', 'banditArcher', 'banditMage',
  'banditHeavy', 'scar', 'lizardWarrior', 'lizardHunter', 'lizardRaider', 'lizardPriest', 'swampNovice', 'lizardChieftain']) DRV_SKILL[k] = 'history';
for (const k of ['skeleton', 'zombie', 'skeletonArcher', 'wraith', 'lich', 'caelum', 'ghostFlame']) DRV_SKILL[k] = 'religion';
for (const k of ['pharaxus', 'stoneGolem', 'animatedArmor', 'stoneLegionary', 'gargoyle', 'sovereignEye', 'hydra']) DRV_SKILL[k] = 'arcana';
const DRV_NATURE = ['rat', 'plagueFrog', 'ruinSpider', 'direBear', 'chimera', 'griffon', 'umber_hulk', 'minotaur', 'shadowBeast', 'mimic', 'caravanWagon'];
const DRV_ELEMENT = { 'fire-bolt': 'fire', 'fireball': 'fire', 'burning-hands': 'fire', 'lightning-bolt': 'lightning',
  'lightning-arrow': 'lightning', 'cone-of-cold': 'cold', 'ice-storm': 'cold' };
/* 習熟 (js/skill-check.js CLASS_PROFICIENCIES の書き写し。(1b) で「渡された全員が宗教を持つ」を独立に見る) */
const DRV_PROF = { warrior: ['athletics', 'intimidation'], dwarf: ['perception', 'constitution'], rogue: ['sleightOfHand', 'stealth', 'investigation'],
  elf: ['perception', 'arcana'], cleric: ['insight', 'religion'], mage: ['arcana', 'history'] };
/* 敵キー → SRD 5.1 の slug (依頼書 §2-10・規則 ① / ②)。CR の値は SRD のファイルから読む。 */
const DRV_SLUG = {
  rat: 'giant-rat', goblin: 'goblin', goblinArcher: 'goblin', goblinRider: 'goblin', hobgoblin: 'hobgoblin', kobold: 'kobold',
  skeleton: 'skeleton', skeletonArcher: 'skeleton', zombie: 'zombie', wraith: 'wraith', lich: 'lich', caelum: 'ghost',
  ghostFlame: 'will-o-wisp', pharaxus: 'young-red-dragon', stoneGolem: 'stone-golem', animatedArmor: 'animated-armor',
  gargoyle: 'gargoyle', minotaur: 'minotaur', hydra: 'hydra', mimic: 'mimic', plagueFrog: 'giant-frog', ruinSpider: 'giant-spider',
  chimera: 'chimera', griffon: 'griffon', orc: 'orc', orcGrunt: 'orc', orcArcher: 'orc', bandit: 'bandit', banditArcher: 'bandit',
  banditHeavy: 'thug', scar: 'bandit-captain', lizardWarrior: 'lizardfolk', lizardHunter: 'lizardfolk', lizardRaider: 'lizardfolk',
};
/* 規則 ③ = 表に載せない (脅威度を出さない) 17 キー */
const DRV_NO_CR = ['goblinShaman', 'goblinBrute', 'goblinKing', 'goblinChariot', 'orcShaman', 'orcBerserker', 'garrock', 'banditMage',
  'lizardPriest', 'swampNovice', 'lizardChieftain', 'stoneLegionary', 'sovereignEye', 'shadowBeast', 'direBear', 'umber_hulk', 'caravanWagon'];
const FRAC = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };
const crText = (cr) => (cr == null ? '' : (FRAC[cr] || String(cr)));
const DRV_BOSS_DC = (f) => ((f.isBoss || f.eyeStalks || (f.maxSummons || 0) > 0) ? 15 : 10);   // ⛔ isBossLikeDef を使わない

/* (0d) SRD の cr: を読む (起動時に 1 回)。読めなければ exit 2 (⛔ 緑にしない)。 */
const SRD_DIR = arg('srd', 'C:\\Users\\PC_User\\Dropbox\\🔷ナレッジ🔷\\raw\\srd\\monsters');
const SRD_CR = {};
{
  const slugs = Array.from(new Set(Object.values(DRV_SLUG)));
  const bad = [];
  try { if (!fs.statSync(SRD_DIR).isDirectory()) bad.push('ディレクトリでない'); } catch (e) { bad.push('読めない: ' + e.code); }
  if (!bad.length) {
    for (const slug of slugs) {
      let txt;
      try { txt = fs.readFileSync(path.join(SRD_DIR, slug + '.md'), 'utf8'); } catch (e) { bad.push(slug + '.md 読めない'); continue; }
      txt = txt.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      const m = txt.match(/^---\n([\s\S]*?)\n---/);
      const cm = m && m[1].match(/^cr:\s*([0-9.]+)\s*$/m);
      if (!cm) { bad.push(slug + '.md の前付けに cr: が無い'); continue; }
      SRD_CR[slug] = parseFloat(cm[1]);
    }
  }
  if (bad.length) {
    console.error('[vet] ⛔ (0d) SRD のフォルダ ' + SRD_DIR + ' が読めない (環境): ' + bad.slice(0, 5).join(' / '));
    process.exit(2);
  }
}
const DRV_CR = {};
for (const k of Object.keys(DRV_SLUG)) DRV_CR[k] = SRD_CR[DRV_SLUG[k]];

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結) と変異
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html';
const PRISTINE = fs.readFileSync(path.join(ROOT, F_INDEX), 'utf8');
/* 逐語は #76 項目2 の実装後 (HEAD 06fd7de) で取った (依頼書 §12-2 (5))。どれも 1 行の中で閉じる。 */
const MUTATIONS = {
  /* 罠 1: 呼び口をボスの居ない枝 (detectEnemyFamily の隣) へ移す */
  bossbranch: [
    { from: '        await runLoreCheck();             // ★[#76] 伝承判定。⚠ ボスの分岐の外 (リッチ・ファラクサス戦でも振る = 依頼書 §2-2 罠 1)',
      to:   '        /* ★変異bossbranch: 呼び口をボスの居ない枝へ移した */' },
    { from: '        const fam = detectEnemyFamily(initialEngaged);',
      to:   '        const fam = detectEnemyFamily(initialEngaged); await runLoreCheck();   /* ★変異bossbranch */' }],
  /* 罠 2: スリープの枝で条件の先頭に乱数を引く。⚠ 両腕が同じ配信を読むので、#76 の経路 (LORE_ON) の時だけ引く形にする
     (無条件に引くと ?lore=0 の腕も同じだけ引き、(3a) の比較で差が出ない = §12-3 崩れ) */
  rngparity: [
    { from: '      if (hasSleep && hasSpellSlot(ally, "sleep") && sleepPool.length >= 2',
      to:   '      if ((LORE_ON ? Math.random() < 2 : true) && hasSleep && hasSpellSlot(ally, "sleep") && sleepPool.length >= 2   /* ★変異rngparity */' }],
  /* 罠 3: 演出の語 'ice' を属性に使う */
  iceword: [
    { from: '"cone-of-cold": "cold", "ice-storm": "cold",',
      to:   '"cone-of-cold": "ice", "ice-storm": "cold",   /* ★変異iceword */' }],
  /* 罠 4: 習熟で絞らない */
  nogate: [
    { from: '        const party = all.filter(m => (profs[m.classKey] || []).indexOf(skill) >= 0);',
      to:   '        const party = all;   /* ★変異nogate: buildPerceptionParty() をそのまま渡す */' }],
  /* 振った種類を覚えない */
  reroll: [
    { from: '        for (const t of g.types) LORE_TRIED.add(t);',
      to:   '        /* ★変異reroll: LORE_TRIED に入れない */' }],
  /* 何でも知っている (撤退スイッチは効く形) */
  alwaysknow: [
    { from: '    function loreKnows(e) { return LORE_ON && !!e && LORE_KNOWN.has(e.type); }',
      to:   '    function loreKnows(e) { return LORE_ON && !!e; }   /* ★変異alwaysknow */' }],
  /* 技能を detectEnemyFamily の種族から決める (構造体・ガーゴイルなどは generic = 振らない) */
  familyreuse: [
    { from: '        const skill = LORE_SKILL_OF[e.type];',
      to:   '        const skill = ({ goblinoid: "history", bandit: "history", orc: "history", kobold: "history", lizardman: "history", undead: "religion", dragon: "arcana", hydra: "arcana" })[detectEnemyFamily([i])];   /* ★変異familyreuse */' }],
  /* 撤退スイッチが死ぬ */
  switchdead: [
    { from: 'new URLSearchParams(window.location.search).get("lore") !== "0";',
      to:   'new URLSearchParams(window.location.search).get("lore") !== "0" || true;   /* ★変異switchdead */' }],
  /* 規則 ③ を破る: SRD に元の無いゴブリンキングへ近い種族の値 */
  crguess: [
    { from: '      lizardWarrior: 0.5, lizardHunter: 0.5, lizardRaider: 0.5,',
      to:   '      lizardWarrior: 0.5, lizardHunter: 0.5, lizardRaider: 0.5, goblinKing: 1,   /* ★変異crguess */' }],
  /* 分数へ直さない (0.25 と出る) */
  crdecimal: [
    { from: '      return ({ 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" })[cr] || String(cr);',
      to:   '      return String(cr);   /* ★変異crdecimal */' }],
  /* 札へ二重に足す */
  crdup: [
    { from: '      if (lb.querySelector(".enemyCr")) return false;   // 既に付いている = 何もしない',
      to:   '      /* ★変異crdup: 二重付与の門を外した */' }],
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた
 * (2026-09-29・HEAD 06fd7de の上。依頼書 §12-3 の担当表)。⭐ --negative は「赤の集合 = 担当」の完全一致を要求する。 */
const NEG_EXPECT = {
  bossbranch:  ['(1g)'],
  rngparity:   ['(3a)'],
  iceword:     ['(0c)', '(2d)'],
  nogate:      ['(1a)', '(1b)'],
  reroll:      ['(1c)', '(1d)'],   // (1c) = 出目 1 の後 tried に入らない
  /* 何でも知っている ⇒ 「知らない時」の側がすべて崩れる (スリープ 0 回 = (0a) の装置も赤) */
  alwaysknow:  ['(0a)', '(1c)', '(1h)', '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(2g)', '(2h)', '(3a)'],
  familyreuse: ['(0c)'],
  switchdead:  ['(4a)'],
  crguess:     ['(0d)', '(1h)'],
  crdecimal:   ['(1h)', '(1i)'],   // (1i) = 後から作った札の文字が CR0.25
  crdup:       ['(1i)'],
};
/* 依頼書 §8 の予想 (⭐ これが実測の赤に含まれていることは崩さない = 起動時に検算) */
const NEG_PREDICTED = {
  bossbranch: ['(1g)'], rngparity: ['(3a)'], iceword: ['(0c)', '(2d)'], nogate: ['(1a)', '(1b)'], reroll: ['(1d)'],
  alwaysknow: ['(1c)', '(3a)'], familyreuse: ['(0c)'], switchdead: ['(4a)'], crguess: ['(0d)', '(1h)'], crdecimal: ['(1h)'], crdup: ['(1i)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 11) { console.error('[vet] 変異は 11 本まで (ポート 10472〜10482)'); process.exit(3); }
if (MUT_ORDER.some((k) => !NEG_EXPECT[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) { console.error('[vet] NEG_EXPECT と MUTATIONS が揃っていない'); process.exit(3); }
for (const k of MUT_ORDER) {
  const miss = (NEG_PREDICTED[k] || []).filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  if (miss.length) { console.error('[vet] 担当 ' + k + ' が依頼書 §8 の予想 ' + miss.join(',') + ' を含まない'); process.exit(3); }
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) { console.error('[vet] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3); }
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) { console.error('[vet] 未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3); }

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
/* ⭐ 注入点の検算は**手つかずの原本**に対して数える (同じアンカーを共有する変異があっても互いに覆い隠さない)。 */
const _mutCache = {};
function servedIndex(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key]) return _mutCache[key];
  let s = PRISTINE;
  for (const e of MUTATIONS[key]) {
    const c = countOf(PRISTINE, e.from);
    if (c !== 1) { console.error('[vet] ⛔ 変異 ' + key + ' の注入点がちょうど 1 箇所ではない (' + c + ' 件): ' + e.from.slice(0, 160)); process.exit(3); }
    if (countOf(PRISTINE, e.to) !== 0) { console.error('[vet] ⛔ 変異 ' + key + ' の注入文字列が原本に既に在る'); process.exit(3); }
    s = s.replace(e.from, () => e.to);
  }
  if (s.split('\n').length !== PRISTINE.split('\n').length || s === PRISTINE) {
    console.error('[vet] ⛔ 変異 ' + key + ' が行数を変えた / 何も変えていない'); process.exit(3);
  }
  _mutCache[key] = s;
  return s;
}
/* 起動時に全変異の注入点を検算する (素でも。アンカーの腐敗は素の走行でも exit 3 で知らせる) */
for (const k of MUT_ORDER) servedIndex(k);

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
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SERVERS = [];
function startServer(port, mutKey) {
  const idx = servedIndex(mutKey);
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === F_INDEX) { res.setHeader('Content-Type', MIME['.html']); res.end(Buffer.from(idx, 'utf8')); return; }
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

/* 編成: 既定 (主人公 戦士 + 魔法使い + 僧侶) / 主人公が魔法使い ((2g)) / 宗教を持たない (戦士 + 盗賊 = (1a)) */
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
];
const MAGE_HERO_PARTY = [
  { classKey: 'mage',    isHero: true,  zone: 'back',  name: null,   trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガル', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
];
const NOREL_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'rogue',   isHero: false, zone: 'mid',   name: 'ネズ', trait: null, line: null },
];
async function openIndex(ctx, qs, party, tag) {
  const page = await ctx.browser.newPage();
  const tg = tag + (qs || '');
  page.on('pageerror', (e) => ctx.errs.push(tg + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;   // ⚠ 除外はこの 1 本の URL だけ
    ctx.errs.push(tg + ' :: CONSOLE ' + m.text());
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', seed.scen);
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.xp', String(seed.xp));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  }, { scen: SCENARIO, party, xp: 45000 });
  await page.goto('http://127.0.0.1:' + ctx.port + '/index.html' + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  /* ⚠ 裸の識別子で待つ (classic script 直下の const/let は window に載らない)。 */
  await page.waitForFunction(
    "typeof allies !== 'undefined' && allies.length > 0 && typeof enemies !== 'undefined'"
    + " && typeof createEnemy === 'function' && !!mapData && !!window.__plaza", { timeout: 90000 });
  await page.evaluate(installProbe);
  ctx.booted++;
  return page;
}

/* ─────────── ページ側の計測器 (page.evaluate で注入) ─────────── */
function installProbe() {
  gameOver = true;
  try { encounterActive = false; } catch (e) {}
  window.sleepMs = () => new Promise((r) => setTimeout(r, 0));   // ⛔ Promise.resolve() はマイクロタスク飢餓
  try { window.moveEnemies = function () {}; } catch (e) {}
  window.dfPlayCast = () => Promise.resolve();
  window.__pops = [];
  new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes)
    if (n.nodeType === 1 && n.classList && n.classList.contains('rollPop')) window.__pops.push({ cls: n.className, text: n.textContent }); })
    .observe(document.body, { childList: true });
  window.__infos = [];
  const _ui = window.updateInfo;
  window.updateInfo = function (m) { window.__infos.push(String(m)); return _ui.apply(null, arguments); };
  window.__rsc = [];
  if (window.SkillCheck && SkillCheck.resolveSkillCheck) {
    const _rsc = SkillCheck.resolveSkillCheck;
    SkillCheck.resolveSkillCheck = function (k, dc, party, opts) {
      window.__rsc.push({ k, dc, cls: (party || []).map((m) => m.classKey), auto: !!(opts && opts.auto) });
      return _rsc.apply(this, arguments);
    };
  }
  window.__plCalls = 0;
  const _pl = window.pickLeaderAction;
  window.pickLeaderAction = function () { window.__plCalls++; return _pl.apply(this, arguments); };
  // 2 行の床が 13 マス続く区間 (2x2 用)
  const TILE = TILE_SIZE;
  let lane = null;
  for (let ty = 1; ty < MAP_H - 2 && !lane; ty++) {
    for (let tx = 1; tx < MAP_W - 14 && !lane; tx++) {
      let ok = true;
      for (let dx = 0; dx < 13 && ok; dx++) for (let dy = 0; dy < 2 && ok; dy++) if (isTileWall(tx + dx, ty + dy)) ok = false;
      if (ok) lane = { tx0: tx, ty };
    }
  }
  const setUnit = (u, tx, ty) => { const s = (u.def && u.def.displaySize) || 96; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
  const mageOf = () => allies.find((a) => a.classKey === 'mage');
  const REAL = {};
  for (const k of Object.getOwnPropertyNames(window)) {
    if (!/^ally[A-Z]/.test(k)) continue;
    let f; try { f = window[k]; } catch (e) { continue; }
    if (typeof f === 'function' && f.constructor && f.constructor.name === 'AsyncFunction') REAL[k] = f;
  }
  window.__lp = {
    lane, realNames: Object.keys(REAL),
    reset() { if (window.__dfLore) { const W = window.__dfLore; W.known.clear(); W.tried.clear(); W.nobodySaid.clear(); } window.__rsc.length = 0; window.__infos.length = 0; window.__pops.length = 0; },
    record(T, keep) {
      for (const k of Object.keys(REAL)) {
        if (keep && keep.indexOf(k) >= 0) { window[k] = REAL[k]; continue; }
        window[k] = function () { T.push(k); return Promise.resolve(); };
      }
    },
    unrecord() { for (const k of Object.keys(REAL)) window[k] = REAL[k]; },
    board(types, spots, hpv) {
      for (const e of enemies) { e.alive = false; e.hp = 0; }
      for (const a of allies) { a.alive = true; a.hp = a.maxHp; a.x = -999999; a.y = -999999; a.stunned = 0; }
      if (mageOf()) setUnit(mageOf(), lane.tx0, lane.ty);
      snapPlayerToTile(lane.tx0 + 1, lane.ty);
      const made = [];
      types.forEach((t, k) => {
        const idx = enemies.length;
        const sp = spots ? spots[k] : [3 + k, 0];
        const e = createEnemy(t, lane.tx0 + sp[0], lane.ty + sp[1]);
        enemies.push(e); createEnemyDom(idx, e.def, e.type);
        e.alive = true; e.maxHp = hpv || Math.max(e.maxHp || 0, 400); e.hp = e.maxHp; e.stunned = 0;
        made.push(idx);
      });
      encounterEnemyIndices = made.slice();
      return made;
    },
    setMage(skills) {
      const m = mageOf();
      m.equippedSkills = skills.slice();
      m.spellSlots = {}; for (const s of skills) m.spellSlots[s] = 9;
      m.buffs = m.buffs || {}; m.buffs.acBonusRemaining = 0; m.hp = m.maxHp;
      return m;
    },
    labels(made) { return made.map((i) => { const lb = enemyLabelElements[i]; return lb ? Array.from(lb.querySelectorAll('.enemyCr')).map((s) => s.textContent) : null; }); },
    seeded(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
    /* 判定を 1 回: types を盤面へ置き run() (主人公を編成に入れるため run の間だけ gameOver=false) */
    async lore(types, rnd, opts) {
      opts = opts || {};
      const P = window.__lp;
      if (!opts.keep) P.reset(); else { window.__rsc.length = 0; window.__infos.length = 0; window.__pops.length = 0; }
      const made = P.board(types, null, opts.hp);
      const R = Math.random; if (rnd != null) Math.random = () => rnd;
      gameOver = false; let err = null;
      try { if (!window.__dfLore) throw new Error('__dfLore が無い'); await window.__dfLore.run(); } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
      gameOver = true; Math.random = R;
      const W = window.__dfLore || { known: new Set(), tried: new Set(), knows: () => false };
      let knows = null; try { knows = made.map((i) => !!W.knows(enemies[i])); } catch (e) { knows = 'ERR'; }
      return { err, made, rsc: window.__rsc.slice(), infos: window.__infos.slice(), pops: window.__pops.slice(),
        known: Array.from(W.known), tried: Array.from(W.tried), knows, labels: P.labels(made) };
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 走行 (ページごとに観測を集める。判定は judge で)
 * ══════════════════════════════════════════════════════════════════════════════ */
async function loreOn(page, types, rnd, opts) { return page.evaluate((t, r, o) => window.__lp.lore(t, r, o), types, rnd, opts || {}); }

async function mageRun(page, o) {
  return page.evaluate(async (o) => {
    const P = window.__lp; P.reset();
    const made = P.board(o.types, null, o.hp);
    for (const k of (o.known || [])) window.__dfLore.known.add(k);
    let origEM = null;
    if (o.wrapMult) { origEM = window.enemyElementMult; window.enemyElementMult = function (e, el) { return (e && e.type === 'goblin' && el === 'fire') ? 2 : origEM(e, el); }; }
    const T = []; P.record(T, o.keep || []);
    const R = Math.random; let nR = 0;
    const base = (o.seed != null) ? P.seeded(o.seed) : () => o.rnd;
    Math.random = function () { nR++; return base(); };
    let err = null;
    try {
      for (let t = 0; t < (o.turns || 1); t++) {
        const m = P.setMage(o.skills);
        for (const i of made) { enemies[i].alive = true; enemies[i].stunned = 0; enemies[i].hp = enemies[i].maxHp; }
        const ret = await window[o.fn](m);
        T.push('ret:' + ret);
      }
    } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
    Math.random = R; P.unrecord();
    if (origEM) window.enemyElementMult = origEM;
    return { err, T, nR };
  }, o);
}
const cnt = (T, k) => T.filter((x) => x === k).length;

async function aimRun(page, known) {
  return page.evaluate(async (known) => {
    const P = window.__lp; P.reset();
    // ゴブリン 2 体 (近い) / スケルトン 3 体 (遠い 2x2 の塊)
    const made = P.board(['goblin', 'goblin', 'skeleton', 'skeleton', 'skeleton'], [[3, 0], [3, 1], [5, 0], [6, 0], [5, 1]]);
    for (const k of known) window.__dfLore.known.add(k);
    const m = P.setMage(['sleep']);
    const R = Math.random; Math.random = () => 0.95;
    const T = []; P.record(T, ['allySleep']);
    let err = null;
    try { await allySleep(m, made[0]); } catch (e) { err = String(e).slice(0, 200); }
    Math.random = R; P.unrecord();
    return { err, pops: window.__pops.map((p) => p.text), stun: made.map((i) => enemies[i].stunned || 0) };
  }, known);
}

async function bossRun(page, types) {
  return page.evaluate(async (types) => {
    const P = window.__lp; P.reset();
    const made = P.board(types);
    const _ts = window.tryStealthSurprise;
    let reached = false;
    window.tryStealthSurprise = function () { reached = true; throw new Error('STOP'); };
    const _ce = console.error; console.error = function () {};
    let err = null;
    try { await runEncounter(made.slice()); } catch (e) { err = String(e && e.message || e).slice(0, 200); }
    console.error = _ce; window.tryStealthSurprise = _ts;
    try { encounterActive = false; } catch (e) {}
    gameOver = true;
    return { err, reached, rsc: window.__rsc.slice() };
  }, types);
}

/* (0c)(1f)(1h) の走査: ENEMY_TYPES の 51 種を 1 種ずつ 2 体置いて run() (出目 20)。 */
async function scanAll(page) {
  return page.evaluate(async () => {
    const out = {};
    for (const t of Object.keys(ENEMY_TYPES)) {
      const d = ENEMY_TYPES[t];
      let r;
      try { r = await window.__lp.lore([t, t], 0.95); } catch (e) { r = { err: String(e).slice(0, 200), rsc: [], labels: [], infos: [], known: [] }; }
      out[t] = { flags: { isBoss: !!d.isBoss, eyeStalks: !!d.eyeStalks, maxSummons: d.maxSummons || 0 },
        err: r.err, rsc: r.rsc, labels: r.labels, lines: r.infos.filter((s) => s.indexOf('📜') >= 0), known: r.known.indexOf(t) >= 0 };
    }
    return out;
  });
}

async function windowInfo(page) {
  return page.evaluate(() => {
    const L = window.__dfLore, T = window.__dfEnemyTraits;
    const vocab = new Set();
    const walk = (v) => { if (typeof v === 'string') vocab.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    if (T && T.table) walk(T.table);
    return {
      has: !!L, on: L ? L.on : null, skillOf: L ? Object.assign({}, L.skillOf) : null, cr: L ? Object.assign({}, L.cr) : null,
      spellElement: L ? Object.assign({}, L.spellElement) : null,
      fns: L ? ['run', 'knows', 'mult', 'decorate', 'crText', 'sleepUseless'].map((k) => typeof L[k]).join(',') : '',
      types: Object.keys(ENEMY_TYPES), vocab: Array.from(vocab), traitsOn: T ? T.on : null,
    };
  });
}

/* (3a) 何も知らない状態の列 */
async function parity(page) {
  const out = [];
  const boards = [['goblin', 'goblin', 'goblin'], ['skeleton', 'skeleton', 'goblin'], ['pharaxus', 'goblin'], ['caelum'], ['lich', 'skeleton'], ['ghostFlame', 'goblin']];
  const kits = [['sleep', 'fire-bolt', 'magic-missile'], ['sleep', 'fireball', 'cone-of-cold', 'lightning-bolt'], ['arcane-shield', 'sleep', 'ice-storm', 'burning-hands']];
  let seed = 11;
  for (const b of boards) {
    for (const kit of kits) {
      for (const hpv of [null, 5]) {
        const x = await mageRun(page, { fn: 'mageAI', types: b, known: [], skills: kit, seed: seed++, turns: 8, hp: hpv });
        out.push('M|' + b.join('+') + '|' + kit.join('+') + '|' + hpv + '|' + x.nR + '|' + x.T.join(',') + '|' + (x.err || ''));
      }
    }
    const e = await mageRun(page, { fn: 'elfAI', types: b, known: [], skills: ['lightning-arrow', 'magic-arrow', 'hail-of-thorns', 'hunters-mark'], seed: seed++, turns: 8 });
    out.push('E|' + b.join('+') + '|' + e.nR + '|' + e.T.join(',') + '|' + (e.err || ''));
  }
  const pl = await page.evaluate(async () => {
    const P = window.__lp; P.reset();
    const res = [];
    const saveCls = leaderClassKey; leaderClassKey = 'mage';
    const boards = [['goblin', 'goblin'], ['skeleton', 'skeleton'], ['pharaxus'], ['lich']];
    let s = 101;
    for (const b of boards) {
      const made = P.board(b);
      const rnd = P.seeded(s++); let nR = 0; const R = Math.random; Math.random = () => { nR++; return rnd(); };
      const ids = [];
      try { for (let t = 0; t < 30; t++) ids.push(pickLeaderAction(['normal', 'sleep', 'fire-bolt', 'magic-missile', 'fireball'], { target: enemies[made[0]] }).id); }
      catch (e) { ids.push('ERR:' + String(e).slice(0, 80)); }
      Math.random = R;
      res.push('L|' + b.join('+') + '|' + nR + '|' + ids.join(','));
    }
    leaderClassKey = saveCls;
    return { res, warns: window.__leaderPickWarns || 0 };
  });
  return out.concat(pl.res).concat(['warns=' + pl.warns]);
}

/* (3b) clericAI の列 (知っている / 知らない) */
async function clericRun(page, knowAll) {
  return page.evaluate(async (knowAll) => {
    const P = window.__lp;
    /* 盤面 × 味方の傷 (緊急回復の枝を通す) を回す。knowAll なら盤面の全種を「知っている」にする。 */
    const boards = [['skeleton', 'skeleton', 'goblin', 'goblin'], ['skeleton', 'skeleton', 'skeleton'], ['zombie', 'wraith'],
      ['goblin', 'goblin'], ['lich', 'skeleton'], ['pharaxus']];
    const T = []; let nR = 0, err = null;
    let seed = 303;
    for (const b of boards) {
      for (const hurt of [false, true]) {
        P.reset();
        const made = P.board(b);
        if (knowAll) for (const t of b) window.__dfLore.known.add(t);
        const c = allies.find((a) => a.classKey === 'cleric');
        const TILE = TILE_SIZE, s = (c.def && c.def.displaySize) || 96;
        c.x = P.lane.tx0 * TILE + TILE / 2 - s / 2; c.y = (P.lane.ty + 1) * TILE + TILE / 2 - s / 2;
        P.record(T, []);
        const rnd = P.seeded(seed++); const R = Math.random; Math.random = () => { nR++; return rnd(); };
        try {
          for (let t = 0; t < 6; t++) {
            c.hp = c.maxHp; if (c.spellSlots) for (const k of Object.keys(c.spellSlots)) c.spellSlots[k] = 9;
            for (const a of allies) if (a !== c) a.hp = hurt ? Math.max(1, Math.floor(a.maxHp * 0.2)) : a.maxHp;
            for (const i of made) { enemies[i].alive = true; enemies[i].stunned = 0; enemies[i].hp = enemies[i].maxHp; }
            const ret = await clericAI(c);
            T.push('ret:' + ret);
          }
        } catch (e) { err = err || String(e && e.stack || e).slice(0, 300); }
        Math.random = R; P.unrecord();
        T.push('|');
      }
    }
    return { err, T, nR };
  }, knowAll);
}

async function heroRun(page, types, known) {
  return page.evaluate(async (types, known) => {
    const P = window.__lp; P.reset();
    const made = P.board(types, types.map((t, k) => [2 + k, 0]));
    for (const k of known) window.__dfLore.known.add(k);
    leaderClassKey = 'mage';
    equippedSkills = ['sleep', 'fire-bolt', 'magic-missile'];
    const _hs = window.hasSpellSlot; window.hasSpellSlot = () => true;
    const _pl = window.pickLeaderAction; let got = null;
    window.pickLeaderAction = function (choices) { window.__plCalls++; got = choices.slice(); throw new Error('STOP'); };
    gameOver = false; let err = null;
    try { await playerAttackTurn(made[0]); } catch (e) { err = String(e && e.message); }
    gameOver = true; window.pickLeaderAction = _pl; window.hasSpellSlot = _hs;
    return { err, got };
  }, types, known);
}
async function heroWeight(page) {
  return page.evaluate(() => {
    const P = window.__lp; leaderClassKey = 'mage';
    const share = (known) => {
      P.reset(); const made = P.board(['goblin', 'goblin']); for (const k of known) window.__dfLore.known.add(k);
      const rnd = P.seeded(5); let nR = 0; const R = Math.random; Math.random = () => { nR++; return rnd(); };
      let s = 0;
      try { for (let t = 0; t < 400; t++) if (pickLeaderAction(['normal', 'sleep', 'magic-missile'], { target: enemies[made[0]] }).id === 'sleep') s++; }
      finally { Math.random = R; }
      return { s, nR };
    };
    const w0 = window.__leaderPickWarns || 0;
    return { known: share(['goblin']), unknown: share([]), warns: (window.__leaderPickWarns || 0) - w0 };
  });
}

/* 1 腕 (ON か OFF) の主ページで集める */
async function collectMain(page) {
  const A = {};
  A.win = await windowInfo(page);
  A.scan = await scanAll(page);
  // (1b)(1c)(1d)
  A.rel = await loreOn(page, ['skeleton', 'skeleton'], RND_HI);
  A.relAgain = await loreOn(page, ['skeleton'], RND_HI, { keep: true });
  A.relFail = await loreOn(page, ['skeleton', 'skeleton'], RND_LO);
  A.relFailAgain = await loreOn(page, ['skeleton'], RND_HI, { keep: true });
  // (1e)(1f)(1h)
  A.rat = await loreOn(page, ['rat', 'rat'], RND_HI);
  A.gob = await loreOn(page, ['goblin', 'goblin'], RND_HI);
  A.gobKing = await loreOn(page, ['goblin', 'goblinKing'], RND_HI);
  A.king = await loreOn(page, ['goblinKing'], RND_HI);
  // (1i) 後から作る
  A.late = await page.evaluate(() => {
    const P = window.__lp; P.reset();
    let err = null, r = null;
    try {
      window.__dfLore.known.add('skeleton');
      const made = P.board(['skeleton']);
      const idx = enemies.length; const e = createEnemy('skeleton', P.lane.tx0 + 6, P.lane.ty); enemies.push(e); createEnemyDom(idx, e.def, e.type);
      const lateAfterCreate = P.labels([idx]);
      const a = window.__dfLore.decorate(idx), b = window.__dfLore.decorate(idx);
      r = { first: P.labels(made), lateAfterCreate, late: P.labels([idx]), a, b };
    } catch (x) { err = String(x).slice(0, 200); }
    return { err, r };
  });
  // (1g) ボス戦 + 対照
  A.boss = await bossRun(page, ['lich', 'skeleton']);
  A.plainEnc = await bossRun(page, ['goblin', 'goblin']);
  // §2 AI
  const S = ['skeleton', 'skeleton', 'skeleton'], G = ['goblin', 'goblin', 'goblin'];
  A.a2a = { k: await mageRun(page, { fn: 'mageAI', types: S, known: ['skeleton'], skills: ['sleep', 'fire-bolt'], seed: 7, turns: 20 }),
            u: await mageRun(page, { fn: 'mageAI', types: S, known: [], skills: ['sleep', 'fire-bolt'], seed: 7, turns: 20 }) };
  A.a2b = { k: await mageRun(page, { fn: 'mageAI', types: G, known: ['goblin'], skills: ['sleep', 'fire-bolt'], rnd: 0.99 }),
            u: await mageRun(page, { fn: 'mageAI', types: G, known: [], skills: ['sleep', 'fire-bolt'], rnd: 0.99 }) };
  A.a2c = { k: await mageRun(page, { fn: 'mageAI', types: ['pharaxus'], known: ['pharaxus'], skills: ['fireball', 'magic-missile'], rnd: 0.5 }),
            u: await mageRun(page, { fn: 'mageAI', types: ['pharaxus'], known: [], skills: ['fireball', 'magic-missile'], rnd: 0.5 }),
            kb: await mageRun(page, { fn: 'mageAI', types: ['pharaxus'], known: ['pharaxus'], skills: ['fire-bolt'], rnd: 0.5 }),
            ub: await mageRun(page, { fn: 'mageAI', types: ['pharaxus'], known: [], skills: ['fire-bolt'], rnd: 0.5 }) };
  A.a2d = { kc: await mageRun(page, { fn: 'mageAI', types: ['caelum'], known: ['caelum'], skills: ['cone-of-cold', 'fireball'], rnd: 0.5, hp: 5 }),
            uc: await mageRun(page, { fn: 'mageAI', types: ['caelum'], known: [], skills: ['cone-of-cold', 'fireball'], rnd: 0.5, hp: 5 }),
            kl: await mageRun(page, { fn: 'mageAI', types: ['lich'], known: ['lich'], skills: ['cone-of-cold', 'fireball'], rnd: 0.5, hp: 1 }),
            ul: await mageRun(page, { fn: 'mageAI', types: ['lich'], known: [], skills: ['cone-of-cold', 'fireball'], rnd: 0.5, hp: 1 }) };
  A.a2e = { k: await mageRun(page, { fn: 'mageAI', types: ['goblin'], known: ['goblin'], skills: ['magic-missile', 'fire-bolt'], rnd: 0.5, wrapMult: true }),
            u: await mageRun(page, { fn: 'mageAI', types: ['goblin'], known: [], skills: ['magic-missile', 'fire-bolt'], rnd: 0.5, wrapMult: true }) };
  A.a2f = { k: await mageRun(page, { fn: 'elfAI', types: ['ghostFlame'], known: ['ghostFlame'], skills: ['lightning-arrow'], rnd: 0.5 }),
            u: await mageRun(page, { fn: 'elfAI', types: ['ghostFlame'], known: [], skills: ['lightning-arrow'], rnd: 0.5 }),
            kl: await mageRun(page, { fn: 'elfAI', types: ['lich'], known: ['lich'], skills: ['lightning-arrow'], rnd: 0.5 }) };
  A.a2h = { k: await aimRun(page, ['skeleton']), u: await aimRun(page, []) };
  A.parity = await parity(page);
  A.cleric = { k: await clericRun(page, true), u: await clericRun(page, false) };
  A.plCalls = await page.evaluate(() => window.__plCalls);
  return A;
}
async function collectHero(page) {
  const H = {};
  H.phK = await heroRun(page, ['pharaxus'], ['pharaxus']);
  H.phU = await heroRun(page, ['pharaxus'], []);
  H.skK = await heroRun(page, ['skeleton', 'skeleton'], ['skeleton']);
  H.skU = await heroRun(page, ['skeleton', 'skeleton'], []);
  H.wt = await heroWeight(page);
  return H;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 述語 (ON と OFF の両方へ同じ本体を当てる = (4a))
 * ══════════════════════════════════════════════════════════════════════════════ */
function pred1b(A) {
  const r = A.rel;
  const c = r.rsc[0];
  const ok = !r.err && r.rsc.length === 1 && c.k === 'religion' && c.auto === true && c.cls.length >= 1
    && c.cls.every((k) => (DRV_PROF[k] || []).indexOf('religion') >= 0) && J(c.cls) === J(['cleric']);
  return { ok, rsc: r.rsc, err: r.err };
}
function pred1c(A) {
  const hi = A.rel, lo = A.relFail;
  const okHi = !hi.err && hi.known.indexOf('skeleton') >= 0 && Array.isArray(hi.knows) && hi.knows.every(Boolean);
  const okLo = !lo.err && lo.rsc.length === 1 && lo.tried.indexOf('skeleton') >= 0 && lo.known.indexOf('skeleton') < 0
    && Array.isArray(lo.knows) && lo.knows.every((x) => x === false) && lo.labels.every((l) => l && l.length === 0);
  return { ok: okHi && okLo, okHi, okLo, hi: { known: hi.known, knows: hi.knows }, lo: { tried: lo.tried, known: lo.known, knows: lo.knows, labels: lo.labels } };
}
function pred1g(A) {
  const b = A.boss, p = A.plainEnc;
  const ok = b.reached && b.rsc.length === 1 && b.rsc[0].k === 'religion' && b.rsc[0].dc === 15 && p.reached && p.rsc.length === 1 && p.rsc[0].k === 'history';
  return { ok, boss: { reached: b.reached, rsc: b.rsc, err: b.err }, plain: { reached: p.reached, rsc: p.rsc } };
}
function pred1h(A) {
  const bad = [];
  const sk = A.rel;
  if (!(sk.labels.length === 2 && sk.labels.every((l) => l && l.length === 1 && l[0] === 'CR1/4'))) bad.push('スケルトンの札 ' + J(sk.labels));
  const okLine = sk.infos.filter((s) => s.indexOf('📜') >= 0);
  if (!(okLine.length === 1 && okLine[0].indexOf('1/4') >= 0)) bad.push('スケルトンのログ ' + J(okLine));
  const gk = A.gobKing;
  if (!(gk.labels[0] && J(gk.labels[0]) === J(['CR1/4']) && gk.labels[1] && gk.labels[1].length === 0)) bad.push('ゴブリン+キングの札 ' + J(gk.labels));
  const k = A.king;
  if (!(k.known.indexOf('goblinKing') >= 0 && k.labels[0] && k.labels[0].length === 0 && !k.infos.some((s) => s.indexOf('脅威度') >= 0))) bad.push('キング ' + J({ known: k.known, labels: k.labels, infos: k.infos }));
  const lo = A.relFail;
  if (!lo.labels.every((l) => l && l.length === 0)) bad.push('失敗の札 ' + J(lo.labels));
  // 走査: 見抜いた全種の札 = SRD の CR か無し・ログの「脅威度」の有無が一致
  let nKnown = 0;
  for (const t of Object.keys(A.scan)) {
    const s = A.scan[t];
    if (!s.known) continue;
    nKnown++;
    const want = DRV_CR[t] != null ? ['CR' + crText(DRV_CR[t])] : [];
    if (!s.labels.every((l) => l && J(l) === J(want))) bad.push(t + ' 札 ' + J(s.labels) + ' ≠ ' + J(want));
    const line = s.lines.join(' ');
    const wantCrLine = DRV_CR[t] != null ? '脅威度 ' + crText(DRV_CR[t]) : null;
    if (wantCrLine ? line.indexOf(wantCrLine) < 0 : line.indexOf('脅威度') >= 0) bad.push(t + ' ログ ' + line.slice(0, 80));
  }
  if (nKnown < 30) bad.push('走査で見抜いた種が少なすぎる ' + nKnown);
  return { ok: bad.length === 0, bad, nKnown };
}
function pred2a(A) { const k = cnt(A.a2a.k.T, 'allySleep'), u = cnt(A.a2a.u.T, 'allySleep'); return { ok: !A.a2a.k.err && !A.a2a.u.err && k === 0 && u >= 1, k, u }; }
function pred2b(A) { const k = cnt(A.a2b.k.T, 'allySleep'), u = cnt(A.a2b.u.T, 'allySleep'); return { ok: k === 1 && u === 0, k: A.a2b.k.T, u: A.a2b.u.T }; }
function pred2c(A) {
  const X = A.a2c;
  const fire = (T) => T.filter((x) => /^ally(FireBolt|Fireball|BurningHands)$/.test(x)).length;
  const ok = fire(X.k.T) === 0 && X.k.T[0] === 'allyMagicMissile' && X.u.T[0] === 'allyFireball'
    && X.kb.T.join() === 'ret:false' && X.ub.T[0] === 'allyFireBolt';
  return { ok, k: X.k.T, u: X.u.T, kb: X.kb.T, ub: X.ub.T };
}
function pred2d(A) {
  const X = A.a2d;
  const ok = cnt(X.kc.T, 'allyConeOfCold') === 0 && X.kc.T[0] === 'allyFireball' && X.uc.T[0] === 'allyConeOfCold'
    && X.kl.T[0] === 'allyFireball' && X.ul.T[0] === 'allyConeOfCold';
  return { ok, kc: X.kc.T, uc: X.uc.T, kl: X.kl.T, ul: X.ul.T };
}
function pred2e(A) { const X = A.a2e; return { ok: X.k.T[0] === 'allyFireBolt' && X.u.T[0] === 'allyMagicMissile', k: X.k.T, u: X.u.T }; }
function pred2f(A) {
  const X = A.a2f;
  return { ok: cnt(X.k.T, 'allyLightningArrow') === 0 && cnt(X.u.T, 'allyLightningArrow') === 1 && cnt(X.kl.T, 'allyLightningArrow') === 1, k: X.k.T, u: X.u.T, kl: X.kl.T };
}
function pred2g(H) {
  const has = (r, id) => !!(r.got && r.got.indexOf(id) >= 0);
  const ok = !!H.phK.got && !has(H.phK, 'fire-bolt') && has(H.phK, 'sleep') && has(H.phU, 'fire-bolt')
    && !!H.skK.got && !has(H.skK, 'sleep') && has(H.skK, 'fire-bolt') && has(H.skU, 'sleep')
    && H.wt.known.s > H.wt.unknown.s && H.wt.known.nR === 400 && H.wt.unknown.nR === 400 && H.wt.warns === 0;
  return { ok, phK: H.phK.got, phU: H.phU.got, skK: H.skK.got, skU: H.skU.got, wt: H.wt };
}
const rangeOf = (x) => { const m = (x.pops.join(' ').match(/範囲 (\d+)体/)); return m ? +m[1] : null; };
function pred2h(A) {
  const K = A.a2h.k, U = A.a2h.u;
  const ok = !K.err && !U.err && K.stun[0] > 0 && K.stun[1] > 0 && rangeOf(U) === 3 && U.stun[0] === 0 && U.stun[1] === 0;
  return { ok, k: K.stun, kr: rangeOf(K), u: U.stun, ur: rangeOf(U), err: K.err || U.err };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 判定
 * ══════════════════════════════════════════════════════════════════════════════ */
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    R.push({ id, name, ok: !!ok, detail: String(detail === undefined ? '' : detail) });
    console.log((ok ? '  ✓ ' : '  ✗ ') + id + ' ' + name + (detail !== undefined ? '  -- ' + String(detail).slice(0, 600) : ''));
  };
  return R;
}

function judge(ctx, D, R) {
  const ON = D.on, OFF = D.off, HON = D.heroOn, HOFF = D.heroOff;
  /* ── (0a) 装置 ── */
  {
    const nCalls = Object.values(ON.scan).reduce((s, x) => s + x.rsc.length, 0);
    const sleepN = cnt(ON.a2a.u.T, 'allySleep');
    const atk = ON.a2c.u.T.concat(ON.a2c.k.T, ON.a2e.k.T).filter((x) => /^ally(FireBolt|Fireball|MagicMissile|ConeOfCold|LightningBolt|IceStorm|BurningHands)$/.test(x)).length;
    const la = cnt(ON.a2f.u.T, 'allyLightningArrow');
    const pl = ON.plCalls;
    const ok = nCalls >= 1 && sleepN >= 1 && atk >= 1 && la >= 1 && pl >= 1 && !!HON.phU.got;
    R.check('(0a)', '[装置] 判定が resolveSkillCheck を呼んだ・mageAI がスリープと攻撃呪文を撃った・elfAI が LA を撃った・pickLeaderAction が呼ばれた', ok,
      '判定の呼び出し ' + nCalls + ' / スリープ ' + sleepN + ' / 攻撃呪文 ' + atk + ' / LA ' + la + ' / pickLeaderAction ' + pl + ' / 主人公の choices ' + J(HON.phU.got));
  }
  /* ── (0b) 窓と振り分け ── */
  {
    const w = ON.win, bad = [];
    if (!w.has) bad.push('__dfLore が無い');
    else {
      if (w.on !== true) bad.push('on=' + w.on);
      if (w.fns !== 'function,function,function,function,function,function') bad.push('fns=' + w.fns);
      const miss = Object.keys(w.skillOf).filter((k) => w.types.indexOf(k) < 0);
      if (miss.length) bad.push('ENEMY_TYPES に無いキー ' + J(miss));
    }
    const drv = Object.keys(DRV_SKILL), nat = DRV_NATURE;
    const both = drv.filter((k) => nat.indexOf(k) >= 0);
    const union = drv.concat(nat).sort();
    if (w.types.length !== 51) bad.push('ENEMY_TYPES ' + w.types.length + ' キー');
    if (drv.length !== 40 || nat.length !== 11 || both.length) bad.push('ドライバの表 ' + drv.length + '/' + nat.length + ' 重複 ' + J(both));
    if (J(union) !== J(w.types.slice().sort())) bad.push('51 キーとドライバの表の和が不一致: 過 ' + J(union.filter((k) => w.types.indexOf(k) < 0)) + ' 欠 ' + J(w.types.filter((k) => union.indexOf(k) < 0)));
    R.check('(0b)', '__dfLore が在り on === true・skillOf の全キーが ENEMY_TYPES に実在・51 キーがドライバの表で技能あり 40 / 対象外 11', bad.length === 0,
      bad.length ? '⛔ ' + bad.join(' / ') : 'on=true・skillOf ' + Object.keys(w.skillOf).length + ' キー・ENEMY_TYPES ' + w.types.length);
  }
  /* ── (0c) 振り分け・実効の技能・呪文の属性 ── */
  {
    const w = ON.win, bad = [];
    if (w.has) {
      for (const t of w.types) {
        const page = w.skillOf[t] || null, drv = DRV_SKILL[t] || null;
        if (page !== drv) bad.push('表 ' + t + ' page=' + page + ' drv=' + drv);
        const s = ON.scan[t];
        const eff = s.rsc.length ? s.rsc.map((c) => c.k).join('+') : null;
        const want = (drv && t !== 'caravanWagon') ? drv : null;
        if (s.err) bad.push('実効 ' + t + ' !' + s.err.slice(0, 80));
        else if (eff !== want) bad.push('実効 ' + t + ' 振った=' + eff + ' drv=' + want);
      }
      const pe = w.spellElement || {};
      if (J(Object.keys(pe).sort()) !== J(Object.keys(DRV_ELEMENT).sort())) bad.push('spellElement のキー ' + J(Object.keys(pe)));
      for (const k of Object.keys(DRV_ELEMENT)) if (pe[k] !== DRV_ELEMENT[k]) bad.push('spellElement ' + k + ' page=' + pe[k] + ' drv=' + DRV_ELEMENT[k]);
      for (const k of Object.keys(pe)) if (w.vocab.indexOf(pe[k]) < 0) bad.push('属性語 ' + pe[k] + ' (' + k + ') が __dfEnemyTraits の表に無い (語 ' + J(w.vocab) + ')');
    } else bad.push('__dfLore が無い');
    R.check('(0c)', 'skillOf = ドライバの表 (51 種)・実効の技能 (1 種ずつ run) も一致・spellElement 7 行一致・属性語は体質の表の語', bad.length === 0,
      bad.length ? '⛔ ' + bad.slice(0, 10).join(' / ') + (bad.length > 10 ? ' …他 ' + (bad.length - 10) : '') : '51 種一致 (実効で振った ' + Object.values(ON.scan).filter((s) => s.rsc.length).length + ' 種)・属性語 ' + J(w.vocab));
  }
  /* ── (0d) 脅威度 = SRD ── */
  {
    const w = ON.win, bad = [];
    const pc = w.cr || {};
    const pk = Object.keys(pc).sort(), dk = Object.keys(DRV_SLUG).sort();
    if (J(pk) !== J(dk)) bad.push('表のキー: 過 ' + J(pk.filter((k) => dk.indexOf(k) < 0)) + ' 欠 ' + J(dk.filter((k) => pk.indexOf(k) < 0)));
    for (const k of dk) if (pc[k] !== DRV_CR[k]) bad.push(k + ' page=' + pc[k] + ' SRD(' + DRV_SLUG[k] + ')=' + DRV_CR[k]);
    const leak = DRV_NO_CR.filter((k) => Object.prototype.hasOwnProperty.call(pc, k));
    if (leak.length) bad.push('出さない 17 キーが表に在る ' + J(leak));
    const u = dk.concat(DRV_NO_CR).sort();
    if (dk.length !== 34 || DRV_NO_CR.length !== 17 || J(u) !== J(w.types.slice().sort())) bad.push('34 + 17 ≠ ENEMY_TYPES');
    R.check('(0d)', 'ページの cr の 34 キー = SRD の cr: (ドライバが slug で読む)・「出さない」17 キーは表に無い', bad.length === 0,
      bad.length ? '⛔ ' + bad.slice(0, 8).join(' / ') : '34/34 一致 (例 lich=' + DRV_CR.lich + ' pharaxus=' + DRV_CR.pharaxus + ' rat=' + DRV_CR.rat + ')');
  }
  /* ── (0e) 起動 ── */
  R.check('(0e)', '[装置] 全ページが起動した + pageerror 0 件 (favicon は除外)', ctx.booted === ctx.want && ctx.errs.length === 0,
    '起動 ' + ctx.booted + '/' + ctx.want + ' / pageerror ' + (ctx.errs.slice(0, 3).join(' | ') || '(なし)'));

  /* ── §1 ── */
  {
    const a = D.norel.first, b = D.norel.second;
    const nb = (x) => x.infos.filter((s) => s.indexOf('正体を知る者はいない') >= 0).length;
    const ok = !a.err && a.rsc.length === 0 && nb(a) === 1 && a.tried.length === 0 && !b.err && b.rsc.length === 0 && nb(b) === 0;
    R.check('(1a)', '戦士 + 盗賊 × スケルトン → 呼ばない・「正体を知る者はいない」1 行・tried に入らない・2 戦目は繰り返さない', ok,
      J({ rsc: a.rsc, nobody: nb(a), tried: a.tried, rsc2: b.rsc, nobody2: nb(b), err: a.err || b.err }));
  }
  const p1b = pred1b(ON);
  R.check('(1b)', '僧侶の居る編成 × スケルトン → religion で 1 回・渡された全員が宗教の習熟を持つ (= 僧侶だけ・auto)', p1b.ok, J(p1b));
  const p1c = pred1c(ON);
  R.check('(1c)', '出目 20 → known にスケルトン・knows 真 / 出目 1 → tried に入り known に入らない・knows 偽・札なし', p1c.ok, J(p1c));
  {
    const ok = ON.relAgain.rsc.length === 0 && ON.relFailAgain.rsc.length === 0 && ON.rel.rsc.length === 1 && ON.relFail.rsc.length === 1;
    R.check('(1d)', '同じ種類との 2 戦目 (成功の後・失敗の後) → 呼び出しが増えない', ok,
      '成功→2 戦目 ' + ON.relAgain.rsc.length + ' / 失敗→2 戦目 ' + ON.relFailAgain.rsc.length + ' (1 戦目 ' + ON.rel.rsc.length + '/' + ON.relFail.rsc.length + ')');
  }
  {
    const r = ON.rat;
    R.check('(1e)', 'ジャイアントラットだけ → 呼び出し 0・ログ 0 行', !r.err && r.rsc.length === 0 && r.infos.length === 0, J({ rsc: r.rsc, infos: r.infos, err: r.err }));
  }
  {
    const bad = [];
    const g = ON.gob, gk = ON.gobKing;
    if (!(g.rsc.length === 1 && g.rsc[0].dc === 10)) bad.push('ゴブリン ' + J(g.rsc));
    if (!(gk.rsc.length === 1 && gk.rsc[0].dc === 15)) bad.push('ゴブリン+キング ' + J(gk.rsc));
    let n = 0;
    for (const t of Object.keys(ON.scan)) {
      const s = ON.scan[t];
      for (const c of s.rsc) { n++; const want = DRV_BOSS_DC(s.flags); if (c.dc !== want) bad.push(t + ' DC ' + c.dc + ' ≠ ' + want); }
    }
    if (n < 30) bad.push('走査で振った数が少なすぎる ' + n);
    R.check('(1f)', 'DC: ゴブリン → 10 / ゴブリン + キング → 15 + 振られた全種の DC = 定義のフラグ (isBoss / eyeStalks / maxSummons) から出した値', bad.length === 0,
      bad.length ? '⛔ ' + bad.slice(0, 8).join(' / ') : 'ゴブリン 10・+キング 15・走査 ' + n + ' 回すべて一致');
  }
  const p1g = pred1g(ON);
  R.check('(1g)', 'リッチ + スケルトン (boss_appear の枝) の runEncounter → 宗教の判定 1 回 DC 15 (対照: ゴブリンの runEncounter も 1 回)', p1g.ok, J(p1g));
  const p1h = pred1h(ON);
  R.check('(1h)', '見抜いた → ログに 1/4・札に CR1/4 がちょうど 1 つ / キングは札なし・「脅威度」なし / 失敗は札なし / 走査: 札 = SRD の CR', p1h.ok,
    p1h.ok ? '見抜いた ' + p1h.nKnown + ' 種すべて一致' : '⛔ ' + p1h.bad.slice(0, 6).join(' / '));
  {
    const L = ON.late, N = D.nolabel;
    const okOn = !L.err && L.r && J(L.r.first) === J([['CR1/4']]) && J(L.r.lateAfterCreate) === J([['CR1/4']]) && J(L.r.late) === J([['CR1/4']]);
    const okN = !N.err && N.run && !N.run.err && N.run.known.indexOf('skeleton') >= 0 && N.run.labels.every((l) => l === null) && N.late.labels.every((l) => l === null) && N.late.a === false && N.late.b === false;
    R.check('(1i)', '見抜いた種類を後から作る → 札に CR が 1 つ・decorate 2 回でも 1 つ / ?namelabel=0 では例外なく何も付かない', okOn && okN,
      J({ on: L.r || L.err, nolabel: N }).slice(0, 500));
  }
  /* ── §2 ── */
  const p2a = pred2a(ON); R.check('(2a)', 'スケルトン 3 体を知る × スリープ + ファイアボルト 20 手番 → allySleep 0 / 知らない → 1 回以上', p2a.ok, J(p2a));
  const p2b = pred2b(ON); R.check('(2b)', 'ゴブリン 3 体を知る × 乱数 0.99 → スリープ / 知らない → 撃たない', p2b.ok, J(p2b));
  const p2c = pred2c(ON); R.check('(2c)', 'ファラクサスを知る × ファイアボール + MM → 炎 0・MM / 知らない → ファイアボール + ファイアボルトだけ → 知る = false', p2c.ok, J(p2c));
  const p2d = pred2d(ON); R.check('(2d)', 'カエルムを知る × コーン + ファイアボール (threat < 25) → コーン 0 / リッチを知る → ファイアボールへ / 知らない → コーン', p2d.ok, J(p2d));
  const p2e = pred2e(ON); R.check('(2e)', '器: window.enemyElementMult を包んでゴブリン × 炎 = 2 → 知っていればファイアボルト / 知らない → MM', p2e.ok, J(p2e));
  const p2f = pred2f(ON); R.check('(2f)', 'ウィスプを知る × エルフ → LA を撃たない / 知らない → 撃つ (リッチ = 雷 0.5 なら撃つ)', p2f.ok, J(p2f));
  const p2g = pred2g(HON); R.check('(2g)', '主人公 (魔法使い): ファラクサスを知る → 炎なし / スケルトンだけを知る → sleep なし / 知らない → 両方 + 重み', p2g.ok, J(p2g).slice(0, 600));
  const p2h = pred2h(ON); R.check('(2h)', '狙点: 眠らないと知るスケルトン 3 体の塊 + ゴブリン 2 体 → 2x2 はゴブリン側 / 知らない → スケルトン側 (範囲 3 体)', p2h.ok, J(p2h));
  /* ── §3 ── */
  {
    const a = ON.parity, b = OFF.parity;
    const diff = a.map((s, i) => (s === b[i] ? null : { i, on: s.slice(0, 160), off: (b[i] || '').slice(0, 160) })).filter(Boolean);
    const nonTrivial = a.filter((s) => /ally(Sleep|FireBolt|Fireball|ConeOfCold|LightningBolt|IceStorm|MagicMissile|LightningArrow|ArcaneShield)/.test(s)).length;
    const hasSleep = a.filter((s) => /allySleep/.test(s)).length;
    const ok = a.length === b.length && a.length > 40 && diff.length === 0 && a.every((s) => s.indexOf('Error') < 0) && nonTrivial >= 30 && hasSleep >= 5;
    R.check('(3a)', '何も知らない: mageAI / elfAI / pickLeaderAction の呼び出し列と Math.random 回数が ?lore=0 と同一', ok,
      (diff.length ? '⛔ 差 ' + diff.length + ' 列: ' + J(diff.slice(0, 2)) : '') + ' 列 ' + a.length + '・非自明 ' + nonTrivial + '・スリープを含む ' + hasSleep);
  }
  {
    const k = ON.cleric.k, u = ON.cleric.u;
    const kinds = Array.from(new Set(u.T.filter((x) => /^ally/.test(x))));
    const ok = !k.err && !u.err && J(k.T) === J(u.T) && k.nR === u.nR && kinds.length >= 2 && u.nR >= 1;
    R.check('(3b)', 'clericAI の呼び出し列と乱数の回数は、知っている時と知らない時で完全一致', ok,
      '呼ばれた種類 ' + J(kinds) + ' / 知る ' + k.nR + ' 回 (' + k.T.length + ' 個) / 知らない ' + u.nR + ' 回' + (J(k.T) === J(u.T) ? ' (列一致)' : ' ⛔ [' + u.T.join(',').slice(0, 160) + ']') + (k.err || u.err ? ' !' + (k.err || u.err) : ''));
  }
  /* ── §4 (4a) 同じ述語を OFF へ ── */
  {
    const preds = { '(1b)': (X) => pred1b(X.m), '(1c)': (X) => pred1c(X.m), '(1g)': (X) => pred1g(X.m), '(1h)': (X) => pred1h(X.m),
      '(2a)': (X) => pred2a(X.m), '(2b)': (X) => pred2b(X.m), '(2c)': (X) => pred2c(X.m), '(2f)': (X) => pred2f(X.m), '(2g)': (X) => pred2g(X.h) };
    const safe = (f, X) => { try { return !!f(X).ok; } catch (e) { return false; } };
    const rows = Object.keys(preds).map((k) => ({ k, on: safe(preds[k], { m: ON, h: HON }), off: safe(preds[k], { m: OFF, h: HOFF }) }));
    const ok = rows.every((x) => x.off === false) && OFF.win.on === false;
    R.check('(4a)', '?lore=0 では (1b)(1c)(1g)(1h)(2a)(2b)(2c)(2f)(2g) の同じ述語がすべて偽 (+ 窓の on === false)', ok,
      rows.map((x) => x.k + ' ON=' + x.on + '/OFF=' + x.off).join(' ') + ' / OFF の窓 on=' + OFF.win.on
      + ' / 例: OFF の判定 ' + OFF.rel.rsc.length + ' 回・スケルトン×スリープ OFF ' + cnt(OFF.a2a.k.T, 'allySleep') + ' 回');
  }
}

function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + '   PENDING 0' + (label ? '   ' + label : ''));
  if (failed) {
    console.log('  --- FAILED ---');
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 80) + '  -- ' + r.detail.slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed, failed };
}

const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(0e)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(1h)', '(1i)',
  '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(2g)', '(2h)', '(3a)', '(3b)', '(4a)'];
async function runSuite(browser, port, label) {
  const ctx = { browser, port, errs: [], booted: 0, want: 6 };
  const R = mkResults();
  const pages = [];
  const open = async (qs, party, tag) => { const p = await openIndex(ctx, qs, party, tag); pages.push(p); return p; };
  try {
    const D = {};
    const pOn = await open('', SEED_PARTY, 'main');
    D.on = await collectMain(pOn);
    console.log('[vet] ' + label + ' ON を撃ち終えた (' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒)');
    const pOff = await open('?lore=0', SEED_PARTY, 'main');
    D.off = await collectMain(pOff);
    console.log('[vet] ' + label + ' OFF を撃ち終えた (' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒)');
    const hOn = await open('', MAGE_HERO_PARTY, 'hero');
    D.heroOn = await collectHero(hOn);
    const hOff = await open('?lore=0', MAGE_HERO_PARTY, 'hero');
    D.heroOff = await collectHero(hOff);
    const pNo = await open('', NOREL_PARTY, 'norel');
    D.norel = { first: await loreOn(pNo, ['skeleton'], RND_HI), second: await loreOn(pNo, ['skeleton'], RND_HI, { keep: true }) };
    const pNl = await open('?namelabel=0', SEED_PARTY, 'nolabel');
    D.nolabel = await pNl.evaluate(async () => {
      let err = null, run = null, late = null;
      try {
        run = await window.__lp.lore(['skeleton', 'skeleton'], 0.95);
        const P = window.__lp;
        const idx = enemies.length; const e = createEnemy('skeleton', P.lane.tx0 + 6, P.lane.ty); enemies.push(e); createEnemyDom(idx, e.def, e.type);
        const a = window.__dfLore.decorate(idx), b = window.__dfLore.decorate(idx);
        late = { labels: P.labels([idx]), a, b };
      } catch (x) { err = String(x).slice(0, 200); }
      return { err, run: run && { err: run.err, known: run.known, labels: run.labels }, late };
    });
    judge(ctx, D, R);
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    for (const p of pages) await p.close().catch(() => {});
  }
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_lorecheck_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const srv0 = await startServer(PORT, null);
      const R0 = await runSuite(browser, PORT, '(素・基準)');
      await stopServer(srv0);
      const s0 = summarize(R0, '[素・基準]');
      if (s0.failed) {
        console.error('[vet] ⛔ 素の基準で FAIL がある — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        const allIds = R0.map((r) => r.id);
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const srv = await startServer(port, key);
          console.log('\n[vet] ════════ 変異 ' + key + ' (port ' + port + ') ════════');
          const R = await runSuite(browser, port, '[変異 ' + key + ']');
          await stopServer(srv);
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const r0e = R.filter((r) => r.id === '(0e)')[0];
          const bootOk = !!r0e && r0e.ok;   // ⭐ 構文破壊で全部赤くなる偽の検出を見分ける
          const want = NEG_EXPECT[key] || [];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = red.filter((x) => want.indexOf(x) < 0);
          const absent = allIds.filter((id) => !R.some((r) => r.id === id));
          const ok = bootOk && want.length > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)')
            + ' / 起動確認 ' + (bootOk ? 'OK' : 'NG') + ' → ' + (ok ? '✓ OK' : '✗ ' + (!bootOk ? '起動確認 NG ' : '') + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, red, ok, bootOk });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (赤 = 担当に完全一致)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(12) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルだけが赤くなりました (空振り 0・漏れ 0)');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const srv = await startServer(port, MUTATE);
      const R = await runSuite(browser, port, '[変異 ' + MUTATE + ' (手回し)]');
      await stopServer(srv);
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vet] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)'));
      exitCode = 0;
    } else {
      const srv = await startServer(PORT, null);
      const R = await runSuite(browser, PORT, '(素)');
      await stopServer(srv);
      const s = summarize(R, '');
      exitCode = s.failed ? 1 : 0;
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
