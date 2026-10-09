#!/usr/bin/env node
/*
 * verify_corner_check.js — 実装依頼書 #87「判定パネルを左上へ小さく + 戦闘中は判定を出さない + 道中の宝箱を廃止」の受入ドライバ
 *   (依頼書 2026-10-06_corner-check-no-road-chests.md §8 + §12-0 K1〜K14 + §12-1 K15〜K18 + §12-2 K19〜K25 + §12-3)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_corner_check.js                        # 素 (port 10586)
 *   node tools/verify_corner_check.js --negative             # 素の基準 + 変異 11 本 (port 10587〜10597)
 *   node tools/verify_corner_check.js --negative --only veil,chests
 *   node tools/verify_corner_check.js --mutate noawait       # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる)
 *
 * ■ 方針 (依頼書 §8)
 *   - DOM の矩形 (getBoundingClientRect / elementFromPoint / getComputedStyle) と呼び出しの記録 (関数の包み) の 2 経路で測る。
 *   - 判定パネルは本物の js/skill-check.js をそのまま開く (⛔ 出目を差し替えない。罠の選択の後の判定だけ固定の失敗にする)。
 *   - 盤面は本番の入口 (resetNodeState → buildNode(resolveNodeMapDef(id), id)) で全ノードを組み、湧き口を window 上で包んで
 *     宝箱に出所を付ける。⭐ Math.random は盤面のページだけ mulberry32(87003) で種付け (単一マップの生成クエストも 2 腕で比べるため)。
 *   - 金貨は coins = 7 → showResult(true) → sessionStorage の lastResult.reward.gold。補填の期待値は
 *     「?roadchest=0 の腕の盤面に湧いた道中の宝箱の数 × ページの ROAD_CHEST_GOLD_EACH」= 盤面と金貨の 2 経路 (単価 25 そのものは測らない)。
 *
 * ■ ページ (素 1 回 = 24 枚)
 *   UI   D  = index 1280x900 PC 展開 (沼・4 人 = 戦士 / 盗賊 / 僧侶 / 魔法使い): パネル (G) → 罠の選択 ±メイジハンド + 他の選択 (T) → §2-3 の穴 (H)
 *        DC = index 1280x900 PC 畳み (panelCollapsed): G (+ 上中央の #battleBanner / #dmMessage を本物の関数で出す) → T
 *        C  = index 390x844 compact: G (+ #phaseIndicator) → T
 *        S  = index 1280x900: startGame → 戦闘中の隠密 + 門
 *        D0 = index?cornercheck=0 (G → T)、S0 = index?cornercheck=0 の S
 *        TV = tavern.html / WD = world.html の判定パネル (恒等)
 *   盤面 7 シナリオ (廃坑 / 森 / 沼 / 砦 / 神殿 / 竜 / 塔の母) + 生成クエスト tier3 × (既定 / ?roadchest=0) = 16 枚
 *
 * ■ 測っているもの
 *   §0 (0a) [装置] 探索判定のパネルが実際に 1 回以上表示された (本物の runRoomSearchCheck 経由・H の観測)
 *      (0b) [装置] 戦闘開始時の隠密判定の呼び出しを 1 回以上捉えた (盗賊入り編成・tryStealthSurprise → dfSkillCheck)
 *      (0c) [装置] 罠の選択の器 (#choiceDialog.show) が 1 回以上出た (3 姿勢 × メイジハンドあり / なし)
 *      (0d) [装置] 全ページで pageerror 0 件
 *   §1 (1a) パネル (4 人のロスター) の矩形: left ≥ --ui-menu-w・top ≤ 80・width ≤ 260・縦 ≤ 300 (ロール前 / 結果表示)、
 *           PC 2 姿勢は right < 画面幅の 50%・compact は right ≤ 画面幅 (K26: 390px で 260px 幅は 50% を原理的に超える)
 *      (1b) [K6 (a) の言い直し] 畳み / compact の ☰ と交わらない・compact の #phaseIndicator と交わらない・
 *           PC 畳みでは上中央の #battleBanner / #dmMessage と交わらない (パネルと罠の器の両方)。⛔ PC 展開と compact の DM 文は測らない
 *      (1c) 暗幕なし: overlay の背景の alpha = 0 かつ pointer-events none・カードの外の点は overlay に当たらない・カード上の点はカード
 *           (3 姿勢)・カード上の実クリックでロール → 閉じる
 *   §2 (2a) 罠の選択の器: §1 と同じ絶対の帯 (left ≥ --ui-menu-w・top ≤ 80・幅 ≤ 260・PC は right < 50%)・body.dfCornerChoice が開いている間だけ付く・閉じたら外れる
 *           (3 姿勢 × メイジハンドあり / なし)
 *      (2b) 他の #choiceDialog の利用者 (showChoice) は下端の帯 (bottom ≥ 画面高 − 2・top > 画面高の半分・dfCornerChoice なし・ログ枠は伏せる)
 *   §3 (3a) 戦闘中 (encounterActive) の隠密: パネル表示 0 回・resolveSkillCheck が stealth で 1 回・結果が頭上の吹き出し (STEALTH) と
 *           ログの 2 経路に出る
 *      (3a2) [K16] tryStealthSurprise が門 (dfSkillCheck) へ渡す opts.auto が true (門が足し直す前の値)
 *      (3a3) [K16] 門単独の効き: 戦闘中に auto なしで dfSkillCheck を呼ぶと本体へ auto=true で届き、パネル 0 回
 *      (3b) 探索判定のパネル表示中に敵のタイルが動かない・敵の手番はパネルが閉じてから (§2-3 の穴 / K2 の B2 の型)
 *   §4 (4a) 7 シナリオ + 生成クエストで既定の腕の道中の宝箱 (玄室 / 隠し (鍵束以外) / 寄り道の出所) が 0・DOM の .roomChest = roomChests
 *           (母集団 = ?roadchest=0 の腕では全構成で 1 個以上湧く)
 *      (4b) 竜の巣ボスノードの財宝が 4 (ミミック 1) で位置が ?roadchest=0 と一致・森 (盗賊 + 噂) の鍵束が 1 で位置が一致・他ノードの財宝 0
 *      (4c) 勝利金貨: (既定 − ?roadchest=0) = ROAD_CHEST_GOLD_EACH × (?roadchest=0 の腕の道中の宝箱の数) かつ
 *           絶対量 (既定の gold − coins − clearGold) も同じ値 > 0
 *   §5 (5a) tavern.html / world.html の #skillCheckOverlay は画面全体・暗幕 (alpha > 0.3)・カードが中央 (±2px)・幅 > 260
 *      (5b) 罠の数と位置が ?roadchest=0 の腕と全ノードで一致 + 絶対量 (?roadchest=0 で罠のある構成は既定でも罠 > 0)
 *   §6 (6a) ?cornercheck=0 → パネルは画面全体・暗幕・pointer-events auto・カード幅 > 260 / 罠の選択は下端の帯で dfCornerChoice 0 回 /
 *           戦闘中の隠密でパネルが出る (opts.auto = false)
 *      (6b) ?roadchest=0 → ROAD_CHEST_ON = false・全構成で道中の宝箱が湧く・廃坑 n1 の寄り道 4 か所・gold − coins = 従来の clearGold
 *   ⛔ 測らないこと (依頼書 §8): パネル内の文字サイズ・アイコンの大きさ / 25G という単価そのもの /
 *      PC 展開と compact の DM 文との重なり (K6 (a) で受け入れる仕様)
 *
 * ■ ⚠ 計測機構
 *   - index.html は起動時に 1 回だけ readFileSync して凍結し、変異はその文字列をメモリ上で差し替えて配る
 *     (⛔ 本番ファイルは 1 バイトも触らない)。他のファイル (tavern / world / js) は都度ディスクから配る。
 *   - 起動時に全変異のアンカーを原本で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。
 *     罠E の自己検査: 自分のアンカーが他の tools/*.js のソースに出てこないこと。崩れたら素でも exit 3。
 *   - ⭐ --negative の合否 = 「必ず赤 (NEG_EXPECT) ⊆ 実際の赤 ⊆ 必ず赤 ∪ 確率で赤 (NEG_MAYBE)」。担当は --mutate で実走して決めた
 *     (依頼書 §12-3)。依頼書 §8 の予想 (NEG_PREDICTED) と違う所はログに出す。
 *   - ⛔ timeout コマンドで包まない。⛔ 8765 (試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0`。
 *
 * ■ ポート = **10586** (素) / 変異 **10587〜10597** (11 本・MUTATIONS の並び順)。次の新規ドライバ base = 10598 (⚠ 10600 は probe_magehand_reach)。
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
const PORT = parseInt(arg('port', '10586'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 依頼書が決めた条件 (データ) */
const MAX_W = 260;          // (1a)(2a) 幅
const MAX_TOP = 80;         // (1a) top (K15: 768px 以下は 80 ちょうど ⇒ ≤)
const MAX_H = 300;          // (1a) 4 人編成の縦 (依頼書 §4)
const TOL = 1;              // (2a) パネルと同じ帯 / (5a) 中央
const VIEW_D = { width: 1280, height: 900 };
const VIEW_C = { width: 390, height: 844 };   // ⚠ isMobile は付けない (memo: mobile emulation は innerWidth が発散する)
const PM4 = JSON.stringify([
  { classKey: 'warrior', isHero: true, zone: 'front', name: null, trait: null, line: null },
  { classKey: 'rogue', isHero: false, zone: 'mid', name: 'ニカ', trait: null, line: null },
  { classKey: 'cleric', isHero: false, zone: 'mid', name: 'ヨナ', trait: null, line: null },
  { classKey: 'mage', isHero: false, zone: 'rear', name: 'ガウェイン', trait: null, line: null }]);
const SEED = 87003;
const SCENS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair', 'tower-mother'];
const GEN_T3 = JSON.stringify({ title: 'verify_corner_check — tier3', flavor: 'verify', spawns: [['goblin', 30, 13], ['goblinKing', 57, 13]],
  clearXp: 1000, trapCount: 5, hiddenChestCount: 4, perceptionDC: 16, themeId: 'goblin-mine', questLevel: 1, tierKey: 'tier3' });
const LONG_DM = '息を殺し、影から忍び寄る。敵はまだ、こちらに気づいていない——最初の一手は、完全に我らのものだ。';
const ROAD_SRC = ['spawnRoomChests', 'spawnHiddenChests', 'spawnDetourChests'];

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const I = 'index.html';
const PRISTINE = { [I]: fs.readFileSync(path.join(ROOT, I), 'utf8') };
function vetFail(msg) { console.error('[vet] ⛔ ' + msg); process.exit(3); }
function envFail(msg) { console.error('[vet] ' + msg); process.exit(2); }
if (PRISTINE[I].indexOf('const CORNER_CHECK_ON') < 0) vetFail('配信する index.html に CORNER_CHECK_ON が無い (#87 項目2 より前のツリーで走らせている)');
if (PRISTINE[I].indexOf('const ROAD_CHEST_ON') < 0) vetFail('配信する index.html に ROAD_CHEST_ON が無い (#87 項目3 より前のツリーで走らせている)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本 + K16 の門 1 本)。⚠ 置換は 1 行の中だけ (行数不変)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const MUTATIONS = {
  /* 上書き CSS を外す (html.dfCornerCheck を付けない = CSS の規則が 1 本も当たらない) */
  centered: [{ file: I, from: '    if (CORNER_CHECK_ON) document.documentElement.classList.add("dfCornerCheck");', to: '    /* ★変異centered */ void 0;' }],
  /* 暗幕の背景だけ戻す (pointer-events は none のまま = 背景色で測る assert でしか捕まらない) */
  veil: [{ file: I, from: '      background: transparent !important; pointer-events: none !important;', to: '      pointer-events: none !important; /* ★変異veil */' }],
  /* 罠の選択を #choiceDialog の下の帯へ戻す */
  trapband: [{ file: I, from: '      if (CORNER_CHECK_ON) document.body.classList.add("dfCornerChoice");', to: '      /* ★変異trapband */ void 0;' }],
  /* #choiceDialog 全体を左上へ動かす (罠以外の利用者も飛ぶ) */
  allchoice: [{ file: I, from: '    body.dfCornerChoice #choiceDialog {', to: '    body #choiceDialog { /* ★変異allchoice */' }],
  /* 隠密の auto:CORNER_CHECK_ON を外す (⚠ K16: 門が足し直すのでパネルは出ない = (3a2) でしか捕まらない) */
  stealthpanel: [{ file: I, from: '            auto: CORNER_CHECK_ON,', to: '            /* ★変異stealthpanel */' }],
  /* §2-3 の穴を戻す (探索ターンの待ちを外す) */
  noawait: [{ file: I, from: '        await waitSkillCheckIdle();', to: '        void 0; /* ★変異noawait */' }],
  /* 宝箱の停止を外す (印は付くが抜かない)。⚠ 廃坑は寄り道を別の行が止めるので廃坑以外で赤 */
  chests: [{ file: I, from: '      dropRoadChests();', to: '      void 0; /* ★変異chests */' }],
  /* 竜の財宝まで止める。⚠ `if (!isBossNodeNow()) return;` は driver_graph_p6 のソースに在る (罠E) ので 1 行上で握る */
  hoardgone: [{ file: I, from: '      if (scenarioId !== "dragon-lair") return;', to: '      return; /* ★変異hoardgone */' }],
  /* kind 関門で止める (罠も隠し宝箱も鍵束も消える)。⚠ 恒等 assert は片方の腕だけを壊す変更でしか赤くならない ⇒ ROAD_CHEST_ON でだけ効かせる */
  trapsgone: [{ file: I, from: '      EXCLUDED_ROOMS = DFMapDef.excludedRoomIdxForKind(mapDef, nodeBuildKind, extra);',
    to: '      EXCLUDED_ROOMS = DFMapDef.excludedRoomIdxForKind(mapDef, ROAD_CHEST_ON ? "boss" : nodeBuildKind, ROAD_CHEST_ON ? null : extra); /* ★変異trapsgone */' }],
  /* 金貨の加算を外す */
  nogold: [{ file: I, from: '        const roadChestGold = roadChestBonusGold();', to: '        const roadChestGold = 0; /* ★変異nogold */' }],
  /* [K16] 門を殺す (戦闘中でも auto を足さない) */
  gateoff: [{ file: I, from: '      if (CORNER_CHECK_ON && (encounterActive || encounterRunning) && !(opts && opts.auto))',
    to: '      if (false && CORNER_CHECK_ON && (encounterActive || encounterRunning) && !(opts && opts.auto)) /* ★変異gateoff */' }],
};
/* 変異 → 必ず赤くなる節 (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた (依頼書 §12-3)。 */
const NEG_EXPECT = {
  centered:     ['(1a)', '(1c)'],
  veil:         ['(1c)'],
  trapband:     ['(2a)'],
  allchoice:    ['(2b)', '(6a)'],   // (6a) = body #choiceDialog は ?cornercheck=0 の腕でも効くので撤退の罠の器まで左上へ飛ぶ (§12-3)
  stealthpanel: ['(3a2)'],
  noawait:      ['(3b)'],
  chests:       ['(4a)'],
  hoardgone:    ['(4b)'],
  trapsgone:    ['(4b)', '(5b)'],   // (4b) = 鍵束も kind 関門の内側 (spawnHiddenChests) なので一緒に消える (§12-3)
  nogold:       ['(4c)'],
  gateoff:      ['(3a3)'],
};
/* 変異 → 時機しだいで赤くなり得る節 (緑でも赤でも可) */
const NEG_MAYBE = { centered: [], veil: [], trapband: [], allchoice: [], stealthpanel: [], noawait: [], chests: [], hoardgone: [], trapsgone: [], nogold: [], gateoff: [] };
/* 依頼書 §8 の予想 (記録用。実走と違う所はログに出す)。stealthpanel の (3a) は K16 で (3a2) へ言い直し、gateoff は §8 に無い (K16 で追加) */
const NEG_PREDICTED = {
  centered: ['(1a)', '(1c)'], veil: ['(1c)'], trapband: ['(2a)'], allchoice: ['(2b)'], stealthpanel: ['(3a)'], noawait: ['(3b)'],
  chests: ['(4a)'], hoardgone: ['(4b)'], trapsgone: ['(5b)'], nogold: ['(4c)'], gateoff: [],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 11) vetFail('変異は 11 本まで (ポート 10587〜10597)');
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
  const out = { [I]: PRISTINE[I] };
  for (const e of MUTATIONS[key]) {
    const c = countOf(PRISTINE[e.file], e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + e.file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
    if (countOf(PRISTINE[e.file], e.to) !== 0) vetFail('変異 ' + key + ' の注入文字列が原本に既に在る');
    out[e.file] = out[e.file].split(e.from).join(e.to);
  }
  if (out[I].split('\n').length !== PRISTINE[I].split('\n').length) vetFail('変異 ' + key + ' が ' + I + ' の行数を変えた');
  if (out[I] === PRISTINE[I]) vetFail('変異 ' + key + ' が何も変えていない');
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
  const buf = { [I]: Buffer.from(files[I], 'utf8') };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        res.on('error', () => {});
        let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (rel === '') rel = I;
        res.setHeader('Cache-Control', 'no-store');
        if (buf[rel]) { res.setHeader('Content-Type', MIME['.html']); res.end(buf[rel]); return; }
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
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(1a)', '(1b)', '(1c)', '(2a)', '(2b)', '(3a)', '(3a2)', '(3a3)', '(3b)',
  '(4a)', '(4b)', '(4c)', '(5a)', '(5b)', '(6a)', '(6b)'];
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
 * ページ側の観測 (⛔ 期待値の判定はここに書かない — 生の値だけ返す)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* 判定パネル (G): 本物のパネルを 4 人のロスターで開き、矩形・背景・当たりを測る。o.banners なら上中央の帯も本物の関数で出す */
const PANEL_OPEN = async (o) => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return null;
    return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const id = (x) => document.getElementById(x);
  const out = { err: null };
  try {
    window.__autoplay = 0;
    const pi = id('phaseIndicator'); if (pi) pi.classList.add('show');
    if (o.banners) { showBanner('⚔ 戦闘開始!', 8000); showDMMessage(o.dm, 8000); }
    const party = buildPerceptionParty();
    window.__v87res = 'pending';
    dfSkillCheck('perception', 12, party, { title: '探索判定', flavor: '部屋をひととおり検分する。罠の気配、隠されたものは…', iconContext: 'trap', voiceIds: {} })
      .then((r) => { window.__v87res = r ? 'ok' : 'null'; }, () => { window.__v87res = 'rejected'; });
    await new Promise((r) => setTimeout(r, 450));
    const ov = id('skillCheckOverlay'), card = id('skillCheckCard');
    const cs = getComputedStyle(ov);
    const vw = innerWidth, vh = innerHeight;
    Object.assign(out, { vw, vh, party: party.length,
      menuW: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-menu-w')) || 0,
      htmlCorner: document.documentElement.classList.contains('dfCornerCheck'),
      compact: document.body.classList.contains('ui-compact'), collapsed: document.body.classList.contains('ui-collapsed'),
      show: ov.classList.contains('show'), overlay: R(ov), card: R(card), ovBg: cs.backgroundColor, ovPE: cs.pointerEvents,
      toggle: R(id('partyToggleBtn')), phase: R(id('phaseIndicator')), banner: R(id('battleBanner')), dm: R(id('dmMessage')) });
    const px = Math.min(vw - 20, Math.round(vw * 0.75)), py = Math.round(vh * 0.6);
    const hit = document.elementFromPoint(px, py);
    out.outsideHit = hit ? (hit.id || hit.tagName) : null;
    out.outsideHitIsOverlay = !!(hit && (hit === ov || ov.contains(hit)));
    const c = card.getBoundingClientRect();
    const hit2 = document.elementFromPoint(c.left + c.width / 2, c.top + 10);
    out.cardHitInside = !!(hit2 && card.contains(hit2));
    out.clickAt = { x: c.left + c.width / 2, y: c.top + 12 };
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};
const PANEL_STATE = () => {
  const ov = document.getElementById('skillCheckOverlay'), card = document.getElementById('skillCheckCard');
  const r = card ? card.getBoundingClientRect() : null;
  return { show: !!(ov && ov.classList.contains('show')), h: r ? +r.height.toFixed(1) : null, b: r ? +r.bottom.toFixed(1) : null,
    result: ((document.querySelector('#skillCheckCard .scResult') || {}).textContent || '').trim(), res: window.__v87res,
    clickAt: r ? { x: r.left + r.width / 2, y: r.top + 12 } : null };
};
/* 罠の選択 (T): 隣に発見済みの罠を置き runTrapDisarmCheck を直に呼ぶ (±メイジハンド)。その後に罠以外の showChoice を開く */
const TRAP_CHOICES = async () => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return null;
    return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { arms: [], other: null, err: null };
  const SC = window.SkillCheck, orig = SC.resolveSkillCheck, origMH = window.mageHandCaster;
  try {
    window.__autoplay = 0;
    narrationHold = true; gameStarted = true;
    await wait(200);
    const dlgOf = () => document.getElementById('choiceDialog');
    const log = document.getElementById('combatLog');
    let cornerSeen = 0;
    const mo = new MutationObserver(() => { if (document.body.classList.contains('dfCornerChoice')) cornerSeen++; });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    for (const hand of [false, true]) {
      const pTX = Math.floor((playerX + 48) / TILE_SIZE), pTY = Math.floor((playerY + 58) / TILE_SIZE);
      traps.length = 0;
      traps.push({ tx: pTX + 1, ty: pTY, found: true, disarmed: false, rearmed: false, triggered: false, type: 'damage' });
      skillCheckActive = false; dialogPaused = false;
      window.mageHandCaster = hand ? () => ({ actor: allies.find((a) => a.classKey === 'mage'), name: 'ガウェイン', cx: playerX, cy: playerY }) : () => null;
      const calls = [];
      SC.resolveSkillCheck = function (k, dc) { calls.push(k); return Promise.resolve({ success: false, fumble: false, crit: false, roll: 5, total: 5, dc }); };
      const p = runTrapDisarmCheck();
      await wait(350);
      const dlg = dlgOf();
      const a = { hand, rect: R(dlg), show: !!(dlg && dlg.classList.contains('show')), bodyCorner: document.body.classList.contains('dfCornerChoice'),
        nButtons: dlg ? dlg.querySelectorAll('button').length : 0, logVis: log ? getComputedStyle(log).visibility : null };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await p;
      await wait(120);
      a.after = { bodyCorner: document.body.classList.contains('dfCornerChoice'), show: !!(dlg && dlg.classList.contains('show')), calls: calls.slice() };
      out.arms.push(a);
      SC.resolveSkillCheck = orig;
    }
    const cornerBefore = cornerSeen;
    const p2 = showChoice('檻の扉を開けますか?', 'はい', 'いいえ');
    await wait(350);
    const dlg = dlgOf();
    out.other = { rect: R(dlg), show: !!(dlg && dlg.classList.contains('show')), bodyCorner: document.body.classList.contains('dfCornerChoice'),
      logVis: log ? getComputedStyle(log).visibility : null, vw: innerWidth, vh: innerHeight };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await p2;
    out.other.cornerDuring = cornerSeen - cornerBefore;
    out.cornerSeen = cornerSeen;
    mo.disconnect();
  } catch (e) { out.err = String((e && e.message) || e); }
  finally { SC.resolveSkillCheck = orig; window.mageHandCaster = origMH; }
  return out;
};
/* §2-3 の穴 (H): 主ループを narrationHold で凍結し、追跡状態の敵を主人公の 5 マス先に置いて heroSlideOneTileExplore を直に呼ぶ。
   ⭐ 探索判定の対象は自分で置いた罠 1 個 (盤面の罠に依存しない = 変異 trapsgone が H を巻き込まない) */
const HOLE = async () => {
  const out = { err: null };
  try {
    window.__autoplay = 0;
    const T = TILE_SIZE;
    narrationHold = true; gameStarted = true;
    skillCheckActive = false; dialogPaused = false;
    await new Promise((r) => setTimeout(r, 200));
    const tileOf = (e) => ({ tx: Math.floor((e.x + e.def.displaySize / 2) / T), ty: Math.floor((e.y + e.def.displaySize / 2) / T) });
    const pTX = Math.floor((playerX + 48) / T), pTY = Math.floor((playerY + 58) / T);
    const room = heroRoomIdx(pTX, pTY);
    let wp = null;
    for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) if (!isTileWall(pTX + dx, pTY + dy)) { wp = { tx: pTX + dx, ty: pTY + dy }; break; }
    let trap = null;
    for (let d = 2; d <= 4 && !trap; d++) for (const [dx, dy] of [[0, d], [0, -d], [-d, 0], [d, 0]]) {
      const tx = pTX + dx, ty = pTY + dy;
      if (!wp || Math.max(Math.abs(tx - wp.tx), Math.abs(ty - wp.ty)) < 2) continue;
      if (!isTileWall(tx, ty) && heroRoomIdx(tx, ty) === room) { trap = { tx, ty }; break; }
    }
    traps.length = 0;
    if (trap) traps.push({ tx: trap.tx, ty: trap.ty, found: false, disarmed: false, rearmed: false, triggered: false, type: 'damage' });
    let ei = -1;
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive && !e.inactive && !(e.def && e.def.isBoss) && !e.passiveNpc) { ei = i; break; } }
    let spot = null;
    for (let d = 5; d <= 9 && !spot; d++) for (const [dx, dy] of [[d, 0], [0, d], [0, -d], [-d, 0], [d, 2], [d, -2]]) {
      const tx = pTX + dx, ty = pTY + dy; if (!isTileWall(tx, ty)) { spot = { tx, ty }; break; } }
    const e = enemies[ei];
    e.x = spot.tx * T + T / 2 - e.def.displaySize / 2; e.y = spot.ty * T + T / 2 - e.def.displaySize / 2;
    e.state = 'chase'; e.lastSeenX = playerX + 48; e.lastSeenY = playerY + 58;
    roomSearchRolled.clear();
    const ov0 = () => document.getElementById('skillCheckOverlay');
    const samples = [];
    const iv = setInterval(() => { const ov = ov0(); samples.push({ t: Math.round(performance.now()), panel: !!(ov && ov.classList.contains('show')),
      title: ov && ov.classList.contains('show') ? ((ov.querySelector('.scTitle') || {}).textContent || '') : null, enemy: tileOf(e) }); }, 100);
    const log = [];
    const oET = window.exploreEnemyTurn;
    window.exploreEnemyTurn = async function () {
      const ov = ov0();
      log.push({ at: 'enemyTurnStart', t: Math.round(performance.now()), enemy: tileOf(e), panel: !!(ov && ov.classList.contains('show')) });
      const rr = await oET.apply(this, arguments);
      log.push({ at: 'enemyTurnEnd', t: Math.round(performance.now()), enemy: tileOf(e), panel: !!(ov && ov.classList.contains('show')) });
      return rr;
    };
    const before = { enemy: tileOf(e), player: { tx: pTX, ty: pTY }, wp, trap, enemyKey: e.def && e.def.key };
    await heroSlideOneTileExplore(wp, { tx: pTX, ty: pTY });
    clearInterval(iv);
    window.exploreEnemyTurn = oET;
    const shown = samples.filter((s) => s.panel);
    Object.assign(out, { before, after: { enemy: tileOf(e) }, log, nSamples: samples.length, shownSamples: shown.length,
      titles: Array.from(new Set(shown.map((s) => s.title))),
      movedWhileShown: shown.filter((s) => s.enemy.tx !== before.enemy.tx || s.enemy.ty !== before.enemy.ty).length });
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};
/* 戦闘中の隠密 (S) + 門 */
const STEALTH = async () => {
  const out = { err: null };
  const SC = window.SkillCheck, orig = SC.resolveSkillCheck, origGate = window.dfSkillCheck;
  const closers = [];
  try {
    window.__autoplay = 0;
    const pops = [];
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('rollPop')) pops.push(n.innerHTML); })
      .observe(document.body, { childList: true, subtree: true });
    startGame();
    /* ⚠ K27: startGame の直後に heroAI が歩くと探索判定のパネルが開くことがある (§12-0 K2) ⇒ すぐ戦闘中にし、
       開いていたパネルは閉じ切ってから数え始める (隠密の窓の中に別の判定の立ち上がりを混ぜない) */
    encounterActive = true;
    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 40; i++) {
      const ov = document.getElementById('skillCheckOverlay');
      if (!(ov && ov.classList.contains('show')) && !skillCheckActive) break;
      if (ov && ov.classList.contains('show')) ov.click();
      await new Promise((r) => setTimeout(r, 400));
    }
    out.preOpen = window.__sc.titles.slice();
    let ei = -1;
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive && !e.inactive && !(e.def && e.def.isBoss)) { ei = i; break; } }
    encounterActive = true;
    encounterEnemyIndices.length = 0; encounterEnemyIndices.push(ei);
    const calls = [], gateCalls = [];
    SC.resolveSkillCheck = function (k, dc, party, opts) { calls.push({ k, auto: !!(opts && opts.auto), keys: Object.keys(opts || {}).sort() }); return orig.apply(this, arguments); };
    window.dfSkillCheck = function (k, dc, party, opts) { gateCalls.push({ k, auto: !!(opts && opts.auto), keys: Object.keys(opts || {}).sort() }); return origGate.apply(this, arguments); };
    const ul = () => (document.getElementById('combatLog') || {}).textContent || '';
    const logBefore = ul();
    const shows0 = window.__sc.shows;
    closers.push(setInterval(() => { const ov = document.getElementById('skillCheckOverlay'); if (ov && ov.classList.contains('show')) ov.click(); }, 500));
    const t0 = performance.now();
    const ret = await Promise.race([tryStealthSurprise(), new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))]);
    out.dt = Math.round(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 300));
    const logAfter = ul();
    Object.assign(out, { ret, encounterActive, calls: calls.slice(), gateCalls: gateCalls.slice(), shows: window.__sc.shows - shows0,
      pops: pops.filter((h) => h.indexOf('STEALTH') >= 0), logGrew: logAfter.length > logBefore.length,
      logTail: logAfter.slice(logBefore.length).slice(-240) });
    /* 門単独: 戦闘中に auto なしで呼ぶ (開錠と同じ形) */
    window.dfSkillCheck = origGate;
    const c0 = calls.length, s1 = window.__sc.shows;
    const gres = await Promise.race([origGate('sleightOfHand', 12, buildPerceptionParty(), { title: '開錠判定', voiceIds: {} }),
      new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))]);
    await new Promise((r) => setTimeout(r, 300));
    out.gate = { call: calls[c0] || null, nCalls: calls.length - c0, resolved: !!gres && gres !== 'TIMEOUT', shows: window.__sc.shows - s1, encounterActive };
  } catch (e) { out.err = String((e && e.message) || e); }
  finally { closers.forEach(clearInterval); SC.resolveSkillCheck = orig; window.dfSkillCheck = origGate; }
  return out;
};
/* 盤面 (4a〜6b): 全ノードを本番の入口で組み、宝箱に出所を付けて採る + 勝利金貨 */
const BOARD = () => {
  const NAMES = ['spawnRoomChests', 'spawnHiddenChests', 'spawnDragonHoard', 'spawnDetourChests'];
  for (const n of NAMES) {
    const o = window[n];
    if (typeof o !== 'function') continue;
    window[n] = function () { const b = roomChests.length; const r = o.apply(this, arguments); for (const c of roomChests.slice(b)) c.__src = n; return r; };
  }
  const oDrop = window.dropRoadChests;
  if (typeof oDrop === 'function') window.dropRoadChests = function () { window.__dropMarked = roomChests.filter((c) => c.roadChestDrop).length; return oDrop.apply(this, arguments); };
  const snap = () => ({
    chests: roomChests.map((c) => ({ src: c.__src || '?', tx: c.tx, ty: c.ty, key: !!(c.loot && c.loot.kind === 'key'), mimic: !!c.isMimic })),
    domCount: document.querySelectorAll('.roomChest').length,
    traps: traps.map((t) => t.tx + ',' + t.ty).sort(),
    dropMarked: window.__dropMarked == null ? null : window.__dropMarked,
    detour: (typeof detourSpotsFor === 'function') ? detourSpotsFor(currentNodeId).length : null,
  });
  const out = { scen: scenarioId, roadChestOn: ROAD_CHEST_ON, each: ROAD_CHEST_GOLD_EACH, clearGold: (currentScenario && currentScenario.clearGold) || 0,
    run: !!(typeof RUN !== 'undefined' && RUN), nodes: [], err: null };
  try {
    if (out.run) {
      for (const id of RUN.graph.nodes.map((n) => n.id)) {
        window.__dropMarked = null;
        try { resetNodeState(); currentNodeId = id; buildNode(resolveNodeMapDef(id), id); }
        catch (e) { out.nodes.push({ id, err: String((e && e.message) || e) }); continue; }
        out.nodes.push(Object.assign({ id }, snap()));
      }
    } else out.nodes.push(Object.assign({ id: 'single' }, snap()));   // 単一マップ = 起動時のビルド (湧き口の包みは間に合わない = src '?')
  } catch (e) { out.err = String((e && e.message) || e); }
  try {
    coins = 7;
    showResult(true);
    const lr = JSON.parse(sessionStorage.getItem('dragonfighters.lastResult') || 'null');
    out.gold = lr && lr.reward ? lr.reward.gold : null; out.coins = 7;
  } catch (e) { out.err = (out.err ? out.err + ' / ' : '') + 'gold: ' + String((e && e.message) || e); }
  return out;
};
/* tavern / world の判定パネル (5a): 本物の resolveSkillCheck で開いて測り、overlay の click で閉じる */
const OTHER_PANEL = async () => {
  const out = { err: null };
  try {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    window.__v87o = 'pending';
    window.SkillCheck.resolveSkillCheck('perception', 12, [{ classKey: 'warrior', name: '検分役', isHero: true }], { title: '探索判定', voiceIds: {} })
      .then((r) => { window.__v87o = r ? 'ok' : 'null'; }, () => { window.__v87o = 'rejected'; });
    await new Promise((r) => setTimeout(r, 450));
    const ov = document.getElementById('skillCheckOverlay'), card = document.getElementById('skillCheckCard');
    const cs = getComputedStyle(ov);
    Object.assign(out, { vw: innerWidth, vh: innerHeight, show: ov.classList.contains('show'), overlay: R(ov), card: R(card), ovBg: cs.backgroundColor, ovPE: cs.pointerEvents,
      htmlCorner: document.documentElement.classList.contains('dfCornerCheck') });
    ov.click(); await new Promise((r) => setTimeout(r, 2600));
    ov.click(); await new Promise((r) => setTimeout(r, 600));
    out.closed = !ov.classList.contains('show'); out.res = window.__v87o;
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* ══════════════════════════════════════════════════════════════════════════════
 * 腕
 * ══════════════════════════════════════════════════════════════════════════════ */
const ON_NEW_DOC = (o) => {
  try {
    if (o.seed) { let a = o.seed >>> 0; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    if (!sessionStorage.getItem('__v87once')) {
      localStorage.clear(); sessionStorage.clear();
      sessionStorage.setItem('__v87once', '1');
      localStorage.setItem('dragonfighters.prologueSeen', '1'); localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
      if (o.collapsed) localStorage.setItem('dragonfighters.panelCollapsed', '1');
      if (o.scen) sessionStorage.setItem('dragonfighters.currentScenario', o.scen);
      if (o.gen) sessionStorage.setItem('dragonfighters.generatedScenario', o.gen);
      if (o.pm) sessionStorage.setItem('dragonfighters.partyMembers', o.pm);
    }
  } catch (e) {}
  /* パネルの表示回数 (立ち上がりの数)。⚠ setInterval で数えると headless のタブで間引かれ、実際に出たパネルを取りこぼした
     (§12-3 K27) ⇒ MutationObserver で class の変化そのものを数える (DOM の変化と同期・間引かれない)。 */
  window.__sc = { shows: 0, on: false, titles: [] };
  const scCheck = () => { const ov = document.getElementById('skillCheckOverlay'); const on = !!(ov && ov.classList.contains('show'));
    if (on && !window.__sc.on) { window.__sc.shows++; const t = ov.querySelector('.scTitle'); window.__sc.titles.push(t ? t.textContent : ''); }
    window.__sc.on = on; };
  const scArm = () => { try { new MutationObserver(scCheck).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); } catch (e) {} };
  if (document.documentElement) scArm(); else document.addEventListener('readystatechange', scArm, { once: true });
};
async function newPage(browser, ctx, label) {
  const page = await browser.newPage();
  ctx.pages++;
  page.on('pageerror', (e) => { ctx.errs.push(label + ': ' + String((e && e.message) || e).slice(0, 200)); });
  return page;
}
async function openIndex(browser, port, ctx, label, o) {
  const page = await newPage(browser, ctx, label);
  await page.evaluateOnNewDocument(ON_NEW_DOC, o);
  await page.setViewport(o.vp || VIEW_D);
  await page.goto('http://127.0.0.1:' + port + '/index.html' + (o.q || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof allies !== 'undefined' && allies.length > 0 && typeof startGame === 'function' && !!window.SkillCheck
    && typeof roomChests !== 'undefined' && typeof buildNode === 'function' && typeof currentScenario !== 'undefined', { timeout: 60000 });
  await sleep(1200);
  return page;
}
/* UI の腕: G (+ T) (+ H) */
async function uiArm(browser, port, ctx, label, o) {
  const out = { label };
  let page = null;
  try {
    page = await openIndex(browser, port, ctx, label, Object.assign({ scen: 'lizard-swamp', pm: PM4 }, o));
    out.G = await page.evaluate(PANEL_OPEN, { banners: !!o.banners, dm: LONG_DM });
    if (out.G && !out.G.err && out.G.clickAt) {
      await page.mouse.click(out.G.clickAt.x, out.G.clickAt.y);
      await sleep(2300);
      out.G.mid = await page.evaluate(PANEL_STATE);
      if (out.G.mid.clickAt) await page.mouse.click(out.G.mid.clickAt.x, out.G.mid.clickAt.y);
      await sleep(600);
      out.G.end = await page.evaluate(PANEL_STATE);
    }
    if (o.trap) out.T = await page.evaluate(TRAP_CHOICES);
    if (o.hole) out.H = await page.evaluate(HOLE);
    out.sc = await page.evaluate(() => ({ shows: window.__sc.shows, titles: window.__sc.titles.slice() }));
  } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
  finally { if (page) await page.close().catch(() => {}); }
  const g = out.G || {};
  console.log('    [腕] ' + label + (out.err ? ' 例外 ' + out.err : '') + ' パネル ' + J(g.card) + ' bg=' + g.ovBg + ' pe=' + g.ovPE
    + (out.T ? ' | 罠 ' + (out.T.arms || []).map((a) => (a.hand ? '手' : '素') + J(a.rect)).join(' ') + ' 他 ' + J(out.T.other && out.T.other.rect) + (out.T.err ? ' err=' + out.T.err : '') : '')
    + (out.H ? ' | 穴 表示 ' + out.H.shownSamples + ' 動いた ' + out.H.movedWhileShown + (out.H.err ? ' err=' + out.H.err : '') : ''));
  return out;
}
async function stealthArm(browser, port, ctx, label, q) {
  const out = { label };
  let page = null;
  try {
    page = await openIndex(browser, port, ctx, label, { scen: 'lizard-swamp', pm: PM4, q });
    out.S = await page.evaluate(STEALTH);
  } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
  finally { if (page) await page.close().catch(() => {}); }
  const s = out.S || {};
  console.log('    [腕] ' + label + (out.err ? ' 例外 ' + out.err : '') + ' 隠密 ret=' + s.ret + ' 表示 ' + s.shows + ' dt=' + s.dt + ' 門へ ' + J(s.gateCalls)
    + ' 本体へ ' + J(s.calls) + ' 吹き出し ' + (s.pops ? s.pops.length : null) + ' | 門単独 ' + J(s.gate) + (s.err ? ' err=' + s.err : ''));
  return out;
}
async function boardArm(browser, port, ctx, label, o) {
  const out = { label };
  let page = null;
  try {
    page = await openIndex(browser, port, ctx, label, Object.assign({ seed: SEED, pm: PM4 }, o));
    out.B = await page.evaluate(BOARD);
  } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
  finally { if (page) await page.close().catch(() => {}); }
  const b = out.B || {};
  console.log('    [腕] ' + label + (out.err ? ' 例外 ' + out.err : '') + ' ' + (b.nodes || []).map((n) => n.id + ':箱' + (n.chests ? n.chests.length : 'E') + '/罠' + (n.traps ? n.traps.length : 'E')).join(' ')
    + ' gold=' + b.gold + (b.err ? ' err=' + b.err : ''));
  return out;
}
async function otherArm(browser, port, ctx, label, file) {
  const out = { label };
  let page = null;
  try {
    page = await newPage(browser, ctx, label);
    await page.evaluateOnNewDocument(ON_NEW_DOC, {});
    await page.setViewport(VIEW_D);
    await page.goto('http://127.0.0.1:' + port + '/' + file, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!(window.SkillCheck && window.SkillCheck.resolveSkillCheck), { timeout: 60000 });
    await sleep(1500);
    out.P = await page.evaluate(OTHER_PANEL);
  } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
  finally { if (page) await page.close().catch(() => {}); }
  const p = out.P || {};
  console.log('    [腕] ' + label + (out.err ? ' 例外 ' + out.err : '') + ' overlay ' + J(p.overlay) + ' card ' + J(p.card) + ' bg=' + p.ovBg + (p.err ? ' err=' + p.err : ''));
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 判定
 * ══════════════════════════════════════════════════════════════════════════════ */
const overlap = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0;
const alphaOf = (c) => { const m = /rgba?\(([^)]*)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return p.length >= 4 ? p[3] : 1; };
const roadOf = (n) => (n.chests || []).filter((c) => ROAD_SRC.indexOf(c.src) >= 0 && !c.key);
const roadSingle = (n) => (n.chests || []).filter((c) => !c.key && !c.mimic);
function roadCount(B) { if (!B || !B.nodes) return null; return B.nodes.reduce((s, n) => s + (B.run ? roadOf(n) : roadSingle(n)).length, 0); }

async function runSuite(browser, port) {
  const R = mkResults();
  const ctx = { errs: [], pages: 0 };
  try {
    const D = await uiArm(browser, port, ctx, 'D/PC展開', { vp: VIEW_D, trap: true, hole: true });
    const DC = await uiArm(browser, port, ctx, 'DC/PC畳み', { vp: VIEW_D, collapsed: true, trap: true, banners: true });
    const C = await uiArm(browser, port, ctx, 'C/compact', { vp: VIEW_C, trap: true });
    const S = await stealthArm(browser, port, ctx, 'S/戦闘中の隠密', '');
    const D0 = await uiArm(browser, port, ctx, 'D0/?cornercheck=0', { vp: VIEW_D, trap: true, q: '?cornercheck=0' });
    const S0 = await stealthArm(browser, port, ctx, 'S0/?cornercheck=0', '?cornercheck=0');
    const TV = await otherArm(browser, port, ctx, 'TV/tavern', 'tavern.html');
    const WD = await otherArm(browser, port, ctx, 'WD/world', 'world.html');
    const CFG = SCENS.map((s) => ({ name: s, o: { scen: s } })).concat([{ name: 'gen-tier3', o: { gen: GEN_T3 } }]);
    const BD = [];
    for (const c of CFG) {
      const def = await boardArm(browser, port, ctx, 'B/' + c.name, c.o);
      const rc0 = await boardArm(browser, port, ctx, 'B/' + c.name + '?roadchest=0', Object.assign({ q: '?roadchest=0' }, c.o));
      BD.push({ name: c.name, def: def.B || { err: def.err }, rc0: rc0.B || { err: rc0.err } });
    }
    const POSE = [['PC展開', D], ['PC畳み', DC], ['compact', C]];

    /* ── §0 ── */
    const H = D.H || {};
    R.check('(0a)', '[装置] 探索判定のパネルが実際に 1 回以上表示された (本物の runRoomSearchCheck・H)',
      H.shownSamples >= 1 && (H.titles || []).indexOf('探索判定') >= 0 && !H.err, { shownSamples: H.shownSamples, titles: H.titles, err: H.err || D.err || null });
    const Ss = S.S || {};
    R.check('(0b)', '[装置] 戦闘開始時の隠密判定の呼び出しを捉えた (盗賊入り・tryStealthSurprise → dfSkillCheck stealth)',
      !!Ss.gateCalls && Ss.gateCalls.filter((c) => c.k === 'stealth').length >= 1 && Ss.encounterActive === true && !Ss.err,
      { gateCalls: Ss.gateCalls, ret: Ss.ret, err: Ss.err || S.err || null });
    const v0c = POSE.map(([pn, a]) => ({ pose: pn, shows: a.T && a.T.arms ? a.T.arms.map((x) => x.show) : null, err: (a.T && a.T.err) || a.err || null }));
    R.check('(0c)', '[装置] 罠の選択の器 (#choiceDialog.show) が出た (3 姿勢 × メイジハンドなし / あり)',
      v0c.every((x) => x.shows && x.shows.length === 2 && x.shows.every(Boolean) && !x.err), v0c);
    R.check('(0d)', '[装置] 全ページで pageerror 0 件', ctx.pages > 0 && ctx.errs.length === 0, 'ページ ' + ctx.pages + ' 枚 / pageerror ' + J(ctx.errs.slice(0, 3)));

    /* ── §1 ── */
    const v1a = POSE.map(([pn, a]) => { const g = a.G || {}; const c = g.card; const mid = g.mid || {};
      const pc = pn !== 'compact';
      const ok = !g.err && g.show && g.party === 4 && !!c && c.l >= g.menuW - 0.01 && c.t <= MAX_TOP && c.w <= MAX_W && c.h <= MAX_H
        && (mid.h != null && mid.h <= MAX_H) && (pc ? c.r < g.vw * 0.5 : c.r <= g.vw);
      return { pose: pn, card: c, menuW: g.menuW, vw: g.vw, hRoll: c ? c.h : null, hResult: mid.h, ok, err: g.err || a.err || null }; });
    R.check('(1a)', 'パネルの矩形: left ≥ --ui-menu-w・top ≤ ' + MAX_TOP + '・幅 ≤ ' + MAX_W + '・縦 ≤ ' + MAX_H + ' (ロール前 / 結果)・PC は right < 50%・compact は right ≤ 画面幅 (K26)',
      v1a.every((x) => x.ok), v1a);
    const v1b = [];
    for (const [pn, a] of [['PC畳み', DC], ['compact', C]]) {
      const g = a.G || {}; const tr = a.T && a.T.arms ? a.T.arms.map((x) => x.rect) : [];
      const boxes = [['panel', g.card]].concat(tr.map((r, i) => ['trap' + i, r]));
      const against = [['toggle', g.toggle]];
      if (pn === 'compact') against.push(['phase', g.phase]);
      if (pn === 'PC畳み') against.push(['banner', g.banner], ['dm', g.dm]);
      const missing = against.filter((x) => !x[1]).map((x) => x[0]).concat(boxes.filter((x) => !x[1]).map((x) => x[0]));
      const hits = [];
      for (const [bn, b] of boxes) for (const [an, ar] of against) if (overlap(b, ar)) hits.push(bn + '×' + an);
      v1b.push({ pose: pn, against: against.map((x) => x[0] + J(x[1])), hits, missing, ok: hits.length === 0 && missing.length === 0 && boxes.length === 3 });
    }
    R.check('(1b)', '[K6 (a)] 畳み / compact の ☰・compact の #phaseIndicator・PC 畳みの #battleBanner / #dmMessage とパネル・罠の器が交わらない',
      v1b.every((x) => x.ok), v1b);
    const v1c = POSE.map(([pn, a]) => { const g = a.G || {}; const al = alphaOf(g.ovBg); const end = g.end || {};
      return { pose: pn, bg: g.ovBg, alpha: al, pe: g.ovPE, outsideHit: g.outsideHit, outsideIsOverlay: g.outsideHitIsOverlay, cardHit: g.cardHitInside,
        rolled: !!(g.mid && g.mid.result), closed: end.show === false, res: end.res,
        ok: al === 0 && g.ovPE === 'none' && g.outsideHitIsOverlay === false && g.cardHitInside === true && !!(g.mid && g.mid.result) && end.show === false && end.res === 'ok' }; });
    R.check('(1c)', '暗幕なし: overlay の背景 alpha 0・pointer-events none・カード外の点は overlay に当たらない・カード上は当たる・実クリックでロール → 閉じる',
      v1c.every((x) => x.ok), v1c);

    /* ── §2 ── */
    const v2a = [];
    for (const [pn, a] of POSE) {
      const g = a.G || {}; const T = a.T || {};
      if (!T.arms) { v2a.push({ pose: pn, ok: false, err: T.err || a.err || 'T なし' }); continue; }
      /* ⭐ パネルの矩形との相対ではなく §1 (1a) と同じ絶対の帯で測る (相対だと centered の変異でパネルと一緒に動いて巻き添えになる) */
      for (const x of T.arms) {
        const r = x.rect; const pc = pn !== 'compact';
        v2a.push({ pose: pn, hand: x.hand, rect: r, menuW: g.menuW, vw: g.vw, nButtons: x.nButtons, during: x.bodyCorner, after: x.after.bodyCorner,
          ok: !!r && x.show && g.menuW != null && r.l >= g.menuW - 0.01 && r.t <= MAX_TOP && r.w <= MAX_W && (pc ? r.r < g.vw * 0.5 : r.r <= g.vw)
            && x.bodyCorner === true && x.after.bodyCorner === false && x.after.show === false && x.nButtons === (x.hand ? 3 : 2) });
      }
    }
    R.check('(2a)', '罠の選択の器が §1 と同じ左上の帯 (left ≥ --ui-menu-w・top ≤ ' + MAX_TOP + '・幅 ≤ ' + MAX_W + '・PC は right < 50%)・dfCornerChoice は開いている間だけ (3 姿勢 × メイジハンドなし / あり)',
      v2a.length === 6 && v2a.every((x) => x.ok), v2a);
    const v2b = POSE.map(([pn, a]) => { const o = (a.T || {}).other || {}; const r = o.rect;
      return { pose: pn, rect: r, vh: o.vh, bodyCorner: o.bodyCorner, cornerDuring: o.cornerDuring, logVis: o.logVis,
        ok: !!r && o.show && r.b >= o.vh - 2 && r.t > o.vh / 2 && o.bodyCorner === false && o.cornerDuring === 0 && o.logVis === 'hidden' }; });
    R.check('(2b)', '他の #choiceDialog の利用者 (showChoice) は下端の帯・dfCornerChoice なし・ログ枠は伏せる (3 姿勢)',
      v2b.every((x) => x.ok), v2b);

    /* ── §3 ── */
    const stealthBody = (Ss.calls || []).filter((c) => c.k === 'stealth');
    const logHit = /気配を殺して接近|忍び寄ろうとした/.test(Ss.logTail || '');
    R.check('(3a)', '戦闘中の隠密: パネル表示 0 回・本体へ stealth 1 回・結果が頭上の吹き出し (STEALTH) とログの 2 経路',
      !Ss.err && Ss.encounterActive === true && Ss.shows === 0 && stealthBody.length === 1 && (Ss.pops || []).length >= 1 && Ss.logGrew === true && logHit,
      { shows: Ss.shows, body: stealthBody, pops: (Ss.pops || []).length, popHead: (Ss.pops || [])[0] ? Ss.pops[0].slice(0, 120) : null, logHit, logTail: Ss.logTail, dt: Ss.dt });
    const gateStealth = (Ss.gateCalls || []).filter((c) => c.k === 'stealth');
    R.check('(3a2)', '[K16] tryStealthSurprise が門 (dfSkillCheck) へ渡す opts.auto が true (門が足し直す前の値)',
      gateStealth.length === 1 && gateStealth[0].auto === true, { gateCalls: Ss.gateCalls });
    const gt = Ss.gate || {};
    R.check('(3a3)', '[K16] 門単独: 戦闘中に auto なしで dfSkillCheck を呼ぶと本体へ auto=true で届き、パネル 0 回',
      gt.encounterActive === true && gt.nCalls === 1 && !!gt.call && gt.call.k === 'sleightOfHand' && gt.call.auto === true && gt.shows === 0 && gt.resolved === true, gt);
    const eStart = (H.log || []).find((x) => x.at === 'enemyTurnStart');
    R.check('(3b)', '探索判定のパネル表示中に敵のタイルが動かない・敵の手番はパネルが閉じてから (§2-3 の穴)',
      !H.err && H.shownSamples >= 5 && H.movedWhileShown === 0 && !!eStart && eStart.panel === false,
      { shownSamples: H.shownSamples, movedWhileShown: H.movedWhileShown, before: H.before, after: H.after, log: H.log });

    /* ── §4 ── */
    const v4a = BD.map((b) => { const d = b.def, z = b.rc0;
      const road = d && d.nodes ? d.nodes.map((n) => ({ id: n.id, road: (d.run ? roadOf(n) : roadSingle(n)).length, dom: n.domCount, len: (n.chests || []).length, err: n.err || null })) : [];
      const pop = roadCount(z);
      return { cfg: b.name, road: road.filter((x) => x.road || x.err || x.dom !== x.len), roadTotal: road.reduce((s, x) => s + x.road, 0), popRc0: pop,
        ok: !d.err && road.length >= 1 && road.every((x) => x.road === 0 && x.dom === x.len && !x.err) && pop > 0 }; });
    R.check('(4a)', '7 シナリオ + 生成クエストで道中の宝箱 (玄室 / 隠し / 寄り道) が 0・DOM = roomChests (母集団: ?roadchest=0 では全構成で湧く)',
      v4a.length === 8 && v4a.every((x) => x.ok), v4a);
    const nodeOf = (B, id) => (B && B.nodes ? B.nodes.find((n) => n.id === id) : null);
    const hoardOf = (n) => (n && n.chests ? n.chests.filter((c) => c.src === 'spawnDragonHoard') : []);
    const keysOf = (n) => (n && n.chests ? n.chests.filter((c) => c.key) : []);
    const pos = (xs) => xs.map((c) => c.tx + ',' + c.ty + (c.mimic ? 'M' : '')).sort();
    const dr = BD.find((b) => b.name === 'dragon-lair'), fo = BD.find((b) => b.name === 'bandits-forest');
    const drBoss = dr && dr.def && dr.def.nodes ? dr.def.nodes.filter((n) => hoardOf(n).length) : [];
    const hD = drBoss.length === 1 ? hoardOf(drBoss[0]) : [];
    const hZ = drBoss.length === 1 ? hoardOf(nodeOf(dr.rc0, drBoss[0].id)) : [];
    const kNodes = fo && fo.def && fo.def.nodes ? fo.def.nodes.filter((n) => keysOf(n).length) : [];
    const kD = kNodes.length === 1 ? keysOf(kNodes[0]) : [];
    const kZ = kNodes.length === 1 ? keysOf(nodeOf(fo.rc0, kNodes[0].id)) : [];
    const hoardElsewhere = BD.filter((b) => b.name !== 'dragon-lair').reduce((s, b) => s + (b.def.nodes || []).reduce((t, n) => t + hoardOf(n).length, 0), 0);
    const v4b = { hoardNode: drBoss.map((n) => n.id), hoard: pos(hD), hoardRc0: pos(hZ), mimic: hD.filter((c) => c.mimic).length,
      keyNode: kNodes.map((n) => n.id), key: pos(kD), keyRc0: pos(kZ), hoardElsewhere };
    R.check('(4b)', '竜の巣ボスの財宝 4 (ミミック 1)・位置が ?roadchest=0 と一致 / 森 (盗賊 + 噂) の鍵束 1・位置が一致 / 他の構成に財宝 0',
      drBoss.length === 1 && hD.length === 4 && v4b.mimic === 1 && J(v4b.hoard) === J(v4b.hoardRc0)
        && kNodes.length === 1 && kD.length === 1 && J(v4b.key) === J(v4b.keyRc0) && hoardElsewhere === 0, v4b);
    const v4c = BD.map((b) => { const d = b.def, z = b.rc0; const n = roadCount(z);
      const want = (d.each > 0 && n != null) ? d.each * n : null;
      const diff = (d.gold != null && z.gold != null) ? d.gold - z.gold : null;
      const abs = (d.gold != null) ? d.gold - d.coins - d.clearGold : null;
      return { cfg: b.name, gold: d.gold, goldRc0: z.gold, each: d.each, roadRc0: n, want, diff, abs, ok: want != null && want > 0 && diff === want && abs === want }; });
    R.check('(4c)', '勝利金貨: 既定 − ?roadchest=0 = EACH × (?roadchest=0 の道中の宝箱の数) かつ 絶対量 (gold − coins − clearGold) も同じ値 > 0',
      v4c.length === 8 && v4c.every((x) => x.ok), v4c);

    /* ── §5 ── */
    const v5a = [['tavern', TV], ['world', WD]].map(([nm, a]) => { const p = a.P || {}; const o = p.overlay, c = p.card; const al = alphaOf(p.ovBg);
      const cx = c ? (c.l + c.r) / 2 : null;
      return { page: nm, overlay: o, card: c, bg: p.ovBg, pe: p.ovPE, closed: p.closed, res: p.res,
        ok: !p.err && !a.err && p.show && !!o && !!c && Math.abs(o.l) <= 0.5 && Math.abs(o.t) <= 0.5 && Math.abs(o.w - p.vw) <= 1 && Math.abs(o.h - p.vh) <= 1
          && al != null && al > 0.3 && p.ovPE !== 'none' && Math.abs(cx - p.vw / 2) <= 2 && c.w > MAX_W && p.htmlCorner === false && p.closed === true && p.res === 'ok' }; });
    R.check('(5a)', 'tavern.html / world.html の #skillCheckOverlay は画面全体・暗幕 (alpha > 0.3)・カードが中央・幅 > ' + MAX_W, v5a.every((x) => x.ok), v5a);
    const v5b = BD.map((b) => { const d = b.def, z = b.rc0; const diffs = [];
      for (const n of (z.nodes || [])) { const m = nodeOf(d, n.id); if (!m || J(m.traps) !== J(n.traps)) diffs.push({ id: n.id, def: m ? m.traps : null, rc0: n.traps }); }
      const tD = (d.nodes || []).reduce((s, n) => s + (n.traps || []).length, 0), tZ = (z.nodes || []).reduce((s, n) => s + (n.traps || []).length, 0);
      return { cfg: b.name, trapsDef: tD, trapsRc0: tZ, diffs, ok: !d.err && !z.err && (z.nodes || []).length >= 1 && diffs.length === 0 && (tZ === 0 || tD > 0) }; });
    R.check('(5b)', '罠の数と位置が ?roadchest=0 の腕と全ノードで一致 + 絶対量 (?roadchest=0 で罠のある構成は既定でも罠 > 0)',
      v5b.length === 8 && v5b.every((x) => x.ok) && v5b.reduce((s, x) => s + x.trapsDef, 0) > 0, v5b);

    /* ── §6 ── */
    const g0 = D0.G || {}; const t0 = D0.T || {}; const s0 = S0.S || {};
    const t0arm = (t0.arms || [])[0] || {};
    const s0Gate = (s0.gateCalls || []).filter((c) => c.k === 'stealth');
    const v6a = { htmlCorner: g0.htmlCorner, overlay: g0.overlay, card: g0.card, bg: g0.ovBg, pe: g0.ovPE,
      trap: t0arm.rect, trapCorner: t0.cornerSeen, trapLog: t0arm.logVis, stealthShows: s0.shows, stealthAuto: s0Gate.map((c) => c.auto), vw: g0.vw, vh: g0.vh, errs: [g0.err, t0.err, s0.err, D0.err, S0.err] };
    R.check('(6a)', '?cornercheck=0 → パネルは画面全体・暗幕・pointer-events auto・カード幅 > ' + MAX_W + ' / 罠の選択は下端の帯・dfCornerChoice 0 回 / 戦闘中の隠密でパネルが出る (auto=false)',
      v6a.errs.every((x) => !x) && g0.htmlCorner === false && !!g0.overlay && Math.abs(g0.overlay.w - g0.vw) <= 1 && Math.abs(g0.overlay.h - g0.vh) <= 1
        && alphaOf(g0.ovBg) > 0.3 && g0.ovPE === 'auto' && !!g0.card && g0.card.w > MAX_W
        && !!t0arm.rect && t0arm.rect.b >= g0.vh - 2 && t0arm.rect.t > g0.vh / 2 && t0.cornerSeen === 0
        && s0.shows >= 1 && s0Gate.length === 1 && s0Gate[0].auto === false, v6a);
    const mine = BD.find((b) => b.name === 'goblin-mine');
    const v6b = BD.map((b) => { const z = b.rc0; const n = roadCount(z); const golds = z.gold != null ? z.gold - z.coins : null;
      return { cfg: b.name, on: z.roadChestOn, road: n, goldMinusCoins: golds, clearGold: z.clearGold, ok: !z.err && z.roadChestOn === false && n > 0 && golds === z.clearGold }; });
    const mineDetour = { rc0: mine && mine.rc0.nodes ? mine.rc0.nodes.map((n) => n.id + ':' + n.detour) : null, def: mine && mine.def.nodes ? mine.def.nodes.map((n) => n.id + ':' + n.detour) : null };
    const n1z = mine ? nodeOf(mine.rc0, 'n1') : null;
    R.check('(6b)', '?roadchest=0 → ROAD_CHEST_ON false・全構成で道中の宝箱が湧く・廃坑 n1 の寄り道 4 か所・gold − coins = 従来の clearGold',
      v6b.length === 8 && v6b.every((x) => x.ok) && !!n1z && n1z.detour === 4, { v6b, mineDetour });
  } catch (e) {
    console.log('  ⛔ 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  }
  R.sort((a, b) => ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_corner_check_');
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
