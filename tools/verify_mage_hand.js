#!/usr/bin/env node
/*
 * verify_mage_hand.js — 実装依頼書 #80「メイジハンド」の受入ドライバ (依頼書 2026-10-01_mage-hand.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_mage_hand.js                           # 素
 *   node tools/verify_mage_hand.js --negative                # 変異 12 本 (port 10515〜10526)。先に素の基準を走らせる
 *   node tools/verify_mage_hand.js --negative --only nogate,nolos
 *   node tools/verify_mage_hand.js --mutate nolos            # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome が無い)・例外
 *      3=装置の腐敗 (変異の注入点が 1 箇所でない・行数が変わる・他ドライバのアンカーと重なる / ソースの正規表現が 0 件)
 *
 * ■ 方針 — index.html を sessionStorage["dragonfighters.currentScenario"] を仕込んで開き (?diag=1 = 検証シームあり・
 *   自動開始なし)、**盤面は実プレイと同じ入場**で組む (起動 = buildNode だけ / 別ノードは __graphRun.enter = enterNode)。
 *   ⛔ spawnNodeEntities() を二重に呼ばない (#80 K1: 二重撒きで檻・罠・宝箱が倍になり beastIdx でも除けない)。
 *   - ダイアログは showCharChoice / showChoice を**包んで記録**し、押下は #choiceDialog のボタンを**実際にクリック**する
 *     (包んで答えを返すと「出たか」と「押した結果」が同じ道具になる・依頼書 §8)。⚠ 押す腕だけ、記録の後で
 *     opts.autoSkipMs を外して元の関数へ渡す (window.__ccHold)。召喚の前例と同じ 2000ms の自動スキップは
 *     クリックの遅れと競るので、押す腕の決定性のために外す (#80 §12-2)。押さない腕は元の opts のまま。
 *     ★[#84] 本番の手のダイアログは自動スキップを持たない (押すまで待つ)。押さない腕 (__ccHold が偽) の手のダイアログ
 *     (取り消し「触らない (Esc)」) にだけ、ドライバが明示の自動スキップ window.__ccAutoClose (既定 2000ms) を渡して閉じる。
 *   - 手を使ったかは 2 経路: ① appendLog の「✋」行 ② 対象の状態 (cage.opened / mimicChest.awakened / trap.triggered)。
 *   - 習得は localStorage "dragonfighters.knownSpells" を焼く (新しいドキュメントの前) か、knownSpells.mage へ push。
 *   - 酒場は tavern.html を別に開き、棚のボタンを実際に押して買う → __equipTV.learnScroll で読む。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] ソース 2 ファイルの巻物の表に scroll-mage-hand がちょうど 1 行ずつ・common・mage・mage-hand・両表で同じ /
 *           ページの答え (SCROLL_CATALOG / SCROLL_CATALOG_TV) もソースと同じ
 *      (0b) [装置] 森 n7 (実入場) の cages に beastIdx >= 0 の檻がちょうど 1 つ・(55,8)・獣が同じタイル
 *           ⭐ これが 0 だと §1〜§4 が全部空振り
 *      (0c) 魔法使いが居る編成で 覚えていない ⇒ mageHandCaster() === null・offerMageHand でダイアログ 0・_handAsked が生えない /
 *           覚える ⇒ 仲間の魔法使い
 *      (0d) [装置] 全ページが起動し pageerror 0 件
 *      (0e) [装置] window に isMageHandOn / mageHandCaster / flyMageHand / offerMageHand / tryMageHandCalm / tryMageHandInCombat
 *   §1 (1a) n7 の檻 = (55,8)・本番 isTileWall で床・入場 (12,15) から本番 aStar で到達可能
 *      (1b) 撤退腕 ?s2fold=0 の n6 (__graphRun.enter) の檻は (36,13)
 *      (1c) n7 の檻は noAutoEscape === true / ?s2fold=0 の n6 の檻は false
 *      (1d) 檻から 12 マス以内で視線 (本番 hasLineOfSight) の通る床が 1 つ以上・その全部が x ≥ 48 (柵の内側)
 *   §2 (2a) 実の setInterval(tryMageHandCalm) で (51,12) から: ダイアログ 1 回・本文に「レバー」・押すと opened・獣 inactive=false・
 *           獣が最寄りの盗賊の左隣 (openCage のワープ式をドライバが独立に計算)・「✋」1 行・.dfMageHand が残らない
 *      (2b) 視線なし (47,15)(38,15) と 12 マス超で視線あり の床では戦闘前の口が出ない
 *      (2c) 断った (「触らない」を押した) 後、同じ口 (実の interval) からは二度と出ない
 *   §3 (3a) 実の戦闘 (tryStartEncounter) で魔法使いが 3〜5 マス + 視線 ⇒ ダイアログが ROUND N のバナーの後・
 *           そのラウンド最初の手番 (RunChronicle.beginTurn) より前・押すと開く
 *      (3b) ★[#84] 戦闘中の口の 12 マス境界 (視線あり): 12 マス超で最も近い床では出さない / 12 マス以内で最も遠い床 (≥10.5) では出す
 *      (3c) 開けた次のラウンドのバナーの時点で獣が encounterEnemyIndices に入っている
 *   §4 (4a) n7 の檻から 800px 以内で戦闘中 (encounterActive)・Math.random = 0 で自然脱走②の判定が 2 回以上走っても開かない
 *      (4b) 同じ仕込みを ?s2fold=0 の n6 へ ⇒ 開く (停止がアジトだけであることの対)
 *   §5 (5a) 魔法の眼 + 手を覚えた魔法使い・入場の眼 ⇒ 眼のログ → 手のダイアログ (射程外・視線なしでも) → 押すと開く・
 *           手の間も dialogPaused === true (K3)・眼の戻り値 true・眼のログ 1 行・後で dp/sk が元へ
 *      (5b) 出口の前の眼 (?s2fold=0 の n0 で __graphRun.reveal ⇒ tryArcaneEyeAtExits) は唱えるが、offerMageHand を 1 回も
 *           呼ばない・ダイアログ 0 (⚠ 檻のある n6 は行き止まり = 出口の眼が唱えられないので、呼び出しそのものを数える)
 *      (5c) 手を覚えていない入場の眼の結果 (戻り値・ログ・eyeScoutedNodes・dp/sk の止まり方・枠) が ?magehand=0 の腕と完全一致
 *   §6 (6a) (2a)(3a)(5a)(7b)(8a) で、ダイアログを出した時と手を使った後の currentSpellSlots + 全仲間の spellSlots が完全一致
 *   §7 (7a) 手あり ⇒ showCharChoice に 2 択 (「解除する」「メイジハンドで解除する…」)・showChoice は呼ばない
 *      (7b) 手のボタンを押し、判定をファンブルに固定 ⇒ 主人公と全員の HP 不変・trap.triggered・「幽霊の手」の一行・「✋」・
 *           triggerTrapOnPlayer 0 回
 *      (7c) 手なしで同じファンブル ⇒ 今どおり主人公が被弾 (triggerTrapOnPlayer 1 回)
 *      (7d) 手なし ⇒ showChoice が今の 3 引数 ("見つけた罠を解除しますか?", "解除する", "迂回する") で 1 回・showCharChoice 0 回
 *   §8 (8a) 竜の巣 n7 (__graphRun.enter) の本物の宝の山: 手で叩く ⇒ awakenMimic が forewarned:true で 1 回・粘着なし・
 *           囮 3 箱は opened === false
 *      (8b) 手なしで主人公が近づく (実の tryApproachMimic) ⇒ forewarned:false
 *   §9 (9a) 酒場の棚に「巻物・メイジハンド」= 「購入 <SCROLL_SHELF_PRICE>G」(80G)・ボタンを押すと買える → learnScroll ⇒
 *           knownSpellsTV.mage と localStorage に mage-hand
 *      (9b) MAGE_SKILLS_UI に mage-hand が無い・読んだ後の引き出し (#pmDrawer) の技 / 呪文の行 (.skillItem / .spellCountItem) に
 *           「メイジハンド」が無く、押せない表示の 1 行 (.pmDrawerInnateRow) がちょうど 1 つ・押しても設定が変わらない
 *           (★[#84] の言い直し。#80 は「出ない」を測っていた。対照: 呪文の行は出る)
 *   §10 (10a) 手を覚えていない新しいセーブ・同じ乱数種 (Math.random を種付き PRNG に差し替え) で、森 n7 の
 *           「見つけた罠の隣 + 檻を射程に収めた魔法使い」の盤面を gameStarted で 15 秒進めた showChoice / showCharChoice の
 *           呼び出し列が ?magehand=0 の腕と完全一致 (列は空でない)。⚠ 罠の解除の口は主人公が 1 マス進んだ時にしか
 *           呼ばれないので、進め始めに runTrapDisarmCheck() を 1 回だけ直に呼ぶ (window.__autoplay = 1 でダイアログは即決)
 *   §11 (11a) ?magehand=0 + 覚えている ⇒ 戦闘前 (実 interval)・戦闘中・眼・罠のどれでも手のダイアログ 0 回・罠は showChoice
 *      (11b) pickScrollId({common:100,…}) を 2 投目の全区間 2000 点で回す ⇒ ?magehand=0 は scroll-mage-hand 0 回 / 素は 1 回以上
 *   ⛔ 測らないこと (依頼書 §8): シナリオ2 の勝率 / 手の飛ぶ速さ・光の色 / 一行の文面の細部 (ただし「レバー」「幽霊の手」は固定) /
 *      手でミミックを起こしたときの DM 文 (#80 K15 で据え置き)
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。index.html と tavern.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列を
 *     メモリ上で差し替える (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *   - 起動時に全変異のアンカーを**原本**で検算する (ちょうど 1 件・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *   - ⭐ 罠E の自己検査: 自分の変異アンカーが同じ場所を測る他ドライバ (driver_grid_s2 / verify_scroll_shelf /
 *     driver_trap_disarm / verify_arcane_eye / verify_invisibility) のソースに 1 本も出てこないこと (出たら exit 3)。
 *     ⇒ 変異 cageold は driver_grid_s2 の nobeastmove と同じ「檻の 2 行」を使わず、nodeExtrasFor の中で n7 の行を
 *       (41,17) へ書き戻す形にした。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を持ち、**欠陥が効く枝でだけ**鳴る。--negative / --mutate では
 *     その件数で「注入行が実行された」を確かめる (0 件 = 空振り扱いで exit 1)。
 *   - ⛔ git を読まない ⇒ 影のツリーでもそのまま走る。⛔ timeout コマンドで包まない。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *   - 判定行は `  ✓ (1a) …` / `  ✗ (1a) …`、総括行は `  N/N PASSED   FAILED 0   PENDING 0` (verify_arcane_eye と同じ型)。
 *
 * ■ ポート = **10514** (素) / 変異 **10515〜10526** (12 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-10-02 この機械の実測・HEAD c20d91c) = 素 約 140 秒 (32 assert・index 12 枚 + tavern 1 枚) /
 *   --negative 約 30 分 (素の基準 + 変異 12 本)。
 * ■ 担当表の依頼書 §8 との差 (実走で決めた。予想は全部含む = 依頼書 §12-2):
 *   nogate +(5c)(7d) / cageold +(1d)(2b)(2c)(3a)(3c)(6a) / trapchoice +(11a) / eyechainoff +(6a) / rollbackleak +(5c)。
 *   (6a) は「手を使わなかった腕は枠の対が取れない = 赤」(⛔ 取れない対を緑にしない)。
 * ■ #84 (2026-10-04・依頼書 2026-10-03_mage-hand-reach.md §10-1) で言い直した: (3b) 6 マス超・12 以内で出ない → 12 マス境界 /
 *   (9b) 引き出しに出ない → 技 / 呪文の行に無く表示 1 行だけ / 変異 combatfar (空振りになった) → combat6 (戦闘中 6 マスへ戻す・担当 (3b)) /
 *   押さない腕の手のダイアログはドライバの __ccAutoClose で閉じる。担当表は #84 の実走で取り直し、12 本とも #80 と同じ集合。
 * ■ 依頼書と違えた測り方 (期待は弱めていない・依頼書 §12-2): (4a) 30 秒 → 自然脱走②の判定が 2 回以上走ったこと /
 *   (5b) n6 → n0 + offerMageHand の呼び出し数 / (10a) 60 秒の autoplay → 罠の口を 1 回直に呼んで 15 秒 /
 *   (3a) 主人公を (53,12) 付近へ (増援の届く距離) / (5c) 2 腕とも同じ乱数種 (編成が乱数で決まる)。
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
const PORT = parseInt(arg('port', '10514'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);
const HAND_ICON = '\u270B';          // ✋
const EYE_ICON = '\u{1F441}';        // 👁
const HAND_ID = 'mage-hand';
const HAND_SCROLL_ID = 'scroll-mage-hand';
const HAND_NAME = 'メイジハンド';
const TRAP_Q = '見つけた罠を解除しますか?';
const SEED = 0x80C0FFEE;
const RUN10A_MS = 15000;

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_INDEX = 'index.html';
const F_TAVERN = 'tavern.html';
const PRISTINE = {
  [F_INDEX]: fs.readFileSync(path.join(ROOT, F_INDEX), 'utf8'),
  [F_TAVERN]: fs.readFileSync(path.join(ROOT, F_TAVERN), 'utf8'),
};
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
const HAND_ROWS_IDX = CAT_IDX.filter((c) => c.id === HAND_SCROLL_ID);
const HAND_ROWS_TV = CAT_TV.filter((c) => c.id === HAND_SCROLL_ID);
if (!HAND_ROWS_IDX.length || !HAND_ROWS_TV.length) vetFail('(0a) scroll-mage-hand の行がソースに無い (index ' + HAND_ROWS_IDX.length + ' / tavern ' + HAND_ROWS_TV.length + ')');
const HAND_SCROLL = HAND_ROWS_IDX[0];
const PRICE_M = PRISTINE[F_TAVERN].match(/const SCROLL_SHELF_PRICE = (\d+);/);
if (!PRICE_M) vetFail('ソースに const SCROLL_SHELF_PRICE = <n>; が無い');
const PRICE = parseInt(PRICE_M[1], 10);

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 12 本)。逐語は HEAD c20d91c (項目2 の実装後) の行で取った。
 * 各変異は console.log("__MUTHIT__<key>") を**欠陥が効く枝**に持つ。原本でちょうど 1 件・全部置き換える。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const MUTATIONS = {
  /* mageHandCaster の isSpellKnown を外す (印は覚えていないのに通したとき) */
  nogate: [
    { file: F_INDEX, from: '      if (!isMageHandOn() || !isSpellKnown("mage", MAGE_HAND.id) || gameOver) return null;',
      to: '      if (!isMageHandOn() || (!isSpellKnown("mage", MAGE_HAND.id) && (' + HIT('nogate') + ', false)) || gameOver) return null;   /* ★変異nogate */' }],
  /* 罠B: 押した後に術者の呪文枠を 1 つ使う (印は実際に減らしたとき) */
  slotburn: [
    { file: F_INDEX, from: '              if (pick !== 0) return false;',
      to: '              if (pick !== 0) return false; { const __r = getSpellSlotsRef(caster.actor); const __k = __r && Object.keys(__r).find((s) => __r[s] > 0); if (__k && consumeSpellSlot(caster.actor, __k)) ' + HIT('slotburn') + '; }   /* ★変異slotburn */' }],
  /* 罠A: 酒場の MAGE_SKILLS_UI に mpCost 1 の行を足す (印は表の評価時) */
  handinpool: [
    { file: F_TAVERN, from: '  const MAGE_SKILLS_UI = [',
      to: '  const MAGE_SKILLS_UI = [ { id: "mage-hand", name: "メイジハンド", category: "補助", range: "spellSingle", mpCost: (' + HIT('handinpool') + ', 1), flavor: "幽霊の手" },   /* ★変異handinpool */' }],
  /* 檻を (41,17) のまま (⚠ 罠E: driver_grid_s2 nobeastmove の「檻の 2 行」を使わず、nodeExtrasFor で n7 の行を書き戻す) */
  cageold: [
    { file: F_INDEX, from: '      const t = SCENARIO_NODE_EXTRAS[_builtinScenId];',
      to: '      const t = SCENARIO_NODE_EXTRAS[_builtinScenId]; if (t && t.n7 && t.n7.cages && t.n7.cages[0] && t.n7.cages[0].tx === 55) { t.n7.spawns[0] = ["shadowBeast", 41, 17, "s2_beast_intel"]; t.n7.cages[0] = { tx: 41, ty: 17, flag: "s2_beast_intel", noAutoEscape: true }; ' + HIT('cageold') + '; }   /* ★変異cageold */' }],
  /* 罠D: 自然脱走②の noAutoEscape の行を効かせない (印はアジトの檻を通したとき) */
  escapeon: [
    { file: F_INDEX, from: '        if (cage.noAutoEscape) continue;',
      to: '        if (cage.noAutoEscape && (' + HIT('escapeon') + ', false)) continue;' }],
  /* n6 (?s2fold=0) の檻にも noAutoEscape: true (印は n6 の枝の評価時) */
  escapeall: [
    { file: F_INDEX, from: '                  cages:  [{ tx: 36, ty: 13, flag: "s2_beast_intel" }] } },',
      to: '                  cages:  [{ tx: 36, ty: 13, flag: "s2_beast_intel", noAutoEscape: (' + HIT('escapeall') + ', true) }] } },   /* ★変異escapeall */' }],
  /* ★[#84] 戦闘中の射程を #80 の 6 マスへ戻す (印は戦闘中の口を呼んだとき)。⚠ #80 の combatfar (戦闘中も calm で聞く) は
   *   #84 で calm = combat = 12 になり挙動が変わらない = 空振りになったので定義し直した (依頼書 §10-0 K4) */
  combat6: [
    { file: F_INDEX, from: '      return offerMageHand("combat", MAGE_HAND.combatRangeTiles);',
      to: '      return offerMageHand("combat", (' + HIT('combat6') + ', 6));   /* ★変異combat6 */' }],
  /* 視線を見ない (印は視線の通らない物を通したとき) */
  nolos: [
    { file: F_INDEX, from: '              if (!hasLineOfSight(caster.cx, caster.cy, p.x, p.y)) continue;',
      to: '              if (!hasLineOfSight(caster.cx, caster.cy, p.x, p.y) && (' + HIT('nolos') + ', false)) continue;   /* ★変異nolos */' }],
  /* 手のファンブルでも従来のファンブル枝 (triggerTrapOnPlayer) へ落とす (印は手のファンブルを落としたとき) */
  fumblehurts: [
    { file: F_INDEX, from: '      } else if (res && res.fumble && opts && opts.viaHand) {',
      to: '      } else if (res && res.fumble && opts && opts.viaHand && (' + HIT('fumblehurts') + ', false)) {   /* ★変異fumblehurts */' }],
  /* 罠H: 手なしでも showCharChoice の 2 択へ (印は手なしで 2 択へ入ったとき) */
  trapchoice: [
    { file: F_INDEX, from: '        if (handCaster) {',
      to: '        if (handCaster || (' + HIT('trapchoice') + ', true)) {   /* ★変異trapchoice */' }],
  /* 眼の口の 1 行を消す (印は眼の後に手を聞くはずだった所) */
  eyechainoff: [
    { file: F_INDEX, from: '        await offerMageHand("eye", null);',
      to: '        ' + HIT('eyechainoff') + ';   /* ★変異eyechainoff */' }],
  /* isMageHandOn が ?magehand=0 を見ない (印は ?magehand=0 を無視したとき) */
  rollbackleak: [
    { file: F_INDEX, from: '      try { return new URLSearchParams(window.location.search).get("magehand") !== "0"; }',
      to: '      try { if (new URLSearchParams(window.location.search).get("magehand") === "0") ' + HIT('rollbackleak') + '; return true; }   /* ★変異rollbackleak */' }],
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた。
 * ⭐ --negative は「赤の集合 = 担当」の完全一致を要求する。依頼書 §8 との差は依頼書 §12-2 に書いた。 */
const NEG_EXPECT = {
  /* 覚えていない腕は全部「手あり」へ倒れる ⇒ 眼 (5c)・罠 (7d) も赤 */
  nogate:       ['(0c)', '(5c)', '(7d)', '(10a)'],
  slotburn:     ['(6a)'],
  handinpool:   ['(9b)'],
  /* 檻の位置を測る腕は全部動く: (41,17) は柵の外からも見える (1d)(2b)・(52,12) から 12 マス超 (2c)(3a)(3c)・
   * 手を使わなかった腕は (6a) の枠の対が取れない (⛔ 取れない対を緑にしない) */
  cageold:      ['(0b)', '(1a)', '(1d)', '(2b)', '(2c)', '(3a)', '(3c)', '(6a)'],
  escapeon:     ['(4a)'],
  escapeall:    ['(1c)', '(4b)'],
  combat6:      ['(3b)'],
  nolos:        ['(2b)'],
  fumblehurts:  ['(7b)'],
  /* ?magehand=0 の罠も 2 択へ倒れる ⇒ (11a) の罠の部分も赤 */
  trapchoice:   ['(7d)', '(11a)'],
  /* 手を使わないので (5a) の枠の対が取れない ⇒ (6a) も赤 */
  eyechainoff:  ['(5a)', '(6a)'],
  /* ?magehand=0 の眼の腕にも手が出る ⇒ (5c) も赤 */
  rollbackleak: ['(5c)', '(11a)', '(11b)'],
};
/* 依頼書 §8 の予想 (⭐ 実測の赤に含まれていることは崩さない = 起動時に検算) */
const NEG_PREDICTED = {
  nogate: ['(0c)', '(10a)'], slotburn: ['(6a)'], handinpool: ['(9b)'], cageold: ['(0b)', '(1a)'], escapeon: ['(4a)'],
  escapeall: ['(1c)', '(4b)'], combat6: ['(3b)'], nolos: ['(2b)'], fumblehurts: ['(7b)'], trapchoice: ['(7d)'],
  eyechainoff: ['(5a)'], rollbackleak: ['(11a)', '(11b)'],
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 12) vetFail('変異は 12 本まで (ポート 10515〜10526)');
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_PREDICTED[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) vetFail('NEG_EXPECT / NEG_PREDICTED と MUTATIONS が揃っていない');
for (const k of MUT_ORDER) {
  const miss = NEG_PREDICTED[k].filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  if (miss.length) vetFail('担当 ' + k + ' が依頼書 §8 の予想 ' + J(NEG_PREDICTED[k]) + ' を含まない');
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) vetFail('未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) vetFail('未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')');

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
/* ⭐ 罠E の自己検査: 同じ場所を測る他ドライバのソースに、自分のアンカー (前後の空白を落とした形) が出てこないこと */
const PEER_DRIVERS = ['driver_grid_s2.js', 'verify_scroll_shelf.js', 'driver_trap_disarm.js', 'verify_arcane_eye.js', 'verify_invisibility.js'];
const PEER_SRC = PEER_DRIVERS.map((f) => { try { return { f, s: fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8') }; } catch (e) { return { f, s: null }; } });
if (PEER_SRC.some((x) => x.s === null)) vetFail('罠E の自己検査: 他ドライバのソースが読めない (' + PEER_SRC.filter((x) => x.s === null).map((x) => x.f).join(',') + ')');
for (const k of MUT_ORDER) for (const e of MUTATIONS[k]) {
  const core = e.from.trim();
  const clash = PEER_SRC.filter((x) => x.s.indexOf(core) >= 0).map((x) => x.f);
  if (clash.length) vetFail('変異 ' + k + ' のアンカーが他ドライバのソースに出てくる (罠E): ' + clash.join(','));
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
    const c = countOf(PRISTINE[file], e.from);
    if (c !== 1) vetFail('変異 ' + key + ' の注入点が 1 箇所ではない (' + file + ' に ' + c + ' 件): ' + e.from.slice(0, 160));
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
console.log('[vet] 装置: 巻物 index ' + CAT_IDX.length + ' / tavern ' + CAT_TV.length + ' 件 / scroll-mage-hand index ' + HAND_ROWS_IDX.length + '・tavern ' + HAND_ROWS_TV.length
  + ' 行 (' + HAND_SCROLL.rarity + ') / SCROLL_SHELF_PRICE ' + PRICE + ' / 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本で 1 箇所・他ドライバ '
  + PEER_DRIVERS.length + ' 本とアンカーの重なり 0');

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
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(0d)', '(0e)', '(1a)', '(1b)', '(1c)', '(1d)', '(2a)', '(2b)', '(2c)',
  '(3a)', '(3b)', '(3c)', '(4a)', '(4b)', '(5a)', '(5b)', '(5c)', '(6a)', '(7a)', '(7b)', '(7c)', '(7d)',
  '(8a)', '(8b)', '(9a)', '(9b)', '(10a)', '(11a)', '(11b)'];
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
 * ページ内の道具 (読み込み後に 1 回入れる)。⚠ 包むのは window に出ている関数宣言だけ (内部の呼び出しも包んだ側を引く)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const INSTALL = (HAND, EYE) => {
  window.__seq = 0; window.__ev = []; window.__ccHold = false; window.__ccAutoClose = 2000;
  const snapSlots = () => JSON.stringify({ cur: (typeof currentSpellSlots !== 'undefined') ? currentSpellSlots : null, al: allies.map((a) => (a && a.spellSlots) || null) });
  window.__slots = snapSlots;
  const push = (o) => { o.n = ++window.__seq; window.__ev.push(o); return o; };
  const oLog = appendLog;
  appendLog = function (msg) {
    const s = String(msg);
    if (s.indexOf(HAND) === 0 || s.indexOf(EYE) === 0) push({ t: 'log', msg: s, dp: dialogPaused, sk: skillCheckActive, slots: snapSlots() });
    return oLog.apply(this, arguments);
  };
  const oCC = showCharChoice;
  showCharChoice = function (msg, cands, cancel, opts) {
    push({ t: 'cc', msg: String(msg), labels: (cands || []).map((c) => c.label), cancel, opts: opts || null, dp: dialogPaused, slots: snapSlots() });
    const a = Array.prototype.slice.call(arguments);
    if (window.__ccHold && a[3] && a[3].autoSkipMs) a[3] = Object.assign({}, a[3], { autoSkipMs: 0 });
    /* ★[#84] 本番の手のダイアログは押すまで待つ (自動スキップなし)。押さない腕 (素で出ない所に変異で出てしまう腕・(3b) の射程内) が
     *   閉じずに evaluate が返らなくならないよう、**ドライバ側で**手のダイアログ (取り消し =「触らない (Esc)」) にだけ明示の
     *   自動スキップを渡す (= #80 当時の 2 秒と同じ「押さない」)。⛔ 押す腕 (__ccHold) と罠の 2 択には掛けない。 */
    else if (!window.__ccHold && window.__ccAutoClose > 0 && cancel === '触らない (Esc)' && !(a[3] && a[3].autoSkipMs)) a[3] = Object.assign({}, a[3] || {}, { autoSkipMs: window.__ccAutoClose });
    return oCC.apply(this, a);
  };
  const oC = showChoice;
  showChoice = function () { push({ t: 'c', args: Array.prototype.slice.call(arguments), argc: arguments.length }); return oC.apply(this, arguments); };
  const oO = openCage;
  openCage = function (c) { push({ t: 'open', tx: c.tx, ty: c.ty, dp: dialogPaused }); return oO.apply(this, arguments); };
  const oA = awakenMimic;
  awakenMimic = function (c, o) { push({ t: 'awaken', tx: c && c.tx, ty: c && c.ty, opts: o ? JSON.parse(JSON.stringify(o)) : null }); return oA.apply(this, arguments); };
  const oT = triggerTrapOnPlayer;
  triggerTrapOnPlayer = function () { push({ t: 'trapHit' }); return oT.apply(this, arguments); };
  const oB = showBanner;
  showBanner = function (t) {
    const s = String(t);
    if (/^ROUND \d+/.test(s)) {
      const bi = (cages && cages[0]) ? cages[0].beastIdx : -1;
      const b = bi >= 0 ? enemies[bi] : null;
      push({ t: 'R', round: parseInt(s.slice(6), 10), beastIn: bi >= 0 && encounterEnemyIndices.indexOf(bi) >= 0,
        beast: b ? { alive: b.alive, hp: b.hp, inactive: b.inactive, tx: Math.floor((b.x + b.def.displaySize / 2) / TILE_SIZE), ty: Math.floor((b.y + b.def.displaySize / 2) / TILE_SIZE),
          d: Math.round(Math.hypot(playerX + 48 - (b.x + b.def.displaySize / 2), playerY + 58 - (b.y + b.def.displaySize / 2))),
          vis: (typeof isEnemyVisibleToParty === 'function') ? isEnemyVisibleToParty(b) : null } : null,
        hero: [Math.floor((playerX + 48) / TILE_SIZE), Math.floor((playerY + 58) / TILE_SIZE)] });
    }
    return oB.apply(this, arguments);
  };
  const oBT = RunChronicle.beginTurn;
  RunChronicle.beginTurn = function (actor) { push({ t: 'T', kind: actor && actor.kind }); return oBT.apply(this, arguments); };
  window.__rscStub = null;
  const oR = SkillCheck.resolveSkillCheck;
  SkillCheck.resolveSkillCheck = function () { if (window.__rscStub) return Promise.resolve(window.__rscStub()); return oR.apply(this, arguments); };
  window.__putAlly = (a, tx, ty) => { const s = (a.def && a.def.displaySize) || TILE_SIZE; a.x = tx * TILE_SIZE + TILE_SIZE / 2 - s / 2; a.y = ty * TILE_SIZE + TILE_SIZE / 2 - s / 2; };
  /* 生きている魔法使いの仲間 (居なければ先頭の仲間を魔法使いにし、枠を持たせる) */
  window.__mageAlly = () => {
    let a = allies.find((x) => x && x.alive && x.classKey === 'mage');
    if (!a) { a = allies.find((x) => x && x.alive); a.classKey = 'mage'; a.spellSlots = { 'magic-missile': 2, sleep: 1 }; }
    if (!a.spellSlots || !Object.keys(a.spellSlots).length) a.spellSlots = { 'magic-missile': 2, sleep: 1 };
    return a;
  };
  window.__beastTile = () => { const c = cages[0]; if (!c || c.beastIdx < 0) return null; const b = enemies[c.beastIdx]; const d = (b.def && b.def.displaySize) || TILE_SIZE; return [Math.floor((b.x + d / 2) / TILE_SIZE), Math.floor((b.y + d / 2) / TILE_SIZE)]; };
  /* openCage のワープ式を独立に書く (左上座標の距離・alive && !inactive && faction !== "beast"・target.x - ds*0.9 = #80 K9) */
  window.__warpWant = () => {
    const c = cages[0]; const bi = c.beastIdx, beast = enemies[bi];
    let ti = -1, td = Infinity;
    enemies.forEach((o, i) => { if (i === bi || !o || !o.alive || o.inactive || o.def.faction === 'beast') return; const d = Math.hypot(beast.x - o.x, beast.y - o.y); if (d < td) { td = d; ti = i; } });
    const ds = beast.def.displaySize || TILE_SIZE;
    return ti >= 0 ? { x: enemies[ti].x - ds * 0.9, y: enemies[ti].y, type: enemies[ti].type } : null;
  };
  /* (cx,cy) からの距離 [lo, hi] で、視線が通る (los=true) / 通らない (false) / 問わない (null) 床を近い順に */
  window.__tilesAround = (cx, cy, lo, hi, los) => {
    const out = [];
    const W = (typeof MAP_COLS !== 'undefined') ? MAP_COLS : 80, H = (typeof MAP_ROWS !== 'undefined') ? MAP_ROWS : 40;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (isTileWall(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < lo || d > hi) continue;
      if (los !== null && hasLineOfSight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, cx * TILE_SIZE + TILE_SIZE / 2, cy * TILE_SIZE + TILE_SIZE / 2) !== los) continue;
      out.push([x, y, Math.round(d * 100) / 100]);
    }
    out.sort((p, q) => p[2] - q[2] || p[0] - q[0] || p[1] - q[1]);
    return out;
  };
};
/* 2 投目以降を全区間で回す (1 投目は 0.999) — 決定的に「当たり得るか」を数える */
const PICK_COUNT = (id) => {
  const keep = Math.random; let hit = 0;
  try {
    for (let i = 0; i < 2000; i++) { let k = 0; Math.random = () => (k++ === 0 ? 0.999 : (i + 0.5) / 2000); if (pickScrollId({ common: 100, uncommon: 0, rare: 0 }) === id) hit++; }
  } finally { Math.random = keep; }
  return hit;
};

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { port, booted: 0, errs: [], hits: {} };
  const base = 'http://127.0.0.1:' + port + '/';
  const pages = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const closePage = async (p) => { await sleep(150); await p.close().catch(() => {}); };
  /* index.html をシナリオ指定で開く。known = 手の習得を localStorage へ焼く / seed = Math.random を種付き PRNG に差し替え */
  async function openIndex(scen, qs, known, seed) {
    const p = await newPage();
    await p.evaluateOnNewDocument((s, k, sd) => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', s);
        localStorage.clear();
        if (k) localStorage.setItem('dragonfighters.knownSpells', JSON.stringify({ mage: ['mage-hand'] }));
      } catch (e) {}
      if (sd) {
        let st = sd >>> 0;
        Math.random = function () { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      }
    }, scen, !!known, seed || 0);
    await p.goto(base + F_INDEX + '?diag=1' + (qs || ''), { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => { try { return typeof allies !== 'undefined' && allies.length > 0 && typeof RUN !== 'undefined' && !!RUN && !!currentNodeId && !!window.__graphRun; } catch (e) { return false; } }, { timeout: 60000 });
    await p.evaluate(INSTALL, HAND_ICON, EYE_ICON);
    ctx.booted++;
    return p;
  }
  /* #choiceDialog にボタン (sub を含む) が出るのを待って実際にクリックする。出なければ null */
  async function clickChoice(p, sub, timeout) {
    const ok = await p.waitForFunction((s) => {
      const d = document.getElementById('choiceDialog');
      if (!d || !d.classList.contains('show')) return false;
      return Array.from(d.querySelectorAll('button')).some((b) => b.textContent.indexOf(s) >= 0);
    }, { timeout: timeout || 15000, polling: 25 }, sub).then(() => true).catch(() => false);
    if (!ok) return null;
    return p.evaluate((s) => {
      const d = document.getElementById('choiceDialog');
      const btns = Array.from(d.querySelectorAll('button'));
      const b = btns.find((x) => x.textContent.indexOf(s) >= 0);
      const info = { msg: d.querySelector('.choiceMessage').textContent, btns: btns.map((x) => x.textContent), dp: dialogPaused,
        cageFlag: (cages && cages[0]) ? cages[0].dialogActive : null };
      b.click();
      return info;
    }, sub);
  }
  const ccOf = (ev) => (ev || []).filter((e) => e.t === 'cc');
  const handCc = (ev) => ccOf(ev).filter((e) => (e.labels || []).some((l) => l.indexOf(HAND_NAME) >= 0) && e.msg !== TRAP_Q);
  const handLogs = (ev) => (ev || []).filter((e) => e.t === 'log' && e.msg.indexOf(HAND_ICON) === 0);
  const slotPairs = [];   // (6a) [腕, ダイアログ時, 手の後]
  let A = null, S = null;

  try {
    /* ══════════ P1. 森 n7 (覚えていない → 覚える): (0b)(0c)(0e)(1a)(1d)(2b)(2a)(11b 素) ══════════ */
    let p = await openIndex('bandits-forest', '', false);
    A = await p.evaluate(() => {
      const a = __mageAlly();
      const c = cages[0] || null;
      const out = { node: currentNodeId, cagesN: cages.length, linked: cages.filter((x) => x.beastIdx >= 0).length,
        cage: c ? { tx: c.tx, ty: c.ty, nae: c.noAutoEscape, bi: c.beastIdx, op: c.opened } : null, beast: __beastTile(),
        known: isSpellKnown('mage', 'mage-hand'), caster: mageHandCaster(), allyMage: a.classKey,
        win: ['isMageHandOn', 'mageHandCaster', 'flyMageHand', 'offerMageHand', 'tryMageHandCalm', 'tryMageHandInCombat'].map((k) => typeof window[k]),
        scroll: SCROLL_CATALOG['scroll-mage-hand'] || null };
      if (c) {
        out.wall = isTileWall(c.tx, c.ty);
        const path = aStar(12, 15, c.tx, c.ty);
        out.steps = Array.isArray(path) ? path.length : null;
        const vis = __tilesAround(c.tx, c.ty, 0.5, 12, true);
        out.los12 = vis.length; out.losMinX = vis.length ? Math.min.apply(null, vis.map((v) => v[0])) : null;
        out.losOutside = vis.filter((v) => v[0] < 48).length;
      }
      return out;
    });
    R.check('(0e)', '[装置] window に手の関数 6 つ', A.win.every((t) => t === 'function'), A.win);
    R.check('(0b)', '[装置] 森 n7 (実入場): 獣つきの檻がちょうど 1 つ・(55,8)・獣が同じタイル',
      A.node === 'n7' && A.cagesN === 1 && A.linked === 1 && A.cage && A.cage.tx === 55 && A.cage.ty === 8 && A.cage.bi >= 0 && A.beast && A.beast[0] === 55 && A.beast[1] === 8,
      { node: A.node, cagesN: A.cagesN, cage: A.cage, beast: A.beast });
    R.check('(1a)', 'n7 の檻 = (55,8)・本番 isTileWall で床・入場 (12,15) から本番 aStar で到達可能',
      A.cage && A.cage.tx === 55 && A.cage.ty === 8 && A.wall === false && typeof A.steps === 'number' && A.steps > 0, { cage: A.cage, wall: A.wall, steps: A.steps });
    R.check('(1d)', '檻から 12 マス以内で視線の通る床が 1 つ以上・全部 x ≥ 48 (柵の内側からしか見えない)',
      A.cage && A.los12 >= 1 && A.losOutside === 0 && A.losMinX >= 48, { cage: A.cage, los12: A.los12, minX: A.losMinX, outside: A.losOutside });
    const n7cage = A.cage;
    const B0 = await p.evaluate(async () => {
      const a = __mageAlly(); __putAlly(a, 52, 12);
      const r = await offerMageHand('calm', 12);
      return { r, ev: __ev.length, asked: cages[0] ? (cages[0]._handAsked === undefined) : null };
    });
    const A3 = await p.evaluate(() => { knownSpells.mage.push('mage-hand'); const c = mageHandCaster(); return c ? { name: c.name, isAlly: !!(c.actor && c.actor.classKey === 'mage' && allies.indexOf(c.actor) >= 0) } : null; });
    R.check('(0c)', '覚えていない ⇒ mageHandCaster() null・offerMageHand でダイアログ 0・_handAsked が生えない / 覚える ⇒ 仲間の魔法使い',
      A.known === false && A.caster === null && B0.r === false && B0.ev === 0 && B0.asked === true && !!A3 && A3.isAlly, { before: { known: A.known, caster: A.caster, offer: B0 }, after: A3 });
    /* (2b) 視線なし (47,15)(38,15) と 12 マス超で視線あり の床 (直に offerMageHand。押さない腕 = ドライバの自動スキップ __ccAutoClose) */
    const B = await p.evaluate(async () => {
      const a = __mageAlly(); const c = cages[0]; const out = { tiles: [] };
      delete c._handAsked;   // (0c) の仕込みの名残を (2b) へ持ち込まない (変異 nogate で (0c) の鍵が立つ)
      const far = __tilesAround(c.tx, c.ty, 12.01, 20, true);
      const list = [[47, 15], [38, 15]].concat(far.length ? [[far[0][0], far[0][1]]] : []);
      out.farTile = far[0] || null;
      for (const t of list) {
        __putAlly(a, t[0], t[1]); const n0 = __ev.length;
        const r = await offerMageHand('calm', MAGE_HAND.calmRangeTiles);
        out.tiles.push({ t, r, cc: __ev.slice(n0).filter((e) => e.t === 'cc').length, d: Math.round(Math.hypot(t[0] - c.tx, t[1] - c.ty) * 100) / 100,
          los: hasLineOfSight(t[0] * 96 + 48, t[1] * 96 + 48, c.tx * 96 + 48, c.ty * 96 + 48), opened: c.opened });
      }
      out.askedKeys = Object.keys(c._handAsked || {});
      delete c._handAsked;   // (2a) の前の後始末 (変異で鍵が立っても (2a) へ漏らさない)
      return out;
    });
    R.check('(2b)', '戦闘前の口: 視線なし (47,15)(38,15) と 12 マス超 (視線あり) では出ない',
      B.tiles.length >= 2 && B.tiles.every((x) => x.r === false && x.cc === 0 && !x.opened) && B.askedKeys.length === 0, B);
    /* (11b) 素の腕 */
    const pick1 = await p.evaluate(PICK_COUNT, HAND_SCROLL_ID);
    /* (2a) 実の setInterval(tryMageHandCalm) */
    const C = await p.evaluate(() => {
      const a = __mageAlly(); __putAlly(a, 51, 12);
      window.__ccHold = true; __ev.length = 0;
      const want = __warpWant();
      gameStarted = true;
      return { want, enc: encounterActive };
    });
    const dlgC = await clickChoice(p, HAND_NAME, 15000);
    await p.waitForFunction(() => cages[0].opened && __ev.some((e) => e.t === 'log' && e.msg.indexOf('\u270B') === 0), { timeout: 15000, polling: 50 }).catch(() => {});
    await sleep(1800);
    const C2 = await p.evaluate(() => {
      gameStarted = false; window.__ccHold = false;
      const b = enemies[cages[0].beastIdx];
      return { opened: cages[0].opened, inactive: b.inactive, bx: b.x, by: b.y, ev: __ev, handEl: document.querySelectorAll('.dfMageHand').length,
        dlgFlag: cages[0].dialogActive, asked: Object.keys(cages[0]._handAsked || {}), enc: encounterActive };
    });
    {
      const cc = handCc(C2.ev), hl = handLogs(C2.ev), op = C2.ev.filter((e) => e.t === 'open');
      R.check('(2a)', '戦闘前の口 (実 interval・(51,12)): ダイアログ 1 回・本文に「レバー」・押すと opened・獣が起きる・最寄りの盗賊の左隣・✋ 1 行・DOM が残らない',
        !!dlgC && /レバー/.test(dlgC.msg) && dlgC.cageFlag === true && cc.length === 1 && C2.opened === true && C2.inactive === false && !!C.want
        && Math.abs(C2.bx - C.want.x) < 0.01 && Math.abs(C2.by - C.want.y) < 0.01 && hl.length === 1 && op.length === 1 && C2.handEl === 0 && C2.dlgFlag === false
        && C2.asked.join() === 'calm',
        { dlg: dlgC, want: C.want, got: [C2.bx, C2.by], cc: cc.length, hl: hl.map((e) => e.msg), open: op.length, asked: C2.asked, enc: C2.enc });
      if (cc.length && hl.length) slotPairs.push(['2a', cc[0].slots, hl[0].slots]);
      else slotPairs.push(['2a', null, null]);
    }
    await closePage(p);

    /* ══════════ P2. 森 n7 (覚えている): (2c) → (3b) → (3a)(3c) ══════════ */
    p = await openIndex('bandits-forest', '', true);
    await p.evaluate(() => { const a = __mageAlly(); __putAlly(a, 52, 12); window.__ccHold = true; __ev.length = 0; gameStarted = true; });
    const dlg2c = await clickChoice(p, '触らない', 15000);
    await sleep(600);
    const D1 = await p.evaluate(() => ({ n: __ev.filter((e) => e.t === 'cc').length, opened: cages[0].opened, asked: Object.keys(cages[0]._handAsked || {}) }));
    await sleep(2600);   // 実の interval が 400ms ごとに 6 回以上回る
    const D2 = await p.evaluate(() => { gameStarted = false; window.__ccHold = false; return { n: __ev.filter((e) => e.t === 'cc').length, opened: cages[0].opened, enc: encounterActive }; });
    R.check('(2c)', '断った (「触らない」を押した) 後、同じ口 (実の interval) からは二度と出ない',
      !!dlg2c && D1.n === 1 && D1.opened === false && D1.asked.join() === 'calm' && D2.n === 1 && D2.opened === false, { dlg: dlg2c, D1, D2 });
    /* (3b) ★[#84] 戦闘中の口の 12 マス境界 (視線あり): 12 マス超で最も近い床では出ない → 12 マス以内で最も遠い床 (≥10.5) では出る。
     *   ⚠ 出ない側を先に測る (出た側で _handAsked.combat が立つと、後の呼び出しは射程と無関係に素通りする = 永久緑)。
     *   出る側は押さない腕 = ドライバの自動スキップ (__ccAutoClose) で閉じ、offerMageHand は false を返す */
    const E3b = await p.evaluate(async () => {
      const a = __mageAlly(); const c = cages[0];
      const outT = __tilesAround(c.tx, c.ty, 12.01, 20, true)[0] || null;
      const inL = __tilesAround(c.tx, c.ty, 10.5, 12, true);
      const inT = inL.length ? inL[inL.length - 1] : null;
      const out = { outTile: outT, inTile: inT };
      if (outT) { __putAlly(a, outT[0], outT[1]); const n0 = __ev.length; out.outR = await tryMageHandInCombat(); out.outCc = __ev.slice(n0).filter((e) => e.t === 'cc').length;
        out.outKey = !!(c._handAsked && c._handAsked.combat); }
      if (c._handAsked) delete c._handAsked.combat;
      if (inT) { __putAlly(a, inT[0], inT[1]); const n0 = __ev.length; out.inR = await tryMageHandInCombat(); out.inCc = __ev.slice(n0).filter((e) => e.t === 'cc').length;
        out.inKey = !!(c._handAsked && c._handAsked.combat); }
      out.opened = c.opened;
      if (c._handAsked) delete c._handAsked.combat;   // (3a) の前の後始末
      return out;
    });
    R.check('(3b)', '戦闘中の口は 12 マス境界: 12 マス超 (視線あり・最寄り) では出ない / 12 マス以内で最も遠い床 (≥10.5・視線あり) では出る (tryMageHandInCombat)',
      !!E3b.outTile && E3b.outTile[2] > 12 && E3b.outR === false && E3b.outCc === 0 && E3b.outKey === false
      && !!E3b.inTile && E3b.inTile[2] >= 10.5 && E3b.inTile[2] <= 12 && E3b.inCc === 1 && E3b.inKey === true && E3b.opened === false, E3b);
    /* (3a) 実の戦闘 */
    const E0 = await p.evaluate(() => {
      const a = __mageAlly(); __putAlly(a, 52, 12);
      const c = cages[0];
      /* ⚠ 主人公は野営地の脇 (53,12) 付近 = 獣のワープ先 (最寄りの盗賊の左隣) から増援の届く距離 (melee 400 + 160px) の内側。
       *   (51,13) だと 1 ラウンド目に主人公が 2 マス動いた回だけ 578px で届かず (3c) が揺れた (#80 §12-2) */
      const near = __tilesAround(c.tx, c.ty, 3, 5, null).filter((t) => t[1] >= 11);
      near.sort((p, q) => Math.hypot(p[0] - 53, p[1] - 12) - Math.hypot(q[0] - 53, q[1] - 12));
      const h = near[0];
      playerX = h[0] * TILE_SIZE; playerY = h[1] * TILE_SIZE - 10;
      window.__ccHold = true; __ev.length = 0;
      gameStarted = true;
      tryStartEncounter();
      return { hero: h, enc: encounterActive || encounterRunning };
    });
    const dlg3 = await clickChoice(p, HAND_NAME, 45000);
    await p.waitForFunction(() => __ev.some((e) => e.t === 'R' && e.round >= 2) || gameOver, { timeout: 90000, polling: 200 }).catch(() => {});
    const E3 = await p.evaluate(() => { const ev = __ev.slice(); gameStarted = false; window.__ccHold = false; return { ev, opened: cages[0].opened, asked: Object.keys(cages[0]._handAsked || {}), over: gameOver }; });
    {
      const ev = E3.ev, cc = handCc(ev), hl = handLogs(ev);
      let order = null, roundOk = false, nextBeast = null;
      if (cc.length === 1) {
        const n = cc[0].n;
        const rs = ev.filter((e) => e.t === 'R' && e.n < n);
        const lastR = rs[rs.length - 1] || null;
        const tBetween = lastR ? ev.filter((e) => e.t === 'T' && e.n > lastR.n && e.n < n).length : -1;
        const nextR = ev.find((e) => e.t === 'R' && e.n > n) || null;
        const tAfter = ev.filter((e) => e.t === 'T' && e.n > n && (!nextR || e.n < nextR.n)).length;
        order = { round: lastR && lastR.round, tBetween, tAfter, nextRound: nextR && nextR.round };
        roundOk = !!lastR && tBetween === 0 && tAfter >= 1;
        nextBeast = nextR ? nextR.beastIn : null;
      }
      R.check('(3a)', '実の戦闘・3〜5 マス + 視線: ダイアログが ROUND N のバナーの後・そのラウンド最初の手番より前・押すと開く',
        E0.enc && !!dlg3 && cc.length === 1 && roundOk && E3.opened === true && hl.length === 1 && E3.asked.indexOf('combat') >= 0,
        { hero: E0.hero, dlg: dlg3 && dlg3.msg.slice(0, 20), cc: cc.length, order, opened: E3.opened, hl: hl.length, asked: E3.asked });
      R.check('(3c)', '開けた次のラウンドのバナーの時点で獣が encounterEnemyIndices に入っている',
        cc.length === 1 && nextBeast === true, { order, nextBeast, over: E3.over, R: ev.filter((e) => e.t === 'R').map((e) => [e.round, e.beastIn, e.beast, e.hero]) });
      if (cc.length && hl.length) slotPairs.push(['3a', cc[0].slots, hl[0].slots]); else slotPairs.push(['3a', null, null]);
    }
    await closePage(p);

    /* ══════════ P3. 森 n7 (覚えていない): (4a) 自然脱走の停止 ══════════ */
    const escapeArm = async (pg) => pg.evaluate(async () => {
      const keep = Math.random; const c = cages[0];
      const pCX = playerX + 48, pCY = playerY + 58;
      const dist0 = Math.hypot(pCX - (c.tx * 96 + 48), pCY - (c.ty * 96 + 48));
      gameStarted = true; encounterActive = true; encounterStartedAt = performance.now() - 60000;
      const checks = new Set();
      Math.random = () => 0;
      try {
        for (let i = 0; i < 46; i++) { await new Promise((r) => setTimeout(r, 250)); if (_lastCageEscapeCheck > 0) checks.add(_lastCageEscapeCheck); if (c.opened) break; }
      } finally { Math.random = keep; gameStarted = false; encounterActive = false; }
      return { checks: checks.size, opened: c.opened, open: __ev.filter((e) => e.t === 'open').length, dist: Math.round(dist0), nae: c.noAutoEscape, tile: [c.tx, c.ty] };
    });
    p = await openIndex('bandits-forest', '', false);
    const F4a = await p.evaluate(() => {
      const c = cages[0];
      const t = __tilesAround(c.tx, c.ty, 3, 6, null).find((x) => x[1] >= 9) || __tilesAround(c.tx, c.ty, 3, 6, null)[0];
      playerX = t[0] * TILE_SIZE; playerY = t[1] * TILE_SIZE - 10;
      return t;
    });
    const E4a = await escapeArm(p);
    R.check('(4a)', 'n7 の檻: 800px 以内・戦闘中・Math.random = 0 で自然脱走②の判定が 2 回以上走っても開かない',
      E4a.checks >= 2 && E4a.opened === false && E4a.open === 0 && E4a.dist <= 800, Object.assign({ hero: F4a }, E4a));
    await closePage(p);

    /* ══════════ P4. ?s2fold=0: n0 で (5b) → n6 へ入って (1b)(1c) → (4b) ══════════ */
    p = await openIndex('bandits-forest', '&s2fold=0', true);
    /* (5b) 出口の前の眼 (reveal ⇒ revealExitHints ⇒ tryArcaneEyeAtExits)。⚠ 檻のある n6 は行き止まり (node.exits が空 =
     *   出口の眼が唱えられない) ⇒ 出口のある n0 で唱え、offerMageHand の呼び出しそのものを数える (#80 §12-2) */
    const H5b = await p.evaluate(async () => {
      const a = __mageAlly(); a.spellSlots = Object.assign({}, a.spellSlots, { 'arcane-eye': 1 });
      const calls = [];
      const oOff = offerMageHand;
      offerMageHand = function (gate, rng) { calls.push(gate); return oOff.apply(this, arguments); };
      __ev.length = 0;
      const known = isSpellKnown('mage', 'mage-hand');
      try { await __graphRun.reveal(); } finally { offerMageHand = oOff; }
      return { node: currentNodeId, exits: (RUN.byId[currentNodeId].exits || []).map((e) => e.to), known, slot: a.spellSlots['arcane-eye'],
        eyeLogs: __ev.filter((e) => e.t === 'log' && e.msg.indexOf('\u{1F441}') === 0).length, offer: calls, cc: __ev.filter((e) => e.t === 'cc').length };
    });
    R.check('(5b)', '出口の前の眼 (?s2fold=0 の n0・reveal) は唱えるが、手の口 (offerMageHand) を 1 回も呼ばない・ダイアログ 0 (手は覚えている)',
      H5b.known === true && H5b.exits.length >= 1 && H5b.slot === 0 && H5b.eyeLogs >= 1 && H5b.offer.length === 0 && H5b.cc === 0, H5b);
    await p.evaluate(async () => { await __graphRun.enter('n6', 'right'); });
    await sleep(1200);
    const G = await p.evaluate(() => ({ node: currentNodeId, cages: cages.map((c) => ({ tx: c.tx, ty: c.ty, nae: c.noAutoEscape, bi: c.beastIdx })) }));
    R.check('(1b)', '撤退腕 ?s2fold=0 の n6 (実入場) の檻は (36,13)',
      G.node === 'n6' && G.cages.length === 1 && G.cages[0].tx === 36 && G.cages[0].ty === 13 && G.cages[0].bi >= 0, G);
    R.check('(1c)', 'n7 の檻は noAutoEscape === true / ?s2fold=0 の n6 の檻は false',
      !!n7cage && n7cage.nae === true && G.cages.length === 1 && G.cages[0].nae === false, { n7: n7cage, n6: G.cages });
    const E4b = await escapeArm(p);
    R.check('(4b)', '同じ仕込みを ?s2fold=0 の n6 へ ⇒ 開く (停止はアジトの檻だけ)',
      E4b.opened === true && E4b.open >= 1 && E4b.dist <= 800, E4b);
    await closePage(p);

    /* ══════════ P5. 森 n7 (覚えている): (5a) 入場の眼 → 手 (押す) ══════════ */
    p = await openIndex('bandits-forest', '', true);
    const H0 = await p.evaluate(() => {
      const a = __mageAlly(); a.spellSlots = Object.assign({}, a.spellSlots, { 'arcane-eye': 1 });
      const c = cages[0];
      const cx = a.x + ((a.def && a.def.displaySize) || 96) / 2, cy = a.y + ((a.def && a.def.displaySize) || 96) / 2;
      const d = Math.hypot(cx - (c.tx * 96 + 48), cy - (c.ty * 96 + 48)) / 96;
      const los = hasLineOfSight(cx, cy, c.tx * 96 + 48, c.ty * 96 + 48);
      window.__ccHold = true; __ev.length = 0;
      window.__eyeRet = undefined;
      tryArcaneEyeOnEntry().then((r) => { window.__eyeRet = r; });
      return { d: Math.round(d * 100) / 100, los };
    });
    const dlg5 = await clickChoice(p, HAND_NAME, 30000);
    await p.waitForFunction(() => window.__eyeRet !== undefined, { timeout: 30000, polling: 100 }).catch(() => {});
    const H5 = await p.evaluate(() => { window.__ccHold = false; return { ret: window.__eyeRet, ev: __ev.slice(), opened: cages[0].opened, dp: dialogPaused, sk: skillCheckActive, scouted: Array.from(eyeScoutedNodes) }; });
    {
      const ev = H5.ev, eyeL = ev.filter((e) => e.t === 'log' && e.msg.indexOf(EYE_ICON) === 0), cc = handCc(ev), hl = handLogs(ev), op = ev.filter((e) => e.t === 'open');
      R.check('(5a)', '入場の眼: 眼のログ → 手のダイアログ (射程外・視線なしでも) → 押すと開く・手の間も dialogPaused・眼の戻り値 true・眼のログ 1 行・後で dp/sk が元へ',
        (H0.d > 12 || H0.los === false) && !!dlg5 && H5.ret === true && eyeL.length === 1 && cc.length === 1 && eyeL[0].n < cc[0].n && hl.length === 1 && hl[0].dp === true
        && H5.opened === true && op.length === 1 && op[0].dp === true && H5.dp === false && H5.sk === false && H5.scouted.indexOf('n7') >= 0,
        { mage: H0, dlg: dlg5 && dlg5.msg.slice(0, 20), ret: H5.ret, eye: eyeL.length, cc: cc.length, order: [eyeL[0] && eyeL[0].n, cc[0] && cc[0].n], hl: hl.map((e) => e.dp), open: op.map((e) => e.dp), dp: H5.dp, sk: H5.sk });
      if (cc.length && hl.length) slotPairs.push(['5a', cc[0].slots, hl[0].slots]); else slotPairs.push(['5a', null, null]);
    }
    await closePage(p);

    /* ══════════ P6/P7. (5c) 覚えていない (素) vs ?magehand=0 (覚えている) ⇒ 入場の眼が完全一致 / P7 で (11a)(11b) ══════════ */
    const eyeArm = async (pg) => {
      await pg.evaluate(() => {
        const a = __mageAlly(); a.spellSlots = Object.assign({}, a.spellSlots, { 'arcane-eye': 1 });
        __ev.length = 0; window.__eyeRet = undefined;
        tryArcaneEyeOnEntry().then((r) => { window.__eyeRet = r; });
      });
      await pg.waitForFunction(() => window.__eyeRet !== undefined, { timeout: 30000, polling: 100 }).catch(() => {});
      return pg.evaluate(() => ({ ret: window.__eyeRet, logs: __ev.filter((e) => e.t === 'log').map((e) => ({ msg: e.msg, dp: e.dp, sk: e.sk })),
        cc: __ev.filter((e) => e.t === 'cc').length, opened: cages[0].opened, scouted: Array.from(eyeScoutedNodes), dp: dialogPaused, sk: skillCheckActive,
        slots: __slots(), asked: Object.keys(cages[0]._handAsked || {}) }));
    };
    /* ⚠ 編成 (仲間の顔ぶれ・並び) は起動時の乱数で決まる ⇒ 2 腕とも同じ乱数種で開く (でないと術者の名前と枠の並びが違う) */
    p = await openIndex('bandits-forest', '', false, SEED);
    const K0 = await eyeArm(p);
    await closePage(p);
    p = await openIndex('bandits-forest', '&magehand=0', true, SEED);
    const K1 = await eyeArm(p);
    R.check('(5c)', '手を覚えていない入場の眼 (戻り値・ログ・eyeScoutedNodes・dp/sk・枠・檻) が ?magehand=0 の腕と完全一致',
      K0.ret === true && K0.logs.length === 1 && J(K0) === J(K1), { now: K0, off: K1 });
    /* (11a) ?magehand=0 + 覚えている: 戦闘前 (実 interval)・戦闘中・(眼 = 上の K1)・罠 */
    const L = await p.evaluate(async () => {
      const a = __mageAlly(); __putAlly(a, 52, 12);
      const n0 = __ev.length;
      const out = { known: isSpellKnown('mage', 'mage-hand'), caster: mageHandCaster() };
      gameStarted = true;
      await new Promise((r) => setTimeout(r, 2600));
      gameStarted = false;
      out.combat = await tryMageHandInCombat();
      out.direct = await offerMageHand('calm', 12);
      out.cc = __ev.slice(n0).filter((e) => e.t === 'cc').length;
      out.opened = cages[0].opened;
      out.enc = encounterActive;
      return out;
    });
    await p.evaluate(() => {
      const t = traps.find((x) => !x.triggered && !x.disarmed && x.tx < 40) || traps.find((x) => !x.triggered && !x.disarmed);
      t.found = true; playerX = t.tx * 96; playerY = t.ty * 96 - 10;
      window.__rscStub = () => ({ success: true, fumble: false, crit: false, roll: 15, total: 20, dc: 15, bonus: 0, rep: null, helper: null });
      __ev.length = 0; gameStarted = true; window.__trapP = runTrapDisarmCheck();
    });
    const dlgL2 = await clickChoice(p, '迂回する', 15000);
    const L2 = await p.evaluate(async () => { await window.__trapP; gameStarted = false; window.__rscStub = null; return { c: __ev.filter((e) => e.t === 'c').map((e) => e.args), cc: __ev.filter((e) => e.t === 'cc').length }; });
    const pick0 = await p.evaluate(PICK_COUNT, HAND_SCROLL_ID);
    R.check('(11a)', '?magehand=0 + 覚えている ⇒ 眼・戦闘前 (実 interval 2.6 秒)・戦闘中・直呼びの口で手のダイアログ 0 回・罠は showChoice',
      L.known === true && L.caster === null && K1.cc === 0 && L.combat === false && L.direct === false && L.cc === 0 && L.opened === false
      && !!dlgL2 && L2.c.length === 1 && L2.c[0][0] === TRAP_Q && L2.cc === 0, { L, trap: L2, eyeCc: K1.cc });
    R.check('(11b)', 'pickScrollId (common・2 投目の全区間 2000 点) ⇒ ?magehand=0 で scroll-mage-hand 0 回 / 素で 1 回以上',
      pick0 === 0 && pick1 >= 1, { off: pick0, now: pick1 });
    await closePage(p);

    /* ══════════ P8. 罠 (手なし → 手あり・同じページの別の罠): (7c)(7d) → (7a)(7b) ══════════ */
    p = await openIndex('bandits-forest', '', false);
    const trapSetup = (pg) => pg.evaluate(() => {
      __mageAlly();
      const t = traps.find((x) => !x.triggered && !x.disarmed && !x._disarmRolled && x.tx < 40) || traps.find((x) => !x.triggered && !x.disarmed && !x._disarmRolled);
      if (!t) return null;
      t.found = true; playerX = t.tx * 96; playerY = t.ty * 96 - 10;
      window.__rscStub = () => ({ success: false, fumble: true, crit: false, roll: 1, total: 1, dc: 15, bonus: 0, rep: null, helper: null });
      window.__ccHold = true; __ev.length = 0;
      window.__trapT = t;
      window.__hp0 = { hp, al: allies.map((a) => a.hp), slots: __slots() };
      gameStarted = true;
      window.__trapP = runTrapDisarmCheck();
      return [t.tx, t.ty];
    });
    const trapFinish = (pg) => pg.evaluate(async () => {
      await window.__trapP; gameStarted = false; window.__ccHold = false; window.__rscStub = null;
      return { hp0: window.__hp0, hp1: { hp, al: allies.map((a) => a.hp), slots: __slots() }, trig: window.__trapT.triggered, ev: __ev.slice(), handEl: document.querySelectorAll('.dfMageHand').length };
    });
    const T0 = await trapSetup(p);
    const dlg7c = await clickChoice(p, '解除する', 15000);
    const M0 = await trapFinish(p);
    {
      const c = M0.ev.filter((e) => e.t === 'c'), cc = ccOf(M0.ev), hit = M0.ev.filter((e) => e.t === 'trapHit');
      R.check('(7d)', '手なし ⇒ showChoice が今の 3 引数で 1 回・showCharChoice 0 回',
        !!T0 && c.length === 1 && J(c[0].args) === J([TRAP_Q, '解除する', '迂回する']) && c[0].argc === 3 && cc.length === 0, { trap: T0, dlg: dlg7c, c: c.map((e) => [e.args, e.argc]), cc: cc.length });
      R.check('(7c)', '手なしで同じファンブル ⇒ 今どおり主人公が被弾 (triggerTrapOnPlayer 1 回)',
        !!T0 && !!dlg7c && M0.hp1.hp < M0.hp0.hp && M0.trig === true && hit.length === 1, { hp: [M0.hp0.hp, M0.hp1.hp], trig: M0.trig, hit: hit.length });
    }
    await p.evaluate(() => { knownSpells.mage.push('mage-hand'); });
    const T1 = await trapSetup(p);
    const dlg7a = await clickChoice(p, HAND_NAME + 'で解除する', 15000);
    const M1 = await trapFinish(p);
    {
      const c = M1.ev.filter((e) => e.t === 'c'), cc = ccOf(M1.ev), hit = M1.ev.filter((e) => e.t === 'trapHit'), hl = handLogs(M1.ev);
      R.check('(7a)', '手あり ⇒ showCharChoice に 2 択 (「解除する」「メイジハンドで解除する…」)・showChoice は呼ばない',
        !!T1 && cc.length === 1 && cc[0].msg === TRAP_Q && J(cc[0].labels) === J(['解除する', 'メイジハンドで解除する — 失敗しても傷を負わない']) && c.length === 0,
        { trap: T1, cc: cc.map((e) => [e.msg, e.labels]), c: c.length });
      R.check('(7b)', '手のボタンを押しファンブル ⇒ 主人公と全員の HP 不変・trap.triggered・「幽霊の手」・✋・triggerTrapOnPlayer 0 回・DOM が残らない',
        !!T1 && !!dlg7a && M1.hp0.hp === M1.hp1.hp && J(M1.hp0.al) === J(M1.hp1.al) && M1.trig === true && hit.length === 0
        && hl.some((e) => /幽霊の手/.test(e.msg)) && hl.length >= 2 && M1.handEl === 0,
        { hp: [M1.hp0.hp, M1.hp1.hp], al: [M1.hp0.al, M1.hp1.al], trig: M1.trig, hit: hit.length, hl: hl.map((e) => e.msg.slice(0, 30)) });
      slotPairs.push(['7b', M1.hp0.slots, M1.hp1.slots]);
    }
    await closePage(p);

    /* ══════════ P9/P10. 竜の巣 n7 の本物の宝の山: (8a) 手で叩く / (8b) 手なしで近づく ══════════ */
    p = await openIndex('dragon-lair', '', true);
    await p.evaluate(async () => { await __graphRun.enter('n7', 'right'); });
    await sleep(1200);
    const N0 = await p.evaluate(() => {
      const m = mimicChest; if (!m) return { node: currentNodeId, mimic: null };
      const hoard = (RUN.byId.n7.mapDef.hoard || []).map((t) => t[0] + ',' + t[1]);
      const decoys = roomChests.filter((c) => !c.isMimic && hoard.indexOf(c.tx + ',' + c.ty) >= 0);
      const a = __mageAlly();
      const spots = __tilesAround(m.tx, m.ty, 5, 10, true);
      const t = spots[0] || null;
      if (t) __putAlly(a, t[0], t[1]);
      window.__ccHold = true; __ev.length = 0;
      window.__offerRet = undefined;
      offerMageHand('calm', MAGE_HAND.calmRangeTiles).then((r) => { window.__offerRet = r; });
      return { node: currentNodeId, mimic: [m.tx, m.ty], hoard, decoys: decoys.length, mage: t, stuck0: !!playerBuffs.stuck };
    });
    const dlg8 = await clickChoice(p, HAND_NAME, 15000);
    await p.waitForFunction(() => window.__offerRet !== undefined, { timeout: 15000, polling: 100 }).catch(() => {});
    const N1 = await p.evaluate(() => {
      window.__ccHold = false;
      const hoard = (RUN.byId.n7.mapDef.hoard || []).map((t) => t[0] + ',' + t[1]);
      const decoys = roomChests.filter((c) => !c.isMimic && hoard.indexOf(c.tx + ',' + c.ty) >= 0);
      return { ret: window.__offerRet, ev: __ev.slice(), awakened: !!(mimicChest && mimicChest.awakened), stuck: !!playerBuffs.stuck,
        decoys: decoys.map((c) => c.opened), mimics: enemies.filter((e) => e.type === 'mimic').length };
    });
    {
      const aw = N1.ev.filter((e) => e.t === 'awaken'), cc = handCc(N1.ev), hl = handLogs(N1.ev);
      R.check('(8a)', '竜の巣 n7 の宝の山: 手で叩く ⇒ awakenMimic が forewarned:true で 1 回・粘着なし・囮 3 箱は opened === false・✋',
        N0.node === 'n7' && !!N0.mimic && N0.decoys === 3 && !!dlg8 && N1.ret === true && cc.length === 1 && aw.length === 1 && aw[0].opts && aw[0].opts.forewarned === true
        && N1.awakened === true && N1.stuck === false && N1.decoys.length === 3 && N1.decoys.every((o) => o === false) && hl.length === 1 && N1.mimics === 1,
        { N0, dlg: dlg8 && dlg8.msg.slice(0, 20), ret: N1.ret, aw: aw.map((e) => e.opts), stuck: N1.stuck, decoys: N1.decoys, hl: hl.length });
      if (cc.length && hl.length) slotPairs.push(['8a', cc[0].slots, hl[0].slots]); else slotPairs.push(['8a', null, null]);
    }
    await closePage(p);
    p = await openIndex('dragon-lair', '', false);
    await p.evaluate(async () => { await __graphRun.enter('n7', 'right'); });
    await sleep(1200);
    const O0 = await p.evaluate(() => {
      const m = mimicChest; if (!m) return { mimic: null };
      __mageAlly();
      playerX = (m.tx - 2) * 96; playerY = m.ty * 96 - 10;
      __ev.length = 0;
      gameStarted = true;
      return { mimic: [m.tx, m.ty], hero: [m.tx - 2, m.ty], los: hasLineOfSight(playerX + 48, playerY + 58, m.tx * 96 + 48, m.ty * 96 + 48), free: hasFreeAction('player') };
    });
    await p.waitForFunction(() => __ev.some((e) => e.t === 'awaken'), { timeout: 10000, polling: 50 }).catch(() => {});
    const O1 = await p.evaluate(() => { gameStarted = false; return { ev: __ev.slice(), stuck: !!playerBuffs.stuck }; });
    {
      const aw = O1.ev.filter((e) => e.t === 'awaken');
      R.check('(8b)', '手なしで主人公が近づく (実の tryApproachMimic) ⇒ awakenMimic が forewarned:false で 1 回・手のダイアログ 0',
        !!O0.mimic && aw.length === 1 && aw[0].opts && aw[0].opts.forewarned === false && ccOf(O1.ev).length === 0 && (O0.free || O1.stuck === true),
        { O0, aw: aw.map((e) => e.opts), stuck: O1.stuck });
    }
    await closePage(p);

    /* ══════════ P11. 酒場: (9a)(9b) + (0a) のページ側 ══════════ */
    {
      const tv = await newPage();
      await tv.goto(base + F_TAVERN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await tv.evaluate(() => { localStorage.clear(); });
      await tv.goto(base + F_TAVERN, { waitUntil: 'load', timeout: 60000 });
      await tv.waitForFunction(() => !!window.__equipTV, { timeout: 30000 });
      ctx.booted++;
      S = await tv.evaluate((name) => {
        __equipTV.setGold(200);
        __equipTV.setShopTab('buy'); __equipTV.openShop();
        const Ls = document.getElementById('shopList'); let cur = null; let row = null;
        for (const el of (Ls ? Ls.children : [])) {
          if (el.classList.contains('shopGroupHead')) { cur = el.textContent; continue; }
          if (cur === '巻物' && el.classList.contains('shopItem')) { const nm = el.querySelector('.shopName'); if (nm && nm.textContent === name) row = el; }
        }
        const btn = row ? row.querySelector('button.shopBtn') : null;
        const out = { row: !!row, btn: btn ? btn.textContent : null, disabled: btn ? btn.disabled : null, gold0: __equipTV.gold(),
          page: SCROLL_CATALOG_TV['scroll-mage-hand'] || null };
        if (btn && !btn.disabled) btn.click();
        out.gold1 = __equipTV.gold(); out.stock = __equipTV.scrollStock()['scroll-mage-hand'] || 0;
        const l = __equipTV.learnScroll('scroll-mage-hand');
        out.learned = !!(l && l.learned);
        out.knownTV = (knownSpellsTV.mage || []).indexOf('mage-hand') >= 0;
        try { out.ls = (JSON.parse(localStorage.getItem('dragonfighters.knownSpells') || '{}').mage || []).indexOf('mage-hand') >= 0; } catch (e) { out.ls = false; }
        return out;
      }, HAND_SCROLL.name);
      R.check('(9a)', '酒場の棚に「' + HAND_SCROLL.name + '」=「購入 ' + PRICE + 'G」・押すと買える → learnScroll ⇒ knownSpellsTV.mage と localStorage に mage-hand',
        S.row && S.btn === '購入 ' + PRICE + 'G' && S.disabled === false && S.gold0 - S.gold1 === PRICE && S.learned && S.knownTV && S.ls, S);
      const U = await tv.evaluate(() => {
        pmOrdered = [{ classKey: 'mage', isHero: true, name: '', zone: 'rear', variant: 0 }];
        pmRenderDrawer(0);
        const dr = document.getElementById('pmDrawer');
        if (!dr) return { dr: false };
        const has = (el) => el.textContent.indexOf('メイジハンド') >= 0;
        const rows = Array.from(dr.querySelectorAll('#pmDrawerSkillList .pmDrawerInnateRow')).filter(has);
        const sel0 = JSON.stringify(selection.partySkills || null), html0 = dr.innerHTML.length;
        if (rows[0]) rows[0].click();
        return { inUI: MAGE_SKILLS_UI.some((s) => s.id === 'mage-hand'), items: dr.querySelectorAll('.spellCountItem').length,
          handInPool: Array.from(dr.querySelectorAll('.skillItem, .spellCountItem')).filter(has).length,
          rows: rows.length, rowSkillCls: rows.filter((e) => e.classList.contains('skillItem') || e.classList.contains('spellCountItem')).length,
          handN: dr.textContent.split('メイジハンド').length - 1, sleep: dr.textContent.indexOf('スリープ'),
          clickSame: JSON.stringify(selection.partySkills || null) === sel0 && document.getElementById('pmDrawer').innerHTML.length === html0 };
      });
      /* ★[#84] 言い直し: #80 は「引き出しに『メイジハンド』が出ない」を測っていた = #84 (c) の表示 1 行と正面から逆 (依頼書 §10-0 K3)。
       *   守りたいのは #80 罠A (技 / 呪文枠への漏れ) ⇒ 「表 MAGE_SKILLS_UI に無い・技 / 呪文の行 (.skillItem / .spellCountItem) に無い・
       *   表示の 1 行 (.pmDrawerInnateRow) がちょうど 1 つ・押しても設定が変わらない・引き出しの『メイジハンド』はその 1 回だけ」へ */
      R.check('(9b)', 'MAGE_SKILLS_UI に mage-hand が無い・読んだ後の引き出しの技 / 呪文の行に「メイジハンド」が無く、押せない表示の 1 行だけがある (対照: 呪文の行「スリープ」は出る)',
        U.inUI === false && U.items >= 1 && U.handInPool === 0 && U.rows === 1 && U.rowSkillCls === 0 && U.handN === 1 && U.clickSame === true && U.sleep >= 0, U);
    }
    {
      const same = (a, b) => !!a && !!b && a.name === b.name && a.spellId === b.spellId && a.classKey === b.classKey && a.rarity === b.rarity;
      R.check('(0a)', '[装置] ソース 2 ファイルの巻物の表に scroll-mage-hand がちょうど 1 行ずつ・common・mage・mage-hand・両表で同じ・ページの答えも同じ',
        HAND_ROWS_IDX.length === 1 && HAND_ROWS_TV.length === 1 && same(HAND_ROWS_IDX[0], HAND_ROWS_TV[0]) && HAND_SCROLL.rarity === 'common'
        && HAND_SCROLL.classKey === 'mage' && HAND_SCROLL.spellId === HAND_ID && same(A.scroll, HAND_SCROLL) && same(S.page, HAND_SCROLL),
        { idx: HAND_ROWS_IDX, tv: HAND_ROWS_TV, pageIdx: A.scroll, pageTv: S.page });
    }

    /* ══════════ P12/P13. (10a) 同じ乱数種・覚えていない: 素 vs ?magehand=0 ══════════ */
    const run10a = async (qs) => {
      const pg = await openIndex('bandits-forest', qs, false, SEED);
      const setup = await pg.evaluate(() => {
        window.__autoplay = 1;   // ダイアログを即決させる (演出の尺は 1 倍のまま)
        const a = __mageAlly(); __putAlly(a, 52, 12);
        const t = traps.find((x) => x.tx < 40) || traps[0];
        t.found = true; playerX = t.tx * 96; playerY = t.ty * 96 - 10;
        __ev.length = 0;
        gameStarted = true;
        /* ⚠ 罠の解除の口は「主人公が 1 マス進んだ時」(heroAI の歩行) にしか呼ばれない ⇒ 止まった主人公では 15 秒待っても列が空
         *   (= 恒等が永久緑)。進めた直後の 1 回だけ本番の関数を直に呼ぶ (#80 §12-2) */
        runTrapDisarmCheck();
        return { trap: [t.tx, t.ty], mage: a.npcName };
      });
      await sleep(RUN10A_MS);
      const r = await pg.evaluate(() => { const ev = __ev.filter((e) => e.t === 'c' || e.t === 'cc').map((e) => e.t === 'c' ? 'C|' + e.args.join('|') + '|' + e.argc : 'CC|' + e.msg + '|' + e.labels.join('/')); gameStarted = false; window.__autoplay = 0; return ev; });
      await closePage(pg);
      return { setup, calls: r };
    };
    const Q0 = await run10a('');
    const Q1 = await run10a('&magehand=0');
    R.check('(10a)', '覚えていない新しいセーブ・同じ乱数種で、罠の隣 + 檻を射程に収めた魔法使いの森 n7 を ' + (RUN10A_MS / 1000) + ' 秒進めた選択ダイアログの列が ?magehand=0 と完全一致 (空でない)',
      Q0.calls.length >= 1 && J(Q0.calls) === J(Q1.calls) && J(Q0.setup) === J(Q1.setup), { now: Q0, off: Q1 });

    /* ══════════ (6a) 枠を使わない ══════════ */
    R.check('(6a)', '(2a)(3a)(5a)(7b)(8a) で、ダイアログを出した時と手を使った後の呪文枠 (主人公 + 全仲間) が完全一致',
      slotPairs.length === 5 && slotPairs.every((x) => x[1] !== null && x[1] === x[2]), slotPairs.map((x) => [x[0], x[1] === x[2] ? 'same' : { at: x[1], after: x[2] }]));
    /* ══════════ (0d) 起動確認 ══════════ */
    {
      const want = 12 + 1;   // index 12 枚 (P1〜P10 の 10 + P12・P13) + tavern 1
      R.check('(0d)', '[装置] 全ページが起動し pageerror 0 件', ctx.booted === want && ctx.errs.length === 0, '起動 ' + ctx.booted + '/' + want + ' / pageerror ' + J(ctx.errs.slice(0, 3)));
    }
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await sleep(200);   // console イベントの取りこぼしを避ける
    for (const pg of pages) await pg.close().catch(() => {});
  }
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_mage_hand_');
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
          const r0d = R.filter((r) => r.id === '(0d)')[0];
          const bootOk = !!r0d && r0d.ok;
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
