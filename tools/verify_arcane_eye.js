#!/usr/bin/env node
/*
 * verify_arcane_eye.js — 実装依頼書 #79「魔法の眼 (アーケインアイ)」の受入ドライバ
 *                        (依頼書 2026-10-01_arcane-eye.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_arcane_eye.js                          # 素
 *   node tools/verify_arcane_eye.js --negative               # 変異 10 本 (port 10504〜10513)。先に素の基準を走らせる
 *   node tools/verify_arcane_eye.js --negative --only fogtouch,recast
 *   node tools/verify_arcane_eye.js --mutate fogtouch         # 変異 1 本を載せて手回し (担当表を実走で決める用)
 *   --skip-6c   (6c) の入れ子実行 (verify_invisibility --negative = その中で verify_scroll_shelf --negative) を飛ばす。
 *               ⚠ 飛ばすと (6c) は ✗ (黙って緑にしない)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が期待の件数でない・行数が変わる / ソースの正規表現が 0 件)
 *
 * ■ 方針 — index.html を sessionStorage["dragonfighters.currentScenario"] を仕込んで開き (?diag=1 = 検証シームあり・
 *   自動開始なし)、page.evaluate で**編成・枠を直接組んで** tryArcaneEyeOnEntry() / __graphRun.reveal() (forcedTier なし) /
 *   __graphRun.enter() を呼ぶ。演出は window.__autoplay = 50 で縮める (尺は測らない)。
 *   - 報告の文は**ドライバ側でも依頼書 §4-4 (+ §12-1 K10 の読み) の規則で組み**、ページのログと突き合わせる (2 経路)。
 *     種類と数は RUN.byId[id].mapDef.rooms[].enemySlots[][2] (著者の書いた型) と ENEMY_TYPES の生の旗から**ドライバが数える**
 *     (隠す条件・ボスの判定・「体 / 匹」もドライバ側で持つ。ページの eyeGroups* / eyeReportText は使わない)。
 *   - SkillCheck.resolveSkillCheck は包んで呼び出しと引数を数える。決め打ちが要る腕 ((2b) 枠なし・(6a)) だけ固定の結果を返す。
 *   - 酒場は tavern.html を別に開き、__equipTV と DOM を見る (verify_invisibility と同じ作法)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] ソース 2 ファイルの巻物の表に scroll-arcane-eye が同じ中身 (rare・mage・arcane-eye) で 1 行ずつ /
 *           MAGE_SKILLS と MAGE_SKILLS_UI の levelReq (= 7)・mpCost が一致 / ページの答え (両ページ) もソースと一致
 *      (0b) [装置] (1a) で報告のログが 1 行以上・tryArcaneEyeOnEntry / tryArcaneEyeAtExits / eyeHidesEnemy / eyeReportText が関数
 *           ⭐ これが無いと全 assert が空振りで永久緑
 *      (0c) [装置] 全ページが起動し pageerror 0 件
 *      (0d) [装置] 罠E: verify_invisibility.js の変異アンカー 11 本 + driver_graph_sce1.js の noimmediate のアンカーが
 *           原本で要求どおりの回数 (= #78 の 620b844 と同じ回数。§12-0 で実測済み)
 *      (0e) [装置] 眼の素材: 画像あり ⇒ .noimg は付かず報告が届く / png を 404 ⇒ .noimg の光の玉で飛び報告が届く・眼は残らない
 *   §1 (1a) 砦 n4 (① 入った時)・魔法使いの仲間に枠 1 ⇒ 枠 1→0・ログ 1 行 = ドライバの組んだ文 / 砦 n7 (② enterNode・覗いていない)
 *           ⇒ 「ただならぬ大きな影がひとつ」+ 護衛の名前・ボスの名前が出ない
 *      (1b) 枠 0 / 眼を知らない (キーなし) / ?eye=0 ⇒ 唱えない・ログ 0・枠は変わらない
 *      (1c) 罠G: 神殿 n4 の報告に「カエルム」の全名、沼地 n4 の報告に「若き蛇神司祭」の全名が出ない (#79 K12 = 全名で見る)。
 *           対照 = どちらの報告もドライバの組んだ文と一致 (スケルトン系・リザードマン系の名前は出る)
 *      (1d) 同じ部屋で 2 回呼ぶ ⇒ 2 回目は唱えない (枠 1 のまま)
 *      (1e) 主人公が魔法使い (leaderClassKey = "mage" + currentSpellSlots["arcane-eye"] = 1) ⇒ 唱えて 0・ログに主人公の名前
 *      (1f) startGame() が同期で戻った時点で dialogPaused === true・報告の後に元へ戻る
 *      (1g) initAllySpellSlots の関門: Lv6・習得済 ⇒ 0 / Lv7・未習得 ⇒ 0 / Lv7・習得済 ⇒ 1
 *   §2 (2a) 砦 n4 の出口 (reveal) ⇒ 枠 1→0・byExit.n7.text が「 — 〈ドライバの文〉」で終わる (ただならぬ… + 護衛 2 種)・ボス名なし・
 *           tier "crit"・byExit.n7.eye === true・choiceLabels にも同じ報告・ログ 1 行
 *      (2b) 罠D: 眼を唱えたら resolveSkillCheck 0 回 / 枠なしなら 1 回・tier は 4 段のどれか
 *      (2c) 沼地 n4 ⇒ 1 回の詠唱で n7 と n6 (n6 =「……静かだ。何もいない」)・ログ 2 行・枠は 1 つだけ減る・判定 0 回
 *      (2d) 罠C: 出口で唱えた後 nodeState["n7"] が未定義・eyeScoutedNodes に n7
 *      (2e) 覗いた n7 へ __graphRun.enter ⇒ 入った時の詠唱はしない (枠 1 のまま・ログ 0)
 *      (2f) 同じノードで reveal を 2 回 ⇒ 2 回目は唱えない (rolled のガード)
 *   §3 (3a) 罠A: 詠唱 (①・③) の前後で exploredTiles / visibleTiles の全行バイトの hash と 1 の個数が同じ (#79 K1)
 *      (3b) 罠B: ?autoplay=10 の実走で、報告のログの瞬間に dialogPaused === true・encounterActive === false・
 *           playerX/Y が開始時と同じ / 詠唱が終わった瞬間に dialogPaused が呼ぶ前の値へ戻り、位置も同じ
 *      (3c) 報告の間 #eyeScoutPanel.show に影絵 min(4, 種類) + ボスありで丸い影 1 / 閉じた後は非表示・空 / .dfArcaneEye が残らない /
 *           sfx("narration") が 1 回以上
 *   §4 (4a) 傾向を全部 arcane-eye にして apTryPreferred(魔法使いの仲間) ⇒ false・枠 1 のまま・executeSkillOn まで届かない (#78 K9)
 *      (4b) executeSkillOn(ally, "mage", "arcane-eye", -1) ⇒ false・枠 1 のまま
 *      (4c) 主人公 (魔法使い) の技の候補 (pickLeaderAction の choices) に arcane-eye が無い・対照 fireball は在る・outOfCombat === true
 *   §5 (5a) 開発モード: 棚に「巻物・アーケインアイ」=「購入 1G」・1G で買える (金貨 0・所持 1)・透明化も並ぶ・common は「購入 <価格>G」
 *      (5b) 開発モードでない: 並ばない・shopBuyScroll = noitem
 *      (5c) learnScroll ⇒ knownSpellsTV.mage に arcane-eye・引き出しの呪文一覧に「アーケインアイ」(主人公 Lv1 では [Lv7 必要])
 *      (5d) 枠に置くと傾向の「全般 / 雑魚 / ボス」の <option> (引き出し + 準備画面) に出ない (対照スリープは出る)・カードの「技」行には出る
 *   §6 (6a) 眼の枠が無い編成で reveal ⇒ 知覚判定の引数 (DC・extraBonus・title) と hintsRevealed の中身が ?eye=0 と同じ
 *      (6b) pickScrollId を Math.random の全区間で回す ⇒ rare: 素 = ソースの rare 全部 (眼あり) / ?eye=0 = 眼を除いた集合 (#79 以前)。
 *           uncommon はどちらもソースの uncommon 全部 (透明化あり)
 *      (6c) tools/verify_invisibility.js --negative が 素 27/27 (N≥27)・変異 9/9 (M≥9)・exit 0、その (6c) の中の
 *           verify_scroll_shelf --negative が 素 19/19・変異 8/8 (入れ子。変異に依らない = 1 プロセスで 1 回だけ)
 *   §7 (7a) index.html?eye=0 ⇒ (1a)(2a) と同じ仕込みで唱えない・出口は知覚判定を 1 回振る
 *      (7b) tavern.html?eye=0 + 開発 ⇒ 眼が並ばない・透明化は並ぶ   (7c) 罠F: tavern.html?invis=0 + 開発 ⇒ 透明化は並ばない・眼は並ぶ
 *   ⛔ 測らないこと (依頼書 §8): 眼の飛行の尺・軌道・大きさ / 羊皮紙の位置と z-index / 保持時間 / ペンの音の刻み (1 回以上だけ) /
 *      眼の画像の見た目 / 実戦で唱えられる頻度
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html と tavern.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列を
 *     メモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る
 *     ((0e) の間だけ assets/arcane_eye.png を 404 にする)。
 *   - 起動時に全変異のアンカーを**原本**で検算する (期待の件数・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *     ⚠ 罠E: #78 (verify_invisibility) の変異アンカー行は使わない。アンカーはすべて #79 の眼の側の行。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持ち、**欠陥が効く枝でだけ**鳴るように置く。--negative / --mutate では
 *     その件数で「注入行が実行された」を確かめる (0 件 = 空振り扱いで exit 1)。
 *   - index.html / tavern.html は CRLF。2 行にまたがるアンカー (nopause / nooutofcombat) は原本の改行で連結する。
 *   - ⛔ git を読まない ⇒ 影のツリーでもそのまま走る ((6c) の入れ子 verify_invisibility / verify_scroll_shelf は git を読む)。
 *   - ⛔ このドライバを timeout コマンドで包まない。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0` (verify_invisibility と同じ型)。
 *
 * ■ ポート = **10503** (素) / 変異 **10504〜10513** (10 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-10-01 この機械の実測・HEAD 15200f4・PowerShell から) = 素 約 65 秒 (34 assert・うち (6c) の入れ子 約 42 秒・本体 約 23 秒・
 *   3 回とも 34/34。1 回目だけ 182 秒 = 機械の揺れ) / --negative 285〜403 秒 (素の基準 + 変異 10 本・10/10・2 回とも同じ)。
 * ■ 担当表の依頼書 §8 との差 (実走で決めた。予想は全部含む = 依頼書 §12-2 K13〜K19):
 *   rollanyway +(2a)(2c) (tier が crit でなくなる。⚠ 出口の腕は判定を決め打ちにしないと自然の crit で (2a) が緑に転ぶ) /
 *   invisoff +(7b) (?eye=0 でも透明化のスイッチを見る) / bossname +(2c) (沼地 n7 もボス部屋) /
 *   spoilhidden は文だけでは空振り (隠し要素は 5 種目 = 文にも影絵にも出ない) ⇒ (1c) は報告の材料と影絵のマスでも見る /
 *   bossname は砦 n4 にボスが居ないので (1a) に ② enterNode で未偵察の n7 へ入る腕を足した。
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
const PORT = parseInt(arg('port', '10503'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const EYE_ICON = '\u{1F441}';
const QUIET = '……静かだ。何もいない';
const BIG = 'ただならぬ大きな影がひとつ';
const EYE_ID = 'arcane-eye';
const EYE_SCROLL_ID = 'scroll-arcane-eye';

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html';
const F_TAVERN = 'tavern.html';
const PRISTINE = {
  [F_INDEX]: fs.readFileSync(path.join(ROOT, F_INDEX), 'utf8'),
  [F_TAVERN]: fs.readFileSync(path.join(ROOT, F_TAVERN), 'utf8'),
};
const EOL = PRISTINE[F_INDEX].indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const L = (...lines) => lines.join(EOL);   // 2 行にまたがるアンカーは原本の改行で連結する
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
const EYE_ROWS_IDX = CAT_IDX.filter((c) => c.id === EYE_SCROLL_ID);
const EYE_ROWS_TV = CAT_TV.filter((c) => c.id === EYE_SCROLL_ID);
const EYE_SCROLL = EYE_ROWS_IDX[0] || null;
const INV_SCROLL_TV = CAT_TV.filter((c) => c.id === 'scroll-invisibility')[0] || null;
/* MAGE_SKILLS の "arcane-eye": { … }, のブロック (index) と MAGE_SKILLS_UI の 1 行 (tavern) */
const SPELL_IDX = (function () {
  const m = PRISTINE[F_INDEX].match(/\n\s*"arcane-eye":\s*\{([\s\S]*?)\r?\n\s*\},/);
  if (!m) return null;
  const num = (k) => { const x = m[1].match(new RegExp('\\b' + k + ':\\s*(\\d+)')); return x ? parseInt(x[1], 10) : null; };
  const nm = m[1].match(/\bname:\s*"([^"]+)"/);
  return { name: nm ? nm[1] : null, mpCost: num('mpCost'), levelReq: num('levelReq'), outOfCombat: /\boutOfCombat:\s*true\b/.test(m[1]) };
})();
const SPELL_TV = (function () {
  const m = PRISTINE[F_TAVERN].match(/\{\s*id:\s*"arcane-eye",([^\n]*)\}/);
  if (!m) return null;
  const num = (k) => { const x = m[1].match(new RegExp('\\b' + k + ':\\s*(\\d+)')); return x ? parseInt(x[1], 10) : null; };
  const nm = m[1].match(/\bname:\s*"([^"]+)"/);
  return { name: nm ? nm[1] : null, mpCost: num('mpCost'), levelReq: num('levelReq'), autoCast: /\bautoCast:\s*true\b/.test(m[1]) };
})();
if (!SPELL_IDX || !SPELL_TV || !EYE_SCROLL || !INV_SCROLL_TV) vetFail('(0a) 眼の呪文 / 巻物 (と透明化の巻物) の定義をソースから引けない (MAGE_SKILLS ' + !!SPELL_IDX + ' / MAGE_SKILLS_UI ' + !!SPELL_TV + ' / SCROLL_CATALOG ' + !!EYE_SCROLL + ' / 透明化 ' + !!INV_SCROLL_TV + ')');
const RARE_IDX = CAT_IDX.filter((c) => c.rarity === 'rare').map((c) => c.id).sort();
const RARE_PRE79 = RARE_IDX.filter((id) => id !== EYE_SCROLL_ID);
const UNCOMMON_IDX = CAT_IDX.filter((c) => c.rarity === 'uncommon').map((c) => c.id).sort();
const PRICE_M = PRISTINE[F_TAVERN].match(/const SCROLL_SHELF_PRICE = (\d+);/);
if (!PRICE_M) vetFail('ソースに const SCROLL_SHELF_PRICE = <n>; が無い');
const PRICE = parseInt(PRICE_M[1], 10);
const COMMON_TV = CAT_TV.filter((c) => c.rarity === 'common');

/* (0d) 罠E の基準: 他ドライバのアンカー文字列と要求回数を、そのドライバのソースから引く (⛔ git は読まない)。
 *   verify_invisibility の count は「原本での要求回数」= 620b844 の実測回数 (依頼書 §12-0 で全部一致を確認済み)。 */
const ANCHORS_0D = (function () {
  const out = [];
  const lit = (s) => Function('"use strict"; return (' + s + ');')();
  const vi = fs.readFileSync(path.join(ROOT, 'tools', 'verify_invisibility.js'), 'utf8');
  const re = /\{ file: (F_INDEX|F_TAVERN)(?:, count: (\d+))?, from: ('(?:[^'\\]|\\.)*')/g;
  let m;
  while ((m = re.exec(vi))) out.push({ src: 'verify_invisibility', file: m[1] === 'F_INDEX' ? F_INDEX : F_TAVERN, want: m[2] ? parseInt(m[2], 10) : 1, s: lit(m[3]) });
  const sce1 = fs.readFileSync(path.join(ROOT, 'tools', 'driver_graph_sce1.js'), 'utf8');
  const n = sce1.match(/noimmediate: \[\s*('(?:[^'\\]|\\.)*')/);
  if (n) out.push({ src: 'driver_graph_sce1 noimmediate', file: F_INDEX, want: 1, s: lit(n[1]) });
  return out;
})();
if (ANCHORS_0D.filter((a) => a.src === 'verify_invisibility').length !== 11 || ANCHORS_0D.length !== 12) vetFail('(0d) 他ドライバのアンカーを引けない (verify_invisibility ' + ANCHORS_0D.filter((a) => a.src === 'verify_invisibility').length + ' 本 / 全 ' + ANCHORS_0D.length + ' 本・期待 11 + 1)');

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 10 本)。逐語は HEAD 15200f4 (項目2 の実装後) の眼の側の行で取った (罠E)。
 * 各変異は console.log("__MUTHIT__<key>") を**欠陥が効く枝**に持つ。count = 原本での出現回数 (既定 1・全部置き換える)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const EYE_ROW_TV = '    "scroll-arcane-eye":     { name: "巻物・アーケインアイ",      spellId: "arcane-eye",           classKey: "mage",   rarity: "rare"     },';
const MUTATIONS = {
  /* 罠A: 眼が通るタイル (術者 → 行き先の線分) を exploredTiles に足す。印は 0 → 1 に変えたタイルがあったときだけ */
  fogtouch: [
    { file: F_INDEX, from: '      const dest = target || from;',
      to: '      const dest = target || from; { let __ch = 0; for (let i = 0; i <= 24; i++) { const tx = Math.floor((from.x + (dest.x - from.x) * i / 24) / TILE_SIZE), ty = Math.floor((from.y + (dest.y - from.y) * i / 24) / TILE_SIZE); if (exploredTiles[ty] && exploredTiles[ty][tx] === 0) { exploredTiles[ty][tx] = 1; __ch++; } } if (__ch) ' + HIT('fogtouch') + '; }   /* ★変異fogtouch */' }],
  /* 罠B: 詠唱中に dialogPaused を立てない (入った時・出口の前の 2 か所) */
  nopause: [
    { file: F_INDEX, count: 2, from: L('      const prevSk = skillCheckActive, prevDp = dialogPaused;', '      skillCheckActive = true; dialogPaused = true;'),
      to: L('      const prevSk = skillCheckActive, prevDp = dialogPaused;', '      skillCheckActive = true; ' + HIT('nopause') + ';   /* ★変異nopause */') }],
  /* 罠C: 覗いた先を nodeStateFor(to) でも覚える (nodeState に先のノードの枠が生える) */
  nodestate: [
    { file: F_INDEX, from: '        eyeScoutedNodes.add(ex.to);',
      to: '        eyeScoutedNodes.add(ex.to); nodeStateFor(ex.to).eyeScouted = (' + HIT('nodestate') + ', true);   /* ★変異nodestate */' }],
  /* 罠D: 眼を唱えても知覚判定を振る (tier を crit にしない) */
  rollanyway: [
    { file: F_INDEX, from: '      if (eyeByExit) tier = "crit";',
      to: '      if (eyeByExit) ' + HIT('rollanyway') + ';   /* ★変異rollanyway */' }],
  /* 罠F: 開発用の陳列の撤退を isInvisOnTV() 1 本で見る (印は眼の行を判定したとき) */
  invisoff: [
    { file: F_TAVERN, from: '      const dev = SCROLL_DEV_SHELF_TV.indexOf(id) >= 0 && devShelfSwitchOnTV(id);',
      to: '      const dev = SCROLL_DEV_SHELF_TV.indexOf(id) >= 0 && ((id === "scroll-arcane-eye" && ' + HIT('invisoff') + '), isInvisOnTV());   /* ★変異invisoff */' }],
  /* 罠G: eyeHidesEnemy が常に false (印は本来隠すはずの敵を通したとき) */
  spoilhidden: [
    { file: F_INDEX, from: '      if (def.isHydra || def.faction === "beast" || def.isNpcSpirit || def.isSwampNovice) return true;',
      to: '      if ((def.isHydra || def.faction === "beast" || def.isNpcSpirit || def.isSwampNovice) && (' + HIT('spoilhidden') + ', false)) return true;   /* ★変異spoilhidden */' },
    { file: F_INDEX, from: '      if (e && (e.type === "mimic" || e.inactive || e.passiveNpc || e.dormant)) return true;',
      to: '      if (e && (e.type === "mimic" || e.inactive || e.passiveNpc || e.dormant) && (' + HIT('spoilhidden') + ', false)) return true;   /* ★変異spoilhidden */' }],
  /* ボスありのとき先頭にボスの名前を出す (集計の 2 経路でボスの名前を持ち回り、文の頭に置く。印は名前を出したとき) */
  bossname: [
    { file: F_INDEX, count: 2, from: 'if (def.isBoss || def.boss) { boss = true; continue; }',
      to: 'if (def.isBoss || def.boss) { boss = def.name || true; continue; }' },
    { file: F_INDEX, from: '          if (r.bossSlot) boss = true;',
      to: '          if (r.bossSlot) boss = (ENEMY_TYPES[r.bossSlot[2]] && ENEMY_TYPES[r.bossSlot[2]].name) || true;   /* ★変異bossname */' },
    { file: F_INDEX, from: '      if (boss) parts.push("ただならぬ大きな影がひとつ");',
      to: '      if (boss) parts.push((typeof boss === "string" ? (' + HIT('bossname') + ', boss + "。") : "") + "ただならぬ大きな影がひとつ");   /* ★変異bossname */' }],
  /* eyeScoutedNodes を見ない (入った時・出口の前の 2 か所。印は本来止めるはずの再詠唱を通したとき) */
  recast: [
    { file: F_INDEX, from: '      if (!RUN || !isEyeOn() || !currentNodeId || eyeScoutedNodes.has(currentNodeId)) return false;',
      to: '      if (!RUN || !isEyeOn() || !currentNodeId || (eyeScoutedNodes.has(currentNodeId) && (' + HIT('recast') + ', false))) return false;   /* ★変異recast */' },
    { file: F_INDEX, from: '        if (!ex || !ex.to || !RUN.byId[ex.to] || seen.has(ex.to) || eyeScoutedNodes.has(ex.to)) continue;',
      to: '        if (!ex || !ex.to || !RUN.byId[ex.to] || seen.has(ex.to) || (eyeScoutedNodes.has(ex.to) && (' + HIT('recast') + ', false))) continue;   /* ★変異recast */' }],
  /* 眼の定義から outOfCombat を外す (⚠ #78 の 1 行版 `range: "self", outOfCombat: true,` は使わない = 眼の 2 行版。印は定義の評価時) */
  nooutofcombat: [
    { file: F_INDEX, from: L('        range: "self",', '        outOfCombat: true,'),
      to: L('        range: "self",', '        _mutNoOoc: (' + HIT('nooutofcombat') + ', 0),   /* ★変異nooutofcombat */') }],
  /* 開発モードでなくても眼を棚に並べる (⚠ #78 の scrollShelfIds の行は使わない = 眼の巻物の行で、開発モードでない時だけ common に化ける) */
  leakdev: [
    { file: F_TAVERN, from: EYE_ROW_TV,
      to: EYE_ROW_TV.replace('rarity: "rare"     },', 'rarity: (DF_DEV_MAGIC_SHOP ? "rare" : (' + HIT('leakdev') + ', "common")) },   /* ★変異leakdev */') }],
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた
 * (2026-10-01・HEAD 15200f4 の上)。⭐ --negative は「赤の集合 = 担当」の完全一致を要求する。 */
const NEG_EXPECT = {
  fogtouch:      ['(3a)'],
  nopause:       ['(1f)', '(3b)'],
  nodestate:     ['(2d)'],
  /* 判定の結果の tier で出口の文が変わる ⇒ (2a) tier crit / (2c) 沼地の分かれ道の tier crit も赤 */
  rollanyway:    ['(2a)', '(2b)', '(2c)'],
  /* ?eye=0 でも透明化のスイッチ (オン) を見るので眼が並ぶ ⇒ (7b) も赤 */
  invisoff:      ['(7b)', '(7c)'],
  /* ⭐ #79 K13: 文だけでは空振り (隠し要素は 5 種目) ⇒ (1c) は報告の材料と影絵でも見る */
  spoilhidden:   ['(1c)'],
  /* 沼地 n7 (出口の先) もボス部屋 ⇒ (2c) も赤 */
  bossname:      ['(1a)', '(2a)', '(2c)'],
  recast:        ['(1d)', '(2e)'],
  nooutofcombat: ['(4a)', '(4c)'],
  leakdev:       ['(5b)'],
};
/* 依頼書 §8 の予想 (⭐ 実測の赤に含まれていることは崩さない = 起動時に検算) */
const NEG_PREDICTED = {
  fogtouch: ['(3a)'], nopause: ['(3b)', '(1f)'], nodestate: ['(2d)'], rollanyway: ['(2b)'], invisoff: ['(7c)'],
  spoilhidden: ['(1c)'], bossname: ['(1a)', '(2a)'], recast: ['(1d)', '(2e)'], nooutofcombat: ['(4a)', '(4c)'], leakdev: ['(5b)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 10) vetFail('変異は 10 本まで (ポート 10504〜10513)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_PREDICTED[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) vetFail('NEG_EXPECT / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  const miss = NEG_PREDICTED[k].filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  if (miss.length) vetFail('担当 ' + k + ' が依頼書 §8 の予想 ' + J(NEG_PREDICTED[k]) + ' を含まない');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
/* ⭐ 罠E の自己検査: 自分の変異アンカーが #78 (verify_invisibility) のアンカーと 1 本も重ならない */
for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
  const clash = ANCHORS_0D.filter((a) => a.s === e.from || e.from.indexOf(a.s) >= 0 || a.s.indexOf(e.from) >= 0);
  if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのアンカーと重なる (罠E): ' + clash.map((a) => a.src).join(','));
}
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
console.log('[vet] 装置: 巻物 index ' + CAT_IDX.length + ' / tavern ' + CAT_TV.length + ' 件 (rare ' + RARE_IDX.length + ' / uncommon ' + UNCOMMON_IDX.length + ') / 眼 levelReq '
  + SPELL_IDX.levelReq + '・mpCost ' + SPELL_IDX.mpCost + ' / SCROLL_SHELF_PRICE ' + PRICE + ' / (0d) 他ドライバのアンカー ' + ANCHORS_0D.length
  + ' 本 / 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で期待どおり / 改行 ' + (EOL === '\r\n' ? 'CRLF' : 'LF'));

/* ══════════════════════════════════════════════════════════════════════════════
 * ドライバ側の報告の規則 (依頼書 §4-4 + §12-1 K10 の読み)。⛔ ページの eyeReportText を使わない
 * ══════════════════════════════════════════════════════════════════════════════ */
const drvHides = (s) => !!(s.isHydra || s.faction === 'beast' || s.isNpcSpirit || s.isSwampNovice);
const drvCountWord = (s) => (s.undead || /dragon|drake|wyrm|golem|pharaxus/i.test(s.type)) ? '体' : '匹';
/* info = { slots:[{type,name,undead,isBoss,...旗}], bosses:[{type,name}] } → { groups:[{type,name,n,cw}], boss, bossNames, hidden:[name] } */
function drvGroups(info) {
  const by = new Map(); const bossNames = info.bosses.map((b) => b.name); const hidden = [];
  let boss = info.bosses.length > 0;
  for (const s of info.slots) {
    if (drvHides(s)) { hidden.push(s.name); continue; }
    if (s.isBoss) { boss = true; bossNames.push(s.name); continue; }
    const g = by.get(s.type);
    if (g) g.n++; else by.set(s.type, { type: s.type, name: s.name, n: 1, cw: drvCountWord(s), sprite: s.sprite || null });
  }
  return { groups: Array.from(by.values()), boss, bossNames, hidden };
}
function drvText(G) {
  const gs = G.groups;
  if (!gs.length && !G.boss) return QUIET;
  const parts = [];
  if (G.boss) parts.push(BIG);
  if (gs.length) {
    let lead = gs[0];
    for (const g of gs) if (g.n > lead.n) lead = g;
    const others = gs.filter((g) => g !== lead);
    if (G.boss) parts.push(lead.n >= 2 ? lead.name + 'どもが ' + lead.n + ' ' + lead.cw + 'ほど従っている' : lead.name + 'が 1 ' + lead.cw + '従っている');
    else parts.push(lead.n >= 2 ? lead.name + 'どもが ' + lead.n + ' ' + lead.cw + 'ほど待ち構えているようだ' : lead.name + 'が 1 ' + lead.cw + '潜んでいる');
    if (others.length >= 1) parts.push(others[0].name + 'の姿もある');
    if (others.length >= 2) parts.push('ほかにも影がある');
  }
  return parts.join('。');
}
const logLine = (caster, text) => EYE_ICON + ' ' + caster + ' の魔法の眼 — ' + text;

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
let NOIMG = false;   // (0e) の間だけ assets/arcane_eye.png を 404 にする
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
        if (NOIMG && rel === 'assets/arcane_eye.png') { res.statusCode = 404; res.end('404'); return; }
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
 * (6c) 入れ子: verify_invisibility --negative (その (6c) が verify_scroll_shelf --negative を入れ子で走らせる)。
 *   変異に依らない (ディスクの本番を読む) ⇒ 1 プロセスで 1 回だけ走らせて全スイートで共有する。
 * ══════════════════════════════════════════════════════════════════════════════ */
let _r6c = null;
function run6c() {
  if (_r6c) return _r6c;
  if (SKIP_6C) { _r6c = { ok: false, detail: '--skip-6c で飛ばした (⛔ 黙って緑にしない)' }; return _r6c; }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'verify_invisibility.js'), '--negative'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const base = out.match(/(\d+)\/(\d+) PASSED\s+FAILED (\d+)\s+PENDING 0\s+\[素・基準\]/);
  const neg = out.match(/負のコントロール (\d+) \/ (\d+) が検出成功/);
  const sh = out.match(/✓ \(6c\)[^\n]*-- exit 0 \/ 素 (\d+)\/(\d+) \/ 変異 (\d+)\/(\d+)/);
  const ok = r.status === 0 && !!base && base[1] === base[2] && base[3] === '0' && parseInt(base[2], 10) >= 27
    && !!neg && neg[1] === neg[2] && parseInt(neg[2], 10) >= 9
    && !!sh && sh[1] === sh[2] && parseInt(sh[2], 10) >= 19 && sh[3] === sh[4] && parseInt(sh[4], 10) >= 8;
  _r6c = { ok, detail: 'verify_invisibility exit ' + r.status + ' / 素 ' + (base ? base[1] + '/' + base[2] : '(総括行なし)') + ' / 変異 ' + (neg ? neg[1] + '/' + neg[2] : '(総括行なし)')
    + ' / 入れ子 verify_scroll_shelf 素 ' + (sh ? sh[1] + '/' + sh[2] + ' 変異 ' + sh[3] + '/' + sh[4] : '(読めない)') + ' / ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒' };
  return _r6c;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(0e)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(1f)', '(1g)',
  '(2a)', '(2b)', '(2c)', '(2d)', '(2e)', '(2f)', '(3a)', '(3b)', '(3c)', '(4a)', '(4b)', '(4c)',
  '(5a)', '(5b)', '(5c)', '(5d)', '(6a)', '(6b)', '(6c)', '(7a)', '(7b)', '(7c)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 900));
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
 * ページ内の道具 (読み込み後に 1 回入れる)
 * ══════════════════════════════════════════════════════════════════════════════ */
const INSTALL = (EYE) => {
  window.__autoplay = 50;   // 演出を縮める (URL で渡さない = 自動開始しない)
  window.__eyeLog = [];
  const oLog = appendLog;
  appendLog = function (msg) {
    if (String(msg).indexOf(EYE) === 0) {
      const panel = document.getElementById('eyeScoutPanel');
      window.__eyeLog.push({ msg: String(msg), dp: dialogPaused, sk: skillCheckActive, enc: encounterActive, px: playerX, py: playerY,
        cells: panel ? panel.querySelectorAll('.eyeShade').length : -1, boss: panel ? panel.querySelectorAll('.eyeShade.boss').length : -1,
        labels: panel ? Array.from(panel.querySelectorAll('.eyeShade')).map((c) => ({ boss: c.classList.contains('boss'), cap: (c.querySelector('span') || {}).textContent || '', bg: ((c.querySelector('i') || {}).style || {}).backgroundImage || '' })) : null,
        show: panel ? panel.classList.contains('show') : null });
    }
    return oLog.apply(this, arguments);
  };
  window.__sfxN = 0;
  const oS = sfx;
  sfx = function (n) { if (n === 'narration') window.__sfxN++; try { return oS.apply(this, arguments); } catch (e) {} };
  /* resolveSkillCheck: 呼び出しと引数を控える。__rscStub があれば固定の結果を返す (決め打ちの腕だけ) */
  window.__rsc = []; window.__rscStub = null;
  const oR = SkillCheck.resolveSkillCheck;
  SkillCheck.resolveSkillCheck = function (k, dc, party, opts) {
    window.__rsc.push({ k, dc, extraBonus: opts ? opts.extraBonus : undefined, title: opts ? opts.title : undefined, flavor: opts ? opts.flavor : undefined,
      party: (party || []).map((m) => m && m.classKey) });
    if (window.__rscStub) return Promise.resolve(window.__rscStub(dc, party));
    return oR.apply(this, arguments);
  };
  window.__noimgSeen = false; window.__eyeElSeen = false;
  new MutationObserver(() => { const e = document.querySelector('.dfArcaneEye'); if (e) { window.__eyeElSeen = true; if (e.classList.contains('noimg')) window.__noimgSeen = true; } })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  /* (3a) 2 つの Uint8Array 行の配列の全バイトの hash と 1 の個数 (#79 K1: 集合ではないので「大きさ」は測れない) */
  window.__fog = () => {
    const f = (arr) => { let h = 2166136261 >>> 0, ones = 0, n = 0; for (const row of arr) for (let i = 0; i < row.length; i++) { h = Math.imul(h ^ (row[i] + 1), 16777619) >>> 0; if (row[i]) ones++; n++; } return h + ':' + ones + '/' + n; };
    return f(exploredTiles) + '|' + f(visibleTiles);
  };
  /* 生きている先頭の仲間を魔法使いにし、眼の枠を slot にする (slot === null はキーを消す = 眼を知らない) */
  window.__mage = (slot) => {
    const a = allies.find((x) => x && x.alive);
    a.classKey = 'mage';
    a.spellSlots = Object.assign({}, a.spellSlots || {});
    if (slot === null) delete a.spellSlots['arcane-eye']; else a.spellSlots['arcane-eye'] = slot;
    return a;
  };
  window.__slotOf = (a) => (a.spellSlots && a.spellSlots['arcane-eye'] !== undefined ? a.spellSlots['arcane-eye'] : null);
  /* 著者の書いたスロットの型と ENEMY_TYPES の生の旗 (判定はドライバ側) */
  window.__slotInfo = (id) => {
    const nd = RUN.byId[id]; const out = { slots: [], bosses: [] };
    for (const r of nd.mapDef.rooms) {
      for (const s of (r.enemySlots || [])) {
        const t = s[2]; const d = ENEMY_TYPES[t] || {};
        out.slots.push({ type: t, name: d.name, undead: !!d.undead, isBoss: !!(d.isBoss || d.boss), isHydra: !!d.isHydra, faction: d.faction || null,
          isNpcSpirit: !!d.isNpcSpirit, isSwampNovice: !!d.isSwampNovice, sprite: d.sprite || null });
      }
      if (r.bossSlot) { const d = ENEMY_TYPES[r.bossSlot[2]] || {}; out.bosses.push({ type: r.bossSlot[2], name: d.name }); }
    }
    return out;
  };
  window.__killAll = () => { enemies.forEach((e) => { if (e) { e.alive = false; e.hp = 0; } }); };
  window.__panelAfter = () => { const p = document.getElementById('eyeScoutPanel'); return { show: p ? p.classList.contains('show') : null, kids: p ? p.childElementCount : -1, eyeLeft: document.querySelectorAll('.dfArcaneEye').length }; };
};
const PICK_SWEEP = (rarity) => {
  const keep = Math.random, seen = new Set();
  const w = { common: 0, uncommon: 0, rare: 0 }; w[rarity] = 1;
  try {
    for (let i = 0; i < 400; i++) { let k = 0; Math.random = () => (k++ === 0 ? 0.999 : (i + 0.5) / 400); seen.add(pickScrollId(w)); }
  } finally { Math.random = keep; }
  return Array.from(seen).sort();
};
const STUB_RES = (dc, party) => ({ success: true, roll: 15, total: dc + 2, dc, bonus: 0, rep: party && party[0], helper: null, crit: false, fumble: false });

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { port, booted: 0, errs: [], hits: {} };
  const base = 'http://127.0.0.1:' + port + '/';
  const pages = [];
  const newPage = async () => {
    const p = await browser.newPage();
    pages.push(p);
    p.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
    p.on('console', (m) => {
      let t = ''; try { t = m.text(); } catch (e) { return; }
      if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
    });
    return p;
  };
  const closePage = async (p) => { await new Promise((r) => setTimeout(r, 150)); await p.close().catch(() => {}); };
  /* index.html をシナリオ指定で開く (?diag=1 = 検証シームあり・自動開始なし) */
  async function openIndex(scen, qs) {
    const p = await newPage();
    await p.evaluateOnNewDocument((s) => { try { sessionStorage.setItem('dragonfighters.currentScenario', s); } catch (e) {} }, scen);
    await p.goto(base + F_INDEX + '?diag=1' + (qs || ''), { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => { try { return typeof allies !== 'undefined' && allies.length > 0 && typeof RUN !== 'undefined' && !!RUN && typeof currentNodeId !== 'undefined' && !!currentNodeId && !!window.__graphRun; } catch (e) { return false; } }, { timeout: 60000 });
    await p.evaluate(INSTALL, EYE_ICON);
    ctx.booted++;
    return p;
  }
  let tv = null;
  async function bootTavern(qs, dev) {
    if (!tv) tv = await newPage();
    const url = base + F_TAVERN + qs;
    await tv.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await tv.evaluate((d) => { localStorage.clear(); if (d) localStorage.setItem('df.devMode', '1'); }, dev);
    await tv.goto(url, { waitUntil: 'load', timeout: 60000 });
    await tv.waitForFunction(() => !!window.__equipTV, { timeout: 30000 });
    ctx.booted++;
  }
  const shelfRows = () => tv.evaluate(() => {
    __equipTV.setShopTab('buy'); __equipTV.openShop();
    const Ls = document.getElementById('shopList'); const out = [];
    let cur = null;
    for (const el of (Ls ? Ls.children : [])) {
      if (el.classList.contains('shopGroupHead')) { cur = el.textContent; continue; }
      if (cur === '巻物' && el.classList.contains('shopItem')) {
        const b = el.querySelector('button.shopBtn'); const nm = el.querySelector('.shopName');
        out.push({ name: nm ? nm.textContent : null, btn: b ? b.textContent : null });
      }
    }
    return out;
  });

  try {
    /* ══════════ A. 砦 (素): (1b) → (1a)① → (1d) → 出口 (2a)(2b)(2d)(2f) → (2e) ══════════ */
    let p = await openIndex('orc-fort', '');
    const fns = await p.evaluate(() => ({ on: typeof tryArcaneEyeOnEntry, ex: typeof tryArcaneEyeAtExits, hide: typeof eyeHidesEnemy, txt: typeof eyeReportText,
      page: (function () { const s = MAGE_SKILLS['arcane-eye']; return s ? { name: s.name, mpCost: s.mpCost, levelReq: s.levelReq, ooc: s.outOfCombat } : null; })(),
      scroll: SCROLL_CATALOG['scroll-arcane-eye'] || null }));
    /* ⚠ 出口の腕は resolveSkillCheck を決め打ち (crit でない成功) にする。本物の出目だと変異 rollanyway で
     *   自然の crit を引いた回だけ tier が "crit" になり (2a) が緑に転ぶ (#79 K19・非決定の型) */
    const A = await p.evaluate(async (stubSrc) => {
      window.__rscStub = eval(stubSrc);
      const out = { node: currentNodeId, n4: __slotInfo('n4'), n7: __slotInfo('n7') };
      /* (1b) 枠 0 / 眼を知らない */
      let a = __mage(0);
      const b0 = { ret: await tryArcaneEyeOnEntry(), slot: __slotOf(a), log: __eyeLog.length };
      a = __mage(null);
      const bn = { ret: await tryArcaneEyeOnEntry(), slot: __slotOf(a), log: __eyeLog.length };
      out.b = { b0, bn, scouted: Array.from(eyeScoutedNodes) };
      /* (1a) 枠 1 ⇒ 唱える (+ (3a)(3c)) */
      a = __mage(1);
      out.caster = a.npcName || (a.def && a.def.name) || '魔法使い';
      const fog0 = __fog(); const sfx0 = __sfxN;
      out.a = { ret: await tryArcaneEyeOnEntry(), slot: __slotOf(a), log: __eyeLog.slice(), fog0, fog1: __fog(), after: __panelAfter(), dp: dialogPaused, sk: skillCheckActive };
      await new Promise((q) => setTimeout(q, 80));
      out.a.sfx = __sfxN - sfx0;
      /* (1d) 同じ部屋で 2 回目 */
      a.spellSlots['arcane-eye'] = 1; __eyeLog.length = 0;
      out.d = { ret: await tryArcaneEyeOnEntry(), slot: __slotOf(a), log: __eyeLog.length };
      /* 出口 ③ (2a)(2b)(2d)(3a)(3c) */
      __killAll();
      a.spellSlots['arcane-eye'] = 1; __eyeLog.length = 0; __rsc.length = 0;
      const f0 = __fog();
      const hr = await __graphRun.reveal();
      out.x = { tier: hr && hr.tier, n7: hr && hr.byExit && hr.byExit.n7 ? { text: hr.byExit.n7.text, eye: hr.byExit.n7.eye } : null, rsc: __rsc.length,
        slot: __slotOf(a), log: __eyeLog.slice(), ns7: typeof nodeState['n7'], scouted: Array.from(eyeScoutedNodes),
        labels: __graphRun.choiceLabels(), fog0: f0, fog1: __fog(), after: __panelAfter(), dp: dialogPaused };
      /* (2f) 同じノードで reveal 2 回目 */
      a.spellSlots['arcane-eye'] = 1; __eyeLog.length = 0; __rsc.length = 0;
      await __graphRun.reveal();
      out.f = { rsc: __rsc.length, slot: __slotOf(a), log: __eyeLog.length };
      /* (2e) 覗いた n7 へ入る */
      a.spellSlots['arcane-eye'] = 1; __eyeLog.length = 0;
      await __graphRun.enter('n7', 'right');
      out.e = { node: currentNodeId, slot: a.alive ? __slotOf(a) : 'dead', log: __eyeLog.length, dp: dialogPaused };
      return out;
    }, '(' + STUB_RES.toString() + ')');
    await closePage(p);

    const G4 = drvGroups(A.n4), G7 = drvGroups(A.n7);
    const T4 = drvText(G4), T7 = drvText(G7);

    /* ══════════ B. 砦 (素): ② enterNode で覗いていない n7 へ ⇒ ボス部屋の報告 ══════════ */
    p = await openIndex('orc-fort', '');
    const B = await p.evaluate(async () => {
      const a = __mage(1);
      const caster = a.npcName || (a.def && a.def.name) || '魔法使い';
      await __graphRun.enter('n7', 'right');
      return { node: currentNodeId, caster, slot: __slotOf(a), log: __eyeLog.slice(), liveBoss: enemies.filter((e) => e && e.alive && e.def && (e.def.isBoss || e.def.boss)).map((e) => e.def.name) };
    });
    await closePage(p);

    /* ══════════ C. 砦 (素): 枠なしの出口 (2b 後半・6a 素) ══════════ */
    p = await openIndex('orc-fort', '');
    const C = await p.evaluate(async (stubSrc) => {
      __killAll();
      window.__rscStub = eval(stubSrc);
      const hr = await __graphRun.reveal();
      return { rsc: __rsc.slice(), tier: hr && hr.tier, hr: JSON.parse(JSON.stringify(hr)), log: __eyeLog.length };
    }, '(' + STUB_RES.toString() + ')');
    await closePage(p);

    /* ══════════ D. 砦 (素): (1f) startGame の同期 ══════════ */
    p = await openIndex('orc-fort', '');
    const D = await p.evaluate(async () => {
      __mage(1);
      startGame();
      const dpSync = dialogPaused;
      for (let i = 0; i < 400 && (dialogPaused || !__eyeLog.length); i++) await new Promise((q) => setTimeout(q, 20));
      return { dpSync, log: __eyeLog.map((x) => x.msg), dpAtLog: __eyeLog.length ? __eyeLog[0].dp : null, dpEnd: dialogPaused };
    });
    await closePage(p);

    /* ══════════ E. 沼地 (素): (1c) 入った時 + (2c) 分かれ道 ══════════ */
    p = await openIndex('lizard-swamp', '');
    const E = await p.evaluate(async (stubSrc) => {
      window.__rscStub = eval(stubSrc);   // A と同じ理由で決め打ち
      const a = __mage(1);
      const caster = a.npcName || (a.def && a.def.name) || '魔法使い';
      const info = { n4: __slotInfo('n4'), n7: __slotInfo('n7'), n6: __slotInfo('n6') };
      await tryArcaneEyeOnEntry();
      const entry = __eyeLog.map((x) => x.msg);
      const agg = eyeGroupsLive().groups.map((g) => [g.type, g.n]);   // (1c) 報告の材料 (#79 K13)
      const cells = __eyeLog.length ? __eyeLog[0].labels : null;
      __killAll();
      a.spellSlots['arcane-eye'] = 1; __eyeLog.length = 0; __rsc.length = 0;
      const hr = await __graphRun.reveal();
      return { caster, info, entry, agg, cells, novice: ENEMY_TYPES.swampNovice && ENEMY_TYPES.swampNovice.name,
        n7: hr.byExit.n7 ? hr.byExit.n7.text : null, n6: hr.byExit.n6 ? hr.byExit.n6.text : null, e7: hr.byExit.n7 && hr.byExit.n7.eye, e6: hr.byExit.n6 && hr.byExit.n6.eye,
        slot: __slotOf(a), log: __eyeLog.map((x) => x.msg), rsc: __rsc.length, tier: hr.tier };
    }, '(' + STUB_RES.toString() + ')');
    await closePage(p);

    /* ══════════ F. 神殿 (素): (1c) 入った時 ══════════ */
    p = await openIndex('undead-temple', '');
    const F = await p.evaluate(async () => {
      const a = __mage(1);
      const caster = a.npcName || (a.def && a.def.name) || '魔法使い';
      const info = __slotInfo(currentNodeId);
      await tryArcaneEyeOnEntry();
      return { node: currentNodeId, caster, info, log: __eyeLog.map((x) => x.msg), caelum: ENEMY_TYPES.caelum && ENEMY_TYPES.caelum.name,
        agg: eyeGroupsLive().groups.map((g) => [g.type, g.n]), cells: __eyeLog.length ? __eyeLog[0].labels : null };
    });
    await closePage(p);

    /* ══════════ G. 砦 (素・画像あり): (1e) 主人公 + (0e) 画像あり + (1g)(4a)(4b)(4c)(6b 素) ══════════ */
    p = await openIndex('orc-fort', '');
    const Gp = await p.evaluate(async () => {
      for (const a of allies) if (a && a.spellSlots) delete a.spellSlots['arcane-eye'];
      leaderClassKey = 'mage';
      currentSpellSlots['arcane-eye'] = 1;
      const heroName = getLeaderName();
      window.__autoplay = 1;   // (0e) 眼を実際に飛ばす (画像の読み込みが飛行中に決まる)
      const ret = await tryArcaneEyeOnEntry();
      window.__autoplay = 50;
      return { ret, heroName, heroSlot: currentSpellSlots['arcane-eye'], log: __eyeLog.map((x) => x.msg), eyeSeen: __eyeElSeen, noimg: __noimgSeen, after: __panelAfter() };
    });
    const g1 = await p.evaluate((lvReq) => {
      const keep = knownSpells.mage;
      const base0 = (keep || []).filter((x) => x !== 'arcane-eye');
      const run = (lv, known) => { knownSpells.mage = known ? base0.concat(['arcane-eye']) : base0.slice(); const a = {}; initAllySpellSlots(a, 'mage', lv, { mage: { 'arcane-eye': 1 } }); return (a.spellSlots && a.spellSlots['arcane-eye']) || 0; };
      const r = { lowKnown: run(lvReq - 1, true), reqUnknown: run(lvReq, false), reqKnown: run(lvReq, true) };
      knownSpells.mage = keep;
      return r;
    }, SPELL_IDX.levelReq);
    const f4 = await p.evaluate(async () => {
      for (const a of allies) { if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el); }
      allies.length = 0;
      const a = createAlly('mage', playerX + 40, playerY); allies.push(a); try { createAllyDom(a, 0); } catch (e) {}
      a.spellSlots = { 'arcane-eye': 1 }; a.equippedSkills = ['arcane-eye'];
      const keepMap = actionPriorityMap, keepR = Math.random;
      actionPriorityMap = { mage: { general: 'arcane-eye', mob: 'arcane-eye', boss: 'arcane-eye', travel: null } };
      Math.random = () => 0;
      let ap, ex;
      /* ⭐ #78 K9: 二重の守り (旗 + executeSkillOn の名指しの欠如) ⇒ executeSkillOn へ届いた回数も数える */
      const keepEx = executeSkillOn;
      let reachedEx = 0;
      executeSkillOn = function (u, ck, id) { if (id === 'arcane-eye') reachedEx++; return keepEx.apply(this, arguments); };
      try { ap = await apTryPreferred(a); } catch (e) { ap = 'ERR:' + e.message; }
      executeSkillOn = keepEx;
      const slotAfterAp = a.spellSlots['arcane-eye'];
      a.spellSlots = { 'arcane-eye': 1 };
      try { ex = await executeSkillOn(a, 'mage', 'arcane-eye', -1); } catch (e) { ex = 'ERR:' + e.message; }
      Math.random = keepR; actionPriorityMap = keepMap;
      return { apOn: ACTION_PRIORITY_ON, ap, reachedEx, slotAfterAp, ex, slotAfterEx: a.spellSlots['arcane-eye'] };
    });
    const c4 = await p.evaluate(async () => {
      for (const a of allies) { if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el); }
      allies.length = 0;
      leaderClassKey = 'mage';
      for (const k in currentSpellSlots) delete currentSpellSlots[k];
      currentSpellSlots['arcane-eye'] = 1; currentSpellSlots.fireball = 1;
      const keepEq = equippedSkills.slice();
      equippedSkills.length = 0; equippedSkills.push('arcane-eye', 'fireball');
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
      return { captured, err, ooc: MAGE_SKILLS['arcane-eye'].outOfCombat };
    });
    const pickRare1 = await p.evaluate(PICK_SWEEP, 'rare');
    const pickUnc1 = await p.evaluate(PICK_SWEEP, 'uncommon');
    await closePage(p);

    /* ══════════ H. 砦 (素・png を 404): (0e) .noimg の光の玉 ══════════ */
    NOIMG = true;
    let H;
    try {
      p = await openIndex('orc-fort', '');
      H = await p.evaluate(async () => {
        __mage(1);
        window.__autoplay = 1;
        const ret = await tryArcaneEyeOnEntry();
        window.__autoplay = 50;
        return { ret, log: __eyeLog.length, eyeSeen: __eyeElSeen, noimg: __noimgSeen, after: __panelAfter() };
      });
      await closePage(p);
    } finally { NOIMG = false; }

    /* ══════════ I. 砦 ?eye=0: (1b) (7a) (6b 撤退) → I2: (6a 撤退) ══════════ */
    p = await openIndex('orc-fort', '&eye=0');
    const I = await p.evaluate(async () => {
      const a = __mage(1);
      const e1 = await tryArcaneEyeOnEntry();
      const slotAfterEntry = __slotOf(a), logEntry = __eyeLog.length;
      __killAll();
      __rsc.length = 0;
      const hrReal = await __graphRun.reveal();   // (7a) 仕込みは (2a) と同じ (枠 1)・判定は本物
      return { e1, slotAfterEntry, logEntry, rsc: __rsc.length, tier: hrReal && hrReal.tier, eye7: !!(hrReal && hrReal.byExit.n7 && hrReal.byExit.n7.eye), slot: __slotOf(a), log: __eyeLog.length };
    });
    const pickRare0 = await p.evaluate(PICK_SWEEP, 'rare');
    const pickUnc0 = await p.evaluate(PICK_SWEEP, 'uncommon');
    await closePage(p);
    p = await openIndex('orc-fort', '&eye=0');
    const I2 = await p.evaluate(async (stubSrc) => {   // (6a) の撤退側 = C と同じ仕込み (枠なし・決め打ち)
      __killAll();
      window.__rscStub = eval(stubSrc);
      const hr = await __graphRun.reveal();
      return { rsc: __rsc.slice(), tier: hr && hr.tier, hr: JSON.parse(JSON.stringify(hr)), log: __eyeLog.length };
    }, '(' + STUB_RES.toString() + ')');
    await closePage(p);

    /* ══════════ J. 砦 ?autoplay=10: (3b) 実走 ══════════ */
    let Jr = null;
    {
      const pj = await newPage();
      await pj.evaluateOnNewDocument((EYE) => {
        try { sessionStorage.setItem('dragonfighters.currentScenario', 'orc-fort'); } catch (e) {}
        const iv = setInterval(() => {
          try {
            if (typeof allies === 'undefined' || !allies.length || typeof appendLog !== 'function' || typeof gameStarted === 'undefined' || typeof tryArcaneEyeOnEntry !== 'function') return;
            clearInterval(iv);
            const a = allies.find((x) => x && x.alive); a.classKey = 'mage'; a.spellSlots = Object.assign({}, a.spellSlots || {}, { 'arcane-eye': 1 });
            window.__eyeLog = []; window.__eyeDone = [];
            const o = appendLog;
            appendLog = function (msg) { if (String(msg).indexOf(EYE) === 0) window.__eyeLog.push({ dp: dialogPaused, enc: encounterActive, px: playerX, py: playerY, msg: String(msg) }); return o.apply(this, arguments); };
            const oT = tryArcaneEyeOnEntry;
            tryArcaneEyeOnEntry = function () {
              const before = dialogPaused;
              const pr = oT.apply(this, arguments);
              pr.then((r) => window.__eyeDone.push({ r, before, dp: dialogPaused, px: playerX, py: playerY, enc: encounterActive }), () => {});
              return pr;
            };
            window.__pos0 = null;
            const poll = setInterval(() => { if (gameStarted && window.__pos0 === null) { window.__pos0 = [playerX, playerY]; clearInterval(poll); } }, 1);
          } catch (e) {}
        }, 2);
      }, EYE_ICON);
      await pj.goto(base + F_INDEX + '?autoplay=10', { waitUntil: 'load', timeout: 120000 });
      ctx.booted++;
      try {
        await pj.waitForFunction(() => window.__eyeDone && window.__eyeDone.length > 0 && window.__eyeLog && window.__eyeLog.length > 0, { timeout: 60000 });
        Jr = await pj.evaluate(() => ({ log: window.__eyeLog.slice(0, 1), done: window.__eyeDone.slice(0, 1), pos0: window.__pos0 }));
      } catch (e) { Jr = { err: String(e && e.message).slice(0, 200) }; }
      await closePage(pj);
    }

    /* ══════════ 判定 (index) ══════════ */
    R.check('(0b)', '[装置] (1a) で報告のログが 1 行以上・tryArcaneEyeOnEntry / tryArcaneEyeAtExits / eyeHidesEnemy / eyeReportText が関数',
      A.a.log.length >= 1 && fns.on === 'function' && fns.ex === 'function' && fns.hide === 'function' && fns.txt === 'function', { log: A.a.log.length, fns });
    {
      const want4 = logLine(A.caster, T4), want7 = logLine(B.caster, T7);
      const ok4 = A.node === 'n4' && A.a.ret === true && A.a.slot === 0 && A.a.log.length === 1 && A.a.log[0].msg === want4 && G4.groups.length >= 1;
      const ok7 = B.node === 'n7' && B.slot === 0 && B.log.length === 1 && B.log[0].msg === want7 && G7.boss === true && T7.indexOf(BIG) === 0
        && G7.bossNames.length >= 1 && G7.bossNames.every((n) => n && B.log[0].msg.indexOf(n) < 0) && B.liveBoss.every((n) => B.log[0].msg.indexOf(n) < 0)
        && G7.groups.slice(0, 2).every((g) => B.log[0].msg.indexOf(g.name) >= 0);
      R.check('(1a)', '砦 n4 ① 枠 1→0・ログ 1 行 = ドライバの文 / 砦 n7 ② (enterNode・未偵察) ⇒ 「' + BIG + '」+ 護衛の名前・ボスの名前なし', ok4 && ok7,
        { n4: { ret: A.a.ret, slot: A.a.slot, got: A.a.log.map((x) => x.msg), want: want4 }, n7: { slot: B.slot, got: B.log.map((x) => x.msg), want: want7, bossNames: G7.bossNames, liveBoss: B.liveBoss } });
    }
    R.check('(1b)', '枠 0 / 眼を知らない / ?eye=0 ⇒ 唱えない・ログ 0・枠は変わらない',
      A.b.b0.ret === false && A.b.b0.slot === 0 && A.b.b0.log === 0 && A.b.bn.ret === false && A.b.bn.slot === null && A.b.bn.log === 0 && A.b.scouted.length === 0
      && I.e1 === false && I.slotAfterEntry === 1 && I.logEntry === 0, { slot0: A.b.b0, noKey: A.b.bn, scoutedAfter: A.b.scouted, eye0: { ret: I.e1, slot: I.slotAfterEntry, log: I.logEntry } });
    {
      const Gs = drvGroups(E.info.n4), Gt = drvGroups(F.info);
      const Ts = drvText(Gs), Tt = drvText(Gt);
      /* ⭐ #79 K13: 本番の 2 部屋では隠し要素は 5 種目 = 文 (名前は 2 種まで) にも影絵 (4 マスまで) にも出ない位置。
       *   ⇒ 文だけでは除外をやめても緑のまま (変異 spoilhidden が空振り)。報告の材料 (eyeGroupsLive の種類と数) と
       *   影絵の各マス (×n と絵) もドライバの数えと突き合わせる。 */
      const aggOf = (G) => G.groups.map((g) => [g.type, g.n]);
      /* ⚠ 影絵の絵で隠し要素を見分けることはできない (swampNovice は lizardPriest と同じ絵) ⇒ マス i の絵 = ドライバの i 番目の種類の絵 (正の一致) */
      const cellsOk = (cells, G) => Array.isArray(cells) && cells.length === Math.min(4, G.groups.length)
        && cells.every((c, i) => !c.boss && c.cap === '×' + G.groups[i].n && !!G.groups[i].sprite && c.bg.indexOf(G.groups[i].sprite) >= 0);
      const okS = E.entry.length === 1 && E.entry[0] === logLine(E.caster, Ts) && !!E.novice && Gs.hidden.indexOf(E.novice) >= 0 && E.entry[0].indexOf(E.novice) < 0
        && J(E.agg) === J(aggOf(Gs)) && cellsOk(E.cells, Gs);
      const okT = F.node === 'n4' && F.log.length === 1 && F.log[0] === logLine(F.caster, Tt) && !!F.caelum && Gt.hidden.indexOf(F.caelum) >= 0 && F.log[0].indexOf(F.caelum) < 0
        && J(F.agg) === J(aggOf(Gt)) && cellsOk(F.cells, Gt);
      R.check('(1c)', '罠G: 沼地 n4 に「' + (E.novice || '?') + '」・神殿 n4 に「' + (F.caelum || '?') + '」が出ない (全名・報告の材料・影絵)・対照 = どちらもドライバの文と数えに一致', okS && okT,
        { swamp: { got: E.entry, want: logLine(E.caster, Ts), agg: E.agg, drv: aggOf(Gs), cells: E.cells && E.cells.map((c) => c.cap), hidden: Gs.hidden },
          temple: { got: F.log, want: logLine(F.caster, Tt), agg: F.agg, drv: aggOf(Gt), cells: F.cells && F.cells.map((c) => c.cap), hidden: Gt.hidden } });
    }
    R.check('(1d)', '同じ部屋で 2 回呼ぶ ⇒ 2 回目は唱えない (枠 1 のまま・ログ 0)', A.d.ret === false && A.d.slot === 1 && A.d.log === 0, A.d);
    R.check('(1e)', '主人公が魔法使い・currentSpellSlots["arcane-eye"] = 1 ⇒ 唱えて 0・ログに主人公の名前',
      Gp.ret === true && Gp.heroSlot === 0 && Gp.log.length === 1 && Gp.log[0] === logLine(Gp.heroName, T4), Gp);
    R.check('(1f)', 'startGame() の同期の戻りで dialogPaused === true・報告は 1 行・その後に false へ戻る',
      D.dpSync === true && D.log.length === 1 && D.dpAtLog === true && D.dpEnd === false, D);
    R.check('(1g)', 'initAllySpellSlots: Lv' + (SPELL_IDX.levelReq - 1) + '・習得済 ⇒ 0 / Lv' + SPELL_IDX.levelReq + '・未習得 ⇒ 0 / Lv' + SPELL_IDX.levelReq + '・習得済 ⇒ 1',
      g1.lowKnown === 0 && g1.reqUnknown === 0 && g1.reqKnown === 1, g1);
    {
      const x = A.x;
      const labelHit = Array.isArray(x.labels) && x.labels.some((s) => typeof s === 'string' && s.endsWith(' — ' + T7));
      const ok = x.tier === 'crit' && !!x.n7 && x.n7.eye === true && typeof x.n7.text === 'string' && x.n7.text.endsWith(' — ' + T7) && T7.indexOf(BIG) === 0
        && G7.groups.length >= 2 && G7.groups.slice(0, 2).every((g) => x.n7.text.indexOf(g.name) >= 0)
        && G7.bossNames.every((n) => x.n7.text.indexOf(n) < 0) && x.slot === 0 && x.log.length === 1 && x.log[0].msg === logLine(A.caster, '東へ進む — ' + T7) && labelHit;
      R.check('(2a)', '砦 n4 の出口 ⇒ 枠 1→0・n7 の文が「 — ' + T7.slice(0, 40) + '…」で終わる・ボス名なし・tier crit・eye・ラベルにも同じ・ログ 1 行', ok,
        { tier: x.tier, n7: x.n7, slot: x.slot, log: x.log.map((l) => l.msg), labels: x.labels, want: T7 });
    }
    {
      const TIERS = ['crit', 'success', 'fail', 'fumble'];
      R.check('(2b)', '罠D: 眼を唱えたら resolveSkillCheck 0 回 / 枠なしなら 1 回 (perception)・tier は 4 段のどれか',
        A.x.rsc === 0 && C.rsc.length === 1 && C.rsc[0].k === 'perception' && TIERS.indexOf(C.tier) >= 0 && C.log === 0,
        { eye: A.x.rsc, noSlot: { calls: C.rsc.length, k: C.rsc[0] && C.rsc[0].k, tier: C.tier, log: C.log } });
    }
    {
      const T7s = drvText(drvGroups(E.info.n7)), T6s = drvText(drvGroups(E.info.n6));
      const ok = E.log.length === 2 && E.slot === 0 && E.rsc === 0 && E.tier === 'crit' && E.e7 === true && E.e6 === true
        && typeof E.n6 === 'string' && E.n6.endsWith(' — ' + QUIET) && T6s === QUIET && typeof E.n7 === 'string' && E.n7.endsWith(' — ' + T7s)
        && E.log.some((m) => m.endsWith(' — ' + T7s)) && E.log.some((m) => m.endsWith(' — ' + QUIET));
      R.check('(2c)', '沼地 n4 ⇒ 1 回の詠唱で n7 と n6 (「' + QUIET + '」)・ログ 2 行・枠は 1 つだけ減る・判定 0 回', ok,
        { log: E.log, slot: E.slot, rsc: E.rsc, n7: E.n7, n6: E.n6, want7: T7s });
    }
    R.check('(2d)', '罠C: 出口で唱えた後 nodeState["n7"] が未定義・eyeScoutedNodes に n7', A.x.ns7 === 'undefined' && A.x.scouted.indexOf('n7') >= 0,
      { ns7: A.x.ns7, scouted: A.x.scouted });
    R.check('(2e)', '覗いた n7 へ enter ⇒ 入った時の詠唱はしない (枠 1 のまま・ログ 0)', A.e.node === 'n7' && A.e.slot === 1 && A.e.log === 0 && A.e.dp === false, A.e);
    R.check('(2f)', '同じノードで reveal を 2 回 ⇒ 2 回目は唱えない (枠 1 のまま・判定 0 回・ログ 0)', A.f.rsc === 0 && A.f.slot === 1 && A.f.log === 0, A.f);
    R.check('(3a)', '罠A: 詠唱 (① 入った時・③ 出口の前) の前後で exploredTiles / visibleTiles の全バイトの hash と 1 の個数が同じ',
      A.a.fog0 === A.a.fog1 && A.x.fog0 === A.x.fog1 && /:\d+\/[1-9]\d*\|/.test(A.a.fog0), { entry: [A.a.fog0, A.a.fog1], exits: [A.x.fog0, A.x.fog1] });
    {
      const ok = !!Jr && !Jr.err && Jr.log.length === 1 && Jr.done.length === 1 && !!Jr.pos0
        && Jr.log[0].dp === true && Jr.log[0].enc === false && Jr.log[0].px === Jr.pos0[0] && Jr.log[0].py === Jr.pos0[1]
        && Jr.done[0].r === true && Jr.done[0].dp === Jr.done[0].before && Jr.done[0].px === Jr.pos0[0] && Jr.done[0].py === Jr.pos0[1] && Jr.done[0].enc === false;
      R.check('(3b)', '罠B: ?autoplay=10 実走 — 報告の瞬間 dialogPaused・交戦なし・位置不変 / 詠唱の終わりで dialogPaused が元の値・位置不変', ok, Jr);
    }
    {
      const e4 = A.a.log[0] || {}, ex = A.x.log[0] || {};
      const ok = e4.show === true && e4.cells === Math.min(4, G4.groups.length) + (G4.boss ? 1 : 0) && e4.boss === (G4.boss ? 1 : 0)
        && ex.show === true && ex.cells === Math.min(4, G7.groups.length) + 1 && ex.boss === 1
        && A.a.after.show === false && A.a.after.kids === 0 && A.a.after.eyeLeft === 0 && A.x.after.show === false && A.x.after.eyeLeft === 0
        && A.a.sfx >= 1 && A.a.dp === false && A.a.sk === false && A.x.dp === false;
      R.check('(3c)', '報告の間 影絵 min(4, 種類) + ボスの丸い影 / 閉じた後は非表示・眼が残らない・sfx("narration") ≥ 1・旗は元へ', ok,
        { entry: { cells: e4.cells, boss: e4.boss, show: e4.show, kinds: G4.groups.length }, exits: { cells: ex.cells, boss: ex.boss, show: ex.show, kinds: G7.groups.length }, after: [A.a.after, A.x.after], sfx: A.a.sfx });
    }
    R.check('(4a)', '傾向を全部 arcane-eye にして apTryPreferred(魔法使いの仲間) ⇒ false・枠 1 のまま・executeSkillOn まで届かない',
      f4.apOn === true && f4.ap === false && f4.slotAfterAp === 1 && f4.reachedEx === 0, f4);
    R.check('(4b)', 'executeSkillOn(ally, "mage", "arcane-eye", -1) ⇒ false・枠 1 のまま', f4.ex === false && f4.slotAfterEx === 1, f4);
    R.check('(4c)', '主人公 (魔法使い) の技の候補に arcane-eye が無い・対照 fireball は在る・outOfCombat === true',
      Array.isArray(c4.captured) && c4.captured.indexOf('arcane-eye') < 0 && c4.captured.indexOf('fireball') >= 0 && c4.ooc === true, c4);
    {
      const argsOf = (r) => r.rsc.map((c) => [c.k, c.dc, c.extraBonus, c.title]);
      const ok = C.rsc.length === 1 && I2.rsc.length === 1 && J(argsOf(C)) === J(argsOf(I2)) && J(C.hr) === J(I2.hr) && C.log === 0 && I2.log === 0;
      R.check('(6a)', '眼の枠が無い編成で reveal ⇒ 知覚判定の引数 (DC・extraBonus・title) と hintsRevealed が ?eye=0 と同じ', ok,
        { now: { args: argsOf(C), hr: C.hr }, off: { args: argsOf(I2), hr: I2.hr } });
    }
    R.check('(6b)', 'pickScrollId の全区間 ⇒ rare: 素 = ソースの rare ' + RARE_IDX.length + ' 種 (眼あり) / ?eye=0 = ' + RARE_PRE79.length + ' 種 (#79 以前)・uncommon ' + UNCOMMON_IDX.length + ' 種は両方同じ',
      J(pickRare1) === J(RARE_IDX) && J(pickRare0) === J(RARE_PRE79) && pickRare1.indexOf(EYE_SCROLL_ID) >= 0 && pickRare0.indexOf(EYE_SCROLL_ID) < 0
      && J(pickUnc1) === J(UNCOMMON_IDX) && J(pickUnc0) === J(UNCOMMON_IDX), { rare: { now: pickRare1, off: pickRare0 }, unc: { now: pickUnc1, off: pickUnc0 } });
    R.check('(7a)', 'index.html?eye=0 ⇒ (1a)(2a) と同じ仕込みで唱えない・出口は知覚判定を 1 回振る (眼の文なし)',
      I.e1 === false && I.logEntry === 0 && I.rsc === 1 && I.eye7 === false && I.slot === 1 && I.log === 0, I);
    R.check('(0e)', '[装置] 眼の素材: 画像あり ⇒ .noimg なしで飛び報告が届く / png 404 ⇒ .noimg の光の玉で飛び報告が届く・眼は残らない',
      Gp.eyeSeen === true && Gp.noimg === false && Gp.log.length === 1 && Gp.after.eyeLeft === 0
      && H.ret === true && H.eyeSeen === true && H.noimg === true && H.log === 1 && H.after.eyeLeft === 0, { image: { seen: Gp.eyeSeen, noimg: Gp.noimg, log: Gp.log.length }, noimg: H });

    /* ══════════ tavern.html 開発モード ══════════ */
    await bootTavern('', true);
    const tvAns = await tv.evaluate(() => ({ dev: DF_DEV_MAGIC_SHOP, spell: (MAGE_SKILLS_UI.find((s) => s.id === 'arcane-eye') || null), scroll: SCROLL_CATALOG_TV['scroll-arcane-eye'] || null }));
    {
      await tv.evaluate(() => __equipTV.setGold(1));
      const rows = await shelfRows();
      const eye = rows.filter((x) => x.name === EYE_SCROLL.name);
      const inv = rows.filter((x) => x.name === INV_SCROLL_TV.name);
      const commons = COMMON_TV.map((c) => rows.filter((x) => x.name === c.name)[0] || null);
      const buy = await tv.evaluate((id) => { const r = __equipTV.shopBuyScroll(id); return { r, gold: __equipTV.gold(), stock: __equipTV.scrollStock()[id] || 0 }; }, EYE_SCROLL_ID);
      const ok = tvAns.dev === true && eye.length === 1 && eye[0].btn === '購入 1G' && inv.length === 1
        && commons.every((x) => x && (x.btn === null || x.btn === '購入 ' + PRICE + 'G')) && commons.some((x) => x && x.btn === '購入 ' + PRICE + 'G')
        && buy.r.ok === true && buy.r.price === 1 && buy.gold === 0 && buy.stock === 1;
      R.check('(5a)', '開発モード: 棚に「' + EYE_SCROLL.name + '」=「購入 1G」・1G で買える (金貨 0・所持 1)・透明化も並ぶ・common は「購入 ' + PRICE + 'G」', ok,
        { dev: tvAns.dev, rows, buy });
    }
    {
      const learn = await tv.evaluate((id) => { const l = __equipTV.learnScroll(id); return { learned: l && l.learned, known: (knownSpellsTV.mage || []).indexOf('arcane-eye') >= 0 }; }, EYE_SCROLL_ID);
      const dr = await tv.evaluate(() => {
        pmOrdered = [{ classKey: 'mage', isHero: true, name: '', zone: 'rear', variant: 0 }];
        pmRenderDrawer(0);
        const items = Array.from(document.querySelectorAll('#pmDrawer .spellCountItem'));
        const hit = items.filter((it) => { const n = it.querySelector('.sName'); return n && n.textContent.indexOf('アーケインアイ') >= 0; });
        return { lv: getLevelFromXP(inventory.xp), n: items.length, texts: hit.map((it) => it.querySelector('.sName').textContent) };
      });
      const lock = '[Lv' + SPELL_TV.levelReq + ' 必要]';
      const ok = learn.known === true && dr.lv === 1 && dr.texts.length === 1 && dr.texts[0].indexOf(SPELL_TV.name) >= 0 && dr.texts[0].indexOf(lock) >= 0;
      R.check('(5c)', 'learnScroll ⇒ knownSpellsTV.mage に arcane-eye・引き出しの呪文一覧に「' + SPELL_TV.name + '」(主人公 Lv1 では ' + lock + ')', ok, { learn, drawer: dr });
    }
    {
      const d5 = await tv.evaluate(() => {
        selection.partySkills.mage = ['sleep', 'arcane-eye'];
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
      const clean = (o) => sits.every((s) => Array.isArray(o[s]) && o[s].indexOf('arcane-eye') < 0 && o[s].indexOf('sleep') >= 0);
      const ok = clean(d5.drawer) && clean(d5.prep) && typeof d5.card === 'string' && d5.card.indexOf(SPELL_TV.name) >= 0;
      R.check('(5d)', '枠に置いても傾向の「全般 / 雑魚 / ボス」の <option> (引き出し + 準備画面) に出ない (対照スリープは出る)・カードの「技」行には出る', ok, d5);
    }

    /* ══════════ tavern.html 開発モードでない ══════════ */
    await bootTavern('', false);
    {
      const rows = await shelfRows();
      const nb = await tv.evaluate((id) => ({ dev: DF_DEV_MAGIC_SHOP, r: __equipTV.shopBuyScroll(id), shelf: __equipTV.scrollShelf().map((x) => x.id) }), EYE_SCROLL_ID);
      const ok = nb.dev === false && rows.length >= 1 && !rows.some((x) => x.name === EYE_SCROLL.name) && nb.shelf.indexOf(EYE_SCROLL_ID) < 0 && nb.r.ok === false && nb.r.reason === 'noitem';
      R.check('(5b)', '開発モードでない ⇒ 棚に並ばない・shopBuyScroll = noitem', ok, { rows: rows.map((x) => x.name), nb });
    }

    /* ══════════ tavern.html?eye=0 / ?invis=0 + 開発 ══════════ */
    await bootTavern('?eye=0', true);
    {
      const rows = await shelfRows();
      const dev = await tv.evaluate(() => DF_DEV_MAGIC_SHOP);
      const ok = dev === true && !rows.some((x) => x.name === EYE_SCROLL.name) && rows.some((x) => x.name === INV_SCROLL_TV.name);
      R.check('(7b)', 'tavern.html?eye=0 + 開発 ⇒ 眼が並ばない・透明化は並ぶ', ok, { dev, rows: rows.map((x) => x.name) });
    }
    await bootTavern('?invis=0', true);
    {
      const rows = await shelfRows();
      const dev = await tv.evaluate(() => DF_DEV_MAGIC_SHOP);
      const ok = dev === true && rows.some((x) => x.name === EYE_SCROLL.name) && !rows.some((x) => x.name === INV_SCROLL_TV.name);
      R.check('(7c)', '罠F: tavern.html?invis=0 + 開発 ⇒ 透明化は並ばない・眼は並ぶ', ok, { dev, rows: rows.map((x) => x.name) });
    }

    /* ══════════ (0a) ソース ⇔ ページ ══════════ */
    {
      const same = (a, b) => !!a && !!b && a.name === b.name && a.spellId === b.spellId && a.classKey === b.classKey && a.rarity === b.rarity;
      const src = EYE_ROWS_IDX.length === 1 && EYE_ROWS_TV.length === 1 && same(EYE_ROWS_IDX[0], EYE_ROWS_TV[0])
        && EYE_SCROLL.rarity === 'rare' && EYE_SCROLL.classKey === 'mage' && EYE_SCROLL.spellId === EYE_ID
        && SPELL_IDX.levelReq === 7 && SPELL_IDX.levelReq === SPELL_TV.levelReq && SPELL_IDX.mpCost === SPELL_TV.mpCost && SPELL_IDX.name === SPELL_TV.name
        && typeof SPELL_IDX.mpCost === 'number' && SPELL_IDX.outOfCombat === true && SPELL_TV.autoCast === true;
      const pg = same(fns.scroll, EYE_SCROLL) && same(tvAns.scroll, EYE_SCROLL)
        && !!fns.page && fns.page.levelReq === SPELL_IDX.levelReq && fns.page.mpCost === SPELL_IDX.mpCost && fns.page.name === SPELL_IDX.name
        && !!tvAns.spell && tvAns.spell.levelReq === SPELL_TV.levelReq && tvAns.spell.mpCost === SPELL_TV.mpCost && tvAns.spell.name === SPELL_TV.name;
      R.check('(0a)', '[装置] ソース 2 ファイルの巻物の行が同じ中身 (rare) で 1 行ずつ・呪文 2 定義の levelReq (= 7) / mpCost が一致・ページの答えもソースと一致', src && pg,
        { srcScroll: [EYE_ROWS_IDX.length, EYE_ROWS_TV.length, EYE_SCROLL], srcSpell: [SPELL_IDX, SPELL_TV], pageIdx: [fns.scroll, fns.page], pageTv: [tvAns.scroll, tvAns.spell && [tvAns.spell.levelReq, tvAns.spell.mpCost]] });
    }
    /* ══════════ (0d) 罠E ══════════ */
    {
      const rows = ANCHORS_0D.map((a) => ({ src: a.src, file: a.file, want: a.want, got: countOf(PRISTINE[a.file], a.s) }));
      const bad = rows.filter((r) => r.got !== r.want);
      R.check('(0d)', '[装置] 罠E: verify_invisibility の変異アンカー 11 本 + driver_graph_sce1 の noimmediate が原本で要求どおりの回数', bad.length === 0,
        bad.length ? { bad } : rows.map((r) => r.got).join(',') + ' (全 ' + rows.length + ' 本)');
    }
    /* ── (6c) ── */
    { const r = run6c(); R.check('(6c)', 'verify_invisibility --negative 素 27/27・変異 9/9・exit 0 / 入れ子 verify_scroll_shelf --negative 素 19/19・変異 8/8 (1 回だけ実行して共有)', r.ok, r.detail); }
    /* ── (0c) 起動確認 ── */
    {
      const want = 11 + 4;   // index 11 枚 (A B C D E F G H I I2 J) + tavern 4 回
      R.check('(0c)', '[装置] 全ページが起動し pageerror 0 件', ctx.booted === want && ctx.errs.length === 0, '起動 ' + ctx.booted + '/' + want + ' / pageerror ' + J(ctx.errs.slice(0, 3)));
    }
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await new Promise((r) => setTimeout(r, 200));   // console イベントの取りこぼしを避ける
    for (const pg of pages) await pg.close().catch(() => {});
  }
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_arcane_eye_');
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
