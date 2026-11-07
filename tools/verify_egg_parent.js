#!/usr/bin/env node
/*
 * verify_egg_parent.js — 実装依頼書 #111「コボルドの巣穴の隠し要素『卵の親』」の受入ドライバ
 *   (依頼書 実装依頼書/2026-11-07_kobold-egg-parent.md §8 = 受入条件の唯一の正。型 = tools/verify_frost_hold.js / verify_kobold_warren.js)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_egg_parent.js                          # 素
 *   node tools/verify_egg_parent.js --negative               # 先に素の基準 → 変異 12 本 (port 10741〜10752)
 *   node tools/verify_egg_parent.js --negative --only flaggate,coldwiden
 *   node tools/verify_egg_parent.js --mutate anymark         # 変異 1 本を載せて手回し (担当表を実走で決める用)
 *   node tools/verify_egg_parent.js --verbose                # 緑の節の詳細も全部出す
 *   node tools/verify_egg_parent.js --srd <dir>              # SRD の monsters フォルダ (既定 = Dropbox のボールト)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome / git / SRD のフォルダが無い)・例外
 *      3=装置の腐敗 (変異の注入点の数が違う・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - 直起動の index で **印を種まきした腕 / しない腕 / ?eggparent=0 の腕**を並べ、本番の buildNode → ENEMY_SPAWNS → enemies を数える。
 *     ⭐ 門は localStorage の印 (dragonfighters.redEgg) をページの読み込みで 1 回読む = 腕ごとに別のページを起動する。
 *   - 印なしの比較の相手は着手前 BASE_REV の index.html (同じ origin で ?__base=1 で配る)。顔ぶれ・座標・個体の HP・
 *     buildNode の中の Math.random の呼び出し回数とその次の値を、同じ種 (mulberry32) のもとで比べる ((1a)(6c))。
 *   - 息は本番の enemyAttackTurn を回して window.__fireBreathProbe を読む。d6 (rollDiceDD(1,6)) と DEX セーヴ (d20) は
 *     **呼び出しの間だけ**差し替える (冬狼の verify_frost_hold (3f) と同じ作り)。ゲームループは dialogPaused で止める。
 *   - 数値は**ボールトの SRD の md をドライバが読んで** ENEMY_TYPES と突き合わせる (⛔ 75 / 17 / 7d6 / 13 を写経しない)。
 *     SRD の md が読めなければ exit 2 (環境)。読めたのに値が欠ければ (0d) が赤。
 *   - 経路は本番の aStar / isTileWall / isBodyClear (⛔ 自前の BFS を書かない)。
 *   - 強さ (⑤) は assert にしない (別の道具 ~/.claude/dev-loop/r111/item3/probe_egg_clear.js で記録する。依頼書 §12-3 用)。
 *
 * ■ 依頼書 §8 からの言い直し (実装と項目1・2 の実測に合わせた点)
 *   - (0b) のコボルドの数は写経せず、BASE_REV の n1 のコボルドの数 (= 印なしの顔ぶれ) と同じで 1 以上。
 *   - (1b) に「開幕の語りが BASE_REV の 4 行の 3 行目の後に 1 行足した 5 行」を足した (§2-7)。(1d) は 4 行 = BASE_REV と同じ文。
 *   - (1c)(1d)(1e) の顔ぶれは、ページを起動した直後に本番の buildNode を種つきで 1 回呼んで数える (enterNode を通さない)。
 *     (1e) は印あり / なしの 2 ページで、全ノードの台帳の追加物 (nodeExtrasFor) と入口ノードの種つきの buildNode の結果が同じ。
 *   - (2a) に体の箱 (本番の isBodyClear) を足した (§12-1 (3) で displaySize 121 以下を決めた理由)。
 *   - (2c) は本番の runEncounter を回す (頭と仲間の手番は何もしない・HP 999)。親竜の手番 WYRM_TURNS 回を見て、戦闘の中の
 *     親竜の手番が Recharge の状態機械 (4b) にも乗ることを足した。⚠ 実測: 族長の 3 マス左から開戦すると、開戦時の
 *     encounterEnemyIndices は族長とコボルド 3 体だけで、親竜は約 14 秒後 (2 ラウンド目の頭) に**増援 (mergeReinforcements)
 *     として同じ runEncounter へ合流**する ⇒ 「同じ 1 つの戦闘」= 開戦から終わりまでの間に encounterEnemyIndices へ入り、
 *     それより前に戦闘が切れていない (gap 偽) こと、で縛る。
 *   - (6c) 実測: 巣穴 n1 / 廃坑 n0 の buildNode は大域の Math.random を 1 回も呼ばない (敵の HP 等はノードの種の乱数 = withNodeRng)。
 *     ⇒ 「次の値」は種の 1 個目と同じになる。顔ぶれ・座標・HP の一致と合わせて、大域の乱数を食う変更が入れば赤になる形で残す。
 *   - (4a) の「同じ手番に噛まない」= 息の手番の d20 の呼び出し回数がセーヴの人数 (= window.__breathProbe の hitCount) と同じ
 *     (噛みつきの命中の d20 が無い)。(4b) の噛む手番は d20 が 1 回以上で息の記録が増えない。
 *   - (4c) は息のダメージのダイス (SRD の 7d6) の出目を rollDiceDD の包みで拾い、仲間 (並び順) → 頭の順に HP の減りと突き合わせる
 *     (hydraFireBreath の解決順)。炎の耐性の品の倍率は本番の getFireResistMult を掛ける (素の隊は 1)。
 *   - (4d) は静的 (breathDice を持つ親竜以外の型は全部ボスか火でない) に加え、親竜の def を 4 体の def へ一時的に差し替えて
 *     本番の enemyAttackTurn を 1 手番ずつ回し、火の息の probe と __wyrmTurn が増えない (息の本体は数えるだけの包み)。
 *   - (5b) の「hidden の重み」は写経せず、同じページで本番の maybeGrantScrollDrop をミミック (既存の隠し要素) と族長 (ボス) で
 *     呼んだときの pickScrollId の重みと比べる (ミミックと同じ・族長と違う)。
 *   - (5d) の「今と同じ文」= BASE_REV の index.html の checkDungeonClear にある卵の一言 (配信バイトから正規表現で取る)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] __koboldWarrenTV.eggParent・ENEMY_TYPES.redDragonWyrmling・window.__fireBreathProbe・HIDDEN_FOE_TYPES が見える
 *      (0b) [装置] 印あり腕の n1 で族長 1・コボルド (BASE と同数)・親竜 1 が台帳 (nodeSpawnsFor("n1")) と実体 (enemies) の両方に居る
 *      (0c) [装置] 全ページで pageerror 0 件
 *      (0d) [装置] SRD の md から AC / HP / CR / 噛みつき / 息のダイス / DC / Recharge / 火の完全耐性が 1 つも欠けずに取れる
 *   §1 (1a) 印なし → n0・n1 とも親竜 0・n1 の顔ぶれ・座標・HP が BASE_REV と同じ・語りも同じ
 *      (1b) 印 "1" → n1 にちょうど 1 体・n0 に 0 体・語りは 1 行増える
 *      (1c) 印 "0" / "true" / 空文字 → 0 体 (門は閉じたまま)
 *      (1d) 印 "1" + ?eggparent=0 → 0 体・語りは BASE と同じ 4 行
 *      (1e) 廃坑 / 塔の母は印 "1" でも顔ぶれが変わらない
 *   §2 (2a) 親竜のタイルが床・祭壇の矩形の外・体の箱も床
 *      (2b) 本番の aStar で n1 の入場 → 親竜が通る・直線距離 ≥ 13 タイル
 *      (2c) 族長と親竜が同じ 1 つの戦闘 (encounterEnemyIndices) に入る・戦闘の親竜の手番が Recharge の状態機械に乗る
 *   §3 (3a) AC・HP・STR/DEX・命中・噛みつき・息のダイスと DC・breathElement "fire"・isBoss が偽・breathChance が無い (SRD の md と)
 *      (3b) ENEMY_TRAITS の火の完全耐性 (resolveElementDefense で 0)・LORE_CR = SRD の CR・LORE_SKILL_OF = pharaxus と同じ "arcana"
 *      (3c) detectEnemyFamily が親竜だけの交戦で "dragon" を返さない
 *   §4 (4a) 最初の手番で息・同じ手番に噛まない
 *      (4b) 次の手番から d6 を 1 回ずつ・1〜4 なら噛む・5〜6 ならその手番に息 (d6 = 4,5,2,6)
 *      (4c) 息の中で hydraFireBreath が呼ばれパーティの HP が減る・DEX セーヴ d20=1 は全額 / 20 は半減・DC は SRD
 *      (4d) 既存の息持ち (ファラクサス・ハイドラ・キマイラ・冬狼) は火の分岐の probe に 1 件も出ない
 *   §5 (5a) 本番の defeatEnemy で親竜を倒す → isHiddenFoe 真・clearChestRelicP() === CLEAR_CHEST_RELIC_P_HIDDEN
 *      (5b) 巻物の確定ドロップが hidden の重み (5c) 倒したときの字幕に deathLine (5d) 勝利の一言が BASE と同じ文で 1 回
 *   §6 (6a) defeatEnemy / checkDungeonClear / runEncounter / hydraFireBreath / applyFireBreathToAlly のソースが BASE_REV と同じ
 *      (6b) 錨の 3 行 (台帳の引き / questFlagOn の concat / 冷気の息の入口) が BASE_REV と今でちょうど 1 行ずつ同じ字面
 *      (6c) 印なしの巣穴 n1 と廃坑の入口ノードで、同じ種の buildNode の後の Math.random の次の値・呼び出し回数・顔ぶれが BASE_REV と同じ
 *   ⛔ 測らないこと (依頼書 §8): 親竜の HP / 攻撃の値の良し悪し・息の演出の細部・deathLine と開幕の 1 行の言い回し。⑤ 強さは記録のみ。
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列をメモリ上で差し替える
 *     (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。favicon.ico は 204。index.html?__base=1 は BASE_REV のバイト。
 *   - 起動時に全変異のアンカーを**原本**で検算する (ちょうど n 件 (既定 1)・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *     ⚠ アンカーの改行は '\n' で書き、原本の改行コード (作業コピーは CRLF) へ合わせてから数える。改行の数は from / to で同じ。
 *     罠E の自己検査: 自分のアンカー (改行を含むものは全体) が他の tools/*.js のソースに出てこないこと。
 *     ⭐ coldwiden は冷気の入口の行 (verify_frost_hold の変異 breathboss の錨) を**単独で**掴まない: その行の末尾 `"cold") {` と
 *     次の行 (__wolfTurn の 1 行・本ドライバだけが掴む) の 2 行を 1 つのアンカーにする = 他ドライバのアンカーと重ならない。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持つ。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」+ 注入行の実行 > 0。
 *     担当は**実走で決めた** (--mutate で 1 本ずつ)。依頼書の予想 (NEG_PREDICTED) は記録として並べるだけ。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10740** (素) / 変異 **10741〜10752** (12 本・MUTATIONS の並び順)。⑤ の道具は 10755〜。
 *   (10706〜 = verify_clear_chests・10720〜 = verify_world_autowalk・10730〜 = verify_frost_hold の --port-ext)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const VERBOSE = flag('verbose');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10740'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた名前 (データ。期待値の写しではない) */
const KW = 'kobold-warren';
const WYRM = 'redDragonWyrmling', CHIEF = 'koboldChief', KOBOLD = 'kobold';
const EGG_KEY = 'dragonfighters.redEgg';
const OTHERS = ['goblin-mine', 'tower-mother'];                         // (1e) 廃坑 / 塔の母
const BREATH_HOLDERS = ['pharaxus', 'hydra', 'chimera', 'winterWolf'];  // (4d) 既存の息持ち
const DRAGON_REF = 'pharaxus';                                          // (3b) 伝承の技能は同じ竜の pharaxus と同じ
const ALTAR = { c1: 35, c2: 38, r1: 10, r2: 17 };                       // 祭壇と卵の矩形 (global。#103 MASK §12-1 (5) = verify_kobold_warren と同じ)
const MIN_DIST = 13;                                                    // §2-3: 入場からの距離 ≥ 13 タイル
const D6_SEQ = [4, 5, 2, 6];                                            // (4b) 再充填の d6 (4 → 5 の順を含む)
const WYRM_TURNS = 3;                                                   // (2c) 戦闘で親竜の手番を何回見るか
const BASE_REV = '62f500a';                                             // #111 の着手前 (#110 項目3・push 済)
const SRD_DIR = arg('srd', 'C:\\Users\\PC_User\\Dropbox\\🔷ナレッジ🔷\\raw\\srd\\monsters');
const SRD_SLUG = 'red-dragon-wyrmling';
const VIEW = { width: 1280, height: 800 };
const ENC_START_WAIT_MS = 60000;
const ENC_END_WAIT_MS = 150000;
const PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'warrior', isHero: false, zone: 'front', name: 'ガルド', trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ',   trait: null, line: null },
  { classKey: 'mage',    isHero: false, zone: 'rear',  name: 'ミラ',   trait: null, line: null },
];
/* 触らない約束の関数 (依頼書 §2-2 ①)。(6a) */
const KEEP_FNS = ['defeatEnemy', 'checkDungeonClear', 'runEncounter', 'hydraFireBreath', 'applyFireBreathToAlly'];
/* 錨の 3 行 (依頼書 §2-2 ③④)。(6b) ⚠ 比べるだけ (変異のアンカーではない) */
const ANCHOR_LINES = [
  '      const t = SCENARIO_NODE_EXTRAS[_builtinScenId];',
  '      return base.concat(ex.spawns.filter(sp => questFlagOn(sp[3])));',
  '      if (!def.isBoss && def.breathDice && def.breathElement === "cold") {',
];

/* ══════════════════════════════════════════════════════════════════════════════
 * SRD の md (起動時に 1 回)。フォルダ / ファイルが読めなければ exit 2 (⛔ 緑にしない)。値の欠けは (0d) の赤
 * ══════════════════════════════════════════════════════════════════════════════ */
function readSrd() {
  let txt;
  try { txt = fs.readFileSync(path.join(SRD_DIR, SRD_SLUG + '.md'), 'utf8'); }
  catch (e) { console.error('[vet] ⛔ SRD の md が読めない (環境): ' + path.join(SRD_DIR, SRD_SLUG + '.md') + ' ' + e.code); process.exit(2); }
  txt = txt.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const S = { missing: [] };
  const fm = txt.match(/^---\n([\s\S]*?)\n---/);
  const fmv = (k) => { const m = fm && fm[1].match(new RegExp('^' + k + ':\\s*([0-9.]+)\\s*$', 'm')); return m ? parseFloat(m[1]) : null; };
  S.cr = fmv('cr'); S.ac = fmv('ac'); S.hp = fmv('hp');
  const ab = txt.match(/\|\s*STR\s*\|\s*DEX\s*\|[^\n]*\n\|[-|\s]+\|\n\|\s*(\d+)\s*\|\s*(\d+)\s*\|/);
  S.str = ab ? parseInt(ab[1], 10) : null; S.dex = ab ? parseInt(ab[2], 10) : null;
  const im = txt.match(/\*\*Damage Immunities\*\*:\s*([^\n]*)/);
  S.immune = im ? im[1].split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : null;
  const bite = txt.match(/\*\*Bite\*\*\.\s*Melee Weapon Attack:\s*\+(\d+) to hit[^\n]*?Hit:\s*\d+\s*\((\d+)d(\d+)\s*\+\s*(\d+)\)/);
  S.bite = bite ? { atk: +bite[1], n: +bite[2], s: +bite[3], bonus: +bite[4] } : null;
  const br = txt.match(/\*\*(\w+) Breath \(Recharge (\d)-(\d)\)\*\*\.[^\n]*?DC (\d+) (\w+) saving throw[^\n]*?\((\d+)d(\d+)\) (\w+) damage[^\n]*?half/);
  S.breath = br ? { el: br[1].toLowerCase(), rmin: +br[2], rmax: +br[3], dc: +br[4], save: br[5].toLowerCase(), n: +br[6], s: +br[7], dmgEl: br[8].toLowerCase() } : null;
  for (const k of ['cr', 'ac', 'hp', 'str', 'dex', 'immune', 'bite', 'breath']) if (S[k] === null || S[k] === undefined) S.missing.push(k);
  return S;
}
const SRD = readSrd();
const mod = (score) => Math.floor((score - 10) / 2);

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html';
const SERVED = [F_INDEX];
const PRISTINE = {};
for (const f of SERVED) PRISTINE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const EOL = PRISTINE[F_INDEX].indexOf('\r\n') >= 0 ? '\r\n' : '\n';
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
let BASE_INDEX = null;
try { BASE_INDEX = execFileSync('git', ['-C', ROOT, 'show', BASE_REV + ':' + F_INDEX], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { console.error('[vet] git show ' + BASE_REV + ':index.html に失敗: ' + e.message); process.exit(2); }
if (BASE_INDEX.indexOf(WYRM) >= 0 || BASE_INDEX.indexOf('EGG_PARENT_ON') >= 0) vetFail('BASE_REV ' + BASE_REV + ' に若い赤竜が在る (着手前でない)');
/* (5d) 勝利の一言の基準 = BASE_REV の checkDungeonClear の卵の一言 */
const EGG_LINE = (() => { const m = /showDMMessage\("(祭壇の上に[^"]*)"/.exec(BASE_INDEX); return m ? m[1] : null; })();
if (!EGG_LINE) vetFail('BASE_REV の index.html に卵の一言 (showDMMessage("祭壇の上に…")) が無い');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 12 本)。逐語は HEAD 9efa2bd (項目2 の後) の行で取った。
 * ⚠ どれも行数不変 (改行を含むアンカーは from / to で改行の数が同じ)。n = 原本に出る回数 (既定 1)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const A_LEDGER = '      "kobold-warren": EGG_PARENT_ON ? { n1: { spawns: [["redDragonWyrmling", 34, 17]] } } : {},';
const A_MARK = '        return localStorage.getItem("dragonfighters.redEgg") === "1";';
const A_RETIRE = '        if (new URLSearchParams(location.search).get("eggparent") === "0") return false;';
const A_BREATHDEF = '        breathDice: "7d6", breathDC: 13, breathBlast: 3, breathElement: "fire",   /* ★[#111] 火の息 (Fire Breath・Recharge 5-6)。⛔ 円錐にしない */';
const A_SPENT = '          enemy.__fireBreathSpent = true;';
const A_COLDTAIL = '"cold") {\n        enemy.__wolfTurn = (enemy.__wolfTurn || 0) + 1;';
const A_FIREIF = '      if (!def.isBoss && def.breathDice && def.breathElement === "fire") {';
const A_DEFEAT = '      maybeGrantPolymorphWand(enemy); // 闇市: 低Tierボスから稀にポリモーフの杖 (wandDropEnabled 時のみ)';
const A_HIDDEN = '    const HIDDEN_FOE_TYPES = ["goblinChariot", "shadowBeast", "stoneGolem", "caelum", "mimic", "redDragonWyrmling"];   // ★[#111] 卵の親';
const A_FAMILY = '        else if (t === "pharaxus") fam = "dragon"; // Sce6 最終ボス: レッドドラゴン・ファラクサス';
const A_TRAIT = '      redDragonWyrmling: { immune: ["fire"] },                                   // ★[#111] Red Dragon Wyrmling (SRD の Damage Immunities)';
const MUTATIONS = {
  /* ⭐ 門を questFlagOn の 4 要素目に置き換える (依頼書 §2-2 ② の罠そのもの。直起動では questFlagOn が常に真) */
  flaggate: [
    { from: A_LEDGER, to: '      "kobold-warren": (' + HIT('flaggate') + ', { n1: { spawns: [["redDragonWyrmling", 34, 17, "s_egg_parent_rumor"]] } }),   /* ★変異flaggate */' }],
  /* === "1" を「印が null でない」へ */
  anymark: [
    { from: A_MARK, to: '        return (' + HIT('anymark') + ', localStorage.getItem("dragonfighters.redEgg") !== null);   /* ★変異anymark */' }],
  /* ?eggparent=0 を読まない */
  noretire: [
    { from: A_RETIRE, to: '        if ((' + HIT('noretire') + ', false)) return false;   /* ★変異noretire */' }],
  /* 台帳のキーを n0 へ */
  n0spawn: [
    { from: A_LEDGER, to: '      "kobold-warren": EGG_PARENT_ON ? (' + HIT('n0spawn') + ', { n0: { spawns: [["redDragonWyrmling", 34, 17]] } }) : {},   /* ★変異n0spawn */' }],
  /* 座標を祭壇の上 (36,13) へ */
  altartile: [
    { from: A_LEDGER, to: '      "kobold-warren": EGG_PARENT_ON ? (' + HIT('altartile') + ', { n1: { spawns: [["redDragonWyrmling", 36, 13]] } }) : {},   /* ★変異altartile */' }],
  /* isBoss: true を付ける */
  bossflag: [
    { from: A_BREATHDEF, to: '        isBoss: (' + HIT('bossflag') + ', true), breathDice: "7d6", breathDC: 13, breathBlast: 3, breathElement: "fire",   /* ★変異bossflag */' }],
  /* 再充填の d6 を見ずに毎手番吐く (吐いても使用済みにしない) */
  alwaysbreath: [
    { from: A_SPENT, to: '          ' + HIT('alwaysbreath') + ';   /* ★変異alwaysbreath (使用済みにしない) */' }],
  /* ⭐ 火の分岐を足さず冷気の入口の行を "cold" || "fire" に広げる (依頼書 §2-2 ③)。火の分岐の入口は閉じる */
  coldwiden: [
    { from: A_COLDTAIL, to: '"cold" || def.breathElement === "fire" && (' + HIT('coldwiden') + ', true)) {   /* ★変異coldwiden */\n        enemy.__wolfTurn = (enemy.__wolfTurn || 0) + 1;' },
    { from: A_FIREIF, to: '      if (false && def.breathElement === "fire") {   /* ★変異coldwiden (火の分岐を閉じる) */' }],
  /* ⭐ defeatEnemy に親竜の分岐を 1 行足す (同じ行の文と行末コメントの間へ。行数不変)。
   *   ⚠ 行末の `//` コメントの後ろへ足すとコメントに食われて走らない (1 回目の手回しで注入行の実行 0 回だった) */
  defeatedit: [
    { from: A_DEFEAT, to: A_DEFEAT.replace('maybeGrantPolymorphWand(enemy); ', 'maybeGrantPolymorphWand(enemy); if (enemy && enemy.type === "redDragonWyrmling") ' + HIT('defeatedit') + ';   /* ★変異defeatedit */ ') }],
  /* HIDDEN_FOE_TYPES に足さない */
  notHidden: [
    { from: A_HIDDEN, to: '    const HIDDEN_FOE_TYPES = (' + HIT('notHidden') + ', ["goblinChariot", "shadowBeast", "stoneGolem", "caelum", "mimic"]);   /* ★変異notHidden */' }],
  /* detectEnemyFamily で親竜を "dragon" へ (依頼書 §2-2 ⑤) */
  dragonfam: [
    { from: A_FAMILY, to: '        else if (t === "pharaxus" || (t === "redDragonWyrmling" && (' + HIT('dragonfam') + ', true))) fam = "dragon"; /* ★変異dragonfam */' }],
  /* ENEMY_TRAITS の行を消す */
  nofireimmune: [
    { from: A_TRAIT, to: '      redDragonWyrmling: (' + HIT('nofireimmune') + ', {}),   /* ★変異nofireimmune */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で 1 本ずつ実走し、実際に赤くなった集合で決めた
 *   (項目3・2026-11-07 = ~/.claude/dev-loop/r111/item3/mut/*.log。3 本ずつ並走)。予想との差の理由:
 *   - flaggate: 直起動では questFlagOn が常に真 ⇒ 印なし (1a)・印 "0" 等 (1c) に加え ?eggparent=0 (1d) と BASE との種つきの比較 (6c) も赤。
 *   - n0spawn: 親竜が n1 に居ない ⇒ n1 の親竜を見る節が全部赤 ((0b)(1b)(2a)〜(2c)(3a)〜(3c)(4a)〜(4d)(5a)〜(5c))。
 *   - altartile: 祭壇の上 (36,13) は体の箱 (36,14) が壁・入場から経路なし (2a)(2b)。戦闘に合流しない (2c)・直接呼びで噛みが届かず d20 0 回 (4b)。
 *   - bossflag: ボスの分岐へ入り火の分岐を通らない ⇒ (4a)(4b)(4c)(2c)・静的な (4d)・字幕がボスの語りに替わる (5c)・型の値 (3a)。
 *   - alwaysbreath: 使用済みにならない (4a)・再充填の d6 を振らない (4b)・戦闘の状態機械 (2c)。
 *   - coldwiden: 冷気の分岐へ入り火の probe が出ない (4a)(4b)(4c)(2c)・錨の行の字面 (6b)。 */
const NEG_EXPECT = {
  flaggate:     ['(1a)', '(1c)', '(1d)', '(6c)'],
  anymark:      ['(1c)'],
  noretire:     ['(1d)'],
  n0spawn:      ['(0b)', '(1b)', '(2a)', '(2b)', '(2c)', '(3a)', '(3b)', '(3c)', '(4a)', '(4b)', '(4c)', '(4d)', '(5a)', '(5b)', '(5c)'],
  altartile:    ['(2a)', '(2b)', '(2c)', '(4b)'],
  bossflag:     ['(2c)', '(3a)', '(4a)', '(4b)', '(4c)', '(4d)', '(5c)'],
  alwaysbreath: ['(2c)', '(4a)', '(4b)'],
  coldwiden:    ['(2c)', '(4a)', '(4b)', '(4c)', '(6b)'],
  defeatedit:   ['(6a)'],
  notHidden:    ['(5a)'],
  dragonfam:    ['(3c)'],
  nofireimmune: ['(3b)'],
};
/* 変異 → 乱数の引きしだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = {
  flaggate: [], anymark: [], noretire: [], n0spawn: [], altartile: [], bossflag: [], alwaysbreath: [], coldwiden: [],
  defeatedit: [], notHidden: [], dragonfam: [], nofireimmune: [],
};
/* 依頼書 §8 の予想 (記録。⛔ 合否には使わない = 担当は実走で決める) */
const NEG_PREDICTED = {
  flaggate: ['(1a)', '(1c)'], anymark: ['(1c)'], noretire: ['(1d)'], n0spawn: ['(1b)', '(2b)'], altartile: ['(2a)'], bossflag: ['(3a)', '(4a)'],
  alwaysbreath: ['(4b)'], coldwiden: ['(6b)', '(4c)'], defeatedit: ['(6a)'], notHidden: ['(5a)'], dragonfam: ['(3c)'], nofireimmune: ['(3b)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
const mutPort = (key) => PORT + 1 + MUT_ORDER.indexOf(key);
if (MUT_ORDER.length > 12) vetFail('変異は 12 本まで (ポート 10741〜10752)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_MAYBE[k] || !NEG_PREDICTED[k])) vetFail('NEG_EXPECT / NEG_MAYBE / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  if (!NEG_EXPECT[k].length) vetFail('変異 ' + k + ' に必ず赤の節が無い');
  const both = NEG_EXPECT[k].filter((x) => NEG_MAYBE[k].indexOf(x) >= 0);
  if (both.length) vetFail('変異 ' + k + ' の ' + both.join(',') + ' が必ず赤と確率で赤の両方に居る');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
const nl = (s) => s.split('\n').join(EOL);          // アンカーの改行を原本の改行コードへ
const nlCount = (s) => s.split('\n').length - 1;
/* 罠E の自己検査: 他の tools/*.js が同じアンカーを持っていないこと (改行を含むアンカーは LF / CRLF の両方の形で) */
{
  const self = path.basename(__filename);
  const peers = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /\.js$/.test(f) && f !== self);
  const src = peers.map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }));
  for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
    const core = e.from.trim();
    const forms = [core, core.split('\n').join('\r\n')];
    const clash = src.filter((x) => forms.some((c) => x.s.indexOf(c) >= 0)).map((x) => x.f);
    if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(','));
  }
}
for (const f of SERVED) if (countOf(PRISTINE[f], '__MUTHIT__') !== 0) vetFail('原本 ' + f + ' に __MUTHIT__ が在る');
const _mutCache = {};
function servedFile(file, key) {
  if (!key) return PRISTINE[file];
  const ck = key + '|' + file;
  if (_mutCache[ck] !== undefined) return _mutCache[ck];
  let s = PRISTINE[file];
  for (const e of MUTATIONS[key]) {
    const want = e.n || 1;
    const from = nl(e.from), to = nl(e.to);
    const c = countOf(PRISTINE[file], from);
    if (c !== want) vetFail('変異 ' + key + ' の注入点が ' + want + ' 箇所ではない (' + file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE[file], to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    if (nlCount(e.from) !== nlCount(e.to)) vetFail('変異 ' + key + ' の from / to の改行の数が違う');
    if (countOf(s, from) !== want) vetFail('変異 ' + key + ' の注入点が同じ変異の先の注入に食われた: ' + e.from.slice(0, 120));
    s = s.split(from).join(to);
  }
  if (s.split('\n').length !== PRISTINE[file].split('\n').length) vetFail('変異 ' + key + ' が ' + file + ' の行数を変えた');
  _mutCache[ck] = s;
  return s;
}
for (const k of MUT_ORDER) {
  if (!MUTATIONS[k].some((e) => (e.to || '').indexOf('__MUTHIT__' + k) >= 0)) vetFail('変異 ' + k + ' に実行の印が無い');
  if (servedFile(F_INDEX, k) === PRISTINE[F_INDEX]) vetFail('変異 ' + k + ' が何も変えていない');
}

/* (6a) 関数のソース (宣言の頭から中括弧の対応で切り出す。BASE と現在で同じ切り出し方 = 比べる限り公平) */
function fnSource(src, name) {
  const re = new RegExp('\\n[ \\t]*(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  const bm = /\)\s*\{[ \t]*\r?\n/.exec(src.slice(m.index));
  if (!bm) return null;
  const i = m.index + bm.index + bm[0].indexOf('{');
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(m.index, k + 1).replace(/\r\n/g, '\n'); }
  }
  return null;
}
/* (6b) 行の字面 (改行を正規化して行ごとに数える) */
const linesOf = (src) => src.replace(/\r\n/g, '\n').split('\n');
const lineCount = (src, line) => linesOf(src).filter((l) => l === line).length;
console.log('[vet] 装置: 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で所定の数・行数不変・他ドライバとアンカーの重なり 0'
  + ' / 基準 = git ' + BASE_REV + ' (index.html ' + BASE_INDEX.length + ' 文字) / 原本の改行 ' + J(EOL)
  + ' / SRD ' + SRD_SLUG + '.md = ' + J({ cr: SRD.cr, ac: SRD.ac, hp: SRD.hp, str: SRD.str, dex: SRD.dex, immune: SRD.immune, bite: SRD.bite, breath: SRD.breath, missing: SRD.missing }));

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
  const frozen = {};
  for (const f of SERVED) frozen[f] = Buffer.from(servedFile(f, mutKey), 'utf8');
  const baseBuf = Buffer.from(BASE_INDEX, 'utf8');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const q = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?')) : '';
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === 'favicon.ico') { res.statusCode = 204; res.end(); return; }
        if (rel === F_INDEX && /[?&]__base=1(&|$)/.test(q)) { res.setHeader('Content-Type', MIME['.html']); res.end(baseBuf); return; }
        if (frozen[rel]) { res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()]); res.end(frozen[rel]); return; }
        if (rel === '__blank.html') { res.setHeader('Content-Type', MIME['.html']); res.end('<!doctype html><title>blank</title>'); return; }
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
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)',
  '(3a)', '(3b)', '(3c)', '(4a)', '(4b)', '(4c)', '(4d)', '(5a)', '(5b)', '(5c)', '(5d)', '(6a)', '(6b)', '(6c)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok && !VERBOSE ? 300 : 6000));
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
 * ページ側の観測 (⛔ 期待値はここに書かない)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* 種つきの buildNode (6c)(1a)(1c)(1d)(1e)。⭐ 起動直後に呼ぶ (腕どうしで同じ手順)。withNodeRng は中で Math.random を差し替えて戻す */
const SEEDED_BUILD = (A) => {
  const o = { node: A.node };
  const R0 = Math.random;
  let s = A.seed >>> 0, calls = 0;
  Math.random = function () { calls++; s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); const u = (t ^ (t >>> 14)) >>> 0; return u / 4294967296; };   /* mulberry32 */
  try { buildNode(resolveNodeMapDef(A.node), A.node); o.calls = calls; o.next = Math.random(); }
  catch (e) { o.err = String((e && e.message) || e); }
  finally { Math.random = R0; }
  const tileOf = (e) => [Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE)];
  o.spawns = (ENEMY_SPAWNS || []).map((sp) => [sp[0], sp[1], sp[2]]);
  o.enemies = enemies.map((e) => [e.type, tileOf(e)[0], tileOf(e)[1], e.hp]);
  return o;
};
/* 起動の観測: シナリオ・グラフ・全ノードの台帳の追加物・語り・門のシーム */
const BOOT_SNAP = () => {
  const o = {};
  try { o.scen = scenarioId; } catch (e) { o.scen = null; }
  try { o.builtin = _builtinScenId; } catch (e) { o.builtin = null; }
  o.nodes = (RUN && RUN.graph) ? RUN.graph.nodes.map((n) => n.id) : null;
  o.entry = (RUN && RUN.graph) ? RUN.graph.entry : null;
  o.cur = currentNodeId;
  o.extras = {};
  for (const id of (o.nodes || [])) { try { o.extras[id] = JSON.parse(JSON.stringify(nodeExtrasFor(id) || null)); } catch (e) { o.extras[id] = 'ERR ' + e.message; } }
  try { o.narr = SCENARIO_NARRATIONS[scenarioId] ? SCENARIO_NARRATIONS[scenarioId].slice() : null; } catch (e) { o.narr = null; }
  const tv = window.__koboldWarrenTV;
  o.ep = tv && tv.eggParent ? { on: tv.eggParent.on, extras: tv.eggParent.extras() } : null;
  const tileOf = (e) => [Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE)];
  o.enemies = enemies.map((e) => [e.type, tileOf(e)[0], tileOf(e)[1]]);
  o.spawns = (ENEMY_SPAWNS || []).map((sp) => [sp[0], sp[1], sp[2]]);
  try { o.mark = localStorage.getItem('dragonfighters.redEgg'); } catch (e) { o.mark = 'ERR'; }
  return o;
};
/* 入室の後の落ち着き待ち (判定パネル・出口の矢印・選択肢を流す) */
const SETTLE = async (MS) => {
  const st = { esc: 0, roll: 0, choice: 0, ms: 0, ok: false };
  const t0 = performance.now(); let calmSince = null;
  while (performance.now() - t0 < MS) {
    const ov = document.getElementById('skillCheckOverlay');
    if (ov && ov.classList.contains('show')) { const rb = document.getElementById('scRollBtn'); if (rb) rb.click(); ov.click(); st.roll++; }
    if (document.querySelector('.exitArrow')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); st.esc++; }
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    if (btns.length && btns[0].offsetParent !== null) { btns[btns.length - 1].click(); st.choice++; }
    const calm = !nodeBusy && !skillCheckActive && !document.querySelector('.exitArrow') && !encounterActive && !encounterRunning;
    if (!calm) calmSince = null; else if (calmSince === null) calmSince = performance.now(); else if (performance.now() - calmSince >= 800) { st.ok = true; break; }
    await new Promise((r) => setTimeout(r, 100));
  }
  st.ms = Math.round(performance.now() - t0);
  return st;
};
/* n1 へ入る (敵は inactive のまま) → 落ち着いたらゲームループを止める (dialogPaused) */
const ENTER_N1 = async (A) => {
  const o = {};
  for (const e of enemies) e.inactive = true;   /* ⭐ n0 で戦闘を始めさせない */
  await enterNode('n1', 'right');
  for (const e of enemies) e.inactive = true;   /* ⭐ n1 でも語りと選択肢が流れるまで戦闘を始めさせない */
  o.playerAtEntry = [Math.floor((playerX + 48) / TILE_SIZE), Math.floor((playerY + 58) / TILE_SIZE)];
  o.cur = currentNodeId;
  const settle = (new Function('return (' + A.SETTLE + ')'))();
  o.settle = await settle(20000);
  dialogPaused = true;   /* ⭐ ゲームループを止める */
  for (const e of enemies) e.inactive = false;
  return o;
};
/* 印あり腕の n1 の観測 (§0 §2 §3) */
const N1_SNAP = (A) => {
  const o = {};
  const tileOf = (e) => [Math.floor((e.x + e.def.displaySize / 2) / TILE_SIZE), Math.floor((e.y + e.def.displaySize / 2) / TILE_SIZE)];
  o.cur = currentNodeId;
  o.ledger = nodeSpawnsFor('n1').map((sp) => [sp[0], sp[1], sp[2]]);
  o.enemies = enemies.map((e, i) => ({ i, type: e.type, tile: tileOf(e), alive: !!e.alive, hp: e.hp }));
  const tv = window.__koboldWarrenTV;
  o.seams = { tv: !!tv, ep: !!(tv && tv.eggParent), epFns: tv && tv.eggParent ? ['extras', 'narration', 'wyrms', 'breathProbe'].filter((k) => typeof tv.eggParent[k] === 'function') : null,
    epOn: tv && tv.eggParent ? tv.eggParent.on : null, def: !!ENEMY_TYPES[A.WYRM], probe: Array.isArray(window.__fireBreathProbe),
    hidden: (typeof HIDDEN_FOE_TYPES !== 'undefined' && Array.isArray(HIDDEN_FOE_TYPES)) ? HIDDEN_FOE_TYPES.slice() : null };
  o.wyrmsTV = tv && tv.eggParent ? tv.eggParent.wyrms() : null;
  o.narrTV = tv && tv.eggParent ? tv.eggParent.narration() : null;
  const wi = enemies.findIndex((e) => e.type === A.WYRM);
  o.wi = wi;
  if (wi >= 0) {
    const W = enemies[wi], t = tileOf(W);
    o.wyrmTile = t;
    o.wall = isTileWall(t[0], t[1]);
    o.inAltar = t[0] >= A.ALTAR.c1 && t[0] <= A.ALTAR.c2 && t[1] >= A.ALTAR.r1 && t[1] <= A.ALTAR.r2;
    o.body = unitBodyTiles(W.def, t[0], t[1]).map((b) => [b.tx, b.ty, isTileWall(b.tx, b.ty)]);
    o.bodyClear = isBodyClear(W.def, t[0], t[1]);
    const p = A.from ? aStar(A.from[0], A.from[1], t[0], t[1]) : null;
    o.path = p ? p.length : null;
    o.dist = A.from ? Math.hypot(t[0] - A.from[0], t[1] - A.from[1]) : null;
    o.fam = detectEnemyFamily([wi]);
    o.famAll = detectEnemyFamily(enemies.map((e, i) => i));
    o.famChief = (() => { const ci = enemies.findIndex((e) => e.type === A.CHIEF); return ci >= 0 ? detectEnemyFamily([ci]) : null; })();
    const d = W.def;
    o.def = { hp: d.hp, ac: d.ac, str: d.str, dex: d.dex, atkBonus: d.atkBonus, dmgDice: d.dmgDice, dmgBonus: d.dmgBonus, breathDice: d.breathDice || null,
      breathDC: d.breathDC, breathBlast: d.breathBlast, breathElement: d.breathElement || null, isBoss: !!d.isBoss, hasBreathChance: 'breathChance' in d,
      deathLine: d.deathLine || null, name: d.name, sameAsTypes: d === ENEMY_TYPES[A.WYRM] };
    o.hpInst = W.hp;
    o.trait = ENEMY_TRAITS[A.WYRM] ? JSON.parse(JSON.stringify(ENEMY_TRAITS[A.WYRM])) : null;
    o.fire = resolveElementDefense(wi, 'fire', 20); o.cold = resolveElementDefense(wi, 'cold', 20);
    o.loreCr = LORE_CR[A.WYRM]; o.loreSkill = LORE_SKILL_OF[A.WYRM]; o.loreSkillRef = LORE_SKILL_OF[A.DRAGON_REF];
  }
  o.breathTypes = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k] && ENEMY_TYPES[k].breathDice)
    .map((k) => ({ k, boss: !!ENEMY_TYPES[k].isBoss, el: ENEMY_TYPES[k].breathElement || null })).sort((a, b) => (a.k < b.k ? -1 : 1));
  return o;
};
/* 息の直接呼び (§4)。ゲームループは止まっている (dialogPaused)。隊列を置き直し、d6 / d20 は呼び出しの間だけ差し替える */
const DIRECT = async (A) => {
  const o = { err: [], seq: null, save: [], others: [] };
  const T = TILE_SIZE;
  const wi = enemies.findIndex((e) => e.type === A.WYRM);
  o.wi = wi;
  if (wi < 0) { o.err.push('親竜が居ない'); return o; }
  const W = enemies[wi];
  const W0 = { x: W.x, y: W.y, hp: W.hp };
  const putP = (tx, ty) => { playerX = tx * T + T / 2 - 48; playerY = ty * T + T / 2 - 58; };
  const putA = (a, tx, ty) => { a.x = tx * T + T / 2 - a.def.displaySize / 2; a.y = ty * T + T / 2 - a.def.displaySize / 2; a.path = []; };
  const bak = { px: playerX, py: playerY, a: allies.map((a) => ({ x: a.x, y: a.y })) };
  const heal = () => { maxHp = Math.max(maxHp, 999); hp = maxHp; for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; } };
  const live = () => allies.filter((a) => a.alive);
  /* 隊列: 親竜 (34,17) の西に固める (噛みつきが届き、息の 3x3 に複数人が入る) */
  const SLOTS = [[33, 16], [33, 18], [32, 17], [32, 16]];
  const layout = () => { W.x = W0.x; W.y = W0.y; W.hp = W0.hp; W.path = []; putP(33, 17); live().forEach((a, k) => putA(a, SLOTS[k][0], SLOTS[k][1])); heal(); };
  const members = () => {
    const L = [];
    allies.forEach((a, i) => { if (a.alive) L.push({ k: 'ally:' + i, hp: a.hp, mult: getFireResistMult(a) }); });
    if (hp > 0 && !gameOver) L.push({ k: 'leader', hp: hp, mult: getFireResistMult('player') });
    return L;
  };
  const hpOf = (k) => (k === 'leader' ? hp : allies[parseInt(k.split(':')[1], 10)].hp);
  const _d20 = d20, _roll = rollDiceDD;
  if (!Array.isArray(window.__breathProbe)) window.__breathProbe = [];
  /* ── (4a)(4b) 本番の enemyAttackTurn を 5 手番 (d6 だけ差し替え) ── */
  try {
    W.__fireBreathSpent = false; W.__wyrmTurn = 0;
    let k = 0;
    rollDiceDD = function (n, s) { if (n === 1 && s === 6) { const v = A.D6[k++]; return { rolls: [v], total: v }; } return _roll.apply(this, arguments); };
    const turns = [];
    for (let t = 1; t <= A.D6.length + 1; t++) {
      layout();
      let dc = 0;
      d20 = function () { dc++; return _d20.apply(this, arguments); };
      const f0 = window.__fireBreathProbe.length, b0 = window.__breathProbe.length;
      let err = null;
      try { await enemyAttackTurn(wi); } catch (e) { err = String((e && e.message) || e); } finally { d20 = _d20; }
      const add = window.__fireBreathProbe.slice(f0).map((r) => r.site + (r.reason ? ':' + r.reason : '') + (r.site === 'recharge' ? ':' + r.d6 + ':' + (r.ready ? 'ready' : 'no') : ''));
      const idxOk = window.__fireBreathProbe.slice(f0).every((r) => r.enemyIdx === wi && r.turn === t);
      const bp = window.__breathProbe.slice(b0).map((r) => ({ hitCount: r.hitCount, savedCount: r.savedCount, dc: r.dc }));
      turns.push({ t, add, idxOk, d20: dc, bp, err, spent: !!W.__fireBreathSpent, wyrmTurn: W.__wyrmTurn });
    }
    rollDiceDD = _roll;
    o.seq = { turns, d6used: k };
  } catch (e) { rollDiceDD = _roll; d20 = _d20; o.err.push('seq: ' + e.message); }
  /* ── (4c) DEX セーヴ d20 = 1 / 20 (息のダイスの出目を拾う) ── */
  for (const roll of [1, 20]) {
    try {
      layout(); W.__fireBreathSpent = false;
      const L = members();
      const raws = []; let calls = 0;
      d20 = function () { calls++; return roll; };
      rollDiceDD = function (n, s) { const r = _roll.apply(this, arguments); if (n === A.BR.n && s === A.BR.s) raws.push(r.total); return r; };
      const f0 = window.__fireBreathProbe.length, b0 = window.__breathProbe.length;
      let hf = 0; const _hf = hydraFireBreath;
      hydraFireBreath = async function () { hf++; return _hf.apply(this, arguments); };
      let err = null;
      try { await enemyAttackTurn(wi); } catch (e) { err = String((e && e.message) || e); }
      finally { d20 = _d20; rollDiceDD = _roll; hydraFireBreath = _hf; }
      const drops = L.map((m) => ({ k: m.k, drop: m.hp - hpOf(m.k), mult: m.mult }));
      o.save.push({ roll, calls, raws, drops, hf, err, add: window.__fireBreathProbe.slice(f0).map((r) => r.site), bp: window.__breathProbe.slice(b0).map((r) => ({ hitCount: r.hitCount, savedCount: r.savedCount, dc: r.dc })) });
    } catch (e) { d20 = _d20; rollDiceDD = _roll; o.err.push('save: ' + e.message); }
  }
  /* ── (4d) 親竜の def を既存の息持ちの def へ一時的に差し替えて 1 手番 (息の本体は数えるだけ) ── */
  {
    const def0 = W.def, _hf = hydraFireBreath, _cb = coldBreath;
    for (const type of A.HOLDERS) {
      const r = { type, exists: !!ENEMY_TYPES[type], breathDice: !!(ENEMY_TYPES[type] && ENEMY_TYPES[type].breathDice), fire: 0, cold: 0 };
      if (!r.exists) { o.others.push(r); continue; }
      try {
        layout();
        let fire = 0, cold = 0;
        hydraFireBreath = async function () { fire++; };
        coldBreath = async function () { cold++; return true; };
        W.def = ENEMY_TYPES[type];
        const f0 = window.__fireBreathProbe.length, wt0 = W.__wyrmTurn;
        try { await enemyAttackTurn(wi); } catch (e) { r.err = String((e && e.message) || e); }
        finally { W.def = def0; hydraFireBreath = _hf; coldBreath = _cb; }
        r.fireAdd = window.__fireBreathProbe.length - f0; r.wyrmTurnSame = W.__wyrmTurn === wt0; r.fire = fire; r.cold = cold;
      } catch (e) { W.def = def0; hydraFireBreath = _hf; coldBreath = _cb; r.err = 'outer ' + e.message; }
      o.others.push(r);
    }
  }
  /* ── 戻す ── */
  W.x = W0.x; W.y = W0.y; W.hp = W0.hp; W.path = [];
  playerX = bak.px; playerY = bak.py;
  allies.forEach((a, i) => { if (bak.a[i]) { a.x = bak.a[i].x; a.y = bak.a[i].y; a.path = []; } });
  W.__fireBreathSpent = false; W.__wyrmTurn = 0; delete W.breathCooldown;
  heal();
  o.wrappedBack = (d20 === _d20 && rollDiceDD === _roll);
  return o;
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { booted: 0, errs: [], hits: {} };
  const base = 'http://127.0.0.1:' + port + '/';
  const pages = [];
  const STAGE_ERRS = [];
  const stage = async (name, f, fb) => { try { return await f(); } catch (e) { STAGE_ERRS.push(name + ': ' + String((e && e.message) || e).slice(0, 200)); return fb; } };
  async function newPage() {
    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
    page.on('console', (m) => {
      let t = ''; try { t = m.text(); } catch (e) { return; }
      if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
    });
    await page.setViewport(VIEW);
    return page;
  }
  /* ⭐ 毎ページ localStorage.clear() してから種まき (印は腕ごと)。mark === null は印なし */
  async function prep(page, sid, mark) {
    await page.goto(base + '__blank.html', { waitUntil: 'load', timeout: 30000 });
    await page.evaluate((S, P, K, M) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      localStorage.setItem('dragonfighters.xp', '20000');
      if (M !== null) localStorage.setItem(K, M);
      sessionStorage.setItem('dragonfighters.currentScenario', S);
      sessionStorage.setItem('dragonfighters.partyMembers', P);
    }, sid, J(PARTY), EGG_KEY, mark);
  }
  async function boot(sid, mark, q) {
    const page = await newPage();
    await prep(page, sid, mark);
    await page.goto(base + F_INDEX + (q || '?diag=1'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction("typeof RUN !== 'undefined' && RUN && typeof enterNode === 'function' && typeof buildNode === 'function'", { timeout: 90000 });
    ctx.booted++;
    return page;
  }
  /* 起動 → 起動の観測 → 種つきの buildNode (node 省略 = 入口ノード) → 閉じる */
  async function armBuild(sid, mark, q, node, seed) {
    const page = await boot(sid, mark, q);
    await sleep(600);
    const snap = await page.evaluate(BOOT_SNAP);
    const nd = node || snap.entry;
    const built = await page.evaluate(SEEDED_BUILD, { node: nd, seed });
    await page.close().catch(() => {});
    return { snap, built };
  }
  const wyrmsIn = (arr) => (arr || []).filter((x) => x[0] === WYRM).length;
  try {
    /* ══════════ 印なし: BASE / 今 (巣穴 n1・廃坑の入口) ══════════ */
    const SEED_KW = 111001, SEED_MINE = 111002, SEED_TOWER = 111003;
    const kwBase = await stage('kwBase', () => armBuild(KW, null, '?diag=1&__base=1', 'n1', SEED_KW), null);
    const kwCur = await stage('kwCur', () => armBuild(KW, null, '?diag=1', 'n1', SEED_KW), null);
    const mineBase = await stage('mineBase', () => armBuild(OTHERS[0], null, '?diag=1&__base=1', null, SEED_MINE), null);
    const mineCur = await stage('mineCur', () => armBuild(OTHERS[0], null, '?diag=1', null, SEED_MINE), null);
    /* ══════════ (1e) 印あり: 廃坑 / 塔の母 ══════════ */
    const mineEgg = await stage('mineEgg', () => armBuild(OTHERS[0], '1', '?diag=1', null, SEED_MINE), null);
    const towerCur = await stage('towerCur', () => armBuild(OTHERS[1], null, '?diag=1', null, SEED_TOWER), null);
    const towerEgg = await stage('towerEgg', () => armBuild(OTHERS[1], '1', '?diag=1', null, SEED_TOWER), null);
    /* ══════════ (1c)(1d) 門が閉じたままの腕 ══════════ */
    const closed = [];
    for (const m of ['0', 'true', '']) closed.push({ mark: m, r: await stage('mark' + J(m), () => armBuild(KW, m, '?diag=1', 'n1', SEED_KW), null) });
    const retire = await stage('retire', () => armBuild(KW, '1', '?diag=1&eggparent=0', 'n1', SEED_KW), null);

    /* ══════════ 印あり腕 (主): n0 → n1 → 観測 → 息の直接呼び → 戦闘 ══════════ */
    const ep = await boot(KW, '1');
    await ep.evaluate(() => { try { startGame(); } catch (e) {} });
    await sleep(1500);
    const E0 = await ep.evaluate(BOOT_SNAP);
    const EN = await stage('enterN1', () => ep.evaluate(ENTER_N1, { SETTLE: SETTLE.toString() }), {});
    const N1 = await stage('n1snap', () => ep.evaluate(N1_SNAP, { WYRM, CHIEF, ALTAR, DRAGON_REF, from: EN.playerAtEntry || null }), {});
    const D = await stage('direct', () => ep.evaluate(DIRECT, { WYRM, D6: D6_SEQ, BR: SRD.breath ? { n: SRD.breath.n, s: SRD.breath.s } : { n: -1, s: -1 }, HOLDERS: BREATH_HOLDERS }), {});
    /* (2c) 戦闘: 本番の runEncounter。頭と仲間の手番は何もしない (HP 999)。親竜の手番が WYRM_TURNS 回来たら全員を倒す */
    const B = await stage('battle', async () => {
      await ep.evaluate((WY, CT) => {
        window.__fireBreathProbe.length = 0;
        const S = window.__egS = { wyrm: [], other: { turns: 0, fireAdd: 0 }, killed: false };
        const _e = enemyAttackTurn;
        enemyAttackTurn = async function (idx) {
          const e = enemies[idx];
          const f0 = window.__fireBreathProbe.length;
          let r;
          try { r = await _e.apply(this, arguments); } finally {
            const fb = window.__fireBreathProbe.slice(f0).map((x) => JSON.parse(JSON.stringify(x)));
            if (e && e.type === WY) S.wyrm.push({ idx, fb });
            else { S.other.turns++; S.other.fireAdd += fb.length; }
          }
          return r;
        };
        const finish = () => {
          maxHp = Math.max(maxHp, 999); hp = maxHp; for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; }
          if (S.killed || S.wyrm.length < CT) return;
          S.killed = true;
          for (let i = 0; i < enemies.length; i++) { const x = enemies[i]; if (x && x.alive && !x.passiveNpc) { x.hp = 0; defeatEnemy(i); } }
        };
        playerAttackTurn = async function () { finish(); };
        allyAttackTurn = async function () { finish(); };
        S.wrapped = { enemy: enemyAttackTurn === window.enemyAttackTurn, player: playerAttackTurn === window.playerAttackTurn };
        maxHp = Math.max(maxHp, 999); hp = maxHp;
        for (const a of allies) { a.maxHp = Math.max(a.maxHp || 0, 999); a.hp = a.maxHp; }
        dialogPaused = false;
      }, WYRM, WYRM_TURNS);
      return ep.evaluate(async (CH, WY, START_MS, END_MS) => {
        const o = {};
        const S = window.__egS;
        const ci = enemies.findIndex((e) => e.type === CH);
        const c = enemies[ci];
        if (c && !encounterActive) {
          /* 族長の 3 マス左から開戦 (親竜は族長から 4 マス = 同じ索敵の輪の内) */
          const ctx0 = Math.floor((c.x + c.def.displaySize / 2) / TILE_SIZE), cty = Math.floor((c.y + c.def.displaySize / 2) / TILE_SIZE);
          playerX = (ctx0 - 3) * TILE_SIZE + TILE_SIZE / 2 - 48; playerY = cty * TILE_SIZE + TILE_SIZE / 2 - 58;
          await new Promise((r) => setTimeout(r, 400));
          try { tryStartEncounter(); } catch (e) { o.tseErr = e.message; }
        }
        const t0 = performance.now();
        while (!encounterActive && performance.now() - t0 < START_MS) await new Promise((r) => setTimeout(r, 250));
        o.started = !!encounterActive; o.startMs = Math.round(performance.now() - t0);
        const encTypes = () => { try { return Array.isArray(encounterEnemyIndices) ? encounterEnemyIndices.map((i) => enemies[i] && enemies[i].type) : null; } catch (e) { return null; } };
        o.enc = encTypes();
        if (!o.started) o.diag = { dialogPaused: !!dialogPaused, skillCheckActive: !!skillCheckActive, nodeBusy: !!nodeBusy, cur: currentNodeId, gameOver: !!gameOver };
        /* 開戦から終わりまで encounterEnemyIndices を見張る (増援の合流 mergeReinforcements も同じ runEncounter の内) */
        o.union = (o.enc || []).slice(); o.wyrmJoinMs = (o.enc || []).indexOf(WY) >= 0 ? 0 : null; o.gap = false;
        const t1 = performance.now();
        while ((encounterActive || encounterRunning) && performance.now() - t1 < END_MS) {
          await new Promise((r) => setTimeout(r, 250));
          const cur = encTypes() || [];
          for (const t of cur) if (o.union.indexOf(t) < 0) o.union.push(t);
          if (o.wyrmJoinMs === null && cur.indexOf(WY) >= 0) { o.wyrmJoinMs = Math.round(performance.now() - t1); o.wyrmJoinActive = !!encounterActive; o.encAtJoin = cur.slice(); }
          if (!encounterActive && o.wyrmJoinMs === null) o.gap = true;   /* 親竜の合流より前に戦闘が切れた = 別の戦闘 */
        }
        o.ended = !encounterActive && !encounterRunning; o.encMs = Math.round(performance.now() - t1);
        o.S = JSON.parse(JSON.stringify(S));
        return o;
      }, CHIEF, WYRM, ENC_START_WAIT_MS, ENC_END_WAIT_MS);
    }, null);
    await ep.close().catch(() => {});

    /* ══════════ 印あり腕 (撃破): §5 ══════════ */
    const K = await stage('defeat', async () => {
      const kp = await boot(KW, '1');
      await kp.evaluate(() => { try { startGame(); } catch (e) {} });
      await sleep(1500);
      await kp.evaluate(ENTER_N1, { SETTLE: SETTLE.toString() });
      const r = await kp.evaluate(async (WY, CH) => {
        const o = { said: [], weights: [] };
        const _dm = showDMMessage, _pick = pickScrollId;
        showDMMessage = function (t) { o.said.push(String(t)); return _dm.apply(this, arguments); };
        pickScrollId = function (w) { o.weights.push(JSON.parse(JSON.stringify(w || null))); return _pick.apply(this, arguments); };
        const wi = enemies.findIndex((e) => e.type === WY);
        o.wi = wi;
        o.slain0 = runHiddenFoeSlain; o.relicP0 = clearChestRelicP();
        o.P = CLEAR_CHEST_RELIC_P; o.PH = CLEAR_CHEST_RELIC_P_HIDDEN;
        if (wi >= 0) {
          const W = enemies[wi];
          o.isHidden = isHiddenFoe(W);
          o.deathLine = W.def.deathLine || null; o.name = W.def.name;
          W.hp = 0; defeatEnemy(wi);
          o.wAfterWyrm = o.weights.slice();
          await new Promise((res) => setTimeout(res, 1500));
          o.saidAfterWyrm = o.said.slice();
          o.alive = !!W.alive; o.slain1 = runHiddenFoeSlain; o.relicP1 = clearChestRelicP();
        }
        /* 比べる相手: 既存の隠し要素 (ミミック) と ボス (族長) の確定ドロップの重み (本番の maybeGrantScrollDrop) */
        const w0 = o.weights.length;
        maybeGrantScrollDrop({ type: 'mimic', def: ENEMY_TYPES.mimic });
        o.wMimic = o.weights.slice(w0);
        const w1 = o.weights.length;
        maybeGrantScrollDrop({ type: CH, def: ENEMY_TYPES[CH] });
        o.wBoss = o.weights.slice(w1);
        /* (5d) 残りを全部倒して勝利の一言 */
        const s0 = o.said.length;
        for (let i = 0; i < enemies.length; i++) { const x = enemies[i]; if (x && x.alive && !x.passiveNpc) { x.hp = 0; defeatEnemy(i); } }
        await new Promise((res) => setTimeout(res, 400));
        if (!dungeonCleared) { try { checkDungeonClear(); } catch (e) { o.checkErr = e.message; } }
        await new Promise((res) => setTimeout(res, 800));
        o.cleared = !!dungeonCleared; o.egg = window.__redEggNarrated === true;
        o.saidClear = o.said.slice(s0);
        showDMMessage = _dm; pickScrollId = _pick;
        o.wrappedBack = (showDMMessage === _dm && pickScrollId === _pick);
        return o;
      }, WYRM, CHIEF);
      await kp.close().catch(() => {});
      return r;
    }, null);

    /* ══════════════════════════ 判定 ══════════════════════════ */
    const cntT = (arr, t) => (arr || []).filter((x) => (Array.isArray(x) ? x[0] : x.type) === t).length;
    /* ── §0 ── */
    const SE = N1.seams || {};
    R.check('(0a)', '[装置] __koboldWarrenTV.eggParent (on / extras / narration / wyrms / breathProbe)・ENEMY_TYPES.' + WYRM + '・window.__fireBreathProbe・HIDDEN_FOE_TYPES が見える',
      SE.tv && SE.ep && (SE.epFns || []).length === 4 && SE.epOn === true && SE.def && SE.probe && Array.isArray(SE.hidden), SE);
    const baseN1Kob = kwBase && kwBase.built ? cntT(kwBase.built.spawns, KOBOLD) : -1;
    R.check('(0b)', '[装置] 印あり腕の n1 で 族長 1・コボルド ' + baseN1Kob + ' (= ' + BASE_REV + ' の n1 と同数・1 以上)・親竜 1 が台帳 nodeSpawnsFor("n1") と実体 enemies の両方に居る',
      N1.cur === 'n1' && baseN1Kob >= 1 && cntT(N1.ledger, CHIEF) === 1 && cntT(N1.ledger, KOBOLD) === baseN1Kob && cntT(N1.ledger, WYRM) === 1
        && cntT(N1.enemies, CHIEF) === 1 && cntT(N1.enemies, KOBOLD) === baseN1Kob && cntT(N1.enemies, WYRM) === 1,
      { cur: N1.cur, ledger: N1.ledger, enemies: (N1.enemies || []).map((e) => e.type + '@' + e.tile), baseKobolds: baseN1Kob });
    R.check('(0d)', '[装置] SRD ' + SRD_SLUG + '.md から AC / HP / CR / STR・DEX / 噛みつき / 息 (ダイス・DC・セーヴ・Recharge・属性) / 火の完全耐性が欠けずに取れる',
      SRD.missing.length === 0 && !!SRD.breath && SRD.breath.el === SRD.breath.dmgEl && (SRD.immune || []).length >= 1,
      { missing: SRD.missing, cr: SRD.cr, ac: SRD.ac, hp: SRD.hp, str: SRD.str, dex: SRD.dex, bite: SRD.bite, breath: SRD.breath, immune: SRD.immune, dir: SRD_DIR });
    /* ── §1 ── */
    const sameBuild = (a, b) => !!a && !!b && !a.err && !b.err && J(a.spawns) === J(b.spawns) && J(a.enemies) === J(b.enemies) && a.calls === b.calls && a.next === b.next;
    const kwB = kwBase || {}, kwC = kwCur || {};
    R.check('(1a)', '印なし → n0・n1 とも親竜 0 体 (台帳の追加物も空)・n1 の顔ぶれ・座標・個体の HP (同じ種の buildNode) と開幕の語りが ' + BASE_REV + ' と同じ',
      !!kwB.snap && !!kwC.snap && wyrmsIn(kwC.snap.enemies) === 0 && wyrmsIn(kwC.snap.spawns) === 0 && wyrmsIn(kwC.built.spawns) === 0 && wyrmsIn(kwC.built.enemies) === 0
        && !!kwC.snap.ep && kwC.snap.ep.on === false && J(kwC.snap.extras) === J(kwB.snap.extras)
        && sameBuild(kwB.built, kwC.built) && J(kwC.snap.narr) === J(kwB.snap.narr) && (kwB.snap.narr || []).length >= 2,
      { n0: { base: kwB.snap && kwB.snap.enemies, cur: kwC.snap && kwC.snap.enemies }, n1: { base: kwB.built && kwB.built.spawns, cur: kwC.built && kwC.built.spawns },
        hp: [kwB.built && kwB.built.enemies.map((e) => e[3]), kwC.built && kwC.built.enemies.map((e) => e[3])], ep: kwC.snap && kwC.snap.ep, extras: [kwB.snap && kwB.snap.extras, kwC.snap && kwC.snap.extras],
        narr: [kwB.snap && (kwB.snap.narr || []).length, kwC.snap && (kwC.snap.narr || []).length] });
    const bNarr = (kwB.snap && kwB.snap.narr) || [];
    const eNarr = E0.narr || [];
    const narrPlusOne = eNarr.length === bNarr.length + 1 && J(eNarr.slice(0, 3).concat(eNarr.slice(4))) === J(bNarr) && eNarr[3] && bNarr.indexOf(eNarr[3]) < 0;
    R.check('(1b)', '印 "1" → n1 にちょうど 1 体 (台帳・実体・シームの wyrms())・n0 に 0 体・門のシームは on・開幕の語りは ' + BASE_REV + ' の 4 行の 3 行目の後に 1 行足した ' + (bNarr.length + 1) + ' 行',
      E0.cur === E0.entry && wyrmsIn(E0.enemies) === 0 && wyrmsIn(E0.spawns) === 0 && !!E0.ep && E0.ep.on === true
        && cntT(N1.ledger, WYRM) === 1 && cntT(N1.enemies, WYRM) === 1 && (N1.wyrmsTV || []).length === 1 && narrPlusOne && J(N1.narrTV) === J(eNarr),
      { n0: { cur: E0.cur, enemies: E0.enemies }, n1: { ledger: N1.ledger, wyrmsTV: N1.wyrmsTV }, ep: E0.ep, narr: { base: bNarr.length, egg: eNarr.length, added: eNarr[3] } });
    const closedRows = closed.map((c) => ({ mark: c.mark, ok: !!c.r && !!c.r.snap && c.r.snap.mark === c.mark && !!c.r.snap.ep && c.r.snap.ep.on === false
      && wyrmsIn(c.r.snap.enemies) === 0 && wyrmsIn(c.r.built.spawns) === 0 && wyrmsIn(c.r.built.enemies) === 0 && J(c.r.snap.extras) === J(kwB.snap && kwB.snap.extras),
      on: c.r && c.r.snap && c.r.snap.ep && c.r.snap.ep.on, mk: c.r && c.r.snap && c.r.snap.mark, n1: c.r && c.r.built && c.r.built.spawns.map((s) => s[0]) }));
    R.check('(1c)', '印 "0" / "true" / 空文字 → 門は閉じたまま (on 偽)・n0・n1 とも親竜 0 体・台帳の追加物は印なしと同じ',
      closedRows.length === 3 && closedRows.every((r) => r.ok), closedRows);
    const RT = retire || {};
    R.check('(1d)', '印 "1" + ?eggparent=0 → 門は閉じる・n0・n1 とも親竜 0 体・開幕の語りは ' + BASE_REV + ' と同じ ' + bNarr.length + ' 行',
      !!RT.snap && RT.snap.mark === '1' && !!RT.snap.ep && RT.snap.ep.on === false && wyrmsIn(RT.snap.enemies) === 0 && wyrmsIn(RT.built.spawns) === 0 && wyrmsIn(RT.built.enemies) === 0
        && J(RT.snap.narr) === J(bNarr) && bNarr.length >= 2,
      { on: RT.snap && RT.snap.ep && RT.snap.ep.on, n1: RT.built && RT.built.spawns.map((s) => s[0]), narr: RT.snap && (RT.snap.narr || []).length });
    const otherRow = (name, a, b) => ({ name, ok: !!a && !!b && a.snap.mark === null && b.snap.mark === '1' && a.snap.scen === b.snap.scen && a.snap.scen === name
      && J(a.snap.extras) === J(b.snap.extras) && J(a.snap.nodes) === J(b.snap.nodes) && sameBuild(a.built, b.built) && wyrmsIn(b.built.enemies) === 0 && (a.built.enemies || []).length > 0,
      nodes: a && a.snap.nodes, entry: a && a.built.node, enemies: [a && a.built.enemies.length, b && b.built.enemies.length], next: [a && a.built.next, b && b.built.next] });
    const others = [otherRow(OTHERS[0], mineCur, mineEgg), otherRow(OTHERS[1], towerCur, towerEgg)];
    R.check('(1e)', '他のシナリオ (' + OTHERS.join(' / ') + ') は印 "1" でも 全ノードの台帳の追加物と入口ノードの顔ぶれ・座標・HP・乱数 (同じ種の buildNode) が印なしと同じ',
      others.every((r) => r.ok), others);
    /* ── §2 ── */
    R.check('(2a)', '親竜のタイルが本番の isTileWall で床・祭壇の矩形 (col ' + ALTAR.c1 + '-' + ALTAR.c2 + ' / row ' + ALTAR.r1 + '-' + ALTAR.r2 + ') の外・体の箱 (isBodyClear) も床',
      N1.wi >= 0 && N1.wall === false && N1.inAltar === false && N1.bodyClear === true && (N1.body || []).length >= 1,
      { tile: N1.wyrmTile, wall: N1.wall, inAltar: N1.inAltar, body: N1.body, bodyClear: N1.bodyClear });
    R.check('(2b)', '本番の aStar で n1 の入場 ' + J(EN.playerAtEntry) + ' → 親竜が通る・入場からの直線距離 ≥ ' + MIN_DIST + ' タイル',
      EN.cur === 'n1' && Array.isArray(EN.playerAtEntry) && N1.wi >= 0 && N1.path !== null && N1.path > 0 && N1.dist >= MIN_DIST,
      { from: EN.playerAtEntry, to: N1.wyrmTile, path: N1.path, dist: N1.dist && +N1.dist.toFixed(2), settle: EN.settle });
    /* 戦闘の親竜の手番の状態機械 (Recharge の下限は SRD) */
    const RMIN = SRD.breath ? SRD.breath.rmin : 99;
    const machineOf = (rows) => {
      let spent = false;
      return rows.map((t) => {
        const fb = t.fb || [];
        let ok = true, i = 0;
        if (spent) { const r = fb[0]; ok = !!r && r.site === 'recharge' && r.ready === (r.d6 >= RMIN) && r.d6 >= 1 && r.d6 <= 6; if (ok && r.ready) spent = false; i = 1; }
        const rest = fb.slice(i).map((x) => x.site + (x.reason ? ':' + x.reason : ''));
        if (ok) { if (spent) ok = J(rest) === J(['bite:spent']); else { ok = J(rest) === J(['breath']); spent = true; } }
        return { k: fb.map((x) => x.site + (x.site === 'recharge' ? ':' + x.d6 : '') + (x.reason ? ':' + x.reason : '')), ok };
      });
    };
    const BB = B || {};
    const bRows = machineOf((BB.S && BB.S.wyrm) || []);
    R.check('(2c)', '族長と親竜が同じ 1 つの戦闘に入る (本番の tryStartEncounter で族長が交戦 → 同じ runEncounter の encounterEnemyIndices に親竜も入る = 開戦時か増援の合流)・戦闘の親竜の手番 ' + WYRM_TURNS + ' 回が Recharge の状態機械に乗る・他の敵の手番で火の息 0',
      BB.started === true && (BB.enc || []).indexOf(CHIEF) >= 0 && (BB.union || []).indexOf(WYRM) >= 0 && BB.wyrmJoinMs !== null && BB.gap === false
        && (BB.wyrmJoinMs === 0 || BB.wyrmJoinActive === true) && !!BB.S && BB.S.wyrm.length >= WYRM_TURNS
        && bRows.every((r) => r.ok) && BB.S.other.fireAdd === 0 && BB.ended === true,
      { started: BB.started, encAtStart: BB.enc, encAtWyrmJoin: BB.encAtJoin || null, wyrmJoinMs: BB.wyrmJoinMs, gap: BB.gap, union: BB.union, rows: bRows, other: BB.S && BB.S.other,
        ended: BB.ended, encMs: BB.encMs, diag: BB.diag, wrapped: BB.S && BB.S.wrapped });
    /* ── §3 ── */
    const DFv = N1.def || {};
    const bite = SRD.bite || {}, brS = SRD.breath || {};
    R.check('(3a)', '型の値 = SRD の md: AC ' + SRD.ac + '・HP ' + SRD.hp + ' (実体も)・STR ' + SRD.str + '→' + mod(SRD.str) + '・DEX ' + SRD.dex + '→' + mod(SRD.dex) + '・命中 +' + bite.atk + '・噛みつき ' + bite.n + 'd' + bite.s + '+' + bite.bonus
      + '・息 ' + brS.n + 'd' + brS.s + ' DC ' + brS.dc + '・breathElement "' + brS.el + '"・isBoss 偽・breathChance 無し',
      SRD.missing.length === 0 && DFv.sameAsTypes === true && DFv.ac === SRD.ac && DFv.hp === SRD.hp && N1.hpInst === SRD.hp && DFv.str === mod(SRD.str) && DFv.dex === mod(SRD.dex)
        && DFv.atkBonus === bite.atk && DFv.dmgDice === bite.n + 'd' + bite.s && DFv.dmgBonus === bite.bonus
        && DFv.breathDice === brS.n + 'd' + brS.s && DFv.breathDC === brS.dc && DFv.breathElement === brS.el && DFv.isBoss === false && DFv.hasBreathChance === false,
      { def: DFv, hpInst: N1.hpInst });
    R.check('(3b)', 'ENEMY_TRAITS.' + WYRM + ' の完全耐性 ⊇ SRD の Damage Immunities ' + J(SRD.immune) + '・resolveElementDefense の火 20 → 0 (冷気は通る)・LORE_CR = SRD の CR ' + SRD.cr + '・LORE_SKILL_OF = ' + DRAGON_REF + ' と同じ "arcana"',
      !!N1.trait && Array.isArray(N1.trait.immune) && (SRD.immune || ['?']).every((x) => N1.trait.immune.indexOf(x) >= 0)
        && !!N1.fire && N1.fire.immune === true && N1.fire.dmg === 0 && !!N1.cold && N1.cold.dmg === 20
        && N1.loreCr === SRD.cr && N1.loreSkill === N1.loreSkillRef && N1.loreSkill === 'arcana',
      { trait: N1.trait, fire: N1.fire, cold: N1.cold, loreCr: N1.loreCr, loreSkill: N1.loreSkill, ref: N1.loreSkillRef });
    R.check('(3c)', 'detectEnemyFamily([親竜]) が "dragon" でない (generic)・n1 全員の交戦は "kobold"・族長だけも "kobold"',
      N1.wi >= 0 && N1.fam !== 'dragon' && N1.fam === 'generic' && N1.famAll === 'kobold' && N1.famChief === 'kobold',
      { fam: N1.fam, famAll: N1.famAll, famChief: N1.famChief });
    /* ── §4 ── */
    const SQ = (D && D.seq) || { turns: [] };
    /* 期待の並び = d6 の列と SRD の Recharge の下限から状態機械で導く (⛔ 写経しない) */
    const seqWant = (() => { const w = []; let spent = false, k = 0; for (let t = 0; t <= D6_SEQ.length; t++) { const row = []; if (spent) { const d = D6_SEQ[k++]; const ready = d >= RMIN; row.push('recharge:' + d + ':' + (ready ? 'ready' : 'no')); if (ready) spent = false; } if (!spent) { row.push('breath'); spent = true; } else row.push('bite:spent'); w.push(row); } return w; })();
    const t1 = SQ.turns[0] || {};
    R.check('(4a)', '最初の手番 (本番の enemyAttackTurn) で息 (probe "breath" だけ・enemyIdx と turn 1)・息は window.__breathProbe に 1 件 (DC = SRD ' + brS.dc + ')・その手番の d20 はセーヴの人数 (hitCount) と同じ = 噛みつきの命中を振らない・使用済みになる',
      SQ.turns.length >= 1 && J(t1.add) === J(['breath']) && t1.idxOk === true && !t1.err && (t1.bp || []).length === 1 && t1.bp[0].dc === brS.dc && t1.bp[0].hitCount >= 1
        && t1.d20 === t1.bp[0].hitCount && t1.spent === true && t1.wyrmTurn === 1,
      { t1, err: (D && D.err) || null });
    const seqRows = SQ.turns.map((t, i) => {
      const want = seqWant[i] || [];
      const breathTurn = want[want.length - 1] === 'breath';
      const ok = J(t.add) === J(want) && t.idxOk && !t.err && (breathTurn ? ((t.bp || []).length === 1 && t.d20 === t.bp[0].hitCount) : ((t.bp || []).length === 0 && t.d20 >= 1));
      return { t: t.t, add: t.add, want, d20: t.d20, bp: (t.bp || []).map((b) => b.hitCount), ok };
    });
    R.check('(4b)', '次の手番から d6 を 1 回ずつ (d6 = ' + D6_SEQ.join(',') + ')・' + RMIN + ' 未満は戻らず噛む (息の記録 0・d20 1 回以上)・' + RMIN + ' 以上は戻ってその手番に息 / 並びは d6 と SRD の Recharge ' + RMIN + '-6 から導いた状態機械と同じ',
      SQ.turns.length === D6_SEQ.length + 1 && seqRows.every((r) => r.ok) && SQ.d6used === D6_SEQ.length, { rows: seqRows, d6used: SQ.d6used });
    const saveOk = (c, wantSaved) => {
      if (!c || c.err || c.hf !== 1 || J(c.add) !== J(['breath']) || (c.bp || []).length !== 1) return false;
      const bp = c.bp[0];
      const hits = c.drops.filter((d) => d.drop > 0);
      if (bp.dc !== brS.dc || bp.hitCount < 1 || bp.hitCount !== hits.length || c.raws.length !== hits.length || c.calls !== hits.length) return false;
      if (bp.savedCount !== (wantSaved ? bp.hitCount : 0)) return false;
      return hits.every((h, j) => {
        const raw = Math.max(1, c.raws[j]);
        if (c.raws[j] < brS.n || c.raws[j] > brS.n * brS.s) return false;
        const base = wantSaved ? Math.max(1, Math.floor(raw / 2)) : raw;
        return h.drop === Math.max(1, Math.round(base * h.mult));
      });
    };
    const sv = (D && D.save) || [];
    const sFail = sv.find((c) => c.roll === 1), sSave = sv.find((c) => c.roll === 20);
    R.check('(4c)', '息の中で hydraFireBreath が 1 回呼ばれ、3x3 の中の隊員の HP が減る: DEX セーヴ d20 = 1 → 全員失敗・全額 (' + brS.n + 'd' + brS.s + ' の出目) / d20 = 20 → 全員成功・半減 (切り捨て・最低 1)・DC ' + brS.dc + '・HP の減りは息の出目と仲間 (並び順) → 頭の順に一致',
      saveOk(sFail, false) && saveOk(sSave, true),
      { fail: sFail && { calls: sFail.calls, raws: sFail.raws, drops: sFail.drops, bp: sFail.bp, hf: sFail.hf, add: sFail.add, err: sFail.err, ok: saveOk(sFail, false) },
        save: sSave && { calls: sSave.calls, raws: sSave.raws, drops: sSave.drops, bp: sSave.bp, hf: sSave.hf, add: sSave.add, err: sSave.err, ok: saveOk(sSave, true) } });
    const ot = (D && D.others) || [];
    const btypes = N1.breathTypes || [];
    const staticOk = btypes.filter((x) => x.k !== WYRM).every((x) => x.boss || x.el !== 'fire') && btypes.some((x) => x.k === WYRM && !x.boss && x.el === 'fire');
    R.check('(4d)', '既存の息持ち (' + BREATH_HOLDERS.join(' / ') + ') は火の分岐を通らない: 静的 (breathDice を持つ親竜以外の型は全部ボスか火でない) / 親竜の def を各型の def へ差し替えて本番の enemyAttackTurn を 1 手番 → 火の息の probe 0・__wyrmTurn 不変',
      staticOk && ot.length === BREATH_HOLDERS.length && ot.every((r) => r.exists && r.breathDice && r.fireAdd === 0 && r.wyrmTurnSame === true && !r.err),
      { static: btypes, rows: ot, wrappedBack: D && D.wrappedBack });
    /* ── §5 ── */
    const KK = K || {};
    R.check('(5a)', '本番の defeatEnemy で親竜を倒す → isHiddenFoe 真・runHiddenFoeSlain 偽 → 真・clearChestRelicP() が CLEAR_CHEST_RELIC_P (' + KK.P + ') → CLEAR_CHEST_RELIC_P_HIDDEN (' + KK.PH + ')',
      KK.wi >= 0 && KK.isHidden === true && KK.alive === false && KK.slain0 === false && KK.slain1 === true && KK.relicP0 === KK.P && KK.relicP1 === KK.PH && KK.P !== KK.PH,
      { wi: KK.wi, isHidden: KK.isHidden, slain: [KK.slain0, KK.slain1], relicP: [KK.relicP0, KK.relicP1], P: KK.P, PH: KK.PH });
    const wW = KK.wAfterWyrm || [], wM = KK.wMimic || [], wB = KK.wBoss || [];
    R.check('(5b)', '親竜の撃破で巻物の確定ドロップが 1 回・pickScrollId の重みが既存の隠し要素 (ミミック) と同じで、ボス (族長) と違う',
      wW.length === 1 && wM.length === 1 && wB.length === 1 && J(wW[0]) === J(wM[0]) && J(wW[0]) !== J(wB[0]),
      { wyrm: wW, mimic: wM, boss: wB });
    const dl = KK.deathLine ? (KK.saidAfterWyrm || []).filter((t) => t.indexOf('「' + KK.deathLine + '」') >= 0 && t.indexOf(KK.name) >= 0) : [];
    R.check('(5c)', '倒したときの字幕 (showDMMessage) に deathLine「' + (KK.deathLine || '?') + '」と名前が 1 回出る',
      !!KK.deathLine && dl.length === 1, { said: KK.saidAfterWyrm, deathLine: KK.deathLine });
    const eggSaid = (KK.saidClear || []).filter((t) => t === EGG_LINE);
    R.check('(5d)', '印ありの巣穴の勝利 (残りを倒して checkDungeonClear) で勝利の一言が ' + BASE_REV + ' と同じ文「' + EGG_LINE.slice(0, 24) + '…」で 1 回・__redEggNarrated 真',
      KK.cleared === true && KK.egg === true && eggSaid.length === 1, { cleared: KK.cleared, egg: KK.egg, saidClear: KK.saidClear, checkErr: KK.checkErr || null });
    /* ── §6 ── */
    const curIndex = servedFile(F_INDEX, mutKey);
    const fnRows = KEEP_FNS.map((n) => { const a = fnSource(BASE_INDEX, n), b = fnSource(curIndex, n); return { n, base: a ? a.length : null, cur: b ? b.length : null, same: !!a && a === b }; });
    R.check('(6a)', '⭐ 触らない約束の関数 (' + KEEP_FNS.join(' / ') + ') のソースが ' + BASE_REV + ' と同じ',
      fnRows.every((r) => r.same && r.cur > 200),
      '関数 / 長さ (基準→今) / 同じ: ' + fnRows.map((r) => r.n + ' / ' + r.base + '→' + r.cur + ' / ' + (r.same ? '同' : '✗違')).join(' ; '));
    const lineRows = ANCHOR_LINES.map((l) => ({ line: l.trim().slice(0, 60), base: lineCount(BASE_INDEX, l), cur: lineCount(curIndex, l) }));
    R.check('(6b)', '錨の 3 行 (台帳の引き / questFlagOn の concat / 冷気の息の入口) が ' + BASE_REV + ' と今でちょうど 1 行ずつ同じ字面',
      lineRows.every((r) => r.base === 1 && r.cur === 1), lineRows);
    const m6 = (mineBase && mineCur) ? { base: mineBase.built, cur: mineCur.built } : null;
    R.check('(6c)', '印なしの巣穴 n1 と ' + OTHERS[0] + ' の入口ノードで、同じ種の buildNode の後の Math.random の次の値・呼び出し回数・顔ぶれ・座標・HP が ' + BASE_REV + ' と同じ',
      sameBuild(kwB.built, kwC.built) && !!m6 && sameBuild(m6.base, m6.cur) && (m6.cur.enemies || []).length > 0 && (kwC.built.enemies || []).length > 0,
      { kw: { calls: [kwB.built && kwB.built.calls, kwC.built && kwC.built.calls], next: [kwB.built && kwB.built.next, kwC.built && kwC.built.next], err: [kwB.built && kwB.built.err, kwC.built && kwC.built.err] },
        mine: m6 && { node: m6.cur.node, calls: [m6.base.calls, m6.cur.calls], next: [m6.base.next, m6.cur.next], n: [m6.base.enemies.length, m6.cur.enemies.length], err: [m6.base.err, m6.cur.err] } });
    /* ══════════ (0c) ══════════ */
    R.check('(0c)', '[装置] 全ページで pageerror 0 件 (段の例外は記録だけ: 例外の出た段の節が赤になる)', ctx.booted > 0 && ctx.errs.length === 0,
      '起動 ' + ctx.booted + ' 回 / pageerror ' + J(ctx.errs.slice(0, 3)) + ' / 段の例外 ' + J(STAGE_ERRS) + ' / 直接呼びの例外 ' + J((D || {}).err || null));
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await sleep(200);   // console イベントの取りこぼしを避ける
    for (const p of pages) await p.close().catch(() => {});
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_egg_parent_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 900000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  const run = async (port, key, lab) => {
    const srv = await startServer(port, key);
    console.log('\n[vet] ════════ ' + lab + ' (port ' + port + ') ════════');
    const t0 = Date.now();
    const R = await runSuite(browser, port, key, lab);
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
      const hits0 = Object.keys(R0.hits);
      if (s0.failed || R0.length !== ALL_IDS.length || hits0.length) {
        console.error('[vet] ⛔ 素の基準で FAIL がある / 判定数が合わない / 変異の印が出た (' + J(R0.hits) + ') — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = mutPort(key);
          const R = await run(port, key, '[変異 ' + key + ']');
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const hit = R.hits[key] || 0;
          const want = NEG_EXPECT[key], maybe = NEG_MAYBE[key];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = red.filter((x) => want.indexOf(x) < 0 && maybe.indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = hit > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + (maybe.length ? ' (確率で赤 ' + maybe.join(',') + ')' : '')
            + ' / 実際に赤くなった=' + (red.join(',') || '(なし)') + ' / 注入行の実行 ' + hit + ' 回 / 依頼書の予想=' + NEG_PREDICTED[key].join(',') + ' → ' + (ok ? '✓ OK' : '✗ ' + (hit ? '' : '注入行が実行されていない ')
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, maybe, red, ok, hit });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (必ず赤 ⊆ 赤 ⊆ 必ず赤 ∪ 確率で赤)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(13) + ' 担当 ' + r.want.join(',') + (r.maybe.length ? ' (+確率 ' + r.maybe.join(',') + ')' : '')
          + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 注入行 ' + r.hit + ' 回');
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルが赤・担当外の赤 0・注入行はすべて実行');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = mutPort(MUTATE);
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
