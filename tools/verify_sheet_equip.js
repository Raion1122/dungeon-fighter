#!/usr/bin/env node
/*
 * verify_sheet_equip.js — 実装依頼書 #89「キャラクターシートから主人公の装備を変える + 表記を『キャラクターシート』へ」の受入ドライバ
 *   (依頼書 2026-10-11_sheet-equip.md §8 + §12-0 K1〜K8 + §12-1 + §12-2 K9 + §12-3)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_sheet_equip.js                        # 素 (port 10606)
 *   node tools/verify_sheet_equip.js --negative             # 素の基準 + 変異 10 本 (port 10607〜10616)
 *   node tools/verify_sheet_equip.js --negative --only stack,label
 *   node tools/verify_sheet_equip.js --mutate stack         # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 本番の 2 ページ (index.html / tavern.html) を実際に開き、**シートの装備区画のボタンを指で押して** 付け替え、
 *     ① localStorage ② ページのランタイム (current*Index / allyEquipSelection / heroRef) ③ シートの表示 の 3 つを突き合わせる。
 *   - 主人公が頭 (戦士) と頭でない (魔法使い = 後衛) の両方を母集団にし、heroIsHead を本番から読んで (0b) で「両方起きた」を固定。
 *   - 戦闘中の灰色は 2 経路: 合成 (encounterActive を立てて render) と、?autoplay=4 の実戦闘を開いたままのシートで 100ms ごとに標本。
 *     実戦闘は乱数なので上限 FIGHT_LIMIT_MS を決め、(0d) で「戦闘が始まって終わった」を assert (空振りで緑にしない)。
 *   - 帰還は本物の撤退ボタン (#retreatBtn の click リスナ = dfReturnEquipValues → localStorage) → 次の酒場を開いて読む。
 *   - (3d) の「ラン中に上位品を得る」は、本番の宝箱の開封関数 discoverChest() に中身 {kind:"weapon"} の箱を渡して作る
 *     (#87 で道中の宝箱は既定で廃止 = 盤面に箱が無い。K3 で高水位の即時書き込みは bumpStoredIdx 経由)。
 *   - (3a) は同じ localStorage (gated を含むセーブ) の上で、ダンジョンの __sheetEquip.isOwned / ownedOptions / シートの DOM と、
 *     酒場の独立の判定 window.__equipTV.isOwnedFor (= dfIsOwnedTier) を全段で突き合わせる。
 *   - (5b) の「押せる物」の判定規則はこのドライバに独立に書く (⛔ 本番 js/player-sheet.js の autoPlace の判定を呼ばない)。
 *     ⛔ 座標は焼かない (酒場の位置は #changelogBox の高さで動く)。重なり面積 0・画面外へのはみ出し 0 だけを見る。
 *
 * ■ ページ (素 1 回)
 *   W  = index 390x844 戦士 (頭)         : (0a)(0b)(1a)(1b)(2a)(2b)(3b)(4a)(5a)
 *   M  = index 390x844 魔法使い (頭でない) : (0b)(1a)(1c)(3b)(4a)
 *   D / DT = ドワーフ + 戦斧 (index / tavern) : (1d)
 *   TV = tavern 390x844 戦士 + gated       : (0a)(1e)(5a)
 *   P  = (index → tavern) × 戦士 / 盗賊 の所持の突き合わせ : (3a)
 *   F  = index ?autoplay=4 の実戦闘          : (0d)(2a)(2b)(2c)
 *   R / R0 / H = 撤退 → 酒場 (素 / ?sheetequip=0 / 宝箱) : (3c)(6a)(3d)
 *   town / world / title 390x844           : (0c)(5a)
 *   L  = 置き場所 (酒場・タイトル・地方全景 × 390x844 / 800x600 / 1280x800、ダンジョン・町 × 390x844 / 1280x800) : (5b)
 *
 * ■ 測っているもの
 *   §0 (0a) [装置] 2 ページとも装備の供給口あり・装備区画が DOM に在る・武器/防具/盾の選べる品が各 1 つ以上
 *      (0b) [装置] 主人公が頭のケース (heroIsHead=true・戦士) と頭でないケース (false・魔法使い) が実際に両方起きた
 *      (0c) 町・地方全景・タイトルでは装備区画が DOM に無く、供給口も無い
 *      (0d) [装置] 実戦闘が FIGHT_LIMIT_MS 以内に始まり、探索へ戻った (開いたままのシートで標本が取れた)
 *      (0e) [装置] 全ページで pageerror 0 件
 *   §1 (1a) 探索中に武器を付け替える (実タップ) と localStorage の選択・ランタイム・シートの今の装備が同じ品 (頭 / 頭でない)
 *      (1b) 頭: 武器 +1 → 素で currentPlayerAtkBonus −1 / 防具 +1 → +2 で currentPlayerAc +1、シートの AC 欄も同じ値
 *      (1c) 頭でない: 品 A → B → A で heroRef.ac / dmgBonus が最初の値へぴったり戻る (B では実際に変わっている)
 *      (1d) 両手武器 (戦斧) を持つと盾が「なし」・盾の列が灰色・塞がりの理由・盾の直接装備は拒否 (ダンジョンと酒場)
 *      (1e) 酒場で引き出しを開いたままシートから付け替えると、引き出しの「装備中」とカードが同じ新しい品
 *   §2 (2a) 戦闘中: 合成 (encounterActive + combat) で全ボタン灰色・理由の行・実タップも直接 equip も何も書かない /
 *           実戦闘の標本で戦闘中は常に灰色・戦闘中の直接 equip は {ok:false} で何も書かない
 *      (2b) 勝った直後の rest 表示で encounterActive がまだ真の間も変えられない (合成 + 実戦闘で観測できた標本)
 *      (2c) 実戦闘が終わって探索に戻ると、開いたままのシートの装備欄が押せるに戻る (開き直さない)
 *   §3 (3a) ダンジョンの所持判定 = 酒場の __equipTV.isOwnedFor (全段)・選べる品 = 所持 − 装備中・シートの DOM = 選べる品
 *           (母集団: 戦士の gated 武器に「所持」と「未所持」が両方在る)
 *      (3b) 付け替えで変わるキーは equipWeaponIdx / equipArmorIdx / equipShieldIdx / allyEquip だけ (名指し)・開閉では 0 本
 *      (3c) シートで武器を下げて撤退すると、次の酒場で下げた品が装備中 (localStorage・酒場の選択・酒場のシート) かつ高水位は下がらない
 *      (3d) ラン中に宝箱で上位品を得てからシートで下げて撤退しても、酒場でその上位品が選べる (所持・シートの選べる品)
 *   §4 (4a) 「攻撃 & 呪文発動」の武器名・防具名が装備区画の今の装備名と一致 (付け替えの前後すべての状態で・頭 / 頭でない)
 *   §5 (5a) ボタンの文字が「📜 キャラクターシート」・紙の題名が「キャラクターシート」(5 ページ)
 *      (5b) 画面固定のページ (酒場・タイトル・地方全景) は 3 幅でボタンと押せる物の重なり面積 0・画面外へはみ出さない・中心が最前面 /
 *           ダンジョン (#partyPanel)・町 (#townHud) は置き場所と画面からはみ出さない・文字が切れない
 *   §6 (6a) ?sheetequip=0: index / tavern に装備区画も供給口も無い・(3c) と同じ判定を当てると赤になる (帰還時の保存が従来の Math.max)
 *   ⛔ 測らないこと (依頼書 §8): 装備区画の見た目の細部 (行の高さ・色) / 戦闘のバランス
 *
 * ■ ⚠ 計測機構
 *   - index.html / tavern.html / js/player-sheet.js は起動時に 1 回だけ readFileSync して凍結し、変異はその文字列をメモリ上で
 *     差し替えて配る (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *   - 起動時に全変異のアンカーを原本で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。崩れたら素でも exit 3。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」。担当は --mutate で実走して決めた。
 *   - ⚠ 魔法使い主人公の 390x844 isMobile は layout viewport が 418px に広がる (#player のはみ出し・既存挙動)。
 *     実タップの座標から visualViewport.offsetLeft/Top を引く (tapOpt)。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。10600 は別ドライバ。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10606** (素) / 変異 **10607〜10616** (10 本・MUTATIONS の並び順)。次の新規ドライバ base = 10617。
 * ■ 所要は依頼書 §12-3 に記録。
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
const PORT = parseInt(arg('port', '10606'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた条件 (データ) */
const BTN_TEXT = '📜 キャラクターシート';
const TITLE_TEXT = 'キャラクターシート';
const FIGHT_LIMIT_MS = 150000;     // (0d) 実戦闘を待つ上限
const WRITE_KEYS = ['dragonfighters.equipWeaponIdx', 'dragonfighters.equipArmorIdx', 'dragonfighters.equipShieldIdx', 'dragonfighters.allyEquip'];
const KINDS = ['weapon', 'armor', 'shield'];

/* セーブ (種) */
const BASE_LS = { 'dragonfighters.xp': '6000', 'dragonfighters.prologueSeen': '1' };
const seed = (cls, extra) => ({ ls: Object.assign({ 'dragonfighters.partyComposition': J([cls]) }, BASE_LS, extra || {}),
  ss: { 'dragonfighters.partyComposition': J([cls]) } });
/* 戦士 (頭): 武器 2 (+1) / 防具 1 (+1) / 盾 1 を装備、高水位は武器 2・防具 2・盾 1 */
const SEED_W = seed('warrior', { 'dragonfighters.weaponIdx': '2', 'dragonfighters.armorIdx': '2', 'dragonfighters.shieldIdx': '1',
  'dragonfighters.equipWeaponIdx': '2', 'dragonfighters.equipArmorIdx': '1', 'dragonfighters.equipShieldIdx': '1' });
/* 魔法使い (頭でない) */
const SEED_M = seed('mage', { 'dragonfighters.weaponIdx': '2', 'dragonfighters.armorIdx': '1', 'dragonfighters.shieldIdx': '0' });
/* ドワーフ + 戦斧 (所持 tier1) + 盾 1 (K2) */
const SEED_D = seed('dwarf', { 'dragonfighters.weaponIdx': '1', 'dragonfighters.armorIdx': '0', 'dragonfighters.shieldIdx': '1',
  'dragonfighters.allyEquip': J({ dwarf: { weapon: 0, armor: 0, shield: 1 } }) });
/* gated を含むセーブ (高水位 5 = gated 3/4/5 の上まで・所持の名前はフロストブランドだけ) */
const GATED = { 'dragonfighters.weaponIdx': '5', 'dragonfighters.armorIdx': '2', 'dragonfighters.shieldIdx': '1',
  'dragonfighters.equipWeaponIdx': '2', 'dragonfighters.equipArmorIdx': '1', 'dragonfighters.equipShieldIdx': '1',
  'dragonfighters.ownedEquip': J({ weapons: [0, 1, 2], armors: [0, 1, 2], shields: [0, 1], _hwm: { weapons: 5, armors: 2, shields: 1 } }),
  'dragonfighters.ownedGatedNames': J(['フロストブランド']) };
const SEED_TV = seed('warrior', GATED);
const SEED_PARITY = { warrior: seed('warrior', GATED), rogue: seed('rogue', GATED) };
/* 撤退 (3c): 戦士、武器 2 を装備・高水位 2 */
const SEED_R = seed('warrior', { 'dragonfighters.weaponIdx': '2', 'dragonfighters.armorIdx': '1', 'dragonfighters.shieldIdx': '1',
  'dragonfighters.equipWeaponIdx': '2', 'dragonfighters.equipArmorIdx': '1', 'dragonfighters.equipShieldIdx': '1' });
/* 宝箱 (3d): 戦士、武器 1・高水位 1 (宝箱で 2 が出る) */
const SEED_H = seed('warrior', { 'dragonfighters.weaponIdx': '1', 'dragonfighters.armorIdx': '1', 'dragonfighters.shieldIdx': '1',
  'dragonfighters.equipWeaponIdx': '1', 'dragonfighters.equipArmorIdx': '1', 'dragonfighters.equipShieldIdx': '1',
  'dragonfighters.ownedEquip': J({ weapons: [0, 1], armors: [0, 1], shields: [0, 1], _hwm: { weapons: 1, armors: 1, shields: 1 } }) });
const SEED_F = seed('warrior', { 'dragonfighters.weaponIdx': '2', 'dragonfighters.equipWeaponIdx': '2' });
const SEED_PLAIN = seed('dwarf', {});

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const I = 'index.html', TVN = 'tavern.html', PS = 'js/player-sheet.js';
const SNAP = [I, TVN, PS];
const PRISTINE = {};
for (const f of SNAP) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[I].indexOf('window.__sheetEquip = {') < 0) vetFail('配信する index.html に window.__sheetEquip が無い (#89 項目2a より前のツリーで走らせている)');
if (PRISTINE[TVN].indexOf('window.__sheetEquipTV') < 0) vetFail('配信する tavern.html に window.__sheetEquipTV が無い (#89 項目2b より前のツリーで走らせている)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。⚠ 置換は 1 行の中だけ (行数不変)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const CANEDIT_LINE = '      if (encounterActive || encounterRunning) return { ok: false, reason: "戦闘中は装備を変えられない" };';
const MUTATIONS = {
  /* 罠 A: 前回の差分を引かずに applyAllyEquipment を呼ぶ */
  stack: [{ file: I, from: '        h.dmgBonus = (h.dmgBonus || 0) - (h._dmgEnhDelta || 0); h.ac = (h.ac || 0) - (h._acEnhDelta || 0);',
    to: '        /* ★変異stack */ void 0;' }],
  /* 罠 B-1: 帰還時の equip*Idx を Math.max のまま */
  maxmerge: [{ file: I, from: '        equipWeaponIdx: currentWeaponIndex, equipArmorIdx: currentArmorIndex, equipShieldIdx: currentShieldIndex,',
    to: '        equipWeaponIdx: w, equipArmorIdx: a, equipShieldIdx: s, /* ★変異maxmerge */' }],
  /* 罠 B-2: 高水位を max(current, startedWith) だけで書く */
  hwmloss: [{ file: I, from: '      const hwm = (cur, runMax, started, key) => Math.max(cur, runMax, started, readStoredIdx(key));',
    to: '      const hwm = (cur, runMax, started, key) => Math.max(cur, started); /* ★変異hwmloss */' }],
  /* 罠 C: 変更できる条件を表示のフェーズだけに */
  phaseonly: [{ file: I, from: CANEDIT_LINE,
    to: '      if (currentPhase === "combat") return { ok: false, reason: "戦闘中は装備を変えられない" }; /* ★変異phaseonly */' }],
  /* 変更できる条件を常に真に */
  combatopen: [{ file: I, from: CANEDIT_LINE,
    to: '      if (false) return { ok: false, reason: "戦闘中は装備を変えられない" }; /* ★変異combatopen */' }],
  /* ダンジョン側で両手武器の規則を通さない */
  twohand: [{ file: I, from: '      return dfWeaponLocksShield(w);', to: '      return false; /* ★変異twohand */' }],
  /* gated を段番号 (高水位以下) で所持扱いにする。⚠ gated の行を消すだけだと空振り (段の初期化でも gated を飛ばすため・申し送り 2a) */
  ownedleak: [{ file: I, from: '      if (item && item.gated) return dfSheetGatedOwned().includes(item.name);',
    to: '      if (item && item.gated) return dfSheetHwm(DF_SHEET_SLOT[kind]) >= (tier | 0); /* ★変異ownedleak */' }],
  /* 酒場で付け替えた後に引き出しを描き直さない */
  tavernstale: [{ file: TVN, from: '    if (pmDrawerIdx >= 0) pmRenderDrawer(pmDrawerIdx);', to: '    /* ★変異tavernstale */ void 0;' }],
  /* 体の提供関数を CLASS_DEFS の武器名のまま */
  oldname: [{ file: I, from: '          const eqv = (SHEET_EQUIP_ON && typeof dfSheetBodyEquip === "function") ? dfSheetBodyEquip(src) : null;',
    to: '          const eqv = null; /* ★変異oldname */' }],
  /* ボタンの文字を「📜 シート」へ戻す */
  label: [{ file: PS, from: '    btnEl.textContent = "📜 キャラクターシート";', to: '    btnEl.textContent = "📜 シート"; /* ★変異label */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-3)。 */
const NEG_EXPECT = {
  stack:       ['(1c)'],
  maxmerge:    ['(3c)'],
  hwmloss:     ['(3d)'],
  /* (2a) も赤 = runEncounter は encounterActive=true → dfSheetRefresh() → setPhase("combat") の順 (同期) なので、
     描き直しの時点ではまだ explore 表示 = 開いたままのシートが実戦闘の間ずっと押せるまま (実戦闘の標本 21/21 が押せる) */
  phaseonly:   ['(2a)', '(2b)'],
  /* (2b) も赤 = 合成の rest 表示でも canEdit が真 */
  combatopen:  ['(2a)', '(2b)'],
  twohand:     ['(1d)'],
  ownedleak:   ['(3a)'],
  tavernstale: ['(1e)'],
  /* (1b) も赤 = eqv=null は §2-9 の AC (ac: eqv ? eqv.ac : st.ac) まで素の値へ戻すので、シートの AC 欄 ≠ currentPlayerAc() */
  oldname:     ['(1b)', '(4a)'],
  label:       ['(5a)'],
};
/* 変異 → 時機しだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = { stack: [], maxmerge: [], hwmloss: [], phaseonly: [], combatopen: [], twohand: [], ownedleak: [], tavernstale: [], oldname: [], label: [] };
/* 依頼書 §8 の予想 (記録用。実走と違う所はログに出す) */
const NEG_PREDICTED = {
  stack: ['(1c)'], maxmerge: ['(3c)'], hwmloss: ['(3d)'], phaseonly: ['(2b)'], combatopen: ['(2a)'], twohand: ['(1d)'],
  ownedleak: ['(3a)'], tavernstale: ['(1e)'], oldname: ['(4a)'], label: ['(5a)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 10) vetFail('変異は 10 本まで (ポート 10607〜10616)');
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
    /* ⭐ 同じ行を共有する変異 (phaseonly / combatopen) があるので、健在チェックは原本 (PRISTINE) に対して行う (#56) */
    const c = countOf(PRISTINE[e.file], e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + e.file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
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
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本でちょうど 1 箇所・行数不変・他ドライバとアンカーの重なり 0');

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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(0e)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(5a)', '(5b)', '(6a)'];
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
async function openPage(browser, port, file, query, sd, view) {
  const page = await browser.newPage();
  const v = view || { width: 390, height: 844, mobile: true };
  page.on('pageerror', (e) => PAGE_ERRS.push(file + (query || '') + ' ' + v.width + 'x' + v.height + ': ' + String((e && e.message) || e).slice(0, 200)));
  page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
  await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: 1, isMobile: !!v.mobile, hasTouch: !!v.mobile });
  await page.evaluateOnNewDocument((s) => {
    try {
      if (sessionStorage.getItem('__v89Seeded')) return;
      localStorage.clear();
      for (const k in s.ls) localStorage.setItem(k, s.ls[k]);
      sessionStorage.clear();
      for (const k in (s.ss || {})) sessionStorage.setItem(k, s.ss[k]);
      sessionStorage.setItem('__v89Seeded', '1');
    } catch (e) {}
  }, { ls: sd.ls, ss: sd.ss || {} });
  await page.goto('http://127.0.0.1:' + port + '/' + file + (query || ''), { waitUntil: 'load', timeout: 60000 });
  await waitReady(page, file);
  return page;
}
async function waitReady(page, file) {
  const cond = file === I ? 'window.DFSheet && window.__sheetEquip && typeof heroIsHead !== "undefined"'
    : file === TVN ? 'window.DFSheet && window.__sheetEquipTV && window.__equipTV' : '!!window.DFSheet';
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
async function sheetInfo(page) {
  return page.evaluate(() => {
    const S = window.DFSheet;
    const btn = document.getElementById('dfSheetBtn');
    const t = document.getElementById('dfSheetTitle');
    const sec = document.getElementById('dfSheetSecEquip');
    const q = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));
    const rv = (k) => { const e = document.querySelector('[data-stat="' + k + '"] .rv') || document.querySelector('[data-stat="' + k + '"] .v'); return e ? e.textContent.trim() : null; };
    const ed = sec ? sec.querySelector('[data-equip-edit]') : null;
    const ws = document.querySelector('[data-stat="weapon"] .rs');
    return {
      btnText: btn ? btn.textContent : null, title: t ? t.textContent : null,
      hasProvider: !!(S && S.hasEquipProvider && S.hasEquipProvider()), open: !!(S && S.isOpen && S.isOpen()),
      secInDom: !!sec, edit: ed ? ed.getAttribute('data-equip-edit') : null,
      reason: q('#dfSheetSecEquip [data-equip-reason]').map((e) => e.textContent),
      lock: q('#dfSheetSecEquip [data-equip-lock]').map((e) => e.getAttribute('data-equip-lock') + ':' + e.textContent),
      opts: q('.dfSheetEquipOpt').map((e) => ({ kind: e.getAttribute('data-equip-kind'), idx: +e.getAttribute('data-equip-idx'),
        off: e.classList.contains('off') || e.getAttribute('aria-disabled') === 'true', name: (e.querySelector('.en') || e).textContent })),
      cur: { weapon: rv('equip_weapon'), armor: rv('equip_armor'), shield: rv('equip_shield') },
      atkWeapon: rv('weapon'), atkArmor: ws ? ws.textContent.trim().replace(/^防具\s*/, '') : null, atk: rv('atkBonus'), ac: rv('ac'),
    };
  });
}
async function tapOpt(page, kind, idx) {
  const sel = '.dfSheetEquipOpt[data-equip-kind="' + kind + '"][data-equip-idx="' + idx + '"]';
  const ok = await page.evaluate((q) => { const el = document.querySelector(q); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; }, sel);
  if (!ok) return { tapped: false, inside: false };
  await sleep(450);
  const pt = await page.evaluate((q) => {
    const el = document.querySelector(q);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const h = document.elementFromPoint(x, y);
    const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0 };   // ⚠ CDP の touch 座標は visual viewport 基準
    return { x: x - vv.offsetLeft, y: y - vv.offsetTop, inside: !!(h && el.contains(h)) };
  }, sel);
  await page.touchscreen.tap(pt.x, pt.y);
  await sleep(450);
  return { tapped: true, inside: pt.inside };
}
/* ダンジョン: compact の #partyPanel のドロワーを開いてからボタンを実際に押す (押せなければ DFSheet.open() で代替し、それを記録) */
async function openSheetIndex(page) {
  const r = await page.evaluate(() => {
    const t = document.getElementById('partyToggleBtn');
    if (!t) return null; const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width };
  });
  if (r && r.w > 0) { await page.touchscreen.tap(r.x, r.y); await sleep(600); }
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
  if (b && b.onTop) { await page.touchscreen.tap(b.x, b.y); await sleep(500); via = 'tap'; }
  if (!(await page.evaluate(() => window.DFSheet.isOpen()))) { await page.evaluate(() => window.DFSheet.open()); via += '+open()'; await sleep(300); }
  return via;
}
/* 撤退: 本物の #retreatBtn の click リスナ (dfReturnEquipValues → localStorage → dfReturnPage へ遷移) */
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
  await sleep(600);
  return { ok: navigated, url: page.url() };
}
async function gotoTavern(page, port) {
  await page.goto('http://127.0.0.1:' + port + '/' + TVN, { waitUntil: 'load', timeout: 60000 });
  await waitReady(page, TVN);
}

/* (5b) 押せる物との重なり — ⛔ 本番 autoPlace の判定を呼ばない。規則はここに独立に書く (申し送り 2a の規則) */
const CLICK_SEL = 'button, a[href], [onclick], [role="button"], input, select, textarea, summary, label[for]';
async function measurePlacement(page) {
  return page.evaluate((SEL) => {
    const btn = document.getElementById('dfSheetBtn');
    const ov = document.getElementById('dfSheetOverlay');
    const host = btn ? btn.parentElement : null;
    const vis = (el) => {
      if (!el.getClientRects().length) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0 || cs.pointerEvents === 'none') return false;
      for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) === 0) return false; }
      return true;
    };
    const skip = (el) => el === btn || (btn && btn.contains(el)) || (btn && el.contains(btn)) || (ov && ov.contains(el)) || el === document.body || el === document.documentElement;
    const set = new Set();
    for (const el of document.querySelectorAll(SEL)) if (!skip(el) && vis(el)) set.add(el);
    for (const el of document.querySelectorAll('body *')) {
      if (skip(el) || set.has(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.cursor === 'pointer' && vis(el)) { const r0 = el.getBoundingClientRect(); if (r0.width * r0.height > 0 && r0.width * r0.height < innerWidth * innerHeight * 0.5) { set.add(el); continue; } }
      if ((cs.position === 'fixed' || cs.position === 'sticky') && vis(el)) {
        const r = el.getBoundingClientRect();
        if (r.width * r.height > 0 && !(r.width >= innerWidth * 0.98 && r.height >= innerHeight * 0.9)) set.add(el);   // 全画面の幕は除く
      }
    }
    const rects = [];
    for (const el of set) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) rects.push({ id: String(el.id || el.className || el.tagName).slice(0, 40), l: r.left, t: r.top, r: r.right, b: r.bottom }); }
    const b = btn.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const inView = cy >= 0 && cy <= innerHeight;
    const e = inView ? document.elementFromPoint(cx, cy) : null;
    const hr = host ? host.getBoundingClientRect() : null;
    return { vw: document.documentElement.clientWidth, vh: innerHeight, sy: scrollY, docH: document.documentElement.scrollHeight,
      btn: { l: b.left, t: b.top, r: b.right, b: b.bottom }, rects, host: host ? (host.id || host.tagName) : null,
      hostRect: hr ? { l: hr.left, t: hr.top, r: hr.right, b: hr.bottom } : null, place: btn.getAttribute('data-place'),
      pos: getComputedStyle(btn).position, centerOnTop: !inView || !!(e && (e === btn || btn.contains(e))),
      scrollW: btn.scrollWidth, clientW: btn.clientWidth };
  }, CLICK_SEL);
}
const ovArea = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/* ══════════════════════════════════════════════════════════════════════════════
 * 判定 (素の assert と (6a) が同じ本体を共有する — 「スイッチを外すと赤」は assert 本体を共有しないと空振りする)
 * ══════════════════════════════════════════════════════════════════════════════ */
function judge3c(x) {
  return !!x && x.retreatOk && x.ls['dragonfighters.equipWeaponIdx'] === String(x.down) && x.ls['dragonfighters.weaponIdx'] === String(x.hwm0)
    && x.tvSel && x.tvSel.weapon === x.down && x.tvSheetCur === x.downName && !!x.downName;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════════ */
async function runSuite(browser, port) {
  const R = mkResults();
  PAGE_ERRS.length = 0;
  const failRest = (ids, e) => { for (const id of ids) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.stack) || e).slice(0, 300)); };
  const sect = async (ids, fn) => { try { await fn(); } catch (e) { console.log('  ⛔ 例外 [' + ids.join(',') + ']: ' + String((e && e.stack) || e).slice(0, 500)); failRest(ids, e); } };
  const A0 = {};          // (0a) の材料
  const HEAD = {};        // (0b)(1a)(1b)(1c) の材料
  const S4 = [];          // (4a) の標本
  const S3b = [];         // (3b) の標本
  const S5a = [];         // (5a) の標本
  const S2a = {}, S2b = {};

  /* ── W: 戦士 = 頭 ── */
  await sect(['(1a)', '(1b)', '(2a)', '(2b)'], async () => {
    const page = await openPage(browser, port, I, '', SEED_W);
    HEAD.W = await page.evaluate(() => ({ head: heroIsHead, ctx: window.__sheetEquip.ctx() }));
    const ls0 = await lsDump(page);
    const via = await openSheetIndex(page);
    const ls1 = await lsDump(page);
    S3b.push({ arm: 'W 開く', diff: lsDiff(ls0, ls1), open: true });
    let si = await sheetInfo(page);
    A0.index = { via, prov: si.hasProvider, sec: si.secInDom, edit: si.edit, perKind: KINDS.map((k) => si.opts.filter((o) => o.kind === k).length) };
    S5a.push({ page: 'index', btn: si.btnText, title: si.title });
    S4.push({ arm: 'W 初期', w: si.atkWeapon, a: si.atkArmor, cw: si.cur.weapon, ca: si.cur.armor });
    const pre = await page.evaluate(() => ({ ac: currentPlayerAc(), atk: currentPlayerAtkBonus() }));
    const lsA = await lsDump(page);
    const t1 = await tapOpt(page, 'weapon', 1);
    const post = await page.evaluate(() => ({ cur: window.__sheetEquip.current(), ac: currentPlayerAc(), atk: currentPlayerAtkBonus(), name: weapons[currentWeaponIndex].name, want: weapons[1].name }));
    const lsB = await lsDump(page);
    si = await sheetInfo(page);
    S4.push({ arm: 'W 武器 1', w: si.atkWeapon, a: si.atkArmor, cw: si.cur.weapon, ca: si.cur.armor });
    HEAD.W1a = { tap: t1, ls: lsB['dragonfighters.equipWeaponIdx'], cur: post.cur.weapon, runtimeName: post.name, sheet: si.cur.weapon, want: post.want };
    const t2 = await tapOpt(page, 'armor', 2);
    const postA = await page.evaluate(() => ({ ac: currentPlayerAc(), cur: window.__sheetEquip.current(), name: armors[currentArmorIndex].name }));
    const lsC = await lsDump(page);
    si = await sheetInfo(page);
    S4.push({ arm: 'W 防具 2', w: si.atkWeapon, a: si.atkArmor, cw: si.cur.weapon, ca: si.cur.armor });
    S3b.push({ arm: 'W 付け替え 2 回', diff: lsDiff(lsA, lsC), open: false });
    HEAD.W1b = { pre, post: { atk: post.atk }, postA, sheetAc: si.ac, lsArmor: lsC['dragonfighters.equipArmorIdx'], tap2: t2, sheetArmor: si.cur.armor };
    /* (2a) 合成: 戦闘中 (encounterActive + combat 表示 = 実戦闘と同じ 2 つ) */
    const lsP = await lsDump(page);
    await page.evaluate(() => { encounterActive = true; currentPhase = 'combat'; window.DFSheet.render(); });
    si = await sheetInfo(page);
    const firstOpt = si.opts.find((o) => o.kind === 'weapon');
    const tc = firstOpt ? await tapOpt(page, 'weapon', firstOpt.idx) : { tapped: false };
    const direct = await page.evaluate(() => { const o = window.__sheetEquip.ownedOptions('weapon'); return o.length ? window.__sheetEquip.equip('weapon', o[0]) : { ok: 'no-option' }; });
    const lsQ = await lsDump(page);
    const curQ = await page.evaluate(() => window.__sheetEquip.current());
    S2a.synth = { edit: si.edit, nOpts: si.opts.length, allOff: si.opts.length > 0 && si.opts.every((o) => o.off), reason: si.reason, tap: tc, direct, diff: lsDiff(lsP, lsQ), curWeapon: curQ.weapon };
    /* (2b) 合成: 勝った直後 = rest 表示だが encounterActive はまだ真 */
    await page.evaluate(() => { encounterActive = true; currentPhase = 'rest'; window.DFSheet.render(); });
    si = await sheetInfo(page);
    const lsR0 = await lsDump(page);
    const restRes = await page.evaluate(() => { const c = window.__sheetEquip.canEdit(); const o = window.__sheetEquip.ownedOptions('weapon'); const e = o.length ? window.__sheetEquip.equip('weapon', o[0]) : { ok: 'no-option' }; return { can: c, eq: e }; });
    const lsR1 = await lsDump(page);
    S2b.synth = { phase: 'rest', edit: si.edit, can: restRes.can, eq: restRes.eq, diff: lsDiff(lsR0, lsR1) };
    await page.evaluate(() => { encounterActive = false; currentPhase = 'explore'; window.DFSheet.render(); });
    /* 開閉だけでは書かない (閉じる → 開く → 閉じる) */
    const lsO0 = await lsDump(page);
    await page.evaluate(() => { window.DFSheet.close(); window.DFSheet.open(); window.DFSheet.close(); });
    const lsO1 = await lsDump(page);
    S3b.push({ arm: 'W 開閉', diff: lsDiff(lsO0, lsO1), open: true });
    await page.close();
  });

  /* ── M: 魔法使い = 頭でない ── */
  await sect(['(1c)'], async () => {
    const page = await openPage(browser, port, I, '', SEED_M);
    HEAD.M = await page.evaluate(() => ({ head: heroIsHead, ctx: window.__sheetEquip.ctx() }));
    await openSheetIndex(page);
    let si = await sheetInfo(page);
    S4.push({ arm: 'M 初期', w: si.atkWeapon, a: si.atkArmor, cw: si.cur.weapon, ca: si.cur.armor });
    const h0 = await page.evaluate(() => window.__sheetEquip.hero());
    const lsA = await lsDump(page);
    const t1 = await tapOpt(page, 'weapon', 2);
    const h1 = await page.evaluate(() => window.__sheetEquip.hero());
    const lsB = await lsDump(page);
    si = await sheetInfo(page);
    S4.push({ arm: 'M 武器 2', w: si.atkWeapon, a: si.atkArmor, cw: si.cur.weapon, ca: si.cur.armor });
    let ae = null; try { ae = JSON.parse(lsB['dragonfighters.allyEquip'] || 'null'); } catch (e) {}
    const want = await page.evaluate(() => ALLY_EQUIP_POOLS.mage.weapons[2].name);
    const sel = await page.evaluate(() => window.__sheetEquip.allySel().mage);
    HEAD.M1a = { tap: t1, ls: ae && ae.mage, sel, runtimeName: h1 && h1.weaponName, sheet: si.cur.weapon, want };
    const t2 = await tapOpt(page, 'weapon', 0);
    const t3 = await tapOpt(page, 'armor', 1);
    const h2 = await page.evaluate(() => window.__sheetEquip.hero());
    si = await sheetInfo(page);
    S4.push({ arm: 'M 武器 0 防具 1', w: si.atkWeapon, a: si.atkArmor, cw: si.cur.weapon, ca: si.cur.armor });
    const t4 = await tapOpt(page, 'armor', 0);
    const h3 = await page.evaluate(() => window.__sheetEquip.hero());
    const lsC = await lsDump(page);
    si = await sheetInfo(page);
    S4.push({ arm: 'M 戻し', w: si.atkWeapon, a: si.atkArmor, cw: si.cur.weapon, ca: si.cur.armor });
    S3b.push({ arm: 'M 付け替え 4 回', diff: lsDiff(lsA, lsC), open: false });
    HEAD.M1c = { h0, h1, h2, h3, taps: [t1, t2, t3, t4].map((t) => t.tapped && t.inside) };
    await page.close();
  });
  await sect(['(0b)'], async () => {
    R.check('(0b)', '主人公が頭 (戦士 heroIsHead=true) と頭でない (魔法使い heroIsHead=false) が実際に両方起きた',
      HEAD.W && HEAD.W.head === true && HEAD.W.ctx && HEAD.W.ctx.mode === 'head' && HEAD.W.ctx.cls === 'warrior'
        && HEAD.M && HEAD.M.head === false && HEAD.M.ctx && HEAD.M.ctx.mode === 'ally' && HEAD.M.ctx.cls === 'mage', { W: HEAD.W, M: HEAD.M });
  });
  await sect(['(1a)'], async () => {
    const w = HEAD.W1a, m = HEAD.M1a;
    R.check('(1a)', '探索中に武器を実タップで付け替え → localStorage の選択・ランタイム・シートの今の装備が同じ品 (頭 / 頭でない)',
      !!w && w.tap.tapped && w.tap.inside && w.ls === '1' && w.cur === 1 && w.runtimeName === w.want && w.sheet === w.want
        && !!m && m.tap.tapped && m.tap.inside && !!m.ls && m.ls.weapon === 2 && !!m.sel && m.sel.weapon === 2 && m.runtimeName === m.want && m.sheet === m.want, { W: w, M: m });
  });
  await sect(['(1b)'], async () => {
    const b = HEAD.W1b;
    R.check('(1b)', '頭: 武器 +1 → 素で命中 −1 / 防具 +1 → +2 で AC +1・シートの AC 欄も同じ値・localStorage の防具 = 2',
      !!b && b.pre.atk - b.post.atk === 1 && b.postA.ac - b.pre.ac === 1 && b.sheetAc === String(b.postA.ac) && b.lsArmor === '2'
        && b.postA.cur.armor === 2 && b.sheetArmor === b.postA.name, b);
  });
  await sect(['(1c)'], async () => {
    const c = HEAD.M1c;
    R.check('(1c)', '頭でない: 品 A → B → A で heroRef.ac / dmgBonus が最初の値へぴったり戻る (B では実際に変わっている)',
      !!c && c.taps.every(Boolean) && c.h1.dmgBonus - c.h0.dmgBonus === 1 && c.h2.ac - c.h0.ac === 1 && c.h2.dmgBonus === c.h0.dmgBonus
        && c.h3.ac === c.h0.ac && c.h3.dmgBonus === c.h0.dmgBonus && c.h3.weaponName === c.h0.weaponName && c.h3.armorName === c.h0.armorName, c);
  });

  /* ── D / DT: ドワーフ + 戦斧 (両手武器) ── */
  await sect(['(1d)'], async () => {
    const out = {};
    for (const [nm, file] of [['index', I], ['tavern', TVN]]) {
      const page = await openPage(browser, port, file, '', SEED_D);
      if (file === I) await openSheetIndex(page); else await pressSheetBtn(page);
      const before = await sheetInfo(page);
      const t = await tapOpt(page, 'weapon', 1);
      const si = await sheetInfo(page);
      const st = await page.evaluate((isIdx) => {
        const sel = isIdx ? window.__sheetEquip.allySel().dwarf : window.__sheetEquipTV.sel();
        const lsAe = JSON.parse(localStorage.getItem('dragonfighters.allyEquip') || 'null');
        const tryS = isIdx ? window.__sheetEquip.equip('shield', 1) : window.__sheetEquipTV.equip('shield', 1);
        return { sel, lsAe: lsAe && lsAe.dwarf, tryS };
      }, file === I);
      out[nm] = { tap: t, shieldBefore: before.cur.shield, sel: st.sel, lsAe: st.lsAe, curShield: si.cur.shield, lock: si.lock,
        shieldOpts: si.opts.filter((o) => o.kind === 'shield'), tryS: st.tryS };
      await page.close();
    }
    const ok = (x) => !!x && x.tap.tapped && x.tap.inside && x.shieldBefore !== 'なし' && x.sel.weapon === 1 && x.sel.shield === 0 && !!x.lsAe && x.lsAe.shield === 0
      && x.curShield === 'なし' && x.lock.length === 1 && x.shieldOpts.length >= 1 && x.shieldOpts.every((o) => o.off) && !!x.tryS && x.tryS.ok === false;
    R.check('(1d)', '両手武器 (戦斧) → 盾「なし」・盾の列が灰色・塞がりの理由・盾の直接装備は拒否 (ダンジョンと酒場)', ok(out.index) && ok(out.tavern), out);
  });

  /* ── TV: 酒場の引き出し + カード ── */
  await sect(['(1e)'], async () => {
    const page = await openPage(browser, port, TVN, '', SEED_TV);
    const via = await pressSheetBtn(page);
    const si = await sheetInfo(page);
    A0.tavern = { via, prov: si.hasProvider, sec: si.secInDom, edit: si.edit, perKind: KINDS.map((k) => si.opts.filter((o) => o.kind === k).length) };
    S5a.push({ page: 'tavern', btn: si.btnText, title: si.title });
    await page.evaluate(() => window.DFSheet.close());
    await page.evaluate(() => {
      const mk = (ck, isHero, name) => ({ classKey: ck, isHero: !!isHero, name: name, zone: PARTY_ZONES[ck], variant: 0, level: 10 });
      selection.partyMembers = [mk('warrior', true, ''), mk('mage', false, '仲間1'), mk('cleric', false, '仲間2'), mk('rogue', false, '仲間3')];
      Promise.resolve(window.__pmTest.play(scenarios[0])).catch(() => {});
    });
    for (let i = 0; i < 200; i++) { if (await page.evaluate(() => pmCols.length > 0 && pmOrdered.length > 0)) break; await sleep(100); }
    await sleep(4000);
    const hi = await page.evaluate(() => { const i = pmOrdered.findIndex((m) => m && m.isHero); pmOpenDrawer(i); return i; });
    await sleep(500);
    const snap = () => page.evaluate((hi) => {
      const col = pmCols[hi] && pmCols[hi].el;
      const row = col ? Array.prototype.slice.call(col.querySelectorAll('.pmEquipRow')).find((r) => /武器/.test(r.textContent)) : null;
      const sum = document.querySelector('#pmDrawerEquipSummary .equipSlotChip .slotVal');
      return { card: row ? row.querySelector('.pmEquipVal').textContent : null, drawer: sum ? sum.textContent : null, drawerIdx: window.__sheetEquipTV.drawerIdx() };
    }, hi);
    const d0 = await snap();
    await page.evaluate(() => window.DFSheet.open());
    await sleep(300);
    const t = await tapOpt(page, 'weapon', 1);
    const d1 = await snap();
    const names = await page.evaluate(() => ({ n1: CHAR_EQUIP.warrior.weapons[1].name, n2: CHAR_EQUIP.warrior.weapons[2].name, sel: window.__sheetEquipTV.sel() }));
    const v = { hi, tap: t, d0, d1, names };
    R.check('(1e)', '酒場で引き出しを開いたままシートから付け替え → 引き出しの「装備中」とカードが同じ新しい品 (付け替え前は前の品)',
      hi >= 0 && t.tapped && t.inside && d1.drawerIdx === hi && names.sel.weapon === 1 && d0.drawer === names.n2 && !!d0.card && d0.card.indexOf(names.n2) >= 0
        && d1.drawer === names.n1 && !!d1.card && d1.card.indexOf(names.n1) >= 0 && d1.card.indexOf(names.n2) < 0, v);
    await page.close();
  });
  await sect(['(0a)'], async () => {
    const ok = (x) => !!x && x.prov && x.sec && x.edit === '1' && x.perKind.every((n) => n >= 1);
    R.check('(0a)', '2 ページとも装備の供給口あり・装備区画が DOM・武器/防具/盾の選べる品が各 1 つ以上', ok(A0.index) && ok(A0.tavern), A0);
  });

  /* ── P: 所持の突き合わせ (同じ localStorage) ── */
  await sect(['(3a)'], async () => {
    const out = {};
    for (const cls of Object.keys(SEED_PARITY)) {
      const sd = SEED_PARITY[cls];
      let page = await openPage(browser, port, I, '', sd);
      await page.evaluate(() => window.DFSheet.open());
      await sleep(300);
      const ix = await page.evaluate((KINDS) => {
        const c = window.__sheetEquip.ctx();
        const pools = c.cls === 'warrior' ? { weapons, armors, shields } : ALLY_EQUIP_POOLS[c.cls];
        const SK = { weapon: 'weapons', armor: 'armors', shield: 'shields' };
        const o = { cls: c.cls, sel: c.sel, owned: {}, gated: {}, options: {}, dom: {} };
        for (const k of KINDS) {
          const arr = pools[SK[k]];
          o.owned[k] = arr.map((it, t) => window.__sheetEquip.isOwned(k, t, it));
          o.gated[k] = arr.map((it) => !!it.gated);
          o.options[k] = window.__sheetEquip.ownedOptions(k);
          o.dom[k] = Array.prototype.slice.call(document.querySelectorAll('.dfSheetEquipOpt[data-equip-kind="' + k + '"]')).map((e) => +e.getAttribute('data-equip-idx'));
        }
        return o;
      }, KINDS);
      const lsIx = await lsDump(page);
      await page.close();
      page = await openPage(browser, port, TVN, '', sd);
      const tv = await page.evaluate((cls, KINDS) => {
        const SK = { weapon: 'weapons', armor: 'armors', shield: 'shields' };
        const p = window.__equipTV.charEquip()[cls];
        const o = { owned: {} };
        for (const k of KINDS) o.owned[k] = p[SK[k]].map((it, t) => window.__equipTV.isOwnedFor(cls, k, t));
        return o;
      }, ix.cls, KINDS);
      await page.close();
      const per = {};
      for (const k of KINDS) {
        const want = ix.owned[k].map((v, t) => (v && t !== ix.sel[k]) ? t : -1).filter((t) => t >= 0);
        per[k] = { ix: ix.owned[k].map(Number).join(''), tv: tv.owned[k].map(Number).join(''), opt: ix.options[k], dom: ix.dom[k],
          ok: J(ix.owned[k]) === J(tv.owned[k]) && J(ix.options[k]) === J(want) && J(ix.dom[k]) === J(want) };
      }
      const seedKeys = ['dragonfighters.weaponIdx', 'dragonfighters.armorIdx', 'dragonfighters.shieldIdx', 'dragonfighters.ownedEquip', 'dragonfighters.ownedGatedNames'];
      const sameSeed = seedKeys.every((k) => lsIx[k] === sd.ls[k]);
      out[cls] = { cls: ix.cls, per, sameSeed, gw: ix.gated.weapon.map(Number).join(''), ownedGatedW: ix.owned.weapon.filter((v, t) => v && ix.gated.weapon[t]).length,
        unownedGatedW: ix.owned.weapon.filter((v, t) => !v && ix.gated.weapon[t]).length };
    }
    const w = out.warrior;
    R.check('(3a)', 'ダンジョンの所持判定 = 酒場の __equipTV.isOwnedFor (全段)・選べる品 = 所持 − 装備中・シートの DOM = 選べる品 (gated を含む同じセーブ。母集団: 戦士の gated 武器に所持と未所持が両方)',
      Object.keys(out).every((c) => out[c].sameSeed && out[c].cls === c && KINDS.every((k) => out[c].per[k].ok)) && !!w && w.ownedGatedW >= 1 && w.unownedGatedW >= 1, out);
  });

  /* ── F: 実戦闘 (開いたままのシートで標本) ── */
  await sect(['(0d)', '(2c)'], async () => {
    const page = await openPage(browser, port, I, '?autoplay=4', SEED_F);
    await page.evaluate(() => window.DFSheet.open());
    const t0 = Date.now();
    const samples = [];
    let fights = 0, backs = 0, prevFight = false, directDone = null;
    const probe = (doDirect) => page.evaluate((doDirect) => {
      const f = window.__sheetEquip.fight();
      const fight = !!(f.encounterActive || f.encounterRunning);
      const sec = document.querySelector('#dfSheetSecEquip [data-equip-edit]');
      const opts = Array.prototype.slice.call(document.querySelectorAll('.dfSheetEquipOpt'));
      const o = { fight, fa: f.encounterActive, phase: f.phase, edit: sec ? sec.getAttribute('data-equip-edit') : null,
        nOpts: opts.length, anyOff: opts.some((e) => e.classList.contains('off')), allOff: opts.length > 0 && opts.every((e) => e.classList.contains('off')),
        reason: Array.prototype.slice.call(document.querySelectorAll('#dfSheetSecEquip [data-equip-reason]')).map((e) => e.textContent).join('|'),
        open: window.DFSheet.isOpen(), over: !!((typeof gameOver !== 'undefined' && gameOver) || (typeof dungeonCleared !== 'undefined' && dungeonCleared)),
        can: window.__sheetEquip.canEdit().ok };
      if (doDirect && fight) {
        const snap = () => { const s = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('dragonfighters.') === 0) s[k] = localStorage.getItem(k); } return JSON.stringify(s); };
        const before = snap(); const cur0 = currentWeaponIndex;
        const op = window.__sheetEquip.ownedOptions('weapon');
        const res = op.length ? window.__sheetEquip.equip('weapon', op[0]) : { ok: 'no-option' };
        o.direct = { res, changedLs: snap() !== before, changedCur: currentWeaponIndex !== cur0, nOpt: op.length };
      }
      return o;
    }, doDirect);
    while (Date.now() - t0 < FIGHT_LIMIT_MS && backs < 1) {
      const r = await probe(!directDone);
      r.t = Date.now() - t0;
      if (r.direct) directDone = r.direct;
      samples.push(r);
      if (r.fight && !prevFight) fights++;
      if (!r.fight && prevFight) backs++;
      prevFight = r.fight;
      await sleep(100);
    }
    /* 戦闘が終わってから少し標本を足す (押せるに戻ったまま) */
    for (let i = 0; i < 5 && backs >= 1; i++) { const r = await probe(false); r.t = Date.now() - t0; samples.push(r); await sleep(150); }
    await page.close();
    const inF = samples.filter((s) => s.fight);
    const firstFightIdx = samples.findIndex((s) => s.fight);
    const after = samples.filter((s, i) => !s.fight && firstFightIdx >= 0 && i > firstFightIdx && !s.over);
    const restS = inF.filter((s) => s.fa && s.phase === 'rest');
    const trans = []; let last = null;
    for (const s of samples) { const k = (s.fight ? 'F' : 'E') + s.edit + '/' + s.phase; if (k !== last) { trans.push((s.t / 1000).toFixed(1) + 's ' + k); last = k; } }
    R.check('(0d)', '実戦闘が ' + (FIGHT_LIMIT_MS / 1000) + ' 秒以内に始まり探索へ戻った・開いたままのシートで戦闘中 / 戦闘後の標本が取れた',
      fights >= 1 && backs >= 1 && inF.length >= 3 && after.length >= 1 && samples.every((s) => s.open) && !!directDone, { fights, backs, nFight: inF.length, nAfter: after.length, direct: !!directDone, trans });
    S2a.real = { nFight: inF.length, bad: inF.filter((s) => s.edit !== '0' || !s.allOff || !/戦闘中/.test(s.reason) || s.can).length, direct: directDone };
    S2b.real = { nRest: restS.length, bad: restS.filter((s) => s.can || s.edit !== '0').length };
    R.check('(2c)', '実戦闘が終わって探索に戻ると、開いたままのシートの装備欄が押せるに戻る (開き直さない)',
      after.length >= 1 && after.every((s) => s.edit === '1' && s.nOpts >= 1 && !s.anyOff && s.can && s.open), { nAfter: after.length, bad: after.filter((s) => s.edit !== '1' || s.anyOff || !s.can).slice(0, 3), trans });
  });
  await sect(['(2a)', '(2b)'], async () => {
    const s = S2a.synth || {}, r = S2a.real || {};
    R.check('(2a)', '戦闘中: 合成 (encounterActive + combat) で全ボタン灰色・理由の行・実タップも直接 equip も何も書かない / 実戦闘の標本は常に灰色・戦闘中の直接 equip は {ok:false}',
      s.edit === '0' && s.allOff && !!s.reason && s.reason.some((x) => /戦闘中/.test(x)) && !!s.tap && s.tap.tapped && !!s.direct && s.direct.ok === false
        && !!s.diff && s.diff.length === 0 && s.curWeapon === 1
        && r.nFight >= 3 && r.bad === 0 && !!r.direct && !!r.direct.res && r.direct.res.ok === false && r.direct.nOpt >= 1 && !r.direct.changedLs && !r.direct.changedCur, { synth: s, real: r });
    const b = S2b.synth || {}, rb = S2b.real || {};
    R.check('(2b)', '勝った直後の rest 表示で encounterActive がまだ真の間も変えられない (合成 + 実戦闘で観測できた rest 標本)',
      b.edit === '0' && !!b.can && b.can.ok === false && !!b.eq && b.eq.ok === false && !!b.diff && b.diff.length === 0 && rb.bad === 0, { synth: b, real: rb });
  });

  /* ── R / R0: 撤退 → 酒場 (罠 B の 1) ── */
  const run3c = async (query) => {
    const page = await openPage(browser, port, I, query, SEED_R);
    const x = { query, down: 1, hwm0: 2 };
    if (query) {
      /* ?sheetequip=0 は装備区画が無い ⇒ 同じ付け替えを関数で当てる (供給口は登録されていなくても関数は在る) */
      await page.evaluate(() => window.DFSheet.open());
      await sleep(300);
      x.sec = await page.evaluate(() => !!document.getElementById('dfSheetSecEquip'));
      x.prov = await page.evaluate(() => window.DFSheet.hasEquipProvider());
      x.eq = await page.evaluate(() => window.__sheetEquip.equip('weapon', 1));
    } else {
      await openSheetIndex(page);
      x.tap = await tapOpt(page, 'weapon', 1);
    }
    x.before = await page.evaluate(() => window.__sheetEquip.current());
    const rt = await retreatNow(page);
    x.retreatOk = rt.ok; x.retreatUrl = rt.url; x.why = rt.why;
    x.ls = await lsDump(page);
    await gotoTavern(page, port);
    x.tvSel = await page.evaluate(() => window.__sheetEquipTV.sel());
    x.downName = await page.evaluate((d) => CHAR_EQUIP.warrior.weapons[d].name, x.down);
    await page.evaluate(() => window.DFSheet.open());
    await sleep(300);
    const si = await sheetInfo(page);
    x.tvSheetCur = si.cur.weapon;
    x.hiOwned = await page.evaluate(() => window.__equipTV.isOwnedFor('warrior', 'weapon', 2));
    await page.close();
    return x;
  };
  await sect(['(3c)'], async () => {
    const X = await run3c('');
    R.check('(3c)', 'シートで武器を 2 → 1 に下げて撤退 → 次の酒場で 1 が装備中 (localStorage・酒場の選択・酒場のシート) かつ高水位 2 は下がらない',
      !!X.tap && X.tap.tapped && X.tap.inside && X.before.weapon === 1 && judge3c(X) && X.hiOwned === true,
      { tap: X.tap, before: X.before, retreatOk: X.retreatOk, url: X.retreatUrl, equipW: X.ls['dragonfighters.equipWeaponIdx'], hwmW: X.ls['dragonfighters.weaponIdx'],
        tvSel: X.tvSel, tvSheetCur: X.tvSheetCur, want: X.downName, hiOwned: X.hiOwned, why: X.why });
  });

  /* ── H: 宝箱で上位品 → シートで下げて撤退 (罠 B の 2) ── */
  await sect(['(3d)'], async () => {
    const page = await openPage(browser, port, I, '', SEED_H);
    const pre = await page.evaluate(() => ({ cur: window.__sheetEquip.current(), hwm: localStorage.getItem('dragonfighters.weaponIdx') }));
    /* 本番の宝箱の開封関数に「武器」の中身を渡す (#87 で盤面の道中の宝箱は既定 0 個) */
    await page.evaluate(async () => { await discoverChest({ loot: { kind: 'weapon' }, el: null, opened: false }); });
    const got = await page.evaluate(() => ({ cur: window.__sheetEquip.current(), hwm: localStorage.getItem('dragonfighters.weaponIdx'), runMax: window.__sheetEquip.runMax() }));
    await openSheetIndex(page);
    const t = await tapOpt(page, 'weapon', 1);
    const down = await page.evaluate(() => window.__sheetEquip.current());
    const rt = await retreatNow(page);
    const ls = await lsDump(page);
    await gotoTavern(page, port);
    const tv = await page.evaluate(() => ({ owned2: window.__equipTV.isOwnedFor('warrior', 'weapon', 2), sel: window.__sheetEquipTV.sel(), opts: window.__sheetEquipTV.ownedOptions('weapon') }));
    await page.evaluate(() => window.DFSheet.open());
    await sleep(300);
    const si = await sheetInfo(page);
    const domW = si.opts.filter((o) => o.kind === 'weapon').map((o) => o.idx);
    await page.close();
    const v = { pre, got, tap: t, down, retreatOk: rt.ok, url: rt.url, equipW: ls['dragonfighters.equipWeaponIdx'], hwmW: ls['dragonfighters.weaponIdx'], tv, domW };
    R.check('(3d)', 'ラン中に宝箱で武器 1 → 2 を得てからシートで 1 に下げて撤退 → 酒場で 2 が所持・選べる品 (関数と DOM) に在る・装備中は 1',
      pre.cur.weapon === 1 && pre.hwm === '1' && got.cur.weapon === 2 && got.hwm === '2' && t.tapped && t.inside && down.weapon === 1 && rt.ok
        && v.equipW === '1' && v.hwmW === '2' && tv.owned2 === true && tv.sel.weapon === 1 && tv.opts.indexOf(2) >= 0 && domW.indexOf(2) >= 0, v);
  });

  /* ── (3b) 付け替えで書くキー ── */
  await sect(['(3b)'], async () => {
    const opens = S3b.filter((s) => s.open), swaps = S3b.filter((s) => !s.open);
    R.check('(3b)', '付け替えで変わるキーは ' + WRITE_KEYS.map((k) => k.replace('dragonfighters.', '')).join(' / ') + ' だけ (名指し)・開閉だけでは 0 本',
      opens.length >= 2 && opens.every((s) => s.diff.length === 0) && swaps.length >= 2 && swaps.every((s) => s.diff.length >= 1 && s.diff.every((k) => WRITE_KEYS.indexOf(k) >= 0)), S3b);
  });

  /* ── (4a) 体の表示 ── */
  await sect(['(4a)'], async () => {
    R.check('(4a)', '「攻撃 & 呪文発動」の武器名・防具名 = 装備区画の今の装備名 (付け替えの前後すべての状態で・頭 / 頭でない)',
      S4.length === 7 && S4.every((s) => !!s.cw && s.w === s.cw && s.a === s.ca) && new Set(S4.filter((s) => /^W/.test(s.arm)).map((s) => s.cw)).size >= 2, S4);
  });

  /* ── (6a) 撤退スイッチ ── */
  await sect(['(6a)'], async () => {
    const X0 = await run3c('?sheetequip=0');
    const page = await openPage(browser, port, TVN, '?sheetequip=0', SEED_TV);
    await page.evaluate(() => window.DFSheet.open());
    await sleep(300);
    const tvOff = await page.evaluate(() => ({ sec: !!document.getElementById('dfSheetSecEquip'), prov: window.DFSheet.hasEquipProvider(), on: window.__sheetEquipTV.on,
      title: (document.getElementById('dfSheetTitle') || {}).textContent }));
    await page.close();
    const v = { index: { sec: X0.sec, prov: X0.prov, eq: X0.eq, retreatOk: X0.retreatOk, equipW: X0.ls['dragonfighters.equipWeaponIdx'],
      hwmW: X0.ls['dragonfighters.weaponIdx'], tvSel: X0.tvSel }, tavern: tvOff, judge3cOff: judge3c(X0) };
    R.check('(6a)', '?sheetequip=0: index / tavern に装備区画も供給口も無い・(3c) と同じ判定を当てると赤 (帰還時の保存が従来の Math.max で 2 へ戻る)',
      X0.sec === false && X0.prov === false && !!X0.eq && X0.eq.ok === true && X0.retreatOk && judge3c(X0) === false
        && X0.ls['dragonfighters.equipWeaponIdx'] === '2' && tvOff.sec === false && tvOff.prov === false && tvOff.on === false && tvOff.title === TITLE_TEXT, v);
  });

  /* ── (0c)(5a) 町・地方全景・タイトル ── */
  await sect(['(0c)', '(5a)'], async () => {
    const out = {};
    for (const f of ['town.html', 'world.html', 'title.html']) {
      const page = await openPage(browser, port, f, '', SEED_PLAIN);
      await page.evaluate(() => window.DFSheet.open());
      await sleep(300);
      const si = await sheetInfo(page);
      out[f] = { sec: si.secInDom, prov: si.hasProvider, opts: si.opts.length };
      S5a.push({ page: f, btn: si.btnText, title: si.title });
      await page.close();
    }
    R.check('(0c)', '町・地方全景・タイトルでは装備区画が DOM に無く、供給口も無い', Object.keys(out).length === 3 && Object.values(out).every((x) => !x.sec && !x.prov && x.opts === 0), out);
    R.check('(5a)', 'ボタンの文字「' + BTN_TEXT + '」・紙の題名「' + TITLE_TEXT + '」(5 ページ)',
      S5a.length === 5 && new Set(S5a.map((s) => s.page)).size === 5 && S5a.every((s) => s.btn === BTN_TEXT && s.title === TITLE_TEXT), S5a);
  });

  /* ── (5b) 置き場所 ── */
  await sect(['(5b)'], async () => {
    const rows = [];
    const VIEWS = [{ width: 390, height: 844, mobile: true }, { width: 800, height: 600, mobile: false }, { width: 1280, height: 800, mobile: false }];
    for (const f of [TVN, 'title.html', 'world.html']) for (const v of VIEWS) {
      const page = await openPage(browser, port, f, '', SEED_PLAIN, v);
      await sleep(1600);   // autoPlace の測り直し (800ms / 2500ms) を待つ
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      const steps = docH > v.height + 1 ? [0, 0.25, 0.5, 0.75, 1] : [0];
      let worst = 0, outside = false, center = true, place = null, host = null;
      const hitIds = [];
      for (const fr of steps) {
        await page.evaluate((fr) => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * fr)), fr);
        await sleep(250);
        const m = await measurePlacement(page);
        const hits = m.rects.filter((r) => ovArea(m.btn, r) > 0);
        worst = Math.max(worst, hits.reduce((a, r) => a + ovArea(m.btn, r), 0));
        hits.forEach((h) => { if (hitIds.indexOf(h.id) < 0) hitIds.push(h.id); });
        const docTop = m.btn.t + m.sy, docBottom = m.btn.b + m.sy;
        if (m.btn.l < 0 || m.btn.r > m.vw || docTop < 0 || docBottom > m.docH) outside = true;
        if (m.pos === 'fixed' && (m.btn.t < 0 || m.btn.b > m.vh)) outside = true;
        if (!m.centerOnTop) center = false;
        place = m.place; host = m.host;
      }
      rows.push({ page: f, view: v.width + 'x' + v.height, host, place, overlap: Math.round(worst), hits: hitIds, outside, center,
        ok: host === 'BODY' && worst === 0 && !outside && center });
      await page.close();
    }
    for (const f of [I, 'town.html']) for (const v of [VIEWS[0], VIEWS[2]]) {
      const page = await openPage(browser, port, f, '', SEED_PLAIN, v);
      await sleep(1600);
      if (f === I && v.mobile) {
        const r = await page.evaluate(() => { const t = document.getElementById('partyToggleBtn'); if (!t) return null; const b = t.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; });
        if (r) { await page.touchscreen.tap(r.x, r.y); await sleep(700); }
      }
      await page.evaluate(() => { const b = document.getElementById('dfSheetBtn'); if (b) b.scrollIntoView({ block: 'nearest' }); });
      await sleep(250);
      const m = await measurePlacement(page);
      const hr = m.hostRect, b = m.btn;
      const inHostX = !!hr && b.l >= hr.l - 0.5 && b.r <= hr.r + 0.5;
      const inHostY = !!hr && b.t >= hr.t - 0.5 && b.b <= hr.b + 0.5;
      const inView = b.l >= -0.5 && b.r <= m.vw + 0.5 && b.t >= -0.5 && b.b <= m.vh + 0.5;
      const textFits = m.scrollW <= m.clientW;
      const ok = (m.host === 'BODY' ? inView : (inHostX && inView && (f === I || inHostY))) && textFits && (f !== I || m.host === 'partyPanel');
      rows.push({ page: f, view: v.width + 'x' + v.height, host: m.host, btn: [b.l, b.t, b.r, b.b].map(Math.round), hostRect: hr ? [hr.l, hr.t, hr.r, hr.b].map(Math.round) : null,
        inHostX, inHostY, inView, textFits, ok });
      await page.close();
    }
    R.check('(5b)', '画面固定のページ (酒場・タイトル・地方全景 × 390x844 / 800x600 / 1280x800) は押せる物との重なり 0・はみ出し 0・中心が最前面 / ダンジョン (#partyPanel)・町は置き場所と画面からはみ出さない・文字が切れない',
      rows.length === 13 && rows.every((r) => r.ok), rows);
  });

  /* ── (0e) pageerror ── */
  R.check('(0e)', '全ページで pageerror 0 件', PAGE_ERRS.length === 0, PAGE_ERRS.slice(0, 5));
  for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(判定が出ていない)', false, '');
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_sheet_equip_');
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
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(12) + ' 担当 ' + r.want.join(',') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '')
          + ' / 赤 ' + (r.red.join(',') || '(なし)'));
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
