#!/usr/bin/env node
/*
 * verify_enemy_traits.js — 実装依頼書 #75「敵の体質 (5e SRD) を戦いに効かせる」の受入ドライバ (依頼書 2026-09-28_enemy-traits.md §8 / §12-3)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_enemy_traits.js                        # 素
 *   node tools/verify_enemy_traits.js --negative             # 変異 7 本 (port 10460〜10466)。先に素の基準を走らせる
 *   node tools/verify_enemy_traits.js --negative --only immunefloor,preshow
 *   node tools/verify_enemy_traits.js --mutate immunefloor   # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない / 2=環境不足・例外 / 3=変異アンカーの腐敗 (注入点がちょうど 1 箇所でない)
 *
 * ■ 方針 — 属性の 11 か所と allySleep を**実際に撃たせて**、敵の HP の減りと stunned を観測する。
 *   - 乱数は Math.random そのものを定数に固定する (依頼書 §12-0 崩れ 1: #4〜#10 は Math.random 直振り。d20 / rollDiceDD も内部で読む)。
 *     既定 0.95 ⇒ d20 = 20 (命中・クリティカル確定・セーヴは必ず成功 = 敵の能力値の差でダメージが割れない)。
 *     凍結 (2c) だけは 0.02 ⇒ d20 = 1 (セーヴ失敗 = 凍結が付く)。
 *   - 期待値は 2 経路: ① ページの窓 __dfEnemyTraits (表と判定関数) ② **このドライバが独立に持つ SRD の表 SRD** (依頼書 §2-2 を書き写した)。
 *     (0c) で ① と ② を 51 種 × 3 属性 + 眠りで突き合わせ、ダメージの期待値は ② から出す。
 *   - 素のダメージ = 同じ乱数・同じ経路で**ゴブリン**に撃った減り (体質なし)。
 *   - 撤退の腕 = index.html?enemytraits=0 を別ページで開く (ページ単位の定数 ENEMY_TRAITS_ON)。両腕とも同じ配信スナップショット。
 *
 * ■ 11 経路 (依頼書 §2-3 / §12-0 の番号)
 *   P1 applyWeaponSpecialEffects の余波 (shockwaveType fire | lightning) … 対象の隣の敵が受ける (盤面 [ゴブリン=対象, 被験])
 *   P2 同 追加属性 (bonusDmgType fire | cold | lightning)                  … 被験が直接受ける
 *   P3 allyFireBolt / P4 allyFireball / P5 allyLightningBolt / P6 allyConeOfCold / P7 allyIceStorm / P8 allyBurningHands
 *   P9 allyLightningArrow 本命中 (被験を狙う) / P10 同 飛び散り (盤面 [ゴブリン=本命, 被験])
 *   P11 tryReflectEnemySpell (反射の指輪を持たせ、fireAcid の呪文を跳ね返す) … window.__plaza.tryReflect
 *   ⇒ 属性の組は 14 通り (VARIANTS)。被験 × 14 × 2 腕を全部撃つ。
 *
 * ■ 測っているもの
 *   §0 (0a) [装置] 14 通りの経路と allySleep・凍結・不意打ちが**ゴブリンに対して実際に効いた** (HP が減った / 眠った / stunned が付いた)
 *           + 反射が発動した (tryReflect が true) ⭐ これが無いと全 assert が空振りで永久緑
 *      (0b) __dfEnemyTraits が在り on === true・表のキー 8 個・表の全キーが ENEMY_TYPES に実在 (?enemytraits=0 の腕で on === false)
 *      (0c) SRD の表 (ドライバ) とページの表の中身が一致 (表のキー集合 + 全 51 種 × 炎/冷気/雷の倍率 + 眠りの免疫)
 *      (0d) [装置] 2 腕とも起動し pageerror 0 件 (⭐ --negative の「起動確認」= 構文破壊で全部赤くなる偽の検出を見分ける)
 *   §1 (1a) ファラクサスに炎の 6 経路 (P1 余波 / P2 追加属性 / P3 / P4 / P8 / P11 反射) → 減り 0 + IMMUNE の吹き出し
 *      (1b) レイスに 14 通り全部 → 減り = max(1, floor(素/2)) + RESIST の吹き出し
 *      (1c) カエルム (冷気 0 / 炎・雷 半分)・ウィル・オ・ウィスプ (雷 0 / 炎・冷気 半分)・リッチ (炎 等倍 / 冷気・雷 半分) に 14 通り全部
 *      (1d) ファイアボールでゴブリン + ファラクサスを同時に巻き込む → ゴブリンは素と同じだけ減り、ファラクサスは 0
 *      (1e) 表示の数字 (showDmgAt) が判定後の値: (1a)〜(1c) の全走行で被験への最後の表示 = HP の減り。(1a) の表示に正の数が無い
 *   §2 (2a) 眠らない 10 種 (SRD: アンデッド 7 + 構造体 3) それぞれにスリープ → stunned が増えない・吹き出しが IMMUNE で「効かない 1」・ログに「1体は眠らない」
 *      (2b) ゴブリン + スケルトンを一緒に → ゴブリンは眠り、スケルトンは眠らない・吹き出しは SLEEP! で「効かない 1」
 *      (2c) ⭐ スケルトンへの applySurpriseStun と、コーンオブコールドの凍結は今までどおり stunned を付ける (依頼書 §2-4 の罠)
 *   §3 (3a) 体質なし (ゴブリン / オーク / ハイドラ / ガーゴイル) への 14 通りの減りが ?enemytraits=0 の腕と 1 の差も無い + IMMUNE/RESIST が出ない
 *      (3b) ハイドラ (首 3・頭の HP 10 を自前で入れる) を炎 (ファイアボルト) で倒した首は生えない (3→2)・冷気 (コーンオブコールド) なら生える (3→4)。両腕で同じ
 *   §4 (4a) ?enemytraits=0 の腕では (1a)(1b)(1c)(1d)(2a)(2b) の**同じ述語**がすべて偽になる (「OFF で緑」ではない)
 *   ⛔ 測らないこと (依頼書 §8): 吹き出しとログの文言 (IMMUNE / RESIST / SLEEP! のラベルと「効かない N」「N体は眠らない」の数以外)・魔法使いの AI
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。変異は **配信スナップショットの index.html をメモリ上で差し替える** (⛔ 本番ファイルは 1 バイトも触らない)。
 *   - 盤面 = verify_aoe_coverage の openIndex / installProbe / board の写し (項目2 の使い捨て検証 probe_traits.js 経由)。
 *     敵は createEnemy → enemies.push → createEnemyDom の 3 点セット・maxHp 400 で死なせない (3b のハイドラだけ例外)。
 *   - 反射 (P11) は gameOver が true だと抜けるので、その呼び出しの間だけ gameOver = false にする。
 *   - ⛔ このドライバを timeout コマンドで包まない。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *
 * ■ ポート = **10459** (素) / 変異 **10460〜10466** (7 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-09-28 この機械の実測・項目4 の走行と並走中) = 素 3.7〜3.8 秒 (15 assert・3 回とも同じ) / --negative 26.7 秒 (素の基準 + 変異 7 本)。
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
const PORT = parseInt(arg('port', '10459'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);

const SCENARIO = 'goblin-mine';
const RND = 0.95;          // d20 = 20
const RND_FREEZE = 0.02;   // d20 = 1 (セーヴ失敗 ⇒ 凍結)

/* ══════════════════════════════════════════════════════════════════════════════
 * ② ドライバが独立に持つ SRD の表 (依頼書 §2-2 を書き写した。⛔ ページの ENEMY_TRAITS から作らない)
 *   el = 炎/冷気/雷の倍率 (書いていない属性は 1)・sleep = 眠らない
 * ══════════════════════════════════════════════════════════════════════════════ */
const SRD = {
  skeleton:       { sleep: true },                                               // Skeleton (アンデッド)
  skeletonArcher: { sleep: true },                                               // Skeleton (アンデッド)
  zombie:         { sleep: true },                                               // Zombie (アンデッド)
  wraith:         { sleep: true, el: { fire: 0.5, cold: 0.5, lightning: 0.5 } }, // Wraith
  lich:           { sleep: true, el: { cold: 0.5, lightning: 0.5 } },            // Lich
  caelum:         { sleep: true, el: { fire: 0.5, cold: 0, lightning: 0.5 } },   // Ghost
  ghostFlame:     { sleep: true, el: { fire: 0.5, cold: 0.5, lightning: 0 } },   // Will-o'-Wisp
  pharaxus:       { el: { fire: 0 } },                                           // Adult Red Dragon
  stoneGolem:     { sleep: true, construct: true },                              // Stone Golem (魅了に免疫)
  animatedArmor:  { sleep: true, construct: true },                              // Animated Armor
  stoneLegionary: { sleep: true, construct: true },                              // 独自 (ゴーレムと揃える §2-7)
};
const ELEMENTS = ['fire', 'cold', 'lightning'];
function srdMult(type, el) { const s = SRD[type]; return (s && s.el && Object.prototype.hasOwnProperty.call(s.el, el)) ? s.el[el] : 1; }
function srdSleep(type) { return !!(SRD[type] && SRD[type].sleep); }
/* ページの表に載るべきキー = 属性の体質を持つもの + 構造体 (アンデッドは isUndeadEnemy が拾うので表に書かない = 依頼書 §4) */
const SRD_TABLE_KEYS = Object.keys(SRD).filter((k) => SRD[k].el || SRD[k].construct).sort();
function expectDmg(mult, base) { return mult === 1 ? base : (mult === 0 ? 0 : Math.max(1, Math.floor(base / 2))); }

/* 14 通りの経路 × 属性 */
const VARIANTS = [
  { id: 'P1f',  path: 'P1',  el: 'fire' },      { id: 'P1l', path: 'P1', el: 'lightning' },
  { id: 'P2f',  path: 'P2',  el: 'fire' },      { id: 'P2c', path: 'P2', el: 'cold' },       { id: 'P2l', path: 'P2', el: 'lightning' },
  { id: 'P3',   path: 'P3',  el: 'fire',      fn: 'allyFireBolt' },
  { id: 'P4',   path: 'P4',  el: 'fire',      fn: 'allyFireball' },
  { id: 'P5',   path: 'P5',  el: 'lightning', fn: 'allyLightningBolt' },
  { id: 'P6',   path: 'P6',  el: 'cold',      fn: 'allyConeOfCold' },
  { id: 'P7',   path: 'P7',  el: 'cold',      fn: 'allyIceStorm' },
  { id: 'P8',   path: 'P8',  el: 'fire',      fn: 'allyBurningHands' },
  { id: 'P9',   path: 'P9',  el: 'lightning', fn: 'allyLightningArrow' },
  { id: 'P10',  path: 'P10', el: 'lightning', fn: 'allyLightningArrow' },
  { id: 'P11',  path: 'P11', el: 'fire' },
];
const PHARAXUS_FIRE = ['P1f', 'P2f', 'P3', 'P4', 'P8', 'P11'];
const SUBJECTS_1C = ['caelum', 'ghostFlame', 'lich'];
const PLAIN = ['goblin', 'orc', 'hydra', 'gargoyle'];
const SLEEP_IMMUNE = Object.keys(SRD).filter((k) => SRD[k].sleep);

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結) と変異
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html';
const PRISTINE = fs.readFileSync(path.join(ROOT, F_INDEX), 'utf8');
const NL = PRISTINE.indexOf('\r\n') >= 0 ? '\r\n' : '\n';   // index.html はディスク上 CRLF (依頼書 §12-0)
/* 逐語は #75 項目2 の実装後 (HEAD 7cf1333) で取った (DEV_QUEUE 申し送り)。複数行は NL で繋ぐ。 */
const MUTATIONS = {
  /* §2-3 罠 1: 免疫が最低 1 に化ける */
  immunefloor: [
    { from: '        updateInfo(`${nm}: ${jp}は通用しない!`);' + NL + '        return { immune: true, resisted: false, dmg: 0 };',
      to:   '        updateInfo(`${nm}: ${jp}は通用しない!`);' + NL + '        return { immune: true, resisted: false, dmg: Math.max(1, 0) };   /* ★変異immunefloor: 判定を底上げの前に置いた姿 = 効かないが 1 に化ける */' }],
  /* §2-4 の罠: 眠りの免疫を allySleep でなく stunned の書き込み全般 (眠り・凍結・不意打ち) に掛ける */
  stunguard: [
    { from: '        if (enemySleepImmune(t)) { immune++; immuneNames.push(t.def.name); continue; }',
      to:   '        /* ★変異stunguard: 免疫を stunned の書き込み側へ移した */' },
    { from: '          t.stunned = Math.max(t.stunned || 0, skill.stunTarget);',
      to:   '          if (!enemySleepImmune(t)) t.stunned = Math.max(t.stunned || 0, skill.stunTarget);   /* ★変異stunguard */' },
    { from: '          t.stunned = Math.max(t.stunned || 0, skill.freezeTarget || 1);',
      to:   '          if (!enemySleepImmune(t)) t.stunned = Math.max(t.stunned || 0, skill.freezeTarget || 1);   /* ★変異stunguard */' },
    { from: 'if (enemies[i] && enemies[i].alive) { enemies[i].stunned = Math.max(enemies[i].stunned || 0, 1); n++; }',
      to:   'if (enemies[i] && enemies[i].alive && !enemySleepImmune(enemies[i])) { enemies[i].stunned = Math.max(enemies[i].stunned || 0, 1); n++; }   /* ★変異stunguard */' }],
  /* 11 か所のうちライトニングアローの飛び散り (#10) だけ挿入を外す */
  onesite: [
    { from: '          dmg = resolveElementDefense(idx, "lightning", dmg).dmg;   // ★[#75] 体質 (敵ごと・回避の後・底上げの後) (飛び散り)',
      to:   '          /* ★変異onesite: 飛び散りの体質の判定を外した */' }],
  /* 範囲呪文 (ファイアボール) で 1 体が免疫なら全員 0 */
  aoeabort: [
    { from: '        t.__tookFireAcid = true;   // ハイドラ: ファイアボールの炎で首切除可 (per-target)' + NL + '        dmg = resolveElementDefense(idx, "fire", dmg).dmg;',
      to:   '        t.__tookFireAcid = true;   // ハイドラ: ファイアボールの炎で首切除可 (per-target)' + NL
            + '        dmg = affectedIdxs.some((j) => enemies[j] && enemies[j].alive && enemyElementMult(enemies[j], "fire") === 0) ? 0 : resolveElementDefense(idx, "fire", dmg).dmg; /* ★変異aoeabort */' }],
  /* 表示にだけ判定前の値を渡す (ファイアボルト) */
  preshow: [
    { from: '      dmg = resolveElementDefense(enemyIdx, "fire", dmg).dmg;   // ★[#75] 体質 (底上げの後)',
      to:   '      const __preDmg75 = dmg; dmg = resolveElementDefense(enemyIdx, "fire", dmg).dmg;   /* ★変異preshow */' },
    { from: '      showDmgAt(ex, target.y, dmg, isCrit);' + NL + '      triggerScreenShake(SHAKE_SPELL.mag, SHAKE_SPELL.dur);',
      to:   '      showDmgAt(ex, target.y, __preDmg75, isCrit);   /* ★変異preshow */' + NL + '      triggerScreenShake(SHAKE_SPELL.mag, SHAKE_SPELL.dur);' }],
  /* 表のキーの打ち間違い */
  tabletypo: [
    { from: '      pharaxus:       { immune: ["fire"] },',
      to:   '      pharaxsus:      { immune: ["fire"] },   /* ★変異tabletypo */' }],
  /* 撤退スイッチが死ぬ */
  switchdead: [
    { from: 'new URLSearchParams(window.location.search).get("enemytraits") !== "0";',
      to:   'new URLSearchParams(window.location.search).get("enemytraits") !== "0" || true;   /* ★変異switchdead */' }],
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (2026-09-28・HEAD 7cf1333 の上。依頼書 §12-3 の担当表)。
 * ⭐ --negative は「赤の集合 = 担当」の完全一致を要求する (担当の外が 1 つでも赤くなれば「担当が絞れていない」で exit 1)。 */
const NEG_EXPECT = {
  immunefloor: ['(1a)', '(1c)', '(1d)', '(1e)'],
  stunguard:   ['(2a)', '(2b)', '(2c)'],
  onesite:     ['(1b)', '(1c)'],
  aoeabort:    ['(1a)', '(1d)'],   // (1a) = ファラクサス単独のファイアボールで IMMUNE の吹き出しが出なくなる
  preshow:     ['(1e)'],
  tabletypo:   ['(0b)', '(0c)', '(1a)', '(1d)', '(1e)'],
  switchdead:  ['(0b)', '(4a)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 7) { console.error('[vet] 変異は 7 本まで (ポート 10460〜10466)'); process.exit(3); }
if (MUT_ORDER.some((k) => !NEG_EXPECT[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) { console.error('[vet] NEG_EXPECT と MUTATIONS が揃っていない'); process.exit(3); }
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
    if (c !== 1) { console.error('[vet] ⛔ 変異 ' + key + ' の注入点がちょうど 1 箇所ではない (' + c + ' 件): ' + e.from.replace(/\r?\n/g, '⏎').slice(0, 160)); process.exit(3); }
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

/* 項目2 の probe_traits.js (← verify_aoe_coverage) の 3 点セット。魔法使いが要る。 */
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
];
async function openIndex(ctx, qs) {
  const page = await ctx.browser.newPage();
  const tag = 'index' + (qs || '');
  page.on('pageerror', (e) => ctx.errs.push(tag + ' :: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;   // ⚠ 除外はこの 1 本の URL だけ
    ctx.errs.push(tag + ' :: CONSOLE ' + m.text());
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', seed.scen);
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.xp', String(seed.xp));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  }, { scen: SCENARIO, party: SEED_PARTY, xp: 45000 });
  await page.goto('http://127.0.0.1:' + ctx.port + '/index.html' + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  /* ⚠ 裸の識別子で待つ (classic script 直下の const/let は window に載らない)。 */
  await page.waitForFunction(
    "typeof allies !== 'undefined' && allies.length > 0 && typeof enemies !== 'undefined'"
    + " && typeof createEnemy === 'function' && !!mapData && !!window.__plaza", { timeout: 90000 });
  await page.evaluate(installProbe);
  return page;
}

/* ページ側の計測器 (page.evaluate で注入) */
function installProbe() {
  gameOver = true;
  try { encounterActive = false; } catch (e) {}
  window.sleepMs = () => new Promise((r) => setTimeout(r, 0));   // ⛔ Promise.resolve() はマイクロタスク飢餓
  try { window.moveEnemies = function () {}; } catch (e) {}
  window.dfPlayCast = function () { return Promise.resolve(); };
  window.spawnFireballProjectile = function () { return Promise.resolve(); };
  window.spawnArrow = function () { return Promise.resolve(); };
  window.castMagicMissileBarrage = function () { return Promise.resolve(); };
  window.__pops = [];
  new MutationObserver(function (muts) {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList && n.classList.contains('rollPop')) window.__pops.push(n.textContent);
    }
  }).observe(document.body, { childList: true });
  window.__dmgShown = [];
  const _sd = window.showDmgAt;
  window.showDmgAt = function (x, y, d, c) { window.__dmgShown.push({ x: x, d: d }); return _sd.apply(null, arguments); };
  window.__infos = [];
  const _ui = window.updateInfo;
  window.updateInfo = function (m) { window.__infos.push(String(m)); return _ui.apply(null, arguments); };
  const TILE = TILE_SIZE;
  let lane = { len: 0, ty: -1, tx0: -1 };
  for (let ty = 1; ty < MAP_H - 1; ty++) {
    let run = 0, start = 0;
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (!isTileWall(tx, ty)) { if (run === 0) start = tx; run++; if (run > lane.len) lane = { len: run, ty: ty, tx0: start }; }
      else run = 0;
    }
  }
  const setUnit = (u, tx, ty) => { const s = (u.def && u.def.displaySize) || 96; u.x = tx * TILE + TILE / 2 - s / 2; u.y = ty * TILE + TILE / 2 - s / 2; };
  const mageOf = () => allies.find((a) => a.classKey === 'mage');
  const cx = (e) => e.x + ((e.def && e.def.displaySize) || 64) / 2;
  window.__et = {
    lane: lane,
    board: function (types) {
      for (const e of enemies) { e.alive = false; e.hp = 0; }
      for (const a of allies) { a.alive = true; a.hp = a.maxHp; a.x = -999999; a.y = -999999; }
      gameOver = true;
      setUnit(mageOf(), lane.tx0 + 0, lane.ty);
      snapPlayerToTile(lane.tx0 + 1, lane.ty + 0);
      const made = [];
      types.forEach((t, k) => {
        const idx = enemies.length;
        const e = createEnemy(t, lane.tx0 + 3 + k, lane.ty);
        enemies.push(e); createEnemyDom(idx, e.def, e.type);
        e.alive = true; e.maxHp = Math.max(e.maxHp || 0, 400); e.hp = e.maxHp; e.stunned = 0;
        made.push(idx);
      });
      encounterEnemyIndices = made.slice();
      return made;
    },
    /* spec = { types, target (made の添字), subject (made の添字), path, el, fn, rnd, hydra } */
    run: async function (spec) {
      const made = window.__et.board(spec.types);
      if (spec.hydra) {   // (3b) createEnemy は hydraHeads / headHpMax を初期化しない (initHydra 相当を自前で)
        const h = enemies[made[spec.subject]];
        h.hydraHeads = spec.hydra.heads; h.headHpMax = spec.hydra.headHp; h.maxHp = spec.hydra.headHp; h.hp = spec.hydra.hp;
        h.__tookFireAcid = false; h.__regrowNarrated = true;
      }
      window.__pops.length = 0; window.__dmgShown.length = 0; window.__infos.length = 0;
      const m = mageOf();
      m.mp = 999; m.maxMp = Math.max(m.maxMp || 0, 999);
      if (m.spellSlots) for (const k of Object.keys(m.spellSlots)) m.spellSlots[k] = 9;
      const tIdx = made[spec.target || 0], sIdx = made[spec.subject || 0];
      const before = enemies.map((e) => e.hp);
      const stBefore = enemies.map((e) => e.stunned || 0);
      const R = Math.random;
      Math.random = () => spec.rnd;
      let err = null, ret;
      try {
        if (spec.path === 'P1') {
          ret = await applyWeaponSpecialEffects({ shockwaveDice: '2d6', shockwaveType: spec.el, shockwaveSaveDC: 13 },
            enemies[tIdx], tIdx, cx(enemies[tIdx]), false, 'テスト', null, true);
        } else if (spec.path === 'P2') {
          ret = await applyWeaponSpecialEffects({ bonusDmgDice: '2d6', bonusDmgType: spec.el },
            enemies[tIdx], tIdx, cx(enemies[tIdx]), false, 'テスト', null, true);
        } else if (spec.path === 'P11') {
          window.__plaza.addChargeItem('ring_spell_turning');
          gameOver = false;
          try { ret = await window.__plaza.tryReflect(tIdx, { name: 'ファイアボルト', rollDamage: () => 24, fireAcid: true }); }
          finally { gameOver = true; }
        } else if (spec.path === 'SURPRISE') {
          ret = applySurpriseStun([tIdx]);
        } else {
          ret = await window[spec.fn](m, tIdx);
        }
      } catch (e) { err = String((e && e.stack) || e).slice(0, 300); }
      Math.random = R;
      const s = enemies[sIdx];
      const sx = cx(s);
      const shownS = window.__dmgShown.filter((o) => Math.abs(o.x - sx) < 1).map((o) => o.d);
      return { err: err, ret: ret === undefined ? null : ret, made: made,
        delta: made.map((i) => before[i] - enemies[i].hp), stun: made.map((i) => (enemies[i].stunned || 0) - stBefore[i]),
        sDelta: before[sIdx] - s.hp, sStun: (s.stunned || 0) - stBefore[sIdx], sAlive: !!s.alive, heads: s.hydraHeads,
        pops: window.__pops.slice(), shown: window.__dmgShown.map((o) => o.d), shownS: shownS, infos: window.__infos.slice() };
    },
    traits: function () {
      const w = window.__dfEnemyTraits;
      if (!w) return null;
      const keys = Object.keys(w.table || {});
      const types = Object.keys(ENEMY_TYPES);
      const mult = {}, sleep = {};
      for (const k of types) {
        const e = { type: k, def: ENEMY_TYPES[k] };
        mult[k] = {};
        for (const el of ['fire', 'cold', 'lightning']) { try { mult[k][el] = w.mult(e, el); } catch (x) { mult[k][el] = 'ERR'; } }
        try { sleep[k] = w.sleepImmune(e); } catch (x) { sleep[k] = 'ERR'; }
      }
      return { on: w.on, keys: keys, missing: keys.filter((k) => !ENEMY_TYPES[k]), types: types, mult: mult, sleep: sleep,
        fns: [typeof w.mult, typeof w.sleepImmune, typeof w.resolve].join(',') };
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 走行と判定
 * ══════════════════════════════════════════════════════════════════════════════ */
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    R.push({ id, name, ok: !!ok, detail: String(detail === undefined ? '' : detail) });
    console.log((ok ? '  ✓ ' : '  ✗ ') + id + ' ' + name + (detail !== undefined ? '  -- ' + String(detail).slice(0, 600) : ''));
  };
  return R;
}
async function runOn(page, spec) { return page.evaluate((s) => window.__et.run(s), spec); }
function vspec(v, types, target, subject, rnd) {
  return { types, target, subject, path: v.path, el: v.el, fn: v.fn || null, rnd: rnd === undefined ? RND : rnd };
}
/* 被験 type を経路 v で撃つ盤面。P1 (余波) と P10 (飛び散り) はゴブリンを対象/本命にして隣の被験に当てる。 */
function subjectSpec(v, type) {
  if (v.path === 'P1' || v.path === 'P10') return vspec(v, ['goblin', type], 0, 1);
  return vspec(v, [type], 0, 0);
}

async function collect(ctx) {
  const D = { arms: {} };
  for (const arm of ['on', 'off']) {
    const page = arm === 'on' ? ctx.pageOn : ctx.pageOff;
    const A = { traits: await page.evaluate(() => window.__et.traits()), sub: {} };
    const subjects = ['goblin', 'wraith', 'pharaxus'].concat(SUBJECTS_1C, PLAIN.filter((t) => t !== 'goblin'));
    for (const type of subjects) {
      A.sub[type] = {};
      for (const v of VARIANTS) A.sub[type][v.id] = await runOn(page, subjectSpec(v, type));
    }
    /* (1d) ファイアボールでゴブリン + ファラクサス */
    A.mixFb = await runOn(page, { types: ['goblin', 'pharaxus'], target: 0, subject: 1, path: 'P4', el: 'fire', fn: 'allyFireball', rnd: RND });
    /* §2 眠り */
    A.sleep = {};
    for (const type of ['goblin'].concat(SLEEP_IMMUNE)) A.sleep[type] = await runOn(page, { types: [type], target: 0, subject: 0, path: 'SLEEP', fn: 'allySleep', rnd: RND });
    A.sleepMix = await runOn(page, { types: ['goblin', 'skeleton'], target: 0, subject: 1, path: 'SLEEP', fn: 'allySleep', rnd: RND });
    /* (2c) 不意打ち・凍結 (ゴブリンは装置の対照) */
    A.surprise = {}; A.freeze = {};
    for (const type of ['goblin', 'skeleton']) {
      A.surprise[type] = await runOn(page, { types: [type], target: 0, subject: 0, path: 'SURPRISE', rnd: RND });
      A.freeze[type] = await runOn(page, { types: [type], target: 0, subject: 0, path: 'P6', el: 'cold', fn: 'allyConeOfCold', rnd: RND_FREEZE });
    }
    /* (3b) ハイドラ: 首 3・頭の HP 10・今の HP 5 ⇒ どちらの呪文でも頭が落ちる */
    A.hydraFire = await runOn(page, { types: ['hydra'], target: 0, subject: 0, path: 'P3', el: 'fire', fn: 'allyFireBolt', rnd: RND, hydra: { heads: 3, headHp: 10, hp: 5 } });
    A.hydraCold = await runOn(page, { types: ['hydra'], target: 0, subject: 0, path: 'P6', el: 'cold', fn: 'allyConeOfCold', rnd: RND, hydra: { heads: 3, headHp: 10, hp: 5 } });
    D.arms[arm] = A;
    console.log('[vet] 腕 ' + arm + ' を撃ち終えた (' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒)');
  }
  return D;
}

const hasPop = (r, re) => r.pops.some((t) => re.test(t));
const lastShownOk = (r) => r.shownS.length > 0 && r.shownS[r.shownS.length - 1] === r.sDelta;
/* ── 述語 (ON と OFF の両方へ同じ本体を当てる = (4a)) ── */
function pred1a(A) {
  const rows = PHARAXUS_FIRE.map((vid) => { const r = A.sub.pharaxus[vid]; return { vid, ok: !r.err && r.sDelta === 0 && hasPop(r, /IMMUNE/), d: r.sDelta, err: r.err }; });
  return { ok: rows.every((x) => x.ok), rows };
}
function predMult(A, type, requirePop) {
  const rows = VARIANTS.map((v) => {
    const r = A.sub[type][v.id], g = A.sub.goblin[v.id];
    const base = g.sDelta, mult = srdMult(type, v.el), want = expectDmg(mult, base);
    const pop = mult === 1 ? !hasPop(r, /IMMUNE|RESIST/) : hasPop(r, mult === 0 ? /IMMUNE/ : /RESIST/);
    return { vid: v.id, ok: !r.err && !g.err && base > 0 && r.sDelta === want && (!requirePop || pop), d: r.sDelta, want, base, pop, err: r.err || g.err };
  });
  return { ok: rows.every((x) => x.ok), rows };
}
function pred1b(A) { return predMult(A, 'wraith', true); }
function pred1c(A) {
  const parts = SUBJECTS_1C.map((t) => ({ t, p: predMult(A, t, true) }));
  return { ok: parts.every((x) => x.p.ok), parts };
}
function pred1d(A) {
  const r = A.mixFb, gBase = A.sub.goblin.P4.sDelta;
  return { ok: !r.err && r.delta[0] > 0 && r.delta[0] === gBase && r.delta[1] === 0, gob: r.delta[0], gBase, ph: r.delta[1], err: r.err };
}
function pred2a(A) {
  const rows = SLEEP_IMMUNE.map((t) => {
    const r = A.sleep[t];
    const popOk = r.pops.some((s) => /IMMUNE/.test(s) && /効かない\s*1(?!\d)/.test(s));
    const logOk = r.infos.some((s) => /(^|[^\d])1体は眠らない/.test(s));
    return { t, ok: !r.err && r.sStun === 0 && popOk && logOk, stun: r.sStun, popOk, logOk, err: r.err };
  });
  return { ok: rows.every((x) => x.ok), rows };
}
function pred2b(A) {
  const r = A.sleepMix;
  const popOk = r.pops.some((s) => /SLEEP!/.test(s) && /効かない\s*1(?!\d)/.test(s));
  return { ok: !r.err && r.stun[0] > 0 && r.stun[1] === 0 && popOk, stun: r.stun, popOk, err: r.err };
}

function judge(ctx, D, R) {
  const ON = D.arms.on, OFF = D.arms.off;
  /* ── (0a) 装置 ── */
  {
    const bad = [];
    for (const v of VARIANTS) { const r = ON.sub.goblin[v.id]; if (r.err || !(r.sDelta > 0)) bad.push(v.id + '=' + r.sDelta + (r.err ? '!' + r.err : '')); }
    if (ON.sub.goblin.P11.ret !== true) bad.push('P11.ret=' + ON.sub.goblin.P11.ret);
    if (!(ON.sleep.goblin.sStun > 0)) bad.push('SLEEP.goblin stun=' + ON.sleep.goblin.sStun);
    if (!(ON.freeze.goblin.sStun > 0)) bad.push('FREEZE.goblin stun=' + ON.freeze.goblin.sStun);
    if (!(ON.surprise.goblin.sStun > 0)) bad.push('SURPRISE.goblin stun=' + ON.surprise.goblin.sStun);
    R.check('(0a)', '[装置] 14 通りの経路 (P1〜P11) + スリープ + 凍結 + 不意打ちがゴブリンに実際に効いた・反射が発動した',
      bad.length === 0, bad.length ? '⛔ ' + bad.join(' / ') : 'ゴブリンの減り ' + VARIANTS.map((v) => v.id + '=' + ON.sub.goblin[v.id].sDelta).join(' '));
  }
  /* ── (0b) 窓と表 ── */
  {
    const t = ON.traits, to = OFF.traits;
    const ok = !!t && t.on === true && t.keys.length === 8 && t.missing.length === 0 && t.fns === 'function,function,function' && !!to && to.on === false;
    R.check('(0b)', '__dfEnemyTraits が在り on === true・表のキー 8 個・全キーが ENEMY_TYPES に実在 (?enemytraits=0 の腕で on === false)', ok,
      t ? 'on=' + t.on + ' keys(' + t.keys.length + ')=' + t.keys.join(',') + ' 実在しない=' + J(t.missing) + ' fns=' + t.fns + ' / OFF on=' + (to && to.on) : '⛔ 窓が無い');
  }
  /* ── (0c) SRD の表 (ドライバ) とページの表の中身 ── */
  {
    const t = ON.traits; const diffs = [];
    if (!t) diffs.push('窓が無い');
    else {
      const pk = t.keys.slice().sort();
      if (J(pk) !== J(SRD_TABLE_KEYS)) diffs.push('表のキー ' + J(pk) + ' ≠ SRD ' + J(SRD_TABLE_KEYS));
      for (const k of Object.keys(SRD)) if (t.types.indexOf(k) < 0) diffs.push('SRD の ' + k + ' が ENEMY_TYPES に無い');
      for (const k of t.types) {
        for (const el of ELEMENTS) if (t.mult[k][el] !== srdMult(k, el)) diffs.push(k + '.' + el + ' page=' + t.mult[k][el] + ' srd=' + srdMult(k, el));
        if (t.sleep[k] !== srdSleep(k)) diffs.push(k + '.sleep page=' + t.sleep[k] + ' srd=' + srdSleep(k));
      }
    }
    R.check('(0c)', 'SRD の表 (ドライバ独立) とページの表が一致 (表のキー集合 + 全種 × 炎/冷気/雷の倍率 + 眠りの免疫)', diffs.length === 0,
      diffs.length ? '⛔ ' + diffs.slice(0, 12).join(' / ') + (diffs.length > 12 ? ' …他 ' + (diffs.length - 12) : '') : '一致 (' + (t ? t.types.length : 0) + ' 種・表のキー ' + SRD_TABLE_KEYS.length + ')');
  }
  /* ── (0d) 起動 ── */
  R.check('(0d)', '[装置] 2 腕とも起動した + pageerror 0 件 (favicon は除外)', ctx.booted === 2 && ctx.errs.length === 0,
    '起動 ' + ctx.booted + '/2 / pageerror ' + (ctx.errs.slice(0, 3).join(' | ') || '(なし)'));

  const fmtRows = (rows) => rows.map((x) => (x.ok ? '' : '⛔') + (x.vid || x.t) + '=' + J(x.d !== undefined ? x.d : x.stun) + (x.want !== undefined ? '/' + x.want : '') + (x.err ? '!' + x.err : '')).join(' ');
  /* ── §1 ── */
  const p1a = pred1a(ON);
  R.check('(1a)', 'ファラクサスに炎の 6 経路 (余波・追加属性・ファイアボルト・ファイアボール・バーニングハンズ・反射) → 減り 0 + IMMUNE', p1a.ok, fmtRows(p1a.rows));
  const p1b = pred1b(ON);
  R.check('(1b)', 'レイスに 14 通り → 減り = max(1, floor(素/2)) (素 = 同じ乱数のゴブリン) + RESIST', p1b.ok, fmtRows(p1b.rows));
  const p1c = pred1c(ON);
  R.check('(1c)', 'カエルム (冷気 0 / 炎雷 半分)・ウィスプ (雷 0 / 炎冷気 半分)・リッチ (炎 等倍 / 冷気雷 半分) に 14 通り', p1c.ok,
    p1c.parts.map((x) => x.t + '[' + fmtRows(x.p.rows) + ']').join(' '));
  const p1d = pred1d(ON);
  R.check('(1d)', 'ファイアボールでゴブリン + ファラクサス → ゴブリンだけ素と同じだけ減り、ファラクサスは 0 (敵ごとの判定)', p1d.ok, J(p1d));
  {
    const bad = [];
    for (const [type, vids] of [['pharaxus', PHARAXUS_FIRE], ['wraith', VARIANTS.map((v) => v.id)]].concat(SUBJECTS_1C.map((t) => [t, VARIANTS.map((v) => v.id)]))) {
      for (const vid of vids) {
        const r = ON.sub[type][vid];
        if (!lastShownOk(r)) bad.push(type + '.' + vid + ' 表示=' + J(r.shownS) + ' 減り=' + r.sDelta);
        if (type === 'pharaxus' && r.shownS.some((d) => typeof d === 'number' && d > 0)) bad.push(type + '.' + vid + ' 正の表示 ' + J(r.shownS));
      }
    }
    R.check('(1e)', '表示の数字が判定後の値 ((1a)〜(1c) の全走行で被験への最後の表示 = HP の減り・ファラクサスへの炎で正の数を出さない)', bad.length === 0,
      bad.length ? '⛔ ' + bad.slice(0, 8).join(' / ') : 'ファラクサス炎の表示 ' + PHARAXUS_FIRE.map((v) => J(ON.sub.pharaxus[v].shownS)).join(' '));
  }
  /* ── §2 ── */
  const p2a = pred2a(ON);
  R.check('(2a)', '眠らない ' + SLEEP_IMMUNE.length + ' 種にスリープ → stunned 増えない + 吹き出し IMMUNE「効かない 1」+ ログ「1体は眠らない」', p2a.ok,
    p2a.rows.map((x) => (x.ok ? '' : '⛔') + x.t + ':stun' + x.stun + (x.popOk ? '' : ' 吹き出し✗') + (x.logOk ? '' : ' ログ✗') + (x.err ? '!' + x.err : '')).join(' '));
  const p2b = pred2b(ON);
  R.check('(2b)', 'ゴブリン + スケルトンにスリープ → ゴブリンは眠りスケルトンは眠らない + SLEEP!「効かない 1」', p2b.ok, J(p2b) + ' pops=' + J(ON.sleepMix.pops));
  {
    const s = ON.surprise.skeleton, f = ON.freeze.skeleton;
    R.check('(2c)', 'スケルトンへの不意打ち (applySurpriseStun) とコーンオブコールドの凍結は今までどおり stunned を付ける',
      !s.err && !f.err && s.sStun > 0 && f.sStun > 0 && ON.surprise.goblin.sStun > 0 && ON.freeze.goblin.sStun > 0,
      '不意打ち skeleton=' + s.sStun + ' (goblin ' + ON.surprise.goblin.sStun + ') / 凍結 skeleton=' + f.sStun + ' (goblin ' + ON.freeze.goblin.sStun + ')' + (s.err || f.err ? ' !' + (s.err || f.err) : ''));
  }
  /* ── §3 ── */
  {
    const bad = []; let n = 0;
    for (const type of PLAIN) for (const v of VARIANTS) {
      const a = ON.sub[type][v.id], b = OFF.sub[type][v.id]; n++;
      if (a.err || b.err || !(a.sDelta > 0) || a.sDelta !== b.sDelta || J(a.delta) !== J(b.delta) || hasPop(a, /IMMUNE|RESIST/)) {
        bad.push(type + '.' + v.id + ' on=' + J(a.delta) + ' off=' + J(b.delta) + (a.err || b.err ? '!' + (a.err || b.err) : ''));
      }
    }
    R.check('(3a)', '体質なし (ゴブリン/オーク/ハイドラ/ガーゴイル) × 14 通りの減りが ?enemytraits=0 と 1 の差も無い + IMMUNE/RESIST なし', bad.length === 0,
      bad.length ? '⛔ ' + bad.slice(0, 8).join(' / ') : n + ' 組一致 (例 orc ' + VARIANTS.map((v) => ON.sub.orc[v.id].sDelta).join(',') + ')');
  }
  {
    const f1 = ON.hydraFire, c1 = ON.hydraCold, f0 = OFF.hydraFire, c0 = OFF.hydraCold;
    const ok = [f1, c1, f0, c0].every((r) => !r.err && r.sAlive) && f1.heads === 2 && c1.heads === 4 && f0.heads === 2 && c0.heads === 4;
    R.check('(3b)', 'ハイドラ (首 3) を炎で倒した首は生えない (→2)・冷気なら生える (→4)。両腕で同じ', ok,
      '炎 on=' + f1.heads + ' off=' + f0.heads + ' / 冷気 on=' + c1.heads + ' off=' + c0.heads + ([f1, c1, f0, c0].some((r) => r.err) ? ' !' + [f1, c1, f0, c0].map((r) => r.err).filter(Boolean)[0] : ''));
  }
  /* ── §4 (4a) 同じ述語を OFF へ ── */
  {
    const preds = { '(1a)': pred1a, '(1b)': pred1b, '(1c)': pred1c, '(1d)': pred1d, '(2a)': pred2a, '(2b)': pred2b };
    const rows = Object.keys(preds).map((k) => ({ k, on: preds[k](ON).ok, off: preds[k](OFF).ok }));
    const ok = rows.every((x) => x.off === false) && OFF.traits && OFF.traits.on === false;
    R.check('(4a)', '?enemytraits=0 では (1a)(1b)(1c)(1d)(2a)(2b) の同じ述語がすべて偽 (+ 窓の on === false)', ok,
      rows.map((x) => x.k + ' ON=' + x.on + '/OFF=' + x.off).join(' ') + ' / OFF の窓 on=' + (OFF.traits && OFF.traits.on)
      + ' / 例: ファラクサス×ファイアボルト OFF 減り=' + OFF.sub.pharaxus.P3.sDelta + '・スケルトン×スリープ OFF stun=' + OFF.sleep.skeleton.sStun);
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

const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)', '(3a)', '(3b)', '(4a)'];
async function runSuite(browser, port, label) {
  const ctx = { browser, port, errs: [], booted: 0, pageOn: null, pageOff: null };
  const R = mkResults();
  try {
    ctx.pageOn = await openIndex(ctx, ''); ctx.booted++;
    ctx.pageOff = await openIndex(ctx, '?enemytraits=0'); ctx.booted++;
    const D = await collect(ctx);
    judge(ctx, D, R);
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    for (const p of [ctx.pageOn, ctx.pageOff]) if (p) await p.close().catch(() => {});
  }
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_enemytraits_');
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
          const r0d = R.filter((r) => r.id === '(0d)')[0];
          const bootOk = !!r0d && r0d.ok;   // ⭐ 構文破壊で全部赤くなる偽の検出を見分ける
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
