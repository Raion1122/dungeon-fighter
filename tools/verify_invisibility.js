#!/usr/bin/env node
/*
 * verify_invisibility.js — 実装依頼書 #78「透明化 (インビジビリティ)」の受入ドライバ
 *                          (依頼書 2026-09-30_invisibility.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_invisibility.js                          # 素
 *   node tools/verify_invisibility.js --negative               # 変異 9 本 (port 10494〜10502)。先に素の基準を走らせる
 *   node tools/verify_invisibility.js --negative --only leaderref,nofinally
 *   node tools/verify_invisibility.js --mutate leaderref        # 変異 1 本を載せて手回し (担当表を実走で決める用)
 *   --skip-6c   (6c) の入れ子実行 (verify_scroll_shelf --negative・約 25 秒) を飛ばす。⚠ 飛ばすと (6c) は ✗ (黙って緑にしない)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が期待の件数でない・行数が変わる / ソースの正規表現が 0 件 / 定数が見つからない)
 *
 * ■ 方針 — index.html を開き、page.evaluate で**編成・枠・交戦中の敵を直接組んで** tryStealthSurprise() を呼ぶ
 *   (driver_sce1_events.js の V4b が先例)。SkillCheck.resolveSkillCheck は差し替えて引数を控え、成否を決め打ちする
 *   (呼び出しの後に必ず元へ戻す)。酒場は tavern.html を別に開き、__equipTV と DOM を見る。
 *   - 呪文と巻物の値は**このドライバがソースから正規表現で引いた値**と、ページの答えを突き合わせる (0a)。
 *   - (2b) の成功率は 2 経路: ページの SkillCheck (selectRepresentative / selectHelper / checkScore / HELP_BONUS /
 *     _computeOutcome を出目 1〜20 で回す) と、依頼書 §2-3 の式 (ドライバ側)。DC はソースの perceptionDC から引く。
 *   - 主人公が魔法使い (1f) は、読み込み直さずに leaderClassKey = "mage" + currentSpellSlots を代入して作る
 *     (makeLeaderActor が主人公の値を読むので同じ経路を通る。#78 項目2 で実測)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] ソース 2 ファイルの巻物の表に scroll-invisibility が同じ中身 (uncommon・mage・invisibility) で 1 行ずつ /
 *           MAGE_SKILLS と MAGE_SKILLS_UI の levelReq・mpCost が一致 / ページの答え (両ページ) もソースと一致
 *      (0b) [装置] 差し替えた resolveSkillCheck が (1a) で 1 回以上呼ばれた・tryStealthSurprise / tryCastInvisibility /
 *           setPartyInvisible が関数  ⭐ これが無いと全 assert が空振りで永久緑
 *      (0c) [装置] 全ページが起動し pageerror 0 件 (⭐ 構文破壊で全部赤くなる偽の検出を見分ける)
 *   §1 (1a) 盗賊も外套も居ない 4 人 (戦士 + 魔法使い + 僧侶 + ドワーフ)・魔法使いの仲間に枠 1・非ボス 2 体 + ボス 1 体
 *           ⇒ 判定「stealth」が 1 回・枠 1 → 0・ログに呪文名・成功の決め打ちで非ボスだけ stunned ≥ 1
 *      (1b) 盗賊を入れる ⇒ 唱えない (枠 1 のまま)・判定は 1 回   (1c) 外套 (stealth ボーナス) ⇒ 唱えない
 *      (1d) 枠 0 / 枠を置いていない ⇒ 唱えない・判定も出ない    (1e) 交戦中の敵がボスだけ ⇒ 唱えない・枠 1 のまま
 *      (1f) 主人公が魔法使い・currentSpellSlots.invisibility = 1 ⇒ 唱えて currentSpellSlots が 0 (罠A)
 *      (1g) initAllySpellSlots の関門: Lv2・習得済 ⇒ 0 (levelReq) / Lv3・未習得 ⇒ 0 / Lv3・習得済 ⇒ 1
 *   §2 (2a) (1a) と盗賊入り (1b) の resolveSkillCheck の引数が数値に響く部分で一致 (第 1 引数 stealth・DC・opts のキー集合・
 *           extraBonus / advantage 無し)。違うのは flavor だけ
 *      (2b) 6 つの DC で「戦士・魔・僧・ドワ」「エルフ・魔・僧・ドワ」の成功率 < 「盗賊・戦・僧・魔」(ページ) + ドライバの式と一致
 *   §3 (3a) 判定の最中、主人公と生きている仲間全員が .dfInvis・applyNormalPlayerVisual() の後も opacity < 1 (罠B)
 *      (3b) 返った後はクラスが誰にも残らない: 成功 / 失敗 / null / resolveSkillCheck の中で例外 (既存の catch で null 化) /
 *           applySurpriseStun の例外 (tryStealthSurprise の外へ抜ける) の 5 通り (罠C・#78 K8 の 2 経路)
 *      (3c) 唱えなかった戦闘 ((1b) (1c) (1d) (1e)) では .dfInvis が一度も付かない (MutationObserver で付け外しを拾う)
 *   §4 (4a) 魔法使いの仲間の傾向を全部 invisibility にして apTryPreferred ⇒ false・枠は減らない (罠F)
 *      (4b) executeSkillOn(ally, "mage", "invisibility", -1) ⇒ false・枠は減らない
 *      (4c) 主人公 (魔法使い) の技の候補に invisibility が入らない (playerAttackTurn の pickLeaderAction に渡る choices を捕まえる。
 *           同じ条件の fireball は入る = 対照) + MAGE_SKILLS.invisibility.outOfCombat === true
 *   §5 (5a) 開発モード: 棚に「巻物・インビジビリティ」・「購入 1G」・1G で買える (金貨 0・所持 1)・common は「購入 <SCROLL_SHELF_PRICE>G」
 *      (5b) 開発モードでない: 並ばない・shopBuyScroll = noitem (罠D)
 *      (5c) learnScroll ⇒ knownSpellsTV.mage に invisibility・引き出しの呪文一覧に出る (主人公 Lv1 では [Lv<levelReq> 必要])
 *      (5d) 枠に置くと、傾向の「全般 / 雑魚 / ボス」の候補 (引き出し #pmDrawer と準備画面 #apRows の両方の <option>) に出ない
 *           (対照のスリープは出る)・カードの「技」行 (.pmSkillsVal) には出る
 *   §6 (6a) 盗賊入りの結果 (判定の引数・付与した敵・戻り値・枠) が素と ?invis=0 で同じ
 *      (6b) pickScrollId({uncommon:1}) を Math.random の全区間で回す ⇒ 素 = ソースの uncommon 全部 (透明化あり) /
 *           ?invis=0 = 透明化を除いた集合 (#78 以前の uncommon)
 *      (6c) tools/verify_scroll_shelf.js --negative が 素 N/N・変異 M/M・exit 0 (入れ子で実行。変異の影響を受けない =
 *           ディスクの本番を読む ⇒ 1 回だけ走らせて全スイートで共有する)
 *   §7 (7a) index.html?invis=0 ⇒ (1a) と同じ仕込みで唱えない・判定も出ない   (7b) tavern.html?invis=0 + 開発 ⇒ 並ばない
 *   ⛔ 測らないこと (依頼書 §8): 揺らぎの不透明度・周期 ((3a) は「< 1」だけ) / 詠唱の演出の尺・バナー・ログの文面 / 実戦の成功率
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html と tavern.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列を
 *     メモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *   - 起動時に全変異のアンカーを**原本**で検算する (期待の件数・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持ち、**欠陥が効く枝でだけ**鳴るように置く。--negative / --mutate では
 *     その件数で「注入行が実行された」を確かめる (0 件 = 測っている場所に現れていない = 空振り扱いで exit 1)。
 *   - index.html / tavern.html は CRLF。アンカーはすべて 1 行の中で完結させている。
 *   - ⛔ このドライバを timeout コマンドで包まない。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0` (verify_scroll_shelf と同じ型)。
 *
 * ■ ポート = **10493** (素) / 変異 **10494〜10502** (9 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-09-30 この機械の実測・HEAD abc2394) = 素 26.5 秒 (PowerShell から・うち (6c) 23.7 秒・27 assert・3 回とも同じ) /
 *   --negative 41 秒 (素の基準 + 変異 9 本・9/9・2 回とも同じ)。⚠ Git Bash から起動すると (6c) の入れ子が約 140 秒かかる。
 *   ページの読み込み 5 回 / スイート (1 枚のタブを使い回す)。(6c) を除く本体は約 2 秒。
 * ■ 担当表の依頼書 §8 との差 (実走で決めた。予想は全部含む):
 *   leaderref = 欠陥そのものを差し替え (#78 K1: actor は currentSpellSlots を同一参照で持つので依頼書の案は空振り ⇒
 *     「主人公の枠のコピーを消費する」へ) / inlineopacity +(1f)(3b)(3c) / nooutofcombat +(4c) (⚠ (4a) は戻り値と枠だけでは
 *     赤くならない = executeSkillOn の名指しが二重に守る ⇒ executeSkillOn へ届いた回数も測る = #78 K9) /
 *   rogueToo +(1c)(2a)(3c)(6a) / bossburn +(3c)。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const SKIP_6C = flag('skip-6c');
const PORT = parseInt(arg('port', '10493'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html';
const F_TAVERN = 'tavern.html';
const PRISTINE = {
  [F_INDEX]: fs.readFileSync(path.join(ROOT, F_INDEX), 'utf8'),
  [F_TAVERN]: fs.readFileSync(path.join(ROOT, F_TAVERN), 'utf8'),
};
const EOL = PRISTINE[F_INDEX].indexOf('\r\n') >= 0 ? 'CRLF' : 'LF';
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }

/* ══════════════════════════════════════════════════════════════════════════════
 * ドライバが独立に引く値 (ソースの正規表現。⛔ ページの答えから作らない)
 * ══════════════════════════════════════════════════════════════════════════════ */
const ROW_RE = /"([a-z0-9-]+)":\s*\{\s*name:\s*"([^"]+)",\s*spellId:\s*"([^"]+)",\s*classKey:\s*"([a-z]+)",\s*rarity:\s*"([a-z]+)"\s*\}/g;
function parseCatalog(src, constName) {
  const m = src.match(new RegExp('const ' + constName + ' = \\{([\\s\\S]*?)\\r?\\n\\s*\\};'));
  if (!m) return [];
  const out = [];
  let r; const re = new RegExp(ROW_RE.source, 'g');
  while ((r = re.exec(m[1]))) out.push({ id: r[1], name: r[2], spellId: r[3], classKey: r[4], rarity: r[5] });
  return out;
}
const CAT_IDX = parseCatalog(PRISTINE[F_INDEX], 'SCROLL_CATALOG');
const CAT_TV = parseCatalog(PRISTINE[F_TAVERN], 'SCROLL_CATALOG_TV');
if (!CAT_IDX.length || !CAT_TV.length) vetFail('(0a) 巻物の表を正規表現で引けない (index ' + CAT_IDX.length + ' / tavern ' + CAT_TV.length + ')');
const INV_ROWS_IDX = CAT_IDX.filter((c) => c.id === 'scroll-invisibility');
const INV_ROWS_TV = CAT_TV.filter((c) => c.id === 'scroll-invisibility');
const INV_SCROLL = INV_ROWS_IDX[0] || null;
/* MAGE_SKILLS の "invisibility": { … }, のブロック (index) と MAGE_SKILLS_UI の 1 行 (tavern) */
const SPELL_IDX = (function () {
  const m = PRISTINE[F_INDEX].match(/\n\s*"invisibility":\s*\{([\s\S]*?)\r?\n\s*\},/);
  if (!m) return null;
  const num = (k) => { const x = m[1].match(new RegExp('\\b' + k + ':\\s*(\\d+)')); return x ? parseInt(x[1], 10) : null; };
  const nm = m[1].match(/\bname:\s*"([^"]+)"/);
  return { name: nm ? nm[1] : null, mpCost: num('mpCost'), levelReq: num('levelReq'), outOfCombat: /\boutOfCombat:\s*true\b/.test(m[1]) };
})();
const SPELL_TV = (function () {
  const m = PRISTINE[F_TAVERN].match(/\{\s*id:\s*"invisibility",([^\n]*)\}/);
  if (!m) return null;
  const num = (k) => { const x = m[1].match(new RegExp('\\b' + k + ':\\s*(\\d+)')); return x ? parseInt(x[1], 10) : null; };
  const nm = m[1].match(/\bname:\s*"([^"]+)"/);
  return { name: nm ? nm[1] : null, mpCost: num('mpCost'), levelReq: num('levelReq'), autoCast: /\bautoCast:\s*true\b/.test(m[1]) };
})();
if (!SPELL_IDX || !SPELL_TV || !INV_SCROLL) vetFail('(0a) 透明化の呪文 / 巻物の定義をソースから引けない (MAGE_SKILLS ' + !!SPELL_IDX + ' / MAGE_SKILLS_UI ' + !!SPELL_TV + ' / SCROLL_CATALOG ' + !!INV_SCROLL + ')');
const UNCOMMON_IDX = CAT_IDX.filter((c) => c.rarity === 'uncommon').map((c) => c.id).sort();
const UNCOMMON_PRE78 = UNCOMMON_IDX.filter((id) => id !== 'scroll-invisibility');
const DCS = (PRISTINE[F_INDEX].match(/perceptionDC: (\d+)/g) || []).map((s) => parseInt(s.replace(/\D+/g, ''), 10));
if (DCS.length < 6) vetFail('(2b) ソースの perceptionDC が 6 件未満 (' + DCS.length + ')');
const PRICE_M = PRISTINE[F_TAVERN].match(/const SCROLL_SHELF_PRICE = (\d+);/);
if (!PRICE_M) vetFail('ソースに const SCROLL_SHELF_PRICE = <n>; が無い');
const PRICE = parseInt(PRICE_M[1], 10);
const COMMON_TV = CAT_TV.filter((c) => c.rarity === 'common');
/* 依頼書 §2-3 の式 (ドライバ側の経路)。20 は常に成功・1 は常に失敗。修正値 = 盗賊入り +6 / 透明化・エルフなし +2 / エルフ入り +4 */
const P23 = (b, dc) => { let n = 0; for (let r = 1; r <= 20; r++) if (r === 20 || (r !== 1 && r + b >= dc)) n++; return n; };
const P23_BONUS = { rogue: 6, noElf: 2, elf: 4 };

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 9 本)。逐語は HEAD abc2394 (項目2 の実装後) で取った。
 * 各変異は console.log("__MUTHIT__<key>") を**欠陥が効く枝**に持つ (= 注入が測っている場所に現れたかを数える)。
 * count = 原本での出現回数 (既定 1・全部置き換える)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const MUTATIONS = {
  /* 罠A。⚠ #78 K1: 依頼書の案「主人公の枠を makeLeaderActor() の actor で消費する」は空振りする
   *   (actor は spellSlots: currentSpellSlots を同一参照で持つので、actor で消費しても主人公の枠は減る)。
   *   ⇒ 罠A の本来の姿 = 「主人公の枠でない入れ物 (コピー) を消費する」へ差し替えた = コメントどおりの「コピー渡し」の actor。 */
  leaderref: [
    { file: F_INDEX, from: '      if (!consumeSpellSlot(unit, ID)) return null;',
      to: '      if (!consumeSpellSlot(unit === "player" ? (' + HIT('leaderref') + ', { spellSlots: Object.assign({}, currentSpellSlots) }) : unit, ID)) return null;   /* ★変異leaderref */' }],
  /* 罠B: 半透明をクラスでなくインラインの opacity で付ける */
  inlineopacity: [
    { file: F_INDEX, from: '      for (const el of els) el.classList.toggle("dfInvis", !!on);',
      to: '      for (const el of els) { el.style.opacity = on ? "0.5" : ""; ' + HIT('inlineopacity') + '; }   /* ★変異inlineopacity */' }],
  /* 罠C: finally で外さず、成功の枝でだけ外す (印は finally の跡 = 外し忘れる経路で鳴る) */
  nofinally: [
    { file: F_INDEX, from: '        if (invisCaster) setPartyInvisible(false);          // ⚠ 失敗・例外・null でも必ず外す (依頼書 §2-2 罠C)',
      to: '        if (invisCaster && document.querySelector(".dfInvis")) ' + HIT('nofinally') + ';   /* ★変異nofinally: finally で外さない */' },
    { file: F_INDEX, from: '          const n = applySurpriseStun(targets);   // ★共有: EV-9 の奇襲成功もこの同じ付与を通る',
      to: '          const n = applySurpriseStun(targets); if (invisCaster) setPartyInvisible(false);   /* ★変異nofinally: 成功の枝でだけ外す */' }],
  /* 罠D: 開発モードでなくても開発用の集合を並べる */
  leakdev: [
    { file: F_TAVERN, from: '    if (DF_DEV_MAGIC_SHOP) return scrollShelfIdsDev();   // ★[#78] 開発モードだけ拾う巻物も並べる',
      to: '    if (DF_DEV_MAGIC_SHOP || (' + HIT('leakdev') + ', true)) return scrollShelfIdsDev();   /* ★変異leakdev */' }],
  /* 罠F: 定義から outOfCombat を外す (印は定義の評価時 = 表が読まれたこと) */
  nooutofcombat: [
    { file: F_INDEX, from: '        range: "self", outOfCombat: true,',
      to: '        range: "self", _mutNoOoc: (' + HIT('nooutofcombat') + ', 0),   /* ★変異nooutofcombat */' }],
  /* 有利の近似: 透明化のとき opts.extraBonus = 5 */
  advantage: [
    { file: F_INDEX, from: '            flavor: invisCaster ? "姿を消したまま、敵の死角へ忍び寄る…" : "足音を殺し、敵の死角へ忍び寄る…",',
      to: '            flavor: invisCaster ? "姿を消したまま、敵の死角へ忍び寄る…" : "足音を殺し、敵の死角へ忍び寄る…", extraBonus: invisCaster ? (' + HIT('advantage') + ', 5) : undefined,   /* ★変異advantage */' }],
  /* 不採用案: 盗賊 (外套) が居ても唱える (印は canSneak が真のときだけ鳴る) */
  rogueToo: [
    { file: F_INDEX, from: '      if (!canSneak) {',
      to: '      if (!canSneak || (' + HIT('rogueToo') + ', true)) {   /* ★変異rogueToo */' },
    { file: F_INDEX, from: '        if (!invisCaster) return false;                     // 従来どおり: 隠密無縁のPT（重装戦士等）は判定を出さない＝低摩擦',
      to: '        if (!invisCaster && !canSneak) return false;   /* ★変異rogueToo */' }],
  /* ボスだけの戦闘でも唱える (早期 return の前に唱える) */
  bossburn: [
    { file: F_INDEX, from: '      if (targets.length === 0) return false;               // 非ボスの生存敵ゼロ（ボスのみ等）→ 忍ぶ意味なし',
      to: '      if (targets.length === 0) { ' + HIT('bossburn') + '; await tryCastInvisibility(); return false; }   /* ★変異bossburn */' }],
  /* 傾向の候補から外さない (引き出し + 準備画面の 2 か所。印は autoCast の技が候補に残ったときだけ鳴る) */
  noautocast: [
    { file: F_TAVERN, count: 2, from: '        : equippedIds.filter(id => !isAutoCastSkillTV(slot, id));',
      to: '        : equippedIds.filter(id => (isAutoCastSkillTV(slot, id) && ' + HIT('noautocast') + ', true));   /* ★変異noautocast */' }],
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた
 * (2026-09-30・HEAD abc2394 の上)。⭐ --negative は「赤の集合 = 担当」の完全一致を要求する。 */
const NEG_EXPECT = {
  leaderref:     ['(1f)'],
  /* クラスが付かない ⇒ クラスで「唱えた」を見る節が全部赤: (3b) 最中にクラスが無い / (3c) 対照 (1a) で付け外しを拾えない / (1f) 一度も付かない */
  inlineopacity: ['(1f)', '(3a)', '(3b)', '(3c)'],
  nofinally:     ['(3b)'],
  leakdev:       ['(5b)'],
  /* (4c) = 主人公の候補も同じ旗で外している (旗が主人公の候補の唯一の関門) */
  nooutofcombat: ['(4a)', '(4c)'],
  advantage:     ['(2a)'],
  /* 盗賊・外套の腕でも唱える ⇒ (1c) 外套でも枠が減る / (2a)(6a) flavor が透明化の文に化ける / (3c) 唱えない腕でクラスが付く */
  rogueToo:      ['(1b)', '(1c)', '(2a)', '(3c)', '(6a)'],
  /* 早期 return の前は try/finally の外 ⇒ クラスが残る = (3c) */
  bossburn:      ['(1e)', '(3c)'],
  noautocast:    ['(5d)'],
};
/* 依頼書 §8 の予想 (⭐ 実測の赤に含まれていることは崩さない = 起動時に検算) */
const NEG_PREDICTED = {
  leaderref: ['(1f)'], inlineopacity: ['(3a)'], nofinally: ['(3b)'], leakdev: ['(5b)'], nooutofcombat: ['(4a)'],
  advantage: ['(2a)'], rogueToo: ['(1b)'], bossburn: ['(1e)'], noautocast: ['(5d)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 9) vetFail('変異は 9 本まで (ポート 10494〜10502)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_PREDICTED[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) vetFail('NEG_EXPECT / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  const miss = NEG_PREDICTED[k].filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  if (miss.length) vetFail('担当 ' + k + ' が依頼書 §8 の予想 ' + J(NEG_PREDICTED[k]) + ' を含まない');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
const _mutCache = {};
/* ⭐ 注入点の検算は**手つかずの原本**に対して数える */
function servedFile(file, key) {
  if (!key) return PRISTINE[file];
  const ck = key + '|' + file;
  if (_mutCache[ck] !== undefined) return _mutCache[ck];
  let s = PRISTINE[file];
  for (const e of MUTATIONS[key]) {
    if (e.file !== file) continue;
    const want = e.count || 1;
    const c = countOf(PRISTINE[file], e.from);
    if (c !== want) vetFail('変異 ' + key + ' の注入点が ' + want + ' 箇所ではない (' + file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
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
console.log('[vet] 装置: 巻物 index ' + CAT_IDX.length + ' / tavern ' + CAT_TV.length + ' 件 (uncommon ' + UNCOMMON_IDX.length + ') / 透明化 levelReq '
  + SPELL_IDX.levelReq + '・mpCost ' + SPELL_IDX.mpCost + ' / perceptionDC ' + J(DCS) + ' / SCROLL_SHELF_PRICE ' + PRICE
  + ' / 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で期待どおり / 改行 ' + EOL);

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
 * (6c) 入れ子: verify_scroll_shelf --negative (変異に依らない = 1 プロセスで 1 回だけ)
 * ══════════════════════════════════════════════════════════════════════════════ */
let _r6c = null;
function run6c() {
  if (_r6c) return _r6c;
  if (SKIP_6C) { _r6c = { ok: false, detail: '--skip-6c で飛ばした (⛔ 黙って緑にしない)' }; return _r6c; }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'verify_scroll_shelf.js'), '--negative'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const base = out.match(/(\d+)\/(\d+) PASSED\s+FAILED (\d+)\s+PENDING 0\s+\[素・基準\]/);
  const neg = out.match(/負のコントロール (\d+) \/ (\d+) が検出成功/);
  const ok = r.status === 0 && !!base && base[1] === base[2] && base[3] === '0' && parseInt(base[2], 10) >= 19
    && !!neg && neg[1] === neg[2] && parseInt(neg[2], 10) >= 8;
  _r6c = { ok, detail: 'exit ' + r.status + ' / 素 ' + (base ? base[1] + '/' + base[2] : '(総括行なし)') + ' / 変異 ' + (neg ? neg[1] + '/' + neg[2] : '(総括行なし)')
    + ' / ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒' };
  return _r6c;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)', '(2a)', '(2b)',
  '(3a)', '(3b)', '(3c)', '(4a)', '(4b)', '(4c)', '(5a)', '(5b)', '(5c)', '(5d)', '(6a)', '(6b)', '(6c)', '(7a)', '(7b)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 700));
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
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 80) + '  -- ' + r.detail.slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed, failed };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ内: 1 つの戦闘の始まりを組んで tryStealthSurprise() を呼ぶ
 *   o = { hero, heroSlot, allies:[ck…], allySlot (null = 枠のキーを置かない), cloak, bossOnly, mode }
 *   mode = success / fail / null / throwCheck (resolveSkillCheck の中で例外) / throwStun (applySurpriseStun が例外)
 * ══════════════════════════════════════════════════════════════════════════════ */
const SCENARIO = async (o) => {
  const out = { log: [] };
  window.__autoplay = 20;   // dfPlayCast を即 resolve (演出の尺は測らない)
  if (player) player.classList.remove('dfInvis');   // 前の腕の取り残しを持ち越さない (各腕を独立に測る)
  for (const a of allies) { if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el); }
  allies.length = 0;
  leaderClassKey = o.hero || 'warrior';
  for (const k in currentSpellSlots) delete currentSpellSlots[k];
  if (o.heroSlot != null) currentSpellSlots.invisibility = o.heroSlot;
  let mage = null;
  (o.allies || []).forEach((ck, i) => {
    const a = createAlly(ck, playerX + 40 * (i + 1), playerY);
    a.npcName = 'T_' + ck;
    allies.push(a);
    try { createAllyDom(a, allies.length - 1); } catch (e) { out.log.push('dom:' + e.message); }
    if (ck === 'mage' && !mage) {
      mage = a;
      a.spellSlots = (o.allySlot == null) ? {} : { invisibility: o.allySlot };
      a.equippedSkills = o.allySlot ? ['invisibility'] : [];
    }
  });
  const keepBonus = getUnitSkillBonus;
  if (o.cloak) getUnitSkillBonus = (u) => (u !== 'player' && u && u.classKey === 'cleric') ? { stealth: 2 } : keepBonus(u);
  enemies.length = 0;
  const nb = o.bossOnly ? 0 : 2;
  for (let i = 0; i < nb; i++) enemies.push({ alive: true, def: { isBoss: false, name: 'e' + i }, stunned: 0, type: 'fake' });
  enemies.push({ alive: true, def: { isBoss: true, name: 'boss' }, stunned: 0, type: 'fake' });
  encounterEnemyIndices = enemies.map((_, i) => i);
  /* 付け外しを全部拾う (取り残しでなく「一度でも付いたか」= (3c)) */
  const els0 = [player].concat(allies.map((a) => a.el).filter(Boolean));
  const moRecs = [];   // ⚠ 配送済みの記録は takeRecords() に残らない ⇒ コールバックで貯める
  const mo = new MutationObserver((rs) => { for (const r of rs) moRecs.push(r); });
  els0.forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));
  const keepLog = appendLog;
  const logs = [];
  appendLog = function (m) { logs.push(String(m)); return keepLog.apply(this, arguments); };
  const SC = window.SkillCheck, keep = SC.resolveSkillCheck;
  const keepStun = applySurpriseStun;
  out.calls = [];
  out.during = null;
  SC.resolveSkillCheck = async (k, dc, party, opts) => {
    out.calls.push({ k, dc, party: (party || []).map((m) => m.classKey), optKeys: Object.keys(opts || {}).sort(), flavor: opts && opts.flavor,
      extraBonus: opts ? opts.extraBonus : undefined, advantage: opts ? opts.advantage : undefined, title: opts && opts.title });
    const els = [player].concat(allies.filter((a) => a.alive && a.el).map((a) => a.el));
    applyNormalPlayerVisual();
    out.during = { n: els.length, cls: els.map((e) => e.classList.contains('dfInvis')), op: parseFloat(getComputedStyle(player).opacity),
      allyOp: allies.filter((a) => a.alive && a.el).map((a) => parseFloat(getComputedStyle(a.el).opacity)) };
    if (o.mode === 'throwCheck') throw new Error('boom-check');
    if (o.mode === 'null') return null;
    const success = o.mode !== 'fail';
    return { success, roll: 10, total: success ? dc + 1 : dc - 1, dc, bonus: 0, rep: party[0], helper: null, crit: false, fumble: false };
  };
  if (o.mode === 'throwStun') applySurpriseStun = () => { throw new Error('boom-stun'); };
  let ret;
  try { ret = await tryStealthSurprise(); } catch (e) { ret = 'ERR:' + e.message; }
  SC.resolveSkillCheck = keep;
  applySurpriseStun = keepStun;
  getUnitSkillBonus = keepBonus;
  appendLog = keepLog;
  const recs = moRecs.concat(mo.takeRecords()); mo.disconnect();
  out.everInvis = recs.some((r) => (r.oldValue || '').split(/\s+/).indexOf('dfInvis') >= 0 || r.target.classList.contains('dfInvis'));
  out.ret = ret;
  out.after = [player].concat(allies.map((a) => a.el).filter(Boolean)).map((e) => e.classList.contains('dfInvis'));
  out.allySlot = mage ? (mage.spellSlots.invisibility === undefined ? null : mage.spellSlots.invisibility) : null;
  out.heroSlot = currentSpellSlots.invisibility === undefined ? null : currentSpellSlots.invisibility;
  out.stunned = enemies.map((e) => e.stunned);
  out.logs = logs;
  return out;
};
const PICK_SWEEP = () => {
  const keep = Math.random, seen = new Set();
  try {
    for (let i = 0; i < 400; i++) { const v = i / 400; let n = 0; Math.random = () => (n++ === 0 ? 0.5 : v); seen.add(pickScrollId({ common: 0, uncommon: 1, rare: 0 })); }
  } finally { Math.random = keep; }
  return Array.from(seen).sort();
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { port, booted: 0, errs: [], hits: {} };
  const page = await browser.newPage();
  ctx.page = page;
  page.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
  page.on('console', (m) => {
    let t = ''; try { t = m.text(); } catch (e) { return; }
    if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
  });
  const base = 'http://127.0.0.1:' + port + '/';
  async function bootIndex(qs) {
    await page.goto(base + F_INDEX + qs, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => { try { return typeof tryStealthSurprise === 'function' && typeof buildPerceptionParty === 'function' && typeof player !== 'undefined' && !!player; } catch (e) { return false; } }, { timeout: 30000 });
    await page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });   // ゲームループを止める
    ctx.booted++;
  }
  async function bootTavern(qs, dev) {
    const url = base + F_TAVERN + qs;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate((d) => { localStorage.clear(); if (d) localStorage.setItem('df.devMode', '1'); }, dev);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__equipTV, { timeout: 30000 });
    ctx.booted++;
  }
  const scen = (o) => page.evaluate(SCENARIO, o);
  const NOSNEAK = ['mage', 'cleric', 'dwarf'];   // 主人公 戦士 + この 3 人
  const shelfRows = () => page.evaluate(() => {
    __equipTV.setShopTab('buy'); __equipTV.openShop();
    const L = document.getElementById('shopList'); const out = [];
    let cur = null;
    for (const el of (L ? L.children : [])) {
      if (el.classList.contains('shopGroupHead')) { cur = el.textContent; continue; }
      if (cur === '巻物' && el.classList.contains('shopItem')) {
        const b = el.querySelector('button.shopBtn'); const nm = el.querySelector('.shopName');
        out.push({ name: nm ? nm.textContent : null, btn: b ? b.textContent : null });
      }
    }
    return out;
  });
  try {
    /* ══════════ index.html 素 ══════════ */
    await bootIndex('?diag=1&graph=0');
    const fns = await page.evaluate(() => ({ tss: typeof tryStealthSurprise, tci: typeof tryCastInvisibility, spi: typeof setPartyInvisible,
      page: { name: MAGE_SKILLS.invisibility && MAGE_SKILLS.invisibility.name, mpCost: MAGE_SKILLS.invisibility && MAGE_SKILLS.invisibility.mpCost,
        levelReq: MAGE_SKILLS.invisibility && MAGE_SKILLS.invisibility.levelReq, ooc: MAGE_SKILLS.invisibility && MAGE_SKILLS.invisibility.outOfCombat },
      scroll: SCROLL_CATALOG['scroll-invisibility'] || null }));

    /* (1a) + (3a) */
    const r1a = await scen({ allies: NOSNEAK, allySlot: 1, mode: 'success' });
    {
      const c = r1a.calls[0] || {};
      const ok = r1a.ret === true && r1a.calls.length === 1 && c.k === 'stealth' && r1a.allySlot === 0
        && r1a.logs.some((m) => m.indexOf(SPELL_IDX.name) >= 0) && J(r1a.stunned) === J([1, 1, 0])
        && J(c.party) === J(['warrior', 'mage', 'cleric', 'dwarf']);
      R.check('(1a)', '盗賊も外套も居ない 4 人・枠 1 ⇒ 判定 stealth 1 回・枠 1→0・ログに呪文名・非ボスだけ stunned', ok,
        { ret: r1a.ret, calls: r1a.calls.map((x) => [x.k, x.dc, x.party]), slot: r1a.allySlot, stunned: r1a.stunned, spellInLog: r1a.logs.some((m) => m.indexOf(SPELL_IDX.name) >= 0), err: r1a.log });
    }
    R.check('(0b)', '[装置] 差し替えた resolveSkillCheck が (1a) で 1 回以上呼ばれた・3 関数が在る',
      r1a.calls.length >= 1 && fns.tss === 'function' && fns.tci === 'function' && fns.spi === 'function',
      { calls: r1a.calls.length, fns: [fns.tss, fns.tci, fns.spi] });
    {
      const d = r1a.during || {};
      const ok = !!r1a.during && d.n === 4 && d.cls.every(Boolean) && d.op < 1;
      R.check('(3a)', '判定の最中: 主人公 + 生きている仲間 3 人が .dfInvis・applyNormalPlayerVisual() の後も opacity < 1', ok, d);
    }

    /* (3b) 5 通り */
    {
      const rows = [{ mode: 'success', r: r1a }];
      for (const mode of ['fail', 'null', 'throwCheck', 'throwStun']) rows.push({ mode, r: await scen({ allies: NOSNEAK, allySlot: 1, mode }) });
      const want = { success: (x) => x === true, fail: (x) => x === false, null: (x) => x === false, throwCheck: (x) => x === false, throwStun: (x) => typeof x === 'string' && x.indexOf('ERR:boom-stun') === 0 };
      const ok = rows.every((x) => x.r.allySlot === 0 && x.r.calls.length === 1 && x.r.during && x.r.during.cls.every(Boolean)
        && x.r.after.length === 4 && x.r.after.every((v) => !v) && want[x.mode](x.r.ret));
      R.check('(3b)', '返った後はクラスが誰にも残らない: 成功 / 失敗 / null / 判定内の例外 / applySurpriseStun の例外 (外へ抜ける)', ok,
        rows.map((x) => x.mode + ':ret=' + J(x.r.ret) + ' 唱えた=' + (x.r.allySlot === 0) + ' 最中=' + J(x.r.during && x.r.during.cls) + ' 後=' + J(x.r.after)).join(' / '));
    }

    /* (1b) (1c) (1d) (1e) + (3c) */
    const r1b = await scen({ allies: ['rogue', 'mage', 'cleric'], allySlot: 1, mode: 'success' });
    R.check('(1b)', '盗賊入り ⇒ 唱えない (枠 1 のまま)・判定は 1 回', r1b.allySlot === 1 && r1b.calls.length === 1 && r1b.ret === true,
      { slot: r1b.allySlot, calls: r1b.calls.length, ret: r1b.ret });
    const r1c = await scen({ allies: NOSNEAK, allySlot: 1, cloak: true, mode: 'success' });
    R.check('(1c)', '外套 (僧侶に stealth +2) ⇒ 唱えない・判定は 1 回', r1c.allySlot === 1 && r1c.calls.length === 1,
      { slot: r1c.allySlot, calls: r1c.calls.length, ret: r1c.ret });
    const r1d0 = await scen({ allies: NOSNEAK, allySlot: 0, mode: 'success' });
    const r1dn = await scen({ allies: NOSNEAK, allySlot: null, mode: 'success' });
    R.check('(1d)', '枠 0 / 枠を置いていない ⇒ 唱えない・判定も出ない (return false)',
      [r1d0, r1dn].every((r) => r.ret === false && r.calls.length === 0 && r.heroSlot === null) && r1d0.allySlot === 0 && r1dn.allySlot === null,
      { slot0: { ret: r1d0.ret, calls: r1d0.calls.length }, noKey: { ret: r1dn.ret, calls: r1dn.calls.length } });
    const r1e = await scen({ allies: NOSNEAK, allySlot: 1, bossOnly: true, mode: 'success' });
    R.check('(1e)', '交戦中の敵がボスだけ ⇒ 唱えない・枠 1 のまま・判定も出ない', r1e.ret === false && r1e.allySlot === 1 && r1e.calls.length === 0,
      { ret: r1e.ret, slot: r1e.allySlot, calls: r1e.calls.length });
    {
      const arms = { '1b': r1b, '1c': r1c, '1d0': r1d0, '1dn': r1dn, '1e': r1e };
      const bad = Object.keys(arms).filter((k) => arms[k].everInvis || arms[k].after.some(Boolean) || (arms[k].during && arms[k].during.cls.some(Boolean)));
      /* 対照: 唱えた (1a) では付け外しを拾えている (MutationObserver が空振りしていない) */
      R.check('(3c)', '唱えなかった戦闘 (1b)(1c)(1d)(1e) で .dfInvis が一度も付かない (対照 (1a) では拾えている)', bad.length === 0 && r1a.everInvis === true,
        { bad, control1a: r1a.everInvis });
    }

    /* (1f) 主人公が魔法使い */
    const r1f = await scen({ hero: 'mage', heroSlot: 1, allies: ['warrior', 'cleric', 'dwarf'], mode: 'success' });
    R.check('(1f)', '主人公が魔法使い・currentSpellSlots.invisibility = 1 ⇒ 唱えて 0 (罠A)', r1f.heroSlot === 0 && r1f.calls.length === 1 && r1f.ret === true && r1f.everInvis === true,
      { heroSlot: r1f.heroSlot, calls: r1f.calls.length, ret: r1f.ret, everInvis: r1f.everInvis, party: r1f.calls[0] && r1f.calls[0].party });

    /* (1g) 枠の関門 */
    {
      const g = await page.evaluate((lvReq) => {
        const keep = knownSpells.mage;
        const base = (keep || []).filter((x) => x !== 'invisibility');
        const run = (lv, known) => { knownSpells.mage = known ? base.concat(['invisibility']) : base.slice(); const a = {}; initAllySpellSlots(a, 'mage', lv, { mage: { invisibility: 1 } }); return a.spellSlots.invisibility || 0; };
        const r = { lowKnown: run(lvReq - 1, true), reqUnknown: run(lvReq, false), reqKnown: run(lvReq, true) };
        knownSpells.mage = keep;
        return r;
      }, SPELL_IDX.levelReq);
      R.check('(1g)', 'initAllySpellSlots: Lv' + (SPELL_IDX.levelReq - 1) + '・習得済 ⇒ 0 / Lv' + SPELL_IDX.levelReq + '・未習得 ⇒ 0 / Lv' + SPELL_IDX.levelReq + '・習得済 ⇒ 1',
        g.lowKnown === 0 && g.reqUnknown === 0 && g.reqKnown === 1, g);
    }

    /* (2a) 引数の一致 */
    {
      const a = r1a.calls[0] || {}, b = r1b.calls[0] || {};
      const ok = a.k === 'stealth' && b.k === 'stealth' && a.dc === b.dc && typeof a.dc === 'number' && J(a.optKeys) === J(b.optKeys)
        && a.extraBonus === undefined && b.extraBonus === undefined && a.advantage === undefined && a.optKeys.indexOf('advantage') < 0
        && a.title === b.title && typeof a.flavor === 'string' && typeof b.flavor === 'string' && a.flavor !== b.flavor;
      R.check('(2a)', '透明化 (1a) と盗賊入り (1b) の resolveSkillCheck の引数が数値に響く部分で一致 (違うのは flavor だけ)', ok,
        { invis: [a.k, a.dc, a.optKeys, a.extraBonus, a.title], rogue: [b.k, b.dc, b.optKeys, b.extraBonus, b.title], flavorDiffers: a.flavor !== b.flavor });
    }

    /* (2b) 盗賊より下 (2 経路) */
    {
      const pageRates = await page.evaluate((dcs) => {
        const SC = window.SkillCheck, def = SC.CHECKS.stealth;
        const rate = (cks, dc) => {
          const party = cks.map((c, i) => ({ classKey: c, name: c + i }));
          const rep = SC.selectRepresentative(party, def);
          const helper = SC.selectHelper(party, def, rep);
          const b = SC.checkScore(rep, def) + (helper ? SC.HELP_BONUS : 0);
          let n = 0; for (let r = 1; r <= 20; r++) if (SC._computeOutcome(r, b, dc).success) n++;
          return n;
        };
        return dcs.map((dc) => ({ dc, rogue: rate(['rogue', 'warrior', 'cleric', 'mage'], dc), noElf: rate(['warrior', 'mage', 'cleric', 'dwarf'], dc), elf: rate(['elf', 'mage', 'cleric', 'dwarf'], dc) }));
      }, DCS);
      const bad = pageRates.filter((x) => !(x.noElf < x.rogue && x.elf < x.rogue));
      const mism = pageRates.filter((x) => x.rogue !== P23(P23_BONUS.rogue, x.dc) || x.noElf !== P23(P23_BONUS.noElf, x.dc) || x.elf !== P23(P23_BONUS.elf, x.dc));
      R.check('(2b)', '6 つの DC で 透明化 (エルフなし / あり) の成功率 < 盗賊入り (ページの SkillCheck) + 依頼書 §2-3 の式と一致', pageRates.length === DCS.length && bad.length === 0 && mism.length === 0,
        pageRates.map((x) => 'DC' + x.dc + ' 盗賊' + (x.rogue * 5) + '% 無' + (x.noElf * 5) + '% エ' + (x.elf * 5) + '%').join(' / ') + (mism.length ? ' ⛔ 式と不一致 ' + J(mism) : ' (式と一致)'));
    }

    /* (4a) (4b) */
    {
      const f4 = await page.evaluate(async () => {
        for (const a of allies) { if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el); }
        allies.length = 0;
        const a = createAlly('mage', playerX + 40, playerY); allies.push(a); try { createAllyDom(a, 0); } catch (e) {}
        a.spellSlots = { invisibility: 1 }; a.equippedSkills = ['invisibility'];
        const keepMap = actionPriorityMap, keepR = Math.random;
        actionPriorityMap = { mage: { general: 'invisibility', mob: 'invisibility', boss: 'invisibility', travel: null } };
        Math.random = () => 0;
        let ap, ex;
        /* ⭐ 罠F の関門は apTryPreferred の outOfCombat の 1 行。その先の executeSkillOn も名指しで false を返すので
         *   (二重の守り)、戻り値と枠だけでは旗を外しても緑のまま (#78 K9)。⇒ executeSkillOn へ渡った回数も数える。 */
        const keepEx = executeSkillOn;
        let reachedEx = 0;
        executeSkillOn = function (u, ck, id) { if (id === 'invisibility') reachedEx++; return keepEx.apply(this, arguments); };
        try { ap = await apTryPreferred(a); } catch (e) { ap = 'ERR:' + e.message; }
        executeSkillOn = keepEx;
        const slotAfterAp = a.spellSlots.invisibility;
        a.spellSlots = { invisibility: 1 };
        try { ex = await executeSkillOn(a, 'mage', 'invisibility', -1); } catch (e) { ex = 'ERR:' + e.message; }
        Math.random = keepR; actionPriorityMap = keepMap;
        return { apOn: ACTION_PRIORITY_ON, ap, reachedEx, slotAfterAp, ex, slotAfterEx: a.spellSlots.invisibility };
      });
      R.check('(4a)', '傾向を全部 invisibility にして apTryPreferred(魔法使いの仲間) ⇒ false・枠 1 のまま・executeSkillOn まで届かない', f4.apOn === true && f4.ap === false && f4.slotAfterAp === 1 && f4.reachedEx === 0, f4);
      R.check('(4b)', 'executeSkillOn(ally, "mage", "invisibility", -1) ⇒ false・枠 1 のまま', f4.ex === false && f4.slotAfterEx === 1, f4);
    }

    /* (4c) 主人公の技の候補 */
    {
      const c4 = await page.evaluate(async () => {
        for (const a of allies) { if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el); }
        allies.length = 0;
        leaderClassKey = 'mage';
        for (const k in currentSpellSlots) delete currentSpellSlots[k];
        currentSpellSlots.invisibility = 1; currentSpellSlots.fireball = 1;
        const keepEq = equippedSkills.slice();
        equippedSkills.length = 0; equippedSkills.push('invisibility', 'fireball');
        enemies.length = 0;
        enemies.push({ alive: true, hp: 10, maxHp: 10, x: playerX + 48, y: playerY, type: 'fake', def: { isBoss: false, name: 'e0', displaySize: 48 }, stunned: 0 });
        encounterEnemyIndices = [0];
        const keepPick = pickLeaderAction;
        let captured = null;
        pickLeaderAction = function (choices) { captured = choices.slice(); throw new Error('__stop4c__'); };
        let err = null;
        try { await playerAttackTurn(0); } catch (e) { err = String(e && e.message); }
        pickLeaderAction = keepPick;
        equippedSkills.length = 0; keepEq.forEach((x) => equippedSkills.push(x));
        return { captured, err, ooc: MAGE_SKILLS.invisibility.outOfCombat };
      });
      const ok = Array.isArray(c4.captured) && c4.captured.indexOf('invisibility') < 0 && c4.captured.indexOf('fireball') >= 0 && c4.ooc === true;
      R.check('(4c)', '主人公 (魔法使い) の技の候補 (pickLeaderAction の choices) に invisibility が無い・対照 fireball は在る・outOfCombat === true', ok, c4);
    }

    /* (6b) 素 */
    const pick1 = await page.evaluate(PICK_SWEEP);

    /* ══════════ index.html?invis=0 ══════════ */
    await bootIndex('?diag=1&graph=0&invis=0');
    const r7a = await scen({ allies: NOSNEAK, allySlot: 1, mode: 'success' });
    R.check('(7a)', 'index.html?invis=0 ⇒ (1a) と同じ仕込みで唱えない・判定も出ない', r7a.ret === false && r7a.allySlot === 1 && r7a.calls.length === 0 && !r7a.everInvis,
      { ret: r7a.ret, slot: r7a.allySlot, calls: r7a.calls.length, everInvis: r7a.everInvis });
    const r6aOff = await scen({ allies: ['rogue', 'mage', 'cleric'], allySlot: 1, mode: 'success' });
    {
      const pick = (r) => J({ ret: r.ret, calls: r.calls.map((c) => [c.k, c.dc, c.party, c.optKeys, c.flavor, c.extraBonus, c.title]), stunned: r.stunned, slot: r.allySlot, everInvis: r.everInvis });
      R.check('(6a)', '盗賊入りの結果 (判定の引数・付与した敵・戻り値・枠) が 素 と ?invis=0 で同じ', pick(r1b) === pick(r6aOff) && r1b.calls.length === 1 && J(r1b.stunned) === J([1, 1, 0]),
        { now: JSON.parse(pick(r1b)), off: JSON.parse(pick(r6aOff)) });
    }
    const pick0 = await page.evaluate(PICK_SWEEP);
    R.check('(6b)', 'pickScrollId({uncommon:1}) の全区間 ⇒ 素 = ソースの uncommon ' + UNCOMMON_IDX.length + ' 種 (透明化あり) / ?invis=0 = ' + UNCOMMON_PRE78.length + ' 種 (#78 以前)',
      J(pick1) === J(UNCOMMON_IDX) && J(pick0) === J(UNCOMMON_PRE78) && pick1.indexOf('scroll-invisibility') >= 0 && pick0.indexOf('scroll-invisibility') < 0,
      { now: pick1, off: pick0 });

    /* ══════════ tavern.html 開発モード ══════════ */
    await bootTavern('', true);
    const tvAns = await page.evaluate(() => ({ dev: DF_DEV_MAGIC_SHOP, spell: (MAGE_SKILLS_UI.find((s) => s.id === 'invisibility') || null), scroll: SCROLL_CATALOG_TV['scroll-invisibility'] || null }));
    {
      await page.evaluate(() => __equipTV.setGold(1));
      const rows = await shelfRows();
      const inv = rows.filter((x) => x.name === INV_SCROLL.name);
      const commons = COMMON_TV.map((c) => rows.filter((x) => x.name === c.name)[0] || null);
      const buy = await page.evaluate((id) => { const r = __equipTV.shopBuyScroll(id); return { r, gold: __equipTV.gold(), stock: __equipTV.scrollStock()[id] || 0 }; }, INV_SCROLL.id);
      const ok = tvAns.dev === true && inv.length === 1 && inv[0].btn === '購入 1G'
        && commons.every((x) => x && (x.btn === null || x.btn === '購入 ' + PRICE + 'G')) && commons.some((x) => x && x.btn === '購入 ' + PRICE + 'G')
        && buy.r.ok === true && buy.r.price === 1 && buy.gold === 0 && buy.stock === 1;
      R.check('(5a)', '開発モード: 棚に「' + INV_SCROLL.name + '」・「購入 1G」・1G で買える (金貨 0・所持 1)・common は「購入 ' + PRICE + 'G」', ok,
        { dev: tvAns.dev, rows, buy });
    }
    {
      const learn = await page.evaluate((id) => { const l = __equipTV.learnScroll(id); return { learned: l && l.learned, known: (knownSpellsTV.mage || []).indexOf('invisibility') >= 0 }; }, INV_SCROLL.id);
      const dr = await page.evaluate(() => {
        pmOrdered = [{ classKey: 'mage', isHero: true, name: '', zone: 'rear', variant: 0 }];
        pmRenderDrawer(0);
        const items = Array.from(document.querySelectorAll('#pmDrawer .spellCountItem'));
        const hit = items.filter((it) => { const n = it.querySelector('.sName'); return n && n.textContent.indexOf('インビジビリティ') >= 0; });
        return { lv: getLevelFromXP(inventory.xp), n: items.length, texts: hit.map((it) => it.querySelector('.sName').textContent) };
      });
      const lock = '[Lv' + SPELL_TV.levelReq + ' 必要]';
      const ok = learn.known === true && dr.lv === 1 && dr.texts.length === 1 && dr.texts[0].indexOf(SPELL_TV.name) >= 0 && dr.texts[0].indexOf(lock) >= 0;
      R.check('(5c)', 'learnScroll ⇒ knownSpellsTV.mage に invisibility・引き出しの呪文一覧に「' + SPELL_TV.name + '」(主人公 Lv1 では ' + lock + ')', ok, { learn, drawer: dr });
    }
    {
      const d5 = await page.evaluate(() => {
        selection.partySkills.mage = ['sleep', 'invisibility'];
        const optsOf = (root) => {
          const o = {};
          Array.from(root ? root.querySelectorAll('select.apSel') : []).forEach((s) => {
            const sit = s.id.replace(/^(pmApSel|apSel)_mage_/, '');
            o[sit] = Array.from(s.options).map((x) => x.value).filter(Boolean);
          });
          return o;
        };
        pmOrdered = [{ classKey: 'mage', isHero: true, name: '', zone: 'rear', variant: 0 }];
        pmRenderDrawer(0);
        const drawer = optsOf(document.getElementById('pmDrawerApRows'));
        activeCharTab = 'mage';
        renderActionPriority();
        const prep = optsOf(document.getElementById('apRows'));
        const col = buildPmColumn(pmOrdered[0], 0);
        col.fill(false);
        const v = col.el.querySelector('.pmSkillsVal');
        return { drawer, prep, card: v ? v.textContent : null };
      });
      const sits = ['general', 'mob', 'boss'];
      const clean = (o) => sits.every((s) => Array.isArray(o[s]) && o[s].indexOf('invisibility') < 0 && o[s].indexOf('sleep') >= 0);
      const ok = clean(d5.drawer) && clean(d5.prep) && typeof d5.card === 'string' && d5.card.indexOf(SPELL_TV.name) >= 0;
      R.check('(5d)', '枠に置いても傾向の「全般 / 雑魚 / ボス」の <option> (引き出し + 準備画面) に出ない (対照スリープは出る)・カードの「技」行には出る', ok, d5);
    }

    /* ══════════ tavern.html 開発モードでない ══════════ */
    await bootTavern('', false);
    {
      const rows = await shelfRows();
      const nb = await page.evaluate((id) => ({ dev: DF_DEV_MAGIC_SHOP, r: __equipTV.shopBuyScroll(id), shelf: __equipTV.scrollShelf().map((x) => x.id) }), INV_SCROLL.id);
      const ok = nb.dev === false && rows.length >= 1 && !rows.some((x) => x.name === INV_SCROLL.name) && nb.shelf.indexOf(INV_SCROLL.id) < 0 && nb.r.ok === false && nb.r.reason === 'noitem';
      R.check('(5b)', '開発モードでない ⇒ 棚に並ばない・shopBuyScroll = noitem', ok, { rows: rows.map((x) => x.name), nb });
    }

    /* ══════════ tavern.html?invis=0 + 開発 ══════════ */
    await bootTavern('?invis=0', true);
    {
      const rows = await shelfRows();
      const dev = await page.evaluate(() => DF_DEV_MAGIC_SHOP);
      const ok = dev === true && rows.length === COMMON_TV.length && !rows.some((x) => x.name === INV_SCROLL.name);
      R.check('(7b)', 'tavern.html?invis=0 + 開発 ⇒ 棚に並ばない (common ' + COMMON_TV.length + ' 件だけ)', ok, { dev, rows: rows.map((x) => x.name) });
    }

    /* ══════════ (0a) ソース ⇔ ページ ══════════ */
    {
      const same = (a, b) => !!a && !!b && a.name === b.name && a.spellId === b.spellId && a.classKey === b.classKey && a.rarity === b.rarity;
      const src = INV_ROWS_IDX.length === 1 && INV_ROWS_TV.length === 1 && same(INV_ROWS_IDX[0], INV_ROWS_TV[0])
        && INV_SCROLL.rarity === 'uncommon' && INV_SCROLL.classKey === 'mage' && INV_SCROLL.spellId === 'invisibility'
        && SPELL_IDX.levelReq === SPELL_TV.levelReq && SPELL_IDX.mpCost === SPELL_TV.mpCost && SPELL_IDX.name === SPELL_TV.name
        && typeof SPELL_IDX.levelReq === 'number' && typeof SPELL_IDX.mpCost === 'number';
      const pg = same(fns.scroll, INV_SCROLL) && same(tvAns.scroll, INV_SCROLL)
        && fns.page.levelReq === SPELL_IDX.levelReq && fns.page.mpCost === SPELL_IDX.mpCost && fns.page.name === SPELL_IDX.name
        && !!tvAns.spell && tvAns.spell.levelReq === SPELL_TV.levelReq && tvAns.spell.mpCost === SPELL_TV.mpCost && tvAns.spell.name === SPELL_TV.name;
      R.check('(0a)', '[装置] ソース 2 ファイルの巻物の行が同じ中身で 1 行ずつ・呪文 2 定義の levelReq / mpCost が一致・ページの答えもソースと一致', src && pg,
        { srcScroll: [INV_ROWS_IDX.length, INV_ROWS_TV.length, INV_SCROLL], srcSpell: [SPELL_IDX, SPELL_TV], pageIdx: [fns.scroll, fns.page], pageTv: [tvAns.scroll, tvAns.spell && [tvAns.spell.levelReq, tvAns.spell.mpCost]] });
    }

    /* ── (6c) ── */
    { const r = run6c(); R.check('(6c)', 'tools/verify_scroll_shelf.js --negative が 素 N/N (N≥19)・変異 M/M (M≥8)・exit 0 (変異に依らない = 1 回だけ実行して共有)', r.ok, r.detail); }

    /* ── (0c) 起動確認 ── */
    {
      const want = 2 + 3;   // index 素 / ?invis=0 + tavern 開発 / 非開発 / ?invis=0
      R.check('(0c)', '[装置] 全ページが起動し pageerror 0 件', ctx.booted === want && ctx.errs.length === 0, '起動 ' + ctx.booted + '/' + want + ' / pageerror ' + J(ctx.errs.slice(0, 3)));
    }
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await new Promise((r) => setTimeout(r, 200));   // console イベントの取りこぼしを避ける
    await page.close().catch(() => {});
  }
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_invisibility_');
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
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(14) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 注入行 ' + r.hit + ' 回 / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
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
