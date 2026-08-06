#!/usr/bin/env node
/*
 * driver_sce1_events.js — シナリオ1「ゴブリンの廃坑」選択肢イベント 回帰ドライバ
 * ═══════════════════════════════════════════════════════════════════════════════
 * 【項目 1 = 潜行中シナリオ状態 sceneFlags の土台】
 *   §1 定義    sceneFlags / isGoblinMineScenario / sceneClassBonus が index.html に在る
 *   §2 初期値  sceneFlags は mine_alerted / servant_rescued のちょうど 2 本・いずれも false
 *   §3 非永続  sessionStorage に載せない = リロードで初期値へ戻る (潜行内で完結)
 *   §4 ゲート  isGoblinMineScenario() は既定クエストで true / 生成クエストで false
 *   §5 加算    sceneClassBonus は在籍で 2・非在籍で 0。★DC ではなく extraBonus 側に効く
 *   §6 シーム  window.__sce1 は ?diag=1 / ?autoplay のときだけ生え、素の起動では生えない
 * 【項目 2 = EV-2「廃坑入口の見張り」】
 *   §7 EV-2   接近3択 / 判定なし枠は SkillCheck を呼ばない / 失敗で mine_alerted+増援2体 /
 *             Esc は無害で declined / 発火は1回きり / 生成クエストでは発火しない
 * 【項目 3 = EV-5「捕らわれた従者」+ 従者の味方ユニット化】
 *   §8 EV-5   接近3択 / 判定なし枠は SkillCheck を呼ばない / ★専用スプライト配線 2 箇所 /
 *             ★成功でも失敗でも救出は成立する (代償は HP のみ) = シナリオ1 の感情的な芯 /
 *             ★召喚枠 (summonSlot) を食わない / 失敗時は既存の罠ダメージ経路を通る
 * 【項目 4 = EV-9「玉座のグリクス」+ ボス戦への接続】
 *   §9 EV-9   配置(ボス部屋の入口・全敵の交戦距離の外) / 3択 /
 *             ★救出済で変わるのは文面と DC だけ・選択肢は 1 つも消えない (§4.1 原則) /
 *             ★Esc は突撃扱い (declined にしない = 入口で止まると詰むため) /
 *             選択0 成功で servant_rescued へ昇格 / 失敗でボス初期HP +20% /
 *             選択1 成功で先制ラウンド (★既存の不意打ち機構 applySurpriseStun を共有) /
 *             選択1 失敗で配下 +2 /
 *             ★Redirect (人質の従者を盾にする): 未救出で発動しうる・救出済で 1 回も発動しない・
 *               人質が死んだら以降は発動しない / エピローグ 3 分岐がリザルトに出る
 *   §E pageerror 0
 *   §N ★負のコントロール (同一 run に内包)
 *
 * ■ ⚠ 負のコントロールは「別 run で比べる」のではなく **同一 run に内包する**
 *   port (無変異) と port+1 (変異) の 2 台を同時に立て、**同じ検出器関数** detectors() を
 *   両方のページに当てる。無変異側で全 true / 変異側で狙った検出器だけ false になることを
 *   実測する。「assert を書いたつもりで何も見ていない」を原理的に潰す。
 *
 * ■ ⚠ 変異はディスクを書き換えず **配信をメモリ上で差し替える** (復元漏れが起きない)
 *   ⚠⚠ 置換文字列は必ず 1 行。index.html は CRLF なので改行を含む複数行の置換は
 *      原理的に一致しない (2026-08-04 に driver_field 系 5 本が踏んだ罠)。
 *   ⚠ 置換対象が 0 件 / 2 件以上なら exit 3 (空振りしたまま PASS になるのを防ぐ)。
 *
 *     kind | 注入する欠陥                                   | 赤くなるべき検出器
 *     -----|------------------------------------------------|--------------------------
 *     N1   | sceneFlags.mine_alerted の初期値を true に      | D2 (初期値 mine_alerted)
 *     N2   | SCENE_CLASS_BONUS を 2 → 0                     | D5 (在籍時 2)
 *     N3   | シームの ?diag ゲートを外す (if(true) に)       | §6 素の起動で生えない
 *     N4   | SCE1_ALERT_ADD_TYPES を空配列に (増援 0 体)     | E14/E15 (部屋0 の敵 +2)
 *     N5   | 失敗時の mine_alerted=true を false に          | E13 (失敗でフラグが立つ)
 *     N6   | 判定なし枠を「候補0の判定」へ落とす            | E6  (選択2 で SkillCheck 未呼出)
 *     N7   | シナリオゲート isGoblinMineScenario を無効化    | E17 (生成クエストで発火しない)
 *     N8   | 救出フラグ servant_rescued=true を false に     | S11/S13 (救出は判定運で折れない)
 *     N9   | 従者参戦で summonSlot も奪う                    | S12 (召喚枠を食わない)
 *     N10  | 罠作動 (applyServantTrapDamage) を no-op に     | S14 (失敗の代償=HP が減る)
 *     N11  | EV-5 の判定なし枠を「候補0の判定」へ落とす      | S5  (選択2 で SkillCheck 未呼出)
 *     N12  | 肩代わりしてもボスの HP を一緒に減らす          | G12 (ボス HP は 1 も減らない)
 *     N13  | Esc を declined (何もしない) に戻す             | G7  (Esc が突撃扱い)
 *     N14  | 不意打ちの唯一の付与点 applySurpriseStun を空に | G10 **と** G10b が同時に
 *     N15  | arm 側の「救出済なら仕掛けない」を外す          | G13a
 *     N16  | setter 側の「救出済なら発動しない」を外す       | G13b
 *     N17  | 「人質が死んだら発動しない」を外す              | G14
 *     N18  | エピローグの「人質生存」分岐を潰す              | G16 (3分岐の出し分け)
 *     N19  | DC を救出状況で変えない (常に 15)               | G5  (救出済で DC13)
 *     N20  | ★救出済のとき選択肢を 1 つ消す (§4.1 違反)     | G4
 *     N21  | ボス HP の上方修正を消す                        | G9
 *     N22  | 見抜かれた時の配下 +2 を 0 体に                 | G11
 *     N23  | EV-9 の判定なし枠を「候補0の判定」へ落とす      | G6
 *     N24  | 救出済の成功枝を旧実装へ戻す (人質を再解放)     | G18
 *     N25  | 候補0 のラベルを未救出のまま固定する            | G4b
 *     N26  | 判定パネルの一文を未救出のまま固定する          | G4c
 *     N27  | スプライト配線を片方だけ旧流用へ戻す            | S20
 *     N28  | 救出しても縛られた姿を消さない                  | C3
 *     N29  | 従者の湧き位置をプレイヤーの真横へ戻す          | C5
 *     N30  | EV-9 発火時に姿を玉座へ移さない                 | C4
 *   ⭐ N28/N29/N30 は 2026-08-06 の「急にぱっと PT メンバーに入るので、助けた感がない」への
 *     対応 (縛られた姿を盤面に置く) を、**消える / 走ってくる / 玉座へ移る** の 3 つに割って測る。
 *   ⭐ N24/N25/N26 は 2026-08-06 の iOS 実機フィードバック (「従者を助けた後なのに、
 *     グリクス戦で人質解放を要求してくる」) の再発防止。破綻は **ラベル / 一文 / 演出と報酬**
 *     の 3 箇所に独立して居たので、検出器も 3 つに割って独立に落ちることを実測する
 *     (1 つにまとめると「1 箇所だけ直した」状態を緑のまま見逃す)。
 *   ⭐ N14 が本項目で最も重要な負のコントロール: **1 つの変異が G10 (EV-9 の奇襲) と
 *     G10b (第7弾「隠密の接近」) を同時に殺す** = EV-9 が新しい先制機構を作らず、
 *     既存の付与点をそのまま共有していることの実測 (別配線なら片方しか落ちない)。
 *   ⭐ N15/N16 も外科的: 「仕掛けるか」と「発動するか」は別のガードなので独立に落ちる。
 *   ⭐ N8/N10 も外科的: 同じ「1 失敗」分岐に同居しているのに、救出成立 (S13) と
 *     HP の代償 (S14) が独立に落ちる = 「救出を判定運で折らない」が本当に別配線であることの実測。
 *   ⭐ N1/N2 は「狙った検出器だけ」が赤くなり、隣の検出器 (D3 servant_rescued / D6 非在籍 0)
 *     は緑のまま = 変異が外科的で、検出器が互いに独立していることの証明。
 *   ⭐ N4/N5 も同様に外科的: 同じ失敗分岐に同居しているのに、片方 (E13 フラグ) と
 *     もう片方 (E14 増援) が独立に落ちる = effect を flag でゲートしていないことの実測。
 *   ⚠ 変異ページは N1 で mine_alerted の**初期値**が true になっているので、EV-2 の
 *     フラグ検出 (E13) を測る前に driver 側で false へ戻す (初期値は D2 が別途見ている)。
 *
 * ■ 使い方
 *     node tools/driver_sce1_events.js [--headful] [--browser <path>] [--port N]
 *   exit 0 = 全 PASS / 1 = FAIL / 2 = 環境不備 / 3 = 変異の空振り
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const makeProfile = require('./_pptr_profile');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
/* ⚠ ポートは既存ドライバと 4 以上空ける (baseline 用に port+1 を掴む本があるため)。
 *   本ドライバ自身も port+1 (変異配信) を掴む。8845/8846 が空いていることは
 *   `grep -rn "8845\|8846" tools/*.js` が 0 件であることで実測 (2026-08-05)。
 *   近傍の実使用は 8841 / 8856 / 8861 なので前後とも 4 以上空いている。 */
const PORT = parseInt(arg('port', '8845'), 10);
const PORT_MUT = PORT + 1;

// ══════════════════════════════════════════════════════════════════════════════
// 変異負制御 (配信をメモリ上で差し替える)
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_TARGETS = ['index.html'];
const MUTATIONS = [
  // N1: 潜行中フラグの初期値を壊す。→ §2 の D2 だけが赤くなるはず。
  ['      mine_alerted: false,',
   '      mine_alerted: true,   /* ★変異N1 */'],
  // N2: 得意クラス加算を 2 → 0。→ §5 の D5 (在籍時 2) だけが赤くなるはず
  //     (D6「非在籍で 0」は 0 のままなので緑 = 外科的であることの証明)。
  ['    const SCENE_CLASS_BONUS = 2;',
   '    const SCENE_CLASS_BONUS = 0;   /* ★変異N2 */'],
  // N3: 検証シームの dev ゲートを外す。→ §6「素の起動では生えない」が赤くなるはず。
  ['    if (window.__diagEnabled) window.__sce1 = ',
   '    if (true) window.__sce1 = '],
  // ── 項目2 (EV-2) ──────────────────────────────────────────────────────────
  // N4: 骨笛が鳴った時の増援を 0 体に。→ E14/E15 (部屋0 の敵 +2) だけが赤くなるはず。
  //     E13 (フラグが立つ) は緑のまま = effect と flag が独立していることの証明。
  ['    const SCE1_ALERT_ADD_TYPES = ["goblin", "goblin"];',
   '    const SCE1_ALERT_ADD_TYPES = [];   /* ★変異N4 */'],
  // N5: 判定失敗でフラグを立てない。→ E13 だけが赤くなるはず (E14 の増援は出続ける)。
  ['      sceneFlags.mine_alerted = true;',
   '      sceneFlags.mine_alerted = false;   /* ★変異N5 */'],
  // N6: 「判定なし(確定)」枠を候補0の判定へ落とす。→ E6 (選択2 で SkillCheck 未呼出) が赤くなるはず。
  //     ⚠ undefined を投げず必ず有効な spec になる変異にする (例外で全部赤 = 何も測れない)。
  ['      const spec = SCE1_WATCH_CHECKS[choice] || null;',
   '      const spec = SCE1_WATCH_CHECKS[choice] || SCE1_WATCH_CHECKS[0];   /* ★変異N6 */'],
  // N7: シナリオゲートを無効化。→ E17 (生成クエストでは発火しない) が赤くなるはず。
  ['      if (!isGoblinMineScenario()) return;',
   '      if (false) return;   /* ★変異N7 */'],
  // ── 項目3 (EV-5) ──────────────────────────────────────────────────────────
  // N8: 救出フラグを立てない。→ S11/S13 (救出は必ず成立する) が赤くなるはず。
  //     ★参戦 (joinServantAlly) は別配線なので S12/S17 は緑のまま = 外科的。
  ['      sceneFlags.servant_rescued = true;',
   '      sceneFlags.servant_rescued = false;   /* ★変異N8 */'],
  // N9: 従者に召喚枠を食わせる。→ S12 (summonSlot が変化しない) が赤くなるはず。
  ['      allies.push(a);                        // ★isSummon / summonSlot は触らない = 召喚枠を食わない',
   '      summonSlot = a; allies.push(a);   /* ★変異N9 */'],
  // N10: 「1 失敗」の代償 (罠ダメージ) を消す。→ S14 (HP が減る) が赤くなるはず。
  //     S13 (失敗でも救出成立) は緑のまま = 救出と代償が独立していることの証明。
  ['      applyServantTrapDamage();',
   '      void 0;   /* ★変異N10 */'],
  // N11: EV-5 の「判定なし(確定)」枠を候補0の判定へ落とす。→ S5 が赤くなるはず。
  ['      const spec = SCE1_SERVANT_CHECKS[choice] || null;',
   '      const spec = SCE1_SERVANT_CHECKS[choice] || SCE1_SERVANT_CHECKS[0];   /* ★変異N11 */'],
  // ── 項目4 (EV-9 + ボス戦への接続) ─────────────────────────────────────────
  /* N12: 肩代わりの**芯**だけを壊す — 人質は削るのにボスの HP も一緒に減らす
   *      (= 肩代わりになっていない)。→ G12「ボス HP は 1 も減らない」が赤くなるはず。
   *   ⚠ 当初は SCE1_REDIRECT_CHANCE を 0 にしていたが、それだとページ全体で Redirect が
   *     一度も走らなくなり、**N16/N17 の負のコントロールまで観測不能になる** (実測で 2 件空振り)。
   *     負のコントロールは「他の負のコントロールの母集団」を壊さないものを選ぶこと。 */
  /* ⚠ 置換後の文字列に置換前の文字列を**含めない** (M1 の「変異前が消えたか」検査が
   *   部分一致で誤検知する)。よって `++` ではなく `+= 1` で書き換える。 */
  ['          hostageRedirectCount++;',
   '          shadow = v; hostageRedirectCount += 1;   /* ★変異N12 */'],
  // N13: Esc を「何もしない (declined)」に戻す。→ G7 (Esc が突撃扱い) が赤くなるはず。
  ['      if (viaEsc) choice = 2;   // ★Esc = 突撃扱い。declined は立てない (入口で止まれると詰む)',
   '      if (viaEsc) { ev.declined = true; skillCheckActive = false; return; }   /* ★変異N13 */'],
  // N14: ★不意打ちの唯一の付与点 applySurpriseStun を no-op に。
  //      → G10 (EV-9 の奇襲) と G10b (第7弾「隠密の接近」) が **同時に** 赤くなるはず。
  //      これが「EV-9 が新機構を作らず既存の不意打ち機構を共有している」ことの実測そのもの。
  ['        if (enemies[i] && enemies[i].alive) { enemies[i].stunned = Math.max(enemies[i].stunned || 0, 1); n++; }',
   '        if (enemies[i] && enemies[i].alive) { n++; }   /* ★変異N14 */'],
  // N15: arm 側の「救出済なら仕掛けない」ガードを外す。→ G13a が赤くなるはず。
  ['      if (sceneFlags.servant_rescued) return false;   // ★救出済 = 人質が居ない = 仕掛けない',
   '      if (false) return false;   /* ★変異N15 */'],
  // N16: setter 側の「救出済なら発動しない」ガードを外す。→ G13b が赤くなるはず。
  //      N15 とは別配線 (仕掛けるか / 発動するか) なので、片方ずつ独立に落ちる。
  ['          if (sceneFlags.servant_rescued) { shadow = v; return; }                // ★救出済 = 人質が居ない = 一切発動しない',
   '          if (false) { shadow = v; return; }   /* ★変異N16 */'],
  // N17: 「人質が死んだら以降は発動しない」ガードを外す。→ G14 が赤くなるはず。
  ['          if (hostageServantHp <= 0) { shadow = v; return; }                     // ★従者が死んだら以降は発動しない',
   '          if (false) { shadow = v; return; }   /* ★変異N17 */'],
  // N18: エピローグの「人質生存」分岐を潰す。→ G16 (3分岐の出し分け) が赤くなるはず。
  ['      if (hostageServantHp > 0) return `🤝 縄を断たれた ${nm} は、戦いの喧噪に紛れて坑道の外へ逃げ延びた。`;',
   '      if (false) return null;   /* ★変異N18 */'],
  // N19: DC を救出状況で変えない (常に 15)。→ G5 (救出済で DC13) が赤くなるはず。
  ['      return sceneFlags.servant_rescued ? SCE1_GRIX_DC_RESCUED : SCE1_GRIX_DC_HOSTAGE;',
   '      return SCE1_GRIX_DC_HOSTAGE;   /* ★変異N19 */'],
  // N20: ★§4.1 原則違反の注入 — 救出済のとき選択肢を 1 つ**消す**。→ G4 が赤くなるはず。
  //      消すのは候補1 (候補0 は G5 の DC 測定に使うので残す = 検出器を独立に保つ)。
  ['            { label: "積荷を渡すふりをする" },',
   '            ...(sceneFlags.servant_rescued ? [] : [{ label: "積荷を渡すふりをする" }]),   /* ★変異N20 */'],
  // N21: ボス HP の上方修正を消す。→ G9 が赤くなるはず。
  ['      boss.maxHp = Math.round(before * SCE1_GRIX_ENRAGE_MUL);',
   '      boss.maxHp = before;   /* ★変異N21 */'],
  // N22: 見抜かれた時の配下 +2 を 0 体に。→ G11 が赤くなるはず。
  ['    const SCE1_GRIX_ADD_TYPES    = ["goblin", "goblin"];',
   '    const SCE1_GRIX_ADD_TYPES    = [];   /* ★変異N22 */'],
  // N23: EV-9 の「判定なし(確定)」枠を候補0の判定へ落とす。→ G6 が赤くなるはず。
  ['      const spec = SCE1_GRIX_CHECKS[choice] || null;',
   '      const spec = SCE1_GRIX_CHECKS[choice] || SCE1_GRIX_CHECKS[0];   /* ★変異N23 */'],
  /* ── 2026-08-06 iOS 実機フィードバック「救出済なのに人質解放を要求してくる」の再発防止 ───
   *   ⭐ 破綻は **3 箇所に独立して**居た (ラベル / 判定パネルの一文 / 成否の演出と報酬)。
   *      1 つの検出器にまとめると「1 箇所だけ直った」状態を緑のまま見逃すので、
   *      N24/N25/N26 で 3 つとも別々に落ちることを実測する。 */
  // N24: 救出済の成功枝を旧実装へ戻す (= もう居ない人質を rescueServant で「解放」する)。
  //      → G18 が赤くなるはず。G4b/G4c (文面) は緑のまま = 演出と文面が別配線であることの証明。
  ['          if (rescued) {',
   '          if (false) {   /* ★変異N24 */'],
  // N25: 候補0 のラベルを未救出のまま固定する (実機で見えた破綻そのもの)。→ G4b が赤くなるはず。
  ['            { label: sce1GrixPersuadeLabel() },',
   '            { label: SCE1_GRIX_LABEL_HOSTAGE },   /* ★変異N25 */'],
  // N26: 判定パネルの一文だけ未救出のまま固定する。→ G4c が赤くなるはず (G4b は緑)。
  ['            flavor: (spec.flavorRescued && sceneFlags.servant_rescued) ? spec.flavorRescued : spec.flavor,',
   '            flavor: spec.flavor,   /* ★変異N26 */'],
  /* N27: スプライト配線を **片方だけ** 旧流用 (NPC 男性僧侶) へ戻す。→ S20 が赤くなるはず。
   *   ⭐ 直すべき箇所が 2 つある配線の「片方だけ直した/戻した」を検出できることの実測。
   *     CLASS_DEFS.servant.sprite は緑のまま (= 別配線) なので、S20 が両方を見ている意味が出る。 */
  ['      servant:       [ { walk: \'url("assets/servant_walk.png")\', walkSize: "576px 384px", attack: \'url("assets/servant_attack.png")\', attackSize: "480px 384px", label: "商人の従者" } ],',
   '      servant:       [ { walk: \'url("assets/cleric_npcmale_walk.png")\', walkSize: "576px 384px", attack: \'url("assets/cleric_npcmale_attack.png?v=2")\', attackSize: "480px 384px", label: "商人の従者" } ],   /* ★変異N27 */'],
  /* ── 「縛られた従者」の可視化 (2026-08-06 実機フィードバック「助けた感がない」) ─────
   *   ⭐ 3 つの独立した振る舞い (消える / 走ってくる / 玉座へ移る) を別々に壊す。 */
  /* N28: 救出しても縛られた姿を消さない。→ C3 が赤くなるはず (助けたのに縄が残る)。
   *   ⚠ 一致は **部分一致** なので `      hideSce1Captive();` だけだと人質死亡側の
   *     `        hideSce1Captive();` にも刺さって 2 箇所ヒット (exit 3) になる。行末コメントで割る。 */
  ['      hideSce1Captive();   // ★救出で縄の姿を消す (行末コメントは変異N28 の一致キー)',
   '      void 0;   /* ★変異N28 */'],
  // N29: 湧き位置を旧実装 (プレイヤーの真横) へ戻す。→ C5 が赤くなるはず。
  ['      if (sce1CaptiveState === "tunnel" || sce1CaptiveState === "throne") {',
   '      if (false) {   /* ★変異N29 */'],
  // N30: EV-9 発火時の受け皿を外す。→ C4 が赤くなるはず (横穴に置き去りのまま玉座で語られる)。
  //   ⚠ N28 と同じ理由で行末コメントで割る (EV-5 迂回側の同名呼び出しに部分一致するため)。
  ['      moveSce1CaptiveToThrone();   // ★EV-9 側の受け皿 (行末コメントは変異N30 の一致キー)',
   '      void 0;   /* ★変異N30 */'],
];
let _mutCache = null;
function mutatedSources() {
  if (_mutCache) return _mutCache;
  const out = {};
  for (const rel of MUTATE_TARGETS) out[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of MUTATIONS) {
    if (from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔ 変異の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)');
      process.exit(3);
    }
    const hits = MUTATE_TARGETS.filter(rel => out[rel].indexOf(from) >= 0);
    const n = hits.reduce((a, rel) => a + out[rel].split(from).length - 1, 0);
    if (hits.length !== 1 || n !== 1) {
      console.error('[drv] ⛔ 変異の置換対象が ' +
        (hits.length === 0 ? '見つからない' : hits.length + ' ファイル / ' + n + ' 箇所') +
        ' → 負のコントロールが空振りする: ' + JSON.stringify(from.slice(0, 90)));
      process.exit(3);
    }
    out[hits[0]] = out[hits[0]].split(from).join(to);
  }
  _mutCache = out;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer(port, mutate) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\//, '');
        if (mutate && MUTATE_TARGETS.indexOf(rel) >= 0) {
          res.setHeader('Content-Type', MIME['.html']);
          res.setHeader('Cache-Control', 'no-store');
          res.end(mutatedSources()[rel]); return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (detail ? '  — ' + detail : ''));
}
let step = 0;
function mark(msg) { console.log('[drv] ' + (++step) + ' ' + msg); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ★検出器 — 無変異側で全 true / 変異側で狙ったものだけ false になるべき述語群。
 *   同じ関数を両方のページの probe に当てることで「assert が本当に何かを見ている」を担保する。 */
function detectors(P) {
  return {
    D1: { label: 'sceneFlags のキーはちょうど 2 本 (mine_alerted / servant_rescued)',
          ok: eq(P.flagKeys, ['mine_alerted', 'servant_rescued']), got: JSON.stringify(P.flagKeys) },
    D2: { label: 'sceneFlags.mine_alerted の初期値は false',
          ok: P.mineAlerted === false, got: String(P.mineAlerted) },
    D3: { label: 'sceneFlags.servant_rescued の初期値は false',
          ok: P.servantRescued === false, got: String(P.servantRescued) },
    D4: { label: 'isGoblinMineScenario() は既定クエストで true',
          ok: P.isGM === true, got: P.scenarioId + ' -> ' + P.isGM },
    D5: { label: 'sceneClassBonus: 在籍クラスなら 2',
          ok: P.bonusPresent === 2, got: '[' + P.present + '] -> ' + P.bonusPresent },
    D6: { label: 'sceneClassBonus: 非在籍クラスなら 0',
          ok: P.bonusAbsent === 0, got: '[' + P.absentKey + '] -> ' + P.bonusAbsent },
  };
}

/* ページから状態を吸い出す。⚠ 1 evaluate 内で完結させる (ライブ game loop の割り込み排除)。
 *   ⚠ classic script 直下の let/const/function は window に載らないので **bare 名**で参照する。 */
function probe(page) {
  return page.evaluate(() => {
    const out = { err: null };
    try {
      out.hasSeam = !!window.__sce1;
      out.seamKeys = window.__sce1 ? Object.keys(window.__sce1).sort() : [];
      // bare 参照 = classic script のグローバル字句環境を直に見る
      out.typeofSceneFlags = typeof sceneFlags;
      out.typeofIsGM = typeof isGoblinMineScenario;
      out.typeofBonus = typeof sceneClassBonus;
      out.typeofParty = typeof buildPerceptionParty;
      out.scenarioId = scenarioId;
      out.isGM = isGoblinMineScenario();

      const f = window.__sce1 ? window.__sce1.flags() : sceneFlags;
      out.flagKeys = Object.keys(f).sort();
      out.mineAlerted = f.mine_alerted;
      out.servantRescued = f.servant_rescued;
      out.seamFlagsIsLive = window.__sce1 ? (window.__sce1.flags() === sceneFlags) : null;
      out.seamBonusIsSame = window.__sce1 ? (window.__sce1.classBonus === sceneClassBonus) : null;

      const ALL6 = ['warrior', 'dwarf', 'rogue', 'elf', 'cleric', 'mage'];
      const roster = buildPerceptionParty().map(m => m.classKey);
      out.roster = roster;
      out.present = roster[0] || null;
      out.absentKey = ALL6.filter(k => roster.indexOf(k) < 0)[0] || null;

      const cb = sceneClassBonus;
      out.bonusPresent = out.present ? cb([out.present]) : null;
      out.bonusAbsent = out.absentKey ? cb([out.absentKey]) : null;
      out.bonusAll6 = cb(ALL6);
      out.bonusBogus = cb(['__no_such_class__']);
      out.bonusEmpty = cb([]);
      out.bonusNull = cb(null);
      out.bonusUndef = cb(undefined);
      out.bonusNonArray = cb('rogue');
      // ★動的: 非在籍クラスの仲間を 1 人だけ足すと 0 → 2 に変わる = 本当に allies を読んでいる
      //   (定数を返しているだけでは絶対に再現できない)。push/pop は同一 evaluate 内で完結。
      if (out.absentKey) {
        allies.push({ alive: true, classKey: out.absentKey, npcName: 'テスト仲間' });
        try { out.dynAfterJoin = cb([out.absentKey]); } finally { allies.pop(); }
        out.dynAfterLeave = cb([out.absentKey]);
      }
      out.ssKeys = Object.keys(sessionStorage);
    } catch (e) { out.err = String((e && e.message) || e); }
    return out;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 項目 2 — EV-2「廃坑入口の見張り」の駆動
// ══════════════════════════════════════════════════════════════════════════════
/* ■ なぜ「シームで結果を強制」ではなく **SkillCheck 本体をスタブ**するのか
 *   仕様の要求は「判定結果を検証シームで強制できる形にする」だが、そのために製品コードへ
 *   テスト専用の分岐を足すと、出荷コードに「本番では絶対に通らない道」が増える (= dev シームの
 *   大掃除で消したものを再び生やす)。window.SkillCheck.resolveSkillCheck は **既に公開 API** なので、
 *   ページ側でそれを差し替えれば ①成否の強制 と ②呼び出し回数の観測 が同時に得られる。
 *   ★これは「選択2 では SkillCheck が呼ばれない」を測る唯一の方法でもある
 *     (呼ばれないことは、呼び出し口を握っていないと原理的に観測できない)。
 *
 * ■ 盤面の固定 (ここを外すと恒久的に不安定になる)
 *   ⚠ moveEnemies は setInterval(…, 30) で rAF とは独立に回る。rAF を凍結しただけでは
 *     敵が寄ってきて encounterActive が立ち、EV-2 のガードで発火しなくなる。
 *     → 全敵に inactive を立てる (檻のビーストと同じ休眠。moveEnemies:13573 と
 *        detectEnemiesEngagedByRange:15923 の両方が inactive を除外する)。
 *   ⚠ 宝箱/罠の 400ms tick は skillCheckActive を奪い合うので roomChests/traps を空にする。
 *   ⚠ パーティ編成は起動ごとに乱択されるので、+2 ボーナスは**そのページ自身**の
 *     sceneClassBonus(["rogue"]) と突き合わせる (ページ間で roster 一致を仮定しない)。 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ev2Prepare(page) {
  return page.evaluate(() => {
    gameStarted = true; gameOver = false;
    encounterActive = false; encounterRunning = false;
    dialogPaused = false; skillCheckActive = false;
    roomChests.length = 0; traps.length = 0;
    enemies.forEach(e => { e.inactive = true; });
    sceneFlags.mine_alerted = false;      // ★変異N1 (初期値 true) の影響を排して EV-2 の遷移だけを測る
    const SC = window.SkillCheck;
    if (!SC.__origResolve) SC.__origResolve = SC.resolveSkillCheck;
    window.__ev2 = { calls: [], force: true };
    window.__ev2.room0Count = function () {
      const r = ROOMS[0]; let n = 0;
      for (const e of enemies) {
        if (!e.alive) continue;
        const s = e.def.displaySize;
        const tx = Math.floor((e.x + s / 2) / TILE_SIZE), ty = Math.floor((e.y + s / 2) / TILE_SIZE);
        if (ty >= r[0] && ty <= r[2] && tx >= r[1] && tx <= r[3]) n++;
      }
      return n;
    };
    SC.resolveSkillCheck = function (checkKey, dc, party, o) {
      window.__ev2.calls.push({ checkKey: checkKey, dc: dc,
        extraBonus: (o && o.extraBonus) || 0, title: (o && o.title) || null });
      const ok = !!window.__ev2.force;
      return Promise.resolve({ success: ok, roll: 10, total: ok ? dc + 3 : dc - 3, dc: dc,
        bonus: 0, rep: (party && party[0]) || null, helper: null, crit: false, fumble: false });
    };
    const s = sce1WatchSpot(), a = sce1AlertAnchorTile();
    return {
      spot: s, anchor: a, tile: TILE_SIZE, hp: hp, room0: ROOMS[0],
      spotIsWall: isTileWall(s.tx, s.ty),
      anchorInRoom0: a.ty >= ROOMS[0][0] && a.ty <= ROOMS[0][2] && a.tx >= ROOMS[0][1] && a.tx <= ROOMS[0][3],
      rogueBonus: sceneClassBonus(["rogue"]),
      roster: buildPerceptionParty().map(m => m.classKey),
      room0Before: window.__ev2.room0Count(),
      totalBefore: enemies.length,
      radius: SCE1_EVENT_RADIUS, dc: SCE1_WATCH_DC,
      addTypes: SCE1_ALERT_ADD_TYPES.slice(),
    };
  });
}
// プレイヤーを発火地点そのもの / 半径外 (7タイル東 = 672px ≫ 240) へ瞬間移動させる。
async function ev2Approach(page, where) {
  await page.evaluate((w) => {
    const s = sce1WatchSpot();
    const tx = (w === 'far') ? s.tx + 7 : s.tx;
    playerX = tx * TILE_SIZE + TILE_SIZE / 2 - 48;
    playerY = s.ty * TILE_SIZE + TILE_SIZE / 2 - 58;
  }, where);
}
async function ev2WaitDialog(page, ms) {
  const t0 = Date.now();
  for (;;) {
    const info = await page.evaluate(() => {
      const d = document.getElementById('choiceDialog');
      if (!d || !d.classList.contains('show')) return null;
      return { msg: (d.querySelector('.choiceMessage') || {}).textContent || '',
               labels: Array.from(d.querySelectorAll('.choiceButtons button')).map(b => b.textContent) };
    });
    if (info) return info;
    if (Date.now() - t0 >= ms) return null;
    await sleep(120);
  }
}
// idx 0..2 = 候補 / -1 = キャンセル (Esc と同じ resolve(null) 経路)
async function ev2Click(page, idx) {
  await page.evaluate((i) => {
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    const b = (i < 0) ? btns[btns.length - 1] : btns[i];
    if (b) b.click();
  }, idx);
}
async function ev2Settle(page) {
  for (let k = 0; k < 50; k++) {
    const done = await page.evaluate(() => {
      const d = document.getElementById('choiceDialog');
      return !(d && d.classList.contains('show')) && !skillCheckActive && !SCE1_EVENTS[0].busy;
    });
    if (done) { await sleep(120); return true; }
    await sleep(80);
  }
  return false;
}
async function ev2State(page) {
  return page.evaluate(() => ({
    flag: sceneFlags.mine_alerted,
    fired: SCE1_EVENTS[0].fired, declined: SCE1_EVENTS[0].declined,
    calls: window.__ev2.calls.slice(),
    room0: window.__ev2.room0Count(), total: enemies.length,
    addsDone: mineAlertedAddsDone,
  }));
}
// fired ラッチを解いて次の選択肢を試せる状態へ戻す (結果分岐の網羅用。ラッチ自体は E8 が別途見る)
async function ev2Rearm(page, force) {
  await page.evaluate((f) => {
    SCE1_EVENTS[0].fired = false; SCE1_EVENTS[0].declined = false;
    window.__ev2.calls.length = 0; window.__ev2.force = !!f;
    enemies.forEach(e => { e.inactive = true; });   // 増援も休眠させエンカを起こさない
    dialogPaused = false; skillCheckActive = false;
  }, force);
}

/* EV-2 の一連の観測。⚠ 無変異ページと変異ページの**両方**にこの同じ手順を当てる。 */
async function ev2Run(page, tag) {
  const Q = { tag };
  Object.assign(Q, await ev2Prepare(page));

  // T1 接近 → 3択 → キャンセル (Esc 相当)
  await ev2Approach(page, 'near');
  Q.dlg1 = await ev2WaitDialog(page, 5000);
  if (Q.dlg1) { await ev2Click(page, -1); await ev2Settle(page); }
  Q.afterCancel = await ev2State(page);

  // T2 半径内に留まる間は再プロンプトしない
  Q.dlg2 = await ev2WaitDialog(page, 1600);

  // T3 半径外へ出て戻れば再プロンプトされる
  await ev2Approach(page, 'far'); await sleep(900);
  await ev2Approach(page, 'near');
  Q.dlg3 = await ev2WaitDialog(page, 5000);

  // T4 選択2 (誘い出す) = 判定なし
  if (Q.dlg3) { await ev2Click(page, 2); await ev2Settle(page); }
  Q.afterLure = await ev2State(page);

  // T5 一度選んだら二度と出ない (fired ラッチ)
  await ev2Approach(page, 'far'); await sleep(900);
  await ev2Approach(page, 'near');
  Q.dlg4 = await ev2WaitDialog(page, 1600);

  // T6 選択0 成功 = stealth DC13 / フラグは false のまま
  await ev2Rearm(page, true);
  Q.dlg5 = await ev2WaitDialog(page, 5000);
  if (Q.dlg5) { await ev2Click(page, 0); await ev2Settle(page); }
  Q.afterStealthOk = await ev2State(page);

  // T7 選択1 成功 = sleightOfHand DC13
  await ev2Rearm(page, true);
  Q.dlg6 = await ev2WaitDialog(page, 5000);
  if (Q.dlg6) { await ev2Click(page, 1); await ev2Settle(page); }
  Q.afterWhistleOk = await ev2State(page);

  // T8 選択0 失敗 = mine_alerted true + 部屋0 の敵 +2
  await ev2Rearm(page, false);
  Q.dlg7 = await ev2WaitDialog(page, 5000);
  if (Q.dlg7) { await ev2Click(page, 0); await ev2Settle(page); }
  Q.afterFail = await ev2State(page);
  Q.adds = await page.evaluate((n0) => {
    const r = ROOMS[0], out = [];
    for (let i = n0; i < enemies.length; i++) {
      const e = enemies[i], s = e.def.displaySize;
      const tx = Math.floor((e.x + s / 2) / TILE_SIZE), ty = Math.floor((e.y + s / 2) / TILE_SIZE);
      out.push({ type: e.type, tx: tx, ty: ty, wall: isTileWall(tx, ty),
                 dom: !!document.getElementById('enemy' + i),
                 inRoom0: ty >= r[0] && ty <= r[2] && tx >= r[1] && tx <= r[3] });
    }
    return out;
  }, Q.totalBefore);

  // T9 冪等 (直接二度呼びしても増えない)
  Q.idem = await page.evaluate(() => {
    const before = window.__ev2.room0Count();
    const n = applyMineAlertedAdds();
    return { n: n, before: before, after: window.__ev2.room0Count() };
  });

  /* T10 ★得意クラス(盗賊)の +2 が実際に流れることの**決定論的**確認。
   *   ⚠ パーティ編成は起動ごとに乱択される。盗賊が居ない run では E11 が
   *     「extraBonus=0 === sceneClassBonus=0」で緑になり、+2 の経路を 1 度も踏まない。
   *     そこで盗賊を 1 人だけ足して再走し、必ず 2 が渡ることを実測する
   *     (足す/戻すは §5 の 5i/5j と同じ手口)。 */
  /* ⚠ この仲間は §5 の push/pop と違い **await をまたいで在籍し続ける**ので、
   *   その間に走る UI 再描画 (renderPartyStatuses) が全フィールドを舐める。
   *   手書きのモックだと欠けたフィールドで pageerror になり §E が落ちる (実測で 2 度踏んだ)。
   *   → ゲーム本体の正規コンストラクタ createAlly を使う (DOM は作らない = 描画対象にしない)。 */
  await page.evaluate(() => {
    const a = createAlly('rogue', playerX - 40, playerY + 40);
    a.npcName = 'テスト盗賊';
    allies.push(a);
  });
  await ev2Rearm(page, true);
  Q.dlg8 = await ev2WaitDialog(page, 5000);
  if (Q.dlg8) { await ev2Click(page, 0); await ev2Settle(page); }
  Q.afterRogue = await ev2State(page);
  Q.rogueBonusWith = await page.evaluate(() => {
    const b = sceneClassBonus(["rogue"]); allies.pop(); return b;
  });
  return Q;
}

/* ★EV-2 の検出器。無変異で全 true / 変異で狙ったものだけ false になるべき述語群。 */
function ev2Detectors(Q) {
  const L = (Q.dlg1 && Q.dlg1.labels) || [];
  const c0 = (Q.afterStealthOk.calls || [])[0] || null;
  const c1 = (Q.afterWhistleOk.calls || [])[0] || null;
  const adds = Q.adds || [];
  const tiles = adds.map(a => a.tx + ',' + a.ty);
  return {
    E1: { label: 'EV-2: 接近すると 3択+キャンセル のダイアログが出る',
          ok: !!Q.dlg1 && L.length === 4, got: JSON.stringify(L) },
    E2: { label: 'EV-2: ラベルは 静かに近づく / 骨笛を狙って射る / わざと姿を見せて誘い出す',
          ok: L[0] === '1. 静かに近づく' && L[1] === '2. 骨笛を狙って射る'
              && L[2] === '3. わざと姿を見せて誘い出す' && L[3] === '引き返す (Esc)',
          got: JSON.stringify(L) },
    E3: { label: 'EV-2: キャンセル(Esc) では何も起きず declined が立つ',
          ok: Q.afterCancel.flag === false && Q.afterCancel.fired === false
              && Q.afterCancel.declined === true && Q.afterCancel.calls.length === 0,
          got: JSON.stringify(Q.afterCancel) },
    E4: { label: 'EV-2: 断った後は半径内に留まる限り再プロンプトしない',
          ok: Q.dlg2 === null, got: Q.dlg2 ? 'ダイアログが再表示された' : 'none' },
    E5: { label: 'EV-2: 半径外へ出て戻れば再プロンプトされる',
          ok: !!Q.dlg3, got: Q.dlg3 ? 'ok' : 'null' },
    E6: { label: '★EV-2: 選択2(確定) では SkillCheck が 1 度も呼ばれない',
          ok: Q.afterLure.calls.length === 0, got: JSON.stringify(Q.afterLure.calls) },
    E7: { label: 'EV-2: 選択2 では mine_alerted=false のまま・敵も増えない',
          ok: Q.afterLure.flag === false && Q.afterLure.room0 === Q.room0Before,
          got: 'flag=' + Q.afterLure.flag + ' room0=' + Q.afterLure.room0 + '/' + Q.room0Before },
    E8: { label: 'EV-2: 発火は 1 回だけ (選択済みなら半径外→内でも出ない)',
          ok: Q.dlg4 === null && Q.afterLure.fired === true,
          got: 'fired=' + Q.afterLure.fired + ' redisplay=' + (Q.dlg4 ? 'yes' : 'no') },
    E9: { label: 'EV-2: 選択0 は stealth を DC13 で振る',
          ok: !!c0 && c0.checkKey === 'stealth' && c0.dc === 13 && Q.afterStealthOk.calls.length === 1,
          got: JSON.stringify(Q.afterStealthOk.calls) },
    E10: { label: 'EV-2: 選択1 は sleightOfHand を DC13 で振る',
          ok: !!c1 && c1.checkKey === 'sleightOfHand' && c1.dc === 13 && Q.afterWhistleOk.calls.length === 1,
          got: JSON.stringify(Q.afterWhistleOk.calls) },
    E11: { label: '★EV-2: DC は動かさず 得意クラス(盗賊) は extraBonus 側に乗る',
          ok: !!c0 && !!c1 && c0.extraBonus === Q.rogueBonus && c1.extraBonus === Q.rogueBonus
              && (Q.rogueBonus === 0 || Q.rogueBonus === 2),
          got: 'extraBonus=' + (c0 && c0.extraBonus) + '/' + (c1 && c1.extraBonus)
               + ' sceneClassBonus=' + Q.rogueBonus + ' roster=' + JSON.stringify(Q.roster) },
    E12: { label: 'EV-2: 判定成功なら mine_alerted=false のまま・敵も増えない',
          ok: Q.afterStealthOk.flag === false && Q.afterWhistleOk.flag === false
              && Q.afterWhistleOk.room0 === Q.room0Before,
          got: 'flags=' + Q.afterStealthOk.flag + '/' + Q.afterWhistleOk.flag
               + ' room0=' + Q.afterWhistleOk.room0 + '/' + Q.room0Before },
    E13: { label: '★EV-2: 判定失敗で sceneFlags.mine_alerted が true になる',
          ok: Q.afterFail.flag === true, got: 'flag=' + Q.afterFail.flag },
    E14: { label: '★EV-2: mine_alerted で部屋0 の敵が +2 になる',
          ok: Q.afterFail.room0 - Q.room0Before === 2,
          got: Q.room0Before + ' -> ' + Q.afterFail.room0 },
    E15: { label: 'EV-2: 増援は部屋0 の非壁・非重複タイルに湧き DOM も伴う',
          ok: adds.length === 2 && adds.every(a => !a.wall && a.inRoom0 && a.dom)
              && new Set(tiles).size === adds.length,
          got: JSON.stringify(adds) },
    E16: { label: 'EV-2: 増援は冪等 (二度目の呼び出しでは 0 体)',
          ok: Q.idem.n === 0 && Q.idem.after === Q.idem.before, got: JSON.stringify(Q.idem) },
    E17: { label: '★EV-2: 盗賊を 1 人加えると extraBonus が 2 になる (得意クラス +2 が実際に流れる)',
          ok: Q.rogueBonusWith === 2 && ((Q.afterRogue.calls || [])[0] || {}).extraBonus === 2,
          got: 'sceneClassBonus=' + Q.rogueBonusWith + ' passed=' + JSON.stringify(Q.afterRogue.calls) },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 項目 3 — EV-5「捕らわれた従者」の駆動
// ══════════════════════════════════════════════════════════════════════════════
/* ■ 盤面固定は EV-2 と同じ (敵 inactive / 宝箱・罠を空に / rAF 凍結)。追加で:
 *   ⚠ HP を満タンに戻してから測る。「失敗の代償で HP が減る」を測るのに、EV-2 の
 *     テストで削れた HP が残っていると差分が読めない。
 *   ⚠ ★従者は一度参戦すると servantJoined ラッチで二度と増えない (製品仕様)。
 *     分岐を網羅するには driver 側でラッチを解き、加入済みの従者を allies と DOM から
 *     取り除いて「参戦前」へ戻す必要がある (ev5Reset)。ラッチ自体は S18 が別途見る。
 *   ⚠ summonSlot はオブジェクトなので evaluate の戻り値に**そのまま乗せない**
 *     (DOM 参照を含むため構造化クローンで死ぬ)。'null' / 'set' の文字列へ畳んで返す。 */
async function ev5Prepare(page) {
  await page.evaluate(CAPTIVE_PROBE_SRC);   // ★観測関数をページへ生やす (ev5/ev9 で共有)
  return page.evaluate(() => {
    gameStarted = true; gameOver = false;
    encounterActive = false; encounterRunning = false;
    dialogPaused = false; skillCheckActive = false;
    roomChests.length = 0; traps.length = 0;
    enemies.forEach(e => { e.inactive = true; });
    hp = maxHp;
    allies.forEach(a => { a.hp = a.maxHp; a.alive = true; });
    sceneFlags.servant_rescued = false;   // ★変異N8 は代入側を壊すので初期化は driver 側で担保
    const SC = window.SkillCheck;
    window.__ev5 = { calls: [], force: true };
    SC.resolveSkillCheck = function (checkKey, dc, party, o) {
      window.__ev5.calls.push({ checkKey: checkKey, dc: dc,
        extraBonus: (o && o.extraBonus) || 0, title: (o && o.title) || null });
      const ok = !!window.__ev5.force;
      return Promise.resolve({ success: ok, roll: 10, total: ok ? dc + 3 : dc - 3, dc: dc,
        bonus: 0, rep: (party && party[0]) || null, helper: null, crit: false, fumble: false });
    };
    const s = sce1ServantSpot(), w = sce1WatchSpot(), r = ROOMS[0];
    return {
      spot: s, watch: w, room0: r, radius: SCE1_EVENT_RADIUS, dc: SCE1_SERVANT_DC,
      spotIsWall: isTileWall(s.tx, s.ty),
      spotInRoom0: s.ty >= r[0] && s.ty <= r[2] && s.tx >= r[1] && s.tx <= r[3],
      spotIsDeep: s.tx >= r[3] - 5,                                    // 部屋0 の「奥側」
      spotFarFromWatch: Math.abs(s.tx - w.tx) * TILE_SIZE > SCE1_EVENT_RADIUS,
      clericBonus: sceneClassBonus(["cleric"]),
      roster: buildPerceptionParty().map(m => m.classKey),
      alliesBefore: allies.length,
      hpBefore: hp, maxHp: maxHp,
      allyHpBefore: allies.map(a => a.hp),
      summonSlotBefore: (summonSlot === null || summonSlot === undefined) ? 'null' : 'set',
      // CLASS_DEFS.servant の形 (フィールド欠けは renderPartyStatuses / 描画で落ちる)
      defKeys: Object.keys(CLASS_DEFS.servant).sort(),
      undeadKeys: Object.keys(CLASS_DEFS.undead_squad).sort(),
      defHp: CLASS_DEFS.servant.hpMax, undeadHp: CLASS_DEFS.undead_squad.hpMax,
      spriteRegistered: !!getSpriteSet('servant', 0),
      spriteIsCustomSheet: CUSTOM_SHEET_CLASSES.has('servant'),
      inAllClassKeys: ALL_CLASS_KEYS.indexOf('servant') >= 0,          // ★募集 NPC に漏れていないこと
      eventKey: SCE1_EVENTS[1] ? SCE1_EVENTS[1].key : null,
    };
  });
}
// プレイヤーを従者の発火地点 / 半径外 (7タイル西 = 672px ≫ 240) へ瞬間移動させる。
async function ev5Approach(page, where) {
  await page.evaluate((w) => {
    const s = sce1ServantSpot();
    const tx = (w === 'far') ? s.tx - 7 : s.tx;
    playerX = tx * TILE_SIZE + TILE_SIZE / 2 - 48;
    playerY = s.ty * TILE_SIZE + TILE_SIZE / 2 - 58;
  }, where);
}
async function ev5Settle(page) {
  for (let k = 0; k < 50; k++) {
    const done = await page.evaluate(() => {
      const d = document.getElementById('choiceDialog');
      return !(d && d.classList.contains('show')) && !skillCheckActive && !SCE1_EVENTS[1].busy;
    });
    if (done) { await sleep(120); return true; }
    await sleep(80);
  }
  return false;
}
async function ev5State(page) {
  return page.evaluate(() => {
    const last = allies.length ? allies[allies.length - 1] : null;
    const und = (v) => (v === undefined ? 'undef' : String(v));
    return {
      flag: sceneFlags.servant_rescued,
      fired: SCE1_EVENTS[1].fired, declined: SCE1_EVENTS[1].declined,
      calls: window.__ev5.calls.slice(),
      allies: allies.length,
      lastKey: last ? last.classKey : null,
      lastZone: last ? last.zone : null,
      lastIsSummon: last ? und(last.isSummon) : null,
      lastSummonItemId: last ? und(last.summonItemId) : null,
      lastMaxHp: last ? last.maxHp : null,
      lastDefName: last ? ((last.def && last.def.name) || null) : null,
      lastDomAttached: last ? !!(last.el && document.body.contains(last.el)) : null,
      // ★スプライト配線は CLASS_DEFS.servant.sprite と SPRITE_VARIANTS.servant の **2 箇所**
      //   要る。片方だけだと歩きと攻撃で別人になる (2026-08-06 の差し替えで踏み得た罠)。
      lastBgImage: last ? ((last.el && last.el.style.backgroundImage) || '') : null,
      defSprite: (CLASS_DEFS.servant && CLASS_DEFS.servant.sprite) || null,
      variantWalk: ((SPRITE_VARIANTS.servant || [])[0] || {}).walk || null,
      variantAttack: ((SPRITE_VARIANTS.servant || [])[0] || {}).attack || null,
      lastStatusBoxes: document.querySelectorAll('#partyStatusList .statusBox').length,
      summonSlot: (summonSlot === null || summonSlot === undefined) ? 'null' : 'set',
      joined: servantJoined,
      hp: hp, gameOver: gameOver,
      // 従者を除いた既存メンバーの HP (罠の代償を測る母集団)
      allyHps: allies.filter(a => a.classKey !== 'servant').map(a => a.hp),
      log: combatLogLines.slice(-16).map(l => l.msg),
      // ★「縛られた従者」の可視化 (2026-08-06)。装飾 DOM なので敵にも味方にも数えられない
      ...window.captiveProbe(last),
    };
  });
}
/* 縛られた従者の観測。★ev5State / ev9State が同じ物差しを共有する (別々に書くと必ずズレる)。
 *   ⚠ page.evaluate の中で評価されるので、この関数本体もページへ注入する必要がある
 *     → ev5Prepare / ev9Prepare で window.captiveProbe として生やす。 */
const CAPTIVE_PROBE_SRC = `window.captiveProbe = function (last) {
  var st = (typeof sce1CaptiveState !== 'undefined') ? sce1CaptiveState : null;
  var el = (typeof sce1CaptiveEl !== 'undefined') ? sce1CaptiveEl : null;
  var spot = (st === 'tunnel' || st === 'throne') ? sce1CaptiveSpot() : null;
  var ds = (CLASS_DEFS.servant && CLASS_DEFS.servant.displaySize) || 96;
  return {
    captiveState: st,
    captiveClass: el ? el.className : null,
    captiveDisplay: el ? el.style.display : null,
    captiveInDom: !!(el && document.body.contains(el)),
    captiveSpot: spot,
    tunnelSpot: sce1ServantSpot(),
    playerTile: { tx: Math.floor((playerX + 48) / TILE_SIZE), ty: Math.floor((playerY + 58) / TILE_SIZE) },
    lastTile: last ? { tx: Math.floor((last.x + ds / 2) / TILE_SIZE),
                       ty: Math.floor((last.y + ds / 2) / TILE_SIZE) } : null,
  };
};`;
/* 従者を取り除き「参戦前」へ戻す (分岐網羅用)。⚠ 製品コードのラッチは触らずに済ませたいが、
 *   servantJoined は 1 潜行に 1 回しか通らない設計なので、driver 側で明示的に解く。 */
async function ev5Reset(page, force) {
  await page.evaluate((f) => {
    for (let i = allies.length - 1; i >= 0; i--) {
      if (allies[i].classKey !== 'servant') continue;
      const a = allies[i];
      [a.el, a.hpWrapEl, a.nameLabelEl].forEach(e => { if (e && e.remove) e.remove(); });
      allies.splice(i, 1);
    }
    servantJoined = false;
    sceneFlags.servant_rescued = false;
    // ★縛られた従者も「まだ横穴に居る」へ戻す。救出/迂回で状態が進むので、これを戻さないと
    //   2 本目以降の枝が前の枝の姿勢 (throne / gone) を引きずり、湧き位置の測定が意味を失う。
    if (typeof sce1CaptiveState !== 'undefined') {
      sce1CaptiveState = 'tunnel';
      if (sce1CaptiveEl) { sce1CaptiveEl.className = 'sce1Captive bound'; sce1CaptiveEl.style.display = 'block'; }
    }
    summonSlot = null;
    gameOver = false;
    hp = maxHp;
    allies.forEach(a => { a.hp = a.maxHp; a.alive = true; });
    SCE1_EVENTS[1].fired = false; SCE1_EVENTS[1].declined = false;
    window.__ev5.calls.length = 0; window.__ev5.force = !!f;
    enemies.forEach(e => { e.inactive = true; });
    dialogPaused = false; skillCheckActive = false;
  }, force);
}

/* EV-5 の一連の観測。⚠ 無変異ページと変異ページの**両方**にこの同じ手順を当てる。
 *   ⚠ 実行順は状態依存: 「参戦しない枝 (Esc / 迂回)」→「無傷で救出」→「失敗でも救出」の順。
 *     先に救出してしまうと以降の枝が servantJoined ラッチに食われる。 */
async function ev5Run(page, tag) {
  const R = { tag };
  Object.assign(R, await ev5Prepare(page));

  // U1 接近 → 3択 → キャンセル (Esc 相当)
  await ev5Approach(page, 'near');
  R.dlg1 = await ev5WaitDialog(page, 5000);
  if (R.dlg1) { await ev2Click(page, -1); await ev5Settle(page); }
  R.afterCancel = await ev5State(page);

  // U2 半径内に留まる間は再プロンプトしない
  R.dlg2 = await ev5WaitDialog(page, 1600);

  // U3 半径外へ出て戻れば再プロンプトされる
  await ev5Approach(page, 'far'); await sleep(900);
  await ev5Approach(page, 'near');
  R.dlg3 = await ev5WaitDialog(page, 5000);

  // U4 選択2 (迂回する) = 判定なし・救出なし
  if (R.dlg3) { await ev2Click(page, 2); await ev5Settle(page); }
  R.afterAvoid = await ev5State(page);

  // U5 一度選んだら二度と出ない (fired ラッチ)
  await ev5Approach(page, 'far'); await sleep(900);
  await ev5Approach(page, 'near');
  R.dlg4 = await ev5WaitDialog(page, 1600);

  // U6 選択0 成功 = perception DC13 / ★無傷で救出 → 従者参戦
  await ev5Reset(page, true);
  R.dlg5 = await ev5WaitDialog(page, 5000);
  if (R.dlg5) { await ev2Click(page, 0); await ev5Settle(page); }
  R.afterPerceptOk = await ev5State(page);
  // 参戦した従者を通常の UI 経路 (updateInfo → renderPartyStatuses) にもう一度通す
  R.uiRedraw = await page.evaluate(() => {
    updateInfo('【driver】従者在籍中の再描画');
    return document.querySelectorAll('#partyStatusList .statusBox').length;
  });
  // U7 冪等 (直接二度呼びしても増えない)
  R.idem = await page.evaluate(() => {
    const before = allies.length;
    const r = joinServantAlly();
    return { ret: r, before: before, after: allies.length };
  });

  // U8 選択1 成功 = athletics DC13 / 無傷
  await ev5Reset(page, true);
  R.dlg6 = await ev5WaitDialog(page, 5000);
  if (R.dlg6) { await ev2Click(page, 1); await ev5Settle(page); }
  R.afterAthlOk = await ev5State(page);

  // U9 ★選択1 失敗 = 罠作動で HP は減るが、救出は成立する (本項目の芯)
  await ev5Reset(page, false);
  R.dlg7 = await ev5WaitDialog(page, 5000);
  if (R.dlg7) { await ev2Click(page, 1); await ev5Settle(page); }
  R.afterAthlFail = await ev5State(page);

  // U10 ★選択0 失敗 = 「すぐ助けに向かう」の失敗へ合流する (同じ結果になる)
  await ev5Reset(page, false);
  R.dlg8 = await ev5WaitDialog(page, 5000);
  if (R.dlg8) { await ev2Click(page, 0); await ev5Settle(page); }
  R.afterPerceptFail = await ev5State(page);

  /* U11 ★得意クラス(僧侶)の +2 が実際に流れることの決定論的確認。
   *   ⚠ パーティ編成は起動ごとに乱択されるので、僧侶を 1 人足して再走する
   *     (手書きモックは renderPartyStatuses が全フィールドを舐めて落ちるので createAlly を使う)。 */
  await ev5Reset(page, true);
  await page.evaluate(() => {
    const a = createAlly('cleric', playerX - 40, playerY + 40);
    a.npcName = 'テスト僧侶';
    allies.push(a);
  });
  await page.evaluate(() => { window.__ev5.calls.length = 0; });
  R.dlg9 = await ev5WaitDialog(page, 5000);
  if (R.dlg9) { await ev2Click(page, 0); await ev5Settle(page); }
  R.afterCleric = await ev5State(page);
  R.clericBonusWith = await page.evaluate(() => sceneClassBonus(["cleric"]));
  await ev5Reset(page, true);
  await page.evaluate(() => {
    const i = allies.findIndex(a => a.npcName === 'テスト僧侶');
    if (i >= 0) allies.splice(i, 1);
    SCE1_EVENTS[1].fired = true;   // 後片付け: 観測終了後にダイアログが開きっぱなしにならないよう封じる
  });
  return R;
}
// EV-5 のダイアログ待ち (ev2WaitDialog と同一実装。見出し文の取り違えを防ぐため別名で持つ)
const ev5WaitDialog = ev2WaitDialog;

/* ★EV-5 の検出器。無変異で全 true / 変異で狙ったものだけ false になるべき述語群。 */
function ev5Detectors(R) {
  const L = (R.dlg1 && R.dlg1.labels) || [];
  const cP = (R.afterPerceptOk.calls || [])[0] || null;
  const cA = (R.afterAthlOk.calls || [])[0] || null;
  const okState = R.afterPerceptOk;
  const failState = R.afterAthlFail;
  const trapLog = (st) => (st.log || []).some(m => /罠を踏んだ!\s*1d6\(/.test(m));
  const hpDropped = (st) => st.hp < R.maxHp;
  const allyHpDropped = (st) => st.allyHps.some((v, i) => v < (R.allyHpBefore[i] !== undefined ? R.allyHpBefore[i] : v));
  return {
    S1: { label: 'EV-5: 接近すると 3択+キャンセル のダイアログが出る',
          ok: !!R.dlg1 && L.length === 4, got: JSON.stringify(L) },
    S2: { label: 'EV-5: ラベルは 声の方向を調べる / すぐ助けに向かう / 敵の罠だと見て迂回する',
          ok: L[0] === '1. 声の方向を調べる' && L[1] === '2. すぐ助けに向かう'
              && L[2] === '3. 敵の罠だと見て迂回する' && L[3] === '引き返す (Esc)',
          got: JSON.stringify(L) },
    S3: { label: 'EV-5: キャンセル(Esc) では未決 (救出も参戦も起きず declined が立つ)',
          ok: R.afterCancel.flag === false && R.afterCancel.fired === false
              && R.afterCancel.declined === true && R.afterCancel.calls.length === 0
              && R.afterCancel.allies === R.alliesBefore,
          got: JSON.stringify({ flag: R.afterCancel.flag, fired: R.afterCancel.fired,
                                declined: R.afterCancel.declined, allies: R.afterCancel.allies }) },
    S4: { label: 'EV-5: 断った後は半径内に留まる限り再プロンプトしない',
          ok: R.dlg2 === null, got: R.dlg2 ? 'ダイアログが再表示された' : 'none' },
    S5: { label: '★EV-5: 選択2(確定) では SkillCheck が 1 度も呼ばれない',
          ok: R.afterAvoid.calls.length === 0, got: JSON.stringify(R.afterAvoid.calls) },
    S6: { label: '★EV-5: 選択2 では servant_rescued=false のまま・allies も増えない',
          ok: R.afterAvoid.flag === false && R.afterAvoid.allies === R.alliesBefore
              && R.afterAvoid.joined === false,
          got: 'flag=' + R.afterAvoid.flag + ' allies=' + R.afterAvoid.allies + '/' + R.alliesBefore },
    S7: { label: 'EV-5: 発火は 1 回だけ (選択済みなら半径外→内でも出ない)',
          ok: R.dlg4 === null && R.afterAvoid.fired === true,
          got: 'fired=' + R.afterAvoid.fired + ' redisplay=' + (R.dlg4 ? 'yes' : 'no') },
    S8: { label: 'EV-5: 選択0 は perception を DC13 で振る',
          ok: !!cP && cP.checkKey === 'perception' && cP.dc === 13 && okState.calls.length === 1,
          got: JSON.stringify(okState.calls) },
    S9: { label: 'EV-5: 選択1 は athletics を DC13 で振る',
          ok: !!cA && cA.checkKey === 'athletics' && cA.dc === 13 && R.afterAthlOk.calls.length === 1,
          got: JSON.stringify(R.afterAthlOk.calls) },
    S10: { label: 'EV-5: DC は動かさず 得意クラス(僧侶) は extraBonus 側に乗る',
           ok: !!cP && !!cA && cP.extraBonus === R.clericBonus && cA.extraBonus === R.clericBonus
               && (R.clericBonus === 0 || R.clericBonus === 2),
           got: 'extraBonus=' + (cP && cP.extraBonus) + '/' + (cA && cA.extraBonus)
                + ' sceneClassBonus=' + R.clericBonus + ' roster=' + JSON.stringify(R.roster) },
    S11: { label: '★EV-5: 選択0 成功で無傷のまま救出成立 (servant_rescued=true・allies +1・末尾が servant)',
           ok: okState.flag === true && okState.allies === R.alliesBefore + 1
               && okState.lastKey === 'servant' && okState.hp === R.hpBefore
               && !allyHpDropped(okState),
           got: 'flag=' + okState.flag + ' allies=' + okState.allies + '/' + R.alliesBefore
                + ' last=' + okState.lastKey + ' hp=' + okState.hp + '/' + R.hpBefore
                + ' allyHps=' + JSON.stringify(okState.allyHps) },
    S12: { label: '★EV-5: 従者は召喚枠を食わない (summonSlot が変化せず isSummon も立たない)',
           ok: R.summonSlotBefore === 'null' && okState.summonSlot === 'null'
               && okState.lastIsSummon === 'undef' && okState.lastSummonItemId === 'undef',
           got: 'summonSlot ' + R.summonSlotBefore + ' -> ' + okState.summonSlot
                + ' isSummon=' + okState.lastIsSummon + ' itemId=' + okState.lastSummonItemId },
    S13: { label: '★EV-5: 選択1 が**失敗**でも servant_rescued=true (救出は判定運で折れない)',
           ok: failState.flag === true && failState.allies === R.alliesBefore + 1
               && failState.lastKey === 'servant',
           got: 'flag=' + failState.flag + ' allies=' + failState.allies + '/' + R.alliesBefore
                + ' last=' + failState.lastKey },
    S14: { label: '★EV-5: 選択1 失敗の代償は HP のみ (既存の罠ダメージ経路 1d6 を通る)',
           ok: hpDropped(failState) && trapLog(failState) && failState.gameOver === false,
           got: 'hp=' + failState.hp + '/' + R.maxHp + ' gameOver=' + failState.gameOver
                + ' log=' + JSON.stringify((failState.log || []).filter(m => /罠/.test(m))) },
    S15: { label: '★EV-5: 選択0 の失敗は選択1 の失敗へ合流する (perception を振り→罠→救出成立)',
           ok: ((R.afterPerceptFail.calls || [])[0] || {}).checkKey === 'perception'
               && R.afterPerceptFail.flag === true
               && R.afterPerceptFail.allies === R.alliesBefore + 1
               && hpDropped(R.afterPerceptFail) && trapLog(R.afterPerceptFail),
           got: 'calls=' + JSON.stringify(R.afterPerceptFail.calls) + ' flag=' + R.afterPerceptFail.flag
                + ' allies=' + R.afterPerceptFail.allies + ' hp=' + R.afterPerceptFail.hp },
    S16: { label: 'EV-5: 従者は zone=rear の通常コンパニオンとして参戦し DOM も伴う',
           ok: okState.lastZone === 'rear' && okState.lastDomAttached === true
               && okState.lastDefName === '商人の従者' && okState.lastMaxHp === 18,
           got: 'zone=' + okState.lastZone + ' dom=' + okState.lastDomAttached
                + ' name=' + okState.lastDefName + ' maxHp=' + okState.lastMaxHp },
    S17: { label: '★EV-5: 従者在籍中に renderPartyStatuses が回り、隊列枠が 1 つ増える',
           ok: R.uiRedraw === R.alliesBefore + 2, got: 'statusBoxes=' + R.uiRedraw
                + ' (頭1 + 仲間' + (R.alliesBefore + 1) + ')' },
    S18: { label: 'EV-5: 参戦は冪等 (二度目の joinServantAlly は false で allies も増えない)',
           ok: R.idem.ret === false && R.idem.after === R.idem.before, got: JSON.stringify(R.idem) },
    S19: { label: '★EV-5: 僧侶を 1 人加えると extraBonus が 2 になる (得意クラス +2 が実際に流れる)',
           ok: R.clericBonusWith === 2 && ((R.afterCleric.calls || [])[0] || {}).extraBonus === 2,
           got: 'sceneClassBonus=' + R.clericBonusWith + ' passed=' + JSON.stringify(R.afterCleric.calls) },
    /* ★スプライト配線は CLASS_DEFS.servant.sprite と SPRITE_VARIANTS.servant の 2 箇所が要る。
     *   片方だけ直すと getSpriteSet がもう片方の旧シートを返し、歩きと攻撃で別人になる。
     *   ⚠ 「専用シートである」ことは **NPC 僧侶シートを参照していない** ことで測る
     *     (旧流用の再発を直接禁じる。ファイル名を焼き込むだけだと改名で自己失効する)。 */
    /* ── ★「縛られた従者」の可視化 (2026-08-06 実機フィードバック) ─────────────
     *   C1 は **U1 (Esc = 未決)** の観測を使う = まだどの枝も通っていない初期状態。 */
    C1: { label: '★EV-5: 潜行開始時から「縛られた従者」が横穴に見えている (装飾 DOM・bound 姿勢)',
          ok: R.afterCancel.captiveState === 'tunnel' && R.afterCancel.captiveInDom === true
              && /\bbound\b/.test(String(R.afterCancel.captiveClass))
              && !!R.afterCancel.captiveSpot
              && R.afterCancel.captiveSpot.tx === R.afterCancel.tunnelSpot.tx
              && R.afterCancel.captiveSpot.ty === R.afterCancel.tunnelSpot.ty,
          got: 'state=' + R.afterCancel.captiveState + ' class=' + R.afterCancel.captiveClass
               + ' spot=' + JSON.stringify(R.afterCancel.captiveSpot)
               + ' tunnel=' + JSON.stringify(R.afterCancel.tunnelSpot) },
    C2: { label: '★EV-5: 迂回すると姿が玉座の脇へ移る (bound → hanging・ナレの「運ばれていった」と同期)',
          ok: R.afterAvoid.captiveState === 'throne'
              && /\bhanging\b/.test(String(R.afterAvoid.captiveClass))
              && !!R.afterAvoid.captiveSpot
              && !(R.afterAvoid.captiveSpot.tx === R.afterAvoid.tunnelSpot.tx
                   && R.afterAvoid.captiveSpot.ty === R.afterAvoid.tunnelSpot.ty),
          got: 'state=' + R.afterAvoid.captiveState + ' class=' + R.afterAvoid.captiveClass
               + ' spot=' + JSON.stringify(R.afterAvoid.captiveSpot) },
    C3: { label: '★EV-5: 救出すると縛られた姿は消える (state=gone・display:none)',
          ok: okState.captiveState === 'gone' && okState.captiveDisplay === 'none',
          got: 'state=' + okState.captiveState + ' display=' + okState.captiveDisplay },
    S20: { label: '★EV-5: 従者は専用シート (servant_*) を 2 箇所とも参照し、実 DOM にも載っている',
           ok: okState.defSprite === 'assets/servant_walk.png'
               && /servant_walk\.png/.test(String(okState.variantWalk))
               && /servant_attack\.png/.test(String(okState.variantAttack))
               && /servant_walk\.png/.test(String(okState.lastBgImage))
               && !/cleric_npcmale/.test(String(okState.defSprite) + String(okState.variantWalk)
                                         + String(okState.variantAttack) + String(okState.lastBgImage)),
           got: 'def=' + okState.defSprite + ' walk=' + okState.variantWalk
                + ' attack=' + okState.variantAttack + ' dom=' + okState.lastBgImage },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 項目 4 — EV-9「玉座のグリクス」+ ボス戦への接続 の駆動
// ══════════════════════════════════════════════════════════════════════════════
/* ■ 実行順が状態依存 (ここを入れ替えると測れなくなる)
 *   ⚠ V0 (Redirect) を**最初**に置く。runGrixEvent は末尾で必ず armGrixHostageRedirect() を
 *     呼ぶので、先に選択肢を1つでも通すと「まだ仕掛かっていない状態」が二度と作れない
 *     (Object.defineProperty の付け外しを driver がやるのは、製品の不変条件を偽装することになる)。
 *   ⚠ V5 (激昂 = ボス maxHp +20%) と V3 (配下 +2) は冪等ラッチ付きなので各 1 回しか測れない。
 *   ⚠ V6 (説得成功 = 昇格) は servant_rescued を true にするので、未救出前提の測定より後に置く。
 *
 * ■ Redirect の決定論
 *   肩代わりは Math.random() < 0.5 の抽選。ページ側で Math.random を 0 / 0.6 に差し替えれば
 *   「必ず発動」「必ず素通し」を両方とも決定論で測れる (製品コードにシームを足さない)。
 *   ★ダメージは `boss.hp -= n` で与える。これは 40 箇所ある実ダメージ経路が**全て通る**
 *     唯一の合流点 (= hp への代入) そのものなので、この駆動は実戦の経路と等価。 */
async function ev9Prepare(page) {
  await page.evaluate(CAPTIVE_PROBE_SRC);   // ★ev5 と同じ物差しを EV-9 側でも使う
  return page.evaluate(() => {
    gameStarted = true; gameOver = false;
    encounterActive = false; encounterRunning = false;
    dialogPaused = false; skillCheckActive = false;
    roomChests.length = 0; traps.length = 0;
    enemies.forEach(e => { e.inactive = true; });
    hp = maxHp;
    sceneFlags.servant_rescued = false;
    SCE1_EVENTS[0].fired = true; SCE1_EVENTS[1].fired = true;   // このページは EV-9 専用 (同時発火を封じる)
    const SC = window.SkillCheck;
    window.__ev9 = { calls: [], force: true };
    window.__ev9.roomCount = function () { return sce1BossRoomEnemyIndices().length; };
    SC.resolveSkillCheck = function (checkKey, dc, party, o) {
      window.__ev9.calls.push({ checkKey: checkKey, dc: dc,
        extraBonus: (o && o.extraBonus) || 0, title: (o && o.title) || null,
        flavor: (o && o.flavor) || null });   // ★救出状況で一文が開くこと (G4c) を測る
      const ok = !!window.__ev9.force;
      return Promise.resolve({ success: ok, roll: 10, total: ok ? dc + 3 : dc - 3, dc: dc,
        bonus: 0, rep: (party && party[0]) || null, helper: null, crit: false, fumble: false });
    };
    const s = sce1GrixSpot(), r = sce1BossRoomRect();
    const bi = sce1GrixIdx();
    const boss = bi >= 0 ? enemies[bi] : null;
    const px = s.tx * TILE_SIZE + TILE_SIZE / 2, py = s.ty * TILE_SIZE + TILE_SIZE / 2;
    // ★「ボス戦が始まる前に必ず 1 回通る位置か」の実測:
    //   発火地点からボス部屋の各敵までの距離が、その敵の交戦距離 (engagePx) より遠いこと。
    const reach = sce1BossRoomEnemyIndices().map(i => {
      const e = enemies[i], sz = (e.def.displaySize || 96);
      return { type: e.type,
               d: Math.round(Math.hypot(px - (e.x + sz / 2), py - (e.y + sz / 2))),
               engage: getRange(e.def.range || 'melee').engagePx };
    });
    return {
      spot: s, room: r, radius: SCE1_EVENT_RADIUS, reach: reach,
      spotIsWall: isTileWall(s.tx, s.ty),
      spotInRoom: s.ty >= r[0] && s.ty <= r[2] && s.tx >= r[1] && s.tx <= r[3],
      spotIsEntrance: s.tx <= r[1] + 5,
      bossTx: boss ? Math.floor((boss.x + boss.def.displaySize / 2) / TILE_SIZE) : null,
      bossMaxHp0: boss ? boss.maxHp : null, bossHp0: boss ? boss.hp : null,
      roomCountBefore: window.__ev9.roomCount(), totalBefore: enemies.length,
      clericBonus: sceneClassBonus(["cleric"]), elfBonus: sceneClassBonus(["elf"]),
      roster: buildPerceptionParty().map(m => m.classKey),
      ledgerKeys: SCE1_EVENTS.map(e => e.key),
      hostageMax: SCE1_HOSTAGE_HP_MAX, chance: SCE1_REDIRECT_CHANCE,
      alliesBefore: allies.length,
      dcHostage: SCE1_GRIX_DC_HOSTAGE, dcRescued: SCE1_GRIX_DC_RESCUED, dcDeceive: SCE1_GRIX_DECEIVE_DC,
    };
  });
}
async function ev9Approach(page, where) {
  await page.evaluate((w) => {
    const s = sce1GrixSpot();
    const tx = (w === 'far') ? s.tx - 7 : s.tx;   // 7タイル西 = 672px ≫ 240
    playerX = tx * TILE_SIZE + TILE_SIZE / 2 - 48;
    playerY = s.ty * TILE_SIZE + TILE_SIZE / 2 - 58;
  }, where);
}
async function ev9Settle(page) {
  for (let k = 0; k < 50; k++) {
    const done = await page.evaluate(() => {
      const d = document.getElementById('choiceDialog');
      return !(d && d.classList.contains('show')) && !skillCheckActive && !SCE1_EVENTS[2].busy;
    });
    if (done) {
      await sleep(120);
      // ⚠ 配下 +2 は inactive=false / state="chase" で湧く (仕様通り)。放置すると 30ms の
      //   moveEnemies で寄ってきて encounterActive が立ち、以降の観測が全部壊れる → 盤面を凍らせ直す。
      await page.evaluate(() => { enemies.forEach(e => { e.inactive = true; }); });
      return true;
    }
    await sleep(80);
  }
  return false;
}
async function ev9State(page) {
  return page.evaluate(() => {
    const bi = sce1GrixIdx();
    const boss = bi >= 0 ? enemies[bi] : null;
    return {
      outcome: sce1GrixOutcome,
      fired: SCE1_EVENTS[2].fired, declined: SCE1_EVENTS[2].declined,
      calls: window.__ev9.calls.slice(),
      flag: sceneFlags.servant_rescued,
      allies: allies.length,
      lastKey: allies.length ? allies[allies.length - 1].classKey : null,
      bossHp: boss ? boss.hp : null, bossMaxHp: boss ? boss.maxHp : null,
      roomCount: window.__ev9.roomCount(), total: enemies.length,
      pendingSurprise: sce1PendingSurprise,
      armed: hostageRedirectArmed, hostageHp: hostageServantHp, redirects: hostageRedirectCount,
      log: combatLogLines.slice(-12).map(l => l.msg),
      ...window.captiveProbe(allies.length ? allies[allies.length - 1] : null),
    };
  });
}
async function ev9Rearm(page, force) {
  await page.evaluate((f) => {
    SCE1_EVENTS[2].fired = false; SCE1_EVENTS[2].declined = false;
    window.__ev9.calls.length = 0; window.__ev9.force = !!f;
    sce1GrixOutcome = null;
    /* ★縛られた従者を「まだ横穴に居る」へ戻す。
     *   ⚠⚠ これが無いと C4/C5 が測れない: V0 (Redirect の合成シーケンス) は途中で
     *      **人質を削り切る** ので、製品コードの narrateHostageRedirect が正しく
     *      hideSce1Captive() を呼び、以降の全枝で state が "gone" のまま固まる。
     *      「人質が死んだら姿も消える」は仕様どおりなので、壊れているのは driver の順序の方。 */
    if (typeof sce1CaptiveState !== 'undefined') {
      sce1CaptiveState = 'tunnel';
      if (sce1CaptiveEl) { sce1CaptiveEl.className = 'sce1Captive bound'; sce1CaptiveEl.style.display = 'block'; }
    }
    enemies.forEach(e => { e.inactive = true; });
    dialogPaused = false; skillCheckActive = false;
  }, force);
}
// ラベル文字列でボタンを押す。★救出済ダイアログでは「選択肢が消えていないか」を測りたいので
//   添字ではなく文字列で押す (消えていれば false が返り、その事実自体が検出器になる)。
async function ev9ClickLabel(page, needle) {
  return page.evaluate((n) => {
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    const b = btns.filter(x => x.textContent.indexOf(n) >= 0)[0];
    if (b) { b.click(); return true; }
    return false;
  }, needle);
}
/* 候補0 (説得) を **どちらの文面でも** 押す。
 * ⚠ 救出状況でラベルが開くようになった (2026-08-06) ので単一文字列では押せない。しかも
 *   変異N25 はラベルを未救出のまま固定するため、片方の文面しか受け付けないと**変異側で
 *   押し損ね**、以降の V8/V9 まで巻き添えで壊れて N25 が外科的でなくなる。
 * ⚠ 「選択肢が消えていないか」はこのクリックではなく **G4 が labels 配列で**測っている
 *   (押せた/押せないより、実際に並んでいるラベル列を見る方が直接的)。 */
async function ev9ClickPersuade(page) {
  return page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#choiceDialog .choiceButtons button'));
    const b = btns.filter(x => /従者の解放を要求する|切り札は無いと突きつける/.test(x.textContent))[0];
    if (b) { b.click(); return true; }
    return false;
  });
}

async function ev9Run(page, tag) {
  const G = { tag };
  Object.assign(G, await ev9Prepare(page));

  /* ── V0 ★Redirect (人質の従者を盾にする) の決定論シーケンス ──────────────
   *   (a) 救出済で arm → 仕掛からない            (b) 未救出にして arm → 仕掛かる
   *   (c) 仕掛かった後で救出済に戻す → 発動しない (d) 未救出 + rand=0 → 必ず肩代わり
   *   (e) rand=0.6 → 抽選外れで素通し            (f) 人質を削り切る
   *   (g) 人質死亡後 → 二度と肩代わりしない
   *   ★(a)/(c) は「仕掛けるか」と「発動するか」の**別々のガード**を独立に測っている。 */
  G.redirect = await page.evaluate(() => {
    const bi = sce1GrixIdx();
    if (bi < 0) return { err: 'boss not found' };
    const boss = enemies[bi];
    const orig = Math.random;
    const R = { chance: SCE1_REDIRECT_CHANCE };
    const hit = (n) => { boss.hp = boss.hp - n; };   // ★実ダメージ経路と同じ「hp への代入」
    let h0;
    sceneFlags.servant_rescued = true;
    R.armRescued = armGrixHostageRedirect();
    Math.random = () => 0;
    h0 = boss.hp; hit(7);
    R.a = { hpDelta: h0 - boss.hp, redirects: hostageRedirectCount,
            hostage: hostageServantHp, armed: hostageRedirectArmed };
    boss.hp = h0;                                    // 増加は素通し (回復扱い) で元へ戻る
    sceneFlags.servant_rescued = false;
    R.armHostage = armGrixHostageRedirect();
    R.armedAfter = hostageRedirectArmed;
    sceneFlags.servant_rescued = true;               // 仕掛かった状態のまま救出済へ
    h0 = boss.hp; hit(7);
    R.c = { hpDelta: h0 - boss.hp, redirects: hostageRedirectCount, hostage: hostageServantHp };
    boss.hp = h0;
    sceneFlags.servant_rescued = false;
    h0 = boss.hp; const hs0 = hostageServantHp; hit(7);
    R.d = { hpDelta: h0 - boss.hp, hostDelta: hs0 - hostageServantHp,
            redirects: hostageRedirectCount, hostage: hostageServantHp };
    Math.random = () => 0.6;                         // 0.6 >= 0.5 = 抽選に外れる
    h0 = boss.hp; const hs1 = hostageServantHp; hit(7);
    R.e = { hpDelta: h0 - boss.hp, hostDelta: hs1 - hostageServantHp, redirects: hostageRedirectCount };
    Math.random = () => 0;
    boss.hp = h0;
    let guard = 0;
    while (hostageServantHp > 0 && guard++ < 20) hit(6);
    R.f = { hostage: hostageServantHp, redirects: hostageRedirectCount, hits: guard };
    const rc = hostageRedirectCount;
    h0 = boss.hp; hit(7);
    R.g = { hpDelta: h0 - boss.hp, redirectsDelta: hostageRedirectCount - rc };
    Math.random = orig;
    boss.hp = boss.maxHp;                            // 後段のために全快へ戻す (増加=素通し)
    return R;
  });

  // V1 接近 → 3択 → Esc (★突撃扱い)
  await ev9Approach(page, 'near');
  G.dlg1 = await ev2WaitDialog(page, 5000);
  if (G.dlg1) { await ev2Click(page, -1); await ev9Settle(page); }
  G.afterEsc = await ev9State(page);

  // V2 選択2 (突撃) = 判定なし
  await ev9Rearm(page, true);
  G.dlg2 = await ev2WaitDialog(page, 5000);
  if (G.dlg2) { await ev2Click(page, 2); await ev9Settle(page); }
  G.afterCharge = await ev9State(page);

  // V3 選択1 失敗 = deception DC17 → 配下 +2
  await ev9Rearm(page, false);
  G.dlg3 = await ev2WaitDialog(page, 5000);
  if (G.dlg3) { await ev2Click(page, 1); await ev9Settle(page); }
  G.afterDeceiveFail = await ev9State(page);
  G.adds = await page.evaluate((n0) => {
    const r = sce1BossRoomRect(), out = [];
    for (let i = n0; i < enemies.length; i++) {
      const e = enemies[i], s = e.def.displaySize;
      const tx = Math.floor((e.x + s / 2) / TILE_SIZE), ty = Math.floor((e.y + s / 2) / TILE_SIZE);
      out.push({ type: e.type, tx: tx, ty: ty, wall: isTileWall(tx, ty),
                 dom: !!document.getElementById('enemy' + i),
                 inRoom: ty >= r[0] && ty <= r[2] && tx >= r[1] && tx <= r[3] });
    }
    return out;
  }, G.totalBefore);

  // V4 選択1 成功 = deception DC17 → 先制ラウンドの予約 → consumeSce1Surprise で払い出し
  await ev9Rearm(page, true);
  G.dlg4 = await ev2WaitDialog(page, 5000);
  if (G.dlg4) { await ev2Click(page, 1); await ev9Settle(page); }
  G.afterDeceiveOk = await ev9State(page);
  G.surprise = await page.evaluate(() => {
    const idxs = sce1BossRoomEnemyIndices();
    idxs.forEach(i => { enemies[i].stunned = 0; });
    encounterEnemyIndices = idxs.slice();
    const bi = sce1GrixIdx();
    const n = consumeSce1Surprise();
    const out = { n: n, targets: idxs.length, after: idxs.map(i => enemies[i].stunned),
                  pendingAfter: sce1PendingSurprise,
                  bossIncluded: idxs.indexOf(bi) >= 0,
                  bossStunned: bi >= 0 ? enemies[bi].stunned : null };
    out.again = consumeSce1Surprise();   // 予約は 1 回で消費される
    encounterEnemyIndices = [];
    idxs.forEach(i => { enemies[i].stunned = 0; });
    return out;
  });
  /* V4b ★「新機構を作っていない」の実測: 第7弾「隠密の接近」を単独で駆動し、
   *      EV-9 と同じ付与点 (applySurpriseStun) を通ることを見る。変異N14 は両方を同時に殺す。 */
  G.stealthShare = await page.evaluate(async () => {
    const a = createAlly('rogue', playerX - 40, playerY + 40);   // stealth 習熟の在籍を保証
    a.npcName = 'テスト盗賊'; allies.push(a);
    const idxs = sce1BossRoomEnemyIndices().filter(i => !(enemies[i].def && enemies[i].def.isBoss));
    idxs.forEach(i => { enemies[i].stunned = 0; });
    encounterEnemyIndices = idxs.slice();
    const SC = window.SkillCheck, keep = SC.resolveSkillCheck;
    SC.resolveSkillCheck = (k, dc, party) => Promise.resolve({ success: true, roll: 18, total: dc + 5,
      dc: dc, bonus: 0, rep: (party && party[0]) || null, helper: null, crit: false, fumble: false });
    let ok = false;
    try { ok = await tryStealthSurprise(); } catch (e) { ok = 'ERR:' + e.message; }
    const after = idxs.map(i => enemies[i].stunned);
    SC.resolveSkillCheck = keep;
    encounterEnemyIndices = [];
    idxs.forEach(i => { enemies[i].stunned = 0; });
    const j = allies.findIndex(x => x.npcName === 'テスト盗賊');
    if (j >= 0) allies.splice(j, 1);
    return { ok: ok, targets: idxs.length, after: after };
  });

  // V5 選択0 失敗 (未救出 DC15) → ボスの初期 HP +20%
  await ev9Rearm(page, false);
  G.dlg5 = await ev2WaitDialog(page, 5000);
  if (G.dlg5) { await ev2Click(page, 0); await ev9Settle(page); }
  G.afterPersuadeFail = await ev9State(page);

  // V6 選択0 成功 (未救出 DC15) → rescueServant で昇格 + 従者参戦
  await ev9Rearm(page, true);
  // ★救出の**前**に吊るされていた座標を控える (救出後は state=gone で captiveSpot が null になる)。
  G.throneSpotAtRescue = await page.evaluate(() => sce1ThroneCaptiveSpot());
  G.dlg6 = await ev2WaitDialog(page, 5000);
  if (G.dlg6) { await ev2Click(page, 0); await ev9Settle(page); }
  G.afterPersuadeOk = await ev9State(page);

  // V7 救出済の見出し / DC13 / ★選択肢は 1 つも消えない
  await ev9Rearm(page, true);
  await page.evaluate(() => { sceneFlags.servant_rescued = true; });   // 変異N8 の影響を受けず直接立てる
  G.dlg7 = await ev2WaitDialog(page, 5000);
  G.clicked7 = G.dlg7 ? await ev9ClickPersuade(page) : false;
  if (G.clicked7) await ev9Settle(page);
  G.afterRescuedPersuade = await ev9State(page);

  // V8 救出済でも「積荷を渡すふりをする」は DC17 のまま (救出状況で動くのは説得だけ)
  await ev9Rearm(page, true);
  G.dlg8 = await ev2WaitDialog(page, 5000);
  G.clicked8 = G.dlg8 ? await ev9ClickLabel(page, '積荷を渡すふりをする') : false;
  if (G.clicked8) await ev9Settle(page);
  G.afterRescuedDeceive = await ev9State(page);

  // V9 エピローグ 3 分岐 (★「死亡」は独立変数を持たず人質 HP から導出される)
  G.epilogue = await page.evaluate(() => {
    const save = { f: sceneFlags.servant_rescued, h: hostageServantHp };
    const out = {};
    sceneFlags.servant_rescued = true;  hostageServantHp = 0;  out.rescued = sce1EpilogueLine();
    sceneFlags.servant_rescued = false; hostageServantHp = SCE1_HOSTAGE_HP_MAX; out.alive = sce1EpilogueLine();
    sceneFlags.servant_rescued = false; hostageServantHp = 0;  out.dead = sce1EpilogueLine();
    sceneFlags.servant_rescued = save.f; hostageServantHp = save.h;
    return out;
  });
  // V10 ★エピローグがリザルト画面に実際に描かれる (関数が在るだけでは配線の証明にならない)
  //     ⚠ showResult は localStorage / sessionStorage を書き、オーバーレイを出す = このページの最終操作。
  G.resultHtml = await page.evaluate(() => {
    sceneFlags.servant_rescued = false; hostageServantHp = 0;
    resultShown = false;
    try { showResult(true); } catch (e) { return 'ERR:' + ((e && e.message) || e); }
    const el = document.getElementById('resultReward');
    return el ? el.innerHTML : '(no element)';
  });
  return G;
}

/* ★EV-9 の検出器。無変異で全 true / 変異で狙ったものだけ false になるべき述語群。 */
function ev9Detectors(G) {
  const L1 = (G.dlg1 && G.dlg1.labels) || [];
  const L7 = (G.dlg7 && G.dlg7.labels) || [];
  const first = (st) => ((st && st.calls) || [])[0] || null;
  const cDF = first(G.afterDeceiveFail), cDO = first(G.afterDeceiveOk);
  const cPF = first(G.afterPersuadeFail), cPO = first(G.afterPersuadeOk);
  const cR = first(G.afterRescuedPersuade), cRD = first(G.afterRescuedDeceive);
  const R = G.redirect || {};
  const adds = G.adds || [];
  const SU = G.surprise || {};
  const SS = G.stealthShare || {};
  const EP = G.epilogue || {};
  return {
    G1: { label: 'EV-9: ボス部屋の入口で 3択+キャンセル のダイアログが出る',
          ok: !!G.dlg1 && L1.length === 4, got: JSON.stringify(L1) },
    G2: { label: 'EV-9: ラベルは 従者の解放を要求する / 積荷を渡すふりをする / 問答無用で突撃する',
          ok: L1[0] === '1. 従者の解放を要求する' && L1[1] === '2. 積荷を渡すふりをする'
              && L1[2] === '3. 問答無用で突撃する' && L1[3] === '無言で踏み込む (Esc)',
          got: JSON.stringify(L1) },
    G3: { label: 'EV-9: 未救出の見出しは「柱に縛りつけられた人影」',
          ok: !!G.dlg1 && G.dlg1.msg.indexOf('柱に縛りつけられた人影') >= 0, got: (G.dlg1 || {}).msg },
    /* ⚠ G4 は「選択肢が**消えていない**こと」だけを見る (§4.1 原則)。文面が開くかは G4b/G4c の担当。
     *   以前は eq(L7, L1) = 全ラベル完全一致で測っていたが、それは原則より強すぎる assert で、
     *   「救出済なのに『従者の解放を要求する』のまま」という実機の破綻を**構造的に固定していた**。
     *   よって候補1/2/Esc の同一性と件数だけを見る (候補0 は開いてよい = 開くべき)。 */
    G4: { label: '★EV-9: 救出済でも選択肢は 1 つも消えない (件数と候補1/2/Esc が不変・§4.1 原則)',
          ok: !!G.dlg7 && G.dlg7.msg.indexOf('空の縄') >= 0
              && L7.length === 4 && L1.length === 4
              && L7[1] === L1[1] && L7[2] === L1[2] && L7[3] === L1[3],
          got: 'msg=' + ((G.dlg7 || {}).msg) + ' labels=' + JSON.stringify(L7) },
    G4b: { label: '★EV-9: 救出済では候補0 の**ラベル**が開く (もう居ない人質の解放を要求しない)',
           ok: L1[0] === '1. 従者の解放を要求する' && L7[0] === '1. 切り札は無いと突きつける',
           got: '未救出=' + L1[0] + ' / 救出済=' + L7[0] },
    G4c: { label: '★EV-9: 救出済では判定パネルの**一文**も開く (「柱に縛りつけられた男」を指さない)',
           ok: !!cPO && !!cR && typeof cPO.flavor === 'string' && typeof cR.flavor === 'string'
               && cPO.flavor !== cR.flavor
               && cPO.flavor.indexOf('柱に縛りつけられた男') >= 0
               && cR.flavor.indexOf('空になった縄') >= 0,
           got: '未救出=' + (cPO && cPO.flavor) + ' / 救出済=' + (cR && cR.flavor) },
    G5: { label: '★EV-9: 説得の DC は 未救出15 / 救出済13、欺瞞は救出状況に依らず 17',
          ok: !!cPO && cPO.checkKey === 'persuasion' && cPO.dc === 15
              && !!cR && cR.checkKey === 'persuasion' && cR.dc === 13
              && !!cDO && cDO.checkKey === 'deception' && cDO.dc === 17
              && !!cRD && cRD.checkKey === 'deception' && cRD.dc === 17,
          got: '未救出説得=' + JSON.stringify(cPO) + ' 救出済説得=' + JSON.stringify(cR)
               + ' 未救出欺瞞dc=' + (cDO && cDO.dc) + ' 救出済欺瞞dc=' + (cRD && cRD.dc) },
    G6: { label: '★EV-9: 選択2(確定) では SkillCheck が 1 度も呼ばれない',
          ok: G.afterCharge.calls.length === 0 && G.afterCharge.outcome === 'charge',
          got: 'calls=' + JSON.stringify(G.afterCharge.calls) + ' outcome=' + G.afterCharge.outcome },
    G7: { label: '★EV-9: Esc は「何もしない」ではなく突撃扱い (declined を立てず fired=true)',
          ok: G.afterEsc.outcome === 'charge_esc' && G.afterEsc.fired === true
              && G.afterEsc.declined === false && G.afterEsc.calls.length === 0,
          got: 'outcome=' + G.afterEsc.outcome + ' fired=' + G.afterEsc.fired
               + ' declined=' + G.afterEsc.declined + ' calls=' + G.afterEsc.calls.length },
    G8: { label: '★EV-9: 選択0 成功で servant_rescued が true へ昇格し従者が参戦する',
          ok: G.afterPersuadeFail.flag === false && G.afterPersuadeOk.flag === true
              && G.afterPersuadeOk.outcome === 'persuade_ok'
              && G.afterPersuadeOk.allies === G.afterPersuadeFail.allies + 1
              && G.afterPersuadeOk.lastKey === 'servant',
          got: 'flag ' + G.afterPersuadeFail.flag + ' -> ' + G.afterPersuadeOk.flag
               + ' allies ' + G.afterPersuadeFail.allies + ' -> ' + G.afterPersuadeOk.allies
               + ' last=' + G.afterPersuadeOk.lastKey },
    G9: { label: '★EV-9: 選択0 失敗でボスの初期 HP が +20% される (hp も maxHp も上がる)',
          ok: G.afterPersuadeFail.bossMaxHp === Math.round(G.bossMaxHp0 * 1.2)
              && G.afterPersuadeFail.bossMaxHp > G.bossMaxHp0
              && G.afterPersuadeFail.bossHp === G.afterPersuadeFail.bossMaxHp
              && G.afterPersuadeFail.outcome === 'persuade_fail',
          got: 'maxHp ' + G.bossMaxHp0 + ' -> ' + G.afterPersuadeFail.bossMaxHp
               + ' hp=' + G.afterPersuadeFail.bossHp + ' outcome=' + G.afterPersuadeFail.outcome },
    G10: { label: '★EV-9: 選択1 成功で先制ラウンド (グリクス本人を含め stunned=1・予約は 1 回で消費)',
           ok: G.afterDeceiveOk.pendingSurprise === true && SU.targets >= 3
               && SU.n === SU.targets && SU.after.every(v => v === 1)
               && SU.bossIncluded === true && SU.bossStunned === 1
               && SU.pendingAfter === false && SU.again === 0,
           got: JSON.stringify(SU) },
    G10b: { label: '★EV-9 は新機構を作っていない: 第7弾「隠密の接近」も同じ付与点を通る',
            ok: SS.ok === true && SS.targets >= 1 && SS.after.every(v => v === 1),
            got: JSON.stringify(SS) },
    G11: { label: '★EV-9: 選択1 失敗でゴブリン配下が +2 (ボス部屋の非壁タイル・DOM 付き)',
           ok: G.afterDeceiveFail.roomCount - G.roomCountBefore === 2
               && adds.length === 2 && adds.every(a => !a.wall && a.inRoom && a.dom)
               && new Set(adds.map(a => a.tx + ',' + a.ty)).size === adds.length
               && G.afterDeceiveFail.outcome === 'deceive_fail',
           got: G.roomCountBefore + ' -> ' + G.afterDeceiveFail.roomCount + ' ' + JSON.stringify(adds) },
    G12: { label: '★Redirect: 未救出なら発動しうる (ボス HP は 1 も減らず人質が肩代わりする)',
           ok: R.d && R.d.hpDelta === 0 && R.d.hostDelta === 7 && R.d.redirects === 1,
           got: JSON.stringify(R.d) },
    G13a: { label: '★Redirect: 救出済なら仕掛けない (arm=false・ボス HP は普通に減る)',
            ok: R.armRescued === false && R.a && R.a.armed === false
                && R.a.hpDelta === 7 && R.a.redirects === 0 && R.a.hostage === G.hostageMax,
            got: 'arm=' + R.armRescued + ' ' + JSON.stringify(R.a) },
    G13b: { label: '★Redirect: 仕掛かった後でも救出済なら 1 回も発動しない',
            ok: R.armHostage === true && R.c && R.c.hpDelta === 7 && R.c.redirects === 0,
            got: 'arm=' + R.armHostage + ' ' + JSON.stringify(R.c) },
    G14: { label: '★Redirect: 人質が死んだら以降は発動しない (ダメージがボスへ通る)',
           ok: R.f && R.f.hostage === 0 && R.g && R.g.hpDelta === 7 && R.g.redirectsDelta === 0,
           got: 'f=' + JSON.stringify(R.f) + ' g=' + JSON.stringify(R.g) },
    /* ⚠ G15 は「肩代わりしない側」の検出器なので、確率定数そのものは条件に入れない
     *   (入れると変異N12 で G12 と一緒に落ち、"発動する/しない" が独立に測れなくなる)。
     *   定数値そのものは (9i) が別途見ている。 */
    G15: { label: 'Redirect: 抽選は確率 (rand=0.6 では肩代わりせずボスへ通る)',
           ok: !!R.e && R.e.hpDelta === 7 && R.e.hostDelta === 0,
           got: 'chance=' + R.chance + ' ' + JSON.stringify(R.e) },
    G16: { label: '★エピローグ 3 分岐が出し分けられる (救出 / 人質生存 / 人質死亡)',
           ok: typeof EP.rescued === 'string' && typeof EP.alive === 'string' && typeof EP.dead === 'string'
               && EP.rescued !== EP.alive && EP.alive !== EP.dead && EP.rescued !== EP.dead
               && EP.rescued.indexOf('ボルダック') >= 0 && EP.dead.indexOf('ボルダック') >= 0
               && EP.dead.indexOf('息絶え') >= 0,
           got: JSON.stringify(EP) },
    G17: { label: '★エピローグがリザルト画面 (VICTORY) に実際に描かれる',
           ok: typeof G.resultHtml === 'string' && G.resultHtml.indexOf('息絶え') >= 0,
           got: String(G.resultHtml).slice(-160) },
    /* ★救出済の説得成功は rescueServant を通らない (通ると「助けた従者をもう一度助ける」)。
     *   代わりに護衛が 1 体だけ戦わずに降りる。**撃破ではない**ので:
     *     ・ボスの HP は 1 も動かない (直前 V6 の値と一致)
     *     ・従者が二重参戦しない (allies が増えない)
     *   ⚠ 直前の V6 (未救出の説得成功) を「before」として使う = 部屋の敵数を動かさない操作。 */
    /* ── ★「縛られた従者」の可視化 (EV-9 側) ─────────────────────────────────
     *   ⚠ このページは EV-5 を fired=true で封じてある = **横穴に一度も近づかない道**。
     *     それでも玉座で柱に縛られていなければ「柱に縛りつけられた人影」の見出しと矛盾する。 */
    C4: { label: '★EV-9: 横穴に近づかずボス部屋へ直行しても、姿は玉座の脇へ移っている',
          ok: G.afterCharge.captiveState === 'throne'
              && /\bhanging\b/.test(String(G.afterCharge.captiveClass))
              && !!G.afterCharge.captiveSpot,
          got: 'state=' + G.afterCharge.captiveState + ' class=' + G.afterCharge.captiveClass
               + ' spot=' + JSON.stringify(G.afterCharge.captiveSpot) },
    /* ★救出された従者は「縛られていた場所」から湧く = 自分の足でパーティまで走ってくる。
     *   ⚠ 湧いた直後から仲間追従で動き出すので、タイル一致ではなく **±1 タイルの許容**で見る。
     *   ⚠ 「プレイヤーの真横に湧いていない」ことを**距離で**も測る (許容だけだと素通りする)。 */
    C5: { label: '★EV-9: 救出された従者は縛られていた場所 (玉座の脇) に湧く (真横に瞬間発生しない)',
          ok: !!G.afterPersuadeOk.lastTile && !!G.throneSpotAtRescue
              && Math.abs(G.afterPersuadeOk.lastTile.tx - G.throneSpotAtRescue.tx) <= 1
              && Math.abs(G.afterPersuadeOk.lastTile.ty - G.throneSpotAtRescue.ty) <= 1
              && Math.max(
                   Math.abs(G.afterPersuadeOk.lastTile.tx - G.afterPersuadeOk.playerTile.tx),
                   Math.abs(G.afterPersuadeOk.lastTile.ty - G.afterPersuadeOk.playerTile.ty)) >= 4,
          got: 'servant=' + JSON.stringify(G.afterPersuadeOk.lastTile)
               + ' throne=' + JSON.stringify(G.throneSpotAtRescue)
               + ' player=' + JSON.stringify(G.afterPersuadeOk.playerTile) },
    G18: { label: '★EV-9: 救出済の説得成功は「再解放」ではなく護衛が 1 体だけ戦わずに減る',
           ok: G.afterRescuedPersuade.outcome === 'persuade_ok_rescued'
               && G.afterPersuadeOk.roomCount - G.afterRescuedPersuade.roomCount === 1
               && G.afterRescuedPersuade.allies === G.afterPersuadeOk.allies
               && G.afterRescuedPersuade.bossMaxHp === G.afterPersuadeOk.bossMaxHp
               && G.afterRescuedPersuade.bossHp === G.afterPersuadeOk.bossHp,
           got: 'outcome=' + G.afterRescuedPersuade.outcome
                + ' room ' + G.afterPersuadeOk.roomCount + ' -> ' + G.afterRescuedPersuade.roomCount
                + ' allies ' + G.afterPersuadeOk.allies + ' -> ' + G.afterRescuedPersuade.allies
                + ' bossHp ' + G.afterPersuadeOk.bossHp + ' -> ' + G.afterRescuedPersuade.bossHp },
  };
}

const GEN_QUEST = {
  title: '掲示板の依頼 — 生成クエスト',
  flavor: '生成クエストは scenarioId が別 ID になる。',
  spawns: [['goblin', 27, 13]],
  clearXp: 400, trapCount: 0, hiddenChestCount: 0, perceptionDC: 14,
  themeId: 'goblin-mine', questLevel: 1, tierKey: 'T1',
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const srvClean = await startServer(PORT, false);
  const srvMut = await startServer(PORT_MUT, true);
  console.log('[drv] serving ' + ROOT + ' @ :' + PORT + ' (無変異) / :' + PORT_MUT + ' (★変異)');

  // ── M1: 変異が本当に配信に乗ったかを HTTP で実測 (空振りしたまま PASS を防ぐ) ──
  const fetchText = (port) => new Promise((res, rej) => {
    http.get({ host: 'localhost', port, path: '/index.html' }, r => {
      let b = ''; r.setEncoding('utf8'); r.on('data', d => b += d); r.on('end', () => res(b));
    }).on('error', rej);
  });
  const [srcClean, srcMut] = await Promise.all([fetchText(PORT), fetchText(PORT_MUT)]);
  const m1 = MUTATIONS.map(([from, to], i) => ({
    i: i + 1,
    cleanHasFrom: srcClean.indexOf(from) >= 0, cleanHasTo: srcClean.indexOf(to) >= 0,
    mutHasFrom: srcMut.indexOf(from) >= 0, mutHasTo: srcMut.indexOf(to) >= 0,
  }));
  m1.forEach(x => check('(M1) 変異 N' + x.i + ' が :' + PORT_MUT + ' の配信にだけ実際に乗った',
    x.cleanHasFrom && !x.cleanHasTo && !x.mutHasFrom && x.mutHasTo,
    'clean{from:' + x.cleanHasFrom + ',to:' + x.cleanHasTo + '} mut{from:' + x.mutHasFrom + ',to:' + x.mutHasTo + '}'));
  check('(M1) 無変異側と変異側の index.html は別物', srcClean !== srcMut,
    'clean=' + srcClean.length + 'B mut=' + srcMut.length + 'B');
  mark('mutation injection verified (memory-only, no disk write)');

  const profile = makeProfile('df_sce1_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
  });

  const allPageErrors = [];
  async function boot(port, query, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    page.on('pageerror', e => allPageErrors.push('[:' + port + query + '] ' + e.message));
    const gen = opts.generated ? JSON.stringify(GEN_QUEST) : null;
    await page.evaluateOnNewDocument((genJson) => {
      try {
        sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
        if (genJson) sessionStorage.setItem('dragonfighters.generatedScenario', genJson);
        else sessionStorage.removeItem('dragonfighters.generatedScenario');
      } catch (e) {}
    }, gen);
    await page.goto('http://localhost:' + port + '/index.html' + query,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      try {
        return typeof sceneFlags === 'object' && typeof isGoblinMineScenario === 'function'
            && typeof sceneClassBonus === 'function' && typeof buildPerceptionParty === 'function';
      } catch (e) { return false; }
    }, { timeout: 20000 });
    // 論理テストに描画は要らない。rAF を凍結してライブ game loop の割り込みを断つ。
    await page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
    return { page };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 本体 (無変異 :PORT / ?diag=1)
  // ════════════════════════════════════════════════════════════════════════════
  const cur = await boot(PORT, '?diag=1');
  const P = await probe(cur.page);
  if (P.err) console.error('[drv] probe 例外: ' + P.err);
  mark('clean page booted (?diag=1)  roster=' + JSON.stringify(P.roster));

  // §1 定義
  check('(1a) sceneFlags が定義済み (object)', P.typeofSceneFlags === 'object', P.typeofSceneFlags);
  check('(1b) isGoblinMineScenario が定義済み (function)', P.typeofIsGM === 'function', P.typeofIsGM);
  check('(1c) sceneClassBonus が定義済み (function)', P.typeofBonus === 'function', P.typeofBonus);
  check('(1d) probe が例外を出していない', P.err === null, String(P.err));
  // 母集団ガード: パーティが空だと §5 は何も測っていないのと同じ
  check('(1e) 母集団ガード: buildPerceptionParty が 1 名以上を返す',
    Array.isArray(P.roster) && P.roster.length >= 1, JSON.stringify(P.roster));

  // §2 初期値 (検出器 D1-D3)
  const DC = detectors(P);
  ['D1', 'D2', 'D3'].forEach(k => check('(2) ' + DC[k].label, DC[k].ok, DC[k].got));

  // §3 非永続 (sessionStorage に載せない)
  check('(3a) sessionStorage に sceneFlags 由来のキーが無い',
    !P.ssKeys.some(k => /sceneFlags|mine_alerted|servant_rescued/i.test(k)), JSON.stringify(P.ssKeys));
  const persisted = await cur.page.evaluate(() => {
    sceneFlags.mine_alerted = true; sceneFlags.servant_rescued = true;
    return { set: [sceneFlags.mine_alerted, sceneFlags.servant_rescued],
             ss: Object.keys(sessionStorage).filter(k => /scene(?!ry)/i.test(k)) };
  });
  check('(3b) 実行時に立てられる (mine/servant とも true に出来る)',
    eq(persisted.set, [true, true]), JSON.stringify(persisted.set));
  check('(3c) 立てても sessionStorage に書き出されない', persisted.ss.length === 0, JSON.stringify(persisted.ss));
  await cur.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await cur.page.waitForFunction(() => { try { return typeof sceneFlags === 'object'; } catch (e) { return false; } },
    { timeout: 20000 });
  const afterReload = await cur.page.evaluate(() => ({ m: sceneFlags.mine_alerted, s: sceneFlags.servant_rescued }));
  check('(3d) リロードで初期値へ戻る (潜行内で完結・次の潜行へ持ち越さない)',
    afterReload.m === false && afterReload.s === false, JSON.stringify(afterReload));
  await cur.page.evaluate(() => { window.requestAnimationFrame = function () { return 0; }; });
  mark('non-persistence verified');

  // §4 シナリオゲート
  check('(4a) ' + DC.D4.label, DC.D4.ok, DC.D4.got);
  const gen = await boot(PORT, '?diag=1', { generated: true });
  const PG = await probe(gen.page);
  check('(4b) 生成クエストでは scenarioId が別 ID', PG.scenarioId === 'generated-quest', PG.scenarioId);
  check('(4c) 生成クエストでは isGoblinMineScenario() が false',
    PG.isGM === false, PG.scenarioId + ' -> ' + PG.isGM);
  check('(4d) 母集団ガード: 生成クエスト側でも土台自体は生きている',
    PG.typeofSceneFlags === 'object' && PG.err === null && eq(PG.flagKeys, ['mine_alerted', 'servant_rescued']),
    'flags=' + JSON.stringify(PG.flagKeys) + ' err=' + PG.err);
  // ★縛られた従者は goblin-mine 専用。生成クエストでは DOM を **1 要素も作らない**
  //   (「見えていない」ではなく「作られていない」で測る = 隠しただけの実装を落とす)。
  const genCaptive = await gen.page.evaluate(() => ({
    state: (typeof sce1CaptiveState !== 'undefined') ? sce1CaptiveState : '(absent)',
    el: (typeof sce1CaptiveEl !== 'undefined' && sce1CaptiveEl) ? 'created' : 'null',
    domCount: document.querySelectorAll('.sce1Captive').length,
  }));
  check('(4e) ★生成クエストでは「縛られた従者」の DOM を 1 要素も作らない',
    genCaptive.state === 'none' && genCaptive.el === 'null' && genCaptive.domCount === 0,
    JSON.stringify(genCaptive));
  await gen.page.close();
  mark('scenario gate verified (goblin-mine vs generated-quest)');

  // §5 sceneClassBonus
  check('(5a) ' + DC.D5.label, DC.D5.ok, DC.D5.got);
  check('(5b) ' + DC.D6.label, DC.D6.ok, DC.D6.got);
  check('(5c) 6職すべてを渡せば必ず 2 (誰か 1 人は必ず該当する)', P.bonusAll6 === 2, String(P.bonusAll6));
  check('(5d) 存在しないクラスキーは 0', P.bonusBogus === 0, String(P.bonusBogus));
  check('(5e) 空配列は 0', P.bonusEmpty === 0, String(P.bonusEmpty));
  check('(5f) null は 0 (例外を投げない)', P.bonusNull === 0, String(P.bonusNull));
  check('(5g) undefined は 0 (例外を投げない)', P.bonusUndef === 0, String(P.bonusUndef));
  check('(5h) 非配列 ("rogue") は 0 (誤用を握り潰さず 0 で返す)', P.bonusNonArray === 0, String(P.bonusNonArray));
  check('(5i) ★仲間を 1 人加えると 0 → 2 に変わる (本当に allies を読んでいる)',
    P.bonusAbsent === 0 && P.dynAfterJoin === 2,
    'before=' + P.bonusAbsent + ' afterJoin=' + P.dynAfterJoin + ' (' + P.absentKey + ')');
  check('(5j) ★その仲間が抜ければ 2 → 0 に戻る (状態を持ち越さない)',
    P.dynAfterLeave === 0, 'afterLeave=' + P.dynAfterLeave);

  // §5' ★contract: DC を下げるのではなく opts.extraBonus に乗る
  const contract = await cur.page.evaluate(() => {
    const orig = Math.random;
    Math.random = () => 0.5;   // d20 = 1 + floor(0.5*20) = 11 に固定 (決定論)
    const party = buildPerceptionParty();
    const b = sceneClassBonus(['warrior', 'dwarf', 'rogue', 'elf', 'cleric', 'mage']);
    return Promise.all([
      SkillCheck.resolveSkillCheck('stealth', 13, party, { auto: true, extraBonus: 0 }),
      SkillCheck.resolveSkillCheck('stealth', 13, party, { auto: true, extraBonus: b }),
    ]).then(([a, c]) => {
      Math.random = orig;
      return { bonusArg: b,
               a: { roll: a.roll, bonus: a.bonus, total: a.total, dc: a.dc },
               c: { roll: c.roll, bonus: c.bonus, total: c.total, dc: c.dc } };
    });
  });
  check('(5k) ★extraBonus に渡すと total が +2 される', contract.bonusArg === 2 &&
    contract.c.total - contract.a.total === 2 && contract.c.bonus - contract.a.bonus === 2,
    JSON.stringify(contract));
  check('(5l) ★DC は 1 も動かない (「DC-2」ではなく「+2 加算」であることの証明)',
    contract.a.dc === 13 && contract.c.dc === 13, 'dc: ' + contract.a.dc + ' / ' + contract.c.dc);
  check('(5m) 出目は同一 (差分が加算のみに由来する)', contract.a.roll === contract.c.roll,
    contract.a.roll + ' / ' + contract.c.roll);
  mark('sceneClassBonus (+2 via extraBonus, not DC-2) verified');

  // §6 検証シームの dev ゲート
  check('(6a) ?diag=1 では window.__sce1 が生える', P.hasSeam === true, String(P.hasSeam));
  check('(6b) シームの形は { flags, classBonus } ちょうど 2 本',
    eq(P.seamKeys, ['classBonus', 'flags']), JSON.stringify(P.seamKeys));
  check('(6c) flags() は生きた sceneFlags を返す (コピーではない)', P.seamFlagsIsLive === true, String(P.seamFlagsIsLive));
  check('(6d) classBonus は sceneClassBonus 本体と同一', P.seamBonusIsSame === true, String(P.seamBonusIsSame));

  const auto = await boot(PORT, '?autoplay=1&intel=0');
  const PA = await probe(auto.page);
  check('(6e) ?autoplay でも window.__sce1 が生える', PA.hasSeam === true, String(PA.hasSeam));
  await auto.page.close();

  const bare = await boot(PORT, '');
  const PB = await probe(bare.page);
  check('(6f) ★素の起動 (パラメータ無し) では window.__sce1 が生えない',
    PB.hasSeam === false, 'hasSeam=' + PB.hasSeam);
  check('(6g) 母集団ガード: 素の起動でも土台自体は動いている (シームだけが休眠)',
    PB.typeofSceneFlags === 'object' && PB.bonusAll6 === 2 && PB.err === null,
    'typeof=' + PB.typeofSceneFlags + ' all6=' + PB.bonusAll6 + ' err=' + PB.err);
  await bare.page.close();
  mark('dev gate (?diag / ?autoplay only) verified');

  // ════════════════════════════════════════════════════════════════════════════
  // §7 EV-2「廃坑入口の見張り」(項目 2)
  // ════════════════════════════════════════════════════════════════════════════
  const Q = await ev2Run(cur.page, 'clean');
  mark('EV-2 driven (clean)  spot=(' + Q.spot.tx + ',' + Q.spot.ty + ') anchor=('
    + Q.anchor.tx + ',' + Q.anchor.ty + ') room0Before=' + Q.room0Before
    + ' rogueBonus=' + Q.rogueBonus);

  // 母集団ガード: 盤面が「測れる状態」で始まっていること
  check('(7a) 母集団ガード: 主人公は生存し部屋0 に既存の敵が居る',
    Q.hp > 0 && Q.room0Before >= 5, 'hp=' + Q.hp + ' room0Before=' + Q.room0Before);
  check('(7b) 発火地点は部屋0 の入口側の**床** (壁でも岩盤でもない)',
    Q.spotIsWall === false && Q.spot.ty >= Q.room0[0] && Q.spot.ty <= Q.room0[2]
    && Q.spot.tx >= Q.room0[1] && Q.spot.tx <= Q.room0[3] && Q.spot.tx <= Q.room0[1] + 5,
    '(' + Q.spot.tx + ',' + Q.spot.ty + ') wall=' + Q.spotIsWall + ' room0=' + JSON.stringify(Q.room0));
  check('(7c) 増援アンカーは部屋0 の中心 (山場本隊の密集点)',
    Q.anchorInRoom0 === true, '(' + Q.anchor.tx + ',' + Q.anchor.ty + ')');
  check('(7d) 接近半径は檻 (CAGE_INTERACT_RADIUS) と同じ 240',
    Q.radius === 240, String(Q.radius));
  check('(7e) 増援の種別は固定配列 = Math.random を引かない (RNG 消費順が動かない)',
    eq(Q.addTypes, ['goblin', 'goblin']), JSON.stringify(Q.addTypes));

  const EC = ev2Detectors(Q);
  Object.keys(EC).forEach(k => check('(7) ' + EC[k].label, EC[k].ok, EC[k].got));

  // 生成クエストでは一切発火しない (E17)
  const genEv = await boot(PORT, '?diag=1', { generated: true });
  await ev2Prepare(genEv.page);
  await ev2Approach(genEv.page, 'near');
  const genDlg = await ev2WaitDialog(genEv.page, 2500);
  const genState = await genEv.page.evaluate(() => ({
    scenarioId: scenarioId, isGM: isGoblinMineScenario(),
    fired: SCE1_EVENTS[0].fired, flag: sceneFlags.mine_alerted, total: enemies.length }));
  check('(7f) ★生成クエスト (scenarioId≠goblin-mine) では EV-2 が発火しない',
    genDlg === null && genState.fired === false && genState.isGM === false,
    'scenarioId=' + genState.scenarioId + ' dialog=' + (genDlg ? 'ARE' : 'none') + ' fired=' + genState.fired);
  // ── EV-5 も同じ生成クエストページで発火しないこと (シナリオゲートは台帳全体に効く) ──
  await ev5Prepare(genEv.page);
  await ev5Approach(genEv.page, 'near');
  const genDlg5 = await ev5WaitDialog(genEv.page, 2500);
  const genState5 = await genEv.page.evaluate(() => ({
    fired: SCE1_EVENTS[1].fired, flag: sceneFlags.servant_rescued,
    allies: allies.length, joined: servantJoined }));
  check('(7g) ★生成クエストでは EV-5 も発火しない (従者も参戦しない)',
    genDlg5 === null && genState5.fired === false && genState5.flag === false
    && genState5.joined === false,
    'dialog=' + (genDlg5 ? 'ARE' : 'none') + ' fired=' + genState5.fired
    + ' flag=' + genState5.flag + ' allies=' + genState5.allies);
  // ── EV-9 も同じ生成クエストページで発火せず、エピローグ差分も出ないこと ──
  await ev9Prepare(genEv.page);
  await ev9Approach(genEv.page, 'near');
  const genDlg9 = await ev2WaitDialog(genEv.page, 2500);
  const genState9 = await genEv.page.evaluate(() => ({
    fired: SCE1_EVENTS[2].fired, outcome: sce1GrixOutcome,
    armed: armGrixHostageRedirect(), epilogue: sce1EpilogueLine() }));
  check('(7h) ★生成クエストでは EV-9 も発火せず Redirect も仕掛からずエピローグも出ない',
    genDlg9 === null && genState9.fired === false && genState9.outcome === null
    && genState9.armed === false && genState9.epilogue === null,
    'dialog=' + (genDlg9 ? 'ARE' : 'none') + ' fired=' + genState9.fired
    + ' armed=' + genState9.armed + ' epilogue=' + JSON.stringify(genState9.epilogue));
  await genEv.page.close();
  mark('EV-2 verified (3択 / 判定なし枠 / 失敗→増援 / シナリオゲート)');

  // ════════════════════════════════════════════════════════════════════════════
  // §8 EV-5「捕らわれた従者」(項目 3)
  // ════════════════════════════════════════════════════════════════════════════
  const R = await ev5Run(cur.page, 'clean');
  mark('EV-5 driven (clean)  spot=(' + R.spot.tx + ',' + R.spot.ty + ') alliesBefore='
    + R.alliesBefore + ' clericBonus=' + R.clericBonus);

  // 母集団ガード: 盤面と定義が「測れる状態」で始まっていること
  check('(8a) 発火地点は部屋0 の**奥側の床** (壁でも岩盤でもない)',
    R.spotIsWall === false && R.spotInRoom0 === true && R.spotIsDeep === true,
    '(' + R.spot.tx + ',' + R.spot.ty + ') wall=' + R.spotIsWall
    + ' inRoom0=' + R.spotInRoom0 + ' deep=' + R.spotIsDeep + ' room0=' + JSON.stringify(R.room0));
  check('(8b) EV-2 と EV-5 は接近半径 (240) より離れており同時発火しない',
    R.spotFarFromWatch === true,
    'watch tx=' + R.watch.tx + ' servant tx=' + R.spot.tx + ' radius=' + R.radius);
  check('(8c) 台帳 SCE1_EVENTS[1] は captive_servant (添字は driver が参照する)',
    R.eventKey === 'captive_servant', String(R.eventKey));
  check('(8d) ★CLASS_DEFS.servant のフィールドは既存同行者 (undead_squad) と同じ集合 = 欠けが無い',
    eq(R.defKeys, R.undeadKeys), 'servant=' + JSON.stringify(R.defKeys));
  check('(8e) 従者は undead_squad より明確に脆い (hpMax 18 < 30)',
    R.defHp === 18 && R.defHp < R.undeadHp, R.defHp + ' vs ' + R.undeadHp);
  check('(8f) 従者のスプライトが SPRITE_VARIANTS / CUSTOM_SHEET_CLASSES に登録済み (絵が崩れない)',
    R.spriteRegistered === true && R.spriteIsCustomSheet === true,
    'variants=' + R.spriteRegistered + ' customSheet=' + R.spriteIsCustomSheet);
  check('(8g) ★servant は ALL_CLASS_KEYS に入っていない (募集 NPC / 酒場タブに漏れない)',
    R.inAllClassKeys === false, String(R.inAllClassKeys));
  check('(8h) 母集団ガード: 参戦前の allies が 1 名以上・召喚枠は空',
    R.alliesBefore >= 1 && R.summonSlotBefore === 'null',
    'allies=' + R.alliesBefore + ' summonSlot=' + R.summonSlotBefore);

  const SC5 = ev5Detectors(R);
  Object.keys(SC5).forEach(k => check('(8) ' + SC5[k].label, SC5[k].ok, SC5[k].got));
  mark('EV-5 verified (3択 / 判定なし枠 / 救出は判定運で折れない / 召喚枠を食わない)');

  // ════════════════════════════════════════════════════════════════════════════
  // §9 EV-9「玉座のグリクス」+ ボス戦への接続 (項目 4)
  // ⚠ 専用ページで駆動する。EV-9 は末尾で必ず armGrixHostageRedirect() を呼ぶので、
  //   cur.page (EV-2/EV-5 で汚れた盤面) では「まだ仕掛かっていない状態」を測れない。
  // ════════════════════════════════════════════════════════════════════════════
  const g9 = await boot(PORT, '?diag=1');
  const G = await ev9Run(g9.page, 'clean');
  mark('EV-9 driven (clean)  spot=(' + G.spot.tx + ',' + G.spot.ty + ') boss tx=' + G.bossTx
    + ' bossMaxHp0=' + G.bossMaxHp0 + ' roomBefore=' + G.roomCountBefore
    + ' clericBonus=' + G.clericBonus + ' elfBonus=' + G.elfBonus);

  // 母集団ガード + 配置の実測
  check('(9a) 台帳 SCE1_EVENTS は [mine_watch, captive_servant, grix_parley] の順 (添字を driver が参照)',
    eq(G.ledgerKeys, ['mine_watch', 'captive_servant', 'grix_parley']), JSON.stringify(G.ledgerKeys));
  check('(9b) 発火地点はボス部屋の**入口側の床** (壁でも岩盤でもない)',
    G.spotIsWall === false && G.spotInRoom === true && G.spotIsEntrance === true,
    '(' + G.spot.tx + ',' + G.spot.ty + ') wall=' + G.spotIsWall + ' inRoom=' + G.spotInRoom
    + ' entrance=' + G.spotIsEntrance + ' room=' + JSON.stringify(G.room));
  check('(9c) 発火地点はボスより手前 (西) にある',
    G.bossTx !== null && G.spot.tx < G.bossTx, 'spot tx=' + G.spot.tx + ' boss tx=' + G.bossTx);
  check('(9d) ★ボス戦が始まる前に必ず通れる: 発火地点はボス部屋の全敵の交戦距離 (engagePx) の外',
    Array.isArray(G.reach) && G.reach.length >= 3 && G.reach.every(x => x.d > x.engage),
    JSON.stringify(G.reach));
  check('(9e) 母集団ガード: ボス個体が実在し HP が既定値 45',
    G.bossMaxHp0 === 45 && G.bossHp0 === 45, 'maxHp=' + G.bossMaxHp0 + ' hp=' + G.bossHp0);
  check('(9f) 人質従者の HP は救出できた時と同じ器 (CLASS_DEFS.servant.hpMax = 18)',
    G.hostageMax === 18, String(G.hostageMax));
  check('(9g) DC 定数は 未救出15 / 救出済13 / 欺瞞17',
    G.dcHostage === 15 && G.dcRescued === 13 && G.dcDeceive === 17,
    G.dcHostage + '/' + G.dcRescued + '/' + G.dcDeceive);
  check('(9i) 肩代わり確率の初期値は 50%', G.chance === 0.5, String(G.chance));

  const GC = ev9Detectors(G);
  Object.keys(GC).forEach(k => check('(9) ' + GC[k].label, GC[k].ok, GC[k].got));

  // 得意クラス (僧侶/エルフ) が extraBonus 側に乗る (DC は動かさない)
  check('(9h) ★得意クラスは DC ではなく extraBonus に乗る (説得=僧侶 / 欺瞞=エルフ)',
    ((G.afterPersuadeOk.calls || [])[0] || {}).extraBonus === G.clericBonus
    && ((G.afterDeceiveOk.calls || [])[0] || {}).extraBonus === G.elfBonus
    && (G.clericBonus === 0 || G.clericBonus === 2) && (G.elfBonus === 0 || G.elfBonus === 2),
    'persuade=' + ((G.afterPersuadeOk.calls || [])[0] || {}).extraBonus + '/' + G.clericBonus
    + ' deceive=' + ((G.afterDeceiveOk.calls || [])[0] || {}).extraBonus + '/' + G.elfBonus
    + ' roster=' + JSON.stringify(G.roster));
  await g9.page.close();
  mark('EV-9 verified (3択 / Esc=突撃 / 昇格 / HP+20% / 先制 / 配下+2 / Redirect / エピローグ)');

  // ════════════════════════════════════════════════════════════════════════════
  // §N ★負のコントロール (同一 run 内・:PORT_MUT の変異配信へ同じ検出器を当てる)
  // ════════════════════════════════════════════════════════════════════════════
  const mut = await boot(PORT_MUT, '?diag=1');
  const PM = await probe(mut.page);
  const DM = detectors(PM);
  mark('mutated page booted (:' + PORT_MUT + ' ?diag=1)  roster=' + JSON.stringify(PM.roster));

  /* ⚠ パーティ編成は起動ごとに乱択される (酒場を経由しない直起動でも NPC は毎回変わる)。
   *   よって「無変異側と同じ roster か」で母集団を守ってはいけない = 恒久的に不安定な assert。
   *   守るべきは「変異側のページも生きていて、判定に使える隊列が実在する」ことだけ。
   *   各検出器は**そのページ自身の roster** から present/absent を選ぶので自己校正されている。 */
  const CLASS6 = ['warrior', 'dwarf', 'rogue', 'elf', 'cleric', 'mage'];
  check('(N0) 変異側でもページは生きている (母集団ガード)',
    PM.err === null && PM.typeofSceneFlags === 'object' &&
    Array.isArray(PM.roster) && PM.roster.length >= 1 &&
    PM.roster.every(k => CLASS6.indexOf(k) >= 0) && PM.absentKey !== null,
    'err=' + PM.err + ' roster=' + JSON.stringify(PM.roster) + ' absent=' + PM.absentKey);
  check('(N1) ★変異N1 で D2「mine_alerted 初期値 false」が赤くなる',
    DM.D2.ok === false && PM.mineAlerted === true, 'mine_alerted=' + PM.mineAlerted);
  check('(N1-隣) 変異N1 は外科的: D3「servant_rescued 初期値 false」は緑のまま',
    DM.D3.ok === true, 'servant_rescued=' + PM.servantRescued);
  check('(N2) ★変異N2 で D5「在籍クラスなら 2」が赤くなる',
    DM.D5.ok === false && PM.bonusPresent === 0, '[' + PM.present + '] -> ' + PM.bonusPresent);
  check('(N2-隣) 変異N2 は外科的: D6「非在籍なら 0」は緑のまま', DM.D6.ok === true,
    '[' + PM.absentKey + '] -> ' + PM.bonusAbsent);
  check('(N2-隣) 変異N2 は D1/D4 を巻き込まない (検出器は互いに独立)',
    DM.D1.ok === true && DM.D4.ok === true, 'D1=' + DM.D1.got + ' D4=' + DM.D4.got);

  // ── EV-2 の負のコントロール (同じ ev2Run / ev2Detectors を変異ページへ当てる) ──
  const QM = await ev2Run(mut.page, 'mutated');
  const EM = ev2Detectors(QM);
  mark('EV-2 driven (mutated)  room0Before=' + QM.room0Before + ' addTypes=' + JSON.stringify(QM.addTypes));
  check('(N-EV0) 母集団ガード: 変異側でも EV-2 は同じ 3択を出す (壊れているのは結果だけ)',
    EM.E1.ok === true && EM.E2.ok === true && EM.E5.ok === true,
    'E1=' + EM.E1.got + ' E2=' + EM.E2.got);
  check('(N4) ★変異N4 (増援 0 体) で E14「部屋0 の敵 +2」が赤くなる',
    EM.E14.ok === false && QM.afterFail.room0 - QM.room0Before === 0, EM.E14.got);
  check('(N4-隣) 変異N4 は外科的: E13「失敗でフラグが立つ」は変異N5 が担当し E14 とは独立',
    eq(QM.addTypes, []), JSON.stringify(QM.addTypes));
  check('(N5) ★変異N5 (フラグを立てない) で E13「失敗で mine_alerted=true」が赤くなる',
    EM.E13.ok === false && QM.afterFail.flag === false, EM.E13.got);
  check('(N6) ★変異N6 (判定なし枠を潰す) で E6「選択2 で SkillCheck 未呼出」が赤くなる',
    EM.E6.ok === false && QM.afterLure.calls.length === 1, EM.E6.got);
  check('(N6-隣) 変異N6 は外科的: E9/E10 (選択0/1 の判定種別と DC) は緑のまま',
    EM.E9.ok === true && EM.E10.ok === true, 'E9=' + EM.E9.got + ' E10=' + EM.E10.got);
  check('(N2-EV) ★変異N2 (得意クラス加算 2→0) で E17「盗賊在籍で extraBonus=2」が赤くなる',
    EM.E17.ok === false && QM.rogueBonusWith === 0
    && ((QM.afterRogue.calls || [])[0] || {}).extraBonus === 0, EM.E17.got);
  check('(N-EV隣) 変異群は E3/E4/E8 (Esc・再プロンプト抑制・1回きり) を巻き込まない',
    EM.E3.ok === true && EM.E4.ok === true && EM.E8.ok === true,
    'E3=' + EM.E3.got + ' E4=' + EM.E4.got + ' E8=' + EM.E8.got);

  // ── EV-5 の負のコントロール (同じ ev5Run / ev5Detectors を変異ページへ当てる) ──
  const RM = await ev5Run(mut.page, 'mutated');
  const SM = ev5Detectors(RM);
  mark('EV-5 driven (mutated)  alliesBefore=' + RM.alliesBefore);
  check('(N-EV5-0) 母集団ガード: 変異側でも EV-5 は同じ 3択を出す (壊れているのは結果だけ)',
    SM.S1.ok === true && SM.S2.ok === true && SM.S4.ok === true,
    'S1=' + SM.S1.got + ' S2=' + SM.S2.got);
  check('(N8) ★変異N8 (救出フラグを立てない) で S11/S13「救出は必ず成立する」が赤くなる',
    SM.S11.ok === false && SM.S13.ok === false
    && RM.afterPerceptOk.flag === false && RM.afterAthlFail.flag === false,
    'ok枝 flag=' + RM.afterPerceptOk.flag + ' 失敗枝 flag=' + RM.afterAthlFail.flag);
  check('(N8-隣) 変異N8 は外科的: 参戦そのもの (allies +1・末尾 servant) は緑のまま',
    RM.afterPerceptOk.allies === RM.alliesBefore + 1 && RM.afterPerceptOk.lastKey === 'servant'
    && RM.afterAthlFail.allies === RM.alliesBefore + 1,
    'allies=' + RM.afterPerceptOk.allies + '/' + RM.alliesBefore + ' last=' + RM.afterPerceptOk.lastKey);
  check('(N9) ★変異N9 (従者に召喚枠を食わせる) で S12「summonSlot が変化しない」が赤くなる',
    SM.S12.ok === false && RM.afterPerceptOk.summonSlot === 'set', SM.S12.got);
  check('(N10) ★変異N10 (罠作動を no-op に) で S14「失敗の代償=HP が減る」が赤くなる',
    SM.S14.ok === false && RM.afterAthlFail.hp === RM.maxHp, SM.S14.got);
  check('(N10-隣) 変異N10 は外科的: 参戦は起きたまま (救出と代償が独立配線であることの実測)',
    RM.afterAthlFail.allies === RM.alliesBefore + 1 && RM.afterAthlFail.lastKey === 'servant',
    'allies=' + RM.afterAthlFail.allies + '/' + RM.alliesBefore);
  check('(N11) ★変異N11 (EV-5 の判定なし枠を潰す) で S5「選択2 で SkillCheck 未呼出」が赤くなる',
    SM.S5.ok === false && RM.afterAvoid.calls.length === 1, SM.S5.got);
  check('(N28) ★変異N28 (救出しても縛られた姿を消さない) で C3 が赤くなる',
    SM.C3.ok === false && RM.afterPerceptOk.captiveState !== 'gone', SM.C3.got);
  /* ⚠ 「隣」に C2 (迂回で玉座へ移る) を使ってはいけない。C2 は変異N11 (EV-5 の判定なし枠を
   *   候補0 の判定へ落とす) と**同じ分岐に同居**しており、N11 側の作用で必ず赤くなる。
   *   同居する変異を跨いで独立性を主張すると、その assert は嘘になる。 */
  check('(N28-隣) 変異N28 は外科的: 初期配置 (C1 = 横穴に縛られて見えている) は緑のまま',
    SM.C1.ok === true, 'C1=' + SM.C1.got);
  check('(N27) ★変異N27 (スプライト配線を片方だけ旧流用へ戻す) で S20 が赤くなる',
    SM.S20.ok === false && /cleric_npcmale_walk/.test(String(RM.afterPerceptOk.variantWalk)),
    SM.S20.got);
  check('(N27-隣) 変異N27 は外科的: もう片方 (CLASS_DEFS.servant.sprite) は専用シートのまま',
    RM.afterPerceptOk.defSprite === 'assets/servant_walk.png',
    'def=' + RM.afterPerceptOk.defSprite + ' (= 2 箇所が独立配線であることの実測)');
  check('(N2-EV5) ★変異N2 (得意クラス加算 2→0) で S19「僧侶在籍で extraBonus=2」が赤くなる',
    SM.S19.ok === false && RM.clericBonusWith === 0
    && ((RM.afterCleric.calls || [])[0] || {}).extraBonus === 0, SM.S19.got);
  check('(N-EV5隣) 変異群は S3/S4/S7/S8/S9 (Esc・再プロンプト抑制・1回きり・判定種別) を巻き込まない',
    SM.S3.ok === true && SM.S4.ok === true && SM.S7.ok === true
    && SM.S8.ok === true && SM.S9.ok === true,
    'S3=' + SM.S3.got + ' S7=' + SM.S7.got + ' S8=' + SM.S8.got);
  await mut.page.close();

  // ── EV-9 の負のコントロール (同じ ev9Run / ev9Detectors を変異ページへ当てる) ──
  const g9m = await boot(PORT_MUT, '?diag=1');
  const GM = await ev9Run(g9m.page, 'mutated');
  const GMD = ev9Detectors(GM);
  mark('EV-9 driven (mutated)  bossMaxHp0=' + GM.bossMaxHp0 + ' roomBefore=' + GM.roomCountBefore);
  check('(N-EV9-0) 母集団ガード: 変異側でも EV-9 は未救出時に同じ 3択を出す (壊れているのは結果だけ)',
    GMD.G1.ok === true && GMD.G2.ok === true && GMD.G3.ok === true,
    'G1=' + GMD.G1.got + ' G3=' + GMD.G3.got);
  check('(N12) ★変異N12 (肩代わりしてもボス HP を減らす) で G12「ボス HP は 1 も減らない」が赤くなる',
    GMD.G12.ok === false && GM.redirect.d && GM.redirect.d.hpDelta === 7
    && GM.redirect.d.hostDelta > 0, GMD.G12.got);
  check('(N12-隣) ★変異N12 は外科的: G15「rand=0.6 では素通し」は緑のまま',
    GMD.G15.ok === true, 'G15=' + GMD.G15.got);
  check('(N13) ★変異N13 (Esc を declined に戻す) で G7「Esc が突撃扱い」が赤くなる',
    GMD.G7.ok === false && GM.afterEsc.declined === true && GM.afterEsc.fired === false,
    GMD.G7.got);
  check('(N14) ★変異N14 (共有の付与点を no-op に) で G10 と G10b が **同時に** 赤くなる',
    GMD.G10.ok === false && GMD.G10b.ok === false
    && (GM.surprise.after || []).every(v => v === 0)
    && (GM.stealthShare.after || []).every(v => v === 0),
    'G10=' + GMD.G10.got + ' / G10b=' + GMD.G10b.got);
  check('(N14-意味) ★1 つの変異が両方を殺した = EV-9 は新しい先制機構を作っていない',
    GMD.G10.ok === false && GMD.G10b.ok === false
    && GM.afterDeceiveOk.pendingSurprise === true && GM.surprise.n > 0,
    '予約は立ち (pending=' + GM.afterDeceiveOk.pendingSurprise + ') 対象も数えている (n='
    + GM.surprise.n + ') が stunned が付かない = 付与点が 1 つしかない証明');
  /* ★N15 と N16 は「仕掛けるか (arm)」と「発動するか (setter)」という**別々のガード**を
   *   壊す。両方とも G13 系を落とすが、落とし方の署名が違うことまで見て初めて独立が言える。 */
  check('(N15) ★変異N15 (arm の救出済ガード除去) で G13a「救出済なら仕掛けない」が赤くなる',
    GMD.G13a.ok === false && GM.redirect.armRescued === true && GM.redirect.a.armed === true,
    GMD.G13a.got);
  check('(N16) ★変異N16 (setter の救出済ガード除去) で G13b「救出済でも 1 回も発動しない」が赤くなる',
    GMD.G13b.ok === false && GM.redirect.c && GM.redirect.c.redirects > 0,
    'c=' + JSON.stringify(GM.redirect.c) + ' (肩代わり回数が増えている = 救出済でも発動した)');
  check('(N17) ★変異N17 (人質死亡ガード除去) で G14「死んだら発動しない」が赤くなる',
    GMD.G14.ok === false && GM.redirect.g && GM.redirect.g.redirectsDelta > 0,
    'g=' + JSON.stringify(GM.redirect.g) + ' (HP0 の人質にもう一度肩代わりさせた)');
  check('(N18) ★変異N18 (エピローグの生存分岐を潰す) で G16「3分岐の出し分け」が赤くなる',
    GMD.G16.ok === false && GM.epilogue.alive === GM.epilogue.dead
    && GM.epilogue.rescued !== GM.epilogue.dead,
    JSON.stringify(GM.epilogue));
  check('(N18-隣) 変異N18 は外科的: 死亡分岐はリザルトに出続ける (G17 は緑のまま)',
    GMD.G17.ok === true, String(GM.resultHtml).slice(-120));
  check('(N19) ★変異N19 (DC を救出状況で変えない) で G5「救出済で DC13」が赤くなる',
    GMD.G5.ok === false
    && (((GM.afterRescuedPersuade.calls || [])[0] || {}).dc === 15), GMD.G5.got);
  check('(N20) ★変異N20 (§4.1 違反 = 救出済で選択肢を 1 つ消す) で G4 が赤くなる',
    GMD.G4.ok === false && ((GM.dlg7 && GM.dlg7.labels) || []).length === 3,
    'labels=' + JSON.stringify((GM.dlg7 || {}).labels));
  check('(N20-隣) 変異N20 は外科的: 未救出側の 3択は無傷 (状態変数だけが選択肢を殺している)',
    ((GM.dlg1 && GM.dlg1.labels) || []).length === 4, JSON.stringify((GM.dlg1 || {}).labels));
  check('(N21) ★変異N21 (ボス HP 上方修正を消す) で G9 が赤くなる',
    GMD.G9.ok === false && GM.afterPersuadeFail.bossMaxHp === GM.bossMaxHp0, GMD.G9.got);
  check('(N22) ★変異N22 (配下 +2 を 0 体に) で G11 が赤くなる',
    GMD.G11.ok === false && GM.afterDeceiveFail.roomCount - GM.roomCountBefore === 0, GMD.G11.got);
  check('(N23) ★変異N23 (突撃枠を候補0の判定へ落とす) で G6「選択2 で SkillCheck 未呼出」が赤くなる',
    GMD.G6.ok === false && GM.afterCharge.calls.length === 1,
    'calls=' + JSON.stringify(GM.afterCharge.calls));
  /* ── 2026-08-06 iOS 実機フィードバックの再発防止 (破綻していた 3 箇所を独立に測る) ── */
  check('(N24) ★変異N24 (救出済の成功枝を旧実装へ戻す) で G18「再解放ではなく護衛が減る」が赤くなる',
    GMD.G18.ok === false && GM.afterRescuedPersuade.outcome === 'persuade_ok'
    && GM.afterRescuedPersuade.roomCount === GM.afterPersuadeOk.roomCount,
    GMD.G18.got);
  check('(N25) ★変異N25 (候補0 のラベルを未救出のまま固定) で G4b が赤くなる',
    GMD.G4b.ok === false
    && ((GM.dlg7 && GM.dlg7.labels) || [])[0] === '1. 従者の解放を要求する',
    GMD.G4b.got);
  check('(N25-隣) 変異N25 は外科的: G4「選択肢が消えていない」の赤は N20 由来のまま (件数 3)',
    ((GM.dlg7 && GM.dlg7.labels) || []).length === 3,
    'labels=' + JSON.stringify((GM.dlg7 || {}).labels));
  check('(N26) ★変異N26 (判定パネルの一文を未救出のまま固定) で G4c が赤くなる',
    GMD.G4c.ok === false
    && ((GM.afterRescuedPersuade.calls || [])[0] || {}).flavor
       === ((GM.afterPersuadeOk.calls || [])[0] || {}).flavor,
    GMD.G4c.got);
  check('(N30) ★変異N30 (EV-9 発火時に玉座へ移さない) で C4 が赤くなる',
    GMD.C4.ok === false && GM.afterCharge.captiveState === 'tunnel', GMD.C4.got);
  check('(N29) ★変異N29 (湧き位置をプレイヤーの真横へ戻す) で C5 が赤くなる',
    GMD.C5.ok === false && !!GM.afterPersuadeOk.lastTile
    && Math.max(Math.abs(GM.afterPersuadeOk.lastTile.tx - GM.afterPersuadeOk.playerTile.tx),
                Math.abs(GM.afterPersuadeOk.lastTile.ty - GM.afterPersuadeOk.playerTile.ty)) <= 1,
    GMD.C5.got);
  check('(N26-母集団) 変異側でも候補0 は実際に押せている (押し損ねで空振りしていない)',
    GM.clicked7 === true && (GM.afterRescuedPersuade.calls || []).length === 1,
    'clicked7=' + GM.clicked7 + ' calls=' + JSON.stringify(GM.afterRescuedPersuade.calls));
  /* ★集計: 変異側で赤くなるのは狙った検出器だけで、3択そのもの (G1/G2/G3) と
   *   「発動しない側」(G15) と「リザルトへの配線」(G17) は緑のまま = 変異群が外科的であることの総括。 */
  check('(N-EV9集計) 変異側で緑のまま残るのは G1/G2/G3/G15/G17 のちょうど 5 個',
    eq(Object.keys(GMD).filter(k => GMD[k].ok).sort(), ['G1', 'G15', 'G17', 'G2', 'G3']),
    'green=' + JSON.stringify(Object.keys(GMD).filter(k => GMD[k].ok).sort())
    + ' red=' + JSON.stringify(Object.keys(GMD).filter(k => !GMD[k].ok).sort()));
  await g9m.page.close();

  const mutGen = await boot(PORT_MUT, '?diag=1', { generated: true });
  await ev2Prepare(mutGen.page);
  await ev2Approach(mutGen.page, 'near');
  const mutGenDlg = await ev2WaitDialog(mutGen.page, 4000);
  check('(N7) ★変異N7 (シナリオゲート除去) で (7f)「生成クエストでは発火しない」が赤くなる',
    mutGenDlg !== null, mutGenDlg ? JSON.stringify(mutGenDlg.labels) : 'ダイアログが出なかった');
  await mutGen.page.close();

  const mutBare = await boot(PORT_MUT, '');
  const PMB = await probe(mutBare.page);
  check('(N3) ★変異N3 (dev ゲート除去) で (6f)「素の起動では生えない」が赤くなる',
    PMB.hasSeam === true, 'hasSeam=' + PMB.hasSeam);
  await mutBare.page.close();
  mark('negative controls fired (all inside this single run)');

  // §E pageerror
  check('(E) 全ページ・全操作で pageerror 0', allPageErrors.length === 0,
    allPageErrors.slice(0, 4).join(' | ') || 'none');

  await cur.page.close();
  await browser.close();
  srvClean.close(); srvMut.close();

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n[drv] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) {
    console.log('[drv] FAILED:');
    results.filter(r => !r.ok).forEach(r => console.log('   - ' + r.name + (r.detail ? '  — ' + r.detail : '')));
  }
  if (allPageErrors.length) console.log('[drv] pageerrors: ' + allPageErrors.join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[drv] FATAL', e); process.exit(3); });
